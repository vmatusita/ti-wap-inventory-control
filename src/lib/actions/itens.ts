'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin, exigirEscrita, exigirPapel } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { hojeISO } from '@/lib/format'
import {
  estornoLancamentoSchema,
  explodirLoteLancamentoItem,
  itemCatalogoSchema,
  itemInlineSchema,
  atualizarItemSchema,
  loteLancamentoItemSchema,
  proximaOrdemDoGrupo,
  type LoteLancamentoItemInput,
} from '@/lib/validators/item'
import type { TipoLancamento } from '@/lib/dominio'
import { planejarEstorno } from '@/lib/itens/estorno'
import { getSaldosItens } from '@/lib/queries/itens'
import { estoquePorItem } from '@/lib/itens/repor'

// F21 — este arquivo tem DOIS regimes de permissão, e é de propósito:
//   · LANÇAMENTOS (`lancarItens`, `estornarLancamento`) mexem no saldo de uma FILIAL →
//     `exigirEscrita(filial do lançamento)`, como qualquer escrita de acervo;
//   · CATÁLOGO (`criarItem`, `criarItemInline`, `atualizarItem`, `excluirItem`) é GLOBAL
//     (a tabela `itens` não tem filial) e vive em /admin/itens → `exigirAdmin()`, igual a
//     filiais/motivos/kits. As policies da migration 0063 dizem o mesmo: `itens` escreve
//     com `e_admin()`, `lancamentos_item` com `pode_escrever_filial(filial_id)`.
// Ver ADR-002 §3/§4.

// Rotas que leem catálogo OU saldo de item. O DASHBOARD entra na lista desde a
// F12: o card "Itens para repor" cruza `listarItensAtivos()` com a RPC de saldos,
// então tanto mexer no `estoque_minimo` quanto lançar quantidade mudam o que ele
// mostra — sem revalidar `/`, o card ficava velho até o próximo deploy (achado
// da revisão adversarial da F12, item 11).
function revalidarItens() {
  revalidatePath('/admin/itens')
  revalidatePath('/itens')
  revalidatePath('/')
}

// Resultado POR LINHA do carrinho (F10 · I1). Espelha o lote de movimentações da
// F2 — com uma diferença INTENCIONAL: lá a primeira falha interrompe o resto;
// aqui cada linha é independente (um item sem saldo não impede os outros).
export type ResultadoLinhaLancamento = {
  itemId: number
  ok: boolean
  erro?: string
}

export type LancarItensResult = {
  ok: boolean
  resultados: ResultadoLinhaLancamento[]
  /** Falha ANTES de tocar o banco (sessão expirada, payload inválido). */
  erroGeral?: string
}

// Lança um CARRINHO de itens (1..MAX_LINHAS_LOTE_ITEM) sobre os mesmos campos
// comuns (filial, tipo, data, chamado, colaborador, observação): um insert por
// linha, sequencial, em ordem. A regra crítica (saldo/atrelados nunca negativos)
// é do trigger 0015/0027 — aqui é a segunda linha; o erro do banco vira pt-BR
// amigável e fica preso à SUA linha, sem derrubar as demais.
export async function lancarItens(input: LoteLancamentoItemInput): Promise<LancarItensResult> {
  const parsed = loteLancamentoItemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      resultados: [],
      erroGeral: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const supabase = await createClient()
  // Uma filial por carrinho (campo compartilhado do lote — `explodirLoteLancamentoItem`
  // copia `filial_id` para todas as linhas), e ela já vem no payload: uma chamada resolve
  // sessão, cargo e vínculo antes do primeiro insert. A guarda precisou vir DEPOIS do
  // safeParse (é dele que sai a filial), então payload inválido agora é reportado como
  // tal mesmo sem sessão — nada é lido nem escrito nesse caminho.
  const aut = await exigirEscrita(supabase, parsed.data.filial_id)
  if (!aut.ok) return { ok: false, resultados: [], erroGeral: aut.erro }
  const uid = aut.uid

  const resultados: ResultadoLinhaLancamento[] = []
  let criados = 0

  for (const v of explodirLoteLancamentoItem(parsed.data)) {
    const { error } = await supabase.from('lancamentos_item').insert({
      item_id: v.item_id,
      filial_id: v.filial_id,
      tipo: v.tipo,
      quantidade: v.quantidade,
      chamado: v.chamado ?? null,
      colaborador: v.colaborador ?? null,
      data: v.data,
      observacao: v.observacao ?? null,
      criado_por: uid,
    })
    if (error) {
      resultados.push({
        itemId: v.item_id,
        ok: false,
        erro: traduzErroBanco(error.message, error.code),
      })
      continue
    }
    criados++
    resultados.push({ itemId: v.item_id, ok: true })
  }

  if (criados > 0) {
    revalidarItens()
    revalidatePath('/relatorios', 'layout')
  }
  return { ok: resultados.every((r) => r.ok), resultados }
}

// Estorna um lançamento criando o INVERSO com estorna_id. Nada se apaga. O banco
// impede duplo estorno (índice único em estorna_id) e valida o saldo do inverso.
// ITN-05c — `motivo` é OPCIONAL (o operador digita por quê no diálogo) e some
// concatenado como "Estorno: {motivo}" na observação do inverso (`planejarEstorno`).
export async function estornarLancamento(input: {
  lancamento_id: string
  motivo?: string
}): Promise<ActionResult> {
  const parsed = estornoLancamentoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, erro: 'Lançamento inválido.' }

  const supabase = await createClient()
  // Cargo antes da leitura, vínculo depois (a filial é a do lançamento original) — o
  // mesmo desdobramento explicado em actions/ativos.ts. ESTORNO_OPERADOR = sim: operador
  // estorna nas filiais vinculadas; não é privilégio de admin.
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { data: orig, error: e1 } = await supabase
    .from('lancamentos_item')
    .select('id, item_id, filial_id, tipo, quantidade, chamado, observacao, estorna_id')
    .eq('id', parsed.data.lancamento_id)
    .maybeSingle()
  if (e1) return { ok: false, erro: traduzErroBanco(e1.message, e1.code) }
  if (!orig) return { ok: false, erro: 'Lançamento não encontrado.' }
  if (orig.estorna_id) {
    return { ok: false, erro: 'Um estorno não pode ser estornado.' }
  }

  // O select acima já traz `filial_id` — o inverso nasce na MESMA filial do original.
  const aut = await exigirEscrita(supabase, orig.filial_id)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // Já estornado? (o índice único protege da corrida; aqui é a mensagem amigável)
  const { data: jaEstorno } = await supabase
    .from('lancamentos_item')
    .select('id')
    .eq('estorna_id', orig.id)
    .maybeSingle()
  if (jaEstorno) return { ok: false, erro: 'Este lançamento já foi estornado.' }

  const plano = planejarEstorno(
    {
      tipo: orig.tipo as TipoLancamento,
      quantidade: orig.quantidade,
      chamado: orig.chamado,
      observacao: orig.observacao,
    },
    parsed.data.motivo,
  )
  const { error: e2 } = await supabase.from('lancamentos_item').insert({
    item_id: orig.item_id,
    filial_id: orig.filial_id,
    tipo: plano.tipo,
    quantidade: plano.quantidade,
    chamado: plano.chamado,
    colaborador: null,
    data: hojeISO(),
    observacao: plano.observacao,
    criado_por: aut.uid,
    estorna_id: orig.id,
  })
  if (e2) return { ok: false, erro: traduzErroBanco(e2.message, e2.code) }

  revalidarItens()
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ITN-05d — saldo do catálogo inteiro numa filial, para o combobox do
// lançamento mostrar "Mouse USB · 14" ao lado de cada item (a filial já
// escolhida no diálogo, não a digitação — uma chamada por troca de filial,
// nunca por tecla). LEITURA (piso da hierarquia, como `buscarAtivosRecentesDoOperador`
// em `actions/movimentacoes.ts`): qualquer cargo logado ATIVO lê o acervo, e o
// combobox de lançamento já é só de quem escreve, mas o saldo em si não é dado
// sensível — reconferir com `exigirEscrita` aqui duplicaria a guarda da
// própria `lancarItens` sem ganhar nada. Nunca lança: falha vira mapa vazio,
// nunca "0" chutado nem exceção que trava a lista do combobox.
export type SaldosPorItem = Readonly<Record<number, number>>

export async function buscarSaldosItens(filialId: number): Promise<SaldosPorItem> {
  try {
    if (!Number.isInteger(filialId) || filialId <= 0) return {}
    const supabase = await createClient()
    const aut = await exigirPapel(supabase, 'consulta')
    if (!aut.ok) return {}
    const saldos = await getSaldosItens(filialId)
    return estoquePorItem(saldos)
  } catch (err) {
    console.error('[buscarSaldosItens] falha ao carregar saldos:', err)
    return {}
  }
}

// ---- Catálogo (admin/itens — padrão de admin/motivos) ----

// O `id` só volta em sucesso — o criar inline (F10 · I2) precisa dele para já
// deixar o item novo SELECIONADO na linha do carrinho. Quem só lê `ok` (o dialog
// de admin/itens) continua compatível.
//
// `reativado` (F12 · W6A): o item não foi criado agora — ele já existia
// DESATIVADO e voltou ao catálogo. A UI precisa saber para dizer a verdade no
// toast; ver `criarItemInline`.
export type CriarItemResult = ActionResult & { id?: number; reativado?: boolean }

export async function criarItem(input: {
  nome: string
  grupo: string
  ordem: number
  estoque_minimo: number
}): Promise<CriarItemResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = itemCatalogoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  // Insere `parsed.data` INTEIRO (não uma lista de colunas): campo novo do schema
  // — como `estoque_minimo` (F12 · I5) — entra sozinho. É o contrário do
  // `atualizarItem` logo abaixo, cuja lista explícita precisa ser mantida à mão.
  const { data, error } = await supabase
    .from('itens')
    .insert(parsed.data)
    .select('id')
    .single()
  if (error) {
    if (error.message.toLowerCase().includes('duplicate') || error.message.includes('itens_nome_uidx')) {
      return { ok: false, erro: 'Já existe um item com esse nome.' }
    }
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }
  revalidarItens()
  return { ok: true, id: data?.id }
}

// Criação INLINE no meio do lançamento (F10 · I2): o operador informa só nome e
// grupo; a `ordem` é decidida AQUI (maior do grupo + 10) — o combobox do
// lançamento nem carrega essa coluna. Reusa `criarItem` (mesma validação, mesma
// tradução de nome duplicado, mesmos revalidatePath).
//
// F21 — é CATÁLOGO, logo exige ADMIN, mesmo nascendo no meio de um lançamento: a
// tabela `itens` é global e a policy da 0063 é `e_admin()`. Consequência prática que a
// UI tem de respeitar: para o cargo Operador o botão "criar item aqui" não se aplica —
// ele lança sobre o catálogo curado, não o edita. (`criarItem`, chamada no fim, reconfere
// admin: cada export deste módulo é um endpoint alcançável pela rede por si só.)
//
// BECO SEM SAÍDA que esta action fecha (achado F12-W4-06): o combobox é
// alimentado por `listarItensAtivos()` (só item ATIVO), mas o índice único
// `itens_nome_uidx` é sobre TODOS os itens. Com um homônimo DESATIVADO o
// operador não via o item na lista, tentava criar e recebia "Já existe um item
// com esse nome." — para um item que a tela dizia não existir, sem nenhuma saída
// dentro do diálogo e com o carrinho já montado. Agora o item desativado é
// REATIVADO e devolvido selecionado: é o que o operador quer (usar o item), é
// reversível em Administração → Itens e preserva todo o histórico dele.
export async function criarItemInline(input: {
  nome: string
  grupo: string
}): Promise<CriarItemResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = itemInlineSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  // Catálogo INTEIRO (ativos e inativos) para achar o homônimo. Comparação em
  // JS e não `ilike` no banco: o nome é texto livre e um `%` ou `_` digitado
  // pelo operador viraria curinga no padrão. O catálogo é curado e minúsculo —
  // `listarItensAdmin` já o lê inteiro a cada carga de /admin/itens.
  const { data: catalogo, error: erroCatalogo } = await supabase
    .from('itens')
    .select('id, nome, ativo')
  if (erroCatalogo) {
    return { ok: false, erro: traduzErroBanco(erroCatalogo.message, erroCatalogo.code) }
  }
  // Mesma chave do índice único `itens_nome_uidx` (0014): `lower(nome)`.
  const alvo = parsed.data.nome.toLowerCase()
  const homonimo = (catalogo ?? []).find((i) => i.nome.trim().toLowerCase() === alvo)
  if (homonimo && !homonimo.ativo) {
    const { error: erroReativar } = await supabase
      .from('itens')
      .update({ ativo: true })
      .eq('id', homonimo.id)
    if (erroReativar) {
      return {
        ok: false,
        erro: 'Já existe um item com esse nome, mas ele está desativado e não foi possível reativá-lo. Reative-o em Administração → Itens.',
      }
    }
    revalidarItens()
    return { ok: true, id: homonimo.id, reativado: true }
  }

  const { data: maior, error } = await supabase
    .from('itens')
    .select('ordem')
    .eq('grupo', parsed.data.grupo)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // `estoque_minimo: 0` explícito = o default da coluna (0042) e "sem alerta de
  // reposição": quem está no meio de um lançamento não define ponto de reposição
  // (o `itemInlineSchema` nem tem o campo). Ajusta-se depois em admin/itens.
  return criarItem({
    nome: parsed.data.nome,
    grupo: parsed.data.grupo,
    ordem: proximaOrdemDoGrupo(maior?.ordem ?? null),
    estoque_minimo: 0,
  })
}

// Item nunca é excluído quando tem lançamentos (o histórico referencia) — só
// editado/desativado. A tela mostra a contagem; aqui reconferimos no servidor.
export async function atualizarItem(input: {
  id: number
  nome: string
  grupo: string
  ordem: number
  ativo: boolean
  estoque_minimo: number
}): Promise<ActionResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = atualizarItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, nome, grupo, ordem, ativo, estoque_minimo } = parsed.data

  // ATENÇÃO: a lista de colunas é EXPLÍCITA — campo que não estiver aqui é
  // descartado EM SILÊNCIO (o schema valida, a action ignora e a tela mostra
  // "salvo"). Campo novo em `atualizarItemSchema` entra também nesta lista.
  const { error } = await supabase
    .from('itens')
    .update({ nome, grupo, ordem, ativo, estoque_minimo })
    .eq('id', id)
  if (error) {
    if (error.message.toLowerCase().includes('duplicate') || error.message.includes('itens_nome_uidx')) {
      return { ok: false, erro: 'Já existe um item com esse nome.' }
    }
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }
  revalidarItens()
  return { ok: true }
}

// Exclusão só quando NÃO houver lançamentos (senão o histórico ficaria órfão);
// caso contrário, a tela oferece desativar.
export async function excluirItem(input: { id: number }): Promise<ActionResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: 'Item inválido.' }

  const { count } = await supabase
    .from('lancamentos_item')
    .select('*', { count: 'exact', head: true })
    .eq('item_id', id)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: `Não é possível excluir: há ${count} lançamento(s) para este item. Desative-o em vez de excluir.`,
    }
  }

  const { error } = await supabase.from('itens').delete().eq('id', id)
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  revalidarItens()
  return { ok: true }
}

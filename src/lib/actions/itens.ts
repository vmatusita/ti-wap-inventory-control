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
  transferenciaItemSchema,
  type LoteLancamentoItemInput,
  type TransferenciaItemInput,
} from '@/lib/validators/item'
import type { GrupoItem, TipoLancamento } from '@/lib/dominio'
import type { Json } from '@/lib/types/database'
import { chaveItem } from '@/lib/itens/chave'
import { avisoDeRegularizacao, textoDaRegularizacao } from '@/lib/itens/regularizacao'
import { planejarEstorno } from '@/lib/itens/estorno'
import { observacoesDaTransferencia } from '@/lib/itens/transferencia'
import { getSaldosItens, saldosPorColaborador } from '@/lib/queries/itens'
import { listarFiliais } from '@/lib/queries/filiais'
import { estoquePorItem } from '@/lib/itens/repor'
import { resolverColaboradoresPorNome } from '@/lib/queries/colaboradores'
import { chaveColaborador } from '@/lib/colaboradores/chave'
import { decidirVinculoRetorno, type SaldoDaPessoa } from '@/lib/itens/vinculo-retorno'

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
  /** Falha ANTES de tocar o banco (sessão expirada, payload inválido) — e, desde a
   *  F41, também a recusa do lote inteiro pela RPC transacional. */
  erroGeral?: string
  /** F41 — a linha discreta sobre o que entrou por acerto automático, quando entrou. */
  avisoRegularizacao?: string
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

  const linhas = explodirLoteLancamentoItem(parsed.data)
  // F37/D5 — o vínculo com o cadastro de pessoas, resolvido UMA VEZ para o carrinho
  // inteiro. O TEXTO continua sendo gravado como antes; o id entra ao lado quando a
  // chave normalizada resolve. Nome fora do cadastro não bloqueia nada.
  const vinculos = await resolverColaboradoresPorNome(
    supabase,
    linhas.map((v) => v.colaborador ?? null),
  )

  // F38 · §C.3 — O CARRINHO AVULSO TAMBÉM PRECISA DA REGRA DO VÍNCULO, e a
  // primeira escrita da fase esqueceu disso (achado da revisão adversarial).
  //
  // A 0118 pôs um teto novo no trigger: `retorno` que NOMEIA uma pessoa não pode
  // exceder o que ela tem daquele item naquela filial. Aqui, o campo é literalmente
  // "Colaborador (quem devolveu — opcional)" e o id era resolvido e gravado sem
  // olhar saldo nenhum. Efeito: uma devolução avulsa que funcionava até a véspera
  // — item que saiu SEM vínculo (histórico anterior à F37) e volta com o nome
  // digitado — passava a ser RECUSADA pelo banco, com uma mensagem sobre saldo que
  // não descreve o que o operador fez de errado (nada).
  //
  // A regra é a mesma da movimentação: o vínculo só entra quando há saldo; não
  // havendo, o `retorno` é gravado sem ele e repõe o estoque igual.
  //
  // ⚠ E falha de LEITURA do saldo não vira "saldo zero": gravaria o `retorno` sem
  // vínculo e a conta da pessoa nunca baixaria, em silêncio. As consultas vão em
  // paralelo e o erro recusa o lançamento (ver `saldosPorColaborador`).
  const lidos = await saldosPorColaborador(
    supabase,
    linhas
      .filter((v) => v.tipo === 'retorno')
      .map((v) => vinculos.get(chaveColaborador(v.colaborador)))
      .filter((x): x is string => !!x),
  )
  if (!lidos.ok) return { ok: false, resultados: [], erroGeral: lidos.erro }
  const saldosPorPessoa = lidos.mapa as Map<string, SaldoDaPessoa[]>
  const consumido = new Map<string, number>()

  // F41 — o nome de cada item, para a justificativa do acerto automático (a RPC
  // não redige texto). Falha de leitura não bloqueia: sem o nome o texto diz
  // "item", o que é pior de ler e não recusa nada.
  const nomesDeItem = new Map<number, string>()
  {
    const ids = [...new Set(linhas.map((v) => v.item_id))]
    const { data: cat, error: erroCat } = await supabase
      .from('itens')
      .select('id, nome')
      .in('id', ids)
    if (erroCat) console.error('[lancarItens] falha ao ler o nome dos itens:', erroCat.message)
    else for (const i of cat ?? []) nomesDeItem.set(i.id, i.nome)
  }

  const payload: Record<string, unknown>[] = []

  for (const v of linhas) {
    const pessoaId = vinculos.get(chaveColaborador(v.colaborador)) ?? null
    let vinculo: string | null = pessoaId
    if (v.tipo === 'retorno' && pessoaId) {
      const chave = `${pessoaId}|${v.item_id}|${v.filial_id}`
      const base =
        saldosPorPessoa
          .get(pessoaId)
          ?.find((s) => s.item_id === v.item_id && s.filial_id === v.filial_id)
          ?.com_a_pessoa ?? 0
      const decisao = decidirVinculoRetorno({
        colaboradorId: pessoaId,
        itemId: v.item_id,
        filialId: v.filial_id,
        quantidade: v.quantidade,
        saldos: [
          {
            item_id: v.item_id,
            filial_id: v.filial_id,
            com_a_pessoa: base - (consumido.get(chave) ?? 0),
          },
        ],
      })
      vinculo = decisao.colaboradorId
      if (vinculo) consumido.set(chave, (consumido.get(chave) ?? 0) + v.quantidade)
    }

    payload.push({
      item_id: v.item_id,
      filial_id: v.filial_id,
      tipo: v.tipo,
      quantidade: v.quantidade,
      chamado: v.chamado ?? null,
      colaborador: v.colaborador ?? null,
      colaborador_id: vinculo,
      data: v.data,
      observacao: v.observacao ?? null,
      // Mandada SEMPRE, pelo mesmo motivo de `montarItensJunto`: quem decide se
      // vai haver acerto é a RPC, sob a trava. Só faz sentido para `retorno` e
      // `saida` — nos outros tipos a RPC nem olha.
      observacao_regularizacao: textoDaRegularizacao(
        v.tipo === 'retorno' ? 'devolucao' : 'entrega',
        {
          itemRotulo: nomesDeItem.get(v.item_id) ?? null,
          quantidade: Math.abs(v.quantidade),
          colaborador: v.colaborador ?? null,
        },
      ),
    })
  }

  // F41 — O CARRINHO VIROU TUDO-OU-NADA, e é uma mudança de comportamento.
  //
  // Até 30/08/2026 este laço fazia um INSERT por linha, sequencial, sem transação:
  // se a terceira falhasse, as duas primeiras ficavam gravadas e o operador saía
  // sem saber o que tinha entrado. Estava registrado na DIVIDA-TECNICA.md como
  // "carrinho sem transação", e a F38 já tinha decidido o contrário para o lote de
  // movimentações ("meio lote é pior que lote nenhum", 28/08/2026).
  //
  // A RPC `lancar_itens_lote` (0126) grava tudo numa transação só, com as travas
  // em ordem total e a MESMA partição da quantidade do checklist — que é o que a
  // §4.2 do plano exige: "a regra é a mesma nos dois caminhos, senão nascem dois
  // comportamentos".
  //
  // O RESULTADO POR LINHA sobrevive, porque a tela depende dele: a RPC etiqueta a
  // linha culpada em `detail` (f41_linha=N), e é ela que fica marcada. As outras
  // não vão como "ok" (não foram gravadas) nem como "erro" (não é culpa delas):
  // vão com o texto de que nada foi gravado.
  const { data: retorno, error: erroRpc } = await supabase.rpc('lancar_itens_lote', {
    p_linhas: payload as unknown as Json,
    p_criado_por: uid,
  })

  if (erroRpc) {
    const culpada = linhaCulpadaDoLancamento(erroRpc.details)
    const mensagem = traduzErroBanco(erroRpc.message, erroRpc.code)
    return {
      ok: false,
      resultados: linhas.map((v, i) => ({
        itemId: v.item_id,
        ok: false,
        erro:
          i === culpada
            ? mensagem
            : culpada === undefined
              ? mensagem
              : 'Não gravado — o lançamento inteiro foi recusado por outra linha.',
      })),
      erroGeral:
        culpada !== undefined
          ? `Nada foi gravado. A ${culpada + 1}ª linha foi recusada: ${mensagem}`
          : `Nada foi gravado. ${mensagem}`,
    }
  }

  criados = linhas.length
  resultados.push(...linhas.map((v) => ({ itemId: v.item_id, ok: true })))

  if (criados > 0) {
    revalidarItens()
    revalidatePath('/relatorios', 'layout')
  }
  const reg = retorno as { regularizacoes?: number; unidades_regularizadas?: number } | null
  return {
    ok: true,
    resultados,
    avisoRegularizacao:
      avisoDeRegularizacao(reg?.unidades_regularizadas ?? 0, reg?.regularizacoes ?? 0) ??
      undefined,
  }
}

/** O `detail` que a `lancar_itens_lote` (0126) anexa para dizer QUAL linha caiu.
 *  Espelho de `linhaDoDetalhe` (actions/movimentacoes.ts), com a etiqueta da F41. */
function linhaCulpadaDoLancamento(detail: string | undefined | null): number | undefined {
  const m = /f41_linha=(\d+)/.exec(detail ?? '')
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

// ---- Transferência entre filiais (F31 · ITN-01) ----

export type TransferirItensResult = ActionResult & {
  /** Quantos ITENS foram transferidos (o dobro em linhas). Só em sucesso. */
  itens?: number
}

// Transfere itens por quantidade de uma filial para outra numa submissão só.
//
// É TUDO-OU-NADA, e por isso NÃO tem resultado por linha como `lancarItens`: a
// gravação inteira acontece dentro de `transferir_item` (RPC da migration 0104),
// numa transação. Se o estoque da origem não comporta uma das linhas, o trigger
// recusa e NADA é gravado — nem a perna de destino das outras. É o oposto
// deliberado do carrinho de lançamento, onde cada linha é independente: lá as
// linhas não se relacionam entre si; aqui cada par É a operação, e meia
// transferência é pior que nenhuma (some estoque de um lado sem aparecer no outro).
//
// O par gravado é de AJUSTES (−N na origem, +N no destino) — o único caminho que
// mexe no estoque dos dois lados e deixa o Total consolidado inalterado. Ver o
// cabeçalho de `src/lib/itens/transferencia.ts` e o da migration.
export async function transferirItens(
  input: TransferenciaItemInput,
): Promise<TransferirItensResult> {
  const parsed = transferenciaItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { origem_id, destino_id, linhas, chamado, data, observacao } = parsed.data

  const supabase = await createClient()
  // As DUAS filiais, em sequência, ANTES de chamar a RPC. É a mensagem em pt-BR:
  // a segurança é a policy "operador lanca", que a RPC (SECURITY INVOKER)
  // atravessa linha a linha — inclusive na perna de destino. Sem estas guardas o
  // operador receberia o 42501 cru, que a UI traduz como "faça login novamente",
  // conselho errado para quem só não tem a filial vinculada.
  const autOrigem = await exigirEscrita(supabase, origem_id)
  if (!autOrigem.ok) return { ok: false, erro: autOrigem.erro }
  const autDestino = await exigirEscrita(supabase, destino_id)
  if (!autDestino.ok) return { ok: false, erro: autDestino.erro }

  // Os NOMES saem do banco, nunca do cliente: a observação cruzada é o que o
  // histórico vai mostrar para sempre, e um nome vindo do formulário poderia
  // dizer "Transferência para Serra" numa linha que foi para outro lugar.
  const filiais = await listarFiliais()
  const origem = filiais.find((f) => f.id === origem_id)
  const destino = filiais.find((f) => f.id === destino_id)
  if (!origem || !destino) {
    return { ok: false, erro: 'Uma das filiais não existe mais. Atualize a página.' }
  }

  const obs = observacoesDaTransferencia(origem.nome, destino.nome, observacao)

  const { error } = await supabase.rpc('transferir_item', {
    p_origem: origem_id,
    p_destino: destino_id,
    p_itens: linhas.map((l) => ({ item_id: l.item_id, quantidade: l.quantidade })),
    p_data: data,
    // O tipo gerado não aceita `null` em parâmetro `text`; a RPC faz
    // `nullif(btrim(…), '')`, então a string vazia É a ausência.
    p_chamado: chamado ?? '',
    p_obs_origem: obs.origem,
    p_obs_destino: obs.destino,
    p_criado_por: autOrigem.uid,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  revalidarItens()
  revalidatePath('/relatorios', 'layout')
  return { ok: true, itens: linhas.length }
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
export type CriarItemResult = ActionResult & {
  id?: number
  reativado?: boolean
  /**
   * F41 — o homônimo existe, está DESATIVADO, e quem clicou não tem permissão de
   * reativá-lo (UPDATE de `itens` é `e_admin()`). O item é devolvido SELECIONADO
   * assim mesmo, porque é isso que destrava o fluxo; só o texto do toast muda.
   * Mesmo desfecho de `criarColaboradorInline` (F37).
   */
  precisaAdminParaReativar?: boolean
}

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
// F41 — O OPERADOR PASSA A CADASTRAR ITEM, e por que isso não é afrouxamento.
//
// Até 30/08/2026 esta função exigia `exigirAdmin`, com a justificativa escrita no
// próprio arquivo: "é CATÁLOGO, logo exige ADMIN … ele lança sobre o catálogo
// curado, não o edita". O precedente que derruba essa justificativa é da casa e é
// de três dias antes — a F37/D5 abriu `colaboradores` ao operador *"porque é ele
// quem cadastra a pessoa inline no meio da movimentação, e exigir admin ali
// quebraria o fluxo na mão dele"*. É a mesma frase, palavra por palavra, para
// itens, e o custo de não abrir está MEDIDO: dos 132 pares item×filial em produção,
// a maioria dos itens sequer estava cadastrada (dor D4 do docs/PLANO-ITENS.md).
//
// A abertura é SÓ do INSERT, nas três camadas alinhadas, como manda o ADR-002:
//   · policy "escrita cria item" com `pode_escrever()` (migration 0125);
//   · `exigirPapel(…, 'operador')` aqui, que dá a MENSAGEM em pt-BR;
//   · a tela oferece "Cadastrar" a quem escreve.
// Editar, desativar e apagar item continuam `e_admin()` — igualzinho a colaborador.
export async function criarItemInline(input: {
  nome: string
  grupo: string
  tipo_id?: number | null
}): Promise<CriarItemResult> {
  const supabase = await createClient()
  const aut = await exigirPapel(supabase, 'operador')
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = itemInlineSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  // F41 — a busca do homônimo passou a ser pela CHAVE NORMALIZADA, no banco.
  //
  // Antes o catálogo inteiro vinha para o servidor e a comparação era
  // `lower(nome)` em JS. Isso empatava com o índice único de então
  // (`itens_nome_uidx`, sobre `lower(nome)`), mas empata NÃO empata mais: a 0125
  // criou `itens_nome_chave_uidx` sobre `item_chave(nome)`, que também ignora
  // acento e espaço colapsado. Com a comparação velha, "Mochila " digitada pelo
  // operador não acharia "Mochila" — o servidor concluiria "não existe", tentaria
  // inserir e levaria o erro cru do índice único, no meio do fluxo dele.
  //
  // `.eq('nome_chave', …)` e nunca `ilike`: a chave é calculada, não digitada, e
  // `ilike` transformaria um `%` no nome em curinga.
  const chave = chaveItem(parsed.data.nome)
  const { data: homonimo, error: erroBusca } = await supabase
    .from('itens')
    .select('id, nome, ativo')
    .eq('nome_chave', chave)
    .maybeSingle()
  if (erroBusca) {
    return { ok: false, erro: traduzErroBanco(erroBusca.message, erroBusca.code) }
  }

  if (homonimo?.ativo) {
    // Já existe e está no ar: devolve SELECIONADO, sem criar nada. O operador
    // queria usar o item, não cadastrá-lo duas vezes.
    return { ok: true, id: homonimo.id }
  }

  if (homonimo && !homonimo.ativo) {
    // Existe DESATIVADO. Reativar é UPDATE, e UPDATE de `itens` é `e_admin()` — para
    // um operador puro a RLS nega em SILÊNCIO (0 linhas afetadas, sem erro). Por
    // isso a contagem de linhas é obrigatória, não estética: é a lição literal da
    // F37 (`criarColaboradorInline`). Sem ela, o item voltaria "reativado" na tela e
    // continuaria desativado no banco.
    const { data: reativados, error: erroReativar } = await supabase
      .from('itens')
      .update({ ativo: true })
      .eq('id', homonimo.id)
      .select('id')
    if (erroReativar) {
      return { ok: false, erro: traduzErroBanco(erroReativar.message, erroReativar.code) }
    }
    if (!reativados || reativados.length === 0) {
      return {
        ok: true,
        id: homonimo.id,
        precisaAdminParaReativar: true,
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

  // INSERT direto, e não mais uma chamada a `criarItem`: aquela é a ação do
  // catálogo de /admin/itens e exige `exigirAdmin` por dentro — delegar a ela
  // desfaria a abertura logo na linha seguinte.
  //
  // `estoque_minimo: 0` explícito = o default da coluna (0042) e "sem alerta de
  // reposição": quem está no meio de um lançamento não define ponto de reposição.
  // Ajusta-se depois em admin/itens.
  const { data: criado, error: erroInsert } = await supabase
    .from('itens')
    .insert({
      nome: parsed.data.nome,
      grupo: parsed.data.grupo as GrupoItem,
      tipo_id: parsed.data.tipo_id ?? null,
      ordem: proximaOrdemDoGrupo(maior?.ordem ?? null),
      estoque_minimo: 0,
      criado_por: aut.uid,
    })
    .select('id')
    .single()
  if (erroInsert) {
    return { ok: false, erro: traduzErroBanco(erroInsert.message, erroInsert.code) }
  }

  revalidarItens()
  return { ok: true, id: criado.id }
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

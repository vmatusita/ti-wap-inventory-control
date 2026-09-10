'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin, exigirPapel } from '@/lib/auth/acesso'
import { registrarFalha } from '@/lib/observabilidade'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  colaboradorInlineSchema,
  colaboradorSchema,
  atualizarColaboradorSchema,
  consolidarColaboradoresSchema,
  MSG_COLABORADOR_DUPLICADO,
} from '@/lib/validators/colaborador'
import { chaveColaborador } from '@/lib/colaboradores/chave'
import { resolverColaboradoresPorNome } from '@/lib/queries/colaboradores'
import {
  lancamentosSemVinculo,
  saldoDoColaborador,
  type SaldoDoColaborador as SaldoDoColaboradorQuery,
} from '@/lib/queries/itens'

// Re-export no ALIAS INLINE (a forma segura — ver o comentário longo em
// actions/movimentacoes.ts sobre o defeito B1+B2 da F13).
export type SaldoDoColaborador = SaldoDoColaboradorQuery

// Server Actions do cadastro de pessoas (F37 · D5).
//
// DOIS REGIMES DE PERMISSÃO, como em `actions/itens.ts` — e a diferença frente ao
// catálogo de itens é DELIBERADA (ordem F37 §A.6):
//
//   · CRIAR (inclusive inline, no meio de uma movimentação) → `exigirPapel(…, 'operador')`,
//     o espelho exato de `pode_escrever()` no banco. Tem de ser assim: quem cria o
//     colaborador é o operador, no meio do fluxo. Se isso exigisse admin, o wizard
//     quebraria na mão dele — que é justamente o que a ordem manda evitar.
//   · EDITAR / DESATIVAR / CONSOLIDAR EM LOTE → `exigirAdmin()`, como as demais telas
//     de /admin. A policy da 0112 diz o mesmo: INSERT por `pode_escrever()`, UPDATE
//     por `e_admin()`.
//
// Por que NÃO `exigirEscrita(supabase, filialId)`: aquela guarda cobra VÍNCULO DE
// FILIAL, e cadastro de pessoa não é matéria de filial — o `filial_id` do colaborador
// é atributo, não escopo de escrita. Um operador da Matriz que registra a saída de um
// equipamento para alguém da Serra precisa poder cadastrar essa pessoa.
//
// A guarda de Server Action dá a MENSAGEM em pt-BR; a segurança é a RLS da 0112.

function revalidarColaboradores() {
  revalidatePath('/admin/colaboradores')
  revalidatePath('/movimentacoes/nova')
  revalidatePath('/itens')
}

export type CriarColaboradorResult = ActionResult & {
  id?: string
  nome?: string
  reativado?: boolean
  /**
   * O cadastro existe, está DESATIVADO e quem clicou não teve permissão para
   * reativá-lo (a policy de UPDATE da 0112 é `e_admin()`; o operador só INSERE).
   * A movimentação segue e sai vinculada — o que a tela precisa dizer é que a
   * reativação depende de um administrador, em vez de anunciar que aconteceu.
   */
  precisaAdminParaReativar?: boolean
}

/**
 * A colisão do índice único vira frase em pt-BR — nunca um `23505` cru na tela.
 * É a consequência assumida do desenho (duas pessoas de mesmo nome normalizado não
 * cabem), e o operador merece saber as duas saídas que existem.
 */
function erroDeColaborador(mensagem: string, code?: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('colaboradores_nome_chave_uidx') || m.includes('duplicate key')) {
    return MSG_COLABORADOR_DUPLICADO
  }
  if (m.includes('colaboradores_nome_nao_vazio')) {
    return 'Informe o nome do colaborador.'
  }
  return traduzErroBanco(mensagem, code)
}

/**
 * Criação INLINE no meio do fluxo (molde do `criarItemInline`, F10).
 *
 * BECO SEM SAÍDA que ela fecha, espelhando o que a F12 aprendeu com itens: o
 * combobox só lista colaborador ATIVO, mas o índice único é sobre TODOS. Com um
 * homônimo DESATIVADO, o operador não veria a pessoa na lista, tentaria criar e
 * levaria "já existe" para alguém que a tela diz não existir. Aqui o cadastro
 * desativado é REATIVADO e devolvido selecionado — é o que o operador quer, é
 * reversível em Administração → Colaboradores, e o histórico fica intacto.
 */
export async function criarColaboradorInline(input: {
  nome: string
  filial_id?: number | null
}): Promise<CriarColaboradorResult> {
  const supabase = await createClient()
  const aut = await exigirPapel(supabase, 'operador')
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = colaboradorInlineSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  // A chave é calculada aqui e conferida no banco pela MESMA regra (a coluna é
  // gerada por `colaborador_chave`, e `chave-sql.test.ts` prova que os dois lados
  // são o mesmo). Busca por chave, não por `ilike`: o nome é texto livre, e um `%`
  // digitado pelo operador viraria curinga.
  const chave = chaveColaborador(parsed.data.nome)
  const { data: existente, error: erroBusca } = await supabase
    .from('colaboradores')
    .select('id, nome, ativo')
    .eq('nome_chave', chave)
    .maybeSingle()
  if (erroBusca) {
    return { ok: false, erro: traduzErroBanco(erroBusca.message, erroBusca.code) }
  }

  if (existente) {
    if (existente.ativo) {
      // Já existe e está ativo: devolvemos ele SELECIONADO em vez de um erro. O
      // operador queria usar a pessoa, não criá-la duas vezes.
      return { ok: true, id: existente.id, nome: existente.nome }
    }
    // ⚠ `.select('id')` NÃO é enfeite: é o que torna esta reativação verificável.
    //
    // A policy de UPDATE da 0112 é `e_admin()`, e esta action roda sob
    // `exigirPapel(…, 'operador')`. Para um operador puro, o PostgREST não devolve
    // erro nenhum — a RLS simplesmente não enxerga a linha e o UPDATE atinge ZERO
    // registros (é exatamente o que a asserção 3c-ter de supabase/tests/papeis_rls.sql
    // mede). Sem contar as linhas devolvidas, `erroReativar` vinha nulo e a action
    // respondia `reativado: true` para uma reativação que nunca aconteceu — a tela
    // dizia "voltou ao cadastro" e o banco continuava com `ativo = false`.
    const { data: reativados, error: erroReativar } = await supabase
      .from('colaboradores')
      .update({ ativo: true })
      .eq('id', existente.id)
      .select('id')
    if (erroReativar) {
      return {
        ok: false,
        erro: 'Este colaborador já existe, mas está desativado, e não foi possível reativá-lo. Reative-o em Administração → Colaboradores.',
      }
    }
    if (!reativados || reativados.length === 0) {
      // Cadastro existe e continua desativado. Devolvemos `ok` COM o id: o vínculo
      // da movimentação é legítimo (`resolverColaboradoresPorNome` não filtra por
      // `ativo`, e o histórico aponta para a pessoa certa), e travar o fluxo aqui
      // seria punir o operador por uma permissão que ele não tem. O que muda é a
      // frase: a tela pede um administrador em vez de anunciar o que não fez.
      return {
        ok: true,
        id: existente.id,
        nome: existente.nome,
        precisaAdminParaReativar: true,
      }
    }
    revalidarColaboradores()
    return { ok: true, id: existente.id, nome: existente.nome, reativado: true }
  }

  const { data, error } = await supabase
    .from('colaboradores')
    .insert({
      nome: parsed.data.nome,
      filial_id: parsed.data.filial_id,
      criado_por: aut.uid,
    })
    .select('id, nome')
    .single()
  if (error) return { ok: false, erro: erroDeColaborador(error.message, error.code) }

  revalidarColaboradores()
  return { ok: true, id: data?.id, nome: data?.nome }
}

/** Cadastro completo, pela tela de administração. */
export async function criarColaborador(input: {
  nome: string
  matricula?: string | null
  setor?: string | null
  filial_id?: number | null
}): Promise<CriarColaboradorResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = colaboradorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { data, error } = await supabase
    .from('colaboradores')
    .insert({ ...parsed.data, criado_por: aut.uid })
    .select('id, nome')
    .single()
  if (error) return { ok: false, erro: erroDeColaborador(error.message, error.code) }

  revalidarColaboradores()
  return { ok: true, id: data?.id, nome: data?.nome }
}

/**
 * Editar / ativar / desativar. Não existe excluir: cadastro de pessoa não se apaga
 * (a 0112 nem tem policy de DELETE) — o histórico aponta para ele.
 */
export async function atualizarColaborador(input: {
  id: string
  nome: string
  matricula?: string | null
  setor?: string | null
  filial_id?: number | null
  ativo: boolean
}): Promise<ActionResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = atualizarColaboradorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = parsed.data

  const { error } = await supabase.from('colaboradores').update(campos).eq('id', id)
  if (error) return { ok: false, erro: erroDeColaborador(error.message, error.code) }

  revalidarColaboradores()
  return { ok: true }
}

export type ConsolidarResult = ActionResult & {
  criados?: number
  jaExistiam?: number
}

/**
 * Consolidação em lote: transforma os nomes digitados à mão em cadastros de verdade.
 *
 * O QUE ELA **NÃO** FAZ, e é o ponto central da fase (ordem §A.3): ela **não altera
 * uma única linha de histórico**. Nenhum UPDATE em `movimentacoes` ou
 * `lancamentos_item` — `guarda_acervo` (0081) recusaria, e está certa. O que ela faz
 * é CRIAR os cadastros correspondentes às chaves; a partir daí o passado se resolve
 * por chave na leitura, e todo registro NOVO nasce com o vínculo gravado.
 *
 * As chaves vêm da tela, mas a GRAFIA e a filial vêm da view, relidas aqui: o cliente
 * escolhe quais grupos consolidar, nunca o texto do que será criado.
 */
export async function consolidarColaboradores(input: {
  chaves: string[]
}): Promise<ConsolidarResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = consolidarColaboradoresSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { data: grupos, error: erroFila } = await supabase
    .from('v_colaboradores_textos')
    .select('nome_chave, grafia_exemplo, filial_id, ja_cadastrado')
    .in('nome_chave', parsed.data.chaves)
  if (erroFila) {
    return { ok: false, erro: traduzErroBanco(erroFila.message, erroFila.code) }
  }

  type Grupo = {
    nome_chave: string | null
    grafia_exemplo: string | null
    filial_id: number | null
    ja_cadastrado: boolean | null
  }
  const aCriar = ((grupos ?? []) as Grupo[]).filter(
    (g) => g.nome_chave && g.grafia_exemplo && !g.ja_cadastrado,
  )
  const jaExistiam = parsed.data.chaves.length - aCriar.length

  if (aCriar.length === 0) {
    return {
      ok: true,
      criados: 0,
      jaExistiam,
    }
  }

  // `upsert` com `ignoreDuplicates` sobre a chave única: duas abas consolidando ao
  // mesmo tempo não viram erro na cara de ninguém — a segunda simplesmente não cria
  // o que a primeira já criou. `nome_chave` é coluna GERADA, então o conflito é
  // declarado sobre ela e o valor nunca é enviado.
  const { data: criados, error } = await supabase
    .from('colaboradores')
    .upsert(
      aCriar.map((g) => ({
        nome: (g.grafia_exemplo as string).trim(),
        filial_id: g.filial_id,
        criado_por: aut.uid,
      })),
      { onConflict: 'nome_chave', ignoreDuplicates: true },
    )
    .select('id')
  if (error) return { ok: false, erro: erroDeColaborador(error.message, error.code) }

  revalidarColaboradores()
  return { ok: true, criados: criados?.length ?? 0, jaExistiam }
}

// ---------------------------------------------------------------------------
// F38 · frente C — "Com esta pessoa", sob demanda
// ---------------------------------------------------------------------------
// O bloco é carregado no CLIQUE, não na montagem da tabela: são N pessoas na
// tela e uma consulta por linha seria um round-trip por colaborador para
// informação que quase nunca é olhada. A leitura é `rel_saldo_colaborador`
// (0118, `security invoker`), então a RLS continua sendo a autorização — e o
// piso de leitura já é "todo logado ativo lê tudo".
//
// Devolve o CONTADOR de lançamentos sem vínculo junto, porque a honestidade
// instalada na F37 exige dizer quantos ficaram de fora da conta — e a contagem é
// agregada no SQL (lição do teto de 1.000), nunca contada em memória.
/** O formato canônico do UUID que o Postgres aceita, conferido antes de ir até lá. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SaldoDaPessoaResult = {
  ok: boolean
  saldos: SaldoDoColaborador[]
  semVinculo: number
  erro?: string
}

export async function buscarSaldoDoColaborador(
  colaboradorId: string,
): Promise<SaldoDaPessoaResult> {
  // O FORMATO do UUID, não só o comprimento: `[0-9a-f-]{36}` aceitava 36 hífens, e
  // o lixo passava a guarda para morrer no `22P02` do Postgres, dentro do catch
  // genérico — a mensagem certa existia e não era usada.
  if (!UUID_RE.test(colaboradorId)) {
    return { ok: false, saldos: [], semVinculo: 0, erro: 'Colaborador inválido.' }
  }
  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'consulta')
  if (!cargo.ok) return { ok: false, saldos: [], semVinculo: 0, erro: cargo.erro }

  try {
    const [saldos, semVinculo] = await Promise.all([
      saldoDoColaborador(colaboradorId),
      lancamentosSemVinculo(),
    ])
    return { ok: true, saldos, semVinculo }
  } catch (err) {
    registrarFalha({
      escopo: 'colaboradores.saldo-colaborador',
      erro: err,
      operador: cargo.uid,
    })
    return {
      ok: false,
      saldos: [],
      semVinculo: 0,
      erro: 'Não foi possível ler o que está com esta pessoa agora.',
    }
  }
}

/**
 * O mesmo bloco, a partir do NOME digitado — o caminho do wizard de devolução.
 *
 * ⚠ NENHUM ID VIAJA PELO FORMULÁRIO (doutrina da F37): o campo Colaborador é texto
 * livre, e o vínculo é resolvido AQUI, no servidor, pela chave normalizada do
 * próprio texto. Nome que não está no cadastro devolve lista vazia com
 * `cadastrado: false` — e a tela usa isso para dizer, discretamente, que a
 * devolução vai repor o estoque sem baixar conta de ninguém (regra §C.3).
 */
export async function buscarSaldoPorNomeDeColaborador(
  nome: string,
): Promise<SaldoDaPessoaResult & { cadastrado: boolean }> {
  const limpo = (nome ?? '').trim()
  if (!limpo) return { ok: true, saldos: [], semVinculo: 0, cadastrado: false }

  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'consulta')
  if (!cargo.ok) {
    return { ok: false, saldos: [], semVinculo: 0, cadastrado: false, erro: cargo.erro }
  }

  const vinculos = await resolverColaboradoresPorNome(supabase, [limpo])
  const id = vinculos.get(chaveColaborador(limpo))
  if (!id) return { ok: true, saldos: [], semVinculo: 0, cadastrado: false }

  const r = await buscarSaldoDoColaborador(id)
  return { ...r, cadastrado: true }
}

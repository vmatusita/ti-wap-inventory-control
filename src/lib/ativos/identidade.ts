// A IDENTIDADE DO ATIVO — a régua numa casa só (F57 · Frente E).
//
// O QUE É A IDENTIDADE. O par patrimônio + service tag (spec §5); sem patrimônio, a service tag
// sozinha. No banco ela mora em DOIS lugares, que têm de concordar:
//   · os índices únicos da `0091` — POR FILIAL: `(filial_id, patrimonio, coalesce(service_tag,''))`
//     e `(filial_id, coalesce(service_tag,'')) where patrimonio is null and coalesce(...) <> ''`;
//   · `chave_identidade_ativo(patrimonio, service_tag)` (`0092`, corrigida na `0099` com o prefixo
//     de comprimento) — a mesma identidade SEM a filial, que a view de conflitos, a RPC de exclusão
//     e a guarda da transferência usam.
// `chaveDeIdentidadeSemUnidade` espelha a função; `chaveDeIdentidade` espelha o índice (a unidade
// à esquerda). `identidade-sql.test.ts` lê os dois do disco e reprova se divergirem.
//
// ⚠ ONDE A RECUSA DE CADASTRO PROCURA — em TODAS as unidades, e por quê.
// O índice por filial deixa o mesmo par existir em duas filiais: é o estado "em conflito" (F24),
// e ele existe de propósito. Mas o conflito só pode NASCER DO IMPORT. Cadastro manual (a compra),
// corrigir patrimônio, definir service tag e o substituto da devolução ao fornecedor RECUSAM par
// que já exista em QUALQUER filial — spec §10.2 (autoridade nº 1), ata F24 de 30/07/2026 e regra
// permanente 2 do `CLAUDE.md`. Como o índice não segura isso, esta consulta é a ÚNICA linha que
// segura: sem ela, uma compra abriria conflito entre filiais em silêncio.
//
// POR QUE UM MÓDULO. Até a F57 a consulta vivia COPIADA nas três actions (`compras.ts`,
// `ativos.ts` e `devolucao-fornecedor.ts`), com duas réguas de chave (`chavePatrimonio`, sem o
// prefixo de comprimento que a `0099` introduziu, e a comparação à mão de `ativos.ts`). Agora ela
// mora aqui, e o ALCANCE é um parâmetro nomeado em cada chamada — ninguém recorta por filial sem
// escrever isso por extenso.
//
// ⚠ A F57 NÃO RECORTOU A COMPRA POR FILIAL, embora a ordem pedisse (decisão i do Johnny, 14/09):
// a premissa dela — "`actions/ativos.ts` já consulta por filial" — foi medida falsa (a checagem
// de lá é global, por decisão da F24) e a spec diz o contrário. Se a spec for emendada, a troca é
// o alcance passado em `actions/compras.ts`: uma linha. Ata em `docs/DECISOES.md` e no topo de
// `docs/RELATORIO-F57.md`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// As chaves — funções puras
// ---------------------------------------------------------------------------

/**
 * A identidade SEM a unidade — espelho EXATO de `public.chave_identidade_ativo` (migration 0099):
 *
 *   com patrimônio → `length(patrimonio) || ':' || patrimonio || '::' || coalesce(service_tag,'')`
 *   sem patrimônio, com tag → `'∅::' || service_tag`
 *   sem os dois → `null` (sem identidade: nunca conflita, nunca é recusado)
 *
 * O prefixo de comprimento existe porque o patrimônio é texto livre desde a F7J: sem ele, `A::B`
 * sem tag e `A` com tag `B::` produziriam a mesma chave. `length` do Postgres conta CARACTERES, e
 * por isso aqui a conta é por ponto de código (`[...s]`), não por unidade UTF-16 (`s.length`).
 */
export function chaveDeIdentidadeSemUnidade(
  patrimonio: string | null,
  serviceTag: string | null | undefined,
): string | null {
  const tag = serviceTag ?? ''
  if (patrimonio !== null) return `${[...patrimonio].length}:${patrimonio}::${tag}`
  if (tag !== '') return `∅::${tag}`
  return null
}

/**
 * A identidade DENTRO de uma unidade — o que o índice único da `0091` garante que não se repete:
 * a unidade à esquerda, e a identidade sem unidade depois dela. Dois cadastros com a mesma
 * `chaveDeIdentidadeSemUnidade` e chaves de identidade diferentes são o conflito entre filiais.
 */
export function chaveDeIdentidade(
  unidadeId: number,
  patrimonio: string | null,
  serviceTag: string | null | undefined,
): string | null {
  const semUnidade = chaveDeIdentidadeSemUnidade(patrimonio, serviceTag)
  return semUnidade === null ? null : `${unidadeId}|${semUnidade}`
}

// ---------------------------------------------------------------------------
// O alcance — onde a identidade é procurada
// ---------------------------------------------------------------------------

export type AlcanceDaIdentidade =
  | { readonly alcance: 'todas-as-unidades' }
  | { readonly alcance: 'unidade'; readonly unidadeId: number }

/**
 * O alcance da recusa de CADASTRO MANUAL (compra, correção de patrimônio, service tag,
 * substituto): todas as unidades. Ver o ⚠ do cabeçalho — spec §10.2.
 */
export const ALCANCE_DA_RECUSA_MANUAL: AlcanceDaIdentidade = Object.freeze({
  alcance: 'todas-as-unidades',
})

// ---------------------------------------------------------------------------
// A consulta — o ÚNICO lugar que procura identidade no acervo
// ---------------------------------------------------------------------------

export type ParDeIdentidade = {
  readonly patrimonio: string | null
  readonly serviceTag: string | null | undefined
}

export type CadastroComIdentidade = {
  readonly ativoId: string
  readonly filialId: number
  readonly filialNome: string | null
}

export type ResultadoDaIdentidade =
  | {
      readonly ok: true
      /** Por `chaveDeIdentidadeSemUnidade` do par PEDIDO → os cadastros que já a têm. */
      readonly porChave: ReadonlyMap<string, readonly CadastroComIdentidade[]>
    }
  | { readonly ok: false; readonly erro: { readonly message: string; readonly code?: string } }

const SELECT_IDENTIDADE = 'id, patrimonio, service_tag, filial_id, filiais(nome)'

/**
 * Os cadastros do acervo que já têm a identidade de cada par pedido.
 *
 * A comparação é EXATA, como os índices (sem caixa, sem espaço tirado aqui: quem chama decide se
 * normaliza — o Zod das actions já tira espaço das pontas). `null` e `''` de service tag são a
 * mesma coisa, como o `coalesce` do índice.
 *
 * O erro de leitura volta como VALOR, e não como exceção: cada action o traduz do seu jeito
 * (duas devolvem `traduzErroBanco`, uma relança), e esse comportamento não muda com a F57.
 */
export async function cadastrosComMesmaIdentidade(
  client: SupabaseClient<Database>,
  pares: readonly ParDeIdentidade[],
  opcoes: { readonly alcance: AlcanceDaIdentidade; readonly excetoAtivoId?: string },
): Promise<ResultadoDaIdentidade> {
  const pedidas = new Set<string>()
  const patrimonios: string[] = []
  const tagsSemPatrimonio: string[] = []
  for (const par of pares) {
    const chave = chaveDeIdentidadeSemUnidade(par.patrimonio, par.serviceTag)
    if (chave === null) continue
    pedidas.add(chave)
    if (par.patrimonio !== null) {
      if (!patrimonios.includes(par.patrimonio)) patrimonios.push(par.patrimonio)
    } else {
      const tag = par.serviceTag ?? ''
      if (!tagsSemPatrimonio.includes(tag)) tagsSemPatrimonio.push(tag)
    }
  }

  const porChave = new Map<string, CadastroComIdentidade[]>()
  if (pedidas.size === 0) return { ok: true, porChave }

  const base = () => {
    let q = client.from('ativos').select(SELECT_IDENTIDADE)
    if (opcoes.excetoAtivoId) q = q.neq('id', opcoes.excetoAtivoId)
    if (opcoes.alcance.alcance === 'unidade') q = q.eq('filial_id', opcoes.alcance.unidadeId)
    return q
  }

  const respostas = await Promise.all([
    patrimonios.length > 0 ? base().in('patrimonio', patrimonios) : null,
    tagsSemPatrimonio.length > 0
      ? base().is('patrimonio', null).in('service_tag', tagsSemPatrimonio)
      : null,
  ])

  for (const resposta of respostas) {
    if (resposta === null) continue
    if (resposta.error) {
      return { ok: false, erro: { message: resposta.error.message, code: resposta.error.code } }
    }
    for (const a of resposta.data ?? []) {
      const chave = chaveDeIdentidadeSemUnidade(a.patrimonio, a.service_tag)
      if (chave === null || !pedidas.has(chave)) continue
      const lista = porChave.get(chave) ?? []
      lista.push({
        ativoId: a.id,
        filialId: a.filial_id,
        filialNome: (a.filiais as { nome: string } | null)?.nome ?? null,
      })
      porChave.set(chave, lista)
    }
  }
  return { ok: true, porChave }
}

// ---------------------------------------------------------------------------
// As recusas de um cadastro com patrimônio — as mensagens de sempre
// ---------------------------------------------------------------------------

/** Um item cadastrado COM patrimônio (a compra e o substituto da devolução). */
export type ItemComPatrimonio = { readonly patrimonio: string; readonly service_tag?: string | null }

/** "Patrimônio repetido no lote" — a 2ª ocorrência em diante da mesma identidade no mesmo lote. */
export function recusasDeRepeticaoNoLote(itens: readonly ItemComPatrimonio[]): string[] {
  const erros: string[] = []
  const vistas = new Set<string>()
  for (const it of itens) {
    const chave = chaveDeIdentidadeSemUnidade(it.patrimonio, it.service_tag)
    if (chave === null) continue
    if (vistas.has(chave)) {
      erros.push(
        `Patrimônio repetido no lote: ${it.patrimonio}${it.service_tag ? ` (service tag ${it.service_tag})` : ''}.`,
      )
    }
    vistas.add(chave)
  }
  return erros
}

/** "Já existe um ativo …" — cada item cuja identidade o acervo já tem (no alcance consultado). */
export function recusasDeIdentidadeNoAcervo(
  itens: readonly ItemComPatrimonio[],
  porChave: ReadonlyMap<string, readonly CadastroComIdentidade[]>,
): string[] {
  const erros: string[] = []
  for (const it of itens) {
    const chave = chaveDeIdentidadeSemUnidade(it.patrimonio, it.service_tag)
    if (chave !== null && (porChave.get(chave)?.length ?? 0) > 0) {
      erros.push(
        `Já existe um ativo ${it.patrimonio} ${it.service_tag ? `com service tag ${it.service_tag}` : 'sem service tag'} — use uma service tag distinta.`,
      )
    }
  }
  return erros
}

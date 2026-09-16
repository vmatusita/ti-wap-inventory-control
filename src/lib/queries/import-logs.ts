import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { chavePatrimonio, SEM_PATRIMONIO } from '@/lib/patrimonio'
import {
  CAP_ATIVOS,
  CAP_LOTE,
  CAP_LOTE_MOVIMENTACOES,
  CAP_TERMOS_GERADOS,
  paginarTodos,
} from '@/lib/queries/relatorios/comum'
import type { Database } from '@/lib/types/database'
import {
  escopoDeGestaoAtual,
  escopoDoImportLog,
  pertenceAoEscopo,
} from '@/lib/escopo/pertencimento'
import { linhasDe } from '@/lib/supabase/linhas'
import {
  LEITURA_BACKUP_ANOTACOES_IMPORT,
  LEITURA_BACKUP_ATIVOS_IMPORT,
  LEITURA_BACKUP_LANCAMENTOS_ITEM_IMPORT,
  LEITURA_BACKUP_MOVIMENTACOES_IMPORT,
  LEITURA_BACKUP_PENDENCIAS_ITEM_IMPORT,
  LEITURA_BACKUP_TERMOS_GERADOS_IMPORT,
  LEITURA_PAR_COM_PATRIMONIO_EM_OUTRA_FILIAL,
  LEITURA_PAR_SEM_PATRIMONIO_EM_OUTRA_FILIAL,
} from '@/lib/queries/formas/import-logs'

// Leituras da tela admin/importar (OS-F7 / W3): custo da substituição por filial,
// histórico de imports e export do acervo para o backup pré-import. Todas recebem
// um `client` já resolvido (o operador logado) — a RPC/backup exigem a sessão
// autenticada (RLS 0005/0017/0021 dá select ao `authenticated`).

type DbClient = SupabaseClient<Database>
type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

// Contagem do que a substituição APAGA nesta filial (espelha o DELETE da RPC
// 0032: movs/anotações dos ativos da filial + termos "puros" da filial).
//
// F56 · Frente F (migration 0140) — as QUATRO chaves novas, na mesma ordem e com
// o MESMO critério (a filial ATUAL do ativo) que `import_revalidar_contagens`
// usa (0140:355-392). Nomes em snake_case DE PROPÓSITO, e não por descuido: este
// objeto vira `p_contagens` da RPC por passagem direta (`custoPreview as unknown
// as Json` em `aplicarImport`) — não há tradução de chave no meio, e o precedente
// da casa para um valor que atravessa a fronteira RPC sem tradução é snake_case
// (`conflitos_abertos` em `rpcRetornoSchema`, mesmo arquivo).
export type CustoSubstituir = {
  ativos: number
  movimentacoes: number
  anotacoes: number
  termos: number
  /** pendências de item do acervo — 0140 `v_liv_pend` (:378-379). */
  pendencias_item: number
  /** lançamentos presos a MOVIMENTAÇÃO do acervo — 0140 `v_liv_lanc_mov` (:380-384). */
  lancamentos_movimentacao: number
  /** lançamentos presos a PENDÊNCIA do acervo — 0140 `v_liv_lanc_pend` (:385-389). */
  lancamentos_pendencia: number
  /** ativos de OUTRA filial cujo `substitui_ativo_id` aponta para o acervo — 0140 `v_liv_subst` (:390-392). */
  ponteiros_substituto: number
}

// Termo que mistura ESTA filial com outra — o preview bloqueia o passo 4 e a RPC
// tem a mesma rede de segurança (não dá para apagar só metade de um termo).
export type TermoMultiFilial = {
  id: string
  tipo: string
  colaborador: string | null
}

// Acervo exportado para o backup (JSON) gravado ANTES da RPC destrutiva.
export type AcervoFilial = {
  ativos: Row<'ativos'>[]
  movimentacoes: Row<'movimentacoes'>[]
  anotacoes: Row<'anotacoes'>[]
  termos_gerados: Row<'termos_gerados'>[]
}

// `.in('ativo_id', [...])` monta o filtro na URL — mil UUIDs estouram o limite.
// Quebramos em lotes; a chave natural (ativo_id) particiona sem sobreposição, então
// somar contagens / concatenar linhas de lotes distintos é seguro.
const LOTE = 100

function emLotes<T>(itens: T[], n = LOTE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < itens.length; i += n) out.push(itens.slice(i, i + n))
  return out
}

async function idsDaFilial(client: DbClient, filialId: number): Promise<string[]> {
  // PostgREST corta cada select em 1.000 linhas (ver `paginarTodos`). SEM paginação,
  // a Matriz (1.217 ativos) devolvia só 1.000 ids — e, sem ORDER BY, um subconjunto
  // que VARIAVA entre chamadas: isso tornava o custo do preview não-determinístico
  // (falso "O estado da filial mudou desde o preview") e deixava o BACKUP incompleto.
  // Paginado + `order('id')` estável resolve os dois (a RPC já contava certo por SQL).
  //
  // F60 (PLAN §2.1, #25–#35): TODAS as leituras paginadas deste módulo são por KEYSET pelo `id` —
  // a ordem de antes já era a PK, então custo do preview e backup saem na mesma ordem.
  const rows = await paginarTodos<{ id: string }>(
    'Falha ao listar ativos da filial',
    {
      porChave: (depoisDe, tamanho) => {
        const q = client.from('ativos').select('id').eq('filial_id', filialId).order('id').limit(tamanho)
        return depoisDe === null ? q : q.gt('id', depoisDe)
      },
      chaveDe: (r) => r.id,
    },
    CAP_ATIVOS,
  )
  return rows.map((r) => r.id)
}

async function contarMovs(client: DbClient, ids: string[]): Promise<number> {
  let total = 0
  for (const lote of emLotes(ids)) {
    const { count, error } = await client
      .from('movimentacoes')
      .select('*', { count: 'exact', head: true })
      .in('ativo_id', lote)
    if (error) throw new Error(`Falha ao contar movimentações: ${error.message}`)
    total += count ?? 0
  }
  return total
}

async function contarAnotacoes(client: DbClient, ids: string[]): Promise<number> {
  let total = 0
  for (const lote of emLotes(ids)) {
    const { count, error } = await client
      .from('anotacoes')
      .select('*', { count: 'exact', head: true })
      .in('ativo_id', lote)
    if (error) throw new Error(`Falha ao contar anotações: ${error.message}`)
    total += count ?? 0
  }
  return total
}

// F56 · Frente F — as quatro contagens da FK (0140), cada uma espelhando UMA das
// quatro `select count(*)` de `import_revalidar_contagens` (0140:378-392). Pelo
// critério da RPC (a filial ATUAL do ativo — nunca `filial_id` histórico).

/** 0140 `v_liv_pend` (:378-379): pendências de item cujo `ativo_id` é do acervo. */
async function contarPendenciasItem(client: DbClient, idsAtivos: string[]): Promise<number> {
  let total = 0
  for (const lote of emLotes(idsAtivos)) {
    const { count, error } = await client
      .from('pendencias_item')
      .select('*', { count: 'exact', head: true })
      .in('ativo_id', lote)
    if (error) throw new Error(`Falha ao contar pendências de item: ${error.message}`)
    total += count ?? 0
  }
  return total
}

/**
 * Os ids de `movimentacoes`/`pendencias_item` do acervo — o PostgREST não tem
 * subconsulta (`in (select …)`), então onde o SQL da 0140 aninha um `select id
 * from … where ativo_id in (…)` dentro do `count(*)`, aqui são dois passos: lista
 * os ids do acervo, depois conta `lancamentos_item` que apontam para eles.
 */
async function idsPorAtivo(
  client: DbClient,
  tabela: 'movimentacoes' | 'pendencias_item',
  idsAtivos: string[],
): Promise<string[]> {
  const out: string[] = []
  for (const lote of emLotes(idsAtivos)) {
    // Teto de LOTE de movimentações para as duas tabelas: é a maior das duas contas (máx. 9
    // movimentações por ativo; `pendencias_item` inteira tinha 17 linhas em 16/09), e o nome da
    // tabela chega em variável.
    const parte = await paginarTodos<{ id: string }>(
      `Falha ao listar ${tabela} da filial`,
      {
        porChave: (depoisDe, tamanho) => {
          const q = client.from(tabela).select('id').in('ativo_id', lote).order('id').limit(tamanho)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (r) => r.id,
      },
      CAP_LOTE_MOVIMENTACOES,
    )
    out.push(...parte.map((r) => r.id))
  }
  return out
}

async function contarLancamentosPorColuna(
  client: DbClient,
  coluna: 'movimentacao_id' | 'pendencia_item_id',
  ids: string[],
): Promise<number> {
  let total = 0
  for (const lote of emLotes(ids)) {
    const { count, error } = await client
      .from('lancamentos_item')
      .select('*', { count: 'exact', head: true })
      .in(coluna, lote)
    if (error) throw new Error(`Falha ao contar lancamentos_item.${coluna}: ${error.message}`)
    total += count ?? 0
  }
  return total
}

/** 0140 `v_liv_subst` (:390-392): ativos de OUTRA filial que apontam para o acervo. */
async function contarPonteirosSubstituto(
  client: DbClient,
  idsAtivos: string[],
  filialId: number,
): Promise<number> {
  let total = 0
  for (const lote of emLotes(idsAtivos)) {
    const { count, error } = await client
      .from('ativos')
      .select('*', { count: 'exact', head: true })
      .in('substitui_ativo_id', lote)
      .neq('filial_id', filialId)
    if (error) throw new Error(`Falha ao contar ponteiros de substituto: ${error.message}`)
    total += count ?? 0
  }
  return total
}

// F7E — a chave que esta query devolve para os nulos-com-tag (`∅::<service_tag>`) é a
// MESMA que o motor monta na 2ª passada de `validarCsvImport`
// (`existentesEmOutraFilial.get(chaveBanco)`); por isso `SEM_PATRIMONIO` é importado de
// @/lib/patrimonio (fonte única) — antes era duplicado aqui e em plano.ts.

/**
 * F7C — quais das linhas do CSV já existem no banco em OUTRA filial. Devolve uma
 * chave → nome da filial onde o ativo está hoje. F7E amplia para DUAS identidades:
 *   · COM patrimônio → chave `chavePatrimonio(patrimonio, service_tag)` (par exato);
 *   · SEM patrimônio, COM service tag → chave `∅::<service_tag exata>` (índice parcial
 *     `ativos_service_tag_sem_patrimonio_uidx`, a tag vira a identidade dos sem-plaqueta).
 *
 * Por que existe: os índices únicos são GLOBAIS (não filtram `filial_id`). O
 * "Substituir tudo" só apaga o acervo da filial SELECIONADA, então um ativo do CSV que
 * esteja cadastrado em outra filial sobrevive ao DELETE e faz o INSERT da RPC estourar
 * o índice — depois do backup e da confirmação, sem que o preview tivesse apontado a
 * linha. O motor é puro e não fala com o banco: esta query alimenta o 5º parâmetro de
 * `validarCsvImport`, que emite o bloqueante `patrimonio_em_outra_filial`.
 *
 * A comparação é EXATA nos dois casos (patrimônio + `service_tag ?? ''`; tag RAW sem
 * uppercase), igual aos índices e ao motor — normalizar acusaria colisão que o banco
 * não teria. `serviceTagsSemPatrimonio` são as tags dos candidatos com patrimônio null;
 * vazio (default) preserva o comportamento pré-F7E byte a byte.
 */
export async function paresEmOutrasFiliais(
  client: DbClient,
  filialId: number,
  patrimonios: string[],
  serviceTagsSemPatrimonio: string[] = [],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()

  // (1) Pares COM patrimônio — a régua F7C original.
  const unicos = [...new Set(patrimonios)]
  for (const lote of emLotes(unicos)) {
    const { data, error } = await client
      .from('ativos')
      .select(LEITURA_PAR_COM_PATRIMONIO_EM_OUTRA_FILIAL.select)
      .in('patrimonio', lote)
      .neq('filial_id', filialId)
    if (error) throw new Error(`Falha ao conferir patrimônios em outras filiais: ${error.message}`)
    const linhas = linhasDe(
      data,
      LEITURA_PAR_COM_PATRIMONIO_EM_OUTRA_FILIAL.forma,
      LEITURA_PAR_COM_PATRIMONIO_EM_OUTRA_FILIAL.rotulo,
    )
    for (const a of linhas) {
      // `.in('patrimonio', …)` nunca traz null/vazio; o guard é defensivo e satisfaz o
      // tipo (F7E deixou `ativos.patrimonio` nullable) sem depender do estado do W4.
      if (!a.patrimonio) continue
      mapa.set(chavePatrimonio(a.patrimonio, a.service_tag), a.filiais.nome)
    }
  }

  // (2) SEM patrimônio, COM service tag — a tag é a identidade (índice parcial novo).
  // A chave montada aqui espelha 1:1 a de `plano.ts`: `∅` + `::` + service tag RAW/exata.
  const tags = [...new Set(serviceTagsSemPatrimonio)].filter((t) => t.trim() !== '')
  for (const lote of emLotes(tags)) {
    const { data, error } = await client
      .from('ativos')
      .select(LEITURA_PAR_SEM_PATRIMONIO_EM_OUTRA_FILIAL.select)
      .is('patrimonio', null)
      .in('service_tag', lote)
      .neq('filial_id', filialId)
    if (error) {
      throw new Error(
        `Falha ao conferir service tags sem patrimônio em outras filiais: ${error.message}`,
      )
    }
    const linhas = linhasDe(
      data,
      LEITURA_PAR_SEM_PATRIMONIO_EM_OUTRA_FILIAL.forma,
      LEITURA_PAR_SEM_PATRIMONIO_EM_OUTRA_FILIAL.rotulo,
    )
    for (const a of linhas) {
      if (!a.service_tag) continue // o filtro já exclui, mas o tipo é nullable
      mapa.set(`${SEM_PATRIMONIO}::${a.service_tag}`, a.filiais.nome)
    }
  }

  return mapa
}

// Custo da substituição + termos multi-filial que a bloqueiam. Usado no preview e
// (revalidando) no aplicar. Os termos_gerados não têm FK para ativos (ativo_ids é
// array de uuid), então classificamos em memória contra o conjunto de ids da filial.
export async function custoSubstituir(
  client: DbClient,
  filialId: number,
): Promise<{ custo: CustoSubstituir; termosMultiFilial: TermoMultiFilial[] }> {
  const ids = await idsDaFilial(client, filialId)
  const filialSet = new Set(ids)

  const [movimentacoes, anotacoes, termosData, pendenciasItem] = await Promise.all([
    contarMovs(client, ids),
    contarAnotacoes(client, ids),
    // Paginado: um projeto com > 1.000 termos gerados teria a classificação
    // multi-filial silenciosamente incompleta (o mesmo corte de 1.000 do PostgREST).
    paginarTodos<{ id: string; tipo: string; colaborador: string | null; ativo_ids: string[] }>(
      'Falha ao ler termos gerados',
      {
        porChave: (depoisDe, tamanho) => {
          const q = client.from('termos_gerados').select('id, tipo, colaborador, ativo_ids').order('id').limit(tamanho)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (t) => t.id,
      },
      CAP_TERMOS_GERADOS,
    ),
    // F56 · Frente F (0140) — pendências de item do acervo.
    contarPendenciasItem(client, ids),
  ])

  // As duas contagens de `lancamentos_item` dependem dos ids de movimentações/
  // pendências do acervo — não dá para paralelizar com a leitura de `ids` acima
  // (dependem dela), mas as duas entre si sim.
  const [movIds, pendIds] = await Promise.all([
    idsPorAtivo(client, 'movimentacoes', ids),
    idsPorAtivo(client, 'pendencias_item', ids),
  ])
  const [lancamentosMovimentacao, lancamentosPendencia, ponteirosSubstituto] = await Promise.all([
    contarLancamentosPorColuna(client, 'movimentacao_id', movIds),
    contarLancamentosPorColuna(client, 'pendencia_item_id', pendIds),
    contarPonteirosSubstituto(client, ids, filialId),
  ])

  let termos = 0
  const termosMultiFilial: TermoMultiFilial[] = []
  for (const t of termosData) {
    const tocaEsta = t.ativo_ids.some((a) => filialSet.has(a))
    if (!tocaEsta) continue
    const tocaOutra = t.ativo_ids.some((a) => !filialSet.has(a))
    if (tocaOutra) {
      termosMultiFilial.push({ id: t.id, tipo: t.tipo, colaborador: t.colaborador })
    } else {
      termos += 1
    }
  }

  return {
    custo: {
      ativos: ids.length,
      movimentacoes,
      anotacoes,
      termos,
      pendencias_item: pendenciasItem,
      lancamentos_movimentacao: lancamentosMovimentacao,
      lancamentos_pendencia: lancamentosPendencia,
      ponteiros_substituto: ponteirosSubstituto,
    },
    termosMultiFilial,
  }
}

// Exporta o acervo da filial para o backup (JSON) gravado antes da RPC. Espelha o
// escopo do DELETE da RPC: ativos da filial, suas movs/anotações e os termos que
// tocam a filial (após a guarda multi-filial, todos são "puros" dela).
export async function exportarAcervoFilial(
  client: DbClient,
  filialId: number,
): Promise<AcervoFilial> {
  const ids = await idsDaFilial(client, filialId)

  // Todas as leituras do backup são paginadas: o corte de 1.000 do PostgREST deixaria
  // o backup INCOMPLETO na Matriz (1.217 ativos) — e um backup que não bate com o que
  // será apagado é pior que não ter backup. `order('id')` estável entre as páginas.
  //
  // F58 — `select('*')` FROUXA (regra 8 do lote 2): a coluna que `LEITURA_BACKUP_*` não
  // declara chega ao backup igual, pelo `catchall` de `z.looseObject`.
  const ativosBrutos = await paginarTodos(
    'Falha ao exportar ativos',
    {
      porChave: (depoisDe, tamanho) => {
        const q = client
          .from('ativos')
          .select(LEITURA_BACKUP_ATIVOS_IMPORT.select)
          .eq('filial_id', filialId)
          .order('id')
          .limit(tamanho)
        return depoisDe === null ? q : q.gt('id', depoisDe)
      },
      chaveDe: (a) => a.id,
    },
    CAP_ATIVOS,
  )
  const ativos = linhasDe(ativosBrutos, LEITURA_BACKUP_ATIVOS_IMPORT.forma, LEITURA_BACKUP_ATIVOS_IMPORT.rotulo)

  const movimentacoes: Row<'movimentacoes'>[] = []
  for (const lote of emLotes(ids)) {
    const brutas = await paginarTodos(
      'Falha ao exportar movimentações',
      {
        porChave: (depoisDe, tamanho) => {
          const q = client
            .from('movimentacoes')
            .select(LEITURA_BACKUP_MOVIMENTACOES_IMPORT.select)
            .in('ativo_id', lote)
            .order('id')
            .limit(tamanho)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (m) => m.id,
      },
      CAP_LOTE_MOVIMENTACOES,
    )
    movimentacoes.push(...linhasDe(brutas, LEITURA_BACKUP_MOVIMENTACOES_IMPORT.forma, LEITURA_BACKUP_MOVIMENTACOES_IMPORT.rotulo))
  }

  const anotacoes: Row<'anotacoes'>[] = []
  for (const lote of emLotes(ids)) {
    const brutas = await paginarTodos(
      'Falha ao exportar anotações',
      {
        porChave: (depoisDe, tamanho) => {
          const q = client
            .from('anotacoes')
            .select(LEITURA_BACKUP_ANOTACOES_IMPORT.select)
            .in('ativo_id', lote)
            .order('id')
            .limit(tamanho)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (a) => a.id,
      },
      CAP_LOTE,
    )
    anotacoes.push(...linhasDe(brutas, LEITURA_BACKUP_ANOTACOES_IMPORT.forma, LEITURA_BACKUP_ANOTACOES_IMPORT.rotulo))
  }

  // Termos: `ativo_ids uuid[]`, sem FK — a régua é a mesma da RPC. O recorte é do BANCO
  // (`&&`, o operador de interseção de arrays), em lotes, e não mais uma leitura da tabela
  // INTEIRA filtrada em TypeScript. Era a única das quatro leituras deste exportador sem
  // recorte: ela trazia para a memória do servidor toda linha de `termos_gerados` do
  // sistema — inclusive as de filiais que este import não toca.
  //
  // ⚠ O CUSTO FOI MEDIDO ANTES DA TROCA, e ele não é gratuito hoje (09/09/2026, produção):
  //   · tabela inteira:            1 ida ao banco,  1,07 ms (Seq Scan de 91 linhas)
  //   · `&&` por lote de 100:     12 idas ao banco, 1,26 ms cada (Bitmap Index Scan)
  // Com 91 termos e 1.140 ativos na Matriz, ler tudo é MAIS RÁPIDO — o cruzamento fica em
  // torno de 12.000 termos, quando as páginas de 1.000 igualam os lotes de 100. O que se
  // compra aqui não é tempo: é ESCOPO (o servidor deixa de ver linha fora do recorte) e a
  // memória, que passa a crescer com o recorte e não com a tabela. Numa operação
  // deliberada, rara e já medida em segundos — que antes desta leitura já faz ~24 idas ao
  // banco —, +11 idas é preço declarado, não regressão descoberta depois.
  //
  // O índice existe e é usado: `termos_gerados_ativos_gin` (GIN sobre `ativo_ids`). Sem
  // ele cada lote seria um seq scan, e a troca seria treze varreduras no lugar de uma —
  // por isso ele foi conferido no plano, não suposto.
  //
  // ⚠ DEDUPLICAÇÃO OBRIGATÓRIA. Um termo de LOTE cujos `ativo_ids` caiam em dois lotes
  // diferentes volta DUAS vezes. A leitura antiga não tinha como duplicar; esta tem, e uma
  // linha repetida no backup vira violação de chave primária na hora de restaurar — o
  // defeito apareceria meses depois, no único momento em que o backup precisa funcionar.
  const porId = new Map<string, Row<'termos_gerados'>>()
  for (const lote of emLotes(ids)) {
    const brutos = await paginarTodos(
      'Falha ao exportar termos',
      {
        porChave: (depoisDe, tamanho) => {
          const q = client
            .from('termos_gerados')
            .select(LEITURA_BACKUP_TERMOS_GERADOS_IMPORT.select)
            .overlaps('ativo_ids', lote)
            .order('id')
            .limit(tamanho)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (t) => t.id,
      },
      CAP_LOTE,
    )
    const parte = linhasDe(brutos, LEITURA_BACKUP_TERMOS_GERADOS_IMPORT.forma, LEITURA_BACKUP_TERMOS_GERADOS_IMPORT.rotulo)
    for (const t of parte) porId.set(t.id, t)
  }
  const termos_gerados = [...porId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return { ativos, movimentacoes, anotacoes, termos_gerados }
}

// ---------------------------------------------------------------------------
// F56 · Frente F (migration 0140) — o que o backup `versao: 2` do import ganha
// para cobrir os cinco caminhos de FK do fato 27, além das quatro tabelas de
// `AcervoFilial` (que ficam EXATAMENTE como estão — congeladas por
// `backup-formato.test.ts` describe 2 — estes três campos entram DIRETO no
// cabeçalho do backup, ao lado do espalhamento `...acervo`, nunca dentro dele).
// ---------------------------------------------------------------------------

/** A pré-imagem de UM elo de `lancamentos_item`, ANTES do UPDATE que o desvincula. */
export type LancamentoDesvinculado = {
  id: string
  movimentacao_id: string | null
  pendencia_item_id: string | null
}

export type DesvinculosFk = {
  /** 0140 passo iii: as pendências de item do acervo — linhas inteiras, sob o
   *  nome da tabela (`restaurar.mjs` já sabe inserir `pendencias_item` na ordem certa). */
  pendenciasItem: Row<'pendencias_item'>[]
  /** 0140 passos i e ii: a pré-imagem de cada lançamento que a RPC desvincula —
   *  `pendencia_item_id` numa pendência do acervo OU `movimentacao_id` numa
   *  movimentação do acervo. UNIÃO por id (fato 32: nunca os dois ao mesmo
   *  tempo, mas a dedução protege mesmo assim). */
  lancamentosDesvinculados: LancamentoDesvinculado[]
  /** 0140 passo iv: ativos de OUTRA filial cujo `substitui_ativo_id` aponta
   *  para o acervo — linhas INTEIRAS, molde de `montarBackupDoReset`
   *  (`src/lib/queries/dev-destrutivo.ts:517-546`, mesmo nome de propósito). */
  ponteirosPerdidos: Row<'ativos'>[]
}

/**
 * Lê, ANTES da RPC (que é quando o backup é gravado), tudo o que o conserto da
 * FK vai apagar/desvincular/anular — a pré-imagem que `scripts/db/restaurar.mjs`
 * usa para religar os dois elos e o ponteiro dentro da janela de restauração.
 *
 * Chamada separada de `exportarAcervoFilial` de propósito (ver o cabeçalho
 * acima): duas leituras independentes de `idsDaFilial`, o mesmo padrão que
 * `custoSubstituir`/`exportarAcervoFilial` já usam entre si.
 */
export async function exportarDesvinculosFk(client: DbClient, filialId: number): Promise<DesvinculosFk> {
  const ids = await idsDaFilial(client, filialId)

  const pendenciasItem: Row<'pendencias_item'>[] = []
  for (const lote of emLotes(ids)) {
    const brutas = await paginarTodos(
      'Falha ao exportar pendências de item',
      {
        porChave: (depoisDe, tamanho) => {
          const q = client
            .from('pendencias_item')
            .select(LEITURA_BACKUP_PENDENCIAS_ITEM_IMPORT.select)
            .in('ativo_id', lote)
            .order('id')
            .limit(tamanho)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (p) => p.id,
      },
      CAP_LOTE,
    )
    pendenciasItem.push(
      ...linhasDe(brutas, LEITURA_BACKUP_PENDENCIAS_ITEM_IMPORT.forma, LEITURA_BACKUP_PENDENCIAS_ITEM_IMPORT.rotulo),
    )
  }

  const [movIds, pendIds] = await Promise.all([
    idsPorAtivo(client, 'movimentacoes', ids),
    idsPorAtivo(client, 'pendencias_item', ids),
  ])

  const porIdLanc = new Map<string, LancamentoDesvinculado>()
  for (const lote of emLotes(movIds)) {
    const brutos = await paginarTodos(
      'Falha ao exportar lançamentos presos a movimentação',
      {
        porChave: (depoisDe, tamanho) => {
          const q = client
            .from('lancamentos_item')
            .select(LEITURA_BACKUP_LANCAMENTOS_ITEM_IMPORT.select)
            .in('movimentacao_id', lote)
            .order('id')
            .limit(tamanho)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (l) => l.id,
      },
      CAP_LOTE,
    )
    const parte = linhasDe(
      brutos,
      LEITURA_BACKUP_LANCAMENTOS_ITEM_IMPORT.forma,
      LEITURA_BACKUP_LANCAMENTOS_ITEM_IMPORT.rotulo,
    )
    for (const l of parte) porIdLanc.set(l.id, l)
  }
  for (const lote of emLotes(pendIds)) {
    const brutos = await paginarTodos(
      'Falha ao exportar lançamentos presos a pendência',
      {
        porChave: (depoisDe, tamanho) => {
          const q = client
            .from('lancamentos_item')
            .select(LEITURA_BACKUP_LANCAMENTOS_ITEM_IMPORT.select)
            .in('pendencia_item_id', lote)
            .order('id')
            .limit(tamanho)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (l) => l.id,
      },
      CAP_LOTE,
    )
    const parte = linhasDe(
      brutos,
      LEITURA_BACKUP_LANCAMENTOS_ITEM_IMPORT.forma,
      LEITURA_BACKUP_LANCAMENTOS_ITEM_IMPORT.rotulo,
    )
    for (const l of parte) porIdLanc.set(l.id, l)
  }
  const lancamentosDesvinculados = [...porIdLanc.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  const ponteirosPerdidos: Row<'ativos'>[] = []
  if (ids.length > 0) {
    const porIdAtivo = new Map<string, Row<'ativos'>>()
    for (const lote of emLotes(ids)) {
      const brutos = await paginarTodos(
        'Falha ao exportar ativos que apontam para o acervo',
        {
          porChave: (depoisDe, tamanho) => {
            const q = client
              .from('ativos')
              .select(LEITURA_BACKUP_ATIVOS_IMPORT.select)
              .in('substitui_ativo_id', lote)
              .neq('filial_id', filialId)
              .order('id')
              .limit(tamanho)
            return depoisDe === null ? q : q.gt('id', depoisDe)
          },
          chaveDe: (a) => a.id,
        },
        CAP_LOTE,
      )
      const parte = linhasDe(brutos, LEITURA_BACKUP_ATIVOS_IMPORT.forma, LEITURA_BACKUP_ATIVOS_IMPORT.rotulo)
      for (const a of parte) porIdAtivo.set(a.id, a)
    }
    ponteirosPerdidos.push(
      ...[...porIdAtivo.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    )
  }

  return { pendenciasItem, lancamentosDesvinculados, ponteirosPerdidos }
}

// ---------------------------------------------------------------------------

export type ImportLogRow = {
  id: string
  filialNome: string
  filialSlug: string
  quem: string
  criadoEm: string
  totalLinhas: number
  ativosCriados: number
  movsApagadas: number
  anotacoesApagadas: number
  termosApagados: number
  backupPath: string
  /** F52 — o sha-256 do arquivo original. É a chave da janela de 24 h de idempotência
   *  que `import_validar_plano` aplica: sem mostrá-lo aqui, a tela não teria como
   *  explicar por que um reimport foi recusado ("mesmo arquivo"), nem o operador teria
   *  como conferir se é mesmo o mesmo. Vazio nos logs anteriores à coluna. */
  arquivoHash: string
  /** F7B — quantas correções foram declaradas na tela neste import (0 nos antigos). */
  correcoes: number
  /** F24 — quantos conflitos entre filiais este import abriu (0 nos anteriores à fase:
   *  antes da migration 0091 o índice global impedia o conflito de existir). */
  conflitosAbertos: number
}

// Histórico de imports (auditoria). Join em filiais (nome/slug) e profiles (nome
// de quem importou) pelas FKs do 0031. Ordenado do mais recente para o mais antigo.
export async function listarImportLogs(
  client: DbClient,
  limite = 50,
): Promise<ImportLogRow[]> {
  const { data, error } = await client
    .from('import_logs')
    .select(
      // ⚠ As colunas são listadas UMA A UMA e o mapeamento abaixo é manual: coluna nova
      // que não entre nesta string simplesmente não chega ao histórico, e o TypeScript
      // não avisa.
      'id, arquivo_hash, total_linhas, ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados, backup_path, correcoes, conflitos_abertos, created_at, filiais(nome, slug), profiles(nome)',
    )
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw new Error(`Falha ao listar imports: ${error.message}`)

  // A FECHADURA DE PERTENCIMENTO (F54) — hoje um NO-OP, e é o ponto de injeção da
  // F62/F69, o mesmo de `urlBackup`. Todo admin vê o histórico de todas as filiais, e
  // isso é o desenho de hoje, não um defeito de hoje: com uma empresa só,
  // `pertenceAoEscopo` responde `true` para toda linha e a lista sai idêntica. O filtro
  // fica ANTES do mapeamento de propósito — na virada, a linha de outra empresa não
  // deve nem chegar a ser convertida em `ImportLogRow`.
  return (data ?? [])
    .filter((l) => pertenceAoEscopo(escopoDeGestaoAtual(), escopoDoImportLog(l)))
    .map((l) => ({
    id: l.id,
    filialNome: l.filiais?.nome ?? '—',
    filialSlug: l.filiais?.slug ?? '',
    quem: l.profiles?.nome?.trim() || '—',
    criadoEm: l.created_at,
    totalLinhas: l.total_linhas,
    ativosCriados: l.ativos_criados,
    movsApagadas: l.movs_apagadas,
    anotacoesApagadas: l.anotacoes_apagadas,
    termosApagados: l.termos_apagados,
    backupPath: l.backup_path,
    arquivoHash: l.arquivo_hash ?? '',
    // jsonb (default '[]'); imports da F7 e qualquer valor fora do formato → 0.
    correcoes: Array.isArray(l.correcoes) ? l.correcoes.length : 0,
    // F24 — int not null default 0 (migration 0094); imports anteriores à fase → 0.
    conflitosAbertos: l.conflitos_abertos ?? 0,
  }))
}

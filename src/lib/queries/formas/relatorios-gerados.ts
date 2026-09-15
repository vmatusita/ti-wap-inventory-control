import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// A forma das leituras de `queries/gerados.ts` (F58 · Frente C · lote 4 — o ÚLTIMO).
//
// Duas leituras de `relatorios_gerados`: a LISTA (`listarRelatoriosGerados`, colunas rasas + os
// dois embeds de sempre) e o DETALHE (`buscarRelatorioGerado`, que também traz `dados` — o
// snapshot congelado). As duas são estritas nas colunas próprias: o `select` de hoje já é
// literal (a concatenação por `+` do fato 11 nunca chegou aqui), então a única coisa que faltava
// era trocar `as unknown as Raw*` pela porta da leitura. `linhasDe`/`linhaDe` LANÇAM — o mesmo
// caminho de falha que `if (error) throw` já tinha para as duas.

const s = z.string()
const sn = z.string().nullable()
const n = z.number()

// ---------------------------------------------------------------------------
// A FORMA DO SNAPSHOT (`relatorios_gerados.dados`) — FROUXA e HISTÓRICA.
// ---------------------------------------------------------------------------
//
// `dados` é `jsonb` gravado uma vez, na geração, e lido meses (ou anos) depois — a categoria do
// §4 é "coluna jsonb (snapshot de gerados.ts): FROUXA, aceitando SnapshotRelatorio |
// SnapshotRelatorioV2". Cada objeto, em TODO nível, é `z.looseObject`: uma chave que uma versão
// futura do snapshot acrescente não pode derrubar a leitura de um snapshot já congelado. Cada
// campo espelha `lib/relatorios/tipos.ts` CAMPO A CAMPO — `.optional()` exatamente onde o tipo TS
// tem `?:`, `.nullable()` exatamente onde é `| null`, enum pelo `ENUM` de `supabase/enums.ts`
// (nunca lista redigitada); os poucos literais que não vêm do banco (`GranularidadeSerie`,
// `desfecho`, `estornada?: true`) são `z.enum`/`z.literal` escritos aqui, porque não são enum do
// Postgres. NENHUM teto de tamanho, nenhum refinamento de escrita — é leitura de dado CONGELADO.
//
// A UNIÃO, e por que V2 vem PRIMEIRO. `AnySnapshot = SnapshotRelatorio | SnapshotRelatorioV2`
// (`ehSnapshotV2` discrimina pelo `meta.schema === 2`). Aqui quem discrimina é o próprio Zod, pela
// ORDEM da união: `z.union([V2, V1])` tenta V2 primeiro. `META_V2.schema` EXIGE `z.literal(2)`;
// `META_V1.schema` exige o AUSENTE — `z.never().optional()`, que só aceita `undefined` (nenhum
// valor habita `never`, e `.optional()` é o que permite a chave faltar). Um v2 QUEBRADO (uma seção
// obrigatória faltando, por exemplo `saidas`) tem `meta.schema: 2` gravado — e por isso nunca
// escorrega para V1: a MESMA razão que reprova o V2 quebrado (falta uma chave obrigatória) reprova
// o V1 (a chave `schema` está presente, e V1 exige ausente). Sem o `z.never().optional()` em V1,
// um v2 com uma seção faltando passaria como v1 truncado — lido, mas com a metade das colunas do
// e-mail faladas em silêncio.
//
// A prova de que a saída da união é atribuível a `AnySnapshot` SEM `as` está em
// `relatorios-gerados-tipos.test.ts` (compilação); os testes de EXECUÇÃO (v1/v2 completos, campos
// opcionais ausentes dos dois lados, chave extra, v2 quebrado, objeto sem `meta`) estão em
// `relatorios-gerados.test.ts`.

const KPIS = z.looseObject({
  total: n,
  em_uso: n,
  em_estoque: n,
  reservado: n,
  em_manutencao: n,
  em_triagem: n,
  defasado: n,
  emprestado: n.optional(),
})

const CONTAGEM_CATEGORIA = z.looseObject({ categoria: ENUM.categoriaAtivo, total: n })
const ITEM_MODELO = z.looseObject({ modelo: s, total: n })
const ITEM_RESERVADO = z.looseObject({ patrimonio: s, modelo: s, chamado: sn })
const ITEM_MANUTENCAO = z.looseObject({ patrimonio: s, modelo: s, observacao: sn })
const PONTO_MES = z.looseObject({ mes: s, saidas: n, devolucoes: n })

const GRANULARIDADE_SERIE = z.enum(['dia', 'semana', 'mes'])
const PONTO_SERIE = z.looseObject({ chave: s, rotulo: s, saidas: n, devolucoes: n })
const SERIE_MOVIMENTACOES = z.looseObject({
  granularidade: GRANULARIDADE_SERIE,
  pontos: z.array(PONTO_SERIE),
})

const PONTO_ESTADO = z.looseObject({ chave: s, rotulo: s, em_estoque: n })
const SERIE_ESTADO = z.looseObject({ pontos: z.array(PONTO_ESTADO) })

const CONTAGEM_MOTIVO = z.looseObject({ motivo: s, total: n })
const POR_MOTIVO = z.looseObject({
  saidas: z.array(CONTAGEM_MOTIVO),
  devolucoes: z.array(CONTAGEM_MOTIVO),
})
const CHIP_PENDENCIA = z.looseObject({ chave: s, rotulo: s, total: n })

const MOVIMENTACAO_RELATORIO = z.looseObject({
  id: s,
  data: s,
  tipo: ENUM.tipoMovimentacao,
  patrimonio: s,
  ativo: s,
  categoria: ENUM.categoriaAtivo,
  colaborador_setor: sn,
  filial: s,
  chamado: sn,
  observacao: sn,
})

const RESUMO_CATEGORIA = z.looseObject({ categoria: ENUM.categoriaAtivo, total: n })
const RESUMO_MOTIVO = z.looseObject({ motivo: s, total: n, categorias: z.array(RESUMO_CATEGORIA) })
const RESUMO_FILIAL = z.looseObject({ filial: s, total: n, motivos: z.array(RESUMO_MOTIVO) })
const RESUMO_TIPO = z.looseObject({ total: n, filiais: z.array(RESUMO_FILIAL) })
const RESUMO_PERIODO = z.looseObject({
  de: s,
  ate: s,
  saidas: RESUMO_TIPO,
  devolucoes: RESUMO_TIPO,
})

// `MetaSnapshot` — os campos comuns são idênticos nas duas versões; só `schema` diverge (é ele
// quem discrimina a união, comentário acima).
const META_COMUM = {
  filialSlug: s,
  filialNome: s,
  ehGeral: z.boolean(),
  de: s,
  ate: s,
  periodoRotulo: s,
  observacao: s.optional(),
}
const META_V1 = z.looseObject({ ...META_COMUM, schema: z.never().optional() })
const META_V2 = z.looseObject({ ...META_COMUM, schema: z.literal(2) })

// ---- só v2 (o formato do e-mail — F3B) ----

const ESTOQUE_CAT_STATUS = z.looseObject({
  categoria: ENUM.categoriaAtivo,
  segmentos: z.array(z.looseObject({ status: ENUM.statusAtivo, total: n })),
  total: n,
})

const MODELOS_POR_CATEGORIA = z.looseObject({
  categoria: ENUM.categoriaAtivo,
  modelos: z.array(ITEM_MODELO),
  total: n,
})

const ANOTACAO_MANUTENCAO = z.looseObject({ texto: s, autor: sn, em: s })
const MANUTENCAO_CASO = z.looseObject({
  patrimonio: s,
  modelo: s,
  filial: s,
  chamado: sn,
  chamadoFornecedor: sn.optional(),
  dataEnvio: sn,
  diasEmManutencao: n.nullable(),
  obsEnvio: sn,
  anotacoes: z.array(ANOTACAO_MANUTENCAO),
  retornoData: sn,
  retornoObs: sn,
  fechado: z.boolean(),
  desfecho: z.enum(['retorno', 'devolvido_fornecedor']).optional(),
  ativoId: s.optional(),
})

const SALDO_ITEM_PERIODO = z.looseObject({
  item: s,
  total: n.optional(),
  estoque: n.optional(),
  saldo: n.optional(),
  minimo: n.optional(),
  atrelados: n,
  falta: n,
  entradas: n,
  saidas: n,
  delta: n,
  obs: sn,
})
const GRUPO_RELATORIO = z.looseObject({
  grupo: ENUM.grupoItem,
  itens: z.array(SALDO_ITEM_PERIODO),
  ultimoLancamento: sn,
  temAtrelados: z.boolean(),
})

// `estornada?`/`estornoData?` se repetem em TODAS as linhas de tabela (T1 — o inferido, sem
// coluna flag); `ativoId?` também (T3 — o link p/ a ficha, ausente nos snapshots pré-F16).
const RASTRO_ESTORNO = { ativoId: s.optional(), estornada: z.literal(true).optional(), estornoData: s.optional() }

const LINHA_SAIDA = z.looseObject({
  id: s,
  data: s,
  filial: s,
  categoria: ENUM.categoriaAtivo,
  modelo: s,
  patrimonio: s,
  tipo: ENUM.tipoMovimentacao,
  motivo: sn,
  chamado: sn,
  colaboradorSetor: sn,
  termo: sn,
  obs: sn,
  ...RASTRO_ESTORNO,
})

const LINHA_ENTRADA = z.looseObject({
  id: s,
  data: s,
  filial: s,
  categoria: ENUM.categoriaAtivo,
  modelo: s,
  patrimonio: s,
  tipo: ENUM.tipoMovimentacao,
  motivo: sn,
  colaborador: sn,
  setor: sn,
  itensFaltantes: z.array(s).nullable(),
  obs: sn,
  ...RASTRO_ESTORNO,
})

const LINHA_TRANSFERENCIA = z.looseObject({
  id: s,
  data: s,
  de: s,
  para: s,
  categoria: ENUM.categoriaAtivo,
  modelo: s,
  patrimonio: s,
  chamado: sn,
  obs: sn,
  ...RASTRO_ESTORNO,
})

const LINHA_LANCAMENTO_ITEM = z.looseObject({
  id: s,
  data: s,
  filial: s,
  item: s,
  grupo: ENUM.grupoItem,
  tipo: ENUM.tipoLancamento,
  quantidade: n,
  chamado: sn,
  colaborador: sn,
  obs: sn,
  ehEstorno: z.boolean(),
  estornada: z.literal(true).optional(),
  estornoData: s.optional(),
})

// ---- os dois snapshots ----

const SNAPSHOT_V1 = z.looseObject({
  meta: META_V1,
  kpis: KPIS,
  estoquePorCategoria: z.array(CONTAGEM_CATEGORIA),
  disponiveisPorModelo: z.array(ITEM_MODELO),
  reservados: z.array(ITEM_RESERVADO),
  emManutencao: z.array(ITEM_MANUTENCAO),
  serieMovimentacoes: SERIE_MOVIMENTACOES.optional(),
  movimentacoesPorMes: z.array(PONTO_MES).optional(),
  porMotivo: POR_MOTIVO,
  pendencias: z.array(CHIP_PENDENCIA),
  ultimasMovimentacoes: z.array(MOVIMENTACAO_RELATORIO),
  resumo: RESUMO_PERIODO,
})

const SNAPSHOT_V2 = z.looseObject({
  meta: META_V2,
  kpis: KPIS,
  kpisAnterior: KPIS,
  estoquePorCategoria: z.array(CONTAGEM_CATEGORIA),
  estoqueCatStatus: z.array(ESTOQUE_CAT_STATUS),
  disponiveisPorModelo: z.array(MODELOS_POR_CATEGORIA),
  reservados: z.array(ITEM_RESERVADO),
  manutencao: z.array(MANUTENCAO_CASO),
  serieMovimentacoes: SERIE_MOVIMENTACOES,
  serieEstado: SERIE_ESTADO.optional(),
  porMotivo: POR_MOTIVO,
  grupos: z.array(GRUPO_RELATORIO),
  pendencias: z.array(CHIP_PENDENCIA),
  saidas: z.array(LINHA_SAIDA),
  entradas: z.array(LINHA_ENTRADA),
  transferencias: z.array(LINHA_TRANSFERENCIA),
  movimentacoesItens: z.array(LINHA_LANCAMENTO_ITEM).optional(),
  resumo: RESUMO_PERIODO,
})

/** `z.output<typeof FORMA_SNAPSHOT>` é atribuível a `AnySnapshot` sem `as` — prova em
 *  `relatorios-gerados-tipos.test.ts`. V2 primeiro: comentário acima. */
export const FORMA_SNAPSHOT = z.union([SNAPSHOT_V2, SNAPSHOT_V1])

// ---------------------------------------------------------------------------
// As duas leituras de `relatorios_gerados`.
// ---------------------------------------------------------------------------

const FILIAL_EMBED = 'filial:filiais!relatorios_gerados_filial_id_fkey(nome, slug)'
// `relatorios_gerados.gerado_por` é not null (migration 0003) → embed NÃO-nulo, como em
// `LEITURA_TERMOS_DO_ATIVO` (`formas/termos.ts`) para o mesmo par tabela/FK.
const AUTOR_EMBED = 'autor:profiles!relatorios_gerados_gerado_por_fkey(nome)'

export const LEITURA_LISTA_RELATORIOS_GERADOS = leituraDeRelacao({
  rotulo: 'gerados.lista',
  origem: 'relatorios_gerados',
  select: `id, periodo_de, periodo_ate, filial_id, versao, gerado_em, observacao, ${FILIAL_EMBED}, ${AUTOR_EMBED}`,
  forma: z.strictObject({
    id: s,
    periodo_de: s,
    periodo_ate: s,
    filial_id: n.nullable(),
    versao: n,
    gerado_em: s,
    observacao: sn,
    filial: z.strictObject({ nome: s, slug: s }).nullable(),
    autor: z.strictObject({ nome: sn }),
  }),
  ordem: ['id'],
})

export const LEITURA_DETALHE_RELATORIO_GERADO = leituraDeRelacao({
  rotulo: 'gerados.detalhe',
  origem: 'relatorios_gerados',
  select: `id, periodo_de, periodo_ate, filial_id, versao, gerado_em, dados, ${AUTOR_EMBED}`,
  forma: z.strictObject({
    id: s,
    periodo_de: s,
    periodo_ate: s,
    filial_id: n.nullable(),
    versao: n,
    gerado_em: s,
    dados: FORMA_SNAPSHOT,
    autor: z.strictObject({ nome: sn }),
  }),
  ordem: ['id'],
})

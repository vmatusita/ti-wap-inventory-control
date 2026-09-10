'use server'

import { createClient } from '@/lib/supabase/server'
import { exigirPapel } from '@/lib/auth/acesso'
import { registrarFalha } from '@/lib/observabilidade'
import { formatDate, hojeISO } from '@/lib/format'
import { CAP_EXPORT, gerarCsv, nomeArquivoCsv, type ColunaCsv } from '@/lib/csv'
import {
  listarAtivosParaExport,
  type LinhaExportAtivo,
  type ListarAtivosParams,
} from '@/lib/queries/ativos'
import {
  listarPendenciasParaExport,
  ROTULO_TIPO_PENDENCIA,
  type FiltrosPendencias,
  type PendenciaDetalhe,
  type TipoFila,
} from '@/lib/queries/pendencias-detalhe'
import { listarConflitosParaExport } from '@/lib/queries/conflitos'
import type { LadoConflito } from '@/lib/pendencias/conflitos'
import {
  CELULA_SALDO_ZERO,
  estoqueForaDasColunas,
  getSaldosPorFilial,
  listarHistoricoParaExport,
  listarItensAtivos,
  type FiltrosHistorico,
  type LinhaExportHistorico,
  type SaldoItemFiliais,
} from '@/lib/queries/itens'
import { listarTiposItem } from '@/lib/queries/tipos-item'
import { listarFiliais, type Filial } from '@/lib/queries/filiais'
import { efeitoNoEstoque } from '@/lib/itens/efeito-lancamento'
// F42 — as MESMAS funções puras que a tabela de `/itens` usa. O arquivo e a tela
// somam pela mesma conta ou não somam.
import {
  emUsoDoSaldo,
  saldoDoRecorte,
  tiposPorItemDoCatalogo,
  type NumerosDoItem,
} from '@/lib/itens/lista'
import { getOperador } from '@/lib/auth/acesso'
import { dataISO, idNumerico } from '@/lib/url-params'
import {
  resolverFiliaisIds,
  resolverFiliaisSlugs,
  type OperadorDoFiltro,
} from '@/lib/filtros/filial'
import {
  CATEGORIA_ORDEM,
  GRUPO_ITEM_ORDEM,
  STATUS_ORDEM,
  rotuloCategoria,
  rotuloGrupoItem,
  rotuloStatus,
  rotuloTipoLancamento,
  type CategoriaAtivo,
  type GrupoItem,
  type StatusAtivo,
  type TipoLancamento,
} from '@/lib/dominio'

// Export CSV das listas operacionais (OS-F10 · T5). Server Actions de LEITURA:
// montam o arquivo inteiro no servidor e devolvem o texto; o download em si é
// do cliente (Blob), sem rota de API.
//
// Os filtros chegam como a QUERY STRING da própria página (`?status=…&filial=…`)
// e são reparseados aqui com a MESMA semântica do Server Component da tela — é o
// que garante que o arquivo traga exatamente as linhas visíveis. Reparsear (em
// vez de receber um objeto pronto do cliente) mantém a validação no servidor:
// nada que venha do navegador entra numa query sem passar por estes parsers.

export type ResultadoExportCsv = {
  // Canal de erro (sessão expirada, falha de leitura) — nada de exceção
  // atravessando a fronteira da action.
  erro?: string
  nome: string
  conteudo: string
  // Quantas linhas o filtro tem no banco.
  total: number
  // Quantas linhas foram realmente para o arquivo (≤ cap). Vai no toast do
  // truncamento — assim o componente de UI não precisa conhecer o cap (nem
  // importar `@/lib/csv`, que arrastaria o PapaParse para o bundle do cliente).
  exportadas: number
  // Sempre derivado de `exportadas < total` — nunca de `total > cap`. É o que
  // mantém o aviso correto seja qual for o Max Rows do PostgREST.
  truncado: boolean
}

const VAZIO: ResultadoExportCsv = {
  nome: '',
  conteudo: '',
  total: 0,
  exportadas: 0,
  truncado: false,
}

function falha(erro: string): ResultadoExportCsv {
  return { ...VAZIO, erro }
}

// Toda rota de export é de quem entrou por LOGIN (o visualizador por senha só alcança
// /relatorios/**). A action é um endpoint por si só, então checa a sessão mesmo que a
// página já tenha checado.
//
// F21 — SEM gate de cargo aqui: `CONSULTA_EXPORTA_CSV = sim` (§0 da ordem), porque
// exportar é LEITURA e leitura é ampla para todo logado (ADR-001, mantida pela ADR-002).
// Os três cargos exportam.
//
// Mas a guarda deixou de ser "existe sessão?" e passou a ser `exigirPapel('consulta')` —
// o PISO da hierarquia, que admin, operador e consulta atendem por igual. A diferença
// está em quem NÃO atende: o perfil DESATIVADO (`papel_atual()` devolve NULL para
// `ativo = false`). Sem isso, um usuário desligado — que `getOperador()` já expulsa de
// toda a UI — continuaria puxando o acervo inteiro em CSV por request direto até o token
// dele expirar, porque as policies de SELECT seguem `using (true)` por-design. A ordem
// dizia "só exige estar LOGADO"; a decisão registrada aqui é que "logado" pós-F21
// significa "com perfil ativo", que é a doutrina de revogação no request seguinte.
async function barrado(): Promise<string | null> {
  const supabase = await createClient()
  const aut = await exigirPapel(supabase, 'consulta')
  return aut.ok ? null : aut.erro
}

// ---------------------------------------------------------------------------
// Parsers dos filtros — espelham os Server Components das telas.
// ---------------------------------------------------------------------------

// `idNumerico` e `dataISO` vêm de `@/lib/url-params` desde a F12 (W6A). Antes
// eram cópias locais — e esta era a única do projeto SEM a faixa sã de datas
// (achado F12-W4-04): `?de=0000-01-01` passava, o Postgres devolvia 22008 e o
// toast dizia "Tente novamente" para um problema que estava na URL.

function texto(p: URLSearchParams, chave: string): string | undefined {
  const v = p.get(chave)
  return v && v.trim() ? v.trim() : undefined
}

// F25 — o contexto que o padrão POR CARGO exige. O export reparseia a querystring
// da tela, então precisa dos MESMOS insumos do Server Component: quem está pedindo
// e as filiais ativas. Sem isto, um operador exportaria o acervo inteiro enquanto a
// tela mostrava só as filiais dele — sem erro nenhum, que é a pior forma de errar.
async function contextoFilial(): Promise<{
  operador: OperadorDoFiltro
  filiais: Filial[]
}> {
  const [operador, filiais] = await Promise.all([getOperador(), listarFiliais()])
  return { operador, filiais }
}

// O recorte de filial das telas de item — saldos (`/itens`) e histórico
// (`/itens/historico`).
//
// HISTÓRICO DESTA FUNÇÃO, que vale guardar: até a F42 ela GATEAVA o recorte em
// `?visao=`, porque a visão "por filial" de /itens não renderizava o select e o
// Server Component neutralizava `?filial` no parse (achado A14 da F11) — o export
// tinha de fazer o MESMO, senão uma URL `?visao=filiais&filial=3` produzia um CSV
// de uma filial que o operador lia como o consolidado da tela (achado F12-W4-03).
//
// F42 — o gate MORREU junto com a visão. Não há mais tela em que o filtro de filial
// esteja invisível e mesmo assim recorte: ele é sempre renderizado e sempre vale,
// nas duas rotas. A função ficou sendo o que sempre quis ser — o `resolverFiliaisIds`
// das telas de item, com o padrão por cargo, igual ao de `/ativos`.
function filiaisDeItens(
  p: URLSearchParams,
  ctx: { operador: OperadorDoFiltro; filiais: Filial[] },
): number[] {
  return resolverFiliaisIds(
    texto(p, 'filial'),
    ctx.operador,
    ctx.filiais.map((f) => f.id),
  )
}

// F24 — `conflito` NÃO entra aqui: ele não é um filtro da fila (as linhas de conflito vêm
// de outra fonte) e `FiltrosPendencias.tipo` o exclui no tipo. O export da mesa tem caminho
// próprio, decidido em `exportarPendenciasCSV` antes de chegar a estes filtros.
const TIPOS_PENDENCIA: readonly TipoFila[] = [
  'termo',
  'itens',
  'triagem',
  'patrimonio',
  'outras',
]

// Lista explícita (não `in TIPO_LANCAMENTO_META`, que aceitaria chave herdada do
// prototype — `?tipo=constructor` viraria cast inválido de enum no banco).
const TIPOS_LANCAMENTO: readonly TipoLancamento[] = [
  'entrada',
  'saida',
  'reserva',
  'liberacao',
  'retorno',
  'ajuste',
]

// Espelha src/app/(app)/ativos/page.tsx (a paginação não vale no export).
function filtrosAtivos(
  p: URLSearchParams,
  ctx: { operador: OperadorDoFiltro; filiais: Filial[] },
): ListarAtivosParams {
  const categoriaRaw = texto(p, 'categoria')
  const status = (texto(p, 'status') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StatusAtivo => STATUS_ORDEM.includes(s as StatusAtivo))

  return {
    q: texto(p, 'q'),
    filialIds: resolverFiliaisIds(
      texto(p, 'filial'),
      ctx.operador,
      ctx.filiais.map((f) => f.id),
    ),
    categoria: CATEGORIA_ORDEM.includes(categoriaRaw as CategoriaAtivo)
      ? (categoriaRaw as CategoriaAtivo)
      : undefined,
    status,
    semPatrimonio: texto(p, 'semPatrimonio') === '1',
    // F28/ATV-02 — sem esta linha o chip "Com pendência" valeria na tela e NÃO
    // no arquivo: `aplicarFiltrosAtivos` é a mesma função nos dois caminhos, mas
    // o param só chega até ela se for lido AQUI. É o achado F12-W4-03 se
    // repetindo (a divergência tela × CSV), e foi a revisão adversarial desta
    // fase que o pegou. Mesma régua de `semPatrimonio`: só `'1'` liga.
    // Guarda permanente: `src/lib/actions/exportar-filtros.test.ts`.
    comPendencia: texto(p, 'comPendencia') === '1',
  }
}

// Espelha src/app/(app)/pendencias/page.tsx.
function filtrosPendencias(
  p: URLSearchParams,
  ctx: { operador: OperadorDoFiltro; filiais: Filial[] },
): FiltrosPendencias {
  const tipoRaw = texto(p, 'tipo')
  return {
    filialSlugs: resolverFiliaisSlugs(texto(p, 'filial'), ctx.operador, ctx.filiais),
    tipo: TIPOS_PENDENCIA.includes(tipoRaw as TipoFila) ? (tipoRaw as TipoFila) : null,
    q: texto(p, 'q') ?? null,
  }
}

// Espelha os filtros do histórico de src/app/(app)/itens/historico/page.tsx
// (F9 · I3). A rota virou própria na F42: o histórico não mora mais dentro de
// itens/page.tsx, e cada tela manda a própria querystring para o próprio export.
function filtrosHistorico(
  p: URLSearchParams,
  ctx: { operador: OperadorDoFiltro; filiais: Filial[] },
): FiltrosHistorico {
  const tipoRaw = texto(p, 'tipo')
  const filialIds = filiaisDeItens(p, ctx)
  const itemId = idNumerico(texto(p, 'item'))
  return {
    filialIds,
    itemId,
    tipo: TIPOS_LANCAMENTO.includes(tipoRaw as TipoLancamento)
      ? (tipoRaw as TipoLancamento)
      : null,
    de: dataISO(texto(p, 'de')),
    ate: dataISO(texto(p, 'ate')),
    // F28/ITN-03b — mesma armadilha do `comPendencia` acima: a busca por chamado
    // ou colaborador precisa ser lida aqui para valer no arquivo. `texto` já
    // devolve `undefined` para vazio; o tipo do filtro quer `string | null`.
    busca: texto(p, 'busca') ?? null,
    // ITN-03a — a ORDEM também é parte do "o arquivo traz o que a tela mostra".
    // A grade passa a ordenar por data de NEGÓCIO no recorte de 1 item + 1
    // filial (o mesmo em que a coluna "Saldo após" aparece); sem esta linha o
    // CSV do MESMO recorte sairia em ordem de REGISTRO, e as duas listas
    // ficariam invertidas entre si na presença de um lançamento retroativo.
    // A régua é a mesma da tela (`mostrarSaldoApos` em itens/page.tsx).
    ordenarPorData: filialIds.length === 1 && itemId != null,
  }
}

// ---------------------------------------------------------------------------
// Colunas — "as da tela + o que identifica a linha" (OS-F10 §W4.2).
// ---------------------------------------------------------------------------

const COLUNAS_ATIVOS: ColunaCsv<LinhaExportAtivo>[] = [
  { titulo: 'Patrimônio', valor: (l) => l.patrimonio },
  { titulo: 'Service Tag', valor: (l) => l.service_tag },
  { titulo: 'Hostname', valor: (l) => l.hostname },
  { titulo: 'Categoria', valor: (l) => rotuloCategoria(l.categoria) },
  { titulo: 'Marca', valor: (l) => l.marca },
  { titulo: 'Modelo', valor: (l) => l.modelo },
  // F25 — campos do celular. Vazios nas demais categorias: uma coluna vazia é
  // mais barata (e mais fácil de somar numa planilha) que um segundo arquivo.
  // ⚠ Um telefone gravado como `+5541988887777` sai com o prefixo anti-fórmula
  // do CSV (`PADRAO_FORMULA` em lib/csv.ts) — proteção correta contra CSV
  // injection, visível no Excel.
  { titulo: 'Nº do telefone', valor: (l) => l.telefone },
  { titulo: 'IMEI', valor: (l) => l.imei },
  { titulo: 'Pulsus', valor: (l) => l.pulsus },
  { titulo: 'Filial', valor: (l) => l.filial_nome },
  { titulo: 'Status', valor: (l) => rotuloStatus(l.status) },
  { titulo: 'Colaborador', valor: (l) => l.colaborador_atual },
  { titulo: 'Setor', valor: (l) => l.setor_atual },
  // F28/ATV-02 — a pendência passou a ser visível na LISTA (indicador âmbar) e a
  // ter chip de filtro; sem esta coluna, quem exporta "Com pendência" recebe um
  // arquivo em que nada distingue as linhas nem diz o motivo. É texto livre
  // (`ativos.pendencia`), o mesmo que a ficha mostra na faixa âmbar.
  { titulo: 'Pendência', valor: (l) => l.pendencia },
]

const COLUNAS_PENDENCIAS: ColunaCsv<PendenciaDetalhe>[] = [
  { titulo: 'Tipo', valor: (l) => ROTULO_TIPO_PENDENCIA[l.tipo] },
  { titulo: 'Pendência', valor: (l) => l.pendencia },
  { titulo: 'Patrimônio', valor: (l) => l.patrimonio },
  { titulo: 'Categoria', valor: (l) => (l.categoria ? rotuloCategoria(l.categoria) : '') },
  { titulo: 'Marca', valor: (l) => l.marca },
  { titulo: 'Modelo', valor: (l) => l.modelo },
  { titulo: 'Colaborador', valor: (l) => l.colaborador },
  { titulo: 'Setor', valor: (l) => l.setor },
  { titulo: 'Filial', valor: (l) => l.filialNome ?? l.filialSlug },
  // `desde` é timestamptz: formatDate converte para o fuso de SP antes do dd/MM.
  { titulo: 'Desde', valor: (l) => (l.desde ? formatDate(l.desde) : '') },
]

// F24 — uma linha por CADASTRO em conflito. A chave do grupo vem primeiro para que, ao
// ordenar no Excel, os lados do mesmo conflito fiquem adjacentes: o arquivo tem de permitir
// a MESMA leitura que a mesa faz (comparar os dois lados), e não só listar ativos soltos.
const COLUNAS_CONFLITOS: ColunaCsv<{ chave: string; lado: LadoConflito }>[] = [
  { titulo: 'Conflito', valor: (l) => l.chave },
  { titulo: 'Filial', valor: (l) => l.lado.filialNome },
  { titulo: 'Patrimônio', valor: (l) => l.lado.patrimonio },
  { titulo: 'Service tag', valor: (l) => l.lado.serviceTag },
  { titulo: 'Estado', valor: (l) => rotuloStatus(l.lado.status) },
  { titulo: 'Categoria', valor: (l) => rotuloCategoria(l.lado.categoria) },
  { titulo: 'Marca', valor: (l) => l.lado.marca },
  { titulo: 'Modelo', valor: (l) => l.lado.modelo },
  { titulo: 'Hostname', valor: (l) => l.lado.hostname },
  { titulo: 'Colaborador', valor: (l) => l.lado.colaborador },
  { titulo: 'Setor', valor: (l) => l.lado.setor },
  { titulo: 'Entrada', valor: (l) => (l.lado.entradaEm ? formatDate(l.lado.entradaEm) : '') },
  { titulo: 'Movimentações', valor: (l) => l.lado.movimentacoes },
  // A coluna que decide: movimentação que NÃO é da carga do import = vida de sistema.
  { titulo: 'Movs. fora da carga', valor: (l) => l.lado.movimentacoesReais },
  { titulo: 'Termos', valor: (l) => l.lado.termos },
  { titulo: 'Tem histórico real', valor: (l) => (l.lado.temHistoricoReal ? 'sim' : 'não') },
]

// AS COLUNAS DO CSV DE SALDOS — UM formato só, superset dos dois de antes (F42).
//
// Até a v1.46.0 esta função tinha DUAS gêmeas, escolhidas pelo mesmo `?visao=` que
// escolhia a tabela: `colunasSaldos` (o Consolidado, com uma linha por item) e
// `colunasSaldosPorFilial` (a matriz). Dois arquivos com o mesmo botão e formatos
// diferentes foi a forma que o achado F12-W4-03 encontrou de continuar existindo —
// e o F25-fix teve de correr atrás quando o default da tela mudou.
//
// Com a visão morta, o CSV é um só e traz TUDO o que os dois traziam, mais as duas
// novidades da fase. Nada do que a tela mostra fica de fora:
//  · Item, Grupo e **Tipo** (F37) — as três primeiras colunas da tabela;
//  · Filial: o rótulo do RECORTE ("Consolidado" ou "A + B"), sem o qual o arquivo
//    perde o contexto assim que sai da tela;
//  · os cinco números do recorte, incluindo **Em uso** (a coluna nova) e Reservado
//    (que saiu da tabela por ser zero desde a F41, mas continua aqui: quem abrir um
//    lançamento antigo precisa do número);
//  · uma coluna de ESTOQUE e uma de FALTA por filial — na tela são a linha
//    expansível e o chip vermelho "faltam N", o sinal mais visível da linha;
//  · o "fora das colunas" (estoque de filial DESATIVADA que o Total inclui e
//    nenhuma coluna mostra) — na tela é a nota "inclui N em estoque de filial fora
//    desta lista".
//
// Os rótulos por filial dizem só o nome dela; os do recorte não dizem "(todas)"
// porque a coluna Filial já carimba o que o arquivo contém.
function colunasSaldosItens(
  filiais: Filial[],
  filialRotulo: string,
  recorte: (l: SaldoItemFiliais) => NumerosDoItem,
  tiposPorItem: Readonly<Record<number, string | null>>,
): ColunaCsv<SaldoItemFiliais>[] {
  return [
    { titulo: 'Item', valor: (l) => l.item },
    { titulo: 'Grupo', valor: (l) => rotuloGrupoItem(l.grupo) },
    { titulo: 'Tipo', valor: (l) => tiposPorItem[l.item_id] ?? '' },
    { titulo: 'Filial', valor: () => filialRotulo },
    { titulo: 'Total', valor: (l) => recorte(l).total },
    { titulo: 'Em estoque', valor: (l) => recorte(l).estoque },
    { titulo: 'Em uso', valor: (l) => emUsoDoSaldo(recorte(l)) },
    { titulo: 'Reservado', valor: (l) => recorte(l).atrelados },
    { titulo: 'Falta', valor: (l) => recorte(l).falta },
    ...filiais.flatMap((f) => [
      {
        titulo: f.nome,
        valor: (l: SaldoItemFiliais) => (l.porFilial[f.id] ?? CELULA_SALDO_ZERO).estoque,
      },
      {
        titulo: `${f.nome} — faltam`,
        valor: (l: SaldoItemFiliais) => (l.porFilial[f.id] ?? CELULA_SALDO_ZERO).falta,
      },
    ]),
    { titulo: 'Fora das colunas', valor: (l) => estoqueForaDasColunas(l, filiais) },
  ]
}

const COLUNAS_HISTORICO: ColunaCsv<LinhaExportHistorico>[] = [
  { titulo: 'Data', valor: (l) => formatDate(l.data) },
  { titulo: 'Tipo', valor: (l) => rotuloTipoLancamento(l.tipo) },
  { titulo: 'Item', valor: (l) => l.item },
  { titulo: 'Grupo', valor: (l) => rotuloGrupoItem(l.grupo) },
  // 19/08/2026 (revisão) — achado F12-W4-03 se repetindo: a coluna emitia
  // `l.quantidade` cru (sempre positivo, exceto no Ajuste) enquanto a tela já
  // usa `qtdComSinal`/`efeitoNoEstoque` para mostrar o efeito na prateleira.
  // Uma Liberação de 3 lia "-3" na tela e "3" no arquivo — quem soma a coluna
  // pra conferir estoque tirava o total com o sinal invertido em saida/reserva.
  // Aqui vai o NÚMERO com sinal (não o texto "+3" da tela, que o Excel não
  // soma): mesma régua de `efeitoNoEstoque` que a tela usa, então as duas
  // views não podem mais divergir.
  { titulo: 'Quantidade (efeito no estoque)', valor: (l) => efeitoNoEstoque(l.tipo, l.quantidade) },
  { titulo: 'Filial', valor: (l) => l.filial },
  { titulo: 'Chamado', valor: (l) => l.chamado },
  { titulo: 'Colaborador', valor: (l) => l.colaborador },
  // F28/ITN-02 — quem LANÇOU (`lancamentos_item.criado_por`). "Colaborador" é
  // quem levou o item; "Autor" é quem registrou o lançamento. Sem os dois, a
  // auditoria do CSV não distingue as duas pessoas.
  { titulo: 'Autor', valor: (l) => l.autor_nome },
  { titulo: 'Observação', valor: (l) => l.observacao },
  { titulo: 'Estorno', valor: (l) => (l.ehEstorno ? 'sim' : 'não') },
]

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function exportarAtivosCSV(filtros: string): Promise<ResultadoExportCsv> {
  const negado = await barrado()
  if (negado) return falha(negado)
  try {
    const params = filtrosAtivos(new URLSearchParams(filtros), await contextoFilial())
    const { linhas, total } = await listarAtivosParaExport(params, CAP_EXPORT)
    return {
      nome: nomeArquivoCsv('ativos', hojeISO()),
      conteudo: gerarCsv(COLUNAS_ATIVOS, linhas),
      total,
      exportadas: linhas.length,
      truncado: linhas.length < total,
    }
  } catch (err) {
    registrarFalha({ escopo: 'exportar.ativos', erro: err })
    return falha('Falha ao exportar os ativos. Tente novamente.')
  }
}

export async function exportarPendenciasCSV(filtros: string): Promise<ResultadoExportCsv> {
  const negado = await barrado()
  if (negado) return falha(negado)
  try {
    const p = new URLSearchParams(filtros)
    const ctx = await contextoFilial()

    // F24 — a aba de conflitos tem fonte e colunas PRÓPRIAS (uma linha por cadastro, com a
    // chave do grupo para os pares ficarem adjacentes no Excel). Sem este desvio, o botão
    // "Exportar CSV" na aba de conflitos baixaria a fila inteira — o mesmo tipo de mentira
    // silenciosa que a exclusão de 'conflito' de `FiltrosPendencias.tipo` já evita no
    // caminho da tela.
    if (texto(p, 'tipo') === 'conflito') {
      const todos = await listarConflitosParaExport({
        filialSlugs: resolverFiliaisSlugs(texto(p, 'filial'), ctx.operador, ctx.filiais),
        q: texto(p, 'q') ?? null,
      })
      // ⚠ O corte é por GRUPO, não por linha. `todos.slice(0, CAP_EXPORT)` podia cair no
      // meio de um par e entregar um conflito com UM lado só — que, ordenado no Excel,
      // se lê como "este aparelho está numa filial apenas", a conclusão oposta à real.
      // `listarConflitosParaExport` já devolve ordenado por chave + filial, então basta
      // fechar o grupo corrente antes de estourar o teto. Um grupo tem no máximo um lado
      // por filial, então nunca há grupo maior que o teto.
      const porGrupo = new Map<string, typeof todos>()
      for (const l of todos) {
        const g = porGrupo.get(l.chave)
        if (g) g.push(l)
        else porGrupo.set(l.chave, [l])
      }
      const linhas: typeof todos = []
      for (const g of porGrupo.values()) {
        if (linhas.length + g.length > CAP_EXPORT) break
        linhas.push(...g)
      }
      return {
        nome: nomeArquivoCsv('conflitos-entre-filiais', hojeISO()),
        conteudo: gerarCsv(COLUNAS_CONFLITOS, linhas),
        total: todos.length,
        exportadas: linhas.length,
        truncado: linhas.length < todos.length,
      }
    }

    const params = filtrosPendencias(p, ctx)
    const { linhas, total } = await listarPendenciasParaExport(params, CAP_EXPORT)
    return {
      nome: nomeArquivoCsv('pendencias', hojeISO()),
      conteudo: gerarCsv(COLUNAS_PENDENCIAS, linhas),
      total,
      exportadas: linhas.length,
      truncado: linhas.length < total,
    }
  } catch (err) {
    registrarFalha({ escopo: 'exportar.pendencias', erro: err })
    return falha('Falha ao exportar as pendências. Tente novamente.')
  }
}

// Saldos por item: reusa a MESMA leitura da tela (`getSaldosPorFilial`, sem
// paginação) e replica em CÓDIGO os filtros `grupo`/`q` — que a página também
// aplica em código, não no banco. A conta do recorte e a de "Em uso" vêm das
// funções puras de `@/lib/itens/lista`, as mesmas que a tabela usa: é o que
// garante, por construção, que arquivo e tela não podem divergir.
export async function exportarItensSaldosCSV(filtros: string): Promise<ResultadoExportCsv> {
  const negado = await barrado()
  if (negado) return falha(negado)
  try {
    const p = new URLSearchParams(filtros)
    const ctx = await contextoFilial()
    const grupoRaw = texto(p, 'grupo')
    const grupo = GRUPO_ITEM_ORDEM.includes(grupoRaw as GrupoItem)
      ? (grupoRaw as GrupoItem)
      : undefined
    const q = (texto(p, 'q') ?? '').toLowerCase()
    const filialIds = filiaisDeItens(p, ctx)

    const [{ itens }, catalogo, tipos] = await Promise.all([
      getSaldosPorFilial(ctx.filiais),
      listarItensAtivos(),
      listarTiposItem(),
    ])

    // As filiais que viram COLUNA: as do recorte quando há um, todas quando não há
    // — exatamente as que a linha expansível da tela lista.
    const filiaisVisiveis =
      filialIds.length > 0 ? ctx.filiais.filter((f) => filialIds.includes(f.id)) : ctx.filiais

    const filtrados = itens.filter(
      (s) => (!grupo || s.grupo === grupo) && (!q || s.item.toLowerCase().includes(q)),
    )

    // O rótulo carimba no arquivo O QUE ele contém. Com multi-seleção ele precisa
    // nomear TODAS as filiais somadas: escrever "Consolidado" (ou o nome de uma
    // delas) num CSV que soma duas é mentira por omissão.
    const rotuloFilial =
      filialIds.length === 0
        ? 'Consolidado'
        : filialIds
            .map((id) => ctx.filiais.find((f) => f.id === id)?.nome ?? `#${id}`)
            .join(' + ')

    const linhas = filtrados.slice(0, CAP_EXPORT)
    return {
      nome: nomeArquivoCsv('itens-saldos', hojeISO()),
      conteudo: gerarCsv(
        colunasSaldosItens(
          filiaisVisiveis,
          rotuloFilial,
          (l) => saldoDoRecorte(l, filialIds),
          tiposPorItemDoCatalogo(catalogo, tipos),
        ),
        linhas,
      ),
      total: filtrados.length,
      exportadas: linhas.length,
      truncado: linhas.length < filtrados.length,
    }
  } catch (err) {
    registrarFalha({ escopo: 'exportar.itens-saldos', erro: err })
    return falha('Falha ao exportar os saldos. Tente novamente.')
  }
}

export async function exportarItensHistoricoCSV(
  filtros: string,
): Promise<ResultadoExportCsv> {
  const negado = await barrado()
  if (negado) return falha(negado)
  try {
    const params = filtrosHistorico(new URLSearchParams(filtros), await contextoFilial())
    const { linhas, total } = await listarHistoricoParaExport(params, CAP_EXPORT)
    return {
      nome: nomeArquivoCsv('itens-historico', hojeISO()),
      conteudo: gerarCsv(COLUNAS_HISTORICO, linhas),
      total,
      exportadas: linhas.length,
      truncado: linhas.length < total,
    }
  } catch (err) {
    registrarFalha({ escopo: 'exportar.itens-historico', erro: err })
    return falha('Falha ao exportar o histórico. Tente novamente.')
  }
}

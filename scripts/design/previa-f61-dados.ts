// OS DADOS DA PRÉVIA F61 — 100% FICTÍCIOS, no mesmo espírito de
// `previa-itens-dados.ts` (F43) e `previa-ficha-dados.ts` (F44).
//
// A regra 2 do `CLAUDE.md` proíbe nome de colaborador real, patrimônio real,
// e-mail real ou nome de filial real em seed, fixture, teste, comentário OU
// SCREENSHOT. Nada aqui toca banco; tudo é determinístico (nenhuma data/hora
// relativa ao momento em que o script roda) — a mesma exigência de
// `previa-itens-dados.ts`, porque o "antes"/"depois" da F61 só compara o mesmo
// catálogo se os dois lados virem do mesmo dado.
//
// FILIAIS: reusa `FILIAIS_PREVIA` de `previa-itens-dados.ts` — as MESMAS cinco
// (Aurora, Bonança, Cerrado Alto, Dunas, Estância Velha do Norte). PESSOAS:
// reusa o time de `previa-ficha-dados.ts` (Fulano de Tal, Ciclano de Souza,
// Beltrano Silva) e acrescenta duas para as tabelas que precisam de mais
// linhas (Sicrano Oliveira, Fulana Pereira). E-MAILS só em domínio fictício
// (`exemplo.test`, reservado pela RFC 2606 para documentação — nunca resolve).

import type { GrupoItem, TipoLancamento, TipoMovimentacao } from '@/lib/dominio'
import type { Filial } from '@/lib/queries/filiais'
import type { ItemAdmin } from '@/lib/queries/itens'
import type { TipoItem, TipoItemAdmin } from '@/lib/queries/tipos-item'
import type { ColaboradorAdmin, ResumoConsolidacao, TextoDeColaborador } from '@/lib/queries/colaboradores'
import type { FilialParaVinculo, UsuarioAdmin } from '@/lib/queries/admin'
import type { EventoAdminLinha } from '@/lib/queries/eventos-admin'
import type { Motivo } from '@/lib/queries/motivos'
import type { ItemCatalogo } from '@/lib/queries/itens'
import type { FilialOpcao } from '@/components/admin/usuarios/cargo-e-filiais'
import type { KitPayload, TipoKit } from '@/lib/validators/kit'
import type { ApelidoDeFilial } from '@/components/admin/filial-apelidos'
import type { ErroImport, CorrecaoImport, GrupoErro } from '@/lib/import'
import type { RegistroImport } from '@/lib/import/parse'
import type { VocabularioCliente } from '@/lib/import/vocabulario'
import type {
  KpisRelatorio,
  LinhaSaida,
  LinhaEntrada,
  LinhaTransferencia,
  MovimentacaoRelatorio,
  LinhaLancamentoItem,
  SaldoItemPeriodo,
  ManutencaoCaso,
  ItemManutencao,
  ItemModelo,
  ModelosPorCategoria,
  ItemReservado,
  ResumoPeriodo,
} from '@/lib/relatorios/tipos'
import type { Periodo } from '@/lib/relatorios/periodo'
import type { MapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import type { SucessoLote } from '@/components/movimentacoes/nova/config'

import { FILIAIS_PREVIA, catalogoDaPrevia, minimosDaPrevia } from './previa-itens-dados'

export { FILIAIS_PREVIA, catalogoDaPrevia, minimosDaPrevia }

// ---------------------------------------------------------------------------
// 0 · O elenco fictício — o MESMO time em toda vitrine
// ---------------------------------------------------------------------------

export const FULANO = 'Fulano de Tal'
export const CICLANO = 'Ciclano de Souza'
export const BELTRANO = 'Beltrano Silva'
export const SICRANO = 'Sicrano Oliveira'
export const FULANA = 'Fulana Pereira'

/** Domínio reservado pela RFC 2606 — nunca resolve, nunca é um e-mail real. */
export const EMAIL_FULANO = 'fulano@exemplo.test'
export const EMAIL_CICLANO = 'ciclano@exemplo.test'
export const EMAIL_BELTRANO = 'beltrano@exemplo.test'

function filialDaPrevia(slug: string): Filial {
  // Mesma técnica de `previa-ficha-dados.ts`: a busca embrulhada numa função
  // devolve `Filial` já estreitado (um `const` de módulo não atravessaria a
  // fronteira de função sem isto, e o `next build`/`tsc` reprovariam com
  // "possibly undefined" em todo consumidor abaixo).
  const filial = FILIAIS_PREVIA.find((f) => f.slug === slug)
  if (!filial) throw new Error(`previa-f61-dados: "${slug}" sumiu de FILIAIS_PREVIA`)
  return filial
}

export const FILIAL_AURORA = filialDaPrevia('aurora')
export const FILIAL_CERRADO_ALTO = filialDaPrevia('cerrado-alto')
export const FILIAL_DUNAS = filialDaPrevia('dunas')

// ---------------------------------------------------------------------------
// 1 · admin-tabelas
// ---------------------------------------------------------------------------

export const TIPOS_ITEM_ADMIN_PREVIA: TipoItemAdmin[] = [
  { id: 1, slug: 'carregador', rotulo: 'Carregador', ativo: true, ordem: 1, itens: 3 },
  { id: 2, slug: 'mochila', rotulo: 'Mochila', ativo: true, ordem: 2, itens: 1 },
  { id: 3, slug: 'mouse', rotulo: 'Mouse', ativo: true, ordem: 3, itens: 1 },
  { id: 4, slug: 'teclado', rotulo: 'Teclado', ativo: true, ordem: 4, itens: 0 },
  { id: 5, slug: 'fone', rotulo: 'Fone de ouvido', ativo: false, ordem: 5, itens: 2 },
]

export const TIPOS_ITEM_ATIVOS_PREVIA: TipoItem[] = TIPOS_ITEM_ADMIN_PREVIA.map((t) => ({
  id: t.id,
  slug: t.slug,
  rotulo: t.rotulo,
  ativo: t.ativo,
  ordem: t.ordem,
}))

export const ITENS_ADMIN_PREVIA: ItemAdmin[] = [
  { id: 100, nome: 'Mouse sem fio', grupo: 'acessorio', ordem: 1, ativo: true, estoque_minimo: 12, lancamentos: 340, tipo_id: 3 },
  { id: 101, nome: 'Carregador de notebook 65 W', grupo: 'acessorio', ordem: 2, ativo: true, estoque_minimo: 8, lancamentos: 210, tipo_id: 1 },
  { id: 102, nome: 'Memória RAM 8 GB DDR4', grupo: 'componente', ordem: 3, ativo: true, estoque_minimo: 10, lancamentos: 58, tipo_id: null },
  { id: 103, nome: 'Adaptador de tomada padrão antigo', grupo: 'acessorio', ordem: 4, ativo: false, estoque_minimo: 0, lancamentos: 0, tipo_id: null },
]

export const COLABORADORES_ADMIN_PREVIA: ColaboradorAdmin[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    nome: FULANO,
    matricula: 'MAT-0001',
    setor: 'Financeiro',
    filial_id: FILIAL_CERRADO_ALTO.id,
    ativo: true,
    nome_chave: 'fulano de tal',
    created_at: '2026-01-10T09:00:00.000Z',
    movimentacoes: 4,
    lancamentos: 2,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    nome: CICLANO,
    matricula: null,
    setor: 'Comercial',
    filial_id: FILIAL_CERRADO_ALTO.id,
    ativo: false,
    nome_chave: 'ciclano de souza',
    created_at: '2025-03-05T14:30:00.000Z',
    movimentacoes: 2,
    lancamentos: 0,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    nome: SICRANO,
    matricula: 'MAT-0044',
    setor: null,
    filial_id: null,
    ativo: true,
    nome_chave: 'sicrano oliveira',
    created_at: '2026-06-01T11:00:00.000Z',
    movimentacoes: 0,
    lancamentos: 0,
  },
]

export const FILIAIS_PARA_VINCULO_PREVIA: FilialParaVinculo[] = FILIAIS_PREVIA.map((f) => ({
  id: f.id,
  nome: f.nome,
  ativo: f.id !== FILIAL_DUNAS.id,
}))

export const USUARIOS_ADMIN_PREVIA: UsuarioAdmin[] = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    nome: BELTRANO,
    email: EMAIL_BELTRANO,
    created_at: '2026-01-05T08:00:00.000Z',
    papel: 'admin',
    ativo: true,
    vinculos: [],
    banido: false,
    ultimoAcesso: '2026-09-15T09:00:00.000Z',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    nome: FULANO,
    email: EMAIL_FULANO,
    created_at: '2026-02-01T08:00:00.000Z',
    papel: 'operador',
    ativo: true,
    vinculos: [FILIAL_CERRADO_ALTO.id, FILIAL_AURORA.id],
    banido: false,
    ultimoAcesso: '2026-09-14T08:30:00.000Z',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000003',
    nome: CICLANO,
    email: EMAIL_CICLANO,
    created_at: '2025-11-20T08:00:00.000Z',
    papel: 'operador',
    ativo: false,
    vinculos: [],
    banido: true,
    ultimoAcesso: '2026-08-20T15:00:00.000Z',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000004',
    nome: null,
    email: null,
    created_at: '2026-08-01T08:00:00.000Z',
    papel: 'consulta',
    ativo: true,
    ultimoAcesso: null,
    vinculos: [],
    banido: null,
  },
]

export const EU_ID_PREVIA = USUARIOS_ADMIN_PREVIA[0].id

export const EVENTOS_ADMIN_PREVIA: EventoAdminLinha[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    quando: '2026-09-01T10:00:00.000Z',
    acao: 'papel_alterado',
    alvo: FULANO,
    detalhe: { de: 'consulta', para: 'operador' },
    autorNome: BELTRANO,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    quando: '2026-08-20T15:30:00.000Z',
    acao: 'usuario_desativado',
    alvo: CICLANO,
    detalhe: null,
    autorNome: BELTRANO,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    quando: '2026-07-15T09:00:00.000Z',
    acao: 'usuario_apagado',
    alvo: 'antigo@exemplo.test',
    detalhe: null,
    // O autor deste evento não existe mais (a trilha sobrevive à exclusão da
    // conta) — o caso que a tabela precisa saber mostrar.
    autorNome: null,
  },
]

export const FILA_CONSOLIDACAO_PREVIA: TextoDeColaborador[] = [
  {
    nome_chave: 'sicrano oliveira',
    grafia_exemplo: 'SICRANO OLIVEIRA',
    ocorrencias: 6,
    grafias: 2,
    filial_id: FILIAL_AURORA.id,
    ja_cadastrado: false,
    colaborador_id: null,
  },
  {
    nome_chave: 'fulana pereira',
    grafia_exemplo: FULANA,
    ocorrencias: 1,
    grafias: 1,
    filial_id: null,
    ja_cadastrado: false,
    colaborador_id: null,
  },
]

export const RESUMO_CONSOLIDACAO_PREVIA: ResumoConsolidacao = {
  gruposPendentes: 2,
  registrosPendentes: 7,
  gruposCadastrados: 3,
  registrosCadastrados: 6,
  truncado: false,
}

// ---------------------------------------------------------------------------
// 2 · admin-dialogos
// ---------------------------------------------------------------------------

export const APELIDOS_FILIAL_PREVIA: ApelidoDeFilial[] = [
  { id: 1, apelido: 'CERRADO' },
  { id: 2, apelido: 'CA' },
]

export const FILIAL_EDIT_PREVIA = {
  id: FILIAL_CERRADO_ALTO.id,
  nome: FILIAL_CERRADO_ALTO.nome,
  slug: FILIAL_CERRADO_ALTO.slug,
  ativo: true,
  cidade: FILIAL_CERRADO_ALTO.cidade,
  totalAtivos: 128,
  apelidos: APELIDOS_FILIAL_PREVIA,
}

export const MOTIVO_EDIT_PREVIA = {
  codigo: 'novo_colaborador',
  rotulo: 'Novo colaborador',
  aplica_a: ['saida', 'emprestimo'] as TipoMovimentacao[],
  ativo: true,
}

export const MOTIVOS_PREVIA: Motivo[] = [
  { codigo: 'novo_colaborador', rotulo: 'Novo colaborador', aplica_a: ['saida', 'emprestimo'] },
  { codigo: 'desligamento', rotulo: 'Desligamento', aplica_a: ['devolucao'] },
  { codigo: 'troca_upgrade', rotulo: 'Troca / upgrade', aplica_a: ['troca'] },
]

export const KIT_EDIT_PREVIA = {
  id: 'd0000000-0000-4000-8000-000000000001',
  nome: 'Kit novo colaborador',
  payload: {
    tipo: 'saida' as TipoKit,
    motivo: 'novo_colaborador',
    termo: 'gerado',
    categorias: ['notebook', 'celular'],
  } as KitPayload,
  ativo: true,
}

export const ITEM_EDIT_PREVIA = {
  id: ITENS_ADMIN_PREVIA[0].id,
  nome: ITENS_ADMIN_PREVIA[0].nome,
  grupo: ITENS_ADMIN_PREVIA[0].grupo,
  ordem: ITENS_ADMIN_PREVIA[0].ordem,
  ativo: ITENS_ADMIN_PREVIA[0].ativo,
  estoque_minimo: ITENS_ADMIN_PREVIA[0].estoque_minimo,
  lancamentos: ITENS_ADMIN_PREVIA[0].lancamentos,
}

export const TIPO_ITEM_EDIT_PREVIA = TIPOS_ITEM_ADMIN_PREVIA[0]

export const COLABORADOR_EDIT_PREVIA = COLABORADORES_ADMIN_PREVIA[0]

export const FILIAIS_OPCAO_PREVIA: FilialOpcao[] = FILIAIS_PREVIA.map((f) => ({
  id: f.id,
  nome: f.nome,
}))

export const EDITAR_USUARIO_PROPS_PREVIA = {
  usuarioId: USUARIOS_ADMIN_PREVIA[1].id,
  nome: FULANO,
  papelAtual: 'operador' as const,
  vinculosAtuais: [FILIAL_CERRADO_ALTO.id, FILIAL_AURORA.id],
  filiais: FILIAIS_OPCAO_PREVIA,
  eVoceMesmo: false,
  autorEDev: false,
  bloqueio: null as string | null,
}

export const CONVIDAR_USUARIO_PROPS_PREVIA = {
  filiais: FILIAIS_OPCAO_PREVIA,
  euPapel: 'admin' as const,
}

// Datas FIXAS — nunca `new Date()`: duas passadas do instrumento no mesmo dia
// (ou em dias diferentes) têm de produzir o MESMO HTML.
export const GERAR_RELATORIO_PROPS_PREVIA = {
  filialSlug: FILIAL_CERRADO_ALTO.slug,
  filialNome: FILIAL_CERRADO_ALTO.nome,
  ehGeral: false,
  padraoDe: '2026-09-07',
  padraoAte: '2026-09-11',
  semanaDe: '2026-09-14',
  semanaAte: '2026-09-18',
  semanaAnteriorDe: '2026-09-07',
  semanaAnteriorAte: '2026-09-11',
  maxData: '2026-09-18',
}

// ---------------------------------------------------------------------------
// 3 · admin-importar
// ---------------------------------------------------------------------------

export const ERROS_BLOQUEANTES_PREVIA: ErroImport[] = [
  { linha: 4, coluna: 'Patrimônio', valor: '', tipo: 'patrimonio_vazio', mensagem: 'Sem patrimônio — importa como pendência.' },
  { linha: 9, coluna: 'Tipo', valor: 'NOTE', tipo: 'categoria', mensagem: 'Categoria fora do vocabulário.' },
]

export const ERROS_AVISO_PREVIA: ErroImport[] = [
  { linha: 12, coluna: 'Site', valor: 'CERRADO', tipo: 'site_desconhecido', mensagem: 'Site fora do vocabulário de filiais.' },
]

export const CORRECOES_APLICADAS_PREVIA: CorrecaoImport[] = [
  { op: 'substituir', campo: 'tipo', de: 'NOTE', para: 'notebook' },
  { op: 'editar', linha: 4, campo: 'patrimonio', para: 'WAP0001244' },
]

export const CORRECOES_POR_OP_PREVIA: number[] = [1, 1]

const REGISTRO_IMPORT_BASE: RegistroImport = {
  linha: 0,
  site: FILIAL_CERRADO_ALTO.nome,
  marca: 'Lenovo',
  tipo: 'NOTEBOOK',
  modelo: 'ThinkPad T14',
  fornecedor: 'Fornecedora Fictícia Ltda',
  serviceTag: 'PREV-SVC-0002',
  patrimonio: 'WAP0001244',
  memoria: '16 GB',
  armazenamento: '512 GB SSD',
  processador: 'Intel Core i5',
  hostname: 'PREVIA-NB-0002',
  dataEntrega: '2026-01-15',
  status: 'Em uso',
  situacao: '',
  dataInclusao: '2026-01-10',
  colaborador: FULANO,
  glpi: '',
  observacao: '',
}

/** `RegistroImport` do CSV — só a linha que o card "sem correção" cita. */
export const CONTEXTO_IMPORT_PREVIA: Record<number, RegistroImport> = {
  0: { ...REGISTRO_IMPORT_BASE, linha: 0 },
}

/** A fatia de CLIENTE do vocabulário (só para exibir — o servidor não usa isto). */
export const VOCABULARIO_CLIENTE_PREVIA: VocabularioCliente = {
  categorias: [
    { categoria: 'notebook', rotulo: 'Notebook' },
    { categoria: 'celular', rotulo: 'Celular' },
  ],
  estados: [
    { estado: 'em_estoque', rotulo: 'Em estoque' },
    { estado: 'em_uso', rotulo: 'Em uso' },
  ],
  prefixosPatrimonio: ['WAP'],
}

/**
 * UM grupo `correcao.kind: 'nenhuma'` — o caso "card informativo, sem ação e
 * sem remoção" (o próprio código de `grupos-erros.tsx` chama assim). É o único
 * `kind` que não depende de `contexto`/`vocabulario` para decidir o que
 * oferecer, e por isso o único que esta prévia constrói: os outros nove
 * (`categoria`, `estado`, `site_desconhecido`, `site_outra_filial`,
 * `existe_em_outra_filial`, `patrimonio`, `patrimonio_vazio`, `duplicata`,
 * `data`, `colaborador`) exigiriam reproduzir o motor de correções inteiro
 * (`lib/import/*`) só para a foto — ver a lista "sem vitrine" no cabeçalho de
 * `previa-f61.tsx`.
 */
export const GRUPOS_ERROS_PREVIA: GrupoErro[] = [
  {
    tipo: 'plano_vazio',
    chave: '',
    linhas: [0],
    erros: [
      {
        linha: 0,
        coluna: '',
        valor: '',
        tipo: 'plano_vazio',
        mensagem: 'Nenhuma linha válida sobrou depois das correções — confira o arquivo.',
      },
    ],
    correcao: { kind: 'nenhuma' },
  },
]

export const TIPOS_AVISO_IMPORT_PREVIA = new Set<string>(['site_desconhecido'])

// ---------------------------------------------------------------------------
// 4 · relatório
// ---------------------------------------------------------------------------

export const PERIODO_PREVIA: Periodo = { de: '2026-09-07', ate: '2026-09-11' }

export const KPIS_PREVIA: KpisRelatorio = {
  total: 420,
  em_uso: 260,
  em_estoque: 90,
  reservado: 12,
  em_manutencao: 8,
  em_triagem: 4,
  defasado: 46,
  emprestado: 6,
}

export const KPIS_ANTERIOR_PREVIA: KpisRelatorio = {
  total: 414,
  em_uso: 250,
  em_estoque: 96,
  reservado: 10,
  em_manutencao: 6,
  em_triagem: 4,
  defasado: 46,
  emprestado: 6,
}

export const LINHAS_SAIDA_PREVIA: LinhaSaida[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    data: '2026-09-08',
    filial: FILIAL_CERRADO_ALTO.nome,
    categoria: 'notebook',
    modelo: 'Lenovo ThinkPad T14',
    patrimonio: 'WAP0001234',
    tipo: 'saida',
    motivo: 'Novo colaborador',
    chamado: '8421',
    colaboradorSetor: `${FULANO} / Financeiro`,
    termo: 'Pendente',
    obs: 'Entregue com carregador e mochila.',
    ativoId: '00000000-0000-4000-8000-000000000001',
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    data: '2026-09-09',
    filial: FILIAL_AURORA.nome,
    categoria: 'celular',
    modelo: 'Samsung Galaxy A54',
    patrimonio: 'WAP0001238',
    tipo: 'emprestimo',
    motivo: 'Viagem a serviço',
    chamado: null,
    colaboradorSetor: `${SICRANO} / Comercial`,
    termo: null,
    obs: null,
    ativoId: '00000000-0000-4000-8000-000000000002',
    estornada: true,
    estornoData: '2026-09-10',
  },
]

export const MAPA_ROTULOS_TIPO_ITEM_PREVIA: MapaRotulosTipo = {
  mouse: 'Mouse',
  carregador: 'Carregador',
  fone: 'Fone de ouvido',
}

export const LINHAS_ENTRADA_PREVIA: LinhaEntrada[] = [
  {
    id: 'e1000000-0000-4000-8000-000000000001',
    data: '2026-09-10',
    filial: FILIAL_CERRADO_ALTO.nome,
    categoria: 'notebook',
    modelo: 'Lenovo ThinkPad T14',
    patrimonio: 'WAP0001241',
    tipo: 'devolucao',
    motivo: 'Desligamento',
    colaborador: CICLANO,
    setor: 'Comercial',
    itensFaltantes: ['mouse', 'carregador'],
    obs: 'Colaborador desligado; dois periféricos não retornaram.',
    ativoId: '00000000-0000-4000-8000-000000000003',
  },
  {
    id: 'e1000000-0000-4000-8000-000000000002',
    data: '2026-09-11',
    filial: FILIAL_DUNAS.nome,
    categoria: 'monitor',
    modelo: 'Dell 24"',
    patrimonio: 'WAP0001236',
    tipo: 'compra',
    motivo: null,
    colaborador: null,
    setor: null,
    itensFaltantes: null,
    obs: null,
  },
]

export const LINHAS_TRANSFERENCIA_PREVIA: LinhaTransferencia[] = [
  {
    id: 'e2000000-0000-4000-8000-000000000001',
    data: '2026-09-09',
    de: FILIAL_AURORA.nome,
    para: FILIAL_CERRADO_ALTO.nome,
    categoria: 'notebook',
    modelo: 'Dell Latitude 5420',
    patrimonio: 'WAP0001237',
    chamado: '8433',
    obs: null,
    ativoId: '00000000-0000-4000-8000-000000000004',
  },
]

export const MOVIMENTACOES_RELATORIO_PREVIA: MovimentacaoRelatorio[] = [
  {
    id: 'e3000000-0000-4000-8000-000000000001',
    data: '2026-09-08',
    tipo: 'saida',
    patrimonio: 'WAP0001234',
    ativo: 'Lenovo ThinkPad T14',
    categoria: 'notebook',
    colaborador_setor: `${FULANO} / Financeiro`,
    filial: FILIAL_CERRADO_ALTO.nome,
    chamado: '8421',
    observacao: null,
  },
]

export const LANCAMENTOS_ITEM_PREVIA: LinhaLancamentoItem[] = [
  {
    id: 'e4000000-0000-4000-8000-000000000001',
    data: '2026-09-08',
    filial: FILIAL_CERRADO_ALTO.nome,
    item: 'Mouse sem fio',
    grupo: 'acessorio',
    tipo: 'saida' as TipoLancamento,
    quantidade: -1,
    chamado: '8421',
    colaborador: FULANO,
    obs: null,
    ehEstorno: false,
  },
  {
    id: 'e4000000-0000-4000-8000-000000000002',
    data: '2026-09-10',
    filial: FILIAL_CERRADO_ALTO.nome,
    item: 'Carregador de notebook 65 W',
    grupo: 'acessorio',
    tipo: 'entrada' as TipoLancamento,
    quantidade: 2,
    chamado: null,
    colaborador: null,
    obs: 'Reposição de estoque.',
    ehEstorno: false,
  },
]

export const SALDOS_ITEM_PERIODO_PREVIA: SaldoItemPeriodo[] = [
  {
    item: 'Mouse sem fio',
    total: 40,
    estoque: 10,
    atrelados: 0,
    falta: 0,
    minimo: 12,
    entradas: 4,
    saidas: 6,
    delta: -2,
    obs: null,
  },
  {
    item: 'Memória RAM 8 GB DDR4',
    total: 20,
    estoque: 2,
    atrelados: 0,
    falta: 1,
    minimo: 10,
    entradas: 0,
    saidas: 3,
    delta: -3,
    obs: 'Estoque abaixo do mínimo.',
  },
]

export const MANUTENCAO_CASOS_PREVIA: ManutencaoCaso[] = [
  {
    patrimonio: 'WAP0001239',
    modelo: 'HP ProBook 440',
    filial: FILIAL_CERRADO_ALTO.nome,
    chamado: '7710',
    chamadoFornecedor: 'FORN-2201',
    dataEnvio: '2026-08-15',
    diasEmManutencao: 33,
    obsEnvio: 'Tela trincada.',
    anotacoes: [{ texto: 'Peça em trânsito do fornecedor.', autor: BELTRANO, em: '2026-08-25T10:00:00.000Z' }],
    retornoData: null,
    retornoObs: null,
    fechado: false,
    ativoId: '00000000-0000-4000-8000-000000000005',
  },
  {
    patrimonio: 'WAP0001240',
    modelo: 'Lenovo ThinkPad E14',
    filial: FILIAL_AURORA.nome,
    chamado: '7699',
    chamadoFornecedor: null,
    dataEnvio: '2026-08-01',
    diasEmManutencao: null,
    obsEnvio: 'Bateria não carrega.',
    anotacoes: [],
    retornoData: '2026-09-05',
    retornoObs: 'Bateria trocada.',
    fechado: true,
    desfecho: 'retorno',
    ativoId: '00000000-0000-4000-8000-000000000006',
  },
]

export const ITENS_MANUTENCAO_PREVIA: ItemManutencao[] = [
  { patrimonio: 'WAP0001239', modelo: 'HP ProBook 440', observacao: 'Tela trincada.' },
]

export const ITENS_MODELO_PREVIA: ItemModelo[] = [
  { modelo: 'Lenovo ThinkPad T14', total: 12 },
  { modelo: 'Dell Latitude 5420', total: 7 },
]

export const MODELOS_POR_CATEGORIA_PREVIA: ModelosPorCategoria[] = [
  { categoria: 'notebook', total: 19, modelos: ITENS_MODELO_PREVIA },
  { categoria: 'celular', total: 5, modelos: [{ modelo: 'Samsung Galaxy A54', total: 5 }] },
]

export const ITENS_RESERVADOS_PREVIA: ItemReservado[] = [
  { patrimonio: 'WAP0001242', modelo: 'Dell Latitude 5420', chamado: '8501' },
  { patrimonio: 'WAP0001243', modelo: 'Dell Latitude 5420', chamado: null },
]

export const RESUMO_PERIODO_PREVIA: ResumoPeriodo = {
  de: '2026-09-07',
  ate: '2026-09-11',
  saidas: {
    total: 6,
    filiais: [
      {
        filial: FILIAL_CERRADO_ALTO.nome,
        total: 4,
        motivos: [
          {
            motivo: 'Novo colaborador',
            total: 3,
            categorias: [{ categoria: 'notebook', total: 2 }, { categoria: 'celular', total: 1 }],
          },
        ],
      },
    ],
  },
  devolucoes: {
    total: 2,
    filiais: [
      {
        filial: FILIAL_CERRADO_ALTO.nome,
        total: 2,
        motivos: [{ motivo: 'Desligamento', total: 2, categorias: [{ categoria: 'notebook', total: 2 }] }],
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// 5 · selos-sucesso
// ---------------------------------------------------------------------------

export const SUCESSO_LOTE_PREVIA: SucessoLote = {
  criadas: 1,
  grupos: [
    {
      tipo: 'saida',
      motivo: 'novo_colaborador',
      ativos: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          patrimonio: 'WAP0001234',
          categoria: 'notebook',
          movimentacaoId: 'e3000000-0000-4000-8000-000000000001',
        },
      ],
    },
  ],
  avisoRegularizacao: 'A mochila que foi junto entrou no estoque por acerto automático.',
}

// ---------------------------------------------------------------------------
// 6 · filtros
// ---------------------------------------------------------------------------

export const ITENS_CATALOGO_PREVIA: ItemCatalogo[] = catalogoDaPrevia().map((i) => ({
  id: i.id,
  nome: i.nome,
  grupo: i.grupo as GrupoItem,
  estoque_minimo: i.estoque_minimo,
  tipo_id: i.tipo_id,
}))

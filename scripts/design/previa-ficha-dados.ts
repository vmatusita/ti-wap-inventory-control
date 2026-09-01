// OS DADOS DA PRÉVIA DA FICHA (`/ativos/[id]`) — 100% FICTÍCIOS, no mesmo
// espírito de `previa-itens-dados.ts` (F43/F44).
//
// A regra 2 do `CLAUDE.md` proíbe nome de colaborador real, patrimônio real ou
// linha das planilhas da WAP em seed, fixture, teste, comentário OU SCREENSHOT.
// Este catálogo é inventado aqui, determinístico (nenhuma data/hora relativa ao
// momento em que o script roda), e nunca toca o banco.
//
// FILIAL: reusa `FILIAIS_PREVIA` de `previa-itens-dados.ts` — as MESMAS cinco
// filiais inventadas da F43, para as duas prévias nunca contarem histórias de
// filial divergentes. O ativo mora em Cerrado Alto (id 3): é a filial do MEIO da
// lista, não a primeira — mesmo cuidado de `previa-itens-dados.ts` para o recorte
// não colar acidentalmente no primeiro caso possível.
//
// PESSOAS FICTÍCIAS: "Fulano de Tal" (com o ativo hoje) e "Ciclano de Souza" (o
// colaborador anterior, que devolveu o equipamento no desligamento — e não levou
// de volta três acessórios, a origem das pendências de item abertas). "Beltrano
// Silva" é quem opera o sistema (autor das movimentações, autor da anotação, e o
// operador que a prévia empresta ao render).
//
// A HISTÓRIA CONTADA (para as pendências e a linha do tempo fazerem sentido
// juntas): o notebook foi comprado, saiu para o Ciclano, voltou no desligamento
// dele SEM três periféricos (mouse, carregador, fone — dois ficam em aberto, um é
// recuperado depois), e saiu de novo para o Fulano, que é quem está com ele hoje.
// A prévia NÃO monta vínculo de sucessão (`substitui_ativo_id`): é o caso comum
// (a maioria dos ativos não tem par), e os dois blocos condicionais que dependem
// dele (o card de vínculo e a seção "Histórico do ativo substituído") continuam
// copiados em `previa-ficha.tsx` — só não renderizam nesta prévia, exatamente como
// não renderizam na ficha real de um ativo sem vínculo.

import type { AtivoFicha, AnotacaoTimeline } from '@/lib/queries/ativos'
import type { MovimentacaoTimeline, SnapshotAnterior } from '@/lib/queries/movimentacoes'
import type { TermoGerado } from '@/lib/queries/termos'
import type { PendenciaItemFicha } from '@/lib/queries/pendencias-item'
import type { ItemQueFoiJunto } from '@/lib/queries/itens'
import type { TipoItem } from '@/lib/queries/tipos-item'
import { mapaRotulosTipo, type MapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import type { Operador } from '@/lib/auth/acesso'

import { FILIAIS_PREVIA } from './previa-itens-dados'

/** Cenários que a prévia da ficha sabe fotografar (`--cenarios`). */
export type CenarioFicha = 'padrao' | 'sem-pendencia' | 'consulta'

// A filial do ativo — a MESMA lista fictícia da prévia de /itens (F43), nunca
// duas listas de filial inventada divergindo entre as prévias do produto.
const FILIAL_DA_FICHA = FILIAIS_PREVIA.find((f) => f.slug === 'cerrado-alto')
if (!FILIAL_DA_FICHA) {
  throw new Error('previa-ficha-dados: "cerrado-alto" sumiu de FILIAIS_PREVIA')
}

/** O id do ativo fotografado — o MESMO que a rota do `Ambiente` declara. */
export const ATIVO_ID_PREVIA = '00000000-0000-4000-8000-000000000001'

const NOME_DETENTOR_ATUAL = 'Fulano de Tal'
const NOME_DETENTOR_ANTERIOR = 'Ciclano de Souza'
const NOME_OPERADOR = 'Beltrano Silva'

// Ids das quatro movimentações da história — fixos, para o "antes"/"depois" de
// uma futura passada do script compararem o mesmo catálogo.
const MOV_COMPRA = '10000000-0000-4000-8000-000000000001'
const MOV_SAIDA_CICLANO = '10000000-0000-4000-8000-000000000002'
const MOV_DEVOLUCAO = '10000000-0000-4000-8000-000000000003'
const MOV_SAIDA_FULANO = '10000000-0000-4000-8000-000000000004'

/** O ativo da ficha — todos os campos de `ativos` (o tipo é a fonte, não palpite). */
export function ativoDaPrevia(): AtivoFicha {
  return {
    id: ATIVO_ID_PREVIA,
    patrimonio: 'WAP0001234',
    service_tag: 'PREV-SVC-0001',
    categoria: 'notebook',
    marca: 'Lenovo',
    modelo: 'ThinkPad T14',
    memoria: '16 GB DDR4',
    armazenamento: '512 GB SSD',
    processador: 'Intel Core i5-1135G7',
    hostname: 'PREVIA-NB-0001',
    telefone: null,
    imei: null,
    pulsus: null,
    status: 'em_uso',
    colaborador_atual: NOME_DETENTOR_ATUAL,
    setor_atual: 'Financeiro',
    filial_id: FILIAL_DA_FICHA.id,
    fornecedor: 'Fornecedora Fictícia Ltda',
    origem: 'compra direta',
    patrimonio_original: null,
    // O CARD DE PENDÊNCIA EM DESTAQUE (`ativo.pendencia`, texto livre) — sempre
    // presente nesta prévia, nos três cenários: o campo é independente da fila
    // de pendências de item que `--cenarios sem-pendencia` esvazia.
    pendencia: 'nota fiscal da compra pendente de anexação',
    substitui_ativo_id: null,
    termo_assinado: 'sim',
    termo_data: '2026-08-25',
    observacoes:
      'Ativo fictício usado só na prévia de design da ficha (F44) — nenhum dado real.',
    created_at: '2025-02-10T13:00:00.000Z',
    updated_at: '2026-08-25T10:00:00.000Z',
    filial_nome: FILIAL_DA_FICHA.nome,
    filial_slug: FILIAL_DA_FICHA.slug,
  }
}

// Os quatro "snapshot_anterior" da história, na ordem em que as movimentações
// aconteceram (a coluna que `EstornarDialog` usaria para restaurar o estado).
const SNAPSHOT_ANTES_DA_COMPRA: SnapshotAnterior | null = null
const SNAPSHOT_ANTES_DA_SAIDA_CICLANO: SnapshotAnterior = {
  status: 'em_estoque',
  colaborador: null,
  setor: null,
  filial_id: FILIAL_DA_FICHA.id,
}
const SNAPSHOT_ANTES_DA_DEVOLUCAO: SnapshotAnterior = {
  status: 'em_uso',
  colaborador: NOME_DETENTOR_ANTERIOR,
  setor: 'Comercial',
  filial_id: FILIAL_DA_FICHA.id,
}
const SNAPSHOT_ANTES_DA_SAIDA_FULANO: SnapshotAnterior = {
  status: 'em_estoque',
  colaborador: null,
  setor: null,
  filial_id: FILIAL_DA_FICHA.id,
}

/**
 * A linha do tempo — 4 movimentações (compra, saída, devolução, saída), na MESMA
 * ordem "mais recente primeiro" que `listarMovimentacoesDoAtivo` devolve do
 * banco: é dessa ordem que `respMov`/`devolMov` (o primeiro `.find()` de cada um,
 * em `previa-ficha.tsx`) dependem para achar a saída e a devolução certas.
 *
 * A devolução carrega `itens_faltantes` — os TRÊS periféricos que não voltaram
 * com o Ciclano, a mesma origem das pendências de item de `pendenciasItemDaPrevia`.
 */
export function movimentacoesDaPrevia(): MovimentacaoTimeline[] {
  return [
    {
      id: MOV_SAIDA_FULANO,
      tipo: 'saida',
      motivo: 'novo_colaborador',
      data: '2026-08-25',
      colaborador: NOME_DETENTOR_ATUAL,
      setor: 'Financeiro',
      chamado: null,
      chamado_fornecedor: null,
      status_anterior: 'em_estoque',
      status_resultante: 'em_uso',
      itens_faltantes: null,
      observacao: null,
      estorno_de: null,
      snapshot_anterior: SNAPSHOT_ANTES_DA_SAIDA_FULANO,
      created_at: '2026-08-25T10:00:00.000Z',
      forcado: false,
      autor_nome: NOME_OPERADOR,
      filial_origem_nome: null,
      filial_destino_nome: null,
    },
    {
      id: MOV_DEVOLUCAO,
      tipo: 'devolucao',
      motivo: 'desligamento',
      data: '2025-08-20',
      colaborador: NOME_DETENTOR_ANTERIOR,
      setor: 'Comercial',
      chamado: null,
      chamado_fornecedor: null,
      status_anterior: 'em_uso',
      status_resultante: 'em_estoque',
      itens_faltantes: ['mouse', 'carregador', 'fone'],
      observacao: 'Colaborador desligado; os itens abaixo não retornaram com o equipamento.',
      estorno_de: null,
      snapshot_anterior: SNAPSHOT_ANTES_DA_DEVOLUCAO,
      created_at: '2025-08-20T09:15:00.000Z',
      forcado: false,
      autor_nome: NOME_OPERADOR,
      filial_origem_nome: null,
      filial_destino_nome: null,
    },
    {
      id: MOV_SAIDA_CICLANO,
      tipo: 'saida',
      motivo: 'novo_colaborador',
      data: '2025-03-05',
      colaborador: NOME_DETENTOR_ANTERIOR,
      setor: 'Comercial',
      chamado: null,
      chamado_fornecedor: null,
      status_anterior: 'em_estoque',
      status_resultante: 'em_uso',
      itens_faltantes: null,
      observacao: null,
      estorno_de: null,
      snapshot_anterior: SNAPSHOT_ANTES_DA_SAIDA_CICLANO,
      created_at: '2025-03-05T14:30:00.000Z',
      forcado: false,
      autor_nome: NOME_OPERADOR,
      filial_origem_nome: null,
      filial_destino_nome: null,
    },
    {
      id: MOV_COMPRA,
      tipo: 'compra',
      motivo: null,
      data: '2025-02-10',
      colaborador: null,
      setor: null,
      chamado: null,
      chamado_fornecedor: null,
      status_anterior: null,
      status_resultante: 'em_estoque',
      itens_faltantes: null,
      observacao: null,
      estorno_de: null,
      snapshot_anterior: SNAPSHOT_ANTES_DA_COMPRA,
      created_at: '2025-02-10T13:00:00.000Z',
      forcado: false,
      autor_nome: NOME_OPERADOR,
      filial_origem_nome: null,
      filial_destino_nome: null,
    },
  ]
}

/** Uma anotação avulsa na linha do tempo. */
export function anotacoesDaPrevia(): AnotacaoTimeline[] {
  return [
    {
      id: '20000000-0000-4000-8000-000000000001',
      texto: 'Aguardando a nota fiscal da compra para anexar ao processo.',
      autor_nome: NOME_OPERADOR,
      created_at: '2025-02-12T09:00:00.000Z',
    },
  ]
}

/** codigo → rotulo, no formato que a ficha monta a partir de `listarMotivos()`. */
export function motivosDaPrevia(): Record<string, string> {
  return {
    novo_colaborador: 'Novo colaborador',
    desligamento: 'Desligamento',
  }
}

/** Um termo de responsabilidade já gerado, cobrindo a saída atual (Fulano). */
export function termosDaPrevia(): TermoGerado[] {
  return [
    {
      id: '30000000-0000-4000-8000-000000000001',
      tipo: 'responsabilidade_notebook',
      colaborador: NOME_DETENTOR_ATUAL,
      arquivo_path: 'previa/termos-ficticios/responsabilidade-notebook.docx',
      dados: {
        colaborador: NOME_DETENTOR_ATUAL,
        marca: 'Lenovo',
        modelo: 'ThinkPad T14',
        patrimonio: 'WAP0001234',
        service_tag: 'PREV-SVC-0001',
        cidade: 'Cerrado Alto',
        data: '25/08/2026',
      },
      movimentacao_ids: [MOV_SAIDA_FULANO],
      ativo_ids: [ATIVO_ID_PREVIA],
      created_at: '2026-08-25T11:00:00.000Z',
      atualizado_em: '2026-08-25T11:00:00.000Z',
      gerado_por_nome: NOME_OPERADOR,
    },
  ]
}

/**
 * As pendências de item da ficha — DUAS abertas (mouse, carregador) e UMA
 * resolvida (fone, recuperado depois). É o caso que a F44 precisa medir: a
 * pendência aberta continua perceptível na tela?
 *
 * `--cenarios sem-pendencia` esvazia esta lista — o bloco inteiro some da ficha
 * (mesmo comportamento de `PendenciasItemFicha`, que devolve `null` sem linhas).
 */
export function pendenciasItemDaPrevia(cenario: CenarioFicha): PendenciaItemFicha[] {
  if (cenario === 'sem-pendencia') return []
  return [
    {
      id: '40000000-0000-4000-8000-000000000001',
      item: 'mouse',
      colaborador: NOME_DETENTOR_ANTERIOR,
      desde: '2025-08-20',
      status: 'aberta',
      desfecho: null,
      observacao: null,
      resolvidaEm: null,
      resolvidaPorNome: null,
    },
    {
      id: '40000000-0000-4000-8000-000000000002',
      item: 'carregador',
      colaborador: NOME_DETENTOR_ANTERIOR,
      desde: '2025-08-20',
      status: 'aberta',
      desfecho: null,
      observacao: null,
      resolvidaEm: null,
      resolvidaPorNome: null,
    },
    {
      id: '40000000-0000-4000-8000-000000000003',
      item: 'fone',
      colaborador: NOME_DETENTOR_ANTERIOR,
      desde: '2025-08-20',
      status: 'resolvida',
      desfecho: 'recuperado',
      observacao: 'Encontrado na gaveta do antigo posto do colaborador.',
      resolvidaEm: '2025-09-02T10:00:00.000Z',
      resolvidaPorNome: NOME_OPERADOR,
    },
  ]
}

/**
 * "Itens que foram junto" com a saída atual (Fulano) — TRÊS linhas, uma delas
 * com `regularizacao: true` (o acerto automático da F41/F42).
 *
 * `--cenarios sem-pendencia` esvazia esta lista também — o cartão inteiro some
 * (`ItensQueForamJunto` devolve `null` sem linhas), exatamente como o das
 * pendências.
 */
export function itensJuntoDaPrevia(cenario: CenarioFicha): ItemQueFoiJunto[] {
  if (cenario === 'sem-pendencia') return []
  return [
    {
      id: '50000000-0000-4000-8000-000000000001',
      item: 'Mouse sem fio',
      tipo: 'saida',
      quantidade: 1,
      data: '2026-08-25',
      movimentacao_id: MOV_SAIDA_FULANO,
      regularizacao: false,
    },
    {
      id: '50000000-0000-4000-8000-000000000002',
      item: 'Carregador de notebook 65 W',
      tipo: 'saida',
      quantidade: 1,
      data: '2026-08-25',
      movimentacao_id: MOV_SAIDA_FULANO,
      regularizacao: false,
    },
    {
      id: '50000000-0000-4000-8000-000000000003',
      item: 'Mochila para notebook',
      tipo: 'saida',
      quantidade: 1,
      data: '2026-08-25',
      movimentacao_id: MOV_SAIDA_FULANO,
      // O acerto automático (F41/F42) — o selo "regularizado" da ficha.
      regularizacao: true,
    },
  ]
}

// O catálogo de tipos de item fictício — os SETE slugs históricos (mesmos de
// `tipos-item-sql.test.ts`), para o fallback pelo slug cru nunca precisar entrar
// em ação nesta prévia.
const TIPOS_ITEM_PREVIA: TipoItem[] = [
  { id: 1, slug: 'carregador', rotulo: 'Carregador', ativo: true, ordem: 1 },
  { id: 2, slug: 'mochila', rotulo: 'Mochila', ativo: true, ordem: 2 },
  { id: 3, slug: 'mouse', rotulo: 'Mouse', ativo: true, ordem: 3 },
  { id: 4, slug: 'teclado', rotulo: 'Teclado', ativo: true, ordem: 4 },
  { id: 5, slug: 'mousepad', rotulo: 'Mousepad', ativo: true, ordem: 5 },
  { id: 6, slug: 'fone', rotulo: 'Fone de ouvido', ativo: true, ordem: 6 },
  { id: 7, slug: 'cabo', rotulo: 'Cabo', ativo: true, ordem: 7 },
]

/** slug → rótulo, pelo MESMO `mapaRotulosTipo` que a página real chama. */
export function rotulosTipoDaPrevia(): MapaRotulosTipo {
  return mapaRotulosTipo(TIPOS_ITEM_PREVIA)
}

/**
 * O operador logado que a prévia empresta ao render — só o recorte que
 * `podeEscreverNaFilial`/`eAdmin` leem (cargo + filiais de escrita).
 *
 * `--cenarios consulta` troca o cargo para `consulta` (sem filial de escrita
 * nenhuma) — é o que faz `podeEscreverNaFilial` fechar e a ficha trocar a barra
 * de ações pelo card "você só lê nesta filial".
 */
export function operadorDaPrevia(cenario: CenarioFicha): Operador {
  if (cenario === 'consulta') {
    return {
      id: '60000000-0000-4000-8000-000000000001',
      nome: NOME_OPERADOR,
      papel: 'consulta',
      filiaisEscrita: [],
      email: null,
    }
  }
  return {
    id: '60000000-0000-4000-8000-000000000001',
    nome: NOME_OPERADOR,
    papel: 'operador',
    filiaisEscrita: [FILIAL_DA_FICHA.id],
    email: null,
  }
}

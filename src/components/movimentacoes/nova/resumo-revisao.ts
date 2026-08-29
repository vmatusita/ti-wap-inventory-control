// MOV-02 — o que o passo 3 (Revisão) vai gravar, num só card, ANTES da tabela
// de ativos. Antes o passo 3 repetia a mesma "Movimentação"/"Destino / Motivo"
// em N linhas (uma por ativo) e a DATA não aparecia em lugar nenhum — com os
// chips Hoje/Ontem (F9) o lançamento retroativo virou rotina, e a revisão que
// devia flagrar a data errada simplesmente não a mostrava.
//
// Módulo puro (sem React, como `config.ts`/`troca-upgrade.ts`): recebe tudo
// por parâmetro, não lê `Date.now()`/`window`. `passo-revisao.tsx` só desenha
// a lista que sai daqui.
import {
  campoAplica,
  type CampoMovimentacao,
} from '@/lib/validators/movimentacao'
import {
  rotuloStatus,
  rotuloTermo,
  rotuloTipo,
  type StatusAtivo,
} from '@/lib/dominio'
import { rotuloTipoItem, type MapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import { formatDate } from '@/lib/format'
import type { Config } from '@/components/movimentacoes/nova/config'
import type { Filial } from '@/lib/queries/filiais'
import type { Motivo } from '@/lib/queries/motivos'

// Uma linha do card de resumo. `destaque` é só a DATA (é o ponto do item) —
// o componente decide o realce visual, este módulo só marca o candidato.
export type ItemResumo = {
  rotulo: string
  valor: string
  destaque?: boolean
}

export type ContextoResumoConfig = {
  // Vem de estado à parte do form (não da Config) — só o `ajuste` usa, e só
  // na metade PRINCIPAL: a contrapartida da troca nunca é `ajuste`, então
  // quem monta o resumo dela passa ''.
  statusResultante: string
  filiais: Filial[]
  motivos: Motivo[]
  // F39 — o vocabulário dos itens faltantes vem do catálogo `tipos_item`, não
  // mais de constante do código. Chega por parâmetro como `filiais` e `motivos`,
  // pela mesma razão: o módulo é puro e não lê banco.
  rotulosTipo: MapaRotulosTipo
}

// Um campo aplica E tem valor não-vazio? Gate único para não virar mural de
// travessões (campo vazio/não aplicável ao TIPO simplesmente não entra).
function aplicaComValor(
  tipo: Config['tipo'],
  campo: CampoMovimentacao,
  valor: string,
): boolean {
  return campoAplica(tipo, campo) && valor.trim() !== ''
}

// Ordem de leitura (fixada pelo item MOV-02): Data (destaque), Movimentação,
// Motivo, Colaborador/Setor, Filial destino, Termo + data do termo, Chamado,
// Chamado do fornecedor, Observação, Status novo, itens faltantes.
export function montarResumoConfig(
  config: Config,
  { statusResultante, filiais, motivos, rotulosTipo }: ContextoResumoConfig,
): ItemResumo[] {
  const tipo = config.tipo
  const itens: ItemResumo[] = []

  // Data — sempre presente na prática (configPadrao já a preenche com
  // hojeISO()), mas o módulo é defensivo: config vazia não inventa uma linha.
  if (config.data) {
    itens.push({ rotulo: 'Data', valor: formatDate(config.data), destaque: true })
  }

  if (tipo) {
    itens.push({ rotulo: 'Movimentação', valor: rotuloTipo(tipo) })
  }

  if (aplicaComValor(tipo, 'motivo', config.motivo)) {
    // Rótulo do motivo vem do CATÁLOGO (o admin pode renomeá-lo) — mesmo
    // padrão de `resumoDestino` (passo-revisao.tsx, agora substituído por
    // este módulo): busca por código, cai no próprio código se não achar.
    const m = motivos.find((x) => x.codigo === config.motivo)
    itens.push({ rotulo: 'Motivo', valor: m?.rotulo ?? config.motivo })
  }

  if (
    aplicaComValor(tipo, 'colaborador', config.colaborador) ||
    aplicaComValor(tipo, 'setor', config.setor)
  ) {
    const partes = [config.colaborador, config.setor].filter((v) => v.trim() !== '')
    if (partes.length > 0) {
      itens.push({ rotulo: 'Colaborador / Setor', valor: partes.join(' · ') })
    }
  }

  if (aplicaComValor(tipo, 'filial_destino', config.filialDestinoId)) {
    const f = filiais.find((x) => String(x.id) === config.filialDestinoId)
    if (f) itens.push({ rotulo: 'Filial destino', valor: f.nome })
  }

  if (
    campoAplica(tipo, 'termo') &&
    (config.termo.trim() !== '' || config.termoData.trim() !== '')
  ) {
    const partes: string[] = []
    if (config.termo) partes.push(rotuloTermo(config.termo))
    if (config.termoData) partes.push(formatDate(config.termoData))
    itens.push({ rotulo: 'Termo', valor: partes.join(' · ') })
  }

  if (aplicaComValor(tipo, 'chamado', config.chamado)) {
    itens.push({ rotulo: 'Chamado', valor: config.chamado })
  }

  if (aplicaComValor(tipo, 'chamado_fornecedor', config.chamadoFornecedor)) {
    itens.push({ rotulo: 'Chamado do fornecedor', valor: config.chamadoFornecedor })
  }

  if (config.observacao.trim() !== '') {
    itens.push({ rotulo: 'Observação', valor: config.observacao })
  }

  if (
    campoAplica(tipo, 'status_resultante') &&
    statusResultante.trim() !== ''
  ) {
    itens.push({
      rotulo: 'Status novo',
      valor: rotuloStatus(statusResultante as StatusAtivo),
    })
  }

  // Checklist (array, não texto) — não cabe em `aplicaComValor`.
  if (campoAplica(tipo, 'itens_faltantes') && config.itensFaltantes.length > 0) {
    itens.push({
      rotulo: 'Itens faltantes',
      valor: config.itensFaltantes.map((c) => rotuloTipoItem(c, rotulosTipo)).join(', '),
    })
  }

  return itens
}

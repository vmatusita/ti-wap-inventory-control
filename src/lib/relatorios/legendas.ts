import { STATUS_ORDEM, type StatusAtivo } from '@/lib/dominio'
import { MANUTENCAO_ALERTA_DIAS, manutencaoEmAlerta } from '@/lib/relatorios/manutencao-alerta'
import type { ManutencaoCaso } from '@/lib/relatorios/tipos'

// Textos das legendas explicativas do relatório (OS-F17, Frente B). PURO e TESTADO.
//
// Por que aqui: o leitor mais importante do relatório — o VISUALIZADOR por senha —
// não acessa /ajuda (rota de operador). Toda a semântica visual das F14–F16 (Δ
// colorido, linha estornada esmaecida, badges de manutenção em 4 cores, pílula
// "Troca") chegava a ele sem explicação. As legendas moram DENTRO do relatório, no
// ao vivo e nos snapshots (inclusive antigos: legenda é render, não dado). Os TEXTOS
// ficam centralizados aqui (constantes + funções puras) — nada de string repetida em
// cinco componentes — e o `legendas.test.ts` trava a cobertura do glossário.

// ============================================================================
// B1 — Δ dos KPIs
// ============================================================================
// A cor do Δ carrega o juízo por indicador (ver SENTIDO_KPI em delta-kpi.ts); a
// seta ▲▼ nunca deixa a cor ser o único canal. Renderizada só onde há Δ na tela.
export const LEGENDA_DELTA =
  'Δ = variação frente ao período anterior. A seta ▲▼ mostra a direção; a cor mostra o juízo por indicador: verde = melhorou, vermelho = piorou, cinza = neutro (ex.: em "Em manutenção", subir é vermelho).'

// ============================================================================
// B2 — estorno nas tabelas detalhadas
// ============================================================================
// Comunicação honesta do achado F16 §3: a contagem do período NÃO muda — a linha
// original segue contada; só ganha o sinal visual.
export const LEGENDA_ESTORNO =
  'Linha esmaecida (marca "estornada") = movimentação estornada depois. A contagem do período continua incluindo a movimentação original.'

// Tabela de movimentações de itens: além do "estornada", há o par com "(estorno)"
// (o lançamento que desfez outro).
export const LEGENDA_ESTORNO_ITENS =
  'Linha esmaecida (marca "estornada") = lançamento estornado depois; "(estorno)" marca o lançamento que desfez outro. A contagem do período continua incluindo o lançamento original.'

// B5 — nota contextual da pílula "Troca" (teal) nas Entradas. O significado só morava
// no /ajuda (rota de operador); o viewer por senha não o via. Condicional a haver troca.
export const LEGENDA_TROCA =
  '"Troca" (pílula teal) = equipamento substituto entregue pelo fornecedor no lugar de um devolvido — é entrada real, mas não foi comprado.'

// ============================================================================
// B3 — badges de manutenção (card "Em manutenção, caso a caso")
// ============================================================================
// Espelha EXATAMENTE as 4 cores de manutencao-casos.tsx. O `classe` é o "ponto" da
// legenda no mesmo matiz do badge; o "30" vem de MANUTENCAO_ALERTA_DIAS (fonte única).
export type CorManutencao = 'amber' | 'red' | 'green' | 'slate'
export type LegendaManutencaoItem = { cor: CorManutencao; classe: string; texto: string }

export const LEGENDA_MANUTENCAO: readonly LegendaManutencaoItem[] = [
  { cor: 'amber', classe: 'bg-amber-100 dark:bg-amber-900', texto: 'em manutenção (em andamento)' },
  { cor: 'red', classe: 'bg-red-100 dark:bg-red-900', texto: `parado há ${MANUTENCAO_ALERTA_DIAS}+ dias` },
  { cor: 'green', classe: 'bg-green-100 dark:bg-green-900', texto: 'voltou ao estoque' },
  {
    cor: 'slate',
    classe: 'bg-slate-200 dark:bg-slate-700',
    texto: 'devolvido ao fornecedor (sem conserto — o substituto, quando houve, entra nas Entradas como "Troca")',
  },
]

// Subconjunto de campos de um caso que decide a cor do badge (o card usa os mesmos).
type CasoParaCor = Pick<ManutencaoCaso, 'desfecho' | 'fechado' | 'diasEmManutencao'>

// Qual das 4 cores um caso exibe — ESPELHO da árvore de decisão de manutencao-casos.tsx
// (a ordem importa: `devolvido_fornecedor` vence `fechado`). `null` = caso aberto sem
// dias conhecidos (o card não mostra badge nenhum).
export function corDoCaso(c: CasoParaCor): CorManutencao | null {
  if (c.desfecho === 'devolvido_fornecedor') return 'slate'
  if (c.fechado) return 'green'
  if (c.diasEmManutencao != null) return manutencaoEmAlerta(c) ? 'red' : 'amber'
  return null
}

// Só as entradas da legenda cujas cores APARECEM nos casos exibidos (legenda
// condicional — princípio da ordem: "condicionais quando o gatilho é condicional").
// Preserva a ordem canônica de LEGENDA_MANUTENCAO.
export function legendaManutencaoPresente(
  casos: readonly CasoParaCor[],
): LegendaManutencaoItem[] {
  const presentes = new Set<CorManutencao>()
  for (const c of casos) {
    const cor = corDoCaso(c)
    if (cor) presentes.add(cor)
  }
  return LEGENDA_MANUTENCAO.filter((l) => presentes.has(l.cor))
}

// ============================================================================
// B4 — "Como ler este relatório" (glossário)
// ============================================================================
export type VerbeteRelatorio = {
  termo: string
  definicao: string
  // Quando o verbete corresponde a um status do ativo — a `status` trava a cobertura
  // no teste (todo status de STATUS_ORDEM visível no relatório tem verbete).
  status?: StatusAtivo
}

// O glossário do relatório. Os verbetes de status cobrem TODO o STATUS_ORDEM (o teste
// falha se um valor novo do enum entrar sem verbete); os demais explicam o que conta
// como Saída/Entrada/Transferência, o estoque as-of e o estorno.
export function glossarioRelatorio(): VerbeteRelatorio[] {
  return [
    {
      termo: 'Total de ativos',
      definicao:
        'Todos os equipamentos com patrimônio no inventário (a soma de todas as situações abaixo).',
    },
    {
      termo: 'Em uso',
      status: 'em_uso',
      definicao: 'Entregue e em uso por um colaborador ou setor.',
    },
    {
      termo: 'Em estoque (Guardados)',
      status: 'em_estoque',
      definicao:
        'Disponível na prateleira da TI, pronto para entrega. No grupo "Equipamentos principais" aparece como "Guardados" — é o mesmo número, com outro nome.',
    },
    {
      termo: 'Reservado',
      status: 'reservado',
      definicao: 'Separado para um colaborador ou finalidade, aguardando a entrega.',
    },
    {
      termo: 'Emprestado',
      status: 'emprestado',
      definicao: 'Cedido em caráter temporário — espera-se a devolução.',
    },
    {
      termo: 'Em triagem',
      status: 'em_triagem',
      // F34 — a triagem deixou de ser passo automático da devolução (que
      // agora resulta em_estoque direto); só entra aqui quem foi separado de
      // propósito, por um "Envio para triagem" manual.
      definicao: 'Separado manualmente para conferência antes de voltar ao estoque.',
    },
    {
      termo: 'Em manutenção',
      status: 'em_manutencao',
      definicao: 'Em conserto ou assistência técnica.',
    },
    {
      termo: 'Reserva técnica (Defasado)',
      status: 'defasado',
      definicao:
        'Equipamento obsoleto / fim de vida útil, ainda em posse da WAP como reserva — não é mais distribuído.',
    },
    {
      termo: 'Descartado',
      status: 'descartado',
      definicao: 'Baixado em definitivo. Sai do estoque (não entra na foto do último dia).',
    },
    {
      termo: 'Devolvido ao fornecedor',
      status: 'devolvido_fornecedor',
      definicao:
        'O fornecedor ficou com o equipamento (a manutenção não teve conserto). Baixa terminal; o substituto, quando houve, entra nas Entradas como "Troca".',
    },
    {
      termo: 'Saída',
      definicao: 'O que saiu para as pessoas no período: saídas (entrega definitiva) + empréstimos.',
    },
    {
      termo: 'Entrada',
      definicao:
        'O que entrou no período: devoluções + compras + trocas. Troca = substituto entregue pelo fornecedor no lugar do devolvido — não é uma compra.',
    },
    {
      termo: 'Transferência',
      definicao:
        'Mudança de filial de um ativo. Aparece nas DUAS filiais envolvidas (a de origem e a de destino).',
    },
    {
      termo: 'Estoque no último dia do período',
      definicao:
        'A foto do estoque na data final do período (as-of), reconstruída pela linha do tempo — não é a soma das movimentações.',
    },
    {
      termo: 'Estorno',
      definicao:
        'Desfaz a última movimentação de um ativo e restaura o estado anterior (spec §8, regra 6). A linha original fica esmaecida nas tabelas, mas a contagem do período continua incluindo-a.',
    },
    {
      // F32/RV-04 — o microssinal "foto × período" (chip em CardRelatorio,
      // ver src/lib/relatorios/janela-card.ts). Verbete novo ao FIM da lista
      // de propósito: não é status nem tipo de movimentação, é a chave de
      // leitura do relatório inteiro.
      termo: 'Foto × período',
      definicao:
        'Chip cinza "foto de dd/MM" = um instante (o estoque naquela data, como fecha um caixa). Chip azul "dd/MM – dd/MM" = um intervalo (o que se moveu entre as duas datas, como um extrato). Cards de KPI e saldo são foto; cards de série, motivo e movimentação por item são período.',
    },
  ]
}

// Statuses que o relatório efetivamente exibe (KPIs, grupo, estoque por situação,
// manutenção). Hoje é todo o STATUS_ORDEM — o glossário cobre todos, então a lista
// serve de âncora explícita para o teste de cobertura.
export const STATUS_VISIVEIS_RELATORIO: readonly StatusAtivo[] = STATUS_ORDEM

import { GrupoColapsavel } from '@/components/relatorios/grupo-colapsavel'
import {
  LEGENDA_DELTA,
  LEGENDA_ESTORNO,
  LEGENDA_ESTORNO_ITENS,
  LEGENDA_TROCA,
  glossarioRelatorio,
  legendaManutencaoPresente,
} from '@/lib/relatorios/legendas'
import type { ManutencaoCaso } from '@/lib/relatorios/tipos'
import { cn } from '@/lib/utils'

// Componentes de apresentação das legendas explicativas do relatório (OS-F17, Frente
// B). Finos DE PROPÓSITO: todo texto mora em src/lib/relatorios/legendas.ts (puro,
// testado). Sem `'use client'` e sem hooks — renderizam tanto em Server Components
// (corpo-relatorio-v2) quanto dentro das tabelas client (tabela-saidas etc.). Estilo
// discreto (text-xs text-muted-foreground), NUNCA só em hover/tooltip: mobile e
// impressão precisam ler. Nenhum href — seguras para o visualizador por senha.

// Nota discreta padrão — mesmo tom das legendas de série que já existem no relatório.
function NotaLegenda({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('pt-1 text-xs text-muted-foreground', className)}>{children}</p>
}

// B1 — legenda do Δ dos KPIs. Renderize só onde há Δ na tela (CorpoRelatorioV2).
export function LegendaDelta() {
  return <NotaLegenda>{LEGENDA_DELTA}</NotaLegenda>
}

// B2 — nota de estorno nas tabelas detalhadas. `itens` usa a variante da tabela de
// movimentações de itens (par estorno/estornado).
export function LegendaEstorno({ itens = false }: { itens?: boolean }) {
  return <NotaLegenda>{itens ? LEGENDA_ESTORNO_ITENS : LEGENDA_ESTORNO}</NotaLegenda>
}

// B5 — nota contextual da pílula "Troca" (Entradas). Condicional a haver troca.
export function LegendaTroca() {
  return <NotaLegenda>{LEGENDA_TROCA}</NotaLegenda>
}

// B3 — legenda dos badges de manutenção. Mostra SÓ as cores presentes nos casos
// exibidos (condicional). Público: NÃO gateia por operador (o viewer também lê).
export function LegendaManutencao({
  casos,
}: {
  casos: readonly Pick<ManutencaoCaso, 'desfecho' | 'fechado' | 'diasEmManutencao'>[]
}) {
  const itens = legendaManutencaoPresente(casos)
  if (itens.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 text-xs text-muted-foreground">
      {itens.map((l) => (
        <span key={l.cor} className="inline-flex items-center gap-1.5">
          <span className={cn('inline-block size-2.5 shrink-0 rounded-full', l.classe)} aria-hidden />
          {l.texto}
        </span>
      ))}
    </div>
  )
}

// B4 — seção recolhível "Como ler este relatório" (glossário). Reusa GrupoColapsavel:
// recolhida no mobile (<768px), aberta no desktop e NA IMPRESSÃO (o papel continua
// útil). Fica ao fim do relatório, como um apêndice de referência. Só texto — sem href.
export function GlossarioRelatorio() {
  const verbetes = glossarioRelatorio()
  return (
    <GrupoColapsavel
      id="como-ler"
      titulo="Como ler este relatório"
      descricao="glossário dos termos, cores e contagens usados acima"
    >
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {verbetes.map((v) => (
          <div key={v.termo} className="break-inside-avoid">
            <dt className="text-sm font-semibold">{v.termo}</dt>
            <dd className="text-xs text-muted-foreground">{v.definicao}</dd>
          </div>
        ))}
      </dl>
    </GrupoColapsavel>
  )
}

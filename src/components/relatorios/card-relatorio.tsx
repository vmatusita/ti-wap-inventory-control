import { cn } from '@/lib/utils'
import { textoJanela, type JanelaCard } from '@/lib/relatorios/janela-card'

// Card padrão dos relatórios (grade do mockup). `wide` ocupa a linha inteira.
// Todo card trata estado vazio ("Sem registros no período") — OS-F3 3.3.7.
export function CardRelatorio({
  id,
  titulo,
  subtitulo,
  janela,
  periodoJanela,
  acao,
  wide,
  vazio,
  vazioMsg = 'Sem registros no período.',
  className,
  contentClassName,
  children,
}: {
  /** F29/REL-09a — alvo de âncora (`#resumo`). Só quem tem chip na barra sticky
   *  passa; sem `id` o card é exatamente o de antes. */
  id?: string
  titulo: string
  subtitulo?: string
  /** F32/RV-04 — o microssinal "foto × período": marca se o card é um instante
   *  as-of ("Estoque no último dia", KPI) ou o filme de um intervalo ("Saídas
   *  por motivo", série/Δ). As duas props andam SEMPRE em par com
   *  `periodoJanela` — nenhuma delas sozinha, ou as duas ausentes, produz o
   *  card de ANTES, byte a byte (dashboard e relatório v1 usam este mesmo
   *  componente e não podem mudar). */
  janela?: JanelaCard
  periodoJanela?: { de: string; ate: string }
  acao?: React.ReactNode
  wide?: boolean
  vazio?: boolean
  vazioMsg?: string
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}) {
  // '' (props ausentes OU ISO malformado — textoJanela já filtra os dois
  // casos) = sem chip. Ramo aditivo puro: o bloco do subtítulo original não
  // muda uma linha.
  const chip = janela && periodoJanela ? textoJanela(janela, periodoJanela) : ''

  return (
    <section
      id={id}
      className={cn(
        // `scroll-mt-28` só quando o card é alvo de âncora: 112px é a pilha sticky
        // do celular (header 56px + a barra de chips), a mesma medida das seções.
        id && 'scroll-mt-28',
        // `min-w-0`: item de grid tem `min-width:auto`, que resolve para o
        // min-content do conteúdo. Com as tabelas de item (`th/td` em
        // `whitespace-nowrap`) isso inflava a trilha `1fr` para além do
        // contêiner e o DOCUMENTO ganhava scroll horizontal (F13/B4-R2). Com
        // min-w-0 a trilha volta a caber e a rolagem cai no contêiner certo — o
        // `overflow-x-auto` que a própria Table já tem.
        'min-w-0 rounded-xl border bg-card p-4 md:p-5',
        wide && 'md:col-span-2',
        'break-inside-avoid',
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{titulo}</h2>
          {subtitulo && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>
          )}
          {chip && (
            // Chip PERSISTENTE (não é hover/tooltip) — cinza p/ 'foto' (um
            // instante), azul-claro p/ 'periodo' (um intervalo).
            //
            // O par do 'foto' era `bg-muted text-muted-foreground`, copiado do
            // chip "em breve" da sidebar. A revisão adversarial da F32 mediu:
            // **4,34:1** — reprova AA nos 11px em que o chip é renderizado. E é
            // exatamente o par que o próprio repo já tinha catalogado como
            // defeituoso em `scripts/contraste.mjs` (P2-8, "pílula fallback —
            // ANTES"), com a correção ao lado. Copiar de um lugar que está em
            // produção não é o mesmo que copiar de um lugar MEDIDO — a lição
            // desta troca. Agora usa o par corrigido de lá (`gray-200/gray-600`,
            // 6,11:1 claro · 5,64:1 escuro), que já entra no portão do CI.
            <span
              className={cn(
                'mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                janela === 'foto'
                  ? 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
              )}
            >
              {chip}
            </span>
          )}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>

      {vazio ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{vazioMsg}</p>
      ) : (
        <div className={contentClassName}>{children}</div>
      )}
    </section>
  )
}

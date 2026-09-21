import Link from 'next/link'
import type { ChipPendencia } from '@/lib/relatorios/tipos'
import { cn } from '@/lib/utils'

// F19 — o chip nascera só com o tema claro: no escuro era fundo quase branco com
// texto quase preto, o único bloco a estourar a tela.
const CLASSE_CHIP =
  'rounded-full border border-amber-200 bg-callout-atencao px-3 py-1 text-xs text-callout-atencao-texto dark:border-amber-900/60'

// F27/B5 (PND-03) — só estas chaves viram link: são exatamente os valores que
// `/pendencias` aceita em `?tipo=` (`TIPOS_VALIDOS`, `app/(app)/pendencias/page.tsx`
// — mesmo vocabulário de `TipoPendencia`, `@/lib/pendencias/rotulos`). Não dá pra
// confiar só no tipo porque `ChipPendencia.chave` é `string` solto (o tipo é
// compartilhado com o jsonb do snapshot, que não pode carregar uma union estreita
// de propósito). Um chip fora deste conjunto — hoje só `manutencao_parada`
// (`chipManutencaoParada`, `lib/relatorios/manutencao-alerta.ts`) — NUNCA vira
// link: um href assim cairia no fallback `tipo=null` da página (tipo desconhecido)
// e mostraria a fila INTEIRA, prometendo um recorte que não entrega.
const TIPOS_COM_FILTRO = new Set(['termo', 'itens', 'triagem', 'patrimonio', 'conflito', 'outras'])

// Chips de pendências (mockup + OS-F3 3.2.2). Só aparecem os buckets com total > 0.
export function PendenciasChips({
  pendencias,
  // ⚠ Os chips são contados sobre uma leitura que pode vir RECORTADA. Nos corpos de
  // relatório o recorte é o próprio assunto da página (o relatório é DE uma filial),
  // então a frase curta basta. Em /pendencias, não: desde a F25 o operador abre a
  // tela já recortado nas filiais dele sem nada na URL, e a frase global aparecia
  // 30px acima de um estado vazio que dizia justamente o contrário.
  recortado = false,
  // F27/B5 (PND-03) — liga cada chip lincável (ver `TIPOS_COM_FILTRO`) a
  // `/pendencias?tipo=<chave>`, a MESMA fila que o número do chip resume. Só true
  // em `/pendencias` (a própria fila, sempre operador — a rota já redireciona pra
  // `/login` sem sessão) e no relatório AO VIVO para o operador — o MESMO sinal que
  // já decide os KPI tiles clicáveis (`links` em `CorpoRelatorioV2`/`kpi-links.ts`).
  // Sem esta prop (default `false`): visualizador por senha e snapshot congelado —
  // o viewer NUNCA ganha href pra fora de `/relatorios/**`, e o congelado aponta pra
  // fila de HOJE, que não é a do período parado no tempo.
  comLink = false,
}: {
  pendencias: ChipPendencia[]
  recortado?: boolean
  comLink?: boolean
}) {
  if (pendencias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {recortado
          ? 'Nenhuma pendência nas filiais em que você opera. 🎉'
          : 'Nenhuma pendência aberta. 🎉'}
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {pendencias.map((p) => {
        const conteudo = (
          <>
            <span className="font-bold tabular-nums">
              {p.total.toLocaleString('pt-BR')}
            </span>{' '}
            {p.rotulo}
          </>
        )
        // Sem link (viewer/snapshot, ou chave fora de `TIPOS_COM_FILTRO`): o
        // <span> estático de sempre. Com link: mesmas classes + hover/foco
        // discretos, no mesmo espírito dos KPI tiles clicáveis.
        return comLink && TIPOS_COM_FILTRO.has(p.chave) ? (
          <Link
            key={p.chave}
            href={`/pendencias?tipo=${p.chave}`}
            className={cn(
              CLASSE_CHIP,
              'transition-colors hover:border-amber-300 hover:bg-amber-100 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:border-amber-800 dark:hover:bg-amber-950/60',
            )}
          >
            {conteudo}
          </Link>
        ) : (
          <span key={p.chave} className={CLASSE_CHIP}>
            {conteudo}
          </span>
        )
      })}
    </div>
  )
}

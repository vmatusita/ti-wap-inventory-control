import type { ChipPendencia } from '@/lib/relatorios/tipos'

// Chips de pendências (mockup + OS-F3 3.2.2). Só aparecem os buckets com total > 0.
export function PendenciasChips({
  pendencias,
  // ⚠ Os chips são contados sobre uma leitura que pode vir RECORTADA. Nos corpos de
  // relatório o recorte é o próprio assunto da página (o relatório é DE uma filial),
  // então a frase curta basta. Em /pendencias, não: desde a F25 o operador abre a
  // tela já recortado nas filiais dele sem nada na URL, e a frase global aparecia
  // 30px acima de um estado vazio que dizia justamente o contrário.
  recortado = false,
}: {
  pendencias: ChipPendencia[]
  recortado?: boolean
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
      {pendencias.map((p) => (
        // F19 — o chip nascera só com o tema claro: no escuro era fundo quase
        // branco com texto quase preto, o único bloco a estourar a tela.
        <span
          key={p.chave}
          className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span className="font-bold tabular-nums">
            {p.total.toLocaleString('pt-BR')}
          </span>{' '}
          {p.rotulo}
        </span>
      ))}
    </div>
  )
}

import { MessageSquareText } from 'lucide-react'

// B4 (F6B) — observação da semana no final do relatório congelado. Texto livre
// definido no ato de gerar o snapshot; destaque no acento WAP (#eda100). Só
// renderiza quando há texto — snapshots sem obs (ou ao vivo, que não tem obs) não
// mostram a seção. `whitespace-pre-wrap` preserva as quebras de linha digitadas.
export function ObservacaoCard({ texto }: { texto: string | null | undefined }) {
  if (!texto || !texto.trim()) return null
  return (
    <section
      id="observacao"
      className="scroll-mt-28 break-inside-avoid rounded-lg border border-l-4 border-brand-amarelo bg-brand-amarelo/5 p-4"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <MessageSquareText className="size-4 text-brand-amarelo" />
        Observações da semana
      </h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {texto}
      </p>
    </section>
  )
}

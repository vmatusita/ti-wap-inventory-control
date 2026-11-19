import { redirect } from 'next/navigation'
import { portaDaLegada } from '@/lib/auth/porta-rotas'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Acesso aos relatórios',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md).
export const maxDuration = 60

type SearchParams = { [key: string]: string | string[] | undefined }

// O ENDEREÇO ANTIGO da entrada por senha (F68, 19/11/2026). A entrada mora agora na porta pública DA EMPRESA,
// `/r/<slug>/relatorios/acesso` (src/app/r/**). Quem chega aqui:
//   · operador logado → o `(app)/layout.tsx` já o devolveu ao relatório dele (F25), antes desta página;
//   · sem operador → o proxy respondeu 308 para a porta da legada, e esta página nem renderiza.
// O que sobra (um request que escape dos dois) vai para a mesma porta da legada, com o `next` traduzido.
export default async function AcessoRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : ''
  redirect(portaDaLegada('/relatorios/acesso', next ? `?next=${encodeURIComponent(next)}` : ''))
}

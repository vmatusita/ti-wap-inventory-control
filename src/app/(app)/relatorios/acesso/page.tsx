import { AcessoForm } from '@/components/relatorios/acesso-form'

type SearchParams = { [key: string]: string | string[] | undefined }

// Entrada por SENHA de acesso aos relatórios (público — spec §3 / OS-F3 3.9.1).
// Server Component: lê `next` (destino guardado pelo proxy) dos searchParams e
// repassa ao formulário. Sem `useSearchParams` no cliente → sem exigência de
// Suspense no build. A rota é servida sem shell pelo (app)/layout.
export default async function AcessoRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : ''
  return <AcessoForm next={next} />
}

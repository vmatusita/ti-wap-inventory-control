import { notFound } from 'next/navigation'
import { AcessoForm } from '@/components/relatorios/acesso-form'
import { pedirPorta } from '@/lib/supabase/publico'
import { slugValido } from '@/lib/auth/porta-rotas'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Acesso aos relatórios',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado: 60 s troca cinco minutos de spinner (a conexão com o banco
// pendurada) por um erro rápido. A Server Action desta página (`entrarNaPorta`) confere a senha DENTRO do banco — no
// máximo 5 bcrypt, ~0,5 s.
export const maxDuration = 60

type SearchParams = { [key: string]: string | string[] | undefined }

// A ENTRADA DA PORTA PÚBLICA DA EMPRESA (F68): `/r/<slug>/relatorios/acesso`. Fora do grupo `(app)` — nada do shell do
// operador, nada da sessão do Supabase. O único pedido ao banco é o `porta` de `relatorio_publico_dados` (o único sem
// sessão): o nome da empresa do slug, ou 404 se o slug não existe. O destino guardado (`next`) viaja num campo oculto e
// é revalidado DENTRO da mesma empresa pela Server Action.
export default async function AcessoDaPortaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>
  searchParams: Promise<SearchParams>
}) {
  const { empresa } = await params
  if (!slugValido(empresa)) notFound()
  const r = await pedirPorta('porta', empresa, null)
  if (!r.ok) notFound()
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : ''
  return <AcessoForm slug={r.empresa.slug} empresaNome={r.empresa.nome} next={next} />
}

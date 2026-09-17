import { AcessoForm } from '@/components/relatorios/acesso-form'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Acesso aos relatórios',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// Esta página não lê `lib/queries`, mas não é estática: `(app)/layout.tsx` chama
// `getOperador()` (Auth + `profiles`) antes de mostrá-la, e `entrarComSenha`, a Server
// Action dela (a doc do Next põe as actions da página sob este teto), lê as senhas ativas e
// confere cada uma por scrypt, sem laço sobre o acervo. É a porta do gestor, o mesmo
// público do incidente.
export const maxDuration = 60

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

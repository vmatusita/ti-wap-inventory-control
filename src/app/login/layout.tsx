import type { Metadata } from 'next'

// FLX-03 — `page.tsx` desta rota é Client Component ('use client', por causa do
// formulário com useActionState/useSearchParams) e por isso não pode exportar
// `metadata` (só Server Component pode). Este layout existe só para isso.
export const metadata: Metadata = {
  title: 'Entrar',
}

export default function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>
}

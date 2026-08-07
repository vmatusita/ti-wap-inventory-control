import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/layout/theme-provider'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// FLX-03 — título por página (WCAG 2.4.2): o `template` propaga o sufixo " · Estoque
// TI WAP" para todo `title` que as páginas declararem (curto, só o nome da tela);
// `default` é o que aparece quando uma rota não declara título nenhum.
export const metadata: Metadata = {
  title: {
    default: 'Estoque TI · WAP',
    template: '%s · Estoque TI WAP',
  },
  description: 'Controle de ativos de TI da WAP',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` (F19): o next-themes escreve a classe do tema no
    // <html> por script inline ANTES da hidratação — sem isto o React reclamaria
    // da diferença de atributo que ele mesmo pediu. Escopo de 1 elemento.
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-svh bg-background text-foreground">
        {/* O Toaster fica DENTRO do provider de propósito: o `ui/sonner.tsx`
            (gerado pelo shadcn, não editado) chama `useTheme()` e, sem provider,
            caía em "system" — toast escuro num app claro no Windows escuro
            (achado P1-4 da revisão). Dentro do provider ele segue o tema do APP. */}
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}

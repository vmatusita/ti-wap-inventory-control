'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

// Fronteira client do next-themes (F19). O provider usa contexto e efeito, então
// não pode ser montado direto de um Server Component — este arquivo é a única
// razão do wrapper.
//
// Configuração fixa aqui (não é prop) porque é decisão de produto, não de tela:
//   attribute="class"        → casa com o `@custom-variant dark` do globals.css
//   defaultTheme="light"     → o padrão CONTINUA claro; escuro é opt-in (quem
//                              nunca tocar no toggle não vê diferença nenhuma)
//   enableSystem             → habilita a 3ª opção "Sistema" do menu
//   disableTransitionOnChange→ troca instantânea, sem varredura de cor
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}

import { CreditoAutor } from '@/components/layout/credito-autor'
import { Marca } from '@/components/layout/marca'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// O CASCO DAS QUATRO PORTAS — login, ativar convite, definir senha e o acesso
// por senha ao relatório (F40).
//
// A casca estava copiada QUATRO VEZES (`login/page.tsx`, `auth/confirm/page.tsx`,
// `auth/definir-senha/page.tsx` e `components/relatorios/acesso-form.tsx`), com
// OITO das nove linhas estruturais idênticas string por string. As duas únicas
// divergências reais: o subtítulo é `mt-2` numa e `mt-3` em duas (ausente na
// quarta), e o crédito do autor só aparece no login. As duas viraram prop.
//
// E O SUBTÍTULO VIROU O `<h1>`. As quatro portas do sistema não tinham `<h1>`,
// `<h2>` nem `CardTitle`: o nome da tela existia só no `<title>` da aba e na
// `<Marca>`, que é gráfica. Quem usa leitor de tela abria as quatro portas do
// produto sem saber onde está — é o achado 1 do inventário e a correção de
// acessibilidade mais barata do plano inteiro. O TEXTO É O MESMO DE SEMPRE; o
// que muda é a etiqueta.
//
// ⚠ ESTE COMPONENTE NASCE SEM CONSUMIDOR, e isso é deliberado: a F40 entrega a
// fundação e o piloto de `/ativos`. Aplicar às quatro portas é a frente **d** do
// plano (`docs/PLANO-DESIGN-SYSTEM.md` §5) — inclusive a fronteira escrita à mão
// que tira `/relatorios/acesso` da frente b.
//
// A largura é `max-w-sm` e não uma das variantes de `<Pagina>` de propósito:
// aqui não há barra lateral, não há cabeçalho e não há conteúdo — há um
// formulário curto no meio de uma tela vazia, que é outro tipo de tela.

export function CascoDeAutenticacao({
  subtitulo,
  subtituloVisivel = true,
  creditoAutor = false,
  className,
  children,
}: {
  /** O assunto da tela. Vira o `<h1>` — é o único título que ela tem. */
  subtitulo: React.ReactNode
  /**
   * O login é a única das quatro portas que hoje NÃO mostra subtítulo nenhum.
   * Com `false`, o `<h1>` continua existindo para o leitor de tela (`sr-only`)
   * sem acrescentar uma linha à tela — é o que permite fechar o achado 1 sem
   * mudar texto visível, que a F40 proíbe.
   */
  subtituloVisivel?: boolean
  /** O crédito de autoria, hoje só no login (F35 — são três pontos, e só três). */
  creditoAutor?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted px-4 py-12">
      <Card className={cn('w-full max-w-sm gap-0 overflow-hidden p-0', className)}>
        <div className="bg-brand-dark px-6 py-8 text-center">
          <Marca size="lg" labelClassName="text-brand-dark-texto" />
          {/* `text-brand-dark-texto/70` sobre `brand-dark` — o par já está na
              régua de `scripts/contraste.mjs` ("texto atenuado do cromo (70%)",
              F61). Não invente outra opacidade aqui. */}
          <h1
            className={
              subtituloVisivel
                ? 'mt-3 text-sm font-medium text-brand-dark-texto/70'
                : 'sr-only'
            }
          >
            {subtitulo}
          </h1>
        </div>

        <div className="px-6 py-6">
          {children}

          {/* F35 — o crédito fica DENTRO do card, e não solto no fundo da tela:
              o fundo é `bg-muted`, e `muted-foreground` sobre ele mede 4,34:1 no
              tema claro — abaixo do piso AA de 4,5:1 para texto pequeno. Sobre
              `card` são 4,73:1 (claro) e 6,91:1 (escuro). */}
          {creditoAutor ? (
            <p className="mt-6 border-t pt-4 text-center">
              <CreditoAutor />
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

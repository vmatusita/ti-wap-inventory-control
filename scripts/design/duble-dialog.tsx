// DUBLÊ de `@/components/ui/dialog` — só para a prévia estática (F61).
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE NÃO É O COMPONENTE REAL
// ============================================================================
// `src/components/ui/dialog.tsx` (o de verdade) monta o conteúdo do diálogo
// dentro de um `DialogPrimitive.Portal` do Radix. O Portal só teleporta os
// filhos para `document.body` depois de montar — e ele monta em
// `useLayoutEffect`, que o `react-dom/server`'s `renderToStaticMarkup` NUNCA
// executa (é reservado ao commit no navegador). Resultado: renderizar a árvore
// real de um diálogo fora do Next devolveria SEMPRE o botão-gatilho sozinho,
// com o formulário inteiro invisível — inclusive quando `open` é `true`.
//
// A vitrine `admin-dialogos` da F61 existe exatamente para fotografar esse
// formulário. Este arquivo substitui `@/components/ui/dialog` SÓ dentro da
// prévia (`tsconfig.previa-f61.json` troca o caminho), e faz três coisas que a
// versão real não faz:
//
//   1. Renderiza o conteúdo do diálogo SEMPRE, em vez de só quando `open` é
//      verdadeiro — a prop `open`/`onOpenChange` do chamador é ignorada de
//      propósito (é assim que a prévia mostra "o que o render estático
//      mostra" sem simular clique nenhum).
//   2. Renderiza em LINHA, na própria árvore — nunca num Portal. O que na tela
//      real é `position: fixed` com `top-1/2 left-1/2` e `-translate-x/y-1/2`
//      (a caixa centralizada por cima de tudo) aqui vira FLUXO NORMAL: um
//      `<div>` comum, empilhado onde o `DialogContent` foi escrito no JSX. Sem
//      overlay (a "cortina" escura não existe aqui — ela não tem papel
//      nenhum numa foto sem sobreposição).
//   3. Cobre TODOS os exports de `dialog.tsx` (confira a lista real com
//      `export {...}` no fim daquele arquivo) — um chamador que use qualquer
//      um deles continua compilando e renderizando algo sensato.
//
// NÃO usa `radix-ui` em lugar nenhum: `DialogPrimitive.Title`/`.Description`
// dependem do contexto que `DialogPrimitive.Root` provê, e um dublê que
// importasse só ALGUNS primitivos radix e reimplementasse outros correria o
// risco de faltar contexto pela metade. Mais simples e mais previsível: todo
// elemento aqui é HTML puro.
//
// `showCloseButton`/`onOpenAutoFocus`/`onEscapeKeyDown`/etc. — props que só
// fazem sentido com um diálogo INTERATIVO — são aceitas (para o TypeScript não
// reprovar o chamador real) e simplesmente ignoradas: nada aqui abre, fecha ou
// captura foco.

import type { ReactNode } from 'react'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** Aceita qualquer prop extra (as do Radix incluídas) sem reprovar o chamador real. */
type ComQualquerProp<T> = T & Record<string, unknown>

// ---------------------------------------------------------------------------
// Dialog / DialogTrigger / DialogPortal / DialogClose — passagem direta.
// ---------------------------------------------------------------------------
// Nenhum dos quatro tem aparência própria na tela real (Root é lógica pura;
// Trigger/Close só emprestam o clique ao filho via `asChild`; Portal só
// teleporta). Aqui os quatro só devolvem os filhos — é a MESMA arvore, sem a
// lógica de abrir/fechar que não existe numa imagem parada.

function Dialog({ children }: ComQualquerProp<{ children?: ReactNode }>) {
  return <>{children}</>
}

// ⚠ Renderiza `children` SEMPRE — inclusive sem `asChild` — porque é o botão
// (ou o que quer que o chamador tenha posto ali) que a foto precisa mostrar.
function DialogTrigger({ children }: ComQualquerProp<{ children?: ReactNode }>) {
  return <>{children}</>
}

function DialogPortal({ children }: ComQualquerProp<{ children?: ReactNode }>) {
  return <>{children}</>
}

function DialogClose({ children }: ComQualquerProp<{ children?: ReactNode }>) {
  return <>{children}</>
}

// A cortina escura por trás do modal. Sem Portal e sem sobreposição não há o
// que cobrir — `null` em vez de uma `<div>` que ninguém posicionaria.
function DialogOverlay() {
  return null
}

// ---------------------------------------------------------------------------
// DialogContent — o que a vitrine realmente quer fotografar.
// ---------------------------------------------------------------------------
// As classes visuais são as MESMAS de `dialog.tsx` (raio, fundo, anel, texto,
// padding, teto de largura) — só a POSIÇÃO muda: `fixed inset-1/2` +
// `-translate-x/y-1/2` (centralizado por cima da tela) vira `relative`, em
// fluxo normal, com uma margem vertical para não colar no quadro anterior. As
// classes de animação (`data-open:*`/`data-closed:*`) saem: sem o Radix por
// baixo não existe `data-state`, e uma classe presa a um atributo ausente é
// só ruído no HTML.
function DialogContent(
  props: ComQualquerProp<{
    className?: string
    children?: ReactNode
    /** Default `true`, como no componente real. */
    showCloseButton?: boolean
  }>,
) {
  const { className, children, showCloseButton = true } = props
  return (
    <DialogPortal>
      <div
        data-slot="dialog-content"
        data-dublê="dialog-content"
        className={cn(
          'relative my-6 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm',
          className,
        )}
      >
        {children}
        {showCloseButton && (
          <Button
            type="button"
            variant="ghost"
            className="absolute top-2 right-2 size-10 sm:size-7"
            size="icon-sm"
          >
            <XIcon />
            <span className="sr-only">Fechar</span>
          </Button>
        )}
      </div>
    </DialogPortal>
  )
}

// ---------------------------------------------------------------------------
// DialogHeader / DialogFooter / DialogTitle / DialogDescription
// ---------------------------------------------------------------------------
// Nenhum dos quatro depende de Portal nem de contexto do Radix na versão real
// — são `<div>`/`<h2 role="heading">`/`<p>` com classe. Aqui viram HTML puro
// com as MESMAS classes, para o miolo do diálogo (título, texto de apoio,
// rodapé de botões) sair idêntico ao que apareceria dentro do Portal real.

function DialogHeader({
  className,
  children,
  ...props
}: ComQualquerProp<{ className?: string; children?: ReactNode }>) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...limpo(props)}>
      {children}
    </div>
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: ComQualquerProp<{ className?: string; showCloseButton?: boolean; children?: ReactNode }>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...limpo(props)}
    >
      {children}
      {showCloseButton && <Button variant="outline">Fechar</Button>}
    </div>
  )
}

function DialogTitle({
  className,
  children,
  ...props
}: ComQualquerProp<{ className?: string; children?: ReactNode }>) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn('font-heading text-base leading-none font-medium', className)}
      {...limpo(props)}
    >
      {children}
    </h2>
  )
}

function DialogDescription({
  className,
  children,
  ...props
}: ComQualquerProp<{ className?: string; children?: ReactNode }>) {
  return (
    <p
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...limpo(props)}
    >
      {children}
    </p>
  )
}

/**
 * Tira do objeto qualquer chave que não seja um atributo HTML válido antes de
 * espalhar em cima de um elemento nativo (`children`/`className` já saem por
 * fora via destructuring; isto pega o resto — `asChild`, handlers do Radix
 * como `onOpenAutoFocus`, etc. — que os quatro componentes acima não usam mas
 * o TypeScript aceita por causa de `ComQualquerProp`). Sem isto o React
 * avisaria em cada um: "React does not recognize the `onOpenAutoFocus` prop".
 */
function limpo(props: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(props)) {
    // `data-*`/`aria-*`/`id`/`role` são os únicos que os chamadores reais desta
    // casa passam para Header/Footer/Title/Description além de className/children.
    if (chave.startsWith('data-') || chave.startsWith('aria-') || chave === 'id' || chave === 'role') {
      saida[chave] = valor
    }
  }
  return saida
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

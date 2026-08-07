'use client'

import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// F29/UXG-10d — o `?` NAVEGAVA para /ajuda. Duas consequências: quem só queria
// lembrar uma tecla perdia a tela em que estava (e o trabalho em andamento, se
// houvesse), e não existia cheat-sheet nenhum — a lista de atalhos vivia numa página
// de documentação, a três cliques de distância.
//
// Agora o `?` abre ESTE overlay. Quem quer a documentação inteira continua a um
// clique, pelo link do rodapé, e a ida vira escolha em vez de efeito colateral.
//
// ⚠ A fonte da verdade das teclas continua sendo a página de ajuda
// `limites-e-atalhos` (é ela que os testes travam). Este quadro é o RESUMO — mudou
// uma tecla, mude nos dois lugares; o link do rodapé existe justamente para o resumo
// nunca precisar contar a história toda.
const ATALHOS: { teclas: string; acao: string }[] = [
  { teclas: 'Ctrl K', acao: 'Abre (e fecha) a busca global' },
  { teclas: '/', acao: 'Abre a mesma busca — fora de um campo de texto' },
  { teclas: 'N', acao: 'Nova movimentação, de qualquer tela' },
  { teclas: 'L', acao: 'Lançar item — só na página Itens' },
  { teclas: '?', acao: 'Abre este quadro de atalhos' },
  { teclas: '↑ ↓ · Enter · Esc', acao: 'Na busca: andar, abrir e fechar' },
]

export function AtalhosDialog({
  aberto,
  onOpenChange,
  /** F21 — quem não escreve não tem o `N`: mostrar a tecla seria prometer o que a
   *  action recusaria. */
  mostrarNovaMovimentacao = true,
}: {
  aberto: boolean
  onOpenChange: (v: boolean) => void
  mostrarNovaMovimentacao?: boolean
}) {
  const linhas = ATALHOS.filter(
    (a) => mostrarNovaMovimentacao || a.teclas !== 'N',
  )

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>
            Nenhum deles dispara enquanto você digita num campo, nem com uma janela de
            confirmação aberta.
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y text-sm">
          {linhas.map((a) => (
            <div key={a.teclas} className="flex items-baseline gap-3 py-2">
              <dt className="w-36 shrink-0">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
                  {a.teclas}
                </kbd>
              </dt>
              <dd className="min-w-0 text-muted-foreground">{a.acao}</dd>
            </div>
          ))}
        </dl>

        <DialogFooter className="sm:justify-between">
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/ajuda/limites-e-atalhos" onClick={() => onOpenChange(false)}>
              <BookOpen className="size-4" />
              Documentação completa
            </Link>
          </Button>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

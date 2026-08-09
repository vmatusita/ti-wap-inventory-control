'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

// Porta de entrada por toque para o conteúdo que as tabelas escondem no mobile
// (F16/T5). Cada tabela detalhada esconde colunas abaixo de sm/md/lg/xl; aqui a
// linha ganha um chevron que revela, como pares rótulo:valor, exatamente o que
// sumiu na largura atual. No desktop (a partir do breakpoint em que nada fica
// oculto) isto some pela classe `<bp>:hidden` do chamador.
//
// REL-01 (F30) — o `print:hidden` daqui MUDOU de motivo. Antes ele existia porque
// "a impressão não muda"; hoje é o contrário: o papel passou a receber as colunas
// escondidas (`print:table-cell` nas tabelas), e reimprimir os mesmos campos como
// pares rótulo:valor só duplicaria tudo e dobraria a altura de cada linha. Ou
// seja, o chevron e a linha de detalhe continuam fora do papel — mas agora porque
// o papel já tem a informação, não porque ela não cabia.

// Estado das linhas expandidas por id. Simples Set em memória (não vai à URL — é
// um detalhe de leitura efêmero, não algo a compartilhar por link).
export function useExpandidas() {
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set())
  const estaAberta = (id: string) => abertas.has(id)
  const alternar = (id: string) =>
    setAbertas((prev) => {
      const proximo = new Set(prev)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  return { estaAberta, alternar }
}

// Botão-chevron. Alvo de toque ≥ 40px (`size-10`), `aria-expanded`. O chamador
// passa `className` com o breakpoint em que a coluna some (ex.: `xl:hidden`) — a
// coluna do chevron só existe onde há algo escondido. `print:hidden` embutido.
export function BotaoExpandir({
  aberta,
  onClick,
  rotulo,
  className,
}: {
  aberta: boolean
  onClick: () => void
  rotulo: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aberta}
      aria-label={rotulo}
      className={cn(
        'flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none print:hidden',
        className,
      )}
    >
      <ChevronDown className={cn('size-4 transition-transform', aberta && 'rotate-180')} />
    </button>
  )
}

// Um campo revelado: `revelar` é o INVERSO do `hidden <bp>:table-cell` da coluna
// (coluna `hidden sm:table-cell` → campo `sm:hidden`), então cada par aparece só na
// largura em que sua coluna está oculta. Valor nulo/ausente pode ser omitido pelo
// chamador (não passar o campo) ou exibido como travessão.
export type CampoDetalhe = { rotulo: string; valor: ReactNode; revelar: string }

// Linha de detalhe: uma `<TableRow>` de célula única (colSpan) com os pares
// rótulo:valor. `colSpan` pode ser um teto (o navegador limita ao nº real de
// colunas). `print:hidden` + a classe `<bp>:hidden` do chamador tiram a linha da
// impressão e da largura em que nada está escondido.
export function LinhaDetalhe({
  colSpan,
  campos,
  className,
}: {
  colSpan: number
  campos: CampoDetalhe[]
  className?: string
}) {
  return (
    <TableRow className={cn('hover:bg-transparent print:hidden', className)}>
      <TableCell colSpan={colSpan} className="bg-muted/30 py-2 whitespace-normal">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {campos.map((c, i) => (
            <div key={i} className={cn('flex gap-1.5', c.revelar)}>
              <dt className="shrink-0 font-medium text-muted-foreground">{c.rotulo}:</dt>
              <dd className="min-w-0 break-words">{c.valor}</dd>
            </div>
          ))}
        </dl>
      </TableCell>
    </TableRow>
  )
}

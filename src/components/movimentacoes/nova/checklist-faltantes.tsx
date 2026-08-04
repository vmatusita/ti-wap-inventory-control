'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ACESSORIOS_DEVOLUCAO, rotuloAcessorio } from '@/lib/dominio'

// Checklist "Itens faltantes na devolução" (spec §6). F26 — extraido de
// `passo-movimentacao.tsx`: a metade DEVOLUCAO do par troca/upgrade coleta o
// mesmo checklist, e duas copias do mesmo JSX viram divergencia na primeira vez
// que a lista de acessorios mudar.
export function ChecklistFaltantes({
  valor,
  onChange,
  rotulo = 'Itens faltantes na devolução',
}: {
  valor: string[]
  onChange: (itens: string[]) => void
  rotulo?: string
}) {
  return (
    <div className="grid gap-2">
      <Label>{rotulo}</Label>
      <div className="flex flex-wrap gap-3 rounded-lg border p-3">
        {ACESSORIOS_DEVOLUCAO.map((it) => {
          const marcado = valor.includes(it)
          return (
            <label
              key={it}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={marcado}
                onCheckedChange={(c) =>
                  onChange(
                    c === true ? [...valor, it] : valor.filter((x) => x !== it),
                  )
                }
              />
              {rotuloAcessorio(it)}
            </label>
          )
        })}
      </div>
    </div>
  )
}

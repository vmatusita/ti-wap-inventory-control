'use client'

import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GRUPO_ITEM_META } from '@/lib/dominio'
import { casaBusca } from '@/lib/ajuda/busca'
import type { ItemAdmin } from '@/lib/queries/itens'
import { ItemDialog } from '@/components/admin/item-dialog'

// F29/ADM-03a — a tabela do catálogo vivia INLINE na page (Server Component) e não
// tinha filtro nenhum: com o catálogo crescendo, achar "cabo HDMI" era rolar a tela.
// Extraída para um Client Component que recebe o array pronto e filtra em MEMÓRIA —
// nada de round-trip por tecla. O `ItemDialog` já era cliente e veio junto sem
// mudança nenhuma.

// A busca varre nome e RÓTULO do grupo ("Acessórios e periféricos"), não a chave
// crua ('acessorio'): é o que está escrito na tela.
function textoBuscavel(it: ItemAdmin): string {
  return `${it.nome} ${GRUPO_ITEM_META[it.grupo].rotulo}`
}

export function ItensTabela({ itens }: { itens: readonly ItemAdmin[] }) {
  const buscaId = useId()
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(
    () => itens.filter((it) => casaBusca(textoBuscavel(it), busca)),
    [itens, busca],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={buscaId}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou grupo…"
            aria-label="Buscar item por nome ou grupo"
            autoComplete="off"
            className="h-10 pl-8 sm:h-8"
          />
        </div>
        <p role="status" className="text-sm text-muted-foreground tabular-nums">
          {busca.trim()
            ? `${visiveis.length} de ${itens.length}`
            : `${itens.length} no total`}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {itens.length === 0
            ? 'Nenhum item cadastrado ainda — use "Novo item" para criar o primeiro.'
            : `Nenhum item casa com “${busca.trim()}”.`}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead className="hidden text-right md:table-cell">Ordem</TableHead>
                {/* Mínimo aparece antes de Ordem no corte de tela (`sm`, não `md`):
                    é regra de operação — decide o aviso "repor" em /itens —,
                    enquanto Ordem só governa a posição no combobox. */}
                <TableHead className="hidden text-right sm:table-cell">Mínimo</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Lançamentos
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.nome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {GRUPO_ITEM_META[it.grupo].rotulo}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                    {it.ordem}
                  </TableCell>
                  {/* Mínimo 0 sai como travessão, não como "0": zero não é um piso
                      de estoque, é a AUSÊNCIA de acompanhamento — um 0 numa coluna
                      de limites se lê como "alerta quando ficar abaixo de zero".
                      Mesma convenção do travessão de Atrelados/Falta em /itens. */}
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                    {it.estoque_minimo > 0 ? (
                      <span className="font-medium text-foreground">
                        {it.estoque_minimo.toLocaleString('pt-BR')}
                      </span>
                    ) : (
                      <span title="Sem alerta de reposição">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                    {it.lancamentos.toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    {it.ativo ? (
                      <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ItemDialog item={it} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

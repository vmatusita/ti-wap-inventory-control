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
import { QuadroDeTabela } from '@/components/layout/quadro-de-tabela'
import type { ItemAdmin } from '@/lib/queries/itens'
import type { TipoItem } from '@/lib/queries/tipos-item'
import { ItemDialog } from '@/components/admin/item-dialog'
import { TipoDoItemSelect } from '@/components/admin/tipo-do-item-select'

// F29/ADM-03a — a tabela do catálogo vivia INLINE na page (Server Component) e não
// tinha filtro nenhum: com o catálogo crescendo, achar "cabo HDMI" era rolar a tela.
// Extraída para um Client Component que recebe o array pronto e filtra em MEMÓRIA —
// nada de round-trip por tecla. O `ItemDialog` já era cliente e veio junto sem
// mudança nenhuma.

// A busca varre nome e RÓTULO do grupo ("Acessórios e periféricos"), não a chave
// crua ('acessorio'): é o que está escrito na tela.
function textoBuscavel(it: ItemAdmin, tipos: readonly TipoItem[]): string {
  const tipo = tipos.find((t) => t.id === it.tipo_id)?.rotulo ?? 'sem tipo'
  return `${it.nome} ${GRUPO_ITEM_META[it.grupo].rotulo} ${tipo}`
}

export function ItensTabela({
  itens,
  tipos,
}: {
  itens: readonly ItemAdmin[]
  // F37/D7 — os tipos ATIVOS, para a coluna de tipo. Descem prontos do servidor,
  // como o array de itens: a tabela nao busca nada.
  tipos: readonly TipoItem[]
}) {
  const buscaId = useId()
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(
    () => itens.filter((it) => casaBusca(textoBuscavel(it, tipos), busca)),
    [itens, tipos, busca],
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
            placeholder="Buscar por nome, grupo ou tipo…"
            aria-label="Buscar item por nome, grupo ou tipo"
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
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {itens.length === 0
            ? 'Nenhum item cadastrado ainda — use "Novo item" para criar o primeiro.'
            : `Nenhum item casa com “${busca.trim()}”.`}
        </div>
      ) : (
        <QuadroDeTabela>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Grupo</TableHead>
                {/* F37/D7 — o TIPO do item. Fica ao lado do Grupo porque os dois
                    classificam, mas respondem coisas diferentes: grupo diz como o
                    item se comporta no estoque, tipo diz o que ele E ("carregador"),
                    e e o tipo que a F39 vai escrever no termo. */}
                <TableHead className="hidden lg:table-cell">Tipo</TableHead>
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
                  <TableCell className="hidden lg:table-cell">
                    <TipoDoItemSelect
                      itemId={it.id}
                      itemNome={it.nome}
                      tipoId={it.tipo_id}
                      tipos={tipos}
                    />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                    {it.ordem}
                  </TableCell>
                  {/* Mínimo 0 sai como travessão, não como "0": zero não é um piso
                      de estoque, é a AUSÊNCIA de acompanhamento — um 0 numa coluna
                      de limites se lê como "alerta quando ficar abaixo de zero".
                      Mesma convenção do travessão da coluna Falta em /itens.
                      (F42 — a referência dizia "Atrelados/Falta"; a coluna
                      Reservado saiu da tabela de /itens naquela fase.) */}
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
                      <Badge variant="sucesso">Ativo</Badge>
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
        </QuadroDeTabela>
      )}
    </div>
  )
}

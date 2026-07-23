import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { LancarItemLinha } from '@/components/itens/lancar-item-linha'
import { cn } from '@/lib/utils'
import type { CelulaSaldo, SaldoItemFiliais } from '@/lib/queries/itens'
import type { Filial } from '@/lib/queries/filiais'

// Saldos das filiais LADO A LADO (F11 · I4): uma coluna por filial + Total.
// O número da célula é o ESTOQUE (a prateleira) — é o que responde "onde tem
// mouse sobrando?"; total/atrelados ficam no title da célula e na visão
// consolidada. O chip "faltam N" mora na célula da filial que tem o déficit,
// nunca no Total. Server Component: a tabela continua renderizada no servidor.
//
// Os nomes das colunas vêm de `listarFiliais` — nada de filial hard-coded, o
// número de filiais é o que estiver ativo no banco.

const ZERO: CelulaSaldo = { total: 0, estoque: 0, atrelados: 0, falta: 0 }

// Primeira coluna presa na horizontal (só faz diferença quando a tabela rola, no
// celular): sem ela o operador perde de vista qual item está lendo. O fundo
// próprio é obrigatório — é ele que cobre as colunas que passam por baixo —, e o
// `group-hover` repete o realce da linha, que a célula opaca esconderia.
const COL_ITEM = 'sticky left-0 z-10 bg-card group-hover:bg-muted/50'

function detalhe(c: CelulaSaldo, filial: string): string {
  return `${filial} — total ${c.total.toLocaleString('pt-BR')} · estoque ${c.estoque.toLocaleString('pt-BR')} · atrelados ${c.atrelados.toLocaleString('pt-BR')}`
}

export function SaldosFiliaisTabela({
  filiais,
  itens,
  filialId,
}: {
  filiais: Filial[]
  itens: SaldoItemFiliais[]
  /** filial do filtro da URL, só para pré-preencher o dialog de lançamento */
  filialId: number | null
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="group">
          <TableHead className={COL_ITEM}>Item</TableHead>
          {filiais.map((f) => (
            <TableHead key={f.id} className="text-right">
              {f.nome}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="w-px text-right">
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {itens.map((linha) => (
          <TableRow key={linha.item_id} className="group">
            <TableCell className={cn(COL_ITEM, 'font-medium')}>{linha.item}</TableCell>
            {filiais.map((f) => {
              const c = linha.porFilial[f.id] ?? ZERO
              return (
                <TableCell
                  key={f.id}
                  className="text-right"
                  title={detalhe(c, f.nome)}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span
                      className={cn(
                        'tabular-nums',
                        c.estoque > 0 ? 'font-semibold' : 'text-muted-foreground',
                      )}
                    >
                      {c.estoque.toLocaleString('pt-BR')}
                    </span>
                    {c.falta > 0 && (
                      <Badge className="border-transparent bg-red-100 text-red-700 tabular-nums dark:bg-red-950 dark:text-red-300">
                        faltam {c.falta.toLocaleString('pt-BR')}
                      </Badge>
                    )}
                  </div>
                </TableCell>
              )
            })}
            <TableCell
              className="text-right font-semibold tabular-nums"
              title={detalhe(linha.consolidado, 'Todas as filiais')}
            >
              {linha.consolidado.estoque.toLocaleString('pt-BR')}
            </TableCell>
            <TableCell className="py-1 text-right">
              <LancarItemLinha
                itemId={linha.item_id}
                item={linha.item}
                filialId={filialId}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

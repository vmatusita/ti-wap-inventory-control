import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dica } from '@/components/ui/dica'
import { LancarItemLinha } from '@/components/itens/lancar-item-linha'
import { BadgeRepor } from '@/components/itens/badge-repor'
import { cn } from '@/lib/utils'
import {
  estoqueForaDasColunas,
  type CelulaSaldo,
  type SaldoItemFiliais,
} from '@/lib/queries/itens'
import { minimoDoItem, type MinimosPorItem } from '@/lib/itens/repor'
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
// próprio é obrigatório — é ele que cobre as colunas que passam por baixo.
// O realce de hover NÃO pode entrar como `group-hover:bg-muted/50`: essa
// variante SUBSTITUI o `bg-card` opaco por um de 50% de alfa e as colunas
// voltam a aparecer por transparência justamente na leitura atenta. Então ele
// vem numa camada (`::before`) DEBAIXO do texto (`-z-10`, dentro do contexto de
// empilhamento que o próprio `z-10` cria) e EM CIMA do `bg-card` — o que dá
// exatamente a cor do resto da linha (`muted/50` sobre `card`), sem transparência.
const COL_ITEM =
  "sticky left-0 z-10 bg-card before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-muted/50 before:opacity-0 before:transition-opacity before:content-[''] group-hover:before:opacity-100"

function detalhe(c: CelulaSaldo, filial: string): string {
  return `${filial} — total ${c.total.toLocaleString('pt-BR')} · estoque ${c.estoque.toLocaleString('pt-BR')} · atrelados ${c.atrelados.toLocaleString('pt-BR')}`
}

export function SaldosFiliaisTabela({
  filiais,
  itens,
  minimos,
}: {
  filiais: Filial[]
  itens: SaldoItemFiliais[]
  // Estoque mínimo por item (F12 · I5), cruzado na PÁGINA a partir do catálogo:
  // `SaldoItemFiliais` vem da RPC de saldo e não carrega essa coluna. Item que
  // esteja na tabela e não no mapa (desativado com saldo) vale 0 = sem alerta.
  minimos: MinimosPorItem
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
        {itens.map((linha) => {
          // Estoque que o Total tem e nenhuma coluna mostra (filial desativada).
          // Normalmente zero — quando não é, a linha não fecha e a tela precisa
          // dizer por quê, em vez de deixar o operador procurar o que sumiu.
          const fora = estoqueForaDasColunas(linha, filiais)
          return (
            <TableRow key={linha.item_id} className="group">
              <TableCell className={cn(COL_ITEM, 'font-medium')}>{linha.item}</TableCell>
              {filiais.map((f) => {
                const c = linha.porFilial[f.id] ?? ZERO
                return (
                  <TableCell key={f.id} className="text-right">
                    {/* F19 — total/atrelados saíram do `title=` para uma dica de
                        verdade (P2-10): o atributo nativo não abre por foco de
                        teclado. A dica cobre a célula inteira, como o title
                        cobria — nada aqui dentro tem dica própria. */}
                    <Dica
                      texto={detalhe(c, f.nome)}
                      className="flex flex-col items-end gap-0.5"
                    >
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
                    </Dica>
                  </TableCell>
                )
              })}
              {/* O aviso "repor" mora AQUI, no Total, e nunca nas colunas de
                  filial: o estoque mínimo é do ITEM e compara com o consolidado
                  (decisão do Johnny 22/07/2026). Ao lado de um número de filial
                  ele diria "compre mouse para a Matriz" com 30 mouses parados em
                  outra filial. */}
              <TableCell className="text-right font-semibold tabular-nums">
                <div className="flex flex-col items-end gap-0.5">
                  {/* F19 — aqui a dica fica SÓ no número, e não na célula
                      inteira como na coluna de filial: a badge "repor" tem
                      dica própria e um gatilho dentro do outro abriria as duas
                      ao mesmo tempo no hover. */}
                  <Dica texto={detalhe(linha.consolidado, 'Todas as filiais')}>
                    {linha.consolidado.estoque.toLocaleString('pt-BR')}
                  </Dica>
                  <BadgeRepor
                    estoqueConsolidado={linha.consolidado.estoque}
                    estoqueMinimo={minimoDoItem(minimos, linha.item_id)}
                  />
                  {fora > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">
                      inclui {fora.toLocaleString('pt-BR')} de filial desativada
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-1 text-right">
                {/* Sem filial no preset: o "+" é da LINHA, não da célula, e a
                    visão não tem recorte de filial. O dialog abre com o campo
                    Filial vazio para o operador escolher (lancar-item-dialog). */}
                <LancarItemLinha itemId={linha.item_id} item={linha.item} filialId={null} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

'use client'

import Link from 'next/link'
import { ArrowRightLeft, MoreHorizontal, Plus, ScrollText } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dica } from '@/components/ui/dica'
import { QuadroDeTabela } from '@/components/layout/quadro-de-tabela'
import { BotaoExpandir, useExpandidas } from '@/components/relatorios/linha-expansivel'
import { BadgeRepor } from '@/components/itens/badge-repor'
import { dispararLancarItem } from '@/components/itens/lancar-item-evento'
import { dispararTransferirItem } from '@/components/itens/transferir-item-evento'
import { GRUPO_ITEM_META } from '@/lib/dominio'
import { emUsoDoSaldo, type LinhaDeItem, type NumerosDoItem } from '@/lib/itens/lista'
import { minimoDoItem, type MinimosPorItem } from '@/lib/itens/repor'
import { cn } from '@/lib/utils'
import type { Filial } from '@/lib/queries/filiais'

// A TABELA DE ITENS — UMA só, no casco (F42 · frente A).
//
// ANTES DESTA FASE esta tela tinha DUAS tabelas mutuamente exclusivas, escolhidas
// por um toggle `?visao=` que trocava as COLUNAS: era a única tela do produto em
// que um filtro mudava o formato, e não o recorte. A comparação entre filiais
// virou o que ela sempre deveria ter sido — o DETALHE de cada linha, atrás do
// mesmo chevron que os relatórios usam desde a F16 (`BotaoExpandir`).
//
// A GRAMÁTICA É A DE `/ativos`: um `QuadroDeTabela`, colunas que se revelam
// conforme a largura, e a ação da linha num menu `⋯`. Quem sabe usar a lista de
// ativos sabe usar esta.
//
// ⚠ CLIENT, e não Server Component como a tabela antiga. O motivo é um só: o
// chevron guarda estado (quais linhas estão abertas). Tudo que NÃO precisa de
// estado continua vindo pronto do servidor por prop — os números, os rótulos, o
// mapa de mínimos, a lista de filiais.

// Revelação progressiva, na régua de `ativos-table.tsx`. Em ~375px cabem Item +
// Em estoque + Em uso; as demais aparecem conforme a tela cresce. Nenhuma coluna
// SOME de vez: o que se esconde na largura pequena está na linha expansível.
const COL: Record<string, string> = {
  expandir: 'w-10 print:hidden',
  item: '',
  grupo: 'hidden md:table-cell',
  tipo: 'hidden lg:table-cell',
  total: 'hidden sm:table-cell text-right',
  estoque: 'text-right',
  emUso: 'text-right',
  falta: 'hidden sm:table-cell text-right',
  acoes: 'w-px text-right print:hidden',
}

function Numero({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>{valor.toLocaleString('pt-BR')}</span>
  )
}

/** Rótulo + explicação de um número, vindos de `NUMEROS_ITEM`. */
export type CabecalhoDeNumero = { chave: string; rotulo: string; explicacao: string }

/**
 * O cabeçalho de uma coluna de número, com a explicação de UMA linha atrás da
 * dica (ITN-05a). O texto vem de `NUMEROS_ITEM` — a MESMA fonte da página de
 * ajuda —, então ninguém redigita a fórmula da coluna Falta aqui.
 *
 * Fora do componente de propósito: componente declarado DENTRO do render é
 * remontado a cada passada (regra `react-hooks/static-components`).
 */
function Cabecalho({
  cabecalhos,
  chave,
  padrao,
}: {
  cabecalhos: readonly CabecalhoDeNumero[]
  chave: string
  padrao: string
}) {
  const meta = cabecalhos.find((c) => c.chave === chave)
  const nome = meta?.rotulo ?? padrao
  return meta?.explicacao ? <Dica texto={meta.explicacao}>{nome}</Dica> : <>{nome}</>
}

/** O selo vermelho do déficit. Idêntico ao de antes — é aviso diferente do "repor". */
function SeloFalta({ s }: { s: NumerosDoItem }) {
  if (s.falta <= 0) return <span className="text-muted-foreground">—</span>
  return (
    <Dica
      texto={`Compromisso já assumido: ${s.atrelados.toLocaleString('pt-BR')} reservado(s) e ${emUsoDoSaldo(s).toLocaleString('pt-BR')} em uso, para um total de ${s.total.toLocaleString('pt-BR')}`}
      className="inline-flex"
    >
      <Badge className="border-transparent bg-red-100 text-red-700 tabular-nums dark:bg-red-950 dark:text-red-300">
        faltam {s.falta.toLocaleString('pt-BR')}
      </Badge>
    </Dica>
  )
}

export function ItensTable({
  rows,
  filiais,
  minimos,
  escreve,
  filialPreset,
  filiaisTransferencia = [],
  cabecalhos,
}: {
  rows: LinhaDeItem[]
  /** As filiais que a linha expansível compara. Já recortadas pelo filtro da tela. */
  filiais: Filial[]
  minimos: MinimosPorItem
  /** `podeEscrever(operador?.papel)` — só quem lança vê o menu de ações. */
  escreve: boolean
  /** A filial pré-selecionada do diálogo, quando o filtro tem exatamente uma. */
  filialPreset: number | null
  /**
   * F31 · ITN-01 — ids das filiais em que este cargo escreve, quando há DUAS ou
   * mais. O atalho de transferir aparece na linha da filial que está aqui E que
   * tenha estoque > 0: não se transfere de uma prateleira vazia.
   */
  filiaisTransferencia?: readonly number[]
  /**
   * Rótulo + explicação de cada número, vindos de `NUMEROS_ITEM`
   * (`src/lib/ajuda/conteudo/itens-por-quantidade.ts`) — a MESMA fonte da página
   * de ajuda, para ninguém redigitar a fórmula da coluna Falta. Desce por PROP a
   * partir do Server Component.
   */
  cabecalhos: readonly CabecalhoDeNumero[]
}) {
  const { estaAberta, alternar } = useExpandidas()

  // O número de colunas visíveis no maior breakpoint — a linha de detalhe usa
  // `colSpan` e o navegador limita ao número real, então um teto serve.
  const colunas = 8 + (escreve ? 1 : 0)

  return (
    <QuadroDeTabela>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={COL.expandir}>
              <span className="sr-only">Comparar filiais</span>
            </TableHead>
            <TableHead className={COL.item}>Item</TableHead>
            <TableHead className={COL.grupo}>Grupo</TableHead>
            <TableHead className={COL.tipo}>Tipo</TableHead>
            <TableHead className={COL.total}>
              <Cabecalho cabecalhos={cabecalhos} chave="total" padrao="Total" />
            </TableHead>
            <TableHead className={COL.estoque}>
              <Cabecalho cabecalhos={cabecalhos} chave="estoque" padrao="Em estoque" />
            </TableHead>
            <TableHead className={COL.emUso}>
              <Cabecalho cabecalhos={cabecalhos} chave="emUso" padrao="Em uso" />
            </TableHead>
            <TableHead className={COL.falta}>
              <Cabecalho cabecalhos={cabecalhos} chave="falta" padrao="Falta" />
            </TableHead>
            {escreve && (
              <TableHead className={COL.acoes}>
                <span className="sr-only">Ações</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((linha) => {
            const aberta = estaAberta(String(linha.item_id))
            const emUso = emUsoDoSaldo(linha.saldo)
            return [
              <TableRow key={linha.item_id}>
                <TableCell className={COL.expandir}>
                  <BotaoExpandir
                    aberta={aberta}
                    onClick={() => alternar(String(linha.item_id))}
                    rotulo={
                      aberta
                        ? `Esconder as filiais de ${linha.item}`
                        : `Comparar as filiais de ${linha.item}`
                    }
                  />
                </TableCell>
                <TableCell className={cn(COL.item, 'font-medium')}>
                  {/* "repor" fica junto do NOME, e "faltam N" na coluna Falta: os
                      dois avisos convivem na mesma linha e significam coisas
                      diferentes ("faltam N" = compromisso já assumido; "repor" =
                      previsão de compra). Empilhados na mesma célula estreita, um
                      passaria por qualificador do outro. */}
                  <span className="flex flex-wrap items-center gap-1.5">
                    {linha.item}
                    <BadgeRepor
                      estoqueConsolidado={linha.consolidado.estoque}
                      estoqueMinimo={minimoDoItem(minimos, linha.item_id)}
                    />
                  </span>
                </TableCell>
                <TableCell className={cn(COL.grupo, 'text-muted-foreground')}>
                  {GRUPO_ITEM_META[linha.grupo].titulo}
                </TableCell>
                <TableCell className={cn(COL.tipo, 'text-muted-foreground')}>
                  {linha.tipoRotulo ?? '—'}
                </TableCell>
                <TableCell className={cn(COL.total, 'text-muted-foreground')}>
                  <Numero valor={linha.saldo.total} />
                </TableCell>
                <TableCell className={COL.estoque}>
                  <Numero valor={linha.saldo.estoque} className="font-semibold" />
                </TableCell>
                <TableCell className={cn(COL.emUso, emUso === 0 && 'text-muted-foreground')}>
                  <Numero valor={emUso} />
                </TableCell>
                <TableCell className={COL.falta}>
                  <SeloFalta s={linha.saldo} />
                </TableCell>
                {escreve && (
                  <TableCell className={COL.acoes}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-10 text-muted-foreground sm:size-8"
                          aria-label={`Ações de ${linha.item}`}
                        >
                          <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="truncate">{linha.item}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {/* O "+" da linha (OS-F9 · I6) mudou de casa, não de
                            comportamento: dispara o MESMO evento, com item e
                            filial pré-preenchidos. */}
                        <DropdownMenuItem
                          onSelect={() =>
                            dispararLancarItem({ itemId: linha.item_id, filialId: filialPreset })
                          }
                        >
                          <Plus className="size-4" aria-hidden />
                          Lançar quantidade
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/itens/historico?item=${linha.item_id}`}>
                            <ScrollText className="size-4" aria-hidden />
                            Ver histórico deste item
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>,

              aberta ? (
                <TableRow key={`${linha.item_id}-filiais`} className="hover:bg-transparent">
                  <TableCell colSpan={colunas} className="bg-muted/30 p-0">
                    <FiliaisDoItem
                      linha={linha}
                      filiais={filiais}
                      filiaisTransferencia={filiaisTransferencia}
                    />
                  </TableCell>
                </TableRow>
              ) : null,
            ]
          })}
        </TableBody>
      </Table>
    </QuadroDeTabela>
  )
}

/**
 * A comparação entre filiais de UM item — o que era a segunda tabela inteira.
 *
 * Uma linha por filial, com os mesmos quatro números da tabela de cima, mais o
 * atalho de transferência (que é da FILIAL de origem — ele diz de onde o item
 * sai — e por isso mora aqui e não na linha do item).
 */
function FiliaisDoItem({
  linha,
  filiais,
  filiaisTransferencia,
}: {
  linha: LinhaDeItem
  filiais: Filial[]
  filiaisTransferencia: readonly number[]
}) {
  const ZERO: NumerosDoItem = { total: 0, estoque: 0, atrelados: 0, falta: 0 }
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {linha.item} em cada filial — na prateleira, com as pessoas e no acervo.
      </p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
        {filiais.map((f) => {
          const c = linha.porFilial[f.id] ?? ZERO
          const emUso = emUsoDoSaldo(c)
          const podeTransferirDaqui =
            c.estoque > 0 && filiaisTransferencia.includes(f.id)
          return (
            <div key={f.id} className="flex items-baseline justify-between gap-3 border-b py-1">
              <dt className="min-w-0 truncate font-medium">{f.nome}</dt>
              <dd className="flex shrink-0 items-center gap-3 tabular-nums">
                <span className={cn(c.estoque > 0 ? 'font-semibold' : 'text-muted-foreground')}>
                  {c.estoque.toLocaleString('pt-BR')}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    em estoque
                  </span>
                </span>
                <span className={cn(emUso === 0 && 'text-muted-foreground')}>
                  {emUso.toLocaleString('pt-BR')}
                  <span className="ml-1 text-xs text-muted-foreground">em uso</span>
                </span>
                {/* O TOTAL DA FILIAL. A tabela antiga o escondia no `title` de cada
                    célula, junto com o reservado; a revisão adversarial da F42
                    apontou que ele tinha sumido no redesenho, e ele volta VISÍVEL —
                    é o número que fecha a conta da linha (estoque + em uso). */}
                <span className="text-muted-foreground">
                  {c.total.toLocaleString('pt-BR')}
                  <span className="ml-1 text-xs">no acervo</span>
                </span>
                {/* Reservado só aparece quando NÃO é zero, que é o caso normal desde
                    a conversão da F41. Uma coluna permanentemente vazia é ruído; o
                    número escondido, quando existe, é dado que falta. */}
                {c.atrelados > 0 && (
                  <span className="text-muted-foreground">
                    {c.atrelados.toLocaleString('pt-BR')}
                    <span className="ml-1 text-xs">reservado</span>
                  </span>
                )}
                {c.falta > 0 && (
                  <Badge className="border-transparent bg-red-100 text-red-700 tabular-nums dark:bg-red-950 dark:text-red-300">
                    faltam {c.falta.toLocaleString('pt-BR')}
                  </Badge>
                )}
                {podeTransferirDaqui && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    aria-label={`Transferir ${linha.item} de ${f.nome} para outra filial`}
                    title={`Transferir de ${f.nome}`}
                    onClick={() =>
                      dispararTransferirItem({ itemId: linha.item_id, origemId: f.id })
                    }
                  >
                    <ArrowRightLeft className="size-3.5" aria-hidden />
                  </Button>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      {/* Quanto do Total não está em nenhuma das filiais listadas (filial
          desativada com saldo). Zero é o caso normal — quando não é, a linha não
          fecha e a tela precisa dizer por quê. */}
      {linha.foraDasFiliais > 0 && (
        <p className="text-xs text-muted-foreground">
          Inclui {linha.foraDasFiliais.toLocaleString('pt-BR')} em estoque de filial fora
          desta lista.
        </p>
      )}
      {linha.consolidado.atrelados > 0 && (
        <p className="text-xs text-muted-foreground">
          {linha.consolidado.atrelados.toLocaleString('pt-BR')} reservado(s) para chamado —
          nenhuma tela cria reserva nova desde 31/08/2026; o número existe para o histórico.
        </p>
      )}
    </div>
  )
}

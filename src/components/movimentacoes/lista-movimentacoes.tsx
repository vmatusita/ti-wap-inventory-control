import Link from 'next/link'
import { ArrowLeftRight, Copy } from 'lucide-react'
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
import { Dica } from '@/components/ui/dica'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { formatDate, formatTime, ouTraco } from '@/lib/format'
import { pillTipo, rotuloTipo } from '@/lib/dominio'
import { inicioDeLote } from '@/lib/movimentacoes/agrupar-lote'
import { cn } from '@/lib/utils'
import type { MovimentacaoLista } from '@/lib/queries/movimentacoes'

// Revelação progressiva (mesma ideia de `ativos-table.tsx`): em ~375px só cabem
// Data, Tipo e Patrimônio; o resto aparece conforme a tela cresce. O evento
// inteiro continua a um toque de distância, pela ficha do ativo.
const COL_COLABORADOR = 'hidden sm:table-cell'
const COL_FILIAL = 'hidden md:table-cell'
const COL_OBS = 'hidden lg:table-cell'
const COL_OPERADOR = 'hidden xl:table-cell'

// Lista de movimentações (F11 · M8). Server Component: nada aqui é interativo
// além do tooltip da observação, que tem a própria fronteira `'use client'`.
// Uma linha por movimentação, da mais recente para a mais antiga.
// F21 — `podeRegistrar` (cargo ≥ operador) só decide se o estado vazio oferece o
// atalho "Registrar a primeira": a lista em si é leitura, igual para todo cargo.
export function ListaMovimentacoes({
  rows,
  temFiltro,
  // F25-fix — a saída do vazio filtrado vem PRONTA da página, porque só ela sabe
  // distinguir "filtro na URL" (limpar) de "recorte do cargo" (alargar). Antes o
  // texto daqui mandava "limpe os filtros" mesmo quando não havia filtro nenhum na
  // URL — e nesse caso o botão "Limpar" da barra também não existia, então a
  // instrução apontava para um controle invisível.
  vazio,
  podeRegistrar = false,
}: {
  rows: MovimentacaoLista[]
  temFiltro: boolean
  vazio?: { descricao?: string; acao?: { href: string; rotulo: string } }
  podeRegistrar?: boolean
}) {
  if (rows.length === 0) {
    return temFiltro ? (
      <EstadoVazio
        icone={ArrowLeftRight}
        titulo="Nenhuma movimentação com esses filtros"
        descricao={
          vazio?.descricao ??
          'Ajuste o período, o tipo, a filial ou a busca — ou limpe os filtros para ver tudo.'
        }
        acao={vazio?.acao}
      />
    ) : (
      <EstadoVazio
        icone={ArrowLeftRight}
        titulo="Nenhuma movimentação registrada ainda"
        descricao="Toda saída, devolução, transferência ou manutenção aparece aqui assim que for registrada."
        acao={
          podeRegistrar
            ? { href: '/movimentacoes/nova', rotulo: 'Registrar a primeira' }
            : undefined
        }
      />
    )
  }

  // F28/MOV-06 — separador visual entre LOTES: um lote de N ativos registrado de
  // uma vez vira N linhas idênticas; a borda superior mais forte junta o bloco
  // sem precisar de uma linha de cabeçalho nova. Ver o comentário de
  // `inicioDeLote` para a definição (autor + minuto) e a limitação aceita.
  const iniciosDeLote = inicioDeLote(
    rows.map((m) => ({
      id: m.id,
      created_at: m.created_at,
      autor_nome: m.autor_nome,
    })),
  )

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Patrimônio</TableHead>
            <TableHead className={COL_COLABORADOR}>Colaborador</TableHead>
            <TableHead className={COL_FILIAL}>Filial</TableHead>
            <TableHead className={COL_OPERADOR}>Operador</TableHead>
            <TableHead className={COL_OBS}>Obs.</TableHead>
            <TableHead>
              <span className="sr-only">Duplicar</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow
              key={m.id}
              className={cn(
                m.estornada && 'opacity-60',
                // A 1ª linha da PÁGINA nunca marca (inicioDeLote já garante
                // isso — não há id dela no conjunto).
                iniciosDeLote.has(m.id) && 'border-t-2 border-t-foreground/20',
              )}
            >
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                <div className="flex flex-col leading-tight">
                  <span>{formatDate(m.data)}</span>
                  {/* Hora do REGISTRO (created_at), não a data do evento acima
                      (`data`, de negócio — pode ser retroativa): as duas
                      divergem de propósito, e é a hora do registro que revela
                      um lote lançado de uma vez. */}
                  <Dica
                    texto={`Registrada no sistema às ${formatTime(m.created_at)}. A data acima é a data do EVENTO — pode ser retroativa e não precisa coincidir com o registro.`}
                    className="w-fit text-[10px] font-normal text-muted-foreground/70"
                  >
                    {formatTime(m.created_at)}
                  </Dica>
                </div>
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <span
                  className={cn(
                    'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    pillTipo(m.tipo),
                  )}
                >
                  {rotuloTipo(m.tipo)}
                </span>
                {/* Mesma linguagem da linha do tempo: a movimentação DESFEITA
                    fica esmaecida e marcada; o estorno se identifica. */}
                {m.ehEstorno && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    (estorno)
                  </span>
                )}
                {m.estornada && !m.ehEstorno && (
                  <span className="ml-1 text-[10px] font-medium text-destructive">
                    (estornada)
                  </span>
                )}
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <Link
                  href={`/ativos/${m.ativo_id}`}
                  className="rounded-sm font-medium tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {m.patrimonio ?? (
                    // Ativo sem patrimônio físico (import F7E) — o link continua,
                    // é o único caminho para a ficha.
                    <Badge
                      variant="outline"
                      className="font-normal text-muted-foreground"
                    >
                      sem patrimônio
                    </Badge>
                  )}
                </Link>
                {/* Patrimônio repete em casos raros (spec §5): buscar um deles
                    traz o histórico de DOIS ativos intercalado. A service tag
                    desempata na própria linha — mesmo chip da paleta de comandos
                    e da coluna Service Tag de /ativos. */}
                {m.patrimonio_duplicado && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-[11px] tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ST {m.service_tag ?? '—'}
                  </span>
                )}
              </TableCell>

              <TableCell className={cn('whitespace-nowrap', COL_COLABORADOR)}>
                {ouTraco(m.colaborador)}
              </TableCell>

              <TableCell
                className={cn(
                  'whitespace-nowrap text-muted-foreground',
                  COL_FILIAL,
                )}
              >
                {ouTraco(m.filial_nome)}
              </TableCell>

              <TableCell
                className={cn(
                  'whitespace-nowrap text-muted-foreground',
                  COL_OPERADOR,
                )}
              >
                {ouTraco(m.autor_nome)}
              </TableCell>

              <TableCell className={COL_OBS}>
                <div className="max-w-[220px]">
                  <ObsTooltip
                    texto={m.observacao}
                    comIcone
                    className="w-full text-xs"
                  />
                </div>
              </TableCell>

              <TableCell className="whitespace-nowrap">
                {/* "Duplicar" por linha (F28/MOV-06) — mesma regra de
                    `linha-do-tempo.tsx` (o estorno não se duplica: duplicar
                    um estorno reabriria uma discussão que já foi encerrada).
                    Ícone-only + `after:` para um alvo de toque decente no
                    celular sem inchar a coluna. */}
                {m.tipo !== 'estorno' && (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon-sm"
                    className="relative after:absolute after:-inset-2 after:content-['']"
                  >
                    <Link
                      href={`/movimentacoes/nova?duplicar=${m.id}`}
                      aria-label={`Duplicar esta movimentação de ${rotuloTipo(m.tipo)}`}
                    >
                      <Copy className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

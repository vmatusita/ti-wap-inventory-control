'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronsUpDown, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dica } from '@/components/ui/dica'
import { StatusBadge } from '@/components/ativos/status-badge'
import { CopiarPatrimonio } from '@/components/ativos/copiar-patrimonio'
import { BarraSelecaoAtivos } from '@/components/ativos/barra-selecao-ativos'
import {
  alternarSelecao,
  estadoDoCabecalho,
  marcarTodosDaPagina,
  MAX_SELECAO,
  podarForaDaPagina,
  textoCopiavel,
} from '@/components/ativos/selecao-ativos'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import { SEPARADOR_IDS } from '@/lib/movimentacoes/lote-url'
import { formatDate, ouTraco } from '@/lib/format'
import { rotuloCategoria } from '@/lib/dominio'
import {
  ehColunaOrdenavel,
  parseOrdenacao,
  proximaDirecao,
  serializarOrdenacao,
  type ColunaOrdenavel,
  type DirecaoOrdenacao,
} from '@/lib/ativos/lista'
import { cn } from '@/lib/utils'
import type { AtivoLista } from '@/lib/queries/ativos'

// Revelação progressiva de colunas: em ~375px só cabem Patrimônio + Categoria +
// Status; as demais aparecem conforme a tela cresce, eliminando a rolagem
// horizontal longa no mobile (o ativo já é acessível pelo link do patrimônio).
const COL_RESP: Record<string, string> = {
  // ATV-03 — a coluna de seleção acompanha a tabela em toda largura (é ela que
  // dá acesso à ação em lote no celular também) e nunca vai para o papel.
  selecao: 'w-10 print:hidden',
  patrimonio: '',
  categoria: '',
  status: '',
  colaborador_atual: 'hidden sm:table-cell',
  modelo: 'hidden md:table-cell',
  filial_nome: 'hidden lg:table-cell',
  updated_at: 'hidden xl:table-cell',
}

export function AtivosTable({
  rows,
  duplicados,
  escreve,
}: {
  rows: AtivoLista[]
  // ATV-06 — o `resultado.patrimoniosDuplicados` de `listarAtivos` (Set dos
  // patrimônios que se repetem NA PÁGINA aberta). Antes virava uma coluna
  // condicional (`showServiceTag: boolean`) que aparecia e sumia a cada troca
  // de página — e nem aparecia no celular (`hidden lg:table-cell`), onde
  // desambiguar patrimônio repetido importa mais. Agora decide, LINHA A LINHA,
  // se a service tag daquela linha vira sublinha do patrimônio.
  duplicados: ReadonlySet<string>
  // ATV-03 — `podeEscrever(operador?.papel)`, resolvido na página. A seleção em
  // lote só existe para quem pode registrar movimentação: o cargo Consulta não
  // vê caixa nenhuma (a leitura da lista continua idêntica para todos). Segunda
  // linha, como sempre — a trava real é a action `registrarMovimentacoes`.
  escreve: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  // Ordenar troca o searchParam na mesma rota (não dispara o loading.tsx): a
  // barra global dá o feedback, como já acontece nos filtros e na paginação.
  useReportarNavegacao(isPending)

  // A ordenação é SERVER-SIDE e mora na URL — a TanStack Table segue em modo
  // exibição (sem sorting client-side, que só reordenaria a página aberta).
  const ordenacao = parseOrdenacao(params.get('ord'))

  // ATV-03 — a seleção usa o `rowSelection` da TanStack (com `getRowId` no id do
  // ativo, então as chaves do estado SÃO os ids que vão para a URL). O teto de
  // MAX_SELECAO não é dela: mora nos handlers, em funções puras testadas
  // (`selecao-ativos.ts`), porque a página traz até 100 linhas e o lote aceita 30.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const selecionados = useMemo(
    () => new Set(Object.keys(rowSelection).filter((id) => rowSelection[id])),
    [rowSelection],
  )
  const idsDaPagina = useMemo(() => rows.map((r) => r.id), [rows])

  // Trocar de página/filtro/busca troca `rows` sem desmontar a tabela (é a mesma
  // rota, o React reaproveita a árvore) — sem a poda a barra anunciaria
  // "5 selecionados" com duas linhas na tela, e "Movimentar" levaria ativos que o
  // operador não está mais vendo. A seleção é POR PÁGINA (ata em DECISOES).
  useEffect(() => {
    setRowSelection((prev) => {
      // ⚠ Comparar com `Object.keys(prev).length` seria comparar grandezas
      // diferentes: aquilo conta TODAS as chaves, inclusive as de valor `false`
      // que um caminho interno da TanStack pode deixar para trás (o
      // `onRowSelectionChange` está ligado direto no setter). Com uma chave
      // `false` sobrando, o atalho "nada mudou" nunca mais seria atingido e o
      // efeito reescreveria o estado a cada ordenação. O que se compara é o
      // número de MARCADOS.
      const marcados = Object.keys(prev).filter((id) => prev[id])
      const podado = podarForaDaPagina(new Set(marcados), idsDaPagina)
      if (podado.size === marcados.length) return prev
      return Object.fromEntries([...podado].map((id) => [id, true]))
    })
  }, [idsDaPagina])

  function aplicar(proxima: ReadonlySet<string>) {
    setRowSelection(Object.fromEntries([...proxima].map((id) => [id, true])))
  }

  function marcarLinha(id: string, marcar: boolean) {
    const r = alternarSelecao(selecionados, id, marcar)
    if (r.foraPeloTeto > 0) {
      // Mesma voz do corte do "Colar lista" (colar-lista-dialog.tsx): o operador
      // reencontra a frase que já conhece do outro caminho do mesmo wizard.
      toast.warning(
        `A seleção aceita ${MAX_SELECAO} ativos — o mesmo teto do lote de movimentação. Registre o resto em outro lote.`,
      )
      return
    }
    aplicar(r.proxima)
  }

  function marcarPagina(marcar: boolean) {
    const r = marcarTodosDaPagina(selecionados, idsDaPagina, marcar)
    aplicar(r.proxima)
    if (r.foraPeloTeto > 0) {
      toast.warning(
        `${r.entraram} ${r.entraram === 1 ? 'ativo selecionado' : 'ativos selecionados'}: a seleção aceita ${MAX_SELECAO} e ${r.foraPeloTeto} ${r.foraPeloTeto === 1 ? 'ficou' : 'ficaram'} de fora.`,
      )
    }
  }

  // As duas ações das caixas, sempre na versão do último render. Os ColumnDef
  // são memoizados por `[duplicados, escreve]` e não podem fechar sobre
  // `selecionados`/`idsDaPagina` (é o que os fazia ser reconstruídos a cada
  // clique); a ref é a ponte. Sincronizada em efeito — nunca no corpo do render,
  // que é escrita em ref durante a renderização.
  const acoes = useRef({ marcarLinha, marcarPagina })
  useEffect(() => {
    acoes.current = { marcarLinha, marcarPagina }
  })

  function movimentarSelecionados() {
    // A ORDEM importa: vai como o operador vê a lista (ordenação atual), e é a
    // ordem em que o lote nasce no passo 1 do wizard.
    const ids = idsDaPagina.filter((id) => selecionados.has(id))
    if (ids.length === 0) return
    startTransition(() =>
      router.push(`/movimentacoes/nova?ativos=${ids.join(SEPARADOR_IDS)}`),
    )
  }

  async function copiarPatrimonios() {
    const escolhidos = rows.filter((r) => selecionados.has(r.id))
    const { texto, copiados, semPatrimonio } = textoCopiavel(
      escolhidos.map((r) => r.patrimonio),
    )
    if (copiados === 0) {
      toast.error('Nenhum dos ativos selecionados tem patrimônio para copiar.')
      return
    }
    // UXG-08a — o guard e o try/catch são os dois caminhos de falha reais do
    // clipboard (API ausente em contexto não seguro e permissão negada).
    if (!navigator.clipboard?.writeText) {
      toast.error('Não foi possível copiar — copie manualmente.')
      return
    }
    try {
      await navigator.clipboard.writeText(texto)
      const sobra =
        semPatrimonio > 0
          ? ` (${semPatrimonio} sem patrimônio ${semPatrimonio === 1 ? 'ficou' : 'ficaram'} de fora)`
          : ''
      toast.success(
        `${copiados} ${copiados === 1 ? 'patrimônio copiado' : 'patrimônios copiados'}${sobra}.`,
      )
    } catch {
      toast.error('Não foi possível copiar — copie manualmente.')
    }
  }

  // Ciclo do cabeçalho: asc → desc → limpa (volta ao default `updated_at desc`).
  function alternarOrdem(coluna: ColunaOrdenavel) {
    const atual = ordenacao?.coluna === coluna ? ordenacao.direcao : null
    const proxima = proximaDirecao(atual)
    const novo = new URLSearchParams(params.toString())
    if (proxima) novo.set('ord', serializarOrdenacao({ coluna, direcao: proxima }))
    else novo.delete('ord')
    novo.delete('page') // reordenar volta p/ a página 1
    const qs = novo.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  const columns = useMemo<ColumnDef<AtivoLista>[]>(() => {
    const cols: ColumnDef<AtivoLista>[] = []

    // ATV-03 — a coluna de seleção só existe para quem escreve. `escreve` ENTRA
    // no array de dependências do useMemo lá embaixo: sem isso a coluna
    // congelaria no valor do primeiro render.
    //
    // ⚠ O QUE ESTE BLOCO **NÃO** PODE LER: `selecionados`. Ele muda a cada caixa
    // marcada, e tê-lo como dependência reconstruía os oito ColumnDef a cada
    // clique — o que obriga a TanStack a refazer o modelo de colunas e recriar
    // as células das até 100 linhas da página. O estado da caixa sai do próprio
    // `row`/`table` (que a TanStack já deriva de `state.rowSelection`) e as
    // ações saem de `acoes`, uma ref estável. Assim o memo depende só do que
    // muda de verdade quando a TABELA muda.
    if (escreve) {
      cols.push({
        id: 'selecao',
        header: ({ table }) => {
          const linhas = table.getRowModel().rows
          return (
            <Checkbox
              checked={estadoDoCabecalho(
                new Set(linhas.filter((l) => l.getIsSelected()).map((l) => l.id)),
                linhas.map((l) => l.id),
              )}
              onCheckedChange={(v) => acoes.current.marcarPagina(v === true)}
              // O rótulo diz o TETO, não só a ação: numa página de 100 o clique
              // marca 30, e quem usa leitor de tela precisa saber disso antes.
              aria-label={`Selecionar os ativos desta página (até ${MAX_SELECAO})`}
              className="after:-inset-y-3 sm:after:-inset-y-2"
            />
          )
        },
        cell: ({ row }) => {
          const { id, patrimonio } = row.original
          return (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(v) => acoes.current.marcarLinha(id, v === true)}
              // Nomeia o ativo: uma coluna de caixas todas chamadas
              // "Selecionar" é inútil para quem navega por teclado.
              aria-label={`Selecionar ${patrimonio ?? 'ativo sem patrimônio'}`}
              // F29/UXG-03 — o alvo de toque do checkbox do shadcn vem da área
              // invisível do `after:` (40px de largura, 32 de altura). No
              // celular a altura sobe para 40; no desktop volta ao padrão.
              className="after:-inset-y-3 sm:after:-inset-y-2"
            />
          )
        },
      })
    }

    cols.push(
      {
        accessorKey: 'patrimonio',
        header: 'Patrimônio',
        cell: ({ row }) => {
          const { patrimonio, service_tag } = row.original
          // ATV-06 — a service tag vira sublinha SÓ quando o patrimônio desta
          // LINHA se repete na página (é justamente o par patrimônio+tag que
          // desambigua — spec §5) e há o que mostrar. Visível em qualquer
          // largura (sem `hidden …:table-cell`), diferente da antiga coluna.
          const mostrarServiceTag =
            patrimonio !== null && duplicados.has(patrimonio) && Boolean(service_tag)
          return (
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-0.5">
                <Link
                  href={`/ativos/${row.original.id}`}
                  className="font-medium tabular-nums underline-offset-4 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {patrimonio ?? (
                    <Badge
                      variant="outline"
                      className="font-normal text-muted-foreground"
                    >
                      sem patrimônio
                    </Badge>
                  )}
                </Link>
                {/* Ativo sem patrimônio (F7E) não tem o que copiar. O botão
                    para a propagação do clique — a LINHA navega por onClick. */}
                {patrimonio && <CopiarPatrimonio valor={patrimonio} />}
                {/* ATV-02 — indicador discreto de pendência (texto livre em
                    `ativos.pendencia`): só o ícone, sem faixa full-width — a
                    faixa âmbar completa já existe na ficha do ativo. */}
                {row.original.pendencia && (
                  <Dica texto={row.original.pendencia}>
                    <TriangleAlert
                      aria-hidden
                      className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500"
                    />
                    <span className="sr-only">
                      Pendência: {row.original.pendencia}
                    </span>
                  </Dica>
                )}
              </span>
              {mostrarServiceTag && (
                <span className="tabular-nums text-xs text-muted-foreground">
                  {service_tag}
                </span>
              )}
            </span>
          )
        },
      },
      {
        accessorKey: 'categoria',
        header: 'Categoria',
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-normal">
            {rotuloCategoria(row.original.categoria)}
          </Badge>
        ),
      },
      {
        id: 'modelo',
        header: 'Marca / Modelo',
        cell: ({ row }) => {
          const { marca, modelo } = row.original
          const texto = [marca, modelo].filter(Boolean).join(' ')
          return <span>{texto || '—'}</span>
        },
      },
      {
        accessorKey: 'filial_nome',
        header: 'Filial',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'colaborador_atual',
        header: 'Colaborador',
        cell: ({ row }) => ouTraco(row.original.colaborador_atual),
      },
      {
        accessorKey: 'updated_at',
        header: 'Atualizado em',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDate(row.original.updated_at)}
          </span>
        ),
      },
    )

    return cols
  }, [duplicados, escreve])

  // TanStack Table retorna funcoes que o React Compiler nao memoiza; aqui a
  // tabela e so de exibicao (paginacao/filtros sao server-side), sem risco.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // ATV-03 — sem isto as chaves de `rowSelection` seriam o ÍNDICE da linha, e
    // a poda por página (e o `?ativos=`) precisam do id do ativo.
    getRowId: (row) => row.id,
    enableRowSelection: escreve,
    state: { rowSelection },
    // O teto mora nos handlers das caixas (`marcarLinha`/`marcarPagina`), que já
    // aplicam `alternarSelecao`/`marcarTodosDaPagina`. Este adaptador existe para
    // qualquer caminho INTERNO da TanStack continuar consistente com o estado.
    onRowSelectionChange: setRowSelection,
  })

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => {
                const colunaId = h.column.id
                const ordenavel = ehColunaOrdenavel(colunaId)
                // Direção ATIVA nesta coluna (null = ordenada por outra, ou por
                // nenhuma). Variável separada p/ o TS estreitar `ordenacao`.
                const direcao: DirecaoOrdenacao | null =
                  ordenavel && ordenacao?.coluna === colunaId
                    ? ordenacao.direcao
                    : null
                const rotulo = h.isPlaceholder
                  ? null
                  : flexRender(h.column.columnDef.header, h.getContext())
                return (
                  <TableHead
                    key={h.id}
                    // Coluna não ordenável não recebe aria-sort nenhum; as
                    // ordenáveis anunciam o estado (inclusive 'none').
                    aria-sort={
                      !ordenavel
                        ? undefined
                        : direcao === 'asc'
                          ? 'ascending'
                          : direcao === 'desc'
                            ? 'descending'
                            : 'none'
                    }
                    className={cn('whitespace-nowrap', COL_RESP[colunaId])}
                  >
                    {ordenavel ? (
                      // <button> de verdade: Tab chega, Enter/Espaço acionam.
                      // Sem `disabled` durante a transição de propósito: um
                      // <button> focado que fica desabilitado JOGA O FOCO PARA
                      // O BODY, e o teclado teria de recomeçar do topo da
                      // página a cada clique de ordenação.
                      <button
                        type="button"
                        onClick={() => alternarOrdem(colunaId)}
                        className={cn(
                          '-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium',
                          // F29/UXG-03 — o alvo era ~28px (só o padding), e é o
                          // controle mais tocado do cabeçalho. `min-h-10` no celular,
                          // `sm:min-h-0` de volta à densidade de antes no desktop —
                          // aqui é `min-h` (e não `h`) porque o botão é `inline-flex`
                          // dentro de um <th> e uma altura fixa desalinharia o texto
                          // dos cabeçalhos que NÃO ordenam.
                          'min-h-10 sm:min-h-0',
                          'transition-colors hover:text-foreground',
                          'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          direcao ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {rotulo}
                        {direcao === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : direcao === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ChevronsUpDown
                            className="size-3.5 opacity-40"
                            aria-hidden
                          />
                        )}
                      </button>
                    ) : (
                      rotulo
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() => router.push(`/ativos/${row.original.id}`)}
              className="cursor-pointer"
              // `data-[state=selected]:bg-muted` já vem no `ui/table.tsx`.
              data-state={row.getIsSelected() ? 'selected' : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn('whitespace-nowrap', COL_RESP[cell.column.id])}
                  // ATV-03 — a LINHA INTEIRA navega para a ficha. Sem parar a
                  // propagação aqui, marcar a caixa (com o mouse OU com Espaço,
                  // que dispara um `click` de verdade) também abriria o ativo.
                  onClick={
                    cell.column.id === 'selecao'
                      ? (e) => e.stopPropagation()
                      : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {escreve && (
        <BarraSelecaoAtivos
          quantidade={selecionados.size}
          onMovimentar={movimentarSelecionados}
          onCopiar={copiarPatrimonios}
          onLimpar={() => setRowSelection({})}
        />
      )}
    </div>
  )
}

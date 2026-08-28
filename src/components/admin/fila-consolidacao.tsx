'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { casaBusca } from '@/lib/ajuda/busca'
import { consolidarColaboradores } from '@/lib/actions/colaboradores'
import type {
  ResumoConsolidacao,
  TextoDeColaborador,
} from '@/lib/queries/colaboradores'
import type { Filial } from '@/lib/queries/filiais'

// F37/A.5 — a fila de consolidação: os nomes que foram digitados à mão e ainda não
// têm cadastro, agrupados pela chave normalizada.
//
// O QUE ESTA TELA **NÃO** FAZ, e é o ponto da fase: ela não altera uma única linha de
// histórico. `guarda_acervo` (0081) recusa UPDATE em `movimentacoes` e
// `lancamentos_item` para todo mundo — service role incluso — e está certa. O que ela
// faz é CRIAR os cadastros que faltam; a partir daí o passado se resolve por chave na
// leitura, e todo registro novo nasce com o vínculo gravado.
//
// TODA CONTAGEM AQUI VEM SOMADA DO BANCO (view `v_colaboradores_textos`), nunca de
// linhas contadas no cliente — é a lição do teto de 1.000
// (docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md). E quando a LISTA é cortada pelo teto,
// a tela diz isso na cara em vez de deixar o número parecer o total.

const LOTE_MAXIMO = 200

export function FilaConsolidacao({
  fila,
  resumo,
  filiais,
}: {
  fila: readonly TextoDeColaborador[]
  resumo: ResumoConsolidacao
  filiais: readonly Filial[]
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [salvando, iniciar] = useTransition()

  const nomeDaFilial = useMemo(
    () => new Map(filiais.map((f) => [f.id, f.nome])),
    [filiais],
  )

  const visiveis = useMemo(
    () => fila.filter((g) => casaBusca(g.grafia_exemplo, busca)),
    [fila, busca],
  )

  const marcadasVisiveis = visiveis.filter((g) => marcadas.has(g.nome_chave)).length
  const todasVisiveisMarcadas =
    visiveis.length > 0 && marcadasVisiveis === visiveis.length

  function alternar(chave: string) {
    setMarcadas((s) => {
      const nova = new Set(s)
      if (nova.has(chave)) nova.delete(chave)
      else nova.add(chave)
      return nova
    })
  }

  function alternarTodas() {
    setMarcadas((s) => {
      const nova = new Set(s)
      if (todasVisiveisMarcadas) {
        for (const g of visiveis) nova.delete(g.nome_chave)
      } else {
        // Respeita o teto do schema: marcar 500 e ver a action recusar o lote
        // inteiro seria o pior dos dois mundos.
        for (const g of visiveis) {
          if (nova.size >= LOTE_MAXIMO) break
          nova.add(g.nome_chave)
        }
      }
      return nova
    })
  }

  function consolidar() {
    const chaves = [...marcadas]
    if (chaves.length === 0) return
    iniciar(async () => {
      try {
        const res = await consolidarColaboradores({ chaves })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível cadastrar os colaboradores.')
          return
        }
        const criados = res.criados ?? 0
        toast.success(
          criados === 1
            ? '1 colaborador entrou no cadastro.'
            : `${criados.toLocaleString('pt-BR')} colaboradores entraram no cadastro.`,
        )
        setMarcadas(new Set())
        router.refresh()
      } catch {
        // F19 — sem o catch, o throw dentro do startTransition some no error boundary.
        toast.error('Não foi possível cadastrar agora. Tente de novo.')
      }
    })
  }

  return (
    <section className="space-y-3" aria-labelledby="fila-consolidacao-titulo">
      <div>
        <h2
          id="fila-consolidacao-titulo"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <UsersRound className="size-5 shrink-0" aria-hidden />
          Nomes digitados que ainda não têm cadastro
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada linha junta as grafias do mesmo nome (“João Silva”, “JOAO SILVA”,
          “joão&nbsp;&nbsp;silva” contam como uma pessoa só). Cadastrar não altera
          nenhuma movimentação já registrada — o histórico continua exatamente como
          está, e é a partir daqui que os registros novos passam a sair vinculados.
        </p>
      </div>

      {/* Os números vêm SOMADOS do banco. `registrosPendentes` é o total de
          movimentações e lançamentos por trás desses nomes, não o número de linhas
          que couberam na lista abaixo. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao
          rotulo="Nomes sem cadastro"
          valor={resumo.gruposPendentes}
          detalhe={`em ${resumo.registrosPendentes.toLocaleString('pt-BR')} registro(s)`}
        />
        <Cartao
          rotulo="Nomes já cadastrados"
          valor={resumo.gruposCadastrados}
          detalhe={`em ${resumo.registrosCadastrados.toLocaleString('pt-BR')} registro(s)`}
        />
        <Cartao
          rotulo="Selecionados"
          valor={marcadas.size}
          detalhe={`no máximo ${LOTE_MAXIMO} por vez`}
        />
      </div>

      {resumo.truncado && (
        <p
          role="status"
          className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
        >
          A lista abaixo mostra os {fila.length.toLocaleString('pt-BR')} nomes mais
          frequentes — há{' '}
          <span className="font-medium text-foreground tabular-nums">
            {resumo.gruposPendentes.toLocaleString('pt-BR')}
          </span>{' '}
          no total. Cadastre em levas: a cada rodada os já cadastrados saem da fila e
          os próximos aparecem.
        </p>
      )}

      {fila.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Nenhum nome pendente — todo nome já digitado tem cadastro correspondente.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar um nome na fila…"
                aria-label="Buscar um nome na fila de consolidação"
                autoComplete="off"
                className="h-10 pl-8 sm:h-8"
              />
            </div>
            <Button
              size="sm"
              onClick={consolidar}
              disabled={marcadas.size === 0 || salvando}
            >
              {salvando
                ? 'Cadastrando…'
                : `Cadastrar ${marcadas.size || ''} selecionado(s)`.replace('  ', ' ')}
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={todasVisiveisMarcadas}
                      onCheckedChange={alternarTodas}
                      aria-label="Selecionar todos os nomes visíveis"
                    />
                  </TableHead>
                  <TableHead>Nome (grafia mais usada)</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Registros
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Grafias
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Filial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((g) => (
                  <TableRow key={g.nome_chave}>
                    <TableCell>
                      <Checkbox
                        checked={marcadas.has(g.nome_chave)}
                        onCheckedChange={() => alternar(g.nome_chave)}
                        aria-label={`Cadastrar ${g.grafia_exemplo}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{g.grafia_exemplo}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {g.ocorrencias.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {/* Mais de uma grafia é justamente o que a consolidação
                          resolve — vale destacar, não esconder. */}
                      {g.grafias > 1 ? (
                        <Badge variant="secondary" className="font-normal tabular-nums">
                          {g.grafias} grafias
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {g.filial_id != null
                        ? (nomeDaFilial.get(g.filial_id) ?? '—')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  )
}

function Cartao({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: number
  detalhe: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {valor.toLocaleString('pt-BR')}
      </p>
      <p className="text-xs text-muted-foreground">{detalhe}</p>
    </div>
  )
}

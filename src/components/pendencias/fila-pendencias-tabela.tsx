'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRightLeft, PenLine, PackageCheck, Tag, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dica } from '@/components/ui/dica'
import {
  ConfirmarAssinaturaDialog,
  ConfirmarAssinaturaLoteDialog,
} from '@/components/ativos/confirmar-assinatura-dialog'
import { CorrigirPatrimonioDialog } from '@/components/ativos/corrigir-patrimonio-dialog'
import { ResolverPendenciaItemDialog } from '@/components/pendencias/resolver-pendencia-item-dialog'
import { rotuloCategoria, rotuloAcessorio } from '@/lib/dominio'
import { ROTULO_TIPO_PENDENCIA, CLASSE_TIPO_PENDENCIA } from '@/lib/pendencias/rotulos'
import {
  faixaIdadePendencia,
  PENDENCIA_ATENCAO_DIAS,
  PENDENCIA_CRITICA_DIAS,
  type FaixaIdadePendencia,
} from '@/lib/pendencias/idade'
import type { PendenciaDetalhe } from '@/lib/queries/pendencias-detalhe'

// Uma linha da fila com o "desde" JÁ formatado no servidor (o Server Component
// calcula formatDate + "há N dias" + o número de dias): evita `new Date()` no
// cliente e o mismatch de hidratação na virada do dia. `desdeDias` alimenta o
// badge de idade (F28/PND-04, `faixaIdadePendencia`).
export type LinhaFila = PendenciaDetalhe & {
  desdeFmt: string
  desdeRel: string
  desdeDias: number | null
}

// F28/PND-04 — cor não é o único canal: o texto do badge ("há 45 dias") já diz a
// idade; a `Dica` (foco/hover) explica o PORQUÊ do destaque, para quem não distingue
// âmbar de vermelho. Só as duas faixas "acima do limiar" ganham cor — 'nova' segue
// o cinza discreto de sempre (sem badge nenhum).
const CLASSE_FAIXA_IDADE: Record<Exclude<FaixaIdadePendencia, 'nova'>, string> = {
  atencao: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  critica: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}
const DICA_FAIXA_IDADE: Record<Exclude<FaixaIdadePendencia, 'nova'>, string> = {
  atencao: `Pendência parada — aberta há mais de ${PENDENCIA_ATENCAO_DIAS} dias`,
  critica: `Pendência crítica — aberta há mais de ${PENDENCIA_CRITICA_DIAS} dias`,
}

// A fila /pendencias (F18): tabela única com todos os tipos, MAIS a seleção e a
// resolução (individual e em LOTE) das pendências de item. Server Component seria
// suficiente para o resto, mas a seleção múltipla precisa de estado → Client. Os
// demais tipos seguem com sua ação (termo → confirmar assinatura); só os itens
// ganham checkbox + Resolver.
//
// F21 — `podeResolver` (cargo ≥ operador) desliga TUDO o que age: a coluna de
// seleção, a barra de lote e as duas ações por linha. A fila continua legível
// para o cargo Consulta, que é o público de quem só acompanha o que falta.
export function FilaPendenciasTabela({
  rows,
  podeResolver = false,
}: {
  rows: LinhaFila[]
  podeResolver?: boolean
}) {
  // F28/PND-02 — dois universos de seleção que NUNCA se misturam: item faltante
  // seleciona por `pendenciaItemId` (chave da tabela `pendencias_item`); termo
  // seleciona por `p.id`, que NESTA linha é o id do ATIVO (mesma chave que
  // `ConfirmarAssinaturaDialog` já usa por linha). Dois Sets em vez de um Set de
  // chaves compostas — mais simples, e como são universos de tabelas diferentes
  // uma colisão de UUID entre os dois não teria efeito nenhum mesmo que
  // acontecesse (cada Set só é lido pela sua própria ação).
  const [selecionadasItens, setSelecionadasItens] = useState<Set<string>>(new Set())
  const [selecionadasTermos, setSelecionadasTermos] = useState<Set<string>>(new Set())

  // Ids VISÍVEIS nesta página (a seleção some ao paginar/filtrar — cada página
  // resolve/confirma o seu; simples e sem surpresa de "resolvi o que não via").
  const idsItens = useMemo(
    () =>
      rows
        .filter((r) => r.tipo === 'itens' && r.pendenciaItemId)
        .map((r) => r.pendenciaItemId as string),
    [rows],
  )
  const idsTermos = useMemo(
    () => rows.filter((r) => r.tipo === 'termo').map((r) => r.id),
    [rows],
  )
  const selecionadasItensVisiveis = useMemo(
    () => idsItens.filter((id) => selecionadasItens.has(id)),
    [idsItens, selecionadasItens],
  )
  const selecionadasTermosVisiveis = useMemo(
    () => idsTermos.filter((id) => selecionadasTermos.has(id)),
    [idsTermos, selecionadasTermos],
  )
  // "Selecionar todos" cobre os DOIS universos desta página — coerente com as
  // caixas que agora existem nas duas linhas (item e termo).
  const totalSelecionavel = idsItens.length + idsTermos.length
  const totalSelecionado = selecionadasItensVisiveis.length + selecionadasTermosVisiveis.length
  const todosMarcados = totalSelecionavel > 0 && totalSelecionado === totalSelecionavel

  function toggleItem(id: string, on: boolean) {
    setSelecionadasItens((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  function toggleTermo(id: string, on: boolean) {
    setSelecionadasTermos((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  function toggleTodos(on: boolean) {
    setSelecionadasItens((prev) => {
      const next = new Set(prev)
      for (const id of idsItens) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
    setSelecionadasTermos((prev) => {
      const next = new Set(prev)
      for (const id of idsTermos) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }
  function limparSelecao() {
    setSelecionadasItens(new Set())
    setSelecionadasTermos(new Set())
  }

  const nSelItens = selecionadasItensVisiveis.length
  const nSelTermos = selecionadasTermosVisiveis.length

  // F28/PND-02 — critério 4: seleção mista mostra as DUAS ações, cada uma com o
  // contador do seu próprio subconjunto — nunca uma ação silenciosa sobre o
  // grupo errado. "3 termos · 2 itens faltantes selecionados".
  const partesResumo: string[] = []
  if (nSelTermos > 0) partesResumo.push(`${nSelTermos} ${nSelTermos === 1 ? 'termo' : 'termos'}`)
  if (nSelItens > 0) {
    partesResumo.push(`${nSelItens} ${nSelItens === 1 ? 'item faltante' : 'itens faltantes'}`)
  }
  const resumoSelecao = `${partesResumo.join(' · ')} ${totalSelecionado === 1 ? 'selecionado' : 'selecionados'}`

  return (
    <div>
      {/* Barra de lote — aparece com qualquer seleção (termo e/ou item). As duas
          ações convivem lado a lado, cada uma só quando o subconjunto dela tem
          alguém selecionado, cada botão com o próprio contador. */}
      {podeResolver && (nSelItens > 0 || nSelTermos > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">{resumoSelecao}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={limparSelecao}
            >
              <X className="size-3.5" />
              Limpar
            </Button>
            {nSelTermos > 0 && (
              <ConfirmarAssinaturaLoteDialog
                ativoIds={selecionadasTermosVisiveis}
                trigger={
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <PenLine className="size-3.5" />
                    {`Confirmar assinatura (${nSelTermos})`}
                  </Button>
                }
              />
            )}
            {nSelItens > 0 && (
              <ResolverPendenciaItemDialog
                ids={selecionadasItensVisiveis}
                resumo={`${nSelItens} ${nSelItens === 1 ? 'item faltante selecionado' : 'itens faltantes selecionados'}`}
                trigger={
                  <Button size="sm" className="h-8 gap-1.5">
                    <PackageCheck className="size-3.5" />
                    {`Resolver itens (${nSelItens})`}
                  </Button>
                }
              />
            )}
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {podeResolver && (
              <TableHead className="w-8">
                {totalSelecionavel > 0 && (
                  <Checkbox
                    checked={todosMarcados}
                    onCheckedChange={(c) => toggleTodos(c === true)}
                    aria-label="Selecionar todos os itens faltantes e termos desta página"
                  />
                )}
              </TableHead>
            )}
            <TableHead>Tipo</TableHead>
            <TableHead>Patrimônio</TableHead>
            <TableHead>Modelo</TableHead>
            <TableHead>Colaborador</TableHead>
            <TableHead>Setor</TableHead>
            <TableHead>Filial</TableHead>
            <TableHead className="text-right">Desde</TableHead>
            {podeResolver && <TableHead className="text-right">Ação</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const ehItem = p.tipo === 'itens' && !!p.pendenciaItemId
            const itemId = p.pendenciaItemId as string
            // F28/PND-02 — segundo universo de checkbox: `p.id` é o id do ATIVO
            // nesta linha (mesma chave que `ConfirmarAssinaturaDialog` já usa).
            const ehTermo = p.tipo === 'termo'
            const faixaIdade = faixaIdadePendencia(p.desdeDias)
            const rotuloPatrimonio = p.patrimonio === null ? 'Definir patrimônio' : 'Corrigir patrimônio'
            return (
              <TableRow key={p.ordem}>
                {podeResolver && (
                  <TableCell>
                    {ehItem && (
                      <Checkbox
                        checked={selecionadasItens.has(itemId)}
                        onCheckedChange={(c) => toggleItem(itemId, c === true)}
                        aria-label={`Selecionar ${rotuloAcessorio(p.item ?? 'item')}`}
                      />
                    )}
                    {ehTermo && (
                      <Checkbox
                        checked={selecionadasTermos.has(p.id)}
                        onCheckedChange={(c) => toggleTermo(p.id, c === true)}
                        aria-label={`Selecionar termo de ${p.colaborador ?? p.patrimonio ?? 'ativo'}`}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <Badge className={`border-transparent ${CLASSE_TIPO_PENDENCIA[p.tipo]}`}>
                    {ROTULO_TIPO_PENDENCIA[p.tipo]}
                  </Badge>
                  {ehItem && p.item && (
                    <span className="mt-1 block text-xs font-medium">
                      {rotuloAcessorio(p.item)}
                    </span>
                  )}
                  {/* F28/PND-04 — o TEXTO da pendência, que já vinha da query e nunca
                      era mostrado: "Patrimônio" e "Outra" eram baldes opacos (só o
                      badge, sem dizer QUAL patrimônio ou QUAL "outra"). Truncado na
                      linha, inteiro na Dica (foco/hover) — a pendência pode vir
                      `;`-concatenada (balde "outras"). Nulo/vazio não renderiza nada;
                      `!ehItem` evita duplicar o que a linha do item, logo acima,
                      já mostra (o texto sintetizado seria "itens faltantes: <item>"). */}
                  {!ehItem && p.pendencia && p.pendencia.trim() && (
                    <Dica
                      texto={p.pendencia}
                      className="mt-1 block max-w-[14rem] truncate text-xs text-muted-foreground"
                    >
                      {p.pendencia}
                    </Dica>
                  )}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  <Link
                    href={`/ativos/${p.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {/* F28/PND-04 — "—" era um alvo minúsculo e sem nome acessível
                        para quem não tem patrimônio (justo o balde "Patrimônio"). O
                        texto do link agora DIZ o que ele faz. */}
                    {p.patrimonio ?? (
                      <span className="text-muted-foreground italic">
                        sem patrimônio — abrir ficha
                      </span>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {[p.marca, p.modelo].filter(Boolean).join(' ') ||
                    (p.categoria ? rotuloCategoria(p.categoria) : '—')}
                </TableCell>
                <TableCell>{p.colaborador ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{p.setor ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.filialNome ?? p.filialSlug ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span>{p.desdeFmt}</span>
                  {/* F28/PND-04 — o peso da idade: "há 2 dias" e "há 94 dias" tinham o
                      MESMO cinza. Só as faixas acima do limiar ganham badge de cor;
                      'nova' segue o texto simples de sempre. */}
                  {faixaIdade === 'nova' ? (
                    <span className="block text-xs text-muted-foreground">{p.desdeRel}</span>
                  ) : (
                    <Dica texto={DICA_FAIXA_IDADE[faixaIdade]} className="mt-1 inline-block">
                      <Badge
                        className={`border-transparent text-xs font-normal ${CLASSE_FAIXA_IDADE[faixaIdade]}`}
                      >
                        {p.desdeRel}
                      </Badge>
                    </Dica>
                  )}
                </TableCell>
                {podeResolver && (
                  <TableCell className="text-right">
                    {p.tipo === 'termo' && (
                      <ConfirmarAssinaturaDialog
                        ativoId={p.id}
                        trigger={
                          <Button variant="outline" size="sm" className="h-8 gap-1.5">
                            <PenLine className="size-3.5" />
                            Confirmar assinatura
                          </Button>
                        }
                      />
                    )}
                    {/* F28/PND-01 — patrimônio resolvido DIRETO na linha: antes o
                        caminho era linha → ficha → menu "⋯" → diálogo → voltar. O
                        trigger é próprio (mesmo padrão do ConfirmarAssinaturaDialog
                        acima); o diálogo em si não muda — só ganha onde nascer. */}
                    {p.tipo === 'patrimonio' && (
                      <CorrigirPatrimonioDialog
                        ativoId={p.id}
                        patrimonioAtual={p.patrimonio}
                        serviceTag={p.serviceTag}
                        trigger={
                          <Button variant="outline" size="sm" className="h-8 gap-1.5">
                            <Tag className="size-3.5" />
                            {rotuloPatrimonio}
                          </Button>
                        }
                      />
                    )}
                    {/* F28/PND-01 — triagem parada não tem diálogo (o registro é uma
                        movimentação de verdade, "Triagem OK"): o atalho leva direto
                        para o wizard com o ativo já selecionado. */}
                    {p.tipo === 'triagem' && (
                      <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                        <Link href={`/movimentacoes/nova?ativo=${p.id}`}>
                          <ArrowRightLeft className="size-3.5" />
                          Movimentar
                        </Link>
                      </Button>
                    )}
                    {ehItem && (
                      <ResolverPendenciaItemDialog
                        ids={[itemId]}
                        resumo={`${rotuloAcessorio(p.item ?? 'item')}${
                          p.patrimonio ? ' · ' + p.patrimonio : ''
                        }`}
                        trigger={
                          <Button variant="outline" size="sm" className="h-8 gap-1.5">
                            <PackageCheck className="size-3.5" />
                            Resolver
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

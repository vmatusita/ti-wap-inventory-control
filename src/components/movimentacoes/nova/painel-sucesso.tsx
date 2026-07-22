'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, FileText, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GerarTermoDialog } from '@/components/movimentacoes/gerar-termo-dialog'
import { categoriaTemTermo } from '@/lib/termos/tipos'
import { campoAplica } from '@/lib/validators/movimentacao'
import { rotuloCategoria } from '@/lib/dominio'
import type { SucessoLote } from '@/components/movimentacoes/nova/config'

// Painel pos-envio: fichas atualizadas + geracao de termo (responsabilidade por
// ativo elegivel; devolucao consolidada por lote). `onGerado` revalida a tela.
//
// F10/M9 — os termos de responsabilidade viraram uma LISTA COM ESTADO
// (pendente/gerado/pulado) encadeada: o proximo pendente ganha o botao
// destacado "Gerar próximo termo", que ja e o gatilho do dialog daquele ativo —
// ao fechar um termo gerado, o destaque anda sozinho para o proximo, sem o
// operador ter de caçar o botao certo. Pular e permitido (nao gera nada) e o
// rodape lembra que da para gerar depois pela ficha ou por Pendencias.
export function PainelSucesso({
  sucesso,
  onGerado,
  onReiniciar,
}: {
  sucesso: SucessoLote
  onGerado: () => void
  onReiniciar: () => void
}) {
  const [gerados, setGerados] = useState<Set<string>>(new Set())
  const [pulados, setPulados] = useState<Set<string>>(new Set())

  const elegiveis = campoAplica(sucesso.tipo, 'termo')
    ? sucesso.ativos.filter((a) => categoriaTemTermo(a.categoria))
    : []
  const proximo = elegiveis.find(
    (a) => !gerados.has(a.id) && !pulados.has(a.id),
  )
  const proximoRef = useRef<HTMLButtonElement>(null)

  // Encadeamento: fechado um termo, o foco vai para o botao do PROXIMO pendente
  // (o Radix devolve o foco ao gatilho que acabou de ser usado). Assim a
  // sequencia inteira sai no teclado, sem caçar botao — e sem controlar o
  // estado do GerarTermoDialog de fora (ele continua dono do proprio dialog).
  useEffect(() => {
    if (gerados.size === 0 || !proximo) return
    const t = setTimeout(() => proximoRef.current?.focus(), 200)
    return () => clearTimeout(t)
  }, [gerados, proximo])

  function marcarGerado(id: string) {
    setGerados((s) => new Set(s).add(id))
    onGerado()
  }

  return (
    <div className="rounded-lg border bg-card p-6 text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
        <Check className="size-6" />
      </div>
      <h2 className="text-lg font-semibold">
        {sucesso.criadas}{' '}
        {sucesso.criadas === 1 ? 'movimentação registrada' : 'movimentações registradas'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Fichas atualizadas:
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {sucesso.ativos.map((a) => (
          <Button key={a.id} asChild variant="outline" size="sm">
            <Link href={`/ativos/${a.id}`} className="tabular-nums">
              {a.patrimonio ?? 'sem patrimônio'}
            </Link>
          </Button>
        ))}
      </div>

      {/* Termo de responsabilidade — um por ativo elegível (saida/emprestimo) */}
      {campoAplica(sucesso.tipo, 'termo') && (
        <div className="mt-6 border-t pt-5 text-left">
          <p className="text-center text-sm font-medium">
            Termo de responsabilidade
          </p>
          <p className="mt-0.5 text-center text-xs text-muted-foreground">
            {elegiveis.length > 0
              ? `Documento pronto para assinatura — ${gerados.size} de ${elegiveis.length} gerado${gerados.size === 1 ? '' : 's'}.`
              : 'Documento pronto para assinatura — o sistema já preenche o que sabe.'}
          </p>

          {elegiveis.length > 0 ? (
            <ul className="mx-auto mt-3 max-w-xl space-y-2">
              {elegiveis.map((a) => {
                const feito = gerados.has(a.id)
                const ehProximo = proximo?.id === a.id
                const rotulo = `${a.patrimonio ?? 'sem patrimônio'} · ${rotuloCategoria(a.categoria)}`
                return (
                  <li
                    key={a.id}
                    className={
                      'flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ' +
                      (ehProximo ? 'border-primary/50 bg-muted/40' : '')
                    }
                  >
                    <span className="font-medium tabular-nums">
                      {a.patrimonio ?? 'sem patrimônio'}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {rotuloCategoria(a.categoria)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {feito ? (
                        <>
                          <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                            <Check className="size-3.5" />
                            Gerado
                          </span>
                          <GerarTermoDialog
                            familia="responsabilidade"
                            categoria={a.categoria}
                            movimentacaoIds={[a.movimentacaoId]}
                            rotulo={rotulo}
                            onGerado={() => marcarGerado(a.id)}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Gerar de novo
                              </Button>
                            }
                          />
                        </>
                      ) : (
                        <>
                          {ehProximo && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1.5"
                              onClick={() =>
                                setPulados((s) => new Set(s).add(a.id))
                              }
                            >
                              <SkipForward className="size-3.5" />
                              Pular
                            </Button>
                          )}
                          <GerarTermoDialog
                            familia="responsabilidade"
                            categoria={a.categoria}
                            movimentacaoIds={[a.movimentacaoId]}
                            rotulo={rotulo}
                            onGerado={() => marcarGerado(a.id)}
                            trigger={
                              <Button
                                ref={ehProximo ? proximoRef : undefined}
                                variant={ehProximo ? 'default' : 'outline'}
                                size="sm"
                                className="gap-2"
                              >
                                <FileText className="size-4" />
                                {ehProximo && gerados.size > 0
                                  ? 'Gerar próximo termo'
                                  : 'Gerar termo'}
                              </Button>
                            }
                          />
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              As categorias deste lote não têm modelo de termo.
            </p>
          )}

          {elegiveis.length > 0 && !proximo && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Nenhum termo pendente neste lote.
            </p>
          )}

          {elegiveis.length > 0 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Dá para gerar depois pela ficha do ativo ou em{' '}
              <Link href="/pendencias" className="underline">
                Pendências → termo
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {/* Termo de devolução — um por lote (consolida os equipamentos) */}
      {sucesso.tipo === 'devolucao' && sucesso.ativos.length > 0 && (
        <div className="mt-6 border-t pt-5">
          <p className="text-sm font-medium">Termo de devolução</p>
          <div className="mt-3 flex justify-center">
            <GerarTermoDialog
              familia="devolucao"
              tipoDevolucao={
                sucesso.motivo === 'desligamento'
                  ? 'devolucao_desligamento'
                  : 'devolucao_equipamento'
              }
              movimentacaoIds={sucesso.ativos.map((a) => a.movimentacaoId)}
              rotulo={`${sucesso.ativos.length} equipamento${sucesso.ativos.length > 1 ? 's' : ''}`}
              onGerado={onGerado}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <FileText className="size-4" />
                  Gerar termo de devolução ({sucesso.ativos.length})
                </Button>
              }
            />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Dá para gerar depois pela ficha do ativo ou em{' '}
            <Link href="/pendencias" className="underline">
              Pendências → termo
            </Link>
            .
          </p>
        </div>
      )}

      <div className="mt-6">
        <Button onClick={onReiniciar}>Registrar outra movimentação</Button>
      </div>
    </div>
  )
}

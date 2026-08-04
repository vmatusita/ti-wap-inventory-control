'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, Check, FileText, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GerarTermoDialog } from '@/components/movimentacoes/gerar-termo-dialog'
import { linkContrapartida } from '@/components/movimentacoes/nova/troca-upgrade'
import { categoriaTemTermo } from '@/lib/termos/tipos'
import { campoAplica } from '@/lib/validators/movimentacao'
import { rotuloCategoria, rotuloPatrimonio, rotuloTipo } from '@/lib/dominio'
import type {
  AtivoSucesso,
  GrupoSucesso,
  SucessoLote,
} from '@/components/movimentacoes/nova/config'

// Termo de RESPONSABILIDADE — um por ativo elegível dos tipos que têm termo
// (saída/empréstimo). F10/M9 — lista COM ESTADO (pendente/gerado/pulado)
// encadeada: o próximo pendente ganha o botão destacado "Gerar próximo termo",
// que já é o gatilho do dialog daquele ativo — ao fechar um termo gerado, o
// destaque anda sozinho para o próximo, sem o operador ter de caçar o botão
// certo. Pular é permitido (não gera nada) e o rodapé lembra que dá para gerar
// depois pela ficha ou por Pendências.
function BlocoResponsabilidade({
  elegiveis,
  gerados,
  proximo,
  proximoRef,
  onGerado,
  onPular,
  subtitulo,
}: {
  elegiveis: AtivoSucesso[]
  gerados: Set<string>
  proximo: AtivoSucesso | undefined
  proximoRef: React.RefObject<HTMLButtonElement | null>
  onGerado: (id: string) => void
  onPular: (id: string) => void
  subtitulo: string | null
}) {
  return (
    <div className="mt-6 border-t pt-5 text-left">
      <p className="text-center text-sm font-medium">
        Termo de responsabilidade
        {subtitulo && (
          <span className="font-normal text-muted-foreground"> · {subtitulo}</span>
        )}
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
            const rotulo = `${rotuloPatrimonio(a.patrimonio)} · ${rotuloCategoria(a.categoria)}`
            return (
              <li
                key={a.id}
                className={
                  'flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ' +
                  (ehProximo ? 'border-primary/50 bg-muted/40' : '')
                }
              >
                <span className="font-medium tabular-nums">
                  {rotuloPatrimonio(a.patrimonio)}
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
                        onGerado={() => onGerado(a.id)}
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
                          onClick={() => onPular(a.id)}
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
                        onGerado={() => onGerado(a.id)}
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
  )
}

// Termo de DEVOLUÇÃO — um por grupo de devolução (consolida os equipamentos).
// O mapa motivo→modelo continua o mesmo: só `desligamento` usa o modelo de
// desligamento; todo o resto (inclusive `troca_upgrade`) usa o de equipamento.
function BlocoDevolucao({
  grupo,
  onGerado,
  subtitulo,
}: {
  grupo: GrupoSucesso
  onGerado: () => void
  subtitulo: string | null
}) {
  return (
    <div className="mt-6 border-t pt-5">
      <p className="text-sm font-medium">
        Termo de devolução
        {subtitulo && (
          <span className="font-normal text-muted-foreground"> · {subtitulo}</span>
        )}
      </p>
      <div className="mt-3 flex justify-center">
        <GerarTermoDialog
          familia="devolucao"
          tipoDevolucao={
            grupo.motivo === 'desligamento'
              ? 'devolucao_desligamento'
              : 'devolucao_equipamento'
          }
          movimentacaoIds={grupo.ativos.map((a) => a.movimentacaoId)}
          rotulo={`${grupo.ativos.length} equipamento${grupo.ativos.length > 1 ? 's' : ''}`}
          onGerado={onGerado}
          trigger={
            <Button variant="outline" size="sm" className="gap-2">
              <FileText className="size-4" />
              Gerar termo de devolução ({grupo.ativos.length})
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
  )
}

// Painel pos-envio: fichas atualizadas + geracao de termo. F26 — o envio pode
// trazer DOIS grupos (o par troca/upgrade), e cada um puxa o termo da SUA
// metade: responsabilidade na saída, devolução na devolução. Lote simples = um
// grupo só, e a tela é a de sempre.
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

  const todos = sucesso.grupos.flatMap((g) => g.ativos)
  const comPar = sucesso.grupos.length > 1
  // Elegíveis ao termo de responsabilidade, de TODOS os grupos: num par só a
  // metade `saida` entra, então a lista encadeada continua sendo uma só.
  const elegiveis = sucesso.grupos.flatMap((g) =>
    campoAplica(g.tipo, 'termo')
      ? g.ativos.filter((a) => categoriaTemTermo(a.categoria))
      : [],
  )
  const grupoComTermo = sucesso.grupos.find((g) => campoAplica(g.tipo, 'termo'))
  const gruposDevolucao = sucesso.grupos.filter(
    (g) => g.tipo === 'devolucao' && g.ativos.length > 0,
  )
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
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
        <Check className="size-6" />
      </div>
      <h2 className="text-lg font-semibold">
        {sucesso.criadas}{' '}
        {sucesso.criadas === 1 ? 'movimentação registrada' : 'movimentações registradas'}
      </h2>
      {comPar && (
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeftRight className="size-3.5" aria-hidden />
          {sucesso.grupos
            .map((g) => `${rotuloTipo(g.tipo)} (${g.ativos.length})`)
            .join(' + ')}{' '}
          — a troca inteira num registro só.
        </p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">Fichas atualizadas:</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {todos.map((a) => (
          <Button key={a.id} asChild variant="outline" size="sm">
            <Link href={`/ativos/${a.id}`} className="tabular-nums">
              {rotuloPatrimonio(a.patrimonio)}
            </Link>
          </Button>
        ))}
      </div>

      {grupoComTermo && (
        <BlocoResponsabilidade
          elegiveis={elegiveis}
          gerados={gerados}
          proximo={proximo}
          proximoRef={proximoRef}
          onGerado={marcarGerado}
          onPular={(id) => setPulados((s) => new Set(s).add(id))}
          subtitulo={comPar ? rotuloTipo(grupoComTermo.tipo) : null}
        />
      )}

      {gruposDevolucao.map((g) => (
        <BlocoDevolucao
          key={g.tipo}
          grupo={g}
          onGerado={onGerado}
          subtitulo={comPar ? rotuloTipo(g.tipo) : null}
        />
      ))}

      {/* F26 — a contrapartida ficou para depois: o atalho reabre o fluxo já
          com o tipo, o motivo e (quando o tipo o coleta) o colaborador. */}
      {sucesso.pendente && (
        <div className="mt-6 border-t pt-5">
          <p className="text-sm font-medium">Falta a outra metade da troca</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A {rotuloTipo(sucesso.pendente.tipo).toLowerCase()} da troca ficou
            para depois. Este atalho reabre o fluxo já preenchido.
          </p>
          <div className="mt-3 flex justify-center">
            <Button asChild variant="default" size="sm" className="gap-2">
              <Link href={linkContrapartida(sucesso.pendente)}>
                <ArrowLeftRight className="size-4" />
                Registrar agora a {rotuloTipo(sucesso.pendente.tipo).toLowerCase()}{' '}
                da troca
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Button onClick={onReiniciar}>Registrar outra movimentação</Button>
      </div>
    </div>
  )
}

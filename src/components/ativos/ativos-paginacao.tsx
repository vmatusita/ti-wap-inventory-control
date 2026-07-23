'use client'

import { useId, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'

// Param da URL que carrega o tamanho de página (F11/T7). Fixo de propósito: só
// a lista de ativos oferece o seletor hoje, e um nome único evita colisão com
// os filtros das outras telas que reusam este componente.
const PARAM_TAMANHO = 'pp'

export function AtivosPaginacao({
  page,
  pageSize,
  total,
  saltoPagina = false,
  tamanhos,
}: {
  page: number
  pageSize: number
  total: number
  // F11/T7 — OPT-IN. Sem estas duas props o componente é exatamente o de antes
  // (Anterior/Próxima + "X / Y"), que é o que /pendencias e o histórico de
  // /itens continuam usando SEM nenhuma alteração naqueles arquivos.
  saltoPagina?: boolean
  tamanhos?: readonly number[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const saltoId = useId()
  const [isPending, startTransition] = useTransition()
  // Paginar troca o searchParam na mesma rota (não dispara o loading.tsx): a
  // barra global + os botões desabilitados dão o feedback.
  useReportarNavegacao(isPending)

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const primeiro = total === 0 ? 0 : (page - 1) * pageSize + 1
  const ultimo = Math.min(page * pageSize, total)

  // Campo "ir para a página". Sincroniza com a URL quando ela muda por fora
  // (voltar/avançar do navegador, clique em Anterior/Próxima) pelo padrão
  // oficial do React "You Might Not Need an Effect": guarda o valor anterior em
  // ESTADO e ajusta durante o render.
  const [destino, setDestino] = useState(String(page))
  const [pageSync, setPageSync] = useState(page)
  if (pageSync !== page) {
    setPageSync(page)
    setDestino(String(page))
  }

  function navegar(novo: URLSearchParams) {
    const qs = novo.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  function irPara(p: number) {
    const novo = new URLSearchParams(params.toString())
    if (p <= 1) novo.delete('page')
    else novo.set('page', String(p))
    navegar(novo)
  }

  function submeterSalto() {
    const n = Number(destino.trim())
    // Fora da faixa, vazio ou lixo: não navega e devolve o campo ao valor real
    // (a paginação nunca leva o operador para uma página que não existe).
    if (!Number.isInteger(n) || n < 1 || n > totalPaginas) {
      setDestino(String(page))
      return
    }
    if (n === page) return
    irPara(n)
  }

  function trocarTamanho(valor: string) {
    const n = Number(valor)
    if (!Number.isInteger(n) || n < 1) return
    const novo = new URLSearchParams(params.toString())
    novo.set(PARAM_TAMANHO, String(n))
    novo.delete('page') // mudar o tamanho volta p/ a página 1
    navegar(novo)
  }

  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="tabular-nums">
        {primeiro}–{ultimo} de {total}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {tamanhos && tamanhos.length > 0 && (
          <Select value={String(pageSize)} onValueChange={trocarTamanho}>
            <SelectTrigger
              className="h-10 w-[140px] sm:h-7"
              aria-label="Ativos por página"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tamanhos.map((t) => (
                <SelectItem key={t} value={String(t)}>
                  {t} por página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-7"
          onClick={() => irPara(page - 1)}
          disabled={page <= 1 || isPending}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Button>

        {saltoPagina ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submeterSalto()
            }}
            className="flex items-center gap-1.5"
          >
            <label htmlFor={saltoId} className="whitespace-nowrap">
              Página
            </label>
            <Input
              id={saltoId}
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              aria-label={`Ir para a página (1 a ${totalPaginas})`}
              className="h-10 w-16 text-center tabular-nums sm:h-7"
            />
            <span className="whitespace-nowrap tabular-nums">
              de {totalPaginas}
            </span>
            {/* Submit visível para quem usa toque/mouse; o Enter no campo faz o
                mesmo. Nenhum dos dois desabilita durante a transição: campo ou
                botão desabilitado sob foco derrubaria o foco do teclado. */}
            <Button type="submit" variant="outline" size="sm" className="h-10 sm:h-7">
              Ir
            </Button>
          </form>
        ) : (
          <span className="tabular-nums">
            {page} / {totalPaginas}
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-7"
          onClick={() => irPara(page + 1)}
          disabled={page >= totalPaginas || isPending}
          aria-label="Próxima página"
        >
          Próxima
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

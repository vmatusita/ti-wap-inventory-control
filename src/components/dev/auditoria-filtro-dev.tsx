'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACAO_ROTULO, ACOES_ADMIN } from '@/lib/auditoria'

// Filtro COMPLETO da trilha, na /dev — ação, autor, período e alvo (ordem F22 §4).
//
// A aba de /admin/usuarios continua com o filtro só de AÇÃO (`auditoria-filtro.tsx`), e isso é
// deliberado: lá a trilha é um complemento da tela de usuários, aqui ela é o instrumento de
// auditoria. Os quatro recortes existem porque a trilha só responde às perguntas que se fazem
// a ela — "o que o fulano fez?", "o que aconteceu naquela semana?", "quem mexeu nesta conta?"
// — com eles. Depois que apagar usuário passou a existir, ela é o ÚNICO registro de quem foi
// apagado.
//
// O estado vive na URL: a página é Server Component e a lista vem paginada do banco, então
// filtrar é NAVEGAR. `page` é sempre descartado ao mexer num filtro — a página 7 do recorte
// anterior quase nunca existe no novo, e cairia no clamp, que confunde.

// O Select do shadcn não aceita `value=""` (string vazia é "nada selecionado" e o placeholder
// assumiria), daí os sentinelas.
const TODAS = 'todas'
const TODOS = 'todos'

export function AuditoriaFiltroDev({
  acao,
  autor,
  de,
  ate,
  alvo,
  autores,
}: {
  acao: string | null
  autor: string | null
  de: string | null
  ate: string | null
  alvo: string | null
  autores: readonly { id: string; nome: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()

  function aplicar(mudancas: Record<string, string | null>) {
    const novo = new URLSearchParams(params.toString())
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    novo.delete('page')
    const qs = novo.toString()
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  const temFiltro = Boolean(acao || autor || de || ate || alvo)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="aud-acao" className="text-xs text-muted-foreground">
          Ação
        </Label>
        <Select
          value={acao ?? TODAS}
          onValueChange={(v) => aplicar({ acao: v === TODAS ? null : v })}
          disabled={pending}
        >
          <SelectTrigger id="aud-acao" className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as ações</SelectItem>
            {ACOES_ADMIN.map((a) => (
              <SelectItem key={a} value={a}>
                {ACAO_ROTULO[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="aud-autor" className="text-xs text-muted-foreground">
          Quem fez
        </Label>
        <Select
          value={autor ?? TODOS}
          onValueChange={(v) => aplicar({ autor: v === TODOS ? null : v })}
          disabled={pending}
        >
          <SelectTrigger id="aud-autor" className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Qualquer pessoa</SelectItem>
            {autores.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* `type="date"` nativo: o projeto não tem o componente de calendário do shadcn, e
          acrescentar dependência é proibido pela stack fechada. O valor viaja em ISO
          (`yyyy-MM-dd`), que é exatamente o que o servidor valida. */}
      <div className="space-y-1">
        <Label htmlFor="aud-de" className="text-xs text-muted-foreground">
          De
        </Label>
        <Input
          id="aud-de"
          type="date"
          value={de ?? ''}
          disabled={pending}
          className="w-[150px]"
          onChange={(e) => aplicar({ de: e.target.value || null })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="aud-ate" className="text-xs text-muted-foreground">
          Até
        </Label>
        <Input
          id="aud-ate"
          type="date"
          value={ate ?? ''}
          disabled={pending}
          className="w-[150px]"
          onChange={(e) => aplicar({ ate: e.target.value || null })}
        />
      </div>

      {/* Alvo é busca por texto, e não Select: ele guarda o e-mail/rótulo LEGÍVEL do momento do
          evento (comment da coluna, migration 0065) — inclusive de contas que já não existem,
          que é justamente quem mais se procura aqui. Aplica no Enter e no blur, para não
          disparar uma navegação por tecla digitada. */}
      <div className="space-y-1">
        <Label htmlFor="aud-alvo" className="text-xs text-muted-foreground">
          Sobre quem/o quê
        </Label>
        <Input
          id="aud-alvo"
          type="search"
          defaultValue={alvo ?? ''}
          placeholder="e-mail ou rótulo"
          disabled={pending}
          className="w-[220px]"
          onBlur={(e) => {
            if ((e.target.value || null) !== alvo) aplicar({ alvo: e.target.value || null })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              aplicar({ alvo: e.currentTarget.value || null })
            }
          }}
        />
      </div>

      {temFiltro ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => aplicar({ acao: null, autor: null, de: null, ate: null, alvo: null })}
        >
          Limpar filtros
        </Button>
      ) : null}
    </div>
  )
}

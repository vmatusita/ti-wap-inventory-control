'use client'

import { useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Aviso } from '@/components/layout/aviso'

// "Na coluna Site do import" (F56 · Frente E · Decisão 13) — a seção de apelidos
// de unidade, dentro do `FilialDialog`, mas EXTRAÍDA para este componente
// separado, fora do `<DialogContent>`/Portal.
//
// POR QUÊ FORA DO DIALOG. O Portal do Radix (`@radix-ui/react-portal`) só monta
// dentro de um `useLayoutEffect` (`mounted` vira `true` lá) — e `renderToStatic
// Markup` (como qualquer SSR do React) nunca executa `useEffect`/`useLayoutEffect`.
// Logo NENHUM teste grau 1 (o piso desta casa, F45 — sem jsdom, sem Testing
// Library) alcança o que vive dentro de um `Dialog` daqui, `FilialDialog`
// incluído. Extraindo a apresentação para um componente próprio, no mesmo molde
// das três sementes de `src/components/layout/*.test.tsx`, ela volta a ser
// testável. Ata em `docs/DECISOES.md` — é um padrão NOVO neste repositório.
//
// COMPONENTE DE APRESENTAÇÃO PURO: sem `useRouter`, sem chamar Server Action
// nenhuma — quem decide o que fazer em `onIncluir`/`onRemover` é o `FilialDialog`
// (que chama `incluirApelidoUnidade`/`removerApelidoUnidade` por trás).
//
// O NOME PRÓPRIO da filial é fixo, sem botão de remover ao lado — Decisão 2 do
// PLAN-F56 ("o nome próprio sempre vale, sem linha no banco"). Cada apelido tem
// seu próprio botão de remover, com `aria-label` nomeando o apelido, no molde de
// `secao-itens-junto.tsx:167`. Com ZERO apelidos, o aviso diz que só o nome exato
// da filial reconhece a coluna Site do import.

export type ApelidoDeFilial = { id: number; apelido: string }

export function FilialApelidos({
  filialNome,
  apelidos,
  pendente = false,
  erro = null,
  onIncluir,
  onRemover,
}: {
  filialNome: string
  apelidos: ApelidoDeFilial[]
  /** Algum incluir/remover em voo — desabilita os controles, nunca esconde a lista. */
  pendente?: boolean
  erro?: string | null
  onIncluir: (apelido: string) => void
  onRemover: (apelidoId: number) => void
}) {
  const [valor, setValor] = useState('')
  const idCampo = useId()

  function incluir() {
    const v = valor.trim()
    if (v.length < 2) return
    onIncluir(v)
    setValor('')
  }

  return (
    <div className="grid gap-2">
      <Label>Na coluna Site do import</Label>
      <p className="text-xs text-muted-foreground">
        O import de startup reconhece esta filial pelo nome próprio (abaixo, sempre vale) ou
        por qualquer apelido cadastrado.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border bg-muted/50 px-2 py-1 text-sm">
          {filialNome}
          <span className="ml-1.5 text-xs text-muted-foreground">(nome próprio)</span>
        </span>

        {apelidos.map((a) => (
          <span key={a.id} className="flex items-center gap-1 rounded-full border px-2 py-1 text-sm">
            {a.apelido}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              disabled={pendente}
              onClick={() => onRemover(a.id)}
              aria-label={`Remover o apelido "${a.apelido}"`}
            >
              <X className="size-3" />
            </Button>
          </span>
        ))}
      </div>

      {apelidos.length === 0 && (
        <Aviso intencao="atencao">
          A coluna Site precisa trazer exatamente «{filialNome}» para o import reconhecer esta
          filial (acento e maiúsculas não importam). Cadastre um apelido para aceitar outra
          grafia.
        </Aviso>
      )}

      <div className="flex items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <Label htmlFor={idCampo}>Novo apelido</Label>
          <Input
            id={idCampo}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            disabled={pendente}
            placeholder='Ex.: "CD Afonso Pena"'
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                incluir()
              }
            }}
          />
        </div>
        <Button type="button" onClick={incluir} disabled={pendente || valor.trim().length < 2}>
          <Plus className="size-4" />
          Incluir
        </Button>
      </div>

      {erro && <Aviso intencao="erro">{erro}</Aviso>}
    </div>
  )
}

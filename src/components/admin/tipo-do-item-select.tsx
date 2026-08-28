'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { definirTipoDoItem } from '@/lib/actions/tipos-item'
import type { TipoItem } from '@/lib/queries/tipos-item'

// F37/B.4 — o tipo de UM item do catálogo, escolhido direto na linha da tabela.
//
// Por que aqui e não dentro do `ItemDialog`: classificar o catálogo é uma tarefa de
// varredura (18 itens em produção no dia da fase, todos sem tipo). Abrir e fechar um
// diálogo 18 vezes para preencher um campo só seria trabalho inventado. E manter a
// escolha FORA do `atualizarItem` tem um segundo motivo: aquele schema já é coberto
// por `item.test.ts`, e esta fase não edita teste existente.
//
// `SEM_TIPO` é uma sentinela de string porque o `Select` do Radix não aceita `value=""`
// (string vazia é como ele representa "nada selecionado", e o item viraria inválido).

const SEM_TIPO = '__sem_tipo__'

export function TipoDoItemSelect({
  itemId,
  itemNome,
  tipoId,
  tipos,
}: {
  itemId: number
  itemNome: string
  tipoId: number | null
  tipos: readonly TipoItem[]
}) {
  const router = useRouter()
  const [valor, setValor] = useState(tipoId == null ? SEM_TIPO : String(tipoId))
  const [salvando, iniciar] = useTransition()

  function mudar(novo: string) {
    const anterior = valor
    setValor(novo)
    iniciar(async () => {
      try {
        const res = await definirTipoDoItem({
          item_id: itemId,
          tipo_id: novo === SEM_TIPO ? null : Number(novo),
        })
        if (!res.ok) {
          setValor(anterior) // desfaz o otimismo: a tela não pode mentir
          toast.error(res.erro ?? 'Não foi possível salvar o tipo.')
          return
        }
        router.refresh()
      } catch {
        setValor(anterior)
        toast.error('Não foi possível salvar o tipo agora. Tente de novo.')
      }
    })
  }

  return (
    <Select value={valor} onValueChange={mudar} disabled={salvando}>
      <SelectTrigger
        size="sm"
        className="w-[9.5rem]"
        aria-label={`Tipo de ${itemNome}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_TIPO}>
          <span className="text-muted-foreground">Sem tipo</span>
        </SelectItem>
        {tipos.map((t) => (
          <SelectItem key={t.id} value={String(t.id)}>
            {t.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

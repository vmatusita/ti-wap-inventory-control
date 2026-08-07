'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

// Botao-icone "copiar" para identificadores do ativo (patrimonio, service tag) —
// OS-F9 T6. Usado na ficha e na celula de patrimonio da lista /ativos, onde a
// LINHA navega por onClick: por isso o handler sempre para a propagacao (mesmo
// precedente do Link aninhado da propria celula). Inofensivo fora da tabela.
//
// Concordancia: hoje so o patrimonio (masc.) e a service tag (fem.) usam este
// botao; um rotulo novo cai no masculino e a lista abaixo se ajusta em 1 linha.
const ROTULOS_FEMININOS = new Set(['service tag'])

export function CopiarPatrimonio({
  valor,
  rotulo,
}: {
  valor: string
  rotulo?: string
}) {
  const [copiado, setCopiado] = useState(false)

  // Patrimonio e nullable desde a F7E: sem valor, nao ha o que copiar.
  if (!valor) return null

  const nome = rotulo ?? 'Patrimônio'
  const concordancia = ROTULOS_FEMININOS.has(nome.toLowerCase())
    ? 'copiada'
    : 'copiado'

  async function copiar(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    // Fora de contexto seguro (http em rede interna, WebView antiga) o
    // navigator.clipboard nem existe. UXG-08a/F27: antes saia em silencio
    // total — o operador clicava e nada parecia acontecer; agora avisa.
    if (!navigator.clipboard?.writeText) {
      toast.error('Não foi possível copiar — copie manualmente.')
      return
    }
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      toast.success(`${nome} ${concordancia}.`)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Permissao negada pelo navegador. UXG-08a/F27: idem, avisa em vez de
      // falhar em silencio.
      toast.error('Não foi possível copiar — copie manualmente.')
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      // Alvo de toque >= 40px no mobile; compacto no desktop.
      className="size-10 shrink-0 align-middle text-muted-foreground hover:text-foreground sm:size-7"
      aria-label={`Copiar ${nome.toLowerCase()}`}
      title={`Copiar ${nome.toLowerCase()}`}
      onClick={copiar}
    >
      {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  )
}

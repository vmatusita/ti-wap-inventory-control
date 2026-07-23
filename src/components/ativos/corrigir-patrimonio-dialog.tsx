'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tag } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { corrigirPatrimonio } from '@/lib/actions/ativos'
import { validarCorrecaoPatrimonio } from '@/lib/validators/ativo'

// B7 (F6B) — corrige o patrimônio do ativo. A service tag é IMUTÁVEL (identidade
// do equipamento) e aparece só em leitura. O novo valor é sempre canonicalizado
// (WAP0004491); a correção deixa rastro "de → para" na linha do tempo.
export function CorrigirPatrimonioDialog({
  ativoId,
  patrimonioAtual,
  serviceTag,
}: {
  ativoId: string
  // null = ativo importado SEM patrimônio (F7E) — o diálogo abre a partir do nulo
  // e o rótulo vira "Definir patrimônio" (rastro "de sem patrimônio para WAP…").
  patrimonioAtual: string | null
  serviceTag: string | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [novo, setNovo] = useState('')
  // Loading via useTransition (padrão único dos diálogos — OS-F11 T9): `enviando`
  // continua desabilitando os dois botões, então o duplo-submit segue impossível.
  const [enviando, start] = useTransition()

  const semPatrimonio = patrimonioAtual === null
  const rotulo = semPatrimonio ? 'Definir patrimônio' : 'Corrigir patrimônio'

  // Preview ao vivo da canonicalização (mesma função pura do servidor).
  const preview = novo.trim() ? validarCorrecaoPatrimonio(patrimonioAtual, novo) : null
  const podeSalvar = !!preview && preview.ok && !preview.noop && !enviando

  function salvar() {
    start(async () => {
      const res = await corrigirPatrimonio({ ativo_id: ativoId, patrimonio_novo: novo })
      if (!res.ok) {
        toast.error(res.erro ?? 'Não foi possível corrigir o patrimônio.')
        return
      }
      toast.success(semPatrimonio ? 'Patrimônio definido.' : 'Patrimônio corrigido.')
      setAberto(false)
      setNovo('')
      router.refresh()
    })
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o)
        if (!o) setNovo('')
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2 sm:h-8">
          <Tag className="size-4" />
          {rotulo}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rotulo}</DialogTitle>
          <DialogDescription>
            {semPatrimonio
              ? 'Informe o número de patrimônio deste ativo (importado sem plaqueta). A definição fica registrada na linha do tempo (de → para), com seu nome e a data, e encerra a pendência "sem patrimônio físico".'
              : 'Corrija apenas o número de patrimônio. A correção fica registrada na linha do tempo (de → para), com seu nome e a data.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Patrimônio atual</Label>
            <p className="text-sm font-medium tabular-nums">
              {patrimonioAtual ?? (
                <span className="text-muted-foreground italic tabular-nums">
                  Sem patrimônio
                </span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="patrimonio-novo">Novo patrimônio</Label>
            {/* Os três parágrafos abaixo são mutuamente exclusivos — só um existe
                no DOM por vez, então compartilham o MESMO id e o `aria-describedby`
                aponta sempre para a mensagem que está na tela. */}
            <Input
              id="patrimonio-novo"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder="WAP0001234"
              autoComplete="off"
              autoFocus
              className="tabular-nums"
              aria-invalid={!!preview && !preview.ok}
              aria-describedby={preview ? 'patrimonio-novo-ajuda' : undefined}
            />
            {preview && preview.ok && !preview.noop && (
              <p id="patrimonio-novo-ajuda" className="text-xs text-muted-foreground">
                Será gravado como{' '}
                <span className="font-medium tabular-nums text-foreground">
                  {preview.patrimonio}
                </span>
              </p>
            )}
            {preview && preview.ok && preview.noop && (
              <p id="patrimonio-novo-ajuda" className="text-xs text-muted-foreground">
                Já é o patrimônio atual — nada a corrigir.
              </p>
            )}
            {preview && !preview.ok && (
              <p id="patrimonio-novo-ajuda" className="text-xs text-destructive">
                {preview.erro}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Service Tag</Label>
            <p className="text-sm tabular-nums">{serviceTag ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              Imutável — identifica o equipamento.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!podeSalvar}>
            {enviando ? 'Salvando…' : rotulo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
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
  patrimonioAtual: string
  serviceTag: string | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [novo, setNovo] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Preview ao vivo da canonicalização (mesma função pura do servidor).
  const preview = novo.trim() ? validarCorrecaoPatrimonio(patrimonioAtual, novo) : null
  const podeSalvar = !!preview && preview.ok && !preview.noop && !enviando

  async function salvar() {
    setEnviando(true)
    const res = await corrigirPatrimonio({ ativo_id: ativoId, patrimonio_novo: novo })
    setEnviando(false)
    if (!res.ok) {
      toast.error(res.erro ?? 'Não foi possível corrigir o patrimônio.')
      return
    }
    toast.success('Patrimônio corrigido.')
    setAberto(false)
    setNovo('')
    router.refresh()
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
          Corrigir patrimônio
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corrigir patrimônio</DialogTitle>
          <DialogDescription>
            Corrija apenas o número de patrimônio. A correção fica registrada na
            linha do tempo (de → para), com seu nome e a data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Patrimônio atual</Label>
            <p className="text-sm font-medium tabular-nums">{patrimonioAtual}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="patrimonio-novo">Novo patrimônio</Label>
            <Input
              id="patrimonio-novo"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder="WAP0001234"
              autoComplete="off"
              autoFocus
              className="tabular-nums"
            />
            {preview && preview.ok && !preview.noop && (
              <p className="text-xs text-muted-foreground">
                Será gravado como{' '}
                <span className="font-medium tabular-nums text-foreground">
                  {preview.patrimonio}
                </span>
              </p>
            )}
            {preview && preview.ok && preview.noop && (
              <p className="text-xs text-muted-foreground">
                Já é o patrimônio atual — nada a corrigir.
              </p>
            )}
            {preview && !preview.ok && (
              <p className="text-xs text-destructive">{preview.erro}</p>
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
            {enviando ? 'Corrigindo…' : 'Corrigir patrimônio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

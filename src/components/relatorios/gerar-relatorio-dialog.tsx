'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
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
import { gerarRelatorio } from '@/lib/actions/relatorios'
import { formatDate } from '@/lib/format'

// "Gerar relatório" (só operador — OS-F3 3.8.3): dialog com período (padrão
// segunda-sexta da semana corrente), escopo (filial atual × geral) e confirmação.
// Sucesso → navega para o snapshot novo.
export function GerarRelatorioDialog({
  filialSlug,
  filialNome,
  ehGeral,
  padraoDe,
  padraoAte,
  maxData,
}: {
  filialSlug: string
  filialNome: string
  ehGeral: boolean
  padraoDe: string
  padraoAte: string
  // Teto de data (não gerar snapshot futuro) — hoje ou fim da semana útil.
  maxData: string
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [de, setDe] = useState(padraoDe)
  const [ate, setAte] = useState(padraoAte)
  const [escopo, setEscopo] = useState<'atual' | 'geral'>(ehGeral ? 'geral' : 'atual')
  const [enviando, start] = useTransition()

  const slugAlvo = escopo === 'geral' ? 'geral' : filialSlug
  const nomeAlvo = escopo === 'geral' ? 'Consolidado' : filialNome
  const periodoValido = !!de && !!ate && de <= ate && ate <= maxData

  function gerar() {
    if (!periodoValido) return
    start(async () => {
      const res = await gerarRelatorio({ filialSlug: slugAlvo, de, ate })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success(`Relatório gerado (versão ${res.versao}).`)
      setAberto(false)
      router.push(`/relatorios/gerados/${res.id}`)
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          aria-label="Gerar relatório"
          className="h-9 gap-1.5 bg-[#eda100] text-black hover:bg-[#eda100]/90 sm:h-7"
        >
          <FileText className="size-4" />
          <span className="hidden sm:inline">Gerar relatório</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar relatório da semana</DialogTitle>
          <DialogDescription>
            Congela um snapshot do período — imutável e versionado. Regerar o
            mesmo período cria uma nova versão.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ger-de">De</Label>
            <Input id="ger-de" type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ger-ate">Até</Label>
            <Input id="ger-ate" type="date" value={ate} min={de || undefined} max={maxData} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>

        {!ehGeral && (
          <div className="space-y-1.5">
            <Label>Escopo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={escopo === 'atual' ? 'default' : 'outline'}
                size="sm"
                className="min-w-0 flex-1 truncate"
                onClick={() => setEscopo('atual')}
              >
                {filialNome}
              </Button>
              <Button
                type="button"
                variant={escopo === 'geral' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setEscopo('geral')}
              >
                Consolidado
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          Será congelado: <strong>{nomeAlvo}</strong> · {formatDate(de)} a{' '}
          {formatDate(ate)}.
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={gerar} disabled={enviando || !periodoValido}>
            {enviando ? 'Gerando…' : 'Gerar e abrir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

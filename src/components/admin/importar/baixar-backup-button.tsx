'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { urlBackup } from '@/lib/actions/importar'

// Baixa o backup (JSON) de um import do histórico via signed URL curta (60s).
export function BaixarBackupButton({
  logId,
  nomeArquivo,
}: {
  logId: string
  nomeArquivo: string
}) {
  const [baixando, setBaixando] = useState(false)

  async function baixar() {
    setBaixando(true)
    try {
      const res = await urlBackup(logId)
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      const r = await fetch(res.url)
      const b = await r.blob()
      const u = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = u
      a.download = nomeArquivo
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(u)
    } catch {
      toast.error('Falha ao baixar o backup.')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5"
      onClick={baixar}
      disabled={baixando}
    >
      <Download className="size-3.5" />
      {baixando ? '…' : 'Backup'}
    </Button>
  )
}

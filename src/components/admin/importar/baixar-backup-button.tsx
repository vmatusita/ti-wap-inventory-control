'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { urlBackup } from '@/lib/actions/importar'
import { baixarDeUrl } from '@/lib/download'

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
      // A signed URL vive 60s; expirada/erro devolve 4xx com corpo de erro — o
      // `baixarDeUrl` checa o status antes do .blob() (senão salvaria esse corpo
      // como um .json corrompido) e lança para o catch abaixo.
      await baixarDeUrl(res.url, nomeArquivo)
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
      className="h-10 gap-1.5 sm:h-8"
      onClick={baixar}
      disabled={baixando}
    >
      <Download className="size-3.5" />
      {baixando ? '…' : 'Backup'}
    </Button>
  )
}

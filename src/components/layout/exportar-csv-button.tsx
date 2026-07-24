'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ResultadoExportCsv } from '@/lib/actions/exportar'
import { baixarTexto } from '@/lib/download'

// Botão genérico de export CSV das listas (OS-F10 · T5). Recebe a Server Action
// de export e manda os filtros ATUAIS da URL; o servidor devolve o arquivo
// pronto e o download acontece aqui, por Blob — sem rota de API.
//
// `useSearchParams()` devolve a URL COMMITADA (a mesma que renderizou a lista na
// tela). É exatamente o que o export precisa: o arquivo tem de bater com o que o
// operador está vendo. (A armadilha da F9 — a URL commitada ficar atrás da
// "fresca" durante uma navegação pendente — vale para quem MONTA a próxima URL;
// aqui só lemos.)

type AcaoExportCsv = (filtros: string) => Promise<ResultadoExportCsv>

export function ExportarCsvButton({
  acao,
  rotulo = 'Exportar CSV',
  descricao,
  size,
  className,
}: {
  acao: AcaoExportCsv
  rotulo?: string
  /** Completa o aria-label: "Exportar CSV das pendências filtradas". */
  descricao: string
  size?: 'sm' | 'default'
  className?: string
}) {
  const params = useSearchParams()
  const [exportando, setExportando] = useState(false)

  async function exportar() {
    setExportando(true)
    try {
      const res = await acao(params.toString())
      if (res.erro) {
        toast.error(res.erro)
        return
      }

      baixar(res.nome, res.conteudo)

      const exportadas = res.exportadas.toLocaleString('pt-BR')
      const total = res.total.toLocaleString('pt-BR')
      if (res.total === 0) {
        toast.info('Nenhuma linha neste filtro — o arquivo saiu só com o cabeçalho.')
      } else if (res.truncado) {
        // Nunca truncar em silêncio (OS-F10 §W4.4).
        toast.warning(`Exportadas ${exportadas} de ${total} — refine os filtros.`)
      } else {
        toast.success(`Exportadas ${exportadas} linhas.`)
      }
    } catch (err) {
      console.error('[ExportarCsvButton] falha no export:', err)
      toast.error('Falha ao exportar. Tente novamente.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className ? `gap-2 ${className}` : 'gap-2'}
      onClick={exportar}
      disabled={exportando}
      aria-label={`${rotulo} ${descricao}`}
      aria-busy={exportando}
    >
      <Download className="size-4" aria-hidden />
      {exportando ? 'Exportando…' : rotulo}
    </Button>
  )
}

// O conteúdo já vem com BOM UTF-8 (`@/lib/csv`); o Blob só o serializa em UTF-8.
function baixar(nome: string, conteudo: string): void {
  baixarTexto(conteudo, nome, 'text/csv;charset=utf-8;')
}

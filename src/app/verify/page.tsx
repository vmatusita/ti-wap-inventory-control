import { TooltipProvider } from '@/components/ui/tooltip'
import { CorpoRelatorio } from '@/components/relatorios/corpo-relatorio'
import { linksKpiAtivos, recorteFilialAtivos } from '@/lib/relatorios/kpi-links'
import { SNAPSHOT_ANTIGO_V2, SNAPSHOT_FICTICIO } from './snapshot-ficticio'

// ANDAIME DE VERIFICAÇÃO DA F32 — ARQUIVO TEMPORÁRIO, apagado ao fim da fase.
// Renderiza o corpo do relatório com dados 100% FICTÍCIOS, sem login e sem
// banco, para os roteiros manuais (acentos, chips, cliques, impressão, mobile).
//
//   /verify              → operador no ao vivo (tudo interativo)
//   /verify?modo=viewer  → sessão por senha no ao vivo (nada clicável)
//   /verify?modo=snap    → snapshot congelado (nada clicável, sem "hoje")
//   /verify?modo=antigo  → snapshot v2 gerado ANTES da F32 (sem os campos novos)
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>
}) {
  const { modo } = await searchParams
  const ehOperador = !modo || modo === 'operador'
  const aoVivo = modo !== 'snap' && modo !== 'antigo'
  const snapshot = modo === 'antigo' ? SNAPSHOT_ANTIGO_V2 : SNAPSHOT_FICTICIO

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
        Andaime de verificação — dados fictícios. Modo: <strong>{modo ?? 'operador'}</strong>
      </p>
      <TooltipProvider delayDuration={300}>
        <CorpoRelatorio
          snapshot={snapshot}
          ehOperador={ehOperador}
          links={ehOperador ? linksKpiAtivos(null) : undefined}
          recorteFilial={ehOperador ? recorteFilialAtivos(null) : undefined}
          aoVivo={aoVivo}
        />
      </TooltipProvider>
    </div>
  )
}

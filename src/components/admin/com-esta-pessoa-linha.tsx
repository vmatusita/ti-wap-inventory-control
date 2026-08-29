'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ComEstaPessoa } from '@/components/itens/com-esta-pessoa'
import {
  buscarSaldoDoColaborador,
  type SaldoDoColaborador,
} from '@/lib/actions/colaboradores'

// O botão que abre "Com esta pessoa" numa linha de `/admin/colaboradores`
// (F38 · §C.2).
//
// EXPANDE A LINHA, NÃO CRIA ROTA. A ordem F38 pediu explicitamente para preferir
// isto: rota nova acorda os guardas F20/F27 inteiros (matriz de cobertura da
// ajuda, `<LinkAjuda>` na tela, paleta Ctrl+K, título de aba, smoke logado) — e a
// informação não precisa de endereço próprio.
//
// CARREGA NO CLIQUE. São N pessoas na tabela; uma consulta por linha na montagem
// seria um round-trip por colaborador para algo que quase nunca é olhado.
export function ComEstaPessoaLinha({
  colaboradorId,
  nome,
}: {
  colaboradorId: string
  nome: string
}) {
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState<{
    saldos: SaldoDoColaborador[]
    semVinculo: number
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, iniciar] = useTransition()

  function alternar() {
    if (aberto) {
      setAberto(false)
      return
    }
    setAberto(true)
    if (dados || carregando) return
    // O erro da tentativa anterior sai ANTES da nova: sem isto, uma segunda
    // tentativa bem-sucedida mostrava a mensagem vermelha antiga em cima da lista
    // correta (achado da revisão de código de 29/08/2026).
    setErro(null)
    iniciar(async () => {
      const r = await buscarSaldoDoColaborador(colaboradorId)
      if (r.ok) setDados({ saldos: r.saldos, semVinculo: r.semVinculo })
      else setErro(r.erro ?? 'Não foi possível ler agora.')
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={alternar}
        aria-expanded={aberto}
        aria-label={`Ver o que está com ${nome}`}
        className="gap-1.5"
      >
        {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <PackageOpen className="size-4" aria-hidden />
        <span className="hidden sm:inline">Itens</span>
      </Button>

      {aberto && (
        <div className="bg-muted/40 mt-2 rounded-md p-3 text-left">
          {carregando && <p className="text-muted-foreground text-sm">Carregando…</p>}
          {erro && <p className="text-destructive text-sm">{erro}</p>}
          {dados && (
            <ComEstaPessoa saldos={dados.saldos} semVinculo={dados.semVinculo} compacto />
          )}
        </div>
      )}
    </>
  )
}

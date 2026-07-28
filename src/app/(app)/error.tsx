'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PainelErro } from '@/components/layout/painel-erro'

// Boundary da RAIZ do grupo (app) — a rede de segurança que faltava (F13/A2).
// Existiam boundaries em ativos/, itens/, movimentacoes/ e pendencias/, mas não
// aqui: qualquer `throw` em /admin/**, /ajuda, /relatorios/** ou numa Server
// Action chamada dessas telas subia até o boundary GLOBAL do Next e trocava o
// documento inteiro pela página crua em inglês ("This page couldn't load / A
// server error occurred", com o digest). Foi exatamente o que o operador viu no
// convite (B1). Aqui o erro degrada só o conteúdo: header e sidebar continuam,
// o operador tem "Tentar de novo" e um caminho de volta.
//
// ISTO É CONTENÇÃO, NÃO CORREÇÃO: não conserta a causa de falha nenhuma — só
// impede que a próxima apague a tela. O que a F20B mudou é que o "Tentar de
// novo" agora REFAZ as leituras do segmento (`unstable_retry`, Next ≥ 16.2);
// antes chamava `reset()` puro e o clique não fazia nada.
//
// Nada de stack, mensagem crua ou digest na UI (pode conter detalhe de
// infraestrutura); o objeto vai para o console do navegador, como nos boundaries
// irmãos.
export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <PainelErro
      titulo="Algo deu errado nesta tela"
      mensagem="A operação não foi concluída. Tente de novo; se continuar, avise o administrador do sistema."
      aoTentar={unstable_retry}
      reset={reset}
      rotuloTentar="Tentar de novo"
    >
      {/* Saída que TROCA a URL: o retry refaz as leituras, mas do mesmo segmento
          e com os mesmos searchParams — quando a causa está na própria rota, ele
          refalha sempre (mesmo motivo documentado em pendencias/error.tsx). Aqui
          é `Link` porque o destino é outra rota — sem o recarregamento inteiro. */}
      <Button asChild variant="ghost">
        <Link href="/">Ir para o início</Link>
      </Button>
    </PainelErro>
  )
}

'use client'

import { useEffect } from 'react'
import { lembrarAtivoRecente } from '@/lib/ativos/ativos-recentes'

// F29/UXG-10b — grava na sessão que ESTE ativo foi aberto, para a paleta de comandos
// mostrar "Recentes" em vez de abrir vazia. Não renderiza nada.
//
// Mesmo desenho de `lembrar-lista.tsx`: o efeito é o lugar certo porque escrever em
// `sessionStorage` é sincronizar com um sistema externo, não estado de React. Roda de
// novo quando o `id` muda — a navegação entre fichas é soft e o componente não
// remonta.
export function LembrarAtivoRecente({
  id,
  patrimonio,
  descricao,
}: {
  id: string
  patrimonio: string
  descricao: string
}) {
  useEffect(() => {
    lembrarAtivoRecente({ id, patrimonio, descricao })
  }, [id, patrimonio, descricao])

  return null
}

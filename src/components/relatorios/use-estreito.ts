'use client'

import { useEffect, useState } from 'react'

// Largura de tela "estreita" (< sm): no mobile o card fica em coluna única, e um
// eixo Y de 150px comeria quase metade da largura útil — rótulos longos de motivo
// ou de item estouram. Os gráficos horizontais encolhem o eixo e truncam o rótulo
// abaixo deste ponto (o valor exato segue à direita e no tooltip).
//
// Nasceu dentro de `barras-horizontais.tsx` (F3). A F32/RV-10 precisou da MESMA
// régua nas barras divergentes, cujo eixo era 110px fixo: em vez de uma segunda
// cópia do hook, ele subiu para cá. Client-only por definição (`matchMedia`);
// começa `false` para que o HTML do servidor e o da primeira pintura coincidam —
// o desktop é o caso comum e a correção do mobile chega no primeiro efeito.
export function useEstreito(): boolean {
  const [estreito, setEstreito] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setEstreito(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return estreito
}

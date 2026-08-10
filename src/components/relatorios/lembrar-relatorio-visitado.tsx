'use client'

import { useEffect } from 'react'
import { lembrarRelatorioVisitado } from '@/components/relatorios/relatorio-visitado'

// F32/RV-17 — grava, ao montar, qual filial (ou "geral") está sendo vista no
// relatório AO VIVO. É a metade "escrita" da memória que `viewer-nav.tsx` lê para
// o item "Ao vivo" voltar à mesma aba depois de uma passagem pelo arquivo de
// relatórios gerados — sem isso o gestor de UMA filial reseleciona a aba dele a
// cada volta.
//
// Sem UI própria (`return null`): existe só pelo efeito colateral. Component
// dedicado, e não um `useEffect` solto na página, porque a página ao vivo
// (`relatorios/[filial]/page.tsx`) é Server Component — o efeito precisa de um
// Client Component próprio para existir.
//
// A dependência é só `slug`: a rota `/relatorios/[filial]` troca de `slug` a cada
// navegação de aba, o que já dispara o efeito de novo — não há necessidade (nem
// seria correto) de reler a cada render.
export function LembrarRelatorioVisitado({ slug }: { slug: string }) {
  useEffect(() => {
    lembrarRelatorioVisitado(slug)
  }, [slug])
  return null
}

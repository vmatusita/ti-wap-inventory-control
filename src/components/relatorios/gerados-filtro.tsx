'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import { FiltroFilial } from '@/components/layout/filtro-filial'

// Filtro por filial do histórico de relatórios gerados (OS-F3 3.8.4; multi na F25).
//
// É a única tela cuja lista de opções tem um item que NÃO é filial: "Consolidado"
// (`geral`), que no banco é `filial_id is null`. Ele entra como uma opção normal do
// popover, e `listarRelatoriosGerados` é que sabe traduzi-lo — inclusive quando vem
// junto com filiais, caso em que o filtro precisa virar um OR.
//
// ⚠ SEM padrão por cargo aqui, de propósito (decisão F25 §4.7): o arquivo é global.
export function GeradosFiltroFilial({
  filiais,
  selecionados,
}: {
  filiais: { slug: string; nome: string }[]
  selecionados: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, start] = useTransition()
  useReportarNavegacao(isPending)

  // Antes esta função montava a URL do ZERO (`?filial=` + valor), descartando
  // qualquer outro param. Era inócuo enquanto a tela não tinha mais nenhum, mas
  // quebraria no dia em que ganhasse ordenação ou paginação — e o precedente
  // correto da casa é preservar o resto da query.
  function aplicar(valor: string) {
    const novo = new URLSearchParams(params.toString())
    novo.set('filial', valor)
    const qs = novo.toString()
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  return (
    <FiltroFilial
      opcoes={[
        { valor: 'geral', rotulo: 'Consolidado' },
        ...filiais.map((f) => ({ valor: f.slug, rotulo: f.nome })),
      ]}
      selecionados={selecionados}
      aplicar={aplicar}
      idPrefixo="gerados-filial"
    />
  )
}

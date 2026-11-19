import { Info } from 'lucide-react'
import { notFound } from 'next/navigation'
import { pedirPorta } from '@/lib/supabase/publico'
import { sessaoDaPorta, tratarRecusa } from '@/lib/relatorios/porta-sessao'
import { caminhoDaPorta, filialForaDaPorta } from '@/lib/auth/porta-rotas'
import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { EstadoVazio } from '@/components/layout/estado-vazio'

export const metadata = {
  title: 'Relatório ao vivo',
}

export const maxDuration = 60

// O ENDEREÇO DO AO VIVO NA PORTA PÚBLICA (F68 · decisão 19/11-1 do Johnny): até a F68B, o relatório AO VIVO não é servido
// pela porta — só os gerados. Este endereço (para onde também levam, pelo 308, os links antigos `/relatorios/<filial>`)
// mostra o aviso com o link para os gerados da MESMA empresa. A filial da URL só é CONFERIDA: o Consolidado (`geral`) ou
// uma filial da empresa da sessão — a lista vem da própria porta (pedido `gerados`, o mesmo par `filialForaDaPorta` da
// página dos gerados); qualquer outro segmento é 404, não o aviso.
export default async function AoVivoDaPortaPage({
  params,
}: {
  params: Promise<{ empresa: string; filial: string }>
}) {
  const { empresa, filial } = await params
  const sessao = await sessaoDaPorta(empresa)
  const r = await pedirPorta('gerados', sessao.empresa.slug, sessao.token, { pagina: 1, filiais: null })
  if (!r.ok) tratarRecusa(sessao.empresa.slug, r.recusa)
  if (filialForaDaPorta([filial], r.filiais)) notFound()
  return (
    <Pagina>
      <CabecalhoDaPagina titulo="Relatório ao vivo" descricao={sessao.empresa.nome} />
      <EstadoVazio
        icone={Info}
        titulo="O relatório ao vivo pela senha de acesso volta numa próxima versão"
        descricao="Enquanto isso, veja os relatórios gerados — os snapshots semanais congelados."
        acao={{ href: caminhoDaPorta(sessao.empresa.slug, 'gerados'), rotulo: 'Ver os relatórios gerados' }}
      />
    </Pagina>
  )
}

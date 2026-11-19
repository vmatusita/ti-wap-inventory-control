import { Info } from 'lucide-react'
import { sessaoDaPorta } from '@/lib/relatorios/porta-sessao'
import { caminhoDaPorta } from '@/lib/auth/porta-rotas'
import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { EstadoVazio } from '@/components/layout/estado-vazio'

export const metadata = {
  title: 'Relatório ao vivo',
}

export const maxDuration = 60

// O ENDEREÇO DO AO VIVO NA PORTA PÚBLICA (F68 · decisão 19/11-1 do Johnny): até a F68B, o relatório AO VIVO não é servido
// pela porta — só os gerados. Este endereço (para onde também levam, pelo 308, os links antigos `/relatorios/<filial>`)
// mostra o aviso com o link para os gerados da MESMA empresa. A página não lê a filial da URL: nada aqui depende dela.
export default async function AoVivoDaPortaPage({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa } = await params
  const sessao = await sessaoDaPorta(empresa)
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

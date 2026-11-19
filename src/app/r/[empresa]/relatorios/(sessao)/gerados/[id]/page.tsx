import Link from 'next/link'
import { ArrowLeft, ArrowRight, FileText, TriangleAlert } from 'lucide-react'
import { pedirPorta } from '@/lib/supabase/publico'
import { sessaoDaPorta, tratarRecusa } from '@/lib/relatorios/porta-sessao'
import { caminhoDaPorta } from '@/lib/auth/porta-rotas'
import { FORMA_SNAPSHOT } from '@/lib/queries/formas/relatorios-gerados'
import { LISTA_DO_SNAPSHOT, cabeNaLista, completarParaRender } from '@/lib/relatorios/lista-branca-porta'
import { mapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import { formatDate, formatDateTime } from '@/lib/format'
import { CorpoRelatorio } from '@/components/relatorios/corpo-relatorio'
import { BotaoImprimir } from '@/components/relatorios/botao-imprimir'
import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { Aviso } from '@/components/layout/aviso'

export const metadata = {
  title: 'Relatório gerado',
}

export const maxDuration = 60

// UM RELATÓRIO GERADO PELA PORTA PÚBLICA (F68). O banco devolve o snapshot JÁ PROJETADO pela lista branca
// (`relatorio_publico_projetar` com o `k_lista` de `relatorio_publico_dados`) — sem colaborador, setor, autor de anotação,
// quem gerou, nem ids internos, inclusive dos snapshots antigos que congelaram esses nomes (decisão 19/11-2). Aqui, a
// SEGUNDA linha: `cabeNaLista` confere que nenhuma chave fora da lista chegou (se chegou, a página FALHA — não
// renderiza); `completarParaRender` devolve as chaves de pessoa como `null` (nunca com valor) só para caber nos tipos; e o
// corpo renderiza com `semPessoas` — as colunas de pessoa SOMEM da tela.
export default async function GeradoDaPortaPage({ params }: { params: Promise<{ empresa: string; id: string }> }) {
  const { empresa, id } = await params
  const sessao = await sessaoDaPorta(empresa)
  const slug = sessao.empresa.slug

  const r = await pedirPorta('gerado', slug, sessao.token, { id })
  if (!r.ok) tratarRecusa(slug, r.recusa)
  const g = r.gerado
  if (!cabeNaLista(g.dados, LISTA_DO_SNAPSHOT)) {
    throw new Error('porta: o snapshot chegou com campo fora da lista branca — a página não renderiza')
  }
  const snapshot = FORMA_SNAPSHOT.parse(completarParaRender(g.dados))
  const detalhe = (alvo: string) => caminhoDaPorta(slug, `gerados/${alvo}`)

  return (
    <Pagina>
      <Link
        href={caminhoDaPorta(slug, 'gerados')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="size-4" />
        Relatórios gerados
      </Link>

      <Aviso intencao="informacao" icone={<FileText className="size-4" />}>
        <strong>Relatório gerado</strong> · {g.filialNome} · {formatDate(g.periodo_de)} a {formatDate(g.periodo_ate)} ·
        versão {g.versao} · em {formatDateTime(g.gerado_em)} · dados congelados
      </Aviso>

      {g.versaoMaisNova && (
        <Aviso intencao="atencao" icone={<TriangleAlert className="size-4" />} className="print:hidden">
          <Link href={detalhe(g.versaoMaisNova.id)} className="underline underline-offset-2">
            Existe a versão {g.versaoMaisNova.versao} deste relatório — abrir a mais recente.
          </Link>
        </Aviso>
      )}

      <CabecalhoDaPagina
        titulo={`Relatório — ${g.filialNome}`}
        descricao={`Snapshot de ${formatDate(g.periodo_de)} a ${formatDate(g.periodo_ate)}`}
        acoes={<BotaoImprimir />}
      />

      <CorpoRelatorio snapshot={snapshot} ehOperador={false} semPessoas rotulosTipo={mapaRotulosTipo(r.tipos)} />

      <nav
        aria-label="Navegar entre snapshots deste escopo"
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 print:hidden"
      >
        {g.anterior ? (
          <Link
            href={detalhe(g.anterior.id)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Período anterior ({formatDate(g.anterior.periodo_de)} a {formatDate(g.anterior.periodo_ate)})
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Este é o snapshot mais antigo deste escopo</span>
        )}
        {g.proximo ? (
          <Link
            href={detalhe(g.proximo.id)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Próximo período ({formatDate(g.proximo.periodo_de)} a {formatDate(g.proximo.periodo_ate)})
            <ArrowRight className="size-4" />
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Este é o snapshot mais recente deste escopo</span>
        )}
      </nav>
    </Pagina>
  )
}

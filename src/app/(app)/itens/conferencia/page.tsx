import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardCheck, PackageOpen } from 'lucide-react'
import { getOperador } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'
import { filiaisParaEscrita, podeEscreverNoEscopo } from '@/components/layout/permissoes'
import { listarFiliais } from '@/lib/queries/filiais'
import { getSaldosItens } from '@/lib/queries/itens'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { AvisoSemFilialDeEscrita } from '@/components/layout/aviso-sem-escrita'
import { ConferenciaEstoque } from '@/components/itens/conferencia/conferencia-estoque'
import { idNumerico } from '@/lib/url-params'
import { recusarFilialInexistente } from '@/lib/unidades/pertinencia'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Conferência de estoque',
}

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

// Conferência de estoque — inventário físico de UMA filial (F31 · ITN-04).
//
// POR QUE É UMA ROTA PRÓPRIA, e não um modo de `?conferir=N` dentro de /itens.
// A tela de itens é um Server Component grande, orientado 100% por
// `searchParams`, com duas visões, dois blocos de filtro e uma tabela sticky. A
// conferência é o oposto: um fluxo CLIENT, de estado longo (contagens, rascunho,
// progresso por bloco, sucesso parcial). Como modo, a página renderizaria um
// corpo completamente diferente conforme um parâmetro e as duas naturezas se
// misturariam. O precedente da casa para exatamente isto é `/movimentacoes/nova`
// — fluxo stateful, com rascunho em `sessionStorage`, fora da lista.
//
// UMA FILIAL POR VEZ, escolhida ao entrar: casa com o mundo físico (conta-se uma
// prateleira, não cinco) e não deixa ambiguidade de saldo — o saldo de um item É
// por filial.
export default async function ConferenciaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const sp = await searchParams
  const filiais = await listarFiliais()
  const opcoesDeEscrita = filiaisParaEscrita(operador, filiais)
  const escreve = podeEscrever(operador.papel)

  // F57 — a filial que NÃO EXISTE responde 404, como nas outras rotas. A que EXISTE e este cargo
  // não escreve continua caindo no seletor logo abaixo: aqui o parâmetro governa ESCRITA, e o
  // seletor é a resposta certa para "existe, mas não é sua".
  await recusarFilialInexistente(await createClient(), primeiro(sp.filial), 'id')

  // A filial da URL só vale se este cargo ESCREVE nela — conferir é gravar
  // ajustes. Filial inválida, ausente ou fora do alcance cai no seletor, nunca
  // numa tela que só recusaria no fim. (A trava real é a policy `operador lanca`,
  // que `lancarItens` atravessa; isto é ergonomia.)
  const filialPedida = idNumerico(primeiro(sp.filial))
  const filialId = podeEscreverNoEscopo(operador, filialPedida) ? filialPedida : null
  const filial = filialId != null ? filiais.find((f) => f.id === filialId) : undefined

  // O casco e o título saem daqui — as QUATRO saídas da tela (sem escrita, sem
  // filial escolhida, filial sem item, conferência aberta) passam pelo MESMO
  // `<CabecalhoDaPagina>`, nunca um `<h1>` próprio (regra 1 da régua).
  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Conferência de estoque"
      ajuda="conferencia-de-estoque"
      ajudaRotulo="Ajuda sobre a conferência de estoque"
      descricao="Conte a prateleira de uma filial e registre as diferenças de uma vez."
    />
  )

  // Cargo sem escrita nenhuma (consulta), ou operador sem vínculo: a tela explica
  // em vez de abrir um seletor vazio.
  if (!escreve || opcoesDeEscrita.length === 0) {
    return (
      <Pagina>
        {cabecalho}
        {escreve ? (
          <AvisoSemFilialDeEscrita />
        ) : (
          <EstadoVazio
            icone={ClipboardCheck}
            titulo="A conferência é de quem registra"
            descricao="O seu cargo consulta os saldos, mas não grava ajustes. Peça a um operador ou administrador para conferir o estoque."
            acao={{ href: '/itens', rotulo: 'Voltar para Itens' }}
          />
        )}
      </Pagina>
    )
  }

  if (!filial) {
    return (
      <Pagina>
        {cabecalho}
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>De qual filial é a conferência?</CardTitle>
            <CardDescription>
              O estoque é contado por filial. Escolha a que você tem na frente — dá para
              conferir as outras depois, uma de cada vez.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {opcoesDeEscrita.map((f) => (
              <Button key={f.id} asChild variant="outline" className="min-h-11">
                <Link href={`/itens/conferencia?filial=${f.id}`}>{f.nome}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </Pagina>
    )
  }

  const saldos = await getSaldosItens(filial.id)

  if (saldos.length === 0) {
    return (
      <Pagina>
        {cabecalho}
        <EstadoVazio
          icone={PackageOpen}
          titulo="Nenhum item para conferir"
          descricao={`O catálogo de itens está vazio ou nunca houve lançamento em ${filial.nome}. Cadastre os itens em Administração → Itens antes de conferir.`}
          acao={{ href: '/itens', rotulo: 'Voltar para Itens' }}
        />
      </Pagina>
    )
  }

  return (
    <Pagina>
      {cabecalho}
      {/* ⚠ `key` NÃO é enfeite: sem ela o React reusa a instância ao trocar de
          filial pelos atalhos "Conferir outra filial", e as contagens da filial
          anterior — mais a BASE CONGELADA dos saldos dela — atravessariam para a
          nova, produzindo diferenças inventadas. Achado da 2ª revisão
          adversarial da F31. */}
      <ConferenciaEstoque
        key={filial.id}
        filialId={filial.id}
        filialNome={filial.nome}
        saldos={saldos}
        outrasFiliais={opcoesDeEscrita.filter((f) => f.id !== filial.id)}
      />
    </Pagina>
  )
}

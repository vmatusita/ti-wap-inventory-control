import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardCheck, PackageOpen } from 'lucide-react'
import { getOperador } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'
import { filiaisParaEscrita, podeEscreverNaFilial } from '@/components/layout/permissoes'
import { listarFiliais } from '@/lib/queries/filiais'
import { getSaldosItens } from '@/lib/queries/itens'
import { Button } from '@/components/ui/button'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { AvisoSemFilialDeEscrita } from '@/components/layout/aviso-sem-escrita'
import { ConferenciaEstoque } from '@/components/itens/conferencia/conferencia-estoque'
import { idNumerico } from '@/lib/url-params'

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
  const filiaisEscrita = filiaisParaEscrita(operador, filiais)
  const escreve = podeEscrever(operador.papel)

  // A filial da URL só vale se este cargo ESCREVE nela — conferir é gravar
  // ajustes. Filial inválida, ausente ou fora do alcance cai no seletor, nunca
  // numa tela que só recusaria no fim. (A trava real é a policy `operador lanca`,
  // que `lancarItens` atravessa; isto é ergonomia.)
  const filialPedida = idNumerico(primeiro(sp.filial))
  const filialId = podeEscreverNaFilial(operador, filialPedida) ? filialPedida : null
  const filial = filialId != null ? filiais.find((f) => f.id === filialId) : undefined

  const cabecalho = (
    <div>
      <div className="flex items-center gap-0.5">
        <h1 className="text-2xl font-semibold tracking-tight">Conferência de estoque</h1>
        <LinkAjuda
          pagina="conferencia-de-estoque"
          rotulo="Ajuda sobre a conferência de estoque"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Conte a prateleira de uma filial e registre as diferenças de uma vez.
      </p>
    </div>
  )

  // Cargo sem escrita nenhuma (consulta), ou operador sem vínculo: a tela explica
  // em vez de abrir um seletor vazio.
  if (!escreve || filiaisEscrita.length === 0) {
    return (
      <div className="space-y-4">
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
      </div>
    )
  }

  if (!filial) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <section className="max-w-md space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">De qual filial é a conferência?</h2>
          <p className="text-sm text-muted-foreground">
            O estoque é contado por filial. Escolha a que você tem na frente — dá para conferir
            as outras depois, uma de cada vez.
          </p>
          <div className="flex flex-wrap gap-2">
            {filiaisEscrita.map((f) => (
              <Button key={f.id} asChild variant="outline" className="min-h-11">
                <Link href={`/itens/conferencia?filial=${f.id}`}>{f.nome}</Link>
              </Button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const saldos = await getSaldosItens(filial.id)

  if (saldos.length === 0) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          icone={PackageOpen}
          titulo="Nenhum item para conferir"
          descricao={`O catálogo de itens está vazio ou nunca houve lançamento em ${filial.nome}. Cadastre os itens em Administração → Itens antes de conferir.`}
          acao={{ href: '/itens', rotulo: 'Voltar para Itens' }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
        outrasFiliais={filiaisEscrita.filter((f) => f.id !== filial.id)}
      />
    </div>
  )
}

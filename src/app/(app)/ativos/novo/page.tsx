import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { NovaCompraForm } from '@/components/ativos/nova-compra-form'
import {
  CabecalhoDaPagina,
  MEDIDA_DE_FORMULARIO,
  Pagina,
} from '@/components/layout/pagina'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { filiaisParaEscrita } from '@/components/layout/permissoes'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  dadosParaDuplicarCompra,
  ultimaCompraDoOperador,
  type DadosCompraInicial,
} from '@/lib/queries/compras'
import { getOperador, MSG_SOMENTE_LEITURA } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Novo equipamento',
}

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export default async function NovoEquipamentoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  // A6 — "Comprar outro igual" na ficha manda `?duplicar=<id do ativo>`.
  // Id fora do formato uuid devolve null (não derruba a página).
  const duplicarParam = texto(sp.duplicar)

  // F33 — sem `getPerfilAtual()`: ele refazia um `auth.getUser()` DE REDE mais um
  // select em `profiles` para responder o que `getOperador()` — na linha de baixo,
  // no mesmo `Promise.all` — já responde. O `id` é o mesmo nos dois (`operador.id`
  // é o `user.id` do profile) e é só disso que esta tela precisa.
  const [filiais, operador] = await Promise.all([listarFiliais(), getOperador()])

  // F21 — a filial que RECEBE a compra é escrita: o select oferece só as filiais
  // vinculadas (admin → todas as ativas). A lista de leitura desta tela não
  // existe, então aqui não há duas listas para conciliar.
  const filiaisEscrita = filiaisParaEscrita(operador, filiais)

  const [inicial, ultimaCompra] = await Promise.all<DadosCompraInicial | null>([
    duplicarParam ? dadosParaDuplicarCompra(duplicarParam) : Promise.resolve(null),
    operador ? ultimaCompraDoOperador(operador.id) : Promise.resolve(null),
  ])

  return (
    // F40 — o `mx-auto max-w-3xl` saiu do CONTAINER e virou `MEDIDA_DE_FORMULARIO`
    // no bloco dos campos (decisão do Johnny, 30/08/2026). É a única mudança de
    // posição visível desta fase: a tela deixa de ser uma coluna centrada e passa
    // a começar na mesma linha vertical do cabeçalho do app e de todas as outras
    // telas. O formulário continua com os mesmos 768px — o que mudou é que o
    // título, o link de voltar e os avisos deixaram de acompanhar a centragem.
    <Pagina>
      <Link
        href="/ativos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para ativos
      </Link>

      <CabecalhoDaPagina
        titulo="Novo equipamento"
        ajuda="cadastrar-compra"
        ajudaRotulo="Ajuda: como cadastrar um equipamento"
        descricao="Entrada por compra — os equipamentos nascem em estoque na filial que recebeu, com uma movimentação de compra na linha do tempo. Compra em série? Cole a lista ou informe a faixa de patrimônios."
      />

      {/* Cargo Consulta abriu a URL direto (nenhum caminho da UI leva até aqui):
          diz o motivo em vez de oferecer um formulário que a action recusaria.
          Isto é reforço, não a trava — `registrarCompra` recusa no servidor. */}
      {podeEscrever(operador?.papel) ? (
        <div className={MEDIDA_DE_FORMULARIO}>
          <NovaCompraForm
            filiais={filiaisEscrita}
            inicial={inicial}
            ultimaCompra={ultimaCompra}
          />
        </div>
      ) : (
        <EstadoVazio
          className={MEDIDA_DE_FORMULARIO}
          icone={Eye}
          titulo="Esta tela registra uma compra"
          descricao={MSG_SOMENTE_LEITURA}
          acao={{ href: '/ativos', rotulo: 'Voltar para ativos' }}
        />
      )}
    </Pagina>
  )
}

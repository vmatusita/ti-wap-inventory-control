import { CartaoDeMetrica, GradeDeMetricas } from '@/components/layout/cartao-de-metrica'
import type { CabecalhoDeNumero } from '@/components/itens/cabecalho-de-numero'
import type { ResumoDaLista } from '@/lib/itens/distribuicao'

// O RESUMO DA LISTA (F43) — quatro números grandes antes da tabela.
//
// POR QUE ELE EXISTE. A tela não tinha resumo nenhum: só o subtítulo "N itens no
// catálogo". Quem abria `/itens` para saber o tamanho do acervo tinha de somar
// 44 linhas de cabeça. E, pior, o SIGNIFICADO de cada número só existia dentro da
// dica do cabeçalho da coluna — aqui ele aparece embaixo do número, sempre.
//
// ⚠ SOMA O QUE ESTÁ FILTRADO, e não o catálogo inteiro. O cartão tem de fechar
// com a lista que está na tela: resumo global sobre lista recortada é a MESMA
// classe de defeito que a F25 corrigiu no selo de pendências ("o operador vê 20 e
// encontra 5, sem nada explicando a diferença"). Quem chama passa as linhas
// FILTRADAS — todas elas, não só as da página.
//
// ⚠ PRIMEIRO CONSUMIDOR DE `CartaoDeMetrica`/`GradeDeMetricas`. Os dois nasceram
// na F40 e nunca foram renderizados por ninguém; o próprio arquivo deles pede que
// quem os adotar confira o par `py-0` do `Card` com o `p-(--card-spacing)` do
// filho clicável numa tela de verdade. **Estes cartões são ESTÁTICOS** (sem
// `href`, sem `onClick`), então não passam por esse caminho: recortar a lista por
// "a repor" pediria um filtro de URL novo, e filtro novo está explicitamente fora
// do escopo desta fase. O par continua sem consumidor — dito com todas as letras
// no relatório, em vez de deixado por descobrir.
//
// Server Component: dado pronto, sem estado, sem evento.

// Os dois alarmes têm cartão PRÓPRIO, e só aparecem quando não são zero.
//
// ⚠ "· N NESTA PÁGINA" NÃO É ENFEITE, é conserto de uma confusão MEDIDA, em duas
// passadas. O cartão conta a lista FILTRADA (todas as páginas) e a tabela mostra
// UMA página — então o julgamento em contexto fresco lia "A repor: 11", contava 5
// selos na tela e hesitava: "deve haver mais na página 2, não sei". Estava certo,
// e quem devia a resposta era a tela. Dizendo os dois números, a diferença deixa
// de ser dúvida e vira informação: 11 na lista, 5 aqui.
//
// A cláusula da página só aparece quando os dois números DIVERGEM — com uma
// página só, ela seria repetição.
function alarmes(resumo: ResumoDaLista, daPagina?: ResumoDaLista) {
  const lista: { rotulo: string; valor: string; apoio: string }[] = []
  const comPagina = (base: string, total: number, naPagina: number | undefined) =>
    naPagina !== undefined && naPagina !== total
      ? `${base} · ${naPagina.toLocaleString('pt-BR')} nesta página`
      : base
  if (resumo.aRepor > 0) {
    lista.push({
      rotulo: 'A repor',
      valor: resumo.aRepor.toLocaleString('pt-BR'),
      apoio: comPagina(
        resumo.aRepor === 1 ? 'item abaixo do mínimo' : 'itens abaixo do mínimo',
        resumo.aRepor,
        daPagina?.aRepor,
      ),
    })
  }
  if (resumo.comFalta > 0) {
    lista.push({
      rotulo: 'Falta',
      valor: resumo.comFalta.toLocaleString('pt-BR'),
      apoio: comPagina(
        resumo.comFalta === 1 ? 'item com déficit' : 'itens com déficit',
        resumo.comFalta,
        daPagina?.comFalta,
      ),
    })
  }
  return lista
}

export function ResumoDeItens({
  resumo,
  resumoDaPagina,
  cabecalhos,
}: {
  /** A lista FILTRADA inteira — todas as páginas. */
  resumo: ResumoDaLista
  /** Só as linhas que estão na tela agora; alimenta o "· N nesta página". */
  resumoDaPagina?: ResumoDaLista
  /** `NUMEROS_ITEM` — a MESMA fonte dos rótulos da tabela e da página de ajuda. */
  cabecalhos: readonly CabecalhoDeNumero[]
}) {
  const meta = (chave: string, padrao: string) =>
    cabecalhos.find((c) => c.chave === chave) ?? { rotulo: padrao, curto: undefined }

  const estoque = meta('estoque', 'Em estoque')
  const emUso = meta('emUso', 'Em uso')
  const total = meta('total', 'Total')
  const extras = alarmes(resumo, resumoDaPagina)

  return (
    // 2 colunas no celular (o padrão da `GradeDeMetricas`), 3 a partir de `sm` e
    // uma coluna por cartão a partir de `lg` — os alarmes entram e saem conforme
    // existam, então a grade não pode presumir um número fixo de filhos.
    <GradeDeMetricas className="sm:grid-cols-3 lg:grid-cols-5">
      <CartaoDeMetrica
        rotulo={estoque.rotulo}
        valor={resumo.estoque.toLocaleString('pt-BR')}
        apoio={estoque.curto}
      />
      <CartaoDeMetrica
        rotulo={emUso.rotulo}
        valor={resumo.emUso.toLocaleString('pt-BR')}
        apoio={emUso.curto}
      />
      <CartaoDeMetrica
        rotulo={total.rotulo}
        valor={resumo.total.toLocaleString('pt-BR')}
        apoio={total.curto}
      />
      {extras.map((a) => (
        <CartaoDeMetrica key={a.rotulo} rotulo={a.rotulo} valor={a.valor} apoio={a.apoio} />
      ))}
    </GradeDeMetricas>
  )
}

import { CartaoDeMetrica, GradeDeMetricas } from '@/components/layout/cartao-de-metrica'
import type { CabecalhoDeNumero } from '@/components/itens/cabecalho-de-numero'
import type { ResumoDaLista } from '@/lib/itens/distribuicao'
import { fraseDoResumo, ondeDoEscopo, type EscopoDosNumeros } from '@/lib/itens/escopo'
import { tintaDoNumero } from '@/lib/itens/tinta'
import { cn } from '@/lib/utils'

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
// ============================================================================
// F44 — A LINHA DE ESCOPO, E A CHAVE DE COR
// ============================================================================
// Até a v1.48.0 esta grade mostrava o número DA FILIAL FILTRADA com a legenda
// "tudo que a TI possui" embaixo, e a única pista do recorte era o badge de
// contagem no botão "Filial" — que o julgamento em contexto fresco leu como "1"
// quando eram TRÊS. Agora a grade abre com uma frase que NOMEIA o escopo, e o
// `curto` de *Total* vem de `cabecalhosComEscopo` já recortado.
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
function alarmes(
  resumo: ResumoDaLista,
  escopo: EscopoDosNumeros,
  daPagina?: ResumoDaLista,
) {
  // `chave` é a da tinta (F44): "repor" é âmbar (previsão de compra) e "falta" é
  // vermelho (compromisso já assumido) — os dois convivem e significam coisas
  // diferentes desde a F12, e agora a cor diz isso também no cartão.
  const lista: { chave: string; rotulo: string; valor: string; apoio: string }[] = []
  const comPagina = (base: string, total: number, naPagina: number | undefined) =>
    naPagina !== undefined && naPagina !== total
      ? `${base} · ${naPagina.toLocaleString('pt-BR')} nesta página`
      : base
  if (resumo.aRepor > 0) {
    // ⚠ O CARTÃO DIZ CONTRA QUAL ESTOQUE ESTÁ COMPARANDO, e isso saiu de uma
    // MEDIÇÃO, não de gosto. A primeira escrita dizia só "itens abaixo do mínimo".
    // No teste dos 5 segundos, a pergunta "quais itens precisam ser repostos, E
    // COMPARADOS COM O QUÊ?" hesitou em 4 das 8 passadas: todos os julgamentos
    // responderam "com o mínimo do item" e NENHUM soube dizer com qual estoque.
    // A linha de escopo acima e a legenda da tabela nomeiam Total/Em estoque/Em
    // uso/Falta — o "repor" é um QUINTO número, e herdava um escopo que ninguém
    // tinha escrito. É também o critério 5 da ordem, ao pé da letra: o selo e a
    // dica têm de deixar claro contra qual estoque comparam.
    //
    // ⚠ E DIZ O DENOMINADOR — "de 44 itens" —, que é o TERCEIRO desenho desta
    // fase e o mais contraintuitivo dos três. Com o "repor" seguindo o filtro,
    // 36 dos 44 itens acendem numa filial só (os mínimos foram configurados
    // pensando no acervo somado, e um quinto do acervo raramente alcança um
    // mínimo pensado para o todo). O julgamento em contexto fresco tropeçava
    // exatamente nisso: *"a etiqueta aparece em praticamente todo item, então
    // não dá para saber se é alerta ou só um rótulo padrão"*. Escondendo a
    // enxurrada, a tela mentiria; NOMEANDO a proporção, ela transforma a dúvida
    // em informação — sim, é quase tudo, e é por isso que quase tudo está
    // marcado.
    const onde = ondeDoEscopo(escopo)
    const base = resumo.aRepor === 1 ? 'item abaixo do mínimo' : 'itens abaixo do mínimo'
    const comEscopo = onde ? `${base} ${onde}` : base
    const comTotal =
      resumo.itens > resumo.aRepor
        ? `de ${resumo.itens.toLocaleString('pt-BR')} ${comEscopo}`
        : comEscopo
    lista.push({
      chave: 'repor',
      rotulo: 'A repor',
      valor: resumo.aRepor.toLocaleString('pt-BR'),
      apoio: comPagina(comTotal, resumo.aRepor, daPagina?.aRepor),
    })
  }
  if (resumo.comFalta > 0) {
    lista.push({
      chave: 'falta',
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

/**
 * O rótulo do cartão com a chave de cor ao lado — a MESMA tinta do cabeçalho da
 * coluna e do número da célula (F44).
 *
 * Fora do render de propósito: componente declarado DENTRO de outro é remontado a
 * cada passada (regra `react-hooks/static-components`).
 */
function RotuloComTinta({ chave, texto }: { chave: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn('size-2 shrink-0 rounded-xs', tintaDoNumero(chave).marca)}
        aria-hidden
      />
      {texto}
    </span>
  )
}

/**
 * O NÚMERO GRANDE do cartão, na tinta do número (F44).
 *
 * ⚠ A primeira escrita pintava só o quadradinho do rótulo, e a revisão adversarial
 * pegou: o critério 6 da ordem diz "uma cor por número, nos TRÊS lugares — o
 * cartão, o cabeçalho e a célula", e detalha "cartão: o número grande na tinta".
 * Com só o quadradinho, o cartão tinha a chave de cor mas não a COR — e a mesma
 * tinta que salta na célula sumia justo no número maior da tela.
 *
 * O par já estava medido: 24px semibold é "texto grande" pela WCAG (limiar 3:1), e
 * as quatro tintas sobre `card` medem de 4,73:1 a 12,81:1.
 */
function ValorComTinta({ chave, valor }: { chave: string; valor: string }) {
  return <span className={tintaDoNumero(chave).texto}>{valor}</span>
}

export function ResumoDeItens({
  resumo,
  resumoDaPagina,
  cabecalhos,
  escopo,
}: {
  /** A lista FILTRADA inteira — todas as páginas. */
  resumo: ResumoDaLista
  /** Só as linhas que estão na tela agora; alimenta o "· N nesta página". */
  resumoDaPagina?: ResumoDaLista
  /**
   * `NUMEROS_ITEM` **já passado por `cabecalhosComEscopo`** — a MESMA lista que a
   * tabela recebe. O `curto` de *Total* muda com o recorte; os rótulos, nunca.
   */
  cabecalhos: readonly CabecalhoDeNumero[]
  /** De quem são estes números — vira a linha acima da grade. */
  escopo: EscopoDosNumeros
}) {
  const meta = (chave: string, padrao: string) =>
    cabecalhos.find((c) => c.chave === chave) ?? { rotulo: padrao, curto: undefined }

  const estoque = meta('estoque', 'Em estoque')
  const emUso = meta('emUso', 'Em uso')
  const total = meta('total', 'Total')
  const extras = alarmes(resumo, escopo, resumoDaPagina)

  return (
    <div className="flex flex-col gap-2">
      {/* ⚠ A LINHA DE ESCOPO — a primeira das duas superfícies que dizem de quem
          são os números (a outra é a `<caption>` da tabela). Ela aparece SEMPRE,
          inclusive sem filtro ("Números de todas as filiais"): legenda que só
          existe às vezes ensina o operador a não procurá-la. */}
      <p className="text-sm font-medium">{fraseDoResumo(escopo)}</p>
      {/* 2 colunas no celular (o padrão da `GradeDeMetricas`), 3 a partir de `sm` e
          uma coluna por cartão a partir de `lg` — os alarmes entram e saem conforme
          existam, então a grade não pode presumir um número fixo de filhos. */}
      <GradeDeMetricas className="sm:grid-cols-3 lg:grid-cols-5">
        <CartaoDeMetrica
          rotulo={<RotuloComTinta chave="estoque" texto={estoque.rotulo} />}
          valor={<ValorComTinta chave="estoque" valor={resumo.estoque.toLocaleString('pt-BR')} />}
          apoio={estoque.curto}
        />
        <CartaoDeMetrica
          rotulo={<RotuloComTinta chave="emUso" texto={emUso.rotulo} />}
          valor={<ValorComTinta chave="emUso" valor={resumo.emUso.toLocaleString('pt-BR')} />}
          apoio={emUso.curto}
        />
        <CartaoDeMetrica
          rotulo={<RotuloComTinta chave="total" texto={total.rotulo} />}
          valor={<ValorComTinta chave="total" valor={resumo.total.toLocaleString('pt-BR')} />}
          apoio={total.curto}
        />
        {extras.map((a) => (
          <CartaoDeMetrica
            key={a.chave}
            rotulo={<RotuloComTinta chave={a.chave} texto={a.rotulo} />}
            valor={<ValorComTinta chave={a.chave} valor={a.valor} />}
            apoio={a.apoio}
          />
        ))}
      </GradeDeMetricas>
    </div>
  )
}

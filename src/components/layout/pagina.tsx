import { LinkAjuda } from '@/components/layout/link-ajuda'
import { cn } from '@/lib/utils'

// O CASCO DE PÁGINA — a única origem de largura e de título do produto (F40).
//
// ANTES DESTE ARQUIVO as 32 rotas tinham QUATRO ritmos verticais para o mesmo
// gênero de tela (`space-y-4` em 17, `space-y-6` em 9, `space-y-5` em 2,
// `space-y-8` em 2), DEZENOVE `<h1>` com a classe escrita à mão — 18 deles com a
// string idêntica —, e a mesma largura `max-w-3xl` com DOIS alinhamentos
// (`mx-auto` em três rotas, sem em duas). Nada disso era decisão: era o que a
// tela anterior fazia, copiado.
//
// A REGRA AGORA É UMA SÓ: toda tela abre com `<Pagina>`, toda tela titula com
// `<CabecalhoDaPagina>`, e a largura se escolhe por TIPO DE TELA — nunca por
// gosto. `src/lib/layout/consistencia.test.ts` reprova quem escapar.
//
// O plano inteiro (inventário medido, escala de espaçamento, hierarquia
// tipográfica, tokens de cor) está em `docs/PLANO-DESIGN-SYSTEM.md`.

/**
 * As duas larguras do produto.
 *
 * O IRMÃO TINHA TRÊS, TODAS COM TETO, e desfez depois de ver o resultado num
 * monitor de 1920px: o conteúdo parava no meio da tela e sobrava branco à
 * direita, em toda tela. Teto de largura é remédio para LINHA DE TEXTO comprida
 * demais — não para tabela, grade de números ou gráfico, onde espaço a mais vira
 * coluna que não trunca e barra que não rola.
 *
 * O WAP já está do lado certo dessa lição: 23 das 32 rotas não têm teto nenhum.
 * Isto formaliza o que já é prática, em vez de introduzir o erro que o irmão
 * desfez.
 *
 * As classes são LITERAIS de propósito: o Tailwind v4 varre o código-fonte
 * procurando nome de classe, e um `max-w-${variante}` montado em tempo de
 * execução simplesmente não geraria CSS.
 */
export const LARGURAS = {
  /**
   * 768px — texto corrido: `/ajuda/[slug]`, `/ajuda/manual`, `/versoes`.
   *
   * A 14px, 768px dá cerca de 95 caracteres por linha. É o teto que as duas
   * rotas de ajuda já usavam antes desta fase — não é medida nova, é a que
   * estava lá, agora com um nome só.
   */
  estreita: 'max-w-3xl',
  /**
   * Sem teto — ocupa o que a janela tiver. **O padrão.**
   *
   * Listas, relatórios, painéis, fichas e formulários. Quem precisa de medida
   * numa página cheia é o que se LÊ e o que se DIGITA, não a página: daí
   * `MEDIDA_DE_FORMULARIO` abaixo.
   */
  cheia: '',
} as const

export type LarguraDaPagina = keyof typeof LARGURAS

/**
 * A medida do CONTÊINER DOS CAMPOS de um formulário, dentro de página cheia.
 *
 * A contrapartida obrigatória de tirar o teto da página: sem isto, o campo
 * "Nome" de `/admin/tipos-item` mediria 1500px para guardar 25 caracteres. O
 * teto vai no bloco dos campos, nunca na página — assim o cabeçalho, os avisos e
 * as ações continuam alinhados à mesma régua vertical do resto do produto.
 */
export const MEDIDA_DE_FORMULARIO = 'max-w-3xl'

/**
 * O casco de toda tela: limita a largura e dá o ritmo vertical.
 *
 * NÃO TEM PADDING. O respiro lateral é a régua do casco do app
 * (`p-4 md:p-6`, em `src/app/(app)/layout.tsx`), que casa ao pixel com o
 * `px-4 md:px-6` do cabeçalho — isso já estava certo no WAP e esta fase não
 * toca nisso. Se o padding morasse aqui, ele se somaria ao de lá e as duas
 * bordas divergiriam.
 *
 * `gap-6` (24px) é a distância ENTRE blocos, e é o ritmo padrão do produto
 * (decisão do Johnny, 30/08/2026). Todo padding INTERNO de bloco é menor ou
 * igual a isso — a regra do interno ≤ externo, que é o que faz um grupo parecer
 * um grupo: o `--card-spacing` do `Card` é 16px, e 16 ≤ 24.
 *
 * E NÃO CENTRALIZA (decisão do Johnny, 30/08/2026). Com a coluna centrada, a
 * borda esquerda do conteúdo cai num lugar DIFERENTE conforme o teto da variante
 * e a largura da janela — colada na régua quando o conteúdo preenche, centenas
 * de pixels adentro quando ele não preenche. O cabeçalho do app, que é sempre
 * colado na régua, deixava de compartilhar coluna com o título justo nas telas
 * estreitas. Alinhado à esquerda existe UMA linha vertical no produto inteiro.
 */
export function Pagina({
  largura = 'cheia',
  className,
  children,
}: {
  largura?: LarguraDaPagina
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      // O gancho da conferência: é por ele que `consistencia.test.ts` compara a
      // variante que a TELA declara com a que o `loading.tsx` dela desenha, e é
      // o que o script de captura procura para medir a régua horizontal.
      data-casco-da-pagina={largura}
      className={cn('flex w-full min-w-0 flex-col gap-6', LARGURAS[largura], className)}
    >
      {children}
    </div>
  )
}

/**
 * O título da tela — e, junto com o casco de autenticação, o único `<h1>` do
 * produto.
 *
 * A ANATOMIA É IDÊNTICA EM TODA TELA, e ela ABSORVE O `LinkAjuda`: o par
 * `<h1>` + "?" aparecia em cinco arranjos de gap diferentes (`gap-1` 7×,
 * `gap-0.5` 2×, `flex-wrap gap-1` 4×, `gap-3` 1×) e a linha externa alternava
 * `justify-between gap-3` com `gap-4`. Consolidar isso não muda um pixel na
 * maioria das telas — é o caso mais barato do plano inteiro.
 *
 * `items-start` e não `items-center`: quando a descrição tem duas linhas, o
 * centro do bloco de texto desce, e botões centralizados nele ficam pendurados
 * no meio do nada. Alinhados pelo topo, ficam sempre na linha do título.
 */
export function CabecalhoDaPagina({
  titulo,
  descricao,
  acoes,
  ajuda,
  ajudaRotulo,
  aoLado,
  className,
}: {
  /**
   * `ReactNode` e não `string`: é o que preserva o `tabular-nums` do patrimônio
   * no `<h1>` de `/ativos/[id]`, sem que a ficha precise escrever o `<h1>` dela.
   */
  titulo: React.ReactNode
  descricao?: React.ReactNode
  /** Os botões da direita. */
  acoes?: React.ReactNode
  /** Slug da página de ajuda (`src/lib/ajuda/registry.ts`). Vira o "?" do lado. */
  ajuda?: string
  /** Rótulo acessível do "?" — sem ele, o genérico "Ajuda sobre esta tela". */
  ajudaRotulo?: string
  /**
   * O que fica NA LINHA do título e não é o "?": o botão de copiar patrimônio e
   * o crachá de status da ficha do ativo. Sem esta porta, a ficha teria de
   * montar o próprio `<h1>` — que é o que a regra 1 de `consistencia.test.ts`
   * existe para impedir.
   */
  aoLado?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {aoLado}
          {ajuda ? <LinkAjuda pagina={ajuda} rotulo={ajudaRotulo} /> : null}
        </div>
        {descricao ? (
          <div className="text-sm text-muted-foreground">{descricao}</div>
        ) : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </header>
  )
}

/**
 * Uma seção da tela: um degrau abaixo do título da página, SEM moldura.
 *
 * Para agrupar sem cercar. Quando o grupo PRECISA de moldura, o componente é o
 * `Card` — nunca um `rounded-lg border` escrito à mão, que é o que existe em 190
 * lugares do produto e o que a regra 6 do teste de consistência derruba.
 *
 * O `<h2>` usa a MESMA classe do `CardTitle` do kit (`font-heading text-base
 * leading-snug font-medium`) de propósito: título de seção é título de seção,
 * esteja dentro de cartão ou fora dele.
 */
export function SecaoDaPagina({
  titulo,
  descricao,
  acoes,
  className,
  children,
}: {
  titulo?: React.ReactNode
  descricao?: React.ReactNode
  acoes?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-4', className)}>
      {titulo || acoes || descricao ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {titulo ? (
              <h2 className="font-heading text-base leading-snug font-medium">{titulo}</h2>
            ) : null}
            {descricao ? (
              <div className="text-sm text-muted-foreground">{descricao}</div>
            ) : null}
          </div>
          {acoes ? (
            <div className="flex flex-wrap items-center gap-2">{acoes}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

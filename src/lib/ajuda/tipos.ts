// Tipos da documentacao do operador (F20). Modulo PURO e SEM import server-only
// de proposito: e o unico arquivo de `lib/ajuda` que um Client Component pode
// tocar (so para tipos, que somem na compilacao). Ver o TRAP no cabecalho de
// `registry.ts` — o CONTEUDO arrasta PapaParse e nunca pode ir para o cliente.

export type Verbete = { chave: string; rotulo: string; descricao: string }

export type VerbeteMovimentacao = {
  chave: string
  rotulo: string
  efeito: string
  campos: { rotulo: string; obrigatorio: boolean }[]
}

export type LinhaSintoma = {
  sintoma: string
  causa: string
  saida: string[]
}

export type LinhaAtalho = {
  teclas: string
  acao: string
  observacao?: string
}

// Referencia cruzada entre paginas. `slug` e validado por teste: apontar para
// pagina inexistente quebra o build de testes, nunca vira link morto em produção.
export type ReferenciaAjuda = {
  slug: string
  ancora?: string
  texto?: string
}

// `badge` diz ao renderizador qual componente/pilula usar por chave:
//  - 'status'  -> StatusBadge (cor real do estado)
//  - 'tipoLanc'-> pilula de tipo de lancamento de item
//  - 'termo'/'neutro' -> Badge neutro (o rotulo ja carrega o sentido)
export type Bloco =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'nota'; texto: string }
  | { tipo: 'lista'; itens: string[] }
  | { tipo: 'passos'; titulo?: string; itens: string[] }
  | { tipo: 'glossario'; badge: 'status' | 'tipoLanc' | 'termo' | 'neutro'; itens: Verbete[] }
  | { tipo: 'movimentacoes'; itens: VerbeteMovimentacao[] }
  // --- F20 ---
  // Subtitulo COM ancora: alimenta o sumario da pagina e o "?" contextual que
  // aponta para um trecho especifico (/ajuda/<slug>#<id>).
  | { tipo: 'titulo'; id: string; texto: string }
  | { tipo: 'tabela'; colunas: string[]; linhas: string[][]; legenda?: string }
  | { tipo: 'atalhos'; itens: LinhaAtalho[] }
  | { tipo: 'sintomas'; itens: LinhaSintoma[] }
  | { tipo: 'links'; itens: ReferenciaAjuda[] }

// As quatro intencoes do operador (adaptacao de Diataxis — docs/PLANO-AJUDA.md §1).
export type CategoriaAjuda = 'comecar' | 'fazer' | 'consultar' | 'resolver'

// Ids das secoes da ajuda de PAGINA UNICA (F6B→F19). Continuam existindo como
// contrato externo: hashes em favoritos, historico do navegador e a visao de
// compatibilidade que prova que nada do manual antigo se perdeu (`legado.ts`).
export type SecaoLegada =
  | 'conceito'
  | 'status'
  | 'movimentacoes'
  | 'termos'
  | 'itens'
  | 'pendencias'
  | 'relatorios'
  | 'como-fazer'
  | 'admin'
  | 'acesso'

export type PaginaAjuda = {
  /** Endereco: /ajuda/<slug>. Estavel — mudar exige entrada no mapa de compatibilidade. */
  slug: string
  titulo: string
  /** Uma linha: aparece no indice, no card da categoria e no resultado da busca. */
  resumo: string
  categoria: CategoriaAjuda
  /** Sinonimos do dia a dia, so para a busca achar ("consumivel" -> itens). */
  termos?: string[]
  /** Secoes do manual antigo cujo conteudo esta pagina herdou (ver legado.ts). */
  legado?: SecaoLegada[]
  blocos: Bloco[]
}

// Compat com a ajuda de pagina unica: a forma que `conteudo.test.ts` conhece.
export type Secao = { id: string; titulo: string; blocos: Bloco[] }

/**
 * Projecao LEVE do indice, serializada pelo SERVIDOR e recebida por prop pela
 * paleta Ctrl+K (Client Component). Sem o corpo do texto: o que a paleta precisa
 * achar e a PAGINA certa, e o operador continua a busca dentro dela.
 *
 * Mora AQUI, e nao em `indice.ts`, pelo motivo do cabecalho deste arquivo: e o
 * unico modulo de `lib/ajuda` que um Client Component pode tocar. Deixar o tipo
 * no `indice.ts` (so-servidor) funcionava so enquanto o import fosse
 * `import type` — no dia em que alguem precisasse de um valor junto e tirasse o
 * `type`, o bundle de toda tela do app levaria as 33 paginas e o PapaParse.
 */
export type EntradaPaleta = {
  slug: string
  titulo: string
  categoria: CategoriaAjuda
  /** Titulo + resumo + sinonimos, ja normalizado — o cliente so compara. */
  chave: string
}

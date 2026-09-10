// O FUNIL DE FALHA DO SERVIDOR — a metade PURA (F55 · Frente A).
//
// POR QUE SÃO DOIS ARQUIVOS. `src/lib/observabilidade.ts` é a porta que o
// aplicativo importa, e ela carrega o `import 'server-only'` que a ficha pede.
// Só que `server-only` LANÇA quando importado fora da condição de export
// `react-server` — e o `vitest.config.mts` não a declara —, então um teste que
// importasse a porta morreria antes da primeira asserção (medido em
// 10/09/2026). A redação de segredo e de dado pessoal é justamente o que mais
// precisa de teste, e prova por sabotagem não se faz em módulo inimportável.
// O precedente da casa é exatamente este: `src/lib/validators/dev-integridade.ts`
// nasceu para tirar a junção pura de dentro de `queries/dev.ts` pelo mesmo motivo,
// e o cabeçalho de lá diz isso com todas as letras.
//
// POR QUE ELE EXISTE
// ------------------
// Até 10/09/2026 uma falha do lado do servidor virava um `console.error` solto,
// em 76 lugares, cada um no formato que quem escreveu escolheu: alguns passavam
// o erro cru (e o `@supabase/supabase-js` imprime `details`, que carrega valor de
// linha — `Key (patrimonio)=(…) already exists`), outros passavam só a mensagem,
// e seis blocos `} catch {` em Server Actions não passavam nada. Um log assim não
// se procura, não se conta e não se confia.
//
// Daqui para a frente TODA falha de servidor sai por aqui, numa LINHA JSON só,
// com o mesmo formato — e as duas travas de `observabilidade-fonte.test.ts`
// impedem o retorno das duas formas antigas.
//
// O QUE ESTE MÓDULO PROMETE
// -------------------------
//  1. UMA linha por falha, JSON válido, com `evt: 'falha'` para se achar no log.
//  2. `empresa` SEMPRE presente, hoje sempre `null`. É o campo reservado do
//     multiempresa (PLANO-MULTIEMPRESA §5 → F55): quando a F62 der raiz ao
//     tenant, o valor entra aqui sem mudar o formato de nada que já foi gravado.
//  3. REDAÇÃO por NOME de chave E por VALOR — inclusive dentro da mensagem do
//     erro. `raise` de plpgsql com `%` carrega valor (a `0090` põe o patrimônio
//     na frase), e `lib/auditoria-registro.ts` loga `alvo`, que o próprio tipo
//     descreve como "e-mail do convidado": NENHUM nome de chave casa uma regex
//     de segredo ali, e o valor é pessoal do mesmo jeito.
//  4. **NUNCA LANÇA.** Um log que explode dentro de um `catch` transforma um erro
//     em dois — e o segundo aparece na tela do operador. Todo caminho daqui é
//     defendido, inclusive contra `ctx` circular, `ctx` gigante, erro que não é
//     `Error` e `JSON.stringify` que falha.
//  5. NENHUM I/O próprio. `idOperador(supabase)` exige um client
//     (`lib/auth/acesso.ts:75`); quem chama e já sabe quem é, passa em `operador`.
//     Quem não sabe, não passa — e "sem usuário" é estado normal, não defeito:
//     as leituras de `lib/queries` também servem o visualizador por senha, que
//     não tem `auth.uid()`.
//
// O QUE ELE NÃO É. Não é agregador, não é Sentry, não é métrica. É formato. O
// que transforma este log em AVISO é a sonda da Frente B e o alarme da Frente D
// — ver `docs/RUNBOOK-ALARME.md`.

/** O contexto que quem chama achou útil. Passa pela redação inteiro. */
export type ContextoFalha = Record<string, unknown>

export type EntradaFalha = {
  /**
   * De onde veio, em kebab-case pontuado — o que era o prefixo `[x]` das 76
   * chamadas antigas. Ex.: `'import.backup-acervo'`, `'admin.usuarios'`.
   */
  escopo: string
  /** O erro, como veio. Pode ser `Error`, erro do PostgREST, string ou qualquer coisa. */
  erro: unknown
  /** Contexto legível. Nunca segredo — e, se vier, é redigido. */
  ctx?: ContextoFalha
  /** Quem estava logado, SE quem chama já souber. `null` é estado normal. */
  operador?: string | null
}

// ---------------------------------------------------------------------------
// Redação
// ---------------------------------------------------------------------------

/**
 * Nome de chave que nunca tem valor publicável. É a regex da ficha, ampliada
 * com o vocabulário em português (`senha`, `chave`) e com o que viaja em header
 * (`authorization`, `cookie`, `bearer`).
 *
 * ⚠ `key` NÃO usa `\b`, e a sabotagem é que descobriu. `\bkey\b` não casa
 * `SUPABASE_SERVICE_ROLE_KEY`: `_` é caractere de palavra, então não há
 * fronteira antes do `KEY` — e a chave de serviço, o valor mais perigoso do
 * repositório, saía inteira sob o nome dela mesma. A forma abaixo separa por
 * qualquer coisa que não seja letra (o `_` inclusive) e continua não casando
 * `monkey`/`keyboard`.
 */
const CHAVE_SENSIVEL = new RegExp(
  [
    'senha',
    'password',
    'token',
    'secret',
    'segredo',
    'service_role',
    'api[-_]?key',
    // `key` sem `\b` — ver o ⚠ acima.
    '(?:^|[^a-z])key(?:[^a-z]|$)',
    'chave',
    'hash',
    'cpf',
    'authorization',
    'cookie',
    'bearer',
    // ⚠ AS QUATRO ABAIXO ENTRARAM PELA REVISÃO ADVERSARIAL (10/09/2026), e a
    // primeira é a que dói: a lista tinha a palavra INGLESA `credential` e não a
    // PORTUGUESA — sendo que o vocabulário desta casa é português
    // (`actions/importar.ts`, `escopo/pertencimento.ts`, `supabase/admin.ts` todos
    // dizem "credencial"). Um `ctx: { credencialDeServico: … }` saía inteiro.
    // O RADICAL, nao a palavra: `credencial` nao casa `credenciais` (o plural
    // troca o `l` por `is`), e foi assim que o caso do plural nasceu vermelho.
    'credencia',
    'credential',
    // `auth`, `pwd` e `jwt` como PALAVRA — separadas por qualquer coisa que não
    // seja letra, o `_` inclusive. `autor` e `author` não casam (a letra seguinte
    // é `o`); `authenticated` casa, e redigir um booleano é custo aceitável.
    '(?:^|[^a-z])auth(?:[^a-z]|$)',
    '(?:^|[^a-z])pwd(?:[^a-z]|$)',
    '(?:^|[^a-z])jwt(?:[^a-z]|$)',
  ].join('|'),
  'i',
)

/**
 * A chave, normalizada ANTES de passar pela regex de sensibilidade.
 *
 * ⚠ SEM ISTO, `jwtClaims` E `authToken` VAZAM. As formas de palavra acima
 * pedem que o trecho termine em algo que não seja letra — e numa chave
 * camelCase o que vem depois é uma MAIÚSCULA. Como a regex é
 * case-insensitive, `[^a-z]` também não casa `C`: a fronteira nunca fecha.
 * Separar o camelCase resolve os dois casos de uma vez, e deixa a regex
 * lidando só com `_`, `-` e `.` — que é o que ela sabe fazer.
 *
 * Achado da revisão adversarial de 10/09/2026, junto com `credencial`.
 */
function normalizarChave(chave: string): string {
  return chave.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/** O que se troca por um rótulo, em ORDEM (o mais específico primeiro). */
const PADROES_DE_VALOR: { re: RegExp; por: string }[] = [
  // JWT (a chave anon e o access token têm esta forma). Vem PRIMEIRO: o corpo
  // de um JWT tem corridas de dígitos que a regra de CPF apagaria pela metade,
  // deixando um pedaço legível.
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, por: '[token]' },
  // Chaves novas da Supabase (`sb_publishable_…`, `sb_secret_…`).
  { re: /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{8,}/g, por: '[token]' },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, por: '[e-mail]' },
  // ⚠ CPF COM PONTUAÇÃO PARCIAL, e não só a canônica — achado da revisão
  // adversarial (10/09/2026). `123456789-09`, `123.456.789.09` e `123.456789-09`
  // não batiam na forma exata NEM no fallback de onze dígitos corridos (a
  // pontuação quebra a corrida), e saíam inteiros. Aqui cada separador é
  // opcional e independente, o que cobre as dezesseis combinações.
  { re: /\b\d{3}[.\-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?\d{2}\b/g, por: '[cpf]' },
  { re: /\(\d{2}\)\s?\d{4,5}-?\d{4}/g, por: '[telefone]' },
  { re: /\b\d{4,5}-\d{4}\b/g, por: '[telefone]' },
  // Onze dígitos seguidos: CPF ou celular com DDD, sem formatação nenhuma.
  { re: /\b\d{11}\b/g, por: '[cpf-ou-telefone]' },
]

/** Teto de uma string que sai do funil. Mensagem de erro do Postgres é longa. */
const MAX_TEXTO = 500

/**
 * A redação por VALOR. Vale para toda string que sai daqui — chave, valor,
 * mensagem do erro, nome do erro.
 *
 * ⚠ PATRIMÔNIO NÃO É REDIGIDO, e isso é decisão. Ele não é dado pessoal, é o
 * identificador que faz um log de erro ser acionável ("qual ativo?"), e o log do
 * servidor é justamente o lugar onde ele pode estar. O que NUNCA carrega
 * amostra é o alarme: `checagens_integridade_resumo()` devolve só
 * `(chave, total)`, e o corpo da issue não tem por onde receber um patrimônio.
 */
export function redigirTexto(texto: string): string {
  let saida = texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO)}…[cortado]` : texto
  for (const { re, por } of PADROES_DE_VALOR) {
    re.lastIndex = 0
    saida = saida.replace(re, por)
  }
  return saida
}

const MAX_PROFUNDIDADE = 4
const MAX_ITENS = 20
const MAX_CHAVES = 30

function sanear(valor: unknown, profundidade: number, vistos: WeakSet<object>): unknown {
  if (valor === null || valor === undefined) return valor ?? null
  const tipo = typeof valor
  if (typeof valor === 'string') return redigirTexto(valor)
  if (tipo === 'number') return Number.isFinite(valor as number) ? valor : String(valor)
  if (tipo === 'boolean') return valor
  if (tipo === 'bigint') return String(valor)
  if (tipo === 'function' || tipo === 'symbol') return `[${tipo}]`

  if (valor instanceof Error) {
    return { nome: valor.name, mensagem: redigirTexto(valor.message ?? '') }
  }
  if (valor instanceof Date) return valor.toISOString()

  if (profundidade >= MAX_PROFUNDIDADE) return '[profundo]'
  const objeto = valor as object
  if (vistos.has(objeto)) return '[circular]'
  vistos.add(objeto)

  if (Array.isArray(valor)) {
    const corte = valor.slice(0, MAX_ITENS).map((v) => sanear(v, profundidade + 1, vistos))
    if (valor.length > MAX_ITENS) corte.push(`[+${valor.length - MAX_ITENS} itens]`)
    return corte
  }

  const saida: Record<string, unknown> = {}
  let n = 0
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (n >= MAX_CHAVES) {
      saida['[cortado]'] = true
      break
    }
    n++
    saida[redigirTexto(chave)] = CHAVE_SENSIVEL.test(normalizarChave(chave))
      ? '[redigido]'
      : sanear(v, profundidade + 1, vistos)
  }
  return saida
}

/** O `ctx` já redigido — a mesma função que o funil usa, exposta para o teste. */
export function sanearContexto(ctx: unknown): unknown {
  return sanear(ctx, 0, new WeakSet())
}

// ---------------------------------------------------------------------------
// O erro
// ---------------------------------------------------------------------------

export type ErroEstruturado = {
  nome: string
  codigo: string | null
  mensagem: string
}

/**
 * O erro em três campos, sempre os mesmos.
 *
 * ⚠ NUNCA `details` NEM `hint` do PostgREST. É o precedente escrito da casa
 * (`descreverErro` de `scripts/smoke/smoke-prod.mjs:120-128`): `details` carrega
 * valor de linha — `Key (patrimonio)=(WAP…) already exists` —, e o que diagnostica
 * é o CÓDIGO (`23505`), que já está aqui.
 */
export function erroEstruturado(erro: unknown): ErroEstruturado {
  if (erro instanceof Error) {
    const codigo = (erro as { code?: unknown }).code
    return {
      nome: erro.name || 'Error',
      codigo: codigo === undefined || codigo === null ? null : redigirTexto(String(codigo)),
      mensagem: redigirTexto(erro.message ?? ''),
    }
  }
  if (typeof erro === 'string') {
    return { nome: 'erro', codigo: null, mensagem: redigirTexto(erro) }
  }
  if (erro && typeof erro === 'object') {
    const o = erro as { name?: unknown; code?: unknown; message?: unknown }
    const temMensagem = typeof o.message === 'string'
    return {
      nome: typeof o.name === 'string' && o.name ? redigirTexto(o.name) : 'erro',
      codigo: o.code === undefined || o.code === null ? null : redigirTexto(String(o.code)),
      mensagem: temMensagem ? redigirTexto(o.message as string) : '[sem mensagem]',
    }
  }
  return { nome: 'erro', codigo: null, mensagem: redigirTexto(String(erro)) }
}

// ---------------------------------------------------------------------------
// A linha
// ---------------------------------------------------------------------------

/** Teto da linha inteira. Acima disso o `ctx` é descartado, nunca a falha. */
const MAX_LINHA = 8000

/**
 * A linha JSON, montada. Função PURA — quem escreve no console é
 * `registrarFalha`. Separadas de propósito: o teste da forma não precisa
 * capturar o console, e a redação se prova sem efeito colateral.
 */
export function linhaDeFalha(entrada: EntradaFalha): string {
  const registro = {
    evt: 'falha' as const,
    escopo: redigirTexto(String(entrada.escopo || 'sem-escopo')),
    // O campo reservado do multiempresa. SEMPRE presente, hoje sempre null.
    empresa: null as string | null,
    operador: entrada.operador ? redigirTexto(entrada.operador) : null,
    erro: erroEstruturado(entrada.erro),
    ctx: entrada.ctx === undefined ? undefined : sanearContexto(entrada.ctx),
  }
  let linha = JSON.stringify(registro)
  if (linha.length > MAX_LINHA) {
    linha = JSON.stringify({ ...registro, ctx: '[ctx grande demais]' })
  }
  return linha
}

/**
 * O FUNIL. Uma linha JSON no `console.error` — e nada mais.
 *
 * ⚠ NUNCA LANÇA. Se qualquer coisa aqui dentro falhar (um getter que estoura,
 * um `toJSON` malicioso, um `Proxy`), sai a linha mínima; se nem ela sair, o
 * funil engole em silêncio. É o único lugar do repositório onde engolir é a
 * resposta certa: quem chamou já está tratando uma falha, e uma segunda
 * exceção viraria erro na tela do operador.
 */
export function registrarFalha(entrada: EntradaFalha): void {
  let linha: string
  try {
    linha = linhaDeFalha(entrada)
  } catch {
    try {
      linha = JSON.stringify({
        evt: 'falha',
        escopo: 'observabilidade.funil',
        empresa: null,
        operador: null,
        erro: { nome: 'erro', codigo: null, mensagem: 'falha ao montar a linha de falha' },
      })
    } catch {
      return
    }
  }
  try {
    // O ÚNICO console.* de servidor que a trava de observabilidade-fonte.test.ts
    // aceita — este arquivo e a porta observabilidade.ts, e mais nada.
    console.error(linha)
  } catch {
    // console indisponível: não há para onde reportar, e reportar não é a
    // missão de quem chamou.
  }
}

// ---------------------------------------------------------------------------
// O erro de REQUEST (F55 · Frente A · `src/instrumentation.ts`)
// ---------------------------------------------------------------------------

/**
 * O recorte de `request` e de `context` que o `onRequestError` do Next entrega e
 * que este funil aceita. É de propósito que ele NÃO tem `headers` nem `path`:
 * um tipo que não os carrega é uma trava melhor que um comentário pedindo para
 * não os logar.
 *
 * ⚠ `request.path` do Next VEM COM A QUERYSTRING — a doc local diz isso
 * literalmente (`instrumentation.md:103`, *"resource path, e.g. /blog?name=foo"*),
 * e a busca de `/ativos` carrega nome e patrimônio nela. `request.headers` traz
 * o cookie da sessão. Nenhum dos dois entra aqui.
 */
export type ErroDeRequest = {
  /** `context.routePath` — o caminho do ARQUIVO (`/app/ativos/[id]`), nunca a URL. */
  rota: string
  /** `context.routeType` — `render` | `route` | `action` | `proxy`. */
  tipo: string
  /** `context.renderSource`, quando houver. */
  origem?: string | null
  /** `request.method`. */
  metodo: string
  /** O erro, como veio. */
  erro: unknown
}

/**
 * A linha JSON de um erro de request. Função PURA e **sem nenhuma API exclusiva
 * de Node** — `src/instrumentation.ts` vale para os dois runtimes do Next, e
 * `observabilidade-fonte.test.ts` prova a ausência lendo o fonte, em vez de
 * criar uma rota Edge só para a prova.
 */
export function linhaDeErroDeRequest(entrada: ErroDeRequest): string {
  const digest = (entrada.erro as { digest?: unknown } | null | undefined)?.digest
  const registro = {
    evt: 'erro-de-request' as const,
    rota: redigirTexto(String(entrada.rota || 'rota-desconhecida')),
    tipo: redigirTexto(String(entrada.tipo || 'desconhecido')),
    origem: entrada.origem ? redigirTexto(String(entrada.origem)) : null,
    metodo: redigirTexto(String(entrada.metodo || '')),
    digest: digest === undefined || digest === null ? null : redigirTexto(String(digest)),
    // O mesmo campo reservado do multiempresa da `linhaDeFalha`.
    empresa: null as string | null,
    erro: erroEstruturado(entrada.erro),
  }
  return JSON.stringify(registro)
}

/** Escreve a linha de erro de request. NUNCA lança, pelo mesmo motivo do funil. */
export function registrarErroDeRequest(entrada: ErroDeRequest): void {
  let linha: string
  try {
    linha = linhaDeErroDeRequest(entrada)
  } catch {
    return
  }
  try {
    // O ÚNICO console.* de servidor que a trava de observabilidade-fonte.test.ts
    // aceita — este arquivo e a porta observabilidade.ts, e mais nada.
    console.error(linha)
  } catch {
    // sem console, não há para onde reportar.
  }
}

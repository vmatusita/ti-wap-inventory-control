import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database, Json } from '@/lib/types/database'
import { chamarRpc } from '@/lib/supabase/rpc'

// O CLIENT DA PORTA PÚBLICA (F68 · decisão 12) — a ÚNICA via pela qual o visualizador por senha fala com o banco.
//
// É o `supabase-js` puro, com a URL e a chave `anon` (pública por desenho) e SEM sessão: não lê cookie, não guarda token,
// não renova nada. A razão é de correção, não de estilo: se a página pública falasse pelo client de SESSÃO
// (`supabase/server.ts`), bastaria um operador estar logado no mesmo navegador para o papel da chamada virar
// `authenticated` — e as duas funções da porta, executáveis SÓ por `anon`, recusariam. Um bug que só apareceria para quem
// tem conta.
//
// Este módulo só chama as DUAS funções da porta (`relatorio_publico_abrir`, `relatorio_publico_dados` — as únicas de
// `public` executáveis por `anon`, migration 0212), pela porta única `chamarRpc`, e devolve a resposta pelo Zod (a
// fronteira tipada da F58). A trava: `queries/relatorios/fronteira-viewer.test.ts`.

function clientePublico() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

// ---------------------------------------------------------------------------
// relatorio_publico_abrir
// ---------------------------------------------------------------------------

const RESPOSTA_ABRIR = z.union([
  z.strictObject({ ok: z.literal(true), sessao: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.strictObject({ ok: z.literal(false) }),
  z.strictObject({ ok: z.literal(false), recusa: z.literal('tentativas') }),
])

/**
 * `aberta` (o token da sessão, devolvido UMA vez), `recusada` (as cinco recusas — a mesma resposta), `tentativas` (o
 * contador estourou) ou `falha` (o banco não respondeu, ou respondeu fora da forma — recusa: R-ACC-95).
 */
export type ResultadoAbrir =
  | { tipo: 'aberta'; sessao: string }
  | { tipo: 'recusada' }
  | { tipo: 'tentativas' }
  | { tipo: 'falha'; erro: unknown }

export async function abrirPorta(slug: string, senha: string, origem: string): Promise<ResultadoAbrir> {
  const { data, error } = await chamarRpc(clientePublico(), 'relatorio_publico_abrir', {
    p_slug: slug,
    p_senha: senha,
    p_origem: origem,
  })
  if (error) return { tipo: 'falha', erro: error }
  const lido = RESPOSTA_ABRIR.safeParse(data)
  if (!lido.success) return { tipo: 'falha', erro: new Error('relatorio_publico_abrir: resposta fora da forma') }
  if (lido.data.ok) return { tipo: 'aberta', sessao: lido.data.sessao }
  return 'recusa' in lido.data ? { tipo: 'tentativas' } : { tipo: 'recusada' }
}

// ---------------------------------------------------------------------------
// relatorio_publico_dados
// ---------------------------------------------------------------------------

const RECUSA = z.strictObject({ ok: z.literal(false), recusa: z.enum(['sessao', 'empresa', 'gerado']) })
const EMPRESA = z.strictObject({ slug: z.string(), nome: z.string() })

const RESPOSTA_PORTA = z.union([z.strictObject({ ok: z.literal(true), empresa: EMPRESA }), RECUSA])
const RESPOSTA_SESSAO = z.union([
  z.strictObject({ ok: z.literal(true), sessao: z.strictObject({ empresa: EMPRESA, rotulo: z.string() }) }),
  RECUSA,
])
const LINHA_GERADO = z.strictObject({
  id: z.string(),
  periodo_de: z.string(),
  periodo_ate: z.string(),
  versao: z.number(),
  gerado_em: z.string(),
  filialNome: z.string(),
  filialSlug: z.string().nullable(),
  temObservacao: z.boolean(),
  superada: z.boolean(),
})
const RESPOSTA_GERADOS = z.union([
  z.strictObject({
    ok: z.literal(true),
    total: z.number(),
    pagina: z.number(),
    porPagina: z.number(),
    linhas: z.array(LINHA_GERADO),
    filiais: z.array(z.strictObject({ slug: z.string(), nome: z.string() })),
  }),
  RECUSA,
])
const VIZINHO = z.strictObject({ id: z.string(), periodo_de: z.string(), periodo_ate: z.string() }).nullable()
const RESPOSTA_GERADO = z.union([
  z.strictObject({
    ok: z.literal(true),
    gerado: z.strictObject({
      id: z.string(),
      periodo_de: z.string(),
      periodo_ate: z.string(),
      versao: z.number(),
      gerado_em: z.string(),
      filialNome: z.string(),
      filialSlug: z.string().nullable(),
      versaoMaisNova: z.strictObject({ id: z.string(), versao: z.number() }).nullable(),
      anterior: VIZINHO,
      proximo: VIZINHO,
      dados: z.unknown(),
    }),
    tipos: z.array(z.strictObject({ slug: z.string(), rotulo: z.string() })),
  }),
  RECUSA,
])
const RESPOSTA_ENCERRAR = z.union([z.strictObject({ ok: z.literal(true) }), RECUSA])

const PEDIDOS = {
  porta: RESPOSTA_PORTA,
  sessao: RESPOSTA_SESSAO,
  gerados: RESPOSTA_GERADOS,
  gerado: RESPOSTA_GERADO,
  encerrar: RESPOSTA_ENCERRAR,
} as const

export type PedidoPorta = keyof typeof PEDIDOS
export type RespostaPorta<P extends PedidoPorta> = z.output<(typeof PEDIDOS)[P]>
export type LinhaGeradoPorta = z.output<typeof LINHA_GERADO>

/**
 * Pede à porta. `sessao` é o token do cookie (null no pedido `porta`, o único sem sessão). Erro de banco ou resposta
 * fora da forma LANÇA — a página cai no `error.tsx`, nunca renderiza meia resposta.
 */
export async function pedirPorta<P extends PedidoPorta>(
  pedido: P,
  slug: string,
  sessao: string | null,
  args: { [chave: string]: Json } | null = null,
): Promise<RespostaPorta<P>> {
  const { data, error } = await chamarRpc(clientePublico(), 'relatorio_publico_dados', {
    p_sessao: sessao ?? '',
    p_slug: slug,
    p_pedido: pedido,
    p_args: args ?? {},
  })
  if (error) throw new Error(`relatorio_publico_dados (${pedido}): ${error.message}`)
  const lido = PEDIDOS[pedido].safeParse(data)
  if (!lido.success) throw new Error(`relatorio_publico_dados (${pedido}): resposta fora da forma`)
  return lido.data as RespostaPorta<P>
}

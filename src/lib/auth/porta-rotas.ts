import { ABA_RELATORIO_CONSOLIDADO } from '@/lib/auth/papeis'

// AS ROTAS DA PORTA PÚBLICA (F68) — módulo-FOLHA, isomórfico: sem `server-only`, sem node:crypto, sem Supabase. Ele é
// importado pelo proxy (que roda antes de tudo, sem banco), pelas páginas da árvore `/r/**`, pela Server Action da
// entrada e pelo layout do operador. Funções PURAS, testadas com entradas hostis em `porta-rotas.test.ts`.
//
// A porta mora em `/r/<slug-da-empresa>/relatorios/…` (decisão 10 do PLAN-F68). O slug da rota NÃO decide nada: a
// empresa de quem entrou sai da SESSÃO, dentro do banco (`relatorio_publico_dados`); o slug só é conferido contra ela (a
// diagonal: divergiu, 404).

/**
 * O slug da empresa legada (a WAP) — ESPELHO do INSERT da migration `0152` (`values (public.empresa_legada(), 'wap', …)`),
 * com trava em `porta-rotas.test.ts` (o molde de `EMPRESA_LEGADA_ID`). É o destino dos 308 de `/relatorios/**`: todo link
 * que existe hoje é da WAP.
 */
export const SLUG_EMPRESA_LEGADA = 'wap'

/** O cookie da sessão da porta: o token opaco CRU (no banco só o sha-256 dele), `path` da empresa, 24 h. */
export const PORTA_COOKIE = 'wap_porta'
export const PORTA_MAX_AGE_SEG = 24 * 60 * 60

// As mensagens: UMA para as cinco recusas (sem senha, senha errada, revogada, empresa inexistente, senha de outra
// empresa) — a mesma resposta do banco vira a mesma frase; uma para o contador; uma para a falha (R-ACC-95).
export const MSG_SENHA_INVALIDA = 'Senha inválida.'
export const MSG_MUITAS_TENTATIVAS = 'Muitas tentativas. Aguarde um instante e tente de novo.'
export const MSG_FALHA_AO_CONFERIR_SENHA = 'Não foi possível conferir a senha agora. Tente de novo em instantes.'


/** O formato do slug — o MESMO CHECK de `empresas_slug_formato` (0152). Fora dele, nem se pergunta ao banco. */
const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugValido(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length >= 2 && slug.length <= 40 && FORMATO_SLUG.test(slug)
}

/** `/r/<slug>/relatorios` + `/<resto>` quando houver. */
export function caminhoDaPorta(slug: string, resto = ''): string {
  return `/r/${slug}/relatorios${resto ? `/${resto.replace(/^\/+/, '')}` : ''}`
}

/** O `path` do cookie: a empresa inteira (`/r/<slug>`) — o cookie de A nunca vai num request de B. */
export function caminhoDoCookie(slug: string): string {
  return `/r/${slug}`
}

/** A entrada da empresa, com o destino guardado em `next` (quando houver). */
export function entradaDaPorta(slug: string, destino?: string | null): string {
  const base = caminhoDaPorta(slug, 'acesso')
  return destino ? `${base}?next=${encodeURIComponent(destino)}` : base
}

const destinoInseguro = (s: string) =>
  s.includes('..') || s.includes('\\') || s.includes('//') || /[\r\n\t]/.test(s)

/**
 * O destino pós-entrada, validado DENTRO DA MESMA EMPRESA: só `/r/<slug>/relatorios/…` desta empresa, nunca a própria
 * entrada (loop), nunca URL absoluta, protocolo-relativo, barra invertida, travessia ou quebra de linha. Fora disso, os
 * relatórios gerados da empresa.
 */
export function destinoNaPorta(slug: string, next: unknown): string {
  const padrao = caminhoDaPorta(slug, 'gerados')
  if (typeof next !== 'string' || next.length === 0 || next.length > 500) return padrao
  const prefixo = `${caminhoDaPorta(slug)}/`
  if (!next.startsWith(prefixo)) return padrao
  if (next.startsWith(caminhoDaPorta(slug, 'acesso'))) return padrao
  if (destinoInseguro(next)) return padrao
  return next
}

/**
 * A tradução de um endereço ANTIGO de relatório (`/relatorios/…`) para a porta da legada — o `next` do 308. O ao vivo
 * antigo (`/relatorios/<filial>`) vira o endereço do ao vivo na porta (que mostra o aviso até a F68B); os gerados viram os
 * gerados. `/relatorios/acesso?next=X` traduz o X. Nada traduzível → `null` (a entrada sem destino).
 */
export function traduzirDestinoLegado(pathname: string, search: string): string | null {
  if (destinoInseguro(pathname)) return null
  if (pathname === '/relatorios/acesso') {
    const next = new URLSearchParams(search).get('next')
    if (!next) return null
    const q = next.indexOf('?')
    return q < 0 ? traduzirDestinoLegado(next, '') : traduzirDestinoLegado(next.slice(0, q), next.slice(q))
  }
  if (!pathname.startsWith('/relatorios/')) return null
  const resto = pathname.slice('/relatorios/'.length)
  if (!resto || resto.startsWith('acesso')) return null
  return `${caminhoDaPorta(SLUG_EMPRESA_LEGADA, resto)}${search}`
}

/**
 * O par da porta de `recusarFilialInexistente` (unidades/pertinencia.ts): alguma filial do filtro (`?filial=a,b`) NÃO é
 * da empresa da sessão? A lista vem da própria porta (`relatorio_publico_dados`, pedido `gerados`), nunca de uma leitura
 * de `filiais` pelo client — a porta não tem outra. O Consolidado (`geral`) é o valor especial do filtro, não uma filial.
 * `true` → a página responde 404.
 */
export function filialForaDaPorta(filtro: readonly string[], filiais: readonly { slug: string }[]): boolean {
  return filtro.some((s) => s !== ABA_RELATORIO_CONSOLIDADO && !filiais.some((f) => f.slug === s))
}

/** O destino do 308 de `/relatorios/**` sem operador: a entrada da legada, com o `next` traduzido. */
export function portaDaLegada(pathname: string, search: string): string {
  return entradaDaPorta(SLUG_EMPRESA_LEGADA, traduzirDestinoLegado(pathname, search))
}

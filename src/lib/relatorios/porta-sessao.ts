import 'server-only'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { pedirPorta } from '@/lib/supabase/publico'
import { PORTA_COOKIE, entradaDaPorta, slugValido } from '@/lib/auth/porta-rotas'

// A SESSÃO DA PORTA PÚBLICA, conferida a cada request (F68) — por quem? Pelo BANCO: `relatorio_publico_dados` (pedido
// `sessao`) acha a sessão pelo sha-256 do token do cookie e confere, por dentro, que ela não venceu, não foi encerrada e
// que a senha continua ativa — revogar mata no request seguinte. Aqui só se traduz a resposta:
//   · sem cookie, ou a sessão recusada ("sessao") → a entrada DA MESMA empresa, guardando o destino em `next`;
//   · a DIAGONAL (o slug da rota não é o da empresa da sessão: "empresa") → 404, nunca redirect (a ficha F68);
//   · slug fora do formato → 404, sem perguntar ao banco.
// O layout de `(sessao)` e cada página chamam: layout e página renderizam em paralelo, e cada uma decide por si.

export type SessaoDaPorta = { token: string; empresa: { slug: string; nome: string }; rotulo: string }

export async function sessaoDaPorta(slug: string): Promise<SessaoDaPorta> {
  if (!slugValido(slug)) notFound()
  const h = await headers()
  const destino = `${h.get('x-wap-pathname') ?? ''}${h.get('x-wap-search') ?? ''}`
  const token = (await cookies()).get(PORTA_COOKIE)?.value
  if (!token) redirect(entradaDaPorta(slug, destino || null))
  const r = await pedirPorta('sessao', slug, token)
  if (!r.ok) {
    if (r.recusa === 'empresa') notFound()
    redirect(entradaDaPorta(slug, destino || null))
  }
  return { token, empresa: r.sessao.empresa, rotulo: r.sessao.rotulo }
}

/** Uma recusa de pedido DEPOIS da sessão conferida (a sessão morreu entre o layout e a página, ou a diagonal). */
export function tratarRecusa(slug: string, recusa: 'sessao' | 'empresa' | 'gerado'): never {
  if (recusa === 'sessao') redirect(entradaDaPorta(slug))
  notFound()
}

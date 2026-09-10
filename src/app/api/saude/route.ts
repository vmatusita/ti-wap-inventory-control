import { createClient } from '@supabase/supabase-js'
import { VERSOES } from '@/lib/versoes/registry'
import { registrarFalha } from '@/lib/observabilidade'

// A SONDA SEM SESSÃO (F55 · Frente B).
//
// É o PRIMEIRO route handler deste projeto — não havia `src/app/api/` até aqui.
// Ele responde a quem não tem sessão nenhuma, e é isso que o torna uma sonda:
// um monitor externo (o `saude.yml`, de 6 em 6 horas) pergunta "você está de
// pé?" sem precisar de conta, de senha e de segredo.
//
//   200 → { ok: true,  versao, commit, banco: 'ok',    ms }
//   503 → { ok: false, versao, commit, banco: 'falha', ms }
//
// O QUE ELA NÃO DEVOLVE, e por quê:
//  · estado de migração — é informação de SCHEMA numa rota pública (a ficha
//    proíbe, e com razão: dizer "estou na 0137" é dizer o que existe no banco);
//  · nome de tabela, stack, variável de ambiente, mensagem de erro do banco.
//    Quem falha diz `banco: 'falha'` e nada mais; o DIAGNÓSTICO vai para o log
//    do servidor pelo funil, que é onde ele pode ser detalhado com segurança.
//
// ⚠ A IDA AO BANCO É REAL, e três armadilhas foram evitadas de propósito:
//
//  1. **Nenhuma RPC nova para `anon`.** `supabase/tests/catalogo_secdef.sql`
//     afirma, na asserção 4, que NENHUMA `security definer` é executável por
//     `anon`, e na 6a que NENHUMA invoker é — a lista de exceções está VAZIA
//     desde a `0129`. Um "`select 1` por RPC" derrubaria as duas. Aqui não há
//     função nova: só a leitura de uma tabela que a chave pública já alcança
//     hoje, exatamente como alcançava ontem.
//
//  2. **Nenhum dado sai.** `public.filiais` tem RLS ligada e as quatro policies
//     dela são `{authenticated}` (medido em 10/09/2026) — `anon` recebe uma
//     lista VAZIA. A resposta prova que o Postgres respondeu, não o que ele tem.
//
//  3. **Sem `head: true`.** Medido na produção em 22/07/2026 e escrito em
//     `scripts/smoke/smoke-prod.mjs:334-341`: `count: 'exact', head: true` numa
//     relação INEXISTENTE devolve HTTP 204, `count` null e `error` NULL. Uma
//     sonda feita assim diria "banco ok" com a tabela sumida — falso verde
//     exatamente no cenário que ela existe para pegar. O `select` com `limit(1)`
//     devolve o erro `PGRST205`/`42P01` de verdade.
//
// ⚠ SEM SERVICE ROLE. `superficie-admin.test.ts` exige guarda de cargo em todo
// uso do client administrativo, e uma rota sem sessão não tem cargo para exigir.
// A chave aqui é a PÚBLICA, a mesma do navegador.
//
// ⚠ O PROXY NÃO INTERCEPTA. `src/proxy.ts` exclui `api/saude` do `matcher` — sem
// isso a resposta seria um 307 para `/login` e a sonda mediria o redirect, não a
// aplicação. A Parte A do smoke prova as duas metades: que esta rota responde
// 200 e que as OUTRAS continuam desviando.

// Rota de saúde nunca é cacheada. No Next 16 um `GET` de route handler já nasce
// dinâmico (`03-file-conventions/route.md:669` — o default mudou de estático
// para dinâmico na 15.0.0-RC), mas a declaração fica escrita: uma sonda que
// respondesse de um cache mediria o passado.
export const dynamic = 'force-dynamic'

/** Teto da ida ao banco. Acima disso a sonda responde `falha`, não pendura. */
const TIMEOUT_MS = 8000

export async function GET(): Promise<Response> {
  const inicio = Date.now()
  const versao = VERSOES[0]?.versao ?? 'indisponível'
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'indisponível'

  let banco: 'ok' | 'falha' = 'falha'
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !chave) throw new Error('configuração da base ausente')

    const db = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await db
      .from('filiais')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS))
    if (error) throw error
    banco = 'ok'
  } catch (erro) {
    // O diagnóstico vai para o log do servidor — nunca para o corpo da resposta.
    registrarFalha({ escopo: 'saude.banco', erro })
  }

  const corpo = { ok: banco === 'ok', versao, commit, banco, ms: Date.now() - inicio }
  return Response.json(corpo, {
    status: banco === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}

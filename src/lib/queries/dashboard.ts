import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { chamarRpc } from '@/lib/supabase/rpc'
import { linhasDe } from '@/lib/supabase/linhas'
import { filiaisDoConsolidado } from '@/lib/queries/relatorios/recorte-filiais'
import { kpisDeContagens } from '@/lib/queries/relatorios/estoque'
import { LEITURA_REL_CONTAGEM_STATUS } from '@/lib/queries/formas/dashboard'
import type { KpisRelatorio } from '@/lib/relatorios/tipos'

// As leituras PRÓPRIAS do dashboard (`app/(app)/page.tsx`) — F60 · Frente B.
//
// ⚠ ESTE MÓDULO NÃO ACEITA CLIENT, E ISSO É A FRONTEIRA, NÃO ESTILO. `fronteira-viewer.test.ts`
// deriva a superfície do visualizador por senha pela ASSINATURA: quem aceita um client resolvido
// pode receber o client administrativo (service_role, sem RLS). Os KPIs moravam em
// `queries/relatorios/estoque.ts` (`getKpis(client, …)`), que está nessa superfície — uma RPC nova
// chamada lá entraria na lista branca do visualizador e levaria a catraca de RPCs de 7 para 8, para
// uma tela que ele nunca abre. Aqui a função abre o client da SESSÃO por conta própria: a RPC só
// roda com a identidade do operador, sob a RLS de `ativos`, e a catraca fica intacta (PLAN-F60 §1.2
// (n) e §6.5). Uma função que precise do client resolvido NÃO mora aqui.

/**
 * Os oito números dos tiles do dashboard — o acervo CONSOLIDADO de todas as filiais, hoje.
 *
 * Uma ida ao banco (`rel_contagem_status_filiais`, 0141) no lugar de ler `ativos` inteira (duas
 * páginas e 1.622 linhas em 16/09/2026) para contar em memória. O consolidado é a lista de TODAS as
 * filiais, inclusive as desativadas (`filiaisDoConsolidado`) — o mesmo conjunto que a leitura antiga,
 * sem filtro de filial, contava. As baixas terminais saem em `kpisDeContagens`, a mesma regra de
 * `kpisDeEstado`.
 *
 * Falha LANÇA, como `getKpis` lançava (erro de banco pelo `if (error)`, forma errada por `linhasDe`):
 * um tile com 0 no lugar de "não consegui ler" afirmaria um acervo vazio.
 */
export async function getKpisDoDashboard(): Promise<KpisRelatorio> {
  const client = await createClient()
  const filiais = await filiaisDoConsolidado(client)
  const { data, error } = await chamarRpc(client, 'rel_contagem_status_filiais', {
    p_filiais: filiais,
  })
  if (error) throw new Error(`Falha ao contar os ativos por status: ${error.message}`)
  return kpisDeContagens(
    linhasDe(data, LEITURA_REL_CONTAGEM_STATUS.forma, LEITURA_REL_CONTAGEM_STATUS.rotulo),
  )
}

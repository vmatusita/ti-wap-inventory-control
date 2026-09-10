import { linhaDeErroDeRequest } from '@/lib/observabilidade-linha'

// A INSTRUMENTAÇÃO DE REQUEST (F55 · Frente A · item 2 da missão).
//
// O QUE ELA PEGA QUE O FUNIL NÃO PEGA. `registrarFalha` cobre o erro que ALGUÉM
// tratou — o `catch` de uma Server Action, o `if (error)` de uma query. O que
// escapava até aqui era o erro que NINGUÉM tratou: a exceção que sobe de um
// Server Component e vira a tela de erro, a Server Action que estoura no meio, o
// erro que nasce dentro do próprio proxy. Esses o Next entrega aqui, e só aqui.
//
// ONDE ESTE ARQUIVO MORA. `src/instrumentation.ts`, irmão de `src/app` — a doc
// local diz isso literalmente para projetos com pasta `src`
// (`node_modules/next/dist/docs/01-app/02-guides/instrumentation.md:43`). Ele é
// estável desde o Next 15 e **não precisa de flag nenhuma** no `next.config.ts`
// (não há `instrumentationHook` em lugar nenhum da doc de 16.2.12).
//
// ⚠ O QUE NUNCA ENTRA NO LOG, e por quê:
//   · `request.headers` — o cookie da sessão do Supabase está lá;
//   · `request.path` — ele VEM COM A QUERYSTRING (a doc é explícita:
//     `03-file-conventions/instrumentation.md:103`, *"resource path, e.g.
//     /blog?name=foo"*), e a busca de `/ativos` carrega nome e patrimônio nela.
// O que entra é `context.routePath`, que é o caminho do ARQUIVO da rota
// (`/app/ativos/[id]`) — diagnóstico sem um dado de ninguém dentro.
//
// ⚠ ESTE ARQUIVO VALE PARA OS DOIS RUNTIMES (a doc, `instrumentation.md:127`).
// Por isso ele importa a metade PURA do funil, não a porta `server-only`, e o
// formatador não usa nenhuma API exclusiva de Node — o que
// `observabilidade-fonte.test.ts` prova lendo o fonte, em vez de criar uma rota
// Edge só para a prova. (No Next 16 o proxy roda SEMPRE em Node e não aceita
// troca — `02-guides/upgrading/version-16.md:629` —, e o projeto não tem rota
// Edge; a disciplina fica de pé para o dia em que tiver.)

type RequisicaoComErro = {
  path: string
  method: string
  headers: { [key: string]: string | string[] }
}

type ContextoDoErro = {
  routerKind: 'Pages Router' | 'App Router'
  routePath: string
  routeType: 'render' | 'route' | 'action' | 'proxy'
  renderSource?: string
  revalidateReason?: string
  renderType?: string
}

export function onRequestError(
  error: unknown,
  request: RequisicaoComErro,
  context: ContextoDoErro,
): void {
  let linha: string
  try {
    linha = linhaDeErroDeRequest({
      rota: context?.routePath,
      tipo: context?.routeType,
      origem: context?.renderSource ?? null,
      // ⚠ `request.method` e NADA MAIS de `request`. Ver o cabeçalho.
      metodo: request?.method,
      erro: error,
    })
  } catch {
    // Um hook de erro que estoura vira dois erros. Ver `registrarFalha`.
    return
  }
  try {
    // Este arquivo É o funil do erro de request; a trava de
    // observabilidade-fonte.test.ts o isenta por nome, com o motivo escrito lá.
    console.error(linha)
  } catch {
    // sem console, não há para onde reportar.
  }
}

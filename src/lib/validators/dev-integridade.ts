// Lógica pura da Integridade da /dev (F22, revisto F27/B8 — DEV-01).
//
// ⚠ POR QUE ISTO NÃO MORA EM `src/lib/queries/dev.ts`. Aquele arquivo importa `server-only`,
// que lança ao ser importado fora de um Server Component — inclusive dentro do Vitest, que roda
// em Node puro, sem a condição `react-server` do bundler do Next. Extrair a junção para cá é o
// que permite testá-la como função pura, sem sessão, sem banco. Mesmo motivo de
// `src/lib/validators/dev-destrutivo.ts` (F23) e `src/lib/validators/conflitos.ts` (F24).
//
// ⚠ REDE PERMANENTE (achado da revisão adversarial da onda de UX, 07/08/2026). Antes desta
// função, `rodarChecagens()` fazia `CHECAGENS.map(...)`: iterava SÓ sobre o catálogo fixo, e
// toda chave que a RPC `dev_checagens_integridade()` devolvesse sem ter entrada no catálogo era
// DESCARTADA em silêncio. Foi exatamente o que aconteceu quando a migration 0098 acrescentou
// `arquivo_termo_orfao` e `conflito_entre_filiais`: a RPC passou a devolver nove linhas, o
// catálogo continuou com sete, e as duas novas nunca apareceram na tela — sem erro, sem aviso.
// A garantia agora é: toda chave que a RPC devolver entra na tela. As que o catálogo conhece
// saem com nome e descrição curados; as que não conhece aparecem no FIM da lista, rotuladas pela
// própria chave. Uma décima checagem, acrescentada por uma migration futura, na pior das
// hipóteses aparece feia (a chave crua como nome) — nunca ausente.

/** Uma entrada do catálogo curado (`CHECAGENS`, em `src/lib/queries/dev.ts`). */
export type CatalogoChecagem = { chave: string; nome: string; descricao: string }

/** Uma linha devolvida pela RPC `dev_checagens_integridade()` (migration 0077/0098). */
export type ResultadoChecagemRpc = { chave: string; total: number; amostra: string[] | null }

/** Uma checagem já casada com o resultado (ou a falta dele) — o que a tela renderiza. */
export type ChecagemResolvida = CatalogoChecagem & {
  achados: number | null
  amostra: string[]
  erro: string | null
}

/** A descrição mostrada para uma chave que a RPC devolveu e o catálogo não conhece. */
export const DESCRICAO_CHECAGEM_DESCONHECIDA =
  'Checagem nova: o banco já a calcula, mas esta tela ainda não tem nome nem descrição cadastrados para ela — provavelmente uma migration mais recente do que este catálogo.'

/**
 * Junta o catálogo curado com os resultados que a RPC devolveu.
 *
 * Ordem do resultado: primeiro o catálogo, NA ORDEM DELE — cada chave sem resultado
 * correspondente entra como "não encontrada", igual a antes. Depois, ao final, qualquer chave
 * que a RPC devolveu e o catálogo não conhece, na ordem em que a RPC as devolveu (a REDE
 * PERMANENTE, ver cabeçalho do arquivo).
 */
export function juntarCatalogoComResultados(
  catalogo: readonly CatalogoChecagem[],
  resultados: readonly ResultadoChecagemRpc[],
): ChecagemResolvida[] {
  const porChave = new Map(resultados.map((r) => [r.chave, r]))
  const chavesDoCatalogo = new Set(catalogo.map((c) => c.chave))

  const doCatalogo = catalogo.map((c): ChecagemResolvida => {
    const r = porChave.get(c.chave)
    return r
      ? { ...c, achados: r.total, amostra: r.amostra ?? [], erro: null }
      : { ...c, achados: null, amostra: [], erro: 'Checagem não encontrada no banco.' }
  })

  const desconhecidas = resultados
    .filter((r) => !chavesDoCatalogo.has(r.chave))
    .map(
      (r): ChecagemResolvida => ({
        chave: r.chave,
        nome: r.chave,
        descricao: DESCRICAO_CHECAGEM_DESCONHECIDA,
        achados: r.total,
        amostra: r.amostra ?? [],
        erro: null,
      }),
    )

  return [...doCatalogo, ...desconhecidas]
}

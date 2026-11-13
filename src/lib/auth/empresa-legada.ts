// A EMPRESA LEGADA — a WAP, o tenant nº 1 (F62, 22/09/2026).
//
// Desde a F62 o cargo e o status de cada pessoa moram em `public.membros`, POR EMPRESA. Até a
// virada chegar à sessão (a empresa escolhida no login — F69/F70), o app só conhece UMA
// empresa: a legada, dona de todo cadastro anterior à virada. As leituras do cargo
// (`getOperador`, a lista de usuários, a trava do último administrador) perguntam pela
// membership NESTA empresa.
//
// ⚠ FONTE ÚNICA: `public.empresa_legada()` (migration 0152). Este literal é o ESPELHO dela, e
// `empresa-legada.test.ts` reprova se os dois divergirem. Quem trocar a empresa legada troca
// a função (por migration nova) e este arquivo no mesmo commit.
export const EMPRESA_LEGADA_ID = '00000000-0000-4000-a000-000000000001'

/**
 * A EMPRESA DA OPERAÇÃO quando ela não tem filial nem linha de onde sair (F67, 13/11/2026): o cargo de navegação, o
 * "tudo" da Zona destrutiva, a linha do acervo (o TS não lê `empresa_id` do acervo — a trava da F63), a mesa de
 * conflitos e a gestão de contas. É a legada EXPLÍCITA — o banco confere a empresa de novo em toda RPC (a linha, a
 * filial, o alvo de outra empresa → 42501). ⚠ PONTO DE INJEÇÃO DA F70: aqui passa a sair a empresa da SESSÃO. Cada
 * chamada é contada pela catraca (`src/lib/auth/empresa-legada-catraca.test.ts`), com o destino escrito.
 */
export function empresaDaOperacao(): string {
  return EMPRESA_LEGADA_ID
}

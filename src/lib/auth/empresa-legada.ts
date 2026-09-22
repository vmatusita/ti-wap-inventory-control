// A EMPRESA LEGADA — a WAP, o tenant nº 1 (F62, 22/09/2026).
//
// Desde a F62 o cargo e o status de cada pessoa moram em `public.membros`, POR EMPRESA. Até a
// virada chegar à sessão (a empresa escolhida no login — F69/F70), o app só conhece UMA
// empresa: a legada, dona de todo cadastro anterior à virada. As leituras do cargo
// (`getOperador`, a lista de usuários, a trava do último administrador) perguntam pela
// membership NESTA empresa — a mesma ponte que `papel_atual()` faz no banco.
//
// ⚠ FONTE ÚNICA: `public.empresa_legada()` (migration 0152). Este literal é o ESPELHO dela, e
// `empresa-legada.test.ts` reprova se os dois divergirem. Quem trocar a empresa legada troca
// a função (por migration nova) e este arquivo no mesmo commit.
export const EMPRESA_LEGADA_ID = '00000000-0000-4000-a000-000000000001'

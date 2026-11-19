// Nome do cookie ANTIGO da sessão de visualização por senha (até a v1.75.0: o `senha_id` num envelope HMAC,
// `path: /relatorios`). Módulo-folha, sem node:crypto nem `server-only`, porque o proxy (que roda antes de tudo) o
// importa.
//
// F68 (19/11/2026): ele não abre mais nada — a sessão do visualizador é uma linha no banco (`sessoes_visualizador`) e o
// cookie novo é `wap_porta` (lib/auth/porta-rotas.ts). Fica só para o proxy APAGÁ-LO no 308 de `/relatorios/**`; sai
// com a contração da F68B.
export const VIEW_COOKIE_NAME = 'wap_view'

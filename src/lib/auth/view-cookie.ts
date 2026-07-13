// Nome do cookie da sessão de VISUALIZAÇÃO por senha. Módulo-folha, SEM
// node:crypto nem `server-only`, para poder ser importado tanto no servidor Node
// quanto no proxy (Edge runtime, que não tem node:crypto).
export const VIEW_COOKIE_NAME = 'wap_view'

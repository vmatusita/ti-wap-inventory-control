// Dublê do pacote `server-only` para a prévia estática (F43).
//
// `server-only` existe para EXPLODIR quando um módulo de servidor é arrastado
// para dentro de um bundle de cliente — e é o bundler do Next que o neutraliza,
// pela condição de exportação `react-server`. Rodando em Node puro (`tsx`), a
// resolução cai no `index.js`, que lança na hora do import.
//
// A prévia não monta bundle de cliente nenhum: ela renderiza no SERVIDOR, com
// `renderToStaticMarkup`. O apelido de `scripts/design/tsconfig.previa.json`
// troca o pacote por este arquivo vazio — a guarda continua valendo no app, onde
// ela tem função, e some só na ferramenta de dev, onde ela não tem.
export {}

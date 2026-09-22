# CLAUDE.md — scripts/import/

Carrega quando você lê/edita algo aqui. **Ferramenta da janela de go-live, não feature do
app.** É a carga ÚNICA inicial (F4) — `npm run carga`, guardas anti-produção obrigatórias
(confira `guard.ts` antes de tirar ou afrouxar qualquer checagem: ele é o que impede rodar a
carga fictícia contra produção depois do go-live). Roda por conta própria, fora de qualquer
Server Action.

Isto é DIFERENTE do import de startup por filial em `admin/importar` (F7, tela do app — regra
2 na raiz) — dois caminhos para dado real, com guardas separadas porque um é ferramenta de CLI
de uso único e o outro é feature permanente da UI, usada por admin/dev filial a filial.

`carga.ts`/`plano.ts`/`normalizar.ts` formam o motor puro e testável; `parse.ts` lê o CSV
(PapaParse, mesma lib do export F3). CSVs de teste são 100% fictícios (`WAP0001234`/"Fulano");
CSVs reais nunca entram no repositório.

# Relatório F62 — A raiz do tenant e o cargo por empresa

**v1.67.0** · **migrations `0152`–`0158`** · 22/09/2026 · código no
[PR #70](https://github.com/vmatusita/ti-wap-inventory-control/pull/70)

> 🚧 **EM EXECUÇÃO.** Este relatório é escrito junto com a fase. Até o apply nos dois bancos, as seções que dependem
> dele (a impressão "depois", as provas pós-apply, a paridade, o conferidor de formas, a janela entre o apply e o
> deploy, a conferência pós-deploy) estão marcadas como **PENDENTE** — nada aqui afirma um resultado que ainda não foi
> medido. O que já está medido tem a fonte ao lado.

---

# 1. O ROTEIRO DO JOHNNY — o que conferir, e o que ficou

**PENDENTE** — escrito no fecho da fase, com o estado real do apply, do merge e da tag.

---

# 2. O que já está feito e medido

- **O "antes"**, nos dois bancos, com o mesmo instrumento que vai medir o "depois"
  ([`f62-evidencias/impressao-acesso.sql`](f62-evidencias/impressao-acesso.sql), só agregados e md5):
  ensaio — 5 perfis, 6 filiais, md5 global `f2cfd5a11d551ca0edfcfd78f28a5ff1` (refeito às 20:05 UTC, idêntico ao das
  18:23); produção — 16 perfis, md5 global `a5de88cfd5b5fe4038e693db1693013f`
  ([`f62-evidencias/antes/`](f62-evidencias/antes/)). As policies vivas: 53 em `public` + 8 em Storage, md5 idêntico nos
  dois bancos ([`antes/impressao-policies.json`](f62-evidencias/antes/impressao-policies.json)).
- **As travas vermelhas contra o código de antes** ([`f62-evidencias/B-travas/`](f62-evidencias/B-travas/)).
- **O CI verde** sobre o código da fase, com a saída de cada roteiro novo e o que cada mutação F62 derrubou
  ([`C-ci-verde.txt`](f62-evidencias/C-ci-verde.txt), [`D-mutacoes-f62-no-ci.txt`](f62-evidencias/D-mutacoes-f62-no-ci.txt))
  e as travas de mesa com as sabotagens ([`E-mesa-verde.txt`](f62-evidencias/E-mesa-verde.txt)). *(Os três arquivos
  são regravados sobre o SHA de código congelado.)*
- **A revisão adversarial em duas rodadas** (5 lentes e depois 3, com 2 céticos por achado): 5 + 4 achados, todos
  fechados — a ata de 2026-09-22 · F62 em [`DECISOES.md`](DECISOES.md), item (i).

# 3. PENDENTE — o apply, as provas e o fecho

A impressão "depois" nos dois bancos; as provas pós-apply do runbook
([`f62-evidencias/verificacao-pos-apply.sql`](f62-evidencias/verificacao-pos-apply.sql)); a paridade ensaio × produção;
o conferidor de formas contra produção; a janela entre o apply de produção e o deploy; a conferência pós-deploy; os 30
critérios autoverificados; o estado de repouso; o que este relatório não prova; e o backlog nomeado.

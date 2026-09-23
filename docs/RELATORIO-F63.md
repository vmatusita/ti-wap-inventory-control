# Relatório F63 — `empresa_id` no acervo (lote 1) e a disciplina de backup de migração

**v1.68.0** · **migrations `0159`–`0161`, ⚠ AINDA NÃO APLICADAS em banco real** (o conector da Supabase está desligado
nesta sessão) · 23/09/2026 · SHA de código congelado **`cdc6dee`** · código no
[PR #72](https://github.com/vmatusita/ti-wap-inventory-control/pull/72), **aberto e SEM merge** · documentação de fecho e a
tag anotada `v1.68.0` ficam para depois do apply

> A segunda fase da virada multiempresa. As oito tabelas do acervo (`ativos`, `movimentacoes`, `lancamentos_item`,
> `pendencias_item`, `anotacoes`, `termos_gerados`, `colaboradores`, `itens`) ganham `empresa_id uuid not null`, com FK
> validada para `empresas` e o default `public.empresa_legada()` até a F67 (a decisão do Johnny) — **sem nenhum `update` e
> sem nenhuma tupla reescrita**: o default não-volátil do PG 11+ guarda o valor no catálogo. Nada lê a coluna, e nenhum
> escritor mudou (as 18 funções, os 9 pontos do app e os 27 roteiros que inserem no acervo ficaram intactos — e verdes).
> E a disciplina que faltava: **a classe no cabeçalho** de toda migration a partir da `0159`, conferida por um
> **classificador** que lê como o Postgres lê (o corpo de função é guardado, o de `do` é executado); **`backups_migration`**,
> o par chave/valor anterior que toda migration que sobrescreve dado vivo passa a gravar antes; e a **guarda de topo do
> acervo sem válvula**, que agora enxerga dentro de `do` — e por isso achou a `0133`, que já tinha feito, com a janela
> destrutiva aberta, o backfill que a ficha proíbe.
>
> **Tudo o que não depende do banco vivo está entregue e verde no CI** (run `35877703900`, no SHA congelado `cdc6dee`: 43 roteiros, 1.002 asserções, 0 ✗;
> injetor 131/131; `db:types:diff` verde; o rollback ensaiado devolvendo o esquema das oito ao de antes da `0159`, pela
> impressão medida no próprio CI). **O que falta é o banco:** o "antes", o apply no ensaio e em produção, as provas
> pós-apply, o merge, o deploy e a tag — o caminho está no §1, passo a passo.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você, e por quê

## 1.1 ⚠ PENDENTE: o conector da Supabase está desligado

No começo da run, **todas** as ferramentas do conector da Supabase (`list_projects`, `execute_sql`, `list_migrations`)
responderam *"This tool has been disabled in your connector settings"* — com o conector aparecendo como `connected` no
status da sessão. É o bloqueio por ferramenta que a F60 já viu: não é o classificador de segurança, não volta sozinho,
e só você o desfaz (nas configurações do conector no claude.ai). Conferido de novo cinco vezes ao longo da run (09:52, 10:36, 11:06,
11:11 e 11:56), sempre com a mesma resposta. Pela ordem ("Bloqueios reais — o MCP não está conectado"): **nada foi aplicado, nenhuma
impressão de banco foi tirada, o PR está aberto e SEM merge** (o `database.ts` descreve colunas que produção ainda não
tem).

**O caminho recomendado — religar o conector e deixar a fase terminar sozinha:**

1. Religue as ferramentas do conector da Supabase no claude.ai.
2. Numa sessão nova, na raiz do repositório, na branch `f63-empresa-no-acervo`, cole:

   ```text
   Retome a F63 a partir do §1 do docs/RELATORIO-F63.md: o conector da Supabase voltou. Confira list_projects,
   confira que a main não andou (senão rebase + CI novo), e siga a Frente G da ordem
   docs/prompts/F63-empresa-no-acervo-e-backup-de-migracao-ultracode.md a partir do passo 5 (o "antes" nos dois
   bancos, o apply no ensaio e as provas, o apply em produção e as provas, o smoke e o conferidor de formas, o merge,
   a conferência pós-deploy, o PR de documentação e a tag v1.68.0). O CI do SHA congelado já está verde.
   ```

**O caminho B — se preferir aplicar à mão, no SQL Editor** (a ordem é rígida; cada passo nos DOIS bancos, **ensaio
primeiro**, e produção dentro de 24 h do commit das migrations — a sonda de deriva abre alarme depois disso):

| passo | o quê | como |
|---|---|---|
| 0 | a foto de **antes** (obrigatória ANTES de qualquer apply) | rode `docs/f63-evidencias/impressao-acervo.sql` como está (o parâmetro vazio) e guarde o JSON — anote o `corte_para_o_depois`; rode `docs/f63-evidencias/impressao-policies.sql`; anote os avisos de segurança do painel (Advisors) por nível |
| 1 | `0159_backups_migration.sql` | o texto EXATO do arquivo, uma execução; depois `insert into supabase_migrations.schema_migrations (version, name) values ('<aaaammddhhmmss>', 'backups_migration');` |
| 2 | `0160_empresa_no_acervo_cadastros.sql` | idem; ledger `empresa_no_acervo_cadastros`. Se aparecer `canceling statement due to lock timeout`, espere e repita (no máximo três vezes em 30 min) — nunca suba o timeout |
| 3 | `0161_empresa_no_acervo_movimento.sql` | idem; ledger `empresa_no_acervo_movimento` |
| 4 | `notify pgrst, 'reload schema';` | |
| 5 | a prova | `docs/f63-evidencias/verificacao-pos-apply.sql` (as oito com `uuid · not null · atthasmissing = true`, default preso à função, FK validada, comentário F67, as três contagens iguais; `backups_migration` com RLS, sem force, zero policy, privilégios `00000` nos três papéis) e `impressao-acervo.sql` **com o `corte_para_o_depois` do passo 0 no lugar de `''`**: o `relfilenode` das oito tem de ser **igual** ao do antes, sem exceção; no ensaio os dois md5 idênticos; em produção idênticos ou com `0 < janela < linhas`. `impressao-policies.sql` igual ao antes. Advisors: só +1 INFO `rls_enabled_no_policy` (`backups_migration`) |
| 6 | se o passo 5 divergir | **rollback imediato** com o texto exato de `supabase/rollback/F63-desfaz.sql` (em produção, antes do diagnóstico) — e o PR não é mergeado |
| 7 | produção | repita 0–5 em produção; logo depois, `node scripts/smoke/smoke-prod.mjs` (0 falha) — o app no ar ainda é o velho, lendo o esquema novo |
| 8 | o merge | marque o PR #72 como pronto e faça o merge com `verificar` e `banco-sem-docker` verdes |
| 9 | a conferência pós-deploy | `/api/saude` com `1.68.0` e o commit do merge; `node scripts/smoke/smoke-prod.mjs`; `gh workflow run saude.yml -f partes=b` verde |
| 10 | a tag | `git tag -a v1.68.0 <merge do PR de documentação> -m "v1.68.0 — F63"` e `git push origin v1.68.0` |

```bash
gh pr ready 72
```

## 1.2 Depois do deploy (5 minutos, só leitura)

1. **Entre com a sua conta** e abra Ativos, Movimentações e Itens: tudo tem de estar como sempre — a fase não muda tela.
2. **`/api/saude`** com `1.68.0`, e a **Parte B do `saude.yml`** do dia seguinte verde.
3. **O diff da fase**: `git diff v1.67.0 v1.68.0 --stat`. **Tem de aparecer:** `supabase/migrations/0159`…`0161`,
   `supabase/migrations.lock.json`, `supabase/rollback/F63-desfaz.sql`, `supabase/tests/**` (novos `empresa_no_acervo` e
   `f63_rollback`; emendados `catalogo_policies`, `isolamento_tenant`, `restauracao`, `f62_rollback`),
   `scripts/db/classificar-migration.mjs`, `scripts/db/mutacoes.mjs` e os testes deles, `src/lib/itens/migrations-f38.test.ts`,
   os testes de `src/lib/validators/`, `src/lib/types/database.ts`, `scripts/design/previa-ficha-dados.ts` (a prévia monta
   um `AtivoFicha` inteiro), `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`. **Não pode aparecer:**
   `src/lib/actions/**`, `src/lib/queries/**` (fora testes), `src/components/**`, `src/app/**`, `scripts/seed.ts`,
   `scripts/import/**`, `scripts/db/restaurar.mjs`, migration antiga alterada, `.github/workflows/**`, o `CLAUDE.md` da
   raiz, `package-lock.json`.

```bash
git diff v1.67.0 v1.68.0 --stat
```

## 1.3 Lembrete: o default cai na F67

O default `public.empresa_legada()` das oito tabelas é a rede da migração, não do produto. Enquanto ele existir, **todo
INSERT sem `empresa_id` recebe a WAP** — uma linha de uma segunda empresa gravada por um escritor que esqueça a empresa
cai na WAP em silêncio. A F67 o tira, com o orçamento medido aqui (§5), e inverte a trava 15b no mesmo commit.

---

# 2. O que mudou, por arquivo e por quê

| arquivo | o quê | por quê |
|---|---|---|
| `supabase/migrations/0159_backups_migration.sql` | a tabela do par de backup: `(id identity, migration, tabela, coluna, chave, valor_anterior jsonb, gravado_em)`, CHECK do nome do arquivo, da tabela e da coluna, unique por célula; RLS ligada, zero policy, `revoke all` de `anon`/`authenticated`/`service_role` (e da sequência), sem `force` | o protocolo à mão da `0111` virando dado (decisão 4) |
| `supabase/migrations/0160_empresa_no_acervo_cadastros.sql` | `empresa_id uuid not null default public.empresa_legada() references public.empresas (id)` + comentário "o default cai na F67" em `colaboradores`, `itens`, `termos_gerados`, `anotacoes` | as frias primeiro, como canário (decisão 1) |
| `supabase/migrations/0161_empresa_no_acervo_movimento.sql` | o mesmo em `ativos`, `movimentacoes`, `pendencias_item`, `lancamentos_item` | na ordem em que o caminho de escrita do app toma os locks (decisão 1; corrigida pela revisão adversarial, §9) |
| `supabase/migrations.lock.json` | as três travadas | `npm run db:lock`, no mesmo commit de cada migration |
| `supabase/rollback/F63-desfaz.sql` | o rollback, `0161` → `0160` → `0159`, `drop column if exists`, `backups_migration` só vazia | a ordem inversa (regra 10 da §4) |
| `scripts/db/classificar-migration.mjs` | o leitor único e o classificador; `--censo` | decisões 3 e 5 |
| `src/lib/validators/migrations-backfill.test.ts` | a trava de mesa do classificador: o leitor, a sabotagem A inteira, a cadeia real e o censo das 157 congelado | nasceu vermelha sem o módulo |
| `src/lib/itens/migrations-f38.test.ts` | a guarda de topo pelo leitor único, vendo `do` e alias, sem válvula, com a exceção nominal FECHADA da `0133`, e a sabotagem B; `DA_F38` + `0159`–`0161` | fatos 13–15; decisão 5 |
| `src/lib/validators/empresa-acervo-sem-leitura.test.ts` | a trava "ninguém lê": TS (228 leituras das oito em 572 arquivos), a catraca do literal `empresa_id` por trecho, e o corpo vigente das funções | decisão 7 |
| `src/lib/validators/catalogos-seguranca.test.ts` | describe 5 emendado (a fronteira catálogo × valor) e describe 12 (`k_lote1`, fonte única) | decisões 6 e 10 |
| `supabase/tests/catalogo_policies.sql` | `k_lote1` e o bloco 5 (15a/15b/15c, o aviso da F64); `backups_migration` em `k_infra` e `k_sem_select` | a trava do lote 1, derivada do catálogo |
| `supabase/tests/empresa_no_acervo.sql` (novo) | os blocos 1–7 (o default, a FK, a armadilha, os instrumentos, o par, a tabela fechada, ninguém lê) | sabotagens D, E, F, G e I |
| `supabase/tests/f63_rollback.sql` (novo) | o rollback ensaiado: rb0–rb4, com a impressão de antes da `0159` medida no CI | critério 20 |
| `supabase/tests/f62_rollback.sql` | roda `F63-desfaz.sql` ANTES nos dois caminhos | o rollback entre fases (achado (a)) |
| `supabase/tests/restauracao.sql` | o cenário 8: backup sem a chave → WAP; com a chave → a empresa que trouxer | sabotagem H |
| `supabase/tests/isolamento_tenant.sql` | só o cabeçalho: o que a F63 preencheu e o que falta (F64, F66) | describe 5 |
| `scripts/db/mutacoes.mjs` + `mutacoes.test.mts` | `F63_ACERVO` (seis mutações), teto 125 → 131 | decisão 8 |
| `scripts/db/diff-tipos.test.mts` | relações 37 → 38 (a tabela nova) | o número sobe porque o banco ganhou objetos |
| `src/lib/types/database.ts` | hand-fix datado: `empresa_id` nas oito (Row/Insert/Update + a FK) e `backups_migration` | o `db:types:diff` do CI exige o estado final |
| `scripts/design/previa-ficha-dados.ts` | a prévia estática da ficha põe a empresa legada no `AtivoFicha` | o único uso vivo de `Tables<'ativos'>` (fato 21) |
| `docs/**`, `scripts/db/CLAUDE.md`, `supabase/CLAUDE.md` | o PLAN, a ata, a MATRIZ (R-ACC-85 a 90), o ADR-003, o RUNBOOK, o PLANO (nota F63, fichas F64 e F67), os índices, os instrumentos e as evidências | Frente F |
| `package.json`, `registry.ts`, `CHANGELOG.md` | `1.68.0` | regra 8 |

---

# 3. Os números MEDIDOS, lado a lado com a ficha e a ordem

A tabela inteira dos 26 fatos está no [`PLAN-F63.md`](PLAN-F63.md) §1. As divergências, cada uma explicada:

**As doze que a ordem já trazia** — confirmadas no disco (as de banco vivo, pela medição da ordem de 23/09, até o
conector voltar):

1. **A numeração:** `0159`–`0161`, não `0145`–`0147` (a F60 gastou esses números).
2. **O default pela função**, não pelo literal `'<wap>'`: a fonte única é `public.empresa_legada()` (decisão 3 da F62).
3. **Sem `set not null` separado**: o `not null` vem no próprio `add column`, já satisfeito pelo default; a mitigação do
   ACCESS EXCLUSIVE por `check … not valid` não se aplica. O que entrou foi `lock_timeout`.
4. **O `drop default` adiado para a F67** (a decisão do Johnny).
5. **Os quatro pontos do `INVENTARIO-LEITURAS`** (`criarColaboradorInline`, `criarColaborador`, `consolidarColaboradores`,
   `estornarLancamento`) migram para a F67 — registrado na ficha dela (o documento histórico não se edita).
6. **O `update` em `ativos` não aborta e reescreve** — provado no CI (sabotagem E): `relfilenode` igual, md5 de
   `(id, xmin)` diferente.
7. **A guarda de topo que já existia é mais forte que a pedida** — ficou sem válvula.
8. **Os leitores de antes não viam dollar-quote com rótulo e apagavam o `do`** — substituídos pelo leitor único.
9. **A `0158` declara ADITIVA com escrita em tabela existente** (upsert em `membros` dentro de `do`).
10. **A `0133` já fez, dentro de `do` e com a janela destrutiva aberta, o backfill que a ficha proíbe** — virou a única
    exceção nominal da guarda.
11. **O ensaio tem `anotacoes` e `colaboradores` vazias** (fato 3) — universo zero ali; a prova dessas duas vem do CI
    (bloco 1 de `empresa_no_acervo.sql`) e de produção.
12. **As quatro tabelas do vocabulário do import** que a ficha F64 não lista — escritas na ficha da F64.

**As que eu medi e a ordem não tinha:**

13. **A regex da guarda de topo era CEGA A ALIAS** (`update\s+(public\.)?movimentacoes\s+set` não casa `update
    public.movimentacoes m set`, a forma da `0133`). Ver o `do` não bastaria — foi preciso o leitor único **e** a regex
    com alias (`only`, esquema e nome citados, também).
14. **O fato 14 conta 12 arquivos com dollar-quote de rótulo**: são **7** como código (`$function$` 0051/0097/0099/0118,
    `$copia$` 0153, `$confere$` 0156, `$recopia$` 0158); nos outros 5 (`0032`–`0037`) o `$smoke$`/`$idx$` está num smoke
    test COMENTADO. O leitor os lê como comentário — e o teste prende as duas listas.
15. **A `0156` também diverge** (fato 15 só nomeava a `0158`): declara ADITIVA e faz `update public.operador_filiais` de
    topo (o backfill do vínculo por membership).
16. **O fato 11 ("ninguém lê linha inteira do acervo pelo app") estava incompleto**: além dos 9 `select('*', {head:
    true})`, há **17 `select: '*'` em constantes de forma** sobre as oito — a ficha do ativo (`LEITURA_FICHA_ATIVO`,
    `'*, filiais(slug, nome)'`) e 16 de backup/exportação. **Todas `z.looseObject`** (decisão 5 da F58): a coluna chega
    nelas depois do apply e atravessa sem lançar; nenhuma forma estrita a vê.
17. **Um dos 2 usos de `Tables<'…'>` do fato 21 é comentário**; o vivo (`AtivoFicha`) exigiu ajustar a prévia estática
    da ficha.
18. **O rollback ensaiado da F62 quebra depois da F63**: `F62-2-desfaz.sql` derruba `empresas` e `empresa_legada()` sem
    `cascade`, e a F63 pendura nelas oito FKs e oito defaults. `f62_rollback.sql` passou a rodar o da F63 antes — a ordem
    inversa entre fases (R-ACC-90).
19. **O lote do injetor estava NO teto** (125/125, sem folga): o teto subiu no número exato, 131.
20. **`scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` estão rastreados pelo git** — cópia de worktree de agente;
    fora do escopo, backlog (§14).
21. **O conector da Supabase amanheceu desligado** — a razão de o §1 existir.

**O que esta ordem acrescenta à ficha** (declarado): a impressão do acervo com `relfilenode` e `(id, xmin)`; o
`lock_timeout`; o `do` tratado como código executado; o leitor único, com a exceção nominal da `0133`; a trava "ninguém
lê"; o smoke logo depois do apply de produção; a prova da restauração; e o rollback ensaiado.

---

# 4. As decisões

**A decisão do Johnny (23/09/2026):** o default `public.empresa_legada()` das oito FICA até a F67 — escrito na coluna,
na ata e na ficha da F67 com o orçamento. As **dez decisões da fase** (as migrations, o lock, as classes,
`backups_migration`, o leitor único, a trava do lote 1, a trava "ninguém lê", o injetor, o instrumento, o describe 5) e
as **tomadas na execução** (o rollback entre fases, a impressão de antes da `0159` medida no CI, as 17 leituras frouxas,
o `AtivoFicha`, o conector desligado) estão na ata `2026-09-23 · F63` de [`DECISOES.md`](DECISOES.md), com contexto,
escolha e motivo; o desenho completo, no [`PLAN-F63.md`](PLAN-F63.md) §4.

---

# 5. O censo dos escritores e leitores das oito — o orçamento da F67 (a fase NÃO o executa)

- **18 funções SQL** que inserem nas oito: `ativos` 3, `movimentacoes` +4, `lancamentos_item` +5, `pendencias_item` 1,
  `anotacoes` 5 (nome a nome no `PLAN-F63.md` §2.1 e na ficha da F67). `movimentacoes` nunca recebe UPDATE de função
  nenhuma. As 8 funções que gravam backup inline (`to_jsonb(<linha>)`) passam a levar a chave.
- **9 pontos TS** em `src/lib/actions` (`itens.ts:448/572/711`, `ativos.ts:128`, `pendencias.ts:442`, `termos.ts:532`,
  `colaboradores.ts:167/198/301`), nas linhas que a ordem citou.
- **Scripts:** `seed.ts`, `import/carga.ts`, `smoke/fixtures-passe2.ts`, e `db/restaurar.mjs:272` (as colunas saem das
  chaves do backup).
- **27 roteiros** com **569** INSERTs nas oito (exato).
- **Leitores:** 9 contagens (`head: true`), 17 leituras de linha inteira frouxas, e as formas estritas com lista
  explícita de colunas; o consumidor do Realtime nem lê o payload (só dispara `router.refresh()`).
- **Nenhum mudou nesta fase** — e o CI verde com os 27 roteiros intactos é a prova (sabotagem G).

---

# 6. O censo da cadeia pelo classificador

`node scripts/db/classificar-migration.mjs --censo` → [`f63-evidencias/censo-cadeia.md`](f63-evidencias/censo-cadeia.md).
Sobre as 157 anteriores: **ADITIVA 139 · BACKFILL 11 · DESTRUTIVA 2 · ILEGÍVEL 5**, lidas **sem lançar**. As ILEGÍVEL:
`0057` e `0125` (coluna gerada STORED), `0111` (o `update` de `ativos` chama `status_tem_detentor()` no apply — o caso que a
ficha cita), `0124` (`execute format`), `0133` (`setval()` e a válvula `estoque.dev_destrutivo` dentro de `do`). As sete
com cabeçalho: cinco batem; **`0156` e `0158` declaram ADITIVA e executam BACKFILL** (ata, não migration). O censo é
EVIDÊNCIA abaixo da `0159`, congelado em `migrations-backfill.test.ts` (uma mudança nele é o leitor que mudou). As três
da fase (`0159`–`0161`): ADITIVA declarada = calculada, sem problema nenhum.

---

# 7. A impressão do acervo antes × depois — ⚠ PENDENTE (o conector)

O instrumento está pronto e versionado: [`f63-evidencias/impressao-acervo.sql`](f63-evidencias/impressao-acervo.sql)
(por tabela: linhas, `relfilenode`, md5 de `(id, xmin)`, md5 do conteúdo sem `empresa_id`, a janela; e o md5 do `prosrc`
das 18 escritoras), com a prova de que os dois instrumentos enxergam o que dizem enxergar feita no Postgres do CI
(sabotagem D, §8). **Nenhuma impressão de banco vivo foi tirada** — nem o "antes" (`f63-evidencias/antes/PENDENTE.md`),
nem o "depois". O §1 diz como.

---

# 8. As sabotagens, com a saída real

| | o quê | onde está a saída | resultado |
|---|---|---|---|
| **A** | o classificador: os 18 casos da ordem (update sem cabeçalho; ADITIVA com update; update dentro de `do` — visto; dentro de `$function$` — ignorado; `$$` em comentário antes do update — visto; comentário de fim de linha — ignorado; BACKFILL sem bloco; bloco de OUTRO arquivo; `where` diferente por um espaço; `set_config(dev_destrutivo)`; `execute format` — ILEGÍVEL; `select public.f()`/`call` — ILEGÍVEL; `merge` e `with … update` — vistos; default `gen_random_uuid()` — não ADITIVA; comentário aninhado — ignorado; `'$$'` em texto — não abre corpo; a `0133` real e a `0159` igual a ela; dollar-quote sem fecho — LANÇA) e mais seis (where mais largo, coluna sem par, rodapé sem o backup, as outras válvulas, controle de transação, insert em tabela existente); e os da revisão adversarial (R1–R7: `set_config` de `session_replication_role`, o nome de GUC montado, rename + recriação, escrita por nome renomeado/outro esquema/view, a `0159` fechada no texto, a TROCA de tabela por rename duplo, o backup lendo pelo `join`) | [`f63-evidencias/A-B-I-mesa.txt`](f63-evidencias/A-B-I-mesa.txt); vermelho sem o módulo em [`B-travas/mesa-vermelho.txt`](f63-evidencias/B-travas/mesa-vermelho.txt) | todos com o veredito esperado |
| **B** | a guarda não afrouxou: DESTRUTIVA com justificativa + update de topo em `movimentacoes` → vermelha; o mesmo dentro de `do`, com `$rótulo$` depois de `$$` em comentário, com alias, `only` + nome citado, CTE, `merge`, `truncate`, upsert, por nome renomeado, depois de `set schema`, por view criada no arquivo → vermelha; a TROCA da tabela (a cópia transformada que assume o nome, outra tabela renomeada para o nome, a volta ao `public`, dentro de `do`, `drop table` declarado DESTRUTIVA, `drop table` numa lista) → vermelha; dentro de `$function$`, em comentário de fim de linha, em comentário aninhado, `revoke truncate`, rename de OUTRA tabela, `rename constraint` → ignorado; a `0133` sem a exceção → vermelha; o mesmo texto como `0159` → vermelha | `A-B-I-mesa.txt` | como esperado |
| **C** | o lote 1: vermelho pelos oito nomes antes das migrations; verde depois; default literal (`ativos`), `drop not null` (`movimentacoes`), FK `not valid` (`itens`) e sem a coluna (`anotacoes`) → vermelho, **cada um pelo nome** | [`B-travas/catalogo-e-rollback-vermelho-ci.txt`](f63-evidencias/B-travas/catalogo-e-rollback-vermelho-ci.txt) (run `35865427382`); [`C-ci-verde.txt`](f63-evidencias/C-ci-verde.txt) (verde + as quatro mensagens das mutações) | como esperado |
| **D** | os instrumentos: default VOLÁTIL troca o `relfilenode` (18971 → 18979), o da fase não (18979 → 18979, `atthasmissing = t`); um update de uma linha numa subtransação deixa o `relfilenode` igual e muda o md5 de `(id, xmin)` | `C-ci-verde.txt` (4a/4b/4c, com a medição) | como esperado |
| **E** | a armadilha: `update … set empresa_id` → 42501 em `movimentacoes` e `lancamentos_item`, com o `(id, xmin)` intacto; em `ativos` PASSA — `relfilenode` igual, md5 de `(id, xmin)` diferente — e é desfeito | `C-ci-verde.txt` (3a/3b/3c) | como esperado |
| **F** | o par: o bloco grava (com o NULL), o rollback devolve linha a linha e o md5 volta; sem o bloco não há de onde devolver; o CHECK e o unique recusam; `anon`/`authenticated`/`service_role` recusados em ler, gravar, alterar e apagar, com o conteúdo intacto; as mutações `f63-backups-*` acusadas por `4` e `6a` | `C-ci-verde.txt` (5a–5d, 6a–6c) | como esperado |
| **G** | o default: INSERT sem `empresa_id` nas oito → WAP; empresa inexistente → 23503 nas oito, e nada fica; os 27 roteiros que inserem no acervo passam sem nenhuma edição de `empresa_id` | `C-ci-verde.txt` (1a/1b/2a/2b e o RESUMO) | como esperado (a 1ª rodada achou um 23505 no fixture do termo — §9) |
| **H** | a restauração: sem a chave → WAP; com a chave → a empresa B fictícia (ativo e anotação) | `C-ci-verde.txt` (8a/8b) | como esperado |
| **I** | ninguém lê: `.eq('empresa_id')` e `.select('id, empresa_id')` em `ativos`, `.match({ empresa_id })` em `itens`, `?.filter`, o descritor com `select`/`ordem` pela coluna, e um corpo lendo `movimentacoes.empresa_id` → acusados; a coluna numa constante, o texto partido, o template, o construtor reatribuído e a troca 1-por-1 no mesmo arquivo → a catraca acusa pelo trecho; o `;` num texto entre o apelido e a leitura e o `select … into v from` → acusados; policy e função fictícias no catálogo → acusadas (7d) | `A-B-I-mesa.txt`; `C-ci-verde.txt` (7a–7d) | como esperado |

---

# 9. A revisão adversarial

Três rodadas, cada uma em contexto fresco: lentes separadas procuram lacunas de CORREÇÃO ou de REQUISITO DECLARADO (nunca
estilo), cada achado vai a céticos instruídos a REFUTÁ-LO no código atual ("na dúvida, refutado"), e só o que a maioria
sustenta conta como confirmado. Os prompts proíbem abrir `.env*`, tocar banco e editar arquivo. Corrigido mesmo quando
descartado, se o caso era real no código daquele momento.

**1ª rodada** (5 lentes — classificador, leitores do app, migrations e lock, backup e rollback, travas e escopo; 13
achados; 3 céticos por achado):

| achado | votos | o que mudou |
|---|---|---|
| a ordem das quatro `alter` da `0161` não era a ordem de lock do app: `criar_movimentacao_com_itens` trava `ativos` com `for update` ANTES do primeiro INSERT | **confirmado 2/3** | `0161` reordenada (`ativos`, `movimentacoes`, `pendencias_item`, `lancamentos_item`), cabeçalho e decisão 1 corrigidos, retravada com `db:lock -- --regravar-alterada` (nunca aplicada em banco nenhum) e o rollback na mesma ordem (`6c10e4e`) |
| o RECORTE do describe 5 só lia `empresa_id <op> valor`, não `valor <op> empresa_id` | **confirmado 3/3** | nos dois sentidos (`0e2bd2f`) |
| o `RELATORIO-F63.md` ainda fora do git | **confirmado 2/3** | é este rascunho, versionado no fecho |
| rename de ida e volta / `set schema` / view criada no arquivo escondendo a escrita da guarda; rename + `create table` com o nome antigo + `insert` passando como ADITIVA | descartado (os céticos já acharam corrigido) | a identidade das tabelas no classificador (`a41c54c`) |
| a válvula por `set_config('session_replication_role', …)`; o nome da GUC montado por concatenação | descartado (idem) | a forma de função vista; o nome montado vira ILEGÍVEL (`a41c54c`) |
| a trava "ninguém lê" cega a constante, texto partido e construtor reatribuído | descartado (1/3 e 0/3) | endurecido mesmo assim: a catraca do literal `empresa_id` em `src/**` (`0e2bd2f`) |
| o par de backup provado só com coluna `text` | descartado | endurecido: o bloco 5e (array, jsonb, enum, numeric, timestamptz, e o null de cada; identity, gerada e not null na tabela) |
| o bloco 6 (`backups_migration` fechada) passa por vácuo no CI, que não tem default privilege | descartado | endurecido: R5, o texto da `0159` travado na mesa |
| `sqlDeInsercao` com lote misto (com e sem `empresa_id`) | descartado | endurecido: o teste do restaurador (`23502` no null explícito) |
| o `unique` por célula barra uma 2ª passada na mesma coluna | descartado | a nota "um valor anterior por célula" na receita BACKFILL |

**2ª rodada** (3 lentes sobre os consertos + um crítico de completude, que não achou nada; 6 achados; 2 céticos por
achado):

| achado | votos | o que mudou |
|---|---|---|
| a TROCA de tabela — a cópia transformada que assume o nome por rename duplo, ou outra tabela renomeada para o nome liberado — passava como ADITIVA, e a guarda de topo não via | **confirmado 2/2** | `rename`/`set schema` de tabela que já existia e `rename column` dela viraram DESTRUTIVA; a guarda reprova `rename`/`set schema`/`drop table` das três guardadas e o rename PARA o nome delas, pelas duas leituras (`e2726ea`) |
| o bloco de backup aceitava o valor e a chave de OUTRA tabela do `join` | **confirmado 2/2** | os dois têm de vir do apelido da tabela do `from` (`e2726ea`) |
| a catraca comparava só a CONTAGEM por arquivo — uma troca 1-por-1 passava | **confirmado 2/2** | compara, por ocorrência, o trecho desde o `.from(` (`2dda18a`) |
| a varredura de `src/**` ignorava `.mts`/`.cts` | **confirmado 2/2** | todo fonte JS/TS (`2dda18a`) |
| o RECORTE não lia cast na coluna nem `not in` | **confirmado 2/2** | cast, `not in`, `between` e comparação de ordem (`2dda18a`) |
| o corpo vigente das funções partido por `split(';')` cru | descartado (1/2) | corrigido mesmo assim (`comandosDoTexto`, o léxico único, também no describe 5) — e o caso novo expôs um furo que já existia: o apelido de `into v_n` engolia o `from` seguinte e a tabela sumia da leitura (lookahead) |

O censo das 157 mudou numa célula só, e a mudança está congelada: a classe CALCULADA da `0057` (o `rename column` de
`profiles`) passou de ADITIVA a DESTRUTIVA; o veredito continua ILEGÍVEL (coluna gerada STORED), e o placar por veredito
continua 139/11/2/5.

**3ª rodada** (2 lentes sobre os consertos da 2ª; 4 achados; 2 céticos por achado) — **nenhum confirmado**, e a revisão
parou aqui:

| achado | votos | o que mudou |
|---|---|---|
| a guarda de topo lia a prosa de DENTRO dos textos: um `comment on column … is 'não fazemos update public.movimentacoes set …'` reprovava uma migration ADITIVA (falso positivo, não furo — mas a própria F63 pede comentário com motivo na coluna) | 0/2 (os céticos já leram o código corrigido; um confirmou que era real em `70922cc`) | as regex leem o texto executado MASCARADO; o nome citado continua visto (`499117e`) |
| o bloco de backup aceitava `to_jsonb(status)` e `id::text` SEM apelido — a coluna que só a tabela do `join` tem é dela, sem erro | 0/2 (idem) | o apelido do `from` é obrigatório no valor e na chave (`499117e`) |
| no corpo das funções, o apelido de um subselect ou de um CTE sobre uma das oito livrava a leitura | 1/2 | o qualificador que não resolve para tabela real cai na régua do sem qualificador (`cdc6dee`) |
| o RECORTE não lia `join … using (empresa_id)` nem `(a.empresa_id) = v` | 1/2 | lê os dois (`cdc6dee`) |

Os quatro foram corrigidos porque eram reais no código revisado; nenhum sobreviveu aos dois céticos. **O SHA de código
congelado é `cdc6dee`** (`PLAN-F63.md` §8).

---

# 10. A contagem final, antes × depois

| | antes (v1.67.0) | depois (v1.68.0, SHA `cdc6dee`) | fonte |
|---|---|---|---|
| testes (Vitest) | 250 arquivos · 7.434 | **252 arquivos · 7.600** | `npm run test` na mesa |
| roteiros no CI | 41 · 969 asserções | **43 · 1.002 asserções**, 0 `✗` | `banco-sem-docker`, run `35877703900` |
| injetor | 125/125 (no teto, zero folga) + 2 em quarentena | **131/131** + 2 em quarentena (2 de 133, abaixo de ⅓) | idem |
| `db:types:diff` | 37 relações · 332 colunas · 94 funções | **38 · 347 · 94** (+`backups_migration` e suas 7 colunas; +8 `empresa_id`; nenhuma função) | idem |
| migrations / `migrations.lock.json` | 157 / 157 | **160 / 160** | disco |
| `k_negocio` · `k_infra` · `k_sem_select` | 20 · 8 · 5 | **20 · 9 · 6** (+`backups_migration`) | `catalogo_policies.sql` |
| `k_lote1` | — | **8** (a fonte única das oito) | idem |
| tabelas de negócio com `empresa_id` | 1 (`filiais`) | **9** (as oito + `filiais`); faltam 11 (F64) | 15c e o aviso da F64 |
| policies (`public` · Storage) | 54 · 8 | **54 · 8** — nenhuma policy criada nem tocada (no CI; nos bancos vivos, ⏳) | `catalogo_policies.sql` |
| funções criadas ou recriadas | — | **0** (as 18 escritoras intactas) | `git diff` das migrations |
| o censo das 157 pelo classificador (veredito) | — | ADITIVA 139 · BACKFILL 11 · DESTRUTIVA 2 · ILEGÍVEL 5 | `migrations-backfill.test.ts` |
| o censo das 157 (classe calculada) | — | ADITIVA 141 · BACKFILL 13 · DESTRUTIVA 3 | idem |
| regras da MATRIZ | até R-ACC-84 | **até R-ACC-90** (+6) | `MATRIZ-REGRAS.md` |
| advisors (ensaio / produção) | 5 INFO · 34 WARN · 1 WARN Auth (a medição da ordem) | ⏳ esperado: +1 INFO `rls_enabled_no_policy` (`backups_migration`) | o conector |
| `npm run build` | verde | **verde** (`Compiled successfully`, 32 páginas estáticas); `verificar:actions` VERDE sobre 24 chunks; `contraste` verde | a mesa |

---

# 11. Os 29 critérios, autoverificados

✅ atendido e conferido · ⏳ PENDENTE do banco vivo (o conector, §1) · ◐ a parte do repositório/CI atendida, a do banco
pendente.

| # | critério | | evidência |
|---|---|---|---|
| 1 | lint, test, typecheck, build limpos; contraste e verificar:actions verdes; `banco-sem-docker` verde com roteiros, injetor e `db:types:diff` | ✅ | mesa no SHA `cdc6dee`: 252 arquivos · 7.600 testes, lint e `tsc` sem saída, build verde, `verificar:actions` VERDE (24 chunks), contraste verde; CI run `35877703900` (`verificar` e `banco-sem-docker` verdes) |
| 2 | `PLAN-F63.md` com os 26 fatos, os censos, o desenho, as decisões, a ordem das migrations e a de rollback — anterior ao 1º commit em `supabase/`/`src/`/`scripts/` | ✅ | `db172e9` (09:57) antes de `8a8b3d7` (10:11, as travas); §8 com o SHA congelado |
| 3 | a impressão "antes" (acervo, policies, advisor) nos dois bancos, antes de qualquer apply | ⏳ | os instrumentos em `f63-evidencias/`; `antes/PENDENTE.md` |
| 4 | migrations a partir da `0159`, cabeçalho validado, rollback no rodapé, `db:lock` no mesmo commit, `DA_F38`; sem enum novo, `update`/`delete` de topo no acervo, janela destrutiva, nome repetido, função criada | ✅ | `node scripts/db/classificar-migration.mjs` ("todas passam"); `migrations-lock.test.ts`; `DA_F38` + `0159`–`0161`; a guarda de topo verde; nenhuma `create function` nas três |
| 5 | `backups_migration`: RLS, zero policy, `revoke all` dos três papéis, sem `force`; `k_infra` e `k_sem_select` com motivo; INFO declarado; ida e volta verde | ◐ | CI: 6a/6b/6c, 5a–5e, 4 e 10a de `catalogo_policies`; R5 (o texto da `0159` na mesa); o INFO declarado no RUNBOOK e no §1 — medi-lo no painel é ⏳ |
| 6 | as oito com `uuid not null`, FK validada, default exatamente `public.empresa_legada()` e comentário "até a F67" — no CI e nos dois bancos | ◐ | CI: 15b (pelo `pg_depend`) e as quatro mutações `f63-lote1-*`; comentário nas duas migrations; nos bancos, `verificacao-pos-apply.sql` ⏳ |
| 7 | `count(*) = count(empresa_id) = da legada` nas oito, nos dois bancos; universo zero do ensaio declarado | ◐ | CI: 1b; o universo zero de `anotacoes`/`colaboradores` no ensaio declarado (§3, item 11); nos bancos ⏳ |
| 8 | `relfilenode` e md5 de `(id, xmin)` iguais antes × depois nas oito, nos dois bancos, com `atthasmissing` | ◐ | o instrumento provado no CI (sabotagem D: 4a/4b/4c, 3b); nos bancos ⏳ |
| 9 | o classificador lê as 157 sem lançar, trata `do` como executado, vê `$rótulo$` e `$$` em comentário, falha fechado; cabeçalho obrigatório ≥ `0159`; as regras de BACKFILL reprovam | ✅ | `migrations-backfill.test.ts` (describe 1, 2, 2-bis R1–R7, 3); o censo em `censo-cadeia.md` |
| 10 | a guarda de topo reprova `update`/`delete` de topo nas três, mesmo DESTRUTIVA, dentro de `do`, pelo leitor único; exceção nominal fechada (só `0133`) e que não cresce | ✅ | `migrations-f38.test.ts` (a sabotagem B, a exceção exaustiva e fechada, a `0133` sem a exceção vermelha) — e agora também a TROCA da tabela |
| 11 | a trava do lote 1 nasceu vermelha pelos oito nomes e está verde; reprova default literal, `drop not null`, FK `not valid`, sem a coluna | ✅ | `B-travas/catalogo-e-rollback-vermelho-ci.txt` (run `35865427382`); `C-ci-verde.txt` (as quatro mensagens, cada tabela pelo nome) |
| 12 | "ninguém lê `empresa_id` do acervo" verde e acusa o caso sintético | ✅ | `empresa-acervo-sem-leitura.test.ts` (TS, catraca por trecho, disco) e o bloco 7 (catálogo, com auto-sabotagem 7d) |
| 13 | nenhum escritor mudou: md5 do `prosrc` das 18 igual nos dois bancos; os 9 pontos TS e os scripts intocados; nenhum dos 27 roteiros precisou de `empresa_id` | ◐ | nenhuma função nas três migrations; `git diff main` sem `src/lib/actions/**`, `seed.ts`, `carga.ts`, `restaurar.mjs`; os 27 roteiros verdes sem edição de `empresa_id`; o md5 do `prosrc` nos bancos (`impressao-acervo.sql`, `escritores_sql`) ⏳ |
| 14 | as 62 policies byte a byte antes × depois, nos dois bancos | ◐ | nenhuma policy nas três migrations; `impressao-policies.sql` nos bancos ⏳ |
| 15 | describe 5 emendado, describe 9 verde, `isolamento_tenant.sql` verde, o cabeçalho diz o que a F63 preencheu e o que falta | ✅ | `catalogos-seguranca.test.ts` (describe 5 com o RECORTE nos dois sentidos, com cast e `not in`, sobre o léxico único; describe 9); `isolamento_tenant` 27 asserções no CI |
| 16 | `database.ts` com hand-fix declarado, conferido contra a geração do MCP depois do apply no ensaio; `db:types:diff` verde | ◐ | hand-fix datado (comentários F63); `db:types:diff` verde (38/347/94); a geração do MCP ⏳ |
| 17 | o conferidor de formas contra produção, depois do apply: 0 recusadas | ⏳ | passo 7 do §1 |
| 18 | a decisão do injetor na ata; mutação detectada, teto exato com porquê datado, quarentena < ⅓ | ✅ | ata, decisão 8; `mutacoes.test.mts` (teto 131 com o comentário datado); 131/131; quarentena 2/133 |
| 19 | `restauracao.sql` prova o backup sem a chave (WAP) e com a chave | ✅ | 8a/8b no CI; `restaurar-guarda.test.mts` (o INSERT com e sem a coluna, e o lote misto) |
| 20 | o rollback na ordem inversa em `supabase/rollback/F63-*.sql`, ensaiado no CI até o esquema de antes da `0159` | ✅ | `F63-desfaz.sql`; `f63_rollback.sql` rb0–rb4 (`c533eeff…` = `c533eeff…`); `f62_rollback.sql` rodando-o antes |
| 21 | advisors mudaram só no INFO declarado; paridade ensaio × produção nas 11 classes | ⏳ | passos 5 e 7 do §1 |
| 22 | nenhuma dependência nova; `.github/workflows/**` e `CLAUDE.md` da raiz intocados | ✅ | `git diff main --stat`: sem `package-lock.json`, sem `.github/`, sem `CLAUDE.md` da raiz |
| 23 | as emendas: MATRIZ, ADR-003, RUNBOOK (Anexo, BACKFILL, `add column`), PLANO (nota F63, fichas F64 e F67), `docs/README.md`, `docs/prompts/README.md`, ata | ✅ | os arquivos no diff; R-ACC-85 a 90 |
| 24 | `package.json` 1.68.0, CHANGELOG e `registry.ts`; a tag `v1.68.0` publicada — ou o motivo e o comando no topo | ◐ | versão, CHANGELOG e registro no PR (`registry.test.ts`, `cobertura-changelog.test.ts` verdes); a tag NÃO publicada — o motivo (o conector) e o comando no topo e no §1 |
| 25 | os dois PRs mergeados com os checks verdes, e a conferência pós-deploy — ou o bloqueio no topo | ⏳ | o bloqueio no topo; o PR #72 aberto e SEM merge |
| 26 | as sabotagens A a I com saída real em `docs/f63-evidencias/` | ✅ | §8 |
| 27 | nenhum dado real em migration, teste, roteiro, evidência ou log; da produção, só contagens e hashes; ninguém abriu o `.env.local` | ✅ | fixtures `WAP000…`/"Fulano"/uuids `63000000-…`; nenhuma leitura de banco vivo nesta run; nem eu nem os agentes (os prompts proíbem) abrimos `.env*` |
| 28 | o relatório no padrão F45→F62, com o roteiro do Johnny no topo | ✅ | este arquivo, §1 |
| 29 | o estado de repouso e "o que este relatório NÃO prova" | ✅ | §12 e §13 |

**Placar:** 17 ✅ · 8 ◐ · 4 ⏳ — todo ◐ e ⏳ pela mesma causa, o conector da Supabase desligado.

---

# 12. O estado de repouso

**Se o projeto parar aqui por dois meses** (o código no PR #72, sem merge, e os bancos sem a F63): nada muda para
ninguém — produção continua na `v1.67.0`, sem as colunas, e o app no ar não sabe delas. O PR fica velho: a `main` que
andar exige rebase e um CI novo antes do apply (o `migrations.lock.json` e o `DA_F38` reprovam qualquer colisão de número
de migration na mesa). Nada para desfazer.

**Se parar DEPOIS do apply e do merge** (o destino normal): as oito tabelas têm `empresa_id` preenchida com a WAP, o
default de pé, e nada a lê. Todo INSERT sem a coluna recebe a WAP — correto enquanto houver uma empresa só, e é isso
que a F67 corrige. `backups_migration` fica vazia até a primeira migration BACKFILL. O classificador passa a valer para
toda migration nova. Estado terminal válido e indefinido: sem dupla escrita, sem coluna esperando backfill, sem flag.

---

# 13. O que este relatório NÃO prova

- **Que exista isolamento entre empresas no acervo.** Não existe até a F66/F72: a coluna está lá, preenchida, e nada a
  lê — nenhuma policy, nenhuma tela.
- **Que uma linha nova de uma segunda empresa receberia a empresa certa.** O default é a WAP até a F67; um escritor que
  não informe a empresa grava WAP em silêncio.
- **Que o classificador pegue SQL dinâmico ou a escrita de uma função chamada no apply** (ou de um gatilho criado na
  própria migration, ou de um CHECK/índice que chame função que escreve). Ele é leitor estático: `execute` e a chamada
  fora da lista fechada são ILEGÍVEL (reprovam), mas uma função da lista fechada que um dia passe a escrever, ou um
  gatilho criado no arquivo, não são vistos por dentro.
- **Que a guarda de topo veja o `rename column` ou o `drop column` de uma tabela guardada.** Ela é da LINHA e da tabela
  trocada inteira; a coluna fica com o classificador (DESTRUTIVA, declarada). E o RECORTE do describe 5 é textual: a
  coluna embrulhada numa função de mais de um argumento (`coalesce(a.empresa_id, x) = v`) não é lida ali — a trava no
  banco é o bloco 7 de `empresa_no_acervo.sql`, que lê o catálogo.
- **Que a janela de produção tenha ficado sem tráfego.** Ela é contada pelo instrumento, não suposta — e, nesta run,
  nem foi medida (o conector).
- **Que a fase tenha sido aplicada em algum banco real.** Não foi (§1). O que está provado é no Postgres 17 do CI: as
  três migrations aplicam sem erro, sem reescrita, com a forma travada, com o rollback voltando ao esquema de antes.
- **Que o `apply_migration` do MCP envolva a migration numa transação.** Não medido (o conector); o desenho do
  `lock_timeout` (`set` + `reset`, `drop column if exists` no rollback) serve aos dois casos.
- **Que o hand-fix do `database.ts` seja byte a byte o que o gerador daria.** O `db:types:diff` (conjuntos) está verde;
  a conferência contra a geração do MCP depois do apply no ensaio é passo do §1.

---

# 14. Pendências e backlog nomeado

- **Desta fase (o §1):** o "antes" nos dois bancos, o apply no ensaio e em produção com as provas (a impressão, a
  verificação pós-apply, as policies, os advisors, a paridade das 11 classes), o smoke logo depois do apply de produção,
  o conferidor de formas contra produção (0 recusadas), a geração dos tipos pelo MCP conferida contra o hand-fix, o
  merge, a conferência pós-deploy, o PR de documentação e a tag `v1.68.0`.
- **F64:** as **11** tabelas de `k_negocio` ainda sem `empresa_id` (as sete da ficha — `tipos_item`, `motivos`,
  `kits_modelos`, `senhas_acesso`, `eventos_admin`, `import_logs`, `relatorios_gerados` — e as quatro do vocabulário do
  import); **a régua do default** para elas e para `filiais` (a pergunta aberta na ficha).
- **F65:** a FK composta, os `unique (empresa_id, id)` e os uniques por empresa, `guarda_empresa()` (em `ativos` o
  `update` de `empresa_id` hoje PASSA — sabotagem E), os índices liderados por `empresa_id`; e o rollback dela roda o da
  F63 depois do dela (`f63_rollback.sql` terá de rodar o da F65 antes).
- **F66:** a leitura da coluna e o recorte nas policies (a trava "ninguém lê" se inverte ali).
- **F67:** **tirar o default das oito**, com os 18 escritores SQL, os 9 pontos TS, os scripts, `restaurar.mjs`, os 27
  roteiros e os 4 pontos do `INVENTARIO-LEITURAS` — e a trava 15b invertida no mesmo commit.
- **PATCH** (do backlog da F62): derrubar `profiles.papel`/`ativo` a partir de 13/10/2026.
- **Avulso:** `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` rastreados pelo git (cópia de worktree de agente)
  — remover numa entrega própria.

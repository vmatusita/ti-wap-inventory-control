# Relatório F64 — `empresa_id` no vocabulário e na infra (lote 2), o kit na empresa do kit e o rate-limit fechado

**v1.69.0** · **migrations `0162`–`0164` aplicadas** no ensaio (19:16–19:17 UTC) e em produção (19:24–19:25 UTC) de
23/09/2026 · SHA de código congelado **`65958b5`** · código no
[PR #75](https://github.com/vmatusita/ti-wap-inventory-control/pull/75), merge **`e55c77f`** · `/api/saude` com `1.69.0` · a
tag anotada `v1.69.0` no merge do PR de documentação (§14)

> A terceira fase da virada multiempresa. As **onze** tabelas de negócio que ainda não tinham a chave de recorte —
> o vocabulário (`tipos_item`, `motivos`, `import_prefixos_patrimonio`, `import_termos_categoria`, `import_termos_estado`,
> `unidades_apelidos`) e os registros (`kits_modelos`, `senhas_acesso`, `relatorios_gerados`, `import_logs`,
> `eventos_admin`) — ganham `empresa_id uuid not null`, FK validada para `empresas` e o default `public.empresa_legada()`
> até a F67, **sem nenhum `update` e sem nenhuma tupla reescrita**. Com elas, as **20** tabelas de `k_negocio` têm a
> coluna, e a pendência que o catálogo emitia como aviso passa a REPROVAR. O kit passa a recusar, **no banco**, o motivo
> que não existe na empresa dele (gatilho `kits_modelos_motivo_da_empresa`), e a integridade ganha a 13ª checagem,
> `kit_motivo_orfao`. E o contador de tentativas da senha de visualização passa a **falhar fechado** (reverte a X4).
>
> **O portão fechou nos dois bancos:** nas onze, o `relfilenode`, o md5 de `(pk, xmin)` — com a PK **lida do catálogo**,
> porque quatro delas não têm `id` — e o md5 do conteúdo ficaram **idênticos** antes × depois, com janela 0 também em
> produção. Uma sonda nova de **exatidão** provou que o texto aplicado pelo MCP é o do arquivo, byte a byte. As 62
> policies e o advisor ficaram iguais; a paridade ensaio × produção fecha nas 11 classes; o smoke de produção logo depois
> do apply deu 109 OK · 0 falha e o conferidor de formas, **0 recusadas** em 100.530 linhas. CI do SHA congelado: run
> `35907393720` (46 roteiros, 1.045 asserções, 0 ✗; injetor 138/138; `db:types:diff` verde). Duas rodadas de revisão
> adversarial acharam três furos na trava "ninguém lê" — todos fechados antes do apply (§8).

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você, e por quê

**Nada ficou pendente.** O apply nos dois bancos, os dois merges, a conferência pós-deploy e a tag foram feitos pela
run. O que segue é conferência, só leitura.

## 1.1 O conector desligado, e a retomada

Às ~13:40 (-03) as ferramentas do conector da Supabase passaram a responder *"This tool has been disabled in your
connector settings"* (o mesmo bloqueio por ferramenta da F60 e da F63). A fase seguiu no que não dependia do banco — as
travas vermelhas, o rate-limit, as migrations, os roteiros, o injetor, os documentos, a versão — com o PR em rascunho. As
ferramentas voltaram por volta das 14:30; o "antes" foi tirado nos dois bancos (14:40 ensaio, 14:50 produção) e refeito
logo antes de cada apply, idêntico. O caminho B não foi preciso.

## 1.2 Depois do deploy (5 minutos, só leitura)

1. **Entre com a sua conta** e confira que tudo está como sempre — a fase não muda tela: **Administração** (tipos de item,
   motivos, kits, filiais e apelidos, senhas de visualização, auditoria), **Relatórios gerados** e o **import**. Criar ou
   editar um kit **com** um motivo cadastrado e **sem** motivo tem de funcionar como antes; só um motivo inexistente é
   recusado, com a frase *"O motivo deste kit não existe na empresa do kit."* (hoje não há kit cadastrado em produção).
2. **`/api/saude`** com `1.69.0` (visto às 19:33:33 UTC, commit `e55c77f`), e a **Parte B do `saude.yml`** de amanhã
   (09:43 UTC) verde, **sem issue de alarme aberta** — a de hoje, disparada à mão, já deu verde com 13 chaves (§14).
3. **O diff da fase**: `git diff v1.68.0 v1.69.0 --stat`.
   - **Tem de aparecer:** `supabase/migrations/0162`…`0164`, `supabase/migrations.lock.json`,
     `supabase/rollback/F64-desfaz.sql`, `supabase/tests/**` (novos `empresa_no_vocabulario`, `kit_motivo_da_empresa` e
     `f64_rollback`; emendados `_asserts`, `catalogo_policies`, `integridade_alarme`, `f41_regularizacao`,
     `isolamento_tenant`, `f62_rollback`, `f63_rollback`), `supabase/CLAUDE.md`, `src/lib/actions/senhas.ts` (o
     rate-limit), `src/lib/actions/erros.ts` e `src/lib/supabase/erros-do-banco.ts` (a frase do kit),
     `src/lib/actions/kits.ts` (só comentário), `src/lib/queries/dev.ts` (a checagem nova no catálogo `CHECAGENS`),
     `src/lib/types/database.ts`, os testes de `src/lib/validators/`, `src/lib/actions/` e `src/lib/itens/`,
     `scripts/db/mutacoes.mjs` e os testes de `scripts/db/`, `scripts/smoke/{linha-de-base.json,integridade.mjs,
     import-ensaio.ts}` e os testes de `scripts/smoke/`, `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`.
   - **Não pode aparecer:** `src/components/**`, `src/app/**`, `src/lib/auditoria-registro.ts`, `scripts/seed.ts`,
     `scripts/carga.ts`, `scripts/reset.ts`, `scripts/import/**`, `scripts/db/restaurar.mjs`, migration antiga alterada,
     `.github/workflows/**`, o `CLAUDE.md` da raiz, `package-lock.json`.

```bash
git diff v1.68.0 v1.69.0 --stat
```

## 1.3 Lembretes: o default cai na F67, e a PK de `motivos` muda na F65

- O default `public.empresa_legada()` das onze (e das oito do acervo, e de `filiais`) é a rede da migração, não do
  produto. Enquanto ele existir, **todo INSERT sem `empresa_id` recebe a WAP** — inclusive a trilha de auditoria
  (`eventos_admin`), que só passa a ser gravada "na origem" na F67. O orçamento está no §5.
- A PK de `motivos` (`codigo`), a FK de `movimentacoes.motivo` e as PKs naturais do import continuam **globais** até a
  F65 (decisão 2): até lá, dois motivos (ou termos, ou prefixos) de mesmo código em empresas diferentes não coexistem.

---

# 2. O que mudou, por arquivo e por quê

| arquivo | o quê | por quê |
|---|---|---|
| `supabase/migrations/0162_empresa_no_vocabulario.sql` | `empresa_id` nas seis do vocabulário (`add column … not null default public.empresa_legada() references public.empresas (id)`), comentário "o default cai na F67", `lock_timeout` 2 s por `set`/`reset`, classe ADITIVA, rollback no rodapé | a chave de recorte sem reescrever tupla (default não-volátil do PG 11+); a ordem segue a do lock do app (decisão 1) |
| `supabase/migrations/0163_empresa_nos_registros.sql` | idem nos cinco registros, `eventos_admin` por último | depois dela as 20 de `k_negocio` têm a coluna |
| `supabase/migrations/0164_kit_motivo_da_empresa.sql` | a função `kit_motivo_da_empresa()` (INVOKER, `search_path` fixo, `revoke` de `public`/`anon`/`authenticated`) e o gatilho `BEFORE INSERT OR UPDATE OF payload, empresa_id … FOR EACH ROW`; o núcleo da integridade com a 13ª peça, `kit_motivo_orfao`, sobre o corpo da `0158` **byte a byte** | a regra crítica mora no Postgres (decisões 3 e 4); no UPDATE só confere quando motivo ou empresa MUDAM — desativar um kit órfão continua possível |
| `supabase/rollback/F64-desfaz.sql` | o rollback da fase na ordem inversa (gatilho, função, núcleo de volta ao corpo da `0158`, colunas) | ensaiado no CI até a impressão de antes da `0162`; `f63_rollback.sql` e `f62_rollback.sql` rodam-no antes |
| `supabase/tests/empresa_no_vocabulario.sql` (novo) | o default, a FK, a armadilha do `update` ingênuo, o instrumento na PK natural, os escritores intactos, e o bloco 6 "ninguém lê" (6a–6e) | as sabotagens B, E, F e I |
| `supabase/tests/kit_motivo_da_empresa.sql` (novo) | C1–C9: o gatilho recusa e aceita, cada recusa provada duas vezes, a checagem conta o órfão fabricado, as 12 peças antigas por md5, a sessão de admin com RLS | a sabotagem C |
| `supabase/tests/f64_rollback.sql` (novo) | o rollback em vazio devolve a impressão de antes da `0162` e o núcleo `06359abd…` | a sabotagem H |
| `supabase/tests/_asserts.sql` | o léxico `pg_temp.sql_so_codigo` e o predicado único `pg_temp.leitura_de_empresa_do_lote` | a revisão adversarial (§8) |
| `supabase/tests/catalogo_policies.sql` | `k_lote2`, `k_leitura_integridade`, `k_tabelas_leitura_kit`; o bloco 5 com 15d–15j; a pendência da F64 REPROVA (15f); 15h sobre as dezenove | a sabotagem A e a F no catálogo |
| `integridade_alarme.sql`, `f41_regularizacao.sql`, `isolamento_tenant.sql`, `f62_rollback.sql`, `f63_rollback.sql` | 12 → 13 checagens; o cabeçalho da F64; os rollbacks encadeados | o fato 14 e a ordem de rollback |
| `src/lib/actions/senhas.ts` | `entrarComSenha` recusa quando a RPC do contador devolve erro, sem conferir senha nem criar cookie, e registra a falha sem o IP | decisão 3 do Johnny (reverte a X4) |
| `src/lib/supabase/erros-do-banco.ts`, `src/lib/actions/erros.ts` | `MSG_SQL.kitMotivoForaDaEmpresa` e o ramo antes do de FK | a recusa do gatilho chega em pt-BR |
| `src/lib/queries/dev.ts` | `kit_motivo_orfao` no catálogo curado `CHECAGENS` | a tela de Integridade conhece a chave |
| `scripts/smoke/linha-de-base.json`, `integridade.mjs`, `import-ensaio.ts` | a chave nova com 0 nos dois alvos; textos sem o número de checagens | a política do alarme conhece a chave no mesmo commit da migration (decisão 11) |
| `scripts/db/mutacoes.mjs` | sete mutações F64 (a forma da coluna no lote 2 e o kit), teto 131 → 138 | a decisão 8 |
| `src/lib/types/database.ts` | hand-fix declarado das onze colunas | conferido depois contra a geração do MCP nos dois bancos (§6) |
| testes de mesa | `senhas-rate-limit.test.ts` (novo), `senhas.test.ts`, `erros.test.ts`, `empresa-acervo-sem-leitura.test.ts`, `catalogos-seguranca.test.ts` (describe 13), `rollback-f64.test.ts` (novo), `cargo-em-membros.test.ts`, `migrations-f38.test.ts` (`DA_F38`), `cobertura.test.mts`, `alarme.test.mts`, `mutacoes.test.mts`, `diff-tipos.test.mts` | as sabotagens A, D, F, G, H, I na mesa |
| `docs/**` | PLAN-F64, a ata, MATRIZ (R-ACC-91 a 97), ADR-003, RUNBOOK (Anexo F64), PLANO-MULTIEMPRESA, índices, evidências, este relatório | a Frente F e o fecho |
| `package.json`, `CHANGELOG.md`, `registry.ts` | `1.69.0` | regra 8 |

---

# 3. Os números MEDIDOS, lado a lado com a ficha e a ordem

Os 26 fatos foram remedidos contra o disco, o git e os dois bancos (`docs/PLAN-F64.md` §1). **As dez divergências que a
ordem já trazia**, todas confirmadas pela medição:

| # | divergência da ficha | medido |
|---|---|---|
| 1 | a numeração: `0162`, não `0148` | 160 arquivos `0001`→`0161` (gap `0029`); a fase criou `0162`–`0164` |
| 2 | **onze** tabelas, não doze | faltavam as quatro do import; `filiais`/`operador_filiais` já estavam feitas (F62); `senha_tentativas`/`ambiente` são infra (`k_infra`) |
| 3 | quatro tabelas sem `id` | pelo catálogo, nos dois bancos: `motivos(codigo)`, `import_prefixos_patrimonio(prefixo)`, `import_termos_categoria(termo)`, `import_termos_estado(termo)` — o instrumento lê a PK do catálogo |
| 4 | nenhum gatilho barra o `update` ingênuo aqui | provado no roteiro (bloco 3: em `motivos` e `eventos_admin` o `update` PASSA — mesmo `relfilenode`, md5 de `(pk, xmin)` diferente — e é desfeito) |
| 5 | o default mantido até a F67 | decisão 1 do Johnny; as onze com `default_e_empresa_legada = true` pelo `pg_depend` nos dois bancos |
| 6 | "`eventos_admin` na origem" e o fim do default de `filiais` para a F67 | nenhum escritor mudou (§6, critério 13) |
| 7 | a PK de `motivos` para a F65 | decisão 2; nenhuma constraint existente mudou (paridade de constraints: 137 nos dois) |
| 8 | o rate-limit revertendo a X4 | decisão 3; `senhas-rate-limit.test.ts` |
| 9 | a leitura de `empresa_id` que o kit exige antes da F66 | as duas exceções NOMINAIS de `k_leitura_integridade`, e só por comando, com a origem provada (§8) |
| 10 | a máscara do patrimônio sem coluna nova em `empresas` | com `empresa_id` em `import_prefixos_patrimonio`, o prefixo por empresa É o dado dessa tabela |

**As divergências que a medição achou** (marcadas ⚠ no §1 do PLAN):

- **fato 1:** em PRODUÇÃO `rotulo_de_ambiente()` sem argumento não existe no catálogo; a ordem só afirmava o valor do
  ensaio (`'desenvolvimento'`). Registrado, sem ação.
- **fato 2:** o 347 de colunas do `db:types:diff` é medido, mas o teste só o pina como piso (`≥ 314`). A F64 mediu 358.
- **fato 10:** `unidades_apelidos` e `import_prefixos_patrimonio` são lidas com colunas explícitas **sem** descritor de
  forma — não veem a coluna nova, mas também não passam pelo conferidor.
- **fato 13:** a desativação do kit passa pelo MESMO `update` (`atualizarKit` grava `{ nome, payload, ativo }`) — o que
  decidiu o desenho do gatilho (só confere quando motivo ou empresa MUDAM).
- **fato 14:** mais três lugares cravavam o 12 (`cobertura.test.mts`, `integridade_alarme.sql`, o texto "doze" em
  `integridade.mjs`); e o `saude.yml:7`, fora do escopo (backlog).
- **fato 26:** o Context7 não indexa o PostgreSQL 17 — as citações da regra 6 vieram de `postgresql.org/docs/17`.
- **Achado fora do escopo:** o corpo vivo de `apagar_movimentacao` e `resetar_acervo`, IGUAL nos dois bancos, não é o texto
  da migration vigente (`0090`/`0089`). A F64 não as toca; a prova "nenhum escritor mudou" é antes × depois no mesmo banco
  (backlog, §13).

**O que esta ordem acrescentou à ficha:** o gatilho do kit NO BANCO, e não só na action; a ordem entre o apply da
checagem e o merge da linha de base (decisão 11); o instrumento pela PK do catálogo; a trava "ninguém lê" estendida ao
lote 2 (e, no catálogo, às dezenove); os rollbacks encadeados; e o smoke logo depois do apply de produção. **O que a run
acrescentou:** a sonda de exatidão do texto aplicado (§6).

---

# 4. As decisões

**As três do Johnny (23/09/2026):** (1) o default fica até a F67; (2) a PK de `motivos` e as PKs naturais do import vão
para a F65; (3) o rate-limit falha FECHADO.

**As onze da fase** (`docs/PLAN-F64.md` §3): (1) duas migrations de coluna na ordem de lock do app, mais a do kit; (2) o
lock: `lock_timeout` 2 s por `set`/`reset`, no máximo três tentativas; (3) o gatilho do kit: INVOKER, só na ENTRADA na
orfandade, 23503 com frase própria; (4) a checagem nova sobre o corpo da `0158` byte a byte; (5) o rate-limit fechado sem
o IP no registro; (6) a trava do lote 2 lida do catálogo (`k_lote2`); (7) a trava "ninguém lê" com as duas exceções
nominais por comando; (8) o injetor com sete mutações; (9) o instrumento pela PK do catálogo; (10) o describe 5 e o 12;
(11) a ordem do alarme (linha de base e `CHECAGENS` no mesmo commit da migration, merge logo depois das provas).

**A ata** (`docs/DECISOES.md`, 2026-09-23 · F64): (a) o conector desligado e religado; (b) o describe 9 mede o estado
que a F62 deixou; (c) os contadores de checagem; (d) o C5-bis, universo 2; (e) o corpo vivo de duas escritoras;
(f) `rotulo_de_ambiente()` em produção; (g) o Context7 sem PG 17; (h) e (i) as duas rodadas da revisão adversarial;
(j) o apply e o fecho.

---

# 5. O censo dos escritores e leitores das onze — o orçamento da F67 (a fase NÃO o executa)

Detalhe em `docs/PLAN-F64.md` §2. Em resumo:

- **SQL:** 9 funções escrevem nas onze — oito em `eventos_admin` (`apagar_ativo`, `apagar_item`,
  `apagar_ativos_conflito_filiais`, `apagar_movimentacao`, `forcar_estado_ativo`, `forcar_saldo_item`, `resetar_acervo`,
  `resetar_itens`) e `import_gravar_trilha` em `import_logs`. Nenhum `update`/`delete` direto sobre as onze no
  repositório. Leitores SQL: `rel_por_motivo_filiais`, `rel_resumo_filiais` e o núcleo da integridade.
- **TypeScript:** `tipos-item.ts`, `admin.ts` (motivos), `kits.ts`, `senhas.ts`, `relatorios.ts`,
  `unidades-apelidos.ts`; `eventos_admin` só por `auditoria-registro.ts` (15 chamadas de `registrarEventoAdmin`). 44
  cadeias `.from` de leitura, todas com lista explícita.
- **Roteiros:** a tabela do fato 8 — nenhum deles mudou (a sabotagem E é o CI verde sem tocá-los).

A F67 tira o default e faz cada um desses informar a empresa; **antes de reescrever `apagar_movimentacao` e
`resetar_acervo`, ela compara `pg_get_functiondef` do banco com o arquivo** (o achado do §3).

---

# 6. O apply e as provas, nos dois bancos

**O canal:** o MCP da Supabase, `apply_migration`, uma chamada por migration, com o texto EXATO do arquivo no SHA
congelado e o nome sem prefixo (`empresa_no_vocabulario`, `empresa_nos_registros`, `kit_motivo_da_empresa`). Ensaio
19:16:22–19:17:53 UTC; produção 19:24:15–19:25:48 UTC. **Nenhum `lock_timeout` disparou** — as seis aplicações entraram
na primeira tentativa. `notify pgrst, 'reload schema'` depois da `0164`, nos dois.

**A exatidão do texto aplicado** ([`exatidao-pos-apply.sql`](f64-evidencias/exatidao-pos-apply.sql), esperado em
[`depois/exatidao-esperada.json`](f64-evidencias/depois/exatidao-esperada.json), calculado dos arquivos): o md5 dos 11
comentários de coluna, do `prosrc` e do comentário das duas funções — **iguais** nos dois bancos (`kit_motivo_da_empresa`
`6f079b4c…`, o núcleo `e26dec80…`). A função do gatilho sem EXECUTE para `anon`/`authenticated`; o núcleo segue fechado a
todo papel da API.

**A impressão das onze** ([`impressao-vocabulario.sql`](f64-evidencias/impressao-vocabulario.sql), o mesmo texto nas
seis rodadas; o "antes" refeito logo antes de cada apply, idêntico ao das 14:40/14:50):

| tabela (PK do catálogo) | ensaio: linhas · `relfilenode` | produção: linhas · `relfilenode` | md5 `(pk, xmin)` e md5 do conteúdo | janela |
|---|---|---|---|---|
| `tipos_item` (`id`) | 7 · 25434 | 10 · 19945 | **iguais** antes × depois, nos dois | 0 · 0 |
| `motivos` (`codigo`) | 13 · 17705 | 14 · 17771 | **iguais** | 0 · 0 |
| `import_prefixos_patrimonio` (`prefixo`) | 7 · 34817 | 7 · 20951 | **iguais** | 0 · 0 |
| `import_termos_categoria` (`termo`) | 5 · 34792 | 5 · 20926 | **iguais** | 0 · 0 |
| `import_termos_estado` (`termo`) | 17 · 34804 | 17 · 20938 | **iguais** | 0 · 0 |
| `unidades_apelidos` (`id`) | 14 · 34770 | 13 · 20904 | **iguais** | 0 · 0 |
| `kits_modelos` (`id`) | 0 · 18193 (vazia) | 0 · 18677 (vazia) | `vazia` = `vazia` | 0 · 0 |
| `senhas_acesso` (`id`) | 1 · 17778 | 5 · 17844 | **iguais** | 0 · 0 |
| `relatorios_gerados` (`id`) | 1 · 17826 | 13 · 17953 | **iguais** | 0 · 0 |
| `import_logs` (`id`) | 4 · 18057 | 12 · 18390 | **iguais** | 0 · 0 |
| `eventos_admin` (`id`) | 9 · 18583 | 102 · 18966 | **iguais** | 0 · 0 |

O `relfilenode` igual **SEM EXCEÇÃO** nos dois bancos, e os dois md5 idênticos também em produção — a janela não
precisou explicar nada (0 linha escrita pelo app nas onze entre o "antes" e o "depois"). Depois do apply, as onze com
`uuid · not null=t · atthasmissing=t`. As 9 escritoras: o mesmo md5 agregado do `prosrc` (`5bbe6d79…`) antes e depois, e
`registrar_tentativa_senha` `0c2abf7d…`, nos dois bancos — critério 13. O núcleo: 12 → 13 peças, as 12 antigas com o
md5 de cada uma igual ao de antes, e a 13ª `48450ab8…`, a mesma do CI.

**A verificação pós-apply** ([`verificacao-pos-apply.sql`](f64-evidencias/verificacao-pos-apply.sql)): nas onze, nos dois
bancos, `uuid` · `not null` · `atthasmissing` · o default preso a `public.empresa_legada()` pelo `pg_depend` · a FK para
`empresas` validada · o comentário dizendo F67 — tudo `true`; `count(*) = count(empresa_id) = da legada` em todas
(produção: 10 · 14 · 7 · 5 · 17 · 13 · 0 · 5 · 13 · 12 · 102); **20 de 20** tabelas de `k_negocio` com a coluna; o
gatilho BEFORE, por linha, INSERT + UPDATE OF (`empresa_id`, `payload`), INVOKER, `search_path=public`; o núcleo com **13
chaves** e `kit_motivo_orfao` = **0**. O universo zero de `kits_modelos` (vazia nos dois bancos) está declarado — a prova
do gatilho e da checagem com dado vem do CI (C1–C9).

**O resto das provas:**

| prova | ensaio | produção |
|---|---|---|
| as 62 policies ([`impressao-policies.sql`](f64-evidencias/impressao-policies.sql)) | `public` 54 · `886118ad…`, Storage 8 · `f116b8d0…`; das onze, 22 policies e 0 citam `empresa_id`; das vinte, 49 e 0 — **iguais ao antes** | idem, **iguais ao antes** |
| advisor de segurança | 6 INFO `rls_enabled_no_policy` · 34 WARN definer · 1 WARN Auth — **igual ao antes** (a função nova é INVOKER e não soma) | idem — **igual ao antes** |
| paridade ensaio × produção (`supabase/ci/impressao-schema.sql`) | as **11 classes iguais** em contagem e fingerprint (350 colunas · 137 constraints · 7 enums · 103 funções · 103 grants · 98 índices · 54 + 8 policies · 28 flags de RLS · 11 gatilhos · 9 views) | |
| tipos pelo MCP | md5 `81dbde89…`; contra o `database.ts`, iguais fora os 27 comentários de hand-fix e o `Insert` de `operador_filiais` (a exceção da F62, ata (m); a mesma da F63) — nenhum commit de tipos | md5 `81dbde89…` — idêntico ao do ensaio |
| smoke de produção logo depois do apply | | **109 OK · 1 aviso · 0 falha** (o aviso antigo de `kits_modelos`), com o app 1.68.0 lendo o esquema novo |
| conferidor de formas | | **271 pontos · 100.530 linhas · 0 recusadas · 0 reprovados** (os mesmos 3 descritores sem linha da F63) |

Evidência: [`antes/`](f64-evidencias/antes/) e [`depois/`](f64-evidencias/depois/) (`ensaio.json`, `producao.json`, as
duas impressões, `smoke-prod-pos-apply.txt`, `conferidor-producao.json`) — só contagens e hashes.

---

# 7. As sabotagens, com a saída real

| | o quê | onde está a saída | resultado |
|---|---|---|---|
| **A** | o lote 2: vermelho pelos onze nomes antes das migrations; verde depois; default literal, sem `not null`, FK `not valid` e sem a coluna → vermelho, cada um pelo nome (as quatro mutações `f64-lote2-*`); a pendência REPROVA (15f) | [`B-travas/catalogo-kit-rollback-vermelho-ci.txt`](f64-evidencias/B-travas/catalogo-kit-rollback-vermelho-ci.txt) (run `35894254468`); [`C-ci-verde.txt`](f64-evidencias/C-ci-verde.txt) (15d–15j e as mutações) | como esperado |
| **B** | o instrumento na PK natural: fixture com PK `text`; as quatro sem `id` pela PK do catálogo | `C-ci-verde.txt` (bloco 4 de `empresa_no_vocabulario`); a impressão real nos dois bancos (§6) | como esperado |
| **C** | o kit: motivo inexistente e de outra empresa → 23503, com o dado intacto como `postgres`; sem motivo e com o da própria empresa → aceito; desativar órfão → aceito; a checagem conta o órfão fabricado; pela sessão de um admin com RLS; `f64-kit-sem-gatilho`, `f64-kit-gatilho-sem-empresa`, `f64-checagem-sem-empresa` acusadas | vermelho: `B-travas/catalogo-kit-rollback-vermelho-ci.txt`; verde: `C-ci-verde.txt` (C1–C9) | como esperado (o injetor achou o universo errado do C5-bis — ata (d)) |
| **D** | o rate-limit: RPC do contador com erro → recusa, sem conferir senha nem cookie, sem IP no registro; a volta ao `const { data: excedeu }` → a trava estática acusa | vermelho: [`B-travas/mesa-vermelho.txt`](f64-evidencias/B-travas/mesa-vermelho.txt); verde: [`A-D-F-G-H-I-mesa.txt`](f64-evidencias/A-D-F-G-H-I-mesa.txt) | como esperado |
| **E** | o default: INSERT sem `empresa_id` nas onze → WAP; empresa inexistente → 23503; os roteiros do fato 8 passam sem nenhuma edição | `C-ci-verde.txt` (blocos 1 e 2) e o RESUMO (46 roteiros verdes) | como esperado |
| **F** | ninguém lê: TS (`.eq`/`.select` sobre `eventos_admin` e `senhas_acesso`), disco (a exceção lendo outra tabela, a variável de registro, o `is distinct from`) e catálogo (a auto-sabotagem 1/1, a exceção recriada com um comando a mais acusada, o léxico 6d, a origem 6e) | `A-D-F-G-H-I-mesa.txt`; `C-ci-verde.txt` (15g–15i, 6a–6e) | como esperado — e a revisão adversarial achou três furos, fechados (§8) |
| **G** | a chave nova e o alarme: a chave nos três lugares (`CHECAGENS`, linha de base, cobertura), vermelha antes; a política de hoje × a nova; as 12 peças por md5 | vermelho: `B-travas/mesa-vermelho.txt` e [`mesa-vermelho-ci.txt`](f64-evidencias/B-travas/mesa-vermelho-ci.txt); verde: `A-D-F-G-H-I-mesa.txt`; a Parte B real (§14) | como esperado |
| **H** | o rollback: a impressão pré-`0162` medida no push das travas; o `F64-desfaz.sql` a devolve no CI; `f63`/`f62_rollback` rodam o da F64 antes; a completude na mesa (`rollback-f64.test.ts`) | `C-ci-verde.txt` (`f64_rollback` 5 · `f63_rollback` 5 · `f62_rollback` 4, 0 falha) | como esperado |
| **I** | nenhum escritor mudou: o md5 do `prosrc` das 10 funções contra a constante do arquivo no CI; antes × depois nos dois bancos; a mesa (o corpo vigente de cada uma na migration de antes) | `C-ci-verde.txt` (bloco 5); §6 | como esperado |

---

# 8. A revisão adversarial

**Primeira rodada (sobre `df11b3f`):** sete revisores de contexto fresco, lentes separadas; seis sem achado. O das
travas trouxe dois, votados por céticos instruídos a refutar: **confirmado** — a exceção do kit isentava a FUNÇÃO inteira
no catálogo (15h e o bloco 6), enquanto a decisão 7 diz "por comando"; **refutado** — o `--` dentro de texto escondendo a
leitura (nenhum corpo vivo tem a forma). Conserto em `8f93106`: o léxico e o predicado únicos em `_asserts.sql`, 6c e 6d
(ata (h)).

**Segunda rodada (sobre `8f93106`, SHA dado aos céticos):** três lentes (PL/pgSQL, semântica, travas); a de PL/pgSQL sem
achado; **dois confirmados** (2 de 2 votos cada):

1. a trava negativa do describe 13 só reconhecia o alias `c.` que o conserto anterior aposentou — a isenção pela função
   inteira voltaria com outro alias. Agora ela lê o TRECHO de 15h, com a própria sabotagem na mesa;
2. nas exceções, o idioma do próprio repositório `select * into v from public.eventos_admin …; if v.empresa_id …` partia
   a leitura em dois comandos e escapava do SQL e do disco. Agora, nas exceções, cada `x.empresa_id` resolve `x` no
   próprio comando para uma tabela do kit ou de fora dos lotes; `new`/`old` só com o gatilho da função numa tabela do kit;
   o que não se prova ACUSA.

A sonda de regex no ensaio (só literais fictícios, só leitura) achou um **terceiro** furo antes do commit — `p is
distinct from v.empresa_id` fazia `v` parecer tabela — fechado lendo a declaração sem o `distinct from`. De carona: 15h
passa a cobrir as **dezenove** (a decisão 7 já dizia dezenove; o bloco 6 da F63 isenta o núcleo pelo nome) e a caixa
deixa de esconder. Conserto em `65958b5`, 6e no roteiro, sete casos novos na mesa (ata (i)). Não houve terceira rodada:
o limite que sobra (o SQL dinâmico) está declarado no §12.

---

# 9. A contagem final, antes × depois

| | antes (v1.68.0) | depois (v1.69.0) |
|---|---|---|
| migrations | 160 (`0001`→`0161`) | **163** (`0162`–`0164`) |
| tabelas de negócio com `empresa_id` | 9 de 20 | **20 de 20** |
| checagens de integridade | 12 | **13** (`kit_motivo_orfao`, 0 nos dois bancos) |
| testes de mesa | 252 arquivos · 7.600 testes | **254 arquivos · 7.693 testes** |
| roteiros SQL | 43 · 1.002 asserções | **46 · 1.045 asserções** |
| injetor | 131/131 + 2 quarentena | **138/138** + 2 quarentena (< ⅓) |
| `db:types:diff` | 38 · 347 · 94 | **38 · 358 · 94** |
| policies | 62 (54 + 8) | **62**, byte a byte |
| advisor | 6 INFO · 34 WARN · 1 WARN | **igual** |
| gatilhos em `public` (paridade) | 10 | **11** |
| funções em `public` (paridade) | 102 | **103** |
| linha de base | — | só a chave NOVA, com 0; nenhum número subiu |

---

# 10. Os 28 critérios, autoverificados

1. ✅ `lint`, `test` (254 · 7.693), `typecheck`, `build`, `contraste`, `verificar:actions` limpos no SHA congelado; no CI,
   `verificar` e `banco-sem-docker` verdes (run `35907393720`) com os roteiros, o injetor e o `db:types:diff`.
2. ✅ `PLAN-F64.md` com os 26 fatos, o censo, o desenho, as onze decisões, a ordem e a ordem de rollback — commitado
   (`f498864`, `f88f5fb`) antes do primeiro commit em `supabase/`, `src/` ou `scripts/` (`6f3a38c`).
3. ✅ o "antes" das onze, das policies e do advisor nos dois bancos, antes de qualquer apply, só contagem e hash, pela PK
   do catálogo, em `docs/f64-evidencias/antes/`.
4. ✅ `0162`–`0164`, cabeçalho de classe validado pelo classificador, rollback no rodapé, `db:lock` no mesmo commit,
   `DA_F38`; sem `update` de topo, sem janela destrutiva, sem nome repetido, sem constraint alterada, e só as duas funções
   previstas.
5. ✅ a forma das onze no CI (15e) e nos dois bancos (§6).
6. ✅ as três contagens iguais nas onze nos dois bancos; o universo zero de `kits_modelos` declarado, a prova no CI.
7. ✅ `relfilenode` e md5 de `(pk, xmin)` iguais nas onze nos dois bancos, `atthasmissing = true`; idênticos no ensaio e
   em produção (janela 0).
8. ✅ 20/20; a trava nasceu vermelha pelos onze nomes e está verde; reprova as quatro formas erradas; a pendência reprova.
9. ✅ o gatilho recusa inexistente e de outra empresa, aceita sem motivo e com o da própria; desativar órfão passa; cada
   recusa provada duas vezes; a frase em pt-BR via `erros.ts`.
10. ✅ a checagem nova com 0 nos dois bancos, acusando o órfão fabricado no CI; em `CHECAGENS`, na linha de base (0 nos
    dois alvos) e na cobertura; as 12 peças byte a byte.
11. ✅ `entrarComSenha` recusa com o erro da RPC, sem senha, sem cookie, sem IP; teste de mesa e trava estática verdes.
12. ✅ a trava cobre o lote 2 e acusa os sintéticos; as duas exceções nominais, numa fonte só (e por comando, com a
    origem provada).
13. ✅ o md5 das 10 funções igual antes × depois nos dois bancos; os pontos TS intocados (fora a frase do kit e o
    rate-limit); nenhum roteiro precisou de `empresa_id`.
14. ✅ as 62 policies byte a byte nos dois bancos.
15. ✅ o describe 5 emendado; os describes 9 e 12 verdes; `isolamento_tenant.sql` verde com o cabeçalho da F64.
16. ✅ o hand-fix declarado, conferido contra a geração do MCP nos dois bancos depois do apply; `db:types:diff` verde.
17. ✅ smoke logo depois do apply com 0 falha; conferidor contra produção com 0 recusadas.
18. ✅ a decisão do injetor na ata (decisão 8); as sete mutações detectadas; teto 138 com o porquê datado; quarentena 2.
19. ✅ `F64-desfaz.sql` na ordem inversa, ensaiado no CI até a impressão pré-`0162`; `f63`/`f62_rollback` rodam-no antes,
    verdes.
20. ✅ advisor igual nos dois bancos; paridade fecha nas 11 classes.
21. ✅ nenhuma dependência nova; `.github/workflows/**` e o `CLAUDE.md` da raiz intocados; nenhum número da linha de base
    subiu.
22. ✅ MATRIZ (R-ACC-91 a 97, a 96 emendada no fecho), ADR-003, RUNBOOK (Anexo F64), PLANO-MULTIEMPRESA, `docs/README.md`,
    `docs/prompts/README.md` e a ata.
23. ✅ `package.json` em `1.69.0`, `CHANGELOG.md` e `registry.ts`; a tag `v1.69.0` no merge do PR de documentação (§14).
24. ✅ os dois PRs mergeados com os dois checks verdes; conferência pós-deploy feita (§14).
25. ✅ as sabotagens A a I com saída real (§7).
26. ✅ nenhum dado real em migration, teste, roteiro, evidência ou log (o único patrimônio nas evidências é o fictício
    `WAP0001234`); da produção, só contagens e hashes. Ninguém abriu o `.env.local` — a credencial dos scripts foi por
    `--env-file` e pelo próprio smoke.
27. ✅ este relatório, no padrão F45→F63, com o roteiro no topo.
28. ✅ o estado de repouso (§11) e o "não prova" (§12).

---

# 11. O estado de repouso

- **`main`** em `e55c77f` (código) e, depois do PR de documentação, no merge dele, com a tag anotada `v1.69.0`.
- **Produção e ensaio** com as `0162`–`0164` aplicadas, o ledger terminando em `kit_motivo_da_empresa`, a paridade de
  esquema fechada; o app em `1.69.0`.
- **Nada aberto:** nenhum PR da fase aberto, nenhuma branch com trabalho não mergeado, nenhuma issue de alarme; o rollback
  pronto em `supabase/rollback/F64-desfaz.sql` (não aplicado — não foi preciso).
- **O default** `public.empresa_legada()` segue em 20 tabelas de negócio até a F67; **nada lê** a coluna para recortar
  (só as duas leituras de integridade do kit).

---

# 12. O que este relatório NÃO prova

- **Que exista isolamento entre empresas** em qualquer das 20 tabelas: não existe até a F66 (o recorte) e a F72.
- **Que uma linha nova de uma segunda empresa receba a empresa certa:** o default é a WAP até a F67 — um escritor que
  esqueça a empresa grava na WAP em silêncio.
- **Que dois motivos, tipos ou termos de mesmo código em empresas diferentes possam coexistir:** as PKs e os uniques
  globais ficam até a F65.
- **Que a porta pública esteja por empresa:** `senhas_acesso.empresa_id` existe e ninguém a lê até a F68.
- **Que a janela de produção tenha ficado sem tráfego:** o app antigo rodou ~7 min 45 s sobre o esquema novo. A janela 0
  prova só que ele não ESCREVEU nas onze nesse intervalo; o smoke e o conferidor rodaram dentro dela e passaram.
- **Que o gatilho do kit tenha sido exercitado com dado real:** `kits_modelos` está vazia nos dois bancos; a prova com
  dado é do CI (C1–C9).
- **Que a trava "ninguém lê" veja SQL dinâmico:** texto entre aspas (`execute 'select … empresa_id …'`) não conta como
  leitura em nenhuma das travas — o mesmo corte do leitor único de disco. E, fora das exceções, a trava de disco ainda
  trabalha por comando (a variável de registro de uma função comum lá não é vista); quem cobre esse caso é o catálogo,
  que reprova a função inteira.
- **Que o corpo vivo de `apagar_movimentacao` e `resetar_acervo` seja o do arquivo:** não é (§3); a F64 prova só que ele
  não mudou.

---

# 13. Pendências e backlog nomeado

- **F65:** a PK de `motivos` e a FK composta de `movimentacoes`; as PKs naturais do import; os uniques por empresa
  (`tipos_item.slug`, `kits_modelos_nome_uidx`, `unidades_apelidos_apelido_chave_uidx`, o do snapshot de
  `relatorios_gerados`); a FK composta, `guarda_empresa()` e os índices liderados por `empresa_id`; o rollback dela rodando
  antes do da F64.
- **F66:** a leitura da coluna e o recorte nas policies das 20 — e, com ele, o fim das exceções nominais da trava "ninguém
  lê" (a trava vira "todo mundo recorta").
- **F67:** tirar o default das oito do acervo, das onze e de `filiais`, com o orçamento do §5 e o da F63; o *"eventos_admin
  na origem"* (`auditoria-registro.ts` e as oito funções); a ponte de `papel_atual()`/`EMPRESA_LEGADA_ID`; e, antes de
  recriar `apagar_movimentacao`/`resetar_acervo`, comparar `pg_get_functiondef` do banco com o arquivo.
- **F68:** a porta pública, a senha por empresa (`senhas_acesso.empresa_id` lida), a varredura linear de `entrarComSenha`,
  as recusas iguais e o teto por `(empresa, origem)`.
- **PATCH** (do backlog da F62): derrubar `profiles.papel`/`ativo` a partir de 13/10/2026. E, desta fase: o texto "doze"
  no `saude.yml:7` (workflow, fora do escopo aqui); alinhar o bloco 6 de `empresa_no_acervo.sql` (F63, ainda isenta o
  núcleo pelo nome — hoje coberto pelo 15h nas dezenove) e a trava de disco para a variável de registro fora das exceções.
- **Avulso** (do backlog da F63): `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` rastreados pelo git. E, desta
  fase: investigar (só leitura, `pg_get_functiondef` × arquivo) por que o corpo vivo de `apagar_movimentacao` e
  `resetar_acervo` diverge da `0090`/`0089` nos dois bancos.

---

# 14. O merge, o deploy e a conferência pós-deploy

- **PR #75** (código): saiu do rascunho depois das provas; merge normal **`e55c77f`** às 19:32:31 UTC com `verificar` e
  `banco-sem-docker` verdes no head `65958b5` (o SHA congelado).
- **A janela apply × deploy:** a `0164` entrou no ledger de produção às 19:25:48 UTC; o app novo respondeu no `/api/saude`
  às 19:33:33 UTC — **~7 min 45 s**. **Nenhuma Parte B caiu dentro dela** (a agendada é às 09:43 UTC).
- **`/api/saude`:** `{"ok":true,"versao":"1.69.0","commit":"e55c77f","banco":"ok"}`.
- **Smoke de produção** (`SMOKE_VERSAO_ESPERADA=1.69.0`): **109 OK · 1 aviso · 0 falha**.
- **Parte B à mão** (run `35910220738`): **verde** — 13 chaves, todas dentro da linha de base, a nova conhecida; deriva
  sem pendente, a `0164` no topo do ledger.
- **PR de documentação:** a evidência pós-deploy, este relatório, o PLAN (§0 e §7), a ata (j), a R-ACC-96 e os índices;
  merge com os dois checks verdes e a **tag anotada `v1.69.0`** no merge dele, publicada.

Evidência: [`depois/pos-deploy.md`](f64-evidencias/depois/pos-deploy.md) e [`depois/smoke-prod.txt`](f64-evidencias/depois/smoke-prod.txt).

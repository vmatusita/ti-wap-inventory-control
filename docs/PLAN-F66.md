# PLAN-F66 — As policies ganham o recorte, em conjunção

Ordem: [`prompts/F66-policies-ganham-o-recorte-ultracode.md`](prompts/F66-policies-ganham-o-recorte-ultracode.md) (os 28
fatos no cabeçalho, as três decisões do Johnny de 24/09/2026). Ficha: `PLANO-MULTIEMPRESA.md` §7 → F66. Branch
`f66-policies-ganham-o-recorte`, versão **1.71.0**. Escrito em 24/09/2026, **antes** do primeiro commit que toca
`supabase/`, `src/` ou `scripts/` — com o "antes" já tirado nos dois bancos (§0).

> **Em uma frase.** As 51 policies de `public` cuja tabela tem `empresa_id` ganham, por `alter policy` literal e em
> CONJUNÇÃO com o piso de hoje, o termo `empresa_id = any (array (select public.<fn>()))` com a função da CLASSE da
> policy; as 6 de escrita por unidade trocam `pode_escrever_filial(filial_id)` pela forma de PARES sobre
> `unidades_de_escrita()`; as duas `rel_*` juntam `motivos` pelo par `(empresa_id, codigo)`; **nenhum índice** entra
> nem sai (a medição mostrou que o plano não os usa sob o `= any` — §3); e a prova conta a conta dá 0 divergência antes
> (emulada) e depois de cada lote (real), nos dois bancos.

---

## 0. O "antes" — tirado na Frente A (24/09/2026), antes de qualquer apply

Tudo pelo MCP da Supabase, **só leitura, só catálogo, contagem, texto de esquema e hash**. Nenhum id, nome, e-mail,
código de motivo, slug ou texto de linha saiu de consulta nenhuma.

| o quê | onde | ensaio | produção |
|---|---|---|---|
| as policies (`impressao-policies.sql`) | `f66-evidencias/antes/policies-{ensaio,producao}.json` | 54 + 8; `vivas` `886118ad…`/`f116b8d0…` — **o md5 do "depois" da F65** (ninguém mexeu em policy entre as fases); 51 com a coluna; **0** citam `empresa_id`; 6 citam `pode_escrever_filial`; **62 `to authenticated`**; as 11 que não mudam `eb294504…` | **idêntico ao ensaio, byte a byte** (os dois JSON são iguais) |
| o catálogo (`impressao-catalogo.sql`) | `f66-evidencias/antes/catalogo-{ensaio,producao}.json` | relfilenode das 22 `293d2945…`; 96 índices (47 não-únicos) `42537da2…`; 105 funções `abf6a4b1…`; sem as duas `rel_*` `75d18f23…` | relfilenode `ba90992244…`; índices e funções **iguais ao ensaio** |
| os advisors | `f66-evidencias/antes/advisors.json` | segurança 6 INFO · 34+1 WARN; performance 39 · 1 · **11** unused · 1 WARN | segurança 6 · 34+1; performance 39 · 1 · **8** unused · 1 WARN — **o fato 3, exato**; nenhum `auth_rls_initplan` |
| o custo da RLS (`medir-rls.mjs`, F0 × F4) | `perf/f66-rls-{ensaio,producao}-antes.json` | `ativos` F0 0,737 ms · F4 1,266 ms; `movimentacoes` 1,113 · 1,779 | `ativos` 1,380 · 2,055; `movimentacoes` 2,425 · 3,627 (mediana, N = 9) |
| o TTFB de produção (`medir.mjs`) | `perf/f66-producao-ttfb-antes.json` | — | 19 rotas, N = 11: `/ativos` 339,7 / p95 371,3 ms · `/movimentacoes` 333,4 / 404,8 · `/relatorios/geral` 521,2 / 603,9 |
| a prova conta a conta EMULADA (`conta-a-conta.mjs`) | `f66-evidencias/conta-a-conta/` | **0 divergência** — 3 memberships · 21 tabelas · 18 pares · 63 leituras; a sabotada: **2** (1 de escrita, 1 de leitura) | **0 divergência** — 14 memberships · 21 tabelas · 84 pares · 294 leituras · 0 corrida |

**O canal.** O `execute_sql` do MCP devolve o erro inline e o **trunca no meio** quando ele é grande — e os blocos de
medição e de prova devolvem o resultado justamente no erro (`raise exception`, para nunca se confirmarem). Medido na
primeira tentativa: a resposta do `medir-rls` chegou com 116.215 caracteres cortados. A saída (decisão 14): (1) o
**enchimento do canal** — `'_canal', repeat('.', 120000)` no payload e nas duas impressões —, que faz a resposta grande
cair em arquivo (`tool-results`), de onde a evidência é **extraída por script, nunca transcrita**; (2) o **invólucro do
canal** (`involucroDoCanal`, em `scripts/perf/conta-a-conta.mjs`): o bloco validado roda BYTE A BYTE dentro de uma
subtransação (`execute` num `begin … exception`), a mensagem vai para uma configuração local à transação e o `select`
seguinte a devolve como RESULTADO. O bloco continua nunca se confirmando (a subtransação aborta); o invólucro não
escreve em tabela nenhuma.

---

## 1. Os 28 fatos, remedidos

Remedidos em 24/09/2026 contra o disco, o git e os dois bancos (sete leitores paralelos e a mesa). `=` confirma; `⚠`
diverge, com o número medido — **a medição ganha**.

| # | o fato diz | medido | |
|---:|---|---|---|
| 1 | `origin/main` `3f7a642`, tag `v1.70.0`, 1.70.0; última `0174`; ledger 158 × 171; PG 17.6; primeira da fase `0175` | igual (`git`, `list_migrations`, `version()` = 17.6, `row_security = on`) | = |
| 2 | 256 arquivos · 7.862 testes; 51 roteiros · 1.095 asserções; injetor 143/143 · 2 em quarentena; tipos 38 · 358 · 94 | 256 · 7.862 (mesa, 24/09 09:47); 51 roteiros; `MUTACOES.length` 143, teto 143, `QUARENTENA` 2 | = |
| 3 | advisors: segurança 6/34/1; performance 39/1/8/1 WARN; nenhum `auth_rls_initplan` | produção exata; o ensaio tem **11** `unused_index` (outra lista — tráfego) | = (ensaio ≠ por tráfego) |
| 4 | 62 policies (54 + 8), todas `to authenticated` | 54 + 8; **62 `{authenticated}`, 62 permissivas**; texto idêntico nos dois bancos | = |
| 5 | as classes; 51 recebem o recorte; 3 sem a coluna | 20 piso · 3 cargo · 4 `pode_escrever` · 17 `e_admin` · 6 `pode_escrever_filial` · 3 termo · 1 perfil = 54; **22 tabelas com a coluna**, 21 com policy (a 22ª, `senhas_acesso`, é deny-all) → **51** | = |
| 6 | as quatro funções de conjunto existem, `setof`, definer, `search_path = ''`, anon revogado | igual; md5 do `prosrc` igual nos dois bancos; o comentário de cada uma diz "sem consumidor até a F66" | = |
| 7 | a ponte: `papel_atual()` só pela empresa legada | `pg_get_functiondef` confirma `m.empresa_id = public.empresa_legada()` | = |
| 8 | inércia: 1 empresa; 0 linha de outra; produção 14 ativas (5 op · 5 cons · 2 adm · 2 dev) + 2 inativas; 5 operadores com vínculo, 25 vínculos, 6 filiais | igual; **ensaio: 3 memberships ativas, 6 filiais, nenhum OPERADOR com vínculo** (o único vínculo é de um admin, 5 linhas) | = |
| 9 | `pode_escrever_filial` × `unidades_de_escrita`: a desativada entra; `fid` inexistente é a única diferença | igual (os dois corpos lidos, iguais nos dois bancos) | = |
| 10 | a doutrina: 18 exceções, 6 → F66; `alter policy` literal | `k_excecoes_predicado` 18; a mesa consome `alter policy` com `using` e `with check` (substitui cada cláusula presente) | = |
| 11 | o `->>` do snapshot na forma de pares | **provado na árvore**: com o texto-alvo aplicado na mesa, `11a`/`13b` verdes (o `->>` é `OPEXPR`, o `::smallint` é `COERCEVIAIO`, a referência à linha fica fora do sub-select); na mesa TS, caso novo no `predicado-policies.test.mts` | = |
| 12 | cinco lugares dizem "nenhuma policy cita `empresa_id` antes da F66" | ⚠ **sete**: os cinco da ordem (15g/15h/15i, 7a, os describes de `catalogos-seguranca.test.ts`, a catraca TS, o cabeçalho de `isolamento_tenant.sql`) **mais as duas auto-sabotagens** que contam policy que cita a coluna: `7d` de `empresa_no_acervo.sql` e `6b` de `empresa_no_vocabulario.sql` (esperavam `1/1`; com o recorte, acusariam 23/22) | ⚠ |
| 13 | `isolamento_tenant.sql` prova 9a–9k, sem leitura de acervo | igual, e tem ainda 9l, 9m, 9n, 9o | = |
| 14 | os índices de lista e o `idx_scan` (produção, desde 29/06) | `movimentacoes_data_ordem_idx` 42.170 (+781 desde a ordem); `ordem_lista` 18.227; `mov_created` 4.072; `lanc_item_created` 793; `eventos_admin_quando` 209; `import_logs_created` 187 — deriva de tráfego; `/ativos` sem índice de `updated_at` (confirmado por catálogo e plano) | = (deriva) |
| 15 | 39 FKs sem índice, 22 compostas da F65 | 39; **24** são compostas com `empresa_id` à frente — 22 da `0166`/`0167` e 2 de outras (`movimentacoes_motivo_fkey`, 0168; `operador_filiais_filial_da_empresa_fk`, F62) | = (com a nuance) |
| 16 | o join por código das `rel_*` | um só `left join public.motivos mo on mo.codigo = m.motivo` em cada corpo (`0143:232`/`:265`); md5 do corpo do arquivo = o de produção. ⚠ **`equivalencia-rel.mjs` não serve como está**: o `MODELO` mapeia cada nova para a VELHA de outro nome (`rel_por_motivo`, `rel_resumo`), que a `0145` derrubou — a F66 recria o MESMO nome; o instrumento ganha o modo `mesmo-nome` (decisão 9). E ⚠ as duas **não são intocáveis** (`INTOCAVEIS` não as lista): `RECRIACOES_AUTORIZADAS` não é exigida — entra mesmo assim, exaustiva, pelo precedente da `0134` | ⚠ |
| 17 | nove views `security_invoker` | nove; só `v_conflitos_filiais`/`_grupos` agregam por identidade entre empresas (a F67 põe o `where`) | = |
| 18 | Realtime: `movimentacoes`, `anotacoes`, `lancamentos_item`; a RLS por assinante | igual (`pg_publication_tables`); a documentação da Supabase: "Postgres Changes authorizes every event against each subscriber" — a policy de SELECT do assinante vale | = |
| 19 | 102 "confia na RLS · F66" (89 + 13); três levantam a mão | 102 = 89 + 13; ⚠ **mais três candidatas** na varredura: `cadastrosComMesmaIdentidade`, `contarPonteirosSubstituto`, `exportarDesvinculosFk` (§4) | ⚠ |
| 20 | `eventos_admin`: 102 linhas, a maior 5.070 bytes, 120 kB, nenhuma > 8 kB | 102; nenhuma > 8 kB; ⚠ por `pg_column_size(detalhe)` a maior tem **4.946 bytes** e a soma **110.769 bytes (≈108 kB)** — a ordem mediu o texto; esta mede o que o disco guarda (comprimido). Os dois cabem na decisão 3 do Johnny | ⚠ (métrica) |
| 21 | 36 CHECK, 7 de comprimento; 65 colunas; `.max(` 80 em 16 arquivos | 36 · 7 (só **5** com MÁXIMO; 3 dos 7 são de `empresas`, fora das 20); 65 colunas; ⚠ `.max(` **80 em 17 arquivos** pelo grep literal — um é `Math.max(` num teste; **79 do Zod em 16 arquivos** | ⚠ (nuance) |
| 22 | os instrumentos; o ruído entre dias; a régua do MESMO dia | re-rodados hoje (§0); a linha de base de TTFB será retirada **imediatamente antes** do apply de produção, e a de hoje cedo fica como a primeira | = |
| 23 | o lock: `ACCESS EXCLUSIVE` para policy, `SHARE` para índice | a documentação do PG 17 é **muda** sobre `ALTER POLICY` (nem `sql-alterpolicy`, nem `explicit-locking`); o **fonte** do PG 17 (`src/backend/commands/policy.c`, `AlterPolicy`) abre a tabela com `AccessExclusiveLock` e troca a expressão inteira (`replaces[Anum_pg_policy_polqual - 1] = true`). `CREATE INDEX` sem `concurrently`: `SHARE` (documentado) | = (pelo fonte) |
| 24 | o `apply_migration` é atômico; `concurrently` proibido; o classificador trata `alter policy`/`create index`/`create or replace function` como ADITIVA | igual; ⚠ o classificador **não detecta** `concurrently` — a proibição é operacional (falha dentro da transação do MCP), não estática | = (nuance) |
| 25 | ADR-003 + RUNBOOK: ensaio primeiro, a prova pós-apply | igual; ⚠ o bloco SQL colado no RUNBOOK define **10** classes de paridade; a fonte executável (`supabase/ci/impressao-schema.sql`) tem **11** (`policy_storage`) — a F66 mede pelas 11 | = (nuance) |
| 26 | a conferência; o `.env.local` só por `--env-file`; nenhum código do app muda | igual | = |
| 27 | a policy depende da coluna: os rollbacks F62–F65 rodam o da F66 antes | **medido na mesa**: com a `0175`–`0179` aplicadas, `f62`/`f63`/`f64_rollback.sql` morrem em "cannot drop column empresa_id of table kits_modelos because other objects depend on it", e `f65_rollback.sql` reprova o `rb3` (a impressão das 20 inclui as policies) | = |
| 28 | as regras 1, 2, 3, 5, 6, 7, 8 | as referências oficiais usadas: `postgresql.org/docs/17` (`sql-createpolicy`, `sql-alterpolicy`, `explicit-locking`, `indexes-ordering`, `indexes-multicolumn`, `release-17`), o fonte `REL_17_STABLE/src/backend/commands/policy.c`, e `supabase.com/docs/guides/realtime/postgres-changes` | = |

**As três decisões do Johnny** (24/09/2026) mudam a ficha: (1) o CHECK de comprimento sai para a **F66B** — aqui só a
ficha dela, com o censo (§11 do plano, e o `PLANO-MULTIEMPRESA.md`); (2) a troca de `pode_escrever_filial` pelos pares
entra, com a prova **conta a conta em produção** (decisão 10); (3) `eventos_admin` não muda de forma — só a leitura
ganha o recorte.

---

## 2. A tabela-verdade das 54 policies (decisão 2)

A classe de hoje sai do piso que a policy cita (a PRIMEIRA função de `k_recorte_classe`, na ordem, que a árvore dela
cita); a função do recorte é a da classe. O texto de hoje é o de `pg_policies` (normalizado pelo Postgres, igual nos
dois bancos — `f66-evidencias/antes/policies-producao.json`); o texto-alvo é o `alter policy` literal da migration,
que carrega o piso por extenso. Gerada por script a partir da impressão e das migrations (nada transcrito à mão).

| # | tabela / policy | comando | classe de hoje (o piso) | função do recorte | USING hoje (pg_policies) | WITH CHECK hoje (pg_policies) | migration | o texto-alvo (o `alter policy`, literal) |
|---:|---|---|---|---|---|---|---|---|
| 1 | `anotacoes / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0175 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 2 | `anotacoes / operador anota` | INSERT | pode_escrever | `empresas_de_escrita()` | — | `( SELECT pode_escrever() AS pode_escrever)` | 0175 | `with check ((select public.pode_escrever()) and empresa_id = any (array (select public.empresas_de_escrita())))` |
| 3 | `ativos / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0176 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 4 | `ativos / operador atualiza` | UPDATE | pode_escrever_filial → pares | `empresas_de_escrita()` | `pode_escrever_filial(filial_id)` | `pode_escrever_filial(filial_id)` | 0176 | `using (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)) with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u))` |
| 5 | `ativos / operador insere` | INSERT | pode_escrever_filial → pares | `empresas_de_escrita()` | — | `pode_escrever_filial(filial_id)` | 0176 | `with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u))` |
| 6 | `colaboradores / admin atualiza colaborador` | UPDATE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | `( SELECT e_admin() AS e_admin)` | 0175 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin()))) with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 7 | `colaboradores / escrita cria colaborador` | INSERT | pode_escrever | `empresas_de_escrita()` | — | `( SELECT pode_escrever() AS pode_escrever)` | 0175 | `with check ((select public.pode_escrever()) and empresa_id = any (array (select public.empresas_de_escrita())))` |
| 8 | `colaboradores / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0175 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 9 | `eventos_admin / admin le auditoria` | SELECT | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | — | 0178 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 10 | `filiais / admin apaga` | DELETE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | — | 0177 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 11 | `filiais / admin atualiza` | UPDATE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | `( SELECT e_admin() AS e_admin)` | 0177 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin()))) with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 12 | `filiais / admin insere` | INSERT | e_admin | `empresas_de_admin()` | — | `( SELECT e_admin() AS e_admin)` | 0177 | `with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 13 | `filiais / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0177 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 14 | `import_logs / leitura operador` | SELECT | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | — | 0178 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 15 | `import_logs / operador insere` | INSERT | e_admin | `empresas_de_admin()` | — | `( SELECT e_admin() AS e_admin)` | 0178 | `with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 16 | `import_prefixos_patrimonio / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0177 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 17 | `import_termos_categoria / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0177 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 18 | `import_termos_estado / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0177 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 19 | `itens / admin apaga` | DELETE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | — | 0175 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 20 | `itens / admin atualiza` | UPDATE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | `( SELECT e_admin() AS e_admin)` | 0175 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin()))) with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 21 | `itens / escrita cria item` | INSERT | pode_escrever | `empresas_de_escrita()` | — | `( SELECT pode_escrever() AS pode_escrever)` | 0175 | `with check ((select public.pode_escrever()) and empresa_id = any (array (select public.empresas_de_escrita())))` |
| 22 | `itens / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0175 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 23 | `kits_modelos / admin apaga` | DELETE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | — | 0177 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 24 | `kits_modelos / admin atualiza` | UPDATE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | `( SELECT e_admin() AS e_admin)` | 0177 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin()))) with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 25 | `kits_modelos / admin insere` | INSERT | e_admin | `empresas_de_admin()` | — | `( SELECT e_admin() AS e_admin)` | 0177 | `with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 26 | `kits_modelos / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0177 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 27 | `lancamentos_item / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0176 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 28 | `lancamentos_item / operador lanca` | INSERT | pode_escrever_filial → pares | `empresas_de_escrita()` | — | `(pode_escrever_filial(filial_id) AND estorno_item_coerente(estorna_id, filial_id, item_id))` | 0176 | `with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u) and public.estorno_item_coerente(estorna_id, filial_id, item_id))` |
| 29 | `membros / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0178 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 30 | `motivos / admin apaga` | DELETE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | — | 0177 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 31 | `motivos / admin atualiza` | UPDATE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | `( SELECT e_admin() AS e_admin)` | 0177 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin()))) with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 32 | `motivos / admin insere` | INSERT | e_admin | `empresas_de_admin()` | — | `( SELECT e_admin() AS e_admin)` | 0177 | `with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 33 | `motivos / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0177 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 34 | `movimentacoes / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0176 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 35 | `movimentacoes / operador insere` | INSERT | pode_escrever_filial → pares | `empresas_de_escrita()` | — | `(pode_escrever_filial(filial_id) AND pode_escrever_filial(((snapshot_anterior ->> 'filial_id'::text))::smallint))` | 0176 | `with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u) and (empresa_id, (snapshot_anterior ->> 'filial_id')::smallint) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u))` |
| 36 | `operador_filiais / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0178 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 37 | `pendencias_item / pendencias_item admin reabre` | UPDATE | e_admin | `empresas_de_admin()` | `(( SELECT e_admin() AS e_admin) AND pode_escrever_filial(filial_id) AND (status = 'resolvida'::text))` | `(( SELECT e_admin() AS e_admin) AND pode_escrever_filial(filial_id) AND (status = 'aberta'::text))` | 0176 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u) and status = 'resolvida') with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u) and status = 'aberta')` |
| 38 | `pendencias_item / pendencias_item leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0176 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 39 | `pendencias_item / pendencias_item operador resolve` | UPDATE | pode_escrever_filial → pares | `empresas_de_escrita()` | `(pode_escrever_filial(filial_id) AND (status = 'aberta'::text))` | `pode_escrever_filial(filial_id)` | 0176 | `using (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u) and status = 'aberta') with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u))` |
| 40 | `relatorios_gerados / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0178 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 41 | `relatorios_gerados / operador gera` | INSERT | pode_escrever | `empresas_de_escrita()` | — | `( SELECT pode_escrever() AS pode_escrever)` | 0178 | `with check ((select public.pode_escrever()) and empresa_id = any (array (select public.empresas_de_escrita())))` |
| 42 | `termos_gerados / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0175 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 43 | `termos_gerados / operador apaga` | DELETE | pode_escrever_termo | `empresas_de_escrita()` | `pode_escrever_termo(ativo_ids)` | — | 0175 | `using ( public.pode_escrever_termo(ativo_ids) and empresa_id = any (array (select public.empresas_de_escrita())) )` |
| 44 | `termos_gerados / operador atualiza` | UPDATE | pode_escrever_termo | `empresas_de_escrita()` | `pode_escrever_termo(ativo_ids)` | `((COALESCE(array_length(ativo_ids, 1), 0) > 0) AND pode_escrever_termo(ativo_ids) AND termo_ancora_coerente(movimentacao_ids, ativo_ids) AND (arquivo_path = ((id)::text \|\| '.docx'::text)))` | 0175 | `using ( public.pode_escrever_termo(ativo_ids) and empresa_id = any (array (select public.empresas_de_escrita())) ) with check ( coalesce(array_length(ativo_ids, 1), 0) > 0 and public.pode_escrever_termo(ativo_ids) and public.termo_ancora_coerente(movimentacao_ids, ativo_ids) and arquivo_path = id::text \|\| '.docx' and empresa_id = any (array (select public.empresas_de_escrita())) )` |
| 45 | `termos_gerados / operador insere` | INSERT | pode_escrever_termo | `empresas_de_escrita()` | — | `((COALESCE(array_length(ativo_ids, 1), 0) > 0) AND pode_escrever_termo(ativo_ids) AND termo_ancora_coerente(movimentacao_ids, ativo_ids) AND (arquivo_path = ((id)::text \|\| '.docx'::text)))` | 0175 | `with check ( coalesce(array_length(ativo_ids, 1), 0) > 0 and public.pode_escrever_termo(ativo_ids) and public.termo_ancora_coerente(movimentacao_ids, ativo_ids) and arquivo_path = id::text \|\| '.docx' and empresa_id = any (array (select public.empresas_de_escrita())) )` |
| 46 | `tipos_item / admin atualiza tipo` | UPDATE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | `( SELECT e_admin() AS e_admin)` | 0177 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin()))) with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 47 | `tipos_item / admin insere tipo` | INSERT | e_admin | `empresas_de_admin()` | — | `( SELECT e_admin() AS e_admin)` | 0177 | `with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 48 | `tipos_item / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0177 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |
| 49 | `unidades_apelidos / admin apaga apelido` | DELETE | e_admin | `empresas_de_admin()` | `( SELECT e_admin() AS e_admin)` | — | 0177 | `using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 50 | `unidades_apelidos / admin insere apelido` | INSERT | e_admin | `empresas_de_admin()` | — | `( SELECT e_admin() AS e_admin)` | 0177 | `with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin())))` |
| 51 | `unidades_apelidos / leitura operador` | SELECT | papel_atual (piso) | `empresas_do_membro()` | `(( SELECT papel_atual() AS papel_atual) IS NOT NULL)` | — | 0177 | `using ((select public.papel_atual()) is not null and empresa_id = any (array (select public.empresas_do_membro())))` |

E as três em tabela SEM `empresa_id` — exceção nominal (`k_recorte_excecoes`), texto intocado:

| tabela / policy | comando | USING hoje | WITH CHECK hoje | motivo | destino |
|---|---|---|---|---|---|
| `_bkp_relatorios_gerados_f6a / dev le backup f6a` | SELECT | (md5 `a1f171a3…`) | (md5 `336d5ebc…`) | backup congelado de uma fase (0128), sem a coluna, só `e_dev()` lê | permanente |
| `profiles / atualiza proprio perfil` | UPDATE | (md5 `15c587ac…`) | (md5 `15c587ac…`) | identidade da CONTA; a pessoa edita o próprio nome (`id = auth.uid()`) | F69 |
| `profiles / leitura operador` | SELECT | (md5 `cb680040…`) | (md5 `336d5ebc…`) | identidade da conta, lida por colegas de qualquer filial (o histórico precisa do nome de quem já saiu) | F69 (a leitura cruzada de perfis por empresa) |

**A contagem por classe → função** (a `k_recorte_classe`, fonte única em `catalogo_policies.sql`):

| classe de hoje | policies | termo que entra |
|---|---:|---|
| SELECT pelo piso `papel_atual()` (inclui `membros`, `operador_filiais`) | 19 | `empresa_id = any (array (select public.empresas_do_membro()))` |
| SELECT por `e_admin()` (`eventos_admin`, `import_logs`) | 2 | `… public.empresas_de_admin() …` |
| escrita por `pode_escrever()` | 4 | `… public.empresas_de_escrita() …` |
| escrita por `e_admin()` (inclui `import_logs` INSERT e `colaboradores` UPDATE) | 17 | `… public.empresas_de_admin() …` |
| escrita por unidade (`pode_escrever_filial` → pares), 5 de escrita | 5 | pares sobre `unidades_de_escrita()` + `… empresas_de_escrita() …` |
| `pendencias_item` "admin reabre" (`e_admin()` fica) | 1 | `e_admin()` + pares + `… empresas_de_admin() …` |
| `termos_gerados` (as 3 de escrita; as exceções PERMANENTES da doutrina ficam) | 3 | o de hoje + `… empresas_de_escrita() …` |
| **com a coluna** | **51** | |
| `profiles` ×2 | 2 | exceção nominal → **F69** |
| `_bkp_relatorios_gerados_f6a` | 1 | exceção nominal → **permanente** |

`membros` e `operador_filiais` são `k_infra` **com a coluna**, e são recortadas já: ninguém tem motivo para ler as
memberships de outra empresa, e as funções de conjunto que a policy delas chama são `security definer` (não recursam).

---

## 3. Os índices de lista e os consumidores (decisão 8)

### 3.1 O censo (produção, `pg_stat_user_indexes`, estatística desde 29/06; só os NÃO-únicos das tabelas de lista)

| tabela | índice | forma | `idx_scan` | consumidor (TS pela sessão / definer / service role) | decisão |
|---|---|---|---:|---|---|
| movimentacoes | `mov_ativo_idx` | `(ativo_id, data desc)` | 5.427.474 | histórico do ativo (sessão), `aplicar_movimentacao` e as funções do estado (definer) | fica |
| | `movimentacoes_estorno_de_idx` | `(estorno_de)` | 392.558 | a trava do estorno (definer) | fica |
| | `movimentacoes_data_ordem_idx` | `(data desc, ordem desc)` | 42.170 | **a lista de `/movimentacoes`** (`queries/movimentacoes.ts:684`, sessão) | **fica** (ver 3.2) |
| | `movimentacoes_ordem_lista_idx` | `(data desc, created_at desc, id desc)` | 18.227 | `rel_estoque_asof*` (invoker, por ativo) e o desempate do as-of | fica |
| | `mov_filial_data_idx` | `(filial_id, data desc)` | 11.821 | relatórios por filial (`rel_*`, invoker) | fica |
| | `movimentacoes_colaborador_idx` · `_criado_por_idx` · `_filial_destino_id_idx` · `_motivo_idx` · `_forcado_idx` | (1 coluna) | 10.673 · 713 · 511 · 10 · 3 | filtros de tela, FKs, a Zona destrutiva | ficam |
| | `mov_created_idx` | `(created_at desc)` | 4.072 | "recentes" com `ativo_id`/`criado_por` (preferem os índices deles); o painel | fica |
| ativos | `ativos_patrimonio_idx` · `idx_ativos_substitui_ativo_id` · `ativos_filial_status_idx` · `ativos_categoria_idx` · `ativos_colaborador_idx` | | 19.619 · 8.417 · 6.230 · 250 · 12 | busca, import (service role), filtros | ficam |
| | — (nenhum de `updated_at`) | | — | a lista de `/ativos` (`queries/ativos.ts:211/576`) ordena por `updated_at desc, id` — Sort, hoje e depois | nenhum novo (3.2) |
| lancamentos_item | `lanc_item_chamado_idx` · `_colaborador_idx` · `_filial_data_idx` · `_item_filial_idx` · `_mov_idx` · `_criado_por_idx` · `_pendencia_idx` · `_regularizacao_idx` · `_forcado_idx` | | 16.929 · 8.998 · 4.416 · 945 · 187 · 143 · 38 · 0 · 0 | saldo, histórico, RPCs de item (definer) | ficam |
| | `lanc_item_created_idx` | `(created_at desc)` | 793 | o histórico de itens (`queries/itens.ts:537/696`) | **fica** (3.2) |
| eventos_admin | `eventos_admin_quando_idx` | `(quando desc, acao)` | 209 | a Auditoria (`queries/eventos-admin.ts:96`) | **fica** (3.2) |
| | `eventos_admin_autor_idx` | `(autor)` | 2 | filtro por autor | fica |
| import_logs | `import_logs_created_idx` | `(created_at desc)` | 187 | a lista do import (`queries/import-logs.ts:699`) | **fica** (3.2) |
| | `import_logs_filial_idx` · `import_logs_filial_hash_idx` | | 2 · 0 | a deduplicação do import (service role/definer) | ficam |

### 3.2 A medição que decide (a mesa PG 17.5, volume fictício de produção; confirmada nos bancos vivos depois do apply)

Quatro cenários por lista, cada um de um dump limpo, 3 repetições (mediana), como `authenticated` com a identidade de
nível administrador: **A** a policy de hoje e os índices de hoje; **B** a policy NOVA (o termo `= any`) e os índices de
hoje; **C** a policy nova e os candidatos liderados por `empresa_id` AO LADO dos antigos; **D** só os candidatos (os
antigos derrubados). E, em C/D, a mesma lista com `where empresa_id = <empresa>` explícito (o que a F70 fará).

| lista | A → B (a policy nova, índices de hoje) | C (candidato ao lado) | D (só o candidato) | com `where empresa_id =` (F70) |
|---|---|---|---|---|
| movimentacoes `order by data desc, ordem desc limit 50` | `Index Scan` no `data_ordem`, sem Sort, 50 linhas, 106 → 110 buffers | o planner **ignora** o candidato | **`Incremental Sort`** sobre o `ordem_lista` | candidato, `Index Scan`, sem Sort |
| ativos `order by updated_at desc, id limit 50` | `Sort` sobre 1.650 linhas (Seq → Bitmap no `(empresa_id, id)`) | candidato por **Bitmap** + **Sort** (não melhora) | idem | candidato, `Index Scan` puro, sem Sort |
| lancamentos_item `order by created_at desc, id desc` | `Incremental Sort` (já hoje) no `created_idx` | ignora o candidato | **Sort completo** (400 linhas) | candidato, sem Sort |
| eventos_admin `order by quando desc, id desc` | `Incremental Sort` (já hoje) | candidato por Bitmap + **Sort completo** | idem | ainda `Incremental Sort` (o candidato da ficha não tem `id desc`) |
| import_logs `order by created_at desc` | `Index Scan`, sem Sort | ignora o candidato | **Sort completo** (200 linhas) | candidato, sem Sort |

Em todo plano B/C/D, as duas funções aparecem como `InitPlan` com **1 loop** (uma avaliação por statement).

**A documentação do PG 17 não decide**: `indexes-ordering` não trata `ScalarArrayOpExpr`; `indexes-multicolumn` descreve
a igualdade nas colunas líderes; e a nota do 17 (`release-17`, "Allow btree indexes to more efficiently find a set of
values, such as those supplied by IN clauses using constants") é sobre listas de **constantes** — o nosso `= any` é o
parâmetro de um `InitPlan`. O PLANO decide: `empresa_id = any (…)` na coluna líder não serve `ORDER BY … LIMIT` sem
Sort (o `= any` de um parâmetro não garante a ordem das colunas seguintes); só a IGUALDADE serve.

**A decisão (a régua da ordem: "entra só se o plano o usa sob a policy nova e não piora; o antigo só cai se nenhum
consumidor sem o predicado depender dele"):**
- **nenhum índice novo na F66**: sob a policy nova, os candidatos ou são ignorados (movimentações, lançamentos, trilha do
  import) ou usados por Bitmap sem ganho (`/ativos`, auditoria) — custo de escrita sem prova de uso;
- **nenhum índice derrubado**: derrubar os de hoje põe `Sort` completo sobre as linhas da empresa em 4 das 5 listas
  (cenário D) — e os consumidores sem o predicado (`rel_*` por filial, as `security definer`) continuam a usá-los;
- **os candidatos vão para a F70**, que põe a empresa ESCOLHIDA como igualdade na consulta (o seletor): ali o índice
  liderado por `empresa_id` serve a lista sem Sort — com `(empresa_id, quando desc, id desc)` para a auditoria (a forma
  da ficha não bastaria). Nota escrita na ficha F70 do plano;
- o delta do advisor `unindexed_foreign_keys`: **nenhum** (nenhum índice criado).

A confirmação nos bancos vivos: depois do apply, o `EXPLAIN (ANALYZE, BUFFERS)` das cinco listas como `authenticated`
com a policy REAL (o modo `listas` do `medir-rls.mjs`), nos dois bancos, mostra o mesmo nó de hoje — sem Sort novo.

---

## 4. A releitura dos 102 "confia na RLS · F66" (decisão 15)

**Com uma empresa, nenhuma muda** (a conjunção de leitura é inerte). Com duas, a leitura pela sessão passa a ver só as
empresas de que a pessoa é membro — o certo, na imensa maioria. As que levantam a mão:

| call-site | o que lê | com duas empresas | o que fica com quem |
|---|---|---|---|
| `getDiagnostico` (`queries/dev.ts:96`, `/dev`) | contagens de 4 tabelas | passam a ser das empresas do dev (a soma, se ele for membro de duas) | **F70**: decidir se o `/dev` conta pela empresa escolhida ou pela plataforma (definer) |
| `excluirItem` (`actions/itens.ts:779`) | a contagem de lançamentos do item antes de excluir | **fica certa por construção**: o item é de uma empresa e a FK composta `(empresa_id, item_id)` (F65) prende todo lançamento dele à mesma empresa — quem vê o item vê todos | nada a fazer (anotado) |
| `paresEmOutrasFiliais` (`queries/import-logs.ts:261/284`) | o mesmo par patrimônio + service tag em OUTRA filial | para quem é membro de uma empresa, vira "outra filial da minha empresa" — o certo; para o membro de DUAS, o par da outra empresa entraria como "conflito" | **F67**: `where` explícito pela empresa da filial do import (o import é por filial, a filial é de uma empresa) |
| `cadastrosComMesmaIdentidade` (`ativos/identidade.ts:150`) | a recusa de identidade duplicada em todas as unidades | idem: por empresa para quem é de uma; o membro de duas veria a duplicata da outra e seria recusado | **F67** (a escrita por tenant: a recusa tem de ser da empresa do cadastro) |
| `contarPonteirosSubstituto` · `exportarDesvinculosFk` (`queries/import-logs.ts:215/636`) | ponteiros `substitui_ativo_id` vindos de outra filial | **ficam certos**: a FK composta de `substitui_ativo_id` (F65) impede o ponteiro entre empresas | nada a fazer |

(As linhas acima foram corrigidas pela revisão adversarial da fase — quatro das seis estavam deslocadas pelo código que
andou desde a F57; conferidas de novo no disco.) Nenhuma vira código nesta fase (a F66 não muda o TS que o app executa). O `INVENTARIO-LEITURAS.md` ganha o estado
depois da fase nas 102 linhas.

---

## 5. O desenho e as quinze decisões

1. **As migrations e os lotes.** Cinco: `0175` (lote 1a — os cadastros do acervo, 13 policies), `0176` (lote 1b — o
   movimento do acervo, 10, com os pares), `0177` (lote 2 — o vocabulário, 21), `0178` (lote 3 — os registros e os
   vínculos, 7), `0179` (as `rel_*`). **O lote 1 se divide por família** (a ordem permite): `alter policy` toma `ACCESS
   EXCLUSIVE` na tabela até o commit (o fonte do PG 17), e o acervo tem as tabelas mais quentes — quatro tabelas por
   migration, na ordem de lock do app (a da `0160`/`0161`). Nenhuma migration de índice (§3). Todo estado entre duas é
   repouso válido. ⚠ **Desvio declarado**: a ficha pede "`isolamento_tenant.sql` verde entre os lotes"; no CI a cadeia
   roda inteira; nos bancos vivos, entre os lotes, roda a prova conta a conta REAL e a impressão das policies do lote.
2. **A tabela-verdade** é a do §2 e mora em `k_recorte_classe` (catalogo_policies.sql). Conferida contra o
   `pg_policies` e a semântica: `import_logs` "leitura operador" é por `e_admin()` (o nome engana; a classe está certa).
3. **A forma de pares.** O texto-alvo das 6 está no §2: `(empresa_id, filial_id) in (select u.empresa_id, u.filial_id
   from public.unidades_de_escrita() u)` — a expressão da linha à ESQUERDA, o sub-select qualificado pelo alias —, em
   conjunção com `empresa_id = any (array (select public.empresas_de_escrita()))` (e `empresas_de_admin()` em "admin
   reabre", que mantém `e_admin()`). O snapshot de `movimentacoes`: `(empresa_id, (snapshot_anterior ->> 'filial_id')
   ::smallint) in (…)` — passa R1/R3 na árvore (medido: `11a`/`13b` verdes com o texto-alvo) e na mesa (caso novo). **Não
   é exceção**: `k_excecoes_predicado` fica com **12**. `fid` nulo → o par é NULL → recusa (o mesmo "fecha" de hoje);
   filial inexistente: a FK composta recusa antes. O default `empresa_legada()` vale ANTES do `WITH CHECK` (a linha
   proposta; `sql-createpolicy`: "enforced after BEFORE triggers are fired") — e a F67 é quem tira o default.
4. **`alter policy`, nunca `drop`/`create`**: o nome fica, `10a`/`10b` não se mexem, `to authenticated` e a
   permissividade ficam. Um comando literal por policy; o texto-alvo carrega o piso por extenso, copiado da migration
   que o escreveu por último. A prova de que o piso ficou: a impressão "depois" normaliza igual à de hoje no pedaço do
   piso, e o rollback devolve o md5 exato de cada `qual`/`with_check` (§6).
5. **As travas.** A forma do recorte é um **bloco novo**, o 6 de `catalogo_policies.sql` (asserções `16a`–`16g`),
   DERIVADO do catálogo e lendo a ÁRVORE com assinatura por nó (§7). O **15g** e o **7a** saem (a verdade nova é a
   16a, para as 21 tabelas — uma fonte só); o **7d** e o **6b** ficam só com a metade da função. O 15h/15i continuam.
   `to authenticated` é a **16f** (nasce verde; a sabotagem B a derruba). A fonte única de `k_recorte_classe`,
   `k_recorte_unidade` e `k_recorte_excecoes` é amarrada por um describe novo de `catalogos-seguranca.test.ts`.
   ⚠ As inversões entram no MESMO commit das travas vermelhas (o primeiro), não no "commit 8" da lista da ordem: a 16a
   vermelha e o 15g verde diriam coisas opostas no mesmo arquivo; as que só invertem com uma migration específica (as 6
   exceções, as `rel_*` em `k_leitura_tenant`, o `L4`) vão no commit dessa migration.
6. **"Quem lê `empresa_id`" depois da F66**: a POLICY TEM de ler (16a); a FUNÇÃO só por exceção nominal — as duas `rel_*`
   entram em `k_leitura_tenant`, por comando, com o motivo "integridade de junção pelo par da FK composta, não recorte"
   (`rel_resumo_filiais` com `ativos` na lista, porque o comando o cita); a VIEW continua não lendo; o TS continua não
   recortando (a catraca fica, apontando a F67 — a escrita recebe a empresa — e a F70 — a empresa na tela).
7. **A bateria de leitura** (seção 10 de `isolamento_tenant.sql`). Direção A com as policies reais. **Direção B emulando a
   F72**, não a F67: dentro de uma subtransação desfeita, o piso vira `true` NO TEXTO QUE O CATÁLOGO DEVOLVE de cada
   policy de SELECT da bateria, e o que sobra é o termo que a migration escreveu. Motivo: testa o termo REAL de cada
   policy (emular a F67 inventaria um `papel_atual()` por empresa que nenhuma fase terá nessa forma). A escrita da
   direção B depende da ponte e é da F67 (declarado). O `alter policy` sintético é DDL dinâmico **dentro da transação do
   roteiro**, fora de `supabase/migrations/`: o replay da mesa só lê migrations; o universo congelado (`10a`/`10b`) roda
   em outra sessão; o `raise` da subtransação o desfaz antes da asserção seguinte.
8. **Os índices**: nenhum (§3).
9. **As `rel_*`**: `create or replace` com a mudança SÓ no join (`and mo.empresa_id = m.empresa_id`, na mesma linha); o
   resto byte a byte (o diff do `prosrc` é uma linha em cada); grants e `search_path` preservados pelo `create or
   replace`; `RECRIACOES_AUTORIZADAS['0179']` exaustiva; a equivalência pelo modo novo `mesmo-nome` do
   `equivalencia-rel.mjs` (o corpo novo como subconsulta × a função viva, antes; o corpo velho × a viva, depois).
10. **A prova conta a conta** é `scripts/perf/conta-a-conta.mjs` (o molde fechado do `medir-rls.mjs`: bloco gerado e
    conferido byte a byte, `transaction_read_only`, alvo pelo `rotulo_de_ambiente()`, a identidade escolhida DENTRO do
    banco). Leitura: emulada = a policy de hoje × a de hoje ∧ o termo, no mesmo statement; real = a policy real × o total
    que o piso de hoje daria, com o total recontado no fim (a tabela que mudou no meio é CORRIDA, contada à parte).
    Escrita: `pode_escrever_filial(f)` × `(legada, f) ∈ unidades_de_escrita()` em toda filial; `pode_escrever()` ×
    `empresas_de_escrita()`; `e_admin()` × `empresas_de_admin()`. Sai só contagem. A sabotagem (só no ensaio) inverte uma
    comparação de cada lado e TEM de dar > 0 (deu 2).
11. **O custo e a régua de 15%**: a linha de base do MESMO dia, retirada imediatamente antes do apply de produção; o mesmo
    método (`medir.mjs`: 2 aquecimentos, 11 rodadas em round-robin); rota acima de 15% no p95 é medida mais duas vezes,
    intercalando; se persistir e o `medir-rls` atribuir ao predicado, é bloqueio (índice não resolve — §3); se não
    atribuir, é ruído declarado com os números.
12. **O injetor**: sete mutações novas — o termo sai da leitura (`16a` + `10a`), o termo vira `or` (`16a` + `10a`), a
    policy de admin com `empresas_do_membro` (`16a` + `10g`), a unidade de volta a `pode_escrever_filial` (`11a`/`16c`/`16d`
    + `11a/11b`), `to public` (`16f`), "a guarda confere o papel e esquece o tenant" (o `WITH CHECK` de escrita sem o
    termo: `16a` + `10g`), o join das `rel_*` sem a empresa (`10i`). Teto 143 → **150**. E as duas `*-sem-coluna`
    (F63/F64) passam a devolver as policies da tabela ao texto de antes do `drop column` (a policy depende da coluna).
13. **O rollback**: `supabase/rollback/F66-desfaz.sql`, na ordem inversa (0179 → 0178 → 0177 → 0176 → 0175), cada policy
    de volta ao texto de antes por `alter policy` literal, as `rel_*` com o corpo da 0143; idempotente; `lock_timeout`
    por `set`/`reset`. Ensaiado por `f66_rollback.sql` (a impressão das policies e das duas funções antes da 0175 ×
    depois do rollback, na mesma transação). `f62`…`f65_rollback.sql` passam a rodar o da F66 ANTES (medido: sem ele, o
    `drop column` falha). ⚠ Depois da F73 (uma segunda empresa de verdade), este rollback ABRE a leitura entre empresas
    — só roda com o dado da segunda empresa fora.
14. **O instrumento "antes/depois"** é o §0: `impressao-policies.sql` (md5 por policy de `qual` e `with_check`, o texto
    das 51), `impressao-catalogo.sql` (relfilenode das 22, índices, md5 do `prosrc` sem as duas `rel_*`), os advisors, e
    o canal (enchimento + invólucro). **"Mudou como planejado"** = só as 51 da tabela-verdade mudam, cada uma para o
    texto-alvo; as 11 (8 de Storage, 3 sem a coluna) com o md5 do antes; `md5_sem_as_da_f66` igual; as duas `rel_*` com
    o md5 do corpo da `0179`; relfilenode das 22 igual; índices iguais. **Qualquer outra diferença é "mudou"** — e para
    o apply.
15. **A releitura dos 102** é o §4.

---

## 6. As migrations, a ordem de apply e a ORDEM DE ROLLBACK

| # | arquivo | classe | o quê | lock |
|---|---|---|---|---|
| 1 | `0175_recorte_policies_cadastros_do_acervo.sql` | ADITIVA | 13 `alter policy`: colaboradores, itens, termos_gerados, anotacoes | ACCESS EXCLUSIVE em 4 tabelas |
| 2 | `0176_recorte_policies_movimento_do_acervo.sql` | ADITIVA | 10 `alter policy`, os 6 pares: ativos, movimentacoes, pendencias_item, lancamentos_item | idem |
| 3 | `0177_recorte_policies_vocabulario.sql` | ADITIVA | 21 `alter policy`: o vocabulário do import, apelidos, tipos, motivos, kits, filiais | idem, 8 tabelas pequenas |
| 4 | `0178_recorte_policies_registros_e_vinculos.sql` | ADITIVA | 7 `alter policy`: membros, operador_filiais, relatorios_gerados, import_logs, eventos_admin | idem |
| 5 | `0179_rel_motivo_por_empresa.sql` | ADITIVA | `create or replace` de `rel_por_motivo_filiais` e `rel_resumo_filiais` (o join) | nenhum lock de tabela |

Todas com `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit`, cabeçalho de classe, rollback no rodapé,
`db:lock` no mesmo commit, entrada em `DA_F38`. Nomes-sem-prefixo novos (conferidos contra os 174 arquivos).

**A ORDEM DE ROLLBACK é o inverso** — `supabase/rollback/F66-desfaz.sql`:
1. (nada — nenhum índice)
2. `0179`: as duas `rel_*` com o corpo da `0143`;
3. `0178`: as 7 de volta;
4. `0177`: as 21 de volta;
5. `0176`: as 10 de volta (as 6 de escrita a `pode_escrever_filial(filial_id)`; as 6 linhas voltam a `k_excecoes_predicado`
   no `git revert`);
6. `0175`: as 13 de volta.

**Entre fases**: F66 → F65 → F64 → F63 → F62 (o rollback de uma fase pressupõe o das posteriores).

---

## 7. As travas e as provas

**A trava da forma (o bloco 6)**: para cada árvore (`polqual`, `polwithcheck`) de toda policy de `public`, uma pilha
tokeniza o `pg_node_tree` (a regex do bloco 4) e monta a ASSINATURA de cada nó — tipo, os campos que decidem e os
filhos. O termo canônico é a assinatura exata `SCALARARRAYOPEXPR{opno=<=(uuid,uuid)>;useOr=true}[VAR{varno=1;varattno=
<empresa_id DESTA tabela>;varlevelsup=0}[]SUBLINK{subLinkType=6}[QUERY{}[FROMEXPR{}[]TARGETENTRY{}[FUNCEXPR{funcid=
<fn>;funcretset=true;funcformat=0}[]]]]]`; os pares, o `SUBLINK` tipo 2 com o primeiro membro na coluna e o sub-select
sobre `unidades_de_escrita()` qualificado. A conjunção de cima é a raiz ou filho de `BOOLEXPR and` que também está nela.
A guarda `16g` confere o próprio analisador com 8 árvores sintéticas (o termo solto, dentro de `and`, dentro de `or`,
sem o `array (select …)`, em outra coluna, com filtro no sub-select, os pares e os pares em `or`) — medido na mesa:
antes da F66, `16a`/`16c`/`16d` vermelhas pelas 51/6/6 e `16b`/`16e`/`16f`/`16g` verdes; com as `0175`–`0179`, 42/0.

| sabotagem | o que prova | onde a saída real vai |
|---|---|---|
| A — a forma do recorte | a 16a vermelha pelas 51 no banco de hoje; verde depois; e vermelha, pelo nome, com: uma das 51 de volta ao texto de antes; o termo só em USING numa de UPDATE; `empresas_do_membro()` numa de escrita de admin; o termo num `or`; `using (public.e_membro(empresa_id))` (11a); uma tabela sintética com a coluna e policy sem o termo | `f66-evidencias/A-L-sabotagens.md` |
| B — `to authenticated` | uma de `public` e uma de Storage `to public` → 16f vermelha pelo nome | idem |
| C — leitura, direção A | o laço sobre o catálogo; o termo retirado de UMA policy na transação → 10a vermelho naquela tabela | idem |
| D — direção B e o membro das duas | com o piso neutralizado: 10c/10d; sem neutralizar: 10e (a ponte, declarada); 10f | idem |
| E — a escrita cruzada | 10g (42501 pelo WITH CHECK, 0 linhas), 10g-bis (intacto), 10g-par; 10h: sem o termo, PASSA | idem |
| F — os pares | 11a/11b, 11a-bis, 11c (o snapshot), 11d (a equivalência nas fixtures; a divergência nas filiais da B medida); `pode_escrever_filial` de volta → 11a/16d; uma das 6 de volta à lista → 11b | idem |
| G — conta a conta | emulada antes (0), real depois de cada lote (0), nos dois bancos; a sabotada no ensaio (> 0) | `f66-evidencias/conta-a-conta/` |
| H — as `rel_*` | 10i (não duplica), 10j (sem o par, duplica); a equivalência antes × depois nos dois bancos (0 célula) | `A-L-sabotagens.md`, `f66-evidencias/rel/` |
| I — os índices | a medição estrutural (§3.2) e o `EXPLAIN` "depois" das cinco listas nos dois bancos | `f66-evidencias/indices/` |
| J — o custo | `medir-rls` antes × depois (F0/F4, `InitPlan` ×1) e o TTFB do mesmo dia | `perf/f66-*` |
| K — o rollback | `f66_rollback.sql` no CI; `f62`–`f65_rollback.sql` com o da F66 antes; sem ele, o `drop column` falha (medido na mesa) | `A-L-sabotagens.md` |
| L — o instrumento | uma policy alterada numa subtransação muda o md5 dela; `alter column … type` muda o relfilenode; as migrations da fase não mudam o de nenhuma das 22 | idem |

---

## 8. Commits e pushes

1. `docs(f66)`: a ordem (feito); este plano e o "antes" (`f66-evidencias/antes/`, `conta-a-conta/`, `perf/f66-*-antes`).
2. `test(f66)`: as travas — o bloco 6, a bateria (seções 10 e 11), as inversões (15g, 7a, 7d, 6b, os describes), a mesa
   do snapshot, e os instrumentos (`conta-a-conta.mjs`, a F4 do `medir-rls.mjs`). **Push 1** (PR em rascunho): o CI
   vermelho nas travas novas — a evidência em `f66-evidencias/B-travas/`.
3. `feat(f66)`: `0175` (lote 1a). 4. `feat(f66)`: `0176` (lote 1b) e as 6 exceções fora da lista. 5. `feat(f66)`: `0177`.
   6. `feat(f66)`: `0178`. 7. `feat(f66)`: `0179`, as `rel_*` em `k_leitura_tenant` (e cópias), o `L4`,
   `RECRIACOES_AUTORIZADAS`.
8. `test(f66)`: os rollbacks (`F66-desfaz.sql`, `f66_rollback.sql`, o encadeamento, `rollback-f66.test.ts`).
9. `test(f66)`: o injetor (7 mutações, teto 150, as duas `*-sem-coluna`; e a 8ª, teto 151, da revisão adversarial).
10. `docs(f66)`: MATRIZ, ADR, RUNBOOK, PLANO (F66B, F67, F70, F72), inventário, índices, ata. 11. `chore(f66)`: 1.71.0.
**Push 2** depois do 9 (o CI verde); o apply (ensaio → produção) sobre o SHA congelado; o merge; o PR de documentação
com a tag.

---

## 9. O SHA de código congelado

**`70ec7c0`** (24/09/2026) — *test(f66): revisão adversarial — o segundo membro do par conferido (16c) e a guarda fechada
do equivalencia-rel*, o último commit que toca `src/**`, `scripts/**` ou `supabase/**`. Depois dele, só `docs/**` e
`CHANGELOG.md`. As migrations aplicadas nos bancos vivos são as de `supabase/migrations/0175`–`0179` neste SHA, pelo texto
exato do arquivo (a sonda de exatidão confere o texto aplicado contra o oráculo da mesa).

---

## 10. O que este plano NÃO promete

- Que a empresa B vê o próprio dado pelas policies REAIS — a ponte de `papel_atual()` fecha tudo para quem é só da B até
  a F67 (a direção B é provada com o piso neutralizado na transação do roteiro).
- Que uma linha nova de uma segunda empresa recebe a empresa certa (o default é a WAP até a F67).
- Que as `security definer`, o Storage e o canal do Realtime recortam por empresa além do que a policy de SELECT faz
  (F67); nem que `profiles` recorta (F69).
- Que o custo se mantém com duas empresas e volume maior — a medição é do volume de hoje, uma empresa.
- Que a janela entre os lotes, em produção, ficou sem tráfego (o `lock_timeout` de 2 s e a ordem de lock limitam, não
  eliminam, a espera de uma leitura do app).

# Runbook — operações de banco (Supabase)

Procedimento único para aplicar migrations e mudanças de banco neste projeto. Nasceu do item **A** do plano de dívida técnica (`docs/DIVIDA-TECNICA.md`) para tirar da cabeça o que hoje é conhecimento tribal (o "gate", o apply manual, as armadilhas).

## Topologia

| Papel | Projeto Supabase (ref) | Uso |
|---|---|---|
| **Produção** | `pbtjcalbmepmrqzprusb` | dados reais da WAP (go-live 15/07/2026) |
| **Ensaio** | `sgmvldiizsrjbxzzpmhh` | rehearsal — a Supabase CLI local está linkada a ESTE |

Operações de banco são feitas **via MCP Supabase** (o ambiente não tem CLI local apontando para produção). O `supabase/schema.sql` é histórico (banner no topo) — a verdade são as migrations em `supabase/migrations/`.

> **Esta tabela tem consumidor no código.** `scripts/env-guard.ts` mantém a lista `REFS_DE_PRODUCAO`, que faz `npm run db:seed` / `npm run db:reset` **recusarem** qualquer ref de produção, independentemente do que estiver no `.env.local` (descoberto na F11, 22/07/2026: as guardas anteriores só conferiam se `SEED_PROJECT_REF` **batia com a URL** — consistência, não identidade —, e ambos apontavam para produção). **Projeto de produção novo entra nesta tabela E naquela lista, no mesmo commit.** Um ref de produção que não esteja lá volta a ser um alvo válido para o seed de dados fictícios.

## O "gate" do modo automático

O classificador do modo autônomo **bloqueia** qualquer DDL cujo corpo contenha `delete from public.ativos` ou `delete from public.movimentacoes` (via `apply_migration`/`execute_sql` do MCP) — em **qualquer** projeto, prod ou ensaio. Na prática isso atinge só a RPC destrutiva do import (`importar_ativos_substituir`, migrations 0031–0037, 0040). O objetivo é impedir que o agente rode uma exclusão de acervo sem um humano no circuito.

**Consequência (dívida conhecida):** essas migrations são aplicadas **à mão pelo Johnny no SQL Editor** e, por isso, **não são registradas** em `supabase_migrations.schema_migrations`. O estado de produção não é reconstruível só pelo ledger — ver "Divergência" abaixo.

## Aplicar uma migration

### A) Migration NÃO-destrutiva (não toca `delete from ativos/movimentacoes`)
O orquestrador aplica direto via MCP (`apply_migration`) em **ensaio primeiro**, depois produção; confere com `get_advisors` + um smoke só-leitura. Registrada no ledger normalmente.

### B) Migration DESTRUTIVA / que recria a RPC de import (bate no gate)
Fluxo humano-no-circuito (o que já se faz desde a F7):
1. **Migration no repo** (`supabase/migrations/NNNN_*.sql`) — fonte da verdade versionada. Recriações de função por `create or replace` PURO (assinatura idêntica → sem overload).
2. **SQL de handoff** em `scratchpad/` (cópia rodável + bloco de conferência).
3. **Diff-review**: o diff da nova migration vs a anterior deve ser **só a mudança pretendida** (ex.: "diff 0040 vs 0037 = só a guarda p_contagens"). Qualquer outra diferença é bug. Revisão adversarial byte-a-byte antes do merge.
4. **Johnny roda no SQL Editor de produção** após conferir.
5. **Verificação pós-apply OBRIGATÓRIA** (fecha a armadilha do "arquivo errado" — na F7E o editor rodou a 0033 no lugar da 0034 por engano):
   ```sql
   -- a função ficou com a assinatura certa e SEM overload?
   select p.oid::regprocedure::text
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'importar_ativos_substituir';
   -- esperado: EXATAMENTE 1 linha, 4 args (jsonb, text, jsonb, jsonb)

   -- o grant está certo? (anon/service_role NÃO devem ter execute)
   select r.rolname, has_function_privilege(r.rolname,
     'public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)', 'execute')
   from (values ('anon'),('authenticated'),('service_role')) r(rolname);
   -- esperado: authenticated=true, anon=false, service_role=false
   ```
6. **Recarregar o cache do PostgREST**: `notify pgrst, 'reload schema';` (senão a API não enxerga a nova assinatura).
7. **Smoke só-leitura de produção** (ver o padrão nas atas de F7* em `docs/DECISOES.md`).

## Divergência do ledger (estado em 23/07/2026 — ver a medição de 24/07 mais abaixo)

`list_migrations` de produção mostra `0001`–`0030` + `rate_limit_senha` (0025) + `0038` + `0041`. **Faltam no ledger** (aplicadas à mão pelo gate, mas os objetos EXISTEM em produção — `import_logs`, a RPC de 4 args etc.):

- **0031, 0032, 0033, 0034, 0035, 0036, 0037** — as migrations do import de startup (F7…F8).
- `0029` **não existe** (gap real na numeração; nunca foi criada).
- **`0039` (drop dos backups) e `0040` (hardening das RPCs) — JÁ APLICADAS, só fora do ledger.** *Correção de 23/07/2026 (F12).* Até esta data o runbook, o `README.md` e o `CHANGELOG.md` diziam que as duas estavam **pendentes de apply**. **Medição direta no banco de produção desmente:** não existe **nenhuma** tabela `backup%` (é exatamente o efeito da `0039`) e o corpo de `importar_ativos_substituir` **contém** a guarda `p_contagens is null` (efeito da `0040`). O que falta é o **registro**, não o efeito — elas entram na reconciliação abaixo, junto com as `0031`–`0037`. **Conferir antes de reconciliar** (ver os dois SELECTs em "Como conferir o efeito", logo abaixo): registrar no ledger uma migration que não esteja aplicada é pior que a divergência.
- **`0041`** (domínios de login: `@stefanini.com` + `@latam.stefanini.com`, 22/07/2026) — **aplicada por MCP em prod E ensaio**, e no ledger dos dois. Não bate no gate (é `create or replace` de trigger, sem `delete from`).
- **`0042`** (`itens.estoque_minimo` — F12, 23/07/2026) e **`0043`** (`kits_modelos` — F12, 23/07/2026) — as duas **aditivas** (coluna com default `0` + tabela nova com RLS), sem `delete from`, então **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, e registradas no ledger dos dois normalmente. Rollback documentado no backup lógico da ordem: são aditivas, o `drop` não perde nenhum dado do acervo.
- **`0044`** (enums `devolvido_fornecedor`/`devolucao_fornecedor` — F14, 23/07/2026) e **`0045`** (colunas `movimentacoes.chamado_fornecedor` + `ativos.substitui_ativo_id`, check `NOT VALID`, recriação de `status_apos_movimentacao`/`aplicar_movimentacao`/`rel_estoque_asof` por `create or replace` puro, RPC nova `devolver_ao_fornecedor`) — **aditivas**, sem `delete from` → **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, registradas no ledger dos dois. `0044`/`0045` são migrations **separadas** de propósito (valor de enum novo não é usável na transação que o adiciona). Verificação pós-apply em produção: enums 9/14, colunas/check/índice presentes, RPC 1 assinatura + grants (authenticated=true, anon/service_role=false), diffs corretos das 3 funções (conferidos ANTES de recriar: corpos vigentes = base 0022/0023/0024, sem drift), acervo inalterado (1593). Rollback lógico: `drop` das colunas/índice/RPC + `create or replace` das 3 funções de volta aos corpos 0022/0023/0024 (nenhum dado do acervo se perde).
- **`0046`** (`add value 'troca'` — F15, 23/07/2026), **`0047`** (usos de `troca`: recriação de `status_apos_movimentacao`/`aplicar_movimentacao`/`rel_estoque_asof` + `devolver_ao_fornecedor` por `create or replace` puro) e **`0048`** (recriação de `importar_ativos_substituir` — só a expressão da pendência muda: service tag vazia → `'sem service tag'`) — **aditivas**, sem `delete from` de dado no ato do apply → **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, registradas no ledger dos dois. `0046`/`0047` **separadas** de propósito (valor de enum novo não é usável na transação que o adiciona — espelho de 0044/0045). A `0048` faz `create or replace` de uma RPC que **tem** `delete from` no corpo, mas o `apply_migration` do MCP não a barrou (o corpo não é executado no apply, só redefinido). Verificação pós-apply em produção: enum 15/`troca` no fim, 1 assinatura por função + grants corretos (as 2 RPCs de escrita authenticated-only; `rel_estoque_asof` idêntica à 0045), casos novos por `pg_get_functiondef`, `get_advisors(security)` 0 achados NOVOS, acervo inalterado (1596). Rollback lógico: `create or replace` das funções de volta aos corpos 0045/0040 (o enum `add value` é inócuo se não usado).
- **`0049`** (`create or replace view v_pendencias` — ativo `origem='importacao'` deixa de ser cobrado por "termo pendente", 24/07/2026) — **não-destrutiva** (só redefine a view; nenhum `delete from`), então **não bate no gate**: caminho **A** — aplicada por MCP em **ensaio primeiro** e depois produção, registrada no ledger dos dois (version timestamp, name `0049_pendencia_termo_dispensa_import`). Diff vs 0028 = só `and a.origem is distinct from 'importacao'` no ramo de termo (CASE `pendencia` + CASE `desde` + WHERE); 14 colunas idênticas. Verificação pós-apply em produção: `v_pendencias` 1.163→60, "termo pendente" 1.142→2, `import_ainda_termo=0`, `get_advisors(security)` 0 achado novo. **Sem passo de PostgREST/deploy** (colunas inalteradas). Rollback: `create or replace` de volta ao corpo 0028.
- **`0057`** (nome + sobrenome do operador, 24/07/2026) — **aditiva**, sem `delete from` → **não bate no gate**: caminho **A**, aplicada por MCP em **ensaio primeiro** e depois em produção, registrada no ledger dos dois. Renomeia `profiles.nome` → `primeiro_nome`, acrescenta `sobrenome` e devolve `nome` como coluna **GERADA** (`nullif(btrim(primeiro_nome || ' ' || sobrenome), '')`), para que os ~10 pontos do app que leem `profiles.nome` continuem recebendo o nome de exibição sem uma linha de mudança. Dependências levantadas ANTES do apply (`pg_depend` + `pg_get_functiondef`): única view sobre colunas de `profiles` é `v_pendencias_item` — recriada por `create or replace` com a **mesma lista de colunas**, então `v_fila_pendencias` não precisou ser tocada; única função que cita `profiles` é `handle_new_user` — recriada com a trava de domínio da `0041` **intacta** e o `revoke` reafirmado. Verificação em ensaio antes de produção: `DO` block que gravou/leu/reverteu a coluna gerada + o roteiro `supabase/tests/dominios_login.sql` adaptado (16 asserções, 0 falha, tudo em rollback). Contagens de produção **antes = depois**: 9 perfis (9 com nome), 1.597 ativos, `v_fila_pendencias` 58, `v_pendencias_item` 3; `has_function_privilege('anon', 'handle_new_user()', 'execute')` = false. Cache do PostgREST recarregado nos dois. Smoke `smoke-prod.mjs` rodado **depois** do apply contra o app em produção (ainda com o código anterior): **52 OK · 0 falha** — prova que a coluna gerada não quebrou nenhuma leitura já no ar. Rollback sem perda: `drop column nome` → `rename primeiro_nome to nome` → `drop column sobrenome` → `create or replace` da view e do trigger com os corpos da `0052`/`0041`.
- **`0061`–`0066`** (F21 — cargos, vínculo de filiais, RLS por papel, auditoria e storage;
  29/07/2026) — **aditivas** (nenhum `delete from` de dado no ato do apply) → **não batem no
  gate**: caminho **A**, aplicadas por MCP em **ensaio primeiro** e depois em produção,
  registradas no ledger dos dois. Seis migrations, uma por assunto: `0061` enum
  `papel_usuario` + `profiles.papel`/`ativo` + `operador_filiais` + backfill (`BACKFILL = admin`
  do §0 da ordem); `0062` as três funções `security definer`/`stable`
  (`papel_atual`/`e_admin`/`pode_escrever_filial`); `0063` a troca das policies de escrita +
  o **grant de coluna** de `profiles`; `0064` as guardas internas das RPCs; `0065`
  `eventos_admin`; `0066` as policies de `storage.objects`.

  **A armadilha que a `0059` armou, e como foi desarmada.** Nas 6 tabelas em que a `0059`
  dropou a `"leitura operador"` (`ativos`, `filiais`, `itens`, `kits_modelos`, `motivos`,
  `termos_gerados`), a `"operador escreve" FOR ALL` virou a **única porta de LEITURA** — um
  `alter policy` nela teria cegado o app para todo não-admin. A `0063` faz, na ordem e numa
  transação só: (1) recria a policy de SELECT `using (true)`, (2) dropa a FOR ALL, (3) cria
  uma policy **por verbo** de escrita (uma policy por comando, para não reacender
  `multiple_permissive_policies`). `policies_public` foi de **20 → 39**.

  **`0064` e o gate.** O corpo de `importar_ativos_substituir` contém
  `delete from public.ativos` e `delete from public.movimentacoes`, mas o `apply_migration`
  **não barrou** — mesmo precedente da `0048`: o corpo não é executado no apply, só
  redefinido. Os corpos das duas RPCs foram **copiados dos arquivos** das últimas migrations
  que as definiram (`criar_compra_lote` da `0040`, `importar_ativos_substituir` da `0048`), com
  a única diferença sendo o bloco de guarda — **provado por `diff`** antes do apply (15 linhas
  a mais na de import, 12 na de compra, zero outra alteração em 366 e 55 linhas).

  **Verificação pós-apply em produção:**
  - backfill — `papel admin = 9`, vínculos `esperado=54 real=54` (9 perfis × 6 filiais ativas),
    `desativados=0`;
  - as 3 funções — `definer=true`, `vol=s`, `anon=false`, `authenticated=true`;
  - `fp_normalizado` (`md5(regexp_replace(prosrc,'\s+',' ','g'))`) das duas RPCs **idêntico**
    entre **repo, ensaio e produção**: `criar_compra_lote` = `394c24d2…`,
    `importar_ativos_substituir` = `3e3fd387…`. *(Efeito colateral bem-vindo: isso também
    eliminou o drift de CRLF do `criar_compra_lote` que a seção "Sonda de paridade" documenta —
    produção guardava o corpo com CRLF, agora bate com o ensaio.)*
  - só **1** policy de escrita com predicado `true` (o INSERT de `import_logs`, por design);
    as 6 tabelas do grupo com **exatamente 1** porta de leitura cada;
  - grant de coluna de `profiles` = **`primeiro_nome+sobrenome`** e nada mais;
  - acervo **inalterado**: ativos 1230, movimentações 2361, termos 6, import_logs 8,
    lançamentos 9, `v_fila_pendencias` 55, objetos de storage 27 — antes = depois;
  - `notify pgrst, 'reload schema'` nos dois (assinatura não mudou, mas é barato).

  **Paridade ensaio × produção** (sonda normalizada, 6 classes relevantes à fase):
  `enum` 7, `func` 18, `grant_func` 18, `policy_public` 39, `policy_storage` 8 — **fingerprint
  idêntico nas cinco**. `grant_coluna` diverge por construção (428 em produção × 412 no
  ensaio): a diferença são exatamente as **16** linhas de `_bkp_relatorios_gerados_f6a`, a
  tabela de backup retida só em produção de propósito (`0039`/`0058`).

  **Roteiro `supabase/tests/papeis_rls.sql`** rodado nos **dois** bancos: **41 asserções,
  0 falha** em cada. Ele planta 1 linha em `senhas_acesso`, `import_logs`, `eventos_admin` e no
  bucket `backups-import` ANTES de trocar de papel — sem isso, as asserções "não vê nada"
  passariam de graça no Postgres NOVO do CI, onde essas tabelas nascem vazias; e checa o outro
  lado (o admin VÊ), para uma policy que escondesse de todos não passar nos dois testes. Ele cria as próprias fixtures (4 identidades fictícias `f21.*@wap.ind.br`,
  2 ativos `WAP000900x`) dentro de `begin; … rollback;` — conferido depois em produção que
  **nada sobrou** (0 usuários residuais, 0 ativos de teste, contagens de volta ao baseline).
  Antes de rodar em produção foi conferido que **nenhuma** das chaves fictícias colidia com
  dado real (patrimônio, e-mail, uuid, código de motivo, slug de filial: 0 colisões).

  **Advisors (ensaio, antes → depois):** `rls_policy_always_true` **12 → 1** — nenhum WARN
  **novo de RLS**. Aparecem 3 WARN novos de **outra** classe
  (`authenticated_security_definer_function_executable` nas três funções da `0062`): são
  inerentes ao desenho — uma expressão de policy é avaliada com os privilégios de quem
  consulta, então `authenticated` precisa de `EXECUTE`; as três respondem só sobre o próprio
  chamador. Aceitos e registrados em `docs/DECISOES.md` (2026-07-29 · F21).

  **Rollback lógico** (documentado no rodapé de cada migration): dropar as policies novas e
  recriar `"operador escreve" FOR ALL using(true) with check(true)` nas 6, devolver as
  `alter policy` a `true`, `revoke`/`grant update` de `profiles` de volta ao amplo, reaplicar
  os corpos da `0040`/`0048` sem as guardas, e `drop` de `eventos_admin`,
  `operador_filiais`, das 3 funções, das 2 colunas de `profiles` e do enum. **Nenhum dado do
  acervo se perde em nenhum dos passos.**
- **`0067`** (F21 — dois furos achados pela REVISÃO ADVERSARIAL da própria fase; 29/07/2026) —
  **aditiva** (duas `alter policy`, nenhum dado tocado) → caminho **A**, aplicada por MCP em
  **ensaio primeiro** e depois em produção, no ledger dos dois.

  **1. `movimentacoes` gateava a filial que o CLIENTE DECLARA.** A `0063` seguiu a letra do §5
  da ordem (`with check (pode_escrever_filial(filial_id))`) e `movimentacoes.filial_id` é uma
  **coluna livre do payload** — nada no banco exigia que ela batesse com a filial do ativo.
  Deputado confuso clássico, e com o efeito AMPLIFICADO porque `aplicar_movimentacao` é
  `security definer`: o `update ativos` dele nunca passa pela policy "operador atualiza".

  **Exploit REPRODUZIDO no ensaio antes da correção** (não é hipótese):
  operador vinculado só à filial 1, ativo na filial 2, `pode_escrever_filial(2) = false`;
  `insert into movimentacoes (ativo_id=<ativo da f2>, tipo='transferencia', filial_id=1,
  filial_destino_id=1)` → **ACEITO**, e o ativo **migrou para a filial 1**. Dali em diante toda
  escrita nele é legítima para o atacante. Variantes: `tipo='ajuste'` com
  `status_resultante='descartado'` (o ajuste pula a máquina de estados) e `tipo='saida'`
  (troca o detentor) — em ativo de filial alheia nos dois casos. A anon key está no bundle do
  navegador, então o request forjado não exige nada além de `curl`.

  **Correção:** gatear também a filial de **ORIGEM lida do banco** —
  `pode_escrever_filial((snapshot_anterior ->> 'filial_id')::smallint)`. `snapshot_anterior` é
  preenchido pelo próprio trigger, na primeira coisa que ele faz, a partir de
  `select * into v_ativo from ativos where id = new.ativo_id for update` — logo é a filial
  REAL, sob lock, e o trigger **sobrescreve** o que o cliente tenha mandado nesse campo.
  Não se usou `exists (select ... from ativos ...)` porque nesse ponto o trigger JÁ moveu o
  ativo, e o `exists` recusaria a transferência legítima que o §0 autoriza
  (`TRANSFERENCIA_EXIGE_VINCULO_DESTINO = nao`).
  **A ordem de avaliação (BEFORE trigger → WITH CHECK) foi confirmada por TESTE**, não por
  leitura de doc: com a policy nova o exploit passa a 42501 e os quatro fluxos legítimos
  seguem passando (ajuste na vinculada · transferência da vinculada para outra · admin em
  qualquer filial · compra pela RPC, em que o ativo nasce na mesma transação).

  **2. `import_logs` seguia com INSERT `with check (true)`.** A `0063` deixou como estava por
  determinação do §5 ("escrita como está (RPCs)"), no raciocínio de que a policy é vestigial
  porque quem grava é a RPC `security definer`. Certo quanto à RPC, **errado quanto ao resto**:
  `authenticated` tem privilégio de INSERT na TABELA (default do Supabase; nenhuma migration o
  revoga), então qualquer logado — **inclusive o cargo `consulta`** — gravava linhas falsas na
  trilha do import destrutivo por `POST /rest/v1/import_logs`. Trilha que qualquer um escreve
  não é trilha; e com a leitura agora restrita a admin, o admin veria histórico envenenado sem
  como distinguir. Corrigido para `with check ((select e_admin()))` — a RPC não é afetada.

  **Verificação pós-apply nos dois bancos:**
  - `select count(*) from pg_policies where schemaname='public' and cmd<>'SELECT' and
    (qual='true' or with_check='true')` → **0**. Não sobrou NENHUMA policy de escrita
    permissiva em nenhuma tabela.
  - a policy de `movimentacoes` cita `pode_escrever_filial(filial_id)` **e** `snapshot_anterior`.
  - acervo inalterado: ativos 1230, movimentações 2361, senhas 4, import_logs 8, storage 27.
  - **advisor `rls_policy_always_true`: 12 (entrada da F21) → 1 (após 0063) → 0 (após 0067).**

  **Cobertura de teste:** o roteiro `supabase/tests/papeis_rls.sql` foi de 41 para **45
  asserções**, e as quatro novas são exatamente a lacuna que deixou o furo passar —
  `2c-bis` (o caso CRUZADO: `filial_id` mentido em ativo de filial alheia), `2c-ter` (o ativo
  **não** migrou), `2h` (a transferência LEGÍTIMA continua passando — sem ela, a correção
  poderia ter fechado o furo quebrando o fluxo normal) e `3f-bis` (o operador não forja a
  trilha do import). O `2c` que já existia **não** cobria: lá o ativo e o `filial_id` são os
  dois da filial não vinculada, então ele passaria mesmo sem a correção. **45/0 nos dois bancos.**

  **Rollback:**
  `alter policy "operador insere" on public.movimentacoes with check (public.pode_escrever_filial(filial_id));`
  `alter policy "operador insere" on public.import_logs with check (true);`
  (reabre os dois furos — só faz sentido junto de um rollback completo da F21).
- **`0068`** (F21 — o mesmo furo da `0067` no irmão que ela não alcançou; achado pela
  **RE-REVISÃO** das correções; 29/07/2026) — **aditiva** (uma função nova + um `alter policy`),
  caminho **A**, aplicada por MCP em **ensaio primeiro** e depois em produção, no ledger dos dois.

  **O furo.** A `0067` fechou o padrão "gatear dado que o escritor escolhe" em `movimentacoes` e
  deixou `lancamentos_item` intacto. Ali `filial_id` **é** o objeto da escrita (o saldo daquela
  filial), então o predicado é auto-consistente — mas a OUTRA coluna da mesma linha,
  `estorna_id`, é ponteiro livre para qualquer linha da tabela, e nada a conferia: a FK da `0015`
  não filtra e o trigger `valida_lancamento_item` olha saldo e reserva, sem mencioná-la.
  Um operador da filial 1 estornava um lançamento da filial 2 declarando `filial_id: 1`. O dano
  cai todo fora da filial dele: o lançamento alheio passa a aparecer **"estornado"** no histórico
  e no relatório (a derivação é "existe alguém apontando para mim", **sem filtro de filial**), o
  **saldo continua contando** — histórico e saldo se contradizem — e o índice único queima a vaga,
  então o operador legítimo **nunca mais** consegue estorná-lo (a tabela é imutável).

  **Por que a primeira revisão errou ao refutar.** Ela classificou como "folga pré-existente do
  esquema, não da fase" — verdade quanto ao esquema (`estorna_id` é FK livre desde a `0015`), mas
  a conclusão não segue: **foi a F21 que transformou filial em fronteira de escrita**. Antes da
  `0063`, `with check (true)` tornava o caso irrelevante; não havia privilégio a violar.

  **A armadilha do fecho, encontrada ao testar antes de aplicar.** A primeira tentativa usou um
  `exists` inline; dentro de um subselect **na própria tabela**, a referência nua `estorna_id`
  resolve para a coluna do ALIAS da subconsulta — a condição virava `o.id = o.estorna_id`, sempre
  falsa, e o predicado **recusava o estorno legítimo** (medido: ataque recusado E legítimo
  recusado). Trocado por `estorno_item_coerente(p_estorna_id, p_filial, p_item)` —
  `security definer`, `stable`, parâmetros nomeados, sem escopo ambíguo possível.

  **Provado no ensaio antes de aplicar em produção:**
  ```
  ATAQUE estorna_id de OUTRA filial   → RECUSADO (42501)
  ATAQUE estorna_id de OUTRO item     → RECUSADO (23514, um check pegou antes)
  LEGÍTIMO estorno mesma filial+item  → ACEITO
  LEGÍTIMO lançamento sem estorno     → ACEITO
  ```

  **Verificação pós-apply nos dois bancos:** a policy `"operador lanca"` cita
  `pode_escrever_filial` **e** `estorno_item_coerente`; `anon` sem execute e `authenticated` com
  execute na função nova; **0** policies de escrita com predicado `true` em qualquer tabela;
  `lancamentos_item` inalterado (9 linhas em produção), acervo intocado (1230/2361).
  Roteiro `papeis_rls.sql`: **45 → 47 asserções** (`2e-bis` ataque, `2e-ter` legítimo),
  **47/0 nos dois bancos**.

  **Rollback:**
  `alter policy "operador lanca" on public.lancamentos_item with check (public.pode_escrever_filial(filial_id));`
  `drop function public.estorno_item_coerente(uuid, smallint, smallint);`
- **`0069`** (F21 — o TERMO, a linha E o `.docx`, também é matéria de FILIAL; achado pela
  **TERCEIRA volta** da revisão adversarial da fase; 30/07/2026) — **aditiva** (3 funções novas,
  1 índice, 6 `alter policy`; nenhuma linha e nenhum objeto de Storage tocado), caminho **A**,
  aplicada por MCP em **ensaio primeiro** e depois em produção, no ledger dos dois.

  **O furo.** A `0063` gateou `termos_gerados` e o bucket `termos` **só pelo CARGO**, com a
  justificativa escrita no próprio corpo: *"sem filial própria (guarda `ativo_ids[]`), então o
  predicado é o cargo. O recorte por filial deste fluxo vive na action."* "Vive na action" é
  exatamente o que o CLAUDE.md proíbe como ÚNICA linha — e aqui a action não é atravessada:
  `authenticated` tem privilégio de tabela em `termos_gerados` e em `storage.objects`, e a anon key
  está no bundle do navegador. Um operador vinculado só à filial 1 apagava a LINHA e **DESTRUÍA o
  `.docx` assinado** de um termo da filial 5 por `curl`, e o ativo continuava com
  `termo_assinado = 'sim'` — sem arquivo, sem nada no sistema saber da perda. Terceira aparição do
  padrão que a `0067` e a `0068` fecharam, e a pior das três: aquelas corrompiam número, esta
  destrói documento.

  **A correção — três predicados que se sustentam um no outro.** `pode_escrever_termo(uuid[])` (a
  filial de cada ativo, **LIDA de `ativos`** numa função `security definer`, nunca declarada pelo
  cliente) nas 3 policies de escrita da tabela; `pode_escrever_arquivo_termo(text)` nas 3 do bucket
  (`bool_and` de `pode_escrever_termo` sobre as linhas cujo `arquivo_path` bate com o nome do
  objeto, com `coalesce(…, true)` para nome que NENHUMA linha referencia); e dois invariantes **só
  nas WITH CHECK** — `termo_ancora_coerente(uuid[], uuid[])` (`ativo_ids` tem de ser o conjunto
  derivado das movimentações citadas) e `arquivo_path = id::text || '.docx'`. Mais o índice
  `termos_gerados_arquivo_path_idx`, que serve o predicado de storage.
  - **Por que os dois invariantes, e não só a filial:** sem a âncora, gatear `ativo_ids` é parede de
    papel no INSERT — o atacante declara os ativos DELE, passa o gate e **queima a vaga** da chave
    única `(tipo, movimentacao_ids)` da outra filial, que nunca mais gera aquele termo (é
    literalmente o dano da `0068`, em documento). Sem o path canônico, ele aponta a própria linha
    para o `.docx` alheio e, pelo `bool_and`, passa a **BLOQUEAR** a regeneração legítima da outra
    filial — um DoS de brinde ao fechar o furo.
  - **Por que o `coalesce(…, true)` no storage:** `persistirTermo` sobe o objeto **ANTES** de gravar
    a linha, então uma policy que exigisse linha correspondente quebraria TODA geração de termo. E
    não abre nada: para destruir o `.docx` da f5, o nome **ESTÁ** referenciado pela linha da f5.
  - **As USING ficam só com a filial**, de propósito: é isso que deixa o admin APAGAR linha legada
    ou degenerada. Quem barra a CRIAÇÃO de linha inválida são as WITH CHECK.
  - ⚠ **Consequência para código novo:** quem inserir em `termos_gerados` tem de **mandar o `id`** e
    derivar o path dele. Deixar o default `gen_random_uuid()` gerar o id e mandar um path qualquer
    passa a ser recusado.

  **⚠ A consulta de PRÉ-APLICAÇÃO é OBRIGATÓRIA — e a que importa é a última.** Nenhum contador
  impede o apply (a migration é aditiva e as USING não exigem coerência), mas cada um muda **quem
  alcança** as linhas que já existem; e a junção `arquivo_path × storage.objects.name` é a única que
  diz se a metade de **STORAGE é no-op**: os dois lados casam por **igualdade de string**, e nada no
  banco garante essa igualdade — só o código. Se `path_sem_objeto > 0`, o nome daquela linha é
  "não referenciado" pelo lado de storage, o `coalesce(…, true)` vale, e o **DELETE do `.docx` dela
  continua aberto** — com todas as verificações pós-apply verdes. Normalize o path (ou renomeie o
  objeto) antes de confiar na metade de storage para aquelas linhas. Os 5 contadores
  (`total`, `path_fora_do_padrao`, `com_ativo_morto`, `ativo_ids_vazio`, `incoerente`) e as duas
  junções estão no cabeçalho da migration, prontos para colar. A que faltava, e que não pode faltar
  de novo:

  ```sql
  -- a metade de STORAGE é no-op para toda linha em que path_sem_objeto contar
  select count(*) filter (where o.name is null)     as path_sem_objeto,
         count(*) filter (where o.name is not null) as path_casa_objeto
    from public.termos_gerados t
    left join storage.objects o
           on o.bucket_id = 'termos' and o.name = t.arquivo_path;
  ```

  **Medido em produção ANTES do apply:** **6** termos · `path_fora_do_padrao` **0** ·
  `com_ativo_morto` **0** · `ativo_ids_vazio` **0** · `incoerente` **0** · junção
  `arquivo_path × storage.objects.name` **6/6 casando** (nenhuma linha legada vira matéria de admin,
  e a metade de storage protege todas as 6) · **3** objetos do bucket `termos` não referenciados por
  linha nenhuma (9 objetos, 6 linhas — resíduo de regeneração, que o fallback deixa livre por
  desenho).

  **⚠ `e_admin()` é a PRIMEIRA condição de `pode_escrever_termo`, FORA do `and`.** A primeira
  escrita da migration tinha `coalesce(array_length(p_ativo_ids,1),0) > 0 and (e_admin() or not
  exists (…))`, e **três refutadores independentes** acharam o mesmo defeito: para
  `ativo_ids = '{}'` isso é FALSE para todo mundo, admin incluído — nas 3 policies da tabela E no
  predicado de storage (`bool_and(false)`). A linha viraria lixo **IMORTAL** (nem UPDATE nem DELETE
  por sessão nenhuma), o `.docx` dela indestrutível e insobrescrevível, e a vaga
  `(tipo, movimentacao_ids)` queimada **para sempre** — exatamente o dano que a migration existe
  para fechar, criado por ela. O estado é representável hoje (não há CHECK sobre `ativo_ids`) e é o
  resíduo que um atacante deixaria. A asserção `5h` do roteiro existe **só** para travar essa ordem;
  quem mexer no predicado e a vir falhar não deve "consertar o teste".

  **⚠ O exploit NÃO foi reproduzido** (ao contrário da `0067`/`0068`): a revisão foi read-only e
  `termos_gerados` tem ZERO linhas no ensaio, então não havia vítima sem plantar fixture. A prova é
  o roteiro, rodado **ANTES** do apply (os `2i-bis` devem FALHAR, provando o furo aberto) e
  **DEPOIS** (todos verdes).

  **Verificação pós-apply nos dois bancos:** as 3 funções com `prosecdef = true`, `anon` sem execute
  e `authenticated` com execute; as 3 policies da tabela citando `pode_escrever_termo` e as 3 do
  bucket citando `pode_escrever_arquivo_termo`; `policies_public` **39** e `policies_storage` **8**
  — **inalterados**, porque são `alter policy` e não policy nova; acervo **idêntico ao pré**
  (ativos 1230, movs 2363, perfis 10, termos 6, objetos `termos` 9).
  **Advisor:** `authenticated_security_definer_function_executable` **cresce em 3** — inerente ao
  desenho, porque a expressão de policy é avaliada com os privilégios de quem consulta e portanto
  `authenticated` precisa de EXECUTE; as três respondem só sobre o próprio chamador. Precedente
  aceito na `0062` (as três da fase) e na `0068` (`estorno_item_coerente`).
  **Descoberta lateral que economiza uma hora:** `storage.objects` tem um trigger
  `protect_objects_delete` (`BEFORE DELETE FOR EACH STATEMENT`) que barra **toda** exclusão direta
  por SQL — a policy de DELETE do bucket só é exercitada pela API de Storage. Quem for testar
  exclusão de objeto por `psql`/MCP bate no trigger, não na policy; por isso a asserção prova o
  INSERT sobre o path alheio, que usa o mesmo predicado.

  **Rollback** (reabre o furo — só faz sentido junto de um rollback completo da F21): as 6
  `alter policy` de volta a `(select public.papel_atual()) in ('admin','operador')` (as 3 de storage
  com o `bucket_id = 'termos' and` na frente), `drop index public.termos_gerados_arquivo_path_idx` e
  `drop function` das três. Lista literal no rodapé do cabeçalho da migration.
- **`0070`** (F21 — a desativação passa a fechar a **LEITURA**; mesma revisão da `0069`;
  30/07/2026) — **aditiva**: **14 `alter policy`, zero objeto novo, zero dado tocado**. Caminho
  **A**, ensaio primeiro e depois produção, no ledger dos dois.

  **O furo.** A `0061` escreveu, e a `0063` repetiu como "REGRA DE OURO", que `profiles.ativo =
  false` vale "no request seguinte". Vale — **para escrita**. Toda policy de SELECT seguia
  `using (true)`, e o `authenticated` de quem foi desligado continua sendo `authenticated` enquanto
  o access token dele não expira (~1h). Nesse intervalo o acervo inteiro saía por
  `GET /rest/v1/ativos?select=*` com a anon key do bundle — colaborador, setor, filial e patrimônio
  —, e o mesmo valia para `movimentacoes` (quem levou o quê), `termos_gerados`, `anotacoes` e
  `profiles` (a equipe toda). As **5 views** (`security_invoker = true`) e as **7 RPCs `rel_*`**
  (INVOKER) **derivavam** o mesmo vazamento. O ban do Auth (`ban_duration`) impede login NOVO; não
  invalida o token que a pessoa já tem na mão. A UI mandava o desligado para
  `/login?erro=acesso-desativado`, mas a UI nunca foi a defesa.

  **A correção.** Um predicado só — `using ((select public.papel_atual()) is not null)` — nas **13**
  policies de SELECT de `public` (`ativos`, `movimentacoes`, `anotacoes`, `lancamentos_item`,
  `termos_gerados`, `relatorios_gerados`, `filiais`, `motivos`, `itens`, `kits_modelos`, `profiles`,
  `operador_filiais`, `pendencias_item`) **+ 1** no SELECT do bucket `termos`. `papel_atual()` é NULL
  em três situações equivalentes a "não é mais gente daqui": sem sessão, sem linha em `profiles`,
  perfil desativado. **Não é recorte por cargo nem por filial** — `consulta` segue lendo o app
  inteiro e `operador` segue lendo todas as filiais; para todo perfil ATIVO o resultado é idêntico
  ao de antes, linha por linha. As views e as RPCs `rel_*` herdam **sem DDL**: é o mesmo
  `security_invoker`/INVOKER que fazia o vazamento derivar. Ficam de fora por já satisfazerem a
  invariante: `import_logs`/`eventos_admin` (SELECT já é `(select e_admin())`),
  `senhas_acesso`/`senha_tentativas` (RLS ligada e ZERO policy) e o bucket `backups-import` (as 4
  policies já são `e_admin()`, `0066`). O `(select …)` é obrigatório e não estético: sem argumento de
  coluna a expressão vira **InitPlan**, avaliada uma vez por statement e não por linha — e são estas
  as policies que varrem o acervo.

  **⚠ Isto é EMENDA a uma invariante escrita em quatro lugares** ("todo logado LÊ tudo"):
  `CLAUDE.md`, ADR-002 §3, o cabeçalho da `0063` e `docs/MATRIZ-REGRAS.md` (R-ACC-02 / C7 /
  R-ACC-21). Os quatro são emendados no MESMO commit. Deixar a lei escrita dizendo o contrário do
  banco é como se produz o próximo furo: o próximo agente "corrige a regressão" e reabre isto.

  **⚠ A ausência de recursão em `profiles` é PREMISSA DE CATÁLOGO, não intuição.** A policy de
  SELECT de `profiles` passa a chamar `papel_atual()`, que LÊ `profiles`. Não recursa porque
  `papel_atual()` tem `prosecdef = true` com `proowner = postgres` (o `prosecdef` também impede o
  inlining da função SQL, o outro caminho de auto-referência) **e** `public.profiles` tem
  `relowner = postgres` + `relforcerowsecurity = false` — dentro da função `current_user` é o dono
  da tabela, e dono ignora RLS na própria tabela salvo `FORCE ROW LEVEL SECURITY`. **Confira os três
  antes de aplicar em banco novo** (`pg_class.relowner`/`relforcerowsecurity` + `pg_proc.prosecdef`/
  `proowner`); se algum cair, o erro é `42P17 "infinite recursion detected in policy for relation"`
  — ruidoso e imediato, não silencioso. O roteiro provoca esse caminho de propósito (`1b-bis`).

  **⚠ Operacional: a conta de `SMOKE_EMAIL` tem de estar ATIVA em `profiles`.**
  `scripts/smoke/smoke-prod.mjs` é o **único** consumidor que roda sob SESSÃO — anon key +
  `signInWithPassword`, e não service role —, então com a `0070` um perfil desligado passa a falhar
  **em massa** nas leituras (`v_fila_pendencias`, `v_pendencias`, `rel_saldo_itens` ×2, `rel_resumo`,
  `rel_mov_por_mes`, `v_estoque_atual`). Falhar aí é **por desenho**, não regressão: quem desativar
  a conta do smoke em `/admin/usuarios` derruba o smoke, não o app. **O outro ponto que quebra se
  alguém mexer num default:** `definirAcesso` (`actions/auth.ts`) faz
  `update profiles … .select('id')`, e o `.select()` depois de um UPDATE do PostgREST **exige** a
  policy de SELECT. Hoje funciona porque `handle_new_user` insere só (id, primeiro_nome, sobrenome) e
  `papel`/`ativo` assumem os defaults da `0061` (`'operador'`, `true`), então `papel_atual()` já é
  não-nulo no primeiro request de quem aceitou o convite. Quem mudar o default de `profiles.ativo`
  para `false` ("conta pendente até aceitar") mata o convite na última tela, sem erro no banco.

  **Verificação pós-apply nos dois bancos:** **0** policies de SELECT com `qual = 'true'` e **0** de
  escrita com predicado `true`; `policies_public` **39** e `policies_storage` **8** (inalterados —
  são `alter policy`); acervo **idêntico ao pré** (ativos 1230, movs 2363, perfis 10, termos 6,
  objetos `termos` 9). Advisor **sem mudança nenhuma** (`rls_policy_always_true` não aponta policy de
  SELECT). O visualizador por senha fica **intocado**: ele é `anon` e é servido pelo client de
  service role (`rolbypassrls = true`), então estas policies nunca foram a porta dele — e é por isso
  que a `0070` também **não fecha nada** do lado do viewer, onde o mecanismo continua sendo a
  revogação da senha.

  **Roteiro `supabase/tests/papeis_rls.sql`** (cobrindo as duas migrations): **47 → 64 asserções**,
  **64 OK / 0 falhas nos DOIS bancos**, sem resíduo (conferido depois em produção:
  `residuo_ativos` 0, `residuo_contas` 0). As de ataque entram **em par** com as legítimas, de
  propósito: `4d`/`4e`/`4f`/`4g` (o desligado não lê `ativos`, `profiles`, os `.docx` do bucket nem a
  view) ao lado de `1b-bis`/`1b-ter` (o cargo mais fraco, ATIVO, continua lendo `profiles` e
  `v_estoque_atual`) — sem esse par, um gate que **cegasse o app** passaria verde.

  **Rollback:** as 13 `alter policy` de volta a `using (true)` e a de storage a
  `using (bucket_id = 'termos')` — lista literal no rodapé do cabeçalho da migration. As reversões
  da `0069` e da `0070` são **independentes de propósito**: derrubar o gate de leitura não pode
  reabrir o furo do termo.
- **Retroativo C3 (F15 — toca dado, caminho B).** UPDATE de **2 linhas** de `movimentacoes` (`tipo 'compra'→'troca'` no nascimento dos substitutos já registrados, `ativo_id in (select id from ativos where substitui_ativo_id is not null)`). O classificador **não barrou** um UPDATE de 2 linhas via `execute_sql`. Backup das linhas em `scratchpad/f15/retroativo-backup.md` (WAP0005656/WAP0005657); antes=depois conferido (`compra` de substituto 2→0, `troca` 0→2); `status_resultante`/estado dos ativos intactos (a transição de `troca` é a mesma da `compra`). Rollback: `update movimentacoes set tipo='compra' where id in ('5cc393bc-…','95d3d096-…')`.

### Como conferir o efeito (sem depender do ledger)

```sql
-- 0039 aplicada? Nenhuma tabela de backup órfã deve sobrar.
select count(*) as tabelas_backup
from pg_tables where schemaname = 'public' and tablename like 'backup%';
-- esperado: 0

-- 0040 aplicada? A guarda de contagens tem de estar no corpo da RPC.
select pg_get_functiondef(p.oid) like '%p_contagens is null%' as tem_guarda
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'importar_ativos_substituir';
-- esperado: true (exatamente 1 linha)
```

### ⚠️ O ledger NÃO é o controle de integridade (medição de 24/07/2026)

**Nunca rode `supabase db push` contra produção a partir deste repo.** A reauditoria de dívida técnica (24/07) mediu o ledger e achou uma incompatibilidade **estrutural**, não uma simples defasagem:

- As `version` do ledger são **timestamps de 14 dígitos gerados pelo MCP no ato do apply** (`20260722145340` → `0041_dominios_login`); os arquivos do repo usam prefixo sequencial (`0041_…sql`). A doc do Supabase confirma que a CLI identifica migration **pelo timestamp do nome do arquivo** ("a new row will be inserted into the migration history table with timestamp as its unique id").
- Portanto os dois esquemas **não casam para praticamente nenhuma migration** — não só para as faltantes. Um `db push` tentaria reaplicar migrations já aplicadas.
- **O dano concreto:** a RPC do import é redefinida em cadeia (`0032`→`0037`→**`0048`**). Reaplicar `0031`–`0037` **regrediria** o corpo vivo para o da `0037`, desfazendo a `0048`.

**O controle que funciona (e que já se usa):**
1. **Sonda de efeito** — conferir o objeto no banco (`pg_get_functiondef`, `information_schema`, `has_function_privilege`), não o ledger. É o método de fingerprint que a F19 usou para provar paridade ensaio×produção. ⚠ **Mas a forma CRUA do fingerprint tem um falso-positivo — use a sonda normalizada da seção abaixo.**
2. **Job `banco` do CI** — prova que as 56 migrations aplicam limpo e em ordem num Postgres novo.
3. **Verificação pós-apply** do passo 5 acima.

### Sonda de paridade ensaio × produção (use ESTA — a crua engana)

⚠ **`md5(pg_get_functiondef(oid))` cru NÃO serve para comparar ambientes.** Em 25/07/2026 ele
apontou `criar_compra_lote` como divergente entre ensaio e produção, e a conclusão ("a `0055`/`0040`
não chegaram ao ensaio") era **falsa**: a diferença era só o **fim de linha** — produção guarda o
corpo com CRLF e o ensaio com LF (1.664 vs 1.617 bytes, exatamente os 47 `\r`). O fim de linha
depende de **como** o SQL foi aplicado (SQL Editor no Windows vs MCP), não do que ele faz.
**Normalize sempre**, e ao achar divergência **abra a diferença antes de reportá-la**.

Rode o bloco abaixo nos DOIS projetos e compare linha a linha (10 classes de objeto). O filtro
`not like '\_%'` exclui as tabelas de backup ad-hoc, que existem só em produção por construção.

```sql
with
funcs as (
  select 'func' classe, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' obj,
         md5(regexp_replace(pg_get_functiondef(p.oid),'\s+',' ','g')||p.prosecdef::text||p.provolatile::text) fp
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'),
cols as (
  select 'coluna', c.table_name||'.'||c.column_name,
         md5(c.data_type||c.is_nullable||coalesce(regexp_replace(c.column_default,'\s+',' ','g'),'-')||coalesce(c.character_maximum_length::text,'-'))
  from information_schema.columns c where c.table_schema='public' and c.table_name not like '\_%'),
cons as (
  select 'constraint', conrelid::regclass::text||'.'||conname,
         md5(regexp_replace(pg_get_constraintdef(oid),'\s+',' ','g'))
  from pg_constraint where connamespace='public'::regnamespace),
idx as (
  select 'indice', indexname, md5(regexp_replace(indexdef,'\s+',' ','g'))
  from pg_indexes where schemaname='public'),
pol as (
  select 'policy', tablename||'.'||policyname,
         md5(cmd||roles::text||coalesce(regexp_replace(qual,'\s+',' ','g'),'-')||coalesce(regexp_replace(with_check,'\s+',' ','g'),'-')||permissive::text)
  from pg_policies where schemaname='public'),
vws as (
  select 'view', c.relname,
         md5(regexp_replace(pg_get_viewdef(c.oid,true),'\s+',' ','g')||coalesce(c.reloptions::text,'-'))
  from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='v'),
enums as (
  select 'enum', t.typname, md5(string_agg(e.enumlabel, ',' order by e.enumsortorder))
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace ns on ns.oid=t.typnamespace where ns.nspname='public' group by t.typname),
trg as (
  select 'trigger', c.relname||'.'||t.tgname, md5(regexp_replace(pg_get_triggerdef(t.oid),'\s+',' ','g'))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and not t.tgisinternal),
rls as (
  select 'rls_flag', c.relname, md5(c.relrowsecurity::text||c.relforcerowsecurity::text)
  from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname='public' and c.relkind='r' and c.relname not like '\_%'),
grants as (
  select 'grant_func', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         md5(has_function_privilege('anon',p.oid,'execute')::text
           ||has_function_privilege('authenticated',p.oid,'execute')::text
           ||has_function_privilege('service_role',p.oid,'execute')::text)
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'),
tudo as (
  select * from funcs union all select * from cols union all select * from cons
  union all select * from idx union all select * from pol union all select * from vws
  union all select * from enums union all select * from trg union all select * from rls
  union all select * from grants)
select classe, count(*) as objetos, md5(string_agg(obj||'='||fp,'|' order by obj)) as fp_classe
from tudo group by classe order by classe;
```

Classe que divergir → repita só aquela classe **sem** o `group by`, e faça o `except` dos dois
resultados para achar o objeto exato.

**Resultado de 25/07/2026 (depois do rollout de `0056`/`0058`/`0059`/`0060`):** as **10 classes
batem** entre ensaio e produção — 15 funções, 15 grants, 201 colunas, 56 constraints, 47 índices,
20 policies, 5 views, 6 enums, 2 triggers, 15 flags de RLS. Paridade completa; a única diferença
fora do filtro é `_bkp_relatorios_gerados_f6a`, retida em produção de propósito.

**Estado medido em 24/07/2026:** 56 migrations no repo, **46 no ledger** *(a `0057` entrou no mesmo dia, por caminho A, no ledger de ensaio e produção)*. As 10 ausentes (`0031`–`0037`, `0039`, `0040`, `0056`) foram **todas sondadas e estão aplicadas** — inclusive a **`0056`** (as sete RPCs `rel_*` já estão com `anon` sem `execute`), que o `CHANGELOG` ainda dava como pendente de handoff.

### Reconciliação (opcional — decisão do Johnny; **cosmética**)
Registrar no ledger as migrations já aplicadas, para o histórico bater com produção. **Metadados apenas** (não recria nada — só insere linhas) e, pelo que está acima, **não torna o repo pushável**: serve para leitura humana do histórico, não como garantia. Rodar no SQL Editor de produção:

```sql
-- Registra 0031–0037, 0039 e 0040 como já aplicadas (idempotente por 'on conflict').
-- version = prefixo do nome do arquivo (mesmo padrão das 0001–0007 no ledger).
-- RODE ANTES os dois SELECTs de "Como conferir o efeito": 0039/0040 entram aqui
-- porque a medição de 23/07/2026 provou que os EFEITOS delas estão em produção.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('0031','import_logs'),
  ('0032','import_rpcs'),
  ('0033','import_correcoes'),
  ('0034','import_melhorias'),
  ('0035','import_compra_data_real_no_relatorio'),
  ('0036','reverter_compra_abertura_baseline'),
  ('0037','import_patrimonio_forcado'),
  ('0039','drop_backups_orfaos'),
  ('0040','hardening_rpcs'),
  ('0056','rel_rpcs_revoke_anon')   -- aplicada (medido 24/07: anon sem execute nas 7 rel_*)
on conflict (version) do nothing;
```

> **Confira o `name` real dos arquivos** em `supabase/migrations/` antes de rodar (o `version` é que importa para o `on conflict`; o `name` é só rótulo).
Conferir antes: `select version, name from supabase_migrations.schema_migrations order by version;`. Reversível (`delete` das mesmas `version`). Como o apply de produção é manual (gate), esta reconciliação é para **fidelidade do histórico**, não muda o funcionamento.

## Roteiros de teste SQL — rode TODOS ao mexer em função/trigger (regra nova, F17)

**Mudou uma função, um trigger, a máquina de estados ou uma RPC (qualquer `create or replace` de função, ou um `add value` de enum que muda comportamento)? Rode TODOS os roteiros de `supabase/tests/*.sql` antes do push — não só o roteiro novo da fase.**

Por quê: `npm run lint` / `test` / `build` **não executam** os roteiros SQL — só o job `banco` do CI (GitHub Actions) os roda (sobe um Postgres, aplica `0001`→última migration e roda cada `*.sql` com `psql`, falhando em qualquer `WARNING: ✗`). Foi exatamente o furo da **F15**: a `0047` mudou a RPC `devolver_ao_fornecedor` (o substituto passou a nascer por `troca`, não `compra`); o roteiro novo `troca.sql` cobriu o comportamento novo, mas o roteiro `manutencao_fornecedor.sql` (F14) **continuou exigindo `compra`** no cenário 4d → o job `banco` ficou vermelho a cada run desde o push da F15, sem que `lint/test/build` locais acusassem nada. Corrigido na **F17** (4d passou a exigir `troca`; ata em `docs/DECISOES.md`).

Como rodar sem Docker/psql local (este ambiente): prove os roteiros no projeto de **ENSAIO** via MCP Supabase `execute_sql` — bloco `begin; … rollback;` que devolve **LINHAS** (o MCP engole `NOTICE`/`WARNING`, então não confie neles: compare o valor real numa `select` final, ex.: `select tipo from movimentacoes where id = <substituto_mov_id>`). Confirme antes que o ensaio está com as migrations em dia (`list_migrations`). A prova final continua sendo o job `banco` **verde** no GitHub após o push.

## Armadilhas conhecidas (todas já aconteceram)
- **Arquivo errado no SQL Editor** — rodar a migration anterior por engano (F7E: 0033 no lugar da 0034 → nada aplicado, erro `42701` depois). Mitigação: a verificação pós-apply do passo 5.
- **Cache do PostgREST** — sem `notify pgrst`, a API recusa a nova assinatura da RPC. Mitigação: passo 6.
- **Overload de função** — recriar com assinatura diferente (ou pular a ordem das migrations que fazem `drop`+`create`) deixa duas versões coexistindo → PostgREST não resolve a chamada. Mitigação: sempre `create or replace` puro com assinatura idêntica; verificação do passo 5.
- **Ordem migration → deploy** — se a migration muda a assinatura/colunas que o código novo usa, aplicar o SQL ANTES do deploy da Vercel.
- **Roteiro de teste defasado após mudar função/trigger** — a F15 mudou a RPC mas só atualizou o roteiro novo; o roteiro antigo (`manutencao_fornecedor.sql` 4d) ficou exigindo o comportamento velho (`compra`) e derrubou o job `banco` silenciosamente (lint/test/build locais não rodam SQL). Mitigação: a regra "rode TODOS os roteiros" da seção acima.
- **Asserção nova do `papeis_rls.sql` sobre relação FORA do bloco de grants → `42501` só no CI, e leva o arquivo inteiro.** O roteiro é o único que faz `set local role authenticated`, e um projeto Supabase **hospedado** concede a `anon`/`authenticated` os privilégios de TABELA de `public` por *default privilege*. O Postgres NOVO que o job `banco` sobe **não** reproduz esses defaults. Então uma asserção que faça `select … from X` (ou escreva em X) sem X no bloco de grants explícito do topo do roteiro dá `ERROR: permission denied for table X` (`42501`), **aborta o `do $$` inteiro** — levando com ele todas as seções seguintes, que nem chegam a rodar — e **passa VERDE no ensaio**. É uma resposta certa para a pergunta errada: ali se mede *policy (RLS)*, não privilégio; quem mede privilégio é `seguranca_catalogo.sql`. **Inclusive VIEW:** `v_estoque_atual` precisou de `grant` próprio, porque o atalho `grant … on all tables in schema public` cobria views e o bloco explícito não — e o atalho está barrado no próprio roteiro: a variante de UPDATE cai no bloco `do $trava$` (devolveria o UPDATE de TABELA em `profiles` que a `0063` revogou, e a asserção `3g`, de escalada de privilégio, passaria por engano), e a de SELECT foi proibida pela regra escrita ali ("só entra a tabela/verbo que uma asserção realmente usa"), porque `on all tables` mascararia qualquer REVOKE futuro. Aconteceu com `ativos` no primeiro push da F21 e de novo com `v_estoque_atual` na revisão da `0070`. Mitigação: toda asserção nova entra **junto** com a sua relação/verbo no bloco de grants, com o comentário dizendo qual asserção a usa — e a prova é o job `banco` verde, não o run no ensaio.

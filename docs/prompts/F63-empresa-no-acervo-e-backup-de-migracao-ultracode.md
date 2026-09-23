# F63 — `empresa_id` no acervo (lote 1) e a disciplina de backup de migração

Ordem de serviço da fase **F63** do `PLANO-MULTIEMPRESA.md` (§7), a segunda da virada. A fase dá `empresa_id` às
**oito tabelas do acervo** (`ativos`, `movimentacoes`, `lancamentos_item`, `pendencias_item`, `anotacoes`,
`termos_gerados`, `colaboradores`, `itens`), preenchida com a WAP **sem um único `update`**. E cria a disciplina que
faltava para migration que mexe em dado: a classe declarada no cabeçalho, o classificador que confere a classe contra o
que o arquivo de fato executa, e a tabela `backups_migration` com o par de backup obrigatório.

Duas condições não se negociam. **Nenhuma linha do acervo é reescrita**: a coluna nasce pelo default não-volátil do
PG 11+, com o valor guardado no catálogo. A prova é dupla, nos dois bancos: o `relfilenode` igual antes e depois
(nenhuma reescrita da tabela) e o `xmin` de cada linha igual (nenhum `update`). Ninguém
escreve o `update` de backfill, e ninguém abre a janela `estoque.dev_destrutivo`. E **nada lê a coluna**: nenhuma
policy, query ou tela. O recorte é da F66.

**A decisão do Johnny (23/09/2026) muda a ficha num ponto: o default fica até a F67.** A ficha manda `drop default`
logo depois do `not null`. A medição (fato 9) mostrou o custo: tirar o default obriga 18 funções SQL do caminho quente,
9 pontos do app, o seed, a carga, a restauração e 27 dos 41 roteiros a informar a empresa. E três casos (`itens`,
`termos_gerados`, colaborador sem filial) não têm pai de onde tirá-la: iam gravar `empresa_legada()` explícito, que é a
mesma herança silenciosa espalhada em 30 lugares. A fonte certa (a empresa de quem escreve) só existe quando a escrita
ganha a empresa, na F67. Até lá vale o idioma da decisão (i) da F62 para `filiais`: o default é
`public.empresa_legada()`, documentado na coluna e na ata. Esta fase fica pequena e inerte. Nenhum escritor muda, e o
CI verde sem tocá-los é a prova.

Depois dela vem a F64, que faz o mesmo para vocabulário e infra.

---

## Estado de partida: os 26 fatos medidos no disco, no git e nos dois bancos (23/09/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje contra a árvore e o git, e contra o catálogo e as tabelas
> de PRODUÇÃO e do ENSAIO pelo MCP da Supabase, só leitura e só contagem. **Não** foram copiados da ficha, que é de
> 04/09 (v1.49.1), anterior às F45→F62. Onde divergem dela, a divergência está marcada com ⚠. O prompt manda o agente
> **remedir antes de aceitar**.

**Onde o projeto parou**

1. `main` em **`3c1c761`** (merge do PR #71, o fecho de documentação da F62), com a tag anotada **`v1.67.0`** nesse
   commit; `package.json` em `1.67.0`. Última migration **`0158_cargo_em_membros.sql`**: 157 arquivos, `0001`→`0158`, e
   a `0029` é gap real. O ledger dos dois bancos termina em `cargo_em_membros`: produção com 142 linhas e ensaio com 155.
   A diferença é a divergência histórica do `RUNBOOK-BANCO.md` (migrations antigas aplicadas à mão), e a sonda de deriva
   só cobra os arquivos a partir da `0146`. Produção `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh` estão
   `ACTIVE_HEALTHY`, Postgres **17.6**, e `rotulo_de_ambiente()` responde `'desenvolvimento'` no ensaio. ⚠ A ficha lista
   `0145`–`0147`, números gastos pela F60. **A primeira desta fase é a `0159`.** Versão da fase: **`1.68.0`**. Os checks
   obrigatórios da `main` são **`verificar`** e **`banco-sem-docker`**.
2. **A rede de hoje** (o fecho da F62): 250 arquivos de teste com 7.434 testes; 41 roteiros SQL mais o `_asserts.sql`,
   com 969 asserções e 0 ✗; o injetor em **125/125**, com 2 em quarentena de 127; `k_secdef` 65; `k_policies_public` 54
   (mais 8 em Storage, 62 policies vivas); `k_negocio`/`k_infra` **20/8**; `k_sem_select` com 5 (`senhas_acesso`,
   `senha_tentativas`, `ambiente`, `empresas`, `plataforma_admins`). Advisor de segurança de produção, hoje: **5 INFO**
   `rls_enabled_no_policy` (as cinco tabelas do `k_sem_select`), **34 WARN** de definer executável por `authenticated`
   e **1 WARN** de senha vazada (Auth, fora do banco).

**As oito tabelas, nos dois bancos (só contagens)**

3. **Produção:** `ativos` 1.649 · `movimentacoes` 3.626 · `lancamentos_item` 184 · `pendencias_item` 17 · `anotacoes` 21
   · `termos_gerados` 123 · `colaboradores` 41 · `itens` 23. São 5.684 linhas; `movimentacoes` tem 4,7 MB e `ativos`
   2,1 MB, as outras menos de 400 kB. **Ensaio:** 1.606 · 3.245 · 35 · 23 · **0** · 2 · **0** · 7. ⚠ No ensaio,
   `anotacoes` e `colaboradores` estão **VAZIAS**: ali o `count(*) = count(empresa_id)` tem universo zero, e a prova
   dessas duas vem do CI e de produção. Os dois bancos têm 1 empresa e 6 filiais, todas da WAP.
4. **Quem tem pai.** `ativos` → `filial_id`; `movimentacoes` → `ativo_id`, `filial_id`, `filial_destino_id`,
   `colaborador_id`; `lancamentos_item` → `item_id`, `filial_id`, `colaborador_id`; `pendencias_item` → `ativo_id`,
   `filial_id`; `anotacoes` → `ativo_id`; `colaboradores` → `filial_id` **anulável**; `itens` → nenhum (é catálogo);
   `termos_gerados` → nenhuma FK (`ativo_ids` e `movimentacao_ids` são arrays). Nenhuma das oito tem `empresa_id`.
5. **Os gatilhos.**
   - `movimentacoes_guarda_acervo` e `lancamentos_item_guarda_acervo` são BEFORE INSERT/UPDATE/DELETE por linha
     (`0081`) e recusam UPDATE, inclusive do service role. É a armadilha que a ficha descreve.
   - `ativos_guarda_acervo` é **só BEFORE DELETE**. ⚠ Em `ativos`, o `update` ingênuo não aborta: ele reescreve as 1.649
     tuplas em silêncio (a `0111` passou por aí, fato 15). O defeito é pior do que a ficha diz.
   - Existem ainda `trg_aplicar_movimentacao` e `trg_valida_lancamento_item` (BEFORE INSERT). As outras cinco tabelas
     não têm gatilho.
   - Policies: 3 · 2 · 2 · 3 · 2 · 4 · 3 · 4, total **23** nas oito. **Nenhuma muda nesta fase.**

**A coluna sem reescrita**

6. **O precedente é da própria casa.** A `0155` (F62) fez `add column empresa_id uuid not null default
   public.empresa_legada() references public.empresas (id)`, sem `update`, com o default explicado no comentário da
   coluna. `empresa_legada()` (`0152`) é `language sql stable security invoker set search_path = ''` e devolve o literal
   `00000000-0000-4000-a000-000000000001`. O espelho TS é `EMPRESA_LEGADA_ID` em `src/lib/auth/empresa-legada.ts`,
   amarrado por teste. **Medido hoje em produção:** `filiais.empresa_id` tem `atthasmissing = true`, `attnotnull`,
   default `empresa_legada()` e 1 FK validada. O caminho rápido do PG 11+ funcionou com a função `stable`. ⚠ A ficha
   escreve `default '<wap>'` literal, mas a fonte única é a função (decisão 3 da F62).
7. **O que a ficha escreve e não precisa existir.**
   - ⚠ A receita *"→ `set not null` (já satisfeito) → `drop default`"*, com a mitigação do ACCESS EXCLUSIVE do `set not
     null` por `check … not valid` → `validate`: com `add column … not null default <não-volátil>`, **não há `set not
     null` separado**.
   - O `ALTER TABLE … ADD COLUMN` toma ACCESS EXCLUSIVE de qualquer jeito, por milissegundos, e a FK valida com uma
     varredura, sem reescrever. Confirme na documentação do PostgreSQL 17 (regra 6) e registre.
   - **Nenhuma das 157 migrations usa `lock_timeout`.** Numa tabela quente com o app no ar, um `ALTER` que espera lock
     enfileira todas as leituras atrás dele.
   - O CI aplica cada arquivo com `psql -v ON_ERROR_STOP=1 -q -f`, **sem `-1`**, isto é, sem transação implícita. Com
     isso, um `set local` fora de `begin … commit` não vale. Confira também como o `apply_migration` do MCP envolve o
     arquivo antes de escolher a forma.
8. **As provas mecânicas de que nada foi reescrito.** São duas coisas diferentes, e cada uma tem o seu instrumento:
   - **Reescrita da tabela** (default volátil, `alter column type`, `vacuum full`) troca o arquivo:
     `pg_relation_filenode()` igual antes e depois prova que ela não houve.
   - ⚠ **Um `update` NÃO troca o `relfilenode`.** Pelo MVCC, ele grava versões novas das tuplas no mesmo arquivo. Quem
     acusa o `update` é o `xmin` de cada linha: o `md5` de `(id, xmin)` ordenado por `id` fica igual se nenhuma linha
     foi tocada. O `xmin` continua legível depois de um freeze (PG ≥ 9.4); confirme na documentação.
   - Mais: `pg_attribute.atthasmissing = true` na coluna nova, `pg_constraint.convalidated` na FK, e o default igual a
     `empresa_legada()` em `pg_get_expr(adbin)`.
   - Em `movimentacoes`/`lancamentos_item`, qualquer UPDATE seria 42501 da guarda, então o apply passar já é prova. Em
     `ativos` não é (fato 5): lá só o `xmin` prova.

**O default e os escritores (a decisão do Johnny)**

9. **Os escritores das oito tabelas.** É a conta que a decisão evitou e o **orçamento da F67**.
   - **18 funções SQL fazem INSERT:**
     - `ativos`: `criar_compra_lote`, `devolver_ao_fornecedor` e `import_criar_ativos`;
     - `movimentacoes`: as duas primeiras, mais `criar_movimentacao_com_itens`, `estornar_movimentacao_com_itens`,
       `forcar_estado_ativo` e `import_lancar_movimentacoes`;
     - `lancamentos_item`: `criar_movimentacao_com_itens`, `estornar_movimentacao_com_itens`, `forcar_saldo_item`,
       `lancar_itens_lote`, `reabrir_pendencias_item_com_estornos`, `resolver_pendencias_item_com_lancamentos` e
       `transferir_item`;
     - `pendencias_item`: `movimentacao_abrir_pendencias_item`;
     - `anotacoes`: `confirmar_assinatura_lote_com_anotacoes`, `confirmar_assinatura_termo_com_anotacao`,
       `corrigir_patrimonio_com_anotacao`, `definir_service_tag_com_anotacao` e
       `desfazer_confirmacao_termo_com_anotacao`.
   - **9 pontos em `src/lib/actions`:** `itens.ts:448` (lançamento), `ativos.ts:128` e `pendencias.ts:442`
     (anotação), `termos.ts:532`, `colaboradores.ts:167/198/301` e `itens.ts:572/711`.
   - **Scripts:** `seed.ts`, `import/carga.ts` e `smoke/fixtures-passe2.ts`. `scripts/db/restaurar.mjs` monta o INSERT
     pelas chaves do backup (`:272-277`), e backup anterior à F63 não tem a chave.
   - **Roteiros:** 27 dos 41 inserem numa das oito, em ~569 INSERTs.

   **Com o default mantido, nenhum desses escritores muda nesta fase.** O INSERT sem `empresa_id` recebe a WAP.
10. **O `INVENTARIO-LEITURAS.md`** (F57, *"documento histórico: não se atualiza — a F63 o relê contra o disco dela"*)
    marca quatro pontos como *"precisa de `empresa_id` explícito — a F63 derruba o default"*: `criarColaboradorInline`,
    `criarColaborador`, `consolidarColaboradores` e `estornarLancamento`. Com a decisão, eles passam para a **F67**. O
    documento não se edita; quem registra a mudança é a nota da F63 no plano.

**Os leitores**

11. **Ninguém lê linha inteira do acervo pelo app.**
    - Os 9 `select('*')` de `src` são contagem (`head: true`).
    - As formas da F58 são `z.strictObject` com lista explícita de colunas, então a coluna nova não aparece nelas.
    - As leituras de BACKUP (`formas/dev-destrutivo.ts` §5) são frouxas de propósito (`z.looseObject`,
      `backup-frouxo.test.ts`), e a coluna atravessa para o arquivo.
    - ⚠ Decisão da F58: forma que não bate **LANÇA em produção**. O app velho continua no ar entre o apply e o deploy, e
      a coluna tem de ser invisível para toda forma estrita. A prova é o conferidor contra produção depois do apply.
    - `postgres_changes` entrega a linha inteira ao navegador (`src/lib/relatorios/assinatura-realtime.ts`), com a
      coluna nova no payload. Confirme que o consumidor não valida a forma.
    - As funções com `to_jsonb(<linha>)` (os backups inline em `eventos_admin`: `apagar_ativo`,
      `apagar_ativos_conflito_filiais`, `apagar_item`, `apagar_movimentacao`, `resetar_acervo`,
      `import_apagar_acervo_filial`, `criar_movimentacao_com_itens`, `importar_ativos_substituir`) passam a levar a
      chave. Nenhuma função devolve `setof` de uma das oito.

**A disciplina de backup: o que existe e o que não existe**

12. **Não existem** `scripts/db/classificar-migration.mjs` nem `public.backups_migration`. O cabeçalho `-- classe:` é
    convenção informal nascida na F62: está em **7 dos 157** arquivos (`0152`–`0158`, todos `ADITIVA`), sem trava.
13. **A guarda que já existe é mais forte que a da ficha.** Em `src/lib/itens/migrations-f38.test.ts:634-663`, *"nenhuma
    migration da fase apaga registro do acervo AO SER APLICADA"*: para todo arquivo de `DA_F38` (≥ `0116`), ela reprova
    `delete from` e `update … set` **de topo** em `movimentacoes`, `lancamentos_item` e `ativos`, **sem válvula**, e tem
    a guarda da guarda (`:665`).
    - ⚠ A ficha pede *"reprovar `update` em `movimentacoes`/`lancamentos_item` salvo classe DESTRUTIVA com justificativa
      nomeada"*. Isso **afrouxaria** a guarda de hoje, que nasceu na F51, depois da ficha.
    - Os leitores dela são fracos e privados no teste: `semComentarios` (`:249`) tira só a linha que COMEÇA com `--`, e
      `semCorposDeFuncao` (`:262`) tira só `$$ … $$`.
14. **A cadeia medida contra esses leitores:**
    - **12 arquivos** usam dollar-quote com rótulo (`$function$` 8×, `$smoke$` 10×, `$recopia$`, `$idx$`, `$copia$`),
      que o leitor de hoje não enxerga.
    - **2 arquivos** (`0133`, `0150`) têm `$$` DENTRO de comentário, e é por isso que a ficha manda tirar comentário
      antes de procurar corpo.
    - **32** têm comentário de fim de linha depois de código, e **7** têm `/* */`.
    - ⚠ **10 têm bloco `do` de topo, e 5 deles escrevem dado dentro dele** (`0076`, `0127`, `0133`, `0153`, `0158`). Um
      `do $$ … $$` é EXECUTADO no apply, mas `semCorposDeFuncao` o apaga como se fosse corpo de função guardado. Um
      `update` de backfill dentro de `do` passa reto pela guarda de hoje.
    - 1 arquivo usa `execute format` (SQL dinâmico, que nenhum leitor estático enxerga).
15. **Os três casos que o classificador tem de saber nomear.**
    - A **`0111`** (F36, 28/08) faz um `update public.ativos` de topo em 4 linhas. O backup das linhas ficou fora do
      repositório (tinham nome real), com dry-run em transação desfeita e contagem antes e depois. É o protocolo à mão
      que a `backups_migration` automatiza. Ela é anterior à `0116` e fica fora de `DA_F38`.
    - ⚠ A **`0133`** (F53) abriu a janela `estoque.dev_destrutivo` DENTRO de um `do $$` e fez `update
      public.movimentacoes` em TODAS as linhas (o backfill de `ordem`, `:93-113`). É exatamente o que a ficha F63 proíbe,
      e passou pela guarda de topo porque o leitor apaga o `do`. **Quando a guarda passar a ver o `do`, a `0133`
      reprova.** Ela está em `DA_F38` e não se edita, então entra numa lista NOMINAL e FECHADA de exceções anteriores à
      `0159`, com o motivo, e em nenhuma outra. A `0127` também escreve dentro de `do`, mas é INSERT em
      `lancamentos_item`, que a guarda de topo não cobre.
    - A **`0158`** (F62) declara `ADITIVA`, e o `do $recopia$` dela faz `insert … on conflict do update` em `membros`,
      tabela que já existia desde a `0153`.

    As três são anteriores à régua e **não se editam**. O censo diz o que cada uma seria.
16. **O molde da tabela fechada:** `public.ambiente` (`0090`), com RLS ligada, **zero policy** e `revoke all … from
    anon, authenticated, service_role`. Com ele, `backups_migration` entra em `k_infra` e `k_sem_select` com motivo, e
    soma **um** INFO `rls_enabled_no_policy` ao advisor. Declare, como a F62 declarou `empresas` e `plataforma_admins`. O
    projeto é Free (500 MB), e é por isso que se guarda o par (id, valor anterior), não a linha.

**Os catálogos, os roteiros, os tipos e o injetor**

17. **O describe 5 de `catalogos-seguranca.test.ts`** (`:297-330`, emenda F62) proíbe `isolamento_tenant.sql` de juntar
    `empresa_id` com tabela de `k_negocio` que não seja `filiais`: *"a coluna nasce lá na F63/F65"*. O segundo `it`
    exige que o cabeçalho do roteiro diga por que a varredura da chave de recorte está vazia e nomeie `F63|F65`. A
    varredura 9k lê do CATÁLOGO quais tabelas têm a coluna. A leitura de DADO do acervo por empresa continua sendo da
    F66.
18. **`k_negocio` (20)** tem as oito desta fase e mais quatro do vocabulário do import da F56 (`import_prefixos_patrimonio`,
    `import_termos_categoria`, `import_termos_estado`, `unidades_apelidos`), que a lista da ficha F64 não traz. É backlog
    da F64, não desta fase.
19. **Migration nova** atualiza `supabase/migrations.lock.json` (`npm run db:lock`) e `DA_F38`, e passa pelas guardas:
    nenhum valor novo de enum, nenhum `delete`/`update` de topo no acervo, nenhuma INTOCÁVEL recriada. **Por desenho,
    esta fase não cria nem recria função.**
20. **O injetor** (`scripts/db/mutacoes.mjs` + `run-mutation-tests.mjs`) tem teto **125** (`mutacoes.test.mts`, com o
    histórico datado a partir de `:112`). Subir o teto exige o número exato e o porquê num comentário datado, com a
    quarentena abaixo de ⅓. O campo `sql` costuma ser `mutarFuncao(…)`: confira se o motor aceita DDL de tabela antes
    de desenhar mutação de coluna.
21. **Os tipos.** O `db:types:diff` do CI compara o banco com `src/lib/types/database.ts`. A regra é gerar de PRODUÇÃO,
    mas sem token na sessão o caminho é o `generate_typescript_types` do MCP com *hand-fix* datado (F60, ata (m) da F62).
    A coluna com default faz `Row` ganhar `empresa_id: string`, `Insert`/`Update` a ganharem opcional e `Relationships`
    ganhar a FK. Há 2 usos de `Tables<'…'>`/`Row` das oito em `src`/`scripts`.
22. **A restauração** (F54): `supabase/tests/restauracao.sql` roda no CI, e `restaurar.mjs` usa as colunas que o backup
    traz. Com o default mantido, um backup de antes da F63 restaura com a WAP, e um de depois restaura com a empresa que
    trouxer. Nenhum dos dois caminhos foi provado ainda.

**O método e a conferência**

23. **ADR-003 + `RUNBOOK-BANCO.md`.**
    - O apply é pelo `apply_migration` do MCP, **ensaio primeiro**, e nenhuma migration toca banco real antes de o CI
      tê-la rodado.
    - O `name` do apply é o nome do arquivo sem `NNNN_`.
    - **Proibidos** contra os bancos vivos: `supabase db push`, `supabase migration repair`, `supabase db reset
      --linked` e qualquer reescrita de `schema_migrations` além da linha que o próprio apply grava.
    - A prova pós-apply tem grants, `notify pgrst, 'reload schema'`, `get_advisors(security)` sem achado não declarado,
      a sonda de paridade das **11 classes** (`supabase/ci/impressao-schema.sql`) e o smoke. *"SQL antes do deploy."*
    - O rollback vai escrito no rodapé de cada migration antes do apply, e a regra 10 da §4 exige a ORDEM de rollback.
    - Desde a F55 o `SUPABASE_ACCESS_TOKEN` não mora no `.env.local`. **Sem MCP, é o caminho B**: o Johnny no SQL
      Editor, e o PR não é mergeado.
24. **A sonda de deriva** (`scripts/smoke/deriva-migrations.mjs`, base `146`). Todo arquivo ≥ `0146` tem de estar no
    ledger de PRODUÇÃO pelo nome. Pendente há mais de **24 h**, contadas do commit que acrescentou o arquivo, vira issue
    de alarme na Parte B do `saude.yml` (06:43). Nome-sem-prefixo repetido vira `nome_duplicado`.
25. **A conferência pós-deploy e as credenciais.**
    - `/api/saude` devolve `{ok, versao, commit, banco, ms}`.
    - `node scripts/smoke/smoke-prod.mjs` carrega sozinho as `SMOKE_*` (conta ADMIN de produção). A referência é *"109
      OK · 1 aviso (kits_modelos) · 0 falha"*.
    - A Parte B se dispara com `gh workflow run saude.yml -f partes=b`.
    - O conferidor de formas `npx tsx scripts/formas/conferir.mts` (F58) roda contra PRODUÇÃO com a conta do smoke e
      só contagens. Na F62 deu 271 pontos, 100.398 linhas e 0 recusadas, e recebeu a credencial por `--env-file`.
    - O `.env.local` aponta para o **ENSAIO** (que guarda cópia de dado real), e as `SMOKE_*` para **PRODUÇÃO**. Regra
      de `INVENTARIO-CREDENCIAIS.md` §9, depois do incidente de 10/09: nunca abrir, filtrar nem imprimir o `.env.local`,
      só contar e nomear.
26. **As regras do `CLAUDE.md` que pesam aqui** são a **1**, a **2** (nunca dado real; de produção, só contagem e hash),
    a **3** (R$ 0, nenhuma dependência nova), a **5**, a **6**, a **7** e a **8**.
    - A regra 6 pede documentação oficial antes de afirmar: `ALTER TABLE … ADD COLUMN` com default não-volátil
      (`atthasmissing`), os níveis de lock do `ALTER TABLE`, `lock_timeout`, a validação de FK e o `DO` do PostgreSQL
      17; RLS e `generate_typescript_types` da Supabase.
    - O molde de fechamento das F58→F62: um PR de código, com as migrations aplicadas no ensaio e em produção **antes**
      do merge; merge com os dois checks verdes; conferência pós-deploy; e um PR só de documentação que leva a tag.
    - Instrumento da F62 reaproveitável: `docs/f62-evidencias/impressao-policies.sql` (hoje `public` 54 · Storage 8).

---

## A decisão do Johnny (23/09/2026)

**O default de `empresa_id` nas oito tabelas FICA até a F67.** Ele é `public.empresa_legada()`, nunca literal, com
`comment on column` dizendo por que existe e quando cai. A F67 (*"Escrita, definer, Storage e Realtime por tenant"*) é a
fase em que as RPCs passam a receber a empresa, e é lá que o default cai. Leva junto o orçamento do fato 9 e os quatro
pontos do fato 10. A F65 (FK composta `(empresa_id, filial_id)`) já torna barulhento o cruzamento nas tabelas que têm
filial. **Desvio declarado** do *"→ `drop default`"* da ficha e do *"o `drop default` vem logo depois do `not null`"* da
decisão 2 do §1. Vai para o relatório, para a ata e para a ficha da F67.

---

## As frentes, e por que nesta ordem

- **A — o censo e o "antes".** Antes de tocar qualquer banco: os 26 fatos remedidos, o `PLAN-F63.md`, o censo dos
  escritores e leitores (o orçamento da F67), o censo da cadeia pelo classificador, e **a impressão "antes" do acervo e
  das policies nos dois bancos**, só contagem e hash. Um "depois" sem o "antes" do mesmo instrumento não prova nada.
- **B — as travas, vermelhas.** A trava do lote 1 (as oito tabelas com a coluna certa) nasce reprovando pelos oito
  nomes. Os testes do classificador nascem vermelhos com casos sintéticos antes de ele existir. Regra 4 da §4: trava
  antes da correção.
- **C — o classificador.** Um leitor só, forte o bastante para os fatos 13 a 15, antes de a primeira migration da fase
  nascer. Assim a `0159` já nasce sob ele.
- **D — o banco.** `backups_migration` e depois as colunas, no Postgres do CI até o `banco-sem-docker` ficar verde.
- **E — os roteiros, os catálogos, os tipos e o injetor.**
- **F — os documentos.**
- **G — o fechamento, com ordem interna rígida.** Versão → revisão adversarial → SHA congelado → CI verde → apply no
  ensaio + impressão → apply em produção + impressão → conferidor de formas → merge → deploy → conferência (com a Parte
  B disparada) → relatório → PR de documentação → tag.

---
## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F63 do `docs/PLANO-MULTIEMPRESA.md` (§7), a segunda da virada. Ao terminar:
- as oito tabelas do acervo (`ativos`, `movimentacoes`, `lancamentos_item`, `pendencias_item`, `anotacoes`,
  `termos_gerados`, `colaboradores`, `itens`) têm `empresa_id uuid not null`, com FK validada para
  `public.empresas(id)` e default `public.empresa_legada()` mantido até a F67 (a decisão do Johnny), preenchidas pela
  WAP **sem nenhum `update` e sem nenhuma tupla reescrita**: nos dois bancos, o `relfilenode` e o `md5` de `(id, xmin)`
  ficam iguais antes e depois (fato 8);
- nada lê a coluna, e nenhum escritor mudou;
- existe `public.backups_migration`, fechada no molde de `public.ambiente`;
- existe `scripts/db/classificar-migration.mjs`, o leitor único que tira comentários e corpos de função guardados,
  trata `do` como código executado e classifica o que a migration EXECUTA ao ser aplicada;
- o cabeçalho `-- classe: ADITIVA | DESTRUTIVA | BACKFILL` é obrigatório e conferido contra o conteúdo a partir da
  `0159`;
- migration de classe BACKFILL sem o par de backup correto reprova, e a guarda de hoje contra `update`/`delete` de topo
  no acervo continua sem válvula;
- cada peça tem a trava que reprova a volta.

Uma run, um PR de código e um PR de documentação com a tag. Versão `1.68.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1, a decisão 2;
  - §3;
  - §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 8, migration nunca se
    edita; a 10, a ORDEM de rollback);
  - a ficha **F63** no §7. Ela é a FONTE DA VERDADE do escopo: onde esta ordem e ela divergirem sem declaração, vale a
    ficha;
  - as fichas **F64**, **F65**, **F66** e **F67**, para saber o que NÃO antecipar e o que elas esperam encontrar;
  - as notas F62.
- `docs/prompts/F63-empresa-no-acervo-e-backup-de-migracao-ultracode.md`: o cabeçalho com os **26 fatos medidos** e a
  decisão do Johnny. Este prompt os cita pelo número.
- `CLAUDE.md` e `AGENTS.md`: as regras permanentes, em especial a **1**, a **2**, a **3**, a **5**, a **6** (use o
  Context7 e a documentação oficial do PostgreSQL 17 e da Supabase), a **7** e a **8**.
- `docs/RELATORIO-F62.md`, `docs/PLAN-F62.md` e a ata de 2026-09-22 · F62 em `docs/DECISOES.md` (o molde imediato: a
  impressão antes × depois, as provas pós-apply, o *hand-fix* do `database.ts`, a revisão adversarial); em
  `docs/DECISOES.md`, também as atas da F36 (a `0111`), da F51 (a guarda de topo), da F54 (a restauração) e da F58 (as
  formas e o conferidor).
- `docs/ADR-003-metodo-de-migration.md`, `docs/RUNBOOK-BANCO.md` inteiro, `docs/MATRIZ-REGRAS.md` (R-ACC-29, R-ACC-30,
  R-ACC-72 e R-ACC-77 a R-ACC-84), `docs/INVENTARIO-LEITURAS.md` (histórico: não se edita) e
  `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e destinos, **nunca o `.env.local`**).
- O código, nesta ordem:
  - as migrations `0081`, `0090`, `0111`, `0133`, `0150`, `0152`, `0153`, `0155` e `0158`;
  - `src/lib/itens/migrations-f38.test.ts` (a guarda de topo e os leitores);
  - `src/lib/validators/catalogos-seguranca.test.ts` (describes 5 e 9) e `migrations-lock.test.ts`;
  - `scripts/db/mutacoes.mjs`, `mutacoes.test.mts`, `run-mutation-tests.mjs`, `restaurar.mjs`, `corpo-vigente.mjs` e
    `CLAUDE.md`;
  - `supabase/tests/_asserts.sql`, `isolamento_tenant.sql`, `catalogo_policies.sql`, `seguranca_catalogo.sql` e
    `restauracao.sql`;
  - `supabase/ci/impressao-schema.sql` e `.github/workflows/ci.yml` (só leitura: como o CI aplica e testa);
  - `src/lib/supabase/linhas.ts`, `src/lib/queries/formas/dev-destrutivo.ts` e
    `src/lib/relatorios/assinatura-realtime.ts`;
  - `src/lib/auth/empresa-legada.ts`, `src/lib/types/database.ts`, `scripts/formas/conferir.mts` e
    `scripts/smoke/deriva-migrations.mjs`.

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 26 fatos, medidos em 23/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco e os bancos de hoje antes de
agir. Onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o relatório. Os que
mais importam:
- **fato 1**: a primeira migration é a `0159`, não a `0145`;
- **fato 3**: o ensaio tem `anotacoes` e `colaboradores` vazias;
- **fato 5**: em `ativos`, o `update` ingênuo não aborta, reescreve;
- **fatos 6 a 8**: o default é a função, não há `set not null` separado, nenhuma migration usa `lock_timeout`, e o CI
  aplica sem transação implícita;
- **fato 9**: o orçamento de escritores que a decisão empurra para a F67;
- **fato 11**: a forma estrita que LANÇA em produção, com o app velho no ar entre o apply e o deploy;
- **fatos 13 a 15**: a guarda de hoje é mais forte que a da ficha, os leitores de hoje não veem dollar-quote com rótulo
  e apagam `do`, e a `0158` declara ADITIVA com uma escrita em tabela existente;
- **fato 17**: o describe 5.

## Comandos que já existem: use, não reinvente
- `npm run lint` · `npm run test` · `npm run typecheck` (= `npx tsc --noEmit`) · `npm run build` · `npm run contraste` ·
  `npm run verificar:actions`.
- `npm run db:lock`, obrigatório no commit de cada migration.
- `npm run db:test`, `npm run db:test:mutations` e `npm run db:types:diff` precisam de Postgres e rodam no job
  `banco-sem-docker`. Na mesa, só se houver um Postgres 17 descartável que não seja nenhum dos dois bancos vivos.
- Na Frente G: `node scripts/smoke/smoke-prod.mjs` e `npx tsx scripts/formas/conferir.mts`.
- O MCP da Supabase: `list_projects`, `execute_sql` (só leitura), `apply_migration`, `list_migrations`, `get_advisors`
  e `generate_typescript_types`.

**Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`; **não rode** `supabase db push`, `migration
repair` nem `db reset --linked`; **não suba** `next dev`/`next start` contra o ensaio.

# Escopo

## Dentro: sete frentes, nesta ordem

### Frente A: o censo e o "antes"
O primeiro entregável é `docs/PLAN-F63.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`.
- **Os 26 fatos remedidos**, cada divergência contra a ficha anotada.
- **O censo dos escritores e leitores das oito tabelas** (fatos 9 a 11): SQL, TS, scripts e roteiros, com o que cada
  um faz hoje. É o orçamento da F67, e a fase NÃO o executa.
- **O censo da cadeia pelo classificador**: a classe calculada de cada um dos 157 arquivos, com os casos que ele não
  sabe ler. O censo é evidência, não trava, para `< 0159`.
- **O desenho**, com as decisões 1 a 10 de "Autonomia" tomadas por escrito.
- **A ordem das migrations e a ORDEM DE ROLLBACK** (o inverso do apply), escrita também no rodapé de cada migration.
- **A impressão "antes"**, nos DOIS bancos, pelo MCP, só leitura, antes de qualquer apply. É um arquivo
  `docs/f63-evidencias/impressao-acervo.sql`, com o MESMO texto antes e depois. Para cada uma das oito tabelas ele
  imprime:
  - `count(*)`;
  - `pg_relation_filenode()`, que acusa reescrita da tabela;
  - o `md5` de `(id, xmin)` ordenado por `id`, que acusa `update` (fato 8: o `relfilenode` sozinho não o vê);
  - o `md5` de `string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by t.id)`, que acusa mudança de conteúdo. A
    subtração vale nos dois lados;
  - em produção, a atividade da janela: a contagem de linhas com `xmin` posterior ao `pg_current_xact_id()` gravado no
    "antes", que entra como PARÂMETRO declarado do instrumento (o texto continua o mesmo). Ela pega também escrita por
    gatilho, e um backfill daria `count(*)`. A diferença de `count(*)` explica apagamentos. Só essa atividade pode
    explicar um `md5` diferente.

  Todo `md5` passa por `coalesce(…, 'vazia')`: `md5` de tabela vazia é NULL, e `NULL = NULL` não é verdadeiro
  (`anotacoes` e `colaboradores` no ensaio, fato 3). O instrumento também imprime o `md5` do `prosrc` das 18 funções do
  fato 9, que é a prova do critério 13.

  A saída é **só contagem e hash**: nenhum id, nome, patrimônio ou texto sai da consulta. Junto dela vão a impressão
  das policies (reuse `docs/f62-evidencias/impressao-policies.sql`) e o advisor de segurança, contado por nível e
  nome. Tudo em `docs/f63-evidencias/antes/`.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f63-evidencias/`.
- **A trava do lote 1 no catálogo** (um roteiro novo ou um bloco num roteiro de catálogo; decisão 6). Cada tabela da
  lista tem `empresa_id` `uuid`, `not null`, com FK validada para `public.empresas(id)` e default **exatamente**
  `public.empresa_legada()`, nunca um literal. O default se confere pelo `pg_depend` contra
  `'public.empresa_legada()'::regprocedure`, não pelo texto de `pg_get_expr`, que qualifica o nome conforme o
  `search_path`. Nenhuma tem `force row level security`. A lista das oito mora numa fonte só e sai do catálogo contra
  `k_negocio`. As tabelas de `k_negocio` ainda sem a coluna (medido hoje: 11, sete da lista da F64 e as quatro do fato
  18; `filiais` já a tem desde a F62) aparecem como pendência nomeada da F64, sem reprovar. Hoje ela reprova pelos
  oito nomes.
- **Os testes do classificador**, com os casos sintéticos da sabotagem A e as migrations reais da cadeia como corpus.
  Nascem vermelhos porque o módulo ainda não existe.
- **A trava "ninguém lê `empresa_id` do acervo antes da F66"**: nenhum `.select`/`.eq`/`.in`/`.order`/`.filter` sobre
  uma das oito tabelas em `src/**` cita `empresa_id`, nenhuma policy das oito o cita, e nenhuma função o lê. As
  exceções são nomeadas numa fonte só (`database.ts`, os roteiros de catálogo). É varredura, nasce verde no mesmo
  commit (regra 4), e prova com um caso sintético que acusa.

### Frente C: o classificador (antes da primeira migration)
- **`scripts/db/classificar-migration.mjs`**, puro e sem dependência nova, com `export` de um leitor e de um
  classificador.
- **O leitor** tira, nesta ordem:
  - os comentários de linha inteira, de fim de linha e `/* */`, sem tocar em `--` dentro de string e de corpo, e antes
    de procurar delimitador de corpo (os `$$` em comentário da `0133` e da `0150`);
  - os corpos de `create [or replace] function|procedure` delimitados por `$$` **ou `$rótulo$`**, que são texto
    guardado.

  E **MANTÉM como código de topo o corpo de todo bloco `do`**, que é executado no apply (fato 14). **Falha fechada**:
  dollar-quote ou comentário de bloco sem fecho LANÇA com o trecho, em vez de devolver menos. Comando de topo que ele
  lê mas não sabe classificar vira o veredito **ILEGÍVEL**: reprova a partir da `0159` e só é registrado no censo
  abaixo disso. Assim o critério 9 (ler as 157 sem lançar) e a falha fechada convivem.
- **O classificador** separa os comandos de topo e calcula a classe:
  - **ADITIVA**: `create`, `add column` com default não-volátil, `comment`, `grant`/`revoke`, índice, policy e
    `insert` só em tabela criada na MESMA migration;
  - **BACKFILL**: `update`, ou `insert … on conflict do update`, sobre tabela que já existia;
  - **DESTRUTIVA**: `delete`, `truncate`, `drop table`/`drop column`, e `alter column … type` com reescrita.

  Os limites finos são decisão 3, por escrito. SQL dinâmico (`execute`) de topo é acusado como ILEGÍVEL, nunca como
  ADITIVA. Também são ILEGÍVEL: a chamada de topo (`select f()`, `perform`, `call`) de função que não esteja numa
  lista fechada de funções sem escrita (`set_config` de GUC comum, `pg_notify`…), porque o leitor não vê o que ela
  faz; e o `add column` cujo default não seja literal nem de uma lista fechada de funções não-voláteis
  (`public.empresa_legada()`, `now()`…), porque um leitor estático não sabe a volatilidade, e default volátil reescreve
  a tabela.
- **A regra**, para todo arquivo ≥ `0159`. As `0152`–`0158` entram só no censo, com a classe declarada ao lado da
  calculada: divergência ali vai para a ata e não reprova, porque migration aplicada não se edita.
  - o cabeçalho `-- classe:` é obrigatório;
  - a classe declarada não pode ser MENOR que a calculada;
  - **BACKFILL** exige, antes de cada comando que altera dado, o bloco `insert into public.backups_migration (…)
    select …`. Nele, o literal `migration` é **exatamente** o nome do arquivo, e o `where` do backup aparece **byte a
    byte** no comando seguinte. O rodapé traz o rollback que restaura a partir de `backups_migration`;
  - nenhum arquivo abre `estoque.dev_destrutivo` (`set_config`/`set` de topo, inclusive dentro de `do`, como a `0133`
    fez);
  - a guarda de `migrations-f38.test.ts` contra `update`/`delete` de topo em `movimentacoes`, `lancamentos_item` e
    `ativos` **fica sem válvula** (fato 13) e passa a ver dentro de `do`. Uma classe declarada não a destrava. Ela ganha
    uma lista NOMINAL e FECHADA de exceções anteriores à `0159`, que hoje é só a `0133` (fato 15), com o motivo, e uma
    asserção de que a lista não cresce para arquivos ≥ `0159`. Um backfill legítimo de `ativos` no futuro entra por
    exceção nominal NOVA, com motivo e decisão do Johnny, e isso fica escrito no RUNBOOK;
  - **um leitor só**: a guarda de `migrations-f38.test.ts` passa a usar o leitor novo, e a guarda da guarda (`:665`)
    continua provando o que prova.
- **Os testes**, em `src/lib/validators/migrations-backfill.test.ts` (o nome que a ficha dá) e/ou
  `scripts/db/classificar-migration.test.mts`, ficam cobertos por um projeto do Vitest (`ci-passos.test.ts` confere).
  Corpus: os casos sintéticos e as 157 migrations reais. **O leitor lê a cadeia inteira sem lançar**, e o censo põe a classe
  declarada das `0152`–`0158` ao lado da calculada. A divergência que ele achar na `0158` (fato 15) vai para a ata, não
  para a migration.

### Frente D: o banco (migrations `0159`+)
Migrations pequenas, cada uma com o cabeçalho de classe (validado pelo classificador), rollback no rodapé, `db:lock` no
mesmo commit, entrada em `DA_F38` e nome-sem-prefixo que não repita nenhum arquivo do repositório (fato 24).
- **`public.backups_migration`** (ADITIVA):
  - o par `(id, valor_anterior)` por coluna alterada, não a linha inteira; colunas, chave e retenção são decisão 4;
  - CHECK do formato do nome de arquivo em `migration`;
  - RLS ligada, **zero policy** e `revoke all … from anon, authenticated, service_role`, no molde de `public.ambiente`
    (fato 16), sem `force`;
  - `comment on table` dizendo quem escreve (a migration, como o dono) e quem lê (o rollback);
  - classificada em `k_infra` + `k_sem_select`, com motivo.
- **As oito colunas**, em duas ou três migrations de três a quatro tabelas (decisão 1). Cada tabela recebe `add column
  empresa_id uuid not null default public.empresa_legada() references public.empresas (id)` (a forma exata da `0155`) e
  `comment on column` com a data, o motivo e *"o default cai na F67"*. **O `update` de backfill não se escreve**: em
  letras grandes no cabeçalho de cada migration, com o porquê (a `guarda_acervo` e a reescrita em `ativos`, fato 5).
  Também não há `set not null` separado nem índice novo (os índices liderados por `empresa_id` são da F65). O
  `lock_timeout` é decisão 2.
- **Nenhuma função criada ou recriada, e nenhuma policy tocada.**

### Frente E: os roteiros, os catálogos, os tipos e o injetor
- **O roteiro da disciplina**, dentro de transação desfeita. Um bloco BACKFILL sintético sobre uma tabela de fixture
  (não do acervo) grava o par, altera, e o rollback do rodapé devolve os valores, conferido linha a linha. Como
  `authenticated`, `anon` e `service_role`, a leitura e a escrita em `backups_migration` são recusadas. **Toda recusa
  provada duas vezes**: a falha, e depois, como `postgres`, o dado intacto. Tudo usa `assert_zero_de`, que recusa
  universo vazio.
- **O default vale**: um INSERT sem `empresa_id` em cada uma das oito, com fixture fictícia, recebe
  `empresa_legada()`. Um INSERT com empresa inexistente leva `23503`. E o `update … set empresa_id` ingênuo em
  `movimentacoes` leva `42501` da guarda, que é a prova de por que a fase não o escreve.
- **A restauração** (`restauracao.sql`): um backup sem a chave (o formato de antes da F63) restaura com a WAP, e um com
  a chave restaura com a empresa que trouxer.
- **O describe 5**, emendado no mesmo commit em que a trava do lote 1 ou a varredura 9k passarem a ver as oito
  tabelas: a varredura pelo CATÁLOGO pode listar as tabelas de acervo que têm a coluna. **O que continua proibido é
  qualquer comando que leia ou filtre DADO do acervo por `empresa_id`**, que é da F66. O cabeçalho de
  `isolamento_tenant.sql` diz o que a F63 preencheu e o que falta (F64 para as 11 restantes, F66 para a leitura). O describe 9
  fica verde.
- **Os catálogos**: `backups_migration` em `k_infra`/`k_sem_select` (20/8 → 20/9; 5 → 6), com as contagens dos
  cabeçalhos atualizadas.
- **`src/lib/types/database.ts`**:
  - *hand-fix* datado antes do SHA congelado (o `db:types:diff` do CI exige o estado final) para as oito tabelas e
    `backups_migration`, com os 2 usos de `Row` do fato 21 ajustados;
  - depois do apply no ensaio, a geração do MCP e a conferência de que batem;
  - se diferir: commit novo, CI de novo, e o SHA congelado passa a ser esse, antes do apply de produção.
- **O injetor** (decisão 8): mutação só onde ela derrubar uma trava desta fase que nenhum teste de mesa já derruba (o
  default virar literal, o `not null` cair, a FK virar `not valid`, a tabela de backup ganhar policy). Se entrar
  mutação, o teto sobe para o número exato, com o porquê datado. Se não entrar, a ata diz por quê.

### Frente F: os documentos
- **MATRIZ**: emenda **F63** em `docs/MATRIZ-REGRAS.md`, com as regras novas: a classe obrigatória e o classificador; a
  `backups_migration` e o par; a guarda de topo sem válvula; o default até a F67; ninguém lê até a F66.
- **ADR e RUNBOOK**: emenda no `ADR-003`. No `RUNBOOK-BANCO.md`: o Anexo da F63, a **receita de migration BACKFILL**
  (o bloco de backup, o `where` idêntico, o rollback a partir de `backups_migration`, a exceção nominal para `ativos`)
  e a receita do `add column` sem reescrita (as provas do fato 8).
- **PLANO**: nota **F63** no `PLANO-MULTIEMPRESA.md`, com os desvios medidos e a decisão do Johnny. A ficha da **F67**
  ganha *"tirar o default das oito"*, com o orçamento do fato 9 e os quatro pontos do fato 10. A ficha da **F64** ganha
  as quatro tabelas do fato 18 e a pergunta aberta: o default das tabelas dela (e o de `filiais`) segue a mesma régua?
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`.
- **O `INVENTARIO-LEITURAS.md` não se edita** (é histórico).

### Frente G: o fechamento, nesta ordem
1. `1.68.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real. Nada muda na tela, e o texto diz isso com honestidade. O sistema passou a registrar a qual
   empresa pertence cada equipamento, movimentação, item, colaborador, anotação e termo (hoje, todos da WAP). E as
   mudanças que alteram dados passaram a guardar antes os valores antigos. Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F63.md`. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **Apply no ENSAIO**, migration a migration, pelo `apply_migration` do MCP, com o `name` certo. Logo antes, a
   impressão "antes" refeita. Depois, a prova pós-apply do runbook:
   - grants por papel em `backups_migration`, `notify pgrst` e `get_advisors(security)` (só +1 INFO declarado);
   - o fato 8 nas oito tabelas;
   - `count(*) = count(empresa_id) = count(*) filter (where empresa_id = public.empresa_legada())`;
   - **a impressão "depois", com o `relfilenode` e os dois `md5` iguais aos do "antes"**, porque o ensaio não tem
     tráfego;
   - as 62 policies byte a byte.

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com o arquivo que falhou retirado
   da branch antes do merge e a correção em migration NOVA.
6. **Apply em PRODUÇÃO**, na mesma ordem, dentro de 24 h do commit das migrations (fato 24), com as mesmas provas. Não
   espere horário: quem escolhe quando a run dispara é o Johnny, e o `lock_timeout` protege o app. O **`relfilenode` é
   igual, sem exceção**. Os dois `md5` são iguais, ou a diferença se explica SÓ pela atividade da janela, com a contagem
   na evidência. Depois vem a sonda de paridade ensaio × produção nas 11 classes. `relfilenode` mudou, `md5` de `(id,
   xmin)` divergiu além da janela, ou apareceu advisor não declarado que cita objeto da fase? **Rollback imediato em
   produção** antes do diagnóstico, e registro no topo do relatório. Logo depois do apply, e antes do merge, rode
   também `node scripts/smoke/smoke-prod.mjs`: o app no ar ainda é o velho, lendo o esquema novo, e 0 falha ali é a
   segunda prova de que nenhuma forma estrita viu a coluna.
7. O conferidor de formas (`scripts/formas/conferir.mts`, conta do smoke, só contagens) contra PRODUÇÃO depois do
   apply, **com 0 recusadas**. É a prova de que nenhuma forma estrita viu a coluna (fato 11). Rode-o exatamente como a
   F62 rodou (ata F62 em `docs/DECISOES.md` e §7 do `RELATORIO-F62.md`: a credencial entra por `--env-file`, e ninguém
   abre, filtra nem imprime o arquivo). Se o classificador de segurança barrar esse passo, registre, não reformule, e
   fique com a prova do smoke do passo 6, declarada como a única no relatório.
8. Ata e `docs/RELATORIO-F63.md` com o que já dá para escrever; o PR sai do rascunho; merge com os dois checks verdes.
   Declare a janela entre o apply de produção e o deploy (o app velho não lê a coluna e o INSERT recebe o default) e o
   tamanho dela.
9. **A conferência pós-deploy, só leitura**: `/api/saude` com `1.68.0` e o commit do merge; `node
   scripts/smoke/smoke-prod.mjs` com 0 falha; e a Parte B do `saude.yml` disparada à mão (`gh workflow run saude.yml -f
   partes=b`), verde, com a sonda de deriva sem pendente. Nenhuma captura de tela de produção.
10. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.68.0` vai no merge
    dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Da ficha e da decisão do Johnny:**
  - tirar o default (é da F67, com os escritores do fato 9);
  - qualquer leitura da coluna, e qualquer policy (F66);
  - a FK composta, os `unique (empresa_id, id)` e os uniques por empresa, `guarda_empresa()` e os índices liderados
    por `empresa_id` (F65);
  - `empresa_id` nas tabelas de vocabulário e infra (F64), incluindo as quatro do fato 18.
- **O que esta ordem acrescenta:**
  - recriar qualquer função, porque nenhum escritor muda;
  - editar migration aplicada, incluindo a `0111` e a `0158`, que o censo só descreve;
  - afrouxar a guarda de topo do fato 13;
  - `seed.ts` e `carga.ts`;
  - `ESCOPO_UNICO`/`chaveDoEscopo` (F69/F70);
  - o `INVENTARIO-LEITURAS.md`;
  - `CLAUDE.md` da raiz;
  - `.github/workflows/**` e a proteção da `main`;
  - dependência nova;
  - `.env*` e `scratchpad/`;
  - os PRs do dependabot;
  - o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F63.md` tem os 26 fatos remedidos, o censo dos escritores e leitores, o censo da cadeia, o desenho, as
   decisões por escrito, a ordem das migrations e a ORDEM DE ROLLBACK. Ele é anterior ao primeiro commit que toca
   `supabase/`, `src/` ou `scripts/`.
3. A impressão "antes" do acervo, das policies e do advisor existe nos dois bancos, tirada antes de qualquer apply e só
   com contagens e hashes, em `docs/f63-evidencias/antes/`.
4. As migrations começam na `0159`, com cabeçalho de classe validado pelo classificador, rollback no rodapé, `db:lock`
   no mesmo commit e entrada em `DA_F38`. Não há valor novo de enum, `update`/`delete` de topo no acervo, abertura da
   janela destrutiva, nome-sem-prefixo repetido nem função criada ou recriada.
5. `backups_migration` existe com RLS ligada, zero policy, `revoke all` dos três papéis e sem `force`; está em `k_infra`
   e `k_sem_select` com motivo; o INFO novo do advisor está declarado; e o roteiro da ida e volta está verde.
6. As oito tabelas têm `empresa_id uuid not null`, FK validada para `empresas(id)`, default exatamente
   `public.empresa_legada()` e o comentário "até a F67", no CI e nos dois bancos.
7. `count(*) = count(empresa_id) = count(*) filter (where empresa_id = empresa_legada())` nas oito, nos dois bancos. O
   universo zero do ensaio (`anotacoes`, `colaboradores`) está declarado, e a prova dessas duas vem do CI e de produção.
8. O **`relfilenode` e o `md5` de `(id, xmin)` são iguais antes × depois nas oito, nos dois bancos**, com
   `atthasmissing = true`. No ensaio os dois `md5` são idênticos; em produção, idênticos ou com a diferença explicada
   só pela atividade da janela.
9. O classificador lê as 157 migrations sem lançar (o que não sabe classificar vira ILEGÍVEL no censo), trata `do`
   como código executado, enxerga dollar-quote com rótulo e comentário com `$$`, e falha fechado diante de delimitador
   sem fecho. O cabeçalho é obrigatório a partir da `0159`. As regras de BACKFILL (o bloco
   de backup, o literal `migration` igual ao nome do arquivo, o `where` byte a byte, o rollback a partir de
   `backups_migration`) reprovam quando violadas.
10. A guarda de topo de `migrations-f38.test.ts` continua reprovando `update`/`delete` de topo nas três tabelas de
    acervo, **mesmo com classe DESTRUTIVA declarada**, agora também dentro de `do`, e usa o leitor único. A única
    exceção é a lista nominal fechada anterior à `0159` (hoje, só a `0133`), e uma asserção impede que ela cresça.
11. A trava do lote 1 nasceu vermelha pelos oito nomes e está verde; ela reprova o default literal, o `drop not null`, a
    FK `not valid` e a tabela sem a coluna.
12. A trava "ninguém lê `empresa_id` do acervo" está verde e acusa o caso sintético.
13. **Nenhum escritor mudou**: o `md5` do `prosrc` das 18 funções do fato 9 é igual antes × depois nos dois bancos; os
    9 pontos TS e os scripts estão intocados; e nenhum dos 27 roteiros que inserem no acervo precisou de `empresa_id`
    para passar.
14. As 62 policies estão byte a byte (`public` 54 · Storage 8) antes × depois, nos dois bancos.
15. O describe 5 está emendado de forma coerente, o describe 9 verde, `isolamento_tenant.sql` verde, e o cabeçalho diz o
    que a F63 preencheu e o que falta.
16. O `database.ts` tem *hand-fix* declarado e foi conferido contra a geração do MCP depois do apply no ensaio; o
    `db:types:diff` está verde.
17. O conferidor de formas contra produção, depois do apply, deu **0 recusadas**.
18. A decisão sobre o injetor está na ata. Se entrou mutação, ela é detectada, o teto está no número exato com o porquê
    datado e a quarentena abaixo de ⅓.
19. `restauracao.sql` prova o backup sem a chave (restaura com a WAP) e com a chave.
20. O rollback está escrito na ordem inversa, num arquivo em `supabase/rollback/F63-*.sql` (no molde da F62), e foi
    **ensaiado no Postgres do CI**. A prova: as colunas visíveis, as constraints e os gatilhos das tabelas tocadas
    voltam a ser os de uma impressão do CI tirada antes da `0159`. Coluna apagada fica no `pg_attribute` com
    `attisdropped`, e isso não conta como diferença.
21. Os advisors nos dois bancos mudaram só no INFO declarado, e a paridade ensaio × produção fecha nas 11 classes.
22. Nenhuma dependência nova; `.github/workflows/**` e o `CLAUDE.md` da raiz intocados.
23. As emendas estão feitas: MATRIZ (F63), `ADR-003`, `RUNBOOK-BANCO.md` (Anexo, receita BACKFILL, receita do `add
    column`), `PLANO-MULTIEMPRESA.md` (nota F63, ficha F67, ficha F64), `docs/README.md`, `docs/prompts/README.md` e a
    ata em `docs/DECISOES.md`.
24. `package.json` em `1.68.0`, `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.68.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
25. Os dois PRs estão mergeados com os dois checks verdes, e a conferência pós-deploy foi feita (`/api/saude` com
    `1.68.0`, smoke com 0 falha, Parte B verde e sem pendente); se não, o bloqueio está no topo do relatório.
26. As sabotagens A a I estão com saída real em `docs/f63-evidencias/`.
27. Nenhum dado real (nome, e-mail, id, patrimônio, texto de anotação) em migration, teste, roteiro, evidência ou log.
    Da produção, só contagens e hashes. Ninguém abriu o `.env.local`.
28. `docs/RELATORIO-F63.md` segue o padrão F45→F62, com o roteiro do Johnny no topo.
29. O relatório declara o estado de repouso (o que acontece se o projeto parar aqui por dois meses, com o default de pé)
    e a seção "o que este relatório NÃO prova".

# Verificação: rode de verdade
A cada incremento, rode `npm run lint`, `npm run test` e `npm run typecheck`. Rode `npm run build` antes de cada push.
Tudo o que é SQL (roteiros, injetor, `db:types:diff`) passa pelo `banco-sem-docker` do PR. Leia a falha, corrija a
**causa raiz** e repita até passar.

Não faça nada disto para um teste passar:
- alargar exceção para caber um caso que devia reprovar;
- trocar detecção por `skip`;
- afrouxar um catálogo, uma varredura ou a guarda de topo;
- baixar o rigor da convenção de honestidade;
- mudar um teste existente sem conferir que ele prova a mesma coisa (em especial a guarda da guarda de
  `migrations-f38.test.ts:665`).

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**NENHUMA TUPLA DO ACERVO É REESCRITA, E O "ANTES" VEM ANTES DE QUALQUER APPLY.** O `relfilenode` e o `md5` de `(id,
xmin)` iguais nas oito tabelas, nos dois bancos, são o portão do apply de produção e do merge.

Provas obrigatórias, cada uma com a saída real em `docs/f63-evidencias/`:
- **Sabotagem A, o classificador.** Migrations sintéticas no corpus de teste, cada uma com o veredito esperado:
  - `update` de topo sem cabeçalho → reprova;
  - declarada ADITIVA com `update` de topo → reprova;
  - `update` dentro de `do $$ … $$` → visto como topo → reprova;
  - `update` dentro de `create function … $function$ … $function$` → ignorado;
  - `-- … $$ …` num comentário antes de um `update` de topo → o `update` continua visto;
  - comentário de fim de linha com `update public.x set` → ignorado;
  - BACKFILL sem bloco de backup → reprova;
  - bloco com o literal `migration` de OUTRO arquivo → reprova;
  - `where` do backup diferente do `where` do `update` por um espaço → reprova;
  - `set_config('estoque.dev_destrutivo', …)` de topo → reprova;
  - `execute format(…)` de topo → ILEGÍVEL;
  - `select public.f()` ou `call public.p()` de topo, com a função criada no mesmo arquivo e escrevendo → ILEGÍVEL;
  - `merge into public.x …` e `with c as (…) update public.x …` de topo → vistos como escrita;
  - `add column … default gen_random_uuid()` → não é ADITIVA;
  - `/* /* aninhado */ update public.x set … */` → ignorado (o comentário de bloco do Postgres aninha);
  - `'$$'` dentro de string literal de topo → não abre corpo;
  - a `0133` real → reprova sem a exceção nominal e passa com ela; uma `0159` sintética igual a ela → reprova sempre;
  - dollar-quote sem fecho → o leitor LANÇA.
- **Sabotagem B, a guarda não afrouxou.** Uma migration sintética ≥ `0159` declarada DESTRUTIVA, com justificativa, e
  um `update public.movimentacoes set` de topo → a guarda de `migrations-f38.test.ts` continua vermelha. O mesmo
  `update` dentro de `do` → vermelha também.
- **Sabotagem C, o lote 1.** A trava vermelha pelos oito nomes sobre o banco de hoje, e verde depois. Default literal
  `'00000000-…-000000000001'::uuid` no lugar da função, `drop not null`, FK `not valid` e uma das oito sem a coluna →
  vermelho, cada um pelo nome.
- **Sabotagem D, os dois instrumentos enxergam o que dizem enxergar.** No Postgres do CI, numa tabela de fixture:
  - uma coluna com default VOLÁTIL (`gen_random_uuid()`) faz o `relfilenode` MUDAR; com o default da fase, ele NÃO muda;
  - um `update` de uma linha deixa o `relfilenode` igual e faz o `md5` de `(id, xmin)` MUDAR. ⚠ O `update` vai dentro
    de um `savepoint`: a subtransação tem xid próprio. Sem ele, uma linha inserida na MESMA transação não muda de
    `xmin`, e a prova falharia pelo motivo errado.

  Sem isso, "igual" não prova nada.
- **Sabotagem E, a armadilha da ficha.** No CI, `update public.movimentacoes set empresa_id = public.empresa_legada()`
  → 42501 da `guarda_acervo`. Em `ativos`, o mesmo `update` (num `savepoint`, como na D) PASSA: o `relfilenode` fica
  igual e o `md5` de `(id, xmin)` muda. É a reescrita silenciosa do fato 5, provada e desfeita na transação.
- **Sabotagem F, o backup de migração.** O bloco BACKFILL sintético grava o par, e o rollback do rodapé devolve os
  valores. Sem o bloco (o `update` sozinho), o rollback não tem de onde devolver → vermelho. `authenticated`, `anon` e
  `service_role` são recusados em `backups_migration`, provado duas vezes.
- **Sabotagem G, o default.** INSERT sem `empresa_id` nas oito recebe a WAP; empresa inexistente dá `23503`. Os 27
  roteiros que inserem no acervo passam sem nenhuma edição de `empresa_id`.
- **Sabotagem H, a restauração.** Um backup sem a chave restaura com a WAP; um backup com a chave restaura com ela.
- **Sabotagem I, ninguém lê.** Cada um destes, sintético, deixa a trava vermelha: um `.eq('empresa_id', …)` e um
  `.select('id, empresa_id')` sobre `ativos`; um `.match({ empresa_id: … })` sobre `itens`; uma policy citando
  `empresa_id` numa das oito; e um corpo de função lendo `movimentacoes.empresa_id`.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI;
  - mutações e teto;
  - `k_negocio`/`k_infra` e `k_sem_select`;
  - policies;
  - advisors por nível;
  - as oito contagens, o `relfilenode` e o `md5` de `(id, xmin)` nos dois bancos;
  - o censo da cadeia por classe;
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco e os bancos de hoje;
2. a decisão do Johnny abaixo, que muda a ficha;
3. a ficha da F63 no §7 do plano;
4. este prompt, no que ele detalha (onde ele diverge da ficha, a divergência está declarada aqui e vai para o
   relatório);
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, o código existente, o molde da F62);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**A decisão do Johnny (23/09/2026), que a ficha não tinha:** o default `public.empresa_legada()` nas oito tabelas FICA
até a F67, documentado na coluna, na ata e na ficha da F67, com o orçamento dos escritores (fatos 9 e 10). Nenhum
escritor muda nesta fase.

**As dez decisões que esta fase precisa tomar por escrito:**
1. **As migrations**: quantas, quais tabelas em cada uma e em que ordem, com `backups_migration` primeiro.
2. **O lock**: `lock_timeout` nas migrations que alteram tabela quente. A recomendação é `set lock_timeout = '…';` no
   topo e `reset lock_timeout;` no fim, **sem `begin`/`commit` no arquivo**: o CI aplica cada comando solto (fato 7) e
   um `commit` dentro do arquivo pode fechar a transação do `apply_migration` antes do registro no ledger. Meça como o
   MCP trata a transação antes de fechar. Declare que, no CI, uma migration de várias tabelas não é atômica. Diga
   também o valor do timeout e a regra de tentativas (a de "Bloqueios").
3. **As classes**: os limites finos entre ADITIVA, BACKFILL e DESTRUTIVA. Entre eles:
   - `insert` em tabela criada antes;
   - `insert … on conflict do update`;
   - `alter column type`;
   - `drop function`;
   - `create or replace view`;
   - o `do` com escrita;
   - o que é ILEGÍVEL.

   Declare também o que o censo diz da `0111` e da `0158`.
4. **`backups_migration`**: as colunas (a chave da linha, a coluna, o valor anterior em `jsonb`), a identidade, o
   CHECK do nome, a retenção (quando uma linha pode ser apagada, e por quem) e o tamanho máximo esperado no Free.
5. **O leitor único**: onde ele mora, como `migrations-f38.test.ts` passa a usá-lo sem perder a guarda da guarda, e o
   que ele faz diante do que não sabe ler.
6. **A trava do lote 1**: em que roteiro ou bloco ela mora, a fonte única da lista das oito, e como as 11 restantes da F64
   aparecem como pendência sem reprovar.
7. **A trava "ninguém lê"**: o universo (TS, policies, funções), as exceções nomeadas e onde ela mora.
8. **O injetor**: se entra mutação, quais e o teto novo; se não entra, por quê.
9. **O instrumento**: o texto da impressão do acervo (idêntico antes e depois), a contagem da janela em produção e o
   critério que separa "atividade normal" de "reescrita".
10. **O describe 5**: a nova fronteira entre ver a coluna pelo catálogo (permitido) e ler dado do acervo por ela
    (proibido até a F66).

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **O MCP da Supabase não está conectado, ou recusa o apply.** Não procure token, não leia o Gerenciador de
  Credenciais, não abra o `.env.local`. Entregue tudo o que não depende do banco vivo, com o PR ABERTO e **SEM merge**
  (o `database.ts` descreveria colunas que produção não tem). No topo do relatório vai o caminho B: as migrations na
  ordem, a impressão do acervo para rodar antes e depois, e o rollback.
- **O `relfilenode` mudou, ou um dos `md5` divergiu sem explicação, no ensaio.** Rollback no ensaio na ordem escrita,
  causa raiz, correção por migration NOVA (a aplicada nunca se edita, e o arquivo que falhou nunca é mergeado) e o
  ciclo de novo. **Em produção:** rollback imediato, antes do diagnóstico, sem merge, e o bloqueio no topo do
  relatório.
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO do arquivo
  `supabase/rollback/F63-*.sql` que o CI já ensaiou (critério 20). É a única exceção ao "`execute_sql` só leitura",
  e vale só para esse arquivo. A linha do ledger fica; registre o que a sonda de deriva vai dizer dela. Se o
  classificador de segurança barrar o rollback, não reformule: o comando exato vai no topo do relatório, o PR fica
  sem merge, e esse é um desfecho próprio.
- **O lock não veio** (o `lock_timeout` disparou): registre e tente de novo, no máximo três tentativas em 30 minutos.
  Não suba o timeout nem mate sessões do app. Depois da terceira, pare o apply daquele banco: PR aberto, sem merge, e
  o comando no topo do relatório.
- **Advisor novo** depois do apply que não seja o INFO declarado: se ele cita objeto desta fase, escalada do runbook
  e rollback antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e siga.
- **O conferidor de formas ou o smoke recusam** depois do apply de produção: a coluna vazou para uma forma estrita.
  Rollback em produção (o app velho está no ar), PR sem merge, e a causa no topo do relatório. Não tente consertar na
  mesma run: o conserto exigiria deploy antes do apply, a ordem inversa da Frente G.
- **A sonda de deriva abre alarme** porque o apply de produção passou das 24 h: registre; o alarme fecha sozinho na
  Parte B seguinte.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a pendência
  com o que falta. Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, merge, push de tag): registre, não
  repita, não reformule, siga no que não depende dela, e ponha o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui
já há doze divergências medidas de saída**, e elas vão no relatório:
- a numeração das migrations (`0159`, não `0145`; fato 1);
- o default pela função, não pelo literal `'<wap>'` (fato 6);
- a receita sem `set not null` separado, e a mitigação do ACCESS EXCLUSIVE que não se aplica (fato 7);
- o `drop default` adiado para a F67 (a decisão do Johnny, fato 9);
- os quatro pontos do `INVENTARIO-LEITURAS` que migram para a F67 (fato 10);
- o `update` em `ativos`, que não aborta e reescreve (fato 5);
- a guarda de topo que já existe e é mais forte que a pedida (fato 13);
- os leitores de hoje, que não veem dollar-quote com rótulo e apagam o `do` executado (fato 14);
- a `0158`, declarada ADITIVA com escrita em tabela existente (fato 15);
- a `0133`, que já fez, dentro de um `do` e com a janela destrutiva aberta, o backfill que a ficha proíbe, e que por
  isso vira a única exceção nominal da guarda de topo (fato 15);
- o ensaio com duas das oito tabelas vazias (fato 3);
- as quatro tabelas de vocabulário que a ficha F64 não lista (fato 18).

Declare também o que este prompt acrescenta: a impressão do acervo com `relfilenode` e `(id, xmin)`; o `lock_timeout`; o `do` tratado
como código executado; o leitor único, com a exceção nominal da `0133`; a trava "ninguém lê"; o smoke logo depois do
apply de produção; a prova da restauração; e o rollback ensaiado.

# Git e segurança
- **Branch** `f63-empresa-no-acervo`, com commits pequenos e frequentes e mensagens em pt-BR no padrão conventional
  (`docs(f63): …`, `test(f63): …`, `feat(f63): …`, `fix(f63): …`, `refactor(f63): …`, `chore(f63): …`).
- **Documentação primeiro.** Commite também esta ordem
  (`docs/prompts/F63-empresa-no-acervo-e-backup-de-migracao-ultracode.md`) num commit de documentação. O `PLAN-F63.md`
  vem antes do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os lotes vão em commits separados, nesta ordem:** travas vermelhas; o classificador e o leitor único;
  `backups_migration`; as colunas; os roteiros; os catálogos e os tipos; o injetor; os documentos; a versão. Cada
  migration leva o `db:lock` no mesmo commit.
- **Pushes agrupados**: cada um custa CI numa cota apertada.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece com
  `verificar` e `banco-sem-docker` verdes **e** o `relfilenode` igual nos dois bancos, com o `(id, xmin)` igual no
  ensaio e igual ou explicado só pela janela em produção. Depois do merge: a evidência por
  um PR só de documentação, e qualquer correção de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `update` de backfill em
  tabela de acervo, abrir a janela `estoque.dev_destrutivo`, `force row level security`;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; matar sessão do app; imprimir ou gravar id, nome,
  e-mail, patrimônio ou texto de linha real (nem em log, nem em evidência, nem na resposta);
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de
  10/09); ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha e token;
- **no repositório:** mexer na proteção da `main` ou no workflow, instalar dependência, mexer nos PRs do dependabot.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local` e que, de banco, só lê contagens e
hashes. As frentes de exploração:
- (a) **os escritores e leitores das oito** no SQL (`corpo-vigente.mjs`), no TS, nos scripts e nos roteiros (fatos 9 a
  11);
- (b) **a cadeia de migrations** contra os leitores de hoje e o desenho do leitor novo (fatos 12 a 15), com o censo
  por classe;
- (c) **os catálogos, o injetor e os tipos**: o que cada catálogo exige de uma tabela nova e de uma coluna nova, o
  describe 5/9, o teto, o `db:types:diff`;
- (d) **os bancos, só leitura e só contagem/hash**: os fatos 1 a 3 remedidos, o fato 6 conferido em `filiais`, e o
  texto da impressão do acervo ensaiado no ensaio.

Escreva `docs/PLAN-F63.md` antes de implementar. **A edição é sequencial**: o classificador, as migrations e os
roteiros se cruzam. Paralelize exploração, medição e revisão, não edição.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**, contra o
`PLAN-F63.md` e os 29 critérios, com estas perguntas:
- Alguma das migrations reescreve tupla, dispara gatilho de linha ou toma lock por mais do que o `ALTER`?
- O `lock_timeout` vale de fato no CI e no MCP, ou é um `set local` fora de transação?
- O default é a função em todas as oito, e o comentário diz F67?
- Alguma forma estrita, consumidor de Realtime ou teste passa a ver a coluna?
- O leitor enxerga um `update` dentro de `do`, de `$rótulo$` e depois de um `$$` em comentário? E ignora o de dentro
  de função?
- Existe SQL que altera dado e que o classificador chama de ADITIVA?
- A guarda de topo ficou com alguma válvula?
- O bloco de backup pode ser copiado de outra migration sem o classificador perceber (o literal, o `where`)?
- O rollback a partir de `backups_migration` devolve o valor anterior, inclusive `null`?
- `backups_migration` é legível ou gravável por algum papel da API?
- A trava do lote 1 é derivada do catálogo, ou é uma lista escrita à mão que esquece uma tabela?
- A trava "ninguém lê" é tautológica (universo vazio)?
- Alguma sabotagem prova só o caminho feliz?
- Alguma evidência tem dado real?
- Algum arquivo fora do escopo foi tocado?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado,
não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F63.md`, em pt-BR, no padrão dos relatórios F45→F62, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B completo, se o MCP
  faltou);
- depois do deploy, entrar com a própria conta e conferir que tudo está como sempre (ativos, movimentações, itens);
- conferir `/api/saude` com `1.68.0` e a Parte B do `saude.yml` verde no dia seguinte;
- o `git diff v1.67.0 v1.68.0 --stat`, com o que deve e o que não deve aparecer;
- a lembrança de que o default cai na F67.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas doze já
  conhecidas;
- a decisão do Johnny e as **dez decisões** da fase;
- o censo dos escritores e leitores (o orçamento da F67) e o censo da cadeia por classe;
- **a impressão do acervo antes × depois nos dois bancos** (contagens, `relfilenode`, os dois `md5`, a janela);
- as sabotagens com saída real;
- a contagem final;
- os 29 critérios autoverificados;
- o estado de repouso;
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que exista isolamento entre empresas no acervo (não existe até a F66/F72);
  - que uma linha nova de uma segunda empresa receberia a empresa certa (o default é a WAP até a F67);
  - que o classificador pegue SQL dinâmico ou escrita por função chamada no apply (ele é leitor estático: `execute` é
    acusado como ILEGÍVEL, e uma função que escreve, chamada de topo, não é vista por dentro);
  - que a janela de produção tenha ficado sem tráfego.

Pendências e **backlog nomeado**:
- **F64**: as 11 tabelas de `k_negocio` ainda sem a coluna (sete da ficha e as quatro do fato 18); a régua do
  default para elas e para `filiais`;
- **F65**: a FK composta, os uniques por empresa, `guarda_empresa()`, os índices liderados por `empresa_id`;
- **F66**: a leitura da coluna e o recorte nas policies;
- **F67**: **tirar o default das oito**, com os 18 escritores SQL, os 9 pontos TS, os scripts, `restaurar.mjs`, os 27
  roteiros e os 4 pontos do `INVENTARIO-LEITURAS`;
- **PATCH** (do backlog da F62): derrubar `profiles.papel`/`ativo` a partir de 13/10/2026.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`backups_migration`, `empresa_legada`); os nomes que a ficha fixa ficam como estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---
## Como executar

### Pré-voo (uma vez, ~15 minutos)

Esta fase **toca os dois bancos**: aplica migrations no ensaio e em produção pelo MCP da Supabase, antes do merge. A
promessa dela, de que nenhuma linha é reescrita, é provada por uma consulta rodada antes e depois nos dois bancos. O
item do pré-voo que mais importa é o MCP.

Este arquivo já está salvo em `docs/prompts/F63-empresa-no-acervo-e-backup-de-migracao-ultracode.md`, **sem commit**. O
agente o commita na branch da fase. O prompt cita os 26 fatos do cabeçalho pelo número, então o arquivo precisa estar lá
quando você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.67.0, tag v1.67.0 no merge do PR #71 (3c1c761); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short
Test-Path .git\index.lock    # tem de dar False — uma trava órfã derruba o primeiro commit da run
Test-Path docs\prompts\F63-empresa-no-acervo-e-backup-de-migracao-ultracode.md   # tem de dar True

# 3. Produção com a mesma versão, e a Parte B do saude.yml verde hoje.
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
& "C:\Program Files\GitHub CLI\gh.exe" run list --workflow saude.yml --limit 3

# 4. O smoke de produção passa HOJE — é a conferência pós-deploy da fase.
node scripts/smoke/smoke-prod.mjs

# 5. O MCP da Supabase conectado ao Claude Code, enxergando os dois projetos.
claude mcp list

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O passo 5 é o que mais importa.** Sem o MCP da Supabase, o agente não aplica nada nem tira a impressão do acervo. Ele
entrega tudo verde no CI, **deixa o PR aberto, sem merge**, e põe o caminho B no topo do relatório: as migrations e a
consulta para você rodar no SQL Editor. Dentro do Claude Code, confira que o MCP lista `pbtjcalbmepmrqzprusb`
(produção) e `sgmvldiizsrjbxzzpmhh` (ensaio).

**Mais três coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. O `banco-sem-docker` vai rodar algumas vezes, mais o PR de
   documentação e a Parte B disparada à mão.
2. **Dentro do Claude Code:** `/permissions` (nada pode negar `git push`, `gh`, `node`, `npx tsx` nem as ferramentas
   do MCP da Supabase) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).
3. **O horário.** O apply em produção toma, por milissegundos, o lock exclusivo de `movimentacoes` e `ativos`. O prompt
   põe `lock_timeout` e manda repetir se o lock não vier. Mesmo assim, rodar fora do horário de uso deixa a janela
   limpa e o `md5` do acervo igual sem precisar explicar atividade.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f63
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP, abre e mergeia PRs, publica tag,
dispara workflow e roda o smoke contra produção. Nada disso cabe numa allowlist estreita. `bypassPermissions` numa
máquina com credencial de produção está fora de questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção, no merge na `main` e no push da
tag. As F53→F62 passaram por ele. Se barrar, o prompt manda não reformular: o agente registra, segue no resto e põe o
comando no topo do relatório.

**`--worktree` NÃO serve.** O smoke e o conferidor da conferência pós-deploy precisam do `.env.local`, que não vai
para a worktree, e o prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run
durar.

**Custo.** É uma fase média: nenhuma função recriada, mas um classificador novo com corpus de 157 arquivos, roteiros e
dois bancos. Se a cota semanal estiver apertada, rode `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`
para economizar na exploração. A revisão adversarial (o leitor, as classes, o lock) é onde o modelo forte rende.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F63.md e docs/f63-evidencias/impressao-acervo.sql existem; package.json em 1.68.0; docs/RELATORIO-F63.md existe; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, as migrations 0159+ aplicadas no ensaio e em producao, com docs/f63-evidencias/antes preenchido, o relfilenode das oito tabelas igual antes e depois nos dois bancos, o md5 de (id, xmin) igual no ensaio e igual ou explicado so pela janela em producao, o smoke apos o apply e o conferidor de formas sem falha, a conferencia pos-deploy e a Parte B passaram e a tag v1.68.0 foi publicada; (b) o apply de producao nao aconteceu (classificador barrou ou o lock nao veio em tres tentativas): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F63.md; (c) tudo aplicado e mergeado, mas o push da tag ou a conferencia barrados, com o comando no topo do docs/RELATORIO-F63.md; (d) sem MCP da Supabase: PR aberto sem merge, com o caminho B e a impressao-acervo.sql para rodar antes e depois no topo do docs/RELATORIO-F63.md; (e) o relfilenode ou o md5 de (id, xmin) divergiu, ou o smoke/conferidor recusou: rollback aplicado (ou, se barrado, o comando do rollback no topo), PR sem merge e a causa no topo do docs/RELATORIO-F63.md; ou (f) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F63.md
```

**Headless, de madrugada.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f63.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f63.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f63.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. Como esta fase aplica em
produção, **prefira a sessão interativa deixada rodando, com o `/goal`**, e com a suspensão do Windows desligada no
plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F63.md` e `docs/f63-evidencias/antes/`, com a impressão do acervo dos dois bancos, antes
   de qualquer migration aplicada. Só contagens e hashes: se aparecer um nome, patrimônio ou texto ali, interrompa a
   sessão.
2. **O classificador.** O censo das 157 migrations por classe, e os casos sintéticos vermelhos antes de o módulo
   existir. Os casos do `do` com `update` e do `$$` em comentário são o coração dele.
3. **O ensaio.** O `relfilenode` igual nas oito tabelas e os dois `md5` idênticos. É o ensaio geral da produção.
4. **A produção.** O `relfilenode` e o `(id, xmin)` iguais, e o conferidor de formas com 0 recusadas. Se algum dos dois falhar, o prompt
   manda fazer o rollback na hora, e o relatório diz isso no topo.
5. **A conferência.** `/api/saude` em `1.68.0`, o smoke com 0 falha e a Parte B verde.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Entre com a sua conta em produção e abra ativos, movimentações e itens: tudo tem de estar como sempre.
3. `git diff v1.67.0 v1.68.0 --stat`. Devem aparecer:
   - `supabase/migrations/0159_*` em diante, `supabase/migrations.lock.json` e `supabase/tests/**`;
   - `scripts/db/classificar-migration.mjs` e os testes dele;
   - `src/lib/itens/migrations-f38.test.ts` (o leitor único) e os testes de catálogo;
   - `src/lib/types/database.ts`;
   - talvez `scripts/db/mutacoes.mjs`;
   - `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`.

   **Não** devem aparecer:
   - `src/lib/actions/**`, `src/lib/queries/**` (fora testes), `src/components/**` e `src/app/**`;
   - `scripts/seed.ts`, `scripts/import/**` e `scripts/db/restaurar.mjs`;
   - migration antiga alterada;
   - `.github/workflows/**`;
   - mudança de dependência no `package-lock.json`.
4. Abra `docs/f63-evidencias/`: a impressão antes × depois dos dois bancos e a saída das sabotagens.
5. Rode você mesmo `npm run test` uma vez.
6. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A `v1.67.0` está fechada e no ar.** Medido: `main` em `3c1c761`, tag `v1.67.0` e o ledger dos dois bancos
   terminando na `0158`. O `/api/saude` e o estado do CI não foram consultados daqui; o pré-voo confere.
2. **O agente aplica no ensaio E em produção, antes do merge**, pelo MCP: é o fluxo das F53→F62, não decisão nova sua.
   Sem MCP, é caminho B e PR sem merge.
3. **Uma run, um PR de código e um PR de documentação com a tag**, no molde das F58→F62. Versão `1.68.0` (fase =
   MINOR).
4. **A decisão sobre o default vale para as oito tabelas e só para elas.** A régua para as tabelas da F64 e para `filiais`
   fica como pergunta aberta na ficha da F64, não decidida aqui.
5. **A guarda de topo do fato 13 continua sem válvula.** A ficha pedia exceção por classe DESTRUTIVA; o prompt a trata
   como afrouxamento e mantém a guarda de hoje, com exceção nominal para um backfill legítimo futuro em `ativos`.
6. **O classificador vale a partir da `0159`.** As 157 migrations anteriores só entram no censo (migration aplicada não
   se edita). As `0152`–`0158`, que já têm cabeçalho, são conferidas.
7. **Esta fase não cria nem recria função.** Por isso a prova de que "nenhum escritor mudou" é o `md5` do `prosrc` das
   18 funções igual antes e depois, e a mutação no injetor é decisão do agente, não obrigação.
8. **O `lock_timeout` entra**, mesmo sem precedente na cadeia: é o que impede o `ALTER` de enfileirar o app em
   produção. A forma exata depende de como o CI e o MCP tratam a transação, e o agente mede.
9. **A `0133` vira exceção nominal da guarda, não motivo para desligá-la.** Ela já fez o que a ficha proíbe, está
   aplicada nos dois bancos e não se edita. A guarda que passa a ver o `do` a acusaria para sempre, e a exceção
   fechada com motivo é o que mantém a guarda ligada para todo o resto.
10. **O rollback num banco vivo roda pelo `execute_sql`**, com o conteúdo exato do arquivo `supabase/rollback/F63-*.sql`
   que o CI ensaiou. É a única escrita fora do `apply_migration`, e só num desfecho ruim.
11. **O `INVENTARIO-LEITURAS.md` não é editado.** Ele se declara histórico; a mudança dos quatro pontos para a F67 fica
   registrada na nota do plano e na ficha da F67.

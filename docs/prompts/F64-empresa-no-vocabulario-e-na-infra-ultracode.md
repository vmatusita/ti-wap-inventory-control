# F64 — `empresa_id` no vocabulário e na infra (lote 2)

Ordem de serviço da fase **F64** do `PLANO-MULTIEMPRESA.md` (§7), a terceira da virada. A fase dá `empresa_id` às
**onze tabelas de negócio que ainda não a têm**: `tipos_item`, `motivos`, `kits_modelos`, `senhas_acesso`,
`eventos_admin`, `import_logs`, `relatorios_gerados`, `import_prefixos_patrimonio`, `import_termos_categoria`,
`import_termos_estado` e `unidades_apelidos`. Como na F63, a coluna é preenchida com a WAP **sem um único `update`**. Ao
fim da fase, as 20 tabelas de `k_negocio` têm a chave de recorte, e a pendência que hoje é aviso passa a reprovar.

A fase também fecha dois furos que a ficha nomeia. O primeiro é o **rate-limit da senha de visualização, que hoje falha
ABERTO**: o `error` da RPC é descartado. O segundo é o **kit com motivo órfão**: o código do motivo mora como texto
livre dentro do `payload` jsonb, fora do alcance de qualquer FK.

Duas condições não se negociam, as mesmas da F63:
- **Nenhuma linha das onze é reescrita.** A coluna nasce pelo default não-volátil do PG 11+. A prova, nos dois bancos,
  é o `relfilenode` igual antes e depois e o `xmin` de cada linha igual. Ninguém escreve `update` de backfill.
- **Nada lê a coluna para recortar.** Nenhuma policy, query ou tela. O recorte é da F66. A única leitura permitida é a
  de integridade do kit (fato 15), como exceção nominal.

**As três decisões do Johnny (23/09/2026) mudam a ficha em três pontos:**
1. **O default fica até a F67**, nas onze e em `filiais`, a mesma régua que ele deu ao acervo na F63. Nenhum escritor
   muda. Duas promessas saem desta fase e vão para a F67: o *"`eventos_admin` preenchido na ORIGEM"* da ficha, e o fim
   do default de `filiais` da nota F62.
2. **A troca da PK de `motivos` para `(empresa_id, codigo)` e a FK composta de `movimentacoes` vão para a F65**, junto
   dos outros uniques por empresa e FKs compostas. Levam junto as PKs naturais do vocabulário do import. Aqui `motivos`
   só ganha a coluna.
3. **O rate-limit passa a falhar FECHADO.** Se o contador der erro, a entrada por senha recusa com mensagem genérica, e
   a falha vai para o log. Isso reverte a decisão X4 de `DECISOES.md`.

Com as três, a F64 fica quase toda aditiva. Tem três peças que mudam comportamento, as três pequenas: o gatilho do kit,
a checagem nova de integridade e a recusa do rate-limit.

Depois dela vem a F65, a integridade estrutural do tenant.

---

## Estado de partida: os 26 fatos medidos no disco, no git e nos dois bancos (23/09/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje contra a árvore e o git, e contra o catálogo e as tabelas
> de PRODUÇÃO e do ENSAIO pelo MCP da Supabase, só leitura e só contagem. **Não** foram copiados da ficha, que é de
> 04/09 (v1.49.1), anterior às F45→F63. Onde divergem dela, a divergência está marcada com ⚠. O prompt manda o agente
> **remedir antes de aceitar**.

**Onde o projeto parou**

1. `main` em **`86890b7`** (merge do PR #74, o fecho de documentação da F63), com a tag anotada **`v1.68.0`** nesse
   commit; `package.json` em `1.68.0`.
   - Última migration **`0161_empresa_no_acervo_movimento.sql`**: 160 arquivos, `0001`→`0161`, e a `0029` é gap real.
   - O ledger dos dois bancos termina em `empresa_no_acervo_movimento`: produção com 145 linhas, ensaio com 158 (a
     divergência histórica do `RUNBOOK-BANCO.md`).
   - Produção `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh` estão `ACTIVE_HEALTHY`, Postgres **17.6**, e
     `rotulo_de_ambiente()` responde `'desenvolvimento'` no ensaio.
   - ⚠ A ficha lista `0148`–`0150`, números gastos pela F60/F61. **A primeira desta fase é a `0162`.** Versão da fase:
     **`1.69.0`**. Os checks obrigatórios da `main` são **`verificar`** e **`banco-sem-docker`**.
2. **A rede de hoje** (o fecho da F63):
   - 252 arquivos de teste com 7.600 testes;
   - 43 roteiros SQL mais o `_asserts.sql`, com 1.002 asserções e 0 ✗;
   - o injetor em **131/131**, no teto e sem folga, com 2 em quarentena de 133;
   - `db:types:diff` em 38 relações · 347 colunas · 94 funções;
   - `k_negocio`/`k_infra`/`k_sem_select`/`k_lote1` em **20/9/6/8**; 62 policies vivas (`public` 54 · Storage 8);
   - advisor de segurança de produção, **medido hoje**: **6 INFO** `rls_enabled_no_policy` (`ambiente`,
     `backups_migration`, `empresas`, `plataforma_admins`, `senha_tentativas`, `senhas_acesso`), **34 WARN** de definer
     executável por `authenticated` e **1 WARN** de senha vazada (Auth, fora do banco).

**As onze tabelas, nos dois bancos (só contagens e catálogo)**

3. | tabela | produção | ensaio | PK | policies | gatilho | FK que entra |
   |---|---|---|---|---|---|---|
   | `tipos_item` | 10 | 7 | `id smallint` | 3 | — | `itens.tipo_id` |
   | `motivos` | 14 | 13 | **`codigo text`** | 4 | — | `movimentacoes.motivo` |
   | `kits_modelos` | **0** | **0** | `id uuid` | 4 | — | — |
   | `senhas_acesso` | 5 | 1 | `id uuid` | **0** | — | — |
   | `eventos_admin` | 102 | 9 | `id uuid` | 1 | — | — |
   | `import_logs` | 12 | 4 | `id uuid` | 2 | — | — |
   | `relatorios_gerados` | 13 | 1 | `id uuid` | 2 | — | — |
   | `import_prefixos_patrimonio` | 7 | 7 | **`prefixo text`** | 1 | — | — |
   | `import_termos_categoria` | 5 | 5 | **`termo text`** | 1 | — | — |
   | `import_termos_estado` | 17 | 17 | **`termo text`** | 1 | — | — |
   | `unidades_apelidos` | 13 | 14 | `id bigint` | 3 | `unidades_apelidos_vocabulario_guarda` (BEFORE) | — |

   - **Totais:** produção com 198 linhas, ensaio com 78, e **22 policies** nas onze. As maiores são `relatorios_gerados`
     (296 kB) e `eventos_admin` (280 kB); as outras têm até 112 kB. Todas são tabelas **frias**.
   - Nenhuma delas está na publication `supabase_realtime`, que tem só `movimentacoes`, `anotacoes` e
     `lancamentos_item`.
   - ⚠ **`kits_modelos` está VAZIA nos dois bancos.** Ali o `count(*) = count(empresa_id)` tem universo zero, e a prova
     do kit órfão vem **só** do CI.
   - `motivos` (14 × 13) e `tipos_item` (10 × 7) divergem entre os bancos. É dado, não esquema: a paridade de catálogo
     não o vê.
4. **⚠ A lista da ficha não é a lista desta fase.** Ela nomeia 12, e o disco dá **11**:
   - faltam as quatro do vocabulário do import (`import_prefixos_patrimonio`, `import_termos_categoria`,
     `import_termos_estado`, `unidades_apelidos`), registradas na nota F63 da ficha;
   - `filiais` e `operador_filiais` já ganharam a coluna na F62;
   - `senha_tentativas` e `ambiente` são **infra**: estão em `k_infra`, cada uma com o motivo escrito em
     `catalogo_policies.sql`.

   Depois desta fase, **`k_negocio` fica 20/20 com `empresa_id`**.
5. **⚠ Quatro das onze têm PK NATURAL e não têm coluna `id`:** `motivos (codigo)`, `import_prefixos_patrimonio
   (prefixo)`, `import_termos_categoria (termo)` e `import_termos_estado (termo)`. O instrumento da F63
   (`docs/f63-evidencias/impressao-acervo.sql`) ordena por `id`. Aqui ele precisa ordenar **pela PK lida do catálogo**
   (`pg_constraint.conkey`), senão o `md5` de `(pk, xmin)` nem existe para essas quatro.

**A coluna sem reescrita (o molde da F63)**

6. **O molde é a `0160`/`0161`**, provado nos dois bancos em 23/09.
   - Cada tabela recebe `add column empresa_id uuid not null default public.empresa_legada() references public.empresas
     (id)` e o `comment on column` com *"o default cai na F67"*.
   - `set lock_timeout = '2s';` no topo e `reset lock_timeout;` no fim, **sem `begin`/`commit`**. A F63 mediu na decisão
     2 que o `apply_migration` do MCP é atômico e que o CI (`psql -f` sem `-1`) não é.
   - Classe `ADITIVA` no cabeçalho.
   - As provas: o `relfilenode`, o `md5` de `(id, xmin)`, o `md5` do conteúdo menos `empresa_id`, `atthasmissing = t`, a
     FK `convalidated` e o default conferido pelo `pg_depend` contra `'public.empresa_legada()'::regprocedure`.
   - O resultado da F63: tudo idêntico nos dois bancos, janela 0, nenhum `lock_timeout` disparou.
   - A receita está no `RUNBOOK-BANCO.md` (*"a receita do `add column` sem reescrita"*).
7. **⚠ Aqui nenhum gatilho barra um `update` ingênuo.** Nenhuma das onze tem `guarda_acervo`, e a guarda de topo de
   `migrations-f38.test.ts` só cobre `movimentacoes`, `lancamentos_item` e `ativos`. Um `update … set empresa_id` de
   backfill **passaria em silêncio nas onze**. É o caso de `ativos` na F63, multiplicado.
   - Na mesa, quem o pega é o classificador: um `update` de topo sobre tabela existente vira BACKFILL e exige o bloco de
     `backups_migration`.
   - No banco, só o `xmin` prova que não houve.

**O default e os escritores (a decisão 1 do Johnny)**

8. **Os escritores das onze.** É o **orçamento da F67**, e a fase não o executa.
   - **9 funções SQL:**
     - 8 fazem INSERT em `eventos_admin`: `apagar_ativo`, `apagar_ativos_conflito_filiais`, `apagar_item`,
       `apagar_movimentacao`, `forcar_estado_ativo`, `forcar_saldo_item`, `resetar_acervo` e `resetar_itens`;
     - `import_gravar_trilha` faz INSERT em `import_logs`;
     - nenhuma função escreve nas outras nove.
   - **TS, em `src/lib`:**
     - `auditoria-registro.ts:30` é o **único** escritor TS de `eventos_admin`, pelo service role, com 15 chamadas de
       `registrarEventoAdmin(` (admin 5, dev 3, importar 3, senhas 2, unidades-apelidos 2);
     - os inserts: `tipos-item.ts:104`, `admin.ts:733` (motivos), `kits.ts:64`, `senhas.ts:161`, `relatorios.ts:143` e
       `unidades-apelidos.ts:62`;
     - `admin.ts:610` insere em `filiais`, a da nota F62.
   - As três tabelas de termo e prefixo do import **não têm escritor fora de migration**.
   - **Scripts:** `seed.ts` (inclusive `:1525`, `eventos_admin`), `smoke/persona.ts:80`,
     `manutencao/gerar-errata-truncamento.ts` e `reset.ts` (apaga `eventos_admin`).
   - **Roteiros** (INSERTs diretos):

     | tabela | INSERTs | roteiros |
     |---|---|---|
     | `tipos_item` | 6 | 4 |
     | `motivos` | 4 | 3 |
     | `kits_modelos` | 1 | 1 |
     | `senhas_acesso` | 2 | 2 |
     | `import_logs` | 6 | 4 |
     | `relatorios_gerados` | 3 | 3 |
     | `import_prefixos_patrimonio` | 1 | 1 |
     | `import_termos_categoria` | 3 | 1 |
     | `import_termos_estado` | 3 | 1 |
     | `unidades_apelidos` | 7 | 1 |
     | `eventos_admin` | 2 | 2 |
     | **`filiais`** | **22** | **10** |

   **Com o default mantido, nenhum desses escritores muda nesta fase.** O INSERT sem `empresa_id` recebe a WAP.
9. **O que a decisão 1 empurra para a F67.**
   - O *"`eventos_admin.empresa_id` preenchido na ORIGEM por `src/lib/auditoria-registro.ts`"* da ficha, mais as 8
     funções do fato 8.
   - A nota F62 da ficha F64: *"tirar o default de `filiais` (a empresa passa a vir de quem cria a filial) e, com ele, a
     ponte de `papel_atual()` e `EMPRESA_LEGADA_ID` no app"*. Isso é exatamente o que a F67 já faz, quando `papel_atual()`
     ganha `p_empresa`.

   A única fonte de empresa que existe antes da F67 é `EMPRESA_LEGADA_ID` explícito, e isso é a mesma herança silenciosa
   espalhada que a F63 recusou.

**Os leitores**

10. **Nenhuma leitura de hoje vê a coluna nova.**
    - Nenhum `select('*')` sobre as onze em `src/**`: os 9 `select('*', {head: true})` e as 17 constantes `select: '*'`
      são do acervo e são frouxas.
    - Nenhum `.select()` sem argumento depois de insert ou update.
    - As formas F58 das onze (`src/lib/queries/formas/{tipos-item,motivos,kits,eventos-admin,relatorios-gerados,
      vocabulario-import,admin,catalogo,…}.ts`) têm lista explícita de colunas.
    - Nenhuma função devolve `setof` de uma delas nem faz `to_jsonb(<linha>)` delas.
    - Nenhum backup (`restaurar.mjs`, formas de backup) as cobre.
    - ⚠ **Decisão da F58: forma estrita que não bate LANÇA em produção**, e o app velho continua no ar entre o apply e o
      deploy. A prova é o smoke e o conferidor de formas contra produção depois do apply.

**`senhas_acesso` e o rate-limit (a decisão 3 do Johnny)**

11. **`src/lib/actions/senhas.ts:63`** faz `const { data: excedeu } = await chamarRpc(admin, 'registrar_tentativa_senha',
    { p_ip: … })`.
    - O `error` é descartado, e `null` é falsy: **falha ABERTO**. O comentário das linhas 60-62 diz que é de propósito.
      É a decisão **X4** de `DECISOES.md` (~linha 446, migration `0025`: *"Falha ABERTO se a RPC der erro"*).
    - `chamarRpc` (`src/lib/supabase/rpc.ts:212`) devolve `{ data, error }` e **não lança**.
    - A leitura `ativas` (`:75-78`) também descarta o `error`, mas falha fechado (sem candidato, dá "Senha inválida").
    - `registrar_tentativa_senha(p_ip text, p_max int, p_janela_seg int)` é definer, só `service_role`, e o `senhas.ts`
      a chama com os defaults (5 em 60 s).
    - **Fica para a F68:** a varredura linear com scrypt, a rota por empresa, as cinco recusas com a mesma cara e o teto
      por `(empresa, origem)`.
12. **`senhas_acesso` tem zero policy** (`k_sem_select`). Ela só é lida e escrita pelo service role: `senhas.ts`,
    `auth/acesso.ts`, `queries/admin.ts` e `scripts/perf/medir.mjs`. A coluna nova só ganha leitor na F68.

**`kits_modelos` e o motivo órfão**

13. **O `payload jsonb` guarda `motivo?: text` livre** (`0043:40` e o `comment on column`), sem FK, porque FK não alcança
    jsonb.
    - A validação de hoje é só o Zod: `src/lib/validators/kit.ts:107`, `textoOpcional(60, …)`.
    - As actions são `kits.ts:57/64` (insert) e `:91/102` (update). Kit não se apaga: desativa-se.
    - São 0 kits nos dois bancos. O único aviso do smoke de produção é esse.
14. **As checagens de integridade.**
    - `dev_checagens_integridade()` (guarda `e_dev()`) e `checagens_integridade_resumo()` (a sonda da F55) leem
      `checagens_integridade_nucleo()`: definer, ~9 KB, última versão na `0158`, com **12 peças**.
    - Cada checagem é uma LINHA `(chave, total, amostra)`, e a forma estrita é por linha (`formas/dev.ts`). Uma chave
      nova não quebra a forma, e a tela mostra chave desconhecida no fim (`validators/dev-integridade.ts`).
    - **Três lugares precisam da chave nova no MESMO commit:**
      - o catálogo curado `CHECAGENS` (`src/lib/queries/dev.ts:197`);
      - `scripts/smoke/linha-de-base.json`, nos dois alvos;
      - a cobertura `scripts/smoke/cobertura.test.mts`.
    - ⚠ **O avaliador ALARMA chave que a política não conhece** (`scripts/smoke/alarme.mjs:47-57`). Entre o apply de
      produção e o merge, o banco já devolve a chave nova e a `main` ainda não a conhece. Uma Parte B do `saude.yml`
      nessa janela (a agendada das 06:43, ou uma disparada à mão) abre a issue de alarme.
    - A regra da linha de base é *"o agente NUNCA a sobe"*. Acrescentar uma chave NOVA com 0 é outra coisa, e se declara
      na ata.
15. ⚠ **"O motivo existe NA EMPRESA DO KIT"** (a ficha) exige LER `kits_modelos.empresa_id` e `motivos.empresa_id`. É a
    primeira leitura da coluna fora do catálogo antes da F66. É leitura de integridade, não recorte, e entra como
    **exceção nominal** da trava "ninguém lê", com o motivo.

**`motivos` (a decisão 2 do Johnny)**

16. **`motivos`** tem PK `(codigo)` (`motivos_pkey`) e quatro colunas (`codigo`, `rotulo`, `aplica_a
    tipo_movimentacao[]`, `ativo`).
    - A FK `movimentacoes_motivo_fkey (motivo) references motivos(codigo)` cobre 435 das 3.630 movimentações de produção
      (10 códigos em uso) e 471 das 3.245 do ensaio.
    - O update do motivo é por `.eq('codigo', …)` (`admin.ts:761-763`), e `rel_por_motivo_filiais`/`rel_resumo_filiais`
      juntam por código.
    - **A troca PK + FK vai para a F65.** As PKs naturais do vocabulário do import (`prefixo`, `termo`) têm o mesmo
      defeito e o mesmo destino. Aqui, **nenhuma constraint existente se toca**.

**Os catálogos, as travas, o injetor e os tipos**

17. **`supabase/tests/catalogo_policies.sql`** tem:
    - `k_negocio` (20), `k_infra` (9, cada uma com o motivo) e **`k_lote1` (8, a fonte única das oito)**;
    - o **bloco 5**: 15a (`k_lote1` ⊆ `k_negocio`), 15b (as oito com a forma, **exigindo** o default pelo `pg_depend`;
      a F67 o inverte) e 15c (toda tabela de negócio que TEM a coluna, lida do catálogo, está na mesma forma);
    - e um **`raise notice` de pendência da F64**, que hoje **não reprova**.

    Quem lê `k_lote1`: o describe 12 de `src/lib/validators/catalogos-seguranca.test.ts` (`:748-784`) e
    `src/lib/validators/empresa-acervo-sem-leitura.test.ts` (`:40`), que é a trava "ninguém lê" com TS, catraca do literal
    e corpo vigente. A trava que a ficha pede (*"toda tabela de negócio tem `empresa_id not null`, com lista de infra
    nomeada e justificada"*) é esse aviso **virando reprovação**.
18. **O describe 5** de `catalogos-seguranca.test.ts`, emendado na F63, traça a fronteira entre catálogo e valor: ver a
    coluna pelo catálogo é permitido, ler dado por ela é proibido até a F66, e o RECORTE é textual. Ele cobre o acervo.
    O cabeçalho de `isolamento_tenant.sql` diz *"F64 para as 11 restantes"*.
19. **O injetor** tem teto **131**, sem folga (`scripts/db/mutacoes.test.mts`, histórico datado). As seis mutações
    `F63_ACERVO` são o molde. O teto só sobe no número exato, com o porquê datado e a quarentena abaixo de ⅓.
20. **Os tipos:** o `db:types:diff` do CI compara com `src/lib/types/database.ts`. Sem token na sessão, o caminho é o
    *hand-fix* datado antes do SHA congelado, e a geração pelo `generate_typescript_types` do MCP depois do apply no
    ensaio (o molde F60 → F63).
21. **Os rollbacks encadeados** (R-ACC-90): `supabase/rollback/F63-desfaz.sql`; `f63_rollback.sql` o ensaia; e
    `f62_rollback.sql` roda o da F63 ANTES. A F64 pendura mais 11 FKs em `empresas` e 11 defaults em `empresa_legada()`,
    então **os dois roteiros de rollback anteriores têm de rodar o da F64 antes**, senão quebram como o da F62 quebrou na
    F63.
22. **O classificador** (`scripts/db/classificar-migration.mjs`, desde a `0159`):
    - `add column` com default da lista fechada (`public.empresa_legada()`) é ADITIVA;
    - `create function`, `create or replace function` e `create trigger` são ADITIVA (o corpo é guardado);
    - o cabeçalho é obrigatório;
    - cada migration nova entra em `DA_F38` e em `migrations.lock.json`, e o nome sem prefixo não pode repetir;
    - a guarda de topo continua sem válvula.

**O método e a conferência**

23. **ADR-003 + `RUNBOOK-BANCO.md`.**
    - O apply é pelo `apply_migration` do MCP, **ensaio primeiro**, com `name` = nome do arquivo sem `NNNN_`, e nenhuma
      migration toca banco real antes de o CI tê-la rodado.
    - **Proibidos** contra os bancos vivos: `supabase db push`, `migration repair`, `db reset --linked` e reescrever
      `schema_migrations`.
    - A prova pós-apply tem grants, `notify pgrst, 'reload schema'`, `get_advisors(security)`, a paridade das **11
      classes** (`supabase/ci/impressao-schema.sql`) e o smoke.
    - A sonda de deriva (`scripts/smoke/deriva-migrations.mjs`, base `146`) cobra no ledger de PRODUÇÃO todo arquivo ≥
      `0146` em até **24 h** do commit que o acrescentou.
    - Sem MCP, é o **caminho B**: o Johnny no SQL Editor, e o PR não é mergeado.
24. **A conferência pós-deploy e as credenciais.**
    - `/api/saude` devolve `{ok, versao, commit, banco, ms}`.
    - `node scripts/smoke/smoke-prod.mjs` carrega sozinho as `SMOKE_*`. A referência é *"109 OK · 1 aviso (kits_modelos)
      · 0 falha"*.
    - `gh workflow run saude.yml -f partes=b` dispara a Parte B.
    - `npx tsx scripts/formas/conferir.mts`, com a credencial por `--env-file` e só contagens, deu na F63 271 pontos ·
      100.513 linhas · 0 recusadas.
    - O `.env.local` aponta para o **ENSAIO** e as `SMOKE_*` para **PRODUÇÃO**. Regra do `INVENTARIO-CREDENCIAIS.md` §9,
      depois do incidente de 10/09: **nunca abrir, filtrar nem imprimir o `.env.local`**.
25. **A máscara do patrimônio.** A decisão 1 da F62 deixou só `patrimonio_digitos` em `empresas`, com o motivo *"coluna
    sem consumidor é contrato sem prova"*, e escreveu que *"o prefixo fica em `import_prefixos_patrimonio` até a F64"*.
    Com `empresa_id` nessa tabela, **o prefixo por empresa É o dado dela**. A fase **não** cria
    `empresas.patrimonio_prefixo`, e isso vai para a ata.
26. **As regras do `CLAUDE.md` que pesam aqui** são a 1, a 2 (nunca dado real; de produção, só contagem e hash), a 3 (R$
    0, nenhuma dependência nova), a 5, a 6, a 7 e a 8.
    - A regra 6 pede documentação oficial antes de afirmar: `ALTER TABLE … ADD COLUMN` com default não-volátil,
      `CREATE TRIGGER … BEFORE … UPDATE OF`, os operadores de `jsonb`, o `RAISE … USING ERRCODE` do PL/pgSQL e o
      `lock_timeout`, no PostgreSQL 17.
    - O molde de fechamento é o das F58→F63: um PR de código, com as migrations aplicadas no ensaio e em produção
      **antes** do merge; merge com os dois checks verdes; conferência pós-deploy; e um PR só de documentação que leva a
      tag.

---

## As três decisões do Johnny (23/09/2026)

1. **O default `public.empresa_legada()` das onze, e o de `filiais`, FICA até a F67.** É a régua da F63. O comentário da
   coluna diz por que existe e quando cai. O *"`eventos_admin` preenchido na origem"* e o fim do default de `filiais`
   (com a ponte de `papel_atual()`/`EMPRESA_LEGADA_ID`) vão para a ficha da F67, com o orçamento do fato 8. **Desvio
   declarado** de dois itens da ficha F64 e da nota F62 dela.
2. **A troca da PK de `motivos` para `(empresa_id, codigo)` e a FK composta `(empresa_id, motivo)` de `movimentacoes`
   vão para a F65**, junto das PKs naturais do vocabulário do import (`prefixo`, `termo`). A F64 não toca constraint
   existente nenhuma. **Desvio declarado** do *"trocar a chave e a FK juntas, na mesma migration"* da ficha.
3. **O rate-limit da senha falha FECHADO.** `error` na RPC `registrar_tentativa_senha` recusa a entrada com mensagem
   genérica e registra a falha. Isso reverte a X4, que é o que a ficha pede (*"o `error` descartado é corrigido agora"*).

---

## As frentes, e por que nesta ordem

- **A — o censo e o "antes".** Antes de tocar qualquer banco: os 26 fatos remedidos, o `PLAN-F64.md`, o censo dos
  escritores e leitores (o orçamento que vai para a F67) e **a impressão "antes" das onze nos dois bancos**, ordenada
  pela PK do catálogo.
- **B — as travas, vermelhas.** O lote 2 no catálogo, o kit, o rate-limit e a chave nova da integridade. Regra 4 da §4:
  trava antes da correção.
- **C — o rate-limit.** Só TS, sem banco. É independente do resto, e por isso vem cedo.
- **D — o banco.** As colunas primeiro. Depois, numa migration própria, o gatilho do kit e a checagem nova.
- **E — os roteiros, os catálogos, os tipos, o injetor e a política do alarme.**
- **F — os documentos.**
- **G — o fechamento, com ordem interna rígida.** Versão → revisão adversarial → SHA congelado → CI verde → apply no
  ensaio + impressão → apply em produção + impressão → smoke e conferidor → merge → deploy → conferência → relatório →
  PR de documentação → tag.

---
## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F64 do `docs/PLANO-MULTIEMPRESA.md` (§7), a terceira da virada. Ao terminar:
- as onze tabelas de negócio que ainda não tinham a chave de recorte (`tipos_item`, `motivos`, `kits_modelos`,
  `senhas_acesso`, `eventos_admin`, `import_logs`, `relatorios_gerados`, `import_prefixos_patrimonio`,
  `import_termos_categoria`, `import_termos_estado`, `unidades_apelidos`) têm `empresa_id uuid not null`, com FK
  validada para `public.empresas(id)` e default `public.empresa_legada()` mantido até a F67 (decisão 1 do Johnny).
  Estão preenchidas pela WAP **sem nenhum `update` e sem nenhuma tupla reescrita**: nos dois bancos, o `relfilenode` e
  o `md5` de `(pk, xmin)` ficam iguais antes e depois (fatos 5 a 7);
- as 20 tabelas de `k_negocio` têm a coluna, e a pendência que hoje é aviso **reprova**;
- nenhum escritor mudou, e nada lê a coluna para recortar;
- o kit recusa, **no banco**, um `payload.motivo` que não exista na empresa do kit, e a integridade ganhou a checagem
  do kit com motivo órfão, conhecida pela tela, pela linha de base do alarme e pela cobertura;
- `entrarComSenha` falha **FECHADO** quando o contador de tentativas der erro (decisão 3 do Johnny);
- cada peça tem a trava que reprova a volta.

Uma run, um PR de código e um PR de documentação com a tag. Versão `1.69.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1, a decisão 2;
  - §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 8, migration nunca se
    edita; a 10, a ORDEM de rollback);
  - a ficha **F64** no §7, com as notas F62 e F63. Ela é a FONTE DA VERDADE do escopo: onde esta ordem e ela divergirem
    sem declaração, vale a ficha;
  - as fichas **F65**, **F66**, **F67** e **F68**, para saber o que NÃO antecipar e o que elas esperam encontrar.
- `docs/prompts/F64-empresa-no-vocabulario-e-na-infra-ultracode.md`: o cabeçalho com os **26 fatos medidos** e as três
  decisões do Johnny. Este prompt os cita pelo número.
- `CLAUDE.md` e `AGENTS.md`: as regras permanentes, em especial a **1**, a **2**, a **3**, a **5**, a **6** (use o
  Context7 e a documentação oficial do PostgreSQL 17 e da Supabase), a **7** e a **8**.
- **O molde imediato é a F63.** Leia `docs/RELATORIO-F63.md`, `docs/PLAN-F63.md` (em especial §4, as dez decisões), a
  ata de 2026-09-23 · F63 em `docs/DECISOES.md` e `docs/f63-evidencias/` (`impressao-acervo.sql`,
  `impressao-policies.sql`, `verificacao-pos-apply.sql`). Em `docs/DECISOES.md`, leia também a decisão X4 (o rate-limit
  falhando aberto, ~linha 446) e as atas da F55 (a sonda e a linha de base) e da F58 (as formas e o conferidor).
- `docs/ADR-003-metodo-de-migration.md`, `docs/RUNBOOK-BANCO.md` inteiro (o Anexo da F63, a receita do `add column`
  sem reescrita e a receita BACKFILL), `docs/MATRIZ-REGRAS.md` (R-ACC-29, R-ACC-30, R-ACC-77 a R-ACC-90) e
  `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e destinos, **nunca o `.env.local`**).
- O código, nesta ordem:
  - as migrations `0025`, `0043`, `0138`, `0152`, `0155`, `0158`, `0159`, `0160` e `0161`;
  - `supabase/tests/catalogo_policies.sql` (os conjuntos e o bloco 5), `empresa_no_acervo.sql`, `f63_rollback.sql`,
    `f62_rollback.sql`, `isolamento_tenant.sql`, `restauracao.sql` e `_asserts.sql`;
  - `src/lib/validators/catalogos-seguranca.test.ts` (describes 5, 9 e 12), `empresa-acervo-sem-leitura.test.ts`,
    `migrations-backfill.test.ts` e `src/lib/itens/migrations-f38.test.ts`;
  - `scripts/db/classificar-migration.mjs`, `mutacoes.mjs`, `mutacoes.test.mts`, `run-mutation-tests.mjs`,
    `corpo-vigente.mjs` e `scripts/db/CLAUDE.md`;
  - `src/lib/actions/senhas.ts`, `src/lib/supabase/rpc.ts`, `src/lib/observabilidade*.ts` (o `registrarFalha` e a
    redação por valor), `src/lib/queries/relatorios/fronteira-viewer.test.ts` e
    `src/lib/supabase/superficie-admin.test.ts`;
  - `src/lib/actions/kits.ts`, `src/lib/validators/kit.ts`, `src/lib/queries/kits.ts` e `formas/kits.ts`;
  - `src/lib/queries/dev.ts` (`CHECAGENS`), `formas/dev.ts`, `src/lib/validators/dev-integridade.ts`,
    `scripts/smoke/linha-de-base.json`, `alarme.mjs`, `alarme.test.mts` e `cobertura.test.mts`;
  - `src/lib/types/database.ts`, `scripts/formas/conferir.mts`, `scripts/smoke/deriva-migrations.mjs`,
    `supabase/ci/impressao-schema.sql` e `.github/workflows/ci.yml` (só leitura).

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 26 fatos, medidos em 23/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco e os bancos de hoje antes de
agir. Onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o relatório. Os que
mais importam:
- **fato 1**: a primeira migration é a `0162`, não a `0148`;
- **fato 3**: `kits_modelos` está vazia nos dois bancos;
- **fato 4**: são onze tabelas, não doze, e `senha_tentativas`/`ambiente` ficam em `k_infra`;
- **fato 5**: quatro das onze não têm `id`, e o instrumento ordena pela PK do catálogo;
- **fato 7**: nenhum gatilho barra um `update` ingênuo aqui, e só o `xmin` prova que ele não houve;
- **fato 8**: o orçamento de escritores que a decisão 1 empurra para a F67;
- **fato 10**: a forma estrita que LANÇA em produção, com o app velho no ar entre o apply e o deploy;
- **fato 11**: `senhas.ts:63`, e a X4;
- **fato 14**: a chave nova da integridade, e o alarme que dispara na janela entre o apply e o merge;
- **fato 15**: a leitura de `empresa_id` que o kit exige;
- **fato 21**: os rollbacks encadeados.

## Comandos que já existem: use, não reinvente
- `npm run lint` · `npm run test` · `npm run typecheck` (= `npx tsc --noEmit`) · `npm run build` · `npm run contraste` ·
  `npm run verificar:actions`.
- `npm run db:lock`, obrigatório no commit de cada migration.
- `node scripts/db/classificar-migration.mjs` (e `--censo`).
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
O primeiro entregável é `docs/PLAN-F64.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`.
- **Os 26 fatos remedidos**, cada divergência contra a ficha anotada.
- **O censo dos escritores e leitores das onze** (fatos 8 a 10): SQL, TS, scripts e roteiros, com o que cada um faz
  hoje. É o orçamento da F67, e a fase NÃO o executa.
- **O desenho**, com as decisões 1 a 11 de "Autonomia" tomadas por escrito.
- **A ordem das migrations e a ORDEM DE ROLLBACK** (o inverso do apply), escrita também no rodapé de cada migration.
- **A impressão "antes"**, nos DOIS bancos, pelo MCP, só leitura, antes de qualquer apply. É um arquivo
  `docs/f64-evidencias/impressao-vocabulario.sql`, com o MESMO texto antes e depois, derivado do
  `impressao-acervo.sql` da F63. Para cada uma das onze tabelas ele imprime:
  - `count(*)`;
  - `pg_relation_filenode()`, que acusa reescrita da tabela;
  - o `md5` de `(pk, xmin)` na ordem da PK. A PK é **lida do catálogo** (`pg_constraint.conkey`), nunca escrita à mão:
    quatro das onze não têm `id` (fato 5);
  - o `md5` de `string_agg((to_jsonb(t) - 'empresa_id')::text, '|' order by <pk>)`, que acusa mudança de conteúdo;
  - em produção, a atividade da janela: as linhas com `xmin` posterior ao `pg_current_xact_id()` gravado no "antes",
    que entra como PARÂMETRO declarado do instrumento.

  Todo `md5` passa por `coalesce(…, 'vazia')`, porque `kits_modelos` está vazia nos dois bancos (fato 3). O instrumento
  também imprime o `md5` do `prosrc` das 9 funções escritoras do fato 8, mais `registrar_tentativa_senha`, e das
  **12 peças** de hoje de `checagens_integridade_nucleo` (prova do critério 14).

  A saída é **só contagem e hash**: nenhum id, código, rótulo, hash de senha, texto de `detalhe` ou nome sai da consulta.
  Junto dela vão a impressão das policies (reuse `docs/f63-evidencias/impressao-policies.sql`) e o advisor de segurança,
  contado por nível e nome. Tudo em `docs/f64-evidencias/antes/`.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f64-evidencias/`.
- **A trava do lote 2 no catálogo** (decisão 6).
  - As onze moram numa fonte só (por exemplo, `k_lote2` em `catalogo_policies.sql`), conferida contra `k_negocio`.
  - Cada uma tem `empresa_id` `uuid`, `not null`, FK validada para `public.empresas(id)` e default **exatamente**
    `public.empresa_legada()`, conferido pelo `pg_depend`, nunca pelo texto de `pg_get_expr`. Nenhuma tem `force row
    level security`.
  - O `raise notice` de pendência da F64 **vira asserção**: toda tabela de `k_negocio` tem a coluna, e a lista de infra
    continua nomeada, com motivo.
  - Hoje ela reprova pelos onze nomes.
- **O kit** (decisão 3): um roteiro com os casos da sabotagem C, vermelho porque o gatilho ainda não existe.
- **O rate-limit** (decisão 5): o teste de mesa da sabotagem D, vermelho porque `senhas.ts:63` ainda descarta o `error`.
- **A chave nova da integridade** (decisão 4): a trava que exige a chave no catálogo curado `CHECAGENS`, na linha de
  base dos dois alvos e na cobertura, vermelha porque ela ainda não existe em lugar nenhum.
- **"Ninguém lê `empresa_id` antes da F66", estendida ao lote 2** (decisão 7). É varredura, e nasce verde no mesmo
  commit (regra 4), com um caso sintético que acusa. As duas leituras do kit (o gatilho e a checagem) entram como
  exceções NOMINAIS, com o motivo, numa fonte só.

### Frente C: o rate-limit (só TS)
- `entrarComSenha` passa a ler `{ data, error }` da RPC. Com `error`, **recusa**: nenhuma senha é conferida, nenhum
  cookie nasce, e a resposta é uma mensagem genérica (decisão 5). A falha vai para `registrarFalha` com escopo próprio
  e **sem o IP no contexto**: IP é dado pessoal, e o funil redige por valor, não por nome de chave. Confira em
  `observabilidade*`.
- Com `data === true`, o comportamento de hoje ("Muitas tentativas…"). Com `false`, segue.
- O comentário das linhas 60-62 muda e aponta a ata da F64, que reverte a X4.
- **Não** muda nesta fase: a varredura linear, a leitura `ativas`, a rota, as cinco recusas. É tudo F68.

### Frente D: o banco (migrations `0162`+)
Migrations pequenas, cada uma com o cabeçalho de classe (validado pelo classificador), rollback no rodapé, `db:lock` no
mesmo commit, entrada em `DA_F38` e nome-sem-prefixo que não repita nenhum arquivo do repositório.
- **As onze colunas**, em duas ou três migrations (decisão 1), na forma EXATA da `0160`/`0161`:
  - `add column empresa_id uuid not null default public.empresa_legada() references public.empresas (id)`;
  - `comment on column` com a data, o motivo e *"o default cai na F67"*;
  - `set lock_timeout` / `reset` (decisão 2);
  - classe `ADITIVA`;
  - **o `update` de backfill não se escreve**, e isso vai em letras grandes no cabeçalho, com o porquê (fato 7).

  Nenhuma constraint, índice, PK ou policy existente muda (decisão 2 do Johnny: a PK de `motivos` e as PKs naturais
  do import são da F65).
- **O kit e a checagem**, numa migration PRÓPRIA, depois das colunas:
  - uma função de gatilho nova e o gatilho `before insert or update` em `kits_modelos` (decisão 3). A regra: se
    `payload->>'motivo'` não for nulo, tem de existir linha em `motivos` com esse `codigo` **e o mesmo `empresa_id`
    do kit**, ativo ou não (o fluxo re-filtra ao aplicar). Senão, recusa com errcode e mensagem próprios;
  - `create or replace function public.checagens_integridade_nucleo()` com a **13ª peça**, o kit com motivo órfão
    (decisão 4). **As 12 peças de hoje ficam byte a byte**, e a prova é o `md5` de cada uma antes × depois;
  - grants, `revoke` e `search_path` no molde das funções vizinhas; confira `seguranca_catalogo.sql`.
- **Nenhuma outra função criada ou recriada**: as 9 escritoras do fato 8 e `registrar_tentativa_senha` ficam
  intactas.

### Frente E: os roteiros, os catálogos, os tipos, o injetor e a política do alarme
- **O roteiro da fase** (por exemplo, `supabase/tests/empresa_no_vocabulario.sql`), no molde de
  `empresa_no_acervo.sql`: o default, a FK, os instrumentos numa tabela de PK natural, o kit e a checagem. Toda recusa é
  **provada duas vezes**: a falha, e depois, como `postgres`, o dado intacto. Tudo usa `assert_zero_de`, que recusa
  universo vazio.
- **O rollback**: `supabase/rollback/F64-desfaz.sql` na ordem inversa, ensaiado por `f64_rollback.sql` até a impressão
  do CI tirada antes da `0162`. **`f63_rollback.sql` e `f62_rollback.sql` passam a rodar o da F64 antes** (fato 21).
- **Os catálogos**: `k_lote2` (ou a fonte única que a decisão 6 escolher) e o bloco 5 generalizado, com as contagens
  dos cabeçalhos atualizadas. Emende o describe 12, ou crie o irmão dele, para prender a fonte única.
- **O describe 5 e `isolamento_tenant.sql`**: a fronteira catálogo × valor passa a cobrir o lote 2. O cabeçalho do
  roteiro diz o que a F64 preencheu (as 20 de `k_negocio`) e o que falta (a leitura, na F66).
- **A política do alarme**: a chave nova entra, no MESMO commit, em `CHECAGENS` (com nome e descrição curados),
  `scripts/smoke/linha-de-base.json` (**0 nos dois alvos**, com a data) e na cobertura. Ata: acrescentar chave nova com
  0 não é subir a linha de base.
- **`src/lib/actions/kits.ts`**: a recusa do gatilho vira mensagem pt-BR pela tradução do projeto (`erros.ts`), sem
  mudar o fluxo.
- **`src/lib/types/database.ts`**:
  - *hand-fix* datado antes do SHA congelado (as onze colunas em `Row`/`Insert`/`Update` + as FKs, e o que a função de
    gatilho acrescentar);
  - depois do apply no ensaio, a geração do MCP e a conferência de que batem;
  - se diferir: commit novo, CI de novo, e o SHA congelado passa a ser esse, antes do apply de produção.
- **O injetor** (decisão 8).

### Frente F: os documentos
- **MATRIZ**: emenda **F64** em `docs/MATRIZ-REGRAS.md`, com regras a partir de **R-ACC-91**: as 20 com a chave; a
  pendência que reprova; o kit validado no banco; a checagem nova; o rate-limit fechado; e a exceção nominal de leitura.
- **ADR e RUNBOOK**: a emenda F64 no `ADR-003` e o Anexo da F64 no `RUNBOOK-BANCO.md` (o instrumento pela PK do
  catálogo; a ordem entre o apply de uma checagem nova e o merge da linha de base).
- **PLANO**:
  - a nota **F64** no `PLANO-MULTIEMPRESA.md`, com os desvios medidos e as três decisões do Johnny;
  - a ficha da **F65** ganha a troca da PK de `motivos` e da FK de `movimentacoes`, e as PKs naturais do vocabulário
    do import (decisão 2);
  - a ficha da **F67** ganha *"tirar o default das onze e o de `filiais`"*, com o orçamento do fato 8, o *"eventos_admin
    na origem"* e a nota F62 (decisão 1);
  - a ficha da **F68** ganha a nota de que o `error` do rate-limit já não é descartado.
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`, incluindo a reversão da X4 e o fato 25 (a máscara mora em
  `import_prefixos_patrimonio`).

### Frente G: o fechamento, nesta ordem
1. `1.69.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real:
   - o sistema passou a registrar a qual empresa pertence cada tipo de item, motivo, kit, senha de visualização,
     relatório gerado, registro de importação, apelido de filial e cada linha da trilha de auditoria (hoje, todos da
     WAP);
   - um kit não aceita mais um motivo que não existe, e a tela de Integridade ganhou essa conferência;
   - se o contador de tentativas da senha de visualização falhar, a entrada por senha passa a recusar em vez de
     liberar.

   Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F64.md`. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **Apply no ENSAIO**, migration a migration, pelo `apply_migration` do MCP, com o `name` certo. Logo antes, a
   impressão "antes" refeita. Depois, a prova pós-apply do runbook:
   - `notify pgrst` e `get_advisors(security)` (nenhum achado novo esperado; o que aparecer, declarado);
   - o fato 6 nas onze tabelas;
   - `count(*) = count(empresa_id) = count(*) filter (where empresa_id = public.empresa_legada())`;
   - **a impressão "depois", com o `relfilenode` e os dois `md5` iguais aos do "antes"**, porque o ensaio não tem
     tráfego;
   - o `md5` do `prosrc` das 9 escritoras e de `registrar_tentativa_senha` igual, e as 12 peças antigas do núcleo
     iguais;
   - a checagem nova com total 0;
   - as 62 policies byte a byte.

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com o arquivo que falhou retirado da
   branch antes do merge e a correção em migration NOVA.
6. **Apply em PRODUÇÃO**, na mesma ordem, dentro de 24 h do commit das migrations, com as mesmas provas.
   - O **`relfilenode` é igual, sem exceção**. Os dois `md5` são iguais, ou a diferença se explica SÓ pela atividade
     da janela, com a contagem na evidência.
   - Depois, a sonda de paridade ensaio × produção nas 11 classes.
   - Se o `relfilenode` mudou, se o `(pk, xmin)` divergiu além da janela, ou se apareceu advisor não declarado que cita
     objeto da fase: **rollback imediato em produção** antes do diagnóstico, e registro no topo do relatório.
   - Logo depois do apply, e antes do merge, rode `node scripts/smoke/smoke-prod.mjs` a partir da branch, que já
     conhece a chave nova. 0 falha ali é a primeira prova de que nenhuma forma estrita viu a coluna.
   - **Não dispare a Parte B entre o apply e o merge** (fato 14).
7. O conferidor de formas (`scripts/formas/conferir.mts`, conta do smoke, só contagens) contra PRODUÇÃO depois do
   apply, **com 0 recusadas**. Rode-o exatamente como a F63 rodou (§7 do `RELATORIO-F63.md`: a credencial entra por
   `--env-file`, e ninguém abre, filtra nem imprime o arquivo). Se o classificador de segurança barrar esse passo,
   registre, não reformule, e fique com a prova do smoke, declarada como a única no relatório.
8. Ata e `docs/RELATORIO-F64.md` com o que já dá para escrever; o PR sai do rascunho; merge com os dois checks verdes,
   **logo depois das provas**, para encurtar a janela do fato 14. Declare no relatório a janela entre o apply de
   produção e o deploy e o tamanho dela, e diga se alguma Parte B caiu dentro dela.
9. **A conferência pós-deploy, só leitura**:
   - `/api/saude` com `1.69.0` e o commit do merge;
   - `node scripts/smoke/smoke-prod.mjs` com 0 falha;
   - a Parte B do `saude.yml` disparada à mão (`gh workflow run saude.yml -f partes=b`), verde, com a sonda de deriva
     sem pendente e a chave nova conhecida.

   Nenhuma captura de tela de produção.
10. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.69.0` vai no merge
    dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Das decisões do Johnny e da ficha:**
  - tirar o default das onze ou de `filiais` (F67, com os escritores do fato 8);
  - `src/lib/auditoria-registro.ts` e as 8 funções que gravam `eventos_admin` (F67, o *"na origem"*);
  - a PK de `motivos`, a FK `movimentacoes_motivo_fkey` e as PKs naturais de `import_prefixos_patrimonio`,
    `import_termos_categoria` e `import_termos_estado` (F65);
  - todo unique global: `tipos_item.slug`, `kits_modelos_nome_uidx`, `unidades_apelidos_apelido_chave_uidx`, o unique do
    snapshot de `relatorios_gerados` (F65);
  - qualquer leitura da coluna para recortar, e qualquer policy (F66);
  - a porta pública, a rota por empresa, a varredura linear de `entrarComSenha`, as cinco recusas iguais e o teto por
    `(empresa, origem)` (F68);
  - `empresa_id` em `senha_tentativas`, `ambiente`, `_bkp_relatorios_gerados_f6a` e nas outras de `k_infra`;
  - `empresas.patrimonio_prefixo` (fato 25).
- **O que esta ordem acrescenta:**
  - editar migration aplicada;
  - afrouxar a guarda de topo, o classificador ou as travas da F63;
  - subir qualquer número da linha de base (só entra a chave NOVA, com 0);
  - `seed.ts`, `carga.ts`, `reset.ts` e `restaurar.mjs`;
  - `CLAUDE.md` da raiz;
  - `.github/workflows/**` e a proteção da `main`;
  - dependência nova;
  - `.env*` e `scratchpad/`;
  - os PRs do dependabot;
  - o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F64.md` tem os 26 fatos remedidos, o censo dos escritores e leitores, o desenho, as decisões por escrito,
   a ordem das migrations e a ORDEM DE ROLLBACK. Ele é anterior ao primeiro commit que toca `supabase/`, `src/` ou
   `scripts/`.
3. A impressão "antes" das onze, das policies e do advisor existe nos dois bancos, tirada antes de qualquer apply, só
   com contagens e hashes e ordenada pela PK do catálogo, em `docs/f64-evidencias/antes/`.
4. As migrations começam na `0162`, com cabeçalho de classe validado pelo classificador, rollback no rodapé, `db:lock`
   no mesmo commit e entrada em `DA_F38`. Não há `update` de topo, abertura da janela destrutiva, nome-sem-prefixo
   repetido, constraint existente alterada, nem função criada ou recriada além da função de gatilho do kit e de
   `checagens_integridade_nucleo`.
5. As onze tabelas têm `empresa_id uuid not null`, FK validada para `empresas(id)`, default exatamente
   `public.empresa_legada()` e o comentário "até a F67", no CI e nos dois bancos.
6. `count(*) = count(empresa_id) = count(*) filter (where empresa_id = empresa_legada())` nas onze, nos dois bancos. O
   universo zero de `kits_modelos` está declarado, e a prova dela vem do CI.
7. O **`relfilenode` e o `md5` de `(pk, xmin)` são iguais antes × depois nas onze, nos dois bancos**, com
   `atthasmissing = true`. No ensaio os dois `md5` são idênticos; em produção, idênticos ou com a diferença explicada
   só pela atividade da janela.
8. **As 20 tabelas de `k_negocio` têm a coluna.** A trava do lote 2 nasceu vermelha pelos onze nomes e está verde. Ela
   reprova o default literal, o `drop not null`, a FK `not valid` e a tabela sem a coluna. E a antiga pendência agora
   REPROVA.
9. O kit: o gatilho recusa motivo inexistente e motivo de outra empresa, e aceita o kit sem motivo e o com motivo da
   própria empresa. Desativar um kit órfão continua possível. Toda recusa está provada duas vezes. `kits.ts` mostra
   mensagem pt-BR.
10. A checagem nova existe no núcleo com total 0 nos dois bancos, acusa um kit órfão fabricado no CI, e está em
    `CHECAGENS`, na linha de base dos dois alvos (0) e na cobertura. As 12 peças antigas estão byte a byte.
11. `entrarComSenha` recusa quando a RPC do contador devolve `error`, sem conferir senha nem criar cookie, e registra a
    falha sem o IP. O teste de mesa e a trava estática estão verdes e acusam a volta ao `const { data: excedeu }`.
12. A trava "ninguém lê `empresa_id`" cobre o lote 2 e acusa o caso sintético. As duas exceções do kit são nominais,
    com motivo, numa fonte só.
13. **Nenhum escritor mudou**: o `md5` do `prosrc` das 9 funções do fato 8 e de `registrar_tentativa_senha` é igual antes
    × depois nos dois bancos; os pontos de escrita TS do fato 8 estão intocados (`kits.ts` só ganha a tradução da recusa,
    e `senhas.ts` só muda no rate-limit, com o insert da `:161` como está); e nenhum roteiro que insere nas onze
    precisou de `empresa_id` para passar.
14. As 62 policies estão byte a byte (`public` 54 · Storage 8) antes × depois, nos dois bancos.
15. O describe 5 está emendado de forma coerente, os describes 9 e 12 (ou o irmão dele) verdes, `isolamento_tenant.sql`
    verde, e o cabeçalho diz o que a F64 preencheu e o que falta.
16. O `database.ts` tem *hand-fix* declarado e foi conferido contra a geração do MCP depois do apply no ensaio; o
    `db:types:diff` está verde.
17. O smoke logo depois do apply de produção deu 0 falha, e o conferidor de formas contra produção, **0 recusadas**.
18. A decisão sobre o injetor está na ata. Se entrou mutação, ela é detectada, o teto está no número exato com o porquê
    datado e a quarentena abaixo de ⅓.
19. O rollback está escrito na ordem inversa, em `supabase/rollback/F64-desfaz.sql`, e foi **ensaiado no Postgres do
    CI** até a impressão tirada antes da `0162`. `f63_rollback.sql` e `f62_rollback.sql` rodam o da F64 antes e
    continuam verdes.
20. Os advisors nos dois bancos só mudaram no que foi declarado, e a paridade ensaio × produção fecha nas 11 classes.
21. Nenhuma dependência nova; `.github/workflows/**` e o `CLAUDE.md` da raiz intocados; nenhum número da linha de base
    subiu.
22. As emendas estão feitas: MATRIZ (F64, a partir de R-ACC-91), `ADR-003`, `RUNBOOK-BANCO.md` (Anexo F64),
    `PLANO-MULTIEMPRESA.md` (nota F64, fichas F65, F67 e F68), `docs/README.md`, `docs/prompts/README.md` e a ata em
    `docs/DECISOES.md`.
23. `package.json` em `1.69.0`, `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.69.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
24. Os dois PRs estão mergeados com os dois checks verdes, e a conferência pós-deploy foi feita (`/api/saude` com
    `1.69.0`, smoke com 0 falha, Parte B verde, sem pendente e com a chave nova conhecida); se não, o bloqueio está no
    topo do relatório.
25. As sabotagens A a I estão com saída real em `docs/f64-evidencias/`.
26. Nenhum dado real (nome, e-mail, id, código de motivo, rótulo de senha, hash, texto de `detalhe`) em migration,
    teste, roteiro, evidência ou log. Da produção, só contagens e hashes. Ninguém abriu o `.env.local`.
27. `docs/RELATORIO-F64.md` segue o padrão F45→F63, com o roteiro do Johnny no topo.
28. O relatório declara o estado de repouso e a seção "o que este relatório NÃO prova".

# Verificação: rode de verdade
A cada incremento, rode `npm run lint`, `npm run test` e `npm run typecheck`. Rode `npm run build` antes de cada push.
Tudo o que é SQL (roteiros, injetor, `db:types:diff`) passa pelo `banco-sem-docker` do PR. Leia a falha, corrija a
**causa raiz** e repita até passar.

Não faça nada disto para um teste passar:
- alargar exceção para caber um caso que devia reprovar;
- trocar detecção por `skip`;
- afrouxar um catálogo, uma varredura, o classificador ou a guarda de topo;
- subir a linha de base;
- baixar o rigor da convenção de honestidade;
- mudar um teste existente sem conferir que ele prova a mesma coisa.

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**NENHUMA TUPLA DAS ONZE É REESCRITA, E O "ANTES" VEM ANTES DE QUALQUER APPLY.** O `relfilenode` e o `md5` de `(pk,
xmin)` iguais nas onze tabelas, nos dois bancos, são o portão do apply de produção e do merge.

Provas obrigatórias, cada uma com a saída real em `docs/f64-evidencias/`:
- **Sabotagem A, o lote 2.** A trava fica vermelha pelos onze nomes sobre o banco de hoje, e verde depois. Cada um
  destes deixa a trava vermelha, pelo nome da tabela:
  - o default literal `'00000000-…-000000000001'::uuid` no lugar da função (em `motivos`);
  - `drop not null` (em `eventos_admin`);
  - a FK `not valid` (em `senhas_acesso`);
  - uma das onze sem a coluna (`import_termos_estado`).

  Uma tabela de `k_negocio` sem a coluna **reprova** (não é mais aviso).
- **Sabotagem B, o instrumento numa PK natural.** No Postgres do CI, em `motivos` ou numa fixture com PK `text`:
  - um `update` de uma linha num `savepoint` deixa o `relfilenode` igual e faz o `md5` de `(pk, xmin)` MUDAR;
  - um default VOLÁTIL faz o `relfilenode` mudar, e o da fase não;
  - o instrumento lê a PK do catálogo nas quatro tabelas sem `id`.
- **Sabotagem C, o kit.** Com uma empresa B fictícia e um motivo que só existe nela:
  - INSERT de kit com motivo inexistente → recusado;
  - INSERT com o motivo da empresa B num kit da WAP → recusado;
  - kit sem motivo → aceito;
  - kit com motivo da própria empresa → aceito;
  - UPDATE que troca o motivo por um órfão → recusado;
  - um kit órfão fabricado com o gatilho desligado, dentro da transação do roteiro → a checagem nova conta 1, e
    desativá-lo (`ativo = false`) continua possível;
  - toda recusa provada duas vezes.
- **Sabotagem D, o rate-limit.** Na mesa, com a RPC simulada:
  - `error` → recusa, nenhuma conferência de senha, nenhum cookie, `registrarFalha` chamado e sem o IP no contexto;
  - `data: true` → "Muitas tentativas";
  - `data: false` → segue;
  - a trava estática vermelha diante da volta ao `const { data: excedeu } = await chamarRpc(…)`.
- **Sabotagem E, o default.** INSERT sem `empresa_id` nas onze recebe a WAP; empresa inexistente dá `23503`. Os
  roteiros que inserem nelas (fato 8) passam sem nenhuma edição de `empresa_id`.
- **Sabotagem F, ninguém lê.** Cada um destes, sintético, deixa a trava vermelha:
  - um `.eq('empresa_id', …)` sobre `eventos_admin`;
  - um `.select('id, empresa_id')` sobre `senhas_acesso`;
  - uma policy de `tipos_item` citando `empresa_id`;
  - um corpo de função lendo `motivos.empresa_id` que não seja uma das duas exceções nominais.

  As duas exceções do kit passam.
- **Sabotagem G, a checagem e o alarme.** `avaliarIntegridade` com a chave nova em total 0 e a linha de base nova → ok.
  Com a linha de base de hoje (sem a chave) → o achado *"checagem que a política não conhece"*. É a prova de por que a
  ordem da Frente G importa. As 12 peças antigas estão iguais pelo `md5`.
- **Sabotagem H, o rollback.** `F64-desfaz.sql` volta o esquema à impressão de antes da `0162`; `f63_rollback.sql` e
  `f62_rollback.sql` rodam o da F64 antes e continuam verdes.
- **Sabotagem I, nenhum escritor mudou.** O `md5` do `prosrc` das 9 funções do fato 8 e de `registrar_tentativa_senha`
  é igual antes × depois, no CI e nos dois bancos.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI;
  - mutações e teto;
  - `k_negocio`/`k_infra`/`k_sem_select` e o lote 2;
  - tabelas de negócio com `empresa_id` (9 → 20);
  - policies;
  - funções e gatilhos;
  - advisors por nível;
  - as onze contagens, o `relfilenode` e o `md5` de `(pk, xmin)` nos dois bancos;
  - as chaves da integridade (12 → 13);
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco e os bancos de hoje;
2. as três decisões do Johnny abaixo, que mudam a ficha;
3. a ficha da F64 no §7 do plano;
4. este prompt, no que ele detalha (onde ele diverge da ficha, a divergência está declarada aqui e vai para o
   relatório);
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, o código existente, o molde da F63);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**As três decisões do Johnny (23/09/2026), que a ficha não tinha:**
1. o default `public.empresa_legada()` das onze e de `filiais` FICA até a F67. O *"`eventos_admin` na origem"* e o fim
   do default de `filiais` (com a ponte) vão para a ficha da F67, com o orçamento do fato 8. Nenhum escritor muda;
2. a troca da PK de `motivos` e da FK de `movimentacoes`, e as PKs naturais do vocabulário do import, vão para a F65. A
   F64 não toca constraint existente nenhuma;
3. o rate-limit da senha falha FECHADO. Isso reverte a X4, e a reversão vai na ata.

**As onze decisões que esta fase precisa tomar por escrito:**
1. **As migrations**: quantas, quais tabelas em cada uma e em que ordem. A sugestão é agrupar por natureza: o
   vocabulário (`tipos_item`, `motivos`, as três do import, `unidades_apelidos`) e depois os registros (`kits_modelos`,
   `senhas_acesso`, `eventos_admin`, `import_logs`, `relatorios_gerados`). O kit e a checagem ficam por último, numa
   migration própria.
2. **O lock**: a forma da F63 (decisão 2 do `PLAN-F63.md`), o valor e a regra de tentativas. As onze são frias (fato
   3), mas `eventos_admin` e `relatorios_gerados` recebem escrita do app a qualquer hora.
3. **O gatilho do kit**:
   - `security invoker` ou `definer`, com o motivo (quem insere kit é o admin pela sessão, e `motivos` é legível pelo
     piso);
   - `update of` quais colunas (desativar um kit órfão tem de continuar possível);
   - o errcode (`23503` é a semântica de "referência inexistente"; confira se `erros.ts` o traduz sem confundir com FK de
     verdade) e a mensagem;
   - como tratar `payload` sem a chave, com `null` e com string vazia (meça o que o Zod de `kit.ts` grava).
4. **A checagem nova**: o nome da chave (sugestão: `kit_motivo_orfao`), o que vai na `amostra` (sem dado pessoal; o
   `id` do kit), o nome e a descrição curados, e a prova de que as 12 peças antigas ficaram iguais.
5. **O rate-limit**: a mensagem genérica (não pode revelar se a senha existe), o escopo do `registrarFalha`, o que vai e
   o que NÃO vai no contexto (o IP não vai), onde mora o teste de mesa e a forma da trava estática.
6. **A trava do lote 2**: a fonte única das onze, como 15a/15b/15c passam a cobrir as 19 (as oito, as onze), mais
   `filiais`, e a pendência virando reprovação com a lista de infra nomeada.
7. **A trava "ninguém lê"**: o universo do lote 2, as duas exceções nominais do kit, com motivo, e onde a lista delas
   mora.
8. **O injetor**: candidatas são a de uma das onze perder o default da função, a do gatilho do kit sumir e a da
   checagem perder o filtro de empresa. Mutação só onde ela derrubar uma trava desta fase que nenhum teste de mesa já
   derruba. Teto novo exato, ou a ata diz por que não entrou.
9. **O instrumento**: o texto da impressão (idêntico antes e depois), a leitura da PK pelo catálogo, a contagem da
   janela em produção e o critério que separa "atividade normal" de "reescrita".
10. **O describe 5 e o 12**: a nova fronteira para o lote 2.
11. **A ordem do alarme**: como o apply de produção, o smoke e o merge se encadeiam para que nenhuma Parte B leia a
    chave nova antes de a `main` conhecê-la. E o que fazer se a agendada das 06:43 cair na janela.

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **O MCP da Supabase não está conectado, ou recusa o apply.** Na F63, as ferramentas estavam desligadas uma a uma nas
  configurações do conector. Não procure token, não leia o Gerenciador de Credenciais, não abra o `.env.local`. Confira
  de novo algumas vezes ao longo da run. Se não voltar, entregue tudo o que não depende do banco vivo, com o PR ABERTO e
  **SEM merge**. No topo do relatório vai o caminho B: as migrations na ordem, a impressão para rodar antes e depois, e o
  rollback.
- **O `relfilenode` mudou, ou um dos `md5` divergiu sem explicação, no ensaio.** Rollback no ensaio na ordem escrita,
  causa raiz, correção por migration NOVA e o ciclo de novo. **Em produção:** rollback imediato, antes do diagnóstico,
  sem merge, e o bloqueio no topo do relatório.
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO de
  `supabase/rollback/F64-desfaz.sql` que o CI já ensaiou. É a única exceção ao "`execute_sql` só leitura", e vale só
  para esse arquivo. A linha do ledger fica; registre o que a sonda de deriva vai dizer dela. Se o classificador de
  segurança barrar o rollback, não reformule: o comando exato vai no topo do relatório, e o PR fica sem merge.
- **O lock não veio** (o `lock_timeout` disparou): registre e tente de novo, no máximo três tentativas em 30 minutos.
  Não suba o timeout nem mate sessões do app. Depois da terceira, pare o apply daquele banco: PR aberto, sem merge, e o
  comando no topo do relatório.
- **Advisor novo** depois do apply que não esteja declarado: se ele cita objeto desta fase, escalada do runbook e
  rollback antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e siga.
- **O conferidor de formas ou o smoke recusam** depois do apply de produção: a coluna vazou para uma forma estrita.
  Rollback em produção, PR sem merge, e a causa no topo do relatório. Não tente consertar na mesma run.
- **Uma Parte B abriu a issue de alarme pela chave nova** na janela entre o apply e o merge: registre a hora e a run.
  Não suba nem mexa na linha de base para calá-la. Siga para o merge; a Parte B seguinte, com a `main` nova, fecha a
  issue. Confirme isso na conferência pós-deploy.
- **A sonda de deriva abre alarme** porque o apply de produção passou das 24 h: registre; o alarme fecha sozinho na
  Parte B seguinte.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a pendência
  com o que falta. Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, merge, push de tag, disparo de
  workflow): registre, não repita, não reformule, siga no que não depende dela, e ponha o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui
já há dez divergências medidas de saída**, e elas vão no relatório:
- a numeração das migrations (`0162`, não `0148`; fato 1);
- onze tabelas, não doze: faltavam as quatro do import, `filiais`/`operador_filiais` já estavam feitas, e
  `senha_tentativas`/`ambiente` são infra (fato 4);
- quatro tabelas sem `id` (fato 5);
- nenhum gatilho barra o `update` ingênuo aqui (fato 7);
- o default mantido até a F67 (decisão 1, fatos 8 e 9);
- o *"eventos_admin na origem"* e o fim do default de `filiais` adiados para a F67 (decisão 1);
- a PK de `motivos` adiada para a F65 (decisão 2, fato 16);
- o rate-limit revertendo a X4 (decisão 3, fato 11);
- a leitura de `empresa_id` que o kit exige antes da F66 (fato 15);
- a máscara do patrimônio sem coluna nova em `empresas` (fato 25).

Declare também o que este prompt acrescenta à ficha: o gatilho do kit no banco, e não só na action; a ordem entre o
apply da checagem e o merge da linha de base; o instrumento pela PK do catálogo; a trava "ninguém lê" estendida; os
rollbacks encadeados; e o smoke logo depois do apply de produção.

# Git e segurança
- **Branch** `f64-empresa-no-vocabulario`, com commits pequenos e frequentes e mensagens em pt-BR no padrão conventional
  (`docs(f64): …`, `test(f64): …`, `feat(f64): …`, `fix(f64): …`, `refactor(f64): …`, `chore(f64): …`).
- **Documentação primeiro.** Commite também esta ordem
  (`docs/prompts/F64-empresa-no-vocabulario-e-na-infra-ultracode.md`) num commit de documentação. O `PLAN-F64.md` vem
  antes do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os lotes vão em commits separados, nesta ordem:** travas vermelhas; o rate-limit; as colunas; o kit e a checagem;
  os roteiros; os catálogos, a política do alarme e os tipos; o injetor; os documentos; a versão. Cada migration leva
  o `db:lock` no mesmo commit.
- **Pushes agrupados**: cada um custa CI numa cota apertada.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece com
  `verificar` e `banco-sem-docker` verdes **e** o `relfilenode` igual nos dois bancos, com o `(pk, xmin)` igual no
  ensaio e igual ou explicado só pela janela em produção. Depois do merge: a evidência vai por um PR só de
  documentação, e qualquer correção de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `update` de backfill,
  abrir a janela `estoque.dev_destrutivo`, `force row level security`;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; matar sessão do app; imprimir ou gravar id, código,
  rótulo, hash, nome, e-mail ou texto de linha real (nem em log, nem em evidência, nem na resposta);
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de
  10/09); ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha e token;
- **no repositório:** mexer na proteção da `main` ou no workflow, instalar dependência, mexer nos PRs do dependabot,
  subir número da linha de base.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local` e que, de banco, só lê catálogo,
contagens e hashes. As frentes de exploração:
- (a) **os escritores e leitores das onze** no SQL (`corpo-vigente.mjs`), no TS, nos scripts e nos roteiros (fatos 8 a
  10);
- (b) **o kit e a integridade**: o `payload` que o Zod grava, o núcleo e as 12 peças, `CHECAGENS`, a linha de base, a
  cobertura e o avaliador do alarme (fatos 13 a 15);
- (c) **a senha**: `senhas.ts`, `rpc.ts`, `registrarFalha` e a redação por valor, e os testes que já olham a porta
  (fatos 11 e 12);
- (d) **os catálogos, as travas, o injetor, os tipos e os rollbacks**: quem lê `k_lote1`, os describes 5, 9 e 12, o
  teto, o `db:types:diff` e a cadeia `f62`→`f63` (fatos 17 a 22);
- (e) **os bancos, só leitura e só catálogo/contagem/hash**: os fatos 1 a 3 remedidos, e o texto da impressão ensaiado
  no ensaio.

Escreva `docs/PLAN-F64.md` antes de implementar. **A edição é sequencial**: as migrations, os roteiros e os catálogos se
cruzam. Paralelize exploração, medição e revisão, não edição.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**, contra o
`PLAN-F64.md` e os 28 critérios, com estas perguntas:
- Alguma migration reescreve tupla, dispara gatilho de linha ou toma lock por mais do que o `ALTER`?
- O default é a função em todas as onze, e o comentário diz F67?
- Alguma constraint, índice ou PK existente mudou?
- O instrumento ordena pela PK do catálogo nas quatro tabelas sem `id`, ou quebra ali?
- Alguma forma estrita passa a ver a coluna?
- O gatilho do kit deixa passar motivo de outra empresa, trava a desativação de um kit órfão, ou recusa o kit sem
  motivo?
- A checagem nova mudou alguma das 12 peças antigas?
- A chave nova está nos três lugares, e alguma Parte B vai lê-la antes de a `main` conhecê-la?
- O rate-limit ainda deixa passar com `error`, ou vaza o IP no log?
- A mensagem de recusa do rate-limit distingue "senha errada" de "contador fora"? Ela não pode revelar se a senha
  existe.
- A trava do lote 2 é derivada do catálogo, ou é uma lista escrita à mão que esquece uma tabela? E a pendência reprova
  mesmo?
- A trava "ninguém lê" é tautológica (universo vazio)? As exceções nominais são fechadas?
- Os rollbacks da F62 e da F63 ainda rodam depois da F64?
- Alguma sabotagem prova só o caminho feliz?
- Alguma evidência tem dado real?
- Algum arquivo fora do escopo foi tocado?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado,
não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F64.md`, em pt-BR, no padrão dos relatórios F45→F63, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B completo, se o MCP
  faltou);
- depois do deploy, entrar com a própria conta e conferir que tudo está como sempre (Administração: tipos, motivos,
  kits, filiais e apelidos, senhas, auditoria; Relatórios gerados; o import);
- conferir `/api/saude` com `1.69.0` e a Parte B do `saude.yml` verde no dia seguinte, sem issue de alarme aberta;
- o `git diff v1.68.0 v1.69.0 --stat`, com o que deve e o que não deve aparecer;
- a lembrança de que o default cai na F67 e a PK de `motivos` muda na F65.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas dez já conhecidas;
- as três decisões do Johnny e as **onze decisões** da fase;
- o censo dos escritores e leitores (o orçamento da F67);
- **a impressão das onze antes × depois nos dois bancos** (contagens, `relfilenode`, os dois `md5`, a janela);
- as sabotagens com saída real;
- a contagem final;
- os 28 critérios autoverificados;
- o estado de repouso;
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que exista isolamento entre empresas em qualquer das 20 tabelas (não existe até a F66/F72);
  - que uma linha nova de uma segunda empresa receberia a empresa certa (o default é a WAP até a F67);
  - que dois motivos, tipos ou termos de mesmo código em empresas diferentes possam coexistir (as PKs e os uniques
    globais ficam até a F65);
  - que a porta pública esteja por empresa (F68);
  - que a janela de produção tenha ficado sem tráfego.

Pendências e **backlog nomeado**:
- **F65**: a PK de `motivos` e a FK composta de `movimentacoes`; as PKs naturais do import; os uniques por empresa; a
  FK composta, `guarda_empresa()` e os índices liderados por `empresa_id`; o rollback dela rodando antes do da F64;
- **F66**: a leitura da coluna e o recorte nas policies das 20;
- **F67**: tirar o default das oito do acervo, das onze e de `filiais`, com o orçamento dos fatos 8 e 9 e o da F63; o
  *"eventos_admin na origem"*; e a ponte de `papel_atual()`/`EMPRESA_LEGADA_ID`;
- **F68**: a porta pública, a senha por empresa e o teto por `(empresa, origem)`;
- **PATCH** (do backlog da F62): derrubar `profiles.papel`/`ativo` a partir de 13/10/2026;
- **Avulso** (do backlog da F63): `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` rastreados pelo git.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`empresa_legada`, `kit_motivo_orfao`); os nomes que a ficha fixa ficam como estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---
## Como executar

### Pré-voo (uma vez, ~15 minutos)

Esta fase **toca os dois bancos**: aplica migrations no ensaio e em produção pelo MCP da Supabase, antes do merge. A
promessa de que nenhuma linha é reescrita é provada por uma consulta rodada antes e depois nos dois bancos. O item do
pré-voo que mais importa é o MCP. Na F63, ele amanheceu com as ferramentas desligadas uma a uma nas configurações do
conector, e a fase só aplicou depois que você as religou.

Este arquivo já está salvo em `docs/prompts/F64-empresa-no-vocabulario-e-na-infra-ultracode.md`, **sem commit**. O agente
o commita na branch da fase. O prompt cita os 26 fatos do cabeçalho pelo número, então o arquivo precisa estar lá quando
você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.68.0, tag v1.68.0 no merge do PR #74 (86890b7); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short
Test-Path .git\index.lock    # tem de dar False — uma trava órfã derruba o primeiro commit da run
Test-Path docs\prompts\F64-empresa-no-vocabulario-e-na-infra-ultracode.md   # tem de dar True

# 3. Produção com a mesma versão, e a Parte B do saude.yml verde hoje (sem issue de alarme aberta).
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
& "C:\Program Files\GitHub CLI\gh.exe" run list --workflow saude.yml --limit 3
& "C:\Program Files\GitHub CLI\gh.exe" issue list --state open --limit 5

# 4. O smoke de produção passa HOJE — é a conferência pós-deploy da fase.
node scripts/smoke/smoke-prod.mjs

# 5. O MCP da Supabase conectado ao Claude Code, enxergando os dois projetos.
claude mcp list

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O passo 5 é o que mais importa.** Dentro do Claude Code, confira que o MCP lista `pbtjcalbmepmrqzprusb` (produção) e
`sgmvldiizsrjbxzzpmhh` (ensaio), e que **as ferramentas estão ligadas** nas configurações do conector no claude.ai:
`execute_sql`, `apply_migration`, `list_migrations`, `get_advisors` e `generate_typescript_types`. Sem elas, o agente
entrega tudo verde no CI, **deixa o PR aberto, sem merge**, e põe o caminho B no topo do relatório.

**Mais três coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. O `banco-sem-docker` vai rodar algumas vezes, mais o PR de
   documentação e a Parte B disparada à mão.
2. **Dentro do Claude Code:** `/permissions` (nada pode negar `git push`, `gh`, `node`, `npx tsx` nem as ferramentas
   do MCP da Supabase) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).
3. **O horário, por causa do alarme.** Entre o apply em produção e o merge, o banco já devolve a checagem nova do kit, e
   a `main` ainda não a conhece. A Parte B agendada das **06:43** que cair nessa janela abre uma issue de alarme. Ela
   fecha sozinha na Parte B seguinte, mas o jeito limpo é **não rodar a fase de madrugada perto das 06:43**. Qualquer
   horário do dia serve: a janela costuma durar uns 15 minutos (foi assim na F63), e as onze tabelas são frias.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f64
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP, abre e mergeia PRs, publica tag,
dispara workflow e roda o smoke contra produção. Nada disso cabe numa allowlist estreita. `bypassPermissions` numa
máquina com credencial de produção está fora de questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção, no merge na `main`, no push da tag
e no disparo da Parte B. As F53→F63 passaram por ele. Se barrar, o prompt manda não reformular: o agente registra,
segue no resto e põe o comando no topo do relatório.

**`--worktree` NÃO serve.** O smoke e o conferidor da conferência pós-deploy precisam do `.env.local`, que não vai para
a worktree, e o prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** É uma fase média, menor que a F63: onze colunas no molde já provado, um gatilho, uma peça de integridade e
uma correção de TS. O que pesa são os dois bancos, as travas de catálogo e os rollbacks encadeados. Se a cota semanal
estiver apertada, rode `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude` para economizar na exploração. A
revisão adversarial (o gatilho, a checagem e o instrumento na PK natural) é onde o modelo forte rende.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F64.md e docs/f64-evidencias/impressao-vocabulario.sql existem; package.json em 1.69.0; docs/RELATORIO-F64.md existe; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, as migrations 0162+ aplicadas no ensaio e em producao, com docs/f64-evidencias/antes preenchido, o relfilenode das onze tabelas igual antes e depois nos dois bancos, o md5 de (pk, xmin) igual no ensaio e igual ou explicado so pela janela em producao, o smoke apos o apply e o conferidor de formas sem falha, a conferencia pos-deploy e a Parte B passaram sem issue de alarme aberta e a tag v1.69.0 foi publicada; (b) o apply de producao nao aconteceu (classificador barrou ou o lock nao veio em tres tentativas): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F64.md; (c) tudo aplicado e mergeado, mas o push da tag ou a conferencia barrados, com o comando no topo do docs/RELATORIO-F64.md; (d) sem MCP da Supabase: PR aberto sem merge, com o caminho B e a impressao-vocabulario.sql para rodar antes e depois no topo do docs/RELATORIO-F64.md; (e) o relfilenode ou o md5 de (pk, xmin) divergiu, ou o smoke/conferidor recusou: rollback aplicado (ou, se barrado, o comando do rollback no topo), PR sem merge e a causa no topo do docs/RELATORIO-F64.md; ou (f) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F64.md
```

**Headless.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f64.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f64.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f64.json
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

1. **O "antes".** `docs/PLAN-F64.md` e `docs/f64-evidencias/antes/`, com a impressão das onze nos dois bancos, antes de
   qualquer migration aplicada. Só contagens e hashes: se aparecer um código de motivo, um rótulo de senha, um hash ou
   um texto de auditoria ali, interrompa a sessão.
2. **As travas vermelhas.** O lote 2 reprovando pelos onze nomes, o roteiro do kit vermelho e o teste do rate-limit
   vermelho, antes de qualquer correção.
3. **O ensaio.** O `relfilenode` igual nas onze e os dois `md5` idênticos, e a checagem nova com total 0.
4. **A produção.** O mesmo, mais o smoke logo depois do apply e o conferidor com 0 recusadas. Se algum falhar, o prompt
   manda fazer o rollback na hora, e o relatório diz isso no topo.
5. **A conferência.** `/api/saude` em `1.69.0`, o smoke com 0 falha, a Parte B verde e nenhuma issue de alarme aberta.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Entre com a sua conta em produção e abra Administração (tipos, motivos, kits, filiais e apelidos, senhas, auditoria)
   e os relatórios gerados: tudo tem de estar como sempre. Se quiser, tente entrar pela senha de visualização: tem de
   funcionar igual.
3. `git diff v1.68.0 v1.69.0 --stat`. Devem aparecer:
   - `supabase/migrations/0162_*` em diante, `supabase/migrations.lock.json`, `supabase/rollback/F64-*.sql` e
     `supabase/tests/**`;
   - `src/lib/actions/senhas.ts` e `src/lib/actions/kits.ts`;
   - `src/lib/queries/dev.ts` (o `CHECAGENS`), `scripts/smoke/linha-de-base.json` (só a chave nova, com 0) e os testes
     do alarme;
   - os testes de `src/lib/validators/` e `src/lib/itens/`, e talvez `scripts/db/mutacoes.mjs`;
   - `src/lib/types/database.ts`;
   - `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`.

   **Não** devem aparecer:
   - `src/lib/auditoria-registro.ts` e o resto de `src/lib/actions/**`;
   - `src/components/**` e `src/app/**`;
   - `scripts/seed.ts`, `scripts/reset.ts`, `scripts/import/**` e `scripts/db/restaurar.mjs`;
   - migration antiga alterada;
   - número da linha de base que SUBIU;
   - `.github/workflows/**`;
   - mudança de dependência no `package-lock.json`.
4. Abra `docs/f64-evidencias/`: a impressão antes × depois dos dois bancos e a saída das sabotagens.
5. Rode você mesmo `npm run test` uma vez.
6. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A `v1.68.0` está fechada e no ar.** Medido: `main` em `86890b7` com a tag `v1.68.0`, e o ledger dos dois bancos
   terminando na `0161`. O `/api/saude` e o estado do CI não foram consultados daqui; o pré-voo confere.
2. **O agente aplica no ensaio E em produção, antes do merge**, pelo MCP: é o fluxo das F53→F63, não decisão nova sua.
   Sem MCP, é caminho B e PR sem merge.
3. **Uma run, um PR de código e um PR de documentação com a tag**, no molde das F58→F63. Versão `1.69.0` (fase =
   MINOR).
4. **São onze tabelas, não doze.** `senha_tentativas` e `ambiente` continuam infra (a ficha já dizia que `ambiente` fica
   global; `senha_tentativas` é um contador por IP, e o teto por empresa é da F68).
5. **O kit é validado no BANCO, por gatilho**, e não só na action. A ficha diz *"validação no insert/update do kit"*; o
   `CLAUDE.md` diz que regra crítica vive no Postgres e a UI é a segunda linha. A action só traduz a recusa.
6. **A checagem nova entra na linha de base com 0 nos dois alvos.** Isso não é "subir a linha de base", que continua
   proibido ao agente, e fica declarado na ata.
7. **A leitura de `empresa_id` pelo gatilho e pela checagem do kit é permitida antes da F66**, como exceção nominal: é
   integridade, não recorte, e é exatamente o que a ficha pede (*"existe na empresa do kit"*).
8. **A mensagem de recusa do rate-limit é genérica** e não diz que o contador caiu. Distinguir "senha errada" de
   "contador fora" é permitido (nenhum dos dois revela se a senha existe), e o texto exato fica com o agente.
9. **A máscara do patrimônio fica em `import_prefixos_patrimonio`**, agora por empresa. Não nasce
   `empresas.patrimonio_prefixo`, pelo mesmo motivo da decisão 1 da F62.
10. **O rollback num banco vivo roda pelo `execute_sql`**, com o conteúdo exato de `supabase/rollback/F64-desfaz.sql` que
    o CI ensaiou. É a única escrita fora do `apply_migration`, e só num desfecho ruim.

# F66B — O comprimento vira regra do banco

Ordem de serviço da fase **F66B** do `PLANO-MULTIEMPRESA.md` (§7). A ficha foi escrita pela F66 em 24/09/2026, com o
censo medido nos dois bancos. A fase fica entre a F66 (as policies recortam) e a F67 (escrita, definer, Storage e
Realtime por tenant). Ela faz o banco recusar texto maior que o teto de cada coluna de texto livre das 20 tabelas de
negócio. Hoje quem limita é o Zod, e o Zod só guarda quem passa pela Server Action. Num banco compartilhado, quem grava
500 MB de observação derruba todo mundo.

Ela entrega quatro coisas:
- **toda coluna de texto das 20 tabelas de `k_negocio` com teto no banco**: `CHECK (char_length(<col>) <= <N>)`, com o
  teto DERIVADO do maior `.max()` que escreve nela, ou da medição com folga escrita onde não há Zod. Ou então ela fica
  numa lista nominal de exceções, com motivo;
- **uma coluna, um teto**: a tabela-verdade coluna × caminho de escrita (tela, import, RPC, service role, script), e uma
  trava de mesa que reprova qualquer caminho com Zod que aceite mais do que o banco aceita;
- **o import continua recusando na conferência, nunca na RPC**: a validação por linha já existe desde a F56 (fato 9). A
  fase prova a cobertura coluna a coluna e prova que a RPC chamada por fora leva `23514`;
- **a frase pt-BR do `23514`** para cada constraint nova, com o campo e o teto.

Duas condições não se negociam:
- **Nada muda para a WAP.** Nenhum teto fica abaixo do que uma tela aceita hoje. Nenhum teto fica abaixo do maior valor
  vivo da coluna nos dois bancos. A contagem de violação por coluna, medida imediatamente antes de cada lote, nos dois
  bancos, é o portão do apply, e tem de dar 0.
- **Nenhuma linha é alterada, nenhuma tupla é reescrita.** `add constraint … check` lê a tabela, não a reescreve. Se uma
  coluna tiver valor acima do teto proposto, **o teto sobe; o dado nunca é cortado.** A prova é o `relfilenode` das 20
  tabelas, igual antes e depois, nos dois bancos.

**As três decisões do Johnny (12/11/2026), na conversa que gerou esta ordem:**
1. **A F66B roda agora, antes da F67**, como o plano manda. (A pergunta foi feita porque o pedido era "o prompt da F67".)
2. **A F67 vai ser dividida em três fases**: a F67 (cargo por empresa, `security definer`, RPCs destrutivas, mesa de
   conflitos e trava do termo), a F67B (Storage e Realtime) e a F67C (o fim do default `empresa_legada()`: a escrita
   passa a informar a empresa). Esta fase **só registra a decisão** numa nota da ficha F67. Quem escreve as fichas novas
   é a própria F67.
3. **As duas contas dev continuam em `membros` por ora.** Na F67, `e_dev()` passa a ser "dev da empresa OU
   `e_plataforma()`". A saída de `membros` vai para a F69, junto com a decisão de quanto a plataforma enxerga. Esta fase
   **só registra** isso na nota da ficha F67 e na F69.

---

## Estado de partida: os 24 fatos medidos (12/11/2026)

> O prompt cita estes fatos **pelo número**. Os fatos 1 a 3 e 7 a 14 foram medidos hoje no disco e no git. **Os dos
> bancos (4, 5, 6 e 15) NÃO foram remedidos nesta conversa**, porque o conector da Supabase daqui só enxerga outro
> projeto. Eles vêm da ficha (24/09) e do `RELATORIO-v1.71.1-v1.71.2.md`. Divergência da ficha está marcada com ⚠.
> **Remeça tudo antes de aceitar.**

**Onde o projeto parou**

1. `origin/main` em **`0a3a586`** (merge do PR #90, o pós-deploy da v1.71.2). A tag anotada **`v1.71.2`** está em
   `8f4d2ce` (merge do PR #88). `package.json` em `1.71.2`, árvore limpa, cópia na `main`.
   - Última migration: **`0180_colaboradores_uso_efetivo.sql`**, aplicada no ensaio e em produção (relatório da
     v1.71.2). **A primeira desta fase é a `0181`.**
   - Versão da fase: **`1.72.0`** (fase = MINOR, regra 8).
   - Checks obrigatórios da `main`: **`verificar`** e **`banco-sem-docker`**.
   - Produção `pbtjcalbmepmrqzprusb`, ensaio `sgmvldiizsrjbxzzpmhh`, Postgres 17.6 (medido na F66).
2. **A rede de hoje**, do CI do PR #88 (head `b724f53`):
   - 264 arquivos de teste com 8.103 testes;
   - 54 roteiros SQL com 1.153 asserções, 0 ✗;
   - injetor em **156/156**;
   - smoke de produção *"109 OK · 1 aviso (kits_modelos) · 0 falha"*.
3. **O mapa do `CLAUDE.md` bate.** Os diretórios de topo de `src/lib` e de `src/components` e os 14 `CLAUDE.md`
   aninhados são os que o mapa lista. Remeça no começo da run (é a regra do `CLAUDE.md`).

**O censo da ficha (24/09/2026)**

4. **CHECK em `public`: 36**, a mesma lista nos dois bancos.
   - **Sete** citam comprimento: `anotacao_texto_len` (≤ 2.000), `unidades_apelidos_apelido_tamanho` (2..80), as três de
     `empresas` (fora das 20) e duas que só exigem "não vazio" (`lanc_item_ajuste_obs`, `lanc_item_chamado`).
   - **Nas 20 tabelas de negócio, só duas têm máximo de verdade.**
   - As duas existentes usam `char_length(btrim(x)) between …` (`0017:12`, `0139:199`). O nome `<tabela>_<coluna>_tamanho`
     já existe (`unidades_apelidos_apelido_tamanho`, `empresas_nome_tamanho`).
5. **65 colunas de texto** nas 20 tabelas (e 7 `jsonb` à parte). As 20 são a lista `k_negocio` de
   `supabase/tests/catalogo_policies.sql:88-94`.
   - O maior valor medido em produção fica abaixo de 200 caracteres em 64 colunas. A exceção é
     `relatorios_gerados.observacao` (505).
   - Os maiores depois dela: `lancamentos_item.observacao` 184, `senhas_acesso.hash` 168, `movimentacoes.observacao` 162.
   - **Sete semanas de operação se passaram desde essa medição.** O máximo vivo é remedido, coluna a coluna, nos dois
     bancos (só contagens e comprimentos, nunca o valor).
6. **As colunas SEM teto Zod**, com o máximo medido em 24/09:
   - `ativos`: `marca` 8, `modelo` 18, `service_tag` 24 (na compra), `hostname` 14, `memoria` 25, `armazenamento` 21,
     `processador` 28, `fornecedor` 10, `colaborador_atual` 64, `setor_atual` 45, `pendencia` 38, `origem` 10,
     `patrimonio`/`patrimonio_original` 11;
   - `movimentacoes`: `motivo` 24, `colaborador` 64, `setor` 45, `chamado` 28;
   - `eventos_admin`: `acao` 26, `alvo` 36;
   - `filiais.slug` 14, `tipos_item.slug` 15, `motivos.codigo` 24;
   - mais os derivados por gatilho (`*_chave`), o vocabulário do import e os caminhos gerados no servidor
     (`arquivo_path`, `backup_path`, `arquivo_hash`).

   ⚠ "Sem teto Zod" na ficha quer dizer "sem `.max()` no validator da tela que é dona da coluna". Várias delas TÊM teto
   em OUTRO caminho (o import, fato 8).

**Os tetos que já existem (medidos hoje)**

7. **`.max(` em `src/lib/validators`: 79, em 16 arquivos** (o mesmo número da ficha).
   - Fora da pasta, há dois: `actions/relatorios.ts:35` (observação da semana ≤ 2.000) e **`LIMITES_CAMPO_PLANO`**
     (`src/lib/import/limites.ts:121`, 18 campos).
   - `LIMITES_CAMPO_PLANO` alimenta o Zod do `aplicarImport` (`actions/importar.ts:159-179`) e o motor
     (`import/plano.ts:340`).
8. **⚠ Uma coluna, vários tetos.** A ficha só nomeia `ativos.observacoes`. A amostra medida hoje mostra que o caso é
   geral:
   - `ativos.service_tag`: 100 em `definirServiceTag` (`validators/ativo.ts:106`), 60 na compra
     (`validators/compra.ts:17`) e 60 no import;
   - `ativos.observacoes`: 2.000 na ficha (`ativo.ts:36`), 500 na devolução ao fornecedor
     (`devolucao-fornecedor.ts:22`) e 500 no import;
   - o nome do colaborador: 80 no cadastro (`colaborador.ts:12`) e **120 no import** (`LIMITES_CAMPO_PLANO.colaborador`).
     Ele vai para `ativos.colaborador_atual` e `movimentacoes.colaborador`, e talvez para `colaboradores.nome`, se o
     import cria o colaborador. Meça;
   - `modelo`: 120 no import, 60 na compra (o helper opcional de `compra.ts:17`; confira que é ele que se aplica).

   **A regra que decorre disso:** o teto do banco de uma coluna é ≥ o teto de TODO caminho que escreve nela. Senão, uma
   escrita que a tela aceita hoje leva `23514` amanhã.
9. **⚠ A validação por LINHA do import JÁ EXISTE (F56).** O motor recusa a célula com `valor_longo_demais`
   (`plano.ts:336-350`) ANTES de o plano existir, com a mesma `LIMITES_CAMPO_PLANO` do Zod do `aplicarImport`. Ele nunca
   trunca. A ficha pede "a validação do import por linha antes da RPC". O que falta de verdade é outra coisa:
   - **a cobertura**: toda coluna que a RPC grava a partir do plano tem um campo em `LIMITES_CAMPO_PLANO` com teto ≤ o do
     banco, e nenhuma transformação da RPC alonga o valor (patrimônio canônico, prefixo, `upper`, a chave);
   - **o desvio**: a RPC chamada direto pelo PostgREST, com JWT de admin e `jsonb` cru, sem Server Action. Hoje nada
     recusa o comprimento ali.
10. **O import aborta INTEIRO** quando um CHECK dispara: `import_criar_ativos` (`0131:358-404`) insere sem `savepoint` por
    linha, dentro de `importar_ativos_substituir` (`0140:553-560`).
    - A action já trata `23514` como recusa (transação abortada, o backup fica): `RECUSAS_DA_RPC`,
      `actions/importar.ts:122-133`.
    - Por isso a recusa tem de acontecer na conferência. O `23514` da RPC é a rede, não o caminho.
11. **Os caminhos sem Zod, remedidos hoje:**
    - `src/lib/auditoria-registro.ts` é o único escritor TS de `eventos_admin`, com **16** chamadas de
      `registrarEventoAdmin(` (a ficha dizia 15);
    - mais as **8** funções SQL que gravam na trilha;
    - `createAdminClient` aparece **66 vezes em 18 arquivos** de `src` e `scripts`, fora testes. ⚠ A ficha dizia 83/20:
      a base de contagem é outra, então remeça e declare a sua;
    - `scripts/**` roda fora do app. `scripts/seed.ts` usa `@faker-js/faker` e não roda no CI.
12. **A tradução de erro.** `CONSTRAINTS_TRADUZIDAS` (`src/lib/supabase/erros-do-banco.ts:55`) tem 19 entradas, 6 de
    tipo `check`. `erros-do-banco-sql.test.ts` confere que cada nome existe no esquema vivo, lido das migrations, e
    reprova tradução morta. Hoje um `23514` de comprimento cairia na mensagem genérica.
13. **Os dois ajustes que a ficha pede**, conferidos hoje:
    - a edição de `motivos.codigo` não tem `.max()` (`validators/admin.ts:347`: `z.string().trim().min(1)`), e a criação
      tem 40 (`admin.ts:336-341`);
    - `ativos.observacoes` tem dois tetos Zod (fato 8).
14. **Contagem de caracteres.** O `.max(N)` do Zod conta unidades de código UTF-16 (o `length` do JS). O `char_length` do
    Postgres conta caracteres. Para qualquer texto, `char_length ≤ length`, então um `CHECK (char_length(col) <= N)` nunca
    recusa o que um `.max(N)` aceitou.
    - Confirme na documentação (regra 6): a do Zod pelo Context7; a do PG 17 em `postgresql.org/docs/17`, porque o
      Context7 não indexa o 17.
    - O Zod faz `.trim()` antes de medir, e o valor gravado é o aparado.

**O banco e o método**

15. **Os tamanhos das tabelas** (F66): `movimentacoes` 3.631 linhas (4,9 MB), `ativos` 1.649 (2,2 MB), o resto abaixo de
    0,4 MB.
    - `alter table … add constraint … check` toma `ACCESS EXCLUSIVE` e varre a tabela para validar, sem reescrever.
    - Confira na documentação do PG 17 se várias `add constraint` no MESMO `alter table` validam numa passada só.
    - `not valid` + `validate` não encurta o lock dentro do `apply_migration`, que é UMA transação (é o que a ficha diz).
    - Remeça os tamanhos.
16. **O `apply_migration` do MCP é atômico, e o CI (`psql -f` sem `-1`) não é.**
    - ADR-003 e `RUNBOOK-BANCO.md`: ensaio primeiro; `name` = nome do arquivo sem `NNNN_`; nenhuma migration toca banco
      real antes de o CI tê-la rodado.
    - Cabeçalho `-- classe:` obrigatório (`scripts/db/classificar-migration.mjs`); entrada em `DA_F38` e em
      `migrations.lock.json`; `db:lock` no mesmo commit; nome-sem-prefixo que não repete.
    - `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit` (o molde F63–F66).
    - **Proibidos:** `supabase db push`, `migration repair`, `db reset --linked`, reescrever `schema_migrations`.
    - Prova pós-apply: `notify pgrst, 'reload schema'`; `get_advisors` de segurança E de performance; paridade das 11
      classes; sonda de exatidão; smoke. A sonda de deriva cobra em até 24 h.
17. **O instrumento "antes/depois" da F66 existe** (`docs/f66-evidencias/`: impressão de policies, `relfilenode` das 20,
    md5 de `prosrc`). O "depois" desta fase acrescenta a lista de constraints `contype = 'c'` de `public`, com nome e o
    md5 de `pg_get_constraintdef`.
18. **Os rollbacks encadeados** (R-ACC-90): `supabase/rollback/F62-1-*`, `F62-2-*` e `F63-desfaz.sql` a `F66-desfaz.sql`,
    ensaiados por `f62_rollback.sql` a `f66_rollback.sql`.
    - Um CHECK de comprimento não depende de `empresa_id` nem de policy. **A expectativa é que nenhum rollback anterior
      precise rodar o da F66B antes.**
    - Mas a F65 recriou PKs e uniques do vocabulário. **Meça no CI**: se algum rollback anterior falhar com os CHECK no
      lugar, ele passa a rodar o da F66B antes, como a F66 fez com a F63.
19. **O conferidor de formas** (`scripts/formas/conferir.mts`) lê as linhas de produção contra os schemas de leitura. Na
    F66 deu 271 pontos, 100.549 linhas e 0 recusadas. Ele é a segunda testemunha do "nada mudou".
20. **A restauração.**
    - `scripts/db/restaurar.mjs` e os backups do import (`backups-import`) guardam linhas de outras épocas.
    - Os imports anteriores à F56 não tinham teto por campo. Um backup antigo pode ter valor acima do teto, e restaurá-lo
      passaria a dar `23514`.
    - O conteúdo dos objetos do bucket não é lido por SQL, e esta fase não abre backup para medir.
    - Isso vai para o RUNBOOK e para "o que este relatório NÃO prova".
21. **Os derivados por gatilho (`*_chave`)** normalizam o texto de origem (`lower`, `unaccent`, espaços). O `unaccent`
    pode ALONGAR: `æ` → `ae`, `ß` → `ss`, `œ` → `oe`. Uma chave pode ser mais longa que a coluna de origem. Teto igual ao
    da origem é bug latente.
22. **Os gerados no servidor** (`termos_gerados.arquivo_path` = `<uuid>.docx`, `import_logs.backup_path`,
    `arquivo_hash`, `senhas_acesso.hash`, a saída do scrypt) têm formato conhecido. O teto deles sai do formato, não da
    medição.
23. **Os bloqueios das fases recentes:**
    - nas F60, F63 e F64, as ferramentas do MCP amanheceram desligadas uma a uma no conector;
    - na F65, o classificador de segurança barrou o apply do ensaio uma vez.
24. **As regras do `CLAUDE.md` que pesam aqui:** 1, 2, 3, 5, 6, 7 e 8. A 6 pede a documentação oficial: no PG 17,
    `ALTER TABLE … ADD CONSTRAINT` (o lock e a validação), `char_length` e o CHECK com NULL; no Zod, a semântica de
    `.max()` para string.

---

## As frentes, e por que nesta ordem

- **A, o censo e o "antes".** Os 24 fatos remedidos; o `PLAN-F66B.md`; a tabela-verdade das 65 colunas × caminhos;
  o máximo vivo e a contagem de violação nos dois bancos; e a impressão "antes".
- **B, as travas, vermelhas.** O catálogo `comprimento_por_coluna.sql`, a trava de mesa Zod × banco e os cenários de
  comportamento (regra 4 da §4: trava antes da correção).
- **C, o banco.** Quatro lotes por família, na ordem de lock das `0175`–`0178`.
- **D, o TS.** A fonte única dos tetos, os Zod unificados, o `.max()` que falta, a tradução do `23514` e a cobertura do
  import.
- **E, os roteiros, o injetor e o rollback.**
- **F, os documentos**, inclusive a nota da F67 com as decisões 2 e 3 do Johnny.
- **G, o fechamento, com ordem rígida.** Versão → revisão adversarial → SHA congelado → CI verde → no ensaio: o "antes"
  refeito e a contagem 0, apply lote a lote com a contagem e o `relfilenode` entre eles, o conferidor → em produção: o
  mesmo, mais o smoke → merge → deploy → conferência → relatório → PR de documentação → tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F66B do `docs/PLANO-MULTIEMPRESA.md` (§7): o comprimento vira regra do banco. Ao terminar:
- toda coluna `text`/`varchar` das 20 tabelas de `k_negocio` tem um CHECK de comprimento
  `<tabela>_<coluna>_tamanho` na forma `char_length(<col>) <= <N>`, validado; ou está numa lista NOMINAL de exceções,
  com motivo, numa fonte só, conferida nos dois sentidos;
- o teto de cada coluna é ≥ o teto de TODO caminho que escreve nela, e ≥ o maior valor vivo nos dois bancos. Ele vem
  do maior `.max()` (ou do `LIMITES_CAMPO_PLANO`) que escreve na coluna, ou, onde não há Zod, da medição com a folga
  escrita (decisão 2);
- uma trava de mesa reprova qualquer caminho com Zod que aceite mais do que o banco aceita, e qualquer CHECK de
  migration que diverja da fonte única dos tetos;
- `comprimento_por_coluna.sql`, derivado do catálogo, reprova coluna de texto das 20 sem CHECK e fora da exceção;
- o import recusa a linha longa na CONFERÊNCIA (o `valor_longo_demais` que a F56 criou), com a cobertura provada
  coluna a coluna; e a RPC do import chamada por fora, com valor acima do teto, leva `23514` sem gravar nada;
- todo `23514` de comprimento chega ao operador como frase pt-BR com o campo e o teto;
- `ativos.observacoes` tem um teto só nas telas, e a edição de `motivos.codigo` tem `.max()`;
- **nada mudou para a WAP**: a contagem de violação deu 0 em toda coluna, nos dois bancos, antes de cada lote; o smoke
  e o conferidor passaram;
- **nenhuma linha foi alterada e nenhuma tupla reescrita**: nenhum `update`, e o `relfilenode` das 20 é igual antes e
  depois;
- a ficha da F67 tem a nota com as decisões 2 e 3 do Johnny (12/11/2026).

Uma run, um PR de código e um PR de documentação com a tag. Versão `1.72.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1, §3 e §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 8, migration
    nunca se edita; a 10, a ORDEM de rollback);
  - a ficha **F66B** no §7, com o censo. Ela é a FONTE DA VERDADE do escopo: onde esta ordem e ela divergirem sem
    declaração, vale a ficha;
  - as fichas **F67** e **F69**, para saber o que NÃO antecipar.
- `docs/prompts/F66B-comprimento-vira-regra-do-banco-ultracode.md`: o cabeçalho com os **24 fatos medidos** e as três
  decisões do Johnny. Este prompt os cita pelo número.
- `CLAUDE.md`, `AGENTS.md`, `supabase/CLAUDE.md`, `scripts/db/CLAUDE.md` e `scripts/import/CLAUDE.md`. As regras
  permanentes 1, 2, 3, 5, 6, 7 e 8.
- **O molde imediato é a F66.** Leia `docs/RELATORIO-F66.md`, `docs/PLAN-F66.md`, a ata de 2026-09-24 · F66 em
  `docs/DECISOES.md`, `docs/f66-evidencias/`, e o `RUNBOOK-BANCO.md` inteiro (Anexos F65 e F66, e a ordem de rollback).
  Depois a v1.71.2 (`docs/RELATORIO-v1.71.1-v1.71.2.md`), o último apply.
- `docs/ADR-003-metodo-de-migration.md`, `docs/MATRIZ-REGRAS.md` (a numeração R-ACC vigente) e
  `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e destinos, **nunca o `.env.local`**).
- O código, nesta ordem:
  - as migrations `0017` (a `anotacao_texto_len`), `0131`, `0139`, `0140`, `0152` e `0175`–`0178` (a ordem de lock por
    família);
  - `src/lib/validators/*.ts` (os 79 `.max(`), `src/lib/import/limites.ts`, `src/lib/import/plano.ts` (`:330-360`),
    `src/lib/actions/importar.ts` (`:95-180` e o caminho até a RPC), `src/lib/actions/relatorios.ts`,
    `src/lib/auditoria-registro.ts`;
  - `src/lib/supabase/erros-do-banco.ts`, `erros-do-banco-sql.test.ts`, `src/lib/actions/erros.ts` e o teste dele;
  - `supabase/tests/catalogo_policies.sql` (o `k_negocio` e a forma dos blocos derivados do catálogo),
    `import_substituir.sql`, `vocabulario_import.sql`, `restauracao.sql`, `f66_rollback.sql` e `_asserts.sql`;
  - `scripts/db/classificar-migration.mjs`, `mutacoes.mjs`, `mutacoes.test.mts`, `run-mutation-tests.mjs` e
    `corpo-vigente.mjs`;
  - `scripts/formas/conferir.mts`, `scripts/smoke/smoke-prod.mjs`, `scripts/perf/conta-a-conta.mjs` (o invólucro do canal
    MCP e a falha fechada, para reusar no bloco de contagem), `supabase/ci/impressao-schema.sql` e
    `.github/workflows/ci.yml` (só leitura).

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 24 fatos, no cabeçalho desta ordem. Os de banco (4, 5, 6 e 15) NÃO foram remedidos na geração: vêm da ficha
(24/09). Remeça cada um contra o disco e os dois bancos de hoje antes de agir. Onde a sua medição contrariar o número
escrito, **a sua medição ganha**, desde que vá para o relatório. Os que mais importam:
- **fato 1**: a primeira migration é a `0181`; a versão é `1.72.0`;
- **fatos 5 e 6**: o máximo vivo de cada coluna, nos dois bancos, hoje (sete semanas depois do censo);
- **fato 8**: uma coluna, vários tetos. O teto do banco é o maior dos caminhos;
- **fato 9**: a validação por linha do import já existe. O trabalho é a cobertura e o desvio;
- **fato 14**: `char_length ≤ length`, confirmado na documentação;
- **fato 18**: os rollbacks anteriores, medidos no CI com os CHECK no lugar;
- **fato 21**: o `unaccent` alonga, e a chave não herda o teto da origem sem prova.

## Comandos que já existem: use, não reinvente
- `npm run lint` · `npm run test` · `npm run typecheck` (= `npx tsc --noEmit`) · `npm run build` · `npm run contraste` ·
  `npm run verificar:actions`.
- `npm run db:lock`, obrigatório no commit de cada migration. `node scripts/db/classificar-migration.mjs` (e `--censo`).
- `npm run db:test`, `npm run db:test:mutations` e `npm run db:types:diff` precisam de Postgres e rodam no job
  `banco-sem-docker`. Na mesa, só se houver um Postgres 17 descartável que não seja nenhum dos dois bancos vivos (a
  F65 e a F66 usaram PGlite fora do projeto). O CI é a autoridade.
- Na Frente G: `node scripts/smoke/smoke-prod.mjs` e `NODE_OPTIONS=--conditions=react-server npx tsx
  --env-file=.env.local scripts/formas/conferir.mts --alvo=ensaio|producao --saida=docs/f66b-evidencias/…`.
- O MCP da Supabase: `list_projects`, `execute_sql` (só leitura), `apply_migration`, `list_migrations`, `get_advisors`
  (segurança E performance) e `generate_typescript_types`.

**Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`. **Não rode** `supabase db push`, `migration
repair` nem `db reset --linked`. **Não suba** `next dev`/`next start` contra o ensaio.

# Escopo

## Dentro: sete frentes, nesta ordem

### Frente A: o censo e o "antes"
O primeiro entregável é `docs/PLAN-F66B.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`. Ele
contém:
- **Os 24 fatos remedidos**, com cada divergência contra a ficha anotada.
- **A tabela-verdade das colunas** (decisões 1 e 2). Para cada coluna `text`/`varchar` das 20, lida do catálogo:
  - a classe: texto livre com Zod, texto livre sem Zod, derivado por gatilho, gerado no servidor, código/vocabulário com
    formato;
  - TODOS os caminhos que escrevem nela, cada um com o teto (arquivo:linha do `.max()` ou do `LIMITES_CAMPO_PLANO`, a
    função SQL, o service role, o script);
  - o máximo vivo nos dois bancos;
  - o teto escolhido, com a regra que o produziu; ou a exceção nominal, com motivo.
- **O mapa do import** (decisão 9): para cada coluna que a RPC grava a partir do plano, o campo de `AtivoPlano` de onde
  ela vem, o teto do campo, as transformações da RPC no caminho e a prova de que nenhuma alonga além do teto do banco.
- **O desenho**, com as decisões 1 a 14 de "Autonomia" tomadas por escrito.
- **A ordem das migrations e a ORDEM DE ROLLBACK** (o inverso do apply), escrita também no rodapé de cada migration.
- **A contagem de violação e o máximo vivo, nos dois bancos, antes de qualquer apply.** Um bloco só leitura,
  `transaction_read_only = on`, com o alvo confirmado pelo `rotulo_de_ambiente()`, no molde de falha fechada do
  `conta-a-conta.mjs`. Para cada coluna, ele devolve `max(char_length)` e o número de linhas acima do teto proposto. Sai
  **só número**: nenhum valor, id, nome ou texto de linha. O texto do bloco vai para `docs/f66b-evidencias/` e é o MESMO
  nos dois bancos.
- **A impressão "antes"**, nos dois bancos, pelo MCP, só leitura, em `docs/f66b-evidencias/antes/`:
  - as constraints `contype = 'c'` de `public` (nome, tabela, md5 de `pg_get_constraintdef`);
  - o `relfilenode` das 20 tabelas de `k_negocio`;
  - o md5 do `prosrc` de todas as funções (esta fase não recria nenhuma; decisão 12);
  - o md5 de `qual`/`with_check` das 62 policies;
  - os advisors de segurança e de performance, contados por nível e nome.

  Só contagem, nome de objeto de esquema, texto de constraint e hash.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f66b-evidencias/`. Fica vermelha no PR em
rascunho e verde no commit seguinte (o molde da F64 a F66).
- **`supabase/tests/comprimento_por_coluna.sql`** (decisão 8), DERIVADO DO CATÁLOGO:
  - o universo é toda coluna `text`/`varchar` (`pg_attribute`, `attisdropped = false`) das tabelas de `k_negocio`. A
    lista das 20 sai do MESMO lugar que `catalogo_policies.sql` usa, ou de uma fonte que o teste de mesa amarra a ela.
    Nada de terceira cópia;
  - cada coluna do universo tem exatamente UM CHECK cuja árvore (`pg_constraint.conbin`, lida pela forma, não pelo texto)
    é `char_length(<a coluna>) <= <inteiro>`, com `convalidated = true` e o nome `<tabela>_<coluna>_tamanho`; ou está
    na lista nominal de exceções, com motivo;
  - a lista de exceções é conferida nos dois sentidos: exceção sem coluna viva, ou exceção que TEM o CHECK, reprova;
  - nenhum CHECK de comprimento das 20 fica `not valid`.

  Hoje ele reprova pelas ~63 colunas sem o CHECK.
- **A trava de mesa, Zod × banco** (decisão 7), em `src/lib/validators/`:
  - a fonte única dos tetos tem uma entrada por coluna das 20, com o teto e o rótulo de operador;
  - todo CHECK `_tamanho` das migrations (lido do SQL, como as outras travas de mesa leem) bate com a fonte, coluna a
    coluna, nos dois sentidos;
  - todo caminho declarado na tabela-verdade tem teto ≤ o da fonte.

  Ela tem de saber ficar vermelha: sabotagens A e B.
- **Os cenários de comportamento**, num roteiro novo ou numa seção de um existente (decisão 10), com o universo contado
  e toda recusa provada duas vezes (a convenção de honestidade):
  - um INSERT e um UPDATE com o valor exatamente no teto passam; com teto + 1, levam `23514` com o nome
    `<tabela>_<coluna>_tamanho`. Uma coluna por lote, no mínimo; o laço sobre o catálogo é melhor;
  - NULL passa (o CHECK com NULL é satisfeito: confirme na documentação);
  - a RPC do import chamada por fora com um campo do `jsonb` acima do teto leva `23514`. Como `postgres`, nada foi
    gravado: a filial ficou como antes, inclusive a limpeza que veio antes (fato 10);
  - o service role (o papel `postgres` no roteiro) também é recusado. É a prova de que a trava mora no banco.

  Hoje esses cenários reprovam: o teto + 1 passa.

### Frente C: o banco (migrations `0181`+)
Migrations pequenas, por lote, na ordem de lock que as `0175`–`0178` usaram. Cada uma leva:
- o cabeçalho de classe, validado pelo classificador (a expectativa é ADITIVA; confira);
- o rollback no rodapé;
- `db:lock` no mesmo commit e entrada em `DA_F38`;
- um nome-sem-prefixo que não repita nenhum arquivo do repositório;
- `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit`.

**Sem `update`, sem `cascade`, sem `not valid` sem `validate` na mesma migration, sem abrir a janela destrutiva, sem
DDL dinâmica** (`execute format(…)`): um `alter table … add constraint` LITERAL por tabela, com todas as colunas dela.

Os quatro lotes (decisão 11):
1. os **cadastros do acervo**: `colaboradores`, `itens`, `termos_gerados`, `anotacoes`;
2. o **movimento do acervo**: `ativos`, `movimentacoes`, `pendencias_item`, `lancamentos_item`;
3. o **vocabulário**: `filiais`, `tipos_item`, `motivos`, `kits_modelos`, `unidades_apelidos`,
   `import_prefixos_patrimonio`, `import_termos_categoria`, `import_termos_estado`;
4. os **registros**: `eventos_admin`, `import_logs`, `relatorios_gerados`, `senhas_acesso`.

Os dois CHECK de comprimento que já existem nas 20 (`anotacao_texto_len`, `unidades_apelidos_apelido_tamanho`) ficam
como estão (decisão 3). **Nenhuma função criada ou recriada, nenhuma coluna, nenhuma policy.**

### Frente D: o TS
- **A fonte única dos tetos** (decisão 7). Um módulo folha em `src/lib/validators/` (sem `'use client'`, sem import de
  `queries/`), com coluna → teto e rótulo de operador. Os Zod que são DONOS de uma coluna passam a usar a constante
  dela onde isso não muda o número.
- **Os dois ajustes da ficha** (decisão 6):
  - `ativos.observacoes` com um teto só nas telas (ficha e devolução ao fornecedor), pela constante. O
    `LIMITES_CAMPO_PLANO.observacoes` pode continuar menor, declarado;
  - a edição de `motivos.codigo` ganha `.max(40)`, o mesmo da criação.

  Nenhum outro teto de tela muda.
- **A tradução do `23514`** (decisão 10): todo CHECK `_tamanho` chega como *"O campo <rótulo> aceita no máximo <N>
  caracteres."* (ou a frase que a decisão fixar), pelo caminho que `erros.ts`/`erros-do-banco.ts` já usam. O teste
  confere que nenhum `_tamanho` fica sem frase e que nenhuma frase cita constraint morta.
- **A cobertura do import** (decisão 9): só onde o mapa da Frente A achar um buraco (coluna gravada pela RPC sem campo em
  `LIMITES_CAMPO_PLANO`, ou com teto acima do banco). O conserto é ajustar o `LIMITES` (para baixo ou igual ao banco) ou
  acrescentar o campo, sempre recusando na conferência, nunca truncando. Se não houver buraco, o código do import não
  muda, e o mapa é a prova.
- `src/lib/types/database.ts` não muda (CHECK não entra na geração de tipos). Se a geração do MCP depois do apply
  mostrar diferença, é achado: registre e descubra por quê antes de continuar.

### Frente E: os roteiros, o injetor e o rollback
- **Os roteiros existentes** que inserem texto longo de propósito, ou com `repeat()`/`lpad()` acima de um teto novo,
  passam a levar `23514`. Cada um se ajusta, um a um, com a lista no relatório: a fixture encurta para caber, ou o
  cenário vira o de recusa, se era isso que ele queria provar. **Nenhuma asserção muda para passar.**
- **O rollback**: `supabase/rollback/F66B-desfaz.sql`, na ordem inversa dos lotes (`drop constraint` literal por nome).
  Ele é ensaiado por `supabase/tests/f66b_rollback.sql` até a impressão do CI tirada antes da `0181`, com o irmão de mesa
  `rollback-f66b.test.ts` no molde do da F66. Os rollbacks F62 a F66 são medidos no CI com os CHECK no lugar (fato 18):
  se algum falhar, ele passa a rodar o da F66B antes, e isso é declarado.
- **O injetor** (decisão 13).

### Frente F: os documentos
- **MATRIZ**: a emenda **F66B** em `docs/MATRIZ-REGRAS.md`, a partir do próximo R-ACC livre (confira: a v1.71.2 usou o
  R-ACC-117). Ela fixa:
  - o comprimento como regra do banco;
  - "uma coluna, um teto, ≥ todo caminho";
  - a forma e o nome;
  - as exceções nominais;
  - a recusa do import na conferência.
- **ADR e RUNBOOK**:
  - uma nota no `ADR-003` (o CHECK como classe ADITIVA, com a contagem de violação como portão);
  - o **Anexo F66B** no `RUNBOOK-BANCO.md`: a receita "pôr CHECK com o app no ar" (contagem 0 → apply literal por lote
    → `relfilenode` igual), o rollback por `drop constraint` e o aviso da restauração de backup antigo (fato 20).
- **PLANO**:
  - a nota **F66B** no `PLANO-MULTIEMPRESA.md`, com os desvios medidos;
  - **a nota na ficha F67** com as decisões 2 e 3 do Johnny de 12/11/2026, nas palavras do cabeçalho desta ordem. É uma
    nota datada, não fichas novas: quem divide a F67 em F67/F67B/F67C é a própria F67;
  - a menção na ficha **F69** de que a saída das contas dev de `membros` chega a ela.
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`, com as três decisões do Johnny e as catorze da fase.

### Frente G: o fechamento, nesta ordem
1. `1.72.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real. Por exemplo:
   - textos longos demais passaram a ser recusados pelo próprio sistema, não só pela tela, com uma mensagem que diz o
     campo e o limite;
   - na importação, a linha com um texto acima do limite continua aparecendo na conferência, antes de importar;
   - o campo Observações do ativo passou a ter o mesmo limite em todas as telas.

   Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F66B.md`. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **No ENSAIO**, pelo `apply_migration` do MCP, com o `name` certo:
   - logo antes: a impressão "antes" e a contagem de violação refeitas (0 em toda coluna, com os tetos FINAIS);
   - o **lote 1**, e depois dele a contagem do lote (0), o `relfilenode` das tabelas do lote igual e as constraints do lote
     iguais às do CI (md5 de `pg_get_constraintdef`);
   - o **lote 2**, o mesmo; o **lote 3**, o mesmo; o **lote 4**, o mesmo;
   - a prova pós-apply do runbook: `notify pgrst`; `get_advisors` de segurança e de performance (nada novo esperado); o
     `relfilenode` das 20 igual; o `prosrc` intocado; as 62 policies byte a byte; a sonda de exatidão; e **o conferidor
     de formas contra o ENSAIO**, com 0 recusadas.

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com a correção em migration NOVA.
6. **Em PRODUÇÃO**, na mesma ordem e com as mesmas provas, dentro de 24 h do commit das migrations:
   - a contagem de violação imediatamente antes de CADA lote (0);
   - o `relfilenode` igual, sem exceção;
   - logo depois do último apply, e antes do merge: `node scripts/smoke/smoke-prod.mjs` a partir da branch, o
     conferidor contra PRODUÇÃO (a conta do smoke, só contagens) com 0 recusadas, e a paridade ensaio × produção nas 11
     classes.

   Se a contagem der > 0 antes de um lote, aquele lote NÃO é aplicado (ver "Bloqueios"). Se o smoke ou o conferidor
   recusarem, ou se aparecer advisor de segurança não declarado que cite objeto da fase: **rollback imediato em
   produção**, antes do diagnóstico, com o registro no topo do relatório.
7. Ata e `docs/RELATORIO-F66B.md` com o que já dá para escrever. O PR sai do rascunho. Merge com os dois checks verdes,
   logo depois das provas.
8. **A conferência pós-deploy, só leitura**: `/api/saude` com `1.72.0` e o commit do merge; `node
   scripts/smoke/smoke-prod.mjs` com 0 falha; a Parte B do `saude.yml` disparada à mão, verde, com a sonda de deriva sem
   pendente. Nenhuma captura de tela de produção.
9. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.72.0` vai no merge
   dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Da ficha e das decisões do Johnny:**
  - `jsonb` de qualquer tabela (o `detalhe` de `eventos_admin` ficou onde está pela decisão 3 do Johnny na F66);
  - as colunas de `empresas` (já têm CHECK);
  - qualquer caminho de expurgo;
  - TUDO da F67: a ponte de `papel_atual()`, `pode_escrever_unidade`, as guardas da F52, as RPCs destrutivas com
    `p_empresa`, `v_conflitos_filiais`, a trava do termo, Storage, Realtime, o default `empresa_legada()`, as contas dev
    (decisões 2 e 3 do Johnny: aqui só a nota no plano);
  - `profiles` (F69), a porta pública (F68), a UI multiempresa (F70).
- **O que esta ordem acrescenta:**
  - editar migration aplicada;
  - `update` em qualquer tabela, truncar valor, ou "consertar" dado vivo para caber num teto (o teto sobe; o dado fica);
  - baixar qualquer teto de tela, ou subir um teto de tela além do que a decisão 6 manda;
  - `savepoint` por linha na RPC do import, ou qualquer mudança no comportamento de aborto dela (outra conversa);
  - DDL dinâmica, CHECK por função (`length(fn(col))`), CHECK sobre `jsonb`;
  - afrouxar o classificador, a guarda de topo, a doutrina, os catálogos das F48–F66, ou subir número da linha de base
    do smoke ou do alarme;
  - `carga.ts`, `reset.ts`, `restaurar.mjs`, `scripts/seed.ts` (se o seed fictício violar um teto, registre: ele não
    roda no CI e não é desta fase);
  - o `CLAUDE.md` da raiz, `.github/workflows/**` e a proteção da `main`;
  - dependência nova, `.env*`, `scratchpad/`, os PRs do dependabot, o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F66B.md` tem os 24 fatos remedidos, a tabela-verdade de TODAS as colunas de texto das 20 (classe,
   caminhos com teto, máximo vivo nos dois bancos, teto escolhido e a regra), o mapa do import, as catorze decisões, a
   ordem das migrations e a ORDEM DE ROLLBACK. Ele é anterior ao primeiro commit que toca `supabase/`, `src/` ou
   `scripts/`.
3. A contagem de violação e o máximo vivo, por coluna, nos dois bancos, e a impressão "antes" existem, tiradas antes de
   qualquer apply, só com números, nomes de esquema, textos de constraint e hashes.
4. As migrations começam na `0181`, com cabeçalho de classe validado, rollback no rodapé, `db:lock` no mesmo commit e
   entrada em `DA_F38`. Não há `update`, `cascade`, DDL dinâmica, `not valid` deixado sem validar, nem nome-sem-prefixo
   repetido. Nenhuma função, coluna ou policy foi criada ou recriada.
5. Toda coluna `text`/`varchar` das 20 tem o CHECK `<tabela>_<coluna>_tamanho` na forma `char_length(<col>) <= <N>`,
   validado, nos dois bancos e no CI, ou está na exceção nominal com motivo. `comprimento_por_coluna.sql` nasceu
   vermelho e está verde.
6. **Nenhum teto abaixo de um caminho**: para cada coluna, o teto do banco é ≥ o teto de todo caminho com Zod ou
   `LIMITES_CAMPO_PLANO` que escreve nela, e ≥ o máximo vivo nos dois bancos. A trava de mesa prova isso e nasceu
   sabendo ficar vermelha.
7. Os derivados por gatilho e os gerados no servidor têm teto provado (a chave não estoura o próprio CHECK com a origem
   no teto; o formato do gerado cabe) ou são exceção nominal com motivo.
8. A cobertura do import está provada coluna a coluna. A linha longa é recusada na conferência (`valor_longo_demais`),
   e a RPC chamada por fora com valor acima do teto leva `23514` sem gravar nada (como `postgres`, a filial ficou como
   antes).
9. Todo CHECK `_tamanho` tem frase pt-BR com o campo e o teto; nenhuma tradução morta. O teste confere as duas coisas.
10. `ativos.observacoes` tem um teto só nas telas, e a edição de `motivos.codigo` tem `.max(40)`. Nenhum outro teto de
    tela mudou.
11. **Nada mudou para a WAP**: a contagem de violação deu 0 em toda coluna, nos dois bancos, imediatamente antes de
    cada lote. O smoke logo depois do apply deu 0 falha. O conferidor deu 0 recusadas no ensaio e em produção.
12. **Nenhuma tupla reescrita**: nenhum `update` em lugar nenhum, e o `relfilenode` das 20 é igual antes × depois, nos
    dois bancos.
13. As funções (md5 do `prosrc`) e as 62 policies estão byte a byte. As únicas constraints novas são as `_tamanho` da
    tabela-verdade.
14. O rollback está escrito na ordem inversa em `supabase/rollback/F66B-desfaz.sql` e foi **ensaiado no Postgres do
    CI** até a impressão tirada antes da `0181`. Os rollbacks F62 a F66 foram medidos com os CHECK no lugar, e o
    resultado está declarado.
15. Os roteiros adaptados estão listados, com o motivo de cada um, e nenhuma asserção mudou para passar.
16. A decisão sobre o injetor está na ata. As mutações entraram e são detectadas pelo cenário nomeado. O teto está no
    número exato, com o porquê datado, e a quarentena abaixo de ⅓.
17. O advisor de segurança não mudou, e o de performance mudou só no delta declarado. A paridade ensaio × produção
    fecha nas 11 classes. `database.ts` não mudou.
18. Nenhuma dependência nova. Ficaram intocados: `.github/workflows/**`, o `CLAUDE.md` da raiz, `scripts/seed.ts`,
    `restaurar.mjs`, `carga.ts`, as queries, os componentes (fora o que a tradução de erro exigir, declarado) e a RPC do
    import. Nenhum número da linha de base subiu.
19. As emendas estão feitas: MATRIZ (F66B), `ADR-003`, `RUNBOOK-BANCO.md` (Anexo F66B), `PLANO-MULTIEMPRESA.md` (nota
    F66B, **a nota na ficha F67 com as decisões 2 e 3 do Johnny**, a menção na F69), `docs/README.md`,
    `docs/prompts/README.md` e a ata.
20. `package.json` em `1.72.0`, `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.72.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
21. Os dois PRs estão mergeados com os dois checks verdes, e a conferência pós-deploy foi feita; se não, o bloqueio
    está no topo do relatório.
22. As sabotagens A a I estão com saída real em `docs/f66b-evidencias/`.
23. Nenhum dado real (nome, e-mail, id, patrimônio, código, slug, texto de linha) em migration, teste, roteiro,
    evidência ou log. Da produção, só números, nomes de esquema, textos de constraint e hashes. Ninguém abriu o
    `.env.local`.
24. `docs/RELATORIO-F66B.md` segue o padrão F45 a F66, com o roteiro do Johnny no topo, o estado de repouso e a seção
    "o que este relatório NÃO prova".

# Verificação: rode de verdade
A cada incremento, rode `npm run lint`, `npm run test` e `npm run typecheck`. Rode `npm run build` antes de cada push.
Tudo o que é SQL (roteiros, injetor, `db:types:diff`) passa pelo `banco-sem-docker` do PR. Leia a falha, corrija a
**causa raiz** e repita até passar.

Não faça nada disto para um teste passar:
- alargar exceção para caber um caso que devia reprovar;
- trocar detecção por `skip`;
- afrouxar um catálogo, o classificador ou a guarda de topo;
- subir a linha de base;
- encurtar uma fixture que existia para provar um texto longo legítimo, em vez de subir o teto;
- mudar uma asserção existente sem conferir que ela prova a mesma coisa.

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**O TETO NUNCA FICA ABAIXO DE UM CAMINHO NEM DO DADO VIVO, NENHUMA LINHA É ALTERADA, E A CONTAGEM VEM ANTES DE CADA
LOTE.** A contagem 0 nos dois bancos, o `relfilenode` igual e o conferidor com 0 recusadas no ensaio são o portão do
apply de produção. Os mesmos, em produção, mais o smoke, são o portão do merge.

Provas obrigatórias, cada uma com a saída real em `docs/f66b-evidencias/`:
- **Sabotagem A, o catálogo.** `comprimento_por_coluna.sql` vermelho sobre o banco de hoje (as ~63), verde depois. Cada
  um destes o deixa vermelho, pelo nome da coluna:
  - uma coluna com o CHECK retirado;
  - o CHECK de uma coluna recriado `not valid`;
  - o CHECK com outra forma (`length(col)`, `octet_length(col)`, `char_length(btrim(col))` sem estar na exceção);
  - uma coluna nova `text` sintética numa das 20, sem CHECK;
  - uma exceção nominal que aponta coluna inexistente;
  - uma exceção nominal para coluna que TEM o CHECK.
- **Sabotagem B, a mesa.** A trava Zod × banco vermelha quando:
  - um `.max()` de tela sobe acima do teto da fonte;
  - `LIMITES_CAMPO_PLANO` de um campo sobe acima do teto da coluna que ele alimenta;
  - o literal de um CHECK numa migration diverge da fonte;
  - a fonte ganha uma coluna que nenhuma migration limita.
- **Sabotagem C, o comportamento.** Por lote, no roteiro: teto passa e teto + 1 leva `23514` com o nome certo, em
  INSERT e em UPDATE; NULL passa. Sem o CHECK, dentro da transação, o teto + 1 passa: a prova de que quem recusou foi
  o CHECK.
- **Sabotagem D, o import por fora.** A RPC chamada com um campo do `jsonb` acima do teto: `23514`, e a filial
  intacta (contagens antes = depois, como `postgres`). Sem o CHECK, a mesma chamada grava: a prova de que o desvio
  existia.
- **Sabotagem E, o import pela tela.** Uma planilha fictícia com uma célula acima do `LIMITES_CAMPO_PLANO`: a linha sai
  como `valor_longo_demais` na conferência, e o plano não a contém. Para cada coluna do mapa do import, um caso.
- **Sabotagem F, a tradução.** Para cada CHECK `_tamanho`, a mensagem do `23514` (a do Postgres, de verdade, capturada
  no roteiro ou montada pelo formato documentado) vira a frase pt-BR com o rótulo e o teto. Uma constraint `_tamanho`
  sem frase deixa o teste vermelho.
- **Sabotagem G, "nada mudou".** A contagem de violação antes de cada lote, nos dois bancos, com o número de colunas
  e de linhas conferidas, e 0. E a prova de que o bloco SABE achar violação: no ensaio, dentro do próprio bloco (que
  termina em `raise exception`), um teto rebaixado de propósito para abaixo do máximo vivo de uma coluna dá > 0.
- **Sabotagem H, o rollback.** `F66B-desfaz.sql` devolve as constraints à impressão de antes da `0181`. Os rollbacks
  F62 a F66, com os CHECK no lugar, estão com a saída real e a declaração.
- **Sabotagem I, o instrumento.** A impressão "antes/depois": uma constraint alterada numa subtransação muda o md5
  dela; um `alter column … type` muda o `relfilenode`; as migrations da fase não mudam o `relfilenode` de nenhuma das
  20.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI;
  - mutações e teto;
  - CHECK em `public` (36 → N) e de comprimento nas 20 (2 → N);
  - colunas com teto, exceções nominais e caminhos mapeados;
  - advisors por nível e nome;
  - o `relfilenode` das 20 nos dois bancos;
  - a contagem de violação por lote nos dois bancos;
  - o conferidor (pontos, linhas, recusadas) no ensaio e em produção;
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco e os bancos de hoje;
2. as três decisões do Johnny abaixo;
3. a ficha da F66B no §7 do plano;
4. este prompt, no que ele detalha (onde ele diverge da ficha, a divergência está declarada aqui e vai para o
   relatório);
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, a MATRIZ, o código existente, o molde da
   F66);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**As três decisões do Johnny (12/11/2026):**
1. a F66B roda agora, antes da F67, como o plano manda;
2. a F67 vai ser dividida em três (F67: cargo por empresa, `security definer`, RPCs destrutivas, mesa de conflitos e
   trava do termo; F67B: Storage e Realtime; F67C: o fim do default `empresa_legada()`). Aqui só a nota na ficha F67;
3. as duas contas dev continuam em `membros` por ora. Na F67, `e_dev()` passa a ser "dev da empresa OU
   `e_plataforma()`", e a saída de `membros` vai para a F69. Aqui só a nota nas fichas F67 e F69.

**As catorze decisões que esta fase precisa tomar por escrito:**
1. **O universo.** Toda coluna `text`/`varchar` (e `char`, se houver) das 20, lida do catálogo nos dois bancos, com a
   paridade conferida. Domínios e enums não são texto livre: declare se algum domínio sobre `text` aparecer. `jsonb`
   está fora (a ficha).
2. **A régua do teto**, coluna a coluna, nesta ordem:
   - (a) o teto é ≥ o MAIOR teto entre os caminhos com Zod/`LIMITES` que escrevem na coluna (fato 8);
   - (b) ele é ≥ o máximo vivo nos dois bancos;
   - (c) onde não há Zod nenhum, ele sai da medição com folga escrita. A proposta: o primeiro degrau da escada
     `40 · 80 · 120 · 200 · 320 · 500 · 2000` que seja ≥ 2× o máximo vivo e ≥ o teto de um campo irmão do mesmo
     significado. Campo que guarda e-mail vai a ≥ 320, o limite do endereço; campo que guarda caminho ou hash sai do
     formato (decisão 5).

   Nunca um teto abaixo de (a) ou (b). Um teto acima do maior caminho só com motivo escrito.
3. **A forma e o nome.**
   - A forma é `char_length(<col>) <= <N>`, sem `btrim`: é o limite honesto do que se guarda, e o caminho sem Zod pode
     não aparar. NULL passa.
   - O nome é `<tabela>_<coluna>_tamanho` (≤ 63 bytes; se passar, a regra de abreviação vai escrita).
   - Um `alter table` por tabela com todas as `add constraint`, validado direto quando a contagem é 0.
   - **As duas existentes nas 20** (`anotacao_texto_len`, `unidades_apelidos_apelido_tamanho`) já limitam o máximo,
     com `btrim` e com nome fora do padrão. A proposta é deixá-las como estão e pôr as duas colunas na exceção nominal
     com o motivo "já limitada por <nome> desde a <migration>". A alternativa, um segundo CHECK redundante, é pior.
     Decida e declare. Renomear nunca: o nome é contrato de tradução (`erros-do-banco.ts`).
4. **Os derivados por gatilho (`*_chave`)** (fato 21). A proposta é CHECK com teto = 2× o teto da origem, provado por
   teste: a função de chave aplicada a uma origem no teto, com os caracteres que expandem no `unaccent`, cabe no teto
   da chave. A alternativa é exceção nominal "derivado de coluna com teto", com a mesma prova. Nunca o mesmo teto da
   origem sem a prova.
5. **Os gerados no servidor** (fato 22). A proposta é CHECK com o teto do formato (ex.: `<uuid>.docx` = 41) e uma folga
   pequena escrita. Ele defende contra o caminho de service role e contra os scripts. Exceção nominal só se o formato
   for variável sem limite natural, com motivo.
6. **Os dois ajustes da ficha.**
   - `ativos.observacoes`: o teto das TELAS vira um só pela constante da fonte, com o MAIOR dos dois (2.000), para não
     recusar nada que se aceita hoje. A devolução ao fornecedor sobe de 500 para 2.000 só se ela grava em
     `ativos.observacoes`; se grava em outra coluna, é outro caso (meça). O `LIMITES_CAMPO_PLANO.observacoes` (500) pode
     ficar menor, declarado.
   - `motivos.codigo` na edição: `.max(40)`, igual à criação.
   - Nenhum outro teto de tela muda. Se a tabela-verdade achar outro par divergente, ele vai para a ata e o backlog, e
     o banco fica com o maior.
7. **A fonte única e a trava de mesa.** A proposta:
   - um módulo folha em `src/lib/validators/` com `{ tabela: { coluna: { teto, rotulo } } }`;
   - a trava lê os CHECK `_tamanho` das migrations (regex sobre o SQL literal, como as travas de mesa já fazem) e
     compara com a fonte nos dois sentidos;
   - os caminhos da tabela-verdade ficam declarados numa lista ao lado (arquivo e campo), e o teste importa o
     schema/constante de cada um e confere `teto do caminho ≤ teto da coluna`. Onde importar o schema for frágil, a
     prova por sonda do Zod: aceita o teto do caminho, recusa o teto + 1, e o teto do caminho ≤ o do banco.

   Escolha a forma que fica vermelha nas quatro sabotagens B, e declare o que ela NÃO pega.
8. **`comprimento_por_coluna.sql`**: onde o universo das 20 é lido (sem terceira cópia de `k_negocio`); como a árvore
   (`conbin`) é conferida (a coluna certa, o `char_length`, o `<=`, o inteiro); as exceções nominais em arrays paralelos
   com motivo (o molde de `definer_sem_tenant.sql`); a asserção de `convalidated`; e a auto-sabotagem em transação.
9. **O mapa do import** (fato 9). Para cada coluna que a RPC grava a partir do plano: o campo de `AtivoPlano`, o teto,
   as transformações no caminho (o patrimônio canônico, o prefixo, `upper`/`lower`, a chave, o colaborador e o setor
   que viram cadastro ou snapshot) e a prova de que nada alonga além do teto do banco. As colunas do vocabulário do
   import (`import_prefixos_patrimonio`, `import_termos_*`, `unidades_apelidos`) têm escritor de tela, não do plano:
   declare quem escreve nelas.
10. **A tradução do `23514`.** A proposta é UM ramo para o sufixo `_tamanho`: tabela e coluna lidas do nome da
    constraint na mensagem do Postgres, rótulo e teto lidos da fonte única, frase *"O campo <rótulo> aceita no máximo
    <N> caracteres."*. As entradas em `CONSTRAINTS_TRADUZIDAS` (ou numa fonte irmã que `erros-do-banco-sql.test.ts`
    também confira contra o esquema vivo). Confira na mensagem real do Postgres que o nome da constraint aparece. E
    confirme que o caminho do import, que hoje trata `23514` como "recusa da RPC" (`actions/importar.ts:130`), continua
    tratando: a mensagem nova é a do ramo, e o backup fica.
11. **Os lotes**: os quatro da Frente C, um por migration, na ordem de lock das `0175`–`0178`. Entre dois lotes o
    estado é repouso válido (umas tabelas com teto, outras sem: nada recusa o que se aceita hoje). Se um lote não pegar o
    lock em 2 s, divida por tabela e registre.
12. **O que NÃO pode mudar**: nenhuma função recriada (a RPC do import continua byte a byte); nenhuma policy; nenhuma
    coluna; os advisors. A prova é a impressão "antes/depois".
13. **O injetor**: uma mutação por classe de trava desta fase que nenhum teste de mesa já derruba. As candidatas:
    - o CHECK de uma coluna some;
    - o CHECK vira `not valid`;
    - o CHECK troca `char_length` por `octet_length`;
    - a exceção nominal ganha uma coluna que tem CHECK;
    - a RPC do import ganha uma coluna gravada sem teto (a coluna sintética do roteiro).

    Teto novo exato (156 → N), ou a ata diz por que não entrou.
14. **O rollback e o encadeamento**: `drop constraint` literal por nome, na ordem inversa; os rollbacks F62 a F66
    medidos no CI com os CHECK no lugar (fato 18); e a declaração: depois do rollback, a defesa volta a ser só o Zod
    (nenhum dado se perde).

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **A contagem de violação deu > 0 numa coluna** (qualquer banco, qualquer momento antes do apply daquele lote):
  - se a coluna não tem Zod, o teto sobe pela régua da decisão 2 até a contagem dar 0, declarado;
  - se a coluna tem Zod e há linha ACIMA do Zod, algum caminho o contornou. O teto do banco sobe para cobrir o vivo, o
    achado vai para o topo do relatório com a contagem (só número), e o caminho suspeito vai para o backlog;
  - **o dado nunca é alterado.** Se o teto necessário ficar absurdo (acima de 10.000 numa coluna de texto curto), não
    aplique aquela coluna: ela vira exceção nominal com o número e o motivo, e segue o resto.
- **O MCP da Supabase não está conectado, ou recusa o apply.** Não procure token, não leia o Gerenciador de
  Credenciais, não abra o `.env.local`. Confira de novo algumas vezes ao longo da run. Se não voltar, entregue tudo o
  que não depende do banco vivo, com o PR ABERTO e **SEM merge**. No topo do relatório vai o caminho B: as migrations na
  ordem, o bloco de contagem e as impressões para rodar antes e depois, e o rollback.
- **O `relfilenode` mudou, as constraints divergiram do CI, ou o conferidor recusou, no ensaio.** Rollback no ensaio na
  ordem escrita, causa raiz, correção por migration NOVA e o ciclo de novo. **Em produção:** rollback imediato, antes do
  diagnóstico, sem merge, com o bloqueio no topo do relatório.
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO de
  `supabase/rollback/F66B-desfaz.sql` que o CI já ensaiou (ou o bloco do lote em questão, se o CI ensaiou cada bloco). É
  a única exceção ao "`execute_sql` só leitura", e vale só para esse arquivo. A linha do ledger fica: registre o que a
  sonda de deriva vai dizer dela. Se o classificador de segurança barrar o rollback, não reformule: o comando exato vai
  no topo do relatório, e o PR fica sem merge.
- **O lock não veio** (o `lock_timeout` disparou): registre e tente de novo, no máximo três tentativas em 30 minutos.
  Não suba o timeout nem mate sessões do app. Depois da terceira, pare o apply daquele banco: PR aberto, sem merge, e o
  comando no topo do relatório. Parar entre dois lotes é repouso válido.
- **Advisor de segurança novo** depois do apply, não declarado: se cita objeto desta fase, escalada do runbook e
  rollback antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e siga.
- **O smoke recusa** depois do apply de produção: alguém deixou de gravar o que gravava. Rollback em produção, PR sem
  merge, e a causa no topo do relatório. Não tente consertar na mesma run.
- **A sonda de deriva abre alarme** porque um apply passou das 24 h: registre; o alarme fecha sozinho na Parte B
  seguinte.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a
  pendência. Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, merge, push de tag, disparo de
  workflow): registre, não repita, não reformule, siga no que não depende dela e ponha o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui
já há oito divergências medidas de saída**, e elas vão no relatório:
- a numeração (`0181`) e a versão (`1.72.0`): a ficha não as fixava (fato 1);
- os fatos de banco da ficha têm sete semanas e são remedidos (fatos 5 e 6);
- uma coluna, vários tetos: o caso é geral, não só `ativos.observacoes` (fato 8);
- a validação por linha do import já existe desde a F56; o trabalho é a cobertura e o desvio (fato 9);
- `registrarEventoAdmin` tem 16 chamadas, não 15, e a contagem de `createAdminClient` depende da base (fato 11);
- a forma sem `btrim` e o destino das duas constraints que já existem (decisão 3);
- o `unaccent` alonga, e a chave precisa de teto próprio ou de prova (fato 21);
- as três decisões do Johnny (a ordem, a F67 em três e as contas dev), que entram só como nota.

Declare também o que este prompt acrescenta à ficha:
- a régua do teto "≥ todo caminho e ≥ o vivo";
- a tabela-verdade coluna × caminho;
- o mapa do import;
- a contagem de violação como portão por lote;
- o rollback e o encadeamento medido;
- a nota da F67.

# Git e segurança
- **Branch** `f66b-comprimento-vira-regra-do-banco`, com commits pequenos e frequentes e mensagens em pt-BR no padrão
  conventional (`docs(f66b): …`, `test(f66b): …`, `feat(f66b): …`, `fix(f66b): …`, `chore(f66b): …`).
- **Documentação primeiro.** Commite também esta ordem (`docs/prompts/F66B-comprimento-vira-regra-do-banco-ultracode.md`)
  num commit de documentação. O `PLAN-F66B.md` vem antes do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os commits vão nesta ordem:**
  1. as travas vermelhas;
  2. a fonte única dos tetos e a trava de mesa (vermelha contra as migrations sem CHECK);
  3. o lote 1;
  4. o lote 2;
  5. o lote 3;
  6. o lote 4;
  7. os Zod unificados e o `.max()` de `motivos.codigo`;
  8. a tradução do `23514`;
  9. a cobertura do import, se houver buraco;
  10. os roteiros adaptados e o rollback;
  11. o injetor;
  12. os documentos;
  13. a versão.

  Cada migration leva o `db:lock` no mesmo commit.
- **Pushes agrupados**: cada um custa CI numa cota apertada.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece quando:
  - `verificar` e `banco-sem-docker` estão verdes;
  - a contagem de violação deu 0 antes de cada lote nos dois bancos;
  - o `relfilenode` é igual nos dois bancos;
  - o conferidor deu 0 recusadas no ensaio e em produção, e o smoke 0 falha.

  Depois do merge, a evidência vai por um PR só de documentação, e qualquer correção de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `update`, `cascade`,
  `not valid` deixado sem validar, abrir a janela `estoque.dev_destrutivo`, DDL dinâmica;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; matar sessão do app; imprimir ou gravar valor de coluna,
  id, nome, e-mail, patrimônio, código, slug ou texto de linha real (nem em log, nem em evidência, nem na resposta);
  qualquer escrita fora do `apply_migration` e do rollback autorizado;
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de
  10/09); ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha e token;
- **no repositório:** mexer na proteção da `main` ou no workflow, instalar dependência, mexer nos PRs do dependabot,
  subir número da linha de base.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local` e que, de banco, só lê catálogo,
contagens, comprimentos (nunca valores), textos de esquema e hashes. As frentes de exploração:
- (a) **os caminhos de escrita do TS**: os 79 `.max(`, `LIMITES_CAMPO_PLANO`, `actions/relatorios.ts`,
  `auditoria-registro.ts`, `createAdminClient`. Para cada coluna das 20, quem escreve nela e com que teto (fatos 7, 8,
  11 e 13);
- (b) **os caminhos de escrita do SQL e o import**: as funções que gravam texto nas 20 (corpo vigente, via
  `corpo-vigente.mjs`), a RPC do import e as transformações dela, os gatilhos de chave e o `unaccent` (fatos 9, 10, 21
  e 22);
- (c) **as travas, os roteiros e o injetor**: o molde de `catalogo_policies.sql`/`definer_sem_tenant.sql`, os roteiros
  que gravam texto longo, `mutacoes.mjs`, `erros-do-banco.ts` e os testes dele, os rollbacks F62 a F66 (fatos 12 e 18);
- (d) **a documentação oficial** (regra 6): o PG 17 (`ALTER TABLE … ADD CONSTRAINT`: lock, validação, várias
  constraints numa passada; `char_length`; o CHECK com NULL; a mensagem do `23514` com o nome da constraint), o Zod
  (`.max()` de string) e o `unaccent` (fatos 14, 15 e 21);
- (e) **os bancos, só leitura**: as colunas de texto das 20 com a paridade, o máximo vivo e a contagem de violação por
  coluna, os tamanhos das tabelas, a impressão "antes" (fatos 4, 5, 6 e 15).

Escreva `docs/PLAN-F66B.md` antes de implementar. **A edição é sequencial**: as migrations, a fonte única e as travas
se cruzam. Paralelize exploração, medição e revisão, não edição.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**. Eles
leem o código **pelo SHA** (nunca pela árvore de trabalho), contra o `PLAN-F66B.md` e os 24 critérios, com estas
perguntas:
- Algum teto ficou abaixo de um caminho que escreve na coluna (tela, import, RPC, service role)? Algum ficou abaixo do
  máximo vivo?
- A tabela-verdade cobre TODO caminho, ou só os validators? Algum caminho de escrita ficou fora da trava de mesa?
- Alguma chave derivada estoura o próprio CHECK com a origem no teto?
- O mapa do import prova que nenhuma transformação da RPC alonga, ou só afirma?
- A trava de catálogo lê a árvore ou o texto? Sabe ficar vermelha nas seis sabotagens A?
- A trava de mesa é tautológica (a fonte comparada consigo mesma)?
- A tradução cobre todo `_tamanho`? O import continua tratando `23514` como recusa e preservando o backup?
- Alguma migration tem `update`, DDL dinâmica, `not valid` sem validar, ou recriou função?
- O `F66B-desfaz.sql` devolve as constraints de antes? Os rollbacks F62 a F66 ainda rodam?
- Alguma sabotagem prova só o caminho feliz? Alguma evidência tem valor real de coluna?
- Algum arquivo fora do escopo foi tocado (a RPC do import, queries, componentes, seed, workflow)?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado,
não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F66B.md`, em pt-BR, no padrão dos relatórios F45 a F66, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B completo, se o MCP
  faltou);
- depois do deploy, entrar com a própria conta e conferir que tudo grava como sempre:
  - editar a ficha de um ativo e salvar uma observação longa (perto de 2.000 caracteres);
  - registrar uma movimentação com observação;
  - um lançamento de item com observação;
  - cadastrar ou editar um motivo, um tipo de item e um apelido de filial na Administração;
  - gerar o relatório da semana com observação;
  - abrir a conferência de um import com uma planilha fictícia que tenha uma célula longa demais, e ver a linha
    recusada ali (sem aplicar);
- conferir `/api/saude` com `1.72.0` e a Parte B do `saude.yml` verde no dia seguinte, sem issue de alarme aberta;
- o `git diff v1.71.2 v1.72.0 --stat`, com o que deve e o que não deve aparecer;
- os lembretes: o próximo prompt é o da F67, já dividida em três pelas decisões de hoje.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas oito já
  conhecidas;
- as três decisões do Johnny e as **catorze decisões** da fase;
- a tabela-verdade das colunas (classe, caminhos, máximo vivo, teto, regra) e o mapa do import;
- a contagem de violação, lote a lote, nos dois bancos;
- o `relfilenode` e a impressão antes × depois;
- o conferidor no ensaio e em produção, e o smoke;
- as sabotagens com saída real;
- a contagem final;
- os 24 critérios autoverificados;
- o estado de repouso: o que acontece se o projeto parar aqui por dois meses;
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que um backup antigo (do import ou de migração) restaura sem `23514` (fato 20: o conteúdo dos backups não foi
    lido);
  - que o seed fictício respeita os tetos (ele não roda no CI);
  - que os tetos sem Zod servem ao dado de amanhã (eles vêm da medição de hoje, com folga);
  - que `jsonb` está limitado (fora do escopo);
  - nada sobre isolamento por empresa (a F67).

Pendências e **backlog nomeado**:
- **F67** (dividida em F67/F67B/F67C pelas decisões de hoje): a ponte de `papel_atual()`, as `security definer`, as
  destrutivas, a mesa de conflitos, a trava do termo; Storage e Realtime; o fim do default;
- **F69**: `profiles` e a saída das contas dev de `membros`;
- os pares de tetos divergentes que a tabela-verdade achou e esta fase não unificou;
- o `savepoint` por linha na RPC do import (outra conversa);
- **Backlog** (das fases anteriores, sem mudança): o seed de duas empresas, `scripts/seed.test.ts` e o `onConflict` de
  `seed.ts:886`; a paginação keyset; derrubar `profiles.papel`/`ativo`; o hand-fix da F62 em `operador_filiais.Insert`;
  os `scratch_tmp/scripts/db/*` rastreados; o WARN `multiple_permissive_policies` de `pendencias_item`.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`teto`, `coluna`, `comprimento`). Os nomes que a ficha fixa ficam como estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~15 minutos)

Esta fase **toca os dois bancos**. Ela aplica quatro migrations de CHECK no ensaio e em produção pelo MCP da Supabase,
antes do merge e lote a lote. Antes de cada lote, roda em cada banco um bloco só leitura que conta, por coluna, quantas
linhas passariam do teto. Ela não reescreve linha nem recria função. O item do pré-voo que mais importa é, de novo, o MCP.

Este arquivo já está salvo em `docs/prompts/F66B-comprimento-vira-regra-do-banco-ultracode.md`, **sem commit**. O agente
o commita na branch da fase. O prompt cita os 24 fatos do cabeçalho pelo número, então o arquivo precisa estar lá
quando você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.71.2, main em 0a3a586 (PR #90); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git status --short
Test-Path .git\index.lock    # tem de dar False — uma trava órfã derruba o primeiro commit da run
Test-Path docs\prompts\F66B-comprimento-vira-regra-do-banco-ultracode.md   # tem de dar True

# 3. Produção com a mesma versão, e a Parte B do saude.yml verde hoje (sem issue de alarme aberta).
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
& "C:\Program Files\GitHub CLI\gh.exe" run list --workflow saude.yml --limit 3
& "C:\Program Files\GitHub CLI\gh.exe" issue list --state open --limit 5

# 4. O smoke de produção passa HOJE — é a conferência da fase.
node scripts/smoke/smoke-prod.mjs

# 5. O MCP da Supabase conectado ao Claude Code, enxergando os dois projetos.
claude mcp list

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O passo 5 é o que mais importa.** Dentro do Claude Code, confira duas coisas:
- que o MCP lista `pbtjcalbmepmrqzprusb` (produção) e `sgmvldiizsrjbxzzpmhh` (ensaio). Atenção: o conector da Supabase
  do claude.ai, na conversa que gerou esta ordem, só enxergava o projeto "Invoice Control". Se o Claude Code usa a
  mesma conta, confira que ele vê a organização da WAP;
- que **as ferramentas estão ligadas** nas configurações do conector: `execute_sql`, `apply_migration`,
  `list_migrations`, `get_advisors` e `generate_typescript_types`.

Sem elas, o agente entrega tudo verde no CI, **deixa o PR aberto, sem merge**, e põe o caminho B no topo do relatório.

**Mais três coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. As travas nascem vermelhas no CI (um push a mais), e o
   `banco-sem-docker` roda algumas vezes, mais o PR de documentação e a Parte B disparada à mão.
2. **Dentro do Claude Code:** `/permissions` (nada pode negar `git push`, `gh`, `node`, `npx tsx` nem as ferramentas
   do MCP da Supabase) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).
3. **O horário.** O `add constraint` trava cada tabela pelo tempo de uma varredura (milissegundos com o volume de hoje),
   e o `lock_timeout` de 2 s protege o app. Mesmo assim, evite o pico da manhã e a janela da Parte B das 06:43.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f66b
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP em lotes, roda blocos só leitura nos
dois bancos, abre e mergeia PRs, publica tag, dispara workflow e roda o smoke e o conferidor contra os dois bancos.
Nada disso cabe numa allowlist estreita. `bypassPermissions` numa máquina com credencial de produção está fora de
questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção, no merge na `main`, no push da
tag e no disparo da Parte B. As F53 a F66 passaram por ele, e a F65 parou uma vez no apply do ensaio. Se barrar, o
prompt manda não reformular: o agente registra, segue no resto e põe o comando no topo do relatório.

**`--worktree` NÃO serve.** O smoke e o conferidor precisam do `.env.local`, que não vai para a worktree, e o prompt
proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** Menor que a F66: a parte de banco é mecânica (quatro `alter table` por lote). O peso está na tabela-verdade
coluna × caminho e na revisão adversarial ("algum teto ficou abaixo de um caminho?"), que é onde o modelo forte rende.
Só se a cota semanal estiver apertada, use `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`, para
economizar na exploração.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F66B.md existe com a tabela-verdade das colunas; package.json em 1.72.0; docs/RELATORIO-F66B.md existe; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, as migrations 0181+ aplicadas no ensaio e em producao, com docs/f66b-evidencias/antes preenchido, a contagem de violacao 0 antes de cada lote nos dois bancos, o relfilenode das 20 tabelas igual antes e depois nos dois bancos, o conferidor de formas com 0 recusadas no ensaio e em producao, o smoke apos o apply sem falha, a conferencia pos-deploy e a Parte B passaram sem issue de alarme aberta e a tag v1.72.0 foi publicada; (b) o apply de producao nao aconteceu (classificador barrou ou o lock nao veio em tres tentativas): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F66B.md; (c) tudo aplicado e mergeado, mas o push da tag ou a conferencia barrados, com o comando no topo do docs/RELATORIO-F66B.md; (d) sem MCP da Supabase: PR aberto sem merge, com o caminho B, o bloco de contagem e as impressoes no topo do docs/RELATORIO-F66B.md; (e) o relfilenode, o conferidor ou o smoke reprovaram depois do apply: rollback aplicado (ou, se barrado, o comando do rollback no topo), PR sem merge e a causa no topo do docs/RELATORIO-F66B.md; ou (f) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F66B.md
```

**Headless.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f66b.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f66b.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f66b.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. Como esta fase aplica
em produção, **prefira a sessão interativa deixada rodando, com o `/goal`**, e com a suspensão do Windows desligada no
plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F66B.md` com a tabela-verdade (cada coluna com os caminhos e o teto) e
   `docs/f66b-evidencias/antes/` com a contagem de violação, antes de qualquer migration aplicada. Só números, nomes de
   coluna, textos de constraint e hashes: se aparecer um valor de coluna, um nome ou um e-mail ali, interrompa a sessão.
2. **As travas vermelhas.** `comprimento_por_coluna.sql` reprovando pelas ~63 colunas, e a trava de mesa reprovando,
   antes de qualquer migration.
3. **O ensaio.** Lote a lote: a contagem 0, o `relfilenode` igual e o conferidor no ensaio com 0 recusadas.
4. **A produção.** O mesmo, mais o smoke logo depois do último lote. Se algum falhar, o prompt manda fazer o rollback na
   hora, e o relatório diz isso no topo.
5. **A conferência.** `/api/saude` em `1.72.0`, o smoke com 0 falha, a Parte B verde e nenhuma issue de alarme aberta.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Entre com a sua conta em produção e faça o roteiro do topo do relatório:
   - salve uma observação longa na ficha de um ativo;
   - registre uma movimentação e um lançamento de item com observação;
   - passe pela Administração (motivo, tipo de item, apelido);
   - gere o relatório da semana com observação;
   - abra a conferência de um import com uma planilha fictícia que tenha uma célula longa demais (sem aplicar).

   Tudo tem de gravar como antes, e a célula longa tem de aparecer recusada na conferência.
3. `git diff v1.71.2 v1.72.0 --stat`. Devem aparecer:
   - `supabase/migrations/0181_*` em diante, `supabase/migrations.lock.json`, `supabase/rollback/F66B-desfaz.sql`;
   - `supabase/tests/comprimento_por_coluna.sql`, `f66b_rollback.sql` e talvez os roteiros adaptados, cada um explicado
     no relatório;
   - em `src/lib/validators/`, a fonte dos tetos e a trava de mesa; `ativo.ts`, `devolucao-fornecedor.ts` e `admin.ts`
     (os dois ajustes);
   - `src/lib/supabase/erros-do-banco.ts` e talvez `src/lib/actions/erros.ts` (a tradução);
   - talvez `src/lib/import/limites.ts` (só se o mapa achou buraco);
   - `scripts/db/mutacoes.mjs` e o teste, `registry.ts`, `package.json`, `CHANGELOG.md`, `docs/**`.

   **Não** devem aparecer:
   - `src/lib/queries/**` e `src/app/**`;
   - `src/lib/types/database.ts`;
   - migration antiga alterada, ou função recriada (a RPC do import continua igual);
   - `scripts/seed.ts`, `scripts/reset.ts`, `scripts/import/**` e `scripts/db/restaurar.mjs`;
   - `scripts/smoke/linha-de-base.json` com número que SUBIU;
   - `.github/workflows/**`;
   - mudança de dependência no `package-lock.json`.
4. Abra `docs/f66b-evidencias/`: a contagem de violação lote a lote nos dois bancos, a impressão antes × depois, o
   conferidor e a saída das sabotagens.
5. Confira no `PLANO-MULTIEMPRESA.md` a **nota na ficha F67** com as suas decisões de hoje (a F67 em três e as contas
   dev em `membros`): é dela o próximo prompt.
6. Rode você mesmo `npm run test` uma vez.
7. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **Os números de banco não foram remedidos nesta conversa.** O conector da Supabase daqui só enxerga o projeto
   "Invoice Control". O censo de colunas, os máximos vivos e os tamanhos vêm da ficha (24/09) e do relatório da
   v1.71.2. O agente remede tudo antes de aplicar, e a contagem de violação, que é o portão, é dele.
2. **O agente aplica no ensaio E em produção, antes do merge**, pelo MCP, em quatro lotes. É o fluxo das F53 a F66, não
   decisão nova sua. Sem MCP, é caminho B, com o PR sem merge.
3. **Uma run, um PR de código e um PR de documentação com a tag**, no molde das F58 a F66. Versão `1.72.0` (fase =
   MINOR).
4. **O teto de cada coluna é o MAIOR entre os caminhos que escrevem nela**, nunca abaixo do dado vivo, e nenhum teto
   de tela baixa. Com isso, nada que se aceita hoje passa a ser recusado. Se você preferir unificar por baixo (ex.: a
   observação do ativo em 500 em todo lugar), diga antes de rodar: isso muda a tela.
5. **`ativos.observacoes` unifica em 2.000** nas telas (o maior dos dois). O import pode continuar em 500.
6. **Se aparecer dado vivo acima de um teto, o teto sobe e o dado fica.** Nada é cortado nem atualizado. Uma linha
   acima de um Zod vira achado no topo do relatório (algum caminho contornou a tela).
7. **A forma é `char_length(col) <= N`, sem `btrim`**, e as duas constraints que já existem nas 20 ficam como estão,
   como exceção nominal. O agente pode decidir pôr um segundo CHECK, com motivo.
8. **Sem medição de TTFB.** CHECK só pesa na escrita, e o custo é desprezível no volume de hoje. O agente pode medir se
   achar razão.
9. **As suas decisões sobre a F67 entram só como nota no plano.** Quem divide a ficha em F67/F67B/F67C, com o escopo
   de cada uma, é a própria F67, na próxima conversa.

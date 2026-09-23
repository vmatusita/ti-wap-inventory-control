# PLAN-F64 — `empresa_id` no vocabulário e na infra (lote 2)

> Plano de execução da ordem `docs/prompts/F64-empresa-no-vocabulario-e-na-infra-ultracode.md`
> (F64 do `PLANO-MULTIEMPRESA.md` §7). Escrito **antes** do primeiro commit que toca `supabase/`,
> `src/` ou `scripts/`, como a Frente A exige. Versão da fase: **`1.69.0`**. Branch:
> `f64-empresa-no-vocabulario`.
>
> Régua de decisão (a da ordem, nesta ordem): (1) medição própria contra o disco e os bancos de
> hoje; (2) as três decisões do Johnny de 23/09 (o default fica até a F67; a PK de `motivos` e as
> PKs naturais do import vão para a F65; o rate-limit falha FECHADO); (3) a ficha F64; (4) a ordem;
> (5) as convenções do repositório e o molde da F63; (6) o mais simples e reversível.

---

## 0. O "antes" — ⚠ AINDA NÃO TIRADO: as ferramentas do conector da Supabase foram desligadas no meio da run

Às 13:3x (-03) de 23/09/2026 o conector respondeu normalmente: `list_projects` (os dois projetos
`ACTIVE_HEALTHY`, PostgreSQL 17.6) e a frente (e) da exploração mediu os fatos 1, 2, 3, 14 e 16
pelo `execute_sql`, só leitura (§1). **Minutos depois**, toda ferramenta do conector passou a
responder *"This tool has been disabled in your connector settings"*, com o conector aparecendo
como `connected` (29 ferramentas) no status da sessão — o mesmo bloqueio por ferramenta da F60 e da
F63 (memória `conector-supabase-desligado-no-meio-da-run`): não é o classificador de segurança, e
só o Johnny o desfaz, nas configurações do conector no claude.ai. Avisado por notificação às 13:4x.

Consequência, pela ordem ("Bloqueios reais — o MCP não está conectado"):

- **nenhum apply acontece sem o "antes"**, e nenhum apply acontece sem o MCP: o portão "o antes vem
  antes de qualquer apply" está garantido por construção;
- **tudo o que não depende do banco vivo é entregue** (travas, rate-limit, migrations, roteiros,
  catálogos, tipos, injetor, documentos, versão), com o CI verde;
- **o PR fica ABERTO e SEM merge** enquanto o conector não voltar (o `database.ts` descreveria
  colunas que produção não tem, e o app novo gravaria kit contra um banco sem o gatilho — inócuo,
  mas é estado que o ensaio não provou);
- confiro o conector de novo ao longo da run (antes de cada push e antes de fechar). Se voltar, a
  Frente G segue do passo 5: "antes" nos dois bancos → apply no ensaio → provas → produção → provas
  → smoke → conferidor → merge. Se não voltar, o relatório abre com o **caminho B**.

Os instrumentos do "antes" estão prontos e versionados (Frente A):

| instrumento | o que imprime |
|---|---|
| `docs/f64-evidencias/impressao-vocabulario.sql` | por tabela: a PK **lida do catálogo** · linhas · `relfilenode` · md5 de `(pk, xmin)` na ordem da PK · md5 do conteúdo sem `empresa_id` · janela (linhas com `xmin` a partir do corte) · estado da coluna; o md5 do `prosrc` das 9 escritoras e de `registrar_tentativa_senha`; o md5 do corpo do núcleo, o número de peças e o md5 de cada peça pela chave; os gatilhos de `kits_modelos`. Só contagem e hash. Gerado de um molde único para as onze não divergirem por cópia. |
| `docs/f64-evidencias/impressao-policies.sql` | as 62 policies vivas (public 54 · storage 8), contagem e md5 byte a byte por schema; das onze, 22 policies e quantas citam `empresa_id` (0); das vinte, idem |
| `docs/f64-evidencias/verificacao-pos-apply.sql` | a prova do runbook depois do apply: coluna, default pelo `pg_depend`, FK validada, comentário F67, as três contagens iguais nas onze; 20/20 de `k_negocio` com a coluna; o gatilho do kit (BEFORE, por linha, INSERT + UPDATE OF `payload, empresa_id`, INVOKER, `search_path` fixo); o núcleo com 13 chaves e `kit_motivo_orfao` = 0 |
| `get_advisors(security)` | contado por nível e nome |

A sintaxe do instrumento (a PK como `jsonb` array por `cross join lateral`, ordenada pela
comparação de `jsonb`) foi ensaiada no ENSAIO pela frente (e), só leitura, em `motivos` e
`import_termos_estado`, antes do desligamento. O regex das peças do núcleo não chegou a rodar no
banco (o conector caiu na primeira tentativa) — ele é conferido na mesa contra o `prosrc` da
`0158` (§6) e no CI pelo roteiro da fase.

---

## 1. Os 26 fatos, remedidos

Sete frentes paralelas de exploração (resumos só com números; nenhuma abriu o `.env.local`; a do
banco só leu catálogo, contagem e hash) e eu. "=" bate com o fato; **⚠** diverge (a medição ganha
e vai para o relatório).

| # | o fato diz | medi (23/09) | |
|---|---|---|---|
| 1 | `main` em `86890b7`, tag `v1.68.0`, `1.68.0`; 160 arquivos `0001`→`0161`, gap `0029`; ledger prod 145 · ensaio 158, até `empresa_no_acervo_movimento`; PG 17.6; `rotulo_de_ambiente()` = `'desenvolvimento'` no ensaio; primeira da fase `0162` | = tudo. ⚠ complemento: em PRODUÇÃO `rotulo_de_ambiente()` sem argumento **não existe** no catálogo (o `to_regprocedure` não resolve) — a ordem só afirmava o valor do ensaio | = |
| 2 | 252 arquivos de teste, 7.600 testes; 43 roteiros + `_asserts`, 1.002 asserções; injetor 131/131 + 2 quarentena; `db:types:diff` 38 · 347 · 94; `k_negocio`/`k_infra`/`k_sem_select`/`k_lote1` 20/9/6/8; 62 policies; advisor 6 INFO · 34 WARN · 1 WARN | `npm run test` na linha de base: **252 arquivos, 7.600 testes, verdes**; 44 arquivos em `supabase/tests/` (43 + `_asserts`); `MUTACOES.length` = **131 = o teto**; `k_*` 20/9/6/8 por regex; 62 policies (54 + 8) nos dois bancos; advisor **idêntico nos dois bancos**: 6 INFO `rls_enabled_no_policy` (as seis tabelas do fato) · 34 WARN `authenticated_security_definer_function_executable` · 1 WARN `auth_leaked_password_protection`. ⚠ o **347** de colunas é medido (RELATORIO-F63 §10), mas `diff-tipos.test.mts` só o pina como PISO (`≥ 314`); relações (38) e funções (94) são igualdade | = · ⚠ |
| 3 | as onze nos dois bancos: 198 × 78 linhas, 22 policies, `kits_modelos` VAZIA, só `unidades_apelidos` com gatilho | = linha a linha (tabela da frente (e): contagens, PK, policies, gatilho, FKs, RLS ligada e sem force nas onze, nenhuma na publication do Realtime, nenhuma com `empresa_id`); tamanhos de produção `relatorios_gerados` 296 kB · `eventos_admin` 280 kB | = |
| 4 | onze, não doze; `senha_tentativas`/`ambiente` em `k_infra` | = (`k_negocio` menos `k_lote1` menos `filiais` = as onze; `k_infra` com as duas e o motivo) | = |
| 5 | quatro PKs naturais sem `id` | = pelo catálogo nos dois bancos: `motivos(codigo)`, `import_prefixos_patrimonio(prefixo)`, `import_termos_categoria(termo)`, `import_termos_estado(termo)`; as outras: `tipos_item(id smallint)`, `unidades_apelidos(id bigint)`, cinco `id uuid` | = |
| 6 | o molde `0160`/`0161` | = lido inteiro | = |
| 7 | nenhum gatilho barra o `update` ingênuo nas onze | = (nenhuma tem `guarda_acervo`; o único gatilho, `unidades_apelidos_vocabulario_guarda`, é BEFORE INSERT OR UPDATE e confere o vocabulário, não a empresa; a guarda de topo de `migrations-f38.test.ts` cobre só `movimentacoes`, `lancamentos_item`, `ativos`) | = |
| 8 | 9 funções SQL; TS; scripts; roteiros (tabela) | = exato: as 9 pelo `corpo-vigente.mjs` (§2); os 7 INSERTs TS nas linhas citadas; `registrarEventoAdmin(` 15 chamadas (admin 5 · dev 3 · importar 3 · senhas 2 · unidades-apelidos 2); `auditoria-registro.ts:30` único escritor TS de `eventos_admin`; a tabela dos roteiros bate nas 12 linhas | = |
| 9 | o que a decisão 1 empurra para a F67 | = | = |
| 10 | nenhuma leitura de hoje vê a coluna; formas estritas lançam | = nenhum `select('*')` e nenhum `.select()` vazio sobre as onze (44 cadeias `.from`); as formas F58 das onze são `z.strictObject` com lista explícita. ⚠ nuance: `unidades_apelidos` (`queries/vocabulario-import.ts:46`, `queries/admin.ts:394,433`) e `import_prefixos_patrimonio` (`vocabulario-import.ts:55`) são lidas com colunas explícitas **sem** descritor de forma — não veem a coluna nova (não é `*`), mas também não passam pelo conferidor | = · ⚠ |
| 11 | `senhas.ts:63`, `error` descartado, X4 | = (`:60-62` o comentário, `:63-65` a chamada; `chamarRpc` em `rpc.ts:212` devolve `{data, error}` e não lança; a X4 em `DECISOES.md:446`, entrada de 15/07/2026) | = |
| 12 | `senhas_acesso` zero policy, lida pelo service role | = (`senhas.ts`, `auth/acesso.ts:479-483`, `queries/admin.ts:475-478`, `scripts/perf/medir.mjs:244,254`) | = |
| 13 | `payload.motivo` texto livre, Zod `kit.ts:107`, actions `kits.ts:57/64`, `:91/102` | = ; e a forma exata: sem motivo, a chave `motivo` é **AUSENTE** do jsonb (o `textoOpcional` devolve `undefined` para `null`, `''` e só-espaços, e o `JSON.stringify` apaga a chave). ⚠ **a desativação passa pelo MESMO `update`** (`atualizarKit` grava `{ nome, payload, ativo }`): `payload` está SEMPRE na lista `SET` — decide o desenho do gatilho (decisão 3) | = · ⚠ |
| 14 | 12 peças; três lugares; o alarme | = (0138 → 0158; 12 blocos `return query`; `CHECAGENS` em `dev.ts:197`; `alarme.mjs:48-57`); ⚠ **mais três lugares cravam o 12**: `scripts/smoke/cobertura.test.mts:141-144` (`toHaveLength(12)`) e `:178` (o arquivo do núcleo = `0158_cargo_em_membros.sql`), e `supabase/tests/integridade_alarme.sql:757-811` (12 blocos, `v_n = 12`); e o texto "doze" em `scripts/smoke/integridade.mjs:436` e no `saude.yml:7` (este fora do escopo: `.github/workflows/**`) | = · ⚠ |
| 15 | a leitura de `empresa_id` do kit é exceção nominal | = | = |
| 16 | `motivos` PK `(codigo)`; FK cobre 435/3.630 (prod) · 471/3.245 (ensaio) | = exato, com **10 códigos distintos nos dois bancos** | = |
| 17 | `catalogo_policies.sql`: conjuntos, bloco 5, o aviso | = (`:1212-1322`; o aviso é `raise notice` puro em `:1320`, fora de `v_ok`/`v_falhas`) | = |
| 18 | describe 5 cobre o acervo; o cabeçalho de `isolamento_tenant.sql` diz "F64 para as 11" | = ; e o describe 5 já compara contra `k_negocio` menos `filiais` (as onze estão no universo textual desde a F63). A 9k é derivada do catálogo e vê as onze sozinha | = |
| 19 | injetor teto 131 sem folga; `F63_ACERVO` o molde | = | = |
| 20 | tipos por hand-fix | = ; e o `supabase gen types` NÃO lista função `returns trigger` (`diff-tipos.test.mts:303-315`): a função do gatilho não entra em `Functions` | = |
| 21 | rollbacks encadeados | = (`f63_rollback.sql:83`; `f62_rollback.sql:83,115`, os dois ramos); a constante `k_pre_0159` em `f63_rollback.sql:104` é o molde | = |
| 22 | o classificador | = (`add column` com default da lista fechada = ADITIVA; `create [or replace] function` e `create trigger` ADITIVA; cabeçalho, `DA_F38`, lock e nome-sem-prefixo) — `checagens_integridade_nucleo` **não** está em `INTOCAVEIS` (`migrations-f38.test.ts:231-257` e o cenário 14 de `f38_itens_com_ativo.sql`): recriá-la não pede exceção | = |
| 23 | ADR-003 + RUNBOOK | = | = |
| 24 | conferência e credenciais | não medido de propósito — **ninguém abriu o `.env.local`**. O comando do conferidor da F63 está em `docs/f63-evidencias/depois/producao.json:82` | — |
| 25 | a máscara do patrimônio | = (`0152`: só `patrimonio_digitos`) | = |
| 26 | as regras do CLAUDE.md; a regra 6 | = ; ⚠ **o Context7 não indexa o PostgreSQL 17** (só 15, 16, 18 e `current`): as citações vieram direto de `postgresql.org/docs/17` (§3, decisão 2 e 3) | = · ⚠ |

**Achados que o cabeçalho da ordem não tinha:**

- **(a)** a desativação do kit passa pelo `update` que grava o `payload` inteiro (fato 13) — um
  gatilho `update of payload` ingênuo, que revalidasse todo UPDATE, **impediria desativar um kit
  órfão pela tela**. O gatilho confere a ENTRADA na orfandade (decisão 3).
- **(b)** o errcode `23503` já é reaproveitado por um gatilho de quase-FK
  (`operador_filiais_deriva_membership`, `0156:120-131`), sem ramo em `erros.ts`; e o ramo de FK de
  `erros.ts` casa só o texto `foreign key`. A recusa do kit nasce com frase própria e ramo próprio
  (decisão 3).
- **(c)** `scripts/smoke/cobertura.test.mts` e `integridade_alarme.sql` cravam 12 e o arquivo
  `0158` (fato 14): mudam no commit do núcleo, provando a mesma coisa.

---

## 2. O censo dos escritores e leitores das onze (o orçamento da F67 — a fase NÃO o executa)

### 2.1 SQL (corpo vigente, `corpo-vigente.mjs`)

| função | vigente em | escreve |
|---|---|---|
| `apagar_ativo` · `apagar_item` | `0082` | INSERT `eventos_admin` |
| `apagar_ativos_conflito_filiais` | `0132` | INSERT `eventos_admin` |
| `apagar_movimentacao` | `0090` | INSERT `eventos_admin` |
| `forcar_estado_ativo` | `0110` | INSERT `eventos_admin` |
| `forcar_saldo_item` | `0084` | INSERT `eventos_admin` |
| `resetar_acervo` · `resetar_itens` | `0089` | INSERT `eventos_admin` |
| `import_gravar_trilha` | `0131` (`:655`) | INSERT `import_logs` |

**9 distintas**, 1 assinatura cada, `prosrc` idêntico entre produção e ensaio. Nenhuma função
escreve nas outras nove; `update`/`delete` direto sobre qualquer das onze: **zero** no repositório
(os `insert` de topo são seeds de migration: `0007` motivos, `0114` tipos_item, `0139` as quatro do
import). **Leitores SQL:** `rel_por_motivo_filiais` e `rel_resumo_filiais` (`0143:232,265`, `left
join motivos mo on mo.codigo = m.motivo`) e `checagens_integridade_nucleo` (`0158`, `eventos_admin` e
`import_logs` só para o backup órfão). Nenhum `setof` de uma das onze, nenhum `to_jsonb(<linha>)`
delas, nenhuma view sobre elas.

### 2.2 TypeScript e scripts

- **Escritores em `src/lib/actions`**: `tipos-item.ts:104`, `admin.ts:733` (motivos), `kits.ts:64`
  (e o update `:100-103`), `senhas.ts:161` (e o update `:93-96`, `ultimo_uso`), `relatorios.ts:143`,
  `unidades-apelidos.ts:62`; `eventos_admin` só por `auditoria-registro.ts:30` (15 chamadas de
  `registrarEventoAdmin`); `admin.ts:610` em `filiais` (a nota F62).
- **Scripts**: `seed.ts:1525` (`eventos_admin`), `smoke/persona.ts:80` (`eventos_admin`),
  `manutencao/gerar-errata-truncamento.ts:89,229` (`relatorios_gerados`), `reset.ts:75-78` (apaga
  `eventos_admin`), `perf/medir.mjs:233,244,254` (leitura). `db/restaurar.mjs`: nenhuma das onze.
- **Leitores**: 44 cadeias `.from('<uma das onze>')` em `src/**`, todas com lista explícita de
  colunas; as formas F58 estritas (`formas/{tipos-item,motivos,admin,kits,eventos-admin,
  relatorios-gerados,vocabulario-import}.ts`); a nuance do fato 10 (duas leituras sem descritor).

### 2.3 Roteiros

A tabela do fato 8, exata (medida um a um): `tipos_item` 6 INSERTs em 4 roteiros · `motivos` 4/3 ·
`kits_modelos` 1/1 · `senhas_acesso` 2/2 · `import_logs` 6/4 · `relatorios_gerados` 3/3 ·
`import_prefixos_patrimonio` 1/1 · `import_termos_categoria` 3/1 · `import_termos_estado` 3/1 ·
`unidades_apelidos` 7/1 · `eventos_admin` 2/2 · `filiais` 22/10. **Com o default, nenhum deles
muda** — a sabotagem E é o CI verde sem tocá-los.

---

## 3. O desenho e as onze decisões

### Decisão 1 — as migrations

Três, nesta ordem (nome-sem-prefixo inédito, conferido contra os 160):

| # | arquivo | classe | o quê |
|---|---|---|---|
| 1 | `0162_empresa_no_vocabulario.sql` | ADITIVA | `empresa_id` nas seis do VOCABULÁRIO: `import_prefixos_patrimonio`, `import_termos_categoria`, `import_termos_estado`, `unidades_apelidos`, `tipos_item`, `motivos` |
| 2 | `0163_empresa_nos_registros.sql` | ADITIVA | `empresa_id` nos cinco REGISTROS: `kits_modelos`, `senhas_acesso`, `relatorios_gerados`, `import_logs`, `eventos_admin` |
| 3 | `0164_kit_motivo_da_empresa.sql` | ADITIVA | a função `kit_motivo_da_empresa()` e o gatilho `kits_modelos_motivo_da_empresa`; `create or replace` de `checagens_integridade_nucleo()` com a 13ª peça |

Cada tabela das duas primeiras: `add column empresa_id uuid not null default public.empresa_legada()
references public.empresas (id)` (a forma EXATA da `0160`/`0161`) + `comment on column` com a data, o
motivo e *"o default cai na F67"*. **Sem `update`** (em letras grandes no cabeçalho, com o porquê:
aqui NENHUM gatilho barraria o `update` ingênuo — fato 7 —, e só o `xmin` provaria que ele não
houve), **sem `set not null` separado, sem índice, sem constraint existente tocada** (decisão 2 do
Johnny: a PK de `motivos`, a FK `movimentacoes_motivo_fkey` e as PKs naturais do import são da F65),
**sem policy tocada**.

**A ordem das tabelas** segue a ordem em que o app toma os locks, como na F63: o vocabulário do import
é LIDO antes de qualquer escrita que valide motivo; `tipos_item` é pai de `itens` (FK conferida ao
criar item) e `motivos` é pai de `movimentacoes` (FK conferida no caminho quente), então vêm por
último na `0162`. Na `0163`, `eventos_admin` é a última: as RPCs destrutivas e o app a gravam no fim
de cada operação (depois do acervo e de `import_logs`). As onze são frias (fato 3); o ALTER dura
milissegundos por tabela.

### Decisão 2 — o lock

`set lock_timeout = '2s';` no topo e `reset lock_timeout;` no fim, **sem `begin`/`commit`** — a forma
da F63 (decisão 2 do `PLAN-F63.md`), conferida de novo na doc do PG 17: *"time limit applies
separately to each lock acquisition attempt"*; `SET LOCAL` fora de transação *"emits a warning and
otherwise has no effect"* (o CI aplica com `psql -f`, sem `-1`). O `apply_migration` do MCP é uma
transação com o ledger (medido na F63): lá a migration é atômica; no CI, não (o rollback usa `if
exists`). **Se o lock não vier:** registrar e repetir, no máximo três tentativas em 30 minutos, sem
subir o timeout e sem matar sessão do app; depois da terceira, parar o apply daquele banco (PR
aberto, sem merge, o comando no topo do relatório). `eventos_admin` e `relatorios_gerados` recebem
escrita do app a qualquer hora, mas a escrita é um INSERT curto: o ALTER espera no máximo 2 s por ela.

### Decisão 3 — o gatilho do kit

- **A regra** (a ficha, e o prompt): se o `payload` tem motivo, tem de existir linha em `motivos` com
  esse `codigo` **e o mesmo `empresa_id` do kit**, ativa ou não (o fluxo re-filtra ao aplicar —
  `aplicar-kit.ts:54-69`). Senão, recusa.
- **"Tem motivo"** = `payload->>'motivo'` não nulo e não vazio depois de `btrim`. Sem a chave, com
  `null` JSON ou com texto vazio/só espaços = **sem motivo** — o mesmo que o Zod normaliza
  (`textoOpcional`: `null`, `''` e só-espaços viram ausente). A comparação com `motivos.codigo` é pelo
  valor **exato** (sem `btrim`): é o que o fluxo de aplicação compara (`motivosDoTipo.includes(...)`).
  O caso `null` JSON é provado no roteiro, não só pela doc (a doc não o frasea — frente (g)).
- **Quando confere — a ENTRADA na orfandade** (achado (a)): no INSERT, sempre; no UPDATE, só quando o
  motivo (o texto de `payload->>'motivo'`) ou o `empresa_id` MUDAM (`is distinct from`). Desativar
  (`ativo = false`), renomear ou editar outro campo de um kit que já estava órfão **passa** — é o
  que a tela faz (`atualizarKit` reenvia o `payload` inteiro). O gatilho impede que um kit ENTRE
  na orfandade; a checagem nova acusa o que já está nela (decisão 4). É o idioma de uma constraint
  `not valid`: o novo é conferido, o existente é denunciado.
- **`before insert or update of payload, empresa_id … for each row`**: `update of` limita o disparo
  às duas colunas que podem mudar a resposta (a doc do PG 17: o gatilho de coluna dispara quando a
  coluna está no `SET`, mesmo sem mudar o valor — por isso a comparação `old`/`new` DENTRO da
  função, e não só o `update of`).
- **`security invoker`**, com `set search_path = public` (o molde de `vocabulario_unidades_guarda`,
  `0139`) e nomes qualificados. Por quê: quem grava kit é o ADMIN pela sessão (policy `e_admin()`) ou
  o dono (roteiros, migrations); `motivos` é legível pelo piso (`leitura operador`, `0070`); o
  service role atravessa RLS. Invoker não entra em `k_secdef`, não entra na tabela-verdade de
  `definer_sem_tenant.sql` e não soma WARN de definer executável no advisor. Depois da F66 o admin da
  empresa X vê os motivos da X — a resposta continua certa. `revoke all … from public, anon,
  authenticated` na função, como a vizinha (ela só é chamável como gatilho).
- **O errcode e a mensagem:** `23503` (`foreign_key_violation`: é a semântica de "referência
  inexistente", e a `0156` já o usa para um quase-FK por gatilho), com a frase PRÓPRIA *"O motivo
  deste kit não existe na empresa do kit."* — que não contém `foreign key` (o ramo genérico de FK de
  `erros.ts` não a pega) nem nenhuma grafia de outro ramo de `MSG_SQL`. Um ramo novo em `MSG_SQL`
  (`kitMotivoForaDaEmpresa`, com a gêmea sem acento) e em `traduzErroBanco`, no mesmo commit da
  migration: *"O motivo escolhido não está cadastrado para a empresa deste kit. Escolha outro motivo
  ou deixe o kit sem motivo."* Nenhum valor (código do motivo) na mensagem nem no `detail`.
- **Nome:** função `public.kit_motivo_da_empresa()`, gatilho `kits_modelos_motivo_da_empresa`.

### Decisão 4 — a checagem nova

- Chave **`kit_motivo_orfao`**, a 13ª peça de `checagens_integridade_nucleo()`, no MESMO idioma das
  12: `return query with d as (…) select 'kit_motivo_orfao'::text, count(*)::bigint,
  coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;`, acrescentada DEPOIS
  da 12ª, antes do `end;`.
- Conta **todo** kit (ativo ou não) com motivo (a mesma definição do gatilho) sem linha em `motivos`
  de mesmo `codigo` e mesmo `empresa_id`. Todo kit, e não só o ativo, porque o gatilho não confere a
  reativação de um kit que já estava órfão (o motivo não mudou) — a checagem é quem não deixa essa
  orfandade calada. Um kit órfão desativado continua contando; a saída é corrigir o motivo (a
  edição passa pelo gatilho) ou tirá-lo.
- **Amostra:** o `id` do kit (`k.id::text`) — nenhum dado pessoal, nenhum código de motivo.
- **Curado em `CHECAGENS`** (`dev.ts`): nome *"Kit com motivo que não existe"*, descrição *"Modelo de
  kit cujo motivo não está cadastrado na empresa do kit. Ao aplicar o kit, o motivo é descartado;
  corrija o motivo no kit ou deixe-o sem motivo."*
- **As 12 peças antigas ficam byte a byte.** O corpo da `0164` é o da `0158` com o 13º bloco (e o
  comentário dele) inserido antes do `end;`, e nada mais. Três provas: (1) na mesa, o corpo vigente
  da `0164` MENOS o bloco novo é IGUAL ao da `0158`, byte a byte; (2) no CI, o md5 de cada peça
  (`return query … from d;`) do núcleo vivo é o mesmo da impressão antes; (3) nos dois bancos, a
  impressão antes × depois (`nucleo.md5_por_peca`) com as 12 chaves iguais.
- `create or replace` preserva dono e ACL (a `0138` fechou a função; a `0158` não reemitiu grants):
  a `0164` também não os reemite — a classe `grant_func` da paridade fica igual, e a prova é a
  impressão das 11 classes.

### Decisão 5 — o rate-limit

- `entrarComSenha` lê `{ data: excedeu, error: erroContador }`. Com `error`: **recusa** —
  `registrarFalha({ escopo: 'senhas.contador-de-tentativas', erro: erroContador })`, **sem `ctx`** (o IP
  é dado pessoal e o funil redige por valor, e nenhum padrão dele casa um IPv4 — frente (c); o funil
  nunca grava `details`/`hint`, onde um IP poderia aparecer), e devolve *"Não foi possível conferir
  a senha agora. Tente de novo em instantes."* — genérica: a recusa acontece ANTES de qualquer
  leitura de senha, então não revela se a senha existe (nem se foi revogada). Nenhuma leitura de
  `senhas_acesso`, nenhum `verificarSenha`, nenhum cookie.
- `data === true` → "Muitas tentativas…" (hoje); `false` → segue.
- O comentário das linhas 60-62 muda e aponta a ata da F64, que reverte a X4.
- **O teste de mesa** (`src/lib/actions/senhas-rate-limit.test.ts`, novo): `entrarComSenha` com
  `next/headers`, `next/navigation`, os clients e `senha-sessao` simulados (o molde de
  `auth/acesso-cargo.test.ts`: `vi.hoisted` + `vi.mock` + `await import`), nos três casos; o
  `error` prova: recusa, `verificarSenha` não chamada, `senhas_acesso` não lida, `cookies().set` não
  chamado, `registrarFalha` chamado uma vez com o escopo e SEM o IP em lugar nenhum do argumento.
- **A trava estática** (`senhas.test.ts`, que já é a trava de fonte de `senhas.ts`): o corpo de
  `entrarComSenha` desestrutura `error` da chamada de `registrar_tentativa_senha` e NÃO tem a forma
  `const { data: excedeu } = await chamarRpc(` — com o caso sintético que acusa a volta.
- **Não muda** (F68): a varredura linear, a leitura `ativas`, a rota, as cinco recusas.

### Decisão 6 — a trava do lote 2

- **A fonte única das onze:** `k_lote2` em `supabase/tests/catalogo_policies.sql`, ao lado de
  `k_lote1`, com o motivo.
- O bloco 5 ganha, **sem mexer em 15a/15b/15c** (as mutações da F63 derrubam `15b` pelo rótulo, e o
  describe 12 lê o texto delas):
  - **15d** — `k_lote2 ⊆ k_negocio`, disjunta de `k_lote1`, e `k_lote1 ∪ k_lote2 ∪ {filiais} =
    k_negocio` (nenhuma tabela de negócio fica sem lote);
  - **15e** — cada uma das onze de `k_lote2` na forma de 15b (coluna visível, `uuid`, `not null`, FK
    VALIDADA para `empresas(id)`, default preso a `public.empresa_legada()` pelo `pg_depend` e que é
    só a chamada, sem `force`). O ✗ nomeia a tabela e o defeito. **Hoje reprova pelos onze nomes.**
  - **15f** — **a pendência vira reprovação**: nenhuma tabela de `k_negocio` sem `empresa_id`. A
    lista de infra continua nomeada, cada uma com o motivo, em `k_infra` (e a asserção 1a já reprova
    tabela não classificada).
  - 15c continua "toda tabela de negócio que TEM a coluna, fora do lote 1" — passa a ver as onze
    também (redundante com 15e de propósito: a derivada do catálogo não depende de lista).
- `catalogos-seguranca.test.ts` ganha o **describe 13** (irmão do 12): `k_lote2` são as onze da ficha,
  disjunta de `k_lote1`, e a união com `filiais` é `k_negocio`; os rótulos 15d/15e/15f literais num
  `assert_zero_de`; o default pelo `pg_depend`; e os roteiros da F64 que listam as onze listam
  EXATAMENTE `k_lote2`.

### Decisão 7 — a trava "ninguém lê `empresa_id`" no lote 2

- **TS** (`empresa-acervo-sem-leitura.test.ts`, estendido): o universo passa a `k_lote1 ∪ k_lote2`
  (dezenove), lidos de `catalogo_policies.sql`. As cadeias `.from('<uma das dezenove>')…` e os
  descritores de forma não citam `empresa_id`; a catraca do literal continua igual (nenhuma
  ocorrência nova em `src/**`). Casos sintéticos novos: `.eq('empresa_id', …)` sobre `eventos_admin`,
  `.select('id, empresa_id')` sobre `senhas_acesso`.
- **Disco** (o mesmo arquivo): o corpo vigente de nenhuma função lê `empresa_id` de uma das dezenove,
  **fora das duas exceções nominais**: `kit_motivo_da_empresa` e `checagens_integridade_nucleo`, e
  nelas SÓ em comando que toque `kits_modelos`/`motivos` (a leitura do kit). Caso sintético: um corpo
  lendo `motivos.empresa_id` que não seja uma das duas → acusa; as duas exceções passam.
- **Catálogo** (15g–15i de `catalogo_policies.sql` e o bloco 6 de `empresa_no_vocabulario.sql`): nenhuma
  policy das onze cita `empresa_id` (universo 22); nenhuma função de `public` lê `empresa_id` junto de
  uma das onze — fora das exceções, a função inteira; NELAS, por COMANDO, como no disco (revisão
  adversarial, ata F64 (h)) —; nenhuma view; e a auto-sabotagem (uma policy de `tipos_item` citando a
  coluna, uma função lendo `motivos.empresa_id`, e a função do gatilho com um comando a mais lendo
  `eventos_admin.empresa_id`, na transação desfeita) é acusada. O predicado é ÚNICO, em `_asserts.sql`
  (`pg_temp.leitura_de_empresa_do_lote`, sobre o léxico `pg_temp.sql_so_codigo`).
- **A lista das exceções mora numa fonte só:** `k_leitura_integridade` (e, ao lado, `k_tabelas_leitura_kit`
  — as tabelas que elas podem ler) em `supabase/tests/catalogo_policies.sql`; a trava TS as LÊ de lá
  (como lê `k_lote1`), exige que sejam exatamente as duas, e o describe 13 amarra as cópias do roteiro.

### Decisão 8 — o injetor

Entram **sete** mutações (teto 131 → **138**, no número exato, com o porquê datado em
`mutacoes.test.mts`), cada uma derrubando uma trava desta fase que é ESTADO DE BANCO (nenhum teste de
mesa a derruba):

| id | o que quebra | quem acusa |
|---|---|---|
| `f64-lote2-default-literal` | o default de `motivos.empresa_id` vira o literal da WAP | `15e` |
| `f64-lote2-sem-not-null` | `drop not null` em `eventos_admin` | `15e` |
| `f64-lote2-fk-not-valid` | a FK de `senhas_acesso` recriada `not valid` | `15e` |
| `f64-lote2-sem-coluna` | `drop column empresa_id` em `import_termos_estado` | `15e`, `15f` |
| `f64-kit-sem-gatilho` | `drop trigger kits_modelos_motivo_da_empresa` | o roteiro do kit (motivo inexistente aceito) |
| `f64-kit-gatilho-sem-empresa` | a função do gatilho confere o código e esquece a empresa | o roteiro do kit (motivo da empresa B aceito) |
| `f64-checagem-sem-empresa` | a 13ª peça confere o código e esquece a empresa | o roteiro do kit (o kit com motivo da empresa B não é contado) |

Quarentena continua em 2 (2/140 < ⅓). As quatro primeiras são a sabotagem A no CI.

### Decisão 9 — o instrumento

`docs/f64-evidencias/impressao-vocabulario.sql`, **o mesmo texto antes e depois**, com UM parâmetro
declarado (o **corte**, como na F63: o `xmin` do snapshot no "antes", `pg_snapshot_xmin(
pg_current_snapshot())`, que não consome xid e roda só-leitura). **A diferença de método:** a chave e
a ordem de cada linha saem da **PK lida do catálogo** (`pg_constraint.conkey`, `contype = 'p'`), como
um `jsonb` array dos valores das colunas da PK na ordem de `conkey`; a comparação de `jsonb` é
determinística (números numericamente, textos pela collation do banco, arrays elemento a elemento —
PG 17 §8.14.4). A saída imprime a PK lida (nome de coluna é código), então uma PK que sumisse
apareceria como `SEM PK`. O `md5` do conteúdo usa a mesma ordem.

**O critério que separa atividade normal de reescrita** (o da F63):
- `relfilenode` igual — **sem exceção**, nos dois bancos;
- ensaio (sem tráfego): os dois md5 **idênticos**;
- produção: idênticos, **ou** diferentes com `0 < janela < linhas` e a diferença explicada só pelas
  linhas da janela (contadas e declaradas). **`janela = linhas` é backfill** → rollback imediato.
  `linhas` diferente só se explica por insert/delete do app (a janela conta os inserts).

### Decisão 10 — o describe 5 e o 12

- **Describe 5:** a régua textual já compara contra `k_negocio` menos `filiais` — as onze estão no
  universo desde a F63; nada muda na régua. Muda o comentário (a F64 põe a coluna nas onze) e a
  asserção do cabeçalho de `isolamento_tenant.sql`: ele tem de dizer que a F64 **completou** as 20 de
  `k_negocio` e que a leitura é da F66 (antes exigia "F64 para as restantes").
- **Describe 12** fica como está (o lote 1); o **describe 13** é o irmão dele para o lote 2
  (decisão 6).
- `isolamento_tenant.sql`: só o cabeçalho (a 9k é derivada do catálogo e vê as onze sozinha).

### Decisão 11 — a ordem do alarme

Entre o apply da `0164` em produção e o merge, o banco devolve `kit_motivo_orfao` e a `main` ainda
não a conhece: uma Parte B nessa janela abre a issue *"checagem que a política não conhece"*
(`alarme.mjs:48-57`; a sabotagem G prova). A ordem da Frente G encurta a janela ao mínimo:
**apply de produção → a impressão "depois" e a verificação → o smoke a partir da branch (que já
conhece a chave) → o conferidor → merge imediato** → deploy → a Parte B disparada à mão. A agendada
das **06:43** só cai na janela se o apply de produção acontecer de madrugada — não acontece: se o
conector voltar tarde, o apply de produção espera o dia seguinte depois das 06:43. Se uma Parte B
ainda assim abrir a issue: registrar hora e run, **não** mexer na linha de base, seguir para o merge;
a Parte B seguinte (com a `main` nova) a fecha, e a conferência pós-deploy confirma.

---

## 4. As migrations, a ordem de apply e a ORDEM DE ROLLBACK

**Apply:** `0162` → `0163` → `0164`, cada uma pelo `apply_migration` do MCP com o `name` sem o
prefixo (`empresa_no_vocabulario`, `empresa_nos_registros`, `kit_motivo_da_empresa`), **ensaio
primeiro**, dentro de 24 h do commit das migrations (sonda de deriva).

**Rollback — o inverso, num arquivo só, `supabase/rollback/F64-desfaz.sql`** (ensaiado no CI por
`supabase/tests/f64_rollback.sql`):

1. (`0164`) `drop trigger if exists kits_modelos_motivo_da_empresa on public.kits_modelos`; `drop
   function if exists public.kit_motivo_da_empresa()`; `create or replace function
   public.checagens_integridade_nucleo()` com o corpo da `0158` **byte a byte** e o `comment on
   function` da `0158` (a prova: o md5 do `prosrc` volta ao de antes);
2. (`0163`) `drop column if exists empresa_id` em `kits_modelos`, `senhas_acesso`,
   `relatorios_gerados`, `import_logs`, `eventos_admin`;
3. (`0162`) o mesmo em `import_prefixos_patrimonio`, `import_termos_categoria`,
   `import_termos_estado`, `unidades_apelidos`, `tipos_item`, `motivos`.

Dentro de cada migration, as tabelas saem na MESMA ordem do apply — a ordem em que o app toma os
locks — e só ENTRE as migrations a ordem é a inversa (o molde de `F63-desfaz.sql`: tomar os locks na
ordem do app evita o ciclo de espera com uma escrita em curso).

Com `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit` (quem roda decide a transação). O
ledger não é reescrito. `drop column` não reescreve (a coluna fica `attisdropped`); a FK e o
comentário caem junto. **Entre fases:** o rollback da F63 e o da F62 exigem o da F64 ANTES —
`f63_rollback.sql` e `f62_rollback.sql` passam a rodar `F64-desfaz.sql` antes dos deles (para a F62 é
necessidade: ela derruba `empresas` e `empresa_legada()`, onde a F64 pendura 11 FKs e 11 defaults;
para a F63 é a regra 10 — o inverso do apply entre fases —, e a prova é o roteiro verde). Num banco
vivo, o rollback roda pelo `execute_sql` com o conteúdo EXATO do arquivo — a única exceção ao
"`execute_sql` só leitura", e só num desfecho ruim.

A prova do ensaio: o roteiro compara uma impressão de catálogo das onze tabelas (colunas visíveis,
constraints, gatilhos, índices, policies, RLS/force) + o md5 do `prosrc` do núcleo + a existência da
função do gatilho, **depois do rollback**, com a mesma impressão tirada no CI **antes da `0162`**
(medida no push das travas vermelhas, que ainda não tem as migrations, e gravada como constante).

---

## 5. As travas e as provas (sabotagens A–I)

| peça | onde | nasce |
|---|---|---|
| lote 2 (15d/15e/15f) — sabotagem A | `supabase/tests/catalogo_policies.sql` + describe 13 | **vermelha** no CI pelos onze nomes (push 1); as quatro mutações 15e no injetor |
| o instrumento na PK natural — sabotagem B | `supabase/tests/empresa_no_vocabulario.sql` (fixture com PK `text`; as quatro sem `id`) | com as migrations |
| o kit — sabotagem C | `supabase/tests/kit_motivo_da_empresa.sql` (novo) | **vermelho** no CI (push 1: o gatilho e a chave não existem) |
| o rate-limit — sabotagem D | `src/lib/actions/senhas-rate-limit.test.ts` (novo) + `senhas.test.ts` | **vermelho** na mesa (push 1) |
| o default — sabotagem E | `empresa_no_vocabulario.sql` + os roteiros do fato 8 sem edição | com as migrations |
| ninguém lê — sabotagem F | `empresa-acervo-sem-leitura.test.ts` (TS e disco) + `empresa_no_vocabulario.sql` (catálogo) | verde no mesmo commit (varredura), casos sintéticos acusando |
| a chave nova e o alarme — sabotagem G | `scripts/smoke/cobertura.test.mts` (a chave nos três lugares, vermelha no push 1) + `alarme.test.mts` (a linha de base de hoje × a nova) + a prova das 12 peças | vermelha na mesa (push 1) |
| o rollback — sabotagem H | `supabase/tests/f64_rollback.sql` (novo) + `f63_rollback.sql` e `f62_rollback.sql` rodando o da F64 antes | a impressão pré-`0162` medida no push 1 |
| nenhum escritor mudou — sabotagem I | `empresa_no_vocabulario.sql` (o md5 do `prosrc` das 10 funções contra a constante do CI) + a impressão nos dois bancos + a mesa (o corpo vigente de cada uma continua na migration de antes) | com as migrations |

Todas as recusas provadas duas vezes (a falha e, como `postgres`, o dado intacto), tudo por
`assert_zero_de`, rótulo literal (o injetor lê por token).

---

## 6. Commits e pushes

Commits pequenos, na ordem da ordem: (1) docs — a ordem + este plano + os instrumentos; (2) travas
vermelhas (catálogo, kit, rate-limit, chave nova, rollback em vazio, ninguém lê); (3) o rate-limit;
(4) `0162`/`0163`; (5) `0164`, a tradução e a chave nos três lugares; (6) os roteiros; (7) os
catálogos e os tipos; (8) o injetor; (9) os documentos; (10) a versão. Cada migration com `npm run
db:lock` no mesmo commit.

**Pushes (cota apertada):** **push 1** = commits 1–2 (CI vermelho de propósito: a evidência das
travas e a impressão pré-`0162` para o rollback); **push 2** = o resto; pushes seguintes só para
consertar o que o CI mostrar e para as correções da revisão adversarial. PR como rascunho desde o
push 1.

---

## 7. SHA de código congelado

*(preenchido na Frente G, passo 3)*

---

## 8. O que este plano NÃO promete

- **Que produção receba a fase nesta run**: as ferramentas do conector foram desligadas; sem elas,
  nada é aplicado e o PR não é mergeado (caminho B no topo do relatório).
- Isolamento entre empresas em qualquer das 20 tabelas (F66/F72); empresa certa para uma linha nova
  de outra empresa (o default é a WAP até a F67); dois motivos, tipos ou termos de mesmo código em
  empresas diferentes (as PKs e os uniques globais ficam até a F65); a porta pública por empresa
  (F68); que o gatilho do kit segure uma escrita que o desligue (`disable trigger` é do dono) — a
  checagem nova é a rede para isso.

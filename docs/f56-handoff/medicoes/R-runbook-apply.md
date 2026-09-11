# R-runbook-apply — o caminho de apply da 0139/0140 (fatos 1, 2, 31, 43)

Medido em 11/09/2026, branch `f56-import-sem-wapismo-e-sem-bomba` (HEAD `ec17868`, um commit à
frente do `ef8a1e4` do cabeçalho — o commit que adicionou a própria ordem de serviço como
`docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md`). `docs/f56-evidencias/` já tem
`A0-linha-de-base.txt` de outro subagente da frente A — não é meu, não toquei.

---

## 1. Fatos confirmados / divergentes

### Fato 1 — migrations da fase, versão, estado do repo

**CONFIRMADO integralmente**, com uma nota de estado (não divergência de conteúdo):

- `package.json` → `"version": "1.60.0"` (linha 3). ✅
- Último arquivo em `supabase/migrations/`: `0138_resumo_integridade_e_rotulo.sql`. ✅
- `ls supabase/migrations/*.sql | wc -l` → **137**. ✅ (a `0029` é gap real, como o cabeçalho diz.)
- `git tag --sort=-v:refname` → `v1.60.0`, `v1.59.1`, `v1.59.0`. ✅
- **Nota de estado**: branch atual é `f56-import-sem-wapismo-e-sem-bomba` (não `main`), HEAD
  `ec17868` = `ef8a1e4` + 1 commit (`docs(f56): a ordem de servico da fase`). Isto é o esperado —
  a ordem já commitou a si mesma antes de despachar os subagentes de medição — e não é uma
  divergência do fato, só um detalhe de timing que o próximo passo (escrever código) precisa saber:
  a branch já existe e já tem um commit de documentação.
- `supabase/migrations/0139*` e `0140*` **não existem ainda** (confirmado por `ls`) — como esperado
  nesta etapa de medição, que não escreve código.
- **0139/0140 são de fato DUAS migrations**, pelo fato 31: a `0139` é aditiva (caminho A), a `0140`
  recria `import_apagar_acervo_filial` com o `delete from public.ativos` (caminho B) — não dá para
  misturar as duas no mesmo arquivo sem herdar o caminho B para tudo.

### Fato 2 — estado do ensaio

**CONFIRMADO** por `execute_sql` direto (`sgmvldiizsrjbxzzpmhh`):

```sql
select 1;                                          -- respondeu
select count(*) from public.ativos;                -- 1602
select id, slug, nome, ativo from public.filiais order by id;
```
→ `1602` ativos; as cinco filiais `matriz/cd-afonso-pena/linhares/serra/eusebio`, **todas com
`ativo = true`** — inclusive `serra` (id 4). Isso confirma a frase do cabeçalho *"o plantio da F55
não ficou"*: o `update … set ativo = false where id = 4` que a F55 tentou plantar (e cuja conexão
estourou) **não persistiu**.

`list_migrations(sgmvldiizsrjbxzzpmhh)` → último item `{"version":"20260910134309",
"name":"resumo_integridade_e_rotulo"}` — bate exatamente com o número que o cabeçalho cita para o
ledger do ensaio. `list_migrations(pbtjcalbmepmrqzprusb)` → último item
`{"version":"20260910134531","name":"resumo_integridade_e_rotulo"}` (produção tem o mesmo nome, dois
minutos depois — o passo 3 da C2, produção depois do ensaio).

Não verifiquei a issue #41 do GitHub (fora do escopo SQL desta mesa e não crítico para o
procedimento de apply); tomo como não confirmada nesta rodada, mas é irrelevante para o
procedimento de apply em si.

**Achado colateral (não pedido, mas relevante para §5 abaixo):** o ledger do **ensaio** tem uma
entrada `0126b_lancamento_regulariza_contadores` que **não existe no ledger de produção nem no
disco do repo** — confirma o achado 3 do `RELATORIO-F54.md` §9 ("a paridade ensaio × produção já
estava quebrada antes"). Isso significa que **a sonda de paridade da §4 abaixo, hoje, já vai achar
uma linha divergente antes mesmo de qualquer apply da F56** — não é uma regressão desta fase, é
estado herdado. Declarar isso ANTES de rodar a sonda evita interpretar esse item como efeito da
`0139`/`0140`.

### Fato 31 — o caminho de apply

**CONFIRMADO por leitura primária** (não posso reproduzir a sondagem do classificador com uma
query SELECT-only sem violar a régua desta mesa — mas o fato já tem três precedentes
independentes, documentados nas fontes primárias, e eu os conferi linha por linha):

1. `docs/RUNBOOK-BANCO.md` linha 45 (§"O gate do modo automático"): *"O classificador do modo
   autônomo bloqueia qualquer DDL cujo corpo contenha `delete from public.ativos` ou `delete from
   public.movimentacoes`"* — **essa é a frase que a ata de 09/09 mede como mais forte que o
   comportamento real.**
2. **Precedente 1 — `0048`** (Anexo A, linha 533): *"A `0048` faz `create or replace` de uma RPC que
   TEM `delete from` no corpo, mas o `apply_migration` do MCP não a barrou (o corpo não é executado
   no apply, só redefinido)."*
3. **Precedente 2 — `0064`** (Anexo A, linhas 554-556): mesmo texto, mesma conclusão, para
   `importar_ativos_substituir`/`criar_compra_lote` na F21.
4. **Precedente 3 — `0080`/`0082`/`0083`/`0087`** (Anexo A, linhas 899-903): *"O GATE NÃO BARROU — de
   novo... o `apply_migration` do MCP aceitou as quatro."*
5. **Precedente 4, o mais recente — a sonda de 09/09** (`docs/DECISOES.md:9405-9409`, ata
   *"DIVERGÊNCIA DO RUNBOOK"*): um `execute_sql` com `delete from public.ativos` dentro de um ramo
   `if false then` **passou** contra produção, acervo intacto em 1621. Ata: *"A seção do gate está
   MAIS FORTE que o comportamento real (...) o que ela descreve não é 'DDL que contém a string', é
   'DML que apaga acervo'."*
6. **Mas a `0131`/`0132` em si NÃO foram aplicadas por `apply_migration` do MCP** — Anexo A
   (linha 970): *"Por um script que faz `readFileSync` do arquivo e um POST à Management API,
   conferindo o sha256 contra `migrations.lock.json` antes de enviar"*. O motivo foi o tamanho
   (42.554 + 48.144 bytes, risco de colagem truncada tipo F7E), não o gate.
7. **Por que o script não é mais o molde**: o `SUPABASE_ACCESS_TOKEN` que aquele script usa saiu do
   `.env.local` para o cofre do Windows na F55 (confirmado — ver §6 armadilhas). O molde vivo agora
   é `apply_migration` do MCP direto, como o `docs/f55-evidencias/C2-apply-0138.txt` documenta —
   texto lido por inteiro, ver §2.

**Conclusão do fato**: a decisão (iv) do Johnny (o agente aplica a `0140` via MCP, não entrega para
o SQL Editor) está **alinhada com a medição real do classificador**, não é uma aposta. Mas ela é
"contra a letra do runbook" (linhas 43-47 e 508) — que precisa ser emendada (§4 abaixo). O texto do
`R-IMP-41` na `MATRIZ-REGRAS.md` também está desatualizado pela mesma medição (§4).

### Fato 43 — esta mesa

**CONFIRMADO com uma nuance**:

- Node `v26.4.0` ✅. Claude Code `2.1.222 (Claude Code)` ✅.
- `psql`, `supabase`, `vercel`: nenhum no PATH (Bash e PowerShell) ✅.
- `gh`: **está** em `C:\Program Files\GitHub CLI\gh.exe`, **35** — mas, diferente do que o fato 43
  registra como incerto ("pode não estar no PATH da sessão"), **hoje ele ESTÁ no PATH** — confirmado
  em `Get-Command gh` (PowerShell) e `which gh` (Git Bash), ambos resolvendo para
  `C:\Program Files\GitHub CLI\gh.exe`. Não é uma contradição (o fato já usava "pode"), mas é bom
  registrar que nesta sessão **não é preciso** usar o caminho completo.
- `DB_TYPES_PROJECT_REF`: vazio no ambiente (confirmado por `echo`) → `scripts/gen-types.ts` cai no
  branch `--linked`, que a CLI resolve pelo projeto linkado localmente = **ensaio**
  (`scripts/gen-types.ts:38-44,61-65`, comentário nas linhas 30-31 e 38-44). ✅
  `VERSAO_CLI = '2.109.1'` fixa (linha 59), com o comentário exato sobre a regressão da `2.110.0`
  nas 7 RPCs `rel_*` (linhas 50-51: `p_filial: number` vs `p_filial: number | null`) ✅ — a fase F56
  precisa contar com isso ao rodar `npm run db:types` de produção (passo 5 do "O apply").

---

## 2. O procedimento de apply — passo a passo, MCP `apply_migration`

Molde vivo: `docs/f55-evidencias/C2-apply-0138.txt` (0138, caminho A — sem `delete`, gate não entra
em jogo) + `RUNBOOK-BANCO.md` "Aplicar uma migration" (A e B) + Anexo A (`0064`, `0079-0088`,
`0131/0132`) para o que muda quando o corpo TEM `delete from public.ativos` (caminho B, mas via
MCP). Assinatura exata da tool: `apply_migration(project_id, name, query)` — **`name` é o nome da
migration em snake_case, SEM o prefixo numérico** (confirmado batendo `0131_import_decomposto.sql`
→ ledger `name: "import_decomposto"`; `0138_resumo_integridade_e_rotulo.sql` → ledger
`name: "resumo_integridade_e_rotulo"`, e a própria C2 chama
`apply_migration('resumo_integridade_e_rotulo')`). Para a F56: `apply_migration(ref, 'vocabulario_import_e_filial_apelidos', <sql da 0139>)` e
`apply_migration(ref, 'import_apagar_acervo_desvincula_itens', <sql da 0140>)` — ou o nome exato
que a Decisão 1 do §933 escolher; o que importa é: **sem o `0139_`/`0140_` na frente**.

### 2.0 — Antes de qualquer DDL, nos DOIS bancos

```sql
-- a 0138 é mesmo a última aplicada?
select version, name from supabase_migrations.schema_migrations order by version desc limit 3;

-- as tabelas novas da 0139 NÃO existem ainda (evita overwrite silencioso / diagnostica reentrada)
select tablename from pg_tables where schemaname='public' and tablename in ('unidades_apelidos', /* + as que a Decisão 1 escolher */);

-- corpo vigente das três funções que a 0140 vai recriar (baseline ANTES do apply)
select p.proname, pg_get_function_identity_arguments(p.oid) args, length(p.prosrc) len,
       md5(regexp_replace(p.prosrc,'\s+',' ','g')) fp_prosrc
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('import_apagar_acervo_filial','import_revalidar_contagens','importar_ativos_substituir')
order by p.proname;
```

Medido hoje (sgmvldiizsrjbxzzpmhh, ensaio): as três existem, `prosecdef=true` nas três,
`import_apagar_acervo_filial(smallint)` com 1329 bytes de `prosrc`,
`import_revalidar_contagens(jsonb, smallint)` com 2255, `importar_ativos_substituir(jsonb, text,
jsonb, jsonb)` com 7162 — batendo com o que o fato 33 descreve (a orquestradora é a `importar_ativos_substituir`
da `0132`, as duas auxiliares vêm da `0131`). Isto é a baseline para a checagem "só a mudança
pretendida" do passo de diff-review do runbook.

### 2.1 — `0139` (caminho A — aditiva, sem `delete`)

1. `apply_migration(sgmvldiizsrjbxzzpmhh, '<nome_0139>', <sql>)`.
2. Verificação pós-apply (molde C2, adaptado às tabelas/policies da Decisão 1):
   ```sql
   -- as tabelas existem, com RLS ligado
   select relname, relrowsecurity, relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and relname in (/* tabelas da 0139 */);

   -- as policies (uma por verbo, nunca FOR ALL com predicado true fora do desenhado)
   select tablename, policyname, cmd, roles, qual, with_check
   from pg_policies where schemaname='public' and tablename in (/* idem */)
   order by tablename, policyname;

   -- grants (quem pode ler/escrever cada tabela nova)
   select grantee, table_name, privilege_type
   from information_schema.role_table_grants
   where table_schema='public' and table_name in (/* idem */)
   order by table_name, grantee;

   -- contagens do seed (13 apelidos / 5 categorias / 17 estados / 12 formas / 7 prefixos —
   -- os números exatos saem da Decisão 1/5/6; aqui é o MOLDE)
   select count(*) from public.unidades_apelidos;  -- etc., uma linha por tabela de vocabulário

   -- nenhum achado NOVO de segurança
   -- (get_advisors(ref, 'security') — comparar contagem/lista antes x depois, não só o total)
   ```
3. `notify pgrst, 'reload schema';` **se e só se** mudou assinatura de RPC/colunas lidas por
   PostgREST — a `0139` da ficha é só tabela/seed/comentário, então normalmente **não precisa**; mas
   pague o custo baixo e rode assim mesmo (a C2 rodou mesmo com assinatura igual: "barato").
4. Contagens de acervo antes = depois (ativos/movimentações/lancamentos_item/termos_gerados/profiles) —
   a `0139` não toca dado do acervo, só cria vocabulário.
5. Repita 1-4 em `pbtjcalbmepmrqzprusb` (produção) **só depois do `banco-sem-docker` verde no PR** —
   nunca antes (regra do runbook: "migration aplicada não se corrige mais no lugar").

### 2.2 — `0140` (caminho B pelo runbook — recria `import_apagar_acervo_filial`)

Mesmos passos 1, 3, 4, 5 acima, **mais** a prova de transcrição obrigatória entre 1 e 3 (porque o
SQL passou pelo agente, não por `readFileSync`+upload):

```sql
-- PROVA DE TRANSCRIÇÃO — prosrc normalizado do BANCO, para comparar com o do ARQUIVO
select p.proname, pg_get_function_identity_arguments(p.oid) args,
       md5(regexp_replace(p.prosrc,'\s+',' ','g')) as fp_prosrc_banco
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('import_apagar_acervo_filial','import_revalidar_contagens','importar_ativos_substituir')
order by p.proname;
```
Contra, no lado do arquivo (fora do banco, em Node):
```js
import { corpoVigente } from './scripts/db/corpo-vigente.mjs'
const corpo = corpoVigente('import_apagar_acervo_filial(smallint)')  // string entre $$...$$
const fp = crypto.createHash('md5').update(corpo.replace(/\s+/g, ' ')).digest('hex')
```
**Nunca** comparar com `pg_get_functiondef(oid)` inteiro (o Postgres reescreve o cabeçalho — runbook
e fato 31 são explícitos: "que não bate nunca"). Qualquer divergência no `prosrc` → reverter
(`create or replace` de volta ao corpo anterior, capturado no passo 2.0) e não seguir.

Depois, o resto da verificação pós-apply do molde F21/F23 (Anexo A linhas 562-576, 935-948):
```sql
-- as 3 funções: definer, volatile, dono, sem overload
select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile,
       (select count(*) from pg_proc p2 where p2.proname=p.proname and p2.pronamespace=p.pronamespace) as overloads
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('import_apagar_acervo_filial','import_revalidar_contagens','importar_ativos_substituir');

-- grants: a orquestradora EXECUTE só para authenticated; as auxiliares FECHADAS nos 4 papéis
select r.rolname, p.proname,
       has_function_privilege(r.rolname, p.oid, 'execute') as pode
from (values ('anon'),('authenticated'),('service_role'),('public')) r(rolname)
cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('import_apagar_acervo_filial','import_revalidar_contagens','importar_ativos_substituir')
order by p.proname, r.rolname;
-- esperado: importar_ativos_substituir → authenticated=true, os outros dois false para todos os 4
```
```sql
notify pgrst, 'reload schema';   -- a 0140 recria RPC — sempre necessário aqui, diferente da 0139
```
```sql
-- contagens de acervo ANTES = DEPOIS (a 0140 não deve tocar dado — só redefine a função)
select
  (select count(*) from public.ativos) ativos,
  (select count(*) from public.movimentacoes) movimentacoes,
  (select count(*) from public.lancamentos_item) lancamentos_item,
  (select count(*) from public.pendencias_item) pendencias_item,
  (select count(*) from public.termos_gerados) termos_gerados;
```
`get_advisors(ref, 'security')` — comparar a lista inteira, não só a contagem (a C2 mostra o
precedente: 27→28 `security definer` alcançável por `authenticated`, e foi ACEITO porque era o
ÚNICO achado e estava DECLARADO ANTES do apply — regra do runbook, "achado novo → reverter",
onde "novo" é "não-declarado", não "qualquer achado").

### 2.3 — Sonda de paridade ensaio × produção (a query EXATA do runbook)

Rodar nos dois projetos, comparar linha a linha por classe — a query completa (10 classes) está em
`RUNBOOK-BANCO.md:304-353`; reproduzida aqui por inteiro para não haver ambiguidade de qual versão
usar (é a versão NORMALIZADA — nunca `md5(pg_get_functiondef(oid))` cru, que já enganou duas vezes:
CRLF em 25/07 e comentário em 09/09):

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

Classe que divergir → repetir SÓ aquela classe sem `group by` e fazer `except` dos dois lados.
**Antes de reportar divergência em `func`**, testar sem comentários (query em
`RUNBOOK-BANCO.md:367-377`) — é o segundo falso-positivo conhecido.

⚠ **Como medido em 2.0 acima, a classe `func` provavelmente JÁ vai divergir hoje** — não pela 0139/0140,
mas por herança (o `0126b` fantasma do ensaio, e qualquer resíduo de comentário não fechado desde
09/09). **Rode a sonda ANTES do apply também**, para ter a baseline de divergência pré-existente —
senão qualquer diferença pós-apply fica impossível de atribuir.

### 2.4 — Ensaio de rollback (SÓ no ensaio, `begin … rollback;`)

Molde exato (C2, passo 4, linhas 101-119): abrir com contagem "antes" dos objetos que o rollback
vai mexer, aplicar os passos do rollback documentado no rodapé de cada migration, contar "depois",
e confirmar **fora** da transação que nada mudou de fato:

```sql
begin;
  select count(*) ... ;  -- 0 antes: o que a 0140 recria já existe (assinatura, etc.)
  create or replace function public.import_apagar_acervo_filial(...) as $$ ... $$;  -- corpo da 0132/pré-F56
  -- (idem para as outras funções que o rollback da 0140 reemite)
  select count(*) ... ;  -- depois: voltou ao estado anterior
rollback;
```
Depois, **fora** da transação, reconfirmar que as quatro funções continuam com o corpo PÓS-apply
(o ensaio não deixou rastro do rollback simulado) — é exatamente o par de blocos que a C2 exibe nas
linhas 118-119: *"Conferido logo em seguida, FORA da transacao: as quatro funcoes continuam de pe
no ensaio ... — o ensaio nao deixou rastro."*

⚠ **Risco nomeado no critério 32 do prompt**: reemitir o corpo da `0131` DENTRO do rollback da `0140`
**também contém** `delete from public.ativos` (é a mesma função voltando para trás). Se o
classificador barrar esse `create or replace` dentro do `begin…rollback` — mesmo sendo reversível —,
**não force**: registre o bloqueio e deixe o SQL de rollback pronto no handoff, sem tentar
reformular. Pelos quatro precedentes do fato 31, a expectativa é que **não** bloqueie (é o mesmo
padrão: corpo redefinido, não executado), mas é a única etapa do apply em que uma recusa seria
"esperada e sem alternativa segura".

---

## 3. O handoff, se o classificador barrar

Formato herdado do runbook (§"Aplicar migration B", passo 2) e do próprio texto da ordem (linha
908-910):

- **Onde**: `scratchpad/` (não versionado) — nunca em `docs/f56-evidencias/` enquanto pendente.
- **Conteúdo mínimo**: (1) o SQL completo da migration, copiável e rodável de uma vez no SQL Editor;
  (2) o **bloco de conferência** — as mesmas queries de verificação pós-apply do §2.2 acima, prontas
  para colar depois; (3) o diff mínimo contra a função anterior (prova de que a mudança é só a
  pretendida); (4) o comando de rollback, pronto.
- **O que NÃO fazer**: não reformular o SQL para tentar passar de novo (regra explícita do prompt,
  linha 969: *"Não invente caminho de apply alternativo, não force o classificador"*); registrar o
  bloqueio como achado, não como falha silenciosa.
- **Efeito em cascata declarado no próprio prompt** (linha 910, critério 28 linha 837-838): se a
  `0140` ficar presa, **a `0139` sai sozinha** (critério 31 do fato); o passe 2 do smoke (que
  depende da FK corrigida) vira pendência; o resto da fase segue sem esperar.
- **Registro obrigatório**: ata em `docs/DECISOES.md` (formato §4 abaixo) **no momento do
  bloqueio**, não só no relatório final.

---

## 4. Formato de ata e de relatório

### Ata em `docs/DECISOES.md`

Dois formatos coexistem, ambos válidos, escolhidos pelo tamanho da decisão:

**(a) Ata solta** (uma decisão isolada), cabeçalho `## AAAA-MM-DD · <Rótulo curto> · <Título>`, corpo
com bullets `- Contexto:` / `- Decisão:` / `- Motivo:` / `- Reversível? sim/não, como`. Exemplo real
completo, `docs/DECISOES.md:9405-9409` (a própria ata "DIVERGÊNCIA DO RUNBOOK"):
```
## 2026-09-09 · Rollout · ⚠ DIVERGÊNCIA DO RUNBOOK — o gate não disparou, e a medição venceu a frase
- Contexto: ...
- Decisão: ...
- Motivo: ...
- Reversível? a decisão não; o apply sim.
```

**(b) Ata de fase** (várias decisões da mesma ordem de serviço), cabeçalho único
`## AAAA-MM-DD · F<NN> — <Título da fase>`, com um parágrafo em itálico de contexto, seguido de
`### Decisão N — <título>` por decisão, cada uma com `**Contexto.**`/`**Escolha.**`/`**Motivo.**`/
`**Prova.**` em negrito inline (não bullet solto). Molde: `docs/DECISOES.md:9444-9483` (F55, Decisão
1 e 2). Use `⚠` para chamar atenção a um efeito colateral ou risco dentro do próprio parágrafo.

Um `⚠ CORREÇÃO`/ata que revisa uma ata anterior errada **não apaga a anterior** — abre nova entrada
que diz "ESTA ATA FOI CORRIGIDA" no topo da velha e aponta para a nova (exemplo real:
`docs/DECISOES.md:9411-9421` corrigida por `9429-9440`). Preserva o histórico do raciocínio errado —
é dado sobre o processo, não só sobre o resultado.

### Relatório (`docs/RELATORIO-F56.md`)

Estrutura observada em `RELATORIO-F55.md` (777 linhas) e `RELATORIO-F54.md` — moldar a mesma:

1. Título + linha de metadados: `**v<versão>** · migration `<última>` · <data> · branch `<nome>``.
2. Uma citação em `>` de 1-3 linhas dizendo o que a fase MUDA para quem opera (ou "fase invisível").
3. `# 1. O ROTEIRO DO JOHNNY` — **primeiro**, não por último: o que fica pendente para humano, em
   ordem de urgência, cada item com ⚠ se tiver prazo.
4. `# 2. Os números MEDIDOS, lado a lado com o previsto` + `## As N divergências, explicadas`.
5. `# 3. O que mudou, por arquivo e por quê` — por Frente (A, B, C…).
6. `# 4-8` — o que quebrou por desenho, achados que o CI achou sozinho, as decisões e o custo,
   sabotagens com saída real.
7. `# <N>. Os <M> critérios, autoverificados` — tabela `| # | critério | veredito ✅/⚠/❌ | onde |`,
   um por critério do prompt, na MESMA ordem numérica do prompt.
8. `# Escopo e segurança — as duas varreduras finais`.
9. `# O que este relatório NÃO prova` — seção obrigatória, nomeada assim (achados 9/10 do F54, §"O
   que este relatório NÃO prova" de ambos os relatórios).
10. `# Pendências e backlog nomeado` — subseções `## Para a F<NN>` por fase futura que herda algo.

---

## 5. Backlog "Para a F56" (F55 §12) e achados F54 §9/§11 — o que ainda vale

### `RELATORIO-F55.md` §12, "Para a F56 (o import)" (linhas 738-747) — **ambos ainda valem hoje**:

1. **O 413 do `bodySizeLimit` escapa do funil de log.** `actions/importar.ts` já teve os 4 `catch {}`
   vazios extintos (a F55 já fez isso), mas o erro 413 acontece **antes** da Server Action rodar —
   sem `import_logs`, sem `eventos_admin`, possivelmente com backup já subido ao bucket.
   `onRequestError` (`routeType: 'action'`) **pode** capturá-lo, mas isso **não foi verificado** —
   é trabalho aberto para a Frente C do prompt (`conferirTetos`), que já está no escopo da F56.
2. **Cinco RPCs destrutivas quebram por FK** — `resetar_acervo` (34 linhas de `movimentacoes.movimentacao_id`
   em produção) e o import (17 de `pendencias_item`). A F56 ataca **só o import** (decisão i do
   Johnny); as outras 4 seguem no backlog nomeado — **não é escopo desta fase mexer nelas**, é
   preciso só **não regredir** o padrão quando consertar o import (a régua para a próxima fase que
   pegar as outras quatro).

### `RELATORIO-F54.md` §9 (achados 1-3) e §11 (backlog) (linhas 345-403):

1. **Achado 1 = a origem do escopo da F56**: `resetar_acervo` não toca `lancamentos_item` (34
   linhas produção), e *"o import tem a mesma forma do problema com `pendencias_item` (17 linhas).
   Backlog F56"*. **Continua valendo** — é literalmente o que a decisão (i) do Johnny ataca.
2. **Achado 2 — `termos.ts:486` apaga `.docx` sem cópia** (a variante superada de um termo). **Fora
   de escopo da F56** — decisão de retenção de produto, não tocar.
3. **Achado 3 — paridade ensaio×produção já quebrada** (`0126b` fantasma). **Confirmado hoje** (§1
   acima) — ainda presente, sem dono declarado.
4. **§11 backlog "F56 (o import sem bomba)"**: *"as duas RPCs que quebram por FK (achado 1). É a
   fase que já vai mexer no import."* — é a origem textual da decisão (i).
5. **Pendências de infra §11**: *"a fila `0131`→`0132` em produção"* — **já resolvida** (a F55
   aplicou e registrou, confirmado no ledger de produção hoje); *"o `0126b` órfão do ensaio"* —
   **ainda aberta**; *"o runner de roteiros do scratchpad, que substitui a primeira ocorrência de
   `begin;` e tropeça quando ela está num comentário"* — não verifiquei, fora do escopo desta área.

---

## 6. Armadilhas operacionais que afetam a 0139/0140

Extraídas de `docs/RUNBOOK-BANCO.md` (Armadilhas conhecidas, linha 493-500) e dos arquivos de
memória do projeto (`~/.claude/projects/.../memory/`), filtradas para o que toca apply/ensaio/CI:

1. **`ensaio-pausado-migrations-por-api`**: o projeto de ensaio pode pausar sozinho (plano free) — se
   `select 1` não responder, **tente `restore_project` do MCP antes de declarar indisponível** (foi
   aceito na F37). Hoje (fato 2) o ensaio respondeu direto, sem restore — mas não presuma que vai
   continuar assim entre a medição e a run de código. Se cair de novo no meio do apply da 0140 como
   caiu no meio da prova do alarme da F55 (§"O ensaio caiu no meio da prova" em `DECISOES.md:9716`):
   **não force reinício às cegas** — é exatamente a régua de autoproteção do `CLAUDE.md`.
2. **`revoke-de-public-precisa-do-grant-par`**: se a 0140 (ou a 0139) tiver algum `revoke`, ele
   precisa da forma `revoke all on function … from public, anon; grant execute … to authenticated;`
   — **as duas linhas**, sempre. `revoke … from anon` sozinho é no-op (ACL herda de PUBLIC);
   `revoke … from public, anon` sem o `grant` a `authenticated` de volta **passa em produção mas
   quebra o `banco-sem-docker`** (produção tem grant explícito por default do Supabase hospedado; o
   Postgres novo do CI, não). É o tipo de defeito que só aparece no CI, nunca no ensaio-em-produção.
3. **`ensaio-nao-tem-o-empate-do-import`**: o ensaio prova MECÂNICA (a migration aplica), nunca
   SEMÂNTICA que dependa do acervo real. Para o smoke passe 2 (lançamento vinculado + pendência), a
   fixture tem de ser **construída** no ensaio, não presumida — o ensaio não tem o cenário de FK
   presa que existe em produção hoje (Matriz/Linhares/Eusébio/Filial de Teste).
4. **`corpo-vigente-le-comentario-como-sql`**: o script `corpo-vigente.mjs` **remove comentários
   antes** de procurar `create [or replace] function` — uma "receita de rollback" escrita como
   pseudo-SQL comentado no cabeçalho da 0139/0140 (ex.: `-- create or replace function ...`) **engole
   o corpo real** se não fechar com `;`. Regra: **descrever o rollback em prosa**, nunca colar SQL
   comentado no cabeçalho — usar frases como "reemitir a função X com o corpo da 0132", não `--
   create or replace function X …`.
5. **`roteiro-verde-no-ensaio-vermelho-no-ci`**: um roteiro SQL novo para a FK corrigida que dependa
   de "existe uma linha com X" no acervo real do ensaio passa lá e falha no CI (banco vazio) — e
   vice-versa para valores "óbvios" tipo sequência = 1. Construir o cenário com literais dentro do
   próprio roteiro, nunca presumir estado do ambiente.
6. **`env-local-aponta-para-producao`** (agora resolvido, mas mudou nomes): `NEXT_PUBLIC_*` hoje é
   ENSAIO, `SMOKE_*` é produção — o inverso de antes da F55. Qualquer script/teste escrito olhando
   memória de antes de 10/09 vai ler o banco errado.
7. **`credencial-para-script-por-env-file`**: se algum passo do apply precisar do
   `SUPABASE_ACCESS_TOKEN` (ex.: para o script antigo de Management API, que **não é** mais o molde
   — §2 acima), a forma é `node --env-file=.env.local <script>`, nunca `cat`/`Get-Content`/variável
   intermediária. Redação por filtro de texto **falha aberto** (um `awk` que erra o padrão imprime
   tudo — foi exatamente o que vazou 4 credenciais na F55).
8. **`bloqueio-do-classificador-costuma-ser-transitorio`**: se `apply_migration` for bloqueado por
   engano (não pelo gate de `delete`, mas por um falso-positivo do classificador Stage 2), tentar
   **uma** variação de forma (não de conteúdo) antes de concluir bloqueio real — MAS **essa regra
   NÃO vale para operação de credencial** (token, senha): ali, bloqueio se registra e não se
   reformula, nunca.

---

## 7. Como o CI dispara e como ler a falha

`.github/workflows/ci.yml`: `on: push: branches:[main]` **e** `on: pull_request` (dispara em
qualquer PR, sem filtro de path). Dois jobs, ambos `required status check` da `main`:
`verificar` (lint/test/build/tsc/gate de Server Actions) e `banco-sem-docker` (sobe `postgres:17`,
aplica o bootstrap de `supabase/ci/`, todas as 137+2 migrations em ordem, roda TODOS os roteiros de
`supabase/tests/*.sql`, o gate de deriva de tipos e o injetor de mutações).

Em PR, o grupo de concorrência é por `ref` com `cancel-in-progress: true` — um push novo cancela o
run anterior da mesma branch (intencional, só em PR). Ler o resultado:

```bash
gh pr checks <numero-ou-branch>            # visão rápida dos dois checks
gh run list --branch f56-import-sem-wapismo-e-sem-bomba --limit 5
gh run view <run-id> --log-failed          # só as linhas que falharam — não presuma, leia
```
O prompt já manda isto explicitamente (linha 859): *"Você lê a saída com `gh run view --log-failed`
em vez de supor."* `gh` está confirmado no PATH nesta mesa hoje (§1, fato 43) — não precisa do
caminho completo, mas se falhar por qualquer motivo de sessão, o caminho completo é
`"C:\Program Files\GitHub CLI\gh.exe"`.

---

## 8. Propostas para as Decisões da área (com o custo que decide cada uma)

Este fato (R-runbook-apply) não tem uma "Decisão numerada" própria nas 13 do prompt — ele é
transversal (alimenta a Decisão 9, "o conserto da FK", e o passo "O apply" do prompt). Duas
propostas de redação, ambas de custo zero (só documentação, nenhum código):

**(A) Emenda ao `RUNBOOK-BANCO.md` §"O gate do modo automático" (linhas 43-47).**
Texto atual: *"O classificador do modo autônomo bloqueia qualquer DDL cujo corpo contenha `delete
from public.ativos` ou `delete from public.movimentacoes` (...) em qualquer projeto, prod ou
ensaio."* — **medido como falso** quatro vezes (0048, 0064, 0080-0087, sonda de 09/09). Proposta de
texto (linguagem exata para o implementador colar, adaptando o `⚠` para o formato do runbook):

> O classificador do modo autônomo bloqueia a **EXECUÇÃO** de `delete from public.ativos` ou `delete
> from public.movimentacoes` como comando de dados (DML rodando de verdade contra o acervo). Ele
> **NÃO bloqueia a DEFINIÇÃO** — um `create or replace function` cujo CORPO contenha essas strings
> passa livre pelo `apply_migration`/`execute_sql` do MCP, porque o corpo é redefinido, não
> executado no ato do apply. Medido quatro vezes (`0048`, `0064`, `0079`-`0088`, e a sonda de
> 09/09/2026 — `docs/DECISOES.md`, ata "DIVERGÊNCIA DO RUNBOOK"). **Consequência prática:** recriar
> uma RPC destrutiva por `create or replace` PURO (assinatura idêntica) é hoje um caminho que o
> agente PODE percorrer sozinho — a régua que protege o acervo não é o classificador, é a
> verificação pós-apply (prosrc normalizado, contagens antes=depois, advisors sem achado novo). O
> que continua batendo no gate de verdade é `execute_sql`/RPC que **executa** o `delete` — reset,
> apagar ativo, o próprio "Substituir tudo" **rodando**, nunca a migration que o define.

Custo de decidir: **zero código**. O custo real é decidir se, apesar da medição, a casa quer manter
o handoff humano-no-circuito como POLÍTICA (não porque o classificador obriga, mas porque é a régua
de segurança preferida para RPCs que apagam acervo) — isso é decisão do Johnny, já dada como (iv).
A emenda só corrige a DESCRIÇÃO do mecanismo, não muda a política.

**(B) Emenda ao `R-IMP-41` em `docs/MATRIZ-REGRAS.md:226`.**
Texto atual: *"Gate destrutivo do runbook: a RPC tem `delete from ativos/movimentacoes`, então o
classificador do modo automático barra o apply direto em produção — o SQL da migration é entregue
p/ rodar pelo SQL Editor (precedente 0033–0048)"*, veredito `CONFORME-POR-LEITURA`. Esta linha
descreve exatamente a mesma crença que a emenda (A) corrige, e ela cita `0048` como PRECEDENTE do
bloqueio — quando `0048` é, na verdade, um dos precedentes de que o bloqueio **não acontece**
(contradição interna: a prova citada refuta a afirmação da regra). Proposta de texto:

> R-IMP-41 | O classificador do modo automático bloqueia a EXECUÇÃO de `delete from
> ativos/movimentacoes`, não a DEFINIÇÃO de função que o contém — `create or replace` de uma RPC
> destrutiva passa por `apply_migration`/`execute_sql` do MCP (medido em `0048`, `0064`,
> `0079-0088`, `0131/0132`, e a sonda de 09/09). O apply humano-no-circuito (SQL Editor) é POLÍTICA
> da casa para RPCs destrutivas do import/reset/conflito, não uma barreira técnica — decisão
> registrada (ver `docs/DECISOES.md`, ata "DIVERGÊNCIA DO RUNBOOK", 09/09/2026). | `docs/DECISOES.md`
> (ata 09/09); Anexo A do `RUNBOOK-BANCO.md` (`0048`, `0064`, `0079-0088`, `0131/0132`) |
> `RUNBOOK-BANCO.md` §"O gate do modo automático" (emendado) | nenhuma (processo operacional) |
> DOC-DESATUALIZADA → CONFORME-POR-LEITURA (depois da emenda)

Custo: zero código, uma linha de tabela. Vale mudar o veredito de `CONFORME-POR-LEITURA` para
`DOC-DESATUALIZADA` **até** a emenda entrar, porque hoje a linha descreve um mecanismo que a própria
matriz já tem prova (nas migrations citadas) de que não funciona como descrito.

---

## 9. Assinaturas e arquivo:linha para o implementador

- `apply_migration(project_id, name, query)` — `name` em snake_case **sem** o prefixo numérico do
  arquivo (`0139_foo.sql` → `name: 'foo'`). MCP `d2fbe7a3-9c00-4343-9735-951c33b962b2`.
- `get_advisors(project_id, type: 'security'|'performance')` — mesma MCP.
- `scripts/db/corpo-vigente.mjs` — `corpoVigente(assinatura)`, varre `supabase/migrations/*.sql` em
  ordem decrescente de nome, remove comentários, devolve o corpo entre `$$...$$` do último `create
  [or replace] function` daquela assinatura. **Não fala com banco** (testável sem Postgres). Cuidado
  com pseudo-SQL comentado em cabeçalho de migration (armadilha §6.4).
- `supabase/migrations.lock.json` + `npm run db:lock` — trava sha256 (CRLF→LF normalizado) de cada
  migration; **migration nova → `db:lock` no mesmo commit**; migration já travada e editada →
  `db:lock` RECUSA (sai 1, não grava) — a saída é migration NOVA, nunca `--regravar-alterada` (essa
  flag é só para migration que nunca chegou a banco nenhum).
- `src/lib/itens/migrations-f38.test.ts` — segunda lista que toda migration ≥ `0116` precisa entrar
  (`RUNBOOK-BANCO.md:437-438`, "Quem acrescenta migration atualiza DUAS listas").
- Ref produção `pbtjcalbmepmrqzprusb`, ref ensaio `sgmvldiizsrjbxzzpmhh` — únicos dois aceitos por
  `scripts/env-guard.ts` (`REFS_DE_ENSAIO` desde a F55; era `REFS_DE_PRODUCAO` antes).
- `docs/f55-evidencias/C2-apply-0138.txt` — ler por inteiro antes de aplicar (já lido aqui, 120
  linhas, reproduzido no essencial em §2).
- `docs/DECISOES.md:9405-9409` — ata "DIVERGÊNCIA DO RUNBOOK", texto integral no §1 acima.
- `docs/MATRIZ-REGRAS.md:226` — R-IMP-41, texto integral no §8 acima.
- `supabase/migrations/0131_import_decomposto.sql:106-109` — o comentário DENTRO da própria
  migration que assume o caminho B como obrigatório ("O apply é humano-no-circuito") — hoje sabemos,
  pela ata de 09/09, que essa premissa do comentário não é o que o classificador de fato faz. Não é
  para editar (migration já aplicada), mas é bom o implementador saber que o comentário da 0131 está
  na mesma desatualização que o runbook e a matriz.

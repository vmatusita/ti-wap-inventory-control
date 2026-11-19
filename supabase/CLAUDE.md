# CLAUDE.md — supabase/

Carrega quando você lê/edita algo em `supabase/**` (migrations, tests, ci). A regra
transversal — nunca editar migration já aplicada, nova migration exige `npm run db:lock` no
mesmo commit — já está na raiz. Aqui, o detalhe de cada subpasta.

## `migrations/`

- **`migrations.lock.json` é a TRAVA executável (F46).** Mapeia arquivo → sha256 do conteúdo
  normalizado (CRLF→LF). `src/lib/validators/migrations-lock.test.ts` reprova quando uma
  migration travada muda um byte, some, é renomeada, ou quando nasce migration nova ainda não
  travada. Regravado SÓ por `npm run db:lock`, e SÓ ao acrescentar migration — nunca à mão.
- **A janela `estoque.dev_destrutivo`** (GUC local à transação) é o que abre exceção à
  imutabilidade do acervo (trigger `guarda_acervo`, `0081`) — só as RPCs oficiais e a de import
  a abrem, e fecham antes de sair (inclusive no caminho de erro). `movimentacoes`/
  `lancamentos_item` recusam UPDATE/DELETE sempre; `ativos` recusa DELETE fora da janela. A
  marca `.forcado` (`0079`) só é gravável dentro dela.
- **As RPCs por empresa (F67, `0185`–`0193`).** Toda RPC destrutiva, de conta, a mesa e o import recebem `p_empresa uuid`
  como 1º argumento, sem default, e recusam linha/filial/alvo de outra empresa (42501). Uma assinatura nova com o MESMO
  nome nasce ao lado da antiga e a antiga só sai na contração, depois da janela (RUNBOOK, Anexo F67) — nenhuma sobrecarga
  pode ter default que colapse a aridade (o PostgREST resolve pelo conjunto de argumentos nomeados). O cargo dentro das
  `security definer` é o POR EMPRESA (`papel_na_empresa` e as derivadas, `pode_escrever_unidade`); o piso `papel_atual()`
  só vale pareado numa policy (`cargo_por_empresa.sql`, Qa/Qb).
- **A RPC `apagar_ativos_conflito_filiais`** trava o grupo inteiro em dois tempos e serializa
  por `pg_advisory_xact_lock` (`0100`) — não simplifique para um lock único sem reler por que
  (deadlock entre duas sessões travando as mesmas linhas em ordens opostas; ver
  `docs/ARQUITETURA.md` §4.4). Desde a F67 (`0191`) a chave é `(hashtext('conflito_filiais_apagar'), hashtext(empresa))`
  e o grupo é recalculado DENTRO da empresa (as views agrupam por empresa da filial e chave).
- Nome/numeração: prefixo sequencial de 4 dígitos; confira o último número existente antes de criar.
- **A classe no cabeçalho (F63).** A partir da `0159`, todo arquivo abre com `-- classe: ADITIVA | BACKFILL |
  DESTRUTIVA` e fecha com o `ROLLBACK` escrito no rodapé; o classificador (`scripts/db/classificar-migration.mjs`) confere
  contra o que o arquivo executa. Sobrescrever dado vivo exige o bloco de `public.backups_migration` antes do comando
  (receita BACKFILL no `docs/RUNBOOK-BANCO.md`); coluna nova em tabela viva é `add column … not null default
  <não-volátil>`, sem `update`, com `lock_timeout` por `set`/`reset`.
- **`supabase/rollback/`** guarda os rollbacks de fase (fora do ledger e da trava de hash), cada um ensaiado no CI por um
  roteiro `f<N>_rollback.sql`. O de uma fase pressupõe o das fases posteriores (o da F62 roda o da F64 e o da F63
  antes; o da F63, o da F64). Desde a F68, o `F68-desfaz.sql` roda ANTES do `F67C-desfaz.sql` em todos os roteiros de rollback (a porta pública e a
  gestão das senhas por empresa saem primeiro; o ensaio é `tests/f68_rollback.sql`). Desde a F67C, o `F67C-desfaz.sql` roda antes do primeiro `F67B-desfaz.sql` de cada roteiro
  de rollback (o `set default` das 20 primeiro). Desde a F67B, o `F67B-desfaz.sql` roda IMEDIATAMENTE antes de todo `F67-desfaz.sql` dos roteiros (as policies do Storage
  da F67B citam `e_admin_na()`/`empresas_de_admin()`, que o da F67 derruba). Desde a F67, o `F67-desfaz.sql` roda antes dos da F66 para trás, e é idempotente nos DOIS
  estados de produção (só a expansão; expansão + contração) — ele é GERADO das migrations, nunca transcrito
  (`rollback-f67.test.ts` confere a completude).
- **Apply:** pelo conector ou pela Management API, ensaio primeiro (`docs/RUNBOOK-BANCO.md`). **Nunca**
  `supabase db push`, `migration repair` ou `db reset --linked` contra produção ou ensaio: o ledger não
  casa com os arquivos por construção, e quem confere o banco é a sonda de efeito, não o ledger
  (`docs/ADR-003-metodo-de-migration.md`).

- **Nenhuma `empresa_id` tem default (F67C, `0205`–`0207`).** Toda escrita numa das 20 tabelas de negócio DIZ a
  empresa — a 15l de `catalogo_policies.sql` reprova default em qualquer `empresa_id` de `public` (inclusive tabela
  nova), a 15m reprova INSERT numa das 20 sem a coluna no corpo de qualquer função. Função nova que grava no acervo tira a
  empresa do PAI pela ponte `public.empresa_da_filial(<a filial da linha>)` — sem parâmetro novo, sem ler `empresa_id`
  no corpo. Escrever a coluna não conta como lê-la (`pg_temp.sem_lista_de_escrita`, `tests/_asserts.sql`).

## A porta pública (F68, `0208`–`0212`)

- **Duas únicas funções executáveis por `anon`** em todo o `public`: `relatorio_publico_abrir` (confere a senha — bcrypt,
  dentro do banco — e abre a sessão) e `relatorio_publico_dados` (serve os relatórios GERADOS da empresa da sessão, por
  lista branca, sem nome de pessoa). A lista fechada é `k_secdef_anon` em `tests/catalogo_secdef.sql`; qualquer outra
  `security definer` com `execute` para `anon` reprova. A asserção 5 de `tests/seguranca_catalogo.sql` reprova policy que
  cite `anon` ou `public`: a porta NÃO passa por RLS, e sim por função.
- **Duas tabelas deny-all novas:** `sessoes_visualizador` (infraestrutura — sem a `guarda_empresa`; a FK composta à empresa
  da senha a prende àquela empresa) e `porta_tentativas` (o limite de tentativas). Nenhuma policy, nenhum grant: só as
  funções as tocam.
- **`pgcrypto` no bootstrap do CI:** `ci/bootstrap-roles.sql` cria o esquema `extensions` e a extensão, espelhando o
  ambiente gerenciado; a `0208` só CONFERE que ela existe (não a cria).
- Roteiros: `tests/isolamento_viewer.sql` (o visualizador só alcança a empresa da senha e só o gerado) e
  `tests/f68_rollback.sql` (o `F68-desfaz.sql`). O ao vivo pela porta é da F68B.

## `ci/` — o bootstrap do job `banco-sem-docker`

O recorte MÍNIMO do que `supabase start` dava de graça, declarado à vista em vez de escondido
numa imagem de terceiro: `bootstrap-roles/-auth/-storage/-ledger.sql`, aplicados **nesta
ordem**, e `impressao-schema.sql` (a sonda de fingerprint do `RUNBOOK-BANCO.md`).

⚠ **NENHUM grant em `public` aqui.** `supabase start` também não os tem — os roteiros de
`supabase/tests/` plantam os seus próprios grants, e um grant a mais aqui faria
`seguranca_catalogo.sql` passar por um motivo errado (falso positivo mascarando uma policy que
deveria ter falhado).

## `tests/`

Roteiros SQL auto-verificáveis. Rodados por `scripts/db/rodar-roteiros.sh` — ver
`scripts/db/CLAUDE.md` para o motor (injetor de mutações, gate de deriva de tipos).

**Toda fixture numa das 20 diz a empresa (F67C):** sem o default, o INSERT sem `empresa_id` dá `23502`. Num roteiro de
empresa só, `public.empresa_legada()` explícito; num que cria outra empresa, a variável da empresa do pai da fixture.

## O Storage por empresa (F67B, `0194`–`0199`)

- **`termos`** decide pela LINHA de `termos_gerados` (`pode_ler_arquivo_termo`: membro ativo da empresa dela;
  `pode_escrever_arquivo_termo` → `pode_escrever_termo(empresa_id, ativo_ids)`, `coalesce(…, false)`). Objeto sem linha
  não é alcançável pela sessão: a faxina é a ferramenta nomeada `registrar_limpeza_termos_sem_linha` (só a plataforma,
  só arquivos sem linha há mais de 1 hora) + a Server Action que copia e remove com o service role.
- **`backups-import`** decide pela EMPRESA DO CAMINHO (`<família>/empresa-<uuid>/…`, `empresa_do_caminho_backup`) e
  `empresas_de_admin()`. As formas ANTIGAS ficam legíveis só pelo admin da WAP, pela cláusula FECHADA
  `caminho_backup_legado` (decisão 16/11-1) — nunca graváveis. Caminho novo nasce SÓ por `src/lib/storage/caminho.ts`
  (o espelho SQL são os `prefixo_backup_*(uuid, …)`); `caminho.test.ts` varre quem monta caminho por fora.
- A trava de catálogo é `supabase/tests/storage_por_empresa.sql` (blocos T, D, B, E, F, O, L); a da publication do
  Realtime é o §9 de `catalogo_policies.sql` (9c–9e).

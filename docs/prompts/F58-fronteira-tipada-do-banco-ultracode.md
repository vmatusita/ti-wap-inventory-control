# F58 — A fronteira tipada do banco

Ordem de serviço da fase **F58** do `PLANO-MULTIEMPRESA.md` (§5, Bloco D). Fase **só de código**: nenhuma migration,
nenhuma tela nova, nenhum `empresa_id`, nenhuma assinatura de RPC mudada. O que ela entrega é **fronteira**: o
TypeScript volta a conferir o que sai do Supabase — por uma porta única de RPC, por `linhasDe`/`linhaDe` com a forma
conferida por Zod, e por um `erros.ts` cujas frases viram listas nomeadas que um teste confere contra o banco.

O objetivo da ficha cabe numa frase: *uma coluna ausente (`empresa_id`, amanhã) tem de ser erro de compilação, e não
`undefined` silencioso.* E o plano a põe no caminho crítico (§3): *"F58 destrava F60. Sem porta única de RPC, trocar a
assinatura das `rel_*` é 37 pontos à mão."*

---

## Estado de partida — os 20 fatos medidos no disco de hoje (15/09/2026)

> O prompt cita estes fatos **pelo número**. Eles foram medidos contra a árvore e a produção de hoje, não copiados da
> ficha — que foi escrita em 04/09, antes das F50→F57 — e onde divergem dela, a divergência está marcada. O prompt manda
> o agente **remedir antes de aceitar**.

**Onde o projeto parou**

1. `main` em **`86bd77d`** (merge do PR #46), com a tag anotada **`v1.62.0`** nesse commit e a árvore limpa;
   `package.json` em `1.62.0`; produção respondendo `/api/saude` → `versao 1.62.0`, `commit 86bd77d`, `banco ok`.
   Última migration **`0140_import_desarma_fk.sql`** — 139 arquivos `.sql`, `0001`→`0140`, a `0029` é gap real. A F57
   fechou com 201 arquivos e 5.104 testes. **A F58 não tem migration**: o mapa do §11 a marca como "código", e o "Não
   entra" da ficha exclui o gerador e o `database.ts`. Versão da fase: **`1.63.0`**.

**A porta que não existe**

2. `.rpc(` em `src/**`, fora de teste: **37 em 18 arquivos** — o número da ficha, confirmado. `lib/actions/` 22
   (`dev-destrutivo` 6, `admin` 3, `itens` 2, `movimentacoes` 2, `pendencias` 2, `dev` 2, e uma em `compras`,
   `conflitos`, `devolucao-fornecedor`, `importar` e `senhas` — esta pelo client ADMINISTRATIVO); `lib/queries/` 13
   (`itens` 3, `relatorios/itens` 3, `relatorios/movimentacoes` 3, `dev` 2, `dev-destrutivo` 1, `relatorios/estoque` 1);
   `lib/auth/acesso.ts` 2 (`papel_atual`, no caminho de TODA request autenticada, e `pode_escrever_filial`, no das
   guardas de escrita).
   **Uma é dinâmica:** `actions/dev-destrutivo.ts:401-404`, `supabase.rpc(rpc, {…})`, com
   `rpc = bloco === 'acervo' ? 'resetar_acervo' : 'resetar_itens'`.
3. Em `scripts/**`: **17 em 8 arquivos** — 10 em seis `.ts` que rodam por `tsx` (`smoke/fixtures-passe2.ts` 4,
   `seed.ts` 2, `reset.ts`, `env-guard.ts`, `smoke/checagens.ts`, `manutencao/validar-truncamento.ts`) e 7 em dois
   `.mjs`, que não importam TypeScript (`smoke/smoke-prod.mjs` 5, `perf/medir-guarda.mjs` 2). Nos arquivos de teste, 13.
4. **As chamadas `rel_*` em `src/**` são 10, não 8** — e o motivo de a porta devolver o BUILDER se confirma por outro
   caminho que o da ficha: `relatorios/itens.ts:82-85` põe três builders num `Promise.all`; `queries/itens.ts:661-662`
   faz `Promise.all` de um `map` de builders; e `relatorios/estoque.ts:113-118` encadeia `.order('ativo_id').range(from,
   to)` no builder de `rel_estoque_asof`, dentro de `paginarTodos`. As outras cinco são aguardadas direto. **Nenhuma**
   chamada de hoje encadeia `.single()`/`.maybeSingle()` no `.rpc(` — a porta tem de permiti-los, mas não há consumidor
   a preservar.

**As mentiras do gerador — nos dois sentidos**

5. `filialParaRpc` mora em **`src/lib/queries/rpc-filial.ts:33`** (`return filialId as unknown as number`, com a história
   inteira no cabeçalho). 8 chamadores em `src/**` (`queries/itens.ts:140`, `relatorios/estoque.ts:114`,
   `relatorios/itens.ts:83-85`, `relatorios/movimentacoes.ts:47,99,120`) e 1 em `scripts/manutencao/validar-truncamento.ts:90`.
   O `database.ts` de hoje diz `p_filial: number` nas sete `rel_*` que o recebem; a CLI está fixada em `2.109.1`
   (`scripts/gen-types.ts`), e o cabeçalho de `scripts/db/diff-tipos.mjs` fala em "hand-fixes deliberados de
   nulabilidade" que o arquivo atual **não mostra** nessas assinaturas — confira antes de tratar o `database.ts` como
   verdade de nulabilidade.
6. Mais três mentiras de ARGUMENTO fora de `Json`, que a ficha não lista, todas com `null` como valor de domínio:
   `actions/conflitos.ts:288` (`p_backup_path: backupPath as unknown as string` — abaixo do teto não há arquivo de
   backup), `actions/dev-destrutivo.ts:405` (`resetar_acervo`/`resetar_itens`) e `queries/dev-destrutivo.ts:346`
   (`previa_reset`) — `p_filial: filialId as unknown as number`, onde `null` é o alcance GLOBAL.
7. **`as unknown as Json`: 15 — mas só 12 são argumento de RPC.** `importar.ts:678,680,681`, `movimentacoes.ts:354,355,719`,
   `devolucao-fornecedor.ts:120,121`, `pendencias.ts:101,361`, `compras.ts:111`, `itens.ts:225`. Os outros **3 são
   escrita em coluna `jsonb` de TABELA**, que a porta de RPC não alcança: `kits.ts:68` (insert) e `:102` (update) do
   `payload`, e `relatorios.ts:146` (o `dados` do snapshot). A frase da ficha "os 15 `as unknown as Json` somem junto"
   só vale se o mesmo mecanismo cobrir as três escritas.
8. **E as mentiras de RETORNO — que a ficha não cita e que a decisão 1 do Johnny torna perigosas.** O gerador tipa toda
   coluna de `returns table (…)` como não-nula e toda coluna de VIEW como anulável. Medido:
   - `rel_estoque_asof` (corpo vivo na `0134`) devolve `colaborador` e `setor` **NULL** para ativo sem detentor
     (`when not public.status_tem_detentor(…) then null`), e o `database.ts` diz `colaborador: string`, `setor: string`;
   - `papel_atual()` — que roda em TODA request autenticada — devolve null para perfil desativado ou arquivado
     (`auth/acesso.ts:117` faz `(data as PapelUsuario | null) ?? null`), tipado `Returns: papel_usuario`;
   - `rotulo_de_ambiente()` devolve NULL em produção (`scripts/env-guard.ts:138`), tipado `string`.

   **Um schema Zod copiado do `database.ts` lança na primeira linha de ativo em estoque do relatório as-of, e na
   primeira request de um perfil desativado — em produção, por decisão.**

**Os casts de leitura**

9. `as unknown as` aplicado a LEITURA em `queries/`+`actions/`: **22**, a conta da ficha, confirmada linha a linha —
   `queries/ativos.ts` 6 (`352, 491, 590, 638, 672, 694`), `queries/itens.ts` 4 (`494, 542, 751, 842`),
   `queries/movimentacoes.ts` 3 (`287, 416, 736`), `queries/gerados.ts` 2 (`162, 299`), `actions/termos.ts` 2
   (`214, 671`), e um em `actions/relatorios.ts:212`, `queries/compras.ts:309`, `queries/dev-destrutivo.ts:349`,
   `queries/eventos-admin.ts:160` e `queries/termos.ts:62`. Os outros 19 `as unknown as` dessas pastas **não são
   leitura**: 14 são casts de BUILDER (`queries/dev-destrutivo.ts` 7 → `PromiseLike<Pagina>`, `recorte-consulta.ts` 5,
   `queries/ativos.ts:131,150`), 4 são as mentiras de argumento dos fatos 5 e 6, 1 é comentário.
10. Casts SIMPLES sobre dado lido, nas mesmas pastas: **~52, não ~28**. As formas: `(data ?? []) as X[]` (a maioria),
    `data as X | null`, `(data ?? {}) as {…}` sobre retorno `Json` de RPC (seis só em `actions/dev-destrutivo.ts`),
    embed (`r.filiais as FilialEmbed`, `(a.filiais as { nome: string } | null)`), coluna `jsonb` (`r.dados as
    AnySnapshot` em `gerados.ts:330`; `r.snapshot_anterior as SnapshotAnterior | null` em `movimentacoes.ts:142`). Mais
    **8 limítrofes**: spread de linha com cast (`queries/dev-destrutivo.ts:85,178,309`) e coluna estreitada para união
    (`tipo as TipoLancamento` em `actions/itens.ts:391`, `actions/movimentacoes.ts:662` e `actions/pendencias.ts:333`;
    `queries/vocabulario-import.ts:56,61`). Fora das duas pastas: `auth/acesso.ts:117` e
    `app/(app)/dev/acoes-export.ts:139`. **Total: ~74 pontos nas duas pastas (22 + ~52), contra os ~50 da ficha — ~84
    contando os 8 limítrofes e os 2 de fora.** A contagem oficial é a da trava que o agente escrever — ele remede com ela.
11. Onde o compilador **já sabe** e o cast só esconde: `queries/tipos-item.ts:32,62` fazem `(data ?? []) as TipoItem[]`
    sobre `.select('id, slug, rotulo, ativo, ordem')` literal — o tipo inferido pelo `supabase-js` já é esse. Onde ele
    **não sabe**:
    - SELECT montado por concatenação — `'…' + '…'` é `string`, não literal, e a inferência do PostgREST cai:
      `queries/gerados.ts:55-56` e `:291`, `queries/itens.ts:372-374`, `queries/movimentacoes.ts:88-90` e `:635`,
      `queries/relatorios/itens.ts:216-217`, `queries/relatorios/movimentacoes.ts:273`, `queries/termos.ts:21`,
      `actions/termos.ts:143-144`;
    - coluna e retorno `Json`;
    - as **18 leituras de VIEW** — `v_conflitos_filiais` 7 e `v_conflitos_filiais_grupos` 2 em `conflitos.ts`;
      `v_fila_pendencias` 4, uma delas direto em `src/app/(app)/page.tsx:128`; `v_colaboradores_textos` 2;
      `v_colaboradores_consolidacao`, `v_estoque_atual` e `v_pendencias_item`.
12. `select('*')` que devolve linha: **16** — o backup e o export (`queries/dev-destrutivo.ts` 7,
    `queries/import-logs.ts` 6, `queries/conflitos.ts:473,487`) e a ficha do ativo (`queries/ativos.ts:278`,
    `'*, filiais(slug, nome)'`). ⚠ **`z.object` padrão REMOVE a chave que não declara.** Num backup, isso é apagar
    coluna em silêncio — o defeito que a F54 matou —, e na F63 é o backup perdendo o `empresa_id`. E `z.strictObject`
    sobre `select('*')` lança no dia em que uma migration aditiva acrescentar coluna antes de o app novo estar no ar.

**O `erros.ts` e os casamentos por texto**

13. `src/lib/actions/erros.ts`: 421 linhas, **70 `if`** (3 aninhados no bloco "só um desenvolvedor"), **132 substrings**
    de `m.includes(…)`, todas distintas — a ficha contou 63 ramos e ~110. Medido hoje:
    - **10 nomes de objeto** (a ficha diz 8): `lanc_item_ajuste_obs`, `lanc_item_chamado`, `lanc_item_qtd_valida`,
      `lanc_item_estorna`, `itens_nome_uidx`, `itens_nome_chave_uidx`, `ativos_service_tag_sem_patrimonio_uidx`,
      `ativos_patrimonio_service_tag`, `filiais_nome_chave_uidx`, `unidades_apelidos_apelido_chave_uidx`;
    - **8 frases do MOTOR** do Postgres/PostgREST, que nenhuma migration contém: `statement timeout`,
      `canceling statement due to`, `duplicate key`, `unique constraint`, `foreign key`, `violates foreign key`,
      `row-level security`, `permission denied`;
    - **~114 textos NOSSOS** de `raise`, a maioria em PAR com e sem acento — "as mensagens viajam por caminhos
      diferentes", diz o próprio arquivo.

    O `toLowerCase()` está na linha **21** (a ficha diz 20). `traduzErroBanco` tem 85 chamadas em 17 arquivos.
14. **Casamento por texto FORA do `erros.ts`** — a ficha nomeia só o primeiro: `relatorios/versao-snapshot.ts:44` (o
    nome do índice `relatorios_gerados_periodo_filial_versao_uidx`; a ficha diz `:43`), `actions/admin.ts:610` e `:704`
    (`filiais_slug_key`), `actions/admin.ts:732` (`'duplicate'`), `actions/itens.ts:525` e `:700` (`'duplicate'` ou
    `itens_nome_uidx`). Uma lista enumerável que cubra só o `erros.ts` deixa cinco casamentos de fora.
15. **A fonte certa de "a mensagem existe" é o corpo VIVO.** `scripts/db/corpo-vigente.mjs` (F47) devolve o último
    `create [or replace] function` de cada função varrendo as migrations em ordem. Um `grep` nas 139 migrations acharia
    o texto num corpo HISTÓRICO que uma `create or replace` posterior já apagou — e o teste nasceria verde para uma
    tradução morta. Para nome de constraint e de índice, `corpo-vigente.mjs` não basta (ele resolve função): ou se
    replica `create`/`drop`/`rename` em ordem, ou se confere contra o catálogo do banco do CI.

**Zod, supabase-js e o custo**

16. `zod` `^4.4.3` no `package.json`, **4.5.4** instalada; hoje só em `src/lib/validators/**` (17 módulos) e em 4
    actions — **nunca do lado da leitura**. No Zod 4, `.passthrough()` está `@deprecated` (a documentação manda
    `z.looseObject()`/`.loose()`), `z.strictObject()` recusa chave extra, e a issue de erro **não carrega o valor
    recebido** por padrão (`reportInput` desligado). `@supabase/supabase-js` 2.112.4 instalada: `rpc()` é genérico
    sobre `Schema['Functions']` e devolve `PostgrestFilterBuilder`; `overrideTypes`/`.returns<>()` não aparecem em lugar
    nenhum de `src/`. TypeScript 5.9.3. `DbClient = SupabaseClient<Database>` está declarado **duas vezes**
    (`auth/acesso.ts:13` e `queries/relatorios/comum.ts:11`).
17. O harness de TTFB é `scripts/perf/medir.mjs` (F33): só GET, mira a produção por padrão ou `PERF_URL_APP`, e loga
    pela cascata `PERF_*` → `SMOKE_*` → `NEXT_PUBLIC_*`. ⚠ **No `.env.local` de hoje, `SMOKE_*` é PRODUÇÃO e
    `NEXT_PUBLIC_*` é o ENSAIO** (`docs/INVENTARIO-CREDENCIAIS.md` §2): medir um `next start` local sem `PERF_*` loga em
    produção e manda o cookie para um app que fala com o ensaio — as rotas voltam redirecionadas e a medição não vale
    nada. Controles: `/vercel.svg` (piso de rede) e `/ajuda`. O método A/B intercalado está na ata
    `2026-08-10 · F33 · C1 e C7` (ruído de ~10% entre sessões — do tamanho do critério da ficha, por isso a leitura é
    NORMALIZADA pelo controle). O harness **não alcança export nem backup**, que são Server Actions: leitura de lote
    precisa de medida própria.
18. A prova em produção usa `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_ANON_KEY`, `SMOKE_EMAIL` e `SMOKE_SENHA` — a conta
    ADMIN do ritual pós-deploy, sessão com RLS (todo logado ativo lê tudo: o recorte é de LINHA, a forma é a mesma).
    **Não existe service role de produção nesta máquina, de propósito**, e `rotulo_de_ambiente()` só responde à service
    role — a identidade do alvo se confere pelo ref da URL contra `SEED_PROJECT_REF` (o ensaio). Precedente de script
    só-leitura contra produção que importa o motor de verdade de `src/`: `scripts/manutencao/validar-truncamento.ts` — ⚠
    que lê `NEXT_PUBLIC_*` + service role e, desde a troca do `.env.local` na F55, valida o ENSAIO sem dizer.

**O que já existe e serve de molde**

19. Travas de arquitetura que varrem o disco: `src/lib/queries/servidor-apenas.test.ts` (F49),
    `src/lib/queries/erro-engolido.test.ts` (F50 — lista CONGELADA que só encolhe), `src/lib/observabilidade-fonte.test.ts`
    (F55). Travas TS↔SQL que leem migration do disco: `src/lib/colaboradores/chave-sql.test.ts`,
    `src/lib/itens/chave-sql.test.ts`, `src/lib/import/vocabulario-chave-sql.test.ts`,
    `src/lib/relatorios/chave-versao-sql.test.ts`. Utilitário de tipo puro: `src/lib/tipos-estritos.ts`. Funil de falha:
    `registrarFalha` (`src/lib/observabilidade.ts`, porta `server-only`, com a metade pura em `observabilidade-linha.ts`),
    que redige segredo e dado pessoal e **nunca lança**. ⚠ `server-only` LANÇA fora da condição `react-server`
    (cabeçalho de `observabilidade-linha.ts`); o `vitest.config.mts` o aponta para `empty.js`, e
    `scripts/perf/medir-corpos-import.mts` roda com `NODE_OPTIONS=--conditions=react-server`. Lição da F57: varredura de
    disco dentro do corpo do `it` estourou o tempo-limite da suíte — leia o disco na coleta.
20. **O que a F57 deixou para esta fase** (`RELATORIO-F57.md` §11): 19 funções passaram a RECEBER
    `UnidadesEfetivas`/`RecorteDeLeitura`; a F58 muda o que elas DEVOLVEM. `getSaldosItens(filialId | null)` e
    `filialParaRpc` ficaram de fora "de propósito — é da F58". Scripts disponíveis: `npm run lint|test|build|typecheck`,
    `npx tsc --noEmit`, `npm run verificar:actions`, `npm run db:types:diff`, `npm run db:test:mutations`. Sem migration,
    `db:lock`, `db:types`, `db:seed` e `db:reset` não entram.

---

## As duas decisões do Johnny (15/09/2026)

1. **Forma errada LANÇA em produção.** Quando a linha real não bate com o schema, a leitura lança — falha de forma é
   falha de leitura, com `registrarFalha`, o mesmo contrato de `paginarTodos` ("lança com o rótulo em qualquer página").
   Fecha de verdade o `undefined` silencioso. O custo aceito: um schema errado derruba a tela em vez de mostrar dado
   incompleto — e é exatamente por isso que existe a decisão 2.
2. **A prova é contra PRODUÇÃO, só leitura, antes do merge.** Um conferidor passa cada schema pelas linhas reais com a
   conta do smoke: snapshots de formato antigo, nulos do go-live, retornos das RPCs de leitura. Nada é gravado; a
   evidência guarda só contagens e caminhos de campo normalizados, nunca valor.

---

## As frentes, e por que nesta ordem

- **A — o mapa das mentiras e o censo.** Antes de qualquer schema: com a decisão 1, schema escrito de palpite é tela
  quebrada em produção. Documento, script só-leitura, números — e a linha de base sequencial de TTFB, como seguro.
- **B — a porta única de RPC.** `rpc.ts`, o mapa nominal de argumentos anuláveis travado contra o SQL, o `Json` tipado,
  o fim de `filialParaRpc`, e `rpc-unica-porta.test.ts`. Vem antes da C porque os retornos de RPC são lidos por ela.
- **C — `linhasDe`/`linhaDe`.** A amarração ao tipo inferido, o modo de schema por categoria, o erro de forma que lança,
  e os quatro lotes com `sem-cast-de-leitura.test.ts` como catraca. O grosso da fase.
- **D — o `erros.ts` enumerável.** As listas nomeadas, os casamentos de fora, o teste contra o corpo vivo e a lição do
  enum no runbook. Depois da C, porque o lote 3 da C mexe em `actions/admin.ts` e `actions/itens.ts`.
- **E — o conferidor.** Rodado no ensaio assim que os schemas existem, e em produção duas vezes: cedo, para achar recusa
  enquanto é barato, e sobre o SHA de código congelado — a rodada que é gate do merge.
- **F — o custo.** O benchmark de lote ANTES do lote 2 da C (é ele que decide o modo das leituras de lote); no fim, o A/B
  de TTFB no ensaio e a linha de base de produção, sobre o SHA congelado.
- **G — o fechamento, com ordem interna.** Versão e registry → revisão adversarial → SHA de código congelado → rodadas
  finais de E e F → relatório → PR de código e merge → deploy e conferência pós-deploy → PR só de documentação com a
  evidência → tag no merge dele.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F58 do `docs/PLANO-MULTIEMPRESA.md` (§5, Bloco D): fazer o TypeScript voltar a conferir o que sai do
Supabase. Toda chamada de RPC passa por UMA porta tipada (`src/lib/supabase/rpc.ts`, ou onde a decisão 1 a puser); toda
leitura que hoje APAGA o tipo com um cast passa por `linhasDe`/`linhaDe` (`src/lib/supabase/linhas.ts`), com a forma
conferida por Zod e AMARRADA ao tipo que o `select` infere; e as traduções de erro do banco viram listas nomeadas que um
teste confere contra o SQL VIVO. Ao terminar, uma coluna ausente do `select` é erro de compilação; uma linha real fora da
forma declarada LANÇA (decisão i do Johnny); e cada schema foi provado contra as linhas de PRODUÇÃO, só leitura, antes do
merge (decisão ii). O sistema faz o que fazia hoje: nenhuma tela, nenhum texto de operador (fora a entrada nova de
versão) e nenhuma assinatura de RPC muda. Fase SÓ DE CÓDIGO — nenhuma migration, nenhum `empresa_id`, nenhum toque no
gerador de tipos nem no `src/lib/types/database.ts`.

# Contexto

## Leia antes de escrever qualquer código
- `docs/PLANO-MULTIEMPRESA.md` — §4 (as 10 regras comuns a todas as fases), §5 → a ficha **F58** (a FONTE DA VERDADE do
  escopo: onde esta ordem e ela divergirem sem declaração, vale a ficha — `docs/README.md`), e as fichas de **F60**
  (quem troca `p_filial` por `p_filiais` usando a sua porta), **F63** (o `empresa_id` que a sua amarração de tipo tem de
  pegar) e **F65** (o índice cujo nome `versao-snapshot.ts` casa).
- `docs/prompts/F58-fronteira-tipada-do-banco-ultracode.md` — o cabeçalho com os **20 fatos medidos**. Este prompt os
  cita pelo número.
- `CLAUDE.md` e `AGENTS.md` — as regras permanentes, em especial a **2** (nunca dado real), a **6** (documentação oficial
  antes de API: use o Context7 para Zod 4 e para os tipos de `@supabase/postgrest-js`) e a **8** (versionamento).
- `docs/RELATORIO-F57.md` §11 (as 19 assinaturas que chegam a você) e `docs/INVENTARIO-LEITURAS.md`.
- `docs/INVENTARIO-CREDENCIAIS.md` §2 — por que `SMOKE_*` é produção e `NEXT_PUBLIC_*` é o ensaio.
- `docs/RUNBOOK-BANCO.md`; e, em `docs/DECISOES.md`, as atas `2026-08-10 · F33 · C1 e C7` (o método A/B intercalado),
  `2026-09-07 · F49 · Decisão 3` (medição contra produção com sessão real, só leitura) e
  `2026-09-14 · F56 (fechamento)` (o PR só de documentação depois do deploy).
- O código, nesta ordem: `src/lib/queries/rpc-filial.ts` (o cabeçalho inteiro — é a história da mentira do gerador),
  `src/lib/types/database.ts` (`Functions` e `Views`), os cabeçalhos de `scripts/gen-types.ts` e
  `scripts/db/diff-tipos.mjs`, `src/lib/queries/relatorios/comum.ts` (`paginarTodos`),
  `src/lib/queries/relatorios/itens.ts` e `estoque.ts` (os builders que a porta tem de preservar),
  `src/lib/queries/gerados.ts` e `src/lib/relatorios/tipos.ts` (`AnySnapshot`), `src/lib/auth/acesso.ts` (`lerPapel`),
  `src/lib/actions/erros.ts` (inteiro), `src/lib/relatorios/versao-snapshot.ts`, `scripts/db/corpo-vigente.mjs`,
  `src/lib/observabilidade.ts` e `observabilidade-linha.ts`, `src/lib/tipos-estritos.ts`, e as travas-molde
  `src/lib/queries/servidor-apenas.test.ts`, `erro-engolido.test.ts` e `src/lib/relatorios/chave-versao-sql.test.ts`.
- Os instrumentos só-leitura contra produção que já existem: `scripts/perf/medir.mjs`, `scripts/perf/medir-guarda.mjs`,
  `scripts/smoke/smoke-prod.mjs` e `scripts/manutencao/validar-truncamento.ts`.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Vinte fatos, medidos em 15/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco e o banco de hoje antes de
agir; onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o relatório. Os que
mais importam:
- **fato 1** — `1.62.0` no ar, última migration `0140`. Esta fase não cria migration; a versão dela é `1.63.0`.
- **fatos 2 e 3** — 37 `.rpc(` em `src/**` fora de teste (uma DINÂMICA, `actions/dev-destrutivo.ts:404`) e 17 em
  `scripts/**` (7 em `.mjs`, que não importam TypeScript).
- **fato 4** — o builder tem de sobreviver por causa de `Promise.all` e de `.order().range()` dentro de `paginarTodos`,
  não de `.single()`.
- **fato 7** — dos 15 `as unknown as Json`, 3 são escrita em coluna de TABELA (`kits.ts:68,102`, `relatorios.ts:146`),
  fora do alcance de uma porta de RPC.
- **fato 8** — o gerador MENTE no retorno: `rel_estoque_asof` devolve `colaborador`/`setor` NULL e `papel_atual()`
  devolve null para perfil desativado, e o tipo gerado diz que não. Com a decisão i, um schema copiado do `database.ts`
  derruba o relatório as-of e a request de todo perfil desativado, em produção.
- **fato 10** — são ~74 pontos de cast de leitura nas duas pastas (22 + ~52), ~84 com os limítrofes e os de fora — não
  os ~50 da ficha.
- **fato 12** — `z.object` padrão REMOVE coluna não declarada: num `select('*')` de backup, é apagar dado em silêncio.
- **fato 14** — cinco casamentos de erro por texto moram FORA do `erros.ts`, além do `versao-snapshot.ts`.
- **fato 15** — "a mensagem existe" se confere no corpo VIVO, nunca em `grep` de migration.
- **fato 17** — sem `PERF_URL_APP`, o `medir.mjs` mede produção; sem os outros `PERF_*`, ele loga em produção mesmo
  contra um `next start` local.

## Comandos que já existem — use, não reinvente
`npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run verificar:actions` ·
`node scripts/perf/medir.mjs` · `node scripts/smoke/smoke-prod.mjs`. `npm run db:types:diff` e
`npm run db:test:mutations` rodam no job `banco-sem-docker` do CI, que monta um Postgres descartável — nesta mesa, não.
**Não rode `db:seed`, `db:reset`, `db:lock` nem `db:types`** — esta fase não escreve em banco nem regenera tipos.

# Escopo

## Dentro — sete frentes, nesta ordem

### Frente A — o mapa das mentiras e o censo, ANTES de qualquer schema
A decisão i transforma todo schema errado em tela quebrada em produção. Por isso o primeiro entregável não é código de
`src/`: é o MAPA de onde o tipo gerado diverge da realidade, escrito em `docs/PLAN-F58.md`, lido do SQL VIVO e confirmado
por contagem em produção.
- **Argumentos:** para cada RPC chamada por `src/**` e `scripts/**`, que parâmetro o app passa `null` de propósito, e se
  a função o aceita como valor de domínio — não é `strict`, e o corpo vivo trata `p_x is null`. Parta dos fatos 5 e 6;
  procure os que faltam.
- **Retornos:** para cada coluna de `returns table (…)` e cada retorno escalar, se ela pode sair NULL no corpo vivo. O
  fato 8 é o exemplo, não a lista.
- **Views:** para cada coluna de view que o app lê, se ela é de fato não-nula (o gerador diz que tudo é anulável).
- **O censo (decisão ii):** um script só-leitura, com a sessão `SMOKE_*`, que CONTA — e só conta — as linhas e os nulos
  por coluna de cada tabela, view e retorno de `rel_*` que o app lê. A saída tem nome de coluna e número; nenhum valor. O
  total de linhas é o volume do benchmark da Frente F. Rode também no ensaio, para ver onde o seed fictício NÃO representa
  produção. ⚠ View pesada (`v_colaboradores_textos`, `v_conflitos_filiais` — ver a ficha F60) pode estourar o
  `statement_timeout` de 8 s do `authenticated`: se estourar, registre e amostre por página, sem insistir.
- **A linha de base SEQUENCIAL de TTFB da `main`**, ainda nesta frente, no diretório principal e antes do primeiro commit
  de código — é o seguro do A/B da Frente F.
- **Os pontos de cast classificados** por categoria, porque a categoria decide o modo do schema: tabela com `select`
  literal · `select` concatenado (fato 11) · view · retorno de RPC · coluna `jsonb` · `select('*')` de backup/export
  (fato 12).

### Frente B — a porta única de RPC
`src/lib/supabase/rpc.ts` com `chamarRpc(client, nome, args)` (ou o nome e o lugar que a decisão 1 registrar), tipada
por `Database['public']['Functions']` e devolvendo o **BUILDER** (fato 4): `Promise.all` sobre builders e
`.order().range()` dentro de `paginarTodos` continuam compilando e funcionando sem mudança de forma.
- **Argumentos anuláveis num mapa NOMINAL** — por função E por parâmetro, com o motivo escrito ao lado de cada entrada.
  Nunca `| null` em todo argumento: isso trocaria uma mentira por outra e deixaria passar `null` onde a RPC exige valor.
  `filialParaRpc` e `src/lib/queries/rpc-filial.ts` **somem**; as mentiras de `conflitos.ts:288` e dos dois
  `dev-destrutivo.ts` (fato 6) **somem**. O mapa é o lugar onde a F60 troca `p_filial` por `p_filiais` — escreva-o para
  essa troca caber numa linha.
- **Trava TS↔SQL do mapa:** toda entrada corresponde a uma função NÃO `strict` cujo corpo vivo trata o `null` daquele
  parâmetro como VALOR DE DOMÍNIO (consolidado, alcance global, sem arquivo). Um `if p_x is null then raise` é recusa,
  não aceitação, e não conta. Entrada sem respaldo no SQL reprova.
- **Os retornos que mentem se corrigem NA PORTA, para todo consumidor:** a porta ALARGA para anulável as colunas de
  retorno que o mapa lista (`rel_estoque_asof.colaborador`/`setor`, `papel_atual` e o que a Frente A achar) — e o
  consumidor que supunha não-nulo passa a não compilar, que é o conserto aparecendo. Nunca num `as`. `lerPapel` continua
  distinguindo "sem papel" (null legítimo) de "não deu para saber" (erro).
- **`Json` sem `as unknown as`:** um mecanismo tipado que aceita valor serializável e recusa em compilação o que não é
  (`Date`, função, `undefined` em posição de array). Ele cobre os 12 argumentos de RPC E as 3 escritas em coluna `jsonb`
  de tabela (fato 7) — ou você declara, por nome, por que as três ficam de fora.
- **A chamada dinâmica** (`actions/dev-destrutivo.ts:404`) passa pela porta com o nome tipado como união fechada.
- **Scripts:** os `.ts` usam a porta ou entram numa isenção nominal com motivo; os dois `.mjs` ficam isentos porque não
  importam TypeScript, e a isenção diz isso. Confira antes como `validar-truncamento.ts` importa hoje um módulo
  `server-only` (fato 19) — é essa resposta que decide onde a porta mora.
- `rpc-unica-porta.test.ts`, ao lado da porta: trava de **ARQUITETURA**, com o disco lido na coleta — nenhuma chamada de
  RPC em `src/**` fora da porta e fora de arquivo de teste, em qualquer grafia (`.rpc(`, `.rpc<`, `['rpc'](`, `rpc`
  desestruturado ou passado adiante); `scripts/**` varrido com a lista de isenção nominal, catraca que só encolhe. Os 13
  `.rpc(` dos testes são dublê ou roteiro: decida e registre se a trava os olha.

### Frente C — `linhasDe`/`linhaDe`, e a trava de forma
`src/lib/supabase/linhas.ts` (ou onde as decisões 1 e 5 registrarem, se o conferidor precisar importá-lo fora da
condição `react-server`).
- **Escopo:** os pontos que hoje apagam o tipo com cast (fato 10). As leituras que já usam o tipo inferido, sem cast,
  continuam como estão — a trava só impede o cast de voltar a elas.
- **A amarração é a fase inteira.** O schema fica AMARRADO, em compilação, ao tipo que o builder infere do `select`: um
  schema que declara uma coluna que o `select` não traz **não compila**. Um `z.object({…})` escrito à mão e solto é o
  mesmo `as X[]` de hoje com outra roupa — o `empresa_id` da F63 passaria nele exatamente igual. O schema só muda o tipo
  inferido nas entradas do mapa da Frente A: ESTREITA `Json` para a forma real, e coluna de view para não-nula quando o
  SQL e o censo provam. O retorno de RPC já chega corrigido pela porta.
- **O teste da virada, por `@ts-expect-error`:** um `select` sem `empresa_id` e um consumo que o lê — não compila. É a
  frase-objetivo da ficha virando prova.
- **Falha de forma LANÇA (decisão i).** Erro com o rótulo da leitura, o caminho do campo e o código da issue;
  `registrarFalha` no escopo da leitura; **nenhum valor de linha** na mensagem, no `ctx` ou no log — nunca
  `reportInput`. O caminho é NORMALIZADO: chave dinâmica de objeto (record) vira `<chave>`, índice de array vira `[]`, e
  a issue de chave desconhecida num `jsonb` leva a contagem, não os nomes — chave de `jsonb` pode ser dado (nome de item,
  slug de filial). A falha segue o caminho de falha que cada leitura JÁ TEM: onde hoje uma leitura que falha propaga, a
  forma errada propaga; onde hoje ela degrada de propósito (`lerMinimosDoCatalogo`, `getSerieEstado`), degrada igual. Não
  crie `catch` novo que engula, e não remova degradação existente.
- **O modo do schema vem da categoria (fato 12):** `select('*')` de backup/export → `z.looseObject` OBRIGATÓRIO (a coluna
  que o schema não conhece tem de chegar ao backup); colunas explícitas numa leitura pequena → estrito; leitura de LOTE
  com colunas explícitas (histórico paginado, export) → frouxo ou estrito conforme o benchmark de lote da Frente F, que
  roda ANTES do lote 2 e é o critério de custo da ficha; o `jsonb` do snapshot de `gerados.ts` → frouxo, aceitando TODA
  forma histórica de `AnySnapshot`. Nunca `z.object` padrão em `select('*')`.
- **`select` concatenado vira literal** (fato 11) — string única ou template literal sem interpolação —, para a
  inferência voltar a funcionar. Prove por teste de tipo que o resultado deixou de ser genérico.
- **Lotes, na ordem da ficha:** (1) `queries/tipos-item.ts` e `queries/relatorios/**`; (2) o resto de `queries/`;
  (3) `actions/` e os pontos de fora (medidos: `auth/acesso.ts:117`, `app/(app)/dev/acoes-export.ts:139`);
  (4) `queries/gerados.ts`, por ÚLTIMO. Entre um lote e outro: `lint`, `test` e `tsc` verdes, e commit próprio.
- `sem-cast-de-leitura.test.ts`, ao lado de `linhas.ts`: reprova por **FORMA**, por AST — `as <Tipo>`,
  `as unknown as <Tipo>` ou `<Tipo>expr` aplicado a dado de resultado do Supabase (`data`, `(data ?? [])`, `(data ?? {})`,
  `{ data: x }` renomeado, `.data`, linha de embed, coluna `jsonb`) —, nunca por texto. Escopo mínimo `queries/` +
  `actions/`; estenda a todo módulo de `src/**` que leia do Supabase, ou declare por nome por que não. Ela nasce como
  lista CONGELADA dos pontos medidos, que só encolhe até o resíduo justificado — e a prova de que ela reprova sem a lista
  vai para a evidência. Os 14 casts de BUILDER (fato 9) não são leitura: decida se saem ou ficam nomeados, e registre.

### Frente D — o `erros.ts` enumerável
- **Listas NOMEADAS:** `CONSTRAINTS_TRADUZIDAS` — os 10 nomes do `erros.ts` mais `filiais_slug_key` e
  `relatorios_gerados_periodo_filial_versao_uidx`, que só casam fora dele: 12 (o `itens_nome_uidx` casa nos dois lugares,
  fato 14) —; `MSG_SQL`, os textos nossos, cada ramo com as suas grafias com e sem acento; e as frases do MOTOR do
  Postgres/PostgREST (fato 13), que nenhuma migration contém e ficam isentas por nome.
- **Nenhum casamento por texto sobra solto:** `erros.ts`, `actions/admin.ts:610,704,732`, `actions/itens.ts:525,700` e
  `relatorios/versao-snapshot.ts:44` consomem as listas. Uma trava por forma reprova `includes('literal')` sobre mensagem
  de erro fora do módulo das listas.
- **O teste contra o SQL VIVO** (fato 15), no Vitest, case-insensitive — o `erros.ts:21` faz `toLowerCase()` e o SQL
  escreve com maiúscula: cada ramo de `MSG_SQL` tem ao menos UMA grafia no corpo vivo de alguma função
  (`corpo-vigente.mjs`); cada nome de constraint e de índice existe no esquema vivo, resolvido por uma réplica das
  migrations em ordem — `create`, `drop` e `rename` —, no molde de `corpo-vigente.mjs`. Um texto que só existe em
  migration histórica REPROVA. (O CI está fora do escopo: nada de gate novo no workflow.)
- **Traduções mortas:** o que o teste achar sem fonte viva vai listado no relatório com a decisão de cada uma. Apagar o
  ramo não muda comportamento — ele não casa nada —, mas é decisão escrita, não limpeza calada.
- **A lição do enum no `docs/RUNBOOK-BANCO.md`:** por que `alter type … add value` não é usável na mesma transação que o
  cria, as três vezes que o projeto pagou isso (`0044/0045`, `0046/0047`, `0108/0109`), e por que a conversão para
  `text + CHECK` NÃO foi feita. Registro, não conversão.

### Frente E — o conferidor, e a prova contra o dado real (decisão ii)
Um script só-leitura (lugar e nome por sua conta, em `scripts/`) que passa cada schema pelas linhas reais.
- **Consome os MESMOS schemas e os MESMOS `select` do app** — importados, nunca copiados. Um conferidor com cópia prova a
  cópia. Se para isso schemas e textos de `select` tiverem de morar num módulo importável fora da condição
  `react-server`, é assim que o desenho sai (o precedente é a metade pura de `observabilidade-linha.ts`).
- **Dois alvos, com a identidade conferida ANTES da primeira leitura:** ensaio (`NEXT_PUBLIC_*` + persona fictícia do
  seed) e produção (`SMOKE_*`). O alvo se prova pelo ref da URL contra `SEED_PROJECT_REF` (fato 18). Alvo ambíguo →
  recusa.
- **Só leitura, sem exceção:** `select`, `head` e as RPCs de uma lista NOMINAL de chamáveis, tirada do corpo vivo —
  `stable` ou `immutable`, sem `insert`/`update`/`delete` no corpo —, conferida antes de cada chamada e falhando fechado.
  O prefixo `rel_` não é prova. **RPC que escreve não é chamada em banco nenhum:** a forma do retorno dela se prova pelo
  corpo vivo (as chaves do `jsonb_build_object`, as colunas do `returns table`), com trava TS↔SQL. A única escrita
  tolerada é a sessão que o login grava no Supabase Auth — a mesma que o smoke já grava.
- **Cobertura:** cada ponto de leitura sobre a tabela inteira, paginada; **todos** os snapshots de `relatorios_gerados`
  (as formas antigas moram lá); as `rel_*` numa matriz de argumentos — consolidado (`null`) e cada filial ativa × três
  recortes de tempo (a semana corrente, o período inteiro desde o dado mais antigo, e uma janela intermediária) —, com
  cada célula rotulada por NÚMERO DE ORDEM, nunca por slug, nome ou id; `rel_saldo_colaborador` sobre uma amostra de
  pessoas, sem imprimir quem. Ponto que estourar o `statement_timeout` é amostrado por página, e a amostragem é
  declarada.
- **Saída:** por ponto, linhas lidas · aceitas · recusadas · erros de leitura, e para cada recusa o caminho NORMALIZADO
  do campo (Frente C) e o código da issue. **Nenhum valor, nenhum patrimônio, nenhum nome, nenhum e-mail, nenhum id,
  nenhum slug de filial** — nem no terminal, nem na evidência, nem em stack trace. Credencial mascarada como os
  instrumentos existentes já fazem.
- **Duas rodadas em produção.** Uma CEDO, assim que os schemas existirem, para achar recusa enquanto é barato. E a que
  vale para o gate, sobre o SHA de código CONGELADO (Frente G, passo 3), gravado na evidência. Qualquer commit em
  `src/**` ou `scripts/**` depois dela a invalida: rode de novo (no máximo três rodadas finais; persistindo recusa, o PR
  fica aberto).
- **O gate:** 0 recusa, 0 erro de leitura, e em cada ponto lidas = o `count` exato da mesma consulta, medido na própria
  rodada (ou a amostra declarada). Ponto sem linha lida onde há dado é NÃO PROVADO, e ponto não provado segura o merge.
  Recusa se resolve corrigindo o SCHEMA (e o tipo) para a realidade — nunca o dado, nunca `z.any()`, nunca afrouxando além
  do que o mapa autoriza. Se a realidade revelar um defeito de dado (coluna que não devia ser nula, e é), o schema aceita
  a realidade e o defeito vai NOMEADO para o backlog: pela decisão i, recusá-lo seria uma tela quebrada.

### Frente F — o custo, medido
- **Leitura de lote, ANTES do lote 2 da Frente C:** benchmark determinístico do parse Zod nas leituras de export, backup e
  histórico paginado, com linhas FICTÍCIAS no volume real de produção (o total de linhas do censo). É ele que decide o
  modo das leituras de lote (decisão 5), e ele roda de novo sobre o SHA congelado. O harness de TTFB não alcança Server
  Action (fato 17) — este é o número que responde ao risco que a ficha nomeia.
- **TTFB, o gate:** dois `next start -p <porta>` — `main` e a branch, cada um na sua porta — contra o ENSAIO, medidos
  intercalados sobre o SHA congelado, com `/vercel.svg` e `/ajuda` de controle (método da ata F33). Cada rodada do
  `medir.mjs` leva `PERF_URL_APP=http://localhost:<porta>` do servidor medido E `PERF_SUPABASE_URL`,
  `PERF_SUPABASE_ANON_KEY`, `PERF_EMAIL` e `PERF_SENHA` do ENSAIO e de uma persona fictícia do seed — sem `PERF_URL_APP`
  ele mede produção; sem os outros, loga em produção (fato 17). A build da `main` pode sair de uma worktree temporária,
  removida no fim; **nunca copie o `.env.local` para outro diretório** — injete as variáveis no processo, no build e no
  start (as `NEXT_PUBLIC_*` entram na build). Critério da ficha: nenhuma rota regride mais de 10% na leitura NORMALIZADA
  pelo controle. Estourou → ache a causa, corrija e re-meça; persistindo, o PR fica aberto.
- **O seguro do método:** se a worktree ou a injeção de variáveis forem barradas, o A/B vira sequencial — a linha de base
  que a Frente A mediu × a branch no SHA congelado, mesmos controles, no diretório principal — e o relatório declara o
  método mais fraco.
- **Produção, o registro:** `node scripts/perf/medir.mjs` contra produção antes do merge (a `1.62.0` no ar) e depois do
  deploy (a `1.63.0`), com o mesmo método. Toda rota responde 200. Regressão acima de 10% normalizada em produção vira
  achado com PR corretivo — não reversão às cegas.
- Os JSONs e as tabelas vão para `docs/perf/` e `docs/f58-evidencias/`.

### Frente G — o fechamento, nesta ordem
1. `1.63.0` no `package.json`; entrada no `CHANGELOG.md`; entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6
   mudanças em LINGUAGEM DE OPERADOR (há teste que recusa termo de desenvolvedor; a fase é quase invisível — diga o
   efeito honesto, por exemplo que dado em formato inesperado passa a virar aviso de erro em vez de tela incompleta,
   nunca "nada mudou").
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado:** o último commit que toca `src/**` ou `scripts/**`, gravado no `PLAN-F58.md` e na
   evidência. Depois dele só entram `docs/**` e `CHANGELOG.md`.
4. As rodadas finais sobre esse SHA: o conferidor em produção (Frente E), o benchmark de lote, o A/B de TTFB e a linha de
   base de produção (Frente F).
5. Ata em `docs/DECISOES.md`, `docs/RELATORIO-F58.md`, e `docs/ARQUITETURA.md` §10 e `docs/README.md` com os módulos
   novos.
6. PR de código com `gh pr create`; merge só com os dois checks verdes, o gate da Frente E fechado e o A/B dentro dos 10%.
7. Deploy automático da Vercel e a **conferência pós-deploy, só leitura, ANTES de qualquer outro PR**: `/api/saude` com
   `1.63.0` e o commit desse merge; `node scripts/smoke/smoke-prod.mjs` com 0 falha; o `medir.mjs` de produção depois.
8. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório — o precedente é o fechamento da F56. A tag
   anotada `v1.63.0` vai no merge dele, o commit final da fase, e é publicada.

## Fora — não toque
Nenhuma migration, nem corretiva: defeito de banco vai NOMEADO para o backlog. `src/lib/types/database.ts` à mão, o
gerador, a versão fixada da CLI. A conversão de enum para `text + CHECK`. Nenhuma assinatura de RPC — `p_filial`
continua `p_filial` (é a F60). As leituras que já usam o tipo inferido, sem cast. `paginarTodos` com `cap`, keyset,
`cache()` e índices (F60). A doutrina do predicado e `policies-initplan` (F59). A `chaveVersao` com `empresa_id` e o
índice recriado (F65) — aqui só o NOME do índice entra na lista. A régua de identidade da compra (a pergunta 1 do roteiro
da F57 continua com o Johnny). Unificar os dois `DbClient` e consertar o alvo de `validar-truncamento.ts` (backlog, fatos
16 e 18). Dependência nova. O CI, a proteção da `main`, `.env*` e `scratchpad/`. **Nenhuma escrita em banco de verdade —
produção ou ensaio —, e nenhuma RPC que escreve chamada em banco nenhum.** A única escrita tolerada é a sessão que o
login grava no Supabase Auth, a mesma do smoke; o Postgres descartável do CI não conta.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos.
2. A porta existe e devolve o builder: os `Promise.all` de `relatorios/itens.ts` e `queries/itens.ts` e o
   `.order().range()` de `relatorios/estoque.ts` compilam sem cast.
3. Zero chamada de RPC em `src/**`, fora de arquivo de teste, fora da porta; `rpc-unica-porta.test.ts` reprova por
   arquitetura, nas grafias da Frente B, e cobre `scripts/**` com isenção nominal.
4. `filialParaRpc` e `rpc-filial.ts` não existem; nenhum `as unknown as` sobrou em argumento de RPC.
5. O mapa de argumentos anuláveis é nominal (função × parâmetro × motivo), e cada entrada é confirmada por teste contra o
   corpo vivo (não `strict`, trata `null` como valor de domínio).
6. Zero `as unknown as Json` — os 12 de RPC e as 3 escritas de tabela —, ou as que restarem nomeadas com motivo.
7. `linhasDe`/`linhaDe` existem (em `src/lib/supabase/linhas.ts`, ou onde as decisões 1 e 5 registrarem); schema que
   declara coluna ausente do `select` não compila, e o teste da virada (`empresa_id` lido sem estar no `select`) não
   compila — os dois por `@ts-expect-error`.
8. Zero cast de leitura em `queries/` + `actions/` e nos pontos de fora, exceto o resíduo nominal justificado;
   `sem-cast-de-leitura.test.ts` reprova por forma, incluindo `{ data: x }` renomeado e `(data ?? {})`.
9. Forma errada LANÇA, com `registrarFalha`; mensagem, `ctx` e log sem valor de linha e com o caminho normalizado (há
   teste); nenhum `catch` novo engole a falha; as degradações que já existiam continuam degradando.
10. Os `select('*')` de backup/export usam objeto frouxo, e um teste prova que uma coluna desconhecida do schema chega ao
    resultado.
11. Nenhum `select('*')` usa `z.object` padrão; o modo das leituras de lote saiu do benchmark; o snapshot de `gerados.ts`
    é frouxo e foi o último lote.
12. As mentiras de retorno do mapa estão corrigidas na porta — no mínimo `rel_estoque_asof.colaborador`/`setor` e
    `papel_atual` —, com teste contra o SQL, e `lerPapel` ainda distingue "sem papel" de "falhou".
13. Os `select` concatenados do fato 11 viraram literais e voltaram a ser inferidos (teste de tipo).
14. `erros.ts` com `CONSTRAINTS_TRADUZIDAS` (12 nomes, ou o número medido), `MSG_SQL` e a lista do motor nomeadas;
    nenhum `includes('literal')` sobre mensagem de erro fora do módulo das listas; `admin.ts`, `itens.ts` e
    `versao-snapshot.ts` consomem as listas.
15. O teste do `erros.ts` confere contra o corpo VIVO e contra a réplica das migrations, case-insensitive, e reprova texto
    que só existe em migration histórica.
16. As traduções mortas estão listadas no relatório, cada uma com a decisão.
17. `docs/RUNBOOK-BANCO.md` tem a lição do enum; nenhum enum foi convertido.
18. O conferidor existe, importa os schemas e os `select` do app (sem cópia), confere a identidade do alvo antes de ler,
    só chama RPC da lista nominal de chamáveis, e rotula a matriz por número de ordem.
19. O censo rodou no ensaio e em produção; o conferidor rodou no ensaio e em produção sobre o SHA congelado, gravado na
    evidência, com 0 recusa, 0 erro de leitura e lidas = `count` exato em cada ponto, incluindo todos os snapshots de
    `relatorios_gerados` e a matriz das `rel_*` — ou, com a leitura de produção barrada: schemas marcados NÃO PROVADOS e
    PR de código aberto.
20. Nenhuma RPC que escreve foi chamada em banco nenhum; a forma do retorno delas está provada pelo corpo vivo.
21. O benchmark de lote está registrado antes do lote 2 e sobre o SHA congelado, no volume de produção, com linhas
    fictícias.
22. O A/B de TTFB contra o ensaio, sobre o SHA congelado e com `PERF_URL_APP` apontando para cada `next start`, mostra
    nenhuma rota acima de 10% de regressão normalizada pelo controle — intercalado, ou sequencial com o método declarado.
23. Pós-deploy, antes de qualquer outro PR: `/api/saude` com `1.63.0` e o commit do merge; `smoke-prod.mjs` com 0 falha;
    `medir.mjs` em produção com todas as rotas 200 e o antes × depois registrado — ou nada disso, se o PR de código ficou
    aberto.
24. Nenhum arquivo em `supabase/migrations/` criado ou tocado; `supabase/migrations.lock.json` e
    `src/lib/types/database.ts` intactos.
25. Nenhuma tela, nenhum texto de operador (fora a entrada nova do `registry.ts`) e nenhuma assinatura de RPC mudou;
    nenhum cargo passou a ver menos.
26. `npm run verificar:actions` verde; `db:test:mutations` e `db:types:diff` com os mesmos números da F57 no CI (a fase
    não toca SQL — se eles se mexerem, você mexeu no que não devia).
27. `package.json` em `1.63.0`, `CHANGELOG.md` e `registry.ts` com entrada; tag anotada `v1.63.0` publicada no merge do
    PR de documentação — ou nenhuma tag, se o PR de código ficou aberto.
28. `docs/DECISOES.md` tem a ata da fase, datada, com as decisões e o motivo de cada uma.
29. `docs/RELATORIO-F58.md` existe, no padrão F45→F57, com o roteiro do Johnny no topo.
30. O PR de código está mergeado com `verificar` e `banco-sem-docker` verdes, e o de documentação também — ou o de código
    aberto, com o bloqueio no topo do relatório.
31. `docs/ARQUITETURA.md` §10 e `docs/README.md` citam a porta, `linhas.ts`, as listas de erro e o conferidor.
32. Nenhum dado real (nome, patrimônio, e-mail, id ou slug de linha, valor de credencial) em teste, fixture, evidência,
    log ou saída de script.
33. O relatório declara o estado de repouso: o que acontece se o projeto parar aqui por dois meses.

# Verificação — rode de verdade
A cada incremento e entre cada lote: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes de cada
push. Leia a falha, corrija a **causa raiz** e repita até passar. **Não afrouxe trava, não alargue allowlist para caber
um caso que devia ser consertado, não troque schema por `z.any()`/`z.unknown()` para calar uma recusa, não use `as` para
passar um tipo que a amarração recusou, e não mude teste existente sem conferir que o que ele prova continua o mesmo.**
Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**O MAPA E O CENSO VÊM ANTES DO PRIMEIRO SCHEMA.** A ordem é esta: escreva o mapa das mentiras (Frente A), rode o censo
em produção e no ensaio, e só então escreva schema. Schema escrito antes do censo é palpite — e, pela decisão i, palpite
errado é tela quebrada em produção. (Se o censo de produção for barrado, vale a regra de bloqueio de "Autonomia".)

Provas obrigatórias, cada uma com a saída real em `docs/f58-evidencias/`:
- **Sabotagem A — a porta:** um `.rpc(` direto numa query → `rpc-unica-porta.test.ts` vermelho nomeando o arquivo; o
  mesmo com `['rpc'](` e com `rpc` desestruturado; tirar um `.ts` de `scripts/` da isenção sem migrá-lo → vermelho.
- **Sabotagem B — o mapa de anuláveis:** pôr no mapa um parâmetro cuja função NÃO trata `null` como valor de domínio
  (escolha um, e cole o trecho do corpo vivo que prova) → a trava SQL fica vermelha; tirar `p_filial` de uma `rel_*` do
  mapa → o `tsc` recusa a chamada do consolidado.
- **Sabotagem C — a amarração:** um schema com `empresa_id` sobre um `select` sem ele → o `tsc` recusa (a saída do
  compilador é a prova central da fase); reintroduzir `(data ?? []) as X[]` numa query → `sem-cast-de-leitura.test.ts`
  vermelho; o mesmo com `{ data: linhas }` renomeado.
- **Sabotagem D — o backup:** trocar o objeto frouxo de um `select('*')` de backup por `z.object` padrão → o teste da
  coluna desconhecida fica vermelho.
- **Sabotagem E — a mentira de retorno:** tirar `colaborador` do alargamento da porta para `rel_estoque_asof` → o `tsc`
  ou o teste com linha fictícia de ativo em estoque fica vermelho, e a rodada do conferidor no ENSAIO acusa recusas.
  Sabotagem não roda contra produção.
- **Sabotagem F — valor no erro:** ligar `reportInput`, interpolar valor de linha na mensagem, ou deixar uma chave
  dinâmica de `jsonb` crua no caminho do campo → o teste que proíbe valor no erro fica vermelho.
- **Sabotagem G — o erro enumerável:** um `m.includes('texto solto')` no `erros.ts` → a trava por forma acusa; um item de
  `MSG_SQL` que só existe num corpo HISTÓRICO → o teste do SQL vivo fica vermelho (é a prova de que ele não é `grep`).
- **O conferidor:** a saída completa das rodadas de ensaio e de produção — a cedo e a do SHA congelado —, contagens por
  ponto, e uma varredura dos arquivos de evidência por padrão de patrimônio, e-mail e UUID, e pelos nomes e slugs reais de
  filial (carregados em memória da própria produção, nunca gravados), com zero ocorrência.
- **A contagem final:** `.rpc(` e casts de leitura antes × depois, pela mesma varredura das travas; `npm run test` com o
  total de testes antes × depois; `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem: (1) uma medição sua contra o disco ou o banco de hoje; (2) as duas decisões do
Johnny abaixo, que estendem a ficha; (3) a ficha da F58 no §5 do plano; (4) este prompt, no que ele detalha — e onde ele
diverge da ficha, a divergência está declarada aqui e vai para o relatório; (5) as convenções do repositório
(`CLAUDE.md`, `AGENTS.md`, código existente); (6) a opção mais simples e reversível. Decisão não-óbvia vai para
`docs/DECISOES.md` com data, contexto, escolha e motivo.

**As duas decisões do Johnny (15/09/2026), que a ficha não tinha:**
i. **Forma errada LANÇA em produção.** Falha de forma é falha de leitura, com `registrarFalha`, pelo caminho de falha que
   cada leitura já tem. Nunca "registra e segue".
ii. **A prova é contra PRODUÇÃO, só leitura, antes do merge**, com a conta do smoke, sobre as leituras e as RPCs de
    leitura; a evidência guarda só contagens e caminhos de campo normalizados.

**As nove decisões que esta fase precisa tomar por escrito:**
1. **A porta** — nome, assinatura, onde mora (e se script a importa), como tipa a chamada dinâmica, o que fica isento em
   `scripts/` e nos testes.
2. **O mapa das mentiras** — a forma do mapa de argumentos anuláveis, dos retornos alargados e das colunas de view
   estreitadas, e a trava SQL de cada um.
3. **O `Json` tipado** — o mecanismo que substitui os 15 `as unknown as Json`, e o destino das três escritas de tabela.
4. **A amarração** — como o schema fica preso ao tipo inferido do `select`, e o que acontece onde a inferência não
   alcança.
5. **O modo por categoria** — estrito, frouxo ou só tipo, por categoria do fato 12, e onde moram os schemas. Provisória
   até o benchmark de lote, que roda antes do lote 2.
6. **O erro de forma** — a classe, a mensagem, a normalização do caminho, o escopo do `registrarFalha`, e como convive
   com as degradações que já existem.
7. **Os casts de builder** — os 14 do fato 9 saem ou ficam nomeados.
8. **As listas de erro** — a forma, a réplica das migrations para nome de constraint e de índice, e o destino de cada
   tradução morta.
9. **O conferidor e a medição** — onde moram, como importam os schemas sem cópia, a lista de RPCs chamáveis, a matriz de
   argumentos das `rel_*`, o método do A/B e do benchmark.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** e registre. Bloqueio real — cota de Actions esgotada,
CI fora do ar, produção fora do ar: contorne se for seguro; senão, **entregue o resto e registre a pendência com o que
falta para resolvê-la**.

**Se QUALQUER leitura de produção for barrada** — o censo, o conferidor ou o `medir.mjs` —, por credencial, por rede ou
por recusa do classificador de segurança: não repita e não reformule; não tente outra leitura de produção nesta run; siga
com o censo do ensaio e o mapa do corpo vivo, marque os schemas como NÃO PROVADOS em produção, entregue o resto, e o PR
de código fica ABERTO, com o comando exato no topo do relatório para o Johnny rodar e mergear — sem a prova, a decisão i
vira aposta em produção. **Recusa do classificador em qualquer outra ação** (merge, push de tag, injeção de variável no
processo) segue a mesma regra: registre, não repita, e siga no que não depende dela.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório — foi
assim que a F46, a F53, a F55 e a F57 acertaram o próprio escopo. **Aqui já há oito divergências medidas de saída**, e
elas vão no relatório: são ~74 pontos de cast de leitura nas duas pastas (~84 com os limítrofes e os de fora), não ~50;
são 10 chamadas `rel_*`, não 8, e o builder é exigido por `Promise.all` e por `.order().range()`, não por `.single()`; há
três mentiras de argumento além do `filialParaRpc` que a ficha não lista; dos 15 `as unknown as Json`, 3 são escrita de
tabela e não somem com uma porta de RPC; o gerador mente também no RETORNO, o que a ficha não cita; o `erros.ts` tem 70
ramos, 132 substrings e 10 nomes de objeto, não 63, ~110 e 8; o `toLowerCase()` está na linha 21, não na 20; e há cinco
casamentos de erro por texto fora do `erros.ts` além do `versao-snapshot.ts`, que casa na linha 44, não na 43. Declare
também as duas que este prompt cria por decisão do Johnny.

# Git e segurança
Branch `f58-fronteira-tipada-do-banco`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional
(`refactor(f58): …`, `feat(f58): …`, `test(f58): …`, `docs(f58): …`, `perf(f58): …`). Commite também esta ordem
(`docs/prompts/F58-fronteira-tipada-do-banco-ultracode.md`) na branch, num commit de documentação; o mapa, o censo e a
linha de base sequencial da Frente A vêm antes do primeiro commit que toca `src/`. Um commit por lote na Frente C, com o
nome da superfície na mensagem. PR de código com `gh pr create`; merge só com `verificar` e `banco-sem-docker` verdes, o
gate da Frente E fechado sobre o SHA congelado e o A/B de TTFB dentro dos 10%. Depois do merge, a evidência pós-deploy
entra por um PR só de documentação, e qualquer correção de código, por PR novo. Agrupe os pushes — cada um custa CI numa
cota apertada. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não
é seu, commitar `.env*` ou `scratchpad/`, copiar o `.env.local` para outro diretório, criar ou editar migration, mexer na
proteção da `main`, escrever em banco de verdade, ou chamar RPC que escreve.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS** (nunca com dado real):
(a) **as RPCs** — as 37 + 17 chamadas, o que cada uma passa `null`, e o corpo vivo de cada função chamada (`strict`?
trata `null`? escreve? o que devolve de fato); (b) **os casts de leitura** — os pontos do fato 10 classificados pelas
categorias da Frente A, com arquivo:linha; (c) **as views e os `select`** — que leituras a inferência já alcança, quais
não, e por quê; (d) **o `erros.ts`** — os 132 casamentos e os de fora, cada um com a sua fonte viva ou a falta dela;
(e) **a medição** — o método A/B da F33, as rotas do `medir.mjs`, as personas do ensaio e a cascata de credencial;
(f) **os catálogos** — que testes e varreduras enumeram módulos de `src/lib/queries/`, `src/lib/supabase/` ou `scripts/`
(`servidor-apenas.test.ts`, `fronteira-viewer.test.ts`, `erro-engolido.test.ts`, `observabilidade-fonte.test.ts`,
`superficie-admin.test.ts`) e o que os módulos novos exigem de cada um.

Escreva `docs/PLAN-F58.md` antes de implementar, com: as contagens reais; o mapa das mentiras e o censo (só números); as
assinaturas da porta, da amarração e do erro de forma; o modo por categoria (provisório até o benchmark); os lotes da
Frente C na ordem, com o número de pontos de cada um; o desenho do conferidor e da medição; as nove decisões já tomadas;
e a ordem de reversão (`git revert` dos commits de lote, de trás para frente, + redeploy — por isso os lotes). **A
implementação é sequencial, frente a frente (A → G):** os lotes mexem nos mesmos arquivos de `queries/` e `actions/`, e
edição paralela neles colide. Paralelize exploração, medição e revisão — não edição.

Antes de congelar o SHA (Frente G, passo 2), **revisão adversarial por subagentes em contexto fresco**, contra o
`PLAN-F58.md` e os 33 critérios, com estas perguntas: sobrou alguma chamada de RPC fora da porta, em qualquer grafia?
alguma entrada do mapa sem respaldo no corpo vivo? algum `as` que ainda apaga o tipo de dado lido, fora do resíduo
nominal? algum schema solto, que compilaria com uma coluna que o `select` não traz? algum `select('*')` com `z.object`
padrão — isto é, algum backup que perderia coluna? algum schema estrito sobre `select('*')`? o snapshot aceita todas as
formas históricas que a rodada cedo do conferidor viu em produção? `papel_atual` nulo ainda vira "sem papel", e não
erro? a mensagem do erro de forma carrega valor de linha, ou chave de `jsonb` crua, em algum caminho? algum `catch` novo
engole a falha de forma, ou alguma degradação existente sumiu? algum casamento de erro por texto ficou fora das listas?
o teste do `erros.ts` aceitaria um texto que só existe em migration histórica? o conferidor importa os schemas ou tem
cópia? ele chama alguma RPC fora da lista de chamáveis? algum ponto com 0 linha lida passaria como aceito? a evidência
tem algum valor real, id ou slug? a identidade do alvo é conferida antes da primeira leitura? o A/B mede `localhost` e
foi normalizado pelo controle? alguma tela, texto de operador (fora a entrada do `registry.ts`) ou assinatura de RPC
mudou? algum arquivo fora do escopo foi tocado? Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas
lacunas de correção ou de requisito declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F58.md`, em pt-BR, no padrão dos relatórios F45→F57, **com o roteiro do Johnny no TOPO** — o que ficou
com ele, passo a passo, e por quê. No mínimo: depois do deploy, em produção e só olhando, abrir um relatório GERADO
antigo, abrir a visão de uma filial numa data passada (é a `rel_estoque_asof`, a do colaborador nulo), exportar o CSV de
ativos e abrir a ficha de um ativo, conferindo que nenhuma tela mostra erro; e o que fazer se alguma mostrar — o log do
`registrarFalha` diz a leitura e o caminho do campo, e a correção é um PR no schema daquela leitura, não a reversão da
fase. Se uma leitura de produção foi barrada, o comando exato para rodá-la vem PRIMEIRO.
Depois: o que mudou por arquivo e por quê; **os números MEDIDOS** lado a lado com a ficha (as `.rpc(` e os casts antes ×
depois; ramos e substrings do `erros.ts`; pontos por lote; testes antes × depois), e **cada divergência explicada** — a
começar pelas oito já conhecidas; o mapa das mentiras e o censo (só números); as **nove decisões** com o custo que
decidiu cada uma; as **sete sabotagens** com saída real; as rodadas do conferidor, por ponto, no ensaio e em produção,
com o SHA congelado da rodada que valeu; o benchmark de lote e o A/B de TTFB, com o controle e o método; a conferência
pós-deploy (no PR de documentação); os 33 critérios autoverificados; o estado de repouso; e a seção **"o que este
relatório NÃO prova"** — no mínimo: que o conferidor provou a forma do dado de produção DE HOJE, e uma linha nova de
forma diferente ainda lança; que o retorno das RPCs que escrevem foi provado pelo SQL, não por execução; que o A/B de
TTFB rodou no volume do ensaio; e que a amarração de tipo pega coluna AUSENTE do `select`, não coluna presente com
semântica errada.
Pendências e **backlog nomeado**: para a **F60** (a linha do mapa onde `p_filial` vira `p_filiais`, e
`getSaldosItens(filialId | null)`); para a **F63** (quantas leituras estritas de colunas explícitas vão precisar de
`empresa_id` no `select`, e a confirmação de que os `select('*')` frouxos já o carregarão); para a **F65** (o nome do
índice na lista, que a recriação quebra); as traduções mortas; os dois `DbClient`; e o alvo de
`validar-truncamento.ts`. **Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final
com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório e comentários de código em **pt-BR**. Identificadores de domínio em português sem
acento (`chamarRpc`, `linhasDe`, `linhaDe`, `CONSTRAINTS_TRADUZIDAS`); utilitários e infra em inglês onde a casa já os
tem assim. Commits em pt-BR no padrão conventional. As mudanças do `registry.ts` em LINGUAGEM DE OPERADOR — há teste que
recusa termos de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~15 minutos)

Esta fase não aplica nada em banco, mas **lê produção** — o censo de nulos e o conferidor antes do merge, o `medir.mjs`
antes e depois, o smoke depois do deploy. O pré-voo existe para essas leituras não travarem no meio da run.

Este arquivo já está salvo em `docs/prompts/F58-fronteira-tipada-do-banco-ultracode.md`, **sem commit** — o agente o
commita na branch da fase. O prompt cita os 20 fatos do cabeçalho pelo número, então ele precisa estar lá quando você
colar o bloco. Não o apague no `git checkout main` do passo abaixo: arquivo não rastreado sobrevive à troca de branch.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. Onde a F57 parou: 1.62.0, tag v1.62.0 no merge do PR #46, árvore limpa.
type package.json | findstr version
git log --oneline -3
git tag --list "v1.6*"
git status --short

# 3. Produção com a mesma versão — é ESTA que a linha de base de TTFB mede.
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude

# 4. As credenciais que a prova usa existem. Imprime só os NOMES, nunca o valor.
Select-String -Path .env.local -Pattern '^(SMOKE_SUPABASE_URL|SMOKE_SUPABASE_ANON_KEY|SMOKE_EMAIL|SMOKE_SENHA|SEED_PROJECT_REF)=' |
  ForEach-Object { ($_.Line -split '=')[0] }

# 5. O smoke de produção passa HOJE (só leitura). Se ele já falha antes, a conferência pós-deploy não prova nada.
node scripts/smoke/smoke-prod.mjs

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**Três coisas que só você confere antes de colar:**

1. **Os cinco nomes do passo 4 apareceram, e o smoke do passo 5 fechou sem falha.** A conta do smoke é a chave da
   decisão 2: se a senha dela tiver expirado, o conferidor não roda — e, por desenho, o PR fica aberto.
2. **A cota de Actions**, em github.com/settings/billing. A fase tem quatro lotes, dois PRs e vários pushes; se a cota
   acabar no meio, o PR não mergeia.
3. **O horário.** O censo e o conferidor leem tabelas inteiras de produção, paginadas. Não travam nada, mas numa
   instância Free as leituras disputam com o uso real — prefira começar fora do expediente.

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` e o `gh` não estão negados — a fase
abre PR, mergeia e publica tag) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).

**MCP:** o **Context7** ajuda de verdade aqui — Zod 4 (`z.looseObject`, `z.strictObject`, `reportInput`) e os tipos do
`rpc()` e do `overrideTypes` no `@supabase/postgrest-js`. O da Supabase **não substitui o conferidor**: `execute_sql`
devolve o JSON do Postgres, e a forma que importa é a do PostgREST que o app recebe. Se ele estiver conectado, o prompt
não pede nada dele.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f58
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda `npm ci`, dois `next start`, scripts que leem produção, `gh pr create`, merge, tag e
push — nada disso cabe numa allowlist estreita, e `bypassPermissions` nesta máquina (com credencial de produção no
`.env.local`) está fora de questão.

**Onde o classificador pode barrar:** a leitura de produção com a conta do smoke. A F49 e a F56 fizeram leituras
equivalentes, então é provável que passe; se não passar, o prompt manda **não reformular** — o PR fica aberto e o comando
exato vai para o topo do relatório, para você rodar e mergear.

**`--worktree` NÃO serve nesta fase:** o censo, o conferidor e o A/B de TTFB precisam do `.env.local`, que não vai para a
worktree — e o prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar. (A
worktree temporária que o agente pode criar só para a build da `main` no A/B é outra coisa: ela recebe as variáveis no
processo e é removida no fim.)

Se a cota semanal estiver apertada, rode os subagentes num modelo mais barato e deixe o Opus só no orquestrador:
`$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`. O custo disso cai sobre a exploração e a revisão
adversarial — na F58, a revisão é onde o modelo forte mais rende; se for economizar, economize na exploração.

Se preferir de madrugada, headless (o prompt vai por stdin, porque o bloco passa do limite de linha de comando do
Windows):

```powershell
# salve só o bloco do prompt em prompt-f58.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f58.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f58.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, lembre que bloqueio repetido do classificador **aborta** a sessão — é mais um motivo para o prompt mandar
registrar a recusa em vez de tentar de novo. De madrugada, desligue a suspensão do Windows (plano de energia) antes.

Recomendado para desatendido — a condição de parada como avaliador separado. Digite o `/goal` logo depois de colar o
prompt, na mesma sessão (no headless por stdin ele não se aplica):

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; zero chamada de rpc em src, fora de arquivo de teste, fora da porta registrada no docs/PLAN-F58.md; as travas rpc-unica-porta e sem-cast-de-leitura existem e passam; nenhum arquivo em supabase/migrations nem src/lib/types/database.ts foi tocado; package.json em 1.63.0; e UM destes dois desfechos: (a) o conferidor rodou em producao sobre o SHA congelado com 0 recusa, 0 erro e a evidencia sem valor real, o PR de codigo e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, a conferencia pos-deploy passou e a tag v1.63.0 foi publicada; ou (b) uma leitura de producao foi barrada, os schemas estao marcados NAO PROVADOS, o PR de codigo esta aberto, sem tag, e o docs/RELATORIO-F58.md traz o bloqueio e o comando no topo
```

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Quatro momentos para acompanhar:

1. **O mapa e o censo, antes do primeiro schema.** `docs/PLAN-F58.md` com o mapa das mentiras, e a evidência do censo de
   produção, têm de existir antes do primeiro commit que toca `src/`. Schema escrito antes do censo é
   palpite — e, com a sua decisão 1, palpite errado é tela quebrada.
2. **A primeira evidência de produção.** Abra o arquivo do censo em `docs/f58-evidencias/` assim que ele aparecer: só
   nome de coluna e número. Um patrimônio, nome ou e-mail ali é dado real entrando no repositório — interrompa a sessão.
3. **A sabotagem C.** A saída do `tsc` recusando um schema com `empresa_id` sobre um `select` sem ele é a prova central
   da fase. Sem ela, `linhasDe` é um `as` com outra roupa.
4. **A sabotagem D.** O teste da coluna desconhecida chegando ao backup. É o que impede a F58 de desfazer, em silêncio, o
   que a F54 consertou.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Leia as atas das decisões **2, 4 e 5** (o mapa das mentiras, a amarração, o modo por categoria) em `docs/DECISOES.md`.
   A F60, a F63 e a F65 herdam as três inteiras — se alguma parecer errada, é agora que custa barato.
3. `git diff v1.62.0 v1.63.0 -- supabase/ src/lib/types/database.ts` deve vir **vazio** (com o PR ainda aberto, sem
   tag: `git diff main...origin/f58-fronteira-tipada-do-banco -- supabase/ src/lib/types/database.ts`).
4. Abra a evidência do conferidor de produção: por ponto de leitura, lidas = aceitas, e nenhum valor em lugar nenhum.
5. Em produção, com os próprios olhos: um relatório GERADO antigo abre; a visão de uma filial numa data passada abre (é a
   `rel_estoque_asof`, a do colaborador nulo); o export de ativos baixa; a ficha de um ativo abre; `/pendencias` abre.
6. Rode você mesmo `npm run test` e `npm run build` uma vez.
7. **Uma tela quebrou em produção por forma?** Não reverta a fase: o log do `registrarFalha` diz a leitura e o caminho do
   campo, e o conserto é um PR no schema daquela leitura. Reverter tudo só se forem várias telas — `git revert` dos
   commits de lote, de trás para frente, + redeploy (não há banco para desfazer).
8. Veio errado de forma mais ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A F57 está fechada e no ar**: `1.62.0`, tag `v1.62.0` no merge do PR #46 (`86bd77d`), árvore limpa, `/api/saude`
   respondendo `1.62.0` — medido em 15/09. Por isso a versão da fase é **`1.63.0`**.
2. **Nenhuma migration e nenhum toque no `database.ts` ou no gerador.** As mentiras do gerador se corrigem na porta e nos
   schemas, com mapa nominal travado contra o SQL — nunca editando o arquivo gerado.
3. **"Lança o erro" segue o caminho de falha que cada leitura já tem.** Onde hoje uma leitura que falha propaga, a forma
   errada propaga; onde a casa degrada de propósito (o card decorativo da série de estoque, o mínimo do catálogo), a
   forma errada degrada igual. Li a sua escolha como "falha de forma = falha de leitura", não como "toda falha de forma
   derruba a página".
4. **"Produção, só leitura" vale para o censo, o conferidor, o `medir.mjs` antes e depois e o smoke pós-deploy** — tudo
   com a conta do smoke, sem escrita, e só com RPCs de uma lista nominal de chamáveis tirada do corpo vivo. RPC que
   escreve não é chamada em banco nenhum, nem no ensaio: a forma do retorno dela se prova pelo SQL vivo. A única escrita
   tolerada é a sessão que o login grava no Supabase Auth — a mesma que o smoke já grava hoje.
5. **Sem a prova de produção, o PR não mergeia.** Se credencial, rede ou o classificador barrarem o conferidor, a fase
   entrega o resto com o PR aberto e o comando para você rodar.
6. **O gate de 10% de TTFB é o A/B local contra o ensaio** (o método da F33), com uma linha de base sequencial medida
   no começo como seguro caso o A/B intercalado seja barrado; a medição de produção antes × depois é registro, com PR
   corretivo se estourar — não gate, porque ela só existe depois do deploy.
7. **Uma run, uma PR, lotes internos** — o padrão que você escolheu na F57.
8. **A trava de cast vai além de `queries/` + `actions/`** onde houver leitura do Supabase (hoje `auth/acesso.ts` e
   `app/(app)/dev/acoes-export.ts`), ou o relatório diz por nome por que não.
9. **A pergunta 1 do roteiro da F57** (compra com patrimônio repetido em outra filial) **continua com você** — a F58 não
   mexe na régua de identidade.
10. **O gate tem SHA, e o fechamento tem dois PRs.** A rodada de produção que libera o merge é a do último commit de
    código; versão, registry e revisão adversarial vêm antes dela. Depois do merge e do deploy, a evidência pós-deploy
    entra por um PR só de documentação, e a tag `v1.63.0` vai no merge dele — como no fechamento da F56.
11. **`linhasDe` cobre os pontos que hoje têm cast, não toda leitura.** As leituras que já usam o tipo inferido ficam
    como estão; a trava só impede o cast de voltar a elas. Estender o Zod a todas seria outra fase.

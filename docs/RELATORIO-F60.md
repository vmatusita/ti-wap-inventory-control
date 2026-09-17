# Relatório F60 — O recorte que corta scan, e o custo do caminho quente

**v1.65.0** · **migrations `0141`–`0145` — NÃO aplicadas em banco nenhum** · 17/09/2026 · SHA de código congelado
**`c516467`** · branch `f60-recorte-que-corta-scan` · código no
[PR #52](https://github.com/vmatusita/ti-wap-inventory-control/pull/52), **em rascunho, aberto e SEM merge** (ata (j) de
`DECISOES.md`) · o CI do PR rodou em `d83f8ec`, **não** sobre o SHA congelado

> As sete leituras de relatório que recortavam por filial com "nulo = tudo" — `(p_filial is null or col = p_filial)`,
> a forma que a R-ACC-71 proíbe e que no caminho real não corta a leitura (o as-of da menor filial lia os mesmos 368
> buffers do consolidado) — ganharam substitutas de nome novo, `rel_*_filiais(p_filiais smallint[], …)`, com o recorte
> ligado por `col = any (p_filiais)`: NULL e `'{}'` devolvem 0 linhas, e o consolidado é a lista EXPLÍCITA de todas as
> filiais, inclusive desativada. A velha sai em arquivo separado, depois do deploy e da prova de que ninguém a chama. Uma
> trava de mesa sobre o replay das migrations e um par no catálogo do CI tornam a forma velha impossível de voltar. O
> caminho quente parou de pagar duas vezes: os KPIs numa ida, `/itens` em duas idas no lugar de sete, a memória por request
> com chave estável, teto obrigatório em `paginarTodos`. **Nada disso está em banco real:** o canal de apply foi desligado
> durante a execução, e pela ordem o PR fica aberto e sem merge. O que existe de prova de banco é do CI e das emulações só
> leitura em ensaio e produção.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você, com os comandos PRIMEIRO

*Nada aqui é pedido de autorização: é o que ficou sem canal nesta sessão. A ordem é a do `PLAN-F60.md` §8, e o
procedimento detalhado mora no Anexo A e em "A janela do `drop`" do [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md), que
prevalecem sobre qualquer resumo daqui.*

### ⚠ Antes de tudo: o canal caiu, e é você quem o devolve

**O que aconteceu.** Na madrugada de 17/09, com o lote 2 pronto e o CI verde (`d83f8ec`), todas as ferramentas do conector
da **Supabase** passaram a responder *"This tool has been disabled in your connector settings"* — inclusive `list_projects`
e `list_migrations`, que só leem. Não havia `SUPABASE_ACCESS_TOKEN` no ambiente. A ordem manda, nesse caso, não contornar
nem procurar o token: entregar tudo o que não depende de banco real, verde no CI, com o PR **aberto e sem merge**. Por isso
**nenhuma migration da fase foi aplicada**, produção está exatamente como na `1.64.0`, e a tag `v1.65.0` não existe.

**Devolver o canal (2 minutos):** em claude.ai → *Settings → Connectors → Supabase*, reabilite as ferramentas do conector
(no mínimo `list_projects`, `list_migrations`, `execute_sql`, `apply_migration`, `get_advisors` e
`generate_typescript_types`).

**Caminho recomendado — o agente termina a fase.** Numa sessão `claude` na raiz do repositório, na branch
`f60-recorte-que-corta-scan`, com o conector reabilitado, cole:

```text
Retome a fase F60 do ponto em que o docs/RELATORIO-F60.md §1 parou: o canal da Supabase voltou. Siga os passos 0 a 5 do
§1 na ordem, sem refazer o que o relatório já prova — ensaio (0141→0145 com a verificação, a equivalência com a função de
verdade entre a 0143 e a 0145, o "depois" do harness de itens e os tipos conferidos), produção antes do merge (0141, 0142,
0143, a equivalência real, o conferidor, o explain "depois" e a confirmação do orçamento do as-of), o merge do PR #52 com
verificar e banco-sem-docker verdes, a conferência pós-deploy, a janela do drop pela receita do RUNBOOK-BANCO.md, as duas
rodadas do TTFB "depois", o PR só de documentação e a tag anotada v1.65.0. Regras da ordem
docs/prompts/F60-recorte-que-corta-scan-ultracode.md (Frente F e "Git e segurança") valem inteiras. Atualize este
relatório, a ata e as evidências.
```

**Se preferir fazer à mão**, os passos abaixo são os mesmos — o apply pelo SQL Editor (caminho B) colando cada arquivo
inteiro. Só a equivalência com a função de verdade e a leitura do `pg_stat_statements` da janela do `drop` dependem dos
instrumentos, que emitem SQL para você colar e gravar a resposta; se for fazer só o apply à mão, pare no passo 2.1 e deixe o
resto para o agente — **nunca** faça o merge sem a equivalência real, nem o `drop` sem a janela.

**O canal.** Caminho A: o MCP da Supabase (`apply_migration` para as migrations, `execute_sql` para as leituras). Sem MCP:
caminho B, o SQL Editor, colando cada arquivo inteiro. **Não há script de apply no repositório** — o "caminho da `0131`" era
um padrão escrito na hora (runbook, "O canal"). Nenhum passo abaixo lê dado de linha: só contagens, hashes e nomes.

### 0. Antes do primeiro apply — publicar e ter o CI sobre o SHA que vai ao banco

Os commits de `2aafb30` até o HEAD não foram publicados; o PR #52 aponta `d83f8ec`. A emenda F56 exige o CI rodando a cadeia
`0001`→`0145` **sobre o que vai ser aplicado** — o run 35178186717 é anterior ao lock regravado da `0143`/`0145`
(`5094f6f`) e à revisão final.

```bash
git push origin f60-recorte-que-corta-scan
gh pr checks 52 --watch            # verificar E banco-sem-docker verdes sobre o HEAD
gh pr edit 52 --body-file <arquivo> # o corpo atual diz "926 células" e não declara o bloqueio do canal
```

### 1. O ENSAIO — as cinco na ordem da cadeia (não há app de produção lá: o `drop` não espera deploy)

1. **Apply `0141_rel_contagem_status.sql`**, depois **`0142_lanc_item_criado_por_idx.sql`**, depois **`0143_rel_filiais.sql`**.
2. **Verificação pós-apply** (depois da `0143`), só leitura — esperado: **8 linhas**, `anon` false, `authenticated` e
   `service_role` true, e o `md5` igual ao da coluna da direita:

   ```sql
   select p.oid::regprocedure as funcao,
          has_function_privilege('anon', p.oid, 'execute')          as anon,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
          has_function_privilege('service_role', p.oid, 'execute')  as service_role,
          p.prosecdef, p.provolatile, p.proisstrict, p.proconfig,
          md5(regexp_replace(p.prosrc, '\s+', ' ', 'g'))             as md5_normalizado
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'rel\_%\_filiais'
    order by 1;
   ```

   | função | `md5_normalizado` esperado |
   |---|---|
   | `rel_contagem_status_filiais` | `695b38a8b50fe95e743e30460fecc881` |
   | `rel_mov_por_mes_filiais` | `f961349ded4db3fb17a16fe503b9201b` |
   | `rel_por_motivo_filiais` | `4340acc35728a592c2de946aea822042` |
   | `rel_resumo_filiais` | `ad948cbb7c544eec083d271b8cf27184` |
   | `rel_frescor_itens_filiais` | `edd2fa35a094951f31b3cfeacc8f7ba8` |
   | `rel_mov_itens_filiais` | `55be37e2a84b5e9449f388498585b02b` |
   | `rel_saldo_itens_filiais` | `01aa17a8aee42557345de6f4f77fba02` |
   | `rel_estoque_asof_filiais` | `54943d2f41e17dd1c648b32e10fd43f4` |

   E NULL e `'{}'` → **0** nas oito (o mesmo que `f60_recorte.sql` 1a–1h prova no CI):

   ```sql
   select 'contagem' f, (select count(*) from public.rel_contagem_status_filiais(null)) nulo, (select count(*) from public.rel_contagem_status_filiais('{}')) vazio
   union all select 'mov_por_mes', (select count(*) from public.rel_mov_por_mes_filiais(null, current_date - 364, current_date)), (select count(*) from public.rel_mov_por_mes_filiais('{}', current_date - 364, current_date))
   union all select 'por_motivo', (select count(*) from public.rel_por_motivo_filiais(null, current_date - 364, current_date)), (select count(*) from public.rel_por_motivo_filiais('{}', current_date - 364, current_date))
   union all select 'resumo', (select count(*) from public.rel_resumo_filiais(null, current_date - 364, current_date)), (select count(*) from public.rel_resumo_filiais('{}', current_date - 364, current_date))
   union all select 'mov_itens', (select count(*) from public.rel_mov_itens_filiais(null, current_date - 364, current_date)), (select count(*) from public.rel_mov_itens_filiais('{}', current_date - 364, current_date))
   union all select 'frescor', (select count(*) from public.rel_frescor_itens_filiais(null, current_date)), (select count(*) from public.rel_frescor_itens_filiais('{}', current_date))
   union all select 'saldo_itens', (select count(*) from public.rel_saldo_itens_filiais(null, current_date)), (select count(*) from public.rel_saldo_itens_filiais('{}', current_date))
   union all select 'asof', (select count(*) from public.rel_estoque_asof_filiais(null, current_date)), (select count(*) from public.rel_estoque_asof_filiais('{}', current_date));
   ```

   Depois: `notify pgrst, 'reload schema';` e `get_advisors(security)` sem achado novo. ⚠ Com a `0143` e sem a `0145`, o
   bloco 7 de `catalogo_secdef.sql` fica VERMELHO em `7a`/`7b` nomeando as sete velhas — é o estado esperado da janela.
3. **A equivalência com a FUNÇÃO de verdade**, ENTRE o apply da `0143` e o da `0145` (os blocos recusam sozinhos função
   nova ausente, `prosrc` diferente do versionado e velha já derrubada; só contagem e hash):

   ```bash
   node scripts/perf/equivalencia-rel.mjs gerar-equivalencia-real --alvo=ensaio \
        --datas=docs/perf/f60-datas-amostra.json --dir=<fora-do-repo>
   # executar cada .sql pelo canal; gravar a resposta em <dir>/respostas/<nome>.resposta.txt
   node scripts/perf/equivalencia-rel.mjs analisar-equivalencia --real --dir=<mesma> --saida=<fora>/f60-equivalencia-real.json
   ```

   Esperado: **1.004 células** no banco, **0 divergentes** (a emulação deu isso). Qualquer divergência segura tudo.
4. **A `0144`** com a sonda de conjunto IMEDIATAMENTE antes e depois, no mesmo banco — os dois pares iguais; diferente é
   rollback, sem discussão:

   ```sql
   select count(*), md5(string_agg(v::text, '|' order by v::text)) from public.v_colaboradores_textos v;
   ```
5. **A `0145`**, `notify pgrst, 'reload schema';`, e a prova de AUSÊNCIA (esperado `null` nas sete):

   ```sql
   select a.assinatura, to_regprocedure(a.assinatura) as ainda_existe
     from (values
       ('public.rel_estoque_asof(smallint, date)'), ('public.rel_saldo_itens(smallint, date)'),
       ('public.rel_mov_itens(smallint, date, date)'), ('public.rel_frescor_itens(smallint, date)'),
       ('public.rel_mov_por_mes(smallint, date, date)'), ('public.rel_por_motivo(smallint, date, date)'),
       ('public.rel_resumo(smallint, date, date)')
     ) as a(assinatura);
   ```
6. **O "depois" do harness de itens** (o índice da `0142`; o harness ESCREVE e APAGA — só ensaio, com a limpeza conferida
   por contagem):

   ```bash
   MEDIR_ITENS_CONFIRM=sim node scripts/perf/medir-itens.mjs gerar --alvo ensaio --ref sgmvldiizsrjbxzzpmhh --canal mcp --dir <fora-do-repo>
   node scripts/perf/medir-itens.mjs analisar --alvo ensaio --ref sgmvldiizsrjbxzzpmhh --dir <mesma> --saida <fora>/f60-itens-ensaio-depois.json
   ```

   Esperado: `Index Scan using lanc_item_criado_por_idx` sem nó de sort, buffers parados.
7. **Os tipos do ensaio**, para conferir o hand-fix — o diff vai para a evidência, NÃO para o commit:

   ```bash
   DB_TYPES_PROJECT_REF=sgmvldiizsrjbxzzpmhh npm run db:types && git diff --stat src/lib/types/database.ts
   git restore src/lib/types/database.ts       # o arquivo do commit é o de PRODUÇÃO, depois do drop (passo 4.7)
   ```

### 2. PRODUÇÃO, ANTES DO MERGE — só a `0141`, a `0142` e a `0143`

Nada disso quebra a `1.64.0` no ar: são funções de nome novo e um índice.

1. Apply `0141` → `0142` → `0143`, cada um com a verificação do passo 1.2 (as mesmas duas consultas, os mesmos `md5`).
2. A equivalência com a função de verdade — `--alvo=producao` nos dois comandos do passo 1.3. **1.004 células, 0
   divergentes, ou não há merge.**
3. O conferidor de formas sobre os descritores novos (conta do smoke, só contagens):

   ```bash
   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/formas/conferir.mts --alvo=producao --saida=<fora>/conferidor-producao-f60.json
   ```
4. O `explain` "depois" das sete pelo gerador do "antes" (os nomes novos), e o da `rel_contagem_status_filiais` e do as-of
   com a CHAMADA da função — que também grava a confirmação do orçamento do as-of:

   ```bash
   node scripts/perf/medir-rel.mjs gerar-a1 --funcao=rel_estoque_asof_filiais --dir=<fora-do-repo>   # e as outras seis _filiais
   node scripts/perf/medir-rel.mjs analisar-a1 --conjunto=depois --dir=<mesma> --saida=<fora>/f60-producao-depois-rel.json
   node scripts/perf/equivalencia-rel.mjs gerar-custo-real --alvo=producao --hoje=AAAA-MM-DD --dir=<mesma>
   node scripts/perf/equivalencia-rel.mjs analisar-custo --real --dir=<mesma> --saida=<fora>/f60-custo-real.json \
        --confirmar-orcamento=docs/perf/asof-orcamento.json
   ```

   O último grava só `medicao.confirmacao` no orçamento; o hash não muda (o `md5` do `prosrc` é conferido no bloco).

### 3. O MERGE e a conferência

```bash
gh pr ready 52 && gh pr checks 52 --watch   # e o merge, com verificar e banco-sem-docker verdes
```

Depois do deploy `READY`: `https://ti-wap-inventory-control.vercel.app/api/saude` com `"versao":"1.65.0"` e o commit do
merge; `node scripts/smoke/smoke-prod.mjs` com **0 falha** (a Parte B chama as funções novas). Abra `/itens` e
`/relatorios/geral`: os números são os de antes — nesta fase nenhum número de tela muda. As referências contadas em
16/09/2026 (só leitura): **1.635** ativos, a soma dos KPIs **1.622** pelos três caminhos, e as três tabelas do período em
365 dias com **155** saídas, **136** entradas e **14** transferências no consolidado — o aviso de "mais de 2.000 linhas"
não aparece em lugar nenhum. (Esses números andam com o acervo; o que não pode acontecer é mudarem na virada do deploy.)

### 4. A JANELA DO `drop` — produção, depois do deploy

1. **T0** — a leitura do `pg_stat_statements` por papel, velhas e novas (o SQL inteiro está no passo 2 da receita do
   runbook; saem só papel, chamadas, formas, `dealloc` e `stats_reset`).
2. **Tráfego real:** `node scripts/perf/medir.mjs --rotulo janela --saida <fora>/f60-janela.json` e
   `node scripts/smoke/smoke-prod.mjs`.
3. **A prova ESTÁTICA do papel `service_role`** (o visualizador não tem tráfego sem uma senha ativa resolvida, então Δ = 0
   ali não prova nada) — o primeiro tem de sair VAZIO, o segundo verde:

   ```bash
   git grep -nE "['\"]rel_(estoque_asof|saldo_itens|mov_itens|frescor_itens|mov_por_mes|por_motivo|resumo)['\"]" -- 'src/**' 'scripts/**' ':!**/*.test.*' ':!scripts/perf/**' ':!scripts/db/gerar-0134.mjs'
   npx vitest run src/lib/queries/relatorios/fronteira-viewer.test.ts
   ```
4. **Espera de ao menos 30 minutos.** **T1** — o mesmo SQL.
5. **O `drop` só se os quatro valerem:** Δ das VELHAS = 0 em `authenticated`, `service_role` e `anon`; Δ das NOVAS > 0 em
   `authenticated` (em `service_role`, 0 só com a prova estática do item 3); `dealloc` igual; `stats_reset` igual.
   Chamador achado: NÃO derrube — identifique por papel e forma, espere, releia.
6. **Aplicar** a `0144` (com a sonda do passo 1.4 antes e depois) e a `0145`; `notify pgrst, 'reload schema'`; a prova de
   ausência do passo 1.5; `node scripts/smoke/smoke-prod.mjs` de novo; a sonda de paridade ensaio × produção (runbook).
7. **Os tipos de PRODUÇÃO**, que substituem o hand-fix no commit:
   `DB_TYPES_PROJECT_REF=pbtjcalbmepmrqzprusb npm run db:types` → PR de documentação.
8. **Se o classificador barrar o `drop`:** registrar, não reformular; as velhas ficam (ninguém as chama) e o `drop` vai
   pelo SQL Editor.

### 5. Depois da janela

1. O TTFB "depois": `node scripts/perf/medir.mjs --rotulo depois --saida docs/perf/f60-producao-depois-1.json` e uma
   segunda rodada em outro momento, contra a faixa A/A de `f60-producao-antes-aa-{1,2}.json` corrigida pela deriva das rotas
   de controle (critério 27).
2. O PR só de documentação com as evidências pós-apply e da janela, e a tag no merge dele:
   `git tag -a v1.65.0 -m "F60 — o recorte que corta scan" <merge> && git push origin v1.65.0`.
3. Conferir o que a versão mudou: `git diff v1.64.0 v1.65.0 --stat`. **Deve aparecer:** as cinco migrations `0141`–`0145`
   e o lock; `src/lib/queries/**`, `src/lib/supabase/rpc.ts`, `src/lib/types/database.ts`, os componentes de relatório e as
   30 páginas do grupo `(app)` (o `maxDuration`); `scripts/db/recorte-rel.mjs`, `scripts/perf/**`, os roteiros de
   `supabase/tests/**`, os documentos. **Não deve aparecer:** nenhuma migration de `0001` a `0140`, `CLAUDE.md`, `.env*`.
4. `npm run test` uma vez, na sua máquina — esperado **228 arquivos, 6.432 testes**.

### 6. Rollback — se precisar

A ordem inteira, nos dois estados de produção, está no Anexo A do runbook ("A ordem de rollback da fase"). Dois avisos
que custaram achado na revisão final: **reverter o app NUNCA é `git revert` do merge inteiro**; e a migration de reversão
reprova o CI não só pela trava (que pede a exceção declarada), mas pelas guardas que fixam o universo de hoje
(`rpcs-recorte-sql.test.ts` describe 1, `asof-orcamento.test.ts`, as listas de `migrations-f38.test.ts`) — reconciliadas
no mesmo commit, com ata.

---

# 2. O que mudou, por arquivo e por quê

183 arquivos entre `4c380ec` (`v1.64.0`) e `c516467`, mais os de documentação depois dele.

- **O banco** — `supabase/migrations/0141_rel_contagem_status.sql` (os KPIs numa ida), `0142_lanc_item_criado_por_idx.sql`
  (o índice, pela medição do ensaio), `0143_rel_filiais.sql` (as sete `_filiais` com os grants), `0144_colaboradores_textos_por_nome.sql`
  (a view pela chave de nome distinto), `0145_drop_rel_filial.sql` (o `drop` das sete velhas, arquivo separado); o lock.
- **A trava** — `scripts/db/recorte-rel.mjs` (replay, R1–R4, falha fechada; na revisão final, a cobertura por tabela e a
  dependência do recorte), `src/lib/validators/rpcs-recorte-sql.test.ts` (describes 1–7), o bloco 7 de
  `supabase/tests/catalogo_secdef.sql` (`7a`–`7g`, `k_excecoes_recorte`), `catalogos-seguranca.test.ts`; as mutações em
  `scripts/db/mutacoes.mjs` (oito novas, duas reancoradas) e o teto em `mutacoes.test.mts`.
- **Os roteiros** — os 59 pontos de 8 roteiros migrados para as `_filiais` (lista de rótulos idêntica antes × depois);
  `f60_recorte.sql` novo (NULL/`'{}'`, filial desativada, chamado que atravessa filiais); `asof_desempate.sql` 11a–11c.
- **A porta e os chamadores** — `src/lib/supabase/rpc.ts` (as sete fora de `ARGUMENTOS_ANULAVEIS`, os mapas de retorno),
  `src/lib/queries/relatorios/recorte-filiais.ts` (novo: `filiaisDoConsolidado`, `recorteDeFiliais` — onde o `null` morre),
  `relatorios/estoque.ts`, `relatorios/itens.ts`, `relatorios/movimentacoes.ts` (os estornos por `.in('estorno_de', ids)`),
  `queries/itens.ts` e `lib/itens/**` (os dois níveis de `/itens`), `queries/dashboard.ts` (novo: os KPIs pela `0141`),
  os descritores de forma e `fronteira-viewer.test.ts` (troca 1:1, catraca `≤ 7`), `scripts/smoke/**`, `scripts/formas/**`,
  `scripts/seed.ts`, `validar-truncamento.ts`.
- **O custo** — `paginarTodos`/`paginarPorIds` com `cap` obrigatório e keyset pela PK (`relatorios/comum.ts`);
  `src/lib/queries/memo-do-request.ts` (novo) e `auth/recorte-leitura.ts` (`chaveDasUnidades`); o teto das três tabelas
  (`lib/relatorios/teto-tabela.ts`, `components/relatorios/aviso-teto-tabela.tsx`); `maxDuration` nas 30 páginas.
- **A medição** — `scripts/perf/medir-rel.mjs`, `medir-custo.mjs`, `equivalencia-rel.mjs` (na revisão final, os modos
  `*-real`), `instrumentos-f60.test.mts`, `medir-itens.mjs` (as formas que o app emite); `docs/perf/f60-*.json` e
  `docs/perf/asof-orcamento.json` com a trava `src/lib/validators/asof-orcamento.test.ts`.
- **A versão e os documentos** — `package.json` `1.65.0`, `CHANGELOG.md`, `src/lib/versoes/registry.ts`; `PLAN-F60.md`,
  a emenda F60 da `MATRIZ-REGRAS.md`, o Anexo A e a receita da janela no `RUNBOOK-BANCO.md`, `ARQUITETURA.md`, o índice,
  a nota F60 da ficha em `PLANO-MULTIEMPRESA.md`, as atas F60 (duas de 16/09, as dez decisões e (a)–(k) de 17/09) e
  `docs/f60-evidencias/`.

---

# 3. Os números MEDIDOS, lado a lado com a ficha e a ordem

| o quê | a ficha / a ordem | medido | onde |
|---|---|---|---|
| primeira migration da fase | ficha: `0137` | **`0141`** (as `0137`–`0140` foram gastas pela F54→F56) | PLAN §1 |
| `NOT NULL` em `p_filiais` | ficha | **não existe** em parâmetro de função; "não-anulável" = conjunção direta + porta + trava | decisão 1 |
| `rel_*` vivas | "sete" | **oito** (a oitava, `rel_saldo_colaborador`, recorta por pessoa) → **nove** depois (as oito `_filiais` + a exceção) | decisão 9 |
| "10 chamadores" | ficha | **8** no app · **1** pela porta · **7** diretos em scripts · **59** chamadas em **8** roteiros · **2** mutações · mapas, descritores e listas | PLAN §1, fato 10 |
| "duas vezes por request" | ficha | só `contarConflitosAbertos`, com argumento-objeto que o `cache()` nunca acerta | decisão 6 |
| `paginarTodos` | "7 chamadores" | **48** + **5** de `paginarPorIds` | decisão 5 |
| visualizador sem teto | ficha | herda os **8 s** do `authenticator` | ata (f) |
| precedência do ajuste | ficha | `data desc, ordem desc` desde a F53 | R-REL-35 |
| a divergência de `/itens` | `itens/page.tsx:187-191` | em `lib/itens/lista.ts` e em **dois** pontos de `itens-table.tsx` | PLAN §1, fato 9 |
| `lanc_item_criado_por_idx` | provar em produção | **não se prova** com 155 lançamentos (0,31–0,33 ms); no ensaio, sem lançamento do autor: **2,19 ms / 258 buffers** com 10.035 linhas e **10,41 ms / 1.286** com 50.035 → entrou (`0142`) | ata (b) |
| `movimentacoes_ordem_lista_idx` | "morto?" | **vivo**: 28 formas / 5.931 chamadas (`authenticated`), 18 / 646 (`service_role`) → fica | ata (d) |
| agregado do PostgREST | `group by` direto | **desligado** nos dois bancos → RPC `0141` | decisão 6 |
| keyset | geral | RPC não compila pela porta; ordem composta sem cursor simples → keyset só pela PK (**33** + P2 + P6), OFFSET em **13 + 4** + 1 | decisão 5 |
| o "não-sargável" | ficha | confirma no caminho real (368 buffers para 5 ou 1.624 linhas); o `EXPLAIN` com literal não foi usado | PLAN §1, fato 6 |
| produção viva | ordem: 1.620 / 3.556 / 148 / 32 | **1.635** ativos · **3.578** movimentações · **155** lançamentos · **34** colaboradores · 6 filiais ativas | ata (i) (e) |
| células da equivalência | plano: 924 | **1.004** por banco, **0** divergentes, ensaio e produção (EMULADA) | `f60-equivalencia-emulada.json` |
| as-of novo × velho | "mais barato" | **mais caro**: 1,58–1,82× no consolidado (+21–27 ms), 1,68–2,29× numa filial (+13–22 ms); para de crescer com o histórico | ata (a) |
| `/itens` por render | 1 + N | **1 + 6 = 7** → **2** idas | decisão 2 |
| KPIs | paginar `ativos` | 2 páginas (1.000 + 622 linhas, 1,50 + 2,11 ms) → **1** ida, **1,43 ms**; **1.622** nos três caminhos | decisão 6 |
| colaboradores | paginar a tela | chave por nome distinto: **~100 → ~50 ms**, **922** linhas, mesmo `md5` (emulado) | ata (c) |
| mutações ativas / teto | teto 85 | **90** ativas (82 + 8), **90/90** no CI, teto **95** | ata (g) |
| suíte | 219 / 5.997 | **228 / 6.432** (6.350 no fecho da execução; +82 na revisão final) | §11 |

**As catorze divergências que a ordem declarou** se confirmaram todas (`PLAN-F60.md` §1.1, ata (i)); as de cima são elas,
com o número. **As que a execução achou além** — (a) a (t) do censo e as onze depois do plano — estão na ata (i) e não se
repetem aqui; a revisão final acrescentou as da §10.

---

# 4. As dez decisões, com o custo que decidiu cada uma

A escolha inteira, com contexto e reversibilidade, está na ata "As dez decisões da fase" (17/09/2026). Aqui, o número.

1. **As assinaturas** — nome + `_filiais`, `p_filiais smallint[]`, `sql stable security invoker set search_path = public`,
   não `strict`, grants na mesma migration. *Decidiu:* o as-of da menor filial lia **368** buffers para **5** linhas; trocar
   o tipo no lugar derrubaria a `1.64.0` no ar.
2. **O consolidado** — lista explícita com desativada (`filiaisDoConsolidado`), o `null` morre em `recorteDeFiliais`;
   `/itens` em dois níveis. *Decidiu:* a soma das colunas não é o total quando um chamado atravessa filiais
   (`f60_recorte.sql` 3a: **0** × **5** atrelados, estoque **20** × **15**).
3. **O as-of** — lateral ancorada em `ativos`, estorno correlacionado, detentor uma vez por linha, sem pré-filtro, sem índice
   novo. *Decidiu:* é a única família que a R4 aceita; o `Incremental Sort` por ativo é ~**7–10%** do corpo.
4. **A janela do `drop`** — arquivos separados, T0 → tráfego → ≥ 30 min → T1, quatro condições. *Decidiu:* o
   `pg_stat_statements` separa por papel (`rel_saldo_itens` **8.406** chamadas de `authenticated`, **211** de `service_role`).
5. **`paginarTodos`** — `cap` obrigatório por domínio (≥ 20× o volume, piso 10.000), keyset pela PK. *Decidiu:* a guarda da
   chave não vê repetição na virada da página (**1.500 de 1.501** linhas).
6. **O caminho quente** — memória por request com chave primitiva; KPIs pela `0141`; `count` de `/ativos` `exact` (**1,34
   ms** sem busca, **7,73 ms** com); teto **2.000** nas três tabelas (~**13×** de folga); `maxDuration` 28 × 60 e 2 × 300;
   `statement_timeout` conferido, sem `alter role`.
7. **Os índices** — `lanc_item_criado_por_idx` entra (ensaio, linear); `movimentacoes_ordem_lista_idx` fica (consumidor
   identificado); o da lateral e `lanc_item_ordem_lista_idx` não entram.
8. **Colaboradores** — a chave por nome distinto antes do agregado: **~100 → ~50 ms**, mesmo conjunto.
9. **A trava** — mesa sobre o replay + par `7a`–`7g` no catálogo; a oitava como exceção permanente numa fonte só, e só com
   uma assinatura viva. *Decidiu:* proibir a substring `is null or` deixa passar `or p is null` e `coalesce(p, col) = col`.
10. **O orçamento do as-of** — sha256 do corpo vivo pelo replay + a medição; nunca calendário. *Decidiu:* um orçamento por
    data ficaria vermelho com o projeto parado; dentro da própria fase o corpo mudou uma vez (`497f7784…` → `54943d2f…`).

---

# 5. As sabotagens, com a saída real

| | O que se quebrou | O que acusou | Evidência |
|---|---|---|---|
| **A** | a trava contra a cadeia de ANTES do lote 2 | a mesa vermelha nomeando as **sete**; o par, só leitura, `7a` **7** · `7b` **7** · `7c`–`7g` **0**, universo **8**, igual no ensaio e em produção | `sabotagem-a-mesa-vermelha*.txt`, `sabotagem-a-par-catalogo-vermelho.txt` |
| **B** | as formas disfarçadas do fail-open, em memória | **20** reprovam pela regra nomeada, **7** passam | `sabotagem-b-disfarces.txt` |
| **C** | uma chamada de `paginarTodos` sem o teto | `TS2554: Expected 3 arguments, but got 2` | `sabotagem-c-cap.txt` |
| **D** | o orçamento do as-of sem o JSON / com um byte do corpo trocado | "ausente" (11 de 14) / "velho" (7 de 14); restaurado, 14 de 14 | `sabotagem-d-orcamento.txt` |
| **E** | as mutações do bloco 7 e dos cenários, no CI | **90/90** detectadas pelo rótulo nomeado (run 35173319638) | `sabotagem-e-ci-run1.txt` |
| **F** | os dois níveis de `/itens` desfeitos (consolidado = Σ colunas) | `expected 8 to be 12` | `sabotagem-f-itens-dois-niveis.txt` |
| **G** | o pré-filtro do as-of pela filial de HOJE | a mutação `f60-asof-pre-filtra-pela-filial-de-hoje` derrubada pelo **11a** no CI | `sabotagem-e-ci-run1.txt` |
| **H** | NULL e `'{}'` nas oito funções novas | **0** linhas em `f60_recorte.sql` 1a–1h (CI); e na equivalência emulada, nos dois bancos | `sabotagem-e-ci-run1.txt`, `f60-equivalencia-emulada.json` |
| **I** | a chave da memória por request como o objeto cru | **13 de 23** vermelhos (duas leituras por request); restaurada, 23 verdes | `sabotagem-i-cache.txt` |

**E a da revisão final:** a mesma bateria de 28 formas rodada com `recorte-rel.mjs` de `5094f6f` e com o do HEAD — **12**
formas de fail-open passavam e agora reprovam, as **16** legítimas seguem passando, e os harnesses dos revisores viram de
"PASSA" para "REPROVA" (`revisao-final-trava-antes-depois.txt`).

---

# 6. A equivalência

**EMULADA, antes de qualquer apply:** o corpo novo colado como subconsulta com literais tipados × a função velha do banco,
`count(*)` e `md5` das linhas com o mesmo tipo declarado, nas 12 datas de amostra × (consolidado com desativada + cada
filial por ordinal) × janelas 7d/365d nas de período, o saldo em três comparações, e os KPIs: **1.004 células por banco,
0 divergentes, no ensaio e em produção** (`docs/perf/f60-equivalencia-emulada.json`); com NULL e `'{}'`, 0 linhas nas oito.

**Com a função de verdade:** PENDENTE — o comando está no §1 (passos 1.3 e 2.2). Até a revisão final ele não existia; o
instrumento só sabia colar o corpo.

---

# 7. A janela do `drop`

**Não abriu.** Sem apply não há deploy, e sem deploy não há `drop` (ata (j)). A receita — T0, tráfego, prova estática do
`service_role`, ≥ 30 min, T1, as quatro condições, e o que fazer com chamador achado — está em "A janela do `drop` —
receita" do runbook, e os comandos no §1.4. `main` e produção seguem na `1.64.0` com as sete velhas vivas.

---

# 8. O custo, antes × depois

| | antes (medido) | depois | fonte |
|---|---|---|---|
| KPIs do dashboard | 2 páginas: 1.000 + 622 linhas, 1,50 + 2,11 ms de banco | 1 ida, 1,43 ms (`Index Only Scan ativos_filial_status_idx`) — medido sobre a forma, antes do apply | decisão 6 |
| `/itens` por render | 7 chamadas de saldo | 2 idas | decisão 2 |
| conflitos no shell | 2 leituras por request | 1 (sabotagem I) | decisão 6 |
| lista de nomes sem cadastro | ~100 ms | ~50 ms, mesmo conjunto (emulado em produção) | ata (c) |
| as-of consolidado, hoje | 38,9 ms (corpo `0134`) | 65,7 ms (réplica 54,7 × 34,7) — **mais caro, aceito** | ata (a) |
| `getUltimoLancamento`, autor sem lançamento (ensaio, 50.035) | 10,41 ms, 1.286 buffers | PENDENTE (o "depois" do harness, §1.6) | ata (b) |
| TTFB das rotas | `f60-producao-antes-aa-{1,2}.json` | PENDENTE (critério 27) | PLAN §3.7 |

---

# 9. O orçamento do as-of

`docs/perf/asof-orcamento.json`: `rel_estoque_asof_filiais(smallint[], date)`, sha256 da definição viva pelo replay
`78e967373c53…`, medição de produção sobre o corpo EMULADO — **65,722 ms** de mediana (p95 80,677), **18.638** buffers,
**1.624** linhas, os nós do plano. A trava reprova ausente, velho, incompleto, outra assinatura, ilegível e sem corpo vivo;
a mesma medição datada de 2000 passa. **Revisão final:** a identidade da função passou a ser a do Postgres — `create or
replace` com `int2[]`/`smallint []`/`_int2`/`pg_catalog.date` e `drop` sem lista de argumentos agora dão "velho" e "sem
corpo vivo" (antes, "ok" sobre um corpo que o banco não teria). **A confirmação chamando a função:** PENDENTE, pelo comando
do §1, passo 2.4.

---

# 10. A revisão adversarial final

Subagentes em contexto fresco contra a ordem, o plano e os 34 critérios; cada achado passou por um cético. **22 mantidos,
22 tratados** — a ata (k) tem a escolha e o motivo de cada um.

| # | Achado | Tratamento | Commit |
|---|---|---|---|
| 1, 3 | R3 olhava só o token vizinho: `x or y and col = any (p_filiais)` e `… and true or true` passavam; `$1` invisível | varredura até o limite da cláusula; `$n` reprova | `36b6486` |
| 2, 4 | ligação no `on` de LEFT/RIGHT/FULL JOIN cobria o lado preservado | cobertura por tabela, ciente do tipo de junção | `36b6486` |
| 5 | corpo com dois comandos: o R4 lia o primeiro, a função devolve o último | ilegível | `36b6486` |
| 6 | o corpo julgado era o primeiro `$…$` (um `default` isca) | o literal depois do `as` de nível zero | `36b6486` |
| 7 | DDL dinâmico em corpo entre aspas/E-string escapava | falha fechada também ali | `36b6486` |
| 8 | a chave do replay com a grafia crua do tipo; `drop` sem lista | tipo canônico; nome único | `36b6486` |
| 9 | junção decorativa (`cross join filiais`) cobria as outras tabelas | propagação só por igualdade de chave | `36b6486` |
| 10 | função no FROM, `(table x)`, alias sombreado | ilegível / leitura / herança por chave | `36b6486` |
| 11 | `rename to U&"…"` passava em silêncio | falha fechada | `36b6486` |
| 12, 16 | sem comando para a equivalência real, o "depois" do B1 e a confirmação do orçamento | modos `*-real` (e `--real` sem engolir a opção seguinte) | `e8befbe`, `74ec025`, `c516467` |
| 13 | a migration de reversão reprova guardas que o runbook não citava | listadas no Anexo A | docs |
| 14, 21 | o §11 do plano mandava `git revert` do merge | corrigido; escopo do commit misto | docs |
| 15 | Δ = 0 em `service_role` aceito por falta de tráfego | prova estática | docs |
| 17 | "o caminho da `0131`" não é script | o runbook diz o que é | docs |
| 18 | este relatório não existia | criado | docs |
| 19 | `5094f6f` sem ata, e três documentos o desmentindo | ata (k); matriz e runbook | docs |
| 20 | SHA não gravado; o CI citado não cobre o HEAD | `c516467` gravado; CI sobre ele é o passo 1.0 | docs |
| 22 | o registry generalizava 1,6–1,7× | as duas faixas medidas | `754d1d4` |

**Não feito, declarado:** mutação nova no injetor para as formas dos achados 1–11 (exige banco descartável; a regressão
fica no describe 7, que roda em `npm run test`); o push, o CI sobre `c516467` e o corpo do PR (§1.0).

---

# 11. Os 34 critérios, autoverificados

| # | Critério | Estado | Onde |
|---|---|---|---|
| 1 | lint, test, build, tsc, `verificar:actions` | ✅ | `c516467`: 228 / 6.432; `revisao-final-build.txt` |
| 2 | o `PLAN-F60.md` com censo, tabelas, linhas de base, datas | ✅ | PLAN §1–§3, antes dos lotes (§12) |
| 3 | sete novas com `= any (p_filiais)`, NULL e `'{}'` → 0 em roteiro | ✅ CI · banco real PENDENTE | `f60_recorte.sql` 1a–1h |
| 4 | grants nos dois bancos, 6a verde | ✅ CI · dois bancos PENDENTE | `catalogo_secdef.sql` 6a, `7e` |
| 5 | as-of lateral, `asof_desempate.sql`, transferido depois da data | ✅ CI | 11a–11c, R-REL-35 |
| 6 | equivalência igual no ensaio e em produção | ✅ EMULADA (1.004 × 2) · real PENDENTE, comando no §1 | §6 |
| 7 | consolidado com desativada; nenhum número muda | ✅ roteiro + emulação · real PENDENTE | decisão 2 |
| 8 | `/itens` colunas + consolidado; `estoqueForaDasColunas` | ✅ (numa LEITURA paginada: 2 idas — divergência declarada) | sabotagem F |
| 9 | chamadores migrados, travas verdes | ✅ | `grep-p_filial-pos-lote2.txt` |
| 10 | 59 chamadas em 8 roteiros; 2 mutações reancoradas | ✅ | `rotulos-roteiros.txt`, CI 90/90 |
| 11 | `rpcs-recorte-sql.test.ts`: coleta, replay, falha fechada, vermelho gravado | ✅ (reforçado na revisão final) | sabotagens A e B, describe 7 |
| 12 | par no catálogo verde, mutações pelo rótulo, teto | ✅ em `d83f8ec` · ⚠ CI sobre `c516467` pendente | ata (g) |
| 13 | `rel_saldo_colaborador` decidida, uma fonte, dois sentidos | ✅ | R-ACC-76 |
| 14 | `paginarTodos` sem `cap` não compila; keyset/OFFSET listados | ✅ | sabotagem C, decisão 5 |
| 15 | as sete velhas dropadas — ou PENDENTE com bloqueio e comando no topo | 🚧 PENDENTE, comando no §1.4 | ata (j) |
| 16 | `cache()` com chave primitiva, UMA leitura | ✅ | sabotagem I |
| 17 | KPIs sem ler `ativos` inteira, oito números iguais | ✅ teste + contagem de 16/09 (1.622 × 3) · pós-apply PENDENTE | decisão 6 |
| 18 | `count` de `/ativos` decidido com custo | ✅ | ata (e) |
| 19 | teto e aviso nas três tabelas; snapshot sem `meta.schema` novo | ✅ | decisão 6 |
| 20 | `maxDuration` e o import | ✅ | `maxduration.md` |
| 21 | `statement_timeout` conferido, sem `alter role` | ✅ | ata (f) |
| 22 | `medir-itens.mjs` na forma do app, no ensaio, limpeza por contagem | ✅ antes · "depois" PENDENTE | ata (b) |
| 23 | `lanc_item_criado_por_idx` e `movimentacoes_ordem_lista_idx` decididos | ✅ | atas (b), (d) |
| 24 | `buscarEstornosAteData` com `.in('estorno_de', ids)` | ✅ | `relatorios/movimentacoes.ts` |
| 25 | `/admin/colaboradores` decidido e medido | ✅ emulado · sonda real PENDENTE | ata (c) |
| 26 | `asof-orcamento.json` com o hash; trava sem calendário | ✅ | sabotagem D, describe 6 |
| 27 | TTFB "depois" dentro da faixa A/A | 🚧 PENDENTE (sem deploy) | §1.5 |
| 28 | lock e `migrations-f38.test.ts`; `database.ts` regenerado; deriva verde; `0001`–`0140` intocadas | ✅ lock, listas, deriva (CI), intocadas · regeneração PENDENTE (hand-fix) | Anexo A |
| 29 | emenda F60, Anexo A, receita, ata | ✅ | matriz, runbook, atas |
| 30 | `1.65.0`, CHANGELOG, registry; tag — ou o motivo e o comando | ✅ versão · tag NÃO criada, comando no §1.5 | ata (j) |
| 31 | `RELATORIO-F60.md` com o roteiro no topo | ✅ | este |
| 32 | os dois PRs mergeados — ou o bloqueio no topo | 🚧 bloqueio no topo | §1 |
| 33 | nenhum dado real em teste, evidência, log | ✅ | a varredura de `f60-evidencias/README.md`; a da revisão final |
| 34 | o estado de repouso declarado | ✅ | §12 |

---

# 12. O estado de repouso — se o projeto parar aqui por dois meses

- **Produção e `main` ficam na `1.64.0`**, com as sete `rel_*` velhas vivas e nenhuma `_filiais`. O app no ar funciona como
  hoje — inclusive com a forma `(p_filial is null or …)` que a R-ACC-71 proíbe e que esta fase veio trocar.
- **A branch fica com `1.65.0` e cinco migrations não aplicadas.** Qualquer fase nova que partir da `main` numera a partir
  da `0141` e colide com esta branch: antes de começar outra fase de banco, decidir entre aplicar esta ou fechar o PR.
- **O que envelhece:** a equivalência emulada vale para o dado de 16/09 — o apply de daqui a dois meses tem de rodar a
  equivalência REAL (o comando existe; ela não se aproveita da emulada); os `md5` dos corpos não mudam, mas o acervo sim.
  O orçamento do as-of não envelhece pelo calendário — só se o corpo mudar. O TTFB "antes" (`f60-producao-antes-aa-*`)
  envelhece com o volume: o "depois" tem de ser comparado com um "antes" remedido se a deriva do controle passar dos 18%.
- **Nada acende sozinho:** nenhuma checagem de ledger × repositório no `/api/saude` nem no smoke; a pendência só existe
  escrita — aqui, na ata (j) e no Anexo A.

---

# 13. O que este relatório NÃO prova

- **Nada em banco real.** Nenhuma das cinco migrations foi aplicada; toda prova de banco é do CI (banco descartável, em
  `d83f8ec`) ou de emulação só leitura.
- **Que o CI passa sobre `c516467`.** A mesa (vitest, lint, tsc, build, `verificar:actions`) passou; o `banco-sem-docker`
  não rodou sobre os commits da revisão final (que não tocam `supabase/**`, mas o lock da `0143`/`0145` foi regravado em
  `5094f6f`, também depois do run).
- **Que a equivalência vale para toda data** — vale para as 12 de amostra, sobre o dado de 16/09, e só emulada.
- **Que a trava julga se a lista passada é a certa** — ela julga a FORMA do recorte; `rel_resumo_filiais(array[<filial
  errada>], …)` passa em todas as regras (isso é a F63). E uma coluna CALCULADA chamada `filial_id` numa lateral é aceita
  pela forma, não pela semântica.
- **Que o TTFB vale para outro volume**, e que o custo do as-of (1,6–2,3×) se mantém — ele cresce com o número de ativos.
- **Que o índice medido com volume fictício no ensaio se comporta igual em produção** quando o volume chegar.
- **Que nenhuma aba aberta antes do deploy veria erro na janela do `drop`.**
- **Que o consolidado de quem entra pela senha é recortado por inquilino** — é "tudo" porque o `service_role` não tem RLS;
  isso é da F68.
- **Que as mutações do injetor cobrem as formas da revisão final** — a regressão delas é da mesa (describe 7).

---

# 14. Pendências e backlog nomeado

**Pendências desta fase** (todas no §1): o push e o CI sobre `c516467`; o corpo do PR #52; o apply no ensaio e em
produção com a verificação; a equivalência real; o conferidor; o `explain` "depois" e a confirmação do orçamento; o
"depois" do harness de itens; o merge e a conferência pós-deploy; a janela do `drop`; os tipos do ensaio e de produção; o
TTFB "depois"; o PR de documentação e a tag `v1.65.0`.

**Backlog nomeado:**
- **F63** — a camada de relatório segue `number | null` por dentro (o `null` morre em `recorteDeFiliais`); `empresa_id`
  nas leituras.
- **F65** — `(empresa_id, ordem)` e o cursor do keyset; as ordens compostas que ficaram em OFFSET (**13 + 4 + 1**, cada uma
  com o motivo na chamada — [C] composta sem cursor simples, [T] lista de tela, [R] fonte RPC, [V] unicidade só de
  construção) e a troca `created_at desc, id desc` → `ordem desc`, que muda a ordem visível no empate (as "duas réguas" da
  F53).
- **F66** — re-rodar `medir-rls.mjs`, `medir.mjs` e o orçamento do as-of imediatamente antes.
- **F67** — `v_conflitos_filiais` pelo mesmo mecanismo da view de colaboradores; o `ALCANCE_DO_RESET` (o nulo = global da
  Zona destrutiva).
- **F68** — o visualizador sem `service_role`, e o teto dele.
- **Os índices não criados, com a medição:** o da lateral do as-of `(ativo_id, data desc, ordem desc)` — o sort por ativo é
  ~7–10% do corpo; `lanc_item_ordem_lista_idx` — os 708 ms que o justificariam vinham do `SELECT` sem `WHERE` do harness
  antigo.
- **A trava:** mutações no injetor para as formas da revisão final (precedência do `or`, junção externa, dois comandos),
  na próxima fase que tocar `scripts/db/mutacoes.mjs` com banco descartável.

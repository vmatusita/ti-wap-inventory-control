# Dívida Técnica — Estoque TI WAP

**Reauditoria em 24/07/2026** (skill `tech-debt`) — sucede a auditoria de 21/07/2026, revalidando item a item o que as fases F18/F19 e a revisão `xhigh` já remediaram. Diferente da primeira, esta rodada **executou** parte do plano (modo autônomo): os itens **D** e **J** foram corrigidos nesta sessão e estão marcados ✅ abaixo.

Prioriza pela fórmula da skill: `Prioridade = (Impacto + Risco) × (6 − Esforço)`, cada eixo de 1 a 5 (esforço invertido: menor esforço = maior prioridade). Escala de esforço → tempo: **1** ≈ ½ dia · **2** ≈ 1–2 dias · **3** ≈ 3–5 dias · **4** ≈ 1–2 semanas · **5** ≈ 1 mês+.

## Sumário executivo

**A dívida caiu de 17 para 9 itens em 3 dias.** Sete itens da auditoria anterior foram fechados por completo (C, F, H, O, P, Q e a maior parte de B/I/J) e dois foram fechados nesta sessão (D, J). A base segue madura: TypeScript strict com **zero `any`**, 1.092 testes verdes, decisões rastreadas, e o CI agora sobe um Postgres real, aplica todas as migrations e roda os roteiros SQL — a lacuna nº 1 da rodada anterior.

**O que restou mudou de natureza.** A dívida de hoje é (1) **acoplamento de tipos na fronteira Supabase** e (2) **dois componentes gigantes do import** — ambos localizados, sem risco de perda de dado. A categoria antes 🔴 crítica (infraestrutura) melhorou, mas o item **A** foi **reformulado por um achado novo e mais grave que o diagnóstico anterior** (§ item A).

**Um bug real foi encontrado e corrigido nesta rodada:** a régua "data não futura" do import usava o fuso de *quem executa* — navegador (BRT) no preview, servidor Vercel (UTC) na gravação. Entre 21:00 e 23:59 BRT os dois lados discordavam do que é "hoje": a mesma planilha era barrada no preview e aceita na gravação. Corrigido e travado por teste (item J).

## Saúde por categoria

| Categoria | Antes (21/07) | Agora (24/07) | Observação |
|---|---|---|---|
| **Código** | 🟡 Médio | 🟡 Médio | Utilitários e constantes unificados; restam os 2 componentes de import (1.173 + 959 linhas). |
| **Arquitetura** | 🟡 Médio | 🟢 Bom | Máquina de estados **agora travada** por teste TS↔SQL. Resta a fronteira de tipos (`as unknown as`). |
| **Testes** | 🟠 Alto | 🟢 Bom | CI sobe Postgres, aplica 55 migrations e roda os roteiros SQL. 1.092 testes puros (+16 nesta sessão). |
| **Dependências** | 🟢 Baixo | 🟢 Baixo | Stack fechada e atual; Dependabot ligado (`.github/dependabot.yml`). |
| **Documentação** | 🟡 Médio | 🟢 Bom | README enxuto (97 linhas), `CHANGELOG.md` separado, `RUNBOOK-BANCO.md` criado, `schema.sql` aposentado. |
| **Infraestrutura** | 🔴 Crítico | 🟠 Alto | Backups órfãos com dado real: 2 de 3 removidos. Gate permanece — e o ledger revelou-se **estruturalmente** incompatível com o repo (item A). |

## Lista priorizada (itens em aberto)

| # | Item | Categoria | Impacto | Risco | Esforço | **Prioridade** |
|---|---|---|:-:|:-:|:-:|:-:|
| S | **`current_date` na RPC do import — metade SQL do bug de fuso do item J** *(novo, 25/07)* | Infra | 2 | 3 | 2 | **20** |
| T | **`.xlsx` acima de 20.000 linhas truncado em SILÊNCIO no import destrutivo** *(novo, 25/07)* | Código | 3 | 3 | 1 | **30** |
| U | **Escrita em duas etapas sem transação (termo/patrimônio/service tag)** *(novo, 25/07)* | Arq | 2 | 2 | 3 | **12** |
| A | Ledger de produção incompatível com o repo por construção | Infra | 4 | 4 | 3 | **24** |
| G | Tipos descartados na fronteira Supabase (`as unknown as Row`) | Código/Arq | 3 | 4 | 3 | **21** |
| E | Componentes gigantes do import (`grupos-erros` 1173 + `wizard` 959) | Código | 4 | 3 | 3 | **21** |
| B | Backups órfãos — resta **1**, retida por decisão pendente do Johnny | Infra/Seg | 1 | 2 | 1 | **15** |
| N | `p_contagens` opcional na RPC destrutiva (TOCTOU burlável) | Infra/Seg | 1 | 3 | 2 | **16** |
| I | Enum-fantasma `'outro'` carregado por `Exclude<…>` em ~5 lugares | Código | 2 | 2 | 2 | **16** |
| K | Forms centrais com `useState` manual vs. `react-hook-form` | Código | 2 | 2 | 3 | **12** |
| L | `termos.ts` (604) — responsabilidades misturadas | Código | 2 | 2 | 3 | **12** |
| M | RLS "sempre true" + visualizador em `service_role` | Arq/Seg | 2 | 4 | 4 | **12** |

## Resolvidos desde a auditoria anterior

| # | Item | Como foi fechado |
|---|---|---|
| **C** | Zero teste de banco no CI | Job `banco` no CI: sobe Postgres pelo Supabase CLI, aplica **todas** as migrations em ordem e roda `supabase/tests/*.sql`, falhando em qualquer `✗`. |
| **F** | Escada de precedência do patrimônio (5 níveis inline) | Extraída para `src/lib/import/resolver-patrimonio.ts` (96 linhas, pura) + testes de tabela. |
| **H** | Strings de contrato sincronizadas à mão | `src/lib/marcadores-sql.test.ts` faz grep nas migrations e quebra se o literal TS divergir do SQL. |
| **O** | `traduzErroBanco(code)` só pela metade | Todos os chamadores passam `error.code` (as últimas 12 — em `termos.ts` — na revisão `xhigh`). |
| **P** | README-changelog, `schema.sql` defasado, sem runbook | README em 97 linhas, `CHANGELOG.md` próprio, `docs/RUNBOOK-BANCO.md` criado, `schema.sql` aposentado. |
| **Q** | Sem varredura de dependências | `.github/dependabot.yml`. |
| **D** ✅ | Máquina de estados duplicada TS↔Postgres | **Nesta sessão** — ver abaixo. |
| **J** ✅ | Duplicação de utilitários | **Nesta sessão** — ver abaixo. |

### D — Máquina de estados: trava de sincronia TS ↔ SQL ✅ *(fechado nesta sessão)*

`TRANSICOES` (`validators/movimentacao.ts`) se declarava "cópia EXATA" da matriz do banco **por comentário**, sem nada que sustentasse a promessa: a `troca` (0047) e a `devolucao_fornecedor` (0045) entraram no SQL sem que o build do front acusasse qualquer coisa.

`src/lib/validators/transicoes-sql.test.ts` (novo, 13 casos) **deriva a matriz direto do SQL** — acha sozinho a migration vigente que define `status_apos_movimentacao` (hoje a `0047`), faz o parse do `case`, aplica as duas convenções documentadas (`ajuste` vale em todo estado; `estorno` é fluxo da linha do tempo e fica fora do formulário) e compara com o TS, estado a estado. Também trava que os estados cobertos são exatamente os do enum do banco e que todo tipo citado existe em `tipo_movimentacao`.

**Validado por mutação:** removendo `'troca'` de `TRANSICOES.em_estoque`, o teste falha com `expected [Array(9)] to deeply equal [Array(10)]`. A trava morde de verdade.

### J — Utilitários duplicados + **bug de fuso** ✅ *(fechado nesta sessão)*

Duas frentes:

1. **Download de arquivo** — o boilerplate `createObjectURL → <a download> → click → revokeObjectURL` estava copiado **byte a byte em 5 arquivos**. Extraído para `src/lib/download.ts` (`baixarBlob` / `baixarTexto` / `baixarDeUrl`), com o `r.ok` das signed URLs preservado na função única (sem ele o `.blob()` salva o corpo de erro 4xx como um `.docx` corrompido).

2. **`hojeIso()` — bug real, não só duplicação.** A régua "data não futura" do import montava a data com `new Date()` + `getFullYear/getMonth/getDate`, ou seja **o fuso de quem executa** — e os dois lados da mesma régua executam em fusos diferentes: `ops-grupo.ts` e o wizard rodam no navegador (BRT), enquanto `validators/importar.ts` roda como Server Action na Vercel (**UTC**). Entre 21:00 e 23:59 BRT o servidor já virou o dia: a mesma planilha, com data de amanhã, era barrada como "data futura" no preview e **aceita** na gravação. Agora delega ao `hojeISO()` de `@/lib/format`, que formata no fuso `America/Sao_Paulo` — o mesmo relógio do negócio nos dois lados. Travado por 3 testes (incluindo um com `setSystemTime` em `2026-07-25T02:00:00Z`, que é 24/07 às 23h em SP).

   Medição que confirma o bug: sob `TZ=UTC`, a implementação antiga devolvia `2026-07-25` enquanto o negócio ainda estava em `2026-07-24`.

## Detalhamento dos itens em aberto

### R — O ensaio divergiu de produção, e para o lado errado ✅ *(aberto e FECHADO em 25/07/2026)*

> **Fechado no mesmo dia.** A `0056` foi aplicada no ensaio (e, idempotente, em produção) na
> tarde de 25/07, com o Johnny liberando a permissão que o classificador vinha barrando.
> Pós-apply nos dois bancos: `anon`=false · `authenticated`=true · `service_role`=true nas sete
> RPCs.
>
> ⚠ **CORREÇÃO — metade deste achado era FALSO ALARME.** A tabela abaixo dava
> `criar_compra_lote` como tendo "corpo diferente" nos dois bancos, e daí se concluiu que a
> `0055`/`0040` não teriam chegado ao ensaio. **Não é verdade.** Medido em 25/07 depois do
> rollout: os dois bancos têm `anon`=false, `service_role`=false e `auth.uid()` no corpo — a
> substância das duas migrations está nos DOIS. O `md5(pg_get_functiondef(...))` diferia por
> **fim de linha**: produção CRLF, ensaio LF (1.664 vs 1.617 bytes = exatamente os 47 `\r`).
> Normalizando o espaço em branco, o fingerprint é **idêntico**: `56358b49…` nos dois.
>
> **Lição de método, que vale mais que o achado:** `md5(pg_get_functiondef())` **não** é
> fingerprint de paridade confiável entre ambientes — ele tem um modo de falso-positivo que
> depende de COMO o SQL foi aplicado (SQL Editor no Windows vs MCP). A sonda de paridade
> tem de normalizar: `md5(regexp_replace(pg_get_functiondef(oid), '\s+', ' ', 'g'))`.
>
> ✅ **A paridade foi REFEITA com a sonda corrigida em 25/07**, cobrindo 10 classes de objeto —
> e o resultado é **paridade COMPLETA**: 15 funções · 15 grants · 201 colunas · 56 constraints ·
> 47 índices · 20 policies · 5 views · 6 enums · 2 triggers · 15 flags de RLS, todos com
> fingerprint idêntico nos dois bancos. A única diferença é `_bkp_relatorios_gerados_f6a`,
> que existe só em produção **de propósito** (decisão pendente do Johnny) e responde sozinha
> pelas duas divergências brutas que a sonda acusou antes do filtro (1 tabela + 8 colunas).
> A sonda está versionada em `docs/RUNBOOK-BANCO.md`, com o aviso do falso-positivo.

A parte REAL e confirmada deste item era a exposição do `anon` — essa existia e foi fechada:

A auditoria de 24/07 sondou **só produção** e concluiu "advisors sem surpresa". O diagnóstico de
25/07 sondou **os dois** projetos e achou o que faltava — o desvio não está em produção, está no
**ensaio** (`sgmvldiizsrjbxzzpmhh`):

| Objeto | Produção | Ensaio | Veredito |
|---|---|---|---|
| 7 RPCs `rel_*` — `has_function_privilege('anon', …, 'execute')` | `false` (0056 aplicada) | **`true`** (0056 ausente) | **REAL** — fechado em 25/07 |
| `criar_compra_lote` — `md5` CRU de `pg_get_functiondef` | `956e40…` | `ea605a…` | **FALSO ALARME** — só CRLF vs LF |
| `criar_compra_lote` — `md5` NORMALIZADO (`\s+` → ` `) | `56358b49…` | `56358b49…` | idênticos |
| As outras 14 funções | — | idênticas | — |

**O risco direto é baixo e vale dizer por quê:** as sete RPCs são `SECURITY INVOKER`, então um `anon`
que as chamasse leria as tabelas *como* `anon`, e a RLS (que não concede nada a `anon`) devolveria
vazio. Não é vazamento de dado.

**O risco de processo é que pesa.** O `RUNBOOK-BANCO.md` define o caminho **ensaio → produção**: valida
lá, aplica aqui. Com o ensaio *menos* restrito e com uma função de corpo diferente, um teste feito
nele **não prova o que se supõe que prove** — e a paridade que a F19 declarou não vale mais. Some-se a
isso que o cabeçalho da própria `0056` afirmava "não aplicada nem no ensaio nem em produção", metade
falsa: quem lesse o arquivo concluiria o oposto do estado real dos dois bancos.

**Correção:** aplicar `0056` no ensaio (em produção o apply é idempotente e só fecha a diferença) e
verificar `criar_compra_lote`. Esforço 1 — é um handoff, não um projeto. O cabeçalho da `0056` já foi
corrigido com o estado medido de cada banco.

**Regra que fica:** toda sonda de paridade roda nos **dois** projetos. Sondar só produção foi o que
deixou este item passar.

### T — `.xlsx` grande é truncado em silêncio antes de uma operação destrutiva `[Prio 30]` *(novo — 25/07/2026)*

`lerXlsx` corta em `Math.min(ws.rowCount, MAX_LINHAS + 1)` com `MAX_LINHAS = 20_000`
(`src/lib/import/xlsx.ts:117` e `:31`) — **sem `throw`, sem aviso, sem marca no resultado**. Pior:
`totalLinhasDados` é contado sobre o CSV já truncado (`parse.ts`), e é esse número que vai para o
plano e para `import_logs` — ou seja, nada a jusante denuncia o corte. O mesmo vale para a largura
(`MAX_COLUNAS = 40`, `:106`).

A guarda de tamanho não cobre: `TAMANHO_MAX_ARQUIVO` é 5 MB e `.xlsx` é ZIP — 20 mil linhas de
inventário comprimem muito abaixo disso. E há assimetria: o caminho **CSV não tem teto nenhum**,
então o mesmo conteúdo entra inteiro em CSV e cortado em `.xlsx`.

**Negócio:** a operação seguinte é `importar_ativos_substituir`, que **apaga o acervo da filial** e
recria a partir do plano. Truncar em silêncio não é "faltou linha na tela" — é ativo que deixa de
existir no sistema, sem nenhum sinal. É cauda (a maior filial real tem ~1.200 linhas), daí o
impacto 3 e não 5, mas o defeito é a trava **cortar em vez de recusar**.

**Correção (1 linha):** trocar o `Math.min` por um `throw` que nomeia o número de linhas e o teto —
o wizard já trata exceção de análise como erro de arquivo.

### S — `current_date` na RPC do import: a metade SQL do bug de fuso `[Prio 20]` *(novo — 25/07/2026)*

O item **J** (fechado em 24/07) corrigiu a régua "data não futura" do lado TypeScript, fazendo os
dois lados usarem `hojeISO()` em `America/Sao_Paulo`. **A mesma régua tem um lado SQL que ficou
para trás:** `importar_ativos_substituir` usa `v_data_import date := current_date`
(`0048:37-38`), e a sessão do Postgres no Supabase é UTC.

Esses valores viram a DATA das movimentações do import (compra de abertura e ajuste). Como
`rel_estoque_asof` só considera existente o ativo com movimentação `m.data <= p_data`, um import
rodado entre **21:00 e 23:59 BRT** grava os ativos sem data na planilha com a data de *amanhã* —
e eles **somem dos relatórios as-of do próprio dia do go-live**, enquanto os que tinham data na
planilha aparecem.

**Correção:** `v_data_import date := (now() at time zone 'America/Sao_Paulo')::date;`. **Não foi
escrita como migration de propósito** — exige `create or replace` de uma função de ~300 linhas que
contém `delete from ativos` (bate no gate, caminho B do runbook) e que não haveria como testar
antes de entregar. Autorar um substituto não testado da função mais destrutiva do sistema é pior
que documentar a emenda exata.

### U — Escrita em duas etapas sem transação `[Prio 12]` *(novo — 25/07/2026)*

Em `actions/termos.ts:516` (e o mesmo padrão em `actions/ativos.ts`, em `corrigirPatrimonio` e
`definirServiceTag`), o `update` no ativo **já commitou** quando o `insert` na `anotacoes` é
avaliado; se o segundo falha, a action retorna "não foi possível" para algo que em parte deu certo,
e a retentativa esbarra no guarda de idempotência com outra mensagem. O que se perde não é
cosmético: o comentário do próprio arquivo explica que a autoria do ato mora em `anotacoes` porque
`ativos` não tem coluna de autor — e `anotacoes` é imutável.

**Correção definitiva:** RPC transacional, como já se faz em `criar_compra_lote` /
`devolver_ao_fornecedor`. Paliativo barato: inverter a ordem (anotação primeiro), já que anotação
órfã é inócua e o update é o que muda o estado visível.

### A — O ledger de produção é incompatível com o repo **por construção** `[Prio 24]`

A auditoria de 21/07 descreveu o sintoma ("migrations aplicadas à mão não constam no ledger") e propôs reconciliar inserindo as linhas faltantes. **A medição de hoje mostra que o diagnóstico era incompleto e que a reconciliação proposta não resolveria** — pode até dar falsa confiança.

**Medido em produção (`pbtjcalbmepmrqzprusb`, 24/07):** 55 migrations no repo, **45 linhas no ledger**. Faltam 10: `0031`–`0037`, `0039`, `0040` e `0056`. Sondei o **efeito** de cada uma no banco — **todas as 10 estão aplicadas**: `import_logs` existe; a RPC do import tem a assinatura de 4 args e a regra dos 60 caracteres da `0037` (sem o regex canônico); os backups da `0039` sumiram; `criar_compra_lote` usa `auth.uid()` (`0040`); e as sete RPCs `rel_*` já estão sem `execute` para `anon` — ou seja, **a `0056` foi aplicada** (o CHANGELOG ainda a dá como pendente de handoff).

**O achado novo é outro.** As versions do ledger são **timestamps de 14 dígitos gerados pelo MCP no ato do apply** (`20260722145340` → `0041_dominios_login`), enquanto os arquivos do repo usam prefixo sequencial (`0041_dominios_login.sql`). A doc do Supabase confirma que a CLI identifica migration **por timestamp no nome do arquivo** ("a new row will be inserted into the migration history table with timestamp as its unique id"). Logo os dois esquemas de identificação **não casam para praticamente nenhuma migration** — não só para as 10 faltantes.

Consequência prática, e é ela que importa:

- **`supabase db push` deste repo contra produção é inseguro hoje** — não porque faltam 10 linhas, mas porque o ledger nunca foi alimentado a partir do repo. Um push tentaria reaplicar migrations já aplicadas; como a RPC do import é redefinida em cadeia (`0032`→`0037`→**`0048`**), reaplicar `0031`–`0037` **regrediria** o corpo vivo para o da `0037`, desfazendo a `0048`.
- **A reconciliação de metadados é cosmética.** Inserir as 10 linhas faz o histórico "bater" visualmente sem tornar o repo pushável — e sugere uma segurança que não existe.
- **O controle que de fato funciona já está em uso:** conferir **efeito** por sonda (`pg_get_functiondef`, `information_schema`, privilégios) — o método de fingerprint que a F19 usou para provar paridade ensaio×produção — mais o job `banco` do CI, que prova que as 55 migrations aplicam limpo e em ordem num banco novo.

**Negócio:** o histórico não é o controle de integridade que se supunha; a garantia real vem das sondas e do CI. O risco de perda de dado por "arquivo errado" continua mitigado só pela verificação pós-apply do runbook. **Ação tomada:** o `RUNBOOK-BANCO.md` foi corrigido — a reconciliação deixou de ser recomendada como "fidelidade do histórico" e passou a vir com o aviso de não-pushabilidade e o procedimento de sonda. *(A tentativa de inserir as 10 linhas foi barrada pelo classificador do harness; SQL de handoff no runbook.)*

### G — Segurança de tipos descartada na fronteira Supabase `[Prio 21]`

38 ocorrências de `as unknown as` em `src/`, das quais ~20 são o padrão `(data ?? []) as unknown as Row[]` em `queries/` (`ativos.ts` 6×, `movimentacoes.ts` 4×, `itens.ts` 2×, `gerados.ts` 2×, `compras.ts`, `relatorios/estoque.ts`). `database.ts` é **gerado**, mas os resultados de join aninhado não são checados contra ele. `nova-movimentacao-form.tsx:474` envia o lote como `as never`. *(Os `as unknown as Json` das Server Actions são categoria diferente — conversão para o tipo `Json` do Supabase, legítima.)*

**Negócio:** uma coluna renomeada no banco + `db:types` **não gera erro** exatamente onde mais importaria (leituras de relatório). O investimento em tipos gerados é anulado na fronteira.

### E — Componentes gigantes do import `[Prio 21]`

`grupos-erros.tsx` (1.173 linhas, 19 componentes num arquivo) e `importar-wizard.tsx` (959 linhas, 12 `useState` + 2 `useTransition`, 5 passos inline). Cada `kind` de erro das ~10 iterações F7* empilhou mais um par Card/Linha.

**Negócio:** o import destrutivo é a operação de maior risco do sistema e qualquer ajuste mexe em arquivos de ~1.000 linhas. Mantido como **oportunístico** (fazer junto da próxima mudança no import, não como big-bang) — refatorar 2.100 linhas sem teste de componente troca uma dívida conhecida por risco de regressão.

### B — Backups órfãos restantes `[Prio 25]`

A `0039` foi aplicada: `_f8_backup_matriz_compras` (809 linhas) e `_f7k_backup_modelo` (75) **não existem mais**. Restam duas, ambas com RLS on e sem policy (aparecem no advisor como `rls_enabled_no_policy`):

- `_bkp_relatorios_gerados_f6a` (2 linhas) — retida **de propósito**, atrelada a decisão em aberto do Johnny sobre os 2 snapshots de go-live.
- `_f18_backup_pendencia` (2 linhas: id + texto de pendência) — backup do backfill da F18. **Migration `0058_drop_backup_f18.sql` escrita em 25/07**, com o export prévio e a verificação pós-apply no cabeçalho; não aplicada (classificador do harness barrou o `apply_migration`) — está em handoff.

**Negócio:** risco baixo hoje (poucas linhas, sem dado pessoal sensível, anon sem acesso), mas é o **padrão que se repete a cada fase** — F7K, F8, F18 criaram a mesma classe de tabela ad-hoc. Vale a regra: todo backup de operação nasce com uma migration de DROP datada.

### N — `p_contagens` opcional (TOCTOU) `[Prio 16]`

A revalidação de contagens sob advisory lock — defesa central contra apagar um acervo que mudou entre o preview e o confirmar — segue sob `if p_contagens is not null` (`0048:156`, herdado desde a `0032`): um cliente que passe `null` **pula a guarda**. A metade companheira deste item **já foi resolvida**: `criar_compra_lote` usa `auth.uid()` desde a `0040`, verificado em produção.

**Negócio:** endurecer a invariante mais perigosa do import. Correção = `create or replace` tornando o parâmetro obrigatório — bate no gate (a função contém `delete from ativos`), então segue o caminho B do runbook.

### I — Enum-fantasma `'outro'` `[Prio 16]`

`CategoriaAtivo` inclui `'outro'` (`import/tipos.ts:51`) — valor que o CSV **nunca produz** (`mapearCategoria` devolve `null` para desconhecido; a F4 é que usava `'outro'`). O custo é carregá-lo com `Exclude<CategoriaAtivo, 'outro'>` em ~5 pontos (`grupos-erros.tsx` 3×, `ops-grupo.ts`, testes). *Nota: o valor existe no enum `categoria_ativo` do banco, então o tipo gerado o mantém — a limpeza é do tipo local do import, não do banco.*

### K / L — Convenção e coesão `[Prio 12]`

`nova-compra-form.tsx` (23 `useState`), `nova-movimentacao-form.tsx` (15) e `lancar-item-dialog.tsx` (10) usam estado manual + validação na mão, contra a convenção `react-hook-form` do `CLAUDE.md` (hoje só `editar-ativo-dialog.tsx` a segue). `termos.ts` (604) mistura render de `.docx`, Storage, regra de flag, anotações e formatação de nome.

### M — RLS "sempre true" + visualizador em service-role `[Prio 12]`

12 políticas `using/check (true)` confirmadas pelo advisor (`ativos`, `movimentacoes`, `itens`, `filiais`, `motivos`, `kits_modelos`, `termos_gerados`, `pendencias_item`, `anotacoes`, `import_logs`, `lancamentos_item`, `relatorios_gerados`) — todo operador escreve tudo; a defesa mora no trigger e no render. Sessões de visualização por senha usam `createAdminClient()` (service role, ignora RLS).

**Negócio:** por design documentado, mas concentra confiança: um bug de escopo por filial numa query de relatório superexpõe dados **sem rede do banco**. Item estratégico — exige ADR antes de mexer.

## Plano de remediação faseado

### Faixa 0 — Concluída nesta sessão ✅
Itens **D** e **J**. `npm run lint` limpo · **1.092 testes** verdes (+16) · `npm run build` limpo.

### Faixa 1 — Fechar as pontas de banco `(~1 dia, junto do próximo deploy)`
- **R (primeiro da fila):** aplicar a `0056` **no ensaio** e conferir `criar_compra_lote` nos dois bancos. É o mais barato e o que restaura a validade do caminho ensaio → produção — sem isso, tudo o mais nesta faixa é validado contra uma base que não espelha produção.
- **B:** migration de DROP para `_f18_backup_pendencia` — **`0058` já escrita**, em handoff (o `_bkp_relatorios_gerados_f6a` espera a decisão do Johnny). Adotar a regra "backup de operação nasce com DROP datado".
- **Advisors de performance:** **`0059` já escrita**, em handoff — `auth.uid()` → `(select auth.uid())` em `profiles` e DROP de 6 policies de SELECT redundantes. Nenhum dos dois muda o modelo de acesso (item M).
- **N:** `create or replace` tornando `p_contagens` obrigatório — caminho B do runbook (bate no gate).
- **A:** já documentado no runbook; a decisão pendente é de **método** (seguir com apply por MCP + sonda, que funciona, ou renomear as migrations para o padrão timestamp e adotar a CLI de verdade). Registrar em ADR.

### Faixa 2 — Tipos na fronteira `(~3–5 dias)`
- **G:** helper tipado para os joins de relatório, eliminando `as unknown as Row` contra `database.ts`. Começar por `queries/ativos.ts` e `queries/movimentacoes.ts` (10 das ~20 ocorrências).
- **I:** limpar o enum-fantasma junto (mesma área de tipos).

### Faixa 3 — Hotspot do import `(oportunístico — quando tocar o import)`
Itens **E**, **K**, **L**. Quebrar `grupos-erros.tsx`/`importar-wizard.tsx` em subcomponentes + hooks; migrar os forms centrais para `react-hook-form`; fatiar `termos.ts`. **Não fazer como big-bang.**

### Faixa 4 — Estratégico
Item **M**: avaliar RLS real por filial — ADR antes de qualquer mudança.

## O que está saudável (para calibrar)

- **TypeScript strict com zero `any`**; nenhum `FIXME`/`HACK`/`@ts-ignore` no código; 2 `eslint-disable` justificados.
- **CI com banco real** — sobe Postgres, aplica as 55 migrations em ordem e roda os roteiros SQL. Era a lacuna nº 1 da rodada anterior.
- **1.092 testes** de funções puras, verdes, rodando em ~10s.
- **Duas travas TS↔SQL** ativas (`marcadores-sql.test.ts` e o novo `transicoes-sql.test.ts`) — o padrão certo para o acoplamento que este projeto tem por natureza.
- **Advisors sem surpresa *em produção*:** todo achado de segurança lá já está catalogado (RLS por design, backups no backlog, leaked-password em handoff). ⚠️ *Ressalva de 25/07: esta linha valia porque a sonda só rodou em produção. Rodada nos dois projetos, ela achou o item **R** — o ensaio está atrás. Paridade se mede nos dois bancos.*
- **Rastro de decisões** (`docs/DECISOES.md`) exemplar — a dívida de infra aparece lá como pendência conhecida, não como surpresa.

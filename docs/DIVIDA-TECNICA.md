# Dívida Técnica — Estoque TI WAP

**Reauditoria em 12/08/2026** (skill `tech-debt`) — sucede as auditorias de 21/07 e 24-25/07/2026, revalidando item a item contra o código de hoje, dez fases depois (F26→F35). Esta rodada **não executou** correções: é levantamento e priorização (a ordem em curso é a auditoria; o escopo de outra fase fica no plano abaixo).

Prioriza pela fórmula da skill: `Prioridade = (Impacto + Risco) × (6 − Esforço)`, cada eixo de 1 a 5 (esforço invertido: menor esforço = maior prioridade). Escala de esforço → tempo: **1** ≈ ½ dia · **2** ≈ 1–2 dias · **3** ≈ 3–5 dias · **4** ≈ 1–2 semanas · **5** ≈ 1 mês+.

## Sumário executivo

**A base seguiu melhorando e a dívida mudou de lugar.** Em 18 dias os testes dobraram (1.092 → **2.544**, 124 arquivos), o banco foi de 55 para **109 migrations**, `lint`/`build`/`test` estão os três limpos e o modelo de acesso saiu do "RLS sempre true" para regras reais no Postgres — o item **M**, estratégico na rodada anterior, está **substancialmente resolvido** pelas F21–F24 (199 referências a `pode_escrever`/`e_admin()` nas policies).

**Três achados novos dominam esta rodada, e os três são de propagação, não de invenção:**

1. **O `next` está uma versão-patch atrás de oito advisories** (`16.2.10`; a faixa afetada é `>=16.0.0 <16.2.11`), uma delas **bypass de proxy** — e `src/proxy.ts` *é* a porta de autenticação deste app. Custo da correção: **um `npm i next@16.2.11`**. É o item de maior prioridade da auditoria por relação risco/esforço, não por gravidade absoluta (§ item V).
2. **O defeito de fuso do item S não só continua aberto — ele se replicou para código novo.** `current_date` em RPC foi copiado para a `0080` (F23) e a `0094` (F24), e **nasceu de novo** na `0084` (`dev_forcar`, F23) e na `0104` (`transferir_item`, F31). O TS tem `hojeISO()`; o SQL nunca ganhou o par (§ item W).
3. **O mecanismo que propaga os dois defeitos anteriores tem nome:** `importar_ativos_substituir` é reescrita **inteira** a cada mudança — **11 migrations** contêm uma cópia de ~300–470 linhas. É por isso que `p_contagens is not null` (item **N**, conhecido desde 21/07) existe hoje em **cinco** cópias vivas (§ item X).

**O que piorou por acúmulo:** `as unknown as` foi de 38 para **55** (+45%), os dois componentes do import continuaram crescendo (2.132 → **2.217** linhas) e os formulários com `useState` manual ganharam dois membros novos (`devolucao-fornecedor-form` com 20, `transferir-item-dialog` com 11) enquanto `react-hook-form` segue em **2** formulários reais.

**Uma lacuna estrutural que nenhuma auditoria anterior nomeou:** são **181 componentes `.tsx` e zero teste de componente**. Os 2.544 testes são todos de função pura. O histórico do próprio repositório mostra o custo — há commits cujo assunto é literalmente "dois defeitos que só o navegador pegou" (§ item Y).

## Saúde por categoria

| Categoria | 24/07 | Agora (12/08) | Observação |
|---|---|---|---|
| **Código** | 🟡 Médio | 🟡 Médio | Hotspots do import cresceram; `as unknown as` +45%; forms manuais se multiplicaram. |
| **Arquitetura** | 🟢 Bom | 🟡 Médio | Recriação integral de RPC (11×) virou o vetor de propagação de defeito. Rebaixado. |
| **Testes** | 🟢 Bom | 🟡 Médio | 2.544 testes puros (dobrou) + CI com Postgres real. Mas **zero** teste de componente em 181 arquivos. |
| **Dependências** | 🟢 Baixo | 🟠 Alto | `npm audit`: 13 vulnerabilidades (9 HIGH). `next` é **direta** e HIGH. Rebaixado. |
| **Documentação** | 🟢 Bom | 🟢 Bom | `MATRIZ-REGRAS`, `ARQUITETURA`, `ESPECIFICACAO`, `README`, `CHANGELOG` atualizados na última semana. |
| **Infraestrutura** | 🟠 Alto | 🟠 Alto | Item **A** (ledger) inalterado por construção; backups órfãos em handoff. |

## Lista priorizada

| # | Item | Categoria | Imp. | Risco | Esf. | **Prio** |
|---|---|---|:-:|:-:|:-:|:-:|
| **V** | **`next@16.2.10` — 8 advisories, incl. bypass de proxy** *(novo)* | Dependência/Seg | 3 | 4 | 1 | **35** |
| **T** | `.xlsx` >20.000 linhas truncado em SILÊNCIO antes do import destrutivo | Código | 3 | 3 | 1 | **30** |
| **W** | **Fuso `current_date` propagado para código novo** *(novo; agrava S)* | Infra/Código | 3 | 3 | 2 | **24** |
| **A** | Ledger de produção incompatível com o repo por construção | Infra | 4 | 4 | 3 | **24** |
| **X** | **RPC do import recriada inteira 11× — vetor de propagação** *(novo)* | Arquitetura | 4 | 3 | 3 | **21** |
| **G** | Tipos descartados na fronteira Supabase (`as unknown as`, 55×) | Código/Arq | 3 | 4 | 3 | **21** |
| **E** | Componentes gigantes do import (1.176 + 1.041 linhas) | Código | 4 | 3 | 3 | **21** |
| **N** | `p_contagens` opcional (TOCTOU) — agora em **5** cópias | Infra/Seg | 1 | 3 | 2 | **16** |
| **I** | Enum-fantasma `'outro'` carregado por `Exclude<…>` | Código | 2 | 2 | 2 | **16** |
| **B** | Backups órfãos (`0058` escrita, aplicação não verificada) | Infra/Seg | 1 | 2 | 1 | **15** |
| **Y** | **Zero teste de componente em 181 `.tsx`** *(novo)* | Testes | 3 | 3 | 4 | **12** |
| **K** | Forms centrais com `useState` manual vs. `react-hook-form` | Código | 2 | 2 | 3 | **12** |
| **U** | Escrita em duas etapas sem transação (termo/patrimônio/service tag) | Arquitetura | 2 | 2 | 3 | **12** |
| **L** | `termos.ts` (832) — responsabilidades misturadas | Código | 2 | 2 | 3 | **12** |
| **Z** | Drift de dependências (minor/patch em 19 pacotes) *(novo)* | Dependência | 1 | 1 | 1 | **10** |

---

## Achados novos

### V — `next@16.2.10`: oito advisories, e um deles é bypass da porta de autenticação `[Prio 35]` *(novo — 12/08/2026)*

`npm audit` acusa **13 vulnerabilidades (9 HIGH)**. Uma é **direta e HIGH**: o próprio `next`, com **oito** advisories cuja faixa afetada é `>=16.0.0 <16.2.11`. O projeto está em `16.2.10` — **uma versão-patch abaixo da correção**. As que importam aqui:

| Advisory | Título | Aplica? |
|---|---|---|
| `GHSA-6gpp-xcg3-4w24` | **Middleware / Proxy bypass** em App Router com Turbopack | **Sim** — App Router + Turbopack + `src/proxy.ts` |
| `GHSA-m99w-x7hq-7vfj` | **DoS** em App Router usando Server Actions | **Sim** — toda escrita do sistema é Server Action |
| `GHSA-89xv-2m56-2m9x` | SSRF em Server Actions **em servidor custom** | Improvável — deploy é Vercel, não servidor custom |
| `GHSA-68g3-v927-f742` / `-4633-3j49-mh5q` | Cache confusion de corpo de resposta | Possível |
| `GHSA-4c39-4ccg-62r3` | Payload de Server Action sem teto no Edge runtime | Parcial (`bodySizeLimit: 8mb` configurado) |

**O que exatamente está exposto.** `src/proxy.ts` é a porta: ele roda em todas as rotas (exceto assets), chama `updateSession`, e é quem manda o não-logado para `/login`, quem aplica a expiração de sessão de 24h (B8) e quem gateia `/relatorios/**` pelo cookie de visualização.

**O que NÃO está exposto — e isto rebaixa o impacto de 5 para 3.** A defesa em profundidade que as F21–F24 construíram continua de pé por baixo do proxy:
- `app/(app)/admin/layout.tsx` e `app/(app)/dev/layout.tsx` refazem a checagem (`redirect('/login')` / `redirect('/')`);
- as Server Actions têm `exigirDev`/`exigirAdmin`/`exigirEscrita`;
- e o piso real é o **Postgres** — `papel_atual()`, `e_admin()`, `pode_escrever()` e as policies, que um bypass de proxy não alcança.

Ou seja: o bypass custa **uma camada**, não a casa. Ainda assim é o item nº 1 da lista, e a razão é aritmética — **impacto 3 e risco 4 com esforço 1**. Nenhum outro item devolve tanto por tão pouco.

**Não tentei explorar a falha**, nem verifiquei em produção que a pré-condição exata do advisory (a combinação Turbopack + locale único descrita pelo GHSA) se realiza aqui; o que está medido é que a superfície descrita existe neste app e que a versão instalada está dentro da faixa afetada.

**Correção:** `npm i next@16.2.11` (patch estável, publicado). Sem mudança de código. Confirmar com `npm audit` e o smoke logado (`scripts/smoke/smoke-prod.mjs`).

**Negócio:** é a única dívida desta lista que um scanner externo (ou uma auditoria de TI da WAP) aponta sozinho, com CVE e link. Fechar custa uma tarde.

### W — O bug de fuso não foi só herdado: ele nasceu de novo, duas vezes `[Prio 24]` *(novo — 12/08/2026; agrava o item S)*

O item **J** (fechado em 24/07) consertou o lado TypeScript da régua "data não futura" com `hojeISO()` em `America/Sao_Paulo`. O item **S** (aberto em 25/07) registrou que **o lado SQL ficou para trás**: `v_data_import date := current_date` na RPC do import, com a sessão do Postgres em UTC — entre **21:00 e 23:59 BRT**, o banco acha que já é amanhã.

**O que a medição de hoje acrescenta é que o defeito virou padrão da casa.** `current_date` aparece hoje em:

| Migration | Fase | Situação |
|---|---|---|
| `0048`, `0064` | F13/F21 | cópias herdadas (já conhecidas) |
| `0080`, `0094` | **F23/F24** | **copiadas de novo** ao recriar a RPC do import |
| `0084` (`forcar_estado_ativo`, `forcar_saldo_item`) | **F23** | **código NOVO, nasceu com o defeito** |
| `0104` (`transferir_item`) | **F31** | **código NOVO, nasceu com o defeito** |

A causa-raiz é simples e corrigível: **o TypeScript tem `hojeISO()` (`src/lib/format.ts:126`); o SQL não tem par.** Só existem **6** ocorrências de `America/Sao_Paulo` em 109 migrations, e as 6 estão na `0060` — que corrigiu **leitura** de data, nunca escrita. Quem escreve uma RPC nova não tem o que chamar, então digita `current_date`.

**Consequência prática:** movimentação gravada entre 21h e meia-noite (BRT) leva a data de amanhã. Como `rel_estoque_asof` só considera existente o ativo com `m.data <= p_data`, o lançamento **some do relatório do próprio dia** em que foi feito. Vale para o import, para o forçar-estado do dev e para a transferência de item da F31.

**Correção (duas partes, ambas baratas):**
1. Uma função `estoque.hoje()` (`(now() at time zone 'America/Sao_Paulo')::date`) numa migration nova — aditiva, **não bate no gate** por não conter DDL destrutiva.
2. **Um teste que impeça a reincidência** — o repositório já tem o padrão pronto: `src/lib/marcadores-sql.test.ts` faz grep nas migrations e quebra o CI. Um irmão dele que recuse `current_date` cru em migration nova fecha a classe inteira, e não só as 6 ocorrências de hoje.

A troca dentro de `importar_ativos_substituir` continua sujeita ao caminho B do runbook (a função contém `delete from ativos`) — mas `0084` e `0104` **não têm essa trava** e podem ser corrigidas direto.

### X — A RPC do import é reescrita inteira a cada mudança — e é isso que espalha os defeitos `[Prio 21]` *(novo — 12/08/2026)*

`importar_ativos_substituir` tem uma cópia integral em **11 migrations**: `0032`, `0033`, `0034`, `0035`, `0036`, `0037`, `0040`, `0048`, `0064`, `0080`, `0094` — cada uma de ~300 a 470 linhas. As migrations somam 18.784 linhas, e as onze cópias respondem por uma fatia desproporcional disso.

Este item não é estética. **É o mecanismo causal dos itens N e W**, e a evidência é direta:

- `if p_contagens is not null` (item **N**, a guarda TOCTOU furada, conhecida desde 21/07) sobrevive hoje em **5** cópias — `0040`, `0048`, `0064`, `0080`, `0094`. Cada fase que recriou a função **recarregou o defeito** junto, porque o método é copiar o corpo e editar o trecho novo.
- `current_date` (item **W**) percorreu exatamente o mesmo caminho.

Um defeito conhecido que sobrevive a cinco revisões não sobrevive por descuido de revisor: sobrevive porque o processo o recopia. `criar_compra_lote` (4 recriações) e `devolver_ao_fornecedor` (2) têm a mesma doença em grau menor.

**Correção:** quebrar a RPC em funções auxiliares estáveis (validação de linha, resolução de patrimônio, escrita do lote) para que uma mudança futura recrie **uma** delas, não as 470 linhas. Enquanto isso não acontece, o paliativo é o teste de grep do item W, que ao menos **impede que o defeito recopiado passe pelo CI**.

**Negócio:** é a operação mais destrutiva do sistema (`delete from ativos` por filial). O risco não é a função estar errada hoje — é que o único jeito de mudá-la seja reescrevendo tudo.

### Y — 181 componentes, zero teste de componente `[Prio 12]` *(novo — 12/08/2026)*

Os **2.544 testes** (verdes, ~91s) são **todos** de função pura. A cobertura por área:

| Área | Arquivos | Com teste |
|---|:-:|:-:|
| `lib/actions/` | 18 | 5 |
| `lib/queries/` | 25 | 5 |
| `components/**.tsx` | **181** | **0** |

Isso é uma escolha declarada no `CLAUDE.md` ("Vitest (só funções puras)"), e ela **rendeu** — a disciplina de extrair lógica para módulo puro é justamente o que fez o número de testes dobrar. O problema é o que fica de fora, e o próprio histórico do repositório mede: há um commit intitulado *"dois defeitos que só o navegador pegou"* (F32) e outro *"o teste de `sessionStorage` supunha o Node da minha máquina"*. A classe de bug que escapa é conhecida e recorrente: fronteira Server/Client Component, efeito de estado, `useState` que o lint não alcança.

**Não recomendo reverter a política nem mirar cobertura.** Recomendo o alvo mínimo: teste de render para os **três** componentes que concentram risco e estado (`nova-compra-form` com 32 `useState`, `nova-movimentacao-form` com 20, `importar-wizard` com 13) — o que também derruba o argumento que hoje trava os itens **E** e **K** ("refatorar sem teste de componente troca dívida conhecida por risco de regressão"). Custa uma dependência nova (`@testing-library/react`), que precisa de aprovação do Johnny pela regra da stack fechada.

### Z — Drift de dependências `[Prio 10]` *(novo — 12/08/2026)*

19 pacotes atrás do `wanted`, todos patch/minor: `@supabase/supabase-js` (2.110.2 → 2.112.3), `lucide-react` (1.24 → 1.31), `radix-ui`, `recharts`, `react-hook-form`, `shadcn`, `docxtemplater`. Nenhum quebra contrato. As majors disponíveis (`@tanstack/react-table` 9, `eslint` 10, `next` 16.3, `@types/node` 26) ficam **fora** desta recomendação — major é decisão de fase, não de manutenção.

Fora do drift, `exceljs` arrasta um `uuid` vulnerável (moderate) e não tem versão corrigida publicada; é dependência aprovada e usada só server-side na leitura do `.xlsx`. **Aceitar e registrar**, não remover.

---

## Itens anteriores — revalidados

### T — `.xlsx` grande truncado em silêncio `[Prio 30]` — **inalterado**

Continua exatamente onde estava: `src/lib/import/xlsx.ts:117`, `Math.min(ws.rowCount, MAX_LINHAS + 1)` com `MAX_LINHAS = 20_000` (`:31`), sem `throw`, sem aviso, sem marca no resultado. `MAX_COLUNAS = 40` (`:106`) faz o mesmo com a largura. A operação seguinte apaga o acervo da filial e recria a partir do plano — truncar em silêncio é ativo que deixa de existir sem sinal. **Correção segue sendo de 1 linha** (trocar o `Math.min` por `throw` que nomeia linhas e teto). É a melhor relação valor/esforço da lista depois do item V.

### A — Ledger incompatível com o repo `[Prio 24]` — **inalterado por construção**

O diagnóstico de 24/07 continua válido e a distância só cresceu (55 → 109 migrations). As versions do ledger são timestamps de 14 dígitos gerados no ato do apply; os arquivos usam prefixo sequencial. `supabase db push` deste repo contra produção segue **inseguro** — e agora reaplicar a cadeia `0032`→`0037` regrediria a RPC do import por cima de `0048`, `0064`, `0080` **e** `0094`. O controle que funciona (sonda de efeito por `pg_get_functiondef` + job `banco` do CI, que aplica as 109 em ordem num banco novo) continua em uso. **A decisão pendente é de método, e é do Johnny:** seguir com apply por MCP + sonda, ou renomear as migrations para o padrão timestamp e adotar a CLI de verdade. Merece ADR.

### G — Tipos descartados na fronteira Supabase `[Prio 21]` — **piorou (38 → 55, +45%)**

29 das 55 estão em `queries/` (`ativos.ts` 8×, `movimentacoes.ts`, `itens.ts`, `estoque.ts`, `gerados.ts`, `compras.ts`, e agora `dev-destrutivo.ts`, `eventos-admin.ts`, `rpc-filial.ts`, `conflitos.ts` — arquivos das F22–F24). O padrão `(data ?? []) as unknown as Row[]` se espalhou com as fases novas. Uma coluna renomeada + `db:types` continua **não gerando erro** exatamente nas leituras de relatório.

### E — Componentes gigantes do import `[Prio 21]` — **piorou (2.132 → 2.217 linhas)**

`grupos-erros.tsx` 1.173 → **1.176**; `importar-wizard.tsx` 959 → **1.041** (+82). O wizard agora tem 13 `useState`. Mantido como **oportunístico** — mas ver item **Y**: sem teste de render, refatorar 2.217 linhas segue sendo troca de dívida por risco.

### N — `p_contagens` opcional `[Prio 16]` — **inalterado, e agora em 5 cópias**

`if p_contagens is not null and jsonb_typeof(p_contagens) = 'object'` em `0040:220`, `0048:156`, `0064:282`, `0080:197`, `0094:200`. Um cliente que passe `null` pula a revalidação de contagens sob advisory lock. Ver item **X** para a causa da multiplicação.

### I — Enum-fantasma `'outro'` `[Prio 16]` — **inalterado**

`import/tipos.ts:60` mantém o valor que o CSV nunca produz; o custo segue em `grupos-erros.tsx` (3×) e `ops-grupo.ts:124`, via `Exclude<CategoriaAtivo, 'outro'>`.

### B — Backups órfãos `[Prio 15]` — **`0058`/`0059` existem no repo; aplicação não verificada**

`0058_drop_backup_f18.sql` e `0059_advisors_rls_perf.sql` estão no repositório. **Não confirmei nesta sessão se foram aplicadas em produção** — a verificação exige o MCP do Supabase, fora do alcance desta auditoria. Fica como pergunta objetiva para o próximo apply. A regra proposta em 25/07 permanece a boa: **todo backup de operação nasce com uma migration de DROP datada**.

### U — Escrita em duas etapas sem transação `[Prio 12]` — **parcialmente abatido pela F38 (28/08/2026)**

**O que saiu da lista:** o caminho do **lote de movimentação** e o do **estorno com itens** deixaram de ser escrita em duas etapas. `criar_movimentacao_com_itens` (migration `0117`) grava as movimentações **e** os lançamentos de item numa transação só — tudo ou nada, uma linha ruim derruba o lote inteiro —, e `estornar_movimentacao_com_itens` (`0121`) desfaz o par inteiro ou recusa, nunca meio estorno. É o que o `CHANGELOG.md` da F38 chama de "abater o item U no caminho da movimentação".

**O que continua:** `actions/termos.ts:622-633` confirmado: o `update` em `ativos` ainda commita antes do `insert` em `anotacoes` ser avaliado. Mesmo padrão em `actions/ativos.ts:289` e `:375`. Nenhum dos dois estava no escopo da F38, e o paliativo barato (inverter a ordem — anotação órfã é inócua) continua não aplicado.

**E uma escrita em duas etapas nova ficou de pé DE PROPÓSITO:** o carrinho avulso de `lancarItens` (`src/lib/actions/itens.ts:70-132`) continua um `insert` por linha dentro de um `for`, sem RPC e sem transação. Isso não é a mesma dívida disfarçada — é decisão registrada: o cabeçalho de `transferirItens` (`itens.ts:143-149`) explica a diferença, "é o oposto deliberado do carrinho de lançamento, onde cada linha é independente: lá as linhas não se relacionam entre si; aqui cada par É a operação, e meia transferência é pior que nenhuma". O carrinho de `lancarItens` não tem essa garantia para proteger — uma linha falhar não deixa as outras inconsistentes entre si —, e por isso não entrou no tudo-ou-nada da F38.

### K / L — Convenção e coesão `[Prio 12]` — **pioraram**

`react-hook-form` está em **2** formulários reais (`editar-ativo-dialog`, `botao-ativar`). Contra isso: `nova-compra-form` **32** `useState` (era 23), `nova-movimentacao-form` **20** (era 15), e dois recrutas — `devolucao-fornecedor-form` (**20**) e `transferir-item-dialog` (**11**, F31). `termos.ts` cresceu de 611 para **832** linhas.

## Resolvido desde a auditoria anterior

### M — RLS "sempre true" + visualizador em service-role — **substancialmente resolvido pelas F21–F24** ✅

O item estratégico da rodada anterior ("12 políticas `using/check (true)`; todo operador escreve tudo; a defesa mora no trigger e no render") **não descreve mais o sistema**. As policies permissivas listadas em `0070` estão lá como **histórico comentado**; o que vale hoje são **199** referências a `pode_escrever()`, `pode_escrever_filial()`, `e_admin()` e `e_dev()` nas policies, com hierarquia `dev ⊃ admin ⊃ operador ⊃ consulta` e escrita por filial. A regra migrou para o Postgres — que era exatamente a recomendação.

Restam **34** `using (true)` vivos, e a leitura deles é outra: são o **piso de leitura declarado** (`0063`, `0050`, `0043`) — "todo logado ativo lê tudo", decisão registrada no `CLAUDE.md`, não descuido. As sessões de visualização por senha seguem em `createAdminClient()` (service role), também por design documentado. **Rebaixo o item de 🟡 estratégico para observação**, e o que fica é a recomendação de sempre: um ADR quando/se o piso de leitura mudar.

## Plano de remediação faseado

Desenhado para caber **ao lado** do trabalho de fase, não no lugar dele.

### Faixa 1 — Uma tarde, e fecha os dois itens mais bem pagos `(~½ dia)`
- **V:** `npm i next@16.2.11` · `npm audit` · `lint`/`build`/`test` · smoke logado. Sem mudança de código.
- **T:** trocar o `Math.min` de `xlsx.ts:117` por um `throw` que nomeia linhas e teto (o wizard já trata exceção de análise como erro de arquivo) + teste.
- **Z:** `npm update` no drift patch/minor (majors ficam de fora). Registrar o `uuid` do `exceljs` como aceito.

> Junto: uma versão **PATCH** e entrada no CHANGELOG + `registry.ts`, pela regra permanente da F35.

### Faixa 2 — Fechar a classe do fuso, não as ocorrências `(~1–2 dias)`
- **W (parte 2 primeiro):** o teste de grep que recusa `current_date` cru em migration nova — irmão de `marcadores-sql.test.ts`. **Escrever a trava antes da correção** é o que impede a sexta reincidência.
- **W (parte 1):** migration aditiva com `estoque.hoje()`; aplicar em `0084` e `0104`, que não batem no gate.
- **N + W dentro do import:** as duas emendas na mesma passagem pela RPC (caminho B do runbook, uma janela só).
- **B:** confirmar `0058`/`0059` em produção; adotar a regra do DROP datado.

### Faixa 3 — Tipos e a fronteira `(~3–5 dias)`
- **G:** helper tipado para os joins, começando por `queries/ativos.ts` e `queries/movimentacoes.ts` (≈14 das 29 ocorrências em `queries/`).
- **I:** limpar o enum-fantasma na mesma passagem (mesma área).

### Faixa 4 — Destravar o hotspot do import `(oportunístico)`
Ordem importa: **Y antes de E, K, L.** Três testes de render (`nova-compra-form`, `nova-movimentacao-form`, `importar-wizard`) custam uma dependência a aprovar e removem o argumento que trava os outros três. Depois: quebrar `grupos-erros`/`wizard` em subcomponentes, migrar os forms para `react-hook-form`, fatiar `termos.ts`. **Nunca como big-bang.**

### Faixa 5 — Estrutural, exige decisão do Johnny
- **X:** decompor `importar_ativos_substituir` para que a próxima mudança recrie uma função auxiliar, não 470 linhas.
- **A:** ADR sobre o método de migration (MCP + sonda × renomear para timestamp e adotar a CLI).

## O que está saudável (para calibrar)

- **`lint`, `build` e `test` limpos** nesta sessão — **2.544 testes** em 124 arquivos, ~91s.
- **Zero `any`** em código de produção; zero `FIXME`/`HACK`/`@ts-ignore`; 3 `eslint-disable`, todos justificados em comentário.
- **CI com banco real** — sobe Postgres, aplica as **109** migrations em ordem e roda os roteiros SQL, com CLI **fixada** em 2.109.1 e telemetria desligada (duas armadilhas de terceiro já domadas e documentadas no próprio workflow).
- **Duas travas TS↔SQL ativas** (`marcadores-sql.test.ts`, `transicoes-sql.test.ts`) — é o padrão certo para o acoplamento que este projeto tem por natureza, e o item **W** pede exatamente uma terceira.
- **Trava de versionamento** (F35): `registry.test.ts` + `cobertura-changelog.test.ts` derrubam o `test` se uma entrada de CHANGELOG ficar sem versão. Regra que não depende de ninguém lembrar dela — o mesmo princípio que a Faixa 2 aplica ao fuso.
- **Modelo de acesso no banco** — o item **M** saiu do papel para o Postgres em três fases.
- **Documentação viva:** `MATRIZ-REGRAS`, `ARQUITETURA`, `ESPECIFICACAO`, `README` e `CHANGELOG` todos tocados na última semana; `DECISOES.md` com 5.835 linhas de rastro.

---

*Método: leitura estática do repositório na `main` (`c76172a`), execução de `npm run lint`, `npm run build`, `npm run test`, `npm audit` e `npm outdated`, e varredura das 109 migrations. **Não** houve consulta a produção nem ao ensaio nesta sessão — os itens **A** e **B** dependem de sonda de banco para fechar, e estão marcados como tal.*

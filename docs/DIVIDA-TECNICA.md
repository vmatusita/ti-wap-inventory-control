# Dívida Técnica — Estoque TI WAP

> **Atualização de 30/08/2026 — revisão de projeto de sistema.** Seis itens desta lista foram
> FECHADOS e um foi verificado; o restante segue válido. Fechados: **V** (`next` em `16.2.12`,
> 13 vulnerabilidades → 2), **Z** (drift patch/minor em dia), **T** (o `.xlsx` grande passou a ser
> recusado, com mensagem para o operador, em vez de truncado em silêncio), **W** (o fuso foi
> corrigido pela CLASSE — `alter database set timezone` na migration `0124` —, não RPC a RPC, e
> ganhou trava no CI), **I** (o enum-fantasma `'outro'` saiu do motor de import) e **B**
> (verificado: `0058`/`0059` estão aplicadas em produção; a `_bkp_relatorios_gerados_f6a`
> permanece de propósito — ver a ata). O item **G** PIOROU (55 → 60 `as unknown as`). Detalhe,
> medições e os cinco itens que dependem de decisão do Johnny em
> [`SYSTEM-DESIGN-2026-08-30.md`](SYSTEM-DESIGN-2026-08-30.md).

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
| **L** | `termos.ts` (918) — responsabilidades misturadas | Código | 2 | 2 | 3 | **12** |
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

`react-hook-form` está em **2** formulários reais (`editar-ativo-dialog`, `botao-ativar`). Contra isso: `nova-compra-form` **32** `useState` (era 23), `nova-movimentacao-form` **20** (era 15), e dois recrutas — `devolucao-fornecedor-form` (**20**) e `transferir-item-dialog` (**11**, F31). `termos.ts` cresceu de 611 para **832** e, com a F39, para **918** linhas (+86: a leitura dos acessórios da movimentação, os dois avisos novos e a derivação de `tem_acessorios`). A F39 manteve a disciplina que a dívida pede — o JULGAMENTO foi para módulos puros (`termos/acessorios.ts`, `avisoConferenciaSemLancamento` em `termos/preparo.ts`) e a LEITURA para `queries/itens.ts`; o que cresceu aqui é só a orquestração. Ainda assim, cresceu.

#### Emenda F42 (31/08/2026) — o que a fase das telas de item fez com este item

`transferir-item-dialog` **não** migrou para `react-hook-form`, e o motivo fica registrado aqui com
o custo declarado, para a próxima pessoa não repetir a análise do zero:

- **O que foi feito:** o carrinho multi-linha, que estava COPIADO nos dois diálogos de item, virou
  um componente só (`src/components/itens/carrinho-linhas.tsx`) com a forma da linha junto. O
  diálogo de transferência caiu de **457 para 424** linhas e o de lançamento, de **893 para 637** —
  este último também perdendo três pedaços de **código morto** que a F41 deixou (a segunda pergunta
  da escolha de tipo, que era sempre `null`; o botão do "grupo duplo"; e o placeholder do chamado
  que ramificava num tipo que a tela não oferece mais).
- **O que NÃO foi feito, e por quê:** a migração de estado. Este repositório não renderiza
  componente em teste — `vitest.config.mts` roda em `node` e só inclui `*.test.ts`. Migrar seria
  reescrever, sem rede, quatro mecanismos não-mecânicos: a validação por linha (`errosPorLinhaDoLote`
  devolve um mapa índice→mensagem que o diálogo espalha à mão em `l.erro`), a checagem de saldo
  pré-envio (uma segunda passada síncrona depois do `safeParse`), o `limpar()` que preserva origem e
  destino **de propósito**, e o foco imperativo da primeira linha. É o mesmo argumento que trava o
  item **E** e que o item **Y** aponta como o desbloqueio real.
- **O custo do desbloqueio continua sendo o mesmo:** `@testing-library/react`, dependência nova, que
  precisa de aprovação do Johnny pela regra da stack fechada (item **Y**).

**O que a F42 quitou:** a duplicação do carrinho entre os dois diálogos (era forma copiada, não
importada), e o tipo `LinhaCarrinho`, que estava definido duas vezes com o mesmo corpo.

**Dívida nova, pequena e com dono:** o teto de `TETO_PALETA_CRUA` desceu de 479 para **473**, mas o
número de ARQUIVOS com cor crua subiu de 59 para **61** — a tabela única e os pedaços do diálogo
viraram cinco componentes, e o vermelho do "faltam N" e o âmbar dos avisos foram junto. São as
mesmas ocorrências, mais espalhadas; a conversão para token de selo continua sendo trabalho das
frentes seguintes do sistema de design.

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

---

## Achados da F40 (30/08/2026) — sistema de design

### AA — A tinta de ÁREA e a tinta de TEXTO ainda são a mesma decisão `[Prio 12]` *(novo — 30/08/2026)*

O selo é **texto** sobre pastilha clara: piso 4,5:1 pela WCAG, o que obriga tinta escura e croma
baixo. O segmento de gráfico é **área**: piso 3:1 pela WCAG 1.4.11, o que lhe dá três pontos de
folga para saturar. **São duas réguas, e o WAP resolve as duas com uma decisão só** — a cor de cada
status é escolhida uma vez e serve ao badge, ao acento do KPI tile, à barra do acervo, ao segmento
empilhado, à série temporal e ao swatch do glossário.

**Os dois números, medidos agora com `npm run contraste`:**

| par | tema | razão | piso | veredito |
| --- | --- | ---: | ---: | --- |
| segmento Emprestado `#06b6d4` sobre `card` | claro | **2,43:1** | 3:1 | ⚠️ abaixo do piso |
| segmento Reservado `#6d28d9` sobre `card` | escuro | **2,52:1** | 3:1 | ⚠️ abaixo do piso |

Os dois são **alívios registrados**, não descuido: o segmento carrega rótulo de valor dentro (com o
`fill` preto/branco escolhido por luminância medida), total na ponta, legenda com o nome escrito e
tooltip — quatro canais de texto além da cor. O registro está em `scripts/contraste.mjs`.

**Por que a F40 não resolveu:** separar as tintas **muda a cor dos gráficos**. É mudança visível,
exige nova rodada de medição de ΔE sob simulação de daltonismo (a análise de 10/08 §4 é o
precedente) e é decisão do dono — não efeito colateral de uma refatoração de layout.

**O que a F40 fez:** deixou o terreno pronto. Os nove `--grafico-<familia>` existem em
`src/app/globals.css` com o valor de hoje, `STATUS_CHART_COLOR` aponta para eles e
`src/lib/dominio/cores.test.ts` espelha os hex em `TOKEN_PARA_HEX`. **Trocar a tinta de área virou
editar uma linha de CSS**; antes era editar `dominio.ts` e torcer para `fillRotuloSegmento`
entender o valor novo (a armadilha que o próprio arquivo documenta).

**Esforço** 2 · **Impacto** 2 · **Risco** 2 — mas o gatilho é uma decisão, não uma tarde de código.

### AB — O âmbar é 56% da cor crua, e dá para tokenizá-lo SEM repintar `[Prio 32]` *(novo — 30/08/2026)*

**310 das 555 classes de paleta crua do inventário são âmbar** — mais do que todas as outras doze
famílias somadas. O callout
`border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200`
está reescrito à mão em dezenas de lugares, sempre igual (a única exceção do repositório é
`mesa-conflitos.tsx:515`, com `dark:border-amber-700/60`).

**O caminho fácil é o errado.** O token `--warning` já existe e já é medido, e é o que o plano
§3.6 prescreve para o `Aviso` — mas ele mede **4,92:1** contra os **8,77:1** do âmbar de hoje.
Migrar para ele é repintar dezenas de telas E piorar o contraste. Foi por isso que a F40 criou o
`Aviso` e **não o aplicou** (ata em `docs/DECISOES.md`).

**A correção, e ela é barata:** uma décima família de token —
`--callout-atencao` / `--callout-atencao-texto` / `--callout-atencao-borda`, nos dois temas, com os
**valores oklch de hoje** copiados do `theme.css` do Tailwind, exatamente como as nove famílias de
selo da F40. Aí o `Aviso` pinta com token, as dezenas de cópias colapsam num componente só, **zero
pixel muda** e a catraca de cor crua cai de 479 para perto de 200 em uma frente.

É a melhor relação valor/esforço da lista depois dos itens já fechados: **é meia tarde de trabalho e
resolve mais da metade da dívida de cor.** Recomendado como o **primeiro movimento da frente a**.

**Esforço** 1 · **Impacto** 4 · **Risco** 1.

### V (reaberto) — `next@16.2.12`: três advisories novos em `postcss` e `sharp` `[Prio 20]`

O item V foi fechado em 30/08/2026 com o `next` em `16.2.12` e o total de vulnerabilidades em 2.
Ao instalar o Playwright nesta mesma data, o `npm audit` passou a acusar **5 (2 moderate, 3 high)**.

**O Playwright não trouxe nenhuma delas** — conferido: ele depende só de `playwright-core`
(`npm ls postcss sharp uuid` mostra que os três vêm de `next`, `@tailwindcss/postcss`, `shadcn`,
`vitest` e `exceljs`). São advisories **publicados depois** do fechamento do item:

- `postcss <= 8.5.22` (HIGH) — quatro advisories, três deles de leitura arbitrária de `.map` por
  `sourceMappingURL`. Chega por `next@16.2.12`, que embute `postcss@8.4.31`.
- `sharp < 0.35.0` (HIGH) — CVEs herdados do libvips. Chega por `next` (`sharp@0.34.5`).
- `uuid < 11.1.1` (moderate) — o de sempre, por `exceljs`, sem correção publicada; aceito e
  registrado desde 12/08.

`npm audit fix --force` quer instalar `next@16.3.3`, que está **fora da faixa da stack fechada** —
major/minor de framework é decisão de fase, não de manutenção, e a F40 é uma ordem de apresentação.
**Fica registrado, não corrigido nesta ordem.**

---

## Emenda F41 — 31/08/2026

**Uma dívida QUITADA, e ela era antiga.** O *"carrinho sem transação"* de `lancarItens` — um `for`
de INSERTs sequenciais em que a terceira linha podia falhar e as duas primeiras ficarem gravadas —
morreu: o lançamento avulso passa pela RPC `lancar_itens_lote` (`0126`) e é **tudo ou nada**, como o
lote de movimentações já era desde a F38. O resultado por linha sobreviveu, porque a tela depende
dele: a RPC etiqueta a linha culpada em `detail` (`f41_linha=N`).

**Três dívidas novas, todas pequenas e todas com dono:**

- **`itens_nome_uidx` ficou redundante.** O índice único antigo (sobre `lower(nome)`, da `0014`)
  convive com o novo `itens_nome_chave_uidx` (sobre `item_chave(nome)`, `0125`), que é
  ESTRITAMENTE mais forte — toda colisão que o antigo pega, ele também pega, e mais. Mantê-lo custa
  um índice a mais numa tabela de 22 linhas; derrubá-lo é mudança de esquema fora do escopo da
  ordem. `traduzErroBanco` traduz os DOIS nomes para a mesma frase, então nada quebra enquanto ele
  existir. **Candidato a sair na próxima ordem de itens**, que já mexe nessa área.
  Rollback quando for a hora: `drop index public.itens_nome_uidx;`
- **A marca `regularizacao` é gravável por fora das RPCs.** Diferente de `forcado` (`0079`), que o
  `guarda_acervo` recusa em INSERT fora da janela, `regularizacao` é uma coluna comum: um INSERT
  direto via PostgREST pode marcá-la sem ter havido acerto nenhum. É **mislabel, não escalada de
  privilégio** — quem faz esse INSERT já podia gravar o lançamento —, e o efeito máximo é uma linha
  do histórico dizendo "acerto automático" sobre um ajuste manual. Aceito conscientemente: o plano
  de área é explícito em que a marca **não é** `forcado`. Se um dia o volume de acertos virar número
  de gestão, aí vale uma guarda.
- **A partição é do PAR (item, filial), não da pessoa.** Se a aplicação mandar um `retorno` com
  `colaborador_id` de alguém sem saldo, a guarda por pessoa da `0118` recusa e o lote cai — que é o
  comportamento anterior à F41, não uma regressão. Quem protege disso é a regra §C.3 em
  `src/lib/itens/vinculo-retorno.ts`, que derruba o vínculo quando a pessoa não tem saldo, e ela é
  testada nos três caminhos. O buraco só se abre por payload forjado ou por bug de chamador novo.
  **Não foi fechado de propósito:** fechá-lo exigiria a partição também por pessoa, o que o plano de
  área não pede e o desenho não precisa.

**Uma observação de ambiente, que não é dívida de código.** `supabase/tests/dev_destrutivo.sql`
acusa **7 falhas no projeto de ENSAIO** (§6/§7, a cadeia do reset) e passa **verde no CI**, que sobe
um Postgres novo. Nada que a F41 toca — as contagens daquele roteiro são de ativos e movimentações.
O que falha é o ESTADO acumulado do ensaio, com dados e objetos de storage de fases anteriores. Ou o
ensaio merece uma limpeza, ou o roteiro merece ser tolerante a resíduo; enquanto nenhum dos dois
acontecer, **a leitura certa de `dev_destrutivo` é a do CI, não a do ensaio** — e quem rodar a pasta
inteira no ensaio vai reencontrar isso.

**O `database.ts` estava velho, e isso é dívida de processo.** Nenhuma fase regenerou os tipos desde
a F38; quando a F41 regenerou (CLI fixada 2.109.1, contra produção), duas assinaturas de RPC mudaram
de `string | null` para `string` e quebraram o typecheck em chamadores que a fase não tinha tocado.
A correção foi de duas linhas e é equivalente, mas o padrão é claro: **tipos que só se regeneram
quando alguém lembra acumulam divergência silenciosa.** Vale um passo de CI que rode `db:types` e
falhe se o arquivo mudar.

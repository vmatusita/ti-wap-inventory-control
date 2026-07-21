# Dívida Técnica — Estoque TI WAP

Auditoria completa do projeto em **21/07/2026** (skill `tech-debt`). Diagnóstico — **nenhum código foi alterado**. Prioriza pela fórmula da skill: `Prioridade = (Impacto + Risco) × (6 − Esforço)`, cada eixo de 1 a 5 (esforço invertido: menor esforço = maior prioridade).

Escala de esforço → tempo aproximado: **1** ≈ ½ dia · **2** ≈ 1–2 dias · **3** ≈ 3–5 dias · **4** ≈ 1–2 semanas · **5** ≈ 1 mês+.

## Sumário executivo

A base é **madura e disciplinada**: TypeScript strict com **zero `any`**, quase nenhum marcador de dívida (`FIXME/HACK/@ts-ignore` inexistentes; 1 `eslint-disable` justificado), 567 testes de funções puras verdes, decisões rastreadas em `docs/DECISOES.md`. A dívida real **não é bagunça** — é **acoplamento por convenção/comentário** (o mesmo fato codificado em 2–3 camadas mantidas em sincronia manual) e **processo de banco frágil**, concentrados em dois lugares: (1) a fronteira **TypeScript ↔ Postgres** e (2) a feature de **import** (`admin/importar`), que sofreu ~10 iterações sobre os mesmos arquivos (F7 → F7K).

**Os três vetores de risco mais graves se reforçam:** migrations destrutivas aplicadas **à mão em produção** (o gate do modo autônomo bloqueia a DDL) + estado de produção **não reproduzível pelo repositório** + **zero teste automatizado de banco**. Juntos, significam que a fonte da verdade declarada (as migrations) **não é, na prática, a fonte da verdade de produção**.

## Saúde por categoria

| Categoria | Estado | Observação |
|---|---|---|
| **Código** | 🟡 Médio | Base limpa, mas 2 componentes de import gigantes (1148 + 943 linhas) e duplicação de utilitários/constantes de contrato. |
| **Arquitetura** | 🟡 Médio | Máquina de estados e vocabulários duplicados TS↔Postgres sem trava de compilação; RLS "sempre true" (autorização mora em trigger/render). |
| **Testes** | 🟠 Alto | 567 testes cobrem só **funções puras**. Zero teste de RPC/trigger/RLS/Server Action; CI não sobe Postgres. |
| **Dependências** | 🟢 Baixo | Stack fechada e atual (Next 16.2.10, React 19.2.4, Supabase 2.110). Sem libs abandonadas. Falta só `npm audit`/Dependabot no CI. |
| **Documentação** | 🟡 Médio | Excelente rastro de decisões, mas `README` virou changelog-parede, `schema.sql` histórico/defasado ainda versionado, sem runbook consolidado. |
| **Infraestrutura** | 🔴 Crítico | Gate → migrations destrutivas aplicadas à mão em prod; backups órfãos com dados reais; CI só valida TypeScript. |

## Lista priorizada

| # | Item | Categoria | Impacto | Risco | Esforço | **Prioridade** |
|---|---|---|:-:|:-:|:-:|:-:|
| B | Tabelas de backup órfãs com dados reais em prod (DROP pendente) | Infra/Seg | 3 | 5 | 2 | **32** |
| H | Strings de contrato sincronizadas à mão (`OBS_*`, `∅`, prefixos, cap 60) | Código/Arq | 3 | 4 | 2 | **28** |
| D | Máquina de estados/vocabulário duplicado TS ↔ Postgres | Arquitetura | 4 | 4 | 3 | **24** |
| E | Componentes gigantes do import (`grupos-erros` 1148 + `wizard` 943) | Código | 4 | 3 | 3 | **21** |
| G | Tipos descartados na fronteira Supabase (`as unknown as Row`) | Código/Arq | 3 | 4 | 3 | **21** |
| A | Gate: migrations destrutivas à mão + prod não reproduzível | Infra | 5 | 5 | 4 | **20** |
| J | Duplicação de utilitários (`hojeIso`×3, download×3, escape×2) | Código | 2 | 2 | 1 | **20** |
| C | Zero teste de banco/RPC; CI só valida TypeScript | Testes/Infra | 4 | 4 | 4 | **16** |
| I | Código morto / vestígios (F7H, enum `outro`, `0035`, `schema.sql`) | Código/Doc | 2 | 2 | 2 | **16** |
| N | `p_contagens` opcional (TOCTOU burlável) + autoria spoofável | Infra/Seg | 1 | 3 | 2 | **16** |
| O | `traduzErroBanco(code)` só pela metade + `ActionResult` divergente | Código | 2 | 2 | 2 | **16** |
| P | Documentação (README-changelog, `schema.sql` defasado, sem runbook) | Doc | 2 | 2 | 2 | **16** |
| Q | Sem `npm audit`/Dependabot no CI (deps sãs hoje) | Dependência | 1 | 2 | 1 | **15** |
| F | Escada de precedência do patrimônio no import (5 níveis) | Código | 3 | 4 | 4 | **14** |
| K | Forms manuais com `useState` vs `react-hook-form` (convenção) | Código | 2 | 2 | 3 | **12** |
| L | `termos.ts` (604) — responsabilidades misturadas | Código | 2 | 2 | 3 | **12** |
| M | RLS "sempre true" + visualizador em `service_role` | Arq/Seg | 2 | 4 | 4 | **12** |

## Detalhamento e justificativa de negócio

### B — Backups órfãos com dados reais em produção `[Prio 32]`
`_f8_backup_matriz_compras` (809 linhas), `_f7k_backup_modelo` (75), `_bkp_relatorios_gerados_f6a`. Criadas ad-hoc em prod por operações manuais — **não existem em nenhuma migration nem no `schema.sql`**. A `0038` só aplicou um stopgap de RLS via `execute_sql` (fora das migrations); o **DROP continua pendente** (`docs/DECISOES.md:1064`). 884 linhas de **dado real** chegaram a ser legíveis pela anon key.
**Negócio:** dado real de colaborador/patrimônio parado em tabelas que ninguém versiona; a correção some se o banco for recriado. Encerra um incidente de exposição já identificado.

### H — Strings de contrato sincronizadas à mão `[Prio 28]`
Marcadores de carga `OBS_CARGA_GOLIVE`/`OBS_IMPORT_STARTUP` (`dominio.ts:257,286`) precisam ser **byte-idênticos** a literais nas migrations `0032→0036` e são usados por interpolação em filtros PostgREST (`relatorios/movimentacoes.ts:217,226,275,283`). `SEM_PATRIMONIO = '∅'` redeclarado em `plano.ts:82` e `import-logs.ts:96`; cap de 60 chars em `plano.ts:155,160` **e** `0037_...sql:108`; prefixos `WAP,PRO,LEA,TEC,STF,PAT,NOO` em `deparas.ts:143`.
**Negócio:** um typo de sincronia TS↔SQL re-exporia ~1.576 linhas de abertura no relatório de produção **sem nenhum erro de compilação**. É o dano de maior alcance por menor esforço.

### D — Máquina de estados e vocabulário duplicados TS ↔ Postgres `[Prio 24]`
`TRANSICOES` (`validators/movimentacao.ts:14-47`) é, por comentário, "cópia EXATA" da tabela do trigger `aplicar_movimentacao` (`0004`). `CAMPOS_POR_TIPO` (`:120-144`) é uma terceira fonte da mesma regra. As opções de `termo_status` estão **hardcoded no JSX** (`passo-movimentacao.tsx:215-220`) em vez de derivar de `Constants.public.Enums`.
**Negócio:** a premissa "o banco manda, a UI é a segunda linha" só se sustenta se as cópias baterem — hoje uma transição nova no banco **não quebra o build do front**. Divergência = movimentação válida recusada (ou inválida aceita) na tela.

### E — Componentes gigantes do import `[Prio 21]`
`grupos-erros.tsx` (1148 linhas, **19 componentes** num arquivo, com dois modelos de estado convivendo) e `importar-wizard.tsx` (943 linhas, **12 `useState` + 2 `useTransition`**, 5 passos inline). Cada `kind` de erro das 10 iterações empilhou mais um par Card/Linha aqui.
**Negócio:** o import destrutivo é a operação de maior risco do sistema; qualquer ajuste mexe em arquivos de 900+ linhas com regressão cruzada entre passos. Alto custo cognitivo trava evolução e revisão.

### G — Segurança de tipos descartada na fronteira Supabase `[Prio 21]`
`as unknown as <RowEscritaÀMão>` em `termos.ts:128`, `queries/ativos.ts:187,288,308`, `relatorios/estoque.ts:312`, `gerados.ts:106,132`, `movimentacoes.ts:86`, `itens.ts:163`. `nova-movimentacao-form.tsx:206` envia o lote como `as never`. `database.ts` é **gerado**, mas os resultados de join aninhado não são checados contra ele.
**Negócio:** uma coluna renomeada no banco + `db:types` **não gera erro** exatamente onde mais importaria (leituras de relatório). O investimento em tipos gerados é anulado na fronteira.

### A — Gate de produção: migrations destrutivas à mão + prod não reproduzível `[Prio 20]`
O classificador do modo autônomo bloqueia via MCP qualquer DDL que toque `delete from ativos/movimentacoes` — então `0031–0037` foram aplicadas **à mão no SQL Editor** e **não constam no `supabase_migrations` de produção**. Armadilha já concretizada: *"na 1ª tentativa o editor rodou a 0033 por engano e nada aplicou"* (`README.md:68`).
**Negócio:** o estado de produção não é reconstruível pelo histórico do repo; a seleção humana do arquivo certo é o único controle. É o risco de **perda de dado** mais estrutural — daí Impacto e Risco máximos, apesar do esforço alto de resolver por completo.

### J — Duplicação de utilitários `[Prio 20]`
`hojeIso()` idêntico em `plano.ts:70`, `validators/importar.ts:59`, `ops-grupo.ts:41`; escape de CSV em `correcoes.ts:345` e `wizard:64`; padrão "Blob+BOM+`<a>`+click+revoke" 3× no wizard; `TAMANHO_MAX` (5 MB) em `importar.ts:42` e `wizard:50`, descasado do `bodySizeLimit` 8 MB (`next.config.ts:19`).
**Negócio:** ganho rápido — a régua "data não futura" e o formato de export dependem de cópias concordarem. Baixíssimo esforço, remove armadilhas silenciosas.

### C — Zero teste automatizado de banco/RPC `[Prio 16]`
CI (`.github/workflows/ci.yml`) roda `lint` + `vitest` (só puras) + `build` com credenciais placeholder. **Não sobe Postgres, não aplica migrations, não exercita RPC/trigger.** Os roteiros em `supabase/tests/*.sql` são para colar à mão no SQL Editor.
**Negócio:** a lógica crítica (máquina de estados, saldos de itens, import) não tem rede automatizada. Combinado com A (apply manual), **nada intercepta** uma migration errada antes da produção.

### I — Código morto e vestígios `[Prio 16]`
`contagensParaRevalidar` (`import-logs.ts:217`) exportada e sem uso; enum-fantasma `'outro'` (`tipos.ts:51`) nunca produzido mas guardado em ~4 lugares com `Exclude<…>`; comentários narrando a F7H revertida (`dominio.ts:274`, `relatorios/movimentacoes.ts:218`); migration `0035` viva porém superada pela `0036`; `schema.sql` histórico defasado.
**Negócio:** superfícies mortas sugerem caminhos que não existem e custam leitura a cada manutenção. Limpeza barata.

### N — `p_contagens` opcional (TOCTOU) + autoria spoofável `[Prio 16]`
A revalidação de contagens sob advisory lock — defesa central contra apagar um acervo que mudou — é `if p_contagens is not null` (`0034:237`): um cliente passando `null` **pula a guarda**. `criar_compra_lote` (`0008`/`0024`) confia no `p_criado_por` do cliente em vez de `auth.uid()`. Ambos já flagados ao Johnny (`DECISOES.md:1065-1066`).
**Negócio:** endurecer a invariante mais perigosa do import (delete destrutivo) e a integridade da trilha de auditoria.

### O — Tratamento de erro inconsistente `[Prio 16]`
`traduzErroBanco(code)` ganhou o parâmetro SQLSTATE na F7F, mas quase todos os chamadores fora do import ainda passam só a mensagem (`movimentacoes.ts`, `itens.ts`, `compras.ts`, `termos.ts`) — o mapeamento por código fica inerte, caindo em `message.includes('duplicate')` espalhado (`itens.ts:128,161`, `admin.ts:143,187,212`). Formatos de retorno divergem (`erro` vs `erroGeral` vs `erros[]`) apesar do `ActionResult` consolidado.
**Negócio:** mensagens de erro frágeis (dependem de substring da mensagem do Postgres) e UI de erro que trata cada action caso a caso.

### P — Documentação `[Prio 16]`
`README.md` virou changelog-parede (status F0→F7K denso); `schema.sql` histórico ainda no repo como se fosse fonte; sem runbook único do procedimento de deploy/migration em produção (hoje espalhado em decisões).
**Negócio:** onboarding e continuidade — o conhecimento do gate/apply-manual é tribal, distribuído em `DECISOES.md`.

### Q — Sem varredura automática de dependências `[Prio 15]`
Deps atuais e sãs hoje, mas sem `npm audit`/Dependabot/Renovate no CI. Dívida latente: sem alarme quando uma CVE surgir.
**Negócio:** barato de ligar, evita a defasagem que vira urgência.

### F — Escada de precedência do patrimônio `[Prio 14]`
`montarPlanoImport` (`plano.ts:131-195`) resolve o patrimônio em 5 ramos ordenados (célula canônica → forçado → hostname → vazio → bloqueante), com ~40 linhas de comentário registrando revogações sucessivas de invariantes. A **ordem dos `else if` é a especificação**.
**Negócio:** núcleo de complexidade onde as iterações F7* colidem; alto risco a cada caso novo. Esforço alto (é lógica de domínio genuína) — extrair para módulo isolado e testado exaustivamente.

### K / L — Convenção e coesão `[Prio 12]`
`nova-compra-form.tsx` e o fluxo de nova movimentação usam `useState` manual + validação na mão, contra a convenção `react-hook-form` do `CLAUDE.md`. `termos.ts` (604) mistura render de `.docx`, Storage, regra de flag, anotações e formatação de nome.
**Negócio:** inconsistência de padrão amplia superfície de bug (cada form reinventa a trava anti-duplo-submit); `termos.ts` seria mais testável fatiado.

### M — RLS "sempre true" + visualizador em service-role `[Prio 12]`
Políticas RLS `using/check (true)` (`0005,0010,0014,0031`) — todo operador escreve tudo; a defesa mora no trigger e no render. Sessões de visualização por senha usam `createAdminClient()` (service role, **ignora RLS** — `acesso.ts:84`).
**Negócio:** por design documentado, mas concentra confiança: um bug de escopo por filial numa query de relatório superexpõe dados entre filiais **sem rede do banco**. Endereçar é caro (redesenho de RLS) — item estratégico, não urgente.

## Plano de remediação faseado (junto do trabalho de feature)

Pensado para o **modo autônomo** e a cadência de fases. Cada faixa entrega valor sozinha e cabe entre/junto das ordens de serviço pendentes (F6C, F5).

### Faixa 0 — Higiene imediata `(~2 dias, pega carona no próximo deploy)`
Itens **B, H, I, J**. Baixo esforço, alto valor, baixo risco.
- **B:** `DROP` das tabelas de backup órfãs (após confirmar que o backup já cumpriu o papel) e registrar a limpeza no repo. Segue o gate → SQL entregue ao Johnny.
- **H:** centralizar as constantes de contrato numa fonte única + **teste que faz grep na migration** garantindo que o literal TS bate com o SQL.
- **I:** remover `contagensParaRevalidar`, o enum `'outro'`, os comentários da F7H já resolvida; decidir o destino do `schema.sql` (mover para `docs/historico/` ou apagar).
- **J:** extrair `hojeIso`, escape de CSV e download-de-blob para utilitários únicos; unificar `TAMANHO_MAX`.

### Faixa 1 — Blindar a fonte da verdade `(~1 semana, antes do próximo import destrutivo)`
Itens **A (parcial), N, D (parcial)**.
- **N:** tornar `p_contagens` obrigatório na RPC destrutiva; `criar_compra_lote` usar `auth.uid()`.
- **A:** reconciliar o ledger `supabase_migrations` de produção com o repo; documentar um **procedimento de apply com checksum** (qual arquivo, hash, verificação pós-apply) — não remove o gate, torna-o à prova de "arquivo errado".
- **D/H:** teste de sincronia TS↔SQL para a matriz de transições e os marcadores de carga.

### Faixa 2 — Rede de testes + tipos `(~1–2 semanas)`
Itens **C, G, O**.
- **C:** subir Postgres no CI, aplicar migrations e rodar smoke das RPCs críticas (máquina de estados, saldos, import) — reaproveitar os roteiros de `supabase/tests/`.
- **G:** eliminar `as unknown as Row` gerando/validando os tipos de leitura contra `database.ts` (helper tipado para os joins de relatório).
- **O:** propagar `traduzErroBanco(code)` e unificar o formato de `ActionResult`.

### Faixa 3 — Refatorar o hotspot do import `(oportunístico, quando tocar o import)`
Itens **E, F, K, L**. Fazer **junto** da próxima mudança no import, não como big-bang.
- **E:** quebrar `grupos-erros.tsx`/`importar-wizard.tsx` em subcomponentes + hooks (≥10 arquivos).
- **F:** extrair a escada de precedência do patrimônio para um módulo puro isolado, coberto por testes de tabela.
- **K/L:** migrar os forms centrais para `react-hook-form`; fatiar `termos.ts`.

### Faixa 4 — Estratégico / opcional `(quando fizer sentido)`
Itens **M, P, Q**.
- **Q:** ligar `npm audit --production` (ou Dependabot) no CI — meia hora.
- **P:** mover o changelog do README para `CHANGELOG.md` e criar um runbook único de deploy/migration; aposentar o `schema.sql`.
- **M:** avaliar RLS real por filial — decisão de arquitetura, registrar em ADR antes de mexer.

## O que está saudável (para calibrar)

- **TypeScript strict com zero `any`** e quase nenhum marcador de dívida — raro.
- **Zero bypass de auth** em código de aplicação; o proxy Edge só checa presença do cookie e a verificação real (HMAC + scrypt) roda em Node.
- **Os 8 `console.*`** em `src` são todos apropriados (log de erro não mapeado, error boundary, degradação de combobox) — nenhum `console.log` esquecido.
- **Dependências atuais** e stack fechada por decisão — dívida de dependência genuinamente baixa.
- **Rastro de decisões** (`docs/DECISOES.md`) exemplar — a maioria das dívidas de infra abaixo **já está catalogada lá** como pendência conhecida, não como surpresa.

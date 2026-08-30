# Projeto de sistema — Estoque TI WAP (30/08/2026)

Revisão arquitetural do sistema inteiro pelo método da skill `system-design`: requisitos →
desenho de alto nível → aprofundamento → escala e confiabilidade → trade-offs → o que
revisitar quando crescer. Escrita **depois** de 39 fases entregues, com o sistema em
produção e o código na versão `1.44.1`, então ela não é um projeto no papel: é a
comparação entre o que foi construído e o que os requisitos de hoje pedem.

Complementa, sem substituir: [`ARQUITETURA.md`](ARQUITETURA.md) descreve **como está
montado**; este documento diz **por que está assim, o que isso custa e onde vai doer
primeiro**. A dívida priorizada continua em [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md) — os
itens que esta revisão fechou estão marcados na §7.

> **Método.** Leitura estática do repositório na `main`, execução de `lint`/`test`/`build`/
> `contraste`, `npm audit`, `npm outdated`, varredura das 123 migrations e **sondagem dos
> dois bancos vivos** (produção `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh`) por
> MCP, incluindo os advisors de segurança e desempenho do Supabase. Os números de latência
> vêm de [`perf/f33-final-producao.json`](perf/f33-final-producao.json) (11 repetições por
> rota, round-robin, contra a produção na Vercel).

---

## 1. Requisitos

### 1.1 Funcionais (o que o sistema faz)

O sistema substitui três planilhas desconectadas e um relatório semanal por e-mail. O que
ele precisa fazer, em ordem de importância para o negócio:

1. **Registrar a movimentação de um ativo uma única vez** e derivar dela o estado do
   equipamento, o estoque por filial e os relatórios — nunca digitar a mesma informação
   duas vezes.
2. **Saber, a qualquer momento, onde está cada equipamento e com quem** — inclusive
   retroativamente (estado *as-of* de uma data).
3. **Controlar acessórios por quantidade** (periféricos sem patrimônio) com saldo por
   filial e por pessoa.
4. **Emitir o termo de responsabilidade** (`.docx`) no ato da movimentação.
5. **Publicar o relatório** ao vivo por filial e um snapshot semanal congelado, legível
   por gestor **sem conta** (senha de acesso).
6. **Importar o inventário de uma filial** no go-live dela, de forma destrutiva e
   auditada.
7. **Administrar** filiais, motivos, itens, tipos, kits, colaboradores, usuários e senhas.

### 1.2 Não funcionais (as restrições que decidem a arquitetura)

| Dimensão | Requisito real | Medido hoje |
|---|---|---|
| **Escala de dados** | 5 filiais, milhares de ativos | **1.615 ativos**, **3.430 movimentações**, 30 lançamentos de item, 13 snapshots |
| **Escala de uso** | equipe de TI da WAP | **15 perfis**; concorrência de escrita ≈ 1 |
| **Latência** | "não atrapalhar quem está no balcão" | TTFB mediano **370–570 ms** logado; **68–74 ms** no relatório por senha |
| **Disponibilidade** | horário comercial; parada de minutos é tolerável | sem SLA formal; sem página de status |
| **Durabilidade** | **histórico não se perde** — é a razão do sistema existir | acervo imutável por trigger (`guarda_acervo`, `0081`) |
| **Custo** | **R$ 0** de infraestrutura nova | Supabase Free + Vercel (conta Pro já existente) |
| **Equipe** | **uma pessoa**, meio período, com um agente | 39 fases em ~7 semanas |
| **Segurança** | dado de pessoa (nome, patrimônio, termo assinado) | 4 cargos + RLS no Postgres + porta separada por senha |

**A restrição que manda em tudo é a última linha da coluna do meio: uma pessoa.** Não há
plantão, não há revisor humano de plantão, não há quem investigue um dado corrompido seis
meses depois. Isso é o que justifica escolhas que, num time de dez, pareceriam exageradas —
regra de negócio dentro do Postgres, histórico imutável, 2.846 testes, travas TS↔SQL — e
condena outras que pareceriam naturais: fila de mensagens, cache distribuído, microserviço,
worker separado.

---

## 2. Desenho de alto nível

```
   navegador                    Vercel (Next 16, App Router)                Supabase (Postgres 17)
 ┌───────────┐            ┌──────────────────────────────────┐          ┌────────────────────────┐
 │ operador  │──sessão───▶│ proxy.ts ── updateSession ──────┐│          │  auth.users            │
 │ (login)   │            │   getUser() · janela de 24 h    ││──REST───▶│  RLS: papel_atual()    │
 └───────────┘            │                                 ││          │       e_admin()        │
                          │ Server Component ─▶ lib/queries ─┼┼──SELECT─▶│       pode_escrever()  │
 ┌───────────┐            │        │                        ││          │                        │
 │ gestor    │──senha────▶│        └─ form ('use client')   ││          │  TRIGGERS = a regra    │
 │ (sem conta)│           │              │                  ││          │   aplicar_movimentacao │
 └───────────┘            │              ▼                  ││          │   saldo de item        │
                          │   Server Action ─▶ Zod ─────────┼┼──RPC────▶│   guarda_acervo        │
                          │        lib/actions              ││          │                        │
                          │                                 ││          │  Storage: termos,      │
                          │ templates .docx (docxtemplater) ││          │  backups-import        │
                          └──────────────────────────────────┘          └────────────────────────┘
                                        ▲
                                        └── cookie de visualização (HMAC) → só /relatorios/**,
                                            servido pelo client administrativo
```

### 2.1 As três decisões estruturais

**(a) A movimentação é a fonte da verdade; o resto é derivado por trigger.**
Um evento gravado uma vez; `ativos.status`, colaborador, filial, saldo de item e relatório
saem dele. A consequência que orienta tudo: **a UI é a segunda linha de defesa, nunca a
única**. Se a tela tiver bug, o dado não corrompe.

**(b) A regra de negócio mora no Postgres, não no TypeScript.**
Máquina de estados, saldos, permissões por cargo e por filial, imutabilidade do acervo:
tudo em trigger, função e policy. O TypeScript tem *espelhos* (a const `TRANSICOES`, as
guardas `exigirAdmin`) cujo papel é **dar mensagem em português**, não dar segurança.

**(c) Duas portas de acesso, deliberadamente diferentes.**
Login corporativo com quatro cargos (`dev ⊃ admin ⊃ operador ⊃ consulta`) para quem opera;
senha de acesso → cookie HMAC → leitura de `/relatorios/**` para quem só quer ver. A
segunda porta não é um cargo mais fraco: é outro mecanismo, com outra superfície.

### 2.2 Fronteiras de módulo

| Camada | Onde | Regra |
|---|---|---|
| Leitura | `src/lib/queries/**` (35 arquivos) | tipada, chamada por Server Component |
| Escrita | `src/lib/actions/**` (25 arquivos) | **sempre** Server Action + Zod + guarda de cargo |
| Regra pura | `src/lib/**` (domínio, import, termos, itens, relatórios) | sem I/O, testável, **2.846 testes** |
| Regra dura | `supabase/migrations/**` (123 arquivos, 21.950 linhas) | trigger, função, policy |
| Apresentação | `src/components/**` (259 `.tsx`) | Server Component por padrão |

O que essa separação comprou, e dá para medir: **137 arquivos de teste de função pura**
cobrindo import, termos, relatórios, permissões e vocabulários — sem banco, sem navegador,
em ~20 segundos.

---

## 3. Aprofundamento

### 3.1 Modelo de dados

O núcleo é pequeno e certo: `ativos` (estado derivado), `movimentacoes` (o evento),
`itens` + `lancamentos_item` (quantidade), `filiais`/`motivos`/`tipos_item`/`colaboradores`
(vocabulário), `relatorios_gerados` (snapshot imutável), `termos_gerados`, `profiles` +
`operador_filiais` (acesso), `eventos_admin` + `import_logs` (trilha).

Três escolhas que se provaram em produção:

- **Identidade do ativo é o par patrimônio + service tag, por filial** (`0091`). Patrimônio
  repete em casos raros; o par não. Foi essa mudança que permitiu o import de startup de
  uma filial não colidir com o cadastro de outra, transformando a colisão em **pendência de
  conflito** resolvida na mesa de `/pendencias` — um erro virou fila de trabalho.
- **Snapshot semanal em `jsonb` congelado**, não recalculado. "Fim da errata": o número que
  o gestor viu na semana passada continua sendo aquele número, mesmo que uma movimentação
  tenha sido corrigida depois.
- **Histórico não se apaga, estorna-se.** E desde a `0081` isso é trigger, não ausência de
  policy — o que fecha inclusive o `service_role`.

### 3.2 O caminho crítico: registrar uma movimentação em lote

```
formulário ──▶ Server Action ──▶ Zod ──▶ criar_movimentacao_com_itens (RPC, 1 transação)
  (client)      exigirEscritaEm      valida       │
                                                  ├─ N movimentações
                                                  ├─ M lançamentos de item
                                                  └─ trigger aplica estado + saldo
                                                        │
                                                        ▼
                                              termo .docx (docxtemplater) → Storage
```

O ponto forte é a **transação única** (`0117`): o lote inteiro entra ou nada entra. Foi a
F38 que trouxe isso, abatendo boa parte do item U da dívida. O ponto que continua fraco
está em `actions/termos.ts:622-633` e `actions/ativos.ts:289/:375`: um `update` em `ativos`
commita antes de a `anotacoes` ser avaliada. O paliativo é inverter a ordem — anotação órfã
é inócua, ativo sem anotação não —, e ele segue não aplicado porque nunca coube numa fase.

### 3.3 O caminho mais perigoso: o import de startup

É a única operação que **apaga acervo** (`delete from public.ativos` da filial) e a que
concentra as salvaguardas: backup automático, confirmação pelo nome da filial, preview
tudo-ou-nada, recontagem sob advisory lock (TOCTOU), hash imutável do arquivo original.

Duas coisas foram medidas nesta revisão e merecem estar escritas:

1. **O motor é puro e testável** (`src/lib/import/**`, 235 testes) — a decisão certa. O que
   fala com o banco é uma casca fina.
2. **A RPC tem uma cópia integral em 11 migrations** (item X da dívida). Esse é o mecanismo
   pelo qual defeitos conhecidos sobreviveram a cinco revisões: o método de mudança é
   copiar 470 linhas e editar um trecho. **Não é estética — é o vetor de propagação.**

### 3.4 Acesso: onde cada decisão é tomada

```
request ─▶ proxy.ts ─────────▶ há sessão? (getUser, rede)      ── não ──▶ /login
             │                                                             ou /relatorios/acesso
             ▼
        (app)/layout ────────▶ getOperador() → profiles.ativo/excluido_em ── fecha se revogado
             │                  (memoizado por requisição — cache() do React)
             ▼
        page/Server Action ──▶ exigirAdmin / exigirEscritaEm → mensagem em pt-BR
             │
             ▼
        Postgres ────────────▶ papel_atual() · e_admin() · pode_escrever_filial() → **a trava real**
```

Quatro camadas, e só a última é segurança. As três primeiras existem para **explicar** a
recusa a quem está na tela. Essa ordem está certa e é o que faz a superfície de um eventual
bypass de proxy custar uma camada, não a casa.

### 3.5 Contratos e vocabulário compartilhados

O acoplamento TS↔SQL é inerente a este desenho (a regra está no banco, a tela precisa
antecipá-la). A casa resolveu isso com **quatro travas de sincronia** que quebram o CI
quando os lados divergem: `marcadores-sql.test.ts`, `transicoes-sql.test.ts`,
`detentor-sql.test.ts` e `tipos-item-sql.test.ts`. É o padrão certo para o problema, e
esta revisão acrescentou a quinta trava — desta vez para uma correção que mora numa
*configuração* (§5.2).

---

## 4. Escala e confiabilidade

### 4.1 Carga estimada × carga real

| | Projeto original | Hoje (medido) | Folga |
|---|---|---|---|
| Ativos | milhares | 1.615 | ~100× até o Free doer |
| Movimentações/ano | ~4.000 | 3.430 em 14 meses | linear, sem sinal de curva |
| Usuários simultâneos | ≤ 5 | 15 cadastrados | trivial |
| Maior payload | plano do import | ~0,7 MB (limite 8 MB) | 10× |

**Conclusão honesta: o sistema não tem problema de escala e não vai ter tão cedo.** A
tabela maior tem 3.430 linhas. Qualquer discussão de sharding, cache distribuído, réplica
de leitura ou fila seria *engenharia de currículo*. O que existe de gargalo é **latência de
ida e volta**, não volume — e isso muda o alvo de otimização por completo (§4.2).

### 4.2 Onde os milissegundos estão

Medição de 10/08 contra a produção (mediana / p95, ms):

```
/vercel.svg (controle estático)      15,7 /  24,6   ← rede + Vercel, o piso
/login (público)                     38,1 /  52,1
/login com sessão (sonda do proxy)   65,0 /  86,4   ← proxy + getUser() ao Auth
/relatorios/geral (visualizador)     68,9 / 110,3   ← MESMA página, sem sessão de operador
─────────────────────────────────────────────────
/ (dashboard, operador)             378,0 / 493,8
/ativos                             369,7 / 1037,8
/itens                              372,3 / 1090,2
/relatorios/geral (operador)        567,2 / 849,7
```

A leitura que importa: **a mesma página custa 69 ms para o visualizador e 567 ms para o
operador.** A diferença não é a consulta — é a sessão. Um piso de ~370 ms aparece em toda
rota logada e ele é composto de (i) a ida ao Auth do `getUser()` no proxy, (ii) a repetição
disso na página, já mitigada pelo `cache()` por requisição, e (iii) as consultas com RLS,
que chamam `papel_atual()`/`e_admin()`.

Daí a recomendação **R1** da §6, que é a única otimização de desempenho com ganho
mensurável de dois dígitos percentuais neste sistema — e a única que tem custo de segurança
a pesar.

### 4.3 Confiabilidade: o que existe

- **Imutabilidade do acervo por trigger** (`guarda_acervo`, `0081`), que segura até o
  `service_role`. Escrita destrutiva só dentro de uma janela (`estoque.dev_destrutivo`)
  aberta pelas RPCs oficiais.
- **Backup obrigatório antes de toda operação destrutiva**, conferido pela própria RPC,
  com trilha gravada na mesma transação — se a trilha falha, nada é apagado.
- **CI com Postgres real**: aplica as 123 migrations em ordem num banco novo e roda 23
  roteiros SQL auto-verificáveis. É o que pega o que os bancos vivos não pegam.
- **Trava de versionamento**: `registry.test.ts` + `cobertura-changelog.test.ts` derrubam
  o `test` se uma entrada de CHANGELOG ficar sem versão.

### 4.4 Confiabilidade: os buracos, em ordem de gravidade

1. **Não há observabilidade de produção.** Nenhum alerta, nenhuma métrica, nenhum
   agregador de erro. O `console.error` de uma Server Action vai para os logs da Vercel, que
   ninguém lê por hábito. Um defeito que não derrube a tela pode viver semanas. É o buraco
   nº 1 e o mais barato de tapar parcialmente (§6, **R2**).
2. **O ledger de migrations do banco é incompatível com o repositório por construção**
   (item A da dívida): as versões gravadas são timestamps do momento do apply; os arquivos
   usam prefixo sequencial. `supabase db push` deste repo contra produção é inseguro. O
   controle que funciona é a sonda por `pg_get_functiondef` + o job `banco` do CI.
3. **Zero teste de componente em 259 `.tsx`.** A política ("Vitest só para função pura")
   rendeu e não deve ser revertida, mas a classe de bug que escapa é conhecida e recorrente
   — há commits cujo assunto é literalmente "dois defeitos que só o navegador pegou".
4. **Restauração nunca foi ensaiada.** Existe backup (o do Supabase e os `.json` das
   operações destrutivas). Não existe registro de alguém ter restaurado e conferido.

---

## 5. O que esta revisão mudou (aplicado em 30/08/2026)

### 5.1 Dependências: 13 vulnerabilidades → 2

`next` estava em `16.2.10`, **uma versão-patch abaixo** da correção de oito advisories cuja
faixa afetada é `>=16.0.0 <16.2.11` — entre eles um **bypass de proxy** em App Router com
Turbopack, e `src/proxy.ts` *é* a porta de autenticação deste app. Subiu para **16.2.12**
(patch, não `16.3.x`: minor é decisão de fase, não de manutenção), junto de
`eslint-config-next` e de `react`/`react-dom` (19.2.4 → **19.2.8**), com os pins exatos que
o repositório usa preservados.

`npm update` + `npm audit fix` no drift patch/minor levaram o total de **13 vulnerabilidades
(9 HIGH) para 2 (moderate)** — as duas restantes são o `uuid` que o `exceljs` arrasta, sem
versão corrigida publicada, **aceitas e registradas** (lib aprovada, usada só server-side na
leitura do `.xlsx`).

### 5.2 O fuso do negócio: fechando a classe, não as ocorrências

O item W da dívida ("`current_date` em RPC, com o banco em UTC") dizia que, entre 21h e
23h59 BRT, toda RPC que carimba data grava **o dia seguinte** — e o lançamento some do
relatório do próprio dia em que foi feito, porque `rel_estoque_asof` só considera existente
o ativo com `m.data <= p_data`. Em 12/08 o defeito estava em 6 lugares; hoje, **27
migrations** contêm `current_date`, e as F34–F38 o replicaram em código novo.

A correção planejada era criar uma função `hoje()` e trocar `current_date` por ela em cada
RPC — o que significaria **recriar inteiras sete funções de 200 a 470 linhas**, exatamente
o item X, o mecanismo que espalhou o defeito. Corrigir um item multiplicando o outro é troca
ruim.

**A correção adotada é de configuração** (migration `0124`):

```sql
alter database <atual> set timezone = 'America/Sao_Paulo';
```

Um comando, nenhuma RPC recriada, e vale para as funções de hoje, as de ontem e as que ainda
não foram escritas. O que tornou isso seguro aqui, medido antes de aplicar:

- **Zero colunas `timestamp without time zone`** no schema `public` — tudo é `timestamptz`,
  que guarda um instante: o valor gravado não muda com o fuso, só a representação.
- O que muda na API é o offset do texto (`…+00` → `…-03`); o app faz `new Date(...)` e
  formata com `Intl` em `America/Sao_Paulo`, e as duas conversões `toISOString().slice(0,10)`
  do código operam sobre um `Date` do JS, alheio ao fuso do banco.
- **Nenhum dado corrompido a corrigir**: `movimentacoes` e `lancamentos_item` com data no
  futuro = **0**; data posterior ao próprio `created_at` = **0**. O defeito era real e nunca
  se materializou porque ninguém operou naquela faixa de horário.

Aplicada **primeiro no ensaio**, conferida (relatórios respondendo, `current_date` =
`hoje_brt()`), depois em produção. Junto vieram duas camadas de defesa:

- `public.hoje_brt()` — a intenção escrita, independente da configuração, para quem escrever
  RPC nova ter o que chamar;
- `supabase/tests/fuso_do_negocio.sql` — cinco asserções no CI, uma delas independente do
  relógio (que instante o Postgres entende por "hoje às 00:00"), porque as outras passariam
  por acaso entre 00h e 21h mesmo com o banco em UTC.

### 5.3 O truncamento silencioso do `.xlsx` (item T)

`src/lib/import/xlsx.ts` cortava a planilha em 20.000 linhas e 40 colunas com `Math.min` —
**sem erro, sem aviso, sem marca no resultado**. A operação seguinte apaga o acervo da filial
e o recria a partir do plano: uma linha cortada aqui é um ativo que deixa de existir sem
ninguém saber.

Agora o leitor **recusa** o arquivo com uma mensagem escrita para o operador (o número e o
limite), a mensagem atravessa o `catch` da Server Action em vez de virar o genérico "não foi
possível ler o arquivo", e quatro testes provam os dois tetos e os dois limites exatos (a
planilha *no* teto passa; a de um a mais é recusada).

### 5.4 Índices e enum-fantasma

Quatro índices para as chaves estrangeiras que uma tela **realmente percorre**
(`eventos_admin.autor`, `movimentacoes.colaborador_id`, `colaboradores.filial_id`,
`itens.tipo_id`). As outras onze FKs que o linter aponta são colunas de autoria que ninguém
consulta por si só, e cujo pai (`profiles`) nunca é apagado, e sim arquivado — índice que
ninguém usa é custo de escrita e ruído, e o mesmo linter já lista seis desses.

E o item I: `'outro'` saiu do `CategoriaAtivo` do **motor de import**, que nunca o produz.
Como valor inalcançável, ele só cobrava pedágio — três `Exclude<CategoriaAtivo, 'outro'>` e
um guard de runtime que existia "só para satisfazer o tipo". Tirar o valor apagou os quatro.

### 5.5 Item B, fechado por sondagem

A auditoria de 12/08 deixou em aberto se as migrations `0058`/`0059` tinham sido aplicadas.
**Foram**: `_f18_backup_pendencia`, `_f8_backup_matriz_compras` e `_f7k_backup_modelo` não
existem mais, e a única policy com `auth.uid()` está com o wrap `(select auth.uid())` da
`0059`.

Sobre a tabela de backup que restou, `_bkp_relatorios_gerados_f6a`: ela é **redundante hoje**
— 2 linhas, ambas presentes em `relatorios_gerados` com o `jsonb` idêntico byte a byte. Mesmo
assim **não foi apagada**, e de propósito: a `0058` registra que ela está atrelada a uma
decisão em aberto do Johnny sobre os 2 snapshots de go-live. Se essa decisão for apagar os
snapshots, esta tabela é justamente a rede. Apagá-la agora seria remover a rede antes do
salto.

---

## 6. Recomendações — decisões que não são minhas para tomar

### R1 — `getUser()` → `getClaims()` no proxy: ~65 ms por requisição, ao custo de uma janela

**O que é.** O proxy chama `supabase.auth.getUser()` a cada requisição, o que é uma ida de
rede ao servidor de Auth. A documentação oficial atual do Supabase recomenda `getClaims()`
no proxy, que **verifica o JWT localmente** (WebCrypto + JWKS em cache) quando o projeto usa
chaves assimétricas.

**Pré-condição confirmada:** a produção já publica JWKS com chave **ES256** — a verificação
local funcionaria hoje, sem migração de chave.

**O ganho.** A sonda `/login com sessão` mede 65 ms de mediana, e ela é essencialmente
proxy + `getUser()`. Sobre um piso de ~370 ms nas rotas logadas, é uma redução da ordem de
**15–18%** em toda navegação de operador.

**O custo, e é ele que trava a decisão.** `getUser()` pergunta ao Auth e por isso enxerga
revogação **imediatamente**. `getClaims()` confia na assinatura até o token expirar —
`jwt_exp` do projeto é **3600 s**. Perfil desativado ou arquivado continua fechando na hora
(o `getOperador()` lê `profiles` a cada requisição e as policies do Postgres barram), mas
**"encerrar sessões"**, a ferramenta do cargo dev, deixaria de ter efeito imediato: o
access token válido continuaria valendo por até uma hora.

**Como eu decidiria.** Aplicar `getClaims()` **e** reduzir `jwt_exp` para 900 s, o que corta
a janela para 15 minutos e mantém quase todo o ganho. Não apliquei porque enfraquecer um
controle de segurança existente — mesmo em troca de desempenho medido — é escolha do dono do
sistema, não efeito colateral de uma revisão de arquitetura.

### R2 — Observabilidade mínima (o buraco nº 1)

Hoje um erro que não derrube a tela é invisível. O mínimo que cabe no orçamento de R$ 0:

1. um `error.tsx` por grupo de rota que **registre** antes de mostrar (já há `console.error`
   espalhado; falta o funil);
2. uma rota `/api/saude` que responda o essencial (banco alcançável, última migration
   aplicada, versão no ar) — o bloco Diagnóstico da `/dev` já calcula quase tudo isso;
3. um teste agendado que bata nessa rota e avise. O repositório já tem `scripts/smoke/`
   reexecutável contra produção: falta só alguém (ou algo) rodando de tempos em tempos.

### R3 — ADR sobre o método de migration (item A)

Seguir com apply por MCP + sonda de efeito, ou renomear as 123 migrations para o padrão
timestamp e adotar a CLI de verdade? Enquanto não se decide, `db push` continua sendo uma
armadilha carregada no repositório. É decisão de método, com trade-off real dos dois lados,
e merece um ADR em vez de continuar sendo folclore oral.

### R4 — Quebrar `importar_ativos_substituir` (item X)

Não pela estética das 470 linhas: porque **o único jeito de mudá-la é reescrevê-la**, e é
isso que recopia defeito conhecido. Decompor em auxiliares estáveis (validação de linha,
resolução de patrimônio, escrita do lote) faz a próxima mudança recriar uma função pequena.

### R5 — Três testes de render, antes de tocar nos componentes gigantes

`nova-compra-form` (32 `useState`), `nova-movimentacao-form` (20) e `importar-wizard` (13)
são os três lugares onde refatorar hoje é trocar dívida conhecida por risco de regressão.
Um teste de render em cada remove esse argumento — e custa uma dependência nova
(`@testing-library/react`), que a regra da stack fechada manda aprovar antes.

---

## 7. Situação da dívida técnica depois desta revisão

| # | Item | Antes | Agora |
|---|---|---|---|
| **V** | `next` com 8 advisories | 🔴 aberto | ✅ **fechado** — `16.2.12` |
| **Z** | Drift de dependências | 🟡 aberto | ✅ **fechado** — patch/minor em dia |
| **T** | `.xlsx` truncado em silêncio | 🔴 aberto | ✅ **fechado** — recusa nomeada + 4 testes |
| **W** | Fuso `current_date` | 🔴 aberto, se espalhando | ✅ **fechado por classe** — `0124` + trava no CI |
| **B** | Backups órfãos | 🟡 dúvida | ✅ **verificado** — `0058`/`0059` aplicadas |
| **I** | Enum-fantasma `'outro'` | 🟡 aberto | ✅ **fechado** |
| **N** | `p_contagens` opcional (TOCTOU) | 🟡 aberto, 5 cópias | 🟡 aberto — cai junto com **R4** |
| **A** | Ledger × repositório | 🟠 aberto | 🟠 aberto — **R3** |
| **X** | RPC do import recriada 11× | 🟠 aberto | 🟠 aberto — **R4** |
| **G** | `as unknown as` na fronteira | 🟡 55× | 🟡 **60×** — cresceu; helper tipado continua sendo o caminho |
| **E/K/L** | Componentes e forms gigantes | 🟡 aberto | 🟡 aberto — depende de **R5** |
| **Y** | Zero teste de componente | 🟡 aberto | 🟡 aberto — **R5** |
| **U** | Escrita em duas etapas | 🟡 parcial (F38) | 🟡 parcial — resta inverter a ordem em `termos.ts`/`ativos.ts` |

---

## 8. O que eu revisitaria, e em que gatilho

Arquitetura boa não é a que prevê o futuro — é a que diz **quando** parar e olhar de novo.
Os gatilhos deste sistema, com os números de hoje ao lado:

| Gatilho | Hoje | O que revisitar |
|---|---|---|
| **> 50.000 movimentações** | 3.430 | Particionar por ano ou materializar o *as-of*; hoje ele é reconstruído a cada leitura |
| **> 10 operadores simultâneos** | ~1 | Cache de leitura por rota e revisão do custo de `papel_atual()` por consulta |
| **Segunda empresa / multi-tenant** | 1 | O escopo de escrita é por filial, não por tenant — seria remodelagem, não parâmetro |
| **Relatório > 3 s** | 567 ms | Materializar as agregações do relatório ao vivo (hoje é tudo derivado por request) |
| **Alguém além do Johnny operar o banco** | 1 pessoa | **R3** deixa de ser opcional: o ledger vira armadilha real |
| **Supabase Free apertar** (500 MB / pausa por inatividade) | folgado | Nada muda de projeto; muda o plano |
| **Terceira reincidência da mesma classe de bug** | fuso foi a 2ª | Escrever a trava ANTES da correção — o padrão que a `0124` seguiu |

---

## 9. Veredito

O sistema está **bem construído para o que ele é**: um app interno de escala pequena,
mantido por uma pessoa, cuja exigência real não é desempenho nem volume, mas **não perder
histórico e não deixar ninguém escrever o que não deve**. As três decisões estruturais da
§2.1 estão certas e se pagaram: a regra no Postgres, o evento como fonte da verdade e as
duas portas separadas.

Os riscos que restam **não são de arquitetura, são de operação**: ninguém observa a produção
(R2), o método de migration é folclore em vez de contrato (R3), e a maior função do sistema
só pode ser mudada por reescrita (R4). Nenhum dos três aparece numa tela quebrada — todos
aparecem no dia em que alguém precisar entender o que aconteceu ontem à noite.

E o padrão que esta revisão reforça, porque é o que este repositório faz de melhor: **quando
a correção mora numa configuração ou numa convenção, escreva a trava antes de corrigir.** A
`0124` conserta o fuso; `fuso_do_negocio.sql` é o que impede que ele volte.

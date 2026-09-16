# Projeto de sistema — Acervo (produto multiempresa), 31/08/2026

> **Status (16/09/2026 · F59) — catálogo de requisitos, não plano de execução.** A decisão de 09/2026
> (`PLANO-MULTIEMPRESA.md` §1, decisão 1) é evoluir **este** repositório por migração in-place e aditiva; o
> repositório irmão ("Acervo") foi aposentado e a ordem `prompt-produto-f0-fundacao.md` não se executa. As
> seções de schema e de desenho valem como **catálogo de requisitos**; a execução é a do
> `PLANO-MULTIEMPRESA.md`. A doutrina vigente do predicado de RLS é a **emenda F59 da `MATRIZ-REGRAS.md`**
> (R-ACC-63 em diante) — que confirma a recomendação do §3.2 abaixo e fixa o tipo de retorno (`setof`).

Revisão arquitetural do **produto multiempresa** planejado em
[`PLANO-PRODUTO-MULTIEMPRESA.md`](PLANO-PRODUTO-MULTIEMPRESA.md) (v0.1, 14/08/2026), pelo
método da skill `system-design`: requisitos → desenho de alto nível → aprofundamento →
escala e confiabilidade → trade-offs → o que revisitar. A ordem
[`prompt-produto-f0-fundacao.md`](prompt-produto-f0-fundacao.md) já está escrita e pronta
para rodar; este documento é o crivo **antes** de a primeira linha existir — que é onde uma
revisão de arquitetura ainda é barata.

**Por que este documento e não outro.** O sistema da WAP foi revisado ontem em
[`SYSTEM-DESIGN-2026-08-30.md`](SYSTEM-DESIGN-2026-08-30.md) (v1.44.1). Aquela revisão
fecha com uma tabela de gatilhos, e uma das linhas é literalmente **"Segunda empresa /
multi-tenant → o escopo de escrita é por filial, não por tenant; seria remodelagem, não
parâmetro"**. É exatamente esse gatilho que o plano do Acervo puxa. Reaplicar o método ao
sistema da WAP produziria o mesmo documento duas vezes; aplicá-lo ao produto ataca o único
desenho que ainda está aberto.

> **Método.** Leitura estática da `main` na v1.45.0 (pós-F40), execução da suíte
> (`142 arquivos, 3.224 testes — verdes`), varredura das 123 migrations e dos 24 roteiros
> SQL, sondagem **só-leitura** da produção (`pbtjcalbmepmrqzprusb`) por MCP para os números
> de volume, e conferência da documentação oficial atual do Supabase sobre desempenho de RLS
> (regra 6 do `CLAUDE.md` — nada de API de memória). Nenhum dado real da WAP aparece aqui:
> só agregados e tamanhos.

---

## 1. Requisitos

### 1.1 Funcionais — o que muda de fato

O produto faz o que a WAP faz. O que é **novo** cabe em cinco linhas, e é só isso que esta
revisão precisa avaliar:

1. **Servir N empresas no mesmo sistema**, cada uma cega para as outras.
2. **Onboarding self-service assistido**: uma empresa entra a partir da planilha dela
   (o import de startup vira a porta de entrada, não uma ferramenta de go-live).
3. **Vocabulário e identidade por empresa** (unidades, motivos, categorias, máscara de
   patrimônio, logo, cor) sem tocar na máquina de estados.
4. **Dois planos de identidade**: papéis dentro da empresa × papel de plataforma (você),
   que atravessa empresas.
5. **Relatório público por senha, por empresa** — a única superfície sem login.

### 1.2 Não funcionais — e a inversão que ninguém pode perder de vista

| Dimensão | WAP (interno) | Acervo (produto) |
|---|---|---|
| Usuários | ~15 perfis, ~1 simultâneo | N empresas × operadores |
| Volume | 1.615 ativos · 3.430 mov. | soma de todos os clientes |
| Pior falha possível | perder histórico | **um cliente ver o dado de outro** |
| Quem opera o banco | 1 pessoa (o dono) | 1 pessoa, agora com terceiros dentro |
| Custo | R$ 0, sem prazo | R$ 0 **até haver receita** |

A linha que importa é a terceira. Na WAP, o pior defeito plausível é um relatório errado ou
um histórico perdido — ruim, recuperável, e o próprio sistema foi construído contra isso
(imutabilidade por trigger, estorno em vez de edição). No produto, existe uma falha de outra
categoria: **vazamento entre empresas**. Ela não é recuperável, não é corrigível por estorno,
e é a única capaz de encerrar o produto. Todo o resto deste documento é subordinado a ela.

### 1.3 Restrições herdadas

Stack fechada idêntica à da WAP · custo R$ 0 até receita · uma pessoa mantendo · modo
autônomo com ordens de serviço · regra do CHANGELOG/versão desde a F0 · nunca dado real de
cliente em dev/seed/teste.

---

## 2. Desenho de alto nível

### 2.1 O que o plano propõe (D1–D5), em uma figura

```
        ┌──────────────────────── Vercel (Next.js 16) ────────────────────────┐
        │                                                                     │
  login │  proxy: sessão + CONTEXTO DE EMPRESA (cookie)                       │
  ──────┼──►  (app)/…    Server Components (leitura)  ─┐                       │
        │              Server Actions + Zod (escrita) ─┤                       │
        │                                              │                       │
  senha │  /r/<empresa>/…   ← PORTA PÚBLICA, sem login │                       │
  ──────┼──►  cookie assinado {senha_id, exp}          │                       │
        └──────────────────────────────────────────────┼───────────────────────┘
                                                       │
                          ┌────────────────────────────▼───────────────────────┐
                          │  Supabase Postgres (projeto ÚNICO — modelo pool)   │
                          │                                                    │
                          │  toda tabela: empresa_id NOT NULL                  │
                          │  RLS: recorte de tenant em TODA policy             │
                          │  FK composta (empresa_id, id) — o banco recusa     │
                          │    pendurar filho de A em pai de B                 │
                          │  máquina de estados + saldos + imutabilidade       │
                          │    por TRIGGER (inalterado da WAP)                 │
                          └────────────────────────────────────────────────────┘
```

### 2.2 Veredito sobre as cinco decisões estruturais

| | Decisão do plano | Veredito |
|---|---|---|
| **D1** | Banco único, RLS por empresa (pool) | ✅ **Certa** — mas a *implementação* proposta tem dois furos (§3.1 e §3.2) |
| **D2** | Conta global, papéis por empresa (`membros`) | ✅ **Certa**, sem ressalva |
| **D3** | Domínio único agora, subdomínio depois | ✅ **Certa** — e o cookie de contexto ainda melhora o desempenho da RLS (§3.1) |
| **D4** | A regra continua no Postgres | ✅ **Certa** — é o maior ativo transplantado |
| **D5** | Configuração em colunas/tabelas, não `jsonb` genérico | ✅ **Certa**, sem ressalva |

**Nenhuma das cinco decisões precisa ser revertida.** Três delas (D2, D4, D5) estão prontas
para virar código como estão. As correções deste documento são todas *dentro* de D1 — a
decisão está certa, e é a execução dela que decide se o produto é seguro e se ele é rápido.

---

## 3. Aprofundamento — os quatro achados

### 3.1 A porta pública é o furo do isolamento — e nenhuma defesa do plano a alcança

**O achado.** O plano lista quatro defesas contra vazamento entre empresas: RLS por
membership, FK composta, roteiro de isolamento no CI, e guarda de tenant nas RPCs. Existe um
caminho no sistema onde **as quatro são irrelevantes**: a porta do visualizador por senha.

Não é suposição — é decisão consciente, documentada no próprio repositório. Em
[`acesso.ts`](../src/lib/auth/acesso.ts), `resolverAcessoRelatorio()` devolve ao visualizador
um **client administrativo** (`service_role`), porque quem entra por senha não tem identidade
no banco. O teste-tripwire
[`fronteira-viewer.test.ts`](../src/lib/queries/relatorios/fronteira-viewer.test.ts) diz o
que isso significa, com todas as letras:

> *"para o viewer, o RLS NÃO é a segunda linha; o único muro é o próprio CÓDIGO das queries
> de relatório"*

Na WAP, essa é uma decisão defensável e bem gerida: há uma empresa só, o pior caso é um
visualizador ver dado da própria empresa, e existe um teste que falha se alguém ampliar a
superfície alcançada. **No produto, a mesma decisão muda de categoria**: `service_role`
ignora RLS, ignora FK composta na prática (ela protege contra escrita cruzada, não contra
leitura ampla), e o roteiro de isolamento do CI — que prova que membro de A não lê nada de B
— não testa este caminho, porque aqui não há membro nenhum. A porta pública, sem login, seria
o único lugar do produto onde o isolamento entre clientes depende exclusivamente de um
programador não esquecer um `.eq('empresa_id', …)`.

**O agravante concreto.** A rota planejada é `/r/<empresa>/…` (D3). Existem duas fontes
possíveis para o tenant nessa requisição: o **slug da URL** e o **`senha_id` do cookie
assinado**. Se qualquer query derivar a empresa do slug, um visualizador legítimo da empresa
A troca o slug na barra de endereços e lê o relatório de B — com `service_role`, sem nada no
caminho para recusar. É o defeito mais fácil de introduzir e o mais caro de descobrir.

**Recomendação — em dois níveis.**

*Mínimo inegociável (F5):* o tenant do visualizador **deriva sempre do `senha_id` do cookie**,
nunca do slug; o slug serve só para exibição e é *conferido contra* a empresa derivada
(divergiu → 404, não redirect). O tripwire existente é ampliado para exigir, em toda query da
superfície de relatório, o filtro explícito de `empresa_id`.

*Alvo (o que eu construiria):* tirar o `service_role` da porta pública. O visualizador passa a
alcançar **apenas RPCs `security definer`** que recebem o `senha_id` já verificado pelo
servidor e derivam a empresa por dentro — o mesmo padrão que o projeto já aplica 116 vezes.
O isolamento volta a ser garantido pelo banco, e o roteiro de isolamento passa a poder
provar a porta pública, coisa que hoje ele não consegue. O custo é uma fase de trabalho na
F5; o benefício é remover a única superfície onde o pior defeito possível do produto não tem
segunda linha de defesa.

### 3.2 O predicado de tenant proposto é o antipadrão de desempenho medido

**O achado.** O plano especifica o recorte de tenant como `e_membro(empresa_id)` — uma função
que **recebe a linha como argumento**. Esse é o padrão mais lento documentado para RLS, e a
razão é estrutural: uma função que depende da linha **não pode** ser içada para `InitPlan`,
então o Postgres a executa **uma vez por linha avaliada**.

Isto não é teoria, e o projeto já sabe disso. A migration
[`0107`](../supabase/migrations/0107_pendencias_item_admin_reabre_initplan.sql) documenta a
regra em detalhe — *"função SEM argumento, que não depende da LINHA, entra em `(select …)`
para virar InitPlan avaliado 1× por statement; `pode_escrever_filial(filial_id)` DEPENDE da
linha e fica de propósito fora do wrap"* — e mediu o ganho de içar a que dava: custo estimado
de 164,50 → 89,76.

A documentação oficial atual do Supabase põe números de tempo na mesma classe de problema:

| Padrão | Antes | Depois |
|---|---|---|
| `has_role() = role` → `(select has_role()) = role` | 178.000 ms | 12 ms |
| `team_id = any(user_teams())` → `team_id = any(array(select user_teams()))` | 173.000 ms | 16 ms |
| 1M linhas, `= ANY(user_teams())`, **mesmo com índice** | *timeout > 2 min* | — |
| 1M linhas, `= ANY(ARRAY(select user_teams()))` **+ índice** | — | **2–3 ms** |

Na WAP isso é inofensivo: `pode_escrever_filial(filial_id)` roda sobre 3.430 movimentações
com ~1 usuário simultâneo. **No modelo pool, cada tabela passa a conter a soma de todos os
clientes**, e o predicado de tenant entra em *toda leitura de toda tabela* — é o predicado
mais quente do sistema inteiro. Nascer com o padrão lento significa descobrir o problema
quando houver clientes dentro, que é o pior momento para reescrever 70+ policies.

**Recomendação (F1, antes de existir a primeira policy).** O recorte de tenant é
**set-based, içável e indexável**:

```sql
-- ✗ como o plano especifica — avaliada POR LINHA, não içável
using ( e_membro(empresa_id) )

-- ✓ InitPlan (1× por statement) + índice utilizável
using ( empresa_id = any (array(select public.empresas_do_membro())) )
```

Com `empresas_do_membro()` `security definer stable` devolvendo as empresas do membro ativo
(bypassando a RLS da tabela de membros, como a doc recomenda), **todo índice começando por
`empresa_id`**, e `to authenticated` em **todas** as policies — a própria doc mostra que o
`TO` sozinho elimina o custo para `anon`. O escopo de escrita por unidade segue a mesma
forma (`unidade_id = any(array(select unidades_de_escrita()))`), o que deixa o produto
**melhor que a WAP nesse ponto**, não igual: hoje só 5 das 71 policies do sistema atual usam
o padrão içado.

> **Nota F59 (16/09/2026) — a fotografia não se apaga, mas envelheceu.** Medido hoje: **61 policies vivas**
> (53 em `public` + 8 em `storage.objects`), e **todas as 62 chamadas de função sem argumento** estão dentro de
> `(select …)`. O que não é içável são **18 ocorrências** de função que recebe dado da linha — 11 permanentes
> por decidirem sobre o próprio objeto, 6 de `pode_escrever_filial` com destino na F66 e 1 falso içamento de
> Storage com destino na F67 (lista em `supabase/tests/catalogo_policies.sql`, `k_excecoes_predicado`). ⚠ O
> escopo de escrita por unidade **não** cabe em `unidade_id = any(array(select unidades_de_escrita()))`:
> a função devolve PARES; a forma é `(empresa_id, filial_id) in (select u.empresa_id, u.filial_id from
> public.unidades_de_escrita() u)` — R-ACC-68.

### 3.3 O transplante está subdimensionado — os números

O plano trata a F3 como "o maior transplante" e lista, como risco, "o transplante virar
reescrita". Os números dizem que esse risco já se realizou no papel:

| O que | Medida |
|---|---|
| Arquivos `.ts/.tsx` em `src` | **628** (115.039 linhas) |
| …que citam `filial` | **292 — 46,5%** |
| Ocorrências de "filial" no código | **4.092** (`filial_id`: 378) |
| Migrations | 123 arquivos, **21.950 linhas** |
| `create policy` | **71** (mais 15 `drop policy` — retrabalho já pago) |
| Funções | 124, das quais **116 `security definer`** |
| Roteiros SQL de teste | 24 arquivos, **9.625 linhas** |

"Transplantar o núcleo" significa: **reautorar o banco inteiro** (nenhuma das 71 policies
sobrevive sem recorte de tenant; nenhuma das 116 funções sobrevive sem guarda de tenant) e
**passar por quase metade do front-end**, onde `filial` é ora escopo de escrita, ora atributo
de exibição, ora chave de identidade do ativo (F24) — três significados que precisam ser
separados um a um, à mão, porque nenhum `sed` distingue os três.

Isso **não** invalida o plano: refundar o schema com o desenho final aprendido (F1) é
exatamente a decisão certa, e evita repetir a evolução `0001`→`0124`. O que muda é a
expectativa: **F1 + F3 não são um transplante, são a construção de um sistema novo que
reusa um desenho provado** — o que é muito valioso, e é uma promessa diferente de "o núcleo
vem pronto". O ativo real que atravessa é o **conhecimento** (a máquina de estados, os
triggers, os roteiros de teste, o vocabulário De→Para), não o código.

### 3.4 116 funções `security definer` são 116 pontos onde o isolamento pode vazar

Toda função `security definer` roda com os poderes de quem a criou — ou seja, **atravessa
RLS por construção**. O plano cobre isso em uma linha ("RPCs `security definer` com guarda de
tenant interna"), sem dimensionar: são **116** na WAP hoje, e o produto herda essa ordem de
grandeza. Cada uma que esquecer a guarda é um vazamento potencial, e nenhuma delas é pega
pela RLS, pelas FKs compostas ou pelo roteiro de isolamento comum.

**Recomendação.** A guarda de tenant é a **primeira linha executável** de toda função — e a
conformidade vira **teste automático**, não disciplina. O projeto já domina exatamente esse
padrão: [`tipos-item-sql.test.ts`](../src/lib/validators/tipos-item-sql.test.ts) e
[`chave-sql.test.ts`](../src/lib/colaboradores/chave-sql.test.ts) são guardas TS↔SQL que
falham o `npm run test` quando os dois lados divergem. A versão para o produto: um teste que
enumere as funções `prosecdef` do schema e **falhe** se alguma não contiver a chamada de
guarda. Escrever a trava **antes** da primeira função é o padrão que a `0124` já provou —
e que o documento de ontem recomenda como resposta à reincidência.

---

## 4. Escala e confiabilidade

### 4.1 Quanto ocupa um cliente — medido, não estimado

Sondagem da produção da WAP (1.615 ativos, 3.430 movimentações, 6 filiais, 13 meses de
operação real) — o perfil exato do cliente-alvo descrito no plano:

| Onde | Tamanho |
|---|---|
| Dados de negócio (`public`) | **6,7 MB** |
| `auth` + `storage` (metadados) | 1,8 MB |
| Banco total (com catálogo e extensões) | 20 MB |
| Arquivos — bucket `termos` (67 arquivos) | 5,2 MB (média 80 kB) |
| Arquivos — bucket `backups-import` (22 arquivos) | **22 MB** (média ~1 MB) |

**Uma empresa do porte da WAP custa ~7 MB de banco e ~27 MB de arquivos por ano de operação.**
Contra o Free (500 MB de banco, 1 GB de Storage), a capacidade teórica é da ordem de
**algumas dezenas de empresas** — folgado para todo o horizonte do plano (piloto + primeiros
clientes).

Detalhe que salta aos olhos: **o backup de import domina o Storage** (22 MB dos 27 MB). No
produto, o import deixa de ser ferramenta de go-live e vira **a porta de entrada de todo
cliente** (F4), com re-imports durante o onboarding. É o item que cresce mais rápido, e o
que merece política de retenção desde a F4 — não depois.

### 4.2 O gatilho de custo do plano está calibrado no limite errado

O plano §8 define o gatilho de upgrade como *"1º cliente pagante OU banco passando de ~60%
do limite"*. Pelos números acima, **os 500 MB não vão morder** — nem perto. O que morde
primeiro é outra coisa:

| Limite do Free | Quando morde | Gravidade |
|---|---|---|
| **SMTP de auth embutido** (poucos e-mails/hora, e o próprio Supabase desaconselha em produção) | **na primeira empresa real**, no convite dos operadores dela | 🔴 bloqueia o onboarding |
| 2 projetos por organização | já: produção + ensaio ocupam exatamente os 2, sem folga | 🟠 sem espaço para um terceiro ambiente |
| 500 MB de banco | ~dezenas de empresas | 🟢 distante |
| Pausa por inatividade | não se aplica com clientes ativos usando diariamente | 🟢 não é risco |

**Recomendação.** Trocar o gatilho por: **SMTP próprio antes da F9 (piloto)** — é dependência
nova, então entra em DECISOES com aprovação, como manda a regra da stack — e manter o
gatilho de banco só como monitoramento de fundo. Onboarding que falha no convite é a pior
primeira impressão possível para um cliente pagante, e é o cenário mais provável hoje.

### 4.3 Confiabilidade: o buraco herdado, agora com terceiros dentro

O documento de ontem já aponta que o buraco nº 1 da WAP é **observabilidade**: um erro que
não derrube a tela é invisível. Na WAP, quem descobre é o Johnny operando. No produto, quem
descobre é **o cliente**, e ele descobre ligando. A recomendação R2 de ontem (funil de erro,
rota `/api/saude`, smoke agendado) deixa de ser melhoria e vira **pré-requisito da F9** — não
dá para colocar um cliente pagante num sistema onde ninguém observa a produção.

---

## 5. Trade-offs explícitos

| Decisão | O que se ganha | O que se paga | Vale? |
|---|---|---|---|
| **Pool (banco único)** em vez de projeto por cliente | um deploy, uma fila de migrations, R$ 0 no início | o isolamento vira responsabilidade do software; um bug de policy é multi-cliente | ✅ Sim, nesta escala — com as travas de §3.1/§3.2/§3.4 |
| **RLS por membership** em vez de claim no JWT | revogação vale no request seguinte | uma consulta a mais por statement (mitigada pelo InitPlan de §3.2) | ✅ Sim — é a lição já paga da WAP |
| **FK composta** `(empresa_id, id)` | o banco recusa referência cruzada; defeito de aplicação não vaza | índice único extra por tabela-pai; DDL mais verboso | ✅ Sim, barato para o que evita |
| **Máquina de estados fixa de fábrica** | relatórios e as-of sempre batem; um roteiro cobre todos os clientes | perde-se o cliente que exige fluxo próprio | ✅ Sim — é o produto ser opinião, não configuração |
| **Refundar o schema** (não migrar `0001`→`0124`) | desenho final desde a primeira migration | joga fora 21.950 linhas de migration testadas em produção | ✅ Sim — mas assumindo §3.3: é sistema novo, não transplante |
| **`service_role` na porta pública** (herdado) | simplicidade: sem identidade no banco para o viewer | **o pior defeito possível do produto fica sem segunda linha** | ❌ **Não** no produto — §3.1 |

---

## 6. O que fazer com isto — em ordem

1. **A F0 pode rodar como está.** Ela funda repositório, CI, auth e layout; nenhum dos quatro
   achados a alcança. Nada aqui justifica segurar a fundação.
2. **A F1 muda antes de começar** — é onde os quatro achados moram:
   - predicado de tenant set-based e içável, com índices começando por `empresa_id` (§3.2);
   - `to authenticated` em toda policy (§3.2);
   - guarda de tenant como primeira linha de toda função `definer`, **com o teste que a
     obriga escrito antes da primeira função** (§3.4);
   - o roteiro de isolamento nasce cobrindo também a porta pública (§3.1).
3. **A F5 decide a porta pública** (§3.1): no mínimo, tenant derivado do cookie e nunca do
   slug; idealmente, `service_role` fora da superfície sem login.
4. **Antes da F9 (piloto):** SMTP próprio (§4.2) e observabilidade mínima (§4.3).
5. **Expectativa de esforço recalibrada** (§3.3): F1+F3 são construção, não transplante.

### Decisões que continuam sendo do Johnny

As seis decisões em aberto do §10 do plano seguem abertas — nenhuma delas é técnica, e esta
revisão não as toca. As duas que travam a F0 continuam sendo **o nome/domínio** e **onde o
produto vive** (org do GitHub, conta Supabase). O working title `Acervo` já está assumido na
ordem F0 escrita.

---

## 7. O que eu revisitaria, e em que gatilho

| Gatilho | O que revisitar |
|---|---|
| **2ª empresa no ar** | O roteiro de isolamento deixa de ser teste e vira o critério de release de toda fase de schema |
| **Primeira tabela > 100k linhas somando clientes** | Medir o predicado de tenant com `EXPLAIN ANALYZE` (§3.2) — é a hora em que o padrão errado apareceria |
| **Cliente que exige banco dedicado** | A porta já está desenhada (export por empresa); construí-la só então |
| **1º cliente pagante** | Free → Pro; SMTP próprio já deve estar de pé (§4.2) |
| **Import de cliente com patrimônio repetido entre unidades** | A mesa de conflitos da F24 foi descartada como "WAP-ismo"; com planilhas reais de terceiros, a probabilidade de precisar dela é alta — o desenho existe e está provado, não jogue fora |
| **Alguém além do Johnny operar o banco do produto** | O item A/R3 da dívida da WAP (método de migration) vira bloqueante, agora com dado de terceiros |

---

## 8. Veredito

O plano do Acervo está **arquiteturalmente correto**: as cinco decisões estruturais são as
que eu tomaria, e a mais importante delas — a regra mora no Postgres — é o que faz o produto
herdar, de graça, a garantia mais cara que a WAP comprou em 40 fases.

As correções deste documento são todas dentro da D1, e todas do mesmo tipo: **o plano confia
em quatro defesas contra vazamento entre empresas, e existem dois caminhos que passam por
fora das quatro** — a porta pública com `service_role` (§3.1) e as 116 funções que atravessam
RLS por construção (§3.4). Some-se a isso um predicado de tenant que nasceria com o padrão
lento documentado (§3.2), corrigível hoje ao custo de uma escolha de sintaxe e irreparável
depois ao custo de 70+ policies reescritas com clientes dentro.

Nada disso trava a F0. Tudo isso muda a F1 — e a F1, como o próprio plano diz, é a fase de
que tudo depende.

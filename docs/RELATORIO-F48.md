# Relatório da F48 — Os catálogos de segurança

*07/09/2026 · v1.53.0 · PR [#30](https://github.com/vmatusita/ti-wap-inventory-control/pull/30) ·
branch `f48-catalogos-seguranca`*

Ordem de serviço: `docs/prompts/F48-catalogos-de-seguranca-ultracode.md`.
Ficha de escopo: `docs/PLANO-MULTIEMPRESA.md` §5 → F48. Plano: `docs/PLAN-F48.md`.

---

## 1. O resultado, em números

| o que | antes | depois |
|---|---|---|
| roteiros SQL | 25 | **28** |
| asserções nos roteiros | 577 | **613** |
| superfícies de segurança enumeradas | **0 de 4** | **4 de 4** |
| mutações ativas do injetor | 28 | **39** — todas detectadas pelo cenário nomeado |
| em quarentena | 5 (15%) | **2 (4,9%)** |
| asserções que passavam sobre conjunto vazio, nomeadas pela F47 | 3 abertas | **3 fechadas** |
| regras de acesso na `MATRIZ-REGRAS.md` | R-ACC-28 | **R-ACC-35** |
| travas de mesa dos catálogos (rodam sem Postgres) | 0 | **97** |
| migrations | 128 | **128** — nenhuma nova, de propósito |

**A fase não corrigiu uma única policy, função, grant ou RLS.** Ela enumerou e congelou a linha
de base. As quatro superfícies nasceram **verdes**, e nenhuma invariante ficou desligada.

---

## 2. O diagnóstico da ordem, conferido item a item

A ordem manda não acreditar em nenhum dos sete pontos e medir cada um. O que **eu** medi:

| # | o que a ordem afirmava | o que medi | veredito |
|---|---|---|---|
| 1 | a mesa não tem Postgres nem Docker | `winget list` (nada), `ls "/c/Program Files/{PostgreSQL,Docker}"` (nada), `which psql pg_ctl docker` (nada) — as três negativas, pelo MÉTODO | **confirmado** |
| 2 | o runner recusa roteiro com zero asserção e sem `FIM` | lido em `rodar-roteiros.sh`: as quatro reprovações (a) ausência da linha `FIM`, (b) `N = 0`, (c) `M ≠ 0`, (d) `NOTICE\|WARNING: ✗` | **confirmado** — e por isso `isolamento_tenant.sql` nasceu com 11 asserções reais |
| 3 | a varredura de `empresa_id` não é escrevível hoje | `grep -rn "empresa_id" supabase/migrations/` → **0** | **confirmado** |
| 4 | as asserções 2 e 3 de `seguranca_catalogo.sql` já são duas das varreduras pedidas | lido no arquivo | **confirmado** → Decisão 2 |
| 5 | `senhas_acesso` e `senha_tentativas` têm RLS ligada e zero policy | confirmado, **e apareceu uma TERCEIRA**: `public.ambiente` (`0090`) | **confirmado e ampliado** |
| 6 | os números da ficha são para MEDIR | 55 policies (não 54), 37 `security definer` (a ficha dizia ~37), 8 de Storage, 3 no Realtime | **um diverge, três batem** |
| 7 | a `0128` não está em produção | MCP do Supabase **ausente** nesta sessão | **confirmado; pendência carregada** |

**Um número da ordem que corrigi:** ela fala em "**107** `revoke` de função, **79** citando `anon`".
Medi **106** statements de `revoke … on function`, **101** citando `anon`/`public`. A primeira
divergência é de contagem de statement (irrelevante); a segunda é a favor do repositório — o
hardening cobre **mais** do que a ficha supunha, não menos.

---

## 3. As quatro superfícies, medidas

⚠ **Toda medição do `PLAN-F48.md` foi feita por LEITURA ESTÁTICA das migrations, porque a mesa
não tem Postgres.** A tabela abaixo traz o número que o **catálogo do Postgres** devolveu no job
`banco-sem-docker`. Onde os dois divergissem, valeria o segundo; não divergiram em nada.

| superfície | ficha do plano | medido no CI | divergência |
|---|---|---|---|
| policies vivas | 54 (46 + 8) | **55 (47 + 8)** | **+1**, e explicada abaixo |
| funções `security definer` | ~37 | **37** | — |
| policies de `storage.objects` | 8 | **8** | — |
| tabelas na publication do Realtime | (não previsto) | **3** | — |
| tabelas em `public` | (não previsto) | **21** | — |

### 3.1 A divergência das policies, explicada

A ficha do plano foi escrita quando a última migration era a **`0127`** (o cabeçalho do plano diz
"126 migrations, a última é a `0127`"). A **`0128`** — nascida na F47, *depois* da ficha — criou
`"dev le backup f6a"` em `public._bkp_relatorios_gerados_f6a`. **46 + 1 = 47.**

E há uma segunda leitura, que vale registrar porque é a mesma pendência de sempre: a `0128` **não
está em produção**. Então hoje **produção tem 46** (a ficha mediu produção) e **o banco das
migrations tem 47** (o catálogo mede as migrations). Os dois números estão certos, cada um no seu
universo, e o apply os reconcilia.

### 3.2 Um erro meu no caminho, que vale mais do que o acerto

A primeira passada da medição das funções modelou `create or replace function` como se
**restaurasse** o grant default de `PUBLIC`, e acusou **14 funções executáveis por `anon`** — o
que teria sido um achado de segurança sério. **Está errado:** o Postgres PRESERVA a ACL existente
ao substituir uma função. Corrigido o modelo para "houve algum `revoke` de `anon`/`public` para
este nome?", o resultado é **zero**, e o catálogo no CI confirmou: **0 de 37**.

Fica registrado porque é a armadilha exata desta medição, e porque o remédio é o mesmo da fase
inteira: a asserção lê `has_function_privilege` **ao vivo**, não o histórico das migrations.

### 3.3 O que cada catálogo mede, com o universo real

```
--- catalogo_secdef.sql (8 asserções) ---
✓ 1a  toda `security definer` de public está CLASSIFICADA        (0 de 37)
✓ 1b  todo nome classificado existe e continua `security definer` (0 de 37)
✓ 2   nenhum nome tem mais de uma assinatura viva                 (0 de 37)
✓ 3   `search_path` travado em toda `security definer`            (0 de 37)
✓ 4   nenhuma `security definer` executável por anon              (0 de 37)
✓ 5   valida_lancamento_item é INVOKER de propósito e está FORA da tabela-verdade
✓ 6a  toda INVOKER alcançável por anon está declarada nominalmente (0 de 27)
✓ 6b  toda exceção declarada ainda descreve o banco                (0 de 5)

--- catalogo_policies.sql (15 asserções) ---
✓ 1a    toda tabela de public está CLASSIFICADA negócio × infra   (0 de 21)
✓ 1b    todo nome classificado ainda existe no catálogo           (0 de 21)
✓ 2     toda tabela de NEGÓCIO tem policy de SELECT               (0 de 16)
✓ 3     nenhuma tabela fica sem SELECT por CATEGORIA              (0 de 21)
✓ 4     toda exceção deny-all ainda descreve o banco              (0 de 3)
✓ 4-bis `force row level security` desligado (R-ACC-29)           (0 de 21)
✓ 5     nenhuma policy com predicado equivalente a `true`         (0 de 55)
✓ 6a    o piso `papel_atual()` continua nas 15 congeladas         (0 de 15)
✓ 6b    as 3 que decidem por CARGO não afrouxaram para o piso     (0 de 3)
✓ 6c    toda policy de SELECT de public está numa das duas listas  (0 de 18)
✓ 7     nenhuma policy de storage.objects decide só por bucket_id (0 de 8)
✓ 8a/8b o conjunto de policies de Storage é o congelado           (0 de 8, 0 de 8)
✓ 9a/9b a publication do Realtime é a congelada                   (0 de 3, 0 de 3)

--- isolamento_tenant.sql (11 asserções) ---
✓ 1   o papel do roteiro (postgres) ignora RLS
✓ 2   `authenticated` NÃO ignora RLS
✓ 3   `anon` NÃO ignora RLS
✓ 4   `service_role` ignora RLS (desenho — premissa do guarda_acervo da 0081)
✓ 5   o bloco de grants concedeu LEITURA                          (0 de 3)
✓ 6   o bloco de grants concedeu ESCRITA                          (0 de 1)
✓ 7   `profiles` recebe UPDATE de COLUNA e não de TABELA
✓ 8a  o universo foi contado como postgres ANTES do ataque (2 linhas)
✓ 8b  a operação FALHOU                                           (0 de 2)
✓ 8c  de volta como postgres, o dado original continua INTACTO    (0 de 2)
✓ 8d  o MESMO operador ESCREVE na filial VINCULADA (1 linha)
```

Saída completa em `docs/f48-evidencias/catalogos-no-banco-do-ci.txt`.

**Uma correção que o CI me deu:** medi **26** funções INVOKER por leitura estática; o catálogo diz
**27**. Não afeta asserção nenhuma (o número não está escrito em lugar nenhum — é o universo, e
ele é derivado), mas o número certo é 27.

---

## 4. A classificação NEGÓCIO × INFRA, completa

**O critério, escrito antes da lista:** NEGÓCIO = o conteúdo pertence ao acervo ou à operação de
UMA empresa e, na virada multiempresa, vai precisar da chave de recorte. INFRA = o conteúdo é do
mecanismo do sistema e não se recorta por empresa, ou se recortará por outro caminho (`membros`).

**NEGÓCIO — 16:** `anotacoes`, `ativos`, `colaboradores`, `eventos_admin`, `filiais`,
`import_logs`, `itens`, `kits_modelos`, `lancamentos_item`, `motivos`, `movimentacoes`,
`pendencias_item`, `relatorios_gerados`, `senhas_acesso`, `termos_gerados`, `tipos_item`.

**INFRA — 5, cada uma com o motivo:**

| tabela | motivo | migration |
|---|---|---|
| `profiles` | identidade da CONTA, não do acervo; na virada o cargo migra para `membros.papel` | `0001` |
| `operador_filiais` | vínculo de ESCRITA de uma conta; mesmo destino | `0061` |
| `senha_tentativas` | rate-limit por IP; a própria migration o chama de *"Infra de segurança"* e a tabela guarda um IP e um contador | `0025:19` |
| `ambiente` | marcador de DEPLOY; o `comment on table` diz *"nada no app lê esta tabela"* | `0090` |
| `_bkp_relatorios_gerados_f6a` | backup CONGELADO; a `0128` a chama de *"arquivo morto de diagnóstico, não cadastro"* | `0128:97` |

**As três exceções NOMINAIS de "sem policy de SELECT":**

| tabela | classe | migration | motivo escrito |
|---|---|---|---|
| `senhas_acesso` | negócio | `0005` cria duas, **`0012` dropa as duas** | a porta pública por senha é servida pelo service role, fora da RLS; policy de SELECT para `authenticated` exporia o hash |
| `senha_tentativas` | infra | `0025` liga a RLS e nunca cria policy | mesmo idioma; escrito só por `registrar_tentativa_senha()` (definer) |
| `ambiente` | infra | `0090:53-56` | *"Sem NENHUMA policy: invisível para anon e authenticated"* |

**⚠ A peça que fecha o buraco da categoria.** A asserção 2 cobra SELECT nas tabelas de negócio; a
asserção **3** cobra que **toda** tabela de `public` sem SELECT, *de qualquer classe*, esteja na
lista nominal. Sem ela, classificar como "infra" seria isenção por CATEGORIA — exatamente a
isenção por prefixo `_` que a F47 arrancou de `seguranca_catalogo.sql`, com outro nome. E a
asserção **4** confere a lista no sentido contrário: nome declarado deny-all que passe a TER policy
de SELECT também reprova, para a exceção não sobreviver ao motivo.

---

## 5. As três decisões obrigatórias, com o número que decidiu cada uma

### Decisão 1 — o critério de NEGÓCIO → **16 negócio / 5 infra**

O critério concorrente ("aparece como cadastro numa tela de operação") foi avaliado e descartado
**por evidência, não por gosto**: ele classifica `eventos_admin` e `import_logs` como infra, e o
plano diz, ao descrever a varredura de recorte da F62, que iterar por lista à mão é o erro e que
*"`eventos_admin` é exatamente a tabela que uma lista à mão esqueceria"*. Uma frente de exploração
propôs 14/7 aplicando o critério da tela; a divergência está em três tabelas e está registrada na
ata. Ata: `docs/DECISOES.md` 2026-09-07 · F48 · Decisão 1.

### Decisão 2 — onde moram as varreduras schema-wide → **opção (a): ficam onde estão**

| o que mediria a opção (b) — migrar | número |
|---|---|
| mutações ativas que miram o rótulo `2` de `seguranca_catalogo` | **2** |
| mutações ativas que miram o rótulo `3` | **1** |
| entradas de `mutacoes.mjs` a reapontar | **3** |
| ciclos de CI só para reprovar o que já está provado | ≥ 1 |
| **ganho de cobertura** | **zero** |

Mais dois custos que não são de número: o motivo escrito da remoção da isenção por prefixo vive no
cabeçalho da asserção 2 (mover órfã o motivo), e o `RELATORIO-F47.md` §6.6 a cita nominalmente
(mover faz um relatório publicado apontar para o vazio). Uma terceira opção — levá-las para
`catalogo_policies.sql` — foi avaliada e descartada: mesmo custo, ganho de arrumação.
**Não fiz as duas.** `seguranca_catalogo.sql` ganhou o ponteiro de volta e a nota de
não-duplicação; os três arquivos novos apontam para lá; e há teste de mesa cobrando as duas
metades (describe 6), com sabotagem provando (F.6).

### Decisão 3 — desvio real → **não foi preciso usar a régua**

As quatro superfícies nasceram verdes. **Nenhuma invariante ficou declarada e desligada.** As três
observações que saem como informativas estão no §8.

---

## 6. A frente 6 — as quatro asserções fracas, item a item

| cenário | antes | depois | mutação | detectada? |
|---|---|---|---|---|
| **`2i-bis-3`** `papeis_rls` | `id = gen_random_uuid()` inline + `arquivo_path = 'forjado.docx'`: a **quarta** conjunção da policy recusava sozinha, antes de a âncora importar. O ✓ dizia "a âncora está no ar" — mais do que ele sabia. | `id` sorteado numa variável e `arquivo_path = <id>::text \|\| '.docx'`. As outras três conjunções passam **de propósito**; sobra só `termo_ancora_coerente`. Mensagem corrigida. | `ancora-do-termo-sempre-coerente` | ✅ **sim** (era INDETECTÁVEL na F47) |
| **`1j`** `papeis_rls` | só provava que a leitura não foi RECUSADA — verdade com a RLS ligada ou desligada | duas linhas plantadas e contadas como `postgres`; exige que o consulta ATIVO veja **as duas** (o outro lado do gate) | — | — |
| **`4i`** `papeis_rls` | `if v_n = 0 then ✓`, sobre tabela possivelmente vazia | `assert_zero_de` com o universo real, **recontado** logo antes da seção 4 | `leitura-de-colaboradores-sem-piso` | ✅ **sim** |
| **`3d`** `cargo_dev` | aceitava "0 sessões removidas" como sucesso; `auth.sessions` nasce vazia | planta **2** sessões do alvo + **1** de uma TESTEMUNHA e prova as duas metades: as do alvo somem **E** a da testemunha fica | `gestao-encerrar-sessoes-mira-o-alvo-errado` | ✅ **sim** |

**Duas decisões finas dentro da frente 6, que valem mais do que o conserto:**

1. **A recontagem do universo antes da seção 4 não é cosmética.** `assert_zero_de` recusa
   `ruins > universo` **levantando exceção**. Com a RLS de `colaboradores` desligada, o desativado
   veria 3 linhas contra um universo de 2 (a de `2j` entrou no meio), o roteiro morreria **antes**
   da linha `FIM`, e o injetor leria *"roteiro abortou"* em vez de *"o cenário `4i` acusou"* — a
   mutação reprovada pelo motivo certo com o **nome errado**, que é o diagnóstico que a F47 pagou
   caro para não ter.
2. **`leitura-de-colaboradores-sem-piso` declara só `4i`, e não `1j`.** Com a RLS desligada, o
   cargo `consulta` **ATIVO** continua vendo as duas linhas, então `1j` não distingue e continua
   verde. Declarar `1j` seria afirmar mais do que a mutação prova — exatamente o defeito que a F47
   encontrou no ✓ do `2i-bis-3`. (O injetor confirmou: a mutação derruba `4i` e, de efeito
   colateral, `1i-bis` e `3c-ter`.)

**A quarentena resultante: 2 de 41 (4,9%)**, contra 5 de 33 (15%) na F47. As duas que sobram são de
**outra classe** — não são asserção fraca, são cenário que não existe (concorrência de duas
conexões; o ramo de backup em arquivo acima de 25 ativos), e as duas nomeiam a **F52**.

---

## 7. As sabotagens — a prova de que os catálogos sabem ficar vermelhos

### 7.1 Sabotagens A–E, no banco: **oito mutações novas, 39/39 detectadas**

A mesa não tem Postgres, então estas provas não se ensaiam aqui. **O injetor é a máquina certa
para elas** — e, escritas em `scripts/db/mutacoes.mjs`, deixam de ser um log de uma tarde e passam
a rodar **a cada push**, no *required check*. É o que a F47 fez com a tabela `_` sem RLS (§6.6).

| # | sabotagem | mutação | rótulo | detectada |
|---|---|---|---|---|
| **A** | tabela nova em `public` sem classificação | `catalogo-tabela-nova-nao-classificada` | `1a`, `3` | ✅ |
| **A'** | tabela `_` sem RLS *(permanente desde a F47)* | `catalogo-tabela-de-backup-sem-rls` | `2` | ✅ |
| **B** | policy com predicado `using (true)` | `catalogo-policy-volta-a-ser-sempre-verdadeira` | `5`, `6a` | ✅ |
| **C** | `security definer` nova não classificada | `catalogo-security-definer-nova-nao-classificada` | `1a` | ✅ |
| **C'** | ... com `search_path` solto | `catalogo-security-definer-com-search-path-solto` | `3` | ✅ |
| **C''** | ... executável por `anon` | `catalogo-security-definer-executavel-por-anon` | `4` | ✅ |
| **D** | tabela nova na publication do Realtime | `catalogo-tabela-nova-na-publication-do-realtime` | `9a` | ✅ |
| **E** | policy de Storage decidindo só por `bucket_id` | `catalogo-storage-decide-so-por-bucket` | `7` | ✅ |
| **+** | `force row level security` ligado (R-ACC-29) | `catalogo-force-row-level-security-ligado` | `4-bis` | ✅ |

**A sabotagem E usa o predicado HISTÓRICO.** `using (bucket_id = 'termos')` não é uma forma
inventada para o teste: é literalmente o que a `0070:137` documenta como reversão, e o furo que
ele deixava está em `0070:202-207` — *"quem foi DESATIVADO continuava conseguindo `createSignedUrl`
de qualquer .docx enquanto o token vivia, e o .docx traz nome do colaborador, setor e patrimônios"*.
A forma proibida **existiu**, e a mutação é ela.

**Por que nenhuma foi detectada por acidente:** a **execução de controle** do injetor roda antes de
qualquer mutação e exige os roteiros VERDES. Uma sabotagem "ser detectada" por um catálogo que já
estivesse vermelho é estruturalmente impossível — o motor aborta antes de mutar.

Saída real: `docs/f48-evidencias/sabotagens-A-E-no-banco.txt` e `injetor-lote-39.txt`.

### 7.2 Sabotagem F, sem banco: **11 sabotagens — e três delas pegaram fraqueza de verdade**

`src/lib/validators/catalogos-seguranca.test.ts` roda na mesa em 0,3 s. As 11 sabotagens estão em
`docs/f48-evidencias/sabotagem-F-trava-de-mesa.txt`, com a saída real de cada uma.

**A parte que interessa: na primeira rodada, três passaram.** Duas eram **fraqueza de verdade da
trava**, e a terceira era uma sabotagem mal desenhada:

| # | o que a sabotagem revelou | correção |
|---|---|---|
| **F.2/F.3** | a lista de exceções estava **escrita à mão no teste**: acrescentar um nome novo a `k_sem_select` ou `k_invoker_anon` **sem motivo nenhum** passava verde, porque o teste só olhava os quatro que já conhecia. Era o defeito que a fase existe para não ter — uma lista à mão fingindo ser derivada. | os nomes passaram a ser **lidos do `.sql`**, e a régua passou a exigir motivo **e** migration **na mesma linha** de comentário (exigi-los "no mesmo bloco" deixava qualquer número do bloco satisfazer qualquer nome) |
| **F.7** | a régua media a **QUANTIDADE** de chamadas de `assert_zero_de`, não a **FORMA**: trocar uma delas pelo `if v_x = 0 then ✓` deixava o contador acima do piso e passava verde | asserção nova que recusa a forma tautológica, distinguindo a condição COMPOSTA (legítima) da simples; e as duas asserções minhas que usavam a forma antiga foram reescritas |
| **F.10** | a simetria dos catálogos aceitava `= any (k_secdef)` satisfeito por uma comparação com **LITERAL**, que não varre catálogo nenhum | o casador passou a exigir **coluna qualificada** (`p.proname = any (…)`) |

Depois das correções: **11/11 detectadas, cada uma pela mensagem certa.**

---

## 8. ACHADOS de segurança — três observações, nenhuma correção

A régua da Decisão 3: desvio vira achado nomeado, com severidade, **sem correção**, e a decisão de
corrigir é do Johnny, em fase própria.

### 8.1 `public.ambiente` — a terceira tabela deny-all · severidade **informativa**

A ordem avisava de duas; havia **três**. `ambiente` (`0090`) tem RLS ligada e zero policy, e a
migration escreve *"Sem NENHUMA policy: invisível para anon e authenticated. Só o dono (…) enxerga
— mesmo idioma de `senhas_acesso`/`senha_tentativas`"*.

**Não é defeito: é desenho documentado.** Vira exceção nominal, com o motivo e a migration. O que
ela revela é sobre o *processo*, não sobre o banco: a ficha do plano não a mencionava, e a asserção
ingênua a teria acusado junto com as outras duas. É a razão de a ordem mandar procurar uma
terceira.

### 8.2 Cinco funções INVOKER alcançáveis por `anon` · severidade **baixa**

`chave_identidade_ativo` (`0099`), `hoje_brt` (`0124`), `mov_da_carga_import` (`0092`),
`status_apos_movimentacao` (`0109`) e `valida_lancamento_item` (`0118`) não têm `revoke` e, pelo
default do Postgres (EXECUTE para `PUBLIC`), são alcançáveis por `/rest/v1/rpc/*` com a chave
pública.

**Por que a severidade é baixa, e não média — e a distinção entre as quatro e a quinta importa:**

- **As quatro primeiras são PURAS.** `immutable`/`stable`, calculam sobre os próprios argumentos e
  **não tocam tabela nenhuma**. Um `anon` que as chame recebe aritmética de texto e uma data.
- **`valida_lancamento_item` é a exceção, e o motivo dela é outro.** Ela **lê**
  `public.lancamentos_item` (`0118:146-147`). O que a torna inofensiva são duas coisas
  independentes: é `returns trigger`, então uma chamada por `/rest/v1/rpc/*` **falha** — não há
  `NEW`/`OLD` fora de um trigger; e, sendo INVOKER, a leitura vale com o privilégio de **quem
  chama** e passa pela RLS de `lancamentos_item` como qualquer outra.

> ⚠ A primeira redação deste parágrafo dizia *"nenhuma lê tabela por conta própria"* — **falso**
> para `valida_lancamento_item`, e a revisão adversarial pegou. A conclusão prática não muda, mas
> a justificativa escrita estava errada, e num relatório de segurança isso importa mais do que a
> conclusão: é ela que alguém vai reler daqui a um ano para decidir se ainda vale.

**Não corrigi**, e o motivo é o escopo: a ordem proíbe tocar em grant. O que a fase faz é
**enumerá-las nominalmente**, com a asserção simétrica que reprova uma INVOKER **nova** alcançável
por `anon` fora da lista. Se o Johnny quiser defesa em profundidade, é uma migration de cinco
`revoke` e a lista `k_invoker_anon` esvazia.

### 8.3 A divergência 55 × 54 policies · severidade **informativa**

Explicada no §3.1: a `0128` nasceu depois da ficha. Não é defeito de nenhum dos dois lados.

**Nada mais.** Nenhuma policy `true`, nenhuma `security definer` com `search_path` solto ou
alcançável por `anon`, nenhuma policy de Storage decidindo só por bucket, nenhuma tabela na
publication além das três, nenhuma tabela com `force row level security`. **O acervo estava melhor
do que a ficha supunha.** O que faltava era ser obrigado a continuar assim.

---

## 9. Os 16 critérios de aceitação, autoverificados

| # | critério | evidência |
|---|---|---|
| 1 | `catalogo_policies.sql` verde, N > 0, com linha `FIM` | **15 asserções, 0 falhas** — `catalogos-no-banco-do-ci.txt` |
| 2 | cobre as TRÊS superfícies declarativas, com asserção própria | policies de `public` (1a–6b), Storage (7, 8a, 8b), Realtime (9a, 9b) |
| 3 | nenhuma policy com predicado `true`; o número está no relatório | asserção 5: **0 de 55** |
| 4 | tabela de negócio sem SELECT reprova; exceção nominal declarada | asserções 2/3/4 + sabotagem A (`1a`,`3`); as **3** exceções com motivo e migration |
| 5 | nenhuma policy de Storage decide só por `bucket_id`; a forma proibida EXISTIU | asserção 7: **0 de 8**; `0070:137` documenta o predicado antigo; sabotagem E **é** ele |
| 6 | `catalogo_secdef.sql` verde, deriva de `prosecdef`, prova `search_path` e `anon` | **8 asserções, 0 falhas**; 3 e 4: **0 de 37** cada |
| 7 | `security definer` nova não classificada REPROVA — provado por sabotagem | mutação `catalogo-security-definer-nova-nao-classificada` → **✗ 1a**, detectada |
| 8 | exceção nominal de `valida_lancamento_item` com motivo escrito | asserção 5 do `catalogo_secdef`, dupla (INVOKER **e** fora da tabela-verdade) |
| 9 | `isolamento_tenant.sql` verde, N > 0, bloco de grants, convenção no cabeçalho, **sem** `empresa_id` | **11 asserções, 0 falhas**; trava de mesa describe 5 cobra as duas metades |
| 10 | Decisão 2 tomada, registrada e aplicada: UM lugar só | ata + ponteiros nos quatro arquivos + describe 6 + sabotagem F.6 |
| 11 | os quatro cenários fortalecidos; as três mutações no lote ativo e **detectadas** | §6; `injetor-lote-39.txt` — **31/31**, depois **39/39** |
| 12 | `MATRIZ-REGRAS.md` com a emenda F48 | R-ACC-29 a R-ACC-35, com as duas razões da `0070`, o `42P17` e as quatro superfícies |
| 13 | `lint`, `test`, `build`, `tsc` limpos | §11 |
| 14 | `db:test` verde para os **28** roteiros; `db:types:diff` verde | **28 roteiros, 613 asserções**; gate de tipos verde no mesmo job |
| 15 | versão **1.53.0**, registry, tag, CHANGELOG | §11 |
| 16 | PR mergeado com os dois checks verdes; `main` em repouso | §11 |

---

## 10. O que este relatório NÃO prova

- **Não prova que os catálogos descrevem PRODUÇÃO.** Eles rodam contra o banco do **CI**,
  construído a partir das migrations `0001`→`0128`. É a mesma limitação honesta que a F47 escreveu
  do gate de deriva (`RELATORIO-F47.md` §4.4): um objeto criado à mão no SQL Editor continua
  invisível. E há uma divergência **conhecida e nomeada** neste momento — a `0128` não está
  aplicada, então produção tem 46 policies em `public` e o CI tem 47.
- **Não prova nada sobre GRANT de TABELA, e a omissão é deliberada.** Os grants de FUNÇÃO estão
  100% declarados em migration, e por isso o catálogo os enumera com procedência. Os de TABELA,
  não: um projeto Supabase hospedado os concede por *default privilege*, e o Postgres cru do CI não
  os reproduz (`supabase/ci/bootstrap-roles.sql:8-27`). Uma asserção sobre eles seria verdadeira no
  CI e **desconhecida** em produção — o tipo de gate que dá sensação de rede. O único lugar que os
  mede é `isolamento_tenant.sql`, e ele mede os grants que **ele mesmo plantou**.
- **Não prova que a enumeração é COMPLETA.** Ela cobre as quatro superfícies que a ficha nomeia.
  Ficam de fora, e não são desta fase: os *default privileges* do schema, os triggers, as views
  materializadas (não há nenhuma), as extensões (nenhuma migration cria uma — o que torna a
  pergunta "alguma tabela de `public` veio de extensão?" **estruturalmente não respondível** por
  leitura de migration) e a superfície HTTP/RSC, que é a F49.
- **Não prova que as 613 asserções cobrem tudo.** Prova que, nos cenários que as 39 mutações miram,
  os roteiros acusam o defeito certo. A quarentena mostra que pelo menos dois caminhos continuam
  sem cenário.
- **Não prova que a classificação negócio × infra está certa para a virada.** Ela está *escrita*,
  com critério e motivo por tabela, e é conferida nos dois sentidos. Se a F62 discordar de alguma,
  trocar de lado é uma linha — e a ata registra a divergência que já existe (§5, Decisão 1).

---

## 11. O fechamento

### 11.1 Os quatro comandos, na mesa

```
npm run lint      → limpo
npm run test      → 159 arquivos, 4008 testes, 0 falhas   (eram 158 / 3873)
npx tsc --noEmit  → limpo
npm run build     → ver §11.2
```

### 11.2 O CI

| job | resultado |
|---|---|
| `banco-sem-docker` | **verde** — 28 roteiros, 613 asserções, 0 falhas · 39/39 mutações detectadas · gate de tipos verde |
| `verificar` | **verde** |

Os três catálogos passaram **no primeiro push**, o que é incomum numa mesa sem Postgres e é
consequência direta da frente 7: a trava de mesa pegou na bancada tudo que não precisava de banco.

### 11.3 Versão, tag e repouso

- `package.json` → **1.53.0** · `src/lib/versoes/registry.ts` topo → `1.53.0` / `2026-09-07` / `F48`
- `CHANGELOG.md` → entrada nova no topo · `docs/DECISOES.md` → **6 atas**
- tag anotada **`v1.53.0`**, publicada
- **Nenhuma migration nova.** A última continua sendo a `0128`, e `migrations.lock.json` não foi
  tocado.

---

## 12. Pendências e backlog

### 12.1 Pendência — **UMA**, herdada, e é de acesso

**A `0128` continua sem aplicar em produção.** O MCP do Supabase **não está disponível nesta
sessão** (a busca por ferramenta não devolve nenhuma `apply_migration`/`execute_sql`). Como a
ordem manda, não insisti, não inventei caminho alternativo e não toquei em credencial.

**O que isso significa:** o repositório e o CI ficam consistentes assim mesmo. Em produção a tabela
continua sem policy nenhuma (deny-all por ausência — o estado de hoje, **não é regressão**). O que
fica aberto é a convergência, e ela agora tem um segundo sintoma nomeado: **produção tem 46
policies em `public` e o CI tem 47.**

**Como resolver, em uma linha:** aplicar `supabase/migrations/0128_adota_bkp_relatorios_f6a.sql`
pelo caminho A do `RUNBOOK-BANCO.md` e rodar as três consultas do bloco *VERIFICAÇÃO PÓS-APPLY* no
rodapé. A terceira tem de devolver **2**.

### 12.2 Backlog nomeado

**Decisão do Johnny (achado 8.2):** revogar o `EXECUTE` de `anon` das **cinco** funções INVOKER
puras/gatilho? É defesa em profundidade, não correção de furo — uma migration de cinco `revoke`, e
a lista `k_invoker_anon` do `catalogo_secdef.sql` esvazia (a asserção 6b acusa a lista obsoleta na
hora, que é o comportamento certo).

**Herdado da F47 §10.3, e continua fora de escopo — entrega avulsa PATCH:**

- `scripts/gen-types.ts` cita o job `banco`, removido na v1.51.1.
- `supabase/ci/impressao-schema.sql` exclui `_%` com um motivo escrito que envelheceu com a `0128`.

**Para a F52** — as duas entradas que sobraram na quarentena: a serialização por
`pg_advisory_xact_lock` (precisa de uma segunda conexão) e o ramo de backup em arquivo acima de 25
ativos (precisa de um cenário com 26).

**Para a F62/F65** — a varredura da chave de recorte nula. A linha está escrita, como comentário,
no cabeçalho de `isolamento_tenant.sql`, com o motivo de estar vazia e o formato pronto.

---

## 13. A revisão adversarial

Rodada em **contexto fresco**, contra o `PLAN-F48.md`, o diff da fase e os 16 critérios, com as
sete perguntas que a ordem faz. Sete lentes independentes levantaram achados; cada achado passou
por **três céticos**, cada um com uma lente própria (é defeito de correção ou preferência de
estilo? o requisito está mesmo declarado na ordem? o achado se reproduz?), instruídos a **refutar**
e a marcar refutado em caso de dúvida. Sobreviveram os que ao menos 2 dos 3 não conseguiram
refutar.

| lente | levantados | confirmados |
|---|---|---|
| alguma asserção passa sobre conjunto vazio? | 0 | 0 |
| alguma "exceção nominal" é isenção por categoria disfarçada? | 2 | 1 |
| algum catálogo é lista escrita à mão fingindo ser derivada? | 2 | **2** |
| alguma sabotagem prova menos do que afirma? | 4 | 3 |
| algum requisito declarado ficou por fazer? | 1 | 0 |
| o `isolamento_tenant` passa verde com a RLS desligada? | 3 | 1 |
| erros factuais (números, linhas, migrations) | 3 | 2 |
| **total** | **15** | **9** |

**A lente que mais rendeu foi a que a ordem mais teme** — "lista escrita à mão fingindo ser
derivada" — e ela achou um defeito real que eu não tinha visto.

### 14.1 Os nove confirmados, e o que foi feito de cada um

| # | achado | gravidade | o que fiz |
|---|---|---|---|
| 1 | **`k_piso_papel`/`k_piso_cargo` conferidos só num sentido.** 6a e 6b varrem `unnest(…)` — as duas vão da lista para o catálogo. Uma tabela de negócio nova, com SELECT citando `papel_atual()`, **entraria sem reprovar**: a 1a a cobraria por estar classificada, a 2 por ter SELECT, e o piso dela não passaria por decisão nenhuma. | **alta** | **Corrigido** — asserção **6c**, o sentido catálogo→lista. Era a única assimetria do arquivo: os outros quatro conjuntos já tinham as duas direções. |
| 2 | **O comentário de `k_leitura`/`k_escrita` prometia uma simetria que o código não tem.** Ele dizia que acrescentar tabela ao bloco de grants sem acrescentá-la ao array "ficaria visível" — e não ficava. | baixa | **Corrigido nos dois lados** — o comentário passou a dizer onde a conferência mora, e o `describe 9` da trava de mesa a implementa, comparando o bloco com os arrays nos dois sentidos. |
| 3 | **"nenhuma das 5 INVOKER lê tabela por conta própria" é FALSO** para `valida_lancamento_item`, que lê `lancamentos_item` quatro vezes (`0118`). E a frase era a justificativa escrita da severidade baixa. | média | **Corrigido no plano e no relatório** (§8.2). A conclusão não muda, mas o motivo é outro: ela é `returns trigger` (não invocável por RPC) e INVOKER (lê sob a RLS de quem chama). Num relatório de segurança, a justificativa importa mais do que a conclusão — é ela que alguém relê daqui a um ano. |
| 4 | **A tag `v1.53.0` não existia**, e o §11.3 já a dava como publicada. | **alta** | **Corrigido** — a tag foi criada no commit final e publicada. O relatório passou a descrever o que existe. |
| 5 | **O PR #30 não estava mergeado**, e o §11 falava dele no passado. | **alta** | **Corrigido** — o merge é o último passo da fase, e o relatório só o afirma depois de feito. |
| 6 | **§13 apontava para um §14 inexistente.** | **alta** | **Corrigido** — é esta seção. O achado é justo e desconfortável: o relatório prometia a autoverificação que a ordem exige e entregava um ponteiro para o vazio. |
| 7 | **A quarentena não é 6%.** Era 6% quando o lote tinha 33; com as oito mutações novas o lote é 41, e 2/41 = **4,9%**. | baixa | **Corrigido** no relatório, no CHANGELOG e na ata. |
| 8 | **A citação do bloco de grants estava um a menos:** `papeis_rls.sql:92-146`; ele começa no `grant select on` da **91**. | baixa | **Corrigido**, com os dois marcos nomeados no comentário. |
| 9 | **"40 dias depois de virar regra"** no CHANGELOG: de 30/07 a 07/09 são **39**. | baixa | **Corrigido.** |

### 14.2 Os seis refutados, e por quê

Vale registrar os que **não** sobreviveram, porque a régua da ordem é explícita — *"aponte apenas
lacunas de correção ou de requisito declarado, não preferências de estilo"* — e os céticos a
aplicaram:

- **"O cenário 8 duplica `2f`/`2g` de `papeis_rls.sql`"** e **"o cenário 8 só prova a metade
  negativa"**. Os céticos refutaram os dois (o `2g` de lá termina em `if found` e **não** faz a
  segunda prova, então não é a mesma asserção). **Ainda assim atendi aos dois**, porque a crítica
  melhorava o arquivo mesmo sem se sustentar como defeito: entrou a metade positiva (**8d**) e
  entrou o ponteiro dizendo o que é duplicata e o que não é. Um achado refutado que melhora o
  código continua valendo o conserto.
- **"O fechamento da fase nunca foi commitado"** — levantado enquanto os commits estavam sendo
  feitos; o revisor rodou `git status` na janela entre um commit e outro.
- Os outros três eram preferências de forma, e caíram na primeira lente cética.

### 14.3 O que a revisão adversarial CUSTOU, e vale escrever

**Uma das lentes rodou `git checkout` para inspecionar o diff e apagou o trabalho não commitado da
sessão** — quatro correções que eu tinha acabado de escrever (a asserção 6c, o cenário 8d, o
`describe 9` e duas emendas do plano) sumiram, e o `git reflog` mostrou o culpado
(`checkout: moving from f48-catalogos-seguranca to f48-catalogos-seguranca`). Refiz as quatro e
passei a **commitar cada uma imediatamente**, em vez de acumular.

Não é anedota: é a razão de as correções da revisão estarem em quatro commits pequenos em vez de
um. E é o aviso para quem escrever a próxima ordem — **revisor em contexto fresco precisa ser
instruído a não rodar comando que mexa no índice ou na árvore de trabalho**, e não só a "não
editar arquivos", que foi o que a instrução dizia.

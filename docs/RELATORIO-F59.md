# Relatório F59 — A doutrina do predicado, escrita e travada

**v1.64.0** · **sem migration** · 16/09/2026 · SHA de código congelado **`b720f49`** · branch `f59-doutrina-do-predicado` ·
código [PR #50](https://github.com/vmatusita/ti-wap-inventory-control/pull/50) · a conferência pós-deploy entra pelo PR só de
documentação (§9)

> A virada multiempresa vai tocar ~60 policies de RLS, e a forma que o plano do produto propunha — `e_membro(empresa_id)`,
> uma função que recebe a coluna da linha — roda uma vez por linha examinada, em toda leitura, para todo usuário. Medido
> nesta fase, em produção e só leitura: 44 ms × 2,1 ms na lista de ativos, 88 ms × 2,7 ms na de movimentações, com as
> mesmas linhas. A fase escreveu a régua ANTES da primeira policy de tenant — `col = any (array (select public.<fn>()))`
> sobre função `setof` — e a travou em dois lugares: na mesa, sobre o replay das migrations
> (`src/lib/validators/policies-initplan.test.ts`), e no catálogo vivo do banco do CI, sobre a árvore `pg_policy.polqual`
> (`supabase/tests/catalogo_policies.sql`, bloco 4), com as exceções numa fonte só e oito mutações novas no injetor.
> Nenhuma policy, função, grant ou índice mudou em banco nenhum. Nenhuma tela mudou.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você

*Nada aqui é pedido de autorização. É o olho humano sobre a régua que a F62, a F66 e a F67 vão herdar.*

**Nenhuma medição ficou pendente por falta de canal.** O MCP da Supabase estava nesta sessão; o censo, a pergunta de
planejador, a prova da forma-alvo e as medições do ensaio e de produção rodaram, todas só leitura. O token da Management
API não foi usado — não há token para girar por causa desta fase. A única medição que não existe é a da persona
**operador**, e ela não é um comando que você roda: o ensaio não tem perfil de operador com vínculo, e esta fase não grava
nada para criá-lo (§8.3).

### 1. Depois do deploy — só olhar

`https://ti-wap-inventory-control.vercel.app/api/saude` deve responder `"versao":"1.64.0"`. Nenhuma tela muda; a página
`/versoes` mostra a entrada nova.

### 2. Ler a régua e a lista de exceções — é agora que custa barato

1. A **emenda F59** no fim de [`docs/MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md) (R-ACC-63 a R-ACC-72), e o bloco "A forma-alvo,
   para copiar" — é o SQL que a F62 vai colar. Repare que o tipo de retorno é `setof uuid`, **não** o `uuid[]` da ficha
   (§2, divergência 1).
2. A **lista de exceções** — `k_excecoes_predicado` em
   [`supabase/tests/catalogo_policies.sql`](../supabase/tests/catalogo_policies.sql) linhas 270–289, ocorrência por
   ocorrência. São 18, cada uma com a migration de origem, o motivo e o destino:
   - **6 com destino F66** — as policies de escrita por filial (`ativos` insere/atualiza, `lancamentos_item`,
     `movimentacoes`, `pendencias_item` ×2) passam a `unidades_de_escrita()`. Quando a F66 terminar, essas seis linhas
     saem, e a trava obriga a tirá-las.
   - **1 com destino F67** — `storage.objects / termos leitura operador`, o falso içamento que a `0129` chama de InitPlan.
   - **11 permanentes** — a policy decide sobre o PRÓPRIO objeto: o `.docx` pelo `name`, o termo pelos `ativo_ids`, o
     estorno pela coerência dos seus campos. As três de arquivo de termo ficam "revistas na F67".

   Se alguma parecer errada — um "permanente" que devia ter destino, um motivo que não convence —, diga antes da F62.

### 3. Conferir que nada fora do escopo mudou

Depois da tag, isto tem de vir vazio:

```bash
git diff v1.63.0 v1.64.0 -- supabase/migrations supabase/migrations.lock.json src/lib/types/database.ts src/app src/components CLAUDE.md
```

### 4. Rodar `npm run test` uma vez, na sua máquina

Esperado: **219 arquivos, 5.997 testes**, verde (eram 216 / 5.856). A trava nova é `policies-initplan.test.ts`; ela lê as
migrations e o `.sql` do disco na coleta.

---

# 2. Os números MEDIDOS, lado a lado com a ficha e a ordem

| o quê | a ficha / a ordem | medido | onde |
|---|---|---|---|
| policies vivas | ficha: 54 · ordem: 61 | **61** (53 `public` 22/14/11/6 + 8 `storage` 2/2/2/2), iguais em replay × ensaio × produção × CI | §5 |
| comandos de policy nas migrations | 76 create / 46 alter / 16 drop | **138**, **138 consumidos** pelo replay; 0 dinâmico, 0 ilegível | `G-contagem-final.txt` |
| policies que passam a linha para função | ficha: "uma exceção" · ordem: 13 × 7, ~18 | **18 ocorrências**, 13 policies, 7 funções (uma built-in: `array_length`) | `A-ocorrencias-replay.md` |
| "12 de escrita" | ficha | **batem** (as 12 policies de escrita com função sobre a linha; a 13ª é a de leitura de Storage) | idem |
| chamadas sem argumento | 62, todas em `(select …)` | **62**, todas; **0** só com constantes | §5 |
| sub-select com `FROM` em policy | 0 | **0** | §5 |
| forma-alvo `empresas_do_membro() → uuid[]` + `= any (array (select …))` | ficha: a forma | **erra**: `2202E` no vazio, `22004` no NULL (ensaio, como `authenticated`) | `B-forma-alvo-ensaio.json` |
| `(select fn(coluna))` | `0129:66-69`: "padrão InitPlan" | **`SubPlan` correlacionado, 1 loop por linha** — ensaio e produção | §8 |
| `0107` (−45%) | ficha: medida | medida no **ensaio**, não em produção | cabeçalho da `0107` |
| F3 ÷ F1 (a forma içada contra a por linha) | — | ensaio **17× a 27×**; produção **20× a 32×** (contra o falso içamento: até 29× e 34×) | §8 |
| suíte | 216 / 5.856 | **219 / 5.997** | §14 |
| gate de deriva de tipos | os números da F58 | **34 relações · 312 colunas · 75 funções** (os da F58) | `F-sabotagem-par-no-ci-run1.txt` |

## 2.1 As dez divergências que a ordem declarou — todas confirmadas

1. **A forma-alvo da ficha quebra.** `uuid[]` consumida por `= any (array (select …))` monta um array de uma dimensão a
   mais e ERRA no conjunto vazio (`2202E cannot accumulate empty arrays`) e no NULL (`22004 cannot accumulate null
   arrays`). Todo membro sem empresa cairia com erro em vez de ver lista vazia. A emenda fixa `returns setof uuid`
   (R-ACC-67), provado no ensaio: vazio, NULL e elemento NULL → 0 linhas, sem erro, `InitPlan`.
2. **61 policies, não 54.**
3. **13 policies e 7 funções dependem da linha (18 ocorrências), não uma exceção só**; as "12 de escrita" batem.
4. **As de SELECT não estão todas limpas**: "termos leitura operador" (`storage.objects`) é o falso içamento
   `(select public.pode_ler_arquivo_termo(name))`, que a `0129:66-69` chama de InitPlan. Exceção declarada, destino F67.
5. **A `0107` mediu no ensaio**, não em produção. Esta fase mediu nos dois.
6. **O "ainda não foi decidida" do `README.md` estava na linha 69** (seção `:67-71`), não em `:60-64`.
7. **A `ESPECIFICACAO.md` tem 482 linhas e 174 menções** ("filial" 120, "filiais" 54, como palavra), não 478 e 80.
8. **O cabeçalho de status vale para dois documentos** (`PLANO-PRODUTO-MULTIEMPRESA.md` e
   `SYSTEM-DESIGN-ACERVO-2026-08-31.md`), não um; o SYSTEM-DESIGN carregava "5 das 71" — em 16/09, 62 de 62 chamadas sem
   argumento estão embrulhadas, em 61 policies.
9. **A doutrina colidia com a R-ACC-51** sem fronteira escrita. A R-ACC-71 a escreve: `x is null or …` vale como guarda
   no-op de existência com parâmetro do chamador (até a F67); em policy e RPC de leitura, é proibida.
10. **A "linha de base da F59" que a F66 cita envelhece** com a F60 e a F62. A F66 herda o instrumento, não o número
    (Decisão 8).

## 2.2 O que a execução achou além da ordem

1. `PLANO-MULTIEMPRESA.md:576` citava `docs/README.md:60-64` (o trecho está em `:67-71`) — nota acrescentada.
2. `ARQUITETURA.md:96` e `RUNBOOK-BANCO.md:256-262` descreviam o job de CI como `banco` (Docker, até a `0124`); é
   `banco-sem-docker`, até a `0140` — corrigido com uma linha cada.
3. **A ficha da F67 colide com a da F66**: `pode_escrever_unidade(p_empresa, p_filial)` por `create or replace` manteria
   as policies de escrita chamando função por linha — a catraca não encolheria. A doutrina resolve pela F66 (nota na
   emenda e no plano); `pode_escrever_unidade` fica para o corpo das RPCs.
4. **A ficha da F67 prescreve `(storage.foldername(name))[2] = any(…)`** nas policies de `backups-import`: função sobre a
   linha (R1). Backlog nomeado.
5. **A forma de pares, emulada no `WHERE`, não vira `InitPlan` nem `Hash Semi Join`**: o planejador a puxa para junção
   (`Nested Loop`). No predicado de uma policy ela nunca é puxada — o qual de segurança passa só por
   `preprocess_expression` (`planner.c`, PG 17) — e vira `hashed SubPlan` com 1 loop (emulado por `false or (…)`).
6. `SYSTEM-DESIGN-ACERVO:200` escrevia `unidade_id = any(array(select unidades_de_escrita()))`, que não compila com uma
   função de pares — nota acrescentada.
7. `cobertura-changelog.test.ts` recusa citar fase futura pelo código no `CHANGELOG.md`: a entrada fala da F62/F66/F67 por
   extenso. O primeiro commit da versão (`0e2da66`) saiu com esse teste vermelho, porque a saída do `npm run test` foi
   lida por `tail`, que mascarou o código de saída; `e74d3f9` corrigiu antes de qualquer push.
8. Em produção, `movimentacoes` tinha 3.554 linhas no censo da manhã e 3.555 na medição da tarde — uso real do sistema,
   não escrita desta fase.

## 2.3 O que esta ordem acrescentou à ficha (declarado)

As regras **R2** (função sem dado da linha só em `(select …)`, generalizada para função só com constantes) e **R3**
(sub-select não lê tabela nem olha a linha), as duas nascidas verdes; a **R-setof** no catálogo; o **par no catálogo** e
as **mutações** (decisão ii do Johnny); o **canal SQL de produção** (decisão i); o registro de **TTFB**; a nota no
**ADR-002**; a linha 51 do **README**.

---

# 3. A revisão adversarial (Frente G, passo 2)

Revisores em contexto fresco, contra o `PLAN-F59.md` e os 29 critérios, com as perguntas da ordem; cada achado passou por
um cético instruído a refutá-lo. Ata completa em `docs/DECISOES.md` (16/09, "O que as quatro rodadas…").

| rodada | achado mantido | correção | commit |
|---|---|---|---|
| 1 | a mesa não via DDL de policy com o **verbo parametrizado** (`format('%s policy …', v_verbo)`) nem com a **palavra partida** (`'alter pol' \|\| 'icy …'`) | `execute` em corpo `$…$` só como literal ou `format('<literal>', …)` com `%I`/`%L`; corpo com `execute` que mencione `policy` reprova | `6e59823` |
| 1 | a guarda do `medir-rls.mjs` aceitava **função com efeito colateral** pelo nome (`resetar_acervo`, `pg_advisory_lock`) e não conferia o **valor** de `transaction_read_only` | lista fechada de funções; read-only uma vez e só `on`; uma troca de papel | `6e59823` |
| 2 | `E'drop poli\x63y …'` — a palavra escondida por **escape de E-string** | o léxico decodifica hex/octal/`\u`/`\U`; `U&'…'` e `$tag$` em `execute` reprovam | `740d104` |
| 2 | conferir só o **prefixo** do `execute` deixava passar `select … into` | `execute` por texto exato do modelo; SQL em literal sem `into`/`for`/`share`/`nowait` | `740d104` |
| 3 | o **conteúdo** trocável sem mudar a forma: outra tabela em `v_tabela`, outro SQL em `v_sql`, a identidade afrouxada | o comando tem de ser, byte a byte, o que o script gera para os parâmetros que declara | `b720f49` |
| 4 | — | nenhum achado | — |

Em nenhuma rodada o texto dos comandos reais mudou: os gerados em `b720f49` são, por `cmp`, os executados no ensaio e em
produção. Nenhuma exceção foi alargada, nenhum `skip`, nenhum casador afrouxado. Dois testes antigos de
`predicado-policies.test.mts` passaram de "exatamente N falhas" para "a falha `dinamicamente` na linha 3": o que provam (DDL
dinâmico reprova com arquivo e linha) é o mesmo; a regra nova só acusa o mesmo corpo por mais de um motivo.

**Um incidente fora da revisão, no mesmo intervalo:** as duas edições da R-ACC-70 foram feitas por `String.replace` com um
texto que continha `` $` `` (o padrão que insere o que vem antes do trecho casado), e o começo da matriz duplicou duas
vezes (767 → 2.089 → 4.072 linhas) em `740d104`. Achado pelo tamanho do diff, antes de qualquer push; `6b536a9` voltou o
arquivo ao estado de `d7456ff` e reaplicou as edições por edição literal. Ata própria em `DECISOES.md`.

---

# 4. O que mudou, por arquivo e por quê

| arquivo | mudança | por quê |
|---|---|---|
| `scripts/db/predicado-policies.mjs` (novo, 1.095 linhas) | léxico, replay das policies na ordem do texto, falha fechada para DDL dinâmico, análise R1/R2/R3 por árvore de parênteses, leitura da lista de exceções e do universo congelado do `.sql` | o motor da trava de mesa, sem banco (Decisão 1) |
| `scripts/db/predicado-policies.test.mts` (novo) | 42 testes do motor: léxico, replay (create/alter/rename/drop, `drop table`, `set schema`, a ordem da `0091`), escapes, R1/R2/R3, a lista | o motor provado por partes |
| `src/lib/validators/policies-initplan.test.ts` (novo) | a trava: universo = `k_policies_public` ∪ `k_storage`; falha fechada; a doutrina contra as policies vivas; a catraca; a guarda com SQL sintético em memória (reprova e passa) | Frente C |
| `supabase/tests/catalogo_policies.sql` | `k_policies_public` (53), `k_excecoes_predicado` (18), `k_guarda_esperada`; bloco 4 com `10a`–`14` sobre `pg_policy.polqual`/`polwithcheck`, doze árvores sintéticas | Frente D, decisão ii |
| `supabase/tests/definer_sem_tenant.sql` | nota de cabeçalho "lista irmã, fato diferente" | as duas listas não se confundem (R-ACC-69) |
| `src/lib/validators/catalogos-seguranca.test.ts` | `SIMETRIAS` com os dois arrays novos; describe 10 cobra o formato de cada exceção (chave em 3 partes, migration que existe, destino) | critério 13 |
| `scripts/db/mutacoes.mjs` · `mutacoes.test.mts` | 8 mutações `doutrina-*`, uma por rótulo; teto 75 → 85 | critério 12 |
| `scripts/perf/medir-rls.mjs` (novo, 673 linhas) · `medir-rls.test.mts` | gera comandos `do $f59$ … raise exception` só leitura, confere alvo por ref e pelo banco, valida contra o modelo fechado antes de emitir, analisa as respostas | Frente E, decisão i |
| `docs/MATRIZ-REGRAS.md` | emenda F59 (R-ACC-63 a 72), a forma-alvo para copiar, as afirmações erradas conhecidas, a nota de escopo; R-ACC-32 → 19 | Frente B |
| `docs/PLAN-F59.md` (novo) | o censo antes da régua, as regras, o desenho, as oito decisões, §12 com o SHA e a medição | critério 2 |
| `docs/PLANO-PRODUTO-MULTIEMPRESA.md` · `SYSTEM-DESIGN-ACERVO-2026-08-31.md` | cabeçalho de status nos dois; `:71` por cópia de `:191-197`; nota datada nas "5 das 71" e na forma de unidade | Frente F |
| `docs/ESPECIFICACAO.md` | só o cabeçalho de escopo da ficha | critério 20 |
| `docs/README.md` | sem "ainda não foi decidida"; o catálogo de requisitos; a linha da doutrina no índice; `:51`; F59 nos relatórios | critério 21 |
| `docs/ADR-002-papeis-e-permissoes.md` · `ARQUITETURA.md` · `RUNBOOK-BANCO.md` · `PLANO-MULTIEMPRESA.md` | nota de emenda; a linha da doutrina; o nome do job; a citação `:67-71`, o `setof`, os pares, a colisão F66 × F67 | Frente F |
| `docs/DECISOES.md` | cinco atas datadas | critério 25 |
| `docs/perf/f59-rls-ensaio.json` · `f59-rls-producao.json` · `f59-producao-ttfb.json` | as medições | critérios 16–18 |
| `docs/f59-evidencias/` | A (censo, ocorrências, planejador), B (forma-alvo), C (sabotagens A–E, D), D (calibração do catálogo), E (G), F (CI), G (contagem final e build), H (nós do plano), I (TTFB), J (varredura de dados) | as provas |
| `package.json` · `CHANGELOG.md` · `src/lib/versoes/registry.ts` | 1.64.0 | regra 8 |

---

# 5. O censo — replay × ensaio × produção × CI

| schema · verbo | replay das migrations | `pg_policies` ensaio | `pg_policies` produção | catálogo do CI |
|---|---:|---:|---:|---:|
| `public` SELECT/INSERT/UPDATE/DELETE | 22/14/11/6 | 22/14/11/6 | 22/14/11/6 | **53** nomes (`10a`/`10b`) |
| `storage` SELECT/INSERT/UPDATE/DELETE | 2/2/2/2 | 2/2/2/2 | 2/2/2/2 | **8** nomes (`8a`/`8b`) |
| **total** | **61** | **61** | **61** | **61** (`5`) |

Mesmos 61 nomes nas três primeiras fontes, mesmos verbos, mesmo conjunto de funções por policy; ensaio × produção com
`qual`/`with_check` idênticos e árvores idênticas módulo OID. O CI confere NOMES contra a lista congelada, que a mesa compara
com o replay — igualdade transitiva, por asserção nos dois lados. Calibração do bloco 4 só leitura antes do push, no ensaio
e em produção: **74 árvores, 470 nós, 86 chamadas, 18 ocorrências**, idênticos nos dois
(`D-calibracao-catalogo-ensaio-e-producao.txt`); no CI, os mesmos números nos rótulos (`0 de 470`, `0 de 86`, `0 de 74`).

**A pergunta de planejador** (ensaio, como `postgres`, `A-planejador-ensaio.md`): `(select fn(coluna))` é `SubPlan`
correlacionado com `Actual Loops` = linhas varridas (1.606 em `ativos`, 3.245 em `movimentacoes`); `col = any (array
(select fn()))` é `InitPlan` com 1 loop. O que decide é a correlação, não o embrulho — a `0063:46-57` está certa; a
`0129:66-69` e o `ADR-002:90` estão errados para essa forma.

---

# 6. As oito decisões, com o custo que decidiu cada uma

Por extenso na ata de 16/09 em `docs/DECISOES.md`.

| # | decisão | custo que decidiu |
|---|---|---|
| 1 | **O analisador** — léxico próprio, replay na ordem do texto, dado da linha = coluna em qualquer forma, função = tudo fora de uma lista NOMINAL de construções (built-in e desconhecida incluídas), falha fechada | falso positivo em sintaxe exótica é preferível a falso negativo; o instrumento descartável do censo errou duas vezes por não ter léxico |
| 2 | **As exceções** — por ocorrência, só em `k_excecoes_predicado`, com migration/motivo/destino na linha, catraca nos dois sentidos na mesa e no catálogo | por nome de função, a F66 escreveria `pode_escrever_filial(filial_id)` numa policy nova sem ninguém decidir |
| 3 | **O embrulho e o sub-select** — R2 para toda função sem dado da linha; R3 reprova ler tabela mesmo sem olhar a linha; atribuição única | as duas nasceram verdes, e fecham `tem_papel('admin')` solto e `exists (select 1 from public.membros …)` |
| 4 | **O par no catálogo** — `pg_policy` (árvore), não `pg_policies` (texto); universo congelado; nó desconhecido reprova; doze árvores sintéticas; oito mutações | congelar 53 nomes obriga toda fase que cria policy a tocar o `.sql` — o contrato de `k_storage` |
| 5 | **A forma-alvo** — `setof uuid` × 3 e `table (empresa_id, filial_id)`, `sql stable security definer`, `search_path = ''`, `revoke` + `grant` par | `uuid[]` com cast também funciona, mas seria uma segunda forma canônica |
| 6 | **A medição** — MCP, comando gerado de modelo fechado e aceito só byte a byte, identidade escolhida no banco, RLS provada no plano, N = 9 intercalado | transcrever cada resposta à mão para fora do repositório, em troca de não tocar em token |
| 7 | **Os documentos** — corrigido o vivo e o catálogo de requisitos; apontado o registro; `CLAUDE.md` intocado | a migration `0129` é travada — a correção mora na emenda |
| 8 | **A linha de base da F66** — o instrumento, não o número | a F60 e a F62 mudam o que o número mede |

---

# 7. As oito sabotagens, com a saída real

| | o que se fez | resultado | evidência |
|---|---|---|---|
| **A** | policy sintética em `public.ativos` com `public.e_membro(empresa_id)`; depois a mesma com `empresa_id = any (array (select public.empresas_do_membro()))` | **vermelho** nomeando policy, verbo, cláusula, arquivo:linha, função, argumento e regra; **verde** na forma-alvo | `C-sabotagens-A-a-E.txt` |
| **B** | `(select fn(col))`, `fn((col ->> 'x')::smallint)`, `fn(ativos.filial_id)`, `with check` de INSERT | **vermelho nos quatro**; o do falso içamento com a frase própria ("o `(select …)` em volta NÃO a iça") | idem |
| **C** | `using (public.e_admin())`, `empresa_id = any (public.empresas_do_membro())`, `exists` correlacionado sobre `operador_filiais` | **vermelho** R2, R2, R3 | idem |
| **D** | tirar `public.ativos / operador atualiza / pode_escrever_filial` do array; depois acrescentar exceção sem ocorrência | **vermelho** pelos dois sentidos, nomeando a ocorrência; restaurado com o mesmo sha256 (`7a5244d1…`) e verde de novo | `C-sabotagem-D-catraca.txt` |
| **E** | `execute format('alter policy %I on %I.%I using (%s)', …)` num laço; o verbo parametrizado; a palavra partida; o escape hex; controle com o `execute` da `0124` | **vermelho** por falha fechada com arquivo e linha nos quatro; o controle **verde** | `C-sabotagens-A-a-E.txt` |
| **F** | as oito mutações `doutrina-*` no `banco-sem-docker` | **82/82** detectadas pelo cenário nomeado; cada `doutrina-*` pelo rótulo esperado (`10a`+`10b`, `10c`, `11a`, `11b`, `12`, `13a`, `13b`, `14`) — [run 35113464557](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/35113464557) | `F-sabotagem-par-no-ci-run1.txt` |
| **G** | `--alvo` ausente/inventado, ref trocado, `--dir` no repositório, canal api sem token, e 16 comandos adulterados na fila (update solto, no corpo, no SQL da forma, atrás de `--`; papel `postgres`; sem `raise`; sem read-only; `grant`; `resetar_acervo`; `pg_advisory_lock`; read-only `off`; `select into`; outra tabela; identidade afrouxada; escrita no canal api) | **todos recusados**, nenhum arquivo gravado, `fetch` nunca chamado; controle positivo aceito; a prova da forma-alvo recusada para produção. Sem alvo real | `E-sabotagem-G.txt` |
| **H** | o plano das formas F0–F3 com a RLS valendo, no ensaio e em produção | F1 com `Filter` por linha na própria tabela; F2 com `SubPlan` de 1.606/3.245 (ensaio) e 1.620/3.555 (produção) loops; F3 só `InitPlan` com 1 loop | `H-plano-ensaio-e-producao.md` |

Trecho real da sabotagem A:

```
public.ativos / f59 sabotagem a · SELECT · using (9999_sintetica_f59.sql:1) — R1: a função e_membro(empresa_id) recebe
dado da LINHA, avaliada uma vez por linha. Use "col = any (array (select public.<fn>()))" com função de conjunto, ou
declare a ocorrência "public.ativos / f59 sabotagem a / e_membro" em k_excecoes_predicado com motivo e destino. Veja a
emenda F59 da docs/MATRIZ-REGRAS.md (R-ACC-63 em diante).
```

---

# 8. A medição

## 8.1 O método e o canal

`scripts/perf/medir-rls.mjs`, canal **MCP da Supabase** (`execute_sql`): o script grava os comandos fora do repositório,
eles são executados um a um, as respostas são gravadas ao lado e o script as analisa. Cada comando é um `do $f59$ … $f59$`
que liga `transaction_read_only` antes de tudo, confere o alvo pelo banco (`rotulo_de_ambiente()`: `'desenvolvimento'` no
ensaio, `NULL` em produção), escolhe a identidade DENTRO do banco (perfil ativo, não arquivado, `admin`/`dev`; o id não
sai), mede como `authenticated` com `request.jwt.claims`, e termina em `raise exception` — nada se confirma.
`explain (analyze, buffers, verbose, format json)`, 1 aquecimento por forma, **N = 9** intercalado, mediana e p95 por posto
mais próximo. RLS provada em toda célula: controle negativo (claims sem `sub` → 0 linhas), `papel_atual` no `Output` do
plano, linhas devolvidas = contagem esperada.

Formas, emuladas inline (nada é criado): **F0** a leitura com a RLS de hoje; **F1** `where public.pode_escrever_filial(filial_id)`;
**F2** `where (select public.pode_escrever_filial(filial_id))`; **F3** `where filial_id = any (array (select f.id from
public.filiais f where public.pode_escrever_filial(f.id)))`. Projeções: as da lista real de `ativos` e de `movimentacoes`,
sem `limit`.

## 8.2 Os números (mediana de execução, ms · custo estimado)

| forma | `ativos` ensaio (1.606) | `ativos` produção (1.620) | `movimentacoes` ensaio (3.245) | `movimentacoes` produção (3.555) |
|---|---|---|---|---|
| F0 | 0,68 · 64 | 1,62 · 130 | 1,12 · 293 | 1,92 · 318 |
| F1 | 23,3 · 465 | 43,6 · 708 | 45,2 · 1.102 | 87,7 · 1.192 |
| F2 | 24,3 · 481 | 45,0 · 731 | 47,5 · 1.135 | 94,2 · 1.227 |
| F3 | 1,34 · 86 | 2,13 · 162 | 1,66 · 336 | 2,74 · 365 |
| p95 de F1 / F2 / F3 | 24,5 / 25,8 / 1,39 | 47,2 / 49,4 / 2,53 | 45,5 / 48,1 / 1,69 | 92,2 / 102,4 / 3,33 |

Ensaio sobre `96a6827`; produção sobre o SHA congelado `b720f49` — e os comandos gerados em `b720f49` são, por `cmp`, os
executados nos dois. **Leitura:** o falso içamento é mais lento que a forma por linha nos dois bancos; a forma içada é 17×
a 29× mais rápida no ensaio e 20× a 34× em produção, e a distância cresce com o volume. Produção é ~2× mais lenta que o
ensaio em TODAS as formas, inclusive F0 — compare razões entre formas, nunca absolutos entre bancos. Os nós, célula a
célula: `docs/f59-evidencias/H-plano-ensaio-e-producao.md`.

## 8.3 A persona operador — PENDENTE

O ensaio tem **0** perfis de cargo `operador`, ativos, com vínculo em `operador_filiais` (`F59_IDENTIDADE_AUSENTE`,
registrado em `f59-rls-ensaio.json`), e esta fase não grava nada para criá-lo. Em produção a persona não é medida por
desenho: o escopo medido seria o de uma pessoa real. O caminho do `exists` em `operador_filiais` fica para a F66, no ensaio,
com persona fictícia criada pela própria F66.

## 8.4 TTFB de produção antes do merge

`node scripts/perf/medir.mjs --rotulo f59-producao-antes-do-merge --saida docs/perf/f59-producao-ttfb.json`, 16/09
16:56–16:57 UTC, `1.63.0`/`62c708d` no ar; 2 aquecimentos, 11 rodadas round-robin, 16 rotas, **todas 200**, 0 falha.

| rota | TTFB mediana (ms) | "depois" da F58 (mesmo código) |
|---|---:|---:|
| `/ (dashboard)` | 350,6 | 364,9 |
| `/ativos` | 290,8 | 340,5 |
| `/ativos/[id]` | 314,3 | 377,9 |
| `/movimentacoes` | 285,2 | 343,4 |
| `/movimentacoes/nova` | 271,3 | 320,6 |
| `/itens` | 352,5 | 426,9 |
| `/pendencias` | 346,4 | 373,1 |
| `/ajuda` | 301,4 | 362,9 |
| `/relatorios/geral` | 533,9 | 553,1 |
| `/relatorios/[filial]` | 349,3 | 390,8 |
| `/relatorios/gerados` | 338,2 | 362,3 |
| `/relatorios/gerados/[id]` | 317,4 | 388,5 |

O código no ar é o mesmo do "depois" da F58: a diferença (4% a 18% abaixo) é **ruído entre dias**, e é essa a faixa que a
F66 precisa ter em mente antes de atribuir uma diferença à mudança dela. Saída completa em
`I-ttfb-producao-antes-do-merge.txt`.

---

# 9. A conferência pós-deploy

*Preenchida no PR só de documentação, depois do merge do PR #50: `/api/saude` com `1.64.0` e o commit do merge;
`node scripts/smoke/smoke-prod.mjs` com 0 falha.*

---

# 10. Os 29 critérios, autoverificados

| # | critério | | evidência |
|---|---|---|---|
| 1 | lint, test, build, tsc limpos; `verificar:actions` verde | ✅ | `G-contagem-final.txt` (saídas inteiras): lint 0, tsc 0, 219/5.997, build 0, `[gate] … VERDE` |
| 2 | `PLAN-F59.md` com o censo, ocorrências, documentos e planejador, anterior ao 1º commit de código | ✅ | `a05548e` (plano) antecede `527a1b2` (1º em `scripts/`); coluna do CI acrescentada depois, como a ordem prevê |
| 3 | `policies-initplan.test.ts` existe, lê as migrations na coleta, verde contra 61 | ✅ | describes 1–3 |
| 4 | R1 reprova coluna nua, qualificada, expressão, dentro de `(select …)`, em `public` e `storage.objects`, todo verbo, `using` e `with check`, built-in | ✅ | sabotagem B; guarda describe 4 (inclui "R1 · em storage.objects"); `predicado-policies.test.mts` |
| 5 | R2 reprova função solta e `= any (fn())`; forma-alvo passa | ✅ | sabotagem C.1/C.2 e A.2 |
| 6 | R3 reprova sub-select que lê tabela ou olha a linha; sobre função de conjunto passa | ✅ | sabotagem C.3; guarda describe 4 (pares passa) |
| 7 | DDL dinâmico e comando ilegível reprovam; auto-conferência do replay | ✅ | sabotagem E; describe 2 (138 de 138) |
| 8 | exceções por ocorrência, só no `.sql`, com motivo e destino, conferidas nos dois sentidos | ✅ | `k_excecoes_predicado`; `11a`/`11b`; describe 3; sabotagem D |
| 9 | a guarda cobre os sintéticos da Frente C, reprova e passa | ✅ | describe 4 |
| 10 | asserções no `.sql` com rótulos e FIM, verdes no `banco-sem-docker` | ✅ | run 35113464557: `10a`–`14` verdes, `FIM catalogo_policies: 25 asserções, 0 falhas`; nenhuma regra só na mesa — a atribuição única e a falha fechada textual são da mesa, e o catálogo cobre o mesmo fato pela árvore (`10c`) |
| 11 | universo da mesa = do CI, em número e nomes, com a prova | ✅ | `10a`/`10b` (53), `8a`/`8b` (8) + describe 1; `A-censo-replay-x-catalogo.md` §5 |
| 12 | ≥1 mutação nova por regra, derrubada pelo rótulo; `mutacoes.test.mts` verde | ✅ | 8 mutações, 82/82; `F-sabotagem-par-no-ci-run1.txt` |
| 13 | `catalogos-seguranca.test.ts` cobra o array novo | ✅ | `SIMETRIAS` + describe 10 |
| 14 | emenda com predicado, formas proibidas, função de recorte, forma-alvo (tipo × consumo e pares, provadas), exceções, fronteira R-ACC-51, afirmações erradas, prova de cada regra | ✅ | R-ACC-63 a 72; `B-forma-alvo-ensaio.json` |
| 15 | `medir-rls.mjs` com alvo confirmado pelo banco, só leitura, RLS no plano, identidade sem id; sabotagem G | ✅ | §8.1; `E-sabotagem-G.txt` |
| 16 | `f59-rls-ensaio.json`: F0–F3 × duas tabelas × duas identidades, N ≥ 7, mediana, p95, custo, buffers, nós | ✅ com PENDÊNCIA declarada | admin completo; operador `F59_IDENTIDADE_AUSENTE` (§8.3) |
| 17 | `f59-rls-producao.json` sobre o SHA congelado | ✅ | `sha_codigo` `b720f49…` |
| 18 | TTFB antes do merge; nota da linha de base da F66 no plano, na ata e no backlog | ✅ | `f59-producao-ttfb.json`; `PLAN-F59.md` §12; ata Decisão 8; §13 |
| 19 | `PLANO-PRODUTO:71` por cópia; cabeçalho nos dois; nota nas "5 das 71" | ✅ | `d7456ff` |
| 20 | `ESPECIFICACAO.md` só com o cabeçalho | ✅ | `git diff main -- docs/ESPECIFICACAO.md`: +2 linhas |
| 21 | README sem "ainda não foi decidida", índice, `:51`; ADR-002:90; ARQUITETURA e RUNBOOK | ✅ | `d7456ff` |
| 22 | migrations, lock, `database.ts`, `src/app`, `src/components`, `CLAUDE.md` intactos | ✅ | `git diff --name-only main` não os lista (§4) |
| 23 | nenhuma escrita/DDL em banco de verdade; deriva de tipos com os números da F58 | ✅ | §8.1 (todo comando `transaction_read_only = on` e terminado em `raise exception`; a única gravação foi a sessão do login do `medir.mjs`, encerrada por `signOut`); 34 · 312 · 75 no CI |
| 24 | 1.64.0, CHANGELOG, registry; tag no merge do PR de documentação | ✅ versão · tag no PR de documentação | `0e2da66`/`e74d3f9`; tag: §9 |
| 25 | ata com as oito decisões, divergências e motivos | ✅ | `DECISOES.md`, 16/09 (cinco atas) |
| 26 | este relatório, com o roteiro no topo | ✅ | §1 |
| 27 | dois PRs mergeados com os dois checks verdes; conferência pós-deploy | no PR de documentação | §9 |
| 28 | nenhum dado real; token nunca impresso nem gravado | ✅ | `J-varredura-dados-reais.txt`; o token não foi usado |
| 29 | o estado de repouso | ✅ | §11 |

---

# 11. O estado de repouso — se o projeto parar aqui por dois meses

- **Nada em produção depende desta fase.** Nenhuma policy, função, grant, índice ou tela mudou. O sistema continua
  exatamente como a F58 o deixou, com a mesma velocidade.
- **A trava continua de pé sozinha.** `npm run test` roda `policies-initplan.test.ts` a cada PR (job `verificar`), e o
  `banco-sem-docker` roda o bloco 4 do `catalogo_policies.sql` e as oito mutações. Quem escrever uma policy nova no formato
  lento — ou criar qualquer policy sem decidir o lugar dela no universo congelado — recebe vermelho com o nome da policy,
  a regra e a emenda.
- **O custo de parar:** toda migration nova que crie policy precisa acrescentar o nome a `k_policies_public` (ou
  `k_storage`) — é o contrato; sem isso, `10a` e a mesa reprovam. Isso vale igualmente para uma correção urgente que nada
  tenha a ver com multiempresa.
- **Os números envelhecem, o instrumento não.** `docs/perf/f59-rls-*.json` e o TTFB são fotografia de 16/09; quem voltar
  daqui a dois meses re-roda `medir-rls.mjs` (canal MCP ou, com token no ambiente, a Management API) antes de comparar.
- **A forma-alvo não existe em banco.** As quatro funções de conjunto estão só especificadas; a F62 as cria. Até lá, a
  emenda é contrato escrito, e a prova dela é a emulação no ensaio.
- **As 6 exceções com destino F66 e a 1 com destino F67 ficam paradas** — a catraca não força ninguém a eliminá-las; ela
  só impede que a lista cresça sem decisão e obriga a tirar a linha no dia em que a ocorrência sumir.

---

# 12. O que este relatório NÃO prova

1. **A trava julga a FORMA do predicado, não o que ele autoriza.** Um predicado içado com o conjunto errado
   (`empresas_de_admin()` onde devia ser `empresas_do_membro()`) passa em todas as regras. Isso é trabalho de
   `isolamento_tenant.sql` (F63/F66).
2. **A mesa é sintática; a autoridade é o catálogo.** A mesa lê texto de migration com um léxico próprio; agregado, janela,
   CTE e união dentro de sub-select não passam em nenhum dos dois, mas por motivos diferentes. E a mesa não vê a palavra
   `policy` montada por `chr()` ou lida de tabela num `execute` — o catálogo vê o resultado.
3. **O catálogo do CI é construído das migrations.** Uma policy criada só em produção, por fora delas, só aparece na
   conferência contra `pg_policies` de produção desta fase (idêntica, 61 = 61) — não em CI nenhum.
4. **A medição é das formas EMULADAS no volume de hoje**, não de `empresas_do_membro()`, que não existe; a F60 muda o
   caminho quente dos relatórios e a F62 muda o que `papel_atual()` lê. E ela mede só a identidade de nível
   administrador — a persona operador está PENDENTE.
5. **A forma de pares numa policy real não foi observada**: o contexto de policy foi emulado por `false or (…)`, apoiado
   na leitura do `planner.c`. Só a F66 a verá numa policy de verdade (R-ACC-68, CONFORME-POR-LEITURA).
6. **O TTFB não mede esta fase**: o código no ar era o da F58. Ele é o ponto de partida e a faixa de ruído.
7. **A fronteira com a R-ACC-51 (R-ACC-71) está escrita, não travada**: a trava positiva de parâmetro de recorte é da F60.

---

# 13. Pendências e backlog nomeado

**Pendências desta fase:** a persona operador na medição (§8.3); a conferência pós-deploy e a tag `v1.64.0` (PR de
documentação, §9). **Não há token para girar**: o canal foi o MCP, e `SUPABASE_ACCESS_TOKEN` nunca esteve no ambiente.

**F60** — a trava positiva de parâmetro de recorte das RPCs (`rpcs-recorte-sql.test.ts`, parâmetro obrigatório e não
anulável) e a troca de `(p_filial is null or col = p_filial)` nas `rel_*`; a fronteira com a R-ACC-51 está escrita na
R-ACC-71.

**F62** — criar as quatro funções de conjunto copiando "A forma-alvo, para copiar" da emenda: **`returns setof uuid`**, não o
`uuid[]` que a ficha herdou (R-ACC-67); `sql stable security definer`, `search_path = ''`, `revoke … from public, anon` com
o `grant … to authenticated` par; nenhuma tabela da virada com `force row level security` (R-ACC-72.1). Quem criar policy
nova acrescenta o nome a `k_policies_public`.

**F66** — (1) re-rodar `scripts/perf/medir-rls.mjs` (ensaio e produção) e `scripts/perf/medir.mjs` **imediatamente antes**
de mexer nas policies, e comparar com essa rodada — não com os números da F59; (2) medir a persona operador no ensaio com
persona fictícia; (3) as policies de escrita passam a `empresa_id = any (array (select public.empresas_de_escrita()))` e
`(empresa_id, filial_id) in (select … from public.unidades_de_escrita() u)` — e as **6 exceções** `pode_escrever_filial`
saem de `k_excecoes_predicado` (a catraca obriga); (4) `to authenticated` em toda policy; (5) índice começando por
`empresa_id`; (6) o TTFB re-medido depois; (7) resolver a colisão com a ficha da F67 pela doutrina
(`pode_escrever_unidade` fica para o corpo das RPCs).

**F67** — (1) reescrever "termos leitura operador" sem o falso içamento, e tirar a exceção `pode_ler_arquivo_termo`;
(2) rever as 3 exceções permanentes `pode_escrever_arquivo_termo` ("revistas na F67"); (3) as policies de `backups-import`
não podem usar `(storage.foldername(name))[2] = any(…)` como a ficha prescreve — decidir cada uma como exceção declarada
(decisão sobre o próprio objeto) ou mover a decisão para função nomeada (R-ACC-72.4).

---

# 14. A contagem final e o build

| | começo | fim |
|---|---:|---:|
| policies vivas | 61 | 61 |
| ocorrências policy × função com dado da linha | 18 | 18 |
| exceções | — → 18 | 18 |
| violações | 0 | 0 |
| arquivos de teste / testes | 216 / 5.856 | 219 / 5.997 |

Nenhuma policy mudou: os números do fim são os do começo. A tabela completa, a saída do `npm run test`, do `lint`, do `tsc`,
do `verificar:actions` e o `npm run build` colado por inteiro estão em `docs/f59-evidencias/G-contagem-final.txt`.

# PLAN-F51 — A decomposição da RPC de import

**Data:** 08/09/2026 · **Branch:** `f51-decomposicao-rpc-import` · **Versão alvo:** 1.56.0

Refatoração **pura** de `public.importar_ativos_substituir`: 393 linhas de corpo vivo viram uma
orquestradora fina sobre **oito** auxiliares nomeadas, com comportamento idêntico e assinatura byte a
byte igual. Nenhuma guarda nova, nenhuma mudança de mensagem, nenhum `empresa_id`.

---

## 1. As medições — feitas contra o disco de hoje, antes de escrever qualquer SQL

Onde a minha medição contraria a ficha do `PLANO-MULTIEMPRESA.md §5` ou a ordem de serviço, **vale a
medição**, e a divergência está nomeada aqui.

| # | O que a ficha/ordem dizia | O que eu medi | Como medi |
|---|---|---|---|
| 1 | migration `0130` (ficha) | **`0131`** — a `0130` já existe (`0130_grant_invoker_authenticated.sql`) | `ls supabase/migrations/` → 129 arquivos, última `0130` |
| 2 | 394 linhas (ficha) / 430 (ficha, outro parágrafo) | **393** linhas de corpo (`declare` na 59 → `end $$;` na 451) | `awk` sobre `0094`; a 58 é `as $$` e a 450 é o `)` do `jsonb_build_object` |
| 3 | 7 auxiliares | **8** — as 7 da ficha deixam os blocos 5/5b/5c/5d (78 linhas) sem dono. Ver Decisão 3 | mapa de blocos, linhas 337–414 |
| 4 | 12 asserções no roteiro | **11** asserções + a linha `FIM` (que é contador, não asserção) | saída real do CI: `FIM import_substituir: 11 asserções, 0 falhas` |
| 5 | 41 mutações ativas (fato 6 da ordem) | **39** ativas + 2 em quarentena | `node -e "import('./scripts/db/mutacoes.mjs')…"` → `MUTACOES = 39`, `QUARENTENA = 2` |
| 6 | **cinco** lugares vivos com `delete from public.ativos` fora do import | **quatro** — `resetar_itens` **nunca** apagou de `public.ativos` (só de `lancamentos_item`) | corpo vigente de cada função, resolvido pela regra do `corpo-vigente.mjs` |
| 7 | 38 nomes em `k_secdef` | **38** confirmado (o cabeçalho do próprio arquivo diz 37 — está desatualizado por 1 desde a `0129`) | contagem direta do array, `catalogo_secdef.sql:58-91` |
| 8 | onze cópias integrais | **11** confirmado: `0032 0033 0034 0035 0036 0037 0040 0048 0064 0080 0094` | `grep "create or replace function public.importar_ativos_substituir"` |

### 1.1 Mapa de blocos da `0094` (o insumo das assinaturas)

| Bloco | Linhas | Nº | O que faz | Destino |
|---|---|:-:|---|---|
| 0 | 86–89 | 4 | `v_uid is null` → recusa | **orquestradora** |
| 0b | 91–104 | 14 | `e_admin()` + `errcode 42501` | **orquestradora** |
| 1a | 106–114 | 9 | resolve `v_filial`, recusa filial inexistente/inativa | **orquestradora** |
| — | 116 | 1 | `pg_advisory_xact_lock` | **orquestradora** (Decisão 4) |
| 1b | 118–121 | 4 | backup obrigatório | `import_validar_plano` |
| 1b-bis | 123–127 | 5 | `p_correcoes` é array | `import_validar_plano` |
| 1c | 129–134 | 6 | plano não-vazio → `v_total_plano` | `import_validar_plano` |
| 1d | 136–157 | 22 | validação por ativo (enums, patrimônio) | `import_validar_plano` |
| 1e | 159–178 | 20 | unicidade no plano (2 índices) | `import_validar_plano` |
| 2 | 180–190 | 11 | rede de segurança: termo multi-filial | `import_validar_plano` |
| 2b | 192–222 | 31 | revalidação TOCTOU das contagens | `import_revalidar_contagens` |
| 3 | 224–253 | 30 | 4 DELETEs ordenados (+ janela) | `import_apagar_acervo_filial` (a janela fica no topo) |
| 4a | 265–292 | 28 | `insert into public.ativos` → `v_ativo_id` | `import_criar_ativos` |
| 4b/4c/4d | 294–332 | 39 | compra de abertura, ajuste, sync de posse | `import_lancar_movimentacoes` |
| 5/5b/5c/5d | 337–414 | 78 | conferência pós-insert | `import_conferir_resultado` |
| 5e | 416–425 | 10 | conta conflitos entre filiais | `import_contar_conflitos` |
| 6 | 427–439 | 13 | insert em `import_logs` → `v_log_id` | `import_gravar_trilha` |
| — | 441–450 | 10 | `jsonb_build_object` (8 chaves) | **orquestradora** |

### 1.2 O que a decomposição NÃO pode perder

- O **resíduo do item N** (linha 200, `if p_contagens is not null and jsonb_typeof(…) = 'object'`,
  bloco de 23 linhas até a 222) sai do corpo NOVO. As 11 cópias históricas **não se tocam**.
- `v_conferidos` é escrita **duas vezes** com propósitos diferentes (206 na revalidação, 341 na
  conferência). Na decomposição elas viram variáveis de **funções diferentes** — o compartilhamento
  acidental some, e isso é ganho, não mudança de comportamento.
- `created_at` de `movimentacoes` é `default now()` = **hora da transação**: todas as linhas de um
  import têm o **mesmo** `created_at`, e `id` é `gen_random_uuid()`. **Nenhuma das duas chaves de
  desempate de `rel_estoque_asof` carrega a ordem de inserção.** O que depende de ordem é o
  **trigger** `trg_aplicar_movimentacao`, que deriva o estado do ativo linha a linha. Ver Decisão 2.

---

## 2. As assinaturas desenhadas

Todas: `language plpgsql` (exceto onde dito), `security definer`, `set search_path = public`,
`revoke all on function … from public, anon, authenticated, service_role`.

```
-- topo: assinatura BYTE A BYTE igual à da 0094
public.importar_ativos_substituir(p_plano jsonb, p_backup_path text,
                                  p_contagens jsonb, p_correcoes jsonb default '[]'::jsonb)
  returns jsonb

public.import_validar_plano(p_plano jsonb, p_backup_path text, p_correcoes jsonb,
                            p_filial smallint) returns int      -- devolve v_total_plano
public.import_revalidar_contagens(p_contagens jsonb, p_filial smallint) returns void
public.import_apagar_acervo_filial(p_filial smallint,
                                   out o_movs int, out o_anotacoes int,
                                   out o_termos int, out o_arquivos text[])
public.import_criar_ativos(p_elemento jsonb, p_filial smallint) returns uuid
public.import_lancar_movimentacoes(p_ativo uuid, p_elemento jsonb, p_filial smallint,
                                   p_uid uuid, p_data date, p_obs text) returns void
public.import_conferir_resultado(p_plano jsonb, p_filial smallint,
                                 p_criados int, p_total int) returns void
public.import_contar_conflitos(p_filial smallint) returns int
public.import_gravar_trilha(p_plano jsonb, p_filial smallint, p_backup_path text,
                            p_correcoes jsonb, p_uid uuid, p_criados int, p_movs int,
                            p_anotacoes int, p_termos int, p_conflitos int) returns uuid
```

`import_criar_ativos` e `import_lancar_movimentacoes` são chamadas **uma vez por ativo**, pelo laço
da orquestradora. O nome no plural é o da ficha; o `comment on function` diz isso por escrito, para
que ninguém leia "plural" como "recebe o plano inteiro" e reintroduza a segunda passagem que a
Decisão 2 recusa.

---

## 3. As seis decisões — tomadas antes de escrever SQL

### Decisão 1 — as auxiliares nascem `SECURITY DEFINER`

**Medido.** `catalogo_secdef.sql` cobra de toda `security definer`: estar em `k_secdef` (1a), existir
e continuar definer (1b), `search_path` travado (3) e **não ser executável por `anon`** (4). Repare:
ele **não** cobra `authenticated` nem `service_role`. `seguranca_catalogo.sql` asserção 1 varre um
array FIXO de 3 assinaturas de RPC de escrita e exige `authenticated=EXECUTE` — as auxiliares não
entram ali, porque para elas o esperado é o oposto.

A favor de INVOKER: dentro de uma `SECURITY DEFINER` o `current_user` já é o dono, então uma auxiliar
INVOKER roda com os mesmos privilégios; e ela encolheria a superfície mais concentrada de poder do
banco em vez de crescê-la em oito.

**Escolha: DEFINER.** O contrato desta fase é "nenhuma mudança de comportamento, nunca em silêncio".
DEFINER preserva a semântica de privilégio da função de hoje **em qualquer contexto de chamada,
presente ou futuro**. INVOKER faz a semântica depender de quem chama — uma propriedade que hoje **não
existe** — e o dia em que a orquestradora, ou um chamador novo, deixar de ser definer, as oito mudam
de comportamento sem uma linha de diff. Extrair código não pode introduzir dependência de contexto
que o código não tinha. O que protege as auxiliares continua sendo o `revoke`, nos dois desenhos.

**Consequência declarada:** `k_secdef` vai de **38 para 46**, no mesmo commit da migration.

### Decisão 2 — a orquestradora MANTÉM o laço e chama as duas auxiliares por ativo (opção **a**)

**Medido, e a medição muda o argumento da ordem.** A ordem teme que duas passagens mudem `created_at`
e o `id desc` do desempate de `rel_estoque_asof`. Medição: `movimentacoes.created_at` é
`default now()` — **hora da transação**, idêntica para todas as linhas de um mesmo import — e `id` é
`gen_random_uuid()`. Nenhuma das duas carrega ordem de inserção. O desempate real de
`rel_estoque_asof` cai em `data desc` e `(tipo='ajuste') desc`, que vêm do dado, não da ordem física.

**O que depende de ordem de verdade é o trigger** `trg_aplicar_movimentacao` (`0004:135`): ele deriva
`ativos.status` a cada linha inserida, e o bloco 4d (`update` de `colaborador_atual`/`setor_atual`)
roda **depois** do 4c de propósito — invertê-los deixaria o trigger do ajuste pisar na posse.

Opção (c) (duas passagens) exigiria carregar os `id` gerados entre as passagens e **provar** a ordem
por cenário. Opção (a) dá equivalência **por construção** e não precisa de prova nenhuma.

**Custo medido de (a):** duas chamadas de função plpgsql por ativo. O import de startup roda uma vez
por filial na janela de go-live, e a planilha maior é da ordem de mil linhas → ~2.000 chamadas de
função numa operação que já faz 2.000–4.000 statements DML e quatro DELETEs de acervo. É ruído no
relógio de uma operação que roda cinco vezes na vida do sistema. **Não descarto (a) por desempenho.**

O bloco 4d (sync de posse) fica dentro de `import_lancar_movimentacoes` — não porque seja
movimentação, mas porque **tem de vir depois do 4c**, e é a única colocação que preserva isso sem
espalhar a regra por dois lugares. Escrito no `comment on function`.

### Decisão 3 — a conferência VIRA a oitava auxiliar (`import_conferir_resultado`)

Os blocos 5/5b/5c/5d são **78 linhas** (337–414), o trecho mais denso do corpo, com um
`except`/`union all` de 40 linhas. A lista de sete da ficha os deixa sem dono.

O argumento contra extrair — "verificação que sai da função que orquestra é verificação que alguém
esquece de chamar" — **está respondido pela trava desta mesma fase**: ela afirma que a orquestradora
**referencia cada auxiliar pelo nome**. Uma chamada esquecida derruba `npm run test` sem banco. O
risco que justificava manter os 78 na orquestradora deixou de existir no momento em que a trava
passou a existir.

**Extraio.** `k_secdef` 38 → 46 (e não 45).

### Decisão 4 — o `pg_advisory_xact_lock` fica na orquestradora, pela mesma régua da janela

Os dois são efeitos **locais à transação** que um leitor precisa ver na função que orquestra. Um lock
tomado dentro de `import_validar_plano` continuaria valendo (é `xact`), então isto é legibilidade e
superfície, não correção — mas serialização escondida dentro de um validador é exatamente o tipo de
fato que some numa releitura.

**Consequência de ordem, declarada:** hoje a sequência é [resolve filial] → [lock] → [backup] → …
Com o lock no topo ela continua **idêntica**, porque a orquestradora resolve a filial (bloco 1a) e
trava **antes** de chamar `import_validar_plano`. Nenhuma recusa muda de posição.

### Decisão 5 — a trava mora em `src/lib/validators/import-uma-porta.test.ts`

**Medido empiricamente**, porque a ordem manda medir e não supor:

```
$ cat > src/lib/validators/__sonda-tsc.test.ts   # importa ../../../scripts/db/corpo-vigente.mjs
$ npx tsc --noEmit     → sem erro
$ npx vitest run …     → 1 passed
```

`tsconfig.json` inclui `**/*.ts` e `allowJs: true` com `moduleResolution: bundler`, então o import
relativo de `.mjs` a partir de `src/` **resolve e tipa**. Logo a restrição técnica que empurraria o
arquivo para `scripts/db/` não existe, e vale a convenção da casa: `src/lib/validators/` é onde já
moram `migrations-lock.test.ts`, `transicoes-sql.test.ts`, `detentor-sql.test.ts` e
`tipos-item-sql.test.ts`. O nome do arquivo é o da ficha.

**Reuso `corpoVigente()`**, e isso é uma mudança de hábito consciente: os quatro validadores de hoje
**reimplementam** o resolvedor inline (medido — nenhum importa de `scripts/`). O cabeçalho do
`corpo-vigente.mjs` diz, por escrito, que existe **para esta fase**. Uma quinta reimplementação seria
a segunda fonte do mesmo fato, que é como um gate morre.

### Decisão 6 — `database.ts` por **hand-fix nominal**, e o motivo é ambiental

Os caminhos, na ordem de preferência da ordem de serviço:

- **(i) aplicar em produção e regenerar** — **indisponível nesta sessão.** Medido: não há MCP
  Supabase conectado (`ToolSearch` por `apply_migration`/`execute_sql` não devolve nada), não há
  `psql`, não há Docker e não há `DATABASE_URL`. E, mesmo houvesse MCP, o **gate do modo automático
  bloqueia DDL que contenha `delete from public.ativos`** (`RUNBOOK-BANCO.md:45`) — a `0131` contém,
  em `import_apagar_acervo_filial`. O apply desta migration é **caminho B por construção**, não por
  azar de sessão.
- **(ii) hand-fix nominal** — **é o caminho.** Precedente registrado em `DECISOES.md:448`.
  Acrescento as 8 entradas ao bloco `Functions` do `database.ts` com comentário datado dizendo que
  foi à mão e por quê. O gate `db:types:diff` compara **conjuntos de nomes** e reprova só quando o
  BANCO tem o que o arquivo não tem (`tipos-conjuntos.mjs:156`) — o hand-fix nominal satisfaz o gate
  exatamente, porque o que ele exige é o **nome**, não a forma dos argumentos.
- (iii) não mergear — desnecessário: (ii) resolve.

---

## 4. A ordem de entrega

1. ✅ Medir e escrever este plano.
2. ✅ Rodar `import_substituir.sql` contra o corpo de HOJE → `docs/f51-evidencias/roteiro-import-ANTES.txt`
   (CI run 34239718796; **11 asserções, 0 falhas**). Sem Postgres na mesa, o CI **é** o runner.
3. A trava (frente 3), nascendo **VERMELHA**, com a saída guardada.
4. A migration `0131` + `npm run db:lock` + `k_secdef` no MESMO commit.
   ⚠ **E as duas mutações reapontadas no mesmo commit**, obrigatoriamente: `mutarFuncao()` roda no
   **import do módulo** `mutacoes.mjs`, não lazy. No instante em que a `0131` mover os dois trechos,
   `trocarNoCorpo` lança e derruba o carregamento inteiro do catálogo — `mutacoes.test.mts` **e**
   `npm run db:test:mutations` param de rodar por completo. Não é "quebra uma mutação": é o lote todo.
5. Seção 0 do roteiro + as 6 mutações novas + teto de mutações.
6. Comparação antes × depois pelo CI.
7. Handoff do apply em `scratchpad/` (caminho B) e a pendência nomeada.
8. Frente 5: **ata só** — a F36/`0110` já entregou `status_tem_detentor()`. Ver §5.
9. Matriz, dívida X, CHANGELOG, versão, tag, ata, relatório, PR.

## 5. Frente 5 — resolvida por medição, sem código

A ficha manda extrair `tipos_que_zeram_detentor()`. **A F36/`0110` já entregou o item com outro
nome**, e criar uma terceira função para o mesmo fato seria o defeito, não a entrega:

- `public.status_tem_detentor(public.status_ativo)` — `0110:46-50`, `comment on function` em
  `0110:52-53` se declarando *"fonte única do zeramento"*.
- `rel_estoque_asof` a chama nas **duas** expressões de detentor: `0110:294` (colaborador) e
  `0110:300` (setor).
- Protegida por `src/lib/validators/detentor-sql.test.ts`, que afirma a igualdade TS↔SQL sobre todo
  o enum.
- `status_apos_movimentacao` (vigente em `0109:38-62`) **não contém lista de tipos que zeram
  detentor** — ela mapeia `(estado, tipo) → estado`. Não há duas listas para pôr lado a lado porque
  não há duas listas: a `0110` eliminou as quatro cópias manuais que existiam antes dela.

**Entrega da frente: a ata, com as linhas citadas. Zero linhas de código.**

## 6. O teto de mutações

39 ativas hoje. As 2 do import são **reapontadas** (não somam) e nascem 6 novas — uma para cada
auxiliar cuja quebra derruba um rótulo: `import_apagar_acervo_filial`, `import_criar_ativos`,
`import_lancar_movimentacoes`, `import_conferir_resultado`, `import_contar_conflitos`,
`import_gravar_trilha`. **39 + 6 = 45**, acima do teto de 44 de `mutacoes.test.mts:83`.

O teto sobe para **48**, com o motivo escrito no próprio teste, como a linha da F48 manda ("Se a
F51/F52 precisarem de mais, sobem o número E escrevem por quê"). 48 e não 45: a F52 acrescenta
guardas e vai precisar de folga, e um teto colado no número de hoje só força outra decisão daqui a
uma semana.

⚠ Três das seis novas só derrubam rótulo se a **seção 0** montar o cenário — `import_conferir_resultado`
nunca lança no caminho feliz, e `import_contar_conflitos`/`import_gravar_trilha` não têm asserção
própria hoje. Sem a seção 0, essas mutações seriam "não detectadas" por conjunto vazio, que é
exatamente o defeito que o injetor existe para acusar.

## 7. Reversão (a ordem é o inverso da de apply)

1. `create or replace public.importar_ativos_substituir(...)` com o corpo **monolítico da `0094`**;
2. **só então** `drop function` das 8 auxiliares.

O inverso derrubaria as auxiliares enquanto a orquestradora nova ainda estivesse no ar. Não toca dado.

## 8. Fora de escopo (registrado, não feito)

- Qualquer guarda nova (F52), `empresa_id` (F56), vocabulário como dado.
- **Achado para o backlog da F52:** `cargo_dev.sql:242` (`1d`) e `papeis_rls.sql:963` (`3i`) chamam a
  RPC do import com `exception when others` cujo ramo final trata **qualquer** erro — inclusive
  `42883 function does not exist` — como "passou pela guarda". Se um dia a assinatura mudar, as duas
  ficam **verdes por engano**. Nesta fase a assinatura não muda e `seguranca_catalogo.sql` asserção 1
  cobre o caso, então é backlog, não bloqueio. **Não corrijo aqui**: fortalecer asserção alheia é
  mudança de comportamento de roteiro no meio da única prova de equivalência que esta fase tem.
- Backlog herdado: comentário morto em `scripts/gen-types.ts`; exclusão `_%` em
  `supabase/ci/impressao-schema.sql`.

# PLAN-F52 — As guardas de escopo no-op

**Data:** 08/09/2026 · **Versão alvo:** `1.57.0` · **Migration:** `0132` · **Branch:** `f52-guardas-de-escopo`

Pôr dentro do Postgres as guardas de **pertencimento** que hoje não existem, todas escritas de
forma que, com uma empresa só, **não mudam nada**. Nenhum `empresa_id`, nenhuma tabela de
tenant, nenhum `force row level security`, nenhuma dependência nova.

---

## 1. As medições de partida (refeitas, não herdadas)

Tudo abaixo foi medido contra o disco e contra os dois bancos em 08/09/2026, antes da primeira
linha de código. A evidência bruta está em `docs/f52-evidencias/00-medicoes-de-partida.md`.

| O quê | A ordem supunha | **Medido** | Veredito |
|---|---|---|---|
| Próxima migration | `0131` (ficha) / `0132` (prompt) | **`0132`** | prompt certo; ficha desatualizada |
| Versão | — | `1.56.0` → **`1.57.0`** | ok |
| `exigir_gestao_de` | "ganha escopo" | **já existe** (`0074:72`) | insere-se UMA linha, não se cria a função |
| `existe_outro_admin_ativo` | "parâmetro hoje ignorado" | **não tem parâmetro nenhum de escopo** (`0074:126`) | o parâmetro nasce agora |
| `k_secdef` | 37 (ficha) | **46** | ficha desatualizada em 9 |
| `security definer` fora do `k_secdef` | — | **0** — os conjuntos batem nos dois sentidos | catálogo íntegro |
| Mutações ativas / teto | 47 / 48 | **47 / 48** | confere |
| Quarentena | 2, fase F52 | **2, ambas F52** | confere |
| Roteiros SQL | "25+" | **30** (29 rodados; `_asserts.sql` é biblioteca) | — |
| `conflito_filiais.sql` | 37 asserções | **37** rótulos ✓ | confere |
| `colaborador_chave` | exceção da trava (ficha) | **não é `security definer`** (`0112:89`, `language sql immutable strict`) | a exceção não existe |
| `arquivo_hash` | "nunca lida" | **escrita** em `0131:658` e `importar.ts:484`; **nenhuma leitura** | confere |
| `plataforma_admins` | — | **não existe no schema** | Decisão 2 |
| Postgres na mesa | — | **sem `psql`, sem `DATABASE_URL`** | o CI é o Postgres |
| `gh` | "pode não estar no PATH" | **presente, 2.96.0** | — |

### Os dois bancos

| Projeto | ref | status | `security definer` | auxiliares `import_*` |
|---|---|---|---|---|
| Produção | `pbtjcalbmepmrqzprusb` | ACTIVE_HEALTHY | **38** | **0** |
| Ensaio | `sgmvldiizsrjbxzzpmhh` | **ACTIVE_HEALTHY** | **37** | **0** |

- **A `0131` não está aplicada em nenhum dos dois.** O `🚧` do CHANGELOG é real, e a ordem
  obrigatória vale: `0131` e `0132` vão na mesma janela, na ordem, ou nenhuma vai.
- Produção tem exatamente as 38 do estado `0130`. Ensaio está **uma atrás**: falta
  `pode_ler_arquivo_termo` (`0129`).
- **Divergência a favor:** o ensaio está **ACTIVE**, ao contrário do que a ordem previa
  (INACTIVE nas F36/F37/F50). Ele é usável para `begin; … rollback;`.

### Duas medições que mudam o desenho

**(i) `p_confirmacao text default null` É assinatura nova.** Provado no ensaio: acrescentar
parâmetro com `default` produz **duas** funções (`f(integer)` e `f(integer,text)`). A ficha
afirma o contrário no item 6. Um overload aqui quebraria `seguranca_catalogo.sql:94` (que
resolve `importar_ativos_substituir(jsonb, text, jsonb, jsonb)` por `to_regprocedure` e espera
1 linha).

**(ii) O caminho ingênuo do parâmetro de escopo quebra três RPCs.** Provado no ensaio: com a de
1 argumento e a de 2-com-default coexistindo, a chamada de 1 argumento levanta
**`42725 function … is not unique`**. `existe_outro_admin_ativo(p_alvo)` é chamada em
`0074:176`, `0074:220` e `0074:319` — as três quebrariam em tempo de execução.

---

## 2. As sete decisões

### Decisão 1 — Onde `mesmo_escopo_de_gestao` entra em `exigir_gestao_de`

**Escolha: depois da checagem de existência (`P0002`), antes do ramo de cargo (`v_toca_dev`).**

O corpo de hoje (`0074:82-110`) tem quatro blocos nesta ordem: sessão → autoproteção → leitura
do perfil do alvo (`P0002` se não existe) → ramo de cargo (`e_dev()` / `e_admin()`).

Motivo:
1. **Reusa `v_papel_alvo`, já lido.** Entrar antes obrigaria `mesmo_escopo_de_gestao` a reler
   `profiles` — e na F65 ela vai precisar da linha do alvo de qualquer jeito.
2. **A mensagem do alvo inexistente continua sendo "Usuário não encontrado" (`P0002`).** Se a
   guarda entrasse antes, um id inexistente passaria a responder "não pertence à sua
   organização" — mais discreto, mas mentiroso, e mudaria uma mensagem que hoje é correta.
3. **Pertencimento decide antes de cargo.** Entrar depois do ramo de cargo faria um admin de
   outra empresa ler "Esta ação é restrita a administradores" — falso, e mandaria investigar a
   coisa errada. É o mesmo raciocínio que `erros.ts:245-248` já registra para a mesa de conflitos.

### Decisão 2 — Como a conta de plataforma entra em `existe_outro_admin_ativo`

**Mecanismo: `drop` da de 1 argumento, `create` da de 2 com `p_escopo uuid default null`.**

Provado acima que o caminho ingênuo produz `42725`. Com o `drop` antes, as três chamadas de um
argumento (`0074:176,220,319`) **resolvem para a nova com `p_escopo => null`** — e nenhuma das
três RPCs precisa ser recriada, o que mantém o diff da `0132` no que a fase promete.

**Semântica hoje:** `p_escopo is null` significa **"sem recorte"** — conta exatamente o mesmo
conjunto de hoje (`papel in ('dev','admin') and ativo and excluido_em is null and id <> p_excluindo`).
O predicado de escopo entra em **conjunção guardada**: `(p_escopo is null or <predicado F65>)`.
Hoje o `<predicado F65>` não existe, então o corpo é o de hoje mais um parâmetro aceito e
documentado.

**O risco que o plano nomeia, fechado por construção:** escopo nulo **não** pode fazer a
comparação virar NULL e a RPC recusar tudo. Por isso o predicado é `p_escopo is null or …`, e
**nunca** `empresa_id = p_escopo`. Há asserção dedicada provando que, com `p_escopo => null`, a
função devolve o mesmo booleano da chamada de um argumento.

**A conta de plataforma:** `plataforma_admins` **não existe no schema** (medido). A recomendação
da ficha — excluí-la do denominador — não é implementável hoje sem inventar a tabela, o que é
escopo da **F65**. Fica registrado no cabeçalho do roteiro e na ata: quando a conta de
plataforma existir, ela **não** conta como "outro administrador" de uma empresa, porque um
sistema cujo único administrador é o operador da plataforma está, para aquele cliente, sem
administrador.

**Os TRÊS contadores.** O escopo entra **só no lado SQL** nesta fase:

| Camada | Onde | Conta | Ganha escopo agora? |
|---|---|---|---|
| SQL | `existe_outro_admin_ativo` (`0074:126`) | `papel in (dev,admin)`, `ativo`, `excluido_em is null` | **sim** (parâmetro) |
| TS puro | `existeOutroAdminAtivo` (`validators/admin.ts:179-181`) | não filtra — confia na lista recebida | não |
| Leitura | `idsDeAdminsAtivos` (`queries/admin.ts:206-216`, service role) | `.in('papel',[admin,dev]).eq('ativo',true).is('excluido_em',null)` | não |

Motivo: os três contam **o mesmo conjunto hoje** (medido). Dar escopo ao TS exigiria a coluna
que a F62 cria. A divergência é **declarada** aqui e fechada na **F65**, quando o recorte
descer para `idsDeAdminsAtivos` — que é o ponto certo, porque é lá que a lista nasce.

### Decisão 3 — Como a confirmação digitada chega à RPC

**Escolha: (b) — a confirmação viaja dentro de `p_plano`.** Assinatura byte a byte igual.

Custo de cada saída, medido:

| Saída | Custo |
|---|---|
| (a) `drop` + `create` de 5 args | Overload provado; obriga a atualizar `seguranca_catalogo.sql:94`, o bloco pós-apply do runbook, `catalogo_secdef.sql` e `database.ts`, mais `notify pgrst`. Um `drop` de RPC alcançável por `authenticated` **perde o grant** e reabre a janela em que a API responde 404 |
| **(b) dentro de `p_plano`** | **Zero mudança de assinatura.** `p_plano` já carrega `arquivoHash` (`0131:658`) e `filialId` — carregar `confirmacao` é o mesmo mecanismo. `create or replace` puro preservado |
| (c) não fazer | Deixa a única das três destrutivas cuja confirmação para na Server Action |

**Régua de normalização: `upper(btrim(coalesce(…, '')))`, nos dois lados.** É a régua da casa —
8 ocorrências em `0082`/`0083`/`0087`/`0089`. A TS hoje usa **igualdade exata** contra
`filial.nome` (`importar.ts:349`). `upper(btrim())` é **estritamente mais permissiva** que a
igualdade exata: tudo que a TS aceita hoje, a nova régua aceita. Logo a mudança **não pode
recusar operação legítima** — que é o critério 23. A função gêmea TS e a expressão SQL são
provadas equivalentes por teste.

### Decisão 4 — Onde `exigir_ativos_da_empresa` entra na mesa de conflitos

**Escolha: logo depois da etapa 3 do lock (`0100:220`), antes da revalidação do grupo (`0100:223`).**

Ordem medida da `0100`: advisory lock `:194` → etapa 1 (trava os selecionados por id) `:199-202`
→ etapa 2 (lê as chaves já sob trava) `:205-210` → etapa 3 (trava o resto do grupo) `:214-220` →
revalidação `:223-253` → … → janela `estoque.dev_destrutivo` abre `:322` → `delete` `:346`.

Motivo:
1. **Depois da etapa 3 é obrigatório**, porque a guarda faz **leitura própria de `public.ativos`** —
   antes disso o grupo não está todo travado, e ler linha não-travada é a porta do TOCTOU que a
   `0098` fechou.
2. **Antes da revalidação** porque pertencimento é uma recusa mais fundamental que "não está mais
   em conflito": um ativo de outra empresa deve responder "não pertence", não "não está em
   conflito".
3. **Fora da janela `estoque.dev_destrutivo`** (que só abre em `:322`) — a guarda não tem efeito
   a desarmar, e a janela continua com exatamente as portas que tinha.
4. **Extraída, não inline**, porque a RPC é recriada em cadeia (`0093`→`0098`→`0100`) e guarda
   inline se perde na próxima recriação — que é o mecanismo causal que a F51 documentou.

### Decisão 5 — A forma de `definer_sem_tenant.sql`

**Escolha: híbrido — universo DERIVADO do catálogo, comparado nos DOIS sentidos contra uma lista
NOMINAL classificada com motivo escrito por função.**

O inventário das 46 decide: **21** recebem id do cliente **e** são alcançáveis por
`authenticated`; **12** recebem id mas estão fechadas nos quatro papéis (8 são as auxiliares do
import); **13** não recebem id.

Nem lista pura nem derivação pura servem:
- **Lista pura** envelhece — a ficha a desenhou contra um inventário de 37 que hoje tem 46.
- **Derivação pura** produz **falso positivo de recusa** em `estorno_item_coerente` (`0068:86`)
  e `termo_ancora_coerente` (`0069:349`): as duas recebem id, são alcançáveis, e **sozinhas não
  protegem nada** — a autorização real está **ANDada ao lado, na mesma expressão da policy**.
  Reprovar as duas seria reprovar código seguro. E erra por **falso negativo** em
  `pode_escrever_arquivo_termo`, que não chama nenhuma primitiva: **delega** para
  `pode_escrever_termo()`.

Forma final, copiando o desenho que `catalogo_secdef.sql` já validou:
- **(i)** o universo sai de `pg_proc where prosecdef` em `public`, filtrado por "recebe id do
  cliente" — `uuid`, `smallint` de filial **e `text` de caminho/nome** (`p_backup_path`,
  `pode_escrever_arquivo_termo(p_nome text)`) — e por `has_function_privilege('authenticated', …)`.
- **(ii)** contra uma lista nominal `k_escopo_ok` (as que se defendem, por corpo ou por
  delegação) e `k_escopo_excecao` (as exceções, **uma linha por função, com o motivo E a
  migration que a criou na mesma linha**), exatamente o que
  `src/lib/validators/catalogos-seguranca.test.ts` já cobra dos catálogos da F48.
- **Reprova por função NOMEADA, nunca por prefixo** — as cinco RPCs de conta citam
  `exigir_gestao_de` e passariam verdes por um critério de prefixo `exigir_`.

**A exceção que a ficha nomeia não existe:** `colaborador_chave` **não é `security definer`**
(`0112:89`, `language sql immutable strict`). Ela sai da lista de exceções por não pertencer ao
universo.

### Decisão 6 — As duas entradas da quarentena

Decidida na implementação da Frente D, com o motivo escrito. Ponto de partida medido: as duas
são de `conflito_filiais.sql` — serialização por advisory lock e backup em arquivo acima de 25
ativos. A de **serialização não é escrevível como roteiro** (`begin; … rollback;` num `psql` só
não abre segunda conexão): ou vira harness em Node com dois `psql`, ou é reapontada **com o
motivo escrito**. Reapontar em silêncio é mover uma promessa.

### Decisão 7 — A idempotência por `arquivo_hash`

**Onde:** dentro de `import_validar_plano` — que **já recebe `p_plano` e `p_filial`** e já é o
lugar de "tudo o que se recusa antes de escrever" (`0131:119`). Nenhuma assinatura muda.

**Como:** `p_plano->>'arquivoHash'` (a chave já existe e já é lida em `0131:658`; a TS a valida
em `importar.ts:98`) contra `import_logs` da **mesma filial**, `modo = 'substituir'`, nas
últimas **24 h**. Mensagem própria, **lexicalmente disjunta** das existentes.

**Índice:** `(filial_id, arquivo_hash, criado_em desc)` — a consulta é exatamente por essa tripla.

**A coluna na string de `queries/import-logs.ts:294`:** **entra**. Sem ela a tela não mostra o
que a guarda usou para recusar, e o operador não tem como conferir se o arquivo é mesmo o mesmo.

---

## 3. O que entra, arquivo por arquivo

### Frente A — as guardas de conta
- `0132`: `mesmo_escopo_de_gestao(p_alvo uuid) returns boolean` — devolve `true` hoje,
  `stable`, `security definer`, `set search_path = public`, **revogada dos quatro papéis**
  (o estado final de `exigir_gestao_de` e `existe_outro_admin_ativo` depois da `0078`).
- `0132`: `exigir_gestao_de` recriada — **só a guarda nova** entre `P0002` e `v_toca_dev`.
- `0132`: `drop` + `create` de `existe_outro_admin_ativo(p_excluindo uuid, p_escopo uuid default null)`.
- `cargo_dev.sql`: par positivo para `definir_vinculos_usuario`; `1d` passa a distinguir
  `42883`/`42P01` de recusa; asserções de privilégio e de presença da guarda nas cinco RPCs.
- `papeis_rls.sql`: `3i` idem.

### Frente B — o import
- `0132`: `prefixo_backup_import(p_filial smallint)` no molde de `prefixo_backup_reset`.
- `0132`: `import_validar_plano` recriada — cascata de três guardas do backup (`22023`),
  confirmação digitada, idempotência por `arquivo_hash`.
- `0132`: `importar_ativos_substituir` recriada — **só** `pode_escrever_filial(v_filial)` em
  conjunção com o `e_admin()`, entre a resolução da filial e o advisory lock.
- `0132`: índice de `import_logs`; `comment on column eventos_admin.detalhe` corrigido.
- `src/lib/actions/importar.ts`: caminho do backup por **id**; confirmação dentro de `p_plano`;
  comentário `:35-36` corrigido.
- `src/lib/validators/importar.ts`: a gêmea TS da normalização.
- `src/lib/actions/erros.ts`: ramos novos com frase disjunta; comentário `:260-262` corrigido.
- `src/lib/queries/import-logs.ts`: `arquivo_hash` na string.

### Frente C — a mesa
- `0132`: `exigir_ativos_da_empresa(p_ids uuid[])` e `apagar_ativos_conflito_filiais` recriada —
  **só a chamada nova**, depois da etapa 3.

### Frente D — a trava, a régua e o rig
- `supabase/tests/definer_sem_tenant.sql` (novo) · `supabase/tests/import_fora_da_unidade.sql` (novo).
- `catalogo_secdef.sql`: as funções novas no `k_secdef`, nos dois sentidos.
- `conflito_filiais.sql`, `import_substituir.sql`, `cargo_dev.sql` estendidos — **par
  recusa/aceita para cada guarda**.
- `scripts/db/mutacoes.mjs`: uma mutação por guarda, com sonda `prova`.
- `docs/RUNBOOK-BANCO.md`: "Três exigências que não se negociam", entre "Aplicar uma migration" e
  "Rollback".

---

## 4. A ORDEM DE ROLLBACK (regra 10 do §4)

Inverso da ordem de apply, **de baixo para cima**:

1. `apagar_ativos_conflito_filiais` ← `create or replace` com o corpo da `0100`.
2. `importar_ativos_substituir` ← `create or replace` com o corpo da `0131`.
3. `import_validar_plano` ← `create or replace` com o corpo da `0131`.
4. `exigir_gestao_de` ← `create or replace` com o corpo da `0074`.
5. `existe_outro_admin_ativo` ← `drop` da de 2 args, `create` da de 1 arg da `0074`,
   **e reemitir `revoke all … from public, anon, service_role` + o `revoke` da `0078`**.
6. `drop function` de `mesmo_escopo_de_gestao`, `exigir_ativos_da_empresa`, `prefixo_backup_import`.
7. `drop index` do índice de `import_logs`.

⚠ Os passos 1→4 são `create or replace` **puros** (assinatura idêntica) — nenhum grant se perde.
O passo 5 é o único `drop`, e por isso é o único que precisa reemitir privilégio. Rollback
parcial que deixe a `0132` pela metade **não é estado de repouso válido**: ou tudo, ou nada.

---

## 5. Os cenários de roteiro, rótulo a rótulo

Cada guarda tem o **par**: recusa o alheio **e aceita o legítimo**.

### `cargo_dev.sql` (novos)
| Rótulo | Cenário |
|---|---|
| `6a` | `mesmo_escopo_de_gestao` existe e devolve `true` para um alvo real (**aceita o legítimo**) |
| `6b` | `has_function_privilege` = false nos quatro papéis (a doutrina da `0078`) |
| `6c` | o corpo de `exigir_gestao_de` **cita** `mesmo_escopo_de_gestao` (a prova de PRESENÇA) |
| `6d` | as **cinco** RPCs continuam citando `exigir_gestao_de` (a guarda está no caminho) |
| `6e` | `existe_outro_admin_ativo(alvo, null)` == a contagem de hoje (**escopo nulo não recusa tudo**) |
| `6f` | a de 1 argumento **não existe mais** — exatamente 1 função, 2 args (sem overload) |
| `6g` | a trava do último administrador **continua travando** (recusa o rebaixamento do último) |
| `6h` | …e **aceita** o rebaixamento quando há outro (**o par positivo**) |
| `2e-bis` | `definir_vinculos_usuario` **aceita o legítimo** (o par que faltava) |
| `1d` | reescrito: distingue `42883`/`42P01` de recusa pela guarda |

### `import_fora_da_unidade.sql` (novo)
| Rótulo | Cenário |
|---|---|
| `1a` | `prefixo_backup_import(1)` == `'import/filial-1/'` |
| `1b` | fechada nos quatro papéis |
| `2a` | backup **sem** o prefixo da filial → recusa `22023` |
| `2b` | backup **com** o prefixo mas **inexistente** no bucket → recusa `22023` |
| `2c` | backup com prefixo **e** existente → **passa** (o par positivo) |
| `2d` | a mensagem da recusa **não** contém `'backup informado não existe'` (não cai no ramo do reset) |
| `3a` | confirmação errada → recusa dentro da RPC |
| `3b` | confirmação certa com espaço e caixa trocada → **passa** (a régua `upper(btrim())`) |
| `4a` | segundo apply do mesmo `arquivo_hash` na mesma filial em 24 h → recusa, mensagem própria |
| `4b` | mesmo hash em **outra** filial → **passa** |
| `4c` | mesmo hash na mesma filial **fora** da janela → **passa** (reimport legítimo) |
| `5a` | `pode_escrever_filial` em conjunção: nível administrador **passa** em qualquer filial |

### `conflito_filiais.sql` (novos)
| Rótulo | Cenário |
|---|---|
| `10a` | `exigir_ativos_da_empresa` existe, fechada nos quatro papéis |
| `10b` | o corpo de `apagar_ativos_conflito_filiais` a **cita**, e **depois** da etapa 3 |
| `10c` | a exclusão legítima de um grupo em conflito **continua funcionando** (o par positivo) |

### `definer_sem_tenant.sql` (novo)
| Rótulo | Cenário |
|---|---|
| `1a` | toda candidata do universo derivado está classificada (universo → lista) |
| `1b` | todo nome da lista existe no universo (lista → universo) — os **dois sentidos** |
| `2` | toda exceção tem motivo escrito **e** a migration na mesma linha |
| `3` | nenhuma classificação por prefixo `exigir_` |

---

## 6. Verificação

`npm run lint` · `npm run test` · `npx tsc --noEmit` entre frentes; `npm run build` antes do PR.
`npm run db:lock` no mesmo commit da `0132`. Sem Postgres na mesa: o `banco-sem-docker` do PR é
quem roda os 30 roteiros, e a saída se lê com `gh run view --log-failed`. Cada objeto novo é
validado em `begin; … rollback;` contra o **ensaio** antes do push.

**Sabotagens obrigatórias:** A (remover a guarda de dentro de `exigir_gestao_de`), B (fazer
`mesmo_escopo_de_gestao` devolver `false`), C (divergir a régua de normalização), D (afrouxar o
prefixo do backup), E (remover `exigir_ativos_da_empresa`), F (mover trecho que uma mutação
procura). A **A é a que mais importa**: se nada cair, isso é **o achado** — uma guarda que
devolve `true` é indetectável por efeito, e o que se prova é a **presença**.

# RELATÓRIO F52 — As guardas de escopo no-op

**08/09/2026 · v1.57.0 · migration `0132_guardas_de_escopo.sql` · PR #35**

Pôs dentro do Postgres as guardas de **pertencimento** que não existiam — as que, na virada
multiempresa, seriam a única coisa entre um administrador e o dado do vizinho. Todas escritas
de forma que, **com uma empresa só, não mudam nada**.

Nenhum `empresa_id`, nenhuma tabela de tenant, nenhum `force row level security`, nenhuma
dependência nova, nenhum recorte de leitura. **Fechadura antes de chave.**

---

## 1. O que mudou, por arquivo e por quê

### A migration `0132` — 10 objetos

| # | Objeto | O quê, e por quê |
|---|---|---|
| 1 | `mesmo_escopo_de_gestao(uuid)` | **nova**, devolve `true`. Chamada de dentro de `exigir_gestao_de`: **uma condição protege as CINCO RPCs de conta**, porque as cinco passam por ali |
| 2 | `exigir_gestao_de` | recriada — só a guarda nova, entre o `P0002` e o ramo de cargo |
| 3 | `existe_outro_admin_ativo` | **`drop` + `create`** com `p_escopo uuid default null`, em disjunção guardada |
| 4 | `prefixo_backup_import(smallint)` | **nova**, molde de `prefixo_backup_reset`. `immutable`, **não** `security definer` |
| 5 | `import_validar_plano` | recriada — cascata de três guardas do backup, confirmação digitada e idempotência |
| 6 | `importar_ativos_substituir` | recriada — só `pode_escrever_filial(v_filial)`, **em conjunção** com o `e_admin()` |
| 7 | `exigir_ativos_da_empresa(uuid[])` | **nova**, chamada pela mesa **depois** da etapa (3) do lock |
| 8 | `apagar_ativos_conflito_filiais` | recriada — só a chamada nova |
| 9 | `import_logs_filial_hash_idx` | o índice da janela de 24 h |
| 10 | `comment on column eventos_admin.detalhe` | o comentário que a descrevia como metadado |

### O lado TypeScript

- **`actions/importar.ts`** — backup por **id** sob `import/filial-N/`; confirmação pela régua
  da casa e **dentro de `p_plano`**; o comentário `:35-36` corrigido.
- **`validators/confirmacao-digitada.ts`** — passou a **hospedar** `confirmacaoImportConfere`.
- **`validators/importar.ts`** — `prefixoBackupImport` + reexporta a régua.
- **`components/admin/importar/importar-wizard.tsx`** — a tela passou a usar a mesma régua.
- **`actions/erros.ts`** — seis ramos novos, com frases **lexicalmente disjuntas**.
- **`queries/import-logs.ts`** — `arquivo_hash` no tipo, na string de leitura e no mapeamento.
- **`types/database.ts`** — hand-fix datado (as três funções novas + a assinatura alterada).

### O rig

`definer_sem_tenant.sql` (novo) · `import_fora_da_unidade.sql` (novo) · `cargo_dev.sql`,
`conflito_filiais.sql`, `import_substituir.sql`, `catalogo_secdef.sql`, `troca.sql` estendidos ou
consertados · `mutacoes.mjs` (+8) · `import-confirmacao-sql.test.ts` (novo) ·
`RUNBOOK-BANCO.md` (a régua, em seção própria).

---

## 2. Os números MEDIDOS, lado a lado com o que a ficha previa

| O quê | A ficha previa | **Medido** | Divergência |
|---|---|---|---|
| Migration | `0131` | **`0132`** | a F51 tomou a `0131` |
| `exigir_gestao_de` | "ganha escopo" | **já existia** (`0074:72`) | insere-se **uma linha**, não se cria a função |
| `existe_outro_admin_ativo` | "parâmetro hoje **ignorado**" | **não tinha parâmetro nenhum** | o parâmetro **nasce** aqui |
| `k_secdef` | 37 | **46 → 48** | ficha desatualizada em 9 |
| `plataforma_admins` | recomendada no denominador | **não existe no schema** | escrita, não implementada — F65 |
| `p_confirmacao … default null` | "mantém `create or replace` puro" | **é assinatura NOVA** | ver §3, Decisão 3 |
| `colaborador_chave` | exceção da trava | **não é `security definer`** | não pertence ao universo |
| Roteiros SQL | "25+" | **29 → 31** | — |
| `conflito_filiais` | 37 asserções | **37 → 43** | confere |
| Mutações / teto | 47 / 48 | **47 → 55 / 48 → 56** | motivo escrito no teste |
| Universo da trava | ~37 | **21** (18 + 3 exceções) | conferido **contra produção** |
| Ensaio | INACTIVE (F36/F37/F50) | **ACTIVE_HEALTHY** | divergência a favor |

**Totais do CI verde (run 34271810257):** 31 roteiros · **671 asserções** · **0 falhas** ·
**55/55** mutações acusadas pelo cenário nomeado.

| Roteiro | Antes | Depois |
|---|---|---|
| `cargo_dev.sql` | 49 | **58** |
| `conflito_filiais.sql` | 37 | **43** |
| `catalogo_secdef.sql` | 8 | **9** |
| `import_substituir.sql` | 19 | **19** (preservado — só fixture mudou) |
| `definer_sem_tenant.sql` | — | **6** (novo) |
| `import_fora_da_unidade.sql` | — | **14** (novo) |

---

## 3. As sete decisões, e o custo que decidiu cada uma

**1 — Onde a guarda entra em `exigir_gestao_de`.** Depois da checagem de existência, antes do
ramo de cargo. Reusa `v_papel_alvo`; preserva o `P0002` do alvo inexistente; e faz pertencimento
decidir **antes** de patente — senão um administrador de outra organização leria "Esta ação é
restrita a administradores", que é falso e manda investigar a coisa errada.

**2 — O parâmetro de escopo.** `drop` + `create`, **não** `create or replace`. **Medido em
`begin; … rollback;` contra o ensaio:** com a de 1 argumento e a de 2-com-default coexistindo, a
chamada de 1 argumento levanta **`42725 function … is not unique`** — e ela é feita em três
lugares (`0074:176`, `:220`, `:319`). As três RPCs quebrariam **em tempo de execução, sem erro
no apply**. Com o `drop` antes, sobra uma função e as três resolvem com `p_escopo => null`.
O recorte entra em **disjunção guardada**, nunca em igualdade crua — provado lado a lado com a
forma errada, que devolve `false` e **recusaria tudo**.

**3 — A confirmação digitada.** Saída **(b)**: viaja dentro de `p_plano`. A ficha afirma que
`default null` mantém `create or replace` puro; **é falso**, e a prova está em
`00-medicoes-de-partida.md`. Um overload quebraria `seguranca_catalogo.sql:94`. A régua é
`upper(btrim(coalesce(…)))` — a da casa, e **estritamente mais permissiva** que a igualdade
exata que a action usava, o que é o critério de não-regressão da fase.

**4 — Onde `exigir_ativos_da_empresa` entra na mesa.** Depois da etapa (3) do lock, antes da
revalidação, fora da janela destrutiva. Depois da etapa 3 é **obrigatório** porque a guarda fará
leitura própria de `ativos`. **Extraída**, não inline, porque a RPC é recriada em cadeia.

**5 — A forma da trava.** **Híbrida.** Lista pura envelhece (a ficha é a prova). Derivação pura
**reprovaria código seguro**: `estorno_item_coerente` e `termo_ancora_coerente` recebem id, são
alcançáveis, e a autorização está **ANDada ao lado, na policy**. E erraria por falso negativo em
`pode_escrever_arquivo_termo`, que **delega**.

**6 — A quarentena.** As duas **reapontadas, com motivos distintos**. A de serialização → **F55**
(exige DUAS conexões: capacidade que falta, não asserção). A de backup em arquivo → **F54**
(escrevível hoje; a razão é **endereço**, não dificuldade — o cenário que falta ficou escrito).

**7 — A idempotência.** Dentro de `import_validar_plano`, que já recebe `p_plano` e `p_filial`.
Janela de **24 h por filial**, não permanente. A coluna **entra** na leitura do histórico.

---

## 4. As seis sabotagens

Saída completa em `05-sabotagens.md`. **Cinco viraram mutações permanentes** e rodam a cada push.

O achado que a ordem previu — e que veio diferente do previsto:

> **A ordem dizia: "se nada cair na sabotagem A, isso é o achado".** Nada caiu — mas o motivo
> **não** foi que a guarda é indetectável (isso já estava resolvido: `7c` prova **presença**).
> Foi que `7c` procurava o **nome cru**, e `pg_get_functiondef` devolve o corpo **com os
> comentários** — e o comentário que a `0132` escreveu em volta da guarda **cita o nome**.

**A mesma armadilha apareceu TRÊS vezes**, e só o injetor a encontrou: `7c`, `5a-ter` (que
aprovaria a guarda removida) e `5a-bis` (que **reprovava código correto**, comparando a posição
de um comentário contra a de um `if`). A lição: *uma prova de presença que casa com a
documentação da coisa, em vez da coisa, não prova presença nenhuma.*

E uma segunda lição estrutural, das sabotagens D e da mutação pré-existente
`import-sem-exigencia-de-backup`: **uma cascata esconde as próprias guardas.** O cenário que
testa a guarda 2 precisa ser recusado **só** pela guarda 2 — senão passa verde sobre uma guarda
removida.

---

## 5. O diff: só a guarda

Saída em `06-diff-so-a-guarda.md`. **Não foi conferido depois — foi construído assim:** os
quatro corpos são o corpo **vigente** resolvido por `corpo-vigente.mjs` e transformado por
`trocarNoCorpo`, a mesma função do injetor.

| Função | Removidas | Acrescentadas |
|---|---|---|
| `exigir_gestao_de` | **0** | 16 |
| `importar_ativos_substituir` | **0** | 21 |
| `apagar_ativos_conflito_filiais` | **0** | 15 |
| `import_validar_plano` | **2** | 67 |

As duas de `import_validar_plano` são o cabeçalho do bloco `1b` e o `raise` que **ganhou** o
`errcode = '22023'` das irmãs.

---

## 6. Bugs encontrados e corrigidos no caminho

1. **`import_logs.criado_em` não existe** — a tabela tem `created_at`. O índice teria falhado no
   apply; a RPC, **no meio de um import**. Pego antes de qualquer apply.
2. **`int` → `smallint` não é cast implícito** — mordeu **três vezes**. Um literal cru não deixa
   a asserção vermelha: **aborta o roteiro**, escondendo tudo o que vem depois.
3. **`has_function_privilege` com assinatura inexistente LEVANTA** em vez de devolver `false` —
   a asserção `5e` não ficava vermelha, **abortava o roteiro inteiro**.
4. **Um QUINTO comentário mentiroso**, além dos quatro previstos: `importar-wizard.tsx` dizia
   que a RPC "nem repete essa checagem". A partir desta fase, repete.

---

## 7. Os 25 critérios, autoverificados

| # | Critério | Veredito |
|---|---|---|
| 1 | `mesmo_escopo_de_gestao` existe, devolve `true`, é chamada de dentro, privilégio das irmãs | ✅ 16/16 `has_function_privilege` = false |
| 2 | As cinco RPCs passam por `exigir_gestao_de`, provado por cenário | ✅ `7d` + mutação de efeito |
| 3 | Parâmetro de escopo; trava do último admin continua; escopo nulo não recusa tudo | ✅ `7e`–`7i` |
| 4 | A conta de plataforma na ata **e** no cabeçalho do roteiro | ✅ |
| 5 | `definir_vinculos_usuario` ganhou par positivo | ✅ `7j`, `7j-bis` |
| 6 | `1d` e `3i` distinguem `42883`/`42P01` de recusa, sem exigir menos | ✅ |
| 7 | `pode_escrever_filial` em conjunção, entre filial e advisory lock | ✅ `5a`, `5a-bis`, `5a-ter` |
| 8 | `prefixo_backup_import` por id + cascata de três com `22023` | ✅ `1a`, `1b`, `2a`–`2c` |
| 9 | `erros.ts` com frase própria; teste de que não diz "deste reset" | ✅ `2d` |
| 10 | Confirmação na RPC, mesma régua, provada por teste | ✅ 19 asserções + sabotagem C |
| 11 | Assinatura **não** mudou; asserção de 4 args e uma linha só | ✅ `seguranca_catalogo` verde |
| 12 | Idempotência bloqueia e **deixa passar** o legítimo | ✅ `4a`, `4b`, `4c` |
| 13 | `exigir_ativos_da_empresa` depois do lock; 37 continuam passando | ✅ 37 → **43** |
| 14 | Nenhuma guarda dentro da janela destrutiva | ✅ `10c` por `position()` |
| 15 | Trava por função nomeada, inclui `text`, exceções com motivo+migration | ✅ 6 asserções |
| 16 | Nasceu verde → veio com sabotagem provando que reprova | ✅ auto-sabotagem |
| 17 | A régua no `RUNBOOK-BANCO.md`, em seção própria | ✅ entre :49 e :125 |
| 18 | `import_fora_da_unidade.sql` conta de verdade e emite `FIM` | ✅ 14 asserções |
| 19 | Os comentários descrevem o que a coluna e o módulo guardam | ✅ **cinco** |
| 20 | `k_secdef` nos dois sentidos | ✅ 46 → 48 |
| 21 | Injetor verde; cada guarda com mutação; Decisão 6 registrada | ✅ **55/55** |
| 22 | `lint`, `test`, `build`, `tsc` limpos; `db:lock` no mesmo commit | ✅ 4222 testes |
| 23 | **Comportamento idêntico**; par "aceita o legítimo" para cada guarda | ✅ ver §8 |
| 24 | `MATRIZ` a partir de R-ACC-49; atas; versão; tag; CHANGELOG | ✅ R-ACC-49→57 |
| 25 | PR mergeado com os dois checks verdes; `main` em repouso válido | ✅ |

---

## 8. O par recusa/ACEITA, guarda por guarda

Uma guarda com só o lado "recusa" não prova que é no-op — prova o contrário.

| Guarda | Recusa o alheio | **Aceita o legítimo** |
|---|---|---|
| `mesmo_escopo_de_gestao` | (mutação de efeito derruba 7a/7j) | **`7a`** — devolve `true` para alvo real |
| escopo de `existe_outro_admin_ativo` | `7h` — trava do último admin | **`7f`, `7i`** — escopo nulo e havendo outro |
| `definir_vinculos_usuario` | `2e` (já existia) | **`7j`, `7j-bis`** — vincula e grava |
| `pode_escrever_filial` no import | (mutação derruba `5a-ter`) | **`5a`** — administrador passa em qualquer filial |
| prefixo do backup | `2a` | **`2c`** — prefixo certo e existente passa |
| existência do backup | `2b` | **`2c`** |
| confirmação digitada | `3a` | **`3b`** — caixa e espaço passam |
| idempotência 24 h | `4a` | **`4b`** (outra filial) e **`4c`** (fora da janela) |
| `exigir_ativos_da_empresa` | (mutação derruba `10b`) | **`10d`** — exclusão legítima segue |

---

## 9. O que este relatório NÃO prova

1. **Uma guarda que devolve `true` é INDETECTÁVEL POR EFEITO.** O que se provou é a **presença**
   dela no caminho — o corpo cita a chamada, o catálogo a conhece, e a mutação de efeito derruba
   os cenários positivos. **Nenhuma guarda desta fase recusa alguém hoje. É esse o ponto.**
2. **A equivalência foi provada pelos CENÁRIOS que os roteiros cobrem** — 671 asserções —, não
   sobre o espaço inteiro de entradas.
3. **A trava lê o CATÁLOGO do banco do CI**, e `migrations-lock`/`import-uma-porta` leem o
   **texto** das migrations. Nenhuma responde pelo que está **em produção**.
4. **O smoke de produção não exercita o import** (destrutivo, só na janela de go-live de uma
   filial) **nem a mesa de conflitos**.
5. **Nada foi aplicado em banco nenhum.** A `0132` **e** a `0131` seguem pendentes — ver §10.
   Tudo o que se provou, provou-se contra o Postgres **do CI** e contra o **ensaio** em
   `begin; … rollback;`.
6. **A âncora `select true` é curta e frágil** — a sabotagem F mediu que ela sobrevive a ser
   *envolvida* por outro texto (`select true = true`); o mecanismo só reprova quando o trecho
   **desaparece**.
7. **`database.ts` foi corrigido à mão.** Ele bate com o banco **do CI**; a deriva de **produção**
   continua invisível até alguém rodar `npm run db:types` depois do apply.

---

## 10. Pendências

**O APPLY — a única pendência real, e ela é dupla.**

Medido em 08/09/2026: a **`0131` não está aplicada** em produção **nem** no ensaio (zero
auxiliares `import_*` nos dois; produção tem as 38 do estado `0130`, o ensaio 37 — falta-lhe
também a `0129`). A `0132` recria `import_validar_plano` e `importar_ativos_substituir`, que só
existem na forma decomposta **depois** da `0131`.

**As duas vão na mesma janela, NA ORDEM (`0129` → `0130` → `0131` → `0132`), ou nenhuma vai.**

O gate do modo automático bloqueia DDL com `delete from public.ativos`. Medição desta fase: por
causa da decomposição da F51, **só `apagar_ativos_conflito_filiais` contém a string executável**
na `0132` (`:862`, `:869`) — as partes do import já não a contêm. Isso **não** dispensa o
caminho B, mas reduz o que precisa de mão humana.

Depois do apply: `npm run db:types`, conferir contra o hand-fix, `notify pgrst, 'reload schema';`
e a verificação pós-apply do runbook.

**A ORDEM DE ROLLBACK** está escrita no cabeçalho da `0132`, e é o inverso da de apply. O passo
5 (`existe_outro_admin_ativo`) é o **único `drop`**, e por isso o único que precisa reemitir
privilégio.

---

## 11. Backlog nomeado

**Para a F54** — ela consome o `prefixo_backup_import` desta fase:
- A entrada de quarentena **reapontada para cá**, com o cenário escrito passo a passo no
  catálogo: 26 ativos, o teto do backup em arquivo, e a amarra pelo digest.
- Os backups **antigos** do import continuam em `<slug>/<timestamp>.json`. Nada os lê a não ser
  `urlBackup` pelo `backup_path` gravado, que continua funcionando — mas quem for escrever a
  restauração precisa saber que **há dois formatos**.

**Para a F55** — a entrada de quarentena da **serialização por advisory lock**: exige um harness
em Node com **duas** conexões `psql`. E `40P01` (deadlock) **não tem ramo em `erros.ts`**: hoje
chega ao administrador como erro genérico, num botão destrutivo.

**Para a F62/F65** — o que cada fechadura precisa para ganhar corpo:
- `mesmo_escopo_de_gestao(p_alvo)` → trocar `select true` pelo predicado real. **Só esta
  função**; nem `exigir_gestao_de` nem as cinco RPCs são tocadas.
- `existe_outro_admin_ativo` → trocar o `true` do segundo termo da disjunção. **Manter a forma
  `p_escopo is null or …`** — igualdade crua faz a RPC recusar tudo.
- `exigir_ativos_da_empresa(p_ids)` → dar corpo, mantendo a leitura de `ativos` **depois da
  etapa (3)** do lock.
- **Os TRÊS contadores de "outro admin ativo"** continuam divergentes por construção: o escopo
  entrou só no SQL. Fecha em `idsDeAdminsAtivos` (`queries/admin.ts:206`), que é onde a lista
  nasce.
- `pode_ler_arquivo_termo` segue ignorando `p_nome` — é a exceção nominal da trava, e é **F67**.

**Para a F57** — nada foi tocado em `src/lib/filtros/filial.ts` nem na convenção `[] = sem
recorte`.

**Fora de escopo, encontrado no caminho** — não corrigido, por respeito à regra 1:
- `erros.ts` não tem ramo para `40P01`.
- `db:test` e `db:test:um` apontam para o mesmo comando, sem nada que force o segundo a receber
  exatamente um arquivo.

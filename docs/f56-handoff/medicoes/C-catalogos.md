# C-catalogos — F56 — relatório de medição

ID: C-catalogos
Fatos da ordem cobertos: 12, 13, 42 (injetor), 43 (parcial — só a parte "sem psql/CLI/gh no PATH, e o que isso implica para rodar os roteiros").
Medido em 11/09/2026, branch `f56-import-sem-wapismo-e-sem-bomba`, `main` em `ef8a1e4`, árvore limpa (só `docs/prompts/F56-…md` não versionado).

---

## 1. O que existe hoje — inventário completo dos catálogos por NOME

### 1.1 Os seis roteiros SQL "catálogo" (fato 13)

| arquivo | o que enumera por NOME | escreve no banco? |
|---|---|---|
| `supabase/tests/catalogo_policies.sql` | **tabelas** de `public` classificadas negócio×infra (`k_negocio`, `k_infra`, arrays 1-78); tabelas isentas de SELECT (`k_sem_select`, :127); o **piso de leitura** `papel_atual()` por tabela (`k_piso_papel`, :142-146, e `k_piso_cargo`, :153); **policies de Storage** por nome (`k_storage`, 8 nomes, :160-165); **funções do modelo de acesso** citadas em policy de Storage (`k_funcoes_acesso`, :175-178); tabelas na **publication do Realtime** (`k_realtime`, :187) | não (só leitura de catálogo) |
| `supabase/tests/catalogo_secdef.sql` | as **51** funções `security definer` de `public`, uma a uma, por nome (`k_secdef`, :69-153); as INVOKER hoje revogadas de `anon` (`k_invoker_revogadas`, :197-200) | não |
| `supabase/tests/definer_sem_tenant.sql` | dentre as `security definer` que recebem `uuid/uuid[]/smallint/text` e são alcançáveis por `authenticated`, quais **se defendem sozinhas** (`k_escopo_ok`, 18 nomes, :95-120) e quais são **exceção nominal com motivo+migration** (`k_escopo_excecao` + dois arrays paralelos, :127-148) | sim, mas `begin;…rollback;` (cria e revoga uma função de sabotagem) |
| `supabase/tests/seguranca_catalogo.sql` | grants das **3 RPCs de escrita** por assinatura completa (:91-95); RLS ligada em toda tabela (varredura, não lista); `security_invoker` em toda view (varredura); as **2 funções-gatilho DEFINER** que não podem ser alcançáveis (`aplicar_movimentacao`, `handle_new_user`, :171) e a exceção nominal `valida_lancamento_item` (:193) | não |
| `supabase/tests/papeis_rls.sql` | **NÃO é catálogo-de-tudo** — é cenário por cenário. Mas tem DOIS blocos de `grant select/insert,update,delete on <lista de tabelas>` explícitos (:91-108, :111-128) que só cobrem as tabelas que algum cenário usa. `tipos_item` já está nos dois blocos (linha 103 leitura, 127 escrita) e tem 3 cenários nomeados: `1i`/`1j` (consulta lê), `3c-bis` (operador recusado ao inserir), `5c-bis` (admin insere) — molde exato para uma tabela nova "vocabulário administrado" | sim, `begin;…rollback;` |
| `supabase/tests/isolamento_tenant.sql` | espelha o bloco de grants de `papeis_rls.sql` em miniatura (`k_leitura`/`k_escrita`, :164-165) — só `ativos`/`filiais`/`profiles` hoje; não toca tabela de vocabulário | sim, `begin;…rollback;` |

`supabase/tests/_asserts.sql` não enumera nada — é só a ferramenta `pg_temp.assert_zero_de` (universo vazio levanta exceção; TEM de ser carregada com `-f` antes de cada roteiro na mesma sessão psql, é o que `rodar-roteiros.sh` faz).

### 1.2 O SÉTIMO catálogo, que a ordem NÃO cita por nome — achado desta medição

**`src/lib/itens/migrations-f38.test.ts`** (não é `.sql`, é Vitest — por isso não estava na lista de roteiros da ordem, mas `docs/RUNBOOK-BANCO.md:434-440`, seção *"Quem acrescenta migration atualiza DUAS listas"*, aponta para ele). É uma **lista fechada, por NÚMERO de 4 dígitos**, de toda migration a partir da `0116` (`DA_F38`, :41-115). A asserção decisiva (:177-183):

```ts
it('nenhuma migration a partir da 0116 fica de fora da lista', () => {
  const posteriores = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql') && /^\d{4}_/.test(f) && f.slice(0, 4) >= '0116')
    .map((f) => f.slice(0, 4)).sort()
  expect(posteriores, 'migration nova sem cobertura em DA_F38').toEqual(DA_F38)
})
```

**Isto é obrigatório e não opcional: `0139` e `0140` TÊM de entrar no array `DA_F38`, em ordem, cada uma com um comentário de uma frase (é o padrão de toda entrada desde `0122`) — senão `npm run test` reprova imediatamente**, mesmo que nada mais mude. Depois de entrarem, as migrations caem sob TRÊS guardas adicionais que rodam sobre TODA `DA_F38`, não só sobre a fase que as escreveu:
- **`INTOCAVEIS`** (:118-129, 10 nomes: `aplicar_movimentacao`, `guarda_acervo`, `rel_saldo_itens`, `rel_mov_itens`, `rel_estoque_asof`, `status_apos_movimentacao`, `status_tem_detentor`, `transferir_item`, `criar_compra_lote`, `devolver_ao_fornecedor`) — nenhuma das três funções que a `0140` recria (`import_apagar_acervo_filial`, `import_revalidar_contagens`, `importar_ativos_substituir`) está nesta lista, então **este teste passa sem exceção nominal nova** (o precedente já existe: a `0131`/`0132` recriaram as mesmas duas primeiras sem precisar de `RECRIACOES_AUTORIZADAS`).
- **DELETE/UPDATE em massa no TOPO** (:249-278) — a varredura ignora o que está dentro de `$$…$$` (`semCorposDeFuncao`, :152-154), então o `delete from public.ativos` que vai morar dentro do corpo de `import_apagar_acervo_filial` **não** dispara isto, desde que a `0140` não tenha nenhum `delete`/`update … set` de TOPO fora de função. Mesmo padrão que já valeu para `0131`.
- **nenhum valor novo de enum** (:241-247) — `alter type … add value` reprova qualquer migration de `DA_F38`. A `0139`/`0140` desta fase não devem mexer em enum (o vocabulário vira TABELA, não enum), então isto passa por desenho.

A quarta guarda (`toda função NOVA declarada security invoker`, :298-321) só vale para uma lista hardcoded de nomes da própria F38 — **não** se aplica a funções novas de outras fases automaticamente; se a F56 não acrescentar essa lista, este `it.each` continua correndo só sobre os 6 nomes de sempre. Não é preciso mexer aqui a menos que se queira estender a exigência.

### 1.3 Catálogo "de catálogo" — `src/lib/validators/catalogos-seguranca.test.ts` (570 linhas)

Este arquivo **não enumera tabela/função por nome**: ele testa a FORMA dos três roteiros da F48 (que são derivados do catálogo, não listas que afirmam), a Decisão 2 (uma fonte por fato), e a simetria do bloco de grants de `isolamento_tenant.sql` contra os arrays `k_leitura`/`k_escrita` dele (describe 9, :513-570). **Não precisa de alteração para uma tabela nova**, a menos que a Frente G (smoke) resolva conceder grants a `authenticated` dentro de `isolamento_tenant.sql` para uma tabela de vocabulário — o que não parece necessário (o smoke roda como o client administrativo/RPC, não como `authenticated` fazendo `set local role`).

---

## 2. O CHECKLIST — por tipo de artefato novo

### "Tabela nova (ex.: `unidades_apelidos`, a(s) tabela(s) de vocabulário de Tipo/Situação/prefixo) exige:"

1. **`supabase/tests/catalogo_policies.sql:73-78`** — acrescentar o(s) nome(s) em `k_negocio` (é NEGÓCIO pelo critério do arquivo: pertence ao acervo/operação de uma empresa e vai precisar de `empresa_id` na virada — não é `k_infra`). Sem isto, a asserção `1a` reprova nomeando a tabela.
2. Se a tabela ganhar policy de SELECT com o piso `papel_atual() is not null` (padrão `tipos_item`) — **`k_piso_papel`** em `catalogo_policies.sql:142-146` — senão a asserção `6c` reprova ("toda policy de SELECT de public está numa das duas listas do piso").
3. **`src/lib/types/database.ts`** — hand-fix na seção `Tables` do schema `public` **antes do primeiro push com a `0139`** (a forma exata, molde de `tipos_item:1123-1149`, está na seção 4 abaixo). Sem isto o job `banco-sem-docker` reprova no passo *"Gate de deriva — o database.ts conhece tudo o que o banco tem"* (`.github/workflows/ci.yml:293-296`, chama `npm run db:types:diff`) — `scripts/db/diff-tipos.mjs:104-110` inclui `relkind in ('r','p','v')`, ou seja tabela normal entra sem exceção.
4. **`src/lib/itens/migrations-f38.test.ts:41-115`** — o número da migration (`0139`, e depois `0140`) entra em `DA_F38`, em ordem, com comentário — **catálogo oculto, ver §1.2**.
5. **`supabase/tests/papeis_rls.sql:91-108,111-128`** — RECOMENDADO, não travado por gate algum: acrescentar a tabela aos dois blocos de `grant` e escrever cenários no molde `tipos_item` (`1i`/`1j` leitura por `consulta` ativo, `3c-bis` operador recusado no insert, `5c-bis` admin insere) — é o padrão da casa para "vocabulário administrado" mas **nada reprova automaticamente se pular isto** (ao contrário do item 1).
6. `npm run db:lock` — ver "migration nova" abaixo (é o mesmo commit).
7. **NÃO precisa**: `catalogo_secdef.sql` (só enumera função, não tabela), `definer_sem_tenant.sql` (idem), `seguranca_catalogo.sql` (varre TODAS as tabelas por catálogo, não por lista — a asserção 2 "RLS ligada em toda tabela" e a 3 "security_invoker em toda view" cobrem a tabela nova automaticamente, sem precisar nomeá-la), `isolamento_tenant.sql` (só se o smoke decidir usar `set local role authenticated` sobre ela, o que não é o desenho hoje).

### "Policy nova exige:"

1. Se ela é a policy de SELECT que usa `papel_atual() is not null` — entrar em `k_piso_papel` (ver acima).
2. Se ela é de `storage.objects` (não é o caso aqui — vocabulário não tem arquivo) — entraria em `k_storage`, `catalogo_policies.sql:160-165`, e teria de citar por nome uma das oito funções de `k_funcoes_acesso` (:175-178) para não cair na asserção 7 ("nenhuma policy de storage decide só por bucket_id"). Não se aplica a F56.
3. **Nome da policy tem de existir literalmente numa migration** se alguma mutação do injetor citar essa policy (ver "mutação nova" abaixo, `mutacoes.test.mts:291-313`, describe 4: regex `(create|alter) policy "<nome>" on <tabela>`).
4. Molde de nomes já em uso na casa (para `tipos_item`, `0114:94-105`): `"leitura operador"`, `"admin insere tipo"`, `"admin atualiza tipo"` — três policies nomeadas em minúsculas com espaço, sem prefixo de tabela (o nome não precisa ser único entre tabelas, só dentro da tabela).

### "Função `security definer` nova ou recriada exige:"

1. **`catalogo_secdef.sql:69-153`** (`k_secdef`) — nome novo entra na lista, com o bloco comentado explicando POR QUE é definer (o padrão de todo grupo do arquivo). Recriar uma função JÁ classificada (`create or replace` com a MESMA assinatura, caso da `0140`) **não precisa mexer aqui** — ela já está no array.
2. Se ela recebe `uuid/uuid[]/smallint/text` e é alcançável por `authenticated` — **`definer_sem_tenant.sql:95-148`** (`k_escopo_ok` se ela se defende sozinha citando `e_admin`/`e_dev`/`pode_escrever_filial`/`pode_escrever_termo`/`exigir_gestao_de`/`exigir_dev_para_destruir`; ou `k_escopo_excecao` + os dois arrays paralelos `_migracao`/`_motivo`, com motivo **> 40 caracteres** e migration em **4 dígitos**, se ela é isenção deliberada). As três recriadas na `0140` (`import_apagar_acervo_filial`, `import_revalidar_contagens`, `importar_ativos_substituir`) — **conferir se seguem nas mesmas listas de hoje**: `importar_ativos_substituir` já está em `k_escopo_ok` (`definer_sem_tenant.sql:119`, cita `pode_escrever_filial`); as outras duas (auxiliares fechadas nos quatro papéis — sem EXECUTE de `authenticated`) **não entram no universo desta trava** (o universo é filtrado por `has_function_privilege('authenticated', …, 'execute')`, `:161`), então nada muda aqui para elas, contanto que os grants não mudem.
3. `grant/revoke` — auxiliar fechada continua `revoke all … from public, anon, authenticated, service_role`; a orquestradora continua `EXECUTE` só para `authenticated` (conferido por `seguranca_catalogo.sql:91-95` — que usa assinatura completa, ex. `'public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)'`; **se a assinatura mudar, este arquivo TEM de mudar junto** — hoje a `0140` recria com a MESMA assinatura, então não precisa).
4. `search_path` travado (`set search_path = public` ou variante) — conferido automaticamente pela varredura de catálogo da asserção 3 de `catalogo_secdef.sql`, não precisa de lista.
5. **`src/lib/types/database.ts`** — seção `Functions`, se o NOME for novo (ver `tipos-conjuntos.mjs:104-105`: qualquer `prokind='f'` que não seja `trigger`/`event_trigger` entra no conjunto comparado — **security definer OU não**, ver a próxima seção). Função recriada com o MESMO nome não precisa de hand-fix aqui.
6. **`src/lib/itens/migrations-f38.test.ts`** — se o nome estiver em `INTOCAVEIS` (não é o caso das três da `0140`), precisaria de `RECRIACOES_AUTORIZADAS` (:198-202) nomeando a migration e a função, exaustivo.
7. **`src/lib/validators/import-uma-porta.test.ts:81-90`** — SÓ se o nome novo começar com `import_` (a lista `AUXILIARES` é comparada 1:1 contra toda `create [or replace] function public.import_*` do disco, `:139-148,161-171`). As três recriações da `0140` já estão nessa lista (`import_apagar_acervo_filial`, `import_revalidar_contagens` já lá; `importar_ativos_substituir` é a `ORQUESTRADORA`, tratada à parte, `:74`) — **nenhuma mudança necessária** contanto que nenhuma função `import_*` NOVA nasça. Se nascer, ela TEM de entrar em `AUXILIARES` (ou seria acusada como órfã pela simetria da asserção "a lista classifica EXATAMENTE as `import_*` que as migrations definem", `:161-172`).

### "Função IMMUTABLE auxiliar, NÃO `security definer`, exige (ex.: a chave normalizada SQL da Decisão 1):"

Molde exato: `colaborador_chave` (`0112:89-100`) — `language sql immutable strict set search_path = public`, **sem** `security definer`.
1. **NÃO** entra em `catalogo_secdef.sql` (só enumera `prosecdef = true`).
2. **NÃO** entra em `definer_sem_tenant.sql` (universo é `p.prosecdef` também, `:159-160`).
3. **ENTRA** em `src/lib/types/database.ts` → `Functions` (o gate de `diff-tipos.mjs` não filtra por `prosecdef`; qualquer `prokind='f'` de retorno não-trigger conta, `diff-tipos.mjs:135-142`).
4. `revoke all … from public, anon; grant execute … to authenticated, service_role;` (molde `0112:105-106`) — **não é imposto por nenhum catálogo automático**; é convenção sem trava (nenhum roteiro varre EXECUTE de função IMMUTABLE não-definer). Recomendado por paridade, não obrigatório.
5. Se ela alimentar uma coluna GERADA (`generated always as (…) stored`) com índice ÚNICO por cima — molde `colaboradores_nome_chave_uidx` (`0112:134`) — e a guarda TS↔SQL espelha a função em TypeScript com teste próprio (molde `src/lib/colaboradores/chave-sql.test.ts`) — **este teste é NOVO por tabela**, não um catálogo geral; cada domínio (`colaborador_chave`, `item_chave`, e a nova para filial/apelido) tem o seu próprio arquivo `<dominio>-sql.test.ts`.

### "Verbo novo na trilha de auditoria exige (fato 12):"

1. **`src/lib/auditoria.ts:12-49`** — entra em `ACOES_ADMIN` (o array `as const`), com comentário de uma linha dizendo a fase e o motivo (molde de `import_falhou`, :27-31).
2. **`src/lib/auditoria.ts:54-77`** — entra em `ACAO_ROTULO`, frase no PASSADO, voz de quem lê a trilha (ex.: `'Apelido cadastrado'`, `'Apelido removido'` — nunca imperativo).
3. Se for AÇÃO IRREVERSÍVEL/DESTRUTIVA — entraria em `ACOES_DESTRUTIVAS` (:87-96); apelido de filial não se qualifica (não é exclusão irreversível de acervo).
4. **A migration da fase (`0139`) precisa REEMITIR o `comment on column public.eventos_admin.acao` INTEIRO**, com a lista completa de 21 verbos de hoje **MAIS** os novos — molde exato: `supabase/migrations/0137_vocabulario_import_falhou.sql:37-38` (uma linha só, um `comment on column` que SUBSTITUI o comentário anterior por inteiro — Postgres não faz "append" em comment). A lista de hoje, copiada literalmente do comentário vigente (`0137:38`):
   > `convite_gerado, convite_reenviado, papel_alterado, vinculos_alterados, usuario_desativado, usuario_reativado, email_alterado, usuario_apagado, sessoes_encerradas, senha_criada, senha_revogada, senha_reativada, import_executado, import_falhou, ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado, conflito_filiais_resolvido`
   (21 verbos — bate com `ACOES_ADMIN` em `auditoria.ts`, que também tem 21 entradas contando os comentários de fase.)
5. **`src/lib/validators/dev-destrutivo.test.ts:148-166`** — o teste acha a migration MAIS RECENTE (`.sort().reverse().find(...)`) que contenha a string `comment on column public.eventos_admin.acao`, e confere que TODO item de `ACOES_ADMIN` (TypeScript) é substring do texto daquele comentário. **Armadilha**: se a `0139` reemitir o comment mas ESQUECER um dos 21 verbos antigos, o teste reprova apontando o verbo que sumiu — não é preciso listar tudo de novo manualmente no teste, só copiar a string inteira e acrescentar.
6. Chamada de `registrarEventoAdmin({acao: '<verbo novo>', autor, alvo, detalhe})` (`src/lib/auditoria-registro.ts:27`) na Server Action que grava o evento (a de criar/remover apelido, Frente E) — client ADMIN (service_role), erro NÃO propaga (linha 36-58), então a falha de trilha não derruba a operação em si.
7. **NÃO precisa de migration separada para o TEXT em si** — `eventos_admin.acao` é `TEXT` sem `CHECK` nem enum (confirmado: não há `check` nem `enum` sobre essa coluna nas migrations que a criaram — o comment é só documentação, não constraint).

### "Migration nova exige:"

1. **`npm run db:lock`** no MESMO commit — regrava `supabase/migrations.lock.json` (145 linhas hoje, 137 entradas) por inteiro (não é editável à mão; `scripts/db/gravar-lock.ts` RECUSA se alguma migration JÁ travada mudou — só grava se for tudo migration nova).
2. **`src/lib/itens/migrations-f38.test.ts:41-115`** — número em `DA_F38` (ver §1.2, o catálogo oculto).
3. Se ela recria função — ver "função `security definer` nova ou recriada" acima.
4. O CI (`banco-sem-docker`) aplica a pasta INTEIRA em ordem alfabética/numérica (glob `supabase/migrations/*.sql | sort`, `.github/workflows/ci.yml:265-276` e de novo no banco de determinismo, `:321-336`) — **nenhuma lista a atualizar aqui**, é `ls | sort`.
5. `db:types:diff` roda DEPOIS das migrations (posição fixa no YAML, `ci.yml:293-296`) — reprova se a migration criar tabela/coluna/função que `database.ts` não conhece. **hand-fix ANTES do primeiro push** (fato 13) porque a `0139` só vai a banco real (ensaio/produção) depois do CI passar — ou seja, no momento do push o `database.ts` ainda não pode ter sido gerado de um banco que já tem as tabelas novas. Depois do apply em produção, `npm run db:types` substitui o hand-fix pelo gerado de verdade.
6. `docs/RUNBOOK-BANCO.md` **não precisa** de edição por migration nova (ele fala em regra geral, não lista números) — mas a seção *"O gate do modo automático"* citada no fato 31/critério 30 da ordem principal precisa da emenda sobre "definição de função não dispara o classificador" (fora do escopo deste relatório, é Frente H).

### "Trigger novo exige:"

Não há trigger novo previsto para os fatos 12/13/42/43 (Frente D é tabela+RLS, Frente F recria função já existente). Se um dia a ambiguidade do vocabulário for garantida por trigger `before insert/update` (em vez de só `unique index` + conferência em TypeScript) — pelo molde de `guarda_acervo` (`0081`) ou `profiles_guarda_dev` (`0073`):
1. Trigger-função entra em `catalogo_secdef.sql` `k_secdef` SE for `security definer` (as duas do molde são).
2. Entra em `INTOCAVEIS` de `migrations-f38.test.ts` **só se for citada ali como intocável por uma fase futura** — hoje não é automático; um trigger novo não entra em `INTOCAVEIS` sozinho, só se alguém o acrescentar à mão.
3. Função-gatilho `security definer` some do universo de `diff-tipos.mjs`/`tipos-conjuntos.mjs` (que exclui `return_type in ('trigger','event_trigger')`, `diff-tipos.mjs:135-141`) — **não precisa entrar em `database.ts`**.
4. `seguranca_catalogo.sql:171-187` só varre DUAS funções-gatilho nomeadas (`aplicar_movimentacao`, `handle_new_user`) mais a exceção `valida_lancamento_item` — um trigger NOVO **não é pego automaticamente** por este arquivo; teria de ser acrescentado à mão ao `foreach v_sig in array [...]` se quisesse a mesma prova (EXECUTE revogado de `authenticated`/`anon`).

### "Mutação nova (injetor) exige — fato 42:"

Estrutura de uma entrada em `MUTACOES` (`scripts/db/mutacoes.mjs`, catálogo puro, 1684 linhas; a trava é `scripts/db/mutacoes.test.mts`):
```ts
{
  id: 'kebab-case-unico',                 // único entre MUTACOES e não pode colidir com QUARENTENA
  roteiro: 'nome_do_roteiro.sql',         // tem de existir em supabase/tests/
  classe: 'papel-sem-escopo' | outra,     // não vazia
  derruba: ['<rotulo1>', '<rotulo2>'],    // TEM de existir LITERALMENTE no roteiro como
                                           // `✗ <rotulo>` (raise warning/notice) OU
                                           // `assert_zero_de('<rotulo>...` — casamento por
                                           // TOKEN inteiro, nunca prefixo (mutacoes.test.mts:83-99)
  porque: 'frase > 40 caracteres',
  sql: 'DDL/DML que quebra o banco de propósito',  // > 10 caracteres
  prova: { sql: 'select ...', espera: 't' | 'f' }, // opcional mas recomendado (>= 90% das ativas têm)
  policies: [{ nome: 'nome da policy', tabela: 'tabela' }],  // opcional; se citado, TEM de
                                                              // existir em alguma migration
                                                              // como `create/alter policy "nome" on tabela`
}
```
Réguas de aceitação (`mutacoes.test.mts`):
- **Lote ATIVO** entre **20 e 68** (hoje o comentário indica ~67; ao somar mutações novas e passar de 68, o teto sobe COM justificativa escrita no comentário — é a convenção de toda fase anterior, ver o histórico em `mutacoes.test.mts:104-190`).
- **Quarentena < 1/3** do total (`ativos + quarentena`, :402-409) — cada entrada de `QUARENTENA` exige `fase` (formato `F\d+[A-Z]?`) e `indetectavel` (motivo > 60 caracteres) — usar quarentena é aceitável só quando a mutação é genuinamente indetectável hoje, e cada uma tem de nomear a fase que a adota.
- Nenhuma mutação EXECUTA `delete from|truncate|drop (database|schema|table)` como comando de TOPO (fora de corpo de função) — se ela reescreve uma função (`create or replace function`), só pode TIRAR guarda, nunca ACRESCENTAR um desses comandos ao corpo vigente (comparação byte a byte contra o corpo hoje).
- Zero patrimônio fora de `WAP0009xxx`/`WAP0001234` no catálogo inteiro (regra de dado fictício).

**Para F56 especificamente**, o fato 33 da ordem já nomeia as 4 mutações que a Frente F precisa reapontar para o texto novo (`import-revalidacao-nao-compara-o-vivo`, `import-sem-revalidacao-de-contagens`, `import-trilha-do-apagado-mente-nas-anotacoes`, `f52-import-perde-a-guarda-de-filial`) — são entradas EXISTENTES em `mutacoes.mjs` cujo campo `sql` cita o corpo da função recriada; `scripts/db/corpo-vigente.mjs:323-341` (`trocarNoCorpo`) lança erro no CARREGAMENTO do catálogo se o trecho que a mutação troca sumir ou aparecer duas vezes — ou seja, **reapontar não é opcional, é bloqueante**: o módulo nem carrega se o texto-alvo da mutação não bater mais com o corpo vigente da `0140`.

---

## 3. Quais roteiros o job `banco-sem-docker` executa, em que ordem, e o baseline

`scripts/db/rodar-roteiros.sh:59-64` monta a lista com `for f in "$PASTA"/*.sql` (glob do shell, ordem = ordem alfabética do NOME do arquivo — os roteiros **não têm prefixo numérico**, então a ordem é puramente léxica dos nomes), pulando qualquer `_*.sql`. Hoje (11/09/2026), **33 roteiros** rodam, nesta ordem exata:

```
asof_desempate.sql · asserts_ferramenta.sql · cargo_dev.sql · catalogo_policies.sql ·
catalogo_secdef.sql · conflito_filiais.sql · definer_sem_tenant.sql · dev_destrutivo.sql ·
dominios_login.sql · f34_triagem_reserva.sql · f36_detentor.sql · f37_colaboradores_tipos.sql ·
f38_itens_com_ativo.sql · f41_regularizacao.sql · fuso_do_negocio.sql ·
import_fora_da_unidade.sql · import_substituir.sql · integridade_alarme.sql ·
isolamento_tenant.sql · itens_extra.sql · itens_quantidade.sql · manutencao_fornecedor.sql ·
maquina_estados.sql · papeis_rls.sql · pendencias_import_termo.sql · pendencias_item.sql ·
reabrir_pendencia_item.sql · restauracao.sql · seguranca_catalogo.sql · storage_termo.sql ·
transferencia_item.sql · transicoes_extra.sql · troca.sql
```

(`_asserts.sql` é carregado ANTES de cada um, na mesma sessão psql — não conta como roteiro.)

**Divergência contra a documentação existente**: `docs/RUNBOOK-BANCO.md:470` e o comentário histórico de `.github/workflows/ci.yml:171` dizem *"25 roteiro(s), 577 asserções"* — esse número é de **06/09/2026** (v1.51.1, quando o job `banco` antigo saiu). Hoje são **33 roteiros**. Nenhum teste do repositório trava esse número 25/577 como string — é só documentação/comentário histórico, então **não é uma divergência que quebra CI**, só uma desatualização textual (fora do escopo desta ordem consertar, mas vale registrar para quem for atualizar `RUNBOOK-BANCO.md` §"O banco do CI na mesa" um dia).

**Contagem de asserções — limite desta medição (fato 43 confirmado)**: esta mesa não tem `psql` nem a CLI do Supabase no PATH, então **não dá para rodar `npm run db:test` e ler o número real de "N asserções, M falhas" que o runner imprime**. Como proxy ESTÁTICO (não é o número real — é uma contagem de ocorrências de `v_ok := v_ok + 1` no texto de cada arquivo, que subestima roteiros com `foreach`/loop, onde uma linha de código gera várias asserções em runtime):

| roteiro | proxy estático (`v_ok := v_ok + 1`) |
|---|---|
| dev_destrutivo.sql | 82 |
| cargo_dev.sql | 60 |
| papeis_rls.sql | 81 |
| conflito_filiais.sql | 50 |
| integridade_alarme.sql | 38 |
| f41_regularizacao.sql | 27 |
| f37_colaboradores_tipos.sql | 26 |
| f34_triagem_reserva.sql | 21 |
| import_substituir.sql | 19 |
| manutencao_fornecedor.sql | 19 |
| f38_itens_com_ativo.sql | 48 |
| f36_detentor.sql | 18 |
| transferencia_item.sql | 18 |
| asof_desempate.sql | 18 |
| catalogo_policies.sql | 15 |
| import_fora_da_unidade.sql | 14 |
| itens_quantidade.sql | 14 |
| maquina_estados.sql | 14 |
| pendencias_item.sql / restauracao.sql / storage_termo.sql | 13 cada |
| troca.sql / transicoes_extra.sql | 13 cada |
| catalogo_secdef.sql | 10 |
| isolamento_tenant.sql | 11 |
| definer_sem_tenant.sql | 6 |
| seguranca_catalogo.sql | 5 |
| fuso_do_negocio.sql / pendencias_import_termo.sql | 5 cada |
| asserts_ferramenta.sql | 7 |
| itens_extra.sql / reabrir_pendencia_item.sql | 4 cada |
| dominios_login.sql | 3 |
| **soma (proxy)** | **707** |

**É a LINHA DE BASE "antes"** para comparar depois que a fase acrescentar os cenários novos (Frente D, E, F) — mas o número REAL só sai lendo a saída do `banco-sem-docker` no PR (`gh run view --log-failed`, fato 43), nunca desta mesa. O implementador deve rodar isso DEPOIS de escrever os roteiros novos e comparar contra este proxy, sabendo que o proxy tende a SUBESTIMAR o real (loops multiplicam em runtime).

---

## 4. `db:types:diff` (fato 13) — exatamente o que ele exige, com prova de código

`scripts/db/diff-tipos.mjs:104-142` (consulta ao banco) + `scripts/db/tipos-conjuntos.mjs:74-128` (leitura do `database.ts` via compilador TypeScript, não regex — medido: regex de linha perde 5 de 59 funções por causa de entradas de uma linha só do gerador):

- **RELAÇÕES**: `relkind in ('r','p','v')` — TABELA nova entra automaticamente no conjunto comparado. Reprova se o banco tem uma relação que `database.ts` não tem.
- **COLUNAS**: `pg_attribute`, `attnum > 0 and not attisdropped` — toda coluna de tabela nova entra.
- **FUNÇÕES**: `prokind = 'f' and pg_get_function_result(oid) not in ('trigger','event_trigger')` — **SIM, função nova entra no conjunto comparado, seja `security definer` OU IMMUTABLE simples** (não há filtro por `prosecdef`). Só funções-gatilho (`returns trigger`) ficam de fora.
- Direção ÚNICA: reprova só quando o BANCO tem o que o ARQUIVO não tem. `database.ts` com objeto A MAIS é legítimo (aparece no log como diagnóstico, nunca falha).

**Consequência prática para F56**: tanto `unidades_apelidos`/tabela(s) de vocabulário QUANTO qualquer função IMMUTABLE nova (a chave normalizada da Decisão 1) precisam do hand-fix em `database.ts` **antes do primeiro push que contenha a `0139`** — porque o job aplica a `0139` num Postgres do CI (que não tem os tipos ainda) e mede a deriva ali. Sem o hand-fix, o push falha em *"Gate de deriva — o database.ts conhece tudo o que o banco tem"* citando `unidades_apelidos` e as colunas dela nomeadas uma a uma.

---

## 5. O hand-fix exato de `database.ts` para as tabelas novas

Molde copiado literalmente de `tipos_item` (`src/lib/types/database.ts:1123-1149`) e do padrão de FK de `operador_filiais` (`:805-837`, para `filial_id_fkey`). A ordem alfabética dentro de `Tables` importa para revisão (o gerador ordena assim; `unidades_apelidos` cairia entre `troca`/`termos_gerados` e o que vem antes de `v_*` — a posição exata depende de onde o gerador realmente a colocar; para o hand-fix isto não é crítico, só estética).

```ts
      unidades_apelidos: {
        Row: {
          apelido: string
          created_at: string
          filial_id: number
          id: number
        }
        Insert: {
          apelido: string
          created_at?: string
          filial_id: number
          id?: never
        }
        Update: {
          apelido?: string
          created_at?: string
          filial_id?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "unidades_apelidos_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
```

(A forma exata de `id` como `id?: never` no Insert/Update é o padrão de toda coluna `generated always as identity` — `tipos_item.id` é exatamente assim. Se a Decisão 1 acrescentar uma coluna gerada `apelido_chave text generated always as (…) stored`, ela entra como `Row: { apelido_chave: string }`, `Insert`/`Update`: **omitida** — colunas geradas não aparecem em Insert/Update no gerador do Supabase, confirmado pelo padrão de `colaboradores.nome_chave`, que também não aparece nos blocos Insert/Update daquela tabela.)

Para a(s) tabela(s) de vocabulário de Tipo/Situação/prefixo — a forma depende da Decisão 1 (não fechada por este relatório), mas o ESQUELETO do hand-fix é idêntico ao de `tipos_item` linha por linha (id smallint identity, mais as colunas específicas do desenho escolhido, `Relationships: []` se não houver FK).

---

## 6. Nomes propostos — policies, índices, constraints (coerentes com a casa)

**Para `public.unidades_apelidos`** (molde `0114_tipos_item.sql`, com FK, no padrão `0112_colaboradores.sql`/`operador_filiais`):

- Constraints: `unidades_apelidos_apelido_nao_vazio check (btrim(apelido) <> '')` (mesmo padrão de `tipos_item_rotulo_nao_vazio`, `0114:61`).
- Coluna gerada + índice único (se a Decisão 1 adotar chave normalizada em SQL, fato 10): `apelido_chave text generated always as (public.<nome-da-função>(apelido)) stored` + `create unique index unidades_apelidos_apelido_chave_uidx on public.unidades_apelidos (apelido_chave)` — molde exato de `colaboradores_nome_chave_uidx` (`0112:134`)/`itens_nome_chave_uidx` (`0125`, citado em `papeis_rls.sql:856`). **Atenção**: unicidade só DENTRO desta tabela não basta para a Decisão 2 (ambiguidade cruzada com `filiais.nome`) — isso exige checagem contra `filiais` também, provavelmente numa função `security definer` "construtora" chamada pela Server Action, e reforçada por um `CHECK`/trigger se quiser blindagem no banco (uma constraint `CHECK` não pode olhar outra tabela; um `before insert/update` trigger, sim — decisão de quem fechar a Decisão 1/2).
- Índice de apoio: `create index unidades_apelidos_filial_id_idx on public.unidades_apelidos (filial_id)` (molde `colaboradores_ativo_nome_idx`, `0112:140`, e a prática geral de indexar toda FK usada em join/filtro).
- Policies (padrão `tipos_item`, mas com DELETE real — porque a Frente E diz "inclui e remove" apelidos, diferente de `tipos_item`, que só desativa):
  - `"leitura operador" for select to authenticated using ((select public.papel_atual()) is not null)`
  - `"admin insere apelido" for insert to authenticated with check ((select public.e_admin()))`
  - `"admin apaga apelido" for delete to authenticated using ((select public.e_admin()))`
  - (sem UPDATE, se apelido só nasce/morre — remover+recriar é mais simples que editar; se a Decisão 13 quiser editar em vez de remover+recriar, acrescentar `"admin atualiza apelido"` no molde de `tipos_item`)
- Grants: `grant select, insert, delete on table public.unidades_apelidos to authenticated;`

**Para a(s) tabela(s) de vocabulário de Tipo/Situação/prefixo** — proposta de nome coerente com a casa (a forma final é Decisão 1, não fechada aqui): se for UMA tabela genérica, `public.vocabulario_import` (dominio/termo/valor/rotulo/ordem/ativo, no padrão `tipos_item`); se forem separadas por domínio (mais perto do padrão `tipos_item`/`motivos`, cada vocabulário sua tabela), `public.import_categorias`, `public.import_estados`, `public.import_prefixos_patrimonio` — com policies `"leitura operador"`/`"admin insere <domínio>"`/`"admin atualiza <domínio>"` no MESMO molde de `0114`, e (se a fase quiser reter a distinção "termo de entrada" × "forma de exibição" do fato 7) uma tabela irmã pequena `..._rotulos` ou uma coluna nullable `forma_exibicao` na própria tabela de termos.

---

## 7. Custo por decisão relevante a este relatório

| decisão da ordem | o que decide | custo/trade-off medido |
|---|---|---|
| Decisão 1 (parte "RLS" e "grants") | escrita de `unidades_apelidos`/vocabulário | zero custo de catálogo extra: seguir o molde `0114` inteiro (RLS+3 policies+grants explícitos) reaproveita 100% da infra de teste já existente (`catalogo_policies.sql` classifica por NOME, sem código extra; `seguranca_catalogo.sql` varre TODAS as tabelas por padrão, sem lista). O único custo real é o `k_piso_papel`/`k_negocio` (2 arrays, 1 linha cada) e o hand-fix de `database.ts`. |
| Decisão 9 (as contagens da FK, `p_contagens`) | reapontar as 4 mutações já nomeadas no fato 33 | **bloqueante, não opcional**: `trocarNoCorpo` (`corpo-vigente.mjs:323-341`) lança erro no CARREGAMENTO do módulo `mutacoes.mjs` se o trecho-alvo sumir do corpo vigente — ou seja, `npm run test` inteiro quebra (não só o roteiro de mutação) se a `0140` mudar o corpo das 3 funções sem reapontar as 4 entradas. Custo é obrigatório, não uma escolha de qualidade. |
| Decisão 12 (trava `sem-wapismo`) | fora do escopo deste relatório (é Frente H/fato 40), mas toca `lib/import/**`, não os catálogos SQL — **zero interseção** com os 6 roteiros/o catálogo oculto medidos aqui. |
| — (achado, não é decisão da ordem) | acrescentar `0139`/`0140` em `DA_F38` | **custo mínimo (2 linhas + comentário) mas 100% bloqueante e não documentado na lista de "leia antes" do prompt** — só aparece se alguém seguir a referência de `RUNBOOK-BANCO.md` até o fim. Pular isto derruba `npm run test` (não o CI de banco) com uma mensagem que não menciona F56 nem vocabulário — "migration nova sem cobertura em DA_F38" — o que pode confundir quem não sabe da existência deste arquivo. |

---

## 8. Armadilhas encontradas (para o relatório final da fase)

1. **`src/lib/itens/migrations-f38.test.ts` é um catálogo por NÚMERO de migration que a ordem de serviço não cita nominalmente** (só via `RUNBOOK-BANCO.md`, indiretamente). É o achado mais acionável deste relatório: sem ele, a primeira tentativa de `npm run test` depois de escrever `0139` reprova com uma mensagem que não fala de F56, vocabulário nem catálogo — fala só de "0139 sem cobertura em DA_F38". Quem não leu o RUNBOOK até a seção específica pode gastar um ciclo de depuração nisto.
2. **`comment on column public.eventos_admin.acao` é substituído por INTEIRO, nunca "acrescentado"** — a `0139` precisa copiar a string dos 21 verbos vigentes (dada literalmente na seção 2 acima) e ACRESCENTAR os novos, nunca escrever só o(s) verbo(s) novo(s). Esquecer um verbo antigo faz `dev-destrutivo.test.ts` reprovar nomeando o verbo que sumiu do comment (não do TypeScript) — o sentido do erro é fácil de ler ao contrário na primeira leitura.
3. **`import-uma-porta.test.ts` só entra em jogo se um nome NOVO começar com `import_`** — recriar as 3 funções existentes com a MESMA assinatura não toca este arquivo. Isto é uma NÃO-armadilha que vale registrar para não gastar tempo mexendo nele à toa.
4. **`catalogo_secdef.sql`/`definer_sem_tenant.sql` não precisam de mudança para as 3 funções recriadas da Frente F**, desde que a assinatura e os grants não mudem — a tentação de "atualizar por precaução" é desperdício de leitura; a única coisa que muda é o CORPO (que nenhum dos dois catálogos lê).
5. **`db:types:diff` compara por NOME de função, sem olhar `prosecdef`** — uma função IMMUTABLE nova (a chave normalizada) entra no mesmo gate que uma `security definer` nova. É fácil esquecer a IMMUTABLE porque ela "não parece de segurança".
6. **O número "25 roteiros, 577 asserções" em `RUNBOOK-BANCO.md`/comentário do `ci.yml` está desatualizado (hoje são 33 roteiros)** — não é travado por teste nenhum, então não quebra nada, mas quem for atualizar a documentação da fase deve saber que citar esse número como "estado atual" seria introduzir uma nova divergência, não corrigir uma.
7. **Esta mesa não tem `psql` nem a CLI do Supabase no PATH** (fato 43 reconfirmado agora, 11/09/2026, via `which psql`/`which supabase` na sessão Bash — os dois não resolvem) — a contagem REAL de asserções (o "antes" definitivo para comparar com o "depois") só existe lendo a saída do job `banco-sem-docker` no PR, nunca localmente. O proxy estático da seção 3 é o melhor substituto disponível sem banco. **Divergência pontual contra o fato 43**: nesta sessão (Git Bash) `which gh` RESOLVE (`/c/Program Files/GitHub CLI/gh`) — o fato 43 diz "pode não estar no PATH da sessão", o que é hipótese, não constatação; aqui, pelo menos, está. `node --version` = `v26.4.0`, batendo exatamente com o fato 43 ("Node 26.4").

---

## 9. O que este relatório NÃO prova

- Não roda `npm run test`, `npm run db:test` nem `npm run db:types:diff` de verdade (sem banco, sem psql) — todo checklist acima é LEITURA de código e cruzamento de referências, não execução.
- Não fecha a Decisão 1 (forma exata das tabelas de vocabulário) nem a Decisão 2 (mecanismo de ambiguidade) — propõe nomes coerentes mas a responsabilidade de fechar essas decisões é de quem implementa a Frente D.
- Não conferiu se `isolamento_tenant.sql`/`catalogos-seguranca.test.ts` precisam de mudança para o SMOKE (Frente G) — pela leitura, o smoke usa RPC/client administrativo, não `set local role authenticated`, então a interseção parece nula, mas isso não foi testado em banco.

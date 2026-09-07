# PLAN-F48 — Os catálogos de segurança

*Escrito em 07/09/2026, antes de qualquer linha de roteiro, a partir de medição própria das
migrations `0001`→`0128`. Ordem de serviço: `docs/prompts/F48-catalogos-de-seguranca-ultracode.md`.
Ficha de escopo: `docs/PLANO-MULTIEMPRESA.md` §5 → F48.*

---

## 0. O ambiente, conferido pelo MÉTODO

| o que | como conferi | resultado |
|---|---|---|
| Postgres na mesa | `winget list --name PostgreSQL` + `ls "/c/Program Files/PostgreSQL"` + `which psql pg_ctl` | **não existe** (as três negativas) |
| Docker na mesa | `winget list --name Docker` + `ls "/c/Program Files/Docker"` + `which docker` | **não existe** |
| `gh` | `ls "/c/Program Files/GitHub CLI/gh.exe"` | **existe**, v2.100.0, e está no PATH |
| MCP do Supabase | `ToolSearch "supabase database migration apply sql"` | **ausente** — nenhuma `apply_migration`/`execute_sql` |

**Consequências de desenho, herdadas da F46/F47 e reconfirmadas:**

1. **Nenhum roteiro se ensaia aqui.** O ciclo é commit → push → ler `banco-sem-docker`. Cada push
   é caro; a frente 7 (a trava de mesa, Vitest lendo os `.sql` como texto) é o que faz o ciclo
   seguinte custar zero push, e por isso ela nasce JUNTO de cada roteiro, não no fim.
2. **A `0128` continua sem aplicar em produção** (pendência da F47 §10.1). Sem MCP não há caminho;
   a ordem manda não insistir, não inventar caminho alternativo e não mexer em credencial. A
   pendência é carregada para o relatório da F48 com o mesmo texto honesto.
3. **Toda medição deste plano é LEITURA ESTÁTICA das migrations**, não leitura de banco. Onde o
   número medido aqui divergir do que o CI medir, **vale o CI**, e a divergência vira nota no
   relatório.

**Linha de base, na mesa, antes de começar:** `npm run lint` limpo · `npm run test` **158 arquivos,
3873 testes, 0 falhas** · `npx tsc --noEmit` limpo.

---

## 1. As quatro superfícies, MEDIDAS

### 1.1 Policies — **55 vivas (47 em `public` + 8 em `storage.objects`)**

A ficha diz **54 = 46 + 8**. A divergência é de **uma** policy e está inteiramente explicada:
a ficha foi escrita quando a última migration era a **`0127`** (o cabeçalho do plano diz
"126 migrations, a última é a `0127`"), e a **`0128`** — nascida na F47, *depois* da ficha — criou
`"dev le backup f6a"` em `public._bkp_relatorios_gerados_f6a`. **46 + 1 = 47.**

Método: varrer as 128 migrations somando `create policy` e `alter policy` e subtraindo
`drop policy`, com o statement recortado por profundidade de parêntese (o regex ingênuo perde a
policy cuja cláusula `for select` está na linha seguinte — foi assim que a primeira medição deu 54
por engano, e é por isso que este plano traz o método junto do número).

| tabela | policies | tabela | policies |
|---|---|---|---|
| `ativos` | 3 | `movimentacoes` | 2 |
| `anotacoes` | 2 | `operador_filiais` | 1 |
| `colaboradores` | 3 | `pendencias_item` | 3 |
| `eventos_admin` | 1 | `profiles` | 2 |
| `filiais` | 4 | `relatorios_gerados` | 2 |
| `import_logs` | 2 | `termos_gerados` | 4 |
| `itens` | 4 | `tipos_item` | 3 |
| `kits_modelos` | 4 | `_bkp_relatorios_gerados_f6a` | 1 |
| `lancamentos_item` | 2 | **`ambiente`** | **0** |
| `motivos` | 4 | **`senhas_acesso`** | **0** |
| | | **`senha_tentativas`** | **0** |
| | | `storage.objects` | 8 |

**Predicado equivalente a `true` na forma VIGENTE: ZERO.** As dezenas de `using (true)` das
migrations `0001`/`0005`/`0010`/`0014`/`0015`/`0017`/`0021` foram todas substituídas por
`alter policy` nas `0059`/`0063`/`0066`/`0067`/`0068`/`0069`/`0070`/`0072`/`0103`/`0107`. O último
`with check (true)` vivo era o do INSERT de `import_logs`, deixado de propósito pela `0063:229` e
fechado pela `0067:99` (`with check ((select public.e_admin()))`). A própria `0067` já traz, no
rodapé, a consulta de verificação que esta fase transforma em asserção permanente — com o
"esperado: 0 linhas" escrito ao lado.

Conferi ainda os `alter policy` PARCIAIS (os que poderiam deixar um `with check (true)` residual
para trás): `0059` (`atualiza proprio perfil`), `0103` e `0107` (`pendencias_item`) reescrevem
`using` **e** `with check` juntos. Nenhum resíduo.

### 1.2 Funções `security definer` — **37**, e a ficha acerta em cheio

| medida | valor | como |
|---|---|---|
| funções vivas em `public` (por nome) | **63** | `create [or replace] function` menos `drop function`, última definição vence |
| `security definer` | **37** | `security definer` no cabeçalho da definição VIGENTE |
| `security invoker` | **26** | o complemento |
| `search_path` travado nas 37 | **37/37** | 36 com `= public`, 1 com `= ''` (`registrar_tentativa_senha`, `0025`) |
| `security definer` SEM `search_path` | **0** | — |
| statements `revoke … on function` | **106** | a ficha diz 107; a divergência é de 1 e é de contagem de statement, não de cobertura |
| desses, citando `anon`/`public` | **101** | a ficha diz 79/77 — **medi mais, não menos** |
| `security definer` SEM revoke de `anon`/`public` | **0** | — |

⚠ **Corrigi um erro meu no caminho, e ele vale registro** porque é a armadilha exata desta medição:
a primeira passada modelou `create or replace function` como se restaurasse o grant default de
`PUBLIC`, e acusou 14 funções executáveis por `anon`. **Está errado:** o Postgres PRESERVA a ACL
existente ao substituir uma função. Corrigido o modelo para "houve algum revoke de `anon`/`public`
para este nome?", o resultado é **zero**. O CI é o árbitro final — a asserção lê
`has_function_privilege` ao vivo, não o histórico das migrations.

**As 5 INVOKER sem revoke** (o complemento honesto do quadro, e o que a asserção nova vai declarar
nominalmente): `chave_identidade_ativo` (`0099`, `immutable`), `hoje_brt` (`0124`, `stable`),
`mov_da_carga_import` (`0092`, `immutable`), `status_apos_movimentacao` (`0109`, `immutable`) e
`valida_lancamento_item` (`0118`, gatilho).

**As quatro primeiras são PURAS** — `immutable`/`stable`, calculam sobre os próprios argumentos e
não tocam tabela nenhuma. **A quinta é GATILHO, e o motivo dela é outro:** `valida_lancamento_item`
**lê `public.lancamentos_item`** (`0118:146-147`), mas (a) é `returns trigger`, então uma chamada
por `/rest/v1/rpc/*` falha — não há `NEW`/`OLD` fora de um trigger; e (b) sendo INVOKER, a leitura
vale com o privilégio de QUEM CHAMA e passa pela RLS de `lancamentos_item` como qualquer outra.
Nenhuma das cinco carrega privilégio; por isso a asserção nova as declara nominalmente **com o
motivo de cada uma**, em vez de isentar "as INVOKER" por categoria.

> **⚠ Correção da primeira versão deste plano (mesmo dia).** Ela dizia, das cinco, *"nenhuma lê
> tabela por conta própria"* — **falso** para `valida_lancamento_item`. A revisão adversarial
> pegou. A conclusão prática não muda (o `EXECUTE` continua inofensivo), mas a justificativa
> escrita estava errada, e num relatório de segurança é ela que alguém relê daqui a um ano para
> decidir se ainda vale.

### 1.3 Policies de `storage.objects` — **8**, e nenhuma decide só por `bucket_id`

| policy | verbo | predicado vigente (além de `bucket_id`) | fonte |
|---|---|---|---|
| `termos leitura operador` | SELECT | `(select papel_atual()) is not null` | `0070:212` |
| `termos insere operador` | INSERT | `pode_escrever()` + `pode_escrever_arquivo_termo(name)` | `0072` |
| `termos atualiza operador` | UPDATE | idem, nos dois lados | `0072` |
| `termos apaga operador` | DELETE | idem | `0072` |
| `backups-import leitura operador` | SELECT | `(select e_admin())` | `0066` |
| `backups-import insere operador` | INSERT | `(select e_admin())` | `0066` |
| `backups-import atualiza operador` | UPDATE | `(select e_admin())`, nos dois lados | `0066` |
| `backups-import apaga operador` | DELETE | `(select e_admin())` | `0066` |

**A forma proibida EXISTIU, e está escrita:** a `0070:137` documenta a reversão da policy de
leitura de termos como `using (bucket_id = 'termos')` — a forma exata que a asserção nova proíbe —
e as linhas `0070:202-207` explicam por que ela era um furo ("certo quanto ao CARGO, incompleto
quanto à SESSÃO: quem foi DESATIVADO continuava conseguindo `createSignedUrl` de qualquer .docx").

**Asserção nova, nenhuma hoje.** `grep` por `storage.objects` em `supabase/tests/` só acha
`papeis_rls.sql` (grant + cenários 6a..6f), que provam COMPORTAMENTO por sessão, não a FORMA do
predicado no catálogo. Uma policy nova de Storage entra hoje sem nada se mexer.

### 1.4 A publication do Realtime — **3 tabelas**

`movimentacoes` (`0009:23`), `lancamentos_item` (`0018:18`) e `anotacoes` (`0018:27`). Nenhum
`alter publication … drop table` em migration nenhuma. A `0050:37` registra por escrito que
`pendencias_item` **não** entra ("/pendencias não usa realtime") — **a ausência é decisão**, e a
asserção nova a trata como tal: o conjunto é congelado nos dois sentidos, então tanto acrescentar
quanto remover reprova.

**Asserção nova, nenhuma hoje.** `grep` por `pg_publication` / `supabase_realtime` em
`supabase/tests/` não devolve nada.

---

## 2. As três decisões obrigatórias

### Decisão 1 — o que é tabela de NEGÓCIO

**O critério, escrito antes de olhar a lista:**

> **NEGÓCIO** = o conteúdo pertence ao ACERVO ou à OPERAÇÃO de *uma* empresa e, na virada
> multiempresa, vai precisar da chave de recorte.
> **INFRA** = o conteúdo é do MECANISMO do sistema — identidade da conta, marcador de ambiente,
> backup congelado de uma fase — e não se recorta por empresa, ou se recortará por outro caminho
> (`membros`), em fase própria.

**INFRA — 5, cada uma com o motivo escrito:**

| tabela | motivo | migration |
|---|---|---|
| `profiles` | Identidade da CONTA, não do acervo. Na virada, o cargo migra para `membros.papel` (plano §5 → F62, decisão 6): quem se recorta é o vínculo, não a pessoa. | `0001` |
| `operador_filiais` | Vínculo de ESCRITA de uma conta. Mesmo destino de `profiles`: vira `membros`. | `0061` |
| `senha_tentativas` | Rate-limit por IP. Guarda um IP e um contador — nada de empresa nenhuma, nem sequer a senha a que a tentativa se referia —, e a própria migration a chama de *"Infra de segurança"*. | `0025:19` |
| `ambiente` | Marcador de DEPLOY. O `comment on table` da `0090` diz com todas as letras: *"Não é configuração da aplicação: nada no app lê esta tabela"*. Único consumidor: `resetar_dados_ficticios()`. | `0090` |
| `_bkp_relatorios_gerados_f6a` | Backup CONGELADO de uma fase, adotado no versionamento pela `0128`. O cabeçalho da `0128:101` diz *"histórico congelado; ninguém grava nela nunca mais"*. | `0128` |

**NEGÓCIO — 16:** `anotacoes`, `ativos`, `colaboradores`, `eventos_admin`, `filiais`,
`import_logs`, `itens`, `kits_modelos`, `lancamentos_item`, `motivos`, `movimentacoes`,
`pendencias_item`, `relatorios_gerados`, `senhas_acesso`, `termos_gerados`, `tipos_item`.

`senhas_acesso` é NEGÓCIO por determinação da ficha ("a virada precisa dela lá") e o critério
concorda: é a porta de leitura dos relatórios *de uma empresa*.

> **⚠ EMENDA À PRIMEIRA VERSÃO DESTE PLANO (mesmo dia).** Escrevi primeiro **17 negócio / 4
> infra**, com `senha_tentativas` em NEGÓCIO. O crítico de completude da exploração apontou que a
> `0025:19` a chama, na própria migration, de *"Infra de segurança"* — e o critério concorda:
> guarda um IP e um contador, e não se recorta por empresa. **Passou para INFRA.** A mudança de
> classe **não altera asserção nenhuma**: a asserção 3 cobra que toda tabela sem policy de SELECT,
> de QUALQUER classe, esteja na lista nominal de deny-all, e `senha_tentativas` continua lá com o
> mesmo motivo e a mesma migration. A decisão final está em `docs/DECISOES.md`
> (2026-09-07 · F48 · Decisão 1) e é a que o código aplica.

**⚠ A ARMADILHA, e o remédio.** Três tabelas têm RLS ligada e **ZERO policy**, de propósito
(deny-all por ausência; só o dono e as `security definer` dele entram):

| tabela | classe | migration que a deixou assim | motivo escrito na migration |
|---|---|---|---|
| `senhas_acesso` | negócio | `0005` cria duas, **`0012` dropa as duas** | a porta pública por senha é servida pelo service role |
| `senha_tentativas` | infra | `0025` liga a RLS e nunca cria policy | idem, rate-limit da mesma porta |
| `ambiente` | infra | `0090:53-56` | *"Sem NENHUMA policy: invisível para anon e authenticated. Só o dono (…) enxerga — mesmo idioma de `senhas_acesso`/`senha_tentativas`"* |

A asserção ingênua *"toda tabela de negócio tem policy de SELECT"* nasce **VERMELHA sobre a tabela
mais sensível do sistema**. O remédio é o da ordem — **exceção NOMINAL, com motivo escrito e
migration citada** — e ele vale para as três, inclusive a de infra:

- A lista deny-all é **nominal**, nunca por categoria, por prefixo ou por "tabela sensível".
- Ela é conferida **nos dois sentidos**: nome na lista que passe a TER policy de SELECT também
  reprova. Exceção não sobrevive ao motivo que a criou.
- E — a peça que fecha o buraco da categoria — a asserção irmã cobra que **toda** tabela de `public`
  sem SELECT esteja na lista nominal, **negócio ou infra**. Classificar como infra **não** isenta.
  Sem isso, "infra" viraria a nova isenção por categoria, que é exatamente o que a F47 arrancou
  deste mesmo acervo de roteiros.

> **`ambiente` é o achado de calibragem desta fase.** A ordem nomeia duas armadilhas
> (`senhas_acesso` e `valida_lancamento_item`) e manda procurar uma terceira. É esta: a ficha do
> plano não a menciona, e a asserção ingênua a acusaria junto com as outras duas.

### Decisão 2 — onde moram as duas varreduras schema-wide → **opção (a): ficam onde estão**

As asserções **2** (RLS ligada em toda tabela de `public`) e **3** (`security_invoker` em toda
view) de `seguranca_catalogo.sql` são também pedidas pela ficha em `isolamento_tenant.sql`. Duas
fontes para o mesmo fato é como um gate morre. **Escolha: ficam em `seguranca_catalogo.sql`, e os
dois arquivos novos apontam para lá.** O custo real, medido:

| o que mediria a opção (b) — migrar | número |
|---|---|
| mutações ATIVAS do injetor que miram o rótulo `2` de `seguranca_catalogo` | **2** (`catalogo-rls-desligada-numa-tabela`, `catalogo-tabela-de-backup-sem-rls`) |
| mutações ATIVAS que miram o rótulo `3` | **1** (`catalogo-view-sem-security-invoker`) |
| entradas de `mutacoes.mjs` a reapontar (`roteiro` + `derruba`) | **3** |
| ciclos de CI a gastar só para reprovar o que já está provado | ≥ 1 |
| ganho de cobertura | **zero** |

E há dois custos que não são de número:

1. O cabeçalho da asserção 2 é onde vive o **motivo escrito** da remoção da isenção por prefixo
   (F47) e a explicação de por que ela só foi possível depois da `0128`. Mover a asserção para
   longe do motivo órfã o motivo.
2. O `RELATORIO-F47.md` §6.6 cita `seguranca_catalogo` asserção 2 nominalmente, como a prova
   permanente do caso da tabela `_` sem RLS. Mover faz um relatório já publicado apontar para o
   vazio.

**Terceira opção avaliada e descartada:** levá-las para `catalogo_policies.sql`. Conceitualmente
defensável (RLS ligada É invariante de catálogo, não de inquilino), mas custa os mesmos 3
reapontamentos e os mesmos dois custos acima, por um ganho de arrumação. Não compensa.

**O que cada arquivo ganha:** `seguranca_catalogo.sql` ganha o ponteiro para os dois catálogos
novos e a nota de não-duplicação deliberada; `isolamento_tenant.sql` e `catalogo_policies.sql`
ganham, no cabeçalho, a frase que diz onde as duas varreduras moram e por quê. **Um caminho ou o
outro, nunca os dois** — e nenhum dos arquivos novos repete `relrowsecurity` ou `security_invoker`.

### Decisão 3 — o que fazer com desvio real

A régua da ordem, adotada sem emenda: desvio vira **ACHADO no relatório com severidade e ata**; a
asserção nasce **cobrando o estado correto**; se isso a fizer nascer vermelha, ela entra
**declarada e desligada por comentário, com a fase que a liga**, e isso é MANCHETE do relatório.
Nunca se afrouxa a asserção em silêncio até ficar verde.

**Aplicação medida: as quatro superfícies nascem VERDES.** Nenhuma invariante precisa nascer
desligada. O que sai desta fase como observação (não como desvio a corrigir):

| # | observação | severidade | por que não é correção desta fase |
|---|---|---|---|
| 1 | `ambiente` é uma terceira tabela deny-all que a ficha não previu | informativa | é DESENHO documentado na `0090`, não defeito; vira exceção nominal |
| 2 | 5 funções INVOKER sem `revoke` de `anon` | baixa | as cinco são puras/gatilho e não carregam privilégio; declaradas nominalmente |
| 3 | 55 policies medidas × 54 na ficha | informativa | a `0128` nasceu depois da ficha; o número medido ganha |

---

## 3. Os três roteiros novos

### 3.1 `catalogo_secdef.sql` — primeiro, porque é o menor e o de risco de calibragem mais nítido

Só-leitura de catálogo → **sem** `begin/rollback`, no molde de `seguranca_catalogo.sql`.

| # | asserção | universo | nasce |
|---|---|---|---|
| 1 | **A tabela-verdade**: o conjunto de `proname` com `prosecdef` em `public` é EXATAMENTE o classificado. Dos dois lados: função nova não classificada REPROVA; nome classificado que sumiu REPROVA. | 37 | verde |
| 2 | Nenhum nome `security definer` tem mais de uma assinatura viva (a classificação por nome só é honesta se não houver overload escondido). | 37 | verde |
| 3 | `search_path` travado em TODAS — lê `proconfig`, não a grafia da migration. | 37 | verde |
| 4 | Nenhuma executável por `anon` — `has_function_privilege`. | 37 | verde |
| 5 | **Exceção NOMINAL de `valida_lancamento_item`**: é INVOKER de propósito (`prosecdef = false`), motivo repetido por escrito + ponteiro para `seguranca_catalogo.sql:16-23` e migration `0038`. E a asserção é dupla: ela também NÃO pode aparecer na tabela-verdade das definer. | 1 | verde |
| 6 | **As INVOKER executáveis por `anon` são exatamente as 5 declaradas**, cada uma com o motivo. Dos dois lados: INVOKER nova alcançável por `anon` REPROVA. | 26 | verde |

A classificação é por **nome** (não por assinatura formatada) de propósito: `regprocedure` normaliza
o texto de um jeito que não se prevê sem banco, e a asserção 2 é o que torna o nome suficiente.

### 3.2 `catalogo_policies.sql` — as três superfícies declarativas

Só-leitura → sem `begin/rollback`. O cabeçalho diz por que as três moram juntas: são as três
superfícies que se leem do CATÁLOGO e não do comportamento, e separá-las em três arquivos
multiplicaria o cabeçalho sem multiplicar a cobertura.

| # | asserção | universo | nasce |
|---|---|---|---|
| 1 | **A tabela-verdade negócio × infra** cobre TODA tabela de `public` (`relkind in ('r','p')`). Dos dois lados. | 21 | verde |
| 2 | Toda tabela de NEGÓCIO tem policy de SELECT viva, salvo a lista NOMINAL deny-all. | 17 | verde |
| 3 | **Toda** tabela de `public` sem SELECT está na lista nominal — infra **não** é isenção. | 21 | verde |
| 4 | Simetria: nome na lista deny-all que TENHA policy de SELECT reprova. | 3 | verde |
| 5 | Nenhuma policy, em nenhum verbo, com `qual`/`with_check` equivalente a `true`. | 55 | verde |
| 6 | O piso `papel_atual()` está exatamente nas **15** policies de SELECT de `public` congeladas — comparação por `ilike '%papel_atual%'`, porque `pg_policies.qual` devolve a expressão NORMALIZADA. Dos dois lados. | 18 | verde |
| 7 | Nenhuma policy de `storage.objects` decide só por `bucket_id`: toda uma cita ao menos uma função do modelo de acesso. | 8 | verde |
| 8 | O conjunto de policies de `storage.objects` é o congelado (as 8 nominais). Dos dois lados. | 8 | verde |
| 9 | A publication `supabase_realtime` tem EXATAMENTE `{movimentacoes, lancamentos_item, anotacoes}`. Dos dois lados — tabela nova reprova, e tabela que sair também. | 3 | verde |

**As 15 do piso:** `anotacoes`, `ativos`, `colaboradores`, `filiais`, `itens`, `kits_modelos`,
`lancamentos_item`, `motivos`, `movimentacoes`, `operador_filiais`, `pendencias_item`, `profiles`,
`relatorios_gerados`, `termos_gerados`, `tipos_item`. As 3 restantes (de 18 SELECTs em `public`)
decidem por cargo: `eventos_admin` e `import_logs` por `e_admin()`, `_bkp_relatorios_gerados_f6a`
por `e_dev()` — e isso também é congelado, nominalmente, para que uma delas afrouxar para
`papel_atual()` reprove.

### 3.3 `isolamento_tenant.sql` — o arcabouço que já vale com uma empresa

**Com** `begin; … rollback;` (planta fixture). Traz o bloco de grants espelhado de
`papeis_rls.sql:91-146` (a ficha diz 90-127; MEDI o arquivo — o bloco começa no `grant select on` da linha 91 e termina no `$trava$;` da 146) com o mesmo comentário e a mesma trava, o cabeçalho com a convenção de
honestidade, a linha vazia da chave de recorte e o ponteiro da Decisão 2.

**⚠ Ele NÃO pode ser esqueleto vazio:** `rodar-roteiros.sh` reprova roteiro que conte zero asserção
e roteiro sem a linha `FIM`. E `assert_zero_de` LEVANTA EXCEÇÃO em universo vazio — um placeholder
que contasse zero mataria o bloco antes do `FIM` e o runner reprovaria por ausência da linha.

As asserções são sobre o **RIG**, não sobre regra de negócio — é isso que "arcabouço" quer dizer, e
é o que evita duplicar `papeis_rls.sql`. Cada uma é pré-condição dos cenários A↔B da F62:

| # | asserção | por que ela é o arcabouço |
|---|---|---|
| 1 | O papel com que este roteiro roda tem `rolsuper` ou `rolbypassrls`. | Se não tiver, "contei o universo como `postgres`" é mentira e toda a convenção de honestidade desaba. |
| 2 | `authenticated` NÃO tem bypass. | Sem isso, todo "viu zero" deste arquivo e dos outros 27 seria vazio. |
| 3 | `anon` NÃO tem bypass. | Idem, para a identidade pré-login. |
| 4 | `service_role` TEM bypass. | É a premissa escrita em 12 comentários de migration e a razão de o trigger `guarda_acervo` (`0081`) existir. Se ela cair, o raciocínio de todas elas envelheceu em silêncio. |
| 5 | O bloco de grants concedeu LEITURA às tabelas listadas (`has_table_privilege`). | É a asserção que impede "vi zero linhas" de ser `permission denied` disfarçado. |
| 6 | O bloco de grants concedeu ESCRITA às tabelas listadas. | Idem, do lado da escrita. |
| 7 | `authenticated` NÃO tem UPDATE de TABELA em `profiles` (só as duas colunas). | O grant que, devolvido, faria a asserção de escalada passar por engano. Espelho da trava do `papeis_rls.sql`. |
| 8 | **A convenção de honestidade, exercitada de ponta a ponta:** planta 2 ativos numa filial não vinculada, conta 2 como `postgres` (o universo, ANTES de qualquer "viu zero"), tenta o UPDATE como operador (0 linhas), e **de volta como `postgres`** prova que os 2 continuam com o valor original. | É a recusa provada DUAS vezes, e é o molde literal que os cenários A↔B vão copiar. |

**O que NÃO entra:** a varredura da chave de recorte nula. `grep -rn "empresa_id" supabase/migrations/`
devolve **0** — escrevê-la hoje seria erro de psql (coluna inexistente) ou tautologia sobre conjunto
vazio. Ela fica no cabeçalho como comentário, com a fase que a preenche (F63/F65) e o motivo de
estar vazia. **O arquivo não cita `empresa_id` em código** — e a frente 7 cobra isso.

---

## 4. A frente 6 — as três asserções fracas

| cenário | por que é fraco (medido) | conserto |
|---|---|---|
| **`2i-bis-3`** (`papeis_rls.sql:629-639`) | O INSERT usa `id = gen_random_uuid()` inline e `arquivo_path = 'forjado.docx'`. A **quarta** conjunção da policy `operador insere` (`0069:346-352`) — `arquivo_path = id::text \|\| '.docx'` — já recusa sozinha, antes de a âncora importar. O ✓ afirma "a âncora está no ar", que é mais do que ele sabe. | Guardar o `id` sorteado numa variável e dar ao INSERT `arquivo_path = v_id::text \|\| '.docx'`. As outras duas conjunções passam de propósito (`array_length > 0` = 1; `pode_escrever_termo(array[v_ativo_t1])` = true, porque o ativo é da filial DELE — é o ataque). Sobra **só** `termo_ancora_coerente(array[v_mov_t2], array[v_ativo_t1])`, que é falsa porque o conjunto derivado de `v_mov_t2` é `{v_ativo_t2}`. Mensagem corrigida para dizer o que ele prova. |
| **`1j` / `4i`** (`papeis_rls.sql:341-347` e `993-999`) | `1j` só prova que a leitura não foi RECUSADA (0 linhas com sucesso ≠ 42501) — verdade com a RLS ligada ou desligada. `4i` conta 0 e a mensagem afirma "(existe 1, viu 0)": a linha existe *se* `2j` (linha 717) tiver plantado, o que é frágil e não é contado. | Plantar **duas** linhas de `colaboradores` no SETUP, como `postgres`, e contar o universo ali. `1j` passa a exigir que o consulta ATIVO veja as duas (o outro lado do gate). `4i` passa a `assert_zero_de('4i …', v_vistos, v_plantados)` — universo não-vazio e medido. Com a RLS desligada, `4i` vê 2 de 2 e fica vermelho. |
| **`3d`** (`cargo_dev.sql:523-530`) | Aceita "0 sessões removidas" como sucesso: só confere que não houve exceção, nunca que o `delete` mirou o usuário certo. | Plantar **2** sessões de `k_operador` e **1** de `k_admin` em `auth.sessions` (o bootstrap do CI a cria com `id`+`user_id`, `supabase/ci/bootstrap-auth.sql:63`), chamar a RPC e provar as DUAS metades: devolveu **2**, e a **1** do outro usuário CONTINUA lá. Trocar `p_alvo` por outra variável derruba a segunda metade. |

**Depois, e só depois**, as três entradas da `QUARENTENA` sobem para o lote ATIVO, **no mesmo
commit** da asserção correspondente:

| id | roteiro | `derruba` depois do conserto |
|---|---|---|
| `ancora-do-termo-sempre-coerente` | `papeis_rls.sql` | `['2i-bis-3']` |
| `leitura-de-colaboradores-sem-piso` | `papeis_rls.sql` | `['4i']` — e **não** `1j`: com a RLS desligada, o consulta ATIVO continua vendo as duas, então `1j` não distingue. Declarar `1j` seria mentir sobre o que a mutação prova. |
| `gestao-encerrar-sessoes-mira-o-alvo-errado` | `cargo_dev.sql` | `['3d']` |

**A prova é o CI, não o diff.** Se alguma continuar indetectável, volta para a quarentena com o
motivo MEDIDO e a fase que a adota — resultado honesto, não fracasso.

**Trava que isto quebra e que se conserta no mesmo commit:** `mutacoes.test.mts` exige
`MUTACOES.length` entre **20 e 30**. 28 + 3 = **31**. O teto sobe, com o motivo escrito ao lado.
A quarentena cai de 5 para 2, e `2/33 = 6%` continua muito abaixo do terço da régua.

---

## 5. A frente 7 — `src/lib/validators/catalogos-seguranca.test.ts`

Vitest lendo os `.sql` como TEXTO, na mesa, sem banco. Cobra, no mínimo:

1. Os três roteiros novos existem e emitem `FIM <nome>: % asserções, % falhas` como última
   instrução do bloco (o molde que o `ci-passos.test.ts` describe 6 também cobra).
2. **Nenhum deles contém isenção por prefixo** — `left(relname, 1)`, `like '\_%'`, `not like '\_%'`,
   `substring(…, 1, 1)` e parentes. É a regressão exata que a F47 arrancou de
   `seguranca_catalogo.sql`, e ela não pode voltar por uma porta nova.
3. **Toda exceção nominal declarada vem com motivo escrito e a migration que a justifica** — para
   cada nome da lista deny-all e para `valida_lancamento_item`, o arquivo tem de citar o número da
   migration a menos de N linhas do nome.
4. `catalogo_policies` cita `pg_publication_tables` **e** `storage.objects`.
5. `catalogo_secdef` cita `prosecdef`, `proconfig` **e** `valida_lancamento_item`.
6. `isolamento_tenant` traz o bloco de grants **e NÃO cita `empresa_id`**.
7. **Decisão 2 travada:** os arquivos novos NÃO reimplementam `relrowsecurity` nem
   `security_invoker` (a duplicação que a decisão proíbe), e cada um traz o ponteiro para
   `seguranca_catalogo.sql`.
8. As sabotagens que provam que a própria trava sabe reprovar (o padrão do `describe 9` do
   `ci-passos.test.ts`): cada regra acima é exercitada contra um texto FALSO que a viole, e o
   teste afirma que a detecção dispara.

---

## 6. A ordem de entrega (não é livre)

1. ✅ Medir — feito, e é este documento.
2. `catalogo_secdef.sql` + a fatia da frente 7 que o cobre.
3. `catalogo_policies.sql` + a fatia da frente 7 que o cobre.
4. `isolamento_tenant.sql` + a fatia da frente 7 que o cobre (só depois da Decisão 2, que já está
   tomada acima).
5. `seguranca_catalogo.sql` ganha o ponteiro e a nota de não-duplicação (Decisão 2 aplicada).
6. Frente 6: os quatro cenários fortalecidos **e** as três mutações promovidas, no mesmo commit.
7. `docs/MATRIZ-REGRAS.md`: emenda F48 com `R-ACC-29`+ (a regra do `force row level security`, com
   as duas razões da `0070:50-63`, o `42P17` e as quatro superfícies).
8. CHANGELOG, `package.json` **1.53.0**, `registry.ts`, tag `v1.53.0`, ata, relatório, PR.

## 7. O que este plano NÃO prova

- **Que os números batem com o BANCO.** Toda medição aqui é leitura estática das migrations. O
  árbitro é o job `banco-sem-docker`, e as divergências vão para o relatório.
- **Que os números batem com PRODUÇÃO.** O CI mede um banco construído das migrations; a `0128`
  continua sem aplicar lá. É a mesma limitação honesta que a F47 escreveu do gate de deriva
  (`RELATORIO-F47.md` §4.4).
- **Que as três mutações promovidas serão detectadas.** Isso é o `npm run db:test:mutations` no CI
  que responde, e o resultado — qualquer que seja — vai para o relatório com o número medido.

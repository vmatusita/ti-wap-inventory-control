# F48 — Os catálogos de segurança

*Ordem de serviço gerada em 07/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco A.*

**Por que ela existe.** O sistema tem quatro superfícies por onde o dado sai, e **nenhuma delas é
enumerada por ninguém**: as policies vivas (a ficha do plano diz 54 — 46 em `public` + 8 em
`storage.objects`), as funções `security definer` (a ficha diz ~37), as policies de Storage e a
publication do Realtime. Não é que estejam mal feitas — a auditoria do plano diz o contrário, e o
hardening de grants é *melhor* do que parece: são **107** `revoke` de função nas migrations, **79**
citando `anon`. O que falta não é revogar. É **ser obrigado a revogar**. Hoje uma policy nova pode
nascer `using (true)`, uma `security definer` nova pode nascer executável por `anon`, uma tabela
pode entrar na publication do Realtime, e **nada no repositório se mexe** — nem o CI, nem um teste,
nem um roteiro. Na virada multiempresa, cada uma dessas quatro superfícies passa a ser um caminho
de vazamento entre inquilinos, e o momento de enumerá-las é **antes** de existir o segundo, não
depois.

A F47 é a razão de esta fase vir agora, e o §3 do plano diz por quê: *"F47 destrava F48. Escrever
quatro catálogos novos sem ter provado que roteiro SQL consegue ficar vermelho é escrever quatro
documentos."* O injetor existe, provou 28 quebras pelo cenário nomeado, e — melhor ainda — **achou
três asserções fracas de verdade**, que ficaram declaradas na quarentena com o nome desta fase ao
lado. Elas entram aqui.

**O que esta fase NÃO é.** Não é correção de policy, de função, de grant ou de RLS. Ela **enumera**
e **congela a linha de base**. Se um catálogo nascer vermelho contra o estado atual, isso é um
ACHADO de segurança — vai nomeado para o relatório e para a ata, com severidade, e a decisão sobre
corrigir é do Johnny, em fase própria. A única exceção — e ela é de ROTEIRO, não de sistema — são as
três asserções fracas que a F47 nomeou para cá (frente 6): fortalecer uma asserção que passa sobre
conjunto vazio não é mudar o comportamento do banco em uma vírgula.

**Seis fatos de leitura do repositório, em 07/09/2026, que a ficha do plano não tem.**

1. **A mesa do Johnny não tem Postgres nem Docker.** Provado com evidência positiva no
   `docs/RELATORIO-F46.md` §2.1 e reconfirmado na F47. Consequência dura: **os quatro catálogos não
   se ensaiam na mesa**; a iteração é commit → push → ler o job `banco-sem-docker`. Isso muda o
   desenho da fase: a maior fatia possível de trava tem de ser **verificável sem banco** (Vitest
   lendo os `.sql` como texto), senão a fase vira dez pushes às cegas. Foi assim que a F47 sobreviveu.
2. **O runner RECUSA roteiro que conte zero asserção, e exige a linha `FIM`.**
   `scripts/db/rodar-roteiros.sh` reprova (a) ausência de `FIM <nome>: N asserções, M falhas`,
   (b) `N = 0`, (c) `M ≠ 0`, (d) qualquer `NOTICE|WARNING: ✗`. **Isso mata a leitura ingênua de
   "esqueleto"**: um `isolamento_tenant.sql` que só declare estrutura e não asserte nada **derruba o
   CI no primeiro push**. Ele tem de nascer com asserções REAIS — as que já têm universo não-vazio
   hoje — ou não nascer.
3. **A varredura "nenhuma linha com a chave de recorte nula" NÃO PODE ser escrita hoje.** A chave de
   recorte é `empresa_id`, e ela nasce na F62/F63. Escrevê-la agora seria uma asserção sobre coluna
   inexistente (erro de psql) ou sobre conjunto vazio (`pg_temp.assert_zero_de` levanta exceção de
   propósito — leia o cabeçalho de `supabase/tests/_asserts.sql`). O que a F48 entrega desse item é
   o **arcabouço**: o bloco de grants, a convenção de honestidade e as varreduras que já têm universo.
4. **Duas das varreduras que a ficha manda pôr em `isolamento_tenant.sql` JÁ EXISTEM**, como
   asserções 2 e 3 de `supabase/tests/seguranca_catalogo.sql` (RLS em toda tabela de `public`;
   `security_invoker` em toda view). A asserção 2 é, inclusive, alvo de uma das 28 mutações do
   injetor. Duplicá-las cria duas fontes para o mesmo fato, e a que envelhecer primeiro vira a
   mentira. **É decisão obrigatória desta fase, e ela tem de ser registrada** (ver "As decisões
   obrigatórias", nº 2).
5. **`senhas_acesso` tem RLS ligada e ZERO policy — de propósito.** A `0005` criou duas, a `0012`
   dropou as duas (deny-all por ausência; só o service role entra, que é como a porta pública por
   senha funciona). `senha_tentativas` é igual, desde a `0025`. E a ficha do plano manda classificar
   `senhas_acesso` como tabela de **negócio**, não infra. Junte as duas frases: a asserção ingênua
   *"toda tabela de negócio tem policy de SELECT"* **nasce VERMELHA em cima da tabela mais sensível
   do sistema**. É o maior risco de calibragem desta fase, e a ficha não o menciona — ela só avisa do
   risco simétrico no `catalogo_secdef`. Trate os dois com o mesmo remédio: **exceção NOMINAL, com o
   motivo escrito e a migration que a criou**, nunca uma isenção por categoria ou por prefixo (foi
   exatamente uma isenção por prefixo sem motivo escrito que a F47 arrancou deste mesmo arquivo).
6. **A pendência da F47 continua aberta:** a migration `0128` **não foi aplicada em produção** — o
   MCP do Supabase não estava conectado naquela sessão (`RELATORIO-F47.md` §10.1). Enquanto isso,
   `seguranca_catalogo.sql`, já sem a isenção por prefixo, **acusaria `✗ 2` se rodasse contra
   produção**. Ele não roda lá (regra permanente 5), mas a divergência é real e é sua para fechar
   nesta janela, se o acesso existir.

**O método do §15 da F45 continua valendo:** *"comando não encontrado" é hipótese, não conclusão*.
E o método da F47 também: **número escrito na ficha se mede antes de repetir** — foram "34 asserções
tautológicas" que viraram 58 quando alguém contou.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Enumerar, POR CATÁLOGO DO POSTGRES e nunca por lista escrita à mão, as quatro superfícies de
segurança que hoje ninguém enumera — as policies de `public`, as policies de `storage.objects`, a
publication do Realtime e as funções `security definer` — e congelar a linha de base delas. Ao
final: `supabase/tests/catalogo_policies.sql` e `supabase/tests/catalogo_secdef.sql` verdes contra o
estado atual e reprovando policy `using (true)`, tabela de negócio sem SELECT, `security definer`
não classificada, `search_path` solto, `EXECUTE` de `anon`, policy de Storage que decide só por
`bucket_id` e tabela nova na publication; `supabase/tests/isolamento_tenant.sql` com o arcabouço que
JÁ vale com uma empresa (grants, convenção de honestidade, varreduras de universo não-vazio); as
três asserções fracas que a F47 nomeou para esta fase fortalecidas e as três mutações
correspondentes movidas da quarentena para o lote ativo do injetor; a regra "`force row level
security` continua proibido" escrita em `docs/MATRIZ-REGRAS.md` com o `42P17` ao lado; versão
**1.53.0** com tag publicada; PR mergeado com `verificar` e `banco-sem-docker` verdes.
**Sem dependência nova, sem migration de schema, sem corrigir uma única policy, função ou grant.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo e as 8 regras permanentes. A **3** (custo R$ 0, stack
  FECHADA — nenhum pacote novo, nem em `devDependencies`), a **5** (roteiro NUNCA aponta para
  produção: os roteiros escrevem, mesmo dentro de `begin; … rollback;`) e a **8** (versão) decidem
  metade das escolhas desta fase e não se reinterpretam. Leia também, no mesmo arquivo, o parágrafo
  gigante do **modelo de acesso** — ele é a fonte de verdade em prosa do que os catálogos vão
  enumerar em SQL: `papel_atual()`/`e_admin()`/`e_dev()`/`pode_escrever()`/`pode_escrever_filial()`,
  as duas exceções de INSERT do operador (`colaboradores` F37 e `itens` F41), o contraste deliberado
  com `tipos_item`, o piso de leitura, e as duas portas.
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns a TODAS as fases, que
  herdam para cá sem repetição — em especial a **2**, estado de repouso, e a **3**, escopo fora
  explícito), **§5 → F48** (a ficha: Objetivo / Entra / Não entra / Entregas / Pronto quando / Trava
  / Dependências / Risco / Reversão) e **§3** ("F47 destrava F48", e por quê).
  ⚠ **A ficha da F48 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem, vale
  a ficha, e a divergência vira nota no relatório. As divergências que já conheço estão em "O
  diagnóstico" abaixo — confirme cada uma antes de agir.
- `@docs/RELATORIO-F47.md` — é o estado de onde você parte, não história. Leia §3.4 (a quarentena,
  com as três entradas que dizem `F48`), §3.5 (o achado `2i-bis-3`, escrito por inteiro), §3.6 (o
  raio de explosão de cada mutação — dado que você vai querer), §4.4 (o limite honesto do gate),
  §10.1 (a pendência da `0128`) e §10.2 (o backlog nomeado para ESTA fase, com a medição das 58
  asserções tautológicas e a distribuição por arquivo).
- `@supabase/tests/seguranca_catalogo.sql` — **leia o arquivo inteiro, comentários incluídos.** Ele
  é o ancestral dos catálogos que você vai escrever e já resolveu dois problemas que você vai ter:
  (a) a exceção NOMINAL com motivo escrito (`valida_lancamento_item`, linhas 16-23 e asserção 4c) e
  (b) por que a isenção por CATEGORIA foi arrancada na F47 (o comentário da asserção 2). As
  asserções 2 e 3 dele são as duas varreduras que a ficha da F48 também pede em
  `isolamento_tenant.sql` — ver Decisão 2.
- `@supabase/tests/_asserts.sql` — `pg_temp.assert_zero_de(rotulo, ruins, universo)` e a razão de
  ela LEVANTAR EXCEÇÃO em universo vazio. Toda varredura nova sua usa esta função. Leia o cabeçalho
  antes de desenhar qualquer contagem.
- `@supabase/tests/asserts_ferramenta.sql` — o modelo de como este repositório prova que uma
  verificação sabe reprovar.
- `@supabase/tests/papeis_rls.sql` — o maior roteiro. Duas coisas aqui: o **bloco de grants**
  (~linhas 80-127, com a trava que o protege e o comentário explicando por que é lista explícita e
  não `all tables`) — ele é o que `isolamento_tenant.sql` precisa espelhar, e sem ele "vi zero
  linhas" no Postgres do CI é `permission denied` disfarçado, ou seja, o roteiro mentindo onde não
  pode. E os **cenários `1j`, `4i` e `2i-bis-3`**, que a frente 6 conserta.
- `@supabase/tests/cargo_dev.sql` — o cenário `3d`, que a frente 6 conserta.
- `@scripts/db/rodar-roteiros.sh` — o runner ÚNICO, e as quatro coisas que ele reprova. Ele
  auto-descobre `supabase/tests/*.sql` (pulando `_*.sql`): roteiro novo entra no CI **sem tocar no
  YAML**. Leia o cabeçalho inteiro antes de escrever a primeira linha de roteiro novo.
- `@scripts/db/mutacoes.mjs` — o CATÁLOGO de mutações e a **QUARENTENA** no fim do arquivo. Leia os
  campos (`id`, `roteiro`, `classe`, `derruba`, `porque`, `sql`, `prova`, `policies`) e o comentário
  que diz que catálogo e motor são arquivos separados de propósito, e que a F51/F52 mexem AQUI.
  Você mexe aqui também.
- `@scripts/db/mutacoes.test.mts` — a trava de mesa do catálogo: rótulo que existe literalmente no
  fonte do roteiro, quarentena não-executável, toda entrada nomeando uma fase, teto de um terço.
  Mover três entradas da quarentena para o lote ativo passa por ela.
- `@src/lib/ci-passos.test.ts` — o *describe* 6 varre `supabase/tests/*.sql` e cobra o molde da
  linha `FIM` de **cada** arquivo. Seus roteiros novos entram nessa varredura automaticamente. Leia
  antes, para nascer conforme em vez de descobrir no CI.
- `@docs/MATRIZ-REGRAS.md`, seção **A6 — Acesso e segurança de dados (R-ACC)**, e em especial
  **R-ACC-25**, que já cita `relforcerowsecurity = false` e o `42P17`. O último id em uso é
  `R-ACC-28`. As emendas por fase ficam no fim do arquivo, cada uma com o "Contador desta matriz"
  atualizado — siga esse padrão.
- `@supabase/migrations/0070_papeis_leitura_perfil_ativo.sql` — a seção que documenta, uma quatro
  linhas abaixo da outra, as DUAS razões de `force row level security` ser proibido. É a fonte da
  regra que você vai escrever na matriz; não a reescreva de memória, cite as linhas.
- `@supabase/migrations/0009_realtime.sql` e `@supabase/migrations/0018_realtime_v2.sql` — a
  publication `supabase_realtime` e as três tabelas que entraram nela. Repare no comentário da
  `0050`, que diz explicitamente que `pendencias_item` **não** entra: a ausência é decisão, e a
  asserção nova tem de tratá-la como tal.
- `@supabase/migrations/0021_termos_gerados.sql`, `@0031_import_logs.sql`, `@0066_papeis_storage.sql`,
  `@0069_termos_mesma_filial.sql`, `@0070…`, `@0072_papel_dev_funcoes.sql` — as 8 policies de
  `storage.objects` nascendo e sendo emendadas. Repare no comentário da `0070` que mostra o
  predicado ANTIGO do `termos leitura operador`: `using (bucket_id = 'termos')`. **É exatamente a
  forma que a asserção de Storage vai proibir** — o que prova que ela tem dentes e que passa hoje.
- `@supabase/migrations/0128_adota_bkp_relatorios_f6a.sql` — a última migration, e o bloco
  *VERIFICAÇÃO PÓS-APPLY* no rodapé dela.
- `@docs/RUNBOOK-BANCO.md` — o caminho A de apply e a seção "O banco do CI na mesa".

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR

Nenhum item é para acreditar. Cada um tem uma consulta ou um comando que o confirma ou o derruba, e
o relatório registra o que VOCÊ mediu, inclusive quando bater com o que está escrito aqui.

1. **A mesa não tem Postgres nem Docker** (`RELATORIO-F46.md` §2.1). Confirme pelo MÉTODO
   (gerenciador de pacotes / disco), não por `command not found`. Se APARECER um Postgres 17, a fase
   inteira se ensaia local e o perfil da execução muda — diga isso no relatório e aproveite.
   Enquanto não aparecer: **maximize a trava verificável sem banco** (frente 7) e trate cada push
   como caro.
2. **O runner recusa roteiro com zero asserção e sem `FIM`.** Leia `rodar-roteiros.sh` e confirme as
   quatro reprovações. Consequência de desenho: `isolamento_tenant.sql` **não pode ser um esqueleto
   vazio**. Ou nasce com asserções reais de universo não-vazio, ou não nasce.
3. **A varredura da "chave de recorte nula" não é escrevível hoje** — `empresa_id` não existe
   (`grep -rn "empresa_id" supabase/migrations/ | wc -l` devolve 0; confirme). Ela é da F63/F65.
   Escrever um placeholder que conte zero é pior do que não escrever: `assert_zero_de` levanta
   exceção, o roteiro morre antes do `FIM`, e o runner reprova por ausência da linha.
4. **As asserções 2 e 3 de `seguranca_catalogo.sql` já são duas das varreduras que a ficha pede.**
   Confirme lendo o arquivo. Isso é a Decisão 2 e não se resolve por instinto.
5. **`senhas_acesso` e `senha_tentativas` têm RLS ligada e ZERO policy viva.** Confirme somando
   `create policy` e `drop policy if exists` nas migrations (`0005` cria duas, `0012` dropa as duas;
   `0025` liga a RLS de `senha_tentativas` e nunca cria policy) e, no CI, contra `pg_policies`. E
   confirme que a ficha manda classificar `senhas_acesso` como **negócio**. É a maior armadilha de
   calibragem da fase.
6. **Os números da ficha (54 policies = 46 + 8; ~37 `security definer`) são para MEDIR, não para
   repetir.** Meça contra o banco do CI, use o número medido, e registre a divergência se houver —
   exatamente como a F47 fez com as 58 asserções. Ponto de partida da leitura de mesa: `create
   policy` nas migrations soma 70 e `drop policy if exists` soma 16, o que não dá 54 sem contar os
   `alter policy`; e `src/lib/types/database.ts` expõe 59 funções, que não é o mesmo conjunto das
   `security definer`. **Só o catálogo responde.**
7. **A `0128` não está em produção** (`RELATORIO-F47.md` §10.1). Confirme se o MCP do Supabase está
   conectado nesta sessão antes de planejar qualquer apply.

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste`
- `npm run db:test` (todos os roteiros) e `npm run db:test:um supabase/tests/<arquivo>.sql`
- `npm run db:test:mutations` (o injetor) · `npm run db:types:diff` (o gate de deriva)
- `npm run db:lock` — **só** ao acrescentar migration. Esta fase não acrescenta.
- `gh run watch` / `gh run view --log-failed` — o `gh` EXISTE nesta máquina (F45 §15); pode não estar
  no PATH da sessão.

# Escopo

## Dentro

### 1. `supabase/tests/catalogo_policies.sql` — a superfície DECLARATIVA de leitura
Um roteiro novo, só-leitura de catálogo (`pg_policies`, `pg_class`, `pg_publication_tables`), no
molde de `seguranca_catalogo.sql`: sem `begin/rollback`, com `v_ok`/`v_falhas` e a linha `FIM`. Ele
cobre TRÊS superfícies declarativas, e o cabeçalho do arquivo diz por que as três moram juntas:

- **Policies de `public`.** Toda tabela de NEGÓCIO tem policy de SELECT. Nenhuma policy, em nenhum
  verbo, tem `qual`/`with_check` equivalente a `true`. O piso `papel_atual()` está exatamente onde
  está hoje — compare por `ilike '%papel_atual%'`, porque `pg_policies.qual` devolve a expressão
  NORMALIZADA pelo Postgres (`(select public.papel_atual())` pode voltar reescrito), nunca o texto
  que a migration escreveu.
- **Policies de `storage.objects`.** Nenhuma cujo `using` decida **só** por `bucket_id`. Hoje não
  existe uma única asserção sobre Storage no repositório.
- **A publication do Realtime.** Varra `pg_publication_tables` e congele o conjunto: as tabelas que
  estão na `supabase_realtime` são exatamente as que a `0009` e a `0018` colocaram lá. O Realtime é
  a única superfície de leitura que não aparece em inventário nenhum — nem no tripwire do viewer,
  nem em `papeis_rls.sql`.

**A classificação negócio × infra é uma TABELA-VERDADE dentro do roteiro, não um filtro esperto.**
Tabela nova não classificada REPROVA — é isso que faz o catálogo ser derivado e não uma lista que
envelhece. `senhas_acesso` é **negócio** (a virada precisa dela lá) e é, ao mesmo tempo, deny-all
por ausência de policy: ela entra como **exceção NOMINAL**, com o motivo escrito no roteiro e a
migration (`0012`) citada — jamais como isenção por prefixo, por categoria ou por "tabela sensível".
Mesmo tratamento para `senha_tentativas` (`0025`) e para o que mais você medir nessa condição.

### 2. `supabase/tests/catalogo_secdef.sql` — a tabela-verdade das `security definer`
Roteiro novo, mesmo molde. O conjunto sai do catálogo (`pg_proc.prosecdef`), nunca de uma lista.
Asserções que já valem hoje, e que o repositório já cumpre:
- `search_path` travado em **todas** — leia `pg_proc.proconfig`, e repare que as migrations usam
  três grafias (`set search_path = public`, `set search_path to 'public'`, `set search_path = ''`);
  a asserção olha o efeito no catálogo, não a grafia.
- Nenhuma executável por `anon` (`has_function_privilege`).
- **Função nova não classificada REPROVA.** É o coração do arquivo.
- **Exceção NOMINAL para `valida_lancamento_item`**, que é INVOKER de propósito e cujo motivo o
  `seguranca_catalogo.sql:16-23` já explica. Repita o motivo por escrito no arquivo novo e aponte
  para lá. **Sem essa exceção o catálogo nasce ✗ permanente, e gate que nasce vermelho por motivo
  legítimo é gate que alguém desliga.** É requisito, não opção.
Se a varredura encontrar QUALQUER função fora dessas invariantes, isso é ACHADO: nomeie no relatório
com severidade e ata, **não conserte**.

### 3. `supabase/tests/isolamento_tenant.sql` — o arcabouço que já vale com uma empresa
Roteiro novo, este com `begin; … rollback;` (ele planta fixture). Só as partes que valem HOJE:
- **O bloco de grants espelhado de `papeis_rls.sql`** (~80-127), com o mesmo comentário explicando
  por que é lista explícita e não `grant … on all tables`: no Postgres do CI o `authenticated` não
  tem GRANT, e sem isso "vi zero linhas" é `permission denied` disfarçado — o roteiro mentindo
  exatamente onde não pode mentir. Copie a trava que protege esse bloco junto.
- **A convenção de honestidade, escrita no cabeçalho e OBEDECIDA pelas asserções:** fixture contada
  como `postgres` **antes** de qualquer "viu zero"; toda recusa provada DUAS vezes (a operação falha
  E, de volta como `postgres`, o dado original continua intacto); FK composta provada com o par
  simétrico, porque "recusou" sem o par pode estar recusando por outro motivo.
- **As varreduras schema-wide que têm universo não-vazio hoje** — conforme a Decisão 2.
- **NÃO** escreva a varredura de "chave de recorte nula": `empresa_id` não existe. Deixe no
  cabeçalho, como comentário, a linha que a F63/F65 vai preencher, dizendo por que ela está vazia.
- Os cenários A↔B nascem na F62. Este arquivo é o lugar deles, e o cabeçalho diz isso.

### 4. `supabase/tests/seguranca_catalogo.sql` — estendido, não duplicado
O que ele ganha sai da Decisão 2. O que ele NÃO pode ganhar é uma segunda cópia de coisa que já
está nele. Se a decisão for manter as varreduras 2 e 3 aqui, o arquivo ganha o ponteiro para os
catálogos novos e a nota de não-duplicação deliberada; se for movê-las, ele perde as duas e ganha o
ponteiro. Um caminho ou o outro, nunca os dois.

### 5. `docs/MATRIZ-REGRAS.md` — a regra escrita
Uma emenda F48 no fim do arquivo, no padrão das emendas F25/F26/F34 (contador atualizado), com a
regra nova a partir de `R-ACC-29`: **`force row level security` continua proibido**, com o `42P17`
esperado ao lado e as DUAS razões, citando `0070` linha a linha — em `profiles` derruba o sistema com
erro em toda leitura para todo mundo ao mesmo tempo (`papel_atual()` lê `profiles`, a policy de
`profiles` chama `papel_atual()`, e o ciclo só não fecha porque a função roda como dono); em
`ativos`, `pendencias_item` e `movimentacoes` quebra `aplicar_movimentacao` e o trigger da `0051`,
que escrevem fora de policy contando com o bypass do dono. Acrescente as linhas R-ACC das quatro
superfícies enumeradas, cada uma apontando o roteiro que a prova.

### 6. As três asserções fracas que a F47 nomeou para esta fase — adotadas
Decisão do Johnny, 07/09/2026: **a F48 adota as três**. Fortalecer uma asserção que passa sobre
conjunto vazio é conserto de ROTEIRO, não de policy — o escopo "não corrige policy nem função"
continua intacto, e você não muda uma vírgula do comportamento do banco.
- **`2i-bis-3` de `papeis_rls.sql`** (`RELATORIO-F47.md` §3.5): o cenário prova a CONJUNÇÃO das
  quatro invariantes do `with check`, mas a mensagem de ✓ afirma que "a âncora está no ar". Dê ao
  INSERT um `arquivo_path` coerente (`id::text || '.docx'`), de modo que a âncora seja a ÚNICA
  barreira restante, e corrija a mensagem para dizer o que ele prova.
- **`1j` e `4i` de `papeis_rls.sql`**: o roteiro não planta linha nenhuma em `colaboradores`, então
  "viu 0 linhas" continua verdadeiro com a RLS desligada. Plante fixture e use `assert_zero_de` com
  o universo de verdade.
- **`3d` de `cargo_dev.sql`**: aceita "0 sessões removidas" como sucesso — só confere que não houve
  exceção, nunca que o `delete` mirou o usuário certo. Prove o alvo.
Depois: **mova as três entradas correspondentes da `QUARENTENA` para o lote ATIVO** de
`scripts/db/mutacoes.mjs` (`ancora-do-termo-sempre-coerente`, `leitura-de-colaboradores-sem-piso`,
`gestao-encerrar-sessoes-mira-o-alvo-errado`) e deixe o injetor provar, no CI, que agora elas são
detectadas pelo cenário nomeado. **Essa é a prova de que a frente 6 funcionou** — não a sua leitura
do diff. Se alguma continuar indetectável, ela volta para a quarentena com o motivo MEDIDO e a fase
que a adota, e isso é resultado honesto, não fracasso.

### 7. A trava que roda na mesa, sem banco — `src/lib/validators/catalogos-seguranca.test.ts`
A mesa não tem Postgres; sem isto, cada calibragem custa um ciclo de CI. Vitest lendo os `.sql` como
TEXTO e cobrando, no mínimo: os três roteiros novos existem e emitem `FIM <nome>`; nenhum deles
contém isenção por prefixo (`left(relname, 1)`, `like '\_%'` e parentes) — é a regressão exata que a
F47 arrancou; toda exceção nominal declarada vem acompanhada de motivo escrito e da migration que a
justifica; `catalogo_policies` cita `pg_publication_tables` e `storage.objects`; `catalogo_secdef`
cita `prosecdef`, `proconfig` e `valida_lancamento_item`; `isolamento_tenant` traz o bloco de grants
e NÃO cita `empresa_id`. Acrescente as sabotagens que provam que ela sabe reprovar (o padrão é o
`describe 9` do `ci-passos.test.ts` e as evidências da F47).

### 8. A `0128` em produção — tente, e siga se não der
No começo da fase, confira se o MCP do Supabase está conectado. Se estiver: aplique
`supabase/migrations/0128_adota_bkp_relatorios_f6a.sql` pelo caminho A do `RUNBOOK-BANCO.md` e rode
as três consultas do bloco *VERIFICAÇÃO PÓS-APPLY* no rodapé (a terceira tem de devolver **2**).
Se não estiver, ou se o acesso for recusado: **não insista, não invente caminho alternativo, não
mexa em credencial** — carregue a pendência para o relatório da F48 com o mesmo texto honesto da
F47, e siga. A fase não fica pela metade por causa disso.

### 9. O fechamento de sempre
`npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; entrada no
`CHANGELOG.md`; bump MINOR para **1.53.0** no `package.json`; entrada no topo de
`src/lib/versoes/registry.ts` (2 a 6 mudanças em LINGUAGEM DE OPERADOR — há teste que recusa
vocabulário de desenvolvedor); tag anotada `v1.53.0` publicada; ata em `docs/DECISOES.md`;
`docs/RELATORIO-F48.md`; PR mergeado com os dois checks verdes.

## Fora — não toque
- **Nenhuma correção de policy, função, grant, RLS ou trigger.** Achado vira linha no relatório com
  severidade e ata, nunca commit. Esta é a regra que define a fase.
- **Nenhuma migration de schema.** A última continua sendo a `0128`. (Se você concluir que alguma
  invariante EXIGE migration, isso é achado + proposta escrita, não código.)
- Nenhuma conversão em massa das 58 asserções tautológicas medidas pela F47. Só as três nomeadas.
- Nenhum job novo no `ci.yml`, nenhuma mudança na branch protection, nenhum passo condicional.
  Roteiro novo entra pelo auto-descobrimento do runner — confirme isso e não mexa no YAML por causa
  disso. (Se o YAML mudar por outro motivo, `ci-passos.test.ts` cobra você.)
- Nenhuma dependência nova, nem em `devDependencies`. Nenhum recurso pago.
- Nenhum dado real: nome de colaborador, patrimônio ou linha de planilha da WAP não entra em
  fixture, roteiro, mutação, evidência ou comentário. Tudo sintético (`WAP0001234` / "Fulano").
- Não converta `pendencias_item` nem nada em membro da publication do Realtime "já que estou aqui".
- Backlog: o comentário morto em `scripts/gen-types.ts` (cita o job `banco`, removido na v1.51.1) e a
  exclusão `_%` em `supabase/ci/impressao-schema.sql` (cujo motivo escrito envelheceu com a `0128`).
  Os dois são entrega avulsa PATCH, nomeados no relatório da F47 §10.3. **Não são desta fase.**

# A ordem de entrega não é livre
1. **Medir primeiro, escrever depois.** As contagens reais das quatro superfícies saem do catálogo,
   e do banco do CI, antes de qualquer asserção existir. Um catálogo escrito a partir do número da
   ficha nasce errado.
2. **`catalogo_secdef.sql` antes de `catalogo_policies.sql`** — é o menor, o de risco de calibragem
   mais nítido (a exceção nominal) e o que te ensina o formato do ciclo de CI sem banco.
3. **`catalogo_policies.sql` depois**, com as três superfícies.
4. **A trava de mesa (frente 7) junto de cada roteiro**, não no fim: é ela que faz o ciclo seguinte
   custar zero push.
5. **`isolamento_tenant.sql` só depois da Decisão 2 registrada** — senão você escreve duplicata e a
   apaga.
6. **A frente 6 (as três asserções) por último entre as de código**, e as mutações saem da
   quarentena **no mesmo commit** em que a asserção correspondente fica forte. Sair antes é o
   injetor reprovando por motivo certo na hora errada.
7. **Matriz, CHANGELOG, versão, tag e PR no fim.**

# As decisões obrigatórias — meça antes de decidir, registre em `docs/DECISOES.md`
**Decisão 1 — o que é tabela de NEGÓCIO.** A classificação é a espinha do `catalogo_policies`.
Escreva o critério, aplique-o a todas as tabelas medidas, e registre nome a nome as que ficarem em
"infra" com o motivo. `senhas_acesso` é negócio (ficha do plano) E deny-all por ausência de policy
(`0012`): as duas coisas juntas exigem exceção nominal com motivo escrito. Nunca isenção por
categoria.

**Decisão 2 — onde moram as duas varreduras schema-wide** (RLS em toda tabela de `public`;
`security_invoker` em toda view), que hoje são as asserções 2 e 3 de `seguranca_catalogo.sql` e que a
ficha também pede em `isolamento_tenant.sql`. **Duas fontes para o mesmo fato é como um gate morre.**
As opções sérias: (a) **ficam onde estão** e `isolamento_tenant.sql` aponta para lá — barato,
preserva a mutação do injetor que já mira a asserção 2, e o custo é que o roteiro do isolamento não
se lê sozinho; (b) **migram** para `isolamento_tenant.sql` e `seguranca_catalogo.sql` aponta para lá
— o roteiro do isolamento fica autocontido, e o custo é reapontar a mutação existente e um ciclo de
CI a mais. Meça o custo real (qual mutação mira o quê) e decida. **Não faça as duas.**

**Decisão 3 — o que acontece quando um catálogo encontra um desvio real.** A ficha diz "esta fase só
enumera". Sua régua, e ela vale para as quatro superfícies: desvio encontrado vira ACHADO no
relatório com severidade e ata; a asserção nasce **cobrando o estado correto** e, se isso a fizer
nascer vermelha, o catálogo entra com aquela invariante **declarada e desligada por comentário**,
com a fase que a liga — e isso é MANCHETE do relatório, não rodapé. O que não se faz é afrouxar a
asserção em silêncio até ela ficar verde. (É a mesma disciplina da quarentena da F47: declarada,
nomeada, com fase, e com teste cobrando.)

# A trava
Os próprios catálogos — derivados do `pg_catalog`, nunca listas escritas à mão. Mais
`src/lib/validators/catalogos-seguranca.test.ts` (frente 7), que roda sem banco, e as três mutações
promovidas da quarentena, que provam no CI que a frente 6 valeu. `ci-passos.test.ts` e
`mutacoes.test.mts` cobram o resto e você os atualiza no mesmo commit em que os quebra.

# Critérios de aceitação — autoverifique item a item e cole a evidência de cada um
1. `supabase/tests/catalogo_policies.sql` roda verde no `banco-sem-docker`, conta N > 0 asserções e
   emite a linha `FIM`.
2. Ele cobre as TRÊS superfícies declarativas: policies de `public`, policies de `storage.objects` e
   a publication do Realtime — com asserção própria para cada.
3. Nenhuma policy do banco tem predicado equivalente a `true`; a asserção que prova isso existe e o
   número que ela conferiu está no relatório.
4. Tabela de negócio sem policy de SELECT reprova; a exceção nominal de `senhas_acesso` (e o que mais
   você medir na mesma condição) está declarada com motivo escrito e migration citada.
5. Nenhuma policy de `storage.objects` decide só por `bucket_id` — e o relatório mostra que a forma
   proibida EXISTIU (o predicado antigo do `termos leitura operador`, comentado na `0070`).
6. `supabase/tests/catalogo_secdef.sql` roda verde, deriva o conjunto de `prosecdef`, prova
   `search_path` travado em todas e nenhuma executável por `anon`.
7. Função `security definer` nova e não classificada REPROVA — provado por sabotagem, com a saída
   colada.
8. A exceção nominal de `valida_lancamento_item` está declarada com o motivo escrito.
9. `supabase/tests/isolamento_tenant.sql` roda verde, conta N > 0 asserções, traz o bloco de grants
   espelhado e a convenção de honestidade no cabeçalho — e **não** cita `empresa_id`.
10. A Decisão 2 está tomada, registrada e aplicada: as duas varreduras schema-wide existem em UM
    lugar só, e o outro arquivo aponta para ele.
11. Os cenários `2i-bis-3`, `1j`, `4i` (papeis_rls) e `3d` (cargo_dev) foram fortalecidos, e as três
    mutações correspondentes saíram da quarentena, estão no lote ativo e são **detectadas pelo
    cenário nomeado** no CI (`npm run db:test:mutations`, saída colada).
12. `docs/MATRIZ-REGRAS.md` traz a emenda F48 com a regra do `force row level security` (as duas
    razões, o `42P17`, as linhas da `0070` citadas) e as linhas R-ACC das quatro superfícies.
13. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos.
14. `npm run db:test` verde no CI para os **28** roteiros (25 + 3 novos — confirme o número medido) e
    `npm run db:types:diff` continua verde.
15. Versão **1.53.0** no `package.json` e no topo do `registry.ts` (mudanças em linguagem de
    operador), tag `v1.53.0` anotada e publicada, entrada no `CHANGELOG.md`.
16. PR mergeado com `verificar` e `banco-sem-docker` verdes; `main` num estado de repouso válido —
    sem branch aberta, sem asserção pela metade, sem invariante desligada que não esteja declarada
    com a fase que a liga.

# Verificação — rode de verdade
Na mesa, a cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`, e `npm run build`
antes de abrir o PR. A parte que depende de banco só existe no GitHub Actions: abra o PR cedo e leia
o job (`gh run watch`, `gh run view --log-failed`). Leia a falha, corrija a CAUSA RAIZ e repita até
passar. **Não afrouxe asserção, não desligue roteiro, não acrescente isenção para ficar verde** — se
uma invariante não pode nascer ligada, ela nasce DECLARADA e desligada, com a fase que a liga, e vira
manchete do relatório (Decisão 3). Falha persistindo depois de ~3 ciclos: mude de abordagem e
registre a troca.

Provas obrigatórias, cada uma com a saída real em `docs/f48-evidencias/`:
- **Sabotagem A:** crie uma tabela de teste em `public` sem RLS e mostre `seguranca_catalogo` (ou o
  catálogo que a Decisão 2 escolher) acusando; reverta.
- **Sabotagem B:** troque o predicado de uma policy por `true` e mostre `catalogo_policies` acusando;
  reverta.
- **Sabotagem C:** crie uma `security definer` nova sem classificar e mostre `catalogo_secdef`
  acusando; reverta. Repita com `search_path` solto e com `EXECUTE` concedido a `anon`.
- **Sabotagem D:** acrescente uma tabela à publication `supabase_realtime` e mostre a asserção
  acusando; reverta.
- **Sabotagem E:** uma policy de Storage decidindo só por `bucket_id`; mostre a asserção acusando;
  reverta.
- **Sabotagem F (sem banco):** quebre a trava da frente 7 (por exemplo, reintroduza uma isenção por
  prefixo num roteiro) e mostre `npm run test` reprovando com a mensagem certa; reverta.
- **O lote de mutações inteiro**, verde, com as três novas detectadas pelo cenário nomeado.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem
espere confirmação em nenhuma hipótese. Régua, nesta ordem: (1) este prompt; (2) a ficha da F48 no
§5 do plano; (3) as convenções do repositório (`CLAUDE.md`, código existente); (4) a opção mais
simples e reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto, escolha e
motivo.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** em vez de repetir, e registre a
troca. Bloqueio real (MCP ausente, credencial recusada, produção inalcançável): contorne se for
seguro; senão, entregue o resto e registre a pendência com o que falta para resolvê-la — o caminho
da `0128` já está escrito assim de propósito. **Não mexa em credencial, não invente caminho de apply
alternativo, não force o classificador de segurança.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que a medição
esteja no relatório. Foi assim que a F46 trocou "aplicar duas vezes" por prova de determinismo e a
F47 trocou 34 por 58.

# Git e segurança
Branch `f48-catalogos-seguranca`, commits pequenos e frequentes, mensagens em pt-BR no padrão
conventional (`test(f48): …`, `docs(f48): …`, `fix(f48): …`). PR com `gh pr create`; merge só com os
dois checks verdes. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`,
`git clean -fd`, amend de commit que não é seu, commitar `.env*` ou dado real, mexer na branch
protection, apontar roteiro para produção.

# Como trabalhar
Explore com subagentes paralelos — um por frente: (a) o catálogo de policies vivo, medido, e a
classificação negócio × infra; (b) as `security definer`, seus `proconfig` e seus grants; (c)
Storage + publication; (d) os quatro cenários fracos da frente 6 e as três entradas da quarentena;
(e) a Decisão 2 e o custo real de cada opção. Cada um volta só com resumo e com NÚMEROS MEDIDOS.
Escreva `docs/PLAN-F48.md` antes de implementar, com as contagens reais e a Decisão 2 já tomada.
Implemente na ordem obrigatória, em incrementos verificáveis.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F48.md` e contra
os 16 critérios, com estas perguntas: alguma asserção nova passa sobre conjunto vazio (procure o
padrão `if v_n = 0 then ✓` que a F47 mediu 58 vezes)? alguma "exceção nominal" é na verdade uma
isenção por categoria disfarçada? algum catálogo é uma lista escrita à mão fingindo ser derivado —
isto é, tabela/função nova entraria sem reprovar? a classificação negócio × infra tem alguma tabela
sem motivo escrito? alguma sabotagem prova menos do que afirma? alguma das três mutações promovidas
está sendo detectada por acidente (o roteiro já falharia sem ela)? o `isolamento_tenant.sql`
consegue passar verde com a RLS desligada? **Aponte apenas lacunas de correção ou de requisito
declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F48.md`, em pt-BR, no padrão dos relatórios F45/F46/F47: o que mudou por arquivo e
por quê; **as quatro superfícies com os números MEDIDOS**, lado a lado com os que a ficha previa, e
a divergência explicada; a classificação negócio × infra completa, com as exceções nominais e o
motivo de cada uma; as três decisões obrigatórias com o número que decidiu cada uma; as seis
sabotagens com saída real; a frente 6 item a item (cenário antes → depois → mutação detectada?); a
quarentena resultante, com o percentual e a fase que adota cada entrada que sobrou; os 16 critérios
autoverificados; **os ACHADOS de segurança encontrados pelos catálogos, se houver, com severidade —
e o fato de não terem sido corrigidos, com o motivo**; o que este relatório NÃO prova (no mínimo:
que os catálogos rodam contra o banco do CI, não contra produção — a mesma limitação honesta que a
F47 escreveu do gate de deriva); pendências (a `0128`, se continuar aberta) e backlog nomeado para a
F49. **Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final
com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de roteiro, mensagens de erro e commits em **pt-BR**.
Identificadores de domínio em português sem acento; utilitários e infra em inglês. As mudanças do
`registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa vocabulário de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~10 minutos)

```powershell
cd C:\Users\yukig\ti-wap-inventory-control
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar — se já houver falha,
#    o prompt precisa saber disso (acrescente uma linha dizendo qual).
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. O gh EXISTE (F45 §15) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 3. As duas ausências, conferidas pelo MÉTODO, não por "command not found".
winget list --name PostgreSQL
winget list --name Docker
#    Se algum APARECER, diga isso ao agente numa linha antes de colar o prompt:
#    com um Postgres 17 na mesa os quatro catálogos se ensaiam local e a execução
#    muda de perfil por completo (esta é a fase que mais ganharia com isso).

# 4. A versão do Claude Code (o modo `auto` exige 2.1.83+).
claude --version
```

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` não está
negado — a fase abre PR) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado; ele carrega
metade das regras que o prompt herda, e o parágrafo do modelo de acesso é insumo direto dos
catálogos).

**Se o MCP do Supabase estiver disponível nesta sessão, conecte-o antes de colar** — é o que permite
fechar a pendência da `0128` da F47 dentro desta fase. Se não estiver, não faz mal: o prompt já
trata a ausência e segue.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f48
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo aqui: a fase roda `npm ci`, `gh pr create`, `git tag`/`push` e possivelmente o
apply da `0128` — nada disso passa numa allowlist estreita, e nada disso é ação que o classificador
bloqueia. O que ela **não** faz (push forçado, reset destrutivo, mexer na proteção da `main`, tocar
em credencial) está no escopo negativo do prompt.

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit passam limpos, os três roteiros
novos rodam verdes no banco-sem-docker, o injetor detecta as três mutações promovidas pelo cenário
nomeado e o PR está mergeado com os dois checks verdes
```

Sem colidir com trabalho local: `claude --worktree f48 --model opus --permission-mode auto` (aceite
o diálogo de confiança uma vez, antes).

### Enquanto roda

A parte que depende de banco só existe no GitHub Actions — é lá que se acompanha:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Espere **vários ciclos de push** — é o mesmo perfil da F46 e da F47, e é normal numa mesa sem
Postgres. O que **não** é normal é o mesmo push falhar três vezes pelo mesmo motivo; o prompt manda
trocar de abordagem antes disso. Fique de olho especialmente no primeiro run de cada catálogo novo:
é ali que a calibragem do `senhas_acesso` e da exceção do `valida_lancamento_item` aparece.

### Ao voltar

1. Leia `docs/RELATORIO-F48.md` começando pela tabela das **quatro superfícies com os números
   medidos** — se algum divergir muito do que a ficha previa, essa é a notícia da fase.
2. Vá direto para a seção de **ACHADOS**. Esta é uma fase de enumeração: se os catálogos encontraram
   um desvio real de segurança, ele está lá, com severidade e **sem correção** — e a decisão de
   corrigir (e em que fase) é sua.
3. Confira as seis sabotagens em `docs/f48-evidencias/`. Catálogo sem sabotagem provada é documento,
   não trava — é literalmente por isso que a F47 veio antes desta.
4. Confira a quarentena do injetor: ela caiu de 5 para 2 entradas? Se alguma das três voltou, leia o
   motivo medido.
5. Audite o diff: `git log --oneline main..f48-catalogos-seguranca` e
   `git diff main...f48-catalogos-seguranca -- supabase/ docs/MATRIZ-REGRAS.md`.
   **Procure especificamente por mudança em `supabase/migrations/`: não deveria haver nenhuma.**
6. Rode você mesmo `npm run test` e `npm run lint` uma vez.
7. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende a sessão — peça
   um prompt novo com o aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **F48 é a próxima fase e a F47 está fechada** (`main` em `v1.52.0`, PR #28 mergeado, nada em
   andamento). Se você tiver começado algo à mão, o prompt precisa de uma linha dizendo o quê.
2. **A mesa continua sem Postgres e sem Docker.** O prompt manda reconferir pelo método e adaptar
   sozinho; mas se você instalou um Postgres 17 desde a F47, diga numa linha antes de colar — esta é
   a fase que mais muda de perfil com isso.
3. **A ficha da F48 no §5 do plano é o escopo.** As divergências que encontrei (a impossibilidade de
   esqueleto vazio; a varredura de `empresa_id` que não é escrevível hoje; a duplicação das
   varreduras 2 e 3; o `senhas_acesso` de negócio com zero policy) são divergências da ficha com o
   repositório de hoje — o prompt manda confirmar cada uma antes de agir.
4. **Decisão sua, 07/09/2026: a F48 adota as três asserções fracas da quarentena da F47** — é
   conserto de roteiro, não de policy, e o escopo "não corrige policy nem função" segue intacto.
5. **Decisão sua, 07/09/2026: a F48 tenta aplicar a `0128` em produção e segue se não conseguir.**
   Se você preferir aplicá-la você mesmo no SQL Editor antes, diga — o prompt tolera os dois casos.
6. **Versão 1.53.0** (fase = MINOR sobre 1.52.0). Se sair alguma correção avulsa antes desta fase, o
   número muda e o agente recalcula a partir do `package.json`.

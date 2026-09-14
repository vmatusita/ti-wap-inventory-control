# S-smoke — o smoke do import (fatos 36-39, MEDIÇÃO 5)

Medido em 11/09/2026, branch `f56-import-sem-wapismo-e-sem-bomba`. Só leitura: nenhum arquivo
versionado foi alterado; o script de medição `zz-f56-rotulo.mjs` foi criado na raiz e apagado ao
final (confirmado por `git status --short`).

---

## 1. Fatos confirmados/divergentes

### Fato 36 — "o smoke do import NUNCA existiu"
**CONFIRMADO, sem divergência.** `ls scripts/smoke/`:
```
README.md  alarme-issue.mjs  alarme.mjs  alarme.test.mts  cobertura.test.mts
integridade.mjs  linha-de-base.json  smoke-prod.mjs
```
Nenhum arquivo de import. `smoke-prod.mjs` é 100% só-leitura de produção (confirmado lendo o
arquivo inteiro — nenhuma escrita, nenhuma RPC destrutiva).

### Fato 37 — o que existe para construir em cima, e a armadilha do mesmo diretório
**CONFIRMADO.**
- `scripts/design/capturar.mjs` (306 linhas, lido inteiro): sobe `next dev` filho com
  `spawn(process.execPath, [binNext, 'dev', '--port', porta], { env: { ...process.env, ...envDoArquivo } })`
  — as vars do arquivo `--env` vencem o `.env.local` do disco porque `@next/env` só define o que
  ainda não existe em `process.env` (garantia documentada no cabeçalho do arquivo). A trava:
  `--ref-esperado` obrigatório, confere `refDoAmbiente(vars) === refEsperado` e recusa se
  `ref === REF_PRODUCAO` (`'pbtjcalbmepmrqzprusb'`, cravado em `capturar.mjs:70`) — **mesmo que**
  `--ref-esperado` peça produção também. Molde direto para "sobe o servidor, confere o ref,
  dirige o Playwright".
- `scripts/env-guard.ts` (171 linhas, lido inteiro): `REFS_DE_ENSAIO = ['sgmvldiizsrjbxzzpmhh']`
  (`:56`, lista de PERMISSÃO desde a F55) e `exigirBancoDeDesenvolvimento(db)` (`:141-161`) chama
  `db.rpc('rotulo_de_ambiente')` e recusa (`process.exit(1)`) se a resposta não for
  `'desenvolvimento'` — **falha fechada**: erro de rede/RPC ausente também recusa. Só responde à
  service role (a RPC tem `grant execute ... to service_role` e mais nada — confirmado no corpo da
  `0138`, abaixo).
- `.env.local` desta máquina (raiz do repo, 3134 bytes, não versionado): confirmado por NOME e
  REF, nunca por valor (ver MEDIÇÃO 5, §3).
- Playwright **1.62.1** instalado (`node_modules/playwright/package.json`), não 1234 como o
  cabeçalho registra — **divergência de leitura, não de fato**: 1234 é provavelmente o número da
  build do Chromium baixado pelo Playwright (`npx playwright --version` não foi rodado; não
  confundir com a versão do pacote npm). Não há necessidade de reconciliar: o que importa para o
  smoke é que o pacote já está em `node_modules` (zero dependência nova) e o browser já foi
  baixado nesta máquina alguma vez (fato 43 confirma zero acesso à rede de download no meio de um
  CI, que aqui nem se aplica — o smoke roda localmente, não em Actions).

### Fato 38 — "o ensaio não tem admin fictício"
**CONFIRMADO com números exatos**, via SQL direto no projeto `sgmvldiizsrjbxzzpmhh`:
```sql
select papel, ativo, count(*) from public.profiles where excluido_em is null group by 1,2;
-- admin  | false | 1
-- admin  | true  | 1
-- operador | true | 1
-- consulta | true | 1
```
4 perfis, batendo exatamente com o fato ("1 admin ativo, 1 admin inativo, 1 operador, 1 consulta").
E:
```sql
select ... from auth.users u join public.profiles p on p.id=u.id
where lower(u.email) = 'seed.admin@wap.ind.br';
-- []
```
`seed.admin@wap.ind.br` **não existe** no ensaio — confirma que a persona do smoke precisa nascer
por `auth.admin.createUser`, molde da unidade 2b da F55 (ata em `docs/DECISOES.md:9621-9623`,
grep "Unidade 2b"):
> "chave de serviço do ensaio pela Management API, no mesmo processo; a persona fictícia
> `seed.consulta@wap.ind.br` criada no ensaio **sem rodar o seed** (que recusaria: o ensaio tem
> 1.602 ativos); os quatro secrets do ensaio e a variable pública."

A definição de `seed.admin@wap.ind.br` em `scripts/seed.ts:1232-1239` (só a definição — seed NÃO
rodado): `papel: 'admin'`, `filiais: []` (admin escreve em todas sem vínculo), senha do seed
(`SENHA_PERFIS_SEED`, `:1142`) — **não usar essa senha** para a persona do smoke: o fato 38 exige
senha **aleatória por execução**, e a `seed.consulta` do precedente 2b já usou a senha fictícia do
repositório porque ela é só `consulta` (baixo risco); a persona do smoke é **admin** (importa,
apaga acervo, entra em `/admin`) — risco maior, senha não pode ser previsível nem repetida.

Verbos de trilha confirmados em `src/lib/auditoria.ts:12-60`: `ACOES_ADMIN` inclui
`papel_alterado` (:15), `usuario_desativado` (:17), `usuario_reativado` (:18) — **os três já
existem**, com rótulo em `ACAO_ROTULO`. Não é preciso verbo novo. Isso resolve a pergunta do fato
38 sobre "verbo novo decidido antes da 0139": **não precisa** — a trilha da persona (nascimento →
uso → desativação) usa os verbos existentes, e nenhum comentário de migration precisa mudar por
causa disso (a 0139 fica livre para tratar só do vocabulário De→Para, conforme a Decisão 12/fato
12 já previa para OUTRO caso).

⚠ Quem grava a trilha quando a conta nasce por `auth.admin.createUser` direto (fora de
`definir_status_usuario`/RPCs de gestão, que são para contas que JÁ têm perfil)? Não há
Server Action envolvida nesse caminho (é Management-API/service-role puro) — **o script do smoke
tem de gravar o evento ele mesmo**, inserindo em `eventos_admin` (ou chamando
`registrarEventoAdmin`, que está em `src/lib/auditoria-registro.ts` mas depende do client de
sessão do Next — não é diretamente importável por um script `tsx` fora do Next por causa de
`createClient()`, ver §2). Armadilha nomeada abaixo.

### Fato 39 — as armadilhas do smoke
**Todas as cinco confirmadas, com o texto/número exato da regra:**

**(a) idempotência 24h por `arquivo_hash`.** Confirmado em `supabase/migrations/0132_guardas_de_escopo.sql:323-339`:
```sql
if exists (
  select 1 from public.import_logs l
   where l.filial_id = p_filial
     and l.arquivo_hash = v_hash
     and l.created_at > now() - interval '24 hours'
) then
  raise exception 'Este mesmo arquivo já foi importado nesta filial nas últimas 24 horas...'
    using errcode = '22023';
```
`22023` **está** em `RECUSAS_DA_RPC` (`actions/importar.ts:90`) — então um passe 2 com o MESMO
conteúdo do passe 1 seria recusado (e corretamente descartaria o próprio backup, por estar na
lista). O passe 2 **tem** de variar o conteúdo do CSV (fato 39a diz isso: "o conteúdo varia a cada
execução **e entre os passes da mesma execução**"). `import_logs` no ensaio está **vazio** (medido,
abaixo) — não há histórico de 24h a temer no primeiro run, mas o script tem de gerar hash distinto
entre passe 1 e passe 2 por desenho, não por sorte (ex.: incluir um comentário/patrimônio-índice
diferente, ou um carimbo de execução dentro de uma coluna que o motor ignora).

**(b) backup existindo no bucket sob `prefixo_backup_import`, e confirmação dentro de `p_plano`.**
Confirmado: `src/lib/validators/importar.ts:236-238` —
```ts
export function prefixoBackupImport(filialId: number): string {
  return `import/filial-${filialId}/`
}
```
espelha `public.prefixo_backup_import(smallint)` (`0132`). A RPC recusa qualquer caminho de backup
fora desse prefixo (`import_validar_plano`, comentário em `0132:413-414`: "backup (não-vazio, sob
o prefixo da filial, e existente no bucket)"). E a confirmação digitada viaja **dentro** de
`p_plano.confirmacao` desde a F52 (`actions/importar.ts:529`: `{ ...plano, confirmacao: confirmacaoTexto }`)
— não é mais parâmetro solto.

**(c) linha de base zero no ensaio para `backup_orfao`, `conflito_entre_filiais`,
`ativo_filial_inativa`.** Confirmado em `scripts/smoke/linha-de-base.json` (`alvos.ensaio`): as
três são `0`. Medido agora (direto no núcleo — ver §2) e batem **exatamente**: `backup_orfao: 0`,
`conflito_entre_filiais: 0`, `ativo_filial_inativa: 0`. `operador_sem_filial: 1` é o único não-zero
(um operador do seed sem vínculo — não é o smoke). O smoke não pode deixar nenhum backup órfão: o
bucket `backups-import` está **vazio** no ensaio hoje (medido, §2) — todo backup que o smoke subir
tem de ser coberto por `import_logs.backup_path` ou `eventos_admin.detalhe->>backup_path` no final
(a 12ª checagem só olha essas duas fontes, `0138:256-302`).

**(d) o smoke nunca substitui acervo de filial que já existe no ensaio.** Confirmado: as 5 filiais
do ensaio (`matriz, cd-afonso-pena, linhares, serra, eusebio`) estão todas `ativo=true` com dados
(1.602 ativos, fato 2). `sede` **não existe** hoje (medido, `existe_sede: false`) — o smoke cria
essa filial nova e só nela roda "Substituir tudo". Nas 5 WAP o smoke roda **só preview** (passe 3).

**(e) o classificador pode barrar a EXECUÇÃO da RPC destrutiva mesmo em filial vazia do ensaio.**
Não é uma medição de repositório — é uma propriedade do ambiente de execução do agente autônomo
(precedente citado: F7, `docs/prompts/README.md`, "o gate era o classificador do modo automático,
que barra a execução do import destrutivo"). Não testável nesta etapa de medição (esta etapa não
executa RPC nenhuma) — fica registrado como risco a considerar na Decisão 11: **o comando exato do
smoke tem de estar pronto para rodar tanto pelo agente quanto, se barrado, pelo Johnny**, sem
reformulação.

---

## 2. Banco — ENSAIO (`sgmvldiizsrjbxzzpmhh`), só SELECT, só totais

| medição | resultado |
|---|---|
| perfis por papel/ativo | `admin/false=1, admin/true=1, operador/true=1, consulta/true=1` (4 total) |
| existe `seed.admin@wap.ind.br`? | **NÃO** (0 linhas) |
| filiais | `1 matriz / 2 cd-afonso-pena / 3 linhares / 4 serra / 5 eusebio` — todas `ativo=true` |
| existe filial slug `sede`? | **NÃO** |
| as 12 checagens (`checagens_integridade_nucleo()`, chamada direto) | todas **0**, exceto `operador_sem_filial=1` — bate exatamente com `linha-de-base.json.alvos.ensaio` |
| objetos em `backups-import` por prefixo | **0 objetos** (bucket vazio) |
| `import_logs` | **0 linhas** |

⚠ **Achado de mecanismo, não de dado**: `checagens_integridade_nucleo()` tem
`revoke all ... from public, anon, authenticated, service_role` (`0138:309`) — só as duas "portas"
(`dev_checagens_integridade`, `checagens_integridade_resumo`) a alcançam, normalmente. Mas o canal
`execute_sql` da Management API (usado nesta medição) a chamou **direto**, sem passar pela guarda —
porque esse canal executa como um papel de administração do Postgres, fora do PostgREST/RLS. Isso
é **esperado e não é furo**: quem tem acesso à Management API já tem acesso equivalente a `psql`.
Mas é uma nota útil para o smoke: se o script novo tentar chamar `checagens_integridade_nucleo()`
via `supabase-js` com a sessão da persona (que É authenticated), ele será **recusado** — tem de
chamar `checagens_integridade_resumo()` (grant a `authenticated`) para o "antes/depois" das 12
checagens, exatamente como o smoke agendado já faz.

## 3. Banco — PRODUÇÃO (`pbtjcalbmepmrqzprusb`), só filiais e `sede`

| medição | resultado |
|---|---|
| filiais | `1 matriz / 2 cd-afonso-pena / 3 linhares / 4 serra / 5 eusebio / 6 filialteste` — todas `ativo=true` |
| existe filial slug `sede`? | **NÃO** |

Confirma o fato 3 (seis filiais em produção) sem divergência.

## 4. MEDIÇÃO OBRIGATÓRIA 5 — `.env.local`, por NOME e REF

Rodado com `node --env-file=.env.local -e "..."` (nunca imprimindo valor):
```
NEXT_PUBLIC_SUPABASE_URL ref: sgmvldiizsrjbxzzpmhh      (= ENSAIO, está em REFS_DE_ENSAIO)
SUPABASE_SERVICE_ROLE_KEY preenchida: true (219 caracteres)
SMOKE_SUPABASE_URL ref: pbtjcalbmepmrqzprusb            (= PRODUÇÃO, = REF_PRODUCAO de capturar.mjs)
SMOKE_EMAIL preenchida: true
SMOKE_SENHA preenchida: true
```
E o script `zz-f56-rotulo.mjs` (criado na raiz, apagado ao final — confirmado por
`git status --short` não listando nada extra) criou o client com
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` e chamou a RPC:
```
ref: sgmvldiizsrjbxzzpmhh
rotulo_de_ambiente(): "desenvolvimento"
```
**As duas travas de `env-guard.ts` confirmadas em conjunto**: o ref bate com a lista de PERMISSÃO
E o próprio banco confirma "desenvolvimento". `SMOKE_*` aponta para produção — confirmado que o
smoke novo tem de ficar longe dessas três variáveis, lendo só `NEXT_PUBLIC_*` (que hoje é ensaio)
e a chave de serviço.

---

## 5. O que o implementador precisa saber (assinaturas, arquivo:linha)

### (a) `criar_movimentacao_com_itens` — RPC + Server Action
- **Server Action**: `registrarMovimentacoes` em `src/lib/actions/movimentacoes.ts:239`.
  Assinatura: `input: { itens: MovimentacaoInput[], itensJunto?: ItemJuntoInput[] }` (ver tipo em
  torno de `:242`).
  - Guarda: `exigirPapel(supabase, 'operador')` (`:258`) — **mínimo operador**, não admin —, depois
    `exigirEscritaEm(supabase, filiaisDoLote)` (`:311`) por filial do lote.
  - Monta as linhas com `montarRow(item, uid, vinculos)` (`:160`, **função privada, não
    exportada**) e os itens-junto com `montarItensJunto(...)` (`:444`, **também privada**).
  - Chama `supabase.rpc('criar_movimentacao_com_itens', { p_movimentacoes, p_itens, p_criado_por })`
    em `:349-358`. `p_movimentacoes`/`p_itens` são `Json` (arrays de objetos simples).
  - **`itens_faltantes`** (o gatilho da pendência, trigger 0051) entra na própria linha da
    movimentação quando `item.tipo === 'devolucao'` (`:182-183`): `itens_faltantes: item.itens_faltantes ?? []`.
    Não é uma segunda chamada — a pendência nasce **dentro** da mesma RPC/transação, pelo trigger.
  - **Divergência de custo para o smoke**: como `montarRow`/`montarItensJunto` NÃO são exportadas,
    um script fora do Next que quiser chamar a RPC diretamente (via `supabase-js` com a sessão da
    persona) **precisa reconstruir à mão** o shape exato do array `p_movimentacoes`/`p_itens` —
    não há como importar as funções privadas. Isso não é motor "puro e vocabulário De→Para" (não é
    a mesma classe de duplicação que a F56 já evita no import): é a forma de um DTO relativamente
    simples, mas é duplicação mesmo assim, e envelhece se a RPC ganhar campo novo. Registrar como
    custo real na Decisão 11 (ver §6).

### (b) pendência de item — pelo mesmo caminho de (a)
Não há RPC separada. Uma `registrarMovimentacoes` com `itens: [{ tipo: 'devolucao', itens_faltantes: [...] , ...}]`
já cria a pendência via trigger 0051 (`pendencias_item`), na mesma transação da RPC de (a). O
vínculo `lancamentos_item.pendencia_item_id` (o elo que a Frente F precisa preservar — fato 27) só
existe quando ela é **resolvida** depois, por `resolver_pendencias_item_com_lancamentos` (migrations
0122/0126) — não é necessário para o setup do Passe 2 (a pendência **aberta**, sem
`pendencia_item_id` preenchido em lançamento nenhum, já é suficiente para provar que a RPC do
import a apaga com backup — o vínculo resolvido é um caso ADICIONAL que a Frente F também cobre,
mas não é o único estado a testar).

### (c) o import inteiro — `validarImport` → upload → `aplicarImport`
- `src/lib/actions/importar.ts:278` `validarImport(formData)`: guarda `exigirAdmin(client)`
  (`:280`) — **admin, não operador**. Lê arquivo + `filialId` + `correcoes` do FormData, chama
  `validarArquivoImport` (o motor, **puro**, `:302`), devolve `{ filial, validacao, custo,
  termosMultiFilial }`.
- `src/lib/actions/importar.ts:387` `aplicarImport({ plano, confirmacaoTexto, custoPreview, correcoes })`:
  guarda `exigirAdmin` (`:394`); confere confirmação (`confirmacaoImportConfere`, `:417`); revalida
  as 4 contagens contra o estado atual (`:429-452`); recusa se houver termo multi-filial
  (`:454-465`); **sobe o backup primeiro**, path
  `` `${prefixoBackupImport(filial.id)}${timestampArquivo()}.json` `` = `import/filial-<id>/<ISO-sem-dois-pontos>.json`
  (`:473`, bucket `backups-import`, `upsert: false`); só então chama
  `client.rpc('importar_ativos_substituir', { p_plano: {...plano, confirmacao}, p_backup_path, p_contagens: custoPreview, p_correcoes })`
  (`:530-535`).
- **`p_plano` carrega a confirmação DENTRO dele** desde a F52 — não é parâmetro solto (fato 33
  citava isso; confirmado de novo aqui no ponto exato).
- `prefixoBackupImport` em `src/lib/validators/importar.ts:236-238`; espelha
  `public.prefixo_backup_import(smallint)` (SQL, `0132`).
- Idempotência: `0132:323-339`, `interval '24 hours'` por `(filial_id, arquivo_hash)`, código
  `22023` (está em `RECUSAS_DA_RPC`).

### (d) Server Actions fora do Next — **NÃO é possível**, confirmado pela leitura de código
`src/lib/supabase/server.ts` (arquivo inteiro, 32 linhas): `createClient()` chama
`await cookies()` de `next/headers` na primeira linha do corpo (`:8`). Essa função **exige** o
contexto assíncrono de requisição do Next (Server Component em render, Route Handler, ou uma
Server Action **invocada de dentro de uma requisição real do Next**) — fora dele, lança
(`Invariant: static generation store missing` / equivalente, dependendo da versão). Logo:
- **Nenhuma Server Action deste módulo (`registrarMovimentacoes`, `validarImport`,
  `aplicarImport`, ...) pode ser importada e chamada por um script `tsx`/`node` solto.** A primeira
  linha de qualquer uma delas (`createClient()` → `cookies()`) derruba o processo.
- O único jeito de exercitar a Server Action de verdade é **através de uma requisição real ao
  `next dev`** — ou seja, **Playwright** (ou um cliente HTTP que reproduza o protocolo Flight de
  Server Actions do React 19, o que é impraticável: o hash da action muda a cada build e o formato
  de serialização não é uma API pública estável).
- O que **é** importável de um script solto, sem depender do Next: os módulos **puros** de
  `src/lib/import/*` (motor de validação — confirmado: `validarArquivoImport`,
  `montarPlanoImport`, `hashConteudo`, etc. exportados do barril `src/lib/import/index.ts:1-11`,
  zero import de `next/*` ou `@/lib/supabase/server`) e as RPCs do banco chamadas diretamente por
  `@supabase/supabase-js` com uma sessão obtida por `signInWithPassword` (exatamente como
  `smoke-prod.mjs` já faz na Parte B, e como `scripts/env-guard.ts` faz com a service role).

Isso responde de forma definitiva a pergunta do prompt ("se as Server Actions podem ser chamadas
fora do Next"): **não podem.** Um "script Node" só consegue reproduzir o **caminho da RPC**
(motor puro + RPC via sessão), nunca o caminho completo da action (Zod da action, `exigirAdmin`
antes do motor rodar, a revalidação de estado, a checagem de `termosMultiFilial`, a UI do wizard).
Só o Playwright contra um `next dev` real reproduz o caminho **inteiro**.

---

## 6. Proposta para a Decisão 11 (forma do smoke)

**Recomendação: híbrida, não "um ou outro".**

**Núcleo do import (Passes 1, 2 e 3) — Node direto, sem Playwright**, porque:
- O motor (`validarArquivoImport`) é **puro** e **importável** (zero duplicação — é o MESMO código
  que `validarImport` chama, não uma cópia);
- A RPC `importar_ativos_substituir` concede EXECUTE só a `authenticated` (nunca `service_role`,
  confirmado no cabeçalho de `actions/importar.ts:47-49`), e tem suas PRÓPRIAS guardas internas
  (`e_admin()`, confirmação, idempotência, contagens) — CLAUDE.md já é explícito que "regras de
  negócio críticas... vivem no Postgres — a UI é a segunda linha, nunca a única". Chamar a RPC
  direto com a sessão real da persona testa exatamente essa linha de defesa, que é a que a Frente F
  está consertando (o desvínculo de FK vive DENTRO da RPC, não na action);
  - **O que fica de fora**: a Zod da action (`aplicarSchema`/`planoImportSchema` sem `.max()`,
    fato 23), a checagem de `termosMultiFilial` e a revalidação de estado feitas em
    `aplicarImport` antes da RPC (`:429-465`), e a UI do wizard (1.064 + 1.176 linhas, fora de
    escopo decompor). Isso é aceitável: nenhuma dessas três é o alvo desta fase (a bomba de FK e o
    vocabulário no banco); testá-las é responsabilidade dos testes unitários da action e do
    roteiro visual manual do README, não do smoke do import.
- **Custo**: baixo. Um script `.mjs`/`.ts` com `tsx`, reaproveitando `capturar.mjs` só para a parte
  da TRAVA (ref-esperado, `exigirBancoDeDesenvolvimento`) — sem subir `next dev`, sem Playwright,
  sem depender de seletor de UI nenhum. Roda em segundos, não em dezenas de segundos.

**Setup do "mundo real" do Passe 2 (lançamento + pendência) e o apelido da Frente E — Node direto
também, com uma ressalva**: `criar_movimentacao_com_itens` é RPC pública para `authenticated`
(via a mesma guarda de papel/filial que a action já verifica — `exigirPapel`/`exigirEscritaEm`
vivem TAMBÉM no lado do banco, pela RLS/policies citadas no CLAUDE.md), então chamá-la direto com a
sessão da persona é igualmente "o caminho real" no sentido que importa (a linha de defesa que
protege dado). O custo aqui é **reconstruir à mão** o shape de `p_movimentacoes`/`p_itens` (porque
`montarRow`/`montarItensJunto` não são exportadas) — pequeno, mas é duplicação declarada: o script
deve comentar explicitamente "este objeto espelha `montarRow`/`montarItensJunto` em
`src/lib/actions/movimentacoes.ts`; se a RPC ganhar campo novo, atualizar aqui" (o mesmo padrão que
`chave-sql.test.ts`/`tipos-item-sql.test.ts` já usam para pares TS↔SQL — aqui seria TS↔TS, então
não dá para blindar com um teste de mesmo poder; documentar é o que resta). O alias da filial
`sede` (Frente E) é, pelas migrations de hoje, uma tabela nova (`unidades_apelidos`) sob RLS
`e_admin()` na escrita (fato 13/7) — não uma RPC — então `db.from('unidades_apelidos').insert(...)`
com a sessão admin já é literalmente o mesmo caminho que a Server Action da Frente E vai usar por
baixo (uma vez que ela exista): reproduzir por PostgREST direto não é atalho, é o caminho.

**Playwright fica RESERVADO para o roteiro manual do Johnny** (o "12 passos" que já existe no
README) e para `capturar.mjs` (fotos). Não entra no smoke automatizado desta fase — o custo de
automatizar 1.064+1.176 linhas de wizard (upload de CSV via `<input type=file>`, múltiplos passos,
digitar a confirmação exata, esperar toasts) é desproporcional ao que ele provaria a mais, dado que
a RPC já é a linha de defesa real. Se uma revisão futura decidir que a UI também precisa de prova
automatizada, o custo deve ser reavaliado à parte — não dentro desta fase (fora de escopo: "não
decompõe os componentes gigantes do import").

### A guarda (função pura, testável)
Propor `scripts/smoke/import-guard.ts` (ou acrescentar a `env-guard.ts`, que já é o lugar certo):
uma função pura `confereRefDeEnsaio(ref: string): { ok: true } | { ok: false; motivo: string }`
que recebe SÓ a string do ref (nunca lê `process.env` nem faz IO) e a compara contra
`REFS_DE_ENSAIO` e `REFS_DE_PRODUCAO_CONHECIDOS` (já exportáveis de `env-guard.ts`, hoje são
`const` de módulo — precisam de `export`). Testada por `Vitest` com dois casos: o ref de produção
real (`'pbtjcalbmepmrqzprusb'`) → recusa nomeando "é produção"; um ref **inventado**
(`'aaaaaaaaaaaaaaaaaaaa'`) → recusa nomeando "fora da lista de permissão". **Nunca** um teste que
aponte o smoke de verdade para produção para ver se ele recusa (é a própria regra do prompt) — a
prova é só sobre a função pura.

### A persona e a senha
- `seed.admin@wap.ind.br`, criada por `auth.admin.createUser({ email, password, email_confirm: true })`
  com **service role** (nunca convite/"esqueci senha" — domínio real manda e-mail).
- Senha: `crypto.randomBytes(24).toString('base64url')` (ou `crypto.randomUUID()` duplicado),
  gerada em memória, usada só para `signInWithPassword` dentro do mesmo processo, **nunca**
  atribuída a uma variável que passe por `console.log`/arquivo — seguir o padrão de mascaramento de
  `smoke-prod.mjs` (a lista `SEGREDOS` + o envelope de `console.*`, `smoke-prod.mjs:106-128`), até
  para a senha gerada.
- Trilha: como a conta nasce por `auth.admin.createUser` (fora de qualquer RPC de gestão), o
  próprio script tem de inserir em `eventos_admin` o evento equivalente — **não existe verbo
  "usuario_criado"** em `ACOES_ADMIN` hoje (a lista tem `papel_alterado`, `usuario_desativado`,
  `usuario_reativado`, e mais — ver `auditoria.ts:12-49` para a lista completa). Duas opções: (i)
  registrar só `usuario_reativado`/`papel_alterado` como se a persona já existisse (semanticamente
  errado — ela está NASCENDO) ou (ii) decidir um verbo novo `usuario_criado` **antes** de escrever
  a `0139`, para que o comentário da migration já o liste (fato 12 exige isso para verbo novo) —
  **recomendo (ii)**, é o honesto, e o custo é uma linha a mais no `comment on column` e em
  `ACOES_ADMIN`/`ACAO_ROTULO`, com o teste `dev-destrutivo.test.ts` já cobrindo a paridade.
- Desativação no fim: `definir_status_usuario` (RPC de gestão, 0074) com a sessão da PRÓPRIA
  persona não serve ("ninguém age sobre o próprio acesso" — regra do CLAUDE.md) — precisa ser outra
  conta admin/dev chamando, OU a mesma via `auth.admin.updateUserById` (fora das RPCs de gestão,
  já que ela nasceu fora delas) gravando o evento à mão, espelhando o padrão acima.

### Idempotência e conteúdo do arquivo entre passes
Passe 1 e passe 2 miram a MESMA filial (`sede`) no MESMO dia — o hash **tem** de divergir (a
checagem é `(filial_id, arquivo_hash, < 24h)`). Gerar o CSV com um marcador de execução (ex.: um
comentário fora das colunas usadas, ou variar um patrimônio-sentinela) garante hash diferente sem
mudar a estrutura testada.

### Como nascem o lançamento e a pendência do Passe 2
Ver §5(a)/(b): uma chamada a `criar_movimentacao_com_itens` (RPC direta, sessão da persona) com um
ativo já importado no passe 1, tipo `entrega` + `itensJunto` (cria o lançamento com
`movimentacao_id`), e uma segunda chamada tipo `devolucao` + `itens_faltantes` (cria a pendência,
trigger 0051) — nenhuma delas precisa de item catalogado NOVO se o ensaio já tiver ao menos um
`tipos_item`/`itens` ativo (não medido nesta etapa — medir antes de implementar; se faltar, é
cadastro pelo próprio caminho de operador, F37/F41, não seed).

### Como conferir as 12 checagens antes/depois
`checagens_integridade_resumo()` — **não** `checagens_integridade_nucleo()` (fechada a
`authenticated`) nem `dev_checagens_integridade()` (fechada a `e_dev()`, e a persona é admin, não
dev). `checagens_integridade_resumo()` exige só `papel_atual() is not null` (`0138:349-353`) —
qualquer logado ativo, inclusive a persona admin. Comparar o array antes/depois por `(chave,
total)`, igual ao que `integridade.mjs` já faz contra a linha de base.

### O que fica no ensaio depois
`sede` fica como fixture **permanente** (decisão já no escopo, fato final da Frente G/H) — os
patrimônios fictícios do passe 1/2 ficam no acervo dela, e isso é aceitável porque é dado 100%
fictício criado pelo próprio smoke, nunca por seed rodado. O `scripts/smoke/README.md` precisa
documentar isso explicitamente (a Frente H já pede isso).

---

## 7. Armadilhas encontradas (além das 5 do fato 39)

1. **`montarRow`/`montarItensJunto` não são exportadas** — reproduzir o payload da RPC de
   movimentação por fora exige duplicar um DTO à mão (custo pequeno, mas real — documentar
   explicitamente no script, ver §6).
2. **`checagens_integridade_nucleo()` só é alcançável de fora por quem já tem privilégio de
   Management API/postgres** — o smoke (sessão `authenticated` comum) TEM de usar
   `checagens_integridade_resumo()`, não a função núcleo. Confundir as duas nesta fase quebraria o
   script em produção de imediato (RLS recusaria).
3. **Não existe verbo `usuario_criado` em `ACOES_ADMIN`** — decidir isso ANTES de escrever a 0139
   (mesma exigência do fato 12, mas para um verbo diferente do que a Frente E precisa).
4. **A persona não pode se auto-desativar** (regra "ninguém age sobre o próprio acesso") — o script
   precisa de uma SEGUNDA identidade (service role via `auth.admin.updateUserById`, fora das RPCs
   de gestão) para o passo de limpeza, e essa escrita também pede trilha manual.
5. **`import_logs` está vazio no ensaio hoje** — bom (nenhuma pendência de 24h herdada), mas também
   significa que o smoke será o PRIMEIRO import de todos os tempos nesse banco: não há precedente
   local para conferir se `custoSubstituir`/`paresEmOutrasFiliais` funcionam sob volume — o smoke
   deve medir o tempo de resposta da RPC na primeira execução real, não assumir que bate com os
   números de produção (Matriz, 1.142 ativos).
6. **O bucket `backups-import` está vazio** — qualquer objeto que sobrar ao final do smoke (por um
   passe que falhar no meio, por exemplo) vira órfão IMEDIATAMENTE visível na 12ª checagem (linha
   de base 0 no ensaio) — o script precisa de um `finally`/limpeza que confira a 12ª checagem antes
   de declarar sucesso, não só rodar os três passes e sair.
7. **`REF_PRODUCAO` está cravado em DOIS lugares com o mesmo valor mas independentemente**
   (`capturar.mjs:70` e `env-guard.ts:62`, mais o hardcode de `smoke-prod.mjs`'s
   `URL_APP_PADRAO`/domínio implícito) — um terceiro script reaproveitando a trava tem de decidir
   se importa a constante de um dos dois (acoplamento a um script de "outra classe", `capturar.mjs`
   é ferramenta de design) ou cria a sua própria terceira cópia (mais uma cópia do mesmo literal).
   Recomendo **extrair `REFS_DE_ENSAIO`/`REFS_DE_PRODUCAO_CONHECIDOS` de `env-guard.ts` como export
   público** (já é quase isso, só falta o `export`) e o smoke novo importar de lá — é o lugar já
   testado (implicitamente) por `assertGuardsAndGetConfig`.
8. **Playwright 1.62.1 ≠ "chromium 1234" do cabeçalho** — não é uma divergência real, é uma
   confusão de unidades (versão do pacote npm vs. número de build do Chromium baixado); não afeta
   a Decisão 11 já que a decisão recomendada não usa Playwright para o smoke automatizado.

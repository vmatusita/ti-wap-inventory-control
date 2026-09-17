# Smoke test do Estoque TI WAP

Script reexecutável que confere, de fora para dentro, se a aplicação **no ar**
continua funcionando: as rotas respondem, o acesso sem sessão continua barrado, e
as leituras reais que o sistema faz continuam devolvendo dados com uma sessão de
operador de verdade.

Rode **depois de todo deploy**. Leva menos de um minuto.

```bash
node scripts/smoke/smoke-prod.mjs
```

---

## Por que o script está em `scripts/` e não em `scratchpad/`

A ordem de serviço da F12 pedia `scratchpad/smoke/`, mas o `.gitignore` do
projeto ignora `/scratchpad/` inteiro — um arquivo lá **não é versionado e não
sobrevive** a uma máquina nova ou a uma limpeza de pasta. Como este script
precisa estar disponível depois de qualquer deploy futuro, ele mora em
`scripts/smoke/`, ao lado dos outros scripts do projeto.

`scratchpad/smoke/` continua sendo o lugar de **saída**: capturas de tela,
saídas salvas em arquivo, anotações da conferência. Tudo ali é ignorado pelo git
por construção — e é justamente o que se quer, porque captura de tela da
produção contém dado real.

---

## O que o script confere

**Parte A — sem sessão** (roda sempre, não precisa de credencial):

- `/login` e `/relatorios/acesso` respondem **200** (são públicas);
- as rotas de operador (`/`, `/ativos`, `/itens`, `/movimentacoes`,
  `/pendencias`, `/ajuda`, `/admin/**`…) **redirecionam para `/login`**;
- as rotas de relatório redirecionam para `/relatorios/acesso` (entrada por senha);
- `GET /api/saude` (F55) responde **200** com `{ ok, versao, commit, banco: 'ok' }`
  — a sonda sem sessão; ver a seção própria mais abaixo;
- **nenhuma rota responde 5xx**.

**Parte B — logado** (só roda se as credenciais estiverem no ambiente): abre uma
sessão de operador e repete as leituras que o próprio app faz — contagem de
ativos, uma página de movimentações, a view `v_fila_pendencias` (a fonte do
dashboard, do badge da sidebar e de `/pendencias` desde a F18) e a `v_pendencias`
que a alimenta, a RPC `rel_saldo_itens_filiais` (consolidada — a lista de todas as filiais,
inclusive desativadas, desde a F60 — e por filial), as RPCs do relatório ao vivo, o catálogo de itens, termos e snapshots gerados. De
cada uma valida **status, formato (nomes de coluna) e contagem**.

> **O script nunca imprime conteúdo de linha.** Só contagens, status HTTP e
> nomes de coluna. A produção tem dado real e ele não sai daqui.

---

## Credenciais — só por variável de ambiente

O script **não contém segredo nenhum**. Ele lê:

| Variável | Para quê |
|---|---|
| `SMOKE_URL_APP` | URL do app. Sem ela, usa a URL pública de produção na Vercel. |
| `SMOKE_SUPABASE_URL` | Projeto Supabase a consultar. |
| `SMOKE_SUPABASE_ANON_KEY` | Chave publicável (a mesma que o navegador usa). |
| `SMOKE_EMAIL` | Conta dedicada ao smoke. |
| `SMOKE_SENHA` | Senha dessa conta. |

**Cascata de resolução** (a primeira que existir vence):

1. variável exportada no shell;
2. a mesma variável lida do `.env.local` da raiz do repositório (o script traz um
   parser próprio de `.env` — nenhuma dependência nova; o que já está no shell
   **nunca** é sobrescrito pelo arquivo);
3. para o Supabase, o par `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   que o app já usa;
4. para a URL do app, a URL de produção na Vercel (é endereço público, não é segredo).

Na prática: **com o `.env.local` do projeto no lugar, basta rodar `node
scripts/smoke/smoke-prod.mjs`** — ele já aponta para a produção.

Para apontar para outro ambiente sem mexer em arquivo nenhum, exporte na sessão
do terminal (os valores ficam de fora deste README de propósito):

```bash
# bash / git bash
export SMOKE_SUPABASE_URL='https://<ref-do-projeto>.supabase.co'
export SMOKE_SUPABASE_ANON_KEY='<chave publicável do projeto>'
node scripts/smoke/smoke-prod.mjs
```

```powershell
# PowerShell
$env:SMOKE_SUPABASE_URL = 'https://<ref-do-projeto>.supabase.co'
$env:SMOKE_SUPABASE_ANON_KEY = '<chave publicável do projeto>'
node scripts/smoke/smoke-prod.mjs
```

A senha (e o e-mail da conta, e a chave) são **mascarados como `***` em qualquer
saída do script**, inclusive dentro de mensagem de erro e de stack trace. Não
cole valor de credencial em ticket, commit, log ou relatório.

---

## Como ler a saída

Cada linha é `[STATUS] nome do check — detalhe`:

| Status | Significado | Conta como falha? |
|---|---|---|
| `OK` | passou. | não |
| `AVISO` | passou, mas com ressalva (ex.: não havia linha para conferir o formato). Vale ler. | não |
| `n/a` | **estado de DADO** (não de schema) — ver abaixo. | não |
| `FALHA` | quebrou. O resumo no fim repete todas as falhas com a área afetada. | **sim** |

No fim vem o resumo (`RESUMO · N OK · N aviso · N n/a · N falha`), a lista dos
`n/a`, a lista das falhas e as pendências.

**Código de saída:** `0` se nenhuma falha; `1` se houve pelo menos uma.

### O que quer dizer `n/a` agora (F55)

Até a F55, schema que ainda não tinha sido migrado (uma coluna ou tabela de
fase recente) virava `n/a — pré-F12`, e a flag `--exigir-f12` (ou
`SMOKE_EXIGIR_F12=1`) promovia esses `n/a` a `FALHA` nas rodadas pós-rollout.
**As duas coisas morreram.** Toda migration coberta pelos checks deste script
já está em produção há semanas — ausência de schema deixou de ser "ainda não
migrou" e passou a ser **regressão**. Por isso os nove checks que respondiam
`n/a` quando a coluna/tabela/RPC não existia (`ativos.telefone/imei/pulsus`,
`filiais.cidade`, `itens.estoque_minimo`, `kits_modelos` — leitura e RLS,
`lancamentos_item.movimentacao_id/pendencia_item_id`, `colaboradores` e a RPC
`rel_saldo_colaborador`) agora respondem **`FALHA`** direto quando o schema
não é encontrado. Não existe mais flag para isso: é sempre falha.

O único `n/a` que sobrou é de **outra classe**: `rel_saldo_colaborador · a
conta por pessoa` responde `n/a` quando não há **nenhum colaborador
cadastrado ainda** no ambiente. O schema está presente (senão o check já
teria falhado antes); o que falta é **dado**, e zero colaborador cadastrado é
um estado legítimo de produção — não dá para plantar um colaborador fictício
num smoke que roda contra produção (regra do CLAUDE.md: nunca dado, nem
fictício, fora de seed/import). Por isso ele continua `n/a`, e o resumo o
rotula como "estado de dado (não de schema)" para não confundir com a classe
antiga.

### A rota `/api/saude`

A Parte A confere também `GET /api/saude` (`src/app/api/saude/route.ts`), a
sonda **sem sessão** do sistema: responde `200 { ok, versao, commit, banco: 'ok', ms }`
quando o banco respondeu, `503` quando não respondeu. A checagem é própria
(não a genérica de rota): lê o JSON e confere `versao`, `commit` e `banco` —
nunca o corpo inteiro. Um redirect (3xx) aqui é **FALHA** com um texto que
nomeia a causa: o proxy está interceptando uma rota que deveria estar fora do
seu alcance (`src/proxy.ts` exclui `api/saude` do `matcher` de propósito).

Para o smoke **agendado** (ver seção abaixo) comparar a versão publicada com a
que acabou de subir, existe a variável opcional `SMOKE_VERSAO_ESPERADA`:
quando definida e diferente da `versao` que a rota devolveu, o check vira
`AVISO` (nunca `FALHA`) — a tolerância é para a janela entre o merge e a
publicação, em que a versão anterior ainda pode responder por alguns
segundos sem que isso signifique que o deploy quebrou.

### Outras flags

- `--sem-sessao` — roda só a Parte A (útil para conferir rapidamente se o site
  está no ar, sem tocar em credencial nenhuma). Desde a F55 é também o modo
  que **não precisa de `npm ci`**: veja a nota de manutenção sobre o import
  dinâmico do `@supabase/supabase-js`, mais abaixo.

---

## Se a Parte B não rodar

Faltando qualquer credencial, o script **não trava**: informa quais variáveis
faltam, registra a pendência e sai com código `0` depois de rodar a Parte A.
Ou seja: você ainda fica sabendo se o site está no ar.

Login recusado (`Invalid login credentials`) normalmente significa uma destas
três coisas: a conta de smoke não existe **naquele** projeto Supabase (ela é de
produção — o projeto de ensaio tem outro conjunto de usuários), a senha mudou, ou
o `.env.local` não está na raiz. Evite rodar o script em laço: o Supabase Auth
limita tentativas de login por período.

---

## O smoke agendado (F55)

Além deste ritual manual pós-deploy, existe um smoke **agendado** por GitHub
Actions (`.github/workflows/saude.yml`, feito em paralelo a este arquivo — não
descrito aqui em detalhe além do que segue). Ele roda, sem intervenção
humana:

- a **Parte A** deste script (`--sem-sessao`, incluindo `/api/saude`) a cada
  6 horas;
- uma **sonda de integridade** (`scripts/smoke/integridade.mjs`, outro
  arquivo) uma vez por dia, com uma conta dedicada de cargo `consulta`.

A diferença que importa para quem lê este README: **no agendado, credencial
ausente é `FALHA`**, não a pendência tolerante que a seção "Se a Parte B não
rodar" descreve acima. Faz sentido — o ritual **local** tem uma pessoa lendo
a saída e decidindo o que fazer; o agendado não tem ninguém olhando até que
algo dispare um alarme, então "faltou credencial" precisa **soar** como
alarme, não passar em silêncio como pendência.

---

## Roteiro de conferência visual (12 passos)

O script cobre o que a máquina consegue ver. Estes 12 passos são o que **uma
pessoa logada** confere depois de um deploy grande. Faça numa **janela anônima**
(para não misturar com uma sessão já aberta).

1. Abrir a URL de produção. Sem sessão, tem de cair em `/login`.
2. Entrar com a conta de smoke. O dashboard carrega sem erro.
3. **Dashboard:** os KPIs vêm preenchidos; o card **"Itens para repor"** aparece
   (ou some, se nada está abaixo do mínimo); o badge de Pendências na sidebar
   bate com o número que o script imprimiu em `v_fila_pendencias · contagem`.
4. **Paleta de busca** (`Ctrl+K`): buscar "movimenta" e navegar pelo resultado.
   Atalho `?` abre a ajuda de atalhos.
5. **`/ativos`:** a lista carrega; ordenar por uma coluna e paginar; abrir uma
   ficha e conferir a linha do tempo do ativo.
6. **`/movimentacoes`:** aplicar um filtro, recarregar a página (F5) e conferir
   que o filtro **persiste na URL**.
7. **`/movimentacoes/nova`:** selecionar 2–3 ativos no passo 1; no passo 2 usar
   **"Aplicar kit"** — a configuração é sobrescrita com aviso (toast) e aparece o
   checklist âmbar comparando as categorias esperadas com as do lote.
8. Ainda no passo 2: aplicar um kit cujo **tipo é incompatível** com o lote — tem
   de aparecer um toast explicando, **sem** alterar o formulário.
9. **`/itens`:** conferir a visão consolidada e a visão por filial lado a lado;
   o badge âmbar **"repor"** aparece nos itens abaixo do mínimo (passe o mouse:
   o título mostra "mínimo: N") e convive com o badge "faltam N".
10. **`/admin/itens`:** editar um item, definir **Estoque mínimo**, salvar — a
    coluna "Mínimo" e o badge em `/itens` refletem na hora, sem recarregar à mão.
11. **`/admin/kits`:** criar, editar e desativar um kit; tentar um nome repetido
    (tem de vir erro em português, não erro cru do banco); conferir que o kit
    desativado some da lista do fluxo mas não afeta movimentação já registrada.
12. **`/pendencias`** e **`/ajuda`** abrem; a ajuda cita "Repor" e os kits. Sair
    pelo menu do usuário e conferir que voltar em `/` cai em `/login`.

> **Capturas de tela contêm dado real.** Se precisar capturar, salve em
> `scratchpad/smoke/` (já ignorado pelo git por `/scratchpad/`), use só para a
> conferência do momento e **apague ao terminar**. Nunca anexe captura a commit,
> log, relatório ou documentação.

---

## Notas de manutenção

- **Acrescentar cobertura** é acrescentar um objeto na lista `CHECKS` (Parte B)
  ou na lista `ROTAS` (Parte A). Nada de lógica espalhada pelo arquivo.
- **Rotas novas de operador não entram na Parte A.** Sem sessão o proxy
  redireciona *antes* de rotear, então uma rota que não existe responde igual a
  uma que existe — o check não provaria nada. A existência de tela nova se prova
  pela Parte B (a tabela por trás dela) e pelo roteiro visual.
- **Nunca use `head: true` para contar.** Medido na produção em 22/07/2026:
  `select('id', { count: 'exact', head: true })` contra uma tabela **inexistente**
  devolve HTTP 204, `count: null` e **nenhum erro** — o smoke daria "0 linhas" em
  vez de acusar a tabela sumida. O script usa a forma `GET` com `.limit(1)`, que
  devolve a mesma contagem exata e o 404 de verdade. O helper `consultaContagem`
  já faz isso; use-o.
- **Zero dependência nova:** só o `fetch` do Node e `@supabase/supabase-js`, que
  já é dependência do projeto. Requer Node 20+ (o projeto usa 26).
- **`@supabase/supabase-js` é import DINÂMICO desde a F55** (`await import(...)`
  dentro de `parteB()`), não mais `import` estático no topo do arquivo. Motivo:
  a Parte A (`--sem-sessao`) é puro `fetch` e não precisava de `npm ci` para
  rodar, mas o `import` estático obrigava a resolução do pacote mesmo assim.
  Isso importa porque o smoke agendado roda a Parte A a cada 6h — minuto de
  Actions em repositório privado custa (medido em 10/09/2026: ~830 min de CI
  por job em 8,85 dias de uso, projeção de ~2.800 a ~3.200 min/mês contra uma
  cota de 2.000 ou 3.000) — e uma queda do registro do npm no meio de uma
  sonda agendada viraria `FALHA` por um motivo que não tem nada a ver com o
  app estar no ar. Se acrescentar cobertura à Parte A, mantenha-a livre de
  qualquer import que force a resolução de um pacote — é o que preserva essa
  garantia.

---

## Smoke do import no ENSAIO (F56)

Um segundo smoke, separado deste (`smoke-prod.mjs` é só-leitura e só fala com
PRODUÇÃO): prova a operação mais destrutiva da casa — o "Substituir tudo" do
import de startup (`Administração › Importar`) — contra o projeto de **ENSAIO**,
nunca contra produção. É a prova que faltava desde a F51 (o relatório dela dizia,
com todas as letras, "o smoke nunca exercitou o import").

```bash
npx tsx scripts/smoke/import-ensaio.ts
```

Com o `.env.local` da raiz no lugar (ele já aponta para o ensaio desde a F55) —
nenhuma outra variável precisa ser exportada. O script carrega o arquivo sozinho
(`loadEnvLocal`, de `scripts/env-guard.ts`) e recusa seguir se o ambiente não for
o ensaio — ver "A guarda", abaixo.

### O que ele faz — três passes

1. **Passe 1 — a unidade que o código não conhecia.** Cria a filial `sede` (se
   ainda não existir) pela tela de Administração › Filiais, cadastra um apelido
   dela pela tela nova de apelidos (F56 · Frente E — é assim que essa tela entra
   na prova), e roda "Substituir tudo" com uma planilha 100% fictícia cuja coluna
   Site mistura o nome próprio e o apelido. Confere no banco que os ativos
   nasceram na filial certa.
2. **Passe 2 — a bomba, no mundo real.** Antes do segundo import, cria — pelas
   RPCs do próprio sistema (`lancar_itens_lote`, `criar_movimentacao_com_itens`),
   com a sessão da persona, nunca com service role — um lançamento de item PRESO
   a uma movimentação e uma PENDÊNCIA de item aberta, os dois estados que a bomba
   de FK (F56 · Frente F) apaga/desvincula hoje com `23503`. Roda um SEGUNDO
   "Substituir tudo" (arquivo diferente do passe 1 — a idempotência de 24h
   recusaria o mesmo arquivo) e confere: o saldo do item não mudou, a pendência
   sumiu do acervo e está dentro do backup (`versão 2`), e o lançamento ficou sem
   vínculo de movimentação.
3. **Passe 3 — a WAP não regride.** Só **PREVIEW** (nunca aplica) nas cinco
   filiais reais do ensaio, com os 18 termos históricos da coluna Site (13
   apelidos + os 5 nomes próprios, semeados pela migration `0139`) — prova que
   nenhum deles caiu em "filial fora do vocabulário".

Em volta dos três passes: a foto das doze checagens de integridade
(`checagens_integridade_resumo()`) ANTES e DEPOIS, comparadas — têm de ficar
idênticas — e a persona sempre desativada no final, mesmo se algo falhar no meio
(um `finally`).

### A forma (Decisão 11 do `PLAN-F56.md`)

Playwright dirigindo o `next dev` local apontado para o ensaio, no MOLDE de
`scripts/design/capturar.mjs` (sobe o servidor filho, confere o ref, só então
dirige o navegador) — é o único jeito de exercitar o caminho REAL: login,
`validarImport` lendo o vocabulário do BANCO, o backup subindo no bucket,
`aplicarImport` e a RPC de import. As **fixtures do passe 2** (o lançamento e a
pendência) nascem por FORA do wizard — pela RPC do sistema, com a sessão da
persona — porque elas não são o import: são o "mundo real" que já existia antes
dele. `Server Actions não são importáveis por um script solto`
(`createClient()` chama `cookies()` de `next/headers`, que exige uma requisição
real do Next) — é por isso que as fixtures chamam a RPC direto, e por isso que só
o Playwright prova o caminho inteiro do import.

### As credenciais — o que ele lê, e o que NUNCA lê

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | o projeto a apontar — TEM de ser o ensaio |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a sessão "de cabeça" da persona (fora do navegador), para as RPCs do passe 2 e as leituras de conferência |
| `SUPABASE_SERVICE_ROLE_KEY` | criar/desativar a persona e ler o backup no bucket |

**Nunca `SMOKE_*`** — essas três variáveis (`SMOKE_SUPABASE_URL`, `SMOKE_EMAIL`,
`SMOKE_SENHA`) apontam para **PRODUÇÃO**, com a conta ADMIN do ritual pós-deploy
(ver a seção acima). Um script que as lesse miraria produção como admin por
engano; este nem as declara no tipo do ambiente que aceita, e um teste por
`Proxy` (`guarda-ensaio.test.ts`) prova que o corpo da guarda nunca acessa uma
propriedade `SMOKE_*` do objeto.

### A guarda — dois portões, antes de qualquer login

`scripts/smoke/guarda-ensaio.ts` (função pura testável: `guarda-ensaio.test.ts`,
`npx vitest run scripts/smoke/guarda-ensaio.test.ts`):

1. `confereAmbienteDeEnsaio` — síncrona, sem rede: o ref de
   `NEXT_PUBLIC_SUPABASE_URL` tem de estar na lista de PERMISSÃO `REFS_DE_ENSAIO`
   (`scripts/env-guard.ts`) e nunca ser o ref de produção conhecido.
2. `confereRotuloDeEnsaio` — com o client de SERVIÇO, pergunta ao PRÓPRIO BANCO
   `rotulo_de_ambiente()` (migration `0138`) e recusa se a resposta não for
   `'desenvolvimento'`.

As duas rodam ANTES do primeiro login — nunca depois.

### A persona — `seed.admin@wap.ind.br`

Definida em `scripts/seed.ts` mas **criada aqui sem rodar o seed** (o ensaio já
tem 1.602+ ativos; rodar o seed duplicaria dado — molde da unidade 2b da F55,
`docs/DECISOES.md`). `scripts/smoke/persona.ts`:

- `auth.admin.createUser` na primeira execução, `auth.admin.updateUserById` nas
  seguintes — **nunca** convite, **nunca** "esqueci a senha" (o domínio
  `wap.ind.br` é real e as duas vias mandariam e-mail de verdade);
- senha `crypto.randomBytes` **gerada na execução**, só em memória — nunca
  escrita em arquivo, log, evidência ou argumento de linha de comando;
- `papel = 'admin'` e `ativo = true` gravados por escrita DIRETA em `profiles`
  com o client de serviço (as RPCs `definir_papel_usuario`/`definir_status_usuario`
  recusariam a própria service role — "ninguém age sobre o próprio acesso");
- trilha em `eventos_admin` pelos verbos já existentes (`usuario_criado`,
  `papel_alterado`, `usuario_reativado`, `usuario_desativado` — os quatro já
  estão no `comment on column` da migration `0139`), gravada pelo próprio script
  (não há Server Action nesse caminho para gravá-la sozinha);
- **desativada no fim, sempre** (`desativarPersona`, num `finally` do roteiro
  principal) — mesmo que o smoke tenha falhado no meio.

### O que fica no ensaio depois

A filial **`sede` é uma fixture PERMANENTE** do ensaio — não é apagada ao final.
É dado 100% fictício, criado pelo próprio smoke (nunca por um seed rodado), e
documentado aqui de propósito: se você olhar o ensaio depois e encontrar uma
filial "Sede" com um punhado de ativos fictícios, é este script, funcionando como
esperado. Os arquivos CSV gerados a cada execução ficam em `scratchpad/`
(ignorado pelo git) e não precisam ser apagados à mão.

### O que ele NÃO prova

- A UI do wizard **não** é testada por um teste automatizado próprio — os
  seletores de `import-ensaio.ts` são conferidos manualmente contra o código no
  momento de escrever o script (comentário `// SELETOR-A-CONFERIR` nos pontos
  onde a tela ainda podia mudar depois dessa leitura); uma mudança de rótulo ou
  de papel ARIA no wizard pode quebrar o script sem quebrar o produto.
- **Não roda em CI** (precisa de `next dev` + Playwright + credencial do ensaio) —
  é um ritual manual, como o roteiro de 12 passos acima, não uma trava automática.
- **Não prova as outras quatro RPCs destrutivas** (reset de acervo, mesa de
  conflitos, apagar ativo, apagar movimentação) — o backlog nomeado da F56 diz
  que elas têm o mesmo defeito de FK; este smoke não os exercita.
- **Não prova o caminho da Server Action** que fica ANTES da RPC do import
  (a Zod de `aplicarImport`, a checagem de `termosMultiFilial`, a revalidação de
  estado) além do que o próprio wizard já exercita ao rodar de verdade — não há
  um teste de contrato isolado dessa camada aqui.

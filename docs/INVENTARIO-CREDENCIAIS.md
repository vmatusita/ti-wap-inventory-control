# Inventário de credenciais

*Documento VIVO. Nasceu na F55 (10/09/2026), quando a fase teve de mexer em credencial e descobriu que
não havia lugar nenhum dizendo **onde cada uma vive**.*

> ⚠ **NENHUM VALOR ENTRA AQUI.** Este documento é por **NOME**: onde a credencial vive, quem a lê, quem é
> dona, quando nasceu, quando foi girada e quando vence. Um inventário com valores dentro é a pior coisa
> que se pode fazer com um inventário. Se você veio procurar um valor, o lugar é o painel da Supabase, o
> painel da Vercel, o Gerenciador de Credenciais desta máquina ou o cofre de secrets do GitHub.

---

## 1. Onde as credenciais vivem

| lugar | o que guarda | quem alcança |
|---|---|---|
| **`.env.local`** (não versionado, `.gitignore`) | o desenvolvimento nesta máquina | quem tem a máquina |
| **Vercel → Environment Variables** | o que a aplicação em PRODUÇÃO lê | o Johnny |
| **GitHub → Secrets** | o que o `saude.yml` usa para sondar | o workflow; leitura por ninguém (write-only) |
| **GitHub → Variables** | configuração NÃO secreta do workflow | qualquer um com acesso ao repositório |
| **Gerenciador de Credenciais do Windows** | o token pessoal da Management API | os processos desta máquina, pela CLI da Supabase |
| **Painel da Supabase** | a fonte de toda chave de projeto | o Johnny |

---

## 2. `.env.local` desta máquina — 15 variáveis

Estado depois da F55 (10/09/2026). **O arquivo aponta para o ENSAIO** (`sgmvldiizsrjbxzzpmhh`); até esta
fase apontava para PRODUÇÃO, com `SEED_CONFIRM=sim`.

| nome | aponta para | quem lê | observação |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **ensaio** | app, scripts, smoke | trocado na F55 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **ensaio** | app (navegador), scripts | trocado na F55 |
| `SUPABASE_SERVICE_ROLE_KEY` | **ensaio** | `lib/supabase/admin.ts`, seed, reset, restaurador, carga | trocado na F55; **jamais** a de produção aqui |
| `VIEW_SESSION_SECRET` | — | `lib/auth/senha-sessao.ts` | valor **local novo** na F55. Se o anterior era o mesmo da Vercel, **girar o de lá é passo do Johnny** |
| `SEED_CONFIRM` | — | `scripts/env-guard.ts` | **VAZIA de propósito**. Confirmação é por SESSÃO: `SEED_CONFIRM=sim npm run db:reset`, na hora |
| `SEED_PROJECT_REF` | **ensaio** | `scripts/env-guard.ts` | trocado na F55 |
| `SMOKE_SUPABASE_URL` | **produção** | `scripts/smoke/smoke-prod.mjs` | gravada na F55 **antes** da troca acima: a cascata do smoke é `SMOKE_*` → `NEXT_PUBLIC_*`, e sem ela o smoke pós-deploy passaria a sondar o ensaio sem ninguém notar |
| `SMOKE_SUPABASE_ANON_KEY` | **produção** | idem | idem |
| `SMOKE_EMAIL` | **produção** | smoke, `scripts/perf/*` | conta **ADMIN** do ritual pós-deploy — não é a conta do agendamento |
| `SMOKE_SENHA` | **produção** | idem | idem |
| `MS_CLIENT_ID` | Azure | **ninguém** | resto do `PLANO-ESPELHO-SHAREPOINT.md` |
| `MS_TENANT_ID` | Azure | **ninguém** | idem |
| `MS_CLIENT_SECRET` | Azure | **ninguém** | ⚠ é um **client secret de aplicativo do Azure**. Ver §6 |
| `SITE_ID` | SharePoint | **ninguém** | idem |
| `ESPELHO_ITEM_ID` | SharePoint | **ninguém** | idem |

**Saiu do arquivo na F55:** `SUPABASE_ACCESS_TOKEN` → ver §5.

---

## 3. GitHub → Secrets (8) — o que o alarme usa

Todos criados na F55 (10/09/2026), por `gh secret set` lendo da entrada padrão. Secret do GitHub é
**write-only**: nem quem tem acesso ao repositório consegue lê-lo de volta.

| nome | o que é | dono |
|---|---|---|
| `SMOKE_SUPABASE_URL_PRODUCAO` | o endereço do projeto de produção | Johnny |
| `SMOKE_SUPABASE_ANON_KEY_PRODUCAO` | a chave publicável de produção | Johnny |
| `SMOKE_EMAIL_PRODUCAO` | a conta de cargo **`consulta`** do agendamento | Johnny |
| `SMOKE_SENHA_PRODUCAO` | a senha dela | Johnny |
| `SMOKE_SUPABASE_URL_ENSAIO` | o endereço do projeto de ensaio | Johnny |
| `SMOKE_SUPABASE_ANON_KEY_ENSAIO` | a chave publicável do ensaio | Johnny |
| `SMOKE_EMAIL_ENSAIO` | a persona fictícia `seed.consulta@wap.ind.br` | Johnny |
| `SMOKE_SENHA_ENSAIO` | a senha fictícia do seed (já está no repositório: não é segredo, é dado de desenvolvimento) | — |

**GitHub → Variables (1):** `SMOKE_URL_APP` — o endereço público do app. Não é segredo: é o que qualquer
pessoa digita no navegador.

### A conta `consulta` do agendamento

- **Cargo `consulta`**, o cargo que **não escreve nada**: não movimenta, não importa, não gere conta, não
  alcança `/admin` nem `/dev`. Ela lê — como todo logado ativo já lê (o piso da `0070`/`0073`).
- **Zero vínculo** em `operador_filiais`, conferido no nascimento.
- **Endereço derivado por sub-endereçamento** (`+agendado`) do endereço da conta de smoke que já existia,
  para que a caixa seja a mesma pessoa. Inventar um endereço no domínio da WAP arriscaria a caixa de
  outra pessoa.
- **Cargo gravado por `definir_papel_usuario`** com a sessão de um administrador, e a trilha em
  `eventos_admin` (`papel_alterado`).
- **O que se perde se o secret vazar:** LEITURA do acervo de produção. É por isso que o resumo de
  integridade devolve só `(chave, total)`, sem uma linha de dado.

### Rotação da senha da conta `consulta`

**Quem:** o Johnny. **De quanto em quanto tempo:** a cada **6 meses**, ou imediatamente se houver suspeita.

1. `/admin/usuarios` → a conta `+agendado` → **Gerar link de acesso**, e definir uma senha nova.
   (Ou, em SQL: a API administrativa `PUT /auth/v1/admin/users/{id}` com `password`.)
2. `gh secret set SMOKE_SENHA_PRODUCAO` — **por stdin**, nunca com `--body` (o valor ficaria visível na
   linha de comando de qualquer processo do mesmo usuário).
3. Disparar o workflow para conferir: `gh workflow run saude.yml -f alvo=producao -f partes=b`.
4. Anotar a data na tabela abaixo.

| credencial | nasceu | girada em | vence |
|---|---|---|---|
| senha da conta `consulta` de produção | 10/09/2026 | — | rotação sugerida: 10/03/2027 |
| senha da persona `seed.consulta` do ensaio | 10/09/2026 | — | fictícia, não gira |

---

## 4. Vercel — o que a aplicação em produção lê

Fora do alcance desta run (o painel é do Johnny). Por nome, o que `src/` lê em runtime:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`VIEW_SESSION_SECRET` — mais as de sistema que a própria Vercel injeta (`VERCEL_ENV`,
`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_MESSAGE`).

⚠ **Pendência para o Johnny:** o `VIEW_SESSION_SECRET` do `.env.local` foi trocado por um valor local
novo na F55. **Se ele era o mesmo da Vercel**, o de lá também deve ser girado — e trocá-lo invalida todas
as sessões de visualização por senha ativas, o que é aceitável e reversível.

---

## 5. `SUPABASE_ACCESS_TOKEN` — o token pessoal da Management API

**Saiu do `.env.local` na F55.** Onde ele vive agora: no **Gerenciador de Credenciais do Windows**, sob
`Supabase CLI:supabase`, posto lá por `npx supabase@2.109.1 login` lendo da **entrada padrão**.

**Por que não virou variável de ambiente de usuário:** variável persistente do Windows é herdada por TODO
processo — inclusive pelo `npm run dev`, que é justamente o que se quer longe do token. Não seria melhora.

**Provado na F55** (com um token falso primeiro, para não arriscar o real): a CLI grava no cofre, e o
arquivo de texto `~/.supabase/access-token` — o *fallback* dela quando o cofre falha — **não existe**.
Depois disso, `npm run db:types` foi rodado **sem a variável de ambiente** e funcionou.

| quem lê | como |
|---|---|
| `scripts/gen-types.ts` (`npm run db:types`) | pela CLI, que consulta o cofre — **sem variável nenhuma** |
| `scripts/perf/medir-itens.mjs` | pela variável de ambiente — **export de SESSÃO, na hora** |
| a configuração do MCP desta máquina | **não cita este token** (conferido por hash, dentro do processo, em 10/09/2026) |

⚠ **Pendências para o Johnny:**
- **girar o token**, com **validade** (expiry). Ele passou por sessões de agente e por arquivos de
  trabalho, e é a primeira pergunta de qualquer diligência de segurança — o `PLANO-MULTIEMPRESA` §7 já o
  lista como item da virada;
- ver, no painel, se a conta oferece **token de permissão reduzida** (*fine-grained*). A introdução da
  Management API diz que o token pessoal *"carries the same privileges as your user account"*, mas as
  páginas de endpoint citam permissões granulares (ex.: `api_gateway_keys_read`). Se houver, o token novo
  nasce só com o que `db:types` e `medir-itens.mjs` usam; se não houver, o que existe é a validade.

---

## 6. As cinco que ninguém lê

`MS_CLIENT_ID`, `MS_TENANT_ID`, `MS_CLIENT_SECRET`, `SITE_ID`, `ESPELHO_ITEM_ID`.

Medido em 10/09/2026: **nenhuma delas é lida por nada no repositório**. São o resto do
`PLANO-ESPELHO-SHAREPOINT.md`, um subsistema que não foi construído.

⚠ **NÃO FORAM APAGADAS**, e é decisão: o consumidor pode estar fora do repositório (um script na máquina
do Johnny, uma automação do Power Automate). Apagar uma credencial cujo consumidor não se conhece é
quebrar algo que ninguém consegue nomear.

**Pendência para o Johnny — uma decisão de duas linhas:**
- se o espelho do SharePoint **está morto**: revogar o *client secret* do aplicativo no portal do Azure e
  tirar as cinco do `.env.local`;
- se ele **ainda vai existir**: registrar aqui quem é o consumidor e quando o secret vence (os do Azure
  vencem, e o portal mostra o valor **uma única vez**).

---

## 7. A outra máquina

Existe um segundo `.env.local`, em `C:\Users\yukig\…`, **fora do alcance desta run**. Se ele ainda
aponta para produção com `SEED_CONFIRM=sim`, o risco que a F55 fechou aqui continua aberto lá.

**Pendência para o Johnny:** rodar a mesma troca naquela máquina — o roteiro é o §2 deste documento.

---

## 8. As regras que valem para qualquer credencial desta casa

1. **Nunca commitar `.env*`** (o `.env.example` é a exceção, e ele não tem valor nenhum dentro) —
   `CLAUDE.md`, regra 4.
2. **`SUPABASE_SERVICE_ROLE_KEY` só em código server-side ou script local** — jamais em Client Component
   ou em variável `NEXT_PUBLIC_*`.
3. **`gh secret set` por stdin**, nunca `--body`: o argumento fica visível na linha de comando.
4. **`gh variable list` puro imprime os VALORES.** Para listar por nome:
   `gh variable list --json name --jq '.[].name'`.
5. **O que se registra é NOME, REF, HOST e TAMANHO** — nunca o valor, nem em ata, nem em relatório, nem em
   issue, nem em mensagem de commit.

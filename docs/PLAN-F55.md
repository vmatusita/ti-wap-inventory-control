# PLAN-F55 — Observabilidade, sonda e alarme de integridade

*Escrito em 10/09/2026, ANTES de qualquer implementação além das duas travas vermelhas da Frente A.
Todas as contagens abaixo foram medidas nesta sessão contra o disco e contra os dois bancos — não
foram copiadas do cabeçalho da ordem. Onde a medição divergiu, a medição venceu e a divergência está
declarada.*

---

## 1. Os números medidos (10/09/2026)

| O que | Ordem previa | Medido | Veredito |
|---|---:|---:|---|
| Versão no `package.json` | 1.59.1 | 1.59.1 | OK |
| Migrations em `supabase/migrations/` | 136 | 136 | OK |
| Última migration | `0137` | `0137_vocabulario_import_falhou.sql` | OK |
| Linhas com `console.error` em `src/` não-teste | 90 | 90 | OK |
| `console.warn/log/info` em `src/` não-teste | 0 | 0 | OK |
| Chamadas de `console.*` de SERVIDOR | 76 | **76**, em 36 arquivos | OK |
| Chamadas de `console.*` de CLIENTE | 10 | **10**, em 10 arquivos | OK |
| Módulos `'use server'` (diretiva no prólogo) | 20 | **20** | OK |
| Arquivos que só MENCIONAM `'use server'` | 2 | **2** (`guardas-de-action.ts`, `use-server-exports.ts`) | OK |
| `} catch {` sem binding em função EXPORTADA de `'use server'` | 6 | **6** | OK |
| Checagens de integridade | 12 | **12** | OK |
| Chaves das checagens sem roteiro nenhum | 8 | **8** | OK |
| Chaves com teste que PLANTA o estado e mede | — | **1** (`detentor_em_estado_sem_dono`) | novo |
| Mutações ativas / teto | 63 / 64 | **63 / 64** | OK |
| Mutações que tocam `dev_checagens_integridade` | "levante todas" | **0** | **DIVERGÊNCIA** |
| Roteiros em `supabase/tests/` | 32 | **32** (+ `_asserts.sql`) | OK |
| Nomes de `process.env` lidos por `src/`+`scripts/` | 51 | **51** (6 doc. / 8 sistema / 37 ferramenta) | OK |
| Variáveis no `.env.local` desta máquina | 14 | **14** | OK |
| Ref apontado pelo `.env.local` | produção | `pbtjcalbmepmrqzprusb` = **produção**, com `SEED_CONFIRM=sim` | OK |
| Secrets / variables no GitHub | 0 / 0 | **0 / 0** | OK |
| Labels no repositório | — | **9** (só as padrão); nenhuma de alarme | novo |
| Issues no repositório | — | **0** (abertas ou fechadas) | novo |
| Testes de hoje (baseline) | — | **172 arquivos, 4335 testes, verdes** | novo |
| `security definer` em `public` | 48 | **48** nos dois bancos | OK |
| Ramos `n/a` do smoke | "mais que os três `preF12`" | **10** ramos: 9 de schema, 1 de estado de dado | OK |
| Verificações do smoke | — | A: 18 rotas · B: 26 checks · C: 65 checks | novo |

### Divergências que esta fase carrega desde o início

1. **A migration é a `0138` e a versão é a `1.60.0`** — a ficha do plano promete `0135`.
2. **O resumo devolve `(chave, total)`**, não `(chave, quantidade)` — coerência com a função da `/dev`.
3. **O resumo aceita qualquer logado ativo** (`papel_atual() is not null`), não `e_admin()` — decisão do
   Johnny de 10/09/2026, porque a conta do smoke agendado é de cargo `consulta`.
4. **O resumo NÃO chama `dev_checagens_integridade()` por dentro** — o desenho da ficha nasce quebrado
   (§3 abaixo).
5. **São 76 chamadas de servidor e 10 exceções de cliente**, não 94 e 2.
6. **A trava da ficha (`lib/actions` + `lib/queries`) alcançaria 59 das 76.** A desta fase alcança as 76.
7. **Nenhuma mutação de `mutacoes.mjs` toca `dev_checagens_integridade`** — o risco de "mutação que vira
   no-op" que a ordem previa não existe. O que existe é OUTRA coisa: `f41_regularizacao.sql:684-709`
   conta os blocos `return query` do corpo dela, e ESSE quebra (§4).
8. **A prova do alarme é o workflow por `workflow_dispatch` contra o ENSAIO**, não o disparo agendado —
   o agendado não pode mirar o ensaio sem virar alarme falso todo dia.
9. **`conflito_entre_filiais` em produção é 69**, não os 137 grupos que a nota da F25 registrou em 04/08.
10. **A linha de base é POR ALVO.** O ensaio tem `operador_sem_filial = 1` e produção tem 0; uma linha de
    base única faria o dispatch contra o ensaio alarmar sozinho.
11. **A Parte C do smoke fica FORA do agendado** — com uma conta `consulta`, 6 dos 65 checks viram AVISO
    com texto que mente sobre a causa (§7).
12. **O comentário de `src/lib/supabase/proxy.ts:6` está desatualizado**: ele diz que o proxy roda no
    Edge; no Next 16 o proxy roda **sempre em Node** e não aceita troca (`version-16.md:629`).

---

## 2. A linha de base das doze checagens (só TOTAIS — nunca `amostra`)

Medida em 10/09/2026 pelo SQL de contagem **transcrito** do corpo vigente da `0136`, rodado pelo MCP nos
dois projetos. `dev_checagens_integridade()` não foi chamada: ela exige `e_dev()`, e o MCP não carrega
JWT de dev.

| # | chave | PRODUÇÃO | ENSAIO | política do alarme |
|---:|---|---:|---:|---|
| 1 | `patrimonio_duplicado` | 0 | 0 | hoje-zero |
| 2 | `ativo_filial_inativa` | 0 | 0 | hoje-zero |
| 3 | `termo_sem_arquivo` | 0 | 0 | hoje-zero |
| 4 | `perfil_sem_conta` | 0 | 0 | hoje-zero |
| 5 | `conta_sem_perfil` | 0 | 0 | hoje-zero |
| 6 | `pendencia_de_estornada` | 0 | 0 | hoje-zero |
| 7 | `operador_sem_filial` | 0 | **1** | hoje-zero em produção · catraca 1 no ensaio |
| 8 | `arquivo_termo_orfao` | **3** | 0 | catraca 3 · hoje-zero no ensaio |
| 9 | `conflito_entre_filiais` | **69** | 0 | catraca 69 · hoje-zero no ensaio |
| 10 | `detentor_em_estado_sem_dono` | 0 | 0 | hoje-zero |
| 11 | `reserva_aberta` | 0 | 0 | hoje-zero |
| 12 | `backup_orfao` | **10** | 0 | catraca 10, **com releitura de confirmação** |

Contagens de acervo do "antes" do apply:

| tabela | PRODUÇÃO | ENSAIO |
|---|---:|---:|
| `ativos` | 1621 | 1602 |
| `movimentacoes` | 3520 | 3239 |
| `lancamentos_item` | 117 | 31 |
| `itens` | 23 | 6 |
| `colaboradores` | 22 | 0 |
| `filiais` | 6 | 5 |
| `tipos_item` | 10 | 7 |
| `termos_gerados` | 98 | 2 |
| `profiles` | 15 | 3 |
| `public.ambiente` (linhas) | **0** | **1** (`desenvolvimento`) |
| `security definer` em `public` | 48 | 48 |

`get_advisors(security)` "antes", idêntico nos dois: `rls_enabled_no_policy` **3** (INFO),
`authenticated_security_definer_function_executable` **27** (WARN), `auth_leaked_password_protection`
**1** (WARN). Depois da `0138`, o único achado novo esperado é o resumo entrando na segunda lista:
**27 → 28**.

---

## 3. O desenho do banco (migration `0138`)

### Por que o desenho da ficha não serve

`dev_checagens_integridade()` (`0136:43-46`) abre com `if not public.e_dev() then raise … 42501`.
`e_dev()` → `papel_atual()` → `auth.uid()`, **o JWT de quem chama**. `security definer` troca o
`current_user`; **não troca o JWT**. Um resumo que a chamasse por dentro recusaria todo mundo que não é
dev — inclusive a conta `consulta` do agendamento. E copiar o SQL das doze para dentro do resumo é a
doença que a F51 curou nas 11 cópias da RPC de import.

### O que a `0138` faz

```
public.checagens_integridade_nucleo()          -- NOVA. O SQL das doze, VERBATIM da 0136.
  returns table(chave text, total bigint, amostra text[])
  language plpgsql · stable · security definer · set search_path = public
  SEM guarda de cargo por dentro (ela não é alcançável de fora)
  revoke all from public, anon, authenticated, service_role

public.dev_checagens_integridade()             -- RECRIADA. Mesma assinatura, mesmo resultado.
  = guarda e_dev()  +  return query select * from public.checagens_integridade_nucleo()

public.checagens_integridade_resumo()          -- NOVA.
  returns table(chave text, total bigint)      -- ZERO linha de dado
  = guarda papel_atual() is not null  +  a projeção (chave, total) do núcleo
  grant execute to authenticated · revoke all from public, anon, service_role

public.rotulo_de_ambiente()                    -- NOVA. A leitura do rótulo por função.
  returns text                                 -- 'desenvolvimento' ou NULL
  security definer · revoke all from public, anon, authenticated
  grant execute to service_role                -- o precedente de resetar_dados_ficticios
```

O núcleo roda como o dono dentro das duas guardas, então nenhuma delas precisa de grant sobre ele. A
prova de que as doze peças são byte a byte as mesmas é `corpo-vigente.mjs` + `diff`, com as linhas
contadas, em `docs/f55-evidencias/`.

### Ordem de ROLLBACK (o inverso da de apply — regra 10 do §4)

Começa **fora do banco**:

1. `gh workflow disable saude.yml` — senão o próximo disparo alarma sobre a função que sumiu.
2. `git revert` do PR + deploy — senão o `env-guard` recusa por falta do rótulo, e o smoke agendado
   chama uma RPC que não existe mais.
3. Só então o SQL, nesta ordem: `drop function public.checagens_integridade_resumo()`;
   `drop function public.rotulo_de_ambiente()`; `create or replace` reemitindo o corpo da `0136` em
   `dev_checagens_integridade` (as doze checagens inline); `drop function
   public.checagens_integridade_nucleo()`.
4. `notify pgrst, 'reload schema';` (a assinatura da API mudou — funções sumiram).
5. `npm run db:lock` para regravar a trava sem o arquivo.

⚠ O cabeçalho da `0138` **não cita as frases que o gate procura** — a lição escrita no cabeçalho da
`0136`.

---

## 4. O que quebra por desenho, e o que se faz com isso

| Quem | Onde | O que quebra | O que se faz |
|---|---|---|---|
| `f41_regularizacao.sql` | `:684-701` | conta `return query` no corpo de `dev_checagens_integridade` (espera 12); depois da `0138` ela tem 1 | aponta a contagem para `checagens_integridade_nucleo` |
| `f41_regularizacao.sql` | `:703-709` | `ilike '%reserva_aberta%'` no corpo dela | aponta para o núcleo |
| `catalogo_secdef.sql` | `k_secdef` | 3 `security definer` novas não classificadas → asserção 1a reprova | acrescenta as três por NOME, no mesmo commit |
| `migrations-f38.test.ts` | `DA_F38` | migration `0138` fora da lista de cobertura | acrescenta `'0138'` |
| `migrations.lock.json` | — | migration nova sem hash | `npm run db:lock` no mesmo commit |
| `dev_destrutivo.sql` | `:294-301` | confere grants de `dev_checagens_integridade` | **não muda** — os grants dela ficam iguais |
| `f36_detentor.sql` | `:329-364` | chama `dev_checagens_integridade()` com JWT de dev | **não muda** — assinatura e resultado idênticos |
| `definer_sem_tenant.sql` | — | as três novas **não entram**: o universo dele é `security definer` alcançável por `authenticated` que RECEBE id do cliente (`uuid`/`uuid[]`/`smallint`/`text`). Nenhuma das três recebe parâmetro | ata explicando |

---

## 5. Plantar cada um dos doze estados (`supabase/tests/integridade_alarme.sql`)

Idioma: DELTA (antes → depois), como `f36_detentor.sql:324-371` já faz. Tudo dentro de `begin … rollback`.
Nenhuma asserção sobre universo vazio: cada uma usa `pg_temp.assert_zero_de('<rótulo>', <0 ou 1>, 1)`,
universo 1 (não-vazio), ou o idioma positivo `bool_and` do `catalogo_secdef.sql`.

| # | chave | o que se planta | o que precisa DESLIGAR | por quê |
|---:|---|---|---|---|
| 1 | `patrimonio_duplicado` | dois ativos com o mesmo `(patrimonio, service_tag)` na MESMA filial | `drop index public.ativos_patrimonio_service_tag_uidx` | é o **único** dos doze bloqueado por objeto de banco (`0091`); DDL é transacional, o `rollback` o traz de volta |
| 2 | `ativo_filial_inativa` | `update filiais set ativo=false` numa filial que tem ativo | nada | nenhum trigger em `filiais` |
| 3 | `termo_sem_arquivo` | `insert termos_gerados` com `arquivo_path` que não existe no bucket | nada | as duas escritas nunca foram atômicas |
| 4 | `perfil_sem_conta` | `insert profiles` com id que nunca existiu em `auth.users` | nada | a FK `profiles_id_fkey` foi derrubada na `0073` |
| 5 | `conta_sem_perfil` | `insert auth.users` e depois `delete profiles` daquele id | nada | `profiles_guarda_dev` só recusa DELETE de `dev` |
| 6 | `pendencia_de_estornada` | `insert pendencias_item` apontando para movimentação já estornada | nada | o estorno-strip é lógica de `aplicar_movimentacao`, não restrição |
| 7 | `operador_sem_filial` | `insert profiles` `papel='operador'`, ativo, sem `operador_filiais` | nada | é o estado natural de quem acabou de ser convidado |
| 8 | `arquivo_termo_orfao` | `insert storage.objects` no bucket `termos` sem `termos_gerados` | nada | — |
| 9 | `conflito_entre_filiais` | dois ativos, mesmo par, filiais DIFERENTES | nada | é o caminho feliz do recurso desde a F24 |
| 10 | `detentor_em_estado_sem_dono` | `update ativos set colaborador_atual=…` num status sem dono | nada | `guarda_acervo` recusa DELETE, não UPDATE |
| 11 | `reserva_aberta` | `insert lancamentos_item` `tipo='reserva'` com `chamado`, sem liberação | nada | regra de fluxo de UI, não de schema |
| 12 | `backup_orfao` | `insert storage.objects` no bucket `backups-import` com caminho não registrado | nada | — |

Dependências de fora de `public`: **3** de `storage.objects` (3, 8, 12) e **2** de `auth.users` (4, 5).
No CI as duas existem no recorte mínimo de `supabase/ci/bootstrap-storage.sql` e `bootstrap-auth.sql`.
⚠ `storage.objects` no CI **não tem a coluna `metadata`** — nenhum insert do roteiro a usa.

O roteiro afirma também: o resumo sob sessão de `consulta` devolve o MESMO `(chave, total)` que a função
da `/dev` sob sessão de `dev`; o resumo recusa quem não tem sessão e `anon`; o resumo não tem coluna
`amostra`; e `rotulo_de_ambiente()` responde onde a linha existe e nada onde não existe.

⚠ **Este roteiro roda SÓ no Postgres do CI.** Nunca pelo MCP no ensaio: ele desliga um índice, e um
roteiro que desliga trava rodado fora de transação deixa a trava desligada.

---

## 6. As três guardas de ambiente (Decisão 8)

| consumidor | semântica NOVA | por quê |
|---|---|---|
| `scripts/env-guard.ts` (seed/reset) | ref ∈ `REFS_DE_ENSAIO` **E** `rotulo_de_ambiente()` = `'desenvolvimento'` | é o único que escreve dado fictício; ref inventado passa a ser recusado, e o banco confirma a identidade |
| `scripts/db/restaurar.mjs` | ref ∈ `REFS_DE_ENSAIO` **OU** Postgres local sem ref | o CI restaura contra `DATABASE_URL` local, e isso não é erro |
| `scripts/import/guard.ts` | **INTACTO** (sem lista) | a carga de go-live vai a produção por desenho |

`restaurar-guarda.test.mts` é reescrito para a forma nova, mantendo a guarda contra lista vazia — hoje
ele lê `const REFS_DE_PRODUCAO = [...]` por regex nos dois arquivos; passa a ler `REFS_DE_ENSAIO`, e
continua exigindo que as duas listas sejam iguais e não-vazias.

---

## 7. O smoke, o workflow e o alarme

### O que morre

`--exigir-f12`, `SMOKE_EXIGIR_F12`, os três `preF12: true` e os **nove** ramos `n/a` de schema ausente
(migrations `0101`, `0102`, `0116/0119`, `0118`, `colaboradores`, além dos três de F12). Ausência de
schema para migration que está em produção passa a ser **FALHA**. O décimo ramo — *"nenhum colaborador
cadastrado ainda"* — é estado de DADO e continua `n/a`, com o comentário dizendo que é outra classe.

### O agendado (Decisão 6)

- **Parte A** — `smoke-prod.mjs --sem-sessao`: as 18 rotas + a nova `/api/saude`. **Sem `npm ci`**: o
  `import { createClient } from '@supabase/supabase-js'` vira `await import()` DENTRO de `parteB()`.
- **Parte B agendada** — `scripts/smoke/integridade.mjs`, novo, **puro `fetch`, zero dependência**:
  abre sessão da conta `consulta` pelo endpoint de token, chama `checagens_integridade_resumo`, compara
  com a linha de base versionada, e faz um punhado de leituras de prova de sessão pelo PostgREST.
  A **Parte C fica fora** — com conta `consulta`, 6 dos 65 checks viram AVISO com texto que mente sobre
  a causa (*"sessão não aceita"* quando o que faltou foi CARGO). Ela continua sendo o ritual local com a
  conta admin.
- **Sem credencial, no agendado, é FALHA.** Local continua tolerante (o ritual pós-deploy é humano e o
  README explica).
- A abertura de sessão é uma função que recebe credencial e devolve token, e as asserções são uma lista
  POR SESSÃO — é o que deixa o canário de isolamento da F73 entrar sem reescrever o arquivo.

### O custo (medido)

134 runs de CI entre 01 e 09/09 (8,85 dias): **829,5 min** exatos por job, **~950 min** arredondando
cada job ao minuto → **~2.812 a ~3.220 min/mês** no ritmo atual. A cota é 2.000 (Free) ou 3.000
(Pro/Team) — e o token do `gh` não tem escopo `user`, então o plano não é legível por API (404 nas
duas rotas de billing). **Conclusão de desenho: o `saude.yml` não pode custar quase nada.** Sem
`npm ci` em nenhuma das duas partes, cada execução é ~1 min. Parte A 4×/dia + Parte B 1×/dia ≈ **5
min/dia ≈ 150 min/mês** (~5% do teto Pro). O primeiro dispatch mede de verdade.

### `.github/workflows/saude.yml`

- `schedule`: Parte A a cada 6 h em minuto quebrado — `17 3,9,15,21 * * *` UTC (00:17, 06:17, 12:17 e
  18:17 de Brasília); Parte B — `43 9 * * *` UTC (06:43 de Brasília).
- `workflow_dispatch` com `alvo` (`producao`|`ensaio`) e `partes` (`a`|`b`|`ab`).
- `permissions: { contents: read, issues: write }` e nada mais.
- `concurrency` sem sobreposição; `timeout-minutes: 10`; Node 24.
- **Nunca** `push`, **nunca** `pull_request`, **nunca** check obrigatório.
- Credencial só por `secrets.*`; configuração não-secreta por `vars.*`; nenhum `echo` de nenhum dos dois.

### A issue de alarme

Estado **por PAR `(alvo, parte)`** — quatro pares possíveis, quatro alarmes independentes. Sem isso, a
Parte A verde de 6 em 6 horas fecharia o alarme de integridade que a Parte B abriu, e ele piscaria todo
dia; e um dispatch verde no ensaio fecharia um alarme real de produção. Uma issue aberta por par, com
label `alarme` e o par no título; fecha só no verde do MESMO par. Comentário novo só quando o ESTADO
muda; senão, atualiza o corpo. Corpo: o que falhou, total × linha de base, link do run e link do
`RUNBOOK-ALARME.md`. **Nunca amostra, nunca nome, nunca patrimônio.** A Parte A e a checagem 12 releem
antes de alarmar.

A lógica (abrir/atualizar/fechar por par) é uma **função pura** testada com os três casos: A verde com B
vermelha aberta; ensaio verde com produção vermelha aberta; falha passageira que some na releitura.

---

## 8. A sequência da Frente F (credenciais)

Nesta ordem, cada unidade num processo só, e **nenhum VALOR** sai para lugar nenhum:

1. **PRODUÇÃO** — a conta `consulta` e os secrets dela, ANTES de mexer no `.env.local` (a chave de
   serviço de produção ainda está lá). Endereço derivado por sub-endereçamento do e-mail da conta de
   smoke que já existe (`+agendado` antes do `@`), no próprio processo, sem imprimir. Senha por
   `crypto`, nunca exibida. Cargo `consulta` por `definir_papel_usuario` com a sessão da conta de smoke
   (que é admin) → o evento cai em `eventos_admin`. Confere por SQL que o cargo é `consulta` e que não há
   vínculo em `operador_filiais`. **Só então** `gh secret set` por stdin. Falhou em qualquer etapa →
   desativa a conta, registra, nenhum secret sobe.
2. **2a — o `.env.local` vai para o ENSAIO**, num script atômico que imprime só os NOMES que mudou.
   Primeiro `SMOKE_SUPABASE_URL`/`SMOKE_SUPABASE_ANON_KEY` com os valores de PRODUÇÃO que estão lá hoje;
   depois as do ensaio; `SUPABASE_SERVICE_ROLE_KEY` **vazia**; `SEED_CONFIRM` **vazia**;
   `VIEW_SESSION_SECRET` novo e local. Conferência por HASH: toda variável que não era para mudar tem de
   ter o mesmo hash antes e depois, senão aborta sem gravar.
3. **2b — a chave de serviço do ensaio** (Management API, no mesmo processo) e a conta fictícia
   `seed.consulta@wap.ind.br` no ensaio, **sem rodar o seed**. Depois os secrets/variables do ensaio.
4. **TOKEN** — `SUPABASE_ACCESS_TOKEN` sai do `.env.local`, por ÚLTIMO, depois de todo `db:types`.
   Destino: o cofre do sistema pela CLI fixada (`npx supabase@2.109.1 login`), com prova de que caiu no
   Gerenciador de Credenciais e não no arquivo de texto.

Se o classificador barrar: registra, segue para trabalho que não é credencial, e o passo barrado (mais
os que dependiam dele) vai para o roteiro do Johnny.

---

## 9. As onze decisões

1. **A forma do resumo** — núcleo extraído, SQL das doze VERBATIM, `dev_checagens_integridade` vira
   guarda + delegação. Prova: `corpo-vigente.mjs` + diff das doze peças, e os mesmos totais antes ×
   depois nos dois bancos.
2. **A política do alarme** — hoje-zero × catraca, **por alvo**, na tabela do §2, versionada em
   `scripts/smoke/linha-de-base.json`. A linha de base só DESCE sozinha (achado resolvido); SUBIR é
   decisão do Johnny, com ata. A 12ª (`backup_orfao`) tem **releitura de confirmação** depois de 90 s,
   por causa do falso positivo transitório documentado pela F54 (backup em voo).
3. **O alcance da redação** — por NOME (a regex da ficha) **e** por VALOR. Por valor: e-mail (com
   certeza — `auditoria-registro.ts:45` loga `alvo`, "e-mail do convidado"), CPF e telefone. Vale para
   TODA string que sai do funil, inclusive `erro.mensagem`. `details` e `hint` do PostgREST nunca saem.
4. **O alcance da trava de console** — TODO o servidor (76), não os 59 da ficha. Os 17 que a ficha
   deixaria de fora são os que mais precisam: `app/(app)` (10), `lib/storage` (3), `lib/auth` (3) e a
   auditoria (1).
5. **A ida ao banco da sonda** — `select('id').limit(1)` em `public.filiais` pela chave pública, **sem
   `head`**. `anon` já tem o grant de tabela hoje e a RLS não lhe dá linha nenhuma (medido: 4 policies
   em `filiais`, todas `{authenticated}`), então a resposta é `[]` com `error: null` — **zero superfície
   nova**, nenhuma RPC nova para `anon`, as asserções 4 e 6 do `catalogo_secdef.sql` intactas. Sem
   `head` porque `head: true` numa relação inexistente devolve 204/null/null: o falso verde medido em
   22/07. Banco fora → erro → **503**.
6. **O que a Parte B agendada roda** — login da conta `consulta` + o resumo + leituras de prova de
   sessão, tudo por `fetch`. Parte C fora (§7). Sem secret no agendado = FALHA.
7. **A regra do `env-exemplo.test.ts`** — todo `process.env.X` lido por `src/` ou `scripts/` não-teste
   tem de estar no `.env.example` **ou** numa lista nominal de SISTEMA dentro do próprio teste. As de
   FERRAMENTA entram no `.env.example` numa seção própria, comentadas, sem valor.
8. **A semântica da permissão por consumidor** — tabela do §6.
9. **O nascimento da conta `consulta`** — API administrativa (`createUser`) + `definir_papel_usuario`
   com a sessão da conta admin de smoke, para a trilha cair em `eventos_admin` com autor de verdade.
10. **A prova do `onRequestError`** — branch descartável, **só push, sem PR**, prévia da Vercel, erro
    provocado numa rota de prévia, lido pelo MCP da Vercel (projeto
    `prj_sUTqyUqhj7ZwGv8h5CAXMnpbU3fb`, time `team_3IrMo5TwpVmaniEKb3B0jbcs` — conferidos hoje). A
    branch nunca é mergeada e é apagada no fim.
11. **Onde moram os dois documentos** — `docs/RUNBOOK-ALARME.md` (procedimento de resposta) e
    `docs/INVENTARIO-CREDENCIAIS.md` (por NOME, nunca valor), os dois indexados em `docs/README.md`.
    Convenção da casa: `RUNBOOK-<assunto>` para procedimento operacional. A regra nova da matriz entra
    como emenda F55 na família **`R-ACC`**, a partir de **`R-ACC-60`** (o próximo id livre, medido).

---

## 10. A ordem de execução

A → B → C → D → E → F → G, com `lint`/`test`/`tsc` verdes entre uma e outra. A costura do fim: a `0138`
aplicada (ensaio, depois produção) e a Frente F feitas **antes** do merge; o merge **antes** das provas
por dispatch — `workflow_dispatch` só existe com o arquivo na branch padrão.

Os pushes são agrupados: cada push custa ~6 min de CI.

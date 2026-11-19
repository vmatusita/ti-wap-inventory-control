# PLAN-F68 — A porta pública por empresa (o visualizador por senha sem service role)

Ordem: [`prompts/F68-porta-publica-por-empresa-ultracode.md`](prompts/F68-porta-publica-por-empresa-ultracode.md) (os 25
fatos, as decisões 19/11-1, 19/11-2 e 19/11-3 do Johnny). Ficha: `PLANO-MULTIEMPRESA.md` §7, F68 (dividida em F68 + F68B
pela decisão 19/11-1). Moldes: F67 (definer por empresa, `definer_sem_tenant.sql`, as três exigências), F67C (tabela-verdade,
prova viva, Skew Protection, relatório), F64 (o contador que falha fechado, R-ACC-95), F58 (`chamarRpc`, `linhaDe`, Zod),
F50 (a lista branca do tripwire), F55 (smoke e Parte B). Versão **1.76.0**. Branch `f68-porta-publica`.

Este plano foi escrito ANTES do primeiro commit que toca `supabase/`, `src/` ou `scripts/` (critério 2). O censo foi feito
por cinco exploradores paralelos (superfície e lista branca dos gerados; travas e rotas; CI, catálogos e injetor;
documentação oficial; fichas e moldes), resumidos aqui, e remedido por mim onde a decisão dependia do número.

---

## 0. O "antes" — tirado em 19/11/2026 (~09:00 BRT), antes de qualquer apply

Só catálogo, contagem, configuração e hash, pelo MCP (`execute_sql` só leitura). Arquivos em
[`f68-evidencias/antes/`](f68-evidencias/antes/).

**O conector alcançou PRODUÇÃO; o ENSAIO recusou** (`connect ECONNREFUSED` no IPv6 da porta 5432, três vezes entre 09:00 e
09:40, embora o `list_projects` o mostre `ACTIVE_HEALTHY`) — o fato 4 se repete. O "antes" do ensaio é tirado na primeira
vez que ele responder, e de novo "logo antes" do apply (Frente G, passo 5). Sem ensaio, **nada vai a produção** (caminho B).

| o quê | produção |
|---|---|
| ledger | 191 entradas, última `contracao_default_filiais` (= `0207`) |
| empresas · filiais · relatórios gerados | 1 · 6 · 15 |
| funções de `public` | **117** (70 definer, 39 definer executáveis por `authenticated`); md5 do TSV `7b461b5b…` (`producao/funcoes.tsv`, conferido byte a byte contra o md5 calculado no banco) |
| executáveis por `anon` · com EXECUTE a PUBLIC | **0** · 0 |
| policies `public`+`storage` | **62**; md5 do TSV `cee318f5…` — IGUAL ao "antes" da F67C (16/11): nenhuma policy mudou desde então |
| policies que citam `anon`/`public` | **0** |
| relações de `public` · com SELECT a `anon` | 38 · 33 (o grant padrão, barrado pela RLS) |
| `rolconfig` | `anon` 3 s · `authenticated` 8 s · `authenticator` 8 s (+ `lock_timeout` 8 s) · `service_role` nenhum |
| logs | `log_parameter_max_length_on_error=0` · `log_min_error_statement=error` · `log_statement=ddl` · `log_min_duration_statement=-1` · `pg_stat_statements.track=top` |
| `pgcrypto` | 1.3 em `extensions` |
| `senhas_acesso` | **5** · 5 ativas · **5 `scrypt$`** · 0 `$2` · 5 da legada · último uso 13/07 (3), 12/08 (1), 27/08 (1) · 0 nos últimos 30 dias · md5 das linhas `f53ad507…` |
| constraints de `senhas_acesso` | PK `(id)`, FK `empresa_id`, FK `criado_por`, CHECK `hash ≤ 200`, CHECK `rotulo ≤ 80` — **sem `unique (empresa_id, id)`**; gatilhos `senhas_acesso_guarda_empresa` e `zz_guarda_empresa` |
| `relatorios_gerados` | 15 · todas schema 2 · 8 consolidados · **14 com alguma chave de pessoa** (`colaborador` 14, `colaboradorSetor` 12, `setor` 12, `autor` 1, `colaborador_setor` 0) · `ativoId` em 7 · `observacao` (coluna) em 9 · maior `dados` 129.293 bytes (média 29.920) · maior soma das 4 tabelas 398 linhas |
| as 13 checagens | `arquivo_termo_orfao` 3 · `backup_orfao` 12 · `conflito_entre_filiais` 59 · `detentor_em_estado_sem_dono` 1 · as outras nove 0 — **a linha travada** (= F67C) |
| `pg_stat_statements` de `registrar_tentativa_senha` | `service_role` **16** chamadas (o T0 da janela da F68B) |
| as 7 `rel_*_filiais` como `authenticated` | máx. 3.206 ms (`rel_estoque_asof_filiais`, média 126 ms), 1.120, 1.067, 861, 688, 608, 415, 258 ms |
| advisors de segurança | INFO `rls_enabled_no_policy` 6 · WARN `authenticated_security_definer_function_executable` 39 · WARN `auth_leaked_password_protection` 1 · **`anon_security_definer_function_executable` 0** · ERROR 0 |
| advisors de desempenho | INFO `unindexed_foreign_keys` 39 (inclui `senhas_acesso_empresa_id_fkey`) · `no_primary_key` 1 · `unused_index` 7 · WARN `multiple_permissive_policies` 1 · ERROR 0 |
| custo do bcrypt (bloco `do … raise`, só leitura, 5 conferências por custo) | **bf/8 21,8 ms · bf/10 91,2 ms · bf/11 158,9 ms · bf/12 337,7 ms** |

---

## 1. Os 25 fatos, remedidos

| fato | a ordem disse | medido (19/11) |
|---|---|---|
| 1 | `6fc9ee95`, `v1.75.0`, `0207`, `1.76.0`, checks `verificar`+`banco-sem-docker` | igual; árvore limpa salvo a própria ordem |
| 2 | 281 arquivos / 8.965 casos; 65 roteiros / 1.368; injetor 188; 117 / 70 / 39; 62 | o catálogo igual; os números de teste são remedidos na contagem final (Frente G) |
| 3 | 3 / 12 / 59 / 1 / nove 0 | igual em produção (§0) |
| 4 | ensaio `ECONNREFUSED` | **igual hoje** (3×); produção respondeu |
| 5 | advisors 6 / 39 / 1 / 0 anon | igual |
| 6 | `getViewerSession` `:473`, `resolverAcessoRelatorio` `:497`–`507`; tripwire 605 linhas, 11 módulos, 9 tabelas, 7 RPCs | igual |
| 7 | `entrarComSenha` `:55`, contador, laço com `break`, cookie `wap_view` `path: '/relatorios'` | igual (`senhas.ts:55`–`119`) |
| 8 | colunas, RLS sem policy, CHECKs, sem `unique (empresa_id, id)` | igual (§0) |
| 9 | ninguém lê `senhas_acesso.empresa_id`; catraca `senhas.ts` operação 2 | igual (`empresa-legada-catraca.test.ts:56`–`59`) |
| 10 | as três de gestão com `exigirAdmin` + admin client; `criarSenhaSchema` 8–200 | igual; a lista `listarSenhasAcesso` (`queries/admin.ts`) é F69 |
| 11 | as rotas em `(app)`, o ramo em `layout.tsx:196`, o proxy `:148`–`170`, `otp.ts:57` | igual |
| 12 | o smoke: `/relatorios/acesso` pública; sem prova positiva | igual (`smoke-prod.mjs:189`–`217`) |
| 13 | `empresas.slug` com `r` e `relatorios` reservados; legada `wap`; `src/app/r/` não existe | igual (`0152:93`–`98`, `:127`–`128`) |
| 14 | `anon` 3 s; `rel_estoque_asof_filiais` máx. 3.206 ms | igual; **a doc do PostgREST confirma**: ele aplica as configurações do papel assumido E "hoists" as `statement_timeout` da FUNÇÃO para a transação (*Hoisted Function Settings*, `db-hoisted-tx-settings`, PostgREST ≥ 12) — a doc NÃO diz se isso estende o teto do papel; vai medido na F68B |
| 15 | 0 de 117 por `anon`; 0 policies; 33 de 38 com SELECT; nenhuma asserção "nenhuma por anon" | ⚠ **existe**: a asserção 4 de `catalogo_secdef.sql` (`:366`–`386`) já diz "nenhuma definer executável por `anon`" — é ELA que a porta derruba e que vira o par nominal (decisão 14b). O bloco 4 de `seguranca_catalogo.sql` só confere as duas funções-gatilho, como a ordem disse |
| 16 | `pgcrypto` 1.3 em `extensions`; o CI sem | igual (o bootstrap não cria `extensions`); a imagem `postgres:17` traz o contrib |
| 17 | `log_parameter_max_length_on_error = 0` etc. | igual; a doc: o PostgREST registra a URL (não o corpo); `pg_stat_statements` normaliza constantes em `$n`; o log de erro não leva parâmetro (`…_on_error = 0`) |
| 18 | 16 chamadas do `service_role` | igual |
| 19 | 15 / schema 2 / 8 consolidados / 14 com pessoa | igual; o censo por chave está no §0 |
| 20 | as páginas de gerados usam `listarRelatoriosGerados`, `vizinhosDoRelatorio`, `buscarRelatorioGerado`, `listarFiliais`, `listarTiposItem` | igual |
| 21 | o ao vivo: ~25 leituras | igual (Frente F escreve a ficha F68B) |
| 22 | o método; o mapa de regras até R-ACC-143; ADR §19; RUNBOOK Anexo F67C | igual |
| 23 | Skew Protection ligada, 12 h | não remedido (a F67C mediu em 16/11; nada aqui depende do número além da decisão 18) |
| 24 | a ficha ficou para trás em cinco pontos | igual — declarados no §6 e no relatório |
| 25 | as travas que a rota toca | igual, e mais (§5): `confinamento-viewer.test.ts`, `guardas-de-action.test.ts`, `otp-destino.test.ts`, `sem-literais.test.ts`, `comecar.test.ts`, `registry.test.ts`, `rollback-f6x.test.ts` |

---

## 2. A tabela-verdade da SUPERFÍCIE do visualizador

| passo de hoje | client de hoje | o passo novo | client novo | a prova |
|---|---|---|---|---|
| o formulário (`/relatorios/acesso`, `AcessoForm`) | — (o `(app)/layout` chama `getOperador()` antes) | `/r/<slug>/relatorios/acesso`; a página pede `relatorio_publico_dados(…, 'porta')` para o nome da empresa (slug inexistente → 404) | `publico.ts` (anon, sem cookie) | `fronteira-viewer.test.ts`, smoke (200 / 404) |
| o contador `registrar_tentativa_senha(p_ip)` | **admin** | dentro de `relatorio_publico_abrir`: teto por empresa, depois por (empresa, origem) | anon → definer | `isolamento_viewer.sql` (contador), sabotagem G |
| a conferência da senha (scrypt em laço com `break`) | **admin** | `relatorio_publico_abrir`: bcrypt do `pgcrypto`, sempre K = 5 `crypt()` | anon → definer | `isolamento_viewer.sql` (cinco recusas), medição (decisão 4) |
| o `ultimo_uso` | **admin** | dentro de `abrir`, só no acerto | anon → definer | `isolamento_viewer.sql` |
| o cookie (`wap_view`, HMAC de `{sid: senha_id, exp}`, `path: /relatorios`) | — | `wap_porta` = o token opaco CRU, `path: /r/<slug>`, 24 h; no banco só o sha-256 | — | `isolamento_viewer.sql` (o hash, não o token), `porta.test.ts` |
| o proxy (`/relatorios/**` pela PRESENÇA do cookie) | — | sem operador: `/relatorios/**` → **308** para `/r/wap/relatorios/acesso?next=<traduzido>`, apagando `wap_view`; `/r/**` público; com operador, nada muda | — | `proxy.test.ts`, `porta-rotas.test.ts`, smoke |
| o layout (`(app)/layout.tsx:196`, `ViewerHeader`) | **admin** (`getViewerSession`) | `src/app/r/[empresa]/relatorios/(sessao)/layout.tsx` pede `dados(…, 'sessao')`; recusa da sessão → a entrada; recusa da empresa (a diagonal) → 404 | `publico.ts` | `isolamento_viewer.sql` (diagonal), `fronteira-viewer.test.ts` |
| a conferência da sessão (`getViewerSession`, a cada request) | **admin** | `dados` confere a sessão POR DENTRO a cada pedido (hash, vencimento, encerramento, senha ativa e bcrypt) | anon → definer | `isolamento_viewer.sql` (vencida, encerrada, revogada) |
| a lista de gerados (`listarRelatoriosGerados`, `listarFiliais`) | **admin** | `dados(…, 'gerados', {pagina, filiais})` — a lista e as filiais do filtro, por lista branca | `publico.ts` | `isolamento_viewer.sql` (minimização) |
| o detalhe (`buscarRelatorioGerado`, `vizinhosDoRelatorio`, `listarTiposItem`) | **admin** | `dados(…, 'gerado', {id})` — o detalhe, os vizinhos, a versão mais nova e o vocabulário, por lista branca | `publico.ts` | idem + trava TS↔SQL |
| o ao vivo (`getSnapshotRelatorioV2` + 7 `rel_*`) | **admin** | **some** até a F68B: `/r/<slug>/relatorios/<filial>` mostra o aviso com o link para os gerados | nenhum | smoke, `fronteira-viewer.test.ts` |
| o sair (`sairVisualizacao`, apaga o cookie) | — | `sairDaPorta`: `dados(…, 'encerrar')` (a sessão morre NO BANCO) + apaga o cookie | `publico.ts` | `isolamento_viewer.sql` (encerrada) |
| as páginas do OPERADOR em `/relatorios/**` | sessão (RLS) | **fica com o operador**, sem uma linha mudada | sessão | smoke, conferidor, diff |

Nenhum passo do visualizador cria client administrativo nem client de sessão.

---

## 3. A tabela-verdade da GESTÃO das senhas

| ação | client de hoje | o novo | a empresa (de onde vem) | a prova |
|---|---|---|---|---|
| criar | admin (`hashSenha` scrypt + `insert`) | `senha_acesso_criar(p_empresa, p_rotulo, p_senha)` (definer, `authenticated`): `e_admin_na(p_empresa)`; senha 8–72 BYTES; teto K = 5 ativas bcrypt; recusa a senha repetida NA empresa; `crypt(…, gen_salt('bf', 10))` | `empresaDaOperacao()` (destino **F70**: a escolhida) | `isolamento_viewer.sql` (gestão), sabotagem J |
| conferir | admin (`verificarSenha` scrypt) | `senha_acesso_conferir(p_empresa, p_id, p_senha)` → `confere` / `nao_confere` / `formato_antigo` (scrypt: não confere nada) | `empresaDaOperacao()` (destino **F69/F70**: a da linha vinda da lista por empresa) | idem |
| revogar / reativar | admin (`update ativa`) | `senha_acesso_definir_status(p_empresa, p_id, p_ativa)` → o rótulo; só altera a linha cujo `empresa_id = p_empresa` (a de outra empresa é "não encontrada"); reativar respeita K | idem; **a trilha grava a empresa DA LINHA** (= `p_empresa`, provada pela função) | idem |
| listar | admin (`listarSenhasAcesso`, `queries/admin.ts`) | **fica como está — F69** | — | — |
| a trilha (`registrarEventoAdmin`) | admin, em `auditoria-registro.ts` (fora de `senhas.ts`) | igual — `senhas.ts` não importa `createAdminClient` | `senha_criada`: a da senha criada; `senha_revogada`/`senha_reativada`: a da linha | `senhas.test.ts`, catraca |

---

## 4. A LISTA BRANCA dos campos (decisão 7)

**Fonte única**: `src/lib/relatorios/lista-branca-porta.ts` (`LISTA_BRANCA_PORTA`), o MESMO JSON literal que vai no corpo
de `relatorio_publico_dados` (`k_lista`). A trava `lista-branca-porta.test.ts` confere (a) TS = SQL, por igualdade
profunda contra o corpo vigente no disco; (b) todo caminho da forma Zod do snapshot (V1 ∪ V2, que espelha `tipos.ts` campo
a campo, com a prova de compilação de `relatorios-gerados-tipos.test.ts`) está classificado em `sai` (está na lista) OU em
`NAO_SAI` (com motivo) — nunca nos dois, nunca em nenhum. TUDO que `dados` devolve passa pela projeção
`relatorio_publico_projetar(valor, lista)`: o que não está na lista não sai, nem se alguém o puser no `jsonb_build_object`.

**`dados` (o snapshot, schemas 1 e 2)** — 228 campos: **213 saem, 15 não saem**.

| seção (`tipos.ts`) | sai | não sai (motivo) |
|---|---|---|
| `meta` | `filialSlug`, `filialNome`, `ehGeral`, `de`, `ate`, `periodoRotulo`, `schema`, `observacao` (texto livre — R) | — |
| `kpis`, `kpisAnterior` | os 8 agregados | — |
| `estoquePorCategoria[]`, `estoqueCatStatus[]` (+`segmentos[]`) | `categoria`, `status`, `total` | — |
| `disponiveisPorModelo[]` (V1 plano; V2 por categoria) | `categoria`, `modelo`, `modelos[].modelo`, `modelos[].total`, `total` | — |
| `reservados[]` | `patrimonio`, `modelo`, `categoria`, `chamado` (R) | — |
| `manutencao[]` (V2) | `patrimonio`, `modelo`, `filial`, `dataEnvio`, `diasEmManutencao`, `retornoData`, `fechado`, `desfecho`, `chamado` (R), `chamadoFornecedor` (R), `obsEnvio` (R), `retornoObs` (R), `anotacoes[].em`, `anotacoes[].texto` (R) | `anotacoes[].autor` (**pessoa** — `profiles.nome`); `ativoId` (**id interno** — só servia de link para a ficha, que o visualizador não abre) |
| `emManutencao[]` (V1) | `patrimonio`, `modelo`, `observacao` (R) | — |
| `serieMovimentacoes`, `serieEstado`, `movimentacoesPorMes[]` (V1) | todos (rótulos e contagens) | — |
| `porMotivo`, `pendencias[]`, `resumo` | todos (vocabulário e contagens) | — |
| `grupos[]` | `grupo`, `ultimoLancamento`, `temAtrelados`, `itens[].{item,total,estoque,saldo,minimo,atrelados,falta,entradas,saidas,delta,obs (R)}` | — |
| `saidas[]` | `data`, `filial`, `categoria`, `modelo`, `patrimonio`, `tipo`, `motivo`, `termo`, `estornada`, `estornoData`, `chamado` (R), `obs` (R) | `colaboradorSetor` (**pessoa**); `id`, `ativoId` (**id interno**) |
| `entradas[]` | idem + `itensFaltantes[]` (slugs do catálogo) | `colaborador`, `setor` (**pessoa**); `id`, `ativoId` (**id interno**) |
| `transferencias[]` | `data`, `de`, `para`, `categoria`, `modelo`, `patrimonio`, `estornada`, `estornoData`, `chamado` (R), `obs` (R) | `id`, `ativoId` (**id interno**) |
| `movimentacoesItens[]` | `data`, `filial`, `item`, `grupo`, `tipo`, `quantidade`, `ehEstorno`, `estornada`, `estornoData`, `chamado` (R), `obs` (R) | `colaborador` (**pessoa**); `id` (**id interno**) |
| `tabelasTruncadas` | `mostradas`/`total` das três | — |
| `ultimasMovimentacoes[]` (V1) | `data`, `tipo`, `patrimonio`, `ativo`, `categoria`, `filial`, `chamado` (R), `observacao` (R) | `colaborador_setor` (**pessoa**); `id` (**id interno**) |

**A linha de `relatorios_gerados` (lista, detalhe, vizinhos)** — 12 campos: **8 saem, 4 não saem**.

| campo | classe |
|---|---|
| `id` (só como endereço do detalhe), `periodo_de`, `periodo_ate`, `versao`, `gerado_em`, `filialNome`, `filialSlug`, `temObservacao`/`superada` (booleanos derivados) | sai |
| `observacao` (a coluna) | **sai só como `temObservacao`**; o texto da semana sai pelo `dados.meta.observacao` (R) |
| `gerado_por` e `autorNome` (`profiles.nome`) | **não sai** (pessoa — quem gerou) |
| `empresa_id`, `filial_id` | **não sai** (id interno; o slug e o nome cobrem o uso) |

**Fora do snapshot**: `empresa` (`slug`, `nome`), `filial` do filtro (`slug`, `nome`), `tipo` do vocabulário (`slug`,
`rotulo`), a `sessao` (`empresa`, `rotulo` da senha — o próprio rótulo de quem entrou, exibido no cabeçalho).

**O TEXTO LIVRE sai** (decisão 7): é o conteúdo operacional do relatório (observações, anotações, nº de chamado). Um
operador pode ter digitado um nome ali — vai em "o que este relatório NÃO prova".

**A página renderiza SEM as colunas de pessoa** (não com a coluna vazia): `CorpoRelatorio` ganha `semPessoas`, que tira
cabeçalho, célula, par da linha expansível e o campo da busca de `TabelaSaidas`, `TabelaEntradas`, `TabelaMovItens`,
`TabelaMovimentacoes` (V1) e o autor de `ManutencaoCasos`. As chaves de pessoa voltam ao objeto de RENDER como `null`
(e os `id` como índice) só para caber nos tipos de `tipos.ts` — nunca com valor; a resposta da porta não as tem.

---

## 5. A tabela-verdade das TRAVAS

| trava | exige hoje | depois |
|---|---|---|
| `queries/relatorios/fronteira-viewer.test.ts` | 11 módulos de query sob service role; 9 tabelas; 7 RPCs; a premissa "o único muro é o código" | **reescrito**: (mesa TS) o fecho de imports de `src/app/r/**` não alcança `supabase/admin`, `supabase/server`, `queries/**` nem `auth/acesso`; `publico.ts` só chama as duas funções, por `chamarRpc`, e nenhum `.from(`; (mesa SQL) o corpo vigente das duas só cita tabelas de uma lista branca com motivo, nunca `profiles`/`colaboradores`. A premissa velha sai, com a data |
| `components/relatorios/confinamento-viewer.test.ts` | os links da superfície do viewer ficam em `/relatorios/**` | as raízes viram a árvore `/r/**` e o cabeçalho da porta; todo link fica na porta da MESMA empresa (`caminhoDaPorta`) ou é exceção guardada por `ehOperador` |
| `supabase/superficie-admin.test.ts` | `acesso.ts` (2 invocações) e `senhas.ts` (4) declarados | as duas entradas SAEM (as invocações sumiram; a de órfã reprovaria) |
| `actions/senhas.test.ts` | R-ACC-95 no fonte de `entrarComSenha`; `testarSenhaAcesso` por `verificarSenha`; `hashSenha` | a gestão pelas três funções; nenhum `createAdminClient`; a forma do R-ACC-95 migra para `actions/porta.ts` (o erro do `abrir` recusa antes de qualquer coisa) |
| `actions/senhas-rate-limit.test.ts` | comportamento do contador com mocks do admin | vira `actions/porta.test.ts` (mocks de `publico.ts`): erro recusa, tentativas recusa, as cinco recusas com UMA mensagem, o cookie com `path` da empresa |
| `guardas-de-action.test.ts` | isenções `senhas.ts::entrarComSenha`/`::sairVisualizacao`; teto 7 | re-key para `porta.ts::entrarNaPorta`/`::sairDaPorta`; o teto fica em 7 |
| `auth/empresa-legada-catraca.test.ts` | `senhas.ts` operação 2 destino F68 | `senhas.ts` operação 3 (criar → F70; conferir/status → F69/F70, a trilha já é a da linha); `(app)/relatorios/[filial]` igual (a página não muda) |
| `src/proxy.test.ts` | `/relatorios/acesso` "a entrada por senha" | muda de sentido (declarado): `/relatorios/acesso` "o 308 para a porta"; `/r/wap/relatorios/acesso` "a entrada por senha" |
| `auth/otp-destino.test.ts` | `redirectAcessoRelatorios` → `/relatorios/acesso?next=` | → `/r/wap/relatorios/acesso?next=<traduzido>` (declarado) |
| `unidades/rotas.test.ts` | rota que lê `filial` chama `recusarFilialInexistente` | a página `[filial]` da porta NÃO lê `filial` (só mostra o aviso) — fica fora da varredura até a F68B |
| a ajuda (`ajuda/registry.test.ts`, `comecar.test.ts`, `PLANO-AJUDA.md`) | `/relatorios/acesso` isenta | a rota continua em `(app)` (só redireciona) e continua isenta; a porta `/r/**` está fora de `(app)` e nunca ganha link — escrito |
| `layout/pendentes-da-regua.ts` / `consistencia.test.ts` | as regras 1–6 em todo `.tsx` | os `.tsx` novos de `/r/**` nascem dentro da régua (sem isenção) |
| `identidade/sem-literais.test.ts` | `viewer-header.tsx` em `LEEM_A_FONTE` | o cabeçalho continua o mesmo arquivo (agora o da porta) |
| R-ACC-31 / `k_sem_select` (`catalogo_policies.sql`) | 6 tabelas sem SELECT | + `sessoes_visualizador`, `porta_tentativas`, com motivo e migration; as duas em `k_infra` |
| `catalogo_secdef.sql` asserção 4 | **nenhuma** definer executável por `anon` | o PAR nominal: as executáveis por `anon` são EXATAMENTE `k_secdef_anon` (2); e as duas existem, são definer, `search_path=''`, sem EXECUTE a `public`/`authenticated`/`service_role` |
| `seguranca_catalogo.sql` | RLS em toda tabela; bloco 4 | as duas tabelas novas com RLS; + nenhuma policy cita `anon`/`public` |
| `definer_sem_tenant.sql` | 24 em `k_escopo_ok` | + as três de gestão (chamam `e_admin_na`); as duas portas ficam fora do universo (sem EXECUTE a `authenticated`) — declarado |
| `integridade_tenant.sql` L4, `diff-tipos.test.mts`, `k_leitura_tenant` (+ cópias), `imutabilidade_tenant.sql` I1 | listas e censos | as funções e tabelas novas entram, com o motivo |
| os rollbacks F62–F67C | `\ir ../rollback/F67C-desfaz.sql` | `\ir ../rollback/F68-desfaz.sql` antes, e as travas de ordem dos `rollback-f6x.test.ts` |
| o advisor | 0 `anon_security_definer_function_executable` | **2, declarados**; + 2 INFO `rls_enabled_no_policy` (as tabelas deny-all) |

---

## 5b. Os novos

- `supabase/tests/isolamento_viewer.sql` (decisão 16) — com o cabeçalho dizendo por que ele só passou a ser testável agora.
- `supabase/tests/f68_rollback.sql` + `src/lib/validators/rollback-f68.test.ts`.
- `src/lib/relatorios/lista-branca-porta.test.ts` (TS↔SQL e "todo campo classificado").
- `src/lib/auth/porta-rotas.test.ts` (o slug espelho da `0152`, a tradução do `next`, o destino na MESMA empresa).
- `src/lib/actions/porta.test.ts` e o reescrito `fronteira-viewer.test.ts`.

---

## 6. O desenho — as vinte e três decisões

1. **A credencial da sessão.** Token aleatório gerado NO BANCO (`encode(extensions.gen_random_bytes(32), 'hex')`, 64
   caracteres), devolvido UMA vez por `abrir`, guardado só como `extensions.digest(token, 'sha256')`. O cookie `wap_porta`
   carrega o token **cru** (sem o envelope HMAC): o envelope não protege o caminho que importa — quem tem a chave `anon`
   chama `dados` direto, sem passar pelo app —, e só manteria uma credencial a mais no código. `httpOnly`, `secure` em
   produção, `sameSite: 'lax'`, `path: /r/<slug>`, `maxAge` 24 h. **`VIEW_SESSION_SECRET` sai do código nesta versão**;
   a variável fica no ambiente até a contração da F68B (o deployment velho, sob a Skew Protection, ainda a usa por até
   12 h). **Descartado** (ata e ADR §20): o `senha_id` como portador — legível no cookie, válido enquanto a senha
   estiver ativa; um cookie copiado viraria acesso sem prazo, e as 24 h só existiriam no navegador.
2. **Onde a sessão mora.** `public.sessoes_visualizador` (`0209`): `id`, `empresa_id` (not null, SEM default — a 15l),
   `senha_id`, `token_hash bytea unique`, `criada_em`, `vence_em`, `encerrada_em`; FK `(empresa_id)` → `empresas` e FK
   composta `(empresa_id, senha_id)` → `senhas_acesso (empresa_id, id)` (daí a `unique` da `0208`); índice
   `(empresa_id, senha_id)`; gatilho `guarda_empresa` (I1); RLS ligada, zero policy, `revoke all` de `anon`,
   `authenticated`, `service_role`. Nenhum dado pessoal (nem a origem). `k_infra` + `k_sem_select` com motivo e migration.
   A limpeza das vencidas/encerradas há mais de 1 dia roda dentro de `abrir`, no máximo 50 por chamada.
3. **O bcrypt.** Custo **10** (`gen_salt('bf', 10)`, 91 ms medidos em produção; o piso que a OWASP recomenda) e **K = 5**
   (o mesmo número de senhas que a WAP usa hoje): o pior caso de `abrir` é ≈ 5 × 91 ms ≈ 0,46 s, com folga nos 3 s do
   `anon`. **72 bytes**: o validador e `senha_acesso_criar` RECUSAM senha acima de 72 bytes em UTF-8 (não pré-hasheiam):
   recusar é a única escolha que prova por construção que duas senhas diferentes nunca abrem a mesma linha (com
   pré-hash, a prova dependeria do pré-hash). A senha repetida NA MESMA empresa é recusada na criação (a nova é conferida
   contra as ativas bcrypt dela); duas empresas com a mesma senha em claro coexistem.
4. **As cinco recusas: a mesma cara e o mesmo trabalho.** `abrir` devolve EXATAMENTE `{"ok": false}` para sem senha,
   senha errada, senha revogada, slug inexistente e senha de A no slug de B; a tela mostra UMA mensagem ("Senha
   inválida."). O trabalho: SEMPRE K = 5 `crypt()`, completando com um sal fictício de mesmo custo quando há menos
   candidatas, o resultado de cada `crypt()` guardado ANTES da comparação (nada de `and` que o planejador possa
   encurtar), sem `exit`. **O contador estourado tem resposta própria** (`{"ok": false, "recusa": "tentativas"}`,
   "Muitas tentativas…"): ele é decidido ANTES de qualquer senha e não depende dela — não revela se a senha existe; e o
   erro do contador (banco) recusa com a mensagem do R-ACC-95. **A régua, escrita antes de medir**: n = 30 chamadas por
   caminho no ensaio; cada mediana dentro de ±10% da mediana geral dos cinco caminhos.
5. **O contador** (`public.porta_tentativas`, `0210`, chave `text`: `empresa:<id>` e `origem:<id>:<md5(origem)>`; slug
   inexistente → `empresa:inexistente`, um balde só). Ordem: o **teto por EMPRESA** primeiro (20 por 60 s, somando as
   origens — sem ele, quem chama `abrir` direto pelo PostgREST forja a origem e a força bruta só pagaria o bcrypt), e só
   então o por (empresa, origem) (5 por 60 s, o de hoje). Estourado o da empresa, não se grava a linha da origem (a tabela
   não cresce com origens inventadas). A origem é guardada só como md5. **O custo**: quem esgota o teto tranca a porta
   daquela empresa por até 1 minuto — o Johnny não precisa fazer nada (a janela vence sozinha); se for ataque continuado,
   o WAF é da F73. **`request.headers`** (a doc do PostgREST): traz `x-forwarded-for`, mas para o app ele é o IP do
   servidor da Vercel (todos os gestores num balde só) e para quem chama direto o primeiro item é forjável — não vira
   terceira chave. O erro do contador recusa ANTES de conferir qualquer senha (mesma transação, antes do laço).
6. **`relatorio_publico_dados(p_sessao text, p_slug text, p_pedido text, p_args jsonb) returns jsonb`**, lista FECHADA de
   pedidos: `porta` (o único sem sessão: só `slug → nome` da empresa, o que o próprio link já mostra), `sessao`,
   `gerados`, `gerado`, `encerrar`. Pedido fora da lista = a recusa da sessão. Por dentro: o hash do token → a sessão
   viva (não vencida, não encerrada, senha ativa e bcrypt) → a empresa; o slug da rota confere com a empresa da sessão
   (`{"ok": false, "recusa": "empresa"}` → a página responde 404); só `encerrar` escreve. O retorno passa pelo Zod em
   `publico.ts` (F58).
7. **A lista branca** — §4.
8. **A gestão por empresa** — §3. As três com `e_admin_na(p_empresa)` antes de qualquer efeito, a linha conferida contra
   `p_empresa`, `revoke all … from public, anon, service_role` + `grant execute … to authenticated`. `senhas.ts` usa o
   client de SESSÃO e não importa `createAdminClient`.
9. **As 5 senhas de hoje** deixam de abrir por construção (a porta só confere `hash like '$2%'`); o agente não as toca
   (md5 das linhas igual antes e depois). A revogação formal é do Johnny, pela tela.
10. **A rota e os 308.** `src/app/r/[empresa]/relatorios/…`, fora de `(app)`. O proxy (sem banco): sem operador,
    `/relatorios` e `/relatorios/**` → **308** para `/r/wap/relatorios/acesso`, com o `next` traduzido
    (`/relatorios/gerados…` → `/r/wap/relatorios/gerados…`; `/relatorios/<filial>…` → `/r/wap/relatorios/<filial>…`, o
    aviso), e o `wap_view` apagado; `/r/**` passa sem tocar o Auth. Com operador, nada muda. O slug da legada é a
    constante `SLUG_EMPRESA_LEGADA` (`src/lib/auth/porta-rotas.ts`, módulo-folha sem `server-only`), espelho do INSERT da
    `0152` com trava (o molde de `EMPRESA_LEGADA_ID`). O `next` só aceita caminho da MESMA empresa.
11. **O layout público.** `(sessao)/layout.tsx`: o cabeçalho (`ViewerHeader` reescrito: a marca, o nome da empresa, o
    rótulo da senha, "Relatórios gerados", "Ao vivo" (o aviso) e Sair), sem nada do shell do operador. A régua de layout
    vale desde o primeiro arquivo; a ajuda continua isenta. O aviso: "O relatório ao vivo pela senha volta numa próxima
    versão. Enquanto isso, veja os relatórios gerados."
12. **`publico.ts`** (`server-only`): `createClient` do `supabase-js` com a URL e a chave `anon`, `persistSession`,
    `autoRefreshToken` e `detectSessionInUrl` desligados — não lê cookie nenhum. Só exporta `abrirPorta` e `pedirPorta`,
    que chamam as duas funções por `chamarRpc` e validam a resposta com Zod.
13. **A rota antiga atrás de flag: descartada** (manteria o service role vivo no código; o "pronto quando" da própria ficha
    viraria mentira; e dependeria das senhas scrypt que esta fase aposenta). A reversão é o revert do PR de código + o
    deploy, e DEPOIS `F68-desfaz.sql`.
14. **A fronteira reescrita** — §5. **14b**: a asserção 4 de `catalogo_secdef.sql` vira o par nominal `k_secdef_anon`.
15. **A prova viva no ENSAIO** depois do apply: um bloco que termina em `raise`, com duas empresas fictícias e senhas
    bcrypt de fixture, `set local role anon` e `set local statement_timeout = '3s'`, as cinco recusas, a abertura, a
    diagonal, a revogação, a minimização (contagem de chaves de pessoa = 0) e a medição da decisão 4. A chamada HTTP pelo
    PostgREST no ensaio com a chave `anon`: a recusa com token inválido e com senha errada (o contador do ensaio anda).
    **Em produção, nenhum `abrir`.**
16. **`isolamento_viewer.sql`** — os casos da ordem, todos.
17. **O `pgcrypto` no CI**: `supabase/ci/bootstrap-roles.sql` (o primeiro do loop — os dois loops do `ci.yml` já o
    rodam, e o workflow não se toca) ganha `create schema if not exists extensions`, `create extension if not exists
    pgcrypto with schema extensions`, `grant usage on schema extensions` aos três papéis e, só para documentar o
    ambiente, `alter role anon set statement_timeout = '3s'` (o `set role` dos roteiros NÃO o carrega; os casos que medem
    tempo põem `set local statement_timeout = '3s'` à mão). A `0208` CONFERE (`to_regprocedure`) que
    `extensions.crypt`, `gen_salt`, `digest` e `gen_random_bytes` existem e recusa com mensagem clara se não — sem criar
    extensão em produção.
18. **Expandir e contrair.** Só expansão: `registrar_tentativa_senha` e `senha_tentativas` ficam de pé, sem chamador
    novo, e caem na abertura da F68B (a janela por `pg_stat_statements`, a partir do T0 = 16 chamadas).
19. **O injetor** — uma mutação por classe de trava que nenhum teste de mesa já derruba (lista na Frente E).
20. **O smoke** — o mapa de rotas novo e a chamada de `dados` com a chave `anon` e um token inválido (leitura pura).
21. **A senha em claro**: `abrir` não tem `raise` nem cast sobre `p_senha` (só `crypt()`); a criação recusa por tamanho
    com mensagem FIXA; nada grava ou loga a senha; o `registrarFalha` do TS recebe só o erro, nunca o formulário.
22. **A trilha** — §3.
23. **"Nada muda para o operador"**: as páginas `(app)/relatorios/{[filial],gerados,gerados/[id]}` ficam com **diff
    zero** — `resolverAcessoRelatorio` perde o modo `viewer` e o tipo fica só `operador`; os ramos `ehOperador` delas
    viram código que só um operador percorre (a limpeza do ramo morto é da F68B, junto do ao vivo da porta).

---

## 7. As migrations e a ORDEM DE ROLLBACK

| apply | arquivo | o quê | classe |
|---|---|---|---|
| 1 | `0208_porta_base.sql` | confere o `pgcrypto`; `unique (empresa_id, id)` em `senhas_acesso` | ADITIVA |
| 2 | `0209_porta_sessoes.sql` | `sessoes_visualizador` (deny-all) | ADITIVA |
| 3 | `0210_porta_tentativas.sql` | `porta_tentativas` (deny-all) | ADITIVA |
| 4 | `0211_porta_gestao_senhas.sql` | `senha_acesso_criar`/`_conferir`/`_definir_status` (`authenticated`) | ADITIVA |
| 5 | `0212_porta_publica.sql` | `relatorio_publico_projetar` (sem EXECUTE a ninguém) + `relatorio_publico_abrir` + `relatorio_publico_dados` (só `anon`) | ADITIVA |

**A ORDEM DE ROLLBACK** (o inverso): revert do PR de código + deploy **primeiro**; depois `supabase/rollback/F68-desfaz.sql`
= `0212` → `0211` → `0210` → `0209` → `0208` (drop das 6 funções, das 2 tabelas e da `unique`). Escrita também no rodapé
de cada migration. Nenhuma linha de negócio é tocada; as 5 senhas não mudam.

---

## 8. Commits e pushes

1. docs: a ordem, este plano e o "antes".
2. as travas vermelhas (o par de `anon`, `isolamento_viewer.sql`, a fronteira, a lista branca, a gestão, o contador).
3. o bootstrap e as migrations, um commit por migration, com `db:lock`.
4. o catálogo, o rollback, as listas dos roteiros.
5. o app (publico.ts, `/r/**`, a entrada, o proxy e os 308, a gestão, a saída do ramo do visualizador, a catraca).
6. o smoke · 7. o injetor · 8. os documentos · 9. a versão.

Pushes agrupados: (i) até as travas vermelhas (o PR em rascunho, CI vermelho esperado); (ii) o resto do código; (iii)
correções. A mesa PGlite (PG 17.5 + pgcrypto) roda a cadeia, os roteiros e o injetor antes de cada push.

## 9. O SHA de código congelado

**`fd6d93fe`** (`fix(f68): a re-revisão — o V6c com controle negativo, …`), 19/11/2026 — o último commit da fase que toca
`src/**`, `scripts/**` ou `supabase/**`. A revisão adversarial (dois revisores, banco e app, no `2b8d72d2`) e a re-revisão (no
`291d4bca`) vieram ANTES dele; o que veio depois é só `docs/**` e `CHANGELOG.md`. O CI do PR (`verificar` e
`banco-sem-docker`) sobre ele é o portão do apply no ensaio; as migrations aplicadas no ensaio e em produção são as deste
SHA (md5 de cada arquivo e de cada `prosrc` no relatório).

## 10. O que este plano NÃO promete

- Prova positiva da porta em produção (não há senha bcrypt lá até o Johnny criar; a senha só do smoke é F73).
- Uma segunda empresa real entrando (não há; provado no CI).
- Que nenhum nome passe pelo texto livre (decisão 7).
- Resistência a força bruta distribuída de verdade (o teto por empresa a limita; WAF é F73).
- Nada sobre os dados do #84.

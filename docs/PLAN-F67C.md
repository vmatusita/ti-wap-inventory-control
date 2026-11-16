# PLAN-F67C — O fim do default (a escrita informa a empresa)

Ordem: [`prompts/F67C-fim-do-default-ultracode.md`](prompts/F67C-fim-do-default-ultracode.md) (os 32 fatos, as decisões
16/11-3 e 16/11-4 do Johnny). Ficha: `PLANO-MULTIEMPRESA.md` §7, F67C. Moldes: F67B (expansão/contração, janela, relatório),
F67 (tabela-verdade, `empresaDaFilial`/`empresaDaOperacao`, catraca, L4/`k_escritores`), F63/F64 (lotes, 15b/15e, a régua
"ninguém lê"), F65 (FKs compostas, `guarda_empresa`, notas (a)–(d)), F66B (DDL de metadado com o app no ar), F54
(`restaurar.mjs`). Versão **1.75.0**. Branch `f67c-fim-do-default`.

Este plano foi escrito ANTES do primeiro commit que toca `supabase/`, `src/` ou `scripts/` (critério 2). O censo que o
sustenta foi feito por oito exploradores paralelos (relatórios no scratchpad da sessão, resumidos aqui) e remedido por mim
onde a decisão dependia do número.

---

## 0. O "antes" — tirado em 16/11/2026 (~17:00 BRT), antes de qualquer apply

Só catálogo, contagem, configuração e hash, pelo MCP (`execute_sql` só leitura). Arquivos em
[`f67c-evidencias/antes/`](f67c-evidencias/antes/). **O conector do Claude Code alcançou os DOIS bancos na primeira
tentativa** (fato 5): `select 1` em produção (PG 17.6) e no ensaio (PG 17.11).

| o quê | produção | ensaio |
|---|---|---|
| ledger | 183 entradas, última `20261116134338 contracao_backups_por_empresa` (= `0199`) | 196, última `20261116124123 contracao_backups_por_empresa` |
| empresas · filiais · memberships ativas · plataforma | 1 · 6 · 14 · 2 | 1 · 6 · 3 · 0 |
| funções de `public` | **117** (70 definer); md5 do TSV `13db2199…` (`producao/funcoes.tsv`, conferido byte a byte contra o md5 calculado no banco) | **igual** (`13db2199…`) |
| policies `public`+`storage` | **62** (8 em `storage.objects`); md5 do TSV `cee318f5…` (`producao/policies.tsv`) | **igual** |
| as 22 colunas `empresa_id` | 22 `not null`; **20 com default** só `public.empresa_legada()` (pelo `pg_depend`); `membros`/`operador_filiais` sem | igual |
| linhas fora da legada nas 20 | **0 em todas** | 0 em todas |
| as 13 checagens (`checagens_integridade_nucleo()`) | `arquivo_termo_orfao` 3 · `backup_orfao` 12 · `conflito_entre_filiais` 59 · `detentor_em_estado_sem_dono` 1 · as outras nove 0 — **a linha travada** | `operador_sem_filial` 1 · as outras doze 0 |
| `pg_stat_statements` | `track=top`, `max=5000`, `save=on`, reset 09/07/2026 | `track=top`, reset 08/09/2026 |
| formas de INSERT de topo nas 20 (papéis do app) | SEM `empresa_id`: `authenticated` 17 formas / 998 chamadas · `service_role` 12 / 13.147; COM: **0**; sem lista: 0 (`producao/formas-insert.txt`) | `authenticated` 3/3 · `service_role` 1/9 (o ensaio não tem app) |
| advisors de segurança | INFO `rls_enabled_no_policy` 6 · WARN `authenticated_security_definer_function_executable` **39** · WARN `auth_leaked_password_protection` 1 · ERROR 0 | igual |
| advisors de desempenho | INFO `unindexed_foreign_keys` 39 · `no_primary_key` 1 · `unused_index` 7 · WARN `multiple_permissive_policies` 1 · ERROR 0 | igual, salvo `unused_index` 43 |
| Skew Protection (fato 28) | **LIGADA, medida**: o HTML público de `/login` traz `data-dpl-id="dpl_…"` e o `next.config.ts` não define `deploymentId` — é a Vercel que injeta o `NEXT_DEPLOYMENT_ID` (doc: o Next ≥ 14.1.4 o usa com Skew Protection). O **teto** (max age) não é legível pela ferramenta da Vercel (`get_project` não devolve o campo): vale o padrão do Pro, **12 h** (doc) | — |

O instrumento das formas é [`antes/formas-insert.sql`](f67c-evidencias/antes/formas-insert.sql): a classificação COM/SEM é
feita por regex DENTRO do banco; o texto da forma nunca sai.

---

## 1. Os 32 fatos, remedidos

Onde a medição contraria o texto, **a medição ganha** — e está no relatório.

| fato | ordem | medido | |
|---|---|---|---|
| 1 | `bdf3e23`, `v1.74.0`, última `0199`, 1ª da fase `0200`, versão `1.75.0` | confere; `0199` nos dois ledgers | ✓ |
| 2 | mesa 274/8.775; CI 63/1.299; injetor 184/184 (quar. 2); 117 funções/70 definer/39 por `authenticated`; universo `definer_sem_tenant` 27; 62 policies | mesa **274/8.775 verde** (rodada); a cadeia na mesa PGlite reproduz **63 roteiros/1.299 asserções** e **184/184** mutações detectadas; 117/70; advisor 39; 27 (24 + 3); 62 | ✓ |
| 3 | o mapa do `CLAUDE.md` | os diretórios de topo de `src/lib`/`src/components` e os 14 aninhados batem | ✓ |
| 4 | as 13 checagens | iguais, nos dois bancos (§0) — a linha travada | ✓ |
| 5 | o conector alcança os dois | alcança | ✓ |
| 6 | 22 colunas, 20 com default | confere, 0 linhas fora da legada nas 20 | ✓ |
| 7 | 15b/15e EXIGEM o default; 15c deriva | confere; **15c cobre só `filiais`** (as tabelas de `k_negocio` com a coluna fora do lote 1) — a derivada "nenhuma `empresa_id` de `public` com default, inclusive em tabela futura" é asserção NOVA | ⚠ |
| 8 | sem default: omitir → 23502; errada → 23503 | **nem sempre 23502**: o default roda antes dos gatilhos BEFORE e o NOT NULL só depois deles — sem default, `termos_gerados` com ids (`termo_da_empresa`) e `kits_modelos` com motivo (`kit_motivo_da_empresa`) dão **23503 antes do 23502**. Os roteiros novos esperam o código certo por tabela | ⚠ |
| 9 | os pais | confere | ✓ |
| 10 | `drop/set default` = metadado, ACCESS EXCLUSIVE breve | confere (doc PG 17: "ACCESS EXCLUSIVE … unless explicitly noted"; o default novo não toca linha) | ✓ |
| 11 | 18 funções | **18 confirmadas, 29 INSERTs**; o lote 1 tem **16** (a proposta da Frente C dizia 15), o lote 2 tem 2 (`import_gravar_trilha`, `registrar_limpeza_termos_sem_linha`); 14 invoker, 4 definer; nenhuma INSERT sem lista, `ON CONFLICT`, `MERGE` ou `EXECUTE` dinâmico nos corpos vigentes. As que gravam em `movimentacoes`: `criar_compra_lote`, `devolver_ao_fornecedor` (2), `criar_movimentacao_com_itens`, `estornar_movimentacao_com_itens`, `import_lancar_movimentacoes` (2) | ⚠ |
| 12 | `registrar_limpeza_termos_sem_linha` sem empresa | confere (decisão 3) | ✓ |
| 13 | o import de outra empresa é desta fase | confere: as três internas recebem só `p_filial` | ✓ |
| 14 | `track = top` | confere | ✓ |
| 15 | L4 e `k_escritores` | L4: a lista de exclusão está **escrita duas vezes** (a asserção e o `raise notice`); `k_escritores` tem 10 entradas e **não é só de `eventos_admin`**: inclui `import_gravar_trilha` e `registrar_tentativa_senha` (que grava `senha_tentativas`, SEM a coluna — fica como está), e NÃO inclui `registrar_limpeza_termos_sem_linha`. A 5b ("os dois outros NÃO citam `empresa_id`, até a F67C") muda de natureza | ⚠ |
| 16 | 17 pontos em `src/**` | **17 confirmados**, nenhum envia a empresa; só as linhas variam ±1 (o `.insert(` uma linha abaixo do `.from(`) | ✓ |
| 17 | `registrarEventoAdmin` engole, 15 chamadas | confere; e **`empresa_da_filial` é revogada de `service_role`** (`0185:177`): a empresa ALVO se resolve com o client de SESSÃO na action, nunca no registrador | ⚠ |
| 18 | `persistirTermo` | confere; a empresa vai SÓ no INSERT (o UPDATE da regeração espalha `linha` — pôr a coluna ali reescreveria a empresa, e `guarda_empresa` recusa) | ✓ |
| 19 | 43 `empresa_id?: string` | **43** = 20 × (`Insert`+`Update`) + 2 de `operador_filiais` + 1 do `Update` de `membros` | ✓ |
| 20 | 16 INSERTs nos scripts | **16 confirmados** + **3 a mais** em `scripts/perf/medir-itens.mjs` (instrumento da F60, SQL gerado para o ENSAIO) — o fato dizia "perf é leitura" | ⚠ |
| 21 | `restaurar.mjs` | confere (6 tabelas: 4 com `filial_id`; `anotacoes` pelo ativo; `termos_gerados` pelos arrays) | ✓ |
| 22 | `empresaDaFilial` em `dev-destrutivo.ts` (3) e `importar.ts` (1) | confere; sem cache por request | ✓ |
| 23 | a régua "ninguém lê" | confere; e **a 15h/7b contam `empresa_id` na lista de colunas de um INSERT como leitura** (o predicado não distingue verbo) | ✓ |
| 24 | a catraca da legada, 9 arquivos | 9 arquivos, 18 `empresaDaOperacao()` + 6 `EMPRESA_LEGADA_ID` | ✓ |
| 25 | os leitores (a)–(d) | (b) está em `admin.ts:767`; (c) **a RPC do import NÃO lê o vocabulário** (só o TS, `lerVocabularioImport`) — e com duas empresas visíveis o import fica INDISPONÍVEL (o vocabulário duplica e `conferirVocabulario` lança), não "mistura"; (a) tem mais leitores do que a lista: `resolverColaboradoresPorNome` (`queries/colaboradores.ts:292`, o mais silencioso — o último id ganha), `:389` e `:442`; `colaboradores.ts:268` lê a VIEW `v_colaboradores_textos`, que **não tem `empresa_id`** | ⚠ |
| 26 | 705 INSERTs em 35 roteiros | **703** reais (os 2 a mais são `position('insert into …' in v_def)`, texto); **622 · 59 · 22**; 35 roteiros; todos dentro de `do $$`, todos com lista de colunas; 11 deles são texto de `format()` em `comprimento_comportamento.sql` | ⚠ |
| 27 | as formas em `pg_stat_statements`; o PostgREST põe na lista só as chaves do payload | medido (§0); doc PostgREST v13: as chaves do JSON definem as colunas (e `?columns=`) | ✓ |
| 28 | Skew Protection não medida | **medida: LIGADA** (§0); teto não legível → 12 h (padrão Pro) | ⚠ |
| 29 | o `23502` carrega a linha no `DETAIL` | a doc do Supabase não garante que o `DETAIL` fique fora de `event_message`: a contagem filtra por `log_attributes['parsed.sql_state_code']` e NUNCA projeta `event_message` | ✓ |
| 30 | ninguém escreve em produção para provar | adotado | ✓ |
| 31 | o método | confere: R-ACC-136 → a próxima é **R-ACC-137**; ADR-002 até o §18 → **§19**; RUNBOOK até o Anexo F67B | ✓ |
| 32 | a linha velha da ficha F67B | confere ("Falta o apply…") — corrigida na reescrita | ✓ |

**Outras medidas que mudam o desenho:**
- `transferir_item` (a única das 18 sem recriação desde a F46): o `prosrc` vivo (`7a0ad146…`, igual nos dois bancos) difere
  do arquivo `0104` (`3f79af0b…`) **só nos comentários** — a parte executável é idêntica (comparada linha a linha, sem
  comentário). Recriar a partir do arquivo não apaga nada que o banco tem.
- Quatro das 18 são **INTOCÁVEIS** da F38 (`criar_compra_lote`, `devolver_ao_fornecedor`, `transferir_item`,
  `movimentacao_abrir_pendencias_item`): `RECRIACOES_AUTORIZADAS` obrigatória; nenhum corpo novo ganha marca da F38.
- O classificador calcula `alter column … drop default` como **ADITIVA** (medido).
- A mesa PGlite difere do CI nas constantes de `md5(string_agg(… order by x))` **só pela colação** (o banco da mesa é `C`; o
  do CI ignora pontuação na ordem): ordenando por `regexp_replace(x,'[^A-Za-z0-9]','','g'), x` a mesa reproduz a constante
  do L4 (`84f64e0b…`). As constantes novas se calculam assim na mesa e se confirmam no CI.
- O teto do injetor está em **184/184** (o lote no teto) e a F67B tinha **14** mutações (12 + 2 da revisão).

---

## 2. A tabela-verdade dos ESCRITORES

Destino: **expansão** = o escritor passa a mandar a empresa (o default ainda existe, nada quebra); **contração** = o default
sai da tabela. Lote: **1** (acervo, as oito), **2** (vocabulário e registros, as onze), **F** (`filiais`).

### 2.1 SQL — as 18 funções (todas `create or replace`, MESMA assinatura, salvo a decisão 3)

**A regra (decisão 2): a empresa de cada linha é a da FILIAL que a própria linha grava, lida pela ponte única
`public.empresa_da_filial(smallint)` (`0185`).** Anotações: a da filial do ativo. O substituto da devolução: a da filial do
ativo antigo. Nenhuma função passa a ler `empresa_id` no corpo — a coluna só aparece na LISTA DE COLUNAS do INSERT. As FKs
compostas (`0166`/`0167`) conferem a coerência com cada outro pai (ativo, movimentação, item, colaborador, pendência).

| # | função | invoker/definer | vigente | INSERT → tabela | a empresa | lote | migration |
|---|---|---|---|---|---|---|---|
| 1 | `corrigir_patrimonio_com_anotacao` | inv | 0149 | anotacoes | `empresa_da_filial(<filial do ativo p_ativo_id>)` | 1 | 0200 |
| 2 | `definir_service_tag_com_anotacao` | inv | 0151 | anotacoes | idem | 1 | 0200 |
| 3 | `confirmar_assinatura_termo_com_anotacao` | inv | 0151 | anotacoes | idem | 1 | 0200 |
| 4 | `desfazer_confirmacao_termo_com_anotacao` | inv | 0151 | anotacoes | idem | 1 | 0200 |
| 5 | `confirmar_assinatura_lote_com_anotacoes` | inv | 0151 | anotacoes (CTE) | `empresa_da_filial(atualizado.filial_id)` (o CTE devolve a filial) | 1 | 0200 |
| 6 | `criar_compra_lote` ⚑ | inv | 0064 | ativos, movimentacoes | `empresa_da_filial(v_filial)`, 1× por item do lote | 1 | 0201 |
| 7 | `devolver_ao_fornecedor` ⚑ | inv | 0047 | movimentacoes ×2, ativos | `empresa_da_filial(v_antigo.filial_id)` nos três (o substituto é da empresa do antigo; a filial dele de outra empresa a FK composta recusa) | 1 | 0201 |
| 8 | `criar_movimentacao_com_itens` | inv | 0126 | movimentacoes, lancamentos_item ×2 | a da filial de cada linha (`v_filial`, `v_filial_it`) | 1 | 0201 |
| 9 | `estornar_movimentacao_com_itens` | inv | 0122 | movimentacoes, lancamentos_item | a da filial de cada linha (`v_filial`; a do payload no inverso) | 1 | 0201 |
| 10 | `movimentacao_abrir_pendencias_item` ⚑ | def | 0150 | pendencias_item | `empresa_da_filial(p_mov.filial_id)` | 1 | 0201 |
| 11 | `lancar_itens_lote` | inv | 0126 | lancamentos_item ×2 | `empresa_da_filial(v_filial)`, 1× por linha | 1 | 0202 |
| 12 | `reabrir_pendencias_item_com_estornos` | inv | 0122 | lancamentos_item | a da filial do payload | 1 | 0202 |
| 13 | `resolver_pendencias_item_com_lancamentos` | inv | 0126 | lancamentos_item ×3 | a da filial do payload, 1× por elemento | 1 | 0202 |
| 14 | `transferir_item` ⚑ | inv | 0104 | lancamentos_item ×2 | `empresa_da_filial(p_origem)` / `(p_destino)`, 1× antes do laço (entre empresas, a FK composta do item recusa) | 1 | 0202 |
| 15 | `import_criar_ativos` | def (fechada) | 0131 | ativos | `empresa_da_filial(p_filial)` — a orquestradora já provou `filial_da_empresa(p_empresa, v_filial)` | 1 | 0203 |
| 16 | `import_lancar_movimentacoes` | def (fechada) | 0131 | movimentacoes ×2 | idem, 1× por chamada | 1 | 0203 |
| 17 | `import_gravar_trilha` | def (fechada) | 0131 | import_logs | idem | 2 | 0204 |
| 18 | `registrar_limpeza_termos_sem_linha` | def | 0196 | eventos_admin | **assinatura nova `(p_empresa uuid, p_raiz text, p_confirmacao text, p_justificativa text)` AO LADO** (decisão 3): `p_empresa` = a da operação (`empresaDaOperacao()`, destino F70); a antiga (3 args) cai na contração do lote 2 | 2 | 0204 / 0206 |

⚑ = INTOCÁVEL da F38. Client e papel em `pg_stat_statements`: todas são chamadas pela sessão (`authenticated`) e não aparecem
como INSERT de topo (fato 14 — `track=top` só vê a chamada); por isso **as 18 não precisam de janela**: a troca de corpo com a
mesma assinatura é atômica. ACL: preservada por `create or replace` (doc PG 17: "the ownership and permissions of the function
do not change"); a assinatura nova da #18 declara a sua (`revoke all … from public, anon, service_role; grant execute … to
authenticated`). Prova: o roteiro novo `escrita_por_empresa.sql` (cada uma chamada por um membro da B grava B, e o par na A
grava A); a varredura SQL de escrita (disco e catálogo); o diff contra o corpo vigente no cabeçalho de cada migration.

### 2.2 App — os 17 pontos de `src/**` (o tipo `Insert` obrigatório é a trava; a varredura TS, a rede)

| # | onde | tabela | client | a empresa | lote |
|---|---|---|---|---|---|
| 1 | `actions/admin.ts` `criarFilial` | filiais | sessão | `empresaDaOperacao()` (F70) | F |
| 2 | `actions/admin.ts` `criarMotivo` | motivos | sessão | operação (F70) | 2 |
| 3 | `actions/ativos.ts` `anotarAtivo` | anotacoes | sessão | `empresaDaFilial(ativo.filial_id)` (já lido) | 1 |
| 4 | `actions/pendencias.ts` `reabrirPendenciasItem` | anotacoes | sessão | `empresaDaFilial` por filial DISTINTA do lote (um mapa; tipicamente 1 ida) | 1 |
| 5 | `actions/colaboradores.ts` `criarColaboradorInline` | colaboradores | sessão | a FILIAL da movimentação (`filial_id` do campo) → `empresaDaFilial`; sem filial (lote multi-filial) → operação (F70) | 1 |
| 6 | `actions/colaboradores.ts` `criarColaborador` | colaboradores | sessão | filial → `empresaDaFilial`; sem → operação (F70) | 1 |
| 7 | `actions/colaboradores.ts` `consolidarColaboradores` (upsert) | colaboradores | sessão | `empresaDaFilial(g.filial_id)` por filial distinta; `onConflict: 'empresa_id,nome_chave'` fica | 1 |
| 8 | `actions/itens.ts` `estornarLancamentoItem` | lancamentos_item | sessão | `empresaDaFilial(orig.filial_id)` | 1 |
| 9 | `actions/itens.ts` `criarItem` | itens | sessão | operação (F70) | 1 |
| 10 | `actions/itens.ts` `criarItemInline` | itens | sessão | operação (F70) | 1 |
| 11 | `actions/kits.ts` `criarKit` | kits_modelos | sessão | operação (F70) | 2 |
| 12 | `actions/relatorios.ts` `gerarRelatorio` | relatorios_gerados | sessão | filial → `empresaDaFilial`; consolidado → operação (F70); resolvida UMA vez antes do laço de retry | 2 |
| 13 | `actions/senhas.ts` `criarSenhaAcesso` | senhas_acesso | administrativo | operação, **destino F68** | 2 |
| 14 | `actions/tipos-item.ts` `criarTipoItem` | tipos_item | sessão | operação (F70) | 2 |
| 15 | `actions/unidades-apelidos.ts` `incluirApelidoUnidade` | unidades_apelidos | sessão | `empresaDaFilial(filialId)` (a mesma vai ao evento) | 2 |
| 16 | `lib/auditoria-registro.ts` `registrarEventoAdmin` | eventos_admin | administrativo | **a ALVO**, parâmetro obrigatório `empresa` (§2.3) | 2 |
| 17 | `lib/termos/persistir.ts` `persistirTermo` | termos_gerados | sessão | `empresaDaFilial(<filial de um dos ativos>)`, resolvida em `actions/termos.ts` e passada (o gatilho `termo_da_empresa` confere TODOS os ativos) | 1 |

Papel em `pg_stat_statements`: sessão = `authenticated`; administrativo = `service_role`. Prova: `npm run typecheck` (o tipo),
a varredura TS de escrita, os testes de mesa por escritor que já existem (ajustados), o roteiro da escrita por empresa (a
forma de cada INSERT), a janela por forma (Δ 0 nas formas SEM).

### 2.3 A trilha — as 15 chamadas de `registrarEventoAdmin` (decisão 20)

| onde | ação | a empresa ALVO |
|---|---|---|
| `admin.ts` `convidarUsuario`, `gerarLinkDeRecuperacao`, `editarUsuario` (×2), `definirStatusUsuario` | conta | a da operação — a MESMA que vai ao `p_empresa` da RPC de conta |
| `dev.ts` `alterarEmailUsuario`, `apagarUsuario`, `encerrarSessoes` | conta | idem |
| `importar.ts` (×3: falhou, inesperado, executado) | import | `empresaDoImport` (a da filial, já resolvida) |
| `senhas.ts` (×2) | senha | operação, destino F68 |
| `unidades-apelidos.ts` (×2) | apelido | `empresaDaFilial` da filial do apelido (sessão) |

O "não propaga" da F21 fica; a falha de `23502` passa a ser nomeada no `registrarFalha` (sem valor de linha).

### 2.4 Os scripts (decisão 19) e o `restaurar.mjs` (decisão 11)

| onde | tabelas | a empresa |
|---|---|---|
| `scripts/seed.ts` (9) | ativos ×2, movimentacoes ×2, colaboradores (upsert), itens, lancamentos_item, anotacoes, eventos_admin | a das filiais semeadas, lida no `select` que o seed já faz (exige UMA empresa, senão lança); o `onConflict` do upsert → `'empresa_id,nome_chave'` (16/11-4) |
| `scripts/import/carga.ts` (4) | ativos, movimentacoes, itens, lancamentos_item | a das filiais da carga, lida em `buscarFiliais` (depois das guardas; `guard.ts` intocado; UMA empresa, senão lança) |
| `scripts/smoke/persona.ts` (1) | eventos_admin | `EMPRESA_LEGADA_ID` (o smoke é da WAP; já a usa para `membros`) — destino F70 |
| `scripts/smoke/fixtures-passe2.ts` (1) | itens | a da filial `sede` que a fixture já usa, lida pela mesma sessão |
| `scripts/manutencao/gerar-errata-truncamento.ts` (1) | relatorios_gerados | a da linha v1 (`l.empresa_id`, a errata é versão nova do MESMO relatório) |
| `scripts/perf/medir-itens.mjs` (3, SQL do ensaio) | itens, lancamentos_item | `public.empresa_legada()` / a da filial no próprio SQL gerado (instrumento da F60, só ensaio) |
| `scripts/db/restaurar.mjs` | as 6 do backup | linha SEM a chave → a da FILIAL da linha no banco de DESTINO (subselect em `filiais`; `anotacoes` pela filial do ativo; `termos_gerados` pelo 1º ativo, ou pela 1ª movimentação); linha COM a chave → a dela; sem pai de onde tirar → **recusa com frase**; a conferência (sem `--aplicar`) imprime quantas linhas receberam a empresa pela filial |

### 2.5 Os roteiros (fato 26, decisão 10) — §7.

---

## 3. A tabela-verdade dos LEITORES (a)–(d) (decisão 8)

| | onde | hoje | depois | a empresa | prova |
|---|---|---|---|---|---|
| (a) | `queries/relatorios/comum.ts` `resolverFilialPorSlug` (3 chamadores + o snapshot) | `.eq('slug')` + `maybeSingle` (LANÇA com duas) | `.eq('slug').eq('empresa_id', empresa)`; assinatura com `empresa` | a da operação (o slug É o que se resolve; F70 traz a da sessão; o viewer, F68) | teste de mesa (cliente falso com dois slugs iguais) |
| (a) | `actions/tipos-item.ts` `criarTipoItem` (homônimo por `slug`) | `.eq('slug')` | `+ .eq('empresa_id', empresa)` | operação (F70) | idem |
| (a) | `actions/itens.ts` `criarItemInline` (homônimo por `nome_chave`) | `.eq('nome_chave')` | `+ .eq('empresa_id', empresa)` | operação (F70) | idem |
| (a) | `actions/colaboradores.ts` `criarColaboradorInline` (homônimo) | `.eq('nome_chave')` | `+ .eq('empresa_id', empresa)` | a da filial (ou operação) — a MESMA do INSERT | idem |
| (a) | `queries/colaboradores.ts` `resolverColaboradoresPorNome` (`:292`), a lista do campo (`:389`), `jaCadastrado` (`:442`) | por `nome_chave` sozinho (o último id ganha) | `+ .eq('empresa_id', empresa)`; assinatura com `empresa` | a da filial do lote (movimentações, lançamentos, pendências) ou a da operação (o campo, a busca de saldo) | idem |
| (a) | `actions/colaboradores.ts` `consolidarColaboradores` (`:268`, a VIEW) | `v_colaboradores_textos` (sem `empresa_id`) | **não recortável sem migration** (a view agrega por chave sem empresa): fica, declarado — o INSERT do grupo já nasce na empresa da filial do grupo; a view por empresa é backlog **F70** | — | declarado |
| (b) | `actions/admin.ts` `atualizarMotivo` (`:767`) | `update … .eq('codigo')` — **grava nas DUAS** | `.eq('empresa_id', empresa).eq('codigo', codigo).select('id')`; 0 linhas → "Motivo não encontrado." | operação (F70) | teste de mesa (o espião vê os dois `.eq`) + roteiro SQL (dois motivos de mesmo código: o `update` com a empresa alcança 1, sem ela 2) |
| (b) | os demais `update`/`delete` de vocabulário | — | medidos: TODOS por `id` (`tipos_item`, `kits_modelos`, `senhas_acesso`, `unidades_apelidos`, `filiais`) — nenhum outro por chave natural | — | a lista no relatório |
| (c) | `queries/vocabulario-import.ts` `lerVocabularioImport` (3 actions + a página) | 5 leituras sem empresa | assinatura `(client, empresa)`; as 4 de vocabulário com `.eq('empresa_id', empresa)`; filiais idem | a da filial do plano (actions); a da operação (a página, antes de escolher filial) | teste de mesa (dois catálogos completos: sem o filtro `conferirVocabulario` lança) |
| (c) | a RPC do import | — | **não lê vocabulário** (medido) — nada a mudar no SQL | — | — |
| (d) | `actions/relatorios.ts` `lerUltimaVersao` + `max+1` | sem empresa | `+ .eq('empresa_id', empresa)` nos dois ramos | a do relatório (a da filial; a da operação no consolidado) | teste de mesa + a `chave-versao-sql.test.ts` |

Primos achados fora das letras (backlog F70, declarados): `unidades/pertinencia.ts:76` e `queries/gerados.ts:84` (`.in('slug')`
de filiais), `queries/admin.ts` `listarVocabularioDeUnidades` e a `v_estoque_atual` por slug.

---

## 4. A tabela-verdade das TRAVAS

| trava | hoje | depois (F67C) |
|---|---|---|
| **15b** (`catalogo_policies.sql`) | as oito: coluna, `uuid`, `not null`, FK validada, **default `empresa_legada()`**, sem force | idem, **SEM default** — invertida no commit da contração do lote 1 |
| **15e** | as onze, idem | idem, **SEM default** — no commit da contração do lote 2 |
| **15c** | toda tabela de `k_negocio` com a coluna, fora do lote 1 (= `filiais`), na forma de 15b | idem, sem default — no commit da contração de `filiais` |
| **15l** (NOVA, derivada) | — | NENHUMA coluna `empresa_id` de tabela de `public` tem default — lida do catálogo, inclusive tabela futura; universo = toda coluna `empresa_id` de `public` (22). Nasce vermelha pelos 20 |
| **15m** (NOVA, varredura SQL de escrita, catálogo) | — | todo INSERT numa das 20 no `prosrc` de `public` tem lista de colunas e `empresa_id` nela — universo contado (INSERTs achados > 0); sem lista de exceção. Nasce vermelha pelas 18 |
| varredura SQL de escrita, disco (NOVA, `escrita-com-empresa.test.ts`) | — | o mesmo sobre o corpo vigente das migrations e sobre o código executado (`do`, topo) das migrations **≥ 0200**; universo contado |
| **15h** / **7b** (a régua de leitura) | `empresa_id` em lista de colunas de INSERT conta como leitura | **escrever não é ler**: a lista de colunas do INSERT (e o alvo do `ON CONFLICT`) é neutralizada ANTES do predicado; toda a parte de leitura acusa como antes (sabotagem G) |
| `k_leitura_tenant` | 21 entradas; as das destrutivas/`forcar_*` listam as tabelas que ESCREVEM | as tabelas que só entravam por escrita saem da entrada (a lista ENCOLHE — mais estrita); nenhuma entrada nova (as 18 não leem a coluna) |
| varredura TS de leitura (`empresa-acervo-sem-leitura.test.ts`, partes 1–3) | `.insert(`/`.upsert(` com `empresa_id` acusariam | o payload de `insert`/`upsert` e o `onConflict` deixam de contar; `select/eq/filter/match/order/in/or/is` continuam; os leitores (a)–(d) entram como exceção NOMINAL com motivo |
| catraca do literal (mesma) | 12 ocorrências em 6 arquivos | as de escrita saem da conta; entram, nominais, os leitores (a)–(d) |
| catraca da legada | 9 arquivos, 18 + 6 | os escritores sem pai e os leitores sem filial entram com `empresaDaOperacao()`, cada um com destino (F70; `senhas` F68) |
| **varredura TS de escrita** (NOVA) | — | todo `.from('<20>')…insert(`/`upsert(` de `src/**` e `scripts/**` (fora de teste) tem `empresa_id` no payload literal, ou o payload é um identificador cuja declaração no MESMO arquivo o tem; universo contado (≥ 33). Nasce vermelha pelos 33 |
| **trava do tipo** (NOVA, `empresa-obrigatoria-no-insert.test.ts`) | — | `Insert.empresa_id: string` obrigatório nas 20 (a lista de `k_negocio`), lido pelo compilador; o `Update` continua opcional. Nasceu vermelha pelos 20 |
| **a trilha** (NOVA) | — | `EventoAdmin.empresa` obrigatório (o `typecheck`); um teste de mesa exige `empresa:` em cada uma das 15 chamadas e prova que o `23502` nomeia a causa no `registrarFalha` |
| L4 (`integridade_tenant.sql`) | md5 de toda função fora de 58 nomes | + os 17 recriados nas DUAS listas; a constante nova calculada na mesa (ordem emulada) e confirmada no CI |
| `k_escritores` / 5a / 5b (`empresa_no_vocabulario.sql`) | 10 md5; 5b exige que `import_gravar_trilha` NÃO cite a coluna | o md5 de `import_gravar_trilha` muda; 5b passa a exigir que os escritores das onze CITEM a coluna (e `registrar_tentativa_senha`, que grava `senha_tentativas`, não) |
| `empresa_no_acervo.sql` 1a/1b; `empresa_no_vocabulario.sql` 1a/1b | "INSERT sem `empresa_id` recebe `empresa_legada()`" | **invertidas** (é o comportamento que a fase tira): INSERT sem a coluna → `23502` (ou o `23503` do gatilho, fato 8), no commit da contração do lote |
| `restauracao.sql` 8a | o ativo sem a chave recebe a legada | a linha sem a chave recebe a empresa da FILIAL (que é a B, não a legada) |
| `migrations-f38.test.ts` | `DA_F38` até `0199` | `0200`–`0207` em `DA_F38`; as recriadas (e as quatro intocáveis) em `RECRIACOES_AUTORIZADAS`; a antiga da #18 em `REMOCOES_AUTORIZADAS` |

---

## 5. O desenho — as vinte decisões

1. **De onde vem a empresa** (fatos 8, 9, 16): a do pai — no SQL, a da filial que a linha grava pela ponte
   `empresa_da_filial` (§2.1); no app, `empresaDaFilial`; o colaborador inline, a da filial da movimentação; o colaborador
   sem filial, a operação; o termo, a da filial dos ativos; o consolidado, a operação; sem pai, a operação; `senhas_acesso`,
   a operação com destino F68; a trilha, a ALVO. **Descartado, com o motivo (ata e ADR §19): um gatilho BEFORE INSERT que
   derive a empresa quando ela vier nula** — é o default disfarçado (a linha continua nascendo "por omissão"), o tipo gerado
   exige a coluna de qualquer jeito, e ele somaria um gatilho às 20 na ordem alfabética que `termo_da_empresa`,
   `termo_exige_modelo_da_empresa` e `kit_motivo_da_empresa` já disputam.
2. **As 18: a empresa do pai, sem parâmetro novo, pela PONTE ÚNICA.** `create or replace`, mesma assinatura; a empresa é
   `public.empresa_da_filial(<a filial da linha>)` — uma leitura por PK de `filiais` por comando (fora dos laços onde a
   filial é fixa). **Divergência declarada contra a proposta da ordem** ("a leitura da empresa do pai entra como categoria
   nominal da régua"): nenhuma das 18 passa a LER `empresa_id` — a coluna aparece só na lista de colunas do INSERT, e a
   leitura do pai é a de `filiais.empresa_id` DENTRO da ponte (fora dos lotes, já permitida). Por isso a categoria nominal
   "a empresa do pai para gravar o filho" nasce **vazia por construção** e não é criada; a régua de leitura fica intacta
   para as 18. Motivo: um leitor a menos para vigiar, o mesmo resultado (a FK composta `(empresa_id, filial_id)` garante
   que a empresa da filial É a do ativo, da movimentação, da pendência), e o diff de cada função fica em "a coluna, o valor
   e a chamada da ponte". A ponte é `invoker`, `stable`, com `EXECUTE` para `authenticated` (as 14 invoker só são
   executáveis por `authenticated`; as 4 definer rodam como dono): sob a RLS de `filiais`, uma filial invisível dá NULL →
   a escrita é recusada (o operador não escreve em filial que não vê — a guarda `pode_escrever_filial` já recusou antes,
   com mensagem). As `forcar_*` e as destrutivas (que gravam `p_empresa`) não mudam.
3. **`registrar_limpeza_termos_sem_linha`: assinatura nova `(p_empresa uuid, …)` AO LADO** (o molde da F67), recusa
   `p_empresa` nulo (42501, a frase da F67); a action passa `empresaDaOperacao()`; a antiga cai na contração do lote 2, sem
   `if exists`, sem `cascade`. O `.docx` sem linha continua da PLATAFORMA (`e_plataforma()`); a empresa é só o carimbo da
   trilha. A alternativa (`empresa_legada()` no corpo) contradiria o fim do default e a 4b de `definer_sem_tenant.sql`.
4. **O tipo**: hand-fix datado no `database.ts` (o molde F63/F65), mínimo — `empresa_id: string` no `Insert` das 20 e a
   entrada da sobrecarga nova da #18 em `Functions`. A trava de mesa nova lê o tipo pelo compilador e reprova o `?` de
   volta. Depois da contração do ensaio, o `generate_typescript_types` do MCP é comparado com o hand-fix SÓ nesses blocos
   (evidência; nada de `cp` cego — memória "tipos pelo MCP"). O `Update` fica opcional.
5. **A varredura TS de escrita** (§4): payload literal com a coluna, ou identificador com a coluna na declaração do mesmo
   arquivo; `scripts/**` incluído (sem o generic `Database` o tipo não os alcança); e o SQL cru de `scripts/**`
   (`insert into public.<20> (…)` em texto) com a mesma régua — **exceção nominal única: `scripts/db/mutacoes.mjs`** (o
   catálogo do injetor sabota corpos de propósito). Universo contado.
6. **A régua muda de natureza** (fato 23): "toda escrita escreve a empresa; ler para recortar continua nominal". SQL
   (`_asserts.sql`, 15h/7b e a cópia de `empresa_no_vocabulario.sql`) e disco (TS): a lista de colunas do INSERT e o alvo
   do `ON CONFLICT` são neutralizados antes do predicado — o `RETURNING empresa_id`, o `select … empresa_id`, o `where
   x.empresa_id` continuam LEITURA. App: o argumento de `.insert(`/`.upsert(` (o payload e o `onConflict`) sai da cadeia
   antes da régua; qualquer outro método acusa. A catraca do literal deixa de contar escrita e ganha os leitores (a)–(d),
   nominais, com motivo. As entradas de `k_leitura_tenant` perdem as tabelas que só estavam lá por escrita. **Sabotagem G**
   prova que a leitura não afrouxou.
7. **A varredura SQL de escrita** — disco e catálogo, sem lista de exceção, inclusive INSERT dentro de CTE, de `do` (nas
   migrations ≥ 0200) e de gatilho (o corpo vigente cobre). `execute` com texto: medido 0 nos corpos vigentes; a varredura
   do catálogo lê também o TEXTO dos literais (um `execute 'insert into public.x (…)'` sem a coluna acusa).
8. **Os leitores (a)–(d)** — §3. Fora: a view `v_colaboradores_textos` (F70) e os primos (backlog F70).
9. **Lotes, fronteira e ordem** (16/11-3): expansão `0200`–`0204` (lote 1: `0200`–`0203`; lote 2: `0204`); o app e os
   scripts no mesmo PR; contração depois do deploy: `0205` (acervo) → `0206` (vocabulário e registros, + a queda da
   assinatura antiga da #18) → `0207` (`filiais`). Entre dois lotes o repouso é válido (tabelas contraídas e tabelas com
   default convivem; o app manda a empresa para todas).
10. **Os 703 INSERTs dos roteiros**: a empresa EXPLÍCITA, igual à da fixture. Forma por roteiro: nos de **uma empresa só**,
    `public.empresa_legada()` — a legada EXPLÍCITA pelo nome que os próprios roteiros já usam (mais de 200 vezes) em vez
    do literal `'00000000-…-0001'` (o mesmo valor; um número mágico a menos em 35 arquivos); nos que criam **segunda
    empresa**, a variável da empresa do pai (`v_emp_b`…) ou o subselect da filial do pai. Transformação por subagentes
    em conjuntos DISJUNTOS (§7), cada um conferindo mecanicamente "asserções antes = depois" e o texto de cada
    `assert`/`raise`; um revisor em contexto fresco confere cada diff procurando SÓ mudança fora das listas de colunas e
    valores. Nenhum script de transformação entra no repositório.
11. **`restaurar.mjs`** — §2.4. SQL puro dentro de `sqlDeInsercao` (a conferência continua sem banco; o misto se resolve de
    graça: a coluna entra para todas, preenchida).
12. **A janela por forma** — T0/T1 por (tabela, COM/SEM `empresa_id`, papel `authenticated`/`service_role`), pelo
    instrumento de `antes/formas-insert.sql`; a condição: Δ 0 nas formas SEM nos papéis do app entre o fim do deploy e o T1
    (`postgres` fora, declarado). **Skew Protection LIGADA (medida), teto não legível → 12 h (padrão Pro): a janela cobre
    12 h depois do deploy**, ou a contração fica PENDENTE (repouso válido) com o comando e a condição no topo do relatório.
    Repetir até três vezes em 2 h se uma janela de 30 min não fechar.
13. **A vigília** — depois de cada lote contraído ≥ 5 min; depois do último ≥ 30 min: os `23502` em `empresa_id` nos logs
    do Postgres (`query_logs`, filtro por `sql_state_code`, sem projetar `event_message`) e as falhas de
    `auditoria.registro-evento` nos logs de runtime da Vercel — só contagem. Qualquer > 0 → `set default` do lote (o bloco
    ensaiado de `F67C-desfaz.sql`) antes do diagnóstico.
14. **A prova viva no ENSAIO**, depois da contração: um bloco que termina em `raise`, como `authenticated` com as claims de
    uma membership do ensaio, que (i) recusa um INSERT sem a coluna em cada uma das 20 e (ii) aceita o mesmo INSERT com a
    empresa certa — só contagens no `raise`. As 18 funções: provadas no CI (com o default fora), não no ensaio (montar
    argumentos válidos exigiria ler valores de linha). **Em produção, nada de escrita.**
15. **"Nada muda para a WAP"**: 0 fora da legada nas 20 antes e depois; md5 de todas as policies igual; as 13 checagens; o
    smoke; o conferidor. O conta a conta não é o instrumento (nenhuma policy muda): não roda, declarado.
16. **O rollback** — `supabase/rollback/F67C-desfaz.sql`, na ordem INVERSA: (1) `set default public.empresa_legada()` nas
    20 (`filiais` → registros → acervo) — PRIMEIRO, e sozinho já devolve o comportamento de antes; (2) a assinatura antiga
    da #18 de volta (se caiu) e a nova fora; (3) os corpos de antes das 17 recriadas. Idempotente nos dois estados (só a
    expansão; expansão + contração), gerado das migrations, nunca transcrito. Depois do rollback, os escritores novos
    continuam mandando a empresa (inofensivo com o default de volta); nenhum dado se perde. Roda ANTES do da F67B em todo
    roteiro de rollback.
17. **O injetor** — as duas mutações da F63/F64 que EXIGIAM o default (`*-default-literal`) mudam de sentido (o default de
    volta, qualquer que seja, derruba 15b/15e e a 15l); novas: o default de volta em `filiais` (15c, 15l), uma das 18 sem a
    coluna (15m e o roteiro da escrita por empresa), a empresa de quem chama no lugar da do pai (o roteiro da escrita por
    empresa), o default de volta numa tabela fictícia nova (15l). O `update motivos` e o `restaurar.mjs` são TS/JS — o
    injetor (que muta o BANCO) não os alcança: a sabotagem E e a F são de mesa, declarado. Teto 184 → o número exato.
18. **A frase do `23502` em `empresa_id`**: *"Não foi possível gravar: o registro ficou sem a empresa. Recarregue a página e
    tente de novo; se continuar, avise o administrador."* — em `erros-do-banco.ts` (erro do MOTOR), conferida contra o
    esquema (as 20 de `k_negocio` têm `empresa_id not null`); nunca o `DETAIL`.
19. **Os scripts** — §2.4.
20. **A trilha** — §2.3.

---

## 6. As migrations, a fronteira e a ORDEM DE ROLLBACK

Cada uma: cabeçalho `-- classe: ADITIVA` (validado), o diff contra o corpo vigente de cada função recriada, `set
lock_timeout = '2s'`/`reset`, sem `begin`/`commit`, `notify pgrst, 'reload schema'`, o rollback no rodapé, `db:lock` no
mesmo commit, `DA_F38` e `RECRIACOES_AUTORIZADAS`. Nenhuma toca dado, policy, coluna; nenhum `cascade`, DDL dinâmica, `if
exists` na contração.

| ordem de apply | migration | o quê | fronteira |
|---|---|---|---|
| 1 | `0200_escrita_empresa_anotacoes` | as 5 de `anotacoes` (#1–#5) | expansão, lote 1 |
| 2 | `0201_escrita_empresa_movimentacoes` | #6–#10 | expansão, lote 1 |
| 3 | `0202_escrita_empresa_itens` | #11–#14 | expansão, lote 1 |
| 4 | `0203_escrita_empresa_import` | #15–#16 | expansão, lote 1 |
| 5 | `0204_escrita_empresa_registros` | #17 (recriada) e a assinatura nova da #18 | expansão, lote 2 |
| — | *(produção: merge → deploy → a janela por forma, decisão 12)* | | |
| 6 | `0205_contracao_default_acervo` | `drop default` nas oito, uma por comando | contração, lote 1 |
| 7 | `0206_contracao_default_registros` | `drop default` nas onze + `drop function` da assinatura antiga da #18 | contração, lote 2 |
| 8 | `0207_contracao_default_filiais` | `drop default` em `filiais` | contração, F |

**ORDEM DE ROLLBACK** (o inverso): `0207` → `0206` → `0205` (os `set default`) → `0204` → `0203` → `0202` → `0201` → `0200`
(os corpos de antes) — e, entre fases, **o da F67C antes do da F67B**, que vem antes do da F67, e assim para trás.

---

## 7. O censo dos roteiros (fato 26) — o que tem de ficar igual

Medido por tokenizador (comentários e textos fora) e confirmado pela regex crua (860 = 800 estáticos + 58 em texto de
`format()` + 2 falsos positivos de `position()`). O número de asserções é o da linha FIM na mesa PGlite (que reproduz os
1.299 do CI): **é o que não pode mudar**.

| roteiro | INSERTs nas 20 | sem `empresa_id` (lote 1 · lote 2 · filiais) | tabelas a corrigir | asserções FIM (antes) |
|---|---|---|---|---|
| `dev_destrutivo.sql` | 72 | 72 (67 · 5 · 0) | anotacoes, ativos, import_logs, itens, kits_modelos, lancamentos_item, motivos, movimentacoes, relatorios_gerados, senhas_acesso, termos_gerados | 109 |
| `f34_triagem_reserva.sql` | 48 | 48 (48 · 0 · 0) | ativos, movimentacoes | 21 |
| `papeis_rls.sql` | 41 | 41 (31 · 9 · 1) | anotacoes, ativos, colaboradores, eventos_admin, filiais, import_logs, itens, lancamentos_item, motivos, movimentacoes, relatorios_gerados, senhas_acesso, termos_gerados, tipos_item | 77 |
| `asof_desempate.sql` | 35 | 35 (34 · 0 · 1) | ativos, filiais, movimentacoes | 21 |
| `manutencao_fornecedor.sql` | 33 | 33 (33 · 0 · 0) | ativos, movimentacoes | 19 |
| `transicoes_extra.sql` | 33 | 33 (33 · 0 · 0) | ativos, movimentacoes | 13 |
| `pendencias_item.sql` | 30 | 30 (30 · 0 · 0) | ativos, itens, lancamentos_item, movimentacoes | 15 |
| `f36_detentor.sql` | 29 | 29 (29 · 0 · 0) | ativos, movimentacoes | 18 |
| `f37_colaboradores_tipos.sql` | 29 | 29 (27 · 2 · 0) | ativos, colaboradores, itens, lancamentos_item, movimentacoes, tipos_item | 26 |
| `maquina_estados.sql` | 28 | 28 (28 · 0 · 0) | ativos, movimentacoes | 14 |
| `import_substituir.sql` | 24 | 24 (19 · 0 · 5) | anotacoes, ativos, colaboradores, filiais, itens, lancamentos_item, movimentacoes, pendencias_item | 32 |
| `colaborador_uso_efetivo.sql` | 27 | 23 (23 · 0 · 0) | ativos, colaboradores, itens, lancamentos_item, movimentacoes | 11 |
| `conflito_filiais.sql` | 22 | 22 (22 · 0 · 0) | ativos, movimentacoes, termos_gerados | 51 |
| `f38_itens_com_ativo.sql` | 21 | 21 (20 · 1 · 0) | ativos, colaboradores, itens, lancamentos_item, movimentacoes, tipos_item | 51 |
| `restauracao.sql` | 24 | 21 (21 · 0 · 0) | ativos, itens, lancamentos_item, movimentacoes, pendencias_item | 19 |
| `integridade_alarme.sql` | 20 | 20 (16 · 1 · 3) | ativos, filiais, itens, kits_modelos, lancamentos_item, movimentacoes, pendencias_item, termos_gerados | 40 |
| `itens_quantidade.sql` | 19 | 19 (19 · 0 · 0) | ativos, itens, lancamentos_item, movimentacoes | 14 |
| `escrita_atomica_ativos_anotacao.sql` | 18 | 18 (18 · 0 · 0) | ativos | 16 |
| `vocabulario_import.sql` | 18 | 18 (0 · 14 · 4) | filiais, import_prefixos_patrimonio, import_termos_categoria, import_termos_estado, unidades_apelidos | 56 |
| `f41_regularizacao.sql` | 17 | 17 (16 · 1 · 0) | ativos, colaboradores, itens, lancamentos_item, movimentacoes, tipos_item | 26 |
| `comprimento_comportamento.sql` | 5 (+11 em `format()`) | 16 (9 · 5 · 2) | ativos, colaboradores, filiais, motivos, movimentacoes, senhas_acesso | 28 |
| `troca.sql` | 13 | 13 (12 · 0 · 1) | ativos, filiais, movimentacoes | 13 |
| `cargo_dev.sql` | 12 | 12 (8 · 4 · 0) | anotacoes, ativos, eventos_admin, import_logs, motivos, movimentacoes, relatorios_gerados, termos_gerados | 71 |
| `f60_recorte.sql` | 12 | 12 (9 · 0 · 3) | ativos, filiais, itens, lancamentos_item, movimentacoes | 17 |
| `empresa_no_vocabulario.sql` | 22 | 11 (0 · 11 · 0) | eventos_admin, import_logs, import_prefixos_patrimonio, import_termos_categoria, import_termos_estado, kits_modelos, motivos, relatorios_gerados, senhas_acesso, tipos_item, unidades_apelidos | 15 |
| `empresa_no_acervo.sql` | 17 | 9 (9 · 0 · 0) | anotacoes, ativos, colaboradores, itens, lancamentos_item, movimentacoes, pendencias_item, termos_gerados | 22 |
| `colaborador_estorno.sql` | 7 | 7 (7 · 0 · 0) | ativos, colaboradores, itens, lancamentos_item | 19 |
| `isolamento_tenant.sql` | 33 | 7 (7 · 0 · 0) | ativos, movimentacoes | 48 |
| `itens_extra.sql` | 6 | 6 (6 · 0 · 0) | itens, lancamentos_item | 4 |
| `movimentacao_grade.sql` | 6 | 6 (6 · 0 · 0) | ativos, itens, lancamentos_item, movimentacoes | 45 |
| `transferencia_item.sql` | 6 | 6 (6 · 0 · 0) | itens, lancamentos_item | 18 |
| `pendencias_import_termo.sql` | 5 | 5 (5 · 0 · 0) | ativos | 5 |
| `import_fora_da_unidade.sql` | 4 | 4 (0 · 2 · 2) | filiais, import_logs | 14 |
| `kit_motivo_da_empresa.sql` | 4 | 4 (0 · 4 · 0) | kits_modelos, motivos | 14 |
| `reabrir_pendencia_item.sql` | 4 | 4 (4 · 0 · 0) | ativos, movimentacoes | 4 |
| **35 roteiros** | **744** | **703** (622 · 59 · 22) | | **986** |

Doze roteiros já criam segunda empresa (`cargo_dev`, `cargo_equivalencia`, `cargo_por_empresa`, `colaborador_uso_efetivo`,
`conflito_entre_empresas`, `imutabilidade_tenant`, `integridade_tenant`, `isolamento_tenant`, `kit_motivo_da_empresa`,
`restauracao`, `storage_por_empresa`, `termo_bloqueado`); `integridade_tenant.sql` tem 45 INSERTs em texto de `format()`, todos
já COM a coluna (não mudam). **A partição** (cinco subagentes, conjuntos disjuntos, ~140 INSERTs cada) e o revisor estão na
ata. **Asserções que MUDAM de propósito** (as travas invertidas, §4) não são adaptação de fixture: 15b, 15c, 15e,
`empresa_no_acervo` 1a/1b, `empresa_no_vocabulario` 1a/1b/5b, `restauracao` 8a — cada uma declarada no relatório.

Roteiros NOVOS: `escrita_por_empresa.sql` (a escrita da B nasce da B: as 18 funções, o import, o INSERT sem a coluna nas
20, o com a empresa errada; e o `update motivos` com duas empresas — o leitor (b)) e `f67c_rollback.sql`.

---

## 8. Commits e pushes

Branch `f67c-fim-do-default`; commits pequenos, nesta ordem: (1) a ordem, este plano e o "antes" (docs); (2) as travas
vermelhas; (3) a expansão, um commit por migration com `db:lock`; (4) o app; (5) os scripts e o `restaurar.mjs`; (6) os
roteiros adaptados (por grupo, com a conferência de asserções na mensagem), os novos, as constantes, o rollback; (7) o
injetor; (8) a contração, por lote, com 15b/15c/15e e as 1a/1b invertidas no commit do lote delas; (9) os documentos; (10)
a versão. **Pushes agrupados**: o 1º com as travas (o vermelho no CI de rascunho é a evidência), o 2º com tudo até a
contração (os roteiros e a contração no MESMO push — separados, o CI ficaria vermelho por construção).

## 9. O SHA de código congelado

O último commit que toca `src/**`, `scripts/**` ou `supabase/**` — CONTÉM a contração. Gravado aqui na Frente G.

## 10. O que este plano NÃO promete

- Que uma empresa que não é a WAP escreve em PRODUÇÃO (não há segunda empresa nos bancos vivos): provado no CI.
- Que cada escritor RARO funciona em produção depois do drop (filial, motivo, tipo, kit, senha, apelido, vocabulário,
  errata): provado pelo tipo, pelas varreduras e pelo CI; na janela, Δ 0 por ausência.
- O import de uma empresa nova de ponta a ponta (o vocabulário inicial dela é da F70).
- Recortar a view `v_colaboradores_textos` e os primos dos leitores (F70).
- Nada sobre os dados do #84.

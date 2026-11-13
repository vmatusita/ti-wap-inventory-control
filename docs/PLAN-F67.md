# PLAN-F67 — O cargo por empresa, as `security definer` e as destrutivas

Ordem: [`prompts/F67-cargo-por-empresa-definer-e-destrutivas-ultracode.md`](prompts/F67-cargo-por-empresa-definer-e-destrutivas-ultracode.md)
(os 28 fatos no cabeçalho; as decisões do Johnny 12/11-2, 12/11-3, 13/11-1, 13/11-2 e 13/11-3). Ficha: `PLANO-MULTIEMPRESA.md`
§7 → F67, no escopo estreito da decisão 12/11-2 (Storage, Realtime e o fim do default saem para a F67B e a F67C). Branch
`f67-cargo-por-empresa-e-destrutivas`, versão **1.73.0**. Escrito em 13/11/2026, **antes** do primeiro commit que toca
`supabase/`, `src/` ou `scripts/`, com o "antes" já tirado nos dois bancos (§0).

> **Em uma frase.** Nascem cinco funções de cargo POR EMPRESA com nome próprio (`papel_na_empresa`, `e_admin_na`,
> `e_dev_na`, `pode_escrever_na`, `pode_escrever_unidade`), que testam a empresa ANTES do cargo e fecham com argumento
> nulo; o cargo SEM empresa vira "o mais forte entre as memberships ativas" e só sobrevive como PISO de policy pareado com
> o recorte do mesmo cargo; os dez consumidores sem par passam à forma por empresa (com a empresa real, ou com a legada
> EXPLÍCITA onde o recorte é de fase futura); as destrutivas, a prévia, a mesa, o import e as cinco RPCs de conta ganham
> `p_empresa uuid` como 1º parâmetro por EXPANSÃO (a assinatura nova ao lado da antiga) e a antiga só sai na CONTRAÇÃO,
> depois do deploy e de Δ = 0; as views da mesa particionam pela empresa da filial; e o banco recusa emitir termo para
> empresa sem modelo próprio.

---

## 0. O "antes" — tirado na Frente A (13/11/2026), antes de qualquer apply

Só catálogo, contagem e hash, pelo MCP (`execute_sql` só leitura), nos dois bancos. Arquivos em
`docs/f67-evidencias/antes/{producao,ensaio}/`:

| arquivo | o que guarda | produção | ensaio |
|---|---|---|---|
| `funcoes.tsv` | toda função de `public`: nome, args, `prosecdef`, md5(`prosrc`), md5(`pg_get_functiondef`), EXECUTE de anon/authenticated/service_role/public | 106 funções (65 definer) | 106 (65) — **0 diferenças** |
| `policies.tsv` | toda policy de `public` e `storage`: md5 de `qual`/`with_check` | 62 | 62 — **0 diferenças** |
| `grants.tsv` | EXECUTE das 65 `security definer` | — | **0 diferenças** |
| `views.tsv` | md5 do `pg_get_viewdef` das 9 views de `public` (todas `security_invoker`) | 9 | 9 — iguais |
| `gatilhos-termos.tsv` | os gatilhos de `termos_gerados` | 3 (`termos_gerados_guarda_empresa`, `termos_gerados_ids_da_empresa`, `zz_guarda_empresa`) | iguais |
| `advisors.txt` | advisors por nível e nome | segurança: INFO 6 `rls_enabled_no_policy`, WARN 34 `authenticated_security_definer_function_executable`, WARN 1 `auth_leaked_password_protection`, ERROR 0 · desempenho: INFO 39 `unindexed_foreign_keys`, 1 `no_primary_key`, 7 `unused_index`, WARN 1 `multiple_permissive_policies` | igual, exceto `unused_index` 41 |
| `ledger.txt` | `count`/`max` do ledger | 168 · `20261112172039` (`comprimento_registros`) | 181 · `20261112171208` |
| `contagens.txt` | só números | 16 memberships (14 ativas: dev 2, admin 2, operador 5, consulta 5), 1 empresa, 6 filiais, 2 `plataforma_admins` | 5 memberships (3 ativas), 1 empresa, 6 filiais, 0 `plataforma_admins` |
| `integridade-84.txt` | **os dois números do #84** (a linha travada) | `backup_orfao` **12** · `detentor_em_estado_sem_dono` **1** | 0 · 0 |

**A linha travada do #84 (decisão 13/11-3):** produção `backup_orfao = 12` (linha de base 10) e
`detentor_em_estado_sem_dono = 1` (linha de base 0), medidos pelo MESMO núcleo da Parte B
(`checagens_integridade_nucleo()`, só as contagens) às 13/11 na primeira hora da run. As outras chaves: `arquivo_termo_orfao`
3 (base 3), `conflito_entre_filiais` 59 (base 69), o resto 0. Igual ao fato 4.

O **conta a conta "antes"** (decisão 15) é o bloco novo `--fase f67-antes` de `scripts/perf/conta-a-conta.mjs`: ele nasce
com o instrumento (commit de `scripts/`, Frente D) e roda nos dois bancos **antes do primeiro apply** — critério 3; a saída
vai para `docs/f67-evidencias/conta-a-conta/`.

---

## 1. Os 28 fatos, remedidos

Medidos no disco, no git e nos DOIS bancos vivos (o conector desta sessão enxerga os dois projetos da WAP). Onde a medição
contraria o texto, **a medição ganha** e vai ao relatório.

| # | o que a ordem diz | o que medi | veredito |
|---|---|---|---|
| 1 | `8f4b50d`, `v1.72.0`, última `0184`, primeira `0185`, versão `1.73.0`; produção `pbtjcalbmepmrqzprusb`, ensaio `sgmvldiizsrjbxzzpmhh`, PG 17.6 | idem; `.cv-tmp.mjs` não existe; produção PG 17.6, **ensaio PG 17.11** | confere (o ensaio está em 17.11) |
| 2 | mesa 268/8.442; CI 57/1.203; injetor 163/163, quarentena 2; smoke 109/1/0; conferidor 272/0; tipos 38·358·95 | 268 arquivos de teste de mesa; **57 roteiros, 1.203 asserções** (a mesa PGlite, cadeia até a 0184); `MUTACOES.length = 163`, teto 163, quarentena 2 | confere |
| 3 | o mapa do `CLAUDE.md` bate | os diretórios de topo de `src/lib` e `src/components` e os **14** `CLAUDE.md` aninhados batem | confere |
| 4 | #84: `backup_orfao` 12 (base 10), `detentor_em_estado_sem_dono` 1 (base 0) | **12 e 1**, hoje | confere — é a linha travada |
| 5 | `papel_atual()` pela legada; `pode_escrever_filial` dá `true` a dev/admin em qualquer filial; `e_plataforma()` sem consumidor; as quatro de conjunto já por todas as memberships; `pode_escrever_unidade` não existe | idem nos dois bancos | confere |
| 6 | 50 citações de piso nas `0175`–`0178` (19/27/4); parâmetro em `papel_atual()` = sobrecarga ambígua ou `cascade` | vivo: 19 policies com `papel_atual`+`empresas_do_membro`; **24** com `e_admin` (20 pareadas + 4 de `storage`; o "27" conta citações, não policies); 4+3 com `pode_escrever`. A doc do PG 17: *"It is not possible to change the name or argument types"* (`sql-createfunction`) e RESTRICT recusa *"if any objects depend on it"* (`sql-dropfunction`) | confere — as formas por empresa têm nome próprio |
| 7 | os consumidores no corpo de função | 34 funções citam a família no `prosrc` vivo; 3 só em COMENTÁRIO (`guarda_acervo`, `membros_guarda_dev`, `profiles_guarda_dev`); as listas da ordem conferem nos dois bancos | confere |
| 8 | `membros` sozinha; `storage`; `profiles`, `empresas`, `plataforma_admins` | ⚠ **`membros` já está pareada** (a `0178` a pareou com `empresas_do_membro()`); ⚠ **`empresas` e `plataforma_admins` têm RLS e ZERO policies**; ⚠ a ordem omitiu `_bkp_relatorios_gerados_f6a` ("dev le backup f6a", `e_dev()` sozinha, `0128`) e a leitura indireta de `termos` por `pode_ler_arquivo_termo`. **Os sem par são 10**: `profiles` "leitura operador" (1), `backups-import` (4), `termos` escrita (3), `termos` leitura indireta (1), `_bkp` (1) | diverge — §2 |
| 9 | os consumidores no TS | `EMPRESA_LEGADA_ID` em `queries/admin.ts` tem **6** usos (falta o `:344` na ordem); `resetarBloco` chama a RPC em `actions/dev-destrutivo.ts:426` (não `:422`); o resto confere | diverge pouco |
| 10 | 65 `security definer` | 65 nos dois bancos; 34 executáveis por `authenticated`; 0 por `anon`; 0 sobrecargas | confere |
| 11 | universo 21 = 18 + 3 | 21 nos dois bancos. ⚠ **`k_escopo_ok` é 100% nominal**: o roteiro não confere "chama primitiva" de jeito nenhum (só a asserção 3 lê `prosrc`) — a trava nova é uma varredura de corpo, não uma troca de lista | confere o número; a trava muda de natureza |
| 12 | as guardas no-op; o dev CONTA em `existe_outro_admin_ativo` | idem; denominador de produção: 2 dev + 2 admin ativos; as 2 contas dev estão também em `plataforma_admins` | confere |
| 13 | `exigir_gestao_de` (0158), `exigir_dev_para_destruir` (0082) | idem | confere |
| 14 | as assinaturas vigentes | idem (`previa_reset` 0086, `rotulo_alcance_reset` 0083, `import_validar_plano` 0132, `import_revalidar_contagens`/`import_apagar_acervo_filial` 0140, o resto do import 0131) | confere |
| 15 | "sete comandos" com `p_filial is null or …`; `'RESETAR TUDO'` 12 caracteres; `'alcance' = 'global'` | ⚠ **6** comandos em `resetar_acervo` + **1** em `resetar_itens` | diverge na contagem |
| 16 | 16 chamadas advisory em 12 funções | 16 em 12, nos dois bancos e na cadeia. ⚠ **A chave da mesa é `hashtext('conflito_filiais_apagar')`, forma `(bigint)`** — não `conflito_apagar`. `hashtext` medido: `import_substituir` = -1301450180, `conflito_filiais_apagar` = -578872452 | diverge no nome da chave |
| 17 | as views agrupam sobre `ativos` inteira | idem; produção 120 linhas / 59 grupos | confere |
| 18 | `paresEmOutrasFiliais` (`import-logs.ts:249`), `cadastrosComMesmaIdentidade` (`identidade.ts:126`) | idem | confere |
| 19 | `chamarRpc` (`rpc.ts:212`) e os chamadores | idem (`:426`, não `:422`) | confere |
| 20 | `termos_gerados`, o gatilho `termos_gerados_ids_da_empresa` | ⚠ `termos_gerados_ids_da_empresa` e `zz_guarda_empresa` são NOMES DE GATILHO (as funções são `termo_da_empresa()` e `guarda_empresa()`); há **três** gatilhos BEFORE (também `termos_gerados_guarda_empresa`, UPDATE OF `empresa_id`); **um só BEFORE INSERT** | diverge na nomenclatura |
| 21 | `isolamento_tenant.sql` §10 | idem (10e afirma a ponte; 10c/10d neutralizam o piso por `alter policy` numa subtransação) | confere |
| 22 | `conta-a-conta.mjs` | idem | confere |
| 23 | a janela do `drop`; nenhuma sonda lê a asserção 2 de `catalogo_secdef.sql` | `git grep`: **nenhuma** sonda (Parte B, deriva, smoke) a lê. ⚠ A Parte B depende de `papel_atual()` não nulo para a conta `consulta` → a guarda de `checagens_integridade_resumo` passa à legada EXPLÍCITA (decisão 14) | confere — nada de exceção temporária |
| 24 | `migrations-f38.test.ts`: `DA_F38`, `RECRIACOES_AUTORIZADAS` | idem (as 19 INTOCÁVEIS não citam a família; `transferir_item` e `criar_compra_lote` chamam `pode_escrever_filial` e não são recriadas) | confere |
| 25 | o método; a MATRIZ até R-ACC-123 | idem | confere |
| 26 | os bloqueios das fases recentes | hoje o conector está na conta certa, com os dois projetos | — |
| 27 | o comprimento; `import_logs.backup_path` teto 120 | idem; esta fase não cria coluna `text` | confere |
| 28 | as regras 1, 2, 3, 5, 6, 7, 8 e a doc oficial | a doc conferida está no §5 (decisões 1, 7, 8, 9, 11) | — |

**O que a ordem não sabia e muda o desenho (medição minha, regra 1 da autonomia):**

- **As travas 15h (`catalogo_policies.sql`) e 7b/7c (`empresa_no_acervo.sql`), e a varredura TS
  `empresa-acervo-sem-leitura.test.ts`.** Desde a F63 nenhuma FUNÇÃO de `public` que toque uma das 19 tabelas dos lotes
  1 e 2 pode citar `empresa_id` fora da lista nominal `k_leitura_tenant` (por comando, com a origem provada), nenhuma VIEW
  de `public` pode citar a coluna junto das oito do acervo (a 7c, sem lista de exceção), e nenhum `.from('<uma das oito>')`
  do TS a cita. Consequências: (a) toda destrutiva que filtra por `empresa_id = p_empresa` ou grava
  `eventos_admin.empresa_id` entra em `k_leitura_tenant` com as tabelas dela, por nome, com motivo (decisão 5); (b) as
  views da mesa NÃO podem citar `empresa_id` — particionam pela empresa da FILIAL, lida por uma função
  (`empresa_da_filial`, que lê `filiais`, fora dos lotes) e exposta numa coluna `empresa` (decisão 9); (c) o TS não lê a
  empresa da linha do acervo — a empresa da operação vem da FILIAL (lida em `filiais`, fora dos lotes) ou é a legada
  EXPLÍCITA (decisão 13).
- **A constante L4 de `integridade_tenant.sql`** (md5 de toda função de `public` fora das recriadas nominalmente) e a lista
  `k_escritores` de `empresa_no_vocabulario.sql` (md5 do `prosrc` dos escritores de `eventos_admin`): toda função que a
  F67 cria ou recria entra na exclusão nominal da L4, e os md5 de `k_escritores` passam aos corpos novos (declarado).
- **`eventos_admin.empresa_id` existe e nasce pelo default (a WAP).** A decisão 1 do Johnny ("a trilha grava a empresa
  ALVO") exige gravá-lo EXPLÍCITO nas destrutivas recriadas.
- **A trilha das cinco RPCs de conta é gravada pela Server Action** (`registrarEventoAdmin`), não pela RPC — a F67 não
  muda isso (o escritor TS da trilha é da F67C).
- **`resetar_dados_ficticios(text)`** é `security definer` só de `service_role`, só no ensaio (`ambiente`), fora do
  universo: fica como está.

---

## 2. A tabela-verdade dos consumidores do cargo (decisões 2 e 3)

Cada uso de `papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()`, `pode_escrever_filial(`, `e_plataforma()` e
`empresa_legada()`, lido do catálogo nos dois bancos (iguais) e do código. **Destinos:** PISO (fica, pareado com o
recorte do MESMO cargo); REAL (forma por empresa com a empresa de verdade); LEGADA → Fx (forma por empresa com
`public.empresa_legada()` / `EMPRESA_LEGADA_ID` EXPLÍCITO, até a fase Fx); SAI (contração).

### 2.1 Policies (todos os esquemas)

| onde | piso hoje | par | destino |
|---|---|---|---|
| 19 × SELECT "leitura operador" (18 tabelas de negócio + `membros`) e `pendencias_item` leitura | `papel_atual() is not null` | `empresas_do_membro()` (mesmo cargo) | **PISO** |
| 20 × `e_admin()` (auditoria, filiais, import_logs, itens, kits, motivos, tipos_item, unidades_apelidos, colaboradores admin, pendências admin reabre) | `e_admin()` | `empresas_de_admin()` | **PISO** |
| 4 × `pode_escrever()` (anotações, colaboradores, itens, relatórios) | `pode_escrever()` | `empresas_de_escrita()` | **PISO** |
| 8 só-recorte (`ativos` ×2, `lancamentos_item`, `movimentacoes`, `pendencias_item` resolve, `termos_gerados` ×3) | — | — | fora (não citam o piso) |
| `public.profiles` / "leitura operador" | `papel_atual() is not null` | **nenhum** (`profiles` não tem `empresa_id`) | **LEGADA → F69** (`papel_na_empresa(empresa_legada()) is not null`) |
| `storage.objects` × 4 (`backups-import`: apaga, atualiza, insere, leitura) | `e_admin()` | nenhum | **LEGADA → F67B** (`e_admin_na(empresa_legada())`) |
| `storage.objects` × 3 (`termos`: apaga, atualiza, insere) | `pode_escrever()` | nenhum | **LEGADA → F67B** (`pode_escrever_na(empresa_legada())`) |
| `storage.objects` / "termos leitura operador" (indireta) | `pode_ler_arquivo_termo(name)` → `papel_atual()` | nenhum | **LEGADA → F67B** (no corpo da função) |
| `public._bkp_relatorios_gerados_f6a` / "dev le backup f6a" | `e_dev()` | nenhum | **LEGADA → permanente** (backup congelado de uma fase da WAP; `e_dev_na(empresa_legada())`) |

Nenhuma policy cita `pode_escrever_filial(`, `e_plataforma(` ou `empresa_legada(`. Nenhuma está em OR no topo. Com o piso
novo ("o cargo mais forte"), a conjunção com o recorte do mesmo cargo é EXATAMENTE "este cargo nesta empresa"; sem par,
o piso viraria "em alguma empresa" — por isso os dez saem do piso (sem isso, entre a F67 e a F67B, o admin só da B leria
os backups do import da WAP).

### 2.2 Corpos de função (`prosrc` vivo, sem os 3 que só citam em comentário)

| função (`*` = definer) | usa hoje | destino |
|---|---|---|
| `papel_atual*` | membership na legada | **PISO**: o cargo mais forte entre as memberships ativas |
| `e_admin*`, `pode_escrever*` | `papel_atual()` | **PISO** (corpo igual, herdam) |
| `e_dev*` | `papel_atual()` | **SAI** na contração (sem consumidor depois da conversão; ver decisão 2) |
| `pode_escrever_filial*` | `papel_atual()` + `empresa_legada()` | **REAL**: `pode_escrever_unidade(<empresa da filial>, fid)` |
| `e_plataforma*` | `empresa_legada()` | fica (consumida por `papel_na_empresa`); a forma é da F69 |
| `pode_escrever_termo*` | `e_admin()` + `pode_escrever_filial()` | **REAL** (`pode_escrever_filial(a.filial_id)` por ativo); o termo degenerado (`ativo_ids = '{}'`) → **LEGADA → F67B** |
| `pode_ler_arquivo_termo*` | `papel_atual()` | **LEGADA → F67B** |
| `checagens_integridade_resumo*`, `ledger_de_migracoes*` | `papel_atual()` | **LEGADA → F69/F70** (decisão 14) |
| `dev_checagens_integridade*`, `ultima_migracao_aplicada*` | `e_dev()` | **LEGADA → F69** (`e_dev_na(empresa_legada())`, que já inclui a plataforma) |
| `exigir_gestao_de*` | `e_admin()`, `e_dev()`, `empresa_legada()` | **REAL**: forma nova `(p_empresa, p_alvo, p_papel_pedido)`; a antiga SAI |
| `exigir_dev_para_destruir*` | `e_dev()` | **REAL**: forma nova `(p_empresa, p_justificativa)`; a antiga SAI |
| `apagar_usuario*`, `encerrar_sessoes_usuario*` | `e_dev()` | **REAL** (`e_dev_na(p_empresa)`); as antigas SAEM |
| `definir_papel_usuario*`, `definir_status_usuario*`, `definir_vinculos_usuario*` | `empresa_legada()` | **REAL** (`p_empresa`); as antigas SAEM |
| `existe_outro_admin_ativo*` | `empresa_legada()` | **REAL** por `p_escopo`; `p_escopo` nulo → **LEGADA** (só os chamadores antigos o passam nulo, até a contração; decisão 12) |
| `apagar_ativos_conflito_filiais*`, `importar_ativos_substituir*` | `e_admin()` (+ `pode_escrever_filial`) | **REAL** (`p_empresa`); as antigas SAEM |
| `checagens_integridade_nucleo*` | `empresa_legada()` | fica — já EXPLÍCITA (decisão 14) |
| `handle_new_user*` | `empresa_legada()` | fica — **F69** (fora) |
| 7 INVOKER que escrevem (`confirmar_assinatura_termo_com_anotacao`, `criar_compra_lote`, `criar_movimentacao_com_itens`, `definir_service_tag_com_anotacao`, `desfazer_confirmacao_termo_com_anotacao`, `lancar_itens_lote`, `transferir_item`) | `pode_escrever_filial(f)` | **REAL** por herança (o corpo novo responde pela empresa da filial); não são recriadas (duas são INTOCÁVEIS) |

Views: nenhuma cita a família.

### 2.3 TS e scripts

| onde | hoje | destino |
|---|---|---|
| `src/lib/auth/acesso.ts:121` (`lerPapel`) | `chamarRpc('papel_atual')` | **LEGADA → F70**: `chamarRpc('papel_na_empresa', { p_empresa: EMPRESA_LEGADA_ID })` (o cargo de navegação) |
| `src/lib/auth/acesso.ts:154` (`lerVinculo`) | `pode_escrever_filial({fid})` | **REAL** (a função responde pela empresa da filial) |
| `src/lib/auth/acesso.ts:201` (`getOperador`) | `membros.eq('empresa_id', EMPRESA_LEGADA_ID)` | **LEGADA → F70** |
| `src/lib/queries/admin.ts:163,164,230,289,338,344` | `EMPRESA_LEGADA_ID` | **LEGADA → F69/F70** (a gestão de contas da empresa de quem opera) |
| `idsDeAdminsAtivos` (`queries/admin.ts:225`) | membros da legada | **REAL** por parâmetro (`empresaId`), chamado com a empresa da operação |
| as RPCs que ganham `p_empresa` (§4) | — | por FILIAL → a empresa da filial (lida em `filiais`); por LINHA, o "tudo", a mesa e as contas → **LEGADA → F70** |
| `scripts/perf/medir-guarda.mjs:233,245` | `rpc('papel_atual')` | **LEGADA**: `rpc('papel_na_empresa', { p_empresa: <a legada> })` |
| `scripts/seed.ts`, `scripts/smoke/persona.ts`, `scripts/design/previa-ficha-dados.ts`, `scripts/manutencao/gerar-errata-truncamento.ts` | `EMPRESA_LEGADA_ID` | **F67C** (escritores e scripts; fora) |

A catraca TS (decisão 13) conta `EMPRESA_LEGADA_ID`/`empresa_legada` em `src/**` e `scripts/**` (fora de teste e do
`database.ts` gerado) por arquivo, com o número EXATO e o destino ao lado.

---

## 3. A tabela-verdade das `security definer` (decisão 4)

As 65 de hoje por classe da F48 (o bloco de `k_secdef`): modelo de acesso 5 · gestão de contas 7 · no-op F52 de gestão 1 ·
gatilhos 4 · termo/item 5 · leitura de termo 1 · Zona destrutiva 12 · no-op F52 da mesa 1 · import 1 · auxiliares do
import 8 · auxiliares de `aplicar_movimentacao` 6 · senha 1 · `/dev` 2 · integridade 4 · F62 7. **Depois da F67: 69**
(+5 por empresa, −`e_dev`); as sobrecargas existem só nos bancos vivos entre a expansão e a contração.

**O universo de `definer_sem_tenant.sql`** (definer ∧ EXECUTE de `authenticated` ∧ recebe `uuid`/`uuid[]`/`smallint`/
`text`): **21 → 26** (as cinco por empresa entram). Para cada uma, de onde vem a empresa e qual primitiva POR EMPRESA a
confere (a trava nova exige a primitiva no corpo, por NOME, ou a delegação a uma função que a chame):

| função | a empresa vem de | confere por | recusa |
|---|---|---|---|
| `papel_na_empresa`, `e_admin_na`, `e_dev_na`, `pode_escrever_na` | o parâmetro | elas MESMAS (a base da lista) | nulo → null/false; sem membership ativa → null/false |
| `pode_escrever_unidade(p_empresa, p_filial)` | o parâmetro + `filiais.empresa_id` | ela mesma; a filial é testada ANTES do cargo | filial de outra empresa → false |
| `pode_escrever_filial(fid)` | `filiais.empresa_id` da filial | `pode_escrever_unidade` | filial inexistente → false |
| `pode_escrever_termo(ids)` | a filial de cada ativo | `pode_escrever_filial` (→ `pode_escrever_unidade`); degenerado → `e_admin_na(legada)` | ativo de empresa onde não escreve → false |
| `pode_escrever_arquivo_termo(nome)` | o termo do arquivo | delega a `pode_escrever_termo` (não muda; F67B) | — |
| as cinco de conta (forma nova) | `p_empresa` + a membership do ALVO | `exigir_gestao_de(p_empresa, …)` → `e_admin_na`/`e_dev_na`; `apagar_usuario`/`encerrar_sessoes_usuario` também `e_dev_na(p_empresa)` | alvo sem membership em `p_empresa` → 42501; filial de outra empresa nos vínculos → 42501 |
| as oito da Zona + `previa_reset` (forma nova) | `p_empresa` + a linha/filial | `exigir_dev_para_destruir(p_empresa, …)` → `e_dev_na` | linha ou filial de outra empresa → 42501 |
| `apagar_ativos_conflito_filiais` (forma nova) | `p_empresa` + os ativos | `e_admin_na(p_empresa)` + `exigir_ativos_da_empresa(p_empresa, ids)` | ativo de outra empresa → 42501 |
| `importar_ativos_substituir` (forma nova) | `p_empresa` + a filial do plano | `e_admin_na(p_empresa)` ∧ `pode_escrever_unidade(p_empresa, filial)` | filial de outra empresa → 42501, antes do lock e do backup |
| `estorno_item_coerente`, `termo_ancora_coerente` | — | **exceção** (fica): coerência de dados; a empresa é garantida pela FK composta da F65 e pelo AND da policy com o recorte por empresa | — |
| `pode_ler_arquivo_termo` | — | **exceção** (fica, → F67B): ignora o parâmetro; o corpo passa a `papel_na_empresa(empresa_legada())` | — |

**As auxiliares fechadas** (fora do universo; quem as protege é o chamador): `exigir_gestao_de`, `existe_outro_admin_ativo`,
`mesmo_escopo_de_gestao`, `exigir_dev_para_destruir`, `rotulo_alcance_reset`, `exigir_ativos_da_empresa`, as oito do import,
`exigir_identidade_livre_na_filial`. As do import operam por FILIAL (o `filiais.id` é único no sistema e a filial já foi
conferida contra `p_empresa` pela orquestradora): não ganham `p_empresa`. `import_contar_conflitos` lê
`v_conflitos_filiais` por filial — com a view particionada, conta só dentro da empresa.

---

## 4. O mapa de assinaturas (decisões 5, 7 e 12)

Todas: `p_empresa uuid` **1º e sem default**; nome mantido; a antiga fica até a contração (`0193`). `chamarRpc` exige o
argumento pelo tipo gerado (o parâmetro sem default sai obrigatório em `database.ts`).

| RPC | antiga | nova | chamadores TS | de onde sai `p_empresa` |
|---|---|---|---|---|
| `resetar_acervo` / `resetar_itens` | `(p_filial smallint, p_confirmacao text, p_justificativa text, p_backup_path text, p_contagens jsonb)` | `(p_empresa uuid, …mesmos…)` | `actions/dev-destrutivo.ts:426` | filial → `filiais`; "tudo" → `EMPRESA_LEGADA_ID` (F70) |
| `previa_reset` | `(p_bloco text, p_filial smallint)` | `(p_empresa uuid, p_bloco text, p_filial smallint)` | `queries/dev-destrutivo.ts:374` | idem |
| `apagar_ativo` | `(p_ativo uuid, p_confirmacao text, p_justificativa text)` | `(p_empresa uuid, …)` | `actions/dev-destrutivo.ts:223` | `EMPRESA_LEGADA_ID` (F70) |
| `apagar_movimentacao` | `(p_mov uuid, …)` | `(p_empresa uuid, …)` | `:284` | idem |
| `apagar_item` | `(p_item smallint, …)` | `(p_empresa uuid, …)` | `:330` | idem |
| `forcar_estado_ativo` | `(p_ativo uuid, p_status status_ativo, p_justificativa text)` | `(p_empresa uuid, …)` | `:473` | idem |
| `forcar_saldo_item` | `(p_item smallint, p_filial smallint, p_saldo_alvo integer, p_justificativa text)` | `(p_empresa uuid, …)` | `:511` | a filial → `filiais` |
| `apagar_ativos_conflito_filiais` | `(p_ativos uuid[], p_confirmacao text, p_justificativa text, p_backup_path text default null)` | `(p_empresa uuid, …mesmos…)` | `actions/conflitos.ts:288` | `EMPRESA_LEGADA_ID` (F70) |
| `importar_ativos_substituir` | `(p_plano jsonb, p_backup_path text, p_contagens jsonb, p_correcoes jsonb default '[]')` | `(p_empresa uuid, …mesmos…)` | `actions/importar.ts:677` | a filial do plano → `filiais` |
| `definir_papel_usuario` | `(p_alvo uuid, p_papel papel_usuario)` | `(p_empresa uuid, p_alvo uuid, p_papel papel_usuario)` | `actions/admin.ts:362` | `EMPRESA_LEGADA_ID` (F69/F70) |
| `definir_vinculos_usuario` | `(p_alvo uuid, p_filiais smallint[])` | `(p_empresa uuid, …)` | `:382` | idem |
| `definir_status_usuario` | `(p_alvo uuid, p_ativo boolean)` | `(p_empresa uuid, …)` | `:545` | idem |
| `apagar_usuario` | `(p_alvo uuid)` | `(p_empresa uuid, p_alvo uuid)` | `actions/dev.ts:154` | idem |
| `encerrar_sessoes_usuario` | `(p_alvo uuid)` | `(p_empresa uuid, p_alvo uuid)` | `actions/dev.ts:234` | idem |
| *(fechadas)* `exigir_gestao_de` | `(p_alvo uuid, p_papel_pedido papel_usuario default null)` | `(p_empresa uuid, p_alvo uuid, p_papel_pedido papel_usuario)` **sem default** | — | — |
| *(fechada)* `exigir_dev_para_destruir` | `(p_justificativa text)` | `(p_empresa uuid, p_justificativa text)` | — | — |
| *(fechada)* `rotulo_alcance_reset` | `(p_filial smallint)` | `(p_empresa uuid, p_filial smallint, p_bloco text)` | — | — |
| *(fechada)* `mesmo_escopo_de_gestao` | `(p_alvo uuid)` | `(p_empresa uuid, p_alvo uuid)` | — | — |
| *(fechada)* `exigir_ativos_da_empresa` | `(p_ids uuid[])` | `(p_empresa uuid, p_ids uuid[])` | — | — |
| `e_dev` | `()` | — (SAI) | nenhum | — |

Scripts: nenhum chama estas RPCs (`git grep` em `scripts/**`). **As formas de retorno não mudam**, com uma exceção
declarada: `previa_reset` devolve `rotulo` com o novo texto do "tudo" (o tipo `string` não muda; a chave não muda).
`LEITURA_PAPEL_ATUAL` (`formas/auth.ts`) passa a descrever `papel_na_empresa` (matriz `{ tipo: 'empresa-legada' }` no
conferidor). As views da mesa ganham a coluna `empresa` no FIM (o TS não a seleciona; as formas não mudam).

**Ambiguidade conferida.** PostgREST: *"You can call overloaded functions with different number of arguments"* e a escolha é
pelo CONJUNTO de chaves do corpo JSON (`docs.postgrest.org/en/stable/references/api/functions.html`); a antiga não tem
`p_empresa` e a nova o exige → `{…antigos…}` só casa a antiga; `{p_empresa, …}` só a nova (prova no ensaio pela forma do
erro — sabotagem J). SQL interno: toda sobrecarga nova tem aridade sem interseção com a antiga ou tipos posicionais
distintos, e **nenhuma tem default que a encolha até a aridade da antiga** — por isso `exigir_gestao_de` nova não tem
default (com default, `exigir_gestao_de(p_alvo, null)` dos corpos antigos ficaria ambíguo: o aviso de Overloading do PG 17).

---

## 5. O desenho e as vinte decisões

1. **As funções por empresa** (fato 6; a ficha dizia "`papel_atual()` ganha `p_empresa`" — impossível sem `cascade` ou
   sobrecarga ambígua: divergência declarada). `papel_na_empresa(p_empresa uuid) returns papel_usuario`,
   `e_admin_na(uuid)`, `e_dev_na(uuid)`, `pode_escrever_na(uuid)` e `pode_escrever_unidade(p_empresa uuid, p_filial
   smallint)`: `security definer`, `stable`, `search_path = ''`, `revoke all … from public, anon, service_role` +
   `grant execute … to authenticated` (as policies de `storage` e o TS as chamam). **`papel_na_empresa` é a fonte única**
   e as três booleanas derivam dela (`coalesce(papel_na_empresa(p) in (…), false)`), o que mantém a hierarquia estrita
   `dev ⊃ admin ⊃ operador ⊃ consulta` POR EMPRESA. Ordem dentro de `papel_na_empresa`: `p_empresa` nulo → NULL; depois a
   EMPRESA (a membership ATIVA de `auth.uid()` naquela empresa, perfil não arquivado); a plataforma (`e_plataforma()` e a
   empresa existe) responde `'dev'` em qualquer empresa (decisões 12/11-3 e 13/11-1: "dev sou só eu"); só então o cargo.
   `pode_escrever_unidade`: `p_empresa` ou `p_filial` nulo → false; **a filial é da empresa?** (`filiais.empresa_id =
   p_empresa`) — ANTES de qualquer cargo; dev/admin → true (SEM `where f.ativo`: admin alcança filial desativada); operador →
   vínculo da membership NAQUELA empresa; senão false. `e_plataforma()` não muda (continua exigindo a membership ativa na
   legada — a forma é da F69). ⚠ Consequência declarada: a plataforma é admin/dev em TODA empresa pela forma por empresa
   (não pelo piso — as funções de conjunto, que recortam as policies, não a incluem; quanto a plataforma VÊ é da F69).
2. **O piso.** `papel_atual()` passa a "o cargo MAIS FORTE entre as memberships ativas" (`order by` explícito
   dev→admin→operador→consulta; o enum do PG põe `dev` antes de `admin`, mas a ordem é escrita, não herdada). `e_admin()` e
   `pode_escrever()` não mudam de corpo (derivam). Pareado, o piso é EXATAMENTE "este cargo nesta empresa"; com uma empresa
   e uma membership por pessoa, igual ao de hoje (o conta a conta prova). Isso **reverte** a frase da `0158` ("nunca pelo
   cargo mais forte entre empresas") — ela existia porque havia consumidor sem par; com a trava do piso deixa de haver
   (`ADR-002` §17). **`e_dev()` SAI na contração**: depois da conversão não sobra consumidor de produção (nenhuma policy
   depois do `_bkp`, nenhum corpo, nenhum TS); os roteiros que a provavam (`cargo_dev.sql` 1z e duas outras,
   `cargo_equivalencia.sql`) passam a `e_dev_na(empresa_legada())`, declarado. A alternativa (`p_empresa` default null com
   ponte) perde: é sobrecarga.
3. **Os consumidores sem par** (§2): a forma por empresa com a empresa REAL onde ela existe no contexto, e com a legada
   EXPLÍCITA onde o recorte é de fase futura (`storage` → F67B; `profiles` → F69; observabilidade → decisão 14; `_bkp` →
   permanente). **Nunca o piso sem par.**
4. **A trava da F52 por empresa.** `definer_sem_tenant.sql` ganha a asserção 4: toda função de `k_escopo_ok` tem, no
   `prosrc` SEM comentário, uma CHAMADA (por nome inteiro, `\m<nome>\s*\(`) a uma primitiva da lista nominal
   `k_primitivas_por_empresa` (`papel_na_empresa`, `e_admin_na`, `e_dev_na`, `pode_escrever_na`, `pode_escrever_unidade`)
   — ou DELEGA (por nome inteiro) a uma função que, transitivamente, chama (o fecho calculado no catálogo, por recursão).
   O piso sem argumento não conta (não está na lista); um nome que só COMEÇA como uma primitiva (`e_admin_na_x(`) não casa.
   As exceções: `estorno_item_coerente` e `termo_ancora_coerente` **ficam**, com o motivo reescrito (a FK composta da F65
   garante a empresa dos ids, e a policy as ANDa ao recorte por empresa — medido: nenhuma delas autoriza nada sozinha);
   `pode_ler_arquivo_termo` fica, com motivo apontando a F67B (ela ignora o parâmetro).
5. **As destrutivas e a empresa.** `p_empresa uuid` 1º, sem default, nas oito da Zona, `previa_reset`,
   `apagar_ativos_conflito_filiais` e `importar_ativos_substituir`, e nas fechadas onde muda o que fazem
   (`exigir_dev_para_destruir`, `rotulo_alcance_reset`, `exigir_ativos_da_empresa`). `p_empresa` nulo → 42501. **Por id**: a
   linha tem de ser de `p_empresa` (lida no MESMO `select` que já existia: `a.empresa_id`, `m.empresa_id`, `i.empresa_id`),
   senão 42501 *"Este registro pertence a outra empresa."*. **Por filial**: a filial tem de ser de `p_empresa`, senão 42501
   *"Esta filial pertence a outra empresa."*. **O "tudo"** = todas as filiais DESTA empresa: `empresa_id = p_empresa` em
   TODO comando do alcance (inclusive o laço de lock, que passa a varrer só as filiais da empresa, e os termos — que não
   têm filial — pela coluna do termo). **A confirmação**: `rotulo_alcance_reset(p_empresa, p_filial, p_bloco)` = para o
   "tudo" `'RESETAR TUDO — ' || count(*) || ' ATIVOS'` (bloco acervo) ou `' LANÇAMENTOS'` (bloco itens — a contagem do
   que vai sumir naquele bloco: a ficha só previu o acervo, declarado); número sem separador de milhar (é o que se digita);
   travessão U+2014. A filial continua pelo nome. **A trilha**: `eventos_admin` grava `empresa_id = p_empresa`
   EXPLÍCITO e `'alcance' = 'empresa'` no lugar de `'global'`, mais `'empresa_alvo'` no detalhe. ⚠ **A doutrina da F63 (as
   travas 15h e 7b)**: toda destrutiva nova que lê `empresa_id` ou grava a trilha entra em `k_leitura_tenant` (fonte única
   em `catalogo_policies.sql`, cópias em `empresa_no_acervo.sql` e `empresa_no_vocabulario.sql`) com as tabelas DELA, por
   comando — motivo: "recorte da `security definer` (F67): ela atravessa a RLS por construção, então a empresa se confere
   no corpo". A verificação da filial (que lê `filiais`, fora dos lotes) mora numa auxiliar fechada,
   `filial_da_empresa(p_empresa, p_filial) returns boolean`, para não pôr `empresa_id` em corpo que não precisaria dele.
6. **Os lotes e a ordem** (§6). Entre dois lotes, repouso válido (nenhuma recusa nova para a WAP: com uma empresa, cada
   forma nova responde igual à antiga).
7. **Expandir e contrair** (13/11-2, fato 23). O nome fica; a assinatura nova nasce ao lado; a antiga só ganha a trava
   advisory convertida (decisão 8: `resetar_acervo`, `resetar_itens`, `apagar_ativos_conflito_filiais` antigas) e mais
   nada — o diff do `prosrc` prova. A contração (`0193`) em arquivo próprio: `drop function` sem `if exists` e sem
   `cascade`, das 20 assinaturas antigas + `e_dev()`. **Nenhuma sonda lê a asserção 2 de `catalogo_secdef.sql`** (medido):
   sem exceção temporária. A sobrecarga vive só nos bancos vivos entre a expansão e a contração; no CI a cadeia termina
   contraída. Plano B (nome novo, molde F60) só se o ensaio mostrar ambiguidade real no PostgREST.
8. **As chaves advisory** (fato 16; a doc do PG 17: *"these two key spaces do not overlap"*). Cada família fica com UMA
   forma `(int, int)`: `import_substituir` — por filial `(hashtext('import_substituir'), filial::int)` (não muda: o
   `filiais.id` é único no sistema) e a sentinela do "tudo" `(hashtext('import_substituir'), hashtext(p_empresa::text))`
   (era `-1`); `conflito_filiais_apagar` — era `(bigint)` `hashtext('conflito_filiais_apagar')`, passa a `(hashtext(
   'conflito_filiais_apagar'), hashtext(p_empresa::text))`. Colisão de hash só serializa, nunca libera. As antigas vivas
   convertem na MESMA migration da nova da família (`0190` para os resets, `0191` para a mesa), com a empresa legada no
   lugar de `p_empresa` — assim o app velho e o novo continuam se excluindo. O import não muda (a chave dele já é por filial).
9. **A mesa de conflitos** (fato 17). As duas views agrupam por `(empresa da filial, chave)`: a CTE `ident` ganha
   `public.empresa_da_filial(a.filial_id) as empresa` e o `group by`/`join` passam a `(empresa, chave)` — a view NÃO cita
   `empresa_id` (a 7c), e `empresa_da_filial` (`invoker`, `stable`, `search_path = ''`, lê `filiais`, fora dos lotes) é a
   ponte; a FK composta da F65 garante `ativos.empresa_id = filiais.empresa_id`. As views ganham a coluna `empresa` no FIM
   (`create or replace view` só acrescenta no fim). `apagar_ativos_conflito_filiais(p_empresa, …)` exige `e_admin_na(p_empresa)`,
   todos os ids de `p_empresa` (`exigir_ativos_da_empresa(p_empresa, ids)`, 42501) e recalcula o grupo DENTRO dela.
   `paresEmOutrasFiliais` e `cadastrosComMesmaIdentidade` recortam pelas FILIAIS da empresa (lidas em `filiais`; o TS não
   lê `empresa_id` do acervo — a varredura da F63).
10. **O import de startup.** `importar_ativos_substituir(p_empresa, …)`: `e_admin_na(p_empresa)`; a filial do plano tem de
    ser de `p_empresa` (42501 *"Esta filial pertence a outra empresa."* ANTES do lock e do backup) e
    `pode_escrever_unidade(p_empresa, filial)`. O que a RPC grava continua pelo default (F67C) — com outra empresa, a FK
    composta recusaria o `ativos` criado (23503): **o import de uma empresa que não seja a WAP é da F67C**, declarado.
11. **A trava do termo.** `empresas_com_modelo_de_termo() returns uuid[]`, `immutable`, `uuid[]` literal com a WAP — a FONTE
    ÚNICA; liberar uma empresa = migration nova junto com os modelos `.docx` dela. Gatilho `termo_exige_modelo_da_empresa`
    BEFORE INSERT em `termos_gerados` (o UPDATE de `empresa_id` já é recusado por `guarda_empresa`, 0173): 42501 *"A emissão
    de termo ainda não está disponível para esta empresa."*. O nome ordena ANTES de `termos_gerados_ids_da_empresa`
    (`termo_` < `termos`, ordem alfabética dos BEFORE — `sql-createtrigger`): a recusa de empresa vem antes da de ids. Vale
    para todo papel (gatilho não se contorna por `service_role` nem `postgres`; `ON CONFLICT … DO UPDATE` passa pelo BEFORE
    INSERT antes). A função do gatilho lê `new.empresa_id` → `k_leitura_tenant` (`termos_gerados`). A coluna-interruptor em
    `empresas` perde: liberar sem modelo viraria um clique que gera documento falso.
12. **A gestão de contas.** As cinco ganham `p_empresa`; `exigir_gestao_de(p_empresa, p_alvo, p_papel_pedido)`: sem sessão →
    42501; `p_empresa` nulo → 42501; o alvo é o próprio → 42501; o alvo não tem conta (nenhuma membership) → P0002; o alvo
    não é membro de `p_empresa` (`mesmo_escopo_de_gestao(p_empresa, p_alvo)`) → 42501 *"Este usuário não pertence a esta
    empresa."*; depois o cargo (`e_dev_na`/`e_admin_na` daquela empresa). `definir_vinculos_usuario` recusa filial de outra
    empresa (42501, antes do `delete`). **`apagar_usuario` e `encerrar_sessoes_usuario` agem na CONTA**: exigem
    `e_dev_na(p_empresa)` e, se o alvo é membro de outra empresa além de `p_empresa`, só a plataforma passa (42501).
    `existe_outro_admin_ativo(p_excluindo, p_escopo)`: conta as memberships dev/admin ativas de `p_escopo` (as contas dev
    CONTAM enquanto forem membros — 12/11-3; a ficha dizia "plataforma fora do denominador": divergência declarada);
    `p_escopo` nulo → a legada EXPLÍCITA (só os corpos antigos chamam com um argumento, até a contração). `idsDeAdminsAtivos`
    ganha o parâmetro da empresa. "Ninguém age sobre o próprio acesso" fica.
13. **De onde o TS tira `p_empresa`.** Por FILIAL (reset/prévia por filial, forçar saldo, import): a empresa da filial,
    lida no servidor em `filiais` (fora dos lotes). Por LINHA do acervo, o "tudo", a mesa e as contas: `EMPRESA_LEGADA_ID`
    EXPLÍCITO — o TS não lê `empresa_id` do acervo (a varredura da F63) e a empresa da sessão é da F70; contado pela catraca
    com destino F70. O banco confere de novo sempre; um valor do cliente nunca entra sem passar por ele.
14. **A observabilidade.** `checagens_integridade_resumo` e `ledger_de_migracoes`: `papel_na_empresa(empresa_legada()) is
    not null` (o smoke usa uma conta `consulta` da WAP; o "qualquer logado ativo DA WAP" fica); `dev_checagens_integridade` e
    `ultima_migracao_aplicada`: `e_dev_na(empresa_legada())` (que já inclui a plataforma). `checagens_integridade_nucleo`
    já é explícita. Por empresa de verdade é da F69/F70.
15. **O conta a conta** (fase nova `f67-antes` / `f67-depois` em `conta-a-conta.mjs`). O bloco (só leitura, termina em
    `raise`, escolhe as identidades DENTRO do banco) compara, para cada membership ativa, as funções REAIS com um ORÁCULO
    da regra de antes (a membership na legada, o vínculo na legada — exatamente o corpo da `0158`, escrito no bloco):
    **antes** do apply, as funções de hoje × o oráculo (prova que o oráculo é a regra viva: 0 divergência); **depois** de
    cada lote, as formas por empresa com a WAP, o piso novo, `pode_escrever_filial(f)` novo, `pode_escrever_unidade(WAP,f)`,
    `exigir_gestao_de`/`exigir_dev_para_destruir` (aceita/recusa, capturando a exceção dentro do bloco) e
    `existe_outro_admin_ativo` × o MESMO oráculo. Transitivamente, novo = oráculo = antigo, sem que um cargo por pessoa
    saia do banco. Só sai contagem. **A sabotagem I** (só no ensaio): a forma por empresa chamada com a empresa ERRADA
    (um uuid que não existe) numa classe → divergência > 0.
16. **O injetor**: sete mutações novas, uma por classe de trava que nenhum teste de mesa derruba — a ordem
    empresa-antes-de-cargo invertida em `pode_escrever_unidade`; o piso num corpo (`pode_escrever_filial` volta a `e_admin()`);
    a recusa de empresa removida de `apagar_ativo`; a partição removida da view; a sentinela do "tudo" sem empresa; o gatilho
    do termo desligado; `existe_outro_admin_ativo` contando todas as empresas. Teto **163 → 170**. As mutações antigas que
    citavam corpo ou assinatura que a F67 troca passam ao corpo novo (mesma classe, mesmo rótulo derrubado), declarado.
17. **O rollback** (`supabase/rollback/F67-desfaz.sql`): UM script idempotente, válido nos dois estados — (1) recria as 20
    assinaturas antigas e `e_dev()` com o corpo de ANTES da `0185` e os grants de antes (`create or replace`: no estado
    só-expansão reescreve as que existem; no contraído as recria); (2) devolve as views, os corpos e as policies; (3) derruba
    o gatilho do termo e as funções novas (`drop … if exists`, aqui permitido). A ordem é a inversa do apply (§6). Ensaiado
    por `supabase/tests/f67_rollback.sql` nos dois estados (o contraído, que é o do CI; e o só-expansão, reconstruído
    reaplicando as `0185`–`0192` em cima do primeiro rollback) contra a impressão do CI tirada antes da `0185` (o push das
    travas), com o irmão de mesa `rollback-f67.test.ts`. Os ensaios F62–F66B rodam com a F67 no lugar; o que falhar passa a
    rodar o da F67 antes, declarado. **Depois do rollback**: a ponte volta, o cargo volta a vir da WAP; nenhum dado se perde.
18. **`eventos_admin` nas funções recriadas**: toda destrutiva nova grava `empresa_id` EXPLÍCITO (a empresa alvo). E as
    duas que INSEREM no acervo — `forcar_estado_ativo` (movimentação de ajuste) e `forcar_saldo_item` (lançamento) —
    gravam a empresa explícita também: sem isso a plataforma não forçaria nada fora da WAP (a FK composta recusaria pelo
    default), e a 13/11-1 diz que força. A lista de escritores da F67C perde essas duas (declarado). O default fica para
    quem não foi recriado.
19. **A distribuição das fichas**: a da Frente F da ordem, sem mudança de lugar (§10 do relatório confere nota a nota).
20. **As frases das recusas novas** (42501, pt-BR, sem valor de linha): *"Este registro pertence a outra empresa."*,
    *"Esta filial pertence a outra empresa."*, *"Este usuário não pertence a esta empresa."*, *"A emissão de termo ainda
    não está disponível para esta empresa."* e *"Informe a empresa da operação."* (`p_empresa` nulo). Traduzidas em
    `erros-do-banco.ts` (ramo por frase, antes do 42501 genérico) e conferidas contra o esquema vivo por
    `erros-do-banco-sql.test.ts`.

---

## 6. As migrations, a ordem de apply, a fronteira e a ORDEM DE ROLLBACK

| # | arquivo | lote | o que faz | classe |
|---|---|---|---|---|
| 1 | `0185_cargo_por_empresa.sql` | expansão | as 5 por empresa + `empresa_da_filial` + `filial_da_empresa` (novas) | ADITIVA |
| 2 | `0186_consumidores_por_empresa.sql` | expansão | corpos novos: `pode_escrever_filial`, `pode_escrever_termo`, `pode_ler_arquivo_termo`, `checagens_integridade_resumo`, `ledger_de_migracoes`, `dev_checagens_integridade`, `ultima_migracao_aplicada` | ADITIVA |
| 3 | `0187_policies_sem_par_por_empresa.sql` | expansão | `alter policy` das 9 sem par (`profiles`, 7 de `storage`, `_bkp`) | ADITIVA |
| 4 | `0188_piso_cargo_mais_forte.sql` | expansão | `papel_atual()` → o cargo mais forte | ADITIVA |
| 5 | `0189_gestao_de_contas_por_empresa.sql` | expansão | `mesmo_escopo_de_gestao`/`exigir_gestao_de` novas, `existe_outro_admin_ativo` com corpo, as 5 de conta novas | ADITIVA |
| 6 | `0190_destrutivas_por_empresa.sql` | expansão | `exigir_dev_para_destruir`/`rotulo_alcance_reset`/`previa_reset` novas, as 7 da Zona novas, `importar_ativos_substituir` nova; os dois resets ANTIGOS com a sentinela convertida | ADITIVA |
| 7 | `0191_mesa_por_empresa.sql` | expansão | as duas views particionadas, `exigir_ativos_da_empresa` e `apagar_ativos_conflito_filiais` novas; a mesa ANTIGA com a chave convertida | ADITIVA |
| 8 | `0192_termo_por_empresa.sql` | expansão | `empresas_com_modelo_de_termo()` + o gatilho do termo | ADITIVA |
| — | **a fronteira** | | **expansão (0185–0192) \| contração (0193)** | |
| 9 | `0193_contracao_assinaturas_antigas.sql` | contração | `drop function` (sem `if exists`, sem `cascade`) das 20 antigas + `e_dev()`; `notify pgrst` | ADITIVA — o classificador da F63 calcula ADITIVA (`drop function` não toca dado) e o cabeçalho a declara assim; este plano dizia DESTRUTIVA (corrigido em 13/11, ata da F67, item 11) |

**Por que esta ordem.** As primitivas primeiro (nada as chama); depois os consumidores sem par (para que, quando o piso
mudar, nenhum consumidor dependa dele sem recorte); o piso só depois deles; a gestão, as destrutivas e a mesa (que usam as
primitivas); a trava do termo por último entre as aditivas (independente). Cada lote é `create or replace`/`alter policy`/
`create` — sem `update`/`delete` de negócio, sem `cascade`, sem DDL dinâmica, sem default mudado.

**O apply.** CI e ensaio: a cadeia inteira (o ensaio não tem app de produção: a `0193` não espera deploy). Produção: as
`0185`–`0192` ANTES do merge (dentro de 24 h do commit), lote a lote, cada um seguido das provas; a `0193` só DEPOIS do
deploy e da janela do `drop` (Δ = 0 das antigas, T0/T1 ≥ 30 min, a prova estática).

**A ORDEM DE ROLLBACK** (a inversa; está também no rodapé de cada migration e é a ordem de `F67-desfaz.sql`):
`0193` (recriar as 20 antigas + `e_dev()` com os grants) → `0192` (derrubar o gatilho e a função da lista) → `0191` (as views
de volta à `0134`/`0092`, a mesa antiga à `0132`, derrubar as novas) → `0190` (os resets antigos à `0089`, derrubar as
novas) → `0189` (`existe_outro_admin_ativo` à `0158`, derrubar as novas) → `0188` (`papel_atual` à `0158`) → `0187` (as 9
policies ao texto de antes) → `0186` (os 7 corpos ao de antes) → `0185` (derrubar as primitivas). **Entre fases**: o da F67
vem ANTES dos da F66B, F66, F65, F64, F63 e F62.

---

## 7. As travas e as provas

**Vermelhas antes da correção (Frente B, um commit, com a saída vermelha da mesa em `docs/f67-evidencias/B-travas/`):**

- `definer_sem_tenant.sql` — a asserção 4 (primitiva POR EMPRESA no corpo ou por delegação, por nome inteiro); hoje
  reprova pelas 18. A sabotagem C: uma função do universo que só chama `e_admin()`; uma que chama
  `e_admin_na_falso(`; uma fictícia nova não classificada.
- `cargo_por_empresa.sql` (novo) — **P** (as primitivas: nulo fecha; empresa antes do cargo; filial de outra empresa;
  `e_dev_na` = dev membro OU plataforma; admin alcança filial desativada; `pode_escrever_filial` pela empresa da filial);
  **Q** (a trava do piso: (a) nenhum `prosrc` de `public` chama `papel_atual()`/`e_admin()`/`e_dev()`/`pode_escrever()`
  fora da família nominal; (b) toda policy de qualquer esquema que os cita está no AND do topo com o recorte do MESMO
  cargo, lida pela árvore com o mesmo leitor de `catalogo_policies.sql`; (c) a sabotagem B); **D** (a trava das
  destrutivas no catálogo: `p_empresa uuid` 1º sem default na lista nominal; `rotulo_alcance_reset` contém `count(`;
  nenhum comando com `p_filial is null` sem `empresa_id = p_empresa` no mesmo comando; a sentinela do "tudo" carrega a
  empresa). Hoje reprova.
- `conflito_entre_empresas.sql` (novo) — duas empresas com o MESMO par em filiais diferentes: as views não formam grupo
  entre elas; a mesa da A recusa o da B (42501); o import da A não conta o par da B; o par legítimo dentro da A forma grupo e
  é apagável. Hoje reprova.
- `termo_bloqueado.sql` (novo) — insert com a empresa B → 42501 com a frase (também como `postgres`); com a WAP passa;
  sem o gatilho, na transação, o da B passa. Hoje reprova.
- `isolamento_tenant.sql` — o **10e invertido** (quem é só da B vê o que é dela, com as policies reais); **10c/10d** com
  as policies reais; a ESCRITA da direção B nas quatro tabelas; **10k** (as cinco de conta, nas duas direções, com o par
  legítimo); **10l** (cada destrutiva: o dev membro só da A não destrói nada da B; a plataforma destrói, com a trilha
  gravando a empresa alvo). Hoje o 10e novo reprova.
- A trava das chaves advisory (mesa, `src/lib/validators/advisory-por-empresa.test.ts`) — replay das migrations até o fim
  da expansão E até o fim da cadeia: por família, uma forma só; a sentinela do "tudo" sem `-1`. Hoje reprova pela
  sentinela e pela forma da mesa.
- A catraca TS (mesa, `src/lib/auth/empresa-legada-catraca.test.ts`) — `EMPRESA_LEGADA_ID`/`empresa_legada` só nos
  pontos da tabela-verdade, com o número EXATO e o destino; e todo `chamarRpc` das RPCs desta fase passa `p_empresa`.

**As sabotagens A–K** (saída real em `docs/f67-evidencias/A-K-sabotagens.md`): A (a ordem e o nulo), B (o piso, 4 casos),
C (a F52, 3 casos), D (cada destrutiva sem a recusa + 4 casos da trava), E (a mesa), F (o import), G (o termo), H (advisory,
3 casos), I (o conta a conta sabe achar), J (a janela: 404/`PGRST202` no ensaio depois da contração; e a cadeia contraída
sem sobrecarga), K (o rollback nos dois estados + os F62–F66B com a F67 no lugar).

---

## 8. Commits e pushes

1. `docs(f67)`: a ordem (feito) e este plano.
2. `test(f67)`: as travas vermelhas (roteiros novos e alterados, testes de mesa), com a impressão "antes" do CI no push.
3. `feat(f67)`: uma migration por commit (`0185`→`0192`), cada uma com `db:lock`, `DA_F38`, `RECRIACOES_AUTORIZADAS`, as
   listas nominais (`k_leitura_tenant` e cópias, L4, `k_escritores`, `k_secdef`, `k_escopo_ok`).
4. `feat(f67)`: o TS (os chamadores, as guardas, a catraca, `database.ts` só nas assinaturas, as frases).
5. `test(f67)`: os roteiros adaptados e o rollback.
6. `test(f67)`: o injetor.
7. `feat(f67)`: a contração (`0193`).
8. `docs(f67)`: as fichas, a MATRIZ, o ADR, o RUNBOOK, os aninhados, a ata.
9. `chore(f67)`: a versão `1.73.0`.

Pushes agrupados (a cota de Actions): o das travas (mede a impressão "antes" do CI); o da implementação inteira; os da
revisão. PR em rascunho desde o primeiro.

## 9. O SHA de código congelado

*(preenchido no passo 3 da Frente G)*

## 10. O que este plano NÃO promete

- Storage e Realtime por empresa (F67B); o fim do default e a escrita comum informando a empresa (F67C) — inclusive o
  import de uma empresa que não seja a WAP; a empresa da sessão na tela (F70); a saída das contas dev de `membros` e
  `handle_new_user` (F69); o `CLAUDE.md` da raiz (F71); a revogação do piso (F72).
- Que a mesa, para quem é membro de duas empresas, separe na TELA dois grupos de mesma chave de empresas diferentes: o
  banco não os mistura (o grupo é por empresa e a RPC recusa id de outra empresa), mas a tela agrupa por chave até a F70.
- Nada sobre os dados do #84.

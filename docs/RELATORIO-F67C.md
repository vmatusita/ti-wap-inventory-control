# Relatório F67C — o fim do default: toda escrita diz a empresa

**v1.75.0 no ar** — a expansão (`0200`–`0204`) aplicada nos dois bancos com a exatidão lote a lote; o app novo pelo merge
do [PR #99](https://github.com/vmatusita/ti-wap-inventory-control/pull/99) (merge `16031e9c`, deploy às 19:03 de 16/11);
o ensaio já contraído (`0205`–`0207`), com a prova viva 20/20 · 20/20; **em produção a CONTRAÇÃO espera a janela de 12 h**
da Skew Protection (T1 ≥ 07:04 de 17/11) — ver §1.0 · SHA de código congelado **`1ea59f33`** · plano
[`PLAN-F67C.md`](PLAN-F67C.md) · ata `DECISOES.md` (2026-11-16 · F67C) · evidência em [`f67c-evidencias/`](f67c-evidencias/)
· tag `v1.75.0` no merge do PR de documentação.

> A oitava fase da virada multiempresa. Até aqui, as 20 colunas `empresa_id` de negócio tinham `default
> public.empresa_legada()`: a linha que um escritor criasse sem dizer a empresa nascia da WAP por omissão — com uma empresa
> só, certo; com duas, o lançamento de um membro da B nasceria da WAP calado. A F67C faz TODO escritor dizer a empresa —
> as 18 funções SQL pela filial que a própria linha grava (a ponte única `empresa_da_filial`), os 17 escritores do app pela
> filial ou pela operação, a trilha de Auditoria pela empresa ALVO, os scripts e a restauração pela filial da linha — e só
> então tira o default, lote a lote, depois do deploy e de uma janela medida por FORMA de INSERT.
>
> Com uma empresa só, nada disso muda o que a WAP vê ou pode, e foi medido: 0 linhas fora da legada antes e depois, as 62
> policies com o mesmo md5, as 13 checagens nos números travados, o smoke com 0 falha e o conferidor com 0 recusadas.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você

## 1.0 O que está PENDENTE agora, e o comando

**A contração em PRODUÇÃO (`0205`, `0206`, `0207`) espera a janela.** A condição (decisão 12): nenhuma chamada NOVA numa
forma de INSERT SEM `empresa_id`, nos papéis do app (`authenticated`, `service_role`), entre o deploy (19:03 de 16/11) e o
T1; com a Skew Protection LIGADA (teto não legível → 12 h, o padrão do Pro), **T1 ≥ 2026-11-17 07:04 -03**. O T0 está em
[`H-janela/T0.txt`](f67c-evidencias/H-janela/T0.txt).

Se esta run não fechar a contração, o caminho é (cada passo só leitura, salvo os `apply`):
1. O T1: rodar [`antes/formas-insert.sql`](f67c-evidencias/antes/formas-insert.sql) em produção (MCP `execute_sql`) e
   comparar com o T0 — as linhas de `authenticated`/`service_role`, coluna `c_sem`. Subiu alguma? NÃO contraia: espere
   mais 12 h e meça de novo (é um cliente velho, de antes do deploy).
2. Δ 0: `apply_migration` em produção, um por vez, com o texto do arquivo inteiro: `contracao_default_acervo` ← `0205`;
   esperar 5 min e contar os `23502` (passo 3); `contracao_default_registros` ← `0206`; 5 min; `contracao_default_filiais`
   ← `0207`; 30 min.
3. A vigília (só contagem), no MCP `query_logs` de produção:
   `select count(*) from logs where source = 'postgres_logs' and log_attributes['parsed.sql_state_code'] = '23502'` na
   janela desde o drop. **Qualquer número > 0 → o rollback do §1.1, do lote, IMEDIATAMENTE.**

## 1.1 O rollback do default — se uma tela der erro de empresa

O bloco do topo de [`supabase/rollback/F67C-desfaz.sql`](../supabase/rollback/F67C-desfaz.sql) (ensaiado no CI a cada
push, idempotente nos dois estados). Por lote, só o `set default` — devolve o comportamento de antes (o escritor que
esquecer a empresa volta a gravar a WAP) e não muda nenhuma linha:

```sql
-- filiais (0207)
alter table public.filiais alter column empresa_id set default public.empresa_legada();
-- vocabulário e registros (0206): as onze
alter table public.eventos_admin alter column empresa_id set default public.empresa_legada();
alter table public.import_logs alter column empresa_id set default public.empresa_legada();
alter table public.import_prefixos_patrimonio alter column empresa_id set default public.empresa_legada();
alter table public.import_termos_categoria alter column empresa_id set default public.empresa_legada();
alter table public.import_termos_estado alter column empresa_id set default public.empresa_legada();
alter table public.kits_modelos alter column empresa_id set default public.empresa_legada();
alter table public.motivos alter column empresa_id set default public.empresa_legada();
alter table public.relatorios_gerados alter column empresa_id set default public.empresa_legada();
alter table public.senhas_acesso alter column empresa_id set default public.empresa_legada();
alter table public.tipos_item alter column empresa_id set default public.empresa_legada();
alter table public.unidades_apelidos alter column empresa_id set default public.empresa_legada();
-- o acervo (0205): as oito
alter table public.anotacoes alter column empresa_id set default public.empresa_legada();
alter table public.ativos alter column empresa_id set default public.empresa_legada();
alter table public.colaboradores alter column empresa_id set default public.empresa_legada();
alter table public.itens alter column empresa_id set default public.empresa_legada();
alter table public.lancamentos_item alter column empresa_id set default public.empresa_legada();
alter table public.movimentacoes alter column empresa_id set default public.empresa_legada();
alter table public.pendencias_item alter column empresa_id set default public.empresa_legada();
alter table public.termos_gerados alter column empresa_id set default public.empresa_legada();
```

O arquivo inteiro também devolve as 17 funções ao corpo de antes da `0200` e a ferramenta de órfão antiga — só se for
desfazer a fase toda.

## 1.2 A conferência à mão, depois da contração (15 minutos, nada destrutivo)

Com a SUA conta, as operações do dia a dia — cada uma tem de funcionar como antes:
- **registrar uma movimentação** (Movimentações › Nova) de um ativo qualquer;
- **uma anotação na ficha** de um ativo;
- **um colaborador novo direto na movimentação** (o campo de colaborador, "cadastrar");
- **um lançamento de item** (Itens › Lançar);
- **gerar um termo** de uma movimentação recente;
- **a Auditoria** registrou o que é auditado (Administração › Auditoria, a linha da ação de hoje).

Se uma delas der "o registro ficou sem a empresa", o rollback do §1.1 (o lote da tabela dela), e me chame.

## 1.3 `/api/saude` e a Parte B

- `/api/saude` deve dizer `1.75.0` e o commit do merge (`16031e9`).
- No dia seguinte, a Parte B do `saude.yml` (agendada, ou à mão: `gh workflow run saude.yml -f alvo=producao -f
  partes=b`): a deriva SEM pendente (as migrations do ledger = as do repositório) e as 13 checagens IGUAIS aos números
  travados (`arquivo_termo_orfao` 3, `backup_orfao` 12, `conflito_entre_filiais` 59, `detentor_em_estado_sem_dono` 1, as
  outras 0). A Parte B continua vermelha pelos dois achados do #84 (memória): compare com a execução agendada anterior.

## 1.4 O `git diff v1.74.0 v1.75.0 --stat` — o que deve e o que não deve aparecer

**Deve:** `supabase/migrations/0200`–`0207` e o lock; `supabase/rollback/F67C-desfaz.sql`; `supabase/tests/` (35 roteiros
adaptados, `escrita_por_empresa.sql` e `f67c_rollback.sql` novos, `_asserts.sql`, `catalogo_policies.sql`, os rollbacks
F62–F67B); `src/lib/actions/**`, `src/lib/auditoria-registro.ts`, `src/lib/queries/**` (os leitores),
`src/lib/types/database.ts`, `src/lib/supabase/erros-do-banco.ts`, `src/lib/termos/persistir.ts`, as travas em
`src/lib/validators/`; `scripts/` (seed, carga, smoke, errata, medidor, prévia, `restaurar.mjs`, o injetor); `docs/`;
`package.json`, `CHANGELOG.md`, `registry.ts`.
**Não deve:** `.github/workflows/**`, o `CLAUDE.md` da raiz, nenhuma policy, nada de Storage, `package-lock.json`
(nenhuma dependência), a função `empresa_legada()`.

## 1.5 Lembretes

- O próximo prompt é o da **F68** (a porta pública por empresa — a senha de visualização hoje grava a empresa da operação).
- O diagnóstico do **#84** continua como entrega avulsa; o **seed com duas empresas** continua no backlog (16/11-4).

---

# 2. O que mudou, por arquivo e por quê

| arquivo | o quê | por quê |
|---|---|---|
| `0200_escrita_empresa_anotacoes.sql` | as cinco que anotam na ficha: `empresa_id` na lista, `empresa_da_filial(<filial do ativo>)` no valor | a anotação nasce na empresa do ativo (a FK composta `(empresa_id, ativo_id)` confere) |
| `0201_escrita_empresa_movimentacoes.sql` | `criar_compra_lote`, `devolver_ao_fornecedor`, `criar_movimentacao_com_itens`, `estornar_movimentacao_com_itens`, `movimentacao_abrir_pendencias_item` | ativo, movimentação, lançamento e pendência na empresa da filial da linha; o substituto, na do antigo |
| `0202_escrita_empresa_itens.sql` | `lancar_itens_lote`, `reabrir_pendencias_item_com_estornos`, `resolver_pendencias_item_com_lancamentos`, `transferir_item` | cada lançamento na empresa da sua filial (a transferência: origem e destino lidas uma vez) |
| `0203_escrita_empresa_import.sql` | `import_criar_ativos`, `import_lancar_movimentacoes` | o import de uma empresa que não é a WAP grava a empresa dela |
| `0204_escrita_empresa_registros.sql` | `import_gravar_trilha`; `registrar_limpeza_termos_sem_linha(uuid, …)` AO LADO da antiga | a trilha do import pela filial; a da ferramenta de órfão pela operação (decisão 3) |
| `0205`/`0206`/`0207_contracao_default_*.sql` | `drop default` nas 8, nas 11 (+ a assinatura antiga da ferramenta) e em `filiais` | o fim do default, por lote, depois do deploy |
| `supabase/rollback/F67C-desfaz.sql` | o rollback GERADO, 0207 → 0200 | o `set default` primeiro; idempotente nos dois estados |
| `supabase/tests/catalogo_policies.sql` | 15l e 15m novas; 15b/15c/15e invertidas | as travas da fase |
| `supabase/tests/_asserts.sql` | `pg_temp.sem_lista_de_escrita` | escrever não é ler (decisão 6) |
| `supabase/tests/escrita_por_empresa.sql` (novo) | E/S, R, N, X, M — 55 asserções | a escrita de uma segunda empresa nasce dela; o leitor (b) |
| `supabase/tests/f67c_rollback.sql` (novo) | rc1–rc11 | o ensaio do rollback, nos dois estados |
| 35 roteiros de `supabase/tests/` | 703 INSERTs com `empresa_id` (`public.empresa_legada()`) | sem o default, a fixture diz a empresa |
| `empresa_no_acervo.sql`, `empresa_no_vocabulario.sql`, `restauracao.sql`, `storage_por_empresa.sql`, `integridade_tenant.sql` | 1a invertidas; 7b pela régua nova; 5a/5b e `k_escritores`; 8a/8c; o bloco O com 4 argumentos; o L4 | as travas que provavam o default e as constantes que acompanham os corpos |
| `f62`…`f67b_rollback.sql` | `\ir ../rollback/F67C-desfaz.sql` antes do primeiro `F67B-desfaz` | o encadeamento |
| `src/lib/types/database.ts` | `empresa_id` obrigatório no `Insert` das 20; a sobrecarga nova da ferramenta | o tipo é a trava do app |
| `src/lib/actions/**`, `src/lib/termos/persistir.ts`, `src/lib/auditoria-registro.ts` | os 17 escritores e as 15 chamadas da trilha | a fonte da empresa de cada um (PLAN §2.2/§2.3) |
| `src/lib/queries/{relatorios/comum,colaboradores,vocabulario-import}.ts` e as actions dos leitores | `.eq('empresa_id', …)` | os leitores por chave natural (PLAN §3) |
| `src/lib/supabase/erros-do-banco.ts` | a frase do `23502` em `empresa_id` | decisão 18 |
| `src/lib/validators/{escrita-com-empresa,empresa-obrigatoria-no-insert,rollback-f67c}.test.ts` (novos), `empresa-acervo-sem-leitura.test.ts`, `empresa-legada-catraca.test.ts` | as travas de mesa | a varredura de escrita, o tipo, o rollback, a régua, a catraca |
| `scripts/seed.ts`, `scripts/import/carga.ts`, `scripts/smoke/{persona,fixtures-passe2,import-ensaio}.ts`, `scripts/manutencao/gerar-errata-truncamento.ts`, `scripts/perf/medir-itens.mjs` | a empresa em cada INSERT | decisão 19 |
| `scripts/db/restaurar.mjs` (+ `restaurar-guarda.test.mts`) | a empresa da filial da linha no destino | decisão 11 |
| `scripts/db/mutacoes.mjs` (+ `mutacoes.test.mts`) | quatro mutações novas, duas reescritas; teto 188 | decisão 17 |

# 3. Os números MEDIDOS × a ficha

Os 32 fatos estão remedidos no [`PLAN-F67C.md` §1](PLAN-F67C.md); as divergências (⚠), cada uma explicada lá:
- **7** — a 15c cobre só `filiais`; a derivada que pega tabela FUTURA é a 15l (nova).
- **8** — sem default, omitir a empresa nem sempre é `23502`: os gatilhos BEFORE rodam antes do NOT NULL — o termo com ids
  dá `23503` (`termo_da_empresa`) e o kit com motivo também; como `authenticated`, a policy de INSERT recusa antes (42501).
- **11** — 18 funções e **29** INSERTs; o lote 1 tem 16, não 15.
- **15** — a lista do L4 está escrita duas vezes; `k_escritores` não é só de `eventos_admin`.
- **17** — `empresa_da_filial` é revogada de `service_role`: a empresa ALVO da trilha se resolve na action, com a sessão.
- **20** — 16 INSERTs nos scripts **+ 3** no medidor da F60 (o fato dizia "perf é leitura").
- **25** — a RPC do import não lê o vocabulário (só o TS); com duas empresas visíveis o import ficaria indisponível sem o
  recorte (c).
- **26** — **703** INSERTs (não 705: dois eram texto de `position()`); 622 · 59 · 22.
- **28** — a Skew Protection MEDIDA ligada; o teto não legível → 12 h.

# 4. As decisões

**As do Johnny:** (16/11-3) uma run, em lotes por família, o default por último em cada lote, depois do deploy; (16/11-4) o
seed só passa a dizer a empresa de hoje — as duas empresas ficam no backlog.

**As vinte da fase** ([`PLAN-F67C.md` §5](PLAN-F67C.md)): (1) a empresa vem do PAI; (2) as 18 pela ponte única, mesma
assinatura; (3) a ferramenta de órfão com a assinatura nova ao lado; (4) o tipo como trava (`empresa_id` obrigatório no
`Insert`); (5) a varredura TS de escrita; (6) a régua muda de natureza — escrever não é ler; (7) a varredura SQL de escrita,
disco e catálogo; (8) os leitores (a)–(d); (9) lotes, fronteira e ordem; (10) os 703 INSERTs dos roteiros com a empresa
explícita; (11) o `restaurar.mjs`; (12) a janela por forma, com a Skew Protection; (13) a vigília pelos logs; (14) a prova
viva no ensaio; (15) "nada muda para a WAP"; (16) o rollback gerado; (17) o injetor; (18) a frase do `23502`; (19) os
scripts; (20) a trilha.

# 5. As tabelas-verdade

Escritores ([§2](PLAN-F67C.md)), leitores ([§3](PLAN-F67C.md)) e travas ([§4](PLAN-F67C.md)) — sem linha sem destino. A
fonte da empresa de cada escritor: as funções SQL pela filial da linha (`empresa_da_filial`); o app pela filial
(`empresaDaFilial`, com a sessão) ou pela operação (`empresaDaOperacao()`, a legada explícita — destino F70); a trilha pela
empresa ALVO; os scripts pela filial (seed, carga, errata, restaurar) ou pela legada explícita (persona do smoke).

# 6. Os roteiros

| | antes (CI da F67B) | depois (CI `1ea59f33`) |
|---|---|---|
| roteiros | 63 | **65** (+ `escrita_por_empresa`, `f67c_rollback`) |
| asserções | 1.299 | **1.368** (+55 `escrita_por_empresa`, +11 `f67c_rollback`, +2 15l/15m, +1 `restauracao` 8c) |
| os 35 adaptados | 986 | **987** — só `restauracao` 19 → 20 (a 8c nova, declarada); cada um dos outros 34 com o MESMO número |
| INSERTs nas 20 sem `empresa_id` nos roteiros | 703 | **0** |

Asserções que mudaram DE PROPÓSITO (as travas invertidas — não são adaptação de fixture): 15b, 15c, 15e;
`empresa_no_acervo` 1a; `empresa_no_vocabulario` 1a e 5b; `restauracao` 8a (agora numa filial da B).

# 7. O apply, etapa a etapa

## 7.1 O ensaio (`sgmvldiizsrjbxzzpmhh`, PG 17.11) — a cadeia inteira

O "antes" refeito ([`ensaio-antes-refeito.txt`](f67c-evidencias/G-apply/ensaio-antes-refeito.txt)) = o "antes" das 17:03. A
expansão lote a lote, com a exatidão depois de CADA um — o md5 do corpo de cada função = o do arquivo; as outras funções
= o md5 esperado do `funcoes.tsv` do "antes" sem elas; as 62 policies iguais
([`ensaio-expansao.txt`](f67c-evidencias/G-apply/ensaio-expansao.txt)): 5/5, 10/10, 14/14, 18/18; a ACL das 17
recriadas igual; a assinatura nova da ferramenta com o comentário e a ACL do arquivo. A sabotagem H (§10) no estado de
expansão. A contração (`0205`–`0207`): 22/22 colunas sem default, 0 dependentes de `empresa_legada()`, a assinatura antiga
fora, as 99 funções intocadas com o md5 esperado ([`ensaio-contracao.txt`](f67c-evidencias/G-apply/ensaio-contracao.txt)).
**A prova viva** (um bloco que termina em `raise`): **20/20 recusados sem a empresa (`23502`), 20/20 aceitos com ela**, na
3ª rodada — as duas primeiras acusaram defeitos do ROTEIRO (uma transição inválida, uma tabela sem policy de INSERT, a
policy do termo), registrados. O conferidor: 248 pontos, 0 recusadas (o `itens.saldo-colaborador` não provado, o mesmo
da F65). Advisors: os mesmos do "antes".

## 7.2 Produção — a expansão, antes do merge

([`producao-expansao.txt`](f67c-evidencias/G-apply/producao-expansao.txt)) O "antes" refeito = a linha travada. A
expansão lote a lote com a MESMA exatidão: 5/5, 10/10, 14/14, 18/18; as outras 100 com o md5 esperado; a ACL das 17
igual; as policies iguais. Depois: **o smoke 109 OK · 0 falha** (o aviso de sempre: nenhum kit cadastrado); **o
conferidor 272 pontos · 112.592 linhas · 0 recusadas · 0 reprovados**; as 13 checagens IGUAIS; 0 fora da legada; advisors
39 + a assinatura nova (declarado); a **paridade** — as 99 funções intocadas e as 18 da fase com o MESMO md5 nos dois
bancos; o delta declarado é só a contração.

## 7.3 O merge e o deploy

O PR #99 saiu do rascunho com os dois checks verdes no `1ea59f33` e foi mergeado às 22:02:38Z (`16031e9c`, merge normal).
`/api/saude` às 22:03:32Z: `1.75.0` · `16031e9` · banco ok. O smoke pós-deploy: **109 OK · 0 falha**
([`H-janela/smoke-pos-deploy.txt`](f67c-evidencias/H-janela/smoke-pos-deploy.txt)).

## 7.4 A janela por forma

**T0** às 19:03:45 de 16/11 ([`H-janela/T0.txt`](f67c-evidencias/H-janela/T0.txt)): nenhuma forma COM `empresa_id` ainda
(o app novo não escreveu); 18 linhas (tabela, papel) com formas SEM. **A prova estática**: a árvore no ar = a do SHA
congelado (`git diff 1ea59f33 16031e9c` vazio), com as varreduras de escrita, o tipo e o CI verdes. **A Skew Protection**:
LIGADA, teto 12 h → T1 ≥ 07:04 de 17/11. *(T1 e a condição: a preencher.)*

## 7.5 Produção — a contração

*(A preencher depois do T1.)*

# 8. O conferidor e o smoke

| | ensaio | produção |
|---|---|---|
| conferidor | 248 pontos · 88.182 linhas · 0 recusadas · 1 não provado (sem colaborador no ensaio) | 272 pontos · 112.592 linhas · **0 recusadas · 0 reprovados** (depois da expansão) |
| smoke | — | 109 OK · 1 aviso · **0 falha** (depois da expansão e depois do deploy) |

# 9. As 13 checagens

Produção: antes (17:00), depois da expansão e depois do deploy — **iguais à linha travada**: `arquivo_termo_orfao` 3 ·
`backup_orfao` 12 · `conflito_entre_filiais` 59 · `detentor_em_estado_sem_dono` 1 · as outras nove 0. Ensaio:
`operador_sem_filial` 1, as outras doze 0 — antes e depois da contração.

# 10. As sabotagens

[`sabotagens/A-J-sabotagens.md`](f67c-evidencias/sabotagens/A-J-sabotagens.md), com a saída real de cada uma: A (o default
de volta — 15b, 15c, 15e, 15l pelo nome), B (a função que esquece — 15m pelo nome e o `23502` no roteiro do ramo), C (o
`tsc`, o `?` no `Insert`, o `.insert(variavel)`), D (a empresa de quem chama — E11–E13; o colaborador inline), E (o `update
motivos` alcança as duas), F (o `restaurar.mjs` sem a empresa — 12 casos), G (a leitura nova acusada — a régua não
afrouxou), H (no ensaio: a forma SEM vai de 0 a 1; sem a sabotagem, Δ 0), I (a trilha sem a empresa — `tsc` e o teste; a
causa nomeada sem `details`), J (o rollback nos dois estados; os F62–F67B idênticos com a F67C no lugar).

# 11. A revisão adversarial

[`F-revisao/revisao-adversarial.md`](f67c-evidencias/F-revisao/revisao-adversarial.md) — cinco lentes, um cético por lente,
lendo `76676211` pelo git: **9 achados, 0 mantidos, 9 refutados** — limites das varreduras estáticas (MERGE, alvo entre
aspas, `INSERT … (SELECT …)`, `.from()` em variável, tabela dinâmica) que o NOT NULL, o tipo ou a guarda do SQL gerado
cobrem em execução; um `try/catch` ausente que só degrada a mensagem; o 2º ramo do `f62_rollback`. Declarados aqui.

# 12. O CI

- Run `43959941283` (`76676211`): `verificar` verde; `banco-sem-docker` vermelho SÓ no rc5/rc8 do `f67c_rollback` — a
  impressão das policies com `polroles::text` (oids diferentes entre bancos); o L4 emulado bateu de primeira.
- Run `43960598691` (`1ea59f33`, o SHA congelado): **VERDE nos dois jobs** — 65 roteiros, 1.368 asserções, nenhum ✗;
  `db:types:diff` VERDE; o injetor **188/188** "detectadas pelo cenário nomeado", controle verde
  ([`C-ci/ci-1ea59f33.txt`](f67c-evidencias/C-ci/ci-1ea59f33.txt)).
- A mesa PGlite: 65 roteiros, 0 problema real ([`C-ci/mesa-roteiros-0207.txt`](f67c-evidencias/C-ci/mesa-roteiros-0207.txt));
  o injetor 188/188 ([`E-mutacoes/mesa-188-de-188.txt`](f67c-evidencias/E-mutacoes/mesa-188-de-188.txt)).

# 13. A contagem final

| | antes (v1.74.0) | depois (v1.75.0) |
|---|---|---|
| testes (arquivos · casos) | 274 · 8.775 | **281 · 8.965** |
| roteiros · asserções | 63 · 1.299 | **65 · 1.368** |
| injetor (teto) | 184 | **188** |
| funções de `public` | 117 | 117 (ensaio contraído; produção 118 até a `0206`) |
| policies | 62 (`cee318f5…`) | 62 (`cee318f5…`) |
| colunas `empresa_id` com default | 20 | **0** no ensaio · 20 em produção até a contração |

# 14. Os 25 critérios, autoverificados

*(A fechar depois da contração em produção.)*

# 15. O estado de repouso

*(A fechar depois da contração em produção.)* Se o projeto parar ANTES da contração em produção: produção fica na
expansão — as 18 funções e o app dizem a empresa, e o default continua lá, cobrindo um escritor esquecido. Não há
pressa nem dívida: a contração é só o `apply` das três migrations, depois da condição do §1.0.

# 16. O que este relatório NÃO prova

- **Que cada escritor RARO funciona em produção depois do drop** (filial, motivo, tipo, kit, senha, apelido, vocabulário,
  errata): provado pelo tipo, pelas varreduras e pelo CI; na janela, Δ 0 por ausência.
- **Que uma empresa que não é a WAP escreve em produção** — os bancos vivos têm uma empresa só; provado no CI
  (`escrita_por_empresa.sql`) e, no ensaio, pela prova viva com a empresa legada.
- **Que o import de uma empresa nova funciona de ponta a ponta** — o vocabulário inicial dela é da F70.
- **Que as varreduras estáticas pegam toda forma de escrita** — MERGE, alvo entre aspas, `INSERT … (SELECT …)`
  posicional, `.from()` em variável e tabela dinâmica escapam delas (a revisão adversarial); quem pega em execução é o
  NOT NULL (sem o default), o tipo e a guarda do SQL gerado.
- **Nada sobre os dados do #84.**

# 17. Pendências e backlog nomeado

- **F68**: a senha de visualização por empresa (aqui ela grava a da operação).
- **F70**: cada `empresaDaOperacao()` desta fase vira a empresa da SESSÃO; o vocabulário inicial de uma empresa nova; a
  view `v_colaboradores_textos` por empresa.
- **F71**: as frases do `CLAUDE.md` da raiz que esta fase deixou velhas (o "default" do modelo de acesso).
- **O seed com duas empresas** (16/11-4).
- **O diagnóstico do #84** (entrega avulsa); **os 3 `.docx` sem linha** (decisão do Johnny).
- **Backlog** (das fases anteriores, sem mudança): o conta a conta com as memberships desativadas; os caminhos sem `.max()`
  e os pares de tetos da F66B; `movimentacoes.itens_faltantes`; o `savepoint` por linha na RPC do import; a paginação
  keyset; derrubar `profiles.papel`/`ativo`; o WARN `multiple_permissive_policies` de `pendencias_item`; a retenção dos
  backups antigos; o `try/catch` em volta de `empresaDaFilial` nas actions do import (a revisão: só a mensagem).

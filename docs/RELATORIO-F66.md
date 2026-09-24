# Relatório F66 — as policies ganham o recorte, em conjunção

**v1.71.0 no ar** (`/api/saude`: `1.71.0` · `fbcd14b`, 24/09/2026 17:37 UTC) · migrations `0175`–`0179` **aplicadas no ensaio e em produção** em 24/09/2026 (ensaio 13:27–13:36, produção
13:47–14:01, horas de Brasília), com as provas (§6) · SHA de código congelado **`31b9a16`** · código no
[PR #79](https://github.com/vmatusita/ti-wap-inventory-control/pull/79), merge `fbcd14b` · CI do SHA congelado: run `36026526435` (52
roteiros, 1.123 asserções, 0 ✗; injetor 151/151; `db:types:diff` verde) · a conferência pós-deploy verde (§14) · este
fecho no PR de documentação, com a tag `v1.71.0` no merge dele.

> A quinta fase da virada multiempresa. Com a chave de recorte já estrutural (F62–F65), as **51 policies de `public`
> cuja tabela tem `empresa_id`** ganham, por `alter policy` LITERAL e em **conjunção** com o piso de hoje (intacto), o
> termo `empresa_id = any (array (select public.<função de conjunto>()))` com a função da **classe** da policy — a
> leitura pelo piso lê `empresas_do_membro()`, a escrita por `pode_escrever()` e a do termo leem `empresas_de_escrita()`,
> tudo o que é de cargo lê `empresas_de_admin()`. As **6 de escrita por unidade** trocam `pode_escrever_filial(filial_id)`
> pela forma de **pares** sobre `unidades_de_escrita()` (as 6 saem das exceções da doutrina: 18 → 12). As duas `rel_*`
> juntam `motivos` pelo par `(empresa_id, codigo)`. `profiles` ×2 e o backup `_bkp_relatorios_gerados_f6a` ficam como
> exceção nominal. **Nenhum índice** entra nem sai (a medição mostrou que o plano não os usaria sob o `= any`).
>
> Com uma empresa só, tudo isso é **inerte por construção** — e foi provado conta a conta: 0 divergência de leitura e de
> escrita, antes (emulada) e depois de cada lote (real), nos dois bancos (em produção: 14 memberships, 21 tabelas, 84
> pares conta × filial). Nenhuma tupla reescrita; o texto de cada policy igual ao do oráculo da mesa depois de cada lote;
> nenhum gatilho de rollback disparou.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você, e por quê

## 1.1 O que ficou com você — nada bloqueante

A fase está no ar e conferida: o apply provado nos dois bancos (§6), o merge, o deploy e a conferência pós-deploy (§14).
Para você: a conferência à mão do §1.3, só leitura. Nenhuma decisão sua pendente; nenhum rollback foi necessário; o classificador de segurança não barrou
nada.

## 1.2 O apply (o registro)

- **Ensaio** (`sgmvldiizsrjbxzzpmhh`), 13:27–13:36: a sonda e a prova conta a conta EMULADA refeitas logo antes; as cinco
  migrations, uma por chamada do `apply_migration` do MCP, com o texto EXATO do arquivo, todas na primeira tentativa; a
  sonda e a prova conta a conta REAL depois de cada lote; a equivalência das `rel_*` antes e depois da `0179`.
- **Produção** (`pbtjcalbmepmrqzprusb`), 13:47–14:01 — 2 h 40 min depois do commit das migrations (`2e3b17b`, 11:09),
  dentro das 24 h: a linha de base de TTFB do MESMO dia imediatamente antes, depois a mesma sequência do ensaio.
- **Depois do último apply**, antes do merge: advisors, EXPLAIN das listas, `medir-rls` e TTFB "depois", conferidor de
  formas, smoke, paridade das 11 classes, tipos do MCP e, por último, o `notify pgrst` nos dois bancos (ata (m)).

## 1.3 Depois do deploy (10 minutos, só leitura)

1. **Entre com a sua conta** e confira que tudo está como sempre:
   - a lista de ativos, a ficha de um ativo, as movimentações, os itens e o histórico de lançamentos;
   - registrar uma movimentação e um lançamento de item (a escrita por unidade — agora pela forma de pares);
   - a Administração (filiais, tipos, motivos, kits, apelidos) e a Auditoria;
   - um relatório por motivo e o resumo;
   - com duas abas abertas, registrar uma movimentação numa e ver a outra atualizar (o Realtime com o termo novo — a
     policy de SELECT do assinante decide cada evento).
2. **`/api/saude`** com `1.71.0` e a **Parte B do `saude.yml`** verde no dia seguinte, sem issue de alarme aberta.
3. **O diff da fase**: `git diff v1.70.0 v1.71.0 --stat`.
   - **Tem de aparecer:** `supabase/migrations/0175`…`0179`, `supabase/migrations.lock.json`,
     `supabase/rollback/F66-desfaz.sql`, `supabase/tests/**` (novo `f66_rollback.sql`; emendados os listados no §2),
     `scripts/db/mutacoes.mjs` e `mutacoes.test.mts`, `scripts/db/predicado-policies.test.mts`, `scripts/perf/**`
     (`conta-a-conta.mjs` novo, `medir-rls.mjs`, `equivalencia-rel.mjs` e os testes), os testes de mesa em
     `src/lib/validators/` e `src/lib/itens/`, `registry.ts`, `package.json`, `CHANGELOG.md`, `docs/**`.
   - **Não pode aparecer:** `src/lib/queries/**`, `src/lib/actions/**`, `src/components/**`, `src/app/**`,
     `src/lib/types/database.ts`, `scripts/seed.ts`, `scripts/import/**`, `scripts/reset.ts`, `scripts/db/restaurar.mjs`,
     migration antiga alterada, `.github/workflows/**`, o `CLAUDE.md` da raiz, `package-lock.json`, `.env*`.
4. **Os lembretes:** o CHECK de comprimento é a **F66B** (a ficha está escrita); a ponte de `papel_atual()` e a escrita
   por empresa são a **F67**; `profiles` é a **F69**; o piso só cai na **F72**.

```bash
git diff v1.70.0 v1.71.0 --stat
```

---

# 2. O que mudou, por arquivo e por quê

| arquivo | o quê | por quê |
|---|---|---|
| `supabase/migrations/0175_recorte_policies_cadastros_do_acervo.sql` | 13 policies (`colaboradores`, `itens`, `termos_gerados`, `anotacoes`), na ordem de lock da 0160 | lote 1, parte 1 (decisão 1); o piso por extenso, o termo da classe |
| `supabase/migrations/0176_recorte_policies_movimento_do_acervo.sql` | 10 policies (`ativos`, `movimentacoes`, `pendencias_item`, `lancamentos_item`), as 6 de unidade na forma de pares; em `movimentacoes / operador insere`, o segundo par pelo snapshot | lote 1, parte 2 (decisões 1 e 3; decisão 2 do Johnny) |
| `supabase/migrations/0177_recorte_policies_vocabulario.sql` | 21 policies (as quatro do import, `tipos_item`, `motivos`, `kits_modelos`, `filiais`) | lote 2 |
| `supabase/migrations/0178_recorte_policies_registros_e_vinculos.sql` | 7 policies (`membros`, `operador_filiais`, `relatorios_gerados`, `import_logs`, `eventos_admin`) | lote 3; `eventos_admin` só na leitura (decisão 3 do Johnny) |
| `supabase/migrations/0179_rel_motivo_por_empresa.sql` | as duas `rel_*` com `and mo.empresa_id = m.empresa_id` no join, o resto byte a byte | decisão 9: sem o par, o membro de duas empresas veria o relatório duplicado |
| `supabase/migrations.lock.json` | as cinco travadas | a trava de hash |
| `supabase/rollback/F66-desfaz.sql` | `0179` → `0175`: as duas `rel_*` com o corpo da 0143 e as 51 policies com o texto de antes, gerado pelo replay da mesa | decisão 13; ensaiado no CI até o "antes" dos bancos vivos |
| `supabase/tests/catalogo_policies.sql` | o bloco 6 (16a–16g) lendo a ÁRVORE da policy com assinatura por nó: a forma do termo, a classe (`k_recorte_classe`), os pares com o SEGUNDO membro conferido, `to authenticated` em `public` e Storage, as exceções nominais (`k_recorte_excecoes`), a guarda com árvores sintéticas; `k_excecoes_predicado` 18 → 12; o 15g e o 7a saem (diziam o contrário); `k_leitura_tenant` ganha as `rel_*` | as travas da forma (decisão 5), nascidas vermelhas no push 1 |
| `supabase/tests/isolamento_tenant.sql` | 10a–10j (a leitura na direção A com as policies reais; a direção B com o piso neutralizado numa subtransação desfeita; o membro das duas; a escrita cruzada por classe — com o membro das duas tentando cada uma —; as `rel_*` sem duplicar) e 11a–11d (os pares: operador, admin, filial desativada, filial da B, o snapshot; a equivalência com `pode_escrever_filial` sobre as fixtures) | a prova de comportamento (decisões 6 e 7) |
| `supabase/tests/f66_rollback.sql` (novo) | rb0–rb5: o que a F66 pôs existe; o rollback devolve as policies e as `rel_*` ao md5 medido nos bancos vivos antes do apply | a sabotagem K |
| `f62_rollback.sql`, `f63_rollback.sql`, `f64_rollback.sql`, `f65_rollback.sql` | rodam o `F66-desfaz.sql` antes | fato 27: a policy depende da coluna |
| `empresa_no_acervo.sql`, `empresa_no_vocabulario.sql` | as auto-sabotagens 7d/6b contam só a METADE da função (a policy agora cita a coluna) | fato 12 — nenhuma asserção mudou para passar |
| `integridade_tenant.sql` | a `L4` exclui as duas `rel_*` que a 0179 recria (a constante nova medida no CI) | ata (d) |
| `scripts/db/mutacoes.mjs`, `mutacoes.test.mts` | oito mutações F66; as duas `*-sem-coluna` devolvem as policies da tabela ao texto sem a coluna antes do `drop`; a da catraca prova com a exceção permanente de `lancamentos_item`; teto 143 → 151 | decisão 12; ata (f) e (j) |
| `scripts/db/predicado-policies.test.mts` | o caso do snapshot (`->>` + `::smallint`) na mesa | fato 11 |
| `scripts/perf/conta-a-conta.mjs` (novo) e o teste | a prova conta a conta (emulada/real), o analisador e o invólucro do canal MCP para os três instrumentos | decisões 10 e 14; ata (a) |
| `scripts/perf/medir-rls.mjs` e o teste | a forma F4 (a conjunção da F66) e o modo `listas` (o EXPLAIN das cinco listas) | decisões 8 e 11; ata (g) |
| `scripts/perf/equivalencia-rel.mjs`, `instrumentos-f66.test.mts` | o modo `mesmo-nome`; a guarda de lista FECHADA de funções e configurações; `--ref` em todo `gerar-*` | decisão 9; revisão adversarial (2)–(4) |
| `src/lib/validators/catalogos-seguranca.test.ts`, `policies-initplan.test.ts`, `empresa-acervo-sem-leitura.test.ts`, `rollback-f66.test.ts` (novo); `src/lib/itens/migrations-f38.test.ts` | as travas TS invertidas (a policy TEM de ler `empresa_id`); o 10g e seu universo; o rollback cláusula a cláusula; `DA_F38` e `RECRIACOES_AUTORIZADAS['0179']` | fato 12; decisão 13 |
| `docs/**` | PLAN-F66, a ata, MATRIZ (R-ACC-108 a 116), ADR-001, ADR-002 §16, ARQUITETURA §4, RUNBOOK (Anexo F66), PLANO-MULTIEMPRESA (nota F66, **a ficha F66B**, notas F67/F70/F72), INVENTARIO-LEITURAS, PLAN-F60 §0 (a linha do instrumento), índices, evidências, este relatório | Frente F e o fecho |
| `package.json`, `CHANGELOG.md`, `src/lib/versoes/registry.ts` | `1.71.0` | regra 8 |

Nenhum arquivo de `src/lib/queries/**`, `src/lib/actions/**`, `src/app/**` ou `src/components/**` mudou: a fase não
toca o código que o app executa (fora o registro de versões). `database.ts` não mudou (nenhuma coluna, tipo ou assinatura).

---

# 3. Os números MEDIDOS, lado a lado com a ficha e a ordem

Os 28 fatos foram remedidos contra o disco, o git e os dois bancos (`PLAN-F66.md` §1). **As doze divergências que a
ordem já trazia**, com o que foi medido:

| # | a ficha dizia | medido / feito |
|---|---|---|
| 1 | migrations a partir da `0156` | **`0175`** (fato 1: a última era a `0174`) |
| 2 | pôr as policies em `to authenticated` | **as 62 já eram** (fato 4) — faltava só a TRAVA (16f), que agora confere `public` e Storage |
| 3 | 54 policies recebem o recorte | **51**: as três sem a coluna ficam — `profiles` ×2 (**F69**) e `_bkp_relatorios_gerados_f6a` (**permanente**), exceção nominal numa fonte só, conferida nos dois sentidos |
| 4 | a leitura da B provada pelas policies reais | a ponte de `papel_atual()` só olha a empresa legada (fato 7): a **direção B** é provada com o piso NEUTRALIZADO numa subtransação desfeita (emula a F72), o termo real de cada policy |
| 5 | trocar `pode_escrever_filial` | as **6 exceções** saem de `k_excecoes_predicado` no MESMO commit da `0176` (18 → 12, a catraca 11b exige); nenhuma DDL de policy dinâmica (fato 10) |
| 6 | cinco travas dizem "nenhuma policy cita `empresa_id`" | **sete** (fato 12): as cinco e as auto-sabotagens 7d/6b — todas invertidas ou ajustadas à metade da função, nenhuma tautológica |
| 7 | índices de lista liderados por `empresa_id` | o índice mais usado (`movimentacoes_data_ordem_idx`, 42.170 scans) estava fora da lista da ficha, e o PG 17 não tem skip scan (fato 14); a medição (§7) decidiu **nenhum** |
| 8 | o join por código das `rel_*` duplica | para quem é de UMA empresa, a RLS de `motivos` já esconde o motivo da outra; a duplicata sobraria para o membro das duas — o par entra (fato 16; o 10i/10j provam) |
| 9 | comparar com a linha de base de outro dia | o ruído entre dias é de 3,5% a 18% (fato 22): a régua é a do **mesmo dia**, imediatamente antes do apply de produção |
| 10 | `isolamento_tenant.sql` verde entre os lotes | no CI a cadeia roda inteira; ENTRE os lotes, nos bancos vivos, a prova conta a conta real (decisão 1) |
| 11 | o rollback da F66 sozinho | a policy DEPENDE da coluna (fato 27): os rollbacks F62–F65 rodam o da F66 antes (medido na mesa: sem ele, morrem em "cannot drop column empresa_id … other objects depend on it") |
| 12 | a ficha F66 | as três decisões do Johnny (24/09): o CHECK de comprimento na **F66B**; a troca pelos pares provada **conta a conta em produção**; `eventos_admin` só recortada na leitura |

**E as que a remedição achou** (`PLAN-F66.md` §1, `⚠`): o `equivalencia-rel.mjs` não servia como estava (mapeava para a
função VELHA de outro nome — ganhou o modo `mesmo-nome`) e as `rel_*` não são intocáveis (a autorização de recriação
entrou mesmo assim, exaustiva — fato 16); mais três leitores candidatos na releitura do inventário (fato 19); o jsonb de
`eventos_admin` medido pelo que o disco guarda — a maior linha 4.946 bytes, a soma 110.769 (fato 20); 79 `.max()` do Zod
em 16 arquivos, não 80 (fato 21); a documentação do PG 17 é muda sobre o lock de `ALTER POLICY` — o fonte diz `ACCESS
EXCLUSIVE` (fato 23); o classificador não detecta `concurrently` (fato 24); a sonda de paridade do RUNBOOK tem 10 classes,
a executável 11 (fato 25); no ensaio, 11 `unused_index` e nenhum operador com vínculo (fatos 3 e 8).

**O que esta fase acrescentou à ficha:** a tabela-verdade classe → função (§5); a prova conta a conta, leitura e escrita
(§6); a releitura do inventário de leituras (`PLAN-F66.md` §4); a trava de `to authenticated` (16f); o censo de
consumidores antes de qualquer `drop index` (§7); os rollbacks encadeados; a ficha da **F66B**.

---

# 4. As decisões

As três do Johnny e as quinze da fase estão na ata ([`DECISOES.md`](DECISOES.md), 2026-09-24 · F66) e no
[`PLAN-F66.md`](PLAN-F66.md) §5; as da execução, na ata, letras (a) a (n). Em uma linha cada: cinco migrations, quatro lotes
de policy por família (o `alter policy` toma `ACCESS EXCLUSIVE`); a classe sai do piso (`k_recorte_classe`); a forma de
pares com o snapshot no segundo par; `alter policy` literal com o piso por extenso; a trava lê a árvore, não o texto;
quem lê `empresa_id` é a policy (a função só por exceção nominal); a direção B emula a F72; nenhum índice; as `rel_*` pelo
par; a prova conta a conta; a régua do mesmo dia; oito mutações (teto 151); o rollback antes dos da F65–F62; o instrumento
antes/depois com o invólucro do canal; a releitura das 102 leituras. Na execução: o canal MCP (a); o rollback conferido
contra uma régua independente (b) e gerado pelo replay (c); a constante da L4 (d); o modo `mesmo-nome` (e); a catraca com a
exceção permanente (f); o modo `listas` (g); um erro de tipo corrigido antes do push (h); o furo da própria bateria achado
pela sabotagem E (i); a revisão adversarial (j); o apply (k); as provas (l); o `notify pgrst` no fim (m); a régua de 15%
no p95 (n).

---

# 5. A tabela-verdade das 54 policies

A classe de hoje sai do piso que a policy cita; a função do recorte é a da classe (a fonte única é `k_recorte_classe`,
que a 16a confere pela árvore). A tabela inteira, com o texto de hoje e o texto-alvo literal de cada uma, está no
`PLAN-F66.md` §2 (gerada por script). Por tabela:

| tabela | migration | policy (comando) → função do recorte |
|---|---|---|
| `anotacoes` | 0175 | leitura operador (SELECT) → `empresas_do_membro` · operador anota (INSERT) → `empresas_de_escrita` |
| `ativos` | 0176 | leitura operador (SELECT) → `empresas_do_membro` · operador atualiza (UPDATE, **pares**) → `empresas_de_escrita` · operador insere (INSERT, **pares**) → `empresas_de_escrita` |
| `colaboradores` | 0175 | admin atualiza colaborador (UPDATE) → `empresas_de_admin` · escrita cria colaborador (INSERT) → `empresas_de_escrita` · leitura operador (SELECT) → `empresas_do_membro` |
| `eventos_admin` | 0178 | admin le auditoria (SELECT) → `empresas_de_admin` |
| `filiais` | 0177 | admin apaga (DELETE) → `empresas_de_admin` · admin atualiza (UPDATE) → `empresas_de_admin` · admin insere (INSERT) → `empresas_de_admin` · leitura operador (SELECT) → `empresas_do_membro` |
| `import_logs` | 0178 | leitura operador (SELECT) → `empresas_de_admin` (o piso é `e_admin()` — o nome engana) · operador insere (INSERT) → `empresas_de_admin` |
| `import_prefixos_patrimonio` | 0177 | leitura operador (SELECT) → `empresas_do_membro` |
| `import_termos_categoria` | 0177 | leitura operador (SELECT) → `empresas_do_membro` |
| `import_termos_estado` | 0177 | leitura operador (SELECT) → `empresas_do_membro` |
| `itens` | 0175 | admin apaga (DELETE) → `empresas_de_admin` · admin atualiza (UPDATE) → `empresas_de_admin` · escrita cria item (INSERT) → `empresas_de_escrita` · leitura operador (SELECT) → `empresas_do_membro` |
| `kits_modelos` | 0177 | admin apaga (DELETE) → `empresas_de_admin` · admin atualiza (UPDATE) → `empresas_de_admin` · admin insere (INSERT) → `empresas_de_admin` · leitura operador (SELECT) → `empresas_do_membro` |
| `lancamentos_item` | 0176 | leitura operador (SELECT) → `empresas_do_membro` · operador lanca (INSERT, **pares**; a coerência do estorno fica) → `empresas_de_escrita` |
| `membros` | 0178 | leitura operador (SELECT) → `empresas_do_membro` |
| `motivos` | 0177 | admin apaga (DELETE) → `empresas_de_admin` · admin atualiza (UPDATE) → `empresas_de_admin` · admin insere (INSERT) → `empresas_de_admin` · leitura operador (SELECT) → `empresas_do_membro` |
| `movimentacoes` | 0176 | leitura operador (SELECT) → `empresas_do_membro` · operador insere (INSERT, **dois pares**: a filial declarada e a do snapshot) → `empresas_de_escrita` |
| `operador_filiais` | 0178 | leitura operador (SELECT) → `empresas_do_membro` |
| `pendencias_item` | 0176 | admin reabre (UPDATE, `e_admin()` + **pares**) → `empresas_de_admin` · leitura operador (SELECT) → `empresas_do_membro` · operador resolve (UPDATE, **pares**) → `empresas_de_escrita` |
| `relatorios_gerados` | 0178 | leitura operador (SELECT) → `empresas_do_membro` · operador gera (INSERT) → `empresas_de_escrita` |
| `termos_gerados` | 0175 | leitura operador (SELECT) → `empresas_do_membro` · operador apaga / atualiza / insere (as exceções PERMANENTES do termo ficam) → `empresas_de_escrita` |
| `tipos_item` | 0177 | admin atualiza tipo (UPDATE) → `empresas_de_admin` · admin insere tipo (INSERT) → `empresas_de_admin` · leitura operador (SELECT) → `empresas_do_membro` |
| `unidades_apelidos` | 0177 | admin apaga apelido (DELETE) → `empresas_de_admin` · admin insere apelido (INSERT) → `empresas_de_admin` · leitura operador (SELECT) → `empresas_do_membro` |
| `profiles` | — | atualiza proprio perfil · leitura operador — **exceção nominal → F69** (identidade da conta) |
| `_bkp_relatorios_gerados_f6a` | — | dev le backup f6a — **exceção nominal, permanente** (backup congelado sem a coluna) |

Por classe: 19 leituras pelo piso · 2 leituras por cargo · 4 escritas por `pode_escrever()` · 17 escritas por cargo · 6
por unidade (5 + "admin reabre") · 3 do termo = **51**; mais as 3 exceções = **54**. A 22ª tabela com a coluna,
`senhas_acesso`, não tem policy (deny-all).

---

# 6. O apply e as provas, nos dois bancos

Em 24/09/2026, pelo `apply_migration` do MCP (uma migration por chamada, o texto EXATO do arquivo, cada uma UMA transação
com a linha do ledger; `lock_timeout` de 2 s por `set`/`reset`), ensaio primeiro. O detalhe: `f66-evidencias/depois/`
(`sondas-{ensaio,producao}.json`, uma rodada por lote), `conta-a-conta/`, `rel/`, `indices/`.

**O oráculo.** A mesa (PGlite, PostgreSQL 17.5, as migrations do repositório) reproduz byte a byte o texto de policy que
os bancos vivos devolvem para a mesma cadeia (o "antes" `886118ad…` bateu). Daí o md5 esperado das policies de `public`
depois de cada lote — e a prova de que o texto aplicado é o do arquivo.

| prova | ensaio | produção |
|---|---|---|
| as cinco (`0175`–`0179`) | 13:27–13:36, todas na 1ª tentativa | 13:47–14:01, todas na 1ª tentativa |
| policies de `public` depois de cada lote | `e55c75d0…` → `e7d55e81…` → `60f90a0f…` → `aa0db1b3…` = **o oráculo, nos quatro** | **idem** |
| `citam_empresa_id` / `pode_escrever_filial` / `unidades_de_escrita` | 0/6/0 → 13 → 23/0/6 → 44 → **51/0/6** | **idem** |
| `to authenticated` | 62 em todas as rodadas | 62 |
| Storage (8) e as 11 que não mudam | `f116b8d0…` · `eb294504…` em todas as rodadas | **idem** |
| `relfilenode` das 22 | `293d2945…` em **todas as rodadas** | `ba909922…` em **todas as rodadas** |
| índices | `42537da2…` em todas | **idem** |
| funções de fora da fase (`prosrc`) | `75d18f23…` em todas | **idem** |
| as `rel_*` depois da `0179` | `c8ecce6f…` · `ae0911e4…` = o oráculo; ACL, dono, `invoker`, `stable`, `search_path` iguais | **idem** |
| prova conta a conta EMULADA (refeita logo antes) | **0** · 3 memberships · 21 tabelas · 18 pares | **0** · 14 · 21 · 84 |
| prova conta a conta REAL depois de 0175 / 0176 / 0177 / 0178 | **0 / 0 / 0 / 0** (corrida 0) | **0 / 0 / 0 / 0** (corrida 0) |
| equivalência das `rel_*` antes e depois da `0179` | 0 célula em 168 × 2, nas duas rodadas (404 e 1.082 linhas) | 0 célula em 168 × 2 (524 e 1.182 linhas) |
| advisor de segurança | 6 INFO · 34 + 1 WARN — **idêntico ao antes** | **idêntico ao antes** |
| advisor de performance | 39 · 1 · 11 unused · 1 WARN · `auth_rls_initplan` 0 — **idêntico** | 39 · 1 · 8 unused (os mesmos nomes) · 1 WARN · 0 — **idêntico** |
| conferidor de formas | 247 pontos · 88.154 linhas · **0 recusadas** · 1 não provado (`itens.saldo-colaborador`: o ensaio não tem colaborador) | **271 pontos · 100.829 linhas · 0 recusadas · 0 reprovados** |
| smoke | — | **109 OK · 1 aviso · 0 falha** (o aviso antigo: não há kit cadastrado) |
| paridade ensaio × produção, 11 classes | **idêntica**, classe a classe, contagem e impressão (`depois/paridade-11-classes.json`) | |
| tipos (MCP) × `database.ts` | — | iguais fora os 42 comentários de hand-fix e as 2 linhas do hand-fix da F62 (a exceção conhecida) |

**A prova conta a conta, como ela é.** Para cada membership ativa (lida como o dono, dentro do banco — nenhum id sai),
com as claims dela na transação: a ESCRITA — `pode_escrever_filial(f)` × o par `(empresa_legada, f)` em
`unidades_de_escrita()`, para cada filial; `pode_escrever()` × `empresas_de_escrita()`; `e_admin()` × `empresas_de_admin()`;
e a LEITURA como `authenticated`, tabela a tabela das 21 com policy de SELECT: na fase emulada, a policy de hoje × a de hoje
∧ o termo (o mesmo statement); na real, a policy nova × o universo que o piso de hoje daria (tudo ou nada). O total de
cada tabela é relido no fim: tabela que mudou no meio é CORRIDA, não divergência (0 em todas as rodadas). A transação
nunca se confirma (`transaction_read_only` e `raise` no fim); só as CONTAGENS saem.

---

# 7. Os índices — o censo, a medição e o EXPLAIN depois

O censo (produção, `pg_stat_user_indexes`) e a medição de quatro cenários por lista (na mesa, com o volume de produção
fictício) estão no `PLAN-F66.md` §3. A conclusão: sob `empresa_id = any (…)` (o parâmetro de um `InitPlan`, não uma
igualdade) um índice liderado por `empresa_id` **não serve** `ORDER BY … LIMIT` sem Sort — o planner o ignora ou o usa
por Bitmap e ordena; e derrubar os de hoje põe Sort completo em 4 das 5 listas. **Nenhum índice criado, nenhum
derrubado** (os candidatos vão para a F70, que põe a empresa como IGUALDADE; nota na ficha). O critério 14 ("cada índice
criado ou derrubado com o EXPLAIN antes × depois") fica vazio por construção.

A confirmação nos bancos vivos, depois do apply (`indices/*-listas-depois.json`), como `authenticated` com a policy REAL:

| lista | ensaio: execução · buffers · nó | produção: execução · buffers · nó | subplanos |
|---|---|---|---|
| movimentações (`data desc, ordem desc`) | 0,42 ms · 15 · `movimentacoes_data_ordem_idx` | 1,23 ms · 38 · `movimentacoes_data_ordem_idx` | InitPlan 1 e 2, **1 loop** |
| ativos (`updated_at desc, id`) | 1,55 ms · 64 · Bitmap `ativos_empresa_id_uidx` + Sort | 2,80 ms · 124 · idem | **1 loop** |
| lançamentos (`created_at desc, id desc`) | 0,50 ms · 7 | 0,92 ms · 14 | **1 loop** |
| auditoria (`quando desc, id desc`) | 0,45 ms · 17 | 0,81 ms · 23 | **1 loop** |
| trilha do import (`created_at desc`) | 0,43 ms · 7 | 0,69 ms · 8 | **1 loop** |

Nenhuma lista lê bloco do disco (`read` 0). O advisor `unindexed_foreign_keys` não mudou (39 nos dois).

---

# 8. A medição — `medir-rls` e TTFB, antes × depois do mesmo dia, lado a lado com a F59

**`medir-rls.mjs`** (produção, identidade de nível administrador, N = 9, mediana em ms · buffers). F0 é a policy VIVA; F4
é a forma da F66 emulada por cima. Antes do apply, F4 é a F66 emulada; depois, F0 JÁ É a F66 — **F0-depois × F4-antes** é
a comparação (o instrumento o diz):

| tabela | F59 (16/09) F0 | F66 antes: F0 · F4 | F66 depois: F0 | leitura |
|---|---|---|---|---|
| `ativos` (1.649 linhas) | 1,62 · 108 | 1,38 · 110 — **2,06 · 124** | **2,12 · 124** | F0-depois ≈ F4-antes, os mesmos buffers |
| `movimentacoes` (3.638) | 1,92 · 284 | 2,43 · 286 — **3,63 · 271** | **3,16 · 271** | idem |

As duas funções de conjunto aparecem como `InitPlan` de **1 loop** em F0-depois; o controle negativo (sem identidade)
devolveu 0 linha; o piso está no plano em todas as formas.

**TTFB de produção** (`medir.mjs`, 19 rotas, 2 aquecimentos, N = 11, round-robin): a linha de base do MESMO dia,
imediatamente antes do apply (`f66-producao-ttfb-antes-do-apply.json`, 13:41) × o depois (14:08) — e, pela decisão 11, as
rotas acima de 15% no p95 medidas mais duas vezes (`-depois-2`, `-depois-3`):

| rota | mediana antes → depois | p95 antes | p95 depois · depois-2 · depois-3 |
|---|---|---|---|
| `/ativos` | 353,5 → 341,1 (−3,5%) | 495,0 | 457,5 · 568,9 · 521,5 |
| `/movimentacoes` | 359,0 → 350,4 (−2,4%) | 422,8 | 407,7 · 479,3 · 457,4 |
| `/movimentacoes/nova` | 301,1 → 320,1 (+6,3%) | 468,2 | **555,1 (+18,6%)** · 411,0 · 349,4 |
| `/itens` | 359,7 → 345,8 | 693,9 | 484,7 · 468,6 · 426,9 |
| `/pendencias` | 461,9 → 424,4 | 554,1 | 543,9 · 592,7 · 503,1 |
| `/ajuda` | 329,4 → 330,1 | 538,5 | **736,1 (+36,7%)** · 448,1 · 403,0 |
| `/admin/colaboradores` | 499,9 → 430,3 | 726,9 | 687,3 · 632,3 · 560,1 |
| `/relatorios/geral` | 613,8 → 574,2 | 746,1 | 773,1 · 1.055,9 · 642,0 |
| `/login` com sessão (o `getUser` do proxy) | 63,0 → 65,9 | 77,0 | **117,0 (+51,9%)** · 84,9 · **102,8 (+33,5%)** |

(As 19 rotas: `docs/perf/f66-producao-ttfb-*.json`.) **Na mediana, a pior rota +6,6%** (`/movimentacoes/nova`, total).
**No p95**, `/ajuda` e `/movimentacoes/nova` voltaram para baixo nas duas medições a mais; `/login` com sessão ficou acima
em duas de três — mas essa rota **não chega ao PostgREST** (o proxy só chama `auth.getUser()`, a API de Auth; nenhuma
policy é avaliada), o `medir-rls` não tem o que atribuir, e a mesma rota mediu p95 117,2 ms DE MANHÃ, antes de qualquer
apply. **Ruído declarado** (ata (n)), com os números; o tamanho do ruído do dia aparece nas rotas públicas que nem tocam
o banco (na segunda rodada, `/login` +154,8%, `/relatorios/acesso` +287%).

---

# 9. As sabotagens, com a saída real

Cada trava provou que sabe ficar vermelha de três jeitos: **contra o estado de antes** (o push 1, só as travas — CI run
`36010011561`, `132ded4`, vermelho de propósito, em `f66-evidencias/B-travas/`), **pela sabotagem de mesa** sobre a cadeia
inteira (um banco novo do dump por sabotagem, a mesa PGlite) e **pelo injetor** no banco do CI. Tudo com a saída real em
`f66-evidencias/A-L-sabotagens.md`.

| sabotagem | contra o antes (push 1) | com a cadeia pronta | resultado |
|---|---|---|---|
| **A** — a forma (16a) | ✗ 16a pelas 51 | A1 uma das 51 de volta ao piso sozinho; A2 o termo só no USING de um UPDATE; A3 `empresas_do_membro()` numa escrita de admin; A4 o termo num `or` com o piso; A5 `e_membro(empresa_id)` (função que recebe a coluna); A6 uma tabela sintética com a coluna e policy sem o termo | ✗ 16a pelo nome em cada (A5 também ✗ 11a; A6 também ✗ 1a, 6c, 10a do catálogo); injetor `f66-termo-em-or`, `f66-admin-com-empresas-do-membro` |
| **B** — `to authenticated` (16f) | — (as 62 já eram) | B1/B2: uma policy de `public` e uma de Storage de volta a `to public` | ✗ 16f; injetor `f66-policy-to-public` |
| **C** — a leitura, direção A (10a) | ✗ 10a, acusando cada tabela | C1: o termo retirado de UMA policy de leitura (`itens`) | ✗ 10a e 10c, acusando a tabela; injetor `f66-termo-sai-da-leitura` |
| **D** — a direção B e o membro das duas (10c–10f) | ✗ 10c, 10f | D1: a leitura da auditoria com a função do MEMBRO | ✗ 10f (o membro das duas passa a ler a auditoria da B) |
| **E** — a escrita cruzada (10g) | ✗ 10g, 10g-bis | E1: `motivos / admin apaga` sem o termo — **a primeira versão da bateria passava** (o admin da A não lê a B, e o `where` do DELETE aplica a policy de SELECT); consertada na fase (ata (i)) | ✗ 10g e 10g-bis; injetor `f66-escrita-confere-papel-e-esquece-tenant` |
| **F** — os pares (11a–11d, 16c, 16d) | ✗ 16c, 16d, 11a, 11a-bis | F1 o par do snapshot retirado; F2 o par só da filial, sem a empresa; e da revisão adversarial F3–F5: o segundo membro literal, outra coluna, a chave do snapshot trocada | F1 ✗ 11c; F2–F5 ✗ 16c; injetor `f66-unidade-volta-a-pode-escrever-filial`, `f66-par-com-segundo-membro-literal`, `doutrina-excecao-sobrevive-ao-conserto` |
| **G** — conta a conta | — | a sabotada no ensaio (uma escrita e uma leitura invertidas) | **2** divergências — o instrumento acusa; nos bancos vivos, 0 em todas as rodadas (§6) |
| **H** — as `rel_*` (10i/10j) | ✗ 10i (o membro das duas via 4 em vez de 2) | H1: o resumo de volta ao join só pelo código | ✗ 10i; injetor `f66-rel-join-sem-empresa`; a equivalência 0 nos dois bancos |
| **I** — os índices | — | a medição de quatro cenários (PLAN §3.2) | "nenhum índice", confirmado pelo EXPLAIN vivo (§7) |
| **J** — o custo | — | F0-depois × F4-antes; a régua de 15% | §8 |
| **K** — o rollback | — | os rollbacks F63/F64/F65 SEM o da F66 antes; a exceção do estorno retirada do texto do rollback | ✗ os três (o `drop column` morre; o rb3 da F65 reprova); ✗ `rollback-f66.test.ts` |
| **L** — o instrumento | — | o `relfilenode` na mesa antes/depois da cadeia; o md5 de uma policy alterada numa subtransação | 0 de 29 mudaram; o md5 muda SÓ na alterada; a `L2` (reescrita de verdade muda o `relfilenode`) verde |

O injetor inteiro, no CI do SHA congelado (run `36026526435`): **151/151 detectadas pelo cenário nomeado** (+2 em
quarentena, declaradas).

---

# 10. A revisão adversarial

Cinco leitores em contexto fresco, um por dimensão, lendo o código **pelo SHA** `0e51a0a` (nunca pela árvore de
trabalho — o conserto durante o voto faria o achado real sair "refutado"), e um cético por achado, instruído a refutá-lo. **7 achados, 6 sobreviveram, todos consertados na fase** antes do
congelamento (ata (j)):

1. **ALTO** — o 16c contava os pares sem conferir o SEGUNDO membro: `(empresa_id, 1::smallint) in (…)` passava. Agora o
   segundo membro tem de ser a coluna `filial_id` da própria linha ou, só onde há `snapshot_anterior`, a forma exata do
   snapshot (a chave conferida pelo deparse); três árvores sintéticas novas na guarda 16g e a mutação
   `f66-par-com-segundo-membro-literal` (teto 150 → 151).
2. **BLOQUEANTE** — a guarda do `equivalencia-rel.mjs` era lista NEGRA de verbos: um corpo colado com
   `pg_advisory_lock(…)` (lock de sessão, que o `raise` final não desfaz) passava. Agora é lista FECHADA de funções (pelo
   léxico da trava de mesa, dentro dos literais e dos `$tag$`) e de configurações (com o valor); os 64 blocos de todos os
   modos saem idênticos.
3. e 4. **BAIXOS** — `deallocate` em dobro de CADA `prepare`; `--ref` conferido contra o `env-guard` em todo `gerar-*`.
5. **BLOQUEANTE (documental)** — textos em tempo consumado sobre provas de banco vivo antes do apply: o CHANGELOG e as
   regras passaram a descrever o estado do MERGE; este relatório nasce antes do merge, com os números reais.
6. **MÉDIO** — quatro das seis linhas de código da releitura do inventário estavam deslocadas; conferidas no disco.

O refutado: a identidade da prova conta a conta sem filtro de empresa legada — com uma empresa só e o
`rotulo_de_ambiente()` conferindo o alvo, inalcançável. **E um vermelho do próprio CI**, depois do conserto (1): o run
`36025898726` reprovou a mutação nova porque a SONDA dela procurava `u(empresa_id, filial_id)` e o deparse devolve outra
forma — a sonda foi corrigida (`31b9a16`), o SHA recongelado, e o run `36026526435` saiu verde.

---

# 11. A contagem final, antes × depois (a mesa e o CI)

| | antes (v1.70.0) | depois (SHA `31b9a16`) |
|---|---|---|
| `npm run test` | 256 arquivos · 7.862 testes | **259 arquivos · 8.036 testes**, verdes |
| roteiros SQL (CI) | 51 · 1.095 asserções | **52 · 1.123**, 0 ✗ (run `36026526435`) |
| injetor | 143/143 (+2 em quarentena) | **151/151** detectadas pelo cenário nomeado (+2) |
| `db:types:diff` | 38 · 358 · 94 | 38 · 358 · 94 (a fase não cria coluna nem função) |
| `lint`, `typecheck`, `build`, `contraste`, `verificar:actions` | limpos | limpos (job `verificar` do mesmo run) |
| policies que citam `empresa_id` | 0 | **51** — no CI e nos dois bancos |
| policies que chamam `pode_escrever_filial` | 6 | **0** (6 na forma de pares) |
| `k_excecoes_predicado` | 18 | **12** |
| policies `to authenticated` | 62 (sem trava) | 62, **com trava** (16f) |
| índices | 96 | 96 (nenhum criado, nenhum derrubado) |
| conferidor de formas (produção) | 271 pontos · 0 recusadas (F65) | 271 pontos · 100.829 linhas · 0 recusadas · 0 reprovados |
| smoke (produção) | 109 OK · 1 aviso · 0 falha | 109 OK · 1 aviso · 0 falha |

---

# 12. Os 28 critérios, autoverificados

| # | critério | estado |
|---|---|---|
| 1 | lint, test, typecheck, build, contraste, verificar:actions; CI com roteiros, injetor e tipos | ✅ (run `36026526435`; na mesa, 259 · 8.036) |
| 2 | PLAN-F66 antes do primeiro commit de código, com os 28 fatos, a tabela-verdade, o censo, a releitura, as 15 decisões e a ordem de rollback | ✅ (`a02f3a1`, antes de `132ded4`) |
| 3 | a linha de base do mesmo dia, a emulada 0 e o "antes", antes de qualquer apply, só contagem/nome/hash | ✅ (`antes/`, `perf/f66-*-antes*.json`; refeitos logo antes em cada banco) |
| 4 | migrations desde a `0175`, classe, rollback no rodapé, `db:lock`, `DA_F38`; sem `update`/`cascade`/`concurrently`/janela/DDL dinâmica; só as duas `rel_*` recriadas | ✅ |
| 5 | as 51 com o termo canônico da classe, em conjunção, piso intacto, no CI e nos dois bancos; a trava vermelha → verde | ✅ (16a; o md5 do oráculo nos dois bancos) |
| 6 | as 6 na forma de pares; nenhuma `pode_escrever_filial`; `k_excecoes_predicado` 12; 11a/11b verdes | ✅ |
| 7 | as três sem a coluna como exceção nominal, numa fonte só, nos dois sentidos | ✅ (`k_recorte_excecoes`, 16e) |
| 8 | toda policy de `public` e Storage `to authenticated`, com trava | ✅ (16f) |
| 9 | as travas do fato 12 dizem a verdade nova; nenhuma tautológica; as exceções de função nominais | ✅ (os sete pontos; `k_leitura_tenant` com as `rel_*`) |
| 10 | a leitura nas duas direções, o membro das duas, a escrita cruzada recusada e o par legítimo aceito; universo contado como `postgres`; toda recusa provada duas vezes | ✅ (10a–10h; o furo do 10g fechado — ata (i)) |
| 11 | os pares provados no roteiro e a equivalência com `pode_escrever_filial` no CI | ✅ (11a–11d) |
| 12 | nada mudou para a WAP: conta a conta 0 antes e depois de cada lote nos dois; smoke 0 falha; conferidor 0 recusadas nos dois | ✅ (§6) |
| 13 | TTFB ≤ 15% pela regra da decisão 11; `medir-rls` depois lado a lado com o antes e a F59 | ✅ na mediana (+6,6% o pior); no p95, as três rotas medidas mais duas vezes — duas voltaram, a terceira não toca o banco: ruído declarado (§8, ata (n)) |
| 14 | cada índice criado/derrubado com EXPLAIN antes × depois e censo; nenhum para o advisor | ✅ vazio por construção: nenhum criado nem derrubado (§7), o EXPLAIN depois confirma |
| 15 | as `rel_*` pelo par, o resto byte a byte; equivalência 0 nos dois; travas de recorte verdes | ✅ |
| 16 | nenhuma tupla reescrita: `relfilenode` igual nos dois | ✅ (todas as rodadas) |
| 17 | as funções que a fase não toca byte a byte; as 11 policies que não mudam | ✅ (`75d18f23…`, `eb294504…` em todas as rodadas) |
| 18 | o injetor na ata; detectadas; teto exato; quarentena < ⅓ | ✅ (151, 2 em quarentena) |
| 19 | o rollback escrito na ordem inversa e ensaiado no CI até o "antes"; os F62–F65 rodam o da F66 antes | ✅ (`f66_rollback.sql` 6/0; `f62`–`f65` verdes) |
| 20 | advisor de segurança sem novidade; performance só no delta declarado; paridade das 11 | ✅ (nenhum delta; paridade idêntica) |
| 21 | os roteiros adaptados listados, nenhuma asserção mudou para passar | ✅ (§2) |
| 22 | nenhuma dependência; workflows, `CLAUDE.md` da raiz, seed, embeds e o código do app intocados; linha de base intacta | ✅ |
| 23 | as emendas (MATRIZ, ADR-001, ADR-002, RUNBOOK, PLANO com a F66B, INVENTARIO, índices, ata) | ✅ |
| 24 | `1.71.0`, CHANGELOG, registry; a tag | ✅ versão; a tag `v1.71.0`, anotada, no merge do PR de documentação, publicada (§14) |
| 25 | os dois PRs mergeados, a conferência pós-deploy | ✅ PR #79 (`fbcd14b`); a conferência (§14); o PR de documentação é este |
| 26 | as sabotagens A–L com saída real | ✅ (`A-L-sabotagens.md`, `B-travas/`) |
| 27 | nenhum dado real; da produção só contagem/nome/hash; ninguém abriu o `.env.local` | ✅ |
| 28 | este relatório no padrão, com o roteiro no topo, o repouso e o "não prova" | ✅ |

---

# 13. O estado de repouso

- **Produção e ensaio:** com a `0175`–`0179` (a mais nova no ledger: `rel_motivo_por_empresa`); o catálogo idêntico entre
  os dois nas 11 classes.
- **`main` e o deploy:** `fbcd14b` no ar, `1.71.0`; a sonda de deriva com 0 pendente (Parte B de 24/09, 17:48 UTC).
- **Escrita da fase nos bancos:** só as cinco migrations e os dois `notify pgrst` — nenhuma linha de dado tocada.
- **Rollback, se um dia for preciso:** o `supabase/rollback/F66-desfaz.sql` (RUNBOOK, Anexo F66) seguido do `git revert`
  do merge. Depois da F73 (uma segunda empresa de verdade), esse rollback ABRE a leitura entre empresas: só roda com o
  dado da segunda empresa fora.

---

# 14. O merge, o deploy e a conferência pós-deploy

O detalhe: `f66-evidencias/depois/pos-deploy.md`.

- **O merge**: PR #79 saiu do rascunho depois das provas de produção (a descrição trocou o aviso das travas vermelhas
  pelo registro do apply), com `verificar`, `banco-sem-docker` (run `36035029512`, HEAD `60b9d66`) e Vercel verdes,
  estado `CLEAN`; merge normal, **`fbcd14b`** (17:36:14 UTC).
- **O deploy**: `/api/saude` → `{"ok":true,"versao":"1.71.0","commit":"fbcd14b","banco":"ok"}` (17:37:11 UTC). Entre o fim do
  apply em produção (17:01 UTC) e o deploy, o app velho rodou sobre as policies novas — a F66 não muda o código que o app
  executa, e o conferidor e o smoke leram pelo PostgREST nessa janela sem recusa.
- **A conferência**: o smoke com `SMOKE_VERSAO_ESPERADA=1.71.0` — **109 OK · 1 aviso · 0 falha** (o aviso antigo de kits);
  a Parte B (`saude.yml`, run `36036851741`) — **success**: o resumo de integridade com 13 chaves dentro da linha de base
  (e o aviso de que a de `conflito_entre_filiais` PODE descer, 66 contra 69 — nenhum número mexido), a deriva com **0
  pendente** (a mais nova no ledger é a `0179`), o alarme verde.
- **Os tipos**: a geração do MCP em produção tem o MESMO md5 da geração da F65 (`1acd5546…`) — a fase não mudou tipo
  nenhum; o `database.ts` não foi tocado.
- **A tag** `v1.71.0`, anotada, no merge do PR de documentação (o molde da `v1.70.0`).

---

# 15. O que este relatório NÃO prova

1. **Que a empresa B vê o próprio dado pelas policies reais.** A ponte de `papel_atual()` só olha a empresa legada: até a
   F67, o piso fecha tudo para quem é só da B. A direção B foi provada com o piso NEUTRALIZADO numa subtransação do
   roteiro (a emulação da F72), que testa o termo real de cada policy.
2. **Que uma linha nova de uma segunda empresa receberia a empresa certa**: o default é `empresa_legada()` (a WAP) até a
   F67.
3. **Que as `security definer` recortam**: elas atravessam a RLS por construção (F67).
4. **Que o Storage e o canal do Realtime estão recortados** além do que a policy de SELECT do assinante já faz (F67).
5. **Que `profiles` está recortado** (F69).
6. **Que o custo se mantém com duas empresas e volume maior**: a medição é do volume de hoje, com uma empresa.
7. **Que a janela de produção entre os lotes ficou sem tráfego**: o app estava no ar; a prova conta a conta relê os
   totais e acusaria corrida (0 em todas as rodadas), mas uma escrita do app entre dois lotes não é medida.
8. **Que as recusas de escrita cruzada disparam nos bancos VIVOS**: os roteiros que as provocam rodaram no CI, contra a
   cadeia inteira; nos bancos vivos a prova é o texto de policy igual ao do oráculo e ao do CI — nenhuma escrita de teste
   em produção nem no ensaio, de propósito.
9. **Que a forma `itens.saldo-colaborador` foi exercitada no ENSAIO** (ele não tem colaborador); foi, em produção.
10. **Que a mesa (PGlite) seja a régua**: ela é o oráculo do texto de policy (bateu com os dois bancos vivos), mas o CI é
    a autoridade.

---

# 16. Pendências e backlog nomeado

- **Pendente desta fase:** nada além da sua conferência à mão (§1.3).
- **F66B**: o comprimento como regra do banco (a ficha escrita nesta fase, com o censo).
- **F67**: a ponte de `papel_atual()`, a escrita por empresa, as `security definer`, Storage, Realtime, o default, os
  escritores por chave natural, e o que a releitura do inventário apontou (`paresEmOutrasFiliais`,
  `cadastrosComMesmaIdentidade`).
- **F69**: `profiles`. **F70**: os índices liderados por `empresa_id` com a empresa como igualdade (a auditoria com
  `(empresa_id, quando desc, id desc)`); o `/dev` por empresa ou por plataforma. **F72**: o piso.
- **Backlog nomeado** (decisão 3 do Johnny na F65): o seed de duas empresas, `scripts/seed.test.ts` e o `onConflict` de
  `seed.ts:886`. **Backlog** (do `RELATORIO-F60.md`): a paginação keyset e a ordem visível no empate.
- **PATCH** (do backlog da F62): derrubar `profiles.papel`/`ativo` a partir de 13/10/2026.
- **PATCH** (do `RELATORIO-F65.md` §13): o hand-fix da F62 em `operador_filiais.Insert` no gate de tipos (a geração do
  MCP de hoje confirma: são as duas únicas linhas não comentadas que diferem).
- **Avulsos** (das F63/F64): `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` rastreados pelo git; o corpo vivo de
  `apagar_movimentacao`/`resetar_acervo` × o arquivo.
- O WARN `multiple_permissive_policies` de `pendencias_item` (UPDATE): a fase não mesclou as duas (a ordem proíbe); a
  medição não mostrou custo que peça a conversa.

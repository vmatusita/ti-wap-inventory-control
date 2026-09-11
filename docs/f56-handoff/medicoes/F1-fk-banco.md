# F1-fk-banco — a bomba de FK do import (fatos 27, 28, 29, 32, 33, 35 + MEDIÇÃO 3)

Medido em 11/09/2026, banco de produção `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh`, só SELECT.
Repositório: `C:/Users/victor.matusita/ti-wap-inventory-control`, branch `f56-import-sem-wapismo-e-sem-bomba`.

---

## (i) As FKs que referenciam ativos/movimentacoes/pendencias_item/anotacoes/termos_gerados

Query: `pg_constraint` (contype='f', confrelid nas cinco tabelas), nos dois bancos — **idêntico** produção/ensaio, 8 linhas:

| tabela.coluna | → alvo | confdeltype | deferrable/deferred | coluna NOT NULL |
|---|---|---|---|---|
| `anotacoes.ativo_id` | → ativos | a (NO ACTION) | não/não | sim |
| `ativos.substitui_ativo_id` | → ativos | a | não/não | **não** (anulável) |
| `lancamentos_item.movimentacao_id` | → movimentacoes | a | não/não | **não** (anulável) |
| `lancamentos_item.pendencia_item_id` | → pendencias_item | a | não/não | **não** (anulável) |
| `movimentacoes.ativo_id` | → ativos | a | não/não | sim |
| `movimentacoes.estorno_de` | → movimentacoes (self) | a | não/não | não (anulável) |
| `pendencias_item.ativo_id` | → ativos | a | não/não | sim |
| `pendencias_item.movimentacao_id` | → movimentacoes | a | **sim/sim** (DEFERRABLE INITIALLY DEFERRED) | sim |

Nenhuma tem `ON DELETE CASCADE` (todas `confdeltype='a'`). `termos_gerados` e `colaboradores`/`itens` **não aparecem** como alvo de FK nenhuma vinda dessas tabelas — confirmado por leitura de código: `termos_gerados` referencia `ativo_ids uuid[]`/`movimentacao_ids uuid[]` (arrays, não FK; comentário de `0082:90-92`: *"termos_gerados NÃO TEM FK"*). `movimentacoes.estornada_por` **não existe** — só `movimentacoes.estorno_de` (auto-FK, confirmado por `information_schema.columns`).

**Confirmação do fato 27**: são exatamente **CINCO caminhos** que `import_apagar_acervo_filial` (0131:300-342) não trata hoje —
`ativos.substitui_ativo_id`, `lancamentos_item.movimentacao_id`, `lancamentos_item.pendencia_item_id`, `pendencias_item.ativo_id`, `pendencias_item.movimentacao_id`. Os outros três (`anotacoes.ativo_id`, `movimentacoes.ativo_id`, `movimentacoes.estorno_de`) já são seguros:
- `anotacoes.ativo_id`/`movimentacoes.ativo_id`: a auxiliar já apaga essas tabelas antes de `ativos`.
- **ACHADO NOVO (não estava no fato 27)**: `movimentacoes.estorno_de` (auto-FK) não precisa de tratamento porque `import_apagar_acervo_filial` apaga TODAS as movimentações da filial num **único** `DELETE` (`delete from public.movimentacoes where ativo_id in (...)`, 0131:314-316). Para FK não-deferrable, o Postgres checa a restrição "imediatamente após todo COMANDO" (não por linha) — um estorno e a movimentação original do MESMO ativo são sempre apagados no mesmo `DELETE`, então a checagem no fim do statement não vê violação nenhuma (o par some junto). Isso é conhecido, mas não testado com DML nesta sessão (só SELECT permitido) — é dedução a partir de `pg_constraint` + semântica documentada do Postgres para RI não-adiável. **Continua exigindo que o `delete from movimentacoes` da 0140 continue sendo UM statement só** (não vire um loop por ativo) — se alguém "otimizar" isso para um DELETE por ativo dentro do laço do passo 4, quebra.

---

## (ii) Contagens por filial, pelo critério da RPC — produção e ensaio

Critério da RPC (confirmado lendo `import_apagar_acervo_filial`, 0131:313-334, e `importar_ativos_substituir`, 0132:425-575): o acervo de uma filial é **`ativos.filial_id = p_filial` no MOMENTO da chamada** — nunca `movimentacoes.filial_id`/`pendencias_item.filial_id` (que são snapshot da ÉPOCA, gravados no INSERT e nunca reescritos quando o ativo migra de filial via `transferencia`). A auxiliar já usa esse critério para tudo que apaga hoje (`where ativo_id in (select id from ativos where filial_id = p_filial)`), e é o que a Decisão precisa manter para os quatro passos novos.

### Produção (`pbtjcalbmepmrqzprusb`)

| filial (id) | pendências (ativo no acervo) | lanç. presos a MOV do acervo | lanç. presos a PEND do acervo | substituto de fora apontando p/ acervo | pendências pela ÉPOCA | mov. pela ÉPOCA |
|---|---|---|---|---|---|---|
| matriz (1) | **16** | **18** | 0 | 0 | **17** | 2521 |
| cd-afonso-pena (2) | 0 | 0 | 0 | 0 | 0 | 404 |
| linhares (3) | 0 | **16** | 0 | 0 | 0 | 365 |
| serra (4) | 0 | 0 | 0 | 0 | 0 | 120 |
| eusebio (5) | **1** | 0 | 0 | 0 | 0 | 115 |
| filialteste (6) | 0 | **12** | 0 | 0 | 0 | 7 |

Bate **exatamente** com o fato 29: Matriz 16 pend./18 lanç., Linhares 16 lanç., Eusébio 1 pend., Filial de Teste 12 lanç., CD/Serra zero, "lanç. preso a pendência" e "substituto de fora" zero nas seis. A divergência pela época também bate: Matriz dá 17 pela época (a 17ª pendência tem `pendencias_item.filial_id=matriz` mas o ativo dela migrou e hoje está em `eusebio` — é exatamente a pendência que aparece em `eusebio` no critério "pelo ativo atual").

⚠ **Armadilha na minha primeira passada**: minha primeira query para "substituto de fora apontando" tinha um bug (faltava `and ac.filial_id = f.id` no join com o CTE do acervo) e devolveu 2 para cinco das seis filiais — sugerindo falsamente que o fato 27 ("zero nas seis, hoje") estava errado. Investigando, os dois únicos pares `substitui_ativo_id` que existem em produção são **Matriz→Matriz** (substituto em_uso apontando para um `devolvido_fornecedor`, ambos na mesma filial) — corrigida a query, as seis dão zero. **Fato 27/29 confirmado sem divergência**; o erro era meu.

### Ensaio (`sgmvldiizsrjbxzzpmhh`)

| filial (id) | pendências (ativo no acervo) | lanç. presos a MOV do acervo | lanç. presos a PEND do acervo | substituto de fora | pendências pela ÉPOCA | mov. pela ÉPOCA |
|---|---|---|---|---|---|---|
| matriz (1) | **20** | **5** | 0 | 0 | 22 | 2452 |
| cd-afonso-pena (2) | **1** | 0 | 0 | 0 | 0 | 272 |
| linhares (3) | 0 | 0 | 0 | 0 | 1 | 272 |
| serra (4) | 0 | 0 | 0 | 0 | 0 | 103 |
| eusebio (5) | **2** | 0 | 0 | 0 | 0 | 140 |

Bate com o fato 29 (Matriz 20/5, CD 1, Eusébio 2). "Lançamento preso a pendência" (a 3ª coluna) é **zero nos dois bancos, em todas as filiais, hoje** — mas isso é um acidente do estado atual (poucas resoluções de pendência com item de catálogo até agora), não uma garantia estrutural: o caminho existe (`resolver_pendencias_item_com_lancamentos`, 0119/0126) e vai gerar linhas com o uso normal do sistema. **O conserto tem que tratar esse caminho mesmo com zero linhas hoje** — é exatamente o que a Decisão 9 do prompt já prevê.

---

## (iii) Corpos vigentes — md5 normalizado, assinaturas, privilégios

Script `scripts/db/corpo-vigente.mjs` (Node, sem banco) extraiu o corpo **entre os `$$`** de cada `create or replace function` mais recente na cadeia de migrations, normalizou (`replace(/\s+/g,' ')`) e computou md5:

| função | arquivo vigente | md5 (arquivo) |
|---|---|---|
| `import_apagar_acervo_filial(smallint)` | `0131_import_decomposto.sql` | `e313d1feb28b33ee29436e81c2ae1a70` |
| `import_revalidar_contagens(jsonb, smallint)` | `0131_import_decomposto.sql` | `3ad2f66b50aab234a579b74a154600f0` |
| `importar_ativos_substituir(jsonb, text, jsonb, jsonb)` | `0132_guardas_de_escopo.sql` | `8ab118c36b7ba00ab8647445a52d89a1` |

Contra o banco: `select md5(regexp_replace(prosrc,'\s+',' ','g')) from pg_proc ...` nos dois projetos — **os três md5 batem exatamente, produção e ensaio, com o arquivo.** Sem overload (uma linha só por nome nos dois bancos). Privilégios (`has_function_privilege`):

| função | public | anon | authenticated | service_role |
|---|---|---|---|---|
| `import_apagar_acervo_filial` | false | false | false | false |
| `import_revalidar_contagens` | false | false | false | false |
| `importar_ativos_substituir` | false | false | **true** | false |

Idêntico nos dois bancos — bate com a verificação pós-apply escrita no rodapé da 0131.

⚠ **Achado relevante para a Decisão 9 / para quem escrever a 0140**: `select prosrc ilike '%delete from public.ativos%'` sobre `importar_ativos_substituir` dá **true** — não porque a orquestradora tenha um DELETE literal (ela não tem; chama `import_apagar_acervo_filial`), mas porque o **comentário** do bloco 1a-bis (0132:493-497, a explicação de por que `pode_escrever_filial` não é redundante) cita a frase `delete from public.ativos where filial_id = v_filial` entre crases, dentro de um `--`. Isso é exatamente o padrão que a memória da sessão já registra ("corpo-vigente lê comentário como SQL"). **Não quebra nada hoje**: `import-uma-porta.test.ts` usa `codigoVivo()` (`src/lib/validators/import-uma-porta.test.ts:125-132`), que primeiro apaga literais de string e SÓ DEPOIS corta `--` até o fim da linha — então o teste já ignora esse comentário corretamente, e há até um describe 4 inteiro (`'a trava não mente'`) provando isso. Mas serve de aviso para a 0140: **qualquer novo comentário na orquestradora ou nas auxiliares que cite `delete from public.ativos` como texto continua seguro para o `import-uma-porta.test.ts`** (ele limpa comentário), mas **NÃO é seguro para uma busca `ilike`/`grep` cru** feita à mão em auditoria — o handoff da 0140 (fato 31/critério 28) não deve usar `ilike` cru para provar "só uma porta apaga"; deve usar o mesmo `codigoVivo()`.

---

## (iv) Funções cujo prosrc contém `delete from public.ativos` (ilike), nos dois bancos

Idêntico produção/ensaio, 6 funções:
`apagar_ativo`, `apagar_ativos_conflito_filiais`, `import_apagar_acervo_filial`, `importar_ativos_substituir` (só em comentário — ver acima), `resetar_acervo`, `resetar_dados_ficticios`.

Confirma o inventário de `import-uma-porta.test.ts:29-49` (que já sabia disso e documenta a mesma lista, exceto que ele lê `codigoVivo()` e por isso NÃO lista `importar_ativos_substituir`, corretamente — o comentário não conta pra ele). `resetar_itens` **não** aparece (nunca apagou de `ativos` — mexe só em `lancamentos_item`; o teste já registra essa correção da ordem original, que falava em "cinco lugares").

---

## (v) As quatro RPCs do backlog — quais dos cinco caminhos já tratam

Lidos os corpos vigentes: `apagar_ativo` e `apagar_movimentacao` (ambas vigentes em `0090_guarda_furos_revisao.sql`, superando `0082`), `resetar_acervo` (vigente em `0089_reset_backup_do_recorte.sql`, superando `0083`), `apagar_ativos_conflito_filiais` (vigente em `0132_guardas_de_escopo.sql:617-904`, superando `0100`).

| RPC | path 1: pendencias_item.ativo_id | path 2: pendencias_item.movimentacao_id | path 3: lancamentos_item.movimentacao_id | path 4: lancamentos_item.pendencia_item_id | path 5: ativos.substitui_ativo_id |
|---|---|---|---|---|---|
| `apagar_ativo` (0082:96-241) | ✅ trata (deleta pendencias_item ANTES de ativos, 0082:176-177) | ✅ implícito (pendencias_item some antes de… mas **não apaga movimentações antes**; como a FK é deferida, funciona porque pendências somem primeiro) | ❌ **NÃO trata** — deleta `movimentacoes` (0082:191-192) sem nular `lancamentos_item.movimentacao_id` primeiro | ❌ **NÃO trata** — deleta `pendencias_item` (0082:176-177) sem nular `lancamentos_item.pendencia_item_id` primeiro | ✅ trata (`update ativos set substitui_ativo_id=null where substitui_ativo_id=p_ativo`, 0082:195-196) |
| `apagar_movimentacao` (0090:122-268, o "estorno-strip" já existia) | n/a (não apaga ativo) | ✅ implícito (deleta `pendencias_item where movimentacao_id=p_mov` ANTES de deletar a movimentação, 0090:214-215/239) | ❌ **NÃO trata** — `lancamentos_item.movimentacao_id` apontando para `p_mov` fica órfão de FK quando `p_mov` é apagada | ❌ **NÃO trata** — idem para `lancamentos_item.pendencia_item_id` apontando às pendências que acabou de apagar | n/a (não apaga ativo) |
| `resetar_acervo` (0089:69-252) | ✅ trata (`delete from pendencias_item` antes de `ativos`, 0089:181-183/206) | ✅ implícito (mesma ordem) | ❌ **NÃO trata** — não toca `lancamentos_item` de jeito nenhum (isso é `resetar_itens`, RPC separada, chamada isoladamente pela tela) | ❌ **NÃO trata** — idem | ✅ trata (0089:202-204, é o precedente citado no fato 27 e no `ponteiros_perdidos` do TS) |
| `apagar_ativos_conflito_filiais` (0132:617-904) | ✅ trata (`delete from pendencias_item where ativo_id=any(v_ids)`, 0132:847, ANTES de `ativos`) | ✅ implícito | ❌ **NÃO trata** — não toca `lancamentos_item` | ❌ **NÃO trata** — idem | ✅ trata (0132:865-867, `update ativos set substitui_ativo_id=null where substitui_ativo_id=any(v_ids) and not (id=any(v_ids))`) |

**Nas quatro, os paths 3 e 4 (os dois FKs de `lancamentos_item`) são o mesmo defeito latente do import** — confirma a nota parentética do fato 27. `apagar_item` (a quinta RPC destrutiva da Zona, 0082:434-513) **não tem esse problema**: ela apaga TODOS os `lancamentos_item` de um `item_id` num statement só (incluindo os que se auto-referenciam por `estorna_id`) e só depois o `itens`, então não há linha órfã (mesmo raciocínio do `estorno_de` acima).

**Contagens que fariam as quatro estourar** (medidas, produção, pelo critério de cada RPC):
- `apagar_ativo`/`apagar_movimentacao`: estouram em QUALQUER ativo/movimentação de Matriz, Linhares ou Filial de Teste que tenha `lancamentos_item.movimentacao_id` apontando para ele — 18+16+12 = **46 combinações possíveis** hoje em produção (a contagem de "lanç. presos a MOV do acervo" da tabela (ii), somada nas três filiais); e em Eusébio para o único ativo com a pendência (path 4, hoje 0 lançamentos presos a pendência, mas o caminho existe).
- `resetar_acervo`: estoura pelo MESMO conjunto de `lancamentos_item.movimentacao_id`/`pendencia_item_id` presos, SE alguém rodar `resetar_acervo` numa filial sem rodar `resetar_itens` antes/depois na mesma filial — hoje as duas RPCs são independentes na tela `/dev/destrutivo` (não medi se a UI sempre as encadeia; é *achado de produção* a relatar, não a consertar aqui — fora de escopo desta fase por decisão do Johnny).
- `apagar_ativos_conflito_filiais`: estoura em qualquer seleção de conflito que inclua um ativo com lançamento de item vinculado — hoje **zero casos possíveis** (não há ativo em conflito entre filiais com lançamento vinculado, medido: a única tabela que cruza as duas coisas dá zero nas seis/cinco filiais), mas o caminho existe estruturalmente.

---

## Leitores de `lancamentos_item.movimentacao_id`, `.pendencia_item_id`, `pendencias_item`, `ativos.substitui_ativo_id`

Grep em `supabase/migrations/**` e `src/**` (TS), cruzado com leitura dos corpos vigentes. Para cada um: **muda o número quando o acervo substituído é apagado com os elos desvinculados?**

| leitor | onde | o que lê | muda? |
|---|---|---|---|
| `itensQueForamJunto` (ficha "o que foi junto") | `src/lib/queries/itens.ts:715-749`, usado em `ativos/[id]/page.tsx:114` | `lancamentos_item` filtrado por `movimentacoes.ativo_id = :ativoId` (um ativo por vez) | **Não**, para ativos que sobrevivem — a query é sempre escopada a UM ativo específico; para os ativos apagados a ficha inteira some junto (não há mais o que mostrar). |
| `acessoriosDasMovimentacoes` (termo, F39) | `src/lib/queries/itens.ts:795-847` | `lancamentos_item` filtrado por `.in('movimentacao_id', movimentacaoIds)` — ids específicos de UMA preparação de termo em curso | **Não** — o import nunca chama essa função; os `movimentacao_id`s que o import apaga já não existem mais para nenhum termo NOVO se referir a eles. |
| `estornar_movimentacao_com_itens` (0121, vigente 0122:169-268) | RPC | conta órfãos com `where l.movimentacao_id = p_movimentacao_id` (uma movimentação específica, viva) | **Não** — desvincular só toca `lancamentos_item` do acervo APAGADO; uma movimentação viva nunca tem seus lançamentos desvinculados. |
| `resolver_pendencias_item_com_lancamentos` (0119, vigente 0126:487-…) | RPC | soma `lancamentos_item` por `item_id, filial_id` (tipo saida/retorno) — **não filtra por `pendencia_item_id`** | **Não** — a "partição A" (F41) não usa `pendencia_item_id` nem `movimentacao_id`. |
| `reabrir_pendencias_item_com_estornos` (0119, vigente 0122:56-164) | RPC | verifica órfãos com `l.pendencia_item_id = any(v_reabertas)`, onde `v_reabertas` só contém pendências que o PRÓPRIO `update ... returning` acabou de reabrir | **Não** — pendências do acervo apagado nunca chegam a `v_reabertas` (foram deletadas, não reabertas). |
| `v_pendencias`/`v_pendencias_item` (0052) | view, alimenta `/pendencias` | lê linhas de `pendencias_item` diretamente | **SIM, e é o efeito DESEJADO**: as pendências do acervo apagado somem da fila — é o ponto da Decisão i. Pendências de outras filiais, inalteradas. |
| `rel_saldo_colaborador` (0118:89-115) | RPC (`com esta pessoa`) | `colaborador_id, tipo, quantidade, item_id, filial_id` de `lancamentos_item` — **nem `movimentacao_id` nem `pendencia_item_id`** | **Não** — comprovado por leitura do corpo inteiro (fato 32, "o que se prova, não se supõe"). |
| saldo de item (`rel_saldo_itens`, fórmulas do cabeçalho da 0027) | RPC/queries | `tipo, quantidade, chamado` — mesma família de colunas | **Não** — nenhuma das cinco derivações (`total/atrelados/liberados/estoque/falta`) usa `movimentacao_id`/`pendencia_item_id`. |
| `valida_lancamento_item` (trigger, vigente 0118:129-233) | trigger `BEFORE INSERT` em `lancamentos_item` | soma por `item_id, filial_id, (chamado), (colaborador_id)` | **Não aplicável** — é `BEFORE INSERT` **só** (fato 32 confirmado: sem ramo de UPDATE/DELETE); um `UPDATE ... set movimentacao_id=null` no desvincular NÃO dispara esse trigger. |
| `checagens_integridade_nucleo` — as 12 checagens (0138:106-304) | RPC | nenhuma lê `lancamentos_item.movimentacao_id`/`.pendencia_item_id` diretamente; a 6ª (`pendencia_de_estornada`) lê `pendencias_item.movimentacao_id`, a 11ª (`reserva_aberta`) lê `lancamentos_item.chamado/tipo/quantidade` | **Não** — confirmado por leitura das 12 (nenhuma junta por essas duas colunas específicas de `lancamentos_item`); a 12ª (`backup_orfao`) é afetada só pela Decisão 10 (ramo de erro), não pelo desvincular. |
| `ativos.substitui_ativo_id` — leitores | `queries/dev-destrutivo.ts:517-546` (`ponteiros_perdidos`), `actions/conflitos.ts:241-249` (`nao_incluido`), ficha do ativo (mostra "substituído por") | leem o ponteiro para exibir/registrar | **SIM para o próprio acervo apagado** (o ponteiro é anulado nos substitutos de OUTRA filial — efeito desejado da Decisão i); **não muda** para pares que não tocam o acervo apagado. |

---

## Proposta — Decisão 9 (a ordem exata dentro da auxiliar)

**Ordem proposta** (repete a que já está escrita no prompt, agora com a prova de que ela é a única que funciona dado o grafo de FK):

```sql
-- dentro de import_apagar_acervo_filial(p_filial smallint), já dentro da janela
-- que a orquestradora abre (0132:526) — sem abrir janela própria (fato/decisão já fixados):

-- (1) desvincula lançamentos que RESOLVERAM pendências do acervo (path 4, imediata)
update public.lancamentos_item li
   set pendencia_item_id = null
 where li.pendencia_item_id in (
   select pi.id from public.pendencias_item pi
    where pi.ativo_id in (select id from public.ativos where filial_id = p_filial)
 );

-- (2) desvincula lançamentos presos a MOVIMENTAÇÕES do acervo (path 3, imediata)
update public.lancamentos_item li
   set movimentacao_id = null
 where li.movimentacao_id in (
   select m.id from public.movimentacoes m
    where m.ativo_id in (select id from public.ativos where filial_id = p_filial)
 );

-- (3) apaga as pendências de item do acervo (paths 1 e 2 — 2 é deferida, mas a
--     ordem já resolve: as pendências vão embora ANTES das movimentações)
delete from public.pendencias_item pi
 where pi.ativo_id in (select id from public.ativos where filial_id = p_filial);

-- (4) anula o ponteiro de substituto que vem de FORA (path 5) — critério da RPC,
--     nunca filial_id histórico (mesmo padrão de 0089:202-204 / 0132:865-867)
update public.ativos set substitui_ativo_id = null
 where substitui_ativo_id in (select id from public.ativos where filial_id = p_filial)
   and filial_id <> p_filial;

-- (5) e só então o que já apagava, na MESMA ordem de hoje:
delete from public.movimentacoes where ativo_id in (...);   -- inclui estorno_de self-FK, 1 statement só
delete from public.anotacoes where ativo_id in (...);
with del as (delete from public.termos_gerados ... returning arquivo_path) ...
delete from public.ativos where filial_id = p_filial;
```

**Por que (1) antes de (2), e as duas antes de (3)**: são independentes entre si (colunas diferentes da mesma tabela; um lançamento nunca tem as duas preenchidas ao mesmo tempo, porque `resolver_pendencias_item_com_lancamentos` nunca grava `movimentacao_id` — comentário vivo em `itens.ts:791`), mas AMBAS têm que rodar antes de (3), porque as duas FKs de `lancamentos_item` são **imediatas** (não adiáveis) — um `DELETE` em `pendencias_item` com uma linha ainda referenciada por `lancamentos_item.pendencia_item_id` estoura na hora, dentro do mesmo comando.

**Não há outra ordem forçada por gatilho**: `valida_lancamento_item` é `BEFORE INSERT` só (confirmado, 0118:129) — os dois `UPDATE`s de (1)/(2) não o disparam. `guarda_acervo` (0081) cobre `UPDATE`/`DELETE` em `lancamentos_item`, mas a janela `estoque.dev_destrutivo` já está aberta pela orquestradora ANTES de chamar a auxiliar — então (1) e (2) passam livremente. `guarda_acervo` **não cobre `pendencias_item`** (é uma das três tabelas "FORA, de propósito" do cabeçalho da 0081) — o `DELETE` de (3) nunca precisou da janela, e continua não precisando (mas rodar dentro dela não atrapalha).

**Nenhum trigger em `pendencias_item`** reage a `DELETE` (só há o trigger de `aplicar_movimentacao` que É quem historicamente insere/deleta linhas de lá a partir de `movimentacoes`, mas isso é outro caminho, não um trigger EM `pendencias_item`).

### As chaves novas de `p_contagens`

Hoje `import_revalidar_contagens` lê 4 chaves: `ativos`, `movimentacoes`, `anotacoes`, `termos` (0131:253-256). Proponho **duas chaves novas**, no mesmo padrão de nome do retorno (substantivo no plural, sem prefixo):
- `pendencias_item` — contagem de `pendencias_item` cujo `ativo_id` está no acervo (o path 1/2, o "antes" que a Decisão precisa revalidar).
- **Não** proponho uma chave para "lançamentos desvinculados" nem para "substitutos anulados": esses dois não são coisas que existiam ANTES e sumiram (contagem que poderia ter mudado sob TOCTOU) — são o RESULTADO da operação, não uma pré-condição a revalidar. A revalidação de `import_revalidar_contagens` existe para fechar a janela TOCTOU entre o preview e o apply (fato/comentário 0131:244-251): ela precisa saber "quantas pendências do acervo existem AGORA vs. quando o preview foi gerado" — e é só isso que `pendencias_item` cobre. `lancamentos_item` presos (paths 3/4) **também** deveriam entrar na revalidação, pelo mesmo motivo TOCTOU (alguém pode ter criado um lançamento vinculado à movimentação/pendência do acervo ENTRE o preview e o apply) — proponho uma SEGUNDA chave nova: `lancamentos_vinculados` (contagem de `lancamentos_item` com `movimentacao_id` OU `pendencia_item_id` apontando para o acervo, somados — não precisa separar os dois na contagem, só na ação).

Resumo — **duas chaves novas**: `pendencias_item` e `lancamentos_vinculados`.

### Chave ausente = 0, conferida contra o vivo

```sql
v_e_pend := coalesce((p_contagens->>'pendencias_item')::int, -1);
v_e_lanc := coalesce((p_contagens->>'lancamentos_vinculados')::int, -1);
```

⚠ **NÃO seguir o precedente do reset** (`coalesce(...,-1)`, `0083:193-197`/`0089:166-170`) para as chaves NOVAS especificamente — esse precedente é correto para o reset porque lá TODAS as chaves são obrigatórias desde sempre (a função sempre exigiu as 5). Aqui, na janela entre o apply da 0140 e o deploy do código novo (fato 33), o `p_contagens` que o código VELHO manda **não tem** `pendencias_item` nem `lancamentos_vinculados` — se a regra fosse `-1`, TODO import nessa janela seria recusado (mesmo numa filial sem NENHUMA pendência/lançamento preso), o que é pior do que o `23503` de hoje (pelo menos hoje as filiais SEM o problema, CD e Serra, importam normalmente). A regra correta, que o próprio fato 33 já prescreve, é:

```sql
v_e_pend := coalesce((p_contagens->>'pendencias_item')::int, 0);
v_e_lanc := coalesce((p_contagens->>'lancamentos_vinculados')::int, 0);
-- ... e a comparação normal:
if v_conf_pend <> v_e_pend or v_conf_lanc <> v_e_lanc then raise ...
```
Isso significa: no código velho (sem essas chaves), a revalidação exige que a contagem VIVA seja ZERO — ou seja, **só as filiais que já estouravam continuam recusadas** (agora com mensagem, `22023`/`P0001`, em vez do `23503` cru), e as que não tinham o problema (CD, Serra) continuam passando. É exatamente o comportamento que o fato 33 pede.

### O retorno novo da orquestradora

A orquestradora (0132:565-574) monta o retorno com 8 chaves fixas. Proponho acrescentar, no molde do precedente `conflitos_abertos: z.number().default(0)` (`actions/importar.ts:157-171`, citado no fato 33):
```
'pendencias_apagadas',        v_pend,
'lancamentos_desvinculados',  v_lanc_desvinc,
'ponteiros_anulados',         v_subst_anulados,
```
e em `rpcRetornoSchema` (TS), as três com `.default(0)`.

### Prova de que o deploy fora de ordem não quebra em nenhuma direção

**(a) código velho no ar + RPC nova (0140 já aplicada, deploy do Next ainda não saiu)**: o código velho chama `importar_ativos_substituir` mandando `p_contagens` com só as 4 chaves antigas. A RPC nova lê `pendencias_item`/`lancamentos_vinculados` ausentes → `coalesce(...,0)` → exige que a filial tenha ZERO pendência/lançamento preso. Para CD/Serra (produção) isso passa igual a hoje. Para Matriz/Linhares/Eusébio/FilialTeste, a RPC recusa com mensagem — ANTES bombardeava com `23503` sem preview nenhum ter avisado; agora ainda recusa (o código velho não sabe pedir para desvincular, então a operação genuinamente NÃO é segura com o código velho — ele nunca vai gerar esses números no preview), mas com mensagem legível em vez de estouro cru. O retorno novo tem 3 chaves a mais que o código velho (`rpcRetornoSchema` velho) não conhece — **confirmado por leitura de `src/lib/actions/importar.ts:157-171`**: é um `z.object({...})` simples, sem `.strict()` (o precedente já é exatamente esse — `conflitos_abertos: z.number().default(0)`, comentário de `:165-169` explicando por escrito o mesmo raciocínio de deploy fora de ordem). Zod, por padrão, ignora chaves desconhecidas num `z.object` não-`.strict()`: o `safeParse` do código velho recebendo as 3 chaves novas passa normalmente, só não as lê.

**(b) código novo + RPC velha (deploy saiu antes do apply da 0140 — só acontece se a 0140 ficar presa no classificador, fato 31/critério 28)**: o código novo manda `p_contagens` com as 6 chaves (4 velhas + as 2 novas). A RPC velha (`import_revalidar_contagens` da 0131) só lê as 4 que conhece e **ignora** as 2 a mais — comportamento padrão de `jsonb->>'chave'` sobre um objeto com chave desconhecida simplesmente não usada, sem erro. A RPC velha continua vulnerável ao `23503` cru nas 4 filiais problemáticas — é exatamente o "código novo convive com a RPC antiga" que o critério 16/28 exige provar, e a prova É esta: a RPC velha não falha por receber chaves a mais, ela só não usa a proteção nova. O handoff da 0140 (se presa) precisa deixar isso escrito: enquanto a 0140 não aplicar, o preview do código novo PODE mostrar "N pendências e M lançamentos serão desvinculados" mas o apply ainda vai estourar `23503` nessas filiais — regressão de UX (a mensagem promete algo que a RPC velha não cumpre), não de segurança (nada é apagado errado).

---

## Armadilhas encontradas (além das já no cabeçalho)

1. **Bug do meu próprio SQL de medição** (documentado acima): join sem filtro de filial no CTE do acervo — fácil de repetir; qualquer query nova sobre `substitui_ativo_id` tem que filtrar os DOIS lados (`ac.filial_id = f.id` E `aout.filial_id <> f.id`), não só um.
2. **`ilike`/`grep` cru sobre `prosrc` conta comentário como código** — usar sempre `codigoVivo()` de `import-uma-porta.test.ts` (ou replicar a mesma limpeza) para qualquer prova nova que precise dizer "só uma função contém X".
3. **`coalesce(p_contagens->>'chave', -1)` não é a regra certa para chave NOVA** durante a janela de deploy fora de ordem — só é segura para chaves que SEMPRE existiram (o caso do reset). Confundir os dois precedentes recusaria todo import na janela entre apply e deploy, mesmo em filiais sem problema nenhum.
4. **`apagar_ativo`/`apagar_movimentacao`/`resetar_acervo`/`apagar_ativos_conflito_filiais` têm o MESMO defeito latente** (paths 3 e 4) e NÃO estão no escopo desta fase (decisão do Johnny) — mas qualquer um deles rodando hoje contra um ativo/movimentação/filial com lançamento de item vinculado vai estourar `23503` do mesmo jeito. Vale registrar no backlog nomeado com os arquivos exatos (0090 para as duas primeiras, 0089 para a terceira, 0132 para a quarta) para quem pegar essa fase depois não precisar remedir do zero.
5. **`termos_gerados`/`colaboradores`/`itens` não são um sexto caminho** — confirmado por ausência de FK. O único FK "extra" achado (`movimentacoes.estorno_de`) não precisa de tratamento NOVO, mas impõe uma restrição silenciosa sobre a IMPLEMENTAÇÃO (o delete de `movimentacoes` tem que continuar sendo um `DELETE` só, nunca um loop por linha) — se a 0140 "otimizar" isso para processar por ativo dentro do laço do passo 4 (que já existe para `import_criar_ativos`/`import_lancar_movimentacoes`), quebraria em qualquer ativo com estorno.

---

## Arquivo:linha — resumo para o implementador

- `supabase/migrations/0131_import_decomposto.sql:300-348` — `import_apagar_acervo_filial`, onde os quatro passos novos entram (ANTES do `delete from movimentacoes`, linha 314).
- `supabase/migrations/0131_import_decomposto.sql:226-280` — `import_revalidar_contagens`, onde `pendencias_item`/`lancamentos_vinculados` entram no `declare`/leitura/comparação.
- `supabase/migrations/0132_guardas_de_escopo.sql:565-574` — o `jsonb_build_object` do retorno da orquestradora, onde as 3 chaves novas entram.
- `supabase/migrations/0089_reset_backup_do_recorte.sql:202-204` — o precedente EXATO de "anular substitui_ativo_id de fora" a copiar (troque `p_filial is null or` pelo equivalente de filial única).
- `src/lib/queries/dev-destrutivo.ts:517-546` — o molde TS de `ponteiros_perdidos` que `exportarAcervoFilial` (import-logs.ts) vai espelhar para o backup versão 2.
- `src/lib/actions/importar.ts:90` (`RECUSAS_DA_RPC`) e `:157-171` (`rpcRetornoSchema`, onde `.default(0)` das 3 chaves novas entra, e onde CONFIRMAR se há `.strict()`).
- `src/lib/validators/import-uma-porta.test.ts:125-132` (`codigoVivo`) — reusar para qualquer prova de "só uma porta apaga" no relatório final da fase.

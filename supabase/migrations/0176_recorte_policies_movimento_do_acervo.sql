-- =============================================================================
-- 0176_recorte_policies_movimento_do_acervo.sql — F66 (24/09/2026): o recorte de empresa nas policies, lote 1, parte 2
-- =============================================================================
-- classe: ADITIVA (dez policies reescritas por alter policy; nenhuma tupla reescrita, nada derrubado)
--
-- A segunda metade do lote 1: as quatro tabelas QUENTES do acervo, na ordem da 0161 — `ativos`, `movimentacoes`,
-- `pendencias_item`, `lancamentos_item` —, a ordem em que o caminho de escrita do app toma os locks
-- (`criar_movimentacao_com_itens` trava os ativos primeiro, insere em `movimentacoes`, cujo gatilho volta a `ativos` e
-- abre `pendencias_item`, e só depois grava `lancamentos_item`). O porquê do recorte, da forma e do lock é o da 0175.
--
-- A TROCA DA ESCRITA POR UNIDADE (PLAN-F66.md, decisão 3; decisão 2 do Johnny). As seis policies que chamavam
-- `public.pode_escrever_filial(filial_id)` POR LINHA — as seis exceções `pode_escrever_filial` com destino F66 em
-- `k_excecoes_predicado` (a doutrina da F59, R-ACC-64/R-ACC-69) — passam à forma de PARES da MATRIZ (R-ACC-68):
--     empresa_id = any (array (select public.empresas_de_escrita()))
--     and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)
-- O termo de empresa dá o índice; o par decide a filial. Aqui a regra é TROCADA, não somada: sai SÓ a chamada de
-- `pode_escrever_filial(…)`; o `e_admin()` de "admin reabre", o `estorno_item_coerente` de "operador lanca" e as
-- condições de `status` ficam, no lugar em que estavam. As seis saem de `k_excecoes_predicado` no MESMO commit (a
-- catraca 11b reprova exceção sem ocorrência viva: 18 → 12).
--
-- A EQUIVALÊNCIA, com uma empresa (fato 9 da ordem F66): `pode_escrever_filial(f)` é `false` para `f` nulo, `true` para
-- dev/admin em QUALQUER filial (inclusive desativada), e, para o operador, "existe vínculo da membership legada em f";
-- `unidades_de_escrita()` devolve, para dev/admin, toda filial da empresa da membership, SEM filtro de `ativo` (a
-- desativada entra, como hoje), e, para o operador, as filiais vinculadas à própria membership. Com `f` nulo, o par
-- `(e, null) in (…)` é NULL — recusa, o mesmo "fecha em vez de abrir". A única diferença de domínio é `f` de filial que
-- NÃO existe (hoje `true` para admin; nos pares, ausente): a FK composta `(empresa_id, filial_id) → filiais` já recusa
-- essa linha antes. A prova, conta a conta, em produção (os cinco operadores com vínculo só existem lá): 0 divergência em
-- 84 pares e 14 memberships, antes (docs/f66-evidencias/conta-a-conta/producao-emulada-antes.json) e depois deste lote.
--
-- `movimentacoes / operador insere` tem DOIS pares: a filial declarada e a filial REAL do ativo, lida do snapshot da
-- própria linha — `(empresa_id, (snapshot_anterior ->> 'filial_id')::smallint) in (…)`. O `->>` é OPERADOR e o
-- `::smallint` é cast por I/O (COERCEVIAIO): nenhum dos dois é função que recebe a linha (R1), e a referência à linha
-- fica fora do sub-select (R3) — provado na árvore (asserções 11a/13b) e na mesa (predicado-policies.test.mts).
-- Snapshot nulo ou sem `filial_id` → recusa, como hoje (`pode_escrever_filial(null)` = false).
-- =============================================================================

set lock_timeout = '2s';

-- ativos (0070 a leitura; 0063 a escrita, as duas exceções da doutrina que saem)
alter policy "leitura operador" on public.ativos
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "operador insere" on public.ativos
  with check (empresa_id = any (array (select public.empresas_de_escrita()))
              and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u));

alter policy "operador atualiza" on public.ativos
  using (empresa_id = any (array (select public.empresas_de_escrita()))
         and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u))
  with check (empresa_id = any (array (select public.empresas_de_escrita()))
              and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u));

-- movimentacoes (0070 a leitura; 0067 a escrita: a filial declarada E a filial real do ativo, pelo snapshot)
alter policy "leitura operador" on public.movimentacoes
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "operador insere" on public.movimentacoes
  with check (empresa_id = any (array (select public.empresas_de_escrita()))
              and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)
              and (empresa_id, (snapshot_anterior ->> 'filial_id')::smallint)
                  in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u));

-- pendencias_item (0070 a leitura; 0103 "operador resolve"; 0107 "admin reabre")
alter policy "pendencias_item leitura operador" on public.pendencias_item
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "pendencias_item operador resolve" on public.pendencias_item
  using (empresa_id = any (array (select public.empresas_de_escrita()))
         and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)
         and status = 'aberta')
  with check (empresa_id = any (array (select public.empresas_de_escrita()))
              and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u));

alter policy "pendencias_item admin reabre" on public.pendencias_item
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin()))
         and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)
         and status = 'resolvida')
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin()))
              and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)
              and status = 'aberta');

-- lancamentos_item (0070 a leitura; 0068 a escrita — a coerência do estorno fica, é exceção PERMANENTE da doutrina)
alter policy "leitura operador" on public.lancamentos_item
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "operador lanca" on public.lancamentos_item
  with check (empresa_id = any (array (select public.empresas_de_escrita()))
              and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)
              and public.estorno_item_coerente(estorna_id, filial_id, item_id));

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f66-evidencias/impressao-policies.sql: as dez desta migration com o termo (seis com os pares, nenhuma citando
--   pode_escrever_filial); docs/f66-evidencias/impressao-catalogo.sql: o relfilenode das 20 IGUAL; a prova conta a conta
--   REAL do lote com 0 divergência (escrita por filial, leitura).
--
-- ROLLBACK (supabase/rollback/F66-desfaz.sql, passo 5): cada policy de volta ao texto de antes, por `alter policy`
-- literal — as seis de escrita voltam a `pode_escrever_filial(filial_id)` (0063/0067/0068/0103/0107) —, e as seis
-- linhas voltam a `k_excecoes_predicado` no mesmo commit do rollback de código.

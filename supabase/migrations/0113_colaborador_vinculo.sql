-- Migration 0113 — o vínculo, sempre anulável (F37, frente A · decisão D5).
--
-- ADITIVA e mínima: DUAS colunas anuláveis e dois índices parciais. Nada mais.
-- Nenhuma função, nenhum trigger, nenhuma policy é recriada.
--
-- ---------------------------------------------------------------------------
-- POR QUE NENHUMA FUNÇÃO PRECISA MUDAR (conferido no código, não presumido)
-- ---------------------------------------------------------------------------
-- `aplicar_movimentacao` é TRIGGER (`returns trigger`, criado em 0004 e recriado por
-- `create or replace` até a 0110) — não é uma RPC que monte a linha. Quem monta a
-- linha é o INSERT direto, e todo INSERT deste projeto usa LISTA DE COLUNAS
-- EXPLÍCITA. Conferi um a um os seis caminhos que escrevem nessas duas tabelas por
-- dentro de função:
--
--   criar_compra_lote (0064, invoker)          — insere compra, nunca carrega colaborador
--   devolver_ao_fornecedor (0047, invoker)     — devolucao_fornecedor + troca, idem
--   transferir_item (0104, invoker)            — par de ajustes, colaborador = null literal
--   importar_ativos_substituir (0094, definer)  — grava colaborador TEXTO, não id
--   forcar_estado_ativo (0110, definer)        — não referencia colaborador
--   forcar_saldo_item (0084, definer)          — não referencia colaborador
--
-- Nenhuma delas menciona a coluna nova: ela nasce NULL e continua NULL por esses
-- caminhos. Quem a grava é o fluxo normal (Server Action), que resolve a chave do
-- nome no servidor imediatamente antes do INSERT.
--
-- ---------------------------------------------------------------------------
-- O PASSADO É LIGADO POR CHAVE, NUNCA POR UPDATE (ordem F37 §A.3)
-- ---------------------------------------------------------------------------
-- `guarda_acervo` (0081) recusa UPDATE em `movimentacoes` e `lancamentos_item` para
-- TODO MUNDO — service role incluso — fora da janela `estoque.dev_destrutivo`:
--
--     raise exception 'Registro histórico não se altera: % é imutável…' errcode 42501
--
-- Isso não é um obstáculo a contornar: é a doutrina da casa. Portanto
-- `colaborador_id` só é gravado **no INSERT do registro novo**; a tela de
-- consolidação NÃO altera uma linha de histórico — ela cria/reaproveita CADASTROS a
-- partir das chaves distintas encontradas no texto —, e a resolução do passado é por
-- `nome_chave` na leitura. Se alguma implementação futura exigir UPDATE aqui para
-- funcionar, o desenho saiu do trilho: o banco vai recusar, e ele está certo.
-- O roteiro `supabase/tests/f37_colaboradores_tipos.sql` prova essa recusa por
-- asserção NEGATIVA, rodando como o DONO (que ignora RLS e chega ao trigger).
--
-- ROLLBACK LÓGICO: `alter table … drop column colaborador_id` nas duas. Aditiva:
-- nenhum dado do acervo se perde (a coluna nasce vazia).
-- ===========================================================================

alter table public.movimentacoes
  add column colaborador_id uuid references public.colaboradores (id);

alter table public.lancamentos_item
  add column colaborador_id uuid references public.colaboradores (id);

comment on column public.movimentacoes.colaborador_id is
  'Vínculo com o cadastro de pessoas (F37 · D5), SEMPRE anulável. Gravado só no INSERT do registro novo, resolvido no servidor pela chave normalizada do texto. Registro anterior à F37 fica nulo — e assim continua: guarda_acervo (0081) recusa UPDATE aqui, e o passado se resolve por chave na leitura. A coluna `colaborador` (texto) continua sendo o retrato da época e NÃO é substituída por esta.';
comment on column public.lancamentos_item.colaborador_id is
  'Espelho de movimentacoes.colaborador_id para o diário de itens por quantidade (F37 · D5). Anulável, gravado só no INSERT, texto preservado ao lado.';

-- ---------------------------------------------------------------------------
-- SEM ÍNDICE NENHUM AQUI — e isso é decisão, não esquecimento
-- ---------------------------------------------------------------------------
-- A primeira versão desta migration criava dois índices parciais sobre
-- `colaborador_id`, justificados como "o que a F38 vai consultar". A revisão
-- adversarial derrubou os dois, e tinha razão:
--
--   · a ordem F37 proíbe NOMINALMENTE "nenhum índice novo em `lancamentos_item`"
--     (§Fora), e o critério de aceitação 8 cobra `git diff` sem índice novo;
--   · nenhuma consulta DESTA fase filtra por `colaborador_id` — o índice existiria
--     para uma pergunta que ainda não é feita, que é a definição de otimizar antes
--     do número (o erro que a F33 documentou ter cometido e revertido);
--   · o §5 do docs/PLAN-F36-F39.md JÁ reserva esse índice para a migration da fase
--     seguinte, DEPOIS da medição — ele pertence a outra fase;
--   · e o precedente desta tabela é o oposto: a `0106` (F33/D3) investigou as FKs
--     sem índice e deixou `lancamentos_item` de fora DE PROPÓSITO, por ser pequena
--     ("índice ali é custo de escrita sem ganho de leitura mensurável"). Em
--     28/08/2026 ela tinha 30 linhas.
--
-- O Postgres não exige índice na coluna referenciadora de uma FK. Quando a fase
-- seguinte tiver o número que justifique, o índice entra lá — medido.

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name in ('movimentacoes','lancamentos_item')
--      and column_name='colaborador_id';
--   -- esperado: 2 linhas, uuid, YES
--   select count(*) as com_vinculo from public.movimentacoes where colaborador_id is not null;
--   -- esperado logo após o apply: 0 (nenhum registro histórico foi tocado)

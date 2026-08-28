-- Migration 0116 — o vínculo que não existe: o item aponta a movimentação (F38, frente A · D13).
--
-- ADITIVA e mínima: UMA coluna anulável e UM índice. Nenhuma função, nenhum
-- trigger e nenhuma policy é recriada.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA COLUNA RESOLVE
-- ---------------------------------------------------------------------------
-- Até aqui o acessório e o equipamento viviam em dois mundos que não se falavam:
-- `lancamentos_item` (0015) não tinha elo nenhum com `movimentacoes` — o único fio
-- era o campo de texto `chamado`, que nem sempre existe e nunca foi uma chave. Não
-- havia consulta possível para "o que foi junto com este notebook"; havia palpite.
-- Com esta coluna, a pergunta vira um JOIN.
--
-- ---------------------------------------------------------------------------
-- POR QUE SÓ `movimentacao_id`, E NUNCA `ativo_id`
-- ---------------------------------------------------------------------------
-- A movimentação JÁ aponta o ativo (`movimentacoes.ativo_id`, 0003). Uma segunda
-- cópia da mesma verdade nesta tabela seria um lugar novo para as duas discordarem
-- — e nada no banco as manteria de acordo, porque não existe FK composta que ligue
-- (lancamento → ativo) a (lancamento → movimentacao → ativo). "O que foi junto com
-- este notebook" é:
--
--     select li.* from public.lancamentos_item li
--       join public.movimentacoes m on m.id = li.movimentacao_id
--      where m.ativo_id = :ativo;
--
-- ---------------------------------------------------------------------------
-- FK IMEDIATA — e por que aqui NÃO precisa ser `deferrable`
-- ---------------------------------------------------------------------------
-- Em `pendencias_item` (0050) a FK para `movimentacoes` teve de ser DEFERRABLE
-- INITIALLY DEFERRED por um motivo concreto: quem insere aquelas linhas é o trigger
-- `aplicar_movimentacao`, que é BEFORE INSERT em `movimentacoes` — quando ele roda,
-- a linha da movimentação AINDA não está na heap, e uma FK imediata falharia.
--
-- Aqui a situação é a oposta, e isso foi CONFERIDO no código, não presumido: quem
-- grava `movimentacao_id` é a RPC `criar_movimentacao_com_itens` (0117), que insere
-- a movimentação INTEIRA — passando pelo BEFORE INSERT e chegando à heap — e só
-- depois insere os lançamentos de item, na MESMA transação. A linha referenciada já
-- existe no instante do INSERT do item. FK imediata é o desenho certo: falha cedo,
-- no statement que errou, e não no COMMIT.
--
-- ---------------------------------------------------------------------------
-- ANULÁVEL, SEM DEFAULT, E NENHUM REGISTRO HISTÓRICO É ALTERADO
-- ---------------------------------------------------------------------------
-- Todo lançamento de hoje continua válido com a coluna nula, e o LANÇAMENTO AVULSO
-- da tela de itens (o carrinho, que não nasce de movimentação nenhuma) continua
-- nascendo com ela nula para sempre — não é dívida, é o desenho. Nenhum UPDATE de
-- backfill roda aqui: `guarda_acervo` (0081) recusaria, e ela está certa.
--
-- ---------------------------------------------------------------------------
-- O ÍNDICE É ESTRUTURAL, NÃO OTIMIZAÇÃO
-- ---------------------------------------------------------------------------
-- Precedente 0106 (F33/D3, "índices de FK de movimentações"): a coluna que
-- referencia existe para ser consultada pelo join E para não transformar cada
-- `on delete` das ferramentas do /dev (0084/0093) numa varredura da tabela inteira.
-- Isso é diferente do índice de saldo por pessoa
-- (`lanc_item_colaborador_idx (colaborador_id, item_id, filial_id)`), que a 0113
-- deixou nominalmente para esta fase e que **só entra com o número da curva na
-- mão** (D6). Um é estrutura; o outro, otimização — e otimização sem medida não
-- entra.
--
-- ACESSO: nada a fazer. `lancamentos_item` já tem RLS com "leitura operador"
-- (SELECT pelo piso `papel_atual() is not null`) e "operador lanca" (INSERT com
-- `pode_escrever_filial(filial_id) and estorno_item_coerente(...)`, 0068). Policy
-- não enumera coluna: a coluna nova entra nas policies existentes sem que nenhuma
-- delas seja reescrita.
--
-- ROLLBACK LÓGICO:
--   drop index if exists public.lanc_item_mov_idx;
--   alter table public.lancamentos_item drop column movimentacao_id;
-- Aditiva: nenhum dado do acervo se perde (a coluna nasce vazia).
-- ===========================================================================

alter table public.lancamentos_item
  add column movimentacao_id uuid references public.movimentacoes (id);

comment on column public.lancamentos_item.movimentacao_id is
  'A movimentação com que este item ANDOU JUNTO (F38 · D13), sempre anulável. Gravada só no INSERT, pela RPC criar_movimentacao_com_itens (0117), na mesma transação em que a movimentação nasce. Lançamento avulso do carrinho de itens nasce e continua com ela nula — não é dívida, é o desenho. NÃO existe ativo_id aqui de propósito: a movimentação já aponta o ativo, e uma segunda cópia da mesma verdade é um lugar novo para as duas discordarem.';

create index lanc_item_mov_idx on public.lancamentos_item (movimentacao_id);

comment on index public.lanc_item_mov_idx is
  'Índice de FK (estrutural, precedente 0106): serve ao join "o que foi junto com este ativo" e evita varredura no on delete das ferramentas do /dev. Não confundir com o índice de saldo por pessoa, que depende da curva de desempenho (D6).';

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='lancamentos_item'
--      and column_name='movimentacao_id';
--   -- esperado: 1 linha, uuid, YES
--
--   select count(*) as com_vinculo from public.lancamentos_item where movimentacao_id is not null;
--   -- esperado logo após o apply: 0 (nenhum registro histórico foi tocado)
--
--   select conname, condeferrable, condeferred
--     from pg_constraint
--    where conrelid = 'public.lancamentos_item'::regclass and contype = 'f'
--      and conname like '%movimentacao%';
--   -- esperado: 1 linha, condeferrable = f, condeferred = f (FK IMEDIATA)
--
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='lancamentos_item' and indexname='lanc_item_mov_idx';
--   -- esperado: 1 linha

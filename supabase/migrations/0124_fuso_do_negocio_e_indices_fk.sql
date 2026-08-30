-- =============================================================
-- 0124 — O FUSO DO NEGÓCIO NO BANCO + índices que faltavam nas FKs
-- Auditoria de design de sistema, 30/08/2026. Fecha a CLASSE do item W da
-- dívida técnica (`docs/DIVIDA-TECNICA.md`) e o achado de FK sem índice do
-- linter do Supabase. Migration ADITIVA: não apaga nem altera nenhum dado.
--
-- ---------------------------------------------------------------
-- PARTE 1 — `current_date` passa a ser a data de São Paulo
-- ---------------------------------------------------------------
-- O DEFEITO (aberto desde 25/07/2026 como item S, agravado como item W em
-- 12/08): a sessão do Postgres roda em UTC, então entre 21:00 e 23:59 BRT o
-- banco acha que já é AMANHÃ. Toda RPC que grava `data` com `current_date`
-- carimba o dia seguinte, e `rel_estoque_asof` (que só considera existente o
-- ativo com `m.data <= p_data`) faz o lançamento SUMIR do relatório do próprio
-- dia em que foi feito. O TypeScript já resolvia isso com `hojeISO()`
-- (`src/lib/format.ts`, fuso America/Sao_Paulo); o SQL nunca teve o par.
--
-- A CORREÇÃO ANTERIORMENTE PLANEJADA era criar uma função `hoje()` e trocar
-- `current_date` por ela em cada RPC. Isso significaria RECRIAR INTEIRAS sete
-- funções de ~200 a 470 linhas (0084, 0104, 0110, 0117, 0119, 0121, 0122,
-- 0123 e a do import) — exatamente o item X da mesma dívida, o mecanismo que
-- espalhou este defeito em primeiro lugar. Corrigir um item multiplicando o
-- outro é troca ruim.
--
-- A CORREÇÃO ADOTADA é de configuração: o banco inteiro passa a viver no fuso
-- do negócio. `current_date`, `now()::date` e todo cast implícito de
-- timestamptz para date acertam de uma vez — nas funções de hoje, nas de
-- ontem e nas que ainda não foram escritas. Nenhuma linha de RPC muda.
--
-- POR QUE É SEGURO AQUI (medido em produção em 30/08/2026):
--   · TODAS as colunas de tempo do schema `public` são `timestamptz` — zero
--     `timestamp without time zone`. Coluna timestamptz guarda um INSTANTE:
--     o valor gravado não muda com o fuso da sessão, só a representação.
--   · O que muda na API é o offset do texto que o PostgREST devolve
--     (`…+00` → `…-03`) — mesmo instante. O app faz `new Date(...)` e formata
--     com `Intl` no fuso America/Sao_Paulo (`src/lib/format.ts`), então a tela
--     não muda; e as duas conversões `toISOString().slice(0,10)` que existem
--     (`queries/eventos-admin.ts`, `dev/acoes-export.ts`) operam sobre um
--     `Date` do JS, que não conhece o fuso do banco.
--   · Colunas `date` não têm fuso e não mudam.
--   · É reversível com um comando (`set timezone = 'UTC'`).
--
-- Vale para CONEXÃO NOVA (o `alter database` não altera as abertas), o que
-- torna o efeito gradual e sem janela de indisponibilidade.
do $$
begin
  execute format(
    'alter database %I set timezone = %L',
    current_database(),
    'America/Sao_Paulo'
  );
end $$;

-- ---------------------------------------------------------------
-- PARTE 2 — `hoje_brt()`: a intenção escrita, independente da configuração
-- ---------------------------------------------------------------
-- A Parte 1 conserta o efeito; esta função conserta a INTENÇÃO. Ela devolve a
-- data de São Paulo mesmo que alguém reverta o parâmetro do banco, e dá a quem
-- escrever RPC nova algo explícito para chamar — que era a queixa do item W
-- ("o TS tem `hojeISO()`; o SQL não tem par"). `supabase/tests/fuso_do_negocio.sql`
-- prova as duas camadas no CI.
create or replace function public.hoje_brt()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

comment on function public.hoje_brt() is
  'A data de HOJE no fuso do negócio (America/Sao_Paulo). Par SQL do hojeISO() do TypeScript. Use em RPC nova no lugar de current_date — que também está correto desde a 0124, mas por configuração do banco, não por escrito.';

-- ---------------------------------------------------------------
-- PARTE 3 — índices para as chaves estrangeiras que as telas percorrem
-- ---------------------------------------------------------------
-- O linter do Supabase acusa 15 FKs sem índice de cobertura. Entram aqui as
-- QUATRO que uma tela realmente filtra — as outras onze são colunas de autoria
-- (`criado_por`, `gerado_por`) que ninguém consulta por si só e cujo pai
-- (`profiles`) nunca é apagado, e sim ARQUIVADO (`excluido_em`, migration 0073).
-- Índice que ninguém usa é custo de escrita e ruído: o mesmo linter já lista
-- seis índices nunca usados neste banco.
create index if not exists eventos_admin_autor_idx
  on public.eventos_admin (autor);
-- a aba Auditoria de /admin/usuarios filtra por autor (`auditoria-filtro-dev`)

create index if not exists movimentacoes_colaborador_idx
  on public.movimentacoes (colaborador_id);
-- "Com esta pessoa" (F38) e a ficha do colaborador percorrem a coluna

create index if not exists colaboradores_filial_idx
  on public.colaboradores (filial_id);
-- /admin/colaboradores lista por filial (F37)

create index if not exists itens_tipo_idx
  on public.itens (tipo_id);
-- a coluna "Tipo" de /admin/itens junta com `tipos_item` (F37)

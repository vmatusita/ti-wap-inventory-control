-- Migration 0011 — funções de AGREGAÇÃO dos relatórios (OS-F3 3.1).
-- As séries por período (por mês, por motivo, resumo) podem passar do teto de
-- 1.000 linhas do PostgREST se buscadas linha a linha. Aqui a agregação roda no
-- Postgres e devolve poucas linhas — eficiente e alinhado ao "lógica crítica no
-- banco" (CLAUDE.md). `p_filial` null = consolidado (todas as filiais).
--
-- SECURITY INVOKER: para o operador logado respeitam a RLS (select = authenticated);
-- a sessão por senha as executa via client administrativo (service_role, sem RLS).
-- Só saída e devolução entram (os dois tipos que o e-mail semanal reporta).
-- Aplicar no projeto de DESENVOLVIMENTO.

-- Saídas × devoluções por mês, no período.
create or replace function public.rel_mov_por_mes(
  p_filial smallint,
  p_de     date,
  p_ate    date
) returns table (mes date, tipo public.tipo_movimentacao, total bigint)
language sql stable security invoker set search_path = public as $$
  select date_trunc('month', m.data)::date as mes, m.tipo, count(*)::bigint
  from public.movimentacoes m
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and (p_filial is null or m.filial_id = p_filial)
  group by 1, 2
  order by 1, 2;
$$;

-- Contagem por motivo (rótulo), separada por tipo. Motivo nulo/legado cai em 'Outro'.
create or replace function public.rel_por_motivo(
  p_filial smallint,
  p_de     date,
  p_ate    date
) returns table (tipo public.tipo_movimentacao, motivo text, total bigint)
language sql stable security invoker set search_path = public as $$
  select m.tipo,
         coalesce(mo.rotulo, m.motivo, 'Outro') as motivo,
         count(*)::bigint
  from public.movimentacoes m
  left join public.motivos mo on mo.codigo = m.motivo
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and (p_filial is null or m.filial_id = p_filial)
  group by m.tipo, coalesce(mo.rotulo, m.motivo, 'Outro')
  order by 3 desc;
$$;

-- Quebra profunda p/ o texto do resumo: tipo → filial → motivo → categoria.
create or replace function public.rel_resumo(
  p_filial smallint,
  p_de     date,
  p_ate    date
) returns table (
  tipo        public.tipo_movimentacao,
  filial_slug text,
  filial_nome text,
  motivo      text,
  categoria   public.categoria_ativo,
  total       bigint
) language sql stable security invoker set search_path = public as $$
  select m.tipo, f.slug, f.nome,
         coalesce(mo.rotulo, m.motivo, 'Outro') as motivo,
         a.categoria, count(*)::bigint
  from public.movimentacoes m
  join public.ativos a  on a.id = m.ativo_id
  join public.filiais f on f.id = m.filial_id
  left join public.motivos mo on mo.codigo = m.motivo
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and (p_filial is null or m.filial_id = p_filial)
  group by m.tipo, f.slug, f.nome, coalesce(mo.rotulo, m.motivo, 'Outro'), a.categoria
  order by f.nome, motivo, a.categoria;
$$;

revoke all on function public.rel_mov_por_mes(smallint, date, date) from public;
revoke all on function public.rel_por_motivo(smallint, date, date) from public;
revoke all on function public.rel_resumo(smallint, date, date)     from public;
grant execute on function public.rel_mov_por_mes(smallint, date, date) to authenticated, service_role;
grant execute on function public.rel_por_motivo(smallint, date, date) to authenticated, service_role;
grant execute on function public.rel_resumo(smallint, date, date)     to authenticated, service_role;

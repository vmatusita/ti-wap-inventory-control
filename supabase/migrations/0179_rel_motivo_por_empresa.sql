-- =============================================================================
-- 0179_rel_motivo_por_empresa.sql — F66 (24/09/2026): as duas rel_* juntam `motivos` pelo PAR (empresa_id, codigo)
-- =============================================================================
-- classe: ADITIVA (duas funções recriadas por create or replace, com UMA condição a mais no join; nada derrubado)
--
-- Desde a 0168 (F65) a PK de `motivos` é `(empresa_id, codigo)`, e a FK composta `movimentacoes_motivo_fkey`
-- `(empresa_id, motivo) → motivos (empresa_id, codigo)` garante que o par da movimentação existe. As duas funções de
-- relatório criadas na 0143 (F60) juntavam só pelo código — `left join public.motivos mo on mo.codigo = m.motivo` —: com
-- duas empresas e o mesmo código de motivo, a linha do relatório DUPLICARIA para quem lê as duas. Sendo `security
-- invoker`, depois das 0175–0178 a RLS de `motivos` já esconde o motivo da outra empresa de quem é membro de UMA só; a
-- duplicata sobraria para o membro das duas (os cenários 10i e 10j de supabase/tests/isolamento_tenant.sql provam as duas coisas).
-- O conserto é o par da FK: `and mo.empresa_id = m.empresa_id`, na mesma linha do join (PLAN-F66.md, decisão 9).
--
-- O RESTO DO CORPO BYTE A BYTE com o da 0143 (o diff do `prosrc` antes × depois é essa linha e só ela — a sonda de
-- exatidão da fase o confere nos dois bancos). A assinatura, `language sql stable security invoker set search_path =
-- public`, e o recorte por `p_filiais` ficam (as travas das rel_*: bloco 7 de catalogo_secdef.sql, e a mesa
-- rpcs-recorte-sql.test.ts). `create or replace` PRESERVA o dono e os privilégios (o `revoke … from public, anon` e o
-- `grant execute … to authenticated, service_role` da 0143 continuam valendo; nada a reemitir). Ler `m.empresa_id` e
-- `mo.empresa_id` aqui é INTEGRIDADE de junção, não recorte — as duas entram como exceção nominal, por comando, em
-- `k_leitura_tenant` (catalogo_policies.sql, asserção 15h). Com uma empresa só, a condição a mais é inerte: toda linha
-- de `movimentacoes` tem o par em `motivos` ou nenhum (a `left join` fica igual) — a equivalência antes × depois está em
-- docs/f66-evidencias/ (0 célula divergente nos dois bancos). Nenhum índice novo: a junção continua pela PK.
-- =============================================================================

set lock_timeout = '2s';

create or replace function public.rel_por_motivo_filiais(
  p_filiais smallint[],
  p_de      date,
  p_ate     date
) returns table (tipo public.tipo_movimentacao, motivo text, total bigint)
language sql stable security invoker set search_path = public as $$
  select m.tipo,
         coalesce(mo.rotulo, m.motivo, 'Outro') as motivo,
         count(*)::bigint
  from public.movimentacoes m
  left join public.motivos mo on mo.codigo = m.motivo and mo.empresa_id = m.empresa_id
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and m.filial_id = any (p_filiais)
  group by m.tipo, coalesce(mo.rotulo, m.motivo, 'Outro')
  order by 3 desc;
$$;

create or replace function public.rel_resumo_filiais(
  p_filiais smallint[],
  p_de      date,
  p_ate     date
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
  left join public.motivos mo on mo.codigo = m.motivo and mo.empresa_id = m.empresa_id
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and m.filial_id = any (p_filiais)
  group by m.tipo, f.slug, f.nome, coalesce(mo.rotulo, m.motivo, 'Outro'), a.categoria
  order by f.nome, motivo, a.categoria;
$$;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   o md5 do `prosrc` das duas (docs/f66-evidencias/impressao-catalogo.sql, `as_da_f66`) igual ao calculado do arquivo;
--   `md5_sem_as_da_f66` IGUAL ao do "antes" (nenhuma outra função mudou); `proacl`, `prosecdef = false`,
--   `provolatile = 's'` e `proconfig = {search_path=public}` como antes; a equivalência antes × depois (0 célula).
--
-- ROLLBACK (supabase/rollback/F66-desfaz.sql, passo 2): `create or replace` das duas com o corpo da 0143 (o join só pelo
-- código) — o texto está lá, por extenso.

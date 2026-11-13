-- =============================================================================
-- 0192_termo_por_empresa.sql — F67 (13/11/2026): a TRAVA DO TERMO — o banco recusa termo de empresa sem modelo próprio
-- =============================================================================
-- classe: ADITIVA (duas funções NOVAS e um gatilho BEFORE INSERT novo; nenhuma linha existente muda)
--
-- Os 7 modelos `.docx` (src/templates/termos/) carregam a identidade da WAP como TEXTO FIXO — razão social e CNPJ nos 5 de
-- responsabilidade, "para a empresa WAP" nos 2 de devolução, "WAP" no cabeçalho de todos (decisão 7 do plano). Emitir
-- termo para outra empresa é gerar DOCUMENTO FALSO, assinado. Esta migration põe a recusa NO BANCO (docs/PLAN-F67.md,
-- decisão 11):
--
--   empresas_com_modelo_de_termo()     a FONTE ÚNICA: um `uuid[]` literal, `immutable`, hoje só com a WAP. Liberar uma
--                                      empresa = migration NOVA junto com os modelos `.docx` dela (código, não um clique —
--                                      uma coluna-interruptor em `empresas` viraria um botão que gera documento falso).
--   termo_exige_modelo_da_empresa      o gatilho BEFORE INSERT em `termos_gerados`: empresa fora da lista → 42501, com
--                                      *"A emissão de termo ainda não está disponível para esta empresa."*.
--
-- Vale para TODO papel: gatilho não se contorna por `service_role` nem por `postgres`, e `insert … on conflict do update`
-- passa pelo BEFORE INSERT antes de decidir o conflito. O UPDATE que trocasse a empresa de um termo já é recusado por
-- `guarda_empresa` (0173). O NOME ordena este gatilho ANTES de `termos_gerados_ids_da_empresa` (os BEFORE do mesmo evento
-- disparam em ordem alfabética — PG 17, sql-createtrigger: `termo_` < `termos`): a recusa de empresa vem antes da de ids;
-- e `zz_guarda_empresa` continua o último BEFORE (a trava estrutural da F65). A função do gatilho lê `new.empresa_id`:
-- entra em `k_leitura_tenant` (catalogo_policies.sql) com `termos_gerados`, o motivo escrito lá.
--
-- Até a F67C todo termo do app nasce WAP pelo default da coluna — a trava não recusa nada do dia a dia; ela se prova no
-- roteiro supabase/tests/termo_bloqueado.sql, com a empresa B por extenso.
-- =============================================================================

set lock_timeout = '2s';

create function public.empresas_com_modelo_de_termo()
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  -- A WAP (o literal de public.empresa_legada(), 0152). Uma empresa nova entra aqui SÓ com os modelos .docx dela.
  select array['00000000-0000-4000-a000-000000000001'::uuid]
$$;

create function public.termo_exige_modelo_da_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (new.empresa_id = any (public.empresas_com_modelo_de_termo())) then
    raise exception 'A emissão de termo ainda não está disponível para esta empresa.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger termo_exige_modelo_da_empresa
  before insert on public.termos_gerados
  for each row execute function public.termo_exige_modelo_da_empresa();

comment on function public.empresas_com_modelo_de_termo() is
  'F67 (0192): as empresas que TÊM modelo próprio de termo (.docx) — a fonte única da trava do termo. Hoje só a WAP. Liberar uma empresa é migration nova junto com os modelos dela.';
comment on function public.termo_exige_modelo_da_empresa() is
  'F67 (0192): gatilho BEFORE INSERT de termos_gerados — recusa (42501) termo de empresa sem modelo próprio. Ordena antes de termos_gerados_ids_da_empresa.';

-- O gatilho roda com o privilégio de QUEM insere (invoker), e chama a lista: `authenticated` (o app) e `service_role` (a
-- restauração de backup) precisam de EXECUTE nela — uma constante `immutable`, sem leitura de tabela. `anon`, não. A
-- função do gatilho em si não precisa de EXECUTE de ninguém (o Postgres não o confere ao disparar), e fica fechada.
revoke all on function public.empresas_com_modelo_de_termo() from public, anon;
grant execute on function public.empresas_com_modelo_de_termo() to authenticated, service_role;
revoke all on function public.termo_exige_modelo_da_empresa() from public, anon, authenticated, service_role;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   termos_gerados com QUATRO gatilhos não internos (termo_exige_modelo_da_empresa, termos_gerados_guarda_empresa,
--   termos_gerados_ids_da_empresa, zz_guarda_empresa), o novo habilitado ('O'), BEFORE INSERT por linha; a lista com
--   EXECUTE só de authenticated e service_role; a função do gatilho sem EXECUTE para os quatro papéis; o md5 do prosrc =
--   o do CI.
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, o segundo passo — logo depois de recriar as assinaturas antigas): derrubar o
-- gatilho e as duas funções. Nenhum dado se perde (o gatilho só recusa; nunca escreve).

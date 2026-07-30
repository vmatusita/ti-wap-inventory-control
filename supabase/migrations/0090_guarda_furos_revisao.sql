-- Migration 0090 — F23: três furos que a REVISÃO ADVERSARIAL da própria fase encontrou.
--
-- =============================================================================
-- 1) TRUNCATE passava POR CIMA da guarda — trigger de LINHA não vê TRUNCATE
-- =============================================================================
-- A `0081` guarda INSERT/UPDATE/DELETE com triggers `for each row`. **TRUNCATE não dispara
-- trigger de linha** (só `FOR EACH STATEMENT`), e a RLS **não se aplica a TRUNCATE** — quem
-- manda ali é o privilégio de tabela. Medido: `anon`, `authenticated` e `service_role` TÊM
-- `TRUNCATE` em `ativos`, `movimentacoes` e `lancamentos_item` (default privilege do Supabase).
--
-- Ou seja: a fase inteira construiu uma porta trancada e deixou a parede aberta ao lado. Um
-- `truncate public.movimentacoes` levava o acervo sem passar por guarda, cargo, backup ou
-- trilha. Hoje o PostgREST não emite TRUNCATE (a API só faz SELECT/INSERT/UPDATE/DELETE/RPC),
-- então não era alcançável pela anon key — mas qualquer conexão direta, script ou função
-- `security definer` futura chegaria lá, e "hoje não é alcançável" não é uma garantia.
--
-- REVOGADO das três, e também das demais tabelas do acervo, pelo mesmo raciocínio.
-- ⚠ O `postgres` (dono) mantém TRUNCATE — é ele quem roda migration.
revoke truncate on
  public.ativos,
  public.movimentacoes,
  public.lancamentos_item,
  public.pendencias_item,
  public.anotacoes,
  public.termos_gerados
  from anon, authenticated, service_role;

-- =============================================================================
-- 2) `resetar_dados_ficticios` só roda onde o BANCO diz que é de desenvolvimento
-- =============================================================================
-- O achado: a `0083` deu ao service role UMA chamada capaz de zerar o acervo inteiro, sem
-- cargo, sem backup, sem contagens e sem trilha. A defesa registrada era `scripts/env-guard.ts`
-- (a lista `REFS_DE_PRODUCAO`) — mas essa defesa é do lado do SCRIPT: qualquer outro caller com
-- a service key passa por fora dela.
--
-- A tentativa óbvia — marcar o ambiente num GUC de banco (`alter database … set
-- estoque.ambiente`) — **não é possível no Supabase**: o papel `postgres` do projeto não tem
-- permissão para definir parâmetro customizado (medido: `42501 permission denied to set
-- parameter`). Então o marcador vira DADO, que é onde diferença de ambiente deve mesmo morar.
--
-- `public.ambiente` nasce VAZIA nas duas bases. A linha `'desenvolvimento'` é inserida **só no
-- ensaio**, à mão, uma vez. Em produção a tabela existe e continua vazia — e a função recusa
-- estruturalmente, não por confiar num arquivo de configuração do lado de fora.
create table if not exists public.ambiente (
  rotulo     text primary key,
  criado_em  timestamptz not null default now(),
  observacao text
);

comment on table public.ambiente is
  'F23: marcador de AMBIENTE, e o único consumidor é resetar_dados_ficticios(). Nasce VAZIA em toda base; a linha ''desenvolvimento'' é inserida À MÃO apenas nas bases que NÃO são produção. Produção fica vazia de propósito — é isso que faz o reset de dados fictícios recusar lá dentro do próprio banco, em vez de depender da lista REFS_DE_PRODUCAO do scripts/env-guard.ts, que só protege quem passa pelo script. Não é configuração da aplicação: nada no app lê esta tabela.';

alter table public.ambiente enable row level security;
-- Sem NENHUMA policy: invisível para anon e authenticated. Só o dono (e as funções
-- `security definer` dele) enxerga — mesmo idioma de `senhas_acesso`/`senha_tentativas`.
revoke all on public.ambiente from anon, authenticated, service_role;

create or replace function public.resetar_dados_ficticios(p_confirmacao text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativos int; v_movs int; v_anot int; v_lanc int; v_pend int; v_termos int; v_itens int;
begin
  -- ⚠ A TRAVA DE AMBIENTE, dentro do banco. Ver o cabeçalho desta migration: produção não tem
  -- a linha, então esta função é inerte lá — independentemente de quem chame e de qual script.
  if not exists (select 1 from public.ambiente where rotulo = 'desenvolvimento') then
    raise exception 'Esta base não está marcada como de desenvolvimento: o reset de dados fictícios é recusado aqui.'
      using errcode = '42501';
  end if;

  if btrim(coalesce(p_confirmacao, '')) <> 'RESETAR DADOS FICTICIOS' then
    raise exception 'Confirmação ausente ou incorreta para o reset de dados fictícios.'
      using errcode = '22023';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item;   get diagnostics v_pend   = row_count;
  delete from public.anotacoes;         get diagnostics v_anot   = row_count;
  delete from public.lancamentos_item;  get diagnostics v_lanc   = row_count;
  delete from public.termos_gerados;    get diagnostics v_termos = row_count;
  delete from public.movimentacoes;     get diagnostics v_movs   = row_count;
  update public.ativos set substitui_ativo_id = null where substitui_ativo_id is not null;
  delete from public.ativos;            get diagnostics v_ativos = row_count;
  delete from public.itens;             get diagnostics v_itens  = row_count;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  return jsonb_build_object(
    'ativos', v_ativos, 'movimentacoes', v_movs, 'anotacoes', v_anot,
    'lancamentos_item', v_lanc, 'pendencias_item', v_pend,
    'termos_gerados', v_termos, 'itens', v_itens);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.resetar_dados_ficticios(text) is
  'F23: o caminho NOMEADO que `npm run db:reset` usa para zerar o acervo de um banco de DESENVOLVIMENTO. Recusa (42501) em qualquer base que não tenha a linha ''desenvolvimento'' em public.ambiente — produção não tem, e é essa a trava, dentro do banco. A lista REFS_DE_PRODUCAO do scripts/env-guard.ts continua valendo como primeira barreira, mas deixou de ser a ÚNICA. Execute só para service_role.';

revoke all on function public.resetar_dados_ficticios(text) from public, anon, authenticated;
grant execute on function public.resetar_dados_ficticios(text) to service_role;

-- =============================================================================
-- 3) Apagar um ESTORNO deixava pendências de item perdidas em silêncio
-- =============================================================================
-- Sequência: uma `devolucao` D cria pendências de item P; o ESTORNO E de D restaura o ativo e
-- APAGA P (o "estorno-strip" da F18, dentro de `aplicar_movimentacao`). Apagar E depois
-- restaurava o ativo ao estado pós-D — mas **P não voltava**, porque quem as apagou foi o
-- estorno, não a movimentação que está sendo removida. O resultado é um ativo que voltou a
-- "devolvido com itens faltantes" e uma fila de pendências que não sabe disso. Silencioso.
--
-- CORREÇÃO: RECUSAR apagar movimentação de tipo `estorno`. Mesma doutrina da recusa de empate
-- (`0087`): quando o efeito não é reconstruível com o que o banco tem, uma ferramenta
-- irreversível recusa em vez de deixar um estado meio-certo. Quem quiser desfazer o estorno
-- tem "Forçar estado", que registra a correção na linha do tempo em vez de apagar história.
create or replace function public.apagar_movimentacao(
  p_mov           uuid,
  p_confirmacao   text,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m        public.movimentacoes%rowtype;
  v_a        public.ativos%rowtype;
  v_uid      uuid := (select auth.uid());
  v_esperado text;
  v_total    int;
  v_pend     int := 0;
  v_backup   jsonb;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_m from public.movimentacoes where id = p_mov;
  if v_m.id is null then
    raise exception 'Movimentação não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_a from public.ativos where id = v_m.ativo_id for update;
  if v_a.id is null then
    raise exception 'O ativo desta movimentação não existe mais.' using errcode = 'P0002';
  end if;

  v_esperado := coalesce(nullif(btrim(v_a.patrimonio), ''),
                         nullif(btrim(v_a.service_tag), ''),
                         v_a.id::text);
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" (o ativo desta movimentação) para apagá-la.', v_esperado
      using errcode = '22023';
  end if;

  -- ESTORNO → RECUSA (0090). Ver o cabeçalho: o estorno APAGA pendências de item ao acontecer,
  -- e apagá-lo não as traz de volta — o ativo voltaria a um estado que a fila de pendências
  -- não reflete.
  if v_m.tipo = 'estorno' then
    raise exception 'Esta é uma movimentação de ESTORNO, e apagá-la não devolve as pendências de item que o estorno removeu — o ativo voltaria a um estado que a fila de pendências não reflete. Use "Forçar estado" para acertar o ativo mantendo o histórico.'
      using errcode = '42501';
  end if;

  -- EMPATE DE created_at → RECUSA (0087).
  if exists (
    select 1 from public.movimentacoes m
     where m.ativo_id = v_m.ativo_id
       and m.id <> v_m.id
       and m.created_at = v_m.created_at
  ) then
    raise exception 'Este ativo tem movimentações gravadas no mesmo instante (é o caso dos ativos que vieram do import de startup), então não dá para dizer com segurança qual é a última. Para desmontar este ativo, use "Apagar ativo", que leva o rastro inteiro.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.movimentacoes m
     where m.ativo_id = v_m.ativo_id
       and (m.created_at, m.id) > (v_m.created_at, v_m.id)
  ) then
    raise exception 'Só a última movimentação do ativo pode ser apagada — esta tem outras depois dela. Apague as posteriores primeiro (da mais nova para a mais antiga).'
      using errcode = '42501';
  end if;

  select count(*) into v_total from public.movimentacoes where ativo_id = v_m.ativo_id;
  if v_total <= 1 then
    raise exception 'Esta é a única movimentação do ativo — apagá-la deixaria um ativo sem nascimento. Use "Apagar ativo", que leva o ativo e o rastro inteiro.'
      using errcode = '42501';
  end if;

  if v_m.snapshot_anterior is null then
    raise exception 'Esta movimentação não tem o retrato do estado anterior — não é possível recompor o ativo apagando-a. Use "Forçar estado" para acertar o ativo e mantenha o histórico.'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.termos_gerados t where p_mov = any (t.movimentacao_ids)) then
    raise exception 'Existe um termo gerado a partir desta movimentação. Apague o termo antes, ou apague o ativo inteiro.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
           'movimentacao', to_jsonb(v_m),
           'ativo_antes',  to_jsonb(v_a),
           'pendencias_item', coalesce((
             select jsonb_agg(to_jsonb(pi)) from public.pendencias_item pi
              where pi.movimentacao_id = p_mov), '[]'::jsonb))
    into v_backup;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item where movimentacao_id = p_mov;
  get diagnostics v_pend = row_count;

  update public.ativos set
    status            = (v_m.snapshot_anterior ->> 'status')::public.status_ativo,
    colaborador_atual = v_m.snapshot_anterior ->> 'colaborador',
    setor_atual       = v_m.snapshot_anterior ->> 'setor',
    filial_id         = (v_m.snapshot_anterior ->> 'filial_id')::smallint,
    pendencia         = case when v_m.snapshot_anterior ? 'pendencia'
                             then nullif(
                               (select string_agg(trim(x.val), '; ' order by x.ord)
                                from unnest(string_to_array(v_m.snapshot_anterior ->> 'pendencia', ';'))
                                     with ordinality as x(val, ord)
                                where nullif(trim(x.val), '') is not null
                                  and lower(trim(x.val)) not like 'itens faltantes%'), '')
                             else pendencia end,
    termo_assinado    = case when v_m.snapshot_anterior ? 'termo_assinado'
                             then (v_m.snapshot_anterior ->> 'termo_assinado')::public.termo_status
                             else termo_assinado end,
    termo_data        = case when v_m.snapshot_anterior ? 'termo_data'
                             then (v_m.snapshot_anterior ->> 'termo_data')::date
                             else termo_data end,
    updated_at        = now()
  where id = v_m.ativo_id;

  delete from public.movimentacoes where id = p_mov;

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'movimentacao_apagada', v_esperado,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'movimentacao_id', p_mov,
            'ativo_id',        v_m.ativo_id,
            'tipo',            v_m.tipo,
            'data',            v_m.data,
            'status_antes',    v_m.status_anterior,
            'status_depois',   v_m.status_resultante,
            'pendencias_item', v_pend,
            'backup',          v_backup));

  return jsonb_build_object(
    'movimentacao_id',   p_mov,
    'ativo_id',          v_m.ativo_id,
    'rotulo',            v_esperado,
    'tipo',              v_m.tipo,
    'status_restaurado', (v_m.snapshot_anterior ->> 'status'),
    'pendencias_item',   v_pend);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.apagar_movimentacao(uuid, text, text) is
  'F23 (/dev): apaga UMA movimentação — só a última do ativo, por (created_at, id). RECUSA: movimentação de tipo ESTORNO (apagá-la não devolve as pendências de item que o estorno removeu — 0090); ativo com movimentações no MESMO instante, onde "a última" seria sorteio de uuid (0087); não é a última; é a única do ativo; sem snapshot_anterior; e citada por um termo. Recompõe o ativo a partir de snapshot_anterior exatamente como o estorno faz.';

revoke all on function public.apagar_movimentacao(uuid, text, text) from public, anon, service_role;
grant execute on function public.apagar_movimentacao(uuid, text, text) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) TRUNCATE fechado nas seis:
--   select table_name, count(*) as papeis_com_truncate
--     from information_schema.role_table_grants
--    where table_schema='public' and privilege_type='TRUNCATE'
--      and grantee in ('anon','authenticated','service_role')
--      and table_name in ('ativos','movimentacoes','lancamentos_item','pendencias_item','anotacoes','termos_gerados')
--    group by table_name;
--   -- esperado: NENHUMA linha
--
--   -- 2) a trava de ambiente:
--   select count(*) as marcadores from public.ambiente where rotulo = 'desenvolvimento';
--   -- esperado: ENSAIO = 1 · PRODUÇÃO = 0   ← a diferença é o ponto
--
--   -- 3) a recusa de estorno está no corpo:
--   select pg_get_functiondef('public.apagar_movimentacao(uuid,text,text)'::regprocedure)
--          like '%tipo = ''estorno''%' as recusa_estorno;
--   -- esperado: true

-- Migration 0025 — rate-limit PERSISTENTE do acesso por senha (Sprint 4 / X4).
--
-- Substitui o rate-limit em memória (Map por processo) de `entrarComSenha`, que na
-- Vercel é por-instância e some a cada cold start — best-effort demais contra brute
-- force da senha de visualização (§3.9.1). Agora o contador vive no Postgres
-- (compartilhado entre todas as instâncias), numa janela fixa por IP, atualizado
-- ATOMICAMENTE por uma função SECURITY DEFINER (sem a corrida read-modify-write que
-- o Map tinha). Custo R$ 0 (Supabase Free). Aditiva. Aplicar em DESENVOLVIMENTO.

create table if not exists public.senha_tentativas (
  ip          text primary key,
  tentativas  int not null default 0,
  janela_fim  timestamptz not null
);

comment on table public.senha_tentativas is
  'Rate-limit do acesso por senha aos relatorios (3.9.1). Uma linha por IP, janela fixa. Sem dado pessoal alem do IP; upsert mantem a tabela pequena (uma linha por IP distinto).';

-- Infra de segurança: ninguém lê/escreve via PostgREST. RLS ligada e SEM policy
-- => nega anon e authenticated. Só o service_role (que ignora RLS) e a função
-- SECURITY DEFINER abaixo tocam nela.
alter table public.senha_tentativas enable row level security;

-- Registra UMA tentativa do IP e devolve TRUE se estourou o limite (=> bloquear).
-- Paridade com o Map antigo: permite `p_max` tentativas por janela; a (max+1)ª
-- bloqueia. search_path = '' + nomes qualificados (advisor function_search_path_mutable).
create or replace function public.registrar_tentativa_senha(
  p_ip         text,
  p_max        int default 5,
  p_janela_seg int default 60
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := now();
  v_tent  int;
begin
  insert into public.senha_tentativas as t (ip, tentativas, janela_fim)
  values (p_ip, 1, v_agora + make_interval(secs => p_janela_seg))
  on conflict (ip) do update set
    tentativas = case when t.janela_fim < v_agora then 1 else t.tentativas + 1 end,
    janela_fim = case when t.janela_fim < v_agora
                      then v_agora + make_interval(secs => p_janela_seg)
                      else t.janela_fim end
  returning t.tentativas into v_tent;

  return v_tent > p_max;
end $$;

-- Trava o EXECUTE só no service_role (o client admin de entrarComSenha). Precisa
-- revogar de anon/authenticated ALÉM de public: o default privilege do Supabase
-- concede EXECUTE a esses papéis diretamente, então `revoke from public` não basta
-- (advisor anon/authenticated_security_definer_function_executable).
revoke all on function public.registrar_tentativa_senha(text, int, int) from public, anon, authenticated;
grant execute on function public.registrar_tentativa_senha(text, int, int) to service_role;

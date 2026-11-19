-- =====================================================================================================================
-- 0209_porta_sessoes.sql — F68 (19/11/2026): a porta pública por empresa — a SESSÃO do visualizador no banco
-- =====================================================================================================================
-- classe: ADITIVA (tabela nova, vazia, deny-all)
--
-- Até a F68 a "sessão" do visualizador por senha era o próprio `senha_id`, legível dentro do cookie (um envelope HMAC de
-- `{sid, exp}`): o cookie copiado valia enquanto a senha estivesse ativa, e as 24 h só existiam no navegador. Agora a
-- sessão é uma LINHA: `relatorio_publico_abrir` (0212) sorteia um token opaco (32 bytes de gen_random_bytes), devolve-o
-- UMA vez e guarda aqui só o sha-256 dele. `relatorio_publico_dados` (0212) acha a sessão pelo hash e confere, a cada
-- pedido: não vencida (24 h, no banco), não encerrada (o "Sair"), e a senha ainda ativa e bcrypt — a revogação mata a
-- sessão no request seguinte.
--
-- A sessão é da empresa DA SENHA por construção: FK composta (empresa_id, senha_id) → senhas_acesso (empresa_id, id) (a
-- unique da 0208). Nenhum dado pessoal: nem a origem (IP), nem o rótulo. Ninguém lê esta tabela pela sessão do PostgREST:
-- RLS ligada, ZERO policy, e nenhum privilégio para anon, authenticated ou service_role — só as duas funções da porta
-- (security definer, o dono) a tocam. É INFRA no catálogo (k_infra) e entra em k_sem_select (R-ACC-31) com este motivo.
-- Sem o gatilho guarda_empresa (a exceção nominal de imutabilidade_tenant.sql, k_empresa_id_sem_guarda, o molde de
-- operador_filiais): a FK composta já prende a sessão à empresa DA SENHA, e nenhuma função a altera de empresa.
-- =====================================================================================================================

set lock_timeout = '2s';

create table public.sessoes_visualizador (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null,
  senha_id     uuid not null,
  token_hash   bytea not null,
  criada_em    timestamptz not null default now(),
  vence_em     timestamptz not null,
  encerrada_em timestamptz,
  constraint sessoes_visualizador_token_hash_uidx unique (token_hash),
  constraint sessoes_visualizador_token_hash_sha256 check (octet_length(token_hash) = 32),
  constraint sessoes_visualizador_vence_depois check (vence_em > criada_em),
  constraint sessoes_visualizador_empresa_id_fkey foreign key (empresa_id) references public.empresas (id),
  constraint sessoes_visualizador_senha_da_empresa_fk foreign key (empresa_id, senha_id)
    references public.senhas_acesso (empresa_id, id)
);

create index sessoes_visualizador_senha_idx on public.sessoes_visualizador (empresa_id, senha_id);
create index sessoes_visualizador_vence_idx on public.sessoes_visualizador (vence_em);

comment on table public.sessoes_visualizador is
  'F68 (0209): a sessão do visualizador por senha (a porta pública /r/<slug>/relatorios). Uma linha por entrada bem-sucedida: o sha-256 do token opaco que vai no cookie (o token nunca é guardado), a empresa e a senha (FK composta: a sessão é da empresa DA SENHA), o vencimento de 24 h e o encerramento (Sair). Deny-all: RLS ligada, zero policy, nenhum privilégio para anon/authenticated/service_role — só relatorio_publico_abrir e relatorio_publico_dados (security definer) a tocam. Sem dado pessoal. INFRA (k_infra) e k_sem_select.';
comment on column public.sessoes_visualizador.token_hash is
  'F68 (0209): sha-256 (extensions.digest) do token opaco devolvido UMA vez por relatorio_publico_abrir. O token em si nunca é guardado.';
comment on column public.sessoes_visualizador.vence_em is
  'F68 (0209): 24 h depois da entrada. Vale NO BANCO — relatorio_publico_dados recusa a sessão vencida, qualquer que seja o cookie.';
comment on column public.sessoes_visualizador.encerrada_em is
  'F68 (0209): o "Sair" (relatorio_publico_dados, pedido encerrar). Encerrada não volta.';

alter table public.sessoes_visualizador enable row level security;
revoke all on table public.sessoes_visualizador from public, anon, authenticated, service_role;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   a tabela existe, vazia, com RLS ligada e ZERO policy; has_table_privilege falso para anon, authenticated e
--   service_role em SELECT/INSERT/UPDATE/DELETE; as duas FKs e a unique do token_hash.
--
-- ROLLBACK (supabase/rollback/F68-desfaz.sql, o bloco 0209 — depois do 0212, 0211 e 0210; antes do 0208): derrubar a
-- tabela sessoes_visualizador (as sessões abertas morrem — o app já terá voltado ao código anterior pelo revert).

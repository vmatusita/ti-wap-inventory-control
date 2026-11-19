-- =====================================================================================================================
-- 0210_porta_tentativas.sql — F68 (19/11/2026): a porta pública por empresa — o CONTADOR de tentativas
-- =====================================================================================================================
-- classe: ADITIVA (tabela nova, vazia, deny-all)
--
-- O contador de hoje (`senha_tentativas` + `registrar_tentativa_senha`, 0025) é por IP e só o service_role o chama. A
-- porta nova é chamada como `anon`, e a chave anon é PÚBLICA por desenho: quem chama `relatorio_publico_abrir` direto pelo
-- PostgREST escolhe a origem que quiser. Por isso o contador novo tem DUAS réguas, as duas dentro de `abrir` (0212), ANTES
-- de conferir qualquer senha:
--   · `empresa:<id>`            — o TETO POR EMPRESA, somando todas as origens (20 por 60 s). Sem ele, a força bruta com
--                                 origens forjadas só pagaria o bcrypt. Estourado, a linha da origem NÃO é gravada (a
--                                 tabela não cresce com origens inventadas);
--   · `origem:<id>:<md5 origem>` — por (empresa, origem) (5 por 60 s, a régua de hoje). A origem é guardada só como md5.
-- Slug inexistente conta num balde único (`empresa:inexistente`), para a tabela não crescer com slugs inventados.
--
-- `senha_tentativas` e `registrar_tentativa_senha` ficam de pé, sem chamador novo: o deployment antigo (Skew Protection,
-- até 12 h) ainda os usa. Saem na abertura da F68B (decisão 18).
-- =====================================================================================================================

set lock_timeout = '2s';

create table public.porta_tentativas (
  chave       text primary key,
  tentativas  int not null default 0,
  janela_fim  timestamptz not null,
  constraint porta_tentativas_chave_formato check (chave ~ '^(empresa|origem):[a-z0-9:-]{1,110}$')
);

comment on table public.porta_tentativas is
  'F68 (0210): o contador de tentativas da porta pública (relatorio_publico_abrir). Janela fixa de 60 s por chave: empresa:<id> (o teto por empresa, todas as origens) e origem:<id>:<md5 da origem> (por empresa e origem); slug inexistente → empresa:inexistente. A origem só como md5. Deny-all: RLS ligada, zero policy, nenhum privilégio para anon/authenticated/service_role — só relatorio_publico_abrir (security definer) a toca, e ela mesma apaga as janelas vencidas há mais de 1 hora (no máximo 50 por chamada). INFRA (k_infra) e k_sem_select.';

alter table public.porta_tentativas enable row level security;
revoke all on table public.porta_tentativas from public, anon, authenticated, service_role;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   a tabela existe, vazia, RLS ligada, ZERO policy, nenhum privilégio para anon/authenticated/service_role.
--
-- ROLLBACK (supabase/rollback/F68-desfaz.sql, o bloco 0210 — depois do 0212 e do 0211; antes do 0209): derrubar a tabela
-- porta_tentativas.

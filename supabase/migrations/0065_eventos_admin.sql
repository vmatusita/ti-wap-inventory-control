-- Migration 0065 — F21: `eventos_admin`, a trilha de auditoria das ações administrativas.
--
-- Contexto: docs/ADR-002-papeis-e-permissoes.md §5 · ordem docs/prompts/F21-papeis-ultracode.md §5.7.
--
-- POR QUÊ. Até aqui não havia registro NENHUM de quem convidou usuário, quem revogou senha
-- de relatório, quem desativou filial, quem rodou o import destrutivo. Com a F21 criando
-- cargos, isso deixa de ser detalhe: a pergunta "quem promoveu essa pessoa a admin?" tem de
-- ter resposta. É também o insumo da revisão trimestral de acessos (§8 do ADR).
--
-- DESENHO — insert-only, e nem o admin edita.
--   · RLS ligada; policy SÓ de SELECT, para `e_admin()`.
--   · NENHUMA policy de insert/update/delete → com RLS ligada isso é deny-all para
--     `anon`/`authenticated`. Quem grava é o service role, pelas actions de /admin
--     (mesmo idioma da 0012 em `senhas_acesso` e da 0061 em `operador_filiais`).
--   · Não existe caminho de UPDATE/DELETE em lugar nenhum: uma trilha que o próprio
--     auditado pode reescrever não é trilha. Corrigir um evento errado = inserir outro.
--
-- `autor` é NULLABLE com `on delete set null`, e isto é deliberado: se um perfil for
-- apagado, os eventos dele PRECISAM sobreviver (o contrário — `on delete cascade` — deixaria
-- apagar a conta como forma de apagar o rastro). O nome de exibição é resolvido por join em
-- `profiles` na leitura; evento com autor nulo aparece como "usuário removido".
--
-- `acao` é TEXT e não enum, de propósito: ação nova não deve exigir migration. O vocabulário
-- é fechado do lado do app, em src/lib/auditoria.ts (fonte única, com teste), e vai listado
-- no comment da coluna para quem for ler só o banco.
--
-- ADITIVA: tabela nova, nenhum dado tocado. Não bate no gate. Caminho A do runbook.
-- REVERSÃO: `drop table public.eventos_admin;`

create table public.eventos_admin (
  id      uuid        primary key default gen_random_uuid(),
  quando  timestamptz not null default now(),
  autor   uuid        references public.profiles (id) on delete set null,
  acao    text        not null,
  alvo    text,
  detalhe jsonb
);

comment on table public.eventos_admin is
  'F21: trilha de auditoria das ações administrativas (quem, quando, o quê). Insert-only pelo service role; leitura só para admin; sem update/delete em lugar nenhum. Exibida na aba "Auditoria" de /admin/usuarios.';
comment on column public.eventos_admin.autor is
  'Quem fez a ação. NULL = perfil removido depois do evento (on delete set null, para a trilha sobreviver à exclusão da conta).';
comment on column public.eventos_admin.acao is
  'Verbo da ação, vocabulário fechado no app (src/lib/auditoria.ts): convite_gerado, convite_reenviado, papel_alterado, vinculos_alterados, usuario_desativado, usuario_reativado, senha_criada, senha_revogada, senha_reativada, import_executado.';
comment on column public.eventos_admin.alvo is
  'Sobre quem/o quê (e-mail do convidado, id do usuário editado, rótulo da senha, slug da filial importada). Texto livre, legível.';
comment on column public.eventos_admin.detalhe is
  'Contexto estruturado do evento (ex.: {"de":"operador","para":"admin"} ou {"filiais":[1,3]}). Nunca guarda segredo: proibido hash de senha, token ou chave.';

-- A aba de auditoria lista do mais recente para o mais antigo, com paginação e filtro por
-- ação. Este índice serve às duas coisas (o filtro por `acao` usa a segunda coluna).
create index eventos_admin_quando_idx on public.eventos_admin (quando desc, acao);

alter table public.eventos_admin enable row level security;

-- Leitura: só admin. Sem policy de escrita — service role apenas.
create policy "admin le auditoria" on public.eventos_admin
  for select to authenticated
  using ((select public.e_admin()));

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select relrowsecurity from pg_class where oid = 'public.eventos_admin'::regclass;
--   -- esperado: true
--   select policyname, cmd, roles::text from pg_policies
--    where schemaname='public' and tablename='eventos_admin';
--   -- esperado: EXATAMENTE 1 linha — "admin le auditoria" · SELECT · {authenticated}
--   select count(*) from public.eventos_admin;   -- esperado: 0 (nasce vazia)

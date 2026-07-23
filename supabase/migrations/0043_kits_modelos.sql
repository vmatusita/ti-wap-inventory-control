-- Migration 0043 — KITS DE MOVIMENTAÇÃO salvos (F12 · M12; promessa da F5 §5.9).
--
-- O QUÊ: catálogo de modelos nomeados com a CONFIGURAÇÃO de um lote de
-- movimentação ("Kit novo colaborador" = saída, motivo novo_colaborador, termo
-- gerado, e as categorias esperadas notebook + monitor + celular).
--
-- POR QUÊ: o passo 2 da nova movimentação repete os mesmos 4 campos toda vez que
-- entra alguém novo. "Repetir última" só ajuda quem acabou de fazer a mesma
-- coisa; o kit é a memória compartilhada da equipe. Aceite da F5 §5.9: registrar
-- um kit de 3 itens em menos de 60 segundos.
--
-- MODELO DE DADOS: a configuração inteira vai num `payload jsonb` — é a forma da
-- F5 §5.9 e a única que não obriga uma migration a cada campo novo do wizard. O
-- payload é validado na aplicação (Zod, src/lib/validators/kit.ts) contra os
-- enums REAIS do banco (tipo_movimentacao menos `compra`/`estorno`,
-- categoria_ativo, termo_status). O banco guarda o documento; quem não confia no
-- documento é a leitura (parse defensivo em src/lib/queries/kits.ts) — um kit com
-- payload corrompido é ignorado, nunca derruba a tela.
--
-- O kit é uma CÓPIA no momento do uso: aplicar um kit só preenche o formulário.
-- Nada na `movimentacoes` referencia `kits_modelos` — desativar ou renomear um kit
-- não altera nenhuma movimentação passada (decisão §2.5 da OS-F12).
--
-- `id uuid`: toda tabela deste schema que carrega `criado_por` usa uuid
-- (movimentacoes 0003, senhas_acesso 0003, lancamentos_item 0015, anotacoes 0017,
-- termos_gerados 0021). O identity smallint é o padrão dos catálogos SEM autor
-- (filiais, itens) — kit tem autor e é conteúdo criado pelo operador, então segue
-- a família uuid. Bônus: o id não denuncia quantos kits existem.
--
-- ADITIVA: tabela nova, vazia, SEM seed (kit de exemplo não entra em produção por
-- migration — quem cria kit é o operador em /admin/kits). Nada existente muda.
--
-- Aplicar em DESENVOLVIMENTO/ensaio primeiro; produção pelo orquestrador
-- (docs/RUNBOOK-BANCO.md, caminho A — não bate no gate destrutivo).

create table public.kits_modelos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  -- { tipo, motivo?, termo?, observacao?, categorias[] } — validado na aplicação.
  payload    jsonb not null,
  ativo      boolean not null default true,
  criado_por uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Nome único case-insensitive — MESMO mecanismo de `itens_nome_uidx` (0014):
-- índice funcional sobre lower(nome), sem `citext` (extensão não instalada e
-- proibido adicionar dependência). "Kit novo colaborador" e "kit novo
-- colaborador" são o mesmo kit; a action traduz a violação pelo NOME do índice.
create unique index kits_modelos_nome_uidx on public.kits_modelos ((lower(nome)));

-- Leitura do fluxo: só os ativos, em ordem de nome (espelha itens_grupo_ordem_idx).
create index kits_modelos_ativo_nome_idx on public.kits_modelos (ativo, nome);

comment on table public.kits_modelos is
  'Modelos nomeados de configuração de lote da nova movimentação (F12 · M12 / F5 §5.9). Aplicar um kit é CÓPIA para o formulário — nenhuma movimentação referencia o kit. Kit não se exclui: desativa-se (ativo = false).';
comment on column public.kits_modelos.payload is
  'Configuração do lote em jsonb: { tipo: tipo_movimentacao (nunca compra/estorno), motivo?: text, termo?: termo_status, observacao?: text, categorias: categoria_ativo[] }. Validado por Zod na aplicação (src/lib/validators/kit.ts) contra os enums reais; a leitura faz parse defensivo.';

-- RLS no padrão de nível único do projeto (0005/0014): operador logado
-- (authenticated) lê e escreve tudo; `anon` não tem policy nenhuma — logo, não lê
-- nem escreve. O visualizador por senha não tem credencial de banco e as rotas de
-- kit (/admin/kits, /movimentacoes/nova) são só do operador, fora de /relatorios/**.
-- GRANTS: como na 0014, nenhum grant explícito — valem os defaults do Supabase
-- para o schema public (anon/authenticated/service_role recebem os mesmos
-- privilégios de tabela); quem separa os dois é a RLS acima, exatamente como em
-- `itens`. Não inventar grant aqui manteria a tabela DIFERENTE das irmãs.
alter table public.kits_modelos enable row level security;
create policy "leitura operador" on public.kits_modelos for select to authenticated using (true);
create policy "operador escreve" on public.kits_modelos for all    to authenticated using (true) with check (true);

-- ===== SMOKE (rodar depois de aplicar — leitura + um ida-e-volta desfeito) =====
--   -- 1) tabela criada e VAZIA (sem seed)
--   select count(*) as kits from public.kits_modelos;            -- esperado: 0
--
--   -- 2) RLS ligada e as duas policies no lugar (nenhuma para anon)
--   select relrowsecurity from pg_class where oid = 'public.kits_modelos'::regclass;
--   -- esperado: true
--   select policyname, roles::text, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'kits_modelos' order by policyname;
--   -- esperado: 2 linhas, ambas com roles = {authenticated}
--
--   -- 3) o índice único é case-insensitive
--   select indexdef from pg_indexes
--   where schemaname = 'public' and indexname = 'kits_modelos_nome_uidx';
--   -- esperado: ... USING btree (lower(nome))
--
--   -- 4) duplicidade de nome só muda de caixa — dentro de uma transação DESFEITA
--   begin;
--     insert into public.kits_modelos (nome, payload, criado_por)
--     values ('Kit fictício de smoke', '{"tipo":"saida","categorias":["notebook"]}'::jsonb,
--             (select id from public.profiles limit 1));
--     insert into public.kits_modelos (nome, payload, criado_por)
--     values ('KIT FICTÍCIO DE SMOKE', '{"tipo":"saida","categorias":["monitor"]}'::jsonb,
--             (select id from public.profiles limit 1));
--     -- esperado no 2º insert: ERROR: duplicate key value violates unique
--     --                        constraint "kits_modelos_nome_uidx"
--   rollback;
--
--   -- 5) anon não enxerga nada (RLS) — a sessão volta ao normal no reset
--   begin;
--     set local role anon;
--     select count(*) from public.kits_modelos;   -- esperado: 0 linhas visíveis
--   rollback;
--
-- ===== ROLLBACK desta migration (se for preciso desfazer) =====
--   drop table public.kits_modelos;   -- leva junto policies e índices
--   -- Nada mais depende da tabela: nenhuma view, RPC, trigger ou FK a referencia.

-- Migration 0061 — F21: estrutura dos CARGOS e do vínculo de filiais de escrita.
--
-- Contexto: docs/ADR-002-papeis-e-permissoes.md (aceito 29/07/2026) reverte, de forma
-- registrada, a decisão de nível único de 09/07/2026 (spec §3, "NUNCA criar roles/papéis")
-- pelo caminho que a própria ADR-001 previu na emenda de 22/07/2026 ("um ADR novo sobre
-- papéis"). Ordem de serviço: docs/prompts/F21-papeis-ultracode.md.
--
-- POR QUÊ. Até aqui a autorização parava no "está logado?": todo operador convidava
-- usuários, revogava senha de relatório, desativava filial, estornava e rodava o import
-- "Substituir tudo" — a operação mais destrutiva do sistema. Não havia como DESLIGAR um
-- usuário (quem saía da equipe entrava até alguém apagar a conta à mão no painel).
--
-- O QUE ENTRA AQUI (só estrutura + backfill; funções na 0062, policies na 0063):
--   1. enum `papel_usuario` — admin ⊃ operador ⊃ consulta;
--   2. `profiles.papel` e `profiles.ativo`;
--   3. tabela `operador_filiais` (vínculo de ESCRITA, PK composta);
--   4. BACKFILL parâmetro §0 da ordem (`BACKFILL = admin`): todo perfil existente vira
--      `admin` com vínculo em TODA filial ativa.
--
-- POR QUE O BACKFILL É "admin". É o que torna o deploy um NÃO-EVENTO: no dia da subida o
-- comportamento é idêntico ao de hoje, ninguém perde acesso, nada quebra. O Johnny rebaixa
-- quem deve ser operador/consulta depois, pela tela nova, no tempo dele. A alternativa
-- (todos → operador) é mais "segura" no papel, mas derrubaria acesso de gente no meio do
-- expediente — rejeitada no §10.4 do ADR.
--
-- POR QUE O DEFAULT DA COLUNA É 'operador' E NÃO 'admin'. O default vale para conta NOVA
-- (o insert do trigger `handle_new_user`). Conta nova nasce `operador` com ZERO vínculo —
-- e zero vínculo FECHA toda escrita (`pode_escrever_filial` da 0062 devolve false). Ou
-- seja: se a action de convite falhar no meio, depois de criar a conta e antes de gravar
-- papel/vínculos, o usuário resultante não escreve em lugar nenhum. Falha segura.
--
-- ADITIVA / NÃO DESTRUTIVA: nenhum `delete from`, nenhum dado perdido, nenhuma coluna
-- removida ou renomeada. Não bate no gate do modo automático (não contém
-- `delete from public.ativos` nem `delete from public.movimentacoes`) → caminho **A** do
-- docs/RUNBOOK-BANCO.md: ensaio primeiro, produção depois, por MCP.
--
-- REVERSÃO (nesta ordem, sem perda de dado do acervo):
--   drop table public.operador_filiais;
--   alter table public.profiles drop column ativo, drop column papel;
--   drop type public.papel_usuario;

-- ---------- 1) o enum dos cargos ----------
-- Os labels são declarados do MAIS forte para o mais fraco (admin, operador, consulta), que
-- é também a ordem de `enumsortorder`. Atenção ao sinal: como `admin` vem PRIMEIRO, ele é o
-- MENOR na comparação — "operador ou mais forte" se escreve `papel <= 'operador'`, não `>=`.
-- As funções da 0062 e o roteiro papeis_rls.sql evitam essa pegadinha comparando por
-- igualdade explícita; quem depende da hierarquia é a função pura do app
-- (src/lib/auth/papeis.ts), que usa um índice de ranking legível em vez do enum.
--
-- Criar o tipo e USÁ-LO na mesma migration é permitido; a restrição do Postgres é só para
-- `alter type ... add value` (precedente 0044/0045).
create type public.papel_usuario as enum ('admin', 'operador', 'consulta');

comment on type public.papel_usuario is
  'F21: cargo do usuário. Hierarquia estrita na ordem dos labels: admin > operador > consulta. admin = tudo (inclui /admin e o import); operador = escreve nas filiais vinculadas (operador_filiais); consulta = somente leitura.';

-- ---------- 2) papel e ativo no perfil ----------
-- `papel` mora em `profiles` (e NÃO em custom claim do JWT) por decisão do ADR §4: claim
-- no token só valeria no próximo refresh (até ~1h), e este projeto tem doutrina explícita
-- de revogação NO REQUEST SEGUINTE (senhas de acesso, OS-F3 3.9.3). Lido do banco por
-- função, rebaixar/desativar vale na próxima requisição.
alter table public.profiles
  add column papel public.papel_usuario not null default 'operador',
  add column ativo boolean not null default true;

comment on column public.profiles.papel is
  'F21: cargo do usuário (admin/operador/consulta). Escrito SÓ pelo service role (actions de /admin/usuarios) — a 0063 revoga o UPDATE de `authenticated` nesta coluna por grant de coluna. NUNCA vem de raw_user_meta_data: o próprio usuário edita o metadata dele via auth.updateUser, logo metadata não é canal confiável.';
comment on column public.profiles.ativo is
  'F21: usuário habilitado. false = DESATIVADO: papel_atual() devolve NULL e toda policy de escrita fecha no REQUEST SEGUINTE (mesma filosofia da revogação de senha de acesso). Complementa — não substitui — o ban no Supabase Auth (ban_duration), que impede login novo. Escrito só pelo service role.';

-- ---------- 3) o vínculo de filiais de ESCRITA ----------
-- Vale só para ESCRITA e só para o cargo `operador`: todo logado continua LENDO as filiais
-- todas (é o que a ADR-001 decidiu e continua valendo — o recorte que faz sentido aqui é
-- por papel na escrita, não por filial na leitura). Admin escreve em todas sem precisar de
-- linha aqui; consulta não escreve em lugar nenhum.
--
-- `on delete cascade` no usuário: perfil apagado leva os vínculos (não há o que auditar num
-- vínculo órfão — a trilha de quem mudou o quê vive em `eventos_admin`, migration 0065).
-- `on delete restrict` na filial: apagar uma filial que ainda é o vínculo de escrita de
-- alguém é acidente, não intenção — o fluxo correto é desativar (`filiais.ativo = false`).
create table public.operador_filiais (
  usuario_id uuid     not null references public.profiles (id) on delete cascade,
  filial_id  smallint not null references public.filiais (id)  on delete restrict,
  created_at timestamptz not null default now(),
  primary key (usuario_id, filial_id)
);

comment on table public.operador_filiais is
  'F21: filiais em que um OPERADOR pode ESCREVER. Só escrita — leitura é ampla para todo logado (ADR-001). Admin ignora esta tabela (escreve em todas); consulta não escreve. Zero linhas para um operador = nenhuma escrita (falha segura). Escrita SÓ pelo service role, pelas actions de /admin/usuarios: RLS ligada, com policy de leitura e NENHUMA policy de escrita.';

-- Índice do lado da filial. A PK (usuario_id, filial_id) já cobre a checagem de
-- `pode_escrever_filial` (busca pelas duas colunas); este índice serve à consulta INVERSA
-- — "quem escreve na filial X" — que a tela /admin/usuarios faz para montar a coluna
-- "Filiais de escrita". Tabela minúscula (nº de operadores × nº de filiais), custo nulo.
create index operador_filiais_filial_idx on public.operador_filiais (filial_id);

alter table public.operador_filiais enable row level security;

-- Leitura para qualquer logado: a tela de admin e o resolvedor de sessão do app precisam
-- ler os vínculos, e o dado não é sensível (quem escreve onde). ESCRITA: nenhuma policy —
-- com RLS ligada isso é deny-all para anon/authenticated, e só a service role (as actions
-- de admin) grava. Mesmo idioma da 0012 em `senhas_acesso`.
create policy "leitura operador" on public.operador_filiais
  for select to authenticated
  using (true);

-- ---------- 4) BACKFILL (§0 da ordem: BACKFILL = admin) ----------
-- Todo perfil que já existe vira admin com vínculo em toda filial ativa. Sem isto, o
-- default 'operador' + zero vínculo derrubaria a escrita de TODA a equipe no instante do
-- apply — exatamente o que o §6 do ADR quer evitar.
update public.profiles set papel = 'admin';

-- Produto cartesiano perfis × filiais ATIVAS. `on conflict do nothing` deixa a migration
-- idempotente se for reexecutada num banco que já tenha vínculos.
insert into public.operador_filiais (usuario_id, filial_id)
select p.id, f.id
  from public.profiles p
 cross join public.filiais f
 where f.ativo
on conflict (usuario_id, filial_id) do nothing;

-- ---------- VERIFICAÇÃO PÓS-APPLY (rodar depois do apply, nos dois bancos) ----------
--   -- todo perfil é admin?
--   select papel, count(*) from public.profiles group by papel;
--   -- esperado: uma linha só, 'admin', com a contagem total de perfis
--
--   -- todo perfil tem vínculo em toda filial ativa?
--   select (select count(*) from public.profiles) * (select count(*) from public.filiais where ativo)
--          as esperado,
--          (select count(*) from public.operador_filiais) as real;
--   -- esperado: esperado = real
--
--   -- ninguém nasceu desativado?
--   select count(*) from public.profiles where not ativo;   -- esperado: 0

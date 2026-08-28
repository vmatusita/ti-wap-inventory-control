-- Migration 0112 — quem é a pessoa: o cadastro de colaboradores (F37, frente A · decisão D5).
--
-- ADITIVA. Cria uma função de vocabulário, uma tabela, um índice único e uma view.
-- NÃO recria nenhuma função, nenhum trigger e nenhuma policy existente; não toca em
-- `ativos`, `movimentacoes` nem `lancamentos_item` (o vínculo é a 0113).
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- Colaborador é texto livre em três lugares (`ativos.colaborador_atual`,
-- `movimentacoes.colaborador`, `lancamentos_item.colaborador`) — tudo digitado à mão.
-- Em produção, no dia desta migration: 1.420 registros com nome preenchido, em 956
-- grafias distintas. Uma conta por pessoa em cima disso divide "João Silva",
-- "Joao Silva" e "joão  silva" em três pessoas.
--
-- ---------------------------------------------------------------------------
-- A CHAVE DE DEDUPLICAÇÃO — e por que ela é uma FUNÇÃO nomeada
-- ---------------------------------------------------------------------------
-- Minúsculas, sem acento, espaços colapsados. O §4.1 do docs/PLAN-F36-F39.md a
-- rascunhou INLINE na coluna gerada; aqui ela vira `public.colaborador_chave(text)`
-- por dois motivos concretos:
--
--   1. a MESMA expressão é usada pela coluna gerada E pela view da fila de
--      consolidação (v_colaboradores_textos, no fim deste arquivo). Duas cópias de
--      uma regra de normalização é a receita para elas divergirem em silêncio;
--   2. dá uma ÂNCORA ÚNICA para a guarda TS↔SQL (`src/lib/colaboradores/chave-sql.test.ts`),
--      no molde de `status_tem_detentor` (0110) — o teste extrai a tabela de acentos
--      e a classe de espaço DAQUI e compara, caractere a caractere, com o TypeScript.
--
-- IMMUTABLE sem extensão: `translate` e `regexp_replace` de 4 argumentos bastam.
-- **Proibido `unaccent`** (é extensão). Precedente de coluna gerada IMMUTABLE:
-- `profiles.nome` (0057).
--
-- DUAS CORREÇÕES ao rascunho do §4.1, deliberadas (atas em docs/DECISOES.md):
--
--   a) `btrim` vem DEPOIS do colapso, não antes. `btrim(text)` sem segundo argumento
--      apara SÓ o espaço ASCII — então `btrim` antes deixaria `E'\tJoão'` virar
--      ` joao`, com um espaço à esquerda GRUDADO na chave. Colapsar e então aparar
--      resolve, e nada mais muda.
--
--   c) `normalize(p_nome, NFC)` por dentro de tudo. Sem ele, o MESMO nome escrito de
--      duas formas Unicode legítimas dá chaves diferentes: "João" digitado no Windows
--      vem PRECOMPOSTO (NFC: `ã` = 1 código), e colado do macOS ou de certos exports
--      vem DECOMPOSTO (NFD: `a` + til combinante = 2 códigos). O `translate` acima só
--      conhece a forma precomposta, então a versão NFD atravessava intacta e virava
--      `joão silva` em vez de `joao silva` — duas pessoas onde há uma, que é
--      exatamente o defeito que esta tabela existe para não ter. `normalize` é
--      IMMUTABLE (conferido: `provolatile = 'i'`), então cabe na coluna gerada.
--      Medido em 28/08/2026, com a tabela ainda vazia: `E'João Silva'` dava
--      `joão silva` e passou a dar `joao silva`, igual ao `'João Silva'` precomposto.
--
--   b) classe explícita `[ \t\n\r\f\v]` no lugar de `\s`. O `\s` do Postgres é
--      `[[:space:]]` (sensível a locale) e o `\s` do JavaScript inclui NBSP (U+00A0)
--      e outros espaços Unicode — **não são o mesmo conjunto**. Com a classe
--      explícita os dois lados são idênticos POR CONSTRUÇÃO, e é isso que faz a
--      guarda TS↔SQL ser uma prova em vez de uma esperança. `ñ/Ñ` entrou na tabela.
--
-- CONSEQUÊNCIA A DIZER EM VOZ ALTA (e tratada na UI, não escondida): duas pessoas
-- reais com o mesmo nome normalizado não cabem no cadastro — o índice único recusa a
-- segunda. A tela devolve isso como frase em pt-BR ("Já existe um colaborador com
-- este nome; diferencie o nome ou use a matrícula"), nunca um `23505` cru.
--
-- ---------------------------------------------------------------------------
-- ACESSO (ADR-002; ordem F37 §A.6)
-- ---------------------------------------------------------------------------
-- Leitura: todo logado ATIVO (piso `papel_atual() is not null`, doutrina da 0070 —
--   NÃO `using (true)`, que é o texto velho de 0014/0043 e deixaria perfil
--   desativado/arquivado lendo).
-- INSERT: `pode_escrever()` — dev, admin E operador. Tem de ser assim: o operador
--   cria o colaborador INLINE no meio da movimentação; se isso exigisse admin, o
--   wizard quebraria na mão dele.
-- UPDATE (editar/desativar): `e_admin()` (= admin OU dev, desde a 0072).
-- DELETE: **nenhuma policy** — cadastro de pessoa não se apaga pela API; desativa-se
--   (`ativo = false`). Mesmo idioma de `operador_filiais` (0061) e `eventos_admin` (0065).
--
-- GRANTS: explícitos, ao contrário de 0014/0043. Precedente é a 0103: o Postgres que
-- o job `banco` do CI sobe é construído SÓ pelas migrations e NÃO reproduz o
-- *default privilege* que a plataforma Supabase concede a `authenticated` num projeto
-- hospedado — foi assim que `pendencias_item` deu `permission denied` só no CI. Grant
-- explícito é defesa em profundidade: quem separa cargo continua sendo a RLS acima.
--
-- ROLLBACK LÓGICO: `drop view public.v_colaboradores_textos; drop table public.colaboradores;
-- drop function public.colaborador_chave(text);` — aditiva, nenhum dado do acervo se perde.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) A chave
-- ---------------------------------------------------------------------------
create or replace function public.colaborador_chave(p_nome text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select lower(btrim(regexp_replace(translate(normalize(p_nome, NFC),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'),
    '[ \t\n\r\f\v]+', ' ', 'g')));
$$;

comment on function public.colaborador_chave(text) is
  'Chave de deduplicação de nome de pessoa: minúsculas, sem acento, espaços colapsados e aparados. IMMUTABLE sem extensão (translate + regexp_replace de 4 argumentos; nada de unaccent). Fonte ÚNICA da normalização — usada pela coluna gerada colaboradores.nome_chave e pela view v_colaboradores_textos, e espelhada em src/lib/colaboradores/chave.ts com guarda TS↔SQL.';

revoke all on function public.colaborador_chave(text) from public, anon;
grant execute on function public.colaborador_chave(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) A tabela
-- ---------------------------------------------------------------------------
create table public.colaboradores (
  id          uuid primary key default gen_random_uuid(),
  nome        text        not null,
  matricula   text,
  setor       text,
  filial_id   smallint    references public.filiais (id),
  ativo       boolean     not null default true,
  criado_por  uuid        not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  nome_chave  text generated always as (public.colaborador_chave(nome)) stored,
  constraint colaboradores_nome_nao_vazio check (btrim(nome) <> '')
);

comment on table public.colaboradores is
  'Cadastro de pessoas (F37 · D5). Modelo HÍBRIDO: o registro NOVO grava colaborador_id E o texto (o texto continua sendo o retrato da época — doutrina do repositório); o histórico anterior fica com texto e id nulo, e é resolvido POR CHAVE na leitura, nunca por UPDATE (guarda_acervo, 0081). Não se apaga: desativa-se.';
comment on column public.colaboradores.nome_chave is
  'GERADA por public.colaborador_chave(nome). Índice único: duas pessoas reais de mesmo nome normalizado não cabem — a colisão é devolvida como frase em pt-BR pela tela, e a saída é diferenciar o nome ou usar a matrícula.';
comment on column public.colaboradores.filial_id is
  'Filial de referência da pessoa. É ATRIBUTO, não escopo de escrita: criar/editar colaborador não passa por vínculo de filial (operador_filiais).';

create unique index colaboradores_nome_chave_uidx on public.colaboradores (nome_chave);
create index colaboradores_filial_idx on public.colaboradores (filial_id) where filial_id is not null;
create index colaboradores_ativo_nome_idx on public.colaboradores (ativo, nome);

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.colaboradores enable row level security;

create policy "leitura operador" on public.colaboradores
  for select to authenticated
  using ((select public.papel_atual()) is not null);

create policy "escrita cria colaborador" on public.colaboradores
  for insert to authenticated
  with check ((select public.pode_escrever()));

create policy "admin atualiza colaborador" on public.colaboradores
  for update to authenticated
  using ((select public.e_admin()))
  with check ((select public.e_admin()));

-- Sem policy de DELETE: ninguém apaga cadastro de pessoa pela API.
grant select, insert, update on table public.colaboradores to authenticated;

-- ---------------------------------------------------------------------------
-- 4) A fila de consolidação — AGREGADA NO SQL
-- ---------------------------------------------------------------------------
-- A tela /admin/colaboradores precisa responder "quais nomes digitados à mão ainda
-- não têm cadastro, e quantas vezes cada um aparece". Essa contagem NÃO pode nascer
-- de linhas lidas no cliente: é exatamente a lição do teto de 1.000 linhas
-- (v1.40.2, docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md). Ela sai daqui, já somada.
--
-- `security_invoker = true` é obrigatório (o roteiro seguranca_catalogo.sql varre
-- TODAS as views do schema e reprova qualquer uma sem essa opção). Com ele, quem lê
-- a view enxerga o que a RLS deixa — e o piso de leitura já é "todo logado ativo".
--
-- `mode() within group` escolhe a grafia e a filial MAIS FREQUENTES do grupo — não
-- uma qualquer: é o palpite certo para pré-preencher o cadastro que vai nascer.
create view public.v_colaboradores_textos
with (security_invoker = true) as
  select
    g.nome_chave,
    g.grafia_exemplo,
    g.ocorrencias,
    g.grafias,
    g.filial_id,
    (c.id is not null) as ja_cadastrado,
    c.id               as colaborador_id
  from (
    select
      public.colaborador_chave(t.nome)                        as nome_chave,
      mode() within group (order by t.nome)                    as grafia_exemplo,
      count(*)::bigint                                         as ocorrencias,
      count(distinct t.nome)::bigint                           as grafias,
      mode() within group (order by t.filial_id)               as filial_id
    from (
      select m.colaborador as nome, m.filial_id
        from public.movimentacoes m
       where btrim(coalesce(m.colaborador, '')) <> ''
      union all
      select l.colaborador, l.filial_id
        from public.lancamentos_item l
       where btrim(coalesce(l.colaborador, '')) <> ''
    ) t
    group by 1
  ) g
  left join public.colaboradores c on c.nome_chave = g.nome_chave;

comment on view public.v_colaboradores_textos is
  'Fila de consolidação (F37 · A.5): um grupo por chave normalizada de nome digitado à mão em movimentacoes/lancamentos_item, com a contagem de ocorrências SOMADA NO BANCO e a marca de já ter cadastro. `ja_cadastrado = false` é o que a tela oferece para criar em lote. Não altera registro nenhum — o passado se resolve por chave na leitura.';

grant select on public.v_colaboradores_textos to authenticated;

-- O RESUMO da fila, em DUAS linhas no máximo — e é por isso que ele existe.
--
-- A tela precisa de quatro números: quantos nomes ainda não têm cadastro, quantos
-- registros estão por trás deles, e o mesmo par para os já cadastrados. Somar isso
-- lendo os grupos no cliente seria paginar 904 linhas para obter 4 números — e
-- paginação client-side é exatamente onde nasce a contagem truncada que a v1.40.2
-- documentou (docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md).
--
-- Com esta view a resposta tem no máximo duas linhas: nenhum teto de linhas do
-- PostgREST a alcança, hoje ou depois de alguém mexer na configuração. "Agregue no
-- SQL" deixa de ser recomendação e vira a única coisa que o código consegue fazer.
create view public.v_colaboradores_consolidacao
with (security_invoker = true) as
  select
    t.ja_cadastrado,
    count(*)::bigint                        as grupos,
    coalesce(sum(t.ocorrencias), 0)::bigint as registros
  from public.v_colaboradores_textos t
  group by t.ja_cadastrado;

comment on view public.v_colaboradores_consolidacao is
  'Resumo da fila de consolidação (F37 · A.5) em NO MÁXIMO duas linhas — uma por `ja_cadastrado`. Existe para que os números da tela nunca dependam de paginação no cliente: nenhum teto de linhas do PostgREST alcança duas linhas.';

grant select on public.v_colaboradores_consolidacao to authenticated;

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select count(*) as colaboradores from public.colaboradores;          -- esperado: 0
--   select public.colaborador_chave('  José  Antônio   Peçanha ');       -- 'jose antonio pecanha'
--   select relrowsecurity from pg_class where oid='public.colaboradores'::regclass;  -- true
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='colaboradores' order by 1;
--   -- esperado 3: admin atualiza colaborador (UPDATE) · escrita cria colaborador (INSERT) · leitura operador (SELECT)
--   select count(*) filter (where not ja_cadastrado) as a_consolidar,
--          sum(ocorrencias) filter (where not ja_cadastrado) as registros_sem_cadastro
--     from public.v_colaboradores_textos;
--   select (select reloptions from pg_class where oid='public.v_colaboradores_textos'::regclass);
--   -- esperado: {security_invoker=true}

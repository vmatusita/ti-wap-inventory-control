-- Migration 0125 — o item entra pelo uso: a chave do catálogo e a marca da
-- regularização (F41, frente A · decisões J2 e D4 de docs/PLANO-ITENS.md).
--
-- ADITIVA. Cria uma função de vocabulário, duas colunas, um índice único e TROCA
-- UMA policy. NÃO recria nenhuma RPC, NÃO toca no trigger `valida_lancamento_item`
-- e NÃO grava um único lançamento (a partição é a 0126; a conversão é a 0127).
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA — medido em produção em 31/08/2026
-- ---------------------------------------------------------------------------
-- Para o estoque acompanhar uma devolução, hoje é preciso que ANTES exista (a) o
-- item no catálogo, (b) saldo dele NAQUELA filial e (c) uma saída em aberto que
-- case com a volta. Três pré-condições para registrar um fato que JÁ ACONTECEU —
-- a inversão exata do conceito central do sistema ("a movimentação é a fonte da
-- verdade", spec §4). O resultado está no diário: 58 lançamentos, 22 deles acerto
-- de contagem, e ZERO com `movimentacao_id` — a entrega/devolução com itens da
-- F38 nunca gravou uma linha em produção.
--
-- Esta migration ataca a pré-condição (a); a 0126 ataca (b) e (c).
--
-- ---------------------------------------------------------------------------
-- 1) A CHAVE DO ITEM — espelho EXATO de `colaborador_chave` (0112)
-- ---------------------------------------------------------------------------
-- Não é uma segunda maneira de fazer a mesma coisa: é a MESMA expressão, char a
-- char, com outro nome. Os quatro motivos da 0112 valem sem emenda:
--
--   · `normalize(p_nome, NFC)` por DENTRO de tudo — sem ele "Mochila" digitada no
--     Windows (NFC) e colada do macOS (NFD) dão chaves diferentes;
--   · `btrim` DEPOIS do colapso, nunca antes (btrim sem 2º argumento apara só o
--     espaço ASCII, e deixaria um espaço grudado na chave);
--   · classe explícita `[ \t\n\r\f\v]` no lugar de `\s`, porque o `\s` do Postgres
--     e o do JavaScript NÃO são o mesmo conjunto — é isso que faz a guarda TS↔SQL
--     (`src/lib/itens/chave-sql.test.ts`) ser prova, não esperança;
--   · IMMUTABLE sem extensão (**proibido `unaccent`**), para caber na coluna gerada.
--
-- Hoje a deduplicação do catálogo é só `lower(nome)`: "Mouse " e "mouse" são dois
-- itens. Conferido em produção antes de escrever esta linha: os 22 itens do
-- catálogo **não colidem** sob a chave nova — o índice único entra sem conflito.
--
-- ---------------------------------------------------------------------------
-- 2) POR QUE `criado_por` É ANULÁVEL AQUI, e não `not null` como em colaboradores
-- ---------------------------------------------------------------------------
-- `colaboradores` (0112) nasceu com `criado_por uuid not null` porque a TABELA era
-- nova e não havia linha sem autor. `itens` existe desde a 0014 e tem 22 linhas
-- históricas cujo autor ninguém registrou. Inventar um autor para elas seria
-- mentir no acervo; exigir `not null` travaria a migration. A coluna nasce
-- ANULÁVEL: nula quer dizer "veio de antes de a autoria existir", que é a verdade.
-- Ata em docs/DECISOES.md.
--
-- ---------------------------------------------------------------------------
-- 3) POR QUE O OPERADOR PASSA A INSERIR EM `itens`
-- ---------------------------------------------------------------------------
-- O comentário da 0063 justificava `e_admin()` com "é CATÁLOGO, logo exige ADMIN…
-- ele lança sobre o catálogo curado, não o edita". O precedente que derruba essa
-- justificativa é da própria casa e é de três dias atrás: a F37/D5 abriu
-- `colaboradores` ao operador *"porque é ele quem cadastra a pessoa inline no meio
-- da movimentação, e exigir admin ali quebraria o fluxo na mão dele"*. É a mesma
-- frase, palavra por palavra, para itens — e o custo de não abrir está medido:
-- "a maioria dos itens não foi cadastrada" (dor D4).
--
-- A abertura é **só do INSERT**, e é cirúrgica. Editar, desativar e apagar item
-- continuam `e_admin()`, igualzinho a colaborador. Repare no contraste deliberado
-- com `tipos_item` (0114), que segue `e_admin()` no INSERT: tipo é VOCABULÁRIO
-- administrado, item é CADASTRO OPERACIONAL que nasce no fluxo.
--
-- ⚠ `supabase/tests/papeis_rls.sql` cenário 3c afirma hoje "operador recusado ao
-- criar item" e fica VERMELHO no instante em que esta policy troca. Ele é invertido
-- no mesmo commit, no molde do 3c-ter — é o teste que muda porque a REGRA mudou,
-- não para ficar verde. Ata em docs/DECISOES.md.
--
-- ---------------------------------------------------------------------------
-- 4) A MARCA `regularizacao` — e por que ela NÃO é `forcado`
-- ---------------------------------------------------------------------------
-- `forcado` (0079) é da Zona destrutiva: significa "o desenvolvedor forçou um
-- estado por fora da máquina", e o `guarda_acervo` (0081) recusa INSERT com
-- `forcado = true` fora da janela `estoque.dev_destrutivo`.
--
-- `regularizacao` é o oposto: é uma operação NORMAL, do dia a dia, feita pelo
-- operador sem saber — o acerto de contagem que a RPC grava sozinha quando o item
-- que voltou nunca esteve no diário. Ela não pede janela nenhuma. Serve para:
--   · o histórico dizer "acerto automático — voltou com o equipamento e não havia
--     saída registrada", em vez de um ajuste anônimo;
--   · o relatório separar compra de verdade de acervo descoberto pelo uso;
--   · a 11ª checagem de /dev medir quanto do acervo ainda está sendo descoberto.
-- É VISÍVEL, não silenciosa — que é a única forma de um acerto automático não
-- virar desculpa para inventar estoque.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (nesta ordem — a policy primeiro, a coluna gerada por último):
--   drop policy "escrita cria item" on public.itens;
--   create policy "admin insere" on public.itens
--     for insert to authenticated with check ((select public.e_admin()));
--   alter table public.lancamentos_item drop column regularizacao;
--   alter table public.itens drop column criado_por;
--   drop index public.itens_nome_chave_uidx;
--   alter table public.itens drop column nome_chave;
--   drop function public.item_chave(text);
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) A função de vocabulário
-- ===========================================================================
create or replace function public.item_chave(p_nome text)
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

comment on function public.item_chave(text) is
  'F41 (0125): a chave de deduplicação do nome do item — minúsculas, sem acento, espaços colapsados. Espelho EXATO de public.colaborador_chave (0112), char a char: normalize(NFC) por dentro, translate da tabela de acentos, colapso com a classe explícita [ \t\n\r\f\v] (nunca \s, que difere entre Postgres e JavaScript), btrim DEPOIS do colapso e lower por fora. IMMUTABLE sem extensão (proibido unaccent), para caber na coluna gerada itens.nome_chave. A guarda src/lib/itens/chave-sql.test.ts extrai a tabela de acentos e a classe de espaço DESTE corpo e compara, caractere a caractere, com o TypeScript.';

revoke all on function public.item_chave(text) from public, anon;
grant execute on function public.item_chave(text) to authenticated, service_role;

-- ===========================================================================
-- 2) A coluna gerada e o índice único
-- ===========================================================================
alter table public.itens
  add column nome_chave text generated always as (public.item_chave(nome)) stored;

comment on column public.itens.nome_chave is
  'F41 (0125): o nome normalizado pela public.item_chave — coluna GERADA, nunca escrita à mão. É sobre ela que vive o índice único itens_nome_chave_uidx, o mecanismo que impede o mesmo item de entrar duas vezes por acento ou espaço agora que o operador cadastra no meio do fluxo.';

-- Índice ÚNICO como MECANISMO DE DEDUPLICAÇÃO, não como otimização: é ele que
-- transforma "cadastre à vontade" em "cadastre à vontade sem duplicar". A
-- consequência a dizer em voz alta, e tratada na UI em pt-BR: dois itens de nome
-- normalizado igual não cabem no catálogo — o segundo é recusado com a frase
-- MSG_ITEM_DUPLICADO, não com um erro cru do Postgres.
create unique index itens_nome_chave_uidx on public.itens (nome_chave);

comment on index public.itens_nome_chave_uidx is
  'F41 (0125): deduplicação do catálogo de itens pela chave normalizada. Espelho do colaboradores_nome_chave_uidx (0112). Conferido em produção antes de criar: os 22 itens de então não colidiam.';

-- ===========================================================================
-- 3) A autoria do cadastro
-- ===========================================================================
-- ANULÁVEL de propósito — ver o bloco 2 do cabeçalho. Sem `on delete`, como em
-- colaboradores.criado_por: o default (NO ACTION) é o certo, porque perfil não se
-- apaga, se ARQUIVA (0073), e a autoria histórica fica intacta.
alter table public.itens
  add column criado_por uuid references public.profiles (id);

comment on column public.itens.criado_por is
  'F41 (0125): quem cadastrou o item. ANULÁVEL: as 22 linhas anteriores à F41 não têm autor registrado, e nulo aqui quer dizer exatamente isso — "veio de antes de a autoria existir". Inventar um autor para elas seria mentir no acervo. Preenchida daqui em diante por criarItemInline e pelo cadastro de /admin/itens.';

-- ===========================================================================
-- 4) O operador passa a CRIAR item (e só criar)
-- ===========================================================================
drop policy "admin insere" on public.itens;

create policy "escrita cria item" on public.itens
  for insert to authenticated
  with check ((select public.pode_escrever()));

comment on policy "escrita cria item" on public.itens is
  'F41 (0125): quem escreve no acervo CRIA item de catálogo — porque é o operador quem cadastra o acessório inline no meio da movimentação, e exigir admin ali quebraria o fluxo na mão dele (mesma razão, palavra por palavra, da abertura de colaboradores na F37/D5). Só o INSERT abriu: as policies "admin atualiza" e "admin apaga" seguem e_admin(). Contraste deliberado com tipos_item (0114), que segue e_admin() no INSERT porque é VOCABULÁRIO administrado, não cadastro operacional.';

-- ===========================================================================
-- 5) A marca da regularização
-- ===========================================================================
alter table public.lancamentos_item
  add column regularizacao boolean not null default false;

comment on column public.lancamentos_item.regularizacao is
  'F41 (0125): este ajuste foi o ACERTO AUTOMÁTICO que a RPC gravou sozinha para que a movimentação do equipamento pudesse ser registrada — o item voltou (ou saiu) e o diário não o conhecia. Sempre acompanha tipo = ''ajuste'', quantidade positiva e uma justificativa em `observacao` (o CHECK lanc_item_ajuste_obs a exige). NÃO é `forcado` (0079): aquilo é da Zona destrutiva e exige a janela estoque.dev_destrutivo; isto é operação normal do dia a dia, feita sem o operador precisar saber. A marca existe para o acerto ser VISÍVEL — no histórico, no relatório e na 11ª checagem de /dev (reserva/regularização), nunca silencioso.';

-- Índice parcial no mesmo molde do lancamentos_item_forcado_idx (0079): a
-- checagem de /dev e o futuro selo na ficha varrem só as linhas marcadas, que são
-- poucas por natureza.
create index lancamentos_item_regularizacao_idx
  on public.lancamentos_item (item_id, filial_id, created_at desc)
  where regularizacao;

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   -- a) a função existe, é immutable e tem 1 assinatura só:
--   select p.oid::regprocedure::text, p.provolatile, p.proisstrict
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'item_chave';
--   -- esperado: 1 linha, item_chave(text), provolatile = 'i', proisstrict = true
--
--   -- b) a chave normaliza igual à do colaborador:
--   select public.item_chave(E'  Mochila \t DE  Notebook ') as chave,
--          public.item_chave(E'  Mochila \t DE  Notebook ')
--            = public.colaborador_chave(E'  Mochila \t DE  Notebook ') as igual;
--   -- esperado: 'mochila de notebook', true
--
--   -- c) as colunas novas e o índice:
--   select column_name, is_nullable, is_generated from information_schema.columns
--    where table_schema='public' and table_name='itens' and column_name in ('nome_chave','criado_por');
--   -- esperado: nome_chave (NO, ALWAYS) · criado_por (YES, NEVER)
--   select indexname from pg_indexes
--    where schemaname='public' and indexname in ('itens_nome_chave_uidx','lancamentos_item_regularizacao_idx');
--   -- esperado: as duas
--
--   -- d) a policy trocou, e SÓ o insert:
--   select policyname, cmd, with_check from pg_policies
--    where schemaname='public' and tablename='itens' order by cmd;
--   -- esperado: escrita cria item (INSERT, pode_escrever) · admin atualiza (UPDATE, e_admin)
--   --           admin apaga (DELETE, e_admin) · leitura operador (SELECT, papel_atual is not null)
--
--   -- e) NENHUM lançamento mudou (esta migration não grava acervo):
--   select count(*) as lancamentos, count(*) filter (where regularizacao) as marcados
--     from public.lancamentos_item;
--   -- esperado: 58 e 0 (em produção, em 31/08/2026)

-- Migration 0095 — F24: vocabulário da trilha + a nona checagem de integridade.
--
-- Contexto: docs/prompts/F24-import-conflito-filiais-ultracode.md §4.4 e §5.4.
-- Depende da 0092 (v_conflitos_filiais_grupos) e da 0093 (a RPC que grava o verbo novo).
--
-- ADITIVA e SÓ-LEITURA: nenhum DELETE, nenhum dado tocado → caminho A do RUNBOOK.
-- Foi separada da 0093/0094 de propósito, justamente para não ficar refém do gate junto com
-- elas: se o apply automático das duas destrutivas for barrado, esta entra sozinha.
--
-- =============================================================================
-- 1) O VOCABULÁRIO DA TRILHA — a regra "mexeu aqui, mexa lá" da 0065
-- =============================================================================
-- `eventos_admin.acao` é TEXT de propósito (ação nova não deve exigir migration), e o preço
-- disso é que o vocabulário fechado mora no TypeScript (src/lib/auditoria.ts). O comment da
-- coluna é a única cópia dele que um DBA lê — e `src/lib/validators/dev-destrutivo.test.ts`
-- transformou isso em teste: ele procura a migration MAIS RECENTE que define este comment e
-- exige que TODOS os verbos de ACOES_ADMIN apareçam nela.
--
-- ⚠ Por isso o comment abaixo repete os VINTE verbos anteriores mais o novo. Listar só o
-- verbo da fase derrubaria `npm test` — o teste não faz união com os comments antigos.

comment on column public.eventos_admin.acao is
  'F24 (era F23/F22/F21): o que aconteceu. TEXT e não enum de propósito — ação nova não deve exigir migration. Vocabulário fechado, espelhado em src/lib/auditoria.ts (ACOES_ADMIN/ACAO_ROTULO): convite_gerado, convite_reenviado, papel_alterado, vinculos_alterados, usuario_desativado, usuario_reativado, email_alterado, usuario_apagado, sessoes_encerradas, senha_criada, senha_revogada, senha_reativada, import_executado, ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado, conflito_filiais_resolvido. Os três da F22 (email_alterado, usuario_apagado, sessoes_encerradas) e os SETE da F23 (ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado) são privativos do cargo dev. O da F24 (conflito_filiais_resolvido) é do NÍVEL ADMINISTRADOR (admin ou dev) — é a única exclusão de ativo fora da Zona destrutiva, e alcança exclusivamente ativo que esteja num grupo de conflito entre filiais. Os sete da F23 e o da F24 são gravados DENTRO das próprias RPCs, na mesma transação da operação — se a trilha falhar, a exclusão não acontece. Mexeu aqui, mexa lá — e vice-versa.';


-- =============================================================================
-- 2) A NONA CHECAGEM — grupos de conflito em aberto
-- =============================================================================
-- Reescreve `dev_checagens_integridade()` inteira (é `create or replace`: não há como
-- acrescentar um bloco isolado). Os OITO blocos anteriores são byte a byte os da 0085; o nono
-- é o único trecho novo.
--
-- Por que vale a pena: o conflito é DERIVADO e some sozinho, então nada o registra em lugar
-- nenhum. Sem esta linha, a única forma de saber que existem conflitos abertos seria abrir a
-- tela de pendências. A checagem dá ao dev o número no mesmo lugar onde ele já olha as outras
-- oito — e, ao contrário da oitava (`arquivo_termo_orfao`, que nasce com 3 resíduos antigos),
-- esta nasce em ZERO.
--
-- SQL FIXO, como as outras: a proibição de função que receba SQL/tabela/coluna por parâmetro
-- (CLAUDE.md, 0077) continua valendo integralmente.

create or replace function public.dev_checagens_integridade()
returns table (chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_dev() then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  -- 1. par patrimônio + service tag repetido
  return query
  with d as (
    select a.patrimonio || ' / ' || coalesce(a.service_tag, '—') as item
      from public.ativos a
     where a.patrimonio is not null
     group by a.patrimonio, a.service_tag
    having count(*) > 1
  )
  select 'patrimonio_duplicado'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 2. ativo em filial desativada
  return query
  with d as (
    select a.patrimonio as item
      from public.ativos a join public.filiais f on f.id = a.filial_id
     where not f.ativo
  )
  select 'ativo_filial_inativa'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 3. termo registrado sem o .docx no bucket
  return query
  with d as (
    select t.arquivo_path as item
      from public.termos_gerados t
      left join storage.objects o on o.bucket_id = 'termos' and o.name = t.arquivo_path
     where o.id is null
  )
  select 'termo_sem_arquivo'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 4. perfil vivo sem conta no Auth (conta removida por fora do app)
  return query
  with d as (
    select p.id::text as item
      from public.profiles p left join auth.users u on u.id = p.id
     where u.id is null and p.excluido_em is null
  )
  select 'perfil_sem_conta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 5. conta no Auth sem perfil (o trigger handle_new_user falhou)
  return query
  with d as (
    select u.id::text as item
      from auth.users u left join public.profiles p on p.id = u.id
     where p.id is null
  )
  select 'conta_sem_perfil'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 6. pendência de item aberta cuja movimentação de origem foi estornada
  return query
  with d as (
    select pi.id::text as item
      from public.pendencias_item pi
      join public.movimentacoes m on m.id = pi.movimentacao_id
     where pi.resolvida_em is null
       and exists (select 1 from public.movimentacoes e where e.estorno_de = m.id)
  )
  select 'pendencia_de_estornada'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 7. operador ativo sem nenhuma filial de escrita (entra e não registra nada)
  return query
  with d as (
    select p.id::text as item
      from public.profiles p
     where p.papel = 'operador' and p.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.usuario_id = p.id)
  )
  select 'operador_sem_filial'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 8. (F23) .docx no bucket sem NENHUMA linha de termo que o explique — o órfão inverso.
  --    ⚠ NÃO nasce em zero: 3 em produção em 30/07/2026, resíduo antigo de regeneração de
  --    termo. Vigie o CRESCIMENTO depois de uma exclusão, não o valor absoluto.
  return query
  with d as (
    select o.name as item
      from storage.objects o
     where o.bucket_id = 'termos'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
  )
  select 'arquivo_termo_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- 9. (F24) grupos de CONFLITO ENTRE FILIAIS em aberto — a mesma identidade em 2+ filiais.
  --    Só-leitura, e barata: a derivação sobre o volume real de produção (1.232 ativos) mediu
  --    5,2 ms a quente. Nasce em ZERO e assim deve ficar enquanto ninguém importar um CSV que
  --    conflite; valor > 0 não é defeito, é trabalho esperando na mesa de /pendencias.
  return query
  with d as (
    select g.rotulo as item from public.v_conflitos_filiais_grupos g
  )
  select 'conflito_entre_filiais'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;
end;
$$;

comment on function public.dev_checagens_integridade() is
  'F24 (era F23/F22) (/dev): NOVE checagens de integridade SÓ-LEITURA, com contagem e amostra de até 5 identificadores cada. NÃO corrige nada. Restrita ao cargo dev. O SQL é FIXO aqui de propósito: uma função que recebesse a consulta por parâmetro seria execução de SQL arbitrário com os privilégios do dono, que é o console de SQL que a ordem F22 proíbe na /dev. A oitava (arquivo_termo_orfao) é a única que NÃO nasce em zero (3 em produção, resíduo antigo). A nona (conflito_entre_filiais, F24) conta os grupos de conflito em aberto — nasce em zero, e valor > 0 não é defeito: é trabalho esperando na mesa de /pendencias.';

-- `create or replace` NÃO reseta grants: o `revoke ... from service_role` da 0087 continua
-- valendo e NÃO deve ser desfeito por cópia da 0077 antiga. O par abaixo é o da 0085.
revoke all on function public.dev_checagens_integridade() from public, anon;
grant execute on function public.dev_checagens_integridade() to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a função devolve NOVE linhas (rode como um dev; como service role ela recusa):
--   --    select chave, total from public.dev_checagens_integridade() order by chave;
--   --    esperado: 9 linhas, incluindo 'conflito_entre_filiais'
--
--   -- 2) o comment da coluna lista o verbo da F24:
--   select col_description('public.eventos_admin'::regclass, a.attnum) like '%conflito_filiais_resolvido%' as vocabulario_ok
--     from pg_attribute a
--    where a.attrelid='public.eventos_admin'::regclass and a.attname='acao';
--   -- esperado: true
--
--   -- 3) a função continua SÓ-LEITURA (nenhum verbo de escrita no corpo):
--   select pg_get_functiondef('public.dev_checagens_integridade()'::regprocedure)
--          ~* '(insert into|update |delete from)' as escreve;
--   -- esperado: false
--
--   -- 4) service_role continua SEM execute (0087):
--   select has_function_privilege('service_role','public.dev_checagens_integridade()','execute') as sr_tem;
--   -- esperado: false

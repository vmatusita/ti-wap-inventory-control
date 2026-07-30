-- Migration 0085 — F23: o vocabulário novo da trilha e a OITAVA checagem de integridade.
--
-- Depende da 0082/0083/0084 (que gravam os verbos) e da 0077 (as sete checagens).
-- Contexto: F23 §1.5 (trilha) e §2.1 (o "órfão inverso" no Storage).
--
-- ADITIVA: um `comment on column` e um `create or replace` de função só-leitura. Nenhum dado
-- tocado, nenhum DELETE no corpo → caminho **A** do docs/RUNBOOK-BANCO.md.
--
-- REVERSÃO: restaurar o comment da 0065/0075 e o corpo de dev_checagens_integridade() da 0077.

-- ---------------------------------------------------------------------------
-- 1) O vocabulário — "mexeu aqui, mexa lá" (regra escrita na 0065)
-- ---------------------------------------------------------------------------
-- O espelho em TypeScript é src/lib/auditoria.ts (ACOES_ADMIN / ACAO_ROTULO), e existe teste
-- que derruba `npm test` se os dois divergirem.
comment on column public.eventos_admin.acao is
  'F23 (era F22/F21): o que aconteceu. TEXT e não enum de propósito — ação nova não deve exigir migration. Vocabulário fechado, espelhado em src/lib/auditoria.ts (ACOES_ADMIN/ACAO_ROTULO): convite_gerado, convite_reenviado, papel_alterado, vinculos_alterados, usuario_desativado, usuario_reativado, email_alterado, usuario_apagado, sessoes_encerradas, senha_criada, senha_revogada, senha_reativada, import_executado, ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado. Os três da F22 (email_alterado, usuario_apagado, sessoes_encerradas) e os SETE da F23 (ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado) são privativos do cargo dev. Os sete da F23 são gravados DENTRO das próprias RPCs, na mesma transação da operação — se a trilha falhar, a exclusão não acontece. Mexeu aqui, mexa lá — e vice-versa.';

-- ---------------------------------------------------------------------------
-- 2) A oitava checagem: o ÓRFÃO INVERSO no bucket `termos`
-- ---------------------------------------------------------------------------
-- A checagem 3 (`termo_sem_arquivo`) cobre a direção LINHA → ARQUIVO. A F23 cria a direção
-- contrária: `apagar_ativo` e `resetar_acervo` apagam as LINHAS de `termos_gerados` dentro da
-- transação e devolvem os caminhos para a ACTION remover os objetos DEPOIS do commit — porque
-- `storage.protect_objects_delete` (trigger BEFORE DELETE FOR EACH STATEMENT em
-- storage.objects) recusa toda exclusão de objeto por SQL. Se essa segunda metade falhar, o
-- `.docx` fica no bucket sem nenhuma linha que o explique, e NADA hoje revelaria isso.
--
-- ⚠ ESTA CHECAGEM NÃO NASCE EM ZERO, ao contrário das sete da F22 — e é importante que quem
-- ler a tela saiba disso antes de caçar um bug que não existe. Medido em produção em
-- 30/07/2026, ANTES de qualquer código desta fase: 10 objetos no bucket para 7 linhas, ou
-- seja, **3 órfãos** já existentes. A causa é conhecida e benigna: `persistirTermo`
-- (src/lib/actions/termos.ts) sobe o `.docx` ANTES de gravar a linha e regenera termos com id
-- novo em algumas variantes, deixando o objeto anterior para trás — o mesmo resíduo que o
-- cabeçalho da 0069 já registrava (9 objetos / 6 linhas, na época). O valor a vigiar não é
-- "zero", é "não cresce depois de uma exclusão".
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
end;
$$;

comment on function public.dev_checagens_integridade() is
  'F23 (era F22) (/dev): OITO checagens de integridade SÓ-LEITURA, com contagem e amostra de até 5 identificadores cada. NÃO corrige nada. Restrita ao cargo dev. O SQL é FIXO aqui de propósito: uma função que recebesse a consulta por parâmetro seria execução de SQL arbitrário com os privilégios do dono, que é o console de SQL que a ordem F22 proíbe na /dev. A oitava (arquivo_termo_orfao) cobre a direção que a F23 passou a poder criar — objeto de Storage sem linha — e é a única que NÃO nasce em zero (3 em produção, resíduo antigo).';

revoke all on function public.dev_checagens_integridade() from public, anon;
grant execute on function public.dev_checagens_integridade() to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a função devolve OITO linhas (rode como um dev; como service role ela recusa):
--   --    select chave, total from public.dev_checagens_integridade() order by chave;
--   --    esperado: 8 linhas, incluindo 'arquivo_termo_orfao'
--
--   -- 2) o comment lista os sete verbos novos:
--   select col_description('public.eventos_admin'::regclass, a.attnum) like '%acervo_resetado%'
--          and col_description('public.eventos_admin'::regclass, a.attnum) like '%estado_forcado%' as vocabulario_ok
--     from pg_attribute a
--    where a.attrelid='public.eventos_admin'::regclass and a.attname='acao';
--   -- esperado: true
--
--   -- 3) a função continua SÓ-LEITURA (nenhum verbo de escrita no corpo):
--   select pg_get_functiondef('public.dev_checagens_integridade()'::regprocedure)
--          ~* '(insert into|update |delete from)' as escreve;
--   -- esperado: false

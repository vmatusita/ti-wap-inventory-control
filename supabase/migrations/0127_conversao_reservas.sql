-- Migration 0127 — as reservas abertas ganham saída, e uma checagem para que não
-- voltem (F41, frente A · decisões J1 e J5 de docs/PLANO-ITENS.md).
--
-- CONVERSÃO DE DADOS (só INSERT) + recriação de dev_checagens_integridade.
-- NÃO apaga nem atualiza um único lançamento — o guarda_acervo (0081) recusa
-- UPDATE e DELETE em lancamentos_item a todo mundo, service role incluso, e é
-- assim que esta casa trata acervo.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA — as 5 reservas sem caminho de fechamento
-- ---------------------------------------------------------------------------
-- "Atrelar" (`reserva`) descreve exatamente o que o operador quer — "este item
-- acompanha o equipamento" — e faz outra coisa: prende a unidade a um número de
-- CHAMADO, e só um lançamento `liberacao` COM O MESMO CHAMADO a solta. O
-- checklist da devolução do equipamento emite `retorno`, que só conversa com
-- `saida`. Os dois pares NUNCA se encontram.
--
-- Foi o que o Johnny fez ao tentar contornar o erro do print, e piorou: o item
-- ficou preso, e invisível na ficha do ativo (lançamento avulso nasce sem
-- `movimentacao_id`, por desenho da 0116). Invisível dos dois lados.
--
-- A F41 tira o par Atrelar/Devolução-de-chamado da tela (decisão J1). Isso deixa
-- as 5 reservas de pé em produção sem caminho nenhum — e é esta migration que
-- lhes dá um.
--
-- ---------------------------------------------------------------------------
-- A CONVERSÃO — e por que o efeito no estoque é EXATAMENTE ZERO
-- ---------------------------------------------------------------------------
-- Para cada grupo (item, filial, chamado) com saldo de reserva em aberto `q`:
--   1. `liberacao q` — fecha a reserva (o CHECK lanc_item_chamado exige o chamado,
--      que é preservado);
--   2. `saida q`     — reabre a mesma unidade como saída comum, com a pessoa
--      quando houver nome e o chamado preservado no campo `chamado`.
--
-- Pela fórmula do trigger, `estoque = total − atrelados − máx(0, em uso)`:
--   · a `liberacao` zera `atrelados` daquele chamado  → estoque SOBE q
--   · a `saida` aumenta `em uso` em q                 → estoque DESCE q
-- Antes e depois, a unidade continua fora da prateleira e o `total` não se mexe.
-- O que muda é o CAMINHO DE FECHAMENTO: daqui em diante a devolução do
-- equipamento fecha aquelas unidades como fecha qualquer outra, pelo `retorno`.
--
-- ORDEM: a `liberacao` ANTES da `saida`, sempre. Invertida, a `saida` encontraria
-- o estoque ainda preso pelo `atrelados` e o trigger a recusaria por estoque
-- negativo — nos pares em que o disponível é justo.
--
-- ---------------------------------------------------------------------------
-- IRREVERSÍVEL POR CONSTRUÇÃO, e o Johnny aprovou sabendo (decisão J6)
-- ---------------------------------------------------------------------------
-- Só-INSERT, e o guarda_acervo proíbe apagar lançamento. Não há rollback de dado
-- aqui, e não há como haver: o acervo desta casa não se apaga. O que existe é o
-- CONTRÁRIO da conversão, que seria outro par de lançamentos (`retorno` + nova
-- `reserva`) — e ninguém quer isso, porque o efeito no estoque é zero e o
-- caminho novo é o que funciona.
--
-- ---------------------------------------------------------------------------
-- A DÉCIMA PRIMEIRA CHECAGEM (não a décima — o plano de área errou a conta)
-- ---------------------------------------------------------------------------
-- `dev_checagens_integridade` tem HOJE **dez** checagens: as oito da F22/F23, a
-- `conflito_entre_filiais` da F24 e a `detentor_em_estado_sem_dono` que a 0110
-- acrescentou. A `reserva_aberta` é a **décima primeira**, e o catálogo curado
-- `CHECAGENS`/`TOTAL_CHECAGENS` de src/lib/queries/dev.ts entra no MESMO commit —
-- senão /dev mostra a chave crua em vez do nome (a rede permanente de
-- `juntarCatalogoComResultados` não deixa sumir, mas fica feio e sem descrição).
--
-- SQL FIXO dentro da função, como todas as outras. Função que receba SQL, tabela
-- ou coluna como PARÂMETRO segue **proibida** (F22) — o console de SQL é assunto
-- do Supabase Studio, não desta aplicação.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK LÓGICO:
--   -- reaplicar o corpo de dev_checagens_integridade da 0110 (sem a 11ª checagem).
--   -- ⚠ Os lançamentos da conversão PERMANECEM: guarda_acervo (0081) recusa DELETE
--   --   em lancamentos_item, inclusive para o service role. O rollback desfaz a
--   --   CHECAGEM, nunca o acervo.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) A conversão — única, só INSERT, idempotente por construção
-- ===========================================================================
-- Idempotente porque a lista é recalculada do saldo: rodar de novo depois de
-- convertida encontra `aberto = 0` em todos os grupos e não grava nada.
--
-- A lista é MATERIALIZADA num jsonb ANTES do laço, de propósito: assim não há a
-- menor dúvida sobre o cursor enxergar (ou não) as próprias linhas que o laço
-- insere. Explícito é melhor que depender da semântica de snapshot do portal.
do $$
declare
  v_grupos   jsonb;
  v_g        jsonb;
  v_ctx      record;
  v_qtd      int;
  v_n        int := 0;
begin
  select coalesce(jsonb_agg(g order by g.item_id, g.filial_id, g.chamado), '[]'::jsonb)
    into v_grupos
    from (
      select l.item_id, l.filial_id, l.chamado,
             sum(case l.tipo::text when 'reserva'   then l.quantidade
                                   when 'liberacao' then -l.quantidade
                                   else 0 end) as aberto
        from public.lancamentos_item l
       where l.chamado is not null
       group by l.item_id, l.filial_id, l.chamado
      having sum(case l.tipo::text when 'reserva'   then l.quantidade
                                   when 'liberacao' then -l.quantidade
                                   else 0 end) > 0
    ) g;

  for v_g in select value from jsonb_array_elements(v_grupos) loop
    v_qtd := (v_g ->> 'aberto')::int;

    -- Travar o par ANTES do primeiro INSERT, na mesma disciplina das RPCs.
    perform pg_advisory_xact_lock((v_g ->> 'item_id')::int, (v_g ->> 'filial_id')::int);

    -- O contexto vem da reserva MAIS RECENTE do grupo: é ela que diz para quem a
    -- unidade foi separada e quem a separou. `criado_por` é NOT NULL na tabela —
    -- herdar o autor da reserva é mais honesto do que carimbar um autor de sistema
    -- que não existe.
    select r.colaborador, r.colaborador_id, r.criado_por
      into v_ctx
      from public.lancamentos_item r
     where r.item_id   = (v_g ->> 'item_id')::smallint
       and r.filial_id = (v_g ->> 'filial_id')::smallint
       and r.chamado   = (v_g ->> 'chamado')
       and r.tipo::text = 'reserva'
     order by r.data desc, r.created_at desc
     limit 1;

    -- (1) Fecha a reserva. O chamado é obrigatório aqui (CHECK lanc_item_chamado).
    insert into public.lancamentos_item (
      item_id, filial_id, tipo, quantidade, data,
      chamado, colaborador, colaborador_id, observacao, criado_por
    ) values (
      (v_g ->> 'item_id')::smallint,
      (v_g ->> 'filial_id')::smallint,
      'liberacao'::public.tipo_lancamento,
      v_qtd,
      current_date,
      (v_g ->> 'chamado'),
      v_ctx.colaborador,
      v_ctx.colaborador_id,
      'Conversão F41: o item atrelado ao chamado ' || (v_g ->> 'chamado') ||
        ' passou a ser uma saída comum, para que a devolução do equipamento possa fechá-lo.',
      v_ctx.criado_por
    );

    -- (2) Reabre a mesma unidade como saída comum, preservando chamado e pessoa.
    insert into public.lancamentos_item (
      item_id, filial_id, tipo, quantidade, data,
      chamado, colaborador, colaborador_id, observacao, criado_por
    ) values (
      (v_g ->> 'item_id')::smallint,
      (v_g ->> 'filial_id')::smallint,
      'saida'::public.tipo_lancamento,
      v_qtd,
      current_date,
      (v_g ->> 'chamado'),
      v_ctx.colaborador,
      v_ctx.colaborador_id,
      'Conversão F41: saída correspondente ao chamado ' || (v_g ->> 'chamado') ||
        '. O estoque não mudou — a unidade já estava fora da prateleira.',
      v_ctx.criado_por
    );

    v_n := v_n + 1;
  end loop;

  raise notice 'F41 (0127): % reserva(s) aberta(s) convertida(s) em saída.', v_n;
end $$;

-- ===========================================================================
-- 2) A 11ª checagem de integridade
-- ===========================================================================
-- Corpo de partida lido do banco em 31/08/2026:
--   md5 = c12806bdab1cfab9bac537d17b39d6af  (3955 bytes)
-- A ÚNICA diferença é o bloco `reserva_aberta` acrescentado no fim.
create or replace function public.dev_checagens_integridade()
returns table(chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_dev() then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  return query
  with d as (
    select a.patrimonio || ' / ' || coalesce(a.service_tag, '—') || ' (' || f.nome || ')' as item
      from public.ativos a
      join public.filiais f on f.id = a.filial_id
     where a.patrimonio is not null
     group by a.filial_id, f.nome, a.patrimonio, a.service_tag
    having count(*) > 1
  )
  select 'patrimonio_duplicado'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select a.patrimonio as item from public.ativos a join public.filiais f on f.id = a.filial_id where not f.ativo
  )
  select 'ativo_filial_inativa'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select t.arquivo_path as item from public.termos_gerados t
      left join storage.objects o on o.bucket_id = 'termos' and o.name = t.arquivo_path
     where o.id is null
  )
  select 'termo_sem_arquivo'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select p.id::text as item from public.profiles p left join auth.users u on u.id = p.id
     where u.id is null and p.excluido_em is null
  )
  select 'perfil_sem_conta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select u.id::text as item from auth.users u left join public.profiles p on p.id = u.id where p.id is null
  )
  select 'conta_sem_perfil'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select pi.id::text as item from public.pendencias_item pi
      join public.movimentacoes m on m.id = pi.movimentacao_id
     where pi.resolvida_em is null
       and exists (select 1 from public.movimentacoes e where e.estorno_de = m.id)
  )
  select 'pendencia_de_estornada'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select p.id::text as item from public.profiles p
     where p.papel = 'operador' and p.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.usuario_id = p.id)
  )
  select 'operador_sem_filial'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select o.name as item from storage.objects o
     where o.bucket_id = 'termos'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
  )
  select 'arquivo_termo_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (select g.rotulo as item from public.v_conflitos_filiais_grupos g)
  select 'conflito_entre_filiais'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select coalesce(nullif(btrim(a.patrimonio), ''), nullif(btrim(a.service_tag), ''), a.id::text)
           || ' (' || a.status::text || ')' as item
      from public.ativos a
     where not public.status_tem_detentor(a.status)
       and (a.colaborador_atual is not null or a.setor_atual is not null)
  )
  select 'detentor_em_estado_sem_dono'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- F41 (0127) — a 11ª. A reserva por chamado saiu da tela: só um `liberacao` com
  -- o MESMO chamado a fecha, e nenhuma tela emite isso. Uma reserva aberta aqui
  -- é uma unidade presa sem caminho de volta — a 0127 converteu as 5 que havia, e
  -- esta checagem existe para que não voltem em silêncio.
  return query
  with d as (
    select i.nome || ' · ' || f.nome || ' · chamado ' || l.chamado
           || ' (' || sum(case l.tipo::text when 'reserva'   then l.quantidade
                                            when 'liberacao' then -l.quantidade
                                            else 0 end)::text || ')' as item
      from public.lancamentos_item l
      join public.itens   i on i.id = l.item_id
      join public.filiais f on f.id = l.filial_id
     where l.chamado is not null
     group by i.nome, f.nome, l.chamado
    having sum(case l.tipo::text when 'reserva'   then l.quantidade
                                 when 'liberacao' then -l.quantidade
                                 else 0 end) > 0
  )
  select 'reserva_aberta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;
end;
$$;

comment on function public.dev_checagens_integridade() is
  'F22 (0077), ampliada na 0085, 0095, 0098, 0110 e 0127: as ONZE checagens de integridade só-leitura da área /dev. SQL FIXO por dentro — função que receba SQL, tabela ou coluna como parâmetro é PROIBIDA nesta casa (o console de SQL é assunto do Supabase Studio). SECURITY DEFINER com e_dev() por dentro, na primeira linha. A 11ª (reserva_aberta, F41) vigia as reservas por chamado que a 0127 converteu: elas saíram da tela e só um `liberacao` com o mesmo chamado as fecharia, então uma reserva aberta é uma unidade presa sem caminho de volta.';

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   -- a) NENHUMA reserva aberta sobrou:
--   select count(*) as reservas_abertas from (
--     select 1 from public.lancamentos_item l where l.chamado is not null
--      group by l.item_id, l.filial_id, l.chamado
--     having sum(case l.tipo::text when 'reserva' then l.quantidade
--                                  when 'liberacao' then -l.quantidade else 0 end) > 0
--   ) x;
--   -- esperado: 0
--
--   -- b) o estoque NÃO se mexeu (comparar com a foto tirada antes do apply):
--   select l.item_id, l.filial_id,
--          sum(case l.tipo::text when 'entrada' then l.quantidade
--                                when 'ajuste'  then l.quantidade else 0 end) as total
--     from public.lancamentos_item l group by 1,2 order by 1,2;
--   -- esperado: IDÊNTICO ao de antes (a conversão não grava entrada nem ajuste)
--
--   -- c) a função devolve 11 linhas (rodando como dev):
--   select count(*) from public.dev_checagens_integridade();
--   -- esperado: 11

-- =============================================================================
-- F67C-desfaz.sql — o ROLLBACK da F67C (docs/PLAN-F67C.md §6, decisão 16)
-- =============================================================================
-- Desfaz as oito migrations da F67C NA ORDEM INVERSA DO APPLY: 0207 → 0206 → 0205 → 0204 → 0203 → 0202 → 0201 → 0200.
--   · (0207, 0206, 0205 — a contração) o default public.empresa_legada() VOLTA às 20 colunas empresa_id, uma tabela por
--     comando (filiais, depois as onze, depois as oito) — É O PRIMEIRO PASSO, e sozinho já devolve o comportamento de
--     antes: o escritor que esquecer a empresa volta a gravar a WAP em vez de levar 23502. Na 0206 também volta a
--     assinatura ANTIGA da ferramenta de órfão (text, text, text), com o corpo, o comentário e a ACL da 0196;
--   · (0204 … 0200 — a expansão) as 17 funções recriadas voltam ao corpo de ANTES da 0200 (byte a byte, o texto da
--     migration que as definia por último); a assinatura nova da ferramenta de órfão (uuid, text, text, text) sai.
-- NADA AQUI É TRANSCRITO À MÃO: o arquivo é GERADO das migrations — o `rollback-f67c.test.ts` confere na mesa a
-- completude (cada corpo de volta, a nova fora, os 20 defaults) — e o roteiro `supabase/tests/f67c_rollback.sql` é o
-- ensaio no CI: a impressão do esquema (funções com a ACL, policies, views, gatilhos, comentários E os defaults das
-- colunas) depois deste arquivo = a da cadeia até a 0199.
--
-- IDEMPOTENTE NOS DOIS ESTADOS DE PRODUÇÃO: só a expansão (0200–0204) ou a expansão e a contração (0205–0207). `set
-- default` sobre uma coluna que já o tem é o mesmo comando; o `create or replace` da antiga da ferramenta de órfão a
-- recria se a contração a derrubou e a reescreve igual se não; o `drop … if exists` da nova idem. Rodado duas vezes, dá o
-- mesmo esquema. NENHUMA linha de negócio é escrita: toda linha gravada depois da F67C já tem a empresa (o default
-- devolvido não muda linha nenhuma), e os escritores novos do app continuam mandando a empresa (inofensivo com o default
-- de volta). Nenhum dado se perde.
--
-- ENTRE FASES: este vem ANTES do F67B-desfaz.sql (e, por ele, dos de antes) — os roteiros de rollback das fases
-- anteriores rodam a cadeia inteira até a 0207 e medem a impressão contra a de antes deles: sem este primeiro, as 17
-- funções recriadas e a ferramenta de órfão nova apareceriam como diferença.
--
-- Sem `begin`/`commit` próprios: quem roda decide a transação (o roteiro roda dentro da dele; num banco vivo, o
-- `execute_sql` do MCP com o conteúdo EXATO deste arquivo — ou SÓ o bloco dos defaults do lote, se a vigília pedir
-- (RUNBOOK, Anexo F67C) —, uma transação só). O ledger (`supabase_migrations.schema_migrations`) NÃO é reescrito.
-- `set default` toma ACCESS EXCLUSIVE por instantes em cada tabela: `lock_timeout` de 2 s por `set`/`reset` — sem o lock,
-- falha inteiro e se repete (no máximo três vezes em 30 min), nunca espera o app.
-- =============================================================================

set lock_timeout = '2s';

-- =============================================================================
-- 0207 (a contração) — o default de volta em filiais
-- =============================================================================
alter table public.filiais alter column empresa_id set default public.empresa_legada();

-- =============================================================================
-- 0206 (a contração) — o default de volta nas onze do lote 2; a assinatura antiga da ferramenta de órfão de volta
-- =============================================================================
alter table public.eventos_admin alter column empresa_id set default public.empresa_legada();
alter table public.import_logs alter column empresa_id set default public.empresa_legada();
alter table public.import_prefixos_patrimonio alter column empresa_id set default public.empresa_legada();
alter table public.import_termos_categoria alter column empresa_id set default public.empresa_legada();
alter table public.import_termos_estado alter column empresa_id set default public.empresa_legada();
alter table public.kits_modelos alter column empresa_id set default public.empresa_legada();
alter table public.motivos alter column empresa_id set default public.empresa_legada();
alter table public.relatorios_gerados alter column empresa_id set default public.empresa_legada();
alter table public.senhas_acesso alter column empresa_id set default public.empresa_legada();
alter table public.tipos_item alter column empresa_id set default public.empresa_legada();
alter table public.unidades_apelidos alter column empresa_id set default public.empresa_legada();

create or replace function public.registrar_limpeza_termos_sem_linha(p_raiz text, p_confirmacao text, p_justificativa text)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lista    text[];
  v_esperada text;
begin
  if (select auth.uid()) is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;
  -- um .docx sem linha não é de empresa nenhuma: quem o limpa é a PLATAFORMA (decisão 13/11-1)
  if not public.e_plataforma() then
    raise exception 'Limpar arquivos de termo sem registro é restrito à plataforma.' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.' using errcode = '22023';
  end if;
  if p_raiz is null or p_raiz !~ '^orfao/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z$' then
    raise exception 'A pasta da cópia dos arquivos de termo está fora da forma. Nada foi registrado.' using errcode = '22023';
  end if;

  -- duas limpezas ao mesmo tempo contariam a mesma lista
  perform pg_advisory_xact_lock(hashtext('termos_sem_linha_limpar'));

  v_lista := array(
    select o.name
      from storage.objects o
     where o.bucket_id = 'termos'
       and o.created_at < now() - interval '1 hour'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
     order by o.name);
  v_esperada := 'LIMPAR ' || coalesce(array_length(v_lista, 1), 0)::text || ' ARQUIVOS DE TERMO';
  if p_confirmacao is distinct from v_esperada then
    raise exception 'Confirmação incorreta: digite exatamente "%". Nada foi registrado.', v_esperada using errcode = '22023';
  end if;
  if coalesce(array_length(v_lista, 1), 0) = 0 then
    raise exception 'Não há arquivo de termo sem registro para limpar.' using errcode = '22023';
  end if;
  if exists (select 1 from public.eventos_admin e
              where e.acao = 'termos_sem_linha_limpos' and e.detalhe->>'raiz' = p_raiz) then
    raise exception 'Esta pasta de cópia já foi usada. Nada foi registrado.' using errcode = '22023';
  end if;

  -- a TRILHA, antes de qualquer cópia: a 12ª reconhece a cópia sob a raiz por ela
  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values ((select auth.uid()), 'termos_sem_linha_limpos', p_raiz,
          jsonb_build_object('raiz', p_raiz, 'arquivos', to_jsonb(v_lista), 'total', array_length(v_lista, 1),
                             'justificativa', btrim(p_justificativa)));
  return v_lista;
end;
$$;

comment on function public.registrar_limpeza_termos_sem_linha(text, text, text) is
  'F67B (0196): a ferramenta NOMEADA de órfão da Zona destrutiva — a parte do banco. Só a plataforma; justificativa; raiz orfao/<carimbo>; a lista dos .docx de termos sem linha há mais de uma hora (nunca um termo no meio da gravação); a confirmação digitada LIMPAR <N> ARQUIVOS DE TERMO; a trilha termos_sem_linha_limpos gravada ANTES da cópia. A cópia e a remoção são da API do Storage (o gatilho protect_objects_delete recusa DELETE por SQL), pela Server Action, só da lista devolvida.';

revoke all on function public.registrar_limpeza_termos_sem_linha(text, text, text) from public, anon, service_role;
grant execute on function public.registrar_limpeza_termos_sem_linha(text, text, text) to authenticated;

-- =============================================================================
-- 0205 (a contração) — o default de volta nas oito do acervo
-- =============================================================================
alter table public.anotacoes alter column empresa_id set default public.empresa_legada();
alter table public.ativos alter column empresa_id set default public.empresa_legada();
alter table public.colaboradores alter column empresa_id set default public.empresa_legada();
alter table public.itens alter column empresa_id set default public.empresa_legada();
alter table public.lancamentos_item alter column empresa_id set default public.empresa_legada();
alter table public.movimentacoes alter column empresa_id set default public.empresa_legada();
alter table public.pendencias_item alter column empresa_id set default public.empresa_legada();
alter table public.termos_gerados alter column empresa_id set default public.empresa_legada();

-- =============================================================================
-- 0204 (a expansão) — a função volta ao corpo de antes da 0200; a assinatura nova da ferramenta de órfão sai
-- =============================================================================

-- import_gravar_trilha: o corpo da 0131 (0131_import_decomposto.sql)
create or replace function public.import_gravar_trilha(
  p_plano       jsonb,
  p_filial      smallint,
  p_backup_path text,
  p_correcoes   jsonb,
  p_uid         uuid,
  p_criados     integer,
  p_movs        integer,
  p_anotacoes   integer,
  p_termos      integer,
  p_conflitos   integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  -- ---------- 6. log ----------
  insert into public.import_logs (
    filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, correcoes, criado_por, conflitos_abertos
  ) values (
    p_filial, 'substituir',
    coalesce(p_plano->>'arquivoHash', ''),
    coalesce((p_plano->>'totalLinhasDados')::int, 0),
    p_criados, p_movs, p_anotacoes, p_termos,
    p_backup_path, coalesce(p_correcoes, '[]'::jsonb), p_uid, p_conflitos
  )
  returning id into v_log_id;

  return v_log_id;
end $$;

drop function if exists public.registrar_limpeza_termos_sem_linha(uuid, text, text, text);

-- =============================================================================
-- 0203 (a expansão) — as 2 funções voltam ao corpo de antes da 0200
-- =============================================================================

-- import_criar_ativos: o corpo da 0131 (0131_import_decomposto.sql)
create or replace function public.import_criar_ativos(
  p_elemento jsonb,
  p_filial   smallint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo_id uuid;
begin
  -- 4a. ativo. Pendência de nascimento é `;`-joinável (F7E patrimônio + F15 service tag):
  --   patrimonio null    → 'sem patrimônio físico'  (sincronia: PENDENCIA_SEM_PATRIMONIO);
  --   serviceTag vazia   → 'sem service tag'        (sincronia: PENDENCIA_SEM_SERVICE_TAG);
  --   os dois            → 'sem patrimônio físico; sem service tag';
  --   nenhum             → null. concat_ws('; ', …) pula os NULLs; nullif('', '') → null.
  insert into public.ativos (
    patrimonio, patrimonio_original, service_tag, categoria,
    marca, modelo, fornecedor, memoria, armazenamento, processador, hostname,
    filial_id, origem, observacoes, pendencia
  ) values (
    p_elemento->>'patrimonio',
    nullif(p_elemento->>'patrimonioOriginal', ''),
    nullif(p_elemento->>'serviceTag', ''),
    (p_elemento->>'categoria')::public.categoria_ativo,
    nullif(p_elemento->>'marca', ''),
    nullif(p_elemento->>'modelo', ''),
    nullif(p_elemento->>'fornecedor', ''),
    nullif(p_elemento->>'memoria', ''),
    nullif(p_elemento->>'armazenamento', ''),
    nullif(p_elemento->>'processador', ''),
    nullif(p_elemento->>'hostname', ''),
    p_filial,
    'importacao',
    nullif(p_elemento->>'observacoes', ''),
    nullif(
      concat_ws('; ',
        case when (p_elemento->>'patrimonio') is null then 'sem patrimônio físico' end,
        case when nullif(p_elemento->>'serviceTag', '') is null then 'sem service tag' end
      ),
      ''
    )
  )
  returning id into v_ativo_id;

  return v_ativo_id;
end $$;

-- import_lancar_movimentacoes: o corpo da 0131 (0131_import_decomposto.sql)
create or replace function public.import_lancar_movimentacoes(
  p_ativo        uuid,
  p_elemento     jsonb,
  p_filial       smallint,
  p_uid          uuid,
  p_data_import  date,
  p_obs_marcador text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado public.status_ativo;
begin
  v_estado := (p_elemento->>'estadoAlvo')::public.status_ativo;

  -- 4b (REVERTIDO — F8): compra de abertura SEMPRE marcada (escondida do relatório),
  --   COM ou SEM dataEntrada. A data continua a REAL (dataEntrada) quando houver; só a
  --   observação volta a ser SEMPRE `p_obs_marcador` (`import startup dd/MM/yyyy`), no
  --   lugar do `case` condicional da F7H — equivale ao passo 4b da 0034. Motivo: a
  --   planilha de startup não distingue "compra nova" de "saldo de abertura" (toda
  --   linha tem data), então a F7H inundava as Entradas com o acervo pré-existente.
  --   Toda compra de abertura é BASELINE; compra "de verdade" é a lançada manualmente
  --   no sistema pós-go-live (sem marcador → aparece nas Entradas normalmente).
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
  values (
    p_ativo, 'compra',
    coalesce(nullif(p_elemento->>'dataEntrada', '')::date, p_data_import),
    p_filial, p_obs_marcador, p_uid
  );

  -- 4c. ajuste de reconciliação (só se o estado-alvo não é em_estoque). SEMPRE com
  --     o marcador: é reconciliação de estado, não entrada/saída real (e nem consta
  --     nas tabelas do relatório). data = dataAjuste (ou data do import se null).
  if v_estado <> 'em_estoque' then
    insert into public.movimentacoes (
      ativo_id, tipo, data, filial_id, colaborador, setor, chamado,
      observacao, status_resultante, criado_por
    ) values (
      p_ativo, 'ajuste',
      coalesce(nullif(p_elemento->>'dataAjuste', '')::date, p_data_import),
      p_filial,
      nullif(p_elemento->>'colaborador', ''), nullif(p_elemento->>'setor', ''), nullif(p_elemento->>'chamado', ''),
      p_obs_marcador, v_estado, p_uid
    );
  end if;

  -- 4d. sincroniza colaborador_atual/setor_atual quando o estado é de POSSE.
  if v_estado in ('em_uso', 'emprestado', 'reservado') then
    update public.ativos set
      colaborador_atual = nullif(p_elemento->>'colaborador', ''),
      setor_atual       = nullif(p_elemento->>'setor', ''),
      updated_at        = now()
    where id = p_ativo;
  end if;
end $$;

-- =============================================================================
-- 0202 (a expansão) — as 4 funções voltam ao corpo de antes da 0200
-- =============================================================================

-- lancar_itens_lote: o corpo da 0126 (0126_lancamento_regulariza.sql)
create or replace function public.lancar_itens_lote(
  p_linhas jsonb,
  p_criado_por uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  k_teto      constant int := 10;   -- espelha MAX_LINHAS_LOTE_ITEM (src/lib/validators/item.ts)
  v_autor     uuid := coalesce(auth.uid(), p_criado_por);
  v_n         int;
  v_i         int;
  v_elem      jsonb;
  v_par       record;
  v_item_id   int;
  v_filial    smallint;
  v_tipo      text;
  v_qtd       int;
  v_aberto    int;
  v_estoque   int;
  v_reg       int;
  v_normal    int;
  v_obs_reg   text;
  v_n_reg     int := 0;
  v_qtd_reg   int := 0;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'O lançamento precisa ser uma lista de linhas.'
      using errcode = 'invalid_parameter_value';
  end if;
  v_n := jsonb_array_length(p_linhas);
  if v_n = 0 then
    raise exception 'Adicione ao menos um item ao lançamento.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_n > k_teto then
    raise exception 'O lançamento aceita no máximo % itens.', k_teto
      using errcode = 'invalid_parameter_value';
  end if;

  -- Cinto-e-suspensórios PELA MENSAGEM, por filial distinta (a policy
  -- "operador lanca" já barraria com 42501 cru).
  for v_par in
    select distinct (e.value ->> 'filial_id')::smallint as filial
      from jsonb_array_elements(p_linhas) e
     order by 1
  loop
    if not public.pode_escrever_filial(v_par.filial) then
      raise exception 'Você não tem permissão de escrita nesta filial.'
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  -- Travas advisory em ordem total crescente (item_id, filial_id), ANTES do
  -- primeiro INSERT — a classe 1 do cabeçalho da 0117.
  for v_par in
    select distinct (e.value ->> 'item_id')::int   as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_linhas) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- EM ORDEM TOTAL PELO EFEITO — a mesma da 0123, pela mesma razão: quem repõe o
  -- disponível entra antes de quem consome, desempatando pela ordinalidade.
  for v_par in
    select (e.ordinality - 1)::int as idx
      from jsonb_array_elements(p_linhas) with ordinality e(value, ordinality)
     order by case
                when (e.value ->> 'tipo') in ('entrada', 'retorno', 'liberacao') then 0
                when (e.value ->> 'tipo') = 'ajuste'
                 and jsonb_typeof(e.value -> 'quantidade') = 'number'
                 and (e.value ->> 'quantidade')::numeric > 0 then 0
                else 1
              end,
              e.ordinality
  loop
    v_i     := v_par.idx;
    v_elem  := p_linhas -> v_i;
    v_item_id := (v_elem ->> 'item_id')::int;
    v_filial  := (v_elem ->> 'filial_id')::smallint;
    v_tipo    := v_elem ->> 'tipo';
    v_qtd     := (v_elem ->> 'quantidade')::int;

    if v_item_id is null or v_item_id <= 0 then
      raise exception 'Item inválido na linha % do lançamento.', v_i + 1
        using errcode = 'invalid_parameter_value', detail = 'f41_linha=' || v_i;
    end if;
    if v_qtd is null or (v_tipo <> 'ajuste' and v_qtd <= 0) or (v_tipo = 'ajuste' and v_qtd = 0) then
      raise exception 'Quantidade inválida na linha % do lançamento.', v_i + 1
        using errcode = 'invalid_parameter_value', detail = 'f41_linha=' || v_i;
    end if;

    -- ===== A PARTIÇÃO — idêntica à de criar_movimentacao_com_itens ===========
    v_reg    := 0;
    v_normal := v_qtd;

    if v_tipo = 'retorno' then
      select greatest(0, coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                                        when 'retorno' then -l.quantidade
                                                        else 0 end), 0))
        into v_aberto
        from public.lancamentos_item l
       where l.item_id = v_item_id::smallint and l.filial_id = v_filial;
      v_normal := least(v_qtd, v_aberto);
      v_reg    := v_qtd - v_normal;

    elsif v_tipo = 'saida' then
      with agg as (
        select coalesce(sum(case l.tipo::text when 'entrada' then l.quantidade
                                              when 'ajuste'  then l.quantidade
                                              else 0 end), 0) as total_raw,
               coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                              when 'retorno' then -l.quantidade
                                              else 0 end), 0) as lib_raw
          from public.lancamentos_item l
         where l.item_id = v_item_id::smallint and l.filial_id = v_filial
      ),
      atrel as (
        select coalesce(sum(greatest(0, net)), 0) as atrelados from (
          select coalesce(sum(case l.tipo::text when 'reserva'   then l.quantidade
                                                when 'liberacao' then -l.quantidade
                                                else 0 end), 0) as net
            from public.lancamentos_item l
           where l.item_id = v_item_id::smallint and l.filial_id = v_filial
             and l.chamado is not null
           group by l.chamado
        ) b
      )
      select agg.total_raw - atrel.atrelados - greatest(0, agg.lib_raw)
        into v_estoque
        from agg, atrel;
      v_reg    := greatest(0, v_qtd - v_estoque);
      v_normal := v_qtd;
    end if;

    if v_reg > 0 then
      v_obs_reg := nullif(btrim(coalesce(v_elem ->> 'observacao_regularizacao', '')), '');
      if v_obs_reg is null then
        raise exception 'O acerto automático deste item precisa de uma justificativa.'
          using errcode = 'invalid_parameter_value', detail = 'f41_linha=' || v_i;
      end if;
      begin
        insert into public.lancamentos_item (
          item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado, criado_por, regularizacao
        ) values (
          v_item_id::smallint, v_filial, 'ajuste'::public.tipo_lancamento, v_reg,
          coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
          nullif(v_elem ->> 'colaborador', ''),
          null,
          v_obs_reg,
          nullif(v_elem ->> 'chamado', ''),
          v_autor, true
        );
      exception when others then
        raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f41_linha=' || v_i;
      end;
      v_n_reg   := v_n_reg + 1;
      v_qtd_reg := v_qtd_reg + v_reg;
    end if;

    if v_normal <> 0 then
      begin
        insert into public.lancamentos_item (
          item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado, criado_por
        ) values (
          v_item_id::smallint, v_filial, v_tipo::public.tipo_lancamento, v_normal,
          coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
          nullif(v_elem ->> 'colaborador', ''),
          nullif(v_elem ->> 'colaborador_id', '')::uuid,
          nullif(v_elem ->> 'observacao', ''),
          nullif(v_elem ->> 'chamado', ''),
          v_autor
        );
      exception when others then
        raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f41_linha=' || v_i;
      end;
    end if;
  end loop;

  return jsonb_build_object('linhas', v_n,
                            'regularizacoes', v_n_reg, 'unidades_regularizadas', v_qtd_reg);
end $$;

-- reabrir_pendencias_item_com_estornos: o corpo da 0122 (0122_ordem_dos_inversos.sql)
create or replace function public.reabrir_pendencias_item_com_estornos(
  p_ids          uuid[],
  p_justificativa text,
  p_estornos     jsonb,
  p_criado_por   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_autor     uuid := coalesce(auth.uid(), p_criado_por);
  v_reabertas uuid[] := '{}';
  v_par       record;
  v_elem      jsonb;
  v_n_est     int := 0;
  v_orfaos    int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Selecione ao menos uma pendência.'
      using errcode = 'invalid_parameter_value';
  end if;
  if nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    raise exception 'A reabertura precisa de justificativa.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_estornos is null or jsonb_typeof(p_estornos) <> 'array' then
    raise exception 'A lista de estornos precisa ser uma lista (vazia, se nenhum lançamento nasceu).'
      using errcode = 'invalid_parameter_value';
  end if;

  for v_par in
    select distinct (e.value ->> 'item_id')::int   as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_estornos) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  with mudadas as (
    update public.pendencias_item p
       set status        = 'aberta',
           desfecho      = null,
           observacao    = null,
           resolvida_em  = null,
           resolvida_por = null
     where p.id = any(p_ids) and p.status = 'resolvida'
    returning p.id
  )
  select coalesce(array_agg(id), '{}') into v_reabertas from mudadas;

  if cardinality(v_reabertas) = 0 then
    return jsonb_build_object('reabertas', 0, 'estornos', 0);
  end if;

  -- ⚠ ORDEM TOTAL, pelo EFEITO (0122). Ver o cabeçalho: "positivo primeiro" não
  -- desempatava os dois inversos de uma baixa, que são AMBOS positivos.
  for v_elem in
    select e.value
      from jsonb_array_elements(p_estornos) e
     where (e.value ->> 'pendencia_id')::uuid = any(v_reabertas)
     order by case
                when (e.value ->> 'tipo') = 'ajuste'
                 and (e.value ->> 'quantidade')::int > 0 then 0   -- repõe o Total
                when (e.value ->> 'quantidade')::int > 0 then 1   -- repõe a prateleira
                else 2                                            -- consome
              end,
              (e.value ->> 'item_id')::int,
              (e.value ->> 'estorna_id')
  loop
    insert into public.lancamentos_item (
      item_id, filial_id, tipo, quantidade, data,
      colaborador, colaborador_id, chamado, observacao,
      estorna_id, pendencia_item_id, criado_por
    ) values (
      (v_elem ->> 'item_id')::smallint,
      (v_elem ->> 'filial_id')::smallint,
      (v_elem ->> 'tipo')::public.tipo_lancamento,
      (v_elem ->> 'quantidade')::int,
      current_date,
      nullif(v_elem ->> 'colaborador', ''),
      nullif(v_elem ->> 'colaborador_id', '')::uuid,
      nullif(v_elem ->> 'chamado', ''),
      nullif(v_elem ->> 'observacao', ''),
      (v_elem ->> 'estorna_id')::uuid,
      (v_elem ->> 'pendencia_id')::uuid,
      v_autor
    );
    v_n_est := v_n_est + 1;
  end loop;

  select count(*) into v_orfaos
    from public.lancamentos_item l
   where l.pendencia_item_id = any(v_reabertas)
     and l.estorna_id is null
     and not exists (
       select 1 from public.lancamentos_item inv where inv.estorna_id = l.id
     );

  if v_orfaos > 0 then
    raise exception
      'Não dá para reabrir: % lançamento(s) desta pendência ficariam sem o estorno correspondente.', v_orfaos
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object('reabertas', cardinality(v_reabertas), 'estornos', v_n_est);
end $$;

-- resolver_pendencias_item_com_lancamentos: o corpo da 0126 (0126_lancamento_regulariza.sql)
create or replace function public.resolver_pendencias_item_com_lancamentos(
  p_ids uuid[],
  p_desfecho text,
  p_observacao text,
  p_lancamentos jsonb,
  p_criado_por uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_autor      uuid := coalesce(auth.uid(), p_criado_por);
  v_resolvidas uuid[] := '{}';
  v_par        record;
  v_elem       jsonb;
  v_n_lanc     int := 0;
  -- F41 (0126) — a partição da quantidade:
  v_qtd        int;
  v_aberto     int;
  v_reg        int;
  v_normal     int;
  v_obs_reg    text;
  v_n_reg      int := 0;
  v_qtd_reg    int := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Selecione ao menos uma pendência.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_desfecho is null or p_desfecho not in ('recuperado', 'baixa') then
    raise exception 'Desfecho inválido para a pendência de item.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_lancamentos is null or jsonb_typeof(p_lancamentos) <> 'array' then
    raise exception 'A lista de lançamentos precisa ser uma lista (vazia, se nenhum tipo resolveu item).'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Travas advisory em ordem total crescente (item_id, filial_id), ANTES do
  -- primeiro INSERT — mesma razão da 0104 passo 5 e da 0117.
  for v_par in
    select distinct (e.value ->> 'item_id')::int   as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_lancamentos) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- Só as ABERTAS mudam, e só delas nascem lançamentos (idempotência: reenviar
  -- não re-resolve nem duplica lançamento).
  with mudadas as (
    update public.pendencias_item p
       set status       = 'resolvida',
           desfecho     = p_desfecho,
           observacao   = nullif(btrim(coalesce(p_observacao, '')), ''),
           resolvida_em = now(),
           resolvida_por = v_autor
     where p.id = any(p_ids) and p.status = 'aberta'
    returning p.id
  )
  select coalesce(array_agg(id), '{}') into v_resolvidas from mudadas;

  if cardinality(v_resolvidas) = 0 then
    return jsonb_build_object('resolvidas', 0, 'lancamentos', 0);
  end if;

  for v_elem in
    select e.value
      from jsonb_array_elements(p_lancamentos) e
     where (e.value ->> 'pendencia_id')::uuid = any(v_resolvidas)
  loop
    v_qtd := (v_elem ->> 'quantidade')::int;

    -- ===== F41 (0126) — A PARTIÇÃO, lida sob a trava e relida a cada elemento ==
    -- A = em uso em aberto do par (Σsaida − Σretorno, com piso em zero). Sem
    -- isto, "Item recuperado" numa das 14 pendências abertas em produção era
    -- recusado pelo trigger, porque nenhuma delas tem saída registrada.
    select greatest(0, coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                                      when 'retorno' then -l.quantidade
                                                      else 0 end), 0))
      into v_aberto
      from public.lancamentos_item l
     where l.item_id = (v_elem ->> 'item_id')::smallint
       and l.filial_id = (v_elem ->> 'filial_id')::smallint;
    v_normal := least(v_qtd, v_aberto);
    v_reg    := v_qtd - v_normal;

    -- (a0) O ACERTO AUTOMÁTICO primeiro (ordem total da 0122).
    if v_reg > 0 then
      v_obs_reg := nullif(btrim(coalesce(v_elem ->> 'observacao_regularizacao', '')), '');
      if v_obs_reg is null then
        raise exception 'O acerto automático deste item precisa de uma justificativa.'
          using errcode = 'invalid_parameter_value';
      end if;
      insert into public.lancamentos_item (
        item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por, regularizacao
      ) values (
        (v_elem ->> 'item_id')::smallint,
        (v_elem ->> 'filial_id')::smallint,
        'ajuste'::public.tipo_lancamento,
        v_reg,
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        nullif(v_elem ->> 'colaborador', ''),
        null,   -- ver a nota de colaborador_id na função acima
        v_obs_reg,
        (v_elem ->> 'pendencia_id')::uuid,
        v_autor,
        true
      );
      v_n_lanc  := v_n_lanc + 1;
      v_n_reg   := v_n_reg + 1;
      v_qtd_reg := v_qtd_reg + v_reg;
    end if;

    -- (a) O RETORNO, com a parte que o diário conhecia: repõe a prateleira e baixa
    --     a conta da pessoa. Invertido com o ajuste NEGATIVO da baixa, o trigger
    --     recusaria por estoque negativo. Quando A = 0 não há retorno a gravar.
    if v_normal > 0 then
      insert into public.lancamentos_item (
        item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
      ) values (
        (v_elem ->> 'item_id')::smallint,
        (v_elem ->> 'filial_id')::smallint,
        'retorno'::public.tipo_lancamento,
        v_normal,
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        nullif(v_elem ->> 'colaborador', ''),
        nullif(v_elem ->> 'colaborador_id', '')::uuid,
        nullif(v_elem ->> 'observacao_retorno', ''),
        (v_elem ->> 'pendencia_id')::uuid,
        v_autor
      );
      v_n_lanc := v_n_lanc + 1;
    end if;

    -- (b) A BAIXA acrescenta o ajuste negativo: o item saiu do mundo, o Total cai.
    --     Com o acerto de (a0) na frente, o par soma zero — que é a verdade quando
    --     o diário nunca conheceu a peça que agora se dá por perdida.
    if p_desfecho = 'baixa' then
      if nullif(btrim(coalesce(v_elem ->> 'observacao_ajuste', '')), '') is null then
        -- O CHECK lanc_item_ajuste_obs exigiria isso de qualquer jeito; aqui a
        -- mensagem diz o que falta, em vez de estourar como violação genérica.
        raise exception 'A baixa precisa de uma justificativa para o acerto de contagem.'
          using errcode = 'invalid_parameter_value';
      end if;
      insert into public.lancamentos_item (
        item_id, filial_id, tipo, quantidade, data,
        colaborador, colaborador_id, observacao, pendencia_item_id, criado_por
      ) values (
        (v_elem ->> 'item_id')::smallint,
        (v_elem ->> 'filial_id')::smallint,
        'ajuste'::public.tipo_lancamento,
        -((v_elem ->> 'quantidade')::int),
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        nullif(v_elem ->> 'colaborador', ''),
        nullif(v_elem ->> 'colaborador_id', '')::uuid,
        btrim(v_elem ->> 'observacao_ajuste'),
        (v_elem ->> 'pendencia_id')::uuid,
        v_autor
      );
      v_n_lanc := v_n_lanc + 1;
    end if;
  end loop;

  return jsonb_build_object('resolvidas', cardinality(v_resolvidas), 'lancamentos', v_n_lanc,
                            'regularizacoes', v_n_reg, 'unidades_regularizadas', v_qtd_reg);
end $$;

-- transferir_item: o corpo da 0104 (0104_transferir_item.sql)
create or replace function public.transferir_item(
  p_origem      smallint,
  p_destino     smallint,
  p_itens       jsonb,   -- [{"item_id": 3, "quantidade": 10}, …] quantidade > 0
  p_data        date,
  p_chamado     text,
  p_obs_origem  text,    -- composta pela action; nunca vazia (CHECK lanc_item_ajuste_obs)
  p_obs_destino text,
  p_criado_por  uuid
)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_elem     jsonb;
  v_item     int;
  v_qtd      int;
  v_par      record;
  v_vistos   int[] := '{}';
  v_chamado  text  := nullif(btrim(coalesce(p_chamado, '')), '');
  v_data     date  := coalesce(p_data, current_date);
  v_autor    uuid  := coalesce(auth.uid(), p_criado_por);
  v_n        int;
begin
  -- 1) Origem ≠ destino ------------------------------------------------------
  if p_origem is null or p_destino is null then
    raise exception 'Transferencia sem filial de origem ou de destino.'
      using errcode = '22023';
  end if;
  if p_origem = p_destino then
    raise exception 'A filial de destino nao pode ser a mesma da origem.'
      using errcode = '22023';
  end if;

  -- 2) Carrinho não-vazio ----------------------------------------------------
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Transferencia sem item.'
      using errcode = '22023';
  end if;

  -- 3) As duas observações são obrigatórias ---------------------------------
  -- O CHECK `lanc_item_ajuste_obs` pegaria depois, mas com mensagem de banco em
  -- vez de mensagem nossa — e a action não teria como distinguir de qual perna.
  if coalesce(btrim(p_obs_origem), '') = '' or coalesce(btrim(p_obs_destino), '') = '' then
    raise exception 'Transferencia sem observacao nas duas pernas.'
      using errcode = '22023';
  end if;

  -- 4) Vínculo nos DOIS lados (mensagem; a trava é a policy — ver cabeçalho) --
  if not public.pode_escrever_filial(p_origem) then
    raise exception 'Sem permissao de escrita na filial % (origem da transferencia).', p_origem
      using errcode = '42501';
  end if;
  if not public.pode_escrever_filial(p_destino) then
    raise exception 'Sem permissao de escrita na filial % (destino da transferencia).', p_destino
      using errcode = '42501';
  end if;

  -- 5) Validação por item + travas em ORDEM TOTAL DETERMINÍSTICA -------------
  -- (o anti-deadlock do cabeçalho: TODAS as travas antes do primeiro INSERT)
  for v_elem in select * from jsonb_array_elements(p_itens)
  loop
    v_item := (v_elem->>'item_id')::int;
    v_qtd  := (v_elem->>'quantidade')::int;
    if v_item is null or v_item <= 0 then
      raise exception 'Item invalido na transferencia.' using errcode = '22023';
    end if;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Quantidade invalida na transferencia do item % (deve ser maior que zero).', v_item
        using errcode = '22023';
    end if;
    if v_item = any (v_vistos) then
      raise exception 'O item % aparece duas vezes na transferencia — some as quantidades.', v_item
        using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_item;
  end loop;

  for v_par in
    select x.item_id, x.filial
      from (
        select (e->>'item_id')::int as item_id, p_origem::int  as filial
          from jsonb_array_elements(p_itens) e
        union all
        select (e->>'item_id')::int,            p_destino::int
          from jsonb_array_elements(p_itens) e
      ) x
     order by x.item_id, x.filial
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- 6) O par de ajustes, item a item ----------------------------------------
  for v_elem in select * from jsonb_array_elements(p_itens)
  loop
    v_item := (v_elem->>'item_id')::int;
    v_qtd  := (v_elem->>'quantidade')::int;

    -- Perna que SAI: ajuste NEGATIVO na origem. O trigger recusa aqui se o
    -- estoque não comporta — e, como é a mesma transação, a perna de destino
    -- nem chega a existir.
    insert into public.lancamentos_item
      (item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
    values
      (v_item::smallint, p_origem, 'ajuste', -v_qtd, v_chamado, null, v_data, p_obs_origem, v_autor);

    -- Perna que ENTRA: ajuste POSITIVO no destino.
    insert into public.lancamentos_item
      (item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por)
    values
      (v_item::smallint, p_destino, 'ajuste', v_qtd, v_chamado, null, v_data, p_obs_destino, v_autor);
  end loop;

  v_n := jsonb_array_length(p_itens);
  return v_n;
end $$;

-- =============================================================================
-- 0201 (a expansão) — as 5 funções voltam ao corpo de antes da 0200
-- =============================================================================

-- criar_compra_lote: o corpo da 0064 (0064_papeis_guardas_rpcs.sql)
create or replace function public.criar_compra_lote(
  p_itens      jsonb,
  p_criado_por uuid
)
returns table (ativo_id uuid, patrimonio text)
language plpgsql
set search_path = public
as $$
declare
  item     jsonb;
  v_id     uuid;
  v_filial smallint;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Lote de compra vazio';
  end if;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    v_filial := (item->>'filial_id')::smallint;

    -- GUARDA DE VINCULO (F21, migration 0064) — por ITEM do lote.
    -- Esta funcao e SECURITY INVOKER, entao os dois INSERTs abaixo JA passam pelas
    -- policies da 0063 e um operador sem vinculo seria barrado de todo jeito. A guarda
    -- e cinto-e-suspensorio pela MENSAGEM: sem ela o operador receberia o SQLSTATE cru
    -- de violacao de RLS (42501 "new row violates row-level security policy"), que a UI
    -- traduz como "faca login novamente" — conselho errado para quem so nao tem a
    -- filial vinculada. Com ela, a acao devolve o motivo verdadeiro.
    if not public.pode_escrever_filial(v_filial) then
      raise exception 'Sem permissao de escrita na filial % (cadastro de compra).', v_filial
        using errcode = '42501';
    end if;

    insert into public.ativos (
      patrimonio, patrimonio_original, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, fornecedor, filial_id, origem, observacoes
    ) values (
      item->>'patrimonio',
      nullif(item->>'patrimonio_original', ''),
      nullif(item->>'service_tag', ''),
      (item->>'categoria')::public.categoria_ativo,
      nullif(item->>'marca', ''),
      nullif(item->>'modelo', ''),
      nullif(item->>'memoria', ''),
      nullif(item->>'armazenamento', ''),
      nullif(item->>'processador', ''),
      nullif(item->>'fornecedor', ''),
      v_filial,
      'cadastro',
      nullif(item->>'observacoes', '')
    )
    returning id into v_id;

    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_id, 'compra',
      coalesce((item->>'data')::date, current_date),
      v_filial,
      nullif(item->>'observacao', ''),
      coalesce(auth.uid(), p_criado_por)
    );

    ativo_id   := v_id;
    patrimonio := item->>'patrimonio';
    return next;
  end loop;
end $$;

-- devolver_ao_fornecedor: o corpo da 0047 (0047_troca.sql)
create or replace function public.devolver_ao_fornecedor(
  p_ativo_id   uuid,    -- ativo em manutenção
  p_mov        jsonb,   -- {data, chamado, chamado_fornecedor, observacao}
  p_substituto jsonb,   -- null = sem substituto; senão {patrimonio, service_tag, categoria,
                        --  marca, modelo, memoria, armazenamento, processador, hostname,
                        --  filial_id, observacoes, data, observacao}
  p_criado_por uuid
) returns table (mov_id uuid, substituto_id uuid, substituto_mov_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_antigo     public.ativos%rowtype;
  v_uid        uuid := coalesce(auth.uid(), p_criado_por);
  v_sub_filial smallint;
begin
  select * into v_antigo from public.ativos where id = p_ativo_id;
  if v_antigo.id is null then
    raise exception 'Ativo % não encontrado para devolução ao fornecedor.', p_ativo_id;
  end if;

  -- (1) devolução ao fornecedor no ativo ANTIGO. O trigger valida a transição
  --     (em_manutencao -> devolvido_fornecedor) e atualiza o estado; se o ativo não
  --     estiver em_manutencao, status_apos_movimentacao devolve null e o trigger levanta
  --     'Movimentacao ... invalida' -> rollback total (a UI faz a pré-checagem amigável).
  insert into public.movimentacoes (
    ativo_id, tipo, data, filial_id, chamado, chamado_fornecedor, observacao, criado_por
  ) values (
    p_ativo_id, 'devolucao_fornecedor',
    coalesce((p_mov->>'data')::date, current_date),
    v_antigo.filial_id,
    nullif(p_mov->>'chamado', ''),
    nullif(p_mov->>'chamado_fornecedor', ''),
    nullif(p_mov->>'observacao', ''),
    v_uid
  ) returning id into mov_id;

  -- (2) substituto (opcional). fornecedor é HERDADO do antigo (no servidor), NÃO do payload.
  if p_substituto is not null and jsonb_typeof(p_substituto) = 'object' then
    v_sub_filial := coalesce((p_substituto->>'filial_id')::smallint, v_antigo.filial_id);

    insert into public.ativos (
      patrimonio, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, hostname,
      fornecedor, filial_id, origem, observacoes, substitui_ativo_id
    ) values (
      nullif(p_substituto->>'patrimonio', ''),
      nullif(p_substituto->>'service_tag', ''),
      (p_substituto->>'categoria')::public.categoria_ativo,
      nullif(p_substituto->>'marca', ''),
      nullif(p_substituto->>'modelo', ''),
      nullif(p_substituto->>'memoria', ''),
      nullif(p_substituto->>'armazenamento', ''),
      nullif(p_substituto->>'processador', ''),
      nullif(p_substituto->>'hostname', ''),
      v_antigo.fornecedor,          -- herdado do antigo (servidor)
      v_sub_filial,
      'cadastro',
      nullif(p_substituto->>'observacoes', ''),
      p_ativo_id                    -- vínculo de sucessão
    ) returning id into substituto_id;

    -- Movimentação `troca` do substituto (F15): entrada real do período (sem marcador de
    -- import → aparece nas Entradas do relatório, rotulada "Troca" — NUNCA "Compra": o
    -- equipamento chegou por substituição do fornecedor, não por compra). O trigger valida
    -- em_estoque -> em_estoque (nascimento, espelho da compra na máquina de estados).
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      substituto_id, 'troca',
      coalesce((p_substituto->>'data')::date, current_date),
      v_sub_filial,
      nullif(p_substituto->>'observacao', ''),
      v_uid
    ) returning id into substituto_mov_id;
  end if;

  return next;
end $$;

-- criar_movimentacao_com_itens: o corpo da 0126 (0126_lancamento_regulariza.sql)
create or replace function public.criar_movimentacao_com_itens(
  p_movimentacoes jsonb,
  p_itens jsonb,
  p_criado_por uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  k_teto_lote  constant int := 30;   -- espelha MAX_LOTE_MOVIMENTACAO (src/lib/validators/movimentacao.ts)
  v_autor      uuid := coalesce(auth.uid(), p_criado_por);
  v_n_mov      int;
  v_n_itens    int;
  v_i          int;
  v_elem       jsonb;
  v_ativo_id   uuid;
  v_ativo      record;
  v_filial     smallint;
  v_destino    smallint;
  v_ids        uuid[] := '{}';
  v_filiais    smallint[] := '{}';   -- filial de cada movimentação, na mesma ordem
  v_nova_id    uuid;
  v_par        record;
  v_indice     int;
  v_item_id    int;
  v_qtd        int;
  -- F41 (0126) — a partição da quantidade:
  v_tipo       text;
  v_filial_it  smallint;
  v_aberto     int;      -- A = em uso em aberto (teto do retorno)
  v_estoque    int;      -- E = em estoque       (teto da saída)
  v_reg        int;      -- a parte que o diário NÃO conhecia
  v_normal     int;      -- a parte que ele conhecia
  v_obs_reg    text;
  -- O que foi regularizado, para a tela DIZER (e não adivinhar):
  v_n_reg      int := 0;  -- quantas linhas ganharam acerto
  v_qtd_reg    int := 0;  -- quantas unidades entraram por acerto
begin
  -- 1) Forma do payload ------------------------------------------------------
  if p_movimentacoes is null or jsonb_typeof(p_movimentacoes) <> 'array' then
    raise exception 'O lote de movimentações precisa ser uma lista.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_n_mov := jsonb_array_length(p_movimentacoes);
  if v_n_mov = 0 then
    raise exception 'Adicione ao menos um item ao lote.'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_n_mov > k_teto_lote then
    raise exception 'O lote aceita no máximo % movimentações.', k_teto_lote
      using errcode = 'invalid_parameter_value';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'A lista de itens que vão junto precisa ser uma lista (vazia, se não houver).'
      using errcode = 'invalid_parameter_value';
  end if;
  v_n_itens := jsonb_array_length(p_itens);

  if exists (
    select 1 from jsonb_array_elements(p_itens) i
     where coalesce((i.value ->> 'indice_movimentacao')::int, -1) not between 0 and v_n_mov - 1
  ) then
    raise exception 'Item vinculado a uma movimentação que não existe no lote.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- 2) Travar os ATIVOS em ordem total crescente de id, ANTES de qualquer INSERT.
  for v_par in
    select distinct (e.value ->> 'ativo_id')::uuid as ativo_id
      from jsonb_array_elements(p_movimentacoes) e
     where nullif(e.value ->> 'ativo_id', '') is not null
     order by 1
  loop
    perform 1 from public.ativos a where a.id = v_par.ativo_id for update;
  end loop;

  -- 3) Travar os PARES (item, filial) em ordem total crescente, ANTES do primeiro
  --    INSERT (classe 1 do cabeçalho da 0117 — o passo 5 da 0104).
  for v_par in
    select distinct (i.value ->> 'item_id')::int as item_id, a.filial_id as filial
      from jsonb_array_elements(p_itens) i
      join public.ativos a
        on a.id = (p_movimentacoes
                     -> ((i.value ->> 'indice_movimentacao')::int)
                     ->> 'ativo_id')::uuid
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  -- 4) As movimentações, na ordem do lote --------------------------------------
  for v_i in 0 .. v_n_mov - 1 loop
    v_elem := p_movimentacoes -> v_i;
    v_ativo_id := nullif(v_elem ->> 'ativo_id', '')::uuid;

    if v_ativo_id is null then
      raise exception 'Movimentação sem ativo na linha %.', v_i + 1
        using errcode = 'invalid_parameter_value', detail = 'f38_linha=' || v_i;
    end if;

    -- O ativo já está travado pelo passo 2: esta leitura enxerga o estado real.
    select a.id, a.filial_id into v_ativo
      from public.ativos a where a.id = v_ativo_id;

    if not found then
      raise exception 'Ativo não encontrado.'
        using errcode = 'no_data_found', detail = 'f38_linha=' || v_i;
    end if;

    v_filial := v_ativo.filial_id;
    v_destino := nullif(v_elem ->> 'filial_destino_id', '')::smallint;

    -- Cinto-e-suspensórios PELA MENSAGEM (a policy já barraria com 42501 cru).
    if not public.pode_escrever_filial(v_filial) then
      raise exception 'Você não tem permissão de escrita na filial deste ativo.'
        using errcode = 'insufficient_privilege', detail = 'f38_linha=' || v_i;
    end if;

    if (v_elem ->> 'tipo') = 'transferencia' and v_destino is not distinct from v_filial then
      raise exception 'A filial de destino deve ser diferente da atual.'
        using errcode = 'check_violation', detail = 'f38_linha=' || v_i;
    end if;

    begin
      insert into public.movimentacoes (
        ativo_id, tipo, motivo, data, filial_id, filial_destino_id,
        colaborador, colaborador_id, setor, chamado, chamado_fornecedor,
        termo_assinado, termo_data, itens_faltantes, observacao,
        status_resultante, criado_por
      ) values (
        v_ativo_id,
        (v_elem ->> 'tipo')::public.tipo_movimentacao,
        nullif(v_elem ->> 'motivo', ''),
        coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
        v_filial,
        v_destino,
        nullif(v_elem ->> 'colaborador', ''),
        nullif(v_elem ->> 'colaborador_id', '')::uuid,
        nullif(v_elem ->> 'setor', ''),
        nullif(v_elem ->> 'chamado', ''),
        nullif(v_elem ->> 'chamado_fornecedor', ''),
        nullif(v_elem ->> 'termo_assinado', '')::public.termo_status,
        nullif(v_elem ->> 'termo_data', '')::date,
        case
          when jsonb_typeof(v_elem -> 'itens_faltantes') = 'array'
          then array(select jsonb_array_elements_text(v_elem -> 'itens_faltantes'))
          else null
        end,
        nullif(v_elem ->> 'observacao', ''),
        nullif(v_elem ->> 'status_resultante', '')::public.status_ativo,
        v_autor
      )
      returning id into v_nova_id;
    exception when others then
      -- Etiqueta a linha e RE-LANÇA o erro original (mesmo sqlstate, mesma
      -- mensagem): o bloco existe para dizer QUAL linha, nunca para engolir.
      raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f38_linha=' || v_i;
    end;

    v_ids := v_ids || v_nova_id;
    v_filiais := v_filiais || v_filial;
  end loop;

  -- 5) Os lançamentos de item, EM ORDEM TOTAL PELO EFEITO (0123) ---------------
  --    Quem repõe o disponível entra antes de quem consome; o desempate é a
  --    ordinalidade do payload. `v_i` continua sendo o índice ORIGINAL — é ele
  --    que o `detail` da mensagem de erro aponta.
  for v_par in
    select (e.ordinality - 1)::int as idx
      from jsonb_array_elements(p_itens) with ordinality e(value, ordinality)
     order by case
                when (e.value ->> 'tipo') in ('entrada', 'retorno', 'liberacao') then 0
                when (e.value ->> 'tipo') = 'ajuste'
                 and jsonb_typeof(e.value -> 'quantidade') = 'number'
                 and (e.value ->> 'quantidade')::numeric > 0 then 0
                else 1
              end,
              e.ordinality
  loop
    v_i := v_par.idx;
    v_elem := p_itens -> v_i;
    v_indice := (v_elem ->> 'indice_movimentacao')::int;   -- já validado no passo 1
    v_item_id := (v_elem ->> 'item_id')::int;
    v_qtd := (v_elem ->> 'quantidade')::int;

    if v_item_id is null or v_item_id <= 0 then
      raise exception 'Item inválido na lista de itens que vão junto.'
        using errcode = 'invalid_parameter_value', detail = 'f38_item=' || v_i;
    end if;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'A quantidade de um item que vai junto precisa ser maior que zero.'
        using errcode = 'invalid_parameter_value', detail = 'f38_item=' || v_i;
    end if;

    -- ===== F41 (0126) — A PARTIÇÃO DA QUANTIDADE ===========================
    -- Lida DEPOIS das travas do passo 3 e RELIDA a cada linha (os INSERTs desta
    -- mesma transação são visíveis): é o que faz duas linhas do mesmo par se
    -- comportarem em vez de planejarem o mesmo `retorno` duas vezes.
    v_tipo      := v_elem ->> 'tipo';
    v_filial_it := v_filiais[v_indice + 1];
    v_reg       := 0;
    v_normal    := v_qtd;

    if v_tipo = 'retorno' then
      -- A = em uso em aberto do par. Espelha a guarda de `retorno` do trigger
      -- valida_lancamento_item (Σsaida − Σretorno), com piso em zero.
      select greatest(0, coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                                        when 'retorno' then -l.quantidade
                                                        else 0 end), 0))
        into v_aberto
        from public.lancamentos_item l
       where l.item_id = v_item_id::smallint and l.filial_id = v_filial_it;
      v_normal := least(v_qtd, v_aberto);
      v_reg    := v_qtd - v_normal;

    elsif v_tipo = 'saida' then
      -- E = em estoque do par. Espelha, expressão por expressão, a conta de
      -- `v_estoque` do trigger: total_raw − atrelados − máx(0, lib_raw).
      with agg as (
        select coalesce(sum(case l.tipo::text when 'entrada' then l.quantidade
                                              when 'ajuste'  then l.quantidade
                                              else 0 end), 0) as total_raw,
               coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                              when 'retorno' then -l.quantidade
                                              else 0 end), 0) as lib_raw
          from public.lancamentos_item l
         where l.item_id = v_item_id::smallint and l.filial_id = v_filial_it
      ),
      atrel as (
        select coalesce(sum(greatest(0, net)), 0) as atrelados from (
          select coalesce(sum(case l.tipo::text when 'reserva'   then l.quantidade
                                                when 'liberacao' then -l.quantidade
                                                else 0 end), 0) as net
            from public.lancamentos_item l
           where l.item_id = v_item_id::smallint and l.filial_id = v_filial_it
             and l.chamado is not null
           group by l.chamado
        ) b
      )
      select agg.total_raw - atrel.atrelados - greatest(0, agg.lib_raw)
        into v_estoque
        from agg, atrel;
      v_reg    := greatest(0, v_qtd - v_estoque);
      v_normal := v_qtd;   -- a saída sai INTEIRA; o acerto só repõe o que faltava
    end if;

    -- (a) O ACERTO AUTOMÁTICO, SEMPRE PRIMEIRO. É a mesma ordem total que a 0122
    --     já escreveu ("ajuste positivo repõe o Total antes dos demais positivos"),
    --     pelo mesmo motivo: a ordem errada faz o trigger recusar por estoque
    --     negativo.
    if v_reg > 0 then
      v_obs_reg := nullif(btrim(coalesce(v_elem ->> 'observacao_regularizacao', '')), '');
      if v_obs_reg is null then
        -- O CHECK lanc_item_ajuste_obs exigiria isso de qualquer jeito; aqui a
        -- mensagem diz o que falta, em vez de estourar como violação genérica.
        raise exception 'O acerto automático deste item precisa de uma justificativa.'
          using errcode = 'invalid_parameter_value', detail = 'f38_item=' || v_i;
      end if;
      begin
        insert into public.lancamentos_item (
          item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado,
          movimentacao_id, criado_por, regularizacao
        ) values (
          v_item_id::smallint,
          v_filial_it,
          'ajuste'::public.tipo_lancamento,
          v_reg,
          coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
          nullif(v_elem ->> 'colaborador', ''),
          -- colaborador_id NULO de propósito: o acerto é sobre a PRATELEIRA (a peça
          -- entrou no acervo), não sobre a conta de ninguém. O nome fica ao lado
          -- como contexto do histórico; o vínculo que baixa saldo é do `retorno`.
          null,
          v_obs_reg,
          nullif(v_elem ->> 'chamado', ''),
          v_ids[v_indice + 1],
          v_autor,
          true
        );
      exception when others then
        raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f38_item=' || v_i;
      end;
      v_n_reg   := v_n_reg + 1;
      v_qtd_reg := v_qtd_reg + v_reg;
    end if;

    -- (b) A LINHA NORMAL, com a quantidade que o diário reconhece. Para `retorno`
    --     com A = 0 ela não existe — é uma linha só, e é o caso do print.
    if v_normal > 0 then
      begin
        insert into public.lancamentos_item (
          item_id, filial_id, tipo, quantidade, data,
          colaborador, colaborador_id, observacao, chamado,
          movimentacao_id, criado_por
        ) values (
          v_item_id::smallint,
          v_filial_it,
          v_tipo::public.tipo_lancamento,
          v_normal,
          coalesce(nullif(v_elem ->> 'data', '')::date, current_date),
          nullif(v_elem ->> 'colaborador', ''),
          nullif(v_elem ->> 'colaborador_id', '')::uuid,
          nullif(v_elem ->> 'observacao', ''),
          nullif(v_elem ->> 'chamado', ''),
          v_ids[v_indice + 1],
          v_autor
        );
      exception when others then
        raise exception '%', sqlerrm using errcode = sqlstate, detail = 'f38_item=' || v_i;
      end;
    end if;
  end loop;

  -- `regularizacoes` e `unidades_regularizadas` são F41: é com eles que o painel de
  -- sucesso diz, em UMA linha, o que entrou por acerto automático — sem eles a tela
  -- teria de adivinhar, ou consultar de novo depois de gravar. Chave NOVA no jsonb
  -- de retorno não muda a ASSINATURA e não quebra chamador antigo, que só lê as que
  -- conhece.
  return jsonb_build_object('movimentacoes', to_jsonb(v_ids), 'itens', v_n_itens,
                            'regularizacoes', v_n_reg, 'unidades_regularizadas', v_qtd_reg);
end $$;

-- estornar_movimentacao_com_itens: o corpo da 0122 (0122_ordem_dos_inversos.sql)
create or replace function public.estornar_movimentacao_com_itens(
  p_movimentacao_id uuid,
  p_observacao      text,
  p_estornos        jsonb,
  p_criado_por      uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_autor    uuid := coalesce(auth.uid(), p_criado_por);
  v_mov      record;
  v_filial   smallint;
  v_novo     uuid;
  v_par      record;
  v_elem     jsonb;
  v_n        int := 0;
  v_orfaos   int;
begin
  if p_movimentacao_id is null then
    raise exception 'Movimentação não informada para o estorno.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_estornos is null or jsonb_typeof(p_estornos) <> 'array' then
    raise exception 'A lista de itens a estornar precisa ser uma lista (vazia, se a movimentação não carregou item).'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.id, m.ativo_id into v_mov
    from public.movimentacoes m where m.id = p_movimentacao_id;
  if not found then
    raise exception 'Movimentação não encontrada.' using errcode = 'no_data_found';
  end if;

  select a.filial_id into v_filial
    from public.ativos a where a.id = v_mov.ativo_id for update;

  for v_par in
    select distinct (e.value ->> 'item_id')::int as item_id,
                    (e.value ->> 'filial_id')::int as filial
      from jsonb_array_elements(p_estornos) e
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(v_par.item_id, v_par.filial);
  end loop;

  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, estorno_de, observacao, criado_por)
  values (v_mov.ativo_id, 'estorno'::public.tipo_movimentacao, current_date, v_filial,
          p_movimentacao_id, nullif(btrim(coalesce(p_observacao, '')), ''), v_autor)
  returning id into v_novo;

  -- ⚠ Mesma ordem total da função acima (0122), pela mesma razão.
  for v_elem in
    select e.value from jsonb_array_elements(p_estornos) e
     order by case
                when (e.value ->> 'tipo') = 'ajuste'
                 and (e.value ->> 'quantidade')::int > 0 then 0
                when (e.value ->> 'quantidade')::int > 0 then 1
                else 2
              end,
              (e.value ->> 'item_id')::int,
              (e.value ->> 'estorna_id')
  loop
    insert into public.lancamentos_item (
      item_id, filial_id, tipo, quantidade, data,
      colaborador, colaborador_id, chamado, observacao,
      estorna_id, movimentacao_id, criado_por
    ) values (
      (v_elem ->> 'item_id')::smallint,
      (v_elem ->> 'filial_id')::smallint,
      (v_elem ->> 'tipo')::public.tipo_lancamento,
      (v_elem ->> 'quantidade')::int,
      current_date,
      nullif(v_elem ->> 'colaborador', ''),
      nullif(v_elem ->> 'colaborador_id', '')::uuid,
      nullif(v_elem ->> 'chamado', ''),
      nullif(v_elem ->> 'observacao', ''),
      (v_elem ->> 'estorna_id')::uuid,
      v_novo,
      v_autor
    );
    v_n := v_n + 1;
  end loop;

  select count(*) into v_orfaos
    from public.lancamentos_item l
   where l.movimentacao_id = p_movimentacao_id
     and l.estorna_id is null
     and not exists (select 1 from public.lancamentos_item inv where inv.estorna_id = l.id);

  if v_orfaos > 0 then
    raise exception
      'Não dá para estornar: % lançamento(s) de item desta movimentação ficariam sem o estorno correspondente.', v_orfaos
      using errcode = 'check_violation';
  end if;

  return jsonb_build_object('estorno_id', v_novo, 'itens', v_n);
end $$;

-- movimentacao_abrir_pendencias_item: o corpo da 0150 (0150_movimentacao_decomposta.sql)
create or replace function public.movimentacao_abrir_pendencias_item(
  p_mov   public.movimentacoes,
  p_ativo public.ativos
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mov.tipo = 'devolucao' and coalesce(cardinality(p_mov.itens_faltantes), 0) > 0 then
    insert into public.pendencias_item (ativo_id, movimentacao_id, item, colaborador, filial_id)
    select p_mov.ativo_id,
           p_mov.id,
           u.item,
           coalesce(nullif(p_mov.colaborador, ''), p_ativo.colaborador_atual),
           p_mov.filial_id
    from unnest(p_mov.itens_faltantes) as u(item)
    where nullif(trim(u.item), '') is not null;
  end if;
end $$;

-- =============================================================================
-- 0200 (a expansão) — as 5 funções voltam ao corpo de antes da 0200
-- =============================================================================

-- corrigir_patrimonio_com_anotacao: o corpo da 0149 (0149_escrita_atomica_ativos_anotacao.sql)
create or replace function public.corrigir_patrimonio_com_anotacao(
  p_ativo_id uuid,
  p_patrimonio text,
  p_pendencia text,
  p_alterar_pendencia boolean,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.ativos
     set patrimonio = p_patrimonio,
         pendencia  = case when p_alterar_pendencia then nullif(p_pendencia, '') else pendencia end
   where id = p_ativo_id;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi corrigido.'
      using errcode = 'P0002';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

-- definir_service_tag_com_anotacao: o corpo da 0151 (0151_escrita_atomica_reconfere_no_banco.sql)
create or replace function public.definir_service_tag_com_anotacao(
  p_ativo_id uuid,
  p_service_tag text,
  p_pendencia text,
  p_alterar_pendencia boolean,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set service_tag = p_service_tag,
         pendencia   = case when p_alterar_pendencia then nullif(p_pendencia, '') else pendencia end
   where id = p_ativo_id
     and coalesce(btrim(service_tag), '') = '';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi definido.'
        using errcode = 'P0002';
    end if;
    raise exception 'A service tag deste ativo acabou de ser definida — nada foi gravado.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

-- confirmar_assinatura_termo_com_anotacao: o corpo da 0151 (0151_escrita_atomica_reconfere_no_banco.sql)
create or replace function public.confirmar_assinatura_termo_com_anotacao(
  p_ativo_id uuid,
  p_data date,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set termo_assinado = 'sim',
         termo_data = p_data
   where id = p_ativo_id
     and termo_assinado is distinct from 'sim';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi confirmado.'
        using errcode = 'P0002';
    end if;
    raise exception 'Este termo acabou de ser confirmado como assinado — nada foi gravado de novo.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

-- desfazer_confirmacao_termo_com_anotacao: o corpo da 0151 (0151_escrita_atomica_reconfere_no_banco.sql)
create or replace function public.desfazer_confirmacao_termo_com_anotacao(
  p_ativo_id uuid,
  p_destino public.termo_status,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set termo_assinado = p_destino,
         termo_data = null
   where id = p_ativo_id
     and termo_assinado = 'sim';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi desfeito.'
        using errcode = 'P0002';
    end if;
    raise exception 'A confirmação deste termo acabou de ser desfeita — nada foi gravado de novo.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

-- confirmar_assinatura_lote_com_anotacoes: o corpo da 0151 (0151_escrita_atomica_reconfere_no_banco.sql)
create or replace function public.confirmar_assinatura_lote_com_anotacoes(
  p_ativo_ids uuid[],
  p_data date,
  p_texto_anotacao text
)
returns table (ativo_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with atualizado as (
    update public.ativos a
       set termo_assinado = 'sim',
           termo_data = p_data
     where a.id = any (p_ativo_ids)
       and a.termo_assinado is distinct from 'sim'
    returning a.id
  ),
  anotado as (
    -- `returning ativo_id` sozinho é AMBÍGUO aqui: `returns table (ativo_id uuid)` declara
    -- `ativo_id` como variável de saída da função, e o RETURNING bruto colidiria com ela
    -- (42702). O alias `anot` desambigua para a COLUNA.
    insert into public.anotacoes as anot (ativo_id, texto, criado_por)
    select id, p_texto_anotacao, auth.uid() from atualizado
    returning anot.ativo_id
  )
  select anotado.ativo_id from anotado;

  -- Comando SEGUINTE, snapshot novo: ele enxerga o que o UPDATE acima gravou E o que outra
  -- sessão confirmou no meio-tempo. Quem ainda não é 'sim' foi barrado pela RLS de UPDATE.
  if exists (
    select 1
      from public.ativos a
     where a.id = any (p_ativo_ids)
       and a.termo_assinado is distinct from 'sim'
  ) then
    raise exception 'Não foi possível confirmar o lote inteiro — um ou mais termos estão fora do seu vínculo de filial. Nada foi confirmado.'
      using errcode = '42501';
  end if;
end;
$$;

notify pgrst, 'reload schema';

reset lock_timeout;

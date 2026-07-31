-- Migration 0099 — F24 (revisão): dois achados da revisão de código da fase.
--
-- ADITIVA: dois `create or replace function`, nenhum dado tocado, nenhum DELETE de acervo
-- no corpo (o `delete from public.pendencias_item` de `aplicar_movimentacao` é herdado da
-- 0051/0097 e não é acervo) → caminho A do RUNBOOK.
--
-- =============================================================================
-- ACHADO 1 — `chave_identidade_ativo` concatenava sem escapar o separador
-- =============================================================================
-- A 0092 monta a identidade como `patrimonio || '::' || coalesce(service_tag,'')`. O
-- cabeçalho dela discute a colisão do sentinela `∅` (U+2205 não ocorre em patrimônio
-- CANÔNICO) e para por aí — mas desde a F7J o patrimônio NÃO é mais canônico: a RPC de
-- import aceita qualquer texto não-vazio de até 60 caracteres (0094, passo 1d), porque o
-- operador pode marcar "usar mesmo assim" para plaquetas como `LEA7LYHQH4` ou `STF003LOC`.
--
-- Com o separador solto, duas identidades DIFERENTES podem gerar a MESMA chave:
--
--   patrimônio 'A::B' + sem service tag   →  'A::B' || '::' || ''   =  'A::B::'
--   patrimônio 'A'    + service tag 'B::' →  'A'    || '::' || 'B::' = 'A::B::'
--
-- E o mesmo vale para o sentinela: patrimônio literalmente igual a '∅' com service tag 'X'
-- produzia '∅::X', que é exatamente a chave do ramo SEM patrimônio.
--
-- O estrago não é cosmético. `v_conflitos_filiais` passaria a declarar "conflito entre
-- filiais" entre dois equipamentos que não têm identidade nenhuma em comum, e
-- `apagar_ativos_conflito_filiais` — que revalida pela MESMA função, de propósito —
-- autorizaria apagar qualquer um dos dois. Ou seja: a promessa central da RPC ("só alcança
-- ativo que esteja num grupo de conflito") caía por um patrimônio com dois-pontos.
--
-- A CORREÇÃO é um PREFIXO DE COMPRIMENTO no ramo com patrimônio:
--
--   com patrimônio → length(p)::text || ':' || p || '::' || coalesce(tag,'')
--   sem patrimônio → '∅::' || tag
--   sem os dois    → NULL (segue sem identidade, nunca entra em conflito)
--
-- Com o comprimento na frente, o ponto de corte entre patrimônio e tag é DETERMINADO pela
-- própria chave: (patrimônio, tag) é recuperável a partir dela, logo a função é injetiva e
-- não existe par distinto que colida. E os dois ramos ficam em espaços disjuntos de graça —
-- o ramo com patrimônio agora SEMPRE começa por um dígito, o outro sempre por '∅'.
--
-- ⚠ O FORMATO da chave muda, e isso é seguro porque a chave é OPACA fora do SQL:
--   · o app a trata como identificador de grupo (`.in('chave', …)`, key de React, coluna
--     "Conflito" do CSV) e nunca a interpreta;
--   · o `rotulo` do grupo vem de patrimônio/service tag, não da chave;
--   · o espaço de chaves do IMPORT (`chavePatrimonio`/`∅::` em src/lib/patrimonio.ts) é
--     outro, inteiramente TypeScript: `paresEmOutrasFiliais` monta o mapa e `plano.ts`
--     monta a consulta, os dois em TS. Nada compara chave do banco com chave do motor.
--   · nenhum índice é funcional sobre ela, e as duas views a recalculam a cada leitura.
-- Quais ativos estão em conflito NÃO muda: para todo dado sem o caso patológico acima, a
-- nova chave particiona o acervo exatamente como a antiga.

create or replace function public.chave_identidade_ativo(
  p_patrimonio  text,
  p_service_tag text
)
returns text
language sql
immutable
parallel safe
set search_path to 'public'
as $$
  select case
           when p_patrimonio is not null
             then length(p_patrimonio)::text || ':' || p_patrimonio
                  || '::' || coalesce(p_service_tag, '')
           when coalesce(p_service_tag, '') <> ''
             then '∅::' || p_service_tag
           else null
         end
$$;

comment on function public.chave_identidade_ativo(text, text) is
  'F24 (0099, era 0092): FONTE ÚNICA da identidade do ativo para fins de conflito entre filiais. Espelha os dois índices da 0091 sem o filial_id. O ramo COM patrimônio leva PREFIXO DE COMPRIMENTO (`length:patrimonio::tag`) — sem ele o separator `::` era ambíguo e duas identidades distintas podiam colidir numa chave só, já que desde a F7J o patrimônio pode ser texto livre de até 60 caracteres; a colisão faria a view declarar conflito falso e a RPC de exclusão autorizar apagar ativo que não estava em conflito. NULL = ativo sem patrimônio e sem service tag, que nunca entra em conflito. Usada pela view v_conflitos_filiais, pela RPC apagar_ativos_conflito_filiais e por exigir_identidade_livre_na_filial — os três TÊM de concordar.';


-- =============================================================================
-- ACHADO 2 — a guarda da 0097 cobria 2 dos 4 caminhos que mudam `filial_id`
-- =============================================================================
-- A 0097 pôs `exigir_identidade_livre_na_filial` na TRANSFERÊNCIA e no ESTORNO, e o
-- cabeçalho dela fala em "os dois caminhos que mudam filial_id". São quatro: o `case` do
-- UPDATE de `ativos` grava filial nova também em `compra` e `troca`, os dois por
-- `new.filial_id`.
--
--   filial_id = case
--     when new.tipo in ('compra','troca') then new.filial_id      <-- descobertos aqui
--     when new.tipo = 'transferencia'     then coalesce(new.filial_destino_id, filial_id)
--     else filial_id end
--
-- Pela tela isso não acontece: `compra` nasce com o ativo (mesma filial) e `troca` só é
-- gravada pela RPC `devolver_ao_fornecedor`, para um substituto recém-criado. Mas a régua
-- da casa é que a recusa mora no Postgres, não na tela — e um insert direto em
-- `movimentacoes` pelo PostgREST, com `tipo = 'troca'` sobre um ativo existente e
-- `filial_id` apontando a filial do gêmeo, escapava da guarda: o UPDATE batia no índice
-- `ativos_patrimonio_service_tag_uidx` e devolvia um 23505 cru, que `erros.ts` traduz para
-- "Já existe um ativo com esse patrimônio e service tag NESTA filial" — enganoso para quem
-- está movendo PARA outra filial, que é precisamente a mensagem que a 0097 existe para
-- eliminar. O dado seguia íntegro (o índice segura); o que falhava era a promessa.
--
-- A CORREÇÃO deriva o destino do MESMO `case` do UPDATE, numa variável só, e chama a guarda
-- uma vez. Assim não há como um tipo novo ganhar efeito sobre `filial_id` e ficar de fora:
-- a régua está escrita uma vez, não uma por tipo.
--
-- Corpo idêntico ao da 0097, mais `v_dest` e o bloco unificado. Nenhuma outra linha muda:
-- máquina de estados, snapshot, estorno e pendências de item ficam como estavam, e nenhuma
-- movimentação que era possível deixou de ser.

create or replace function public.aplicar_movimentacao()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ativo  public.ativos%rowtype;
  v_orig   public.movimentacoes%rowtype;
  v_novo   public.status_ativo;
  -- F24 (0099): a filial em que o ativo FICA depois desta movimentação.
  v_dest   smallint;
begin
  select * into v_ativo from public.ativos where id = new.ativo_id for update;

  new.snapshot_anterior := jsonb_build_object(
    'status',         v_ativo.status,
    'colaborador',    v_ativo.colaborador_atual,
    'setor',          v_ativo.setor_atual,
    'filial_id',      v_ativo.filial_id,
    'pendencia',      v_ativo.pendencia,
    'termo_assinado', v_ativo.termo_assinado,
    'termo_data',     v_ativo.termo_data);

  if new.tipo = 'estorno' then
    if new.estorno_de is null then
      raise exception 'Estorno exige referencia a movimentacao original (estorno_de)';
    end if;
    select * into v_orig from public.movimentacoes where id = new.estorno_de;
    if v_orig.id is null or v_orig.ativo_id <> new.ativo_id then
      raise exception 'estorno_de precisa apontar para uma movimentacao do MESMO ativo';
    end if;
    if v_orig.tipo = 'estorno' or v_orig.snapshot_anterior is null then
      raise exception 'Esta movimentacao nao pode ser estornada';
    end if;
    if exists (
      select 1 from public.movimentacoes m
      where m.ativo_id = new.ativo_id
        and (m.created_at, m.id) > (v_orig.created_at, v_orig.id)
    ) then
      raise exception 'So a ultima movimentacao efetiva do ativo pode ser estornada (use ajuste, com justificativa)';
    end if;
    -- F24: desfazer uma transferência devolve o ativo à filial de origem — e desde a
    -- migration 0091 a identidade é POR FILIAL, então a origem pode ter ganhado outro
    -- cadastro com a mesma chave nesse meio-tempo. Sem esta guarda o estorno morreria
    -- num 23505 cru, apontando um índice, sem dizer o que fazer.
    perform public.exigir_identidade_livre_na_filial(
      new.ativo_id, (v_orig.snapshot_anterior ->> 'filial_id')::smallint, 'desfazer esta movimentação');

    update public.ativos set
      status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
      colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
      setor_atual       = v_orig.snapshot_anterior ->> 'setor',
      filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
      -- F18 (§A2 "para os OUTROS trechos"): restaura o snapshot MAS nunca ressuscita
      -- o trecho 'itens faltantes…' (ele virou linha em pendencias_item). Sem isto,
      -- estornar uma movimentação cujo snapshot capturou o texto LEGADO (antes da F18
      -- o campo carregava 'itens faltantes: …' e viajava no snapshot) reescreveria o
      -- texto no campo livre, quebrando a invariante. Mesmo strip do backfill (0053):
      -- separa por ';' (a lista de itens tem vírgulas internas), tira os trechos que
      -- começam com 'itens faltantes', rejunta na ordem; vazio → null.
      pendencia         = case when v_orig.snapshot_anterior ? 'pendencia'
                               then nullif(
                                 (select string_agg(trim(x.val), '; ' order by x.ord)
                                  from unnest(string_to_array(v_orig.snapshot_anterior ->> 'pendencia', ';'))
                                       with ordinality as x(val, ord)
                                  where nullif(trim(x.val), '') is not null
                                    and lower(trim(x.val)) not like 'itens faltantes%'), '')
                               else pendencia end,
      termo_assinado    = case when v_orig.snapshot_anterior ? 'termo_assinado'
                               then (v_orig.snapshot_anterior ->> 'termo_assinado')::public.termo_status
                               else termo_assinado end,
      termo_data        = case when v_orig.snapshot_anterior ? 'termo_data'
                               then (v_orig.snapshot_anterior ->> 'termo_data')::date
                               else termo_data end,
      updated_at        = now()
    where id = new.ativo_id;
    -- F18 (1): inverso do insert do ponto (3) — remove as linhas de pendência que
    -- ESTA movimentação (a estornada) criou. No-op para tipos que não geram itens.
    delete from public.pendencias_item where movimentacao_id = v_orig.id;
    new.status_anterior   := v_ativo.status;
    new.status_resultante := (v_orig.snapshot_anterior ->> 'status')::public.status_ativo;
    return new;
  end if;

  if new.tipo = 'ajuste' then
    if new.status_resultante is null or new.observacao is null then
      raise exception 'Ajuste exige status_resultante e observacao (justificativa)';
    end if;
    v_novo := new.status_resultante;
  else
    v_novo := public.status_apos_movimentacao(v_ativo.status, new.tipo);
    if v_novo is null then
      raise exception 'Movimentacao % invalida para ativo % no estado %',
        new.tipo, v_ativo.patrimonio, v_ativo.status;
    end if;
  end if;

  new.status_anterior   := v_ativo.status;
  new.status_resultante := v_novo;

  -- F24 (0099) — a guarda de identidade cobre TODO caminho que muda a filial do ativo, e
  -- não só a transferência (era o buraco da 0097): o destino sai do MESMO `case` do UPDATE
  -- logo abaixo, então `compra` e `troca` — que gravam `new.filial_id` — entram junto. Uma
  -- régua só, escrita uma vez. Só dispara quando a filial MUDA de fato.
  v_dest := case
    when new.tipo in ('compra','troca') then new.filial_id
    when new.tipo = 'transferencia'     then coalesce(new.filial_destino_id, v_ativo.filial_id)
    else v_ativo.filial_id end;

  if v_dest is not null and v_dest <> v_ativo.filial_id then
    perform public.exigir_identidade_livre_na_filial(
      new.ativo_id, v_dest,
      case when new.tipo = 'transferencia' then 'transferir este ativo'
           else 'registrar esta movimentação' end);
  end if;

  update public.ativos set
    status            = v_novo,
    colaborador_atual = case
      when new.tipo in ('saida','emprestimo','reserva') then new.colaborador
      when new.tipo in ('devolucao','triagem_ok','descarte','envio_manutencao','devolucao_fornecedor') then null
      else colaborador_atual end,
    setor_atual       = case
      when new.tipo in ('saida','emprestimo','reserva') then new.setor
      when new.tipo in ('devolucao','triagem_ok','descarte','envio_manutencao','devolucao_fornecedor') then null
      else setor_atual end,
    filial_id         = case
      when new.tipo in ('compra','troca') then new.filial_id
      when new.tipo = 'transferencia' then coalesce(new.filial_destino_id, filial_id)
      else filial_id end,
    -- F18 (2): a coluna `pendencia = case … end` FOI REMOVIDA daqui. devolucao não
    -- grava mais 'itens faltantes: …' (vira linha em pendencias_item, abaixo) e
    -- triagem_ok não zera mais o campo (corrige o apagão de trechos alheios). Todos
    -- os demais tipos já caíam no `else pendencia` (no-op), então o efeito líquido
    -- para eles é idêntico.
    termo_assinado    = coalesce(new.termo_assinado, termo_assinado),
    termo_data        = coalesce(new.termo_data, termo_data),
    updated_at        = now()
  where id = new.ativo_id;

  -- F18 (3): devolucao com itens marcados → uma pendência ABERTA por item, atada a
  -- ESTA devolução e ao colaborador da época (o que devolvia). new.id existe (default
  -- gen_random_uuid aplicado antes do BEFORE trigger); a FK é DEFERRABLE (0050).
  if new.tipo = 'devolucao' and coalesce(cardinality(new.itens_faltantes), 0) > 0 then
    insert into public.pendencias_item (ativo_id, movimentacao_id, item, colaborador, filial_id)
    select new.ativo_id,
           new.id,
           u.item,
           coalesce(nullif(new.colaborador, ''), v_ativo.colaborador_atual),
           new.filial_id
    from unnest(new.itens_faltantes) as u(item)
    where nullif(trim(u.item), '') is not null;
  end if;

  return new;
end $function$;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a chave ficou injetiva no caso patológico (as duas identidades eram a MESMA chave):
--   select public.chave_identidade_ativo('A::B', null) as a,
--          public.chave_identidade_ativo('A', 'B::')  as b,
--          public.chave_identidade_ativo('A::B', null) <> public.chave_identidade_ativo('A', 'B::') as ok;
--   -- esperado: '4:A::B::', '1:A::B::', true
--
--   -- 2) o sentinela deixou de ser alcançável pelo ramo com patrimônio:
--   select public.chave_identidade_ativo('∅', 'X') <> public.chave_identidade_ativo(null, 'X') as ok;
--   -- esperado: true
--
--   -- 3) os grupos de conflito NÃO mudaram de tamanho por causa do formato novo:
--   select count(*) as grupos from public.v_conflitos_filiais_grupos;
--   -- esperado: o mesmo número de antes do apply (0 em produção em 30/07/2026)
--
--   -- 4) a guarda passou a ser chamada uma vez, com destino derivado (e não por tipo):
--   select (length(d) - length(replace(d,'exigir_identidade_livre_na_filial','')))/length('exigir_identidade_livre_na_filial') as guardas,
--          d like '%v_dest%' as tem_destino
--     from (select pg_get_functiondef('public.aplicar_movimentacao()'::regprocedure) as d) x;
--   -- esperado: 2 (estorno + destino unificado), true
--
--   notify pgrst, 'reload schema';

-- Migration 0097 — F24: transferir para a filial do gêmeo recusa com mensagem acionável.
--
-- Contexto: docs/prompts/F24-import-conflito-filiais-ultracode.md §5.1 ("MEÇA, não presuma").
-- Depende da 0091 (índices por filial) e da 0092 (chave_identidade_ativo).
--
-- =============================================================================
-- O EFEITO COLATERAL QUE A ORDEM MANDOU PROCURAR
-- =============================================================================
-- Com a identidade GLOBAL (até a 0091), transferir um ativo entre filiais nunca podia
-- colidir: se o par existisse em qualquer lugar, ele não teria sido cadastrado.
--
-- Com a identidade POR FILIAL, a colisão passou a ser possível — e num momento ruim: o
-- ativo A (Serra) e o gêmeo B (Linhares) coexistem em conflito; alguém tenta transferir A
-- para Linhares; o UPDATE de `ativos.filial_id` dentro de `aplicar_movimentacao` estoura
-- `ativos_patrimonio_service_tag_uidx` com um 23505 que cita o nome do índice e não diz o
-- que fazer. A tradução genérica ("Já existe um ativo com esse patrimônio e service tag
-- nesta filial") sairia enganosa aqui: quem lê está transferindo PARA outra filial, e
-- "nesta" soa como a de origem.
--
-- A recusa passa a vir de dentro do trigger, com o nome da filial e o caminho de saída.
--
-- ⚠ O MESMO buraco existe no ESTORNO, e a ordem não o listava — apareceu ao mapear o
-- caminho. Desfazer uma transferência devolve o ativo à filial de ORIGEM, que pode ter
-- ganhado outro cadastro com a mesma chave no meio-tempo. É mais raro, mas o efeito é
-- idêntico, então a guarda cobre os dois.
--
-- NÃO é uma regra nova de negócio: é a MESMA regra de sempre (não pode haver dois
-- cadastros com a mesma identidade na mesma filial), dita na hora certa e com as palavras
-- certas. Nenhuma transferência que era possível deixou de ser.

-- ---------------------------------------------------------------------------
-- A guarda — uma função, dois chamadores
-- ---------------------------------------------------------------------------
-- Recebe o ativo e a filial de DESTINO; levanta se a identidade dele já estiver ocupada lá.
-- O verbo (`p_acao`) entra na mensagem para o mesmo texto servir aos dois caminhos sem
-- mentir sobre o que a pessoa estava tentando fazer.
--
-- Usa `chave_identidade_ativo` (0092), a mesma fonte da view e da RPC de exclusão: se um dia
-- a definição de identidade mudar, muda nos três de uma vez.
--
-- SEM grant para `authenticated`: ela só é chamada de dentro de `aplicar_movimentacao`
-- (SECURITY DEFINER), onde o usuário efetivo é o dono. Precedente 0088 — função auxiliar
-- exposta em /rest/v1/rpc/ é superfície de API de graça.
create or replace function public.exigir_identidade_livre_na_filial(
  p_ativo  uuid,
  p_filial smallint,
  p_acao   text
) returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_chave  text;
  v_nome   text;
begin
  if p_filial is null then
    return;
  end if;

  select public.chave_identidade_ativo(a.patrimonio, a.service_tag)
    into v_chave
    from public.ativos a
   where a.id = p_ativo;

  -- Ativo sem identidade (sem patrimônio E sem service tag) não colide com nada: ele está
  -- fora dos dois índices de propósito, desde a F7E.
  if v_chave is null then
    return;
  end if;

  select f.nome
    into v_nome
    from public.ativos a
    join public.filiais f on f.id = a.filial_id
   where a.filial_id = p_filial
     and a.id <> p_ativo
     and public.chave_identidade_ativo(a.patrimonio, a.service_tag) = v_chave
   limit 1;

  if v_nome is not null then
    raise exception 'Já existe um ativo com este patrimônio + service tag na filial %. Resolva o conflito entre filiais (em Pendências) antes de % — os dois cadastros não podem ficar na mesma filial.',
      v_nome, p_acao
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.exigir_identidade_livre_na_filial(uuid, smallint, text) is
  'F24: a identidade deste ativo está livre na filial de destino? Levanta 42501 com mensagem acionável quando não está. Chamada por aplicar_movimentacao nos dois caminhos que mudam filial_id (transferência e estorno de transferência), para a colisão do índice por filial (0091) não chegar ao operador como um 23505 cru citando o nome do índice.';

revoke all on function public.exigir_identidade_livre_na_filial(uuid, smallint, text) from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- aplicar_movimentacao — `create or replace` com diff de DOIS trechos
-- ---------------------------------------------------------------------------
-- Corpo idêntico ao da 0051, mais as duas chamadas da guarda. Nenhuma outra linha muda:
-- a máquina de estados, o snapshot, o estorno e as pendências de item ficam como estavam.

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

  -- F24: TRANSFERIR para a filial do gêmeo agora colide no índice por filial (0091).
  -- A recusa vem daqui, com a mensagem que diz o que houve e o que fazer, em vez do
  -- 23505 cru que só citaria o nome do índice. Só roda quando há destino de fato.
  if new.tipo = 'transferencia' and new.filial_destino_id is not null
     and new.filial_destino_id <> v_ativo.filial_id then
    perform public.exigir_identidade_livre_na_filial(
      new.ativo_id, new.filial_destino_id, 'transferir este ativo');
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
--   -- 1) o trigger ganhou as duas guardas:
--   select (length(d) - length(replace(d,'exigir_identidade_livre_na_filial','')))/length('exigir_identidade_livre_na_filial') as guardas
--     from (select pg_get_functiondef('public.aplicar_movimentacao()'::regprocedure) as d) x;
--   -- esperado: 2
--
--   -- 2) a função auxiliar NÃO está exposta em /rest/v1/rpc/ (precedente 0088):
--   select has_function_privilege('authenticated','public.exigir_identidade_livre_na_filial(uuid,smallint,text)','execute') as auth_tem;
--   -- esperado: false
--
--   notify pgrst, 'reload schema';

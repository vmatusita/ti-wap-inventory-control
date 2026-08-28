-- Migration 0110 — o detentor sai junto com o ativo (F36, frente única do
-- docs/PLAN-F36-F39.md §3). Depende da 0109 (corpo vigente das funções recriadas aqui).
--
-- Tudo aqui é recriação de função por `create or replace` PURO (assinatura idêntica →
-- sem overload; `pg_proc` segue com 1 linha por função) mais UMA função nova de
-- vocabulário. NÃO toca dado: nenhum update/delete de ativo ou de movimentação, e
-- nenhum ativo muda de estado por esta migration. O que muda é o comportamento das
-- movimentações FUTURAS. O passado é assunto da 0111, separada de propósito.
-- Caminho A do docs/RUNBOOK-BANCO.md.
--
-- ⚠ BASE DE CADA `create or replace`: o corpo VIGENTE lido do BANCO por
-- `pg_get_functiondef` em 28/08/2026 — NÃO a migration mais antiga que criou a função
-- (a lição escrita na própria 0047 e repetida na 0109: recriar por cima de corpo velho
-- é regressão silenciosa). Fingerprints md5 do functiondef ANTERIOR (produção,
-- `pbtjcalbmepmrqzprusb`, 28/08/2026):
--   aplicar_movimentacao       53dbb8c0c189e20b83411c86976bfc28  (base: 0109)
--   rel_estoque_asof           b98dbb8b3022b8e43cfd395b53c9ada1  (base: 0109)
--   dev_checagens_integridade  021e363b953d3034db0cd18937a1a59b  (base: 0098)
--   forcar_estado_ativo        27b64765a043f9d32fd3846ed5fac4ea  (base: 0084)
-- Guardados na ata de `docs/DECISOES.md` como backup lógico (rollback = `create or
-- replace` de volta a esses corpos; a função nova é inócua se ninguém a chamar).
--
-- ⚠ `status_apos_movimentacao` NÃO é tocada aqui. Nenhuma transição nasce, morre ou
-- muda de destino — a F36 mexe no que a movimentação GRAVA, nunca no que ela PERMITE.
-- `src/lib/validators/transicoes-sql.test.ts` continua lendo a 0109, e é isso mesmo.

-- ============================================================================
-- 1) O vocabulário: quais estados têm dono
-- ============================================================================
-- A regra da F36 (decisão D1 do Johnny, 28/08/2026): colaborador e setor só sobrevivem
-- nos três estados em que ALGUÉM ESTÁ COM O EQUIPAMENTO. Em todo o resto o ativo está
-- com a TI (ou não existe mais), e carregar um nome ali é dado errado — foi assim que
-- um `ajuste` para `em_estoque` deixava o notebook "em estoque com o Fulano".
--
-- Antes desta função a regra era uma LISTA DE TIPOS repetida em quatro lugares
-- (aplicar_movimentacao ×2, rel_estoque_asof ×2, forcar_estado_ativo ×3), e cada
-- cópia envelheceu de um jeito: a 0109 tinha seis tipos numa e cinco na outra, e a
-- 0084 tinha uma lista de ESTADOS que esquecia o `defasado`. Agora é UMA pergunta,
-- feita ao ESTADO RESULTANTE — o que fecha de uma vez `ajuste`, `retorno_manutencao`,
-- `marcar_defasado`, `troca` e `compra`, que nenhuma lista de tipos cobria.
--
-- IMMUTABLE de propósito: é vocabulário puro, não lê tabela nenhuma. Espelhada em
-- `STATUS_COM_DETENTOR` (src/lib/dominio.ts), com teste que lê ESTA migration
-- (src/lib/validators/detentor-sql.test.ts), no molde de transicoes-sql.test.ts.
-- Mantenha a lista numa linha só: é o formato que aquele teste sabe ler.
create or replace function public.status_tem_detentor(p public.status_ativo)
returns boolean
language sql immutable set search_path = public as $$
  select p in ('em_uso', 'emprestado', 'reservado');
$$;

comment on function public.status_tem_detentor(public.status_ativo) is
  'F36 — verdadeiro nos estados em que alguem esta com o equipamento (em_uso, emprestado, reservado). Fonte unica do zeramento de colaborador/setor em aplicar_movimentacao, rel_estoque_asof e forcar_estado_ativo.';

revoke all on function public.status_tem_detentor(public.status_ativo) from public, anon;
grant execute on function public.status_tem_detentor(public.status_ativo) to authenticated, service_role;

-- ============================================================================
-- 2) aplicar_movimentacao: o zeramento passa a perguntar ao ESTADO, não ao TIPO
-- ============================================================================
-- Base: corpo VIGENTE (0109). DIFF vs 0109 = EXATAMENTE duas linhas novas, uma em cada
-- `case` (colaborador_atual e setor_atual), e a REMOÇÃO da linha de seis tipos que elas
-- absorvem. NADA MAIS muda: snapshot, estorno, guarda de identidade por filial
-- (0099), fixação de filial de compra/troca, pendências de item e a validação do
-- `ajuste` ficam byte a byte.
--
-- A ORDEM DOS RAMOS É A REGRA. O ramo novo vem PRIMEIRO e absorve inteira a lista de
-- seis de hoje — `devolucao`→em_estoque, `envio_triagem`→em_triagem,
-- `triagem_ok`→em_estoque, `descarte`→descartado, `envio_manutencao`→em_manutencao,
-- `devolucao_fornecedor`→devolvido_fornecedor, todos estados sem dono — e ainda fecha
-- os cinco furos que nenhuma lista de tipos cobria:
--   · `ajuste`             a válvula de escape gravava status_resultante SEM limpar nada;
--   · `retorno_manutencao` voltava ao estoque carregando o que estivesse lá;
--   · `marcar_defasado`    estado sem dono que aceitava dono;
--   · `troca`              idem;
--   · `compra`             inócuo hoje (o ativo nasce limpo), mas a regra não deveria
--                          depender disso.
-- `transferencia` MANTÉM o status, então um ativo `em_uso` transferido continua com o
-- dono — como deve. `saida`/`emprestimo`/`reserva` resultam nos três estados COM dono,
-- então caem no segundo ramo e seguem gravando o payload (é o que faz a RE-RESERVA da
-- F34 trocar o detentor).
--
-- ⚠ O ramo do `estorno` fica byte a byte (decisão D2): ele retorna ANTES de chegar a
-- este `update` e continua restaurando o `snapshot_anterior` inteiro. Estornar uma
-- devolução devolve o colaborador ao ativo — é o que faz "desfazer" desfazer.
-- Espelhado em `rel_estoque_asof` logo abaixo, senão o estado AO VIVO e o AS-OF
-- discordariam. Qualquer outra diferença é BUG. Assinatura idêntica.
create or replace function public.aplicar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    perform public.exigir_identidade_livre_na_filial(
      new.ativo_id, (v_orig.snapshot_anterior ->> 'filial_id')::smallint, 'desfazer esta movimentação');

    update public.ativos set
      status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
      colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
      setor_atual       = v_orig.snapshot_anterior ->> 'setor',
      filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
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
  -- logo abaixo, então `compra` e `troca` — que gravam `new.filial_id` — entram junto.
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
      when not public.status_tem_detentor(v_novo) then null
      when new.tipo in ('saida','emprestimo','reserva') then new.colaborador
      else colaborador_atual end,
    setor_atual       = case
      when not public.status_tem_detentor(v_novo) then null
      when new.tipo in ('saida','emprestimo','reserva') then new.setor
      else setor_atual end,
    filial_id         = case
      when new.tipo in ('compra','troca') then new.filial_id
      when new.tipo = 'transferencia' then coalesce(new.filial_destino_id, filial_id)
      else filial_id end,
    termo_assinado    = coalesce(new.termo_assinado, termo_assinado),
    termo_data        = coalesce(new.termo_data, termo_data),
    updated_at        = now()
  where id = new.ativo_id;

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
end $$;

-- ============================================================================
-- 3) rel_estoque_asof: o espelho AS-OF do zeramento acima
-- ============================================================================
-- Base: corpo VIGENTE (0109). DIFF vs 0109 = SÓ a troca das duas listas de tipos pela
-- pergunta ao estado, mais o ramo `u.tipo is null` promovido para PRIMEIRO (ele já
-- existia; subiu porque agora precisa decidir antes de `status_tem_detentor` receber o
-- coalesce). Nenhuma fórmula de CONTAGEM muda: a lista de status filtrados no `where`,
-- o desempate por `ajuste` (0054), a existência as-of (0022) e a filial as-of ficam
-- byte a byte.
--
-- Efeito colateral BOM: some a assimetria que obrigava quem lê as duas funções a
-- lembrar por que uma tinha seis tipos e a outra cinco (`devolucao_fornecedor` ficava
-- de fora aqui porque `devolvido_fornecedor` é filtrado no `where` final e a linha
-- nunca chegava a ser lida). Agora é a mesma pergunta nos dois lados.
--
-- ⚠ ISTO É RETROATIVO, e de propósito: relatórios as-of de datas passadas passam a
-- mostrar SEM detentor os ativos cujo último evento foi um `ajuste` para estado sem
-- dono carregando colaborador. Contado antes de aplicar: 21 movimentações em produção
-- (todas `ajuste` → `em_estoque`, de 27/07/2026 a 27/08/2026) e 4 ativos na leitura de
-- hoje. Contagem e método na ata de `docs/DECISOES.md` (2026-08-28).
-- Qualquer outra diferença é BUG. Assinatura idêntica (create or replace puro).
create or replace function public.rel_estoque_asof(p_filial smallint, p_data date)
returns table (
  ativo_id uuid,
  categoria public.categoria_ativo,
  marca text,
  modelo text,
  filial_id smallint,
  status public.status_ativo,
  colaborador text,
  setor text
)
language sql stable set search_path = public as $$
  with efetivas as (
    select m.*
    from public.movimentacoes m
    where m.data <= p_data
      and m.tipo <> 'estorno'
      and not exists (
        select 1 from public.movimentacoes e
        where e.estorno_de = m.id and e.data <= p_data
      )
  ),
  ult as (
    select distinct on (e.ativo_id) e.*
    from efetivas e
    order by e.ativo_id, e.data desc, e.created_at desc,
             (e.tipo = 'ajuste') desc,
             e.id desc
  ),
  estado as (
    select
      a.id  as ativo_id,
      a.categoria,
      a.marca,
      a.modelo,
      (u.ativo_id is not null) as existe,
      coalesce(
        case
          when u.tipo = 'transferencia' then u.filial_destino_id
          when u.tipo in ('compra','troca') then u.filial_id
          when u.snapshot_anterior ? 'filial_id'
            then nullif(u.snapshot_anterior ->> 'filial_id', '')::smallint
          else a.filial_id
        end,
        a.filial_id
      ) as filial_id,
      coalesce(u.status_resultante, 'em_estoque') as status,
      case
        when u.tipo is null then null
        when not public.status_tem_detentor(coalesce(u.status_resultante, 'em_estoque')) then null
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.colaborador
        else u.snapshot_anterior ->> 'colaborador'
      end as colaborador,
      case
        when u.tipo is null then null
        when not public.status_tem_detentor(coalesce(u.status_resultante, 'em_estoque')) then null
        when u.tipo in ('saida', 'emprestimo', 'reserva') then u.setor
        else u.snapshot_anterior ->> 'setor'
      end as setor
    from public.ativos a
    left join ult u on u.ativo_id = a.id
  )
  select ativo_id, categoria, marca, modelo, filial_id, status, colaborador, setor
  from estado
  where existe
    and status not in ('descartado', 'devolvido_fornecedor')
    and (p_filial is null or filial_id = p_filial);
$$;

-- ============================================================================
-- 4) forcar_estado_ativo: a Zona destrutiva usa o MESMO vocabulário
-- ============================================================================
-- Base: corpo VIGENTE (0084). DIFF vs 0084 = SÓ a troca do array constante
-- `v_sem_detentor` (cinco estados escritos à mão) pela chamada a
-- `status_tem_detentor`, nas TRÊS ocorrências (o `if` do zeramento e os dois
-- `detentor_zerado` reportados). Nada mais muda: a guarda `exigir_dev_para_destruir`,
-- a janela `estoque.dev_destrutivo`, a marca `forcado`, a trilha em `eventos_admin` e
-- o retorno jsonb ficam byte a byte.
--
-- POR QUE ISTO ENTRA NA F36 (e não é escopo emprestado): a 0084 escreveu a lista de
-- estados sem dono à mão — `em_estoque, em_triagem, em_manutencao, descartado,
-- devolvido_fornecedor` — e deixou o `defasado` de FORA de propósito, com o comentário
-- "ali o detentor é informação legítima". A decisão D1 revoga exatamente essa
-- premissa: `defasado` passa a ser estado SEM dono. Deixar a 0084 como está criaria um
-- caminho de escrita OFICIAL capaz de gravar detentor em estado sem dono — isto é,
-- faria a décima checagem de integridade (abaixo) subir por operação normal, que é o
-- oposto do que ela existe para dizer. Registrado em `docs/DECISOES.md` (2026-08-28).
--
-- Nota: desde esta migration o `update` explícito abaixo é REDUNDANTE — o trigger
-- `aplicar_movimentacao` já zera o detentor ao gravar o `ajuste` logo acima. Ele fica
-- como segunda linha (o mesmo princípio de defesa em profundidade do resto do
-- repositório) e porque `detentor_zerado` precisa ser reportado com honestidade na
-- trilha. `current_date` na linha do insert fica como está: é o item W da
-- `docs/DIVIDA-TECNICA.md`, aberto, e trocá-lo aqui seria mudança fora do diff.
create or replace function public.forcar_estado_ativo(
  p_ativo uuid,
  p_status public.status_ativo,
  p_justificativa text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_a      public.ativos%rowtype;
  v_uid    uuid := (select auth.uid());
  v_mov_id uuid;
  v_antes  public.status_ativo;
  v_rotulo text;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_a from public.ativos where id = p_ativo for update;
  if v_a.id is null then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002';
  end if;

  v_antes  := v_a.status;
  v_rotulo := coalesce(nullif(btrim(v_a.patrimonio), ''), nullif(btrim(v_a.service_tag), ''), v_a.id::text);

  -- Já está lá: não é erro, e registrar uma correção que não corrige nada só sujaria a linha
  -- do tempo. Mesmo idioma de definir_papel_usuario (0074), que retorna quando nada muda.
  if v_antes = p_status then
    return jsonb_build_object(
      'alterado', false, 'ativo_id', p_ativo, 'rotulo', v_rotulo, 'status', v_antes);
  end if;

  -- ---------- a janela abre ----------
  -- Necessária por causa da MARCA: a guarda da 0081 recusa INSERT com forcado = true fora
  -- do caminho oficial. (Os dois triggers são BEFORE INSERT FOR EACH ROW e disparam em ordem
  -- alfabética: movimentacoes_guarda_acervo antes de trg_aplicar_movimentacao — a guarda
  -- decide primeiro, que é a ordem desejada.)
  perform set_config('estoque.dev_destrutivo', 'on', true);

  insert into public.movimentacoes (
    ativo_id, tipo, motivo, data, filial_id,
    status_resultante, observacao, criado_por, forcado
  ) values (
    p_ativo, 'ajuste', null, current_date, v_a.filial_id,
    p_status, btrim(p_justificativa), v_uid, true
  )
  returning id into v_mov_id;

  -- Espelha o zeramento de detentor do trigger (F36/0110): a pergunta é ao ESTADO, não
  -- mais a uma lista de estados escrita à mão que esquecia o `defasado`.
  if not public.status_tem_detentor(p_status) then
    update public.ativos
       set colaborador_atual = null,
           setor_atual       = null,
           updated_at        = now()
     where id = p_ativo;
  end if;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'estado_forcado', v_rotulo,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'ativo_id',        p_ativo,
            'movimentacao_id', v_mov_id,
            'de',              v_antes,
            'para',            p_status,
            'detentor_zerado', (not public.status_tem_detentor(p_status))));

  return jsonb_build_object(
    'alterado',        true,
    'ativo_id',        p_ativo,
    'rotulo',          v_rotulo,
    'movimentacao_id', v_mov_id,
    'de',              v_antes,
    'para',            p_status,
    'detentor_zerado', (not public.status_tem_detentor(p_status)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

-- ============================================================================
-- 5) dev_checagens_integridade: a décima checagem, a trava que impede a volta
-- ============================================================================
-- Base: corpo VIGENTE (0098). DIFF vs 0098 = SÓ o acréscimo do décimo `return query`
-- ao FIM. As nove anteriores ficam byte a byte, e a assinatura
-- `(chave text, total bigint, amostra text[])` não muda.
--
-- `detentor_em_estado_sem_dono` é ZERO em operação normal, sempre — depois da 0111 o
-- passado está limpo, e a partir da 0110 todo caminho oficial de escrita (trigger,
-- import, Zona destrutiva) respeita a regra. Se ela subir, alguém abriu um caminho novo
-- que não passa pelo trigger, e o /dev conta ANTES de o relatório mentir.
--
-- DOIS caminhos conhecidos podem legitimamente fazê-la subir, e os dois são por
-- desenho: o `estorno` (decisão D2) e o "Apagar movimentação" da Zona destrutiva
-- (`apagar_movimentacao`, 0083) restauram o `snapshot_anterior` INTEIRO — e um retrato
-- tirado antes da 0111 pode carregar detentor num estado sem dono. É o preço de
-- "desfazer desfaz de verdade"; a checagem existe justamente para isso aparecer.
--
-- ⚠ A migration sozinha não basta: o catálogo curado das checagens vive em `CHECAGENS`
-- (src/lib/queries/dev.ts) e a décima entrada entra no MESMO commit. Sem ela a rede
-- permanente de `juntarCatalogoComResultados` mostra a chave crua no lugar do nome.
create or replace function public.dev_checagens_integridade()
returns table (chave text, total bigint, amostra text[])
language plpgsql stable security definer set search_path = public as $$
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
end;
$$;

comment on function public.dev_checagens_integridade() is
  'F22/F24/F36 — as DEZ checagens de integridade so-leitura da /dev. SQL FIXO por dentro; proibido receber SQL como parametro.';

-- `create or replace` NÃO reseta grants: o `revoke ... from service_role` da 0087 continua
-- valendo. As duas linhas abaixo são as mesmas da 0095, reescritas por explicitude.
revoke all on function public.dev_checagens_integridade() from public, anon;
grant execute on function public.dev_checagens_integridade() to authenticated;

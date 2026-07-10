-- =============================================================
-- HISTÓRICO — substituído pelas migrations em supabase/migrations a partir da F1.
-- A verdade do banco agora são as migrations (0001..0007). Este arquivo é mantido
-- apenas como referência do rascunho original; NÃO aplicar e NÃO editar para mudar
-- o banco — toda alteração vira uma nova migration.
-- =============================================================
--
-- Sistema de Controle de Estoque TI — WAP
-- Rascunho do schema (Postgres / Supabase) — v1.0 · 09/07/2026
--
-- STATUS: rascunho para revisão. Na F1 isto vira migrations
-- versionadas (supabase/migrations/*) — não aplicar na mão.
-- Requer Postgres >= 15 (security_invoker) e Supabase (roles
-- anon/authenticated e schema auth existentes).
-- Vocabulários (enums/seeds) vieram da análise das planilhas
-- reais de jan–jul/2026. Ver docs/ESPECIFICACAO.md, seções 4 e 5.
-- =============================================================

-- ---------- TIPOS ----------

create type public.categoria_ativo as enum (
  'notebook', 'desktop', 'monitor', 'celular', 'tablet', 'outro'
);

create type public.status_ativo as enum (
  'em_estoque',     -- disponível p/ entrega (hoje: Estoque/Guardada)
  'reservado',      -- separado p/ chamado   (hoje: Reservada)
  'em_uso',         -- com colaborador/setor (hoje: Remanejo/Saída)
  'emprestado',     -- saída temporária
  'em_triagem',     -- devolvido, aguardando conferência (hoje: Validar/Devolvido)
  'em_manutencao',  -- em conserto/assistência
  'defasado',       -- reserva técnica (hoje: RT Wap/Posse Wap/Defasada)
  'descartado'      -- baixa definitiva (final)
);

create type public.tipo_movimentacao as enum (
  'compra', 'saida', 'emprestimo', 'reserva', 'devolucao',
  'triagem_ok', 'envio_manutencao', 'retorno_manutencao',
  'marcar_defasado', 'descarte', 'transferencia', 'ajuste', 'estorno'
);

create type public.termo_status as enum ('sim', 'nao', 'enviado');
-- (não existe enum de papel: todo usuário logado é OPERADOR — nível único, spec §3)

-- ---------- TABELAS ----------

create table public.filiais (
  id         smallint generated always as identity primary key,
  slug       text not null unique,          -- 'matriz', 'linhares'…
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Espelho de auth.users. Criado por trigger no signup/convite.
-- Nível único: todo logado é OPERADOR. Visualizador de relatório NÃO tem
-- conta — entra por senha de acesso (tabela senhas_acesso).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  created_at timestamptz not null default now()
);

-- Senhas de visualização dos relatórios (geridas pelo operador em admin/senhas).
-- Hash scrypt; validação SEMPRE no servidor (service role) — anon nunca lê.
create table public.senhas_acesso (
  id         uuid primary key default gen_random_uuid(),
  rotulo     text not null,               -- 'Filial Linhares', 'Stefanini'…
  hash       text not null,
  ativa      boolean not null default true,
  criado_por uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  ultimo_uso timestamptz
);

-- Motivos como tabela (não enum): o admin ajusta o vocabulário pela UI.
create table public.motivos (
  codigo    text primary key,               -- 'novo_colaborador'…
  rotulo    text not null,                  -- 'Novo colaborador'
  aplica_a  public.tipo_movimentacao[] not null,
  ativo     boolean not null default true
);

create table public.ativos (
  id                  uuid primary key default gen_random_uuid(),
  patrimonio          text not null,             -- canônico: WAP0004491 (repete em casos raros — ver índice único abaixo)
  patrimonio_original text,                      -- como veio da planilha
  categoria           public.categoria_ativo not null,
  marca               text,
  modelo              text,
  service_tag         text,
  hostname            text,
  memoria             text,
  armazenamento       text,
  processador         text,
  fornecedor          text,                      -- WAP, Proprinter…
  filial_id           smallint not null references public.filiais (id),
  -- Campos DERIVADOS da última movimentação (atualizados por trigger;
  -- nunca editados direto pela aplicação):
  status              public.status_ativo not null default 'em_estoque',
  colaborador_atual   text,
  setor_atual         text,
  -- Metadados
  termo_assinado      public.termo_status,
  termo_data          date,
  pendencia           text,                      -- ex.: 'sem patrimônio físico'
  origem              text not null default 'cadastro', -- 'cadastro' | 'importacao' | 'inferido'
  observacoes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Regra 1 da especificação: o patrimônio identifica o ativo no dia a dia,
-- mas REPETE em casos raros — quem é único é o par (patrimônio + service tag).
-- Sem service tag, o patrimônio não pode repetir (o coalesce '' colide de propósito).
create unique index ativos_patrimonio_service_tag_uidx
  on public.ativos (patrimonio, (coalesce(service_tag, '')));
create index ativos_patrimonio_idx    on public.ativos (patrimonio);
create index ativos_filial_status_idx on public.ativos (filial_id, status);
create index ativos_categoria_idx     on public.ativos (categoria);
create index ativos_colaborador_idx   on public.ativos (colaborador_atual);

-- Fonte da verdade. Imutável: correção = estorno + novo lançamento.
create table public.movimentacoes (
  id                 uuid primary key default gen_random_uuid(),
  ativo_id           uuid not null references public.ativos (id),
  tipo               public.tipo_movimentacao not null,
  motivo             text references public.motivos (codigo),
  data               date not null default current_date,
  filial_id          smallint not null references public.filiais (id),
  filial_destino_id  smallint references public.filiais (id),  -- só transferencia
  colaborador        text,
  setor              text,
  chamado            text,                    -- nº no sistema de chamados
  termo_assinado     public.termo_status,
  termo_data         date,
  itens_faltantes    text[],                  -- ['carregador','mochila']
  observacao         text,
  estorno_de         uuid references public.movimentacoes (id), -- só tipo estorno
  -- Snapshots p/ auditoria, leitura do histórico e estorno completo:
  status_anterior    public.status_ativo,
  status_resultante  public.status_ativo,
  snapshot_anterior  jsonb,  -- {status,colaborador,setor,filial_id} antes desta mov.
  criado_por         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now()
);

create index mov_ativo_idx        on public.movimentacoes (ativo_id, data desc);
create index mov_filial_data_idx  on public.movimentacoes (filial_id, data desc);
create index mov_created_idx      on public.movimentacoes (created_at desc);

-- ---------- MÁQUINA DE ESTADOS ----------

-- Transições válidas (estado_atual → tipo permitido).
-- Regra de negócio nº 2 da especificação.
create or replace function public.status_apos_movimentacao(
  p_status public.status_ativo,
  p_tipo   public.tipo_movimentacao
) returns public.status_ativo
language plpgsql immutable as $$
begin
  return case
    when p_tipo = 'compra'             and p_status in ('em_estoque')                 then 'em_estoque'
    when p_tipo = 'saida'              and p_status in ('em_estoque','reservado','em_triagem') then 'em_uso'
    when p_tipo = 'emprestimo'         and p_status in ('em_estoque','reservado')     then 'emprestado'
    when p_tipo = 'reserva'            and p_status in ('em_estoque')                 then 'reservado'
    when p_tipo = 'devolucao'          and p_status in ('em_uso','emprestado')        then 'em_triagem'
    when p_tipo = 'triagem_ok'         and p_status in ('em_triagem')                 then 'em_estoque'
    when p_tipo = 'envio_manutencao'   and p_status in ('em_estoque','em_triagem','em_uso','defasado') then 'em_manutencao'
    when p_tipo = 'retorno_manutencao' and p_status in ('em_manutencao')              then 'em_estoque'
    when p_tipo = 'marcar_defasado'    and p_status in ('em_estoque','em_triagem','em_manutencao') then 'defasado'
    when p_tipo = 'descarte'           and p_status in ('em_estoque','em_triagem','em_manutencao','defasado') then 'descartado'
    when p_tipo = 'transferencia'      and p_status not in ('descartado')             then p_status
    when p_tipo in ('ajuste','estorno')                                               then null -- tratados no trigger
    else null
  end;
end $$;

-- Aplica a movimentação ao ativo (deriva o estado). SECURITY DEFINER
-- para poder atualizar `ativos` mesmo com RLS restrita à aplicação.
create or replace function public.aplicar_movimentacao()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ativo  public.ativos%rowtype;
  v_orig   public.movimentacoes%rowtype;
  v_novo   public.status_ativo;
begin
  select * into v_ativo from public.ativos where id = new.ativo_id for update;

  -- Snapshot do estado ANTES desta movimentação (auditoria + estorno completo)
  new.snapshot_anterior := jsonb_build_object(
    'status',      v_ativo.status,
    'colaborador', v_ativo.colaborador_atual,
    'setor',       v_ativo.setor_atual,
    'filial_id',   v_ativo.filial_id);

  -- ESTORNO: restaura o estado completo anterior à movimentação original.
  -- Regra 6 da especificação: só a última movimentação efetiva do ativo.
  if new.tipo = 'estorno' then
    if new.estorno_de is null then
      raise exception 'Estorno exige referência à movimentação original (estorno_de)';
    end if;
    select * into v_orig from public.movimentacoes where id = new.estorno_de;
    if v_orig.id is null or v_orig.ativo_id <> new.ativo_id then
      raise exception 'estorno_de precisa apontar para uma movimentação do MESMO ativo';
    end if;
    if v_orig.tipo = 'estorno' or v_orig.snapshot_anterior is null then
      raise exception 'Esta movimentação não pode ser estornada';
    end if;
    -- Corrigido na F1 (migration 0004): checagem REAL da última movimentação
    -- (não existe mov. posterior do ativo). O proxy antigo por status_resultante
    -- era burlável quando duas movs seguidas terminavam no mesmo status.
    if exists (
      select 1 from public.movimentacoes m
      where m.ativo_id = new.ativo_id
        and (m.created_at, m.id) > (v_orig.created_at, v_orig.id)
    ) then
      raise exception 'Só a última movimentação efetiva do ativo pode ser estornada (use ajuste, com justificativa)';
    end if;
    update public.ativos set
      status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
      colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
      setor_atual       = v_orig.snapshot_anterior ->> 'setor',
      filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
      updated_at        = now()
    where id = new.ativo_id;
    new.status_anterior   := v_ativo.status;
    new.status_resultante := (v_orig.snapshot_anterior ->> 'status')::public.status_ativo;
    return new;
  end if;

  if new.tipo = 'ajuste' then
    -- Ajuste manual: status_resultante vem preenchido + observação obrigatória
    if new.status_resultante is null or new.observacao is null then
      raise exception 'Ajuste exige status_resultante e observacao (justificativa)';
    end if;
    v_novo := new.status_resultante;
  else
    v_novo := public.status_apos_movimentacao(v_ativo.status, new.tipo);
    if v_novo is null then
      raise exception 'Movimentação % inválida para ativo % no estado %',
        new.tipo, v_ativo.patrimonio, v_ativo.status;
    end if;
  end if;

  new.status_anterior   := v_ativo.status;
  new.status_resultante := v_novo;

  update public.ativos set
    status            = v_novo,
    colaborador_atual = case
      when new.tipo in ('saida','emprestimo','reserva') then new.colaborador
      when new.tipo in ('devolucao','triagem_ok','descarte','envio_manutencao') then null
      else colaborador_atual end,
    setor_atual       = case
      when new.tipo in ('saida','emprestimo','reserva') then new.setor
      when new.tipo in ('devolucao','triagem_ok','descarte','envio_manutencao') then null
      else setor_atual end,
    filial_id         = case
      when new.tipo = 'compra'        then new.filial_id                        -- regra 8: fixa a filial que recebeu
      when new.tipo = 'transferencia' then coalesce(new.filial_destino_id, filial_id)
      else filial_id end,
    -- Regra 3: itens faltantes na devolução viram pendência; triagem_ok limpa
    pendencia         = case
      when new.tipo = 'devolucao'
           and coalesce(cardinality(new.itens_faltantes), 0) > 0
        then 'itens faltantes: ' || array_to_string(new.itens_faltantes, ', ')
      when new.tipo = 'triagem_ok' then null
      else pendencia end,
    termo_assinado    = coalesce(new.termo_assinado, termo_assinado),
    termo_data        = coalesce(new.termo_data, termo_data),
    updated_at        = now()
  where id = new.ativo_id;

  return new;
end $$;

create trigger trg_aplicar_movimentacao
  before insert on public.movimentacoes
  for each row execute function public.aplicar_movimentacao();

-- Cria o profile quando o convite é aceito.
-- Defesa no banco: login é restrito a contas WAP (spec §3) — a aplicação
-- valida no convite, e o trigger garante mesmo se alguém contornar a UI.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or new.email not ilike '%@wap.ind.br' then
    raise exception 'Login restrito a contas @wap.ind.br';
  end if;
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email));
  return new;
end $$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RLS ----------
-- Modelo (decisão 09/07/2026): logado (@wap.ind.br) = OPERADOR, nível único —
-- lê e escreve tudo. `anon`: nada. O visualizador de relatório não tem
-- credencial de banco: entra por senha (camada da aplicação — cookie assinado;
-- as queries de relatório dele rodam no servidor). Mov.: imutável.

alter table public.filiais       enable row level security;
alter table public.profiles      enable row level security;
alter table public.motivos       enable row level security;
alter table public.ativos        enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.senhas_acesso enable row level security;

-- Leitura: qualquer operador logado
create policy "leitura operador" on public.filiais       for select to authenticated using (true);
create policy "leitura operador" on public.motivos       for select to authenticated using (true);
create policy "leitura operador" on public.ativos        for select to authenticated using (true);
create policy "leitura operador" on public.movimentacoes for select to authenticated using (true);
create policy "leitura operador" on public.profiles      for select to authenticated using (true);
create policy "leitura operador" on public.senhas_acesso for select to authenticated using (true);

-- Escrita: qualquer operador logado (nível único)
create policy "operador escreve" on public.filiais for all to authenticated
  using (true) with check (true);
create policy "operador escreve" on public.motivos for all to authenticated
  using (true) with check (true);
create policy "operador escreve" on public.ativos for all to authenticated
  using (true) with check (true);
create policy "operador gerencia senhas" on public.senhas_acesso for all to authenticated
  using (true) with check (true);
create policy "perfil próprio" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Movimentações: operador INSERE; ninguém edita/apaga (imutáveis — sem policy de update/delete)
create policy "operador insere" on public.movimentacoes for insert to authenticated
  with check (true);

-- ---------- RELATÓRIOS GERADOS (snapshot semanal — spec §7.1, entregue na F3) ----------

create table public.relatorios_gerados (
  id          uuid primary key default gen_random_uuid(),
  periodo_de  date not null,
  periodo_ate date not null,
  filial_id   smallint references public.filiais (id),  -- null = consolidado (geral)
  versao      smallint not null default 1,
  dados       jsonb not null,      -- snapshot congelado (KPIs, séries, listas, resumo)
  gerado_por  uuid not null references public.profiles (id),
  gerado_em   timestamptz not null default now(),
  unique (periodo_de, periodo_ate, filial_id, versao)
);

create index rel_gerados_periodo_idx on public.relatorios_gerados (periodo_de desc, filial_id);

alter table public.relatorios_gerados enable row level security;
create policy "leitura operador" on public.relatorios_gerados for select to authenticated using (true);
create policy "operador gera"    on public.relatorios_gerados for insert to authenticated with check (true);
-- Imutável: sem policy de update/delete — regerar o período cria versão nova.

-- ---------- VIEWS DE RELATÓRIO ----------

create or replace view public.v_estoque_atual
with (security_invoker = true) as
select f.slug as filial, a.categoria, a.status, count(*) as total
from public.ativos a
join public.filiais f on f.id = a.filial_id
group by f.slug, a.categoria, a.status;

-- Transferência conta no relatório das DUAS filiais (origem e destino) — regra 5.
create or replace view public.v_movimentacoes_mes
with (security_invoker = true) as
select f.slug as filial,
       date_trunc('month', m.data)::date as mes,
       m.tipo,
       count(*) as total
from (
  select data, tipo, filial_id from public.movimentacoes
  union all
  select data, tipo, filial_destino_id
  from public.movimentacoes
  where tipo = 'transferencia' and filial_destino_id is not null
) m
join public.filiais f on f.id = m.filial_id
group by 1, 2, 3;

create or replace view public.v_pendencias
with (security_invoker = true) as
select a.id, a.patrimonio, a.categoria, f.slug as filial, a.status,
       case
         when a.status = 'em_triagem'
              and a.updated_at < now() - interval '7 days' then 'triagem parada'
         -- termo nunca informado (null) também é pendência — spec §5
         when (a.termo_assinado in ('nao','enviado') or a.termo_assinado is null)
              and a.status in ('em_uso','emprestado')       then 'termo pendente'
         when a.pendencia is not null                        then a.pendencia
       end as pendencia
from public.ativos a
join public.filiais f on f.id = a.filial_id
where (a.status = 'em_triagem' and a.updated_at < now() - interval '7 days')
   or ((a.termo_assinado in ('nao','enviado') or a.termo_assinado is null)
       and a.status in ('em_uso','emprestado'))
   or a.pendencia is not null;

-- ---------- SEEDS ----------

insert into public.filiais (slug, nome) values
  ('matriz',         'Matriz'),
  ('cd-afonso-pena', 'CD Afonso Pena'),
  ('linhares',       'Linhares'),
  ('serra-park',     'Serra Park'),   -- confirmar: Johnny citou "CE Serra" (pergunta 1 da spec)
  ('eusebio',        'Eusébio');      -- confirmar se entra como filial própria

-- Obs.: "Empréstimo" e "Transferência" das planilhas são TIPOS de
-- movimentação, não motivos (spec §5). Motivo é opcional para esses tipos.
insert into public.motivos (codigo, rotulo, aplica_a) values
  -- saída / reserva / empréstimo
  ('novo_colaborador',  'Novo colaborador',            '{saida,reserva,emprestimo}'),
  ('troca_upgrade',     'Troca / upgrade',             '{saida,devolucao}'),
  ('monitor_adicional', 'Monitor adicional',           '{saida}'),
  ('uso_compartilhado', 'Uso compartilhado / interno', '{saida,emprestimo}'),
  ('troca_titular',     'Troca de titular',            '{saida}'),
  ('reposicao',         'Reposição',                   '{saida,devolucao}'),
  ('assistencia',       'Assistência técnica',         '{saida,devolucao,envio_manutencao}'),
  -- devolução
  ('desligamento',      'Desligamento',                '{devolucao}'),
  ('afastamento',       'Afastamento',                 '{devolucao}'),
  ('fim_emprestimo',    'Fim de empréstimo',           '{devolucao}'),
  ('manutencao',        'Manutenção',                  '{devolucao,envio_manutencao}'),
  ('garantia',          'Garantia',                    '{devolucao}'),
  -- geral (vale para qualquer tipo de movimentação)
  ('outro',             'Outro (ver observação)',
   '{compra,saida,emprestimo,reserva,devolucao,triagem_ok,envio_manutencao,retorno_manutencao,marcar_defasado,descarte,transferencia,ajuste,estorno}');

-- =============================================================
-- Pendente (fase F1, junto das migrations):
--   * (carga inicial é via scripts TS de go-live — sem tabelas de staging no banco)
--   * publicação realtime: alter publication supabase_realtime add table movimentacoes;
--   * view v_kpis_filial p/ os cards do relatório
-- =============================================================

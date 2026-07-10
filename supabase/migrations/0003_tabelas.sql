-- Migration 0003 — tabelas de dominio + indices.
-- Origem: supabase/schema.sql. `profiles` NAO entra aqui (ja criada na 0001).
-- `relatorios_gerados` fica para a F3 (snapshot semanal, spec 7.1) — fora do
-- escopo da OS-F1. Aplicar no projeto de DESENVOLVIMENTO.

-- ---------- FILIAIS ----------
-- Cadastro gerenciavel pelo admin (resolve CE Serra/Serra Park/Eusebio sem
-- travar o desenvolvimento — spec secao 5). Seeds de referencia na 0007.
create table public.filiais (
  id         smallint generated always as identity primary key,
  slug       text not null unique,          -- 'matriz', 'linhares'...
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- MOTIVOS ----------
-- Motivos como tabela (nao enum): o admin ajusta o vocabulario pela UI.
-- `aplica_a` restringe em quais tipos de movimentacao o motivo aparece.
create table public.motivos (
  codigo    text primary key,               -- 'novo_colaborador'...
  rotulo    text not null,                  -- 'Novo colaborador'
  aplica_a  public.tipo_movimentacao[] not null,
  ativo     boolean not null default true
);

-- ---------- ATIVOS ----------
-- status/colaborador_atual/setor_atual sao DERIVADOS da ultima movimentacao
-- (trigger da 0004) — nunca editados direto pela aplicacao.
create table public.ativos (
  id                  uuid primary key default gen_random_uuid(),
  patrimonio          text not null,             -- canonico: WAP0004491 (repete em casos raros — ver indice unico abaixo)
  patrimonio_original text,                       -- como veio da planilha
  categoria           public.categoria_ativo not null,
  marca               text,
  modelo              text,
  service_tag         text,
  hostname            text,
  memoria             text,
  armazenamento       text,
  processador         text,
  fornecedor          text,                       -- WAP, Proprinter...
  filial_id           smallint not null references public.filiais (id),
  -- Campos DERIVADOS da ultima movimentacao:
  status              public.status_ativo not null default 'em_estoque',
  colaborador_atual   text,
  setor_atual         text,
  -- Metadados
  termo_assinado      public.termo_status,
  termo_data          date,
  pendencia           text,                       -- ex.: 'sem patrimonio fisico'
  origem              text not null default 'cadastro', -- 'cadastro' | 'importacao' | 'inferido'
  observacoes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Regra 1 da especificacao: o patrimonio identifica o ativo no dia a dia, mas
-- REPETE em casos raros — quem e unico e o par (patrimonio + service tag).
-- Sem service tag, o patrimonio nao pode repetir (o coalesce '' colide de proposito).
create unique index ativos_patrimonio_service_tag_uidx
  on public.ativos (patrimonio, (coalesce(service_tag, '')));
create index ativos_patrimonio_idx    on public.ativos (patrimonio);
create index ativos_filial_status_idx on public.ativos (filial_id, status);
create index ativos_categoria_idx     on public.ativos (categoria);
create index ativos_colaborador_idx   on public.ativos (colaborador_atual);

-- ---------- MOVIMENTACOES ----------
-- Fonte da verdade. Imutavel: correcao = estorno + novo lancamento (regra 6).
create table public.movimentacoes (
  id                 uuid primary key default gen_random_uuid(),
  ativo_id           uuid not null references public.ativos (id),
  tipo               public.tipo_movimentacao not null,
  motivo             text references public.motivos (codigo),
  data               date not null default current_date,
  filial_id          smallint not null references public.filiais (id),
  filial_destino_id  smallint references public.filiais (id),  -- so transferencia
  colaborador        text,
  setor              text,
  chamado            text,                    -- no. no sistema de chamados
  termo_assinado     public.termo_status,
  termo_data         date,
  itens_faltantes    text[],                  -- ['carregador','mochila']
  observacao         text,
  estorno_de         uuid references public.movimentacoes (id), -- so tipo estorno
  -- Snapshots p/ auditoria, leitura do historico e estorno completo:
  status_anterior    public.status_ativo,
  status_resultante  public.status_ativo,
  snapshot_anterior  jsonb,  -- {status,colaborador,setor,filial_id} antes desta mov.
  criado_por         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now()
);

create index mov_ativo_idx       on public.movimentacoes (ativo_id, data desc);
create index mov_filial_data_idx on public.movimentacoes (filial_id, data desc);
create index mov_created_idx     on public.movimentacoes (created_at desc);

-- ---------- SENHAS_ACESSO ----------
-- Senhas de visualizacao dos relatorios (geridas pelo operador em admin/senhas,
-- F3). Hash scrypt; validacao SEMPRE no servidor (service role) — anon nunca le.
create table public.senhas_acesso (
  id         uuid primary key default gen_random_uuid(),
  rotulo     text not null,               -- 'Filial Linhares', 'Stefanini'...
  hash       text not null,
  ativa      boolean not null default true,
  criado_por uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  ultimo_uso timestamptz
);

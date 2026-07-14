-- Migration 0014 — catálogo de ITENS por quantidade (F3B / plano §6.1).
-- Mundo paralelo aos ativos: acessórios/periféricos/componentes controlados por
-- QUANTIDADE, sem patrimônio, sem service tag e sem máquina de estados (a
-- pergunta 6 da spec §13 segue respondida: acessório não vira ativo). Gerenciado
-- em admin/itens (CRUD igual a admin/motivos). Migration ADITIVA — nada existente
-- muda. Aplicar no projeto de DESENVOLVIMENTO.

-- Grupo do catálogo (o e-mail semanal separa "acessórios e periféricos" de
-- "componentes"). Celular "uso comum × exclusivo" NÃO cria grupo aqui — segue
-- em ativos (decisão do plano §3.5).
create type public.grupo_item as enum ('acessorio', 'componente');

create table public.itens (
  id         smallint generated always as identity primary key,
  nome       text not null,
  grupo      public.grupo_item not null,
  ativo      boolean not null default true,
  ordem      int not null default 0,
  created_at timestamptz not null default now()
);

-- Nome único case-insensitive (o catálogo é pequeno e curado; "Mouse" e "mouse"
-- são o mesmo item). Granularidade decidida no plano §3.8: memórias separadas por
-- DDR e tamanho, "kit teclado+mouse" é item próprio — cada um é uma linha distinta.
create unique index itens_nome_uidx on public.itens ((lower(nome)));
create index itens_grupo_ordem_idx on public.itens (grupo, ordem);

-- RLS padrão do projeto: operador logado (authenticated) lê e escreve tudo;
-- anon nada. O visualizador por senha não tem credencial de banco e não acessa
-- itens (a rota /itens é só do operador — servida fora de /relatorios/**).
alter table public.itens enable row level security;
create policy "leitura operador" on public.itens for select to authenticated using (true);
create policy "operador escreve" on public.itens for all    to authenticated using (true) with check (true);

-- Sabotagem A: o default de volta numa do lote 1 (ativos), numa do lote 2 (motivos) e numa tabela NOVA
alter table public.ativos alter column empresa_id set default public.empresa_legada();
alter table public.motivos alter column empresa_id set default public.empresa_legada();
create table public.f67c_sabotagem_a (id int primary key, empresa_id uuid not null default public.empresa_legada() references public.empresas (id));

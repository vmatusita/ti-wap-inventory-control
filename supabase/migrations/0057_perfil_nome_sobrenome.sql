-- Migration 0057 — nome e sobrenome do operador (24/07/2026).
--
-- Pedido do Johnny: ao aceitar o convite, alem de definir a senha o novo operador
-- informa NOME e SOBRENOME em dois campos separados (tela /auth/definir-senha).
-- Ate aqui `profiles` so tinha `nome`, preenchido pelo trigger com o proprio
-- e-mail (fallback da 0001/0041) — nome de gente nunca era coletado.
--
-- DESENHO (por que renomear em vez de so adicionar uma coluna):
-- `profiles.nome` e lido em ~10 pontos como "o nome que se exibe" (autor de
-- movimentacao/anotacao/termo/relatorio/import, cabecalho do app, /admin/usuarios,
-- `tecnico` do termo .docx). Se `nome` virasse "so o primeiro nome", todos esses
-- lugares passariam a mostrar meio nome. Entao:
--
--   * o campo que ja existia vira `primeiro_nome` (input "Nome");
--   * entra `sobrenome` (input "Sobrenome");
--   * `nome` VOLTA como coluna GERADA = "primeiro_nome sobrenome".
--
-- Resultado: nenhum consumidor de leitura muda — `nome` continua sendo a coluna de
-- exibicao, agora derivada e impossivel de dessincronizar (generated always, o
-- banco recusa escrita direta). Linhas antigas ficam com `sobrenome` nulo e
-- `nome` = `primeiro_nome` (exatamente o valor de hoje), entao a exibicao atual
-- nao muda para ninguem ate a pessoa preencher os dois campos.
--
-- `nullif(btrim(...), '')` preserva a semantica de HOJE: perfil sem nome continua
-- devolvendo NULL (e nao ''), que e o que `ouTraco`/`nome?.trim() || email` esperam.
--
-- DEPENDENCIAS conferidas em producao antes de escrever esta migration:
--   * views que referenciam colunas de `profiles`: so `v_pendencias_item` (0052),
--     recriada abaixo por `create or replace` (mesma lista de colunas/tipos, entao
--     `v_fila_pendencias`, que depende dela, nao precisa ser tocada);
--   * funcoes que citam `profiles`: so `handle_new_user`, recriada abaixo;
--   * nenhum codigo do app ou de `scripts/` ESCREVE em `profiles` (so leituras) —
--     o insert e sempre do trigger.
--
-- ADITIVA / NAO DESTRUTIVA: nenhum `delete from`, nenhum dado perdido (o conteudo
-- de `nome` sobrevive intacto dentro de `primeiro_nome`). Caminho A do
-- docs/RUNBOOK-BANCO.md: ensaio primeiro, depois producao.

-- ---------- 1) o antigo `nome` passa a ser o primeiro nome ----------
-- Rename e metadata-only e o Postgres reescreve sozinho a referencia dentro da
-- v_pendencias_item (ela passa a ler `pr.primeiro_nome`); o passo 4 a devolve
-- para `pr.nome`, que ai ja e o nome completo.
alter table public.profiles rename column nome to primeiro_nome;

-- ---------- 2) sobrenome (segundo input da tela) ----------
alter table public.profiles add column sobrenome text;

-- ---------- 3) `nome` volta, agora DERIVADO ----------
alter table public.profiles
  add column nome text
  generated always as (
    nullif(btrim(coalesce(primeiro_nome, '') || ' ' || coalesce(sobrenome, '')), '')
  ) stored;

comment on column public.profiles.primeiro_nome is
  'Nome (primeiro nome) informado pelo proprio operador em /auth/definir-senha. Enquanto nao informado, guarda o e-mail (fallback do trigger handle_new_user).';
comment on column public.profiles.sobrenome is
  'Sobrenome informado pelo proprio operador em /auth/definir-senha.';
comment on column public.profiles.nome is
  'GERADA — nome de exibicao ("primeiro_nome sobrenome"), NULL quando as duas partes estao vazias. E esta a coluna lida por todo o app (autoria, cabecalho, /admin/usuarios, termo .docx). Nao aceita escrita direta: gravar em primeiro_nome/sobrenome.';

-- ---------- 4) view de pendencias de item volta a exibir o nome COMPLETO ----------
-- `create or replace` (e nao drop/create): mesma lista de colunas, mesmos tipos, na
-- mesma ordem — requisito do Postgres e o que preserva `v_fila_pendencias`, que le
-- desta view. Unica diferenca vs 0052: `pr.nome` no lugar de `pr.primeiro_nome`
-- (que era `pr.nome` antes do rename do passo 1).
create or replace view public.v_pendencias_item
with (security_invoker = true) as
select
  pi.id,
  pi.ativo_id,
  pi.movimentacao_id,
  pi.item,
  pi.colaborador,
  pi.filial_id,
  f.slug              as filial,
  f.nome              as filial_nome,
  pi.status,
  pi.desfecho,
  pi.observacao,
  pi.resolvida_em,
  pi.resolvida_por,
  pr.nome             as resolvida_por_nome,
  pi.created_at,
  a.patrimonio,
  a.categoria,
  a.marca,
  a.modelo,
  m.data::timestamptz as desde          -- data da devolução geradora
from public.pendencias_item pi
join public.ativos a           on a.id = pi.ativo_id
join public.filiais f          on f.id = pi.filial_id
left join public.movimentacoes m on m.id = pi.movimentacao_id
left join public.profiles pr     on pr.id = pi.resolvida_por;

comment on view public.v_pendencias_item is
  'F18: leitura das pendências de item (abertas E resolvidas) com detalhe de ativo/filial/movimentação/quem-resolveu. desde = data da devolução geradora. security_invoker.';

-- ---------- 5) trigger de criacao do perfil ----------
-- Mantem INTACTA a trava de dominio da 0041 (unica defesa no banco contra login
-- fora dos dominios corporativos); so muda a coluna de destino do insert e passa a
-- aproveitar `sobrenome` do metadata, se vier. `nome` NAO entra no insert — e
-- gerada, e mencioná-la seria erro.
--
-- Fallback preservado: sem metadata, `primeiro_nome` recebe o e-mail, entao `nome`
-- (gerada) devolve o e-mail — exatamente o comportamento das 0001/0041, do qual
-- supabase/tests/dominios_login.sql depende.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or not (
          new.email ilike '%@wap.ind.br'
       or new.email ilike '%@stefanini.com'
       or new.email ilike '%@latam.stefanini.com'
     )
  then
    raise exception 'Login restrito a contas @wap.ind.br, @stefanini.com ou @latam.stefanini.com';
  end if;
  insert into public.profiles (id, primeiro_nome, sobrenome)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'sobrenome'), '')
  );
  return new;
end;
$$;

-- `create or replace` preserva dono e ACL, entao os revoke da 0038/0041 continuam
-- valendo; reafirmados por seguranca (idempotente).
revoke all on function public.handle_new_user() from public, anon, authenticated;

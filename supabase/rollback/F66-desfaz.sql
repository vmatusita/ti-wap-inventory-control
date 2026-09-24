-- =============================================================================
-- F66-desfaz.sql — o ROLLBACK da F66 (docs/PLAN-F66.md §6)
-- =============================================================================
-- Desfaz as cinco migrations da F66 NA ORDEM INVERSA DO APPLY: 0179 → 0178 → 0177 → 0176 → 0175.
--   1. (nenhum índice — a F66 não cria nem derruba índice; PLAN-F66 §3);
--   2. (0179) `rel_por_motivo_filiais` e `rel_resumo_filiais` voltam ao corpo da 0143 (o join de `motivos` só pelo
--      código) — o corpo copiado BYTE A BYTE (a prova de mesa é `rollback-f66.test.ts`; a do banco, o md5 do `prosrc`
--      contra o "antes" dos dois bancos vivos, 1bd17603…/74923fe5…, no roteiro `f66_rollback.sql`). `create or replace`
--      preserva dono e ACL;
--   3.–6. (0178, 0177, 0176, 0175) as 51 policies de volta ao texto de ANTES da 0175, por `alter policy` LITERAL com o
--      nome de hoje, trocando SÓ as cláusulas que a migration da F66 trocou — o texto de cada uma é o da última migration
--      que a escreveu antes da F66, gerado pelo MESMO replay da trava de mesa (`scripts/db/predicado-policies.mjs`), nunca
--      transcrito à mão. O piso volta sozinho; as seis de escrita por unidade voltam a `pode_escrever_filial(filial_id)`.
-- Dentro de cada migration, as policies saem na MESMA ordem do apply (a ordem de lock do app); entre as migrations, o
-- inverso (o molde de F65-desfaz.sql).
--
-- IDEMPOTENTE EM QUALQUER ESTADO: `alter policy` com o texto de antes é o mesmo comando em qualquer ponto (com o lote
-- aplicado ou não), e `create or replace` idem — serve ao apply PARCIAL (produção parada entre dois lotes), ao arquivo
-- rodado duas vezes e ao banco sem a F66. Nenhuma tupla reescrita: `alter policy` e `create or replace function` são
-- catálogo. Cada `alter policy` toma ACCESS EXCLUSIVE na tabela até o fim da transação (PG 17, policy.c), e por isso o
-- `lock_timeout` de 2 s por `set`/`reset`: sem o lock, o rollback falha inteiro e se repete (no máximo três vezes em
-- 30 min), nunca espera o app.
--
-- ENTRE FASES: o rollback da F65, o da F64, o da F63 e o da F62 EXIGEM este ANTES — o `drop column empresa_id` da F64 e
-- da F63 falha com as policies da F66 citando a coluna, e o da F62 derruba as funções de conjunto que elas chamam. Os
-- roteiros `f65_rollback.sql`, `f64_rollback.sql`, `f63_rollback.sql` e `f62_rollback.sql` rodam este arquivo antes
-- dos deles. DEPOIS DA F73 (uma segunda empresa com dado), este rollback ABRE a leitura entre empresas (o piso volta a
-- ser a única condição): só roda com o dado da segunda empresa fora.
--
-- Sem `begin`/`commit` próprios: quem roda decide a transação (o roteiro `supabase/tests/f66_rollback.sql` roda dentro
-- da dele, e é o ensaio deste arquivo no Postgres do CI; num banco vivo, o `execute_sql` do MCP com o conteúdo EXATO
-- deste arquivo). O ledger (`supabase_migrations.schema_migrations`) NÃO é reescrito: a linha das cinco fica, e a sonda
-- de deriva continua vendo os nomes aplicados.
-- =============================================================================

set lock_timeout = '2s';

-- 2. (0179) as duas rel_* voltam ao corpo da 0143 (o join de motivos só pelo código)
create or replace function public.rel_por_motivo_filiais(
  p_filiais smallint[],
  p_de      date,
  p_ate     date
) returns table (tipo public.tipo_movimentacao, motivo text, total bigint)
language sql stable security invoker set search_path = public as $$
  select m.tipo,
         coalesce(mo.rotulo, m.motivo, 'Outro') as motivo,
         count(*)::bigint
  from public.movimentacoes m
  left join public.motivos mo on mo.codigo = m.motivo
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and m.filial_id = any (p_filiais)
  group by m.tipo, coalesce(mo.rotulo, m.motivo, 'Outro')
  order by 3 desc;
$$;

create or replace function public.rel_resumo_filiais(
  p_filiais smallint[],
  p_de      date,
  p_ate     date
) returns table (
  tipo        public.tipo_movimentacao,
  filial_slug text,
  filial_nome text,
  motivo      text,
  categoria   public.categoria_ativo,
  total       bigint
) language sql stable security invoker set search_path = public as $$
  select m.tipo, f.slug, f.nome,
         coalesce(mo.rotulo, m.motivo, 'Outro') as motivo,
         a.categoria, count(*)::bigint
  from public.movimentacoes m
  join public.ativos a  on a.id = m.ativo_id
  join public.filiais f on f.id = m.filial_id
  left join public.motivos mo on mo.codigo = m.motivo
  where m.tipo in ('saida', 'devolucao')
    and m.data between p_de and p_ate
    and m.filial_id = any (p_filiais)
  group by m.tipo, f.slug, f.nome, coalesce(mo.rotulo, m.motivo, 'Outro'), a.categoria
  order by f.nome, motivo, a.categoria;
$$;

-- 3. (0178) os registros e os vínculos (membros, operador_filiais, relatorios_gerados, import_logs, eventos_admin) — as 7 de volta

-- membros (o texto da 0153)
alter policy "leitura operador" on public.membros
  using ((select public.papel_atual()) is not null);

-- operador_filiais (o texto da 0070)
alter policy "leitura operador" on public.operador_filiais
  using ((select public.papel_atual()) is not null);

-- relatorios_gerados (o texto da 0070 e da 0072)
alter policy "leitura operador" on public.relatorios_gerados
  using ((select public.papel_atual()) is not null);
alter policy "operador gera" on public.relatorios_gerados
  with check ((select public.pode_escrever()));

-- import_logs (o texto da 0063 e da 0067)
alter policy "leitura operador" on public.import_logs
  using ((select public.e_admin()));
alter policy "operador insere" on public.import_logs
  with check ((select public.e_admin()));

-- eventos_admin (o texto da 0065)
alter policy "admin le auditoria" on public.eventos_admin
  using ((select public.e_admin()));

-- 4. (0177) o vocabulário (import, apelidos, tipos, motivos, kits, filiais) — as 21 de volta

-- import_prefixos_patrimonio (o texto da 0139)
alter policy "leitura operador" on public.import_prefixos_patrimonio
  using ((select public.papel_atual()) is not null);

-- import_termos_categoria (o texto da 0139)
alter policy "leitura operador" on public.import_termos_categoria
  using ((select public.papel_atual()) is not null);

-- import_termos_estado (o texto da 0139)
alter policy "leitura operador" on public.import_termos_estado
  using ((select public.papel_atual()) is not null);

-- unidades_apelidos (o texto da 0139)
alter policy "leitura operador" on public.unidades_apelidos
  using ((select public.papel_atual()) is not null);
alter policy "admin insere apelido" on public.unidades_apelidos
  with check ((select public.e_admin()));
alter policy "admin apaga apelido" on public.unidades_apelidos
  using ((select public.e_admin()));

-- tipos_item (o texto da 0114)
alter policy "leitura operador" on public.tipos_item
  using ((select public.papel_atual()) is not null);
alter policy "admin insere tipo" on public.tipos_item
  with check ((select public.e_admin()));
alter policy "admin atualiza tipo" on public.tipos_item
  using ((select public.e_admin()))
  with check ((select public.e_admin()));

-- motivos (o texto da 0063 e da 0070)
alter policy "leitura operador" on public.motivos
  using ((select public.papel_atual()) is not null);
alter policy "admin insere" on public.motivos
  with check ((select public.e_admin()));
alter policy "admin atualiza" on public.motivos
  using ((select public.e_admin()))
  with check ((select public.e_admin()));
alter policy "admin apaga" on public.motivos
  using ((select public.e_admin()));

-- kits_modelos (o texto da 0063 e da 0070)
alter policy "leitura operador" on public.kits_modelos
  using ((select public.papel_atual()) is not null);
alter policy "admin insere" on public.kits_modelos
  with check ((select public.e_admin()));
alter policy "admin atualiza" on public.kits_modelos
  using ((select public.e_admin()))
  with check ((select public.e_admin()));
alter policy "admin apaga" on public.kits_modelos
  using ((select public.e_admin()));

-- filiais (o texto da 0063 e da 0070)
alter policy "leitura operador" on public.filiais
  using ((select public.papel_atual()) is not null);
alter policy "admin insere" on public.filiais
  with check ((select public.e_admin()));
alter policy "admin atualiza" on public.filiais
  using ((select public.e_admin()))
  with check ((select public.e_admin()));
alter policy "admin apaga" on public.filiais
  using ((select public.e_admin()));

-- 5. (0176) o movimento do acervo (ativos, movimentacoes, pendencias_item, lancamentos_item) — as 10 de volta; as seis de
--    escrita por unidade voltam a `pode_escrever_filial(filial_id)` (as seis linhas voltam a `k_excecoes_predicado` no
--    `git revert` do commit da 0176)

-- ativos (o texto da 0063 e da 0070)
alter policy "leitura operador" on public.ativos
  using ((select public.papel_atual()) is not null);
alter policy "operador insere" on public.ativos
  with check (public.pode_escrever_filial(filial_id));
alter policy "operador atualiza" on public.ativos
  using (public.pode_escrever_filial(filial_id))
  with check (public.pode_escrever_filial(filial_id));

-- movimentacoes (o texto da 0067 e da 0070)
alter policy "leitura operador" on public.movimentacoes
  using ((select public.papel_atual()) is not null);
alter policy "operador insere" on public.movimentacoes
  with check (
    public.pode_escrever_filial(filial_id)
    and public.pode_escrever_filial((snapshot_anterior ->> 'filial_id')::smallint)
  );

-- pendencias_item (o texto da 0070 e da 0103 e da 0107)
alter policy "pendencias_item leitura operador" on public.pendencias_item
  using ((select public.papel_atual()) is not null);
alter policy "pendencias_item operador resolve" on public.pendencias_item
  using (public.pode_escrever_filial(filial_id) and status = 'aberta')
  with check (public.pode_escrever_filial(filial_id));
alter policy "pendencias_item admin reabre" on public.pendencias_item
  using ((select public.e_admin()) and public.pode_escrever_filial(filial_id) and status = 'resolvida')
  with check ((select public.e_admin()) and public.pode_escrever_filial(filial_id) and status = 'aberta');

-- lancamentos_item (o texto da 0068 e da 0070)
alter policy "leitura operador" on public.lancamentos_item
  using ((select public.papel_atual()) is not null);
alter policy "operador lanca" on public.lancamentos_item
  with check (
    public.pode_escrever_filial(filial_id)
    and public.estorno_item_coerente(estorna_id, filial_id, item_id)
  );

-- 6. (0175) os cadastros do acervo (colaboradores, itens, termos_gerados, anotacoes) — as 13 de volta

-- colaboradores (o texto da 0112)
alter policy "leitura operador" on public.colaboradores
  using ((select public.papel_atual()) is not null);
alter policy "escrita cria colaborador" on public.colaboradores
  with check ((select public.pode_escrever()));
alter policy "admin atualiza colaborador" on public.colaboradores
  using ((select public.e_admin()))
  with check ((select public.e_admin()));

-- itens (o texto da 0063 e da 0070 e da 0125)
alter policy "leitura operador" on public.itens
  using ((select public.papel_atual()) is not null);
alter policy "escrita cria item" on public.itens
  with check ((select public.pode_escrever()));
alter policy "admin atualiza" on public.itens
  using ((select public.e_admin()))
  with check ((select public.e_admin()));
alter policy "admin apaga" on public.itens
  using ((select public.e_admin()));

-- termos_gerados (o texto da 0069 e da 0070)
alter policy "leitura operador" on public.termos_gerados
  using ((select public.papel_atual()) is not null);
alter policy "operador insere" on public.termos_gerados
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
  );
alter policy "operador atualiza" on public.termos_gerados
  using (public.pode_escrever_termo(ativo_ids))
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
  );
alter policy "operador apaga" on public.termos_gerados
  using (public.pode_escrever_termo(ativo_ids));

-- anotacoes (o texto da 0070 e da 0072)
alter policy "leitura operador" on public.anotacoes
  using ((select public.papel_atual()) is not null);
alter policy "operador anota" on public.anotacoes
  with check ((select public.pode_escrever()));

reset lock_timeout;

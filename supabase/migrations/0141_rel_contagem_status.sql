-- =============================================================================
-- 0141 — os KPIs do dashboard por UMA contagem agregada no banco (F60 · Frente B · lote 1)
-- =============================================================================
-- O CUSTO QUE ELA CORTA (fato 13 · PLAN-F60 §3.5 B1 e §6.5, medido em produção em 16/09/2026)
--
-- Os oito tiles do dashboard (`/`) saíam de `getKpis(client, null)` → `lerEstadoAtivos` →
-- `paginarTodos` sobre `ativos` INTEIRA: duas páginas por render (1.000 + 622 linhas; execução
-- mediana 1,503 + 2,113 ms, `Limit` + `Index Scan ativos_pkey`, 1.007 + 1.636 buffers), 1.622 linhas
-- trafegadas pelo PostgREST até o servidor do app para virar OITO números. As duas alternativas
-- sem migration foram medidas e recusadas:
--
--   · o agregado do PostgREST (`select('status, count()')`) está DESLIGADO — o `rolconfig` do
--     `authenticator` não tem `pgrst.db_aggregates_enabled` nos dois bancos, e ligá-lo é mudar
--     configuração de produção para uma tela só;
--   · sete contagens `count: 'exact', head: true`, uma por status, custam de 0,72 a 1,41 ms CADA
--     no banco, mas são SETE idas ao PostgREST por render contra o pool pequeno do Free — o mesmo
--     motivo de `LIMITE_LOTES_PARALELOS` em `queries/relatorios/comum.ts`.
--
-- A forma equivalente medida — `group by status` sobre `ativos`, sem as baixas — é UMA ida:
-- 1,433 ms de mediana (p95 2,009), `Aggregate` + `Index Only Scan ativos_filial_status_idx`, 265
-- buffers, 7 linhas. E as três fontes deram o MESMO total, célula a célula: páginas 1.622 =
-- agregação 1.622 = soma das sete contagens 1.622.
--
-- O QUE ELA É
--
-- `rel_contagem_status_filiais(p_filiais smallint[])` → uma linha por status PRESENTE no recorte,
-- `(status, total)`. `language sql stable security invoker set search_path = public`, NÃO
-- `strict` — o molde das sete `rel_*_filiais` que o lote 2 cria, e por isso já nasce dentro da
-- trava da Frente C (`rpcs-recorte-sql.test.ts` e o bloco 7 de `catalogo_secdef.sql`): o prefixo
-- `rel_` é o que a põe sob a régua.
--
--   · O RECORTE É LISTA OBRIGATÓRIA, ligada por `a.filial_id = any (p_filiais)` como conjunção
--     direta do `where`. NULL e `'{}'` dão ZERO linhas, sem erro (`= any` de NULL é NULL, e de
--     vazio é falso) — o nulo não significa "tudo" aqui, e é essa a frase da fase. Não há
--     `NOT NULL` em parâmetro de função no Postgres (fato 7): o "não-anulável" é esta conjunção,
--     mais a porta (`chamarRpc` não aceita `null` num parâmetro fora de `ARGUMENTOS_ANULAVEIS`),
--     mais a trava.
--   · O CONSOLIDADO é a lista EXPLÍCITA de TODAS as filiais, inclusive as desativadas
--     (`filiaisDoConsolidado`, `src/lib/queries/relatorios/recorte-filiais.ts`). Como
--     `ativos.filial_id` é NOT NULL com FK para `filiais`, essa lista cobre exatamente o conjunto
--     que a leitura antiga (sem filtro de filial) contava — o número não muda.
--   · AS BAIXAS TERMINAIS NÃO SAEM NO SQL. A função devolve a contagem CRUA por status, inclusive
--     `descartado` e `devolvido_fornecedor`; quem as tira é `kpisDeContagens`
--     (`queries/relatorios/estoque.ts`), ao lado de `kpisDeEstado`, que faz o mesmo sobre o estado.
--     A regra do KPI mora num lugar só (TypeScript), e o teste com fixture fictícia prova
--     `kpisDeContagens(contar(estado)) ≡ kpisDeEstado(estado)` nos oito números, com `emprestado` e
--     as duas baixas dentro. Pôr o `not in` também aqui criaria uma segunda cópia da regra.
--   · `security invoker`: a RLS de `ativos` vale como vale para o `select` que ela substitui (todo
--     logado ATIVO lê o acervo inteiro, `0070`). Grants no molde das `rel_*` (`0056`/`0118`):
--     `anon` e `PUBLIC` revogados NESTA migration — função nova em `public` nasce com EXECUTE para
--     `anon` (fato 11), e a asserção 6a de `catalogo_secdef.sql` reprova invoker alcançável por
--     ele —; EXECUTE para `authenticated` (o dashboard, com a sessão do operador) e para
--     `service_role` (toda `rel_*` o tem, e a 7e o exige; hoje nenhum caminho do visualizador por
--     senha a chama — a leitura mora em `queries/dashboard.ts`, FORA da superfície de
--     `fronteira-viewer.test.ts`, e a lista branca de RPCs do visualizador continua com sete).
--   · `order by a.status` é a ordem do enum; o conferidor de formas pagina por `status`, que é
--     único por linha (`group by a.status`).
--
-- O ÍNDICE QUE A SERVE: `ativos_filial_status_idx (filial_id, status)` (`0003`). A forma medida não
-- tinha o `= any (p_filiais)`; com ele o mesmo índice pode servir filtro e agrupamento, e o plano
-- "depois" do bloco B1 (o método do PLAN-F60 §3.1, com a função chamada de verdade) confirma ou
-- desmente — nenhum índice novo entra por suposição.
--
-- NÃO toca dado, não recria função existente, não mexe em enum: é inteiramente aditiva. A
-- `1.64.0` no ar nunca a chama, então o apply antes do merge não muda nada para quem opera.
--
-- ROLLBACK — escrito em PROSA, de propósito (a armadilha de `scripts/db/corpo-vigente.mjs`, que
-- tira os comentários antes de procurar definições: pseudo-SQL de função aqui viraria, para ele,
-- uma definição de verdade):
--
--   1) se o app que a chama já estiver no ar, reverter o app PRIMEIRO (o dashboard volta a ler as
--      páginas de `ativos`) — dropar antes derruba o `/` com 404 do PostgREST;
--   2) `drop function` da assinatura `public.rel_contagem_status_filiais(smallint[])`;
--   3) `notify pgrst, 'reload schema'`.
--   Em banco real, por migration NOVA de reversão (aplicada não se edita), com `npm run db:lock`.
--
-- VERIFICAÇÃO PÓS-APPLY (cada banco — ensaio primeiro; só leitura, só números):
--
--   -- 1) uma assinatura só, sem overload:
--   select p.oid::regprocedure::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'rel_contagem_status_filiais';
--   -- esperado: EXATAMENTE 1 linha, rel_contagem_status_filiais(smallint[])
--
--   -- 2) os atributos que a trava cobra (7d):
--   select p.prosecdef, p.provolatile, p.proisstrict, p.proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'rel_contagem_status_filiais';
--   -- esperado: false · 's' · false · {search_path=public}
--
--   -- 3) grants por papel:
--   select r.rolname, has_function_privilege(r.rolname,
--          'public.rel_contagem_status_filiais(smallint[])', 'execute')
--     from (values ('anon'), ('authenticated'), ('service_role')) r(rolname);
--   -- esperado: anon=false, authenticated=true, service_role=true
--   -- e a proacl sem a entrada `=X/` (PUBLIC):
--   select p.proacl from pg_proc p where p.proname = 'rel_contagem_status_filiais';
--
--   -- 4) o corpo aplicado é o do arquivo:
--   select md5(regexp_replace(p.prosrc, '\s+', ' ', 'g'))
--     from pg_proc p where p.proname = 'rel_contagem_status_filiais';
--   -- comparar com o mesmo md5 sobre o corpo extraído deste arquivo por corpo-vigente.mjs
--
--   -- 5) NULL e vazio não são "tudo":
--   select count(*) from public.rel_contagem_status_filiais(null);    -- esperado: 0
--   select count(*) from public.rel_contagem_status_filiais('{}');    -- esperado: 0
--
--   -- 6) o consolidado conta o que a leitura antiga contava (só números):
--   select (select coalesce(sum(c.total), 0)
--             from public.rel_contagem_status_filiais(
--                    (select array_agg(f.id order by f.id) from public.filiais f)) c)
--        = (select count(*) from public.ativos) as consolidado_bate;
--   -- esperado: true
--
--   -- 7) recarregar o cache do PostgREST:
--   notify pgrst, 'reload schema';
-- =============================================================================

create function public.rel_contagem_status_filiais(
  p_filiais smallint[]
) returns table (status public.status_ativo, total bigint)
language sql stable security invoker set search_path = public as $$
  select a.status, count(*)::bigint as total
  from public.ativos a
  where a.filial_id = any (p_filiais)
  group by a.status
  order by a.status;
$$;

-- Grants: molde das rel_* (0056/0118). Função nova em `public` nasce com EXECUTE para PUBLIC/anon.
revoke all on function public.rel_contagem_status_filiais(smallint[]) from public, anon;
grant execute on function public.rel_contagem_status_filiais(smallint[]) to authenticated, service_role;

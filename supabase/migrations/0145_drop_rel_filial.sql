-- =============================================================================
-- 0145 — as sete assinaturas velhas das rel_* saem do banco (F60 · Frente D · lote 2)
-- =============================================================================
-- As sete `rel_*` que recortavam por `p_filial smallint`, com `(p_filial is null or …)` — a
-- forma em que o NULO significava "mostre tudo", que a R-ACC-71 proíbe — foram substituídas pela
-- `0143` (as `<nome>_filiais`, com `p_filiais smallint[]` obrigatório). Enquanto as velhas
-- existirem, qualquer chamador esquecido (uma aba aberta antes do deploy, um script, um deploy
-- anterior) continua recebendo o acervo inteiro por um NULL; e a trava do recorte
-- (`rpcs-recorte-sql.test.ts`, bloco 7 de `catalogo_secdef.sql`) julga toda `rel_*` VIVA — as
-- velhas a deixariam vermelha para sempre.
--
-- `drop function` SEM `if exists`, de propósito: se uma das sete não existir, o apply está fora
-- de ordem (a `0143` e esta andam juntas, e nada mais as derruba) — e erro de ordem tem de PARAR o
-- apply, não passar calado. Sem `cascade`: nenhuma função, view ou policy depende delas (nenhuma
-- migration chama `rel_*` — PLAN-F60 fato 10); uma dependência que aparecesse faria o drop falhar
-- alto, que é o certo.
--
-- As assinaturas, exatas, e o corpo vivo de cada uma (é de onde o rollback as recria):
--   rel_estoque_asof  (smallint, date)        — 0134
--   rel_saldo_itens   (smallint, date)        — 0027
--   rel_mov_itens     (smallint, date, date)  — 0016
--   rel_frescor_itens (smallint, date)        — 0016
--   rel_mov_por_mes   (smallint, date, date)  — 0011
--   rel_por_motivo    (smallint, date, date)  — 0011
--   rel_resumo        (smallint, date, date)  — 0011
--
-- -----------------------------------------------------------------------------
-- A JANELA — quando esta migration pode tocar PRODUÇÃO (PLAN-F60 §9, decisão 4)
-- -----------------------------------------------------------------------------
-- No CI e no ENSAIO ela roda na ordem da cadeia (o ensaio não tem app de produção: o drop não
-- espera deploy). Em PRODUÇÃO, só depois de:
--   1. deploy da `1.65.0` READY, `/api/saude` com a versão e o commit do merge, e o smoke de
--      produção com 0 falha (a Parte B já chama as funções novas);
--   2. leitura T0 do `pg_stat_statements` — as sete velhas e as oito novas, por papel
--      (`authenticated`, `service_role`, `anon`), com o nome ENTRE ASPAS como o PostgREST o cita,
--      só papel, chamadas e número de formas; mais `pg_stat_statements_info.dealloc`;
--   3. tráfego real com o app novo (`scripts/perf/medir.mjs` e o smoke) e espera de ao menos 30
--      minutos;
--   4. leitura T1, a mesma consulta.
-- O drop SÓ acontece se os três valerem: Δ chamadas das VELHAS = 0 nos três papéis entre T0 e T1;
-- Δ das NOVAS > 0 em `authenticated`; `dealloc` igual em T0 e T1 (se mudou, uma entrada pode ter
-- sido despejada e recriada, e Δ = 0 não prova nada — repetir a janela). Chamador achado numa
-- velha: NÃO dropar — identificar pelo papel e pela contagem de formas (nunca o texto), achar a
-- origem, esperar e reler. A `0144` (a view de colaboradores) vai na mesma janela, antes desta.
--
-- -----------------------------------------------------------------------------
-- VERIFICAÇÃO PÓS-APPLY (cada banco)
-- -----------------------------------------------------------------------------
--   · `notify pgrst, 'reload schema'`;
--   · `to_regprocedure` de cada uma das sete assinaturas acima devolve NULL;
--   · as sete `rel_*_filiais` e `rel_contagem_status_filiais` continuam vivas, uma assinatura
--     cada, com os grants da `0143`/`0141`;
--   · smoke de produção outra vez com 0 falha; sonda de paridade ensaio × produção.
--
-- -----------------------------------------------------------------------------
-- ROLLBACK — em PROSA (a armadilha de `corpo-vigente.mjs`: pseudo-SQL de função em comentário
-- vira definição para ele), e NESTA ORDEM
-- -----------------------------------------------------------------------------
--   1. RECRIAR as sete velhas com os corpos VIVOS, lidos do ARQUIVO e não de memória:
--      `rel_estoque_asof` da `0134` (como está viva: `language sql stable set search_path =
--      public`, sem a palavra `security invoker`), `rel_saldo_itens` da `0027`, `rel_mov_itens` e
--      `rel_frescor_itens` da `0016`, `rel_mov_por_mes`, `rel_por_motivo` e `rel_resumo` da `0011`
--      — e com os GRANTS da `0056` (revogar tudo de PUBLIC e `anon`; EXECUTE para `authenticated`
--      e `service_role`), que uma função recriada do zero não traz.
--   2. `notify pgrst, 'reload schema'`; conferir `to_regprocedure` das sete não nulo, os grants
--      por papel e o md5 de `regexp_replace(prosrc, '\s+', ' ', 'g')` contra o corpo dos arquivos.
--   3. SÓ ENTÃO reverter o app (`git revert` do merge + redeploy) — reverter o app antes de
--      recriar as funções deixa o app velho chamando nomes que não existem (404 do PostgREST).
--   4. Depois, se for o caso, o rollback da `0143` (derrubar as novas) e o da `0144` (a view pelo
--      corpo da `0115`).
--   Em banco real, por migration NOVA de reversão (a aplicada não se edita), com `npm run db:lock`.
-- =============================================================================

drop function public.rel_estoque_asof(smallint, date);
drop function public.rel_saldo_itens(smallint, date);
drop function public.rel_mov_itens(smallint, date, date);
drop function public.rel_frescor_itens(smallint, date);
drop function public.rel_mov_por_mes(smallint, date, date);
drop function public.rel_por_motivo(smallint, date, date);
drop function public.rel_resumo(smallint, date, date);

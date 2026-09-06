-- =============================================================
-- _asserts.sql — a ferramenta de asserção dos roteiros (F45, 05/09/2026)
-- =============================================================
-- POR QUE ELE EXISTE
--
-- O repositório tem dezenas de asserções da forma `if v_n = 0 then ✓ else ✗`.
-- Todas elas passam sobre CONJUNTO VAZIO: se o cenário não montou o dado que
-- deveria examinar, `count(*)` devolve 0, o roteiro imprime ✓ e o CI fica verde.
-- Um roteiro tautológico é pior do que roteiro nenhum, porque dá sensação de
-- rede. `pg_temp.assert_zero_de` é a forma que RECUSA esse caso: ela exige que
-- você diga não só quantos estão ruins, mas sobre QUANTOS você olhou.
--
-- COMO CARREGAR — e por que não dá para colar isto dentro do roteiro
--
-- Todo roteiro de `supabase/tests/` é `begin; do $$ … $$; rollback;`. Função
-- criada DENTRO da transação some no `rollback`. Então este arquivo tem de ser
-- carregado ANTES do `begin`, na MESMA sessão de psql:
--
--     psql "$DBURL" -f supabase/tests/_asserts.sql -f supabase/tests/<roteiro>.sql
--
-- Dois `-f` = uma sessão só, e `pg_temp` sobrevive entre eles. É exatamente o
-- que `scripts/db/rodar-roteiros.sh` faz — e é por isso que o loop pula `_*.sql`
-- (senão tentaria rodar este arquivo como se fosse roteiro).
--
-- POR QUE UNIVERSO VAZIO LEVANTA EXCEÇÃO, EM VEZ DE MARCAR ✗
--
-- Universo vazio não é "o cenário falhou": é "o cenário não existiu". Tudo que
-- vem depois no roteiro está examinando um mundo que não foi montado, e marcar
-- ✗ e seguir daria mais quinze linhas de resultado sem valor. A exceção derruba
-- o bloco, o roteiro NÃO emite a linha `FIM`, e o runner reprova por ausência da
-- linha — o mesmo caminho de qualquer outro abort precoce. É a razão de as duas
-- peças (esta função e a linha `FIM`) terem nascido no mesmo commit.
--
-- USO
--
--     if pg_temp.assert_zero_de('3c nenhum ativo órfão', v_orfaos, v_total) then
--       v_ok := v_ok + 1;
--     else
--       v_falhas := v_falhas + 1;
--     end if;
--
-- A própria função emite o `✓`/`✗` no estilo dos roteiros; quem chama só conta.
-- =============================================================

create or replace function pg_temp.assert_zero_de(
  rotulo   text,
  ruins    bigint,
  universo bigint
) returns boolean
language plpgsql
as $fn$
begin
  if universo is null or universo = 0 then
    raise exception
      'assert_zero_de: universo vazio em "%" — a asserção passaria sobre conjunto vazio (tautologia). Monte o cenário ou conte outra coisa.',
      rotulo;
  end if;

  if ruins is null then
    raise exception
      'assert_zero_de: contagem de ruins NULA em "%" — count(*) nunca devolve null; provavelmente veio de um `select into` que não achou linha.',
      rotulo;
  end if;

  if ruins < 0 or ruins > universo then
    raise exception
      'assert_zero_de: contagem incoerente em "%" — % ruins de um universo de %.',
      rotulo, ruins, universo;
  end if;

  if ruins = 0 then
    raise notice '✓ % (0 de % conferidos)', rotulo, universo;
    return true;
  end if;

  raise warning '✗ %: % de % fora da regra', rotulo, ruins, universo;
  return false;
end;
$fn$;

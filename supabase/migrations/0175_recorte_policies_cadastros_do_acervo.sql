-- =============================================================================
-- 0175_recorte_policies_cadastros_do_acervo.sql — F66 (24/09/2026): o recorte de empresa nas policies, lote 1, parte 1
-- =============================================================================
-- classe: ADITIVA (treze policies ganham o termo de empresa por alter policy; nenhuma tupla reescrita, nada derrubado)
--
-- A F66 escreve o predicado de tenant nas policies de `public`, EM CONJUNÇÃO com o piso de hoje, na forma içada da
-- doutrina (MATRIZ-REGRAS, emenda F59, R-ACC-63 e "A forma-alvo, para copiar"):
--     empresa_id = any (array (select public.<função de conjunto>()))
-- com a função da CLASSE da policy (PLAN-F66.md, decisão 2; a fonte única é `k_recorte_classe` em
-- supabase/tests/catalogo_policies.sql, que a asserção 16a confere pela árvore):
--     leitura pelo piso `papel_atual()` → empresas_do_membro()   · escrita por `pode_escrever()` → empresas_de_escrita()
--     escrita/leitura por `e_admin()`   → empresas_de_admin()    · escrita de termo (`pode_escrever_termo`) → empresas_de_escrita()
--
-- O PISO FICA EXATAMENTE COMO ESTÁ: cada policy é reescrita por UM `alter policy` LITERAL, com o nome de hoje, e o
-- texto-alvo carrega o piso por extenso, copiado da migration que o escreveu por último (o `alter policy` troca a
-- expressão INTEIRA — PostgreSQL 17, src/backend/commands/policy.c, AlterPolicy: `replaces[Anum_pg_policy_polqual - 1]
-- = true`). Apagar o piso é a F72. Nada de DDL de policy montado dinamicamente (R-ACC-70): a trava de mesa consome
-- cada comando deste arquivo pelo replay.
--
-- INERTE HOJE, POR CONSTRUÇÃO (fato 8 da ordem F66): uma empresa só; toda linha é dela; toda conta que passa pelo piso é
-- membro dela. A prova, conta a conta, antes (emulada) e depois (real) deste lote, nos dois bancos:
-- scripts/perf/conta-a-conta.mjs (docs/f66-evidencias/conta-a-conta/). O `with check` de INSERT vê a linha com o default
-- (`empresa_legada()`, a WAP, até a F67 — decisão do Johnny na F63): a documentação do PG 17 (sql-createpolicy) diz que o
-- WITH CHECK é avaliado "against the proposed new contents of the row", depois dos gatilhos BEFORE.
--
-- ESTE É O LOTE 1, PARTE 1 — os CADASTROS do acervo (`colaboradores`, `itens`, `termos_gerados`, `anotacoes`), na ordem
-- da 0160 (a ordem de lock do app). A parte 2 (0176) é o MOVIMENTO (`ativos`, `movimentacoes`, `pendencias_item`,
-- `lancamentos_item`) e leva a troca de `pode_escrever_filial` pela forma de pares. Dividir o lote 1 por família é a
-- decisão 1 do PLAN-F66: `alter policy` toma ACCESS EXCLUSIVE na tabela até o fim da transação (policy.c, AlterPolicy:
-- `RangeVarGetRelidExtended(stmt->table, AccessExclusiveLock, …)`), e o `apply_migration` do MCP é UMA transação —
-- quanto menos tabelas por migration, menor a janela em que uma leitura do app espera. `lock_timeout` de 2 s por
-- `set`/`reset`, sem `begin`/`commit` (o molde F63–F65); se o lock não vier: registrar e repetir, no máximo três vezes
-- em 30 min. Todo estado entre dois lotes é repouso válido (umas policies com o recorte, outras sem — inerte com uma
-- empresa).
-- =============================================================================

set lock_timeout = '2s';

-- colaboradores (0112): leitura pelo piso; criação por quem escreve; edição por admin
alter policy "leitura operador" on public.colaboradores
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "escrita cria colaborador" on public.colaboradores
  with check ((select public.pode_escrever())
              and empresa_id = any (array (select public.empresas_de_escrita())));

alter policy "admin atualiza colaborador" on public.colaboradores
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())))
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

-- itens (0070 a leitura, 0125 a criação, 0063 a edição e a exclusão)
alter policy "leitura operador" on public.itens
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "escrita cria item" on public.itens
  with check ((select public.pode_escrever())
              and empresa_id = any (array (select public.empresas_de_escrita())));

alter policy "admin atualiza" on public.itens
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())))
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin apaga" on public.itens
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())));

-- termos_gerados (0070 a leitura, 0069 as três de escrita): o termo decide pelos próprios `ativo_ids` — as exceções
-- PERMANENTES da doutrina (`pode_escrever_termo`, `termo_ancora_coerente`, `array_length`) ficam como estão, e o termo
-- de empresa entra ao lado delas, na classe da escrita
alter policy "leitura operador" on public.termos_gerados
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "operador insere" on public.termos_gerados
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

alter policy "operador atualiza" on public.termos_gerados
  using (
    public.pode_escrever_termo(ativo_ids)
    and empresa_id = any (array (select public.empresas_de_escrita()))
  )
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

alter policy "operador apaga" on public.termos_gerados
  using (
    public.pode_escrever_termo(ativo_ids)
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

-- anotacoes (0070 a leitura, 0072 a escrita)
alter policy "leitura operador" on public.anotacoes
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "operador anota" on public.anotacoes
  with check ((select public.pode_escrever())
              and empresa_id = any (array (select public.empresas_de_escrita())));

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f66-evidencias/impressao-policies.sql: as treze desta migration com o termo; as outras 49 byte a byte como no
--   "antes"; docs/f66-evidencias/impressao-catalogo.sql: o relfilenode das 20 tabelas de negócio IGUAL; e a prova conta a
--   conta REAL do lote (scripts/perf/conta-a-conta.mjs --fase real) com 0 divergência.
--
-- ROLLBACK (supabase/rollback/F66-desfaz.sql, passo 6 — o ÚLTIMO da fase; ordem inversa do apply): cada policy de volta
-- ao texto de antes, por `alter policy` literal (o piso sozinho; em termos_gerados, o texto da 0069). Depois da F73 (uma
-- segunda empresa de verdade) este rollback abre a leitura entre empresas — só roda com o dado da segunda empresa fora.

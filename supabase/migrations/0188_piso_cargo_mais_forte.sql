-- =============================================================================
-- 0188_piso_cargo_mais_forte.sql — F67 (13/11/2026): o cargo SEM empresa vira o PISO — o mais forte entre as memberships
-- =============================================================================
-- classe: ADITIVA (create or replace de uma função, mesma assinatura e grants; nenhuma tabela, policy ou linha)
--
-- `papel_atual()` deixa de ser a PONTE da F62 (o cargo NA EMPRESA LEGADA) e passa a ser o cargo MAIS FORTE entre as
-- memberships ATIVAS de quem chama (conta não arquivada). `e_admin()`, `e_dev()` e `pode_escrever()` derivam dela e não
-- mudam de corpo: viram "admin / dev / escreve EM ALGUMA empresa".
--
-- POR QUE ISTO É SEGURO AGORA (docs/PLAN-F67.md, decisão 2; ADR-002 §17): a partir desta fase o cargo sem empresa só
-- aparece como PISO de policy, SEMPRE em conjunção com o recorte do MESMO cargo — `papel_atual() is not null` com
-- `empresas_do_membro()`, `e_admin()` com `empresas_de_admin()`, `pode_escrever()` com `empresas_de_escrita()`/
-- `unidades_de_escrita()`. A conjunção "admin em alguma empresa" ∧ "esta empresa ∈ as que administro" é EXATAMENTE "admin
-- nesta empresa". Nenhum corpo de função e nenhuma chamada TS o usa mais (a 0186 converteu os corpos; a 0187, as nove
-- policies sem par). Isso REVERTE a frase da 0158 ("nunca pelo cargo mais forte entre empresas"), que existia porque havia
-- consumidor sem par. A trava Q de supabase/tests/cargo_por_empresa.sql impede o consumidor sem par de voltar.
--
-- POR QUE A WAP NÃO PERCEBE: com uma empresa e uma membership por pessoa, "o mais forte entre as memberships ativas" é a
-- membership na WAP — o mesmo valor de antes, para cada conta. A prova é o conta a conta (scripts/perf/conta-a-conta.mjs,
-- fase f67-depois), nos dois bancos, só contagem. E o que muda para quem é SÓ de outra empresa é o 10e invertido de
-- supabase/tests/isolamento_tenant.sql: ele passa a ver o que é DELE (antes não via nada).
--
-- A ORDEM é escrita, não herdada do enum: no Postgres `dev` é o PRIMEIRO label (`add value 'dev' before 'admin'`) e,
-- portanto, o MENOR na comparação de enum — o mesmo sinal que `FORCA` (src/lib/auth/papeis.ts) trata por número.
-- =============================================================================

set lock_timeout = '2s';

create or replace function public.papel_atual()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select m.papel
    from public.membros m
    join public.profiles p on p.id = m.profile_id
   where m.profile_id = (select auth.uid())
     and m.ativo
     and p.excluido_em is null
   order by case m.papel
              when 'dev'      then 0
              when 'admin'    then 1
              when 'operador' then 2
              else 3
            end
   limit 1
$$;

comment on function public.papel_atual() is
  'F67 (era F62/F22/F21): o PISO — o cargo MAIS FORTE de quem chama entre as memberships ATIVAS (conta não arquivada), ou NULL sem sessão, sem membership ativa ou com a conta apagada. Só vale como piso de policy, em conjunção com o recorte do MESMO cargo (empresas_do_membro); o cargo NUMA empresa é papel_na_empresa(p_empresa). Desativação e exclusão valem no request seguinte.';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   Uma assinatura; prosecdef = t; proconfig = {search_path=public}; o md5 do prosrc = o do CI. O conta a conta
--   (--fase f67-depois): papel_atual(), e_admin(), pode_escrever() = o oráculo de antes, 0 divergência, nos dois bancos.
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, depois de recriar as assinaturas antigas e devolver as 0189–0192, e antes
-- de devolver as policies da 0187): reemitir papel_atual() com o corpo da 0158 — a membership na empresa legada. A ponte
-- volta; nenhum dado se perde.

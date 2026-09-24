#!/usr/bin/env node
// ---------------------------------------------------------------------------
// medir-rls.mjs — as FORMAS do predicado de RLS, medidas com a policy no plano (F59)
// ---------------------------------------------------------------------------
// A doutrina do predicado (emenda F59 da docs/MATRIZ-REGRAS.md) diz que a função de
// recorte roda UMA vez por statement quando é consumida como conjunto, e UMA VEZ POR
// LINHA quando recebe a coluna — com ou sem o `(select …)` em volta. Este script mede
// isso no banco de verdade, só leitura, pelo método da migration 0107:
// `explain (analyze, buffers, format json)` COM A RLS VALENDO.
//
//   node scripts/perf/medir-rls.mjs gerar    --alvo ensaio --ref <ref> --canal mcp --dir <fora-do-repo>
//   node scripts/perf/medir-rls.mjs analisar --alvo ensaio --ref <ref> --canal mcp --dir <mesma> \
//        --saida docs/perf/f59-rls-ensaio.json
//   node scripts/perf/medir-rls.mjs gerar-prova --alvo ensaio --ref <ref> --canal mcp --dir <fora-do-repo>
//   node scripts/perf/medir-rls.mjs analisar-prova --alvo ensaio --ref <ref> --dir <mesma> \
//        --saida docs/f59-evidencias/B-forma-alvo-ensaio.json
//
// AS FORMAS, emuladas inline — nada é criado:
//   F0  a leitura com a RLS de hoje (o piso `(select public.papel_atual()) is not null`)
//   F1  por linha ........... where public.pode_escrever_filial(filial_id)
//   F2  falso içamento ...... where (select public.pode_escrever_filial(filial_id))
//   F3  içada ............... where filial_id = any (array (select f.id from public.filiais f
//                                                          where public.pode_escrever_filial(f.id)))
//       (F3 emula `unidades_de_escrita()` sem criá-la: a leitura de `filiais` fica dentro do
//        sub-select, que não olha a linha — o `InitPlan` que a F66 vai ter)
//   F4  a conjunção da F66 . where empresa_id = any (array (select public.empresas_do_membro()))
//       (F66, 24/09/2026: por cima da RLS de HOJE, F4 emula a policy de SELECT da F66 — o piso ∧ o recorte
//        de empresa, a classe da leitura pelo piso (decisão 2 do PLAN-F66). ANTES do apply, F4 é a forma nova
//        EMULADA; DEPOIS, F0 JÁ É a forma nova real, e F4 fica como o termo redundante por cima — F0-depois ×
//        F4-antes é a comparação. A F66 herdou o INSTRUMENTO (decisão 8 do PLAN-F59), não o número.)
//
// O CANAL, nesta ordem (ordem F59, Frente E):
//   mcp — o MCP da Supabase (`execute_sql`). O script NÃO fala com o MCP: ele GRAVA os
//         comandos em `--dir` (fora do repositório); quem opera os executa e grava cada
//         resposta ao lado (`<comando>.resposta.txt`); `analisar` lê as respostas.
//   api — a Management API (`POST /v1/projects/{ref}/database/query`), SÓ se
//         `SUPABASE_ACCESS_TOKEN` já estiver no ambiente do processo. O token não é
//         procurado em lugar nenhum, não é impresso e não é gravado.
//   ⚠ O modo só leitura da Management API (`…/database/query/read-only`) roda como
//   `supabase_read_only_user`, que não troca para `authenticated` — e medir sem trocar de
//   papel é medir sem policy nenhuma (o canal roda como `postgres`, que tem `bypassrls`).
//
// FALHA FECHADA — o que este arquivo recusa ANTES de gravar ou enviar qualquer comando:
//   · `--alvo` fora de ensaio|producao, ou `--ref` que não seja o ref DAQUELE alvo (os refs
//     vêm de `scripts/env-guard.ts`, lidos como texto, como `scripts/formas/conferir.mts`);
//   · comando que não seja um bloco `do $f59$ … $f59$;` terminando em `raise exception`
//     (o bloco NUNCA se confirma: a exceção desfaz a transação);
//   · qualquer palavra de escrita, DDL, grant, copy ou call — e `set_config` fora de
//     `transaction_read_only`, `role` (só `authenticated`) e `request.jwt.claims`.
//   E, DENTRO do bloco, antes da primeira medição: `transaction_read_only = on`, e o banco
//   confirma o alvo — `rotulo_de_ambiente()` = 'desenvolvimento' no ensaio, NULL em produção.
//
// NENHUM DADO REAL SAI DAQUI: a identidade é escolhida DENTRO do banco (perfil ativo, não
// arquivado, do cargo pedido) e o id nunca atravessa o canal. O JSON guarda números, nomes
// de nó, nomes de tabela e rótulos de forma.
//
// O QUE ESTE NÚMERO NÃO PROVA: as formas são EMULADAS no volume de hoje; `empresas_do_membro()`
// não existe, e a F60 (o caminho quente dos relatórios) e a F62 (o que `papel_atual()` lê)
// mudam o que ele mede. A linha de base da F66 é ESTE INSTRUMENTO, re-rodado por ela
// imediatamente antes de mexer nas policies — não os números desta fase.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { lexar } from '../db/predicado-policies.mjs'

const RAIZ = process.cwd()

export const ALVOS = ['ensaio', 'producao']
export const TABELAS = {
  // A projeção imita a lista real do app (`LEITURA_LISTA_ATIVOS` / `LISTA_COLS` de
  // `LEITURA_LISTA_MOVIMENTACOES`, sem os embeds) e NÃO tem `limit`: o custo por linha
  // escala com as linhas examinadas, e a lista ordena antes de cortar.
  ativos:
    'select id, patrimonio, service_tag, categoria, marca, modelo, status, colaborador_atual, updated_at, pendencia, filial_id from public.ativos',
  movimentacoes:
    'select id, tipo, data, created_at, colaborador, setor, observacao, ativo_id, filial_id from public.movimentacoes',
}
export const FORMAS = {
  F0: { descricao: 'a leitura com a RLS de hoje (piso papel_atual)', where: '' },
  F1: { descricao: 'por linha: fn(coluna)', where: ' where public.pode_escrever_filial(filial_id)' },
  F2: { descricao: 'falso içamento: (select fn(coluna))', where: ' where (select public.pode_escrever_filial(filial_id))' },
  F3: {
    descricao: 'içada: col = any (array (select … conjunto …))',
    where: ' where filial_id = any (array (select f.id from public.filiais f where public.pode_escrever_filial(f.id)))',
  },
  F4: {
    descricao: 'a conjunção da F66: RLS de hoje ∧ empresa_id = any (array (select public.empresas_do_membro()))',
    where: ' where empresa_id = any (array (select public.empresas_do_membro()))',
  },
}
export const IDENTIDADES = {
  admin: "m.papel in ('admin', 'dev')",
  operador: "m.papel = 'operador' and exists (select 1 from public.operador_filiais o where o.membro_id = m.id)",
}
const EXPLAIN = 'explain (analyze, buffers, verbose, format json) '

export class Recusa extends Error {}

function recusar(msg) {
  throw new Recusa(`medir-rls: RECUSADO — ${msg}`)
}

// ---------------------------------------------------------------------------
// O alvo
// ---------------------------------------------------------------------------

/** Os refs de `scripts/env-guard.ts`, lidos como texto (nunca copiados aqui). */
export function refsDoEnvGuard(raiz = RAIZ) {
  const fonte = readFileSync(join(raiz, 'scripts', 'env-guard.ts'), 'utf8')
  const ler = (nome) =>
    [...(new RegExp(`${nome}\\s*=\\s*\\[([^\\]]*)\\]`).exec(fonte)?.[1] ?? '').matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1])
  const ensaio = ler('REFS_DE_ENSAIO')
  const producao = ler('REFS_DE_PRODUCAO_CONHECIDOS')
  if (ensaio.length === 0 || producao.length === 0) recusar('não li REFS_DE_ENSAIO/REFS_DE_PRODUCAO_CONHECIDOS de scripts/env-guard.ts.')
  return { ensaio, producao }
}

/** Confere `--alvo` e `--ref` por PERMISSÃO: o ref tem de ser exatamente um ref daquele alvo. */
export function validarAlvo(alvo, ref, refs = refsDoEnvGuard()) {
  if (!alvo) recusar('--alvo é obrigatório (ensaio|producao).')
  if (!ALVOS.includes(alvo)) recusar(`--alvo "${alvo}" não existe — só ensaio|producao.`)
  if (!ref) recusar('--ref é obrigatório: o ref do projeto em que o canal vai executar.')
  const permitidos = alvo === 'ensaio' ? refs.ensaio : refs.producao
  if (!permitidos.includes(ref)) recusar(`o ref do canal não é o do alvo ${alvo} — nada é gerado nem enviado.`)
  return { alvo, ref }
}

// ---------------------------------------------------------------------------
// Os comandos — modelo FECHADO
// ---------------------------------------------------------------------------

/** O bloco de medição de UMA tabela × UMA identidade (as quatro formas intercaladas). */
export function comandoMedicao({ alvo, tabela, identidade, n }) {
  if (!ALVOS.includes(alvo)) recusar(`alvo ${alvo}`)
  if (!TABELAS[tabela]) recusar(`tabela fora do modelo: ${tabela}`)
  if (!IDENTIDADES[identidade]) recusar(`identidade fora do modelo: ${identidade}`)
  if (!Number.isInteger(n) || n < 7 || n > 31) recusar('--n precisa ser inteiro entre 7 e 31.')
  const formas = Object.keys(FORMAS)
  const sqls = formas.map((f) => `'${TABELAS[tabela]}${FORMAS[f].where}'`).join(',\n    ')
  return `do $f59$
declare
  v_alvo   constant text := '${alvo}';
  v_ident  constant text := '${identidade}';
  v_tabela constant text := '${tabela}';
  v_n      constant int  := ${n};
  v_formas constant text[] := array[${formas.map((f) => `'${f}'`).join(', ')}];
  v_sql    constant text[] := array[
    ${sqls}
  ];
  v_rotulo   text;
  v_uid      uuid;
  v_total    bigint;
  v_esperado bigint;
  v_negativo bigint;
  v_plano    json;
  v_p        jsonb;
  v_amostras jsonb := '{}';
  v_nos      jsonb := '{}';
  v_i        int;
  v_k        int;
-- 0. nada nesta transação grava; e ela nunca se confirma (termina em raise exception)
begin
  perform set_config('transaction_read_only', 'on', true);

  -- 1. o BANCO confirma o alvo, antes de qualquer medição
  v_rotulo := public.rotulo_de_ambiente();
  if (v_alvo = 'ensaio' and v_rotulo is distinct from 'desenvolvimento')
     or (v_alvo = 'producao' and v_rotulo is not null) then
    raise exception 'F59_ALVO_RECUSADO alvo=% rotulo=%', v_alvo, coalesce(v_rotulo, '(null)');
  end if;

  -- 2. a identidade, escolhida DENTRO do banco — o id não sai daqui
  select p.id into v_uid
    from public.profiles p
    join public.membros m on m.profile_id = p.id and m.empresa_id = public.empresa_legada()
   where m.ativo and p.excluido_em is null and ${IDENTIDADES[identidade]}
   order by p.id
   limit 1;
  if v_uid is null then
    raise exception 'F59_IDENTIDADE_AUSENTE identidade=% alvo=%', v_ident, v_alvo;
  end if;

  -- 3. as contagens esperadas, como o dono, com as claims da identidade
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  execute format('select count(*) from public.%I', v_tabela) into v_total;
  execute format('select count(*) from public.%I t where public.pode_escrever_filial(t.filial_id)', v_tabela) into v_esperado;

  -- 4. a RLS VALE: como authenticated e SEM identidade, a policy devolve zero linhas
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute format('select count(*) from public.%I', v_tabela) into v_negativo;

  -- 5. a medição, como authenticated COM a identidade
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  for v_k in 1 .. array_length(v_formas, 1) loop
    execute '${EXPLAIN}' || v_sql[v_k] into v_plano;
  end loop;
  for v_i in 1 .. v_n loop
    for v_k in 1 .. array_length(v_formas, 1) loop
      execute '${EXPLAIN}' || v_sql[v_k] into v_plano;
      v_p := v_plano::jsonb -> 0;
      v_amostras := jsonb_set(v_amostras, array[v_formas[v_k]],
        coalesce(v_amostras -> v_formas[v_k], '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'exec', v_p -> 'Execution Time',
          'plan', v_p -> 'Planning Time',
          'custo', v_p #> '{Plan,Total Cost}',
          'linhas', v_p #> '{Plan,Actual Rows}',
          'hit', v_p #> '{Plan,Shared Hit Blocks}',
          'read', v_p #> '{Plan,Shared Read Blocks}')));
      if v_i = 1 then
        v_nos := jsonb_set(v_nos, array[v_formas[v_k]], jsonb_build_object(
          'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"'),
          'subplanos', jsonb_path_query_array(v_p, 'strict $.** ? (exists (@."Subplan Name"))."Subplan Name"'),
          'loops_subplanos', jsonb_path_query_array(v_p, 'strict $.** ? (exists (@."Subplan Name"))."Actual Loops"'),
          'relacoes_com_a_funcao_no_filtro',
            jsonb_path_query_array(v_p, 'strict $.** ? (@."Filter" like_regex "pode_escrever_filial")."Relation Name"'),
          'filtro_por_subplano', jsonb_path_exists(v_p, 'strict $.** ? (@."Filter" like_regex "SubPlan")'),
          'piso_rls_no_plano', jsonb_path_exists(v_p, 'strict $.**."Output"[*] ? (@ like_regex "papel_atual")')));
      end if;
    end loop;
  end loop;

  raise exception 'F59_MEDICAO %', jsonb_build_object(
    '_canal', repeat('.', 120000),
    'alvo', v_alvo, 'tabela', v_tabela, 'identidade', v_ident, 'n', v_n,
    'postgres', current_setting('server_version'), 'papel_na_medicao', current_user,
    'total', v_total, 'esperado_f1_f3', v_esperado, 'controle_negativo', v_negativo,
    'amostras', v_amostras, 'nos', v_nos);
end $f59$;`
}

/** O bloco da PROVA da forma-alvo (fato 21 da ordem F59): vazio, NULL e pares. Só ensaio. */
export function comandoProvaFormaAlvo({ alvo }) {
  if (alvo !== 'ensaio') recusar('a prova da forma-alvo roda só no ensaio (ordem F59, Frente B).')
  const casos = [
    ['setof-cheio', 'filial_id = any (array (select f.id from public.filiais f))'],
    ['setof-vazio', "filial_id = any (array (select x from unnest('{}'::smallint[]) x))"],
    ['setof-null', 'filial_id = any (array (select x from unnest(null::smallint[]) x))'],
    ['setof-elemento-null', "filial_id = any (array (select x from unnest('{NULL}'::smallint[]) x))"],
    ['uuid-array-cheio', "id = any (array (select '{00000000-0000-0000-0000-000000000000}'::uuid[]))"],
    ['uuid-array-vazio', "id = any (array (select '{}'::uuid[]))"],
    ['uuid-array-null', 'id = any (array (select null::uuid[]))'],
    ['uuid-array-cast-vazio', "id = any ((select '{}'::uuid[])::uuid[])"],
    ['uuid-array-cast-null', 'id = any ((select null::uuid[])::uuid[])'],
    ['pares-no-where', '(filial_id, filial_id) in (select f.id, f.id from public.filiais f where public.pode_escrever_filial(f.id))'],
    ['pares-sem-pull-up', 'false or (filial_id, filial_id) in (select f.id, f.id from public.filiais f where public.pode_escrever_filial(f.id))'],
    ['pares-vazio', "(id, filial_id) in (select u.e, u.f from unnest('{}'::uuid[], '{}'::smallint[]) as u (e, f))"],
    ['pares-null', '(id, filial_id) in (select u.e, u.f from unnest(null::uuid[], null::smallint[]) as u (e, f))'],
  ]
  const valores = casos.map(([c, w]) => `('${c}', ${literal(`select count(*) from public.ativos where ${w}`)})`).join(',\n    ')
  return `do $f59$
declare
  v_alvo   constant text := '${alvo}';
  v_rotulo text;
  v_uid    uuid;
  v_caso   record;
  v_plano  json;
  v_p      jsonb;
  v_res    jsonb := '{}';
  v_total  bigint;
begin
  perform set_config('transaction_read_only', 'on', true);
  v_rotulo := public.rotulo_de_ambiente();
  if v_rotulo is distinct from 'desenvolvimento' then
    raise exception 'F59_ALVO_RECUSADO alvo=% rotulo=%', v_alvo, coalesce(v_rotulo, '(null)');
  end if;
  select p.id into v_uid
    from public.profiles p
    join public.membros m on m.profile_id = p.id and m.empresa_id = public.empresa_legada()
   where m.ativo and p.excluido_em is null and ${IDENTIDADES.admin}
   order by p.id
   limit 1;
  if v_uid is null then
    raise exception 'F59_IDENTIDADE_AUSENTE identidade=admin alvo=%', v_alvo;
  end if;
  execute format('select count(*) from public.%I', 'ativos') into v_total;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  for v_caso in select * from (values
    ${valores}
  ) as c (caso, consulta) loop
    begin
      execute '${EXPLAIN}' || v_caso.consulta into v_plano;
      v_p := v_plano::jsonb -> 0;
      v_res := v_res || jsonb_build_object(v_caso.caso, jsonb_build_object(
        'erro', null,
        'linhas_contadas', jsonb_path_query_first(v_p, 'strict $.Plan.Plans[*] ? (@."Parent Relationship" == "Outer")."Actual Rows"'),
        'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"'),
        'subplanos', jsonb_path_query_array(v_p, 'strict $.** ? (exists (@."Subplan Name"))."Subplan Name"'),
        'loops_subplanos', jsonb_path_query_array(v_p, 'strict $.** ? (exists (@."Subplan Name"))."Actual Loops"'),
        'custo', v_p #> '{Plan,Total Cost}'));
    exception when others then
      v_res := v_res || jsonb_build_object(v_caso.caso, jsonb_build_object('erro', sqlstate || ' ' || sqlerrm));
    end;
  end loop;
  raise exception 'F59_PROVA %', jsonb_build_object(
    'alvo', v_alvo, 'postgres', current_setting('server_version'), 'papel_na_prova', current_user,
    'total_ativos', v_total, 'casos', v_res);
end $f59$;`
}

/**
 * AS CINCO LISTAS DA F66 (PLAN-F66 §3.2): a projeção e a ordenação de cada tela, SEM filtro de empresa — é a consulta
 * que o app faz hoje, e a policy REAL decide. O modo `listas` confirma nos bancos vivos o que a mesa mediu: sob a
 * policy da F66, o nó de cada lista é o de antes (nenhum Sort novo) e as funções de conjunto são InitPlan de 1 loop.
 */
export const LISTAS = {
  movimentacoes: 'select id, tipo, data, created_at, ativo_id, filial_id from public.movimentacoes order by data desc, ordem desc limit 50 offset 0',
  ativos: 'select id, patrimonio, updated_at from public.ativos order by updated_at desc, id asc limit 50',
  lancamentos_item: 'select id, item_id, filial_id, tipo, created_at from public.lancamentos_item order by created_at desc, id desc limit 50',
  eventos_admin: 'select id, quando, acao from public.eventos_admin order by quando desc, id desc limit 50',
  import_logs: 'select id, filial_id, created_at from public.import_logs order by created_at desc limit 50',
}

/** O bloco do modo `listas` (F66): o plano das cinco listas como authenticated, com a identidade de admin. */
export function comandoListas({ alvo }) {
  if (!ALVOS.includes(alvo)) recusar(`alvo ${alvo}`)
  const nomes = Object.keys(LISTAS)
  const sqls = nomes.map((l) => `'${LISTAS[l]}'`).join(',\n    ')
  return `do $f59$
declare
  v_alvo   constant text := '${alvo}';
  v_listas constant text[] := array[${nomes.map((l) => `'${l}'`).join(', ')}];
  v_sql    constant text[] := array[
    ${sqls}
  ];
  v_rotulo text;
  v_uid    uuid;
  v_plano  json;
  v_p      jsonb;
  v_res    jsonb := '{}';
  v_i      int;
  v_k      int;
-- 0. nada nesta transação grava; e ela nunca se confirma (termina em raise exception)
begin
  perform set_config('transaction_read_only', 'on', true);

  -- 1. o BANCO confirma o alvo
  v_rotulo := public.rotulo_de_ambiente();
  if (v_alvo = 'ensaio' and v_rotulo is distinct from 'desenvolvimento')
     or (v_alvo = 'producao' and v_rotulo is not null) then
    raise exception 'F59_ALVO_RECUSADO alvo=% rotulo=%', v_alvo, coalesce(v_rotulo, '(null)');
  end if;

  -- 2. a identidade de nível administrador, escolhida DENTRO do banco — o id não sai daqui
  select p.id into v_uid
    from public.profiles p
    join public.membros m on m.profile_id = p.id and m.empresa_id = public.empresa_legada()
   where m.ativo and p.excluido_em is null and ${IDENTIDADES.admin}
   order by p.id
   limit 1;
  if v_uid is null then
    raise exception 'F59_IDENTIDADE_AUSENTE identidade=admin alvo=%', v_alvo;
  end if;

  -- 3. como authenticated COM a identidade: 1 aquecimento por lista, e o plano da 3ª repetição
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  for v_i in 1 .. 3 loop
    for v_k in 1 .. array_length(v_listas, 1) loop
      execute '${EXPLAIN}' || v_sql[v_k] into v_plano;
      if v_i = 3 then
        v_p := v_plano::jsonb -> 0;
        v_res := v_res || jsonb_build_object(v_listas[v_k], jsonb_build_object(
          'exec', v_p -> 'Execution Time',
          'linhas', v_p #> '{Plan,Actual Rows}',
          'hit', v_p #> '{Plan,Shared Hit Blocks}',
          'read', v_p #> '{Plan,Shared Read Blocks}',
          'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"'),
          'indices', jsonb_path_query_array(v_p, 'strict $.**."Index Name"'),
          'sort', jsonb_path_exists(v_p, 'strict $.** ? (@."Node Type" like_regex "Sort")'),
          'subplanos', jsonb_path_query_array(v_p, 'strict $.** ? (exists (@."Subplan Name"))."Subplan Name"'),
          'loops_subplanos', jsonb_path_query_array(v_p, 'strict $.** ? (exists (@."Subplan Name"))."Actual Loops"')));
      end if;
    end loop;
  end loop;

  raise exception 'F59_LISTAS %', jsonb_build_object(
    '_canal', repeat('.', 120000),
    'alvo', v_alvo, 'postgres', current_setting('server_version'), 'papel_na_medicao', current_user,
    'listas', v_res);
end $f59$;`
}

function literal(s) {
  return `'${s.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------------------
// A guarda — roda sobre TODO comando antes de ele sair do processo
// ---------------------------------------------------------------------------

const PROIBIDAS = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'create', 'alter', 'drop', 'grant', 'revoke',
  'copy', 'call', 'vacuum', 'refresh', 'reindex', 'cluster', 'lock', 'comment', 'listen', 'notify',
  'commit', 'rollback', 'savepoint', 'prepare', 'deallocate', 'discard', 'load', 'import', 'security',
  'reassign', 'checkpoint', 'set', 'reset', 'analyse', 'do',
]
const GUCS_PERMITIDOS = ['transaction_read_only', 'role', 'request.jwt.claims']

/**
 * As ÚNICAS funções que um comando do modelo chama. Revisão adversarial da F59: sem esta
 * lista, `perform public.resetar_acervo(…)` ou `select pg_advisory_lock(…)` passavam — nenhuma
 * palavra proibida, e a transação só leitura não segura um lock de sessão. Função fora da
 * lista recusa, pelo NOME (o último, sem schema).
 */
const FUNCOES_PERMITIDAS = new Set([
  'set_config', 'current_setting', 'rotulo_de_ambiente', 'pode_escrever_filial',
  // F62: a identidade é escolhida pela membership da empresa legada (profiles.papel congelou).
  'empresa_legada',
  // F66: a forma F4 (o recorte de leitura da F66, emulado por cima da RLS de hoje).
  'empresas_do_membro',
  'json_build_object', 'jsonb_build_object', 'jsonb_build_array', 'jsonb_set',
  'jsonb_path_query_array', 'jsonb_path_query_first', 'jsonb_path_exists',
  'coalesce', 'array_length', 'format', 'count', 'unnest',
  // F66: o ENCHIMENTO do canal ('_canal' no payload) — o MCP devolve inline a resposta pequena e grava em arquivo a
  // grande; com ele a resposta cai em arquivo e a medição é EXTRAÍDA dele, nunca transcrita. A análise o ignora.
  'repeat',
])
/**
 * Os ÚNICOS `execute` que um comando do modelo tem — o texto exato, espaço normalizado.
 * Re-revisão adversarial da F59: conferir só o prefixo (`format('select`) deixava passar
 * `execute format('select * into sombra from …')`, que cria tabela sem palavra proibida.
 */
const EXECUTES_PERMITIDOS = new Set(
  [
    "execute format('select count(*) from public.%I', v_tabela) into v_total;",
    "execute format('select count(*) from public.%I t where public.pode_escrever_filial(t.filial_id)', v_tabela) into v_esperado;",
    "execute format('select count(*) from public.%I', v_tabela) into v_negativo;",
    `execute '${EXPLAIN}' || v_sql[v_k] into v_plano;`,
    "execute format('select count(*) from public.%I', 'ativos') into v_total;",
    `execute '${EXPLAIN}' || v_caso.consulta into v_plano;`,
  ].map((s) => s.replace(/\s+/g, ' ')),
)
/** Palavras que não podem aparecer no SQL DENTRO dos literais (o que o `execute` roda). */
const PROIBIDAS_EM_LITERAL = ['into', 'for', 'share', 'nowait']

/** Palavras que abrem parêntese sem serem chamada de função. */
const ABREM_PARENTESE = new Set([
  'if', 'elsif', 'or', 'and', 'not', 'in', 'any', 'all', 'some', 'exists', 'array', 'values', 'explain',
  'when', 'then', 'else', 'over', 'filter', 'using', 'into', 'select', 'from', 'where', 'on', 'is', 'case',
  'return', 'loop', 'begin', 'end', 'perform', 'raise', 'declare', 'with', 'lateral', 'exception', 'by',
])

/**
 * As palavras de CÓDIGO de um trecho SQL — comentário fora, e o SQL de dentro de cada literal
 * DENTRO (é o que o `execute` roda). Usa o léxico da trava de mesa, que respeita literal,
 * identificador entre aspas e `$tag$`: tirar comentário por regex deixaria um `--` dentro de
 * literal esconder o resto da linha.
 */
function palavrasDeCodigo(sql, profundidade = 0) {
  let lexado
  try {
    lexado = lexar(sql)
  } catch (err) {
    recusar(`o comando não é SQL legível: ${err.message}`)
  }
  const palavras = []
  const chamadas = []
  const tk = lexado.tokens
  tk.forEach((t, i) => {
    if (t.tipo === 'ident' || t.tipo === 'qident') {
      palavras.push(t.v)
      if (profundidade > 0 && PROIBIDAS_EM_LITERAL.includes(t.v)) {
        recusar(`palavra "${t.v}" no SQL de dentro de um literal — o que o execute roda é só leitura, sem into/for.`)
      }
      const abre = tk[i + 1]?.tipo === 'punct' && tk[i + 1].v === '('
      const depoisDeAs = tk[i - 1]?.tipo === 'ident' && tk[i - 1].v === 'as'
      if (abre && !depoisDeAs && !(t.tipo === 'ident' && ABREM_PARENTESE.has(t.v))) chamadas.push(t.v)
    } else if (t.tipo === 'dollar') {
      recusar('bloco $…$ aninhado dentro do comando.')
    } else if (t.tipo === 'str' && t.v !== EXPLAIN && profundidade < 2) {
      const dentro = palavrasDeCodigo(t.v, profundidade + 1)
      palavras.push(...dentro.palavras)
      chamadas.push(...dentro.chamadas)
    }
  })
  return { palavras, chamadas, comentarios: lexado.comentarios }
}

/**
 * Recusa o comando que não seja um bloco de medição só leitura. Devolve o comando se passar.
 * @param {string} sql
 */
export function validarComando(sql) {
  if (typeof sql !== 'string' || sql.length === 0) recusar('comando vazio.')
  const t = sql.trim()
  if (!t.startsWith('do $f59$') || !t.endsWith('end $f59$;')) recusar('comando fora do modelo (do $f59$ … end $f59$;).')
  if (t.split('$f59$').length !== 3) recusar('delimitador $f59$ repetido — um segundo bloco escondido.')
  const corpo = t.slice('do $f59$'.length, t.length - '$f59$;'.length)
  const { palavras, chamadas, comentarios } = palavrasDeCodigo(corpo)
  // o corpo com os comentários apagados (mesmas posições), para as conferências por forma
  const codigo = corpo.split('')
  for (const [a, b] of comentarios) for (let k = a; k < b; k++) codigo[k] = ' '
  const semComentario = codigo.join('')

  if (!/\bbegin\s+perform set_config\('transaction_read_only', 'on', true\);/.test(semComentario)) {
    recusar('o bloco não liga transaction_read_only antes de tudo.')
  }
  if (!/raise exception 'F59_(MEDICAO|PROVA|LISTAS) %', jsonb_build_object\([\s\S]*\);\s*end\s*$/.test(semComentario)) {
    recusar('o bloco não termina em raise exception — ele poderia se confirmar.')
  }
  for (const p of PROIBIDAS) {
    if (palavras.includes(p)) recusar(`palavra proibida no comando: "${p}".`)
  }
  if (palavras.includes('analyze')) recusar('"analyze" fora do explain do modelo.')
  for (const f of chamadas) {
    if (!FUNCOES_PERMITIDAS.has(f)) recusar(`chamada a função fora do modelo: "${f}(…)".`)
  }
  const porGuc = new Map()
  for (const m of semComentario.matchAll(/set_config\(\s*'([^']+)'\s*,\s*([^,]+),/g)) {
    if (!GUCS_PERMITIDOS.includes(m[1])) recusar(`set_config de "${m[1]}" fora da lista permitida.`)
    if (m[1] === 'role' && m[2].trim() !== "'authenticated'") recusar('troca de papel para outro que não authenticated.')
    if (m[1] === 'transaction_read_only' && m[2].trim() !== "'on'") recusar('transaction_read_only com valor que não é on.')
    porGuc.set(m[1], (porGuc.get(m[1]) ?? 0) + 1)
  }
  if (porGuc.get('transaction_read_only') !== 1) recusar('transaction_read_only ligado mais de uma vez — ou nenhuma.')
  if ((porGuc.get('role') ?? 0) > 1) recusar('troca de papel mais de uma vez.')
  const chamadasSetConfig = palavras.filter((p) => p === 'set_config').length
  if (chamadasSetConfig !== [...semComentario.matchAll(/set_config\(\s*'[^']+'\s*,/g)].length) {
    recusar('set_config com nome de parâmetro que não é literal.')
  }
  const executes = [...semComentario.matchAll(/\bexecute\b[\s\S]*?;/g)].map((m) => m[0].replace(/\s+/g, ' '))
  for (const e of executes) {
    if (!EXECUTES_PERMITIDOS.has(e)) recusar(`execute fora do modelo: "${e.slice(0, 120)}".`)
  }
  if (palavras.filter((p) => p === 'execute').length !== executes.length) recusar('execute fora do modelo.')

  // Por último, o FECHO: o comando tem de ser, byte a byte, o que este script gera para os
  // parâmetros que ele declara. Terceira rodada adversarial da F59: as checagens acima
  // olham vocabulário e forma, e trocar a tabela de `v_tabela`, o SQL de `v_sql` ou a
  // cláusula que escolhe a identidade passava. As checagens específicas vêm ANTES para que
  // cada recusa diga o motivo; esta garante que não sobre nada fora do modelo.
  if (!ehComandoDoModelo(t)) recusar('o comando não é, byte a byte, um comando que este script gera.')
  return sql
}

function ehComandoDoModelo(t) {
  const alvo = /v_alvo\s+constant text := '([a-z]+)';/.exec(t)?.[1]
  try {
    if (/raise exception 'F59_PROVA %'/.test(t)) return t === comandoProvaFormaAlvo({ alvo }).trim()
    if (/raise exception 'F59_LISTAS %'/.test(t)) return t === comandoListas({ alvo }).trim()
    const tabela = /v_tabela constant text := '([a-z_]+)';/.exec(t)?.[1]
    const identidade = /v_ident\s+constant text := '([a-z]+)';/.exec(t)?.[1]
    const n = Number(/v_n\s+constant int\s+:= (\d+);/.exec(t)?.[1])
    return t === comandoMedicao({ alvo, tabela, identidade, n }).trim()
  } catch {
    return false
  }
}

/**
 * Emite a fila de comandos: valida TODOS antes de gravar ou enviar o primeiro.
 * @param {{ nome: string, sql: string }[]} fila
 * @param {{ canal: 'mcp'|'api', dir: string, ref: string, fetchImpl?: typeof fetch }} opcoes
 */
export async function emitir(fila, { canal, dir, ref, fetchImpl = globalThis.fetch }) {
  for (const c of fila) validarComando(c.sql)
  validarDirFora(dir)
  mkdirSync(dir, { recursive: true })
  if (canal === 'mcp') {
    for (const c of fila) writeFileSync(join(dir, `${c.nome}.sql`), c.sql)
    return { canal, gravados: fila.map((c) => `${c.nome}.sql`) }
  }
  if (canal === 'api') {
    const token = process.env.SUPABASE_ACCESS_TOKEN
    if (!token) recusar('canal api sem SUPABASE_ACCESS_TOKEN no ambiente do processo — o token não é procurado em outro lugar.')
    for (const c of fila) {
      const r = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: c.sql }),
      })
      const texto = (await r.text()).split(token).join('***')
      writeFileSync(join(dir, `${c.nome}.resposta.txt`), texto)
    }
    return { canal, enviados: fila.map((c) => c.nome) }
  }
  recusar(`--canal "${canal}" não existe — só mcp|api.`)
}

function validarDirFora(dir) {
  if (!dir) recusar('--dir é obrigatório (fora do repositório).')
  const abs = resolve(dir)
  const rel = relative(RAIZ, abs)
  if (!rel.startsWith('..') && !isAbsolute(rel)) recusar('--dir dentro do repositório — comandos e respostas moram FORA dele.')
}

// ---------------------------------------------------------------------------
// A análise
// ---------------------------------------------------------------------------

/** O payload `F59_MEDICAO {…}` / `F59_PROVA {…}` dentro da resposta gravada do canal. */
export function lerPayload(texto, marca) {
  let msg = texto
  try {
    const j = JSON.parse(texto)
    msg = j?.error?.message ?? j?.message ?? texto
  } catch {
    // não era JSON: a resposta foi gravada como texto puro
  }
  const recusa = /F59_(ALVO_RECUSADO|IDENTIDADE_AUSENTE)[^\n"]*/.exec(msg)
  if (recusa) return { recusa: recusa[0] }
  const i = msg.indexOf(`${marca} {`)
  if (i === -1) recusar(`resposta sem ${marca} — o bloco não chegou ao fim.`)
  const inicio = i + marca.length + 1
  let prof = 0
  for (let k = inicio; k < msg.length; k++) {
    if (msg[k] === '{') prof++
    else if (msg[k] === '}') {
      prof--
      if (prof === 0) return JSON.parse(msg.slice(inicio, k + 1))
    }
  }
  recusar(`${marca} truncado na resposta.`)
}

/** Mediana e p95 por posto mais próximo (com N = 9, o p95 é a maior amostra — declarado). */
export function estatistica(valores) {
  const v = [...valores].sort((a, b) => a - b)
  const posto = (q) => v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)]
  const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  const r = (x) => Math.round(x * 1000) / 1000
  return { mediana: r(med), p95: r(posto(0.95)), min: r(v[0]), max: r(v.at(-1)), n: v.length }
}

export function resumirMedicao(payload) {
  const celulas = []
  for (const forma of Object.keys(FORMAS)) {
    const a = payload.amostras[forma] ?? []
    const linhas = [...new Set(a.map((x) => x.linhas))]
    // F0 e F4 leem a tabela inteira (uma empresa só: o recorte é inerte); F1–F3, o que a filial deixa
    const esperado = forma === 'F0' || forma === 'F4' ? payload.total : payload.esperado_f1_f3
    celulas.push({
      tabela: payload.tabela,
      identidade: payload.identidade,
      forma,
      descricao: FORMAS[forma].descricao,
      execucao_ms: estatistica(a.map((x) => x.exec)),
      planejamento_ms: estatistica(a.map((x) => x.plan)),
      custo_total_estimado: estatistica(a.map((x) => x.custo)).mediana,
      buffers_raiz: { hit_mediana: estatistica(a.map((x) => x.hit)).mediana, read_mediana: estatistica(a.map((x) => x.read)).mediana },
      linhas_devolvidas: linhas.length === 1 ? linhas[0] : linhas,
      linhas_esperadas: esperado,
      linhas_conferem: linhas.length === 1 && linhas[0] === esperado,
      nos: payload.nos[forma],
    })
  }
  return {
    celulas,
    rls: {
      tabela: payload.tabela,
      identidade: payload.identidade,
      papel_na_medicao: payload.papel_na_medicao,
      controle_negativo_linhas: payload.controle_negativo,
      piso_no_plano_em_todas_as_formas: Object.keys(FORMAS).every((f) => payload.nos[f]?.piso_rls_no_plano === true),
      vale: payload.controle_negativo === 0 && payload.papel_na_medicao === 'authenticated',
    },
    postgres: payload.postgres,
    n: payload.n,
  }
}

function shaDoCodigo() {
  try {
    return execSync('git rev-parse HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// A linha de comando
// ---------------------------------------------------------------------------

function args(argv) {
  const [modo, ...resto] = argv
  const o = { modo }
  for (let i = 0; i < resto.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(resto[i])
    if (!m) recusar(`argumento não reconhecido: ${resto[i]}`)
    o[m[1]] = m[2] ?? resto[++i]
  }
  return o
}

async function main() {
  const o = args(process.argv.slice(2))
  if (!['gerar', 'analisar', 'gerar-prova', 'analisar-prova', 'gerar-listas', 'analisar-listas'].includes(o.modo)) {
    recusar('modo: gerar | analisar | gerar-prova | analisar-prova | gerar-listas | analisar-listas.')
  }
  const { alvo, ref } = validarAlvo(o.alvo, o.ref)
  const canal = o.canal ?? 'mcp'
  const identidades = (o.identidades ?? 'admin,operador').split(',')
  const tabelas = (o.tabelas ?? 'ativos,movimentacoes').split(',')
  const n = Number(o.n ?? 9)

  if (o.modo === 'gerar') {
    const fila = []
    for (const tabela of tabelas) {
      for (const identidade of identidades) {
        fila.push({ nome: `${alvo}-${tabela}-${identidade}`, sql: comandoMedicao({ alvo, tabela, identidade, n }) })
      }
    }
    const r = await emitir(fila, { canal, dir: o.dir, ref })
    console.log(JSON.stringify({ alvo, canal, ...r }, null, 2))
    return
  }
  if (o.modo === 'gerar-listas') {
    const r = await emitir([{ nome: `${alvo}-listas`, sql: comandoListas({ alvo }) }], { canal, dir: o.dir, ref })
    console.log(JSON.stringify({ alvo, canal, ...r }, null, 2))
    return
  }
  if (o.modo === 'gerar-prova') {
    const r = await emitir([{ nome: `${alvo}-prova-forma-alvo`, sql: comandoProvaFormaAlvo({ alvo }) }], { canal, dir: o.dir, ref })
    console.log(JSON.stringify({ alvo, canal, ...r }, null, 2))
    return
  }

  validarDirFora(o.dir)
  if (!o.saida) recusar('--saida é obrigatório na análise.')
  if (o.modo === 'analisar-listas') {
    const arq = join(o.dir, `${alvo}-listas.resposta.txt`)
    const p = lerPayload(readFileSync(arq, 'utf8'), 'F59_LISTAS')
    if (p.recusa) recusar(`o banco recusou: ${p.recusa}`)
    delete p._canal
    const saida = {
      rotulo: o.rotulo ?? `f66-listas-${alvo}`,
      alvo,
      canal,
      sha_codigo: shaDoCodigo(),
      gerado_em: new Date().toISOString(),
      metodo:
        'explain (analyze, buffers, verbose, format json) das cinco listas (LISTAS), como authenticated com a identidade de ' +
        'nível administrador escolhida no banco; 2 aquecimentos, o plano da 3ª; transaction_read_only = on; raise exception no fim.',
      ...p,
    }
    writeFileSync(join(RAIZ, o.saida), JSON.stringify(saida, null, 2) + '\n')
    console.log(`gravado ${o.saida}`)
    return
  }
  if (o.modo === 'analisar-prova') {
    const arq = join(o.dir, `${alvo}-prova-forma-alvo.resposta.txt`)
    const p = lerPayload(readFileSync(arq, 'utf8'), 'F59_PROVA')
    const saida = { rotulo: 'f59-forma-alvo', alvo, canal, sha_codigo: shaDoCodigo(), gerado_em: new Date().toISOString(), ...p }
    writeFileSync(join(RAIZ, o.saida), JSON.stringify(saida, null, 2) + '\n')
    console.log(`gravado ${o.saida}`)
    return
  }

  const celulas = []
  const rls = []
  const pendencias = []
  let postgres = null
  const respostas = existsSync(o.dir) ? readdirSync(o.dir).filter((f) => f.startsWith(`${alvo}-`) && f.endsWith('.resposta.txt')) : []
  for (const tabela of tabelas) {
    for (const identidade of identidades) {
      const nome = `${alvo}-${tabela}-${identidade}.resposta.txt`
      if (!respostas.includes(nome)) {
        pendencias.push({ tabela, identidade, motivo: 'sem resposta gravada do canal' })
        continue
      }
      const p = lerPayload(readFileSync(join(o.dir, nome), 'utf8'), 'F59_MEDICAO')
      if (p.recusa) {
        pendencias.push({ tabela, identidade, motivo: p.recusa })
        continue
      }
      if (p.alvo !== alvo || p.tabela !== tabela || p.identidade !== identidade) recusar(`resposta ${nome} não corresponde ao comando.`)
      const r = resumirMedicao(p)
      celulas.push(...r.celulas)
      rls.push(r.rls)
      postgres = r.postgres
    }
  }
  const saida = {
    rotulo: o.rotulo ?? `f59-rls-${alvo}`,
    alvo,
    canal: canal === 'mcp' ? 'MCP da Supabase (execute_sql), bloco do … raise exception' : 'Management API (database/query)',
    sha_codigo: shaDoCodigo(),
    gerado_em: new Date().toISOString(),
    metodo:
      `explain (analyze, buffers, verbose, format json), 1 aquecimento por forma, N=${n} repetições intercaladas F0→${Object.keys(FORMAS).at(-1)}; ` +
      'como authenticated com request.jwt.claims da identidade escolhida no banco; transaction_read_only = on; o bloco termina em raise exception; ' +
      'mediana e p95 por posto mais próximo (com N=9 o p95 é a maior amostra); buffers do nó raiz.',
    postgres,
    celulas,
    rls,
    pendencias,
  }
  writeFileSync(join(RAIZ, o.saida), JSON.stringify(saida, null, 2) + '\n')
  console.log(`gravado ${o.saida}: ${celulas.length} células, ${pendencias.length} pendência(s)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Recusa ? err.message : `medir-rls: ERRO — ${err.message}`)
    process.exit(1)
  })
}

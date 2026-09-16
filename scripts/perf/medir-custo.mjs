#!/usr/bin/env node
// ---------------------------------------------------------------------------
// medir-custo.mjs — a linha de base do CUSTO do lote 1 da F60 (Frente B), no
// molde de scripts/perf/medir-rls.mjs: EMITE blocos SQL para arquivos .sql;
// quem opera executa cada um no MCP (execute_sql, produção) e grava a resposta
// integral ao lado (<nome>.resposta.txt); `analisar` lê as respostas e produz
// o JSON final. Este script NUNCA fala com o MCP.
//
// Cada bloco é `do $f60$ … end $f60$;`: a PRIMEIRA instrução liga
// transaction_read_only; a transação NUNCA se confirma (termina em
// `raise exception 'F60_MEDICAO %', <jsonb>`); o alvo é confirmado PELO BANCO
// (`rotulo_de_ambiente() is null` = produção); a identidade (quando o bloco
// simula o app) é escolhida DENTRO do banco e nunca sai; a filial de recorte
// (quando precisa) também é escolhida dentro do banco e sai só como RÓTULO
// ('filial_a'/'filial_b'), nunca como id.
//
// Os blocos B7/B8 (índices e tamanhos) são METADADOS DE CATÁLOGO, não leitura
// de negócio sob RLS — não vestem `authenticated` (pg_stat_statements de OUTRO
// papel não seria visível sob esse papel; pg_stat_user_indexes/pg_*_size são
// de leitura livre). Continuam só-leitura e terminam em raise exception.
//
// PROVENIÊNCIA — este é o gerador que produziu `docs/perf/f60-producao-antes-custo.json`
// (PLAN-F60 §3.5, blocos B1–B8), versionado no lote 1 da F60. O original rodou FORA do
// repositório: 33.353 bytes, sha256 (LF)
// `3c42d047b12408c0e14564fd7d998f66624a1a016341577383086c9a5eff7ea1`. Ele não fixava raiz, mas
// também não conferia onde `--dir` caía — e com o arquivo DENTRO do repositório o `--dir
// ./comandos-custo` do uso antigo gravaria os comandos e as respostas do canal na árvore do
// git. A versão daqui difere dele nisto e só nisto: a raiz derivada de `import.meta.url`, a
// guarda `validarDirFora` (a régua de `medir-rls.mjs`, que recusa também a própria raiz) no lugar do
// "--dir é obrigatório", os imports que isso pede (sem o `readdirSync`, que nunca foi usado e
// o eslint acusa) e este bloco de uso. O "depois" da fase roda ESTE arquivo.
//
// Uso — rode da raiz do repositório; `--dir` fica FORA dele:
//   node scripts/perf/medir-custo.mjs gerar    --dir <fora-do-repo>/comandos-custo
//   (executar cada .sql no MCP execute_sql, gravar <nome>.resposta.txt em
//    <fora-do-repo>/respostas-custo/)
//   node scripts/perf/medir-custo.mjs analisar --dir <fora-do-repo>/respostas-custo \
//        --saida docs/perf/f60-producao-antes-custo.json
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ_REPO = fileURLToPath(new URL('../..', import.meta.url))

export class Recusa extends Error {}
function recusar(msg) {
  throw new Recusa(`medir-custo: RECUSADO — ${msg}`)
}

function validarDirFora(dir) {
  if (!dir) recusar('--dir é obrigatório (fora do repositório).')
  const rel = relative(RAIZ_REPO, resolve(dir))
  if (!rel.startsWith('..') && !isAbsolute(rel)) {
    recusar('--dir dentro do repositório — comandos e respostas moram FORA dele.')
  }
}

const EXPLAIN = 'explain (analyze, buffers, format json) '
const N_REPS = 8 // 1 aquecimento (v_i=1, descartado) + 7 medidas (regra 7)

/** Escapa um texto SQL para virar o CONTEÚDO de um literal PL/pgSQL ('…'). */
function dq(s) {
  return s.replace(/'/g, "''")
}

// ---------------------------------------------------------------------------
// O preâmbulo comum — igual ao molde do medir-rls.mjs (F59), adaptado p/ F60.
// ---------------------------------------------------------------------------

const PREAMBULO_APP = `
  perform set_config('transaction_read_only', 'on', true);

  v_rotulo := public.rotulo_de_ambiente();
  if v_rotulo is not null then
    raise exception 'F60_ALVO_RECUSADO alvo=producao rotulo=%', v_rotulo;
  end if;

  select p.id into v_uid
    from public.profiles p
   where p.ativo and p.excluido_em is null and p.papel in ('admin', 'dev')
   order by p.id
   limit 1;
  if v_uid is null then
    raise exception 'F60_IDENTIDADE_AUSENTE';
  end if;

  select id into v_filial_a from public.filiais where ativo order by id asc  limit 1;
  select id into v_filial_b from public.filiais where ativo order by id desc limit 1;
  if v_filial_a is null or v_filial_b is null then
    raise exception 'F60_FILIAL_AUSENTE';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
`

const PREAMBULO_METADADO = `
  perform set_config('transaction_read_only', 'on', true);

  v_rotulo := public.rotulo_de_ambiente();
  if v_rotulo is not null then
    raise exception 'F60_ALVO_RECUSADO alvo=producao rotulo=%', v_rotulo;
  end if;
`

/** As linhas do LAÇO para UMA forma estática (sql já conhecido em JS). Acumula em
 *  v_amostras/v_nos (jsonb), chaveados por `nomeForma`. */
function linhasForma(nomeForma, sqlTexto) {
  const lit = dq(EXPLAIN + sqlTexto)
  return `
      execute '${lit}' into v_plano;
      v_p := v_plano::jsonb -> 0;
      if v_i > 1 then
        v_amostras := jsonb_set(v_amostras, array['${nomeForma}'],
          coalesce(v_amostras -> '${nomeForma}', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'exec', v_p -> 'Execution Time', 'plan', v_p -> 'Planning Time',
            'hit', v_p #> '{Plan,Shared Hit Blocks}', 'read', v_p #> '{Plan,Shared Read Blocks}',
            'linhas', v_p #> '{Plan,Actual Rows}', 'linhas_estimadas', v_p #> '{Plan,Plan Rows}')));
        if v_i = 2 then
          v_nos := jsonb_set(v_nos, array['${nomeForma}'], jsonb_build_object(
            'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"'),
            'relacoes', jsonb_path_query_array(v_p, 'strict $.**."Relation Name"'),
            'indices', jsonb_path_query_array(v_p, 'strict $.**."Index Name"')));
        end if;
      end if;`
}

/** Igual, mas SEM `analyze`/`buffers` — a query NÃO é executada, só planejada (o
 *  modo "planned" do PostgREST: `Plan Rows` sem tocar as linhas). */
function linhasFormaPlanOnly(nomeForma, sqlTexto) {
  const lit = dq('explain (format json) ' + sqlTexto)
  return `
      execute '${lit}' into v_plano;
      v_p := v_plano::jsonb -> 0;
      if v_i > 1 then
        v_amostras := jsonb_set(v_amostras, array['${nomeForma}'],
          coalesce(v_amostras -> '${nomeForma}', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'plan', v_p -> 'Planning Time', 'linhas_estimadas', v_p #> '{Plan,Plan Rows}')));
        if v_i = 2 then
          v_nos := jsonb_set(v_nos, array['${nomeForma}'], jsonb_build_object(
            'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"')));
        end if;
      end if;`
}

/** Igual a linhasForma, mas o texto final do EXPLAIN é montado em TEMPO DE EXECUÇÃO
 *  (concatenação PL/pgSQL com uma variável), para nunca escrever no .sql gerado um
 *  valor sensível (uid/filial/item) resolvido dentro do banco. `partes` é uma lista
 *  de fragmentos; cada fragmento é `{lit: 'texto'}` (literal, vai escapado) ou
 *  `{expr: 'v_var'}` (variável PL/pgSQL, concatenada crua). */
function linhasFormaDinamica(nomeForma, partes) {
  const expr = partes
    .map((p) => (p.lit !== undefined ? `'${dq(p.lit)}'` : p.expr))
    .join(' || ')
  return `
      execute '${dq(EXPLAIN)}' || ${expr} into v_plano;
      v_p := v_plano::jsonb -> 0;
      if v_i > 1 then
        v_amostras := jsonb_set(v_amostras, array['${nomeForma}'],
          coalesce(v_amostras -> '${nomeForma}', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'exec', v_p -> 'Execution Time', 'plan', v_p -> 'Planning Time',
            'hit', v_p #> '{Plan,Shared Hit Blocks}', 'read', v_p #> '{Plan,Shared Read Blocks}',
            'linhas', v_p #> '{Plan,Actual Rows}', 'linhas_estimadas', v_p #> '{Plan,Plan Rows}')));
        if v_i = 2 then
          v_nos := jsonb_set(v_nos, array['${nomeForma}'], jsonb_build_object(
            'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"'),
            'relacoes', jsonb_path_query_array(v_p, 'strict $.**."Relation Name"'),
            'indices', jsonb_path_query_array(v_p, 'strict $.**."Index Name"')));
        end if;
      end if;`
}

/** Regra 2: prepared statements são deallocated antes do raise final; se algo
 *  falhar no meio, um begin/exception interno deve deallocate e relançar —
 *  em vez de deixar um prepared statement pendente na sessão. */
function comDeallocateEmFalha(corpo) {
  return `
  begin
${corpo}
  exception when others then
    execute 'deallocate all';
    raise;
  end;`
}

function montarBloco({ nome, marcador, preambulo, declaracoes, corpo, payload }) {
  return `do $f60$
declare
  v_rotulo text;
  v_uid uuid;
  v_filial_a smallint;
  v_filial_b smallint;
  v_plano json;
  v_p jsonb;
  v_amostras jsonb := '{}';
  v_nos jsonb := '{}';
  v_i int;
${declaracoes}
begin
${preambulo}
${corpo}

  raise exception '${marcador} %', jsonb_build_object(
    'bloco', '${nome}',
    'postgres', current_setting('server_version'),
    'papel_na_medicao', current_user,
${payload}
    'amostras', v_amostras,
    'nos', v_nos);
end $f60$;`
}

// ===========================================================================
// B1 — KPIs do dashboard
// ===========================================================================

const B1_STATUS = ['em_uso', 'em_estoque', 'reservado', 'em_manutencao', 'em_triagem', 'defasado', 'emprestado']
const EXCLUI_BAIXAS = "status not in ('descartado','devolvido_fornecedor')"

function sqlB1() {
  const SEL_ATIVOS =
    'select id, categoria, marca, modelo, filial_id, status, colaborador_atual, setor_atual from public.ativos'
  const declaracoes = `
  v_status text[] := array[${B1_STATUS.map((s) => `'${s}'`).join(', ')}];
  v_valores jsonb := '{}';
  v_agg jsonb := '{}';
  v_rec record;
  v_val bigint;
  v_k int;`
  const corpo = `
  perform set_config('plan_cache_mode', 'force_generic_plan', true);
  execute 'deallocate all';
  execute 'prepare f60_b1_status (public.status_ativo) as select count(*) from public.ativos where status = $1';

  for v_i in 1 .. ${N_REPS} loop
${linhasForma('hoje_pagina1', `${SEL_ATIVOS} where ${EXCLUI_BAIXAS} order by id asc limit 1000 offset 0`)}
${linhasForma('hoje_pagina2', `${SEL_ATIVOS} where ${EXCLUI_BAIXAS} order by id asc limit 1000 offset 1000`)}
    for v_k in 1 .. array_length(v_status, 1) loop
      execute '${dq(EXPLAIN)}execute f60_b1_status(''' || v_status[v_k] || ''')' into v_plano;
      v_p := v_plano::jsonb -> 0;
      if v_i > 1 then
        v_amostras := jsonb_set(v_amostras, array['contagem_head_' || v_status[v_k]],
          coalesce(v_amostras -> ('contagem_head_' || v_status[v_k]), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'exec', v_p -> 'Execution Time', 'plan', v_p -> 'Planning Time',
            'hit', v_p #> '{Plan,Shared Hit Blocks}', 'read', v_p #> '{Plan,Shared Read Blocks}')));
        if v_i = 2 then
          v_nos := jsonb_set(v_nos, array['contagem_head_' || v_status[v_k]], jsonb_build_object(
            'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"')));
        end if;
      end if;
    end loop;
${linhasForma('agregacao_unica', `select status, count(*) from public.ativos where ${EXCLUI_BAIXAS} group by status`)}
  end loop;
  execute 'deallocate f60_b1_status';

  -- valores REAIS (não custo — para a conferência de igualdade)
  for v_k in 1 .. array_length(v_status, 1) loop
    execute 'select count(*) from public.ativos where status = ''' || v_status[v_k] || '''' into v_val;
    v_valores := jsonb_set(v_valores, array[v_status[v_k]], to_jsonb(v_val));
  end loop;
  for v_rec in select status::text as st, count(*)::bigint as c from public.ativos where ${EXCLUI_BAIXAS} group by status loop
    v_agg := jsonb_set(v_agg, array[v_rec.st], to_jsonb(v_rec.c));
  end loop;`
  const payload = `
    'contagens_por_status_head', v_valores,
    'contagens_por_status_agregacao', v_agg,
    'total_head_soma', (select coalesce(sum(value::text::bigint), 0) from jsonb_each(v_valores)),
    'total_agregacao_soma', (select coalesce(sum(value::text::bigint), 0) from jsonb_each(v_agg)),
    'total_fastpath_paginas', (select count(*) from public.ativos where ${EXCLUI_BAIXAS}),
`
  return montarBloco({ nome: 'b1-kpis', marcador: 'F60_MEDICAO', preambulo: PREAMBULO_APP, declaracoes, corpo: comDeallocateEmFalha(corpo), payload })
}

// ===========================================================================
// B2 — /ativos
// ===========================================================================

function sqlB2() {
  const SEL_LISTA =
    "select a.id, a.patrimonio, a.service_tag, a.categoria, a.marca, a.modelo, a.status, a.colaborador_atual, a.updated_at, a.pendencia, f.slug, f.nome from public.ativos a left join public.filiais f on f.id = a.filial_id"
  const ORD_PAG1 = 'order by a.updated_at desc, a.id asc limit 50 offset 0'
  const BUSCA_WHERE = (ph) =>
    `(a.patrimonio ilike ${ph} or a.colaborador_atual ilike ${ph} or a.marca ilike ${ph} or a.modelo ilike ${ph} or a.service_tag ilike ${ph} or a.hostname ilike ${ph} or a.telefone ilike ${ph} or a.imei ilike ${ph})`

  const declaracoes = ``
  const corpo = `
  perform set_config('plan_cache_mode', 'force_generic_plan', true);
  execute 'deallocate all';
  execute 'prepare f60_b2_busca_pag (text) as ${dq(`${SEL_LISTA} where ${BUSCA_WHERE('$1')} ${ORD_PAG1}`)}';
  execute 'prepare f60_b2_busca_cnt (text) as ${dq(`select count(*) from public.ativos a where ${BUSCA_WHERE('$1')}`)}';

  for v_i in 1 .. ${N_REPS} loop
${linhasForma('pagina1_sem_busca', `${SEL_LISTA} ${ORD_PAG1}`)}
${linhasForma('count_exact_sem_filtro', 'select count(*) from public.ativos')}
${linhasFormaPlanOnly('count_planned_sem_filtro', 'select * from public.ativos')}
    execute '${dq(EXPLAIN)}execute f60_b2_busca_pag(''%e%'')' into v_plano;
    v_p := v_plano::jsonb -> 0;
    if v_i > 1 then
      v_amostras := jsonb_set(v_amostras, array['pagina1_com_busca'],
        coalesce(v_amostras -> 'pagina1_com_busca', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'exec', v_p -> 'Execution Time', 'plan', v_p -> 'Planning Time',
          'hit', v_p #> '{Plan,Shared Hit Blocks}', 'read', v_p #> '{Plan,Shared Read Blocks}',
          'linhas', v_p #> '{Plan,Actual Rows}')));
      if v_i = 2 then
        v_nos := jsonb_set(v_nos, array['pagina1_com_busca'], jsonb_build_object(
          'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"')));
      end if;
    end if;
    execute '${dq(EXPLAIN)}execute f60_b2_busca_cnt(''%e%'')' into v_plano;
    v_p := v_plano::jsonb -> 0;
    if v_i > 1 then
      v_amostras := jsonb_set(v_amostras, array['count_exact_com_busca'],
        coalesce(v_amostras -> 'count_exact_com_busca', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'exec', v_p -> 'Execution Time', 'plan', v_p -> 'Planning Time',
          'hit', v_p #> '{Plan,Shared Hit Blocks}', 'read', v_p #> '{Plan,Shared Read Blocks}',
          'linhas', v_p #> '{Plan,Actual Rows}')));
      if v_i = 2 then
        v_nos := jsonb_set(v_nos, array['count_exact_com_busca'], jsonb_build_object(
          'tipos', jsonb_path_query_array(v_p, 'strict $.**."Node Type"')));
      end if;
    end if;
  end loop;
  execute 'deallocate f60_b2_busca_pag';
  execute 'deallocate f60_b2_busca_cnt';`
  const payload = `
    'total_exato', (select count(*) from public.ativos),
    'total_com_busca_e', (select count(*) from public.ativos a where ${BUSCA_WHERE("'%e%'")}),
    'reltuples_pg_class', (select reltuples::bigint from pg_class where oid = 'public.ativos'::regclass),
`
  return montarBloco({ nome: 'b2-ativos', marcador: 'F60_MEDICAO', preambulo: PREAMBULO_APP, declaracoes, corpo: comDeallocateEmFalha(corpo), payload })
}

// ===========================================================================
// B3 — /admin/colaboradores
// ===========================================================================

function sqlB3() {
  const SEL_COLAB =
    'select c.id, c.nome, c.matricula, c.setor, c.filial_id, c.ativo, c.nome_chave, c.created_at, ' +
    '(select count(*) from public.movimentacoes m where m.colaborador_id = c.id) as mov_count, ' +
    '(select count(*) from public.lancamentos_item l where l.colaborador_id = c.id) as lanc_count ' +
    'from public.colaboradores c order by c.nome asc, c.id asc limit 1000 offset 0'
  const SEL_FILA =
    'select nome_chave, grafia_exemplo, ocorrencias, grafias, filial_id, ja_cadastrado, colaborador_id ' +
    'from public.v_colaboradores_textos where ja_cadastrado = false ' +
    'order by ocorrencias desc, grafia_exemplo asc, nome_chave asc limit 500'
  const SEL_CONSOL = 'select * from public.v_colaboradores_consolidacao'

  const declaracoes = ``
  const corpo = `
  for v_i in 1 .. ${N_REPS} loop
${linhasForma('colaboradores_com_counts', SEL_COLAB)}
${linhasForma('fila_consolidacao', SEL_FILA)}
${linhasForma('resumo_consolidacao', SEL_CONSOL)}
  end loop;`
  const payload = `
    'linhas_movimentacoes_com_colaborador_texto',
      (select count(*) from public.movimentacoes where btrim(coalesce(colaborador, '')) <> ''),
    'linhas_lancamentos_com_colaborador_texto',
      (select count(*) from public.lancamentos_item where btrim(coalesce(colaborador, '')) <> ''),
    'grupos_pendentes', (select coalesce((select grupos from public.v_colaboradores_consolidacao where not ja_cadastrado), 0)),
    'grupos_cadastrados', (select coalesce((select grupos from public.v_colaboradores_consolidacao where ja_cadastrado), 0)),
`
  return montarBloco({ nome: 'b3-colaboradores', marcador: 'F60_MEDICAO', preambulo: PREAMBULO_APP, declaracoes, corpo, payload })
}

// ===========================================================================
// B4 — /itens/historico e /itens
// ===========================================================================

const LANC_JOIN =
  'from public.lancamentos_item l ' +
  'join public.itens i on i.id = l.item_id ' +
  'join public.filiais f on f.id = l.filial_id ' +
  'join public.profiles p on p.id = l.criado_por'
const LANC_COLS =
  'l.id, l.data, l.tipo, l.quantidade, l.chamado, l.colaborador, l.observacao, l.estorna_id, l.created_at, i.nome, i.grupo, f.nome, p.nome'

function sqlB4() {
  const declaracoes = `
  v_item_quente smallint;
  v_autor_quente uuid;`
  const preambuloExtra = `
  select item_id into v_item_quente
    from public.lancamentos_item group by item_id order by count(*) desc limit 1;
  select criado_por into v_autor_quente
    from public.lancamentos_item group by criado_por order by count(*) desc limit 1;`
  const corpo = `
  for v_i in 1 .. ${N_REPS} loop
${linhasForma('count_head_modo_todas', 'select count(*) from public.lancamentos_item')}
${linhasForma(
    'pagina1_modo_todas',
    `select ${LANC_COLS} ${LANC_JOIN} order by l.created_at desc, l.id desc limit 20 offset 0`,
  )}
${linhasFormaDinamica('pagina1_in_duas_filiais', [
    { lit: `select ${LANC_COLS} ${LANC_JOIN} where l.filial_id in (` },
    { expr: 'v_filial_a::text' },
    { lit: ', ' },
    { expr: 'v_filial_b::text' },
    { lit: ') order by l.created_at desc, l.id desc limit 20 offset 0' },
  ])}
${linhasFormaDinamica('pagina1_item_quente_ordem_data', [
    { lit: `select ${LANC_COLS} ${LANC_JOIN} where l.item_id = ` },
    { expr: 'v_item_quente::text' },
    { lit: ' order by l.data desc, l.created_at desc, l.id desc limit 20 offset 0' },
  ])}
${linhasFormaDinamica('ultimo_lancamento_do_autor_quente', [
    { lit: "select l.item_id, l.filial_id, l.tipo, l.chamado, l.colaborador from public.lancamentos_item l where l.criado_por = '" },
    { expr: 'v_autor_quente::text' },
    { lit: "'::uuid and l.estorna_id is null order by l.created_at desc, l.id desc limit 1" },
  ])}
  end loop;`
  const payload = ``
  return montarBloco({
    nome: 'b4-itens',
    marcador: 'F60_MEDICAO',
    preambulo: PREAMBULO_APP + preambuloExtra,
    declaracoes,
    corpo,
    payload,
  })
}

// ===========================================================================
// B5 — as três tabelas do relatório
// ===========================================================================

const OBS_CARGA_GOLIVE = 'carga go-live'
const OBS_IMPORT_STARTUP = 'import startup'

function excluiGoliveImport() {
  return (
    `(observacao is null or observacao <> '${OBS_CARGA_GOLIVE}') and ` +
    `(observacao is null or observacao not like '${OBS_IMPORT_STARTUP}%')`
  )
}

function sqlTabelaPeriodo({ tipos, incluirDestino, filialExpr, deExpr, ateExpr }) {
  const tiposLit = tipos.map((t) => `'${t}'`).join(', ')
  let filialClausula = ''
  if (filialExpr) {
    filialClausula = incluirDestino
      ? ` and (filial_id = ${filialExpr} or filial_destino_id = ${filialExpr})`
      : ` and filial_id = ${filialExpr}`
  }
  return (
    `select id, data, created_at from public.movimentacoes where tipo in (${tiposLit}) ` +
    `and data >= ${deExpr} and data <= ${ateExpr} and ${excluiGoliveImport()}${filialClausula} ` +
    `order by data desc, created_at desc, id desc limit 1000 offset 0`
  )
}

function sqlContagemPeriodo({ tipos, incluirDestino, filialExpr, deExpr, ateExpr }) {
  const tiposLit = tipos.map((t) => `'${t}'`).join(', ')
  let filialClausula = ''
  if (filialExpr) {
    filialClausula = incluirDestino
      ? ` and (filial_id = ${filialExpr} or filial_destino_id = ${filialExpr})`
      : ` and filial_id = ${filialExpr}`
  }
  return (
    `select count(*) from public.movimentacoes where tipo in (${tiposLit}) ` +
    `and data >= ${deExpr} and data <= ${ateExpr} and ${excluiGoliveImport()}${filialClausula}`
  )
}

const TABELAS_B5 = [
  { nome: 'saidas', tipos: ['saida', 'emprestimo'], incluirDestino: false },
  { nome: 'entradas', tipos: ['devolucao', 'compra', 'troca'], incluirDestino: false },
  { nome: 'transferencias', tipos: ['transferencia'], incluirDestino: true },
]

function sqlB5(tab) {
  const TABELAS = [tab]
  const JANELAS = [
    { nome: '7d', deExpr: "current_date - interval '6 days'" },
    { nome: '365d', deExpr: "current_date - interval '364 days'" },
  ]
  const declaracoes = ``
  let corpo = `
  for v_i in 1 .. ${N_REPS} loop`
  for (const tab of TABELAS) {
    for (const jan of JANELAS) {
      const nomeCons = `${tab.nome}_consolidado_${jan.nome}`
      corpo += linhasForma(
        nomeCons,
        sqlTabelaPeriodo({ tipos: tab.tipos, incluirDestino: tab.incluirDestino, filialExpr: null, deExpr: jan.deExpr, ateExpr: 'current_date' }),
      )
      const nomeFilA = `${tab.nome}_filial_a_${jan.nome}`
      corpo += linhasFormaDinamica(nomeFilA, [
        {
          lit:
            `select id, data, created_at from public.movimentacoes where tipo in (${tab.tipos.map((t) => `'${t}'`).join(', ')}) ` +
            `and data >= ${jan.deExpr} and data <= current_date and ${excluiGoliveImport()} and (`,
        },
        { expr: 'v_filial_a::text' },
        { lit: tab.incluirDestino ? ' = filial_id or ' : ' = filial_id) order by data desc, created_at desc, id desc limit 1000 offset 0' },
        ...(tab.incluirDestino
          ? [{ expr: 'v_filial_a::text' }, { lit: ' = filial_destino_id) order by data desc, created_at desc, id desc limit 1000 offset 0' }]
          : []),
      ])
    }
  }
  corpo += `
  end loop;`

  // As contagens totais (números, sem depender do LIMIT 1000)
  let payload = ''
  for (const tab of TABELAS) {
    for (const jan of JANELAS) {
      payload += `    'total_${tab.nome}_consolidado_${jan.nome}', (${sqlContagemPeriodo({
        tipos: tab.tipos,
        incluirDestino: tab.incluirDestino,
        filialExpr: null,
        deExpr: jan.deExpr,
        ateExpr: 'current_date',
      })}),\n`
      payload += `    'total_${tab.nome}_filial_a_${jan.nome}', (${sqlContagemPeriodo({
        tipos: tab.tipos,
        incluirDestino: tab.incluirDestino,
        filialExpr: 'v_filial_a',
        deExpr: jan.deExpr,
        ateExpr: 'current_date',
      })}),\n`
    }
  }
  return montarBloco({ nome: `b5-${tab.nome}`, marcador: 'F60_MEDICAO', preambulo: PREAMBULO_APP, declaracoes, corpo, payload })
}

// ===========================================================================
// B6 — Estornos
// ===========================================================================

function sqlB6() {
  const declaracoes = `
  v_ids uuid[];
  v_lote uuid[];
  v_total_ids int;`
  const preambuloExtra = `
  select coalesce(array_agg(id), '{}') into v_ids
    from public.movimentacoes
   where ${excluiGoliveImport()}
     and data >= current_date - interval '364 days' and data <= current_date
     and tipo in ('saida', 'emprestimo', 'devolucao', 'compra', 'troca', 'transferencia');
  v_total_ids := coalesce(array_length(v_ids, 1), 0);
  v_lote := v_ids[1 : least(v_total_ids, 100)];`
  const corpo = `
  perform set_config('plan_cache_mode', 'force_generic_plan', true);
  execute 'deallocate all';
  execute 'prepare f60_b6_proposto (uuid[]) as select estorno_de, data from public.movimentacoes where estorno_de = any($1)';

  for v_i in 1 .. ${N_REPS} loop
${linhasForma(
    'hoje_todos_os_estornos',
    "select estorno_de, data from public.movimentacoes where tipo = 'estorno' and estorno_de is not null and data <= current_date order by id asc",
  )}
${linhasFormaDinamica('proposto_lote_ids', [
    { lit: "execute f60_b6_proposto('" },
    { expr: 'v_lote::text' },
    { lit: "'::uuid[])" },
  ])}
  end loop;
  execute 'deallocate f60_b6_proposto';`
  const payload = `
    'total_estornos_hoje', (select count(*) from public.movimentacoes where tipo = 'estorno' and estorno_de is not null and data <= current_date),
    'total_ids_janela_365d', v_total_ids,
    'tamanho_lote_medido', coalesce(array_length(v_lote, 1), 0),
    'estornos_no_lote_proposto', (select count(*) from public.movimentacoes where estorno_de = any(v_lote)),
    'estornos_hoje_restritos_ao_lote', (select count(*) from public.movimentacoes where tipo = 'estorno' and estorno_de is not null and data <= current_date and estorno_de = any(v_lote)),
    'numero_de_lotes_necessarios', ceil(v_total_ids::numeric / 100),
`
  return montarBloco({
    nome: 'b6-estornos',
    marcador: 'F60_MEDICAO',
    preambulo: PREAMBULO_APP + preambuloExtra,
    declaracoes,
    corpo: comDeallocateEmFalha(corpo),
    payload,
  })
}

// ===========================================================================
// B7 — índices (metadado — não veste authenticated)
// ===========================================================================

function sqlB7() {
  const declaracoes = `
  v_idx jsonb := '{}';
  v_rec record;
  v_por_papel jsonb := '{}';`
  const corpo = `
  for v_rec in
    select indexrelname, idx_scan, idx_tup_read
      from pg_stat_user_indexes
     where schemaname = 'public'
       and indexrelname in (
         'movimentacoes_ordem_lista_idx', 'movimentacoes_data_ordem_idx',
         'mov_ativo_idx', 'movimentacoes_estorno_de_idx', 'lanc_item_item_filial_idx')
  loop
    v_idx := jsonb_set(v_idx, array[v_rec.indexrelname],
      jsonb_build_object('idx_scan', v_rec.idx_scan, 'idx_tup_read', v_rec.idx_tup_read));
  end loop;

  declare
    v_candidatos text[] := array['extensions.pg_stat_statements', 'public.pg_stat_statements', 'pg_stat_statements'];
    v_c text;
    v_ok boolean := false;
  begin
    foreach v_c in array v_candidatos loop
      if v_ok then exit; end if;
      begin
        v_por_papel := '{}'::jsonb;
        for v_rec in execute
          'select r.rolname as papel, count(*)::bigint as formas, coalesce(sum(s.calls), 0)::bigint as chamadas ' ||
          'from ' || v_c || ' s join pg_roles r on r.oid = s.userid ' ||
          'where s.query ~* ''movimentacoes'' ' ||
          'and s.query ~* ''order\\s+by\\s+"?data"?\\s+desc\\s*,\\s*"?created_at"?\\s+desc'' ' ||
          'group by r.rolname'
        loop
          v_por_papel := jsonb_set(v_por_papel, array[v_rec.papel],
            jsonb_build_object('formas', v_rec.formas, 'chamadas', v_rec.chamadas));
        end loop;
        v_ok := true;
      exception when others then
        v_por_papel := jsonb_build_object('erro', sqlstate, 'tentativa', v_c);
      end;
    end loop;
  end;`
  const payload = `
    'indices', v_idx,
    'ordem_data_created_at_desc_por_papel', v_por_papel,
`
  return montarBloco({ nome: 'b7-indices', marcador: 'F60_MEDICAO', preambulo: PREAMBULO_METADADO, declaracoes, corpo, payload })
}

// ===========================================================================
// B8 — tamanhos (metadado)
// ===========================================================================

function sqlB8() {
  const declaracoes = ``
  const corpo = ``
  const payload = `
    'pg_total_relation_size_movimentacoes', pg_total_relation_size('public.movimentacoes'),
    'pg_indexes_size_movimentacoes', pg_indexes_size('public.movimentacoes'),
    'pg_total_relation_size_lancamentos_item', pg_total_relation_size('public.lancamentos_item'),
    'pg_indexes_size_lancamentos_item', pg_indexes_size('public.lancamentos_item'),
    'pg_total_relation_size_ativos', pg_total_relation_size('public.ativos'),
    'pg_indexes_size_ativos', pg_indexes_size('public.ativos'),
    'pg_database_size', pg_database_size(current_database()),
`
  return montarBloco({ nome: 'b8-tamanhos', marcador: 'F60_MEDICAO', preambulo: PREAMBULO_METADADO, declaracoes, corpo, payload })
}

// ---------------------------------------------------------------------------
// Montagem final: B7/B8 não têm v_amostras/v_nos relevantes — a função
// montarBloco() sempre os grava (mesmo vazios: '{}'), o que é inofensivo e
// mantém o formato uniforme para o analisador.
// ---------------------------------------------------------------------------

export const BLOCOS = [
  { nome: 'b1-kpis', sql: sqlB1() },
  { nome: 'b2-ativos', sql: sqlB2() },
  { nome: 'b3-colaboradores', sql: sqlB3() },
  { nome: 'b4-itens', sql: sqlB4() },
  ...TABELAS_B5.map((tab) => ({ nome: `b5-${tab.nome}`, sql: sqlB5(tab) })),
  { nome: 'b6-estornos', sql: sqlB6() },
  { nome: 'b7-indices', sql: sqlB7() },
  { nome: 'b8-tamanhos', sql: sqlB8() },
]

// ---------------------------------------------------------------------------
// Análise das respostas
// ---------------------------------------------------------------------------

export function lerPayload(texto, marca) {
  let msg = texto
  try {
    const j = JSON.parse(texto)
    msg = j?.error?.message ?? j?.message ?? texto
  } catch {
    // resposta gravada como texto puro
  }
  const recusa = /F60_(ALVO_RECUSADO|IDENTIDADE_AUSENTE|FILIAL_AUSENTE)[^\n"]*/.exec(msg)
  if (recusa) return { recusa: recusa[0] }
  const i = msg.indexOf(`${marca} {`)
  if (i === -1) recusar(`resposta sem ${marca} — o bloco não chegou ao fim. Trecho: ${msg.slice(0, 400)}`)
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

export function estatistica(valores) {
  const v = [...valores].filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (v.length === 0) return { mediana: null, p95: null, min: null, max: null, n: 0 }
  const posto = (q) => v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)]
  const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  const r = (x) => Math.round(x * 1000) / 1000
  return { mediana: r(med), p95: r(posto(0.95)), min: r(v[0]), max: r(v.at(-1)), n: v.length }
}

export function resumirBloco(payload) {
  const formas = {}
  for (const forma of Object.keys(payload.amostras ?? {})) {
    const a = payload.amostras[forma] ?? []
    formas[forma] = {
      execucao_ms: estatistica(a.map((x) => x.exec)),
      planejamento_ms: estatistica(a.map((x) => x.plan)),
      buffers_raiz: { hit_mediana: estatistica(a.map((x) => x.hit)).mediana, read_mediana: estatistica(a.map((x) => x.read)).mediana },
      linhas: [...new Set(a.map((x) => x.linhas).filter((x) => x !== undefined))],
      tipos_de_no: payload.nos?.[forma]?.tipos ?? null,
      relacoes: payload.nos?.[forma]?.relacoes ?? null,
      indices_usados: payload.nos?.[forma]?.indices ?? null,
    }
  }
  const extras = { ...payload }
  delete extras.amostras
  delete extras.nos
  return { bloco: payload.bloco, postgres: payload.postgres, papel_na_medicao: payload.papel_na_medicao, formas, extras }
}

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
  if (!['gerar', 'analisar'].includes(o.modo)) recusar('modo: gerar | analisar.')
  validarDirFora(o.dir)
  if (o.modo === 'gerar') {
    mkdirSync(o.dir, { recursive: true })
    for (const b of BLOCOS) writeFileSync(join(o.dir, `${b.nome}.sql`), b.sql)
    console.log(JSON.stringify({ gravados: BLOCOS.map((b) => `${b.nome}.sql`) }, null, 2))
    return
  }
  if (!o.saida) recusar('--saida é obrigatório na análise.')
  const resultado = { rotulo: 'f60-producao-antes-custo', gerado_em: new Date().toISOString(), blocos: [], pendencias: [] }
  for (const b of BLOCOS) {
    const arq = join(o.dir, `${b.nome}.resposta.txt`)
    if (!existsSync(arq)) {
      resultado.pendencias.push({ bloco: b.nome, motivo: 'sem resposta gravada do canal' })
      continue
    }
    const p = lerPayload(readFileSync(arq, 'utf8'), 'F60_MEDICAO')
    if (p.recusa) {
      resultado.pendencias.push({ bloco: b.nome, motivo: p.recusa })
      continue
    }
    resultado.blocos.push(resumirBloco(p))
  }
  writeFileSync(resolve(o.saida), JSON.stringify(resultado, null, 2) + '\n')
  console.log(`gravado ${o.saida}: ${resultado.blocos.length} bloco(s), ${resultado.pendencias.length} pendência(s)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Recusa ? err.message : `medir-custo: ERRO — ${err.message}\n${err.stack}`)
    process.exit(1)
  })
}

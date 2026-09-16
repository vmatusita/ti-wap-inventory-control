#!/usr/bin/env node
// ---------------------------------------------------------------------------
// medir-rel.mjs — a linha de base do MOTOR: as sete `rel_*` que recortam por
// filial, medidas com o argumento NUNCA constante (fato 6), no molde de
// só-leitura de `scripts/perf/medir-rls.mjs` (F59).
// ---------------------------------------------------------------------------
// O QUE ISTO MEDE (Tarefa A, F60):
//   (a) a CHAMADA como o PostgREST chama — `json_to_record(...) as pgrst_body(...),
//       lateral public.<fn>(<p> := pgrst_body.<p>, …)` — o argumento nasce de um
//       JOIN, nunca de um literal no texto do SQL; a função tem `set search_path`,
//       então não é embutida (fato 6) e aparece como `Function Scan` — caixa preta.
//   (b) o CORPO EMULADO — o corpo vigente da função (lido de
//       `scripts/db/corpo-vigente.mjs`, nunca copiado à mão), com os parâmetros
//       trocados por $1/$2/$3, preparado UMA vez com
//       `plan_cache_mode = force_generic_plan` e executado por EXECUTE com os
//       valores de cada célula — é o único jeito de ver o plano GENÉRICO de
//       dentro da função (a chamada da RPC nunca mostra o corpo).
//
// CANAL — só MCP (regra 1 da ordem): este gerador NUNCA fala com o banco. Ele
// GRAVA os comandos em `--dir` (fora do repositório); quem opera (o próprio
// agente desta sessão) executa cada um pela ferramenta MCP `execute_sql` no
// projeto de PRODUÇÃO e grava a resposta ao lado, em `respostas/<nome>.txt`;
// `analisar-*` lê essas respostas.
//
// FALHA FECHADA — o que cada bloco `do $f60$ … end $f60$;` faz, sempre:
//   1. `perform set_config('transaction_read_only', 'on', true);` — primeira
//      instrução executável, sempre.
//   2. Confere `public.rotulo_de_ambiente() is null` (produção) — recusa com
//      `F60_ALVO_RECUSADO` se não for.
//   3. Identidade escolhida DENTRO do banco (perfil ativo, admin/dev) — o uuid
//      fica só em `v_uid`, NUNCA sai no payload.
//   4. Filial de recorte também escolhida DENTRO do banco (menor id ativa =
//      filial_a, maior id ativa = filial_b) — só o RÓTULO sai, nunca o id.
//   5. Termina SEMPRE em `raise exception 'F60_MEDICAO %', <jsonb>` — a
//      transação nunca se confirma. Todo `prepare`/`deallocate` fica dentro do
//      MESMO bloco (nome único `f60_corpo_<fn>`), com `deallocate all` no
//      início para não colidir com uma sessão anterior do mesmo canal.
//
// O QUE SAI NO PAYLOAD — só números, nomes de tipo de nó, nomes de
// tabela/índice e rótulos (regra 4): nunca id, e-mail, nome, patrimônio,
// service tag, texto de observação, slug/nome de filial ou texto de statement.
//
// PROVENIÊNCIA — este é o gerador que produziu `docs/perf/f60-producao-antes-rel.json`,
// `f60-pgss-antes.json` e `f60-datas-amostra.json` (PLAN-F60 §3.2–§3.4), versionado no lote 1
// da F60. O original rodou FORA do repositório com a raiz fixada como caminho absoluto da
// máquina: 45.039 bytes, sha256 (LF) `4ab7f71a71eb8a89b1d78f4b546516eb53688a83f42088f8f74f8144145f8eb2`.
// A versão daqui difere dele em DUAS coisas e só nelas: `RAIZ_REPO` sai de `import.meta.url`
// (e o import de `fileURLToPath` que isso pede), e este bloco de uso. O "depois" da fase roda
// ESTE arquivo — a mudança de sha é a da raiz, e está declarada aqui.
//
// Rode da raiz do repositório; `--dir` fica FORA dele (a guarda `validarDirFora` recusa):
//   node scripts/perf/medir-rel.mjs gerar-a1 --funcao=rel_estoque_asof --dir=<fora-do-repo>
//   node scripts/perf/medir-rel.mjs gerar-a2 --dir=<mesma>
//   node scripts/perf/medir-rel.mjs gerar-a3-bruto --dir=<mesma>
//   node scripts/perf/medir-rel.mjs gerar-a3-contagens --datas='[{"rotulo":"...","data":"2026-01-01"}]' --dir=<mesma>
//   node scripts/perf/medir-rel.mjs gerar-a4 --datas='["2026-01-01", ...]' --dir=<mesma>
//   (executar cada .sql no MCP `execute_sql` e gravar <mesma>/respostas/<nome>.resposta.txt)
//   node scripts/perf/medir-rel.mjs analisar-a1 --dir=<mesma> --saida=docs/perf/f60-producao-antes-rel.json
//   node scripts/perf/medir-rel.mjs analisar-a2 --dir=<mesma> --saida=docs/perf/f60-pgss-antes.json
//   node scripts/perf/medir-rel.mjs analisar-a3 --dir=<mesma> --saida=docs/perf/f60-datas-amostra.json
//   node scripts/perf/medir-rel.mjs analisar-a4 --dir=<mesma> --saida=docs/perf/f60-producao-antes-rel.json (mescla em "a4")
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ_REPO = fileURLToPath(new URL('../..', import.meta.url))

export class Recusa extends Error {}
function recusar(msg) {
  throw new Recusa(`medir-rel: RECUSADO — ${msg}`)
}

// ---------------------------------------------------------------------------
// 0. O modelo das sete `rel_*` — PARAMETRIZADO (regra 6: o "depois" da fase
//    roda o MESMO gerador com os nomes novos das funções e/ou assinaturas).
// ---------------------------------------------------------------------------

/**
 * Cada entrada declara: a assinatura para `corpoVigente`, a ORDEM dos
 * parâmetros (para trocar por $1/$2/$3 e para montar o JSON/EXECUTE), os
 * tipos (para o PREPARE) e a FORMA das células — `datas` (um parâmetro de
 * data) ou `janelas` (dois parâmetros, de/até).
 */
export const FUNCOES = {
  rel_estoque_asof: {
    assinatura: 'rel_estoque_asof(smallint, date)',
    parametros: ['p_filial', 'p_data'],
    tipos: ['smallint', 'date'],
    forma: 'data',
    campoData: 'p_data',
    celulas: [
      { rotulo: 'hoje', expr: 'current_date' },
      { rotulo: 'hoje-7', expr: 'current_date - 7' },
      { rotulo: 'hoje-60', expr: 'current_date - 60' },
    ],
  },
  rel_saldo_itens: {
    assinatura: 'rel_saldo_itens(smallint, date)',
    parametros: ['p_filial', 'p_ate'],
    tipos: ['smallint', 'date'],
    forma: 'data',
    campoData: 'p_ate',
    celulas: [{ rotulo: 'hoje', expr: 'current_date' }],
  },
  rel_mov_itens: {
    assinatura: 'rel_mov_itens(smallint, date, date)',
    parametros: ['p_filial', 'p_de', 'p_ate'],
    tipos: ['smallint', 'date', 'date'],
    forma: 'janela',
    celulas: [
      { rotulo: '7d', deExpr: 'current_date - 6', ateExpr: 'current_date' },
      { rotulo: '365d', deExpr: 'current_date - 364', ateExpr: 'current_date' },
    ],
  },
  rel_frescor_itens: {
    assinatura: 'rel_frescor_itens(smallint, date)',
    parametros: ['p_filial', 'p_ate'],
    tipos: ['smallint', 'date'],
    forma: 'data',
    campoData: 'p_ate',
    celulas: [{ rotulo: 'hoje', expr: 'current_date' }],
  },
  rel_mov_por_mes: {
    assinatura: 'rel_mov_por_mes(smallint, date, date)',
    parametros: ['p_filial', 'p_de', 'p_ate'],
    tipos: ['smallint', 'date', 'date'],
    forma: 'janela',
    celulas: [
      { rotulo: '7d', deExpr: 'current_date - 6', ateExpr: 'current_date' },
      { rotulo: '365d', deExpr: 'current_date - 364', ateExpr: 'current_date' },
    ],
  },
  rel_por_motivo: {
    assinatura: 'rel_por_motivo(smallint, date, date)',
    parametros: ['p_filial', 'p_de', 'p_ate'],
    tipos: ['smallint', 'date', 'date'],
    forma: 'janela',
    celulas: [
      { rotulo: '7d', deExpr: 'current_date - 6', ateExpr: 'current_date' },
      { rotulo: '365d', deExpr: 'current_date - 364', ateExpr: 'current_date' },
    ],
  },
  rel_resumo: {
    assinatura: 'rel_resumo(smallint, date, date)',
    parametros: ['p_filial', 'p_de', 'p_ate'],
    tipos: ['smallint', 'date', 'date'],
    forma: 'janela',
    celulas: [
      { rotulo: '7d', deExpr: 'current_date - 6', ateExpr: 'current_date' },
      { rotulo: '365d', deExpr: 'current_date - 364', ateExpr: 'current_date' },
    ],
  },
}

export const RECORTES = ['consolidado', 'filial_a', 'filial_b']
export const N_PADRAO = 7 // + 1 aquecimento (regra 7)

// ---------------------------------------------------------------------------
// 1. O corpo vigente — nunca copiado à mão, sempre lido de corpo-vigente.mjs
// ---------------------------------------------------------------------------

async function corpoVigenteMod() {
  return await import(pathToFileURL(resolve(RAIZ_REPO, 'scripts/db/corpo-vigente.mjs')).href)
}

/** Extrai o texto entre o delimitador dollar-quoted (`$$` ou `$tag$`) de um `create function`. */
export function extrairCorpo(textoCreateFunction) {
  const m = /\$([a-zA-Z_]*)\$/.exec(textoCreateFunction)
  if (!m) recusar('create function sem delimitador dollar-quoted — corpo não encontrado.')
  const tag = m[0]
  const inicio = textoCreateFunction.indexOf(tag) + tag.length
  const fim = textoCreateFunction.indexOf(tag, inicio)
  if (fim === -1) recusar('delimitador dollar-quoted sem par de fechamento.')
  return textoCreateFunction.slice(inicio, fim).trim()
}

/** Troca cada parâmetro pelo seu `$N` posicional — só a PALAVRA INTEIRA (fronteira de palavra). */
export function substituirParametros(corpo, parametros) {
  let out = corpo
  parametros.forEach((nome, i) => {
    const re = new RegExp(`\\b${nome}\\b`, 'g')
    out = out.replace(re, `$${i + 1}`)
  })
  return out
}

/**
 * Lê o corpo vigente da função (via `corpo-vigente.mjs`, nunca copiado) e
 * devolve `{ corpoOriginal, corpoEmulado, arquivo }`.
 */
export async function lerCorpoDaFuncao(nomeFuncao) {
  const cfg = FUNCOES[nomeFuncao]
  if (!cfg) recusar(`função fora do modelo: ${nomeFuncao}`)
  const mod = await corpoVigenteMod()
  const { sql, arquivo } = mod.corpoVigente(`public.${cfg.assinatura}`, RAIZ_REPO)
  const corpoOriginal = extrairCorpo(sql)
  const corpoEmulado = substituirParametros(corpoOriginal, cfg.parametros)
  return { corpoOriginal, corpoEmulado, arquivo, textoCreate: sql }
}

// ---------------------------------------------------------------------------
// 2. A guarda — sobre TODO comando antes de sair do processo
// ---------------------------------------------------------------------------

// Diferença deliberada em relação a `medir-rls.mjs`: `prepare`/`execute`/
// `deallocate` são o MOLDE desta medição (censo-medicao.md §1.8, nota final) —
// aqui eles são permitidos; o resto da lista de escrita/DDL continua proibido.
const PROIBIDAS_DO = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'create', 'alter', 'drop',
  'grant', 'revoke', 'copy', 'call', 'vacuum', 'refresh', 'reindex', 'cluster',
  'lock', 'comment', 'listen', 'notify', 'commit', 'rollback', 'savepoint',
  'discard', 'load', 'import', 'security', 'reassign', 'checkpoint', 'analyse',
]

/** Checagem pragmática do bloco `do $f60$ … end $f60$;` gerado por este módulo. */
export function validarBlocoDo(sql) {
  const t = sql.trim()
  if (!t.startsWith('do $f60$') || !t.endsWith('end $f60$;')) {
    recusar('bloco fora do modelo (do $f60$ … end $f60$;).')
  }
  if (t.split('$f60$').length !== 3) recusar('delimitador $f60$ repetido.')
  const semStrings = t.replace(/'(?:[^']|'')*'/g, "''") // apaga literais para não casar palavra dentro deles
  const minusc = semStrings.toLowerCase()
  for (const p of PROIBIDAS_DO) {
    if (new RegExp(`\\b${p}\\b`).test(minusc)) recusar(`palavra proibida no bloco: "${p}".`)
  }
  if (!/begin\s+perform set_config\('transaction_read_only',\s*'on',\s*true\);/.test(t)) {
    recusar('o bloco não liga transaction_read_only como primeira instrução.')
  }
  if (!/rotulo_de_ambiente\(\)/.test(t)) recusar('o bloco não confere rotulo_de_ambiente().')
  if (!/raise exception 'F60_(MEDICAO|ALVO_RECUSADO|IDENTIDADE_AUSENTE)/.test(t)) {
    recusar('o bloco não termina/recusa por raise exception F60_*.')
  }
  if (!/end\s+\$f60\$;\s*$/.test(t)) recusar('o bloco não termina em end $f60$;.')
  return sql
}

/** Checagem pragmática de uma consulta simples (A2/A3): sem DO, sem escrita/DDL. */
export function validarConsultaSimples(sql) {
  const t = sql.trim()
  if (/\bdo\s+\$/.test(t.toLowerCase())) recusar('consulta simples não pode conter bloco do $...$.')
  const semStrings = t.replace(/'(?:[^']|'')*'/g, "''")
  const minusc = semStrings.toLowerCase()
  for (const p of PROIBIDAS_DO) {
    if (new RegExp(`\\b${p}\\b`).test(minusc)) recusar(`palavra proibida na consulta: "${p}".`)
  }
  return sql
}

function validarDirFora(dir) {
  if (!dir) recusar('--dir é obrigatório.')
  const abs = resolve(dir)
  const rel = relative(RAIZ_REPO, abs)
  if (!rel.startsWith('..') && !isAbsolute(rel) && rel !== '') {
    recusar('--dir dentro do repositório — comandos e respostas moram FORA dele.')
  }
}

function gravar(dir, nome, sql, validador) {
  validarDirFora(dir)
  validador(sql)
  mkdirSync(dir, { recursive: true })
  const caminho = join(dir, `${nome}.sql`)
  writeFileSync(caminho, sql)
  return caminho
}

// ---------------------------------------------------------------------------
// 3. O preâmbulo comum a todo bloco `do $f60$` desta tarefa
// ---------------------------------------------------------------------------

const PREAMBULO = `
  perform set_config('transaction_read_only', 'on', true);

  -- 1. o BANCO confirma o alvo (produção) antes de qualquer medição
  v_rotulo := public.rotulo_de_ambiente();
  if v_rotulo is not null then
    raise exception 'F60_ALVO_RECUSADO rotulo=%', v_rotulo;
  end if;

  -- 2. a identidade, escolhida DENTRO do banco — o id nunca sai daqui
  select p.id into v_uid
    from public.profiles p
   where p.ativo and p.excluido_em is null and p.papel in ('admin', 'dev')
   order by p.id
   limit 1;
  if v_uid is null then
    raise exception 'F60_IDENTIDADE_AUSENTE';
  end if;

  -- 3. a filial de recorte, escolhida DENTRO do banco — só o RÓTULO sai
  select min(id) into v_fa from public.filiais where ativo = true;
  select max(id) into v_fb from public.filiais where ativo = true;
  if v_fa is null or v_fb is null then
    raise exception 'F60_FILIAL_AUSENTE';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
`.trim()

// ---------------------------------------------------------------------------
// 4. A1 — o bloco por função (todas as células: recorte × data/janela × forma)
// ---------------------------------------------------------------------------

function textoFormaA(cfg, nomeFuncao) {
  if (cfg.forma === 'data') {
    const [pFilial, pData] = cfg.parametros
    return (
      `v_json := json_build_object('${pFilial}', v_filial_val, '${pData}', v_data_val)::text;\n` +
      `        execute format('explain (analyze, buffers, format json) select * from json_to_record(%L::json) as pgrst_body(${pFilial} smallint, ${pData} date), lateral public.${nomeFuncao}(${pFilial} := pgrst_body.${pFilial}, ${pData} := pgrst_body.${pData})', v_json) into v_plano;`
    )
  }
  const [pFilial, pDe, pAte] = cfg.parametros
  return (
    `v_json := json_build_object('${pFilial}', v_filial_val, '${pDe}', v_de_val, '${pAte}', v_ate_val)::text;\n` +
    `        execute format('explain (analyze, buffers, format json) select * from json_to_record(%L::json) as pgrst_body(${pFilial} smallint, ${pDe} date, ${pAte} date), lateral public.${nomeFuncao}(${pFilial} := pgrst_body.${pFilial}, ${pDe} := pgrst_body.${pDe}, ${pAte} := pgrst_body.${pAte})', v_json) into v_plano;`
  )
}

function textoFormaB(cfg, nomePrepare) {
  if (cfg.forma === 'data') {
    return `execute format('explain (analyze, buffers, format json) execute ${nomePrepare}(%L, %L)', v_filial_val, v_data_val) into v_plano;`
  }
  return `execute format('explain (analyze, buffers, format json) execute ${nomePrepare}(%L, %L, %L)', v_filial_val, v_de_val, v_ate_val) into v_plano;`
}

// ⚠ jsonb_set com PATH de 2 níveis (array[v_celula, forma]) só cria o ÚLTIMO
// nível se o penúltimo já existir como objeto — sobre '{}'::jsonb ele faz
// NO-OP silencioso (nunca erro), que foi exatamente o defeito medido na
// primeira execução real (v_amostras/v_nos voltaram vazios). A correção é
// achatar a chave num ÚNICO nível: v_celula || '#' || forma.
//
// ⚠ SEGUNDO DEFEITO MEDIDO (2ª execução real, rel_estoque_asof): despejar as
// N amostras CRUAS de cada célula no payload de `raise exception` produz uma
// mensagem de erro tão grande que o CANAL a corta no meio (a resposta do MCP
// chegou visivelmente truncada). A correção é agregar DENTRO do bloco — cada
// forma acumula em arrays PL/pgSQL locais (nunca saem do banco) durante o
// loop de repetições, e só a ESTATÍSTICA (mediana/p95/min/max, já no formato
// da regra 7) entra no jsonb final. Isso também é o formato que a regra 7
// pede, então a análise em JS não precisa recalcular nada.
const ACUMULA_AMOSTRA = (formaLit) => `
        if v_i > 1 then
          v_p := v_plano::jsonb -> 0;
          v_arr_exec_${formaLit} := array_append(v_arr_exec_${formaLit}, (v_p -> 'Execution Time')::text::double precision);
          v_arr_plan_${formaLit} := array_append(v_arr_plan_${formaLit}, (v_p -> 'Planning Time')::text::double precision);
          v_arr_hit_${formaLit}  := array_append(v_arr_hit_${formaLit}, (v_p #> '{Plan,Shared Hit Blocks}')::text::bigint);
          v_arr_read_${formaLit} := array_append(v_arr_read_${formaLit}, (v_p #> '{Plan,Shared Read Blocks}')::text::bigint);
          v_linhas_${formaLit} := (v_p #> '{Plan,Actual Rows}')::text::bigint;
          if v_i = 2 then
            v_chave := v_celula || '#' || '${formaLit}';
            v_nos := jsonb_set(v_nos, array[v_chave], jsonb_build_object(
              'tipos_de_no', jsonb_path_query_array(v_p, 'strict $.**."Node Type"'),
              'relacoes_com_seq_scan', jsonb_path_query_array(v_p, 'strict $.** ? (@."Node Type" == "Seq Scan")."Relation Name"'),
              'indices_usados', jsonb_path_query_array(v_p, 'strict $.**."Index Name"')));
          end if;
        end if;`

/** Fecha a célula: computa a estatística de uma forma a partir dos arrays acumulados e grava em v_amostras. */
const FECHA_CELULA = (formaLit) => `
      select jsonb_build_object(
        'execucao_ms', jsonb_build_object(
          'mediana', round(percentile_cont(0.5) within group (order by t.e)::numeric, 3),
          'p95', round(percentile_cont(0.95) within group (order by t.e)::numeric, 3),
          'min', round(min(t.e)::numeric, 3), 'max', round(max(t.e)::numeric, 3)),
        'planejamento_ms', jsonb_build_object(
          'mediana', round(percentile_cont(0.5) within group (order by t.p)::numeric, 3),
          'p95', round(percentile_cont(0.95) within group (order by t.p)::numeric, 3),
          'min', round(min(t.p)::numeric, 3), 'max', round(max(t.p)::numeric, 3)),
        'buffers_raiz', jsonb_build_object(
          'hit_mediana', round(percentile_cont(0.5) within group (order by t.h)::numeric, 3),
          'read_mediana', round(percentile_cont(0.5) within group (order by t.r)::numeric, 3)),
        'linhas', v_linhas_${formaLit}, 'n', array_length(v_arr_exec_${formaLit}, 1))
      into v_stat_${formaLit}
      from unnest(v_arr_exec_${formaLit}, v_arr_plan_${formaLit}, v_arr_hit_${formaLit}, v_arr_read_${formaLit}) as t(e, p, h, r);
      v_amostras := jsonb_set(v_amostras, array[v_celula || '#' || '${formaLit}'], v_stat_${formaLit});`

/**
 * O bloco `do $f60$ … end $f60$;` de A1 para UMA função: percorre os três
 * recortes (consolidado/filial_a/filial_b) × as células de data/janela da
 * função, medindo as formas (a) e (b) INTERCALADAS (regra 7).
 */
export async function comandoA1(nomeFuncao, { n = N_PADRAO } = {}) {
  const cfg = FUNCOES[nomeFuncao]
  if (!cfg) recusar(`função fora do modelo: ${nomeFuncao}`)
  if (!Number.isInteger(n) || n < 1 || n > 30) recusar('--n precisa ser inteiro entre 1 e 30.')
  const { corpoEmulado, arquivo } = await lerCorpoDaFuncao(nomeFuncao)
  const nomePrepare = `f60_corpo_${nomeFuncao}`
  const tipos = cfg.tipos.join(', ')

  const rotulosCelula = cfg.celulas.map((c) => c.rotulo)
  const declaraCelulas =
    cfg.forma === 'data'
      ? `v_rotulos_data text[] := array[${cfg.celulas.map((c) => `'${c.rotulo}'`).join(', ')}];\n` +
        `  v_valores_data date[] := array[${cfg.celulas.map((c) => c.expr).join(', ')}];`
      : `v_rotulos_janela text[] := array[${cfg.celulas.map((c) => `'${c.rotulo}'`).join(', ')}];\n` +
        `  v_valores_de date[] := array[${cfg.celulas.map((c) => c.deExpr).join(', ')}];\n` +
        `  v_valores_ate date[] := array[${cfg.celulas.map((c) => c.ateExpr).join(', ')}];`

  const resetArrays = `
      v_arr_exec_a := array[]::double precision[]; v_arr_plan_a := array[]::double precision[];
      v_arr_hit_a  := array[]::bigint[];           v_arr_read_a := array[]::bigint[];
      v_arr_exec_b := array[]::double precision[]; v_arr_plan_b := array[]::double precision[];
      v_arr_hit_b  := array[]::bigint[];           v_arr_read_b := array[]::bigint[];`

  const loopInterno =
    cfg.forma === 'data'
      ? `
    for v_di in 1 .. array_length(v_rotulos_data, 1) loop
      v_data_val := v_valores_data[v_di];
      v_celula := v_recorte || '·' || v_rotulos_data[v_di];
${resetArrays}
      for v_i in 1 .. (${n} + 1) loop
        -- forma a: chamada como o PostgREST chama
        ${textoFormaA(cfg, nomeFuncao)}${ACUMULA_AMOSTRA('a')}
        -- forma b: corpo emulado, plano genérico
        ${textoFormaB(cfg, nomePrepare)}${ACUMULA_AMOSTRA('b')}
      end loop;
${FECHA_CELULA('a')}
${FECHA_CELULA('b')}
    end loop;`
      : `
    for v_di in 1 .. array_length(v_rotulos_janela, 1) loop
      v_de_val := v_valores_de[v_di];
      v_ate_val := v_valores_ate[v_di];
      v_celula := v_recorte || '·' || v_rotulos_janela[v_di];
${resetArrays}
      for v_i in 1 .. (${n} + 1) loop
        -- forma a: chamada como o PostgREST chama
        ${textoFormaA(cfg, nomeFuncao)}${ACUMULA_AMOSTRA('a')}
        -- forma b: corpo emulado, plano genérico
        ${textoFormaB(cfg, nomePrepare)}${ACUMULA_AMOSTRA('b')}
      end loop;
${FECHA_CELULA('a')}
${FECHA_CELULA('b')}
    end loop;`

  return `do $f60$
declare
  v_rotulo text;
  v_uid uuid;
  v_fa smallint;
  v_fb smallint;
  v_recortes text[] := array['consolidado', 'filial_a', 'filial_b'];
  ${declaraCelulas}
  v_ri int;
  v_di int;
  v_i int;
  v_recorte text;
  v_filial_val smallint;
  v_data_val date;
  v_de_val date;
  v_ate_val date;
  v_celula text;
  v_chave text;
  v_json text;
  v_plano json;
  v_p jsonb;
  v_arr_exec_a double precision[]; v_arr_plan_a double precision[];
  v_arr_hit_a  bigint[];           v_arr_read_a bigint[];
  v_linhas_a   bigint;             v_stat_a     jsonb;
  v_arr_exec_b double precision[]; v_arr_plan_b double precision[];
  v_arr_hit_b  bigint[];           v_arr_read_b bigint[];
  v_linhas_b   bigint;             v_stat_b     jsonb;
  v_amostras jsonb := '{}'::jsonb;
  v_nos jsonb := '{}'::jsonb;
  v_total_mov bigint;
  v_total_lanc bigint;
begin
  ${PREAMBULO}

  -- 4. prepara o corpo emulado UMA vez, com plano genérico (censo-medicao.md §1.8)
  perform set_config('plan_cache_mode', 'force_generic_plan', true);
  deallocate all;
  execute 'prepare ${nomePrepare}(${tipos}) as ${corpoEmulado.replace(/'/g, "''")}';

  -- 5. as células: recorte × ${cfg.forma === 'data' ? 'data' : 'janela'}, formas a/b intercaladas
  for v_ri in 1 .. array_length(v_recortes, 1) loop
    v_recorte := v_recortes[v_ri];
    v_filial_val := case v_recorte when 'consolidado' then null when 'filial_a' then v_fa when 'filial_b' then v_fb end;
${loopInterno}
  end loop;

  execute format('deallocate %I', '${nomePrepare}');

  -- 6. contexto do volume (números, não linhas)
  execute 'select count(*) from public.movimentacoes' into v_total_mov;
  execute 'select count(*) from public.lancamentos_item' into v_total_lanc;

  raise exception 'F60_MEDICAO %', jsonb_build_object(
    'funcao', '${nomeFuncao}', 'migration_de_origem', '${arquivo}',
    'postgres', current_setting('server_version'), 'papel', current_user,
    'total_movimentacoes', v_total_mov, 'total_lancamentos_item', v_total_lanc,
    'rotulos_celula', to_jsonb(array['${rotulosCelula.join("','")}']),
    'amostras', v_amostras, 'nos', v_nos);
end $f60$;`
}

// ---------------------------------------------------------------------------
// 5. A2 — pg_stat_statements por papel (consulta simples, sem DO)
// ---------------------------------------------------------------------------

export const OITO_REL = [
  'rel_estoque_asof', 'rel_saldo_itens', 'rel_mov_itens', 'rel_frescor_itens',
  'rel_mov_por_mes', 'rel_por_motivo', 'rel_resumo', 'rel_saldo_colaborador',
]

export function comandoA2() {
  const valores = OITO_REL.map((n) => `('${n}')`).join(', ')
  return `select jsonb_build_object(
  'por_papel', coalesce((
    select jsonb_agg(x order by x.nome, x.papel) from (
      select n.nome, r.rolname as papel,
             sum(s.calls) as chamadas,
             round((sum(s.total_exec_time) / nullif(sum(s.calls), 0))::numeric, 2) as media_ms,
             count(*) as formas_de_statement
      from pg_stat_statements s
      join pg_roles r on r.oid = s.userid
      cross join (values ${valores}) as n(nome)
      where s.query ~ ('"' || n.nome || '"\\s*\\(')
      group by n.nome, r.rolname
    ) x
  ), '[]'::jsonb),
  'stats_reset', (select stats_reset from pg_stat_statements_info),
  'agora', now()
) as f60_pgss;`
}

// ---------------------------------------------------------------------------
// 6. A3 — as 12 datas de amostra, por contagem, sem ler linha
// ---------------------------------------------------------------------------

/** Passo 1: os candidatos brutos (nunca lê linha — só min/max/count/group by). */
export function comandoA3Bruto() {
  return `with parametros as (
  select current_date as hoje
),
primeira_mov as (
  select (min(data) - 1) as d from public.movimentacoes
),
golive_compra_julho as (
  select data as d, count(*) as n
  from public.movimentacoes
  where tipo = 'compra' and data >= date '2026-07-01' and data < date '2026-08-01'
  group by data
  order by n desc, data
  limit 1
),
golive_marcador as (
  select data as d, count(*) as n
  from public.movimentacoes
  where observacao = 'carga go-live'
  group by data
  order by n desc, data
  limit 1
),
lote_514 as (
  select date '2026-07-27' as d, count(*) as n
  from public.movimentacoes where data = date '2026-07-27'
),
top_transferencias as (
  select data as d, count(*) as n
  from public.movimentacoes where tipo = 'transferencia'
  group by data order by n desc, data desc limit 3
),
top_estornos as (
  select data as d, count(*) as n
  from public.movimentacoes where tipo = 'estorno'
  group by data order by n desc, data desc limit 3
),
ultima_transferencia as (
  select max(data) as d from public.movimentacoes where tipo = 'transferencia'
),
antes_ultima_transferencia as (
  select (max(data) - 1) as d from public.movimentacoes where tipo = 'transferencia'
),
fim_de_mes as (
  select
    (date_trunc('month', (select hoje from parametros)) - interval '1 day')::date as m1,
    (date_trunc('month', (select hoje from parametros) - interval '1 month') - interval '1 day')::date as m2,
    (date_trunc('month', (select hoje from parametros) - interval '2 month') - interval '1 day')::date as m3,
    (date_trunc('month', (select hoje from parametros) - interval '3 month') - interval '1 day')::date as m4,
    (date_trunc('month', (select hoje from parametros) - interval '4 month') - interval '1 day')::date as m5
)
select jsonb_build_object(
  'hoje', (select hoje from parametros),
  'primeira_mov_menos_1', (select d from primeira_mov),
  'golive_compra_julho', (select jsonb_build_object('data', d, 'contagem', n) from golive_compra_julho),
  'golive_marcador', (select jsonb_build_object('data', d, 'contagem', n) from golive_marcador),
  'lote_514', (select jsonb_build_object('data', d, 'contagem', n) from lote_514),
  'top_transferencias', (select coalesce(jsonb_agg(jsonb_build_object('data', d, 'contagem', n)), '[]'::jsonb) from top_transferencias),
  'top_estornos', (select coalesce(jsonb_agg(jsonb_build_object('data', d, 'contagem', n)), '[]'::jsonb) from top_estornos),
  'ultima_transferencia', (select d from ultima_transferencia),
  'antes_ultima_transferencia', (select d from antes_ultima_transferencia),
  'hoje_menos_7', (select hoje - 7 from parametros),
  'hoje_menos_1', (select hoje - 1 from parametros),
  'fim_de_mes_candidatos', (select jsonb_build_array(m1, m2, m3, m4, m5) from fim_de_mes)
) as f60_datas_bruto;`
}

/** Passo 2: as contagens finais para as 12 datas já escolhidas (datas não são dado pessoal — regra 4). */
export function comandoA3Contagens(datas) {
  if (!Array.isArray(datas) || datas.length === 0) recusar('--datas precisa ser um array não vazio.')
  for (const d of datas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) recusar(`data fora do formato ISO: ${JSON.stringify(d)}`)
  }
  const valores = datas
    .map((d, i) => `(${i + 1}, '${d.rotulo.replace(/'/g, "''")}', date '${d.data}')`)
    .join(',\n  ')
  return `with amostra (ordinal, rotulo, data) as (
  values
  ${valores}
)
select jsonb_agg(jsonb_build_object(
  'rotulo', a.rotulo,
  'data', a.data,
  'contagens', jsonb_build_object(
    'movimentacoes_no_dia', (select count(*) from public.movimentacoes m where m.data = a.data),
    'transferencias_no_dia', (select count(*) from public.movimentacoes m where m.data = a.data and m.tipo = 'transferencia'),
    'estornos_no_dia', (select count(*) from public.movimentacoes m where m.data = a.data and m.tipo = 'estorno')
  )
) order by a.ordinal) as f60_datas_contagens
from amostra a;`
}

// ---------------------------------------------------------------------------
// 7. A4 — a variação do custo com a data (as-of e saldo de itens, consolidado)
// ---------------------------------------------------------------------------

const FUNCOES_A4 = {
  rel_estoque_asof: { campo: 'p_data' },
  rel_saldo_itens: { campo: 'p_ate' },
}

/**
 * UM bloco cobrindo as 12 datas × as 2 funções (consolidado, forma a), N=3
 * (a ordem pede N=3 aqui, não o N=7 padrão da regra 7).
 */
export function comandoA4(datas, { n = 3 } = {}) {
  if (!Array.isArray(datas) || datas.length === 0) recusar('--datas precisa ser um array não vazio.')
  for (const d of datas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) recusar(`data fora do formato ISO: ${d}`)
  }
  if (!Number.isInteger(n) || n < 1 || n > 30) recusar('--n precisa ser inteiro entre 1 e 30.')
  const rotulosDatas = datas.map((_, i) => `'d${i + 1}'`).join(', ')
  const valoresDatas = datas.map((d) => `date '${d}'`).join(', ')
  const rotulosFn = Object.keys(FUNCOES_A4)

  // Mesma correção de A1: agrega DENTRO do bloco (arrays locais, nunca saem do
  // banco) e só a estatística entra no jsonb final — despejar as N amostras
  // cruas de 24 células truncou a resposta do canal (ver ACUMULA_AMOSTRA/FECHA_CELULA).
  const chamadasPorFuncao = rotulosFn
    .map((fn) => {
      const campo = FUNCOES_A4[fn].campo
      return `
      v_celula := 'consolidado·' || v_rotulos_data[v_di] || '·${fn}';
      v_arr_exec := array[]::double precision[]; v_arr_plan := array[]::double precision[];
      v_arr_hit  := array[]::bigint[];           v_arr_read := array[]::bigint[];
      for v_i in 1 .. (${n} + 1) loop
        v_json := json_build_object('p_filial', null, '${campo}', v_data_val)::text;
        execute format('explain (analyze, buffers, format json) select * from json_to_record(%L::json) as pgrst_body(p_filial smallint, ${campo} date), lateral public.${fn}(p_filial := pgrst_body.p_filial, ${campo} := pgrst_body.${campo})', v_json) into v_plano;
        if v_i > 1 then
          v_p := v_plano::jsonb -> 0;
          v_arr_exec := array_append(v_arr_exec, (v_p -> 'Execution Time')::text::double precision);
          v_arr_plan := array_append(v_arr_plan, (v_p -> 'Planning Time')::text::double precision);
          v_arr_hit  := array_append(v_arr_hit, (v_p #> '{Plan,Shared Hit Blocks}')::text::bigint);
          v_arr_read := array_append(v_arr_read, (v_p #> '{Plan,Shared Read Blocks}')::text::bigint);
          v_linhas := (v_p #> '{Plan,Actual Rows}')::text::bigint;
        end if;
      end loop;
      select jsonb_build_object(
        'execucao_ms', jsonb_build_object(
          'mediana', round(percentile_cont(0.5) within group (order by t.e)::numeric, 3),
          'p95', round(percentile_cont(0.95) within group (order by t.e)::numeric, 3),
          'min', round(min(t.e)::numeric, 3), 'max', round(max(t.e)::numeric, 3)),
        'planejamento_ms', jsonb_build_object(
          'mediana', round(percentile_cont(0.5) within group (order by t.p)::numeric, 3),
          'p95', round(percentile_cont(0.95) within group (order by t.p)::numeric, 3),
          'min', round(min(t.p)::numeric, 3), 'max', round(max(t.p)::numeric, 3)),
        'buffers_raiz', jsonb_build_object(
          'hit_mediana', round(percentile_cont(0.5) within group (order by t.h)::numeric, 3),
          'read_mediana', round(percentile_cont(0.5) within group (order by t.r)::numeric, 3)),
        'linhas', v_linhas, 'n', array_length(v_arr_exec, 1))
      into v_stat
      from unnest(v_arr_exec, v_arr_plan, v_arr_hit, v_arr_read) as t(e, p, h, r);
      v_amostras := jsonb_set(v_amostras, array[v_celula], v_stat);`
    })
    .join('\n')

  return `do $f60$
declare
  v_rotulo text;
  v_uid uuid;
  v_fa smallint;
  v_fb smallint;
  v_rotulos_data text[] := array[${rotulosDatas}];
  v_valores_data date[] := array[${valoresDatas}];
  v_di int;
  v_i int;
  v_data_val date;
  v_celula text;
  v_json text;
  v_plano json;
  v_p jsonb;
  v_arr_exec double precision[]; v_arr_plan double precision[];
  v_arr_hit  bigint[];           v_arr_read bigint[];
  v_linhas   bigint;             v_stat     jsonb;
  v_amostras jsonb := '{}'::jsonb;
begin
  ${PREAMBULO}

  for v_di in 1 .. array_length(v_rotulos_data, 1) loop
    v_data_val := v_valores_data[v_di];
${chamadasPorFuncao}
  end loop;

  raise exception 'F60_MEDICAO_A4 %', jsonb_build_object(
    'postgres', current_setting('server_version'), 'papel', current_user,
    'datas_por_rotulo', to_jsonb(v_rotulos_data), 'n', ${n},
    'amostras', v_amostras);
end $f60$;`
}

// ---------------------------------------------------------------------------
// 8. Leitura da resposta gravada do canal MCP
// ---------------------------------------------------------------------------

/** Acha `<marca> {…}` (contando chaves) dentro do texto/erro devolvido pelo MCP. */
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
  if (i === -1) recusar(`resposta sem ${marca} — o bloco não chegou ao fim, ou é outra marca.`)
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

/** Para uma consulta simples (A2/A3): lê o resultado do MCP (linhas/JSON), sem marca. */
export function lerResultadoSimples(texto) {
  const j = JSON.parse(texto)
  // O formato do execute_sql do MCP é uma lista de linhas (array de objetos).
  if (Array.isArray(j)) return j
  if (Array.isArray(j?.rows)) return j.rows
  return j
}

/** Mediana e p95 por posto mais próximo. */
export function estatistica(valores) {
  const v = valores.filter((x) => x !== null && x !== undefined).map(Number).sort((a, b) => a - b)
  if (v.length === 0) return { mediana: null, p95: null, min: null, max: null, n: 0 }
  const posto = (q) => v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)]
  const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  const r = (x) => Math.round(x * 1000) / 1000
  return { mediana: r(med), p95: r(posto(0.95)), min: r(v[0]), max: r(v.at(-1)), n: v.length }
}

function distinto(arr) {
  return [...new Set((arr ?? []).map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x))
}

/**
 * Resume o payload de A1 (uma função) em células {funcao, recorte, celula, forma, ...}.
 * As chaves de `amostras`/`nos` são achatadas em UM nível: `<recorte>·<rotulo>#<forma>`
 * (jsonb_set não cria dois níveis de caminho ausente de uma vez — ver comentário de
 * `ACUMULA_AMOSTRA`); `amostras[chave]` já vem AGREGADO de dentro do banco
 * (mediana/p95/min/max — ver `FECHA_CELULA`), então esta função só reorganiza, nunca
 * recalcula estatística.
 */
export function resumirA1(payload) {
  const celulas = []
  const porCelula = new Map() // "recorte·rotulo" -> { a: statObj, b: statObj }
  for (const [chaveAchatada, stat] of Object.entries(payload.amostras ?? {})) {
    const i = chaveAchatada.lastIndexOf('#')
    const celula = chaveAchatada.slice(0, i)
    const forma = chaveAchatada.slice(i + 1)
    if (!porCelula.has(celula)) porCelula.set(celula, {})
    porCelula.get(celula)[forma] = stat
  }
  for (const [celula, porForma] of porCelula) {
    const [recorte, rotuloCelula] = celula.split('·')
    for (const forma of ['a', 'b']) {
      const stat = porForma[forma]
      if (!stat) continue
      const chaveAchatada = `${celula}#${forma}`
      celulas.push({
        funcao: payload.funcao,
        recorte,
        celula: rotuloCelula,
        forma: forma === 'a' ? 'chamada_rpc' : 'corpo_emulado',
        execucao_ms: stat.execucao_ms,
        planejamento_ms: stat.planejamento_ms,
        buffers_raiz: stat.buffers_raiz,
        linhas: stat.linhas,
        n: stat.n,
        tipos_de_no: distinto(payload.nos?.[chaveAchatada]?.tipos_de_no ?? []),
        relacoes_com_seq_scan: distinto(payload.nos?.[chaveAchatada]?.relacoes_com_seq_scan ?? []),
        indices_usados: distinto(payload.nos?.[chaveAchatada]?.indices_usados ?? []),
      })
    }
    const statA = porForma.a
    const statB = porForma.b
    const linhasConferem = statA !== undefined && statB !== undefined && statA.linhas === statB.linhas
    for (const c of celulas) {
      if (c.funcao === payload.funcao && c.recorte === recorte && c.celula === rotuloCelula) {
        c.linhas_conferem = linhasConferem
      }
    }
  }
  return { funcao: payload.funcao, migration_de_origem: payload.migration_de_origem, postgres: payload.postgres, papel: payload.papel, total_movimentacoes: payload.total_movimentacoes, total_lancamentos_item: payload.total_lancamentos_item, celulas }
}

export function resumirA4(payload) {
  const celulas = []
  for (const [chave, stat] of Object.entries(payload.amostras ?? {})) {
    const [recorte, rotuloData, funcao] = chave.split('·')
    celulas.push({
      funcao,
      recorte,
      data_rotulo: rotuloData,
      execucao_ms: stat.execucao_ms,
      planejamento_ms: stat.planejamento_ms,
      buffers_raiz: stat.buffers_raiz,
      linhas: stat.linhas,
      n: stat.n,
    })
  }
  return { n: payload.n, postgres: payload.postgres, papel: payload.papel, celulas }
}

function shaDoCodigo() {
  try {
    return execSync('git rev-parse HEAD', { cwd: RAIZ_REPO, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 9. CLI
// ---------------------------------------------------------------------------

function args(argv) {
  const [modo, ...resto] = argv
  const o = { modo }
  for (let i = 0; i < resto.length; i++) {
    const m = /^--([a-zA-Z0-9-]+)(?:=(.*))?$/.exec(resto[i])
    if (!m) recusar(`argumento não reconhecido: ${resto[i]}`)
    o[m[1]] = m[2] ?? resto[++i]
  }
  return o
}

async function main() {
  const o = args(process.argv.slice(2))
  const modosValidos = [
    'gerar-a1', 'gerar-a2', 'gerar-a3-bruto', 'gerar-a3-contagens', 'gerar-a4',
    'analisar-a1', 'analisar-a2', 'analisar-a3', 'analisar-a4',
  ]
  if (!modosValidos.includes(o.modo)) recusar(`modo: ${modosValidos.join(' | ')}.`)

  if (o.modo === 'gerar-a1') {
    if (!o.funcao) recusar('--funcao é obrigatório (uma das sete rel_*).')
    const sql = await comandoA1(o.funcao, { n: o.n ? Number(o.n) : N_PADRAO })
    const caminho = gravar(o.dir, `a1-${o.funcao}`, sql, validarBlocoDo)
    console.log(JSON.stringify({ gravado: caminho }, null, 2))
    return
  }
  if (o.modo === 'gerar-a2') {
    const sql = comandoA2()
    const caminho = gravar(o.dir, 'a2-pgss', sql, validarConsultaSimples)
    console.log(JSON.stringify({ gravado: caminho }, null, 2))
    return
  }
  if (o.modo === 'gerar-a3-bruto') {
    const sql = comandoA3Bruto()
    const caminho = gravar(o.dir, 'a3-bruto', sql, validarConsultaSimples)
    console.log(JSON.stringify({ gravado: caminho }, null, 2))
    return
  }
  if (o.modo === 'gerar-a3-contagens') {
    if (!o.datas) recusar('--datas é obrigatório (JSON: [{"rotulo":"...","data":"AAAA-MM-DD"}, ...]).')
    const datas = JSON.parse(o.datas)
    const sql = comandoA3Contagens(datas)
    const caminho = gravar(o.dir, 'a3-contagens', sql, validarConsultaSimples)
    console.log(JSON.stringify({ gravado: caminho }, null, 2))
    return
  }
  if (o.modo === 'gerar-a4') {
    if (!o.datas) recusar('--datas é obrigatório (JSON: ["AAAA-MM-DD", ...]).')
    const datas = JSON.parse(o.datas)
    const sql = comandoA4(datas, { n: o.n ? Number(o.n) : 3 })
    const caminho = gravar(o.dir, 'a4-datas', sql, validarBlocoDo)
    console.log(JSON.stringify({ gravado: caminho }, null, 2))
    return
  }

  validarDirFora(o.dir)
  if (!o.saida) recusar('--saida é obrigatório na análise.')

  if (o.modo === 'analisar-a1') {
    const funcoes = Object.keys(FUNCOES)
    const resultado = { rotulo: 'f60-motor-antes-producao', alvo: 'producao', sha_codigo: shaDoCodigo(), gerado_em: new Date().toISOString(), metodo: 'explain (analyze, buffers, format json); forma (a) = chamada como o PostgREST chama (json_to_record + lateral); forma (b) = corpo emulado, prepare/execute com plan_cache_mode=force_generic_plan; 1 aquecimento + N repetições intercaladas a/b; mediana e p95 por posto mais próximo; buffers do nó raiz do plano.', funcoes: [], pendencias: [] }
    for (const fn of funcoes) {
      const caminho = join(o.dir, 'respostas', `a1-${fn}.resposta.txt`)
      if (!existsSync(caminho)) {
        resultado.pendencias.push({ funcao: fn, motivo: 'sem resposta gravada do canal' })
        continue
      }
      const p = lerPayload(readFileSync(caminho, 'utf8'), 'F60_MEDICAO')
      if (p.recusa) {
        resultado.pendencias.push({ funcao: fn, motivo: p.recusa })
        continue
      }
      resultado.funcoes.push(resumirA1(p))
    }
    writeFileSync(o.saida, JSON.stringify(resultado, null, 2) + '\n')
    console.log(`gravado ${o.saida}: ${resultado.funcoes.length} função(ões), ${resultado.pendencias.length} pendência(s)`)
    return
  }

  if (o.modo === 'analisar-a2') {
    const caminho = join(o.dir, 'respostas', 'a2-pgss.resposta.txt')
    if (!existsSync(caminho)) recusar(`sem resposta gravada: ${caminho}`)
    const linhas = lerResultadoSimples(readFileSync(caminho, 'utf8'))
    const payload = linhas[0]?.f60_pgss ?? linhas[0]
    const saida = {
      rotulo: 'f60-pgss-antes', alvo: 'producao', sha_codigo: shaDoCodigo(), gerado_em: new Date().toISOString(),
      metodo: 'pg_stat_statements, filtrado por s.query ~ (\'"\' || nome || \'"\\s*\\(\') — só as chamadas citadas entre aspas, como o PostgREST cita; nunca o texto do statement.',
      ...payload,
    }
    writeFileSync(o.saida, JSON.stringify(saida, null, 2) + '\n')
    console.log(`gravado ${o.saida}`)
    return
  }

  if (o.modo === 'analisar-a3') {
    const brutoPath = join(o.dir, 'respostas', 'a3-bruto.resposta.txt')
    const contagensPath = join(o.dir, 'respostas', 'a3-contagens.resposta.txt')
    if (!existsSync(brutoPath)) recusar(`sem resposta gravada: ${brutoPath}`)
    if (!existsSync(contagensPath)) recusar(`sem resposta gravada: ${contagensPath}. Rode gerar-a3-contagens primeiro.`)
    const contagens = lerResultadoSimples(readFileSync(contagensPath, 'utf8'))
    const linhas = contagens[0]?.f60_datas_contagens ?? contagens
    const saida = {
      rotulo: 'f60-datas-amostra', alvo: 'producao', sha_codigo: shaDoCodigo(), gerado_em: new Date().toISOString(),
      metodo: 'datas escolhidas por consulta de contagem (min/max/group by), sem ler linha; datas não são dado pessoal (regra 4).',
      datas: (Array.isArray(linhas) ? linhas : []).map((l) => ({ data: l.data, motivo: l.rotulo, contagens: l.contagens })),
    }
    writeFileSync(o.saida, JSON.stringify(saida, null, 2) + '\n')
    console.log(`gravado ${o.saida}: ${saida.datas.length} data(s)`)
    return
  }

  if (o.modo === 'analisar-a4') {
    const caminho = join(o.dir, 'respostas', 'a4-datas.resposta.txt')
    if (!existsSync(caminho)) recusar(`sem resposta gravada: ${caminho}`)
    const p = lerPayload(readFileSync(caminho, 'utf8'), 'F60_MEDICAO_A4')
    if (p.recusa) recusar(p.recusa)
    const resumo = resumirA4(p)
    let base = {}
    if (existsSync(o.saida)) base = JSON.parse(readFileSync(o.saida, 'utf8'))
    base.a4_variacao_por_data = { gerado_em: new Date().toISOString(), ...resumo }
    writeFileSync(o.saida, JSON.stringify(base, null, 2) + '\n')
    console.log(`gravado ${o.saida} (seção a4_variacao_por_data): ${resumo.celulas.length} célula(s)`)
    return
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Recusa ? err.message : `medir-rel: ERRO — ${err.stack}`)
    process.exit(1)
  })
}

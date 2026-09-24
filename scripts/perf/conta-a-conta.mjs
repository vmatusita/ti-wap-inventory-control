#!/usr/bin/env node
// ---------------------------------------------------------------------------
// conta-a-conta.mjs — a prova de que NADA MUDA PARA A WAP, conta a conta (F66, decisão 2 do Johnny)
// ---------------------------------------------------------------------------
// A F66 escreve o recorte de empresa nas policies EM CONJUNÇÃO com o piso de hoje, e troca a regra de escrita por
// unidade (`pode_escrever_filial(filial_id)`) pela forma de PARES sobre `unidades_de_escrita()`. Com uma empresa só, a
// leitura é inerte por construção e a escrita é equivalente — e esta prova mostra isso no banco de verdade, para CADA
// membership ativa, sem que um id, um nome ou um cargo por pessoa atravesse o canal. Sai só contagem.
//
//   node scripts/perf/conta-a-conta.mjs gerar    --alvo ensaio|producao --ref <ref> --fase emulada|real --dir <fora>
//   node scripts/perf/conta-a-conta.mjs gerar    --alvo ensaio --ref <ref> --fase emulada --sabotar --dir <fora>
//   node scripts/perf/conta-a-conta.mjs analisar --alvo … --ref … --fase … [--sabotar] --dir <mesma> --saida <json>
//   node scripts/perf/conta-a-conta.mjs embrulhar --arquivo <bloco.sql fora do repo> --instrumento medir-rls|conta
//        (grava <bloco>.canal.sql: o invólucro do canal MCP — ver `involucroDoCanal`)
//
// O BLOCO (um `do $f66$ … $f66$;` que termina SEMPRE em `raise exception` — nunca se confirma):
//   0. `transaction_read_only = on`; o banco confirma o alvo (`rotulo_de_ambiente()`: 'desenvolvimento' no ensaio,
//      NULL em produção); a sabotagem só roda no ensaio.
//   1. as TABELAS — lidas do catálogo, nunca de lista: toda tabela de `public` com `empresa_id` e policy de SELECT, com
//      a CLASSE da leitura (a policy de SELECT por `e_admin()` → `empresas_de_admin()`; a do piso `papel_atual()` →
//      `empresas_do_membro()` — a tabela-verdade do PLAN-F66, decisão 2); o total de cada uma, como o dono;
//   2. a ESCRITA — para cada membership ativa (a identidade escolhida DENTRO do banco; as claims dela na sessão; as
//      funções `security definer` leem `auth.uid()` das claims) e cada filial:
//        `pode_escrever_filial(f)` = `(empresa legada, f) ∈ unidades_de_escrita()`;
//      e, por membership, `pode_escrever()` = legada ∈ `empresas_de_escrita()` e `e_admin()` = legada ∈
//      `empresas_de_admin()`;
//   3. a LEITURA — como `authenticated`, com as claims de cada membership, em cada tabela:
//        fase `emulada` (ANTES do apply): a policy de HOJE × a policy de hoje ∧ o termo emulado, NO MESMO STATEMENT
//                                          (`count(*)` × `count(*) filter (where empresa_id = any (array (…)))`);
//        fase `real`    (DEPOIS de cada lote): a policy REAL × o universo que o piso de hoje daria à conta (o total
//                                          como o dono, se o piso passa; zero, se não passa);
//      e, nas duas fases, o visto × o piso (a policy de SELECT de hoje é o piso puro: tudo ou nada);
//   4. de volta ao dono, o total de cada tabela de novo: se mudou no meio do bloco (o app escrevendo), a comparação
//      daquela tabela é CORRIDA — contada à parte, e o bloco se roda de novo; não é divergência nem aprovação.
//
// A SABOTAGEM (só no ensaio, `--sabotar`): o bloco inverte de propósito UMA comparação de escrita (o par) e UMA de
// leitura (o termo), e TEM de devolver divergência > 0 — a prova de que ele sabe achar diferença (sabotagem G).
//
// FALHA FECHADA — o que este arquivo recusa ANTES de gravar qualquer comando: alvo/ref trocados (os refs vêm de
// `scripts/env-guard.ts`); sabotagem fora do ensaio; e todo comando que não seja, BYTE A BYTE, um que este script gera
// (`validarComando`), depois das conferências de vocabulário (palavra de escrita/DDL, GUC fora da lista, função fora da
// lista, `execute` fora do modelo) — o molde do `medir-rls.mjs` (F59).
//
// O QUE ESTA PROVA NÃO PROVA: que uma SEGUNDA empresa fica isolada (isso é `isolamento_tenant.sql`, no CI, com
// empresas fictícias); nem que a escrita pelas funções `security definer` recorta (elas atravessam a RLS — F67).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { lexar } from '../db/predicado-policies.mjs'
import { validarAlvo, validarComando as validarMedicao } from './medir-rls.mjs'

const RAIZ = process.cwd()

export const FASES = ['emulada', 'real']

export class Recusa extends Error {}

function recusar(msg) {
  throw new Recusa(`conta-a-conta: RECUSADO — ${msg}`)
}

// ---------------------------------------------------------------------------
// O comando — modelo FECHADO
// ---------------------------------------------------------------------------

/** O bloco da prova conta a conta. `sabotar` só no ensaio. */
export function comandoConta({ alvo, fase, sabotar = false }) {
  if (!['ensaio', 'producao'].includes(alvo)) recusar(`alvo ${alvo}`)
  if (!FASES.includes(fase)) recusar(`--fase "${fase}" não existe — só emulada|real.`)
  if (typeof sabotar !== 'boolean') recusar('sabotar tem de ser booleano.')
  if (sabotar && alvo !== 'ensaio') recusar('a sabotagem roda só no ensaio.')
  return `do $f66$
declare
  v_alvo     constant text    := '${alvo}';
  v_fase     constant text    := '${fase}';
  v_sabotar  constant boolean := ${sabotar};
  v_rotulo   text;
  v_emp      uuid;
  v_uid      uuid;
  v_uids     uuid[] := '{}';
  v_fid      smallint;
  v_k        int;
  v_tabs     text[];
  v_fns      text[];
  v_pisos    text[];
  v_tot      bigint[];
  v_total    bigint;
  v_visto    bigint;
  v_termo    bigint;
  v_piso     boolean;
  v_esperado boolean;
  v_obtido   boolean;
  v_membros  int := 0;
  v_pares    int := 0;
  v_leituras int := 0;
  v_corrida  int := 0;
  v_div_fil  int := 0;
  v_div_esc  int := 0;
  v_div_adm  int := 0;
  v_div_lei  int := 0;
  v_div_piso int := 0;
  v_por_tab  jsonb := '{}';
  v_corridas jsonb := '[]';
-- 0. nada nesta transação grava; e ela nunca se confirma (termina em raise exception)
begin
  perform set_config('transaction_read_only', 'on', true);

  -- o BANCO confirma o alvo, antes de qualquer leitura
  v_rotulo := public.rotulo_de_ambiente();
  if (v_alvo = 'ensaio' and v_rotulo is distinct from 'desenvolvimento')
     or (v_alvo = 'producao' and v_rotulo is not null) then
    raise exception 'F66_ALVO_RECUSADO alvo=% rotulo=%', v_alvo, coalesce(v_rotulo, '(null)');
  end if;
  if v_sabotar and v_alvo <> 'ensaio' then
    raise exception 'F66_SABOTAGEM_FORA_DO_ENSAIO alvo=%', v_alvo;
  end if;
  v_emp := public.empresa_legada();

  -- 1. as TABELAS, do catálogo, com a classe da leitura; o total de cada uma, como o dono
  select array_agg(t.tabela order by t.tabela), array_agg(t.fn order by t.tabela), array_agg(t.piso order by t.tabela)
    into v_tabs, v_fns, v_pisos
    from (select p.tablename::text as tabela,
                 case when bool_or(p.qual ilike '%e_admin%') then 'empresas_de_admin' else 'empresas_do_membro' end as fn,
                 case when bool_or(p.qual ilike '%e_admin%') then 'e_admin' else 'papel_atual' end as piso
            from pg_policies p
           where p.schemaname = 'public' and p.cmd = 'SELECT'
             and exists (select 1 from pg_attribute a
                          where a.attrelid = ('public.' || quote_ident(p.tablename))::regclass
                            and a.attname = 'empresa_id' and not a.attisdropped)
           group by p.tablename) as t;
  v_tot := '{}';
  for v_k in 1 .. coalesce(array_length(v_tabs, 1), 0) loop
    execute format('select count(*) from public.%I', v_tabs[v_k]) into v_total;
    v_tot := v_tot || v_total;
  end loop;

  -- 2. a ESCRITA, membership a membership (as claims na sessão; as funções leem auth.uid() delas)
  for v_uid in select distinct m.profile_id from public.membros m where m.ativo order by m.profile_id loop
    v_membros := v_membros + 1;
    v_uids := v_uids || v_uid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    for v_fid in select f.id from public.filiais f order by f.id loop
      v_pares := v_pares + 1;
      v_esperado := coalesce(public.pode_escrever_filial(v_fid), false);
      v_obtido := exists (select 1 from public.unidades_de_escrita() u where u.empresa_id = v_emp and u.filial_id = v_fid);
      if v_sabotar and v_pares = 1 then
        v_obtido := not v_obtido;
      end if;
      if v_esperado is distinct from v_obtido then
        v_div_fil := v_div_fil + 1;
      end if;
    end loop;
    if coalesce(public.pode_escrever(), false) is distinct from (v_emp in (select public.empresas_de_escrita())) then
      v_div_esc := v_div_esc + 1;
    end if;
    if coalesce(public.e_admin(), false) is distinct from (v_emp in (select public.empresas_de_admin())) then
      v_div_adm := v_div_adm + 1;
    end if;
  end loop;

  -- 3. a LEITURA, como authenticated, membership a membership — a lista veio do passo 2, lida como o DONO (sob
  --    authenticated a própria policy de membros filtraria as memberships que o bloco percorre)
  perform set_config('role', 'authenticated', true);
  foreach v_uid in array v_uids loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    for v_k in 1 .. coalesce(array_length(v_tabs, 1), 0) loop
      v_leituras := v_leituras + 1;
      v_piso := case v_pisos[v_k] when 'e_admin' then coalesce(public.e_admin(), false)
                                  else public.papel_atual() is not null end;
      if v_fase = 'emulada' then
        -- a policy de HOJE × a policy de hoje ∧ o termo emulado, no mesmo statement
        if v_fns[v_k] = 'empresas_de_admin' then
          execute format('select count(*), count(*) filter (where empresa_id = any (array (select public.empresas_de_admin()))) from public.%I', v_tabs[v_k]) into v_visto, v_termo;
        else
          execute format('select count(*), count(*) filter (where empresa_id = any (array (select public.empresas_do_membro()))) from public.%I', v_tabs[v_k]) into v_visto, v_termo;
        end if;
      else
        -- a policy REAL × o universo que o piso de hoje daria à conta
        execute format('select count(*) from public.%I', v_tabs[v_k]) into v_visto;
        v_termo := case when v_piso then v_tot[v_k] else 0 end;
      end if;
      if v_sabotar and v_leituras = 1 then
        v_termo := v_termo + 1;
      end if;
      if v_visto is distinct from v_termo then
        v_div_lei := v_div_lei + 1;
        v_por_tab := jsonb_set(v_por_tab, array[v_tabs[v_k]], to_jsonb(coalesce((v_por_tab ->> v_tabs[v_k])::int, 0) + 1));
      end if;
      -- a policy de SELECT de hoje é o piso puro (tudo ou nada): na fase emulada, o visto tem de ser o total ou zero
      if v_fase = 'emulada' and v_visto is distinct from (case when v_piso then v_tot[v_k] else 0 end) then
        v_div_piso := v_div_piso + 1;
      end if;
    end loop;
  end loop;

  -- 4. de volta ao dono: o total de novo — se mudou no meio do bloco, a tabela é CORRIDA, não divergência
  perform set_config('role', 'none', true);
  for v_k in 1 .. coalesce(array_length(v_tabs, 1), 0) loop
    execute format('select count(*) from public.%I', v_tabs[v_k]) into v_total;
    if v_total is distinct from v_tot[v_k] then
      v_corrida := v_corrida + 1;
      v_corridas := v_corridas || to_jsonb(v_tabs[v_k]);
    end if;
  end loop;

  raise exception 'F66_CONTA %', jsonb_build_object(
    '_canal', repeat('.', 120000),
    'alvo', v_alvo, 'fase', v_fase, 'sabotar', v_sabotar,
    'postgres', current_setting('server_version'),
    'memberships', v_membros, 'tabelas', coalesce(array_length(v_tabs, 1), 0), 'pares', v_pares, 'leituras', v_leituras,
    'tabelas_lidas', to_jsonb(v_tabs),
    'classes', jsonb_build_object('empresas_de_admin', (select count(*) from unnest(v_fns) x where x = 'empresas_de_admin'),
                                  'empresas_do_membro', (select count(*) from unnest(v_fns) x where x = 'empresas_do_membro')),
    'divergencias', jsonb_build_object('escrita_filial', v_div_fil, 'escrita_empresa', v_div_esc,
                                       'administracao', v_div_adm, 'leitura', v_div_lei, 'leitura_x_piso', v_div_piso),
    'divergencias_de_leitura_por_tabela', v_por_tab,
    'corrida', v_corrida, 'tabelas_em_corrida', v_corridas);
end $f66$;`
}

// ---------------------------------------------------------------------------
// A guarda — roda sobre TODO comando antes de ele sair do processo
// ---------------------------------------------------------------------------

const PROIBIDAS = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'create', 'alter', 'drop', 'grant', 'revoke',
  'copy', 'call', 'vacuum', 'refresh', 'reindex', 'cluster', 'lock', 'comment', 'listen', 'notify',
  'commit', 'rollback', 'savepoint', 'prepare', 'deallocate', 'discard', 'load', 'import', 'security',
  'reassign', 'checkpoint', 'set', 'reset', 'analyse', 'analyze', 'do', 'explain',
]
const GUCS_PERMITIDOS = ['transaction_read_only', 'role', 'request.jwt.claims']
/** As ÚNICAS funções que o bloco chama, pelo nome (o último, sem schema). */
const FUNCOES_PERMITIDAS = new Set([
  'set_config', 'current_setting', 'rotulo_de_ambiente', 'empresa_legada',
  'pode_escrever_filial', 'unidades_de_escrita', 'pode_escrever', 'empresas_de_escrita', 'e_admin',
  'empresas_de_admin', 'papel_atual', 'empresas_do_membro',
  'json_build_object', 'jsonb_build_object', 'jsonb_set', 'to_jsonb', 'array_agg', 'bool_or',
  'coalesce', 'array_length', 'format', 'count', 'unnest', 'quote_ident',
  // o ENCHIMENTO do canal ('_canal' no payload): a resposta grande cai em arquivo e é EXTRAÍDA, nunca transcrita
  'repeat',
])
/** Os ÚNICOS `execute` do modelo — o texto exato, espaço normalizado. */
const EXECUTES_PERMITIDOS = new Set(
  [
    "execute format('select count(*) from public.%I', v_tabs[v_k]) into v_total;",
    "execute format('select count(*), count(*) filter (where empresa_id = any (array (select public.empresas_de_admin()))) from public.%I', v_tabs[v_k]) into v_visto, v_termo;",
    "execute format('select count(*), count(*) filter (where empresa_id = any (array (select public.empresas_do_membro()))) from public.%I', v_tabs[v_k]) into v_visto, v_termo;",
    "execute format('select count(*) from public.%I', v_tabs[v_k]) into v_visto;",
  ].map((s) => s.replace(/\s+/g, ' ')),
)
const PROIBIDAS_EM_LITERAL = ['into', 'for', 'share', 'nowait']
const ABREM_PARENTESE = new Set([
  'if', 'elsif', 'or', 'and', 'not', 'in', 'any', 'all', 'some', 'exists', 'array', 'values',
  'when', 'then', 'else', 'over', 'filter', 'using', 'into', 'select', 'from', 'where', 'on', 'is', 'case',
  'return', 'loop', 'begin', 'end', 'perform', 'raise', 'declare', 'with', 'lateral', 'exception', 'by',
])

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
    } else if (t.tipo === 'str' && profundidade < 2) {
      const dentro = palavrasDeCodigo(t.v, profundidade + 1)
      palavras.push(...dentro.palavras)
      chamadas.push(...dentro.chamadas)
    }
  })
  return { palavras, chamadas, comentarios: lexado.comentarios }
}

/** Recusa o comando que não seja um bloco da prova, só leitura. Devolve o comando se passar. */
export function validarComando(sql) {
  if (typeof sql !== 'string' || sql.length === 0) recusar('comando vazio.')
  const t = sql.trim()
  if (!t.startsWith('do $f66$') || !t.endsWith('end $f66$;')) recusar('comando fora do modelo (do $f66$ … end $f66$;).')
  if (t.split('$f66$').length !== 3) recusar('delimitador $f66$ repetido — um segundo bloco escondido.')
  const corpo = t.slice('do $f66$'.length, t.length - '$f66$;'.length)
  const { palavras, chamadas, comentarios } = palavrasDeCodigo(corpo)
  const codigo = corpo.split('')
  for (const [a, b] of comentarios) for (let k = a; k < b; k++) codigo[k] = ' '
  const semComentario = codigo.join('')

  if (!/\bbegin\s+perform set_config\('transaction_read_only', 'on', true\);/.test(semComentario)) {
    recusar('o bloco não liga transaction_read_only antes de tudo.')
  }
  if (!/raise exception 'F66_CONTA %', jsonb_build_object\([\s\S]*\);\s*end\s*$/.test(semComentario)) {
    recusar('o bloco não termina em raise exception — ele poderia se confirmar.')
  }
  for (const p of PROIBIDAS) {
    if (palavras.includes(p)) recusar(`palavra proibida no comando: "${p}".`)
  }
  for (const f of chamadas) {
    if (!FUNCOES_PERMITIDAS.has(f)) recusar(`chamada a função fora do modelo: "${f}(…)".`)
  }
  const porGuc = new Map()
  for (const m of semComentario.matchAll(/set_config\(\s*'([^']+)'\s*,\s*([^,]+),/g)) {
    if (!GUCS_PERMITIDOS.includes(m[1])) recusar(`set_config de "${m[1]}" fora da lista permitida.`)
    if (m[1] === 'role' && !["'authenticated'", "'none'"].includes(m[2].trim())) {
      recusar('troca de papel para outro que não authenticated (ou a volta ao dono).')
    }
    if (m[1] === 'transaction_read_only' && m[2].trim() !== "'on'") recusar('transaction_read_only com valor que não é on.')
    porGuc.set(m[1], (porGuc.get(m[1]) ?? 0) + 1)
  }
  if (porGuc.get('transaction_read_only') !== 1) recusar('transaction_read_only ligado mais de uma vez — ou nenhuma.')
  if ((porGuc.get('role') ?? 0) !== 2) recusar('o papel troca exatamente duas vezes (para authenticated e de volta).')
  const chamadasSetConfig = palavras.filter((p) => p === 'set_config').length
  if (chamadasSetConfig !== [...semComentario.matchAll(/set_config\(\s*'[^']+'\s*,/g)].length) {
    recusar('set_config com nome de parâmetro que não é literal.')
  }
  const executes = [...semComentario.matchAll(/\bexecute\b[\s\S]*?;/g)].map((m) => m[0].replace(/\s+/g, ' '))
  for (const e of executes) {
    if (!EXECUTES_PERMITIDOS.has(e)) recusar(`execute fora do modelo: "${e.slice(0, 120)}".`)
  }
  if (palavras.filter((p) => p === 'execute').length !== executes.length) recusar('execute fora do modelo.')

  // O FECHO: o comando tem de ser, byte a byte, o que este script gera para os parâmetros que ele declara.
  if (!ehComandoDoModelo(t)) recusar('o comando não é, byte a byte, um comando que este script gera.')
  return sql
}

function ehComandoDoModelo(t) {
  try {
    const alvo = /v_alvo\s+constant text\s+:= '([a-z]+)';/.exec(t)?.[1]
    const fase = /v_fase\s+constant text\s+:= '([a-z]+)';/.exec(t)?.[1]
    const sabotar = /v_sabotar\s+constant boolean := (true|false);/.exec(t)?.[1] === 'true'
    return t === comandoConta({ alvo, fase, sabotar }).trim()
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// O canal (o do medir-rls: comandos gravados FORA do repositório; a resposta ao lado)
// ---------------------------------------------------------------------------

function validarDirFora(dir) {
  if (!dir) recusar('--dir é obrigatório (fora do repositório).')
  const abs = resolve(dir)
  const rel = relative(RAIZ, abs)
  if (!rel.startsWith('..') && !isAbsolute(rel)) recusar('--dir dentro do repositório — comandos e respostas moram FORA dele.')
}

/** O payload `F66_CONTA {…}` dentro da resposta gravada do canal. */
export function lerPayload(texto) {
  let msg = texto
  // as camadas do canal: {"error":{"message"}} do MCP, {"result": "…"}, ou a lista [{"type":"text","text":"…"}]
  for (let k = 0; k < 4; k++) {
    try {
      const j = JSON.parse(msg)
      if (Array.isArray(j)) msg = j.map((x) => x?.text ?? '').join('')
      else if (typeof j?.error?.message === 'string') msg = j.error.message
      else if (typeof j?.result === 'string') msg = j.result
      else if (typeof j?.message === 'string') msg = j.message
      else break
    } catch {
      break
    }
  }
  const recusa = /F66_(ALVO_RECUSADO|SABOTAGEM_FORA_DO_ENSAIO)[^\n"]*/.exec(msg)
  if (recusa) return { recusa: recusa[0] }
  const i = msg.indexOf('F66_CONTA {')
  if (i === -1) recusar('resposta sem F66_CONTA — o bloco não chegou ao fim.')
  const inicio = i + 'F66_CONTA '.length
  let prof = 0
  for (let k = inicio; k < msg.length; k++) {
    if (msg[k] === '{') prof++
    else if (msg[k] === '}') {
      prof--
      if (prof === 0) {
        const p = JSON.parse(msg.slice(inicio, k + 1).replace(/\\"/g, '"'))
        delete p._canal
        return p
      }
    }
  }
  recusar('F66_CONTA truncado na resposta.')
}

/**
 * O INVÓLUCRO DO CANAL MCP (F66). O `execute_sql` do MCP devolve o ERRO inline e o trunca no meio quando ele é grande
 * — e o payload destes blocos sai justamente no erro (`raise exception`). O invólucro roda o bloco validado, BYTE A
 * BYTE, dentro de uma SUBTRANSAÇÃO (`execute` num `begin … exception`): a exceção dele desfaz tudo o que ele fez (o
 * papel, as claims, o `transaction_read_only`), a mensagem é guardada numa configuração LOCAL à transação, e o
 * `select` seguinte a devolve como RESULTADO — que o harness grava em arquivo quando é grande. Nada é gravado no
 * banco: o bloco nunca se confirma (a subtransação aborta), e o invólucro não escreve em tabela nenhuma.
 * Serve aos dois instrumentos (este e o `medir-rls.mjs`): quem valida o bloco é o validador DELE, antes daqui.
 */
export function involucroDoCanal(bloco, validar) {
  validar(bloco)
  if (bloco.includes('$canal$') || bloco.includes('$bloco$')) recusar('o bloco não pode conter os delimitadores do invólucro.')
  return `do $canal$
begin
  begin
    execute $bloco$${bloco.trim()}$bloco$;
  exception when others then
    perform set_config('medicao.resposta', sqlerrm, true);
  end;
end $canal$;
select current_setting('medicao.resposta', true) as resposta;`
}

/** O veredito: a soma das divergências (a corrida é contada à parte — não aprova nem reprova). */
export function veredito(p) {
  const d = p.divergencias
  const total = d.escrita_filial + d.escrita_empresa + d.administracao + d.leitura + d.leitura_x_piso
  return { total, zero: total === 0, corrida: p.corrida }
}

function shaDoCodigo() {
  try {
    return execSync('git rev-parse HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function args(argv) {
  const [modo, ...resto] = argv
  const o = { modo }
  for (let i = 0; i < resto.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(resto[i])
    if (!m) recusar(`argumento não reconhecido: ${resto[i]}`)
    if (m[1] === 'sabotar') {
      o.sabotar = true
      continue
    }
    o[m[1]] = m[2] ?? resto[++i]
  }
  return o
}

async function main() {
  const o = args(process.argv.slice(2))
  if (!['gerar', 'analisar', 'embrulhar'].includes(o.modo)) recusar('modo: gerar | analisar | embrulhar.')
  if (o.modo === 'embrulhar') {
    if (!o.arquivo) recusar('--arquivo é obrigatório.')
    validarDirFora(o.arquivo)
    const validar = o.instrumento === 'medir-rls' ? validarMedicao : o.instrumento === 'conta' ? validarComando : null
    if (!validar) recusar('--instrumento medir-rls|conta.')
    const destino = o.arquivo.replace(/.sql$/, '.canal.sql')
    writeFileSync(destino, involucroDoCanal(readFileSync(o.arquivo, 'utf8'), validar))
    console.log(`gravado ${destino}`)
    return
  }
  const { alvo } = validarAlvo(o.alvo, o.ref)
  const fase = o.fase
  const sabotar = o.sabotar === true
  const nome = `${alvo}-conta-${fase}${sabotar ? '-sabotada' : ''}`
  validarDirFora(o.dir)
  if (o.modo === 'gerar') {
    const sql = validarComando(comandoConta({ alvo, fase, sabotar }))
    mkdirSync(o.dir, { recursive: true })
    writeFileSync(join(o.dir, `${nome}.sql`), sql)
    writeFileSync(join(o.dir, `${nome}.canal.sql`), involucroDoCanal(sql, validarComando))
    console.log(JSON.stringify({ alvo, fase, sabotar, gravado: [`${nome}.sql`, `${nome}.canal.sql`] }, null, 2))
    return
  }
  if (!o.saida) recusar('--saida é obrigatório na análise.')
  const arq = join(o.dir, `${nome}.resposta.txt`)
  if (!existsSync(arq)) recusar(`sem resposta gravada do canal: ${nome}.resposta.txt (em ${readdirSync(o.dir).length} arquivos)`)
  const p = lerPayload(readFileSync(arq, 'utf8'))
  if (p.recusa) recusar(`o banco recusou: ${p.recusa}`)
  if (p.alvo !== alvo || p.fase !== fase || p.sabotar !== sabotar) recusar('a resposta não corresponde ao comando.')
  const v = veredito(p)
  const saida = {
    rotulo: `f66-conta-a-conta-${nome}`,
    canal: 'MCP da Supabase (execute_sql), bloco do … raise exception',
    sha_codigo: shaDoCodigo(),
    gerado_em: new Date().toISOString(),
    metodo:
      'para cada membership ativa (identidade escolhida DENTRO do banco; nenhum id sai): escrita — pode_escrever_filial(f) × ' +
      '(legada, f) ∈ unidades_de_escrita() em cada filial, pode_escrever() × empresas_de_escrita(), e_admin() × empresas_de_admin(); ' +
      'leitura — como authenticated, em cada tabela de public com empresa_id e policy de SELECT (do catálogo): emulada = a policy de ' +
      'hoje × a policy de hoje ∧ o termo, no mesmo statement; real = a policy real × o total do piso de hoje. transaction_read_only = on; ' +
      'o bloco termina em raise exception.',
    ...p,
    veredito: v,
  }
  writeFileSync(join(RAIZ, o.saida), JSON.stringify(saida, null, 2) + '\n')
  console.log(`gravado ${o.saida}: divergências ${v.total} · corrida ${v.corrida} · memberships ${p.memberships} · tabelas ${p.tabelas} · pares ${p.pares}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Recusa ? err.message : `conta-a-conta: ERRO — ${err.message}`)
    process.exit(1)
  })
}

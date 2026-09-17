#!/usr/bin/env node
// ---------------------------------------------------------------------------
// equivalencia-rel.mjs — a EQUIVALÊNCIA velho × novo das `rel_*` da F60, ANTES
// de qualquer apply, e o CUSTO dos corpos novos EMULADOS (só leitura).
// ---------------------------------------------------------------------------
// POR QUE ISTO EXISTE (Frente D, "A equivalência ANTES de qualquer apply"):
//   migration que tocou banco real não se edita mais (a trava de hash, F46), e
//   cada erro achado depois do apply custa uma migration nova. Então o corpo
//   NOVO é comparado com a função VELHA **sem criar nada**: o corpo novo entra
//   colado como SUBCONSULTA, com os parâmetros trocados por LITERAIS TIPADOS
//   (`format('%L')`), e a velha é chamada como está no banco.
//
// O QUE A EQUIVALÊNCIA COMPARA (critério 6 da ordem):
//   para cada data de amostra d (12, da Frente A) × cada recorte R ∈
//   {consolidado, f1..fN} — f1 = filial de MENOR id, TODAS as filiais, inclusive
//   desativada (fato 9) —:
//     VELHO = public.<fn_velha>(null | id, …)
//     NOVO  = (<corpo novo>)  com p_filiais = todas (consolidado) | array[id]
//   e confere count(*) e md5(string_agg(linha::text order by linha::text)) sobre
//   as MESMAS colunas, com o MESMO tipo declarado (projeção `col::tipo` nos dois
//   lados — o texto da linha depende do tipo).
//     · funções de PERÍODO (mov_por_mes, por_motivo, resumo, mov_itens):
//       janelas [d−6, d] e [d−364, d];
//     · rel_saldo_itens (dois níveis numa chamada): TRÊS comparações por célula —
//       (i)   velho(null) × novo(todas)    onde filial_id is null  (o consolidado)
//       (ii)  velho(f)    × novo(array[f]) onde filial_id is null  (o total de 1 filial)
//       (iii) velho(f)    × novo(todas)    onde filial_id = f      (as colunas de /itens)
//     · rel_estoque_asof: as 8 colunas, nas 12 datas × recortes.
//   Mais a Sabotagem H EMULADA: cada corpo novo com NULL e com '{}' → contagem de
//   linhas (tem de ser 0) e se levantou erro (sqlstate). E, para contraste, quantas
//   linhas a VELHA devolve com NULL (o fail-open que a R-ACC-71 proíbe).
//   E os KPIs: o corpo `rel_contagem_status_filiais(todas)` × a contagem por status
//   pelo caminho antigo — as sete contagens que contam + o total.
//
// O QUE O CUSTO MEDE (forma (b) do medir-rel.mjs): o corpo novo com $1/$2/$3,
//   `prepare` UMA vez, `plan_cache_mode = force_generic_plan`, `explain (analyze,
//   buffers, format json) execute …`, 1 aquecimento + N. Estatística agregada
//   DENTRO do bloco (payload grande trunca no canal — defeito medido na F60/A1).
//
// CANAL — só MCP `execute_sql`: este gerador NUNCA fala com o banco. Ele GRAVA os
// comandos em `--dir` (FORA do repositório); quem opera executa cada um no projeto
// do alvo e grava a resposta em `<dir>/respostas/<nome>.resposta.txt`; os modos
// `analisar-*` leem essas respostas.
//
// FALHA FECHADA — todo bloco `do $f60$ … end $f60$;`:
//   1. primeira instrução: `perform set_config('transaction_read_only','on',true)`;
//   2. o BANCO confirma o alvo: ensaio → rotulo_de_ambiente() = 'desenvolvimento';
//      produção → IS NULL. Senão `F60_ALVO_RECUSADO`;
//   3. identidade `authenticated` com um perfil admin/dev escolhido DENTRO do
//      banco — o uuid fica em `v_uid` e nunca sai;
//   4. filiais só por ORDINAL no payload (f1 = menor id) — nunca id nem slug;
//   5. termina SEMPRE em `raise exception 'F60_…' <jsonb>` — nada se confirma;
//   6. `prepare` só nos blocos de custo, com nome ÚNICO por execução e `deallocate`
//      antes do raise (inclusive no caminho de erro: prepared statement não é
//      transacional, o rollback não o apaga).
//   Nenhuma DDL, nenhuma escrita; a guarda `validarBloco` recusa o texto que tiver.
//
// SAÍDA — só contagens, hashes md5, tempos, nomes de nó e rótulos (regra 2/4).
//
//   node equivalencia-rel.mjs gerar-equivalencia --alvo=ensaio|producao \
//        --corpos=<corpos-novos.sql> --datas=<f60-datas-amostra.json> --dir=<fora-do-repo>
//   node equivalencia-rel.mjs gerar-custo --alvo=producao --corpos=<…> --hoje=AAAA-MM-DD --dir=<…>
//   node equivalencia-rel.mjs analisar-equivalencia --dir=<…> --saida=f60-equivalencia-emulada.json
//   node equivalencia-rel.mjs analisar-custo --dir=<…> --antes=<f60-producao-antes-rel.json> \
//        [--antes-custo=<f60-producao-antes-custo.json>] --saida=<…> --orcamento=<…>
//
// DEPOIS DO APPLY (revisão final da F60 — antes, este passo era só prosa): a mesma comparação e o
// mesmo custo com a FUNÇÃO APLICADA no lugar do corpo colado. Os corpos vêm das migrations do
// repositório (0141 + 0143), e cada bloco RECUSA antes de medir: função nova ausente
// (F60_FUNCAO_NOVA_AUSENTE), prosrc aplicado diferente do versionado (F60_CORPO_VIVO_DIFERENTE) e,
// na equivalência, função velha já derrubada (F60_FUNCAO_VELHA_AUSENTE — a comparação real roda
// ENTRE o apply da 0143 e o da 0145):
//   node equivalencia-rel.mjs gerar-equivalencia-real --alvo=ensaio|producao \
//        --datas=docs/perf/f60-datas-amostra.json --dir=<fora-do-repo>
//   node equivalencia-rel.mjs analisar-equivalencia --real --dir=<…> --saida=<f60-equivalencia-real.json>
//   node equivalencia-rel.mjs gerar-custo-real --alvo=producao --hoje=AAAA-MM-DD --dir=<…>
//   node equivalencia-rel.mjs analisar-custo --real --dir=<…> --saida=<f60-custo-real.json> \
//        [--confirmar-orcamento=docs/perf/asof-orcamento.json]
// `gerar-custo-real` inclui `custo-contagem-status` (o "depois" do B1 que o cabeçalho da 0141 pede) e
// `custo-asof-consolidado` (a confirmação do orçamento do as-of, gravada só em `medicao.confirmacao`).
//
// PROVENIÊNCIA — este é o gerador que produziu as evidências de equivalência e de custo dos corpos
// novos citadas no cabeçalho da `0143_rel_filiais.sql` (`f60-equivalencia-emulada.json`,
// `f60-custo-corpos-novos-producao.json`, `f60-asof-variantes-producao.json`), versionado no lote 2 da
// F60. O original rodou FORA do repositório: 59.660 bytes, sha256 (LF)
// `59e11125af7214bef3ad0d2e24f554884ddb6278385eb3374161c28e43a75c9d` (PLAN-F60 §0). A versão daqui
// difere dele nestas coisas e só nelas, e NENHUMA muda o SQL emitido:
//   · a RAIZ do repositório sai de `import.meta.url` (`fileURLToPath`), no lugar da variável de
//     ambiente `RAIZ_REPO` ou do `git rev-parse --show-toplevel` do diretório corrente — a raiz agora é
//     a do arquivo, não a de onde se roda;
//   · `validarDirFora` é a régua de `medir-rel.mjs`/`medir-custo.mjs` (a revisão do lote 1): "fora" é
//     outro disco, o pai ou abaixo dele — a do original liberava uma pasta INTERNA chamada `..x`
//     (`startsWith('..')`) e, sem raiz resolvida, não conferia nada. Exportada, para
//     `instrumentos-f60.test.mts` provar os dois casos;
//   · este bloco. O `--corpos` continua apontando um arquivo FORA do repositório (o rascunho medido).
// Os modos `*-real` (revisão final da F60) são ACRÉSCIMO: sem `real`, os geradores emitem, byte a byte,
// o mesmo SQL de antes (conferido por diff na revisão).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export class Recusa extends Error {}
function recusar(msg) {
  throw new Recusa(`equivalencia-rel: RECUSADO — ${msg}`)
}

/** A raiz do repositório, pela posição DESTE arquivo (`scripts/perf/`) — nunca pelo diretório corrente. */
const RAIZ_REPO = fileURLToPath(new URL('../..', import.meta.url))
function raizRepo() {
  return RAIZ_REPO
}

// ---------------------------------------------------------------------------
// 0. O modelo — alvos, funções, janelas
// ---------------------------------------------------------------------------

/** O rótulo que o BANCO tem de devolver em `rotulo_de_ambiente()` para cada alvo. */
export const ALVOS = {
  ensaio: { projeto: 'sgmvldiizsrjbxzzpmhh', rotulo: 'desenvolvimento' },
  producao: { projeto: 'pbtjcalbmepmrqzprusb', rotulo: null },
}

/**
 * As oito funções novas. `velha` é a assinatura que a nova substitui (null nos
 * KPIs, que não tinham RPC: o caminho antigo é a contagem sobre `ativos`).
 * `forma`: 'data' (um parâmetro de data), 'janela' (de/até), 'niveis' (o saldo
 * de itens em dois níveis) ou 'kpis'.
 */
export const MODELO = {
  rel_mov_por_mes_filiais: { velha: 'rel_mov_por_mes', forma: 'janela' },
  rel_por_motivo_filiais: { velha: 'rel_por_motivo', forma: 'janela' },
  rel_resumo_filiais: { velha: 'rel_resumo', forma: 'janela' },
  rel_mov_itens_filiais: { velha: 'rel_mov_itens', forma: 'janela' },
  rel_frescor_itens_filiais: { velha: 'rel_frescor_itens', forma: 'data' },
  rel_saldo_itens_filiais: { velha: 'rel_saldo_itens', forma: 'niveis' },
  rel_estoque_asof_filiais: { velha: 'rel_estoque_asof', forma: 'data' },
  rel_contagem_status_filiais: { velha: null, forma: 'kpis' },
}

export const JANELAS = [
  { rotulo: '7d', dias: 6 },
  { rotulo: '365d', dias: 364 },
]

/** As sete contagens que contam no dashboard (`kpisDeEstado`): tudo menos as baixas terminais. */
export const STATUS_QUE_CONTAM = [
  'em_uso', 'em_estoque', 'reservado', 'em_manutencao', 'em_triagem', 'defasado', 'emprestado',
]

// ---------------------------------------------------------------------------
// 1. Os corpos novos — lidos do arquivo, nunca copiados à mão
// ---------------------------------------------------------------------------

function separarDeclaracoes(lista) {
  return lista
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(\w+)\s+(.+)$/.exec(s)
      if (!m) recusar(`declaração fora do formato "nome tipo": ${s}`)
      return { nome: m[1], tipo: m[2].trim() }
    })
}

/**
 * Lê os `create function public.<nome>(…) returns table (…) … as $$ … $$;` do
 * arquivo e devolve { nome → { parametros, colunas, corpo } }. `corpo` é o texto
 * EXATO entre os `$$` (é ele que vira `prosrc` depois do apply).
 */
export function lerCorposNovos(texto) {
  const re = /create function public\.(\w+)\(\s*([^)]*?)\s*\)\s*returns table\s*\(([^)]*)\)[\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g
  const out = {}
  for (const m of texto.matchAll(re)) {
    out[m[1]] = { parametros: separarDeclaracoes(m[2]), colunas: separarDeclaracoes(m[3]), corpo: m[4] }
  }
  for (const nome of Object.keys(MODELO)) {
    if (!out[nome]) recusar(`corpo novo ausente no arquivo: ${nome}`)
  }
  return out
}

/**
 * As migrations que DEFINEM as oito funções novas — a fonte dos corpos no modo `real`. Não é cópia: o
 * `lerCorposNovos` lê o texto versionado, e a guarda do bloco confere que o `prosrc` APLICADO é esse texto.
 */
export const MIGRATIONS_DAS_NOVAS = ['0141_rel_contagem_status.sql', '0143_rel_filiais.sql']

/** Os corpos das oito funções novas, lidos das migrations do repositório (modo `real`). */
export function lerCorposDoRepositorio(raiz = RAIZ_REPO) {
  return lerCorposNovos(MIGRATIONS_DAS_NOVAS.map((a) => readFileSync(join(raiz, 'supabase', 'migrations', a), 'utf8')).join('\n'))
}

/** md5 do corpo com todo espaço em branco colapsado em um espaço — a normalização do runbook (`regexp_replace(prosrc,'\s+',' ','g')`). */
export function md5Normalizado(corpo) {
  return createHash('md5').update(corpo.replace(/\s+/g, ' ')).digest('hex')
}

/** Troca cada parâmetro (palavra inteira) pelo texto dado — replacer por FUNÇÃO, para `$` nunca ser padrão de replace. */
export function substituir(corpo, mapa) {
  let out = corpo
  for (const [nome, por] of Object.entries(mapa)) {
    out = out.replace(new RegExp(`\\b${nome}\\b`, 'g'), () => por)
  }
  return out
}

/** O corpo como consulta embutível: sem o `;` final, e recusado se trouxer algo que quebre o molde. */
function corpoComoConsulta(corpo) {
  const t = corpo.trim().replace(/;\s*$/, '')
  if (t.includes(';')) recusar('corpo novo com mais de um comando.')
  if (/\$[a-z_]*\$/i.test(t)) recusar('corpo novo com dollar-quote — colide com as tags do bloco.')
  return t
}

/** Para `format()`: `%` literal do corpo vira `%%`. */
function escaparFormat(t) {
  return t.replace(/%/g, '%%')
}

// ---------------------------------------------------------------------------
// 2. A guarda — sobre TODO bloco antes de sair do processo
// ---------------------------------------------------------------------------

const PROIBIDAS = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'create', 'alter', 'drop',
  'grant', 'revoke', 'copy', 'call', 'vacuum', 'refresh', 'reindex', 'cluster',
  'lock', 'comment', 'listen', 'notify', 'commit', 'rollback', 'savepoint',
  'discard', 'load', 'import', 'security', 'reassign', 'checkpoint', 'analyse',
]

export function validarBloco(sql) {
  const t = sql.trim()
  if (!t.startsWith('do $f60$') || !t.endsWith('end $f60$;')) recusar('bloco fora do modelo (do $f60$ … end $f60$;).')
  if (t.split('$f60$').length !== 3) recusar('delimitador $f60$ repetido.')
  const minusc = t.replace(/'(?:[^']|'')*'/g, "''").toLowerCase()
  for (const p of PROIBIDAS) {
    if (new RegExp(`\\b${p}\\b`).test(minusc)) recusar(`palavra proibida no bloco: "${p}".`)
  }
  if (!/begin\s+perform set_config\('transaction_read_only',\s*'on',\s*true\);/.test(t)) {
    recusar('o bloco não liga transaction_read_only como primeira instrução.')
  }
  if (!/rotulo_de_ambiente\(\)/.test(t)) recusar('o bloco não confere rotulo_de_ambiente().')
  if (!/raise exception 'F60_(EQUIVALENCIA|KPIS|CUSTO)(_REAL)? %'/.test(t)) recusar('o bloco não termina em raise exception F60_*.')
  // prepare/deallocate vivem DENTRO de literais de `execute format(...)`: conta no texto cru
  const cru = t.toLowerCase()
  const prepara = /\bprepare\b/.test(cru)
  const desaloca = (cru.match(/\bdeallocate\b/g) ?? []).length
  if (prepara && desaloca < 2) recusar('prepare sem deallocate no caminho normal E no de erro.')
  return sql
}

// A GUARDA DE `--dir` — o mesmo texto de `medir-rel.mjs` e `medir-custo.mjs`: "fora" é, exatamente, outro
// disco (`relative` devolve caminho absoluto), o pai (`..`) ou abaixo dele (`..${sep}…`). Recusa a própria
// raiz e a pasta interna cujo nome começa com dois pontos.
export function validarDirFora(dir) {
  if (!dir) recusar('--dir é obrigatório.')
  const rel = relative(RAIZ_REPO, resolve(dir))
  const fora = isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)
  if (!fora) recusar('--dir dentro do repositório — comandos e respostas moram FORA dele.')
}

function gravar(dir, nome, sql) {
  validarDirFora(dir)
  validarBloco(sql)
  mkdirSync(dir, { recursive: true })
  const caminho = join(dir, `${nome}.sql`)
  writeFileSync(caminho, sql)
  return caminho
}

// ---------------------------------------------------------------------------
// 3. O preâmbulo comum — alvo, identidade, filiais por ordinal
// ---------------------------------------------------------------------------

function preambulo(alvo) {
  const cfg = ALVOS[alvo]
  if (!cfg) recusar(`--alvo: ${Object.keys(ALVOS).join(' | ')}.`)
  const esperado = cfg.rotulo === null ? 'null::text' : `'${cfg.rotulo}'`
  return `
  perform set_config('transaction_read_only', 'on', true);

  -- 1. o BANCO confirma o alvo (${alvo}) antes de qualquer leitura
  v_rotulo := public.rotulo_de_ambiente();
  if v_rotulo is distinct from ${esperado} then
    raise exception 'F60_ALVO_RECUSADO rotulo=%', coalesce(v_rotulo, '(nulo)');
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

  -- 3. TODAS as filiais (com desativada), por id — no payload só os ORDINAIS
  select array_agg(x.id order by x.id),
         coalesce(array_agg(x.ordinal order by x.ordinal) filter (where not x.ativo), '{}')
    into v_todas, v_inativos
    from (select f.id, f.ativo, row_number() over (order by f.id)::int as ordinal
            from public.filiais f) x;
  if v_todas is null then
    raise exception 'F60_FILIAL_AUSENTE';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);`.trim()
}

const DECLARA_COMUM = `
  v_rotulo text;
  v_uid uuid;
  v_todas smallint[];
  v_inativos int[];`

// ---------------------------------------------------------------------------
// 4. A equivalência — um bloco por função
// ---------------------------------------------------------------------------

function projecao(colunas) {
  return colunas.map((c) => `s.${c.nome}::${c.tipo}`).join(', ')
}

const AGREGA = (from) =>
  `select count(*)::bigint, md5(coalesce(string_agg(r::text, '|' order by r::text), '')) from (${from}) as r`

/** Os moldes de `format()` de uma função: velho, novo (com filtro opcional) e o bruto da Sabotagem H. */
function moldes(nomeNova, cfg, def, { real = false } = {}) {
  const tipos = Object.fromEntries(def.parametros.map((p) => [p.nome, p.tipo]))
  const ordem = def.parametros.map((p) => p.nome) // p_filiais, p_de/p_data/p_ate, [p_ate]
  if (ordem[0] !== 'p_filiais' || tipos.p_filiais !== 'smallint[]') recusar(`${nomeNova}: o 1º parâmetro não é p_filiais smallint[].`)
  const mapaLiteral = Object.fromEntries(ordem.map((n, i) => [n, `%${i + 1}$L::${tipos[n]}`]))
  // escapa o `%` do corpo ANTES de plantar os `%N$L` — na ordem inversa, eles mesmos viram `%%`
  const corpoLit = substituir(escaparFormat(corpoComoConsulta(def.corpo)), mapaLiteral)
  const colsNovo = def.colunas.map((c) => c.nome).join(', ')
  const colunasVelhas = cfg.forma === 'niveis' ? def.colunas.filter((c) => c.nome !== 'filial_id') : def.colunas
  const argsVelho = ordem.map((n, i) => (i === 0 ? `%1$L::smallint` : `%${i + 1}$L::${tipos[n]}`)).join(', ')
  const n = ordem.length
  // O lado NOVO: o corpo colado como subconsulta (a emulação, antes do apply) ou a FUNÇÃO APLICADA,
  // chamada pelo nome com os mesmos literais tipados (`real`, entre o apply da 0143 e o da 0145).
  const argsNovo = ordem.map((nome, i) => `%${i + 1}$L::${tipos[nome]}`).join(', ')
  const fonteNova = real ? `public.${nomeNova}(${argsNovo}) as s` : `(${corpoLit}) as s(${colsNovo})`
  return {
    velho: cfg.velha ? AGREGA(`select ${projecao(colunasVelhas)} from public.${cfg.velha}(${argsVelho}) as s`) : null,
    novo: AGREGA(`select ${projecao(colunasVelhas)} from ${fonteNova}`),
    novoNivelNulo: AGREGA(`select ${projecao(colunasVelhas)} from ${fonteNova} where s.filial_id is null`),
    novoNivelFilial: AGREGA(`select ${projecao(colunasVelhas)} from ${fonteNova} where s.filial_id = %${n + 1}$L::smallint`),
    bruto: `select count(*)::bigint from ${fonteNova}`,
    fonteNova,
    corpoLit,
    colsNovo,
  }
}

/**
 * A guarda do modo `real`: a função NOVA existe no banco e o `prosrc` dela, normalizado, é o corpo do
 * repositório (o md5 que a emulação mediu); a VELHA, quando há, ainda existe — a comparação real só tem
 * sentido ENTRE o apply da 0143 e o da 0145. Cada falha é uma recusa nomeada (`lerPayload`), nunca um
 * número.
 */
function guardaFuncaoAplicada(nomeNova, velha, def) {
  const tiposNovos = def.parametros.map((x) => x.tipo).join(', ')
  const assinaturaNova = `public.${nomeNova}(${tiposNovos})`
  const assinaturaVelha = velha ? `public.${velha}(${['smallint', ...def.parametros.slice(1).map((x) => x.tipo)].join(', ')})` : null
  const velhaViva = assinaturaVelha
    ? `
  if to_regprocedure('${assinaturaVelha}') is null then
    raise exception 'F60_FUNCAO_VELHA_AUSENTE ${velha}';
  end if;`
    : ''
  return `
  -- 4a. a função APLICADA é a do repositório${velha ? ' (e a velha ainda está viva)' : ''}
  select md5(regexp_replace(pr.prosrc, '\\s+', ' ', 'g')) into v_md5_vivo
    from pg_proc pr where pr.oid = to_regprocedure('${assinaturaNova}');
  if v_md5_vivo is null then
    raise exception 'F60_FUNCAO_NOVA_AUSENTE ${nomeNova}';
  end if;
  if v_md5_vivo <> '${md5Normalizado(def.corpo)}' then
    raise exception 'F60_CORPO_VIVO_DIFERENTE ${nomeNova}';
  end if;${velhaViva}
`
}

function acumula(janela, comparacao) {
  return `
          v_celulas := v_celulas + 1;
          v_lv := v_lv + v_cv;
          v_ln := v_ln + v_cn;
          if v_cv = 0 and v_cn = 0 then v_vazias := v_vazias + 1; end if;
          if v_cv = v_cn and v_hv = v_hn then
            v_iguais := v_iguais + 1;
          else
            v_diverg := v_diverg + 1;
            if v_diverg <= 40 then
              v_lista := v_lista || jsonb_build_array(jsonb_build_object(
                'data', v_d, 'recorte', v_rot, 'janela', ${janela}, 'comparacao', ${comparacao},
                'linhas_velho', v_cv, 'linhas_novo', v_cn, 'hash_igual', v_hv = v_hn));
            end if;
          end if;`
}

/** A Sabotagem H emulada: NULL e '{}' no corpo novo, capturando erro por sqlstate. */
function sabotagemH(cfg) {
  const argsData = cfg.forma === 'janela' ? ', v_hoje - 364, v_hoje' : ', v_hoje'
  const caso = (rotulo, valor) => `
  begin
    execute format(v_tpl_bruto, ${valor}${cfg.forma === 'kpis' ? '' : argsData}) into v_cnt;
    v_h := v_h || jsonb_build_object('${rotulo}', jsonb_build_object('linhas', v_cnt, 'erro', null));
  exception when others then
    v_h := v_h || jsonb_build_object('${rotulo}', jsonb_build_object('linhas', null, 'erro', sqlstate));
  end;`
  const contraste = cfg.velha
    ? `
  execute format(v_tpl_velho, null::smallint${argsData}) into v_cnt, v_hv;
  v_h := v_h || jsonb_build_object('velha_com_nulo_linhas', v_cnt);`
    : ''
  return caso('nulo', 'null::smallint[]') + caso('vazio', `'{}'::smallint[]`) + contraste
}

export function blocoEquivalencia(nomeNova, def, alvo, datas, { real = false } = {}) {
  const cfg = MODELO[nomeNova]
  if (!cfg || cfg.forma === 'kpis') recusar(`função fora do modelo de equivalência: ${nomeNova}`)
  const m = moldes(nomeNova, cfg, def, { real })
  const hoje = datas.reduce((a, b) => (a > b ? a : b))

  let loopRecorte
  if (cfg.forma === 'janela') {
    loopRecorte = `
        for v_ji in 1 .. ${JANELAS.length} loop
          v_de := v_d - v_jan_dias[v_ji];
          execute format(v_tpl_velho, v_old, v_de, v_d) into v_cv, v_hv;
          execute format(v_tpl_novo, v_rec, v_de, v_d) into v_cn, v_hn;${acumula('v_jan_rot[v_ji]', 'null::text')}
        end loop;`
  } else if (cfg.forma === 'data') {
    loopRecorte = `
          execute format(v_tpl_velho, v_old, v_d) into v_cv, v_hv;
          execute format(v_tpl_novo, v_rec, v_d) into v_cn, v_hn;${acumula('null::text', 'null::text')}`
  } else {
    // niveis: (i) no consolidado; (ii) e (iii) em cada filial, reusando o velho(f)
    loopRecorte = `
          execute format(v_tpl_velho, v_old, v_d) into v_cv, v_hv;
          if v_ri = 0 then
            execute format(v_tpl_novo_nulo, v_todas, v_d) into v_cn, v_hn;${acumula('null::text', `'i'`)}
          else
            execute format(v_tpl_novo_nulo, v_rec, v_d) into v_cn, v_hn;${acumula('null::text', `'ii'`)}
            execute format(v_tpl_novo_filial, v_todas, v_d, v_todas[v_ri]) into v_cn, v_hn;${acumula('null::text', `'iii'`)}
          end if;`
  }

  const moldesDeclarados =
    cfg.forma === 'niveis'
      ? `  v_tpl_novo_nulo text := $tnn$${m.novoNivelNulo}$tnn$;
  v_tpl_novo_filial text := $tnf$${m.novoNivelFilial}$tnf$;`
      : `  v_tpl_novo text := $tn$${m.novo}$tn$;`

  return `do $f60$
declare${DECLARA_COMUM}
  v_datas date[] := array[${datas.map((d) => `date '${d}'`).join(', ')}];
  v_hoje date := date '${hoje}';
  v_jan_dias int[] := array[${JANELAS.map((j) => j.dias).join(', ')}];
  v_jan_rot text[] := array[${JANELAS.map((j) => `'${j.rotulo}'`).join(', ')}];
  v_tpl_velho text := $tv$${m.velho}$tv$;
${moldesDeclarados}
  v_tpl_bruto text := $tb$${m.bruto}$tb$;
  v_di int; v_ri int; v_ji int;
  v_d date; v_de date;
  v_old smallint; v_rec smallint[]; v_rot text;
  v_cv bigint; v_hv text; v_cn bigint; v_hn text; v_cnt bigint;
  v_celulas int := 0; v_iguais int := 0; v_diverg int := 0; v_vazias int := 0;
  v_lv bigint := 0; v_ln bigint := 0;
  v_lista jsonb := '[]'::jsonb;
  v_h jsonb := '{}'::jsonb;${real ? '\n  v_md5_vivo text;' : ''}
begin
  ${preambulo(alvo)}
${real ? guardaFuncaoAplicada(nomeNova, cfg.velha, def) : ''}
  -- 4. as células: data × recorte${cfg.forma === 'janela' ? ' × janela' : ''}${cfg.forma === 'niveis' ? ' × comparação (i/ii/iii)' : ''}
  for v_di in 1 .. array_length(v_datas, 1) loop
    v_d := v_datas[v_di];
    for v_ri in 0 .. array_length(v_todas, 1) loop
      if v_ri = 0 then
        v_old := null; v_rec := v_todas; v_rot := 'consolidado';
      else
        v_old := v_todas[v_ri]; v_rec := array[v_todas[v_ri]]; v_rot := 'f' || v_ri;
      end if;${loopRecorte}
    end loop;
  end loop;

  -- 5. Sabotagem H emulada (data = a mais recente da amostra)${sabotagemH(cfg)}

  raise exception 'F60_EQUIVALENCIA${real ? '_REAL' : ''} %', jsonb_build_object(
    'alvo', '${alvo}', 'funcao', '${nomeNova}', 'velha', '${cfg.velha}',${real ? " 'lado_novo', 'funcao_aplicada'," : ''}
    'md5_corpo_novo_normalizado', '${md5Normalizado(def.corpo)}',
    'postgres', current_setting('server_version'), 'papel', current_user,
    'n_filiais', array_length(v_todas, 1), 'ordinais_inativos', to_jsonb(v_inativos),
    'n_datas', array_length(v_datas, 1),
    'celulas', v_celulas, 'iguais', v_iguais, 'divergentes', v_diverg,
    'celulas_vazias_nos_dois', v_vazias,
    'linhas_velho_total', v_lv, 'linhas_novo_total', v_ln,
    'lista', v_lista, 'nulo_e_vazio', v_h);
end $f60$;`
}

/** Os KPIs: corpo 0 com todas as filiais × a contagem por status pelo caminho antigo. */
export function blocoKpis(def, alvo, { real = false } = {}) {
  const cfg = MODELO.rel_contagem_status_filiais
  const m = moldes('rel_contagem_status_filiais', cfg, def, { real })
  const novoJson = `select coalesce(jsonb_object_agg(s.status::text, s.total), '{}'::jsonb) from ${m.fonteNova}`
  const lista = STATUS_QUE_CONTAM.map((s) => `'${s}'`).join(', ')
  return `do $f60$
declare${DECLARA_COMUM}
  v_tpl_novo text := $tn$${novoJson}$tn$;
  v_tpl_bruto text := $tb$${m.bruto}$tb$;
  v_status text[] := array[${lista}];
  v_novo jsonb; v_velho jsonb;
  v_s text; v_cv bigint; v_cn bigint; v_cnt bigint;
  v_tv bigint := 0; v_tn bigint := 0;
  v_iguais int := 0; v_diverg int := 0;
  v_por_status jsonb := '{}'::jsonb;
  v_h jsonb := '{}'::jsonb;${real ? '\n  v_md5_vivo text;' : ''}
begin
  ${preambulo(alvo)}
${real ? guardaFuncaoAplicada('rel_contagem_status_filiais', null, def) : ''}
  -- 4. o corpo novo com TODAS as filiais
  execute format(v_tpl_novo, v_todas) into v_novo;

  -- 5. o caminho antigo: a contagem por status sobre ativos, sem as baixas terminais
  select coalesce(jsonb_object_agg(x.status::text, x.n), '{}'::jsonb) into v_velho
    from (select a.status, count(*) as n
            from public.ativos a
           where a.status not in ('descartado', 'devolvido_fornecedor')
           group by a.status) x;

  foreach v_s in array v_status loop
    v_cv := coalesce((v_velho ->> v_s)::bigint, 0);
    v_cn := coalesce((v_novo ->> v_s)::bigint, 0);
    v_tv := v_tv + v_cv;
    v_tn := v_tn + v_cn;
    if v_cv = v_cn then v_iguais := v_iguais + 1; else v_diverg := v_diverg + 1; end if;
    v_por_status := v_por_status || jsonb_build_object(v_s, jsonb_build_object('velho', v_cv, 'novo', v_cn));
  end loop;
  if v_tv = v_tn then v_iguais := v_iguais + 1; else v_diverg := v_diverg + 1; end if;
  v_por_status := v_por_status || jsonb_build_object('total', jsonb_build_object('velho', v_tv, 'novo', v_tn));

  -- 6. Sabotagem H emulada${sabotagemH(cfg)}

  raise exception 'F60_KPIS${real ? '_REAL' : ''} %', jsonb_build_object(
    'alvo', '${alvo}', 'funcao', 'rel_contagem_status_filiais', 'velha', 'contagem por status sobre ativos',${real ? " 'lado_novo', 'funcao_aplicada'," : ''}
    'md5_corpo_novo_normalizado', '${md5Normalizado(def.corpo)}',
    'postgres', current_setting('server_version'), 'papel', current_user,
    'n_filiais', array_length(v_todas, 1), 'ordinais_inativos', to_jsonb(v_inativos),
    'celulas', ${STATUS_QUE_CONTAM.length + 1}, 'iguais', v_iguais, 'divergentes', v_diverg,
    'status_fora_das_sete_no_novo', (select count(*) from jsonb_object_keys(v_novo) k where k <> all (v_status)),
    'por_status', v_por_status, 'nulo_e_vazio', v_h);
end $f60$;`
}

// ---------------------------------------------------------------------------
// 5. O custo dos corpos novos — forma (b), plano genérico
// ---------------------------------------------------------------------------

export const N_PADRAO = 7 // + 1 aquecimento

/** Os blocos de custo. O as-of vai em três (um por recorte): o detalhe de nó por célula é grande. */
export const CUSTO = [
  { nome: 'custo-asof-consolidado', funcao: 'rel_estoque_asof_filiais', recortes: ['consolidado'], datas: [0, 7, 60], detalhe: true },
  { nome: 'custo-asof-f1', funcao: 'rel_estoque_asof_filiais', recortes: ['f1'], datas: [0, 7, 60], detalhe: true },
  // fN sem detalhe de nó: o plano é o MESMO do consolidado e de f1 (a lateral roda para todo ativo,
  // o recorte se aplica depois — fato 8), e o detalhe triplicado estourava o canal sem informar nada novo
  { nome: 'custo-asof-fN', funcao: 'rel_estoque_asof_filiais', recortes: ['fN'], datas: [0, 7, 60] },
  { nome: 'custo-saldo-itens', funcao: 'rel_saldo_itens_filiais', recortes: ['consolidado', 'f1'], datas: [0] },
  { nome: 'custo-mov-itens', funcao: 'rel_mov_itens_filiais', recortes: ['consolidado'], janelas: [364] },
  { nome: 'custo-contagem-status', funcao: 'rel_contagem_status_filiais', recortes: ['consolidado'] },
]

function exprRecorte(r) {
  if (r === 'consolidado') return 'v_todas'
  if (r === 'f1') return 'array[v_todas[1]]'
  if (r === 'fN') return 'array[v_todas[array_length(v_todas, 1)]]'
  recusar(`recorte fora do modelo: ${r}`)
}

export function blocoCusto(bloco, def, alvo, hoje, { n = N_PADRAO, real = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) recusar('--hoje fora do formato AAAA-MM-DD.')
  if (!Number.isInteger(n) || n < 1 || n > 30) recusar('--n precisa ser inteiro entre 1 e 30.')
  const ordem = def.parametros.map((p) => p.nome)
  const tipos = def.parametros.map((p) => p.tipo)
  const corpoParam = substituir(corpoComoConsulta(def.corpo), Object.fromEntries(ordem.map((p, i) => [p, `$${i + 1}`])))

  // as células: recorte × (data | janela | nada), com o EXECUTE de cada forma
  const celulas = []
  for (const r of bloco.recortes) {
    if (bloco.datas) {
      for (const k of bloco.datas) {
        celulas.push({ rotulo: `${r}·${k === 0 ? 'hoje' : `hoje-${k}`}`, rec: exprRecorte(r), args: `, v_hoje - ${k}`, fmt: '%L, %L' })
      }
    } else if (bloco.janelas) {
      for (const k of bloco.janelas) {
        celulas.push({ rotulo: `${r}·${k + 1}d`, rec: exprRecorte(r), args: `, v_hoje - ${k}, v_hoje`, fmt: '%L, %L, %L' })
      }
    } else {
      celulas.push({ rotulo: `${r}·atual`, rec: exprRecorte(r), args: '', fmt: '%L' })
    }
  }

  const detalhe = bloco.detalhe
    ? `
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'tipo', n.j ->> 'Node Type', 'relacao', n.j ->> 'Relation Name', 'indice', n.j ->> 'Index Name',
                     'pai', n.j ->> 'Parent Relationship', 'subplano', n.j ->> 'Subplan Name', 'juncao', n.j ->> 'Join Type',
                     'loops', (n.j ->> 'Actual Loops')::numeric, 'linhas', (n.j ->> 'Actual Rows')::numeric,
                     'sort_key', n.j -> 'Sort Key', 'presorted_key', n.j -> 'Presorted Key', 'sort_method', n.j ->> 'Sort Method',
                     'hit', (n.j ->> 'Shared Hit Blocks')::numeric)))
              into v_det
              from jsonb_path_query(v_p, 'strict $.** ? (exists (@."Node Type"))') as n(j);
            v_detalhe := jsonb_set(v_detalhe, array[v_celula], coalesce(v_det, '[]'::jsonb));`
    : ''

  // modo `real`: a CHAMADA da função aplicada, na mesma célula — o preço de verdade (Function Scan, caixa
  // preta: o plano de dentro é o do corpo colado, que a guarda prova igual ao prosrc aplicado).
  const chamadaDaCelula = (c) => `
    v_ec := array[]::double precision[]; v_hc := array[]::bigint[];
    for v_i in 1 .. (${n} + 1) loop
      execute format('explain (analyze, buffers, format json) execute %I(${c.fmt})', v_nome_c, v_rec${c.args}) into v_plano;
      if v_i > 1 then
        v_p := v_plano::jsonb -> 0;
        v_ec := array_append(v_ec, (v_p -> 'Execution Time')::text::double precision);
        v_hc := array_append(v_hc, (v_p #> '{Plan,Shared Hit Blocks}')::text::bigint);
      end if;
    end loop;
    select jsonb_build_object(
      'execucao_ms', jsonb_build_object(
        'mediana', round(percentile_cont(0.5) within group (order by t.e)::numeric, 3),
        'p95', round(percentile_cont(0.95) within group (order by t.e)::numeric, 3)),
      'buffers_raiz', jsonb_build_object('hit_mediana', round(percentile_cont(0.5) within group (order by t.h)::numeric, 3)),
      'n', array_length(v_ec, 1))
      into v_stat
      from unnest(v_ec, v_hc) as t(e, h);
    v_amostras_chamada := jsonb_set(v_amostras_chamada, array[v_celula], v_stat);`
  const corpoCelulas = celulas
    .map(
      (c) => `
    v_celula := '${c.rotulo}';
    v_rec := ${c.rec};
    v_e := array[]::double precision[]; v_pl := array[]::double precision[];
    v_hit := array[]::bigint[]; v_read := array[]::bigint[];
    for v_i in 1 .. (${n} + 1) loop
      execute format('explain (analyze, buffers, format json) execute %I(${c.fmt})', v_nome, v_rec${c.args}) into v_plano;
      if v_i > 1 then
        v_p := v_plano::jsonb -> 0;
        v_e := array_append(v_e, (v_p -> 'Execution Time')::text::double precision);
        v_pl := array_append(v_pl, (v_p -> 'Planning Time')::text::double precision);
        v_hit := array_append(v_hit, (v_p #> '{Plan,Shared Hit Blocks}')::text::bigint);
        v_read := array_append(v_read, (v_p #> '{Plan,Shared Read Blocks}')::text::bigint);
        v_linhas := (v_p #> '{Plan,Actual Rows}')::text::bigint;
        if v_i = 2 then
          v_nos := jsonb_set(v_nos, array[v_celula], jsonb_build_object(
            'tipos_de_no', (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_path_query(v_p, 'strict $.**."Node Type"') x),
            'relacoes_com_seq_scan', (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_path_query(v_p, 'strict $.** ? (@."Node Type" == "Seq Scan")."Relation Name"') x),
            'indices_usados', (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_path_query(v_p, 'strict $.**."Index Name"') x)));${detalhe}
        end if;
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
      'linhas', v_linhas, 'n', array_length(v_e, 1))
      into v_stat
      from unnest(v_e, v_pl, v_hit, v_read) as t(e, p, h, r);
    v_amostras := jsonb_set(v_amostras, array[v_celula], v_stat);${real ? chamadaDaCelula(c) : ''}`,
    )
    .join('\n')

  return `do $f60$
declare${DECLARA_COMUM}
  v_hoje date := date '${hoje}';
  v_corpo text := $tc$${corpoParam}$tc$;
  v_nome text;
  v_celula text;
  v_rec smallint[];
  v_i int;
  v_plano json;
  v_p jsonb;
  v_e double precision[]; v_pl double precision[];
  v_hit bigint[]; v_read bigint[];
  v_linhas bigint;
  v_stat jsonb;
  v_det jsonb;
  v_amostras jsonb := '{}'::jsonb;
  v_nos jsonb := '{}'::jsonb;
  v_detalhe jsonb := '{}'::jsonb;
  v_total_ativos bigint;
  v_total_mov bigint;
  v_total_lanc bigint;${
    real
      ? `
  v_md5_vivo text;
  v_nome_c text;
  v_ec double precision[]; v_hc bigint[];
  v_amostras_chamada jsonb := '{}'::jsonb;`
      : ''
  }
begin
  ${preambulo(alvo)}
${real ? guardaFuncaoAplicada(bloco.funcao, null, def) : ''}
  -- 4. o corpo NOVO, preparado UMA vez com plano genérico, nome único por execução
  perform set_config('plan_cache_mode', 'force_generic_plan', true);
  v_nome := 'f60_custo_' || substr(md5(clock_timestamp()::text || random()::text), 1, 16);
  execute format('prepare %I(${tipos.join(', ')}) as %s', v_nome, v_corpo);${
    real
      ? `
  v_nome_c := 'f60_chamada_' || substr(md5(clock_timestamp()::text || random()::text), 1, 16);
  execute format('prepare %I(${tipos.join(', ')}) as select * from public.${bloco.funcao}(${ordem.map((_, i) => '$' + (i + 1)).join(', ')})', v_nome_c);`
      : ''
  }

  begin
${corpoCelulas}
  exception when others then
    execute format('deallocate %I', v_nome);${real ? "\n    execute format('deallocate %I', v_nome_c);" : ''}
    raise;
  end;
  execute format('deallocate %I', v_nome);${real ? "\n  execute format('deallocate %I', v_nome_c);" : ''}

  -- 5. contexto do volume (números, não linhas)
  select count(*) into v_total_ativos from public.ativos;
  select count(*) into v_total_mov from public.movimentacoes;
  select count(*) into v_total_lanc from public.lancamentos_item;

  raise exception 'F60_CUSTO${real ? '_REAL' : ''} %', jsonb_build_object(
    'alvo', '${alvo}', 'bloco', '${bloco.nome}', 'funcao', '${bloco.funcao}',${real ? "\n    'amostras_chamada', v_amostras_chamada, 'md5_prosrc_conferido', v_md5_vivo," : ''}
    'md5_corpo_novo_normalizado', '${md5Normalizado(def.corpo)}',
    'postgres', current_setting('server_version'), 'papel', current_user,
    'hoje', v_hoje, 'n', ${n},
    'n_filiais', array_length(v_todas, 1), 'ordinais_inativos', to_jsonb(v_inativos),
    'total_ativos', v_total_ativos, 'total_movimentacoes', v_total_mov, 'total_lancamentos_item', v_total_lanc,
    'amostras', v_amostras, 'nos', v_nos, 'detalhe', v_detalhe);
end $f60$;`
}

// ---------------------------------------------------------------------------
// 5b. O A/B do as-of NA MESMA SESSÃO — insumo da decisão do índice
// ---------------------------------------------------------------------------
// Por que existe: a forma (b) do corpo novo saiu ~2× mais cara que a mediana
// antiga de f60-producao-antes-rel.json. Comparar com número de OUTRA sessão
// mistura duas coisas: a deriva do volume (ativos cresceram) e o custo do
// próprio EXPLAIN ANALYZE com timing por nó, que pesa mais num plano de 1.600+
// loops (a lateral) do que num de poucos nós (o corpo antigo). Então o bloco
// mede, INTERCALADO e no mesmo plano genérico:
//   velho_timing_on / novo_timing_on   — o método da linha de base;
//   velho_timing_off / novo_timing_off — sem o custo do relógio por nó;
//   novo_nl_anti_timing_on/off         — o corpo novo com enable_mergejoin e
//     enable_hashjoin desligados SÓ enquanto o plano genérico dele nasce (o plano
//     preparado fica em cache; GUC de planejador não invalida plano cacheado):
//     força o anti-join por sonda de índice em estorno_de por linha — separa o
//     custo do anti-join do custo do Sort por ativo, que é o que o índice
//     (ativo_id, data desc, ordem desc) removeria.
// Só leitura: set_config local à transação, nenhuma DDL.

// Dois conjuntos:
//   'diagnostico'  — o que está descrito acima (velho × novo × novo com anti-join por sonda);
//   'alternativas' — duas reescritas CANDIDATAS do as-of, medidas contra velho e novo, no
//     consolidado e em fN (a filial de maior id): o custo NÃO depende só do recorte, porque a
//     projeção de colaborador/setor (status_tem_detentor por linha) só roda para o que passa
//     no filtro da filial calculada.
//       alt_a — o corpo novo com o `not exists` trocado por `m.id <> all (array(...))`: o
//               conjunto de movimentações estornadas até a data vira UM InitPlan, calculado uma
//               vez, e a lateral deixa de fazer anti-join por ativo;
//       alt_c — o corpo 0134 INTEIRO com só o recorte trocado (`filial_id = any ($1)`): a forma
//               de CTE + distinct on, que já cortava a filial calculada no fim.
//   As alternativas NÃO são o corpo aprovado — só números para a decisão; a equivalência de
//   qualquer uma delas roda pelo `gerar-equivalencia` quando (e se) ela entrar em corpos-novos.sql.

export const AB_CONJUNTOS = {
  diagnostico: [
    { rotulo: 'velho_timing_on', stmt: 'v', timing: true, recorte: 'consolidado' },
    { rotulo: 'novo_timing_on', stmt: 'n', timing: true, recorte: 'consolidado', detalhe: true },
    { rotulo: 'novo_nl_anti_timing_on', stmt: 'x', timing: true, recorte: 'consolidado', detalhe: true },
    { rotulo: 'velho_timing_off', stmt: 'v', timing: false, recorte: 'consolidado' },
    { rotulo: 'novo_timing_off', stmt: 'n', timing: false, recorte: 'consolidado' },
    { rotulo: 'novo_nl_anti_timing_off', stmt: 'x', timing: false, recorte: 'consolidado' },
  ],
  alternativas: [
    { rotulo: 'velho·consolidado', stmt: 'v', timing: false, recorte: 'consolidado' },
    { rotulo: 'novo·consolidado', stmt: 'n', timing: false, recorte: 'consolidado' },
    { rotulo: 'alt_a·consolidado', stmt: 'a', timing: false, recorte: 'consolidado' },
    { rotulo: 'alt_c·consolidado', stmt: 'c', timing: false, recorte: 'consolidado' },
    { rotulo: 'velho·fN', stmt: 'v', timing: false, recorte: 'fN' },
    { rotulo: 'novo·fN', stmt: 'n', timing: false, recorte: 'fN' },
    { rotulo: 'alt_a·fN', stmt: 'a', timing: false, recorte: 'fN' },
    { rotulo: 'alt_c·fN', stmt: 'c', timing: false, recorte: 'fN' },
    { rotulo: 'alt_a·consolidado·timing_on', stmt: 'a', timing: true, recorte: 'consolidado', detalhe: true },
  ],
}

/** O `not exists` da lateral do corpo novo, já com $2 — o alvo exato da troca de alt_a. */
const NOT_EXISTS_NOVO = /and not exists \(\s*select 1 from public\.movimentacoes x\s*where x\.estorno_de = m\.id and x\.data <= \$2\s*\)/
const INITPLAN_ALT_A = `and m.id <> all (array(
        select x.estorno_de from public.movimentacoes x
        where x.estorno_de is not null and x.data <= $2
      ))`

function trocarUmaVez(texto, de, para, contexto) {
  const n = (texto.match(new RegExp(de.source ?? de, 'g')) ?? []).length
  if (n !== 1) recusar(`${contexto}: a troca achou ${n} ocorrência(s), esperava 1.`)
  return texto.replace(de, () => para)
}

export function blocoAbAsof(defNovo, corpoVelhoCru, alvo, hoje, { n = N_PADRAO, conjunto = 'diagnostico' } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) recusar('--hoje fora do formato AAAA-MM-DD.')
  const lista = AB_CONJUNTOS[conjunto]
  if (!lista) recusar(`--conjunto: ${Object.keys(AB_CONJUNTOS).join(' | ')}.`)
  const novo = substituir(corpoComoConsulta(defNovo.corpo), { p_filiais: '$1', p_data: '$2' })
  const velho = substituir(corpoComoConsulta(corpoVelhoCru), { p_filial: '$1', p_data: '$2' })
  const corpos = {
    n: { sql: novo, tipos: 'smallint[], date' },
    x: { sql: novo, tipos: 'smallint[], date' },
    v: { sql: velho, tipos: 'smallint, date' },
    a: { sql: trocarUmaVez(novo, NOT_EXISTS_NOVO, INITPLAN_ALT_A, 'alt_a'), tipos: 'smallint[], date' },
    c: {
      sql: trocarUmaVez(velho, /\(\$1 is null or filial_id = \$1\)/, 'filial_id = any ($1)', 'alt_c'),
      tipos: 'smallint[], date',
    },
  }
  const usados = [...new Set(lista.map((v) => v.stmt))]

  const arg1 = (v) => {
    const escalar = v.stmt === 'v'
    if (v.recorte === 'consolidado') return escalar ? 'null::smallint' : 'v_todas'
    if (v.recorte === 'fN') return escalar ? 'v_todas[array_length(v_todas, 1)]' : 'array[v_todas[array_length(v_todas, 1)]]'
    recusar(`recorte fora do modelo: ${v.recorte}`)
  }

  // Forma COMPACTA: um laço por variante (v_k) com um ramo por EXECUTE — é o texto que rodou
  // em produção para o conjunto 'alternativas'. (A resposta do conjunto 'diagnostico' veio da
  // revisão anterior deste gerador, que desenrolava as variantes; a medição é a mesma.)
  const ramos = lista
    .map((v, k) => {
      const cabeca = k === 0 ? `if v_k = ${k + 1} then` : k === lista.length - 1 ? 'else' : `elsif v_k = ${k + 1} then`
      const explain = `explain (analyze, ${v.timing ? '' : 'timing off, '}buffers, format json) execute %I(%L, %L)`
      const liga = v.stmt === 'x' ? `\n          perform set_config('enable_mergejoin', 'off', true); perform set_config('enable_hashjoin', 'off', true);` : ''
      const desliga = v.stmt === 'x' ? `\n          perform set_config('enable_mergejoin', 'on', true); perform set_config('enable_hashjoin', 'on', true);` : ''
      return `        ${cabeca}${liga}
          execute format('${explain}', v_nome_${v.stmt}, ${arg1(v)}, v_hoje) into v_plano;${desliga}`
    })
    .join('\n')
  const comDetalhe = lista.map((v, k) => (v.detalhe ? k + 1 : null)).filter((x) => x !== null)
  const condDetalhe = comDetalhe.length === 1 ? `v_k = ${comDetalhe[0]}` : `v_k in (${comDetalhe.join(', ')})`
  const detalhe = comDetalhe.length
    ? `
            if ${condDetalhe} then
              select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                       'tipo', n.j ->> 'Node Type', 'relacao', n.j ->> 'Relation Name', 'indice', n.j ->> 'Index Name',
                       'pai', n.j ->> 'Parent Relationship', 'juncao', n.j ->> 'Join Type',
                       'loops', (n.j ->> 'Actual Loops')::numeric, 'linhas', (n.j ->> 'Actual Rows')::numeric,
                       'total_ms', round(((n.j ->> 'Actual Total Time')::numeric * (n.j ->> 'Actual Loops')::numeric), 3),
                       'sort_key', n.j -> 'Sort Key', 'sort_method', n.j ->> 'Sort Method',
                       'hit', (n.j ->> 'Shared Hit Blocks')::numeric)))
                into v_det
                from jsonb_path_query(v_p, 'strict $.** ? (exists (@."Node Type"))') as n(j);
              v_detalhe := jsonb_set(v_detalhe, array[v_rot[v_k]], coalesce(v_det, '[]'::jsonb));
            end if;`
    : ''

  const nv = lista.length
  const declaraCorpos = usados.map((s) => `  v_corpo_${s} text := $tc${s}$${corpos[s].sql}$tc${s}$;`).join('\n')
  const declaraNomes = usados.map((s) => `v_nome_${s} text;`).join(' ')
  const prepara = usados
    .map((s) => `  v_nome_${s} := 'f60_ab_${s}_' || v_sufixo;\n  execute format('prepare %I(${corpos[s].tipos}) as %s', v_nome_${s}, v_corpo_${s});`)
    .join('\n')
  const desaloca = (indent) => usados.map((s) => `${indent}execute format('deallocate %I', v_nome_${s});`).join('\n')
  // o md5 sai do BANCO, sobre o texto preparado (com $1/$2), na normalização do runbook
  const md5s = usados.map((s) => `'md5_corpo_${s}_normalizado', md5(regexp_replace(v_corpo_${s}, '\\s+', ' ', 'g'))`).join(',\n    ')

  return `do $f60$
declare${DECLARA_COMUM}
  v_hoje date := date '${hoje}';
${declaraCorpos}
  v_sufixo text;
  ${declaraNomes}
  v_i int;
  v_plano json;
  v_p jsonb;
  v_e jsonb[]; v_pl jsonb[];
  v_hit bigint[]; v_lin bigint[];
  v_stat jsonb;
  v_det jsonb;
  v_amostras jsonb := '{}'::jsonb;
  v_nos jsonb := '{}'::jsonb;
  v_detalhe jsonb := '{}'::jsonb;
  v_total_ativos bigint;
  v_k int;
  v_rot text[] := array[${lista.map((v) => `'${v.rotulo}'`).join(', ')}];
begin
  ${preambulo(alvo)}

  -- 4. os preparados, nome único por execução; plano genérico
  perform set_config('plan_cache_mode', 'force_generic_plan', true);
  v_sufixo := substr(md5(clock_timestamp()::text || random()::text), 1, 12);
${prepara}
  for v_k in 1 .. ${nv} loop v_e[v_k] := '[]'::jsonb; v_pl[v_k] := '[]'::jsonb; end loop;

  begin
    for v_i in 1 .. (${n} + 1) loop
      for v_k in 1 .. ${nv} loop
${ramos}
        end if;
        if v_i > 1 then
          v_p := v_plano::jsonb -> 0;
          v_e[v_k] := v_e[v_k] || jsonb_build_array(v_p -> 'Execution Time');
          v_pl[v_k] := v_pl[v_k] || jsonb_build_array(v_p -> 'Planning Time');
          v_hit[v_k] := (v_p #> '{Plan,Shared Hit Blocks}')::text::bigint;
          v_lin[v_k] := (v_p #> '{Plan,Actual Rows}')::text::bigint;
          if v_i = 2 then
            v_nos := jsonb_set(v_nos, array[v_rot[v_k]], jsonb_build_object(
              'tipos_de_no', (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_path_query(v_p, 'strict $.**."Node Type"') x),
              'indices_usados', (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_path_query(v_p, 'strict $.**."Index Name"') x)));${detalhe}
          end if;
        end if;
      end loop;
    end loop;
  exception when others then
${desaloca('    ')}
    raise;
  end;
${desaloca('  ')}

  for v_k in 1 .. ${nv} loop
    select jsonb_build_object(
        'execucao_ms', jsonb_build_object(
          'mediana', round(percentile_cont(0.5) within group (order by t.e)::numeric, 3),
          'p95', round(percentile_cont(0.95) within group (order by t.e)::numeric, 3),
          'min', round(min(t.e)::numeric, 3), 'max', round(max(t.e)::numeric, 3)),
        'planejamento_ms', jsonb_build_object(
          'mediana', round(percentile_cont(0.5) within group (order by t.p)::numeric, 3),
          'p95', round(percentile_cont(0.95) within group (order by t.p)::numeric, 3)),
        'buffers_raiz_hit', v_hit[v_k], 'linhas', v_lin[v_k], 'n', count(*))
      into v_stat
      from (select a.e::double precision as e, b.p::double precision as p
              from jsonb_array_elements_text(v_e[v_k]) with ordinality as a(e, o)
              join jsonb_array_elements_text(v_pl[v_k]) with ordinality as b(p, o) using (o)) t;
    v_amostras := jsonb_set(v_amostras, array[v_rot[v_k]], v_stat);
  end loop;

  select count(*) into v_total_ativos from public.ativos;

  raise exception 'F60_CUSTO %', jsonb_build_object(
    'alvo', '${alvo}', 'bloco', 'custo-asof-${conjunto === 'diagnostico' ? 'ab' : conjunto}', 'conjunto', '${conjunto}',
    'funcao', 'rel_estoque_asof_filiais × rel_estoque_asof (0134)',
    ${md5s},
    'postgres', current_setting('server_version'), 'papel', current_user,
    'hoje', v_hoje, 'n', ${n},
    'n_filiais', array_length(v_todas, 1), 'ordinais_inativos', to_jsonb(v_inativos),
    'total_ativos', v_total_ativos,
    'amostras', v_amostras, 'nos', v_nos, 'detalhe', v_detalhe);
end $f60$;`
}

// ---------------------------------------------------------------------------
// 6. Leitura das respostas gravadas do canal MCP
// ---------------------------------------------------------------------------

/** Acha `<marca> {…}` (contando chaves, respeitando strings JSON) no texto/erro devolvido pelo MCP. */
export function lerPayload(texto, marca) {
  let msg = texto
  try {
    const j = JSON.parse(texto)
    msg = j?.error?.message ?? j?.message ?? texto
  } catch {
    // resposta gravada como texto puro
  }
  const recusa = /F60_(ALVO_RECUSADO|IDENTIDADE_AUSENTE|FILIAL_AUSENTE|FUNCAO_NOVA_AUSENTE|FUNCAO_VELHA_AUSENTE|CORPO_VIVO_DIFERENTE)[^\n"]*/.exec(msg)
  if (recusa) return { recusa: recusa[0] }
  const i = msg.indexOf(`${marca} {`)
  if (i === -1) recusar(`resposta sem ${marca} — o bloco não chegou ao fim, ou é outra marca.`)
  const inicio = i + marca.length + 1
  let prof = 0
  let emString = false
  for (let k = inicio; k < msg.length; k++) {
    const ch = msg[k]
    if (emString) {
      if (ch === '\\') k++
      else if (ch === '"') emString = false
      continue
    }
    if (ch === '"') emString = true
    else if (ch === '{') prof++
    else if (ch === '}') {
      prof--
      if (prof === 0) return JSON.parse(msg.slice(inicio, k + 1))
    }
  }
  recusar(`${marca} truncado na resposta.`)
}

function shaDoCodigo() {
  try {
    return execSync('git rev-parse HEAD', { cwd: raizRepo() ?? undefined, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export function resumirEquivalencia(p) {
  return {
    celulas: p.celulas,
    iguais: p.iguais,
    divergentes: p.divergentes,
    lista: p.lista ?? [],
    nulo_e_vazio: p.nulo_e_vazio,
    contexto: {
      velha: p.velha,
      md5_corpo_novo_normalizado: p.md5_corpo_novo_normalizado,
      n_filiais: p.n_filiais,
      ordinais_inativos: p.ordinais_inativos,
      n_datas: p.n_datas,
      celulas_vazias_nos_dois: p.celulas_vazias_nos_dois,
      linhas_velho_total: p.linhas_velho_total,
      linhas_novo_total: p.linhas_novo_total,
      por_status: p.por_status,
      status_fora_das_sete_no_novo: p.status_fora_das_sete_no_novo,
      postgres: p.postgres,
      papel: p.papel,
    },
  }
}

// ---------------------------------------------------------------------------
// 7. CLI
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

/** A mediana antiga (forma b, corpo emulado) de uma célula em f60-producao-antes-rel.json. */
function medianaAntiga(antes, funcaoVelha, recorte, celula) {
  const f = antes?.funcoes?.find((x) => x.funcao === funcaoVelha)
  const c = f?.celulas?.find((x) => x.forma === 'corpo_emulado' && x.recorte === recorte && x.celula === celula)
  return c ? { execucao_ms: c.execucao_ms, planejamento_ms: c.planejamento_ms, buffers_raiz: c.buffers_raiz, linhas: c.linhas } : null
}

async function main() {
  const o = args(process.argv.slice(2))
  const modos = [
    'gerar-equivalencia',
    'gerar-custo',
    'gerar-ab-asof',
    'gerar-equivalencia-real',
    'gerar-custo-real',
    'analisar-equivalencia',
    'analisar-custo',
  ]
  if (!modos.includes(o.modo)) recusar(`modo: ${modos.join(' | ')}.`)

  if (o.modo === 'gerar-ab-asof') {
    if (!o.corpos) recusar('--corpos é obrigatório.')
    if (!ALVOS[o.alvo]) recusar(`--alvo: ${Object.keys(ALVOS).join(' | ')}.`)
    if (!o.hoje) recusar('--hoje é obrigatório (AAAA-MM-DD).')
    const raiz = raizRepo()
    if (!raiz) recusar('sem raiz do repositório (RAIZ_REPO ou git) — o corpo VELHO vem de corpo-vigente.mjs, nunca copiado.')
    const { corpoVigente } = await import(pathToFileURL(resolve(raiz, 'scripts/db/corpo-vigente.mjs')).href)
    const { sql } = corpoVigente('public.rel_estoque_asof(smallint, date)', raiz)
    const m = /\$\$([\s\S]*?)\$\$/.exec(sql)
    if (!m) recusar('corpo vigente do as-of sem $$.')
    const corpos = lerCorposNovos(readFileSync(o.corpos, 'utf8'))
    const conjunto = o.conjunto ?? "diagnostico"
    const bloco = blocoAbAsof(corpos.rel_estoque_asof_filiais, m[1], o.alvo, o.hoje, { n: o.n ? Number(o.n) : N_PADRAO, conjunto })
    const nome = `custo-asof-${conjunto === "diagnostico" ? "ab" : conjunto}-${o.alvo}`
    console.log(JSON.stringify({ gravado: gravar(o.dir, nome, bloco) }, null, 2))
    return
  }

  // O PASSO DEPOIS DO APPLY (revisão final da F60): a mesma equivalência e o mesmo custo, com a FUNÇÃO
  // APLICADA no lugar do corpo colado. Os corpos vêm das migrations do repositório (nunca de --corpos), e
  // cada bloco recusa, antes de medir, função ausente, corpo aplicado diferente do versionado e — na
  // equivalência — função velha já derrubada.
  if (o.modo === 'gerar-equivalencia-real' || o.modo === 'gerar-custo-real') {
    if (o.corpos) recusar('--corpos não vale no modo real: os corpos são os das migrations do repositório.')
    if (!ALVOS[o.alvo]) recusar(`--alvo: ${Object.keys(ALVOS).join(' | ')}.`)
    const corpos = lerCorposDoRepositorio()
    const gravados = []
    if (o.modo === 'gerar-equivalencia-real') {
      if (!o.datas) recusar('--datas é obrigatório (o f60-datas-amostra.json).')
      const datas = JSON.parse(readFileSync(o.datas, 'utf8')).datas.map((d) => d.data)
      for (const d of datas) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) recusar(`data fora do formato: ${d}`)
      for (const nome of Object.keys(MODELO)) {
        const sql =
          MODELO[nome].forma === 'kpis' ? blocoKpis(corpos[nome], o.alvo, { real: true }) : blocoEquivalencia(nome, corpos[nome], o.alvo, datas, { real: true })
        gravados.push(gravar(o.dir, `eq-real-${o.alvo}-${nome}`, sql))
      }
    } else {
      if (!o.hoje) recusar('--hoje é obrigatório (AAAA-MM-DD).')
      for (const b of CUSTO) {
        gravados.push(gravar(o.dir, `${b.nome}-real-${o.alvo}`, blocoCusto(b, corpos[b.funcao], o.alvo, o.hoje, { n: o.n ? Number(o.n) : N_PADRAO, real: true })))
      }
    }
    console.log(JSON.stringify({ gravados, projeto: ALVOS[o.alvo].projeto }, null, 2))
    return
  }

  if (o.modo === 'gerar-equivalencia' || o.modo === 'gerar-custo') {
    if (!o.corpos) recusar('--corpos é obrigatório.')
    if (!ALVOS[o.alvo]) recusar(`--alvo: ${Object.keys(ALVOS).join(' | ')}.`)
    const corpos = lerCorposNovos(readFileSync(o.corpos, 'utf8'))
    const gravados = []
    if (o.modo === 'gerar-equivalencia') {
      if (!o.datas) recusar('--datas é obrigatório (o f60-datas-amostra.json).')
      const datas = JSON.parse(readFileSync(o.datas, 'utf8')).datas.map((d) => d.data)
      for (const d of datas) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) recusar(`data fora do formato: ${d}`)
      for (const nome of Object.keys(MODELO)) {
        const sql = MODELO[nome].forma === 'kpis' ? blocoKpis(corpos[nome], o.alvo) : blocoEquivalencia(nome, corpos[nome], o.alvo, datas)
        gravados.push(gravar(o.dir, `eq-${o.alvo}-${nome}`, sql))
      }
    } else {
      if (!o.hoje) recusar('--hoje é obrigatório (AAAA-MM-DD).')
      for (const b of CUSTO) {
        gravados.push(gravar(o.dir, `${b.nome}-${o.alvo}`, blocoCusto(b, corpos[b.funcao], o.alvo, o.hoje, { n: o.n ? Number(o.n) : N_PADRAO })))
      }
    }
    console.log(JSON.stringify({ gravados, projeto: ALVOS[o.alvo].projeto }, null, 2))
    return
  }

  validarDirFora(o.dir)
  if (!o.saida) recusar('--saida é obrigatório na análise.')

  if (o.modo === 'analisar-equivalencia') {
    // forma pedida: { <alvo>: { <função>: { celulas, iguais, divergentes, lista, nulo_e_vazio } } };
    // o que não é alvo mora sob chaves com `_` na frente
    const real = o.real !== undefined
    const saida = {
      _rotulo: real ? 'f60-equivalencia-funcao-real' : 'f60-equivalencia-emulada',
      _sha_codigo: shaDoCodigo(),
      _gerado_em: new Date().toISOString(),
      _metodo:
        (real
          ? 'FUNÇÃO NOVA APLICADA chamada pelo nome (prosrc conferido por md5 contra a migration do repositório) no lugar do corpo colado; o resto é o método da emulação: '
          : '') +
        'corpo NOVO colado como subconsulta com parâmetros em literais tipados (format %L) × função VELHA do banco; ' +
        'count(*) e md5(string_agg(linha::text order by linha::text)) sobre as mesmas colunas com o tipo declarado; ' +
        'datas de amostra × (consolidado = todas as filiais com desativada; f1..fN por ordinal de id); janelas 7d/365d nas de período; ' +
        'rel_saldo_itens em três comparações (i/ii/iii); Sabotagem H emulada (NULL e {}) no corpo novo; identidade authenticated admin/dev; só leitura.',
      _pendencias: [],
    }
    const pendencias = saida._pendencias
    for (const alvo of Object.keys(ALVOS)) {
      for (const nome of Object.keys(MODELO)) {
        const caminho = join(o.dir, 'respostas', `eq-${real ? 'real-' : ''}${alvo}-${nome}.resposta.txt`)
        if (!existsSync(caminho)) {
          pendencias.push({ alvo, funcao: nome, motivo: 'sem resposta gravada do canal' })
          continue
        }
        const marca = (MODELO[nome].forma === 'kpis' ? 'F60_KPIS' : 'F60_EQUIVALENCIA') + (real ? '_REAL' : '')
        const p = lerPayload(readFileSync(caminho, 'utf8'), marca)
        if (p.recusa) {
          pendencias.push({ alvo, funcao: nome, motivo: p.recusa })
          continue
        }
        if (p.alvo !== alvo || p.funcao !== nome) recusar(`resposta trocada em ${caminho}`)
        saida[alvo] ??= {}
        saida[alvo][nome] = resumirEquivalencia(p)
      }
    }
    writeFileSync(o.saida, JSON.stringify(saida, null, 2) + '\n')
    console.log(`gravado ${o.saida}; pendências: ${pendencias.length}`)
    return
  }

  if (o.modo === 'analisar-custo' && o.real !== undefined) {
    const saida = {
      rotulo: 'f60-custo-funcao-real',
      alvo: o.alvo ?? 'producao',
      sha_codigo: shaDoCodigo(),
      gerado_em: new Date().toISOString(),
      metodo:
        'modo real: guarda de md5 do prosrc APLICADO contra a migration do repositório; forma (b) sobre esse corpo (prepare + ' +
        'force_generic_plan + explain analyze buffers execute, 1 aquecimento + N) E a CHAMADA da função pelo nome (prepare ' +
        '"select * from public.<fn>($1…)", mesmo método), intercaladas por célula; identidade authenticated admin/dev; só leitura.',
      celulas: [],
      pendencias: [],
    }
    let confirmacaoAsof = null
    for (const b of CUSTO) {
      const alvo = o.alvo ?? 'producao'
      if (!ALVOS[alvo]) recusar(`--alvo: ${Object.keys(ALVOS).join(' | ')}.`)
      const caminho = join(o.dir, 'respostas', `${b.nome}-real-${alvo}.resposta.txt`)
      if (!existsSync(caminho)) {
        saida.pendencias.push({ bloco: b.nome, motivo: 'sem resposta gravada do canal' })
        continue
      }
      const p = lerPayload(readFileSync(caminho, 'utf8'), 'F60_CUSTO_REAL')
      if (p.recusa) {
        saida.pendencias.push({ bloco: b.nome, motivo: p.recusa })
        continue
      }
      for (const [celula, stat] of Object.entries(p.amostras ?? {})) {
        const [recorte, rot] = celula.split('·')
        const chamada = p.amostras_chamada?.[celula] ?? null
        saida.celulas.push({
          funcao: b.funcao,
          recorte,
          celula: rot,
          corpo_aplicado: { execucao_ms: stat.execucao_ms, planejamento_ms: stat.planejamento_ms, buffers_raiz: stat.buffers_raiz, linhas: stat.linhas, n: stat.n },
          chamada,
          tipos_de_no: p.nos?.[celula]?.tipos_de_no ?? [],
          indices_usados: p.nos?.[celula]?.indices_usados ?? [],
          relacoes_com_seq_scan: p.nos?.[celula]?.relacoes_com_seq_scan ?? [],
        })
        if (b.nome === 'custo-asof-consolidado' && rot === 'hoje') {
          confirmacaoAsof = {
            data: p.hoje,
            medido_em: saida.gerado_em,
            alvo,
            metodo: saida.metodo,
            md5_prosrc_conferido: p.md5_prosrc_conferido,
            execucao_ms: stat.execucao_ms,
            planejamento_ms: stat.planejamento_ms,
            buffers_raiz: stat.buffers_raiz,
            chamada_execucao_ms: chamada?.execucao_ms ?? null,
            linhas: stat.linhas,
            indices_usados: p.nos?.[celula]?.indices_usados ?? [],
          }
        }
      }
    }
    writeFileSync(o.saida, JSON.stringify(saida, null, 2) + '\n')
    // `--confirmar-orcamento=docs/perf/asof-orcamento.json`: grava SÓ `medicao.confirmacao`. O `corpo` e a
    // medição original ficam intactos — trocar o hash é outra decisão (asof-orcamento.test.ts).
    if (o['confirmar-orcamento']) {
      if (!confirmacaoAsof) recusar('sem a célula consolidado·hoje do as-of nas respostas — nada a confirmar.')
      const orcamento = JSON.parse(readFileSync(o['confirmar-orcamento'], 'utf8'))
      if (!orcamento.medicao) recusar('o arquivo de orçamento não tem "medicao".')
      const medido = orcamento.medicao.execucao_ms?.mediana
      orcamento.medicao.confirmacao = {
        ...confirmacaoAsof,
        razao_mediana_sobre_a_medida: medido ? Math.round((confirmacaoAsof.execucao_ms.mediana / medido) * 1000) / 1000 : null,
      }
      writeFileSync(o['confirmar-orcamento'], JSON.stringify(orcamento, null, 2) + '\n')
    }
    console.log(`gravado ${o.saida}: ${saida.celulas.length} célula(s), ${saida.pendencias.length} pendência(s)${o['confirmar-orcamento'] && confirmacaoAsof ? '; confirmação do orçamento gravada' : ''}`)
    return
  }

  if (o.modo === 'analisar-custo') {
    if (!o.antes) recusar('--antes é obrigatório (f60-producao-antes-rel.json).')
    const antes = JSON.parse(readFileSync(o.antes, 'utf8'))
    const antesCusto = o['antes-custo'] && existsSync(o['antes-custo']) ? JSON.parse(readFileSync(o['antes-custo'], 'utf8')) : null
    const saida = {
      rotulo: 'f60-custo-corpos-novos-producao',
      alvo: 'producao',
      sha_codigo: shaDoCodigo(),
      gerado_em: new Date().toISOString(),
      metodo:
        'forma (b) do medir-rel.mjs sobre o corpo NOVO: prepare com $1/$2/$3, plan_cache_mode=force_generic_plan, ' +
        'explain (analyze, buffers, format json) execute, 1 aquecimento + N; estatística agregada dentro do bloco; ' +
        'buffers do nó raiz; identidade authenticated admin/dev; só leitura. Antigo = mediana da forma (b) de f60-producao-antes-rel.json ' +
        '(filial_a = menor id ATIVA ≙ f1, filial_b = maior id ATIVA ≙ fN só quando não há filial desativada).',
      celulas: [],
      pendencias: [],
    }
    const VELHA = { rel_estoque_asof_filiais: 'rel_estoque_asof', rel_saldo_itens_filiais: 'rel_saldo_itens', rel_mov_itens_filiais: 'rel_mov_itens' }
    let orcamento = null
    for (const b of CUSTO) {
      const caminho = join(o.dir, 'respostas', `${b.nome}-producao.resposta.txt`)
      if (!existsSync(caminho)) {
        saida.pendencias.push({ bloco: b.nome, motivo: 'sem resposta gravada do canal' })
        continue
      }
      const p = lerPayload(readFileSync(caminho, 'utf8'), 'F60_CUSTO')
      if (p.recusa) {
        saida.pendencias.push({ bloco: b.nome, motivo: p.recusa })
        continue
      }
      const semInativa = (p.ordinais_inativos ?? []).length === 0
      for (const [celula, stat] of Object.entries(p.amostras ?? {})) {
        const [recorte, rot] = celula.split('·')
        const recorteAntigo = { consolidado: 'consolidado', f1: 'filial_a', fN: 'filial_b' }[recorte]
        let antigo = null
        if (VELHA[b.funcao] && (recorte === 'consolidado' || semInativa)) {
          antigo = medianaAntiga(antes, VELHA[b.funcao], recorteAntigo, rot === '365d' ? '365d' : rot)
        }
        if (b.funcao === 'rel_contagem_status_filiais' && antesCusto) {
          const k = antesCusto.blocos?.find((x) => x.bloco === 'b1-kpis')?.formas
          if (k) {
            antigo = {
              nota: 'caminho antigo = paginarTodos sobre ativos (duas páginas) — soma das medianas; e a agregação única medida como alternativa',
              execucao_ms_paginas_soma: Math.round(((k.hoje_pagina1?.execucao_ms?.mediana ?? 0) + (k.hoje_pagina2?.execucao_ms?.mediana ?? 0)) * 1000) / 1000,
              buffers_hit_paginas_soma: (k.hoje_pagina1?.buffers_raiz?.hit_mediana ?? 0) + (k.hoje_pagina2?.buffers_raiz?.hit_mediana ?? 0),
              agregacao_unica: k.agregacao_unica ? { execucao_ms: k.agregacao_unica.execucao_ms, buffers_raiz: k.agregacao_unica.buffers_raiz } : null,
            }
          }
        }
        const nos = p.nos?.[celula] ?? {}
        const detalhe = p.detalhe?.[celula] ?? null
        const ordenacoes = (detalhe ?? []).filter((d) => d.tipo === 'Sort' || d.tipo === 'Incremental Sort')
        const linha = {
          funcao: b.funcao,
          recorte,
          celula: rot,
          novo: { execucao_ms: stat.execucao_ms, planejamento_ms: stat.planejamento_ms, buffers_raiz: stat.buffers_raiz, linhas: stat.linhas, n: stat.n },
          antigo,
          razao_mediana_execucao_novo_sobre_antigo:
            antigo?.execucao_ms?.mediana ? Math.round((stat.execucao_ms.mediana / antigo.execucao_ms.mediana) * 1000) / 1000 : null,
          tipos_de_no: nos.tipos_de_no ?? [],
          relacoes_com_seq_scan: nos.relacoes_com_seq_scan ?? [],
          indices_usados: nos.indices_usados ?? [],
        }
        if (detalhe) {
          linha.lateral = {
            ordenacoes: ordenacoes.map((d) => ({ tipo: d.tipo, loops: d.loops, sort_key: d.sort_key, presorted_key: d.presorted_key ?? null, sort_method: d.sort_method ?? null })),
            sort_por_ativo_dentro_da_lateral: ordenacoes.some((d) => (d.loops ?? 1) > 1),
            loops_max: Math.max(0, ...detalhe.map((d) => d.loops ?? 0)),
          }
          linha.nos_detalhe = detalhe
        }
        saida.celulas.push(linha)
        if (b.nome === 'custo-asof-consolidado' && rot === 'hoje') {
          orcamento = {
            rotulo: 'asof-orcamento-emulado',
            funcao: 'rel_estoque_asof_filiais',
            corpo: 'EMULADO inline (antes do apply) — confirmar chamando a função depois do apply',
            md5_corpo_novo_normalizado: p.md5_corpo_novo_normalizado,
            normalizacao: "regexp_replace(corpo, '\\s+', ' ', 'g') sobre o texto exato entre os $$",
            alvo: 'producao',
            recorte: 'consolidado (todas as filiais, com desativada)',
            data: p.hoje,
            medido_em: saida.gerado_em,
            metodo: 'prepare + plan_cache_mode=force_generic_plan + explain (analyze, buffers, format json) execute; 1 aquecimento + ' + p.n,
            postgres: p.postgres,
            papel: p.papel,
            volume: { ativos: p.total_ativos, movimentacoes: p.total_movimentacoes, lancamentos_item: p.total_lancamentos_item, filiais: p.n_filiais },
            execucao_ms: stat.execucao_ms,
            planejamento_ms: stat.planejamento_ms,
            buffers_raiz: stat.buffers_raiz,
            linhas: stat.linhas,
            tipos_de_no: nos.tipos_de_no ?? [],
            indices_usados: nos.indices_usados ?? [],
            relacoes_com_seq_scan: nos.relacoes_com_seq_scan ?? [],
            antigo_forma_b_mesma_celula: antigo,
          }
        }
      }
    }
    // os A/B do as-of na mesma sessão (diagnóstico e alternativas), quando as respostas existem
    const METODO_AB = {
      'custo-asof-ab':
        'consolidado, hoje; 6 variantes intercaladas por repetição (1 aquecimento + N); velho = corpo 0134 com p_filial nulo; ' +
        'novo = corpo novo com todas as filiais; nl_anti = corpo novo com enable_mergejoin/enable_hashjoin off só enquanto o plano ' +
        'genérico nasce; timing off = sem relógio por nó; total_ms = Actual Total Time × loops. (Resposta da revisão anterior do ' +
        'gerador, que desenrolava as variantes — mesma medição; md5 dos corpos crus, chaves md5_corpo_novo/velho.)',
      'custo-asof-alternativas':
        'hoje, 8 variantes timing off intercaladas (velho/novo/alt_a/alt_c × consolidado/fN) + alt_a timing on com detalhe; ' +
        'alt_a = corpo novo com o not exists trocado por m.id <> all (array(...)) (InitPlan único); alt_c = corpo 0134 só com ' +
        'filial_id = any ($1). md5 calculado no banco sobre o texto preparado. Alternativas NÃO são o corpo aprovado e NÃO ' +
        'passaram pela equivalência.',
    }
    for (const [bloco, chave] of [['custo-asof-ab', 'ab_asof_mesma_sessao'], ['custo-asof-alternativas', 'ab_asof_alternativas']]) {
      const caminho = join(o.dir, 'respostas', `${bloco}-producao.resposta.txt`)
      if (!existsSync(caminho)) continue
      const p = lerPayload(readFileSync(caminho, 'utf8'), 'F60_CUSTO')
      if (p.recusa) {
        saida.pendencias.push({ bloco, motivo: p.recusa })
        continue
      }
      const ordenacoes = (rot) => (p.detalhe?.[rot] ?? []).filter((d) => d.tipo === 'Sort' || d.tipo === 'Incremental Sort')
      saida[chave] = {
        metodo: METODO_AB[bloco],
        md5: Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('md5_'))),
        total_ativos: p.total_ativos,
        variantes: p.amostras,
        nos: p.nos,
        ordenacoes_na_lateral: Object.fromEntries(Object.keys(p.detalhe ?? {}).map((r) => [r, ordenacoes(r)])),
        detalhe: p.detalhe,
      }
    }
    writeFileSync(o.saida, JSON.stringify(saida, null, 2) + '\n')
    if (o.orcamento && orcamento) writeFileSync(o.orcamento, JSON.stringify(orcamento, null, 2) + '\n')
    console.log(`gravado ${o.saida}: ${saida.celulas.length} célula(s), ${saida.pendencias.length} pendência(s)${orcamento ? '; orçamento gravado' : ''}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Recusa ? err.message : `equivalencia-rel: ERRO — ${err.stack}`)
    process.exit(1)
  })
}

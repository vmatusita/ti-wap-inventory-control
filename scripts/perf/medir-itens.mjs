#!/usr/bin/env node
// ---------------------------------------------------------------------------
// medir-itens.mjs — as FORMAS que o app emite sobre `lancamentos_item`, medidas num volume
// fictício no ENSAIO (F37 · reescrito na F60, frente B)
// ---------------------------------------------------------------------------
// O harness da F37 media um `SELECT` SEM `WHERE` nenhum — forma que a tela nunca emite — e
// chamava as `rel_*` pela assinatura velha (docs/PLAN-F60.md, fato 23 e achado j). Esta versão
// mede o que `src/lib/queries/itens.ts` manda ao banco, com a mesma guarda de alvo e a mesma
// limpeza por marcador:
//
//   1a/1b  `/itens/historico`, recorte `todas`: o `count exact` + a página 1 com os embeds de
//          `LANC_SELECT` (item, filial, autor), `order by created_at desc, id desc limit 20`
//   2a/2b  o mesmo com `filial_id = any (<duas filiais>)` (o operador com vínculo)
//   3a/3b  o recorte do "Saldo após" (1 item + 1 filial): `order by data desc, created_at desc, id desc`
//   4a/4b/4c  `getUltimoLancamento` (`where criado_por = $1 and estorna_id is null order by
//          created_at desc, id desc limit 1`) para TRÊS autores escolhidos no banco: quente (o
//          último lançamento é o mais recente), frio (só escreveu no começo da ordem) e SEM
//          lançamento nenhum — o caso de todo usuário de consulta que abre `/itens`
//   5a/5b  as RPCs de saldo que `/itens` chama (a assinatura que EXISTIR no banco na hora —
//          `rel_saldo_itens_filiais(smallint[], date)` desde a 0143; a velha
//          `rel_saldo_itens(smallint, date)` só num banco anterior a ela, e a 0145 a derruba),
//          rotuladas como forma de `/itens`. O consolidado (5a) é a lista de TODAS as filiais,
//          inclusive as desativadas — a que `getSaldosPorFilial` manda desde o lote 2 da F60
//   5c     `rel_mov_itens` (`_filiais` ou, antes da 0143, a velha), rotulada como forma de
//          RELATÓRIO, não de `/itens` — com a mesma lista de todas as filiais no consolidado
//   6      o custo por INSERT do trigger `valida_lancamento_item` no par quente
//
// As formas 1–4 rodam com PLANO GENÉRICO (`prepare` + `plan_cache_mode = force_generic_plan`),
// como `authenticated` com as claims de um perfil admin/dev escolhido no banco (a RLS vale),
// numa transação `transaction_read_only`; 1 aquecimento + N (padrão 7) amostras intercaladas,
// com buffers e os nós do plano. O embed do PostgREST (`left join lateral` de um-para-um) é
// emulado por `left join`, que é a forma em que o planejador o achata.
//
//   MEDIR_ITENS_CONFIRM=sim node scripts/perf/medir-itens.mjs gerar \
//        --alvo ensaio --ref <ref do ensaio> --canal mcp --dir <fora-do-repo>
//   node scripts/perf/medir-itens.mjs analisar --alvo ensaio --ref <ref> --dir <mesma> \
//        --saida docs/perf/f60-itens-ensaio.json
//
// O CANAL (molde de `scripts/perf/medir-rls.mjs`):
//   mcp — o MCP da Supabase (`execute_sql`). O script NÃO fala com o MCP: `gerar` grava em `--dir`
//         (FORA do repositório) a fila `fila.json` e um `<nome>.sql` por comando; quem opera
//         executa cada um NA ORDEM da fila e grava a resposta ao lado (`<nome>.resposta.txt`, o
//         texto do MCP tal como veio); `analisar` regenera cada comando, confere byte a byte e lê
//         as respostas. Se QUALQUER comando falhar no meio, o próximo a rodar é o de `limpeza`.
//   api — a Management API (`POST /v1/projects/{ref}/database/query`), SÓ se
//         `SUPABASE_ACCESS_TOKEN` já estiver no ambiente do processo (`node --env-file=…`): o
//         token não é procurado em arquivo nenhum, não é impresso e não é gravado. `gerar` com
//         `--canal api` executa a fila ele mesmo e, em erro ou sinal, roda a limpeza.
//
// FALHA FECHADA — o que este arquivo recusa ANTES de gravar ou enviar qualquer comando:
//   · `MEDIR_ITENS_CONFIRM` diferente de `sim` (espelho de `SEED_CONFIRM`);
//   · `--alvo` que não seja `ensaio` (o harness ESCREVE e APAGA: produção nunca, em hipótese
//     nenhuma), `--ref` fora de `REFS_DE_ENSAIO` ou dentro de `REFS_DE_PRODUCAO_CONHECIDOS` — as
//     duas listas lidas como texto de `scripts/env-guard.ts`, a fonte única —, e URL de Supabase
//     no ambiente que aponte para produção (a dupla checagem do achado F11);
//   · comando que não seja, byte a byte, o que este script gera para os parâmetros da fila; e,
//     ANTES dessa conferência, por vocabulário: nenhuma DDL (`alter`, `create`, `drop`…, nem
//     `disable trigger`), nenhum `set`, `update`, `copy`, `call`; `insert` só em `itens` e
//     `lancamentos_item`; `delete` e a janela `estoque.dev_destrutivo` só no comando de limpeza,
//     e só pelo marcador.
//   E, DENTRO de cada comando que escreve, antes da primeira escrita: o banco confirma o alvo —
//   `rotulo_de_ambiente()` = 'desenvolvimento', o mesmo sinal que faz `resetar_dados_ficticios`
//   recusar em produção (tabela `ambiente` vazia lá).
//
// NENHUM DADO REAL SAI DAQUI: os autores, o perfil da RLS, o item e as filiais são escolhidos
// DENTRO do banco; id, e-mail e nome nunca atravessam o canal. A evidência guarda números, nomes
// de nó e de índice, rótulos de forma, patamar, tamanhos e contagens.
//
// ---------------------------------------------------------------------------
// A POPULAÇÃO — e por que o trigger continua LIGADO
// ---------------------------------------------------------------------------
// `valida_lancamento_item()` (0015 → 0118) trava `(item, filial)` e agrega o diário INTEIRO do par
// a cada INSERT: popular L linhas no mesmo par custa O(L²). A F37 ofereceu desligar o trigger
// (`alter table … disable trigger`); isso é DDL e SAIU — a F60 proíbe DDL no ensaio. A resposta é
// só espalhar: `--itens` itens fictícios (`PERF-F37 item NNNNNN`) × as filiais ativas do ensaio,
// com um PAR QUENTE (o primeiro item × a primeira filial) que recebe uma linha a cada
// `--cada-quente` (fração moderada) — é o par "que já tem muitas linhas" da forma 6.
//
// `created_at` tem default `now()`, e um INSERT de uma transação só daria o MESMO instante a todas
// as linhas — destruindo a ordem que `lanc_item_created_idx` (e o índice candidato) mede. Por isso
// cada linha `s` recebe `created_at = <âncora> - (total - s + 1) × passo` (espalhado por
// `--janela-dias`), e `data` é a data desse instante em America/Sao_Paulo. A âncora é um literal
// fixado na geração: blocos rodados em horas diferentes continuam na mesma ordem.
//
// Os autores (todos escolhidos no banco, por ordem de id, entre perfis ativos e não arquivados):
//   · candidatos = perfis sem nenhum lançamento REAL (fora do marcador); o 1º é o SEM lançamento
//     (não recebe nenhuma linha), o 2º é o FRIO (as `--frio` primeiras linhas, as mais antigas);
//   · quente = o primeiro perfil ativo fora dos dois; recebe as `--cauda-quente` últimas linhas;
//   · o resto circula por todos os perfis fora dos dois candidatos.
//
// ---------------------------------------------------------------------------
// A GUARDA DE DELETE EM `lancamentos_item` — E POR QUE A LIMPEZA PRECISA DELA
// ---------------------------------------------------------------------------
// `guarda_acervo` (0081) recusa DELETE em `lancamentos_item` para TODO MUNDO — inclusive service
// role — fora da janela local-à-transação `estoque.dev_destrutivo`. A limpeza abre a janela SÓ na
// sua transação (`set_config(…, true)` fecha sozinho no COMMIT), SÓ depois de o banco se declarar
// de desenvolvimento, e apaga SÓ o que tem o marcador `PERF-F37`. Quem executa SQL direto como
// `postgres` está fora do modelo de ameaça do trigger (o comentário da própria 0081). Nunca contra
// produção — é por isso que a guarda de alvo roda antes de qualquer comando existir.
//
// A LIMPEZA É OBRIGATÓRIA, INCLUSIVE EM ERRO: a contagem de marcadas ANTES (tem de ser zero para
// começar) e DEPOIS (tem de voltar a zero). No canal `api` o `try/finally` e os handlers de sinal
// a rodam (a F37 registrou uma execução morta no meio com ~10 mil linhas no ensaio — docs/
// RELATORIO-F37.md); no canal `mcp` quem opera roda o comando `limpeza` da fila.
//
// O QUE ESTE NÚMERO NÃO PROVA: é o ensaio (Free, outro hardware e outro cache que produção), com
// volume e distribuição fictícios; o arquivo do ensaio carrega o inchaço de execuções anteriores
// (o `estado-antes` grava os tamanhos). Ele decide a FORMA do custo (cresce ou não com o volume),
// não o milissegundo de produção.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const RAIZ = process.cwd()

export const MARCADOR = 'PERF-F37'
const OBS_POPULACAO = `${MARCADOR} ensaio automatizado (scripts/perf/medir-itens.mjs)`
const OBS_MEDIDA = `${MARCADOR} medida individual do trigger (scripts/perf/medir-itens.mjs)`
const EXPLAIN = 'explain (analyze, buffers, format json) '

export const PADROES = Object.freeze({
  lancamentos: 50000,
  patamares: [10000, 50000],
  bloco: 5000,
  itens: 200,
  cadaQuente: 20,
  frio: 250,
  caudaQuente: 50,
  janelaDias: 365,
  n: 7,
})

export class Recusa extends Error {}

function recusar(msg) {
  throw new Recusa(`medir-itens: RECUSADO — ${msg}`)
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

function refDeUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0] || null
  } catch {
    return null
  }
}

/**
 * Confere o alvo por PERMISSÃO e por negação. Só `ensaio`: este harness escreve e apaga.
 * @param {string} alvo @param {string} ref
 */
export function validarAlvo(alvo, ref, refs = refsDoEnvGuard(), ambiente = process.env) {
  if (!alvo) recusar('--alvo é obrigatório (só ensaio).')
  if (alvo !== 'ensaio') recusar(`--alvo "${alvo}" recusado — o harness popula e APAGA linhas; roda só no ensaio.`)
  if (!ref) recusar('--ref é obrigatório: o ref do projeto em que o canal vai executar.')
  if (refs.producao.includes(ref)) recusar('o ref do canal é de PRODUÇÃO — nada é gerado nem enviado.')
  if (!refs.ensaio.includes(ref)) recusar('o ref do canal não está em REFS_DE_ENSAIO — nada é gerado nem enviado.')
  // Achado F11: comparar duas variáveis entre si é CONSISTÊNCIA, não IDENTIDADE. Cada URL de
  // Supabase do ambiente que aponte o ALVO do app é conferida, uma a uma, contra produção.
  for (const nome of ['NEXT_PUBLIC_SUPABASE_URL', 'PERF_SUPABASE_URL']) {
    const r = ambiente[nome] ? refDeUrl(ambiente[nome]) : null
    if (r && refs.producao.includes(r)) recusar(`${nome} aponta para PRODUÇÃO — rode com o ambiente do ensaio.`)
  }
  return { alvo, ref }
}

// ---------------------------------------------------------------------------
// Os parâmetros
// ---------------------------------------------------------------------------

function inteiro(valor, nome, min, max) {
  const n = Number(valor)
  if (!Number.isInteger(n) || n < min || n > max) recusar(`--${nome} precisa ser inteiro entre ${min} e ${max}.`)
  return n
}

function ancoraPadrao(agora = new Date()) {
  return `${agora.toISOString().slice(0, 10)}T00:00:00Z`
}

/** Normaliza e confere os parâmetros da população e da medição. Falha fechada. */
export function validarParametros(entrada = {}) {
  const p = { ...PADROES, ...Object.fromEntries(Object.entries(entrada).filter(([, v]) => v !== undefined)) }
  // teto do Free: 500 MB. 200 mil lançamentos ficariam na casa de 100 MB com índices; acima disso
  // o harness recusa em vez de arriscar o projeto de ensaio.
  const lancamentos = inteiro(p.lancamentos, 'lancamentos', 1000, 200000)
  const bloco = inteiro(p.bloco, 'bloco', 500, 10000)
  const itens = inteiro(p.itens, 'itens', 10, 1000)
  const cadaQuente = inteiro(p.cadaQuente, 'cada-quente', 5, 1000)
  const frio = inteiro(p.frio, 'frio', 1, 5000)
  const caudaQuente = inteiro(p.caudaQuente, 'cauda-quente', 1, 5000)
  const janelaDias = inteiro(p.janelaDias, 'janela-dias', 1, 3650)
  const n = inteiro(p.n, 'n', 7, 31)
  const patamares = (typeof p.patamares === 'string' ? p.patamares.split(',') : p.patamares).map((x) =>
    inteiro(x, 'patamares', 1, lancamentos),
  )
  if (patamares.length === 0) recusar('--patamares vazio.')
  for (let i = 1; i < patamares.length; i++) if (patamares[i] <= patamares[i - 1]) recusar('--patamares precisa ser crescente.')
  if (patamares.at(-1) !== lancamentos) recusar('o último patamar tem de ser o total de --lancamentos.')
  for (const pt of patamares) if (pt % bloco !== 0) recusar(`o patamar ${pt} não cai numa fronteira de bloco (${bloco}).`)
  if (frio + caudaQuente >= patamares[0]) recusar('--frio + --cauda-quente tem de caber abaixo do primeiro patamar.')
  const ancora = p.ancora ?? ancoraPadrao()
  if (!/^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(ancora) || Number.isNaN(Date.parse(ancora))) {
    recusar('--ancora precisa ser AAAA-MM-DDT00:00:00Z.')
  }
  const passo = Math.floor((janelaDias * 86400) / lancamentos)
  if (passo < 1) recusar('--janela-dias curta demais para --lancamentos (passo < 1 s).')
  return { lancamentos, patamares, bloco, itens, cadaQuente, frio, caudaQuente, janelaDias, n, ancora, passo }
}

// ---------------------------------------------------------------------------
// Os comandos — modelo FECHADO
// ---------------------------------------------------------------------------

const GUARDA_ALVO = `  if public.rotulo_de_ambiente() is distinct from 'desenvolvimento' then
    raise exception 'F60I_ALVO_RECUSADO rotulo=%', coalesce(public.rotulo_de_ambiente(), '(null)');
  end if;`

const CANDIDATOS = `select p.id, row_number() over (order by p.id) as ordem
    from public.profiles p
   where p.ativo and p.excluido_em is null
     and not exists (select 1 from public.lancamentos_item l
                      where l.criado_por = p.id
                        and (l.observacao is null or l.observacao not like '${MARCADOR}%'))`

const RESULTADO_MS = `round((extract(epoch from clock_timestamp() - statement_timestamp()) * 1000)::numeric, 1)`

/** Estado do banco — só leitura; é o "antes" e o "depois" da limpeza. */
export function comandoEstado(momento) {
  if (momento !== 'antes' && momento !== 'depois') recusar(`estado fora do modelo: ${momento}`)
  return `select json_build_object(
  'comando', 'estado-${momento}',
  'rotulo', public.rotulo_de_ambiente(),
  'postgres', current_setting('server_version'),
  'lancamentos_total', (select count(*) from public.lancamentos_item),
  'lancamentos_marcados', (select count(*) from public.lancamentos_item where observacao like '${MARCADOR}%'),
  'itens_marcados', (select count(*) from public.itens where nome like '${MARCADOR}%'),
  'banco_bytes', pg_database_size(current_database()),
  'lancamentos_item_bytes', pg_total_relation_size('public.lancamentos_item'),
  'lancamentos_item_heap_bytes', pg_relation_size('public.lancamentos_item'),
  'lanc_item_created_idx_bytes', pg_relation_size('public.lanc_item_created_idx'),
  'indice_candidato_existe', to_regclass('public.lanc_item_criado_por_idx') is not null,
  'filiais_ativas', (select count(*) from public.filiais where ativo),
  'perfis_candidatos', (select count(*) from (${CANDIDATOS}) as c),
  'perfis_admin_ativos', (select count(*) from public.profiles where ativo and excluido_em is null and papel in ('admin', 'dev'))
) as f60i_resultado;`
}

/** Os itens fictícios da piscina de pares. */
export function comandoItens(p) {
  return `do $f60i$
begin
${GUARDA_ALVO}
  if exists (select 1 from public.itens where nome like '${MARCADOR}%') then
    raise exception 'F60I_POPULACAO_ITENS_JA_EXISTEM';
  end if;
end $f60i$;
with ins as (
  insert into public.itens (nome, grupo, ordem)
  select '${MARCADOR} item ' || lpad(g.s::text, 6, '0'), 'acessorio', g.s
    from generate_series(1, ${p.itens}) as g (s)
   where public.rotulo_de_ambiente() = 'desenvolvimento'
  returning 1
)
select json_build_object('comando', 'itens', 'inseridos', c.n, 'ms', ${RESULTADO_MS}) as f60i_resultado
  from (select count(*) as n from ins) as c;`
}

/** Um bloco da população: as linhas `de`..`ate` (1-based) da sequência fixa. */
export function comandoPopular(p, de, ate) {
  if (!Number.isInteger(de) || !Number.isInteger(ate) || de < 1 || ate > p.lancamentos || de > ate) {
    recusar(`bloco fora do modelo: ${de}..${ate}`)
  }
  const instante = `timestamptz '${p.ancora}' - make_interval(secs => (${p.lancamentos} - g.s + 1) * ${p.passo})`
  return `do $f60i$
begin
${GUARDA_ALVO}
  if (select count(*) from public.itens where nome like '${MARCADOR} item %') <> ${p.itens} then
    raise exception 'F60I_POPULACAO_SEM_ITENS';
  end if;
  if not exists (select 1 from public.filiais where ativo) then
    raise exception 'F60I_POPULACAO_SEM_FILIAIS';
  end if;
  if (select count(*) from (${CANDIDATOS}) as c) < 2 then
    raise exception 'F60I_POPULACAO_SEM_AUTORES';
  end if;
  if not exists (select 1 from public.profiles q
                  where q.ativo and q.excluido_em is null
                    and q.id not in (select c.id from (${CANDIDATOS}) as c where c.ordem <= 2)) then
    raise exception 'F60I_POPULACAO_SEM_AUTOR_QUENTE';
  end if;
end $f60i$;
with cand as (
  ${CANDIDATOS}
),
ctx as (
  select
    (select c.id from cand c where c.ordem = 2) as frio,
    (select q.id from public.profiles q
      where q.ativo and q.excluido_em is null and q.id not in (select c.id from cand c where c.ordem <= 2)
      order by q.id limit 1) as quente,
    (select array_agg(q.id order by q.id) from public.profiles q
      where q.id not in (select c.id from cand c where c.ordem <= 2)) as lote,
    (select array_agg(i.id order by i.nome) from public.itens i where i.nome like '${MARCADOR} item %') as itens,
    (select array_agg(f.id order by f.id) from public.filiais f where f.ativo) as fil
),
ins as (
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, observacao, criado_por, created_at)
  select
    case when g.s % ${p.cadaQuente} = 0 then x.itens[1]
         else x.itens[1 + (g.s % (cardinality(x.itens) * cardinality(x.fil))) / cardinality(x.fil)] end,
    case when g.s % ${p.cadaQuente} = 0 then x.fil[1]
         else x.fil[1 + (g.s % (cardinality(x.itens) * cardinality(x.fil))) % cardinality(x.fil)] end,
    'entrada',
    1 + (g.s * 37) % 50,
    ((${instante}) at time zone 'America/Sao_Paulo')::date,
    '${OBS_POPULACAO}',
    case when g.s <= ${p.frio} then x.frio
         when g.s > ${p.lancamentos - p.caudaQuente} then x.quente
         else x.lote[1 + g.s % cardinality(x.lote)] end,
    ${instante}
  from ctx as x, generate_series(${de}, ${ate}) as g (s)
  where public.rotulo_de_ambiente() = 'desenvolvimento'
  returning 1
)
select json_build_object('comando', 'popular', 'de', ${de}, 'ate', ${ate}, 'inseridas', c.n, 'ms', ${RESULTADO_MS}) as f60i_resultado
  from (select count(*) as n from ins) as c;`
}

const COLUNAS_PAGINA =
  'l.id, l.data, l.tipo, l.quantidade, l.chamado, l.colaborador, l.observacao, l.estorna_id, l.created_at, i.nome, i.grupo, f.nome, p.nome'
const EMBEDS =
  'from public.lancamentos_item l left join public.itens i on i.id = l.item_id left join public.filiais f on f.id = l.filial_id left join public.profiles p on p.id = l.criado_por'

/** As formas de leitura: rótulo → texto do `prepare`. A ordem é a do loop intercalado. */
export const PREPARADOS = Object.freeze({
  f60i_contagem_todas: 'select count(*) from public.lancamentos_item l',
  f60i_pagina_todas: `select ${COLUNAS_PAGINA} ${EMBEDS} order by l.created_at desc, l.id desc limit 20 offset 0`,
  'f60i_contagem_filiais(smallint[])': 'select count(*) from public.lancamentos_item l where l.filial_id = any ($1)',
  'f60i_pagina_filiais(smallint[])': `select ${COLUNAS_PAGINA} ${EMBEDS} where l.filial_id = any ($1) order by l.created_at desc, l.id desc limit 20 offset 0`,
  'f60i_contagem_item(smallint[], smallint)':
    'select count(*) from public.lancamentos_item l where l.filial_id = any ($1) and l.item_id = $2',
  'f60i_pagina_item(smallint[], smallint)': `select ${COLUNAS_PAGINA} ${EMBEDS} where l.filial_id = any ($1) and l.item_id = $2 order by l.data desc, l.created_at desc, l.id desc limit 20 offset 0`,
  'f60i_ultimo(uuid)':
    'select l.item_id, l.filial_id, l.tipo, l.chamado, l.colaborador from public.lancamentos_item l where l.criado_por = $1 and l.estorna_id is null order by l.created_at desc, l.id desc limit 1',
})

export const FORMAS_LEITURA = Object.freeze({
  '1a_contagem_todas': { tela: '/itens/historico', descricao: 'count exact, recorte todas' },
  '1b_pagina_todas': { tela: '/itens/historico', descricao: 'página 1 com os embeds, recorte todas' },
  '2a_contagem_duas_filiais': { tela: '/itens/historico', descricao: 'count exact, filial_id = any (duas filiais)' },
  '2b_pagina_duas_filiais': { tela: '/itens/historico', descricao: 'página 1 com os embeds, duas filiais' },
  '3a_contagem_item_quente': { tela: '/itens/historico', descricao: 'count exact, 1 item + 1 filial (o par quente)' },
  '3b_pagina_item_quente_ordem_data': { tela: '/itens/historico', descricao: 'página 1, 1 item + 1 filial, ordem por data (Saldo após)' },
  '4a_ultimo_autor_quente': { tela: '/itens', descricao: 'getUltimoLancamento — o último lançamento é o mais recente' },
  '4b_ultimo_autor_frio': { tela: '/itens', descricao: 'getUltimoLancamento — o autor só escreveu no começo da ordem' },
  '4c_ultimo_autor_sem_lancamento': { tela: '/itens', descricao: 'getUltimoLancamento — autor sem lançamento nenhum' },
  '5a_itens_saldo_consolidado': { tela: '/itens', descricao: 'RPC de saldo, consolidado (todas as filiais)' },
  '5b_itens_saldo_uma_filial': { tela: '/itens', descricao: 'RPC de saldo, uma filial' },
  '5c_relatorio_mov_itens_30_dias': { tela: 'relatório', descricao: 'RPC de movimento de itens, consolidado, 30 dias' },
})

const nomeDoPreparado = (assinatura) => assinatura.replace(/\(.*$/, '')

/** O bloco de medição das formas de leitura (1–5) num patamar. Nunca se confirma. */
export function comandoMedirLeitura(p, patamar) {
  if (!p.patamares.includes(patamar)) recusar(`patamar fora do modelo: ${patamar}`)
  const prepares = Object.entries(PREPARADOS)
    .map(([assinatura, sql]) => `  execute 'prepare ${assinatura} as ${sql}';`)
    .join('\n')
  const deallocates = Object.keys(PREPARADOS)
    .map((a) => `  execute 'deallocate ${nomeDoPreparado(a)}';`)
    .join('\n')
  const formas = Object.keys(FORMAS_LEITURA).map((f) => `'${f}'`).join(', ')
  return `do $f60i$
declare
  v_rotulo   text;
  v_admin    uuid;
  v_sem      uuid;
  v_frio     uuid;
  v_quente   uuid;
  v_fil      smallint[];
  v_todas    smallint[];
  v_duas     smallint[];
  v_item_q   smallint;
  v_fil_q    smallint;
  v_nome     text;
  v_ctx      jsonb;
  v_prep     jsonb;
  v_ass      jsonb;
  v_plano    json;
  v_p        jsonb;
  v_nos_k    jsonb;
  v_amostras jsonb := '{}';
  v_nos      jsonb := '{}';
  v_formas   text[] := array[${formas}];
  v_sql      text[];
  v_i        int;
  v_k        int;
begin
  perform set_config('transaction_read_only', 'on', true);
  v_rotulo := public.rotulo_de_ambiente();
  if v_rotulo is distinct from 'desenvolvimento' then
    raise exception 'F60I_ALVO_RECUSADO rotulo=%', coalesce(v_rotulo, '(null)');
  end if;
  for v_nome in select s.name from pg_prepared_statements s where s.name like 'f60i\\_%' loop
    execute format('deallocate %I', v_nome);
  end loop;

  select p.id into v_admin from public.profiles p
   where p.ativo and p.excluido_em is null and p.papel in ('admin', 'dev') order by p.id limit 1;
  select c.id into v_sem from (${CANDIDATOS}) as c where c.ordem = 1;
  select c.id into v_frio from (${CANDIDATOS}) as c where c.ordem = 2;
  select l.criado_por into v_quente from public.lancamentos_item l
   where l.estorna_id is null order by l.created_at desc, l.id desc limit 1;
  select l.item_id, l.filial_id into v_item_q, v_fil_q from public.lancamentos_item l
   where l.observacao like '${MARCADOR}%' group by l.item_id, l.filial_id
   order by count(*) desc, l.item_id, l.filial_id limit 1;
  select array_agg(f.id order by f.id) into v_fil from public.filiais f where f.ativo;
  -- F60 · lote 2: o consolidado das rel_*_filiais é a lista de TODAS (com desativada), como o app manda.
  select array_agg(f.id order by f.id) into v_todas from public.filiais f;
  if v_admin is null or v_sem is null or v_frio is null or v_quente is null or v_item_q is null or v_fil is null then
    raise exception 'F60I_IDENTIDADE_AUSENTE';
  end if;
  if exists (select 1 from public.lancamentos_item l where l.criado_por = v_sem) then
    raise exception 'F60I_SEM_LANCAMENTO_TEM_LINHA';
  end if;
  v_duas := array[v_fil[1], v_fil[cardinality(v_fil)]];

  v_ctx := jsonb_build_object(
    'lancamentos_total', (select count(*) from public.lancamentos_item),
    'lancamentos_marcados', (select count(*) from public.lancamentos_item where observacao like '${MARCADOR}%'),
    'autores_distintos', (select count(distinct criado_por) from public.lancamentos_item),
    'linhas_duas_filiais', (select count(*) from public.lancamentos_item where filial_id = any (v_duas)),
    'linhas_par_quente', (select count(*) from public.lancamentos_item where item_id = v_item_q and filial_id = v_fil_q),
    'linhas_autor_quente', (select count(*) from public.lancamentos_item where criado_por = v_quente),
    'linhas_autor_frio', (select count(*) from public.lancamentos_item where criado_por = v_frio),
    'linhas_mais_novas_que_o_ultimo_do_frio', (select count(*) from public.lancamentos_item
       where created_at > (select max(created_at) from public.lancamentos_item where criado_por = v_frio and estorna_id is null)),
    'linhas_autor_sem_lancamento', (select count(*) from public.lancamentos_item where criado_por = v_sem),
    'reltuples', (select c.reltuples from pg_class c where c.oid = 'public.lancamentos_item'::regclass),
    'n_mod_since_analyze', (select s.n_mod_since_analyze from pg_stat_user_tables s where s.relid = 'public.lancamentos_item'::regclass),
    'banco_bytes', pg_database_size(current_database()),
    'lancamentos_item_bytes', pg_total_relation_size('public.lancamentos_item'),
    'lancamentos_item_heap_bytes', pg_relation_size('public.lancamentos_item'),
    'lanc_item_created_idx_bytes', pg_relation_size('public.lanc_item_created_idx'),
    'indice_candidato_existe', to_regclass('public.lanc_item_criado_por_idx') is not null);

  v_ass := jsonb_build_object(
    'rel_saldo_itens_velha', to_regprocedure('public.rel_saldo_itens(smallint,date)') is not null,
    'rel_saldo_itens_filiais', to_regprocedure('public.rel_saldo_itens_filiais(smallint[],date)') is not null,
    'rel_mov_itens_velha', to_regprocedure('public.rel_mov_itens(smallint,date,date)') is not null,
    'rel_mov_itens_filiais', to_regprocedure('public.rel_mov_itens_filiais(smallint[],date,date)') is not null);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform set_config('plan_cache_mode', 'force_generic_plan', true);

${prepares}

  v_sql := array[
    'execute f60i_contagem_todas',
    'execute f60i_pagina_todas',
    format('execute f60i_contagem_filiais(%L)', v_duas),
    format('execute f60i_pagina_filiais(%L)', v_duas),
    format('execute f60i_contagem_item(%L, %s)', array[v_fil_q], v_item_q),
    format('execute f60i_pagina_item(%L, %s)', array[v_fil_q], v_item_q),
    format('execute f60i_ultimo(%L)', v_quente),
    format('execute f60i_ultimo(%L)', v_frio),
    format('execute f60i_ultimo(%L)', v_sem),
    case
      when (v_ass ->> 'rel_saldo_itens_filiais')::boolean
        then format('select * from public.rel_saldo_itens_filiais(%L::smallint[], current_date)', v_todas)
      when (v_ass ->> 'rel_saldo_itens_velha')::boolean
        then 'select * from public.rel_saldo_itens(null::smallint, current_date)'
    end,
    case
      when (v_ass ->> 'rel_saldo_itens_filiais')::boolean
        then format('select * from public.rel_saldo_itens_filiais(%L::smallint[], current_date)', array[v_fil_q])
      when (v_ass ->> 'rel_saldo_itens_velha')::boolean
        then format('select * from public.rel_saldo_itens(%s::smallint, current_date)', v_fil_q)
    end,
    case
      when (v_ass ->> 'rel_mov_itens_filiais')::boolean
        then format('select * from public.rel_mov_itens_filiais(%L::smallint[], (current_date - 30)::date, current_date)', v_todas)
      when (v_ass ->> 'rel_mov_itens_velha')::boolean
        then 'select * from public.rel_mov_itens(null::smallint, (current_date - 30)::date, current_date)'
    end
  ];

  for v_i in 0 .. ${p.n} loop
    for v_k in 1 .. array_length(v_formas, 1) loop
      continue when v_sql[v_k] is null;
      execute '${EXPLAIN}' || v_sql[v_k] into v_plano;
      continue when v_i = 0;
      v_p := v_plano::jsonb -> 0;
      v_amostras := jsonb_set(v_amostras, array[v_formas[v_k]],
        coalesce(v_amostras -> v_formas[v_k], '[]'::jsonb) || jsonb_build_array(jsonb_build_array(
          v_p -> 'Execution Time', v_p -> 'Planning Time',
          v_p #> '{Plan,Shared Hit Blocks}', v_p #> '{Plan,Shared Read Blocks}', v_p #> '{Plan,Actual Rows}')));
      if v_i = 1 then
        select jsonb_agg(jsonb_build_array(
                 n ->> 'Node Type', coalesce(n ->> 'Index Name', n ->> 'Relation Name'),
                 n -> 'Actual Rows', n -> 'Actual Loops', n -> 'Rows Removed by Filter',
                 n -> 'Shared Hit Blocks', n -> 'Shared Read Blocks'))
          into v_nos_k
          from jsonb_path_query(v_p, 'strict $.** ? (exists (@."Node Type"))') as n;
        v_nos := v_nos || jsonb_build_object(v_formas[v_k], v_nos_k);
      end if;
    end loop;
  end loop;

  select jsonb_object_agg(s.name, jsonb_build_array(s.generic_plans, s.custom_plans)) into v_prep
    from pg_prepared_statements s where s.name like 'f60i\\_%';
${deallocates}

  raise exception 'F60I_LEITURA %', jsonb_build_object(
    'comando', 'medir-leitura', 'patamar', ${patamar}, 'n', ${p.n},
    'postgres', current_setting('server_version'), 'papel_na_medicao', current_user,
    'contexto', v_ctx, 'assinaturas', v_ass, 'planos_preparados', v_prep,
    'amostras', v_amostras, 'nos', v_nos);
end $f60i$;`
}

/** O custo por INSERT do trigger no par quente (forma 6). Termina em exceção: nada fica gravado. */
export function comandoMedirEscrita(p, patamar) {
  if (!p.patamares.includes(patamar)) recusar(`patamar fora do modelo: ${patamar}`)
  return `do $f60i$
declare
  v_autor    uuid;
  v_item_q   smallint;
  v_fil_q    smallint;
  v_linhas   bigint;
  v_plano    json;
  v_p        jsonb;
  v_amostras jsonb := '[]';
  v_nos      jsonb;
  v_i        int;
begin
${GUARDA_ALVO}
  select p.id into v_autor from public.profiles p
   where p.ativo and p.excluido_em is null and p.papel in ('admin', 'dev') order by p.id limit 1;
  select l.item_id, l.filial_id, count(*) into v_item_q, v_fil_q, v_linhas from public.lancamentos_item l
   where l.observacao like '${MARCADOR}%' group by l.item_id, l.filial_id
   order by count(*) desc, l.item_id, l.filial_id limit 1;
  if v_autor is null or v_item_q is null then
    raise exception 'F60I_CONTEXTO_AUSENTE';
  end if;
  for v_i in 0 .. ${p.n} loop
    execute format('${EXPLAIN}insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, observacao, criado_por) values (%s, %s, %L, 1, current_date, %L, %L)',
      v_item_q, v_fil_q, 'entrada', '${OBS_MEDIDA}', v_autor) into v_plano;
    continue when v_i = 0;
    v_p := v_plano::jsonb -> 0;
    v_amostras := v_amostras || jsonb_build_array(jsonb_build_array(
      v_p -> 'Execution Time', v_p -> 'Planning Time',
      v_p #> '{Plan,Shared Hit Blocks}', v_p #> '{Plan,Shared Read Blocks}',
      jsonb_path_query_first(v_p, 'lax $.Triggers[*] ? (@."Trigger Name" == "trg_valida_lancamento_item").Time')));
    if v_i = 1 then
      select jsonb_agg(jsonb_build_array(n ->> 'Node Type', n ->> 'Relation Name')) into v_nos
        from jsonb_path_query(v_p, 'strict $.** ? (exists (@."Node Type"))') as n;
    end if;
  end loop;
  raise exception 'F60I_ESCRITA %', jsonb_build_object(
    'comando', 'medir-escrita', 'patamar', ${patamar}, 'n', ${p.n},
    'papel_na_medicao', current_user, 'linhas_par_quente', v_linhas,
    'amostras', v_amostras, 'nos', v_nos);
end $f60i$;`
}

/** A limpeza: só o marcador, só dentro da janela da própria transação. */
export function comandoLimpeza() {
  return `begin;
do $f60i$
begin
${GUARDA_ALVO}
end $f60i$;
select set_config('estoque.dev_destrutivo', 'on', true);
delete from public.lancamentos_item where observacao like '${MARCADOR}%';
delete from public.itens where nome like '${MARCADOR}%';
commit;
select json_build_object(
  'comando', 'limpeza',
  'lancamentos_marcados_depois', (select count(*) from public.lancamentos_item where observacao like '${MARCADOR}%'),
  'itens_marcados_depois', (select count(*) from public.itens where nome like '${MARCADOR}%'),
  'ms', ${RESULTADO_MS}
) as f60i_resultado;`
}

/** A fila inteira, na ordem de execução. `analisar` a regenera para conferir cada arquivo. */
export function montarFila(p) {
  const fila = []
  const add = (tipo, rotulo, sql, extra = {}) => {
    fila.push({ nome: `${String(fila.length + 1).padStart(3, '0')}-${rotulo}`, tipo, sql, ...extra })
  }
  add('estado', 'estado-antes', comandoEstado('antes'), { momento: 'antes' })
  add('itens', 'itens', comandoItens(p))
  for (let de = 1; de <= p.lancamentos; de += p.bloco) {
    const ate = Math.min(de + p.bloco - 1, p.lancamentos)
    add('popular', `popular-${String(de).padStart(6, '0')}-${String(ate).padStart(6, '0')}`, comandoPopular(p, de, ate), { de, ate })
    if (p.patamares.includes(ate)) {
      add('medir-leitura', `medir-leitura-${ate}`, comandoMedirLeitura(p, ate), { patamar: ate })
      add('medir-escrita', `medir-escrita-${ate}`, comandoMedirEscrita(p, ate), { patamar: ate })
    }
  }
  add('limpeza', 'limpeza', comandoLimpeza())
  add('estado', 'estado-depois', comandoEstado('depois'), { momento: 'depois' })
  return fila
}

// ---------------------------------------------------------------------------
// A guarda — roda sobre TODO comando antes de ele sair do processo
// ---------------------------------------------------------------------------

const PROIBIDAS = [
  'alter', 'create', 'drop', 'truncate', 'grant', 'revoke', 'vacuum', 'copy', 'call', 'reindex',
  'cluster', 'comment', 'refresh', 'listen', 'notify', 'security', 'disable', 'enable', 'reassign',
  'checkpoint', 'import', 'load', 'update', 'merge', 'lock', 'owner', 'policy', 'set', 'reset',
  'rollback', 'savepoint', 'discard', 'unlisten', 'cursor', 'fetch',
]
const FUNCOES_PROIBIDAS = /\b(pg_terminate_backend|pg_cancel_backend|pg_sleep\w*|pg_read_\w+|pg_write_\w+|lo_\w+|dblink\w*|pg_reload_conf|set_role|pg_advisory_lock|pg_advisory_xact_lock|pg_notify)\b/i
const GUCS = {
  estado: [],
  itens: [],
  popular: [],
  'medir-leitura': ['transaction_read_only', 'request.jwt.claims', 'role', 'plan_cache_mode'],
  'medir-escrita': [],
  limpeza: ['estoque.dev_destrutivo'],
}

/**
 * Recusa o comando fora do modelo. Primeiro o vocabulário (cada recusa diz o motivo), depois o
 * FECHO: o texto tem de ser, byte a byte, o que `montarFila(p)` gera para aquele nome.
 * @param {{ nome: string, tipo: string, sql: string }} comando @param {object} p
 */
export function validarComando(comando, p) {
  const { nome, tipo, sql } = comando
  if (typeof sql !== 'string' || sql.length === 0) recusar(`${nome}: comando vazio.`)
  if (!(tipo in GUCS)) recusar(`${nome}: tipo fora do modelo (${tipo}).`)
  const minusculo = sql.toLowerCase()
  const semExplain = minusculo.split(EXPLAIN.trim()).join(' ')
  for (const palavra of PROIBIDAS) {
    if (new RegExp(`\\b${palavra}\\b`).test(semExplain)) recusar(`${nome}: palavra proibida "${palavra}".`)
  }
  if (/\banaly[sz]e\b/.test(semExplain)) recusar(`${nome}: analyze fora do explain do modelo.`)
  if (/replication/.test(minusculo)) recusar(`${nome}: replication no comando.`)
  if (FUNCOES_PROIBIDAS.test(sql)) recusar(`${nome}: função proibida no comando.`)

  for (const m of minusculo.matchAll(/set_config\(\s*'([^']+)'/g)) {
    if (!GUCS[tipo].includes(m[1])) recusar(`${nome}: set_config de "${m[1]}" fora do permitido para ${tipo}.`)
  }
  if ((minusculo.match(/set_config\(/g) ?? []).length !== [...minusculo.matchAll(/set_config\(\s*'[^']+'/g)].length) {
    recusar(`${nome}: set_config com parâmetro que não é literal.`)
  }
  if (tipo === 'medir-leitura' && !/begin\s+perform set_config\('transaction_read_only', 'on', true\);/.test(minusculo)) {
    recusar(`${nome}: a medição de leitura não liga transaction_read_only antes de tudo.`)
  }

  const inserts = [...minusculo.matchAll(/\binsert\s+into\s+([a-z_.]+)/g)].map((m) => m[1])
  const podeInserir = { itens: ['public.itens'], popular: ['public.lancamentos_item'], 'medir-escrita': ['public.lancamentos_item'] }
  for (const alvo of inserts) {
    if (!(podeInserir[tipo] ?? []).includes(alvo)) recusar(`${nome}: insert em ${alvo} fora do permitido para ${tipo}.`)
  }
  if ((minusculo.match(/\binsert\b/g) ?? []).length !== inserts.length) recusar(`${nome}: insert fora da forma "insert into".`)
  if (inserts.length > 0 && !sql.includes(MARCADOR)) recusar(`${nome}: insert sem o marcador ${MARCADOR}.`)

  const deletes = minusculo.match(/\bdelete\b[^;]*;/g) ?? []
  if (tipo !== 'limpeza' && deletes.length > 0) recusar(`${nome}: delete fora do comando de limpeza.`)
  if (tipo === 'limpeza') {
    const permitidos = [
      `delete from public.lancamentos_item where observacao like '${MARCADOR.toLowerCase()}%';`,
      `delete from public.itens where nome like '${MARCADOR.toLowerCase()}%';`,
    ]
    if (deletes.length !== 2 || deletes.some((d) => !permitidos.includes(d))) recusar(`${nome}: delete fora da forma do marcador.`)
  }
  if (/\bcommit\b/.test(minusculo) !== (tipo === 'limpeza')) recusar(`${nome}: commit fora do comando de limpeza.`)

  const escreve = tipo !== 'estado'
  if (escreve && !sql.includes("if public.rotulo_de_ambiente() is distinct from 'desenvolvimento' then") &&
      !sql.includes("if v_rotulo is distinct from 'desenvolvimento' then")) {
    recusar(`${nome}: comando sem a guarda de alvo pelo banco.`)
  }
  if (tipo === 'medir-leitura' || tipo === 'medir-escrita') {
    if (!/raise exception 'F60I_(LEITURA|ESCRITA) %', jsonb_build_object\([\s\S]*\);\s*end \$f60i\$;$/.test(sql)) {
      recusar(`${nome}: a medição não termina em raise exception — ela poderia se confirmar.`)
    }
  }
  for (const m of minusculo.matchAll(/\b(prepare|deallocate)\s+([a-z0-9_]+)/g)) {
    if (tipo !== 'medir-leitura' || !m[2].startsWith('f60i_')) recusar(`${nome}: ${m[1]} fora do modelo.`)
  }

  const esperado = montarFila(p).find((c) => c.nome === nome)
  if (!esperado || esperado.tipo !== tipo || esperado.sql !== sql) {
    recusar(`${nome}: o comando não é, byte a byte, o que este script gera para os parâmetros da fila.`)
  }
  return comando
}

function validarDirFora(dir) {
  if (!dir) recusar('--dir é obrigatório (fora do repositório).')
  const abs = resolve(dir)
  const rel = relative(RAIZ, abs)
  if (!rel.startsWith('..') && !isAbsolute(rel)) recusar('--dir dentro do repositório — comandos e respostas moram FORA dele.')
  return abs
}

// ---------------------------------------------------------------------------
// A emissão (mcp) e a execução (api)
// ---------------------------------------------------------------------------

function gravarFila(fila, p, alvo, dir) {
  mkdirSync(dir, { recursive: true })
  const manifesto = {
    versao: 1,
    alvo,
    parametros: p,
    comandos: fila.map(({ nome, tipo, de, ate, patamar, momento }) => ({ nome, tipo, de, ate, patamar, momento })),
  }
  writeFileSync(join(dir, 'fila.json'), JSON.stringify(manifesto, null, 2) + '\n')
  for (const c of fila) writeFileSync(join(dir, `${c.nome}.sql`), c.sql)
}

const MARCAS = { 'medir-leitura': 'F60I_LEITURA', 'medir-escrita': 'F60I_ESCRITA' }

/**
 * Executa a fila pela Management API, na ordem; em erro OU sinal roda a limpeza antes de sair.
 * @param {ReturnType<typeof montarFila>} fila
 */
async function executarApi(fila, { dir, ref, fetchImpl = globalThis.fetch }) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) recusar('canal api sem SUPABASE_ACCESS_TOKEN no ambiente do processo — o token não é procurado em outro lugar.')
  const limpeza = fila.find((c) => c.tipo === 'limpeza')
  const depois = fila.find((c) => c.nome.endsWith('estado-depois'))
  let limpezaEnviada = false

  const enviar = async (c) => {
    const r = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: c.sql }),
      signal: AbortSignal.timeout(180000),
    })
    const texto = (await r.text()).split(token).join('***')
    writeFileSync(join(dir, `${c.nome}.resposta.txt`), texto)
    return { ok: r.ok, texto }
  }
  const limpar = async () => {
    if (limpezaEnviada) return
    limpezaEnviada = true
    await enviar(limpeza)
    const { texto } = await enviar(depois)
    const estado = lerResposta(texto, 'resultado')
    return estado.lancamentos_marcados === 0 && estado.itens_marcados === 0
  }

  let sinalTratado = false
  const porSinal = async (sinal) => {
    if (sinalTratado) return
    sinalTratado = true
    console.error(`medir-itens: ${sinal} — rodando a limpeza antes de sair (o finally não roda aqui).`)
    try {
      const limpo = await limpar()
      console.error(limpo ? 'medir-itens: limpeza por sinal ok.' : 'medir-itens: ATENÇÃO GRAVE — o ensaio ficou SUJO; rode o comando limpeza.')
      process.exit(limpo ? 130 : 1)
    } catch (err) {
      console.error(`medir-itens: ATENÇÃO GRAVE — a limpeza por sinal falhou: ${err.message}`)
      process.exit(1)
    }
  }
  for (const sinal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sinal, () => void porSinal(sinal))

  try {
    for (const c of fila) {
      if (c.tipo === 'limpeza') limpezaEnviada = true
      const { ok, texto } = await enviar(c)
      if (MARCAS[c.tipo]) {
        if (!texto.includes(`${MARCAS[c.tipo]} {`)) throw new Error(`${c.nome}: a medição não chegou ao fim.`)
        continue
      }
      if (!ok) throw new Error(`${c.nome}: o canal respondeu erro.`)
      if (c.tipo === 'estado' && c.momento === 'antes') {
        const e = lerResposta(texto, 'resultado')
        if (e.rotulo !== 'desenvolvimento') throw new Error('o banco não se declara de desenvolvimento.')
        if (e.lancamentos_marcados !== 0 || e.itens_marcados !== 0) throw new Error('há linhas marcadas ANTES — o ensaio já estava sujo.')
      }
      if (c.tipo === 'popular' && lerResposta(texto, 'resultado').inseridas !== c.ate - c.de + 1) {
        throw new Error(`${c.nome}: o bloco não inseriu todas as linhas.`)
      }
    }
  } catch (err) {
    console.error(`medir-itens: ERRO — ${err.message} — rodando a limpeza.`)
    const limpo = await limpar().catch(() => false)
    if (!limpo) console.error('medir-itens: ATENÇÃO GRAVE — o ensaio ficou SUJO; rode o comando limpeza da fila.')
    throw err
  }
}

// ---------------------------------------------------------------------------
// A análise
// ---------------------------------------------------------------------------

/** Acha o objeto JSON que começa na posição `inicio` (respeita strings e escapes). */
function objetoEm(texto, inicio) {
  let prof = 0
  let emString = false
  for (let k = inicio; k < texto.length; k++) {
    const ch = texto[k]
    if (emString) {
      if (ch === '\\') k++
      else if (ch === '"') emString = false
      continue
    }
    if (ch === '"') emString = true
    else if (ch === '{') prof++
    else if (ch === '}') {
      prof--
      if (prof === 0) return JSON.parse(texto.slice(inicio, k + 1))
    }
  }
  recusar('objeto truncado na resposta.')
}

/**
 * O payload de uma resposta gravada do canal. `marca` = 'resultado' para os comandos que devolvem
 * linha (`f60i_resultado`), ou `F60I_LEITURA`/`F60I_ESCRITA` para os blocos que terminam em exceção.
 */
export function lerResposta(texto, marca) {
  let msg = texto
  try {
    const j = JSON.parse(texto)
    msg = typeof j?.result === 'string' ? j.result : (j?.error?.message ?? j?.message ?? texto)
    if (typeof msg !== 'string') msg = JSON.stringify(j)
  } catch {
    // não era JSON: a resposta foi gravada como texto puro
  }
  const recusa = /F60I_(ALVO_RECUSADO|POPULACAO_[A-Z_]+|IDENTIDADE_AUSENTE|CONTEXTO_AUSENTE|SEM_LANCAMENTO_TEM_LINHA)[^\n"]*/.exec(msg)
  if (recusa) return { recusa: recusa[0] }
  if (marca === 'resultado') {
    const m = /"f60i_resultado"\s*:\s*\{/.exec(msg)
    if (!m) recusar('resposta sem f60i_resultado — o comando não chegou ao fim.')
    return objetoEm(msg, m.index + m[0].length - 1)
  }
  const i = msg.indexOf(`${marca} {`)
  if (i === -1) recusar(`resposta sem ${marca} — o bloco não chegou ao fim.`)
  return objetoEm(msg, i + marca.length + 1)
}

/** Mediana e p95 por posto mais próximo (com N = 7, o p95 é a maior amostra — declarado). */
export function estatistica(valores) {
  const v = valores.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (v.length === 0) return null
  const posto = (q) => v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)]
  const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  const r = (x) => Math.round(x * 1000) / 1000
  return { mediana: r(med), p95: r(posto(0.95)), min: r(v[0]), max: r(v.at(-1)), n: v.length }
}

const NO = (a) => ({ no: a[0], alvo: a[1], linhas: a[2], loops: a[3], removidas_pelo_filtro: a[4], hit: a[5], read: a[6] })

export function resumirLeitura(payload) {
  const formas = []
  for (const [forma, meta] of Object.entries(FORMAS_LEITURA)) {
    const a = payload.amostras?.[forma]
    if (!a) {
      formas.push({ forma, ...meta, medida: false, motivo: 'assinatura ausente no banco' })
      continue
    }
    const linhas = [...new Set(a.map((x) => x[4]))]
    formas.push({
      forma,
      ...meta,
      execucao_ms: estatistica(a.map((x) => x[0])),
      planejamento_ms: estatistica(a.map((x) => x[1])),
      buffers_raiz: { hit_mediana: estatistica(a.map((x) => x[2])).mediana, read_mediana: estatistica(a.map((x) => x[3])).mediana },
      linhas_devolvidas: linhas.length === 1 ? linhas[0] : linhas,
      nos: (payload.nos?.[forma] ?? []).map(NO),
    })
  }
  return formas
}

/** Quantas linhas de `lancamentos_item` o plano visitou: devolvidas + removidas pelo filtro, × loops. */
export function linhasVisitadas(nos) {
  let soma = 0
  for (const n of nos) {
    if (!/Scan/.test(n.no ?? '') || !/^(lancamentos_item|lanc_item_)/.test(n.alvo ?? '')) continue
    soma += ((n.linhas ?? 0) + (n.removidas_pelo_filtro ?? 0)) * (n.loops ?? 1)
  }
  return soma
}

/**
 * A regra da decisão do índice (spec F60 · frente B): se 4c (autor sem lançamento) ou 4b (frio)
 * mostra custo que CRESCE com o volume — percorre o índice de `created_at` inteiro ou grande parte
 * dele —, o índice entra. Com dois patamares ou mais, "cresce" = as linhas visitadas OU os buffers
 * crescem pelo menos à metade da razão do volume; com um só, = visita metade da tabela ou mais.
 */
export function decidirIndice(patamares) {
  const casos = {}
  for (const forma of ['4b_ultimo_autor_frio', '4c_ultimo_autor_sem_lancamento']) {
    const serie = patamares
      .map((pt) => {
        const f = pt.formas.find((x) => x.forma === forma)
        if (!f || f.medida === false) return null
        const total = pt.contexto.lancamentos_total
        const visitadas = linhasVisitadas(f.nos)
        return {
          patamar: pt.patamar,
          lancamentos_total: total,
          execucao_ms_mediana: f.execucao_ms.mediana,
          buffers_mediana: f.buffers_raiz.hit_mediana + f.buffers_raiz.read_mediana,
          linhas_visitadas: visitadas,
          fracao_da_tabela_visitada: Math.round((visitadas / total) * 1000) / 1000,
          nos: f.nos.map((n) => n.no + (n.alvo ? ` ${n.alvo}` : '')),
        }
      })
      .filter(Boolean)
    if (serie.length === 0) continue
    const primeiro = serie[0]
    const ultimo = serie.at(-1)
    const r = (x) => Math.round(x * 100) / 100
    const razaoVolume = ultimo.lancamentos_total / primeiro.lancamentos_total
    const razaoVisitadas = primeiro.linhas_visitadas > 0 ? ultimo.linhas_visitadas / primeiro.linhas_visitadas : null
    const razaoBuffers = primeiro.buffers_mediana > 0 ? ultimo.buffers_mediana / primeiro.buffers_mediana : null
    const razaoExec = primeiro.execucao_ms_mediana > 0 ? ultimo.execucao_ms_mediana / primeiro.execucao_ms_mediana : null
    const cresce =
      serie.length > 1
        ? (razaoVisitadas ?? 0) >= 0.5 * razaoVolume || (razaoBuffers ?? 0) >= 0.5 * razaoVolume
        : ultimo.fracao_da_tabela_visitada >= 0.5
    casos[forma] = {
      serie,
      razao_volume: r(razaoVolume),
      razao_linhas_visitadas: razaoVisitadas === null ? null : r(razaoVisitadas),
      razao_buffers: razaoBuffers === null ? null : r(razaoBuffers),
      razao_execucao: razaoExec === null ? null : r(razaoExec),
      cresce_com_o_volume: cresce,
    }
  }
  const entra = Object.values(casos).some((c) => c.cresce_com_o_volume)
  const resultado = Object.keys(casos).length === 0 ? 'sem_dados' : entra ? 'entra' : 'nao_entra'
  // O número que sustenta a decisão sai do caso 4c (o de todo usuário de consulta), ou do 4b.
  const chave = casos['4c_ultimo_autor_sem_lancamento'] ? '4c_ultimo_autor_sem_lancamento' : '4b_ultimo_autor_frio'
  const base = casos[chave]
  let recomendacao = 'sem dados — nenhum patamar mediu 4b/4c.'
  if (base) {
    const a = base.serie[0]
    const z = base.serie.at(-1)
    const lado = `${chave}: com ${z.lancamentos_total} lançamentos o plano genérico de getUltimoLancamento visita ${z.linhas_visitadas} linhas ` +
      `(${Math.round(z.fracao_da_tabela_visitada * 100)}% da tabela) em ${z.buffers_mediana} buffers e ${z.execucao_ms_mediana} ms de mediana` +
      (base.serie.length > 1
        ? `; com ${a.lancamentos_total}, ${a.linhas_visitadas} linhas, ${a.buffers_mediana} buffers e ${a.execucao_ms_mediana} ms — ` +
          `buffers ×${base.razao_buffers} e linhas visitadas ×${base.razao_linhas_visitadas} para volume ×${base.razao_volume}`
        : '')
    recomendacao =
      resultado === 'entra'
        ? `ENTRA. ${lado}. O custo é linear no tamanho da tabela e é pago em toda carga de /itens por quem não tem lançamento ` +
          '(getUltimoLancamento está no Promise.all da página); o índice parcial (criado_por, created_at desc) where estorna_id is null ' +
          'troca a varredura por uma descida de índice. Migration própria, com este "antes" no cabeçalho.'
        : `NÃO ENTRA. ${lado}. O planejador já tem caminho que não cresce com o volume (R-REL-33).`
  }
  return {
    indice: 'lanc_item_criado_por_idx on public.lancamentos_item (criado_por, created_at desc) where estorna_id is null',
    regra:
      'entra se 4b (frio) ou 4c (sem lançamento) crescer com o volume: linhas visitadas (devolvidas + Rows Removed by Filter, × loops) ou buffers crescendo pelo menos à metade da razão do volume entre o primeiro e o último patamar',
    casos,
    resultado,
    recomendacao,
    depois:
      resultado === 'entra'
        ? 'pendente — medido no ensaio depois do apply normal da fase (CI → ensaio), com este mesmo harness; o índice NÃO foi criado nesta medição'
        : 'não se aplica',
  }
}

function shaDoCodigo() {
  try {
    return execSync('git rev-parse HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/** Lê a fila e as respostas de `dir`, confere cada comando e monta a evidência. */
export function analisar(dir) {
  const manifesto = JSON.parse(readFileSync(join(dir, 'fila.json'), 'utf8'))
  const p = validarParametros(manifesto.parametros)
  if (JSON.stringify(p) !== JSON.stringify(manifesto.parametros)) recusar('fila.json com parâmetros fora do normalizado.')
  const fila = montarFila(p)
  if (JSON.stringify(fila.map((c) => c.nome)) !== JSON.stringify(manifesto.comandos.map((c) => c.nome))) {
    recusar('fila.json não é a fila que este script gera para os parâmetros declarados.')
  }
  const pendencias = []
  const saida = { estado_antes: null, itens: null, populacao: [], patamares: [], limpeza: null, estado_depois: null }
  let postgres = null
  for (const c of fila) {
    const arqSql = join(dir, `${c.nome}.sql`)
    if (!existsSync(arqSql)) recusar(`${c.nome}.sql ausente em --dir.`)
    validarComando({ ...c, sql: readFileSync(arqSql, 'utf8') }, p)
    const arqResp = join(dir, `${c.nome}.resposta.txt`)
    if (!existsSync(arqResp)) {
      pendencias.push({ comando: c.nome, motivo: 'sem resposta gravada do canal' })
      continue
    }
    const texto = readFileSync(arqResp, 'utf8')
    const r = lerResposta(texto, MARCAS[c.tipo] ?? 'resultado')
    if (r.recusa) {
      pendencias.push({ comando: c.nome, motivo: r.recusa })
      continue
    }
    if (c.tipo === 'estado') {
      postgres = r.postgres
      const resto = { ...r }
      delete resto.postgres
      delete resto.comando
      saida[c.momento === 'antes' ? 'estado_antes' : 'estado_depois'] = resto
    } else if (c.tipo === 'itens') {
      saida.itens = { inseridos: r.inseridos, ms: r.ms }
    } else if (c.tipo === 'popular') {
      if (r.de !== c.de || r.ate !== c.ate) recusar(`${c.nome}: resposta não corresponde ao bloco.`)
      saida.populacao.push({ de: r.de, ate: r.ate, inseridas: r.inseridas, ms: r.ms })
      if (r.inseridas !== c.ate - c.de + 1) pendencias.push({ comando: c.nome, motivo: `inseriu ${r.inseridas} de ${c.ate - c.de + 1}` })
    } else if (c.tipo === 'medir-leitura') {
      if (r.patamar !== c.patamar) recusar(`${c.nome}: resposta não corresponde ao patamar.`)
      saida.patamares.push({
        patamar: r.patamar,
        papel_na_medicao: r.papel_na_medicao,
        contexto: r.contexto,
        assinaturas: r.assinaturas,
        planos_preparados: Object.fromEntries(
          Object.entries(r.planos_preparados ?? {}).map(([k, [g, cu]]) => [k, { genericos: g, custom: cu }]),
        ),
        formas: resumirLeitura(r),
      })
    } else if (c.tipo === 'medir-escrita') {
      const pt = saida.patamares.find((x) => x.patamar === r.patamar)
      const escrita = {
        forma: '6_insert_trigger_par_quente',
        tela: '/itens (lançar)',
        descricao: 'EXPLAIN ANALYZE de um INSERT individual no par quente (trigger valida_lancamento_item ligado), como postgres; o bloco termina em exceção e nada fica gravado',
        papel_na_medicao: r.papel_na_medicao,
        linhas_par_quente: r.linhas_par_quente,
        execucao_ms: estatistica(r.amostras.map((x) => x[0])),
        planejamento_ms: estatistica(r.amostras.map((x) => x[1])),
        buffers_raiz: { hit_mediana: estatistica(r.amostras.map((x) => x[2])).mediana, read_mediana: estatistica(r.amostras.map((x) => x[3])).mediana },
        trigger_ms: estatistica(r.amostras.map((x) => x[4])),
        nos: (r.nos ?? []).map((a) => a.filter(Boolean).join(' ')),
      }
      if (pt) pt.escrita = escrita
      else pendencias.push({ comando: c.nome, motivo: 'escrita sem a leitura do mesmo patamar' })
    } else if (c.tipo === 'limpeza') {
      saida.limpeza = {
        ms: r.ms,
        lancamentos_marcados_depois: r.lancamentos_marcados_depois,
        itens_marcados_depois: r.itens_marcados_depois,
        ok: r.lancamentos_marcados_depois === 0 && r.itens_marcados_depois === 0,
      }
    }
  }
  const tempos = saida.populacao.map((b) => b.ms)
  return {
    parametros: p,
    postgres,
    pendencias,
    ...saida,
    populacao: {
      blocos: saida.populacao,
      inseridas: saida.populacao.reduce((s, b) => s + b.inseridas, 0),
      ms_total: Math.round(tempos.reduce((s, x) => s + x, 0)),
      ms_bloco_mais_lento: tempos.length ? Math.max(...tempos) : null,
    },
    decisao_indice: decidirIndice(saida.patamares),
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
  if (!['gerar', 'analisar'].includes(o.modo)) recusar('modo: gerar | analisar.')
  const { alvo, ref } = validarAlvo(o.alvo, o.ref)
  const canal = o.canal ?? 'mcp'
  if (!['mcp', 'api'].includes(canal)) recusar(`--canal "${canal}" não existe — só mcp|api.`)
  const dir = validarDirFora(o.dir)

  if (o.modo === 'gerar') {
    if (process.env.MEDIR_ITENS_CONFIRM !== 'sim') {
      recusar('MEDIR_ITENS_CONFIRM diferente de "sim" — defina-o para confirmar que quer popular e apagar linhas no ensaio.')
    }
    const p = validarParametros({
      lancamentos: o.lancamentos,
      patamares: o.patamares,
      bloco: o.bloco,
      itens: o.itens,
      cadaQuente: o['cada-quente'],
      frio: o.frio,
      caudaQuente: o['cauda-quente'],
      janelaDias: o['janela-dias'],
      n: o.n,
      ancora: o.ancora,
    })
    const fila = montarFila(p)
    for (const c of fila) validarComando(c, p)
    gravarFila(fila, p, alvo, dir)
    if (canal === 'api') await executarApi(fila, { dir, ref })
    console.log(JSON.stringify({ alvo, canal, dir: 'fora do repositório', comandos: fila.map((c) => c.nome) }, null, 2))
    return
  }

  if (!o.saida) recusar('--saida é obrigatório na análise.')
  const r = analisar(dir)
  const saida = {
    rotulo: 'f60-itens-ensaio',
    alvo,
    canal: canal === 'mcp' ? 'MCP da Supabase (execute_sql), um comando por vez na ordem da fila' : 'Management API (database/query)',
    sha_codigo: shaDoCodigo(),
    gerado_em: new Date().toISOString(),
    metodo:
      `formas 1–4 com plano GENÉRICO (prepare + plan_cache_mode = force_generic_plan), como authenticated com as claims de um perfil admin/dev escolhido no banco, ` +
      `transaction_read_only = on; 1 aquecimento + N=${r.parametros.n} amostras intercaladas; explain (analyze, buffers, format json); mediana e p95 por posto mais próximo ` +
      `(com N=7 o p95 é a maior amostra); buffers do nó raiz; o bloco termina em raise exception. Forma 6 como postgres, INSERT individual no par quente, também desfeito pela exceção. ` +
      `População com o trigger valida_lancamento_item LIGADO (nenhuma DDL), created_at espalhado por ${r.parametros.janelaDias} dias a partir da âncora.`,
    ...r,
  }
  writeFileSync(join(RAIZ, o.saida), JSON.stringify(saida, null, 2) + '\n')
  console.log(`gravado ${o.saida}: ${r.patamares.length} patamar(es), ${r.pendencias.length} pendência(s), decisão do índice: ${r.decisao_indice.resultado}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Recusa ? err.message : `medir-itens: ERRO — ${err.message}`)
    process.exit(1)
  })
}

// =============================================================================
// gerar-0134.mjs — a 0134 da F53, DERIVADA do corpo vigente (não copiada à mão)
// =============================================================================
// A migration 0134 recria duas funções e uma view trocando UMA linha em cada. Copiar
// os corpos à mão é como uma recriação em cadeia perde uma guarda (a causa que a F51
// documentou): a cópia envelhece e ninguém percebe. Aqui o corpo sai de
// `corpoVigente()` e a troca passa por `trocarNoCorpo()`, que REPROVA quando o trecho
// não está mais lá — em vez de aplicar uma mudança que não muda nada.
//
// Uso:
//   node scripts/db/gerar-0134.mjs            # confere e imprime o diff (não grava)
//   node scripts/db/gerar-0134.mjs --aplicar  # grava supabase/migrations/0134_*.sql
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { corpoVigente, trocarNoCorpo } from './corpo-vigente.mjs'

const APLICAR = process.argv.includes('--aplicar')
const DESTINO = 'supabase/migrations/0134_desempate_por_ordem.sql'

/** Conta as linhas que diferem entre dois corpos (removidas / acrescentadas). */
function diffLinhas(antes, depois) {
  const a = antes.split('\n')
  const d = depois.split('\n')
  const removidas = a.filter((l) => !d.includes(l))
  const acrescentadas = d.filter((l) => !a.includes(l))
  return { removidas, acrescentadas }
}

const relatorio = []

// ---------------------------------------------------------------------------
// 1) rel_estoque_asof — o `order by` do CTE `ult`
// ---------------------------------------------------------------------------
const asof = corpoVigente('rel_estoque_asof(smallint, date)')
const ASOF_DE = `    order by e.ativo_id, e.data desc, e.created_at desc,
             (e.tipo = 'ajuste') desc,
             e.id desc`
const ASOF_PARA = `    order by e.ativo_id, e.data desc, e.ordem desc`
const asofNovo = trocarNoCorpo(asof.sql, ASOF_DE, ASOF_PARA, 'f53-asof')
relatorio.push({ objeto: 'rel_estoque_asof', vigente: asof.arquivo, ...diffLinhas(asof.sql, asofNovo) })

// ---------------------------------------------------------------------------
// 2) aplicar_movimentacao — a trava do estorno
// ---------------------------------------------------------------------------
const aplicar = corpoVigente('aplicar_movimentacao()')
const TRAVA_DE = `        and (m.created_at, m.id) > (v_orig.created_at, v_orig.id)`
const TRAVA_PARA = `        and (m.created_at, m.ordem) > (v_orig.created_at, v_orig.ordem)`
const aplicarNovo = trocarNoCorpo(aplicar.sql, TRAVA_DE, TRAVA_PARA, 'f53-trava-estorno')
relatorio.push({ objeto: 'aplicar_movimentacao', vigente: aplicar.arquivo, ...diffLinhas(aplicar.sql, aplicarNovo) })

// ---------------------------------------------------------------------------
// 3) v_conflitos_filiais — a única régua de "última movimentação" SEM desempate
// ---------------------------------------------------------------------------
// A view não passa por corpoVigente (ele resolve função). O corpo sai do arquivo da
// ÚLTIMA migration que a recria — conferido contra o `pg_get_viewdef` VIVO de produção.
const VIEW_ARQ = 'supabase/migrations/0096_conflito_data_entrada.sql'
const viewSql = readFileSync(VIEW_ARQ, 'utf8')
const iniView = viewSql.indexOf('create or replace view public.v_conflitos_filiais')
if (iniView < 0) throw new Error('gerar-0134: a definição de v_conflitos_filiais não foi achada em ' + VIEW_ARQ)
// O comando termina no `;` que fecha — a view não tem dollar-quoting, então o primeiro
// `;` depois de um `from`/`order by` completo serve; usamos o scanner do módulo irmão.
const { fimDoComando } = await import('./corpo-vigente.mjs')
const fimView = fimDoComando(viewSql, iniView)
const viewCorpo = viewSql.slice(iniView, fimView)
const VIEW_DE = `      order by m2.data desc, m2.created_at desc`
const VIEW_DE_MIN = `                  ORDER BY m2.data DESC, m2.created_at DESC`
const alvoView = viewCorpo.includes(VIEW_DE) ? VIEW_DE : VIEW_DE_MIN
const viewNovo = trocarNoCorpo(
  viewCorpo,
  alvoView,
  alvoView + ', m2.ordem desc',
  'f53-view-conflitos',
)
relatorio.push({ objeto: 'v_conflitos_filiais', vigente: VIEW_ARQ, ...diffLinhas(viewCorpo, viewNovo) })

// ---------------------------------------------------------------------------
// O relatório do diff — é ele que prova o critério 10 ("só a linha do desempate")
// ---------------------------------------------------------------------------
for (const r of relatorio) {
  console.log(`\n=== ${r.objeto} (corpo vigente: ${r.vigente}) ===`)
  console.log(`  removidas: ${r.removidas.length}   acrescentadas: ${r.acrescentadas.length}`)
  r.removidas.forEach((l) => console.log('  - ' + l))
  r.acrescentadas.forEach((l) => console.log('  + ' + l))
}

if (!APLICAR) {
  console.log('\n(conferência apenas — use --aplicar para gravar ' + DESTINO + ')')
  process.exit(0)
}

const CABECALHO = `-- Migration 0134 — F53: o desempate passa a ser \`ordem\`, e não mais o uuid de \`id\`.
--
-- Depende da 0133 (a coluna \`ordem\`). ⚠ ORDEM DE APPLY OBRIGATÓRIA: a 0133 vem ANTES desta.
-- Se esta entrar primeiro, os três corpos citam uma coluna que não existe e o apply falha com
-- 42703 — barulhento, mas ainda assim uma volta ao início.
--
-- =============================================================================
-- O QUE MUDA, E O QUE DELIBERADAMENTE NÃO MUDA
-- =============================================================================
-- ⚠ ESTE ARQUIVO É GERADO por \`node scripts/db/gerar-0134.mjs --aplicar\`, a partir do CORPO
-- VIGENTE resolvido das migrations (\`corpoVigente\`) com UMA troca por objeto
-- (\`trocarNoCorpo\`, que reprova se o trecho não estiver mais lá). Não o edite à mão: edite o
-- gerador e regenere. O diff medido, objeto a objeto, é:
--     rel_estoque_asof     — 3 linhas removidas, 1 acrescentada  (só o \`order by\` do CTE \`ult\`)
--     aplicar_movimentacao — 1 linha  removida,  1 acrescentada  (só a trava do estorno)
--     v_conflitos_filiais  — 1 linha  removida,  1 acrescentada  (só o \`order by\` da subconsulta)
--
-- 1) \`rel_estoque_asof\`: \`data desc, created_at desc, (tipo='ajuste') desc, id desc\`
--    vira \`data desc, ordem desc\`.
--    ⚠ \`data\` CONTINUA sendo a primeira chave, e isso é a decisão central da fase.
--    \`ordem desc\` SOZINHO reproduz a ordem de hoje — mas só para o passado, porque no
--    passado \`ordem\` foi calculada com \`data\` como primeira componente. Daqui para a
--    frente \`ordem\` é ordem de INSERÇÃO, e uma movimentação lançada com data retroativa
--    (medido: 2227 das 3497 linhas de produção, 63,7%, com atraso de até 935 dias) ganharia
--    \`ordem\` alta e passaria a vencer o as-of de um período em que ela não era a verdade.
--    Mantendo \`data\` na frente, \`ordem\` faz só o que veio fazer: desempatar com exatidão.
--    E \`(tipo = 'ajuste')\` SAI porque \`ordem\` já o reproduz — é a terceira componente do
--    backfill da 0133, e para linha futura o ajuste é inserido depois, logo tem \`ordem\` maior.
--
-- 2) \`aplicar_movimentacao\`, a trava do estorno: \`(created_at, id)\` vira \`(created_at, ordem)\`.
--    ⚠ \`created_at\` CONTINUA sendo a primeira chave, e isso também é decisão medida, não
--    inércia. A trava protege a CADEIA de \`snapshot_anterior\`, que é construída na ordem de
--    GRAVAÇÃO — desfazer fora dessa ordem restaura um retrato velho. Medido em produção,
--    ativo a ativo, sobre os 1620 ativos:
--        · \`(created_at, ordem)\`  difere de hoje em 643 ativos — e os 643 têm empate de
--          \`created_at\`, ou seja, 100% dos casos em que a resposta de hoje é um SORTEIO;
--        · \`ordem\` sozinha difere em 653 — os mesmos 643 MAIS 10 sem empate nenhum, em que
--          ela apontaria uma linha que não é a última gravada. Esses 10 são exatamente o que
--          não se pode mudar, e é por isso que a régua pura foi recusada.
--    Nos 643 que mudam, a régua nova aponta o \`ajuste\` em 643 de 643; a de hoje apontava o
--    \`ajuste\` em 0 de 643. \`ativos.status\` já concorda com a nova.
--
-- 3) \`v_conflitos_filiais.ultima_mov_tipo\`: ganha \`, m2.ordem desc\`. Era a ÚNICA régua de
--    "última movimentação" da base inteira SEM desempate nenhum (medido no \`pg_get_viewdef\`
--    vivo), com 1448 ativos em empate de \`created_at\` esperando por ela.
--
-- O QUE **NÃO** MUDA, e por quê — \`apagar_movimentacao\` (corpo vigente 0090):
--    ela compara \`(created_at, id)\` em 0090:182, igualzinho à trava do estorno. Mas o
--    desempate por \`id\` ali é **INALCANÇÁVEL**: a recusa de empate da 0087 (0090:168-174)
--    barra, nove linhas antes, TODO ativo em que dois \`created_at\` sejam iguais. Quando o
--    \`exists\` de :182 roda, os \`created_at\` do ativo já são distintos dois a dois, e o \`id\`
--    nunca decide. Trocar por \`ordem\` ali seria um no-op — e não seria de graça: o corpo dela
--    contém \`delete from public.movimentacoes\`, logo bate no GATE do modo automático
--    (\`docs/RUNBOOK-BANCO.md\`) e exigiria uma migration separada pelo caminho B. A prova de
--    que o \`id\` é inalcançável está no roteiro (rótulo 10c), não na fé.
--
-- \`create or replace\` PURO nos três casos: assinaturas byte a byte idênticas, sem overload,
-- sem grant novo, sem policy nova. NENHUMA linha de dado é tocada. O corpo não contém
-- exclusão de acervo → NÃO bate no gate → caminho **A**: ensaio primeiro, produção depois.
--
-- =============================================================================
-- ORDEM DE ROLLBACK — o inverso do apply, e ANTES do rollback da 0133
-- =============================================================================
-- ⚠ ESCRITO EM PROSA, DE PROPÓSITO — e a razão é uma armadilha medida nesta própria fase.
-- \`scripts/db/corpo-vigente.mjs\` resolve o corpo VIVO de uma função varrendo as migrations
-- da maior para a menor, e ele TIRA OS COMENTÁRIOS antes de procurar. Um \`create or replace
-- function public.rel_estoque_asof(...)\` escrito aqui como comentário vira, para ele, uma
-- definição de verdade — e como a linha não fecha com \`;\`, o scanner engole o corpo REAL
-- logo abaixo. Medido: com a receita em pseudo-SQL, \`corpoVigente('rel_estoque_asof(smallint,
-- date)')\` devolvia 76 linhas começando pelo comentário. Isso quebraria as mutações desta
-- mesma fase, que partem de \`corpoVigente\`. Receita de rollback se DESCREVE; não se cola.
--
--   1) reemitir a função \`public.rel_estoque_asof(smallint, date)\` com o corpo da \`0110\`
--   2) reemitir a função de gatilho \`public.aplicar_movimentacao()\` com o corpo da \`0110\`
--   3) reemitir a view \`public.v_conflitos_filiais\` com o corpo da \`0096\`
--   4) notify pgrst, 'reload schema';
-- ⚠ Só DEPOIS disso é que a 0133 pode ser revertida: os corpos acima citam \`ordem\`, e um
--   \`drop column ordem cascade\` com a 0134 ainda no ar levaria as funções junto.
`

const RODAPE = `notify pgrst, 'reload schema';

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) nenhuma das três ficou com overload (assinatura idêntica → create or replace puro):
--   select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('rel_estoque_asof','aplicar_movimentacao');
--   -- esperado: EXATAMENTE 2 linhas
--
--   -- 2) o desempate novo está no ar, e o velho saiu:
--   select p.proname,
--          pg_get_functiondef(p.oid) like '%e.data desc, e.ordem desc%'      as tem_regua_nova,
--          pg_get_functiondef(p.oid) like '%(m.created_at, m.id)%'           as tem_regua_velha
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('rel_estoque_asof','aplicar_movimentacao');
--
--   -- 3) as 12 datas de amostra: o conjunto tem de bater com o capturado ANTES do apply
--   --    (docs/f53-evidencias/asof-12datas-ANTES-*.json), por HASH do conjunto ordenado.
--
--   -- 4) a trava do estorno segue recusando a penúltima — supabase/tests/asof_desempate.sql
--   --    (rótulos 4a e 4b). Rode TODOS os roteiros: esta migration mexe em função E em trigger.
`
writeFileSync(
  DESTINO,
  [
    CABECALHO,
    '-- ---------------------------------------------------------------------------',
    '-- 1) rel_estoque_asof — `data desc, ordem desc` no lugar da quádrupla',
    '-- ---------------------------------------------------------------------------',
    asofNovo,
    '',
    '-- ---------------------------------------------------------------------------',
    '-- 2) aplicar_movimentacao — a trava do estorno passa a (created_at, ordem)',
    '-- ---------------------------------------------------------------------------',
    aplicarNovo,
    '',
    '-- ---------------------------------------------------------------------------',
    '-- 3) v_conflitos_filiais — a única régua sem desempate ganha um',
    '-- ---------------------------------------------------------------------------',
    viewNovo,
    '',
    RODAPE,
  ].join('\n'),
  'utf8',
)
console.log('\ngravado: ' + DESTINO)

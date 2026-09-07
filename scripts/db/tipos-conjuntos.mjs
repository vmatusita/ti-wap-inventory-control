// =============================================================================
// tipos-conjuntos.mjs — as PEÇAS PURAS do gate de deriva de tipos (F47)
// =============================================================================
// O motor (`scripts/db/diff-tipos.mjs`) fala com o Postgres; este módulo não fala
// com nada. A separação existe para que a parte que decide REPROVAR ou NÃO seja
// testável na mesa, sem banco (`scripts/db/diff-tipos.test.mts`) — a mesa do
// Johnny não tem Postgres, e um gate cuja lógica só se prova no CI custa um push
// por calibragem.
//
// -----------------------------------------------------------------------------
// POR QUE LER O `database.ts` PELO COMPILADOR, E NÃO POR REGEX
// -----------------------------------------------------------------------------
// Medido antes de escolher (06/09/2026): uma extração por regex de linha
// (`/^ +([a-z_]+): \{/`) devolve 54 funções em vez de 59, porque o gerador emite
// algumas entradas em UMA linha só (`apagar_usuario: { Args: { p_alvo: string };
// Returns: undefined }`) e a regex de bloco não as vê. Um gate que perde 5 nomes
// do lado do REPOSITÓRIO acusaria deriva que não existe — a morte anunciada dele.
// O `typescript` já é dependência do projeto (5.9.3, `devDependencies`), então
// usar o parser de verdade não custa dependência nenhuma (regra 3 do CLAUDE.md).
//
// -----------------------------------------------------------------------------
// A DIREÇÃO DA COMPARAÇÃO — E POR QUE ELA É ASSIMÉTRICA DE PROPÓSITO
// -----------------------------------------------------------------------------
// Reprova SÓ quando o BANCO tem o que o REPOSITÓRIO não tem. A direção contrária
// (repositório com mais do que o banco) é LEGÍTIMA e tem três motivos registrados:
//
//   1. `__InternalSupabase.PostgrestVersion` vem do SERVIDOR PostgREST, não do
//      catálogo do Postgres — nenhum banco "tem" essa chave.
//   2. O `database.ts` tem hand-fixes deliberados de nulabilidade (atas de
//      14/07/2026 e 31/08/2026 em `docs/DECISOES.md`): a CLI 2.109.1 é a versão
//      FIXADA justamente porque a 2.110.0 regride a nulabilidade dos parâmetros
//      das sete RPCs `rel_*`.
//   3. O arquivo é gerado de PRODUÇÃO, e produção tem objeto que nenhuma migration
//      cria — foi o caso de `_bkp_relatorios_gerados_f6a` até a migration 0128
//      desta fase adotá-la.
//
// Um passo de CI que falha por motivo legítimo é desabilitado na terceira vez. Por
// isso a assimetria não é frouxidão: é o que mantém o gate vivo.
// =============================================================================

import ts from 'typescript'

/**
 * @typedef {object} ConjuntosDeTipos
 * @property {Set<string>} relacoes   nomes de tabela e de view
 * @property {Set<string>} colunas    `relacao.coluna`
 * @property {Set<string>} funcoes    nomes de função (sem assinatura)
 */

/** Membros de um type literal, só as propriedades. */
function membros(tipo) {
  return tipo && ts.isTypeLiteralNode(tipo) ? tipo.members.filter(ts.isPropertySignature) : []
}

/** O nome de uma propriedade — identificador ou string literal. */
function nomeDaPropriedade(m) {
  const n = m.name
  if (ts.isIdentifier(n)) return n.text
  if (ts.isStringLiteral(n)) return n.text
  return String(n.getText?.() ?? '')
}

/**
 * Os conjuntos que o `src/lib/types/database.ts` declara para o schema `public`.
 *
 * As COLUNAS saem da união de `Row`, `Insert` e `Update`. União, e não só `Row`,
 * porque o que se afirma aqui é "o arquivo CONHECE esta coluna" — e conhecer por
 * qualquer um dos três já basta para o app compilar contra ela. Ficar só em `Row`
 * criaria reprovação por forma do gerador, não por deriva.
 *
 * @param {string} texto conteúdo do `database.ts`
 * @returns {ConjuntosDeTipos}
 */
export function conjuntosDoArquivoDeTipos(texto) {
  const arquivo = ts.createSourceFile('database.ts', texto, ts.ScriptTarget.Latest, true)

  const relacoes = new Set()
  const colunas = new Set()
  const funcoes = new Set()

  let achouDatabase = false
  let achouPublic = false

  const visitar = (no) => {
    if (ts.isTypeAliasDeclaration(no) && no.name.text === 'Database') {
      achouDatabase = true
      for (const esquema of membros(no.type)) {
        if (nomeDaPropriedade(esquema) !== 'public') continue
        achouPublic = true
        for (const secao of membros(esquema.type)) {
          const qual = nomeDaPropriedade(secao)
          if (qual === 'Tables' || qual === 'Views') {
            for (const rel of membros(secao.type)) {
              const nomeRel = nomeDaPropriedade(rel)
              relacoes.add(nomeRel)
              for (const bloco of membros(rel.type)) {
                const qualBloco = nomeDaPropriedade(bloco)
                if (qualBloco !== 'Row' && qualBloco !== 'Insert' && qualBloco !== 'Update') continue
                for (const col of membros(bloco.type)) {
                  colunas.add(`${nomeRel}.${nomeDaPropriedade(col)}`)
                }
              }
            }
          } else if (qual === 'Functions') {
            for (const fn of membros(secao.type)) funcoes.add(nomeDaPropriedade(fn))
          }
        }
      }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(arquivo)

  // ⚠ GUARDA DO PRÓPRIO PARSER. Um `database.ts` cuja forma mude (outro gerador, outra
  // versão da CLI) faria os conjuntos virem VAZIOS — e conjunto vazio do lado do
  // repositório reprovaria TUDO, o que se lê como "o gate está quebrado" só depois de
  // alguém abrir o log. Falhar aqui, nomeando a causa, é mais barato.
  if (!achouDatabase) {
    throw new Error(
      'diff-tipos: não achei `export type Database` no database.ts — o formato do gerador mudou.',
    )
  }
  if (!achouPublic) {
    throw new Error('diff-tipos: o `Database` não tem o esquema `public` — formato inesperado.')
  }

  return { relacoes, colunas, funcoes }
}

/**
 * @typedef {object} Deriva
 * @property {string[]} relacoes  relações que o banco tem e o arquivo não
 * @property {string[]} colunas   colunas idem (só das relações que o arquivo CONHECE)
 * @property {string[]} funcoes   funções idem
 * @property {boolean}  derivou   true se qualquer uma das listas não está vazia
 */

/**
 * A comparação, numa direção só: o que o BANCO tem e o REPOSITÓRIO não tem.
 *
 * Coluna de relação DESCONHECIDA não entra na lista de colunas — ela já é contada
 * uma vez, na lista de relações. Repetir cada coluna de uma tabela nova encheria a
 * mensagem de ruído e escondia o achado (uma tabela nova de 20 colunas viraria 21
 * linhas dizendo a mesma coisa).
 *
 * @param {ConjuntosDeTipos} banco
 * @param {ConjuntosDeTipos} repo
 * @returns {Deriva}
 */
export function compararConjuntos(banco, repo) {
  const relacoes = [...banco.relacoes].filter((r) => !repo.relacoes.has(r)).sort()
  const novas = new Set(relacoes)
  const colunas = [...banco.colunas]
    .filter((c) => !repo.colunas.has(c) && !novas.has(c.slice(0, c.indexOf('.'))))
    .sort()
  const funcoes = [...banco.funcoes].filter((f) => !repo.funcoes.has(f)).sort()
  return {
    relacoes,
    colunas,
    funcoes,
    derivou: relacoes.length > 0 || colunas.length > 0 || funcoes.length > 0,
  }
}

/**
 * A mensagem de reprovação — ela NOMEIA o que falta e diz o que fazer.
 *
 * Um gate que diz só "os tipos derivaram" empurra quem lê para reger o arquivo no
 * escuro. Aqui sai `tabela.coluna` e `função`, com o comando que resolve.
 *
 * @param {Deriva} deriva
 * @returns {string}
 */
export function mensagemDeDeriva(deriva) {
  const linhas = [
    'O BANCO tem objeto que `src/lib/types/database.ts` NÃO conhece — o arquivo está velho.',
    '',
  ]
  if (deriva.relacoes.length > 0) {
    linhas.push(`tabelas/views ausentes no database.ts (${deriva.relacoes.length}):`)
    for (const r of deriva.relacoes) linhas.push(`  · ${r}`)
  }
  if (deriva.colunas.length > 0) {
    linhas.push(`colunas ausentes no database.ts (${deriva.colunas.length}):`)
    for (const c of deriva.colunas) linhas.push(`  · ${c}`)
  }
  if (deriva.funcoes.length > 0) {
    linhas.push(`funções ausentes no database.ts (${deriva.funcoes.length}):`)
    for (const f of deriva.funcoes) linhas.push(`  · ${f}`)
  }
  linhas.push(
    '',
    'Como resolver: rode `npm run db:types` (ele lê DB_TYPES_PROJECT_REF e SUPABASE_ACCESS_TOKEN)',
    'e comite o `src/lib/types/database.ts` regerado, no mesmo commit da migration.',
  )
  return linhas.join('\n')
}

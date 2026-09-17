#!/usr/bin/env -S npx tsx
// O PORTÃO (a) DA F61 — o diff de classes por ARQUIVO DE FONTE bate,
// multiconjunto a multiconjunto, com a TABELA DE MUDANÇAS DE PROPÓSITO
// (`docs/f61-evidencias/mudancas-de-proposito.json`).
//
// ============================================================================
// POR QUE ISTO EXISTE
// ============================================================================
// A F61 promete "sem mudar um pixel fora da tabela de mudanças de propósito".
// Uma promessa dessas só vale alguma coisa se houver um PORTÃO que a cobre: para
// cada `className` que sumiu ou nasceu num arquivo de `src/`, ou existe uma
// linha na tabela dizendo QUAL troca é essa, se ela é visível e QUAL vitrine a
// prova — ou o portão reprova. "Rodar o teste sem os dois prefixos é a primeira
// entrega" (Frente B) é a régua VERMELHA; este script é o portão que fecha o
// círculo na Frente G: garante que TODA troca de classe teve dono.
//
// A EXTRAÇÃO usa as MESMAS funções que `src/lib/layout/consistencia.test.ts`
// já usa em produção (`classes`, `ehStringDeClasse` de `regua-de-classes.ts`,
// `semComentarios` de `texto-fonte.ts`) — nunca uma cópia. Duas réguas que
// deviam ser uma já divergiram em silêncio nesta casa (ver o cabeçalho de
// `regua-de-classes.ts`); este script não repete o erro.
//
// ============================================================================
// A HEURÍSTICA DE "NÃO É CLASSE" — import/export-from e diretivas
// ============================================================================
// `classes()` devolve TODA string entre aspas — inclusive o `'@/components/x'`
// de um `import`, que `ehStringDeClasse` aprova de bom grado (tem barra, tem
// hífen). Path de módulo não é classe. Este script descarta uma ocorrência
// quando a LINHA (do texto já sem comentários) é:
//   · uma diretiva isolada (`'use client'`/`'use server'`, com ou sem `;`);
//   · começa com `import`;
//   · começa com `export` e contém `from`;
//   · é o FECHO de um import/export multilinha (`} from '...'` ou
//     `from '...'` sozinho na linha) — o caso comum de import com várias
//     chaves, uma por linha.
// Não é um parser de JS completo — é a mesma bala de prata pragmática de
// `regua-de-classes.ts`: "mais grosseiro que um parser de verdade, e de
// propósito".
//
// ============================================================================
// USO
// ============================================================================
//   npx tsx scripts/design/diff-classes-f61.ts
//     [--ref <ref>]              padrão: v1.65.0
//     [--tabela <caminho>]       padrão: docs/f61-evidencias/mudancas-de-proposito.json
//                                (ausente = tabela vazia, não erro)
//     [--esqueleto]              imprime, em JSON, linhas-esqueleto para as
//                                diferenças sem linha (id/arquivo prontos;
//                                efeitoVisivel/vitrine/motivo em branco)
//     [--markdown]               imprime a TABELA carregada em Markdown
//     [--sabotar "<arquivo>::<classe velha>::<classe nova>"]
//                                troca a PRIMEIRA ocorrência da string, EM
//                                MEMÓRIA, no texto ATUAL do arquivo — para
//                                provar que o portão acusa (sabotagem K)
//
// Sai com código 1 se houver "diferença sem linha" ou "linha sem diferença".

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { classes, ehStringDeClasse } from '@/lib/layout/regua-de-classes'
import { semComentarios } from '@/lib/layout/texto-fonte'

const RAIZ = resolve(__dirname, '..', '..')

// ---------------------------------------------------------------------------
// 1 · Argumentos
// ---------------------------------------------------------------------------

function argumento(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`)

const REF = argumento('ref', 'v1.65.0')
const CAMINHO_TABELA = argumento('tabela', 'docs/f61-evidencias/mudancas-de-proposito.json')
const MODO_ESQUELETO = temFlag('esqueleto')
const MODO_MARKDOWN = temFlag('markdown')
const SABOTAGEM = temFlag('sabotar') ? argumento('sabotar', '') : null

type Sabotagem = { arquivo: string; classeVelha: string; classeNova: string }
function parseSabotagem(spec: string): Sabotagem {
  const partes = spec.split('::')
  if (partes.length !== 3) {
    throw new Error(`--sabotar espera "<arquivo>::<classe velha>::<classe nova>", recebeu "${spec}"`)
  }
  const [arquivo, classeVelha, classeNova] = partes
  return { arquivo, classeVelha, classeNova }
}
const sabotagem = SABOTAGEM ? parseSabotagem(SABOTAGEM) : null

// ---------------------------------------------------------------------------
// 2 · A tabela de mudanças de propósito
// ---------------------------------------------------------------------------

type LinhaMudanca = {
  id: string
  arquivo: string
  antes: string | null
  depois: string | null
  n: number
  efeitoVisivel: 'sim' | 'não'
  vitrine: string
  motivo: string
  frente: 'B' | 'C' | 'D' | 'E'
}

function carregarTabela(caminho: string): LinhaMudanca[] {
  const absoluto = resolve(RAIZ, caminho)
  if (!existsSync(absoluto)) return []
  const bruto = JSON.parse(readFileSync(absoluto, 'utf8'))
  if (!Array.isArray(bruto)) {
    throw new Error(`${caminho} não é uma lista — o formato é um array de linhas`)
  }
  return bruto as LinhaMudanca[]
}
const tabela = carregarTabela(CAMINHO_TABELA)

// ---------------------------------------------------------------------------
// 3 · git — quem mudou, entre <ref> e a árvore de trabalho
// ---------------------------------------------------------------------------

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' })
}

/** Conteúdo de `caminho` em `ref` — string vazia se o arquivo não existia lá. */
function conteudoNoRef(ref: string, caminho: string): string {
  try {
    return execFileSync('git', ['show', `${ref}:${caminho}`], {
      cwd: RAIZ,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

/** Conteúdo de `caminho` na árvore de trabalho — string vazia se foi apagado. */
function conteudoNaArvore(caminho: string): string {
  const absoluto = resolve(RAIZ, caminho)
  if (!existsSync(absoluto)) return ''
  return readFileSync(absoluto, 'utf8')
}

type ArquivoMudado = { antesPath: string | null; depoisPath: string | null }

/**
 * `git diff --name-status <ref> -- src` (tracked, inclusive não commitado) +
 * `git ls-files --others --exclude-standard src` (arquivo NOVO, ainda sem
 * `git add`) — os dois lados de "difere entre o ref e a árvore de trabalho"
 * que a ordem pede. Um arquivo só pelo segundo comando é sempre "novo"
 * (antes vazio); o primeiro cobre A/M/D e renomeação (R###, duas colunas de
 * caminho) e cópia (C###, idem).
 */
function arquivosMudados(ref: string): Map<string, ArquivoMudado> {
  const mapa = new Map<string, ArquivoMudado>()

  const nameStatus = git(['diff', '--name-status', ref, '--', 'src']).trim()
  if (nameStatus) {
    for (const linha of nameStatus.split('\n')) {
      const campos = linha.split('\t')
      const status = campos[0]
      if (status.startsWith('R') || status.startsWith('C')) {
        const [, de, para] = campos
        mapa.set(para, { antesPath: de, depoisPath: para })
      } else if (status === 'A') {
        mapa.set(campos[1], { antesPath: null, depoisPath: campos[1] })
      } else if (status === 'D') {
        mapa.set(campos[1], { antesPath: campos[1], depoisPath: null })
      } else {
        // 'M' e variantes com sufixo de score que não se aplicam aqui.
        mapa.set(campos[1], { antesPath: campos[1], depoisPath: campos[1] })
      }
    }
  }

  const naoRastreados = git(['ls-files', '--others', '--exclude-standard', 'src']).trim()
  if (naoRastreados) {
    for (const caminho of naoRastreados.split('\n')) {
      if (!caminho) continue
      mapa.set(caminho, { antesPath: null, depoisPath: caminho })
    }
  }

  return mapa
}

const SO_TS_TSX = /\.(ts|tsx)$/
const E_TESTE = /\.test\.(ts|tsx)$/

function elegivel(caminho: string): boolean {
  return SO_TS_TSX.test(caminho) && !E_TESTE.test(caminho)
}

// ---------------------------------------------------------------------------
// 4 · O que NÃO é classe — import/export-from e diretivas (ver cabeçalho §2)
// ---------------------------------------------------------------------------

function linhaEhImportOuDiretiva(linha: string): boolean {
  const t = linha.trim()
  if (t === '') return false
  if (/^['"]use (client|server)['"];?$/.test(t)) return true
  if (/^import\b/.test(t)) return true
  if (/^export\s+.*\bfrom\b/.test(t)) return true
  // Fecho de import/export MULTILINHA: `} from '...'` ou `from '...'` sozinho.
  if (/^\}?\s*from\s*['"][^'"]*['"]\s*;?$/.test(t)) return true
  return false
}

/** `valor → quantas vezes`, junto com a LISTA de linhas de cada ocorrência (na
 *  ordem em que aparecem) — a lista alimenta o `--esqueleto` (pareamento por
 *  linha). */
type Multiconjunto = { contagem: Map<string, number>; linhasPorValor: Map<string, number[]> }

function extrairClasses(textoOriginal: string): Multiconjunto {
  const semComentario = semComentarios(textoOriginal)
  const linhas = semComentario.split('\n')
  const contagem = new Map<string, number>()
  const linhasPorValor = new Map<string, number[]>()
  for (const achado of classes(semComentario)) {
    if (!ehStringDeClasse(achado.valor)) continue
    const textoDaLinha = linhas[achado.linha - 1] ?? ''
    if (linhaEhImportOuDiretiva(textoDaLinha)) continue
    contagem.set(achado.valor, (contagem.get(achado.valor) ?? 0) + 1)
    const lista = linhasPorValor.get(achado.valor) ?? []
    lista.push(achado.linha)
    linhasPorValor.set(achado.valor, lista)
  }
  return { contagem, linhasPorValor }
}

// ---------------------------------------------------------------------------
// 5 · O conjunto de arquivos a processar
// ---------------------------------------------------------------------------

const mudados = arquivosMudados(REF)

// A sabotagem alcança um arquivo mesmo que ele NÃO tenha mudado de verdade —
// é o ponto dela: provar que o portão vê uma troca que não está na tabela,
// não só as trocas que já existiam.
if (sabotagem && !mudados.has(sabotagem.arquivo)) {
  mudados.set(sabotagem.arquivo, { antesPath: sabotagem.arquivo, depoisPath: sabotagem.arquivo })
}

type DiferencaSemLinha = { arquivo: string; sinal: '+' | '-'; valor: string; contagem: number }
type LinhaSemDiferenca = { id: string; arquivo: string }

const diferencasSemLinha: DiferencaSemLinha[] = []
const linhasSemDiferencaVistas = new Map<string, LinhaSemDiferenca>()
/** As linhas-esqueleto do `--esqueleto`, já pareadas por arquivo (ver §5). */
const esqueletoEntradas: {
  arquivo: string
  antes: string | null
  depois: string | null
}[] = []

for (const [arquivo, { antesPath, depoisPath }] of mudados) {
  if (!elegivel(arquivo)) continue

  const textoAntes = antesPath ? conteudoNoRef(REF, antesPath) : ''
  let textoDepois = depoisPath ? conteudoNaArvore(depoisPath) : ''

  if (sabotagem && depoisPath === sabotagem.arquivo) {
    const i = textoDepois.indexOf(sabotagem.classeVelha)
    if (i === -1) {
      console.warn(
        `⚠ --sabotar: "${sabotagem.classeVelha}" não foi encontrada em ${sabotagem.arquivo} — nada trocado.`,
      )
    } else {
      textoDepois =
        textoDepois.slice(0, i) + sabotagem.classeNova + textoDepois.slice(i + sabotagem.classeVelha.length)
    }
  }

  const { contagem: antesCont, linhasPorValor: antesLinhas } = extrairClasses(textoAntes)
  const { contagem: depoisCont, linhasPorValor: depoisLinhas } = extrairClasses(textoDepois)

  // ⚠ O QUE REALMENTE MUDOU — a diferença de MULTICONJUNTO, não a contagem
  // crua de cada lado. Uma classe presente 3× no antes E 3× no depois não
  // mudou nada; comparar `antesCont`/`depoisCont` direto contra a tabela (sem
  // subtrair um do outro primeiro) acusaria as 3 ocorrências como removidas E
  // as 3 como adicionadas, mesmo sem diferença nenhuma — foi exatamente o que
  // a sabotagem de `tabela-saidas.tsx` pegou na bancada: TODA classe do
  // arquivo aparecia como "removida" e "adicionada", não só as duas da
  // sabotagem. "Removidas = antes − depois; adicionadas = depois − antes",
  // como a ordem pede.
  const removidoReal = new Map<string, number>()
  const adicionadoReal = new Map<string, number>()
  for (const chave of new Set([...antesCont.keys(), ...depoisCont.keys()])) {
    const a = antesCont.get(chave) ?? 0
    const d = depoisCont.get(chave) ?? 0
    if (a > d) removidoReal.set(chave, a - d)
    else if (d > a) adicionadoReal.set(chave, d - a)
  }

  const linhasDaTabela = tabela.filter((l) => l.arquivo === arquivo)
  const esperadoRemovidas = new Map<string, { n: number; ids: string[] }>()
  const esperadoAdicionadas = new Map<string, { n: number; ids: string[] }>()
  for (const l of linhasDaTabela) {
    if (l.antes !== null) {
      const atual = esperadoRemovidas.get(l.antes) ?? { n: 0, ids: [] }
      atual.n += l.n
      atual.ids.push(l.id)
      esperadoRemovidas.set(l.antes, atual)
    }
    if (l.depois !== null) {
      const atual = esperadoAdicionadas.get(l.depois) ?? { n: 0, ids: [] }
      atual.n += l.n
      atual.ids.push(l.id)
      esperadoAdicionadas.set(l.depois, atual)
    }
  }

  // As ocorrências EXCEDENTES deste arquivo — as que a tabela ainda não
  // credita — cada uma com a linha onde apareceu. Alimentam só o `--esqueleto`
  // (o portão em si só precisa da CONTAGEM, calculada logo abaixo).
  const removidosExcedentes: { valor: string; linha: number }[] = []
  const adicionadosExcedentes: { valor: string; linha: number }[] = []

  function conferirLado(
    sinal: '+' | '-',
    real: Map<string, number>,
    esperado: Map<string, { n: number; ids: string[] }>,
    linhasPorValor: Map<string, number[]>,
    excedentes: { valor: string; linha: number }[],
  ) {
    const chaves = new Set([...real.keys(), ...esperado.keys()])
    for (const chave of chaves) {
      const r = real.get(chave) ?? 0
      const e = esperado.get(chave)
      const eN = e?.n ?? 0
      if (r > eN) {
        diferencasSemLinha.push({ arquivo, sinal, valor: chave, contagem: r - eN })
        if (MODO_ESQUELETO) {
          // As últimas `r - eN` ocorrências da lista — não importa QUAIS,
          // "excedente" é uma contagem, não uma identidade; qualquer
          // sub-lista de tamanho certo serve de referência de linha.
          for (const linha of (linhasPorValor.get(chave) ?? []).slice(eN, r)) {
            excedentes.push({ valor: chave, linha })
          }
        }
      } else if (eN > r && e) {
        for (const id of e.ids) linhasSemDiferencaVistas.set(id, { id, arquivo })
      }
    }
  }
  conferirLado('-', removidoReal, esperadoRemovidas, antesLinhas, removidosExcedentes)
  conferirLado('+', adicionadoReal, esperadoAdicionadas, depoisLinhas, adicionadosExcedentes)

  if (MODO_ESQUELETO) {
    // Pareia removida/adicionada da MESMA LINHA de código deste arquivo — o
    // caso comum de trocar a classe de um `className` sem mover a linha. Sem
    // par na mesma linha, cada uma sai sozinha (efeito visível/vitrine/motivo
    // ficam para quem preencher a tabela de verdade).
    const adicionadosPorLinha = new Map<number, number>() // linha -> índice em adicionadosExcedentes ainda livre
    adicionadosExcedentes.forEach((a, i) => adicionadosPorLinha.set(a.linha, i))
    const usadosAdicionados = new Set<number>()
    for (const removido of removidosExcedentes) {
      const idx = adicionadosPorLinha.get(removido.linha)
      if (idx !== undefined && !usadosAdicionados.has(idx)) {
        usadosAdicionados.add(idx)
        esqueletoEntradas.push({ arquivo, antes: removido.valor, depois: adicionadosExcedentes[idx].valor })
      } else {
        esqueletoEntradas.push({ arquivo, antes: removido.valor, depois: null })
      }
    }
    adicionadosExcedentes.forEach((a, i) => {
      if (!usadosAdicionados.has(i)) esqueletoEntradas.push({ arquivo, antes: null, depois: a.valor })
    })
  }
}

// ---------------------------------------------------------------------------
// 6 · Saída
// ---------------------------------------------------------------------------

const linhasSemDiferenca = [...linhasSemDiferencaVistas.values()]

if (MODO_MARKDOWN) {
  const cols = ['id', 'arquivo', 'antes', 'depois', 'n', 'efeitoVisivel', 'vitrine', 'frente', 'motivo']
  console.log(`| ${cols.join(' | ')} |`)
  console.log(`| ${cols.map(() => '---').join(' | ')} |`)
  for (const l of tabela) {
    const esc = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
    console.log(
      `| ${esc(l.id)} | ${esc(l.arquivo)} | ${esc(l.antes)} | ${esc(l.depois)} | ${esc(l.n)} | ${esc(l.efeitoVisivel)} | ${esc(l.vitrine)} | ${esc(l.frente)} | ${esc(l.motivo)} |`,
    )
  }
}

if (MODO_ESQUELETO) {
  // `esqueletoEntradas` já saiu pareada por arquivo+linha do laço principal
  // (§5) — aqui só falta numerar e completar os campos que só um humano
  // preenche (efeitoVisivel/vitrine/motivo/frente).
  const esqueleto = esqueletoEntradas.map((e, i) => ({
    id: `M${String(i + 1).padStart(3, '0')}`,
    arquivo: e.arquivo,
    antes: e.antes,
    depois: e.depois,
    n: 1,
    efeitoVisivel: '',
    vitrine: '',
    motivo: '',
    frente: '',
  }))
  console.log(JSON.stringify(esqueleto, null, 2))
}

if (!MODO_MARKDOWN && !MODO_ESQUELETO) {
  console.log(`ref: ${REF} · tabela: ${tabela.length} linha(s) em ${CAMINHO_TABELA}`)
  if (sabotagem) {
    console.log(
      `⚠ --sabotar ativo: ${sabotagem.arquivo} :: "${sabotagem.classeVelha}" → "${sabotagem.classeNova}"`,
    )
  }
  if (diferencasSemLinha.length === 0 && linhasSemDiferenca.length === 0) {
    console.log('✔ nenhuma diferença sem linha, nenhuma linha sem diferença.')
  } else {
    if (diferencasSemLinha.length > 0) {
      console.log(`\nDiferença sem linha (${diferencasSemLinha.length}):`)
      for (const d of diferencasSemLinha) {
        console.log(`  ${d.sinal} ${d.arquivo} × ${d.contagem}  "${d.valor}"`)
      }
    }
    if (linhasSemDiferenca.length > 0) {
      console.log(`\nLinha sem diferença (${linhasSemDiferenca.length}):`)
      for (const l of linhasSemDiferenca) {
        console.log(`  ${l.id}  ${l.arquivo}`)
      }
    }
  }
}

const reprova = diferencasSemLinha.length > 0 || linhasSemDiferenca.length > 0
process.exit(reprova ? 1 : 0)

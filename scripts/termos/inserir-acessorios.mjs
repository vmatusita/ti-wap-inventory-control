// Insere a SEÇÃO DE ACESSÓRIOS nos 5 modelos de termo de responsabilidade
// (F39 · §A — decisões D9/D10 do docs/PLAN-F36-F39.md).
//
// POR QUE UM SCRIPT, e não uma edição manual no Word: é a mesma razão do
// `retaguear-cidade.mjs` (F25), e ela não mudou. Reabrir e salvar no Word (ou no
// LibreOffice) reescreve o pacote inteiro — ordem das partes, `rels`, revisão do
// editor — e nenhuma inspeção prova depois que só a seção nova mudou. Aqui a
// transformação é uma INSERÇÃO de texto dentro de `word/document.xml`, e o próprio
// script prova o resto: toda outra parte do pacote sai byte a byte igual, o XML
// anterior é reconstituível a partir do novo, a contagem de parágrafos cresce
// exatamente 3, e a cláusula de foro e a linha da assinatura são contadas antes e
// depois.
//
// A DIFERENÇA PARA A F25: lá se SUBSTITUÍA uma substring; aqui se INSERE parágrafo.
// A prova 2 (round-trip) inverte de acordo — em vez de desfazer a substituição,
// remove-se o trecho inserido e compara-se com o original.
//
// ---------------------------------------------------------------------------
// A MARCAÇÃO, E POR QUE SÃO TRÊS PARÁGRAFOS
// ---------------------------------------------------------------------------
// O D10 exige que, não havendo periférico, o parágrafo INTEIRO suma do documento —
// não uma linha vazia pendurada, não um marcador de lista órfão. Isso é bloco
// condicional do docxtemplater com as tags de abertura e fechamento SOZINHAS, cada
// uma no seu próprio parágrafo, envolvendo o parágrafo da cláusula. A doc oficial
// (docxtemplater.com/docs/configuration, conferida em 29/08/2026) diz, sobre o
// `paragraphLoop: true` que `renderizarDocx` já usa: "if both the opening and
// closing loop tags are on separate paragraphs with no other content, the library
// treats the loop as a paragraph loop ... removing the original paragraphs
// containing the tags". A mesma página avisa que o recurso falha quando o parágrafo
// da tag tem espaço sobrando — por isso as tags entram sem `w:pPr` e sem espaço.
//
// Abrir e fechar DENTRO do mesmo parágrafo apagaria o texto e deixaria o parágrafo:
// exatamente o defeito que o D10 proíbe.
//
// ---------------------------------------------------------------------------
// O `w:pPr` DO PARÁGRAFO NOVO — a decisão da §A.3
// ---------------------------------------------------------------------------
// Nos 5 modelos o bloco de identificação é lista NUMERADA (medido: numId 2 no
// notebook, 1 no desktop/monitor-interno/celular, 36 com ilvl 1 no home office).
// Clonar o `w:pPr` do vizinho INTEIRO faria a cláusula virar mais um item numerado
// ao lado de "MARCA"/"MODELO" — e ela é frase, não campo da lista. Então clona-se o
// `w:pPr` do vizinho MENOS o `<w:numPr>`: some o número, ficam o estilo, o recuo do
// `pStyle` e o alinhamento. Sem `numPr` não há marcador órfão.
//
// O negrito do rótulo NÃO é inventado: `<w:b/><w:bCs/>` existe nos 5 modelos (é o
// que formata "Notebook"/"Celular", logo acima do bloco de identificação). Ele é
// inserido no `w:rPr` clonado logo depois do `<w:rFonts .../>`, que é a posição
// exigida pela ordem do schema CT_RPr.
//
// Uso:  node scripts/termos/inserir-acessorios.mjs           (confere, não grava)
//       node scripts/termos/inserir-acessorios.mjs --aplicar (grava)

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(pathToFileURL(path.join(process.cwd(), 'package.json')))
const PizZip = require('pizzip')

const DIR = path.join(process.cwd(), 'src', 'templates', 'termos')
const APLICAR = process.argv.includes('--aplicar')
const PARTE = 'word/document.xml'

// ⚠ ALLOWLIST NOMINAL, e ela é mais estrita que a do `retaguear-cidade.mjs` (que
// percorre a pasta inteira e filtra por conteúdo). A ordem F39 manda: os 2 modelos
// de DEVOLUÇÃO não são tocados — `{outros_componentes}` já existe neles desde a
// F5A, e preenchê-la é código, não arquivo. Qualquer outro `.docx` na pasta é
// recusado, e a âncora de cada um é a medida no próprio arquivo.
const MODELOS = [
  { arquivo: 'responsabilidade-notebook.docx', ancora: 'NÚMERO DO CHAMADO: {chamado}' },
  { arquivo: 'responsabilidade-desktop.docx', ancora: 'NÚMERO DO CHAMADO: {chamado}' },
  { arquivo: 'responsabilidade-monitor-interno.docx', ancora: 'NÚMERO DO CHAMADO: {chamado}' },
  { arquivo: 'responsabilidade-monitor-homeoffice.docx', ancora: 'Número do Chamado: {chamado}' },
  // ⚠ No celular o `{chamado}` EXISTE, mas não fecha o bloco: telefone, IMEI,
  // Pulsus e OBS vêm depois dele. A âncora é a última linha de identificação.
  { arquivo: 'responsabilidade-celular.docx', ancora: 'OBS: {obs}' },
]

// A cláusula APROVADA pelo Johnny em 29/08/2026 (§6.1 do plano). Não se reescreve,
// não se "melhora", não se traduz para outra voz.
const ROTULO = 'Acompanham o equipamento os seguintes acessórios e periféricos: '
const CAMPO = '{acessorios}'
const CONDICIONAL = 'tem_acessorios'

// A cláusula de FORO. ⚠ Conta-se ESTA substring, e não a frase inteira: medido nos
// 7 modelos, "Comarca de São José dos Pinhais" dá ZERO no XML cru, porque a frase
// está partida em runs ("Comarca de " termina um run e o nome da comarca começa
// outro, em negrito). "São José dos Pinhais/PR" é run único — é a mesma constante
// que o `retaguear-cidade.mjs` usa, e pelo mesmo motivo.
const FORO_XML = 'São José dos Pinhais/PR'
const FORO_TEXTO = 'Comarca de São José dos Pinhais/PR'
const ASSINATURA = '{cidade}, {data_extenso}'

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const sha12 = (b) => sha(b).slice(0, 12)

/** Todos os `<w:p>` do documento, na ordem, como strings cruas. */
function paragrafos(xml) {
  return xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? []
}

/** O texto visível de um `<w:p>`: os `<w:t>` concatenados, sem as tags. */
function textoDoParagrafo(p) {
  return (p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join('')
}

/** Decodifica as entidades XML que aparecem no texto dos modelos. */
function decodificar(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Escapa o que vai virar texto dentro de um `<w:t>`. */
function escapar(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const contar = (texto, agulha) => texto.split(agulha).length - 1

/**
 * O `w:pPr` do vizinho, sem o `<w:numPr>` — a decisão da §A.3.
 * Devolve `''` quando o vizinho não tem `w:pPr` nenhum.
 */
function pPrSemNumPr(paragrafo) {
  const m = paragrafo.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
  if (!m) return ''
  return m[0].replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '')
}

/** O `w:rPr` do PRIMEIRO run do vizinho — a formatação do texto, não da marca. */
function rPrDoRun(paragrafo) {
  const run = paragrafo.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/)
  if (!run) return ''
  const rPr = run[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)
  return rPr ? rPr[0] : ''
}

/**
 * O mesmo `w:rPr`, com `<w:b/><w:bCs/>` logo DEPOIS do `<w:rFonts .../>`.
 *
 * A posição não é estética: `CT_RPr` é uma sequência ordenada no schema
 * (rStyle, rFonts, b, bCs, i, ... , color, ... , sz), e negrito fora de ordem é
 * XML inválido. Sem `rFonts` no clone, entra logo após a abertura do `w:rPr`;
 * sem `w:rPr` nenhum, sai sem negrito — e essa escolha vira ata.
 */
function rPrComNegrito(rPr) {
  if (!rPr) return ''
  if (/<w:b\/>/.test(rPr)) return rPr
  const negrito = '<w:b/><w:bCs/>'
  if (/<w:rFonts\b[^>]*\/>/.test(rPr)) {
    return rPr.replace(/(<w:rFonts\b[^>]*\/>)/, `$1${negrito}`)
  }
  return rPr.replace('<w:rPr>', `<w:rPr>${negrito}`)
}

/** Descreve o `w:pPr` aplicado — a prova exigida pela §A.3. */
function descreverPPr(pPr) {
  if (!pPr) return 'nenhum (parágrafo sem w:pPr)'
  const pStyle = pPr.match(/<w:pStyle w:val="([^"]*)"/)?.[1]
  const jc = pPr.match(/<w:jc w:val="([^"]*)"/)?.[1]
  const ind = pPr.match(/<w:ind\b[^>]*\/>/)?.[0]
  const temNumPr = /<w:numPr>/.test(pPr)
  return [
    `pStyle=${pStyle ?? '—'}`,
    `numPr=${temNumPr ? 'PRESENTE (⚠)' : 'removido'}`,
    `ind=${ind ?? '—'}`,
    `jc=${jc ?? '—'}`,
  ].join(' · ')
}

let falhas = 0
let mudados = 0
let jaFeitos = 0

// A allowlist é nominal: um `.docx` que apareça na pasta e não esteja aqui não é
// tocado, e o script diz que o ignorou (não é falha — os 2 de devolução são
// legítimos e estão fora do escopo por determinação da ordem).
const nomesEsperados = new Set(MODELOS.map((m) => m.arquivo))
const naPasta = fs.readdirSync(DIR).filter((f) => f.endsWith('.docx')).sort()
for (const f of naPasta) {
  if (!nomesEsperados.has(f)) console.log(`· ${f}: fora dos 5 de responsabilidade — não tocado`)
}

for (const { arquivo, ancora } of MODELOS) {
  const caminho = path.join(DIR, arquivo)
  if (!fs.existsSync(caminho)) {
    console.error(`✗ ${arquivo}: modelo não encontrado em ${DIR}`)
    falhas++
    continue
  }

  const original = fs.readFileSync(caminho)
  const zipAntes = new PizZip(original)
  const xmlAntes = zipAntes.file(PARTE).asText()

  // Idempotência (comportamento copiado do `retaguear-cidade.mjs`): modelo já
  // tratado não é regravado.
  if (xmlAntes.includes(`{#${CONDICIONAL}}`)) {
    console.log(`· ${arquivo}: já inserido ({#${CONDICIONAL}}) — nada a fazer`)
    jaFeitos++
    continue
  }

  const psAntes = paragrafos(xmlAntes)
  const indices = psAntes
    .map((p, i) => (decodificar(textoDoParagrafo(p)) === ancora ? i : -1))
    .filter((i) => i >= 0)
  if (indices.length !== 1) {
    console.error(
      `✗ ${arquivo}: esperava 1 parágrafo com o texto "${ancora}", achei ${indices.length}`,
    )
    falhas++
    continue
  }
  const vizinho = psAntes[indices[0]]

  const pPr = pPrSemNumPr(vizinho)
  const rPr = rPrDoRun(vizinho)
  const rPrNegrito = rPrComNegrito(rPr)

  // Os TRÊS parágrafos. As tags condicionais entram sozinhas, sem `w:pPr` e sem
  // espaço: é essa forma que o `paragraphLoop` remove por inteiro.
  const inserido =
    `<w:p><w:r><w:t>{#${CONDICIONAL}}</w:t></w:r></w:p>` +
    `<w:p>${pPr}` +
    `<w:r>${rPrNegrito}<w:t xml:space="preserve">${escapar(ROTULO)}</w:t></w:r>` +
    `<w:r>${rPr}<w:t>${escapar(CAMPO)}</w:t></w:r>` +
    `</w:p>` +
    `<w:p><w:r><w:t>{/${CONDICIONAL}}</w:t></w:r></w:p>`

  // A inserção: logo DEPOIS do parágrafo âncora. Feita sobre a string do XML, na
  // posição exata em que aquele `<w:p>` termina — sem reserializar nada.
  const posAncora = xmlAntes.indexOf(vizinho)
  if (posAncora < 0 || xmlAntes.indexOf(vizinho, posAncora + 1) >= 0) {
    console.error(`✗ ${arquivo}: o parágrafo âncora não é único no XML cru — abortado`)
    falhas++
    continue
  }
  const corte = posAncora + vizinho.length
  const xmlDepois = xmlAntes.slice(0, corte) + inserido + xmlAntes.slice(corte)

  // ---- Prova 1 — foro e linha da assinatura intactos ----------------------
  const textoAntes = decodificar(psAntes.map(textoDoParagrafo).join('\n'))
  const psDepois = paragrafos(xmlDepois)
  const textoDepois = decodificar(psDepois.map(textoDoParagrafo).join('\n'))

  const foroXmlAntes = contar(xmlAntes, FORO_XML)
  const foroXmlDepois = contar(xmlDepois, FORO_XML)
  const foroTxtAntes = contar(textoAntes, FORO_TEXTO)
  const foroTxtDepois = contar(textoDepois, FORO_TEXTO)
  const assAntes = contar(xmlAntes, ASSINATURA)
  const assDepois = contar(xmlDepois, ASSINATURA)
  if (
    foroXmlAntes !== foroXmlDepois ||
    foroTxtAntes !== foroTxtDepois ||
    assAntes !== assDepois
  ) {
    console.error(
      `✗ ${arquivo}: foro ou linha da assinatura mudaram ` +
        `(foro xml ${foroXmlAntes}→${foroXmlDepois}, foro texto ${foroTxtAntes}→${foroTxtDepois}, ` +
        `assinatura ${assAntes}→${assDepois})`,
    )
    falhas++
    continue
  }
  if (foroXmlAntes !== 1 || foroTxtAntes !== 1 || assAntes !== 1) {
    console.error(
      `✗ ${arquivo}: esperava 1 foro e 1 linha de assinatura ` +
        `(achei foro xml ${foroXmlAntes}, foro texto ${foroTxtAntes}, assinatura ${assAntes})`,
    )
    falhas++
    continue
  }

  // ---- Prova 2 — o XML anterior é reconstituível --------------------------
  // A prova 2 da F25, invertida para inserção: removendo do XML novo exatamente o
  // trecho inserido, volta-se BYTE A BYTE ao original. Se algo mais tivesse
  // mudado, a volta não bateria.
  if (xmlDepois.replace(inserido, '') !== xmlAntes) {
    console.error(`✗ ${arquivo}: o XML mudou além da seção inserida`)
    falhas++
    continue
  }

  // ---- Prova 3 — a contagem de parágrafos cresce exatamente 3 -------------
  if (psDepois.length !== psAntes.length + 3) {
    console.error(
      `✗ ${arquivo}: esperava +3 <w:p>, achei ${psDepois.length - psAntes.length} ` +
        `(${psAntes.length} → ${psDepois.length})`,
    )
    falhas++
    continue
  }

  // ---- Prova 4 — o pacote, fora do document.xml, sai idêntico byte a byte --
  const zipDepois = new PizZip(original)
  zipDepois.file(PARTE, xmlDepois)
  const novo = zipDepois.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  const relido = new PizZip(novo)

  const partesAntes = Object.keys(zipAntes.files).sort()
  const partesDepois = Object.keys(relido.files).sort()
  if (partesAntes.join('|') !== partesDepois.join('|')) {
    console.error(`✗ ${arquivo}: o conjunto de partes do pacote mudou`)
    falhas++
    continue
  }
  const divergentes = []
  for (const parte of partesAntes) {
    if (zipAntes.files[parte].dir) continue
    const a = zipAntes.file(parte).asNodeBuffer()
    const b = relido.file(parte).asNodeBuffer()
    if (!a.equals(b)) divergentes.push(parte)
  }
  if (divergentes.join(',') !== PARTE) {
    console.error(
      `✗ ${arquivo}: partes divergentes = [${divergentes.join(', ')}] (esperado só ${PARTE})`,
    )
    falhas++
    continue
  }

  console.log(
    `✓ ${arquivo}\n` +
      `    <w:p> ${psAntes.length} → ${psDepois.length} (+3) | ` +
      `${partesAntes.length} partes, 1 divergente (${PARTE}) | XML anterior reconstituível\n` +
      `    foro intacto (xml ${foroXmlAntes}, texto ${foroTxtAntes}) | assinatura intacta (${assAntes})\n` +
      `    âncora: "${ancora}"\n` +
      `    w:pPr aplicado: ${descreverPPr(pPr)}\n` +
      `    w:rPr do rótulo: ${rPrNegrito || '(nenhum — sem negrito)'}\n` +
      `    w:rPr do campo:  ${rPr || '(nenhum)'}\n` +
      `    sha ${sha12(original)} → ${sha12(novo)}`,
  )
  mudados++
  if (APLICAR) fs.writeFileSync(caminho, novo)
}

console.log(
  `\n${APLICAR ? 'APLICADO' : 'CONFERÊNCIA (nada gravado)'} — ` +
    `${mudados} modelo(s) prontos, ${jaFeitos} já inserido(s), ${falhas} falha(s).`,
)
process.exit(falhas > 0 ? 1 : 0)

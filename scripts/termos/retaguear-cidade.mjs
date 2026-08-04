// Retag da CIDADE na linha da assinatura dos 7 modelos de termo (F25 · §3.1).
//
// POR QUE UM SCRIPT, e não uma edição manual no Word: o §6 item 1 do PLANO-TERMOS
// manda conferir fidelidade — e a única conferência que vale para um .docx é
// byte a byte. Reabrir os modelos no Word reescreveria o pacote inteiro (ordem de
// partes, rels, revisão do editor) e nenhuma inspeção provaria que só a linha da
// cidade mudou. Aqui a transformação é uma substituição de UMA substring dentro
// de word/document.xml, e o próprio script prova o resto: toda outra parte do
// pacote sai byte a byte igual, e a cláusula de FORO é contada antes e depois.
//
// A linha da assinatura é um run ÚNICO nos 7 modelos (medido) — por isso não há
// mesclagem de runs a fazer, que é a armadilha clássica do retag do Word.
//
// Uso:  node scripts/termos/retaguear-cidade.mjs           (confere, não grava)
//       node scripts/termos/retaguear-cidade.mjs --aplicar (grava)

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

// As duas grafias que os modelos usam hoje. O `, {data_extenso}` faz parte do
// alvo de propósito: é ele que distingue a linha da ASSINATURA da cláusula de
// FORO ("Comarca de São José dos Pinhais/PR"), que esta fase não pode tocar.
const VARIANTES = [
  'São José dos Pinhais, {data_extenso}', // responsabilidade (5)
  'São José Dos Pinhais, {data_extenso}', // devolução (2) — "Dos" maiúsculo
]
const DESTINO = '{cidade}, {data_extenso}'
const FORO = 'São José dos Pinhais/PR'

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12)

let falhas = 0
let mudados = 0

for (const arquivo of fs.readdirSync(DIR).filter((f) => f.endsWith('.docx')).sort()) {
  const caminho = path.join(DIR, arquivo)
  const original = fs.readFileSync(caminho)
  const zipAntes = new PizZip(original)
  const xmlAntes = zipAntes.file(PARTE).asText()

  const achadas = VARIANTES.filter((v) => xmlAntes.includes(v))
  if (achadas.length === 0) {
    if (xmlAntes.includes(DESTINO)) {
      console.log(`· ${arquivo}: já retagueado ({cidade}) — nada a fazer`)
      continue
    }
    console.error(`✗ ${arquivo}: linha da assinatura NÃO encontrada`)
    falhas++
    continue
  }
  if (achadas.length > 1) {
    console.error(`✗ ${arquivo}: mais de uma grafia da cidade — ambíguo, abortado`)
    falhas++
    continue
  }
  const alvo = achadas[0]
  const ocorrencias = xmlAntes.split(alvo).length - 1
  if (ocorrencias !== 1) {
    console.error(`✗ ${arquivo}: esperava 1 ocorrência de "${alvo}", achei ${ocorrencias}`)
    falhas++
    continue
  }

  const foroAntes = (xmlAntes.split(FORO).length - 1)
  const xmlDepois = xmlAntes.replace(alvo, DESTINO)
  const foroDepois = (xmlDepois.split(FORO).length - 1)

  // Prova 1 — a cláusula de foro não foi tocada.
  if (foroAntes !== foroDepois) {
    console.error(`✗ ${arquivo}: a cláusula de foro mudou (${foroAntes} → ${foroDepois})`)
    falhas++
    continue
  }

  // Prova 2 — a ÚNICA diferença no XML é o trecho esperado. Reconstrói o texto
  // anterior a partir do novo e compara com o original: se algo mais tivesse
  // mudado, a volta não bateria.
  if (xmlDepois.replace(DESTINO, alvo) !== xmlAntes) {
    console.error(`✗ ${arquivo}: o XML mudou além da linha da assinatura`)
    falhas++
    continue
  }

  // Prova 3 — o pacote inteiro, fora do document.xml, sai idêntico byte a byte.
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
  let divergentes = []
  for (const parte of partesAntes) {
    if (zipAntes.files[parte].dir) continue
    const a = zipAntes.file(parte).asNodeBuffer()
    const b = relido.file(parte).asNodeBuffer()
    if (!a.equals(b)) divergentes.push(parte)
  }
  if (divergentes.join(',') !== PARTE) {
    console.error(`✗ ${arquivo}: partes divergentes = [${divergentes.join(', ')}] (esperado só ${PARTE})`)
    falhas++
    continue
  }

  console.log(
    `✓ ${arquivo.padEnd(42)} "${alvo}" → "${DESTINO}" | foro intacto (${foroAntes}) | ` +
      `${partesAntes.length} partes, 1 divergente | sha ${sha(original)} → ${sha(novo)}`,
  )
  mudados++
  if (APLICAR) fs.writeFileSync(caminho, novo)
}

console.log(
  `\n${APLICAR ? 'APLICADO' : 'CONFERÊNCIA (nada gravado)'} — ${mudados} modelo(s) prontos, ${falhas} falha(s).`,
)
process.exit(falhas > 0 ? 1 : 0)

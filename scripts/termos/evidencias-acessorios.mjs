// O PACOTE DE EVIDÊNCIAS da F39 · §A.4 — os arquivos que o Johnny abre no Word
// para conferir a diagramação da cláusula nova.
//
// POR QUE ELE EXISTE: a prova mecânica do `inserir-acessorios.mjs` cobre o que dá
// para provar sem olhar — que só a seção nova mudou, byte a byte, e que um termo
// SEM acessório sai idêntico ao de hoje. O que ela NÃO cobre é a diagramação da
// cláusula QUANDO HÁ acessório: nenhuma inspeção de XML diz se a linha ficou bonita
// na página. Este pacote é o que substitui o aceite prévio — o Johnny audita quando
// quiser, e a fase não fica bloqueada esperando.
//
// ⚠ A REFERÊNCIA É O SHA DA BASELINE, NUNCA `HEAD`. Depois do commit dos `.docx`
// novos, `git show HEAD:...` devolve o arquivo NOVO e o par vira o arquivo comparado
// consigo mesmo — o critério 2 não provaria nada. Por isso o sha entra fixo aqui
// (medido na §V, antes de qualquer mudança) e pode ser trocado por argumento.
//
// ⚠ PAYLOAD 100% FICTÍCIO. Regra 2 do CLAUDE.md vale para evidência como vale para
// seed: nenhum nome de colaborador real, nenhum patrimônio real.
//
// PDF: só se houver conversor JÁ INSTALADO na máquina (custo R$ 0, stack fechada —
// nada é instalado para isto). Não havendo, ficam os `.docx`, e o relatório diz que
// a conferência visual é no Word.
//
// Uso:  node scripts/termos/evidencias-acessorios.mjs [sha-baseline]

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(pathToFileURL(path.join(process.cwd(), 'package.json')))
const PizZip = require('pizzip')
const Docxtemplater = require('docxtemplater')

// A baseline da fase: `git rev-parse HEAD` medido em 29/08/2026, antes de mudar
// qualquer coisa (§V do PLAN.md).
const SHA_BASELINE = process.argv[2] ?? 'd661c769cf99b1a59994e3eacab7981356b58a1d'

const DIR_MODELOS = path.join('src', 'templates', 'termos')
const SAIDA = path.join(process.cwd(), 'docs', 'f39-evidencias')
const PARTE = 'word/document.xml'

const MODELOS = [
  'responsabilidade-notebook.docx',
  'responsabilidade-desktop.docx',
  'responsabilidade-monitor-interno.docx',
  'responsabilidade-monitor-homeoffice.docx',
  'responsabilidade-celular.docx',
]

// Dados 100% fictícios — nenhum deles existe na WAP.
const PAYLOAD = {
  colaborador: 'Fulano de Tal',
  marca: 'Marca Fictícia',
  modelo: 'Modelo FIC-1234',
  service_tag: 'STFIC0001',
  patrimonio: 'WAP0001234',
  chamado: '999999',
  telefone: '(00) 00000-0000',
  imei: '000000000000000',
  pulsus: 'Sim',
  obs: 'Observação fictícia para conferência.',
  cidade: 'Cidade Fictícia',
  data_extenso: '29 de agosto de 2026',
  data_mes_ano: 'agosto de 2026',
}

const LINHA_ACESSORIOS = 'Fone de ouvido, Mouse (2), Teclado, Mochila'

const ps = (xml) => xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? []
const textoDoParagrafo = (p) =>
  (p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('')
const texto = (xml) => ps(xml).map(textoDoParagrafo).join('\n')
const sha12 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12)

function render(buffer, dados) {
  // As MESMAS opções de `renderizarDocx` (src/lib/actions/termos.ts) — evidência
  // gerada por um caminho diferente do de produção não prova nada.
  const doc = new Docxtemplater(new PizZip(buffer), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  })
  doc.render(dados)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function conversorDePdf() {
  for (const cmd of ['soffice', 'libreoffice', 'pandoc']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' })
      return cmd
    } catch {
      /* não instalado — segue */
    }
  }
  return null
}

for (const sub of ['baseline', 'novo-sem-acessorios', 'novo-com-acessorios']) {
  fs.mkdirSync(path.join(SAIDA, sub), { recursive: true })
}

const conversor = conversorDePdf()
console.log(
  conversor
    ? `Conversor de PDF encontrado: ${conversor} — os PDFs serão gerados.`
    : 'Nenhum conversor de PDF instalado (soffice/libreoffice/pandoc). ' +
        'Nada será instalado para isto — a conferência visual é no Word, a partir dos .docx.',
)
console.log(`Baseline: ${SHA_BASELINE}\n`)

let falhas = 0
const linhas = []

for (const arquivo of MODELOS) {
  const caminhoRepo = `${DIR_MODELOS.replace(/\\/g, '/')}/${arquivo}`
  // O modelo DE ANTES DA FASE, direto do objeto do git.
  const base = execFileSync('git', ['show', `${SHA_BASELINE}:${caminhoRepo}`], {
    maxBuffer: 64 * 1024 * 1024,
  })
  const novo = fs.readFileSync(path.join(process.cwd(), DIR_MODELOS, arquivo))

  const rBase = render(base, { ...PAYLOAD })
  const rSem = render(novo, { ...PAYLOAD, tem_acessorios: false, acessorios: '' })
  const rCom = render(novo, { ...PAYLOAD, tem_acessorios: true, acessorios: LINHA_ACESSORIOS })

  fs.writeFileSync(path.join(SAIDA, 'baseline', arquivo), rBase)
  fs.writeFileSync(path.join(SAIDA, 'novo-sem-acessorios', arquivo), rSem)
  fs.writeFileSync(path.join(SAIDA, 'novo-com-acessorios', arquivo), rCom)

  const xB = new PizZip(rBase).file(PARTE).asText()
  const xS = new PizZip(rSem).file(PARTE).asText()
  const xC = new PizZip(rCom).file(PARTE).asText()

  // ---- O CRITÉRIO 2, provado aqui -----------------------------------------
  const textoIgual = texto(xB) === texto(xS)
  const pIgual = ps(xB).length === ps(xS).length
  const xmlIgual = xB === xS
  const bytesIguais = Buffer.compare(rBase, rSem) === 0
  const clausula = `Acompanham o equipamento os seguintes acessórios e periféricos: ${LINHA_ACESSORIOS}`
  const temClausula = texto(xC).includes(clausula)

  const ok = textoIgual && pIgual && temClausula
  if (!ok) falhas++

  console.log(
    `${ok ? '✓' : '✗'} ${arquivo}\n` +
      `    SEM acessório × baseline: texto idêntico=${textoIgual} · ` +
      `<w:p> ${ps(xB).length}=${ps(xS).length} (${pIgual}) · XML idêntico=${xmlIgual} · ` +
      `BYTE A BYTE=${bytesIguais}\n` +
      `    COM acessório: a cláusula sai inteira=${temClausula}\n` +
      `    sha renderizado — baseline ${sha12(rBase)} · sem ${sha12(rSem)} · com ${sha12(rCom)}`,
  )

  if (!textoIgual) {
    const a = texto(xB).split('\n')
    const b = texto(xS).split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) console.log(`      [${i}] baseline=${JSON.stringify(a[i])} novo=${JSON.stringify(b[i])}`)
    }
  }

  linhas.push({ arquivo, textoIgual, pIgual, xmlIgual, bytesIguais, temClausula })

  if (conversor) {
    for (const sub of ['baseline', 'novo-sem-acessorios', 'novo-com-acessorios']) {
      const alvo = path.join(SAIDA, sub)
      try {
        if (conversor === 'pandoc') {
          execFileSync(conversor, [
            path.join(alvo, arquivo),
            '-o',
            path.join(alvo, arquivo.replace(/\.docx$/, '.pdf')),
          ])
        } else {
          execFileSync(conversor, [
            '--headless',
            '--convert-to',
            'pdf',
            '--outdir',
            alvo,
            path.join(alvo, arquivo),
          ])
        }
      } catch (e) {
        console.log(`    ⚠ PDF de ${sub}/${arquivo} falhou: ${e.message}`)
      }
    }
  }
}

const resumo =
  `# Evidências da F39 — a seção de acessórios nos 5 modelos de responsabilidade\n\n` +
  `Gerado por \`scripts/termos/evidencias-acessorios.mjs\`.\n` +
  `Baseline: \`${SHA_BASELINE}\` (o \`git rev-parse HEAD\` medido antes de a fase começar).\n\n` +
  `Payload **100% fictício**: "Fulano de Tal", \`WAP0001234\`, "Cidade Fictícia".\n` +
  `Nenhum nome, patrimônio ou filial real aparece nestes arquivos.\n\n` +
  `## As três pastas\n\n` +
  `| Pasta | O que é |\n|---|---|\n` +
  `| \`baseline/\` | os 5 modelos **de antes da fase**, renderizados com o payload |\n` +
  `| \`novo-sem-acessorios/\` | os 5 modelos **novos**, com \`tem_acessorios\` falso |\n` +
  `| \`novo-com-acessorios/\` | os 5 modelos **novos**, com a linha \`${LINHA_ACESSORIOS}\` |\n\n` +
  `O par a olhar lado a lado é **\`baseline/\` × \`novo-sem-acessorios/\`**: eles têm de ser\n` +
  `o mesmo documento. A conferência visual que só o olho faz é a de\n` +
  `**\`novo-com-acessorios/\`** — a diagramação da cláusula quando há periférico.\n\n` +
  `## O critério 2, medido\n\n` +
  `| Modelo | texto idêntico | \`<w:p>\` igual | XML idêntico | byte a byte | cláusula sai inteira |\n` +
  `|---|---|---|---|---|---|\n` +
  linhas
    .map(
      (l) =>
        `| \`${l.arquivo}\` | ${l.textoIgual ? 'sim' : '**NÃO**'} | ${l.pIgual ? 'sim' : '**NÃO**'} | ` +
        `${l.xmlIgual ? 'sim' : '**NÃO**'} | ${l.bytesIguais ? 'sim' : 'não'} | ${l.temClausula ? 'sim' : '**NÃO**'} |`,
    )
    .join('\n') +
  `\n\n## PDF\n\n` +
  (conversor
    ? `Convertidos com \`${conversor}\`.\n`
    : `**Não há conversor de PDF nesta máquina** (\`soffice\`, \`libreoffice\` e \`pandoc\` ausentes),\n` +
      `e nada foi instalado para isto (custo R$ 0, stack fechada). A conferência visual é no Word,\n` +
      `abrindo os \`.docx\` das três pastas acima.\n`)

fs.writeFileSync(path.join(SAIDA, 'README.md'), resumo)

console.log(
  `\n${falhas === 0 ? 'OK' : 'FALHOU'} — evidências em docs/f39-evidencias/ (${MODELOS.length} modelos × 3 versões), ${falhas} falha(s).`,
)
process.exit(falhas > 0 ? 1 : 0)

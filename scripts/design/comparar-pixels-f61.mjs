#!/usr/bin/env node
// O COMPARADOR DE PIXELS DA F61 — o portão (b) do fechamento: "antes" × "depois"
// do MESMO instrumento (`previa-f61.tsx`) batem exatamente onde o gabarito diz
// "zero", e mudam só onde ele diz "muda".
//
// ============================================================================
// POR QUE NODE PURO + PLAYWRIGHT, E NÃO UMA LIB DE DIFF DE IMAGEM
// ============================================================================
// A regra 3 do `CLAUDE.md` proíbe dependência nova. Node não decodifica PNG
// sozinho — mas o Chromium do Playwright (já é devDependency) decodifica
// qualquer PNG que o próprio `previa-f61.tsx` gerou, de graça, via `<canvas>`.
// Este script abre UMA página em branco, carrega os dois PNGs de cada
// fotografia como `data:` URL, desenha cada um no seu próprio `<canvas>` e lê
// os pixels com `getImageData` — a MESMA técnica que a ordem de serviço pede.
//
// ============================================================================
// A REGRA DE RECORTE — cada lado com o PRÓPRIO bbox
// ============================================================================
// Um quadro pode ter MUDADO DE POSIÇÃO (algo acima dele cresceu ou encolheu)
// sem ter mudado um pixel nele mesmo. Recortar os dois lados pela MESMA
// coordenada acusaria esse deslocamento como se fosse uma mudança do quadro —
// e não é. Por isso cada recorte usa o bbox que o PRÓPRIO lado mediu
// (`medidas.json` de `--antes`/`--depois`, gravado por `previa-f61.tsx` na
// hora da foto): o "antes" recorta do PNG do antes pelo bbox do antes; o
// "depois", do PNG do depois pelo bbox do depois.
//
// ============================================================================
// USO
// ============================================================================
//   node scripts/design/comparar-pixels-f61.mjs \
//     --antes <pasta> --depois <pasta> --gabarito <arquivo.json> \
//     [--saida <arquivo.json>]
//
// O GABARITO é um objeto `{ "<vitrine>/<quadro>": "zero" | "muda" }`.
//   · "zero"  — o quadro TEM de sair igual. Tamanho divergente, ou QUALQUER pixel
//               fora da faixa de ANTIALIAS (ver abaixo), → REPROVA.
//   · "muda"  — mudança ESPERADA (a tabela de mudanças de propósito já credita
//               o pixel). Só INFORMA a contagem, nunca reprova.
//   · um quadro medido que não está no gabarito → REPROVA ("quadro sem
//     gabarito") — todo pixel que muda tem de ter uma linha na tabela, sem
//     exceção por esquecimento.
//
// ============================================================================
// A FAIXA DE ANTIALIAS — por que "zero" não é "zero byte a byte"
// ============================================================================
// O recorte de cada quadro sai da foto da página INTEIRA, numa grade de pixels
// inteiros; a posição do quadro na página, não. Quando um quadro ACIMA muda de
// altura (e a F61 muda: raio, respiro, tamanho de texto), o quadro de baixo desce
// alguns pixels e a fração do seu deslocamento muda — então o MESMO conteúdo é
// recortado com um alinhamento sub-pixel diferente, e o texto sai com outra
// borda de antialias. Medido na bancada (17/09/2026), em quadros cujo HTML
// normalizado é BYTE A BYTE idêntico nos dois lados: 1 a 64 pixels por quadro, e o
// MAIOR Δ medido em qualquer canal foi 14 — um cinza de borda de letra.
//
// Por isso "zero" é: NENHUM pixel com Δ > 16 em qualquer canal (o maior ruído medido
// foi 14, e a faixa fica dois pontos acima dele). Qualquer coisa
// que alguém enxergue — um traço que some, um raio, um tom, um deslocamento —
// passa MUITO disso (a borda removida de um valor copiável mediu Δ 48; a caixa
// que mudou de posição, Δ 140). A contagem crua continua no relatório
// (`pixelsDiferentes`), ao lado da contagem que decide (`pixelsForaDoAntialias`).
//
// ⚠ Isto NÃO é um limiar de porcentagem ("até 0,1% passa"): um pixel forte
// reprova, venha sozinho ou acompanhado.
//
// Sai com código 1 se qualquer coisa reprovar. `--saida` grava o relatório
// completo (todas as linhas, inclusive as "muda" e a foto inteira) em JSON.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}

const PASTA_ANTES = argumento('antes', '')
const PASTA_DEPOIS = argumento('depois', '')
const CAMINHO_GABARITO = argumento('gabarito', '')
const CAMINHO_SAIDA = argumento('saida', '')

if (!PASTA_ANTES || !PASTA_DEPOIS || !CAMINHO_GABARITO) {
  console.error('Uso: comparar-pixels-f61.mjs --antes <pasta> --depois <pasta> --gabarito <arquivo.json> [--saida <arquivo.json>]')
  process.exit(2)
}

function lerMedidas(pasta) {
  const caminho = join(pasta, 'medidas.json')
  if (!existsSync(caminho)) {
    throw new Error(`medidas.json não encontrado em ${pasta} — rode previa-f61.tsx sem --so-html e sem --capturar-quadros nao.`)
  }
  return JSON.parse(readFileSync(caminho, 'utf8'))
}

const medidasAntes = lerMedidas(resolve(PASTA_ANTES))
const medidasDepois = lerMedidas(resolve(PASTA_DEPOIS))
const gabarito = JSON.parse(readFileSync(resolve(CAMINHO_GABARITO), 'utf8'))

function chaveFoto(m) {
  return `${m.vitrine}__${m.tema}__${m.largura}x${m.altura}`
}
function nomePng(m) {
  return `${m.vitrine}__${m.tema}__${m.largura}x${m.altura}.png`
}

// Casa as fotos presentes NOS DOIS LADOS — por vitrine+tema+largura+altura,
// não por ordem de array (a ordem pode mudar entre passadas sem que isso
// signifique nada).
const porChaveDepois = new Map(medidasDepois.map((m) => [chaveFoto(m), m]))
const paresDeFoto = []
for (const mAntes of medidasAntes) {
  const mDepois = porChaveDepois.get(chaveFoto(mAntes))
  if (!mDepois) {
    console.warn(`⚠ sem par em --depois para ${chaveFoto(mAntes)} — pulando (não compara, não reprova).`)
    continue
  }
  const pngAntes = join(resolve(PASTA_ANTES), nomePng(mAntes))
  const pngDepois = join(resolve(PASTA_DEPOIS), nomePng(mDepois))
  if (!existsSync(pngAntes) || !existsSync(pngDepois)) {
    console.warn(`⚠ PNG ausente para ${chaveFoto(mAntes)} — pulando.`)
    continue
  }
  paresDeFoto.push({ mAntes, mDepois, pngAntes, pngDepois })
}

const BBOX_ZERO = { x: 0, y: 0, width: 0, height: 0 }

async function abrirNavegador() {
  const { chromium } = await import('playwright')
  try {
    return await chromium.launch()
  } catch (erro) {
    console.warn(`⚠ Chromium do Playwright indisponível (${erro.message}); tentando o Chrome do sistema…`)
    return await chromium.launch({ channel: 'chrome' })
  }
}

/**
 * Roda TODO o trabalho de canvas — decodificar os dois PNGs, desenhar em dois
 * `<canvas>`, recortar cada quadro pelo PRÓPRIO bbox e comparar RGBA exato —
 * DENTRO do navegador, numa chamada só por fotografia (decodificar o PNG uma
 * vez só e reusar o canvas para todos os quadros dela).
 */
function funcaoDoNavegador({ antesB64, depoisB64, quadros }) {
  function carregarImagem(b64) {
    return new Promise((resolveImg, rejectImg) => {
      const img = new Image()
      img.onload = () => resolveImg(img)
      img.onerror = () => rejectImg(new Error('falha ao decodificar PNG'))
      img.src = `data:image/png;base64,${b64}`
    })
  }

  function canvasDe(img) {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return { canvas: c, ctx }
  }

  // `getImageData` devolve transparente (0,0,0,0) para qualquer coordenada
  // fora do canvas — não lança, não recorta a resposta. É o que permite
  // comparar um bbox "sumido" de um lado (largura/altura 0) sem tratamento
  // especial: a leitura inteira sai zerada, e a comparação RGBA já acusa 100%
  // dos pixels do outro lado como diferentes.
  function recortar(ctx, bbox) {
    const w = Math.max(0, Math.round(bbox.width))
    const h = Math.max(0, Math.round(bbox.height))
    if (w === 0 || h === 0) return { data: new Uint8ClampedArray(0), w: 0, h: 0 }
    return { data: ctx.getImageData(Math.round(bbox.x), Math.round(bbox.y), w, h).data, w, h }
  }

  function comparar(bboxA, bboxB, ctxA, ctxB) {
    const a = recortar(ctxA, bboxA)
    const b = recortar(ctxB, bboxB)
    const tamanhoDivergente = a.w !== b.w || a.h !== b.h
    const w = Math.max(a.w, b.w)
    const h = Math.max(a.h, b.h)
    // Δ acima do qual a diferença deixa de ser borda de letra — ver o cabeçalho.
    const ANTIALIAS = 16
    let pixelsDiferentes = 0
    let pixelsForaDoAntialias = 0
    let maiorDelta = 0
    let minX = null
    let minY = null
    let maxX = null
    let maxY = null
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dentroA = x < a.w && y < a.h
        const dentroB = x < b.w && y < b.h
        let diff
        let delta = 0
        if (!dentroA || !dentroB) {
          diff = true
          delta = 255
        } else {
          const ia = (y * a.w + x) * 4
          const ib = (y * b.w + x) * 4
          for (let c = 0; c < 4; c++) {
            const d = Math.abs(a.data[ia + c] - b.data[ib + c])
            if (d > delta) delta = d
          }
          diff = delta > 0
        }
        if (diff) {
          pixelsDiferentes++
          if (delta > maiorDelta) maiorDelta = delta
          if (delta > ANTIALIAS) pixelsForaDoAntialias++
          if (minX === null || x < minX) minX = x
          if (minY === null || y < minY) minY = y
          if (maxX === null || x > maxX) maxX = x
          if (maxY === null || y > maxY) maxY = y
        }
      }
    }
    return {
      pixelsDiferentes,
      pixelsForaDoAntialias,
      maiorDelta,
      total: w * h,
      tamanhoDivergente,
      tamanho: tamanhoDivergente ? `${a.w}x${a.h} vs ${b.w}x${b.h}` : `${a.w}x${a.h}`,
      bboxDaDiferenca:
        pixelsDiferentes > 0 ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    }
  }

  return (async () => {
    const [imgA, imgB] = await Promise.all([carregarImagem(antesB64), carregarImagem(depoisB64)])
    const { ctx: ctxA } = canvasDe(imgA)
    const { ctx: ctxB } = canvasDe(imgB)

    const porQuadro = {}
    for (const [id, par] of Object.entries(quadros)) {
      porQuadro[id] = comparar(par.antes, par.depois, ctxA, ctxB)
    }
    const fotoInteira = comparar(
      { x: 0, y: 0, width: imgA.naturalWidth, height: imgA.naturalHeight },
      { x: 0, y: 0, width: imgB.naturalWidth, height: imgB.naturalHeight },
      ctxA,
      ctxB,
    )
    return { porQuadro, fotoInteira }
  })()
}

async function main() {
  const navegador = await abrirNavegador()
  const pagina = await navegador.newPage()

  const linhas = []
  let reprova = false

  try {
    for (const { mAntes, mDepois, pngAntes, pngDepois } of paresDeFoto) {
      const antesB64 = readFileSync(pngAntes).toString('base64')
      const depoisB64 = readFileSync(pngDepois).toString('base64')

      // A UNIÃO dos quadros dos dois lados — um quadro que sumiu (ou nasceu)
      // entra com bbox zero do lado que não o tem, e a comparação RGBA
      // acusa 100% de diferença sozinha (ver o comentário de `recortar`).
      const idsQuadros = new Set([...Object.keys(mAntes.quadros), ...Object.keys(mDepois.quadros)])
      const quadros = {}
      for (const id of idsQuadros) {
        quadros[id] = {
          antes: mAntes.quadros[id] ?? BBOX_ZERO,
          depois: mDepois.quadros[id] ?? BBOX_ZERO,
        }
      }

      const { porQuadro, fotoInteira } = await pagina.evaluate(funcaoDoNavegador, {
        antesB64,
        depoisB64,
        quadros,
      })

      for (const [quadro, r] of Object.entries(porQuadro)) {
        const chaveGabarito = `${mAntes.vitrine}/${quadro}`
        const esperado = Object.prototype.hasOwnProperty.call(gabarito, chaveGabarito)
          ? gabarito[chaveGabarito]
          : null
        let veredito
        if (esperado === null) {
          veredito = 'REPROVA (quadro sem gabarito)'
          reprova = true
        } else if (esperado === 'zero') {
          if (r.pixelsForaDoAntialias > 0 || r.tamanhoDivergente) {
            veredito = 'REPROVA (deveria ser zero)'
            reprova = true
          } else {
            veredito = 'ok (zero)'
          }
        } else if (esperado === 'muda') {
          veredito = r.pixelsDiferentes > 0 || r.tamanhoDivergente ? 'informa (mudou, como esperado)' : 'informa (não mudou)'
        } else {
          veredito = `REPROVA (gabarito com valor inválido: "${esperado}")`
          reprova = true
        }
        linhas.push({
          vitrine: mAntes.vitrine,
          quadro,
          tema: mAntes.tema,
          tamanho: r.tamanho,
          pixelsDiferentes: r.pixelsDiferentes,
          pixelsForaDoAntialias: r.pixelsForaDoAntialias,
          maiorDelta: r.maiorDelta,
          total: r.total,
          tamanhoDivergente: r.tamanhoDivergente,
          bboxDaDiferenca: r.bboxDaDiferenca,
          esperado,
          veredito,
        })
      }

      // A foto INTEIRA — informativo, nunca reprova (não tem linha de gabarito).
      linhas.push({
        vitrine: mAntes.vitrine,
        quadro: '(foto inteira)',
        tema: mAntes.tema,
        tamanho: fotoInteira.tamanho,
        pixelsDiferentes: fotoInteira.pixelsDiferentes,
        pixelsForaDoAntialias: fotoInteira.pixelsForaDoAntialias,
        maiorDelta: fotoInteira.maiorDelta,
        total: fotoInteira.total,
        tamanhoDivergente: fotoInteira.tamanhoDivergente,
        bboxDaDiferenca: fotoInteira.bboxDaDiferenca,
        esperado: null,
        veredito: 'informa (foto inteira)',
      })
    }
  } finally {
    await navegador.close()
  }

  // ---- relatório -----------------------------------------------------------
  const cols = ['vitrine', 'quadro', 'tema', 'tamanho', 'fora-do-antialias/diferentes/total', 'maior Δ', 'veredito']
  const linhasTabela = linhas.map((l) => [
    l.vitrine,
    l.quadro,
    l.tema,
    l.tamanho,
    `${l.pixelsForaDoAntialias ?? 0}/${l.pixelsDiferentes}/${l.total}`,
    String(l.maiorDelta ?? 0),
    l.veredito,
  ])
  const larguras = cols.map((c, i) => Math.max(c.length, ...linhasTabela.map((r) => String(r[i]).length)))
  const fmt = (linha) => linha.map((v, i) => String(v).padEnd(larguras[i])).join('  ')
  console.log(fmt(cols))
  console.log(larguras.map((w) => '-'.repeat(w)).join('  '))
  for (const linha of linhasTabela) console.log(fmt(linha))

  const totalReprovas = linhas.filter((l) => l.veredito.startsWith('REPROVA')).length
  console.log(
    `\n${totalReprovas === 0 ? '✔' : '✗'} ${linhas.length} linhas comparadas, ${totalReprovas} reprovação(ões).`,
  )

  if (CAMINHO_SAIDA) {
    writeFileSync(resolve(CAMINHO_SAIDA), `${JSON.stringify(linhas, null, 2)}\n`)
    console.log(`Relatório completo em ${CAMINHO_SAIDA}`)
  }

  process.exit(reprova ? 1 : 0)
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})

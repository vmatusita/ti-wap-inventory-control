import { readFileSync } from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'
import { describe, expect, it } from 'vitest'
import { TERMO_ARQUIVO, TERMO_TIPOS } from '@/lib/termos/tipos'

// F39 · §A.5 — A GUARDA DOS MODELOS `.docx`, que até esta fase não existia.
//
// Nenhum teste do repositório abria os `.docx`. Um modelo trocado à mão — pelo
// Word, por um "só ajeitei o espaçamento" — derrubava o termo em silêncio, e o
// defeito só aparecia no papel que alguém já tinha assinado. Este teste confere o
// CONJUNTO DE TAGS de cada um dos 7 modelos.
//
// ⚠ AS TAGS SAEM DO TEXTO, NUNCA DO XML CRU. Medido em 29/08/2026: três dos cinco
// modelos de responsabilidade (celular, monitor-interno e notebook) carregam um
// GUID entre chaves num atributo de DrawingML — `<a:ext uri="{28A0092B-C50C-407E-
// A947-70E740481C1C}">` —, e um `matchAll(/\{[^{}]*\}/g)` sobre o XML cru o captura
// como se fosse tag. Concatenar os `<w:t>` primeiro resolve, e é o que a §A.5 manda.

const DIR = path.join(process.cwd(), 'src', 'templates', 'termos')

/** As tags `{...}` de um modelo, extraídas do TEXTO — nunca do XML cru. */
function tagsDoModelo(arquivo: string): string[] {
  const zip = new PizZip(readFileSync(path.join(DIR, arquivo)))
  const xml = zip.file('word/document.xml')!.asText()
  const paragrafos = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? []
  const texto = paragrafos
    .map((p) =>
      (p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
        .map((t) => t.replace(/<[^>]+>/g, ''))
        .join(''),
    )
    .join('\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
  // As tags de bloco do docxtemplater (`{#x}` / `{/x}`) contam como a tag `x`.
  const cruas = [...texto.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1])
  return [...new Set(cruas.map((t) => t.replace(/^[#/^]/, '')))].sort()
}

// Os campos de identificação dos 5 modelos de responsabilidade, mais a cidade da
// linha da assinatura (F25) e a data por extenso.
const RESPONSABILIDADE_BASE = [
  'chamado',
  'cidade',
  'colaborador',
  'data_extenso',
  'marca',
  'modelo',
  'patrimonio',
  'service_tag',
]

// F39 — a seção nova. `tem_acessorios` é o bloco condicional; `acessorios`, a linha.
const ACESSORIOS = ['acessorios', 'tem_acessorios']

const DEVOLUCAO = [
  'cidade',
  'colaborador',
  'data_extenso',
  'data_mes_ano',
  'descricao',
  'marcas_modelos',
  'observacao',
  'outros_componentes',
  'patrimonios',
  'series',
  'tecnico',
]

const ESPERADO: Record<string, string[]> = {
  'responsabilidade-notebook.docx': [...RESPONSABILIDADE_BASE, ...ACESSORIOS].sort(),
  'responsabilidade-desktop.docx': [...RESPONSABILIDADE_BASE, ...ACESSORIOS].sort(),
  'responsabilidade-monitor-interno.docx': [...RESPONSABILIDADE_BASE, ...ACESSORIOS].sort(),
  'responsabilidade-monitor-homeoffice.docx': [...RESPONSABILIDADE_BASE, ...ACESSORIOS].sort(),
  'responsabilidade-celular.docx': [
    ...RESPONSABILIDADE_BASE,
    ...ACESSORIOS,
    'imei',
    'obs',
    'pulsus',
    'telefone',
  ].sort(),
  'devolucao-equipamento.docx': [...DEVOLUCAO].sort(),
  'devolucao-desligamento.docx': [...DEVOLUCAO].sort(),
}

const RESPONSABILIDADE = Object.keys(ESPERADO).filter((a) => a.startsWith('responsabilidade-'))
const DEVOLUCAO_ARQUIVOS = Object.keys(ESPERADO).filter((a) => a.startsWith('devolucao-'))

describe('modelos .docx dos termos', () => {
  it('o mapa TERMO_ARQUIVO cobre exatamente os 7 modelos conferidos aqui', () => {
    const doMapa = TERMO_TIPOS.map((t) => TERMO_ARQUIVO[t]).sort()
    expect(doMapa).toEqual(Object.keys(ESPERADO).sort())
  })

  it.each(Object.keys(ESPERADO))('%s tem exatamente o conjunto de tags esperado', (arquivo) => {
    expect(tagsDoModelo(arquivo)).toEqual(ESPERADO[arquivo])
  })

  it.each(RESPONSABILIDADE)('%s traz a seção de acessórios da F39', (arquivo) => {
    const tags = tagsDoModelo(arquivo)
    expect(tags).toContain('acessorios')
    expect(tags).toContain('tem_acessorios')
  })

  it.each(DEVOLUCAO_ARQUIVOS)('%s tem outros_componentes e NÃO tem as tags novas', (arquivo) => {
    const tags = tagsDoModelo(arquivo)
    expect(tags).toContain('outros_componentes')
    expect(tags).not.toContain('acessorios')
    expect(tags).not.toContain('tem_acessorios')
  })

  it.each(RESPONSABILIDADE)(
    '%s abre e fecha o bloco condicional em parágrafos SOZINHOS (o que o paragraphLoop remove)',
    (arquivo) => {
      // A forma importa: com as tags sozinhas no próprio parágrafo, o
      // `paragraphLoop: true` remove o bloco INTEIRO quando não há periférico.
      // Abrir e fechar dentro do mesmo parágrafo apagaria o texto e deixaria o
      // parágrafo — uma linha vazia pendurada no papel assinado (D10 proíbe).
      const zip = new PizZip(readFileSync(path.join(DIR, arquivo)))
      const xml = zip.file('word/document.xml')!.asText()
      const paragrafos = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? []
      const textos = paragrafos.map((p) =>
        (p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
          .map((t) => t.replace(/<[^>]+>/g, ''))
          .join(''),
      )
      const abre = textos.filter((t) => t.includes('{#tem_acessorios}'))
      const fecha = textos.filter((t) => t.includes('{/tem_acessorios}'))
      expect(abre).toEqual(['{#tem_acessorios}'])
      expect(fecha).toEqual(['{/tem_acessorios}'])
      // E o parágrafo da cláusula está ENTRE os dois, nesta ordem.
      const iAbre = textos.findIndex((t) => t === '{#tem_acessorios}')
      const iFecha = textos.findIndex((t) => t === '{/tem_acessorios}')
      expect(iFecha).toBe(iAbre + 2)
      expect(textos[iAbre + 1]).toBe(
        'Acompanham o equipamento os seguintes acessórios e periféricos: {acessorios}',
      )
    },
  )

  it.each(RESPONSABILIDADE)('%s mantém a cláusula de foro intacta', (arquivo) => {
    // A cláusula de FORO é texto jurídico e está FORA do escopo da F39. Ela vive
    // partida em runs no XML (medido: a busca literal no XML cru dá zero), então
    // a conferência é no texto concatenado.
    const zip = new PizZip(readFileSync(path.join(DIR, arquivo)))
    const xml = zip.file('word/document.xml')!.asText()
    const texto = (xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, ''))
      .join('')
    expect(texto).toContain('Comarca de São José dos Pinhais/PR')
  })

  it.each(Object.keys(ESPERADO))('%s mantém a linha da assinatura da F25', (arquivo) => {
    const zip = new PizZip(readFileSync(path.join(DIR, arquivo)))
    const xml = zip.file('word/document.xml')!.asText()
    expect(xml.split('{cidade}, {data_extenso}').length - 1).toBe(1)
  })
})

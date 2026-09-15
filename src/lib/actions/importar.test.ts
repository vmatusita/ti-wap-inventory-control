import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { lerPedidoFormData } from './importar'
// F56 · Frente F (migration 0140) — a prova de que o backup v2 (montado aqui, em
// `aplicarImport`) e o restaurador (`scripts/db/restaurar.mjs`, metade SQL desta
// mesma fase) concordam sobre os NOMES das três chaves novas. `.mjs` importado de
// um teste `.ts`: mesmo caminho de `scripts/db/restaurar-guarda.test.mts`, que já
// importa este módulo com sucesso (o `if (process.argv[1]...) main()` no rodapé
// dele só dispara quando invocado direto — importar não roda `main()`).
import {
  ORDEM_DE_INSERCAO,
  sqlDeReligarElos,
  sqlDeReligarPonteiros,
} from '../../../scripts/db/restaurar.mjs'

// A PROVA do critério 6/7 da F56 · Frente D (segunda metade, PLAN-F56.md): as
// DUAS actions que rodam o motor (`validarImport`, `baixarCsvCorrigido`) leem o
// vocabulário do BANCO a cada chamada (`lerVocabularioImport`) — NUNCA de um
// campo do `FormData`. Duas provas, complementares:
//
//   (a) COMPORTAMENTAL — `lerPedidoFormData` (a única leitura do FormData deste
//       módulo) devolve o MESMO resultado com ou sem um campo de vocabulário
//       FORJADO a mais no FormData — porque ela nunca o lê;
//   (b) ESTÁTICA — uma varredura de `src/lib/actions/importar.ts` reprova se
//       aparecer `formData.get(` de qualquer chave fora de
//       `arquivo`/`filialId`/`correcoes`.
//
// Molde dos tripwires de fonte já existentes (`src/lib/actions/admin.test.ts`,
// `src/lib/use-server-exports.test.ts`) — leem a FONTE, não executam o módulo
// inteiro contra um banco (que esta mesa não tem).

const FONTE = readFileSync(fileURLToPath(new URL('./importar.ts', import.meta.url)), 'utf8')

function formDataValido(): FormData {
  const fd = new FormData()
  // `lastModified` FIXO: sem ele o `File` assume `Date.now()`, e o teste que compara dois
  // FormData criados em sequência (o do vocabulário forjado, abaixo) reprovava quando as
  // duas criações caíam em milissegundos diferentes — medido no CI do PR #43 (run
  // 34865411451: …349 × …350), com a asserção certa e o produto certo.
  fd.set(
    'arquivo',
    new File(['Site;Tipo\nMatriz;Notebook'], 'inventario.csv', { type: 'text/csv', lastModified: 0 }),
  )
  fd.set('filialId', '1')
  fd.set('correcoes', JSON.stringify([{ op: 'remover_linha', linha: 2 }]))
  return fd
}

describe('lerPedidoFormData — a única leitura do FormData (critério 6/7)', () => {
  it('lê arquivo/filialId/correcoes normalmente', async () => {
    const r = await lerPedidoFormData(formDataValido())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.filialId).toBe(1)
    expect(r.arquivo.name).toBe('inventario.csv')
    expect(r.correcoes).toEqual([{ op: 'remover_linha', linha: 2 }])
  })

  it('um FormData com um campo de VOCABULÁRIO FORJADO a mais dá o MESMO resultado', async () => {
    const semForja = formDataValido()
    const comForja = formDataValido()
    // O forjado tenta ser "plausível": um apelido a mais que, se fosse lido,
    // faria uma linha bater com uma filial que o vocabulário real não conhece.
    comForja.set(
      'vocabulario',
      JSON.stringify({
        filiais: [{ id: 999, nome: 'Filial Forjada', ativa: true }],
        apelidos: [{ filialId: 999, apelido: 'Matriz' }],
        categorias: [],
        estados: [],
        prefixosPatrimonio: ['ZZ'],
      }),
    )
    // Mais um formato plausível de ataque: um campo cujo NOME é uma das três
    // chaves reais, mas em caixa diferente — `lerFilialId`/`lerArquivoImport`
    // usam a chave exata ('filialId'/'arquivo'), então isto também não muda nada.
    comForja.set('FilialId', '999')
    comForja.set('Vocabulario', '{}')

    const [semResultado, comResultado] = await Promise.all([
      lerPedidoFormData(semForja),
      lerPedidoFormData(comForja),
    ])
    expect(comResultado).toEqual(semResultado)
  })

  it('o campo forjado nunca aparece no resultado (nem por acidente de spread)', async () => {
    const fd = formDataValido()
    fd.set('vocabulario', '{"filiais":[{"id":999,"nome":"Forjada","ativa":true}]}')
    const r = await lerPedidoFormData(fd)
    expect(r.ok).toBe(true)
    expect(Object.keys(r)).toEqual(['ok', 'filialId', 'arquivo', 'correcoes'])
  })
})

describe('varredura de src/lib/actions/importar.ts: formData.get só alcança arquivo/filialId/correcoes (critério 7)', () => {
  const CHAVES_PERMITIDAS = ['arquivo', 'filialId', 'correcoes']

  it('há pelo menos uma leitura de FormData no arquivo (guarda do próprio teste — não passa a seco)', () => {
    const chaves = [...FONTE.matchAll(/formData\.get\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!)
    expect(chaves.length).toBeGreaterThanOrEqual(3)
  })

  it('toda chamada formData.get(...) usa uma chave da lista permitida', () => {
    const chaves = [...FONTE.matchAll(/formData\.get\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!)
    for (const chave of chaves) {
      expect(CHAVES_PERMITIDAS, `formData.get('${chave}') não está na lista permitida`).toContain(chave)
    }
  })

  it('nenhuma outra forma de leitura do FormData escapa da varredura (guarda da guarda)', () => {
    // `formData.get(` é a ÚNICA API deste módulo para ler o corpo — nem
    // `.getAll(`, nem `.entries()`/`.keys()` (que devolveriam TODAS as chaves,
    // inclusive uma forjada, sem que a varredura acima os visse).
    expect(FONTE).not.toContain('formData.getAll(')
    expect(FONTE).not.toContain('formData.entries(')
    expect(FONTE).not.toContain('formData.keys(')
    expect(FONTE).not.toContain('formData.values(')
    expect(FONTE).not.toContain('Object.fromEntries(formData')
  })

  it('sabotagem: acrescentar formData.get de uma chave fora da lista faria este teste (o segundo describe) reprovar', () => {
    // Não sabota o arquivo real — prova que a REGRA em si pega o caso, rodando
    // a mesma checagem contra um texto sabotado localmente.
    const sabotado = FONTE + `\nformData.get('vocabulario')\n`
    const chaves = [...sabotado.matchAll(/formData\.get\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!)
    expect(chaves).toContain('vocabulario')
    expect(CHAVES_PERMITIDAS).not.toContain('vocabulario')
  })
})

describe('as duas actions do motor leem o vocabulário do banco a cada chamada (guarda de fonte)', () => {
  it('validarImport e baixarCsvCorrigido chamam lerVocabularioImport — nunca um vocabulário vindo do cliente', () => {
    const corpoValidarImport = FONTE.slice(
      FONTE.indexOf('export async function validarImport'),
      FONTE.indexOf('export async function aplicarImport'),
    )
    const corpoBaixarCsvCorrigido = FONTE.slice(FONTE.indexOf('export async function baixarCsvCorrigido'))
    expect(corpoValidarImport).toContain('lerVocabularioImport(')
    expect(corpoBaixarCsvCorrigido).toContain('lerVocabularioImport(')
  })

  it('aplicarImport também lê o vocabulário do banco (para recusar categoria/estado fora do importável)', () => {
    const corpoAplicarImport = FONTE.slice(
      FONTE.indexOf('export async function aplicarImport'),
      FONTE.indexOf('export async function urlBackup'),
    )
    expect(corpoAplicarImport).toContain('lerVocabularioImport(')
    expect(corpoAplicarImport).toContain('categoriasImportaveis(')
    expect(corpoAplicarImport).toContain('estadosImportaveis(')
  })
})

// =============================================================================
// F56 · Frente F (migration 0140, Decisões 9 e 10) — a metade TypeScript do
// conserto da FK. Nenhuma destas provas fala com um banco (a mesa não tem um):
// são tripwires de FONTE, no mesmo molde do resto deste arquivo — `custoSchema`,
// `rpcRetornoSchema` e `RECUSAS_DA_RPC` são `const` PRIVADAS (não podem ser
// `export`adas: este módulo é `'use server'`, e o Next.js recusa qualquer export
// de topo que não seja função async — comentário no topo de `lerPedidoFormData`).
// =============================================================================

const corpoAplicarImportCompleto = FONTE.slice(
  FONTE.indexOf('export async function aplicarImport'),
  FONTE.indexOf('export async function urlBackup'),
)

/** Os literais `'XXXXX'` dentro do primeiro `new Set([...])`/`z.object({...})` que segue a âncora. */
function extrairArrayDeStrings(fonte: string, ancora: string, abreCom: '[' | '{'): string[] {
  const pos = fonte.indexOf(ancora)
  expect(pos, `âncora "${ancora}" não encontrada em importar.ts`).toBeGreaterThan(-1)
  const abre = fonte.indexOf(abreCom, pos)
  const fecha = abreCom === '[' ? fonte.indexOf(']', abre) : fonte.indexOf('})', abre)
  const trecho = fonte.slice(abre + 1, fecha)
  return [...trecho.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
}

describe('RECUSAS_DA_RPC — a régua "sei que não commitou" (F56 · Frente F, Decisão 10)', () => {
  it('tem exatamente os dez SQLSTATE da régua (os quatro de sempre + os seis novos)', () => {
    const codigos = extrairArrayDeStrings(FONTE, 'const RECUSAS_DA_RPC = new Set([', '[')
    expect(new Set(codigos)).toEqual(
      new Set([
        'P0001',
        '22023',
        '42501',
        '57014',
        '23502',
        '23503',
        '23505',
        '23514',
        '40001',
        '40P01',
      ]),
    )
  })
})

describe('custoSchema e rpcRetornoSchema — as chaves novas da FK entram com .default(0)', () => {
  it('custoSchema: as quatro chaves da FK (0140) têm .default(0) — código velho no navegador manda sem elas', () => {
    const inicio = FONTE.indexOf('const custoSchema = z.object({')
    const fim = FONTE.indexOf('})', inicio)
    const corpo = FONTE.slice(inicio, fim)
    for (const chave of [
      'pendencias_item',
      'lancamentos_movimentacao',
      'lancamentos_pendencia',
      'ponteiros_substituto',
    ]) {
      const re = new RegExp(`\\b${chave}:\\s*z\\.number\\(\\)[^\\n]*\\.default\\(0\\)`)
      expect(re.test(corpo), `custoSchema.${chave} não tem .default(0)`).toBe(true)
    }
    // As quatro de SEMPRE continuam SEM default — mandar sem elas é payload malformado,
    // não deploy fora de ordem (elas nunca dependeram de uma migration nova).
    for (const chave of ['ativos', 'movimentacoes', 'anotacoes', 'termos']) {
      const re = new RegExp(`\\b${chave}:\\s*z\\.number\\(\\)[^\\n]*\\.default\\(`)
      expect(re.test(corpo), `custoSchema.${chave} ganhou .default indevidamente`).toBe(false)
    }
  })

  it('rpcRetornoSchema: as três chaves novas da RPC (0140) têm .default(0) — RPC velha no ar não manda', () => {
    const inicio = FONTE.indexOf('const rpcRetornoSchema = z.object({')
    const fim = FONTE.indexOf('})', inicio)
    const corpo = FONTE.slice(inicio, fim)
    for (const chave of ['pendencias_apagadas', 'lancamentos_desvinculados', 'ponteiros_anulados']) {
      const re = new RegExp(`\\b${chave}:\\s*z\\.number\\(\\)\\.default\\(0\\)`)
      expect(re.test(corpo), `rpcRetornoSchema.${chave} não tem .default(0)`).toBe(true)
    }
  })
})

describe('import_falhou — a chave certa em cada ramo (F56 · Frente F, Decisão 10, fato 30)', () => {
  it('`descartou` vem de RECUSAS_DA_RPC.has(error.code ?? \'\') — a MESMA condição que decide descartar', () => {
    expect(corpoAplicarImportCompleto).toContain("const descartou = RECUSAS_DA_RPC.has(error.code ?? '')")
  })

  it('o evento grava `backup_descartado` SÓ quando descartou, e `backup_path` quando o backup fica', () => {
    expect(corpoAplicarImportCompleto).toContain(
      '...(descartou ? { backup_descartado: backupPath } : { backup_path: backupPath })',
    )
    // Nunca as DUAS juntas incondicionalmente (o defeito do fato 30: gravar
    // `backup_descartado` mesmo quando o backup não saiu).
    expect(corpoAplicarImportCompleto).not.toMatch(/backup_descartado:\s*backupPath,\s*\n\s*\},\s*\n\s*\}\)/)
  })

  it('o ramo `safeParse` (RPC commitou, retorno fora do formato) grava import_executado com backup_path e retorno_inesperado: true', () => {
    const inicioSafeParse = corpoAplicarImportCompleto.indexOf('rpcRetornoSchema.safeParse(data)')
    const fimSafeParse = corpoAplicarImportCompleto.indexOf('// COPIA os .docx', inicioSafeParse)
    expect(inicioSafeParse).toBeGreaterThan(-1)
    expect(fimSafeParse).toBeGreaterThan(inicioSafeParse)
    const trecho = corpoAplicarImportCompleto.slice(inicioSafeParse, fimSafeParse)
    expect(trecho).toContain("acao: 'import_executado'")
    expect(trecho).toContain('backup_path: backupPath')
    expect(trecho).toContain('retorno_inesperado: true')
    // E ele NÃO é 'import_falhou': a RPC COMMITOU, dizer "falhou" mentiria sobre o
    // que aconteceu no banco.
    expect(trecho).not.toContain("acao: 'import_falhou'")
  })

  it('o retorno final (ResultadoImport) e o evento import_executado de SUCESSO levam os três números novos', () => {
    const depoisDoSafeParse = corpoAplicarImportCompleto.slice(
      corpoAplicarImportCompleto.indexOf('rpcRetornoSchema.safeParse(data)'),
    )
    expect(depoisDoSafeParse).toContain('pendencias_apagadas: ret.data.pendencias_apagadas')
    expect(depoisDoSafeParse).toContain('lancamentos_desvinculados: ret.data.lancamentos_desvinculados')
    expect(depoisDoSafeParse).toContain('ponteiros_anulados: ret.data.ponteiros_anulados')
    expect(depoisDoSafeParse).toContain('pendenciasApagadas: ret.data.pendencias_apagadas')
    expect(depoisDoSafeParse).toContain('lancamentosDesvinculados: ret.data.lancamentos_desvinculados')
    expect(depoisDoSafeParse).toContain('ponteirosAnulados: ret.data.ponteiros_anulados')
  })
})

describe('backup v2 do import × scripts/db/restaurar.mjs — as chaves batem (F56 · Frente F, Decisão 9)', () => {
  it('o backup grava `versao: 2`', () => {
    expect(corpoAplicarImportCompleto).toMatch(/versao:\s*2\b/)
  })

  it('as três chaves novas do backup existem no literal, com os nomes EXATOS que o restaurador lê', () => {
    expect(corpoAplicarImportCompleto).toContain('pendencias_item: desvinculos.pendenciasItem')
    expect(corpoAplicarImportCompleto).toContain(
      'lancamentos_desvinculados: desvinculos.lancamentosDesvinculados',
    )
    expect(corpoAplicarImportCompleto).toContain('ponteiros_perdidos: desvinculos.ponteirosPerdidos')
    // Lidas ANTES da RPC (senão os elos já estariam nulos — a pré-imagem se perderia).
    // F58 · Frente B — `client.rpc('importar_ativos_substituir', …)` virou
    // `chamarRpc(client, 'importar_ativos_substituir', …)` (a PORTA ÚNICA); a prova
    // continua sendo a ORDEM, só a grafia da chamada mudou.
    const posLeitura = corpoAplicarImportCompleto.indexOf('exportarDesvinculosFk(')
    const posRpc = corpoAplicarImportCompleto.indexOf(
      "chamarRpc(client, 'importar_ativos_substituir'",
    )
    expect(posLeitura).toBeGreaterThan(-1)
    expect(posRpc).toBeGreaterThan(-1)
    expect(posLeitura).toBeLessThan(posRpc)
  })

  it('`nao_incluido` foi reescrito para vazio — nada mais falta para o que a 0140 apaga/desvincula/anula', () => {
    const inicio = corpoAplicarImportCompleto.indexOf('const backup = {')
    const fim = corpoAplicarImportCompleto.indexOf('...acervo,', inicio)
    const corpo = corpoAplicarImportCompleto.slice(inicio, fim)
    expect(corpo).toContain('nao_incluido: []')
  })

  it('`pendencias_item` está em ORDEM_DE_INSERCAO do restaurador — é inserida como TABELA', () => {
    expect(ORDEM_DE_INSERCAO).toContain('pendencias_item')
  })

  it('`lancamentos_desvinculados`/`ponteiros_perdidos` NÃO estão em ORDEM_DE_INSERCAO — religadas por UPDATE, nunca inseridas como linha nova', () => {
    expect(ORDEM_DE_INSERCAO).not.toContain('lancamentos_desvinculados')
    expect(ORDEM_DE_INSERCAO).not.toContain('ponteiros_perdidos')
  })

  it('sqlDeReligarElos aceita o formato { id, movimentacao_id, pendencia_item_id } que exportarDesvinculosFk produz', () => {
    const sql = sqlDeReligarElos([
      { id: 'l1', movimentacao_id: 'm1', pendencia_item_id: null },
      { id: 'l2', movimentacao_id: null, pendencia_item_id: 'p1' },
    ])
    expect(sql).toContain('update public.lancamentos_item')
    expect(sql).toContain("'l1'")
    expect(sql).toContain("'m1'")
    expect(sql).toContain("'l2'")
    expect(sql).toContain("'p1'")
  })

  it('sqlDeReligarPonteiros aceita o formato { id, substitui_ativo_id } — o subconjunto de Row<ativos> que importa', () => {
    const sql = sqlDeReligarPonteiros([{ id: 'a1', substitui_ativo_id: 'a0' }])
    expect(sql).toContain('update public.ativos')
    expect(sql).toContain("'a1'")
    expect(sql).toContain("'a0'")
  })
})

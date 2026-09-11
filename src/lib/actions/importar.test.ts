import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { lerPedidoFormData } from './importar'

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
  fd.set('arquivo', new File(['Site;Tipo\nMatriz;Notebook'], 'inventario.csv', { type: 'text/csv' }))
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

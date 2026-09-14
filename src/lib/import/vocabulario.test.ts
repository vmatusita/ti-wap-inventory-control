import { describe, expect, it } from 'vitest'
import {
  apelidosNoSql,
  categoriasNoSql,
  estadosNoSql,
  idsPorSlugDoSeedFixo,
  migracaoComAncora,
  nomesDasFiliaisHoje,
  prefixosNoSql,
} from './leitor-seed-vocabulario'
import { extrairPatrimonioDoHostname } from './deparas'
import {
  categoriasImportaveis,
  conferirVocabulario,
  estadoPlanilha,
  estadosImportaveis,
  filialDoVocabulario,
  mapearCategoria,
  mapearUnidade,
  paraCliente,
  rotuloCategoria,
  rotuloEstado,
  termosCategoria,
  termosEstadoCorrigiveis,
  VocabularioImportInvalidoError,
  type VocabularioImport,
} from './vocabulario'
import type { CategoriaImport, EstadoAlvoImport } from './tipos'

// Testes de `./vocabulario.ts` (F56 · Frente D, segunda metade) — sucessor da
// parte de `deparas.test.ts` que testava `mapearUnidade`/`filialPorSlug`/
// `mapearCategoria`/`estadoPlanilha`/`extrairPatrimonioDoHostname`/
// `TIPO_CANONICO`/`SITUACAO_CANONICA`: essas funções e constantes SAÍRAM de
// `deparas.ts` (o vocabulário virou parâmetro). `normalizarTexto`/`limparCampo`/
// `parseData`/etc. (que não dependem de vocabulário) continuam testados em
// `deparas.test.ts`.
//
// A FIXTURE da regressão histórica é CONSTRUÍDA a partir do SEED da 0139 (não
// copiada de cabeça) — reusa os leitores de SQL de `vocabulario-sql.test.ts`
// (exportados de propósito) e as filiais de `0007`/`0026`. Os `id` de filial são
// ARBITRÁRIOS (a ordem de inserção do seed fixo — 1..5 —, o mesmo padrão de
// `plano.test.ts`/`correcoes.test.ts`): o que a regressão prova é que o
// CONSTRUTOR do vocabulário resolve cada termo para a filial CERTA dentro do
// próprio vocabulário, não que os ids batem com produção.

function construirVocabularioDoSeed(): VocabularioImport {
  const idPorSlug = idsPorSlugDoSeedFixo()
  const nomes = nomesDasFiliaisHoje()
  const filiais = [...idPorSlug.entries()].map(([slug, id]) => ({
    id,
    nome: nomes.get(slug)!,
    ativa: true,
  }))

  const { sql: sqlApelidos } = migracaoComAncora('insert into public.unidades_apelidos (filial_id, apelido)')
  const apelidos = apelidosNoSql(sqlApelidos).map(({ slug, apelido }) => ({
    filialId: idPorSlug.get(slug)!,
    apelido,
  }))

  const { sql: sqlCategorias } = migracaoComAncora(
    'insert into public.import_termos_categoria (termo, categoria, rotulo) values',
  )
  const categorias = categoriasNoSql(sqlCategorias).map((c) => ({
    termo: c.termo,
    categoria: c.categoria as CategoriaImport,
    rotulo: c.rotulo,
  }))

  const { sql: sqlEstados } = migracaoComAncora(
    'insert into public.import_termos_estado (termo, estado, rotulo) values',
  )
  const estados = estadosNoSql(sqlEstados).map((e) => ({
    termo: e.termo,
    // `EstadoPlanilha` é o enum do banco menos `devolvido_fornecedor` — o seed
    // nunca semeia esse valor (checado pelo CHECK da 0139 e por
    // `vocabulario-sql.test.ts`), então o cast é seguro aqui.
    estado: e.estado as VocabularioImport['estados'][number]['estado'],
    rotulo: e.rotulo,
  }))

  const { sql: sqlPrefixos } = migracaoComAncora('insert into public.import_prefixos_patrimonio (prefixo) values')
  const prefixosPatrimonio = prefixosNoSql(sqlPrefixos)

  return { filiais, apelidos, categorias, estados, prefixosPatrimonio }
}

const VOCAB = construirVocabularioDoSeed()
const ID_POR_SLUG = idsPorSlugDoSeedFixo()

describe('a fixture derivada do seed da 0139 (guarda do próprio teste)', () => {
  it('tem 5 filiais, 13 apelidos, 5 categorias, 17 estados, 7 prefixos', () => {
    expect(VOCAB.filiais).toHaveLength(5)
    expect(VOCAB.apelidos).toHaveLength(13)
    expect(VOCAB.categorias).toHaveLength(5)
    expect(VOCAB.estados).toHaveLength(17)
    expect(VOCAB.prefixosPatrimonio).toHaveLength(7)
  })

  it('conferirVocabulario aceita a fixture derivada do seed sem lançar', () => {
    expect(() => conferirVocabulario(VOCAB)).not.toThrow()
  })
})

describe('regressão: os 18 termos históricos (13 apelidos + 5 nomes próprios) mapeiam para a filial certa', () => {
  it.each(VOCAB.apelidos.map((a) => [a.apelido, a.filialId] as const))(
    'apelido "%s" → filial id %i',
    (apelido, filialId) => {
      expect(mapearUnidade(apelido, VOCAB)).toBe(filialId)
    },
  )

  it.each([...ID_POR_SLUG.entries()])('o nome próprio da filial "%s" (id %i) também resolve, sem linha no vocabulário', (slug, id) => {
    const filial = VOCAB.filiais.find((f) => f.id === id)!
    expect(mapearUnidade(filial.nome, VOCAB)).toBe(id)
    // o nome próprio NÃO é um apelido — Decisão 2.
    expect(VOCAB.apelidos.some((a) => a.apelido === filial.nome)).toBe(false)
  })

  it('caixa/acento não importam (a chave é normalizarTexto)', () => {
    const primeiro = VOCAB.apelidos[0]!
    expect(mapearUnidade(primeiro.apelido.toUpperCase(), VOCAB)).toBe(primeiro.filialId)
  })

  it('termo desconhecido → null', () => {
    expect(mapearUnidade('Fábrica X', VOCAB)).toBeNull()
    expect(mapearUnidade('', VOCAB)).toBeNull()
    expect(mapearUnidade(null, VOCAB)).toBeNull()
  })
})

describe('filialDoVocabulario', () => {
  it('devolve nome + ativa pelo id', () => {
    const id = ID_POR_SLUG.get('matriz')!
    expect(filialDoVocabulario(id, VOCAB)).toEqual({ id, nome: 'Matriz', ativa: true })
  })

  it('id fora do vocabulário → null', () => {
    expect(filialDoVocabulario(9999, VOCAB)).toBeNull()
  })

  it('filial INATIVA continua no vocabulário (é unidade conhecida — Decisão 2), só não é ALVO', () => {
    const id = ID_POR_SLUG.get('eusebio')!
    const inativo: VocabularioImport = {
      ...VOCAB,
      filiais: VOCAB.filiais.map((f) => (f.id === id ? { ...f, ativa: false } : f)),
    }
    expect(filialDoVocabulario(id, inativo)).toEqual({ id, nome: 'Eusébio', ativa: false })
    // o nome dela continua resolvendo por mapearUnidade — ela é "outra filial",
    // nunca aceita calada (site_divergente ainda dispara contra ela).
    expect(mapearUnidade('Eusébio', inativo)).toBe(id)
  })
})

describe('mapearCategoria', () => {
  it.each(VOCAB.categorias.map((c) => [c.termo, c.categoria] as const))('%s → %s', (termo, categoria) => {
    expect(mapearCategoria(termo.toUpperCase(), VOCAB)).toBe(categoria)
  })

  it('desconhecido/vazio → null', () => {
    expect(mapearCategoria('Impressora', VOCAB)).toBeNull()
    expect(mapearCategoria('', VOCAB)).toBeNull()
  })
})

describe('estadoPlanilha (precedência Situação > Status)', () => {
  it.each(VOCAB.estados.map((e) => [e.termo, e.estado] as const))('termo "%s" → %s', (termo, estado) => {
    expect(estadoPlanilha('', termo, VOCAB)).toBe(estado)
    // Situação preenchida vence QUALQUER Status.
    expect(estadoPlanilha('Xyz', termo, VOCAB)).toBe(estado)
  })

  it('sem Situação cai no Status', () => {
    expect(estadoPlanilha('Remanejo', '', VOCAB)).toBe('em_uso')
  })

  it('fora do vocabulário → null', () => {
    expect(estadoPlanilha('Foo', '', VOCAB)).toBeNull()
    expect(estadoPlanilha('', '', VOCAB)).toBeNull()
  })
})

describe('termosCategoria / termosEstadoCorrigiveis', () => {
  it('termosCategoria tem os 5 termos', () => {
    expect([...termosCategoria(VOCAB)].sort()).toEqual(VOCAB.categorias.map((c) => c.termo).sort())
  })

  it('termosEstadoCorrigiveis exclui os que resolvem para descartado', () => {
    const corrigiveis = termosEstadoCorrigiveis(VOCAB)
    expect(corrigiveis).toHaveLength(15) // 17 - 2 (descarte/descartado)
    for (const termo of corrigiveis) {
      expect(estadoPlanilha('', termo, VOCAB)).not.toBe('descartado')
    }
  })
})

describe('categoriasImportaveis / estadosImportaveis / rotuloCategoria / rotuloEstado — ciclo fechado', () => {
  it('categoriasImportaveis tem as 5, cada uma com rótulo que volta pela mapearCategoria', () => {
    const lista = categoriasImportaveis(VOCAB)
    expect(lista).toHaveLength(5)
    for (const { categoria, rotulo } of lista) {
      expect(mapearCategoria(rotulo, VOCAB)).toBe(categoria)
      expect(rotuloCategoria(categoria, VOCAB)).toBe(rotulo)
    }
  })

  it('estadosImportaveis tem os 7 estados-alvo (nunca descartado), cada um com rótulo que volta', () => {
    const lista = estadosImportaveis(VOCAB)
    expect(lista).toHaveLength(7)
    expect(lista.map((e) => e.estado)).not.toContain('descartado')
    for (const { estado, rotulo } of lista) {
      expect(estadoPlanilha('', rotulo, VOCAB)).toBe(estado)
      expect(rotuloEstado(estado as EstadoAlvoImport, VOCAB)).toBe(rotulo)
    }
  })
})

describe('paraCliente — a fatia que desce por prop', () => {
  it('leva só categorias/estados importáveis + prefixos, nunca filiais/apelidos', () => {
    const cliente = paraCliente(VOCAB)
    expect(cliente.categorias).toHaveLength(5)
    expect(cliente.estados).toHaveLength(7)
    expect(cliente.prefixosPatrimonio).toEqual(VOCAB.prefixosPatrimonio)
    expect(cliente).not.toHaveProperty('filiais')
    expect(cliente).not.toHaveProperty('apelidos')
  })

  it('é JSON puro (objetos/arrays comuns) — sobrevive a um round-trip de JSON sem perder nada', () => {
    const cliente = paraCliente(VOCAB)
    expect(JSON.parse(JSON.stringify(cliente))).toEqual(cliente)
  })
})

// F7F (OS §1) — extrai do HOSTNAME o patrimônio canônico embutido. Movido de
// `deparas.test.ts` (F56): a lista de PREFIXOS agora chega por parâmetro.
describe('extrairPatrimonioDoHostname (F7F) — prefixos por parâmetro', () => {
  const PREFIXOS = VOCAB.prefixosPatrimonio

  it('hostname com token canônico embutido → canônico limpo', () => {
    expect(extrairPatrimonioDoHostname('NB-WAP0001234', PREFIXOS)).toBe('WAP0001234')
    expect(extrairPatrimonioDoHostname('DESKTOP-WAP0004491', PREFIXOS)).toBe('WAP0004491')
    expect(extrairPatrimonioDoHostname('wap0001234', PREFIXOS)).toBe('WAP0001234') // caixa baixa sobe
    expect(extrairPatrimonioDoHostname('LEA0000057-PC', PREFIXOS)).toBe('LEA0000057') // token no início
  })

  it('prefixo conhecido + <7 dígitos → completa os zeros', () => {
    expect(extrairPatrimonioDoHostname('NB-PRO3694', PREFIXOS)).toBe('PRO0003694')
    expect(extrairPatrimonioDoHostname('PRO3694', PREFIXOS)).toBe('PRO0003694')
    expect(extrairPatrimonioDoHostname('NB-WAP001', PREFIXOS)).toBe('WAP0000001')
    expect(extrairPatrimonioDoHostname('DESKTOP-PAT000376', PREFIXOS)).toBe('PAT0000376')
    expect(extrairPatrimonioDoHostname('STF42-PC', PREFIXOS)).toBe('STF0000042')
  })

  it('prefixo DESCONHECIDO no hostname → null (mesmo com dígitos)', () => {
    expect(extrairPatrimonioDoHostname('PC-01', PREFIXOS)).toBeNull()
    expect(extrairPatrimonioDoHostname('SALA-5', PREFIXOS)).toBeNull()
    expect(extrairPatrimonioDoHostname('NB-2', PREFIXOS)).toBeNull()
    expect(extrairPatrimonioDoHostname('PC01-WAP0001234', PREFIXOS)).toBe('WAP0001234')
    expect(extrairPatrimonioDoHostname('', PREFIXOS)).toBeNull()
    expect(extrairPatrimonioDoHostname(null, PREFIXOS)).toBeNull()
  })

  it('um prefixo que NÃO está na lista recebida não resolve, mesmo que seja "conhecido" noutro vocabulário', () => {
    expect(extrairPatrimonioDoHostname('NB-WAP0001234', ['PRO', 'LEA'])).toBeNull()
  })

  it('lista de prefixos vazia → nunca resolve', () => {
    expect(extrairPatrimonioDoHostname('NB-WAP0001234', [])).toBeNull()
  })

  it('não confunde número de 8+ dígitos com o token (exige token delimitado, ≤7 dígitos)', () => {
    expect(extrairPatrimonioDoHostname('NB-WAP00012345', PREFIXOS)).toBeNull()
    expect(extrairPatrimonioDoHostname('SERIAL12345678', PREFIXOS)).toBeNull()
  })

  it('injeção: extrai só o token limpo, descarta o payload em volta', () => {
    expect(extrairPatrimonioDoHostname('=cmd()', PREFIXOS)).toBeNull()
    expect(extrairPatrimonioDoHostname(' OR 1=1', PREFIXOS)).toBeNull()
    expect(extrairPatrimonioDoHostname('=WAP0001234', PREFIXOS)).toBe('WAP0001234')
    expect(extrairPatrimonioDoHostname('WAP0001234; rm -rf /', PREFIXOS)).toBe('WAP0001234')
    expect(extrairPatrimonioDoHostname("WAP0001234' OR '1'='1", PREFIXOS)).toBe('WAP0001234')
    expect(extrairPatrimonioDoHostname('"WAP0001234"', PREFIXOS)).toBe('WAP0001234')
    expect(extrairPatrimonioDoHostname("'; DROP TABLE ativos; --", PREFIXOS)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// conferirVocabulario — cada violação, isolada.
// ---------------------------------------------------------------------------

describe('conferirVocabulario recusa alto', () => {
  it('termo apontando para duas filiais (apelido igual ao nome de outra)', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      apelidos: [...VOCAB.apelidos, { filialId: ID_POR_SLUG.get('linhares')!, apelido: 'Matriz' }],
    }
    expect(() => conferirVocabulario(v)).toThrow(VocabularioImportInvalidoError)
    expect(() => conferirVocabulario(v)).toThrow(/aponta para mais de uma filial/)
  })

  it('apelido de filial inexistente', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      apelidos: [...VOCAB.apelidos, { filialId: 999999, apelido: 'Uma Filial Que Não Existe' }],
    }
    expect(() => conferirVocabulario(v)).toThrow(/não existe no vocabulário/)
  })

  it('categoria importável sem rótulo nenhum', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      categorias: VOCAB.categorias.filter((c) => c.categoria !== 'tablet'),
    }
    expect(() => conferirVocabulario(v)).toThrow(/categoria "tablet" precisa de exatamente um termo/)
  })

  it('categoria com DOIS termos-rótulo para o mesmo valor', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      categorias: [...VOCAB.categorias, { termo: 'zzduplicado', categoria: 'notebook', rotulo: 'Zzduplicado' }],
    }
    expect(() => conferirVocabulario(v)).toThrow(/categoria "notebook" precisa de exatamente um termo/)
  })

  it('estado-alvo importável sem rótulo nenhum', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      estados: VOCAB.estados.filter((e) => e.estado !== 'defasado'),
    }
    expect(() => conferirVocabulario(v)).toThrow(/estado "defasado" precisa de exatamente um termo/)
  })

  it('rótulo que não volta ao próprio termo', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      categorias: VOCAB.categorias.map((c) => (c.categoria === 'notebook' ? { ...c, rotulo: 'Outra Coisa' } : c)),
    }
    expect(() => conferirVocabulario(v)).toThrow(/não normaliza de volta ao termo/)
  })

  it('estado descartado com rótulo', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      estados: VOCAB.estados.map((e) => (e.termo === 'descarte' ? { ...e, rotulo: 'Descarte' } : e)),
    }
    expect(() => conferirVocabulario(v)).toThrow(/resolve para "descartado" e não pode ter forma de exibição/)
  })

  it('prefixo fora do formato', () => {
    const v: VocabularioImport = { ...VOCAB, prefixosPatrimonio: [...VOCAB.prefixosPatrimonio, 'wap'] }
    expect(() => conferirVocabulario(v)).toThrow(/fora do formato esperado/)
  })

  it('termo de categoria repetido', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      categorias: [...VOCAB.categorias, { termo: 'notebook', categoria: 'notebook', rotulo: null }],
    }
    expect(() => conferirVocabulario(v)).toThrow(/termo de categoria "notebook" está repetido/)
  })

  it('termo de estado repetido', () => {
    const v: VocabularioImport = {
      ...VOCAB,
      estados: [...VOCAB.estados, { termo: 'saida', estado: 'em_uso', rotulo: null }],
    }
    expect(() => conferirVocabulario(v)).toThrow(/termo de estado "saida" está repetido/)
  })

  it('a fixture derivada do seed segue passando depois de cada teste (isolamento — spread nunca muta VOCAB)', () => {
    expect(() => conferirVocabulario(VOCAB)).not.toThrow()
  })
})

describe('o índice é memoizado por identidade do objeto (WeakMap) — nunca serializado', () => {
  it('dois objetos com o MESMO conteúdo, identidades diferentes, respondem igual (sem cache cruzado)', () => {
    const copia: VocabularioImport = JSON.parse(JSON.stringify(VOCAB))
    const termo = VOCAB.apelidos[0]!.apelido
    expect(mapearUnidade(termo, copia)).toBe(mapearUnidade(termo, VOCAB))
  })

  it('mudar o objeto (nova identidade) muda o resultado — não fica preso ao índice antigo', () => {
    const semPrimeiro: VocabularioImport = { ...VOCAB, apelidos: VOCAB.apelidos.slice(1) }
    const primeiro = VOCAB.apelidos[0]!
    expect(mapearUnidade(primeiro.apelido, VOCAB)).toBe(primeiro.filialId)
    expect(mapearUnidade(primeiro.apelido, semPrimeiro)).toBeNull()
  })
})

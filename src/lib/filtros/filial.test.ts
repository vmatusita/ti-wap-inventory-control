import { describe, expect, it } from 'vitest'
import {
  resolverFiliaisIds,
  resolverFiliaisSlugs,
  resolverFiliaisSlugsSemPadrao,
  type OperadorDoFiltro,
} from '@/lib/filtros/filial'
import {
  abaRelatorioPadrao,
  filtroFilialPadrao,
  type PapelUsuario,
} from '@/lib/auth/papeis'
import { selecaoFilialIds, selecaoFilialSlugs, ehVisaoConsolidado } from '@/lib/url-params'

// F25 — o filtro de filial: padrão por cargo + multi-seleção.
// Filiais 100% fictícias.

const ATIVAS = [1, 2, 3, 4]
const FILIAIS = [
  // Fora de ordem alfabética de propósito em nenhum caso: `listarFiliais()` já
  // entrega ordenado por NOME, e a regra da aba depende disso.
  { id: 1, slug: 'alfa', nome: 'Alfa' },
  { id: 2, slug: 'bravo', nome: 'Bravo' },
  { id: 3, slug: 'charlie', nome: 'Charlie' },
  { id: 4, slug: 'delta', nome: 'Delta' },
]

function op(papel: PapelUsuario, filiaisEscrita: number[] = []): OperadorDoFiltro {
  return { papel, filiaisEscrita }
}

describe('filtroFilialPadrao — os quatro cargos', () => {
  it('operador entra com TODAS as filiais vinculadas dele marcadas', () => {
    expect(filtroFilialPadrao('operador', [4, 2], ATIVAS)).toEqual([2, 4])
  })

  it('operador de uma filial só entra com ela', () => {
    expect(filtroFilialPadrao('operador', [3], ATIVAS)).toEqual([3])
  })

  it('dev, admin e consulta entram SEM recorte (todas)', () => {
    expect(filtroFilialPadrao('dev', [], ATIVAS)).toEqual([])
    expect(filtroFilialPadrao('admin', [], ATIVAS)).toEqual([])
    expect(filtroFilialPadrao('consulta', [], ATIVAS)).toEqual([])
  })

  it('admin com filiaisEscrita cheio (ele recebe todas) ainda assim NÃO recorta', () => {
    // `filiaisDeEscrita` devolve TODAS as ativas para o nível admin — se a regra
    // olhasse a lista em vez do cargo, o admin entraria "filtrado por todas", e o
    // botão Limpar/contagem passaria a mentir.
    expect(filtroFilialPadrao('admin', ATIVAS, ATIVAS)).toEqual([])
  })

  it('operador SEM vínculo cai em todas — e não numa lista sempre vazia', () => {
    // Usuário quebrado (vínculo nenhum, ou só em filial desativada). Recortar por
    // [] literal deixaria a tela permanentemente vazia sem explicar por quê.
    expect(filtroFilialPadrao('operador', [], ATIVAS)).toEqual([])
    expect(filtroFilialPadrao('operador', [99], ATIVAS)).toEqual([])
  })

  it('vínculo em filial DESATIVADA é descartado (só as ativas contam)', () => {
    expect(filtroFilialPadrao('operador', [2, 99], ATIVAS)).toEqual([2])
  })

  it('sem cargo (sem sessão) não recorta', () => {
    expect(filtroFilialPadrao(null, [], ATIVAS)).toEqual([])
    expect(filtroFilialPadrao(undefined, [1], ATIVAS)).toEqual([])
  })
})

describe('abaRelatorioPadrao — a aba em que /relatorios abre', () => {
  it('operador cai na PRIMEIRA filial vinculada em ordem alfabética de nome', () => {
    // Serra + Linhares do exemplo do Johnny: dá Linhares. Aqui, Bravo + Delta → Bravo.
    expect(abaRelatorioPadrao('operador', [4, 2], FILIAIS)).toBe('bravo')
  })

  it('a ordem vem da LISTA (já ordenada por nome), não da ordem dos vínculos', () => {
    expect(abaRelatorioPadrao('operador', [4, 3], FILIAIS)).toBe('charlie')
    expect(abaRelatorioPadrao('operador', [3, 4], FILIAIS)).toBe('charlie')
  })

  it('dev, admin e consulta caem no Consolidado', () => {
    expect(abaRelatorioPadrao('dev', [], FILIAIS)).toBe('geral')
    expect(abaRelatorioPadrao('admin', [], FILIAIS)).toBe('geral')
    expect(abaRelatorioPadrao('consulta', [], FILIAIS)).toBe('geral')
  })

  it('operador sem vínculo cai no Consolidado (não numa aba inexistente)', () => {
    expect(abaRelatorioPadrao('operador', [], FILIAIS)).toBe('geral')
  })

  it('não escreve no array de vínculos (ele é COMPARTILHADO por referência)', () => {
    const vinculos = [4, 2]
    abaRelatorioPadrao('operador', vinculos, FILIAIS)
    expect(vinculos).toEqual([4, 2])
  })
})

describe('selecaoFilialIds — o param `filial` como lista', () => {
  it('ausente/vazio = padrão do cargo', () => {
    expect(selecaoFilialIds(undefined)).toEqual({ modo: 'padrao' })
    expect(selecaoFilialIds(null)).toEqual({ modo: 'padrao' })
    expect(selecaoFilialIds('')).toEqual({ modo: 'padrao' })
    expect(selecaoFilialIds('  ')).toEqual({ modo: 'padrao' })
  })

  it('a sentinela `todas` é "sem recorte", distinguível da ausência', () => {
    expect(selecaoFilialIds('todas')).toEqual({ modo: 'todas' })
    expect(selecaoFilialIds('TODAS')).toEqual({ modo: 'todas' })
  })

  it('lista de ids', () => {
    expect(selecaoFilialIds('2,3')).toEqual({ modo: 'lista', valores: [2, 3] })
    expect(selecaoFilialIds(' 2 , 3 ')).toEqual({ modo: 'lista', valores: [2, 3] })
  })

  it('um id só continua valendo (retrocompatível com os links de KPI e do import)', () => {
    expect(selecaoFilialIds('3')).toEqual({ modo: 'lista', valores: [3] })
  })

  it('item inválido é DESCARTADO, sem derrubar a lista inteira', () => {
    expect(selecaoFilialIds('2,abc,3')).toEqual({ modo: 'lista', valores: [2, 3] })
    // > MAX_SMALLINT derrubaria a query com 22003.
    expect(selecaoFilialIds('2,99999')).toEqual({ modo: 'lista', valores: [2] })
    expect(selecaoFilialIds('0,-1,2')).toEqual({ modo: 'lista', valores: [2] })
  })

  it('lixo puro equivale a param ausente (cai no padrão do cargo)', () => {
    expect(selecaoFilialIds('abc')).toEqual({ modo: 'padrao' })
    expect(selecaoFilialIds(',,,')).toEqual({ modo: 'padrao' })
  })

  it('deduplica (entrada de usuário pode repetir à vontade)', () => {
    expect(selecaoFilialIds('3,3,3,2')).toEqual({ modo: 'lista', valores: [3, 2] })
  })

  it('a sentinela vence quando aparece misturada', () => {
    expect(selecaoFilialIds('2,todas')).toEqual({ modo: 'todas' })
  })

  it('teto de itens: `.in()` vai na URL do PostgREST', () => {
    const enorme = Array.from({ length: 500 }, (_, i) => String((i % 300) + 1)).join(',')
    const r = selecaoFilialIds(enorme)
    expect(r.modo).toBe('lista')
    if (r.modo === 'lista') expect(r.valores.length).toBeLessThanOrEqual(50)
  })
})

describe('selecaoFilialSlugs — a família que filtra por SLUG', () => {
  it('lista de slugs', () => {
    expect(selecaoFilialSlugs('linhares,serra')).toEqual({
      modo: 'lista',
      valores: ['linhares', 'serra'],
    })
  })

  it('aceita o slug composto e o valor especial `geral` de /relatorios/gerados', () => {
    expect(selecaoFilialSlugs('cd-afonso-pena,geral')).toEqual({
      modo: 'lista',
      valores: ['cd-afonso-pena', 'geral'],
    })
  })

  it('slug fora do formato é descartado', () => {
    expect(selecaoFilialSlugs('linhares,NÃO VALE,serra')).toEqual({
      modo: 'lista',
      valores: ['linhares', 'serra'],
    })
    expect(selecaoFilialSlugs('-inicio-com-hifen')).toEqual({ modo: 'padrao' })
  })

  it('a sentinela `todas` também vale aqui', () => {
    expect(selecaoFilialSlugs('todas')).toEqual({ modo: 'todas' })
  })
})

describe('resolverFiliaisIds — URL + cargo (o que a tela E o export usam)', () => {
  it('sem param: o operador entra recortado, o admin não', () => {
    expect(resolverFiliaisIds(undefined, op('operador', [2, 3]), ATIVAS)).toEqual([2, 3])
    expect(resolverFiliaisIds(undefined, op('admin'), ATIVAS)).toEqual([])
  })

  it('a sentinela devolve o operador a "todas"', () => {
    expect(resolverFiliaisIds('todas', op('operador', [2, 3]), ATIVAS)).toEqual([])
  })

  it('link EXPLÍCITO abre igual para qualquer cargo', () => {
    expect(resolverFiliaisIds('1,4', op('operador', [2, 3]), ATIVAS)).toEqual([1, 4])
    expect(resolverFiliaisIds('1,4', op('admin'), ATIVAS)).toEqual([1, 4])
    expect(resolverFiliaisIds('1,4', op('consulta'), ATIVAS)).toEqual([1, 4])
    expect(resolverFiliaisIds('1,4', null, ATIVAS)).toEqual([1, 4])
  })

  it('sem operador (viewer/sem sessão) não recorta', () => {
    expect(resolverFiliaisIds(undefined, null, ATIVAS)).toEqual([])
  })

  it('consulta sem vínculo nenhum NÃO explode nem recorta', () => {
    expect(resolverFiliaisIds(undefined, op('consulta', []), ATIVAS)).toEqual([])
  })
})

describe('resolverFiliaisSlugs — o padrão do cargo traduzido para slug', () => {
  it('operador entra com os slugs das filiais vinculadas', () => {
    expect(resolverFiliaisSlugs(undefined, op('operador', [2, 4]), FILIAIS)).toEqual([
      'bravo',
      'delta',
    ])
  })

  it('admin entra sem recorte', () => {
    expect(resolverFiliaisSlugs(undefined, op('admin'), FILIAIS)).toEqual([])
  })

  it('slug explícito passa mesmo fora da lista de ATIVAS (link antigo não muda de sentido)', () => {
    expect(resolverFiliaisSlugs('extinta', op('operador', [2]), FILIAIS)).toEqual(['extinta'])
  })
})

describe('resolverFiliaisSlugsSemPadrao — /relatorios/gerados (decisão §4.7)', () => {
  it('operador NÃO é recortado: o arquivo é global e tem os consolidados', () => {
    expect(resolverFiliaisSlugsSemPadrao(undefined)).toEqual([])
  })

  it('mas a seleção explícita continua valendo', () => {
    expect(resolverFiliaisSlugsSemPadrao('geral,bravo')).toEqual(['geral', 'bravo'])
  })
})

describe('ehVisaoConsolidado — o default de /itens inverteu', () => {
  it('só a sentinela explícita liga o Consolidado', () => {
    expect(ehVisaoConsolidado('consolidado')).toBe(true)
  })

  it('ausência e lixo caem na visão por filial (o padrão novo)', () => {
    expect(ehVisaoConsolidado(undefined)).toBe(false)
    expect(ehVisaoConsolidado(null)).toBe(false)
    expect(ehVisaoConsolidado('')).toBe(false)
    expect(ehVisaoConsolidado('qualquer-coisa')).toBe(false)
  })

  it('`visao=filiais` (favorito antigo) segue significando lado a lado', () => {
    expect(ehVisaoConsolidado('filiais')).toBe(false)
  })
})

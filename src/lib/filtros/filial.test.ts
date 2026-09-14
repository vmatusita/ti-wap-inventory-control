import { describe, expect, it } from 'vitest'
import {
  selecaoDeUnidades,
  selecaoDeUnidadesPorSlug,
  selecaoDeUnidadesSemPadrao,
  type OperadorDoFiltro,
  type SelecaoDeUnidades,
  type SelecaoDeUnidadesPorSlug,
} from '@/lib/filtros/filial'
import {
  abaRelatorioPadrao,
  unidadesMarcadasPorPadrao,
  type PapelUsuario,
} from '@/lib/auth/papeis'
import { efetivar, lerUnidades, recorteDe } from '@/lib/auth/recorte-leitura'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { selecaoFilialIds, selecaoFilialSlugs } from '@/lib/url-params'

// F25 — o filtro de filial: padrão por cargo + multi-seleção.
// F57 — as funções devolvem a SELEÇÃO (o modo passado adiante), não mais `[]` para "todas".
// Os casos abaixo são os MESMOS que existiam até a F57, com a expectativa escrita na forma
// nova: `[]` virou `TODAS`, `[2, 3]` virou `lista([2, 3])`. Nenhum foi removido.
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

const TODAS: SelecaoDeUnidades = { familia: 'id', modo: 'todas' }
const lista = (ids: number[]): SelecaoDeUnidades => ({ familia: 'id', modo: 'lista', ids })
const TODAS_SLUG: SelecaoDeUnidadesPorSlug = { familia: 'slug', modo: 'todas' }
const listaSlug = (slugs: string[], incluiSemUnidade = false): SelecaoDeUnidadesPorSlug => ({
  familia: 'slug',
  modo: 'lista',
  slugs,
  incluiSemUnidade,
})

function op(papel: PapelUsuario, escopoEscrita: number[] = []): OperadorDoFiltro {
  return { papel, escopoEscrita }
}

describe('unidadesMarcadasPorPadrao — os quatro cargos', () => {
  it('operador entra com TODAS as filiais vinculadas dele marcadas', () => {
    expect(unidadesMarcadasPorPadrao('operador', [4, 2], ATIVAS)).toEqual(lista([2, 4]))
  })

  it('operador de uma filial só entra com ela', () => {
    expect(unidadesMarcadasPorPadrao('operador', [3], ATIVAS)).toEqual(lista([3]))
  })

  it('dev, admin e consulta entram SEM recorte (todas)', () => {
    expect(unidadesMarcadasPorPadrao('dev', [], ATIVAS)).toEqual(TODAS)
    expect(unidadesMarcadasPorPadrao('admin', [], ATIVAS)).toEqual(TODAS)
    expect(unidadesMarcadasPorPadrao('consulta', [], ATIVAS)).toEqual(TODAS)
  })

  it('admin com escopoEscrita cheio (ele recebe todas) ainda assim NÃO recorta', () => {
    // `escopoDeEscrita` devolve TODAS as ativas para o nível admin — se a regra
    // olhasse a lista em vez do cargo, o admin entraria "filtrado por todas", e o
    // botão Limpar/contagem passaria a mentir.
    expect(unidadesMarcadasPorPadrao('admin', ATIVAS, ATIVAS)).toEqual(TODAS)
  })

  it('operador SEM vínculo cai em todas — e não numa lista sempre vazia', () => {
    // Usuário quebrado (vínculo nenhum, ou só em filial desativada). Recortar por
    // lista vazia deixaria a tela permanentemente vazia sem explicar por quê.
    expect(unidadesMarcadasPorPadrao('operador', [], ATIVAS)).toEqual(TODAS)
    expect(unidadesMarcadasPorPadrao('operador', [99], ATIVAS)).toEqual(TODAS)
  })

  it('vínculo em filial DESATIVADA é descartado (só as ativas contam)', () => {
    expect(unidadesMarcadasPorPadrao('operador', [2, 99], ATIVAS)).toEqual(lista([2]))
  })

  it('sem cargo (sem sessão) não recorta', () => {
    expect(unidadesMarcadasPorPadrao(null, [], ATIVAS)).toEqual(TODAS)
    expect(unidadesMarcadasPorPadrao(undefined, [1], ATIVAS)).toEqual(TODAS)
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

describe('selecaoDeUnidades — URL + cargo (o que a tela E o export usam)', () => {
  it('sem param: o operador entra recortado, o admin não', () => {
    expect(selecaoDeUnidades(undefined, op('operador', [2, 3]), ATIVAS)).toEqual(lista([2, 3]))
    expect(selecaoDeUnidades(undefined, op('admin'), ATIVAS)).toEqual(TODAS)
  })

  it('a sentinela devolve o operador a "todas"', () => {
    expect(selecaoDeUnidades('todas', op('operador', [2, 3]), ATIVAS)).toEqual(TODAS)
  })

  it('link EXPLÍCITO abre igual para qualquer cargo', () => {
    expect(selecaoDeUnidades('1,4', op('operador', [2, 3]), ATIVAS)).toEqual(lista([1, 4]))
    expect(selecaoDeUnidades('1,4', op('admin'), ATIVAS)).toEqual(lista([1, 4]))
    expect(selecaoDeUnidades('1,4', op('consulta'), ATIVAS)).toEqual(lista([1, 4]))
    expect(selecaoDeUnidades('1,4', null, ATIVAS)).toEqual(lista([1, 4]))
  })

  it('sem operador (viewer/sem sessão) não recorta', () => {
    expect(selecaoDeUnidades(undefined, null, ATIVAS)).toEqual(TODAS)
  })

  it('consulta sem vínculo nenhum NÃO explode nem recorta', () => {
    expect(selecaoDeUnidades(undefined, op('consulta', []), ATIVAS)).toEqual(TODAS)
  })

  it('id de filial fora das ATIVAS passa assim mesmo (o link antigo não muda de sentido)', () => {
    // A família por slug já tinha este caso; a família por id não tinha — lacuna medida na F57.
    expect(selecaoDeUnidades('99', op('operador', [2]), ATIVAS)).toEqual(lista([99]))
  })
})

describe('selecaoDeUnidadesPorSlug — o padrão do cargo traduzido para slug', () => {
  it('operador entra com os slugs das filiais vinculadas', () => {
    expect(selecaoDeUnidadesPorSlug(undefined, op('operador', [2, 4]), FILIAIS)).toEqual(
      listaSlug(['bravo', 'delta']),
    )
  })

  it('admin entra sem recorte', () => {
    expect(selecaoDeUnidadesPorSlug(undefined, op('admin'), FILIAIS)).toEqual(TODAS_SLUG)
  })

  it('slug explícito passa mesmo fora da lista de ATIVAS (link antigo não muda de sentido)', () => {
    expect(selecaoDeUnidadesPorSlug('extinta', op('operador', [2]), FILIAIS)).toEqual(
      listaSlug(['extinta']),
    )
  })

  it('em /pendencias o slug do Consolidado é um slug como outro qualquer (não liga o terceiro valor)', () => {
    expect(selecaoDeUnidadesPorSlug('geral', op('admin'), FILIAIS)).toEqual(listaSlug(['geral']))
  })
})

describe('selecaoDeUnidadesSemPadrao — /relatorios/gerados (decisão §4.7)', () => {
  it('operador NÃO é recortado: o arquivo é global e tem os consolidados', () => {
    expect(selecaoDeUnidadesSemPadrao(undefined)).toEqual(TODAS_SLUG)
  })

  it('mas a seleção explícita continua valendo — e o Consolidado vira o terceiro valor', () => {
    expect(selecaoDeUnidadesSemPadrao('geral,bravo')).toEqual(listaSlug(['bravo'], true))
    expect(selecaoDeUnidadesSemPadrao('geral')).toEqual(listaSlug([], true))
    expect(selecaoDeUnidadesSemPadrao('bravo')).toEqual(listaSlug(['bravo']))
  })

  it('a sentinela é "todas", igual à ausência', () => {
    expect(selecaoDeUnidadesSemPadrao('todas')).toEqual(TODAS_SLUG)
  })
})

describe('F57 — os três casos-limite da ficha, no nível do módulo', () => {
  const universal = recorteDe(null)

  it('caso 1 — o consolidado (filial_id is null) sobrevive em /relatorios/gerados', () => {
    expect(lerUnidades(efetivar(universal, selecaoDeUnidadesSemPadrao(undefined)))).toEqual({
      modo: 'todas',
    })
    expect(lerUnidades(efetivar(universal, selecaoDeUnidadesSemPadrao('geral')))).toEqual({
      modo: 'somente-sem-unidade',
    })
    expect(lerUnidades(efetivar(universal, selecaoDeUnidadesSemPadrao('geral,bravo')))).toEqual({
      modo: 'lista',
      valores: ['bravo'],
      incluiSemUnidade: true,
    })
  })

  it('caso 2 — a filial DESATIVADA continua recortando, por id e por slug', () => {
    const operador = op('operador', [2])
    expect(lerUnidades(efetivar(universal, selecaoDeUnidades('99', operador, ATIVAS)))).toEqual({
      modo: 'lista',
      valores: [99],
      incluiSemUnidade: false,
    })
    expect(
      lerUnidades(efetivar(universal, selecaoDeUnidadesPorSlug('extinta', operador, FILIAIS))),
    ).toEqual({ modo: 'lista', valores: ['extinta'], incluiSemUnidade: false })
  })

  it('caso 3 — o operador sem vínculo cai em "todas", e NUNCA em "nenhuma"', () => {
    for (const vinculos of [[], [99]]) {
      const quebrado = op('operador', vinculos)
      expect(lerUnidades(efetivar(universal, selecaoDeUnidades(undefined, quebrado, ATIVAS)))).toEqual(
        { modo: 'todas' },
      )
      expect(
        lerUnidades(efetivar(universal, selecaoDeUnidadesPorSlug(undefined, quebrado, FILIAIS))),
      ).toEqual({ modo: 'todas' })
    }
  })
})

describe('F57 — a convenção `[]` morreu: nenhuma seleção é lista vazia querendo dizer "todas"', () => {
  it('toda seleção em modo lista tem o que listar (ou pede o consolidado, por nome)', () => {
    const params = [undefined, '', 'todas', '2', '1,4', 'abc', '99999', 'bravo', 'geral', 'geral,bravo']
    const operadores: OperadorDoFiltro[] = [
      null,
      op('dev'),
      op('admin', ATIVAS),
      op('operador'),
      op('operador', [2]),
      op('operador', [99]),
      op('consulta'),
    ]
    for (const p of params) {
      for (const o of operadores) {
        const porId = selecaoDeUnidades(p, o, ATIVAS)
        if (porId.modo === 'lista') expect(porId.ids.length).toBeGreaterThan(0)
        const porSlug = selecaoDeUnidadesPorSlug(p, o, FILIAIS)
        if (porSlug.modo === 'lista') expect(porSlug.slugs.length).toBeGreaterThan(0)
      }
      const semPadrao = selecaoDeUnidadesSemPadrao(p)
      if (semPadrao.modo === 'lista') {
        expect(semPadrao.slugs.length > 0 || semPadrao.incluiSemUnidade).toBe(true)
      }
    }
  })
})

describe('a visao de /itens NAO existe mais (F42)', () => {
  it('o param "visao" deixou de ter parser — o toggle morreu com a tela antiga', () => {
    // A REGRA MUDOU. `ehVisaoConsolidado` escolhia entre as DUAS tabelas de
    // `/itens`, e a F42 deixou UMA só: a comparação entre filiais virou a linha
    // expansível de cada item. Este teste substitui os três que provavam o default
    // invertido da F25 — eles não foram afrouxados; o objeto que eles descreviam
    // deixou de existir (ata em `docs/DECISOES.md`, 31/08/2026).
    //
    // O que continua verdadeiro, e agora é o que importa: uma URL antiga com
    // `?visao=` NÃO quebra. O param vira ruído ignorado, a rota responde 200, e o
    // smoke cobre as duas sentinelas. A guarda de que ninguém o ressuscita está em
    // `src/lib/actions/exportar-filtros.test.ts`.
    const fonte = readFileSync(join(process.cwd(), 'src', 'lib', 'url-params.ts'), 'utf8')
    expect(fonte).not.toContain('export function ehVisaoConsolidado')
  })
})

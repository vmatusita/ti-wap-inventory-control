import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { semComentarios } from '@/lib/layout/texto-fonte'
import {
  destinoHistoricoLegado,
  emUsoDoSaldo,
  filtrarSaldos,
  ordenarSaldos,
  paginarLinhas,
  rotuloSubtituloItens,
  saldoDoParPorItem,
  saldoDoRecorte,
  type NumerosDoItem,
} from '@/lib/itens/lista'
import { efetivar, recorteDe, type RecorteDeLeitura } from '@/lib/auth/recorte-leitura'

// F57 — o recorte chega como `UnidadesEfetivas`. `TODAS` e `marcadas` são as duas formas que a
// tela produz hoje; o recorte RESTRITO abaixo é o que a virada produzirá.
const TODAS = efetivar(recorteDe(null), { familia: 'id', modo: 'todas' })
const marcadas = (ids: number[]) =>
  efetivar(recorteDe(null), { familia: 'id', modo: 'lista', ids })

// A REPRODUÇÃO EM TS DA RPC — só para o teste, nunca para a tela.
//
// `rel_saldo_itens` (0027) calcula `liberados` e o esconde. Aqui reconstruímos as
// quatro colunas A PARTIR das três grandezas cruas, exatamente como o SQL faz, e
// provamos que a derivação da tela devolve `liberados` de volta. Se um dia a RPC
// mudar de fórmula, é este helper que tem de mudar junto — e aí o teste acusa.
function colunasDaRpc(total: number, atrelados: number, liberados: number): NumerosDoItem {
  return {
    total: Math.max(0, total),
    atrelados,
    estoque: Math.max(0, total - atrelados - liberados),
    falta: Math.max(0, atrelados + liberados - total),
  }
}

describe('emUsoDoSaldo — a coluna que a F41 batizou e a F42 derivou', () => {
  it('devolve `liberados` no ramo COM estoque (falta = 0)', () => {
    // 10 no acervo, 0 reservados, 3 com as pessoas → 7 na prateleira, 0 de falta.
    const s = colunasDaRpc(10, 0, 3)
    expect(s).toEqual({ total: 10, atrelados: 0, estoque: 7, falta: 0 })
    expect(emUsoDoSaldo(s)).toBe(3)
  })

  it('devolve `liberados` no ramo COM falta (estoque = 0)', () => {
    // 2 no acervo, 1 reservado, 4 com as pessoas → prateleira 0, falta 3.
    const s = colunasDaRpc(2, 1, 4)
    expect(s).toEqual({ total: 2, atrelados: 1, estoque: 0, falta: 3 })
    expect(emUsoDoSaldo(s)).toBe(4)
  })

  it('devolve `liberados` na FRONTEIRA, onde estoque e falta são os dois zero', () => {
    const s = colunasDaRpc(5, 2, 3)
    expect(s).toEqual({ total: 5, atrelados: 2, estoque: 0, falta: 0 })
    expect(emUsoDoSaldo(s)).toBe(3)
  })

  it('devolve zero quando nada saiu', () => {
    expect(emUsoDoSaldo(colunasDaRpc(0, 0, 0))).toBe(0)
    expect(emUsoDoSaldo(colunasDaRpc(12, 0, 0))).toBe(0)
    expect(emUsoDoSaldo({ total: 0, estoque: 0, atrelados: 0, falta: 0 })).toBe(0)
  })

  it('a identidade vale para TODA combinação plausível — varredura', () => {
    for (let total = 0; total <= 8; total++) {
      for (let atrelados = 0; atrelados <= 8; atrelados++) {
        for (let liberados = 0; liberados <= 8; liberados++) {
          const s = colunasDaRpc(total, atrelados, liberados)
          expect(
            emUsoDoSaldo(s),
            `total=${total} atrelados=${atrelados} liberados=${liberados}`,
          ).toBe(liberados)
        }
      }
    }
  })

  it('a derivação nunca fica negativa no domínio que o trigger garante', () => {
    for (let total = 0; total <= 6; total++) {
      for (let atrelados = 0; atrelados <= 6; atrelados++) {
        for (let liberados = 0; liberados <= 6; liberados++) {
          expect(emUsoDoSaldo(colunasDaRpc(total, atrelados, liberados))).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('é ADITIVA por filial — a soma das filiais bate com o consolidado', () => {
    // Duas filiais, mesmo item. `liberados` é contador linear por filial: não há
    // agrupamento por chamado (isso só existe em `atrelados`), então soma direto.
    const a = colunasDaRpc(4, 0, 1)
    const b = colunasDaRpc(6, 0, 2)
    const consolidado = colunasDaRpc(10, 0, 3)
    expect(emUsoDoSaldo(a) + emUsoDoSaldo(b)).toBe(emUsoDoSaldo(consolidado))
  })
})

describe('saldoDoParPorItem — o insumo da prévia da regularização', () => {
  it('monta { emEstoque, emUso } por item, com o emUso derivado', () => {
    const mapa = saldoDoParPorItem([
      { item_id: 7, ...colunasDaRpc(10, 0, 3) },
      { item_id: 9, ...colunasDaRpc(0, 0, 0) },
    ])
    expect(mapa[7]).toEqual({ emEstoque: 7, emUso: 3 })
    expect(mapa[9]).toEqual({ emEstoque: 0, emUso: 0 })
    expect(mapa[999]).toBeUndefined()
  })
})

describe('saldoDoRecorte — uma leitura alimenta a tabela e a linha expansível', () => {
  const linha = {
    porFilial: {
      1: colunasDaRpc(4, 0, 1),
      2: colunasDaRpc(6, 0, 2),
    },
    // 11, e não 10: uma filial DESATIVADA guarda 1 unidade. É o caso que
    // `estoqueForaDasColunas` denuncia — e o motivo de o consolidado não ser a
    // soma das colunas.
    consolidado: colunasDaRpc(11, 0, 3),
  }

  it('sem recorte, usa o consolidado da RPC (que enxerga filial desativada)', () => {
    expect(saldoDoRecorte(linha, TODAS)).toEqual(linha.consolidado)
    expect(saldoDoRecorte(linha, TODAS).total).toBe(11)
  })

  it('com recorte, soma célula a célula as filiais marcadas', () => {
    expect(saldoDoRecorte(linha, marcadas([1]))).toEqual(colunasDaRpc(4, 0, 1))
    const duas = saldoDoRecorte(linha, marcadas([1, 2]))
    expect(duas).toEqual({ total: 10, estoque: 7, atrelados: 0, falta: 0 })
    expect(emUsoDoSaldo(duas)).toBe(3)
  })

  it('filial sem saldo daquele item entra como zero, sem estourar', () => {
    expect(saldoDoRecorte(linha, marcadas([1, 99]))).toEqual(colunasDaRpc(4, 0, 1))
    expect(saldoDoRecorte(linha, marcadas([99]))).toEqual({
      total: 0,
      estoque: 0,
      atrelados: 0,
      falta: 0,
    })
  })

  it('nao muta a linha de origem', () => {
    const antes = JSON.stringify(linha)
    saldoDoRecorte(linha, marcadas([1, 2]))
    expect(JSON.stringify(linha)).toBe(antes)
  })

  it('F57 — a interseção VAZIA soma zero, e nunca devolve o consolidado', () => {
    // O fail-open da convenção antiga, em memória: um recorte que não alcança a filial pedida
    // esvaziava a lista, a lista vazia virava "sem recorte", e a tela mostrava o total da TI
    // inteira. Com a vista, a interseção vazia é `nenhuma` — e soma nada.
    const restrito: RecorteDeLeitura = {
      alcance: 'restrito',
      unidades: [{ id: 1, slug: 'alfa' }],
      alcancaSemUnidade: false,
    }
    const vazia = efetivar(restrito, { familia: 'id', modo: 'lista', ids: [2] })
    expect(saldoDoRecorte(linha, vazia)).toEqual({ total: 0, estoque: 0, atrelados: 0, falta: 0 })
    expect(saldoDoRecorte(linha, vazia)).not.toEqual(linha.consolidado)
  })
})

describe('filtrarSaldos e ordenarSaldos', () => {
  const linhas = [
    { item: 'Mouse sem fio', grupo: 'acessorio' as const, ordem: 2 },
    { item: 'Memória RAM 8GB', grupo: 'componente' as const, ordem: 1 },
    { item: 'Carregador USB-C', grupo: 'acessorio' as const, ordem: 1 },
  ]

  it('sem filtro devolve tudo', () => {
    expect(filtrarSaldos(linhas, {})).toHaveLength(3)
  })

  it('busca por nome ignora caixa e casa por trecho', () => {
    expect(filtrarSaldos(linhas, { q: 'MOUSE' }).map((l) => l.item)).toEqual(['Mouse sem fio'])
    expect(filtrarSaldos(linhas, { q: '  usb ' }).map((l) => l.item)).toEqual(['Carregador USB-C'])
    expect(filtrarSaldos(linhas, { q: 'nao existe' })).toEqual([])
  })

  it('recorta por grupo, e combina com a busca', () => {
    expect(filtrarSaldos(linhas, { grupo: 'componente' }).map((l) => l.item)).toEqual([
      'Memória RAM 8GB',
    ])
    expect(filtrarSaldos(linhas, { grupo: 'acessorio', q: 'mouse' })).toHaveLength(1)
    expect(filtrarSaldos(linhas, { grupo: 'componente', q: 'mouse' })).toEqual([])
  })

  it('ordena por grupo, depois ordem do catalogo, depois nome', () => {
    expect(ordenarSaldos(linhas).map((l) => l.item)).toEqual([
      'Carregador USB-C',
      'Mouse sem fio',
      'Memória RAM 8GB',
    ])
  })

  it('ordenar nao muta a lista de origem', () => {
    const copia = [...linhas]
    ordenarSaldos(linhas)
    expect(linhas).toEqual(copia)
  })
})

describe('paginarLinhas — a paginacao passa a paginar os ITENS', () => {
  const linhas = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }))

  it('devolve a fatia da pagina pedida', () => {
    expect(paginarLinhas(linhas, 1, 3)).toEqual({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      page: 1,
      pageSize: 3,
      total: 7,
    })
    expect(paginarLinhas(linhas, 3, 3).rows).toEqual([{ id: 7 }])
  })

  it('pagina alem do fim CAI na ultima existente (nunca lista vazia)', () => {
    const r = paginarLinhas(linhas, 99, 3)
    expect(r.page).toBe(3)
    expect(r.rows).toEqual([{ id: 7 }])
  })

  it('lista vazia devolve pagina 1, sem divisao por zero', () => {
    expect(paginarLinhas([], 5, 25)).toEqual({ rows: [], page: 1, pageSize: 25, total: 0 })
  })

  it('pagina e tamanho invalidos caem no padrao, sem derrubar', () => {
    expect(paginarLinhas(linhas, 0, 3).page).toBe(1)
    expect(paginarLinhas(linhas, -4, 3).page).toBe(1)
    expect(paginarLinhas(linhas, 1.5, 3).page).toBe(1)
    expect(paginarLinhas(linhas, 1, 0).pageSize).toBe(50)
    expect(paginarLinhas(linhas, 1, -2).rows).toHaveLength(7)
  })
})

describe('rotuloSubtituloItens', () => {
  it('diz o catalogo inteiro quando nao ha recorte', () => {
    expect(rotuloSubtituloItens({ total: 22, temFiltro: false, temRecorteFilial: false })).toBe(
      '22 itens no catálogo',
    )
  })

  it('singular quando e um so', () => {
    expect(rotuloSubtituloItens({ total: 1, temFiltro: false, temRecorteFilial: false })).toBe(
      '1 item no catálogo',
    )
  })

  it('o filtro tem precedencia sobre o recorte do cargo', () => {
    expect(rotuloSubtituloItens({ total: 3, temFiltro: true, temRecorteFilial: true })).toBe(
      '3 itens nestes filtros',
    )
    expect(rotuloSubtituloItens({ total: 3, temFiltro: false, temRecorteFilial: true })).toBe(
      '3 itens nas suas filiais',
    )
  })
})

describe('destinoHistoricoLegado — o favorito antigo nao vira tela errada', () => {
  // O helper ainda aceita querystring por comodidade de escrita, mas o que ele
  // entrega à função é o OBJETO — a mesma forma que o Server Component monta com
  // acessos nominais. Ver o comentário de `ParamsLegadoDeItens`: a versão anterior
  // recebia `URLSearchParams` e escondeu, atrás de um teste verde, um wiring que
  // nunca disparou em produção.
  const destino = (qs: string) => {
    const p = new URLSearchParams(qs)
    return destinoHistoricoLegado({
      item: p.get('item') ?? undefined,
      tipo: p.get('tipo') ?? undefined,
      de: p.get('de') ?? undefined,
      ate: p.get('ate') ?? undefined,
      busca: p.get('busca') ?? undefined,
      filial: p.get('filial') ?? undefined,
      page: p.get('page') ?? undefined,
    })
  }

  it('URL de saldos nao redireciona', () => {
    expect(destino('')).toBeNull()
    expect(destino('q=mouse&grupo=acessorio&filial=2&page=2')).toBeNull()
    // `?visao=` virou ruido: nao redireciona, nao quebra, so nao significa nada.
    expect(destino('visao=consolidado')).toBeNull()
    expect(destino('visao=filiais')).toBeNull()
  })

  it('qualquer param SO do historico leva para a rota nova', () => {
    expect(destino('tipo=saida')).toBe('/itens/historico?tipo=saida')
    expect(destino('item=12')).toBe('/itens/historico?item=12')
    expect(destino('de=2026-08-01')).toBe('/itens/historico?de=2026-08-01')
    expect(destino('ate=2026-08-31')).toBe('/itens/historico?ate=2026-08-31')
    expect(destino('busca=Fulano')).toBe('/itens/historico?busca=Fulano')
  })

  it('preserva o recorte inteiro, inclusive filial e pagina', () => {
    expect(destino('item=12&tipo=saida&de=2026-08-01&ate=2026-08-31&filial=2&page=3')).toBe(
      '/itens/historico?item=12&tipo=saida&de=2026-08-01&ate=2026-08-31&filial=2&page=3',
    )
  })

  it('NAO leva o `q` — ele e o filtro de SALDOS, nao a busca do historico', () => {
    const url = destino('tipo=saida&q=mouse')
    expect(url).toBe('/itens/historico?tipo=saida')
    expect(url).not.toContain('q=')
  })

  it('o desvio do link antigo mora no PROXY, e nao na pagina', () => {
    // GUARDA DE REGRESSÃO, escrita depois de o defeito acontecer em PRODUÇÃO.
    //
    // O desvio nasceu dentro de `itens/page.tsx`, e o smoke pós-deploy o pegou:
    // `HTTP 200 sem o conteúdo esperado`. A instrumentação mostrou por quê — o
    // segmento `/itens` tem `loading.tsx`, então a rota é servida em STREAM: o Next
    // manda **200 com o esqueleto** assim que a navegação começa, e um `redirect()`
    // disparado depois disso vai DENTRO do payload RSC (`NEXT_REDIRECT` presente no
    // corpo, status 200). O navegador obedece; um cliente sem JS, um `curl` e o
    // smoke, não — e a resposta que chega ao mundo continua sendo a tela errada.
    //
    // No proxy o desvio acontece ANTES de qualquer render: 307 de verdade.
    // Redirecionar rota legada é assunto de ROTEAMENTO.
    //
    // É guarda de TEXTO-FONTE porque a propriedade é do CÓDIGO, não do
    // comportamento — o molde de `consistencia.test.ts` e `sidebar-colapso.test.ts`.
    const proxy = semComentarios(
      readFileSync(join(process.cwd(), 'src', 'lib', 'supabase', 'proxy.ts'), 'utf8'),
    )
    expect(
      proxy.includes('destinoHistoricoLegado'),
      'o proxy parou de desviar o link antigo do historico — ele voltaria a abrir os ' +
        'saldos ignorando o recorte, em silencio',
    ).toBe(true)
    // E os sete params continuam sendo lidos, um a um, pelo nome.
    for (const nome of ['item', 'tipo', 'de', 'ate', 'busca', 'filial', 'page']) {
      expect(
        proxy.includes(`p.get('${nome}')`),
        `o proxy nao le "${nome}" — o redirecionamento do link antigo perde esse param`,
      ).toBe(true)
    }

    const pagina = semComentarios(
      readFileSync(join(process.cwd(), 'src', 'app', '(app)', 'itens', 'page.tsx'), 'utf8'),
    )
    expect(
      pagina.includes('destinoHistoricoLegado'),
      'itens/page.tsx voltou a desviar o link antigo — de la o redirect NAO vira ' +
        'status, porque o segmento tem loading.tsx e a rota e servida em stream',
    ).toBe(false)
  })

  it('param vazio nao conta como filtro do historico', () => {
    expect(destino('tipo=')).toBeNull()
    expect(destino('busca=%20%20')).toBeNull()
    expect(destino('item=&q=mouse')).toBeNull()
  })
})

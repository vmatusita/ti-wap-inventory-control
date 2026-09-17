import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { idsDeFiliais, listaDoConsolidado } from './filiais-da-matriz'

// As listas de filiais das células do conferidor — revisão do lote 1 da F60 (revisor 3, achado 4). Sem banco.
//
// O defeito medido por leitura: a célula "consolidado" da matriz `filiais` recebia `p_filiais: []` quando
// a leitura de filiais falhava, lia zero linhas por construção e saía VERDE. Esta suíte prende a régua
// nova (erro, lista truncada e consolidado vazio lançam) e prende `conferir.mts` a ela — o script fala
// com o banco no topo do arquivo e não se importa num teste, então a ligação é conferida no TEXTO.
// Ids 100% fictícios. Lê o disco na COLETA, nunca dentro do `it`.

const CONFERIR = readFileSync(join(process.cwd(), 'scripts', 'formas', 'conferir.mts'), 'utf8')

const ok = (ids: number[], count: number | null = ids.length) => ({ data: ids.map((id) => ({ id })), error: null, count })

describe('idsDeFiliais — a lista das células por filial', () => {
  it('devolve os ids lidos, na ordem da consulta', () => {
    expect(idsDeFiliais(ok([3, 7, 9]), 'x')).toEqual([3, 7, 9])
  })

  it('LANÇA quando a leitura falhou — nunca vira lista vazia', () => {
    expect(() => idsDeFiliais({ data: null, error: { code: 'PGRST301' }, count: null }, 'as filiais ativas')).toThrow(
      'as filiais ativas: a leitura de filiais falhou (PGRST301)',
    )
  })

  it('LANÇA quando o `count` exato não veio ou não bate com as linhas (o corte do `max-rows`)', () => {
    expect(() => idsDeFiliais(ok([1, 2], null), 'x')).toThrow('x: 2 de ? filiais lidas')
    expect(() => idsDeFiliais({ data: [{ id: 1 }], error: null }, 'x')).toThrow('x: 1 de ? filiais lidas')
    expect(() => idsDeFiliais(ok([1, 2], 3), 'x')).toThrow('x: 2 de 3 filiais lidas')
  })

  it('lista vazia com `count` 0 é um fato do alvo para as células por filial — não lança', () => {
    expect(idsDeFiliais(ok([]), 'x')).toEqual([])
  })

  it('a mensagem traz contagem e código, nunca um id', () => {
    let mensagem = ''
    try {
      idsDeFiliais(ok([4242, 4343], 5), 'x')
    } catch (e) {
      mensagem = (e as Error).message
    }
    expect(mensagem).toContain('2 de 5 filiais lidas')
    expect(mensagem).not.toMatch(/4242|4343/)
  })
})

describe('listaDoConsolidado — a lista de TODAS, que não existe vazia', () => {
  it('devolve os ids quando há ao menos uma filial', () => {
    expect(listaDoConsolidado(ok([1, 2, 3]), 'x')).toEqual([1, 2, 3])
  })

  it('LANÇA com a lista vazia: `p_filiais: []` dá zero linhas por construção e o ponto sairia verde', () => {
    expect(() => listaDoConsolidado(ok([]), 'o consolidado')).toThrow('o consolidado: nenhuma filial no alvo')
  })

  it('LANÇA na falha de leitura, como `idsDeFiliais` — o modo de falha que o achado mediu', () => {
    expect(() => listaDoConsolidado({ data: null, error: { code: '57014' }, count: null }, 'o consolidado')).toThrow(/a leitura de filiais falhou \(57014\)/)
  })
})

describe('conferir.mts usa a régua — as duas leituras que montam células', () => {
  it('as filiais ativas passam por `idsDeFiliais`, e o consolidado por `listaDoConsolidado`, com `count` exato', () => {
    const semEspaco = CONFERIR.replace(/\s+/g, '')
    expect(semEspaco).toContain("filiaisAtivas=idsDeFiliais(awaitdb.from('filiais').select('id',{count:'exact'}).eq('ativo',true).order('id')")
    expect(semEspaco).toContain("todasAsFiliais=listaDoConsolidado(awaitdb.from('filiais').select('id',{count:'exact'}).order('id')")
  })

  it('nenhuma leitura de `filiais` descarta o `error` com `.data ?? []`', () => {
    expect(CONFERIR).not.toMatch(/from\('filiais'\)[^\n]*\)\)\.data\s*\?\?\s*\[\]/)
  })

  it('a falha das listas RECUSA a rodada (sai pelo `recusar`, não segue com lista vazia)', () => {
    expect(CONFERIR.replace(/\s+/g, '')).toMatch(/listaDoConsolidado\([^;]*\)\}catch\(e\)\{recusar\(\(easError\)\.message\)\}/)
  })
})

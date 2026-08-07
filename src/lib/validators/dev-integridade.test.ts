import { describe, expect, it } from 'vitest'
import {
  DESCRICAO_CHECAGEM_DESCONHECIDA,
  juntarCatalogoComResultados,
  type CatalogoChecagem,
  type ResultadoChecagemRpc,
} from '@/lib/validators/dev-integridade'

// Testes da junção pura da Integridade (F27/B8, DEV-01). O que se cobre aqui é exatamente o que
// quebrou em silêncio antes da correção: uma chave que a RPC devolve e o catálogo não conhece
// sendo descartada em vez de aparecer no fim da lista — a REDE PERMANENTE.

const CATALOGO: CatalogoChecagem[] = [
  { chave: 'patrimonio_duplicado', nome: 'Patrimônio duplicado', descricao: 'desc 1' },
  { chave: 'ativo_filial_inativa', nome: 'Ativo em filial desativada', descricao: 'desc 2' },
]

describe('juntarCatalogoComResultados', () => {
  it('casa cada chave do catálogo com o resultado dela, na ordem do catálogo', () => {
    const resultados: ResultadoChecagemRpc[] = [
      { chave: 'ativo_filial_inativa', total: 0, amostra: [] },
      { chave: 'patrimonio_duplicado', total: 3, amostra: ['WAP0001234 / — (Matriz)'] },
    ]
    const r = juntarCatalogoComResultados(CATALOGO, resultados)

    expect(r.map((c) => c.chave)).toEqual(['patrimonio_duplicado', 'ativo_filial_inativa'])
    expect(r[0]).toMatchObject({
      achados: 3,
      amostra: ['WAP0001234 / — (Matriz)'],
      erro: null,
    })
    expect(r[1]).toMatchObject({ achados: 0, amostra: [], erro: null })
  })

  it('marca "não encontrada" quando a RPC não devolveu a chave do catálogo', () => {
    const r = juntarCatalogoComResultados(CATALOGO, [
      { chave: 'patrimonio_duplicado', total: 0, amostra: [] },
      // 'ativo_filial_inativa' ausente da resposta.
    ])

    const semResultado = r.find((c) => c.chave === 'ativo_filial_inativa')
    expect(semResultado).toMatchObject({ achados: null, amostra: [], erro: 'Checagem não encontrada no banco.' })
  })

  it('trata amostra null (RPC sem achado) como lista vazia', () => {
    const r = juntarCatalogoComResultados(CATALOGO, [
      { chave: 'patrimonio_duplicado', total: 0, amostra: null },
      { chave: 'ativo_filial_inativa', total: 0, amostra: null },
    ])
    expect(r[0].amostra).toEqual([])
    expect(r[1].amostra).toEqual([])
  })

  // REDE PERMANENTE — a garantia central desta função (ver cabeçalho de dev-integridade.ts).
  it('anexa ao FIM da lista qualquer chave que a RPC devolva e o catálogo não conheça', () => {
    const resultados: ResultadoChecagemRpc[] = [
      { chave: 'patrimonio_duplicado', total: 0, amostra: [] },
      { chave: 'ativo_filial_inativa', total: 0, amostra: [] },
      { chave: 'arquivo_termo_orfao', total: 3, amostra: ['termos/abc.docx'] },
      { chave: 'conflito_entre_filiais', total: 1, amostra: ['WAP0009999'] },
    ]
    const r = juntarCatalogoComResultados(CATALOGO, resultados)

    expect(r.map((c) => c.chave)).toEqual([
      'patrimonio_duplicado',
      'ativo_filial_inativa',
      'arquivo_termo_orfao',
      'conflito_entre_filiais',
    ])
    // As desconhecidas mantêm a ORDEM em que a RPC as devolveu, não a alfabética.
    expect(r[2]).toMatchObject({
      chave: 'arquivo_termo_orfao',
      nome: 'arquivo_termo_orfao',
      descricao: DESCRICAO_CHECAGEM_DESCONHECIDA,
      achados: 3,
      amostra: ['termos/abc.docx'],
      erro: null,
    })
    expect(r[3].nome).toBe('conflito_entre_filiais')
  })

  it('uma chave desconhecida com zero achados continua VISÍVEL (não é descartada por achar zero)', () => {
    const r = juntarCatalogoComResultados(CATALOGO, [
      { chave: 'patrimonio_duplicado', total: 0, amostra: [] },
      { chave: 'ativo_filial_inativa', total: 0, amostra: [] },
      { chave: 'checagem_nova_zerada', total: 0, amostra: [] },
    ])
    expect(r).toHaveLength(3)
    expect(r[2]).toMatchObject({ chave: 'checagem_nova_zerada', achados: 0, erro: null })
  })

  it('catálogo vazio: a lista final é só as desconhecidas, na ordem da RPC', () => {
    const r = juntarCatalogoComResultados([], [
      { chave: 'x', total: 1, amostra: [] },
      { chave: 'y', total: 2, amostra: [] },
    ])
    expect(r.map((c) => c.chave)).toEqual(['x', 'y'])
  })

  it('RPC vazia: todo item do catálogo sai como "não encontrada", nenhuma desconhecida', () => {
    const r = juntarCatalogoComResultados(CATALOGO, [])
    expect(r).toHaveLength(2)
    expect(r.every((c) => c.erro === 'Checagem não encontrada no banco.')).toBe(true)
  })
})

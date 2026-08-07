import { describe, expect, it } from 'vitest'
import {
  MAX_ATIVOS_RECENTES,
  ehAtivoRecente,
  inserirRecente,
  type AtivoRecente,
} from '@/lib/ativos/ativos-recentes'

// F29/UXG-10b — a memória de "Recentes" da paleta. Dados 100% fictícios
// (CLAUDE.md regra 2): patrimônios WAP000xxxx e modelos inventados.

const UUID = (n: number) =>
  `0000000${n}-0000-4000-8000-000000000000`.replace(/^0{7}(\d)/, '0000000$1')

function ativo(n: number): AtivoRecente {
  return {
    id: UUID(n),
    patrimonio: `WAP000000${n}`,
    descricao: `Marca Fictícia Modelo ${n}`,
  }
}

describe('ehAtivoRecente', () => {
  it('aceita o registro bem formado', () => {
    expect(ehAtivoRecente(ativo(1))).toBe(true)
  })

  // A validação é na LEITURA porque o valor vem de um armazenamento que o próprio
  // usuário edita pelo devtools — e cada item vira href de navegação.
  it('recusa id que não é uuid', () => {
    expect(ehAtivoRecente({ ...ativo(1), id: '/../admin' })).toBe(false)
    expect(ehAtivoRecente({ ...ativo(1), id: '' })).toBe(false)
    expect(ehAtivoRecente({ ...ativo(1), id: 'javascript:alert(1)' })).toBe(false)
  })

  it('recusa registro sem patrimônio ou com campo de outro tipo', () => {
    expect(ehAtivoRecente({ ...ativo(1), patrimonio: '' })).toBe(false)
    expect(ehAtivoRecente({ ...ativo(1), descricao: 42 })).toBe(false)
    expect(ehAtivoRecente(null)).toBe(false)
    expect(ehAtivoRecente('texto')).toBe(false)
    expect(ehAtivoRecente(undefined)).toBe(false)
  })

  it('aceita descrição vazia (ativo sem marca nem modelo cadastrados)', () => {
    expect(ehAtivoRecente({ ...ativo(1), descricao: '' })).toBe(true)
  })
})

describe('inserirRecente', () => {
  it('põe o novo no topo', () => {
    const r = inserirRecente([ativo(1), ativo(2)], ativo(3))
    expect(r.map((a) => a.patrimonio)).toEqual([
      'WAP0000003',
      'WAP0000001',
      'WAP0000002',
    ])
  })

  it('reabrir o mesmo ativo não gasta duas vagas — sobe para o topo', () => {
    const r = inserirRecente([ativo(1), ativo(2), ativo(3)], ativo(3))
    expect(r).toHaveLength(3)
    expect(r[0].id).toBe(ativo(3).id)
    expect(r.filter((a) => a.id === ativo(3).id)).toHaveLength(1)
  })

  it('corta no teto, descartando o mais antigo', () => {
    let lista: AtivoRecente[] = []
    for (let i = 1; i <= MAX_ATIVOS_RECENTES + 3; i++) {
      lista = inserirRecente(lista, ativo(i))
    }
    expect(lista).toHaveLength(MAX_ATIVOS_RECENTES)
    // O último inserido está no topo; o primeiro de todos já saiu.
    expect(lista[0].id).toBe(ativo(MAX_ATIVOS_RECENTES + 3).id)
    expect(lista.some((a) => a.id === ativo(1).id)).toBe(false)
  })

  it('não muta a lista recebida', () => {
    const original = [ativo(1)]
    const copia = [...original]
    inserirRecente(original, ativo(2))
    expect(original).toEqual(copia)
  })
})

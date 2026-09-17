import { describe, expect, it } from 'vitest'
import { Constants } from '@/lib/types/database'
import type { StatusAtivo } from '@/lib/dominio'
import {
  kpisDeContagens,
  kpisDeEstado,
  type ContagemPorStatus,
  type EstadoAtivo,
} from '@/lib/queries/relatorios/estoque'

// F60 · fato 13 — os OITO números do dashboard não mudam quando a leitura troca de fonte.
//
// Até a F59 os tiles saíam de `kpisDeEstado` sobre `ativos` inteira; agora saem de `kpisDeContagens`
// sobre a contagem por status que `rel_contagem_status_filiais` (0141) agrega no banco. A prova
// sem banco é esta: para um estado qualquer, CONTAR por status (o que a RPC faz: `group by status`,
// SEM tirar as baixas) e passar por `kpisDeContagens` dá EXATAMENTE o que `kpisDeEstado` dá sobre o
// estado. A conferência de produção (só contagens) é a verificação 6 do cabeçalho da 0141.
//
// Fixture 100% fictícia: ids sintéticos, sem patrimônio, sem pessoa.

const TODOS_OS_STATUS: readonly StatusAtivo[] = Constants.public.Enums.status_ativo

let seq = 0
function ativo(status: StatusAtivo): EstadoAtivo {
  seq++
  return {
    ativo_id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    categoria: 'notebook',
    marca: null,
    modelo: null,
    filial_id: 11 + (seq % 3),
    status,
    colaborador: null,
    setor: null,
  }
}

function varios(status: StatusAtivo, quantos: number): EstadoAtivo[] {
  return Array.from({ length: quantos }, () => ativo(status))
}

/** O que a RPC faz: `group by status`, com as baixas DENTRO. A ordem de saída é a do primeiro visto. */
function contagemPorStatus(estado: readonly EstadoAtivo[]): ContagemPorStatus[] {
  const mapa = new Map<StatusAtivo, number>()
  for (const a of estado) mapa.set(a.status, (mapa.get(a.status) ?? 0) + 1)
  return [...mapa].map(([status, total]) => ({ status, total }))
}

// Um peso DIFERENTE por status (1, 2, 3…): com ele, trocar um tile por outro, somar uma baixa no
// total ou esquecer um status muda pelo menos um número — o deep-equal não passaria por acaso.
const PESADO = TODOS_OS_STATUS.flatMap((status, i) => varios(status, i + 1))

const ESTADOS: [string, EstadoAtivo[]][] = [
  ['vazio', []],
  ['um de cada status do enum (com emprestado e as duas baixas)', TODOS_OS_STATUS.map((s) => ativo(s))],
  ['um peso diferente por status', PESADO],
  ['só as baixas terminais', [...varios('descartado', 3), ...varios('devolvido_fornecedor', 2)]],
  ['só emprestados', varios('emprestado', 4)],
  [
    'acervo misto, com baixas no meio',
    [
      ...varios('em_estoque', 7),
      ...varios('descartado', 2),
      ...varios('em_uso', 5),
      ...varios('emprestado', 1),
      ...varios('devolvido_fornecedor', 1),
      ...varios('em_manutencao', 3),
    ],
  ],
]

describe('kpisDeContagens ≡ kpisDeEstado — os oito números por contagem', () => {
  it('a fixture pesada distingue os oito números (guarda do próprio teste)', () => {
    const k = kpisDeEstado(PESADO)
    expect(Object.keys(k).sort()).toEqual(
      ['defasado', 'em_estoque', 'em_manutencao', 'em_triagem', 'em_uso', 'emprestado', 'reservado', 'total'],
    )
    expect(new Set(Object.values(k)).size, 'dois tiles com o mesmo número esconderiam uma troca').toBe(8)
    // …e as baixas estão na fixture, com peso próprio, para a exclusão ser posta à prova.
    expect(PESADO.some((a) => a.status === 'descartado')).toBe(true)
    expect(PESADO.some((a) => a.status === 'devolvido_fornecedor')).toBe(true)
  })

  it.each(ESTADOS)('%s', (_nome, estado) => {
    expect(kpisDeContagens(contagemPorStatus(estado))).toEqual(kpisDeEstado(estado))
  })

  it('a ordem das linhas da contagem não muda nada', () => {
    const contagens = contagemPorStatus(PESADO)
    expect(kpisDeContagens([...contagens].reverse())).toEqual(kpisDeContagens(contagens))
  })

  it('as baixas terminais ficam FORA do total, como em kpisDeEstado', () => {
    const k = kpisDeContagens([
      { status: 'descartado', total: 40 },
      { status: 'devolvido_fornecedor', total: 9 },
      { status: 'em_uso', total: 2 },
    ])
    expect(k.total).toBe(2)
    expect(k.em_uso).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import { validarCsvImport } from './plano'
import { LIMITES_CAMPO_PLANO } from './limites'
import type { FilialSelecionada } from './tipos'
import type { VocabularioImport } from './vocabulario'
import { tetoDaColuna } from '@/lib/validators/tetos-coluna'

// =============================================================================
// F66B (12/11/2026) — A COBERTURA DO IMPORT, CAMPO A CAMPO (a sabotagem E)
// =============================================================================
// Desde a F66B o BANCO recusa o texto acima do teto da coluna (CHECK <tabela>_<coluna>_tamanho). Mas o import aborta
// INTEIRO quando um CHECK dispara dentro da RPC (sem savepoint por linha — fato 10 do PLAN-F66B): a recusa de uma
// linha longa tem de acontecer na CONFERÊNCIA, antes do plano existir. A F56 já fazia isso (`valor_longo_demais`,
// plano.ts:340-352); este arquivo PROVA a cobertura para cada campo de texto que a RPC grava numa coluna das 20 (o mapa
// do PLAN §3): uma planilha FICTÍCIA com aquela célula em LIMITES_CAMPO_PLANO + 1 → a linha sai bloqueada como
// `valor_longo_demais`, nenhum plano nasce, e o campo no teto exato passa. E o teto do campo cabe na coluna que ele
// alimenta — a mesma régua de tetos-coluna.test.ts, aqui do lado do motor.
//
// Dados 100% fictícios (WAP0001234, "Fulano").
// =============================================================================

const H_PADRAO20 =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação;Grade;GLPI'
const HOJE = '2026-07-16'
const MATRIZ: FilialSelecionada = { id: 1, slug: 'matriz', nome: 'Matriz' }
const VOCAB: VocabularioImport = {
  filiais: [{ id: MATRIZ.id, nome: MATRIZ.nome, ativa: true }],
  apelidos: [],
  categorias: [{ termo: 'notebook', categoria: 'notebook', rotulo: 'Notebook' }],
  estados: [
    { termo: 'saida', estado: 'em_uso', rotulo: 'Saída' },
    { termo: 'estoque', estado: 'em_estoque', rotulo: 'Estoque' },
  ],
  prefixosPatrimonio: ['WAP'],
}

function validar(linha: Record<string, string>) {
  const headers = H_PADRAO20.split(';')
  const base: Record<string, string> = {
    Site: 'Matriz', Tipo: 'Notebook', 'Patrimônio': 'WAP0001234', 'Service Tag': 'ZZF66BST1', Status: 'Estoque',
    ...linha,
  }
  const csv = [H_PADRAO20, headers.map((h) => base[h] ?? '').join(';')].join('\n')
  return validarCsvImport(Buffer.from(csv, 'utf8'), MATRIZ, VOCAB, HOJE)
}

/**
 * Cada campo de texto do plano que a RPC grava numa coluna das 20: a célula da planilha que o produz (o valor final é o
 * medido pelo motor) e as colunas de destino (PLAN-F66B §3).
 */
const CASOS: readonly {
  campo: keyof typeof LIMITES_CAMPO_PLANO
  rotulo: string
  colunas: readonly string[]
  linha: (n: number) => Record<string, string>
}[] = [
  // O cru fora de formato só chega ao plano como `patrimonioOriginal` quando o patrimônio vem de outro lugar — aqui, o
  // embutido no hostname (resolver-patrimonio.ts, passo 3); o cru longo FORÇADO é recusado antes, como patrimonio_invalido.
  {
    campo: 'patrimonioOriginal', rotulo: 'Patrimônio (original)', colunas: ['ativos.patrimonio_original'],
    linha: (n) => ({ 'Patrimônio': 'X'.repeat(n), Hostname: 'NB-WAP0001234' }),
  },
  { campo: 'serviceTag', rotulo: 'Service Tag', colunas: ['ativos.service_tag'], linha: (n) => ({ 'Service Tag': 'S'.repeat(n) }) },
  { campo: 'marca', rotulo: 'Marca', colunas: ['ativos.marca'], linha: (n) => ({ Marca: 'M'.repeat(n) }) },
  { campo: 'modelo', rotulo: 'Modelo', colunas: ['ativos.modelo'], linha: (n) => ({ Modelo: 'm'.repeat(n) }) },
  { campo: 'fornecedor', rotulo: 'Fornecedor', colunas: ['ativos.fornecedor'], linha: (n) => ({ Fornecedor: 'f'.repeat(n) }) },
  { campo: 'memoria', rotulo: 'Memória', colunas: ['ativos.memoria'], linha: (n) => ({ 'Memória': 'g'.repeat(n) }) },
  { campo: 'armazenamento', rotulo: 'Armazenamento', colunas: ['ativos.armazenamento'], linha: (n) => ({ Armazenamento: 'h'.repeat(n) }) },
  { campo: 'processador', rotulo: 'Processador', colunas: ['ativos.processador'], linha: (n) => ({ Processador: 'p'.repeat(n) }) },
  { campo: 'hostname', rotulo: 'Hostname', colunas: ['ativos.hostname'], linha: (n) => ({ Hostname: 'n'.repeat(n) }) },
  { campo: 'observacoes', rotulo: 'Observação', colunas: ['ativos.observacoes'], linha: (n) => ({ 'Observação': 'o'.repeat(n) }) },
  {
    campo: 'colaborador', rotulo: 'Colaborador', colunas: ['movimentacoes.colaborador', 'ativos.colaborador_atual'],
    linha: (n) => ({ Status: 'Saída', Colaborador: 'F'.repeat(n) }),
  },
  {
    campo: 'setor', rotulo: 'Setor', colunas: ['movimentacoes.setor', 'ativos.setor_atual'],
    linha: (n) => ({ Status: 'Saída', Colaborador: `Fulano / ${'T'.repeat(n)}` }),
  },
  { campo: 'chamado', rotulo: 'Chamado', colunas: ['movimentacoes.chamado'], linha: (n) => ({ GLPI: '1'.repeat(n) }) },
]

describe('F66B · o import recusa a célula longa NA CONFERÊNCIA, campo a campo', () => {
  it.each(CASOS.map((c) => [c.campo, c] as const))('%s: limite + 1 vira valor_longo_demais e nenhum plano nasce', (_campo, c) => {
    const limite = LIMITES_CAMPO_PLANO[c.campo]
    const r = validar(c.linha(limite + 1))
    expect(r.plano, `${c.campo}: com ${limite + 1} caracteres o plano nasceu`).toBeNull()
    const erro = r.bloqueantes.find((e) => e.tipo === 'valor_longo_demais' && e.coluna === c.rotulo)
    expect(erro, `${c.campo}: sem o bloqueante valor_longo_demais na coluna "${c.rotulo}"`).toBeDefined()
    expect(erro!.mensagem).toContain(String(limite + 1))
    expect(erro!.mensagem).toContain(String(limite))
    expect(r.candidatos).toEqual([])
  })

  it.each(CASOS.map((c) => [c.campo, c] as const))('%s: no limite exato, a linha passa (a régua é <=, não <)', (_campo, c) => {
    const limite = LIMITES_CAMPO_PLANO[c.campo]
    const r = validar(c.linha(limite))
    expect(r.bloqueantes.filter((e) => e.tipo === 'valor_longo_demais'), c.campo).toEqual([])
    expect(r.plano, `${c.campo}: no limite o plano não nasceu (${r.bloqueantes.map((e) => e.tipo).join(', ')})`).not.toBeNull()
  })

  it.each(CASOS.map((c) => [c.campo, c] as const))('%s: o limite do campo cabe em toda coluna que ele alimenta', (_campo, c) => {
    for (const col of c.colunas) {
      const [t, k] = col.split('.')
      expect(LIMITES_CAMPO_PLANO[c.campo], `${c.campo} → ${col}`).toBeLessThanOrEqual(tetoDaColuna(t, k)!)
    }
  })

  it('os casos cobrem todo campo de texto do plano que vira coluna das 20 (o patrimônio canônico tem 10; o cru, o original)', () => {
    const cobertos = new Set(CASOS.map((c) => c.campo))
    const deTexto = (Object.keys(LIMITES_CAMPO_PLANO) as (keyof typeof LIMITES_CAMPO_PLANO)[]).filter(
      (c) => !['categoria', 'estadoAlvo', 'dataEntrada', 'dataAjuste', 'patrimonio'].includes(c),
    )
    expect([...cobertos].sort()).toEqual([...deTexto].sort())
  })
})

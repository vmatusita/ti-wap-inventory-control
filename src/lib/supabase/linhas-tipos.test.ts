import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { chamarRpc } from '@/lib/supabase/rpc'
import { linhaDe, linhasDe, valorDe } from '@/lib/supabase/linhas'
import { naoNulaNaView } from '@/lib/supabase/colunas-de-view'

// A PROVA DA AMARRAÇÃO — em COMPILAÇÃO (F58 · Frente C).
//
// Cada `@ts-expect-error` abaixo é uma afirmação de que aquela linha NÃO compila. Se um dia ela
// passar a compilar — a amarração afrouxou —, o próprio `tsc --noEmit` acusa "Unused
// '@ts-expect-error' directive" e o build fica vermelho. Os casos positivos provam o contrário:
// que a porta aceita o que deve aceitar, sem cast.
//
// ⚠ NADA AQUI RODA CONTRA BANCO. `client` é só uma declaração de tipo; as funções `provas*` nunca
// são chamadas — o Vitest executa apenas o `it` final, que confere que o arquivo carregou. Quem
// prova é o compilador.
//
// ⚠ CADA CASO NEGATIVO ERRA POR UM MOTIVO SÓ. Um schema que errasse por dois motivos (a coluna da
// prova e, sem querer, um enum incompleto) consumiria o `@ts-expect-error` pelo motivo errado —
// por isso as formas-base abaixo são as exatas do select, e cada caso muda uma coisa.

declare const client: SupabaseClient<Database>

const CATEGORIAS = ['notebook', 'desktop', 'monitor', 'celular', 'tablet', 'outro'] as const
const STATUS = [
  'em_estoque',
  'reservado',
  'em_uso',
  'emprestado',
  'em_triagem',
  'em_manutencao',
  'defasado',
  'descartado',
  'devolvido_fornecedor',
] as const

const TIPO_ITEM = { id: z.number(), slug: z.string(), rotulo: z.string(), ativo: z.boolean(), ordem: z.number() }

export async function provasDeTabela() {
  const { data } = await client.from('tipos_item').select('id, slug, rotulo, ativo, ordem')

  // (1) a forma exata do select compila, e a linha sai com o tipo do schema
  const ok = linhasDe(data, z.strictObject(TIPO_ITEM), 'prova.tipos')
  const slug: string = ok[0].slug
  void slug

  // (2) A VIRADA DA FICHA: o select não traz `empresa_id`, e ler a coluna não compila
  // @ts-expect-error — `empresa_id` não existe na linha conferida
  void ok[0].empresa_id

  // @ts-expect-error — (3) a forma declara uma coluna que o select não traz
  linhasDe(data, z.strictObject({ ...TIPO_ITEM, empresa_id: z.string() }), 'prova.tipos')

  const { ordem: _ordem, ...semOrdem } = TIPO_ITEM
  void _ordem
  // @ts-expect-error — (4) a forma ESTRITA esquece uma coluna que o select traz
  linhasDe(data, z.strictObject(semOrdem), 'prova.tipos')

  // @ts-expect-error — (5) a forma troca o tipo de uma coluna
  linhasDe(data, z.strictObject({ ...TIPO_ITEM, slug: z.number() }), 'prova.tipos')
}

export async function provasDeSelectNaoLiteral() {
  const SELECT_CONCATENADO = 'id, ' + 'slug'
  const { data } = await client.from('tipos_item').select(SELECT_CONCATENADO)
  // @ts-expect-error — (6) select montado por `+` vira `string` e a linha não é inferida
  linhasDe(data, z.strictObject({ id: z.number(), slug: z.string() }), 'prova.concat')
}

export async function provasDeSelectTudo() {
  const { data } = await client.from('filiais').select('*')
  // (7) `select('*')` com forma FROUXA: o schema cobre um subconjunto e a linha inteira chega tipada
  const filiais = linhasDe(data, z.looseObject({ id: z.number(), slug: z.string() }), 'prova.tudo')
  const nome: string = filiais[0].nome
  void nome
  // @ts-expect-error — (8) mesmo na frouxa, coluna que a TABELA não tem não compila
  void filiais[0].empresa_id

  // @ts-expect-error — (9) mesmo na frouxa, a forma não pode declarar coluna fora da linha
  linhasDe(data, z.looseObject({ id: z.number(), empresa_id: z.string() }), 'prova.tudo')
}

export async function provasDeView() {
  const { data } = await client.from('v_estoque_atual').select('filial, total')
  // (10) a view chega toda anulável do gerador; manter o `null` compila
  linhasDe(data, z.strictObject({ filial: z.string().nullable(), total: z.number().nullable() }), 'prova.view')

  // (11) tirar o `null` COM a marca do mapa compila, e a linha sai não-nula
  const linhas = linhasDe(
    data,
    z.strictObject({
      filial: naoNulaNaView('v_estoque_atual', 'filial', z.string()),
      total: naoNulaNaView('v_estoque_atual', 'total', z.number()),
    }),
    'prova.view',
  )
  const total: number = linhas[0].total
  void total

  // @ts-expect-error — (12) tirar o `null` de coluna de view SEM a marca do mapa não compila
  linhasDe(data, z.strictObject({ filial: z.string(), total: z.number().nullable() }), 'prova.view')

  // @ts-expect-error — (13) a marca só existe para coluna que está no mapa
  naoNulaNaView('v_estoque_atual', 'categoria', z.string())
}

export async function provasDeJson() {
  const { data } = await client.from('relatorios_gerados').select('id, dados').maybeSingle()
  // (14) coluna `jsonb`: estreitar `Json` para a forma real — inclusive FROUXA — compila
  const r = linhaDe(data, z.strictObject({ id: z.string(), dados: z.looseObject({ versao: z.number() }) }), 'prova.json')
  const versao: number | undefined = r?.dados.versao
  void versao
}

export async function provasDaPorta() {
  // (15) o retorno alargado pela porta: `colaborador`, `setor`, `marca` e `modelo` são `string | null`
  const { data } = await chamarRpc(client, 'rel_estoque_asof', { p_filial: null, p_data: '2026-09-15' })
  const ASOF = {
    ativo_id: z.string(),
    categoria: z.enum(CATEGORIAS),
    marca: z.string().nullable(),
    modelo: z.string().nullable(),
    filial_id: z.number(),
    status: z.enum(STATUS),
    colaborador: z.string().nullable(),
    setor: z.string().nullable(),
  }
  linhasDe(data, z.strictObject(ASOF), 'prova.asof')

  // @ts-expect-error — (16) o schema que supõe `colaborador` não-nulo (a mentira do gerador) não compila
  linhasDe(data, z.strictObject({ ...ASOF, colaborador: z.string() }), 'prova.asof')

  // (17) escalar alargado: `papel_atual` pode ser `null`, e o schema que o admite compila
  const papel = await chamarRpc(client, 'papel_atual')
  const cargo: 'dev' | 'admin' | 'operador' | 'consulta' | null = valorDe(
    papel.data,
    z.enum(['dev', 'admin', 'operador', 'consulta']).nullable(),
    'prova.papel',
  )
  void cargo

  // @ts-expect-error — (18) `null` num parâmetro FORA do mapa continua recusado
  void chamarRpc(client, 'rel_estoque_asof', { p_filial: 1, p_data: null })

  // (19) o builder sobrevive: Promise.all e .order().range() compilam
  await Promise.all([
    chamarRpc(client, 'rel_saldo_itens', { p_filial: null, p_ate: '2026-09-15' }),
    chamarRpc(client, 'rel_frescor_itens', { p_filial: 2, p_ate: '2026-09-15' }),
  ])
  await chamarRpc(client, 'rel_estoque_asof', { p_filial: null, p_data: '2026-09-15' })
    .order('ativo_id', { ascending: true })
    .range(0, 999)
}

describe('a amarração da F58 (prova em compilação)', () => {
  it('o arquivo carrega — as provas são do `tsc`, não deste teste', () => {
    expect(typeof provasDeTabela).toBe('function')
  })
})

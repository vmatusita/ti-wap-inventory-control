import { beforeEach, describe, expect, it, vi } from 'vitest'

// =============================================================================
// persistirTermo INVERTIDO (F67B, decisão 6 do PLAN-F67B) — a ordem e o rollback, com o client simulado.
// =============================================================================
// Desde a F67B o `.docx` do bucket `termos` só pode ser escrito se uma LINHA de `termos_gerados` o referencia (o
// `coalesce(…, false)` de `pode_escrever_arquivo_termo`). Então:
//   · INSERT (id novo): a LINHA primeiro → o upload (`upsert: false`) → se o upload falhar, apaga a LINHA; se isso
//     também falhar, `registrarFalha` com o id (a 3ª checagem, `termo_sem_arquivo`, é a rede). Nunca objeto sem linha.
//   · UPDATE (id reutilizado, mesmo caminho): upload (`upsert: true`) → UPDATE. A linha JÁ existe e já referencia o
//     caminho: nunca há objeto sem linha nem linha sem objeto; a janela declarada é "arquivo novo, colunas antigas" se o
//     UPDATE falhar depois do upload — o próximo gerarTermo do mesmo conjunto regrava os dois.
//   · as VARIANTES antigas do mesmo conjunto: o `remove` dos arquivos ENQUANTO as linhas existem, conferindo o `data`
//     dele; depois apaga SÓ as linhas cujo arquivo saiu. Arquivo que não saiu deixa a variante inteira de pé (par válido).
// O dublê tem o contrato REAL do supabase-js: erro DEVOLVIDO em `{ data, error }`, nunca lançado.
// =============================================================================

vi.mock('server-only', () => ({}))
const registrarFalha = vi.fn()
vi.mock('@/lib/observabilidade', () => ({ registrarFalha: (...a: unknown[]) => registrarFalha(...a) }))

import { persistirTermo } from './persistir'

type Linha = { id: string; arquivo_path: string }
type Opcoes = {
  existentes?: Linha[]
  falhaInsert?: boolean
  falhaUpdate?: boolean
  falhaUpload?: boolean
  falhaDeleteRollback?: boolean
  naoSaemNoRemove?: string[]
}

function clienteFalso(o: Opcoes) {
  const ordem: string[] = []
  const linhas = new Map((o.existentes ?? []).map((l) => [l.id, l]))
  const client = {
    from(tabela: string) {
      if (tabela !== 'termos_gerados') throw new Error(`tabela inesperada ${tabela}`)
      return {
        select() {
          const encadeia = {
            contains() {
              return encadeia
            },
            containedBy() {
              ordem.push('select')
              return Promise.resolve({ data: [...linhas.values()], error: null })
            },
          }
          return encadeia
        },
        insert(linha: { id: string; arquivo_path: string }) {
          ordem.push(`insert:${linha.arquivo_path}`)
          if (o.falhaInsert) return Promise.resolve({ error: { message: 'recusado', code: '42501' } })
          linhas.set(linha.id, { id: linha.id, arquivo_path: linha.arquivo_path })
          return Promise.resolve({ error: null })
        },
        update() {
          return {
            eq(_c: string, id: string) {
              ordem.push(`update:${id}`)
              return Promise.resolve({ error: o.falhaUpdate ? { message: 'recusado', code: '42501' } : null })
            },
          }
        },
        delete() {
          return {
            in(_c: string, ids: string[]) {
              return {
                select() {
                  ordem.push(`delete:${ids.join(',')}`)
                  for (const id of ids) linhas.delete(id)
                  return Promise.resolve({ data: ids.map((id) => ({ id })), error: null })
                },
              }
            },
            eq(_c: string, id: string) {
              ordem.push(`delete-rollback:${id}`)
              if (o.falhaDeleteRollback) return Promise.resolve({ error: { message: 'caiu', code: '08006' } })
              linhas.delete(id)
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
    storage: {
      from(bucket: string) {
        if (bucket !== 'termos') throw new Error(`bucket inesperado ${bucket}`)
        return {
          upload(caminho: string, _b: unknown, opt: { upsert?: boolean }) {
            ordem.push(`upload:${caminho}:${opt.upsert ? 'upsert' : 'novo'}`)
            return Promise.resolve({ error: o.falhaUpload ? { message: 'new row violates row-level security policy' } : null })
          },
          remove(caminhos: string[]) {
            ordem.push(`remove:${caminhos.join(',')}`)
            const saem = caminhos.filter((c) => !o.naoSaemNoRemove?.includes(c))
            return Promise.resolve({ data: saem.map((name) => ({ name })), error: null })
          },
        }
      },
    },
  }
  return { client: client as never, ordem, linhas }
}

const PARAMS = {
  tipo: 'responsabilidade_notebook' as const,
  movimentacaoIds: ['m2', 'm1'],
  ativoIds: ['a1'],
  campos: { colaborador: 'Fulano' } as never,
  dados: {} as never,
  buffer: Buffer.from('docx'),
  uid: 'u1',
}

beforeEach(() => registrarFalha.mockReset())

describe('1. INSERT (id novo): a LINHA antes do upload', () => {
  it('a ordem é select → insert da linha → upload novo (sem upsert), e nada é removido', async () => {
    const { client, ordem } = clienteFalso({})
    const r = await persistirTermo(client, PARAMS)
    expect(r.ok).toBe(true)
    const caminho = r.ok ? r.arquivoPath : ''
    expect(caminho).toMatch(/^[0-9a-f-]{36}\.docx$/)
    expect(ordem).toEqual(['select', `insert:${caminho}`, `upload:${caminho}:novo`])
  })

  it('o insert da linha falhou: NENHUM upload (nunca objeto sem linha)', async () => {
    const { client, ordem } = clienteFalso({ falhaInsert: true })
    const r = await persistirTermo(client, PARAMS)
    expect(r.ok).toBe(false)
    expect(ordem.some((x) => x.startsWith('upload:'))).toBe(false)
  })

  it('o upload falhou: apaga a LINHA (o rollback do INSERT) e não toca o Storage', async () => {
    const { client, ordem, linhas } = clienteFalso({ falhaUpload: true })
    const r = await persistirTermo(client, PARAMS)
    expect(r.ok).toBe(false)
    const ins = ordem.find((x) => x.startsWith('insert:'))!.slice('insert:'.length)
    const id = ins.replace(/\.docx$/, '')
    expect(ordem).toEqual(['select', `insert:${ins}`, `upload:${ins}:novo`, `delete-rollback:${id}`])
    expect(linhas.size).toBe(0) // nenhuma linha sem objeto
    expect(ordem.some((x) => x.startsWith('remove:'))).toBe(false)
  })

  it('o upload falhou E o rollback da linha falhou: registrarFalha com o id (a rede é a 3ª checagem)', async () => {
    const { client, ordem } = clienteFalso({ falhaUpload: true, falhaDeleteRollback: true })
    const r = await persistirTermo(client, PARAMS)
    expect(r.ok).toBe(false)
    const id = ordem.find((x) => x.startsWith('delete-rollback:'))!.slice('delete-rollback:'.length)
    expect(registrarFalha).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(registrarFalha.mock.calls[0])).toContain(id)
  })
})

describe('2. UPDATE (id reutilizado, mesmo caminho): upload → update, janela declarada', () => {
  const V1 = { id: '11111111-1111-4111-8111-111111111111', arquivo_path: '11111111-1111-4111-8111-111111111111.docx' }

  it('a ordem é select → upload (upsert) → update da MESMA linha', async () => {
    const { client, ordem } = clienteFalso({ existentes: [V1] })
    const r = await persistirTermo(client, PARAMS)
    expect(r).toEqual({ ok: true, id: V1.id, arquivoPath: V1.arquivo_path })
    expect(ordem).toEqual(['select', `upload:${V1.arquivo_path}:upsert`, `update:${V1.id}`])
  })

  it('o upload falhou: nada mais acontece (a linha e o arquivo antigos continuam um par)', async () => {
    const { client, ordem } = clienteFalso({ existentes: [V1], falhaUpload: true })
    const r = await persistirTermo(client, PARAMS)
    expect(r.ok).toBe(false)
    expect(ordem).toEqual(['select', `upload:${V1.arquivo_path}:upsert`])
  })

  it('o update falhou depois do upload: devolve o erro, NÃO apaga a linha nem o arquivo (a janela declarada)', async () => {
    const { client, ordem, linhas } = clienteFalso({ existentes: [V1], falhaUpdate: true })
    const r = await persistirTermo(client, PARAMS)
    expect(r.ok).toBe(false)
    expect(ordem.some((x) => x.startsWith('remove:') || x.startsWith('delete'))).toBe(false)
    expect(linhas.has(V1.id)).toBe(true)
  })
})

describe('3. as VARIANTES antigas do mesmo conjunto: o arquivo sai ENQUANTO a linha existe', () => {
  const V1 = { id: '11111111-1111-4111-8111-111111111111', arquivo_path: '11111111-1111-4111-8111-111111111111.docx' }
  const V2 = { id: '22222222-2222-4222-8222-222222222222', arquivo_path: '22222222-2222-4222-8222-222222222222.docx' }
  const V3 = { id: '33333333-3333-4333-8333-333333333333', arquivo_path: '33333333-3333-4333-8333-333333333333.docx' }

  it('remove os arquivos das variantes ANTES de apagar as linhas delas', async () => {
    const { client, ordem } = clienteFalso({ existentes: [V1, V2, V3] })
    const r = await persistirTermo(client, PARAMS)
    expect(r.ok).toBe(true)
    const iRemove = ordem.indexOf(`remove:${V2.arquivo_path},${V3.arquivo_path}`)
    const iDelete = ordem.indexOf(`delete:${V2.id},${V3.id}`)
    expect(iRemove).toBeGreaterThan(-1)
    expect(iDelete).toBeGreaterThan(iRemove)
  })

  it('arquivo que NÃO saiu deixa a variante inteira de pé (só apaga a linha cujo arquivo saiu)', async () => {
    const { client, ordem, linhas } = clienteFalso({ existentes: [V1, V2, V3], naoSaemNoRemove: [V3.arquivo_path] })
    const r = await persistirTermo(client, PARAMS)
    expect(r.ok).toBe(true)
    expect(ordem).toContain(`delete:${V2.id}`)
    expect(linhas.has(V3.id)).toBe(true)
    expect(registrarFalha).toHaveBeenCalled()
  })
})

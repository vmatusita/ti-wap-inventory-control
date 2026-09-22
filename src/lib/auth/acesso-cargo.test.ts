import { beforeEach, describe, expect, it, vi } from 'vitest'
import { escopoDeEscrita } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import { EMPRESA_LEGADA_ID } from '@/lib/auth/empresa-legada'

// F62 (22/09/2026) — `getOperador` passou a ler o CARGO e o STATUS da membership na empresa
// legada (`membros`), e o que é da CONTA (nome, arquivamento) de `profiles`. A promessa da fase
// vale aqui também: para o mesmo estado de acesso, o operador logado recebe EXATAMENTE o que
// recebia quando tudo morava em `profiles`.
//
// Até a F62 não havia teste de runtime de `getOperador` (só tripwires de texto). Este monta um
// client Supabase FALSO — só o pedaço da API que `getOperador` usa — sobre um estado em memória,
// e compara, numa grade de cargo × ativo × arquivado × vínculos, a resposta nova com a regra
// antiga escrita por extenso (`antigo`, abaixo: a lógica de `acesso.ts` antes da F62). Dados
// 100% fictícios.

type Linha = Record<string, unknown>
type Estado = {
  user: { id: string; email: string } | null
  profiles: Linha[]
  membros: Linha[]
  filiais: Linha[]
  operador_filiais: Linha[]
}

const h = vi.hoisted(() => ({ estado: null as unknown as Estado }))

function consulta(tabela: keyof Omit<Estado, 'user'>) {
  const filtros: Record<string, unknown> = {}
  let colunas: string[] = []
  const linhas = () =>
    h.estado[tabela]
      .filter((l) => Object.entries(filtros).every(([c, v]) => l[c] === v))
      .map((l) => Object.fromEntries(colunas.map((c) => [c, l[c]])))
  const q = {
    select(s: string) {
      colunas = s.split(',').map((c) => c.trim())
      return q
    },
    eq(c: string, v: unknown) {
      filtros[c] = v
      return q
    },
    async maybeSingle() {
      const r = linhas()
      if (r.length > 1) return { data: null, error: { message: 'mais de uma linha' } }
      return { data: r[0] ?? null, error: null }
    },
    then(ok: (v: { data: Linha[]; error: null }) => unknown) {
      return Promise.resolve({ data: linhas(), error: null }).then(ok)
    },
  }
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.estado.user } }) },
    from: (t: keyof Omit<Estado, 'user'>) => consulta(t),
  }),
}))
vi.mock('@/lib/observabilidade', () => ({ registrarFalha: vi.fn() }))

const { getOperador } = await import('@/lib/auth/acesso')

const FILIAIS_ATIVAS = [1, 2, 3]
const EU = '00000000-f62e-4000-8000-000000000001'
const OUTRA_EMPRESA = '00000000-f62e-4000-8000-0000000000bb'

/** A regra de ANTES da F62, por extenso: tudo em `profiles`, vínculo por pessoa. */
function antigo(p: { papel: PapelUsuario; ativo: boolean; arquivado: boolean; vinculos: number[] }) {
  if (!p.ativo || p.arquivado) return null
  return { papel: p.papel, escopoEscrita: escopoDeEscrita(p.papel, p.vinculos, FILIAIS_ATIVAS) }
}

/** O estado que a cópia da F62 produz para o MESMO acesso: a membership espelha o perfil. */
function estadoDe(p: { papel: PapelUsuario; ativo: boolean; arquivado: boolean; vinculos: number[] }): Estado {
  const membro = '00000000-f62e-4000-8000-0000000000aa'
  return {
    user: { id: EU, email: 'f62.eu@wap.ind.br' },
    profiles: [{ id: EU, nome: 'Fulano de Teste', excluido_em: p.arquivado ? '2026-09-22T00:00:00Z' : null }],
    membros: [{ id: membro, profile_id: EU, empresa_id: EMPRESA_LEGADA_ID, papel: p.papel, ativo: p.ativo }],
    filiais: [...FILIAIS_ATIVAS.map((id) => ({ id, ativo: true })), { id: 9, ativo: false }],
    operador_filiais: p.vinculos.map((f) => ({ membro_id: membro, usuario_id: EU, filial_id: f })),
  }
}

const PAPEIS: PapelUsuario[] = ['dev', 'admin', 'operador', 'consulta']
const GRADE = PAPEIS.flatMap((papel) =>
  [true, false].flatMap((ativo) =>
    [false, true].flatMap((arquivado) =>
      [[], [2], [1, 3]].map((vinculos) => ({ papel, ativo, arquivado, vinculos })),
    ),
  ),
)

describe('getOperador — o cargo em membros, o mesmo acesso de antes', () => {
  beforeEach(() => {
    h.estado = estadoDe({ papel: 'consulta', ativo: true, arquivado: false, vinculos: [] })
  })

  it.each(GRADE)('%o', async (p) => {
    h.estado = estadoDe(p)
    const op = await getOperador()
    const esperado = antigo(p)
    if (esperado === null) {
      expect(op).toBeNull()
    } else {
      expect(op).not.toBeNull()
      expect({ papel: op!.papel, escopoEscrita: [...op!.escopoEscrita] }).toEqual(esperado)
    }
  })

  it('sem sessão: null', async () => {
    h.estado = { ...estadoDe({ papel: 'admin', ativo: true, arquivado: false, vinculos: [] }), user: null }
    expect(await getOperador()).toBeNull()
  })

  it('sem membership na empresa legada (só em outra empresa): null — a ponte responde pela legada', async () => {
    const e = estadoDe({ papel: 'admin', ativo: true, arquivado: false, vinculos: [] })
    e.membros = e.membros.map((m) => ({ ...m, empresa_id: OUTRA_EMPRESA }))
    h.estado = e
    expect(await getOperador()).toBeNull()
  })

  it('duas memberships: vale a da empresa legada, nunca a mais forte', async () => {
    const e = estadoDe({ papel: 'consulta', ativo: true, arquivado: false, vinculos: [] })
    e.membros.push({ id: '00000000-f62e-4000-8000-0000000000cc', profile_id: EU, empresa_id: OUTRA_EMPRESA, papel: 'admin', ativo: true })
    h.estado = e
    const op = await getOperador()
    expect(op?.papel).toBe('consulta')
    expect(op?.escopoEscrita).toEqual([])
  })

  it('o vínculo é da MEMBERSHIP: vínculo de outra membership não entra no escopo', async () => {
    const e = estadoDe({ papel: 'operador', ativo: true, arquivado: false, vinculos: [2] })
    e.operador_filiais.push({ membro_id: '00000000-f62e-4000-8000-0000000000dd', usuario_id: EU, filial_id: 3 })
    h.estado = e
    expect((await getOperador())?.escopoEscrita).toEqual([2])
  })
})

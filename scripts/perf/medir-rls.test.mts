import { describe, expect, it } from 'vitest'
import {
  comandoMedicao,
  comandoProvaFormaAlvo,
  emitir,
  estatistica,
  lerPayload,
  validarAlvo,
  validarComando,
} from './medir-rls.mjs'

// A GUARDA DO `medir-rls.mjs` — F59. Sem banco.
//
// O script lê PRODUÇÃO por SQL (decisão i do Johnny). O que o torna seguro não é quem o
// opera, é a guarda: o alvo conferido por permissão, e todo comando validado contra o
// modelo fechado ANTES de sair do processo. Esta suíte prende essa guarda na mesa — a
// sabotagem G da fase a exercitou uma vez; aqui ela fica.

const REFS = { ensaio: ['ref0000000000ensaio0'], producao: ['ref00000000producao0'] }
const VALIDO = comandoMedicao({ alvo: 'ensaio', tabela: 'ativos', identidade: 'admin', n: 9 })

describe('1. o alvo, por permissão', () => {
  it('recusa alvo ausente, inventado e ref de outro alvo', () => {
    expect(() => validarAlvo(undefined, REFS.ensaio[0], REFS)).toThrow(/obrigatório/)
    expect(() => validarAlvo('teste', REFS.ensaio[0], REFS)).toThrow(/não existe/)
    expect(() => validarAlvo('producao', REFS.ensaio[0], REFS)).toThrow(/não é o do alvo/)
    expect(() => validarAlvo('ensaio', REFS.producao[0], REFS)).toThrow(/não é o do alvo/)
    expect(validarAlvo('ensaio', REFS.ensaio[0], REFS)).toEqual({ alvo: 'ensaio', ref: REFS.ensaio[0] })
  })

  it('lê os refs de verdade de scripts/env-guard.ts (guarda do próprio teste)', () => {
    expect(() => validarAlvo('ensaio', 'sgmvldiizsrjbxzzpmhh')).not.toThrow()
    expect(() => validarAlvo('producao', 'sgmvldiizsrjbxzzpmhh')).toThrow()
  })
})

describe('2. o comando, contra o modelo fechado', () => {
  it('os comandos do modelo passam', () => {
    expect(validarComando(VALIDO)).toBe(VALIDO)
    expect(typeof validarComando(comandoProvaFormaAlvo({ alvo: 'ensaio' }))).toBe('string')
  })

  it.each([
    ['escrita solta', 'update public.ativos set status = null;'],
    ['update no corpo', VALIDO.replace('  -- 5. a medição', '  update public.ativos set status = null where false;\n  -- 5. a medição')],
    ['update no SQL que o execute roda', VALIDO.replace("'select id, patrimonio", "'update public.ativos set status = null returning id, patrimonio")],
    ['update atrás de -- dentro de literal', VALIDO.replace("'ensaio';", "'ensaio -- '; update public.ativos set status = null; --';")],
    ['papel que não é authenticated', VALIDO.replace("set_config('role', 'authenticated', true)", "set_config('role', 'postgres', true)")],
    ['GUC fora da lista', VALIDO.replace("set_config('transaction_read_only', 'on', true);\n\n", "set_config('transaction_read_only', 'on', true);\n  perform set_config('session_replication_role', 'replica', true);\n")],
    ['sem transaction_read_only', VALIDO.replace("  perform set_config('transaction_read_only', 'on', true);\n", '')],
    ['bloco que se confirma', VALIDO.replace(/  raise exception 'F59_MEDICAO %'[\s\S]*?\);\nend \$f59\$;$/, '  perform 1;\nend $f59$;')],
    ['segundo bloco escondido', `${VALIDO}\ndo $f59$ begin null; end $f59$;`],
    ['grant', VALIDO.replace('  -- 5. a medição', '  grant select on public.ativos to anon;\n  -- 5. a medição')],
    ['execute fora do modelo', VALIDO.replace("execute format('select count(*) from public.%I', v_tabela) into v_total;", "execute 'truncate public.ativos';")],
  ])('%s → recusa', (_nome, sql) => {
    expect(() => validarComando(sql)).toThrow(/RECUSADO/)
  })

  it('comentário em português não é código (a palavra "do" num comentário passa)', () => {
    expect(VALIDO).toContain('DENTRO do banco')
    expect(() => validarComando(VALIDO)).not.toThrow()
  })

  it('a prova da forma-alvo só roda no ensaio', () => {
    expect(() => comandoProvaFormaAlvo({ alvo: 'producao' })).toThrow(/só no ensaio/)
  })
})

describe('3. a emissão valida TUDO antes do primeiro byte', () => {
  it('uma escrita no fim da fila impede até o primeiro comando válido de sair', async () => {
    let chamado = false
    await expect(
      emitir(
        [
          { nome: 'ok', sql: VALIDO },
          { nome: 'ruim', sql: 'delete from public.ativos;' },
        ],
        { canal: 'api', dir: '../fora-do-repo-f59-teste', ref: 'x', fetchImpl: async () => { chamado = true; return new Response('') } },
      ),
    ).rejects.toThrow(/RECUSADO/)
    expect(chamado).toBe(false)
  })

  it('--dir dentro do repositório é recusado', async () => {
    await expect(emitir([{ nome: 'ok', sql: VALIDO }], { canal: 'mcp', dir: 'docs/perf/x', ref: 'x' })).rejects.toThrow(/dentro do repositório/)
  })
})

describe('4. a leitura da resposta e a estatística', () => {
  it('lê o payload do erro do MCP (JSON com aspas escapadas) e a recusa de identidade', () => {
    const mcp = JSON.stringify({ error: { message: 'ERROR:  P0001: F59_MEDICAO {"n": 9, "x": {"y": 1}}\nCONTEXT:  …' } })
    expect(lerPayload(mcp, 'F59_MEDICAO')).toEqual({ n: 9, x: { y: 1 } })
    expect(lerPayload('ERROR:  P0001: F59_IDENTIDADE_AUSENTE identidade=operador alvo=ensaio\nCONTEXT', 'F59_MEDICAO')).toEqual({
      recusa: 'F59_IDENTIDADE_AUSENTE identidade=operador alvo=ensaio',
    })
    expect(() => lerPayload('nada', 'F59_MEDICAO')).toThrow(/sem F59_MEDICAO/)
  })

  it('mediana e p95 por posto mais próximo', () => {
    expect(estatistica([5, 1, 3, 2, 4, 9, 8, 7, 6])).toEqual({ mediana: 5, p95: 9, min: 1, max: 9, n: 9 })
    expect(estatistica([1, 2, 3, 4]).mediana).toBe(2.5)
  })
})

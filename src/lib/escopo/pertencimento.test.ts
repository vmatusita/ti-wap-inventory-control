import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { limpar } from '@/lib/use-server-exports'
import {
  ESCOPO_UNICO,
  escopoDeGestaoAtual,
  escopoDoImportLog,
  pertenceAoEscopo,
} from '@/lib/escopo/pertencimento'

// =============================================================================
// A GUARDA NO-OP DA F54 — provada por PRESENÇA e por EFEITO, que são coisas
// diferentes e nenhuma das duas basta sozinha.
// =============================================================================
// A F52 aprendeu isto do lado do SQL e escreveu por quê: "uma guarda que devolve
// `true` é indetectável por efeito — uma mede a PRESENÇA, a outra o EFEITO". Lá
// foram duas mutações no injetor. Aqui, do lado do TypeScript, são estes dois
// describes, e eles falham por motivos opostos:
//
//   · apague a CHAMADA de `urlBackup` ou de `listarImportLogs`  → describe 1 vermelho;
//   · reescreva `pertenceAoEscopo` como `return true`           → describe 2 vermelho.
//
// Um teste só deixaria uma das duas sabotagens passar — e a ordem de serviço da F54
// diz, com todas as letras, que se as duas sabotagens ficarem verdes "isso é o
// achado: a guarda não está provada".
//
// ⚠ O TERCEIRO describe é o que a ordem chama de "nada mudou para quem opera,
// provado e não afirmado": com uma empresa só, o filtro não tira NENHUMA linha.
// =============================================================================

const RAIZ = process.cwd()

/** O fonte de um arquivo do repositório, já sem comentários. */
function fonteViva(rel: string): string {
  return limpar(readFileSync(join(RAIZ, rel), 'utf8'), false)
}

/**
 * Os dois pontos que a F54 amarrou, e o RECORTE de cada um.
 *
 * O recorte existe porque procurar a chamada no ARQUIVO INTEIRO seria fraco demais:
 * `importar.ts` tem quatro Server Actions, e um `pertenceAoEscopo` em qualquer uma
 * delas satisfaria um `includes` no arquivo. A asserção tem de olhar DENTRO da função
 * que emite a URL.
 */
const PONTOS = [
  {
    rotulo: 'urlBackup (a URL assinada do dump)',
    arquivo: 'src/lib/actions/importar.ts',
    inicio: 'export async function urlBackup(',
    fim: 'export async function baixarCsvCorrigido(',
  },
  {
    rotulo: 'listarImportLogs (o histórico de imports)',
    arquivo: 'src/lib/queries/import-logs.ts',
    inicio: 'export async function listarImportLogs(',
    fim: null,
  },
] as const

function corpoDaFuncao(p: (typeof PONTOS)[number]): string {
  const fonte = fonteViva(p.arquivo)
  const i = fonte.indexOf(p.inicio)
  expect(i, `${p.rotulo}: não achei \`${p.inicio}\` em ${p.arquivo}`).toBeGreaterThan(-1)
  const j = p.fim ? fonte.indexOf(p.fim, i) : -1
  return fonte.slice(i, j > -1 ? j : undefined)
}

describe('1. PRESENÇA — os dois pontos chamam a guarda', () => {
  it('há pontos declarados (guarda do próprio teste)', () => {
    expect(PONTOS.length).toBe(2)
  })

  it.each(PONTOS.map((p) => [p.rotulo, p] as const))(
    '`%s` chama `pertenceAoEscopo` dentro da própria função',
    (_r, p) => {
      const corpo = corpoDaFuncao(p)
      expect(
        corpo,
        `${p.rotulo}: a fechadura de pertencimento sumiu deste caminho — é a cadeia de download do dump alheio, e ela é pela APLICAÇÃO (policy de bucket não a fecha)`,
      ).toContain('pertenceAoEscopo')
    },
  )

  it.each(PONTOS.map((p) => [p.rotulo, p] as const))(
    '`%s` alimenta a guarda com o escopo do ATOR e o do RECURSO',
    (_r, p) => {
      // Chamar `pertenceAoEscopo(x, x)` com o mesmo operando dos dois lados seria uma
      // presença que não vira nada na virada. Os dois resolvedores têm de aparecer.
      const corpo = corpoDaFuncao(p)
      expect(corpo).toContain('escopoDeGestaoAtual()')
      expect(corpo).toContain('escopoDoImportLog(')
    },
  )
})

describe('2. EFEITO — a guarda COMPARA, e não devolve `true`', () => {
  it('escopos diferentes → false', () => {
    // ESTA é a asserção que mata a sabotagem "faça a guarda devolver true por outro
    // caminho". Ela alimenta a função com um par que a produção nunca produz hoje —
    // e é exatamente por isso que ela consegue enxergar o mecanismo.
    expect(pertenceAoEscopo({ empresa: 'wap' }, { empresa: 'outra' })).toBe(false)
  })

  it('escopos iguais → true', () => {
    expect(pertenceAoEscopo({ empresa: 'wap' }, { empresa: 'wap' })).toBe(true)
  })

  it('a comparação é pelo VALOR, não pela identidade do objeto', () => {
    // Se fosse `ator === recurso`, a F62 quebraria em silêncio no dia em que os dois
    // escopos passassem a ser objetos distintos com o mesmo tenant.
    expect(pertenceAoEscopo({ empresa: 'wap' }, { ...ESCOPO_UNICO })).toBe(true)
  })
})

describe('3. NO-OP — com uma empresa só, nada muda para quem opera', () => {
  it('o escopo do ator e o de qualquer import_log são o mesmo', () => {
    expect(pertenceAoEscopo(escopoDeGestaoAtual(), escopoDoImportLog({ id: 'qualquer' }))).toBe(true)
  })

  it('o filtro de `listarImportLogs` não tira NENHUMA linha hoje', () => {
    // A prova de que a fase não mudou o que o operador vê. As linhas são fictícias
    // (regra 2 do CLAUDE.md) e o que importa é a contagem antes = depois.
    const linhas = Array.from({ length: 50 }, (_, i) => ({ id: `log-ficticio-${i}` }))
    const depois = linhas.filter((l) => pertenceAoEscopo(escopoDeGestaoAtual(), escopoDoImportLog(l)))
    expect(depois.length).toBe(linhas.length)
  })

  it('`escopoDoImportLog` ignora a linha de propósito (é o que o torna no-op)', () => {
    // Duas linhas diferentes, o mesmo escopo. Quando isto deixar de valer, é porque a
    // F62 trocou o corpo — e aí este teste é o primeiro a dizer que a virada aconteceu.
    expect(escopoDoImportLog({ id: 'a' })).toEqual(escopoDoImportLog({ id: 'b' }))
  })
})

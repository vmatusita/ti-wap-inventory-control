import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertGuardsAndGetConfig } from '../env-guard'
import {
  ORDEM_DE_INSERCAO,
  REFS_DE_ENSAIO,
  REFS_DE_PRODUCAO_CONHECIDOS,
  exigirAmbientePermitido,
  montarTransacao,
  prefixoDasCopias,
  refDaDatabaseUrl,
  refDaUrl,
  sqlDaSequencia,
  sqlDeInsercao,
  versaoDoBackup,
} from './restaurar.mjs'

// =============================================================================
// A GUARDA DO RESTAURADOR — F54, invertida na F55 (10/09/2026).
// =============================================================================
// `scripts/db/restaurar.mjs` é `.mjs` e `scripts/env-guard.ts` é `.ts`: um não importa
// o outro sem transpilar, então a lista de refs PERMITIDOS existe duplicada. Duas
// cópias da mesma verdade é como uma das duas envelhece sem ninguém notar — e esta
// aqui, se envelhecer, deixa um script de restauração apontar para o acervo real.
//
// Este arquivo é o que impede isso: ele lê os DOIS e exige que os conjuntos sejam
// iguais. É o mesmo desenho de `chave-sql.test.ts` e `tipos-item-sql.test.ts`, as
// guardas TS↔SQL da casa — só que aqui a fronteira é TS↔MJS.
//
// ⚠ A INVERSÃO DA F55: até então a identidade do ambiente era conferida por uma lista
// de NEGAÇÃO com UM item (`REFS_DE_PRODUCAO`). Um ref INVENTADO — ou um projeto de
// produção NOVO — passava. Agora é uma lista de PERMISSÃO (`REFS_DE_ENSAIO`): o ref
// TEM de estar nela. Ref inventado → RECUSA. Ref de produção → RECUSA, com a mensagem
// explícita de sempre (docs/RUNBOOK-BANCO.md) preservada à parte, em
// `REFS_DE_PRODUCAO_CONHECIDOS`, usada SÓ para dar a mensagem certa.
//
// ⚠ A LIÇÃO DA F11 (22/07/2026), que está escrita no `env-guard.ts` e que este teste
// mantém viva: as guardas de lá comparavam `SEED_PROJECT_REF` com a URL — um teste de
// CONSISTÊNCIA, não de IDENTIDADE. Com os dois apontando para produção (o estado real
// do `.env.local` naquele dia) as três guardas passavam. Consistência não protege de
// nada quando o erro é coerente; só a lista de permissão protege.
// =============================================================================

const RAIZ = process.cwd()

/** A lista literal declarada em `scripts/env-guard.ts`, lida do FONTE. */
function refsDoEnvGuard(): string[] {
  const fonte = readFileSync(join(RAIZ, 'scripts', 'env-guard.ts'), 'utf8')
  const m = /const REFS_DE_ENSAIO = \[([^\]]*)\]/.exec(fonte)
  if (!m) throw new Error('não achei `REFS_DE_ENSAIO` em scripts/env-guard.ts')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()
}

describe('1. as duas listas de refs de ensaio não divergem', () => {
  it('o env-guard declara ao menos um ref (guarda do próprio teste)', () => {
    // Sem isto, esvaziar as DUAS listas faria a igualdade passar por vacuidade — e uma
    // lista de PERMISSÃO vazia recusaria TUDO, o que parece seguro mas esconde um erro
    // de digitação (o ref certo saiu da lista sem ninguém notar).
    expect(refsDoEnvGuard().length).toBeGreaterThan(0)
  })

  it('`restaurar.mjs` e `env-guard.ts` listam EXATAMENTE os mesmos refs', () => {
    expect([...REFS_DE_ENSAIO].sort()).toEqual(refsDoEnvGuard())
  })
})

describe('2. o ref é extraído das DUAS formas de `DATABASE_URL` do Supabase', () => {
  const REF = 'pbtjcalbmepmrqzprusb'

  it('forma direta — o ref está no host', () => {
    expect(refDaDatabaseUrl(`postgresql://postgres:senha@db.${REF}.supabase.co:5432/postgres`)).toBe(
      REF,
    )
  })

  it('forma POOLER — o ref está no NOME DE USUÁRIO, e é a armadilha', () => {
    // É a forma que o painel do Supabase oferece primeiro. Uma guarda que só olhasse o
    // host deixaria a `DATABASE_URL` de produção passar inteira.
    expect(
      refDaDatabaseUrl(`postgresql://postgres.${REF}:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`),
    ).toBe(REF)
  })

  it('um Postgres local não tem ref, e isso não é erro', () => {
    expect(refDaDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:5432/estoque')).toBeNull()
    expect(refDaDatabaseUrl(undefined)).toBeNull()
  })

  it('o ref da URL do projeto sai do subdomínio', () => {
    expect(refDaUrl(`https://${REF}.supabase.co`)).toBe(REF)
    expect(refDaUrl('não é url')).toBeNull()
  })

  it('as duas formas do ref de PRODUÇÃO CONHECIDA são reconhecidas (é o que dá a mensagem certa)', () => {
    // A asserção que amarra as duas seções: extrair o ref não basta se ele não for
    // comparado contra a lista — aqui, a lista usada SÓ para a mensagem.
    for (const u of [
      `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres`,
      `postgresql://postgres.${REF}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
    ]) {
      expect(REFS_DE_PRODUCAO_CONHECIDOS).toContain(refDaDatabaseUrl(u))
    }
  })
})

describe('3. as duas armadilhas da ata 1 da F53 estão no SQL gerado', () => {
  const backup = {
    versao: 1,
    movimentacoes: [{ id: 'm1', ordem: 42, ativo_id: 'a1', tipo: 'compra' }],
    ativos: [{ id: 'a1', patrimonio: 'WAP0000001' }],
  }

  it('`movimentacoes` recebe `overriding system value` — senão o INSERT é recusado', () => {
    expect(sqlDeInsercao('movimentacoes', backup.movimentacoes)).toContain('overriding system value')
  })

  it('e SÓ ela: as outras tabelas não têm coluna identity', () => {
    expect(sqlDeInsercao('ativos', backup.ativos)).not.toContain('overriding system value')
  })

  it('o `setval` da sequência entra na transação — senão o próximo INSERT colide', () => {
    const sql = montarTransacao(backup, 'reset/acervo/filial-9/x.json')
    expect(sql).toContain('setval')
    expect(sql).toContain("pg_get_serial_sequence('public.movimentacoes','ordem')")
    // E DEPOIS dos inserts: um `setval` antes deles leria um max() que ainda não existe.
    expect(sql.indexOf('setval')).toBeGreaterThan(sql.indexOf('insert into public.movimentacoes'))
  })

  it('o `setval` usa max(ordem), não uma contagem', () => {
    // `count(*)` daria o número errado sempre que a `ordem` tiver buracos — e ela tem,
    // porque `overriding system value` não consome a sequência.
    expect(sqlDaSequencia()).toContain('max(ordem)')
    expect(sqlDaSequencia()).not.toContain('count(')
  })
})

describe('4. a terceira e a quarta armadilhas', () => {
  const sql = montarTransacao(
    { versao: 1, ativos: [{ id: 'a1' }], movimentacoes: [{ id: 'm1', ordem: 1 }] },
    'x.json',
  )

  it('o trigger é DESLIGADO e RELIGADO dentro da transação', () => {
    expect(sql).toContain('disable trigger trg_aplicar_movimentacao')
    expect(sql).toContain('enable trigger trg_aplicar_movimentacao')
    expect(sql.indexOf('disable trigger')).toBeLessThan(sql.indexOf('enable trigger'))
  })

  it('as constraints viram IMEDIATAS antes do `alter table`, e voltam a DEFERIDAS', () => {
    // A quarta armadilha, nas duas metades: sem a primeira o `alter table` dá 55006;
    // sem a segunda, `aplicar_movimentacao` passa a dar 23503 no uso normal.
    expect(sql).toContain('set constraints all immediate')
    expect(sql).toContain('set constraints all deferred')
    expect(sql.indexOf('set constraints all immediate')).toBeLessThan(sql.indexOf('disable trigger'))
    expect(sql.indexOf('set constraints all deferred')).toBeGreaterThan(sql.indexOf('enable trigger'))
  })

  it('a janela do `guarda_acervo` é aberta e FECHADA', () => {
    // Aberta porque o backup pode conter linhas `forcado = true` (0079), que a guarda
    // recusaria. Fechada porque deixá-la aberta seria entregar o banco destravado.
    expect(sql).toContain("set_config('estoque.dev_destrutivo','on',true)")
    expect(sql).toContain("set_config('estoque.dev_destrutivo','off',true)")
  })

  it('tudo acontece numa transação só', () => {
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql).toContain('commit;')
  })
})

describe('5. a ordem de inserção respeita as FKs', () => {
  it('ativos vem antes de movimentacoes, que vem antes de pendencias_item', () => {
    const i = (t: string) => ORDEM_DE_INSERCAO.indexOf(t)
    expect(i('ativos')).toBeLessThan(i('movimentacoes'))
    expect(i('movimentacoes')).toBeLessThan(i('pendencias_item'))
    expect(i('movimentacoes')).toBeLessThan(i('lancamentos_item'))
    expect(i('ativos')).toBeLessThan(i('anotacoes'))
  })

  it('a ordem cobre as seis tabelas do acervo, sem repetir', () => {
    expect(ORDEM_DE_INSERCAO.length).toBe(6)
    expect(new Set(ORDEM_DE_INSERCAO).size).toBe(6)
  })

  it('o SQL sai NA ordem declarada', () => {
    const sql = montarTransacao(
      { ativos: [{ id: 'a' }], movimentacoes: [{ id: 'm' }], anotacoes: [{ id: 'n' }] },
      'x.json',
    )
    expect(sql.indexOf('insert into public.ativos')).toBeLessThan(
      sql.indexOf('insert into public.movimentacoes'),
    )
    expect(sql.indexOf('insert into public.movimentacoes')).toBeLessThan(
      sql.indexOf('insert into public.anotacoes'),
    )
  })
})

describe('6. o formato antigo não finge estar completo', () => {
  it('cabeçalho SEM `versao` vale 0, e não 1', () => {
    // Tratá-lo como v1 faria a conferência de contagens comparar contra `undefined` e
    // "passar". A diferença entre "não conferi" e "conferi e bateu" é a única coisa que
    // impede alguém de restaurar achando que restaurou tudo.
    expect(versaoDoBackup({ bloco: 'acervo', gerado_em: 'x' })).toBe(0)
    expect(versaoDoBackup({ versao: 1 })).toBe(1)
    expect(versaoDoBackup(null)).toBe(0)
  })
})

describe('7. o prefixo das cópias de .docx é o mesmo que o app grava', () => {
  it('é o caminho do JSON sem a extensão, mais `/termos/`', () => {
    // Espelha `prefixoDasCopias(raizDoBackupEmArquivo(...))` de
    // `src/lib/storage/copiar-antes-de-remover.ts`. Divergir aqui faria o restaurador
    // procurar os documentos assinados na pasta errada.
    expect(prefixoDasCopias('import/filial-3/2026-09-09T14-05-33-102Z.json')).toBe(
      'import/filial-3/2026-09-09T14-05-33-102Z/termos/',
    )
    expect(prefixoDasCopias('reset/acervo/global/2026-09-09T14-05-33-102Z.json')).toBe(
      'reset/acervo/global/2026-09-09T14-05-33-102Z/termos/',
    )
  })
})

describe('8. o gerador de literais não quebra com o que o acervo tem de verdade', () => {
  it('aspas simples no texto são escapadas', () => {
    const sql = sqlDeInsercao('ativos', [{ id: 'a', obs: "o'brien" }])
    expect(sql).toContain("'o''brien'")
  })

  it('null, boolean e número não viram string', () => {
    const sql = sqlDeInsercao('movimentacoes', [{ id: 'm', ordem: 7, forcado: true, obs: null }])
    expect(sql).toContain('7')
    expect(sql).toContain('true')
    expect(sql).toContain('null')
  })

  it('array de texto vira `array[...]` (é assim que `itens_faltantes` chega)', () => {
    const sql = sqlDeInsercao('movimentacoes', [{ id: 'm', itens_faltantes: ['carregador', 'mochila'] }])
    expect(sql).toContain("array['carregador','mochila']")
  })

  it('objeto vira jsonb (é assim que `dados` do termo chega)', () => {
    const sql = sqlDeInsercao('termos_gerados', [{ id: 't', dados: { a: 1 } }])
    expect(sql).toContain('::jsonb')
  })

  it('lista vazia não gera INSERT nenhum', () => {
    expect(sqlDeInsercao('ativos', [])).toBeNull()
    expect(sqlDeInsercao('ativos', undefined)).toBeNull()
  })

  it('linhas com colunas DIFERENTES viram um INSERT com a união das colunas', () => {
    // O backup é um dump de `select('*')`, então isso não deveria acontecer — mas se
    // acontecer, perder silenciosamente a coluna de uma linha seria pior que o `null`.
    const sql = sqlDeInsercao('ativos', [{ id: 'a' }, { id: 'b', patrimonio: 'WAP0000002' }])
    expect(sql).toContain('id, patrimonio')
    expect(sql).toContain('null')
  })
})

// =============================================================================
// 9. A INVERSÃO EM AÇÃO (F55) — as duas guardas de verdade recusando de verdade.
// =============================================================================
// As oito seções acima provam a FORMA (listas iguais, extração correta). Esta prova o
// COMPORTAMENTO: chamar as duas funções que decidem — `exigirAmbientePermitido`
// (`.mjs`) e `assertGuardsAndGetConfig` (`.ts`) — com um ref inventado e com o ref de
// produção conhecido, e confirmar que as DUAS recusam. `process.exit` é mockado para
// lançar em vez de matar o processo de teste; `console.error` é silenciado.
// =============================================================================

const ENV_ORIGINAL = { ...process.env }

afterEach(() => {
  // As duas guardas leem `process.env` diretamente (não recebem config injetada) —
  // sem isto, uma rodada mancharia o ambiente da próxima `it`.
  process.env = { ...ENV_ORIGINAL }
  vi.restoreAllMocks()
})

/** Chama `fn` com `process.exit`/`console.error` mockados e afirma que recusou. */
function esperarRecusa(fn: () => void) {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('[teste] process.exit chamado')
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(fn).toThrow('[teste] process.exit chamado')
  expect(exitSpy).toHaveBeenCalledWith(1)
}

/** As variáveis mínimas que `assertGuardsAndGetConfig` exige, para um ref dado. */
function envDeEnsaioCom(ref: string) {
  process.env.SEED_CONFIRM = 'sim'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-ficticia-de-teste'
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${ref}.supabase.co`
  process.env.SEED_PROJECT_REF = ref
}

describe('9. ref inventado e ref de produção são recusados pelas DUAS guardas', () => {
  const REF_INVENTADO = 'aaaaaaaaaaaaaaaaaaaa' // 20 chars, nenhum projeto real
  const REF_PRODUCAO = REFS_DE_PRODUCAO_CONHECIDOS[0]

  it('restaurar.mjs (exigirAmbientePermitido) recusa ref inventado', () => {
    esperarRecusa(() => exigirAmbientePermitido([REF_INVENTADO]))
  })

  it('restaurar.mjs (exigirAmbientePermitido) recusa o ref de produção', () => {
    esperarRecusa(() => exigirAmbientePermitido([REF_PRODUCAO]))
  })

  it('env-guard.ts (assertGuardsAndGetConfig) recusa ref inventado', () => {
    envDeEnsaioCom(REF_INVENTADO)
    esperarRecusa(() => assertGuardsAndGetConfig())
  })

  it('env-guard.ts (assertGuardsAndGetConfig) recusa o ref de produção', () => {
    envDeEnsaioCom(REF_PRODUCAO)
    esperarRecusa(() => assertGuardsAndGetConfig())
  })

  it('o ref de ENSAIO, ao contrário, passa nas duas (guarda do próprio teste)', () => {
    // Sem isto, os quatro testes acima poderiam estar recusando TUDO por engano (uma
    // guarda invertida, ou uma exceção antes da checagem) e passariam do mesmo jeito.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('[teste] process.exit chamado')
    })
    expect(() => exigirAmbientePermitido([REFS_DE_ENSAIO[0]])).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()

    envDeEnsaioCom(REFS_DE_ENSAIO[0])
    expect(() => assertGuardsAndGetConfig()).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })
})

describe('10. o Postgres local sem ref é caso legítimo SÓ em restaurar.mjs — semânticas diferentes', () => {
  it('restaurar.mjs: nenhum ref (Postgres local) passa sem recusar — é o caso do CI', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('[teste] process.exit chamado')
    })
    const semRef = refDaDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:5432/estoque')
    expect(semRef).toBeNull()
    expect(() => exigirAmbientePermitido([semRef])).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('env-guard.ts NÃO tem essa exceção: URL ausente é RECUSADO, não aceito como "sem ref"', () => {
    // env-guard.ts não lê uma DATABASE_URL de Postgres — ele exige
    // NEXT_PUBLIC_SUPABASE_URL sempre. Sem ela, o resultado é recusa por configuração
    // ausente, nunca uma passagem livre equivalente ao Postgres local do restaurador.
    process.env.SEED_CONFIRM = 'sim'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-ficticia-de-teste'
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SEED_PROJECT_REF
    esperarRecusa(() => assertGuardsAndGetConfig())
  })
})

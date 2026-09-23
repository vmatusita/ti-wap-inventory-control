import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertGuardsAndGetConfig } from '../env-guard'
import {
  MAIOR_VERSAO_CONHECIDA,
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
  sqlDeReligarElos,
  sqlDeReligarPonteiros,
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

// =============================================================================
// 11-13. A VERSÃO 2 (F56 · Frente F, 0140) — o backup do conserto da FK.
// =============================================================================
// `main()` não é exportada (a recusa de versão desconhecida e a leitura do
// arquivo/bucket vivem ali), então o que se testa aqui — no molde do describe 6
// ("o formato antigo não finge estar completo"), que já testa `versaoDoBackup`
// isolada de `main()` — é a LÓGICA pura que `main()` usa para decidir, e a forma
// do SQL que `montarTransacao` monta a partir das duas chaves novas.
// =============================================================================

describe('11. religar os dois elos de `lancamentos_item` (o UPDATE da versão 2)', () => {
  it('um UPDATE só, com os dois elos — sem trigger, sem INSERT', () => {
    const sql = sqlDeReligarElos([
      { id: 'l1', movimentacao_id: 'm1', pendencia_item_id: null },
      { id: 'l2', movimentacao_id: null, pendencia_item_id: 'p1' },
    ])
    expect(sql).toContain('update public.lancamentos_item as li')
    expect(sql).toContain('set movimentacao_id   = v.movimentacao_id')
    expect(sql).toContain('pendencia_item_id = v.pendencia_item_id')
    expect(sql).toContain("('l1', 'm1', null)")
    expect(sql).toContain("('l2', null, 'p1')")
    expect(sql).toContain('where li.id = v.id')
    // Nunca um INSERT: religar não é reinserir a linha (ela já existe).
    expect(sql).not.toMatch(/insert into/i)
  })

  it('lista vazia ou ausente não gera UPDATE nenhum', () => {
    expect(sqlDeReligarElos([])).toBeNull()
    expect(sqlDeReligarElos(undefined)).toBeNull()
  })
})

describe('12. religar `ativos.substitui_ativo_id` (o mesmo UPDATE serve o backup do RESET)', () => {
  it('um UPDATE só, pelo id do ativo QUE APONTA', () => {
    const sql = sqlDeReligarPonteiros([{ id: 'sub1', substitui_ativo_id: 'd1' }])
    expect(sql).toContain('update public.ativos as a')
    expect(sql).toContain('set substitui_ativo_id = v.substitui_ativo_id')
    expect(sql).toContain("('sub1', 'd1')")
    expect(sql).toContain('where a.id = v.id')
  })

  it('lista vazia ou ausente não gera UPDATE nenhum', () => {
    expect(sqlDeReligarPonteiros([])).toBeNull()
    expect(sqlDeReligarPonteiros(undefined)).toBeNull()
  })

  it('MONTA sozinho a partir de um backup versão 1 do RESET com `ponteiros_perdidos` — a lacuna pré-existente fechada "de graça"', () => {
    // ⚠ POR PRESENÇA da chave, não por `versao`: o backup do reset é versão 1
    // (a Decisão 4 da F54 só acrescentou `versao`/`contagens`, não bumpou para
    // 2) e grava `ponteiros_perdidos` desde a F23 — bem antes desta fase.
    const backupDoReset = {
      versao: 1,
      ativos: [{ id: 'a1' }],
      ponteiros_perdidos: [{ id: 'sub1', substitui_ativo_id: 'a1' }],
    }
    const sql = montarTransacao(backupDoReset, 'reset/acervo/global/x.json')
    expect(sql).toContain('update public.ativos as a')
    expect(sql).toContain("('sub1', 'a1')")
  })
})

describe('13. `montarTransacao` religa os dois elos SÓ quando o backup os traz', () => {
  it('versão 2 completa: os dois UPDATEs entram DEPOIS das inserções e DENTRO da janela', () => {
    const backup = {
      versao: 2,
      ativos: [{ id: 'a1' }],
      movimentacoes: [{ id: 'm1', ordem: 1 }],
      pendencias_item: [{ id: 'p1', ativo_id: 'a1', movimentacao_id: 'm1', item: 'x', filial_id: 1 }],
      lancamentos_desvinculados: [{ id: 'l1', movimentacao_id: 'm1', pendencia_item_id: null }],
      ponteiros_perdidos: [{ id: 'sub1', substitui_ativo_id: 'a1' }],
    }
    const sql = montarTransacao(backup, 'import/filial-1/x.json')

    expect(sql).toContain('update public.lancamentos_item as li')
    expect(sql).toContain('update public.ativos as a')

    // DEPOIS das inserções (elas religam id que a inserção acabou de criar).
    expect(sql.indexOf('insert into public.pendencias_item')).toBeLessThan(
      sql.indexOf('update public.lancamentos_item as li'),
    )
    // DENTRO da janela: antes do 'off' que a fecha.
    expect(sql.indexOf('update public.lancamentos_item as li')).toBeLessThan(
      sql.lastIndexOf("set_config('estoque.dev_destrutivo','off',true)"),
    )
    expect(sql.indexOf('update public.ativos as a')).toBeLessThan(
      sql.lastIndexOf("set_config('estoque.dev_destrutivo','off',true)"),
    )
  })

  it('versão 1 (sem as chaves novas): nenhum dos dois UPDATEs aparece — compatível com o formato de sempre', () => {
    const backup = { versao: 1, ativos: [{ id: 'a1' }], movimentacoes: [{ id: 'm1', ordem: 1 }] }
    const sql = montarTransacao(backup, 'import/filial-1/x.json')
    expect(sql).not.toContain('update public.lancamentos_item as li')
    expect(sql).not.toContain('update public.ativos as a')
  })
})

describe('14. `main()` recusa versão acima da que o restaurador conhece (critério 17)', () => {
  // `main()` não é exportada — o que se testa é a MESMA comparação que ela faz
  // (`versaoDoBackup(backup) > MAIOR_VERSAO_CONHECIDA`), com as duas peças
  // exportadas e puras. `esperarRecusa`/mock de `process.exit` não se aplica
  // aqui porque a chamada de `process.exit` mora dentro de `main()`, não numa
  // função exportada — testar a PREDICADO é o que sobra sem reestruturar o
  // script só para o teste (o script continua `.mjs` de linha de comando).
  it('MAIOR_VERSAO_CONHECIDA é 2 — a versão que a 0140 introduziu', () => {
    expect(MAIOR_VERSAO_CONHECIDA).toBe(2)
  })

  it('versão 1 e versão 2 NÃO disparam a recusa', () => {
    expect(versaoDoBackup({ versao: 1 }) > MAIOR_VERSAO_CONHECIDA).toBe(false)
    expect(versaoDoBackup({ versao: 2 }) > MAIOR_VERSAO_CONHECIDA).toBe(false)
  })

  it('versão 3 (desconhecida) DISPARA a recusa — a mesma comparação de `main()`', () => {
    expect(versaoDoBackup({ versao: 3 }) > MAIOR_VERSAO_CONHECIDA).toBe(true)
  })

  it('backup sem `versao` (formato anterior ao campo, versaoDoBackup = 0) NÃO dispara — continua funcionando igual', () => {
    expect(versaoDoBackup({ bloco: 'acervo' }) > MAIOR_VERSAO_CONHECIDA).toBe(false)
  })
})

describe('F63 · `empresa_id` no backup — o INSERT que o restaurador monta (sabotagem H, a metade TS)', () => {
  // `sqlDeInsercao` monta a lista de colunas com as CHAVES das linhas do backup. `restauracao.sql`
  // (cenário 8) prova, no Postgres do CI, o que o banco faz com as duas formas; aqui se prova que o
  // restaurador GERA essas duas formas. `scripts/db/restaurar.mjs` não muda na F63.
  const antes = { id: '63000000-0000-4000-8000-0000000008a1', patrimonio: 'WAP0063801' }
  const depois = { id: '63000000-0000-4000-8000-0000000008b1', patrimonio: 'WAP0063802', empresa_id: '63000000-0000-4000-8000-0000000000e8' }

  it('backup de ANTES da F63 (sem a chave): a coluna fica FORA do INSERT — o default (a empresa legada) preenche', () => {
    const sql = sqlDeInsercao('ativos', [antes])
    expect(sql).toMatch(/^insert into public\.ativos \(id, patrimonio\)/)
    expect(sql).not.toContain('empresa_id')
  })

  it('backup de DEPOIS da F63 (com a chave): a coluna ENTRA, com a empresa que o backup traz', () => {
    const sql = sqlDeInsercao('ativos', [depois])
    expect(sql).toMatch(/^insert into public\.ativos \(id, patrimonio, empresa_id\)/)
    expect(sql).toContain("'63000000-0000-4000-8000-0000000000e8'")
  })

  it('lote MISTO (as duas formas juntas): a linha sem a chave vai com null EXPLÍCITO — e o banco recusa ALTO (23502), nunca grava errado', () => {
    // Achado da revisão adversarial da F63, registrado e NÃO corrigido aqui (o restaurador é intocado
    // nesta fase): um backup só é misto se alguém juntar arquivos de antes e de depois da F63. Com a
    // coluna `not null`, o null explícito é recusado pelo banco — a restauração falha alto, não
    // grava a empresa errada. A F67 (que tira o default) é quem faz o restaurador preencher a empresa.
    const sql = sqlDeInsercao('ativos', [antes, depois])
    expect(sql).toMatch(/^insert into public\.ativos \(id, patrimonio, empresa_id\)/)
    expect(sql).toContain("'WAP0063801', null)")
  })
})

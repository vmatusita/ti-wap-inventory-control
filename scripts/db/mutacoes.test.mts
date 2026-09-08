import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { corpoVigente, definicoesDeFuncao } from './corpo-vigente.mjs'
import { MUTACOES, QUARENTENA } from './mutacoes.mjs'

// A TRAVA DO CATÁLOGO — F47. RODA SEM BANCO, e é essa a razão de ela existir.
//
// A mesa do Johnny não tem Postgres (docs/RELATORIO-F46.md §2.1), então tudo que só o
// injetor descobriria custa um ciclo de push. O erro mais caro é o mais bobo: um rótulo
// digitado errado em `derruba`. Ele não quebra nada — ele faz a mutação parecer NÃO
// DETECTADA, que é o diagnóstico mais valioso da fase, gasto num erro de digitação. Esta
// suíte o pega em meio segundo.
//
// O que ela NÃO faz: provar que a mutação é detectada. Isso só o banco responde, e é o
// trabalho do `npm run db:test:mutations`.

const RAIZ = process.cwd()
const PASTA_ROTEIROS = join(RAIZ, 'supabase', 'tests')

/** Os seis roteiros que a ficha da F47 nomeia como alvo do lote. */
const ROTEIROS_DA_FICHA = [
  'papeis_rls.sql',
  'seguranca_catalogo.sql',
  'cargo_dev.sql',
  'dev_destrutivo.sql',
  'import_substituir.sql',
  'conflito_filiais.sql',
]

function fonteDoRoteiro(nome: string): string {
  return readFileSync(join(PASTA_ROTEIROS, nome), 'utf8')
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * O rótulo existe LITERALMENTE no fonte, como `✗ <rótulo>` seguido de delimitador.
 *
 * ⚠ O lookahead não é decoração: sem ele, `2c` casaria dentro de `✗ 2c-bis` e um rótulo
 * inexistente passaria por existir. A mesma armadilha de prefixo que o injetor evita em
 * tempo de execução comparando o TOKEN inteiro.
 *
 * `\s+` e não um espaço só: `conflito_filiais.sql` usa DOIS espaços depois do ✗ em todas
 * as 74 linhas dele, e os outros roteiros usam um.
 */
function rotuloExisteNoFonte(fonte: string, rotulo: string): boolean {
  if (new RegExp(`✗\\s+${escaparRegex(rotulo)}(?=[\\s:'])`).test(fonte)) return true
  // A SEGUNDA FORMA — F48. Os catálogos novos (`catalogo_policies.sql`,
  // `catalogo_secdef.sql`, `isolamento_tenant.sql`) emitem o ✗ pela FERRAMENTA:
  // `pg_temp.assert_zero_de(rotulo, ruins, universo)` monta `raise warning '✗ %: …'`
  // em tempo de execução, então o `✗ <rótulo>` literal não existe no fonte deles.
  //
  // ⚠ Recusar essa forma empurraria os roteiros novos de volta para o `if v_n = 0 then ✓`,
  // que é a tautologia que a F45 criou a ferramenta para matar — a trava de mesa não
  // pode ter opinião sobre COMO se conta, só sobre o rótulo existir de verdade.
  //
  // O rótulo é o começo do PRIMEIRO argumento da chamada, e a régua é a mesma: token
  // inteiro, nunca prefixo (o lookahead exige espaço ou aspas logo depois, então `1a`
  // não casa dentro de `1a-bis`).
  return new RegExp(
    `assert_zero_de\\(\\s*'${escaparRegex(rotulo)}(?=[\\s'])`,
  ).test(fonte)
}

describe('1. o lote tem a forma e o tamanho que a ficha pede', () => {
  it('tem entre 20 e 48 mutações ATIVAS', () => {
    // ⚠ O TETO SUBIU DE 44 PARA 48 NA F51 (08/09/2026). A fase decompôs
    // `importar_ativos_substituir` (393 linhas) em oito auxiliares e escreveu UMA
    // MUTAÇÃO POR AUXILIAR — sem isso, sete das oito nasceriam sem ninguém provar
    // que os roteiros sabem ficar vermelhos quando elas quebram, que é a única
    // coisa que o injetor mede. Duas das oito são as do import REAPONTADAS (não
    // somam), então o lote foi de 39 para 45.
    //
    // 48 e não 45: a F52 acrescenta guardas de escopo e vai precisar de folga, e
    // um teto colado no número de hoje só força outra decisão daqui a uma semana —
    // que é como um teto vira ritual. A régua de desenho continua sendo a de baixo
    // (quarentena abaixo de um terço) e o injetor rodar INCONDICIONALMENTE no CI.
    // ⚠ O TETO SUBIU DE 30 PARA 44 NA F48 (07/09/2026), e o motivo é escrito para não
    // virar hábito. A F47 fechou com 28 ativas e 5 em quarentena. A F48 (a) fortaleceu os
    // quatro cenários que a quarentena nomeava e promoveu TRÊS entradas de volta ao lote,
    // e (b) escreveu OITO mutações novas — as sabotagens obrigatórias dos catálogos
    // novos, que a ordem exige provar e que, escritas aqui, deixam de ser um log de uma
    // tarde e passam a rodar a cada push. 28 + 3 + 8 = 39. O teto de 30 era a folga da
    // F47, não uma régua de desenho.
    //
    // A régua de desenho é a de baixo (a quarentena abaixo de um terço) e a do injetor
    // rodar INCONDICIONALMENTE no CI. O teto existe só para que um lote que cresça sem
    // ninguém perceber passe por uma decisão. Se a F51/F52 precisarem de mais, sobem o
    // número E escrevem por quê, como esta linha faz.
    expect(MUTACOES.length).toBeGreaterThanOrEqual(20)
    expect(MUTACOES.length).toBeLessThanOrEqual(48)
  })

  it('os `id` são únicos', () => {
    const ids = MUTACOES.map((m) => m.id)
    expect(new Set(ids).size, `ids repetidos: ${ids.filter((i, k) => ids.indexOf(i) !== k)}`).toBe(
      ids.length,
    )
  })

  it('os `id` da quarentena não colidem com os do lote ativo', () => {
    const ativos = new Set(MUTACOES.map((m) => m.id))
    for (const q of QUARENTENA) expect(ativos.has(q.id), `${q.id} está nos dois`).toBe(false)
  })

  it.each(MUTACOES.map((m) => [m.id, m] as const))('`%s` tem todos os campos obrigatórios', (_id, m) => {
    expect(m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(m.roteiro).toMatch(/^[a-z0-9_]+\.sql$/)
    expect(m.classe, 'sem classe de defeito').toBeTruthy()
    expect(Array.isArray(m.derruba)).toBe(true)
    expect(m.derruba.length, 'mutação sem rótulo esperado não prova nada').toBeGreaterThan(0)
    expect(m.porque.length, 'o `porque` é uma frase, não uma etiqueta').toBeGreaterThan(40)
    expect(typeof m.sql).toBe('string')
    expect(m.sql.trim().length).toBeGreaterThan(10)
  })

  it('as seis famílias de roteiro da ficha estão cobertas', () => {
    const cobertos = new Set(MUTACOES.map((m) => m.roteiro))
    for (const r of ROTEIROS_DA_FICHA) {
      expect(cobertos.has(r), `nenhuma mutação mira ${r}`).toBe(true)
    }
  })

  it('há ao menos UMA do tipo "confere o papel e esquece o escopo"', () => {
    // É a quebra cross-tenant clássica e o ensaio geral da F66 — a ficha a exige
    // nominalmente. Sem ela o lote inteiro pode estar certo e ainda assim não responder
    // à pergunta que motivou a fase.
    const dela = MUTACOES.filter((m) => m.classe === 'papel-sem-escopo')
    expect(dela.length).toBeGreaterThanOrEqual(1)
    for (const m of dela) {
      expect(m.sql).toContain('pode_escrever()')
      expect(m.sql).not.toContain('pode_escrever_filial')
    }
  })
})

describe('2. todo rótulo em `derruba` existe DE VERDADE no roteiro', () => {
  // A asserção mais importante deste arquivo. Um rótulo com erro de digitação viraria
  // "mutação nunca detectada" — o achado mais valioso da fase, gasto num engano.
  const pares = MUTACOES.flatMap((m) => m.derruba.map((r) => [m.id, m.roteiro, r] as const))

  it('há pares para conferir (guarda do próprio teste)', () => {
    expect(pares.length).toBeGreaterThan(25)
  })

  it.each(pares)('%s → %s tem o cenário `%s`', (id, roteiro, rotulo) => {
    expect(existsSync(join(PASTA_ROTEIROS, roteiro)), `${roteiro} não existe`).toBe(true)
    expect(
      rotuloExisteNoFonte(fonteDoRoteiro(roteiro), rotulo),
      `${id}: o roteiro ${roteiro} não emite "✗ ${rotulo}" em lugar nenhum — rótulo errado ou renomeado`,
    ).toBe(true)
  })

  it('o casador de rótulo NÃO aceita prefixo (guarda do próprio teste)', () => {
    // Se ele aceitasse, a asserção acima passaria para rótulo inventado que fosse
    // prefixo de um real — e o teste estaria mentindo.
    const fonte = "raise warning '✗ 2c-bis operador MOVIMENTOU …'"
    expect(rotuloExisteNoFonte(fonte, '2c-bis')).toBe(true)
    expect(rotuloExisteNoFonte(fonte, '2c')).toBe(false)
    // E aceita os DOIS espaços de conflito_filiais.sql.
    expect(rotuloExisteNoFonte("raise warning '✗ 1a  esperava 4 grupos'", '1a')).toBe(true)
  })

  it('o casador reconhece a forma `assert_zero_de`, e ali também não aceita prefixo (F48)', () => {
    const viaFerramenta = "  if pg_temp.assert_zero_de(\n       '9a nenhuma tabela NOVA na publication' ||"
    expect(rotuloExisteNoFonte(viaFerramenta, '9a')).toBe(true)
    expect(rotuloExisteNoFonte(viaFerramenta, '9')).toBe(false)
    // Rótulo que não existe em forma nenhuma continua reprovando.
    expect(rotuloExisteNoFonte(viaFerramenta, '9b')).toBe(false)
  })
})

describe('3. as provas de que a mutação PEGOU', () => {
  const comProva = MUTACOES.filter((m) => m.prova)

  it('a maioria das mutações tem sonda de prova', () => {
    // Sem sonda, uma mutação que aplica mas não muda nada se disfarça de "não
    // detectada" — o diagnóstico errado, acusando de fraca uma asserção que está certa.
    expect(comProva.length / MUTACOES.length).toBeGreaterThanOrEqual(0.9)
  })

  it.each(comProva.map((m) => [m.id, m] as const))('`%s`: a sonda tem forma válida', (_id, m) => {
    expect(typeof m.prova!.sql).toBe('string')
    expect(m.prova!.sql.trim().toLowerCase().startsWith('select')).toBe(true)
    // Uma linha, uma coluna, comparada como texto: `t`/`f` do booleano do Postgres.
    expect(['t', 'f']).toContain(m.prova!.espera)
  })
})

describe('4. as policies citadas existem nas migrations', () => {
  const MIGRACOES = readdirSync(join(RAIZ, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(RAIZ, 'supabase', 'migrations', f), 'utf8'))
    .join('\n')

  const citadas = MUTACOES.flatMap((m) =>
    (m.policies ?? []).map((p) => [m.id, p.nome, p.tabela] as const),
  )

  it('há policies citadas (guarda do próprio teste)', () => {
    expect(citadas.length).toBeGreaterThanOrEqual(5)
  })

  it.each(citadas)('%s: a policy "%s" em %s existe', (id, nome, tabela) => {
    // Um nome de policy errado faria a mutação morrer em "não aplicou" — diagnóstico
    // certo, mas um ciclo de CI gasto por um erro de digitação que se pega aqui.
    const re = new RegExp(
      `(create|alter) policy "${escaparRegex(nome)}"\\s+on\\s+${escaparRegex(tabela)}\\b`,
      'i',
    )
    expect(re.test(MIGRACOES), `${id}: nenhuma migration declara "${nome}" em ${tabela}`).toBe(true)
  })
})

describe('5. dados 100% sintéticos (regra 2 do CLAUDE.md)', () => {
  const TUDO = JSON.stringify([...MUTACOES, ...QUARENTENA])

  it('nenhuma mutação cita patrimônio fora da faixa fictícia', () => {
    // Os roteiros usam `WAP0009xxx` e o smoke usa `WAP0001234`. Qualquer OUTRO
    // patrimônio num catálogo que só mexe em estrutura é dado real vazando.
    const patrimonios = [...TUDO.matchAll(/WAP\d{7}/g)].map((m) => m[0])
    expect(patrimonios, 'o catálogo não deveria citar patrimônio nenhum').toEqual([])
  })

  /** As formas que EXECUTAM perda de dado. */
  const DESTRUTIVO = /\b(delete\s+from|truncate|drop\s+(database|schema|table))\b/gi

  it('nenhuma mutação executa perda de dado como comando de topo', () => {
    // ⚠ A REGRA É SOBRE O QUE EXECUTA, e a distinção não é frescura: `importar_ativos_
    // substituir` TEM `delete from public.ativos` no corpo — o import de startup apaga a
    // filial antes de gravar, é o desenho dele. Reescrever a função com `create or
    // replace` não apaga nada; APLICAR um `delete` solto, sim. Uma regra que só grepasse
    // o texto reprovaria a mutação certa e ensinaria a afrouxá-la.
    for (const m of MUTACOES) {
      const ehDefinicaoDeFuncao = definicoesDeFuncao(m.sql).length === 1
      if (ehDefinicaoDeFuncao) continue
      expect(
        m.sql.match(DESTRUTIVO),
        `${m.id} não é definição de função e mesmo assim executa perda de dado`,
      ).toBeNull()
    }
  })

  it('as mutações que reescrevem função NÃO acrescentam perda de dado nenhuma', () => {
    // A outra metade: reescrever a função é seguro, mas reescrevê-la ACRESCENTANDO um
    // `delete` não seria. Comparamos contra o corpo vigente — a mutação só pode TIRAR
    // guarda, nunca plantar destruição.
    let conferidas = 0
    for (const m of MUTACOES) {
      const defs = definicoesDeFuncao(m.sql)
      if (defs.length !== 1) continue
      const d = defs[0]
      let vigente: string
      try {
        vigente = corpoVigente(`${d.esquema}.${d.nome}(${d.tipos.join(', ')})`, RAIZ).sql
      } catch {
        // F48 — a mutação CRIA uma função que não existe nas migrations (é o caso de
        // `catalogo-security-definer-nova-nao-classificada`, que sabota justamente o
        // "função nova entra sem ninguém decidir"). Não há corpo anterior para comparar,
        // e a regra que este bloco protege — "a mutação não ACRESCENTA destruição a uma
        // função existente" — não se aplica. A régua que se aplica é a do bloco de cima,
        // e ela é cobrada aqui explicitamente para a exceção não virar buraco.
        expect(
          m.sql.match(DESTRUTIVO),
          `${m.id} cria uma função nova E executa perda de dado`,
        ).toBeNull()
        continue
      }
      const antes = (vigente.match(DESTRUTIVO) ?? []).length
      const depois = (m.sql.match(DESTRUTIVO) ?? []).length
      expect(depois, `${m.id} acrescentou comando destrutivo ao corpo da função`).toBeLessThanOrEqual(
        antes,
      )
      conferidas++
    }
    expect(conferidas, 'nenhuma mutação de função foi conferida — o teste está cego').toBeGreaterThan(
      5,
    )
  })
})

describe('6. a quarentena é declarada, não é escape hatch', () => {
  it('nada da quarentena é executado pelo injetor', () => {
    // A garantia é estrutural: `MUTACOES` e `QUARENTENA` são arrays distintos e o motor
    // só percorre o primeiro. Esta asserção trava a separação.
    const ativos = new Set(MUTACOES.map((m) => m.id))
    for (const q of QUARENTENA) expect(ativos.has(q.id)).toBe(false)
  })

  it.each(QUARENTENA.map((q) => [q.id, q] as const))(
    '`%s` nomeia a fase que a adota e por que é indetectável hoje',
    (_id, q) => {
      expect(q.fase, 'entrada de quarentena sem fase adotante vira lixo permanente').toMatch(
        /^F\d+[A-Z]?$/,
      )
      expect(q.indetectavel.length, 'sem o motivo escrito, a quarentena é só uma desculpa').toBeGreaterThan(
        60,
      )
      expect(q.roteiro).toMatch(/^[a-z0-9_]+\.sql$/)
    },
  )

  it('a quarentena não passa de um TERÇO do lote', () => {
    // A régua da ordem: se passar, isso é a manchete do relatório, não nota de rodapé.
    // O teste existe para que a régua não dependa de alguém lembrar dela.
    const total = MUTACOES.length + QUARENTENA.length
    expect(
      QUARENTENA.length / total,
      `${QUARENTENA.length} de ${total} em quarentena — leia a régua da F47`,
    ).toBeLessThan(1 / 3)
  })
})

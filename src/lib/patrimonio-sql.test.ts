import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIGITOS_PATRIMONIO, PATRIMONIO_CANONICAL_RE, PREFIXO_PATRIMONIO_FONTE } from './patrimonio'
import { extrairPatrimonioDoHostname } from './import/deparas'
import {
  corpoVigente,
  definicoesDeFuncao,
  listarMigrations,
  PASTA_MIGRATIONS,
  tipoDoArgumento,
} from '../../scripts/db/corpo-vigente.mjs'

// =============================================================================
// A TRAVA DA DECISÃO 5 (F56 · Frente B) — a regex de patrimônio numa fonte só.
// =============================================================================
// POR QUE ELA EXISTE
//
// Até a F56, o formato de patrimônio (prefixo de 2-4 letras + 7 dígitos) estava
// hardcoded QUATRO vezes em dois arquivos (fato 18): `PATRIMONIO_CANONICAL_RE`
// (`patrimonio.ts:5`), dentro de `canonicalizarPatrimonio` (`:13`), duas vezes
// dentro de `expandirFaixa` (`:142-143`) e em `PATRIMONIO_EMBUTIDO_RE`
// (`deparas.ts:166`, com a divergência DELIBERADA de aceitar 1-7 dígitos, não só
// 7). Quatro cópias do MESMO literal `[A-Z]{2,4}` — um bug corrigido em uma e
// esquecido nas outras três não apareceria em teste nenhum, porque os 41 testes
// de `patrimonio.test.ts` testam COMPORTAMENTO, não a origem do literal.
//
// A partir da F56, as partes compartilhadas (`PREFIXO_PATRIMONIO_FONTE`,
// `DIGITOS_PATRIMONIO`) moram em `patrimonio.ts`, exportadas, e as quatro cópias
// DERIVAM delas por `new RegExp(...)`. Este arquivo prova a derivação (seção 1)
// e prova a segunda metade da Decisão 5: o SQL vigente não reimplementa o
// formato (fato 19 — a validação de formato é MONOPÓLIO do TypeScript desde a
// F7J; o Postgres barra só sanidade — vazio ou > 60 caracteres).
//
// COMPORTAMENTO IDÊNTICO: `patrimonio.test.ts` (41 casos, já existente) continua
// passando SEM MUDANÇA DE ASSERÇÃO — só a implementação interna troca de regex
// literal para regex composta. A prova de identidade byte-a-byte contra a
// implementação ANTIGA, sobre dezenas de milhares de entradas geradas, está em
// docs/f56-evidencias/B3-identidade-da-regex.txt (item 3 da ordem).
//
// ⚠ A PARTE DE `import_prefixos_patrimonio` (a tabela nova da migration `0139`,
// com o check `'^' + PREFIXO_PATRIMONIO_FONTE + '$'`) É DA FRENTE D — ela cria a
// migration e o seed dos 7 prefixos. Aqui só fica o lugar marcado: quando a
// `0139` existir, um teste que lê `corpoVigente('public.import_prefixos_patrimonio')`
// (ou a leitura direta da migration, se for `check` de tabela e não função) entra
// AO LADO das asserções desta seção 2, comparando o literal do check com
// `PREFIXO_PATRIMONIO_FONTE`.
// =============================================================================

const RAIZ = process.cwd()
const FONTE_PATRIMONIO_BRUTA = readFileSync(join(RAIZ, 'src', 'lib', 'patrimonio.ts'), 'utf8')
const FONTE_DEPARAS = readFileSync(join(RAIZ, 'src', 'lib', 'import', 'deparas.ts'), 'utf8')

/**
 * Remove comentário de bloco `/* *\/` e de linha `//` de um arquivo TypeScript —
 * uma MENÇÃO em prosa (histórico, exemplo) não é o defeito que a seção 1
 * persegue; só a cópia em CÓDIGO conta. Mesmo raciocínio de `semComentarios()`
 * em `enums-sql.test.ts` (não precisa tratar string literal: nenhum arquivo
 * desta dupla tem o padrão dentro de uma string).
 */
function semComentariosTs(ts: string): string {
  return ts
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((linha) => linha.replace(/\/\/.*$/, ''))
    .join('\n')
}

const FONTE_PATRIMONIO = semComentariosTs(FONTE_PATRIMONIO_BRUTA)

// -----------------------------------------------------------------------------
// 1. As quatro cópias derivam da MESMA fonte (leitura estrutural do próprio
//    texto-fonte, no molde de `tabelaDeAcentosNoSql` de `chave-sql.test.ts` —
//    adaptado de "SQL vs TS" para "TS vs TS", porque aqui as quatro cópias são
//    todas TypeScript).
// -----------------------------------------------------------------------------

describe('a regex de patrimônio deriva de uma fonte só (Decisão 5, fato 18)', () => {
  it('DIGITOS_PATRIMONIO é 7 (o tamanho do bloco de dígitos do formato canônico)', () => {
    expect(DIGITOS_PATRIMONIO).toBe(7)
  })

  it('PREFIXO_PATRIMONIO_FONTE é o literal do prefixo (2 a 4 letras maiúsculas)', () => {
    expect(PREFIXO_PATRIMONIO_FONTE).toBe('[A-Z]{2,4}')
  })

  it('o literal `[A-Z]{2,4}` aparece em CÓDIGO (fora de comentário) SÓ UMA VEZ — na exportação da fonte', () => {
    // Se aparecesse mais de uma vez, alguma das cópias (a canônica,
    // `canonicalizarPatrimonio` ou `expandirFaixa`) voltou a hardcodar o
    // literal em vez de referenciar `PREFIXO_PATRIMONIO_FONTE`. Comentário
    // (ex.: a nota sobre `SEM_PATRIMONIO` que cita o formato como referência)
    // pode mencionar o literal livremente — por isso o texto já vem sem
    // comentário aqui.
    const ocorrencias = FONTE_PATRIMONIO.split('[A-Z]{2,4}').length - 1
    expect(ocorrencias).toBe(1)
  })

  it('nenhuma cópia (fora de comentário) de patrimonio.ts hardcoda `\\d{7}` — todas interpolam DIGITOS_PATRIMONIO', () => {
    // `canonicalizarPatrimonio` continua com `\d+` LIVRE (o teto de 7 dígitos
    // SIGNIFICATIVOS é conferido em código, depois do match — unificar para
    // `\d{7}` quebraria zeros à esquerda, ex. WAP0000001 com 10 dígitos crus).
    // A canônica e a faixa usam `\d{${DIGITOS_PATRIMONIO}}` interpolado, nunca
    // o literal `7` escrito à mão dentro da classe de repetição.
    expect(FONTE_PATRIMONIO).not.toMatch(/\\d\{7\}/)
  })

  it('PATRIMONIO_CANONICAL_RE é `new RegExp` construída a partir da fonte (não mais um literal `/…/`)', () => {
    expect(PATRIMONIO_CANONICAL_RE).toBeInstanceOf(RegExp)
    expect(PATRIMONIO_CANONICAL_RE.source).toBe(
      `^${PREFIXO_PATRIMONIO_FONTE}\\d{${DIGITOS_PATRIMONIO}}$`,
    )
  })

  it('deparas.ts NÃO hardcoda `[A-Z]{2,4}` em código — PATRIMONIO_EMBUTIDO_RE importa a fonte de patrimonio.ts', () => {
    const codigo = semComentariosTs(FONTE_DEPARAS)
    expect(codigo).not.toMatch(/\[A-Z\]\{2,4\}\)/)
    expect(codigo).toMatch(/PREFIXO_PATRIMONIO_FONTE/)
  })

  it('a do hostname referencia DIGITOS_PATRIMONIO na quantificação `{1,…}` (texto — sem escapar barra invertida em regex de teste, que é frágil; ver a prova COMPORTAMENTAL logo abaixo)', () => {
    const codigo = semComentariosTs(FONTE_DEPARAS)
    expect(codigo).toContain('{1,${DIGITOS_PATRIMONIO}}')
  })

  it('COMPORTAMENTAL: extrairPatrimonioDoHostname aceita MENOS de 7 dígitos (a divergência deliberada — {1,DIGITOS}, não {DIGITOS} fixo)', () => {
    // Prova mais forte que ler texto escapado: se a quantificação um dia
    // regredisse para `{DIGITOS_PATRIMONIO}` fixo (igual à canônica), este
    // caso de 4 dígitos deixaria de casar e a função devolveria null.
    // F56 · Frente D (segunda metade) — os prefixos válidos chegam por
    // parâmetro (`VocabularioImport.prefixosPatrimonio`); aqui, os mesmos
    // PRO/WAP de sempre.
    const PREFIXOS = ['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO']
    expect(extrairPatrimonioDoHostname('NB-PRO3694', PREFIXOS)).toBe('PRO0003694')
    expect(extrairPatrimonioDoHostname('NB-WAP0001234', PREFIXOS)).toBe('WAP0001234')
  })

  it('a divergência do hostname está documentada em comentário (não é acidente)', () => {
    expect(FONTE_DEPARAS).toMatch(/divergência deliberada/)
  })
})

// -----------------------------------------------------------------------------
// 2. Nenhum corpo VIGENTE de função SQL contém regex de patrimônio executável
//    (fato 19 — o formato é monopólio do TypeScript desde a F7J).
// -----------------------------------------------------------------------------
//
// "Corpo vigente" (não "toda migration"): migration não se edita, então o texto
// das migrations `0032`-`0036` SEMPRE vai conter `{2,4}` executável — são
// história, superadas desde a `0037`. O que importa é o que está no ar HOJE, e
// isso só `corpo-vigente.mjs` resolve (o último `create [or replace] function`
// de cada função na cadeia de migrations).

/**
 * O corpo VIGENTE sem comentário de linha `--`.
 *
 * ⚠ DIFERENTE de `codigoVivo()` de `import-uma-porta.test.ts`: aquele some
 * TAMBÉM com literais de texto `'…'`, porque procura um COMANDO (`delete from
 * public.ativos`) e precisa ignorar o comando se ele só aparecer MENCIONADO
 * dentro de uma string. Aqui é o oposto: a regex de formato que este teste
 * persegue É, ela mesma, um literal de texto SQL (`!~ '^[A-Z]{2,4}\d{7}$'`) —
 * apagar as strings apagaria exatamente o que se quer achar, e a prova
 * positiva do fim do arquivo (`e->>'patrimonio'`) também depende de a string
 * `'patrimonio'` sobreviver. Por isso só o `--` sai; a string fica.
 */
function semComentarioDeLinhaSql(sql: string): string {
  return sql
    .split('\n')
    .map((linha) => linha.replace(/--.*$/, ''))
    .join('\n')
}

const RE_DROP_FUNCAO =
  /drop\s+function\s+(?:if\s+exists\s+)?(?:([a-z_][a-z0-9_]*)\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([^;()]*)\)/gi

/**
 * As assinaturas que um arquivo de migration DERRUBA (`drop function [if
 * exists] nome(tipos)`). Precisa existir: `importar_ativos_substituir` ganhou
 * um 4º parâmetro (`p_correcoes`) na `0033` — como parâmetro NOVO muda a lista
 * de tipos, `create or replace function nome(jsonb,text,jsonb,jsonb)` NÃO
 * substitui `nome(jsonb,text,jsonb)`: são duas sobrecargas Postgres
 * DIFERENTES. A `0033` derruba a de 3 tipos explicitamente
 * (`drop function if exists public.importar_ativos_substituir(jsonb, text,
 * jsonb);`) antes de criar a de 4 — sem ler isso, uma varredura ingênua acha a
 * sobrecarga de 3 tipos "vigente" (o último `create` que a define, em `0032`)
 * quando na verdade ela foi apagada há dúzias de migrations.
 */
function assinaturasDropadasNoArquivo(sql: string): string[] {
  const achadas: string[] = []
  const re = new RegExp(RE_DROP_FUNCAO.source, RE_DROP_FUNCAO.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const esquema = (m[1] ?? 'public').toLowerCase()
    const nome = m[2]!.toLowerCase()
    const tipos = m[3]!
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '')
      .map((t) => tipoDoArgumento(t))
    achadas.push(`${esquema}.${nome}(${tipos.join(', ')})`)
  }
  return achadas
}

/**
 * Todo corpo VIGENTE definido em `supabase/migrations/` — uma varredura só
 * (não uma chamada de `corpoVigente()` por função): lê cada migration em
 * ordem CRESCENTE; em cada arquivo, primeiro aplica os `drop function` dele
 * (removendo a sobrecarga do mapa) e só depois os `create [or replace]`
 * (gravando por cima) — a ordem "drop antes de create, por arquivo" cobre os
 * dois padrões reais da cadeia: "derruba a sobrecarga velha, cria a nova
 * (tipos diferentes)" e "derruba, recria (mesmos tipos)". O resultado é o
 * mesmo que `corpoVigente()` devolveria função a função, calculado uma vez só
 * para o conjunto inteiro.
 */
function todosOsCorposVigentes(): { assinatura: string; texto: string }[] {
  const porAssinatura = new Map<string, string>()
  for (const arquivo of listarMigrations()) {
    const sql = readFileSync(join(RAIZ, ...PASTA_MIGRATIONS, arquivo), 'utf8')
    // Sem comentário `--` ANTES de procurar `drop function`: existem várias
    // migrations (0068, 0104, 0138…) cujo bloco de ROLLBACK/REVERSÃO é só
    // prosa comentada mencionando `drop function alvo(tipos);` — sem tirar o
    // `--`, essa menção é lida como um drop de verdade e a assinatura some do
    // mapa de "vigente" mesmo com a função continuando definida e no ar. O
    // `definicoesDeFuncao(sql)` logo abaixo continua recebendo o `sql` CRU
    // (não o comentado): ele já ignora `--` internamente ao percorrer o corpo
    // (`fimDoComando`), e passar o texto pré-comentado aqui cortaria, sem
    // parser nenhum, qualquer `--` que caia dentro de um literal `'...'` do
    // próprio corpo da função — o que `semComentarioDeLinhaSql` não distingue.
    for (const assinatura of assinaturasDropadasNoArquivo(semComentarioDeLinhaSql(sql))) {
      porAssinatura.delete(assinatura)
    }
    for (const d of definicoesDeFuncao(sql)) {
      const assinatura = `${d.esquema}.${d.nome}(${d.tipos.join(', ')})`
      porAssinatura.set(assinatura, d.texto)
    }
  }
  return [...porAssinatura.entries()].map(([assinatura, texto]) => ({ assinatura, texto }))
}

describe('nenhum corpo VIGENTE de função SQL valida FORMATO de patrimônio (Decisão 5, fato 19)', () => {
  const corpos = todosOsCorposVigentes()

  it('guarda do próprio teste: há corpos de função para varrer', () => {
    // Medido: 84 assinaturas distintas na cadeia inteira de migrations (não é
    // "nº de migrations", que passa de 100 — é nº de FUNÇÕES distintas). O
    // guard fica frouxo (> 50, não `=== 84`) de propósito: toda migration nova
    // que cria função empurra esse número para cima, e travar no valor exato
    // exigiria atualizar este teste a cada fase — o que se quer aqui é só
    // confirmar que a varredura está achando um conjunto do tamanho certo de
    // grandeza, não vigiar o total.
    expect(corpos.length).toBeGreaterThan(50)
  })

  it.each(corpos.map((c) => [c.assinatura, c.texto] as const))(
    '%s não tem [A-Z]{2,4} executável (comentário `--` não conta; string SQL conta)',
    (_assinatura, texto) => {
      expect(semComentarioDeLinhaSql(texto)).not.toContain('[A-Z]{2,4}')
    },
  )

  it('import_validar_plano (o histórico do fato 19) tem a sanidade que SUBSTITUIU o formato desde a F7J', () => {
    const { sql } = corpoVigente('public.import_validar_plano(jsonb, text, jsonb, smallint)')
    const vivo = semComentarioDeLinhaSql(sql)
    expect(vivo).not.toContain('[A-Z]{2,4}')
    // Prova POSITIVA — não just "não valida formato", mas "valida o que
    // SUBSTITUIU o formato": não-vazio e ≤ 60 caracteres.
    expect(vivo).toMatch(/length\(e->>'patrimonio'\)\s*>\s*60/)
  })
})

import { describe, it, expect } from 'vitest'
import { PREFIXO_PATRIMONIO_FONTE } from '@/lib/patrimonio'
import { normalizarTexto } from './deparas'
import {
  apelidosNoSql,
  categoriasNoSql,
  checkPrefixoFormato,
  estadosNoSql,
  migracaoComAncora,
  nomesDasFiliaisHoje,
  prefixosNoSql,
  type LinhaApelido,
  type LinhaCategoria,
  type LinhaEstado,
} from './leitor-seed-vocabulario'

// GUARDA DO SEED DO VOCABULÁRIO DO IMPORT (F56 · Frente D, Decisão 1).
//
// Molde `src/lib/validators/tipos-item-sql.test.ts` (F39): "os literais esperados
// vivem AQUI, no próprio teste, e não num módulo que alguém possa 'arrumar' junto com
// o seed". Os 13 apelidos (+ 5 nomes próprios), as 5 categorias, os 17 estados, as 12
// formas de exibição e os 7 prefixos são a fixture deste teste; o seed da migration
// 0139 é o OUTRO lado — se um dia divergirem, é aqui que o `npm run test` acusa, sem
// depender de ninguém lembrar de "manter os dois sincronizados".
//
// Este teste NASCE VERMELHO antes da 0139 existir (não há migration para ler) — é a
// trava do item 1a da ordem da fase, guardada em docs/f56-evidencias/.
//
// Os LEITORES de SQL moraram aqui até a segunda metade da Frente D — agora vivem
// em `leitor-seed-vocabulario.ts` (não-teste, sem literal de filial/WAP nenhum, só
// nomes de tabela/coluna): `vocabulario.test.ts` os reusa para CONSTRUIR a fixture
// da regressão dos 18 termos históricos a partir do MESMO seed, em vez de
// reimplementar o parser — e importar um `.test.ts` de outro executaria os
// `describe`/`it` dele de novo, então o parser tinha de sair para um módulo comum.

// -----------------------------------------------------------------------------
// OS LITERAIS ESPERADOS — vivem aqui, e só aqui.
// -----------------------------------------------------------------------------

/** Os 13 apelidos HISTÓRICOS, na ordem do seed (slug da filial dona, apelido cru). */
const APELIDOS_13: readonly LinhaApelido[] = [
  { slug: 'matriz', apelido: 'matriz sao marcos' },
  { slug: 'cd-afonso-pena', apelido: 'cd-afp' },
  { slug: 'cd-afonso-pena', apelido: 'cd afp' },
  { slug: 'cd-afonso-pena', apelido: 'cd-pena' },
  { slug: 'cd-afonso-pena', apelido: 'cd pena' },
  // COM hífen — o nome PRÓPRIO da CD, no banco, é "CD Afonso Pena" (SEM hífen); a
  // forma com hífen é apelido, não o termo implícito. Trocar as duas em silêncio
  // quebra a CD (armadilha documentada na medição V da F56).
  { slug: 'cd-afonso-pena', apelido: 'cd-afonso pena' },
  { slug: 'cd-afonso-pena', apelido: 'cd-afonsopena' },
  { slug: 'cd-afonso-pena', apelido: 'afonso pena' },
  { slug: 'eusebio', apelido: 'filial-ce' },
  { slug: 'eusebio', apelido: 'filial ce' },
  { slug: 'serra', apelido: 'serra park' },
  { slug: 'linhares', apelido: 'filial - linhares' },
  { slug: 'linhares', apelido: 'filial linhares' },
]

/** Os 18 termos históricos = os 13 apelidos ACIMA + os 5 nomes próprios normalizados
 *  (que NÃO viram linha em unidades_apelidos — Decisão 2, "o nome próprio sempre
 *  vale"). É a MESMA lista de chaves que `UNIDADES` tem hoje em `deparas.ts` — essa
 *  igualdade é o describe temporário no fim do arquivo, e sai quando a Frente D2
 *  apagar `UNIDADES`. Aqui a lista é reconstruída a partir do SQL (o seed + o nome
 *  das filiais lido de 0007/0026), não copiada de cabeça — é essa reconstrução que
 *  prova que "cd afonso pena" (sem hífen) é o nome, não um apelido.
 */
const NOMES_PROPRIOS_ESPERADOS: readonly { slug: string; chave: string }[] = [
  { slug: 'matriz', chave: 'matriz' },
  { slug: 'cd-afonso-pena', chave: 'cd afonso pena' },
  { slug: 'linhares', chave: 'linhares' },
  { slug: 'serra', chave: 'serra' },
  { slug: 'eusebio', chave: 'eusebio' },
]

const CATEGORIAS_5: readonly LinhaCategoria[] = [
  { termo: 'notebook', categoria: 'notebook', rotulo: 'Notebook' },
  { termo: 'desktop', categoria: 'desktop', rotulo: 'Desktop' },
  { termo: 'monitor', categoria: 'monitor', rotulo: 'Monitor' },
  { termo: 'celular', categoria: 'celular', rotulo: 'Celular' },
  { termo: 'tablet', categoria: 'tablet', rotulo: 'Tablet' },
]

const ESTADOS_17: readonly LinhaEstado[] = [
  { termo: 'saida', estado: 'em_uso', rotulo: 'Saída' },
  { termo: 'remanejo', estado: 'em_uso', rotulo: null },
  { termo: 'guardada', estado: 'em_estoque', rotulo: null },
  { termo: 'estoque', estado: 'em_estoque', rotulo: 'Estoque' },
  { termo: 'reservada', estado: 'reservado', rotulo: null },
  { termo: 'reservado', estado: 'reservado', rotulo: 'Reservado' },
  { termo: 'emprestimo', estado: 'emprestado', rotulo: 'Empréstimo' },
  { termo: 'validar', estado: 'em_triagem', rotulo: 'Validar' },
  { termo: 'devolvido', estado: 'em_triagem', rotulo: null },
  { termo: 'devolucao', estado: 'em_triagem', rotulo: null },
  { termo: 'manutencao', estado: 'em_manutencao', rotulo: 'Manutenção' },
  { termo: 'rt wap', estado: 'defasado', rotulo: null },
  { termo: 'posse wap', estado: 'defasado', rotulo: null },
  { termo: 'defasada', estado: 'defasado', rotulo: null },
  { termo: 'defasado', estado: 'defasado', rotulo: 'Defasado' },
  { termo: 'descarte', estado: 'descartado', rotulo: null },
  { termo: 'descartado', estado: 'descartado', rotulo: null },
]

const PREFIXOS_7: readonly string[] = ['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO']

// -----------------------------------------------------------------------------
// Testes
// -----------------------------------------------------------------------------

describe('0139: os 13 apelidos históricos, um por filial certa', () => {
  const { arquivo, sql } = migracaoComAncora(
    'insert into public.unidades_apelidos (filial_id, apelido)',
  )
  const doSql = apelidosNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos um apelido (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('são exatamente os 13, na mesma ordem, apontando para o slug certo', () => {
    expect(doSql).toEqual(APELIDOS_13)
  })

  it('nenhum apelido está vazio ou é só espaço', () => {
    for (const l of doSql) expect(l.apelido.trim().length).toBeGreaterThan(0)
  })

  it('nenhum apelido se repete (13 chaves distintas)', () => {
    const chaves = doSql.map((l) => normalizarTexto(l.apelido))
    expect(new Set(chaves).size).toBe(chaves.length)
  })
})

describe('0139: os 5 nomes próprios (não viram linha) somados aos 13 apelidos são os 18 termos históricos', () => {
  const { sql } = migracaoComAncora('insert into public.unidades_apelidos (filial_id, apelido)')
  const apelidos = apelidosNoSql(sql)
  const nomesHoje = nomesDasFiliaisHoje()

  it.each(NOMES_PROPRIOS_ESPERADOS)(
    'o nome da filial $slug normaliza para "$chave" (lido de 0007/0026, não copiado de cabeça)',
    ({ slug, chave }) => {
      const nome = nomesHoje.get(slug)
      expect(nome, `slug "${slug}" não está no seed fixo de filiais`).toBeDefined()
      expect(normalizarTexto(nome!)).toBe(chave)
    },
  )

  it('13 apelidos + 5 nomes próprios = 18 termos históricos, sem repetição entre os dois grupos', () => {
    const chavesApelidos = apelidos.map((a) => normalizarTexto(a.apelido))
    const chavesNomes = NOMES_PROPRIOS_ESPERADOS.map((n) => n.chave)
    const todas = [...chavesApelidos, ...chavesNomes]
    expect(todas).toHaveLength(18)
    expect(new Set(todas).size).toBe(18)
  })
})

describe('0139: as 5 categorias, cada uma com rótulo', () => {
  const { arquivo, sql } = migracaoComAncora(
    'insert into public.import_termos_categoria (termo, categoria, rotulo) values',
  )
  const doSql = categoriasNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos uma categoria (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('são exatamente as 5, na mesma ordem, com o rótulo certo', () => {
    expect(doSql).toEqual(CATEGORIAS_5)
  })

  it('nenhuma categoria do seed é "outro" (o check da tabela também recusaria)', () => {
    for (const l of doSql) expect(l.categoria).not.toBe('outro')
  })
})

describe('0139: os 17 estados, 7 com rótulo', () => {
  const { arquivo, sql } = migracaoComAncora(
    'insert into public.import_termos_estado (termo, estado, rotulo) values',
  )
  const doSql = estadosNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos um estado (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('são exatamente os 17, na mesma ordem, cada um com o estado e o rótulo certos', () => {
    expect(doSql).toEqual(ESTADOS_17)
  })

  it('nenhum estado do seed é devolvido_fornecedor (o check da tabela também recusaria)', () => {
    for (const l of doSql) expect(l.estado).not.toBe('devolvido_fornecedor')
  })

  it('exatamente 7 termos têm rótulo (as formas de exibição de estado)', () => {
    expect(doSql.filter((l) => l.rotulo !== null)).toHaveLength(7)
  })

  it('descartado não tem rótulo em nenhuma das suas duas linhas (o check da tabela também recusaria)', () => {
    for (const l of doSql.filter((l) => l.estado === 'descartado')) {
      expect(l.rotulo).toBeNull()
    }
  })

  it('todo rótulo normaliza de volta para o próprio termo da linha', () => {
    for (const l of doSql.filter((l) => l.rotulo !== null)) {
      expect(normalizarTexto(l.rotulo!)).toBe(l.termo)
    }
  })
})

describe('0139: os 7 prefixos de patrimônio, e o check bate com PREFIXO_PATRIMONIO_FONTE', () => {
  const { arquivo, sql } = migracaoComAncora(
    'insert into public.import_prefixos_patrimonio (prefixo) values',
  )
  const doSql = prefixosNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos um prefixo (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('são exatamente os 7, na mesma ordem de PREFIXOS_PATRIMONIO', () => {
    expect(doSql).toEqual(PREFIXOS_7)
  })

  it("o check import_prefixos_patrimonio_formato é exatamente '^' + PREFIXO_PATRIMONIO_FONTE + '$'", () => {
    expect(checkPrefixoFormato(sql)).toBe(`^${PREFIXO_PATRIMONIO_FONTE}$`)
  })

  it('todo prefixo do seed bate com o check da própria tabela', () => {
    const re = new RegExp(checkPrefixoFormato(sql))
    for (const p of doSql) expect(p).toMatch(re)
  })
})

// -----------------------------------------------------------------------------
// O describe temporário que comparava este seed com as constantes hardcoded de
// `deparas.ts` (UNIDADES/CATEGORIAS/ESTADOS/TIPO_CANONICO/SITUACAO_CANONICA/
// PREFIXOS_PATRIMONIO) SAIU (F56 · Frente D, segunda metade — ata em
// docs/DECISOES.md): essas constantes não existem mais — o vocabulário virou
// parâmetro (`VocabularioImport`, `./vocabulario.ts`). A regressão equivalente
// ("os 18 termos históricos resolvem para a filial certa") agora mora em
// `vocabulario.test.ts`, com uma fixture CONSTRUÍDA a partir deste mesmo SQL
// (não copiada de cabeça) — é o sucessor deste describe, por desenho.
// -----------------------------------------------------------------------------

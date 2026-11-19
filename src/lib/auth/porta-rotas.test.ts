import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SLUG_EMPRESA_LEGADA,
  caminhoDaPorta,
  caminhoDoCookie,
  destinoNaPorta,
  entradaDaPorta,
  filialForaDaPorta,
  portaDaLegada,
  slugValido,
  traduzirDestinoLegado,
} from './porta-rotas'

// AS ROTAS DA PORTA PÚBLICA (F68) — funções puras, com entradas hostis.

describe('SLUG_EMPRESA_LEGADA — o espelho do INSERT da 0152', () => {
  it('é o slug que a migration 0152 grava para public.empresa_legada()', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0152_raiz_do_tenant.sql'), 'utf8')
    const m = /insert into public\.empresas \(id, slug, nome, cor_acento\)\s*values \(public\.empresa_legada\(\), '([a-z0-9-]+)'/.exec(sql)
    expect(m, '0152: o INSERT da legada mudou de forma').not.toBeNull()
    expect(m![1]).toBe(SLUG_EMPRESA_LEGADA)
  })

  it('passa no formato de slug (o CHECK empresas_slug_formato)', () => {
    expect(slugValido(SLUG_EMPRESA_LEGADA)).toBe(true)
  })
})

describe('slugValido — o CHECK da 0152, antes de perguntar ao banco', () => {
  it.each(['wap', 'empresa-b', 'a1', 'x'.repeat(40)])('aceita %s', (s) => expect(slugValido(s)).toBe(true))
  it.each(['', 'a', 'WAP', '../admin', 'wap/x', 'wap?x=1', '-wap', 'wap-', 'wa--p', 'x'.repeat(41), 'é', 123, null, undefined])(
    'recusa %s',
    (s) => expect(slugValido(s)).toBe(false),
  )
})

describe('caminhoDaPorta / caminhoDoCookie / entradaDaPorta', () => {
  it('montam a porta DA empresa', () => {
    expect(caminhoDaPorta('wap')).toBe('/r/wap/relatorios')
    expect(caminhoDaPorta('wap', 'gerados')).toBe('/r/wap/relatorios/gerados')
    expect(caminhoDaPorta('wap', '/gerados/abc')).toBe('/r/wap/relatorios/gerados/abc')
    expect(caminhoDoCookie('wap')).toBe('/r/wap')
    expect(entradaDaPorta('wap')).toBe('/r/wap/relatorios/acesso')
    expect(entradaDaPorta('wap', '/r/wap/relatorios/gerados?filial=geral')).toBe(
      '/r/wap/relatorios/acesso?next=%2Fr%2Fwap%2Frelatorios%2Fgerados%3Ffilial%3Dgeral',
    )
  })
})

describe('destinoNaPorta — só a MESMA empresa, nunca a entrada, nunca fora', () => {
  const PADRAO = '/r/wap/relatorios/gerados'
  it.each([
    ['/r/wap/relatorios/gerados/abc', '/r/wap/relatorios/gerados/abc'],
    ['/r/wap/relatorios/geral?preset=mes', '/r/wap/relatorios/geral?preset=mes'],
  ])('aceita %s', (next, esperado) => expect(destinoNaPorta('wap', next)).toBe(esperado))
  it.each([
    '/r/outra/relatorios/gerados', // a diagonal pelo destino
    '/r/wap/relatorios/acesso', // loop
    '/r/wap/relatorios/acesso?next=/x',
    '/r/wap/relatorios', // sem barra final: não é um relatório
    '/relatorios/gerados', // o endereço antigo
    'https://evil.com/r/wap/relatorios/gerados',
    '//evil.com',
    '/r/wap/relatorios/../../admin',
    // a travessia CODIFICADA (o navegador resolve %2e%2e como ..), a barra e a invertida codificadas, a dupla codificação
    '/r/wap/relatorios/%2e%2e/%2e%2e/admin',
    '/r/wap/relatorios/%2E%2E/%2e./x',
    '/r/wap/relatorios/.%2e/x',
    '/r/wap/relatorios/x%2f..%2fy',
    '/r/wap/relatorios/x%5cy',
    '/r/wap/relatorios/%252e%252e/x',
    '/r/wap/relatorios/x%0d%0aSet-Cookie:a=b',
    '/r/wap/relatorios/x\\y',
    '/r/wap/relatorios/x//y',
    '/r/wap/relatorios/x\r\nSet-Cookie: a=b',
    '/r/wap/relatorios/' + 'a'.repeat(600),
    '',
    null,
    123,
  ])('recusa %s → os gerados da empresa', (next) => expect(destinoNaPorta('wap', next)).toBe(PADRAO))
})

describe('traduzirDestinoLegado / portaDaLegada — o next do 308', () => {
  it.each([
    ['/relatorios/gerados', '', '/r/wap/relatorios/gerados'],
    ['/relatorios/gerados/abc-123', '', '/r/wap/relatorios/gerados/abc-123'],
    ['/relatorios/gerados', '?filial=geral&page=2', '/r/wap/relatorios/gerados?filial=geral&page=2'],
    ['/relatorios/matriz', '?preset=mes', '/r/wap/relatorios/matriz?preset=mes'],
    ['/relatorios/acesso', '?next=%2Frelatorios%2Fgerados%2Fx', '/r/wap/relatorios/gerados/x'],
    ['/relatorios/acesso', '?next=%2Frelatorios%2Fmatriz%3Fpreset%3Dmes', '/r/wap/relatorios/matriz?preset=mes'],
  ])('%s%s → %s', (p, s, esperado) => expect(traduzirDestinoLegado(p, s)).toBe(esperado))

  it.each([
    ['/relatorios', ''],
    ['/relatorios/', ''],
    ['/relatorios/acesso', ''],
    ['/relatorios/acesso', '?next=https%3A%2F%2Fevil.com'],
    ['/relatorios/acesso', '?next=%2Frelatorios%2Facesso'],
    ['/relatorios/../admin', ''],
    // a travessia codificada dentro do next (o searchParams decodifica uma vez: %252e → %2e)
    ['/relatorios/acesso', '?next=%2Frelatorios%2F%252e%252e%2F%252e%252e%2Fadmin'],
    ['/relatorios/acesso', '?next=%2Frelatorios%2Fx%255cy'],
    ['/ativos', ''],
  ])('%s%s → sem destino', (p, s) => expect(traduzirDestinoLegado(p, s)).toBeNull())

  it('portaDaLegada: a entrada da legada, com o next traduzido (ou sem next)', () => {
    expect(portaDaLegada('/relatorios/gerados', '')).toBe('/r/wap/relatorios/acesso?next=%2Fr%2Fwap%2Frelatorios%2Fgerados')
    expect(portaDaLegada('/relatorios/acesso', '')).toBe('/r/wap/relatorios/acesso')
    expect(portaDaLegada('/relatorios', '')).toBe('/r/wap/relatorios/acesso')
  })
})

describe('filialForaDaPorta — o par da porta de recusarFilialInexistente', () => {
  const filiais = [{ slug: 'matriz' }, { slug: 'serra' }]
  it('nada fora: sem filtro, filiais da empresa, o consolidado', () => {
    expect(filialForaDaPorta([], filiais)).toBe(false)
    expect(filialForaDaPorta(['matriz', 'serra'], filiais)).toBe(false)
    expect(filialForaDaPorta(['geral', 'matriz'], filiais)).toBe(false)
  })
  it('uma filial que não é da empresa → fora (404)', () => {
    expect(filialForaDaPorta(['matriz', 'filial-de-outra-empresa'], filiais)).toBe(true)
  })
})

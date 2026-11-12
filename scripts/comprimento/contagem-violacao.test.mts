import { describe, expect, it } from 'vitest'
import { blocoDeContagem, COLUNA_SABOTADA, lerPayload, validarBloco, veredito, type Payload } from './contagem-violacao.mjs'
import { constraintsDeTamanho, TETOS_COLUNA } from '../../src/lib/validators/tetos-coluna'

// O PORTÃO DA F66B, NA MESA (12/11/2026). O bloco roda no banco só pelo MCP; aqui se prova, sem banco, que ele é o que
// diz: só leitura, nunca se confirma, cobre as 65 colunas com o teto da FONTE, sai só número, a variante sabotada difere
// só no que deve, e o veredito soma as violações e recusa coluna faltando. (A prova de que ele ACHA violação no banco é
// a sabotagem G — docs/f66b-evidencias/G-contagem/.)

const normal = blocoDeContagem(false)
const sabotado = blocoDeContagem(true)

describe('o bloco de contagem', () => {
  it('liga transaction_read_only antes de tudo e termina em raise exception (nunca se confirma)', () => {
    expect(normal).toMatch(/^do \$f66b\$/)
    expect(normal.trim().endsWith('end $f66b$;')).toBe(true)
    const iRo = normal.indexOf("perform set_config('transaction_read_only', 'on', true);")
    expect(iRo).toBeGreaterThan(0)
    expect(normal.indexOf('select jsonb_build_object')).toBeGreaterThan(iRo)
    expect(normal).toMatch(/raise exception 'F66B_CONTA %'/)
  })

  it('cobre as 65 colunas, cada uma com o teto da fonte', () => {
    for (const c of constraintsDeTamanho()) {
      expect(normal, `${c.tabela}.${c.coluna}`).toContain(
        `'${c.coluna}', jsonb_build_array(coalesce(max(char_length(${c.coluna})), 0), count(*) filter (where char_length(${c.coluna}) > ${c.teto}))`,
      )
    }
    expect(normal.match(/jsonb_build_array\(coalesce\(max\(char_length/g)).toHaveLength(65)
    expect(normal.match(/ from public\.[a-z_]+;/g)).toHaveLength(20)
  })

  it('não lê valor: só count, max(char_length) e o rótulo do ambiente', () => {
    const semComentario = normal.replace(/--[^\n]*/g, '')
    expect(semComentario).not.toMatch(/\bselect \*|row_to_json|to_jsonb\(|string_agg|array_agg/)
    expect(semComentario).not.toMatch(/\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|execute)\b/i)
  })

  it('a sabotada difere só no literal do flag e no teto da coluna sabotada (0)', () => {
    const t = (TETOS_COLUNA[COLUNA_SABOTADA.tabela] as Record<string, { teto: number }>)[COLUNA_SABOTADA.coluna].teto
    const desfeito = sabotado
      .replace('v_sabotar constant boolean := true;', 'v_sabotar constant boolean := false;')
      .replace(`where char_length(${COLUNA_SABOTADA.coluna}) > 0)`, `where char_length(${COLUNA_SABOTADA.coluna}) > ${t})`)
    expect(desfeito).toBe(normal)
    expect(sabotado).toContain("raise exception 'F66B_SABOTAGEM_FORA_DO_ENSAIO")
  })

  it('o validador aceita só o que o gerador produz', () => {
    expect(validarBloco(normal)).toBe(normal)
    expect(validarBloco(sabotado)).toBe(sabotado)
    expect(() => validarBloco(normal.replace('> 2000', '> 20000'))).toThrow(/byte a byte/)
    expect(() => validarBloco(normal + '\nupdate public.ativos set marca = null;')).toThrow()
  })
})

describe('o veredito', () => {
  const payload = (acima = 0, tirar?: string): Payload => {
    const tabelas: Payload['tabelas'] = {}
    for (const c of constraintsDeTamanho()) {
      if (`${c.tabela}.${c.coluna}` === tirar) continue
      tabelas[c.tabela] ??= { linhas: 10 } as Payload['tabelas'][string]
      ;(tabelas[c.tabela] as Record<string, unknown>)[c.coluna] = [c.teto, c.tabela === 'ativos' && c.coluna === 'marca' ? acima : 0]
    }
    return { rotulo: '(null)', sabotado: false, tabelas }
  }

  it('soma as violações; 0 é o portão', () => {
    expect(veredito(payload(0)).violacoes).toBe(0)
    expect(veredito(payload(0)).colunas).toBe(65)
    expect(veredito(payload(3)).violacoes).toBe(3)
  })

  it('coluna da fonte ausente do payload vai para "faltando" (nunca vira zero)', () => {
    expect(veredito(payload(0, 'ativos.observacoes')).faltando).toEqual(['ativos.observacoes'])
  })

  it('lerPayload extrai o F66B_CONTA das camadas do canal e descarta o enchimento', () => {
    const p = { rotulo: 'desenvolvimento', sabotado: false, tabelas: { motivos: { linhas: 1, codigo: [3, 0] } }, _canal: '...' }
    const resposta = JSON.stringify([{ resposta: `F66B_CONTA ${JSON.stringify(p)}` }])
    const lido = lerPayload(resposta) as Payload & { _canal?: string }
    expect(lido.rotulo).toBe('desenvolvimento')
    expect(lido._canal).toBeUndefined()
    expect(lerPayload('ERROR: F66B_SABOTAGEM_FORA_DO_ENSAIO rotulo=(null)')).toEqual({
      recusa: 'F66B_SABOTAGEM_FORA_DO_ENSAIO rotulo=(null)',
    })
  })
})

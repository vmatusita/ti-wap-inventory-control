import { describe, expect, it } from 'vitest'
import { camposTermoSchema } from '@/lib/validators/termo'
import { conferirValores } from '@/lib/supabase/forma'
import { FORMA_DADOS_DO_TERMO } from '@/lib/queries/formas/termos'

// A FORMA DE LEITURA de `termos_gerados.dados` (F58 · Frente C · revisão do lote 2).
//
// O jsonb guarda os `CamposTermo` do momento em que o termo foi gerado, mais `data`. A forma de
// LEITURA não é o `camposTermoSchema` de ESCRITA: ela não impõe os tetos de tamanho (um termo antigo
// gravado antes de um teto mudar não pode derrubar a ficha do ativo) e aceita chave que o schema de
// hoje não conhece (termo histórico). O que ela exige é que `dados` seja um objeto e que cada campo
// conhecido, quando presente, seja texto. As chaves declaradas acompanham o schema de escrita — este
// teste reprova a divergência. (A conferência vai por `conferirValores`, a função pura que
// `linhasDe` usa por dentro, porque aqui o valor não vem de um `select`.)

const aceita = (valor: unknown) => conferirValores([valor], FORMA_DADOS_DO_TERMO, []).recusas.length === 0

describe('a forma de leitura de termos_gerados.dados', () => {
  it('declara exatamente as chaves do camposTermoSchema, mais `data`', () => {
    expect(Object.keys(FORMA_DADOS_DO_TERMO.shape).sort()).toEqual([...camposTermoSchema.keyof().options, 'data'].sort())
  })

  it('aceita termo histórico: chave desconhecida e texto acima do teto de escrita', () => {
    expect(aceita({ colaborador: 'Fulano Ficticio', acessorios: 'x'.repeat(5000), chave_de_uma_versao_antiga: 'y' })).toBe(true)
  })

  it('aceita objeto vazio (todo campo é opcional, como no schema de escrita)', () => {
    expect(aceita({})).toBe(true)
  })

  it.each([
    ['null', null],
    ['lista', ['a']],
    ['texto', 'x'],
    ['campo conhecido que não é texto', { colaborador: 42 }],
  ])('recusa: %s', (_n, valor) => {
    expect(aceita(valor)).toBe(false)
  })
})

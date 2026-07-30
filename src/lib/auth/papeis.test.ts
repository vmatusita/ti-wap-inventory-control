import { describe, expect, it } from 'vitest'
import {
  PAPEIS,
  PAPEL_DESCRICAO,
  PAPEL_ROTULO,
  eAdmin,
  ePapelValido,
  exigeVinculoDeFilial,
  filiaisDeEscrita,
  papelAtende,
  podeEscrever,
  validarVinculosDoPapel,
} from './papeis'
import type { PapelUsuario } from './papeis'

// F21 — a hierarquia admin ⊃ operador ⊃ consulta. Vale testar de verdade porque o sinal
// da comparação é contraintuitivo do lado do Postgres (`admin` é o PRIMEIRO label do enum,
// logo o MENOR na ordenação) e a função pura existe justamente para não herdar essa
// pegadinha. A trava real é o banco (migrations 0061→0066 + supabase/tests/papeis_rls.sql);
// aqui provamos o vocabulário e as regras de formulário.

describe('papelAtende — hierarquia', () => {
  it('cada papel atende a si mesmo', () => {
    for (const p of PAPEIS) {
      expect(papelAtende(p, p)).toBe(true)
    }
  })

  it('admin atende a todos os mínimos', () => {
    expect(papelAtende('admin', 'admin')).toBe(true)
    expect(papelAtende('admin', 'operador')).toBe(true)
    expect(papelAtende('admin', 'consulta')).toBe(true)
  })

  it('operador atende operador e consulta, mas NÃO admin', () => {
    expect(papelAtende('operador', 'admin')).toBe(false)
    expect(papelAtende('operador', 'operador')).toBe(true)
    expect(papelAtende('operador', 'consulta')).toBe(true)
  })

  it('consulta só atende consulta', () => {
    expect(papelAtende('consulta', 'admin')).toBe(false)
    expect(papelAtende('consulta', 'operador')).toBe(false)
    expect(papelAtende('consulta', 'consulta')).toBe(true)
  })

  it('null e undefined nunca atendem a nada — nem ao mínimo mais fraco', () => {
    // É o caso do perfil DESATIVADO: papel_atual() devolve NULL e tudo tem de fechar.
    for (const minimo of PAPEIS) {
      expect(papelAtende(null, minimo)).toBe(false)
      expect(papelAtende(undefined, minimo)).toBe(false)
    }
  })

  it('a relação é transitiva e antissimétrica (varredura completa dos 9 pares)', () => {
    const forca: Record<PapelUsuario, number> = { admin: 3, operador: 2, consulta: 1 }
    for (const a of PAPEIS) {
      for (const b of PAPEIS) {
        expect(papelAtende(a, b)).toBe(forca[a] >= forca[b])
      }
    }
  })
})

describe('eAdmin / podeEscrever', () => {
  it('eAdmin só para admin', () => {
    expect(eAdmin('admin')).toBe(true)
    expect(eAdmin('operador')).toBe(false)
    expect(eAdmin('consulta')).toBe(false)
    expect(eAdmin(null)).toBe(false)
  })

  it('podeEscrever espelha o predicado papel_atual() in (admin, operador) das policies', () => {
    expect(podeEscrever('admin')).toBe(true)
    expect(podeEscrever('operador')).toBe(true)
    expect(podeEscrever('consulta')).toBe(false)
    expect(podeEscrever(null)).toBe(false)
  })
})

describe('ePapelValido', () => {
  it('aceita os três cargos', () => {
    expect(ePapelValido('admin')).toBe(true)
    expect(ePapelValido('operador')).toBe(true)
    expect(ePapelValido('consulta')).toBe(true)
  })

  it('recusa qualquer outra coisa (inclusive o que vem de formulário)', () => {
    for (const v of ['', 'ADMIN', 'Admin', 'root', 'visualizador', null, undefined, 0, 1, {}, []]) {
      expect(ePapelValido(v)).toBe(false)
    }
  })
})

describe('exigeVinculoDeFilial', () => {
  it('só o operador precisa de vínculo', () => {
    expect(exigeVinculoDeFilial('operador')).toBe(true)
    expect(exigeVinculoDeFilial('admin')).toBe(false)
    expect(exigeVinculoDeFilial('consulta')).toBe(false)
  })
})

describe('validarVinculosDoPapel — a regra do formulário de usuário', () => {
  it('operador com zero filiais é recusado com mensagem em pt-BR', () => {
    expect(validarVinculosDoPapel('operador', [])).toBe(
      'Escolha ao menos uma filial de escrita para o cargo Operador.',
    )
  })

  it('operador com uma ou mais filiais é válido', () => {
    expect(validarVinculosDoPapel('operador', [1])).toBeNull()
    expect(validarVinculosDoPapel('operador', [1, 3, 5])).toBeNull()
  })

  it('admin e consulta são válidos sem filial nenhuma', () => {
    expect(validarVinculosDoPapel('admin', [])).toBeNull()
    expect(validarVinculosDoPapel('consulta', [])).toBeNull()
  })

  it('admin ou consulta COM filiais é recusado (formulário inconsistente)', () => {
    expect(validarVinculosDoPapel('admin', [1])).toContain('escreve em todas')
    expect(validarVinculosDoPapel('consulta', [1])).toContain('não escreve em nenhuma')
  })
})

describe('filiaisDeEscrita — o que alimenta os selects das telas de escrita', () => {
  const ativas = [1, 2, 3]

  it('admin escreve em TODAS as ativas, ignorando vínculos', () => {
    expect(filiaisDeEscrita('admin', [], ativas)).toEqual([1, 2, 3])
    expect(filiaisDeEscrita('admin', [2], ativas)).toEqual([1, 2, 3])
  })

  it('operador escreve só na interseção vínculos × ativas', () => {
    expect(filiaisDeEscrita('operador', [2], ativas)).toEqual([2])
    expect(filiaisDeEscrita('operador', [1, 3], ativas)).toEqual([1, 3])
  })

  it('vínculo em filial INATIVA não vale (a filial saiu do universo)', () => {
    expect(filiaisDeEscrita('operador', [9], ativas)).toEqual([])
    expect(filiaisDeEscrita('operador', [2, 9], ativas)).toEqual([2])
  })

  it('operador sem vínculo não escreve em nada — falha segura', () => {
    expect(filiaisDeEscrita('operador', [], ativas)).toEqual([])
  })

  it('consulta e papel nulo nunca escrevem', () => {
    expect(filiaisDeEscrita('consulta', [1, 2], ativas)).toEqual([])
    expect(filiaisDeEscrita(null, [1, 2], ativas)).toEqual([])
  })

  it('preserva a ordem das filiais ativas (a UI mostra na ordem do cadastro)', () => {
    expect(filiaisDeEscrita('operador', [3, 1], [1, 2, 3])).toEqual([1, 3])
  })
})

describe('vocabulário completo', () => {
  it('todo papel tem rótulo e descrição — nenhuma tela mostra chave crua', () => {
    for (const p of PAPEIS) {
      expect(PAPEL_ROTULO[p]).toBeTruthy()
      expect(PAPEL_DESCRICAO[p]).toBeTruthy()
    }
  })

  it('os rótulos não repetem "Visualizador", que é a OUTRA porta de acesso', () => {
    // O visualizador por senha dos relatórios (spec §3) não tem cargo; confundir os dois
    // na UI é o erro de vocabulário mais provável desta fase.
    for (const p of PAPEIS) {
      expect(PAPEL_ROTULO[p].toLowerCase()).not.toContain('visualizador')
    }
  })
})

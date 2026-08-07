import { describe, expect, it } from 'vitest'
import {
  PAPEIS,
  PAPEL_DESCRICAO,
  PAPEL_ROTULO,
  eAdmin,
  eDev,
  ePapelValido,
  escreveNaFilial,
  exigeVinculoDeFilial,
  filiaisDeEscrita,
  papelAtende,
  podeEscrever,
  validarVinculosDoPapel,
} from './papeis'
import type { PapelUsuario } from './papeis'

// F21 — a hierarquia admin ⊃ operador ⊃ consulta. F22 — o cargo `dev` entrou NO TOPO:
// dev ⊃ admin ⊃ operador ⊃ consulta. Vale testar de verdade porque o sinal da comparação é
// contraintuitivo do lado do Postgres (`dev` é o PRIMEIRO label do enum, logo o MENOR na
// ordenação) e a função pura existe justamente para não herdar essa pegadinha. A trava real é
// o banco (migrations 0061→0066, 0071→0077 + supabase/tests/papeis_rls.sql e cargo_dev.sql);
// aqui provamos o vocabulário e as regras de formulário.
//
// ⚠ O QUE A F22 QUEBRARIA EM SILÊNCIO, e por isso tem teste próprio abaixo: `eAdmin` era
// `papel === 'admin'` e `filiaisDeEscrita` decidia pelo mesmo literal. Com a igualdade, o dev
// seria recusado no app enquanto o banco o aceitaria (e_admin() = papel_atual() in
// ('admin','dev'), migration 0072) — e `filiaisDeEscrita('dev', …)` devolveria lista VAZIA,
// apagando todo select de filial de um cargo que escreve em todas.

describe('papelAtende — hierarquia', () => {
  it('cada papel atende a si mesmo', () => {
    for (const p of PAPEIS) {
      expect(papelAtende(p, p)).toBe(true)
    }
  })

  it('dev atende a TODOS os mínimos — não há cargo acima dele', () => {
    for (const minimo of PAPEIS) {
      expect(papelAtende('dev', minimo)).toBe(true)
    }
  })

  it('admin atende a todos os mínimos, MENOS dev', () => {
    expect(papelAtende('admin', 'admin')).toBe(true)
    expect(papelAtende('admin', 'operador')).toBe(true)
    expect(papelAtende('admin', 'consulta')).toBe(true)
    // O sentido que importa na F22: administrador não alcança o que é privativo do dev.
    expect(papelAtende('admin', 'dev')).toBe(false)
  })

  it('operador atende operador e consulta, mas NÃO admin nem dev', () => {
    expect(papelAtende('operador', 'dev')).toBe(false)
    expect(papelAtende('operador', 'admin')).toBe(false)
    expect(papelAtende('operador', 'operador')).toBe(true)
    expect(papelAtende('operador', 'consulta')).toBe(true)
  })

  it('consulta só atende consulta', () => {
    expect(papelAtende('consulta', 'dev')).toBe(false)
    expect(papelAtende('consulta', 'admin')).toBe(false)
    expect(papelAtende('consulta', 'operador')).toBe(false)
    expect(papelAtende('consulta', 'consulta')).toBe(true)
  })

  it('null e undefined nunca atendem a nada — nem ao mínimo mais fraco', () => {
    // É o caso do perfil DESATIVADO ou APAGADO: papel_atual() devolve NULL e tudo tem de
    // fechar (migrations 0070 e 0073).
    for (const minimo of PAPEIS) {
      expect(papelAtende(null, minimo)).toBe(false)
      expect(papelAtende(undefined, minimo)).toBe(false)
    }
  })

  it('a relação é transitiva e antissimétrica (varredura completa dos 16 pares)', () => {
    // A força é REDIGITADA aqui de propósito: se alguém mexer na tabela do módulo, este
    // segundo enunciado da hierarquia discorda e o teste cai.
    const forca: Record<PapelUsuario, number> = { dev: 4, admin: 3, operador: 2, consulta: 1 }
    for (const a of PAPEIS) {
      for (const b of PAPEIS) {
        expect(papelAtende(a, b)).toBe(forca[a] >= forca[b])
      }
    }
  })

  it('PAPEIS está na ordem do mais FORTE para o mais fraco', () => {
    expect([...PAPEIS]).toEqual(['dev', 'admin', 'operador', 'consulta'])
    // E a ordem é a da própria hierarquia, não uma lista escrita à mão que por acaso bate.
    for (let i = 0; i < PAPEIS.length; i++) {
      for (let j = i + 1; j < PAPEIS.length; j++) {
        expect(papelAtende(PAPEIS[i], PAPEIS[j])).toBe(true)
        expect(papelAtende(PAPEIS[j], PAPEIS[i])).toBe(false)
      }
    }
  })

  it('PAPEIS cobre TODOS os cargos do enum — o array não tem cobertura de compilador', () => {
    // O perigo documentado no módulo: `PAPEIS` é `readonly PapelUsuario[]`, não um tipo
    // exaustivo. Um cargo esquecido aqui existiria no banco e no Zod e seria INVISÍVEL no
    // <Select> de /admin/usuarios. Os `Record` têm cobertura do compilador — use-os de gabarito.
    expect([...PAPEIS].sort()).toEqual(Object.keys(PAPEL_ROTULO).sort())
    expect([...PAPEIS].sort()).toEqual(Object.keys(PAPEL_DESCRICAO).sort())
  })
})

describe('eAdmin / eDev / podeEscrever', () => {
  it('eAdmin é NÍVEL administrador: admin E dev', () => {
    // ⚠ O ponto que mais importa da F22. Era `papel === 'admin'`; com a igualdade o dev
    // levaria "Esta ação é restrita a administradores" numa tela que o RLS lhe abre.
    expect(eAdmin('dev')).toBe(true)
    expect(eAdmin('admin')).toBe(true)
    expect(eAdmin('operador')).toBe(false)
    expect(eAdmin('consulta')).toBe(false)
    expect(eAdmin(null)).toBe(false)
    expect(eAdmin(undefined)).toBe(false)
  })

  it('eDev é EXATAMENTE o cargo dev — aqui a igualdade é a intenção', () => {
    expect(eDev('dev')).toBe(true)
    expect(eDev('admin')).toBe(false)
    expect(eDev('operador')).toBe(false)
    expect(eDev('consulta')).toBe(false)
    expect(eDev(null)).toBe(false)
    expect(eDev(undefined)).toBe(false)
  })

  it('eAdmin e eDev NÃO são a mesma coisa — o admin é nível, não é dev', () => {
    // Se um dia alguém "simplificar" um pelo outro, é aqui que quebra: eAdmin('admin') é
    // true e eDev('admin') é false; eAdmin('dev') e eDev('dev') são os dois true.
    expect(eAdmin('admin') && !eDev('admin')).toBe(true)
    expect(eAdmin('dev') && eDev('dev')).toBe(true)
  })

  it('podeEscrever espelha `pode_escrever()` do banco (0072): dev, admin e operador', () => {
    expect(podeEscrever('dev')).toBe(true)
    expect(podeEscrever('admin')).toBe(true)
    expect(podeEscrever('operador')).toBe(true)
    expect(podeEscrever('consulta')).toBe(false)
    expect(podeEscrever(null)).toBe(false)
    expect(podeEscrever(undefined)).toBe(false)
  })
})

describe('ePapelValido', () => {
  it('aceita os quatro cargos', () => {
    expect(ePapelValido('dev')).toBe(true)
    expect(ePapelValido('admin')).toBe(true)
    expect(ePapelValido('operador')).toBe(true)
    expect(ePapelValido('consulta')).toBe(true)
    for (const p of PAPEIS) {
      expect(ePapelValido(p)).toBe(true)
    }
  })

  it('recusa qualquer outra coisa (inclusive o que vem de formulário)', () => {
    for (const v of [
      '',
      'ADMIN',
      'Admin',
      'DEV',
      'Dev',
      'desenvolvedor',
      'developer',
      'root',
      'visualizador',
      null,
      undefined,
      0,
      1,
      {},
      [],
    ]) {
      expect(ePapelValido(v)).toBe(false)
    }
  })
})

describe('exigeVinculoDeFilial', () => {
  it('só o operador precisa de vínculo', () => {
    expect(exigeVinculoDeFilial('operador')).toBe(true)
    expect(exigeVinculoDeFilial('dev')).toBe(false)
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

  it('dev, admin e consulta são válidos sem filial nenhuma', () => {
    expect(validarVinculosDoPapel('dev', [])).toBeNull()
    expect(validarVinculosDoPapel('admin', [])).toBeNull()
    expect(validarVinculosDoPapel('consulta', [])).toBeNull()
  })

  it('dev/admin/consulta COM filiais é recusado (formulário inconsistente)', () => {
    expect(validarVinculosDoPapel('admin', [1])).toContain('escreve em todas')
    expect(validarVinculosDoPapel('consulta', [1])).toContain('não escreve em nenhuma')
  })

  it('a frase do DEV é a do lado forte da hierarquia — "escreve em todas"', () => {
    // O motivo da recusa depende do LADO da hierarquia, não do cargo literal. Com
    // `papel === 'admin'` no lugar de `eAdmin`, o dev leria "ele não escreve em nenhuma",
    // o oposto exato da verdade.
    const msg = validarVinculosDoPapel('dev', [1])
    expect(msg).toContain('escreve em todas')
    expect(msg).not.toContain('não escreve em nenhuma')
    // E a frase nomeia o cargo pelo rótulo de UI, nunca pela chave crua.
    expect(msg).toContain(PAPEL_ROTULO.dev)
  })
})

describe('filiaisDeEscrita — o que alimenta os selects das telas de escrita', () => {
  const ativas = [1, 2, 3]

  it('dev escreve em TODAS as ativas, ignorando vínculos', () => {
    // ⚠ O bug MUDO que a F22 evitou: com a comparação literal antiga o dev recebia `[]`
    // aqui, `Operador.filiaisEscrita` vinha vazio e sumiam os selects de filial e os CTAs
    // de ficha — enquanto o banco lhe dava permissão em tudo.
    expect(filiaisDeEscrita('dev', [], ativas)).toEqual([1, 2, 3])
    expect(filiaisDeEscrita('dev', [2], ativas)).toEqual([1, 2, 3])
  })

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
    expect(filiaisDeEscrita(undefined, [1, 2], ativas)).toEqual([])
  })

  it('nível administrador devolve CÓPIA da lista de ativas, não a mesma referência', () => {
    // `Operador.filiaisEscrita` é compartilhado por referência entre layout, admin/layout e
    // page do mesmo render (ver o comentário de `getOperador`): devolver o array de origem
    // deixaria um `.sort()` de qualquer um deles reescrever a lista dos outros.
    for (const papel of ['dev', 'admin'] as const) {
      const r = filiaisDeEscrita(papel, [], ativas)
      expect(r).toEqual(ativas)
      expect(r).not.toBe(ativas)
    }
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

  it('os rótulos são distintos entre si', () => {
    const rotulos = PAPEIS.map((p) => PAPEL_ROTULO[p])
    expect(new Set(rotulos).size).toBe(PAPEIS.length)
  })

  it('o cargo dev se chama "Desenvolvedor" na UI', () => {
    expect(PAPEL_ROTULO.dev).toBe('Desenvolvedor')
  })

  it('os rótulos não repetem "Visualizador", que é a OUTRA porta de acesso', () => {
    // O visualizador por senha dos relatórios (spec §3) não tem cargo; confundir os dois
    // na UI é o erro de vocabulário mais provável desta fase.
    for (const p of PAPEIS) {
      expect(PAPEL_ROTULO[p].toLowerCase()).not.toContain('visualizador')
    }
  })
})

// F28/MOV-03 — o aviso ANTECIPADO de vínculo de filial no wizard de
// movimentação. `escreveNaFilial` é só o predicado de TELA (badge âmbar por
// item, nada trava): a trava real continua sendo `exigirEscritaEm` no
// servidor, intocada por esta fase.
describe('escreveNaFilial — aviso de vínculo de filial no wizard (F28/MOV-03)', () => {
  const filiaisEscrita = [1, 3]

  it('dev escreve em QUALQUER filial, mesmo sem estar na lista de vínculos', () => {
    expect(escreveNaFilial('dev', [], 99)).toBe(true)
    expect(escreveNaFilial('dev', filiaisEscrita, 2)).toBe(true)
  })

  it('admin escreve em QUALQUER filial, mesmo sem estar na lista de vínculos', () => {
    expect(escreveNaFilial('admin', [], 99)).toBe(true)
    expect(escreveNaFilial('admin', filiaisEscrita, 2)).toBe(true)
  })

  it('operador escreve só nas filiais vinculadas', () => {
    expect(escreveNaFilial('operador', filiaisEscrita, 1)).toBe(true)
    expect(escreveNaFilial('operador', filiaisEscrita, 3)).toBe(true)
    expect(escreveNaFilial('operador', filiaisEscrita, 2)).toBe(false)
  })

  it('operador com lista de vínculos VAZIA não escreve em filial nenhuma', () => {
    expect(escreveNaFilial('operador', [], 1)).toBe(false)
    expect(escreveNaFilial('operador', [], 2)).toBe(false)
  })

  it('consulta nunca escreve, mesmo com a filial na lista', () => {
    expect(escreveNaFilial('consulta', filiaisEscrita, 1)).toBe(false)
  })

  it('papel nulo ou indefinido não explode e nunca escreve', () => {
    expect(escreveNaFilial(null, filiaisEscrita, 1)).toBe(false)
    expect(escreveNaFilial(undefined, filiaisEscrita, 1)).toBe(false)
  })

  it('lista de vínculos nula ou indefinida não explode — operador não escreve em nada', () => {
    expect(escreveNaFilial('operador', null, 1)).toBe(false)
    expect(escreveNaFilial('operador', undefined, 1)).toBe(false)
  })

  it('filial ausente (nula ou indefinida) não explode e não escreve', () => {
    expect(escreveNaFilial('operador', filiaisEscrita, null)).toBe(false)
    expect(escreveNaFilial('operador', filiaisEscrita, undefined)).toBe(false)
  })
})

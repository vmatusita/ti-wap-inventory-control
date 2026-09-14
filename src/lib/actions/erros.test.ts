import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { traduzErroBanco } from './erros'

// F7F (OS §2) — revisão adversarial do "erro genérico" do Substituir tudo. A
// `traduzErroBanco` é função pura testável, MAS com dois efeitos colaterais que os
// testes precisam domar: (1) chama `console.error` no fallback; (2) lê
// `process.env.NODE_ENV` para decidir se devolve a mensagem crua (dev) ou a
// genérica (prod). Silenciamos o console e restauramos o NODE_ENV a cada teste.
//
// Dados 100% fictícios — nenhuma mensagem aqui vem de um erro real de produção.

let spyErro: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  spyErro = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  spyErro.mockRestore()
  // `vi.stubEnv` (usado nos testes do fallback) é restaurado aqui — NODE_ENV é
  // read-only no tipo, então não se atribui direto: stub + unstub.
  vi.unstubAllEnvs()
})

describe('timeout de statement (SQLSTATE 57014)', () => {
  it('mapeia por CODE mesmo com mensagem irreconhecível', () => {
    expect(traduzErroBanco('mensagem qualquer que não casa nada', '57014')).toBe(
      'A importação demorou demais e foi cancelada — tente novamente ou avise o TI.',
    )
  })

  it('mapeia por SUBSTRING (canceling statement due to statement timeout) sem code', () => {
    expect(
      traduzErroBanco('ERROR: canceling statement due to statement timeout'),
    ).toBe('A importação demorou demais e foi cancelada — tente novamente ou avise o TI.')
  })

  it('não vaza a mensagem crua do Postgres e não cai no fallback (sem console.error)', () => {
    traduzErroBanco('canceling statement due to statement timeout', '57014')
    expect(spyErro).not.toHaveBeenCalled()
  })
})

// F24 — os NOMES dos dois índices foram preservados pela migration 0091 justamente para
// estes ramos continuarem casando (nenhum teste ligava o nome no SQL ao nome aqui, então a
// renomeação teria matado a tradução em SILÊNCIO). O que mudou é o ALCANCE: desde a 0091 a
// identidade é por filial, então a colisão significa "já existe NESTA FILIAL" — e o texto
// tem de dizer isso, senão manda procurar duplicata onde não há.
describe('índice parcial do import (23505 — service tag sem patrimônio)', () => {
  it('mapeia pela constraint específica (ativos_service_tag_sem_patrimonio_uidx)', () => {
    const msg =
      'duplicate key value violates unique constraint "ativos_service_tag_sem_patrimonio_uidx"'
    const t = traduzErroBanco(msg, '23505')
    expect(t).toContain('sem patrimônio com essa service tag')
    expect(t).toContain('nesta filial')
  })

  it('não colide com o índice composto de patrimônio', () => {
    const msg =
      'duplicate key value violates unique constraint "ativos_patrimonio_service_tag_uidx"'
    expect(traduzErroBanco(msg, '23505')).toBe(
      'Já existe um ativo com esse patrimônio e service tag nesta filial.',
    )
  })
})

describe('raises P0001 da RPC importar_ativos_substituir', () => {
  // As substrings são as EXATAS que a RPC (migration 0034) levanta — se a RPC mudar
  // o texto, estes testes quebram e obrigam a reconciliar o mapa. Confirmadas em DEV.
  const casos: [string, string][] = [
    [
      'O estado da filial mudou desde o preview/backup (ativos 16/0, movs 23/0, anotações 0/0, termos 0/0). Gere o preview novamente antes de aplicar.',
      'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.',
    ],
    [
      'Plano de import vazio: ao menos 1 ativo é obrigatório.',
      'O plano de import está vazio. Gere o preview novamente.',
    ],
    [
      'Há termo(s) gerado(s) que misturam esta filial com outra — substituição bloqueada. Resolva os termos antes.',
      'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.',
    ],
    [
      'Patrimônio inválido no plano: "12345" (esperado ^[A-Z]{2,4}\\d{7}$ ou nulo).',
      'Há um patrimônio fora do padrão no plano. Gere o preview novamente.',
    ],
    [
      'Categoria inválida "impressora" no ativo WAP0001234 (fora do enum categoria_ativo).',
      'Há um valor inválido no plano (categoria ou estado do ativo). Gere o preview novamente.',
    ],
    [
      'Estado-alvo inválido "sumido" no ativo (sem patrimônio) (fora do enum status_ativo).',
      'Há um valor inválido no plano (categoria ou estado do ativo). Gere o preview novamente.',
    ],
    [
      'Plano tem par (patrimônio, service tag) duplicado — cada ativo com patrimônio deve ser único.',
      'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.',
    ],
    [
      'Plano tem service tag repetida entre ativos sem patrimônio — a tag é a identidade quando não há patrimônio.',
      'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.',
    ],
    [
      'Divergência: 15 ativos criados para 16 no plano.',
      'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.',
    ],
    [
      'Divergência (agregada) nas linhas sem patrimônio e sem service tag: a contagem por estado × colaborador não bate entre plano e banco.',
      'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.',
    ],
  ]

  it.each(casos)('mapeia o raise para texto limpo e estável: %s', (raw, esperado) => {
    // A RPC não devolve SQLSTATE customizado para P0001 além do próprio 'P0001';
    // o mapa reconhece pela substring da mensagem (que é NOSSA, pt-BR).
    expect(traduzErroBanco(raw, 'P0001')).toBe(esperado)
  })

  it('nenhum P0001 conhecido cai no fallback (não loga)', () => {
    for (const [raw] of casos) traduzErroBanco(raw, 'P0001')
    expect(spyErro).not.toHaveBeenCalled()
  })
})

describe('fallback — código desconhecido nunca vaza o texto cru do Postgres em produção', () => {
  const CRU = 'ERROR: something raw and internal from postgres 42P01 relation does not exist'

  it('em produção devolve a mensagem GENÉRICA (nunca o texto cru) e LOGA', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const out = traduzErroBanco(CRU, 'XX999')
    expect(out).toBe('Não foi possível concluir a operação. Tente novamente.')
    expect(out).not.toContain('postgres')
    expect(out).not.toContain('42P01')
    // F55 (10/09/2026) — o rastro mudou de FORMA, não de existência: o par
    // `{ code, mensagem }` que a F7F mandou registrar continua saindo inteiro, agora
    // nos campos nativos do funil (`erro.codigo` e `erro.mensagem`), numa LINHA
    // JSON só. O requisito medido aqui — "o texto cru nunca chega na tela, mas
    // chega no servidor" — é o mesmo; é o objeto que se mexeu, por desenho.
    expect(spyErro).toHaveBeenCalledOnce()
    const linha = JSON.parse(String(spyErro.mock.calls[0][0]))
    expect(linha.escopo).toBe('erros.nao-mapeado')
    expect(linha.erro.codigo).toBe('XX999')
    expect(linha.erro.mensagem).toBe(CRU)
  })

  it('fora de produção devolve a mensagem crua (debug) — e ainda LOGA o par {code, mensagem}', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const out = traduzErroBanco(CRU, 'XX999')
    expect(out).toBe(CRU)
    expect(spyErro).toHaveBeenCalledOnce()
  })

  it('mensagem null/undefined não quebra e loga com mensagem null', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(traduzErroBanco(null, null)).toBe('Não foi possível concluir a operação. Tente novamente.')
    expect(spyErro).toHaveBeenCalledOnce()
    const linha = JSON.parse(String(spyErro.mock.calls[0][0]))
    expect(linha.escopo).toBe('erros.nao-mapeado')
    expect(linha.erro.codigo).toBeNull()
    expect(linha.erro.mensagem).toBe('[sem mensagem]')
  })
})

// F56 (Frente E) — o vocabulário de unidades (nome de filial × apelido,
// migration 0139, Decisões 1/2/13 do PLAN-F56). Os dois índices únicos
// traduzem para uma frase ESPECÍFICA (a pré-checagem em `dono-do-termo.ts` já
// deu a mensagem precisa antes de escrever; estes ramos só cobrem a corrida
// rara de dois admins simultâneos). O P0001 do gatilho `vocabulario_unidades_
// guarda` — que JÁ nomeia o termo e a filial dona, em pt-BR — recebe de
// propósito uma frase GENÉRICA (a doutrina do arquivo: nunca extrair valor
// dinâmico de dentro da mensagem do banco).
describe('vocabulário de unidades (F56 · migration 0139)', () => {
  it('índice único do NOME da filial (filiais_nome_chave_uidx)', () => {
    const msg = 'duplicate key value violates unique constraint "filiais_nome_chave_uidx"'
    expect(traduzErroBanco(msg, '23505')).toBe(
      'Já existe uma filial com este nome (a comparação ignora acento, maiúscula e espaço a mais). Atualize a página e tente de novo.',
    )
  })

  it('índice único do APELIDO (unidades_apelidos_apelido_chave_uidx)', () => {
    const msg =
      'duplicate key value violates unique constraint "unidades_apelidos_apelido_chave_uidx"'
    expect(traduzErroBanco(msg, '23505')).toBe(
      'Este apelido já está cadastrado para alguma filial. Atualize a página e tente de novo.',
    )
  })

  it('nenhum dos dois cai no genérico de "duplicate key" (ramo específico ganha)', () => {
    const nome = traduzErroBanco(
      'duplicate key value violates unique constraint "filiais_nome_chave_uidx"',
      '23505',
    )
    const apelido = traduzErroBanco(
      'duplicate key value violates unique constraint "unidades_apelidos_apelido_chave_uidx"',
      '23505',
    )
    const generico = 'Já existe um registro com esses dados. Atualize a página e tente de novo.'
    expect(nome).not.toBe(generico)
    expect(apelido).not.toBe(generico)
  })

  it.each([
    // As quatro frases exatas do P0001 de `vocabulario_unidades_guarda` (migration
    // 0139) — nome × apelido, nos dois sentidos, e a própria filial.
    'Este termo já é o próprio nome da filial Serra.',
    'Este nome não pode repetir o nome de outra filial (Matriz).',
    'Este apelido já é apelido desta própria filial (Serra).',
    'Este apelido já é apelido de outra filial (Matriz).',
  ])('o P0001 do gatilho vira a frase GENÉRICA, sem repassar o texto do banco: %s', (raw) => {
    const t = traduzErroBanco(raw, 'P0001')
    expect(t).toBe(
      'Este nome ou apelido já está em uso (por outra filial, ou por esta mesma do outro lado). Atualize a página para ver qual, e tente de novo.',
    )
    // A doutrina do arquivo: nunca vazar o nome dinâmico que o Postgres interpolou.
    expect(t).not.toContain('Serra')
    expect(t).not.toContain('Matriz')
  })

  it('nenhum dos ramos de vocabulário cai no fallback (não loga)', () => {
    traduzErroBanco('duplicate key value violates unique constraint "filiais_nome_chave_uidx"', '23505')
    traduzErroBanco(
      'duplicate key value violates unique constraint "unidades_apelidos_apelido_chave_uidx"',
      '23505',
    )
    traduzErroBanco('Este termo já é o próprio nome da filial Serra.', 'P0001')
    expect(spyErro).not.toHaveBeenCalled()
  })
})

describe('retrocompat — chamada com 1 argumento (sem code) segue funcionando', () => {
  it('mapeia por substring sem passar o SQLSTATE', () => {
    expect(traduzErroBanco('violates foreign key constraint')).toBe(
      'Um dos valores informados (motivo ou filial) não existe mais.',
    )
    expect(traduzErroBanco('new row violates row-level security policy')).toBe(
      'Sem permissão para esta operação: seu cargo ou suas filiais de escrita não permitem. Se seu acesso mudou agora, recarregue a página; se não, fale com um administrador.',
    )
  })

  // F21 — negativa por CARGO/VÍNCULO. O texto antigo ("Faça login novamente") mentia para
  // quem é `consulta` ou é operador sem a filial vinculada: relogar não muda nada.
  describe('permissão por cargo e filial (F21)', () => {
    it('reconhece a guarda de admin da RPC de import pela mensagem', () => {
      expect(
        traduzErroBanco('Apenas administradores podem executar o import de startup.'),
      ).toBe('Esta ação é restrita a administradores.')
    })

    it('reconhece a guarda de vínculo de criar_compra_lote (com e sem acento)', () => {
      const esperado = 'Você não tem permissão de escrita nesta filial. Fale com um administrador.'
      expect(traduzErroBanco('Sem permissao de escrita na filial 3 (cadastro de compra).')).toBe(
        esperado,
      )
      expect(traduzErroBanco('Sem permissão de escrita na filial 3 (cadastro de compra).')).toBe(
        esperado,
      )
    })

    it('traduz o SQLSTATE 42501 mesmo sem texto reconhecível na mensagem', () => {
      // É o caso do grant de coluna de `profiles` ("permission denied for column papel")
      // e de qualquer recusa de policy que venha só com o code.
      expect(traduzErroBanco('algo cru do postgres', '42501')).toBe(
        'Sem permissão para esta operação: seu cargo ou suas filiais de escrita não permitem. Se seu acesso mudou agora, recarregue a página; se não, fale com um administrador.',
      )
    })

    it('a guarda mais específica ganha da genérica de 42501', () => {
      // A RPC do import levanta 42501 COM a mensagem própria: tem de sair a mensagem de
      // admin, não a genérica de cargo/filial.
      expect(
        traduzErroBanco('Apenas administradores podem executar o import de startup.', '42501'),
      ).toBe('Esta ação é restrita a administradores.')
    })
  })
})

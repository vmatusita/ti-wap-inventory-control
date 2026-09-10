import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  ehViolacaoDeVersao,
  mensagemVersaoExistente,
} from '@/lib/relatorios/versao-snapshot'

describe('mensagemVersaoExistente', () => {
  it('não avisa nada quando o período ainda não tem snapshot', () => {
    expect(mensagemVersaoExistente(null)).toBeNull()
  })

  it('diz a versão que existe, quem gerou, quando — e qual será a nova', () => {
    expect(
      mensagemVersaoExistente({
        versao: 2,
        autorNome: 'Fulano de Tal',
        geradoEm: '2026-07-20T13:45:00-03:00',
      }),
    ).toBe(
      'Já existe a v2 deste período, gerada por Fulano de Tal em 20/07/2026 — você criará a v3.',
    )
  })

  it('autor ausente vira travessão, não "null"', () => {
    const m = mensagemVersaoExistente({
      versao: 1,
      autorNome: null,
      geradoEm: '2026-07-20T13:45:00-03:00',
    })
    expect(m).toContain('gerada por —')
    expect(m).toContain('você criará a v2')
  })
})

describe('ehViolacaoDeVersao', () => {
  it('reconhece o unique_violation pelo código', () => {
    expect(ehViolacaoDeVersao('23505', 'qualquer coisa')).toBe(true)
  })

  it('reconhece pelo nome do índice quando o código não vem', () => {
    expect(
      ehViolacaoDeVersao(
        null,
        'duplicate key value violates unique constraint "relatorios_gerados_periodo_filial_versao_uidx"',
      ),
    ).toBe(true)
  })

  it('reconhece a constraint de tabela da 0010 pelo par duplicate key + tabela', () => {
    expect(
      ehViolacaoDeVersao(
        undefined,
        'duplicate key value violates unique constraint "relatorios_gerados_periodo_de_periodo_ate_filial_id_versao_key"',
      ),
    ).toBe(true)
  })

  it('não confunde outro erro com colisão de versão', () => {
    expect(ehViolacaoDeVersao('23503', 'insert or update violates foreign key')).toBe(false)
    expect(ehViolacaoDeVersao(null, 'permission denied for table relatorios_gerados')).toBe(
      false,
    )
    expect(ehViolacaoDeVersao(null, null)).toBe(false)
  })

  // Um 23505 de OUTRA tabela não pode virar renumeração de versão em silêncio — mas
  // o código sozinho é a pista mais forte que o PostgREST dá, e esta action só
  // insere numa tabela. O teste registra a escolha.
  it('trata qualquer 23505 como colisão — a action só insere em relatorios_gerados', () => {
    expect(ehViolacaoDeVersao('23505', 'duplicate key on ativos_patrimonio_uidx')).toBe(true)
  })
})

// F29 — guardas de FONTE dos dois achados da revisão adversarial que a suíte não
// pegaria (não há banco no Vitest): a leitura da versão vigente falha FECHADA, e o
// texto copiado dos snapshots ANTIGOS também recebe os extras.
describe('gerarRelatorio — a leitura de versão não pode voltar a engolir o erro', () => {
  const FONTE = readFileSync(
    fileURLToPath(new URL('../actions/relatorios.ts', import.meta.url)),
    'utf8',
  )

  // O supabase-js NUNCA rejeita a promise em falha de rede: devolve `{data:null,
  // error}`. Um `const { data } = …` transformaria a falha em "período virgem", a
  // próxima versão seria sempre 1, o insert bateria no índice único nas 4 tentativas
  // e o operador levaria "Outra pessoa gerou este mesmo período" sobre uma falha de
  // infraestrutura — mentira específica, que é pior que erro genérico.
  it('distingue "não há versão" de "não deu para saber"', () => {
    expect(FONTE).toContain('type LeituraVersao')
    const semEspaco = FONTE.replace(/\s+/g, '')
    expect(semEspaco).toContain('const{data,error}=awaitq')
    expect(semEspaco).not.toContain('const{data}=awaitq')
  })

  it('a geração RECUSA quando a leitura falha, em vez de supor a v1', () => {
    expect(FONTE).toContain('if (!leitura.ok)')
    expect(FONTE).toContain('Não foi possível conferir qual é a versão atual')
  })

  it('a falha deixa rastro no servidor', () => {
    // F55 (10/09/2026) — o rastro MUDOU DE FORMA, não de existência: o
    // `console.error('[relatorios] falha ao ler a versão vigente', …)` virou uma
    // chamada ao funil, com o prefixo `[relatorios]` transformado em ESCOPO. O
    // que este caso mede — "a leitura que falha deixa rastro" — continua sendo
    // exatamente o mesmo requisito; é o objeto que se mexeu, por desenho.
    expect(FONTE).toContain('registrarFalha(')
    expect(FONTE).toContain("escopo: 'relatorios.versao-vigente'")
  })
})

// F34/A — revogação PARCIAL da REL-08 (ata em docs/DECISOES.md): o bloco
// "Em estoque (N)" deixou de ser emitido (lib/relatorios/resumo.ts) e o extra
// `disponiveis` saiu do contrato de `ExtrasResumo` — os dois corpos passam a
// repassar SÓ `kpis`. Este describe travava `extras={{kpis:s.kpis,disponiveis:…}}`
// nos dois; o teste muda porque o REQUISITO mudou, não para "passar" — e a
// assinatura escolhida (`toContain('extras={{kpis:s.kpis}}')`) já é, por
// construção, uma asserção negativa: se `disponiveis` voltasse a ser passado, o
// texto stripado ficaria `extras={{kpis:s.kpis,disponiveis:…}}` e deixaria de
// conter a substring exata que o teste procura (falha, não falso-positivo).
describe('o texto copiado recebe só o extra kpis nos DOIS corpos (v1 e v2)', () => {
  function corpo(arquivo: string): string {
    return readFileSync(
      fileURLToPath(new URL(`../../components/relatorios/${arquivo}`, import.meta.url)),
      'utf8',
    ).replace(/\s+/g, '')
  }

  // O v1 é o corpo dos snapshots pré-F3B, que continuam abrindo pelo link antigo.
  // Deixá-lo de fora faria o MESMO botão "Copiar texto" produzir textos diferentes
  // conforme a idade do snapshot — sem nada na tela explicando a diferença.
  it('v1 passa só kpis', () => {
    expect(corpo('corpo-relatorio.tsx')).toContain('extras={{kpis:s.kpis}}')
  })

  it('v2 passa só kpis — sem achatarDisponiveis (função removida na F34/A)', () => {
    const v2 = corpo('corpo-relatorio-v2.tsx')
    expect(v2).toContain('extras={{kpis:s.kpis}}')
    expect(v2).not.toContain('achatarDisponiveis')
  })
})

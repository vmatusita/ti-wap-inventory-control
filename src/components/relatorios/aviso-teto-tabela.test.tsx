import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { AvisoTetoTabela } from './aviso-teto-tabela'

// F60 (fato 16 · PLAN-F60 §10, decisão 6) — o aviso do teto das três tabelas do relatório.
//
// Grau 1 do piso de componente da F45: render ESTÁTICO (`renderToStaticMarkup`), o HTML que o
// servidor manda. O que se protege é o par que a fase promete e que nenhum `tsc` vê: SEM a chave
// `tabelasTruncadas` o aviso não existe (a tabela de hoje fica idêntica), e COM ela o número dito é
// o total exato, com o papel que o leitor de tela anuncia.
//
// As tabelas em si (`tabela-*.tsx`) não se renderizam aqui — usam o hook dos filtros, que lê a URL
// do Next —, então a segunda metade confere o CÓDIGO-FONTE delas, como `impressao-colunas.test.ts`:
// que o aviso está nas três e que nenhuma volta a pôr `rows.length` no título.

const CORTE = { mostradas: 2_000, total: 2_412 }

describe('AvisoTetoTabela — só aparece com o corte', () => {
  it('SEM a chave (o relatório de hoje, e todo snapshot anterior à F60): não renderiza nada', () => {
    expect(renderToStaticMarkup(<AvisoTetoTabela corte={undefined} plural="saídas" />)).toBe('')
    expect(renderToStaticMarkup(<AvisoTetoTabela corte={undefined} plural="saídas" aoVivo />)).toBe('')
  })

  it('COM a chave: diz quantas mostra e o total exato do período, no formato pt-BR', () => {
    const html = renderToStaticMarkup(<AvisoTetoTabela corte={CORTE} plural="saídas" aoVivo />)
    expect(html).toContain('2.000')
    expect(html).toContain('2.412')
    expect(html).toContain('saídas mais recentes')
    expect(html).toContain('no período')
  })

  it('é `role="status"` — anuncia sem interromper (a intenção `atencao` do `Aviso`)', () => {
    const html = renderToStaticMarkup(<AvisoTetoTabela corte={CORTE} plural="entradas" />)
    expect(html).toMatch(/\srole="status"/)
  })

  it('ao vivo aconselha encurtar o período; o snapshot congelado diz que guardou só essas', () => {
    const aoVivo = renderToStaticMarkup(<AvisoTetoTabela corte={CORTE} plural="saídas" aoVivo />)
    const congelado = renderToStaticMarkup(<AvisoTetoTabela corte={CORTE} plural="saídas" />)
    expect(aoVivo).toContain('encurte o período')
    expect(congelado).not.toContain('encurte o período')
    expect(congelado).toContain('relatório gerado guardou só essas')
  })

  it('Transferências (sem selects de filtro) fala só da busca, no singular', () => {
    const semFiltros = renderToStaticMarkup(
      <AvisoTetoTabela corte={CORTE} plural="transferências" temFiltros={false} />,
    )
    expect(semFiltros).toContain('A busca considera')
    expect(semFiltros).not.toContain('filtros')
    const comFiltros = renderToStaticMarkup(<AvisoTetoTabela corte={CORTE} plural="saídas" />)
    expect(comFiltros).toContain('A busca e os filtros consideram')
  })

  it('não se esconde do papel (o impresso é o substituto do e-mail arquivável)', () => {
    expect(renderToStaticMarkup(<AvisoTetoTabela corte={CORTE} plural="saídas" />)).not.toContain('print:hidden')
  })
})

describe('as três tabelas usam o corte (conferência pelo código-fonte)', () => {
  const DIR = join(process.cwd(), 'src', 'components', 'relatorios')
  // Comentário que cita o código não é o código.
  const semComentarios = (src: string) =>
    src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const TABELAS = ['tabela-saidas.tsx', 'tabela-entradas.tsx', 'tabela-transferencias.tsx'].map((arquivo) => ({
    arquivo,
    fonte: semComentarios(readFileSync(join(DIR, arquivo), 'utf8')),
  }))

  it.each(TABELAS)('$arquivo renderiza o aviso com o corte recebido', ({ fonte }) => {
    expect(fonte).toMatch(/<AvisoTetoTabela\s+corte=\{corte\}/)
  })

  it.each(TABELAS)('$arquivo tira o total do título de `totalDaTabela`, nunca de `rows.length`', ({ fonte }) => {
    expect(fonte).toContain('total={totalDaTabela(rows, corte)}')
    expect(fonte).not.toMatch(/total=\{rows\.length\}/)
  })

  it.each(TABELAS)('$arquivo só mostra chips de resumo (somas das linhas carregadas) sem corte', ({ fonte }) => {
    const chips = [...fonte.matchAll(/<ChipsResumo\b/g)]
    expect(chips.length).toBeGreaterThan(0)
    for (const m of chips) {
      const antes = fonte.slice(Math.max(0, (m.index ?? 0) - 40), m.index)
      expect(antes).toMatch(/!corte\s*&&\s*$/)
    }
  })

  it('o corpo do relatório passa o corte de CADA tabela a ela, e o total ao chip-âncora', () => {
    const corpo = semComentarios(readFileSync(join(DIR, 'corpo-relatorio-v2.tsx'), 'utf8'))
    for (const t of ['saidas', 'entradas', 'transferencias']) {
      expect(corpo).toContain(`corte={s.tabelasTruncadas?.${t}}`)
      expect(corpo).toContain(`totalDaTabela(s.${t}, s.tabelasTruncadas?.${t})`)
    }
  })
})

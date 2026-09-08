import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// O FILTRO DE TABELA NÃO É RECORTE DE TENANT (F50).
//
// `use-filtros-tabela.ts` filtra o que JÁ CHEGOU ao navegador. Ele é `'use client'`:
// quando o `Array.filter` roda, as linhas já vieram do servidor, já estão no HTML e
// já passaram pela aba de rede. Filtrar aqui é o leitor escolhendo o que olhar.
//
// `filial` já é um `CampoFiltro`, e é legítimo: todo logado ATIVO lê todas as filiais
// (ADR-002), então filtrar por filial no cliente não esconde nada que a pessoa não
// pudesse ver de qualquer jeito. É justamente essa legitimidade que faz dele um
// PRECEDENTE PERIGOSO — a linha de código para `empresa` seria idêntica, e o efeito,
// oposto: daria a APARÊNCIA de separação entre empresas sem nenhuma separação real,
// no navegador de quem nunca devia ter recebido aquelas linhas.
//
// Esta trava lê o arquivo como TEXTO de propósito. Um teste de comportamento sobre o
// hook não pegaria o caso: acrescentar `'empresa'` à união compila, roda e passa em
// todo teste de filtro — o defeito não é o hook funcionar mal, é ele funcionar bem
// para uma pergunta que não é dele.
const ARQUIVO = join(process.cwd(), 'src', 'components', 'relatorios', 'use-filtros-tabela.ts')

/** A união literal de `CampoFiltro`, lida do fonte. */
function camposDeclarados(): string[] {
  const fonte = readFileSync(ARQUIVO, 'utf8')
  const m = fonte.match(/export\s+type\s+CampoFiltro\s*=\s*([^\n]+)/)
  if (!m) throw new Error('não achei a declaração de CampoFiltro — a trava ficou cega')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

describe('use-filtros-tabela: recorte de leitura, nunca de autorização', () => {
  it('enxerga a união de CampoFiltro (guarda do próprio teste)', () => {
    const campos = camposDeclarados()
    expect(campos.length, 'a união veio vazia — o parser quebrou').toBeGreaterThan(2)
    expect(campos).toContain('filial')
  })

  it('CampoFiltro não conhece a empresa', () => {
    expect(
      camposDeclarados(),
      'este hook filtra o que JÁ CHEGOU ao navegador: um filtro de `empresa` aqui daria ' +
        'a aparência de separação entre empresas sem a separação. Quem decide o que chega ' +
        'é o servidor — a RLS, e o código das queries de relatório para o viewer por senha.',
    ).not.toContain('empresa')
  })

  it('nem `empresa_id`, nem nenhum apelido dela, aparece no hook', () => {
    const fonte = readFileSync(ARQUIVO, 'utf8')
    // Sem `\b` no fim de propósito: pega `empresa_id`, `empresaId`, `empresas`.
    const suspeitos = [...fonte.matchAll(/\bempresa\w*/gi)]
      .map((m) => m[0])
      // O cabeçalho EXPLICA por que `empresa` não entra — citar o nome para proibi-lo
      // é o oposto de introduzi-lo. Só as menções em comentário são toleradas, e a
      // asserção acima é quem garante que a união em si continua limpa.
      .filter((_, i) => {
        const idx = [...fonte.matchAll(/\bempresa\w*/gi)][i].index ?? 0
        const linha = fonte.slice(fonte.lastIndexOf('\n', idx) + 1, fonte.indexOf('\n', idx))
        return !linha.trimStart().startsWith('//')
      })
    expect(
      suspeitos,
      'recorte por empresa não se resolve no cliente — é F70, e mora no servidor',
    ).toEqual([])
  })

  it('o cabeçalho diz, em prosa, que o hook filtra o que já chegou', () => {
    const fonte = readFileSync(ARQUIVO, 'utf8')
    expect(fonte).toContain('filtra O QUE JÁ CHEGOU')
    expect(fonte).toContain('Nunca é recorte de AUTORIZAÇÃO')
  })
})

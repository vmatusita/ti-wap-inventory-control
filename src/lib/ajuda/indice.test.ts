import { describe, it, expect } from 'vitest'
import { INDICE_PALETA, indicePaleta, textoDaPagina, textoDoBloco } from '@/lib/ajuda/indice'
import { PAGINAS, paginaPorSlug } from '@/lib/ajuda/registry'
import { casaBusca, normalizarBusca } from '@/lib/ajuda/busca'
import {
  STATUS_ORDEM,
  STATUS_META,
  CATEGORIA_ORDEM,
  CATEGORIA_META,
  TIPO_META,
  TIPO_LANCAMENTO_META,
  type TipoMovimentacao,
} from '@/lib/dominio'

// A busca da documentacao tem UMA chave e UM predicado. Este helper NAO e um
// segundo predicado: e o mesmo `casaBusca` que roda no navegador, aplicado a
// mesma constante que a /ajuda emite no `data-ajuda-texto` de cada card.
// Testar isto e testar o que o operador executa.
const acha = (consulta: string) =>
  INDICE_PALETA.filter((e) => casaBusca(e.chave, consulta)).map((e) => e.slug)

describe('índice de busca da documentação', () => {
  it('cobre TODAS as páginas — uma página fora do índice é invisível', () => {
    expect(INDICE_PALETA).toHaveLength(PAGINAS.length)
    expect(INDICE_PALETA.map((e) => e.slug).sort()).toEqual(PAGINAS.map((p) => p.slug).sort())
  })

  it('nenhuma entrada tem chave vazia', () => {
    for (const e of INDICE_PALETA) expect(e.chave.length).toBeGreaterThan(0)
  })

  it('a chave já vem normalizada (o cliente só compara)', () => {
    for (const e of INDICE_PALETA) expect(e.chave).toBe(normalizarBusca(e.chave))
  })

  it('consulta vazia devolve tudo', () => {
    expect(acha('')).toHaveLength(PAGINAS.length)
    expect(acha('   ')).toHaveLength(PAGINAS.length)
  })

  it('termo ausente não devolve nada', () => {
    expect(acha('xpto-inexistente-123')).toHaveLength(0)
  })

  it('acha sem acento e sem caixa', () => {
    expect(acha('MANUTENCAO').length).toBeGreaterThan(0)
    expect(acha('manutenção').length).toBeGreaterThan(0)
  })

  it('acha pelas palavras que o operador usa no dia a dia (os sinônimos)', () => {
    // Os `termos` de cada página existem justamente para isto: quem procura
    // "consumível" tem de achar a página de itens por quantidade. Cada linha
    // aqui exige o sinônimo correspondente no `termos` da página — nenhuma
    // delas é rótulo de enum, que entra por derivação e é proibido copiar.
    for (const [consulta, slug] of [
      ['consumivel', 'itens-por-quantidade'],
      ['plaqueta', 'identidade-do-equipamento'],
      ['teclado', 'limites-e-atalhos'],
      ['escuro', 'mapa-das-telas'],
      ['errei', 'corrigir-estorno-ajuste'],
      // Verbos como o operador os diz.
      ['devolver', 'devolucao-e-triagem'],
      ['consertar', 'manutencao'],
      ['trocar', 'tipos-de-movimentacao'],
      ['ajustar', 'corrigir-estorno-ajuste'],
      ['cadastrar', 'cadastrar-compra'],
      ['entrar', 'acesso-e-sessoes'],
      // Formas derivadas que o casamento por substring não alcança sozinho.
      ['usuarios', 'usuarios-e-senhas'],
      ['termo de responsabilidade', 'termos-de-responsabilidade'],
      ['anotacao', 'ficha-do-ativo'],
      // Nomes de botão e de ação.
      ['cancelar', 'corrigir-estorno-ajuste'],
      ['excluir', 'administracao'],
      ['apagar', 'administracao'],
      ['colar lista', 'colar-e-bipar-lote'],
      ['repetir ultima', 'kits-de-movimentacao'],
      ['gerar termo', 'termos-de-responsabilidade'],
      ['inventario', 'comece-aqui'],
      ['sem service tag', 'resolver-pendencias'],
      ['faltando', 'resolver-pendencias'],
      // Reintegradas em 25/07/2026: viviam no describe da paleta, que foi fundido
      // neste, e saíram sem substituto. São as consultas de UMA palavra que o
      // operador mais digita — a rede tem de continuar aqui agora que a chave
      // deixou de ser o corpo do texto e passou a depender de `termos` curados.
      ['pendencia', 'resolver-pendencias'],
      ['kit', 'kits-de-movimentacao'],
      ['csv', 'lista-de-ativos'],
    ] as const) {
      expect(acha(consulta), `busca "${consulta}"`).toContain(slug)
    }
  })

  // Antes de 25/07/2026 este teste se chamava "acha uma página pelo conteúdo do
  // corpo": a chave era o texto inteiro. Continua verde por outro motivo, e é o
  // motivo que importa — "Atrelar" é `TIPO_LANCAMENTO_META.reserva.rotulo`,
  // derivado de dominio.ts e servido num bloco `glossario`. Asserimos o
  // MECANISMO, não só o resultado: se alguém tirar os rótulos de `glossario` da
  // chave, este teste falha pelo motivo certo.
  it('acha pelo vocabulário DERIVADO do domínio, não só por título e resumo', () => {
    const p = paginaPorSlug('itens-por-quantidade')!
    const soCabecalho = normalizarBusca([p.titulo, p.resumo, ...(p.termos ?? [])].join(' '))
    // F41 — a âncora era a string literal 'atrelar', e ela morreu junto com o
    // rótulo (decisão J1: `reserva` passou a ler-se "Reserva"). Em vez de trocar
    // uma literal por outra, a âncora passou a ser DERIVADA: o rótulo de
    // `liberacao` só entra nesta página pelo bloco `glossario`, nunca pelo
    // cabeçalho — que é exatamente o mecanismo que este caso existe para provar.
    // Assim ele acompanha o próximo renome sozinho.
    const alvo = normalizarBusca(TIPO_LANCAMENTO_META.liberacao.rotulo)
    expect(soCabecalho).not.toContain(alvo)
    expect(acha(alvo)).toContain('itens-por-quantidade')
  })

  // A trava de CLASSE: um status, categoria ou tipo novo não pode nascer
  // invisível na busca. Como os rótulos entram por derivação (nunca copiados à
  // mão), esta asserção acompanha `dominio.ts` sozinha.
  it('todo rótulo de status, categoria e tipo acha ao menos uma página', () => {
    for (const s of STATUS_ORDEM) {
      expect(acha(STATUS_META[s].rotulo), `status "${s}"`).not.toHaveLength(0)
    }
    for (const c of CATEGORIA_ORDEM) {
      expect(acha(CATEGORIA_META[c].rotulo), `categoria "${c}"`).not.toHaveLength(0)
    }
    for (const t of Object.keys(TIPO_META) as TipoMovimentacao[]) {
      expect(acha(TIPO_META[t].rotulo), `tipo "${t}"`).not.toHaveLength(0)
    }
  })

  // O teto que impede a chave de virar corpo de novo. A folga é de propósito: o
  // teste é contra REINFLAR (a chave somava 7.810 caracteres em 25/07/2026, e o
  // corpo inteiro, 208.525), não contra crescer devagar.
  it('a chave é vocabulário, não o corpo do texto', () => {
    const total = INDICE_PALETA.reduce((s, e) => s + e.chave.length, 0)
    expect(total).toBeLessThan(20_000)

    for (const e of INDICE_PALETA) {
      const pagina = paginaPorSlug(e.slug)!
      expect(e.chave.length, `chave de ${e.slug}`).toBeLessThan(textoDaPagina(pagina).length)
    }

    // A guarda SEMÂNTICA, que é a que pega o caso real: prosa de `paragrafo`
    // nunca entra. Falha no dia em que alguém acrescentar `descricao` (ou
    // `efeito`, ou `causa`) a `vocabularioDoBloco`.
    const conceito = paginaPorSlug('conceito-movimentacao')!
    const paragrafo = conceito.blocos.find((b) => b.tipo === 'paragrafo')!
    const frase = normalizarBusca(textoDoBloco(paragrafo)).slice(0, 60)
    expect(frase.length).toBeGreaterThan(20)
    const entrada = INDICE_PALETA.find((e) => e.slug === conceito.slug)!
    expect(entrada.chave).not.toContain(frase)
  })

  it('não carrega o corpo do texto — é isso que mantém o payload pequeno', () => {
    // sem `texto`: a projeção leve é um contrato, não um detalhe
    for (const e of INDICE_PALETA) expect(e).not.toHaveProperty('texto')
  })

  it('indicePaleta() calcula o mesmo que a constante INDICE_PALETA', () => {
    expect(indicePaleta()).toEqual([...INDICE_PALETA])
  })
})

describe('textoDoBloco cobre todo tipo de bloco', () => {
  it('não devolve vazio para nenhum bloco real da documentação', () => {
    for (const p of PAGINAS) {
      for (const b of p.blocos) {
        // `links` pode ser vazio quando todos os rótulos são derivados do
        // destino — é o único caso legítimo.
        if (b.tipo === 'links') continue
        expect(textoDoBloco(b).trim().length, `${p.slug} · ${b.tipo}`).toBeGreaterThan(0)
      }
    }
  })

  it('o texto da página inclui título, resumo e sinônimos', () => {
    const p = paginaPorSlug('limites-e-atalhos')!
    const t = textoDaPagina(p)
    expect(t).toContain(normalizarBusca(p.titulo))
    expect(t).toContain(normalizarBusca(p.resumo))
    for (const s of p.termos ?? []) expect(t).toContain(normalizarBusca(s))
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { CATEGORIAS, PAGINAS, ancorasDaPagina, paginaPorSlug } from '@/lib/ajuda/registry'
import { textoDaPagina } from '@/lib/ajuda/indice'
import { normalizarBusca } from '@/lib/ajuda/busca'
import { STATUS_META } from '@/lib/dominio'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import type { Bloco, PaginaAjuda } from '@/lib/ajuda/tipos'

// Completude da categoria "Comece aqui" (F20 · frente C1). O que esta suite trava:
//  - as cinco paginas existem, na ordem do sitemap, e nenhuma perde o bloco de links;
//  - os ROTULOS citados sao os da tela de verdade (menu lateral, tiles do painel,
//    seletor de tema) — os arquivos reais sao lidos e comparados linha a linha;
//  - o que e DERIVADO continua derivado (status, teto do lote, dominios de e-mail);
//  - as frases que outras paginas e o manual antigo dependem continuam de pe.
// Teste so cresce: capacidade documentada aqui nao volta a sumir em silencio.

const RAIZ = process.cwd()

const SLUGS_C1 = [
  'comece-aqui',
  'conceito-movimentacao',
  'identidade-do-equipamento',
  'acesso-e-sessoes',
  'mapa-das-telas',
] as const

function pagina(slug: string): PaginaAjuda {
  const p = paginaPorSlug(slug)
  if (!p) throw new Error(`página não encontrada no registry: ${slug}`)
  return p
}

function texto(slug: string): string {
  return textoDaPagina(pagina(slug))
}

/** `expect(...).toContain` com a mesma normalização da busca (sem acento/caixa). */
function cita(slug: string, ...frases: string[]) {
  const t = texto(slug)
  for (const f of frases) {
    expect(t, `${slug} deveria citar "${f}"`).toContain(normalizarBusca(f))
  }
}

function blocos<T extends Bloco['tipo']>(
  slug: string,
  tipo: T,
): Extract<Bloco, { tipo: T }>[] {
  return pagina(slug).blocos.filter(
    (b): b is Extract<Bloco, { tipo: T }> => b.tipo === tipo,
  )
}

function fonte(...partes: string[]): string {
  return readFileSync(join(RAIZ, ...partes), 'utf8')
}

/** Rótulos de um array `const X = [...]` de um componente real, na ordem da tela. */
function rotulosDe(arquivo: string, constante: string): string[] {
  const src = fonte(...arquivo.split('/'))
  const bloco = src.match(new RegExp(`const ${constante}[\\s\\S]*?= \\[([\\s\\S]*?)\\n\\]`))
  if (!bloco) throw new Error(`${constante} não encontrado em ${arquivo}`)
  return [...bloco[1].matchAll(/rotulo: '([^']+)'/g)].map((m) => m[1])
}

// ---------------------------------------------------------------------------
// A categoria inteira
// ---------------------------------------------------------------------------

describe('categoria "Comece aqui" (frente C1)', () => {
  it('tem exatamente as cinco páginas do sitemap, nesta ordem', () => {
    const naCategoria = PAGINAS.filter((p) => p.categoria === 'comecar').map((p) => p.slug)
    expect(naCategoria).toEqual([...SLUGS_C1])
  })

  it('toda página termina com um bloco de links e todo destino existe', () => {
    for (const slug of SLUGS_C1) {
      const p = pagina(slug)
      const ultimo = p.blocos[p.blocos.length - 1]
      expect(ultimo.tipo, `${slug} não fecha com links`).toBe('links')
      if (ultimo.tipo !== 'links') continue
      expect(ultimo.itens.length).toBeGreaterThan(1)
      for (const r of ultimo.itens) {
        expect(paginaPorSlug(r.slug), `${slug} aponta para ${r.slug}`).toBeDefined()
      }
    }
  })

  it('as âncoras novas são prefixadas pelo radical da página (só as históricas escapam)', () => {
    const historicas = ['quatro-coisas', 'primeiro-dia', 'teclado']
    const radical: Record<string, string> = {
      'comece-aqui': 'comecar-',
      'conceito-movimentacao': 'conceito-',
      'identidade-do-equipamento': 'identidade-',
      'acesso-e-sessoes': 'acesso-',
      'mapa-das-telas': 'mapa-',
    }
    for (const slug of SLUGS_C1) {
      for (const a of ancorasDaPagina(pagina(slug))) {
        if (historicas.includes(a.id)) continue
        expect(a.id.startsWith(radical[slug]), `${slug}#${a.id} sem prefixo`).toBe(true)
      }
    }
  })

  it('toda âncora que OUTRA página cita nestas cinco continua existindo', () => {
    for (const p of PAGINAS) {
      for (const b of p.blocos) {
        if (b.tipo !== 'links') continue
        for (const r of b.itens) {
          if (!r.ancora || !SLUGS_C1.includes(r.slug as (typeof SLUGS_C1)[number])) continue
          const ids = ancorasDaPagina(pagina(r.slug)).map((a) => a.id)
          expect(ids, `${p.slug} -> ${r.slug}#${r.ancora}`).toContain(r.ancora)
        }
      }
    }
  })

  it('os exemplos de patrimônio continuam fictícios nas cinco páginas', () => {
    for (const slug of SLUGS_C1) {
      for (const m of texto(slug).matchAll(/wap\d{7}/g)) {
        expect(['wap0001234', 'wap0004491'], `patrimônio real em ${slug}`).toContain(m[0])
      }
    }
  })
})

// ---------------------------------------------------------------------------
// comece-aqui
// ---------------------------------------------------------------------------

describe('comece-aqui', () => {
  it('traz o vocabulário mínimo do sistema, uma linha por palavra', () => {
    const tabela = blocos('comece-aqui', 'tabela')[0]
    expect(tabela).toBeDefined()
    const palavras = tabela.linhas.map((l) => l[0])
    for (const p of [
      'Ativo',
      'Movimentação',
      'Lote',
      'Item por quantidade',
      'Lançamento',
      'Filial',
      'Termo',
      'Pendência',
      'Kit',
      'Relatório gerado',
    ]) {
      expect(palavras, `falta a palavra "${p}" no vocabulário`).toContain(p)
    }
    for (const linha of tabela.linhas) expect(linha[1].length).toBeGreaterThan(30)
  })

  it('o teto do lote vem da constante — nunca digitado à mão', () => {
    cita('comece-aqui', `até ${MAX_LOTE_MOVIMENTACAO} de uma vez`)
    const src = fonte('src', 'lib', 'ajuda', 'conteudo', 'comece-aqui.ts')
    expect(src).toContain('MAX_LOTE_MOVIMENTACAO')
    expect(src).not.toContain(`até ${MAX_LOTE_MOVIMENTACAO}`)
  })

  it('descreve Pendências como esteira de regularização, com o selo do menu', () => {
    cita(
      'comece-aqui',
      'esteira de regularização',
      'selo âmbar',
      'Nada disso trava a operação',
    )
  })

  it('o roteiro do primeiro dia passa pelas telas de operação', () => {
    const roteiro = blocos('comece-aqui', 'passos').find(
      (b) => b.titulo === 'Um roteiro de 10 minutos',
    )
    expect(roteiro).toBeDefined()
    const t = normalizarBusca(roteiro!.itens.join(' '))
    for (const tela of ['Ativos', 'Movimentações', 'Pendências', 'Itens', 'Relatórios']) {
      expect(t, `o roteiro não passa por ${tela}`).toContain(normalizarBusca(tela))
    }
    expect(t).toContain(normalizarBusca('Ctrl+K'))
    expect(t).toContain(normalizarBusca('Linha do tempo'))
  })

  it('ensina onde achar ajuda depois (o "?", a tecla e o manual)', () => {
    cita('comece-aqui', 'Manual completo (para imprimir)', 'Buscar na documentação')
  })

  it('aponta para as outras quatro páginas da categoria', () => {
    const links = blocos('comece-aqui', 'links')[0].itens.map((r) => r.slug)
    for (const slug of SLUGS_C1.filter((s) => s !== 'comece-aqui')) {
      expect(links).toContain(slug)
    }
  })
})

// ---------------------------------------------------------------------------
// conceito-movimentacao
// ---------------------------------------------------------------------------

describe('conceito-movimentacao', () => {
  it('mostra o que deriva de um registro só', () => {
    const tabela = blocos('conceito-movimentacao', 'tabela')[0]
    expect(tabela).toBeDefined()
    expect(tabela.colunas).toEqual(['Você registra', 'O sistema atualiza sozinho'])
    expect(tabela.linhas.length).toBeGreaterThanOrEqual(6)
    const registros = normalizarBusca(tabela.linhas.map((l) => l[0]).join(' '))
    for (const evento of ['compra', 'saída', 'devolução', 'transferência', 'manutenção', 'item']) {
      expect(registros, `a tabela não cobre "${evento}"`).toContain(normalizarBusca(evento))
    }
  })

  it('mantém o histórico imutável e as duas saídas do erro, com as mensagens reais', () => {
    cita(
      'conceito-movimentacao',
      'não se apagam nem se editam',
      'Só a última movimentação do ativo pode ser estornada',
      'Transição inválida: o ativo não aceita essa movimentação no estado atual.',
      'Ajuste',
      'justificativa',
    )
  })

  it('lista o que fica gravado em cada registro, inclusive o autor', () => {
    cita('conceito-movimentacao', 'Quem registrou', 'de → para')
  })

  it('separa o que é recalculado do que já foi congelado', () => {
    cita('conceito-movimentacao', 'relatório gerado e um termo emitido guardam o texto da época')
  })
})

// ---------------------------------------------------------------------------
// identidade-do-equipamento
// ---------------------------------------------------------------------------

describe('identidade-do-equipamento', () => {
  it('mantém a frase do botão de copiar (contrato do manual antigo)', () => {
    cita('identidade-do-equipamento', 'botão de copiar', 'Copiar patrimônio')
  })

  it('manda as ações de exceção para o menu ⋯ da ficha (F19-UX)', () => {
    cita(
      'identidade-do-equipamento',
      'Mais ações',
      'Corrigir patrimônio',
      'Definir patrimônio',
      'Definir service tag',
    )
  })

  it('diz que a service tag é obrigatória no cadastro manual e imutável depois', () => {
    cita(
      'identidade-do-equipamento',
      'OBRIGATÓRIA em todo cadastro manual',
      'Só o import de startup aceita linha sem ela',
      'Este ativo já tem service tag — ela é imutável (identidade do equipamento).',
    )
  })

  it('cobre o patrimônio ausente e o fora do padrão que existem no acervo', () => {
    cita(
      'identidade-do-equipamento',
      'sem patrimônio',
      'Sem patrimônio',
      'FORA do formato canônico',
      'Patrimônio original',
    )
  })

  it('cita os quatro lugares onde o patrimônio duplicado se resolve', () => {
    cita(
      'identidade-do-equipamento',
      'Patrimônio duplicado — confira a service tag antes de escolher.',
      'patrimônio duplicado: escolha qual',
      'Nada entra sem escolha.',
      'a coluna "Service Tag" aparece SÓ quando há patrimônio duplicado',
    )
  })
})

// ---------------------------------------------------------------------------
// acesso-e-sessoes
// ---------------------------------------------------------------------------

describe('acesso-e-sessoes', () => {
  it('deriva a lista de domínios da constante, nunca digitada', () => {
    cita('acesso-e-sessoes', DOMINIOS_TEXTO)
    const src = fonte('src', 'lib', 'ajuda', 'conteudo', 'acesso-e-sessoes.ts')
    expect(src).toContain('DOMINIOS_TEXTO')
    expect(src).not.toContain('@wap.ind.br')
  })

  it('descreve as duas portas e o nível único', () => {
    cita('acesso-e-sessoes', 'Nível único', 'Não existe auto-cadastro')
  })

  it('descreve o shell reduzido do visualizador com os rótulos reais', () => {
    cita(
      'acesso-e-sessoes',
      'Estoque TI · Relatórios',
      'Ao vivo',
      'Gerados',
      'Visualização',
      'Sair',
      'Como ler este relatório',
      'É operador da WAP? Entrar com sua conta',
    )
  })

  it('registra que o visualizador NÃO tem controle de tema (CAP-95)', () => {
    cita('acesso-e-sessoes', 'Ele não tem controle de tema', 'Tema')
    // O controle mora no menu do usuário, que só o ramo do operador monta.
    expect(fonte('src', 'components', 'layout', 'viewer-header.tsx')).not.toContain('UserMenu')
  })

  it('mantém as 24 horas e o efeito imediato da revogação', () => {
    cita(
      'acesso-e-sessoes',
      'expiram em 24 horas',
      'próximo carregamento de tela',
      'Sua sessão expirou, entre novamente.',
      'Muitas tentativas. Aguarde um instante e tente de novo.',
    )
  })

  it('mantém a regra do que é congelado', () => {
    cita('acesso-e-sessoes', 'guardam o texto da época')
  })
})

// ---------------------------------------------------------------------------
// mapa-das-telas
// ---------------------------------------------------------------------------

describe('mapa-das-telas', () => {
  it('a tabela do menu cobre exatamente os itens do menu lateral real, na ordem', () => {
    const tabela = blocos('mapa-das-telas', 'tabela').find((b) => b.colunas[0] === 'Tela')
    expect(tabela, 'a tabela do menu sumiu').toBeDefined()
    expect(tabela!.linhas.map((l) => l[0])).toEqual(
      rotulosDe('src/components/layout/sidebar-nav.tsx', 'ITENS'),
    )
  })

  it('os tiles do painel inicial batem com os rótulos reais, na ordem da tela', () => {
    const tabela = blocos('mapa-das-telas', 'tabela').find((b) => b.colunas[0] === 'Tile')
    expect(tabela, 'a tabela dos tiles sumiu').toBeDefined()
    expect(tabela!.linhas.map((l) => l[0])).toEqual(
      rotulosDe('src/components/relatorios/kpi-tiles.tsx', 'TILES'),
    )
  })

  it('os nomes de status da tabela dos tiles vêm de STATUS_META', () => {
    const src = fonte('src', 'lib', 'ajuda', 'conteudo', 'mapa-das-telas.ts')
    expect(src).toContain('STATUS_META')
    for (const chave of ['em_uso', 'em_estoque', 'reservado', 'em_triagem', 'em_manutencao', 'defasado'] as const) {
      cita('mapa-das-telas', STATUS_META[chave].rotulo)
    }
    // O tile "Reserva técnica" é o único cujo rótulo NÃO é o do estado: se
    // alguém digitar "Defasado" à mão aqui, a doc para de acompanhar dominio.ts.
    expect(src, 'o nome do estado foi digitado à mão').not.toContain(
      `'${STATUS_META.defasado.rotulo}'`,
    )
    expect(src).toContain('STATUS_META.defasado.rotulo')
  })

  it('descreve os cards do painel inicial, inclusive a falha de leitura', () => {
    cita(
      'mapa-das-telas',
      'Itens para repor',
      'ver em Itens',
      'Últimas movimentações',
      'ver todas',
      'Não foi possível ler as pendências.',
      'Nova movimentação',
      'Novo equipamento',
    )
  })

  it('diz o alcance REAL do "?" e não promete todas as telas (CAP-48)', () => {
    cita(
      'mapa-das-telas',
      'Devolução ao fornecedor',
      'Relatórios gerados',
      'cabeçalho de Administração, que vale para as sete abas',
      'só aparece para quem entrou como operador',
    )
    const t = texto('mapa-das-telas')
    for (const promessa of ['ao lado do título de cada tela', 'em todas as telas']) {
      expect(t, `promessa exagerada: "${promessa}"`).not.toContain(normalizarBusca(promessa))
    }
  })

  it('as telas que a página diz NÃO ter "?" realmente não têm', () => {
    for (const arquivo of [
      'src/app/(app)/relatorios/gerados/[id]/page.tsx',
      'src/app/(app)/relatorios/acesso/page.tsx',
    ]) {
      expect(fonte(...arquivo.split('/')), `${arquivo} ganhou um "?"`).not.toContain(
        '<LinkAjuda',
      )
    }
    // …e o painel inicial, que a página descreve, aponta para cá.
    expect(fonte('src', 'app', '(app)', 'page.tsx')).toContain(
      '<LinkAjuda pagina="mapa-das-telas"',
    )
  })

  it('documenta a própria documentação: as quatro categorias, a busca e o manual (CAP-08)', () => {
    for (const c of CATEGORIAS) cita('mapa-das-telas', c.rotulo)
    cita(
      'mapa-das-telas',
      'Buscar na documentação',
      'Nenhum resultado para a busca.',
      'Nesta página',
      'Manual completo (para imprimir)',
      'grupo "Ajuda"',
      'Endereços antigos continuam valendo',
    )
  })

  it('mantém a âncora `teclado` e o guia de busca global exigido pelo manual antigo', () => {
    expect(ancorasDaPagina(pagina('mapa-das-telas')).map((a) => a.id)).toContain('teclado')
    expect(blocos('mapa-das-telas', 'passos').map((b) => b.titulo)).toContain(
      'Achar qualquer coisa pelo teclado (busca global e atalhos)',
    )
    cita(
      'mapa-das-telas',
      'Ctrl+K',
      'A barra "/" também abre',
      'N abre uma nova movimentação',
      '? abre esta ajuda',
      'enquanto você digita num campo',
    )
  })

  it('descreve o modo escuro com os três rótulos reais e o padrão claro (CAP-93)', () => {
    const guia = blocos('mapa-das-telas', 'passos').find(
      (b) => b.titulo === 'Trocar o tema da interface',
    )
    expect(guia, 'o guia do tema sumiu').toBeDefined()
    const t = normalizarBusca(guia!.itens.join(' '))
    for (const rotulo of ['Tema', 'Claro', 'Escuro', 'Sistema', 'Abrir menu do usuário']) {
      expect(t, `o guia do tema não cita "${rotulo}"`).toContain(normalizarBusca(rotulo))
    }
    cita('mapa-das-telas', 'é o padrão do sistema', 'gravada NAQUELE navegador')
    // A afirmação "o padrão é claro" só vale enquanto o provider disser isso.
    expect(fonte('src', 'components', 'layout', 'theme-provider.tsx')).toContain(
      'defaultTheme="light"',
    )
    // …e as três opções são as do menu do usuário, não uma invenção da doc.
    const menu = fonte('src', 'components', 'layout', 'user-menu.tsx')
    for (const rotulo of ['Claro', 'Escuro', 'Sistema']) {
      expect(menu, `"${rotulo}" não existe mais no menu do usuário`).toContain(
        `rotulo: '${rotulo}'`,
      )
    }
  })

  it('descreve o carregamento e a tela de erro com o texto real (CAP-01)', () => {
    cita(
      'mapa-das-telas',
      'barra fina amarela',
      'esqueleto cinza',
      'Algo deu errado nesta tela',
      'Tentar de novo',
      'Ir para o início',
    )
    const erro = fonte('src', 'app', '(app)', 'error.tsx')
    for (const frase of ['Algo deu errado nesta tela', 'Tentar de novo', 'Ir para o início']) {
      expect(erro, `"${frase}" mudou na tela de erro`).toContain(frase)
    }
  })

  it('fala de teclado, leitor de tela e celular em voz de operador (CAP-53 · 102 · 64)', () => {
    cita(
      'mapa-das-telas',
      'operar tudo sem mouse',
      'anel visível',
      'o foco começa no "Cancelar"',
      'A cor nunca é o único sinal',
      'No celular nada rola para o lado',
      'reduzir animações',
    )
  })
})

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  CATEGORIAS,
  PAGINAS,
  SLUGS_RESERVADOS,
  ancorasDaPagina,
  paginaPorSlug,
  paginasDaCategoria,
  vizinhas,
} from '@/lib/ajuda/registry'
import { normalizarBusca } from '@/lib/ajuda/busca'
import type { Bloco } from '@/lib/ajuda/tipos'

const RAIZ = process.cwd()

function arquivos(dir: string, filtro: (f: string) => boolean): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho, filtro))
    else if (filtro(nome)) achados.push(caminho)
  }
  return achados
}

function todosOsBlocos(): Bloco[] {
  return PAGINAS.flatMap((p) => p.blocos)
}

// ---------------------------------------------------------------------------
// Slugs — sao ENDERECO. Instaveis, quebram favorito e link colado em chamado.
// ---------------------------------------------------------------------------

describe('slugs', () => {
  it('são únicos', () => {
    const slugs = PAGINAS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('são minúsculos, sem acento e sem espaço (padrão do repositório)', () => {
    for (const p of PAGINAS) {
      expect(p.slug).toBe(normalizarBusca(p.slug))
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('não colidem com as rotas próprias do motor', () => {
    // /ajuda/manual é rota estática: uma página com esse slug seria inalcançável.
    for (const p of PAGINAS) expect(SLUGS_RESERVADOS).not.toContain(p.slug)
  })

  it('toda página tem título e resumo de uma linha', () => {
    for (const p of PAGINAS) {
      expect(p.titulo.length).toBeGreaterThan(0)
      expect(p.resumo.length).toBeGreaterThan(0)
      expect(p.resumo).not.toContain('\n')
    }
  })
})

describe('categorias', () => {
  it('toda página cai numa categoria declarada', () => {
    const chaves = CATEGORIAS.map((c) => c.chave)
    for (const p of PAGINAS) expect(chaves).toContain(p.categoria)
  })

  it('nenhuma categoria fica vazia (o índice não mostra seção sem conteúdo)', () => {
    for (const c of CATEGORIAS) {
      expect(paginasDaCategoria(c.chave).length).toBeGreaterThan(0)
    }
  })

  it('anterior/próxima andam dentro da categoria e fecham nas pontas', () => {
    for (const c of CATEGORIAS) {
      const irmas = paginasDaCategoria(c.chave)
      expect(vizinhas(irmas[0].slug).anterior).toBeNull()
      expect(vizinhas(irmas[irmas.length - 1].slug).proxima).toBeNull()
      if (irmas.length > 1) {
        expect(vizinhas(irmas[0].slug).proxima?.slug).toBe(irmas[1].slug)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Ancoras internas e referencias cruzadas — link morto nunca chega a producao.
// ---------------------------------------------------------------------------

describe('âncoras internas', () => {
  it('são únicas dentro da página', () => {
    for (const p of PAGINAS) {
      const ids = ancorasDaPagina(p).map((a) => a.id)
      expect(new Set(ids).size, `âncoras repetidas em ${p.slug}`).toBe(ids.length)
    }
  })

  it('são únicas no documento inteiro (o manual completo agrega todas)', () => {
    const ids = PAGINAS.flatMap((p) => ancorasDaPagina(p).map((a) => a.id))
    expect(new Set(ids).size, `âncora repetida entre páginas: ${ids.join(', ')}`).toBe(
      ids.length,
    )
  })
})

describe('referências cruzadas (blocos `links`)', () => {
  it('todo slug citado existe', () => {
    for (const p of PAGINAS) {
      for (const b of p.blocos) {
        if (b.tipo !== 'links') continue
        for (const r of b.itens) {
          expect(paginaPorSlug(r.slug), `${p.slug} aponta para ${r.slug}`).toBeDefined()
        }
      }
    }
  })

  it('toda âncora citada existe na página de destino', () => {
    for (const p of PAGINAS) {
      for (const b of p.blocos) {
        if (b.tipo !== 'links') continue
        for (const r of b.itens) {
          if (!r.ancora) continue
          const destino = paginaPorSlug(r.slug)!
          const ids = ancorasDaPagina(destino).map((a) => a.id)
          expect(ids, `${p.slug} -> ${r.slug}#${r.ancora}`).toContain(r.ancora)
        }
      }
    }
  })

  it('nenhuma página aponta para si mesma', () => {
    for (const p of PAGINAS) {
      for (const b of p.blocos) {
        if (b.tipo !== 'links') continue
        for (const r of b.itens) expect(r.slug).not.toBe(p.slug)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Matriz de cobertura rota x pagina (docs/PLANO-AJUDA.md §3). A tabela vive AQUI
// para que uma rota nova sem documentacao quebre o build de testes.
// ---------------------------------------------------------------------------

const COBERTURA: Record<string, { pagina: string } | { isento: string }> = {
  '/': { pagina: 'mapa-das-telas' },
  '/ativos': { pagina: 'lista-de-ativos' },
  '/ativos/[id]': { pagina: 'ficha-do-ativo' },
  '/ativos/novo': { pagina: 'cadastrar-compra' },
  '/movimentacoes': { pagina: 'lista-de-movimentacoes' },
  '/movimentacoes/nova': { pagina: 'registrar-movimentacao' },
  '/movimentacoes/devolucao-fornecedor': { pagina: 'manutencao' },
  '/itens': { pagina: 'itens-por-quantidade' },
  '/pendencias': { pagina: 'resolver-pendencias' },
  '/relatorios/[filial]': { pagina: 'relatorio-ao-vivo' },
  '/relatorios/gerados': { pagina: 'relatorios-gerados' },
  '/relatorios/gerados/[id]': { pagina: 'relatorios-gerados' },
  '/admin/usuarios': { pagina: 'usuarios-e-senhas' },
  '/admin/senhas': { pagina: 'usuarios-e-senhas' },
  '/admin/filiais': { pagina: 'administracao' },
  '/admin/motivos': { pagina: 'administracao' },
  '/admin/kits': { pagina: 'kits-de-movimentacao' },
  '/admin/itens': { pagina: 'administracao' },
  '/admin/importar': { pagina: 'import-de-startup' },
  // Isenções — cada uma com o motivo, para ninguém "isentar por preguiça".
  '/dev': {
    isento:
      'é a área técnica de manutenção, exclusiva do cargo Desenvolvedor (diagnóstico do que está no ar, checagens de integridade do banco, trilha completa de auditoria e limpeza de cache) — a documentação do sistema é escrita para o OPERADOR, e nada nesta tela pertence ao dia a dia dele',
  },
  '/ajuda': { isento: 'é o índice da própria documentação — documentar-se a si mesma seria circular' },
  '/ajuda/[slug]': { isento: 'é a rota que RENDERIZA cada página do registry; a cobertura dela é o registry inteiro' },
  '/ajuda/manual': { isento: 'é a mesma documentação agregada numa página só, para leitura corrida e impressão' },
  '/relatorios/acesso': {
    isento: 'porta pública do visualizador por senha — quem chega aqui não é operador e não tem acesso à documentação',
  },
}

function rotasDoApp(): string[] {
  const base = join(RAIZ, 'src', 'app', '(app)')
  return arquivos(base, (f) => f === 'page.tsx')
    .map((caminho) => relative(base, caminho).split(sep).slice(0, -1).join('/'))
    .map((r) => `/${r}`)
    .map((r) => (r === '/' ? '/' : r.replace(/\/$/, '')))
    .sort()
}

describe('matriz de cobertura (rota × página)', () => {
  it('toda rota do grupo (app) está na matriz', () => {
    for (const rota of rotasDoApp()) {
      expect(COBERTURA[rota], `rota sem linha na matriz: ${rota}`).toBeDefined()
    }
  })

  it('a matriz não cita rota que não existe mais', () => {
    const reais = new Set(rotasDoApp())
    for (const rota of Object.keys(COBERTURA)) {
      expect(reais.has(rota), `matriz cita rota inexistente: ${rota}`).toBe(true)
    }
  })

  it('toda página citada na matriz existe no registry', () => {
    for (const [rota, alvo] of Object.entries(COBERTURA)) {
      if (!('pagina' in alvo)) continue
      expect(paginaPorSlug(alvo.pagina), `${rota} -> ${alvo.pagina}`).toBeDefined()
    }
  })

  it('toda isenção traz um motivo escrito', () => {
    for (const alvo of Object.values(COBERTURA)) {
      if ('isento' in alvo) expect(alvo.isento.length).toBeGreaterThan(20)
    }
  })

  // Achado da revisão adversarial da F20: até aqui a matriz só provava que o
  // SLUG existia — não que a tela levasse até ele. Três rotas de admin estavam
  // fora do que o gabarito prometia e nenhum teste acusou.
  //
  // O que este teste faz, com honestidade: lê a FONTE da tela (a `page.tsx` e os
  // `layout.tsx` do caminho) e exige que o `<LinkAjuda>` declarado na matriz
  // esteja escrito ali. Ele NÃO renderiza a árvore — logo não distingue um `?`
  // sob condição verdadeira de um sob condição falsa. Para a guarda de operador
  // dos relatórios, quem cobra a condição é `conteudo/comecar.test.ts`, que casa
  // o `{ehOperador && (` / `{acesso.modo === 'operador' && (` imediatamente antes.
  const SEM_LINK_PROPRIO: Record<string, string> = {
    '/relatorios/gerados/[id]':
      'rota compartilhada com o visualizador por senha — um "?" o levaria para /login',
  }

  function slugsRenderizadosEm(rota: string): string[] {
    const base = join(RAIZ, 'src', 'app', '(app)')
    const segmentos = rota === '/' ? [] : rota.slice(1).split('/')
    const slugs: string[] = []
    // A própria página e todos os layouts do caminho (o "?" de /admin/* mora no
    // layout compartilhado, e vale para as abas que não têm um próprio).
    for (let i = 0; i <= segmentos.length; i += 1) {
      const dir = join(base, ...segmentos.slice(0, i))
      for (const nome of i === segmentos.length ? ['layout.tsx', 'page.tsx'] : ['layout.tsx']) {
        const caminho = join(dir, nome)
        let fonte: string
        try {
          fonte = readFileSync(caminho, 'utf8')
        } catch {
          continue
        }
        for (const m of fonte.matchAll(/<LinkAjuda[^>]*\bpagina="([^"]+)"/g)) slugs.push(m[1])
      }
    }
    return slugs
  }

  it('a tela leva ao "?" declarado na matriz', () => {
    for (const [rota, alvo] of Object.entries(COBERTURA)) {
      if (!('pagina' in alvo)) continue
      if (SEM_LINK_PROPRIO[rota]) continue
      const renderizados = slugsRenderizadosEm(rota)
      expect(
        renderizados,
        `${rota} deveria ter um "?" para ${alvo.pagina}; renderiza ${JSON.stringify(renderizados)}`,
      ).toContain(alvo.pagina)
    }
  })

  it('toda rota sem "?" próprio tem o motivo escrito', () => {
    for (const [rota, motivo] of Object.entries(SEM_LINK_PROPRIO)) {
      expect(COBERTURA[rota], `${rota} não está na matriz`).toBeDefined()
      expect(motivo.length).toBeGreaterThan(20)
      expect(slugsRenderizadosEm(rota)).toHaveLength(0)
    }
  })
})

// ---------------------------------------------------------------------------
// LinkAjuda — o "?" das telas. Alvo inexistente viraria 404 para o operador.
// ---------------------------------------------------------------------------

describe('LinkAjuda nas telas', () => {
  function usosNoApp(): { arquivo: string; pagina: string }[] {
    const fontes = [join(RAIZ, 'src', 'app'), join(RAIZ, 'src', 'components')]
    const usos: { arquivo: string; pagina: string }[] = []
    for (const raiz of fontes) {
      for (const caminho of arquivos(raiz, (f) => f.endsWith('.tsx'))) {
        const conteudo = readFileSync(caminho, 'utf8')
        for (const m of conteudo.matchAll(/<LinkAjuda[^>]*\bpagina="([^"]+)"/g)) {
          usos.push({ arquivo: relative(RAIZ, caminho), pagina: m[1] })
        }
      }
    }
    return usos
  }

  it('todo alvo usado no app existe no registry', () => {
    const usos = usosNoApp()
    expect(usos.length).toBeGreaterThan(0)
    for (const u of usos) {
      expect(paginaPorSlug(u.pagina), `${u.arquivo} aponta para ${u.pagina}`).toBeDefined()
    }
  })

  it('nenhuma tela ficou com a prop `ancora` da ajuda de página única (F6B→F19)', () => {
    const fontes = [join(RAIZ, 'src', 'app'), join(RAIZ, 'src', 'components')]
    for (const raiz of fontes) {
      for (const caminho of arquivos(raiz, (f) => f.endsWith('.tsx'))) {
        const conteudo = readFileSync(caminho, 'utf8')
        expect(
          /<LinkAjuda[^>]*\bancora="/.test(conteudo),
          `${relative(RAIZ, caminho)} ainda usa <LinkAjuda ancora=…>`,
        ).toBe(false)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Linguagem — voz de manual de operacao, exemplos ficticios, zero promessa.
// ---------------------------------------------------------------------------

describe('linguagem da documentação', () => {
  function textoCru(): string {
    return JSON.stringify(PAGINAS)
  }

  it('não vaza jargão de desenvolvedor para o operador', () => {
    const proibidos = [
      'Server Action',
      'Server Component',
      'RLS',
      'row-level security',
      'migration',
      'trigger do banco',
      'endpoint',
      'payload',
      'jsonb',
      'PostgREST',
      'Supabase',
    ]
    const texto = textoCru()
    for (const termo of proibidos) {
      expect(texto.includes(termo), `jargão de dev na documentação: "${termo}"`).toBe(false)
    }
  })

  it('não promete futuro (a documentação descreve o que o sistema FAZ hoje)', () => {
    const texto = normalizarBusca(textoCru())
    for (const termo of ['em breve', 'ainda nao e possivel', 'por enquanto', 'esta previsto', 'sera implementado', 'proxima fase']) {
      expect(texto.includes(termo), `promessa de futuro: "${termo}"`).toBe(false)
    }
  })

  // F21: o modelo de "nível único" (todo logado podia tudo, sem cargos) foi
  // REVOGADO pela spec §3.1 e pela ADR-002. As três frases abaixo ficaram
  // espalhadas por quatro páginas até esta fase; uma delas voltar, em qualquer
  // página, é a documentação prometendo um sistema que não existe mais.
  it('não ressuscita o modelo de acesso revogado (nível único, sem papéis)', () => {
    const texto = normalizarBusca(textoCru())
    for (const revogada of ['nivel unico', 'nao ha papeis', 'mesmo nivel de acesso']) {
      expect(texto.includes(revogada), `afirmação revogada pela F21: "${revogada}"`).toBe(false)
    }
  })

  it('todo patrimônio de exemplo é fictício', () => {
    for (const m of normalizarBusca(textoCru()).matchAll(/wap\d{7}/g)) {
      expect(['wap0001234', 'wap0004491']).toContain(m[0])
    }
  })

  it('nenhum bloco de passos fica sem título (o título é o que a busca acha)', () => {
    for (const b of todosOsBlocos()) {
      if (b.tipo === 'passos') expect(b.titulo?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('toda tabela tem linhas do tamanho do cabeçalho', () => {
    for (const b of todosOsBlocos()) {
      if (b.tipo !== 'tabela') continue
      for (const linha of b.linhas) expect(linha).toHaveLength(b.colunas.length)
    }
  })

  it('todo sintoma traz causa e ao menos uma saída', () => {
    for (const b of todosOsBlocos()) {
      if (b.tipo !== 'sintomas') continue
      for (const s of b.itens) {
        expect(s.causa.length).toBeGreaterThan(0)
        expect(s.saida.length).toBeGreaterThan(0)
      }
    }
  })
})

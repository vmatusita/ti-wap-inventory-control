import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAVE_RELATORIO_VISITADO,
  assinarRelatorioVisitado,
  ehSlugDeRelatorio,
  hrefDoRelatorioVisitado,
  lembrarRelatorioVisitado,
  lerHrefAoVivo,
} from './relatorio-visitado'

// F32/RV-17. As funções PURAS (`ehSlugDeRelatorio`, `hrefDoRelatorioVisitado`)
// são o grosso da cobertura por não tocarem storage nenhum; as de I/O são
// exercitadas contra um `sessionStorage` de verdade (`beforeEach`/`afterEach`
// limpam a chave para as duplas não vazarem estado entre `it`s), e a AUSÊNCIA de
// storage é simulada só onde o roteiro pede — via `vi.stubGlobal`, desfeito no
// `afterEach`.
//
// ⚠ POR QUE ESTE ARQUIVO TRAZ A PRÓPRIA DUBLÊ (regressão medida, não teoria).
//
// A versão original deste comentário afirmava que "este repo roda em Node 26,
// que expõe `sessionStorage` como global REAL" e usava o global ambiente direto.
// Isso era verdade na máquina de quem escreveu — e FALSO no CI, que então fixava
// `node-version: 20`: a Web Storage API só passou a existir como global sem flag
// no Node 24. Resultado: o arquivo nasceu verde localmente e vermelho no CI, com
// `ReferenceError: sessionStorage is not defined` estourando no `beforeEach` e
// derrubando os 21 testes ANTES de qualquer expectativa rodar. Ficou assim por
// dois pushes.
//
// O CI subiu para o Node 24 depois disso (.github/workflows/ci.yml), então hoje
// os dois lados TÊM Web Storage e a dublê abaixo nem chega a ser instalada lá.
// Ela FICA mesmo assim, e de propósito: era exatamente uma suposição sobre "qual
// Node roda isto" que quebrou este arquivo, e trocar o número do runner não
// desfaz a suposição — só a torna verdadeira por enquanto. Com a dublê, o teste
// prova o mesmo comportamento em qualquer runtime, inclusive num runner futuro
// mais antigo ou num ambiente sem Web Storage.
//
// A correção é tornar o arquivo HERMÉTICO em vez de depender do runtime: se o
// ambiente não traz Web Storage, ele instala uma dublê em memória. Não é fingir
// que passa — as operações que estes testes usam têm a mesma semântica da Web
// Storage, inclusive a coerção do valor para string, que é o que garante que
// `hrefDoRelatorioVisitado` receba string na leitura. Onde o runtime já traz a
// de verdade (Node 24+, e o navegador, que é onde este módulo roda em produção),
// a dublê não entra e nada muda.
//
// Para reproduzir o ambiente do CI aqui, sem instalar outro Node:
//   NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/components/relatorios/relatorio-visitado.test.ts
function storageEmMemoria(): Storage {
  const mapa = new Map<string, string>()
  return {
    get length() {
      return mapa.size
    },
    clear: () => mapa.clear(),
    getItem: (chave: string) => mapa.get(String(chave)) ?? null,
    key: (indice: number) => [...mapa.keys()][indice] ?? null,
    removeItem: (chave: string) => {
      mapa.delete(String(chave))
    },
    setItem: (chave: string, valor: string) => {
      mapa.set(String(chave), String(valor))
    },
  } as Storage
}

// No topo do módulo de propósito: os hooks `beforeEach`/`afterEach` abaixo já
// usam `sessionStorage`, então a dublê precisa existir antes de qualquer um
// deles rodar. `configurable`/`writable` porque `vi.stubGlobal` precisa poder
// sobrescrever (e restaurar) esta propriedade no bloco de degradação.
if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: storageEmMemoria(),
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  sessionStorage.removeItem(CHAVE_RELATORIO_VISITADO)
})

afterEach(() => {
  // A ORDEM importa: `vi.unstubAllGlobals()` primeiro — um teste do bloco de
  // degradação deixa `sessionStorage` stubado como `undefined`, e chamar
  // `removeItem` antes de desfazer o stub lançaria aqui no afterEach.
  vi.unstubAllGlobals()
  sessionStorage.removeItem(CHAVE_RELATORIO_VISITADO)
})

describe('ehSlugDeRelatorio', () => {
  it('aceita slugs reais de filial e o consolidado', () => {
    expect(ehSlugDeRelatorio('matriz')).toBe(true)
    expect(ehSlugDeRelatorio('cd-afonso-pena')).toBe(true)
    expect(ehSlugDeRelatorio('linhares')).toBe(true)
    expect(ehSlugDeRelatorio('eusebio')).toBe(true)
    expect(ehSlugDeRelatorio('serra')).toBe(true)
    expect(ehSlugDeRelatorio('geral')).toBe(true)
  })

  // 'gerados' é o arquivo de snapshots, não uma filial — se colasse aqui o botão
  // "Ao vivo" apontaria para a rota errada.
  it("recusa 'gerados' (não é slug de filial — é o arquivo)", () => {
    expect(ehSlugDeRelatorio('gerados')).toBe(false)
  })

  // 'acesso' é a tela PÚBLICA de senha, anterior à sessão de visualização —
  // mandar o gestor logado para lá seria pior que o fallback.
  it("recusa 'acesso' (tela pública de senha, não uma filial)", () => {
    expect(ehSlugDeRelatorio('acesso')).toBe(false)
  })

  it('recusa formato fora do charset (ponto, barra, dois-pontos, %, maiúscula, espaço)', () => {
    expect(ehSlugDeRelatorio('cd.afonso')).toBe(false)
    expect(ehSlugDeRelatorio('cd/afonso')).toBe(false)
    expect(ehSlugDeRelatorio('cd:afonso')).toBe(false)
    expect(ehSlugDeRelatorio('cd%2fafonso')).toBe(false)
    expect(ehSlugDeRelatorio('Matriz')).toBe(false)
    expect(ehSlugDeRelatorio('cd afonso')).toBe(false)
  })

  it('recusa hífen nas pontas ou dobrado', () => {
    expect(ehSlugDeRelatorio('-matriz')).toBe(false)
    expect(ehSlugDeRelatorio('matriz-')).toBe(false)
    expect(ehSlugDeRelatorio('cd--afonso')).toBe(false)
  })

  it('recusa vazio e string maior que o teto', () => {
    expect(ehSlugDeRelatorio('')).toBe(false)
    expect(ehSlugDeRelatorio('a'.repeat(41))).toBe(false)
    expect(ehSlugDeRelatorio('a'.repeat(40))).toBe(true)
  })

  it('recusa tipo que não é string', () => {
    expect(ehSlugDeRelatorio(123)).toBe(false)
    expect(ehSlugDeRelatorio(null)).toBe(false)
    expect(ehSlugDeRelatorio(undefined)).toBe(false)
    expect(ehSlugDeRelatorio({ slug: 'matriz' })).toBe(false)
    expect(ehSlugDeRelatorio(['matriz'])).toBe(false)
  })
})

describe('hrefDoRelatorioVisitado — a função que fecha o buraco de segurança', () => {
  it('monta /relatorios/<slug> para slug válido', () => {
    expect(hrefDoRelatorioVisitado('matriz')).toBe('/relatorios/matriz')
    expect(hrefDoRelatorioVisitado('cd-afonso-pena')).toBe('/relatorios/cd-afonso-pena')
    expect(hrefDoRelatorioVisitado('geral')).toBe('/relatorios/geral')
  })

  // Entradas hostis do roteiro da ordem — por construção, NUNCA sai de /relatorios/.
  it('cai no fallback /relatorios/geral para toda entrada hostil', () => {
    const hostis: unknown[] = [
      '../admin',
      '//evil.com',
      'https://evil.com',
      'geral?x=1',
      'geral#x',
      'geral/../../admin',
      'gerados',
      'acesso',
      123,
      null,
      undefined,
      {},
      [],
      'a'.repeat(500),
    ]
    for (const h of hostis) {
      const href = hrefDoRelatorioVisitado(h)
      expect(href, `entrada hostil ${JSON.stringify(h)}`).toBe('/relatorios/geral')
      expect(href.startsWith('/relatorios/')).toBe(true)
      expect(href.includes('//', 1)).toBe(false)
      expect(href).not.toMatch(/[:?#%]/)
    }
  })
})

// "storage real" = a Web Storage do runtime quando ela existe, ou a dublê em
// memória do topo deste arquivo quando não — o mesmo contrato nos dois casos.
// NÃO diga "do Node 26" aqui: foi essa suposição de runtime que quebrou o CI.
describe('I/O (lembrarRelatorioVisitado / lerHrefAoVivo) — contra storage real', () => {
  it('sem memória gravada, lê o fallback', () => {
    expect(lerHrefAoVivo()).toBe('/relatorios/geral')
  })

  it('grava e lê de volta — o caminho feliz', () => {
    lembrarRelatorioVisitado('matriz')
    expect(sessionStorage.getItem(CHAVE_RELATORIO_VISITADO)).toBe('matriz')
    expect(lerHrefAoVivo()).toBe('/relatorios/matriz')
  })

  it('a escrita mais recente substitui a anterior (é "o ÚLTIMO relatório visitado")', () => {
    lembrarRelatorioVisitado('matriz')
    lembrarRelatorioVisitado('linhares')
    expect(lerHrefAoVivo()).toBe('/relatorios/linhares')
  })

  it('slug inválido não escreve — curto-circuita antes do sessionStorage.setItem', () => {
    lembrarRelatorioVisitado('matriz')
    lembrarRelatorioVisitado('../admin')
    // A memória boa anterior sobrevive: a tentativa hostil não a substituiu.
    expect(lerHrefAoVivo()).toBe('/relatorios/matriz')
  })

  it('lê hostil já sentado no storage (editado por fora, ex. devtools) → fallback', () => {
    sessionStorage.setItem(CHAVE_RELATORIO_VISITADO, '../admin')
    expect(lerHrefAoVivo()).toBe('/relatorios/geral')
  })

  it('a chave é a esperada pelo padrão de nome de ativos-recentes.ts', () => {
    expect(CHAVE_RELATORIO_VISITADO).toBe('wap:relatorios:ultimo')
  })

  // O roteiro da ordem pede degradação sem storage (modo privado/quota) — aqui
  // simulada removendo o global, já que o Node 26 o define de verdade.
  describe('degradação quando sessionStorage está ausente (modo privado, ambiente sem storage)', () => {
    beforeEach(() => {
      vi.stubGlobal('sessionStorage', undefined)
    })

    it('lembrarRelatorioVisitado não lança', () => {
      expect(() => lembrarRelatorioVisitado('matriz')).not.toThrow()
    })

    it('lembrarRelatorioVisitado com slug inválido também não lança (curto-circuita antes)', () => {
      expect(() => lembrarRelatorioVisitado('../admin')).not.toThrow()
    })

    it('lerHrefAoVivo não lança e devolve o fallback', () => {
      expect(() => lerHrefAoVivo()).not.toThrow()
      expect(lerHrefAoVivo()).toBe('/relatorios/geral')
    })
  })
})

describe('assinarRelatorioVisitado — o par de useSyncExternalStore (viewer-nav.tsx)', () => {
  it('notifica o ouvinte quando uma escrita válida acontece', () => {
    const aviso = vi.fn()
    const cancelar = assinarRelatorioVisitado(aviso)
    lembrarRelatorioVisitado('serra')
    expect(aviso).toHaveBeenCalledTimes(1)
    cancelar()
  })

  it('NÃO notifica quando a escrita é recusada (slug inválido)', () => {
    const aviso = vi.fn()
    const cancelar = assinarRelatorioVisitado(aviso)
    lembrarRelatorioVisitado('gerados') // reservado — ehSlugDeRelatorio recusa
    expect(aviso).not.toHaveBeenCalled()
    cancelar()
  })

  it('cancelar a assinatura para as notificações', () => {
    const aviso = vi.fn()
    const cancelar = assinarRelatorioVisitado(aviso)
    cancelar()
    lembrarRelatorioVisitado('eusebio')
    expect(aviso).not.toHaveBeenCalled()
  })
})

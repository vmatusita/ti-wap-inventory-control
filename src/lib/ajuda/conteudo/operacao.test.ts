import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect , vi } from 'vitest'

// F49 — um módulo de `@/lib/queries/**` (ou algo que ele alcança) passou a declarar
// `import 'server-only'`, que é a fronteira RSC: ele existe para QUEBRAR o build se um
// Client Component importar a query. No ambiente `node` do Vitest esse import lança
// sempre, então o stub vazio. Não afrouxa nada — quem prova a fronteira é o
// `npm run build` (ver `src/lib/queries/servidor-apenas.test.ts`).
vi.mock('server-only', () => ({}))
import { paginaPorSlug } from '@/lib/ajuda/registry'
import { textoDoBloco } from '@/lib/ajuda/indice'
import { normalizarBusca } from '@/lib/ajuda/busca'
import {
  STATUS_META,
  STATUS_ORDEM,
  TIPO_META,
  CATEGORIA_META,
  type StatusAtivo,
  type TipoMovimentacao,
} from '@/lib/dominio'
import {
  MAX_LOTE_MOVIMENTACAO,
  TIPOS_FORA_DO_LOTE_MANUAL,
} from '@/lib/validators/movimentacao'
import { TIPOS_EXCLUIDOS_DO_KIT } from '@/lib/validators/kit'
import { MANUTENCAO_ALERTA_DIAS } from '@/lib/relatorios/manutencao-alerta'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
import { TERMO_TIPOS, TERMO_ROTULO } from '@/lib/termos/tipos'
import type { Bloco, PaginaAjuda } from '@/lib/ajuda/tipos'

// ---------------------------------------------------------------------------
// COMPLETUDE dos 10 guias de OPERAÇÃO DE ATIVOS (F20 · frente C2).
//
// Este arquivo NÃO repete o que registry.test.ts já trava (slug único, âncora
// única, link cruzado vivo, jargão de dev, promessa de futuro). Ele trava o que
// é específico desta frente: que cada guia continua CITANDO OS RÓTULOS REAIS da
// tela, que a máquina de estados inteira está coberta em prosa, e que os tetos
// entram por CONSTANTE — nunca digitados à mão.
//
// Testes só crescem: se um rótulo mudar na tela, o assert daqui cai junto e
// alguém é obrigado a reescrever o guia no mesmo commit.
// ---------------------------------------------------------------------------

const SLUGS = [
  'registrar-movimentacao',
  'colar-e-bipar-lote',
  'kits-de-movimentacao',
  'entregar-emprestar-reservar',
  'devolucao-e-triagem',
  'manutencao',
  'transferir-defasar-descartar',
  'corrigir-estorno-ajuste',
  'cadastrar-compra',
  'termos-de-responsabilidade',
] as const

const DIR = join(process.cwd(), 'src', 'lib', 'ajuda', 'conteudo')

function pagina(slug: string): PaginaAjuda {
  const p = paginaPorSlug(slug)
  if (!p) throw new Error(`página da frente C2 ausente do registry: ${slug}`)
  return p
}

/** Texto CRU da página (com acento e caixa) — para conferir rótulo literal. */
function texto(slug: string): string {
  const p = pagina(slug)
  return [p.titulo, p.resumo, ...p.blocos.map(textoDoBloco)].join(' ')
}

/** Texto de TODAS as páginas da frente, junto. */
function textoDaFrente(): string {
  return SLUGS.map(texto).join(' ')
}

function fonte(slug: string): string {
  return readFileSync(join(DIR, `${slug}.ts`), 'utf8')
}

/**
 * O que sobra do fonte quando se apaga toda interpolação `${…}`: exatamente o
 * texto que alguém DIGITOU. É sobre isso que a varredura de rótulo roda.
 */
function fonteDigitada(slug: string): string {
  return fonte(slug).replace(/\$\{[^}]*\}/g, '§')
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function blocosDe(slug: string): Bloco[] {
  return pagina(slug).blocos
}

function titulosDePassos(slug: string): string[] {
  return blocosDe(slug)
    .filter((b): b is Extract<Bloco, { tipo: 'passos' }> => b.tipo === 'passos')
    .map((b) => b.titulo ?? '')
}

function tabelaDeErros(slug: string): Extract<Bloco, { tipo: 'tabela' }> | undefined {
  return blocosDe(slug).find(
    (b): b is Extract<Bloco, { tipo: 'tabela' }> =>
      b.tipo === 'tabela' && b.colunas[0] === 'O que aparece na tela',
  )
}

// ---------------------------------------------------------------------------
// 1. Estrutura — a régua do §6 do PLANO-AJUDA, item a item
// ---------------------------------------------------------------------------

describe('os 10 guias de operação existem e seguem a régua', () => {
  it('todos estão no registry, na categoria "fazer"', () => {
    for (const slug of SLUGS) {
      expect(pagina(slug).categoria, slug).toBe('fazer')
    }
  })

  it('todos herdam ao menos uma seção do manual antigo (visão de compatibilidade)', () => {
    for (const slug of SLUGS) {
      expect(pagina(slug).legado?.length ?? 0, slug).toBeGreaterThan(0)
    }
  })

  it('todos abrem com uma frase de quando usar (parágrafo ou nota)', () => {
    for (const slug of SLUGS) {
      const primeiro = blocosDe(slug)[0]
      expect(['paragrafo', 'nota'], slug).toContain(primeiro.tipo)
      expect(textoDoBloco(primeiro).length, slug).toBeGreaterThan(120)
    }
  })

  it('todos têm passo a passo numerado, com título', () => {
    for (const slug of SLUGS) {
      const titulos = titulosDePassos(slug)
      expect(titulos.length, slug).toBeGreaterThan(0)
      for (const t of titulos) expect(t.length, slug).toBeGreaterThan(0)
    }
  })

  it('todos têm a tabela "erros comuns e como sair", com saída para cada erro', () => {
    for (const slug of SLUGS) {
      const t = tabelaDeErros(slug)
      expect(t, `${slug} não tem tabela de erros`).toBeDefined()
      expect(t!.colunas).toEqual(['O que aparece na tela', 'O que fazer'])
      expect(t!.linhas.length, slug).toBeGreaterThanOrEqual(4)
      for (const [msg, saida] of t!.linhas) {
        expect(msg.length, slug).toBeGreaterThan(0)
        expect(saida.length, slug).toBeGreaterThan(20)
      }
    }
  })

  it('todos terminam com o bloco de links relacionados', () => {
    for (const slug of SLUGS) {
      const blocos = blocosDe(slug)
      const ultimo = blocos[blocos.length - 1]
      expect(ultimo.tipo, `${slug} não termina em links`).toBe('links')
      if (ultimo.tipo === 'links') {
        expect(ultimo.itens.length, slug).toBeGreaterThanOrEqual(2)
        for (const r of ultimo.itens) expect(paginaPorSlug(r.slug), `${slug} -> ${r.slug}`).toBeDefined()
      }
    }
  })

  it('todos têm subtítulos com âncora (o sumário da página não fica vazio)', () => {
    for (const slug of SLUGS) {
      const ids = blocosDe(slug)
        .filter((b): b is Extract<Bloco, { tipo: 'titulo' }> => b.tipo === 'titulo')
        .map((b) => b.id)
      expect(ids.length, slug).toBeGreaterThanOrEqual(2)
      expect(new Set(ids).size, slug).toBe(ids.length)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Derivação — teto e vocabulário NUNCA digitados à mão
// ---------------------------------------------------------------------------

describe('derivação (os tetos e os rótulos vêm do código)', () => {
  it('os tetos de lote saem das constantes, não de número digitado', () => {
    const proibidos = [
      'até 30',
      'aceita 30',
      'no máximo 30',
      '30 ativos',
      '30 linhas',
      'máximo 200 unidades',
      'por lote é 200',
    ]
    for (const slug of SLUGS) {
      const src = fonte(slug)
      for (const p of proibidos) {
        expect(src.includes(p), `${slug} digitou o teto "${p}" à mão`).toBe(false)
      }
    }
    // …e o texto RENDERIZADO mostra o número certo (prova a interpolação).
    expect(texto('registrar-movimentacao')).toContain(
      `até ${MAX_LOTE_MOVIMENTACAO} de uma vez`,
    )
    expect(texto('colar-e-bipar-lote')).toContain(`aceita até ${MAX_LOTE_MOVIMENTACAO} ativos`)
    expect(texto('cadastrar-compra')).toContain(`máximo ${MAX_LOTE_COMPRA} unidades`)
  })

  it('a frente cobre em prosa os 16 tipos de movimentação, pelo rótulo real', () => {
    const tudo = textoDaFrente()
    for (const t of Object.keys(TIPO_META) as TipoMovimentacao[]) {
      expect(tudo, `tipo sem prosa na frente: ${t}`).toContain(TIPO_META[t].rotulo)
    }
  })

  it('a frente cobre em prosa os 9 status do ativo, pelo rótulo real', () => {
    const tudo = textoDaFrente()
    for (const s of STATUS_ORDEM as StatusAtivo[]) {
      expect(tudo, `status sem prosa na frente: ${s}`).toContain(STATUS_META[s].rotulo)
    }
  })

  // Os quatro guias reescritos na F20 derivam TUDO de dominio.ts. A versão
  // anterior deste bloco só conferia que a string `from '@/lib/dominio'` existia
  // no arquivo — passava verde com rótulo digitado à mão logo abaixo (era o caso
  // da legenda de transferir-defasar-descartar, com "Devolvido ao fornecedor"
  // cravado na mesma página que interpolava o rótulo três linhas acima). As duas
  // varreduras a seguir leem a PROSA.
  const GUIAS_DERIVADOS = [
    'entregar-emprestar-reservar',
    'manutencao',
    'transferir-defasar-descartar',
    'corrigir-estorno-ajuste',
  ] as const

  const ROTULOS_DE_DOMINIO = [
    ...(STATUS_ORDEM as StatusAtivo[]).map((s) => STATUS_META[s].rotulo),
    ...(Object.keys(TIPO_META) as TipoMovimentacao[]).map((t) => TIPO_META[t].rotulo),
  ]

  it('nenhum rótulo de status/tipo é digitado à mão como rótulo de tela', () => {
    // Convenção da documentação (PLANO-AJUDA §6): rótulo de tela vai entre aspas
    // duplas. Se o texto entre aspas É um rótulo de status ou de tipo, ele tem de
    // vir de STATUS_META/TIPO_META — senão renomear em dominio.ts deixa a página
    // mentindo com o teste verde.
    for (const slug of GUIAS_DERIVADOS) {
      const digitado = fonteDigitada(slug)
      for (const rotulo of ROTULOS_DE_DOMINIO) {
        expect(
          digitado.includes(`"${rotulo}"`),
          `${slug} digitou o rótulo de tela "${rotulo}" à mão — interpole de dominio.ts`,
        ).toBe(false)
      }
    }
  })

  it('nenhum rótulo de status/tipo é digitado à mão na prosa corrida', () => {
    // Fora das aspas também conta ("Saída e Empréstimo exigem um dos dois").
    // Antes de varrer, apagam-se os trechos entre aspas: rótulo de tela COMPOSTO
    // que só começa com um rótulo de domínio ("Reserva técnica", "Em manutenção,
    // caso a caso") tem outra fonte e não é assunto deste teste — o bloco acima
    // já cobre o caso em que o rótulo entre aspas é exatamente o de domínio.
    for (const slug of GUIAS_DERIVADOS) {
      const prosa = fonteDigitada(slug).replace(/"[^"]*"/g, '«»')
      for (const rotulo of ROTULOS_DE_DOMINIO) {
        const re = new RegExp(`(?<!\\p{L})${escaparRegex(rotulo)}(?!\\p{L})`, 'u')
        expect(
          re.test(prosa),
          `${slug} escreveu "${rotulo}" à mão na prosa — interpole de dominio.ts`,
        ).toBe(false)
      }
    }
  })

  it('e os quatro guias importam mesmo o vocabulário de dominio.ts', () => {
    for (const slug of GUIAS_DERIVADOS) {
      expect(fonte(slug), slug).toContain("from '@/lib/dominio'")
    }
  })

  it('o glossário de termo continua completo e com descrição própria', () => {
    const bloco = blocosDe('termos-de-responsabilidade').find(
      (b): b is Extract<Bloco, { tipo: 'glossario' }> =>
        b.tipo === 'glossario' && b.badge === 'termo',
    )
    expect(bloco).toBeDefined()
    expect(bloco!.itens).toHaveLength(4)
    for (const v of bloco!.itens) expect(v.descricao.length).toBeGreaterThan(20)
  })

  it('a tabela de modelos de termo cobre os 7 modelos, derivados de termos/tipos', () => {
    const t = blocosDe('termos-de-responsabilidade').find(
      (b): b is Extract<Bloco, { tipo: 'tabela' }> =>
        b.tipo === 'tabela' && b.colunas[0] === 'Modelo',
    )
    expect(t).toBeDefined()
    expect(t!.linhas).toHaveLength(TERMO_TIPOS.length)
    for (const tipo of TERMO_TIPOS) {
      expect(t!.linhas.some((l) => l[0] === TERMO_ROTULO[tipo]), tipo).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. CAP-66 · o chamado do FORNECEDOR ganhou prosa própria
// ---------------------------------------------------------------------------

describe('CAP-66 — chamado do fornecedor', () => {
  const t = () => texto('manutencao')

  it('diz que o campo é obrigatório no envio para manutenção', () => {
    expect(t()).toContain('"Chamado do fornecedor *" é obrigatório')
    expect(t()).toContain('Informe o chamado do fornecedor')
  })

  it('separa o chamado do fornecedor do chamado interno', () => {
    expect(t()).toContain('São dois chamados diferentes')
    expect(t()).toContain('"Chamado (opcional)" é o chamado INTERNO')
    expect(t()).toContain('a ASSISTÊNCIA abriu do lado dela')
  })

  it('diz que é texto livre e o que fazer quando não há número', () => {
    expect(t()).toContain('texto livre')
    expect(t()).toContain('Fornecedor que não dá número?')
    expect(t()).toContain('Chamado do fornecedor: no máximo 200 caracteres')
  })

  it('cita o placeholder real do campo', () => {
    expect(t()).toContain('Chamado aberto pelo fornecedor')
  })
})

// ---------------------------------------------------------------------------
// 4. CAP-70 · onde o chamado do fornecedor reaparece
// ---------------------------------------------------------------------------

describe('CAP-70 — o chamado do fornecedor na linha do tempo e no relatório', () => {
  it('cita os dois lugares onde ele aparece depois de registrado', () => {
    const t = texto('manutencao')
    expect(t).toContain('linha do tempo da ficha')
    expect(t).toContain('Chamado do fornecedor:')
    expect(t).toContain('Em manutenção, caso a caso')
  })

  it('é honesta sobre onde ele NÃO aparece (coluna, filtro, CSV)', () => {
    const t = normalizarBusca(texto('manutencao'))
    expect(t).toContain(normalizarBusca('NÃO tem coluna própria'))
    expect(t).toContain(normalizarBusca('não sai no CSV exportado'))
  })
})

// ---------------------------------------------------------------------------
// 4b. O chip "Manutenção parada" mora no RELATÓRIO, não na página Pendências
// ---------------------------------------------------------------------------

describe('onde o operador acha o alerta de manutenção parada', () => {
  const t = () => texto('manutencao')

  it('manda para a seção Pendências DO RELATÓRIO, e diz que é só do operador', () => {
    expect(t()).toContain('seção "Pendências" DO RELATÓRIO')
    expect(t()).toContain('só para quem entra com login')
  })

  it('avisa explicitamente que o chip NÃO está na página Pendências', () => {
    // `getPendencias` (o que alimenta /pendencias) devolve só quatro buckets;
    // `chipManutencaoParada` é concatenado no snapshot do relatório. Mandar o
    // operador para /pendencias era procurar o que não está lá.
    expect(normalizarBusca(t())).toContain(
      normalizarBusca('NÃO está na página Pendências'),
    )
  })

  it('o limiar de dias vem de MANUTENCAO_ALERTA_DIAS, não digitado', () => {
    expect(t()).toContain(`a partir de ${MANUTENCAO_ALERTA_DIAS} dias parado`)
    expect(t()).toContain(`Manutenção parada (${MANUTENCAO_ALERTA_DIAS}+ dias)`)
    // O rótulo do chip é gerado da mesma constante em manutencao-alerta.ts.
    expect(fonteDigitada('manutencao').includes('30')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 5. CAP-68 · devolução ao fornecedor — guia completo
// ---------------------------------------------------------------------------

describe('CAP-68 — devolver ao fornecedor e cadastrar o substituto', () => {
  const t = () => texto('manutencao')

  it('tem passo a passo próprio', () => {
    expect(titulosDePassos('manutencao')).toContain(
      'Devolver ao fornecedor e cadastrar o substituto',
    )
  })

  it('diz de onde se chega: o botão da ficha, só em manutenção', () => {
    expect(t()).toContain('"Devolver ao fornecedor"')
    expect(t()).toContain('só aparece na barra de ações quando o ativo está')
    expect(t()).toContain(STATUS_META.em_manutencao.rotulo)
  })

  it('diz que é sempre UM ativo (não existe lote)', () => {
    expect(t()).toContain('não existe devolução ao fornecedor em lote')
  })

  it('lista os campos obrigatórios do substituto, com os rótulos da tela', () => {
    for (const rotulo of [
      '"Patrimônio *"',
      '"Service tag *"',
      '"Categoria *"',
      '"Filial *"',
      '"Marca *"',
      '"Modelo *"',
    ]) {
      expect(t(), rotulo).toContain(rotulo)
    }
    expect(t()).toContain('"Registrar devolução"')
  })

  it('cobre o caso "sem substituto"', () => {
    expect(t()).toContain('"Cadastrar o equipamento substituto"')
    expect(t()).toContain('Desmarque se o fornecedor não repôs')
    expect(t()).toContain('Sem substituto (fornecedor não repôs)')
  })

  it('diz o que é herdado do envio (fornecedor e os dois chamados)', () => {
    expect(t()).toContain('"Chamado interno"')
    expect(t()).toContain('Fornecedor e chamados são herdados do envio à manutenção')
  })

  it('é tudo ou nada', () => {
    expect(t()).toContain('É tudo ou nada')
    expect(t()).toContain('Nada foi registrado:')
  })

  it('diz que o substituto entra como Troca, nunca como compra', () => {
    expect(t()).toContain(
      `com uma movimentação de tipo "${TIPO_META.troca.rotulo}" na linha do tempo — nunca "${TIPO_META.compra.rotulo}"`,
    )
    expect(normalizarBusca(t())).toContain(
      normalizarBusca('NENHUMA contagem de compras o inclui'),
    )
  })
})

// ---------------------------------------------------------------------------
// 6. CAP-69 · vínculo de sucessão, com os rótulos exatos da ficha
// ---------------------------------------------------------------------------

describe('CAP-69 — o vínculo de sucessão na ficha', () => {
  const t = () => texto('manutencao')

  it('cita as duas faixas, nos dois sentidos', () => {
    expect(t()).toContain('Substitui WAP0001234 (devolvido ao fornecedor)')
    expect(t()).toContain('Substituído por WAP0004491')
  })

  it('cita a seção do histórico do ativo substituído', () => {
    expect(t()).toContain('Histórico do ativo substituído — WAP0001234')
    expect(t()).toContain('mostradas aqui só para consulta')
  })

  it('deixa claro que as movimentações não são copiadas', () => {
    expect(normalizarBusca(t())).toContain(
      normalizarBusca('As movimentações NÃO são copiadas de um ativo para o outro'),
    )
  })
})

// ---------------------------------------------------------------------------
// 7. Divergência O1 · os três tipos fora do seletor manual
// ---------------------------------------------------------------------------

describe('divergência O1 — tipos com caminho próprio', () => {
  it('o guia de registrar diz que os três tipos não estão no seletor', () => {
    const t = texto('registrar-movimentacao')
    expect(t).toContain(`Os ${['zero','um','dois','três','quatro','cinco'][TIPOS_FORA_DO_LOTE_MANUAL.length]} tipos que NÃO estão no seletor`)
    for (const tipo of TIPOS_FORA_DO_LOTE_MANUAL) {
      expect(t, `tipo fora do lote não citado: ${tipo}`).toContain(TIPO_META[tipo].rotulo)
    }
    expect(t).toContain('não é falha da tela')
  })

  it('cada um dos três aponta para o seu caminho real', () => {
    const t = texto('registrar-movimentacao')
    expect(t).toContain('Novo equipamento')
    expect(t).toContain('"Devolver ao fornecedor"')
    expect(t).toContain('"Estornar"')
  })

  it('a página da compra repete que o substituto não é compra', () => {
    expect(texto('cadastrar-compra')).toContain(
      `esse nasce pela tela de devolução ao fornecedor, como "${TIPO_META.troca.rotulo}"`,
    )
  })
})

// ---------------------------------------------------------------------------
// 8. Entregar / emprestar / reservar — a diferença REAL entre os três
// ---------------------------------------------------------------------------

describe('entregar, emprestar e reservar', () => {
  const t = () => texto('entregar-emprestar-reservar')

  it('a tabela compara os três tipos com estado de origem e de destino', () => {
    const tabela = blocosDe('entregar-emprestar-reservar').find(
      (b): b is Extract<Bloco, { tipo: 'tabela' }> =>
        b.tipo === 'tabela' && b.colunas[0] === 'Tipo',
    )
    expect(tabela).toBeDefined()
    expect(tabela!.linhas).toHaveLength(3)
    const tipos = tabela!.linhas.map((l) => l[0])
    expect(tipos).toEqual([
      TIPO_META.saida.rotulo,
      TIPO_META.emprestimo.rotulo,
      TIPO_META.reserva.rotulo,
    ])
    // Cada linha diz em que estado o ativo fica.
    expect(tabela!.linhas[0][2]).toBe(STATUS_META.em_uso.rotulo)
    expect(tabela!.linhas[1][2]).toBe(STATUS_META.emprestado.rotulo)
    expect(tabela!.linhas[2][2]).toBe(STATUS_META.reservado.rotulo)
  })

  it('diz a regra cruzada: colaborador OU setor', () => {
    expect(t()).toContain('"Colaborador" OU "Setor"')
    expect(t()).toContain('Informe o colaborador ou o setor de destino')
  })

  it('diz que só saída e empréstimo oferecem termo', () => {
    const tabela = blocosDe('entregar-emprestar-reservar').find(
      (b): b is Extract<Bloco, { tipo: 'tabela' }> =>
        b.tipo === 'tabela' && b.colunas[0] === 'Tipo',
    )!
    expect(tabela.linhas[0][4]).toBe('Sim')
    expect(tabela.linhas[1][4]).toBe('Sim')
    expect(tabela.linhas[2][4]).toBe('Não')
  })

  it('explica o que acontece com a reserva depois (vira entrega ou se desfaz)', () => {
    expect(t()).toContain('A reserva não tem um tipo próprio de cancelamento')
    expect(t()).toContain('sem voltar ao estoque')
  })

  it('diz quem é cobrado por termo (e quem não é)', () => {
    expect(normalizarBusca(t())).toContain(normalizarBusca('Pendência de termo'))
    expect(t()).toContain('não é cobrado por termo')
  })
})

// ---------------------------------------------------------------------------
// 9. Transferir / defasar / descartar — e o que NÃO dá para fazer depois
// ---------------------------------------------------------------------------

describe('transferir, marcar defasado e descartar', () => {
  const t = () => texto('transferir-defasar-descartar')

  it('a transferência mantém o status e só muda a filial', () => {
    expect(t()).toContain('no MESMO estado — só a filial muda')
    expect(t()).toContain('"Filial de destino *"')
  })

  it('diz que a transferência aparece no relatório das DUAS filiais', () => {
    expect(t()).toContain('aparece no relatório das DUAS filiais')
    expect(t()).toContain('"De → Para"')
  })

  it('diz que defasado sinaliza sem dar baixa', () => {
    expect(t()).toContain('Reserva técnica')
    expect(normalizarBusca(t())).toContain(normalizarBusca('Isso NÃO é baixa'))
  })

  it('diz que o descarte é terminal', () => {
    expect(t()).toContain('sai do inventário')
    expect(t()).toContain(STATUS_META.descartado.rotulo)
  })

  it('tem a tabela do "o que não dá para fazer depois", com os três tipos', () => {
    const tabela = blocosDe('transferir-defasar-descartar').find(
      (b): b is Extract<Bloco, { tipo: 'tabela' }> =>
        b.tipo === 'tabela' && b.colunas[0] === 'Depois de…',
    )
    expect(tabela).toBeDefined()
    expect(tabela!.linhas.map((l) => l[0])).toEqual([
      TIPO_META.transferencia.rotulo,
      TIPO_META.marcar_defasado.rotulo,
      TIPO_META.descarte.rotulo,
    ])
    for (const linha of tabela!.linhas) expect(linha[2].length).toBeGreaterThan(20)
  })
})

// ---------------------------------------------------------------------------
// 10. Corrigir — estorno × ajuste
// ---------------------------------------------------------------------------

describe('corrigir o que ficou errado', () => {
  const t = () => texto('corrigir-estorno-ajuste')

  it('diz a regra do estorno: só a última movimentação', () => {
    expect(t()).toContain('Só a ÚLTIMA movimentação pode ser estornada')
    expect(t()).toContain('Só a última movimentação do ativo pode ser estornada')
  })

  it('diz que o estorno não apaga nada', () => {
    expect(normalizarBusca(t())).toContain(normalizarBusca('O estorno NÃO apaga nada'))
    expect(t()).toContain('estornada')
    expect(t()).toContain('não altera nenhuma contagem')
  })

  it('descreve o ajuste com os dois campos obrigatórios reais', () => {
    expect(t()).toContain('"Novo status *"')
    expect(t()).toContain('"Observação * (justificativa)"')
    expect(t()).toContain('ao menos 10 caracteres')
  })

  it('diz que o ajuste é a única saída dos dois estados terminais', () => {
    expect(t()).toContain(STATUS_META.descartado.rotulo)
    expect(t()).toContain(STATUS_META.devolvido_fornecedor.rotulo)
  })

  it('manda o dado cadastral para o caminho certo (e diz o que não se edita)', () => {
    expect(t()).toContain('"Editar dados cadastrais"')
    expect(t()).toContain(
      'Status, colaborador e filial mudam apenas por movimentação — não são editáveis aqui',
    )
    expect(t()).toContain('menu ⋯ ("Mais ações")')
  })
})

// ---------------------------------------------------------------------------
// 11. Devolução e triagem
// ---------------------------------------------------------------------------

describe('devolução e triagem', () => {
  const t = () => texto('devolucao-e-triagem')

  it('descreve as duas movimentações do retorno', () => {
    expect(t()).toContain(TIPO_META.devolucao.rotulo)
    expect(t()).toContain(TIPO_META.triagem_ok.rotulo)
    expect(t()).toContain(STATUS_META.em_triagem.rotulo)
  })

  // F38 · D12 — o rótulo do checklist mudou junto com o que ele FAZ: até a F37 era
  // "Itens faltantes na devolução" e marcar significava uma coisa só (faltou);
  // agora é "O que voltou com o equipamento", com dois desfechos, e "Voltou" repõe
  // o estoque. A asserção acompanha o rótulo da tela — é essa a promessa dela.
  it('cita o rótulo real do checklist e os dois desfechos da pendência', () => {
    expect(t()).toContain('"O que voltou com o equipamento"')
    expect(t()).toContain('"Voltou"')
    expect(t()).toContain('"Faltou"')
    expect(t()).toContain('Item recuperado')
    expect(t()).toContain('Baixa — não vai voltar')
  })

  it('cita a pendência de triagem parada com o prazo real', () => {
    expect(t()).toContain('há mais de 7 dias')
    expect(t()).toContain('triagem parada')
  })

  it('diz que o termo de devolução é um por lote', () => {
    expect(t()).toContain('"Gerar termo de devolução ({n})"')
  })
})

// ---------------------------------------------------------------------------
// 12. Colar/bipar, kits, compra e termos — rótulos reais que não podem sumir
// ---------------------------------------------------------------------------

describe('rótulos reais citados nos demais guias', () => {
  it('colar e bipar cita os quatro blocos do resultado da conferência', () => {
    const t = texto('colar-e-bipar-lote')
    for (const rotulo of [
      '"Colar lista"',
      '"Conferir lista"',
      '"Encontrados ({n})"',
      '"Não encontrados"',
      '"Linhas inválidas"',
    ]) {
      expect(t, rotulo).toContain(rotulo)
    }
  })

  it('kits cita os campos do diálogo de Administração › Kits', () => {
    const t = texto('kits-de-movimentacao')
    for (const rotulo of [
      '"Aplicar kit"',
      '"Repetir última"',
      '"Categorias esperadas"',
      '"Observação padrão (opcional)"',
      '"Kit ativo"',
    ]) {
      expect(t, rotulo).toContain(rotulo)
    }
  })

  it('kits nomeia TODOS os tipos que ficam fora do seletor, derivados do validator', () => {
    // São quatro (compra, estorno, devolução ao fornecedor e troca), não dois: a
    // página dizia só "compra e estorno". A lista vem de TIPOS_EXCLUIDOS_DO_KIT.
    const t = texto('kits-de-movimentacao')
    expect(TIPOS_EXCLUIDOS_DO_KIT.length).toBeGreaterThan(2)
    for (const tipo of TIPOS_EXCLUIDOS_DO_KIT) {
      expect(t, `tipo excluído do kit não citado: ${tipo}`).toContain(
        `"${TIPO_META[tipo].rotulo}"`,
      )
    }
    // …nas DUAS passagens que falam da exclusão (o passo e a tabela de campos).
    const ocorrencias = t.split(TIPO_META.devolucao_fornecedor.rotulo).length - 1
    expect(ocorrencias).toBeGreaterThanOrEqual(2)
  })

  it('a compra cita as duas abas e os obrigatórios do modelo', () => {
    const t = texto('cadastrar-compra')
    for (const rotulo of [
      '"Colar lista"',
      '"Faixa"',
      '"Categoria *"',
      '"Filial que recebeu *"',
      '"Marca *"',
      '"Modelo *"',
    ]) {
      expect(t, rotulo).toContain(rotulo)
    }
    expect(t).toContain(STATUS_META.em_estoque.rotulo)
  })

  it('os termos citam os botões reais e as categorias sem modelo', () => {
    const t = texto('termos-de-responsabilidade')
    for (const rotulo of [
      '"Gerar e visualizar"',
      '"Baixar .docx"',
      '"Confirmar assinatura"',
      '"Desfazer"',
      '"Modelo do termo"',
    ]) {
      expect(t, rotulo).toContain(rotulo)
    }
    expect(t).toContain(CATEGORIA_META.tablet.rotulo)
    expect(t).toContain(CATEGORIA_META.outro.rotulo)
    expect(t).toContain('As categorias deste lote não têm modelo de termo.')
  })

  it('a regra "só Assinado encerra" continua escrita, agora com as exceções', () => {
    const t = texto('termos-de-responsabilidade')
    expect(t).toContain('Apenas o status "Assinado" tira o ativo das pendências de termo')
    expect(t).toContain('O sistema não recebe upload do PDF assinado')
    expect(t).toContain('import de startup')
  })
})

// ---------------------------------------------------------------------------
// 13. Guias prometidos existem (link cruzado obrigatório entre os guias)
// ---------------------------------------------------------------------------

describe('os guias prometidos existem', () => {
  const OBRIGATORIOS: [string, string][] = [
    ['registrar-movimentacao', 'colar-e-bipar-lote'],
    ['registrar-movimentacao', 'kits-de-movimentacao'],
    ['registrar-movimentacao', 'entregar-emprestar-reservar'],
    ['entregar-emprestar-reservar', 'devolucao-e-triagem'],
    ['entregar-emprestar-reservar', 'termos-de-responsabilidade'],
    ['devolucao-e-triagem', 'resolver-pendencias'],
    ['manutencao', 'transferir-defasar-descartar'],
    ['transferir-defasar-descartar', 'manutencao'],
    ['cadastrar-compra', 'manutencao'],
    ['corrigir-estorno-ajuste', 'ficha-do-ativo'],
    ['termos-de-responsabilidade', 'resolver-pendencias'],
  ]

  it('cada guia aponta para os guias vizinhos que ele cita', () => {
    for (const [origem, destino] of OBRIGATORIOS) {
      const alvos = blocosDe(origem)
        .filter((b): b is Extract<Bloco, { tipo: 'links' }> => b.tipo === 'links')
        .flatMap((b) => b.itens.map((r) => r.slug))
      expect(alvos, `${origem} deveria linkar ${destino}`).toContain(destino)
      expect(paginaPorSlug(destino), destino).toBeDefined()
    }
  })
})

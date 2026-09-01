import { describe, it, expect } from 'vitest'
import {
  SECOES,
  textoDaSecao,
  filtrarSecoes,
  type Bloco,
  type Secao,
} from '@/lib/ajuda/conteudo'
import { casaBusca, normalizarBusca } from '@/lib/ajuda/busca'
import {
  STATUS_META,
  STATUS_ORDEM,
  TIPO_META,
  TIPO_LANCAMENTO_META,
  TERMO_META,
  GRUPO_ITEM_ORDEM,
} from '@/lib/dominio'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { CAP_EXPORT } from '@/lib/csv'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'

type BlocoGlossario = Extract<Bloco, { tipo: 'glossario' }>
type BlocoMovimentacoes = Extract<Bloco, { tipo: 'movimentacoes' }>

// Helpers de introspeccao: achatam os blocos das secoes para conferir cobertura.
function todosOsBlocos(): Bloco[] {
  return SECOES.flatMap((s) => s.blocos)
}
function secao(id: string): Secao {
  const s = SECOES.find((x) => x.id === id)
  if (!s) throw new Error(`Seção não encontrada: ${id}`)
  return s
}
function glossarioPor(badge: BlocoGlossario['badge']): BlocoGlossario[] {
  return todosOsBlocos().filter(
    (b): b is BlocoGlossario => b.tipo === 'glossario' && b.badge === badge,
  )
}

describe('normalizarBusca', () => {
  it('tira acento e caixa', () => {
    expect(normalizarBusca('Manutenção')).toBe('manutencao')
    expect(normalizarBusca('SAÍDA')).toBe('saida')
    expect(normalizarBusca('  Atrelar ')).toBe('atrelar')
  })

  // A normalização tem de ser IDEMPOTENTE: é o que permite `casaBusca` normalizar
  // os dois lados sem mudar nada para quem já entregava texto normalizado (a
  // busca da /ajuda e a paleta). Se deixar de ser, as duas telas divergem.
  it('é idempotente', () => {
    for (const t of ['Manutenção', 'SAÍDA', '  João  Silva ', 'İstanbul', 'Ação']) {
      expect(normalizarBusca(normalizarBusca(t))).toBe(normalizarBusca(t))
    }
  })
})

// ⚠ REGRESSÃO DE 31/08/2026 — a busca das telas de administração não achava
// ninguém. `casaBusca` normalizava só a CONSULTA e confiava numa frase do JSDoc
// ("`textoIndexado` chega JÁ normalizado") que as cinco tabelas de /admin não
// cumpriam: elas montam o texto da linha com o nome como está no banco. Digitar
// o nome exato da pessoa devolvia zero resultado, e só um fragmento minúsculo e
// sem acento no meio da palavra casava. Agora os DOIS lados são normalizados.
describe('casaBusca com texto cru (o defeito das tabelas de /admin)', () => {
  const linha = 'João Silva 12345 Financeiro Matriz'

  it('acha o nome exato, com acento e maiúscula', () => {
    expect(casaBusca(linha, 'João Silva')).toBe(true)
    expect(casaBusca(linha, 'Joao Silva')).toBe(true)
    expect(casaBusca(linha, 'joão silva')).toBe(true)
  })

  it('acha uma palavra isolada, seja qual for a caixa', () => {
    expect(casaBusca(linha, 'Silva')).toBe(true)
    expect(casaBusca(linha, 'silva')).toBe(true)
    expect(casaBusca(linha, 'Financeiro')).toBe(true)
    expect(casaBusca(linha, 'MATRIZ')).toBe(true)
    expect(casaBusca(linha, '12345')).toBe(true)
  })

  it('continua não achando o que não está lá', () => {
    expect(casaBusca(linha, 'Pereira')).toBe(false)
    expect(casaBusca(linha, 'Serra')).toBe(false)
  })

  it('texto já normalizado atravessa igual (a /ajuda não muda)', () => {
    const indexado = normalizarBusca('Manutenção e Saída')
    expect(casaBusca(indexado, 'manutencao')).toBe(true)
    expect(casaBusca(indexado, 'Manutenção')).toBe(true)
  })

  it('consulta vazia casa com tudo', () => {
    expect(casaBusca(linha, '')).toBe(true)
    expect(casaBusca(linha, '   ')).toBe(true)
  })
})

describe('cobertura do glossario (derivada de dominio.ts)', () => {
  it('cobre os 9 status de ativo, na ordem canônica', () => {
    const bloco = glossarioPor('status')[0]
    expect(bloco).toBeDefined()
    expect(bloco.itens.map((v) => v.chave)).toEqual(STATUS_ORDEM)
    // F14 acrescentou devolvido_fornecedor (baixa terminal) → 9.
    expect(bloco.itens).toHaveLength(9)
  })

  it('cobre os 16 tipos de movimentação', () => {
    const bloco = todosOsBlocos().find(
      (b): b is BlocoMovimentacoes => b.tipo === 'movimentacoes',
    )
    expect(bloco).toBeDefined()
    const chaves = bloco!.itens.map((v) => v.chave).sort()
    expect(chaves).toEqual(Object.keys(TIPO_META).sort())
    // F14 acrescentou devolucao_fornecedor → 14; F15 acrescentou troca → 15;
    // F34 acrescentou envio_triagem (a triagem virou opt-in) → 16.
    expect(bloco!.itens).toHaveLength(16)
  })

  it('cobre os 6 tipos de lançamento de item, com a descrição de dominio.ts', () => {
    const bloco = glossarioPor('tipoLanc')[0]
    expect(bloco).toBeDefined()
    expect(bloco.itens).toHaveLength(6)
    for (const v of bloco.itens) {
      const meta = TIPO_LANCAMENTO_META[v.chave as keyof typeof TIPO_LANCAMENTO_META]
      expect(v.rotulo).toBe(meta.rotulo)
      expect(v.descricao).toBe(meta.descricao)
    }
  })

  it('cobre os 4 status de termo', () => {
    const bloco = glossarioPor('termo')[0]
    expect(bloco).toBeDefined()
    expect(bloco.itens).toHaveLength(4)
    expect(bloco.itens.map((v) => v.chave).sort()).toEqual(Object.keys(TERMO_META).sort())
  })

  it('cobre os grupos de item', () => {
    const grupos = secao('itens').blocos.find(
      (b): b is BlocoGlossario => b.tipo === 'glossario' && b.badge === 'neutro',
    )
    expect(grupos).toBeDefined()
    expect(grupos!.itens.map((v) => v.chave)).toEqual(GRUPO_ITEM_ORDEM)
  })

  it('descreve os quatro buckets de pendência', () => {
    const texto = textoDaSecao(secao('pendencias'))
    for (const termo of ['termo', 'itens faltantes', 'triagem', 'outras']) {
      expect(texto).toContain(normalizarBusca(termo))
    }
  })

  it('os rótulos de status vêm de dominio.ts (não são texto solto)', () => {
    const bloco = glossarioPor('status')[0]
    for (const v of bloco.itens) {
      // se o rótulo divergir de STATUS_META, o StatusBadge renderizaria outro
      // texto — este assert trava a derivação.
      expect(v.rotulo).toBe(STATUS_META[v.chave as keyof typeof STATUS_META].rotulo)
    }
  })
})

describe('honestidade do manual (OS-F9 I5a, revisto pela OS-F12)', () => {
  it('explica Falta pela semântica real da 0027 (déficit, não reposição)', () => {
    const texto = textoDaSecao(secao('itens'))
    // F41 — a FÓRMULA é a mesma; mudaram os NOMES dos números (decisão J1:
    // 'atrelados'→'reservado', 'liberados'→'em uso'). A asserção segue o texto da
    // tela, que é o que ela existe para travar. Ata em docs/DECISOES.md.
    expect(texto).toContain(normalizarBusca('reservado + em uso − total'))
    expect(texto).toContain(normalizarBusca('déficit'))
  })

  it('descreve o catálogo de itens com os campos que existem', () => {
    // A F12 (migration 0042) acrescentou `estoque_minimo` ao catálogo — a lista
    // de campos aqui tem de acompanhar o dialog de Administração › Itens.
    expect(textoDaSecao(secao('admin'))).toContain(
      normalizarBusca('(nome, grupo, ordem, estoque mínimo)'),
    )
  })
})

describe('facilitadores documentados (OS-F9)', () => {
  function titulosDePassos(idSecao: string): string[] {
    return secao(idSecao)
      .blocos.filter((b): b is Extract<Bloco, { tipo: 'passos' }> => b.tipo === 'passos')
      .map((b) => b.titulo ?? '')
  }

  it('tem o passo a passo da bipagem por leitor de código de barras (A7)', () => {
    expect(titulosDePassos('como-fazer')).toContain(
      'Cadastrando com leitor de código de barras',
    )
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('leitor USB'))
    expect(texto).toContain(normalizarBusca('colar lista'))
  })

  it('cita os facilitadores novos nas seções correspondentes', () => {
    const comoFazer = textoDaSecao(secao('como-fazer'))
    // M2 (busca por colaborador) · M10 (chips de data) · A1 (colar do Excel)
    expect(comoFazer).toContain(normalizarBusca('nome do colaborador'))
    expect(comoFazer).toContain(normalizarBusca('"Hoje" e "Ontem"'))
    expect(comoFazer).toContain(normalizarBusca('duas colunas direto do Excel'))
    // I6 (lançar da linha do saldo) · I3 (filtros do histórico)
    expect(comoFazer).toContain(normalizarBusca('lançar da própria linha'))
    expect(comoFazer).toContain(normalizarBusca('por período (De / Até)'))
    // T2 (badge de pendências) · T6 (copiar patrimônio)
    expect(textoDaSecao(secao('pendencias'))).toContain(normalizarBusca('selo âmbar'))
    expect(textoDaSecao(secao('acesso'))).toContain(normalizarBusca('botão de copiar'))
  })

  it('os exemplos continuam fictícios (nenhum dado real)', () => {
    const tudo = SECOES.map(textoDaSecao).join(' ')
    for (const m of tudo.matchAll(/wap\d{7}/g)) {
      expect(['wap0001234', 'wap0004491']).toContain(m[0])
    }
  })
})

describe('operação em massa documentada (OS-F10 · Onda 2)', () => {
  function titulosDePassos(idSecao: string): string[] {
    return secao(idSecao)
      .blocos.filter((b): b is Extract<Bloco, { tipo: 'passos' }> => b.tipo === 'passos')
      .map((b) => b.titulo ?? '')
  }

  it('cita o teto do lote de movimentação pela constante (M11), nunca o antigo 10', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca(`até ${MAX_LOTE_MOVIMENTACAO} de uma vez`))
    // O teto antigo (OS-F2) não pode sobreviver em lugar nenhum do manual.
    const tudo = SECOES.map(textoDaSecao).join(' ')
    expect(tudo).not.toContain(normalizarBusca('lote aceita até 10'))
    expect(tudo).not.toContain(normalizarBusca('até 10 de uma vez'))
  })

  it('os tetos citados vêm das constantes reais (compra, item, export)', () => {
    const comoFazer = textoDaSecao(secao('como-fazer'))
    expect(comoFazer).toContain(normalizarBusca(`máximo ${MAX_LOTE_COMPRA} unidades`))
    expect(comoFazer).toContain(normalizarBusca(`${MAX_LINHAS_LOTE_ITEM} linhas por lançamento`))
    expect(comoFazer).toContain(
      normalizarBusca(`${CAP_EXPORT.toLocaleString('pt-BR')} linhas`),
    )
  })

  it('tem o passo a passo de cada item novo da Onda 2', () => {
    const titulos = titulosDePassos('como-fazer')
    for (const t of [
      // M1 · bipagem
      'Colar a lista de patrimônios no lote (movimentação)',
      // M6
      'Retomar um lote que ficou pela metade (rascunho)',
      // M9
      'Depois de registrar: termos em sequência e o lote que não entra pela metade',
      // A6 (+ A2/A4 ficam no passo da compra)
      'Comprar outro igual (sem redigitar a ficha)',
      // I1
      'Lançar vários itens da mesma nota (carrinho)',
      // I2
      'Criar um item que não está no catálogo (sem sair do lançamento)',
      // T5
      'Exportar uma lista para o Excel (CSV)',
    ]) {
      expect(titulos).toContain(t)
    }
  })

  it('explica o colar-lista: separadores, bipagem e patrimônio duplicado (M1)', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('um patrimônio por linha'))
    expect(texto).toContain(normalizarBusca('vírgula, ponto e vírgula ou TAB'))
    expect(texto).toContain(normalizarBusca('cada bipada cai numa linha nova'))
    expect(texto).toContain(normalizarBusca('SEM service tag'))
  })

  it('descreve as sugestões de recentes e de colaborador/setor (M3 · M4)', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('Movimentados recentemente'))
    expect(texto).toContain(normalizarBusca('sugerem o que já existe no sistema depois de 2 letras'))
  })

  it('descreve a memória do acervo e as service tags da faixa na compra (A4 · A2)', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('NA MESMA ORDEM da faixa'))
    expect(texto).toContain(normalizarBusca('Marca, Modelo e Fornecedor sugerem'))
  })

  it('diz que patrimônio/service tag nunca vêm preenchidos no duplicar (A6)', () => {
    expect(textoDaSecao(secao('como-fazer'))).toContain(
      normalizarBusca('Patrimônio e service tag NUNCA vêm preenchidos'),
    )
  })

  it('o aviso de duplicata (spec §8.7) é descrito como aviso, não como trava (M5)', () => {
    const texto = textoDaSecao(secao('movimentacoes'))
    expect(texto).toContain(normalizarBusca('Possível duplicata'))
    expect(texto).toContain(normalizarBusca('registrar continua permitido'))
    expect(texto).toContain(normalizarBusca('estornada NÃO conta'))
  })

  it('o export CSV não promete truncar em silêncio nem esconder o filtro (T5)', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('exatamente com o que está filtrado'))
    expect(texto).toContain(normalizarBusca('refine os filtros'))
    expect(texto).toContain(normalizarBusca('só com o cabeçalho'))
  })

  it('o rascunho é descrito com o escopo real (aba, some ao fechar o navegador) — M6', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('só desta aba do navegador'))
    expect(texto).toContain(normalizarBusca('some quando você fecha o navegador'))
  })
})

describe('navegação e estrutura documentadas (OS-F11 · Onda 3)', () => {
  function titulosDePassos(idSecao: string): string[] {
    return secao(idSecao)
      .blocos.filter((b): b is Extract<Bloco, { tipo: 'passos' }> => b.tipo === 'passos')
      .map((b) => b.titulo ?? '')
  }

  it('tem o passo a passo de cada item novo da Onda 3', () => {
    const titulos = titulosDePassos('como-fazer')
    for (const t of [
      // T1 · T3 — busca global, atalhos e ajuda contextual
      'Achar qualquer coisa pelo teclado (busca global e atalhos)',
      // M8 — a lista de movimentações
      'Achar uma movimentação já registrada (lista de movimentações)',
      // T7 — ordenação por coluna e tamanho de página
      'Ordenar a lista de ativos e mudar o tamanho da página',
    ]) {
      expect(titulos).toContain(t)
    }
  })

  it('descreve os três atalhos globais e o Ctrl+K (T1 · T3)', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('Ctrl+K'))
    expect(texto).toContain(normalizarBusca('A barra "/" também abre'))
    expect(texto).toContain(normalizarBusca('N abre uma nova movimentação'))
    // F29/UXG-10d — o `?` passou a abrir o QUADRO de atalhos por cima da tela, em vez
    // de navegar para a ajuda (que continua a um clique, pelo link do rodapé dele).
    expect(texto).toContain(normalizarBusca('? abre o quadro de atalhos'))
    // A guarda que impede o atalho de disparar dentro de campo/diálogo é
    // comportamento prometido ao operador — se sair do código, sai daqui.
    expect(texto).toContain(normalizarBusca('enquanto você digita num campo'))
  })

  it('diz que a lista de movimentações NÃO substitui o caminho de registrar (M8)', () => {
    const comoFazer = textoDaSecao(secao('como-fazer'))
    expect(comoFazer).toContain(normalizarBusca('do mais recente para o mais antigo'))
    expect(comoFazer).toContain(normalizarBusca('a tecla N'))
    // A seção de tipos de movimentação aponta para a lista nova.
    expect(textoDaSecao(secao('movimentacoes'))).toContain(
      normalizarBusca('LISTA de movimentações'),
    )
  })

  it('descreve a ordenação com os cortes reais e os tamanhos de página (T7)', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('25, 50 ou 100 por página'))
    expect(texto).toContain(normalizarBusca('o padrão continua 50'))
    // Marca e Filial ficaram FORA da whitelist — o manual não pode prometê-las.
    expect(texto).toContain(normalizarBusca('Duas colunas não ordenam'))
  })

  it('descreve a comparação entre filiais, e o que ela mostra quando a conta não fecha', () => {
    // F42 — A REGRA MUDOU, e por isso as frases mudaram. A comparação entre
    // filiais deixou de ser uma VISÃO (um botão que trocava as colunas da tabela
    // inteira, e que junto escondia o filtro de filial) e virou o DETALHE de cada
    // linha, atrás de uma setinha. Duas asserções não descreviam mais nada que
    // existe: "Por filial põe uma coluna de estoque para CADA filial" e "o filtro
    // de filial some da barra" — o filtro agora está sempre lá.
    //
    // F43 — E MUDOU DE NOVO, para o outro lado. A coluna por filial VOLTOU, agora
    // como apresentação permanente (nunca como modo: o `?visao=` continua morto).
    // A linha expansível não sumiu — ela é o DETALHE, com os quatro números de
    // cada filial, e no celular é ela que responde a pergunta. A ajuda tem de
    // descrever as DUAS superfícies, e a asserção nova cobre a que nasceu.
    //
    // O que continua sendo obrigatório: a tela explica o déficit ("faltam N") e
    // explica quando a soma NÃO fecha — agora em dois lugares, com duas frases,
    // porque a conta pode não fechar na LINHA (colunas de filial) e na linha
    // ABERTA (os quatro números).
    const texto = textoDaSecao(secao('itens'))
    expect(texto).toContain(normalizarBusca('UMA COLUNA POR FILIAL, sempre visível numa tela larga'))
    expect(texto).toContain(normalizarBusca('Ver as N filiais'))
    expect(texto).toContain(normalizarBusca('a linha se abre e mostra o mesmo item filial por filial'))
    expect(texto).toContain(normalizarBusca('faltam N'))
    expect(texto).toContain(normalizarBusca('o filtro de filial está sempre lá'))
    expect(texto).toContain(normalizarBusca('N deles em filial fora desta lista'))
    expect(texto).toContain(normalizarBusca('inclui N em estoque de filial fora desta lista'))
  })

  it('diz que os filtros das tabelas do relatório ficam no link (T10)', () => {
    const texto = textoDaSecao(secao('relatorios'))
    expect(texto).toContain(normalizarBusca('viajam no link'))
    expect(texto).toContain(normalizarBusca('senha de acesso'))
  })

  it('documenta as melhorias de leitura da F16', () => {
    const texto = textoDaSecao(secao('relatorios'))
    // Busca livre (T3) — patrimônio fora do formato, com exemplo fictício.
    expect(texto).toContain(normalizarBusca('campo de busca livre'))
    expect(texto).toContain(normalizarBusca('wap 1234'))
    // Patrimônio→ficha + tiles clicáveis (T3/T4), só operador.
    expect(texto).toContain(normalizarBusca('link direto para a ficha'))
    // Δ com semântica (T2).
    expect(texto).toContain(normalizarBusca('subir é bom'))
    expect(texto).toContain(normalizarBusca('subir é ruim'))
    // Estorno sinalizado (T1) — sem mexer em contagem.
    expect(texto).toContain(normalizarBusca('estornada'))
    expect(texto).toContain(normalizarBusca('não altera nenhuma contagem'))
    // Manutenção 30+ dias (T6).
    expect(texto).toContain(normalizarBusca('30 dias ou mais'))
    // Mobile expansível (T5).
    expect(texto).toContain(normalizarBusca('esconder colunas'))
  })
})

describe('estoque mínimo e kits documentados (OS-F12)', () => {
  function titulosDePassos(idSecao: string): string[] {
    return secao(idSecao)
      .blocos.filter((b): b is Extract<Bloco, { tipo: 'passos' }> => b.tipo === 'passos')
      .map((b) => b.titulo ?? '')
  }

  it('NÃO volta a dizer que o sistema não guarda nível de reposição (I5 existe desde a F12)', () => {
    // A frase abaixo foi a correção honesta da F9 (I5a), quando o campo não
    // existia. A migration 0042 criou `itens.estoque_minimo`: se ela reaparecer,
    // o manual volta a mentir — agora na direção contrária.
    const tudo = SECOES.map(textoDaSecao).join(' ')
    expect(tudo).not.toContain(normalizarBusca('não guarda nível de reposição'))
    expect(tudo).not.toContain(normalizarBusca('não é aviso de reposição'))
    // e o conceito tem de estar escrito em algum lugar do manual
    expect(tudo).toContain(normalizarBusca('estoque mínimo'))
    expect(tudo).toContain(normalizarBusca('ponto de reposição'))
  })

  it('separa "falta" (déficit vermelho) de "repor" (âmbar, ponto de reposição)', () => {
    const texto = textoDaSecao(secao('itens'))
    expect(texto).toContain(normalizarBusca('Falta e repor são dois avisos DIFERENTES'))
    // F41 — ver a nota do caso acima: a conta não mudou, os nomes sim.
    expect(texto).toContain(normalizarBusca('máx(0, reservado + em uso − total)'))
    expect(texto).toContain(normalizarBusca('selo vermelho "faltam N"'))
    expect(texto).toContain(normalizarBusca('selo âmbar "repor"'))
  })

  // ⚠ F44 — ESTE TESTE MUDOU DE ALVO, e a razão é que ele estava PROTEGENDO A
  // DOCUMENTAÇÃO ERRADA em vez de detectá-la — exatamente o que o comentário de
  // `conteudo/gestao.test.ts` já registrava ter acontecido uma vez.
  //
  // Ele fixava as strings "estoque somado de TODAS as filiais" e "nunca do saldo
  // de uma filial". Em 01/09/2026 o Johnny revogou essa parte da decisão de
  // 23/07/2026: o aviso "repor" passou a SEGUIR o filtro de filial. Com as
  // asserções antigas, a suíte ficaria VERDE enquanto a ajuda descrevesse um
  // comportamento que o produto não tem mais — que é o pior estado possível de um
  // teste de documentação.
  //
  // Agora ele cobra as três coisas que continuam verdadeiras (mínimo 0, igual não
  // acende, o card do painel) MAIS a regra nova e o efeito colateral dela, que é
  // justamente o que o operador precisa saber para não comprar o que sobra ao lado.
  it('descreve a regra exata do mínimo: segue o filtro, 0 não alerta, igual não acende', () => {
    const texto = textoDaSecao(secao('itens'))
    expect(texto).toContain(normalizarBusca('Mínimo 0 = item sem acompanhamento, nunca acende'))
    expect(texto).toContain(normalizarBusca('Estoque IGUAL ao mínimo também não acende'))
    expect(texto).toContain(normalizarBusca('SEGUE O FILTRO DE FILIAL'))
    expect(texto).toContain(normalizarBusca('compara com o estoque DAQUELA filial'))
    // O efeito colateral que a decisão de 23/07/2026 evitava, dito com todas as
    // letras para quem opera — sem isto, a regra nova vira armadilha.
    expect(texto).toContain(normalizarBusca('sobra na filial ao lado'))
    expect(texto).toContain(normalizarBusca('card "Itens para repor"'))
  })

  // ⚠ E A DIVERGÊNCIA COM O PAINEL INICIAL TEM DE ESTAR ESCRITA. O card "Itens
  // para repor" da home lê SEMPRE o consolidado (`getSaldosItens(null)`, em
  // `src/app/(app)/page.tsx`) e não tem filtro de filial — desde a F44 ele pode
  // discordar da contagem de `/itens` filtrada, e as duas estão certas. Ajuda que
  // não avisa isso transforma uma diferença legítima em suspeita de defeito.
  it('avisa que o card do painel inicial NÃO acompanha o filtro de filial', () => {
    const texto = textoDaSecao(secao('itens'))
    expect(texto).toContain(normalizarBusca('esse card é SEMPRE do acervo inteiro'))
    expect(texto).toContain(normalizarBusca('podem não bater'))
  })

  it('descreve o kit: onde se cria, que sobrescreve, que o checklist não bloqueia e que é cópia', () => {
    const texto = textoDaSecao(secao('movimentacoes'))
    expect(texto).toContain(normalizarBusca('um kit é um MODELO salvo do passo 2'))
    expect(texto).toContain(normalizarBusca('Administração › Kits'))
    expect(texto).toContain(normalizarBusca('"Aplicar kit"'))
    expect(texto).toContain(normalizarBusca('CHECKLIST informativo'))
    expect(texto).toContain(normalizarBusca('NUNCA impede registrar'))
    expect(texto).toContain(normalizarBusca('Kit é cópia'))
    expect(texto).toContain(
      normalizarBusca('não altera nenhuma movimentação já registrada'),
    )
  })

  it('tem o passo a passo dos dois itens da F12', () => {
    const titulos = titulosDePassos('como-fazer')
    for (const t of [
      'Definir o estoque mínimo de um item',
      'Criar e aplicar um kit de movimentação',
    ]) {
      expect(titulos).toContain(t)
    }
  })

  it('o passo do kit registra a divergência deliberada com "Repetir última"', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    // Kit de tipo incompatível não aplica NADA (decisão do W3, OS-F12 §W3.2) —
    // é o oposto do repetirUltima, e o manual promete exatamente isso.
    expect(texto).toContain(normalizarBusca('NÃO é aplicado pela metade'))
    expect(texto).toContain(normalizarBusca('É diferente de "Repetir última"'))
    expect(texto).toContain(normalizarBusca('Administração › Kits › "Novo kit"'))
  })

  it('o passo do mínimo cita o travessão do 0 e a ordem do card do painel', () => {
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('exibido como travessão na coluna Mínimo'))
    expect(texto).toContain(normalizarBusca('mais críticos primeiro'))
  })

  it('a Administração lista Kits e o catálogo de itens inclui o mínimo', () => {
    const texto = textoDaSecao(secao('admin'))
    expect(texto).toContain(normalizarBusca('Kits — os modelos do passo 2'))
    expect(texto).toContain(normalizarBusca('estoque mínimo)'))
  })
})

describe('pendência de item faltante por movimentação (OS-F18)', () => {
  function titulosDePassos(idSecao: string): string[] {
    return secao(idSecao)
      .blocos.filter((b): b is Extract<Bloco, { tipo: 'passos' }> => b.tipo === 'passos')
      .map((b) => b.titulo ?? '')
  }

  it('o verbete de itens faltantes descreve o registro por movimentação, não o campo livre', () => {
    // F18: a pendência de item deixa de ser texto colado no ativo e vira registro
    // próprio, preso à devolução e ao colaborador da época (nunca ao dono atual).
    const texto = textoDaSecao(secao('pendencias'))
    expect(texto).toContain(normalizarBusca('colaborador da época'))
    // Encerramento manual com desfecho, individual ou em lote.
    expect(texto).toContain(normalizarBusca('item recuperado'))
    expect(texto).toContain(normalizarBusca('não vai voltar'))
    expect(texto).toContain(normalizarBusca('em lote'))
    // Import dispensado (mesmo racional do termo, migration 0049) e permanência
    // na ficha para auditoria depois de resolvida.
    expect(texto).toContain(normalizarBusca('import de startup'))
    expect(texto).toContain(normalizarBusca('fica na ficha'))
  })

  it('a Triagem OK deixa de apagar a pendência de itens (bug antigo corrigido)', () => {
    expect(textoDaSecao(secao('movimentacoes'))).toContain(
      normalizarBusca('Triagem OK NÃO apaga'),
    )
  })

  it('tem o passo a passo de resolver uma pendência de item faltante', () => {
    expect(titulosDePassos('como-fazer')).toContain(
      'Resolver uma pendência de item faltante',
    )
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('resolva em lote'))
    // F20: era `definitivo nesta fase`. "Nesta fase" é vocabulário do PROJETO,
    // não do operador — e insinuava que um dia reabriria (a documentação não
    // promete futuro). A asserção ficou mais forte, não mais fraca: agora exige
    // as duas metades da regra, o "definitivo" E o "não há reabrir".
    //
    // F28/PND-05: a regra em si MUDOU — reabrir passou a existir (nível
    // administrador, com justificativa, com rastro). "não há reabrir" virou
    // MENTIRA e saiu do texto de propósito — travar o literal aqui teria
    // reprovado exatamente o objetivo desta fase. A asserção agora trava a
    // verdade NOVA: que reabrir existe, que é exclusivo do nível administrador,
    // que pede justificativa e que fica registrado na linha do tempo.
    expect(texto).toContain(normalizarBusca('resolver encerra a pendência'))
    expect(texto).toContain(normalizarBusca('nível administrador'))
    expect(texto).toContain(normalizarBusca('reabrir'))
  })

  it('tem o passo a passo de reabrir uma pendência de item resolvida (F28/PND-05)', () => {
    expect(titulosDePassos('como-fazer')).toContain(
      'Reabrir uma pendência de item resolvida',
    )
    const texto = textoDaSecao(secao('como-fazer'))
    // As duas condições que tornam a reabertura segura: exige justificativa e
    // deixa rastro — sem as duas, "reabrir" seria indistinguível de "apagar o
    // desfecho sem explicação".
    expect(texto).toContain(normalizarBusca('justificativa'))
    expect(texto).toContain(normalizarBusca('linha do tempo do ativo'))
    // Restrição de cargo: quem NÃO reabre também precisa estar escrito, não só
    // quem reabre — "só o nível administrador" é a metade que impede alguém de
    // ler isto e achar que qualquer operador tem o botão.
    expect(texto).toContain(normalizarBusca('operador ou consulta não vê o botão'))
  })
})

describe('filtrarSecoes', () => {
  it('consulta vazia devolve todas as seções', () => {
    expect(filtrarSecoes(SECOES, '')).toHaveLength(SECOES.length)
    expect(filtrarSecoes(SECOES, '   ')).toHaveLength(SECOES.length)
  })

  it('acha a seção de movimentações buscando sem acento', () => {
    const achadas = filtrarSecoes(SECOES, 'manutencao')
    expect(achadas.map((s) => s.id)).toContain('movimentacoes')
  })

  it('acha itens por um termo específico do glossário derivado', () => {
    const achadas = filtrarSecoes(SECOES, 'atrelar')
    expect(achadas.map((s) => s.id)).toContain('itens')
  })

  it('não acha nada para um termo ausente', () => {
    expect(filtrarSecoes(SECOES, 'xpto-inexistente-123')).toHaveLength(0)
  })

  it('cada seção tem id único e texto pesquisável não vazio', () => {
    const ids = SECOES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SECOES) expect(textoDaSecao(s).length).toBeGreaterThan(0)
  })
})

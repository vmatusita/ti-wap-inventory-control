import { describe, it, expect } from 'vitest'
import { PAGINAS, ancorasDaPagina, paginaPorSlug } from '@/lib/ajuda/registry'
import { textoDaPagina } from '@/lib/ajuda/indice'
import { normalizarBusca } from '@/lib/ajuda/busca'
import {
  CATEGORIA_META,
  CATEGORIA_ORDEM,
  GRUPO_ITEM_ORDEM,
  STATUS_META,
  STATUS_ORDEM,
  TIPO_LANCAMENTO_META,
  TIPO_META,
} from '@/lib/dominio'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
import { CAP_EXPORT } from '@/lib/csv'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { TAMANHO_MAX_ROTULO } from '@/lib/import/limites'
import type { Bloco, PaginaAjuda } from '@/lib/ajuda/tipos'

// COMPLETUDE da frente "Relatórios, referência e solução de problemas" (F20 · C4).
//
// Estes testes travam o que a documentação PROMETE ao operador nestas 9 páginas:
// que a página existe, que ela cita o rótulo REAL da tela (nunca uma paráfrase),
// que os glossários derivados continuam cobrindo o enum inteiro, que todo teto
// citado vem da constante e que cada mensagem de erro catalogada é o texto exato
// de `src/lib/actions/**`. Teste de completude só cresce: apagar uma linha daqui
// é apagar uma promessa.

const SLUGS_C4 = [
  'relatorio-ao-vivo',
  'relatorios-gerados',
  'status-do-ativo',
  'tipos-de-movimentacao',
  'itens-por-quantidade',
  'limites-e-atalhos',
  'mensagens-de-erro',
  'problemas-comuns',
  'problemas-import-e-acesso',
] as const

function pagina(slug: string): PaginaAjuda {
  const p = paginaPorSlug(slug)
  if (!p) throw new Error(`página ausente do registry: ${slug}`)
  return p
}

/** Texto CRU da página (mantém caixa, acento e pontuação) — para conferir uma
 *  mensagem de erro ou um rótulo de botão letra por letra. */
function cru(slug: string): string {
  return JSON.stringify(pagina(slug).blocos)
}

/** Texto normalizado (busca): para afirmações sobre conteúdo, não sobre grafia. */
function normal(slug: string): string {
  return textoDaPagina(pagina(slug))
}

function blocos<T extends Bloco['tipo']>(
  slug: string,
  tipo: T,
): Extract<Bloco, { tipo: T }>[] {
  return pagina(slug).blocos.filter(
    (b): b is Extract<Bloco, { tipo: T }> => b.tipo === tipo,
  )
}

// ---------------------------------------------------------------------------
// As 9 páginas existem, na categoria certa e herdando o legado certo.
// ---------------------------------------------------------------------------

describe('as páginas da frente existem e estão no lugar certo', () => {
  it.each(SLUGS_C4)('%s está no registry', (slug) => {
    expect(paginaPorSlug(slug)).toBeDefined()
  })

  it('as sete de referência estão em "consultar" e as duas de sintoma em "resolver"', () => {
    for (const slug of SLUGS_C4.slice(0, 7)) {
      expect(pagina(slug).categoria, slug).toBe('consultar')
    }
    for (const slug of ['problemas-comuns', 'problemas-import-e-acesso']) {
      expect(pagina(slug).categoria, slug).toBe('resolver')
    }
  })

  it('a herança das seções do manual antigo continua declarada', () => {
    expect(pagina('relatorio-ao-vivo').legado).toContain('relatorios')
    expect(pagina('relatorios-gerados').legado).toContain('relatorios')
    expect(pagina('relatorios-gerados').legado).toContain('como-fazer')
    expect(pagina('status-do-ativo').legado).toContain('status')
    expect(pagina('tipos-de-movimentacao').legado).toContain('movimentacoes')
    expect(pagina('itens-por-quantidade').legado).toContain('itens')
    expect(pagina('limites-e-atalhos').legado).toContain('como-fazer')
  })

  it('as âncoras destas páginas são prefixadas (nada de id genérico que colida)', () => {
    const PREFIXOS: Record<string, string[]> = {
      'relatorio-ao-vivo': ['relvivo-'],
      'relatorios-gerados': ['gerados-'],
      'status-do-ativo': ['status-'],
      'tipos-de-movimentacao': ['tipos-'],
      'itens-por-quantidade': ['itens-'],
      'limites-e-atalhos': ['limites-'],
      'mensagens-de-erro': ['erros-'],
      'problemas-comuns': ['comuns-'],
      'problemas-import-e-acesso': ['problemas-'],
    }
    for (const [slug, prefixos] of Object.entries(PREFIXOS)) {
      const ids = ancorasDaPagina(pagina(slug)).map((a) => a.id)
      expect(ids.length, `${slug} sem âncora`).toBeGreaterThan(0)
      for (const id of ids) {
        expect(
          prefixos.some((p) => id.startsWith(p)),
          `âncora sem prefixo em ${slug}: ${id}`,
        ).toBe(true)
      }
    }
  })

  it('toda página da frente aponta para outras (nenhuma é beco sem saída)', () => {
    for (const slug of SLUGS_C4) {
      const refs = blocos(slug, 'links').flatMap((b) => b.itens)
      expect(refs.length, `${slug} sem bloco de links`).toBeGreaterThan(0)
      for (const r of refs) {
        expect(paginaPorSlug(r.slug), `${slug} -> ${r.slug}`).toBeDefined()
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Referência derivada: o glossário tem de cobrir o enum INTEIRO, com prosa.
// ---------------------------------------------------------------------------

describe('status-do-ativo — glossário completo e com contexto', () => {
  const glossarios = blocos('status-do-ativo', 'glossario')

  it('cobre os 9 status na ordem canônica, com o rótulo real', () => {
    const g = glossarios.find((b) => b.badge === 'status')
    expect(g).toBeDefined()
    expect(g!.itens.map((v) => v.chave)).toEqual(STATUS_ORDEM)
    for (const v of g!.itens) {
      expect(v.rotulo).toBe(STATUS_META[v.chave as keyof typeof STATUS_META].rotulo)
      // Uma linha de contexto de verdade, não um rótulo repetido.
      expect(v.descricao.length, `descrição curta demais: ${v.chave}`).toBeGreaterThan(40)
    }
  })

  it('cobre as categorias, cada uma com texto próprio (sem cair no padrão)', () => {
    const g = glossarios.find((b) => b.badge === 'neutro')
    expect(g).toBeDefined()
    expect(g!.itens.map((v) => v.chave)).toEqual(CATEGORIA_ORDEM)
    const descricoes = new Set(g!.itens.map((v) => v.descricao))
    expect(descricoes.size, 'categorias com descrição repetida (padrão genérico)').toBe(
      CATEGORIA_ORDEM.length,
    )
    for (const v of g!.itens) {
      expect(v.rotulo).toBe(CATEGORIA_META[v.chave as keyof typeof CATEGORIA_META].rotulo)
    }
  })

  it('diz que status não se edita e que dois estados são finais', () => {
    const t = normal('status-do-ativo')
    expect(t).toContain(normalizarBusca('mudam apenas por movimentação'))
    expect(t).toContain(normalizarBusca('Descartado e Devolvido ao fornecedor'))
  })
})

describe('tipos-de-movimentacao — os 15 tipos e o que não está no formulário', () => {
  it('cobre todos os tipos do domínio, com efeito escrito', () => {
    const b = blocos('tipos-de-movimentacao', 'movimentacoes')[0]
    expect(b).toBeDefined()
    expect(b.itens.map((v) => v.chave).sort()).toEqual(Object.keys(TIPO_META).sort())
    for (const v of b.itens) {
      expect(v.rotulo).toBe(TIPO_META[v.chave as keyof typeof TIPO_META].rotulo)
      expect(v.efeito.length, `efeito vazio: ${v.chave}`).toBeGreaterThan(20)
    }
  })

  it('nomeia os quatro tipos que têm caminho próprio, com o botão real de cada um', () => {
    const c = cru('tipos-de-movimentacao')
    expect(c).toContain('Devolver ao fornecedor')
    expect(c).toContain('Estornar')
    expect(c).toContain('Tipo de movimentação')
    const t = normal('tipos-de-movimentacao')
    expect(t).toContain(normalizarBusca('só aparecem as movimentações válidas para todos eles'))
  })
})

describe('itens-por-quantidade — grupos, números e tipos de lançamento', () => {
  it('cobre os grupos e os seis tipos de lançamento derivados do domínio', () => {
    const gs = blocos('itens-por-quantidade', 'glossario')
    const grupos = gs.find((b) => b.badge === 'neutro')
    const tipos = gs.find((b) => b.badge === 'tipoLanc')
    expect(grupos!.itens.map((v) => v.chave)).toEqual(GRUPO_ITEM_ORDEM)
    expect(tipos!.itens.map((v) => v.chave).sort()).toEqual(
      Object.keys(TIPO_LANCAMENTO_META).sort(),
    )
  })

  it('mantém a semântica de Falta (déficit) e explica os pares ida/volta', () => {
    const t = normal('itens-por-quantidade')
    expect(t).toContain(normalizarBusca('atrelados + liberados − total'))
    expect(t).toContain(normalizarBusca('déficit'))
    expect(t).toContain(normalizarBusca('o que sai por Liberação volta por Retorno'))
    expect(t).toContain(normalizarBusca('o que sai por Atrelar volta por Devolução'))
  })
})

// ---------------------------------------------------------------------------
// Limites e atalhos: todo número vem da constante; toda guarda está escrita.
// ---------------------------------------------------------------------------

describe('limites-e-atalhos — tetos derivados e guardas reais', () => {
  const t = normal('limites-e-atalhos')

  it('cita cada teto pela constante real', () => {
    expect(t).toContain(normalizarBusca(String(MAX_LOTE_MOVIMENTACAO)))
    expect(t).toContain(normalizarBusca(String(MAX_LOTE_COMPRA)))
    expect(t).toContain(normalizarBusca(String(MAX_LINHAS_LOTE_ITEM)))
    expect(t).toContain(normalizarBusca(CAP_EXPORT.toLocaleString('pt-BR')))
    expect(t).toContain(normalizarBusca(DOMINIOS_TEXTO))
    expect(t).toContain(normalizarBusca(TAMANHO_MAX_ROTULO))
  })

  it('descreve as seis teclas e o Enter do fluxo de movimentação', () => {
    const b = blocos('limites-e-atalhos', 'atalhos')[0]
    expect(b).toBeDefined()
    const teclas = b.itens.map((a) => a.teclas)
    for (const k of ['Ctrl+K', '/', 'N', 'L', '?', 'Enter']) {
      expect(teclas, `atalho ausente: ${k}`).toContain(k)
    }
    // Cada atalho de letra tem de dizer QUANDO não dispara — a guarda é promessa.
    for (const k of ['Ctrl+K', '/', 'N', 'L', '?', 'Enter']) {
      const linha = b.itens.find((a) => a.teclas === k)!
      expect(linha.observacao?.length ?? 0, `guarda ausente em ${k}`).toBeGreaterThan(20)
    }
  })

  it('mantém a guarda global e a busca por "teclado"', () => {
    expect(t).toContain(normalizarBusca('enquanto você digita num campo'))
    expect(t).toContain(normalizarBusca('teclado'))
  })
})

// ---------------------------------------------------------------------------
// Mensagens de erro: TEXTO EXATO. Se a mensagem mudar no código sem mudar aqui,
// o operador procura na documentação uma frase que a tela não diz mais.
// ---------------------------------------------------------------------------

const MENSAGENS_OBRIGATORIAS = [
  // Movimentação / estorno / ajuste (traduzErroBanco)
  'Transição inválida: o ativo não aceita essa movimentação no estado atual.',
  'Só a última movimentação do ativo pode ser estornada (para casos antigos, use um ajuste com justificativa).',
  'Esta movimentação não pode ser estornada.',
  'O ajuste exige o status resultante e uma justificativa (observação).',
  'A filial de destino deve ser diferente da atual.',
  'O lote não pode repetir o mesmo ativo. Registre em lotes separados.',
  'Não processado — o lote foi interrompido em um item anterior.',
  // Itens por quantidade
  'Estoque insuficiente: a operação deixaria o item com estoque negativo na prateleira.',
  'Ajuste inválido: deixaria o item com total negativo.',
  'A devolução é maior que a quantidade atrelada ao chamado.',
  'O retorno é maior que a quantidade liberada em aberto.',
  'O ajuste exige uma justificativa (observação).',
  'Reserva e liberação exigem o número do chamado.',
  'Quantidade inválida para este tipo de lançamento.',
  'Já existe um item com esse nome.',
  'Este lançamento já foi estornado.',
  'Um estorno não pode ser estornado.',
  // Identidade e duplicidade
  'Já existe um ativo com esse patrimônio e service tag.',
  'Este ativo já tem service tag — ela é imutável (identidade do equipamento).',
  'Já existe um registro com esses dados. Atualize a página e tente de novo.',
  'Um dos valores informados (motivo ou filial) não existe mais.',
  // Import de startup
  'Há dois ativos sem patrimônio com a mesma service tag no plano — a service tag é a identidade quando não há patrimônio. Corrija o CSV e gere o preview novamente.',
  'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.',
  'A importação demorou demais e foi cancelada — tente novamente ou avise o TI.',
  'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.',
  'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.',
  'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.',
  'O arquivo precisa ter extensão .csv ou .xlsx.',
  'Filial inativa: import bloqueado.',
  // Sessão e acesso
  'Sem permissão para esta operação. Faça login novamente.',
  'Sua sessão expirou. Faça login novamente.',
  'E-mail ou senha inválidos',
  'Senha inválida.',
  'Muitas tentativas. Aguarde um instante e tente de novo.',
  'Seu link expirou. Peça um novo convite ao administrador.',
  // Fallback de produção
  'Não foi possível concluir a operação. Tente novamente.',
] as const

describe('mensagens-de-erro — catálogo com o texto exato da tela', () => {
  const c = cru('mensagens-de-erro')

  it('todas as tabelas usam as três colunas do contrato', () => {
    const tabelas = blocos('mensagens-de-erro', 'tabela')
    expect(tabelas.length, 'nenhuma tabela de mensagens').toBeGreaterThan(0)
    for (const t of tabelas) {
      expect(t.colunas).toEqual(['A mensagem', 'O que aconteceu', 'O que fazer'])
      for (const linha of t.linhas) {
        expect(linha).toHaveLength(3)
        for (const celula of linha) expect(celula.length).toBeGreaterThan(0)
      }
    }
  })

  it.each(MENSAGENS_OBRIGATORIAS)('documenta: %s', (mensagem) => {
    expect(c).toContain(JSON.stringify(mensagem).slice(1, -1))
  })

  it('os tetos citados dentro das mensagens vêm das constantes', () => {
    expect(c).toContain(`O lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO} itens`)
    expect(c).toContain(`O lançamento aceita no máximo ${MAX_LINHAS_LOTE_ITEM} itens`)
    expect(c).toContain(`o máximo por lote é ${MAX_LOTE_COMPRA}`)
    expect(c).toContain(`o limite é ${TAMANHO_MAX_ROTULO}`)
    expect(c).toContain(DOMINIOS_TEXTO)
  })

  it('explica que recusa não é perda (o não-efeito é afirmado)', () => {
    const t = normal('mensagens-de-erro')
    expect(t).toContain(normalizarBusca('nada foi gravado'))
    expect(t).toContain(normalizarBusca('Verifique sua conexão e tente de novo.'))
  })

  it('traduz o par "Reserva e liberação" para os rótulos que a tela mostra', () => {
    const t = normal('mensagens-de-erro')
    expect(t).toContain(normalizarBusca('"Atrelar" e "Devolução"'))
  })
})

// ---------------------------------------------------------------------------
// Resolver: sintoma -> causa -> saída. Cada tema exigido tem de estar coberto.
// ---------------------------------------------------------------------------

function sintomasDe(slug: string) {
  return blocos(slug, 'sintomas').flatMap((b) => b.itens)
}

describe('problemas-comuns — os sete sintomas que travam o dia', () => {
  const itens = sintomasDe('problemas-comuns')

  it('todo sintoma traz causa e ao menos duas saídas acionáveis', () => {
    expect(itens.length).toBeGreaterThanOrEqual(7)
    for (const s of itens) {
      expect(s.causa.length, s.sintoma).toBeGreaterThan(40)
      expect(s.saida.length, s.sintoma).toBeGreaterThanOrEqual(2)
    }
  })

  it.each([
    ['não encontro o ativo', 'nao encontro o equipamento na busca'],
    ['busca de movimentações', 'a busca pela plaqueta nao traz nada'],
    ['patrimônio duplicado', 'dois equipamentos tem o mesmo patrimonio'],
    ['tipo indisponível no lote', 'o tipo de movimentacao que eu quero nao aparece'],
    ['termo ainda pendente', 'gerei o termo, mas o ativo continua na fila'],
    ['tela vazia', 'a tela esta vazia e eu sei que existe coisa cadastrada'],
    ['endereço colado', 'o endereco que me mandaram nao abriu a tela certa'],
    ['falha de rede', 'nao sei se gravou'],
  ])('cobre o sintoma "%s"', (_titulo, trecho) => {
    const achou = itens.some((s) => normalizarBusca(s.sintoma).includes(trecho))
    expect(achou, `sintoma ausente: ${trecho}`).toBe(true)
  })

  it('a saída da falha de rede afirma o não-efeito, com o aviso real do lote', () => {
    expect(cru('problemas-comuns')).toContain(
      'Não foi possível registrar agora. Seu lote continua aqui — verifique sua conexão e tente de novo.',
    )
  })

  it('distingue vazio-sem-filtro de vazio-com-filtro pelos textos reais', () => {
    const c = cru('problemas-comuns')
    expect(c).toContain('Nenhum ativo cadastrado ainda')
    expect(c).toContain('Nenhum ativo com esses filtros')
    expect(c).toContain('Limpar filtros')
  })

  it('descreve o endereço torto com o comportamento real (última página, valor ignorado)', () => {
    const t = normal('problemas-comuns')
    expect(t).toContain(normalizarBusca('última página que existe'))
    expect(t).toContain(normalizarBusca('o sistema ignora e usa o padrão'))
  })
})

describe('problemas-import-e-acesso — arquivo, convite, senha e sessão', () => {
  const itens = sintomasDe('problemas-import-e-acesso')

  it('todo sintoma traz causa e ao menos duas saídas', () => {
    expect(itens.length).toBeGreaterThanOrEqual(6)
    for (const s of itens) {
      expect(s.causa.length, s.sintoma).toBeGreaterThan(30)
      expect(s.saida.length, s.sintoma).toBeGreaterThanOrEqual(2)
    }
  })

  it.each([
    ['arquivo recusado', 'recusou meu arquivo'],
    ['preview bloqueado', 'import bloqueado'],
    ['substituir tudo falhou', 'substituir tudo'],
    ['sessão de 24 h', 'pediu login de novo no meio do trabalho'],
    ['erro de login persistente', 'errei a senha no login'],
    ['convite sem e-mail', 'nao recebeu nenhum e-mail'],
    ['visualizador sem ativos', 'nao consegue ver os ativos'],
    ['senha perdida', 'perdi a senha de acesso'],
  ])('cobre o sintoma "%s"', (_titulo, trecho) => {
    const achou = itens.some((s) => normalizarBusca(s.sintoma).includes(trecho))
    expect(achou, `sintoma ausente: ${trecho}`).toBe(true)
  })

  it('diz que o convite NÃO sai por e-mail e nomeia os botões do fluxo', () => {
    const c = cru('problemas-import-e-acesso')
    expect(c).toContain('Gerar link')
    expect(c).toContain('Convite gerado — copie o link')
    expect(c).toContain('Ativar meu acesso')
    expect(normal('problemas-import-e-acesso')).toContain(
      normalizarBusca('O convite NÃO sai por e-mail'),
    )
  })

  it('a senha de acesso aparece uma única vez e se substitui criando outra', () => {
    const c = cru('problemas-import-e-acesso')
    expect(c).toContain('Esta é a única vez que a senha aparece.')
    expect(c).toContain('Nova senha')
    expect(c).toContain('Revogar')
    expect(c).toContain('Reativar')
  })

  it('descreve o corte real do visualizador por senha (inclusive o tema)', () => {
    const t = normal('problemas-import-e-acesso')
    expect(t).toContain(normalizarBusca('somente aos relatórios'))
    expect(t).toContain(normalizarBusca('controle de tema'))
    expect(t).toContain(normalizarBusca('Como ler este relatório'))
  })

  it('a sessão de 24 horas continua escrita (operador e visualizador)', () => {
    expect(normal('problemas-import-e-acesso')).toContain(
      normalizarBusca('expiram em 24 horas'),
    )
  })
})

// ---------------------------------------------------------------------------
// Relatórios: impressão, versionamento e o que o snapshot antigo não mostra.
// ---------------------------------------------------------------------------

describe('relatorio-ao-vivo — leitura, filtros e impressão', () => {
  const t = normal('relatorio-ao-vivo')

  it('mantém as frases travadas da seção antiga de relatórios', () => {
    for (const frase of [
      'viajam no link',
      'senha de acesso',
      'campo de busca livre',
      'wap 1234',
      'link direto para a ficha',
      'subir é bom',
      'subir é ruim',
      'estornada',
      'não altera nenhuma contagem',
      '30 dias ou mais',
      'esconder colunas',
    ]) {
      expect(t, `frase legada perdida: ${frase}`).toContain(normalizarBusca(frase))
    }
  })

  it('documenta o botão "Imprimir" e a impressão sempre clara', () => {
    const c = cru('relatorio-ao-vivo')
    expect(c).toContain('Imprimir')
    expect(t).toContain(normalizarBusca('sai SEMPRE clara'))
    expect(t).toContain(normalizarBusca('tema escuro'))
    const passos = blocos('relatorio-ao-vivo', 'passos')
    expect(passos.length, 'sem passo a passo de impressão').toBeGreaterThan(0)
  })

  it('nomeia os presets de período e as abas de filial com o rótulo real', () => {
    const c = cru('relatorio-ao-vivo')
    for (const rotulo of [
      'Esta semana',
      'Últimos 30 dias',
      'Este ano',
      'Tudo',
      'Personalizado',
      'Aplicar período',
      'Consolidado',
    ]) {
      expect(c, `rótulo ausente: ${rotulo}`).toContain(rotulo)
    }
  })

  it('lista os sete indicadores do topo com o rótulo real', () => {
    const c = cru('relatorio-ao-vivo')
    for (const rotulo of [
      'Total de ativos',
      'Em uso',
      'Em estoque',
      'Reservados',
      'Em triagem',
      'Em manutenção',
      'Reserva técnica',
    ]) {
      expect(c, `KPI ausente: ${rotulo}`).toContain(rotulo)
    }
  })
})

describe('relatorios-gerados — versão, histórico e limites do snapshot antigo', () => {
  const t = normal('relatorios-gerados')

  it('explica o versionamento e o aviso de versão mais nova', () => {
    expect(t).toContain(normalizarBusca('cria a versão seguinte'))
    expect(cru('relatorios-gerados')).toContain(
      'Existe a versão N deste relatório — abrir a mais recente.',
    )
  })

  it('tem o passo a passo de gerar e o de achar, com os botões reais', () => {
    const titulos = blocos('relatorios-gerados', 'passos').map((b) => b.titulo)
    expect(titulos).toContain('Gerar um snapshot do relatório')
    expect(titulos).toContain('Encontrar um relatório já gerado')
    const c = cru('relatorios-gerados')
    for (const rotulo of [
      'Gerar relatório',
      'Gerar relatório da semana',
      'Gerar e abrir',
      'Relatórios gerados',
      'Ver ao vivo',
      'Abrir',
      'Tem observação da semana',
      'Nenhum relatório gerado ainda',
      'dados congelados',
    ]) {
      expect(c, `rótulo ausente: ${rotulo}`).toContain(rotulo)
    }
  })

  it('registra a limitação real dos snapshots antigos (sem Δ, sem marca de estorno)', () => {
    expect(t).toContain(normalizarBusca('sem o Δ'))
    expect(t).toContain(normalizarBusca('sem a marca "estornada"'))
    expect(t).toContain(normalizarBusca('não é defeito'))
  })

  it('diz que os indicadores do snapshot não são clicáveis', () => {
    expect(t).toContain(normalizarBusca('NÃO são clicáveis'))
  })
})

// ---------------------------------------------------------------------------
// Linguagem: a régua da fase, conferida sobre as páginas desta frente.
// ---------------------------------------------------------------------------

describe('linguagem das páginas desta frente', () => {
  const texto = SLUGS_C4.map((s) => cru(s)).join(' ')

  it('não promete futuro', () => {
    const n = normalizarBusca(texto)
    for (const termo of [
      'em breve',
      'ainda nao e possivel',
      'por enquanto',
      'esta previsto',
      'sera implementado',
      'proxima fase',
    ]) {
      expect(n.includes(termo), `promessa de futuro: "${termo}"`).toBe(false)
    }
  })

  it('não vaza jargão de desenvolvedor', () => {
    for (const termo of [
      'Server Action',
      'Server Component',
      'RLS',
      'migration',
      'trigger do banco',
      'endpoint',
      'payload',
      'jsonb',
      'PostgREST',
      'Supabase',
    ]) {
      expect(texto.includes(termo), `jargão: "${termo}"`).toBe(false)
    }
  })

  it('todo patrimônio de exemplo é fictício', () => {
    for (const m of normalizarBusca(texto).matchAll(/wap\d{7}/g)) {
      expect(['wap0001234', 'wap0004491']).toContain(m[0])
    }
  })

  it('as páginas desta frente estão todas no registry uma única vez', () => {
    for (const slug of SLUGS_C4) {
      expect(PAGINAS.filter((p) => p.slug === slug)).toHaveLength(1)
    }
  })
})

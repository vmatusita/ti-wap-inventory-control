import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
import {
  MAX_LOTE_MOVIMENTACAO,
  TIPOS_FORA_DO_LOTE_MANUAL,
} from '@/lib/validators/movimentacao'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { MOV_PAGE_SIZE } from '@/lib/queries/movimentacoes'
import { GERADOS_PAGE_SIZE } from '@/lib/queries/gerados'
import { PRESETS } from '@/lib/relatorios/periodo'
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

/** Rótulos de um array `const X = [...]` de um componente REAL, na ordem da tela.
 *  Mesmo helper de `comecar.test.ts`: comparar a documentação com um literal
 *  repetido aqui deixaria os dois envelhecendo juntos — este lê o arquivo-fonte. */
function rotulosDe(arquivo: string, constante: string): string[] {
  const src = readFileSync(join(process.cwd(), ...arquivo.split('/')), 'utf8')
  const bloco = src.match(new RegExp(`const ${constante}[\\s\\S]*?= \\[([\\s\\S]*?)\\n\\]`))
  if (!bloco) throw new Error(`${constante} não encontrado em ${arquivo}`)
  return [...bloco[1].matchAll(/rotulo: '([^']+)'/g)].map((m) => m[1])
}

/** Código-fonte de um módulo de conteúdo desta frente (para provar que um valor
 *  é DERIVADO, e não um literal que por acaso coincide com a constante hoje). */
function fonteDoConteudo(arquivo: string): string {
  return readFileSync(
    join(process.cwd(), 'src', 'lib', 'ajuda', 'conteudo', arquivo),
    'utf8',
  )
}

/** Contagem por extenso, para travar o numeral escrito na prosa contra a fonte. */
const POR_EXTENSO = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
]

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

  it('a contagem de estados do resumo vem de STATUS_ORDEM, não escrita à mão', () => {
    expect(pagina('status-do-ativo').resumo).toContain(`Os ${STATUS_ORDEM.length} estados`)
    expect(fonteDoConteudo('status-do-ativo.ts')).toContain('STATUS_ORDEM.length')
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

  it('nomeia os tipos que têm caminho próprio, com o botão real de cada um', () => {
    const c = cru('tipos-de-movimentacao')
    expect(c).toContain('Devolver ao fornecedor')
    expect(c).toContain('Estornar')
    expect(c).toContain('Tipo de movimentação')
    const t = normal('tipos-de-movimentacao')
    expect(t).toContain(normalizarBusca('só aparecem as movimentações válidas para todos eles'))
    // Cada tipo que o formulário não oferece é NOMEADO pelo rótulo real: um novo
    // tipo de fluxo próprio muda a contagem e este teste cobra a prosa.
    const foraDoFormulario = [...TIPOS_FORA_DO_LOTE_MANUAL, 'estorno' as const]
    for (const tipo of foraDoFormulario) {
      expect(c, `tipo de fluxo próprio não citado: ${tipo}`).toContain(
        TIPO_META[tipo].rotulo,
      )
    }
    expect(c).toContain(`${foraDoFormulario.length} nunca aparecem na lista`)
  })

  it('as contagens de tipos vêm de TIPO_META, não escritas à mão', () => {
    const total = Object.keys(TIPO_META).length
    expect(pagina('tipos-de-movimentacao').resumo).toContain(`Os ${total} tipos`)
    expect(cru('tipos-de-movimentacao')).toContain(`Destes ${total} tipos`)
    expect(fonteDoConteudo('tipos-de-movimentacao.ts')).toContain(
      'Object.keys(TIPO_META).length',
    )
  })

  it('o efeito de cada tipo nomeia o estado por STATUS_META (nada digitado à mão)', () => {
    const src = fonteDoConteudo('tipos-de-movimentacao.ts')
    expect(src).toContain('STATUS_META')
    for (const s of STATUS_ORDEM) {
      expect(src, `rótulo de status digitado à mão: ${s}`).not.toContain(
        `Resultado: ${STATUS_META[s].rotulo}`,
      )
    }
    // …e o texto renderizado continua trazendo o rótulo real de cada destino:
    // todo estado do domínio é o resultado de algum tipo.
    const c = cru('tipos-de-movimentacao')
    for (const s of STATUS_ORDEM) {
      expect(c, `estado ausente da prosa: ${s}`).toContain(
        `Resultado: ${STATUS_META[s].rotulo}`,
      )
    }
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

  it('o tamanho de página das movimentações é lido de MOV_PAGE_SIZE', () => {
    expect(cru('limites-e-atalhos')).toContain(`${MOV_PAGE_SIZE}, fixo`)
    expect(fonteDoConteudo('limites-e-atalhos.ts')).toContain('MOV_PAGE_SIZE')
  })

  // F29/REL-05a — mesma regra de ouro do limite acima: o número da doc sai da
  // constante, não de um literal digitado que envelhece calado.
  it('o tamanho de página dos relatórios gerados é lido de GERADOS_PAGE_SIZE', () => {
    expect(cru('limites-e-atalhos')).toContain(`${GERADOS_PAGE_SIZE}, fixo`)
    expect(fonteDoConteudo('limites-e-atalhos.ts')).toContain('GERADOS_PAGE_SIZE')
    expect(fonteDoConteudo('relatorios-gerados.ts')).toContain('GERADOS_PAGE_SIZE')
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

  it('promete a guarda de janela aberta só para os atalhos que a cumprem', () => {
    // `atalho-global.tsx` chama `modalAberto()` antes de tratar N e ?; o handler
    // do L (lancar-item-dialog.tsx) NÃO chama — e /itens tem a confirmação
    // "Estornar lançamento". A nota de fecho não pode prometer pelos três.
    expect(t).not.toContain(
      normalizarBusca(
        'Nenhum atalho de letra dispara enquanto você digita num campo nem com uma janela de confirmação aberta',
      ),
    )
    const l = blocos('limites-e-atalhos', 'atalhos')[0].itens.find((a) => a.teclas === 'L')
    expect(l?.observacao, 'o L precisa dizer que a guarda de modal não vale para ele').toContain(
      'Estornar lançamento',
    )
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
  // F24 — os dois textos de duplicidade de identidade ganharam "nesta filial": desde a
  // migration 0091 a identidade é POR FILIAL, e a colisão deixou de significar "existe em
  // algum lugar do sistema". O par em outra filial passou a ser possível — e vira conflito.
  'Já existe um ativo com esse patrimônio e service tag nesta filial.',
  'Este ativo já tem service tag — ela é imutável (identidade do equipamento).',
  'Já existe um registro com esses dados. Atualize a página e tente de novo.',
  'Um dos valores informados (motivo ou filial) não existe mais.',
  // Import de startup
  'Já existe um ativo sem patrimônio com essa service tag nesta filial — a service tag é a identidade quando não há patrimônio.',
  'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.',
  'A importação demorou demais e foi cancelada — tente novamente ou avise o TI.',
  'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.',
  'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.',
  'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.',
  'O arquivo precisa ter extensão .csv ou .xlsx.',
  'Filial inativa: import bloqueado.',
  // Sessão e acesso
  // F21: a antiga "Sem permissão para esta operação. Faça login novamente." saiu
  // do código — com cargos, mandar relogar MENTIA (quem é consulta, ou operador
  // sem a filial, pode relogar mil vezes e nada muda). O texto novo diz o que
  // fazer de verdade, e as negativas por cargo/vínculo entram catalogadas.
  'Sem permissão para esta operação: seu cargo ou suas filiais de escrita não permitem. Se seu acesso mudou agora, recarregue a página; se não, fale com um administrador.',
  'Seu cargo é de consulta (somente leitura): você pode consultar tudo, mas não registrar alterações.',
  'Esta ação é restrita a administradores.',
  'Você não tem permissão de escrita nesta filial. Fale com um administrador.',
  'O lote inclui filial em que você não tem permissão de escrita. Fale com um administrador.',
  'Seu acesso foi desativado. Fale com um administrador.',
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

  // A lista acima é escrita à mão de propósito (é o TEXTO EXATO da tela), então
  // ela envelhece em silêncio quando alguém edita a mensagem no código. Para as
  // negativas de acesso da F21 existe uma fonte única — as constantes MSG_* de
  // `src/lib/auth/acesso.ts` —, e este teste as LÊ do arquivo e cobra cada uma
  // aqui. Ler a fonte, e não importar o módulo: `acesso.ts` é só-servidor
  // (`import 'server-only'`) e importá-lo derrubaria toda esta suíte.
  it('cataloga as mensagens de acesso EXATAMENTE como acesso.ts as define', () => {
    const fonteAcesso = readFileSync(
      join(process.cwd(), 'src', 'lib', 'auth', 'acesso.ts'),
      'utf8',
    )
    const mensagens = [...fonteAcesso.matchAll(/export const (MSG_[A-Z_]+)\s*=\s*'([^']*)'/g)]
    // Se o casamento voltar vazio, o teste viraria fachada: quatro é o que a F21
    // criou (sessão expirada, desativado, somente leitura, só admin).
    expect(mensagens.length, 'nenhuma MSG_* encontrada em acesso.ts').toBeGreaterThanOrEqual(4)
    for (const [, nome, texto] of mensagens) {
      expect(c, `${nome} não está catalogada em mensagens-de-erro`).toContain(
        JSON.stringify(texto).slice(1, -1),
      )
    }
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

  it('não cobra destino da reserva (a regra é só de saída e empréstimo)', () => {
    // `movimentacaoSchema`: o superRefine que emite "Informe o colaborador ou o
    // setor de destino" só roda para `saida` e `emprestimo`; `reserva` tem os
    // dois campos como opcionais.
    expect(c).toContain('Saída e empréstimo precisam de um destino')
    expect(normal('mensagens-de-erro')).not.toContain(
      normalizarBusca('Saída, empréstimo e reserva precisam'),
    )
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

  // Os rótulos dos presets vêm de `PRESETS` (a fonte que a barra do relatório
  // renderiza), e não de uma lista digitada aqui: preset novo sem documentação
  // quebra o teste, que é exatamente o que aconteceu com "Semana passada" (F29).
  it('nomeia os presets de período e as abas de filial com o rótulo real', () => {
    const c = cru('relatorio-ao-vivo')
    for (const p of PRESETS) {
      expect(c, `rótulo de preset ausente: ${p.rotulo}`).toContain(p.rotulo)
    }
    for (const rotulo of ['Personalizado', 'Aplicar período', 'Consolidado']) {
      expect(c, `rótulo ausente: ${rotulo}`).toContain(rotulo)
    }
  })

  it('lista os indicadores do topo com o rótulo real do componente, e na conta certa', () => {
    const c = cru('relatorio-ao-vivo')
    // A lista vem do COMPONENTE que desenha os tiles, não de literais repetidos
    // aqui: um tile novo (ou renomeado) em kpi-tiles.tsx derruba este teste.
    const rotulos = rotulosDe('src/components/relatorios/kpi-tiles.tsx', 'TILES')
    expect(rotulos.length, 'nenhum tile lido do componente').toBeGreaterThan(0)
    for (const rotulo of rotulos) {
      expect(c, `KPI ausente: ${rotulo}`).toContain(rotulo)
    }
    // E o numeral escrito na prosa acompanha a contagem real.
    expect(c, 'a contagem por extenso não bate com os tiles reais').toContain(
      `Os ${POR_EXTENSO[rotulos.length]} indicadores do topo`,
    )
  })

  it('diz que a semana abre até HOJE, nunca até o sábado que não chegou', () => {
    // periodo.ts: `case 'semana': { de: domingo, ate: hoje }` — o intervalo NUNCA
    // termina no sábado, e o subtítulo da tela mostra `de a ate`.
    expect(t).toContain(normalizarBusca('até HOJE'))
    // F29 — a proibição de "de domingo a sábado" era uma varredura no texto
    // INTEIRO, e deixou de servir quando o preset "Semana passada" entrou: ele é
    // a semana FECHADA, e descrevê-lo assim é o correto. A guarda passou a ser
    // sobre a frase que de fato erraria — "Esta semana" indo até sábado.
    expect(t).toContain(normalizarBusca('"Esta semana" conta de domingo até hoje'))
    expect(t).not.toContain(normalizarBusca('"Esta semana" conta de domingo a sábado'))
    expect(t).not.toContain(normalizarBusca('esta semana vai de domingo a sábado'))
  })

  // F29/REL-03 — a dualidade de janela é decisão registrada (T11 segue aberta), e a
  // documentação é o único lugar onde o operador a encontra: se alguém "unificar" as
  // duas superfícies sem atualizar o texto, é aqui que aparece.
  it('avisa que o preset da tela e a janela do "Gerar relatório" são diferentes', () => {
    expect(t).toContain(normalizarBusca('Semana passada'))
    expect(t).toContain(normalizarBusca('de segunda a sexta'))
    expect(t).toContain(normalizarBusca('recorte do e-mail semanal'))
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

  it('não chama de "bucket"/"balde" o que a tela chama de bloco, tipo ou aba', () => {
    const n = normalizarBusca(texto)
    for (const termo of ['bucket', 'balde']) {
      expect(n.includes(termo), `palavra de desenvolvedor: "${termo}"`).toBe(false)
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

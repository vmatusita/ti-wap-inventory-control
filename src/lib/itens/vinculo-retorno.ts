// A regra §C.3 da F38: quando o `retorno` carrega o vínculo com a pessoa, e
// quando ele é gravado SEM ele.
//
// ---------------------------------------------------------------------------
// A ARMADILHA QUE ESTA FUNÇÃO DESARMA
// ---------------------------------------------------------------------------
// A migration 0118 acrescentou um teto novo em `valida_lancamento_item`: um
// `retorno` que NOMEIA uma pessoa não pode exceder o que aquela pessoa tem daquele
// item naquela filial. É a guarda certa — e ela cria um problema em cima do
// passado.
//
// Equipamento entregue ANTES desta fase não tem `saida` vinculada a ninguém: a
// pessoa tem saldo ZERO. Uma devolução conferida pelo checklist seria RECUSADA
// pelo banco — matando o D12, cuja premissa é "entrega antiga funciona igual".
//
// A REGRA, decisão da ordem F38 (§C.3): a linha de devolução só carrega
// `colaborador_id` quando a pessoa tem saldo registrado SUFICIENTE daquele item
// naquela filial. Não tendo, o `retorno` é gravado **sem o vínculo** — repõe o
// estoque igual, sem inventar dívida nem recusar a conferência. A tela diz,
// discretamente, qual dos dois aconteceu.
//
// Isto NÃO é contornar a guarda: é escolher, na aplicação, entre duas gravações
// que o banco aceita — uma que abate a conta da pessoa e outra que não a menciona.
// A guarda continua sendo a linha que vale: se a aplicação errar e mandar o
// vínculo sem saldo, o banco recusa, e está certo.

/** Um saldo por pessoa, do jeito que `rel_saldo_colaborador` devolve. */
export type SaldoDaPessoa = {
  item_id: number
  filial_id: number
  com_a_pessoa: number
}

export type DecisaoVinculo = {
  /** O id a gravar em `lancamentos_item.colaborador_id` — ou `null`. */
  colaboradorId: string | null
  /** Por que ele ficou de fora. `null` quando o vínculo foi mantido. */
  motivoSemVinculo: MotivoSemVinculo | null
}

export type MotivoSemVinculo = 'sem_pessoa' | 'sem_cadastro' | 'sem_saldo'

/** O que a tela mostra, discretamente, em cada caso. */
export const MOTIVO_SEM_VINCULO_TEXTO: Record<MotivoSemVinculo, string> = {
  sem_pessoa: 'Devolução sem pessoa informada — repõe o estoque, sem baixar conta de ninguém.',
  sem_cadastro:
    'Esta pessoa ainda não está no cadastro — repõe o estoque, sem baixar conta de ninguém.',
  sem_saldo:
    'Este item não estava registrado com esta pessoa — repõe o estoque do mesmo jeito, sem inventar dívida.',
}

/** O texto quando o vínculo FOI mantido (a conta da pessoa baixa). */
export const COM_VINCULO_TEXTO = 'Baixa da conta desta pessoa e volta para a prateleira.'

/**
 * Decide o vínculo de UMA linha de retorno.
 *
 * `saldos` é o que `rel_saldo_colaborador` devolveu para aquela pessoa — a lista
 * inteira, não um pré-filtro: quem filtra é esta função, pelo par (item, filial).
 */
export function decidirVinculoRetorno(args: {
  colaboradorId: string | null | undefined
  itemId: number
  filialId: number
  quantidade: number
  saldos: readonly SaldoDaPessoa[]
  /** Se a linha sequer nomeia alguém (texto vazio no formulário). */
  temNome?: boolean
}): DecisaoVinculo {
  const { colaboradorId, itemId, filialId, quantidade, saldos } = args
  const temNome = args.temNome ?? true

  if (!temNome) return { colaboradorId: null, motivoSemVinculo: 'sem_pessoa' }
  if (!colaboradorId) return { colaboradorId: null, motivoSemVinculo: 'sem_cadastro' }

  const saldo =
    saldos.find((s) => s.item_id === itemId && s.filial_id === filialId)?.com_a_pessoa ?? 0

  if (saldo < quantidade) return { colaboradorId: null, motivoSemVinculo: 'sem_saldo' }
  return { colaboradorId, motivoSemVinculo: null }
}

/**
 * A mesma decisão para um LOTE de linhas — e aqui há um detalhe que a versão
 * linha-a-linha não vê: duas linhas do mesmo par (item, filial) na mesma
 * transação **consomem o mesmo saldo**. Decidindo cada uma isoladamente contra o
 * saldo inicial, as duas se dariam por cobertas e a segunda seria recusada pelo
 * banco. Esta função debita o saldo à medida que decide.
 */
export function decidirVinculosDoLote<L extends { itemId: number; filialId: number; quantidade: number }>(
  linhas: readonly L[],
  args: {
    colaboradorId: string | null | undefined
    saldos: readonly SaldoDaPessoa[]
    temNome?: boolean
  },
): (L & DecisaoVinculo)[] {
  const restante = new Map<string, number>()
  for (const s of args.saldos) restante.set(`${s.item_id}|${s.filial_id}`, s.com_a_pessoa)

  return linhas.map((linha) => {
    const chave = `${linha.itemId}|${linha.filialId}`
    const disponivel = restante.get(chave) ?? 0
    const decisao = decidirVinculoRetorno({
      colaboradorId: args.colaboradorId,
      itemId: linha.itemId,
      filialId: linha.filialId,
      quantidade: linha.quantidade,
      saldos: [{ item_id: linha.itemId, filial_id: linha.filialId, com_a_pessoa: disponivel }],
      temNome: args.temNome,
    })
    if (decisao.colaboradorId) restante.set(chave, disponivel - linha.quantidade)
    return { ...linha, ...decisao }
  })
}

/**
 * De ONDE sai a pessoa de uma linha de item — e a resposta difere entre os dois
 * caminhos, o que é exatamente o tipo de sutileza que some numa expressão inline.
 *
 *   ENTREGA (`saida`)   → do campo Colaborador do formulário. É para ELE que o
 *                         acessório está indo.
 *   DEVOLUÇÃO (`retorno`) → do DETENTOR ATUAL do ativo. O formulário de devolução
 *                         **não tem** campo Colaborador (`CAMPOS_POR_TIPO` não o
 *                         inclui para esse tipo), então ler o campo ali devolve
 *                         sempre `null` — e a conta da pessoa jamais baixaria numa
 *                         devolução, que é justamente o que a frente C existe para
 *                         fazer. Foi um furo real, achado percorrendo a tela.
 *
 * ⚠ O detentor tem de ser lido ANTES do INSERT: `aplicar_movimentacao` zera
 * `ativos.colaborador_atual` assim que a devolução entra.
 */
export function pessoaDaLinhaDeItem(args: {
  tipo: 'saida' | 'retorno'
  /** O que o operador digitou no campo Colaborador (entrega). */
  colaboradorDoFormulario: string | null | undefined
  /** Quem está com o ativo hoje (devolução). */
  detentorAtual: string | null | undefined
}): string | null {
  const bruto =
    args.tipo === 'retorno' ? args.detentorAtual : args.colaboradorDoFormulario
  const limpo = (bruto ?? '').trim()
  return limpo || null
}

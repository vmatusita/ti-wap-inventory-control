'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirEscrita, exigirEscritaEm, exigirPapel } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  loteComItensSchema,
  estornoActionSchema,
  mesmaServiceTag,
  parsearLoteColado,
  type ItemJuntoInput,
  type MovimentacaoInput,
} from '@/lib/validators/movimentacao'
import {
  MOTIVO_SEM_VINCULO_TEXTO,
  decidirVinculosDoLote,
  pessoaDaLinhaDeItem,
  type SaldoDaPessoa,
} from '@/lib/itens/vinculo-retorno'
import { avisoDeRegularizacao, textoDaRegularizacao } from '@/lib/itens/regularizacao'
import {
  buscarAtivosParaCombobox,
  buscarAtivosPorPatrimonios,
  buscarAtivosResumoPorIds,
  type AtivoResumo,
} from '@/lib/queries/ativos'
import {
  possiveisDuplicatasDoDia,
  sugestoesSetores,
  ultimosAtivosMovimentadosDoOperador,
  type ParMovimentacaoDia as ParMovimentacaoDiaQuery,
  type PossivelDuplicataDia as PossivelDuplicataDiaQuery,
} from '@/lib/queries/movimentacoes'
import {
  resolverColaboradoresPorNome,
  sugestoesDoCampoColaborador,
  type SugestoesColaborador as SugestoesColaboradorQuery,
} from '@/lib/queries/colaboradores'
import { chaveColaborador } from '@/lib/colaboradores/chave'
import { saldosPorColaborador } from '@/lib/queries/itens'
import { planejarEstorno } from '@/lib/itens/estorno'
import type { StatusAtivo, TipoLancamento } from '@/lib/dominio'
import type { Json } from '@/lib/types/database'

// Re-export dos tipos do CONTRATO §1.5 (OS-F10): o fluxo de movimentação roda em
// Client Component e só pode importar deste módulo — `src/lib/queries/**` é
// server-only.
//
// A FORMA IMPORTA — não troque por `export type { … }` (F13/B2).
// `export type { A, B }` é um re-export COM ESPECIFICADORES, e o transform de
// Server Actions do Next/Turbopack ignora o `type` nessa forma: emite `A` e `B`
// em `ensureServerEntryExports([…])` e `registerServerReference(…)` — enquanto o
// `import type` correspondente já foi apagado. Sem binding nenhum, o módulo
// INTEIRO morre com `ReferenceError: A is not defined` na avaliação, levando
// junto todas as Server Actions daqui (e, porque o layout do grupo `(app)` puxa
// uma delas, as de toda rota logada). Foi o defeito B1+B2 da F13, ~20h em
// produção sem falhar build, lint nem teste.
// O ALIAS INLINE abaixo (`export type X = Y`) é apagado corretamente — é a
// forma segura, e a única aceita aqui.
// Guarda automática: `src/lib/use-server-exports.ts` (+ teste).
export type ParMovimentacaoDia = ParMovimentacaoDiaQuery
export type PossivelDuplicataDia = PossivelDuplicataDiaQuery
export type SugestoesColaborador = SugestoesColaboradorQuery

type ServerClient = Awaited<ReturnType<typeof createClient>>

// ---------------------------------------------------------------------------
// Resultado do lote — TUDO OU NADA desde a F38 (decisão do Johnny, 28/08/2026).
// ---------------------------------------------------------------------------
// Até a F37 o lote era gravado num `for` de INSERTs, cada um a própria transação:
// uma transição inválida no 18º de 30 deixava 17 gravadas e 13 fora, e o operador
// reconciliava à mão. Agora o lote inteiro passa por
// `criar_movimentacao_com_itens` (0117): **ou tudo, ou nada**.
//
// O QUE ISSO MUDA NESTE TIPO, e por que os campos continuam aqui:
//   · `criadas` é 0 sempre que `ok` é false. Não existe mais "meio lote".
//   · `resultados` sobrevive porque a tela ainda precisa apontar QUAL linha
//     derrubou o lote — só que agora TODAS vêm com `ok: false` quando algo falha,
//     e só a culpada carrega o erro de verdade.
//   · `linhaQueFalhou` é o índice dela, extraído do `detail` que a RPC anexa.
export type ItemResultado = {
  index: number
  ativo_id: string
  ok: boolean
  movimentacao_id?: string
  erro?: string
}

export type RegistrarLoteResult = {
  ok: boolean
  criadas: number
  resultados: ItemResultado[]
  erroGeral?: string
  /** F38: quantos lançamentos de item nasceram junto com o lote. */
  itensLancados?: number
  /** F38: índice (base 0) da linha que derrubou o lote inteiro, quando há uma. */
  linhaQueFalhou?: number
  /** F38: por que uma linha de item saiu sem vínculo com a pessoa (§C.3). */
  avisosVinculo?: string[]
  /**
   * F41 — a linha discreta sobre o que entrou no estoque por ACERTO AUTOMÁTICO,
   * quando entrou. Vem do que a RPC de fato gravou (`regularizacoes` /
   * `unidades_regularizadas` no jsonb de retorno), nunca de uma previsão da
   * aplicação: dizer "2 acessórios entraram" sem ter contado seria inventar.
   * `undefined` quando não houve acerto nenhum — e aí a tela não diz nada.
   */
  avisoRegularizacao?: string
}

// O `detail` que a 0117 anexa aos erros para dizer QUAL linha derrubou o lote.
// Formato: `f38_linha=<índice base 0>` (movimentação) ou `f38_item=<índice>`.
const MARCA_LINHA = /f38_linha=(\d+)/
const MARCA_ITEM = /f38_item=(\d+)/

function linhaDoDetalhe(detalhe: string | null | undefined): number | undefined {
  const m = MARCA_LINHA.exec(detalhe ?? '')
  return m ? Number(m[1]) : undefined
}

function itemDoDetalhe(detalhe: string | null | undefined): number | undefined {
  const m = MARCA_ITEM.exec(detalhe ?? '')
  return m ? Number(m[1]) : undefined
}

/** A linha que não é a culpada: nada foi gravado, e o texto diz isso sem rodeio. */
const NADA_GRAVADO = 'Não foi gravada — o lote inteiro foi recusado.'

type AtivoBasico = {
  id: string
  filial_id: number
  status: StatusAtivo
  // F38 — quem está com o ativo HOJE. Na DEVOLUÇÃO é daqui que sai a pessoa do
  // `retorno`: o formulário de devolução NÃO coleta Colaborador (o campo nem
  // aparece — `CAMPOS_POR_TIPO` não o inclui para esse tipo), e quem devolve é o
  // detentor. Ler `item.colaborador` ali daria sempre null, e a conta por pessoa
  // nunca baixaria na devolução — o furo que a verificação em tela encontrou.
  colaborador_atual: string | null
}

// Monta a row de INSERT de uma movimentacao a partir do item validado + o estado
// corrente do ativo. Os campos condicionais (motivo/colaborador/setor) sao lidos
// por narrowing da uniao discriminada (`'campo' in item`), sem escape de tipo; os
// comuns (chamado/observacao/termo_*) vem do base do schema.
//
// F37 — `vinculos` e o mapa chave-normalizada -> id do cadastro de pessoas, resolvido
// UMA VEZ para o lote inteiro (nunca uma consulta por linha). O modelo e HIBRIDO: o
// TEXTO continua sendo gravado exatamente como antes (e o retrato da epoca, doutrina
// da casa) e o `colaborador_id` entra AO LADO dele quando a chave resolve. Nome que
// nao esta no cadastro nao bloqueia nada: grava com id nulo, como sempre gravou.
//
// F38 — a row deixou de carregar `filial_id`. Quem a deriva agora é a RPC 0117, do
// ativo lido SOB A TRAVA, dentro da mesma transação: entre a leitura desta action e
// o INSERT, o ativo pode ter sido transferido por outra sessão, e numa transação
// única isso deixou de ser aceitável em silêncio. Uma fonte só.
function montarRow(item: MovimentacaoInput, uid: string, vinculos: Map<string, string>) {
  const colaborador = ('colaborador' in item ? item.colaborador : undefined) ?? null
  return {
    ativo_id: item.ativo_id,
    tipo: item.tipo,
    motivo: ('motivo' in item ? item.motivo : undefined) ?? null,
    data: item.data,
    filial_destino_id:
      item.tipo === 'transferencia' ? item.filial_destino_id : null,
    colaborador,
    // F37/D5 — o vínculo com o cadastro, sempre anulável. Resolvido pela chave
    // normalizada do próprio texto acima: quem escolheu da lista resolve, quem
    // digitou "joão  silva" para o cadastro "João Silva" também, e quem digitou um
    // nome que não existe salva do mesmo jeito com id nulo.
    colaborador_id: vinculos.get(chaveColaborador(colaborador)) ?? null,
    setor: ('setor' in item ? item.setor : undefined) ?? null,
    chamado: item.chamado ?? null,
    // F14/MN1: chamado do fornecedor — só o envio_manutencao o carrega (narrowing).
    chamado_fornecedor:
      ('chamado_fornecedor' in item ? item.chamado_fornecedor : undefined) ?? null,
    termo_assinado: item.termo_assinado ?? null,
    termo_data: item.termo_data ?? null,
    itens_faltantes:
      item.tipo === 'devolucao' ? item.itens_faltantes ?? [] : null,
    observacao: item.observacao ?? null,
    // Ajuste: o trigger LE o status_resultante; nos demais ele o CALCULA.
    status_resultante: item.tipo === 'ajuste' ? item.status_resultante : null,
    criado_por: uid,
  }
}

// A primeira linha de validação do lote, ANTES de gravar: erra rápido e com a
// mensagem certa, em vez de deixar o banco recusar com um código cru.
//
// ⚠ Ela NÃO substitui a validação do banco, e nem tenta: o estado do ativo pode
// mudar entre esta leitura e a transação. A do banco é a que vale — esta existe
// para que o operador conserte ANTES de perder o lote inteiro (§B.2 da ordem F38).
function conferirLoteAntesDeGravar(
  itens: MovimentacaoInput[],
  ativoPorId: Map<string, AtivoBasico>,
): { index: number; erro: string } | null {
  for (let index = 0; index < itens.length; index++) {
    const item = itens[index]
    const ativo = ativoPorId.get(item.ativo_id)
    if (!ativo) return { index, erro: 'Ativo não encontrado.' }
    if (item.tipo === 'transferencia' && item.filial_destino_id === ativo.filial_id) {
      return { index, erro: 'A filial de destino deve ser diferente da atual.' }
    }
  }
  return null
}

// Todas as linhas recusadas de uma vez: a culpada com o motivo verdadeiro, as
// outras dizendo que nada foi gravado. Nunca sobra a impressão de meio lote.
function loteInteiroRecusado(
  itens: MovimentacaoInput[],
  culpada: number | undefined,
  erro: string,
  erroGeral?: string,
): RegistrarLoteResult {
  return {
    ok: false,
    criadas: 0,
    resultados: itens.map((item, index) => ({
      index,
      ativo_id: item.ativo_id,
      ok: false,
      erro: index === culpada ? erro : NADA_GRAVADO,
    })),
    erroGeral: erroGeral ?? (culpada === undefined ? erro : undefined),
    linhaQueFalhou: culpada,
  }
}

// Registra um LOTE de 1..MAX_LOTE_MOVIMENTACAO movimentacoes (o teto e do
// `loteMovimentacaoSchema`, re-validado aqui), inserindo uma a uma em ordem. Se o
// banco rejeitar alguma (transicao invalida), interrompe e devolve o que entrou
// mais o item que falhou (as anteriores ja estao commitadas — cada insert e uma
// transacao). OS-F2 3.4.1.
export async function registrarMovimentacoes(input: {
  itens: MovimentacaoInput[]
  /** F38 · D13 — os periféricos que vão (ou voltam) junto. Opcional. */
  itensJunto?: ItemJuntoInput[]
}): Promise<RegistrarLoteResult> {
  const parsed = loteComItensSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      criadas: 0,
      resultados: [],
      erroGeral: 'Há campos inválidos no lote. Revise os itens.',
    }
  }

  const supabase = await createClient()
  // Cargo primeiro (sessão, desativação, `consulta`); o vínculo de filial só depois de
  // ler o estado corrente dos ativos, que é de onde sai a filial de ORIGEM de cada
  // linha — ver o comentário longo em actions/ativos.ts.
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) {
    return { ok: false, criadas: 0, resultados: [], erroGeral: cargo.erro }
  }

  const itens = parsed.data.itens

  // Um ativo não pode aparecer duas vezes no MESMO lote: o estado corrente é lido
  // uma vez (mapa abaixo) e não é reidratado durante o loop, então uma 2ª linha
  // do mesmo ativo usaria filial/estado obsoletos. A UI já deduplica; aqui é a
  // barreira da Server Action contra payload forjado.
  const idsDoLote = [...new Set(itens.map((i) => i.ativo_id))]
  if (idsDoLote.length !== itens.length) {
    return {
      ok: false,
      criadas: 0,
      resultados: [],
      erroGeral: 'O lote não pode repetir o mesmo ativo. Registre em lotes separados.',
    }
  }

  // Estado corrente de cada ativo (filial de origem + status atual).
  const { data: ativosData, error: ativosErr } = await supabase
    .from('ativos')
    .select('id, filial_id, status, colaborador_atual')
    .in('id', idsDoLote)
  if (ativosErr) {
    return {
      ok: false,
      criadas: 0,
      resultados: [],
      erroGeral: traduzErroBanco(ativosErr.message, ativosErr.code),
    }
  }
  const ativoPorId = new Map<string, AtivoBasico>(
    (ativosData ?? []).map((a) => [a.id, a as AtivoBasico]),
  )

  // Vínculo de escrita em TODAS as filiais tocadas pelo lote. Desde a F38 quem grava
  // `filial_id` é a RPC 0117, derivando-a do ativo lido SOB A TRAVA — e é esse valor
  // que a policy de INSERT de `movimentacoes` avalia. Esta conferência continua aqui
  // pela MENSAGEM (sem ela vem o 42501 cru) e porque erra antes de abrir transação.
  // O lote é recusado inteiro: gravar as linhas permitidas e
  // recusar as outras deixaria o operador com meia transferência registrada.
  //
  // TRANSFERENCIA_EXIGE_VINCULO_DESTINO = nao (§0 da ordem F21): `filial_destino_id`
  // NÃO entra no conjunto — mandar equipamento para outra filial é o fluxo normal, e
  // quem recebe é outro operador. Se o parâmetro virar `sim`, é aqui E na policy da 0063.
  //
  // Lote sem nenhum ativo visível cai no cargo já resolvido: assim cada linha continua
  // recebendo 'Ativo não encontrado.' no loop, em vez de um erroGeral sobre filial.
  const filiaisDoLote = (ativosData ?? []).map((a) => a.filial_id)
  const aut =
    filiaisDoLote.length > 0 ? await exigirEscritaEm(supabase, filiaisDoLote) : cargo
  if (!aut.ok) {
    return { ok: false, criadas: 0, resultados: [], erroGeral: aut.erro }
  }
  const uid = aut.uid

  // F37/D5 — o vínculo com o cadastro de pessoas, resolvido UMA VEZ para o lote
  // inteiro (uma consulta, não uma por linha). Nunca lança: se a resolução falhar, o
  // mapa vem vazio, as linhas gravam `colaborador_id` nulo e o lote segue. O vínculo
  // é um bônus — derrubar a movimentação do operador por causa dele seria trocar o
  // essencial pelo acessório.
  //
  // F38 — os DETENTORES ATUAIS entram na mesma resolução. Na devolução a pessoa do
  // `retorno` não vem do formulário (que não tem o campo), e sim do ativo; sem
  // esses nomes aqui, o mapa não teria a chave e o vínculo nunca resolveria.
  const vinculos = await resolverColaboradoresPorNome(supabase, [
    ...itens.map((i) => ('colaborador' in i ? i.colaborador : null)),
    ...(ativosData ?? []).map((a) => a.colaborador_atual),
  ])

  // Primeira linha: o que dá para conferir sem tocar o banco. A do banco continua
  // sendo a que vale; esta poupa o operador de perder o lote por algo óbvio.
  const problema = conferirLoteAntesDeGravar(itens, ativoPorId)
  if (problema) return loteInteiroRecusado(itens, problema.index, problema.erro)

  // F38 · D13 — os itens que vão junto. O tipo do lançamento é DERIVADO do tipo da
  // movimentação apontada (entrega → `saida`, devolução → `retorno`); o cliente não
  // o escolhe. Item apontando movimentação de outro tipo simplesmente não vira
  // lançamento — não é erro, é uma seção opcional que não se aplica àquela linha.
  const {
    payload: itensPayload,
    avisos,
    erro: erroDosItens,
  } = await montarItensJunto(supabase, itens, parsed.data.itensJunto, ativoPorId, vinculos)
  // Nada foi gravado ainda: recusar aqui é o lado seguro. O contrário — seguir com
  // o vínculo em branco — deixaria o acessório na conta da pessoa para sempre.
  if (erroDosItens) return loteInteiroRecusado(itens, undefined, erroDosItens)

  const { data: retorno, error: rpcErr } = await supabase.rpc(
    'criar_movimentacao_com_itens',
    {
      // O gerador de tipos declara `Json` para argumento jsonb; as duas listas
      // são objetos simples (string/number/null/array), então o cast é honesto.
      p_movimentacoes: itens.map((item) => montarRow(item, uid, vinculos)) as unknown as Json,
      p_itens: itensPayload as unknown as Json,
      p_criado_por: uid,
    },
  )

  if (rpcErr) {
    const culpada = linhaDoDetalhe(rpcErr.details)
    const itemCulpado = itemDoDetalhe(rpcErr.details)
    const mensagem = traduzErroBanco(rpcErr.message, rpcErr.code)
    if (culpada !== undefined) return loteInteiroRecusado(itens, culpada, mensagem)
    // Falhou por causa de um ITEM que ia junto (ou por algo do lote inteiro): não
    // há linha culpada a apontar, e o texto geral carrega o motivo verdadeiro.
    return loteInteiroRecusado(
      itens,
      undefined,
      mensagem,
      itemCulpado !== undefined
        ? `Nada foi gravado. O ${itemCulpado + 1}º item que ia junto foi recusado: ${mensagem}`
        : `Nada foi gravado. ${mensagem}`,
    )
  }

  const criadas = itens.length
  const rotasAtivos = new Set(itens.map((i) => i.ativo_id))
  const devolvido = retorno as {
    movimentacoes?: string[]
    regularizacoes?: number
    unidades_regularizadas?: number
  } | null
  const ids = devolvido?.movimentacoes ?? []
  // F41 — o que a RPC DE FATO gravou de acerto automático. Lido do retorno dela, na
  // mesma transação que gravou; contar aqui seria contar outra coisa.
  const regularizado = {
    linhas: devolvido?.regularizacoes ?? 0,
    unidades: devolvido?.unidades_regularizadas ?? 0,
  }
  const resultados: ItemResultado[] = itens.map((item, index) => ({
    index,
    ativo_id: item.ativo_id,
    ok: true,
    movimentacao_id: ids[index],
  }))

  if (criadas > 0) {
    revalidatePath('/ativos')
    revalidatePath('/movimentacoes/nova')
    for (const id of rotasAtivos) revalidatePath(`/ativos/${id}`)
    // A movimentacao MEXE na fila de pendencias: `devolucao` com itens_faltantes
    // abre uma linha por item em pendencias_item (trigger 0051) e `triagem_ok`
    // limpa a pendencia do ativo. Sem esta linha /pendencias era a unica tela
    // afetada que nao revalidava — ao contrario de corrigirPatrimonio,
    // definirServiceTag, confirmarAssinaturaTermo e resolverPendenciaItem.
    revalidatePath('/pendencias')
    // Saidas, devolucoes, transferencias etc. alimentam os relatorios ao vivo e
    // v_pendencias — revalida como fazem itens.ts/ativos.ts (senao o link do
    // relatorio serve dado obsoleto ao visualizador por senha).
    revalidatePath('/relatorios', 'layout')
    // F38: o lote pode ter mexido no estoque de itens por quantidade.
    if (itensPayload.length > 0) revalidatePath('/itens')
  }

  return {
    ok: true,
    criadas,
    resultados,
    itensLancados: itensPayload.length,
    avisosVinculo: avisos.length > 0 ? avisos : undefined,
    avisoRegularizacao:
      avisoDeRegularizacao(regularizado.unidades, regularizado.linhas) ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// F38 · D13 — os itens que vão junto: do que o wizard mandou ao payload da RPC.
// ---------------------------------------------------------------------------
// Duas coisas acontecem aqui, e nenhuma delas pode acontecer no cliente:
//
//  1. O TIPO DO LANÇAMENTO é derivado do tipo da movimentação apontada. Entrega
//     (`saida`/`emprestimo`) vira `saida` ("Liberação"); devolução vira `retorno`
//     ("Retorno"). Nenhum outro tipo de movimentação carrega item — a seção nem
//     aparece para eles, e um payload forjado que aponte para uma `transferencia`
//     simplesmente não gera lançamento.
//
//  2. A REGRA §C.3 do vínculo condicional, para as linhas de `retorno`: só carrega
//     `colaborador_id` quem tem saldo registrado suficiente daquele item naquela
//     filial. Equipamento entregue ANTES desta fase deixa a pessoa com saldo zero;
//     recusar a devolução ali mataria o D12 ("entrega antiga funciona igual"). Sem
//     saldo, o `retorno` é gravado sem o vínculo — repõe o estoque do mesmo jeito,
//     sem inventar dívida. A tela diz, discretamente, qual dos dois aconteceu.
async function montarItensJunto(
  supabase: ServerClient,
  itens: MovimentacaoInput[],
  itensJunto: ItemJuntoInput[],
  ativoPorId: Map<string, AtivoBasico>,
  vinculos: Map<string, string>,
): Promise<{ payload: Record<string, unknown>[]; avisos: string[]; erro?: string }> {
  if (itensJunto.length === 0) return { payload: [], avisos: [] }

  type Linha = ItemJuntoInput & {
    tipo: 'saida' | 'retorno'
    filialId: number
    itemId: number
    colaborador: string | null
    colaboradorId: string | null
    data: string
  }

  const linhas: Linha[] = []
  for (const j of itensJunto) {
    const mov = itens[j.indice]
    if (!mov) continue // o Zod da RPC recusaria; aqui o índice fora do lote só é ignorado
    const tipo =
      mov.tipo === 'saida' || mov.tipo === 'emprestimo'
        ? ('saida' as const)
        : mov.tipo === 'devolucao'
          ? ('retorno' as const)
          : null
    if (!tipo) continue
    const ativo = ativoPorId.get(mov.ativo_id)
    if (!ativo) continue
    // ⚠ De ONDE sai a pessoa, e por que difere entre os dois caminhos:
    //   ENTREGA  → do campo Colaborador do formulário (é para ELE que o item vai);
    //   DEVOLUÇÃO → do DETENTOR ATUAL do ativo. O formulário de devolução não tem
    //     campo Colaborador (`CAMPOS_POR_TIPO` não o inclui), então ler
    //     `mov.colaborador` ali daria sempre null e a conta da pessoa jamais
    //     baixaria numa devolução. O nome é lido do ativo ANTES do INSERT — depois
    //     dele, `aplicar_movimentacao` zera `colaborador_atual`.
    const colaborador = pessoaDaLinhaDeItem({
      tipo,
      colaboradorDoFormulario: 'colaborador' in mov ? mov.colaborador : null,
      detentorAtual: ativo.colaborador_atual,
    })
    linhas.push({
      ...j,
      tipo,
      itemId: j.item_id,
      filialId: ativo.filial_id,
      colaborador,
      colaboradorId: vinculos.get(chaveColaborador(colaborador)) ?? null,
      data: mov.data,
    })
  }

  if (linhas.length === 0) return { payload: [], avisos: [] }

  // A §C.3 só entra nas linhas de RETORNO, e o saldo é consultado UMA VEZ por
  // pessoa (nunca uma consulta por linha).
  const avisos: string[] = []
  const retornos = linhas.filter((l) => l.tipo === 'retorno' && l.colaboradorId)
  const decisao = new Map<Linha, string | null>()

  if (retornos.length > 0) {
    const porPessoa = new Map<string, Linha[]>()
    for (const l of retornos) {
      const lista = porPessoa.get(l.colaboradorId!) ?? []
      lista.push(l)
      porPessoa.set(l.colaboradorId!, lista)
    }
    // ⚠ Falha de leitura NÃO vira "saldo zero": gravaria o `retorno` sem vínculo e
    // a conta da pessoa nunca baixaria — em silêncio, que é o furo que esta fase
    // fecha. Recusa o lote com a mensagem honesta (ver `saldosPorColaborador`).
    const lidos = await saldosPorColaborador(supabase, porPessoa.keys())
    if (!lidos.ok) return { payload: [], avisos: [], erro: lidos.erro }

    for (const [pessoaId, doPessoa] of porPessoa) {
      const decididas = decidirVinculosDoLote(
        doPessoa.map((l) => ({
          ref: l,
          itemId: l.itemId,
          filialId: l.filialId,
          quantidade: l.quantidade,
        })),
        {
          colaboradorId: pessoaId,
          saldos: (lidos.mapa.get(pessoaId) ?? []) as SaldoDaPessoa[],
        },
      )
      for (const d of decididas) {
        decisao.set(d.ref, d.colaboradorId)
        if (!d.colaboradorId && d.motivoSemVinculo) {
          const texto = MOTIVO_SEM_VINCULO_TEXTO[d.motivoSemVinculo]
          if (!avisos.includes(texto)) avisos.push(texto)
        }
      }
    }
  }

  // F41 — O NOME DO ITEM, para a justificativa do acerto automático se explicar
  // sozinha no diário. Uma consulta para o lote inteiro, nunca uma por linha; e a
  // falha NÃO bloqueia nada: sem o nome, `textoDaRegularizacao` escreve "item", que
  // é pior de ler mas não recusa a movimentação do equipamento — que é justamente o
  // que esta fase existe para não fazer mais.
  const nomes = new Map<number, string>()
  {
    const ids = [...new Set(linhas.map((l) => l.itemId))]
    const { data: itens, error } = await supabase
      .from('itens')
      .select('id, nome')
      .in('id', ids)
    if (error) {
      console.error('[montarItensJunto] falha ao ler o nome dos itens:', error.message)
    } else {
      for (const i of itens ?? []) nomes.set(i.id, i.nome)
    }
  }

  const payload = linhas.map((l) => ({
    indice_movimentacao: l.indice,
    item_id: l.itemId,
    tipo: l.tipo,
    quantidade: l.quantidade,
    data: l.data,
    colaborador: l.colaborador,
    colaborador_id:
      l.tipo === 'retorno' ? (decisao.has(l) ? decisao.get(l) : l.colaboradorId) : l.colaboradorId,
    // F41 — A JUSTIFICATIVA DO ACERTO AUTOMÁTICO, mandada SEMPRE.
    //
    // Quem decide se vai haver acerto é a RPC, sob a trava, lendo o saldo do par
    // (0126) — daqui não dá para saber. Então a frase vai em toda linha, mesmo
    // quando provavelmente não será usada: o custo de mandar à toa é uma string; o
    // de não mandar é a RPC recusar o lote inteiro por falta de justificativa
    // (`lanc_item_ajuste_obs`), que é exatamente o bug que esta fase acabou.
    //
    // A quantidade do texto é a da LINHA, não a partição: a RPC não redige texto e
    // não teria como reescrever o número. Dizer "1 unidade" quando o acerto foi de
    // 1 é o caso comum (o checklist manda sempre quantidade 1); nos raros casos em
    // que a entrega parte a quantidade, o texto nomeia o total pedido, e a linha do
    // ajuste mostra o número real ao lado. Preferi um texto levemente amplo a um
    // texto que a RPC precisasse compor — a regra da 0117 não se dobra por isso.
    observacao_regularizacao: textoDaRegularizacao(
      l.tipo === 'retorno' ? 'devolucao' : 'entrega',
      {
        itemRotulo: nomes.get(l.itemId) ?? null,
        quantidade: l.quantidade,
        colaborador: l.colaborador,
      },
    ),
  }))

  return { payload, avisos }
}

// ---------------------------------------------------------------------------
// Estorno da ULTIMA movimentacao (OS-F2 3.6). O trigger valida "so a ultima".
// ---------------------------------------------------------------------------
export async function estornarMovimentacao(input: {
  movimentacao_id: string
  observacao?: string
}): Promise<ActionResult> {
  const parsed = estornoActionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: 'Dados inválidos para o estorno.' }
  }

  const supabase = await createClient()
  // ESTORNO_OPERADOR = sim (§0 da ordem F21): estornar é a correção normal do dia a dia,
  // já restrita à última movimentação pelo trigger — operador estorna nas filiais
  // vinculadas, não é privilégio de admin.
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  // Movimentacao original -> ativo (e, dele, a filial corrente p/ o insert).
  const { data: mov, error: movErr } = await supabase
    .from('movimentacoes')
    .select('id, ativo_id, tipo')
    .eq('id', parsed.data.movimentacao_id)
    .maybeSingle()
  if (movErr) return { ok: false, erro: traduzErroBanco(movErr.message, movErr.code) }
  if (!mov) return { ok: false, erro: 'Movimentação não encontrada.' }

  const { data: ativo, error: ativoErr } = await supabase
    .from('ativos')
    .select('id, filial_id')
    .eq('id', mov.ativo_id)
    .single()
  if (ativoErr) return { ok: false, erro: traduzErroBanco(ativoErr.message, ativoErr.code) }

  // A filial do estorno é a CORRENTE do ativo (a mesma que vai no insert abaixo), não a
  // da movimentação estornada — se o ativo foi transferido depois, é onde ele está hoje
  // que decide quem pode mexer nele.
  const aut = await exigirEscrita(supabase, ativo.filial_id)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // F38 · §B.5 — o estorno passa a desfazer O CONJUNTO. Se a movimentação carregou
  // periféricos (0116), estornar sem tocá-los deixaria o acessório fora da
  // prateleira e na conta da pessoa para um evento que o sistema passou a dizer que
  // não aconteceu. Os inversos são calculados por `planejarEstorno` — a mesma
  // função pura que o estorno avulso de item usa desde a F3B — e gravados pela RPC
  // na MESMA transação. Se algum não puder ser gravado, a RPC recusa o estorno
  // inteiro: nunca meio estorno.
  const { data: itensDaMov, error: itensErr } = await supabase
    .from('lancamentos_item')
    // F41 — `regularizacao` entra na leitura porque `planejarEstorno` precisa dela
    // para redigir o inverso do ACERTO AUTOMÁTICO com o texto certo. A aritmética
    // não muda (ajuste positivo → ajuste negativo, como qualquer ajuste); o que
    // mudaria sem isto é o diário dizer "Estorno de ajuste" sobre um ajuste que o
    // operador nunca fez.
    .select(
      'id, item_id, filial_id, tipo, quantidade, chamado, observacao, colaborador, colaborador_id, regularizacao',
    )
    .eq('movimentacao_id', mov.id)
    .is('estorna_id', null)
  if (itensErr) return { ok: false, erro: traduzErroBanco(itensErr.message, itensErr.code) }

  const estornos = (itensDaMov ?? []).map((l) => {
    const plano = planejarEstorno(
      {
        tipo: l.tipo as TipoLancamento,
        quantidade: l.quantidade,
        chamado: l.chamado,
        observacao: l.observacao,
        regularizacao: l.regularizacao,
      },
      parsed.data.observacao ?? null,
    )
    return {
      estorna_id: l.id,
      item_id: l.item_id,
      filial_id: l.filial_id,
      tipo: plano.tipo,
      quantidade: plano.quantidade,
      chamado: plano.chamado,
      observacao: plano.observacao,
      colaborador: l.colaborador,
      colaborador_id: l.colaborador_id,
    }
  })

  // F38 · §C.3 tem de valer AQUI TAMBÉM — o estorno era o único caminho que
  // mandava o vínculo sem olhar saldo (achado da revisão de 29/08/2026). O inverso
  // de uma `saida` é um `retorno`, e a guarda da 0118 recusa `retorno` que exceda o
  // que a pessoa tem. Quando a conta dela já zerou por outro caminho, o estorno
  // inteiro morria com uma mensagem sobre saldo de acessório — para quem só queria
  // desfazer a movimentação do equipamento. Sem saldo, o inverso vai SEM o vínculo:
  // repõe a prateleira do mesmo jeito e não inventa dívida negativa.
  const retornos = estornos.filter((e) => e.tipo === 'retorno' && e.colaborador_id)
  if (retornos.length > 0) {
    const lidos = await saldosPorColaborador(
      supabase,
      retornos.map((e) => e.colaborador_id as string),
    )
    if (!lidos.ok) return { ok: false, erro: lidos.erro }
    for (const pessoaId of new Set(retornos.map((e) => e.colaborador_id as string))) {
      const doPessoa = retornos.filter((e) => e.colaborador_id === pessoaId)
      const decididas = decidirVinculosDoLote(
        doPessoa.map((e) => ({
          ref: e,
          itemId: e.item_id,
          filialId: e.filial_id,
          quantidade: e.quantidade,
        })),
        { colaboradorId: pessoaId, saldos: (lidos.mapa.get(pessoaId) ?? []) as SaldoDaPessoa[] },
      )
      for (const d of decididas) d.ref.colaborador_id = d.colaboradorId
    }
  }

  const { error: insertErr } = await supabase.rpc('estornar_movimentacao_com_itens', {
    p_movimentacao_id: mov.id,
    // '' e não null: o gerador de tipos declara `p_observacao text` (sem default),
    // então `null` não é atribuível. Os dois são EQUIVALENTES para a RPC, que faz
    // `nullif(btrim(coalesce(p_observacao, '')), '')` — a linha gravada é a mesma.
    // Achado da F41 ao rodar `db:types`: o database.ts estava velho e escondia isso.
    p_observacao: parsed.data.observacao ?? '',
    p_estornos: estornos as unknown as Json,
    p_criado_por: aut.uid,
  })

  if (insertErr) return { ok: false, erro: traduzErroBanco(insertErr.message, insertErr.code) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${mov.ativo_id}`)
  if (estornos.length > 0) revalidatePath('/itens')
  // O estorno RESTAURA pendencia/termo_assinado/termo_data do snapshot_anterior
  // (trigger, migration 0047) — ou seja, mexe direto no que a fila mostra.
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Busca de ativos p/ o combobox do fluxo de nova movimentacao (chamada do
// cliente com debounce). RLS garante que so o operador logado le.
// ---------------------------------------------------------------------------
export async function buscarAtivosParaMovimentacao(
  term: string,
): Promise<AtivoResumo[]> {
  try {
    return await buscarAtivosParaCombobox(term)
  } catch (err) {
    // Degrada para lista vazia (o combobox roda com debounce e nao deve derrubar
    // o fluxo por um hiccup transitorio), mas NAO silencia: registra no log do
    // servidor para que uma falha sistematica (RLS/config/rede) seja visivel.
    console.error('[buscarAtivosParaMovimentacao] falha na busca de ativos:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// F10 — PROXIES client→server do CONTRATO §1.5. Todas as leituras novas do fluxo
// de movimentacao passam por aqui: os passos do wizard sao Client Components e
// NAO podem importar `src/lib/queries/**` (server-only). Mesmo padrao (e mesma
// degradacao com log) de `buscarAtivosParaMovimentacao`.
// ---------------------------------------------------------------------------

// M1 — resultado do "Colar lista" no passo Ativos.
export type ResultadoResolucaoLote = {
  // Canal de erro do lote inteiro (ex.: acima do teto, falha de consulta). O
  // dialog exibe — nada de excecao atravessando a fronteira da action.
  erro?: string
  encontrados: AtivoResumo[]
  // Patrimonio duplicado (§5) colado SEM service tag: o operador escolhe. Nunca
  // ha escolha silenciosa.
  ambiguos: { patrimonio: string; candidatos: AtivoResumo[] }[]
  naoEncontrados: string[]
  invalidos: string[]
}

// Fabrica (nao constante): devolver a MESMA referencia de array em toda chamada
// deixaria o estado vazar entre requests se alguem mutasse o resultado.
function resolucaoVazia(): ResultadoResolucaoLote {
  return { encontrados: [], ambiguos: [], naoEncontrados: [], invalidos: [] }
}

// M1 — texto colado (um patrimonio por linha, service tag opcional apos
// virgula/`;`/TAB) => 4 baldes. NAO filtra por estado do ativo: a intersecao de
// tipos do wizard continua sendo o guarda. Dedup interno do texto e feito no
// parser; o dedup contra o lote ja montado e o teto ao adicionar sao da UI.
export async function resolverPatrimoniosParaLote(
  texto: string,
): Promise<ResultadoResolucaoLote> {
  const parse = parsearLoteColado(texto)
  if (parse.erro) {
    return { ...resolucaoVazia(), erro: parse.erro, invalidos: parse.invalidos }
  }
  if (parse.itens.length === 0) {
    return { ...resolucaoVazia(), invalidos: parse.invalidos }
  }

  try {
    const candidatosPorPatrimonio = new Map<string, AtivoResumo[]>()
    // Patrimonio nao-canonico (F7J) e buscado nas DUAS formas — normalizada e
    // exatamente como o operador colou: o `in` do PostgREST e case-sensitive e o
    // acervo tem patrimonio gravado fora do padrao, inclusive em minusculas. Nos
    // itens canonicos as duas formas coincidem e o Set colapsa.
    const chavesBusca = new Set<string>()
    for (const i of parse.itens) {
      chavesBusca.add(i.patrimonio)
      if (i.patrimonioComoColado) chavesBusca.add(i.patrimonioComoColado)
    }
    const ativos = await buscarAtivosPorPatrimonios([...chavesBusca])
    for (const a of ativos) {
      if (a.patrimonio === null) continue
      // Chave em MAIUSCULAS dos dois lados: o item ja vem normalizado e assim a
      // grafia gravada no banco nao decide se o ativo aparece ou nao.
      const chave = a.patrimonio.toUpperCase()
      const lista = candidatosPorPatrimonio.get(chave)
      if (lista) lista.push(a)
      else candidatosPorPatrimonio.set(chave, [a])
    }

    const encontrados: AtivoResumo[] = []
    const idsEncontrados = new Set<string>()
    const ambiguos = new Map<string, { patrimonio: string; candidatos: AtivoResumo[] }>()
    const naoEncontrados = new Set<string>()

    for (const item of parse.itens) {
      const candidatos = candidatosPorPatrimonio.get(item.patrimonio) ?? []
      if (candidatos.length === 0) {
        naoEncontrados.add(item.patrimonio)
        continue
      }

      let escolhido = candidatos.length === 1 ? candidatos[0] : undefined
      if (!escolhido && item.service_tag) {
        // Patrimonio duplicado COM service tag na linha: desempata direto.
        const casam = candidatos.filter((c) =>
          mesmaServiceTag(c.service_tag, item.service_tag),
        )
        if (casam.length === 1) escolhido = casam[0]
      }
      if (!escolhido) {
        if (!ambiguos.has(item.patrimonio)) {
          ambiguos.set(item.patrimonio, { patrimonio: item.patrimonio, candidatos })
        }
        continue
      }

      // Duas linhas podem apontar o MESMO ativo (uma com ST, outra sem) — o
      // lote nao aceita ativo repetido (a Server Action de escrita barra).
      if (idsEncontrados.has(escolhido.id)) continue
      idsEncontrados.add(escolhido.id)
      encontrados.push(escolhido)
    }

    return {
      encontrados,
      ambiguos: [...ambiguos.values()],
      naoEncontrados: [...naoEncontrados],
      invalidos: parse.invalidos,
    }
  } catch (err) {
    console.error('[resolverPatrimoniosParaLote] falha ao resolver o lote:', err)
    return {
      ...resolucaoVazia(),
      erro: 'Não foi possível consultar os ativos agora. Tente de novo.',
      invalidos: parse.invalidos,
    }
  }
}

// M3 — "Movimentados recentemente" no combobox (operador = o da sessao; o
// cliente nao escolhe de quem sao os recentes).
export async function buscarAtivosRecentesDoOperador(
  limite?: number,
): Promise<AtivoResumo[]> {
  try {
    const supabase = await createClient()
    // Piso da hierarquia, e nao `idOperador`: os tres cargos atendem por igual, e quem NAO
    // atende e o perfil DESATIVADO (papel_atual() devolve NULL) — que nao deve continuar
    // lendo o acervo por request direto ate o token expirar (mesma razao de `exportar.ts`).
    const aut = await exigirPapel(supabase, 'consulta')
    if (!aut.ok) return []
    return await ultimosAtivosMovimentadosDoOperador(aut.uid, limite ?? 8)
  } catch (err) {
    console.error('[buscarAtivosRecentesDoOperador] falha ao carregar recentes:', err)
    return []
  }
}

// M4/F37 — sugestões de colaborador. Guarda de 2 chars TAMBÉM aqui: não bater no
// banco por uma letra (a query repete a guarda; esta é a barata).
//
// F37/A.4 — o campo de colaborador passa a oferecer o CADASTRO, além do histórico, e
// a dizer se o que está digitado já é um cadastro (é isso que decide se a tela
// oferece "Cadastrar"). Degradação CALADA — o campo é texto livre e continua
// aceitando o que for digitado, aconteça o que acontecer com a rede.
//
// Esta action SUBSTITUIU a `buscarSugestoesColaboradores` (M4), removida na revisão
// de 28/08/2026: depois que wizard, contrapartida e o diálogo de lançamento de item
// passaram todos a usar `CampoColaborador`, nenhuma tela passava mais
// `campo="colaborador"` a `CampoComSugestoes` — a action antiga continuava alcançável
// pela rede sem nenhuma tela por trás, e duas implementações da mesma sugestão
// convidavam a corrigir a errada. `buscarSugestoesSetores` continua: setor não ganhou
// cadastro, e é o único uso restante do `CampoComSugestoes`.
export async function buscarColaboradoresDoCampo(
  prefixo: string,
): Promise<SugestoesColaborador> {
  const vazio: SugestoesColaborador = {
    cadastrados: [],
    historico: [],
    jaCadastrado: false,
  }
  if (prefixo.trim().length < 2) return vazio
  try {
    return await sugestoesDoCampoColaborador(prefixo)
  } catch (err) {
    console.error('[buscarColaboradoresDoCampo] falha ao carregar sugestões:', err)
    return vazio
  }
}

// M4 — sugestoes de setor.
export async function buscarSugestoesSetores(prefixo: string): Promise<string[]> {
  if (prefixo.trim().length < 2) return []
  try {
    return await sugestoesSetores(prefixo)
  } catch (err) {
    console.error('[buscarSugestoesSetores] falha nas sugestões:', err)
    return []
  }
}

// M5 — aviso de possivel duplicata (spec §8 regra 7) no passo Revisao. AVISO,
// nao trava: falha de consulta degrada para "nenhuma duplicata" e o registro
// segue permitido.
export async function buscarPossiveisDuplicatasDoDia(
  pares: ParMovimentacaoDia[],
): Promise<PossivelDuplicataDia[]> {
  try {
    return await possiveisDuplicatasDoDia(pares)
  } catch (err) {
    console.error('[buscarPossiveisDuplicatasDoDia] falha ao checar duplicatas:', err)
    return []
  }
}

// M6 — restauracao do rascunho: resumos por id, NA ORDEM pedida. Ids que sumiram
// (ativo excluido) simplesmente nao voltam — a UI compara e avisa.
export async function buscarResumoDeAtivosPorIds(
  ids: string[],
): Promise<AtivoResumo[]> {
  try {
    return await buscarAtivosResumoPorIds(ids)
  } catch (err) {
    console.error('[buscarResumoDeAtivosPorIds] falha ao restaurar o rascunho:', err)
    return []
  }
}

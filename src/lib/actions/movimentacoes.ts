'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirEscrita, exigirEscritaEm, exigirPapel } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { hojeISO } from '@/lib/format'
import {
  loteMovimentacaoSchema,
  estornoActionSchema,
  mesmaServiceTag,
  parsearLoteColado,
  type MovimentacaoInput,
} from '@/lib/validators/movimentacao'
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
import type { StatusAtivo } from '@/lib/dominio'

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
// Resultado do lote (OS-F2 3.4.1): quais entraram e qual falhou.
// ---------------------------------------------------------------------------
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
}

type AtivoBasico = { id: string; filial_id: number; status: StatusAtivo }

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
function montarRow(
  item: MovimentacaoInput,
  ativo: AtivoBasico,
  uid: string,
  vinculos: Map<string, string>,
) {
  const colaborador = ('colaborador' in item ? item.colaborador : undefined) ?? null
  return {
    ativo_id: item.ativo_id,
    tipo: item.tipo,
    motivo: ('motivo' in item ? item.motivo : undefined) ?? null,
    data: item.data,
    filial_id: ativo.filial_id, // origem (a corrente do ativo)
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

// Processa UM item do lote: valida a transicao (transferencia != filial atual),
// monta a row e insere. Devolve o resultado do item e se o lote deve parar — as
// linhas anteriores ja estao commitadas (cada insert e uma transacao). OS-F2 3.4.1.
async function processarItemLote(
  supabase: ServerClient,
  item: MovimentacaoInput,
  index: number,
  ativo: AtivoBasico | undefined,
  uid: string,
  vinculos: Map<string, string>,
): Promise<{ resultado: ItemResultado; interromper: boolean }> {
  if (!ativo) {
    return {
      resultado: {
        index,
        ativo_id: item.ativo_id,
        ok: false,
        erro: 'Ativo não encontrado.',
      },
      interromper: true,
    }
  }

  // Transferencia: destino tem de ser diferente da filial atual (OS-F2 3.3.1).
  if (
    item.tipo === 'transferencia' &&
    item.filial_destino_id === ativo.filial_id
  ) {
    return {
      resultado: {
        index,
        ativo_id: item.ativo_id,
        ok: false,
        erro: 'A filial de destino deve ser diferente da atual.',
      },
      interromper: true,
    }
  }

  const { data: inserida, error: insertErr } = await supabase
    .from('movimentacoes')
    .insert(montarRow(item, ativo, uid, vinculos))
    .select('id')
    .single()

  if (insertErr) {
    return {
      resultado: {
        index,
        ativo_id: item.ativo_id,
        ok: false,
        erro: traduzErroBanco(insertErr.message, insertErr.code),
      },
      interromper: true,
    }
  }

  return {
    resultado: {
      index,
      ativo_id: item.ativo_id,
      ok: true,
      movimentacao_id: inserida?.id,
    },
    interromper: false,
  }
}

// Registra um LOTE de 1..MAX_LOTE_MOVIMENTACAO movimentacoes (o teto e do
// `loteMovimentacaoSchema`, re-validado aqui), inserindo uma a uma em ordem. Se o
// banco rejeitar alguma (transicao invalida), interrompe e devolve o que entrou
// mais o item que falhou (as anteriores ja estao commitadas — cada insert e uma
// transacao). OS-F2 3.4.1.
export async function registrarMovimentacoes(input: {
  itens: MovimentacaoInput[]
}): Promise<RegistrarLoteResult> {
  const parsed = loteMovimentacaoSchema.safeParse(input)
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
  const ids = [...new Set(itens.map((i) => i.ativo_id))]
  if (ids.length !== itens.length) {
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
    .select('id, filial_id, status')
    .in('id', ids)
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

  // Vínculo de escrita em TODAS as filiais tocadas pelo lote — `montarRow` grava
  // `filial_id: ativo.filial_id` (a origem), e é esse valor que a policy de INSERT de
  // `movimentacoes` avalia. O lote é recusado inteiro: gravar as linhas permitidas e
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
  const vinculos = await resolverColaboradoresPorNome(
    supabase,
    itens.map((i) => ('colaborador' in i ? i.colaborador : null)),
  )

  const resultados: ItemResultado[] = []
  const rotasAtivos = new Set<string>()
  let criadas = 0
  let interrompido = false

  for (let index = 0; index < itens.length; index++) {
    const item = itens[index]

    if (interrompido) {
      resultados.push({
        index,
        ativo_id: item.ativo_id,
        ok: false,
        erro: 'Não processado — o lote foi interrompido em um item anterior.',
      })
      continue
    }

    const { resultado, interromper } = await processarItemLote(
      supabase,
      item,
      index,
      ativoPorId.get(item.ativo_id),
      uid,
      vinculos,
    )
    resultados.push(resultado)
    if (resultado.ok) {
      criadas++
      rotasAtivos.add(item.ativo_id)
    }
    if (interromper) interrompido = true
  }

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
  }

  return {
    ok: resultados.every((r) => r.ok),
    criadas,
    resultados,
  }
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

  const { error: insertErr } = await supabase.from('movimentacoes').insert({
    ativo_id: mov.ativo_id,
    tipo: 'estorno',
    estorno_de: mov.id,
    data: hojeISO(),
    filial_id: ativo.filial_id,
    observacao: parsed.data.observacao ?? null,
    criado_por: aut.uid,
  })

  if (insertErr) return { ok: false, erro: traduzErroBanco(insertErr.message, insertErr.code) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${mov.ativo_id}`)
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

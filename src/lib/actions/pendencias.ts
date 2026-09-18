'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin, exigirEscritaEm, exigirPapel } from '@/lib/auth/acesso'
import { registrarFalha } from '@/lib/observabilidade'
import { chamarRpc } from '@/lib/supabase/rpc'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  reabrirPendenciaItemSchema,
  resolverPendenciaItemSchema,
} from '@/lib/validators/pendencia-item'
import { resolverItemDoSlug } from '@/lib/itens/ponte-tipo-item'
import { decidirVinculoRetorno } from '@/lib/itens/vinculo-retorno'
import { textoDaBaixa, textoDoRetornoDaPendencia } from '@/lib/pendencias/texto-baixa'
import { textoDaRegularizacao } from '@/lib/itens/regularizacao'
import { resolverColaboradoresPorNome } from '@/lib/queries/colaboradores'
import { lancamentosJaEstornados, saldosPorColaborador } from '@/lib/queries/itens'
import { chaveColaborador } from '@/lib/colaboradores/chave'
import { planejarEstorno } from '@/lib/itens/estorno'
import { hojeISO } from '@/lib/format'
import type { TipoLancamento } from '@/lib/dominio'
import { linhasOuFalha, valorOuFalha } from '@/lib/supabase/linhas'
import {
  LEITURA_ITENS_PARA_PONTE,
  LEITURA_LANCAMENTOS_DA_REABERTURA,
  LEITURA_RESOLVER_PENDENCIAS_COM_LANCAMENTOS,
  LEITURA_TIPOS_ITEM_PARA_PONTE,
} from '@/lib/queries/formas/pendencias'

// Resolve (encerra) 1..N pendências de item numa tacada — o caminho para zerar a
// fila herdada com UMA justificativa (F18 §B2). Só toca as ABERTAS (`.eq('status',
// 'aberta')`): reenviar não "re-resolve" nem sobrescreve o desfecho de quem já foi
// resolvido (idempotente e à prova de corrida). Grava desfecho/quem/quando; a
// resolvida NÃO some da ficha (auditoria), só da fila. `resolvida_por = uid` é
// gravado pelo servidor a partir da sessão — o cliente não escolhe o autor.
export async function resolverPendenciaItem(input: {
  ids: string[]
  desfecho: string
  observacao?: string
}): Promise<ActionResult> {
  const parsed = resolverPendenciaItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { ids, desfecho, observacao } = parsed.data

  // O lote pode misturar filiais (`pendencias_item.filial_id` vem do trigger 0051, que
  // copia a da movimentação): lê as filiais alvo ANTES e exige escrita em todas —
  // resolver só a parte permitida deixaria a fila meio zerada, em silêncio, com UMA
  // justificativa cobrindo o que não foi resolvido.
  const { data: alvos, error: eFiliais } = await supabase
    .from('pendencias_item')
    .select('id, ativo_id, filial_id, item, colaborador, status')
    .in('id', ids)
  if (eFiliais) return { ok: false, erro: traduzErroBanco(eFiliais.message, eFiliais.code) }

  // Nenhum alvo (ids inexistentes) não é erro — esta action é idempotente de propósito
  // e o update abaixo simplesmente não acha linha. Mas o cargo de escrita continua
  // exigido: a action é um endpoint alcançável pela rede por si só.
  const aut =
    alvos && alvos.length > 0
      ? await exigirEscritaEm(supabase, alvos.map((p) => p.filial_id))
      : cargo
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // F38 · §E — RESOLVER PASSA A SER UM LANÇAMENTO, e o ciclo fecha.
  //
  // Até aqui resolver mexia só na linha da pendência: nenhum lançamento nascia.
  // Agora que existe conta por pessoa (0118), isso deixaria item dado como perdido
  // na conta daquela pessoa PARA SEMPRE, e item recuperado nunca voltaria à
  // prateleira. Os dois desfechos passam a gravar, na MESMA transação:
  //
  //   recuperado → `retorno` 1              (estoque +1 · pessoa −1 · Total inalterado)
  //   baixa      → `retorno` 1 + `ajuste` −1 (pessoa −1 · Total −1 · estoque de volta)
  //
  // ⚠ RESOLVER NUNCA FALHA POR CAUSA DO CATÁLOGO. `pendencias_item.item` guarda um
  // SLUG DE TIPO, e lançamento precisa de um ITEM. Quando a ponte não resolve
  // (tipo sem item ativo, ou slug que nem é tipo — o histórico anterior ao
  // catálogo), a pendência é resolvida do mesmo jeito e o lançamento simplesmente
  // não nasce. O acervo de equipamentos não fica refém do cadastro de acessórios.
  const lancamentos = await montarLancamentosDaResolucao(supabase, {
    alvos: (alvos ?? []).filter((p) => p.status === 'aberta'),
    desfecho: desfecho as 'recuperado' | 'baixa',
    observacao: observacao ?? null,
  })
  // Nada foi resolvido ainda: recusar é o lado seguro. Resolver com o vínculo em
  // branco deixaria o acessório na conta da pessoa exatamente como antes da F38.
  if (lancamentos.erro) return { ok: false, erro: lancamentos.erro }

  const { data, error } = await chamarRpc(
    supabase,
    'resolver_pendencias_item_com_lancamentos',
    {
      p_ids: ids,
      p_desfecho: desfecho,
      // '' e não null — ver a nota igual em `estornarMovimentacao` (actions/movimentacoes.ts):
      // a RPC faz `nullif(btrim(coalesce(p_observacao, '')), '')` e grava o mesmo.
      p_observacao: observacao ?? '',
      p_lancamentos: lancamentos.payload,
      p_criado_por: aut.uid,
    },
  )

  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A fila, o badge da sidebar e os relatórios contam as abertas; as fichas dos
  // ativos afetados mostram a pendência (agora resolvida — permanece, como rastro).
  revalidatePath('/pendencias')
  for (const ativoId of lancamentos.ativos) revalidatePath(`/ativos/${ativoId}`)
  revalidatePath('/relatorios', 'layout')
  // A escrita já aconteceu (a RPC não devolveu erro): forma errada degrada para "sem
  // lançamentos" — o `?? 0` de antes já tratava dado ausente do mesmo jeito, e o pior que
  // acontece é a revalidação de `/itens` não disparar (a resolução em si já foi gravada).
  const lidoResolucao = valorOuFalha(
    data,
    LEITURA_RESOLVER_PENDENCIAS_COM_LANCAMENTOS.forma,
    LEITURA_RESOLVER_PENDENCIAS_COM_LANCAMENTOS.rotulo,
  )
  // O desfecho mexeu no estoque (e, na baixa, no Total da TI).
  if ((lidoResolucao.ok ? (lidoResolucao.valor.lancamentos ?? 0) : 0) > 0) {
    revalidatePath('/itens')
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// F38 · §E — de "pendências selecionadas" para "os lançamentos do desfecho".
// ---------------------------------------------------------------------------
// Aqui moram as duas resoluções que a RPC NÃO faz de propósito (o cabeçalho da
// 0119 diz por quê): a ponte TIPO→ITEM e a PESSOA.
//
//   · o item vem do slug (`pendencias_item.item`), pela mesma ponte da frente D;
//   · a pessoa vem do TEXTO (`pendencias_item.colaborador`, um retrato da época),
//     resolvida por chave no servidor — nenhum id viaja pelo formulário;
//   · o vínculo só é gravado se a pessoa TEM saldo daquele item (regra §C.3): sem
//     saldo, o lançamento sai sem vínculo, repõe o estoque igual e não inventa
//     dívida. Sem isso, a guarda da 0118 recusaria a resolução de toda pendência
//     anterior a esta fase — que é justamente a fila que existe hoje.
//
// O texto do `ajuste` da baixa (obrigatório pelo CHECK `lanc_item_ajuste_obs`) é
// composto por função pura e testada, nunca dentro do SQL.
//
// F58 — forma HONESTA do lançamento que vai para `p_lancamentos` (jsonb), em vez de
// `Record<string, unknown>[]` + `as unknown as Json`: declarada com `type` (não
// `interface` — ver a armadilha em src/lib/supabase/json.ts), cada campo já é
// `JsonSerializavel`, então o payload entra na porta sem cast nenhum.
type LancamentoDaResolucao = {
  pendencia_id: string
  item_id: number
  filial_id: number
  quantidade: number
  data: string
  colaborador: string | null
  colaborador_id: string | null
  observacao_retorno: string
  observacao_regularizacao: string
  observacao_ajuste: string | null
}

async function montarLancamentosDaResolucao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    alvos: {
      id: string
      ativo_id: string
      filial_id: number
      item: string
      colaborador: string | null
    }[]
    desfecho: 'recuperado' | 'baixa'
    observacao: string | null
  },
): Promise<{ payload: LancamentoDaResolucao[]; ativos: Set<string>; erro?: string }> {
  const ativos = new Set<string>()
  if (args.alvos.length === 0) return { payload: [], ativos }

  const [{ data: tiposBrutos, error: eTipos }, { data: itensBrutos, error: eItens }] = await Promise.all([
    supabase.from('tipos_item').select(LEITURA_TIPOS_ITEM_PARA_PONTE.select),
    supabase.from('itens').select(LEITURA_ITENS_PARA_PONTE.select),
  ])
  // Falha de leitura do CATÁLOGO não bloqueia (a doutrina da §E: resolver nunca
  // falha por causa do catálogo), mas também não pode ser invisível: sem estas
  // linhas, a pendência resolveria sem lançamento e ninguém saberia por quê.
  if (eTipos) registrarFalha({ escopo: 'pendencias.resolver-tipos-item', erro: eTipos })
  if (eItens) registrarFalha({ escopo: 'pendencias.resolver-catalogo-itens', erro: eItens })
  // A forma errada segue o MESMO caminho do erro de banco acima: registra (dentro da porta) e
  // segue com a lista vazia — resolver não pode falhar por causa do catálogo.
  const lidoTipos = linhasOuFalha(
    tiposBrutos,
    LEITURA_TIPOS_ITEM_PARA_PONTE.forma,
    LEITURA_TIPOS_ITEM_PARA_PONTE.rotulo,
  )
  const tipos = lidoTipos.ok ? lidoTipos.linhas : []
  const lidoItens = linhasOuFalha(
    itensBrutos,
    LEITURA_ITENS_PARA_PONTE.forma,
    LEITURA_ITENS_PARA_PONTE.rotulo,
  )
  const itens = lidoItens.ok ? lidoItens.linhas : []

  const vinculos = await resolverColaboradoresPorNome(
    supabase,
    args.alvos.map((p) => p.colaborador),
  )

  // O saldo de cada pessoa, uma consulta por pessoa distinta (nunca por linha) e
  // todas em paralelo. ⚠ Falha de leitura NÃO vira "saldo zero": gravaria o
  // `retorno` sem vínculo e o item ficaria na conta da pessoa para sempre.
  const lidos = await saldosPorColaborador(
    supabase,
    args.alvos
      .map((p) => vinculos.get(chaveColaborador(p.colaborador)))
      .filter((x): x is string => !!x),
  )
  if (!lidos.ok) return { payload: [], ativos, erro: lidos.erro }
  const saldoPorPessoa = lidos.mapa

  const consumido = new Map<string, number>()
  const payload: LancamentoDaResolucao[] = []

  for (const p of args.alvos) {
    ativos.add(p.ativo_id)
    const r = resolverItemDoSlug(itens, tipos, p.item)
    if (r.situacao !== 'resolvido') continue // sem item: a pendência resolve mesmo assim

    const pessoaId = vinculos.get(chaveColaborador(p.colaborador)) ?? null
    let vinculo: string | null = null
    if (pessoaId) {
      const chave = `${pessoaId}|${r.item.id}|${p.filial_id}`
      const base =
        saldoPorPessoa
          .get(pessoaId)
          ?.find((s) => s.item_id === r.item.id && s.filial_id === p.filial_id)?.com_a_pessoa ?? 0
      const restante = base - (consumido.get(chave) ?? 0)
      const decisao = decidirVinculoRetorno({
        colaboradorId: pessoaId,
        itemId: r.item.id,
        filialId: p.filial_id,
        quantidade: 1,
        saldos: [{ item_id: r.item.id, filial_id: p.filial_id, com_a_pessoa: restante }],
      })
      vinculo = decisao.colaboradorId
      if (vinculo) consumido.set(chave, (consumido.get(chave) ?? 0) + 1)
    }

    const rotulo =
      (tipos ?? []).find((t) => t.slug === p.item)?.rotulo ?? r.item.nome ?? p.item
    payload.push({
      pendencia_id: p.id,
      item_id: r.item.id,
      filial_id: p.filial_id,
      quantidade: 1,
      data: hojeISO(),
      colaborador: p.colaborador,
      colaborador_id: vinculo,
      observacao_retorno: textoDoRetornoDaPendencia(args.desfecho, {
        itemRotulo: rotulo,
        colaborador: p.colaborador,
      }),
      // F41 — a justificativa do ACERTO AUTOMÁTICO, mandada SEMPRE. Quem decide se
      // vai haver acerto é a RPC, sob a trava, lendo o saldo do par (0126). Aqui ela
      // é quase certa de ser usada: nenhuma das 14 pendências abertas em produção
      // tem saída registrada, e era exatamente por isso que "Item recuperado" era
      // recusado pelo trigger antes desta fase.
      observacao_regularizacao: textoDaRegularizacao('pendencia', {
        itemRotulo: rotulo,
        quantidade: 1,
        colaborador: p.colaborador,
      }),
      observacao_ajuste:
        args.desfecho === 'baixa'
          ? textoDaBaixa({
              itemRotulo: rotulo,
              colaborador: p.colaborador,
              observacaoDaResolucao: args.observacao,
            })
          : null,
    })
  }

  return { payload, ativos }
}

// ---------------------------------------------------------------------------
// reabrirPendenciaItem (F28/PND-05) — a inversa de `resolverPendenciaItem`,
// acima: um desfecho errado (baixa no lugar de recuperado, ou um id a mais no
// lote) até agora não tinha correção em NENHUMA camada — "resolver é
// definitivo" era a regra. Espelha `desfazerConfirmacaoTermo`
// (actions/termos.ts, a ação inversa que já existe em produção para o termo):
// mesmo formato de action, mesma ideia de "desfazer uma decisão registrada".
//
// SEM MIGRATION (provado antes de escrever esta função — ver docs/DECISOES.md):
//   · `pendencias_item_ciclo_chk` (0050) aceita `status='aberta'` com
//     `desfecho`/`resolvida_em` nulos, nos dois sentidos — reabrir não viola o
//     CHECK, só percorre ele ao contrário.
//   · a policy de UPDATE (`pendencias_item operador resolve`, 0063) é
//     `pode_escrever_filial(filial_id)` sem restrição de coluna nem de direção.
//   · `guarda_acervo` (0081) exclui `pendencias_item` da imutabilidade do
//     acervo, DE PROPÓSITO E POR ESCRITO.
//
// Restrita ao NÍVEL ADMINISTRADOR (`exigirAdmin` = admin OU dev): reabrir apaga
// o desfecho de OUTRA PESSOA (quem resolveu), não uma decisão própria — por
// isso a régua é mais alta que a de resolver (`exigirPapel('operador')`,
// acima). `exigirEscritaEm` roda DEPOIS, sobre as filiais dos alvos lidos do
// banco (nunca confiadas ao cliente), pela mesma razão de sempre: reabrir só
// parte do lote, em silêncio, seria pior que recusar o lote inteiro.
export async function reabrirPendenciaItem(input: {
  ids: string[]
  justificativa: string
}): Promise<ActionResult> {
  const parsed = reabrirPendenciaItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const admin = await exigirAdmin(supabase)
  if (!admin.ok) return { ok: false, erro: admin.erro }

  const { ids, justificativa } = parsed.data

  // Só as JÁ RESOLVIDAS entram nos alvos — reabrir uma que já está aberta não
  // faz sentido (idempotente, como `resolverPendenciaItem` é para o sentido
  // contrário). `item`/`ativo_id` saem daqui porque alimentam a anotação
  // abaixo; `filial_id`, o vínculo de escrita.
  const { data: alvos, error: eAlvos } = await supabase
    .from('pendencias_item')
    .select('id, ativo_id, item, filial_id')
    .in('id', ids)
    .eq('status', 'resolvida')
  if (eAlvos) return { ok: false, erro: traduzErroBanco(eAlvos.message, eAlvos.code) }

  // Nenhum alvo resolvido (ids inexistentes, já reabertos por outra aba, ou o
  // lote inteiro já aberto) não é erro — nada a fazer, nada a anotar. O nível
  // administrador já foi exigido acima de qualquer forma.
  const alvosResolvidos = alvos ?? []
  if (alvosResolvidos.length === 0) return { ok: true }

  const aut = await exigirEscritaEm(supabase, alvosResolvidos.map((p) => p.filial_id))
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // F38 · §E — REABRIR DESFAZ O QUE A RESOLUÇÃO FEZ, ou recusa.
  //
  // Desde que resolver virou lançamento, reabrir sem tocá-lo deixaria o item de
  // volta na fila E de volta na prateleira ao mesmo tempo — uma pendência aberta
  // sobre um acessório que o sistema diz que voltou. Portanto: os lançamentos que
  // nasceram daquelas pendências (`pendencia_item_id`, 0119) são estornados na
  // MESMA transação, com os inversos calculados por `planejarEstorno` — a função
  // pura que o estorno avulso de item já usava desde a F3B.
  //
  // A RPC confere, antes de devolver, que nenhuma pendência reaberta ficou com
  // lançamento de pé, e recusa a transação inteira se ficou. Nunca reabre deixando
  // lançamento órfão — e essa garantia é do BANCO, não da boa-fé desta função.
  const idsAlvo = alvosResolvidos.map((p) => p.id)
  const { data: lancDaPendenciaBrutos, error: eLanc } = await supabase
    .from('lancamentos_item')
    .select(LEITURA_LANCAMENTOS_DA_REABERTURA.select)
    .in('pendencia_item_id', idsAlvo)
    .is('estorna_id', null)
  if (eLanc) return { ok: false, erro: traduzErroBanco(eLanc.message, eLanc.code) }
  // A forma errada segue o MESMO caminho do erro de banco acima.
  const lidoLancDaPendencia = linhasOuFalha(
    lancDaPendenciaBrutos,
    LEITURA_LANCAMENTOS_DA_REABERTURA.forma,
    LEITURA_LANCAMENTOS_DA_REABERTURA.rotulo,
  )
  if (!lidoLancDaPendencia.ok) {
    return { ok: false, erro: traduzErroBanco(lidoLancDaPendencia.erro.message) }
  }
  // Os lançamentos de um ciclo ANTERIOR (resolvida → reaberta → resolvida de novo) e os
  // estornados avulso continuam com `estorna_id` nulo, mas JÁ têm inverso: mandar outro
  // estouraria `lanc_item_estorna_uidx` e a pendência nunca mais reabriria.
  const jaEstornados = await lancamentosJaEstornados(
    supabase,
    lidoLancDaPendencia.linhas.map((l) => l.id),
  )
  if (!jaEstornados.ok) {
    return { ok: false, erro: traduzErroBanco(jaEstornados.erro.message, jaEstornados.erro.code) }
  }

  // F58 — mesma forma honesta de `LancamentoDaResolucao`: `type` (não `interface`)
  // com campos já `JsonSerializavel`, para a porta aceitar sem cast.
  type EstornoDaReabertura = {
    estorna_id: string
    pendencia_id: string | null
    item_id: number
    filial_id: number
    tipo: TipoLancamento
    quantidade: number
    chamado: string | null
    observacao: string | null
    colaborador: string | null
    colaborador_id: string | null
  }
  const aEstornar = lidoLancDaPendencia.linhas.filter((l) => !jaEstornados.ids.has(l.id))
  const estornos: EstornoDaReabertura[] = aEstornar.map((l) => {
    const plano = planejarEstorno(
      {
        tipo: l.tipo,
        quantidade: l.quantidade,
        chamado: l.chamado,
        observacao: l.observacao,
      },
      justificativa,
    )
    return {
      estorna_id: l.id,
      pendencia_id: l.pendencia_item_id,
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

  // A `observacao` do desfecho anterior é limpa pela RPC (decisão registrada em
  // docs/DECISOES.md): o CHECK não a exige, e preservá-la perderia sentido — ela
  // descrevia UM desfecho que, reaberta a pendência, deixou de valer. O texto que
  // explica a reabertura é a JUSTIFICATIVA, que vai para a anotação (abaixo).
  const { error } = await chamarRpc(supabase, 'reabrir_pendencias_item_com_estornos', {
    p_ids: idsAlvo,
    p_justificativa: justificativa,
    p_estornos: estornos,
    p_criado_por: aut.uid,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // Anotação por ATIVO (rastro imutável na linha do tempo, como o desfazer do
  // termo) — uma por pendência reaberta, com o item no texto: o mesmo ativo
  // pode ter mais de uma pendência de item na ficha, e a anotação genérica
  // "reaberta" sem dizer qual deixaria a auditoria adivinhando.
  const { error: eNota } = await supabase.from('anotacoes').insert(
    alvosResolvidos.map((p) => ({
      ativo_id: p.ativo_id,
      texto: `Pendência de item reaberta (${p.item}): ${justificativa}.`,
      criado_por: aut.uid,
    })),
  )
  if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message, eNota.code) }

  revalidatePath('/pendencias')
  for (const ativoId of new Set(alvosResolvidos.map((p) => p.ativo_id))) {
    revalidatePath(`/ativos/${ativoId}`)
  }
  revalidatePath('/relatorios', 'layout')
  // Os inversos mexeram no estoque de itens por quantidade.
  if (estornos.length > 0) revalidatePath('/itens')
  return { ok: true }
}

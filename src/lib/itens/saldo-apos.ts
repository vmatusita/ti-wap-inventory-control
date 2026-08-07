import type { TipoLancamento } from '@/lib/dominio'

// ITN-03a — "Saldo após": para cada lançamento do histórico, quanto sobrou
// depois dele. Só aparece quando o filtro do histórico tem EXATAMENTE 1 item
// + 1 filial (`ItensPage`) — nos demais recortes o saldo de um item é POR
// FILIAL, e uma coluna somando filiais diferentes mentiria sobre "quando
// zerou".
//
// GRANDEZA ESCOLHIDA: Estoque (não Total, Atrelados ou Falta). É o número que
// o operador lê na tabela de saldos para decidir "dá pra atender mais um
// pedido?" — e é o mesmo que reconstrói "quando zerou" (a pergunta que gerou
// este item). Rótulo da coluna e da Dica abaixo.
//
// A FÓRMULA É DO BANCO — não reinventada aqui. Fonte:
// `supabase/migrations/0027_itens_total_estoque.sql` (linhas ~68-99) e
// `TIPO_LANCAMENTO_META` em `src/lib/dominio.ts`:
//   total     = max(0, Σentrada + Σajuste)
//   liberados = max(0, Σsaida − Σretorno)
//   atrelados = Σ_por_chamado max(0, Σreserva − Σliberacao)
//   estoque   = max(0, total − atrelados − liberados)
//
// ORDEM — DECISÃO (registrar em DECISOES.md): a grade do histórico ordena por
// `created_at desc, id desc` (ordem de REGISTRO). O efeito no saldo é pela
// data de NEGÓCIO — um lançamento de ontem, digitado hoje, mexeu no saldo de
// ONTEM. Por isso a conta aqui é por `data desc, created_at desc, id desc`, e
// o chamador (`queries/itens.ts` → `ItensPage`) usa A MESMA ordem para EXIBIR
// a tabela nesse recorte específico (1 item + 1 filial) — senão a coluna
// ficaria ao lado de uma linha que não é a que ela descreve. Isso diverge da
// ordem-padrão do histórico (created_at) nesse único recorte; documentado
// aqui e no comentário de `historico-lancamentos.tsx`.
//
// PAGINAÇÃO: a conta só fecha com TODAS as linhas do item×filial — não as 20
// da página, nem só as que sobram depois de tipo/data/busca (esses filtros
// RECORTARIAM a história e quebrariam a soma: undo de uma Liberação sem ver a
// Entrada que a precede dá número errado). O chamador busca o histórico
// COMPLETO do item×filial, sem outros filtros, e passa por inteiro aqui; a
// tela usa dessa saída só o valor das linhas que aparecem na página atual
// (por id) — a conta em si roda sobre o recorte inteiro, nunca sobre a
// página.
//
// INVERSIBILIDADE — a marca d'água do item: total/liberados/atrelados são
// cada um `max(0, …)`. Uma vez que uma parcela SATURA em zero, a magnitude
// negativa original se perde — por isso esta função NUNCA tenta "desfazer" a
// partir de um valor JÁ floored (o `estoque`/`atrelados` que a RPC devolve).
// Em vez disso, ela reconstrói os acumulados BRUTOS (sem floor) somando a
// quantidade de CADA lançamento — dado que toda linha do recorte carrega — e
// só aplica o floor na hora de exibir cada ponto. Isso é exato desde que
// `linhas` seja o histórico COMPLETO do item×filial: por isso o último ponto
// reconstruído (o mais recente) é CONFERIDO contra o `saldoAtual` que a RPC
// devolveu (a fonte da verdade). Não bater — histórico incompleto, corrida
// entre as duas leituras, filtro que vazou — degrada a coluna inteira para
// "—" em vez de mostrar um número que parece certo e não é.
//
// ESTORNO — DECISÃO: o estorno é OUTRO lançamento real (o inverso vinculado),
// e entra na conta como qualquer outro — exatamente como o banco soma os dois
// na RPC. Não há tratamento especial: reserva 5 + liberação-estorno 5 do
// mesmo chamado voltam o saldo ao que era antes da reserva, e é isso que o
// teste do estorno confere.

export type LancamentoParaSaldoApos = {
  id: string
  data: string
  created_at: string
  tipo: TipoLancamento
  quantidade: number
  chamado: string | null
}

/** Os quatro números que a RPC `rel_saldo_itens` devolve para o item na filial
 *  do recorte — a "fonte da verdade" contra a qual a reconstrução é conferida. */
export type SaldoAtualParaConferencia = {
  total: number
  atrelados: number
  estoque: number
  falta: number
}

export type LinhaSaldoApos = {
  id: string
  /** Estoque logo depois deste lançamento, ou `null` quando a reconstrução não
   *  fechou com o saldo atual (ver `motivoDegradado`). */
  saldoApos: number | null
}

export type ResultadoSaldoApos = {
  /** Uma entrada por linha recebida, na ordem de CÁLCULO (data desc,
   *  created_at desc, id desc) — é também a ordem de EXIBIÇÃO da tabela
   *  quando esta coluna está presente. */
  linhas: LinhaSaldoApos[]
  /** Motivo da degradação (todas as linhas com `saldoApos: null`), para virar
   *  o texto da Dica na célula "—". `null` quando a reconstrução fechou. */
  motivoDegradado: string | null
}

export const ROTULO_SALDO_APOS = 'Saldo após'

export const TEXTO_DICA_SALDO_APOS =
  'Estoque do item, nesta filial, logo depois deste lançamento — só aparece com exatamente 1 item e 1 filial no filtro.'

export const MOTIVO_SALDO_APOS_DEGRADADO =
  'Não foi possível reconstruir o saldo após este lançamento — o histórico recebido não fechou com o saldo atual.'

// Ordem de CÁLCULO/EXIBIÇÃO deste recorte: data desc, created_at desc, id desc.
// Comparação por string funciona porque `data`/`created_at` chegam em ISO
// (mesmo padrão já usado em `queries/relatorios/estoque.ts`).
function ordemCalculo(a: LancamentoParaSaldoApos, b: LancamentoParaSaldoApos): number {
  if (a.data !== b.data) return a.data < b.data ? 1 : -1
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
  if (a.id !== b.id) return a.id < b.id ? 1 : -1
  return 0
}

export function calcularSaldoApos(
  linhas: readonly LancamentoParaSaldoApos[],
  saldoAtual: SaldoAtualParaConferencia,
): ResultadoSaldoApos {
  if (linhas.length === 0) return { linhas: [], motivoDegradado: null }

  // Ordem de exibição: mais recente primeiro.
  const ordenadas = [...linhas].sort(ordemCalculo)
  // Ordem de reconstrução: mais antigo primeiro (o inverso da de exibição) —
  // acumula os BRUTOS sem nunca precisar "desfazer" um floor já aplicado.
  const cronologica = [...ordenadas].reverse()

  let totalBruto = 0
  let liberadosBruto = 0
  const chamadoBruto = new Map<string, number>()
  const estoquePorId = new Map<string, number>()
  let ultimoPonto = { total: 0, atrelados: 0, liberados: 0, estoque: 0 }

  for (const l of cronologica) {
    switch (l.tipo) {
      case 'entrada':
      case 'ajuste':
        totalBruto += l.quantidade
        break
      case 'saida':
        liberadosBruto += l.quantidade
        break
      case 'retorno':
        liberadosBruto -= l.quantidade
        break
      case 'reserva':
        if (l.chamado) chamadoBruto.set(l.chamado, (chamadoBruto.get(l.chamado) ?? 0) + l.quantidade)
        break
      case 'liberacao':
        if (l.chamado) chamadoBruto.set(l.chamado, (chamadoBruto.get(l.chamado) ?? 0) - l.quantidade)
        break
    }

    const total = Math.max(0, totalBruto)
    const liberados = Math.max(0, liberadosBruto)
    let atrelados = 0
    for (const net of chamadoBruto.values()) atrelados += Math.max(0, net)
    const estoque = Math.max(0, total - atrelados - liberados)

    estoquePorId.set(l.id, estoque)
    ultimoPonto = { total, atrelados, liberados, estoque }
  }

  // Confere o ponto mais recente contra a RPC. `liberados` não vem pronto do
  // `SaldoAtualParaConferencia` — é derivado da mesma decomposição livre =
  // estoque − falta (total − atrelados − liberados = estoque − falta,
  // sempre: exatamente um dos dois lados é zero, o outro carrega o valor).
  const liberadosEsperado =
    saldoAtual.total - saldoAtual.atrelados - saldoAtual.estoque + saldoAtual.falta
  const fechou =
    ultimoPonto.total === saldoAtual.total &&
    ultimoPonto.atrelados === saldoAtual.atrelados &&
    ultimoPonto.liberados === liberadosEsperado &&
    ultimoPonto.estoque === saldoAtual.estoque

  if (!fechou) {
    return {
      linhas: ordenadas.map((l) => ({ id: l.id, saldoApos: null })),
      motivoDegradado: MOTIVO_SALDO_APOS_DEGRADADO,
    }
  }

  return {
    linhas: ordenadas.map((l) => ({ id: l.id, saldoApos: estoquePorId.get(l.id) ?? null })),
    motivoDegradado: null,
  }
}

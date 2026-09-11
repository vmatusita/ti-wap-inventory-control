// FIXTURES DO PASSE 2 — "a bomba, no mundo real" (F56 · Frente G).
//
// O passe 2 precisa de DOIS estados que só existem depois que alguma coisa
// aconteceu no sistema: um lançamento de item PRESO a uma movimentação
// (`lancamentos_item.movimentacao_id`) e uma pendência de item ABERTA
// (`pendencias_item`) — os dois caminhos que a auxiliar `import_apagar_acervo_filial`
// (migration 0140, Frente F) passa a desvincular/apagar. Este módulo os cria pelos
// CAMINHOS DO SISTEMA (as mesmas RPCs que as Server Actions chamam), com a sessão
// da PERSONA — nunca com service role: é a linha de defesa real (RLS + trigger)
// que a Frente F está consertando, e é ela que o smoke precisa exercitar.
//
// POR QUE NÃO A SERVER ACTION DIRETO: `registrarMovimentacoes`/`lancarItens`
// (src/lib/actions/*.ts) são `'use server'` — `createClient()` chama `cookies()`
// de `next/headers` na primeira linha, que exige uma requisição REAL do Next. Um
// script `tsx` solto não tem isso (medição 5, §5(d) do relatório desta fase:
// "Nenhuma Server Action deste módulo pode ser importada e chamada por um script
// tsx/node solto"). O que SOBRA — e é o que importa provar — é a RPC, chamada
// direto com `@supabase/supabase-js` e a sessão da persona (`signInWithPassword`),
// exatamente como `scripts/smoke/smoke-prod.mjs` já faz.
//
// DUPLICAÇÃO DECLARADA: `montarRow` e `montarItensJunto`
// (src/lib/actions/movimentacoes.ts:160, :444) NÃO são exportadas — não há como
// importar a montagem real. Os objetos abaixo ESPELHAM o shape que elas produzem
// (linha a linha, comentado); se a RPC `criar_movimentacao_com_itens` ganhar campo
// novo, atualize aqui também. Esta é exatamente a mesma classe de duplicação que
// `chave-sql.test.ts`/`tipos-item-sql.test.ts` blindam para pares TS↔SQL — aqui é
// TS↔TS (duas cópias do mesmo INSERT/payload), sem como blindar com um teste de
// mesmo poder. Documentar é o que resta.
//
// O item do CATÁLOGO (`itens`) usado no passe (b) é 100% FICTÍCIO do smoke — nunca
// um item real do catálogo do ensaio — e o item FALTANTE do passe (c) é um slug
// HISTÓRICO já seedado (`tipos_item`, migration 0114): não precisa (nem deve)
// existir cadastro novo para ele, `itens_faltantes`/`pendencias_item.item` guardam
// TEXTO LIVRE (slug), nunca um id de `itens` (CLAUDE.md, regra 2, F38/F39).

// Tipo da sessão da persona (ou do client de serviço): DELIBERADAMENTE `any` no
// PARÂMETRO, no mesmo espírito do client administrativo de `scripts/env-guard.ts`
// ("Intencionalmente SEM o generic Database... para um script de dados isso é
// desnecessário"). Medido nesta fase: a anotação nua `SupabaseClient` e o
// `ReturnType<typeof createClient>` de CHAMADAS DIFERENTES (com opções de auth
// diferentes) resolvem para tipos estruturalmente incompatíveis nesta versão do
// pacote (`npx tsc --noEmit` acusa `SupabaseClient<any, "public", "public", any,
// any>` × `SupabaseClient<unknown, { PostgrestVersion }, never, never, {...}>`) —
// nenhum dos dois é "o" tipo certo para aceitar QUALQUER sessão que os chamadores
// deste módulo possam passar. `any` aqui é a escolha HONESTA: o valor de RETORNO
// de cada função continua com o shape explícito que ela declara.
type Sessao = any // eslint-disable-line @typescript-eslint/no-explicit-any

/** Nome do item fictício de catálogo criado (ou reaproveitado) por este smoke. */
export const NOME_ITEM_SMOKE = 'Mouse smoke F56 (fictício)'
const GRUPO_ITEM_SMOKE = 'acessorio'

/** Um dos 7 slugs HISTÓRICOS já seedados na `0114` (CLAUDE.md, regra 2) — nunca um
 *  slug novo: a Frente D não criou tela para cadastrar tipo, e este smoke não é
 *  onboarding. `itens_faltantes`/`pendencias_item.item` aceitam texto livre; usar
 *  um slug conhecido prova o caminho comum, não o caso de borda do fallback. */
export const SLUG_ITEM_FALTANTE = 'mouse'

// ---------------------------------------------------------------------------
// (a) garantir saldo — o item do catálogo + uma entrada de estoque na sede
// ---------------------------------------------------------------------------

/**
 * Garante o item fictício do smoke no catálogo (`itens`). `itens` aceita INSERT de
 * operador+ desde a F41 (CLAUDE.md, § do modelo de acesso — a mesma policy que
 * `criarItemInline`, actions/itens.ts, usa por baixo) — a persona é `admin`, que
 * contém `operador` na hierarquia, então grava direto pela RLS.
 */
export async function garantirItemDoSmoke(
  sessao: Sessao,
  criadoPor: string,
): Promise<{ itemId: number; criouAgora: boolean }> {
  const { data: existente, error: eLeitura } = await sessao
    .from('itens')
    .select('id')
    .eq('nome', NOME_ITEM_SMOKE)
    .maybeSingle()
  if (eLeitura) throw new Error(`Falha ao procurar o item do smoke: ${eLeitura.message}`)
  if (existente) return { itemId: existente.id as number, criouAgora: false }

  const { data: novo, error: eInsert } = await sessao
    .from('itens')
    .insert({
      nome: NOME_ITEM_SMOKE,
      grupo: GRUPO_ITEM_SMOKE,
      ativo: true,
      ordem: 9999,
      estoque_minimo: 0,
      criado_por: criadoPor,
    })
    .select('id')
    .single()
  if (eInsert || !novo) {
    throw new Error(`Falha ao criar o item do smoke: ${eInsert?.message ?? 'sem retorno'}`)
  }
  return { itemId: novo.id as number, criouAgora: true }
}

/**
 * Entrada de estoque na `sede` — pela RPC `lancar_itens_lote` (migration 0126), a
 * MESMA que `lancarItens` (src/lib/actions/itens.ts:~220) chama. Necessária ANTES
 * da saída do passe (b): sem saldo positivo o trigger 0015/0027 recusaria a saída.
 */
export async function garantirSaldoSede(
  sessao: Sessao,
  args: { itemId: number; filialId: number; criadoPor: string; quantidade: number; data: string },
): Promise<void> {
  const { error } = await sessao.rpc('lancar_itens_lote', {
    p_linhas: [
      {
        item_id: args.itemId,
        filial_id: args.filialId,
        tipo: 'entrada',
        quantidade: args.quantidade,
        chamado: null,
        colaborador: null,
        colaborador_id: null,
        data: args.data,
        observacao: 'Entrada fictícia do smoke do import (F56) — garante saldo para a saída do passe 2.',
        observacao_regularizacao: null,
      },
    ],
    p_criado_por: args.criadoPor,
  })
  if (error) throw new Error(`Falha ao lançar a entrada de estoque do smoke: ${error.message}`)
}

// ---------------------------------------------------------------------------
// (b) a SAÍDA com item junto — gera lancamentos_item.movimentacao_id
// ---------------------------------------------------------------------------

/**
 * Cria uma movimentação de SAÍDA de um ativo (já importado no passe 1, em
 * `em_estoque`) com UM item do catálogo indo junto — o par que faz
 * `criar_movimentacao_com_itens` (0117) gravar `lancamentos_item.movimentacao_id`
 * na mesma transação (F38 · D13).
 *
 * O shape de `p_movimentacoes[0]` espelha `montarRow`
 * (src/lib/actions/movimentacoes.ts:160-186) e o de `p_itens[0]` espelha o
 * `payload.map` final de `montarItensJunto` (mesmo arquivo, ~:560-586) — só os
 * campos que uma linha de `saida` preenche; os condicionais de outros tipos
 * (`filial_destino_id`, `status_resultante`, `itens_faltantes`) ficam `null`.
 */
export async function criarSaidaComItemJunto(
  sessao: Sessao,
  args: {
    ativoId: string
    itemId: number
    quantidade: number
    criadoPor: string
    data: string
  },
): Promise<{ movimentacaoId: string }> {
  const movimentacao = {
    ativo_id: args.ativoId,
    tipo: 'saida',
    motivo: null,
    data: args.data,
    filial_destino_id: null,
    colaborador: 'Fulano Smoke',
    colaborador_id: null,
    setor: 'TI (smoke F56)',
    chamado: null,
    chamado_fornecedor: null,
    termo_assinado: null,
    termo_data: null,
    itens_faltantes: null,
    observacao: 'Saída fictícia do smoke do import (F56) — item vai junto.',
    status_resultante: null,
    criado_por: args.criadoPor,
  }
  const item = {
    // `indice_movimentacao` referencia a posição em `p_movimentacoes` — só há uma
    // linha aqui, então é sempre 0 (itemJuntoSchema, validators/movimentacao.ts).
    indice_movimentacao: 0,
    item_id: args.itemId,
    tipo: 'saida',
    quantidade: args.quantidade,
    data: args.data,
    colaborador: movimentacao.colaborador,
    colaborador_id: null,
    // Texto livre, mandado sempre pelo cliente real (F41) mas só USADO pela RPC se
    // ela decidir que houve acerto automático — não é o caso aqui (saldo positivo
    // garantido por garantirSaldoSede). Não precisa espelhar textoDaRegularizacao
    // byte a byte: o conteúdo exato só importa quando a RPC de fato o grava.
    observacao_regularizacao: `Smoke F56: ${args.quantidade} unidade(s) de "${NOME_ITEM_SMOKE}" (Fulano Smoke).`,
  }

  const { data, error } = await sessao.rpc('criar_movimentacao_com_itens', {
    p_movimentacoes: [movimentacao],
    p_itens: [item],
    p_criado_por: args.criadoPor,
  })
  if (error) throw new Error(`Falha ao criar a saída com item junto: ${error.message}`)
  const movimentacaoId = (data as { movimentacoes?: string[] } | null)?.movimentacoes?.[0]
  if (!movimentacaoId) throw new Error('A RPC não devolveu o id da movimentação de saída.')
  return { movimentacaoId }
}

// ---------------------------------------------------------------------------
// (c) a DEVOLUÇÃO com item faltante — gera pendencias_item pelo gatilho (0051)
// ---------------------------------------------------------------------------

/**
 * Cria uma movimentação de DEVOLUÇÃO de um ativo (já importado no passe 1, em
 * `em_uso`, com detentor) apontando UM item como faltante — o trigger 0051 abre a
 * pendência de item sozinho, dentro da mesma transação. Não precisa de
 * `colaborador_id`: a pessoa da devolução vem do DETENTOR ATUAL do ativo, lido
 * pela própria RPC sob a trava (o mesmo comentário de `montarItensJunto`) — aqui
 * não há item-junto (`p_itens: []`), só a linha da movimentação com
 * `itens_faltantes`.
 */
export async function criarDevolucaoComItemFaltante(
  sessao: Sessao,
  args: { ativoId: string; criadoPor: string; data: string; slugFaltante?: string },
): Promise<{ movimentacaoId: string }> {
  const movimentacao = {
    ativo_id: args.ativoId,
    tipo: 'devolucao',
    motivo: null,
    data: args.data,
    filial_destino_id: null,
    colaborador: null,
    colaborador_id: null,
    setor: null,
    chamado: null,
    chamado_fornecedor: null,
    termo_assinado: null,
    termo_data: null,
    itens_faltantes: [args.slugFaltante ?? SLUG_ITEM_FALTANTE],
    observacao: 'Devolução fictícia do smoke do import (F56) — item faltante de propósito.',
    status_resultante: null,
    criado_por: args.criadoPor,
  }

  const { data, error } = await sessao.rpc('criar_movimentacao_com_itens', {
    p_movimentacoes: [movimentacao],
    p_itens: [],
    p_criado_por: args.criadoPor,
  })
  if (error) throw new Error(`Falha ao criar a devolução com item faltante: ${error.message}`)
  const movimentacaoId = (data as { movimentacoes?: string[] } | null)?.movimentacoes?.[0]
  if (!movimentacaoId) throw new Error('A RPC não devolveu o id da movimentação de devolução.')
  return { movimentacaoId }
}

// ---------------------------------------------------------------------------
// Leituras — as MESMAS fontes que a tela usa, nunca uma query paralela
// ---------------------------------------------------------------------------

/** Saldo do item na filial — a RPC `rel_saldo_itens`, a mesma que `/itens` e
 *  `smoke-prod.mjs` já leem (0037+). `p_ate` é a data de corte (hoje). */
export async function lerSaldoItemNaFilial(
  sessao: Sessao,
  args: { itemId: number; filialId: number; ate: string },
): Promise<{ total: number; estoque: number; atrelados: number; falta: number } | null> {
  const { data, error } = await sessao.rpc('rel_saldo_itens', {
    p_filial: args.filialId,
    p_ate: args.ate,
  })
  if (error) throw new Error(`Falha ao ler o saldo do item: ${error.message}`)
  const linha = (data ?? []).find((l: { item_id: number }) => l.item_id === args.itemId)
  return linha ? { total: linha.total, estoque: linha.estoque, atrelados: linha.atrelados, falta: linha.falta } : null
}

/** Pendências de item ABERTAS na filial (leitura direta — o piso de leitura vale
 *  para qualquer logado ativo, inclusive a persona). Só ids/contagem — nunca dado
 *  de negócio real (esta filial só tem dado fictício do próprio smoke). */
export async function lerPendenciasAbertasDaFilial(
  sessao: Sessao,
  filialId: number,
): Promise<{ id: string; ativo_id: string; movimentacao_id: string; item: string }[]> {
  const { data, error } = await sessao
    .from('pendencias_item')
    .select('id, ativo_id, movimentacao_id, item')
    .eq('filial_id', filialId)
    .eq('status', 'pendente')
  if (error) throw new Error(`Falha ao ler pendências de item da filial: ${error.message}`)
  return data ?? []
}

/** O elo de um lançamento com a movimentação/pendência que o gerou — para provar,
 *  depois da Frente F, que ele saiu de lá sem mudar quantidade nenhuma. */
export async function lerElosDoLancamento(
  sessao: Sessao,
  args: { itemId: number; filialId: number },
): Promise<{ id: string; movimentacao_id: string | null; pendencia_item_id: string | null; quantidade: number }[]> {
  const { data, error } = await sessao
    .from('lancamentos_item')
    .select('id, movimentacao_id, pendencia_item_id, quantidade')
    .eq('item_id', args.itemId)
    .eq('filial_id', args.filialId)
  if (error) throw new Error(`Falha ao ler os lançamentos do item: ${error.message}`)
  return data ?? []
}

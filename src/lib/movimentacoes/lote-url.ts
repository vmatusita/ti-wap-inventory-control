import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'

// ATV-03 (F30) — o lote de movimentação que nasce da LISTA de ativos.
//
// `/ativos?status=estoque&filial=matriz` já é a seleção que o operador queria;
// até esta fase ela morria ali e ele recomeçava, um a um, dentro do wizard. A
// barra de seleção manda os ids escolhidos para `/movimentacoes/nova?ativos=a,b,c`
// e é este módulo que traduz a querystring de volta em lote.
//
// Puro de propósito (sem React, sem Supabase): o que decide quem entra no lote e
// o que o operador lê quando alguém fica de fora é justamente a parte que precisa
// de teste, e o `page.tsx` que o consome é um Server Component async.

/** O separador da lista na URL. Vírgula: legível e não precisa de escape. */
export const SEPARADOR_IDS = ','

// A querystring é território hostil — vem de link colado, de histórico velho, de
// alguém editando a barra de endereço. `buscarAtivosResumoPorIds` monta um
// `.in('id', …)` direto: um pedaço que não seja UUID não devolve "nada
// encontrado", ele DERRUBA a página com `invalid input syntax for type uuid`.
// Por isso a peneira vem antes de qualquer consulta.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type LoteDaUrl = {
  /** Válidos, sem repetição, na ordem em que chegaram, já cortados no teto. */
  ids: string[]
  /** Pedaços descartados por não serem UUID (lixo na URL). */
  invalidos: number
  /** Ids repetidos que foram colapsados num só. */
  repetidos: number
  /** Ids válidos que não couberam no teto do lote. */
  excedentes: number
}

/**
 * Traduz `?ativos=` em lote. Ordem de chegada preservada (é a ordem em que o
 * operador viu as linhas na lista), duplicata colapsada, teto aplicado.
 */
export function parseIdsDeAtivos(
  bruto: string | undefined | null,
  teto: number = MAX_LOTE_MOVIMENTACAO,
): LoteDaUrl {
  const vazio: LoteDaUrl = { ids: [], invalidos: 0, repetidos: 0, excedentes: 0 }
  if (!bruto) return vazio

  const pedacos = bruto
    .split(SEPARADOR_IDS)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (pedacos.length === 0) return vazio

  const ids: string[] = []
  const vistos = new Set<string>()
  let invalidos = 0
  let repetidos = 0
  let excedentes = 0

  for (const p of pedacos) {
    if (!UUID.test(p)) {
      invalidos++
      continue
    }
    // Normaliza a caixa ANTES de comparar: `A1B2…` e `a1b2…` são o mesmo ativo,
    // e o Postgres também os trata assim — contá-los como dois encheria o teto
    // com um ativo só e o operador veria "1 ficou de fora" sem entender o quê.
    const id = p.toLowerCase()
    if (vistos.has(id)) {
      repetidos++
      continue
    }
    vistos.add(id)
    if (ids.length >= teto) {
      excedentes++
      continue
    }
    ids.push(id)
  }

  return { ids, invalidos, repetidos, excedentes }
}

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? um : muitos
}

/**
 * A frase do banner âmbar quando alguém ficou de fora do lote de abertura.
 * `null` = ninguém ficou, e o banner nem aparece.
 *
 * Três motivos somam na MESMA frase, na ordem em que interessam ao operador:
 * o que sumiu do acervo, o que era lixo na URL e o que o teto cortou.
 */
export function avisoDoLoteInicial({
  pedidos,
  encontrados,
  invalidos,
  excedentes,
  teto = MAX_LOTE_MOVIMENTACAO,
}: {
  /** Quantos ids VÁLIDOS foram consultados no banco (já sem repetição e sem corte). */
  pedidos: number
  /** Quantos deles o banco devolveu. */
  encontrados: number
  invalidos: number
  excedentes: number
  /** O MESMO teto que `parseIdsDeAtivos` aplicou. Chega por parâmetro porque o
   *  corte é de lá: citar a constante aqui faria a frase anunciar um número que
   *  não foi o usado sempre que o chamador passasse outro teto. */
  teto?: number
}): string | null {
  const sumiram = Math.max(0, pedidos - encontrados)
  const partes: string[] = []

  if (sumiram > 0) {
    partes.push(
      `${sumiram} ${plural(sumiram, 'ativo não foi encontrado', 'ativos não foram encontrados')} e ${plural(sumiram, 'ficou', 'ficaram')} de fora do lote — ${plural(sumiram, 'pode ter sido apagado', 'podem ter sido apagados')}.`,
    )
  }
  if (invalidos > 0) {
    partes.push(
      `${invalidos} ${plural(invalidos, 'endereço de ativo veio quebrado no link', 'endereços de ativo vieram quebrados no link')}.`,
    )
  }
  if (excedentes > 0) {
    // Mesma voz do corte do "Colar lista" (colar-lista-dialog.tsx): o operador
    // já conhece esta frase de outro caminho do mesmo wizard.
    partes.push(
      `${excedentes} ${plural(excedentes, 'ativo ficou', 'ativos ficaram')} de fora: o lote aceita ${teto} por movimentação. Registre o resto em outro lote.`,
    )
  }

  return partes.length > 0 ? partes.join(' ') : null
}

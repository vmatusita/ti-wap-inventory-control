import type { z } from 'zod'
import type { Database } from '@/lib/types/database'
import type { FormaDeLinha } from '@/lib/supabase/forma'
import type { NomeRpc } from '@/lib/supabase/rpc'

// O DESCRITOR DE UMA LEITURA (F58 · Frentes C e E · Decisões 5 e 9).
//
// Uma leitura migrada para `linhasDe`/`linhaDe`/`valorDe` é declarada UMA vez — origem, texto do
// `select`, forma e ordem total — num módulo de `src/lib/queries/formas/`. A query ou a action que
// lê o banco importa o descritor e monta a consulta com o `select` e a forma DELE
// (`client.from('tabela').select(d.select)` e `linhasDe(data, d.forma, d.rotulo)`); o conferidor de
// formas (`scripts/formas/conferir.mts`) importa O MESMO descritor e passa as linhas reais de produção
// pela MESMA forma. Um conferidor com cópia do schema provaria a cópia.
//
// ⚠ O NOME da tabela e o da RPC ficam LITERAIS no call-site — `.from('movimentacoes')`,
// `chamarRpc(client, 'rel_resumo', …)` —, e não `d.origem`/`d.rpc`. É exigência do tripwire do
// visualizador por senha (`queries/relatorios/fronteira-viewer.test.ts`), que só aceita nome
// LITERAL numa lista branca e reprova qualquer nome montado em runtime. A troca não custa a
// amarração: o literal tem o mesmo tipo do campo do descritor. Quem confere que o call-site e o
// descritor falam da MESMA relação é `formas/catalogo.test.ts`.
//
// Os parâmetros `const` preservam o LITERAL do nome da relação e do `select` — é esse literal que
// faz o supabase-js inferir a linha no call-site, e é contra essa linha que a amarração de
// `forma.ts` confere o schema. Uma string não literal aqui voltaria a quebrar a inferência.

type Relacao = keyof Database['public']['Tables'] | keyof Database['public']['Views']

export type LeituraDeRelacao<O extends Relacao = Relacao, S extends string = string, F extends FormaDeLinha = FormaDeLinha> = {
  readonly tipo: 'relacao'
  /** Rótulo estável da leitura — vai para o erro de forma e para a evidência. Nunca dado. */
  readonly rotulo: string
  readonly origem: O
  readonly select: S
  readonly forma: F
  /** Ordem TOTAL para o conferidor paginar sem repetir nem perder linha (a última coluna é única). */
  readonly ordem: readonly string[]
  /**
   * Colunas que o call-site SEMPRE filtra com `.not(coluna, 'is', null)`. O supabase-js estreita o tipo inferido com
   * esse filtro, e a forma declara a coluna não-nula por isso — é pré-condição da LEITURA, não fato da tabela. O
   * conferidor aplica o MESMO filtro antes de contar e de ler, e `formas/catalogo.test.ts` exige o
   * `.not('<coluna>', 'is', null)` literal em todo arquivo que usa o descritor. (Achado da rodada cedo do conferidor:
   * sem isso, a relação inteira trazia os nulos que o call-site nunca lê.)
   */
  readonly naoNulas?: readonly string[]
}

/** Como o conferidor monta os argumentos de uma RPC de LEITURA (nomes reais dos parâmetros). */
export type MatrizDeRpc =
  | { readonly tipo: 'sem-argumentos' }
  | { readonly tipo: 'filial-e-data'; readonly filial: string; readonly data: string }
  | { readonly tipo: 'filial-e-periodo'; readonly filial: string; readonly de: string; readonly ate: string }
  | { readonly tipo: 'colaborador'; readonly colaborador: string }

export type LeituraDeRpc<N extends NomeRpc = NomeRpc, F extends z.ZodType = z.ZodType> = {
  readonly tipo: 'rpc'
  readonly rotulo: string
  readonly rpc: N
  /** A forma de CADA LINHA (`returns table`) ou do VALOR (`jsonb`, escalar). */
  readonly forma: F
  readonly retorno: 'linhas' | 'valor'
  readonly matriz: MatrizDeRpc
  /**
   * Colunas de ordem TOTAL para paginar o retorno de tabela (`rel_estoque_asof` não tem `order by`):
   * a combinação tem de ser única por linha — as colunas do `group by` vivo, ou a chave do
   * `distinct on`. Uma coluna só onde a função agrupa por duas repete e pula linha entre páginas
   * (`rel_saldo_colaborador` agrupa por item E filial — a revisão do lote 2 pegou). O conferidor
   * reprova a rodada em que duas linhas lidas repetem a chave.
   */
  readonly ordem?: readonly string[]
}

/**
 * O RECIBO de uma RPC que ESCREVE. O conferidor NUNCA a chama — em banco nenhum. A forma do retorno
 * se prova contra o corpo vivo (`rpc-retorno-sql.test.ts`: as chaves de `jsonb_build_object` e as
 * colunas de `returns table`, em todas as variantes de `return`).
 */
export type ReciboDeRpc<N extends NomeRpc = NomeRpc, F extends z.ZodType = z.ZodType> = {
  readonly tipo: 'recibo'
  readonly rotulo: string
  readonly rpc: N
  readonly forma: F
}

export type Descritor = LeituraDeRelacao | LeituraDeRpc | ReciboDeRpc

export function leituraDeRelacao<
  const O extends Relacao,
  const S extends string,
  F extends FormaDeLinha,
>(d: Omit<LeituraDeRelacao<O, S, F>, 'tipo'>): LeituraDeRelacao<O, S, F> {
  return { tipo: 'relacao', ...d }
}

export function leituraDeRpc<const N extends NomeRpc, F extends z.ZodType>(
  d: Omit<LeituraDeRpc<N, F>, 'tipo'>,
): LeituraDeRpc<N, F> {
  return { tipo: 'rpc', ...d }
}

export function reciboDeRpc<const N extends NomeRpc, F extends z.ZodType>(
  d: Omit<ReciboDeRpc<N, F>, 'tipo'>,
): ReciboDeRpc<N, F> {
  return { tipo: 'recibo', ...d }
}

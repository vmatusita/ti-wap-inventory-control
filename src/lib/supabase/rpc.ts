import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import type { JsonSerializavel } from '@/lib/supabase/json'

// A PORTA ÚNICA DE RPC (F58 · Frente B · Decisão 1).
//
// Toda chamada de função do banco em `src/**` passa por `chamarRpc`. Antes da F58 eram 37
// `.rpc(` espalhados, e o tipo do que entrava e saía era o do GERADOR — que mente nos dois
// sentidos:
//
//  · no ARGUMENTO, ele não distingue "aceita NULL" de "não aceita". As sete `rel_*` recebem
//    `p_filial smallint`, não são `strict`, e tratam `p_filial is null` como o relatório
//    CONSOLIDADO; o gerador emite `p_filial: number`. Até aqui isso era calado por casts —
//    `filialParaRpc` (`as unknown as number`, com a história inteira no cabeçalho) e mais três
//    iguais escritos à mão (`conflitos.ts`, os dois `dev-destrutivo.ts`);
//  · no RETORNO, ele tipa toda coluna de `returns table (…)` e todo escalar como NÃO-NULOS.
//    `rel_estoque_asof` devolve `colaborador`/`setor` NULL para ativo sem detentor, e
//    `papel_atual()` devolve NULL para perfil desativado — o tipo gerado diz que não.
//
// A porta corrige as duas mentiras NUM LUGAR SÓ, por MAPAS NOMINAIS — função × parâmetro (ou
// coluna) × motivo × evidência —, e `rpc-mapas-sql.test.ts` confere cada entrada contra o CORPO
// VIVO da função (o último `create or replace` nas migrations). Nada é alargado por atacado:
// um `null` num parâmetro fora do mapa continua sendo erro de compilação, e o consumidor que
// supunha não-nula uma coluna do mapa passa a não compilar — que é o conserto aparecendo.
//
// POR QUE DEVOLVE O BUILDER, E NÃO A PROMESSA RESOLVIDA (fato 4 da ordem): `relatorios/itens.ts`
// põe três builders num `Promise.all`, `queries/itens.ts` faz `Promise.all` de um `map` de
// builders, e `relatorios/estoque.ts` encadeia `.order('ativo_id').range(from, to)` no builder
// de `rel_estoque_asof` dentro de `paginarTodos`. `.single()`/`.maybeSingle()` continuam
// disponíveis.
//
// ⚠ `.returns<>()` É DE PROPÓSITO, contra o aviso de depreciação da lib. É a ÚNICA forma de
// trocar o tipo do resultado PRESERVANDO o builder: `.returns()` de `PostgrestTransformBuilder`
// devolve um `PostgrestTransformBuilder` (com `.order()`/`.range()`), e o `.overrideTypes()` que
// o JSDoc recomenda só existe em `PostgrestBuilder` — devolve um builder TERMINAL, e o
// `.order().range()` do as-of deixaria de compilar no call-site, não aqui. Medido na exploração
// da F58 (`@supabase/postgrest-js` 2.112.4, `index.d.mts` linhas 852, 951 e 1735). O que se perde
// são os filtros (`.eq()`, `.in()`…), que nenhuma chamada de RPC usa.
//
// ONDE MORA, E POR QUE SEM `server-only`: o módulo é só tipo mais uma linha de runtime, não
// carrega `select` nem nome de coluna de tabela, e precisa ser importável por
// `scripts/manutencao/validar-truncamento.ts` e pelo conferidor de formas, que rodam por `tsx`.

type Funcoes = Database['public']['Functions']

/** O nome de toda função que o `database.ts` conhece. */
export type NomeRpc = keyof Funcoes

/** Uma entrada de mapa: o PORQUÊ, e o trecho do corpo vivo que o prova. */
export type EntradaDeMapa = { readonly motivo: string; readonly evidencia: string }

// ---------------------------------------------------------------------------
// 1. ARGUMENTOS que o app passa NULL de propósito — e a função aceita como VALOR DE DOMÍNIO
// ---------------------------------------------------------------------------

/**
 * O recorte das sete `rel_*`: NULL em `p_filial` é o relatório CONSOLIDADO.
 *
 * ⚠ É ESTA A LINHA QUE A F60 TROCA. Quando `p_filial smallint` virar `p_filiais smallint[]
 * not null`, a entrada deixa de existir (não há mais NULL de domínio) — e as sete `rel_*`
 * mudam juntas, porque todas apontam para esta constante.
 */
const RECORTE_DO_RELATORIO = {
  p_filial: {
    motivo:
      'NULL é o relatório CONSOLIDADO (todas as filiais) — é o que /relatorios/geral pede desde a F3',
    evidencia: 'p_filial is null or',
  },
} as const satisfies Record<string, EntradaDeMapa>

/** O alcance da Zona destrutiva (F23): NULL em `p_filial` é o reset GLOBAL. */
const ALCANCE_DO_RESET = {
  p_filial: {
    motivo: 'NULL é o alcance GLOBAL da Zona destrutiva (todas as filiais), escolhido na tela do dev',
    evidencia: 'p_filial is null or',
  },
} as const satisfies Record<string, EntradaDeMapa>

type MapaDeArgumentos = {
  readonly [N in NomeRpc]?: { readonly [P in keyof Funcoes[N]['Args']]?: EntradaDeMapa }
}

export const ARGUMENTOS_ANULAVEIS = {
  rel_estoque_asof: RECORTE_DO_RELATORIO,
  rel_saldo_itens: RECORTE_DO_RELATORIO,
  rel_mov_itens: RECORTE_DO_RELATORIO,
  rel_frescor_itens: RECORTE_DO_RELATORIO,
  rel_mov_por_mes: RECORTE_DO_RELATORIO,
  rel_por_motivo: RECORTE_DO_RELATORIO,
  rel_resumo: RECORTE_DO_RELATORIO,
  previa_reset: ALCANCE_DO_RESET,
  resetar_acervo: ALCANCE_DO_RESET,
  resetar_itens: ALCANCE_DO_RESET,
  apagar_ativos_conflito_filiais: {
    p_backup_path: {
      motivo:
        'NULL é "sem arquivo": até 25 ativos o backup vai inline no evento, e só acima disso a função exige o caminho',
      evidencia: "coalesce(p_backup_path, '')",
    },
  },
} as const satisfies MapaDeArgumentos

// ---------------------------------------------------------------------------
// 2. RETORNOS que o corpo vivo devolve NULL e o gerador tipou como não-nulos
// ---------------------------------------------------------------------------

type MapaDeColunas = {
  readonly [N in NomeRpc]?: Funcoes[N]['Returns'] extends readonly (infer L)[]
    ? { readonly [C in keyof L]?: EntradaDeMapa }
    : never
}

export const COLUNAS_DE_RETORNO_ANULAVEIS = {
  rel_estoque_asof: {
    colaborador: {
      motivo: 'ativo em estado SEM detentor (estoque, triagem…) devolve o detentor NULL na data pedida',
      evidencia: "when not public.status_tem_detentor(coalesce(u.status_resultante, 'em_estoque')) then null",
    },
    setor: {
      motivo: 'mesma regra do colaborador: sem detentor, sem setor',
      evidencia: 'when u.tipo is null then null',
    },
    marca: {
      motivo: '`ativos.marca` é anulável e sai direto na linha',
      evidencia: 'a.marca',
    },
    modelo: {
      motivo: '`ativos.modelo` é anulável e sai direto na linha',
      evidencia: 'a.modelo',
    },
  },
  devolver_ao_fornecedor: {
    substituto_id: {
      motivo: 'sem substituto a coluna OUT nunca é atribuída — o caminho NORMAL de "devolver sem troca"',
      evidencia: "if p_substituto is not null and jsonb_typeof(p_substituto) = 'object' then",
    },
    substituto_mov_id: {
      motivo: 'mesma regra do substituto_id',
      evidencia: "if p_substituto is not null and jsonb_typeof(p_substituto) = 'object' then",
    },
  },
} as const satisfies MapaDeColunas

/** RPCs cujo retorno ESCALAR pode ser NULL. */
export const ESCALARES_ANULAVEIS = {
  papel_atual: {
    motivo:
      'perfil desativado, arquivado ou sem sessão: o select não acha linha e a função sql devolve NULL — é "sem cargo", não erro',
    evidencia: 'and p.ativo and p.excluido_em is null',
  },
  ultima_migracao_aplicada: {
    motivo: 'banco sem a tabela de histórico de migrations (ou vazia) devolve NULL',
    evidencia: 'when undefined_table then return null',
  },
  rotulo_de_ambiente: {
    motivo: 'produção não tem linha em public.ambiente — o select sql devolve NULL',
    evidencia: 'from public.ambiente a order by a.rotulo limit 1',
  },
} as const satisfies { readonly [N in NomeRpc]?: EntradaDeMapa }

// ---------------------------------------------------------------------------
// 3. Os tipos da porta
// ---------------------------------------------------------------------------

type ParametroAnulavel<N extends NomeRpc> = N extends keyof typeof ARGUMENTOS_ANULAVEIS
  ? keyof (typeof ARGUMENTOS_ANULAVEIS)[N]
  : never

/** `Json` no argumento vira `JsonSerializavel` — ver `src/lib/supabase/json.ts`. */
type ArgumentoDaPorta<T> = [Json] extends [NonNullable<T>]
  ? [NonNullable<T>] extends [Json]
    ? JsonSerializavel | Extract<T, undefined>
    : T
  : T

/** Os argumentos da função N como a porta os aceita. */
export type ArgumentosDaPorta<N extends NomeRpc> = {
  [P in keyof Funcoes[N]['Args']]: P extends ParametroAnulavel<N>
    ? ArgumentoDaPorta<Funcoes[N]['Args'][P]> | null
    : ArgumentoDaPorta<Funcoes[N]['Args'][P]>
}

type ColunaAnulavel<N extends NomeRpc> = N extends keyof typeof COLUNAS_DE_RETORNO_ANULAVEIS
  ? keyof (typeof COLUNAS_DE_RETORNO_ANULAVEIS)[N]
  : never

type LinhaDaPorta<N extends NomeRpc, L> = {
  [C in keyof L]: C extends ColunaAnulavel<N> ? L[C] | null : L[C]
}

/** O resultado da função N como a porta o entrega — com as mentiras do mapa corrigidas. */
export type ResultadoDaPorta<N extends NomeRpc> = N extends keyof typeof ESCALARES_ANULAVEIS
  ? Funcoes[N]['Returns'] | null
  : Funcoes[N]['Returns'] extends readonly (infer L)[]
    ? LinhaDaPorta<N, L>[]
    : Funcoes[N]['Returns']

type Resto<N extends NomeRpc> = [Funcoes[N]['Args']] extends [never]
  ? []
  : [argumentos: ArgumentosDaPorta<N>]

/**
 * Chama a função `nome` do banco — a ÚNICA forma de chamar RPC em `src/**`
 * (`rpc-unica-porta.test.ts`). Devolve o BUILDER: dá para `await`, pôr num `Promise.all` e
 * encadear `.order()`/`.range()`/`.single()`.
 */
export function chamarRpc<N extends NomeRpc>(
  client: SupabaseClient<Database>,
  nome: N,
  ...resto: Resto<N>
) {
  // O ÚNICO cast de argumento de RPC do sistema. Ele existe porque o tipo gerado é mais
  // estreito que a função real nas entradas dos mapas acima — e só nelas; o valor não muda.
  const argumentos = resto[0] as Funcoes[N]['Args'] | undefined
  return client.rpc(nome, argumentos).returns<ResultadoDaPorta<N>>()
}

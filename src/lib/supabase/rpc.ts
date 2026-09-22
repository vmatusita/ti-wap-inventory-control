import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import type { JsonSerializavel } from '@/lib/supabase/json'

// A PORTA ÚNICA DE RPC (F58 · Frente B · Decisão 1).
//
// Toda chamada de função do banco em `src/**` passa por `chamarRpc`. Antes da F58 eram 37
// `.rpc(` espalhados, e o tipo do que entrava e saía era o do GERADOR — que mente nos dois
// sentidos:
//
//  · no ARGUMENTO, ele não distingue "aceita NULL" de "não aceita". As funções da Zona
//    destrutiva recebem `p_filial smallint`, não são `strict`, e tratam `p_filial is null` como o
//    alcance GLOBAL; o gerador emite `p_filial: number`. Até a F58 isso era calado por casts —
//    `filialParaRpc` (`as unknown as number`, com a história inteira no cabeçalho) e mais três
//    iguais escritos à mão (`conflitos.ts`, os dois `dev-destrutivo.ts`). (Até a F60 as sete
//    `rel_*` de relatório tinham o mesmo NULL de domínio — o consolidado —; a F60 as trocou pelas
//    `rel_*_filiais`, com a lista `p_filiais` OBRIGATÓRIA, e elas saíram deste mapa: `null` num
//    recorte de relatório deixou de compilar);
//  · no RETORNO, ele tipa toda coluna de `returns table (…)` e todo escalar como NÃO-NULOS.
//    `rel_estoque_asof_filiais` devolve `colaborador`/`setor` NULL para ativo sem detentor, e
//    `papel_atual()` devolve NULL para perfil desativado — o tipo gerado diz que não.
//
// A porta corrige as duas mentiras NUM LUGAR SÓ, por MAPAS NOMINAIS — função × parâmetro (ou
// coluna) × motivo × evidência —, e `rpc-mapas-sql.test.ts` confere cada entrada contra o CORPO
// VIVO da função (o último `create or replace` nas migrations). Nada é alargado por atacado:
// um `null` num parâmetro fora do mapa continua sendo erro de compilação, e o consumidor que
// supunha não-nula uma coluna do mapa passa a não compilar — que é o conserto aparecendo.
//
// POR QUE DEVOLVE O BUILDER, E NÃO A PROMESSA RESOLVIDA (fato 4 da ordem): `relatorios/itens.ts`
// põe três builders num `Promise.all`, e `relatorios/estoque.ts` encadeia
// `.order('ativo_id').range(from, to)` no builder de `rel_estoque_asof_filiais` dentro de
// `paginarTodos`. `.single()`/`.maybeSingle()` continuam disponíveis.
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

// ⚠ F60 — O RECORTE DOS RELATÓRIOS NÃO MORA MAIS AQUI, e a ausência é a regra. Até a F59 as sete
// `rel_*` apontavam para uma constante `RECORTE_DO_RELATORIO` (NULL em `p_filial` = o consolidado).
// As substitutas (`rel_*_filiais`, migration 0143) recebem `p_filiais smallint[]` e NÃO tratam o
// nulo como domínio — NULL e `'{}'` dão zero linhas —, então nenhuma delas pode estar neste mapa:
// `chamarRpc(client, 'rel_resumo_filiais', { p_filiais: null, … })` não compila
// (`linhas-tipos.test.ts` prova), e o consolidado é a LISTA de todas as filiais, montada num lugar
// só (`recorteDeFiliais`, `src/lib/queries/relatorios/recorte-filiais.ts`). Uma `rel_*` que voltar a
// este mapa estaria declarando um nulo que significa "tudo" — a forma que a F60 existe para proibir
// (a trava de recorte, `rpcs-recorte-sql.test.ts`, a reprovaria de qualquer jeito no corpo).

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
  // F60 (0143) — a chave e as evidências migraram 1:1 do as-of velho (`0134`) para o corpo novo, por
  // lateral: o `status_tem_detentor` passou a ser calculado uma vez por linha (a lateral `d`), e o
  // `when u.tipo is null then null` não existe mais (o `cross join lateral` já não produz linha sem
  // movimentação efetiva).
  rel_estoque_asof_filiais: {
    colaborador: {
      motivo: 'ativo em estado SEM detentor (estoque, triagem…) devolve o detentor NULL na data pedida',
      evidencia: 'when not d.tem_detentor then null',
    },
    setor: {
      motivo:
        'mesma regra do colaborador (sem detentor, sem setor), e o setor lido do retrato anterior sai NULL quando o retrato não o tem',
      evidencia: "else u.snapshot_anterior ->> 'setor'",
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
  // F60 (0143) — o saldo em DOIS NÍVEIS: a linha do NÍVEL DO TOTAL do recorte sai com `filial_id`
  // NULL (o gerador tipa a coluna de `returns table` como não-nula). Quem lê escolhe o nível pelo
  // nulo — `queries/itens.ts` e `relatorios/itens.ts`.
  rel_saldo_itens_filiais: {
    filial_id: {
      motivo:
        'o nível do TOTAL do recorte (uma linha por item) sai com filial_id NULL, ao lado das linhas por filial',
      evidencia: 'select null::smallint where exists (select 1 from alvo)',
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
      'membership desativada, conta arquivada, sem membership na empresa legada ou sem sessão (F62: o cargo mora em membros): o select não acha linha e a função sql devolve NULL — é "sem cargo", não erro',
    evidencia: 'and m.ativo and p.excluido_em is null',
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

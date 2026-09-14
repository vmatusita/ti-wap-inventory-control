import 'server-only'
import {
  lerUnidades,
  type FamiliaDeUnidade,
  type UnidadesEfetivas,
} from '@/lib/auth/recorte-leitura'

// O RECORTE DE UNIDADE NUMA CONSULTA — o único lugar que traduz `UnidadesEfetivas` em filtro do
// PostgREST (F57 · Frente H).
//
// POR QUE UMA FUNÇÃO, e não um `if` em cada query. A convenção antiga se escrevia assim, em sete
// arquivos: `if (filialIds.length > 0) q = q.in('filial_id', filialIds)`. É exatamente essa linha
// que vira fail-open no dia em que a lista chegar vazia por uma interseção — ela não filtra NADA,
// e a query devolve tudo. Com a vista de `recorte-leitura.ts` a lista vazia não existe, mas um
// `if` à mão poderia reinventá-la; aqui o `switch` é EXAUSTIVO sobre os quatro modos, e cada um
// tem o seu filtro.
//
//   `todas`               → nenhum filtro (hoje: dev, admin, consulta, a sentinela `todas`);
//   `lista`               → `.in(coluna, valores)` — ou, com o terceiro valor, as linhas SEM
//                           unidade junto (`.or(coluna.is.null, coluna.in.(…))`: `.is` e `.in` na
//                           mesma coluna se combinariam com AND e devolveriam zero linhas);
//   `somente-sem-unidade` → `.is(coluna, null)`;
//   `nenhuma`             → `.is(coluna, null)` E `.not(coluna, 'is', null)` — um filtro
//                           GARANTIDAMENTE falso. Não `.in(coluna, [])`: a documentação do PostgREST
//                           (v14, conferida em 14/09/2026) não descreve o `in.()` vazio, e a fase não
//                           aposta o comportamento de produção num caso não documentado.
//
// O cast estrutural fica CONTIDO aqui, pelo mesmo motivo de `aplicarFiltrosAtivos`
// (`queries/ativos.ts`): consultas com SELECTs diferentes têm tipos de builder diferentes, e o
// filtro de unidade é o mesmo para todas.

type FiltravelPorColuna = {
  in(coluna: string, valores: readonly (string | number)[]): FiltravelPorColuna
  is(coluna: string, valor: null): FiltravelPorColuna
  not(coluna: string, operador: string, valor: string | null): FiltravelPorColuna
  or(filtros: string): FiltravelPorColuna
}

// O `.or()` interpola os valores no texto do filtro: só passa o que tem a forma de um id ou de um
// slug (`url-params.ts`), nunca uma vírgula, um ponto ou um parêntese que mudaria a gramática.
const VALOR_SEGURO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Aplica o recorte de unidade a uma consulta do PostgREST, na `coluna` que guarda a unidade
 * (`filial_id` para a família por id; `filial`, o slug das views, para a família por slug).
 */
export function recortarPorUnidade<Q, F extends FamiliaDeUnidade>(
  consulta: Q,
  coluna: string,
  unidades: UnidadesEfetivas<F>,
): Q {
  const q = consulta as unknown as FiltravelPorColuna
  const vista = lerUnidades(unidades)
  switch (vista.modo) {
    case 'todas':
      return consulta
    case 'lista': {
      const valores: readonly (string | number)[] = vista.valores
      if (!vista.incluiSemUnidade) return q.in(coluna, valores) as unknown as Q
      for (const v of valores) {
        if (!VALOR_SEGURO.test(String(v))) {
          throw new Error(`Valor de unidade fora do formato no filtro: ${JSON.stringify(v)}`)
        }
      }
      return q.or(`${coluna}.is.null,${coluna}.in.(${valores.join(',')})`) as unknown as Q
    }
    case 'somente-sem-unidade':
      return q.is(coluna, null) as unknown as Q
    case 'nenhuma':
      return q.is(coluna, null).not(coluna, 'is', null) as unknown as Q
  }
}

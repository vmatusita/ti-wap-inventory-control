import { TriangleAlert } from 'lucide-react'
import { Aviso } from '@/components/layout/aviso'
import type { CorteDeTabela } from '@/lib/relatorios/tipos'

// F60 (fato 16 · PLAN-F60 §10, decisão 6) — o aviso de que uma tabela detalhada foi CORTADA no teto.
//
// O molde é a fila de consolidação (`components/admin/fila-consolidacao.tsx`): "a lista abaixo
// mostra os N mais frequentes — há T no total". Aqui a lista é a das movimentações do período, a
// ordem é a das mais recentes, e o T é o `count exact` da mesma consulta (`corte.total`), nunca o
// tamanho da lista. SÓ APARECE COM O CORTE: sem a chave — todo relatório no volume de hoje, e todo
// snapshot gerado antes da F60 —, não renderiza nada, e a tabela fica exatamente como era.
//
// `atencao` e não `informacao`: a tabela está INCOMPLETA, e quem a lê (ou imprime) tem de saber
// antes de tirar conclusão dela — é o `role="status"` do `Aviso`, que o leitor de tela anuncia sem
// interromper. Sem `print:hidden`, de propósito: o papel é o substituto do e-mail arquivável, e uma
// tabela cortada no papel sem o aviso seria o número truncado com cara de certo que o teto não pode
// criar.
//
// Os três nomes (saídas, entradas, transferências) são femininos, daí o artigo fixo "as".
export function AvisoTetoTabela({
  corte,
  plural,
  temFiltros = true,
  aoVivo = false,
}: {
  /** Ausente = a tabela não foi cortada → o componente não renderiza nada. */
  corte: CorteDeTabela | undefined
  /** O nome da tabela no plural, minúsculo ("saídas"). */
  plural: string
  /** Transferências só tem a busca livre, sem os selects de filtro. */
  temFiltros?: boolean
  /** Ao vivo dá para encurtar o período; o snapshot congelado guardou só o que mostra. */
  aoVivo?: boolean
}) {
  if (!corte) return null
  const mostradas = corte.mostradas.toLocaleString('pt-BR')
  const total = corte.total.toLocaleString('pt-BR')
  return (
    <Aviso intencao="atencao" icone={<TriangleAlert className="size-4" aria-hidden />}>
      A tabela mostra as{' '}
      <span className="font-medium tabular-nums">{mostradas}</span> {plural} mais recentes — há{' '}
      <span className="font-medium tabular-nums">{total}</span> no período.{' '}
      {temFiltros ? 'A busca e os filtros consideram' : 'A busca considera'} só as exibidas
      {aoVivo
        ? '; para ver as demais, encurte o período.'
        : ', e este relatório gerado guardou só essas.'}
    </Aviso>
  )
}

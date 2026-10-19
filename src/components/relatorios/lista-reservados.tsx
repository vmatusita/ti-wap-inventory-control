import { rotuloCategoria } from '@/lib/dominio'
import { ouTraco } from '@/lib/format'
import { agruparReservados, rotuloReservados } from '@/lib/relatorios/reservados'
import type { ItemReservado } from '@/lib/relatorios/tipos'

// "Reservados" — patrimônio · modelo · nº do chamado (OS-F3 3.2.3), como no e-mail ("30
// reservadas: #8461 #9176 …"). O chamado já é campo da movimentação.
//
// v1.71.1 — SEPARADO POR CATEGORIA, no molde do card vizinho "Disponíveis por modelo"
// (`lista-modelo-categoria.tsx`): o rótulo da categoria à esquerda, "N reservados" à direita, e
// as linhas de sempre embaixo, na ordem de categoria do vizinho (`agruparReservados`). Com duas
// categorias ou mais, uma linha de chips no topo resume os totais — e os chips são RESUMO: nada
// aqui é link, filtro ou âncora (o visualizador por senha lê este card, e ele nunca ganha
// `href`). O total do card mora no subtítulo, que o corpo do relatório monta com
// `rotuloReservados`.
//
// Snapshot gerado antes da v1.71.1 (e todo snapshot v1) não tem a categoria: o card mostra a
// lista corrida de antes, sem chips e sem grupos, e não lê o banco para descobri-la.
//
// IMPRESSÃO: o cabeçalho do grupo leva `break-after-avoid` e cada linha `break-inside-avoid` —
// o cabeçalho nunca fica sozinho no pé da folha, separado da primeira linha dele.
function Linhas({ itens }: { itens: readonly ItemReservado[] }) {
  return (
    <ul className="divide-y">
      {itens.map((i, k) => (
        <li
          // O índice entra na chave: sem plaqueta o patrimônio é "—", e dois do mesmo modelo
          // repetiriam `patrimonio + modelo`.
          key={`${i.patrimonio}·${i.modelo}·${k}`}
          className="flex break-inside-avoid items-baseline gap-3 py-1.5 text-xs"
        >
          <span className="w-24 shrink-0 font-semibold tabular-nums">
            {i.patrimonio}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground/70">
            {i.modelo}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {i.chamado ? `#${ouTraco(i.chamado)}` : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function ListaReservados({ itens }: { itens: readonly ItemReservado[] }) {
  const { grupos } = agruparReservados(itens)
  if (grupos === null) return <Linhas itens={itens} />

  return (
    <div className="space-y-4">
      {grupos.length >= 2 && (
        <ul aria-label="Reservados por categoria" className="flex flex-wrap gap-1.5">
          {grupos.map((g) => (
            <li key={g.categoria} className="rounded-full bg-muted px-3 py-0.5 text-xs">
              {rotuloCategoria(g.categoria)}{' '}
              <span className="font-semibold tabular-nums">
                {g.total.toLocaleString('pt-BR')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {grupos.map((g) => (
        <div key={g.categoria}>
          <div className="mb-1.5 flex break-after-avoid items-baseline justify-between">
            <h4 className="text-xs font-semibold text-foreground/80">
              {rotuloCategoria(g.categoria)}
            </h4>
            <span className="text-xs text-muted-foreground tabular-nums">
              {rotuloReservados(g.total)}
            </span>
          </div>
          <Linhas itens={g.itens} />
        </div>
      ))}
    </div>
  )
}

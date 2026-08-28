import { listarItensAdmin } from '@/lib/queries/itens'
import { listarTiposItem } from '@/lib/queries/tipos-item'
import { ItemDialog } from '@/components/admin/item-dialog'
import { ItensTabela } from '@/components/admin/itens-tabela'

// FLX-03 — título curto da aba (WCAG 2.4.2). "Catálogo de itens", e não só
// "Itens": a tela `/itens` (saldos por quantidade) já usa esse título curto —
// mesma sentinela em duas abas seria a própria falha que a fase corrige.
export const metadata = {
  title: 'Catálogo de itens',
}

export default async function AdminItensPage() {
  const [itens, tipos] = await Promise.all([
    listarItensAdmin(),
    // O catálogo INTEIRO de tipos, inclusive os desativados: um item que aponta para
    // um tipo desativado precisa continuar exibindo o rótulo dele na coluna “Tipo”.
    // Com só os ativos, o select saía EM BRANCO e a busca chamava o item de “sem
    // tipo” (revisão de 28/08/2026). Quem escolhe o que é oferecido é o componente.
    listarTiposItem(),
  ])
  const semTipo = itens.filter((i) => i.tipo_id == null).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Catálogo de acessórios, periféricos e componentes controlados por quantidade.
        </p>
        <ItemDialog />
      </div>

      {/* F37/B.4 — o selo dos sem tipo. Diz o número na cara em vez de deixar o
          admin descobrir rolando a lista; some sozinho quando o catálogo estiver
          todo classificado. Item sem tipo continua funcionando em tudo — só não vai
          entrar no termo pelo nome do tipo (D8). */}
      {semTipo > 0 && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{semTipo}</span>{' '}
          {semTipo === 1 ? 'item ainda não tem tipo' : 'itens ainda não têm tipo'}.
          Escolher o tipo é opcional e pode ser feito aos poucos, na coluna “Tipo”.
        </p>
      )}

      {/* F29/ADM-03a — a tabela (que vivia inline aqui) virou Client Component só por
          causa do filtro; a leitura continua no servidor, e o array desce pronto. */}
      <ItensTabela itens={itens} tipos={tipos} />
    </div>
  )
}

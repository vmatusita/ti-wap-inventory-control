import { ChevronDown, PackageOpen } from 'lucide-react'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dica } from '@/components/ui/dica'
import { formatDate } from '@/lib/format'
import { TIPO_LANCAMENTO_META } from '@/lib/dominio'
import { PREFIXO_REGULARIZACAO } from '@/lib/itens/regularizacao'
import type { ItemQueFoiJunto } from '@/lib/queries/itens'

// "O que foi junto" (F38 · frente A) — a pergunta que até esta fase não tinha
// resposta possível.
//
// `lancamentos_item` (0015) não tinha elo nenhum com `movimentacoes`: o único fio
// era o campo de texto `chamado`, que nem sempre existe e nunca foi chave. Saber
// que o fone saiu com ESTE notebook era palpite. Com `movimentacao_id` (0116),
// virou um JOIN — e é por isso que a coluna aponta a MOVIMENTAÇÃO, e não o ativo:
// a movimentação já sabe qual é o ativo, e uma segunda cópia da mesma verdade
// seria um lugar novo para as duas discordarem.
//
// O cartão só aparece quando há o que mostrar: ativo que nunca levou periférico
// não ganha uma caixa vazia dizendo isso.
//
// F42 — O SELO "regularizado". A F41 acabou com o bloqueio que fazia a devolução
// do equipamento ser recusada quando o acessório não estava no diário: agora ela
// PARTE a quantidade e grava um acerto de contagem pela parte que o sistema não
// conhecia. Essa linha aparece aqui como qualquer outra, e sem o selo o operador
// leria "Ajuste +1" ao lado do notebook sem entender por que ele existe.
//
// A frase do selo sai de `PREFIXO_REGULARIZACAO` (`lib/itens/regularizacao.ts`),
// que é o mesmo texto que abre a justificativa gravada no banco — o vocabulário é
// um só, e ninguém redigita.
//
// ============================================================================
// F44 — O BLOCO DESCEU E PASSOU A ABRIR FECHADO
// ============================================================================
// Até a v1.48.0 este cartão era renderizado ANTES do card "Dados do ativo", dos
// termos e da linha do tempo. Quem abria a ficha de um notebook via primeiro a
// lista de acessórios que saíram junto. O Johnny, em 01/09/2026:
//
//   "quando vou abrir detalhes de um ativo, preciso que o historico de
//    movimentacoes de itens seja mais discreto ou mude a ordem, ele é algo
//    secundario e fica logo no topo, preciso dele mais discreto ou colapsavel,
//    para que eu possa ver antes dados do ativo, termos e linha do tempo do ativo
//    que é mais importante que os itens"
//
// Ele desceu para DEPOIS da linha do tempo e passou a abrir RECOLHIDO, com a
// contagem no título — quem quiser os acessórios continua a um clique deles.
//
// ⚠ `<details>`/`<summary>`, E A ESCOLHA É POR CUSTO. Não existe `Collapsible` em
// `src/components/ui/` e a regra 3 do `CLAUDE.md` proíbe instalar um. As duas
// saídas eram `<details>` ou `BotaoExpandir`/`useExpandidas`
// (`components/relatorios/linha-expansivel.tsx`) — e essa segunda é CLIENT.
// Adotá-la transformaria este Server Component (e o irmão de pendências, que
// embute dois diálogos e recebe props de cargo) em client, arrastando os dois para
// o bundle do navegador sem ganho nenhum. `<details>` mantém tudo no servidor,
// custa ZERO JavaScript, e o navegador já expõe `<summary>` como botão com estado
// expandido para leitor de tela — o `aria-expanded` é nativo, e não escrito à mão.
export function ItensQueForamJunto({ itens }: { itens: ItemQueFoiJunto[] }) {
  if (itens.length === 0) return null

  return (
    <Card>
      {/* `group` para o chevron girar com `group-open:` — sem uma linha de JS. */}
      <details className="group">
        <summary
          // `min-h-10` é o alvo de toque de 40px, a régua de acessibilidade da
          // casa. `list-none` + `[&::-webkit-details-marker]:hidden` tiram o
          // triangulinho nativo, que aparece em posição e tamanho diferentes em
          // cada navegador; o chevron do produto entra no lugar dele.
          className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
        >
          <PackageOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <CardTitle>
              {/* A CONTAGEM NO TÍTULO. Fechado, o bloco tem de dizer QUANTO ele
                  esconde — senão recolher vira sumir. */}
              Itens que foram junto ({itens.length.toLocaleString('pt-BR')})
            </CardTitle>
            <CardDescription>
              Acessórios por quantidade registrados nas movimentações deste equipamento.
            </CardDescription>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <CardContent className="pt-4">
          <ul className="divide-y text-sm">
            {itens.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{l.item}</span>
                <Badge variant="secondary" className="shrink-0">
                  {TIPO_LANCAMENTO_META[l.tipo].rotulo}
                </Badge>
                {l.regularizacao && (
                  <Dica
                    texto={`${PREFIXO_REGULARIZACAO}: esta quantidade entrou no acervo junto com a movimentação, porque o item não estava registrado no estoque da filial.`}
                    className="inline-flex shrink-0"
                  >
                    {/* `variant="warning"` do kit, e não o par `amber-100/amber-800`
                        escrito à mão: a tinta sai do token `--warning`, e a catraca de
                        cor crua (`src/lib/dominio/cores.test.ts`) só desce. */}
                    <Badge variant="warning">regularizado</Badge>
                  </Dica>
                )}
                <span className="shrink-0 tabular-nums">{l.quantidade}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {formatDate(l.data)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </details>
    </Card>
  )
}

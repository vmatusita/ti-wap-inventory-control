import { PackageOpen } from 'lucide-react'
import type { SaldoDoColaborador } from '@/lib/queries/itens'

// "Com esta pessoa" (F38 · frente C) — o bloco que responde "o que o João está
// com ele", que até esta fase não tinha resposta possível: `lancamentos_item`
// registrava o nome em texto livre e ninguém somava por pessoa.
//
// A conta é `Σ saida(pessoa) − Σ retorno(pessoa)` por item e filial — uma
// PARTIÇÃO de `liberados` (cabeçalho da 0027), não uma conta nova. Somando todas
// as pessoas mais as linhas sem vínculo dá exatamente o `liberados` que a tela de
// itens sempre mostrou: **nenhum número mudou** por causa deste bloco.
//
// ⚠ A HONESTIDADE QUE A F37 INSTALOU CONTINUA. Enquanto houver lançamento antigo
// sem vínculo com o cadastro, o bloco DIZ quantos são, em vez de fingir um total
// completo. Quem não tem nada vinculado vê a frase, não uma lista vazia que
// pareceria "não está com nada".
//
// Sem rota nova de propósito (§C.2 da ordem): é um bloco, dentro de tela que já
// existe — a rota nova acordaria os guardas F20/F27 inteiros (ajuda, paleta,
// título de aba, smoke) para nada.
export function ComEstaPessoa({
  saldos,
  semVinculo = 0,
  compacto = false,
}: {
  saldos: SaldoDoColaborador[]
  /** Quantos lançamentos do sistema inteiro ainda não têm vínculo (agregado no SQL). */
  semVinculo?: number
  /** Dentro de um diálogo, o bloco perde o cabeçalho e a borda. */
  compacto?: boolean
}) {
  const corpo =
    saldos.length === 0 ? (
      <p className="text-muted-foreground text-sm">
        Nenhum item por quantidade registrado com esta pessoa.
      </p>
    ) : (
      <ul className="divide-y text-sm">
        {saldos.map((s) => (
          <li
            key={`${s.item_id}-${s.filial_id}`}
            className="flex items-center justify-between gap-3 py-1.5"
          >
            <span className="min-w-0 truncate">
              {s.item}
              <span className="text-muted-foreground"> · {s.filial}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">{s.com_a_pessoa}</span>
          </li>
        ))}
      </ul>
    )

  const rodape =
    semVinculo > 0 ? (
      <p className="text-muted-foreground mt-2 text-xs">
        {semVinculo === 1
          ? 'Há 1 lançamento de item mais antigo que ainda não está ligado a um cadastro — ele não entra nesta conta.'
          : `Há ${semVinculo} lançamentos de item mais antigos que ainda não estão ligados a um cadastro — eles não entram nesta conta.`}
      </p>
    ) : null

  if (compacto) {
    return (
      <div>
        {corpo}
        {rodape}
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <PackageOpen className="size-4" aria-hidden />
        Com esta pessoa
      </h3>
      {corpo}
      {rodape}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { PackageOpen } from 'lucide-react'
import { ComEstaPessoa } from '@/components/itens/com-esta-pessoa'
import {
  buscarSaldoPorNomeDeColaborador,
  type SaldoDoColaborador,
} from '@/lib/actions/colaboradores'

// "Com esta pessoa" dentro da DEVOLUÇÃO (F38 · §C.2 e §C.3).
//
// POR QUE ELE APARECE AQUI. Conferir uma devolução é decidir o que voltou — e o
// operador precisa ver, ao lado do checklist, o que o sistema tem registrado com
// aquela pessoa. Sem isso, "Voltou" vira chute.
//
// ⚠ E ELE DIZ A VERDADE SOBRE A §C.3. Quando a pessoa não está no cadastro, ou
// quando não há nada registrado com ela, o bloco avisa que a devolução vai repor
// o estoque **sem baixar conta de ninguém** — que é exatamente o que vai
// acontecer, e é o que faz "entrega antiga funciona igual" (D12). Nada disso é
// erro, e o texto não trata como erro.
//
// NENHUM ID VIAJA. O componente manda o TEXTO do campo Colaborador; quem resolve
// a chave é o servidor, na doutrina da F37.
export function ComEstaPessoaDevolucao({ nome }: { nome: string }) {
  const [estado, setEstado] = useState<{
    saldos: SaldoDoColaborador[]
    semVinculo: number
    cadastrado: boolean
  } | null>(null)

  const limpo = nome.trim()

  useEffect(() => {
    if (!limpo) return
    let vivo = true
    // Debounce curto: o nome é digitado letra a letra, e cada tecla não pode
    // virar um round-trip (mesmo idioma do combobox de ativo).
    const t = setTimeout(async () => {
      const r = await buscarSaldoPorNomeDeColaborador(limpo)
      if (!vivo) return
      setEstado(
        r.ok ? { saldos: r.saldos, semVinculo: r.semVinculo, cadastrado: r.cadastrado } : null,
      )
    }, 400)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [limpo])

  // Campo vazio não mostra bloco nenhum — e a checagem fica na RENDERIZAÇÃO, não
  // num `setState` dentro do efeito (que o lint recusa, e com razão: seria um
  // render a mais para dizer o que já dá para saber olhando a prop).
  if (!limpo || !estado) return null

  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <PackageOpen className="size-4" aria-hidden />
        Com esta pessoa
      </h3>
      {!estado.cadastrado ? (
        <p className="text-muted-foreground text-sm">
          Este nome ainda não está no cadastro de pessoas. Marcar &ldquo;Voltou&rdquo; repõe o
          acessório no estoque do mesmo jeito — só não baixa conta de ninguém.
        </p>
      ) : (
        <>
          <ComEstaPessoa saldos={estado.saldos} semVinculo={estado.semVinculo} compacto />
          {estado.saldos.length === 0 && (
            <p className="text-muted-foreground mt-2 text-xs">
              Marcar &ldquo;Voltou&rdquo; repõe o acessório no estoque do mesmo jeito — sem
              inventar dívida que não foi registrada.
            </p>
          )}
        </>
      )}
    </div>
  )
}

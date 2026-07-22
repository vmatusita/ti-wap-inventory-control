'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  buscarSugestoesColaboradores,
  buscarSugestoesSetores,
} from '@/lib/actions/movimentacoes'

// F10/M4 — colaborador e setor eram texto livre redigitado a cada movimentacao
// ("Fulano da Silva" x "fulano silva"). Agora o campo sugere o que JA existe no
// acervo, via `datalist` NATIVO (decisao §2 da OS-F10): funciona no teclado e no
// celular sem componente novo, e nao bloqueia nada — texto novo continua valendo
// (nenhuma validacao nova; o nome de quem entrou hoje ainda nao esta no banco).
//
// Debounce de 300ms e minimo de 2 caracteres, iguais aos do combobox de ativos;
// o proxy do W1 repete a guarda de 2 chars do lado do servidor.
const BUSCA = {
  colaborador: buscarSugestoesColaboradores,
  setor: buscarSugestoesSetores,
} as const

export function CampoComSugestoes({
  id,
  rotulo,
  campo,
  valor,
  onChange,
  placeholder,
}: {
  id: string
  rotulo: string
  campo: keyof typeof BUSCA
  valor: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [sugestoes, setSugestoes] = useState<string[]>([])
  const listaId = `${id}-sugestoes`
  // `true` só enquanto a ÚLTIMA alteração do campo tiver vindo do datalist (o
  // navegador reporta `inputType: 'insertReplacementText'` ao aceitar uma opção).
  // É o que separa "aceitei a sugestão com Enter" de "terminei de digitar e
  // quero avançar" — ver o onKeyDown abaixo.
  const veioDoDatalist = useRef(false)

  useEffect(() => {
    const q = valor.trim()
    let vivo = true
    // Estado alterado SO dentro do callback assincrono (react-hooks/set-state-in-effect).
    const t = setTimeout(async () => {
      if (q.length < 2) {
        if (vivo) setSugestoes([])
        return
      }
      const res = await BUSCA[campo](q)
      if (vivo) setSugestoes(res)
    }, q.length < 2 ? 0 : 300)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [valor, campo])

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        list={listaId}
        autoComplete="off"
        value={valor}
        onChange={(e) => {
          const nativo = e.nativeEvent as Partial<InputEvent>
          veioDoDatalist.current = nativo.inputType === 'insertReplacementText'
          onChange(e.target.value)
        }}
        // O wizard avanca de passo no Enter (handler no <div> do form). No
        // Chrome, escolher uma opcao do `datalist` com Enter TAMBEM dispara o
        // keydown na pagina — sem isto, aceitar a sugestao pularia direto para a
        // Revisao.
        //
        // A condicao NAO pode ser `sugestoes.length > 0`: as sugestoes ficam no
        // estado por 300ms de debounce e SOBRAM depois de aceitar uma opcao, o
        // que deixava o Enter inerte quase sempre e obrigava a clicar em
        // "Revisar" (regressao da F10 sobre o comportamento da F9). Engole so o
        // Enter que de fato fecha o popup: aquele em que a ultima alteracao veio
        // do proprio datalist — e uma unica vez, para o Enter seguinte avancar.
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (!veioDoDatalist.current) return
          veioDoDatalist.current = false
          e.stopPropagation()
        }}
        placeholder={placeholder}
      />
      <datalist id={listaId}>
        {sugestoes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}

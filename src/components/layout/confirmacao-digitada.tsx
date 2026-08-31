'use client'

import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dicaConfirmacaoNaoConfere } from '@/lib/validators/confirmacao-digitada'

// "DIGITE X PARA CONFIRMAR" — a caixa, uma só (F40).
//
// A MENSAGEM da dica já era única desde a F27 (`dicaConfirmacaoNaoConfere`); o
// que continuava copiado era a CAIXA em volta dela — rótulo, campo, o texto
// esperado em destaque, o `aria-invalid`, o `aria-describedby` e o `role="alert"`
// da dica —, em quatro telas: o import de startup, o apagar conta de
// `/admin/usuarios`, o diálogo da Zona destrutiva e a mesa de conflitos entre
// filiais. Quatro cópias que só se manteriam iguais enquanto ninguém mexesse
// numa delas — e uma delas JÁ tinha ficado sem `role="alert"` (F29/UXG-05).
//
// ⚠ ESTE COMPONENTE NASCE SEM CONSUMIDOR, como o `CascoDeAutenticacao` e o
// `CartaoDeMetrica`, e a revisão de 31/08/2026 pediu que a ausência ficasse
// ESCRITA em vez de descoberta por `grep`. As quatro telas que a caixa substitui
// vivem em `/admin/importar`, `/admin/usuarios`, `/dev/destrutivo` e
// `/pendencias` — nenhuma delas está no piloto, e as quatro são caminho
// DESTRUTIVO: trocar a caixa de confirmação delas junto com o layout misturaria
// duas classes de risco na mesma ordem. É matéria das frentes **a** e **c**.
//
// ⚠ A RÉGUA DE "O QUE CONTA COMO IGUAL" NÃO VEM PARA CÁ, e isso é deliberado:
// ela é diferente em cada tela porque o SERVIDOR de cada uma compara de um jeito
// (o import exige igualdade exata; apagar conta e a Zona destrutiva toleram
// caixa e espaço nas pontas). Afrouxar aqui habilitaria um botão que o servidor
// recusaria mesmo assim. Cada chamador calcula o próprio `confere` com a régua
// que já usa e passa o resultado — ver `src/lib/validators/confirmacao-digitada.ts`.

export function ConfirmacaoDigitada({
  rotulo,
  esperado,
  valor,
  confere,
  onChange,
  onEnter,
  desabilitado,
  id,
}: {
  /** A frase acima do campo, ex.: "Para confirmar, digite o nome da filial". */
  rotulo: React.ReactNode
  /** O texto que a pessoa tem de redigitar. Aparece em destaque e no placeholder. */
  esperado: string
  valor: string
  /** O chamador decide o que conta como igual — ver o aviso acima. */
  confere: boolean
  onChange: (v: string) => void
  /** Enter no campo dispara a ação, quando a tela quiser. */
  onEnter?: () => void
  desabilitado?: boolean
  /** Sobrescreve o id gerado, para quem já tem um id estável em teste ou smoke. */
  id?: string
}) {
  const gerado = useId()
  const idCampo = id ?? `confirmacao-${gerado}`
  const idDica = `${idCampo}-dica`
  const dica = dicaConfirmacaoNaoConfere(valor, confere, esperado)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={idCampo}>{rotulo}</Label>
      <p className="text-xs break-all text-muted-foreground">{esperado}</p>
      <Input
        id={idCampo}
        value={valor}
        autoComplete="off"
        placeholder={esperado}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter()
        }}
        disabled={desabilitado}
        aria-invalid={!!dica}
        aria-describedby={dica ? idDica : undefined}
      />
      {dica ? (
        <p id={idDica} role="alert" className="text-sm text-destructive">
          {dica}
        </p>
      ) : null}
    </div>
  )
}

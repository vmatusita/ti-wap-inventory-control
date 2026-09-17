'use client'

import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { dicaConfirmacaoNaoConfere } from '@/lib/validators/confirmacao-digitada'

// "DIGITE X PARA CONFIRMAR" — a caixa, uma só (F40 · F61).
//
// A MENSAGEM da dica já era única desde a F27 (`dicaConfirmacaoNaoConfere`); o
// que continuava copiado era a CAIXA em volta dela — rótulo, campo, o texto
// esperado em destaque, o `aria-invalid`, o `aria-describedby` e o `role="alert"`
// da dica —, em quatro telas: o import de startup, o apagar conta de
// `/admin/usuarios`, o diálogo da Zona destrutiva e a mesa de conflitos entre
// filiais. Quatro cópias que só se manteriam iguais enquanto ninguém mexesse
// numa delas — e uma delas (a mesa) era MUDA: sem `aria-invalid`, sem
// `aria-describedby`, sem dica nenhuma.
//
// F61 · decisão ii — AS QUATRO PASSARAM POR AQUI, e a dica só é importada por
// este arquivo (trava: `confirmacao-digitada-fronteira.test.ts`). O componente
// ganhou o que as quatro precisavam para não perder texto, aviso nem bloqueio:
//   · `mono` — o texto esperado em fonte mono (a mesa: `APAGAR 3`; a Zona
//     destrutiva: o patrimônio);
//   · `exibirEsperado={false}` — o import mostra o nome da filial DENTRO do rótulo
//     e não repete a linha;
//   · `aviso` — ocupa o lugar da linha do esperado quando não há o que digitar (a
//     conta sem e-mail), com o texto e o `role` que o chamador já tinha;
//   · `spellCheck={false}` SEMPRE — confirmação não é prosa: o corretor sublinhava
//     o nome da filial e o e-mail em vermelho, como se estivessem errados.
//
// ⚠ A RÉGUA DE "O QUE CONTA COMO IGUAL" NÃO VEM PARA CÁ, e isso é deliberado: cada
// chamador calcula o próprio `confere` e passa o resultado. (O comentário antigo
// dizia que "o import exige igualdade exata" — falso desde a F52: hoje o import, o
// apagar conta, a Zona destrutiva e a mesa TODOS toleram espaço nas pontas e caixa,
// cada um com a sua função — `confirmacaoImportConfere`, a comparação do apagar
// conta, `confirmacaoConfere` e `confirmacaoConflitoConfere` —, e cada servidor
// confere de novo na action e/ou na RPC.) Centralizar a régua aqui habilitaria, no
// dia em que uma delas mudar, um botão que o servidor recusaria.

export function ConfirmacaoDigitada({
  rotulo,
  esperado,
  valor,
  confere,
  onChange,
  onEnter,
  desabilitado,
  id,
  mono = false,
  exibirEsperado = true,
  aviso,
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
  /** O texto esperado em fonte mono (código, patrimônio, `APAGAR 3`). */
  mono?: boolean
  /** Mostra o texto esperado abaixo do rótulo (padrão). `false` quando o rótulo já o mostra. */
  exibirEsperado?: boolean
  /** Ocupa o lugar da linha do esperado — ex.: a conta sem e-mail, que não tem o que digitar. */
  aviso?: React.ReactNode
}) {
  const gerado = useId()
  const idCampo = id ?? `confirmacao-${gerado}`
  const idDica = `${idCampo}-dica`
  const dica = dicaConfirmacaoNaoConfere(valor, confere, esperado)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={idCampo}>{rotulo}</Label>
      {aviso ??
        (exibirEsperado ? (
          <p className={cn(mono && 'font-mono', 'text-xs break-all text-muted-foreground')}>
            {esperado}
          </p>
        ) : null)}
      <Input
        id={idCampo}
        value={valor}
        autoComplete="off"
        spellCheck={false}
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

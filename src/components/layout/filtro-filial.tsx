'use client'

// F25 — o filtro de filial MULTI-SELEÇÃO, compartilhado por todas as listas.
//
// Um componente só, de propósito: /ativos, /movimentacoes, /itens, /pendencias e
// /relatorios/gerados tinham cinco `<Select>` quase iguais, cada um com sua
// constante de sentinela. Três UIs diferentes para a mesma pergunta era o risco
// óbvio de espalhar isto pelas telas.
//
// A forma copia o filtro de STATUS de /ativos, que é o precedente de multi da casa:
// Popover + Checkbox, gatilho `outline` com Badge de CONTAGEM, e o popover NÃO
// fecha ao marcar (cada clique navega em `startTransition` e a lista atualiza por
// trás — foi assim que o de status ficou usável).
//
// DUAS FAMÍLIAS DE VALOR: as telas que filtram por ID mandam `porSlug={false}` e as
// que filtram por SLUG (`v_fila_pendencias.filial` expõe slug, não id) mandam
// `porSlug`. O componente só manipula strings — quem sabe o que elas significam é
// a página.

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { FILIAL_TODAS } from '@/lib/unidades/slugs'
import type { Filial } from '@/lib/queries/filiais'

export type OpcaoFiltroFilial = { valor: string; rotulo: string }

/** As opções na ordem em que `listarFiliais()` já entrega (por nome). */
export function opcoesDeFiliais(filiais: Filial[], porSlug: boolean): OpcaoFiltroFilial[] {
  return filiais.map((f) => ({ valor: porSlug ? f.slug : String(f.id), rotulo: f.nome }))
}

export function FiltroFilial({
  opcoes,
  selecionados,
  aplicar,
  idPrefixo = 'filial',
  rotulo = 'Filial',
}: {
  opcoes: OpcaoFiltroFilial[]
  /**
   * Os valores EFETIVAMENTE marcados — já resolvidos no servidor, inclusive quando
   * vieram do padrão do cargo e não da URL. `[]` = todas (sem recorte).
   */
  selecionados: string[]
  /**
   * Recebe o valor novo do param `filial`. NUNCA recebe null: lista vazia vira a
   * sentinela `todas`, e não a ausência do param — ausência significaria "volte ao
   * padrão do cargo", e o operador que acabou de DESMARCAR tudo veria as filiais
   * dele reaparecerem marcadas.
   */
  aplicar: (valor: string) => void
  idPrefixo?: string
  rotulo?: string
}) {
  // Espelho local da seleção. Existe por causa da NAVEGAÇÃO PENDENTE, a armadilha
  // nº 1 desta casa: `useSearchParams()` (e a prop que dela deriva) só refletem a
  // URL COMMITADA, e o Next só faz `pushState` quando a navegação termina. Num
  // filtro de checkbox o multi-clique rápido é o caso NORMAL — sem este espelho, o
  // segundo clique partiria da seleção antiga e desfaria o primeiro.
  //
  // Sincroniza com a prop pelo padrão oficial do React ("You Might Not Need an
  // Effect"): guarda o valor anterior em ESTADO e ajusta durante o render.
  const chaveProp = selecionados.join(',')
  const [sync, setSync] = useState(chaveProp)
  const [marcados, setMarcados] = useState<string[]>(selecionados)
  if (sync !== chaveProp) {
    setSync(chaveProp)
    setMarcados(selecionados)
  }

  // ⚠ Valor SELECIONADO que não está nas opções. Acontece de verdade:
  // `resolverFiliaisSlugs` preserva de propósito o slug de uma filial DESATIVADA
  // vindo de um link antigo, e `listarFiliais()` só devolve filial ativa. Sem esta
  // linha ele não tinha caixa nenhuma na tela (mas contava no badge) e — pior — o
  // `filter` abaixo o apagava da URL no primeiro clique em QUALQUER outra filial,
  // mudando um filtro que a pessoa não tocou. Entra como opção de verdade: dá para
  // ver que está lá e dá para desmarcá-lo de propósito.
  const listadas = [
    ...opcoes,
    ...selecionados
      .filter((v) => !opcoes.some((o) => o.valor === v))
      .map((v) => ({ valor: v, rotulo: v })),
  ]

  function alternar(valor: string, marcado: boolean) {
    const proximos = marcado
      ? [...marcados, valor]
      : marcados.filter((v) => v !== valor)
    setMarcados(proximos)
    // A ordem das opções manda no CSV — assim `?filial=2,3` e `?filial=3,2`
    // convergem para a mesma URL e o histórico do navegador não vira ruído.
    const ordenados = listadas.map((o) => o.valor).filter((v) => proximos.includes(v))
    aplicar(ordenados.length > 0 ? ordenados.join(',') : FILIAL_TODAS)
  }

  const todas = marcados.length === 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 gap-2 sm:h-8"
          aria-label="Filtrar por filial"
        >
          <Building2 className="size-4" />
          {rotulo}
          {!todas && (
            <Badge className="ml-1 h-5 min-w-5 justify-center px-1 tabular-nums">
              {marcados.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <p className="mb-2 text-sm font-medium">Filtrar por filial</p>
        <div className="grid gap-2">
          {listadas.map((o) => {
            const id = `${idPrefixo}-${o.valor}`
            return (
              <div key={o.valor} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={marcados.includes(o.valor)}
                  onCheckedChange={(c) => alternar(o.valor, c === true)}
                />
                <Label htmlFor={id} className="font-normal">
                  {o.rotulo}
                </Label>
              </div>
            )
          })}
        </div>
        {/* Continua alcançável para o operador, cujo padrão é recortado: desmarcar
            uma a uma chegaria no mesmo lugar, mas isto é um clique só. */}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-8 w-full justify-start px-2 font-normal text-muted-foreground"
          disabled={todas}
          onClick={() => {
            setMarcados([])
            aplicar(FILIAL_TODAS)
          }}
        >
          Todas as filiais
        </Button>
      </PopoverContent>
    </Popover>
  )
}

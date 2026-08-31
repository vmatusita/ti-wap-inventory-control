'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buscarSaldosItens, transferirItens, type SaldosPorItem } from '@/lib/actions/itens'
import { CarrinhoLinhas, type LinhaCarrinho } from '@/components/itens/carrinho-linhas'
import {
  MAX_LINHAS_TRANSFERENCIA_ITEM,
  errosPorLinhaDoLote,
  transferenciaItemSchema,
} from '@/lib/validators/item'
import { erroQuantidadeAcimaDoSaldo } from '@/lib/itens/transferencia'
import { hojeISO } from '@/lib/format'
import { EVENTO_TRANSFERIR_ITEM } from './transferir-item-evento'
import type { ItemCatalogo } from '@/lib/queries/itens'
import type { Filial } from '@/lib/queries/filiais'

// F42 — a forma da linha vem de `carrinho-linhas.tsx`, junto do widget que a
// desenha. Ela estava definida DUAS VEZES, aqui e em `lancar-item-dialog.tsx`,
// com o mesmo corpo — duas cópias do mesmo type é como as duas divergem calado.

// Transferir itens por quantidade entre filiais (F31 · ITN-01).
//
// POR QUE ISTO NÃO É UM PRESET DO DIÁLOGO DE LANÇAMENTO. O lançamento tem UMA
// filial e um tipo escolhido pelo operador; aqui são DUAS filiais e o tipo não é
// escolha de ninguém (é sempre o par de ajustes). Enfiar os dois no mesmo
// formulário exigiria esconder metade dos campos conforme um sétimo "tipo" que
// não existe no banco — e o carrinho, que lá aceita quantidade negativa no
// ajuste, aqui só aceita positiva. São dois formulários, e são mesmo.
//
// Também não há criação de item inline: transferir exige saldo na origem, e um
// item recém-criado tem zero. `podeCriarItem` fica de fora de propósito.
export function TransferirItemDialog({
  itens,
  filiais,
}: {
  itens: ItemCatalogo[]
  /** Só as filiais em que este cargo ESCREVE (recorte feito na página). A
   *  transferência precisa de DUAS, então a página nem renderiza o botão com
   *  menos que isso. */
  filiais: Filial[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [origemId, setOrigemId] = useState<number | null>(null)
  const [destinoId, setDestinoId] = useState<number | null>(null)
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([{ uid: 1, itemId: null, quantidade: '' }])
  const [chamado, setChamado] = useState('')
  const [data, setData] = useState(hojeISO())
  const [observacao, setObservacao] = useState('')
  const [enviando, start] = useTransition()
  const proximoUid = useRef(1)
  const qtdRef = useRef<HTMLInputElement>(null)
  const focarQtdAoAbrir = useRef(false)

  // Saldo da ORIGEM, por item — o mesmo mecanismo do combobox (ITN-05d): uma
  // chamada por troca de filial, nunca por tecla. `pedido` descarta resposta
  // atrasada de uma origem que já não é a escolhida, e `saldosDe` marca de qual
  // filial é o mapa guardado (sem ele, trocar de origem mostraria por um
  // instante o saldo da anterior — pior que não mostrar número nenhum).
  const [saldos, setSaldos] = useState<SaldosPorItem>({})
  const [saldosDe, setSaldosDe] = useState<number | null>(null)
  const pedido = useRef(0)
  // ⚠ A TRANSFERÊNCIA INVALIDA O MAPA. Sem este contador o efeito só reagiria a
  // `origemId`, e transferir tudo o que havia numa filial deixava o diálogo
  // dizendo "10 em estoque em Matriz" na reabertura — com a checagem prévia
  // aprovando um segundo envio que o trigger recusaria. O `router.refresh()` não
  // resolve: ele revalida o Server Component, não este estado de cliente.
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (origemId == null) return
    const meu = ++pedido.current
    buscarSaldosItens(origemId)
      .then((mapa) => {
        if (meu !== pedido.current) return
        // F42 — `buscarSaldosItens` passou a devolver o PAR { estoque, emUso }: a
        // prévia da regularização do lançamento precisa do que está com as pessoas.
        // A transferência só olha a prateleira da origem, então fica com `estoque`.
        //
        // ⚠ O TypeScript NÃO PEGA este erro: `SaldosPorItem` é `Record<number, number>`,
        // e um objeto com chaves de texto é atribuível a ele sem reclamação. Passar o
        // objeto inteiro por engano deixaria `saldosAtuais[itemId]` sempre `undefined`
        // — a linha nunca mostraria o saldo e `erroQuantidadeAcimaDoSaldo` nunca
        // acenderia, tudo com o build verde.
        setSaldos(mapa.estoque)
        setSaldosDe(origemId)
      })
      .catch(() => {
        if (meu !== pedido.current) return
        setSaldos({})
        setSaldosDe(origemId)
      })
  }, [origemId, recarga])

  const saldosAtuais = origemId != null && saldosDe === origemId ? saldos : {}

  function novaLinha(itemId: number | null = null): LinhaCarrinho {
    proximoUid.current += 1
    return { uid: proximoUid.current, itemId, quantidade: '' }
  }

  // Atalho da CÉLULA da tabela por filial: item + origem vêm preenchidos, o
  // destino fica em branco (ninguém adivinha para onde vai) e o foco pula para a
  // quantidade.
  useEffect(() => {
    function onTransferir(e: WindowEventMap[typeof EVENTO_TRANSFERIR_ITEM]) {
      const { itemId: presetItem, origemId: presetOrigem } = e.detail
      const semPreset = presetItem === null
      if (!semPreset && !Number.isFinite(presetItem)) return
      proximoUid.current += 1
      setLinhas([{ uid: proximoUid.current, itemId: semPreset ? null : presetItem, quantidade: '' }])
      setOrigemId(
        typeof presetOrigem === 'number' && Number.isFinite(presetOrigem) ? presetOrigem : null,
      )
      setDestinoId(null)
      setChamado('')
      setData(hojeISO())
      setObservacao('')
      if (semPreset) {
        setAberto(true)
        return
      }
      if (aberto) {
        setTimeout(() => qtdRef.current?.focus(), 0)
      } else {
        focarQtdAoAbrir.current = true
        setAberto(true)
      }
    }
    window.addEventListener(EVENTO_TRANSFERIR_ITEM, onTransferir)
    return () => window.removeEventListener(EVENTO_TRANSFERIR_ITEM, onTransferir)
  }, [aberto])

  function limpar() {
    setLinhas([novaLinha()])
    setChamado('')
    setData(hojeISO())
    setObservacao('')
  }

  function atualizarLinha(uid: number, campos: Partial<LinhaCarrinho>) {
    setLinhas((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...campos, erro: undefined } : l)))
  }

  function adicionarLinha() {
    setLinhas((ls) => (ls.length >= MAX_LINHAS_TRANSFERENCIA_ITEM ? ls : [...ls, novaLinha()]))
  }

  function removerLinha(uid: number) {
    setLinhas((ls) => (ls.length <= 1 ? ls : ls.filter((l) => l.uid !== uid)))
  }

  // A origem sai da lista de destinos: escolher a mesma filial dos dois lados é
  // erro do Zod E da RPC, mas é melhor não oferecer a opção. Trocar a origem
  // para a filial que já está no destino limpa o destino (senão o Select ficaria
  // com um valor que não existe mais entre as opções).
  function trocarOrigem(id: number) {
    setOrigemId(id)
    if (destinoId === id) setDestinoId(null)
  }

  const opcoesDestino = filiais.filter((f) => f.id !== origemId)

  function salvar() {
    const input = {
      origem_id: origemId ?? 0,
      destino_id: destinoId ?? 0,
      linhas: linhas.map((l) => ({
        item_id: l.itemId ?? 0,
        quantidade: l.quantidade === '' ? NaN : Number(l.quantidade),
      })),
      chamado: chamado || undefined,
      data,
      observacao: observacao || undefined,
    }
    const parsed = transferenciaItemSchema.safeParse(input)
    if (!parsed.success) {
      const porLinha = errosPorLinhaDoLote(parsed.error.issues)
      setLinhas((ls) => ls.map((l, i) => ({ ...l, erro: porLinha.get(i) })))
      toast.error(parsed.error.issues[0]?.message ?? 'Revise os campos.')
      return
    }

    // Saldo da origem — SEGUNDA LINHA. O juiz é o trigger, sob a trava da
    // transação; isto existe para o operador não montar o carrinho inteiro e só
    // descobrir no envio. Item cujo saldo não carregou não é acusado aqui.
    const acimaDoSaldo = new Map<number, string>()
    linhas.forEach((l, i) => {
      if (l.itemId == null) return
      const erro = erroQuantidadeAcimaDoSaldo(Number(l.quantidade), saldosAtuais[l.itemId] ?? null)
      if (erro) acimaDoSaldo.set(i, erro)
    })
    if (acimaDoSaldo.size > 0) {
      setLinhas((ls) => ls.map((l, i) => ({ ...l, erro: acimaDoSaldo.get(i) })))
      toast.error('Alguma linha pede mais do que existe na filial de origem.')
      return
    }

    start(async () => {
      try {
        const res = await transferirItens(parsed.data)
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível transferir.')
          return
        }
        toast.success(
          res.itens && res.itens > 1
            ? `${res.itens} itens transferidos.`
            : 'Item transferido.',
        )
        limpar()
        setAberto(false)
        // O saldo da origem acabou de mudar por nossa causa: releia antes que o
        // operador reabra o diálogo na mesma filial (a origem é preservada de
        // propósito — transferir em seguida é o caso comum). `saldosDe = null`
        // primeiro, pela mesma regra da troca de origem: enquanto a releitura
        // não chega, melhor NENHUM número do que o de antes da transferência.
        setSaldosDe(null)
        setRecarga((r) => r + 1)
        router.refresh()
      } catch {
        // A transferência é tudo-ou-nada no banco: se a chamada nem chegou, nada
        // foi gravado — e a afirmação pode ser feita sem hedge, ao contrário do
        // lançamento em lote, onde parte das linhas pode ter entrado.
        toast.error(
          'Não foi possível transferir — nada foi gravado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  const nomeOrigem = filiais.find((f) => f.id === origemId)?.nome
  const nomeDestino = filiais.find((f) => f.id === destinoId)?.nome

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <ArrowRightLeft className="size-4" />
          Transferir
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          if (!focarQtdAoAbrir.current) return
          focarQtdAoAbrir.current = false
          e.preventDefault()
          requestAnimationFrame(() => qtdRef.current?.focus())
        }}
      >
        <DialogHeader>
          <DialogTitle>Transferir entre filiais</DialogTitle>
          <DialogDescription>
            O estoque sai de uma filial e entra na outra na mesma operação. O total da TI não
            muda — é por isso que transferir não é a mesma coisa que dar baixa aqui e entrada
            lá.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="transf-origem">Filial de origem</Label>
              <Select
                value={origemId ? String(origemId) : ''}
                onValueChange={(v) => trocarOrigem(Number(v))}
              >
                <SelectTrigger id="transf-origem" className="w-full">
                  <SelectValue placeholder="De onde sai" />
                </SelectTrigger>
                <SelectContent>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transf-destino">Filial de destino</Label>
              <Select
                value={destinoId ? String(destinoId) : ''}
                onValueChange={(v) => setDestinoId(Number(v))}
              >
                <SelectTrigger id="transf-destino" className="w-full">
                  <SelectValue placeholder="Para onde vai" />
                </SelectTrigger>
                <SelectContent>
                  {opcoesDestino.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {nomeOrigem && nomeDestino && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{nomeOrigem}</span>
              <ArrowRight className="size-3.5" aria-hidden />
              <span className="font-medium text-foreground">{nomeDestino}</span>
            </p>
          )}

          {/* O CARRINHO — o mesmo widget do diálogo de lançamento desde a F42
              (`carrinho-linhas.tsx`). Ele estava COPIADO nos dois arquivos: mesma
              linha, mesmo combobox, mesmo campo de quantidade, mesmo contador.

              O que é DAQUI desce por `abaixoDaLinha`: o saldo da ORIGEM, que é o
              que interessa na hora de escolher o que vai sair. E `podeCriarItem`
              fica em false — item novo tem saldo zero e não se transfere. */}
          <CarrinhoLinhas
            linhas={linhas}
            catalogo={itens}
            saldos={saldosAtuais}
            maximo={MAX_LINHAS_TRANSFERENCIA_ITEM}
            desabilitado={enviando}
            podeCriarItem={false}
            refPrimeiraQuantidade={qtdRef}
            ondeAcessivel="da transferência"
            onQuantidade={(uid, valor) => atualizarLinha(uid, { quantidade: valor })}
            onItem={(uid, itemId) => atualizarLinha(uid, { itemId })}
            onRemover={removerLinha}
            onAdicionar={adicionarLinha}
            onItemCriado={() => {}}
            abaixoDaLinha={(l) => {
              // O saldo da origem, quando se sabe. Ausente (sem origem escolhida,
              // ainda carregando ou a leitura falhou): nada aparece — nunca um
              // "0" chutado, que aprovaria na tela o que o servidor recusaria.
              const saldo = l.itemId != null ? saldosAtuais[l.itemId] : undefined
              if (saldo == null || l.erro) return null
              return (
                <p className="pl-1 text-xs tabular-nums text-muted-foreground">
                  {saldo.toLocaleString('pt-BR')} em estoque em {nomeOrigem}
                </p>
              )
            }}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="transf-chamado">Chamado (opcional)</Label>
              <Input
                id="transf-chamado"
                inputMode="numeric"
                value={chamado}
                onChange={(e) => setChamado(e.target.value)}
                placeholder="nº do chamado"
                disabled={enviando}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transf-data">Data</Label>
              <Input
                id="transf-data"
                type="date"
                max={hojeISO()}
                value={data}
                onChange={(e) => setData(e.target.value)}
                disabled={enviando}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transf-obs">Observação (opcional)</Label>
            <Textarea
              id="transf-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="por que a transferência?"
              disabled={enviando}
            />
            <p className="text-xs text-muted-foreground">
              O histórico já registra de onde saiu e para onde foi; o que você escrever aqui
              entra junto, nos dois lados.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando}>
            {enviando
              ? 'Transferindo…'
              : linhas.length > 1
                ? `Transferir ${linhas.length} itens`
                : 'Transferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

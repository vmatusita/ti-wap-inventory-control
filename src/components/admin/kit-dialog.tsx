'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
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
import { useDialogoSemeado } from '@/components/dialogos/use-dialogo-semeado'
import { atualizarKit, criarKit } from '@/lib/actions/kits'
import { campoAplica } from '@/lib/validators/movimentacao'
import {
  MSG_KIT_SEM_CATEGORIA,
  TIPOS_KIT,
  descreverKit,
  type KitPayload,
  type TipoKit,
} from '@/lib/validators/kit'
import {
  CATEGORIA_ORDEM,
  TERMO_STATUS_ORDEM,
  rotuloCategoria,
  rotuloTermo,
  rotuloTipo,
  type CategoriaAtivo,
  type TermoStatus,
} from '@/lib/dominio'
import type { Motivo } from '@/lib/queries/motivos'

// O <Select> do Radix proíbe item com value '' (string vazia é "sem seleção").
// Motivo e termo são OPCIONAIS no kit, então precisam de uma opção explícita
// para voltar ao vazio — daí os sentinelas, que nunca chegam ao payload.
const SEM_MOTIVO = '__sem_motivo__'
const SEM_TERMO = '__sem_termo__'

export type KitEdit = {
  id: string
  nome: string
  payload: KitPayload
  ativo: boolean
}

// Criar/editar KIT DE MOVIMENTAÇÃO (F12 · M12 — padrão de admin/motivos e
// admin/itens). Kit nunca é excluído, só desativado: some do "Aplicar kit" do
// fluxo e continua listado aqui. Nada referencia o kit depois de aplicado (o
// payload é copiado para o formulário), então desativar não mexe em nenhuma
// movimentação já registrada.
export function KitDialog({
  kit,
  motivos,
  duplicarDe,
  gatilho,
}: {
  kit?: KitEdit
  // Motivos ATIVOS (listarMotivos, carregado na page). O filtro por tipo é
  // replicado aqui — o fluxo de nova movimentação faz o mesmo inline e não
  // existe helper compartilhado.
  motivos: Motivo[]
  /** F29/ADM-04b — abre em modo CRIAÇÃO já preenchido com este kit (Duplicar).
   *  Não é edição: salvar cria um kit novo, e o original fica intocado. */
  duplicarDe?: KitEdit
  /** Gatilho alternativo (o item "Duplicar" da linha). Sem ele valem os dois
   *  botões padrão: "Editar" quando há `kit`, "Novo kit" quando não há. */
  gatilho?: React.ReactNode
}) {
  const router = useRouter()
  // `duplicarDe` semeia o formulário sem ligar o modo edição: é criação com os
  // campos prontos. O índice único de nome barra colisão, e por isso o nome nasce
  // como "Cópia de {nome}" em vez de repetir o original e falhar no salvar.
  const semente = kit ?? duplicarDe
  const edicao = !!kit
  const [nome, setNome] = useState(
    duplicarDe ? `Cópia de ${duplicarDe.nome}`.slice(0, 80) : (kit?.nome ?? ''),
  )
  const [tipo, setTipo] = useState<TipoKit>((semente?.payload.tipo as TipoKit) ?? 'saida')
  const [motivo, setMotivo] = useState(semente?.payload.motivo ?? '')
  const [termo, setTermo] = useState<'' | TermoStatus>(semente?.payload.termo ?? '')
  const [observacao, setObservacao] = useState(semente?.payload.observacao ?? '')
  const [categorias, setCategorias] = useState<Set<CategoriaAtivo>>(
    new Set(semente?.payload.categorias ?? []),
  )
  const [ativo, setAtivo] = useState(kit?.ativo ?? true)
  const [enviando, start] = useTransition()
  // F61 — semeia NA ABERTURA (`useDialogoSemeado`), a partir da semente DAQUELE render
  // (o kit em edição ou o que se duplica): reabrir para editar mostra o valor atual. O
  // `limpar()` depois de criar continua — os dois momentos são distintos.
  const { aberto, mudarAberto } = useDialogoSemeado(() => {
    setNome(duplicarDe ? `Cópia de ${duplicarDe.nome}`.slice(0, 80) : (kit?.nome ?? ''))
    setTipo((semente?.payload.tipo as TipoKit) ?? 'saida')
    setMotivo(semente?.payload.motivo ?? '')
    setTermo(semente?.payload.termo ?? '')
    setObservacao(semente?.payload.observacao ?? '')
    setCategorias(new Set(semente?.payload.categorias ?? []))
    setAtivo(kit?.ativo ?? true)
  })

  const motivosAplicaveis = motivos.filter((m) => m.aplica_a.includes(tipo))
  const temTermo = campoAplica(tipo, 'termo')

  // F29/ADM-04a — "Como o kit aplica", montado AO VIVO com o vocabulário real
  // (`descreverKit`, pura e testada). O motivo entra já resolvido para o rótulo que
  // o operador lê no passo 2 — o payload guarda o código.
  const motivoRotulo = motivosAplicaveis.find((m) => m.codigo === motivo)?.rotulo
  const previa = descreverKit(
    {
      tipo,
      termo: temTermo && termo ? termo : undefined,
      categorias: CATEGORIA_ORDEM.filter((c) => categorias.has(c)),
    },
    motivoRotulo,
  )

  // Trocar o tipo derruba o que não vale mais para ele. Sem isso o kit guardaria
  // um motivo impossível (fora do `aplica_a`) ou um termo em tipo que nem tem
  // campo de termo — o preset nasceria inaplicável.
  function trocarTipo(t: TipoKit) {
    setTipo(t)
    if (motivo && !motivos.some((m) => m.codigo === motivo && m.aplica_a.includes(t))) {
      setMotivo('')
    }
    if (!campoAplica(t, 'termo')) setTermo('')
  }

  function alternarCategoria(c: CategoriaAtivo, on: boolean) {
    setCategorias((prev) => {
      const s = new Set(prev)
      if (on) s.add(c)
      else s.delete(c)
      return s
    })
  }

  function limpar() {
    setNome('')
    setTipo('saida')
    setMotivo('')
    setTermo('')
    setObservacao('')
    setCategorias(new Set())
    setAtivo(true)
  }

  const nomeValido = nome.trim().length >= 2
  const valido = nomeValido && categorias.size > 0

  function salvar() {
    if (!valido) return
    // Ordem canônica no que é PERSISTIDO: o mesmo kit não pode virar dois
    // documentos jsonb diferentes só porque as caixas foram marcadas em outra
    // ordem (o checklist do fluxo já reordena por CATEGORIA_ORDEM na leitura).
    const payload = {
      tipo,
      motivo: motivo || undefined,
      termo: termo || undefined,
      observacao: observacao.trim() || undefined,
      categorias: CATEGORIA_ORDEM.filter((c) => categorias.has(c)),
    }
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition
      // (apaga a tela no error boundary) e o operador fica sem feedback.
      try {
        const res = edicao
          ? await atualizarKit({ id: kit.id, nome: nome.trim(), payload, ativo })
          : await criarKit({ nome: nome.trim(), payload })
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        toast.success(edicao ? 'Kit atualizado.' : 'Kit criado.')
        mudarAberto(false)
        // Formulário de CRIAÇÃO fica montado depois de salvar: sem a limpeza, o
        // próximo "Novo kit" abriria com o kit anterior inteiro preenchido.
        if (!edicao) limpar()
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível salvar o kit. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogTrigger asChild>
        {gatilho ? (
          gatilho
        ) : edicao ? (
          <Button variant="outline" size="sm" className="min-h-10 gap-1.5 sm:min-h-0">
            <Pencil className="size-3.5" />
            Editar
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="size-4" />
            Novo kit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {edicao ? 'Editar kit' : duplicarDe ? 'Duplicar kit' : 'Novo kit'}
          </DialogTitle>
          <DialogDescription>
            Modelo salvo do passo 2 da movimentação. Aplicar um kit só preenche o
            formulário — nada é registrado automaticamente.
            {duplicarDe && (
              <>
                {' '}
                Este é um kit <strong>novo</strong>, copiado de{' '}
                <strong>{duplicarDe.nome}</strong> — o original não muda.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="kit-nome">Nome</Label>
            <Input
              id="kit-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              placeholder="ex.: Kit novo colaborador"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kit-tipo">Tipo de movimentação</Label>
              <Select value={tipo} onValueChange={(v) => trocarTipo(v as TipoKit)}>
                <SelectTrigger id="kit-tipo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_KIT.map((t) => (
                    <SelectItem key={t} value={t}>
                      {rotuloTipo(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {motivosAplicaveis.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="kit-motivo">Motivo (opcional)</Label>
                <Select
                  value={motivo || SEM_MOTIVO}
                  onValueChange={(v) => setMotivo(v === SEM_MOTIVO ? '' : v)}
                >
                  <SelectTrigger id="kit-motivo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_MOTIVO}>Sem motivo</SelectItem>
                    {motivosAplicaveis.map((m) => (
                      <SelectItem key={m.codigo} value={m.codigo}>
                        {m.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {temTermo && (
              <div className="space-y-2">
                <Label htmlFor="kit-termo">Termo de responsabilidade (opcional)</Label>
                <Select
                  value={termo || SEM_TERMO}
                  onValueChange={(v) => setTermo(v === SEM_TERMO ? '' : (v as TermoStatus))}
                >
                  <SelectTrigger id="kit-termo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_TERMO}>Não informar</SelectItem>
                    {TERMO_STATUS_ORDEM.map((t) => (
                      <SelectItem key={t} value={t}>
                        {rotuloTermo(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {/* Grupo de checkboxes: sem control único, o rótulo se liga por
                `role="group"` + `aria-labelledby` (padrão do motivo-dialog). */}
            <Label id="kit-categorias">Categorias esperadas</Label>
            <Card
              size="sm"
              role="group"
              aria-labelledby="kit-categorias"
              aria-describedby="kit-categorias-ajuda"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {CATEGORIA_ORDEM.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={categorias.has(c)}
                    onCheckedChange={(v) => alternarCategoria(c, v === true)}
                  />
                  {rotuloCategoria(c)}
                </label>
              ))}
            </Card>
            <p id="kit-categorias-ajuda" className="text-xs text-muted-foreground">
              {categorias.size === 0
                ? MSG_KIT_SEM_CATEGORIA
                : 'Viram um checklist informativo no fluxo — nunca bloqueiam o registro.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="kit-observacao">Observação padrão (opcional)</Label>
            <Textarea
              id="kit-observacao"
              rows={2}
              maxLength={500}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Texto que já vem preenchido ao aplicar o kit"
            />
          </div>

          {edicao && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={ativo} onCheckedChange={(c) => setAtivo(c === true)} />
                Kit ativo
              </label>
              <p className="text-xs text-muted-foreground">
                Kit não se exclui — desmarcar tira o kit do &ldquo;Aplicar kit&rdquo; da
                nova movimentação, sem afetar o que já foi registrado com ele.
              </p>
            </>
          )}
        </div>

        {/* F29/ADM-04a — o admin preenchia cinco campos sem ver o que o operador
            recebe. Este bloco é a MESMA frase que o passo 2 aplica, montada ao vivo:
            fica no rodapé (logo acima dos botões) porque é o resumo do que se está
            prestes a salvar, no lugar onde as outras telas põem a confirmação. */}
        <Card size="sm" className="gap-0 bg-muted/40 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">
            Como o kit aplica
          </p>
          <p className="mt-1">{previa.join(' · ')}</p>
          {observacao.trim() && (
            <p className="mt-1 text-xs text-muted-foreground">
              Observação preenchida: “{observacao.trim()}”
            </p>
          )}
        </Card>

        <DialogFooter>
          <Button variant="ghost" onClick={() => mudarAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando || !valido}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

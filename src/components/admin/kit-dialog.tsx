'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import { atualizarKit, criarKit } from '@/lib/actions/kits'
import { campoAplica } from '@/lib/validators/movimentacao'
import {
  MSG_KIT_SEM_CATEGORIA,
  TIPOS_KIT,
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
}: {
  kit?: KitEdit
  // Motivos ATIVOS (listarMotivos, carregado na page). O filtro por tipo é
  // replicado aqui — o fluxo de nova movimentação faz o mesmo inline e não
  // existe helper compartilhado.
  motivos: Motivo[]
}) {
  const router = useRouter()
  const edicao = !!kit
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(kit?.nome ?? '')
  const [tipo, setTipo] = useState<TipoKit>((kit?.payload.tipo as TipoKit) ?? 'saida')
  const [motivo, setMotivo] = useState(kit?.payload.motivo ?? '')
  const [termo, setTermo] = useState<'' | TermoStatus>(kit?.payload.termo ?? '')
  const [observacao, setObservacao] = useState(kit?.payload.observacao ?? '')
  const [categorias, setCategorias] = useState<Set<CategoriaAtivo>>(
    new Set(kit?.payload.categorias ?? []),
  )
  const [ativo, setAtivo] = useState(kit?.ativo ?? true)
  const [enviando, start] = useTransition()

  const motivosAplicaveis = motivos.filter((m) => m.aplica_a.includes(tipo))
  const temTermo = campoAplica(tipo, 'termo')

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
      const res = edicao
        ? await atualizarKit({ id: kit.id, nome: nome.trim(), payload, ativo })
        : await criarKit({ nome: nome.trim(), payload })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success(edicao ? 'Kit atualizado.' : 'Kit criado.')
      setAberto(false)
      // Formulário de CRIAÇÃO fica montado depois de salvar: sem a limpeza, o
      // próximo "Novo kit" abriria com o kit anterior inteiro preenchido.
      if (!edicao) limpar()
      router.refresh()
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {edicao ? (
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
          <DialogTitle>{edicao ? 'Editar kit' : 'Novo kit'}</DialogTitle>
          <DialogDescription>
            Modelo salvo do passo 2 da movimentação. Aplicar um kit só preenche o
            formulário — nada é registrado automaticamente.
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
            <div
              role="group"
              aria-labelledby="kit-categorias"
              aria-describedby="kit-categorias-ajuda"
              className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3"
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
            </div>
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
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

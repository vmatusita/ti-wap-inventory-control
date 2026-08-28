'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { criarColaborador, atualizarColaborador } from '@/lib/actions/colaboradores'
import type { ColaboradorAdmin } from '@/lib/queries/colaboradores'
import type { Filial } from '@/lib/queries/filiais'

// Criar/editar colaborador (F37 · D5). Molde do `item-dialog.tsx`: o MESMO componente
// serve criação e edição, estado local por campo, `useTransition` para o pending,
// toasts do sonner, `router.refresh()` no sucesso.
//
// NÃO EXISTE EXCLUIR, e é decisão de banco, não de tela: a migration 0112 não tem
// policy de DELETE. Cadastro de pessoa é apontado pelo histórico — desativa-se.
//
// A COLISÃO DE NOME é a consequência assumida do desenho (dois "João Silva" reais não
// cabem, porque a chave normalizada é única). Ela chega aqui como frase em pt-BR
// vinda da action, com as duas saídas que existem — nunca como um `23505` cru.

const SEM_FILIAL = '__sem_filial__'

export function ColaboradorDialog({
  colaborador,
  filiais,
}: {
  colaborador?: ColaboradorAdmin
  filiais: readonly Filial[]
}) {
  const edicao = Boolean(colaborador)
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(colaborador?.nome ?? '')
  const [matricula, setMatricula] = useState(colaborador?.matricula ?? '')
  const [setor, setSetor] = useState(colaborador?.setor ?? '')
  const [filial, setFilial] = useState(
    colaborador?.filial_id == null ? SEM_FILIAL : String(colaborador.filial_id),
  )
  const [ativo, setAtivo] = useState(colaborador?.ativo ?? true)
  const [salvando, iniciar] = useTransition()

  const valido = nome.trim().length >= 2

  // Semeia o formulário na ABERTURA, não no fechamento (revisão de 28/08/2026).
  //
  // Fechar-e-resetar parecia equivalente e não é: `salvar()` chama `mudarAberto(false)`
  // ANTES de o `router.refresh()` trazer os dados novos, então o reset copiava a prop
  // do render VELHO. Depois de corrigir "Joao Silva" para "João Vitor Silva", reabrir
  // "Editar" mostrava o nome anterior — e salvar de novo revertia a correção sem que
  // ninguém tivesse pedido. Semeando na abertura, o formulário sempre nasce do que a
  // tabela está exibindo naquele instante.
  function mudarAberto(v: boolean) {
    setAberto(v)
    if (v) {
      setNome(colaborador?.nome ?? '')
      setMatricula(colaborador?.matricula ?? '')
      setSetor(colaborador?.setor ?? '')
      setFilial(
        colaborador?.filial_id == null ? SEM_FILIAL : String(colaborador.filial_id),
      )
      setAtivo(colaborador?.ativo ?? true)
    }
  }

  function salvar() {
    const campos = {
      nome: nome.trim(),
      matricula: matricula.trim() || null,
      setor: setor.trim() || null,
      filial_id: filial === SEM_FILIAL ? null : Number(filial),
    }
    iniciar(async () => {
      try {
        const res = edicao
          ? await atualizarColaborador({ id: colaborador!.id, ...campos, ativo })
          : await criarColaborador(campos)
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível salvar o colaborador.')
          return
        }
        toast.success(edicao ? 'Colaborador atualizado.' : 'Colaborador cadastrado.')
        mudarAberto(false)
        router.refresh()
      } catch {
        // F19 — sem o catch, o throw dentro do startTransition some no error boundary.
        toast.error('Não foi possível salvar agora. Tente de novo.')
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogTrigger asChild>
        {edicao ? (
          <Button variant="ghost" size="sm">
            <Pencil aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Editar</span>
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden="true" />
            Novo colaborador
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {edicao ? 'Editar colaborador' : 'Novo colaborador'}
          </DialogTitle>
          <DialogDescription>
            O nome é o que aparece nas movimentações. Filial e setor são referência —
            não limitam quem pode registrar movimentação para esta pessoa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="colab-nome">Nome</Label>
            <Input
              id="colab-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="colab-matricula">Matrícula (opcional)</Label>
              <Input
                id="colab-matricula"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="colab-setor">Setor (opcional)</Label>
              <Input
                id="colab-setor"
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="colab-filial">Filial (opcional)</Label>
            <Select value={filial} onValueChange={setFilial}>
              <SelectTrigger id="colab-filial" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_FILIAL}>
                  <span className="text-muted-foreground">Sem filial</span>
                </SelectItem>
                {filiais.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {edicao && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="colab-ativo"
                checked={ativo}
                onCheckedChange={(v) => setAtivo(v === true)}
              />
              <Label htmlFor="colab-ativo" className="font-normal">
                Colaborador ativo (desmarque para tirá-lo das sugestões sem apagar
                nada)
              </Label>
            </div>
          )}

          {edicao && (colaborador!.movimentacoes > 0 || colaborador!.lancamentos > 0) && (
            <p className="text-xs text-muted-foreground">
              {colaborador!.movimentacoes.toLocaleString('pt-BR')} movimentação(ões) e{' '}
              {colaborador!.lancamentos.toLocaleString('pt-BR')} lançamento(s) de item
              já apontam para este cadastro. Nada disso muda ao editar o nome — o
              histórico guarda o nome como estava no dia.
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={salvando}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={salvar} disabled={!valido || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

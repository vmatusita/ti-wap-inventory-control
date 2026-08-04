'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { atualizarDadosCadastrais } from '@/lib/actions/ativos'
import { hojeISO } from '@/lib/format'
import type { CategoriaAtivo, TermoStatus } from '@/lib/dominio'

const TERMO_NULO = '__nulo'

type FormValues = {
  memoria: string
  armazenamento: string
  processador: string
  hostname: string
  // F25 — campos do celular. Entram SEMPRE no formulário, mesmo em ativo de outra
  // categoria; só o RENDER é condicional. O update cadastral grava TODAS as
  // colunas a cada save, então um campo fora do payload viraria NULL — e o IMEI
  // de um celular sumiria em silêncio. Mesma razão do `values` vs `defaultValues`
  // explicada abaixo.
  telefone: string
  imei: string
  pulsus: string
  observacoes: string
  termo_assinado: string
  termo_data: string
}

export type AtivoEditavel = {
  id: string
  // F25 — insumo do render condicional dos campos de celular. A categoria NÃO é
  // editável (o ativo nasce com ela), então não vai para o FormValues.
  categoria: CategoriaAtivo
  memoria: string | null
  armazenamento: string | null
  processador: string | null
  hostname: string | null
  telefone: string | null
  imei: string | null
  pulsus: string | null
  observacoes: string | null
  termo_assinado: TermoStatus | null
  termo_data: string | null
}

export function EditarAtivoDialog({ ativo }: { ativo: AtivoEditavel }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)

  // `values` (nao `defaultValues`): mantem o form sincronizado quando a prop
  // `ativo` muda apos salvar (router.refresh). Com defaultValues + reset() sem
  // args, o RHF restauraria os defaults do MOUNT (dados velhos) e um novo salvar
  // reverteria silenciosamente as colunas — o update cadastral grava TODAS.
  const valores: FormValues = {
    memoria: ativo.memoria ?? '',
    armazenamento: ativo.armazenamento ?? '',
    processador: ativo.processador ?? '',
    hostname: ativo.hostname ?? '',
    telefone: ativo.telefone ?? '',
    imei: ativo.imei ?? '',
    pulsus: ativo.pulsus ?? '',
    observacoes: ativo.observacoes ?? '',
    termo_assinado: ativo.termo_assinado ?? '',
    termo_data: ativo.termo_data ?? '',
  }
  const form = useForm<FormValues>({ values: valores })

  async function onSubmit(values: FormValues) {
    // F19 — este é o único ponto de escrita do app que não passa por
    // `startTransition`: quem chama é o `handleSubmit` do react-hook-form. Sem o
    // catch, um throw de transporte (rede, sessão morta, payload) não vira toast
    // nenhum e o diálogo fica aberto como se nada tivesse acontecido. O erro de
    // NEGÓCIO (`{ok:false,erro}`) segue tratado logo abaixo, sem alteração.
    try {
      const res = await atualizarDadosCadastrais({ id: ativo.id, ...values })
      if (!res.ok) {
        toast.error(res.erro ?? 'Não foi possível salvar as alterações.')
        return
      }
      toast.success('Dados cadastrais atualizados.')
      setAberto(false)
      router.refresh()
    } catch {
      toast.error(
        'Não foi possível salvar as alterações. Verifique sua conexão e tente de novo.',
      )
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o)
        // Ao fechar, descarta edicoes nao salvas voltando ao estado atual do ativo.
        if (!o) form.reset(valores)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2 sm:h-8">
          <Pencil className="size-4" />
          Editar dados cadastrais
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar dados cadastrais</DialogTitle>
          <DialogDescription>
            Status, colaborador e filial mudam apenas por movimentação — não são
            editáveis aqui.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="memoria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memória</FormLabel>
                    <FormControl>
                      <Input placeholder="16 GB" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="armazenamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Armazenamento</FormLabel>
                    <FormControl>
                      <Input placeholder="512 GB SSD" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="processador"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Processador</FormLabel>
                    <FormControl>
                      <Input placeholder="Intel i5" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hostname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hostname</FormLabel>
                    <FormControl>
                      <Input placeholder="WAP-NB-1234" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* F25 — só o CELULAR mostra estes três. A categoria é imutável na
                vida do ativo, então não há `watch`: o teste é direto na prop. */}
            {ativo.categoria === 'celular' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nº do telefone</FormLabel>
                      <FormControl>
                        <Input placeholder="(41) 90000-0000" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="imei"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IMEI</FormLabel>
                      <FormControl>
                        <Input placeholder="000000000000000" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pulsus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pulsus</FormLabel>
                      <FormControl>
                        <Input placeholder="Identificação no Pulsus" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="termo_assinado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Termo de responsabilidade</FormLabel>
                    <Select
                      value={field.value || TERMO_NULO}
                      onValueChange={(v) =>
                        field.onChange(v === TERMO_NULO ? '' : v)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={TERMO_NULO}>Não informado</SelectItem>
                        <SelectItem value="sim">Assinado</SelectItem>
                        <SelectItem value="enviado">
                          Enviado (sem assinatura)
                        </SelectItem>
                        <SelectItem value="nao">Não gerado</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="termo_data"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data do termo</FormLabel>
                    <FormControl>
                      <Input type="date" max={hojeISO()} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Anotações sobre o equipamento…"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAberto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Salvando…' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

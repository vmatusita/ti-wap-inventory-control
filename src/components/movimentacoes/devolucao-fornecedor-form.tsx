'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, PackageX, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { devolverAoFornecedor } from '@/lib/actions/devolucao-fornecedor'
import type { DevolverFornecedorInput } from '@/lib/validators/devolucao-fornecedor'
import { CATEGORIA_ORDEM, rotuloCategoria, type CategoriaAtivo } from '@/lib/dominio'
import { hojeISO, ouTraco } from '@/lib/format'
import type { Filial } from '@/lib/queries/filiais'

export type AtivoEmManutencao = {
  id: string
  patrimonio: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  filial_id: number
  filial_nome: string
  fornecedor: string | null
}

export function DevolucaoFornecedorForm({
  ativo,
  chamadoHerdado,
  chamadoFornecedorHerdado,
  filiais,
}: {
  ativo: AtivoEmManutencao
  chamadoHerdado: string | null
  chamadoFornecedorHerdado: string | null
  filiais: Filial[]
}) {
  const [comSubstituto, setComSubstituto] = useState(true)
  const [dataDevolucao, setDataDevolucao] = useState(hojeISO())
  const [obsDevolucao, setObsDevolucao] = useState('')

  // Sub-form do substituto (compra-like + hostname). Filial default = a do antigo.
  const [patrimonio, setPatrimonio] = useState('')
  const [serviceTag, setServiceTag] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAtivo | ''>(ativo.categoria)
  const [marca, setMarca] = useState(ativo.marca ?? '')
  const [modelo, setModelo] = useState(ativo.modelo ?? '')
  const [memoria, setMemoria] = useState('')
  const [armazenamento, setArmazenamento] = useState('')
  const [processador, setProcessador] = useState('')
  const [hostname, setHostname] = useState('')
  const [filialId, setFilialId] = useState(String(ativo.filial_id))
  const [observacoes, setObservacoes] = useState('')
  const [obsCompra, setObsCompra] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [sucesso, setSucesso] = useState<{
    antigo: { id: string; patrimonio: string | null }
    substituto?: { id: string; patrimonio: string }
  } | null>(null)
  const enviandoRef = useRef(false)

  async function enviar() {
    if (enviandoRef.current) return

    // Pré-validação amigável do sub-form (a validação de verdade é o Zod na action).
    if (comSubstituto) {
      const faltando: string[] = []
      if (!patrimonio.trim()) faltando.push('patrimônio')
      // F15/C1 — service tag obrigatória no cadastro do substituto.
      if (!serviceTag.trim()) faltando.push('service tag')
      if (!categoria) faltando.push('categoria')
      if (!marca.trim()) faltando.push('marca')
      if (!modelo.trim()) faltando.push('modelo')
      if (!filialId) faltando.push('filial')
      if (faltando.length > 0) {
        toast.error(`Preencha os dados do substituto: ${faltando.join(', ')}.`)
        return
      }
    }

    const input: DevolverFornecedorInput = {
      ativo_id: ativo.id,
      data: dataDevolucao,
      observacao: obsDevolucao,
      substituto: comSubstituto
        ? {
            patrimonio: patrimonio.trim(),
            service_tag: serviceTag,
            categoria: categoria as CategoriaAtivo,
            marca,
            modelo,
            memoria,
            armazenamento,
            processador,
            hostname,
            filial_id: Number(filialId),
            observacoes,
            observacao: obsCompra,
            data: dataDevolucao,
          }
        : null,
    }

    enviandoRef.current = true
    setEnviando(true)
    setErros([])
    let res
    try {
      res = await devolverAoFornecedor(input)
    } catch {
      // F19 — throw de transporte (rede, sessao morta) nao e erro de negocio: sem
      // o catch some como unhandled rejection e o operador fica sem sinal nenhum.
      // O `return` e obrigatorio — sem ele o codigo abaixo leria `res` indefinido.
      const msg =
        'Não foi possível registrar a devolução. Verifique sua conexão e tente de novo.'
      setErros([msg])
      toast.error(msg)
      return
    } finally {
      setEnviando(false)
      enviandoRef.current = false
    }

    if (res.erroGeral) {
      toast.error(res.erroGeral)
      return
    }
    if (!res.ok) {
      setErros(res.erros ?? ['Não foi possível registrar a devolução.'])
      toast.error('Nada foi registrado — veja os erros abaixo.')
      return
    }
    setSucesso({ antigo: res.antigo!, substituto: res.substituto })
    toast.success('Devolução ao fornecedor registrada.')
    // F15/C2 — NÃO chamar router.refresh() aqui: o refresh re-renderiza o Server
    // Component da página com o MESMO ?ativo=, cujo guard (status !== 'em_manutencao')
    // agora é verdadeiro (o ativo virou 'devolvido_fornecedor') e SUBSTITUÍA a página
    // inteira — form e painel de sucesso — pelo aviso âmbar. As mudanças em outras
    // telas já estão cobertas pelos revalidatePath da action (/ativos, as duas fichas
    // e /relatorios). O painel de sucesso (estado do cliente) permanece na tela.
  }

  // ---------- Painel de sucesso ----------
  if (sucesso) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
          <Check className="size-6" />
        </div>
        <h2 className="text-center text-lg font-semibold">
          Devolução ao fornecedor registrada
        </h2>
        <div className="mx-auto mt-4 grid max-w-md gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Devolvido ao fornecedor</p>
            <Button asChild variant="outline" size="sm" className="mt-1.5">
              <Link href={`/ativos/${sucesso.antigo.id}`} className="tabular-nums">
                {sucesso.antigo.patrimonio ?? 'sem patrimônio'}
              </Link>
            </Button>
          </div>
          {sucesso.substituto ? (
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xs text-muted-foreground">Substituto em estoque</p>
              <Button asChild variant="outline" size="sm" className="mt-1.5">
                <Link
                  href={`/ativos/${sucesso.substituto.id}`}
                  className="tabular-nums"
                >
                  {sucesso.substituto.patrimonio}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
              Sem substituto (fornecedor não repôs)
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link href="/ativos">Ver ativos</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Ativo antigo + chamados herdados (read-only) */}
      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PackageX className="size-4 text-muted-foreground" />
          <span className="font-medium tabular-nums">
            {ativo.patrimonio ?? 'sem patrimônio'}
          </span>
          <span className="text-sm text-muted-foreground">
            {rotuloCategoria(ativo.categoria)}
            {ativo.marca || ativo.modelo
              ? ` · ${[ativo.marca, ativo.modelo].filter(Boolean).join(' ')}`
              : ''}{' '}
            · {ativo.filial_nome}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Fornecedor</dt>
            <dd>{ouTraco(ativo.fornecedor)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Chamado interno</dt>
            <dd className="tabular-nums">{ouTraco(chamadoHerdado)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Chamado do fornecedor</dt>
            <dd>{ouTraco(chamadoFornecedorHerdado)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Fornecedor e chamados são herdados do envio à manutenção — não se
          redigitam.
        </p>
      </div>

      {/* Data + observação da devolução */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="data-devolucao">Data da devolução</Label>
          <Input
            id="data-devolucao"
            type="date"
            max={hojeISO()}
            value={dataDevolucao}
            onChange={(e) => setDataDevolucao(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="obs-devolucao">Observação (opcional)</Label>
          <Textarea
            id="obs-devolucao"
            rows={2}
            maxLength={500}
            value={obsDevolucao}
            onChange={(e) => setObsDevolucao(e.target.value)}
            placeholder="Ex.: sem conserto, crédito em garantia…"
          />
        </div>
      </div>

      {/* Toggle substituto */}
      <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
        <Checkbox
          checked={comSubstituto}
          onCheckedChange={(c) => setComSubstituto(c === true)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Cadastrar o equipamento substituto</span>
          <span className="block text-xs text-muted-foreground">
            Desmarque se o fornecedor não repôs (crédito/estorno) — só a devolução
            é registrada.
          </span>
        </span>
      </label>

      {comSubstituto && (
        <div className="space-y-3">
          <h2 className="font-semibold">Equipamento substituto</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sub-patrimonio">
                Patrimônio<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="sub-patrimonio"
                value={patrimonio}
                onChange={(e) => setPatrimonio(e.target.value)}
                placeholder="WAP0006026"
                className="font-mono tabular-nums"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-st">
                Service tag<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="sub-st"
                value={serviceTag}
                onChange={(e) => setServiceTag(e.target.value)}
                placeholder="ST-ABC123"
              />
            </div>
            <div className="grid gap-2">
              <Label>
                Categoria<span className="text-destructive"> *</span>
              </Label>
              <Select
                value={categoria || undefined}
                onValueChange={(v) => setCategoria(v as CategoriaAtivo)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIA_ORDEM.map((c) => (
                    <SelectItem key={c} value={c}>
                      {rotuloCategoria(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>
                Filial<span className="text-destructive"> *</span>
              </Label>
              <Select value={filialId || undefined} onValueChange={setFilialId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
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
            <div className="grid gap-2">
              <Label htmlFor="sub-marca">
                Marca<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="sub-marca"
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Samsung"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-modelo">
                Modelo<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="sub-modelo"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="Galaxy A55"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-memoria">Memória</Label>
              <Input
                id="sub-memoria"
                value={memoria}
                onChange={(e) => setMemoria(e.target.value)}
                placeholder="16 GB"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-armazenamento">Armazenamento</Label>
              <Input
                id="sub-armazenamento"
                value={armazenamento}
                onChange={(e) => setArmazenamento(e.target.value)}
                placeholder="512 GB SSD"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-processador">Processador</Label>
              <Input
                id="sub-processador"
                value={processador}
                onChange={(e) => setProcessador(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-hostname">Hostname</Label>
              <Input
                id="sub-hostname"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="WAP-NB-1234"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="sub-observacoes">Observações do cadastro</Label>
              <Textarea
                id="sub-observacoes"
                rows={2}
                maxLength={500}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Notas sobre o equipamento novo (opcional)"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="sub-obs-compra">
                Observação da entrada (nº da nota etc.)
              </Label>
              <Textarea
                id="sub-obs-compra"
                rows={2}
                maxLength={500}
                value={obsCompra}
                onChange={(e) => setObsCompra(e.target.value)}
                placeholder="Ex.: NF-e 12345 (opcional)"
              />
            </div>
          </div>
        </div>
      )}

      {erros.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4" />
            Nada foi registrado:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {erros.map((e, i) => (
              <li key={`${i}-${e}`}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={`/ativos/${ativo.id}`}>Cancelar</Link>
        </Button>
        <Button onClick={enviar} disabled={enviando} className="gap-2">
          {enviando ? (
            'Registrando…'
          ) : (
            <>
              Registrar devolução
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

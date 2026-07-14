'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { registrarCompra } from '@/lib/actions/compras'
import {
  expandirFaixa,
  parsearLista,
  MAX_LOTE_COMPRA,
  type ItemPatrimonio,
} from '@/lib/patrimonio'
import { CATEGORIA_ORDEM, rotuloCategoria, type CategoriaAtivo } from '@/lib/dominio'
import { hojeISO } from '@/lib/format'
import type { CompraLoteInput } from '@/lib/validators/compra'
import type { Filial } from '@/lib/queries/filiais'

export function NovaCompraForm({ filiais }: { filiais: Filial[] }) {
  const router = useRouter()
  const [modo, setModo] = useState<'lista' | 'faixa'>('lista')
  const [textoLista, setTextoLista] = useState('')
  const [faixaInicio, setFaixaInicio] = useState('')
  const [faixaFim, setFaixaFim] = useState('')

  const [categoria, setCategoria] = useState<CategoriaAtivo | ''>('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [memoria, setMemoria] = useState('')
  const [armazenamento, setArmazenamento] = useState('')
  const [processador, setProcessador] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [filialId, setFilialId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [data, setData] = useState(hojeISO())

  const [enviando, setEnviando] = useState(false)
  const [errosServidor, setErrosServidor] = useState<string[]>([])
  const [resultado, setResultado] = useState<
    { id: string; patrimonio: string }[] | null
  >(null)
  const enviandoRef = useRef(false)

  // Preview do lote (patrimônios canonicalizados + erros de parse).
  const preview = useMemo<{ itens: ItemPatrimonio[]; erros: string[] }>(() => {
    if (modo === 'lista') {
      const { itens, erros } = parsearLista(textoLista)
      return {
        itens,
        erros: erros.map((e) => `Linha ${e.linha} ("${e.texto}"): ${e.msg}`),
      }
    }
    if (!faixaInicio.trim() || !faixaFim.trim()) return { itens: [], erros: [] }
    const r = expandirFaixa(faixaInicio, faixaFim)
    if (r.erro) return { itens: [], erros: [r.erro] }
    return { itens: (r.itens ?? []).map((p) => ({ patrimonio: p })), erros: [] }
  }, [modo, textoLista, faixaInicio, faixaFim])

  async function enviar() {
    if (enviandoRef.current) return
    if (preview.erros.length > 0) {
      toast.error('Corrija os erros da lista/faixa antes de cadastrar.')
      return
    }
    if (preview.itens.length === 0) {
      toast.error('Adicione ao menos um patrimônio.')
      return
    }
    const faltando: string[] = []
    if (!categoria) faltando.push('categoria')
    if (!marca.trim()) faltando.push('marca')
    if (!modelo.trim()) faltando.push('modelo')
    if (!filialId) faltando.push('filial')
    if (faltando.length > 0) {
      toast.error(`Preencha: ${faltando.join(', ')}.`)
      return
    }

    const input: CompraLoteInput = {
      itens: preview.itens.map((i) => ({
        patrimonio: i.patrimonio,
        service_tag: i.service_tag,
      })),
      categoria: categoria as CategoriaAtivo,
      marca,
      modelo,
      memoria,
      armazenamento,
      processador,
      fornecedor,
      filial_id: Number(filialId),
      observacao,
      data,
    }

    enviandoRef.current = true
    setEnviando(true)
    setErrosServidor([])
    let res
    try {
      res = await registrarCompra(input)
    } finally {
      setEnviando(false)
      enviandoRef.current = false
    }

    if (res.erroGeral) {
      toast.error(res.erroGeral)
      return
    }
    if (!res.ok) {
      setErrosServidor(res.erros ?? ['Não foi possível cadastrar.'])
      toast.error('Nada foi cadastrado — veja os erros abaixo.')
      return
    }
    setResultado(res.criados)
    toast.success(
      `${res.criados.length} ${res.criados.length === 1 ? 'equipamento cadastrado' : 'equipamentos cadastrados'}.`,
    )
    router.refresh()
  }

  function reiniciar() {
    setTextoLista('')
    setFaixaInicio('')
    setFaixaFim('')
    setMarca('')
    setModelo('')
    setMemoria('')
    setArmazenamento('')
    setProcessador('')
    setFornecedor('')
    setObservacao('')
    setErrosServidor([])
    setResultado(null)
  }

  // ---------- Painel de sucesso ----------
  if (resultado) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
          <Check className="size-6" />
        </div>
        <h2 className="text-lg font-semibold">
          {resultado.length}{' '}
          {resultado.length === 1
            ? 'equipamento cadastrado'
            : 'equipamentos cadastrados'}{' '}
          em estoque
        </h2>
        <div className="mt-3 flex max-h-56 flex-wrap justify-center gap-2 overflow-y-auto">
          {resultado.map((a) => (
            <Button key={a.id} asChild variant="outline" size="sm">
              <Link href={`/ativos/${a.id}`} className="tabular-nums">
                {a.patrimonio}
              </Link>
            </Button>
          ))}
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reiniciar}>Cadastrar mais</Button>
          <Button asChild variant="outline">
            <Link href="/ativos">Ver ativos</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Patrimônios */}
      <div className="space-y-3">
        <div>
          <h2 className="font-semibold">Patrimônios</h2>
          <p className="text-sm text-muted-foreground">
            Cole a lista ou informe uma faixa. Todos serão do mesmo modelo (abaixo).
          </p>
        </div>

        <Tabs value={modo} onValueChange={(v) => setModo(v as 'lista' | 'faixa')}>
          <TabsList>
            <TabsTrigger value="lista">Colar lista</TabsTrigger>
            <TabsTrigger value="faixa">Faixa</TabsTrigger>
          </TabsList>
          <TabsContent value="lista" className="mt-3">
            <Label htmlFor="lista" className="mb-2">
              Um por linha — service tag opcional após vírgula
            </Label>
            <Textarea
              id="lista"
              rows={6}
              value={textoLista}
              onChange={(e) => setTextoLista(e.target.value)}
              placeholder={'WAP0006026\nWAP0006027, ST-ABC123\nWAP0006028'}
              className="font-mono text-sm"
            />
          </TabsContent>
          <TabsContent value="faixa" className="mt-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor="faixa-ini">De</Label>
                <Input
                  id="faixa-ini"
                  value={faixaInicio}
                  onChange={(e) => setFaixaInicio(e.target.value)}
                  placeholder="WAP0006026"
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="faixa-fim">Até</Label>
                <Input
                  id="faixa-fim"
                  value={faixaFim}
                  onChange={(e) => setFaixaFim(e.target.value)}
                  placeholder="WAP0006035"
                  className="font-mono tabular-nums"
                />
              </div>
              <p className="pb-2 text-xs text-muted-foreground">
                Mesmo prefixo · até {MAX_LOTE_COMPRA} por lote
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Preview */}
        {preview.erros.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <TriangleAlert className="size-4" />
              Corrija antes de continuar:
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              {preview.erros.map((e, i) => (
                <li key={`${i}-${e}`}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {preview.itens.length > 0 && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">
              {preview.itens.length}{' '}
              {preview.itens.length === 1 ? 'equipamento' : 'equipamentos'} a
              cadastrar
            </p>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {preview.itens.map((i, idx) => (
                <span
                  key={`${i.patrimonio}-${idx}`}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums"
                >
                  {i.patrimonio}
                  {i.service_tag ? ` · ${i.service_tag}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Erros do servidor (duplicidade etc.) */}
      {errosServidor.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="mb-1 font-medium">Nada foi cadastrado:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {errosServidor.map((e, i) => (
              <li key={`${i}-${e}`}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Dados do modelo */}
      <div className="space-y-3">
        <h2 className="font-semibold">Dados do modelo</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              Filial que recebeu<span className="text-destructive"> *</span>
            </Label>
            <Select
              value={filialId || undefined}
              onValueChange={setFilialId}
            >
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
            <Label htmlFor="marca">
              Marca<span className="text-destructive"> *</span>
            </Label>
            <Input
              id="marca"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Samsung"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="modelo">
              Modelo<span className="text-destructive"> *</span>
            </Label>
            <Input
              id="modelo"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Galaxy A17"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="memoria">Memória</Label>
            <Input
              id="memoria"
              value={memoria}
              onChange={(e) => setMemoria(e.target.value)}
              placeholder="8 GB"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="armazenamento">Armazenamento</Label>
            <Input
              id="armazenamento"
              value={armazenamento}
              onChange={(e) => setArmazenamento(e.target.value)}
              placeholder="256 GB"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="processador">Processador</Label>
            <Input
              id="processador"
              value={processador}
              onChange={(e) => setProcessador(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fornecedor">Fornecedor</Label>
            <Input
              id="fornecedor"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              placeholder="WAP"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="data-compra">Data da entrada</Label>
            <Input
              id="data-compra"
              type="date"
              max={hojeISO()}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="obs-compra">Observação (nº da nota fiscal etc.)</Label>
            <Textarea
              id="obs-compra"
              rows={2}
              maxLength={500}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: NF-e 12345, garantia 12 meses…"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href="/ativos">Cancelar</Link>
        </Button>
        <Button
          onClick={enviar}
          disabled={enviando || preview.itens.length === 0}
        >
          {enviando
            ? 'Cadastrando…'
            : `Cadastrar ${preview.itens.length || ''} ${preview.itens.length === 1 ? 'equipamento' : 'equipamentos'}`.trim()}
        </Button>
      </div>
    </div>
  )
}

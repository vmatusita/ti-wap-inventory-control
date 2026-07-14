'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, Pencil, TriangleAlert } from 'lucide-react'
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
import { prepararTermo, gerarTermo, type PreparacaoTermo } from '@/lib/actions/termos'
import {
  TERMO_ROTULO,
  tiposRespPara,
  type FamiliaTermo,
  type TermoTipo,
} from '@/lib/termos/tipos'
import { hojeISO } from '@/lib/format'
import type { CategoriaAtivo } from '@/lib/dominio'
import type { CamposTermo } from '@/lib/validators/termo'

type CampoDef = { chave: keyof CamposTermo; rotulo: string; multi?: boolean }

const CAMPOS_RESP: CampoDef[] = [
  { chave: 'colaborador', rotulo: 'Colaborador' },
  { chave: 'marca', rotulo: 'Marca' },
  { chave: 'modelo', rotulo: 'Modelo' },
  { chave: 'service_tag', rotulo: 'Service Tag' },
  { chave: 'patrimonio', rotulo: 'Patrimônio' },
  { chave: 'chamado', rotulo: 'Chamado' },
]
const CAMPOS_CELULAR: CampoDef[] = [
  { chave: 'telefone', rotulo: 'Nº do telefone' },
  { chave: 'imei', rotulo: 'IMEI' },
  { chave: 'pulsus', rotulo: 'Pulsus' },
  { chave: 'obs', rotulo: 'Observação do aparelho', multi: true },
]
const CAMPOS_DEVOL: CampoDef[] = [
  { chave: 'colaborador', rotulo: 'Colaborador' },
  { chave: 'descricao', rotulo: 'Descrição (motivo)' },
  { chave: 'series', rotulo: 'Números de série' },
  { chave: 'patrimonios', rotulo: 'Patrimônios' },
  { chave: 'marcas_modelos', rotulo: 'Marcas e modelos' },
  { chave: 'outros_componentes', rotulo: 'Outros componentes', multi: true },
  { chave: 'observacao', rotulo: 'Observação', multi: true },
  { chave: 'tecnico', rotulo: 'Responsável de TI (recebeu)' },
]

export function GerarTermoDialog({
  familia,
  movimentacaoIds,
  categoria,
  tipoDevolucao,
  tipoInicial,
  rotulo,
  trigger,
  onGerado,
}: {
  familia: FamiliaTermo
  movimentacaoIds: string[]
  categoria?: CategoriaAtivo
  tipoDevolucao?: TermoTipo
  tipoInicial?: TermoTipo
  rotulo: string
  trigger?: React.ReactNode
  onGerado?: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [prep, setPrep] = useState<PreparacaoTermo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [tipo, setTipo] = useState<TermoTipo | ''>('')
  const [campos, setCampos] = useState<CamposTermo>({})
  const [data, setData] = useState(hojeISO())
  const [blob, setBlob] = useState<Blob | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('termo.docx')
  const [gerou, setGerou] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const variantes = familia === 'responsabilidade' && categoria ? tiposRespPara(categoria) : []
  const ehCelular = familia === 'responsabilidade' && categoria === 'celular'
  const camposDef: CampoDef[] =
    familia === 'devolucao'
      ? CAMPOS_DEVOL
      : ehCelular
        ? [...CAMPOS_RESP, ...CAMPOS_CELULAR]
        : CAMPOS_RESP

  // Carrega o pré-preenchimento (chamado no evento de abertura — não em effect).
  async function carregarPrep() {
    setCarregando(true)
    setBlob(null)
    setGerou(false)
    const res = await prepararTermo({ movimentacaoIds, familia })
    setCarregando(false)
    if (!res.ok) {
      toast.error(res.erro ?? 'Não foi possível preparar o termo.')
      setAberto(false)
      return
    }
    setPrep(res)
    // Tipo inicial: explícito > variante já gerada > devolução fixa > 1ª opção.
    const jaGerado = res.existentes[0]?.tipo
    const inicial =
      tipoInicial ??
      jaGerado ??
      tipoDevolucao ??
      (familia === 'responsabilidade' && categoria ? tiposRespPara(categoria)[0] : undefined)
    setTipo(inicial ?? '')
    const existente = inicial ? res.existentes.find((e) => e.tipo === inicial) : undefined
    if (existente) {
      const { data: d, ...rest } = existente.dados
      setCampos(rest)
      setData(d ?? res.data)
    } else {
      setCampos(res.campos)
      setData(res.data)
    }
  }

  // Renderiza o .docx REAL gerado (docx-preview) — o que se vê é o que se baixa.
  useEffect(() => {
    if (!blob || !previewRef.current) return
    let vivo = true
    const alvo = previewRef.current
    alvo.innerHTML = ''
    blob.arrayBuffer().then(async (buf) => {
      if (!vivo) return
      const { renderAsync } = await import('docx-preview')
      await renderAsync(buf, alvo, undefined, {
        className: 'docx',
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
      })
    })
    return () => {
      vivo = false
    }
  }, [blob])

  function setCampo(chave: keyof CamposTermo, valor: string) {
    setCampos((c) => ({ ...c, [chave]: valor }))
  }

  async function gerar() {
    if (!tipo || !prep) return
    setGerando(true)
    try {
      const res = await gerarTermo({
        tipo,
        movimentacaoIds,
        ativoIds: prep.ativoIds,
        data,
        campos,
      })
      if (!res.ok || !res.url) {
        toast.error(res.erro ?? 'Falha ao gerar o termo.')
        return
      }
      const resp = await fetch(res.url)
      const b = await resp.blob()
      setBlob(b)
      setNomeArquivo(res.nomeArquivo ?? 'termo.docx')
      setGerou(true)
      toast.success('Termo gerado. Confira o documento abaixo.')
    } catch {
      toast.error('Falha ao gerar o termo.')
    } finally {
      setGerando(false)
    }
  }

  function baixar() {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function aoMudarAberto(v: boolean) {
    setAberto(v)
    if (v) void carregarPrep()
    else if (gerou) onGerado?.()
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <FileText className="size-4" />
            Gerar termo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            {blob ? 'Termo gerado' : 'Gerar termo'} — {rotulo}
          </DialogTitle>
          <DialogDescription>
            {blob
              ? 'Pré-visualização do documento final. O arquivo baixado é fiel ao que aparece aqui.'
              : 'Confira e edite os campos — tudo é editável, inclusive a data. As edições valem só para o documento.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] overflow-y-auto p-4">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando dados do termo…
            </div>
          ) : blob ? (
            <div className="overflow-x-auto rounded-lg border bg-muted/30 p-3">
              <div ref={previewRef} className="mx-auto" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Variante do monitor (§3.5) */}
              {variantes.length > 1 && (
                <div className="grid gap-2">
                  <Label>Modelo do termo</Label>
                  <Select value={tipo || undefined} onValueChange={(v) => setTipo(v as TermoTipo)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha o modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {variantes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TERMO_ROTULO[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {prep?.avisos.map((a) => (
                <p
                  key={a}
                  className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {a}
                </p>
              ))}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="termo-data">Data do termo</Label>
                  <Input
                    id="termo-data"
                    type="date"
                    max={hojeISO()}
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                  />
                </div>
                {camposDef.map((c) => (
                  <div
                    key={c.chave}
                    className={'grid gap-2 ' + (c.multi ? 'sm:col-span-2' : '')}
                  >
                    <Label htmlFor={`termo-${c.chave}`}>{c.rotulo}</Label>
                    {c.multi ? (
                      <Textarea
                        id={`termo-${c.chave}`}
                        rows={2}
                        value={campos[c.chave] ?? ''}
                        onChange={(e) => setCampo(c.chave, e.target.value)}
                      />
                    ) : (
                      <Input
                        id={`termo-${c.chave}`}
                        value={campos[c.chave] ?? ''}
                        onChange={(e) => setCampo(c.chave, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t p-4">
          {blob ? (
            <>
              <Button variant="ghost" onClick={() => setBlob(null)} className="gap-2">
                <Pencil className="size-4" /> Editar
              </Button>
              <Button onClick={baixar} className="gap-2">
                <Download className="size-4" /> Baixar .docx
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={gerando}>
                Cancelar
              </Button>
              <Button onClick={gerar} disabled={gerando || carregando || !tipo} className="gap-2">
                {gerando ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Gerando…
                  </>
                ) : (
                  <>
                    <FileText className="size-4" /> Gerar e visualizar
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

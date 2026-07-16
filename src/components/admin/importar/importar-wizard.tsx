'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileWarning,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Filial } from '@/lib/queries/filiais'
import type { CustoSubstituir, TermoMultiFilial } from '@/lib/queries/import-logs'
import type { ErroImport, PlanoImport, ValidacaoImport } from '@/lib/import'
import { TabelaErros } from '@/components/admin/importar/tabela-erros'
import {
  aplicarImport,
  urlBackup,
  validarImport,
  type ResultadoImport,
} from '@/lib/actions/importar'

const TAMANHO_MAX = 5 * 1024 * 1024

const PASSOS = ['Configurar', 'Upload', 'Preview', 'Confirmar', 'Resultado'] as const

type Previa = {
  filial: Filial
  validacao: ValidacaoImport
  custo: CustoSubstituir
  termosMultiFilial: TermoMultiFilial[]
}

// Lista de erros (bloqueantes + avisos) como CSV `;`+BOM — padrão de export do
// projeto (abre direto no Excel pt-BR).
function baixarCsvErros(erros: ErroImport[], nomeBase: string) {
  const esc = (v: string) => {
    const s = v ?? ''
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const linhas = [
    ['linha', 'coluna', 'valor', 'tipo', 'motivo'].join(';'),
    ...erros.map((e) =>
      [String(e.linha), e.coluna, e.valor, e.tipo, e.mensagem].map(esc).join(';'),
    ),
  ]
  const conteudo = '﻿' + linhas.join('\r\n')
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u
  a.download = `erros-import-${nomeBase}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(u)
}

function NumeroGrande({
  valor,
  rotulo,
  tom = 'neutro',
}: {
  valor: number
  rotulo: string
  tom?: 'neutro' | 'destrutivo' | 'positivo'
}) {
  return (
    <div className="rounded-lg border p-4">
      <div
        className={cn(
          'text-3xl font-semibold tabular-nums',
          tom === 'destrutivo' && 'text-destructive',
          tom === 'positivo' && 'text-green-600 dark:text-green-400',
        )}
      >
        {valor.toLocaleString('pt-BR')}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{rotulo}</div>
    </div>
  )
}

function Stepper({ passo }: { passo: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {PASSOS.map((p, i) => {
        const n = i + 1
        const estado = n < passo ? 'feito' : n === passo ? 'atual' : 'futuro'
        return (
          <li key={p} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                estado === 'atual' && 'bg-brand-amarelo text-black',
                estado === 'feito' && 'bg-foreground text-background',
                estado === 'futuro' && 'bg-muted text-muted-foreground',
              )}
            >
              {n}
            </span>
            <span
              className={cn(
                estado === 'futuro' ? 'text-muted-foreground' : 'font-medium',
              )}
            >
              {p}
            </span>
            {n < PASSOS.length && <span className="text-muted-foreground">›</span>}
          </li>
        )
      })}
    </ol>
  )
}

// Wizard do import "Substituir tudo" (OS-F7 / W3). Client: estados por passo,
// pending em todos os botões, erros por toast + inline. As escritas passam pelas
// Server Actions (validarImport / aplicarImport).
export function ImportarWizard({ filiais }: { filiais: Filial[] }) {
  const router = useRouter()
  const [passo, setPasso] = useState(1)
  const [filialId, setFilialId] = useState<string>('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroUpload, setErroUpload] = useState<string | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [confirmacao, setConfirmacao] = useState('')
  const [resultado, setResultado] = useState<{
    resultado: ResultadoImport
    backupPath: string
    filial: Filial
  } | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [baixandoBackup, setBaixandoBackup] = useState(false)

  const [analisando, startAnalise] = useTransition()
  const [aplicando, startAplicar] = useTransition()

  const filialSel = useMemo(
    () => filiais.find((f) => String(f.id) === filialId) ?? null,
    [filiais, filialId],
  )

  const aplicavel =
    !!previa?.validacao.plano && previa.termosMultiFilial.length === 0

  function mudarFilial(v: string) {
    setFilialId(v)
    setPrevia(null)
    setConfirmacao('')
    setErroAcao(null)
  }

  function mudarArquivo(f: File | null) {
    setArquivo(f)
    setPrevia(null)
    setErroUpload(null)
    setErroAcao(null)
    if (f) {
      if (!f.name.toLowerCase().endsWith('.csv')) {
        setErroUpload('O arquivo precisa ter extensão .csv.')
      } else if (f.size > TAMANHO_MAX) {
        setErroUpload(
          `O arquivo tem ${(f.size / 1024 / 1024).toFixed(1)} MB — o limite é 5 MB.`,
        )
      } else if (f.size === 0) {
        setErroUpload('O arquivo está vazio.')
      }
    }
  }

  function analisar() {
    if (!arquivo || !filialSel || erroUpload) return
    const fd = new FormData()
    fd.set('arquivo', arquivo)
    fd.set('filialId', String(filialSel.id))
    setErroAcao(null)
    startAnalise(async () => {
      const res = await validarImport(fd)
      if (!res.ok) {
        toast.error(res.erro)
        setErroAcao(res.erro)
        return
      }
      setPrevia({
        filial: res.filial,
        validacao: res.validacao,
        custo: res.custo,
        termosMultiFilial: res.termosMultiFilial,
      })
      setConfirmacao('')
      setPasso(3)
    })
  }

  function aplicar() {
    const plano: PlanoImport | null = previa?.validacao.plano ?? null
    if (!previa || !plano || !aplicavel) return
    if (confirmacao !== previa.filial.nome) return
    setErroAcao(null)
    startAplicar(async () => {
      const res = await aplicarImport({
        plano,
        confirmacaoTexto: confirmacao,
        custoPreview: previa.custo,
      })
      if (!res.ok) {
        toast.error(res.erro)
        setErroAcao(res.erro)
        return
      }
      setResultado({
        resultado: res.resultado,
        backupPath: res.backupPath,
        filial: previa.filial,
      })
      setPasso(5)
      router.refresh()
    })
  }

  async function baixarBackupResultado(logId: string, slug: string) {
    setBaixandoBackup(true)
    try {
      const res = await urlBackup(logId)
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      const r = await fetch(res.url)
      const b = await r.blob()
      const u = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = u
      a.download = `backup-${slug}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(u)
    } catch {
      toast.error('Falha ao baixar o backup.')
    } finally {
      setBaixandoBackup(false)
    }
  }

  function recomecar() {
    setPasso(1)
    setArquivo(null)
    setErroUpload(null)
    setPrevia(null)
    setConfirmacao('')
    setResultado(null)
    setErroAcao(null)
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">Importar acervo por CSV</CardTitle>
        <Stepper passo={passo} />
      </CardHeader>
      <CardContent className="space-y-5">
        {/* -------- Passo 1: Configurar -------- */}
        {passo === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-filial">Filial</Label>
              <Select value={filialId} onValueChange={mudarFilial}>
                <SelectTrigger id="import-filial" className="w-full sm:max-w-xs">
                  <SelectValue placeholder="Selecione a filial" />
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

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2 font-medium">
                <FileWarning className="size-4 text-destructive" />
                Substituir tudo — go-live da filial
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Este é o único modo de import. Ele{' '}
                <strong>apaga o acervo atual da filial</strong> (ativos, linha do
                tempo, termos e anotações) e recria tudo a partir do CSV. Snapshots
                de relatório já congelados permanecem. Use apenas na virada
                (go-live) de uma filial — não é uma atualização incremental.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                className="gap-2"
                disabled={!filialSel}
                onClick={() => setPasso(2)}
              >
                Avançar
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* -------- Passo 2: Upload -------- */}
        {passo === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Filial selecionada: <strong>{filialSel?.nome}</strong>. Envie o CSV do
              inventário (máx. 5 MB).
            </p>
            <div className="space-y-2">
              <Label htmlFor="import-arquivo">Arquivo CSV</Label>
              <Input
                id="import-arquivo"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => mudarArquivo(e.target.files?.[0] ?? null)}
              />
              {arquivo && !erroUpload && (
                <p className="text-xs text-muted-foreground">
                  {arquivo.name} · {(arquivo.size / 1024).toLocaleString('pt-BR', {
                    maximumFractionDigits: 0,
                  })}{' '}
                  KB
                </p>
              )}
              {erroUpload && <p className="text-sm text-destructive">{erroUpload}</p>}
            </div>

            {erroAcao && <p className="text-sm text-destructive">{erroAcao}</p>}

            <div className="flex items-center justify-between">
              <Button variant="ghost" className="gap-2" onClick={() => setPasso(1)}>
                <ArrowLeft className="size-4" />
                Voltar
              </Button>
              <Button
                className="gap-2"
                disabled={!arquivo || !!erroUpload || analisando}
                onClick={analisar}
              >
                <Upload className="size-4" />
                {analisando ? 'Analisando…' : 'Analisar CSV'}
              </Button>
            </div>
          </div>
        )}

        {/* -------- Passo 3: Preview -------- */}
        {passo === 3 && previa && (
          <div className="space-y-5">
            {aplicavel ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumeroGrande
                  valor={previa.validacao.resumo.criar}
                  rotulo="ativos a criar"
                  tom="positivo"
                />
                <NumeroGrande
                  valor={previa.validacao.resumo.semData}
                  rotulo="sem data de entrada"
                />
                <NumeroGrande valor={previa.custo.ativos} rotulo="ativos a apagar" tom="destrutivo" />
                <NumeroGrande
                  valor={previa.custo.movimentacoes}
                  rotulo="movimentações a apagar"
                  tom="destrutivo"
                />
                <NumeroGrande
                  valor={previa.custo.anotacoes}
                  rotulo="anotações a apagar"
                  tom="destrutivo"
                />
                <NumeroGrande valor={previa.custo.termos} rotulo="termos a apagar" tom="destrutivo" />
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4" />
                  Import bloqueado
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {previa.validacao.bloqueantes.length > 0
                    ? 'Corrija os erros abaixo no CSV e reenvie o arquivo.'
                    : 'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.'}
                </p>
              </div>
            )}

            {previa.termosMultiFilial.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Termos multi-filial ({previa.termosMultiFilial.length})
                </h3>
                <ul className="rounded-lg border divide-y text-sm">
                  {previa.termosMultiFilial.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 p-2.5">
                      <span className="font-medium">{t.colaborador ?? '—'}</span>
                      <span className="text-muted-foreground">{t.tipo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {previa.validacao.bloqueantes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-destructive">
                  Bloqueantes ({previa.validacao.bloqueantes.length})
                </h3>
                <TabelaErros erros={previa.validacao.bloqueantes} />
              </div>
            )}

            {previa.validacao.avisos.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Avisos ({previa.validacao.avisos.length})
                </h3>
                <TabelaErros erros={previa.validacao.avisos} />
              </div>
            )}

            {(previa.validacao.bloqueantes.length > 0 ||
              previa.validacao.avisos.length > 0) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() =>
                  baixarCsvErros(
                    [...previa.validacao.bloqueantes, ...previa.validacao.avisos],
                    previa.filial.slug,
                  )
                }
              >
                <Download className="size-4" />
                Baixar lista de erros (CSV)
              </Button>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="ghost" className="gap-2" onClick={() => setPasso(2)}>
                <ArrowLeft className="size-4" />
                Trocar arquivo
              </Button>
              <Button
                className="gap-2"
                disabled={!aplicavel}
                onClick={() => setPasso(4)}
              >
                Avançar
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* -------- Passo 4: Confirmar -------- */}
        {passo === 4 && previa && aplicavel && (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="size-4" />
                Esta ação é irreversível
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Ao confirmar, o acervo atual da filial{' '}
                <strong>{previa.filial.nome}</strong> será apagado permanentemente e
                recriado a partir do CSV. Um backup do acervo é gravado antes.
              </p>
              <ul className="mt-3 grid gap-1 text-sm tabular-nums sm:grid-cols-2">
                <li>
                  <strong>{previa.custo.ativos.toLocaleString('pt-BR')}</strong> ativos
                  apagados
                </li>
                <li>
                  <strong>{previa.custo.movimentacoes.toLocaleString('pt-BR')}</strong>{' '}
                  movimentações apagadas
                </li>
                <li>
                  <strong>{previa.custo.anotacoes.toLocaleString('pt-BR')}</strong>{' '}
                  anotações apagadas
                </li>
                <li>
                  <strong>{previa.custo.termos.toLocaleString('pt-BR')}</strong> termos
                  apagados
                </li>
                <li className="sm:col-span-2">
                  <strong>{previa.validacao.resumo.criar.toLocaleString('pt-BR')}</strong>{' '}
                  ativos criados a partir do CSV
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-confirmacao">
                Digite <span className="font-mono font-semibold">{previa.filial.nome}</span>{' '}
                para confirmar
              </Label>
              <Input
                id="import-confirmacao"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder={previa.filial.nome}
                autoComplete="off"
              />
            </div>

            {erroAcao && <p className="text-sm text-destructive">{erroAcao}</p>}

            <div className="flex items-center justify-between border-t pt-4">
              <Button
                variant="ghost"
                className="gap-2"
                onClick={() => setPasso(3)}
                disabled={aplicando}
              >
                <ArrowLeft className="size-4" />
                Voltar
              </Button>
              <Button
                variant="destructive"
                className="gap-2"
                disabled={aplicando || confirmacao !== previa.filial.nome}
                onClick={aplicar}
              >
                {aplicando ? 'Substituindo…' : 'Substituir tudo'}
              </Button>
            </div>
          </div>
        )}

        {/* -------- Passo 5: Resultado -------- */}
        {passo === 5 && resultado && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-5" />
              <span className="font-medium">
                Import concluído para {resultado.filial.nome}.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumeroGrande
                valor={resultado.resultado.ativosCriados}
                rotulo="ativos criados"
                tom="positivo"
              />
              <NumeroGrande valor={resultado.resultado.movsApagadas} rotulo="movs apagadas" />
              <NumeroGrande
                valor={resultado.resultado.anotacoesApagadas}
                rotulo="anotações apagadas"
              />
              <NumeroGrande valor={resultado.resultado.termosApagados} rotulo="termos apagados" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-2"
                disabled={baixandoBackup}
                onClick={() =>
                  baixarBackupResultado(resultado.resultado.logId, resultado.filial.slug)
                }
              >
                <Download className="size-4" />
                {baixandoBackup ? 'Baixando…' : 'Baixar backup'}
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link href={`/ativos?filial=${resultado.filial.id}`}>
                  Ver ativos da filial
                </Link>
              </Button>
              <Button variant="ghost" onClick={recomecar}>
                Novo import
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

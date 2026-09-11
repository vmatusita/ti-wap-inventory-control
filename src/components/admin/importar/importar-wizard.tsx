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
  Wand2,
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
import { baixarBlob } from '@/lib/download'
import type { Filial } from '@/lib/queries/filiais'
import type { CustoSubstituir, TermoMultiFilial } from '@/lib/queries/import-logs'
import type {
  CorrecaoImport,
  ErroImport,
  PlanoImport,
  RegistroImport,
  ValidacaoImport,
  VocabularioCliente,
} from '@/lib/import'
import { extrairPatrimonioDoHostname } from '@/lib/import/deparas'
import { TAMANHO_MAX_ARQUIVO, TAMANHO_MAX_ROTULO } from '@/lib/import/limites'
import {
  confirmacaoImportConfere,
  dicaConfirmacaoNaoConfere,
} from '@/lib/validators/confirmacao-digitada'
import { TabelaErros } from '@/components/admin/importar/tabela-erros'
import { GruposErros } from '@/components/admin/importar/grupos-erros'
import { CorrecoesAplicadas } from '@/components/admin/importar/correcoes-aplicadas'
import {
  aplicarImport,
  baixarCsvCorrigido,
  urlBackup,
  validarImport,
  type ResultadoImport,
} from '@/lib/actions/importar'

const PASSOS = ['Configurar', 'Upload', 'Preview', 'Confirmar', 'Resultado'] as const

// F25 — `Pick`, e não `Filial`: a fase acrescentou `cidade` ao tipo (é a cidade
// que assina o TERMO) e o import não tem nada com isso. Ver actions/importar.ts.
type Previa = {
  filial: Pick<Filial, 'id' | 'slug' | 'nome'>
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
  baixarBlob(blob, `erros-import-${nomeBase}.csv`)
}

function NumeroGrande({
  valor,
  rotulo,
  tom = 'neutro',
}: {
  valor: number
  rotulo: string
  tom?: 'neutro' | 'destrutivo' | 'positivo' | 'aviso'
}) {
  return (
    <div className="rounded-lg border p-4">
      <div
        className={cn(
          'text-3xl font-semibold tabular-nums',
          tom === 'destrutivo' && 'text-destructive',
          tom === 'positivo' && 'text-green-600 dark:text-green-400',
          tom === 'aviso' && 'text-warning',
        )}
      >
        {valor.toLocaleString('pt-BR')}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{rotulo}</div>
    </div>
  )
}

// F7F/F7-pós — painel NEUTRO de auditoria dos patrimônios que o motor preencheu
// sozinho pelo hostname. É uma CORREÇÃO AUTOMÁTICA (F7-pós, Johnny 20/07/2026), não um
// aviso: fica fora dos cards de correção E das superfícies de "aviso" (contagem, tabela,
// lista de erros). O valor é derivado com `extrairPatrimonioDoHostname` — a MESMA régua
// do motor — sobre o hostname do contexto, então UI e motor nunca divergem.
function PainelHostname({
  avisos,
  contexto,
  prefixosPatrimonio,
}: {
  avisos: ErroImport[]
  contexto: Record<number, RegistroImport>
  prefixosPatrimonio: readonly string[]
}) {
  const doHostname = avisos.filter((a) => a.tipo === 'patrimonio_do_hostname')
  if (doHostname.length === 0) return null
  const n = doHostname.length
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center gap-2 font-medium">
        <Wand2 className="size-4 text-muted-foreground" />
        {n.toLocaleString('pt-BR')} {n === 1 ? 'patrimônio preenchido' : 'patrimônios preenchidos'}{' '}
        automaticamente pelo hostname
      </div>
      <p className="text-sm text-muted-foreground">
        Estas linhas estavam <strong>sem patrimônio</strong> ou com um valor{' '}
        <strong>fora do formato</strong>, mas o hostname trazia um número no formato canônico —
        foram preenchidas <strong>automaticamente</strong> e importam normalmente. É uma
        correção automática, não um aviso: nada a fazer aqui. A lista abaixo (com o valor
        original) é só para conferência — confira se o número bate com o aparelho físico.
      </p>
      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-2 text-left font-medium">Linha</th>
              <th className="p-2 text-left font-medium">Valor original</th>
              <th className="p-2 text-left font-medium">Hostname</th>
              <th className="p-2 text-left font-medium">Patrimônio preenchido</th>
            </tr>
          </thead>
          <tbody>
            {doHostname.map((a) => {
              const hostname = contexto[a.linha]?.hostname ?? ''
              const preenchido = extrairPatrimonioDoHostname(hostname, prefixosPatrimonio)
              const original = a.valor?.trim() ? a.valor.trim() : '(vazio)'
              return (
                <tr key={a.linha} className="border-t">
                  <td className="p-2 tabular-nums text-muted-foreground">{a.linha}</td>
                  <td className="p-2 font-mono text-muted-foreground">{original}</td>
                  <td className="p-2 font-mono">{hostname || '—'}</td>
                  <td className="p-2 font-mono">{preenchido ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
//
// F7B — ciclo de correção: o `File` fica em memória entre os passos e cada
// correção reenvia ARQUIVO + CORREÇÕES ACUMULADAS para `validarImport`, que
// revalida tudo do zero pelo motor. O arquivo nunca é alterado; a lista de
// correções zera ao trocar arquivo ou filial (OS-F7B §3.8 — previsível vence
// esperto).
export function ImportarWizard({
  filiais,
  vocabulario,
}: {
  filiais: Filial[]
  /** F56 · Frente D — a fatia de CLIENTE do vocabulário (`paraCliente`, lida uma
   *  vez pela página): categorias/estados IMPORTÁVEIS (com rótulo) e os prefixos
   *  de patrimônio. Só para EXIBIR — o servidor nunca julga com o que veio daqui;
   *  as duas actions do motor leem o vocabulário INTEIRO do banco a cada chamada. */
  vocabulario: VocabularioCliente
}) {
  const router = useRouter()
  const [passo, setPasso] = useState(1)
  const [filialId, setFilialId] = useState<string>('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroUpload, setErroUpload] = useState<string | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [correcoes, setCorrecoes] = useState<CorrecaoImport[]>([])
  const [listaAberta, setListaAberta] = useState(false)
  const [baixandoCsv, setBaixandoCsv] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [resultado, setResultado] = useState<{
    resultado: ResultadoImport
    backupPath: string
    filial: Pick<Filial, 'id' | 'slug' | 'nome'>
  } | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [baixandoBackup, setBaixandoBackup] = useState(false)

  const [analisando, startAnalise] = useTransition()
  const [aplicando, startAplicar] = useTransition()

  const filialSel = useMemo(
    () => filiais.find((f) => String(f.id) === filialId) ?? null,
    [filiais, filialId],
  )

  // `criar > 0` fecha um beco sem saída achado na revisão adversarial da F7B: um
  // CSV com header válido e nenhuma linha aproveitável (só cabeçalho, ou só
  // sobras de edição sem Site e sem patrimônio) não gera bloqueante — o motor
  // devolve plano com 0 ativos e a tela dizia "Pronto para aplicar". O operador
  // gastava o backup, digitava o nome da filial e só então o Zod recusava com
  // "gere o preview novamente" — que devolveria exatamente o mesmo estado. A
  // régua do plano_vazio no motor só cobre o caso de REMOÇÃO (retrocompat da F7);
  // aqui a UI avisa antes, como manda a OS-F7B §8.4.
  const aplicavel =
    !!previa?.validacao.plano &&
    previa.validacao.resumo.criar > 0 &&
    previa.termosMultiFilial.length === 0

  // Tipos que o motor classificou como AVISO nesta análise — decide a cor do
  // badge do card (bloqueante × aviso) sem depender de identidade de objeto (o
  // retorno da Server Action é serializado: as referências não sobrevivem).
  const tiposAviso = useMemo(
    () => new Set((previa?.validacao.avisos ?? []).map((e) => e.tipo)),
    [previa],
  )

  // F7-pós (Johnny, 20/07/2026): o auto-preenchimento do patrimônio pelo hostname
  // NÃO é um aviso a corrigir — é uma CORREÇÃO AUTOMÁTICA. Sai da contagem de avisos,
  // da tabela de avisos e do "baixar lista de erros"; segue só no painel de auditoria
  // (neutro) e no contador "preenchidos pelo hostname". `patrimonio_do_hostname` já
  // ficava fora dos cards (agruparErros); aqui sai também das superfícies de "aviso".
  const avisosParaCorrigir = useMemo(
    () =>
      (previa?.validacao.avisos ?? []).filter(
        (e) => e.tipo !== 'patrimonio_do_hostname',
      ),
    [previa],
  )

  // F56 · Frente C — o orçamento de resposta (`orcamento.ts`) pode ter reduzido
  // `bloqueantes`/`avisos` a um DETALHE parcial (arquivo com erros demais para
  // listar todos); `resumo.detalhe` sempre traz os TOTAIS reais, que a tela usa
  // no lugar de `.length` dos arrays — no caminho comum (não reduzido) são o
  // mesmo número, então não muda nada visível quando o arquivo é normal.
  const detalheReduzido = previa?.validacao.resumo.detalhe.reduzido ?? false
  const totalBloqueantes = previa?.validacao.resumo.detalhe.totalBloqueantes ?? 0
  // `totalAvisos` do motor inclui `patrimonio_do_hostname` (informativo, fora de
  // "avisos a corrigir"); `resumo.patrimonioDoHostname` é a MESMA contagem, sempre
  // completa (calculada antes do orçamento reduzir nada) — a subtração dá o total
  // real de `avisosParaCorrigir`, mesmo quando o array em si veio reduzido.
  const totalAvisosParaCorrigir =
    (previa?.validacao.resumo.detalhe.totalAvisos ?? 0) -
    (previa?.validacao.resumo.patrimonioDoHostname ?? 0)

  // ADM-07 (F27) — dica quando o texto digitado não bate com o nome da filial.
  //
  // ⚠ ATUALIZADO NA F52, e o comentário anterior descrevia um mundo que deixou de
  // existir. Ele dizia que o servidor compara IGUALDADE EXATA e que "a RPC nem repete
  // essa checagem". As duas metades ficaram falsas: a Server Action passou a usar
  // `confirmacaoImportConfere`, e a RPC `importar_ativos_substituir` passou a conferir
  // a confirmação POR DENTRO, com a mesma régua (`upper(btrim(coalesce(...)))`).
  //
  // Com isso o raciocínio antigo se INVERTEU: manter o cliente exato deixaria o botão
  // desabilitado para um texto que o servidor ACEITARIA. Agora as TRÊS pontas — tela,
  // action e banco — leem a mesma função, que é a regra que a fase inteira defende:
  // duas réguas para a mesma pergunta é o defeito.
  const confereConfirmacao = confirmacaoImportConfere(confirmacao, previa?.filial.nome ?? '')
  const dicaConfirmacao = previa
    ? dicaConfirmacaoNaoConfere(confirmacao, confereConfirmacao, previa.filial.nome)
    : null

  function mudarFilial(v: string) {
    setFilialId(v)
    setPrevia(null)
    setCorrecoes([]) // §3.8: trocar a filial zera as correções
    setConfirmacao('')
    setErroAcao(null)
  }

  function mudarArquivo(f: File | null) {
    setArquivo(f)
    setPrevia(null)
    setCorrecoes([]) // §3.8: trocar o arquivo zera as correções
    setErroUpload(null)
    setErroAcao(null)
    if (f) {
      const nome = f.name.toLowerCase()
      if (!nome.endsWith('.csv') && !nome.endsWith('.xlsx')) {
        setErroUpload('O arquivo precisa ter extensão .csv ou .xlsx.')
      } else if (f.size > TAMANHO_MAX_ARQUIVO) {
        setErroUpload(
          `O arquivo tem ${(f.size / 1024 / 1024).toFixed(1)} MB — o limite é ${TAMANHO_MAX_ROTULO}.`,
        )
      } else if (f.size === 0) {
        setErroUpload('O arquivo está vazio.')
      }
    }
  }

  // Único caminho de análise: arquivo + lista de correções → motor. Chamado no
  // passo 2 (primeira análise) e a cada correção/desfazer (reanálise no passo 3).
  function analisarCom(lista: CorrecaoImport[], irParaPreview: boolean) {
    if (!arquivo || !filialSel || erroUpload) return
    const fd = new FormData()
    fd.set('arquivo', arquivo)
    fd.set('filialId', String(filialSel.id))
    fd.set('correcoes', JSON.stringify(lista))
    setErroAcao(null)
    startAnalise(async () => {
      // F7F — try/catch: sem ele, um throw (payload/serialização/413/rede) some
      // dentro do startTransition e o operador fica sem feedback. O erro
      // ESPECÍFICO do motor/action (retorno `{ok:false,erro}`) continua tratado
      // logo abaixo; o catch cobre o throw cru.
      try {
        const res = await validarImport(fd)
        if (!res.ok) {
          toast.error(res.erro)
          setErroAcao(res.erro)
          return
        }
        // A lista só vira estado quando a análise volta OK: `porOp` é posicional e
        // precisa casar com as correções exibidas no painel.
        setCorrecoes(lista)
        setPrevia({
          filial: res.filial,
          validacao: res.validacao,
          custo: res.custo,
          termosMultiFilial: res.termosMultiFilial,
        })
        setConfirmacao('')
        if (irParaPreview) setPasso(3)
      } catch {
        const msg = 'Falha ao analisar o arquivo (rede ou arquivo grande demais). Tente novamente.'
        toast.error(msg)
        setErroAcao(msg)
      }
    })
  }

  function analisar() {
    analisarCom(correcoes, true)
  }

  function corrigir(ops: CorrecaoImport[]) {
    if (ops.length === 0 || analisando) return
    // Sem cap na tela: o servidor (Zod) é a única guarda, e o teto lá é altíssimo,
    // só contra payload forjado — o uso real (maior filial = 1.217 ativos) nunca
    // encosta. Corrigir em lote/global manda muitas ops de uma vez, e tudo bem.
    analisarCom([...correcoes, ...ops], false)
  }

  function desfazer(indice: number) {
    if (analisando) return
    analisarCom(
      correcoes.filter((_, i) => i !== indice),
      false,
    )
  }

  async function baixarCorrigido() {
    if (!arquivo || !filialSel) return
    const fd = new FormData()
    fd.set('arquivo', arquivo)
    fd.set('filialId', String(filialSel.id))
    fd.set('correcoes', JSON.stringify(correcoes))
    setBaixandoCsv(true)
    try {
      const res = await baixarCsvCorrigido(fd)
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      // BOM na hora de baixar (padrão de export do projeto: abre direto no Excel).
      const blob = new Blob(['﻿' + res.conteudo], { type: 'text/csv;charset=utf-8' })
      baixarBlob(blob, res.nome)
    } catch {
      toast.error('Falha ao gerar o CSV corrigido.')
    } finally {
      setBaixandoCsv(false)
    }
  }

  function aplicar() {
    const plano: PlanoImport | null = previa?.validacao.plano ?? null
    if (!previa || !plano || !aplicavel) return
    if (!confereConfirmacao) return
    setErroAcao(null)
    startAplicar(async () => {
      // F7F — try/catch: o throw cru (payload grande, serialização, 413, rede)
      // era engolido pelo startTransition e não virava toast. O erro específico
      // do W2 (`{ok:false,erro}` — timeout 57014, índice, P0001) segue tratado abaixo.
      try {
        const res = await aplicarImport({
          plano,
          confirmacaoTexto: confirmacao,
          custoPreview: previa.custo,
          correcoes,
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
      } catch {
        const msg = 'Falha ao aplicar o import (rede ou arquivo grande demais). Tente novamente.'
        toast.error(msg)
        setErroAcao(msg)
      }
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
      // Signed URL de 60s: expirada/erro devolve 4xx — sem esta checagem o
      // .blob() salvaria o corpo de erro como um .json de backup corrompido.
      if (!r.ok) throw new Error(`download falhou: ${r.status}`)
      const b = await r.blob()
      baixarBlob(b, `backup-${slug}.json`)
    } catch {
      toast.error('Falha ao baixar o backup.')
    } finally {
      setBaixandoBackup(false)
    }
  }

  function recomecar() {
    setPasso(1)
    // ADM-06 (F27) — o segundo import em sequência é tipicamente de OUTRA filial; um
    // "Avançar" apressado com a filial anterior ainda marcada, num fluxo que apaga o
    // acervo da filial, é desastre. Antes só arquivo/prévia/correções/confirmação zeravam.
    setFilialId('')
    setArquivo(null)
    setErroUpload(null)
    setPrevia(null)
    setCorrecoes([])
    setListaAberta(false)
    setConfirmacao('')
    setResultado(null)
    setErroAcao(null)
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">Importar acervo por arquivo</CardTitle>
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
                tempo, termos e anotações) e recria tudo a partir do arquivo. Snapshots
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
              Filial selecionada: <strong>{filialSel?.nome}</strong>. Envie o CSV ou
              o Excel (.xlsx) do inventário (máx. 5 MB). O <strong>.xlsx</strong> é o
              recomendado: preserva as datas (sem <code>#######</code> nem mês
              abreviado sem ano) e os acentos.
            </p>
            <div className="space-y-2">
              <Label htmlFor="import-arquivo">Arquivo (CSV ou Excel .xlsx)</Label>
              <Input
                id="import-arquivo"
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => mudarArquivo(e.target.files?.[0] ?? null)}
                aria-invalid={!!erroUpload}
                aria-describedby={erroUpload ? 'import-arquivo-erro' : undefined}
              />
              {arquivo && !erroUpload && (
                <p className="text-xs text-muted-foreground">
                  {arquivo.name} · {(arquivo.size / 1024).toLocaleString('pt-BR', {
                    maximumFractionDigits: 0,
                  })}{' '}
                  KB
                </p>
              )}
              {erroUpload && (
                <p id="import-arquivo-erro" role="alert" className="text-sm text-destructive">
                  {erroUpload}
                </p>
              )}
            </div>

            {erroAcao && (
              <p role="alert" className="text-sm text-destructive">
                {erroAcao}
              </p>
            )}

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
                {analisando ? 'Analisando…' : 'Analisar arquivo'}
              </Button>
            </div>
          </div>
        )}

        {/* -------- Passo 3: Preview -------- */}
        {passo === 3 && previa && (
          <div className="space-y-5">
            {/* Barra de status do ciclo de correção (F7B) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
              <span
                className={cn(
                  totalBloqueantes > 0 ? 'font-medium text-destructive' : 'text-muted-foreground',
                )}
              >
                {totalBloqueantes.toLocaleString('pt-BR')} bloqueantes
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                className={cn(
                  totalAvisosParaCorrigir > 0 ? 'text-warning' : 'text-muted-foreground',
                )}
              >
                {totalAvisosParaCorrigir.toLocaleString('pt-BR')} avisos
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {previa.validacao.resumo.linhasRemovidas.toLocaleString('pt-BR')} linhas
                removidas
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {correcoes.length.toLocaleString('pt-BR')} correções
              </span>
              {/* F24 — conflitos entre filiais. Fica na BARRA (e não só no grid do
                  resumo) de propósito: o grid só renderiza quando `aplicavel` é true, e
                  o operador precisa ver este número mesmo quando outro bloqueante estiver
                  segurando o import. */}
              {previa.validacao.resumo.conflitos > 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-warning">
                    {previa.validacao.resumo.conflitos.toLocaleString('pt-BR')} conflitos
                    entre filiais
                  </span>
                </>
              )}
              {analisando && (
                <span className="ml-auto text-muted-foreground">Reanalisando…</span>
              )}
            </div>

            {/* F56 · Frente C — o arquivo tem erros demais para listar todos no
                preview (o orçamento de resposta reduziu o detalhe individual); os
                números acima e os totais dos grupos continuam certos, só a LISTA
                de erro a erro é que veio parcial. */}
            {detalheReduzido && (
              <div
                role="status"
                className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
              >
                Este arquivo tem erros demais para listar um a um — os totais acima
                e as linhas de cada grupo estão certos, mas alguns cards mostram só
                uma amostra dos erros individuais daquele tipo. Corrija em massa
                pelos cards abaixo (eles valem para TODAS as linhas do grupo) em vez
                de rolar a lista completa.
              </div>
            )}

            {aplicavel ? (
              <>
                <div className="rounded-lg border border-green-600/40 bg-green-50 p-4 dark:border-green-400/30 dark:bg-green-950/30">
                  <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                    <CheckCircle2 className="size-4" />
                    Pronto para aplicar
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nenhum bloqueante. Confira os números abaixo e avance para a
                    confirmação.
                  </p>
                </div>
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
                  {/* F7E — quantos ativos nascem sem patrimônio (pendência "sem
                      patrimônio físico"). F7F: tom âmbar (aviso ≠ cromo neutro). */}
                  <NumeroGrande
                    valor={previa.validacao.resumo.semPatrimonio}
                    rotulo="sem patrimônio (importam com pendência)"
                    tom="aviso"
                  />
                  {/* F15 — quantos ativos importam sem service tag (pendência "sem
                      service tag"). Só INFORMA, não bloqueia; tom âmbar (F7F). Aparece
                      só quando há linhas sem service tag. */}
                  {previa.validacao.resumo.semServiceTag > 0 && (
                    <NumeroGrande
                      valor={previa.validacao.resumo.semServiceTag}
                      rotulo="sem service tag (importam com pendência)"
                      tom="aviso"
                    />
                  )}
                  {/* F24 — quantas linhas abrem conflito entre filiais (o mesmo aparelho
                      já tem cadastro em outra filial). Elas IMPORTAM; o par vira pendência
                      e se resolve na mesa de /pendencias. Tom âmbar, condicional. */}
                  {previa.validacao.resumo.conflitos > 0 && (
                    <NumeroGrande
                      valor={previa.validacao.resumo.conflitos}
                      rotulo="conflitos entre filiais (abrem pendência)"
                      tom="aviso"
                    />
                  )}
                  {/* F7F/F7-pós — quantos tiveram o patrimônio ausente preenchido pelo
                      hostname. É correção AUTOMÁTICA (não aviso): tom neutro. */}
                  {previa.validacao.resumo.patrimonioDoHostname > 0 && (
                    <NumeroGrande
                      valor={previa.validacao.resumo.patrimonioDoHostname}
                      rotulo="preenchidos pelo hostname (automático)"
                    />
                  )}
                  <NumeroGrande
                    valor={previa.custo.ativos}
                    rotulo="ativos a apagar"
                    tom="destrutivo"
                  />
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
                  <NumeroGrande
                    valor={previa.custo.termos}
                    rotulo="termos a apagar"
                    tom="destrutivo"
                  />
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4" />
                  Import bloqueado
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {totalBloqueantes > 0
                    ? 'Corrija os erros abaixo — em massa ou linha a linha. O arquivo enviado não é alterado: a análise refaz sozinha a cada correção.'
                    : previa.termosMultiFilial.length > 0
                      ? 'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.'
                      : 'Nenhum ativo a criar: o arquivo não tem nenhuma linha aproveitável. O import de startup precisa de ao menos 1 ativo — confira se o CSV é o da filial certa.'}
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

            {/* F7F — auditoria dos patrimônios auto-preenchidos pelo hostname (âmbar
                informativo, fora dos cards de correção). */}
            <PainelHostname
              avisos={previa.validacao.avisos}
              contexto={previa.validacao.contexto}
              prefixosPatrimonio={vocabulario.prefixosPatrimonio}
            />

            {/* Cards acionáveis: um por grupo de erro/aviso (F7B) */}
            <GruposErros
              // F7D — remonta (zera o rascunho) ao trocar arquivo ou filial (§3.8);
              // entre reanálises do MESMO arquivo, o rascunho persiste.
              key={`${filialId}|${arquivo?.name ?? ''}`}
              grupos={previa.validacao.grupos}
              contexto={previa.validacao.contexto}
              filialNome={previa.filial.nome}
              tiposAviso={tiposAviso}
              pendente={analisando}
              onCorrigir={corrigir}
              vocabulario={vocabulario}
            />

            <CorrecoesAplicadas
              correcoes={correcoes}
              porOp={previa.validacao.correcoes.porOp}
              pendente={analisando}
              onDesfazer={desfazer}
              patrimonioDoHostname={previa.validacao.resumo.patrimonioDoHostname}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={baixandoCsv}
                onClick={baixarCorrigido}
              >
                <Download className="size-4" />
                {baixandoCsv ? 'Gerando…' : 'Baixar CSV corrigido'}
              </Button>
              {(totalBloqueantes > 0 || totalAvisosParaCorrigir > 0) && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() =>
                      baixarCsvErros(
                        [...previa.validacao.bloqueantes, ...avisosParaCorrigir],
                        previa.filial.slug,
                      )
                    }
                  >
                    <Download className="size-4" />
                    Baixar lista de erros (CSV)
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setListaAberta((v) => !v)}
                  >
                    {listaAberta ? 'Ocultar lista completa' : 'Ver lista completa'}
                  </Button>
                </>
              )}
            </div>

            {listaAberta && (
              <div className="space-y-5">
                {totalBloqueantes > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-destructive">
                      Bloqueantes ({totalBloqueantes.toLocaleString('pt-BR')})
                    </h3>
                    <TabelaErros erros={previa.validacao.bloqueantes} />
                  </div>
                )}

                {totalAvisosParaCorrigir > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      Avisos ({totalAvisosParaCorrigir.toLocaleString('pt-BR')})
                    </h3>
                    <TabelaErros erros={avisosParaCorrigir} />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <Button
                variant="ghost"
                className="gap-2"
                disabled={analisando}
                onClick={() => setPasso(2)}
              >
                <ArrowLeft className="size-4" />
                Trocar arquivo
              </Button>
              <Button
                className="gap-2"
                disabled={!aplicavel || analisando}
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
                {/* F24 — avisa ANTES de aplicar que este import vai deixar trabalho na
                    fila de Pendências. Não é um impedimento: é o que vai acontecer. */}
                {previa.validacao.resumo.conflitos > 0 && (
                  <li className="text-warning sm:col-span-2">
                    <strong>
                      {previa.validacao.resumo.conflitos.toLocaleString('pt-BR')}
                    </strong>{' '}
                    {previa.validacao.resumo.conflitos === 1
                      ? 'conflito entre filiais aberto, para resolver em Pendências'
                      : 'conflitos entre filiais abertos, para resolver em Pendências'}
                  </li>
                )}
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
                aria-invalid={!!dicaConfirmacao}
                aria-describedby={dicaConfirmacao ? 'import-confirmacao-dica' : undefined}
              />
              {/* ADM-07 (F27) — antes o botão só ficava desabilitado, sem dizer por quê
                  ("linhares" ≠ "Linhares" não dava nenhuma pista). */}
              {dicaConfirmacao && (
                <p id="import-confirmacao-dica" role="alert" className="text-sm text-destructive">
                  {dicaConfirmacao}
                </p>
              )}
            </div>

            {erroAcao && (
              <p role="alert" className="text-sm text-destructive">
                {erroAcao}
              </p>
            )}

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
                disabled={aplicando || !confereConfirmacao}
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

            {/* F24 — quantos conflitos entre filiais este import deixou em aberto. O
                número vem do SERVIDOR (contado pela RPC dentro da transação, pela mesma
                fonte que a mesa lê), e não do preview: entre o preview e o apply o acervo
                de outra filial pode ter mudado. */}
            {resultado.resultado.conflitosAbertos > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
                <div className="flex items-center gap-2 font-medium text-warning">
                  <AlertTriangle className="size-4" />
                  {resultado.resultado.conflitosAbertos.toLocaleString('pt-BR')}{' '}
                  {resultado.resultado.conflitosAbertos === 1
                    ? 'conflito entre filiais aberto'
                    : 'conflitos entre filiais abertos'}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {resultado.resultado.conflitosAbertos === 1
                    ? 'Um aparelho desta filial tem cadastro também em outra.'
                    : 'Estes aparelhos desta filial têm cadastro também em outra filial.'}{' '}
                  Em Pendências dá para ver os cadastros lado a lado, com o histórico de
                  cada um, e apagar o que estiver errado.
                </p>
              </div>
            )}

            {/* F54 — os documentos de responsabilidade que NÃO puderam ser copiados para o
                arquivo de segurança não são mais apagados. Quando isso acontece, o
                operador tem de saber: o cadastro sumiu, mas o documento continua lá. */}
            {resultado.resultado.avisoTermos && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
                <div className="flex items-center gap-2 font-medium text-warning">
                  <AlertTriangle className="size-4" />
                  Documentos de responsabilidade
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {resultado.resultado.avisoTermos}
                </p>
              </div>
            )}

            {resultado.resultado.correcoesAplicadas > 0 && (
              <p className="text-sm text-muted-foreground">
                <strong className="tabular-nums">
                  {resultado.resultado.correcoesAplicadas.toLocaleString('pt-BR')}
                </strong>{' '}
                {resultado.resultado.correcoesAplicadas === 1 ? 'correção' : 'correções'} de
                tela {resultado.resultado.correcoesAplicadas === 1 ? 'registrada' : 'registradas'}{' '}
                no log deste import (o arquivo enviado não foi alterado).
              </p>
            )}

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
              {/* F24 — atalho para a mesa. ⚠ /pendencias filtra a filial por SLUG
                  (`sp.filial`), ao contrário de /ativos, que filtra por ID. */}
              {resultado.resultado.conflitosAbertos > 0 && (
                <Button asChild variant="outline" className="gap-2">
                  <Link href={`/pendencias?tipo=conflito&filial=${resultado.filial.slug}`}>
                    Ver conflitos ({resultado.resultado.conflitosAbertos})
                  </Link>
                </Button>
              )}
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

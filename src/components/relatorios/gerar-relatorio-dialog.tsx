'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, History } from 'lucide-react'
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
import { consultarVersaoDoPeriodo, gerarRelatorio } from '@/lib/actions/relatorios'
import {
  mensagemVersaoExistente,
  type VersaoExistente,
} from '@/lib/relatorios/versao-snapshot'
import { formatDate } from '@/lib/format'

// "Gerar relatório" (só operador — OS-F3 3.8.3): dialog com período, escopo (filial
// atual × geral) e confirmação. Sucesso → navega para o snapshot novo.
//
// F29/REL-04 — duas mudanças de fundo:
//  (b) o dialog abre com o período que o operador está ANALISANDO (era sempre a
//      semana útil corrente, mesmo lendo outro recorte — armadilha tela × snapshot);
//      os atalhos "semana corrente" e "semana passada" continuam a um clique.
//  (a) uma consulta leve responde, com o dialog aberto, se o período já tem versão —
//      o operador descobria a v3 pelo toast, depois do fato consumado.
export function GerarRelatorioDialog({
  filialSlug,
  filialNome,
  ehGeral,
  padraoDe,
  padraoAte,
  semanaDe,
  semanaAte,
  semanaAnteriorDe,
  semanaAnteriorAte,
  maxData,
}: {
  filialSlug: string
  filialNome: string
  ehGeral: boolean
  padraoDe: string
  padraoAte: string
  /** Atalho "Usar semana corrente" — segunda a sexta desta semana. */
  semanaDe: string
  semanaAte: string
  /** Atalho "Usar semana passada" — segunda a sexta da semana que fechou (F29/REL-03). */
  semanaAnteriorDe: string
  semanaAnteriorAte: string
  // Teto de data (não gerar snapshot futuro) — hoje ou fim da semana útil.
  maxData: string
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [de, setDe] = useState(padraoDe)
  const [ate, setAte] = useState(padraoAte)
  const [observacao, setObservacao] = useState('')
  const [escopo, setEscopo] = useState<'atual' | 'geral'>(ehGeral ? 'geral' : 'atual')
  const [enviando, start] = useTransition()

  const slugAlvo = escopo === 'geral' ? 'geral' : filialSlug
  const nomeAlvo = escopo === 'geral' ? 'Consolidado' : filialNome
  const periodoValido = !!de && !!ate && de <= ate && ate <= maxData

  const ehSemanaCorrente = de === semanaDe && ate === semanaAte
  const ehSemanaAnterior = de === semanaAnteriorDe && ate === semanaAnteriorAte

  // A resposta é guardada JUNTO com a pergunta que a originou. Assim não existe
  // "limpar o estado quando o período muda": a resposta de outra chave simplesmente
  // deixa de valer, e nada precisa ser zerado num efeito (o que dispararia renders
  // em cascata). É o mesmo raciocínio do `sync` de `periodo-filtro.tsx`, sem nem
  // precisar ajustar estado no render.
  const chaveConsulta = aberto && periodoValido ? `${slugAlvo}|${de}|${ate}` : ''
  const [resposta, setResposta] = useState<{
    chave: string
    info: VersaoExistente | null
  } | null>(null)
  const jaExiste = resposta?.chave === chaveConsulta ? resposta.info : null
  const conferindo = chaveConsulta !== '' && resposta?.chave !== chaveConsulta

  // Consulta o histórico do (período, escopo) enquanto o dialog está aberto. O
  // debounce existe porque `<input type="date">` dispara `change` a cada dígito
  // digitado à mão; sem ele, escolher "12/07/2026" pelo teclado renderia 8 consultas.
  // `cancelado` descarta a resposta obsoleta — senão uma consulta lenta antiga
  // sobrescreveria o aviso de outra, mais nova e mais rápida.
  useEffect(() => {
    if (!chaveConsulta) return
    let cancelado = false
    const t = setTimeout(() => {
      consultarVersaoDoPeriodo({ filialSlug: slugAlvo, de, ate })
        .then((info) => {
          if (!cancelado) setResposta({ chave: chaveConsulta, info })
        })
        .catch(() => {
          // Falhar aqui é perder um AVISO, nunca a geração. Registra "não há versão
          // conhecida" e segue — exibir um erro que não é do operador seria pior.
          if (!cancelado) setResposta({ chave: chaveConsulta, info: null })
        })
    }, 350)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [chaveConsulta, slugAlvo, de, ate])

  function gerar() {
    if (!periodoValido) return
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador fica sem feedback nenhum. O erro de negócio (`!res.ok`) segue
      // tratado abaixo, com o mesmo narrowing da união.
      try {
        const res = await gerarRelatorio({
          filialSlug: slugAlvo,
          de,
          ate,
          observacao: observacao.trim() || undefined,
        })
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        toast.success(`Relatório gerado (versão ${res.versao}).`)
        setAberto(false)
        router.push(`/relatorios/gerados/${res.id}`)
      } catch {
        toast.error(
          'Não foi possível gerar o relatório. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  const avisoVersao = mensagemVersaoExistente(jaExiste)

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          aria-label="Gerar relatório"
          className="h-9 gap-1.5 bg-brand-amarelo text-black hover:bg-brand-amarelo/90 sm:h-7"
        >
          <FileText className="size-4" />
          <span className="hidden sm:inline">Gerar relatório</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar relatório da semana</DialogTitle>
          <DialogDescription>
            Congela um snapshot do período — imutável e versionado. Regerar o
            mesmo período cria uma nova versão.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ger-de">De</Label>
            <Input id="ger-de" type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ger-ate">Até</Label>
            <Input id="ger-ate" type="date" value={ate} min={de || undefined} max={maxData} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>

        {/* Atalhos de período. "Semana passada" é o recorte do e-mail de segunda-feira
            (F29/REL-03) e antes exigia digitar duas datas. Ambos usam a janela
            SEGUNDA→SEXTA — a mesma que este dialog sempre usou; o preset da barra do
            relatório ao vivo conta domingo→sábado, e essa dualidade é deliberada. */}
        <div className="space-y-1.5">
          <Label id="ger-atalhos">Atalhos</Label>
          <div role="group" aria-labelledby="ger-atalhos" className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={ehSemanaCorrente ? 'default' : 'outline'}
              size="sm"
              className="h-10 gap-1.5 sm:h-7"
              onClick={() => {
                setDe(semanaDe)
                setAte(semanaAte)
              }}
            >
              <History className="size-4" />
              Usar semana corrente
            </Button>
            <Button
              type="button"
              variant={ehSemanaAnterior ? 'default' : 'outline'}
              size="sm"
              className="h-10 sm:h-7"
              onClick={() => {
                setDe(semanaAnteriorDe)
                setAte(semanaAnteriorAte)
              }}
            >
              Usar semana passada
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Segunda a sexta — o recorte do relatório semanal.
          </p>
        </div>

        {!ehGeral && (
          <div className="space-y-1.5">
            {/* F19 — a ordem pedia `htmlFor` aqui tratando o Escopo como um
                Select; ele é um par de <Button> de alternância, e `htmlFor`
                só aponta para UM controle — nomearia metade do grupo. Vale o
                mesmo padrão do motivo-dialog/kit-dialog: `role="group"` +
                `aria-labelledby` no rótulo. */}
            <Label id="ger-escopo">Escopo</Label>
            <div role="group" aria-labelledby="ger-escopo" className="flex gap-2">
              <Button
                type="button"
                variant={escopo === 'atual' ? 'default' : 'outline'}
                size="sm"
                className="min-w-0 flex-1 truncate"
                onClick={() => setEscopo('atual')}
              >
                {filialNome}
              </Button>
              <Button
                type="button"
                variant={escopo === 'geral' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setEscopo('geral')}
              >
                Consolidado
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ger-obs">Observações da semana (opcional)</Label>
          <Textarea
            id="ger-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={2000}
            placeholder="Ex.: semana com feriado; parte dos notebooks em trânsito entre filiais."
            className="min-h-20"
          />
          <p className="text-xs text-muted-foreground">
            Aparece no final do relatório congelado, com destaque — visível também
            para quem acessa por senha.
          </p>
        </div>

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p>
            Será congelado: <strong>{nomeAlvo}</strong> · {formatDate(de)} a{' '}
            {formatDate(ate)}.
          </p>
          {/* `role="status"` (e não "alert"): é informação que muda enquanto o
              operador mexe nas datas, não uma falha — interromper o leitor de tela
              a cada tecla seria ruído. */}
          <p role="status" className="mt-1 text-xs text-muted-foreground">
            {avisoVersao ??
              (conferindo
                ? 'Conferindo se este período já tem versão…'
                : periodoValido
                  ? 'Este período ainda não tem nenhuma versão — você criará a v1.'
                  : '')}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={gerar} disabled={enviando || !periodoValido}>
            {enviando ? 'Gerando…' : 'Gerar e abrir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, RotateCcw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  registrarCompra,
  buscarSugestoesMarca,
  buscarSugestoesModelo,
  buscarSugestoesFornecedor,
} from '@/lib/actions/compras'
import {
  chavePatrimonio,
  duplicatasDaLista,
  expandirFaixa,
  parearFaixaComServiceTags,
  parsearLista,
  MAX_LOTE_COMPRA,
  type ItemPatrimonio,
} from '@/lib/patrimonio'
import { CATEGORIA_ORDEM, rotuloCategoria, type CategoriaAtivo } from '@/lib/dominio'
import { hojeISO } from '@/lib/format'
import type { CompraLoteInput } from '@/lib/validators/compra'
import type { Filial } from '@/lib/queries/filiais'
import type { DadosCompraInicial } from '@/lib/queries/compras'

// A5 — memória dos defaults da compra, POR DISPOSITIVO (decisão da OS-F9: sem
// coluna nova em `profiles`, sem migration). Outro navegador simplesmente não lembra.
const CHAVE_DEFAULTS = 'wap:compra:defaults'

// A4 (F10) — sugestões do acervo. Debounce 300ms e mín. 2 caracteres (decisão §2
// da OS-F10, os mesmos números do combobox de ativos).
const DEBOUNCE_SUGESTAO = 300
const MIN_CHARS_SUGESTAO = 2

type CampoComAcervo = 'marca' | 'modelo' | 'fornecedor'

async function consultarAcervo(
  campo: CampoComAcervo,
  prefixo: string,
  marca: string,
): Promise<string[]> {
  if (campo === 'marca') return buscarSugestoesMarca(prefixo)
  if (campo === 'fornecedor') return buscarSugestoesFornecedor(prefixo)
  return buscarSugestoesModelo(marca.trim() || null, prefixo)
}

// A4 — campo de texto LIVRE com sugestões do que já existe no acervo. Digitar um
// valor novo é normal e nunca é bloqueado: a sugestão só evita que "Dell" vire
// "DELL" na próxima compra (o mesmo problema que o De→Para da spec §5 resolve
// para os motivos). Nenhuma normalização retroativa (decisão §2).
function CampoComSugestoes({
  id,
  label,
  campo,
  obrigatorio = false,
  valor,
  aoMudar,
  placeholder,
  marca = '',
}: {
  id: string
  label: string
  campo: CampoComAcervo
  obrigatorio?: boolean
  valor: string
  aoMudar: (v: string) => void
  placeholder?: string
  // Só o campo `modelo` usa: filtra as sugestões pela marca já escolhida.
  marca?: string
}) {
  const [sugestoes, setSugestoes] = useState<string[]>([])
  const [aberto, setAberto] = useState(false)
  const [indice, setIndice] = useState(-1)
  const focado = useRef(false)
  const acabouDeSelecionar = useRef(false)
  const listaRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    // Selecionar uma sugestão muda `valor` — sem esta guarda o efeito buscaria
    // de novo e reabriria a lista logo depois de escolher.
    if (acabouDeSelecionar.current) {
      acabouDeSelecionar.current = false
      return
    }
    const prefixo = valor.trim()
    let vivo = true
    // Toda alteração de estado acontece DENTRO do callback assíncrono (nunca no
    // corpo do efeito) — mesmo padrão do `ativo-combobox.tsx`.
    const t = setTimeout(async () => {
      if (!focado.current || prefixo.length < MIN_CHARS_SUGESTAO) {
        if (vivo) {
          setSugestoes([])
          setAberto(false)
        }
        return
      }
      try {
        const res = await consultarAcervo(campo, prefixo, marca)
        if (!vivo) return
        setSugestoes(res)
        setIndice(-1)
        setAberto(res.length > 0)
      } catch {
        // F19 — sem o catch, uma queda de rede vira unhandled rejection a cada
        // tecla digitada. Aqui a falha degrada CALADA para a lista fechada
        // (nada de toast: um por tecla seria pior que o silêncio) — o campo é
        // texto livre e continua aceitando o que for digitado.
        if (!vivo) return
        setSugestoes([])
        setAberto(false)
      }
    }, DEBOUNCE_SUGESTAO)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [valor, campo, marca])

  // A lista rola: a opção destacada pelas setas precisa acompanhar (só mexe no
  // DOM, não gera estado).
  useEffect(() => {
    if (indice < 0) return
    const el = listaRef.current?.children[indice]
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' })
  }, [indice])

  function selecionar(s: string) {
    acabouDeSelecionar.current = true
    aoMudar(s)
    setSugestoes([])
    setIndice(-1)
    setAberto(false)
  }

  const visivel = aberto && sugestoes.length > 0

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (sugestoes.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!visivel) {
        setAberto(true)
        setIndice(0)
        return
      }
      setIndice((i) => (i + 1) % sugestoes.length)
      return
    }
    if (!visivel) return
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndice((i) => (i <= 0 ? sugestoes.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter' && indice >= 0) {
      e.preventDefault()
      selecionar(sugestoes[indice])
      return
    }
    if (e.key === 'Escape') {
      setAberto(false)
      setIndice(-1)
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      <Popover open={visivel} onOpenChange={setAberto}>
        <PopoverAnchor asChild>
          <Input
            id={id}
            value={valor}
            onChange={(e) => aoMudar(e.target.value)}
            onFocus={() => {
              focado.current = true
            }}
            onBlur={() => {
              focado.current = false
            }}
            onKeyDown={aoTeclar}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={visivel}
            aria-autocomplete="list"
            aria-controls={visivel ? `${id}-sugestoes` : undefined}
            aria-activedescendant={
              visivel && indice >= 0 ? `${id}-sug-${indice}` : undefined
            }
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) gap-0 p-1"
          // O foco fica no input — a lista é sugestão, não um passo do fluxo.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Sem isto o mousedown tira o foco do input, o Radix fecha por "focus
          // outside" e o clique na sugestão nunca chega ao item.
          onMouseDown={(e) => e.preventDefault()}
        >
          <p
            id={`${id}-sugestoes-titulo`}
            className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
          >
            Já usados no acervo
          </p>
          {/* Listbox própria (não `Command`): o cmdk SOBRESCREVE o `id` de
              List/Item pelos seus (`id: r` depois do spread das props), e sem id
              previsível o `aria-activedescendant` do input — que fica FORA do
              Command, porque o campo é texto livre — apontaria para o nada.
              Visual e classes são os mesmos do `CommandItem`. */}
          <ul
            ref={listaRef}
            id={`${id}-sugestoes`}
            role="listbox"
            aria-labelledby={`${id}-sugestoes-titulo`}
            className="max-h-60 overflow-y-auto"
          >
            {sugestoes.map((s, i) => (
              // O teclado é tratado no input (padrão aria-activedescendant): a
              // opção não recebe foco, por isso não tem handler de tecla.
              <li
                key={s}
                id={`${id}-sug-${i}`}
                role="option"
                aria-selected={i === indice}
                onClick={() => selecionar(s)}
                onMouseEnter={() => setIndice(i)}
                className={
                  'flex min-h-10 cursor-default items-center rounded-sm px-2 py-1.5 text-sm select-none sm:min-h-9 ' +
                  (i === indice ? 'bg-muted text-foreground' : '')
                }
              >
                {s}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function NovaCompraForm({
  filiais,
  inicial = null,
  ultimaCompra = null,
}: {
  filiais: Filial[]
  // A6 — `?duplicar=<id>` na URL ("Comprar outro igual" da ficha). Precedência
  // máxima (decisão §2): a memória do dispositivo nunca sobrescreve.
  inicial?: DadosCompraInicial | null
  // A6 — última compra registrada por este operador (botão "Repetir última").
  ultimaCompra?: DadosCompraInicial | null
}) {
  const router = useRouter()
  const [modo, setModo] = useState<'lista' | 'faixa'>('lista')
  const [textoLista, setTextoLista] = useState('')
  const [faixaInicio, setFaixaInicio] = useState('')
  const [faixaFim, setFaixaFim] = useState('')
  // A2 — service tags da faixa, uma por linha, na ordem.
  const [faixaSts, setFaixaSts] = useState('')

  const [categoria, setCategoria] = useState<CategoriaAtivo | ''>(
    inicial?.categoria ?? '',
  )
  const [marca, setMarca] = useState(inicial?.marca ?? '')
  const [modelo, setModelo] = useState(inicial?.modelo ?? '')
  const [memoria, setMemoria] = useState(inicial?.memoria ?? '')
  const [armazenamento, setArmazenamento] = useState(
    inicial?.armazenamento ?? '',
  )
  const [processador, setProcessador] = useState(inicial?.processador ?? '')
  const [fornecedor, setFornecedor] = useState(inicial?.fornecedor ?? '')
  const [filialId, setFilialId] = useState(inicial?.filialId ?? '')
  const [observacao, setObservacao] = useState('')
  const [data, setData] = useState(hojeISO())

  const [enviando, setEnviando] = useState(false)
  const [errosServidor, setErrosServidor] = useState<string[]>([])
  const [resultado, setResultado] = useState<
    { id: string; patrimonio: string }[] | null
  >(null)
  const enviandoRef = useRef(false)
  const jaFocouLista = useRef(false)

  // A5 — pré-preenche categoria/filial com o que foi usado na última compra
  // NESTE dispositivo. Pós-mount (nunca no `useState` inicial: o servidor não
  // enxerga o localStorage e a hidratação quebraria) e só quando o campo está
  // vazio — é o que faz a precedência da decisão §2 da F10 valer sem código
  // extra: `?duplicar=` já preencheu, então a memória não tem o que sobrescrever.
  // Qualquer coisa estranha no storage é ignorada em silêncio.
  // O `set-state-in-effect` é justamente o ponto: sincronizar um sistema externo
  // (localStorage) com o React uma única vez, no mount — exceção pontual,
  // no precedente de `ativos-table.tsx`.
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(CHAVE_DEFAULTS)
      if (!bruto) return
      const salvo = JSON.parse(bruto) as {
        categoria?: unknown
        filialId?: unknown
      }
      const cat = salvo?.categoria
      if (
        typeof cat === 'string' &&
        (CATEGORIA_ORDEM as readonly string[]).includes(cat)
      ) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCategoria((atual) => atual || (cat as CategoriaAtivo))
      }
      const fil = salvo?.filialId
      if (typeof fil === 'string' && filiais.some((f) => String(f.id) === fil)) {
        setFilialId((atual) => atual || fil)
      }
    } catch {
      // localStorage indisponível ou JSON corrompido: segue com os campos vazios.
    }
  }, [filiais])

  // A6 — "Repetir última compra": clique explícito do operador, então sobrescreve
  // o que estiver nos campos (fica abaixo de `?duplicar=` só porque o duplicar já
  // chegou preenchido e ninguém clicou aqui).
  function repetirUltimaCompra() {
    if (!ultimaCompra) return
    setCategoria(ultimaCompra.categoria)
    setMarca(ultimaCompra.marca)
    setModelo(ultimaCompra.modelo)
    setMemoria(ultimaCompra.memoria)
    setArmazenamento(ultimaCompra.armazenamento)
    setProcessador(ultimaCompra.processador)
    setFornecedor(ultimaCompra.fornecedor)
    if (filiais.some((f) => String(f.id) === ultimaCompra.filialId)) {
      setFilialId(ultimaCompra.filialId)
    }
    toast.success('Campos preenchidos com a sua última compra.')
  }

  // Preview do lote (patrimônios canonicalizados + erros de parse + duplicidade
  // dentro da própria lista colada — A3; na faixa, o pareamento com as service
  // tags — A2). O servidor continua sendo o juiz.
  const preview = useMemo<{
    itens: ItemPatrimonio[]
    erros: string[]
    duplicadas: Set<string>
  }>(() => {
    if (modo === 'lista') {
      const { itens, erros } = parsearLista(textoLista)
      const mensagens = erros.map((e) => ({
        linha: e.linha,
        texto: `Linha ${e.linha}: ${e.msg}`,
      }))
      const duplicatas = duplicatasDaLista(itens)
      for (const d of duplicatas) {
        // A primeira ocorrência é a "boa"; acusa-se cada repetição seguinte.
        for (const linha of d.linhas.slice(1)) {
          mensagens.push({
            linha,
            texto: `Linha ${linha}: ${d.patrimonio} repetido na lista.`,
          })
        }
      }
      mensagens.sort((a, b) => a.linha - b.linha)
      return {
        itens,
        erros: mensagens.map((m) => m.texto),
        duplicadas: new Set(duplicatas.map((d) => d.chave)),
      }
    }
    const vazio = { itens: [], erros: [], duplicadas: new Set<string>() }
    if (!faixaInicio.trim() || !faixaFim.trim()) return vazio
    const r = expandirFaixa(faixaInicio, faixaFim)
    if (r.erro) return { ...vazio, erros: [r.erro] }
    const patrimonios = r.itens ?? []
    const pareado = parearFaixaComServiceTags(patrimonios, faixaSts)
    if (pareado.erro) {
      // A faixa continua à vista enquanto as service tags estão sendo digitadas
      // (some seria pior); o erro já desabilita o botão de cadastrar.
      return {
        ...vazio,
        itens: patrimonios.map((p) => ({ patrimonio: p })),
        erros: [pareado.erro],
      }
    }
    return { ...vazio, itens: pareado.itens ?? [] }
  }, [modo, textoLista, faixaInicio, faixaFim, faixaSts])

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
      // F15/C1 — service tag obrigatória: o preview só produz itens COM service tag
      // (parsearLista/parearFaixaComServiceTags acusam a ausência e barram o envio).
      // O `?? ''` só satisfaz o tipo; o Zod da action rejeitaria uma tag vazia.
      itens: preview.itens.map((i) => ({
        patrimonio: i.patrimonio,
        service_tag: i.service_tag ?? '',
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
    } catch {
      // F19 — throw de transporte (rede, sessao morta) nao e erro de negocio: sem
      // o catch some como unhandled rejection e o operador clica de novo sem
      // nenhum sinal. O `return` e obrigatorio — sem ele o codigo abaixo leria
      // `res` indefinido. O formulario continua preenchido.
      const msg =
        'Não foi possível cadastrar agora. Os dados continuam preenchidos — verifique sua conexão e tente de novo.'
      setErrosServidor([msg])
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
      setErrosServidor(res.erros ?? ['Não foi possível cadastrar.'])
      toast.error('Nada foi cadastrado — veja os erros abaixo.')
      return
    }
    try {
      window.localStorage.setItem(
        CHAVE_DEFAULTS,
        JSON.stringify({ categoria, filialId }),
      )
    } catch {
      // Sem localStorage (modo privado, storage cheio): a compra já foi feita,
      // só não haverá memória de defaults.
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
    setFaixaSts('')
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
      {/* A6 — veio de "Comprar outro igual" */}
      {inicial && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <Copy className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            Dados copiados{' '}
            {inicial.referencia ? (
              <>
                de <span className="font-medium tabular-nums">{inicial.referencia}</span>
              </>
            ) : (
              'do ativo de referência'
            )}
            . Patrimônio e service tag <strong>não</strong> são copiados —
            informe os novos abaixo.
          </span>
        </div>
      )}

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
              Um por linha — patrimônio <strong>e service tag</strong> (obrigatória),
              separados por vírgula, ponto e vírgula ou TAB
            </Label>
            <Textarea
              id="lista"
              // Foco só na PRIMEIRA montagem. `autoFocus` puro reagia toda vez que
              // a aba "Colar lista" era remontada (o Radix Tabs desmonta a aba
              // inativa), roubando o foco de quem navegava entre as abas pelo
              // teclado. `preventScroll` mantém o topo da página à vista.
              ref={(el) => {
                if (el && !jaFocouLista.current) {
                  jaFocouLista.current = true
                  el.focus({ preventScroll: true })
                }
              }}
              rows={6}
              value={textoLista}
              onChange={(e) => setTextoLista(e.target.value)}
              placeholder={
                'WAP0006026, ST-AAA111\nWAP0006027\tST-ABC123\nWAP0006028; ST-DEF456'
              }
              // `text-sm` puro (14px) dispara o zoom automático do iOS a cada
              // foco — e esta é a caixa de quem cola/bipa do celular.
              // `text-base md:text-sm` é o padrão do próprio ui/textarea.
              className="font-mono text-base md:text-sm"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Dá para colar direto duas colunas do Excel (patrimônio e service
              tag).
            </p>
          </TabsContent>
          <TabsContent value="faixa" className="mt-3 space-y-3">
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
            {/* A2 — service tags por unidade sem precisar montar a lista à mão */}
            <div>
              <Label htmlFor="faixa-sts" className="mb-2">
                Service tags <span className="text-destructive">*</span> — uma por
                linha, na ordem da faixa (uma para cada patrimônio)
              </Label>
              <Textarea
                id="faixa-sts"
                rows={4}
                value={faixaSts}
                onChange={(e) => setFaixaSts(e.target.value)}
                placeholder={'ST-ABC123\nST-DEF456\nST-GHI789'}
                // Idem: 14px no celular = zoom automático do iOS a cada foco.
                className="font-mono text-base md:text-sm"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Dá para colar a coluna do Excel — uma service tag para cada
                patrimônio da faixa (obrigatória).
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
              {preview.itens.map((i, idx) => {
                const repetido = preview.duplicadas.has(
                  chavePatrimonio(i.patrimonio, i.service_tag),
                )
                return (
                  <span
                    key={`${i.patrimonio}-${idx}`}
                    title={repetido ? 'Repetido na lista' : undefined}
                    className={
                      repetido
                        ? 'rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-xs tabular-nums text-destructive'
                        : 'rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums'
                    }
                  >
                    {i.patrimonio}
                    {i.service_tag ? ` · ${i.service_tag}` : ''}
                  </span>
                )
              })}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Dados do modelo</h2>
          {ultimaCompra && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 sm:h-8"
              onClick={repetirUltimaCompra}
            >
              <RotateCcw className="size-3.5" />
              Repetir última compra
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="compra-categoria">
              Categoria<span className="text-destructive"> *</span>
            </Label>
            <Select
              value={categoria || undefined}
              onValueChange={(v) => setCategoria(v as CategoriaAtivo)}
            >
              <SelectTrigger id="compra-categoria">
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
            <Label htmlFor="compra-filial">
              Filial que recebeu<span className="text-destructive"> *</span>
            </Label>
            <Select
              value={filialId || undefined}
              onValueChange={setFilialId}
            >
              <SelectTrigger id="compra-filial">
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
          <CampoComSugestoes
            id="marca"
            label="Marca"
            campo="marca"
            obrigatorio
            valor={marca}
            aoMudar={setMarca}
            placeholder="Samsung"
          />
          <CampoComSugestoes
            id="modelo"
            label="Modelo"
            campo="modelo"
            obrigatorio
            valor={modelo}
            aoMudar={setModelo}
            placeholder="Galaxy A17"
            marca={marca}
          />
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
          <CampoComSugestoes
            id="fornecedor"
            label="Fornecedor"
            campo="fornecedor"
            valor={fornecedor}
            aoMudar={setFornecedor}
            placeholder="WAP"
          />
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
          disabled={
            enviando || preview.itens.length === 0 || preview.erros.length > 0
          }
        >
          {enviando
            ? 'Cadastrando…'
            : `Cadastrar ${preview.itens.length || ''} ${preview.itens.length === 1 ? 'equipamento' : 'equipamentos'}`.trim()}
        </Button>
      </div>
    </div>
  )
}

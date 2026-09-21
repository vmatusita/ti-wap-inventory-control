'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, FileClock, RotateCcw, TriangleAlert } from 'lucide-react'
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
  erroTetoLista,
  expandirFaixa,
  parearFaixaComServiceTags,
  parsearLista,
  MAX_LOTE_COMPRA,
  type ItemPatrimonio,
} from '@/lib/patrimonio'
import { AvisoSemFilialDeEscrita } from '@/components/layout/aviso-sem-escrita'
import { CATEGORIA_ORDEM, rotuloCategoria, type CategoriaAtivo } from '@/lib/dominio'
import { formatTempoRelativo, hojeISO } from '@/lib/format'
import {
  contarPatrimoniosRascunho,
  lerRascunhoCompra,
  limparRascunhoCompra,
  rascunhoVazio,
  salvarRascunhoCompra,
  chaveCompraDefaults,
  type RascunhoCompra,
} from '@/components/ativos/rascunho-compra'
import type { CompraLoteInput } from '@/lib/validators/compra'
import type { Filial } from '@/lib/queries/filiais'
import type { DadosCompraInicial } from '@/lib/queries/compras'

// A5 — memória dos defaults da compra, POR DISPOSITIVO (decisão da OS-F9: sem
// coluna nova em `profiles`, sem migration). Outro navegador simplesmente não lembra.
// F61 — a chave sai de `chaveCompraDefaults()` (`rascunho-compra.ts`), montada no uso.

// A4 (F10) — sugestões do acervo. Debounce 300ms e mín. 2 caracteres (decisão §2
// da OS-F10, os mesmos números do combobox de ativos).
const DEBOUNCE_SUGESTAO = 300
const MIN_CHARS_SUGESTAO = 2

type CampoComAcervo = 'marca' | 'modelo' | 'fornecedor'

// ATV-09a — os quatro obrigatórios do bloco "Dados do modelo", na ordem VISUAL do
// grid (categoria, filial, marca, modelo) — é essa ordem que decide qual campo
// recebe o foco quando mais de um falta.
type CampoObrigatorio = 'categoria' | 'filial' | 'marca' | 'modelo'
const ORDEM_CAMPOS_OBRIGATORIOS: CampoObrigatorio[] = [
  'categoria',
  'filial',
  'marca',
  'modelo',
]
const ROTULO_CAMPO_OBRIGATORIO: Record<CampoObrigatorio, string> = {
  categoria: 'categoria',
  filial: 'filial',
  marca: 'marca',
  modelo: 'modelo',
}

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
  inputRef,
  erro,
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
  // ATV-09a — permite o form pai focar este input quando ele falta no envio.
  inputRef?: React.Ref<HTMLInputElement>
  // ATV-09a — mensagem do obrigatório faltante, mostrada sob o campo.
  erro?: string
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
            ref={inputRef}
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
            aria-invalid={!!erro}
            aria-describedby={erro ? `${id}-erro` : undefined}
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
      {erro && (
        <p id={`${id}-erro`} role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}

export function NovaCompraForm({
  filiais,
  inicial = null,
  ultimaCompra = null,
}: {
  // F21 — SÓ as filiais em que este cargo pode ESCREVER (a página recorta com
  // `filiaisParaEscrita`): é o campo que decide onde o ativo nasce.
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
  // F25 — campos próprios do CELULAR. NÃO saem de `inicial` ("Comprar outro
  // igual" / "Repetir última compra"): IMEI e nº de linha identificam a UNIDADE,
  // exatamente como patrimônio e service tag, que `DadosCompraInicial` já exclui
  // pelo mesmo motivo. Copiá-los faria o aparelho novo nascer com o IMEI do
  // antigo — e o banner do formulário promete que o que identifica não é copiado.
  const [telefone, setTelefone] = useState('')
  const [imei, setImei] = useState('')
  const [pulsus, setPulsus] = useState('')

  const [marca, setMarca] = useState(inicial?.marca ?? '')
  const [modelo, setModelo] = useState(inicial?.modelo ?? '')
  const [memoria, setMemoria] = useState(inicial?.memoria ?? '')
  const [armazenamento, setArmazenamento] = useState(
    inicial?.armazenamento ?? '',
  )
  const [processador, setProcessador] = useState(inicial?.processador ?? '')
  const [fornecedor, setFornecedor] = useState(inicial?.fornecedor ?? '')
  // F21 — o `?duplicar=` traz a filial do ativo copiado, que pode ser uma em que
  // ESTE cargo não escreve: um valor fora das opções deixaria o Select mudo (nem
  // valor, nem placeholder) e o envio cairia num "Preencha: filial" sem motivo
  // aparente. Filtra pela lista recebida — e, quando ela tem UMA filial só (o
  // operador de uma filial), já pré-seleciona: não há escolha a oferecer.
  // Os outros dois caminhos de pré-preenchimento (memória do dispositivo e
  // "Repetir última compra") já conferiam a lista antes de gravar o estado.
  const [filialId, setFilialId] = useState(() => {
    const doDuplicar = inicial?.filialId ?? ''
    if (doDuplicar && filiais.some((f) => String(f.id) === doDuplicar)) return doDuplicar
    const unica = filiais.length === 1 ? filiais[0] : null
    return unica ? String(unica.id) : ''
  })
  const [observacao, setObservacao] = useState('')
  const [data, setData] = useState(hojeISO())

  // ATV-09a — obrigatórios do bloco "Dados do modelo" que faltam no ÚLTIMO envio
  // tentado. Antes só existia o toast (some sozinho); agora cada campo marca
  // `aria-invalid` + mensagem própria, e some assim que o campo é preenchido.
  const [faltando, setFaltando] = useState<Set<CampoObrigatorio>>(new Set())
  const categoriaRef = useRef<HTMLButtonElement>(null)
  const filialRef = useRef<HTMLButtonElement>(null)
  const marcaRef = useRef<HTMLInputElement>(null)
  const modeloRef = useRef<HTMLInputElement>(null)
  const refDoCampoObrigatorio: Record<
    CampoObrigatorio,
    React.RefObject<HTMLButtonElement | null> | React.RefObject<HTMLInputElement | null>
  > = {
    categoria: categoriaRef,
    filial: filialRef,
    marca: marcaRef,
    modelo: modeloRef,
  }

  function limparFaltando(campo: CampoObrigatorio) {
    setFaltando((atual) => {
      if (!atual.has(campo)) return atual
      const novo = new Set(atual)
      novo.delete(campo)
      return novo
    })
  }

  const [enviando, setEnviando] = useState(false)
  const [errosServidor, setErrosServidor] = useState<string[]>([])
  // F29/UXG-05 — este formulário é LONGO e não vive dentro de um dialog: a caixa de
  // erro do servidor nasce fora da viewport de quem está no fim da página. Mesmo par
  // do wizard (MOV-01a/F27): `role="alert"` para o leitor de tela + `tabIndex={-1}`
  // com foco e rolagem, porque anunciar sem levar até lá resolve metade do problema.
  const errosServidorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (errosServidor.length === 0) return
    errosServidorRef.current?.focus()
    errosServidorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [errosServidor])
  const [resultado, setResultado] = useState<
    { id: string; patrimonio: string }[] | null
  >(null)
  // Sucesso PARCIAL (F25): a compra entrou, os campos do celular não. Vive ao lado
  // de `resultado` porque o painel de sucesso precisa mostrá-lo — toast some.
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null)
  const enviandoRef = useRef(false)
  const jaFocouLista = useRef(false)

  // ATV-10b — rascunho persistente (sessionStorage, por aba). `null` = nada a
  // oferecer; preenchido = banner de restauração aberto.
  const [rascunhoPendente, setRascunhoPendente] = useState<RascunhoCompra | null>(
    null,
  )
  // "Agora" para o "salvo há N min" do banner, congelado no instante da leitura
  // (dentro do efeito de hidratação) — nunca `Date.now()` direto no corpo do
  // componente, que a regra de pureza do React barra (impuro durante o render).
  const [agoraRascunho, setAgoraRascunho] = useState(0)
  const [hidratado, setHidratado] = useState(false)
  // O rascunho só é SOBRESCRITO depois que o operador mexe NESTA montagem —
  // mesma regra do wizard de movimentação (`nova-movimentacao-form.tsx`):
  // chegar por "Comprar outro igual" (`inicial`) ou com a memória de
  // filial/categoria do navegador já preenchida não pode apagar, sozinho, um
  // rascunho de outra visita a esta aba.
  const [podeSalvar, setPodeSalvar] = useState(false)
  // Último rascunho que o debounce ainda não gravou — usado no flush da
  // desmontagem (não dá para depender dos 400ms do debounce terem passado).
  const pendenteDeGravar = useRef<RascunhoCompra | null>(null)

  // Primeira alteração REAL do operador nesta montagem. Libera a persistência
  // e, se o banner estiver aberto, vale como decisão implícita de "começar um
  // rascunho novo por cima": quem digita por cima do banner sem clicar em
  // Descartar não pode ficar sem rede até se lembrar disso.
  function marcarAlteracao() {
    setPodeSalvar(true)
    setRascunhoPendente(null)
  }

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
      const bruto = window.localStorage.getItem(chaveCompraDefaults())
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
    const filialPreenchida = filiais.some(
      (f) => String(f.id) === ultimaCompra.filialId,
    )
    if (filialPreenchida) {
      setFilialId(ultimaCompra.filialId)
    }
    // ATV-09a — o preenchimento em massa também precisa apagar o "faltando" de
    // quem foi preenchido; sem isto o campo continuava marcado em vermelho
    // depois de "Repetir última compra" repor exatamente o valor que faltava.
    setFaltando((atual) => {
      if (atual.size === 0) return atual
      const novo = new Set(atual)
      if (ultimaCompra.categoria) novo.delete('categoria')
      if (ultimaCompra.marca.trim()) novo.delete('marca')
      if (ultimaCompra.modelo.trim()) novo.delete('modelo')
      if (filialPreenchida) novo.delete('filial')
      return novo
    })
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
      // ATV-09b — o teto do lote não vinha do preview da lista (só da faixa, via
      // `expandirFaixa`): 250 linhas passavam tranquilas e o erro só chegava do
      // servidor. O aviso do teto é sobre a CONTAGEM, não uma linha — entra
      // primeiro na lista de erros, antes dos avisos linha a linha.
      const erroTeto = erroTetoLista(itens.length)
      const textoErros = mensagens.map((m) => m.texto)
      return {
        itens,
        erros: erroTeto ? [erroTeto, ...textoErros] : textoErros,
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

  // F25 — os campos do celular aparecem só quando a categoria é CELULAR e o lote
  // tem no máximo UMA unidade.
  //
  // Por que o teto de uma unidade: não existe formulário "single" neste app — todo
  // cadastro é lote, e os campos de "Dados do modelo" são COMPARTILHADOS por todas
  // as unidades. Telefone, IMEI e Pulsus não são do modelo, são do APARELHO: um
  // campo compartilhado gravaria o mesmo IMEI em vinte celulares, que é corrupção
  // silenciosa de dado. Fazê-los por unidade custaria três textareas novas e a
  // generalização do pareamento por índice (`parearFaixaComServiceTags`) — caro
  // para o ganho, e em lote se preenche pela ficha depois. Decisão registrada.
  const mostrarCamposCelular = categoria === 'celular' && preview.itens.length <= 1

  // --- ATV-10b — rascunho persistente (sessionStorage, por aba) -----------
  // Leitura SÓ dentro de efeito (ler storage no corpo do componente quebraria
  // a hidratação do Next) e SÓ na montagem. "Comprar outro igual" (`inicial`)
  // tem precedência: quem chegou por esse link já trouxe os dados que quer
  // usar e não vê o banner de um rascunho de outra visita.
  useEffect(() => {
    const veioDeLink = Boolean(inicial)
    const t = setTimeout(() => {
      if (!veioDeLink) {
        setRascunhoPendente(lerRascunhoCompra())
        setAgoraRascunho(Date.now())
      }
      setHidratado(true)
    }, 0)
    return () => clearTimeout(t)
    // Montagem apenas: `inicial` só muda com nova navegação (nova página).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Salva o formulário a cada mudança (debounce). Só depois da primeira
  // alteração do operador (`podeSalvar`) e só quando há algo digitado — form
  // virgem (ou intocado desde a montagem) não cria rascunho nem sobrescreve o
  // que já estava salvo. Enquanto o banner está aberto também não grava; a
  // primeira alteração real o fecha (`marcarAlteracao`) e libera a gravação.
  useEffect(() => {
    if (!hidratado || !podeSalvar || rascunhoPendente || resultado) {
      pendenteDeGravar.current = null
      return
    }
    const rascunho: RascunhoCompra = {
      modo,
      textoLista,
      faixaInicio,
      faixaFim,
      faixaSts,
      categoria,
      marca,
      modelo,
      memoria,
      armazenamento,
      processador,
      fornecedor,
      filialId,
      observacao,
      data,
      telefone,
      imei,
      pulsus,
      salvoEm: new Date().toISOString(),
    }
    if (rascunhoVazio(rascunho)) {
      pendenteDeGravar.current = null
      const t = setTimeout(() => limparRascunhoCompra(), 400)
      return () => clearTimeout(t)
    }
    // O mesmo rascunho fica à mão para o flush da desmontagem (abaixo).
    pendenteDeGravar.current = rascunho
    const t = setTimeout(() => salvarRascunhoCompra(rascunho), 400)
    return () => clearTimeout(t)
  }, [
    hidratado,
    podeSalvar,
    rascunhoPendente,
    resultado,
    modo,
    textoLista,
    faixaInicio,
    faixaFim,
    faixaSts,
    categoria,
    marca,
    modelo,
    memoria,
    armazenamento,
    processador,
    fornecedor,
    filialId,
    observacao,
    data,
    telefone,
    imei,
    pulsus,
  ])

  // Flush na SAÍDA da montagem: o lote não pode depender de os 400ms do
  // debounce terem passado para sobreviver a uma navegação — na desmontagem o
  // rascunho vai para o storage na hora, e o banner o oferece na tela seguinte.
  useEffect(() => {
    return () => {
      const r = pendenteDeGravar.current
      if (r) salvarRascunhoCompra(r)
    }
  }, [])

  function restaurarRascunhoCompra() {
    const r = rascunhoPendente
    if (!r) return
    setModo(r.modo)
    setTextoLista(r.textoLista)
    setFaixaInicio(r.faixaInicio)
    setFaixaFim(r.faixaFim)
    setFaixaSts(r.faixaSts)
    setCategoria(r.categoria)
    setMarca(r.marca)
    setModelo(r.modelo)
    setMemoria(r.memoria)
    setArmazenamento(r.armazenamento)
    setProcessador(r.processador)
    setFornecedor(r.fornecedor)
    // A filial do rascunho pode não valer mais para este cargo (vínculo
    // mudou entre a gravação e agora) — nesse caso o campo fica vazio, em vez
    // de um Select mudo apontando para uma opção que não existe na lista.
    if (filiais.some((f) => String(f.id) === r.filialId)) setFilialId(r.filialId)
    setObservacao(r.observacao)
    setData(r.data)
    setTelefone(r.telefone)
    setImei(r.imei)
    setPulsus(r.pulsus)
    setFaltando(new Set())
    setRascunhoPendente(null)
    setPodeSalvar(true)
    toast.success('Rascunho restaurado.')
  }

  function descartarRascunhoCompra() {
    limparRascunhoCompra()
    setRascunhoPendente(null)
  }

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
    // ATV-09a — os obrigatórios do bloco "Dados do modelo" antes só falhavam por
    // `toast.error` (some sozinho, nenhum campo marcado ou focado). Agora ficam em
    // estado: cada um marca `aria-invalid` + mensagem sob o input, e o primeiro na
    // ordem VISUAL do grid recebe o foco.
    const faltandoAgora = new Set<CampoObrigatorio>()
    if (!categoria) faltandoAgora.add('categoria')
    if (!filialId) faltandoAgora.add('filial')
    if (!marca.trim()) faltandoAgora.add('marca')
    if (!modelo.trim()) faltandoAgora.add('modelo')
    setFaltando(faltandoAgora)
    if (faltandoAgora.size > 0) {
      const rotulos = ORDEM_CAMPOS_OBRIGATORIOS.filter((c) => faltandoAgora.has(c)).map(
        (c) => ROTULO_CAMPO_OBRIGATORIO[c],
      )
      toast.error(`Preencha: ${rotulos.join(', ')}.`)
      const primeiro = ORDEM_CAMPOS_OBRIGATORIOS.find((c) => faltandoAgora.has(c))
      if (primeiro) refDoCampoObrigatorio[primeiro].current?.focus()
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
      // F25 — só viajam quando o bloco está VISÍVEL (celular + unidade única). Sem
      // essa guarda, digitar o IMEI e depois colar 20 patrimônios gravaria o MESMO
      // IMEI nos 20 aparelhos.
      ...(mostrarCamposCelular ? { telefone, imei, pulsus } : {}),
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
        chaveCompraDefaults(),
        JSON.stringify({ categoria, filialId }),
      )
    } catch {
      // Sem localStorage (modo privado, storage cheio): a compra já foi feita,
      // só não haverá memória de defaults.
    }
    // ATV-10b — sucesso (e só sucesso) fecha o rascunho: o que entrou não pode
    // ser oferecido de novo como "compra não cadastrada" na próxima visita.
    limparRascunhoCompra()
    pendenteDeGravar.current = null
    setResultado(res.criados)
    toast.success(
      `${res.criados.length} ${res.criados.length === 1 ? 'equipamento cadastrado' : 'equipamentos cadastrados'}.`,
    )
    // Sucesso PARCIAL (F25): a compra entrou mas os campos do celular não. Um
    // segundo toast, e não a substituição do de sucesso — as duas coisas são
    // verdade, e esconder a primeira faria o operador achar que nada foi
    // cadastrado. `duration` maior porque este pede uma AÇÃO (abrir a ficha), e o
    // estado abaixo repete o recado no painel, que não expira.
    setAvisoParcial(res.aviso ?? null)
    if (res.aviso) toast.warning(res.aviso, { duration: 10_000 })
    router.refresh()
  }

  function reiniciar() {
    setTextoLista('')
    setFaixaInicio('')
    setFaixaFim('')
    setFaixaSts('')
    setTelefone('')
    setImei('')
    setPulsus('')
    setMarca('')
    setModelo('')
    setMemoria('')
    setArmazenamento('')
    setProcessador('')
    setFornecedor('')
    setObservacao('')
    setErrosServidor([])
    setResultado(null)
    setAvisoParcial(null)
    // ATV-09a — categoria e filial não são limpas aqui (de propósito: seguem para
    // a próxima compra do lote), mas o "faltando" precisa acompanhar por defesa —
    // um novo envio decide de novo, do zero.
    setFaltando(new Set())
  }

  // ---------- Painel de sucesso ----------
  if (resultado) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-sucesso text-sucesso-texto">
          <Check className="size-6" />
        </div>
        <h2 className="text-lg font-semibold">
          {resultado.length}{' '}
          {resultado.length === 1
            ? 'equipamento cadastrado'
            : 'equipamentos cadastrados'}{' '}
          em estoque
        </h2>
        {/* ⚠ O aviso de sucesso PARCIAL também mora AQUI, e não só no toast: o toast
            some em 10s e o painel é o que fica na tela. Sem esta faixa, o operador
            que piscou vê só o verde "cadastrado" — que é exatamente a tela mentirosa
            que o aviso existe para evitar. A ficha está a um clique, logo abaixo. */}
        {avisoParcial && (
          <p className="mx-auto mt-3 max-w-md rounded-md border border-amber-300 bg-callout-atencao px-3 py-2 text-sm text-callout-atencao-texto dark:border-amber-900/60">
            {avisoParcial}
          </p>
        )}
        <div className="mt-3 flex max-h-56 flex-wrap justify-center gap-2 overflow-y-auto">
          {resultado.map((a) => (
            <Button key={a.id} asChild variant="outline" size="sm">
              <Link href={`/ativos/${a.id}`} className="tabular-nums">
                {a.patrimonio}
              </Link>
            </Button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reiniciar}>Cadastrar mais</Button>
          <Button asChild variant="outline">
            <Link href="/ativos">Ver ativos</Link>
          </Button>
          {/* ATV-07a — só com exatamente UM ativo criado: o preset da URL
              (`?ativo=<id>`) é de um ativo só, e com 2+ não há para qual dos
              patrimônios recém-cadastrados o botão apontaria. */}
          {resultado.length === 1 && (
            <Button asChild variant="outline">
              <Link href={`/movimentacoes/nova?ativo=${resultado[0].id}`}>
                Movimentar agora
              </Link>
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ATV-10b — só para o texto do banner: contagem de patrimônios e "há quanto
  // tempo", calculados fora do JSX para não repetir a chamada.
  const qtdRascunho = rascunhoPendente ? contarPatrimoniosRascunho(rascunhoPendente) : 0
  const tempoRascunho =
    rascunhoPendente?.salvoEm && agoraRascunho
      ? formatTempoRelativo(rascunhoPendente.salvoEm, agoraRascunho)
      : ''

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

      {/* ATV-10b — compra não cadastrada desta aba (sessionStorage). Não
          aparece junto com o banner acima: "Comprar outro igual" (`inicial`)
          tem precedência e nem chega a oferecer o rascunho (ver o efeito de
          hidratação). */}
      {rascunhoPendente && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-callout-atencao-borda bg-callout-atencao p-3 text-sm text-callout-atencao-texto">
          <FileClock className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            Você tem uma compra não cadastrada —{' '}
            {qtdRascunho > 0 ? (
              <>
                <span className="font-medium tabular-nums">{qtdRascunho}</span>{' '}
                {qtdRascunho === 1 ? 'patrimônio' : 'patrimônios'}
              </>
            ) : (
              'dados preenchidos'
            )}
            {tempoRascunho && ` · salvo ${tempoRascunho}`}.
          </p>
          <span className="flex gap-2">
            <Button type="button" variant="outline" onClick={descartarRascunhoCompra}>
              Descartar
            </Button>
            <Button type="button" onClick={restaurarRascunhoCompra}>
              Restaurar
            </Button>
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

        <Tabs
          value={modo}
          onValueChange={(v) => {
            setModo(v as 'lista' | 'faixa')
            marcarAlteracao()
          }}
        >
          <TabsList>
            <TabsTrigger value="lista">Colar lista</TabsTrigger>
            <TabsTrigger value="faixa">Faixa</TabsTrigger>
          </TabsList>
          <TabsContent value="lista" className="mt-3">
            <Label htmlFor="lista" className="mb-2">
              Um por linha — patrimônio <strong>e service tag</strong> (obrigatória),
              separados por vírgula, ponto e vírgula ou TAB · até {MAX_LOTE_COMPRA}{' '}
              por lote
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
              onChange={(e) => {
                setTextoLista(e.target.value)
                marcarAlteracao()
              }}
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
                  onChange={(e) => {
                    setFaixaInicio(e.target.value)
                    marcarAlteracao()
                  }}
                  placeholder="WAP0006026"
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="faixa-fim">Até</Label>
                <Input
                  id="faixa-fim"
                  value={faixaFim}
                  onChange={(e) => {
                    setFaixaFim(e.target.value)
                    marcarAlteracao()
                  }}
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
                onChange={(e) => {
                  setFaixaSts(e.target.value)
                  marcarAlteracao()
                }}
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
        {/* Erros de PARSE da lista/faixa. Aqui não há foco programático: a caixa
            nasce logo abaixo do campo que a produziu, já sob os olhos de quem digitou
            — roubar o foco tiraria o cursor do campo no meio da correção. */}
        {preview.erros.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
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
        <div
          ref={errosServidorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive outline-none"
        >
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
              onClick={() => {
                repetirUltimaCompra()
                marcarAlteracao()
              }}
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
              onValueChange={(v) => {
                setCategoria(v as CategoriaAtivo)
                limparFaltando('categoria')
                marcarAlteracao()
              }}
            >
              <SelectTrigger
                id="compra-categoria"
                ref={categoriaRef}
                aria-invalid={faltando.has('categoria')}
                aria-describedby={
                  faltando.has('categoria') ? 'compra-categoria-erro' : undefined
                }
              >
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
            {faltando.has('categoria') && (
              <p id="compra-categoria-erro" role="alert" className="text-sm text-destructive">
                Selecione a categoria.
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="compra-filial">
              Filial que recebeu<span className="text-destructive"> *</span>
            </Label>
            {filiais.length === 0 ? (
              <AvisoSemFilialDeEscrita />
            ) : (
              <>
                <Select
                  value={filialId || undefined}
                  onValueChange={(v) => {
                    setFilialId(v)
                    limparFaltando('filial')
                    marcarAlteracao()
                  }}
                >
                  <SelectTrigger
                    id="compra-filial"
                    ref={filialRef}
                    aria-invalid={faltando.has('filial')}
                    aria-describedby={
                      faltando.has('filial') ? 'compra-filial-erro' : undefined
                    }
                  >
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
                {faltando.has('filial') && (
                  <p id="compra-filial-erro" role="alert" className="text-sm text-destructive">
                    Selecione a filial que recebeu.
                  </p>
                )}
              </>
            )}
          </div>
          <CampoComSugestoes
            id="marca"
            label="Marca"
            campo="marca"
            obrigatorio
            valor={marca}
            aoMudar={(v) => {
              setMarca(v)
              if (v.trim()) limparFaltando('marca')
              marcarAlteracao()
            }}
            placeholder="Samsung"
            inputRef={marcaRef}
            erro={faltando.has('marca') ? 'Informe a marca.' : undefined}
          />
          <CampoComSugestoes
            id="modelo"
            label="Modelo"
            campo="modelo"
            obrigatorio
            valor={modelo}
            aoMudar={(v) => {
              setModelo(v)
              if (v.trim()) limparFaltando('modelo')
              marcarAlteracao()
            }}
            placeholder="Galaxy A17"
            marca={marca}
            inputRef={modeloRef}
            erro={faltando.has('modelo') ? 'Informe o modelo.' : undefined}
          />
          <div className="grid gap-2">
            <Label htmlFor="memoria">Memória</Label>
            <Input
              id="memoria"
              value={memoria}
              onChange={(e) => {
                setMemoria(e.target.value)
                marcarAlteracao()
              }}
              placeholder="8 GB"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="armazenamento">Armazenamento</Label>
            <Input
              id="armazenamento"
              value={armazenamento}
              onChange={(e) => {
                setArmazenamento(e.target.value)
                marcarAlteracao()
              }}
              placeholder="256 GB"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="processador">Processador</Label>
            <Input
              id="processador"
              value={processador}
              onChange={(e) => {
                setProcessador(e.target.value)
                marcarAlteracao()
              }}
              placeholder="—"
            />
          </div>
          {/* F25 — campos do CELULAR. Reativos de graça: `categoria` é estado
              local e trocar o Select re-renderiza o formulário inteiro (este
              form não usa react-hook-form). */}
          {mostrarCamposCelular && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="telefone">Nº do telefone</Label>
                <Input
                  id="telefone"
                  value={telefone}
                  onChange={(e) => {
                    setTelefone(e.target.value)
                    marcarAlteracao()
                  }}
                  placeholder="(41) 90000-0000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="imei">IMEI</Label>
                <Input
                  id="imei"
                  value={imei}
                  onChange={(e) => {
                    setImei(e.target.value)
                    marcarAlteracao()
                  }}
                  placeholder="000000000000000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pulsus">Pulsus</Label>
                <Input
                  id="pulsus"
                  value={pulsus}
                  onChange={(e) => {
                    setPulsus(e.target.value)
                    marcarAlteracao()
                  }}
                  placeholder="Identificação no Pulsus"
                />
              </div>
            </>
          )}
          {categoria === 'celular' && preview.itens.length > 1 && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Nº do telefone, IMEI e Pulsus são de cada aparelho, não do modelo —
              em lote eles não aparecem aqui. Cadastre o lote e preencha na ficha
              de cada celular.
            </p>
          )}
          <CampoComSugestoes
            id="fornecedor"
            label="Fornecedor"
            campo="fornecedor"
            valor={fornecedor}
            aoMudar={(v) => {
              setFornecedor(v)
              marcarAlteracao()
            }}
            placeholder="WAP"
          />
          <div className="grid gap-2">
            <Label htmlFor="data-compra">Data da entrada</Label>
            <Input
              id="data-compra"
              type="date"
              max={hojeISO()}
              value={data}
              onChange={(e) => {
                setData(e.target.value)
                marcarAlteracao()
              }}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="obs-compra">Observação (nº da nota fiscal etc.)</Label>
            <Textarea
              id="obs-compra"
              rows={2}
              maxLength={500}
              value={observacao}
              onChange={(e) => {
                setObservacao(e.target.value)
                marcarAlteracao()
              }}
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

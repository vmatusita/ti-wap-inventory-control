'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Trash2, Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STATUS_META } from '@/lib/dominio'
import { cn } from '@/lib/utils'
// VALOR só dos módulos-folha PUROS do motor: o barrel `@/lib/import` re-exporta
// `plano.ts`, que importa node:crypto — ele não pode entrar no bundle do cliente.
// Os TIPOS vêm do barrel normalmente (são apagados no build).
import { parseData, SITUACAO_CANONICA, TIPO_CANONICO } from '@/lib/import/deparas'
import { canonicalizarPatrimonio } from '@/lib/patrimonio'
import type {
  CategoriaAtivo,
  CorrecaoImport,
  GrupoErro,
  RegistroImport,
  StatusAtivo,
} from '@/lib/import'
import { rotuloTipoErro, VAZIO } from '@/components/admin/importar/rotulos'

// Cards de correção do preview do import (OS-F7B / W3 · §7). Um card por
// `GrupoErro` — o MOTOR já decidiu o que cada grupo oferece (`correcao.kind`) e
// já ordenou do mais numeroso para o menos; aqui só se renderiza o controle.
//
// Toda correção sai daqui como `CorrecaoImport[]` e sobe para o wizard, que
// reanalisa o arquivo do zero pelo motor. A tela é a SEGUNDA linha de validação
// (nem oferece o que é inválido); o servidor é a primeira.

type CorrigirFn = (ops: CorrecaoImport[]) => void

const CATEGORIAS = Object.entries(TIPO_CANONICO) as [Exclude<CategoriaAtivo, 'outro'>, string][]
const ESTADOS = Object.entries(SITUACAO_CANONICA) as [Exclude<StatusAtivo, 'descartado'>, string][]

function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mesma régua do CSV (motor): dd/MM/aaaa válida e não futura. */
function dataValida(valor: string): boolean {
  const r = parseData(valor, hojeIso())
  return r.iso !== null && !r.invalida && !r.futura
}

function plural(n: number, singular: string, pluralTxt: string): string {
  return n === 1 ? singular : pluralTxt
}

function removerLinhas(linhas: number[]): CorrecaoImport[] {
  return linhas.map((linha) => ({ op: 'remover_linha', linha }))
}

// ---------------------------------------------------------------------------
// Contexto: quem corrige vê a LINHA inteira, não a célula solta (OS-F7B §7).

function LinhasContexto({
  linhas,
  contexto,
}: {
  linhas: number[]
  contexto: Record<number, RegistroImport>
}) {
  const regs = linhas.map((l) => contexto[l]).filter((r): r is RegistroImport => !!r)
  if (regs.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="p-2 text-left font-medium">Linha</th>
            <th className="p-2 text-left font-medium">Site</th>
            <th className="p-2 text-left font-medium">Patrimônio</th>
            <th className="p-2 text-left font-medium">Service Tag</th>
            <th className="p-2 text-left font-medium">Tipo</th>
            <th className="p-2 text-left font-medium">Marca / Modelo</th>
            <th className="p-2 text-left font-medium">Status / Situação</th>
            <th className="p-2 text-left font-medium">Colaborador</th>
          </tr>
        </thead>
        <tbody>
          {regs.map((r) => (
            <tr key={r.linha} className="border-t">
              <td className="p-2 tabular-nums text-muted-foreground">{r.linha}</td>
              <td className="p-2">{r.site || '—'}</td>
              <td className="p-2 font-mono">{r.patrimonio || '—'}</td>
              <td className="p-2 font-mono">{r.serviceTag || '—'}</td>
              <td className="p-2">{r.tipo || '—'}</td>
              <td className="p-2">{[r.marca, r.modelo].filter(Boolean).join(' / ') || '—'}</td>
              <td className="p-2">
                {[r.status, r.situacao].filter(Boolean).join(' / ') || '—'}
              </td>
              <td className="p-2">{r.colaborador || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Moldura comum: cabeçalho + corpo (o controle do kind) + rodapé + expansão.

function CardGrupo({
  grupo,
  bloqueante,
  chaveVisivel,
  contexto,
  pendente,
  onCorrigir,
  removivel = true,
  children,
}: {
  grupo: GrupoErro
  bloqueante: boolean
  chaveVisivel?: string
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
  removivel?: boolean
  children?: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const n = grupo.linhas.length
  const chave = chaveVisivel ?? grupo.chave
  // `linha_sem_chave`, `header_invalido`, `plano_vazio` e `correcao_invalida` não
  // têm registro em `contexto` (linha descartada / linha 0) — sem expansão.
  const temContexto = grupo.linhas.some((l) => !!contexto[l])

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={bloqueante ? 'destructive' : 'secondary'}>
            {rotuloTipoErro(grupo.tipo)}
          </Badge>
          {chave.trim() !== '' && (
            <span className="max-w-full truncate font-mono text-xs" title={chave}>
              {chave}
            </span>
          )}
          {/* `correcao_invalida` e `plano_vazio` não são de uma linha do CSV
              (linha 0) — contá-los como "1 linha" enganaria. */}
          {grupo.linhas.some((l) => l > 0) && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {n} {plural(n, 'linha', 'linhas')}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{grupo.erros[0]?.mensagem}</p>
      </div>

      {children}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {temContexto ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 px-2 text-muted-foreground"
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {aberto ? 'Ocultar linhas' : `Ver ${plural(n, 'a linha', `as ${n} linhas`)}`}
          </Button>
        ) : (
          <span />
        )}
        {removivel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-destructive hover:text-destructive"
            disabled={pendente}
            onClick={() => onCorrigir(removerLinhas(grupo.linhas))}
          >
            <Trash2 className="size-3.5" />
            {n === 1 ? 'Remover a linha' : `Remover as ${n} linhas`}
          </Button>
        )}
      </div>

      {aberto && <LinhasContexto linhas={grupo.linhas} contexto={contexto} />}
    </div>
  )
}

/** Preview ao vivo da canonicalização do patrimônio: verde = como vai ficar,
 *  vermelho = ainda inválido (OS-F7B §7). */
function PreviewPatrimonio({ valor }: { valor: string }) {
  const canonico = canonicalizarPatrimonio(valor)
  return (
    <span
      className={cn(
        'font-mono text-xs',
        canonico ? 'text-green-600 dark:text-green-400' : 'text-destructive',
      )}
    >
      {valor.trim() === ''
        ? 'informe o patrimônio'
        : canonico
          ? `→ ${canonico}`
          : 'ainda fora do formato (ex.: WAP0004491)'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// kind: 'categoria' — Tipo fora do vocabulário. Massa por valor cru.

function CardCategoria({
  grupo,
  sugestao,
  ...comuns
}: {
  grupo: GrupoErro
  sugestao: Exclude<CategoriaAtivo, 'outro'> | null
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const [categoria, setCategoria] = useState<string>(sugestao ?? '')
  const n = grupo.linhas.length

  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-48" aria-label="Categoria correta">
            <SelectValue placeholder="Escolha o tipo correto" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map(([cat, termo]) => (
              <SelectItem key={cat} value={cat}>
                {termo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sugestao !== null && categoria === sugestao && (
          <Badge variant="outline" className="text-muted-foreground">
            sugestão
          </Badge>
        )}
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={categoria === '' || comuns.pendente}
          onClick={() =>
            comuns.onCorrigir([
              {
                op: 'substituir',
                campo: 'tipo',
                de: grupo.chave,
                para: TIPO_CANONICO[categoria as Exclude<CategoriaAtivo, 'outro'>],
              },
            ])
          }
        >
          <Wand2 className="size-3.5" />
          Corrigir {n} {plural(n, 'linha', 'linhas')}
        </Button>
      </div>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'estado' — Status/Situação sem estado resolvível OU descartado. O Select
// grava o TERMO canônico na coluna Situação (que vence Status na precedência).
// NUNCA input livre: fora do vocabulário = `correcao_invalida` no motor.

function CardEstado({
  grupo,
  statusDe,
  situacaoDe,
  sugestao,
  ...comuns
}: {
  grupo: GrupoErro
  statusDe: string
  situacaoDe: string
  sugestao: Exclude<StatusAtivo, 'descartado'> | null
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const [estado, setEstado] = useState<string>(sugestao ?? '')
  const n = grupo.linhas.length

  return (
    <CardGrupo
      grupo={grupo}
      chaveVisivel={`Status=${statusDe || VAZIO} · Situação=${situacaoDe || VAZIO}`}
      {...comuns}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-56" aria-label="Estado correto">
            <SelectValue placeholder="Escolha o estado correto" />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS.map(([e, termo]) => (
              <SelectItem key={e} value={e}>
                {STATUS_META[e].rotulo}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{termo}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sugestao !== null && estado === sugestao && (
          <Badge variant="outline" className="text-muted-foreground">
            sugestão
          </Badge>
        )}
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={estado === '' || comuns.pendente}
          onClick={() =>
            comuns.onCorrigir([
              {
                op: 'substituir_estado',
                statusDe,
                situacaoDe,
                para: SITUACAO_CANONICA[estado as Exclude<StatusAtivo, 'descartado'>],
              },
            ])
          }
        >
          <Wand2 className="size-3.5" />
          Corrigir {n} {plural(n, 'linha', 'linhas')}
        </Button>
      </div>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'site_desconhecido' — erro de grafia: ação única, vira a filial do import.

function CardSiteDesconhecido({
  grupo,
  filialNome,
  ...comuns
}: {
  grupo: GrupoErro
  filialNome: string
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const n = grupo.linhas.length
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <Button
        type="button"
        size="sm"
        className="gap-2"
        disabled={comuns.pendente}
        onClick={() =>
          comuns.onCorrigir([
            { op: 'substituir', campo: 'site', de: grupo.chave, para: filialNome },
          ])
        }
      >
        <Wand2 className="size-3.5" />
        Definir como {filialNome} ({n} {plural(n, 'linha', 'linhas')})
      </Button>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'site_outra_filial' — decisão 4 do Johnny: só remover.

function CardSiteOutraFilial({
  grupo,
  filialNome,
  ...comuns
}: {
  grupo: GrupoErro
  filialNome: string
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        Estas linhas são de outra filial e <strong>não entram</strong> no import de{' '}
        {filialNome}. Forçar o Site mascararia uma transferência — mover ativo entre
        filiais é operação do sistema (movimentação de transferência), não do import.
        Remova as linhas para seguir.
      </p>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'existe_em_outra_filial' (F7C) — o ativo JÁ está cadastrado noutra filial.
// Mesma doutrina da decisão 4: mudar de filial é transferência, não import.

function CardExisteEmOutraFilial({
  grupo,
  filialDona,
  filialNome,
  ...comuns
}: {
  grupo: GrupoErro
  filialDona: string
  filialNome: string
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const n = grupo.linhas.length
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        {n === 1 ? 'Este ativo já está' : `Estes ${n} ativos já estão`} cadastrado
        {n === 1 ? '' : 's'} na filial <strong>{filialDona}</strong>. O import de{' '}
        {filialNome} <strong>não apaga</strong> o acervo de {filialDona}, e o par
        patrimônio + service tag é único no sistema inteiro — então{' '}
        {n === 1 ? 'esta linha' : 'estas linhas'} não {n === 1 ? 'entra' : 'entram'}{' '}
        por aqui. Se {n === 1 ? 'o aparelho mudou' : 'os aparelhos mudaram'} de filial,
        isso é uma <strong>transferência</strong>: remova{' '}
        {n === 1 ? 'a linha' : 'as linhas'} para seguir com o import e registre a
        transferência pelo sistema (o histórico do ativo é preservado).
      </p>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'patrimonio' — pontual por linha (o mesmo valor em N linhas viraria par
// duplicado; OS-F7B §3.2).

function LinhaPatrimonio({
  linha,
  reg,
  pendente,
  onCorrigir,
}: {
  linha: number
  reg: RegistroImport | undefined
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const original = reg?.patrimonio ?? ''
  const [valor, setValor] = useState(original)
  const canonico = canonicalizarPatrimonio(valor)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
        linha {linha}
      </span>
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="WAP0004491"
        aria-label={`Patrimônio da linha ${linha}`}
        className="w-44 font-mono"
        autoComplete="off"
      />
      <PreviewPatrimonio valor={valor} />
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendente || !canonico || valor.trim() === original.trim()}
          onClick={() => onCorrigir([{ op: 'editar', linha, campo: 'patrimonio', para: valor }])}
        >
          Corrigir
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={pendente}
          onClick={() => onCorrigir([{ op: 'remover_linha', linha }])}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function CardPatrimonio({
  grupo,
  ...comuns
}: {
  grupo: GrupoErro
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <div className="space-y-2">
        {grupo.linhas.map((l) => (
          <LinhaPatrimonio
            key={l}
            linha={l}
            reg={comuns.contexto[l]}
            pendente={comuns.pendente}
            onCorrigir={comuns.onCorrigir}
          />
        ))}
      </div>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'duplicata' — as linhas lado a lado com contexto COMPLETO: quem corrige
// precisa ver quais são os dois ativos antes de decidir o que é sobra.

function LinhaDuplicata({
  linha,
  reg,
  pendente,
  onCorrigir,
}: {
  linha: number
  reg: RegistroImport | undefined
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const patrimonioOrig = reg?.patrimonio ?? ''
  const tagOrig = reg?.serviceTag ?? ''
  const [patrimonio, setPatrimonio] = useState(patrimonioOrig)
  const [tag, setTag] = useState(tagOrig)

  const mudouPatrimonio = patrimonio.trim() !== patrimonioOrig.trim()
  const mudouTag = tag.trim() !== tagOrig.trim()
  const patrimonioOk = !mudouPatrimonio || !!canonicalizarPatrimonio(patrimonio)
  const tagOk = !mudouTag || tag.trim() !== ''

  function corrigir() {
    const ops: CorrecaoImport[] = []
    if (mudouPatrimonio) ops.push({ op: 'editar', linha, campo: 'patrimonio', para: patrimonio })
    if (mudouTag) ops.push({ op: 'editar', linha, campo: 'serviceTag', para: tag })
    if (ops.length > 0) onCorrigir(ops)
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          linha {linha}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-2 text-destructive hover:text-destructive"
          disabled={pendente}
          onClick={() => onCorrigir([{ op: 'remover_linha', linha }])}
        >
          <Trash2 className="size-3.5" />
          Remover esta linha
        </Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Marca / Modelo</dt>
        <dd>{[reg?.marca, reg?.modelo].filter(Boolean).join(' / ') || '—'}</dd>
        <dt className="text-muted-foreground">Hostname</dt>
        <dd className="font-mono">{reg?.hostname || '—'}</dd>
        <dt className="text-muted-foreground">Colaborador</dt>
        <dd>{reg?.colaborador || '—'}</dd>
        <dt className="text-muted-foreground">Status / Situação</dt>
        <dd>{[reg?.status, reg?.situacao].filter(Boolean).join(' / ') || '—'}</dd>
      </dl>

      <div className="space-y-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`dup-pat-${linha}`}>
            Patrimônio
          </label>
          <Input
            id={`dup-pat-${linha}`}
            value={patrimonio}
            onChange={(e) => setPatrimonio(e.target.value)}
            className="font-mono"
            autoComplete="off"
          />
          {mudouPatrimonio && <PreviewPatrimonio valor={patrimonio} />}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`dup-tag-${linha}`}>
            Service Tag
          </label>
          <Input
            id={`dup-tag-${linha}`}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="font-mono"
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          disabled={pendente || (!mudouPatrimonio && !mudouTag) || !patrimonioOk || !tagOk}
          onClick={corrigir}
        >
          Corrigir esta linha
        </Button>
      </div>
    </div>
  )
}

function CardDuplicata({
  grupo,
  ...comuns
}: {
  grupo: GrupoErro
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  return (
    <CardGrupo grupo={grupo} {...comuns} removivel={false}>
      <div className="grid gap-3 sm:grid-cols-2">
        {grupo.linhas.map((l) => (
          <LinhaDuplicata
            key={l}
            linha={l}
            reg={comuns.contexto[l]}
            pendente={comuns.pendente}
            onCorrigir={comuns.onCorrigir}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Duas linhas com o mesmo par patrimônio + service tag colidem no índice único
        do banco. Corrija a chave de uma delas ou remova a sobra — basta sobrar uma.
      </p>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'data' (AVISO) — massa por N `editar` (uma por linha do grupo), NÃO por
// `substituir`. Decisão do orquestrador (17/07/2026): em data o grupo ≠ as
// células que casam com o valor cru — uma linha com Inclusão vazia mas Entrega
// VÁLIDA não está no grupo e casaria com `de: ''`, e o `substituir` global
// escreveria nela, podendo mudar em silêncio a dataEntrada dela (o motor calcula
// dataEntrada = a mais antiga válida). `editar` por linha é exato.

function CardData({
  grupo,
  ...comuns
}: {
  grupo: GrupoErro
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const [valor, setValor] = useState(grupo.chave)
  const n = grupo.linhas.length
  const ok = dataValida(valor)

  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="dd/mm/aaaa"
            aria-label="Data de inclusão para todas as linhas do grupo"
            className="w-36 tabular-nums"
            autoComplete="off"
          />
          <span
            className={cn(
              'text-xs',
              valor.trim() === ''
                ? 'text-muted-foreground'
                : ok
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-destructive',
            )}
          >
            {valor.trim() === ''
              ? 'formato dd/mm/aaaa'
              : ok
                ? 'data válida'
                : 'data inválida ou futura'}
          </span>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            disabled={!ok || comuns.pendente}
            onClick={() =>
              comuns.onCorrigir(
                grupo.linhas.map((linha) => ({
                  op: 'editar',
                  linha,
                  campo: 'dataInclusao',
                  para: valor,
                })),
              )
            }
          >
            <Wand2 className="size-3.5" />
            Definir para {n === 1 ? 'a linha' : `as ${n} linhas`}
          </Button>
        </div>

        <div className="space-y-2">
          {grupo.linhas.map((l) => (
            <LinhaData
              key={l}
              linha={l}
              reg={comuns.contexto[l]}
              pendente={comuns.pendente}
              onCorrigir={comuns.onCorrigir}
            />
          ))}
        </div>
      </div>
    </CardGrupo>
  )
}

function LinhaData({
  linha,
  reg,
  pendente,
  onCorrigir,
}: {
  linha: number
  reg: RegistroImport | undefined
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const [valor, setValor] = useState(reg?.dataInclusao ?? '')
  const ok = dataValida(valor)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
        linha {linha}
      </span>
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="dd/mm/aaaa"
        aria-label={`Data de inclusão da linha ${linha}`}
        className="w-36 tabular-nums"
        autoComplete="off"
      />
      <span className="text-xs text-muted-foreground">
        entrega: <span className="font-mono">{reg?.dataEntrega || '—'}</span>
      </span>
      <div className="ml-auto">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendente || !ok}
          onClick={() => onCorrigir([{ op: 'editar', linha, campo: 'dataInclusao', para: valor }])}
        >
          Definir
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// kind: 'colaborador' (AVISO) — pontual, "Nome / Setor" (o motor separa no `/`).

function LinhaColaborador({
  linha,
  reg,
  pendente,
  onCorrigir,
}: {
  linha: number
  reg: RegistroImport | undefined
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  const original = reg?.colaborador ?? ''
  const [valor, setValor] = useState(original)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
        linha {linha}
      </span>
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Nome / Setor"
        aria-label={`Colaborador da linha ${linha}`}
        className="w-64"
        autoComplete="off"
      />
      <div className="ml-auto">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendente || valor.trim() === '' || valor.trim() === original.trim()}
          onClick={() => onCorrigir([{ op: 'editar', linha, campo: 'colaborador', para: valor }])}
        >
          Corrigir
        </Button>
      </div>
    </div>
  )
}

function CardColaborador({
  grupo,
  ...comuns
}: {
  grupo: GrupoErro
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <div className="space-y-2">
        {grupo.linhas.map((l) => (
          <LinhaColaborador
            key={l}
            linha={l}
            reg={comuns.contexto[l]}
            pendente={comuns.pendente}
            onCorrigir={comuns.onCorrigir}
          />
        ))}
      </div>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher — o `kind` vem do motor; a tela não decide o que oferecer.

export function GruposErros({
  grupos,
  contexto,
  filialNome,
  tiposAviso,
  pendente,
  onCorrigir,
}: {
  grupos: GrupoErro[]
  contexto: Record<number, RegistroImport>
  filialNome: string
  tiposAviso: Set<string>
  pendente: boolean
  onCorrigir: CorrigirFn
}) {
  if (grupos.length === 0) return null

  return (
    <div className="space-y-3">
      {grupos.map((grupo) => {
        const comuns = {
          bloqueante: !tiposAviso.has(grupo.tipo),
          contexto,
          pendente,
          onCorrigir,
        }
        const chaveReact = `${grupo.tipo}::${grupo.chave}`

        switch (grupo.correcao.kind) {
          case 'categoria': {
            // `sugerirValor` nunca devolve 'outro' (não há termo no vocabulário
            // que resolva para ele) — o guard existe só para satisfazer o tipo.
            const s = grupo.correcao.sugestao
            return (
              <CardCategoria
                key={chaveReact}
                grupo={grupo}
                sugestao={s !== null && s !== 'outro' ? s : null}
                {...comuns}
              />
            )
          }
          case 'estado': {
            const s = grupo.correcao.sugestao
            return (
              <CardEstado
                key={chaveReact}
                grupo={grupo}
                statusDe={grupo.correcao.statusDe}
                situacaoDe={grupo.correcao.situacaoDe}
                sugestao={s !== null && s !== 'descartado' ? s : null}
                {...comuns}
              />
            )
          }
          case 'site_desconhecido':
            return (
              <CardSiteDesconhecido
                key={chaveReact}
                grupo={grupo}
                filialNome={filialNome}
                {...comuns}
              />
            )
          case 'site_outra_filial':
            return (
              <CardSiteOutraFilial
                key={chaveReact}
                grupo={grupo}
                filialNome={filialNome}
                {...comuns}
              />
            )
          case 'existe_em_outra_filial':
            return (
              <CardExisteEmOutraFilial
                key={chaveReact}
                grupo={grupo}
                filialDona={grupo.correcao.filial}
                filialNome={filialNome}
                {...comuns}
              />
            )
          case 'patrimonio':
            return <CardPatrimonio key={chaveReact} grupo={grupo} {...comuns} />
          case 'duplicata':
            return <CardDuplicata key={chaveReact} grupo={grupo} {...comuns} />
          case 'data':
            return <CardData key={chaveReact} grupo={grupo} {...comuns} />
          case 'colaborador':
            return <CardColaborador key={chaveReact} grupo={grupo} {...comuns} />
          case 'nenhuma':
            // header_invalido / linha_sem_chave / correcao_invalida / plano_vazio:
            // a mensagem do motor já explica o que fazer (trocar o arquivo,
            // desfazer a correção…). Card informativo, sem ação e sem remoção.
            return (
              <CardGrupo key={chaveReact} grupo={grupo} {...comuns} removivel={false} />
            )
        }
      })}
    </div>
  )
}

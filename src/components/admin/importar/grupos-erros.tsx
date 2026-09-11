'use client'

import { useId, useMemo, useState } from 'react'
import { CheckCheck, ChevronDown, ChevronRight, Eraser, Trash2, Wand2 } from 'lucide-react'
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
import { extrairPatrimonioDoHostname, SITUACAO_CANONICA, TIPO_CANONICO } from '@/lib/import/deparas'
import { canonicalizarPatrimonio } from '@/lib/patrimonio'
import type {
  CategoriaImport,
  CorrecaoImport,
  EstadoAlvoImport,
  GrupoErro,
  RegistroImport,
} from '@/lib/import'
import { rotuloTipoErro, VAZIO } from '@/components/admin/importar/rotulos'
import {
  chaveLinha,
  chaveMassa,
  dataValida,
  faltamNoGrupo,
  grupoPronto,
  massaEfetiva,
  opsDoGrupo,
  resumoOps,
  type Rascunho,
} from '@/components/admin/importar/ops-grupo'

// Cards de correção do preview do import (OS-F7B / W3 · §7). Um card por
// `GrupoErro` — o MOTOR já decidiu o que cada grupo oferece (`correcao.kind`) e
// já ordenou do mais numeroso para o menos; aqui só se renderiza o controle.
//
// Toda correção sai daqui como `CorrecaoImport[]` e sobe para o wizard, que
// reanalisa o arquivo do zero pelo motor. A tela é a SEGUNDA linha de validação
// (nem oferece o que é inválido); o servidor é a primeira.

type CorrigirFn = (ops: CorrecaoImport[]) => void

/** Props comuns que o dispatcher passa a cada card. F7D: o rascunho (valores
 *  digitados/escolhidos) vive no PAI, não em cada card — é o que torna possível o
 *  botão "corrigir a seção" e o botão global. */
type CtrlProps = {
  bloqueante: boolean
  contexto: Record<number, RegistroImport>
  pendente: boolean
  onCorrigir: CorrigirFn
  filialNome: string
  rascunho: Rascunho
  setCampo: (chave: string, valor: string) => void
}

const CATEGORIAS = Object.entries(TIPO_CANONICO) as [CategoriaImport, string][]
const ESTADOS = Object.entries(SITUACAO_CANONICA) as [EstadoAlvoImport, string][]

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
}: CtrlProps & {
  grupo: GrupoErro
  chaveVisivel?: string
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
          {/* F7F — três vias: bloqueante = vermelho; aviso = ÂMBAR (não cinza);
              secondary fica reservado a neutro (na prática todo card é um ou outro). */}
          <Badge variant={bloqueante ? 'destructive' : 'warning'}>
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
 *  vermelho = ainda inválido (OS-F7B §7). F7F — `opcional` (card de patrimônio
 *  vazio, aviso): o estado VAZIO é âmbar/discreto ("preencha se souber"), NUNCA
 *  vermelho — ali o campo pode legitimamente ficar em branco. Só valor DIGITADO
 *  fora do formato segue vermelho (é feedback do que a pessoa escreveu). */
// `id` opcional: quem tem um input ao lado liga o `aria-describedby` nele, para o
// leitor de tela anunciar a mesma dica que a tela mostra (OS-F11 T9).
function PreviewPatrimonio({
  valor,
  opcional = false,
  id,
}: {
  valor: string
  opcional?: boolean
  id?: string
}) {
  const canonico = canonicalizarPatrimonio(valor)
  const vazio = valor.trim() === ''
  return (
    <span
      id={id}
      className={cn(
        'font-mono text-xs',
        canonico
          ? 'text-green-600 dark:text-green-400'
          : vazio && opcional
            ? 'text-warning'
            : 'text-destructive',
      )}
    >
      {vazio
        ? opcional
          ? 'opcional — preencha se souber'
          : 'informe o patrimônio'
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
}: CtrlProps & {
  grupo: GrupoErro
  sugestao: CategoriaImport | null
}) {
  const { rascunho, setCampo, contexto, filialNome, pendente, onCorrigir } = comuns
  const categoria = massaEfetiva(grupo, rascunho)
  const n = grupo.linhas.length

  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={categoria} onValueChange={(v) => setCampo(chaveMassa(grupo), v)}>
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
          disabled={!grupoPronto(grupo, rascunho, contexto) || pendente}
          onClick={() => onCorrigir(opsDoGrupo(grupo, rascunho, contexto, filialNome))}
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
}: CtrlProps & {
  grupo: GrupoErro
  statusDe: string
  situacaoDe: string
  sugestao: EstadoAlvoImport | null
}) {
  const { rascunho, setCampo, contexto, filialNome, pendente, onCorrigir } = comuns
  const estado = massaEfetiva(grupo, rascunho)
  const n = grupo.linhas.length

  return (
    <CardGrupo
      grupo={grupo}
      chaveVisivel={`Status=${statusDe || VAZIO} · Situação=${situacaoDe || VAZIO}`}
      {...comuns}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={estado} onValueChange={(v) => setCampo(chaveMassa(grupo), v)}>
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
          disabled={!grupoPronto(grupo, rascunho, contexto) || pendente}
          onClick={() => onCorrigir(opsDoGrupo(grupo, rascunho, contexto, filialNome))}
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

function CardSiteDesconhecido({ grupo, ...comuns }: CtrlProps & { grupo: GrupoErro }) {
  const { filialNome, rascunho, contexto, pendente, onCorrigir } = comuns
  const n = grupo.linhas.length
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <Button
        type="button"
        size="sm"
        className="gap-2"
        disabled={pendente}
        onClick={() => onCorrigir(opsDoGrupo(grupo, rascunho, contexto, filialNome))}
      >
        <Wand2 className="size-3.5" />
        Definir como {filialNome} ({n} {plural(n, 'linha', 'linhas')})
      </Button>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'site_outra_filial' — decisão 4 do Johnny: só remover.

function CardSiteOutraFilial({ grupo, ...comuns }: CtrlProps & { grupo: GrupoErro }) {
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        Estas linhas são de outra filial e <strong>não entram</strong> no import de{' '}
        {comuns.filialNome}. Forçar o Site mascararia uma transferência — mover ativo entre
        filiais é operação do sistema (movimentação de transferência), não do import.
        Remova as linhas para seguir.
      </p>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'existe_em_outra_filial' (F7C → F24) — o mesmo aparelho já tem cadastro noutra
// filial. Deixou de bloquear (decisão do Johnny, 30/07/2026): a linha IMPORTA, os dois
// cadastros coexistem e o par vira uma pendência de conflito, resolvida na mesa de
// /pendencias — onde dá para ver os dois lados juntos e decidir qual é o certo.
// Remover a linha continua sendo uma saída, agora OPCIONAL (o botão do rodapé fica).

function CardExisteEmOutraFilial({
  grupo,
  filialDona,
  ...comuns
}: CtrlProps & { grupo: GrupoErro; filialDona: string }) {
  const { filialNome } = comuns
  const n = grupo.linhas.length
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        {n === 1 ? 'Este aparelho também tem' : `Estes ${n} aparelhos também têm`} cadastro
        na filial <strong>{filialDona}</strong>.{' '}
        {n === 1 ? 'A linha entra' : 'As linhas entram'} no import de {filialNome} normalmente
        e {n === 1 ? 'abre' : 'abrem'} um <strong>conflito entre filiais</strong>, que aparece
        em <strong>Pendências</strong> com os dois cadastros lado a lado — é lá que se decide
        qual é o certo e se apaga o outro. O import <strong>não move</strong> aparelho de
        filial: se {n === 1 ? 'o aparelho mudou' : 'os aparelhos mudaram'} mesmo de lugar,
        registre a <strong>transferência</strong> pelo sistema (o histórico é preservado).
        Remover {n === 1 ? 'a linha' : 'as linhas'} daqui continua valendo, mas é opcional.
      </p>
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// Botão "corrigir a seção" — F7F: habilita com ≥1 linha pronta e aplica as
// PRONTAS (as que faltam continuam no card). Antes exigia todas (F7D). Uma
// reanálise só.

function BotaoSecao({
  n,
  pronto,
  faltam,
  pendente,
  onClick,
}: {
  n: number
  pronto: boolean
  faltam: number
  pendente: boolean
  onClick: () => void
}) {
  const prontas = n - faltam
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-2">
      <Button
        type="button"
        size="sm"
        className="gap-2"
        disabled={!pronto || pendente}
        onClick={onClick}
      >
        <CheckCheck className="size-3.5" />
        {!pronto
          ? `Corrigir ${n === 1 ? 'a linha' : `as ${n} linhas`}`
          : faltam === 0
            ? `Corrigir ${n === 1 ? 'a linha' : `todas as ${n} linhas`}`
            : `Corrigir ${prontas} ${plural(prontas, 'linha pronta', 'linhas prontas')}`}
      </Button>
      {faltam > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {faltam === 1 ? 'falta 1 linha' : `faltam ${faltam} linhas`}
          {pronto ? ' (aplica as prontas agora)' : ' para habilitar'}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// kind: 'patrimonio' — pontual por linha (o mesmo valor em N linhas viraria par
// duplicado; OS-F7B §3.2). Controlado pelo rascunho do pai (F7D).

function LinhaPatrimonio({
  linha,
  reg,
  pendente,
  onCorrigir,
  rascunho,
  setCampo,
  opcional = false,
}: {
  linha: number
  reg: RegistroImport | undefined
  pendente: boolean
  onCorrigir: CorrigirFn
  rascunho: Rascunho
  setCampo: (chave: string, valor: string) => void
  opcional?: boolean
}) {
  // F7-pós (Johnny, 20/07/2026): no card de patrimônio VAZIO (`opcional`), o valor cru
  // é um marcador de ausência (`n/a`, `SEM PATRIMONIO`…) que importa NULO — o campo tem
  // de nascer EM BRANCO (senão o preview mostraria "ainda fora do formato" em vermelho e
  // pareceria erro). Preencher segue opcional. No card de patrimônio INVÁLIDO (não
  // opcional) o cru continua aparecendo — é o valor que o operador precisa ver/corrigir.
  const original = opcional ? '' : (reg?.patrimonio ?? '')
  const chave = chaveLinha(linha, 'patrimonio')
  const valor = rascunho[chave] ?? original
  const canonico = canonicalizarPatrimonio(valor)
  // Sugestão de 1 clique: quando o Hostname traz um patrimônio canônico embutido
  // (padrão real `NB-WAP0001234` → `WAP0001234`), oferece preencher o rascunho com ele.
  // F7F — usa `extrairPatrimonioDoHostname` (a MESMA régua do motor, folha client-safe),
  // não `canonicalizarPatrimonio` direto: este devolvia null p/ hostnames prefixados e o
  // botão nunca aparecia no padrão real. NÃO aplica sozinho — só preenche o input; o
  // "Corrigir" (por linha / seção / global) é que aplica. No card de patrimônio vazio o
  // motor já auto-preenche quando o hostname resolve, então aqui o botão só aparece no
  // card de patrimônio INVÁLIDO (valor errado + hostname bom), que o motor não sobrescreve.
  const hostnamePatrimonio = extrairPatrimonioDoHostname(reg?.hostname)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
        linha {linha}
      </span>
      <Input
        value={valor}
        onChange={(e) => setCampo(chave, e.target.value)}
        placeholder="WAP0004491"
        aria-label={`Patrimônio da linha ${linha}`}
        className="w-44 font-mono"
        autoComplete="off"
        // Só `aria-describedby` (sem `aria-invalid`): neste cartão TODA linha nasce
        // inválida por definição, e o anel vermelho do `aria-invalid` pintaria a
        // tela inteira de erro. A dica ao lado já carrega o estado, agora lida.
        aria-describedby={`prev-pat-${linha}`}
      />
      <PreviewPatrimonio valor={valor} opcional={opcional} id={`prev-pat-${linha}`} />
      {hostnamePatrimonio && hostnamePatrimonio !== valor.trim() && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1 font-mono"
          disabled={pendente}
          onClick={() => setCampo(chave, hostnamePatrimonio)}
        >
          <Wand2 className="size-3.5" />
          usar {hostnamePatrimonio}
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {/* F7J: no card de patrimônio INVÁLIDO (não opcional), duas saídas além de
            corrigir: FORÇAR o valor fora do padrão (só quando há valor não-canônico) e
            deixar SEM patrimônio (pendência). No card vazio (opcional) não fazem sentido. */}
        {!opcional && valor.trim() !== '' && !canonico && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendente}
            title="Usar este valor como patrimônio mesmo fora do padrão canônico"
            onClick={() =>
              onCorrigir(
                valor.trim() === original.trim()
                  ? [{ op: 'forcar_patrimonio', linha }]
                  : [
                      { op: 'editar', linha, campo: 'patrimonio', para: valor },
                      { op: 'forcar_patrimonio', linha },
                    ],
              )
            }
          >
            Usar mesmo assim
          </Button>
        )}
        {!opcional && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={pendente}
            title="Importar esta linha SEM patrimônio (vira pendência 'sem patrimônio físico')"
            onClick={() => onCorrigir([{ op: 'editar', linha, campo: 'patrimonio', para: '' }])}
          >
            <Eraser className="size-3.5" />
            Sem patrimônio
          </Button>
        )}
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

function CardPatrimonio({ grupo, ...comuns }: CtrlProps & { grupo: GrupoErro }) {
  const { rascunho, setCampo, contexto, filialNome, pendente, onCorrigir } = comuns
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <div className="space-y-2">
        {grupo.linhas.map((l) => (
          <LinhaPatrimonio
            key={l}
            linha={l}
            reg={contexto[l]}
            pendente={pendente}
            onCorrigir={onCorrigir}
            rascunho={rascunho}
            setCampo={setCampo}
          />
        ))}
      </div>
      <BotaoSecao
        n={grupo.linhas.length}
        pronto={grupoPronto(grupo, rascunho, contexto)}
        faltam={faltamNoGrupo(grupo, rascunho, contexto)}
        pendente={pendente}
        onClick={() => onCorrigir(opsDoGrupo(grupo, rascunho, contexto, filialNome))}
      />
    </CardGrupo>
  )
}

// ---------------------------------------------------------------------------
// kind: 'patrimonio_vazio' (AVISO, F7E) — as linhas importam SEM patrimônio, com a
// pendência "sem patrimônio físico". Preencher é OPCIONAL: mesma doutrina do card
// `duplicata` — fica FORA do botão de seção e do lote global (pode legitimamente
// ficar em branco), então nada de `BotaoSecao` aqui e `removivel={false}` (a remoção
// é por linha, dentro de `LinhaPatrimonio`, que também traz a sugestão de hostname).

function CardPatrimonioVazio({ grupo, ...comuns }: CtrlProps & { grupo: GrupoErro }) {
  const { rascunho, setCampo, contexto, pendente, onCorrigir } = comuns
  return (
    <CardGrupo grupo={grupo} {...comuns} removivel={false}>
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        Estas linhas importam <strong>sem patrimônio</strong>, com a pendência
        &ldquo;sem patrimônio físico&rdquo; — preencha só as que você souber o número. As
        demais entram assim mesmo e podem ser corrigidas depois, na ficha do ativo.
      </p>
      <div className="space-y-2">
        {grupo.linhas.map((l) => (
          <LinhaPatrimonio
            key={l}
            linha={l}
            reg={contexto[l]}
            pendente={pendente}
            onCorrigir={onCorrigir}
            rascunho={rascunho}
            setCampo={setCampo}
            opcional
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
            aria-describedby={mudouPatrimonio ? `dup-pat-prev-${linha}` : undefined}
          />
          {mudouPatrimonio && (
            <PreviewPatrimonio valor={patrimonio} id={`dup-pat-prev-${linha}`} />
          )}
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

// Duplicata fica linha a linha (grupos pequenos, DOIS campos por linha, e o
// conserto típico é mexer só numa das duas) — fora do lote/global (F7D).
function CardDuplicata({ grupo, ...comuns }: CtrlProps & { grupo: GrupoErro }) {
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

function CardData({ grupo, ...comuns }: CtrlProps & { grupo: GrupoErro }) {
  const { rascunho, setCampo, contexto, filialNome, pendente, onCorrigir } = comuns
  const [massa, setMassa] = useState('')
  const n = grupo.linhas.length
  const massaOk = dataValida(massa)
  // Pode haver mais de um grupo 'data' na tela — o id da dica tem de ser único.
  const ajudaId = useId()

  // Digitar aqui preenche o rascunho de TODAS as linhas — o botão da seção (e o
  // global) enxergam; cada linha ainda pode ser ajustada individualmente depois.
  function preencherTodas(v: string) {
    setMassa(v)
    for (const l of grupo.linhas) setCampo(chaveLinha(l, 'dataInclusao'), v)
  }

  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={massa}
            onChange={(e) => preencherTodas(e.target.value)}
            placeholder="dd/mm/aaaa"
            aria-label="Data de inclusão para todas as linhas do grupo"
            className="w-36 tabular-nums"
            autoComplete="off"
            aria-describedby={ajudaId}
          />
          <span
            id={ajudaId}
            className={cn(
              'text-xs',
              massa.trim() === ''
                ? 'text-muted-foreground'
                : massaOk
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-destructive',
            )}
          >
            {massa.trim() === ''
              ? `preenche as ${n} linhas de uma vez`
              : massaOk
                ? 'aplicada às linhas abaixo'
                : 'data inválida ou futura'}
          </span>
        </div>

        {/* F7E — entrega dd/MMM (ex.: 18/nov) resolve o ajuste sozinha quando a
            inclusão tem ano; só as linhas SEM nenhuma data caem neste aviso. */}
        <p className="text-xs text-muted-foreground">
          As linhas com entrega no formato <span className="font-mono">dd/MMM</span> (ex.:{' '}
          <span className="font-mono">18/nov</span>) resolvem sozinhas assim que a inclusão
          ganhar uma data — o ano vem da própria inclusão.
        </p>

        <div className="space-y-2">
          {grupo.linhas.map((l) => (
            <LinhaData
              key={l}
              linha={l}
              reg={contexto[l]}
              pendente={pendente}
              onCorrigir={onCorrigir}
              rascunho={rascunho}
              setCampo={setCampo}
            />
          ))}
        </div>
      </div>
      <BotaoSecao
        n={n}
        pronto={grupoPronto(grupo, rascunho, contexto)}
        faltam={faltamNoGrupo(grupo, rascunho, contexto)}
        pendente={pendente}
        onClick={() => onCorrigir(opsDoGrupo(grupo, rascunho, contexto, filialNome))}
      />
    </CardGrupo>
  )
}

function LinhaData({
  linha,
  reg,
  pendente,
  onCorrigir,
  rascunho,
  setCampo,
}: {
  linha: number
  reg: RegistroImport | undefined
  pendente: boolean
  onCorrigir: CorrigirFn
  rascunho: Rascunho
  setCampo: (chave: string, valor: string) => void
}) {
  const chave = chaveLinha(linha, 'dataInclusao')
  const valor = rascunho[chave] ?? (reg?.dataInclusao ?? '')
  const ok = dataValida(valor)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
        linha {linha}
      </span>
      <Input
        value={valor}
        onChange={(e) => setCampo(chave, e.target.value)}
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
  rascunho,
  setCampo,
}: {
  linha: number
  reg: RegistroImport | undefined
  pendente: boolean
  onCorrigir: CorrigirFn
  rascunho: Rascunho
  setCampo: (chave: string, valor: string) => void
}) {
  const original = reg?.colaborador ?? ''
  const chave = chaveLinha(linha, 'colaborador')
  const valor = rascunho[chave] ?? original

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
        linha {linha}
      </span>
      <Input
        value={valor}
        onChange={(e) => setCampo(chave, e.target.value)}
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

function CardColaborador({ grupo, ...comuns }: CtrlProps & { grupo: GrupoErro }) {
  const { rascunho, setCampo, contexto, filialNome, pendente, onCorrigir } = comuns
  return (
    <CardGrupo grupo={grupo} {...comuns}>
      <div className="space-y-2">
        {grupo.linhas.map((l) => (
          <LinhaColaborador
            key={l}
            linha={l}
            reg={contexto[l]}
            pendente={pendente}
            onCorrigir={onCorrigir}
            rascunho={rascunho}
            setCampo={setCampo}
          />
        ))}
      </div>
      <BotaoSecao
        n={grupo.linhas.length}
        pronto={grupoPronto(grupo, rascunho, contexto)}
        faltam={faltamNoGrupo(grupo, rascunho, contexto)}
        pendente={pendente}
        onClick={() => onCorrigir(opsDoGrupo(grupo, rascunho, contexto, filialNome))}
      />
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
  // F7D — o rascunho (valores digitados/escolhidos) vive AQUI, não em cada card:
  // é o que torna possível o botão global juntar tudo numa reanálise só. Persiste
  // entre reanálises de propósito (a linha que segue com erro mantém o que foi
  // digitado); o wizard remonta este componente com `key` ao trocar arquivo/filial
  // (regra §3.8), então o rascunho morre junto quando deve.
  const [rascunho, setRascunho] = useState<Rascunho>({})
  const setCampo = (chave: string, valor: string) =>
    setRascunho((r) => ({ ...r, [chave]: valor }))

  // O que o botão global aplicaria: as ops de TODOS os cards com ≥1 linha pronta
  // (massa + pontual, inclusive PARCIAL desde a F7F + remoções). Derivado do MESMO
  // módulo puro que os botões dos cards — a régua não se duplica.
  const opsGlobais = useMemo(
    () =>
      grupos
        .filter((g) => grupoPronto(g, rascunho, contexto))
        .flatMap((g) => opsDoGrupo(g, rascunho, contexto, filialNome)),
    [grupos, rascunho, contexto, filialNome],
  )
  const resumoGlobal = resumoOps(opsGlobais)
  // F7F — quantas linhas dos cards corrigíveis ainda faltam preencher (o botão
  // global agora inclui PARCIAIS): `faltamNoGrupo` já devolve 0 para
  // patrimonio_vazio/duplicata/nenhuma, então M conta só o que falta no que dá.
  const faltamGlobal = useMemo(
    () => grupos.reduce((acc, g) => acc + faltamNoGrupo(g, rascunho, contexto), 0),
    [grupos, rascunho, contexto],
  )

  if (grupos.length === 0) return null

  return (
    <div className="space-y-3">
      {opsGlobais.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Aplicar tudo o que está pronto</p>
            <p className="text-xs text-muted-foreground">
              {resumoGlobal}
              {faltamGlobal > 0 && (
                <>
                  {resumoGlobal !== '' && ' · '}
                  <span className="text-warning">
                    faltam {faltamGlobal.toLocaleString('pt-BR')}{' '}
                    {plural(faltamGlobal, 'linha', 'linhas')} para incluir tudo
                  </span>
                </>
              )}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            disabled={pendente}
            onClick={() => onCorrigir(opsGlobais)}
          >
            <CheckCheck className="size-4" />
            Aplicar todas as correções ({opsGlobais.length.toLocaleString('pt-BR')})
          </Button>
        </div>
      )}

      {grupos.map((grupo) => {
        const comuns: CtrlProps = {
          bloqueante: !tiposAviso.has(grupo.tipo),
          contexto,
          pendente,
          onCorrigir,
          filialNome,
          rascunho,
          setCampo,
        }
        const chaveReact = `${grupo.tipo}::${grupo.chave}`

        switch (grupo.correcao.kind) {
          case 'categoria': {
            // O guard `s !== 'outro'` que vivia aqui sumiu em 30/08/2026 junto com o
            // enum-fantasma (dívida técnica, item I): `CategoriaImport` do MOTOR
            // (F56 · Frente B — antes `CategoriaAtivo`, redeclarada à mão) não tem
            // mais o valor que o CSV nunca produz, então não há o que descartar.
            return (
              <CardCategoria
                key={chaveReact}
                grupo={grupo}
                sugestao={grupo.correcao.sugestao}
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
            return <CardSiteDesconhecido key={chaveReact} grupo={grupo} {...comuns} />
          case 'site_outra_filial':
            return <CardSiteOutraFilial key={chaveReact} grupo={grupo} {...comuns} />
          case 'existe_em_outra_filial':
            return (
              <CardExisteEmOutraFilial
                key={chaveReact}
                grupo={grupo}
                filialDona={grupo.correcao.filial}
                {...comuns}
              />
            )
          case 'patrimonio':
            return <CardPatrimonio key={chaveReact} grupo={grupo} {...comuns} />
          case 'patrimonio_vazio':
            return <CardPatrimonioVazio key={chaveReact} grupo={grupo} {...comuns} />
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

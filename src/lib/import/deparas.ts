// De→Para do import de startup (OS-F7 / W1). Funções PURAS extraídas e adaptadas
// de `scripts/import/normalizar.ts` (motor da carga única F4) para código de
// produção testável. Aplicam os vocabulários De→Para da spec §5 (ampliados
// 15/07/2026) sobre os valores crus do CSV. Nada aqui toca banco/UI.
//
// TABELAS ESPELHADAS DE scripts/import/normalizar.ts (F4):
//   - UNIDADES (De→Para de Site/Unidade → filial oficial)
//   - CATEGORIAS (Tipo → categoria) — aqui devolve null p/ desconhecido (F7 §3
//     bloqueia; a F4 devolvia 'outro')
//   - ESTADOS + precedência Situação>Status
//   - normalizarTexto / normalizarHeader / limparCampo / parseData /
//     normalizarServiceTag / chaveServiceTag / extrairChamado
// Os scripts da F4 permanecem intocados (ferramenta histórica do go-live).

import { canonicalizarPatrimonio } from '@/lib/patrimonio'
import type { CategoriaAtivo, FilialOficial, StatusAtivo } from './tipos'

// ---------------------------------------------------------------------------
// Texto

/** minúsculas, sem acento, sem `:` final, espaços colapsados — base do De→Para. */
export function normalizarTexto(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/:$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cabeçalho: normalizarTexto após tirar `:`/espaços à direita (headers reais têm `Site:`). */
export function normalizarHeader(raw: string): string {
  return normalizarTexto(raw.replace(/[:\s]+$/, ''))
}

const VAZIOS = new Set([
  '', '-', '_', 'n/a', 'na', 'x', 'xx', 'xxx', '0', 'nenhum',
  'não.', 'nao.', 'não', 'nao', 'sem',
])

/** Campo "vazio na prática" (`-`, `N/A`, `X`…) → null; senão o texto aparado. */
export function limparCampo(raw: string | undefined | null): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (t === '') return null
  if (VAZIOS.has(normalizarTexto(t))) return null
  return t
}

// F7E (OS §2.2) — patrimônio "vazio na prática". Amplia `VAZIOS` com os dizeres
// explícitos "sem patrimônio". Diferente da F7: aqui o vazio NÃO bloqueia — o ativo
// importa com patrimônio NULO e pendência "sem patrimônio físico" (spec §10.2). A
// comparação é sempre via `normalizarTexto`, então "SEM PATRIMÔNIO" (com acento e
// caixa alta) cai na mesma chave `sem patrimonio`; `""`, `-`, `n/a`, `0`, `x`… vêm
// de `VAZIOS`. NÃO mexe em `canonicalizarPatrimonio` — nenhum patrimônio canônico
// ([A-Z]{2,4}\d{7}) está neste conjunto, então nada real vira nulo por engano.
const PATRIMONIO_VAZIO = new Set<string>([...VAZIOS, 'sem patrimonio'])

// F7F+ (Johnny, 20/07/2026): variantes textuais de "sem patrimônio" da WAP que NÃO
// batiam no conjunto exato acima e por isso caíam como `patrimonio_invalido`
// (bloqueante), travando o import. O caso real mais comum no go-live é `SEMPAT`;
// além dele, as famílias `sem pat…` / `s/pat…` / `sem plaqueta|placa|etiqueta|número|
// identificação`. Todas DECLARAM ausência de plaqueta → importam VAZIO (pendência),
// não bloqueiam. O que NÃO muda (decisão 5, régua da F7): só-números e códigos COM
// dígito (`12345`, `3652`) e lixo sem declaração de ausência (`ABC`, `WAPalmaq-teste`)
// SEGUEM BLOQUEANDO — podem ser patrimônio mistypado e o operador tem de ver.
const FAMILIA_SEM_PATRIMONIO =
  /^(sem\s*pat|s\/\s*pat|sem\s*plaqueta|sem\s*placa|sem\s*etiqueta|sem\s*numero|sem\s*num\b|sem\s*identificacao)/

/** Patrimônio "vazio na prática" (F7E; família textual ampliada na F7F)? true →
 *  importa nulo (pendência), não bloqueia. Reconhece o conjunto exato + a família
 *  "sem patrimônio". A guarda `canonicalizarPatrimonio(...) === null` blinda contra
 *  tratar um patrimônio VÁLIDO como vazio (nenhum canônico casa a família, mas é
 *  defesa em profundidade: um `SEM0001234` legítimo segue sendo patrimônio). */
export function patrimonioVazio(raw: string | null | undefined): boolean {
  const norm = normalizarTexto(raw ?? '')
  if (PATRIMONIO_VAZIO.has(norm)) return true
  return FAMILIA_SEM_PATRIMONIO.test(norm) && canonicalizarPatrimonio(raw ?? '') === null
}

// F7F (decisão do Johnny, 17/07/2026 — REVOGA a não-inferência por hostname de 16/07):
// procura no HOSTNAME um patrimônio JÁ no formato canônico ([A-Z]{2,4} + 7 dígitos)
// embutido — ex.: `NB-WAP0001234`/`DESKTOP-WAP0004491` → `WAP0001234`/`WAP0004491`. Exige
// o token canônico COMPLETO (7 dígitos) delimitado: `PC-01` (número curto) e `DESKTOP-SALA`
// (sem número) NÃO preenchem — caem no F7E (nulo + pendência). O token achado ainda passa por
// `canonicalizarPatrimonio`, o juiz final do valor (contrato §1.5), que NÃO muda. NOTA: chamar
// `canonicalizarPatrimonio(hostname)` direto não serve — ele apaga separadores e ou falha em
// `NB-WAP…` (5 letras coladas) ou aceita lixo (`PC-01`→`PC0000001`); por isso a extração aqui.
// Fica em deparas.ts (folha client-safe) para o motor (plano.ts) E a UI (botão 1-clique do W3)
// usarem EXATAMENTE a mesma régua — sem duplicar o extrator.
const PATRIMONIO_EMBUTIDO_RE = /(?:^|[^A-Z0-9])([A-Z]{2,4}\d{7})(?![0-9])/

export function extrairPatrimonioDoHostname(hostname: string | null | undefined): string | null {
  const m = (hostname ?? '').toUpperCase().match(PATRIMONIO_EMBUTIDO_RE)
  return m ? canonicalizarPatrimonio(m[1]!) : null
}

// ---------------------------------------------------------------------------
// Unidades / filiais (spec §5, ampliado 15/07/2026) — espelho da F4

const UNIDADES: Record<string, FilialOficial> = {
  'matriz': 'Matriz',
  'matriz sao marcos': 'Matriz',
  'cd-afp': 'CD-Afonso Pena',
  'cd afp': 'CD-Afonso Pena',
  'cd-pena': 'CD-Afonso Pena',
  'cd pena': 'CD-Afonso Pena',
  'cd-afonso pena': 'CD-Afonso Pena',
  'cd afonso pena': 'CD-Afonso Pena',
  'cd-afonsopena': 'CD-Afonso Pena',
  'afonso pena': 'CD-Afonso Pena',
  'eusebio': 'Eusébio',
  'filial-ce': 'Eusébio',
  'filial ce': 'Eusébio',
  'serra': 'Serra',
  'serra park': 'Serra',
  'linhares': 'Linhares',
  'filial - linhares': 'Linhares',
  'filial linhares': 'Linhares',
}

export function mapearUnidade(raw: string | null | undefined): FilialOficial | null {
  const t = normalizarTexto(raw ?? '')
  return UNIDADES[t] ?? null
}

export const SLUG_POR_FILIAL: Record<FilialOficial, string> = {
  'Matriz': 'matriz',
  'CD-Afonso Pena': 'cd-afonso-pena',
  'Linhares': 'linhares',
  'Eusébio': 'eusebio',
  'Serra': 'serra',
}

const FILIAL_POR_SLUG: Record<string, FilialOficial> = Object.fromEntries(
  (Object.entries(SLUG_POR_FILIAL) as [FilialOficial, string][]).map(([f, s]) => [s, f]),
)

/** Slug do banco → filial oficial (para casar o Site da linha com a filial escolhida). */
export function filialPorSlug(slug: string): FilialOficial | null {
  return FILIAL_POR_SLUG[slug] ?? null
}

// ---------------------------------------------------------------------------
// Categoria (Tipo → enum). F7 §3: desconhecido é BLOQUEANTE — por isso aqui
// devolvemos null (a F4 devolvia 'outro' silenciosamente).

const CATEGORIAS: Record<string, CategoriaAtivo> = {
  'notebook': 'notebook',
  'desktop': 'desktop',
  'monitor': 'monitor',
  'celular': 'celular',
  'tablet': 'tablet',
}

/** Categoria da planilha → enum; fora do vocabulário → null (chamador bloqueia). */
export function mapearCategoria(raw: string | null | undefined): CategoriaAtivo | null {
  return CATEGORIAS[normalizarTexto(raw ?? '')] ?? null
}

/** F7B — termos de Tipo aceitos pelo De→Para (candidatos da sugestão por Levenshtein). */
export const CATEGORIAS_TERMOS: readonly string[] = Object.keys(CATEGORIAS)

/**
 * F7B — tabela reversa de `CATEGORIAS`: enum → termo que a UI grava na célula Tipo.
 * `outro` fica de fora porque o vocabulário do CSV não tem termo que resolva para
 * ele (`mapearCategoria` nunca devolve 'outro') — categoria desconhecida se corrige
 * para uma das 5 conhecidas ou a linha sai do import.
 */
export const TIPO_CANONICO: Record<Exclude<CategoriaAtivo, 'outro'>, string> = {
  notebook: 'Notebook',
  desktop: 'Desktop',
  monitor: 'Monitor',
  celular: 'Celular',
  tablet: 'Tablet',
}

// ---------------------------------------------------------------------------
// Estado da planilha (spec §4; precedência Situação > Status — DECISOES 15/07)

const ESTADOS: Record<string, StatusAtivo> = {
  'saida': 'em_uso',
  'remanejo': 'em_uso',
  'guardada': 'em_estoque',
  'estoque': 'em_estoque',
  'reservada': 'reservado',
  'reservado': 'reservado',
  'emprestimo': 'emprestado',
  'validar': 'em_triagem',
  'devolvido': 'em_triagem',
  'devolucao': 'em_triagem',
  'manutencao': 'em_manutencao',
  'rt wap': 'defasado',
  'posse wap': 'defasado',
  'defasada': 'defasado',
  'defasado': 'defasado',
  'descarte': 'descartado',
  'descartado': 'descartado',
}

/**
 * Estado corrente segundo a planilha: `Situação` vence quando preenchida, senão
 * `Status`. Valor fora da tabela → null (o chamador gera bloqueante
 * estado_desconhecido). Espelho fiel da precedência da F4.
 */
export function estadoPlanilha(
  status: string | null | undefined,
  situacao: string | null | undefined,
): StatusAtivo | null {
  const sit = normalizarTexto(situacao ?? '')
  const sta = normalizarTexto(status ?? '')
  const efetivo = sit !== '' ? sit : sta
  if (efetivo === '') return null
  return ESTADOS[efetivo] ?? null
}

/**
 * F7B — termos de Situação/Status aceitos como CORREÇÃO: o vocabulário `ESTADOS`
 * menos os que resolvem para `descartado`. Descartado continua bloqueante (régua
 * da F7 §W1.5 — intocada): corrigir `estado_descartado` é trocar o estado ou
 * remover a linha, nunca "aceitar o descartado".
 */
export const ESTADOS_CORRIGIVEIS: readonly string[] = Object.entries(ESTADOS)
  .filter(([, estado]) => estado !== 'descartado')
  .map(([termo]) => termo)

/**
 * F7B — tabela canônica reversa (OS-F7B §3.4): estado do sistema → termo que a UI
 * grava na coluna Situação. Como Situação vence Status na precedência, escrever
 * `SITUACAO_CANONICA[estado]` na célula resolve o estado da linha sem tocar em
 * Status. `descartado` não tem entrada — de propósito (ver ESTADOS_CORRIGIVEIS).
 * O teste de ciclo garante `estadoPlanilha(_, SITUACAO_CANONICA[e]) === e`.
 */
export const SITUACAO_CANONICA: Record<Exclude<StatusAtivo, 'descartado'>, string> = {
  em_estoque: 'Estoque',
  em_uso: 'Saída',
  reservado: 'Reservado',
  emprestado: 'Empréstimo',
  em_triagem: 'Validar',
  em_manutencao: 'Manutenção',
  defasado: 'Defasado',
}

// ---------------------------------------------------------------------------
// Datas — espelho EXATO da F4: só `dd/mm/aaaa` (ano 4 dígitos). dd/MM/yy e
// serial Excel NÃO são aceitos (a F4 não os aceitava — "espelhe exatamente").

export type ParseDataResult = { iso: string | null; invalida: boolean; futura: boolean }

const DATA_VAZIA = new Set(['', '-', 'n/a', 'na'])

export function parseData(raw: string | null | undefined, hoje: string): ParseDataResult {
  const t = (raw ?? '').trim()
  if (DATA_VAZIA.has(normalizarTexto(t))) {
    return { iso: null, invalida: false, futura: false }
  }
  const m = t.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/)
  if (!m) return { iso: null, invalida: true, futura: false }
  const dia = Number(m[1])
  const mes = Number(m[2])
  const ano = Number(m[3])
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return { iso: null, invalida: true, futura: false }
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return { iso: null, invalida: true, futura: false }
  }
  const iso = `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return { iso, invalida: false, futura: iso > hoje }
}

// F7E (OS §2.1) — datas de entrega no formato abreviado `dd/MMM` (ex.: `18/nov`,
// `21/jan`, `Nov.` com ponto/caixa qualquer). A planilha real traz o mês por
// extenso abreviado e sem ano; o ano vem da Data de Inclusão da MESMA linha.
const MESES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
}

/**
 * F7E — resolve a Data de Entrega, que pode vir como `dd/MM/aaaa` OU `dd/MMM`.
 * O destino é a DATA DO AJUSTE de reconciliação (spec §10.2); `parseData` NÃO muda
 * (correções digitadas na tela continuam exigindo `dd/MM/aaaa` completa).
 *
 *  - vazio-na-prática (`DATA_VAZIA`) → `{ iso: null, invalida: false }` (sem data,
 *    não é erro);
 *  - `dd/MM/aaaa` → delega a `parseData` (comportamento F4/F7, byte a byte);
 *  - `dd/MMM` → exige `inclusaoIso` válida (senão `invalida: true`); ano = ano da
 *    inclusão; se `(mês, dia)` da entrega < `(mês, dia)` da inclusão → **ano + 1**
 *    (a entrega nunca antecede a inclusão na planilha — virada de ano); valida
 *    dia/mês reais (`31/fev` → inválida); resultado > `hoje` → `futura: true`;
 *  - qualquer outra coisa → `invalida: true`.
 *
 * `inclusaoIso` é o iso já validado (não-futuro) da Data de Inclusão da linha, ou
 * null quando a inclusão não deu data — nesse caso o `dd/MMM` fica sem âncora de
 * ano e é marcado inválido (a linha cai no aviso `sem_data_entrada` se nada sobrar).
 */
export function resolverDataEntrega(
  raw: string | null | undefined,
  inclusaoIso: string | null,
  hoje: string,
): ParseDataResult {
  const t = (raw ?? '').trim()
  if (DATA_VAZIA.has(normalizarTexto(t))) {
    return { iso: null, invalida: false, futura: false }
  }
  // `dd/MM/aaaa` completa → mesma régua da F4/F7.
  if (/^\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4}$/.test(t)) {
    return parseData(t, hoje)
  }
  // `dd/MMM` (mês abreviado, ponto final opcional).
  const abrev = t.match(/^(\d{1,2})\s*\/\s*([A-Za-zÀ-ÿ]{3,4})\.?$/)
  if (abrev) {
    const mes = MESES_ABREV[normalizarTexto(abrev[2]!)]
    if (mes === undefined) return { iso: null, invalida: true, futura: false }
    if (inclusaoIso === null) return { iso: null, invalida: true, futura: false }
    const dia = Number(abrev[1])
    const anoInclusao = Number(inclusaoIso.slice(0, 4))
    const mesInclusao = Number(inclusaoIso.slice(5, 7))
    const diaInclusao = Number(inclusaoIso.slice(8, 10))
    // Virada de ano: entrega antes da inclusão no calendário → ano seguinte.
    const ano =
      mes < mesInclusao || (mes === mesInclusao && dia < diaInclusao)
        ? anoInclusao + 1
        : anoInclusao
    // Valida dia/mês reais (rejeita 31/fev, 30/fev etc.).
    const d = new Date(Date.UTC(ano, mes - 1, dia))
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
      return { iso: null, invalida: true, futura: false }
    }
    const iso = `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    return { iso, invalida: false, futura: iso > hoje }
  }
  return { iso: null, invalida: true, futura: false }
}

// ---------------------------------------------------------------------------
// Service tag

/** Service tag: aparada, quebras de linha internas removidas; vazio-na-prática → null. */
export function normalizarServiceTag(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (t === '' || VAZIOS.has(normalizarTexto(t))) return null
  return t
}

/** Chave de comparação de tag (caixa/espaços não distinguem tags) — espelha o
 *  `coalesce(service_tag,'')` do índice único do banco. */
export function chaveServiceTag(tag: string | null): string {
  return tag ? tag.toUpperCase().replace(/\s+/g, '') : ''
}

// ---------------------------------------------------------------------------
// Campos auxiliares

/** Extrai nº de chamado do GLPI ("Chamado 6766" → "6766"; "SIM"/"Não"/sem dígito → null). */
export function extrairChamado(raw: string | null | undefined): string | null {
  const limpo = limparCampo(raw)
  if (!limpo) return null
  const semPrefixo = limpo.replace(/^chamados?\s*:?\s*/i, '').trim()
  if (!/\d{3,}/.test(semPrefixo)) return null
  return semPrefixo
}

/**
 * Coluna Colaborador do inventário. A F7 §3 diz "com setor se o texto trouxer" —
 * quando vem "Nome / Setor", separa; senão o texto inteiro é o colaborador.
 */
export function parseColaboradorInventario(raw: string | null | undefined): {
  colaborador: string | null
  setor: string | null
} {
  const limpo = limparCampo(raw)
  if (!limpo) return { colaborador: null, setor: null }
  const partes = limpo.split('/').map((p) => p.trim()).filter((p) => p !== '')
  if (partes.length === 0) return { colaborador: null, setor: null }
  return { colaborador: partes[0] ?? null, setor: partes[1] ?? null }
}

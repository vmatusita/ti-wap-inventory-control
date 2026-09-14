// Funções PURAS do import de startup (OS-F7 / W1) que NÃO dependem de
// vocabulário — normalização de texto, datas, service tag, patrimônio
// "vazio-na-prática" e o extrator de patrimônio embutido no hostname. Extraídas
// e adaptadas de `scripts/import/normalizar.ts` (motor da carga única F4) para
// código de produção testável. Nada aqui toca banco/UI.
//
// F56 · Frente D (segunda metade, Decisão 3 do PLAN-F56.md) — o vocabulário
// De→Para (unidades, categoria, situação, prefixos de patrimônio) SAIU deste
// arquivo: ele mora no banco (migration 0139) e vira dado (`VocabularioImport`,
// `./vocabulario.ts`), passado ao motor por PARÂMETRO. O que fica aqui é o que
// não depende de vocabulário nenhum: `normalizarTexto`/`normalizarHeader`,
// `limparCampo`, `modeloSemMarca`, `patrimonioVazio`, `extrairPatrimonioDoHostname`
// (recebe os prefixos por parâmetro — a REGRA de formato do hostname não é
// vocabulário, só a LISTA de prefixos válidos é), as datas (`parseData`/
// `resolverDataEntrega`/`hojeIso`), service tag e os campos auxiliares.
// Os scripts da F4 permanecem intocados (ferramenta histórica do go-live).

import {
  canonicalizarPatrimonio,
  DIGITOS_PATRIMONIO,
  PREFIXO_PATRIMONIO_FONTE,
} from '@/lib/patrimonio'
import { hojeISO } from '@/lib/format'

// ---------------------------------------------------------------------------
// Texto

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

/** minúsculas, sem acento, sem `:` final, espaços colapsados — base do De→Para. */
export function normalizarTexto(raw: string): string {
  return raw
    .normalize('NFD')
    // Faixa U+0300–U+036F (marcas diacríticas combinantes). Construída por
    // RegExp(string), como em `lib/ajuda/busca.ts`, para não depender de bytes
    // literais no fonte: a faixa escrita crua numa regex literal é invisível no
    // diff e já virou mojibake neste projeto quando o arquivo passou por
    // ferramenta que não preservou UTF-8 — e o estrago só apareceria em texto
    // acentuado, longe daqui.
    .replace(DIACRITICOS, '')
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

// F7K (Johnny 20/07/2026): o modelo às vezes REPETE a marca no início (`marca=HP`,
// `modelo=HP Pro SFF 280 G9`) → o rótulo marca+modelo saía "HP HP Pro SFF 280 G9". Aqui
// o modelo perde a marca-prefixo (palavra INTEIRA, caixa-insensível) → "Pro SFF 280 G9",
// e o rótulo vira "HP Pro SFF 280 G9". Casos reais: HP/Iphone/Dell/Motorola. Nunca toca
// o meio do texto (só o início) nem inventa nada; se o modelo é SÓ a marca, vira null.
/** Modelo sem a marca repetida no início (evita "HP HP …"). null se sobrar vazio. */
export function modeloSemMarca(
  marca: string | null | undefined,
  modelo: string | null | undefined,
): string | null {
  const mod = (modelo ?? '').replace(/\s+/g, ' ').trim()
  const mar = (marca ?? '').replace(/\s+/g, ' ').trim()
  if (mod === '') return null
  if (mar === '') return mod
  const modL = mod.toLowerCase()
  const marL = mar.toLowerCase()
  if (modL === marL) return null // o modelo é só a marca
  if (modL.startsWith(marL + ' ')) return mod.slice(mar.length).trim() || null
  return mod
}

// F7E (OS §2.2) — patrimônio "vazio na prática". Amplia `VAZIOS` com os dizeres
// explícitos "sem patrimônio". Diferente da F7: aqui o vazio NÃO bloqueia — o ativo
// importa com patrimônio NULO e pendência "sem patrimônio físico" (spec §10.2). A
// comparação é sempre via `normalizarTexto`, então "SEM PATRIMÔNIO" (com acento e
// caixa alta) cai na mesma chave `sem patrimonio`; `""`, `-`, `n/a`, `0`, `x`… vêm
// de `VAZIOS`. NÃO mexe em `canonicalizarPatrimonio` — nenhum patrimônio canônico
// ([A-Z]{2,4}\d{7}) está neste conjunto, então nada real vira nulo por engano.
const PATRIMONIO_VAZIO = new Set<string>([
  ...VAZIOS,
  'sem patrimonio',
  // F7-pós (Johnny, 20/07/2026): mais dizeres exatos de ausência de plaqueta que
  // apareceram na planilha real — abreviações e frases curtas. Redundam com a
  // FAMILIA_SEM_PATRIMONIO abaixo (defesa em profundidade + documentam a intenção).
  's/n', 's/pat', 'sn', 'n/i', 'n/t', 'ni', 'nt', 'nd',
  'nao possui', 'nao tem', 'nao ha', 'nao informado', 'nao consta',
  'nao aplica', 'nao aplicavel', 'nao identificado', 'nao localizado',
  'nenhum', 'nenhuma', 'nada', 'inexistente', 'ausente',
  'vazio', 'em branco', 'branco', 'indefinido', 'sem info', 'sem informacao',
])

// F7F+ (Johnny, 20/07/2026) e F7-pós (Johnny, 20/07/2026 — AMPLIADO): variantes
// textuais de "sem patrimônio" que caíam como `patrimonio_invalido` (bloqueante,
// mensagem "fora do formato canônico (ex.: WAP0004491)"), travando o import. O Johnny
// pediu: TUDO que DECLARE ausência de plaqueta importa VAZIO (pendência), não bloqueia
// nem exibe a mensagem de formato. Cobre as formas PRODUTIVAS (não só uma lista fixa):
//   · "sem <algo>" com separador (sem plaqueta/serial/tag/número de série…) e a forma
//     colada `sempat`/`semplaqueta`… (lista fechada p/ NÃO pegar "semaforo"/"semana");
//   · "s/<algo>" abreviado (s/pat, s/n, s/série…), "n/i"/"n/t" (não informado/tem);
//   · "não <possui|tem|consta|informado|localizado|identificado|existe|aplica…>";
//   · palavras de ausência isoladas (nenhum, nada, inexistente, ausente, indefinido…).
// O que NÃO muda (decisão 5, régua da F7): só-números e códigos COM dígito (`12345`,
// `3652`) e lixo SEM declaração de ausência (`ABC`, `WAPalmaq-teste`, `semaforo`) SEGUEM
// BLOQUEANDO — podem ser patrimônio mistypado e o operador tem de ver.
const FAMILIA_SEM_PATRIMONIO = new RegExp(
  '^(?:' +
    // "sem <algo>" com separador (espaço, ., /, -): sem plaqueta/serial/tag/numero…
    'sem[\\s./-]+\\S' +
    // "sem<algo>" colado — lista FECHADA p/ não pegar "semaforo"/"semana"/"semear".
    '|sem(?:pat|plaqueta|placa|etiqueta|numero|num|nro|serie|serial|tag|registro|tombo|tombamento|identif|info|dado|nada)' +
    // "s/<algo>" abreviado. Palavras longas casam por PREFIXO (s/patrimonio → s/pat);
    // as curtas/ambíguas (n, nr, nro) exigem \b p/ não engolir "s/nome" etc.
    '|s[./]\\s*(?:pat|plaqueta|placa|etiqueta|numero|serie|serial|registro|tag|info|dado|num|n\\b|nr\\b|nro\\b)' +
    // "n/i", "n.t"… (não informado / não tem).
    '|n[./][it]\\b' +
    // "nao <possui|tem|consta|informado|localizado|identificado|existe|aplica…>".
    '|nao\\s*(?:possui|tem|ha|houve|informad|consta|identific|localiz|existe|contem|aplica|encontrad)' +
    // palavras de ausência isoladas.
    '|(?:nenhum|nada|inexistente|indefinid|indeterminad|desconhecid|ausente)\\b' +
    ')',
)

// Só símbolos/pontuação (após normalizar → sem letra a-z nem dígito): `--`, `...`,
// `???`, `//`, `*`… — indicam "sem valor". Vazio-real ('') já cai em VAZIOS.
const PATRIMONIO_SO_SIMBOLOS = /^[^a-z0-9]+$/

/** Patrimônio "vazio na prática" (F7E; família ampliada na F7F e na F7-pós)? true →
 *  importa nulo (pendência), não bloqueia nem mostra "fora do formato". Reconhece o
 *  conjunto exato + só-símbolos + a família produtiva de "declaração de ausência". A
 *  guarda `canonicalizarPatrimonio(...) === null` blinda contra tratar um patrimônio
 *  VÁLIDO como vazio (ex.: `SEM0001234`, `SEM-0001234` → seguem patrimônio). */
export function patrimonioVazio(raw: string | null | undefined): boolean {
  const norm = normalizarTexto(raw ?? '')
  if (norm === '' || PATRIMONIO_VAZIO.has(norm) || PATRIMONIO_SO_SIMBOLOS.test(norm)) {
    return true
  }
  return FAMILIA_SEM_PATRIMONIO.test(norm) && canonicalizarPatrimonio(raw ?? '') === null
}

// F7F (decisão do Johnny, 17/07/2026 — REVOGA a não-inferência por hostname de 16/07) +
// F7-pós (Johnny 20/07/2026): procura no HOSTNAME um patrimônio embutido — ex.:
// `NB-WAP0001234` → `WAP0001234`, `NB-PRO3694` → `PRO0003694`. O token é PREFIXO (2–4
// letras) + 1–7 DÍGITOS, delimitado e NÃO seguido de dígito (8+ dígitos = ambíguo →
// ignora). Duas travas contra falso positivo: (1) o prefixo tem de estar entre os
// `prefixos` recebidos por parâmetro (senão `PC-01`/`SALA-5` virariam patrimônio); (2) o
// token passa por `canonicalizarPatrimonio`, que completa os zeros (`PRO3694`→
// `PRO0003694`) — o juiz final do valor (contrato §1.5), que NÃO muda. `matchAll` (flag
// `g`) pula tokens de prefixo DESCONHECIDO e acha o 1º com prefixo de patrimônio (ex.:
// `PC01-WAP0001234` → `WAP0001234`). Fica em deparas.ts (folha client-safe) p/ o motor
// (plano.ts) E a UI usarem a MESMA régua — sem duplicar o extrator.
//
// F56 · Frente B (Decisão 5) — deriva do MESMO prefixo de `@/lib/patrimonio`
// (`PREFIXO_PATRIMONIO_FONTE`), mas com a quantificação `{1,DIGITOS_PATRIMONIO}`
// EXPLÍCITA aqui, e não `{DIGITOS_PATRIMONIO}` fixo. É a divergência deliberada
// documentada acima ("aceitar <7 dígitos e travar por prefixo conhecido") — o
// hostname pode embutir um patrimônio com MENOS de 7 dígitos
// (`PRO3694`→`PRO0003694`), diferente da canônica e da faixa, que exigem os 7.
//
// F56 · Frente D (segunda metade) — `prefixos` chega por PARÂMETRO
// (`VocabularioImport.prefixosPatrimonio`, `./vocabulario.ts`): a LISTA de
// prefixos válidos é vocabulário administrado (migration 0139); a REGRA de
// formato (2–4 letras + dígitos) não é — fica aqui, ao lado da regex que a usa.
const PATRIMONIO_EMBUTIDO_RE = new RegExp(
  `(?:^|[^A-Z0-9])(${PREFIXO_PATRIMONIO_FONTE})(\\d{1,${DIGITOS_PATRIMONIO}})(?![0-9])`,
  'g',
)

export function extrairPatrimonioDoHostname(
  hostname: string | null | undefined,
  prefixos: readonly string[],
): string | null {
  const h = (hostname ?? '').toUpperCase()
  for (const m of h.matchAll(PATRIMONIO_EMBUTIDO_RE)) {
    if (prefixos.includes(m[1]!)) {
      return canonicalizarPatrimonio(m[1]! + m[2]!)
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Datas — espelho EXATO da F4: só `dd/mm/aaaa` (ano 4 dígitos). dd/MM/yy e
// serial Excel NÃO são aceitos (a F4 não os aceitava — "espelhe exatamente").

export type ParseDataResult = { iso: string | null; invalida: boolean; futura: boolean }

/** Hoje no formato `yyyy-MM-dd` que `parseData` compara para "não futura".
 *  FONTE ÚNICA (era duplicado byte a byte no motor `plano.ts`, no Zod `validators/
 *  importar.ts` e no cérebro dos botões `ops-grupo.ts`): a régua "data não futura"
 *  depende de os chamadores concordarem sobre "hoje".
 *
 *  NO FUSO DE SÃO PAULO, delegando ao `hojeISO` de `@/lib/format` (dívida técnica,
 *  item J — 24/07/2026). Antes montava a data com `new Date()` + getFullYear/Month/
 *  Date, ou seja, o fuso LOCAL DE QUEM EXECUTA — e os dois lados desta mesma régua
 *  executam em fusos diferentes: `ops-grupo.ts` e o wizard rodam no NAVEGADOR (BRT),
 *  enquanto `validators/importar.ts` roda como Server Action na Vercel (UTC). Entre
 *  21:00 e 23:59 BRT o servidor já está no dia seguinte: a mesma planilha, com uma
 *  data de amanhã, era barrada como "data futura" no preview e ACEITA na gravação.
 *  Um só relógio — o do negócio — resolve os dois lados. */
export function hojeIso(): string {
  return hojeISO()
}

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

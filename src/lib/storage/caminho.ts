// =============================================================================
// caminho.ts — a FUNÇÃO ÚNICA que monta caminho no bucket `backups-import` (F67B, 16/11/2026)
// =============================================================================
// Desde a F67B o bucket `backups-import` decide pela EMPRESA DO CAMINHO: as policies de `storage.objects` leem o 2º
// segmento (`<família>/empresa-<uuid>/…`) pela função SQL `empresa_do_caminho_backup`, e só o admin daquela empresa
// alcança o objeto (docs/PLAN-F67B.md §2, decisões 1 a 3). Um caminho sem a empresa nasce invisível para todos — ou,
// pior, numa forma ANTIGA, que a cláusula legada (decisão 16/11-1 do Johnny) deixa o admin da WAP ler.
//
// Por isso TODO caminho do bucket sai daqui, e toda função que monta caminho exige a empresa EXPLÍCITA, em uuid
// minúsculo (o que o banco devolve): sem empresa, ela LANÇA — nunca devolve string sem o segmento. A única exceção é a
// raiz da ferramenta de órfão (`orfao/<carimbo>`), que de propósito NÃO tem empresa: um `.docx` sem linha não é de
// empresa nenhuma, e a raiz só é alcançada pelo service role (decisão 9).
//
// O ESPELHO SQL tem as MESMAS formas: `FORMAS_NOVAS` = as quatro regexes de `empresa_do_caminho_backup` (0194),
// `FORMAS_ANTIGAS` + `FAMILIAS_RESERVADAS` = as de `caminho_backup_legado` (a cláusula legada FECHADA), e os
// `prefixo*` = os `prefixo_backup_*` novos. `caminho.test.ts` §3 confere byte a byte contra o corpo VIGENTE, e §4
// varre `src/**` e `scripts/**` atrás de quem monte caminho do bucket por fora daqui.
//
// Módulo PURO (sem `server-only`, sem I/O): é string e regex. Quem grava é o chamador, com o client dele.
// =============================================================================

const U = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID = new RegExp(`^${U}$`)
const UUID_QUALQUER = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const CARIMBO = /^[^/]+$/
const DIGEST = /^[0-9a-f]{32}$/

/** As quatro formas NOVAS (com as cópias de `.docx` sob `<raiz>/termos/`), o grupo 1 é a empresa — espelho exato da 0194. */
export const FORMAS_NOVAS: readonly string[] = [
  `^import/empresa-(${U})/filial-[0-9]+/[^/]+(\\.json|/termos/[^/]+)$`,
  `^reset/empresa-(${U})/(acervo|itens)/(tudo|filial-[0-9]+)/[^/]+(\\.json|/termos/[^/]+)$`,
  `^conflito/empresa-(${U})/[0-9a-f]{32}/([^/]+\\.json|termos/[^/]+)$`,
  `^ativo/empresa-(${U})/[0-9a-fA-F-]{36}/termos/[^/]+$`,
]

/**
 * A CLÁUSULA LEGADA FECHADA (decisão 16/11-1): as formas ANTIGAS que existem ou existiram — o import por filial, o reset
 * global/por filial, o conflito por digest, a cópia do apagar ativo, e a histórica `<slug>/<carimbo>.json` (cujo 1º
 * segmento não pode ser uma família reservada). Espelho exato de `caminho_backup_legado` (0194).
 */
export const FORMAS_ANTIGAS: readonly string[] = [
  `^import/filial-[0-9]+/[^/]+(\\.json|/termos/[^/]+)$`,
  `^reset/(acervo|itens)/(global|filial-[0-9]+)/[^/]+(\\.json|/termos/[^/]+)$`,
  `^conflito/[0-9a-f]{32}/([^/]+\\.json|termos/[^/]+)$`,
  `^ativo/[0-9a-fA-F-]{36}/termos/[^/]+$`,
  `^[a-z0-9][a-z0-9-]*/[^/]+\\.json$`,
]

/** O 1º segmento que a forma histórica NÃO pode ter (as famílias do bucket). */
export const FAMILIAS_RESERVADAS = '^(import|reset|conflito|ativo|orfao)/'

const RE_NOVAS = FORMAS_NOVAS.map((f) => new RegExp(f))
const RE_ANTIGAS = FORMAS_ANTIGAS.map((f) => new RegExp(f))
const RE_RESERVADAS = new RegExp(FAMILIAS_RESERVADAS)

function exigirEmpresa(empresaId: string): string {
  if (typeof empresaId !== 'string' || !UUID.test(empresaId)) {
    throw new Error('caminho de backup: a empresa tem de ser um uuid minúsculo — nenhum caminho sai sem a empresa.')
  }
  return empresaId
}

function exigirFilial(filialId: number): number {
  if (!Number.isInteger(filialId) || filialId < 1 || filialId > 32767) {
    throw new Error('caminho de backup: filial inválida.')
  }
  return filialId
}

function exigirCarimbo(carimbo: string): string {
  if (typeof carimbo !== 'string' || !CARIMBO.test(carimbo)) throw new Error('caminho de backup: carimbo inválido.')
  return carimbo
}

/** O carimbo dos arquivos: o ISO sem `:` nem `.` (24 caracteres) — o mesmo de antes da F67B. */
export function carimboDeArquivo(agora: Date = new Date()): string {
  return agora.toISOString().replace(/[:.]/g, '-')
}

/** `import/empresa-<uuid>/filial-<id>/` — espelho de `prefixo_backup_import(uuid, smallint)`. */
export function prefixoBackupImport(empresaId: string, filialId: number): string {
  return `import/empresa-${exigirEmpresa(empresaId)}/filial-${exigirFilial(filialId)}/`
}

/** O JSON do backup do import (o acervo da filial, antes de a RPC apagá-lo). */
export function caminhoBackupImport(empresaId: string, filialId: number, carimbo: string): string {
  return `${prefixoBackupImport(empresaId, filialId)}${exigirCarimbo(carimbo)}.json`
}

/**
 * `reset/empresa-<uuid>/<bloco>/<tudo|filial-N>/` — espelho de `prefixo_backup_reset(uuid, text, smallint)`. O "tudo"
 * (filial nula) é a EMPRESA inteira desde a F67 — por isso `tudo`, e não mais `global`.
 */
export function prefixoBackupReset(empresaId: string, bloco: 'acervo' | 'itens', filialId: number | null): string {
  if (bloco !== 'acervo' && bloco !== 'itens') throw new Error('caminho de backup: bloco do reset inválido.')
  const alcance = filialId === null ? 'tudo' : `filial-${exigirFilial(filialId)}`
  return `reset/empresa-${exigirEmpresa(empresaId)}/${bloco}/${alcance}/`
}

/** O JSON do backup do reset. */
export function caminhoBackupReset(
  empresaId: string,
  bloco: 'acervo' | 'itens',
  filialId: number | null,
  carimbo: string,
): string {
  return `${prefixoBackupReset(empresaId, bloco, filialId)}${exigirCarimbo(carimbo)}.json`
}

/** `conflito/empresa-<uuid>/` — espelho de `prefixo_backup_conflito(uuid)`. */
export function prefixoBackupConflito(empresaId: string): string {
  return `conflito/empresa-${exigirEmpresa(empresaId)}/`
}

/** A raiz das cópias e do JSON da mesa de conflitos: `conflito/empresa-<uuid>/<digest da seleção>`. */
export function raizDoConflito(empresaId: string, digest: string): string {
  if (!DIGEST.test(digest)) throw new Error('caminho de backup: digest da seleção inválido.')
  return `${prefixoBackupConflito(empresaId)}${digest}`
}

/** O JSON do backup da mesa de conflitos (acima do teto do backup inline). */
export function caminhoBackupConflito(empresaId: string, digest: string, carimbo: string): string {
  return `${raizDoConflito(empresaId, digest)}/${exigirCarimbo(carimbo)}.json`
}

/**
 * A raiz das cópias de `.docx` do apagar ativo: `ativo/empresa-<uuid>/<id do ativo>`. A ação não tem JSON (o backup é
 * jsonb inline no evento `ativo_apagado`); a 12ª checagem reconhece a cópia pelo id do ativo do evento.
 */
export function raizDoAtivo(empresaId: string, ativoId: string): string {
  if (!UUID_QUALQUER.test(ativoId)) throw new Error('caminho de backup: id do ativo inválido.')
  return `ativo/empresa-${exigirEmpresa(empresaId)}/${ativoId}`
}

/**
 * A raiz das cópias de um backup EM ARQUIVO: o caminho do JSON sem a extensão. Só sai de um JSON na forma NOVA — um
 * backup antigo não gera cópia nova sem a empresa.
 */
export function raizDoBackupEmArquivo(caminhoJson: string): string {
  if (!caminhoJson.endsWith('.json') || empresaDoCaminhoBackup(caminhoJson) === null) {
    throw new Error('caminho de backup: a raiz das cópias só sai de um backup na forma nova (com a empresa).')
  }
  return caminhoJson.replace(/\.json$/, '')
}

/**
 * A RAIZ DA FERRAMENTA DE ÓRFÃO — a única sem empresa, de propósito (decisão 9 do PLAN-F67B): `orfao/<carimbo>`. Um
 * `.docx` sem linha não é de empresa nenhuma; a raiz não casa nem a forma nova nem a antiga, então nenhuma sessão a
 * alcança — só o service role. A 12ª checagem reconhece a cópia pela trilha `termos_sem_linha_limpos`.
 */
export function raizDoOrfao(carimbo: string): string {
  return `orfao/${exigirCarimbo(carimbo)}`
}

/** O prefixo das cópias de `.docx` sob uma raiz (nova, ou a do órfão): `<raiz>/termos/`. */
export function prefixoDasCopias(raiz: string): string {
  const doOrfao = /^orfao\/[^/]+$/.test(raiz)
  if (!doOrfao && empresaDoCaminhoBackup(`${raiz}/termos/x.docx`) === null) {
    throw new Error('caminho de backup: a raiz das cópias tem de estar na forma nova (com a empresa) ou ser a do órfão.')
  }
  return `${raiz}/termos/`
}

/** A empresa DONA de um caminho de `backups-import` (forma nova), ou `null` fora delas — espelho de `empresa_do_caminho_backup`. */
export function empresaDoCaminhoBackup(nome: string): string | null {
  for (const re of RE_NOVAS) {
    const m = re.exec(nome)
    if (m) return m[1]
  }
  return null
}

/** Verdadeira SÓ nas formas antigas da lista fechada — espelho de `caminho_backup_legado`. */
export function caminhoBackupLegado(nome: string): boolean {
  if (typeof nome !== 'string') return false
  if (RE_ANTIGAS.slice(0, 4).some((re) => re.test(nome))) return true
  return RE_ANTIGAS[4].test(nome) && !RE_RESERVADAS.test(nome)
}

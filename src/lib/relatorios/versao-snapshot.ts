import { formatDate, ouTraco } from '@/lib/format'
import { SLUG_CONSOLIDADO } from '@/lib/unidades/slugs'

// F29/REL-04 — o que o operador precisa saber ANTES de congelar um snapshot, e o
// que o sistema faz quando dois operadores clicam ao mesmo tempo. Funções PURAS
// (sem banco, sem React) para o texto e a detecção ficarem travados por teste.

export type VersaoExistente = {
  versao: number
  autorNome: string | null
  geradoEm: string // ISO do timestamptz
}

// Aviso do box de confirmação. Antes, quem regerava um período descobria que
// tinha criado a v3 só pelo toast, DEPOIS do fato consumado.
export function mensagemVersaoExistente(info: VersaoExistente | null): string | null {
  if (!info) return null
  return (
    `Já existe a v${info.versao} deste período, gerada por ${ouTraco(info.autorNome)} ` +
    `em ${formatDate(info.geradoEm)} — você criará a v${info.versao + 1}.`
  )
}

// A versão é `max(versao) + 1` lido numa consulta e gravado noutra. Entre as duas
// cabe outro operador — mas o BANCO já recusa o empate desde a migration 0013:
// `unique (periodo_de, periodo_ate, filial_id, versao)` (0010) mais o índice
// `relatorios_gerados_periodo_filial_versao_uidx` sobre `coalesce(filial_id, -1)`,
// que é o que cobre o consolidado (no Postgres, NULL não colide com NULL).
//
// Ou seja: nunca houve duplicata silenciosa. O que havia era PERDA — o segundo
// operador levava um erro traduzido genérico e o snapshot recém-montado (uma
// reconstrução as-of cara) ia embora junto. Detectar a violação e renumerar é o
// conserto certo, e dispensa migration.
//
// O código 23505 é o unique_violation do Postgres; a mensagem é a segunda pista
// porque nem todo caminho do PostgREST preserva o `code`.
export function ehViolacaoDeVersao(
  code: string | null | undefined,
  message: string | null | undefined,
): boolean {
  if (code === '23505') return true
  const m = (message ?? '').toLowerCase()
  return (
    m.includes('relatorios_gerados_periodo_filial_versao_uidx') ||
    (m.includes('duplicate key') && m.includes('relatorios_gerados'))
  )
}

// A CHAVE DA UNICIDADE DE VERSÃO — espelho, em TypeScript, da `unique (periodo_de, periodo_ate,
// filial_id, versao)` da 0010 e do índice `relatorios_gerados_periodo_filial_versao_uidx` da 0013,
// MENOS a versão: é por ela que a lista de `/relatorios/gerados` sabe qual snapshot superou qual (a
// badge "superada", F29/REL-05b). O consolidado (`filial_id is null`) vira o slug do Consolidado
// — o mesmo papel do `coalesce(filial_id, -1)` do índice: dar ao NULL uma chave concreta.
//
// Até a F57 ela vivia privada em `queries/gerados.ts`, sem trava nenhuma. Agora mora aqui, ao lado
// de `ehViolacaoDeVersao`, e `chave-versao-sql.test.ts` a confere contra o SQL LIDO DO DISCO.
//
// ⚠ O LAÇO QUE A F65 HERDA: quando a unique do snapshot ganhar `empresa_id` (e o índice for
// recriado), duas coisas quebram JUNTAS e têm de mudar no mesmo commit — esta chave (senão o
// consolidado da empresa A e o da B produzem a mesma chave e uma versão "supera" a outra) e o
// casamento pelo NOME do índice em `ehViolacaoDeVersao`, logo acima (senão a renumeração da F29
// perde a segunda pista). A F57 só registra; o conserto é da F65.
export function chaveVersao(periodoDe: string, periodoAte: string, filialId: number | null): string {
  return `${periodoDe}|${periodoAte}|${filialId ?? SLUG_CONSOLIDADO}`
}

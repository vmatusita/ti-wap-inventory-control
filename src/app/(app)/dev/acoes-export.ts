'use server'

import { createClient } from '@/lib/supabase/server'
import { exigirDev, type DbClient } from '@/lib/auth/acesso'
import { formatDateTime, hojeISO } from '@/lib/format'
import {
  BLOCO_EXPORT,
  CAP_EXPORT,
  MAX_BLOCOS_EXPORT,
  gerarCsv,
  nomeArquivoCsv,
  type ColunaCsv,
} from '@/lib/csv'
import { eAcaoAdmin, rotuloAcao } from '@/lib/auditoria'
import type { FiltrosEventos } from '@/lib/queries/eventos-admin'
import { descreverDetalhe } from '@/components/admin/usuarios/detalhe-evento'
import { listarFiliaisParaVinculo } from '@/lib/queries/admin'
import type { ResultadoExportCsv } from '@/lib/actions/exportar'
import type { Json } from '@/lib/types/database'

// Export CSV da TRILHA DE AUDITORIA — só do cargo Desenvolvedor (F22).
//
// ⚠⚠ A GUARDA AQUI É `exigirDev`, e NÃO a de `src/lib/actions/exportar.ts`. Lá a guarda é
// `exigirPapel(supabase, 'consulta')` — o PISO da hierarquia — porque exportar uma LISTA
// OPERACIONAL é leitura, e leitura é ampla para todo logado (ADR-001/ADR-002). A trilha
// administrativa é outra coisa: `eventos_admin` tem uma única policy de SELECT,
// `using (e_admin())`, e traz e-mails, mudanças de cargo e o que foi apagado por quem.
// Reaproveitar a guarda de lá abriria a trilha inteira para qualquer pessoa logada por
// request direto à action — o RLS ainda recusaria (a leitura é pelo client de SESSÃO), mas
// a mensagem sairia como "falha ao exportar" em vez de "sem permissão", e um refactor futuro
// que trocasse o client pelo administrativo transformaria o descuido em vazamento.
//
// ⚠ ARQUIVO 'use server': só EXPORTA função async. Nada de `export const`, `export type { X }`
// nem `export *` — o incidente F13 matou toda a escrita em produção por causa de um
// `export type {}`. Os helpers abaixo são de módulo, não exportados; o tipo do retorno vem
// por `import type` de `@/lib/actions/exportar`, que é onde `ResultadoExportCsv` já mora.
// O guarda `src/lib/use-server-exports.test.ts` derruba `npm test` se alguém esquecer.

/** Prefixo do arquivo: `auditoria-2026-07-30.csv`. */
const PREFIXO = 'auditoria'

// `quando` é timestamptz e o filtro é por DIA: o fim tem de cobrir o dia inteiro, daí
// `< dia seguinte` em vez de `<= dia` (que cortaria tudo depois de 00:00:00 do último dia).
// Mesma conta de `src/lib/queries/eventos-admin.ts`.
function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

type LinhaAuditoria = {
  quando: string
  acao: string
  alvo: string | null
  detalhe: Json | null
  autorNome: string | null
}

type RawLinha = {
  id: string
  quando: string
  acao: string
  alvo: string | null
  detalhe: Json | null
  autor: { nome: string | null } | null
}

const VAZIO: ResultadoExportCsv = {
  nome: '',
  conteudo: '',
  total: 0,
  exportadas: 0,
  truncado: false,
}

function falha(erro: string): ResultadoExportCsv {
  return { ...VAZIO, erro }
}

// As colunas espelham a tabela da tela (`AuditoriaTabela`) — inclusive o "Detalhe" já
// traduzido para pt-BR por `descreverDetalhe`, para o arquivo não sair com jsonb cru.
function colunas(nomeFilial: (id: number) => string): ColunaCsv<LinhaAuditoria>[] {
  return [
    { titulo: 'Quando', valor: (l) => formatDateTime(l.quando) },
    { titulo: 'Ação', valor: (l) => rotuloAcao(l.acao) },
    { titulo: 'Sobre', valor: (l) => l.alvo },
    { titulo: 'Detalhe', valor: (l) => descreverDetalhe(l.acao, l.detalhe, nomeFilial) },
    // Autor nulo = o perfil foi removido DEPOIS do evento. A trilha sobrevive à exclusão da
    // conta (migration 0065) e a célula tem de dizer isso, não ficar vazia.
    { titulo: 'Quem fez', valor: (l) => l.autorNome ?? 'usuário removido' },
  ]
}

// Lê a trilha inteira (até o cap) em BLOCOS. Não usa `listarEventosAdmin` porque aquela
// função pagina para a TELA (pageSize ≤ 100): puxar 5.000 linhas por lá custaria 50 idas ao
// banco. A ordem e o filtro são os MESMOS, para o arquivo bater com a tela.
//
// O laço avança pelo que REALMENTE chegou, nunca pelo que foi pedido: o Max Rows do
// PostgREST corta o request maior EM SILÊNCIO, e um passo fixo pararia no primeiro bloco
// truncado. Mesma disciplina de `listarAtivosParaExport`.
async function lerTrilha(
  supabase: DbClient,
  f: FiltrosEventos,
): Promise<{ linhas: LinhaAuditoria[]; total: number }> {
  const linhas: LinhaAuditoria[] = []
  let total = 0
  let offset = 0

  for (let volta = 0; volta < MAX_BLOCOS_EXPORT && offset < CAP_EXPORT; volta += 1) {
    const ate = Math.min(offset + BLOCO_EXPORT, CAP_EXPORT) - 1
    // `count: 'exact'` só no 1º bloco: o total não muda entre os blocos e a contagem exata
    // custa uma varredura a cada request.
    let q = supabase
      .from('eventos_admin')
      .select(
        'id, quando, acao, alvo, detalhe, autor:profiles!eventos_admin_autor_fkey(nome)',
        volta === 0 ? { count: 'exact' } : undefined,
      )
    // Os MESMOS recortes da tela — se o arquivo trouxesse outro conjunto de linhas, o
    // export deixaria de ser "o que estou vendo" e viraria uma segunda verdade.
    if (f.acao) q = q.eq('acao', f.acao)
    if (f.autor) q = q.eq('autor', f.autor)
    if (f.de) q = q.gte('quando', `${f.de}T00:00:00`)
    if (f.ate) q = q.lt('quando', `${diaSeguinte(f.ate)}T00:00:00`)
    // `%` e `_` são curingas do LIKE: escapados para uma busca por "a_b" não virar "a<algo>b".
    if (f.alvo) q = q.ilike('alvo', `%${f.alvo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)

    // `id` desempata: dois eventos podem cair no mesmo microssegundo (convite + auditoria em
    // lote) e, sem ordem total, o bloco seguinte repetiria/pularia linhas.
    const { data, error, count } = await q
      .order('quando', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, ate)

    if (error) throw new Error(`Falha ao exportar a auditoria: ${error.message}`)
    total = count ?? total

    const bloco = (data ?? []) as unknown as RawLinha[]
    for (const l of bloco) {
      linhas.push({
        quando: l.quando,
        acao: l.acao,
        alvo: l.alvo,
        detalhe: l.detalhe,
        autorNome: l.autor?.nome ?? null,
      })
    }

    if (bloco.length === 0) break
    offset += bloco.length
    if (offset >= total) break
  }

  return { linhas, total }
}

// `filtros` é a query string da própria página (`?acao=…`), como nos demais exports: é o que
// garante que o arquivo traga exatamente as linhas visíveis. Reparsear aqui (em vez de
// receber um objeto pronto do cliente) mantém a validação no servidor — verbo fora do
// vocabulário de `src/lib/auditoria.ts` é IGNORADO, e não vira lista vazia sem explicação.
export async function exportarAuditoriaCSV(filtros: string): Promise<ResultadoExportCsv> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return falha(aut.erro)

  try {
    const p = new URLSearchParams(filtros)
    const bruto = p.get('acao')
    const texto = (v: string | null) => {
      const t = (v ?? '').trim()
      return t.length > 0 && t.length <= 120 ? t : null
    }
    const data = (v: string | null) => (v && /^d{4}-d{2}-d{2}$/.test(v) ? v : null)
    const recorte: FiltrosEventos = {
      acao: bruto && eAcaoAdmin(bruto) ? bruto : null,
      autor: texto(p.get('autor')),
      de: data(p.get('de')),
      ate: data(p.get('ate')),
      alvo: texto(p.get('alvo')),
    }

    const [{ linhas, total }, filiais] = await Promise.all([
      lerTrilha(supabase, recorte),
      listarFiliaisParaVinculo(),
    ])
    const nomeFilial = (id: number) =>
      filiais.find((f) => f.id === id)?.nome ?? `filial ${id}`

    return {
      nome: nomeArquivoCsv(PREFIXO, hojeISO()),
      conteudo: gerarCsv(colunas(nomeFilial), linhas),
      total,
      exportadas: linhas.length,
      // Sempre derivado de `exportadas < total` — nunca de `total > cap`. É o que mantém o
      // aviso correto seja qual for o Max Rows do PostgREST.
      truncado: linhas.length < total,
    }
  } catch (err) {
    console.error('[exportarAuditoriaCSV] falha ao exportar a auditoria:', err)
    return falha('Falha ao exportar a auditoria. Tente novamente.')
  }
}

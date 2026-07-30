'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exigirAdmin } from '@/lib/auth/acesso'
import { traduzErroBanco } from '@/lib/actions/erros'
import { ladosDosAtivos } from '@/lib/queries/conflitos'
// `import type` é permitido num módulo 'use server' — a regra da F13 proíbe EXPORTAR o que
// não é função async, não importar. O que nunca pode aparecer aqui é um `export type`.
import type { LadoConflito } from '@/lib/pendencias/conflitos'
import { resumoDaExclusao } from '@/lib/pendencias/conflitos'
import {
  PREFIXO_BACKUP_CONFLITO,
  apagarConflitoSchema,
  exigeBackupEmArquivo,
  validarExclusaoDeConflito,
} from '@/lib/validators/conflitos'

// Server Actions da MESA DE CONFLITOS entre filiais (F24).
//
// ⚠ ARQUIVO 'use server': só pode EXPORTAR funções async. Nada de `export const`,
// `export type { X }` ou `export *` — o incidente F13 (um `export type {}` num módulo
// 'use server') matou TODA a escrita em produção por horas. O guarda
// `src/lib/use-server-exports.test.ts` derruba `npm test` se alguém esquecer.
//
// ⚠ `exigirAdmin` AQUI NÃO É A SEGURANÇA — é a MENSAGEM em pt-BR. A trava é a RPC
// `apagar_ativos_conflito_filiais` (migration 0093), que confere `e_admin()` por dentro,
// revalida SOB LOCK que cada ativo está mesmo num grupo de conflito e recusa a operação
// inteira se um único id estiver fora. Um request forjado que pule esta action bate lá.
//
// ⚠ A TRILHA NÃO É ESCRITA AQUI. O evento `conflito_filiais_resolvido` é gravado DENTRO da
// RPC, na mesma transação da exclusão — mesma doutrina da F23 (cabeçalho da 0082): se a
// trilha falhar, nada é apagado. `registrarEventoAdmin` não serviria, porque engole o erro
// de propósito, e uma exclusão irreversível não pode ter trilha "melhor esforço".
//
// ⚠ NENHUM ATALHO FORA DA MESA (ordem §4.5): estas actions só são chamadas pela seção de
// conflitos de /pendencias. Nada na ficha do ativo, nas listas ou na paleta.

type ConflitoResult<T = undefined> =
  | { ok: true; aviso?: string; dados?: T }
  | { ok: false; erro: string }

// A exclusão mexe no acervo: as mesmas rotas que a Zona destrutiva revalida, mais a mesa.
const ROTAS = ['/', '/ativos', '/movimentacoes', '/pendencias', '/relatorios/geral']

function revalidar(): void {
  for (const r of ROTAS) revalidatePath(r)
}

/** Teto por chamada de `remove()`. A API de Storage aceita até 1000 chaves por requisição. */
const LOTE_REMOCAO = 500

/**
 * Remove os `.docx` do bucket `termos` DEPOIS do commit da RPC.
 *
 * Gêmeo de `limparArquivosDeTermo` (dev-destrutivo.ts), pelos MESMOS motivos, que valem
 * literalmente igual aqui:
 *
 * · Não é a RPC que faz isto porque `storage.objects` tem o trigger
 *   `protect_objects_delete` (BEFORE DELETE FOR EACH STATEMENT), que recusa toda exclusão
 *   de objeto por SQL. O caminho é a API de Storage, daqui.
 * · Usa o client ADMINISTRATIVO por conservadorismo: a RPC já apagou a linha, então o nome
 *   do arquivo não é mais referenciado por ninguém, e depender do fallback do predicado do
 *   bucket seria depender de um detalhe que existe por outro motivo.
 * · Falha aqui NÃO pode ser silenciosa: a linha já morreu e o arquivo vira órfão invisível.
 *   Volta como AVISO (não erro — não há o que reverter) e a 8ª checagem da /dev passa a
 *   contá-lo.
 * · O `data` de `remove()` é CONFERIDO, e não só o `error`: a API responde 200 com a lista
 *   do que realmente saiu, então uma remoção parcial não levanta erro nenhum.
 */
async function limparArquivosDeTermo(caminhos: string[]): Promise<string | null> {
  if (caminhos.length === 0) return null

  const admin = createAdminClient()
  const naoRemovidos: string[] = []

  for (let i = 0; i < caminhos.length; i += LOTE_REMOCAO) {
    const lote = caminhos.slice(i, i + LOTE_REMOCAO)
    try {
      const { data, error } = await admin.storage.from('termos').remove(lote)
      if (error) throw new Error(error.message)
      const saiu = new Set((data ?? []).map((o) => o.name))
      naoRemovidos.push(...lote.filter((c) => !saiu.has(c)))
    } catch (err) {
      console.error('[conflitos] falha ao remover .docx do bucket termos', {
        lote: lote.length,
        erro: err instanceof Error ? err.message : String(err),
      })
      naoRemovidos.push(...lote)
    }
  }

  if (naoRemovidos.length === 0) return null
  console.error('[conflitos] .docx que ficaram órfãos no bucket', { naoRemovidos })
  return `Os cadastros foram apagados, mas ${naoRemovidos.length} de ${caminhos.length} arquivo(s) .docx não saíram do armazenamento. Eles ficaram órfãos — a checagem "arquivo de termo órfão" da área do desenvolvedor vai contá-los.`
}

// ---------------------------------------------------------------------------
// 1. Leitura sob demanda: o resumo REAL do que a exclusão vai levar
// ---------------------------------------------------------------------------

/**
 * Os lados selecionados, lidos NA HORA (ordem §4.3) — e não o que a tela tinha em memória
 * quando a página carregou. É deste retorno que o diálogo monta as contagens por filial, o
 * total de movimentações/termos que morrem junto e o aviso destacado de histórico real.
 *
 * Server Action de LEITURA porque a mesa é Client Component (checkbox, diálogo) e um Client
 * Component não importa módulo `server-only`. Repete `exigirAdmin` por defesa em
 * profundidade — as leituras da view já respeitam RLS, mas quem não pode APAGAR também não
 * precisa do resumo da exclusão.
 */
export async function resumoExclusaoConflito(input: {
  ativoIds: string[]
}): Promise<
  ConflitoResult<{
    lados: LadoConflito[]
    resumo: ReturnType<typeof resumoDaExclusao>
    faltando: number
  }>
> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const ids = [...new Set(input.ativoIds ?? [])]
  if (ids.length === 0) return { ok: false, erro: 'Selecione ao menos um cadastro.' }

  try {
    const lados = await ladosDosAtivos(supabase, ids)
    return {
      ok: true,
      dados: {
        lados,
        resumo: resumoDaExclusao(lados),
        // Ids pedidos que NÃO voltaram da view = não estão (mais) em conflito. A tela
        // avisa; a RPC recusaria a operação inteira por causa deles.
        faltando: ids.length - lados.length,
      },
    }
  } catch (e) {
    return { ok: false, erro: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// 2. A exclusão
// ---------------------------------------------------------------------------

/**
 * Apaga os cadastros selecionados — e só eles, e só se estiverem em conflito.
 *
 * O fluxo espelha o do import destrutivo: valida na action (mensagem amigável), grava o
 * backup em arquivo QUANDO o lote passa do cap, chama a RPC (que revalida tudo de novo, sob
 * lock, e é quem de fato autoriza) e só então limpa os `.docx` do bucket.
 *
 * O backup em arquivo é gravado ANTES da RPC de propósito: se o upload falhar, nada foi
 * apagado. Abaixo do cap não há upload nenhum — o backup vai em jsonb dentro do próprio
 * evento de auditoria, na mesma transação, que é estritamente mais seguro (não existe o
 * estado "apagou mas o backup não subiu").
 */
export async function apagarConflito(input: {
  ativoIds: string[]
  confirmacao: string
  justificativa: string
}): Promise<ConflitoResult<{ ativos: number; movimentacoes: number; termos: number }>> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apagarConflitoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const ativoIds = [...new Set(parsed.data.ativoIds)]

  // Régua compartilhada com a tela (confirmação + justificativa + teto). A RPC confere
  // tudo de novo — esta camada existe para a mensagem, não para a segurança.
  const recusa = validarExclusaoDeConflito({
    ativoIds,
    confirmacao: parsed.data.confirmacao,
    justificativa: parsed.data.justificativa,
  })
  if (recusa) return { ok: false, erro: recusa }

  // ---- backup em ARQUIVO só acima do cap ----
  let backupPath: string | null = null
  if (exigeBackupEmArquivo(ativoIds.length)) {
    try {
      const lados = await ladosDosAtivos(supabase, ativoIds)
      const corpo = new Blob(
        [
          JSON.stringify({
            versao: 1,
            exportadoEm: new Date().toISOString(),
            motivo: 'exclusão de conflito entre filiais',
            ativoIds,
            lados,
          }),
        ],
        { type: 'application/json' },
      )
      // O prefixo NÃO é decorativo: a RPC exige que o caminho comece por ele (migration
      // 0093, precedente 0089). Conferir só que "existe um objeto com esse nome" deixaria
      // passar o backup de outra operação qualquer que por acaso esteja no bucket.
      const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
      backupPath = `${PREFIXO_BACKUP_CONFLITO}${carimbo}.json`
      const { error: upErr } = await supabase.storage
        .from('backups-import')
        .upload(backupPath, corpo, { contentType: 'application/json', upsert: false })
      if (upErr) {
        return {
          ok: false,
          erro: `Falha ao gravar o backup — nada foi apagado: ${upErr.message}`,
        }
      }
    } catch {
      return { ok: false, erro: 'Falha ao gerar o backup dos cadastros. Nada foi apagado.' }
    }
  }

  // ---- a RPC (a trava de verdade) ----
  const { data, error } = await supabase.rpc('apagar_ativos_conflito_filiais', {
    p_ativos: ativoIds,
    p_confirmacao: parsed.data.confirmacao,
    p_justificativa: parsed.data.justificativa,
    // ⚠ `supabase gen types` declara TODO parâmetro de RPC como não-anulável, mas aqui NULL
    // é valor de domínio (abaixo do cap não há arquivo de backup — o backup vai em jsonb
    // no próprio evento). Mesmo contorno que `resetarBloco` usa para o alcance global.
    p_backup_path: backupPath as unknown as string,
  })
  if (error) {
    console.error('[conflitos] apagarConflito RPC error', {
      code: error.code,
      message: error.message,
      details: error.details,
      ativos: ativoIds.length,
    })
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }

  const ret = (data ?? {}) as {
    ativos?: number
    movimentacoes?: number
    termos?: number
    arquivos_termos?: string[]
  }

  // ---- limpeza dos .docx, DEPOIS do commit ----
  const aviso = await limparArquivosDeTermo(ret.arquivos_termos ?? [])

  revalidar()

  return {
    ok: true,
    aviso: aviso ?? undefined,
    dados: {
      ativos: ret.ativos ?? ativoIds.length,
      movimentacoes: ret.movimentacoes ?? 0,
      termos: ret.termos ?? 0,
    },
  }
}

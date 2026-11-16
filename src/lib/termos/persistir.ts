import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { registrarFalha } from '@/lib/observabilidade'
import { traduzErroBanco } from '@/lib/actions/erros'
import { traduzirErroStorage } from '@/lib/supabase/erros-do-banco'
import type { TermoTipo } from '@/lib/termos/tipos'

// =============================================================================
// persistirTermo — a LINHA antes do arquivo (F67B, 16/11/2026; docs/PLAN-F67B.md decisão 6)
// =============================================================================
// Grava o termo em versão única (§3.10 da spec): a linha de `termos_gerados` para ESTE conjunto de movimentações e o
// `.docx` no bucket `termos`, apagando as variantes antigas do mesmo conjunto (ex.: monitor interno ↔ home office).
//
// ⚠ A ORDEM INVERTEU NA F67B. Desde a contração (0198) o bucket `termos` decide pela LINHA: um `.docx` só é gravável se
// uma linha que quem grava pode escrever o referencia (`pode_escrever_arquivo_termo`, `coalesce(…, false)`), e só é
// lido por membro ativo da empresa dela. O fluxo de antes — o upload ANTES da linha — seria recusado. Agora:
//   · INSERT (id novo): a LINHA primeiro → o upload (`upsert: false`: o nome é novo) → se o upload falhar, a LINHA sai
//     (o rollback); se isso também falhar, `registrarFalha` com o id — a 3ª checagem (`termo_sem_arquivo`) é a rede.
//     Nunca nasce objeto sem linha.
//   · UPDATE (id reutilizado, o MESMO caminho): o upload (`upsert: true` — exige INSERT + SELECT + UPDATE, todos
//     decididos pela linha, que já existe) → o UPDATE. Nunca há objeto sem linha nem linha sem objeto. A janela
//     DECLARADA: se o UPDATE falhar depois do upload, o arquivo é o novo e as colunas descritivas (colaborador, dados)
//     ficam as antigas — até o próximo gerarTermo do mesmo conjunto, que regrava os dois.
//   · as VARIANTES antigas: o `remove` dos arquivos ENQUANTO as linhas existem (a policy de DELETE decide pela linha), e
//     só depois as linhas cujo arquivo SAIU (o `data` do `remove` é conferido — a API responde 200 com o que saiu). Um
//     arquivo que não saiu deixa a variante inteira de pé: um par válido, nunca um órfão.
// Módulo `server-only` e não 'use server': exportado para o teste (src/lib/termos/persistir.test.ts), sem virar Server
// Action chamável do navegador. O client é o da SESSÃO de quem gera (o banco decide; nada aqui usa service role).
// =============================================================================

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type ClienteTermos = Pick<SupabaseClient<Database>, 'from' | 'storage'>

export type ResultadoPersistir = { ok: true; id: string; arquivoPath: string } | { ok: false; erro: string }

export async function persistirTermo(
  supabase: ClienteTermos,
  params: {
    tipo: TermoTipo
    movimentacaoIds: string[]
    ativoIds: string[]
    colaborador: string | null
    dados: unknown
    buffer: Buffer
    uid: string
  },
): Promise<ResultadoPersistir> {
  const { tipo, movimentacaoIds, ativoIds, colaborador, dados, buffer, uid } = params
  const sortedMovIds = [...movimentacaoIds].sort()

  // Termos já existentes para ESTE conjunto de movimentações. Falha de leitura NÃO vira "não há nenhum": seguiria para
  // um INSERT que o `unique (tipo, movimentacao_ids)` recusaria com uma mensagem que não explica nada.
  const { data: existentes, error: eExist } = await supabase
    .from('termos_gerados')
    .select('id, arquivo_path')
    .contains('movimentacao_ids', sortedMovIds)
    .containedBy('movimentacao_ids', sortedMovIds)
  if (eExist) return { ok: false, erro: traduzErroBanco(eExist.message, eExist.code) }

  const reutilizar = existentes?.[0]
  const id = reutilizar?.id ?? randomUUID()
  const arquivoPath = `${id}.docx`

  // As VARIANTES antigas do mesmo conjunto: o ARQUIVO sai primeiro, enquanto a linha ainda existe (sem ela, desde a
  // F67B, ninguém da sessão alcança o objeto); só a linha cujo arquivo SAIU vai embora depois.
  const variantes = (existentes ?? []).filter((e) => e.id !== id)
  if (variantes.length > 0) {
    const arquivos = variantes.map((v) => v.arquivo_path)
    const { data: sairam, error: eRm } = await supabase.storage.from('termos').remove(arquivos)
    if (eRm) registrarFalha({ escopo: 'termos.remover-variantes', erro: eRm })
    const saiu = new Set((sairam ?? []).map((o) => o.name))
    const linhasSemArquivo = variantes.filter((v) => saiu.has(v.arquivo_path)).map((v) => v.id)
    if (linhasSemArquivo.length < variantes.length) {
      // a variante cujo arquivo não saiu fica de pé, inteira — um par válido; registra para a próxima geração
      registrarFalha({
        escopo: 'termos.variante-de-pe',
        erro: new Error(`${variantes.length - linhasSemArquivo.length} variante(s) antiga(s) mantida(s): o arquivo não saiu`),
      })
    }
    if (linhasSemArquivo.length > 0) {
      // `.select('id')`: DELETE filtrado pela RLS ("operador apaga") afeta 0 linhas SEM erro.
      const { error: eDel } = await supabase
        .from('termos_gerados')
        .delete()
        .in('id', linhasSemArquivo)
        .select('id')
      if (eDel) return { ok: false, erro: traduzErroBanco(eDel.message, eDel.code) }
    }
  }

  const linha = {
    id,
    tipo,
    movimentacao_ids: sortedMovIds,
    ativo_ids: [...ativoIds].sort(),
    colaborador,
    dados: dados as Database['public']['Tables']['termos_gerados']['Insert']['dados'],
    arquivo_path: arquivoPath,
  }

  if (reutilizar) {
    // UPDATE: a linha JÁ existe e já referencia o caminho — o upload (upsert) primeiro, a linha depois (a janela
    // declarada no cabeçalho).
    const { error: upErr } = await supabase.storage
      .from('termos')
      .upload(arquivoPath, buffer, { contentType: DOCX_MIME, upsert: true })
    if (upErr) return { ok: false, erro: traduzirErroStorage(upErr, 'gravar') }
    const { error } = await supabase
      .from('termos_gerados')
      .update({ ...linha, atualizado_em: new Date().toISOString(), atualizado_por: uid })
      .eq('id', id)
    if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
    return { ok: true, id, arquivoPath }
  }

  // INSERT: a LINHA primeiro (é ela que torna o nome gravável), o arquivo depois.
  const { error: eIns } = await supabase.from('termos_gerados').insert({ ...linha, gerado_por: uid })
  if (eIns) return { ok: false, erro: traduzErroBanco(eIns.message, eIns.code) }

  const { error: upErr } = await supabase.storage
    .from('termos')
    .upload(arquivoPath, buffer, { contentType: DOCX_MIME, upsert: false })
  if (upErr) {
    // o rollback do INSERT: a linha sai — nunca uma linha sem arquivo de propósito
    const { error: eRb } = await supabase.from('termos_gerados').delete().eq('id', id)
    if (eRb) {
      registrarFalha({
        escopo: 'termos.rollback-da-linha',
        erro: eRb,
        ctx: { termo_id: id },
      })
    }
    return { ok: false, erro: traduzirErroStorage(upErr, 'gravar') }
  }
  return { ok: true, id, arquivoPath }
}

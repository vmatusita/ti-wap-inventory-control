import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { conferirVocabulario, type VocabularioImport } from '@/lib/import/vocabulario'
import type { CategoriaImport, EstadoPlanilha } from '@/lib/import/tipos'
import type { Database } from '@/lib/types/database'

// A leitura do vocabulário do import de startup (F56 · Frente D, Decisão 3 do
// PLAN-F56.md) — SÓ-SERVIDOR: lê as CINCO fontes do banco em PARALELO (as
// quatro tabelas da migration 0139 + `filiais`) e confere os invariantes com
// `conferirVocabulario` antes de devolver. Chamada A CADA análise — as duas
// actions que rodam o motor (`validarImport`, `baixarCsvCorrigido`) e a página
// do wizard leem daqui, nunca de um cache entre chamadas: o vocabulário pode
// mudar a qualquer momento (um apelido novo em Administração › Filiais), e o
// servidor nunca julga com um vocabulário velho.

type DbClient = SupabaseClient<Database>

/**
 * Lê o vocabulário do import — TODAS as filiais (ativas e inativas: toda
 * filial é unidade CONHECIDA, Decisão 2 do PLAN-F56.md), os apelidos, o
 * De→Para de categoria e de estado (com a forma de exibição) e os prefixos de
 * patrimônio — e confere os invariantes (`conferirVocabulario`) antes de
 * devolver. Lança se o vocabulário estiver ambíguo/incompleto (o construtor
 * nunca segue calado — o banco já tem os CHECKs e os índices únicos, mas o
 * código não confia cegamente no que voltou da leitura).
 */
export async function lerVocabularioImport(client: DbClient): Promise<VocabularioImport> {
  const [filiais, apelidos, categorias, estados, prefixos] = await Promise.all([
    client.from('filiais').select('id, nome, ativo').order('nome', { ascending: true }),
    client.from('unidades_apelidos').select('filial_id, apelido').order('apelido', { ascending: true }),
    client
      .from('import_termos_categoria')
      .select('termo, categoria, rotulo')
      .order('termo', { ascending: true }),
    client.from('import_termos_estado').select('termo, estado, rotulo').order('termo', { ascending: true }),
    client.from('import_prefixos_patrimonio').select('prefixo').order('prefixo', { ascending: true }),
  ])

  if (filiais.error) throw new Error(`Falha ao ler filiais (vocabulário do import): ${filiais.error.message}`)
  if (apelidos.error) throw new Error(`Falha ao ler unidades_apelidos: ${apelidos.error.message}`)
  if (categorias.error) throw new Error(`Falha ao ler import_termos_categoria: ${categorias.error.message}`)
  if (estados.error) throw new Error(`Falha ao ler import_termos_estado: ${estados.error.message}`)
  if (prefixos.error) throw new Error(`Falha ao ler import_prefixos_patrimonio: ${prefixos.error.message}`)

  const vocabulario: VocabularioImport = {
    filiais: (filiais.data ?? []).map((f) => ({ id: f.id, nome: f.nome, ativa: f.ativo })),
    apelidos: (apelidos.data ?? []).map((a) => ({ filialId: a.filial_id, apelido: a.apelido })),
    // O tipo GERADO da coluna é o enum inteiro do banco (`categoria_ativo`/
    // `status_ativo`), mais largo que `CategoriaImport`/`EstadoPlanilha` — os
    // CHECKs da migration 0139 (`categoria <> 'outro'`, `estado <>
    // 'devolvido_fornecedor'`) garantem que os valores realmente gravados nunca
    // saem do subconjunto estreito; `conferirVocabulario`, logo abaixo, é a
    // segunda linha (recusa alto se algo escapar).
    categorias: (categorias.data ?? []).map((c) => ({
      termo: c.termo,
      categoria: c.categoria as CategoriaImport,
      rotulo: c.rotulo,
    })),
    estados: (estados.data ?? []).map((e) => ({
      termo: e.termo,
      estado: e.estado as EstadoPlanilha,
      rotulo: e.rotulo,
    })),
    prefixosPatrimonio: (prefixos.data ?? []).map((p) => p.prefixo),
  }

  conferirVocabulario(vocabulario)
  return vocabulario
}

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarFalha } from '@/lib/observabilidade'

// A PORTA ÚNICA DE REMOÇÃO DE `.docx` — F54.
//
// Até esta fase, três Server Actions removiam os `.docx` dos termos de responsabilidade do
// bucket `termos` logo depois de a RPC apagar as linhas, e NENHUM dos backups levava os
// binários junto. `exportarAcervoFilial` e `montarBackupDoReset` fazem `select('*')` das
// LINHAS; restaurar devolvia `termos_gerados` apontando para objetos que não existiam mais.
// A tela do reset dizia, com todas as letras, "NADA foi apagado — reset sem backup é
// proibido", e a frase era FALSA para a classe de dado mais sensível do sistema: o
// documento que uma pessoa ASSINOU.
//
// Este módulo é a correção, e ele concentra a remoção de propósito. A trava
// `src/lib/actions/backup-completude.test.ts` varre o `src/` inteiro e exige que toda
// chamada `.from('<bucket>').remove(` esteja classificada; ter UMA porta é o que permite
// àquela trava ser uma asserção sobre ESTRUTURA em vez de um grep espalhado por quatro
// arquivos que envelhecem em ritmos diferentes. É o mesmo desenho da "porta só" da F51
// para o `delete from public.ativos`.
//
// ⚠ OS BUCKETS SÃO LITERAIS, E ISSO É REQUISITO DA TRAVA, não estilo. Com
// `.from(bucketOrigem)` — variável — a varredura não teria como saber QUAL bucket aquele
// `remove(` toca, e a trava passaria a vigiar um universo que ela não consegue nomear.
// Medido: a primeira versão deste módulo usava variável, e a trava ficava cega para o
// próprio arquivo que ela existe para proteger.
//
// ⚠ O CLIENT VEM DE FORA, E ISSO NÃO É CERIMÔNIA. Os quatro chamadores usam clients
// diferentes por motivos diferentes, e uniformizá-los "para ficar bonito" quebraria duas
// coisas de uma vez:
//   · `actions/importar.ts` usa o client de SESSÃO, e o cabeçalho daquele módulo proíbe
//     service role com todas as letras ("TODO acesso ao banco/Storage/RPC pelo client
//     autenticado do operador — jamais service_role");
//   · `dev-destrutivo.ts` e `conflitos.ts` usam o ADMINISTRATIVO, por conservadorismo
//     escrito (a linha já morreu, então o nome do arquivo não é mais referenciado).
// Recebendo o client por parâmetro, este módulo também NÃO invoca `createAdminClient()` —
// e portanto não entra na lista declarada de `superficie-admin.test.ts` (F49), que é por
// ARQUIVO. As policies medidas (migration 0066/0069) deixam os dois copiarem: `copy()`
// exige SELECT na origem e INSERT no destino, e o admin de sessão tem os dois.
//
// ⚠ A CÓPIA É UM ARQUIVO POR IDA. `copy()` do storage-js não tem forma em lote: é um
// `POST /object/copy` com `{bucketId, sourceKey, destinationKey, destinationBucket}` (lido
// da versão INSTALADA, 2.112.4, e confirmado na doc oficial — regra 6 do CLAUDE.md). Por
// isso as cópias saem em paralelo limitado: no pior caso medido (reset global, 94 objetos,
// 7,25 MB) a diferença é entre ~94 idas em fila e ~16 rodadas.

/** Um client do supabase-js — de sessão ou administrativo. O chamador decide. */
type ClientStorage = Pick<SupabaseClient, 'storage'>

/** De onde os `.docx` saem. */
const BUCKET_TERMOS = 'termos'
/** Para onde as cópias vão — o mesmo bucket dos backups em JSON. */
const BUCKET_BACKUPS = 'backups-import'

/** Quantos `copy()` em voo ao mesmo tempo. */
const COPIAS_EM_PARALELO = 6

/** Quantos caminhos por chamada de `remove()`. O mesmo lote dos gêmeos que este módulo substituiu. */
const LOTE_REMOCAO = 500

// ---------------------------------------------------------------------------
// A CONVENÇÃO DE CAMINHO — espelhada em SQL pela 12ª checagem de integridade
// ---------------------------------------------------------------------------
// As cópias moram em `<raiz>/termos/<arquivo_path>`, e a RAIZ é sempre um valor que a
// operação JÁ registrava antes desta fase. Isso é o que torna a convenção determinística:
// o restaurador — e a checagem de integridade, em SQL — recalculam a pasta sem precisar de
// lista, manifesto ou evento novo.
//
// ⚠ POR QUE NÃO UM MANIFESTO. O desenho concorrente gravava um evento
// `termos_copiados_para_backup` com o prefixo. A revisão adversarial matou-o com um furo
// real: `registrarEventoAdmin` roda DEPOIS da cópia, FORA da transação, e nunca propaga
// erro — a cópia subiria, o evento falharia calado, e o arquivo viraria órfão permanente
// exatamente nos dois caminhos que hoje não têm rede (apagar ativo e conflito abaixo do
// teto). O determinismo não tem esse elo: não há escrita nova que possa falhar.
//
// ⚠ COLISÃO É IMPOSSÍVEL POR CONSTRUÇÃO. A raiz de conflito é o digest da seleção e a de
// ativo é o próprio id; depois de uma exclusão bem-sucedida aqueles ativos não existem
// mais para serem reselecionados. Uma tentativa RECUSADA não copia nada — a cópia só
// acontece depois de a RPC voltar sem erro.

/**
 * A raiz das cópias quando a operação tem backup em ARQUIVO (import e reset, e o conflito
 * acima do teto): o próprio caminho do JSON, sem a extensão.
 *
 * Espelho SQL: `regexp_replace(caminho, '\.json$', '')`.
 */
export function raizDoBackupEmArquivo(backupPath: string): string {
  return backupPath.replace(/\.json$/, '')
}

/**
 * A raiz das cópias de `apagarAtivo`, que NÃO tem backup em arquivo — o backup dela é
 * jsonb inline no evento `ativo_apagado`, que grava `detalhe->>'ativo_id'`.
 *
 * Espelho SQL: `'ativo/' || (detalhe->>'ativo_id')`.
 */
export function raizDoAtivo(ativoId: string): string {
  return `ativo/${ativoId}`
}

/**
 * A raiz das cópias de `apagarConflito`, IGUAL acima e abaixo do teto de 25 — abaixo dele
 * não há backup em arquivo, e o digest da seleção é a única âncora que existe nos dois
 * casos.
 *
 * Espelho SQL: `prefixo_backup_conflito() || digest_selecao_conflito(ids)` — as duas
 * funções já existem no banco desde a migration 0100, então não há algoritmo novo
 * duplicado entre TypeScript e SQL.
 */
export function raizDoConflito(digest: string): string {
  return `conflito/${digest}`
}

/** O prefixo final das cópias, a partir da raiz. Espelho SQL: `|| '/termos/'`. */
export function prefixoDasCopias(raiz: string): string {
  return `${raiz}/termos/`
}

export type ResultadoCopiaRemocao = {
  /** Os que foram copiados E removidos — o caminho feliz. */
  removidos: string[]
  /**
   * Os que NÃO foram copiados e por isso NÃO foram removidos. Continuam no bucket
   * `termos`, sem linha em `termos_gerados` — órfãos, e contados pela 8ª checagem.
   */
  naoCopiados: string[]
  /** Os que foram copiados mas cuja remoção falhou. Ficam órfãos, COM cópia no backup. */
  naoRemovidos: string[]
  /** Onde as cópias foram gravadas — o que o restaurador precisa saber. */
  prefixoDestino: string
}

/**
 * Copia os `.docx` para o backup. NÃO remove nada.
 *
 * Devolve a lista do que REALMENTE saiu — e é essa lista, e não a de entrada, que pode ser
 * removida depois. Separar as duas funções é o que torna a regra "não remove o que não
 * copiou" uma propriedade do TIPO, e não uma disciplina de quem escreve o código: só
 * existe uma maneira de obter a lista removível, e ela é o retorno daqui.
 */
export async function copiarArtefatosParaBackup(
  client: ClientStorage,
  params: { prefixoDestino: string; caminhos: string[] },
): Promise<{ copiados: string[]; falharam: string[] }> {
  const { prefixoDestino, caminhos } = params
  const copiados: string[] = []
  const falharam: string[] = []

  for (let i = 0; i < caminhos.length; i += COPIAS_EM_PARALELO) {
    const loteCopia = caminhos.slice(i, i + COPIAS_EM_PARALELO)
    const resultados = await Promise.all(
      loteCopia.map(async (caminho) => {
        try {
          const { error } = await client.storage
            .from(BUCKET_TERMOS)
            .copy(caminho, `${prefixoDestino}${caminho}`, { destinationBucket: BUCKET_BACKUPS })
          // ⚠ O erro do storage-js é RETORNADO em `{data, error}`, não lançado (medido em
          // `handleOperation` da versão instalada). Conferir só o `catch` deixaria toda
          // falha de cópia passar por sucesso — e o `.docx` seria apagado em seguida.
          return { caminho, ok: !error, erro: error?.message }
        } catch (err) {
          return { caminho, ok: false, erro: err instanceof Error ? err.message : String(err) }
        }
      }),
    )
    for (const r of resultados) {
      if (r.ok) copiados.push(r.caminho)
      else {
        falharam.push(r.caminho)
        registrarFalha({
          escopo: 'storage.copia-termo-backup',
          erro: r.erro,
          ctx: { caminho: r.caminho, destino: `${BUCKET_BACKUPS}/${prefixoDestino}${r.caminho}` },
        })
      }
    }
  }

  return { copiados, falharam }
}

/**
 * Copia os `.docx` para o backup e remove do acervo SÓ os que a cópia confirmou.
 *
 * ⚠ ESTA FUNÇÃO INVERTE O CONTRATO ANTERIOR, e a inversão é o ponto da fase. Os dois
 * gêmeos que ela substitui removiam em best-effort e devolviam AVISO; falhar a cópia agora
 * IMPEDE a remoção daquele arquivo. O raciocínio está na ficha da F54 e vale repetir:
 * órfão no bucket é infinitamente melhor que documento assinado perdido, e o sistema já
 * convive com órfãos — a 8ª checagem de integridade existe para contá-los.
 *
 * ⚠ CÓPIA PARCIAL — a regra, e por que é esta (Decisão 3). Quando alguns copiam e outros
 * não, remove-se EXATAMENTE os que copiaram, e os demais ficam. A alternativa ("não
 * remover nenhum") foi recusada por medição: a RPC já fez commit quando chegamos aqui, as
 * LINHAS já morreram, e portanto todo `.docx` desta lista já é órfão de qualquer jeito — a
 * escolha real não é entre "coerente" e "meio apagado", é entre *órfão com cópia* e *órfão
 * sem cópia*. Num import da Matriz (84 termos), uma única cópia falha deixaria 84 arquivos
 * no bucket em vez de 1, com 83 deles duplicados no backup, e a 8ª checagem acusando 84
 * onde só um mereceu atenção. O invariante que importa — nenhum documento assinado some
 * sem cópia — é preservado igual nas duas, e só uma delas deixa o bucket legível depois.
 */
export async function copiarEntaoRemoverTermos(
  client: ClientStorage,
  params: { prefixoDestino: string; caminhos: string[] },
): Promise<ResultadoCopiaRemocao> {
  const { prefixoDestino, caminhos } = params
  if (caminhos.length === 0) {
    return { removidos: [], naoCopiados: [], naoRemovidos: [], prefixoDestino }
  }

  const { copiados, falharam } = await copiarArtefatosParaBackup(client, params)

  const removidos: string[] = []
  const naoRemovidos: string[] = []

  // ⚠ O LOTE SAI DE `copiados`, NUNCA DE `caminhos`. Trocar um pelo outro aqui é o defeito
  // exato que esta fase existe para impedir: apagaria o `.docx` que não tem cópia. A trava
  // `backup-completude.test.ts` confere isto pelo NOME do identificador, porque é a única
  // coisa que uma leitura do fonte consegue conferir.
  for (let i = 0; i < copiados.length; i += LOTE_REMOCAO) {
    const loteRemocao = copiados.slice(i, i + LOTE_REMOCAO)
    try {
      const { data, error } = await client.storage.from('termos').remove(loteRemocao)
      if (error) throw new Error(error.message)
      // O `data` é conferido, e não só o `error`: a API responde 200 com a lista do que
      // REALMENTE saiu, então uma remoção parcial não levanta erro nenhum. Herdado dos
      // gêmeos, com o motivo deles.
      const saiu = new Set((data ?? []).map((o) => o.name))
      for (const c of loteRemocao) (saiu.has(c) ? removidos : naoRemovidos).push(c)
    } catch (err) {
      registrarFalha({
        escopo: 'storage.remocao-termo',
        erro: err,
        ctx: { lote: loteRemocao.length },
      })
      naoRemovidos.push(...loteRemocao)
    }
  }

  return { removidos, naoCopiados: falharam, naoRemovidos, prefixoDestino }
}

/**
 * A frase para a tela, ou `null` quando tudo correu bem.
 *
 * Uma função só, para os quatro chamadores, porque a mensagem descreve um fato do sistema
 * e não daquela tela — e porque quatro cópias dela divergiriam na primeira vez que alguém
 * melhorasse uma.
 */
export function avisoDaLimpeza(r: ResultadoCopiaRemocao, total: number): string | null {
  if (r.naoCopiados.length === 0 && r.naoRemovidos.length === 0) return null

  const partes: string[] = []
  if (r.naoCopiados.length > 0) {
    partes.push(
      `${r.naoCopiados.length} de ${total} documento(s) .docx não puderam ser copiados para o arquivo de segurança e, por isso, NÃO foram apagados do armazenamento — eles continuam lá, inteiros`,
    )
  }
  if (r.naoRemovidos.length > 0) {
    partes.push(
      `${r.naoRemovidos.length} de ${total} documento(s) .docx foram copiados para o arquivo de segurança, mas não saíram do armazenamento`,
    )
  }
  return `${partes.join('; ')}. Eles ficaram órfãos — a checagem "arquivo de termo órfão" da área do desenvolvedor vai contá-los.`
}

/**
 * Apaga o BACKUP que subiu para uma operação que a RPC RECUSOU.
 *
 * Sem isto o bucket acumula backups que não correspondem a exclusão nenhuma — e esses
 * órfãos são justamente o material de um replay: caminho válido, existente e sob o prefixo
 * certo. O digest (conflito) e o id da filial (import) já impedem reusar o backup de OUTRA
 * operação; limpar a sobra fecha o reuso da MESMA depois que o estado mudou.
 *
 * É MELHOR ESFORÇO, e aqui isso é correto: falhar não muda o resultado (nada foi apagado),
 * e o que sobra a 12ª checagem de integridade conta. É o oposto do contrato da cópia, onde
 * falhar em silêncio custaria um documento assinado.
 *
 * ⚠ O CLIENT VEM DE FORA pelo mesmo motivo do resto do módulo: `conflitos.ts` usa o
 * administrativo e `importar.ts` usa o de SESSÃO, porque o cabeçalho daquele módulo proíbe
 * service role. A policy de DELETE do bucket é `e_admin()` e quem chega aqui já passou por
 * `exigirAdmin` — conferido na migration 0066.
 */
export async function descartarBackupNaoUsado(
  client: ClientStorage,
  caminho: string,
): Promise<void> {
  try {
    const { error } = await client.storage.from('backups-import').remove([caminho])
    if (error) throw new Error(error.message)
  } catch (err) {
    registrarFalha({
      escopo: 'storage.backup-orfao',
      erro: err,
      ctx: { caminho },
    })
  }
}

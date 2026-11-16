'use server'

import type { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exigirDev } from '@/lib/auth/acesso'
import { empresaDaOperacao } from '@/lib/auth/empresa-legada'
import { empresaDaFilial } from '@/lib/escopo/empresa-da-filial'
import { registrarFalha } from '@/lib/observabilidade'
import { traduzErroBanco } from '@/lib/actions/erros'
import {
  alvoDaMovimentacao,
  buscarAtivosDestrutivo,
  carregarFichaDestrutiva,
  montarBackupDoReset,
  nomeDoItem,
  previaDoReset,
} from '@/lib/queries/dev-destrutivo'
// `import type` é permitido num módulo 'use server' — a regra da F13 proíbe EXPORTAR o que não
// é função async, não importar. O que nunca pode aparecer aqui é um `export type`.
import type { CandidatoAtivo, FichaDestrutiva, PreviaReset } from '@/lib/queries/dev-destrutivo'
import {
  apagarAtivoSchema,
  apagarItemSchema,
  apagarMovimentacaoSchema,
  forcarEstadoSchema,
  forcarSaldoSchema,
  limparTermosSemLinhaSchema,
  resetarSchema,
  validarOperacaoDestrutiva,
} from '@/lib/validators/dev-destrutivo'
import { avisoDaLimpeza, copiarEntaoRemoverTermos } from '@/lib/storage/copiar-antes-de-remover'
import {
  caminhoBackupReset,
  carimboDeArquivo,
  prefixoDasCopias,
  raizDoAtivo,
  raizDoBackupEmArquivo,
  raizDoOrfao,
} from '@/lib/storage/caminho'
import { chamarRpc } from '@/lib/supabase/rpc'
import { valorOuFalha } from '@/lib/supabase/linhas'
import {
  FORMA_RESETAR_BLOCO,
  LEITURA_APAGAR_ATIVO,
  LEITURA_APAGAR_ITEM,
  LEITURA_APAGAR_MOVIMENTACAO,
  LEITURA_FORCAR_ESTADO,
  LEITURA_FORCAR_SALDO,
  LEITURA_LIMPAR_TERMOS_SEM_LINHA,
} from '@/lib/queries/formas/dev-destrutivo'

// Server Actions da ZONA DESTRUTIVA da /dev (F23) — apagar, resetar e forçar.
//
// ⚠ ARQUIVO 'use server': só pode EXPORTAR funções async. Nada de `export const`,
// `export type { X }` ou `export *` — o incidente F13 (um `export type {}` num módulo
// 'use server') matou TODA a escrita em produção por horas. Tipo se exporta pelo alias INLINE
// ou, como aqui, não se exporta: o diálogo infere por `ReturnType`. O guarda
// `src/lib/use-server-exports.test.ts` derruba `npm test` se alguém esquecer.
//
// ⚠ `exigirDev` AQUI NÃO É A SEGURANÇA — é a MENSAGEM em pt-BR. A trava são as RPCs
// (migrations 0082/0083/0084), que chamam `exigir_dev_para_destruir` por dentro e recusam
// mesmo um request forjado; e a guarda `guarda_acervo` (0081), que recusa qualquer caminho de
// exclusão por fora delas, inclusive o do service role.
//
// ⚠ A TRILHA NÃO É ESCRITA AQUI. Os sete eventos da fase são gravados DENTRO das RPCs, na
// mesma transação da operação — ver o cabeçalho da 0082. Duplicá-los aqui geraria linha dobrada
// na auditoria; e `registrarEventoAdmin` não serviria, porque ele engole o erro de propósito e
// uma exclusão irreversível não pode ter trilha "melhor esforço".

type DevResult<T = undefined> =
  | { ok: true; aviso?: string; dados?: T }
  | { ok: false; erro: string }

// Grupos de rota afetados por cada família — a revalidação é obrigatória (§1.6 da ordem),
// senão a tela segue mostrando o que já não existe.
const ROTAS_ACERVO = ['/', '/ativos', '/movimentacoes', '/pendencias', '/relatorios/geral']
const ROTAS_ITENS = ['/itens', '/admin/itens', '/relatorios/geral']

function revalidar(rotas: readonly string[]): void {
  for (const r of rotas) revalidatePath(r)
  revalidatePath('/dev')
  revalidatePath('/dev/destrutivo')
}

/**
 * Copia para o backup e remove os `.docx` do bucket `termos`, DEPOIS do commit da RPC.
 *
 * ⚠ Por que não é a RPC que faz isto: `storage.objects` tem o trigger
 * `protect_objects_delete` (BEFORE DELETE FOR EACH STATEMENT), que recusa TODA exclusão de
 * objeto por SQL. O caminho é a API de Storage, daqui.
 *
 * ⚠ Usa o client ADMINISTRATIVO por NECESSIDADE desde a F67B (16/11/2026). Até a 0197 a sessão
 * do dev também conseguiria (o `coalesce(…, true)` de `pode_escrever_arquivo_termo` liberava o
 * nome que nenhuma linha referencia); desde a contração (0198) o bucket `termos` decide pela
 * LINHA, e um `.docx` cuja linha a RPC acabou de apagar não é alcançável por sessão NENHUMA —
 * nem para ler (a cópia), nem para apagar. O client admin não depende de predicado nenhum.
 *
 * ⚠ FALHA AQUI NÃO PODE SER SILENCIOSA. A linha já morreu; se o arquivo ficar, ele vira órfão
 * invisível. Devolve a mensagem para a action avisar na tela, e a 8ª checagem de integridade
 * da /dev (`arquivo_termo_orfao`, migration 0085) passa a contá-lo.
 *
 * ⚠ O RETORNO `data` de `remove()` É CONFERIDO, e não só o `error`: a API responde 200 com a
 * lista do que REALMENTE saiu, então uma remoção PARCIAL (chave inexistente, corrida com
 * outra limpeza) não levanta erro nenhum. Sem esta conferência, um reset que removesse metade
 * dos arquivos reportaria sucesso limpo. (A conferência mudou de casa na F54 — ela agora
 * mora na porta única, junto com a cópia, mas o motivo dela é este e continua valendo.)
 *
 * ⚠ F54 — E AGORA ELA COPIA ANTES. O `prefixoDestino` é derivado pelo CHAMADOR, porque cada
 * um tem uma âncora diferente: `apagarAtivo` usa `ativo/empresa-<uuid>/<id>` (o backup dela é
 * jsonb inline no evento, não há arquivo), `resetarBloco` usa o caminho do JSON sem a extensão e
 * `limparTermosSemLinha` usa `orfao/<carimbo>` (F67B) — todos de `src/lib/storage/caminho.ts`.
 */
async function limparArquivosDeTermo(
  caminhos: string[],
  prefixoDestino: string,
): Promise<string | null> {
  if (caminhos.length === 0) return null

  // F54 — COPIA antes de remover, e NÃO remove o que não copiou. A implementação inteira
  // mora em `lib/storage/copiar-antes-de-remover.ts`, que é a PORTA ÚNICA: era aqui e no
  // gêmeo de `conflitos.ts` que os `.docx` sumiam sem cópia nenhuma, e concentrar a
  // remoção num lugar só é o que permite à trava `backup-completude.test.ts` ser uma
  // asserção sobre ESTRUTURA em vez de um grep espalhado por quatro arquivos.
  //
  // ⚠ O CONTRATO INVERTEU. Antes esta função removia em best-effort e devolvia AVISO;
  // agora falhar a cópia IMPEDE a remoção daquele arquivo. Órfão no bucket é
  // infinitamente melhor que documento assinado perdido, e o sistema já convive com
  // órfãos — a 8ª checagem existe para contá-los.
  //
  // O client ADMINISTRATIVO continua sendo o desta casa, e é ele que copia: "a cópia usa
  // o MESMO client de quem remove" não é simetria decorativa — uniformizar reintroduziria
  // service role no import, cujo cabeçalho o proíbe com todas as letras.
  const admin = createAdminClient()
  const r = await copiarEntaoRemoverTermos(admin, { prefixoDestino, caminhos })
  return avisoDaLimpeza(r, caminhos.length)
}

// ---------------------------------------------------------------------------
// 0. Leituras que a tela faz sob demanda
// ---------------------------------------------------------------------------
// Server Actions de LEITURA. Existem porque os painéis são Client Components (buscam enquanto
// a pessoa digita) e um Client Component não importa um módulo `server-only`. Cada uma repete
// `exigirDev` — as funções de `queries/dev-destrutivo.ts` também repetem, e é de propósito:
// defesa em profundidade, a mesma doutrina de `queries/dev.ts`.

export async function buscarAtivosParaDestruir(input: {
  termo: string
}): Promise<DevResult<CandidatoAtivo[]>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  try {
    return { ok: true, dados: await buscarAtivosDestrutivo(input.termo ?? '') }
  } catch (err) {
    registrarFalha({ escopo: 'dev-destrutivo.buscar-ativos', erro: err, operador: aut.uid })
    return { ok: false, erro: 'Não foi possível buscar agora. Tente de novo em instantes.' }
  }
}

export async function carregarFicha(input: {
  ativoId: string
}): Promise<DevResult<FichaDestrutiva | null>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  try {
    return { ok: true, dados: await carregarFichaDestrutiva(input.ativoId) }
  } catch (err) {
    registrarFalha({ escopo: 'dev-destrutivo.carregar-ficha', erro: err, operador: aut.uid })
    return { ok: false, erro: 'Não foi possível carregar este ativo agora.' }
  }
}

export async function calcularPreviaReset(input: {
  bloco: 'acervo' | 'itens'
  filialId: number | null
}): Promise<DevResult<PreviaReset>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  try {
    // F67: a empresa da prévia — a DA FILIAL, ou a da operação no "tudo" (a legada EXPLÍCITA até a F70).
    const empresaId =
      input.filialId === null ? empresaDaOperacao() : await empresaDaFilial(supabase, input.filialId)
    if (empresaId === null) return { ok: false, erro: 'Filial não encontrada.' }
    return { ok: true, dados: await previaDoReset(input.bloco, input.filialId, empresaId) }
  } catch (err) {
    registrarFalha({ escopo: 'dev-destrutivo.calcular-previa', erro: err, operador: aut.uid })
    return { ok: false, erro: 'Não foi possível calcular o tamanho deste reset agora.' }
  }
}

// ---------------------------------------------------------------------------
// 1. Apagar um ATIVO, com todo o rastro
// ---------------------------------------------------------------------------
export async function apagarAtivo(input: {
  ativoId: string
  confirmacao: string
  justificativa: string
}): Promise<DevResult<{ movimentacoes: number; termos: number }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apagarAtivoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { ativoId, confirmacao, justificativa } = parsed.data

  const ficha = await carregarFichaDestrutiva(ativoId)
  if (!ficha) return { ok: false, erro: 'Ativo não encontrado. Atualize a página e tente de novo.' }

  // A confirmação é conferida AQUI e DENTRO da RPC (§1.3 da ordem): aqui para dar a mensagem
  // certa, lá para que forjar o request não contorne nada.
  const recusa = validarOperacaoDestrutiva({
    confirmacao,
    esperado: ficha.ativo.rotulo,
    justificativa,
    alvo: 'este ativo',
  })
  if (recusa) return { ok: false, erro: recusa }

  if (ficha.termoDeLoteBloqueia) {
    return {
      ok: false,
      erro: 'Este ativo está num termo que também cobre outros ativos. Apagá-lo destruiria um documento que não é só dele — apague o termo primeiro, ou apague antes os outros ativos do mesmo termo.',
    }
  }

  // F67B: a empresa da operação vai à RPC E à raiz das cópias (`ativo/empresa-<uuid>/<id>`) — a mesma.
  const empresa = empresaDaOperacao()
  const { data, error } = await chamarRpc(supabase, 'apagar_ativo', {
    p_empresa: empresa,
    p_ativo: ativoId,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A escrita já aconteceu (a RPC não devolveu erro): forma errada degrada para "sem
  // números/sem arquivos" — o `?? 0`/`?? []` abaixo já tratava dado ausente do mesmo jeito.
  const lidoR = valorOuFalha(data, LEITURA_APAGAR_ATIVO.forma, LEITURA_APAGAR_ATIVO.rotulo)
  const r: Partial<z.output<typeof LEITURA_APAGAR_ATIVO.forma>> = lidoR.ok ? lidoR.valor : {}
  // F54 — a raiz das cópias é `ativo/<id>` (F67B: `ativo/empresa-<uuid>/<id>`). Esta action NÃO tem backup em arquivo (o dela
  // é jsonb inline no evento `ativo_apagado`, escrito pela RPC na mesma transação), então
  // a âncora é o próprio id do ativo — que a RPC já grava em `detalhe->>'ativo_id'`. É por
  // isso que a 12ª checagem reconhece estas cópias sem precisar de registro novo.
  const aviso = await limparArquivosDeTermo(
    r.arquivos_termos ?? [],
    prefixoDasCopias(raizDoAtivo(empresa, ativoId)),
  )

  revalidar(ROTAS_ACERVO)
  return {
    ok: true,
    aviso: aviso ?? undefined,
    dados: { movimentacoes: r.movimentacoes ?? 0, termos: r.termos ?? 0 },
  }
}

// ---------------------------------------------------------------------------
// 2. Apagar UMA movimentação (só a última do ativo)
// ---------------------------------------------------------------------------
export async function apagarMovimentacao(input: {
  movimentacaoId: string
  confirmacao: string
  justificativa: string
}): Promise<DevResult<{ statusRestaurado: string | null }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apagarMovimentacaoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { movimentacaoId, confirmacao, justificativa } = parsed.data

  // §1.3 da ordem: a confirmação é validada NA ACTION **E** NA RPC. Aqui para dar a mensagem
  // certa em pt-BR (dizendo QUAL identificador se espera); lá para que forjar o request não
  // contorne nada — a RPC compara com o que ela mesma lê na própria transação.
  const alvo = await alvoDaMovimentacao(movimentacaoId)
  if (!alvo) {
    return { ok: false, erro: 'Movimentação não encontrada. Atualize a página e tente de novo.' }
  }
  const recusa = validarOperacaoDestrutiva({
    confirmacao,
    esperado: alvo.rotulo,
    justificativa,
    alvo: 'esta movimentação',
  })
  if (recusa) return { ok: false, erro: recusa }

  const { data, error } = await chamarRpc(supabase, 'apagar_movimentacao', {
    p_empresa: empresaDaOperacao(),
    p_mov: movimentacaoId,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A escrita já aconteceu: forma errada degrada para "sem status restaurado" — o `?? null`
  // abaixo já tratava dado ausente do mesmo jeito.
  const lidoR = valorOuFalha(data, LEITURA_APAGAR_MOVIMENTACAO.forma, LEITURA_APAGAR_MOVIMENTACAO.rotulo)
  const r: Partial<z.output<typeof LEITURA_APAGAR_MOVIMENTACAO.forma>> = lidoR.ok ? lidoR.valor : {}
  revalidar(ROTAS_ACERVO)
  return { ok: true, dados: { statusRestaurado: r.status_restaurado ?? null } }
}

// ---------------------------------------------------------------------------
// 3. Apagar um ITEM do catálogo, com lançamentos e saldo
// ---------------------------------------------------------------------------
export async function apagarItem(input: {
  itemId: number
  confirmacao: string
  justificativa: string
}): Promise<DevResult<{ lancamentos: number }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apagarItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { itemId, confirmacao, justificativa } = parsed.data

  // §1.3: validada nas DUAS camadas (ver o comentário em `apagarMovimentacao`).
  const nome = await nomeDoItem(itemId)
  if (!nome) {
    return { ok: false, erro: 'Item não encontrado. Atualize a página e tente de novo.' }
  }
  const recusa = validarOperacaoDestrutiva({
    confirmacao,
    esperado: nome,
    justificativa,
    alvo: 'este item',
  })
  if (recusa) return { ok: false, erro: recusa }

  const { data, error } = await chamarRpc(supabase, 'apagar_item', {
    p_empresa: empresaDaOperacao(),
    p_item: itemId,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A escrita já aconteceu: forma errada degrada para "sem contagem" — o `?? 0` abaixo já
  // tratava dado ausente do mesmo jeito.
  const lidoR = valorOuFalha(data, LEITURA_APAGAR_ITEM.forma, LEITURA_APAGAR_ITEM.rotulo)
  const r: Partial<z.output<typeof LEITURA_APAGAR_ITEM.forma>> = lidoR.ok ? lidoR.valor : {}
  revalidar(ROTAS_ITENS)
  return { ok: true, dados: { lancamentos: r.lancamentos ?? 0 } }
}

// ---------------------------------------------------------------------------
// 4. RESETAR um bloco, por filial ou global
// ---------------------------------------------------------------------------
// A SEQUÊNCIA IMPORTA e é de FALHA SEGURA:
//   1º  prévia (contagens + rótulo da confirmação, pela MESMA régua da RPC);
//   2º  BACKUP — lido e gravado no bucket privado ANTES de qualquer exclusão;
//   3º  a RPC, que recusa se o backup não existir de verdade no bucket e se as contagens
//       tiverem mudado desde a prévia;
//   4º  a limpeza dos .docx, depois do commit.
// Se o passo 2 falhar, nada foi apagado. Se o 4 falhar, o aviso diz o que ficou para trás.
export async function resetarBloco(input: {
  bloco: 'acervo' | 'itens'
  filialId: number | null
  confirmacao: string
  justificativa: string
}): Promise<DevResult<Record<string, unknown>>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = resetarSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { bloco, filialId, confirmacao, justificativa } = parsed.data

  // F67: a empresa do reset — a DA FILIAL (lida no servidor) ou, no "tudo", a da operação (a legada EXPLÍCITA até a
  // F70). O banco confere de novo: filial de outra empresa → 42501, e o "tudo" é todas as filiais DESTA empresa.
  let empresaId: string | null
  try {
    empresaId = filialId === null ? empresaDaOperacao() : await empresaDaFilial(supabase, filialId)
  } catch (err) {
    registrarFalha({ escopo: 'dev-destrutivo.resetar-empresa', erro: err, operador: aut.uid })
    return { ok: false, erro: 'Não foi possível conferir a filial deste reset agora. Nada foi apagado — tente de novo em instantes.' }
  }
  if (empresaId === null) return { ok: false, erro: 'Filial não encontrada.' }

  let previa
  try {
    previa = await previaDoReset(bloco, filialId, empresaId)
  } catch (err) {
    registrarFalha({ escopo: 'dev-destrutivo.resetar-previa', erro: err, operador: aut.uid })
    return {
      ok: false,
      erro: 'Não foi possível conferir o tamanho deste reset agora. Nada foi apagado — tente de novo em instantes.',
    }
  }

  const recusa = validarOperacaoDestrutiva({
    confirmacao,
    esperado: previa.rotulo,
    justificativa,
    alvo: 'este reset',
  })
  if (recusa) return { ok: false, erro: recusa }

  if (bloco === 'acervo' && previa.termo_misto_bloqueia) {
    return {
      ok: false,
      erro: 'Há termo(s) de lote que misturam esta filial com outra. O reset está bloqueado até que eles sejam resolvidos — apagar só metade de um termo destruiria um documento de outra filial.',
    }
  }

  // ---- BACKUP, antes de tudo ----
  let backupPath: string
  try {
    const conteudo = await montarBackupDoReset(bloco, filialId)
    // F67B: `reset/empresa-<uuid>/<bloco>/<tudo|filial-N>/<carimbo>.json` — a empresa do reset no 2º segmento, pela
    // função única (o bucket decide por ela; a RPC confere a forma nova). O "tudo" é a empresa inteira desde a F67.
    backupPath = caminhoBackupReset(empresaId, bloco, filialId, carimboDeArquivo())

    const { error: erroUpload } = await supabase.storage
      .from('backups-import')
      .upload(backupPath, JSON.stringify(conteudo, null, 2), {
        contentType: 'application/json',
        upsert: false,
      })
    if (erroUpload) throw new Error(erroUpload.message)
  } catch (err) {
    registrarFalha({ escopo: 'dev-destrutivo.resetar-backup', erro: err, operador: aut.uid })
    return {
      ok: false,
      erro: 'Não foi possível gravar o backup. NADA foi apagado — reset sem backup é proibido.',
    }
  }

  // Tipado explicitamente: a porta exige `N extends NomeRpc`, e o tipo inferido de um
  // ternário entre dois literais widened para `string` sem essa anotação.
  const rpc: 'resetar_acervo' | 'resetar_itens' =
    bloco === 'acervo' ? 'resetar_acervo' : 'resetar_itens'
  // `p_filial = null` é o alcance GLOBAL, valor de domínio — a porta aceita null aqui por
  // `ALCANCE_DO_RESET` (src/lib/supabase/rpc.ts).
  const { data, error } = await chamarRpc(supabase, rpc, {
    p_empresa: empresaId,
    p_filial: filialId,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
    p_backup_path: backupPath,
    p_contagens: previa.contagens,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A escrita já aconteceu: forma errada degrada para "sem números" — a action já espalhava o
  // objeto inteiro (`{ ...r, backup_path }`) sem exigir campo nenhum. `rpc` decide qual das
  // duas RPCs rodou, mas as duas têm a MESMA forma (`FORMA_RESETAR_BLOCO`, a união das chaves).
  const lidoR = valorOuFalha(data, FORMA_RESETAR_BLOCO, `dev-destrutivo.resetar-${bloco}`)
  const r: Partial<z.output<typeof FORMA_RESETAR_BLOCO>> = lidoR.ok ? lidoR.valor : {}
  // F54 — a raiz das cópias é o caminho do JSON do backup sem a extensão. O JSON já subiu
  // (antes da RPC, como manda a autoproteção), e a lista de `.docx` só existe agora, no
  // retorno dela — por isso o JSON não pode listar as cópias, e o caminho é derivado.
  const aviso =
    bloco === 'acervo'
      ? await limparArquivosDeTermo(
          r.arquivos_termos ?? [],
          prefixoDasCopias(raizDoBackupEmArquivo(backupPath)),
        )
      : null

  revalidar(bloco === 'acervo' ? ROTAS_ACERVO : ROTAS_ITENS)
  return { ok: true, aviso: aviso ?? undefined, dados: { ...r, backup_path: backupPath } }
}

// ---------------------------------------------------------------------------
// 4b. LIMPAR os `.docx` de termo SEM REGISTRO — a ferramenta nomeada de órfão (F67B)
// ---------------------------------------------------------------------------
// Desde a contração (0198) um `.docx` do bucket `termos` que nenhuma linha de `termos_gerados` referencia é
// inalcançável por qualquer sessão: ninguém o lê, ninguém o apaga. A 8ª checagem (`arquivo_termo_orfao`) os conta;
// esta é a ferramenta que os tira de lá — COPIANDO antes de remover, com trilha. Três passos, nesta ordem:
//   1º  a RPC `registrar_limpeza_termos_sem_linha` (0196), em SQL fixo: só a PLATAFORMA (um `.docx` sem linha não é
//       de empresa nenhuma), justificativa, a confirmação digitada com a contagem de AGORA, e a TRILHA
//       `termos_sem_linha_limpos` gravada ANTES da cópia — ela devolve a lista exata (só os sem linha há mais de 1 hora:
//       um termo no meio da gravação do código anterior à F67B nunca entra);
//   2º  a cópia de cada um para `orfao/<carimbo>/termos/` no `backups-import` (a 12ª checagem reconhece a cópia pela
//       trilha), pela porta única `copiarEntaoRemoverTermos`, que NÃO remove o que não copiou;
//   3º  a remoção, pela mesma porta — client ADMINISTRATIVO (sem linha, nenhuma sessão alcança o objeto).
// Se o 2º/3º falhar, a trilha diz o que deveria ter saído e o aviso diz o que ficou: o `.docx` que ficou continua
// contado pela 8ª checagem, e a ferramenta pode rodar de novo (com outra pasta: o carimbo é novo a cada chamada).
// ⚠ Entregue, NÃO executada em banco vivo na F67B (a prova é o roteiro `storage_por_empresa.sql`, bloco O).
export async function limparTermosSemLinha(input: {
  confirmacao: string
  justificativa: string
}): Promise<DevResult<{ arquivos: number }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = limparTermosSemLinhaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { confirmacao, justificativa } = parsed.data

  const raiz = raizDoOrfao(carimboDeArquivo())
  const { data, error } = await chamarRpc(supabase, 'registrar_limpeza_termos_sem_linha', {
    p_raiz: raiz,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A trilha já foi gravada: forma errada degrada para "nada a copiar" — e então nada é removido (a porta única só
  // remove o que copiou), o que é o lado seguro.
  const lido = valorOuFalha(data, LEITURA_LIMPAR_TERMOS_SEM_LINHA.forma, LEITURA_LIMPAR_TERMOS_SEM_LINHA.rotulo)
  const lista = lido.ok ? lido.valor : []
  const aviso = await limparArquivosDeTermo(lista, prefixoDasCopias(raiz))

  revalidatePath('/dev')
  revalidatePath('/dev/destrutivo')
  return { ok: true, aviso: aviso ?? undefined, dados: { arquivos: lista.length } }
}

// ---------------------------------------------------------------------------
// 5. FORÇAR o estado de um ativo
// ---------------------------------------------------------------------------
export async function forcarEstado(input: {
  ativoId: string
  status: string
  justificativa: string
}): Promise<DevResult<{ alterado: boolean; de: string | null; para: string | null }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = forcarEstadoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { ativoId, status, justificativa } = parsed.data

  const { data, error } = await chamarRpc(supabase, 'forcar_estado_ativo', {
    p_empresa: empresaDaOperacao(),
    p_ativo: ativoId,
    p_status: status,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A escrita já aconteceu: forma errada degrada para "não alterado" — o `?? false`/`?? null`
  // abaixo já tratava dado ausente do mesmo jeito.
  const lidoR = valorOuFalha(data, LEITURA_FORCAR_ESTADO.forma, LEITURA_FORCAR_ESTADO.rotulo)
  const r: Partial<z.output<typeof LEITURA_FORCAR_ESTADO.forma>> = lidoR.ok ? lidoR.valor : {}
  revalidar(ROTAS_ACERVO)
  return {
    ok: true,
    aviso: r.alterado === false ? 'O ativo já estava nesse estado — nada foi registrado.' : undefined,
    dados: { alterado: r.alterado ?? false, de: r.de ?? null, para: r.para ?? null },
  }
}

// ---------------------------------------------------------------------------
// 6. FORÇAR o saldo de um item numa filial
// ---------------------------------------------------------------------------
export async function forcarSaldo(input: {
  itemId: number
  filialId: number
  saldoAlvo: number
  justificativa: string
}): Promise<DevResult<{ alterado: boolean; de: number | null; para: number | null; delta: number | null }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = forcarSaldoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { itemId, filialId, saldoAlvo, justificativa } = parsed.data

  // F67: a empresa é a DA FILIAL (o banco confere que o item é dela também).
  let empresaId: string | null
  try {
    empresaId = await empresaDaFilial(supabase, filialId)
  } catch (err) {
    registrarFalha({ escopo: 'dev-destrutivo.forcar-saldo-empresa', erro: err, operador: aut.uid })
    return { ok: false, erro: 'Não foi possível conferir a filial agora. Nada foi alterado — tente de novo em instantes.' }
  }
  if (empresaId === null) return { ok: false, erro: 'Filial não encontrada.' }

  const { data, error } = await chamarRpc(supabase, 'forcar_saldo_item', {
    p_empresa: empresaId,
    p_item: itemId,
    p_filial: filialId,
    p_saldo_alvo: saldoAlvo,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A escrita já aconteceu: forma errada degrada para "não alterado" — o `?? false`/`?? null`
  // abaixo já tratava dado ausente do mesmo jeito.
  const lidoR = valorOuFalha(data, LEITURA_FORCAR_SALDO.forma, LEITURA_FORCAR_SALDO.rotulo)
  const r: Partial<z.output<typeof LEITURA_FORCAR_SALDO.forma>> = lidoR.ok ? lidoR.valor : {}
  revalidar(ROTAS_ITENS)
  return {
    ok: true,
    aviso:
      r.alterado === false
        ? 'O saldo já era esse — nenhum lançamento foi criado.'
        : undefined,
    dados: {
      alterado: r.alterado ?? false,
      de: r.de ?? null,
      para: r.para ?? null,
      delta: r.delta ?? null,
    },
  }
}

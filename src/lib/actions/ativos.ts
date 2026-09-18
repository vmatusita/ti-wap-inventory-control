'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirEscrita, exigirPapel } from '@/lib/auth/acesso'
import { chamarRpc } from '@/lib/supabase/rpc'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  anotacaoSchema,
  corrigirPatrimonioSchema,
  definirServiceTagSchema,
  editarAtivoSchema,
  validarCorrecaoPatrimonio,
} from '@/lib/validators/ativo'
import { PENDENCIA_SEM_PATRIMONIO, PENDENCIA_SEM_SERVICE_TAG } from '@/lib/dominio'
import {
  ALCANCE_DA_RECUSA_MANUAL,
  cadastrosComMesmaIdentidade,
  chaveDeIdentidadeSemUnidade,
} from '@/lib/ativos/identidade'

// Remove UM trecho de uma pendência `;`-joinable (comparação case-insensitive),
// preservando os demais (ex.: 'sem patrimônio físico; termo pendente' → 'termo
// pendente'). String vazia após a limpeza vira null (sem pendência). PURA.
function limparTrechoPendencia(pendencia: string | null, trecho: string): string | null {
  if (!pendencia) return pendencia
  const restantes = pendencia
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t !== '' && t.toLowerCase() !== trecho.toLowerCase())
  return restantes.length > 0 ? restantes.join('; ') : null
}

function limparPendenciaSemPatrimonio(pendencia: string | null): string | null {
  return limparTrechoPendencia(pendencia, PENDENCIA_SEM_PATRIMONIO)
}

// ---------------------------------------------------------------------------
// F24 — A CHECAGEM GLOBAL DE IDENTIDADE, que virou a ÚNICA linha de defesa.
//
// Até a migration 0091, `corrigirPatrimonio` e `definirServiceTag` não precisavam procurar
// nada: os índices únicos eram GLOBAIS, então uma edição que criasse um par já existente em
// QUALQUER filial estourava 23505 e virava mensagem amigável em `erros.ts`. O banco era a
// rede, e o código só traduzia a queda.
//
// A F24 tornou a identidade POR FILIAL — de propósito, para o conflito entre filiais poder
// existir. Só que a decisão do Johnny (§1.4 da ordem) é explícita: o conflito nasce SÓ do
// import. Cadastro manual e edição de ficha continuam recusando par que exista em qualquer
// filial. Sem esta função, as duas actions passariam a ABRIR conflito em silêncio — um
// caminho que ninguém pediu e que nem apareceria como aviso.
//
// O que ela NÃO promete: duas abas editando ao mesmo tempo deixam de esbarrar no banco
// (dentro da mesma filial o índice ainda pega; entre filiais, não). É corrida estreita, o
// resultado dela é um conflito visível na mesa — não corrupção —, e é o mesmo modelo de
// outras validações da casa. Aceito e registrado em docs/DECISOES.md.
//
// A régua espelha `chave_identidade_ativo` (migration 0099): com patrimônio, o par exato;
// sem patrimônio, a service tag sozinha. Comparação EXATA, como os índices.
//
// F57 — a CONSULTA mudou de casa: mora em `ativos/identidade.ts`, a mesma que a compra e o
// substituto da devolução usam, com o alcance de TODAS as unidades nomeado na chamada. O que
// fica aqui são as duas leituras próprias desta função, que não mudam: a service tag sem espaço
// nas pontas, e o patrimônio vazio tratado como "sem patrimônio".
async function filialComMesmaIdentidade(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patrimonio: string | null,
  serviceTag: string | null,
  exetoAtivoId: string,
): Promise<string | null> {
  const par = { patrimonio: patrimonio ? patrimonio : null, serviceTag: (serviceTag ?? '').trim() }

  const res = await cadastrosComMesmaIdentidade(supabase, [par], {
    alcance: ALCANCE_DA_RECUSA_MANUAL,
    excetoAtivoId: exetoAtivoId,
  })
  if (!res.ok) throw new Error(res.erro.message)

  // Sem patrimônio E sem tag = sem identidade: nada a conferir (a consulta nem roda).
  const chave = chaveDeIdentidadeSemUnidade(par.patrimonio, par.serviceTag)
  const primeiro = chave === null ? undefined : res.porChave.get(chave)?.[0]
  return primeiro ? (primeiro.filialNome ?? 'outra filial') : null
}

// ---------------------------------------------------------------------------
// F21 — a guarda de cargo/vínculo vem em DUAS METADES, e a ordem tem motivo.
//
// A filial que autoriza escrever num ativo é a CORRENTE dele — exatamente a que a
// policy `pode_escrever_filial(filial_id)` (migration 0063) avalia —, e ela só se
// conhece depois de ler o ativo. Mas a leitura, sem sessão, volta VAZIA pela RLS: se
// a guarda viesse só depois dela, "sessão expirada" e "usuário desativado" chegariam
// à tela como "Ativo não encontrado", mandando a pessoa caçar um ativo que existe e
// ela só não pode ver.
//
// Daí: `exigirPapel('operador')` ANTES da leitura (resolve sessão, desativação e o
// cargo `consulta`) e `exigirEscrita(filial do ativo)` DEPOIS (resolve o vínculo).
// São as duas metades da mesma guarda. O custo é reconferir a sessão uma vez; nesta
// escala (dezena de usuários) é irrelevante — a própria ADR-002 §4 registra a troca
// de latência por revogação imediata. Mesmo padrão em movimentacoes.ts e termos.ts.
// ---------------------------------------------------------------------------

export async function anotarAtivo(input: {
  ativo_id: string
  texto: string
}): Promise<ActionResult> {
  const parsed = anotacaoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  // `anotacoes` não tem filial (a policy dela é só por cargo), mas a anotação é um
  // registro SOBRE o ativo: quem não escreve na filial do ativo também não anota nele
  // (ADR-002 §3, linha "Editar ativo, corrigir patrimônio, service tag, anotar").
  const { data: ativo, error: eFilial } = await supabase
    .from('ativos')
    .select('filial_id')
    .eq('id', parsed.data.ativo_id)
    .maybeSingle()
  if (eFilial) return { ok: false, erro: traduzErroBanco(eFilial.message, eFilial.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  const aut = await exigirEscrita(supabase, ativo.filial_id)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const { error } = await supabase.from('anotacoes').insert({
    ativo_id: parsed.data.ativo_id,
    texto: parsed.data.texto,
    criado_por: aut.uid,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  revalidatePath(`/ativos/${parsed.data.ativo_id}`)
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// Atualiza SO os campos cadastrais NAO derivados (OS-F2 3.2.4). Status,
// colaborador, setor e filial NAO entram — mudam apenas por movimentacao.
export async function atualizarDadosCadastrais(input: {
  id: string
  memoria?: string
  armazenamento?: string
  processador?: string
  hostname?: string
  // F25 — campos do celular (migration 0101).
  telefone?: string
  imei?: string
  pulsus?: string
  observacoes?: string
  termo_assinado?: string | null
  termo_data?: string | null
}): Promise<ActionResult> {
  const parsed = editarAtivoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { id, ...campos } = parsed.data

  // Este update é `.eq('id', id)` e não lê o ativo antes — a filial vem de um lookup
  // próprio, porque é ela (a corrente) que o vínculo de escrita exige.
  const { data: ativo, error: eFilial } = await supabase
    .from('ativos')
    .select('filial_id')
    .eq('id', id)
    .maybeSingle()
  if (eFilial) return { ok: false, erro: traduzErroBanco(eFilial.message, eFilial.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  const aut = await exigirEscrita(supabase, ativo.filial_id)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const { error } = await supabase
    .from('ativos')
    .update({
      memoria: campos.memoria ?? null,
      armazenamento: campos.armazenamento ?? null,
      processador: campos.processador ?? null,
      hostname: campos.hostname ?? null,
      // ⚠ Este update é OVERWRITE TOTAL: campo ausente do payload vira NULL. Por
      // isso os três entram SEMPRE (o formulário os mantém no estado mesmo
      // quando não os desenha) — do contrário, salvar a ficha de um celular por
      // um caminho que não populasse os campos apagaria o IMEI em silêncio.
      telefone: campos.telefone ?? null,
      imei: campos.imei ?? null,
      pulsus: campos.pulsus ?? null,
      observacoes: campos.observacoes ?? null,
      termo_assinado: campos.termo_assinado,
      termo_data: campos.termo_data,
    })
    .eq('id', id)

  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${id}`)
  // Este update grava `termo_assinado`/`termo_data` — as MESMAS colunas que a
  // pendência 'termo pendente' (v_pendencias) e a coluna Termo do relatório leem.
  // Toda outra action que as toca (confirmarAssinaturaTermo, desfazerConfirmacao,
  // gerarTermo) revalida as duas rotas; só esta não revalidava, deixando a fila e
  // o relatório servido ao visualizador por senha divergentes da ficha.
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// corrigirPatrimonio (B7, F6B) — o patrimônio pode ser corrigido; a service tag
// é IMUTÁVEL (identidade do equipamento, nunca editável). O novo valor é sempre
// canonicalizado (WAP0004491). Rastro "de → para" na `anotacoes` (imutável,
// autor+data já na linha do tempo). Não toca `patrimonio_original` (valor da
// planilha) nem `service_tag`. Congelados (relatórios/termos gerados) guardam o
// texto da época de propósito; o relatório ao vivo reflete via join.
// ---------------------------------------------------------------------------
export async function corrigirPatrimonio(input: {
  ativo_id: string
  patrimonio_novo: string
}): Promise<ActionResult> {
  const parsed = corrigirPatrimonioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { ativo_id } = parsed.data

  // `filial_id` entra no select que já existia (não é query nova): é o insumo do
  // vínculo de escrita.
  const { data: ativo, error: eLer } = await supabase
    .from('ativos')
    // F24 — `service_tag` entra no select que já existia (não é query nova): sem ela não dá
    // para montar o par e conferir a identidade contra as outras filiais.
    .select('patrimonio, service_tag, pendencia, filial_id')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message, eLer.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  const aut = await exigirEscrita(supabase, ativo.filial_id)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const validacao = validarCorrecaoPatrimonio(ativo.patrimonio, parsed.data.patrimonio_novo)
  if (!validacao.ok) return { ok: false, erro: validacao.erro }
  // No-op: já é o mesmo patrimônio canônico — não escreve nem cria anotação.
  if (validacao.noop) return { ok: true }

  const antigo = ativo.patrimonio
  const novo = validacao.patrimonio

  // F24 — a checagem que o índice global fazia até a 0091. Corrigir o patrimônio não pode
  // criar um par que já exista em OUTRA filial: conflito entre filiais nasce só do import.
  try {
    const jaEm = await filialComMesmaIdentidade(supabase, novo, ativo.service_tag, ativo_id)
    if (jaEm) {
      return {
        ok: false,
        erro: `Já existe um ativo ${novo}${ativo.service_tag ? ` com service tag ${ativo.service_tag}` : ' sem service tag'} na filial ${jaEm}. Corrigir o patrimônio para este valor criaria dois cadastros do mesmo equipamento.`,
      }
    }
  } catch (e) {
    return { ok: false, erro: traduzErroBanco((e as Error).message) }
  }

  // F7E — ao dar patrimônio a um ativo que veio sem plaqueta, encerra o trecho
  // 'sem patrimônio físico' da pendência (preservando os demais, ex.: termo).
  const pendenciaLimpa = limparPendenciaSemPatrimonio(ativo.pendencia)

  // Reauditoria 18/09/2026 (item U, migration 0149) — patrimônio + pendência e a
  // anotação "de → para" gravam na MESMA transação: o update pode falhar de forma
  // PREVISÍVEL (patrimônio/service tag duplicado, §5), e uma anotação órfã deixaria, para
  // sempre, uma correção que não aconteceu. "de" nulo (ativo sem patrimônio) → "de sem
  // patrimônio para WAP…". p_pendencia é sentinela (''=sem pendência; nunca null pela porta),
  // e só é gravada quando MUDOU — a mesma regra do `.update()` de antes, que não regravava a
  // coluna com o valor lido quando nada mudou (senão desfaria uma escrita concorrente nela).
  const { error: eRpc } = await chamarRpc(supabase, 'corrigir_patrimonio_com_anotacao', {
    p_ativo_id: ativo_id,
    p_patrimonio: novo,
    p_pendencia: pendenciaLimpa ?? '',
    p_alterar_pendencia: pendenciaLimpa !== ativo.pendencia,
    p_texto_anotacao: `Patrimônio corrigido de ${antigo ?? 'sem patrimônio'} para ${novo}.`,
  })
  // Violação do par único patrimônio + service tag → mensagem amigável (erros.ts); a RPC
  // recusa (nada grava) se o UPDATE afetar 0 linhas.
  if (eRpc) return { ok: false, erro: traduzErroBanco(eRpc.message, eRpc.code) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${ativo_id}`)
  // A pendência 'sem patrimônio físico' pode ter sido encerrada — atualiza a fila.
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// definirServiceTag (F15/C1) — espelho do corrigirPatrimonio, mas para a service
// tag e SÓ quando ela está VAZIA (ativo importado sem tag). Editar uma ST já
// preenchida continua PROIBIDO (imutável — identidade do equipamento): a action
// recusa. Ao definir, remove só o trecho 'sem service tag' da pendência
// (preservando os demais). Rastro "de → para" na `anotacoes` (imutável). A colisão
// do par patrimônio + service tag (§5, índice único) vira mensagem amigável (erros.ts).
// ---------------------------------------------------------------------------
export async function definirServiceTag(input: {
  ativo_id: string
  service_tag: string
}): Promise<ActionResult> {
  const parsed = definirServiceTagSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { ativo_id, service_tag } = parsed.data

  const { data: ativo, error: eLer } = await supabase
    .from('ativos')
    // F24 — `patrimonio` entra no select que já existia: sem ele não dá para montar o par
    // e conferir a identidade contra as outras filiais.
    .select('patrimonio, service_tag, pendencia, filial_id')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message, eLer.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  const aut = await exigirEscrita(supabase, ativo.filial_id)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // Imutabilidade: só DEFINE quando está vazia; ST já preenchida nunca muda.
  if (ativo.service_tag != null && ativo.service_tag.trim() !== '') {
    return {
      ok: false,
      erro: 'Este ativo já tem service tag — ela é imutável (identidade do equipamento).',
    }
  }

  // F24 — a checagem que o índice global fazia até a 0091. Definir a service tag não pode
  // criar um par que já exista em OUTRA filial: conflito entre filiais nasce só do import.
  // Vale para os dois casos de identidade — o ativo COM patrimônio (o par) e o SEM
  // patrimônio (a tag sozinha, que é justamente o caso comum aqui).
  try {
    const jaEm = await filialComMesmaIdentidade(supabase, ativo.patrimonio, service_tag, ativo_id)
    if (jaEm) {
      return {
        ok: false,
        erro: ativo.patrimonio
          ? `Já existe um ativo ${ativo.patrimonio} com service tag ${service_tag} na filial ${jaEm}. Definir esta tag criaria dois cadastros do mesmo equipamento.`
          : `Já existe um ativo sem patrimônio com a service tag ${service_tag} na filial ${jaEm}. Sem plaqueta, é a service tag que identifica a máquina.`,
      }
    }
  } catch (e) {
    return { ok: false, erro: traduzErroBanco((e as Error).message) }
  }

  // Encerra só o trecho 'sem service tag' da pendência (preserva os demais).
  const pendenciaLimpa = limparTrechoPendencia(ativo.pendencia, PENDENCIA_SEM_SERVICE_TAG)

  // Reauditoria 18/09/2026 (item U, migration 0149) — mesma transação (ver o
  // comentário espelho em corrigirPatrimonio, acima).
  const { error: eRpc } = await chamarRpc(supabase, 'definir_service_tag_com_anotacao', {
    p_ativo_id: ativo_id,
    p_service_tag: service_tag,
    p_pendencia: pendenciaLimpa ?? '',
    p_alterar_pendencia: pendenciaLimpa !== ativo.pendencia,
    p_texto_anotacao: `Service tag definida: ${service_tag}.`,
  })
  // Violação do par único patrimônio + service tag → mensagem amigável (erros.ts); a RPC
  // recusa (nada grava) se o UPDATE afetar 0 linhas.
  if (eRpc) return { ok: false, erro: traduzErroBanco(eRpc.message, eRpc.code) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${ativo_id}`)
  // A pendência 'sem service tag' pode ter sido encerrada — atualiza a fila.
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

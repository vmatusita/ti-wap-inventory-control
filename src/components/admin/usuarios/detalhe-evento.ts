import { PAPEL_ROTULO, ePapelValido } from '@/lib/auth/papeis'
import type { Json } from '@/lib/types/database'

// Tradução do `detalhe` (jsonb) de um evento de auditoria para uma frase em pt-BR (F21).
//
// Arquivo SEPARADO da tabela de propósito: é função pura, com teste próprio, e assim o teste
// não precisa carregar React nem os componentes de UI.
//
// `eventos_admin.detalhe` é jsonb LIVRE — a trilha aceita evento gravado por uma versão
// futura do app, e `acao` é TEXT (migration 0065). Por isso tudo aqui é defensivo: forma
// reconhecida vira frase; o resto vira o JSON cru truncado. Deixar a célula vazia por não
// entender o detalhe seria pior — a trilha existe justamente para ser lida meses depois.

function comoObjeto(d: Json | null): Record<string, Json> | null {
  return d !== null && typeof d === 'object' && !Array.isArray(d)
    ? (d as Record<string, Json>)
    : null
}

function rotuloDePapel(v: Json | undefined): string | null {
  return ePapelValido(v) ? PAPEL_ROTULO[v] : null
}

function nomesDeFiliais(
  v: Json | undefined,
  nomeFilial: (id: number) => string,
): string | null {
  if (!Array.isArray(v)) return null
  const nomes = v.filter((x): x is number => typeof x === 'number').map(nomeFilial)
  return nomes.length > 0 ? nomes.join(', ') : 'nenhuma'
}

function texto(v: Json | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function numero(v: Json | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Limite da célula: `detalhe` desconhecido não pode esticar a tabela indefinidamente. */
const MAX_CRU = 140

/** Quanto da justificativa cabe na célula antes de virar reticências. */
const MAX_JUSTIFICATIVA = 90

const ACOES_F23 = new Set([
  'ativo_apagado',
  'movimentacao_apagada',
  'item_apagado',
  'acervo_resetado',
  'itens_resetados',
  'estado_forcado',
  'saldo_forcado',
])

// Plural explícito, sem regra automática: em pt-BR "movimentação" não vira "movimentaçãos".
function conta(n: number, singular: string, plural: string): string | null {
  return n > 0 ? `${n} ${n === 1 ? singular : plural}` : null
}

/** Contagens de um reset: lidas de `antes`, que é onde a RPC as grava. */
function contagensDoReset(o: Record<string, Json>): string | null {
  const antes = comoObjeto(o.antes ?? null)
  if (!antes) return null
  const itens = [
    conta(numero(antes.ativos) ?? 0, 'ativo', 'ativos'),
    conta(numero(antes.movimentacoes) ?? 0, 'movimentação', 'movimentações'),
    conta(numero(antes.termos) ?? 0, 'termo', 'termos'),
    conta(numero(antes.lancamentos) ?? 0, 'lançamento', 'lançamentos'),
  ].filter((x): x is string => x !== null)
  return itens.length > 0 ? `apagados: ${itens.join(', ')}` : 'nada a apagar'
}

// As sete ferramentas destrutivas (F23). A ordem das partes é sempre a mesma: O QUE mudou,
// QUANTO, e por fim a JUSTIFICATIVA — que é o dado que dá sentido a tudo quando alguém lê a
// trilha meses depois e o registro original não existe mais.
function descreverDestrutivo(
  acao: string,
  o: Record<string, Json>,
  nomeFilial: (id: number) => string,
): string[] {
  const partes: string[] = []

  if (acao === 'ativo_apagado') {
    const n = [
      conta(numero(o.movimentacoes) ?? 0, 'movimentação', 'movimentações'),
      conta(numero(o.termos) ?? 0, 'termo', 'termos'),
      conta(numero(o.anotacoes) ?? 0, 'anotação', 'anotações'),
      conta(numero(o.pendencias_item) ?? 0, 'pendência', 'pendências'),
    ].filter((x): x is string => x !== null)
    partes.push(n.length > 0 ? `levou junto: ${n.join(', ')}` : 'sem rastro associado')
    const fil = numero(o.filial_id)
    if (fil !== null) partes.push(`Filial: ${nomeFilial(fil)}`)
  } else if (acao === 'movimentacao_apagada') {
    const tipo = texto(o.tipo)
    const de = texto(o.status_antes)
    const para = texto(o.status_depois)
    if (tipo) partes.push(`Tipo: ${tipo}`)
    if (de && para) partes.push(`revertida ${para} → ${de}`)
  } else if (acao === 'item_apagado') {
    const n = conta(numero(o.lancamentos) ?? 0, 'lançamento', 'lançamentos')
    partes.push(n ? `levou junto: ${n}` : 'sem lançamentos')
  } else if (acao === 'acervo_resetado' || acao === 'itens_resetados') {
    const alcance = texto(o.alcance)
    const fil = numero(o.filial_id)
    partes.push(
      alcance === 'global' ? 'Alcance: SISTEMA INTEIRO' : `Filial: ${fil !== null ? nomeFilial(fil) : '—'}`,
    )
    const c = contagensDoReset(o)
    if (c) partes.push(c)
    const bp = texto(o.backup_path)
    if (bp) partes.push(`backup: ${bp}`)
  } else if (acao === 'estado_forcado') {
    const de = texto(o.de)
    const para = texto(o.para)
    if (de && para) partes.push(`${de} → ${para}`)
    if (o.detentor_zerado === true) partes.push('detentor zerado')
  } else if (acao === 'saldo_forcado') {
    const de = numero(o.de)
    const para = numero(o.para)
    const delta = numero(o.delta)
    if (de !== null && para !== null) partes.push(`saldo ${de} → ${para}`)
    if (delta !== null) partes.push(`ajuste de ${delta > 0 ? '+' : ''}${delta}`)
  }

  const j = texto(o.justificativa)
  if (j) {
    partes.push(
      `“${j.length > MAX_JUSTIFICATIVA ? `${j.slice(0, MAX_JUSTIFICATIVA)}…` : j}”`,
    )
  }
  // O backup vai no jsonb do evento, mas NÃO na célula — só o aviso de que ele foi cortado,
  // que é o que muda a leitura de quem for recuperá-lo.
  if (o.backup_truncado === true) partes.push('backup TRUNCADO em 500 linhas')

  return partes
}

export function descreverDetalhe(
  acao: string,
  detalhe: Json | null,
  nomeFilial: (id: number) => string,
): string | null {
  if (detalhe === null) return null
  const o = comoObjeto(detalhe)
  if (!o) return JSON.stringify(detalhe).slice(0, MAX_CRU)

  const partes: string[] = []

  if (acao === 'papel_alterado') {
    const de = rotuloDePapel(o.de)
    const para = rotuloDePapel(o.para)
    if (de && para) partes.push(`${de} → ${para}`)
  } else if (acao === 'vinculos_alterados') {
    const agora = nomesDeFiliais(o.filiais, nomeFilial)
    const antes = nomesDeFiliais(o.de, nomeFilial)
    if (agora) partes.push(`Filiais: ${agora}`)
    if (antes) partes.push(`antes: ${antes}`)
  } else if (acao === 'import_executado') {
    // O evento mais consequente da trilha, e o único cujo `detalhe` não fala de cargo nem de
    // vínculo: sem ramo próprio ele caía no `else`, não achava `papel`/`filiais` e virava JSON
    // cru truncado em 140 caracteres — cortado justamente no meio dos números que importam
    // (quantos ativos entraram e quanto foi APAGADO). Ver `aplicarImport` em
    // src/lib/actions/importar.ts para a forma gravada.
    const nome = texto(o.filial_nome)
    if (nome) partes.push(`Filial: ${nome}`)
    const criados = numero(o.ativos_criados)
    if (criados !== null) partes.push(`${criados} ativo(s) criado(s)`)
    const movs = numero(o.movs_apagadas)
    const anot = numero(o.anotacoes_apagadas)
    const termos = numero(o.termos_apagados)
    if (movs !== null || anot !== null || termos !== null) {
      partes.push(
        `apagados: ${movs ?? 0} mov., ${anot ?? 0} anot., ${termos ?? 0} termo(s)`,
      )
    }
    const correcoes = numero(o.correcoes)
    if (correcoes) partes.push(`${correcoes} correção(ões)`)
  } else if (ACOES_F23.has(acao)) {
    // ⚠ Sem estes ramos, os sete verbos da F23 cairiam no fallback de JSON cru — e seria o
    // pior caso possível dele: o `detalhe` destes eventos carrega o BACKUP das linhas
    // apagadas, então os 140 caracteres sairiam cheios do jsonb do backup e a célula não
    // mostraria nem a justificativa nem os números. O backup existe para ser recuperado da
    // trilha, não para ser lido na tabela.
    partes.push(...descreverDestrutivo(acao, o, nomeFilial))
  } else {
    const papel = rotuloDePapel(o.papel)
    if (papel) partes.push(`Cargo: ${papel}`)
    const filiais = nomesDeFiliais(o.filiais, nomeFilial)
    if (filiais) partes.push(`Filiais: ${filiais}`)
  }

  // Sinalização de gravação PARCIAL: é a informação mais útil da trilha quando algo saiu
  // pela metade (convite criado sem cargo, desativação sem o ban do Auth).
  if (o.cargo_gravado === false) partes.push('cargo NÃO gravado')
  if (o.vinculos_gravados === false) partes.push('filiais NÃO gravadas')
  if (o.login_no_auth === 'falhou') partes.push('bloqueio de login no Auth falhou')
  // Reenvio de link para conta DESLIGADA (`convidarUsuario`): sem isto o único detalhe do
  // evento virava `{"conta_desativada":true}` cru na célula.
  if (o.conta_desativada === true) partes.push('a conta estava DESATIVADA')

  return partes.length > 0 ? partes.join(' · ') : JSON.stringify(detalhe).slice(0, MAX_CRU)
}

'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  confirmarAssinaturaSchema,
  desfazerAssinaturaSchema,
} from '@/lib/validators/ativo'
import { formatDate, hojeISO } from '@/lib/format'
import type { CategoriaAtivo } from '@/lib/dominio'
import {
  TERMO_ARQUIVO,
  TERMO_ROTULO,
  familiaDoTipo,
  type FamiliaTermo,
  type TermoTipo,
} from '@/lib/termos/tipos'
import { dataPorExtenso, mesAnoPorExtenso } from '@/lib/termos/datas'
import {
  concatenarEquipamentos,
  descricaoDevolucao,
  observacaoSugestao,
  ordenarEquipamentos,
} from '@/lib/termos/devolucao'
import {
  gerarTermoSchema,
  prepararTermoSchema,
  type CamposTermo,
} from '@/lib/validators/termo'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Payload do merge (jsonb + docx): os campos editáveis do dialog + as datas por
// extenso derivadas no servidor a partir de `data`.
type DadosTermo = CamposTermo & {
  data: string
  data_extenso: string
  data_mes_ano: string
}

// ---------------------------------------------------------------------------
// prepararTermo — lê movimentações + ativos e monta o pré-preenchimento editável
// do dialog (§3.9). Serve tanto ao painel de sucesso quanto à ficha (retroativo).
// ---------------------------------------------------------------------------
export type PreparacaoTermo = {
  ok: boolean
  erro?: string
  familia: FamiliaTermo
  ativoIds: string[]
  categorias: CategoriaAtivo[]
  data: string
  colaborador: string
  campos: CamposTermo
  avisos: string[]
  // Termos já salvos para EXATAMENTE este conjunto de movimentações (edição).
  existentes: { tipo: TermoTipo; dados: CamposTermo & { data?: string } }[]
}

type MovRow = {
  id: string
  tipo: string
  motivo: string | null
  colaborador: string | null
  chamado: string | null
  itens_faltantes: string[] | null
  snapshot_anterior: { colaborador?: string | null } | null
  ativo: {
    id: string
    categoria: CategoriaAtivo
    marca: string | null
    modelo: string | null
    service_tag: string | null
    patrimonio: string | null
    colaborador_atual: string | null
  } | null
  motivo_rel: { rotulo: string } | null
}

const MOV_SELECT =
  'id, tipo, motivo, colaborador, chamado, itens_faltantes, snapshot_anterior, ' +
  'ativo:ativos!movimentacoes_ativo_id_fkey(id, categoria, marca, modelo, service_tag, patrimonio, colaborador_atual), ' +
  'motivo_rel:motivos!movimentacoes_motivo_fkey(rotulo)'

function falhaPrep(erro: string): PreparacaoTermo {
  return {
    ok: false,
    erro,
    familia: 'responsabilidade',
    ativoIds: [],
    categorias: [],
    data: hojeISO(),
    colaborador: '',
    campos: {},
    avisos: [],
    existentes: [],
  }
}

export async function prepararTermo(input: {
  movimentacaoIds: string[]
  familia: FamiliaTermo
}): Promise<PreparacaoTermo> {
  const parsed = prepararTermoSchema.safeParse(input)
  if (!parsed.success) return falhaPrep('Dados inválidos para preparar o termo.')

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return falhaPrep(MSG_SESSAO_EXPIRADA)

  const { movimentacaoIds, familia } = parsed.data

  const { data, error } = await supabase
    .from('movimentacoes')
    .select(MOV_SELECT)
    .in('id', movimentacaoIds)
  if (error) return falhaPrep(traduzErroBanco(error.message, error.code))
  const movs = (data ?? []) as unknown as MovRow[]
  if (movs.length === 0) return falhaPrep('Movimentação não encontrada.')

  const hoje = hojeISO()
  const ativos = movs.map((m) => m.ativo).filter((a): a is NonNullable<MovRow['ativo']> => !!a)
  const categorias = ativos.map((a) => a.categoria)
  const ativoIds = ativos.map((a) => a.id)

  // Termos já salvos para EXATAMENTE este conjunto (edição / troca de variante).
  const sortedIds = [...movimentacaoIds].sort()
  const { data: existRows } = await supabase
    .from('termos_gerados')
    .select('tipo, dados')
    .contains('movimentacao_ids', sortedIds)
    .containedBy('movimentacao_ids', sortedIds)
  const existentes = ((existRows ?? []) as { tipo: TermoTipo; dados: CamposTermo & { data?: string } }[])
    .filter((r) => familiaDoTipo(r.tipo) === familia)

  const avisos: string[] = []

  if (familia === 'responsabilidade') {
    const mov = movs[0]
    const a = mov.ativo
    if (!a) return falhaPrep('Ativo não encontrado.')
    const colaborador = mov.colaborador ?? a.colaborador_atual ?? ''
    const faltando = [
      !a.marca && 'marca',
      !a.modelo && 'modelo',
      !a.service_tag && 'service tag',
      !a.patrimonio && 'patrimônio',
    ].filter(Boolean) as string[]
    if (faltando.length > 0) {
      avisos.push(`O ativo não tem ${faltando.join(', ')} cadastrado(s) — o campo sai em branco.`)
    }
    const campos: CamposTermo = {
      colaborador,
      marca: a.marca ?? '',
      modelo: a.modelo ?? '',
      service_tag: a.service_tag ?? '',
      patrimonio: a.patrimonio ?? '',
      chamado: mov.chamado ?? '',
      // extras do celular — vazios (manuais, §4.1)
      telefone: '',
      imei: '',
      pulsus: '',
      obs: '',
    }
    return {
      ok: true,
      familia,
      ativoIds: [a.id],
      categorias: [a.categoria],
      data: hoje,
      colaborador,
      campos,
      avisos,
      existentes,
    }
  }

  // familia === 'devolucao'
  const ordenados = ordenarEquipamentos(
    ativos.map((a) => ({
      categoria: a.categoria,
      // Preserva o nulo (F7E): ordena por último e imprime "sem patrimônio".
      patrimonio: a.patrimonio,
      service_tag: a.service_tag,
      marca: a.marca,
      modelo: a.modelo,
    })),
  )
  const { series, patrimonios, marcas_modelos } = concatenarEquipamentos(ordenados)
  const motivoCodigo = movs[0].motivo
  const motivoRotulo = movs[0].motivo_rel?.rotulo ?? null
  // Colaborador que devolve = quem detinha o ativo ANTES da devolução (o trigger
  // limpa colaborador_atual). Fonte: snapshot_anterior da movimentação. Ordenado
  // (a busca .in não garante ordem) para ser determinístico; se o lote misturar
  // donos diferentes, avisa — o termo é um documento único (§3.3/§3.7).
  const donos = [
    ...new Set(
      movs.map((m) => m.snapshot_anterior?.colaborador).filter((c): c is string => !!c),
    ),
  ].sort()
  const colaborador = donos[0] ?? ''
  if (donos.length > 1) {
    avisos.push(
      `Este lote tem equipamentos de mais de um colaborador (${donos.join(', ')}). ` +
        `O termo de devolução é um documento único — confira o nome ou gere termos separados por colaborador.`,
    )
  }
  const itensFaltantes = movs.flatMap((m) => m.itens_faltantes ?? [])
  // Responsável de TI = operador logado (automático, §4.2).
  const { data: perfil } = await supabase
    .from('profiles')
    .select('nome')
    .eq('id', uid)
    .maybeSingle()
  const campos: CamposTermo = {
    colaborador,
    descricao: descricaoDevolucao(motivoCodigo, motivoRotulo),
    series,
    patrimonios,
    marcas_modelos,
    outros_componentes: '',
    observacao: observacaoSugestao(itensFaltantes),
    tecnico: perfil?.nome ?? '',
  }
  return {
    ok: true,
    familia,
    ativoIds,
    categorias,
    data: hoje,
    colaborador,
    campos,
    avisos,
    existentes,
  }
}

// ---------------------------------------------------------------------------
// gerarTermo — renderiza o .docx, grava no Storage + tabela (versão única),
// aplica a flag 'gerado' nos ativos (responsabilidade) e devolve URL assinada.
// ---------------------------------------------------------------------------
export type GeracaoTermo = {
  ok: boolean
  erro?: string
  id?: string
  url?: string
  nomeArquivo?: string
}

// Renderiza o .docx do template `tipo` com o payload `dados`. Lança se o arquivo
// não existir ou o merge falhar — o orquestrador traduz para mensagem amigável.
async function renderizarDocx(
  tipo: TermoTipo,
  dados: DadosTermo,
): Promise<Buffer> {
  const arquivo = path.join(
    process.cwd(),
    'src',
    'templates',
    'termos',
    TERMO_ARQUIVO[tipo],
  )
  const content = await readFile(arquivo)
  const zip = new PizZip(content)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  })
  doc.render(dados)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// Grava o termo em versão única (§3.10): sobe o .docx no Storage e faz upsert da
// linha em `termos_gerados` para ESTE conjunto de movimentações, removendo órfãos
// de variantes antigas do mesmo conjunto. Devolve o id e o path do arquivo.
async function persistirTermo(
  supabase: ServerClient,
  params: {
    tipo: TermoTipo
    movimentacaoIds: string[]
    ativoIds: string[]
    campos: CamposTermo
    dados: DadosTermo
    buffer: Buffer
    uid: string
  },
): Promise<
  { ok: true; id: string; arquivoPath: string } | { ok: false; erro: string }
> {
  const { tipo, movimentacaoIds, ativoIds, campos, dados, buffer, uid } = params
  const sortedMovIds = [...movimentacaoIds].sort()

  // Termos já existentes para ESTE conjunto de movimentações.
  const { data: existentes } = await supabase
    .from('termos_gerados')
    .select('id, arquivo_path')
    .contains('movimentacao_ids', sortedMovIds)
    .containedBy('movimentacao_ids', sortedMovIds)

  const reutilizar = existentes?.[0]
  const id = reutilizar?.id ?? randomUUID()
  const arquivoPath = `${id}.docx`

  // Remove órfãos: linhas/objetos de variantes antigas do mesmo conjunto (ex.:
  // trocar monitor interno ↔ home office) — mantém uma só versão por movimentações.
  const orfaos = (existentes ?? []).filter((e) => e.id !== id)
  if (orfaos.length > 0) {
    await supabase.storage.from('termos').remove(orfaos.map((o) => o.arquivo_path))
    await supabase.from('termos_gerados').delete().in('id', orfaos.map((o) => o.id))
  }

  // Upload (upsert: sobrescreve o arquivo antigo do mesmo termo — sem órfão).
  const { error: upErr } = await supabase.storage
    .from('termos')
    .upload(arquivoPath, buffer, { contentType: DOCX_MIME, upsert: true })
  if (upErr) return { ok: false, erro: `Falha ao salvar o arquivo: ${upErr.message}` }

  const linha = {
    id,
    tipo,
    movimentacao_ids: sortedMovIds,
    ativo_ids: [...ativoIds].sort(),
    colaborador: campos.colaborador ?? null,
    dados,
    arquivo_path: arquivoPath,
  }

  if (reutilizar) {
    const { error } = await supabase
      .from('termos_gerados')
      .update({ ...linha, atualizado_em: new Date().toISOString(), atualizado_por: uid })
      .eq('id', id)
    if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  } else {
    const { error } = await supabase
      .from('termos_gerados')
      .insert({ ...linha, gerado_por: uid })
    if (error) {
      // Insert falhou (ex.: corrida no unique tipo+movimentações) — remove o .docx
      // recém-enviado para não deixar objeto órfão no bucket.
      await supabase.storage.from('termos').remove([arquivoPath])
      return { ok: false, erro: traduzErroBanco(error.message, error.code) }
    }
  }

  return { ok: true, id, arquivoPath }
}

// Responsabilidade: marca a flag 'gerado' nos ativos (sem rebaixar 'sim'/'enviado').
// Inclui 'gerado' no predicado para que REGERAR com data nova atualize termo_data
// (o alvo é não rebaixar sim/enviado — 'gerado'→'gerado' não rebaixa nada).
// A movimentação é IMUTÁVEL (RLS insert-only, 0005) — por isso a flag mora no
// ativo, que é o que v_pendencias/ficha/relatório leem (ver DECISOES). Devolução
// não mexe no termo (o ativo está em triagem; a coluna é sobre responsabilidade).
async function aplicarFlagTermo(
  supabase: ServerClient,
  tipo: TermoTipo,
  ativoIds: string[],
  data: string,
): Promise<void> {
  if (familiaDoTipo(tipo) !== 'responsabilidade') return
  await supabase
    .from('ativos')
    .update({ termo_assinado: 'gerado', termo_data: data })
    .in('id', ativoIds)
    .or('termo_assinado.is.null,termo_assinado.eq.nao,termo_assinado.eq.gerado')
}

export async function gerarTermo(input: unknown): Promise<GeracaoTermo> {
  const parsed = gerarTermoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: 'Há campos inválidos. Revise o termo.' }
  }
  const { tipo, movimentacaoIds, data, campos } = parsed.data

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  // `ativo_ids` e a flag derivam das MOVIMENTAÇÕES no servidor (a movimentação é a
  // fonte da verdade) — não confia no ativoIds vindo do cliente.
  const { data: movAtivos, error: movErr } = await supabase
    .from('movimentacoes')
    .select('ativo_id')
    .in('id', movimentacaoIds)
  if (movErr) return { ok: false, erro: traduzErroBanco(movErr.message, movErr.code) }
  const ativoIds = [...new Set((movAtivos ?? []).map((m) => m.ativo_id))]
  if (ativoIds.length === 0) return { ok: false, erro: 'Movimentação não encontrada.' }

  const dados: DadosTermo = {
    ...campos,
    data,
    data_extenso: dataPorExtenso(data),
    data_mes_ano: mesAnoPorExtenso(data),
  }

  let buffer: Buffer
  try {
    buffer = await renderizarDocx(tipo, dados)
  } catch {
    return { ok: false, erro: 'Não foi possível montar o documento do termo.' }
  }

  const persistido = await persistirTermo(supabase, {
    tipo,
    movimentacaoIds,
    ativoIds,
    campos,
    dados,
    buffer,
    uid,
  })
  if (!persistido.ok) return { ok: false, erro: persistido.erro }
  const { id, arquivoPath } = persistido

  await aplicarFlagTermo(supabase, tipo, ativoIds, data)

  const { data: signed } = await supabase.storage
    .from('termos')
    .createSignedUrl(arquivoPath, 600)

  for (const aid of ativoIds) revalidatePath(`/ativos/${aid}`)
  revalidatePath('/ativos')
  // Termo de responsabilidade muda ativos.termo_assinado -> 'gerado', que a
  // coluna "Termo" do relatorio e as pendencias leem: revalida o relatorio.
  revalidatePath('/relatorios', 'layout')

  const nomeArquivo = nomeDownload(tipo, campos.colaborador ?? '')
  return { ok: true, id, url: signed?.signedUrl, nomeArquivo }
}

// URL assinada (curta) para baixar um termo já gerado — usado pela ficha.
export async function urlTermo(input: {
  id: string
}): Promise<{ ok: boolean; url?: string; nomeArquivo?: string; erro?: string }> {
  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  if (!z.string().uuid().safeParse(input.id).success) {
    return { ok: false, erro: 'Termo inválido.' }
  }

  const { data: row, error } = await supabase
    .from('termos_gerados')
    .select('arquivo_path, tipo, colaborador')
    .eq('id', input.id)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  if (!row) return { ok: false, erro: 'Termo não encontrado.' }

  const { data: signed, error: sErr } = await supabase.storage
    .from('termos')
    .createSignedUrl(row.arquivo_path, 600)
  if (sErr || !signed) return { ok: false, erro: 'Falha ao gerar o link do arquivo.' }

  return {
    ok: true,
    url: signed.signedUrl,
    nomeArquivo: nomeDownload(row.tipo as TermoTipo, row.colaborador ?? ''),
  }
}

// ---------------------------------------------------------------------------
// confirmarAssinaturaTermo (B6, F6B) — marca termo_assinado = 'sim' (o único
// status que ENCERRA a pendência) + termo_data. O rastro de "quem confirmou /
// quando" vive na `anotacoes` (imutável; autor+data já na linha do tempo) —
// `ativos` não tem coluna de autor. SEM upload (o PDF assinado segue na F5 5.5).
// ---------------------------------------------------------------------------
export async function confirmarAssinaturaTermo(input: {
  ativo_id: string
  data?: string
}): Promise<ActionResult> {
  const parsed = confirmarAssinaturaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const { ativo_id } = parsed.data
  const dataAssinatura = parsed.data.data ?? hojeISO()

  // Guard: só age se ainda não estiver 'sim' (idempotente; evita anotação boba).
  const { data: ativo, error: eLer } = await supabase
    .from('ativos')
    .select('termo_assinado')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message, eLer.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }
  if (ativo.termo_assinado === 'sim') {
    return { ok: false, erro: 'Este termo já consta como assinado.' }
  }

  const { error: eUpd } = await supabase
    .from('ativos')
    .update({ termo_assinado: 'sim', termo_data: dataAssinatura })
    .eq('id', ativo_id)
  if (eUpd) return { ok: false, erro: traduzErroBanco(eUpd.message, eUpd.code) }

  // Rastro imutável na linha do tempo (autor + created_at vêm das colunas).
  const { error: eNota } = await supabase.from('anotacoes').insert({
    ativo_id,
    texto: `Termo confirmado como assinado (data da assinatura: ${formatDate(dataAssinatura)}).`,
    criado_por: uid,
  })
  if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message, eNota.code) }

  revalidatePath(`/ativos/${ativo_id}`)
  revalidatePath('/pendencias')
  // Coluna "Termo" do relatório lê o histórico da movimentação, mas as pendências
  // do relatório ao vivo derivam de ativos — revalida por garantia.
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// desfazerConfirmacaoTermo (B6, F6B) — ação inversa. Volta para 'gerado' se
// houver termo gerado cobrindo o ativo (termos_gerados.ativo_ids), senão 'nao'.
// Limpa termo_data (a data de assinatura deixou de valer e a data de geração
// não é recuperável). Registra o desfazer na linha do tempo.
// ---------------------------------------------------------------------------
export async function desfazerConfirmacaoTermo(input: {
  ativo_id: string
}): Promise<ActionResult> {
  const parsed = desfazerAssinaturaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const { ativo_id } = parsed.data

  const { data: ativo, error: eLer } = await supabase
    .from('ativos')
    .select('termo_assinado')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message, eLer.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }
  if (ativo.termo_assinado !== 'sim') {
    return { ok: false, erro: 'Só é possível desfazer um termo confirmado como assinado.' }
  }

  // Existe termo gerado pelo sistema cobrindo este ativo? Se sim, o estado
  // honesto de volta é 'gerado' (documento existe, falta assinatura); senão 'nao'.
  const { data: gerados, error: eGer } = await supabase
    .from('termos_gerados')
    .select('id')
    .contains('ativo_ids', [ativo_id])
    .limit(1)
  if (eGer) return { ok: false, erro: traduzErroBanco(eGer.message, eGer.code) }
  const destino: 'gerado' | 'nao' = gerados && gerados.length > 0 ? 'gerado' : 'nao'

  const { error: eUpd } = await supabase
    .from('ativos')
    .update({ termo_assinado: destino, termo_data: null })
    .eq('id', ativo_id)
  if (eUpd) return { ok: false, erro: traduzErroBanco(eUpd.message, eUpd.code) }

  const texto =
    destino === 'gerado'
      ? 'Confirmação de assinatura desfeita — o termo volta a constar como gerado (pendente de assinatura).'
      : 'Confirmação de assinatura desfeita — o termo volta a constar como não gerado.'
  const { error: eNota } = await supabase.from('anotacoes').insert({
    ativo_id,
    texto,
    criado_por: uid,
  })
  if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message, eNota.code) }

  revalidatePath(`/ativos/${ativo_id}`)
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// Nome amigável para o download (o arquivo no Storage é `${id}.docx`).
function nomeDownload(tipo: TermoTipo, colaborador: string): string {
  const base = TERMO_ROTULO[tipo].replace(/[—:]/g, '').replace(/\s+/g, ' ').trim()
  const quem = colaborador
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base}${quem ? ' - ' + quem : ''}.docx`.replace(/\s+/g, ' ')
}

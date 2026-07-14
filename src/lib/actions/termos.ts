'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { traduzErroBanco } from '@/lib/actions/erros'
import { hojeISO } from '@/lib/format'
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return falhaPrep('Sua sessão expirou. Faça login novamente.')

  const { movimentacaoIds, familia } = parsed.data

  const { data, error } = await supabase
    .from('movimentacoes')
    .select(MOV_SELECT)
    .in('id', movimentacaoIds)
  if (error) return falhaPrep(traduzErroBanco(error.message))
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
      patrimonio: a.patrimonio ?? '',
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
    .eq('id', user.id)
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

export async function gerarTermo(input: unknown): Promise<GeracaoTermo> {
  const parsed = gerarTermoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: 'Há campos inválidos. Revise o termo.' }
  }
  const { tipo, movimentacaoIds, data, campos } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Faça login novamente.' }

  // `ativo_ids` e a flag derivam das MOVIMENTAÇÕES no servidor (a movimentação é a
  // fonte da verdade) — não confia no ativoIds vindo do cliente.
  const { data: movAtivos, error: movErr } = await supabase
    .from('movimentacoes')
    .select('ativo_id')
    .in('id', movimentacaoIds)
  if (movErr) return { ok: false, erro: traduzErroBanco(movErr.message) }
  const ativoIds = [...new Set((movAtivos ?? []).map((m) => m.ativo_id))]
  if (ativoIds.length === 0) return { ok: false, erro: 'Movimentação não encontrada.' }

  // Payload do merge (jsonb + docx). Datas por extenso derivadas de `data`.
  const dados = {
    ...campos,
    data,
    data_extenso: dataPorExtenso(data),
    data_mes_ano: mesAnoPorExtenso(data),
  }

  // Render do template.
  let buffer: Buffer
  try {
    const arquivo = path.join(process.cwd(), 'src', 'templates', 'termos', TERMO_ARQUIVO[tipo])
    const content = await readFile(arquivo)
    const zip = new PizZip(content)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    })
    doc.render(dados)
    buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch {
    return { ok: false, erro: 'Não foi possível montar o documento do termo.' }
  }

  const sortedMovIds = [...movimentacaoIds].sort()

  // Versão única (§3.10): termos já existentes para ESTE conjunto de movimentações.
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
      .update({ ...linha, atualizado_em: new Date().toISOString(), atualizado_por: user.id })
      .eq('id', id)
    if (error) return { ok: false, erro: traduzErroBanco(error.message) }
  } else {
    const { error } = await supabase
      .from('termos_gerados')
      .insert({ ...linha, gerado_por: user.id })
    if (error) {
      // Insert falhou (ex.: corrida no unique tipo+movimentações) — remove o .docx
      // recém-enviado para não deixar objeto órfão no bucket.
      await supabase.storage.from('termos').remove([arquivoPath])
      return { ok: false, erro: traduzErroBanco(error.message) }
    }
  }

  // Responsabilidade: marca a flag 'gerado' nos ativos (sem rebaixar 'sim'/'enviado').
  // Inclui 'gerado' no predicado para que REGERAR com data nova atualize termo_data
  // (o alvo é não rebaixar sim/enviado — 'gerado'→'gerado' não rebaixa nada).
  // A movimentação é IMUTÁVEL (RLS insert-only, 0005) — por isso a flag mora no
  // ativo, que é o que v_pendencias/ficha/relatório leem (ver DECISOES). Devolução
  // não mexe no termo (o ativo está em triagem; a coluna é sobre responsabilidade).
  if (familiaDoTipo(tipo) === 'responsabilidade') {
    await supabase
      .from('ativos')
      .update({ termo_assinado: 'gerado', termo_data: data })
      .in('id', ativoIds)
      .or('termo_assinado.is.null,termo_assinado.eq.nao,termo_assinado.eq.gerado')
  }

  const { data: signed } = await supabase.storage
    .from('termos')
    .createSignedUrl(arquivoPath, 600)

  for (const aid of ativoIds) revalidatePath(`/ativos/${aid}`)
  revalidatePath('/ativos')

  const nomeArquivo = nomeDownload(tipo, campos.colaborador ?? '')
  return { ok: true, id, url: signed?.signedUrl, nomeArquivo }
}

// URL assinada (curta) para baixar um termo já gerado — usado pela ficha.
export async function urlTermo(input: {
  id: string
}): Promise<{ ok: boolean; url?: string; nomeArquivo?: string; erro?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou.' }

  const { data: row, error } = await supabase
    .from('termos_gerados')
    .select('arquivo_path, tipo, colaborador')
    .eq('id', input.id)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroBanco(error.message) }
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

'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirEscrita, exigirEscritaEm, exigirPapel } from '@/lib/auth/acesso'
import { registrarFalha } from '@/lib/observabilidade'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  confirmarAssinaturaSchema,
  desfazerAssinaturaSchema,
} from '@/lib/validators/ativo'
import { formatDate, hojeISO } from '@/lib/format'
import { dataOpcionalSchema } from '@/lib/validators/data'
import type { CategoriaAtivo } from '@/lib/dominio'
import {
  TERMO_ARQUIVO,
  familiaDoTipo,
  type FamiliaTermo,
  type TermoTipo,
} from '@/lib/termos/tipos'
import { nomeArquivoTermo } from '@/lib/termos/nome-arquivo'
import {
  avisoConferenciaSemLancamento,
  camposFaltantesDoTermo,
  cidadeDoTermo,
} from '@/lib/termos/preparo'
import { montarLinhaDeAcessorios } from '@/lib/termos/acessorios'
import { acessoriosDasMovimentacoes } from '@/lib/queries/itens'
import { listarTiposItem } from '@/lib/queries/tipos-item'
import { mapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
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
  LIMITE_ACESSORIOS,
  LIMITE_OUTROS_COMPONENTES,
  type CamposTermo,
} from '@/lib/validators/termo'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Os tetos REAIS de `camposTermoSchema` — quem os respeita é
// `montarLinhaDeAcessorios`, não o Zod (ver o comentário no validator). ⚠ IMPORTADOS
// do próprio schema desde a revisão de 29/08/2026: repetir o número aqui deixava os
// dois lados livres para divergir, e a divergência reintroduz exatamente o
// "Há campos inválidos. Revise o termo." que a função de corte existe para impedir.

/**
 * O aviso do item que foi junto mas não tem tipo cadastrado (§C.3).
 *
 * Aviso, NUNCA bloqueio: o termo sai do mesmo jeito, com a linha do que deu para
 * nomear. Devolve lista (0 ou 1) para caber num `push(...)` sem `if`.
 */
function avisosDeItemSemTipo(descartados: number): string[] {
  if (descartados <= 0) return []
  const plural = descartados === 1 ? 'item' : 'itens'
  return [
    `${descartados} ${plural} que ${descartados === 1 ? 'foi' : 'foram'} junto não ` +
      `${descartados === 1 ? 'tem' : 'têm'} tipo cadastrado e ${descartados === 1 ? 'ficou' : 'ficaram'} ` +
      `fora do termo — classifique em Administração → Itens.`,
  ]
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Payload do merge (jsonb + docx): os campos editáveis do dialog + as datas por
// extenso derivadas no servidor a partir de `data`.
type DadosTermo = CamposTermo & {
  data: string
  data_extenso: string
  data_mes_ano: string
  // F39 — o interruptor do bloco `{#tem_acessorios}` dos 5 modelos de
  // responsabilidade. DERIVADO DO TEXTO FINAL do campo, no servidor, e nunca do
  // que o banco leu: apagar a linha no diálogo tem de fazer a seção sumir do
  // papel, e digitá-la à mão tem de fazê-la aparecer. Ver a derivação em
  // `gerarTermo`.
  tem_acessorios: boolean
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
  // MOV-09 — a data da PRÓPRIA movimentação (pode ser retroativa, chips
  // Hoje/Ontem) e o termo_data que o operador já tenha informado nela: as duas
  // alimentam o pré-preenchimento de `data` do dialog, abaixo.
  data: string
  termo_data: string | null
  ativo: {
    id: string
    categoria: CategoriaAtivo
    marca: string | null
    modelo: string | null
    service_tag: string | null
    patrimonio: string | null
    colaborador_atual: string | null
    // F25 — campos próprios do celular (migration 0101): pré-preenchem o termo.
    telefone: string | null
    imei: string | null
    pulsus: string | null
    // F25 — a filial CORRENTE do ativo é de onde sai a cidade da assinatura.
    filial_id: number
  } | null
  motivo_rel: { rotulo: string } | null
}

const MOV_SELECT =
  'id, tipo, motivo, colaborador, chamado, itens_faltantes, snapshot_anterior, data, termo_data, ' +
  'ativo:ativos!movimentacoes_ativo_id_fkey(id, categoria, marca, modelo, service_tag, patrimonio, colaborador_atual, telefone, imei, pulsus, filial_id), ' +
  'motivo_rel:motivos!movimentacoes_motivo_fkey(rotulo)'

// A cidade que assina, pela filial CORRENTE do ativo (F25 · migration 0102).
//
// Leitura à parte, e não um embed `filiais(...)` dentro do embed do ativo: a
// consulta é uma só para o lote inteiro, e ler `filiais` direto (em vez de
// `listarFiliais()`) cobre também a filial DESATIVADA — que `listarFiliais` filtra
// e que um ativo antigo pode perfeitamente ter.
type CidadeDaFilial = { id: number; nome: string; cidade: string }

async function cidadesDasFiliais(
  supabase: ServerClient,
  filialIds: readonly number[],
): Promise<Map<number, CidadeDaFilial>> {
  const ids = [...new Set(filialIds)]
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('filiais').select('id, nome, cidade').in('id', ids)
  return new Map(((data ?? []) as CidadeDaFilial[]).map((f) => [f.id, f]))
}

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
  // LEITURA (monta o pré-preenchimento do diálogo): sem recorte de cargo além do PISO, por
  // determinação da F21 — quem lê a ficha do ativo já vê estes mesmos dados. Quem
  // ESCREVE é `gerarTermo`, e é lá que o cargo e o vínculo são exigidos.
  //
  // Mas o piso é `exigirPapel('consulta')`, e não `idOperador`: os três cargos atendem por
  // igual, e quem NÃO atende é o perfil DESATIVADO (`papel_atual()` devolve NULL para
  // `ativo = false`). Sem isso, um desligado que ainda tem token vivo continuaria lendo por
  // request direto — a mesma razão registrada em `exportar.ts`.
  const aut = await exigirPapel(supabase, 'consulta')
  if (!aut.ok) return falhaPrep(aut.erro)
  const uid = aut.uid

  const { movimentacaoIds, familia } = parsed.data

  // ⚠ `.order('id')`: `.in()` NÃO garante ordem, e várias decisões deste fluxo saem
  // do PRIMEIRO elemento — a movimentação de referência da família responsabilidade
  // (`movs[0]`) e, desde a F25, a FILIAL de onde vem a cidade da assinatura. Sem uma
  // ordem total, o mesmo lote podia gerar o termo com a cidade de uma filial numa
  // chamada e de outra na seguinte. É a mesma disciplina que `donos` já aplicava
  // logo abaixo (`.sort()`), pelo mesmo motivo.
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(MOV_SELECT)
    .in('id', movimentacaoIds)
    .order('id')
  if (error) return falhaPrep(traduzErroBanco(error.message, error.code))
  const movs = (data ?? []) as unknown as MovRow[]
  if (movs.length === 0) return falhaPrep('Movimentação não encontrada.')

  const hoje = hojeISO()
  // MOV-09 — o termo herda a data da movimentação de referência (§ comentário do
  // `.order('id')` acima: mesmo `movs[0]` que já governa as outras decisões do
  // lote). Com os chips Hoje/Ontem tornando rotina o lançamento retroativo, sem
  // isto o operador redigitava no dialog uma data que o sistema já sabia — e
  // esquecer gerava termo divergente do registro. `termo_data` vence (o
  // operador já declarou a data do termo nesta movimentação, ex.: reemissão);
  // senão a `data` da movimentação; senão hoje. O campo do dialog SEGUE
  // editável — isto é só o pré-preenchimento.
  const dataHerdada = movs[0].termo_data ?? movs[0].data ?? hoje
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

  // ---- F25: a cidade da linha da assinatura --------------------------------
  // O JULGAMENTO (qual cidade, quais avisos) é uma função pura em termos/preparo.ts,
  // com teste próprio; aqui só se lê o banco.
  const cidades = await cidadesDasFiliais(supabase, ativos.map((a) => a.filial_id))
  const { cidade, avisos: avisosCidade } = cidadeDoTermo(ativos, cidades)
  avisos.push(...avisosCidade)

  if (familia === 'responsabilidade') {
    const mov = movs[0]
    const a = mov.ativo
    if (!a) return falhaPrep('Ativo não encontrado.')
    const colaborador = mov.colaborador ?? a.colaborador_atual ?? ''
    const faltando = camposFaltantesDoTermo(a)
    if (faltando.length > 0) {
      avisos.push(`O ativo não tem ${faltando.join(', ')} cadastrado(s) — o campo sai em branco.`)
    }
    // F39 — os periféricos que saíram COM ESTE equipamento. A movimentação de
    // referência é `movs[0]`, a mesma que já governa marca, modelo, patrimônio e
    // chamado: é o D13 no papel — o fone que acompanhou o notebook aponta a
    // movimentação do notebook, e cada termo lista só o que é dele.
    const junto = await acessoriosDasMovimentacoes([mov.id], 'saida', supabase)
    const acessorios = montarLinhaDeAcessorios(junto.lancamentos, junto.tipos, LIMITE_ACESSORIOS)
    avisos.push(...avisosDeItemSemTipo(acessorios.descartados))
    const campos: CamposTermo = {
      colaborador,
      marca: a.marca ?? '',
      modelo: a.modelo ?? '',
      service_tag: a.service_tag ?? '',
      patrimonio: a.patrimonio ?? '',
      chamado: mov.chamado ?? '',
      // F25 — vêm do CADASTRO do ativo (migration 0101). Antes saíam '' fixos
      // ("manuais, §4.1" do PLANO-TERMOS) e alguém redigitava o mesmo IMEI a cada
      // termo. Continuam 100% editáveis aqui, e editar NÃO grava de volta no
      // ativo — a regra do §3.9 do plano não muda.
      telefone: a.telefone ?? '',
      imei: a.imei ?? '',
      pulsus: a.pulsus ?? '',
      // `obs` é do DOCUMENTO (uma observação daquela entrega), não do aparelho:
      // segue manual e sem coluna.
      obs: '',
      cidade,
      // Sugestão, nunca trava: o operador edita, apaga ou digita outra coisa, e
      // `tem_acessorios` (gerarTermo) segue o texto final.
      acessorios: acessorios.linha,
    }
    return {
      ok: true,
      familia,
      ativoIds: [a.id],
      categorias: [a.categoria],
      data: dataHerdada,
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
  // F39 — o vocabulário do que FALTOU sai do catálogo `tipos_item` (F37), não mais
  // de constante do código. TODOS os tipos, inclusive os desativados: a
  // `{observacao}` fala de PASSADO, e um slug histórico tem de sair legível.
  //
  // ⚠ DEGRADA, NUNCA DERRUBA (achado da revisão adversarial desta fase). Antes da
  // F39 este caminho não lia banco nenhum para montar a `{observacao}`; `listarTiposItem`
  // LANÇA em erro, e sem este `catch` um blip no banco passaria a impedir a
  // preparação do termo inteiro — quebrando o "aviso, nunca bloqueio" que a própria
  // fase adota nas outras leituras novas. Sem o mapa, `rotuloTipoItem` cai no slug
  // cru, que é exatamente o fallback desenhado: o termo sai, com "fone" em vez de
  // "Fone de ouvido", e o operador edita o campo se quiser.
  //
  // ⚠ AS TRÊS LEITURAS EM PARALELO (revisão de 29/08/2026). Elas não dependem uma da
  // outra, e a F39 acrescentou DUAS delas a um caminho que antes tinha só o `profiles`:
  // encadeadas, o diálogo do termo pagava três idas ao banco em série a cada abertura.
  // O client é o `supabase` desta action — `listarTiposItem` aceita client resolvido
  // desde esta fase, e criar um segundo era relê a sessão à toa.
  const [tiposParaObservacao, perfilDoTecnico, voltaram] = await Promise.all([
    listarTiposItem(supabase).catch((err) => {
      registrarFalha({ escopo: 'termos.preparar-tipos-item', erro: err, operador: uid })
      return []
    }),
    // Responsável de TI = operador logado (automático, §4.2).
    supabase.from('profiles').select('nome').eq('id', uid).maybeSingle(),
    // F39 · D11 — `{outros_componentes}` deixa de ser '' fixo e passa a listar O QUE
    // VOLTOU: a união dos lançamentos de `retorno` de TODAS as movimentações do lote
    // (o checklist é um só para o lote inteiro). `{observacao}` continua dizendo o que
    // FALTOU, com o mesmo texto de sempre — as duas linhas dizem coisas diferentes, e
    // é isso que tira a ambiguidade do documento.
    acessoriosDasMovimentacoes(
      movs.map((m) => m.id),
      'retorno',
      supabase,
    ),
  ])
  const rotulosDosTipos = mapaRotulosTipo(tiposParaObservacao)
  const perfil = perfilDoTecnico.data
  const componentes = montarLinhaDeAcessorios(
    voltaram.lancamentos,
    voltaram.tipos,
    LIMITE_OUTROS_COMPONENTES,
  )
  avisos.push(...avisosDeItemSemTipo(componentes.descartados))
  // O caso que o papel esconderia: conferência que não virou lançamento. Aviso,
  // nunca bloqueio — o termo sai do mesmo jeito (ver `avisoConferenciaSemLancamento`).
  //
  // ⚠ MOVIMENTAÇÃO SEM ATIVO EMBUTIDO FICA DE FORA, e não vira filial `0` (revisão de
  // 29/08/2026): um `?? 0` ao lado de filiais reais faz o conjunto ter dois valores e
  // o lote parecer misto — o aviso dispararia sozinho, sem nada de misto existir.
  const avisoSemLancamento = avisoConferenciaSemLancamento(
    movs
      .filter((m) => m.ativo != null)
      .map((m) => ({
        filial_id: m.ativo!.filial_id,
        detentor_anterior: m.snapshot_anterior?.colaborador ?? null,
      })),
    componentes.linha,
  )
  if (avisoSemLancamento) avisos.push(avisoSemLancamento)

  const campos: CamposTermo = {
    colaborador,
    descricao: descricaoDevolucao(motivoCodigo, motivoRotulo),
    series,
    patrimonios,
    marcas_modelos,
    outros_componentes: componentes.linha,
    observacao: observacaoSugestao(itensFaltantes, rotulosDosTipos),
    tecnico: perfil?.nome ?? '',
    cidade,
  }
  return {
    ok: true,
    familia,
    ativoIds,
    categorias,
    data: dataHerdada,
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
// não mexe na flag porque termo_assinado é sobre RESPONSABILIDADE e o termo de
// devolução é de outra família — o guard é familiaDoTipo(tipo) !== 'responsabilidade'
// (early return abaixo) e nunca dependeu do estado do ativo.
// (Emenda F34, 11/08/2026: a premissa antiga era o ativo cair em triagem depois da
// devolução — desde a migration 0109 a devolução resulta 'em_estoque' direto, a
// triagem virou opt-in por 'envio_triagem'. Ver docs/MATRIZ-REGRAS.md R-TER-06.)
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
  // Cargo antes das leituras, vínculo depois (a filial sai dos ativos) — ver o
  // comentário longo em actions/ativos.ts.
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  // `ativo_ids` e a flag derivam das MOVIMENTAÇÕES no servidor (a movimentação é a
  // fonte da verdade) — não confia no ativoIds vindo do cliente.
  const { data: movAtivos, error: movErr } = await supabase
    .from('movimentacoes')
    .select('ativo_id')
    .in('id', movimentacaoIds)
  if (movErr) return { ok: false, erro: traduzErroBanco(movErr.message, movErr.code) }
  const ativoIds = [...new Set((movAtivos ?? []).map((m) => m.ativo_id))]
  if (ativoIds.length === 0) return { ok: false, erro: 'Movimentação não encontrada.' }

  // Um termo de lote pode cobrir ativos de MAIS DE UMA filial (o precedente existe: o
  // import recusa termo multi-filial justamente por isso). A filial que vale é a
  // CORRENTE de cada ativo — é ela que a policy de update de `ativos` avalia quando
  // `aplicarFlagTermo` grava `termo_assinado`; a filial gravada na movimentação pode
  // estar velha. Exige escrita em todas: gerar um documento único que declara
  // responsabilidade sobre ativo de filial alheia é exatamente o que o vínculo impede.
  const { data: ativosFiliais, error: eFiliais } = await supabase
    .from('ativos')
    .select('filial_id')
    .in('id', ativoIds)
  if (eFiliais) return { ok: false, erro: traduzErroBanco(eFiliais.message, eFiliais.code) }
  const aut = await exigirEscritaEm(supabase, (ativosFiliais ?? []).map((a) => a.filial_id))
  if (!aut.ok) return { ok: false, erro: aut.erro }
  const uid = aut.uid

  const dados: DadosTermo = {
    ...campos,
    data,
    data_extenso: dataPorExtenso(data),
    data_mes_ano: mesAnoPorExtenso(data),
    // F39 · §C.4 — o interruptor da seção, derivado do TEXTO QUE VAI AO PAPEL.
    //
    // Nunca do que o banco leu: o campo é editável (§3.9 do PLANO-TERMOS), e é o
    // texto final que manda. Limpar a linha no diálogo faz a seção sumir do
    // documento; digitá-la à mão faz aparecer. Como `termos_gerados.dados` guarda
    // o payload inteiro, o snapshot registra o que foi renderizado — sem migration.
    //
    // Os 2 modelos de DEVOLUÇÃO não têm `{#tem_acessorios}`: a chave a mais é
    // inofensiva (o docxtemplater ignora dado sem tag), como `data_mes_ano` já é
    // nos 5 de responsabilidade.
    tem_acessorios: (campos.acessorios ?? '').trim().length > 0,
  }

  let buffer: Buffer
  try {
    buffer = await renderizarDocx(tipo, dados)
  } catch (erro) {
    registrarFalha({ escopo: 'termos.montar-documento', erro })
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

  // Nome amigável do download (o objeto no Storage continua `${id}.docx`).
  const nomeArquivo = nomeArquivoTermo(tipo, campos)
  return { ok: true, id, url: signed?.signedUrl, nomeArquivo }
}

// URL assinada (curta) para baixar um termo já gerado — usado pela ficha.
export async function urlTermo(input: {
  id: string
}): Promise<{ ok: boolean; url?: string; nomeArquivo?: string; erro?: string }> {
  const supabase = await createClient()
  // Baixar termo é LEITURA (os três cargos baixam), mas a signed URL de 600s expõe o .docx
  // com nome do colaborador, setor e patrimônios: o piso é o perfil ATIVO, não só "existe
  // sessão". `exigirPapel('consulta')` fecha o desligado no request seguinte.
  const aut = await exigirPapel(supabase, 'consulta')
  if (!aut.ok) return { ok: false, erro: aut.erro }

  if (!z.string().uuid().safeParse(input.id).success) {
    return { ok: false, erro: 'Termo inválido.' }
  }

  // `dados` (jsonb com os CamposTermo salvos na geração) entra no select porque é
  // dele que saem os patrimônios do nome do arquivo.
  const { data: linha, error } = await supabase
    .from('termos_gerados')
    .select('arquivo_path, tipo, colaborador, dados')
    .eq('id', input.id)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  if (!linha) return { ok: false, erro: 'Termo não encontrado.' }
  // O gerador tipa jsonb como `Json` — mesmo cast de `src/lib/queries/termos.ts`.
  const row = linha as unknown as {
    arquivo_path: string
    tipo: TermoTipo
    colaborador: string | null
    dados: (CamposTermo & { data?: string }) | null
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from('termos')
    .createSignedUrl(row.arquivo_path, 600)
  if (sErr || !signed) return { ok: false, erro: 'Falha ao gerar o link do arquivo.' }

  return {
    ok: true,
    url: signed.signedUrl,
    // O nome é calculado AGORA, a partir do que foi salvo na geração — por isso
    // termo antigo também passa a baixar no padrão novo, sem tocar banco nem
    // Storage. A coluna `colaborador` é a rede de segurança de uma linha cujo
    // jsonb não trouxe o nome (a função degrada omitindo o segmento).
    nomeArquivo: nomeArquivoTermo(row.tipo, {
      ...row.dados,
      colaborador: row.dados?.colaborador ?? row.colaborador ?? undefined,
    }),
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
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { ativo_id } = parsed.data
  const dataAssinatura = parsed.data.data ?? hojeISO()

  // Guard: só age se ainda não estiver 'sim' (idempotente; evita anotação boba).
  // `filial_id` entra no select que já existia — é o insumo do vínculo de escrita.
  const { data: ativo, error: eLer } = await supabase
    .from('ativos')
    .select('termo_assinado, filial_id')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message, eLer.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  const aut = await exigirEscrita(supabase, ativo.filial_id)
  if (!aut.ok) return { ok: false, erro: aut.erro }

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
    criado_por: aut.uid,
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
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { ativo_id } = parsed.data

  const { data: ativo, error: eLer } = await supabase
    .from('ativos')
    .select('termo_assinado, filial_id')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message, eLer.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  const aut = await exigirEscrita(supabase, ativo.filial_id)
  if (!aut.ok) return { ok: false, erro: aut.erro }

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
    criado_por: aut.uid,
  })
  if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message, eNota.code) }

  revalidatePath(`/ativos/${ativo_id}`)
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// confirmarAssinaturaLote (F28/PND-02) — confirma 1..N termos de uma vez, com
// UMA data para o lote inteiro (a pilha que volta do mutirão de assinatura tem
// a mesma data para todo mundo). Espelha `confirmarAssinaturaTermo` (acima, a
// individual) e `resolverPendenciaItem` (actions/pendencias.ts, que já opera
// sobre `ids[]`): cargo primeiro, depois as filiais dos ALVOS lidas do banco —
// nunca confiadas ao cliente — e `exigirEscritaEm` recusando o LOTE INTEIRO se
// faltar vínculo em uma delas (escrita parcial silenciosa seria pior).
//
// O schema fica LOCAL (não exportado): este módulo é 'use server' e só pode
// exportar async functions — um `export const` de schema quebraria a regra
// (é a mesma razão pela qual `falhaPrep`/`aplicarFlagTermo`, acima, também são
// privados a este arquivo).
const confirmarAssinaturaLoteSchema = z.object({
  ativo_ids: z
    .array(z.string().uuid())
    .min(1, 'Selecione ao menos um termo.')
    .max(500, 'Muitos termos de uma vez — confirme em blocos menores.'),
  // Mesma régua da individual (`confirmarAssinaturaSchema`, validators/ativo.ts):
  // ausente = hoje, sem teto de futuro além disso (termo_data não tem, por
  // decisão registrada — ver o comentário de `confirmarAssinaturaSchema`).
  data: dataOpcionalSchema,
})

// `confirmados`/`ignorados` sempre somam o total pedido (após deduplicar):
// idempotente como a individual — quem já estava 'sim' entra em `ignorados`,
// nunca em erro. A UI precisa dessa honestidade quando o lote encolhe (um
// termo já tinha sido confirmado por outra aba/pessoa entre a fila carregar e
// o clique).
export type ConfirmacaoLote =
  | { ok: true; confirmados: number; ignorados: number }
  | { ok: false; erro: string }

export async function confirmarAssinaturaLote(input: {
  ativo_ids: string[]
  data?: string
}): Promise<ConfirmacaoLote> {
  const parsed = confirmarAssinaturaLoteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  // Dedup defensivo: a UI seleciona por Set (nunca manda duplicata), mas a
  // action é um endpoint alcançável por conta própria.
  const ids = [...new Set(parsed.data.ativo_ids)]
  const dataAssinatura = parsed.data.data ?? hojeISO()

  // O lote pode misturar filiais (cada linha da fila é o termo pendente de UM
  // ativo, e os ativos selecionados podem ser de filiais diferentes) — lê as
  // filiais alvo ANTES e exige escrita em TODAS, como `resolverPendenciaItem`
  // já faz: confirmar só a parte permitida deixaria o lote meio confirmado,
  // em silêncio, com uma data cobrindo o que não foi tocado.
  const { data: alvos, error: eAlvos } = await supabase
    .from('ativos')
    .select('id, filial_id, termo_assinado')
    .in('id', ids)
  if (eAlvos) return { ok: false, erro: traduzErroBanco(eAlvos.message, eAlvos.code) }

  // Nenhum alvo (ids inexistentes) não é erro — idempotente de propósito, como
  // a resolução em lote de itens. O cargo de escrita segue exigido de qualquer
  // forma (a action é alcançável pela rede por si só).
  const aut =
    alvos && alvos.length > 0
      ? await exigirEscritaEm(supabase, alvos.map((a) => a.filial_id))
      : cargo
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // Idempotente (como a individual): só os que AINDA NÃO estão 'sim' entram no
  // update — reenviar o lote não sobrescreve quem já foi confirmado por outra
  // via. `pendentesIds` é calculado ANTES do update para separar "confirmado
  // agora" de "já estava assinado" mesmo que o UPDATE afete 0 linhas.
  const pendentesIds = (alvos ?? [])
    .filter((a) => a.termo_assinado !== 'sim')
    .map((a) => a.id as string)

  if (pendentesIds.length === 0) {
    return { ok: true, confirmados: 0, ignorados: ids.length }
  }

  const { data: atualizados, error: eUpd } = await supabase
    .from('ativos')
    .update({ termo_assinado: 'sim', termo_data: dataAssinatura })
    .in('id', pendentesIds)
    .neq('termo_assinado', 'sim')
    .select('id')
  if (eUpd) return { ok: false, erro: traduzErroBanco(eUpd.message, eUpd.code) }

  const idsConfirmados = [...new Set((atualizados ?? []).map((a) => a.id as string))]

  // Uma anotação POR ATIVO, mesmo texto/formato da confirmação individual — o
  // rastro de "quem confirmou / quando" é a `anotacoes` (imutável), como o
  // comentário de `confirmarAssinaturaTermo` já explica; `ativos` não tem
  // coluna de autor.
  if (idsConfirmados.length > 0) {
    const texto = `Termo confirmado como assinado (data da assinatura: ${formatDate(dataAssinatura)}).`
    const { error: eNota } = await supabase.from('anotacoes').insert(
      idsConfirmados.map((ativoId) => ({
        ativo_id: ativoId,
        texto,
        criado_por: aut.uid,
      })),
    )
    if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message, eNota.code) }
  }

  revalidatePath('/pendencias')
  for (const ativoId of idsConfirmados) revalidatePath(`/ativos/${ativoId}`)
  // Coluna "Termo" do relatório e as pendências ao vivo derivam de ativos —
  // revalida por garantia, como a individual faz.
  revalidatePath('/relatorios', 'layout')

  return {
    ok: true,
    confirmados: idsConfirmados.length,
    ignorados: ids.length - idsConfirmados.length,
  }
}


// Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10.
//
// CLI da carga única (F4):
//   npm run carga -- --inventarios=<p1,p2,p3,p4,p5> --saidas=<p> --devolucoes=<p> \
//     [--itens=<p>] [--resolucoes=<p.json>] [--criar-itens-faltantes] \
//     [--esperado-ativos=N --esperado-saidas=N --esperado-devolucoes=N] \
//     --dry-run | --executar
//
// Dry-run (padrão): prévia + carga-inconsistencias-<ts>.csv; bloqueante → exit 1.
// --executar: recusa com bloqueante; insere ativos e depois movimentações UMA A
// UMA em ordem cronológica (o trigger do banco valida e recalcula o estado);
// idempotente — reexecutar não duplica nada. Ao final, carga-resultado-<ts>.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { chavePatrimonio } from '../../src/lib/patrimonio'
import { assertCargaGuards, createAdminClient, resolverAdmin } from './guard'
import { montarPlanoItens, type PlanoItens } from './itens'
import { chaveServiceTag, statusAposMovimentacao, SLUG_POR_FILIAL, mapearUnidade } from './normalizar'
import {
  extrairDevolucoes,
  extrairInventario,
  extrairSaidas,
  parseCsvCru,
  type LinhaDescartada,
  type RegistroInventario,
} from './parse'
import { montarPlano } from './plano'
import type {
  FilialOficial,
  Inconsistencia,
  Plano,
  Resolucao,
  StatusAtivo,
} from './tipos'

// ---------------------------------------------------------------------------
// Argumentos

type Args = {
  inventarios: string[]
  saidas: string | null
  devolucoes: string | null
  itens: string | null
  resolucoes: string | null
  criarItensFaltantes: boolean
  executar: boolean
  esperadoAtivos: number | null
  esperadoSaidas: number | null
  esperadoDevolucoes: number | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    inventarios: [], saidas: null, devolucoes: null, itens: null, resolucoes: null,
    criarItensFaltantes: false, executar: false,
    esperadoAtivos: null, esperadoSaidas: null, esperadoDevolucoes: null,
  }
  for (const a of argv) {
    if (a.startsWith('--inventarios=')) args.inventarios = a.slice(14).split(',').map((s) => s.trim()).filter(Boolean)
    else if (a.startsWith('--saidas=')) args.saidas = a.slice(9)
    else if (a.startsWith('--devolucoes=')) args.devolucoes = a.slice(13)
    else if (a.startsWith('--itens=')) args.itens = a.slice(8)
    else if (a.startsWith('--resolucoes=')) args.resolucoes = a.slice(13)
    else if (a === '--criar-itens-faltantes') args.criarItensFaltantes = true
    else if (a === '--executar') args.executar = true
    else if (a === '--dry-run') args.executar = false
    else if (a.startsWith('--esperado-ativos=')) args.esperadoAtivos = Number(a.slice(18))
    else if (a.startsWith('--esperado-saidas=')) args.esperadoSaidas = Number(a.slice(18))
    else if (a.startsWith('--esperado-devolucoes=')) args.esperadoDevolucoes = Number(a.slice(22))
    else if (a.startsWith('--')) {
      console.error(`Argumento desconhecido: ${a}`)
      process.exit(1)
    }
  }
  return args
}

function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// ---------------------------------------------------------------------------
// Relatório de inconsistências (CSV `;` + BOM)

function escreverInconsistencias(inconsistencias: Inconsistencia[], ts: string): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const linhas = [
    'severidade;tipo;arquivo;linha;valor;acao_proposta',
    ...inconsistencias.map((i) =>
      [i.severidade, i.tipo, i.arquivo, i.linha === null ? '' : String(i.linha), i.valor, i.acaoProposta]
        .map(esc)
        .join(';'),
    ),
  ]
  const path = `carga-inconsistencias-${ts}.csv`
  writeFileSync(path, '﻿' + linhas.join('\r\n'), 'utf8')
  return path
}

function contarPorTipo(inconsistencias: Inconsistencia[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const i of inconsistencias) r[`${i.severidade}:${i.tipo}`] = (r[`${i.severidade}:${i.tipo}`] ?? 0) + 1
  return r
}

// ---------------------------------------------------------------------------
// Banco

type Db = ReturnType<typeof createAdminClient>

async function buscarFiliais(db: Db): Promise<Map<FilialOficial, number>> {
  const { data, error } = await db.from('filiais').select('id, slug')
  if (error) throw new Error(`Falha ao ler filiais: ${error.message}`)
  const porSlug = new Map((data ?? []).map((f) => [f.slug as string, f.id as number]))
  const mapa = new Map<FilialOficial, number>()
  const faltando: string[] = []
  for (const [filial, slug] of Object.entries(SLUG_POR_FILIAL) as [FilialOficial, string][]) {
    const id = porSlug.get(slug)
    if (id === undefined) faltando.push(slug)
    else mapa.set(filial, id)
  }
  if (faltando.length > 0) {
    throw new Error(
      `Cadastro de filiais incompleto no banco: faltam os slugs [${faltando.join(', ')}]. ` +
        'Confira o passo 1 do go-live (migration 0026 aplicada?).',
    )
  }
  return mapa
}

type AtivoDb = {
  id: string
  patrimonio: string
  service_tag: string | null
  status: StatusAtivo
  filial_id: number
  colaborador_atual: string | null
  setor_atual: string | null
  termo_assinado: string | null
  termo_data: string | null
  marca: string | null
  modelo: string | null
  fornecedor: string | null
  hostname: string | null
  memoria: string | null
  armazenamento: string | null
  processador: string | null
  patrimonio_original: string | null
  pendencia: string | null
  observacoes: string | null
}

async function buscarAtivosExistentes(db: Db): Promise<Map<string, AtivoDb>> {
  const mapa = new Map<string, AtivoDb>()
  const PAGE = 1000
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await db
      .from('ativos')
      .select(
        'id, patrimonio, service_tag, status, filial_id, colaborador_atual, setor_atual, termo_assinado, termo_data, marca, modelo, fornecedor, hostname, memoria, armazenamento, processador, patrimonio_original, pendencia, observacoes',
      )
      .order('id')
      .range(de, de + PAGE - 1)
    if (error) throw new Error(`Falha ao ler ativos: ${error.message}`)
    for (const a of (data ?? []) as AtivoDb[]) {
      mapa.set(chavePatrimonio(a.patrimonio, chaveServiceTag(a.service_tag)), a)
    }
    if (!data || data.length < PAGE) break
  }
  return mapa
}

async function buscarChavesMovimentacoes(db: Db): Promise<Set<string>> {
  const chaves = new Set<string>()
  const PAGE = 1000
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await db
      .from('movimentacoes')
      .select('ativo_id, tipo, data, chamado')
      .order('id')
      .range(de, de + PAGE - 1)
    if (error) throw new Error(`Falha ao ler movimentações: ${error.message}`)
    for (const m of data ?? []) {
      chaves.add(`${m.ativo_id}|${m.tipo}|${m.data}|${m.chamado ?? ''}`)
    }
    if (!data || data.length < PAGE) break
  }
  return chaves
}

// ---------------------------------------------------------------------------
// Execução da carga de ativos

type ResultadoAtivos = {
  ativosCriados: number
  ativosAtualizados: number
  ativosJaExistentes: number
  movimentacoesInseridas: Record<string, number>
  movimentacoesJaImportadas: number
  ajustesPulados: number
  falhas: { contexto: string; erro: string }[]
  sincronizacoes: number
}

async function executarAtivos(
  db: Db,
  plano: Plano,
  filiais: Map<FilialOficial, number>,
  criadoPor: string,
): Promise<ResultadoAtivos> {
  const res: ResultadoAtivos = {
    ativosCriados: 0, ativosAtualizados: 0, ativosJaExistentes: 0,
    movimentacoesInseridas: {}, movimentacoesJaImportadas: 0, ajustesPulados: 0,
    falhas: [], sincronizacoes: 0,
  }

  // 1. ativos primeiro (ordem 3.2.6)
  const existentes = await buscarAtivosExistentes(db)
  const idPorChave = new Map<string, string>()
  const statusPorChave = new Map<string, StatusAtivo>()
  const CAMPOS_CADASTRAIS = [
    'marca', 'modelo', 'fornecedor', 'hostname', 'memoria', 'armazenamento',
    'processador', 'patrimonio_original', 'pendencia', 'observacoes',
  ] as const

  const novos = []
  for (const a of plano.ativos) {
    const existente = existentes.get(a.chave)
    if (existente) {
      idPorChave.set(a.chave, existente.id)
      statusPorChave.set(a.chave, existente.status)
      res.ativosJaExistentes++
      // idempotência: só preenche campos cadastrais VAZIOS (ordem 3.2.7)
      const patch: Record<string, string> = {}
      const valores: Record<(typeof CAMPOS_CADASTRAIS)[number], string | null> = {
        marca: a.marca, modelo: a.modelo, fornecedor: a.fornecedor, hostname: a.hostname,
        memoria: a.memoria, armazenamento: a.armazenamento, processador: a.processador,
        patrimonio_original: a.patrimonioOriginal || null, pendencia: a.pendencia, observacoes: a.observacoes,
      }
      for (const campo of CAMPOS_CADASTRAIS) {
        if (existente[campo] === null && valores[campo] !== null) patch[campo] = valores[campo] as string
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await db.from('ativos').update(patch).eq('id', existente.id)
        if (error) res.falhas.push({ contexto: `atualizar ativo ${a.patrimonio}`, erro: error.message })
        else res.ativosAtualizados++
      }
      continue
    }
    novos.push(a)
  }

  const BATCH = 200
  for (let i = 0; i < novos.length; i += BATCH) {
    const lote = novos.slice(i, i + BATCH)
    const linhas = lote.map((a) => ({
      patrimonio: a.patrimonio,
      patrimonio_original: a.patrimonioOriginal || a.patrimonio,
      categoria: a.categoria,
      marca: a.marca,
      modelo: a.modelo,
      service_tag: a.serviceTag,
      hostname: a.hostname,
      memoria: a.memoria,
      armazenamento: a.armazenamento,
      processador: a.processador,
      fornecedor: a.fornecedor,
      filial_id: filiais.get(a.filial)!,
      termo_assinado: a.termo,
      termo_data: a.termoData,
      pendencia: a.pendencia,
      origem: a.origem,
      observacoes: a.observacoes,
    }))
    const { data, error } = await db.from('ativos').insert(linhas).select('id, patrimonio, service_tag')
    if (error) {
      res.falhas.push({ contexto: `inserir lote de ativos (${i}–${i + lote.length})`, erro: error.message })
      continue
    }
    for (const row of data ?? []) {
      const chave = chavePatrimonio(row.patrimonio as string, chaveServiceTag(row.service_tag as string | null))
      idPorChave.set(chave, row.id as string)
      statusPorChave.set(chave, 'em_estoque')
      res.ativosCriados++
    }
  }

  // 2. movimentações uma a uma, em ordem (o trigger valida e recalcula)
  const chavesExistentes = await buscarChavesMovimentacoes(db)
  for (const m of plano.movimentacoes) {
    const ativoId = idPorChave.get(m.chaveAtivo)
    if (!ativoId) {
      res.falhas.push({ contexto: `movimentação ${m.tipo} de ${m.chaveAtivo}`, erro: 'ativo não inserido (ver falhas acima)' })
      continue
    }
    const chaveNatural = `${ativoId}|${m.tipo}|${m.data}|${m.chamado ?? ''}`
    if (chavesExistentes.has(chaveNatural)) {
      res.movimentacoesJaImportadas++
      const simulado = statusAposMovimentacao(statusPorChave.get(m.chaveAtivo) ?? 'em_estoque', m.tipo, m.statusResultante)
      if (simulado) statusPorChave.set(m.chaveAtivo, simulado)
      continue
    }
    if (m.tipo === 'ajuste') {
      // reexecução não gera novo ajuste se o estado já confere (ordem 3.2.7)
      const atual = statusPorChave.get(m.chaveAtivo)
      if (atual === m.statusResultante) {
        res.ajustesPulados++
        continue
      }
    }
    const { error } = await db.from('movimentacoes').insert({
      ativo_id: ativoId,
      tipo: m.tipo,
      motivo: m.motivo,
      data: m.data,
      filial_id: filiais.get(m.filial)!,
      filial_destino_id: m.filialDestino ? filiais.get(m.filialDestino)! : null,
      colaborador: m.colaborador,
      setor: m.setor,
      chamado: m.chamado,
      termo_assinado: m.termo,
      termo_data: m.termoData,
      itens_faltantes: m.itensFaltantes,
      observacao: m.observacao,
      status_resultante: m.tipo === 'ajuste' ? m.statusResultante : null,
      criado_por: criadoPor,
    })
    if (error) {
      res.falhas.push({
        contexto: `${m.tipo} de ${m.chaveAtivo} em ${m.data}${m.origem ? ` (${m.origem.arquivo}:${m.origem.linha})` : ` [${m.papel}]`}`,
        erro: error.message,
      })
      continue
    }
    chavesExistentes.add(chaveNatural)
    res.movimentacoesInseridas[m.tipo] = (res.movimentacoesInseridas[m.tipo] ?? 0) + 1
    const simulado = statusAposMovimentacao(statusPorChave.get(m.chaveAtivo) ?? 'em_estoque', m.tipo, m.statusResultante)
    if (simulado) statusPorChave.set(m.chaveAtivo, simulado)
  }

  // 3. sincronizações finais (colaborador/filial/termo = verdade do inventário;
  //    o trigger de ajuste não toca esses campos — DECISOES 15/07)
  const aposCarga = await buscarAtivosExistentes(db)
  const patches = new Map<string, Record<string, unknown>>()
  const patchDe = (chave: string) => {
    let p = patches.get(chave)
    if (!p) {
      p = {}
      patches.set(chave, p)
    }
    return p
  }
  for (const s of plano.sincronizarColaborador) {
    const atual = aposCarga.get(s.chaveAtivo)
    if (atual && (atual.colaborador_atual ?? null) !== s.colaborador) {
      patchDe(s.chaveAtivo).colaborador_atual = s.colaborador
      if (s.colaborador === null) patchDe(s.chaveAtivo).setor_atual = null
    }
  }
  for (const s of plano.sincronizarFilial) {
    const atual = aposCarga.get(s.chaveAtivo)
    if (atual && atual.filial_id !== filiais.get(s.filial)) {
      patchDe(s.chaveAtivo).filial_id = filiais.get(s.filial)!
    }
  }
  for (const a of plano.ativos) {
    if (a.origem !== 'importacao' || a.termo === null) continue
    const atual = aposCarga.get(a.chave)
    if (atual && (atual.termo_assinado !== a.termo || (atual.termo_data ?? null) !== a.termoData)) {
      patchDe(a.chave).termo_assinado = a.termo
      patchDe(a.chave).termo_data = a.termoData
    }
  }
  for (const [chave, patch] of patches) {
    const id = idPorChave.get(chave) ?? aposCarga.get(chave)?.id
    if (!id) continue
    const { error } = await db.from('ativos').update(patch).eq('id', id)
    if (error) res.falhas.push({ contexto: `sincronizar ativo ${chave}`, erro: error.message })
    else res.sincronizacoes++
  }

  return res
}

// ---------------------------------------------------------------------------
// Execução da carga de itens (3.2b)

type ResultadoItens = {
  itensCriados: number
  lancamentosInseridos: number
  lancamentosJaImportados: number
  falhas: { contexto: string; erro: string }[]
}

const OBS_SALDO_INICIAL = 'saldo inicial (go-live)'

async function executarItens(
  db: Db,
  plano: PlanoItens,
  filiais: Map<FilialOficial, number>,
  criadoPor: string,
  hoje: string,
  criarFaltantes: boolean,
): Promise<ResultadoItens> {
  const res: ResultadoItens = { itensCriados: 0, lancamentosInseridos: 0, lancamentosJaImportados: 0, falhas: [] }

  const { data: itensDb, error: itensErr } = await db.from('itens').select('id, nome')
  if (itensErr) throw new Error(`Falha ao ler itens: ${itensErr.message}`)
  const idPorNome = new Map((itensDb ?? []).map((i) => [(i.nome as string).trim().toLowerCase(), i.id as number]))

  if (criarFaltantes) {
    const faltantes = [...new Set(plano.saldos.map((s) => s.nomeItem))].filter(
      (n) => !idPorNome.has(n.trim().toLowerCase()),
    )
    for (const nome of faltantes) {
      const { data, error } = await db
        .from('itens')
        .insert({ nome, grupo: 'acessorio' })
        .select('id, nome')
        .single()
      if (error) {
        res.falhas.push({ contexto: `criar item "${nome}"`, erro: error.message })
        continue
      }
      idPorNome.set((data.nome as string).trim().toLowerCase(), data.id as number)
      res.itensCriados++
    }
  }

  // idempotência: aberturas já lançadas (item × filial com observação padrão)
  const { data: aberturas, error: abErr } = await db
    .from('lancamentos_item')
    .select('item_id, filial_id')
    .eq('tipo', 'entrada')
    .eq('observacao', OBS_SALDO_INICIAL)
  if (abErr) throw new Error(`Falha ao ler lançamentos: ${abErr.message}`)
  const jaLancado = new Set((aberturas ?? []).map((l) => `${l.item_id}|${l.filial_id}`))

  for (const s of plano.saldos) {
    const itemId = idPorNome.get(s.nomeItem.trim().toLowerCase())
    if (itemId === undefined) {
      res.falhas.push({ contexto: `${s.nomeItem} × ${s.filial}`, erro: 'item fora do catálogo (rodar com --criar-itens-faltantes ou criar antes)' })
      continue
    }
    const filialId = filiais.get(s.filial)!
    if (jaLancado.has(`${itemId}|${filialId}`)) {
      res.lancamentosJaImportados++
      continue
    }
    const { error } = await db.from('lancamentos_item').insert({
      item_id: itemId,
      filial_id: filialId,
      tipo: 'entrada',
      quantidade: s.saldo,
      data: hoje,
      observacao: OBS_SALDO_INICIAL,
      criado_por: criadoPor,
    })
    if (error) {
      res.falhas.push({ contexto: `${s.nomeItem} × ${s.filial}`, erro: error.message })
      continue
    }
    jaLancado.add(`${itemId}|${filialId}`)
    res.lancamentosInseridos++
  }

  return res
}

// ---------------------------------------------------------------------------
// main

async function main() {
  const inicio = Date.now()
  const cfg = assertCargaGuards() // SEMPRE primeiro — aborta antes de qualquer leitura
  const args = parseArgs(process.argv.slice(2))
  const temAtivos = args.inventarios.length > 0 || args.saidas || args.devolucoes
  if (temAtivos && (args.inventarios.length !== 5 || !args.saidas || !args.devolucoes)) {
    console.error('Carga de ativos exige --inventarios com 5 caminhos (um por filial), --saidas e --devolucoes.')
    process.exit(1)
  }
  if (!temAtivos && !args.itens) {
    console.error('Nada a fazer: informe --inventarios/--saidas/--devolucoes e/ou --itens.')
    process.exit(1)
  }

  const db = createAdminClient(cfg)
  const criadoPor = await resolverAdmin(db, cfg.adminEmail)
  const hoje = hojeIso()
  const ts = timestamp()
  console.log(`\n=== CARGA F4 · projeto ${cfg.projectRef} · ${args.executar ? 'EXECUTAR' : 'DRY-RUN'} · ${hoje} ===\n`)

  const filiais = await buscarFiliais(db)
  const inconsistencias: Inconsistencia[] = []

  // ------------------------------------------------------------------ ativos
  let plano: Plano | null = null
  let linhasSaidas = 0
  let linhasDevolucoes = 0
  let linhasInventarios = 0
  if (temAtivos) {
    const resolucoes: Resolucao[] = args.resolucoes
      ? (JSON.parse(readFileSync(args.resolucoes, 'utf8')) as Resolucao[])
      : []

    const inventarios: { filialDoArquivo: FilialOficial; registros: RegistroInventario[] }[] = []
    const todasDescartadas: LinhaDescartada[] = []
    for (const path of args.inventarios) {
      const csv = parseCsvCru(path, basename(path))
      const { layout, registros, descartadas } = extrairInventario(csv)
      todasDescartadas.push(...descartadas)
      // filial do arquivo = Site mais frequente entre as linhas (para a regra
      // da linha "auto-consistente" na consolidação)
      const contagem = new Map<FilialOficial, number>()
      for (const r of registros) {
        const f = mapearUnidade(r.site)
        if (f) contagem.set(f, (contagem.get(f) ?? 0) + 1)
      }
      const filialDoArquivo = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Matriz'
      inventarios.push({ filialDoArquivo, registros })
      linhasInventarios += registros.length
      console.log(`inventário ${basename(path)}: ${registros.length} linhas (layout ${layout}, ${csv.encoding}) → filial dominante ${filialDoArquivo}`)
    }

    const csvSaidas = parseCsvCru(args.saidas!, basename(args.saidas!))
    const saidas = extrairSaidas(csvSaidas)
    todasDescartadas.push(...saidas.descartadas)
    linhasSaidas = saidas.registros.length
    console.log(`saídas ${basename(args.saidas!)}: ${linhasSaidas} linhas (${csvSaidas.encoding})`)

    const csvDev = parseCsvCru(args.devolucoes!, basename(args.devolucoes!))
    const devolucoes = extrairDevolucoes(csvDev)
    todasDescartadas.push(...devolucoes.descartadas)
    linhasDevolucoes = devolucoes.registros.length
    console.log(`devoluções ${basename(args.devolucoes!)}: ${linhasDevolucoes} linhas (${csvDev.encoding})`)

    for (const d of todasDescartadas) {
      inconsistencias.push({
        severidade: 'aviso', tipo: 'linha_incompleta', arquivo: d.arquivo, linha: d.linha,
        valor: d.conteudo, acaoProposta: 'linha sem identificação (sobra de edição) — descartada',
      })
    }

    plano = montarPlano({ inventarios, saidas: saidas.registros, devolucoes: devolucoes.registros, hoje, resolucoes })
    inconsistencias.push(...plano.inconsistencias)
  }

  // ------------------------------------------------------------------- itens
  let planoItens: PlanoItens | null = null
  if (args.itens) {
    const csv = parseCsvCru(args.itens, basename(args.itens))
    const { data: catalogoDb, error } = await db.from('itens').select('nome')
    if (error) throw new Error(`Falha ao ler catálogo de itens: ${error.message}`)
    planoItens = montarPlanoItens(csv, (catalogoDb ?? []).map((i) => i.nome as string), args.criarItensFaltantes)
    inconsistencias.push(...planoItens.inconsistencias)
    console.log(`itens ${basename(args.itens)}: ${planoItens.saldos.length} pares item × filial com saldo`)
  }

  // ------------------------------------------------------------------ prévia
  const bloqueantes = inconsistencias.filter((i) => i.severidade === 'bloqueante')
  const pathInconsistencias = escreverInconsistencias(inconsistencias, ts)

  console.log('\n--- PRÉVIA ---')
  if (plano) {
    const e = plano.estatisticas
    console.log(`ativos no plano: ${e.ativosNovos} (inferidos: ${e.ativosInferidos}; consolidações entre abas: ${e.consolidacoesEntreAbas})`)
    console.log(`movimentações no plano: ${plano.movimentacoes.length}`)
    for (const [tipo, n] of Object.entries(e.movimentacoesPorTipo).sort()) console.log(`  ${tipo}: ${n}`)
    console.log(`ajustes de reconciliação por filial: ${JSON.stringify(e.ajustesPorFilial)}`)
    console.log(`replay pulado (estado_divergente) por arquivo: ${JSON.stringify(e.estadoDivergentePorArquivo)}`)
    console.log(`sincronizações pós-carga: colaborador=${plano.sincronizarColaborador.length} filial=${plano.sincronizarFilial.length}`)
  }
  if (planoItens) {
    console.log(`lançamentos de abertura de itens: ${planoItens.saldos.length}`)
  }
  console.log('\ninconsistências por tipo:')
  for (const [tipo, n] of Object.entries(contarPorTipo(inconsistencias)).sort()) console.log(`  ${tipo}: ${n}`)
  console.log(`relatório: ${pathInconsistencias}`)

  const comparar = (rotulo: string, esperado: number | null, real: number) => {
    if (esperado === null) return
    const ok = esperado === real
    console.log(`esperado-${rotulo}: ${esperado} × lido: ${real} ${ok ? '✓' : '✗ DESVIO'}`)
  }
  console.log('')
  comparar('ativos (linhas de inventário)', args.esperadoAtivos, linhasInventarios)
  comparar('saidas', args.esperadoSaidas, linhasSaidas)
  comparar('devolucoes', args.esperadoDevolucoes, linhasDevolucoes)

  if (bloqueantes.length > 0) {
    console.error(`\n✗ ${bloqueantes.length} inconsistência(s) BLOQUEANTE(s) — ver ${pathInconsistencias}.`)
    if (args.executar) console.error('--executar RECUSADO com bloqueantes pendentes.')
    process.exit(1)
  }
  if (!args.executar) {
    console.log('\nDry-run concluído sem bloqueantes. Rode com --executar para carregar.')
    return
  }

  // --------------------------------------------------------------- execução
  console.log('\n--- EXECUTANDO ---')
  const resultado: Record<string, unknown> = {
    timestamp: ts,
    projeto: cfg.projectRef,
    hoje,
  }
  if (plano) {
    const r = await executarAtivos(db, plano, filiais, criadoPor)
    resultado.ativos = r
    console.log(`ativos: criados=${r.ativosCriados} atualizados=${r.ativosAtualizados} jaExistentes=${r.ativosJaExistentes}`)
    console.log(`movimentações inseridas: ${JSON.stringify(r.movimentacoesInseridas)}`)
    console.log(`ja_importada=${r.movimentacoesJaImportadas} ajustesPulados=${r.ajustesPulados} sincronizações=${r.sincronizacoes}`)
    if (r.falhas.length > 0) {
      console.error(`✗ ${r.falhas.length} falha(s):`)
      for (const f of r.falhas.slice(0, 20)) console.error(`  ${f.contexto}: ${f.erro}`)
    }
  }
  if (planoItens) {
    const r = await executarItens(db, planoItens, filiais, criadoPor, hoje, args.criarItensFaltantes)
    resultado.itens = r
    console.log(`itens: criados=${r.itensCriados} aberturas=${r.lancamentosInseridos} jaImportadas=${r.lancamentosJaImportados}`)
    if (r.falhas.length > 0) {
      console.error(`✗ ${r.falhas.length} falha(s) em itens:`)
      for (const f of r.falhas.slice(0, 20)) console.error(`  ${f.contexto}: ${f.erro}`)
    }
  }

  resultado.duracaoSegundos = Math.round((Date.now() - inicio) / 1000)
  resultado.esperado = {
    ativos: args.esperadoAtivos, saidas: args.esperadoSaidas, devolucoes: args.esperadoDevolucoes,
    lidoInventarios: linhasInventarios, lidoSaidas: linhasSaidas, lidoDevolucoes: linhasDevolucoes,
  }
  const pathResultado = `carga-resultado-${ts}.json`
  writeFileSync(pathResultado, JSON.stringify(resultado, null, 2), 'utf8')
  console.log(`\nresultado: ${pathResultado} (${resultado.duracaoSegundos}s)`)

  const falhas =
    ((resultado.ativos as ResultadoAtivos | undefined)?.falhas.length ?? 0) +
    ((resultado.itens as ResultadoItens | undefined)?.falhas.length ?? 0)
  if (falhas > 0) process.exit(1)
}

main().catch((e) => {
  console.error('\n[CARGA] Erro fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})

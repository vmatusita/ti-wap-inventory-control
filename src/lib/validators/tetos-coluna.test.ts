import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { comandosDoTexto } from '../../../scripts/db/classificar-migration.mjs'
import { listarMigrations } from '../../../scripts/db/corpo-vigente.mjs'
import {
  TETOS_COLUNA,
  LOTES_COMPRIMENTO,
  NOME_ALTERNATIVO_DE_TAMANHO,
  constraintsDeTamanho,
  nomeDaConstraintDeTamanho,
  tetoDaColuna,
  type TetoDeColuna,
} from './tetos-coluna'
import { anotacaoSchema, definirServiceTagSchema, editarAtivoSchema } from './ativo'
import { compraLoteSchema } from './compra'
import { devolverFornecedorSchema, substitutoSchema } from './devolucao-fornecedor'
import { colaboradorInlineSchema, colaboradorSchema } from './colaborador'
import { estornoLancamentoSchema, itemCatalogoSchema, itemInlineSchema, lancamentoItemSchema, TETO_MOTIVO_ESTORNO } from './item'
import { estornoActionSchema, movimentacaoSchema } from './movimentacao'
import { reabrirPendenciaItemSchema, resolverPendenciaItemSchema } from './pendencia-item'
import { camposTermoSchema } from './termo'
import { apelidoFilialSchema, atualizarFilialSchema, atualizarMotivoSchema, conviteSchema, filialSchema, motivoSchema } from './admin'
import { tipoItemSchema } from './tipo-item'
import { kitCatalogoSchema } from './kit'
import { criarSenhaSchema } from './senha'
import { justificativaSchema } from './dev-destrutivo'
import { LIMITES_CAMPO_PLANO, MAX_ARQUIVO_HASH } from '@/lib/import/limites'
import { ACOES_ADMIN } from '@/lib/auditoria'
import { TERMO_TIPOS } from '@/lib/termos/tipos'

// =============================================================================
// A TRAVA DE MESA DOS TETOS DE COMPRIMENTO — F66B (12/11/2026). RODA SEM BANCO.
// =============================================================================
// A F66B pôs um CHECK `char_length(<col>) <= <teto>` em toda coluna de texto das 20 tabelas de negócio (0181–0184), com
// o teto da FONTE ÚNICA (`tetos-coluna.ts`). Esta suíte cobra, sem Postgres:
//   1. a fonte é coerente (as 65, os quatro lotes, os nomes ≤ 63 bytes);
//   2. MIGRATIONS ↔ FONTE, NOS DOIS SENTIDOS: todo `add constraint <nome> check (char_length(<col>) <= <N>)` das
//      migrations tem a entrada da fonte com o MESMO nome, coluna e N — e toda entrada da fonte tem o seu, na migration do
//      lote dela (lida pelo léxico único, `comandosDoTexto`);
//   3. OS CAMINHOS COM TETO: cada um, pelo schema REAL que a tela usa (a sonda: aceita o teto declarado, recusa o teto + 1),
//      tem teto ≤ o da coluna — um `.max()` de tela que suba acima do banco reprova aqui, antes de virar 23514 na tela;
//   4. OS CAMINHOS SEM TETO (sem `.max()` desde antes da F66B — decisão 6: nenhum teto de tela muda; backlog): a sonda
//      confirma que CONTINUAM sem teto ≤ o banco. Quem puser um `.max()` num deles tem de movê-lo para a lista 3;
//   5. O IMPORT: `LIMITES_CAMPO_PLANO[campo]` ≤ o teto de toda coluna que o campo alimenta (o mapa do PLAN §3); e os campos
//      de `AtivoPlano` são EXATAMENTE as chaves de `LIMITES_CAMPO_PLANO` (o `satisfies` de limites.ts usa uma união
//      literal, não `keyof AtivoPlano` — um campo novo ficaria sem teto sem erro de compilação);
//   6. AS CÓPIAS nos roteiros (`k_comprimento_teto`, `k_comprimento_nome_alternativo`, `k_comprimento_derivado`, `k_negocio`)
//      batem com a fonte.
//
// O QUE ELA NÃO PEGA (declarado, PLAN-F66B decisão 7): um caminho de escrita NOVO que ninguém declare nas listas 3/4 (a
// rede é o próprio CHECK e a frase do 23514); um caminho da lista 4 que ganhe um `.max()` MAIOR que o do banco (continua
// "sem teto ≤ banco" para a sonda); o texto que uma função SQL compõe (o PLAN §2 o mede; o CHECK o recusa).
// =============================================================================

const RAIZ = process.cwd()
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')
const a = (n: number) => 'a'.repeat(n)
const digitos = (n: number) => '1'.repeat(n)
const UUID = '00000000-0000-4000-8000-000000000001'
const DATA = '2026-01-05'
const ok = (r: { success: boolean }) => r.success

type Caminho = {
  readonly coluna: string
  readonly onde: string
  /** null = o caminho grava SEM `.max()` (lista 4). */
  readonly teto: number | null
  readonly sonda: (s: string) => boolean
  readonly amostra?: (n: number) => string
}

const mov = (extra: Record<string, unknown>) => (s: string, campo: string) =>
  ok(movimentacaoSchema.safeParse({ ativo_id: UUID, data: DATA, ...extra, [campo]: s }))
const saida = mov({ tipo: 'saida', motivo: 'motivo_ficticio', colaborador: 'Fulano', setor: 'TI' })

/** A LISTA 3 — os caminhos de tela que gravam numa das 65 colunas COM teto (PLAN-F66B §2). */
const CAMINHOS_COM_TETO: readonly Caminho[] = [
  // lote 1
  { coluna: 'colaboradores.nome', onde: 'validators/colaborador.ts:12 · criar/editar colaborador', teto: 80, sonda: (s) => ok(colaboradorSchema.shape.nome.safeParse(s)) },
  { coluna: 'colaboradores.nome', onde: 'validators/colaborador.ts:49 · colaborador inline', teto: 80, sonda: (s) => ok(colaboradorInlineSchema.shape.nome.safeParse(s)) },
  { coluna: 'colaboradores.matricula', onde: 'validators/colaborador.ts:26', teto: 40, sonda: (s) => ok(colaboradorSchema.shape.matricula.safeParse(s)) },
  { coluna: 'colaboradores.setor', onde: 'validators/colaborador.ts:27', teto: 80, sonda: (s) => ok(colaboradorSchema.shape.setor.safeParse(s)) },
  { coluna: 'itens.nome', onde: 'validators/item.ts:280 · catálogo de itens', teto: 80, sonda: (s) => ok(itemCatalogoSchema.shape.nome.safeParse(s)) },
  { coluna: 'itens.nome', onde: 'validators/item.ts:303 · item inline', teto: 80, sonda: (s) => ok(itemInlineSchema.shape.nome.safeParse(s)) },
  { coluna: 'termos_gerados.colaborador', onde: 'validators/termo.ts:29 · persistirTermo', teto: 200, sonda: (s) => ok(camposTermoSchema.shape.colaborador.safeParse(s)) },
  { coluna: 'anotacoes.texto', onde: 'validators/ativo.ts:64 · anotar ativo', teto: 2000, sonda: (s) => ok(anotacaoSchema.shape.texto.safeParse(s)) },
  // lote 2
  { coluna: 'ativos.observacoes', onde: 'validators/ativo.ts:36 · ficha do ativo', teto: 2000, sonda: (s) => ok(editarAtivoSchema.shape.observacoes.safeParse(s)) },
  { coluna: 'ativos.observacoes', onde: 'validators/devolucao-fornecedor.ts · substituto da devolução', teto: 2000, sonda: (s) => ok(substitutoSchema.shape.observacoes.safeParse(s)) },
  { coluna: 'ativos.service_tag', onde: 'validators/ativo.ts:106 · definir service tag', teto: 100, sonda: (s) => ok(definirServiceTagSchema.shape.service_tag.safeParse(s)) },
  { coluna: 'ativos.telefone', onde: 'validators/ativo.ts:31 · ficha', teto: 60, sonda: (s) => ok(editarAtivoSchema.shape.telefone.safeParse(s)) },
  { coluna: 'ativos.imei', onde: 'validators/ativo.ts:32 · ficha', teto: 60, sonda: (s) => ok(editarAtivoSchema.shape.imei.safeParse(s)) },
  { coluna: 'ativos.pulsus', onde: 'validators/ativo.ts:33 · ficha', teto: 60, sonda: (s) => ok(editarAtivoSchema.shape.pulsus.safeParse(s)) },
  { coluna: 'ativos.telefone', onde: 'validators/compra.ts:53 · compra', teto: 60, sonda: (s) => ok(compraLoteSchema.shape.telefone.safeParse(s)) },
  { coluna: 'ativos.imei', onde: 'validators/compra.ts:54 · compra', teto: 60, sonda: (s) => ok(compraLoteSchema.shape.imei.safeParse(s)) },
  { coluna: 'ativos.pulsus', onde: 'validators/compra.ts:55 · compra', teto: 60, sonda: (s) => ok(compraLoteSchema.shape.pulsus.safeParse(s)) },
  { coluna: 'movimentacoes.observacao', onde: 'validators/movimentacao.ts:292 · lote de movimentação', teto: 500, sonda: (s) => saida(s, 'observacao') },
  { coluna: 'movimentacoes.observacao', onde: 'validators/movimentacao.ts:378 · ajuste', teto: 500, sonda: (s) => mov({ tipo: 'ajuste', status_resultante: 'em_estoque' })(s, 'observacao') },
  { coluna: 'movimentacoes.observacao', onde: 'validators/movimentacao.ts:459 · estorno pela linha do tempo', teto: 500, sonda: (s) => ok(estornoActionSchema.shape.observacao.safeParse(s)) },
  { coluna: 'movimentacoes.observacao', onde: 'validators/compra.ts:60 · nota da compra', teto: 500, sonda: (s) => ok(compraLoteSchema.shape.observacao.safeParse(s)) },
  { coluna: 'movimentacoes.observacao', onde: 'validators/devolucao-fornecedor.ts · devolução', teto: 500, sonda: (s) => ok(devolverFornecedorSchema.shape.observacao.safeParse(s)) },
  { coluna: 'movimentacoes.observacao', onde: 'validators/devolucao-fornecedor.ts · troca do substituto', teto: 500, sonda: (s) => ok(substitutoSchema.shape.observacao.safeParse(s)) },
  { coluna: 'movimentacoes.observacao', onde: 'validators/dev-destrutivo.ts:21 · forçar estado (justificativa)', teto: 500, sonda: (s) => ok(justificativaSchema.safeParse(s)) },
  { coluna: 'movimentacoes.chamado_fornecedor', onde: 'validators/movimentacao.ts:300 · envio à manutenção', teto: 200, sonda: (s) => mov({ tipo: 'envio_manutencao' })(s, 'chamado_fornecedor') },
  { coluna: 'pendencias_item.observacao', onde: 'validators/pendencia-item.ts:17 · resolver pendência', teto: 500, sonda: (s) => ok(resolverPendenciaItemSchema.shape.observacao.safeParse(s)) },
  { coluna: 'lancamentos_item.chamado', onde: 'validators/item.ts:20 · lançamento de item', teto: 20, sonda: (s) => ok(lancamentoItemSchema.shape.chamado.safeParse(s)), amostra: digitos },
  { coluna: 'lancamentos_item.colaborador', onde: 'validators/item.ts:25 · lançamento de item', teto: 120, sonda: (s) => ok(lancamentoItemSchema.shape.colaborador.safeParse(s)) },
  { coluna: 'lancamentos_item.observacao', onde: 'validators/item.ts:30 · lançamento de item', teto: 500, sonda: (s) => ok(lancamentoItemSchema.shape.observacao.safeParse(s)) },
  { coluna: 'lancamentos_item.observacao', onde: 'validators/item.ts:264 · motivo do estorno de lançamento', teto: TETO_MOTIVO_ESTORNO, sonda: (s) => ok(estornoLancamentoSchema.shape.motivo.safeParse(s)) },
  // lote 3
  { coluna: 'unidades_apelidos.apelido', onde: 'validators/admin.ts:323 · apelido de filial', teto: 80, sonda: (s) => ok(apelidoFilialSchema.shape.apelido.safeParse(s)) },
  { coluna: 'tipos_item.slug', onde: 'validators/tipo-item.ts:21 · tipo de item (regex)', teto: 30, sonda: (s) => ok(tipoItemSchema.shape.slug.safeParse(s)) },
  { coluna: 'tipos_item.rotulo', onde: 'validators/tipo-item.ts:33 · tipo de item', teto: 60, sonda: (s) => ok(tipoItemSchema.shape.rotulo.safeParse(s)) },
  { coluna: 'motivos.codigo', onde: 'validators/admin.ts:341 · criar motivo', teto: 40, sonda: (s) => ok(motivoSchema.shape.codigo.safeParse(s)) },
  { coluna: 'motivos.codigo', onde: 'validators/admin.ts:347 · editar motivo (filtro; F66B: .max(40))', teto: 40, sonda: (s) => ok(atualizarMotivoSchema.shape.codigo.safeParse(s)) },
  { coluna: 'motivos.rotulo', onde: 'validators/admin.ts:342 · criar motivo', teto: 80, sonda: (s) => ok(motivoSchema.shape.rotulo.safeParse(s)) },
  { coluna: 'motivos.rotulo', onde: 'validators/admin.ts:348 · editar motivo', teto: 80, sonda: (s) => ok(atualizarMotivoSchema.shape.rotulo.safeParse(s)) },
  { coluna: 'kits_modelos.nome', onde: 'validators/kit.ts:127 · kit', teto: 80, sonda: (s) => ok(kitCatalogoSchema.shape.nome.safeParse(s)) },
  { coluna: 'filiais.nome', onde: 'validators/admin.ts:286 · criar filial', teto: 80, sonda: (s) => ok(filialSchema.shape.nome.safeParse(s)) },
  { coluna: 'filiais.nome', onde: 'validators/admin.ts:302 · editar filial', teto: 80, sonda: (s) => ok(atualizarFilialSchema.shape.nome.safeParse(s)) },
  { coluna: 'filiais.cidade', onde: 'validators/admin.ts:299 · criar filial', teto: 120, sonda: (s) => ok(filialSchema.shape.cidade.safeParse(s)) },
  { coluna: 'filiais.cidade', onde: 'validators/admin.ts:310 · editar filial', teto: 120, sonda: (s) => ok(atualizarFilialSchema.shape.cidade.safeParse(s)) },
  // lote 4
  { coluna: 'senhas_acesso.rotulo', onde: 'validators/senha.ts:6 · senha de acesso', teto: 80, sonda: (s) => ok(criarSenhaSchema.shape.rotulo.safeParse(s)) },
  // a justificativa da reabertura entra na anotação composta (pendencias.ts:442-446: ~30 + item + justificativa)
  { coluna: 'anotacoes.texto', onde: 'validators/pendencia-item.ts:45 · justificativa da reabertura (vai na anotação)', teto: 500, sonda: (s) => ok(reabrirPendenciaItemSchema.shape.justificativa.safeParse(s)) },
]

/**
 * A LISTA 4 — os caminhos de tela que gravam numa das 65 colunas SEM `.max()` (PLAN-F66B §2, fato 8). Depois da F66B o
 * banco é o limite deles, e a frase do 23514 chega à tela. Pôr o `.max()` nelas é backlog (decisão 6).
 */
const CAMINHOS_SEM_TETO: readonly Caminho[] = [
  ...(['marca', 'modelo', 'memoria', 'armazenamento', 'processador', 'fornecedor'] as const).map((c) => ({
    coluna: `ativos.${c}`, onde: 'validators/compra.ts · compra', teto: null,
    sonda: (s: string) => ok(compraLoteSchema.shape[c].safeParse(s)),
  })),
  ...(['marca', 'modelo', 'memoria', 'armazenamento', 'processador', 'hostname', 'service_tag'] as const).map((c) => ({
    coluna: `ativos.${c}`, onde: 'validators/devolucao-fornecedor.ts · substituto', teto: null,
    sonda: (s: string) => ok(substitutoSchema.shape[c].safeParse(s)),
  })),
  ...(['hostname', 'memoria', 'armazenamento', 'processador'] as const).map((c) => ({
    coluna: `ativos.${c}`, onde: 'validators/ativo.ts · ficha', teto: null,
    sonda: (s: string) => ok(editarAtivoSchema.shape[c].safeParse(s)),
  })),
  { coluna: 'ativos.service_tag', onde: 'validators/compra.ts:27 · compra', teto: null, sonda: (s) => ok(compraLoteSchema.shape.itens.element.shape.service_tag.safeParse(s)) },
  { coluna: 'movimentacoes.motivo', onde: 'validators/movimentacao.ts:322 · saída', teto: null, sonda: (s) => saida(s, 'motivo') },
  { coluna: 'movimentacoes.colaborador', onde: 'validators/movimentacao.ts:323 · saída', teto: null, sonda: (s) => saida(s, 'colaborador') },
  { coluna: 'movimentacoes.setor', onde: 'validators/movimentacao.ts:324 · saída', teto: null, sonda: (s) => saida(s, 'setor') },
  { coluna: 'movimentacoes.chamado', onde: 'validators/movimentacao.ts:277 · chamado (só dígitos)', teto: null, sonda: (s) => saida(s, 'chamado'), amostra: digitos },
  {
    coluna: 'pendencias_item.item', onde: 'validators/movimentacao.ts:354 · item faltante da devolução (vira pendência)', teto: null,
    sonda: (s) => ok(movimentacaoSchema.safeParse({ tipo: 'devolucao', ativo_id: UUID, data: DATA, motivo: 'motivo_ficticio', itens_faltantes: [s] })),
  },
  { coluna: 'filiais.slug', onde: 'validators/admin.ts:287 · slug da filial (regex, sem .max)', teto: null, sonda: (s) => ok(filialSchema.shape.slug.safeParse(s)) },
  {
    coluna: 'eventos_admin.alvo', onde: 'validators/admin.ts:12 · e-mail do convite (vai no alvo da trilha)', teto: null,
    sonda: (s) => ok(conviteSchema.shape.email.safeParse(s)), amostra: (n) => `${'a'.repeat(Math.max(1, n - 12))}@wap.ind.br`,
  },
]

/** O mapa do import (PLAN-F66B §3): campo do plano → as colunas de texto que a RPC grava com ele. */
const CAMPO_DO_PLANO: Readonly<Record<keyof typeof LIMITES_CAMPO_PLANO, readonly string[]>> = {
  patrimonio: ['ativos.patrimonio'],
  patrimonioOriginal: ['ativos.patrimonio_original'],
  serviceTag: ['ativos.service_tag'],
  categoria: [], // enum
  marca: ['ativos.marca'],
  modelo: ['ativos.modelo'],
  fornecedor: ['ativos.fornecedor'],
  memoria: ['ativos.memoria'],
  armazenamento: ['ativos.armazenamento'],
  processador: ['ativos.processador'],
  hostname: ['ativos.hostname'],
  observacoes: ['ativos.observacoes'],
  dataEntrada: [], // date
  dataAjuste: [], // date
  estadoAlvo: [], // enum
  colaborador: ['movimentacoes.colaborador', 'ativos.colaborador_atual'],
  setor: ['movimentacoes.setor', 'ativos.setor_atual'],
  chamado: ['movimentacoes.chamado'],
}

const tetoDe = (coluna: string): number => {
  const [t, c] = coluna.split('.')
  const v = tetoDaColuna(t, c)
  if (v === undefined) throw new Error(`a coluna ${coluna} não está na fonte (tetos-coluna.ts)`)
  return v
}

/** Os `add constraint … check (char_length(…) <= N)` das migrations, pelo léxico único. */
function constraintsDasMigrations() {
  const achadas = new Map<string, { tabela: string; coluna: string; teto: number; migration: string }>()
  for (const arquivo of listarMigrations(RAIZ)) {
    for (const cmd of comandosDoTexto(ler('supabase', 'migrations', arquivo))) {
      const c = cmd.replace(/\s+/g, ' ').trim().toLowerCase()
      const m = /^alter table (?:only )?(?:public\.)?([a-z_0-9]+) (.*)$/.exec(c)
      if (!m) continue
      for (const parte of m[2].split(/,\s*(?=add constraint |drop constraint )/)) {
        const add = /^add constraint ([a-z_0-9]+) check \(char_length\(([a-z_0-9]+)\) <= (\d+)\)$/.exec(parte.trim())
        if (add) achadas.set(add[1], { tabela: m[1], coluna: add[2], teto: Number(add[3]), migration: arquivo })
        const drop = /^drop constraint (?:if exists )?([a-z_0-9]+)$/.exec(parte.trim())
        if (drop) achadas.delete(drop[1])
      }
    }
  }
  return achadas
}

/** Lê um `text[]` de um roteiro: `<nome> text[] := array[ … ];` → as strings. */
function arrayDoRoteiro(roteiro: string, nome: string): string[] {
  const sql = ler('supabase', 'tests', `${roteiro}.sql`)
  const m = new RegExp(String.raw`\b${nome} text\[\] := array\[([\s\S]*?)\](?:::text\[\])?;`).exec(sql)
  if (!m) throw new Error(`não achei ${nome} em ${roteiro}.sql`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

describe('1. a fonte única dos tetos é coerente', () => {
  const cs = constraintsDeTamanho()

  it('tem as 65 colunas de texto das 20 tabelas de negócio, cada uma uma vez', () => {
    expect(cs).toHaveLength(65)
    expect(new Set(cs.map((c) => `${c.tabela}.${c.coluna}`)).size).toBe(65)
    expect(new Set(cs.map((c) => c.nome)).size).toBe(65)
  })

  it('os quatro lotes cobrem as 20 tabelas, cada uma num lote só, e nenhuma tabela da fonte fica fora', () => {
    const doLote = LOTES_COMPRIMENTO.flatMap((l) => [...l.tabelas])
    expect(new Set(doLote).size).toBe(doLote.length)
    expect([...doLote].sort()).toEqual(Object.keys(TETOS_COLUNA).sort())
    expect(doLote).toHaveLength(20)
    expect(LOTES_COMPRIMENTO.map((l) => l.migration)).toEqual([
      '0181_comprimento_cadastros_do_acervo.sql', '0182_comprimento_movimento_do_acervo.sql',
      '0183_comprimento_vocabulario.sql', '0184_comprimento_registros.sql',
    ])
  })

  it('todo nome cabe no limite de identificador do Postgres (63 bytes) e segue o padrão ou o alternativo declarado', () => {
    for (const c of cs) {
      expect(Buffer.byteLength(c.nome), c.nome).toBeLessThanOrEqual(63)
      const esperado = NOME_ALTERNATIVO_DE_TAMANHO[`${c.tabela}.${c.coluna}`] ?? `${c.tabela}_${c.coluna}_tamanho`
      expect(c.nome).toBe(esperado)
      expect(c.nome.endsWith('_tamanho')).toBe(true)
    }
    for (const chave of Object.keys(NOME_ALTERNATIVO_DE_TAMANHO)) {
      const [t, col] = chave.split('.')
      expect(tetoDaColuna(t, col), `o nome alternativo ${chave} não é coluna da fonte`).toBeDefined()
    }
  })

  it('todo teto é um inteiro positivo, e todo derivado tem 3× a origem (PLAN-F66B decisão 4)', () => {
    for (const [tabela, colunas] of Object.entries(TETOS_COLUNA) as [string, Record<string, TetoDeColuna>][]) {
      for (const [coluna, t] of Object.entries(colunas)) {
        expect(Number.isInteger(t.teto) && t.teto > 0, `${tabela}.${coluna}`).toBe(true)
        if (t.origem) expect(t.teto, `${tabela}.${coluna}`).toBe(3 * colunas[t.origem].teto)
      }
    }
  })
})

describe('2. migrations ↔ fonte, nos dois sentidos', () => {
  const achadas = constraintsDasMigrations()
  const cs = constraintsDeTamanho()

  it('toda entrada da fonte tem o CHECK com o MESMO nome, coluna e teto, na migration do lote dela', () => {
    for (const c of cs) {
      const m = achadas.get(c.nome)
      expect(m, `${c.nome}: nenhuma migration o cria`).toBeDefined()
      expect(m!.tabela, c.nome).toBe(c.tabela)
      expect(m!.coluna, c.nome).toBe(c.coluna)
      expect(m!.teto, `${c.nome}: o teto da migration diverge da fonte`).toBe(c.teto)
      const lote = LOTES_COMPRIMENTO.find((l) => (l.tabelas as readonly string[]).includes(c.tabela))!
      expect(m!.migration, c.nome).toBe(lote.migration)
    }
  })

  it('todo CHECK de comprimento canônico das migrations está na fonte (nenhum teto fora dela)', () => {
    const nomes = new Set(cs.map((c) => c.nome))
    const fora = [...achadas.keys()].filter((n) => !nomes.has(n))
    expect(fora, `CHECK de comprimento sem entrada na fonte: ${fora.join(', ')}`).toEqual([])
  })

  it('cada migration da F66B cria só o seu lote, as tabelas na ordem de lock declarada', () => {
    for (const lote of LOTES_COMPRIMENTO) {
      const tabelas = comandosDoTexto(ler('supabase', 'migrations', lote.migration))
        .map((c) => /^\s*alter table (?:only )?public\.([a-z_0-9]+)/i.exec(c)?.[1])
        .filter((t): t is string => !!t)
      expect(tabelas, lote.migration).toEqual([...lote.tabelas])
    }
  })

  it('o casador sabe reprovar (guarda do próprio teste)', () => {
    const casa = (s: string) => /^add constraint ([a-z_0-9]+) check \(char_length\(([a-z_0-9]+)\) <= (\d+)\)$/.test(s)
    expect(casa('add constraint ativos_marca_tamanho check (char_length(marca) <= 60)')).toBe(true)
    expect(casa('add constraint ativos_marca_tamanho check (octet_length(marca) <= 60)')).toBe(false)
    expect(casa('add constraint ativos_marca_tamanho check (char_length(btrim(marca)) <= 60)')).toBe(false)
    expect(casa('add constraint ativos_marca_tamanho check (char_length(marca) <= 60) not valid')).toBe(false)
  })
})

describe('3. os caminhos com teto: nenhum aceita mais do que o banco', () => {
  it.each(CAMINHOS_COM_TETO.map((c) => [c.coluna, c.onde, c] as const))('%s · %s', (coluna, onde, c) => {
    const amostra = c.amostra ?? a
    expect(c.teto, onde).not.toBeNull()
    expect(c.sonda(amostra(c.teto!)), `${onde}: não aceita o teto declarado (${c.teto})`).toBe(true)
    expect(c.sonda(amostra(c.teto! + 1)), `${onde}: aceita MAIS que o teto declarado (${c.teto}) — o .max() subiu?`).toBe(false)
    expect(c.teto!, `${onde}: o caminho aceita ${c.teto}, o banco só ${tetoDe(coluna)}`).toBeLessThanOrEqual(tetoDe(coluna))
  })

  it('ativos.observacoes tem UM teto nas telas, o da fonte (decisão 6)', () => {
    const telas = CAMINHOS_COM_TETO.filter((c) => c.coluna === 'ativos.observacoes').map((c) => c.teto)
    expect(telas).toEqual([tetoDe('ativos.observacoes'), tetoDe('ativos.observacoes')])
  })

  it('a observação do relatório (actions/relatorios.ts, schema não exportável de um arquivo use server) ≤ o banco', () => {
    const m = /observacao: z\.string\(\)\.trim\(\)\.max\((\d+)/.exec(ler('src', 'lib', 'actions', 'relatorios.ts'))
    expect(m, 'não achei o .max() da observação em actions/relatorios.ts').not.toBeNull()
    expect(Number(m![1])).toBeLessThanOrEqual(tetoDe('relatorios_gerados.observacao'))
  })

  it('o tipo do termo (enum de 7) e a ação da trilha (literais de AcaoAdmin) cabem no banco', () => {
    expect(Math.max(...TERMO_TIPOS.map((t) => t.length))).toBeLessThanOrEqual(tetoDe('termos_gerados.tipo'))
    expect(Math.max(...ACOES_ADMIN.map((t) => t.length))).toBeLessThanOrEqual(tetoDe('eventos_admin.acao'))
  })
})

describe('4. os caminhos SEM teto (backlog declarado): continuam sem .max() ≤ o banco', () => {
  it.each(CAMINHOS_SEM_TETO.map((c) => [c.coluna, c.onde, c] as const))('%s · %s', (coluna, onde, c) => {
    const amostra = c.amostra ?? a
    expect(
      c.sonda(amostra(tetoDe(coluna) + 1)),
      `${onde}: ganhou um teto ≤ o banco — mova-o para CAMINHOS_COM_TETO com o número`,
    ).toBe(true)
  })
})

describe('5. o import: cada campo do plano cabe nas colunas que alimenta, e nenhum campo fica sem teto', () => {
  it.each(Object.entries(CAMPO_DO_PLANO))('%s', (campo, colunas) => {
    const limite = LIMITES_CAMPO_PLANO[campo as keyof typeof LIMITES_CAMPO_PLANO]
    for (const col of colunas) {
      expect(limite, `${campo} → ${col}: o import aceita ${limite}, o banco só ${tetoDe(col)}`).toBeLessThanOrEqual(tetoDe(col))
    }
  })

  it('o hash da planilha (MAX_ARQUIVO_HASH) cabe em import_logs.arquivo_hash', () => {
    expect(MAX_ARQUIVO_HASH).toBeLessThanOrEqual(tetoDe('import_logs.arquivo_hash'))
  })

  it('os campos de AtivoPlano são EXATAMENTE as chaves de LIMITES_CAMPO_PLANO (lidos do fonte de tipos.ts)', () => {
    const m = /export type AtivoPlano = \{([\s\S]*?)\n\}/.exec(ler('src', 'lib', 'import', 'tipos.ts'))
    expect(m, 'não achei AtivoPlano em src/lib/import/tipos.ts').not.toBeNull()
    const campos = [...m![1].matchAll(/^\s+([a-zA-Z]+)\??:/gm)].map((x) => x[1]).sort()
    expect(campos.length).toBeGreaterThan(10)
    expect(campos).toEqual(Object.keys(LIMITES_CAMPO_PLANO).sort())
    expect(Object.keys(CAMPO_DO_PLANO).sort()).toEqual(campos)
  })
})

describe('6. as cópias nos roteiros batem com a fonte', () => {
  const tetos = constraintsDeTamanho().map((c) => `${c.tabela}.${c.coluna}:${c.teto}`).sort()
  const alternativos = Object.entries(NOME_ALTERNATIVO_DE_TAMANHO).map(([k, v]) => `${k}:${v}`).sort()
  const derivados = Object.entries(TETOS_COLUNA as Record<string, Record<string, TetoDeColuna>>)
    .flatMap(([t, cols]) => Object.entries(cols).filter(([, v]) => v.origem).map(([c, v]) => `${t}.${c}:${v.origem}`))
    .sort()
  const negocio = arrayDoRoteiro('catalogo_policies', 'k_negocio').sort()

  it.each(['comprimento_por_coluna', 'comprimento_comportamento'])('%s.sql: k_comprimento_teto = a fonte, entrada a entrada', (r) => {
    expect(arrayDoRoteiro(r, 'k_comprimento_teto').sort()).toEqual(tetos)
  })

  it.each(['comprimento_por_coluna', 'comprimento_comportamento'])('%s.sql: k_comprimento_nome_alternativo = NOME_ALTERNATIVO_DE_TAMANHO', (r) => {
    expect(arrayDoRoteiro(r, 'k_comprimento_nome_alternativo').sort()).toEqual(alternativos)
  })

  it('comprimento_comportamento.sql: k_comprimento_derivado = os derivados da fonte', () => {
    expect(arrayDoRoteiro('comprimento_comportamento', 'k_comprimento_derivado').sort()).toEqual(derivados)
  })

  it.each(['comprimento_por_coluna', 'comprimento_comportamento'])('%s.sql: k_negocio é cópia EXATA de catalogo_policies.sql', (r) => {
    expect(negocio).toHaveLength(20)
    expect(arrayDoRoteiro(r, 'k_negocio').sort()).toEqual(negocio)
  })

  it('as exceções nominais (vazias na F66B) não citam coluna da fonte, e cada uma tem motivo', () => {
    const excecao = arrayDoRoteiro('comprimento_por_coluna', 'k_comprimento_excecao')
    const motivo = arrayDoRoteiro('comprimento_por_coluna', 'k_comprimento_excecao_motivo')
    expect(motivo).toHaveLength(excecao.length)
    for (const e of excecao) {
      const [t, c] = e.split('.')
      expect(tetoDaColuna(t, c), `${e} é exceção E tem teto na fonte`).toBeUndefined()
    }
  })

  it('nomeDaConstraintDeTamanho dá o padrão e o alternativo', () => {
    expect(nomeDaConstraintDeTamanho('ativos', 'marca')).toBe('ativos_marca_tamanho')
    expect(nomeDaConstraintDeTamanho('unidades_apelidos', 'apelido')).toBe('unidades_apelidos_apelido_bruto_tamanho')
  })
})

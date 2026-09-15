import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// As formas das leituras de `queries/ativos.ts` (F58 · Frente C · lote 2).
//
// `RESUMO_SELECT`/`EXPORT_SELECT` (`queries/ativos.ts`) já são LITERAIS (const de string única,
// sem `+`) mesmo usadas por identificador — medido empiricamente (docs/f58-evidencias, explore
// c): o `select<Query extends string>` do supabase-js infere pelo tipo ESTREITO da declaração
// `const`, não pelo `string` largo. Os selects aqui são cópias EXATAS dos dois, para o
// conferidor de formas comparar a MESMA leitura sem depender de reexportação.

const s = z.string()
const sn = z.string().nullable()
const n = z.number()

// O embed `ativos → filiais` sempre sai OBJETO NÃO-NULO: `ativos.filial_id` é `not null`
// (migration 0003), e a relação é resolvida por COLUNA (a tabela consultada tem a FK) — o
// supabase-js nunca marca esse caso como `| null` nem `[]` (medido: `docs/f58-evidencias`,
// explore c, §4).
const FILIAL_EMBED = z.strictObject({ slug: s, nome: s })

// ---------------------------------------------------------------------------
// A lista (`listarAtivos`)
// ---------------------------------------------------------------------------

export const LEITURA_LISTA_ATIVOS = leituraDeRelacao({
  rotulo: 'ativos.lista',
  origem: 'ativos',
  select:
    'id, patrimonio, service_tag, categoria, marca, modelo, status, colaborador_atual, updated_at, pendencia, filiais(slug, nome)',
  forma: z.strictObject({
    id: s,
    patrimonio: sn,
    service_tag: sn,
    categoria: ENUM.categoriaAtivo,
    marca: sn,
    modelo: sn,
    status: ENUM.statusAtivo,
    colaborador_atual: sn,
    updated_at: s,
    pendencia: sn,
    filiais: FILIAL_EMBED,
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// A ficha (`buscarAtivoPorId`) — `select('*')` que alimenta TELA, não backup.
// ---------------------------------------------------------------------------
// Frouxa por exigência da decisão 5 (select('*') de ficha/backup/export), mas com TODAS as
// colunas de `ativos` declaradas: a ficha espalha a linha inteira em `AtivoFicha =
// Tables<'ativos'> & {...}`, então "as colunas que o código lê" é a tabela inteira.

export const LEITURA_FICHA_ATIVO = leituraDeRelacao({
  rotulo: 'ativos.ficha',
  origem: 'ativos',
  select: '*, filiais(slug, nome)',
  forma: z.looseObject({
    id: s,
    patrimonio: sn,
    patrimonio_original: sn,
    categoria: ENUM.categoriaAtivo,
    marca: sn,
    modelo: sn,
    service_tag: sn,
    hostname: sn,
    memoria: sn,
    armazenamento: sn,
    processador: sn,
    fornecedor: sn,
    filial_id: n,
    status: ENUM.statusAtivo,
    colaborador_atual: sn,
    setor_atual: sn,
    termo_assinado: ENUM.termoStatus.nullable(),
    termo_data: sn,
    pendencia: sn,
    origem: s,
    observacoes: sn,
    telefone: sn,
    imei: sn,
    pulsus: sn,
    substitui_ativo_id: sn,
    created_at: s,
    updated_at: s,
    filiais: FILIAL_EMBED,
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// Vínculo mínimo (`buscarVinculoAtivo`, `buscarSubstitutoDe`) — mesmo select nos dois.
// ---------------------------------------------------------------------------

export const LEITURA_VINCULO_ATIVO = leituraDeRelacao({
  rotulo: 'ativos.vinculo',
  origem: 'ativos',
  select: 'id, patrimonio',
  forma: z.strictObject({ id: s, patrimonio: sn }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// Anotações da linha do tempo (`listarAnotacoesDoAtivo`)
// ---------------------------------------------------------------------------
// `anotacoes.criado_por` é not null (migration 0017) → embed do autor NÃO-nulo.

export const LEITURA_ANOTACOES_ATIVO = leituraDeRelacao({
  rotulo: 'ativos.anotacoes',
  origem: 'anotacoes',
  select: 'id, texto, created_at, autor:profiles!anotacoes_criado_por_fkey(nome)',
  forma: z.strictObject({
    id: s,
    texto: s,
    created_at: s,
    autor: z.strictObject({ nome: sn }),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// O resumo (`RESUMO_SELECT`) — combobox, colar lista, resumo por ids, recentes do operador.
// ---------------------------------------------------------------------------

export const RESUMO_SELECT =
  'id, patrimonio, service_tag, categoria, marca, modelo, status, colaborador_atual, filial_id, termo_assinado, filiais(slug, nome)'

const CAMPOS_RESUMO = {
  id: s,
  patrimonio: sn,
  service_tag: sn,
  categoria: ENUM.categoriaAtivo,
  marca: sn,
  modelo: sn,
  status: ENUM.statusAtivo,
  colaborador_atual: sn,
  filial_id: n,
  termo_assinado: ENUM.termoStatus.nullable(),
  filiais: FILIAL_EMBED,
}

/** Usado pelos QUATRO call-sites que leem `ativos` direto com `RESUMO_SELECT`. */
export const LEITURA_RESUMO_ATIVO = leituraDeRelacao({
  rotulo: 'ativos.resumo',
  origem: 'ativos',
  select: RESUMO_SELECT,
  forma: z.strictObject(CAMPOS_RESUMO),
  ordem: ['id'],
})

/** O mesmo `RESUMO_SELECT`, como EMBED de `movimentacoes` (`ultimosAtivosMovimentadosDoOperador`,
 *  em `queries/movimentacoes.ts`). `movimentacoes.ativo_id` é not null → embed NÃO-nulo. */
export const LEITURA_RECENTES_DO_OPERADOR = leituraDeRelacao({
  rotulo: 'ativos.recentes-do-operador',
  origem: 'movimentacoes',
  select: `ativo_id, ativos(${RESUMO_SELECT})`,
  forma: z.strictObject({
    ativo_id: s,
    // `movimentacoes.ativo_id` é not null (migration 0003) → embed NÃO-nulo, mesmo
    // precedente de `MOV_BASE.ativo` em `formas/relatorios.ts` (lote 1).
    ativos: z.strictObject(CAMPOS_RESUMO),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// O export CSV (`listarAtivosParaExport`)
// ---------------------------------------------------------------------------

export const EXPORT_SELECT =
  'patrimonio, service_tag, hostname, categoria, marca, modelo, telefone, imei, pulsus, status, colaborador_atual, setor_atual, pendencia, filiais(slug, nome)'

// ---------------------------------------------------------------------------
// lote 3 — a identidade do ativo (`lib/ativos/identidade.ts::cadastrosComMesmaIdentidade`)
// ---------------------------------------------------------------------------
// `ativos.filial_id` é not null (migration 0003) → o embed `filiais` sai OBJETO NÃO-NULO,
// mesmo precedente de `FILIAL_EMBED` acima — só que aqui o select pede só `nome`.

export const LEITURA_MESMA_IDENTIDADE = leituraDeRelacao({
  rotulo: 'ativos.mesma-identidade',
  origem: 'ativos',
  select: 'id, patrimonio, service_tag, filial_id, filiais(nome)',
  forma: z.strictObject({
    id: s,
    patrimonio: sn,
    service_tag: sn,
    filial_id: n,
    filiais: z.strictObject({ nome: s }),
  }),
  ordem: ['id'],
})

export const LEITURA_EXPORT_ATIVOS = leituraDeRelacao({
  rotulo: 'ativos.export',
  origem: 'ativos',
  select: EXPORT_SELECT,
  forma: z.strictObject({
    patrimonio: sn,
    service_tag: sn,
    hostname: sn,
    categoria: ENUM.categoriaAtivo,
    marca: sn,
    modelo: sn,
    telefone: sn,
    imei: sn,
    pulsus: sn,
    status: ENUM.statusAtivo,
    colaborador_atual: sn,
    setor_atual: sn,
    pendencia: sn,
    filiais: FILIAL_EMBED,
  }),
  ordem: ['id'],
})

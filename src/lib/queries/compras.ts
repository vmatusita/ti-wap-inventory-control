import { createClient } from '@/lib/supabase/server'
import type { CategoriaAtivo } from '@/lib/dominio'
import { ehUuid } from '@/lib/url-params'

// Leituras da COMPRA (F10 — A4 memória do acervo, A6 duplicar/repetir).
// Nada aqui escreve: a entrada de equipamento continua sendo `registrarCompra`.

// Mínimo de caracteres para consultar o acervo (decisão §2 da OS-F10: mín. 2 —
// não bater no banco por uma letra). Os proxies em `actions/compras.ts` repetem
// a guarda antes da chamada; aqui é a última linha.
export const MIN_CHARS_SUGESTAO = 2

// Quantas sugestões distintas voltam para a UI (decisão §2).
export const MAX_SUGESTOES = 10

// O Max Rows do PostgREST (default 1.000 no Supabase) corta requests maiores EM
// SILÊNCIO — por isso a varredura vem em BLOCOS e o passo avança pelo que
// REALMENTE voltou, nunca pelo que foi pedido. Em 22/07/2026 o prefixo de marca
// mais populoso do ensaio devolvia 994 linhas: um único request sem bloco estava
// a 6 linhas de truncar em silêncio.
const BLOCO = 1000

// Teto de linhas varridas por sugestão (o acervo tem ~1.6 mil ativos; o teto é
// folga de 2,5×, não um limite operacional).
const CAP_VARREDURA = 4000

type Bloco<T> = PromiseLike<{
  data: T[] | null
  error: { message: string } | null
}>

// Varre em blocos e AVANÇA PELO QUE VOLTOU (nunca pelo que foi pedido): se o Max
// Rows do projeto for menor que `BLOCO`, o passo fixo pularia linhas em silêncio.
// As queries ordenam por `id` como critério de desempate — sem ordem total, uma
// linha pode aparecer em dois blocos (inofensivo, o dedup resolve) ou em nenhum.
async function coletarEmBlocos<T>(
  criarQuery: (de: number, ate: number) => Bloco<T>,
  rotulo: string,
): Promise<T[]> {
  const acumulado: T[] = []
  let de = 0
  while (de < CAP_VARREDURA) {
    const ate = Math.min(de + BLOCO, CAP_VARREDURA) - 1
    const { data, error } = await criarQuery(de, ate)
    if (error) throw new Error(`Falha ao ler ${rotulo}: ${error.message}`)
    const linhas = data ?? []
    acumulado.push(...linhas)
    if (linhas.length === 0) break
    de += linhas.length
  }
  return acumulado
}

// O valor entra CRU na querystring do PostgREST (`supabase-js` não escapa nada:
// `ilike()` faz `append(coluna, 'ilike.' + pattern)`) e vira pattern de ILIKE.
//  1. barra invertida do usuário sai (ela é o escape do LIKE);
//  2. `%`/`_` digitados viram literais (escape padrão do LIKE no Postgres);
//  3. o que quebraria o parser do filtro (vírgula, parênteses, aspas) vira `%`
//     em vez de sumir — APAGAR o caractere quebraria o prefixo em silêncio
//     ("Nome (Ver" nunca acharia "Nome (Versão)"), e alargar só traz sugestão a
//     mais. `*` também não dá para escapar (o PostgREST o traduz para `%`) e cai
//     no mesmo caso benigno.
function sanitizarValor(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, '')
    .replace(/[%_]/g, (c) => `\\${c}`)
    .replace(/[,()"']/g, '%')
}

// Um prefixo só de curingas ("((" vira "%%") casaria com o acervo inteiro.
// Conta só os caracteres que de fato buscam alguma coisa.
function prefixoUtil(sanitizado: string): boolean {
  return sanitizado.replace(/\\?[%_]/g, '').trim().length >= MIN_CHARS_SUGESTAO
}

function chaveNormalizada(v: string): string {
  return v.trim().toLocaleLowerCase('pt-BR')
}

// Dedup em código — o PostgREST não tem DISTINCT. Entre grafias divergentes do
// acervo ("Dell" × "DELL", §2: nenhuma normalização retroativa) vence a MAIS
// FREQUENTE: sugerir a grafia dominante é o que faz o acervo convergir sozinho.
// Empate: a primeira em ordem alfabética. Devolve as `MAX_SUGESTOES` primeiras.
//
// Exportada por causa do teste (é a regra que dá sentido ao A4): a contagem é
// por GRAFIA EXATA e só depois se agrupa pela chave normalizada — contar no
// grupo e escolher o representante pelo alfabeto (como antes) fazia 900 "Dell"
// perderem para 12 "DELL", espalhando a divergência com a chancela do sistema.
export function dedupPorFrequencia(valores: (string | null)[]): string[] {
  const porVariante = new Map<string, number>()
  for (const bruto of valores) {
    const v = (bruto ?? '').trim()
    if (!v) continue
    porVariante.set(v, (porVariante.get(v) ?? 0) + 1)
  }

  // `total` = tamanho do grupo (ordena as sugestões entre si);
  // `n` = quantas vezes a grafia ESCOLHIDA aparece (elege o representante).
  const porChave = new Map<string, { valor: string; n: number; total: number }>()
  for (const [valor, n] of porVariante) {
    const k = chaveNormalizada(valor)
    const atual = porChave.get(k)
    if (!atual) {
      porChave.set(k, { valor, n, total: n })
      continue
    }
    atual.total += n
    const vence =
      n > atual.n || (n === atual.n && valor.localeCompare(atual.valor, 'pt-BR') < 0)
    if (vence) {
      atual.valor = valor
      atual.n = n
    }
  }

  return [...porChave.values()]
    .sort((a, b) => b.total - a.total || a.valor.localeCompare(b.valor, 'pt-BR'))
    .slice(0, MAX_SUGESTOES)
    .map((s) => s.valor)
}

// A4 — marcas já usadas no acervo que começam pelo prefixo digitado.
export async function sugestoesMarcas(prefixo: string): Promise<string[]> {
  const p = sanitizarValor(prefixo)
  if (!prefixoUtil(p)) return []
  const supabase = await createClient()
  const linhas = await coletarEmBlocos(
    (de, ate) =>
      supabase
        .from('ativos')
        .select('marca')
        .not('marca', 'is', null)
        .ilike('marca', `${p}%`)
        .order('marca', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate),
    'marcas do acervo',
  )
  return dedupPorFrequencia(linhas.map((l) => l.marca))
}

// A4 — modelos do acervo, filtrados pela marca quando ela já estiver preenchida.
// O filtro por marca é case-insensitive e SEM curinga: grafia divergente
// ("Dell"/"DELL") não pode sonegar modelos da sugestão. O `ilike` do banco é a
// primeira peneira; a comparação normalizada em código é a segunda (o `*` que o
// PostgREST traduz para `%` só alargaria o resultado).
export async function sugestoesModelos(
  marca: string | null,
  prefixo: string,
): Promise<string[]> {
  const p = sanitizarValor(prefixo)
  if (!prefixoUtil(p)) return []
  const marcaFiltro = marca ? sanitizarValor(marca) : ''
  const supabase = await createClient()
  const linhas = await coletarEmBlocos(
    (de, ate) => {
      let q = supabase
        .from('ativos')
        .select('marca, modelo')
        .not('modelo', 'is', null)
        .ilike('modelo', `${p}%`)
      if (marcaFiltro) q = q.ilike('marca', marcaFiltro)
      return q
        .order('modelo', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    },
    'modelos do acervo',
  )
  const alvo = marca ? chaveNormalizada(marca) : ''
  return dedupPorFrequencia(
    linhas
      .filter((l) => !alvo || chaveNormalizada(l.marca ?? '') === alvo)
      .map((l) => l.modelo),
  )
}

// A4 — fornecedores já usados no acervo.
export async function sugestoesFornecedores(prefixo: string): Promise<string[]> {
  const p = sanitizarValor(prefixo)
  if (!prefixoUtil(p)) return []
  const supabase = await createClient()
  const linhas = await coletarEmBlocos(
    (de, ate) =>
      supabase
        .from('ativos')
        .select('fornecedor')
        .not('fornecedor', 'is', null)
        .ilike('fornecedor', `${p}%`)
        .order('fornecedor', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate),
    'fornecedores do acervo',
  )
  return dedupPorFrequencia(linhas.map((l) => l.fornecedor))
}

// ---------------------------------------------------------------------------
// A6 — "Comprar outro igual" / "Repetir última compra"
// ---------------------------------------------------------------------------

// Pré-preenchimento do form de compra. NUNCA carrega patrimônio nem service tag
// (são o que identifica cada unidade — a compra nova tem os seus). `referencia`
// é só o rótulo do banner ("copiado de WAP0001234").
export type DadosCompraInicial = {
  categoria: CategoriaAtivo | ''
  marca: string
  modelo: string
  memoria: string
  armazenamento: string
  processador: string
  fornecedor: string
  // String porque é o que o <Select> de filial consome.
  filialId: string
  referencia: string | null
}

type CamposDoAtivo = {
  categoria: CategoriaAtivo | null
  marca: string | null
  modelo: string | null
  memoria: string | null
  armazenamento: string | null
  processador: string | null
  fornecedor: string | null
}

function montarInicial(
  ativo: CamposDoAtivo,
  filialId: number | null,
  referencia: string | null,
): DadosCompraInicial {
  return {
    categoria: ativo.categoria ?? '',
    marca: ativo.marca ?? '',
    modelo: ativo.modelo ?? '',
    memoria: ativo.memoria ?? '',
    armazenamento: ativo.armazenamento ?? '',
    processador: ativo.processador ?? '',
    fornecedor: ativo.fornecedor ?? '',
    filialId: filialId !== null ? String(filialId) : '',
    referencia,
  }
}

const CAMPOS_DO_ATIVO =
  'categoria, marca, modelo, memoria, armazenamento, processador, fornecedor'

// A6 — dados do ativo de referência para "Comprar outro igual" (`?duplicar=`).
// A guarda de uuid vem de `@/lib/url-params` (`ehUuid`) — mesma família de
// parsers de parâmetro de URL, uma fonte só.
export async function dadosParaDuplicarCompra(
  ativoId: string,
): Promise<DadosCompraInicial | null> {
  if (!ehUuid(ativoId)) return null
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ativos')
    .select(`patrimonio, filial_id, ${CAMPOS_DO_ATIVO}`)
    .eq('id', ativoId)
    .maybeSingle()
  if (error) {
    throw new Error(`Falha ao carregar o ativo de referência: ${error.message}`)
  }
  if (!data) return null

  // A filial pré-preenchida é a DA COMPRA, não a atual do ativo (que muda a cada
  // transferência). Sem movimentação de compra na linha do tempo (ativo vindo da
  // carga de go-live sem baseline), cai na filial corrente.
  const { data: compra } = await supabase
    .from('movimentacoes')
    .select('filial_id')
    .eq('ativo_id', ativoId)
    .eq('tipo', 'compra')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return montarInicial(data, compra?.filial_id ?? data.filial_id, data.patrimonio)
}

type UltimaCompraRow = {
  filial_id: number | null
  ativos: (CamposDoAtivo & { patrimonio: string | null }) | null
}

// A6 — última compra registrada POR ESTE operador (mesmo caminho de dados do
// "Repetir última" da movimentação: `movimentacoes` por `criado_por`, mais
// recente primeiro, com embed do ativo).
export async function ultimaCompraDoOperador(
  operadorId: string,
): Promise<DadosCompraInicial | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(`filial_id, ativos(patrimonio, ${CAMPOS_DO_ATIVO})`)
    .eq('criado_por', operadorId)
    .eq('tipo', 'compra')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Degrada para "sem última compra": é pré-preenchimento, não pode derrubar a
  // tela de cadastro.
  if (error) return null
  const row = (data as unknown as UltimaCompraRow | null) ?? null
  if (!row?.ativos) return null
  return montarInicial(row.ativos, row.filial_id, row.ativos.patrimonio)
}

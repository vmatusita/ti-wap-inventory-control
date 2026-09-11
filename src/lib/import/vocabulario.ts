// O vocabulário do import de startup — unidades, categoria, situação e prefixos
// de patrimônio — como DADO (F56 · Frente D, segunda metade · Decisão 3 do
// PLAN-F56.md). Módulo PURO e CLIENT-SAFE: nada de banco, nada de `node:*`. O
// motor (`plano.ts`, `correcoes.ts`) e a UI recebem o vocabulário por
// PARÂMETRO, no padrão de `rotuloTipoItem(slug, mapa)` (F39,
// `src/lib/itens/rotulo-tipo.ts`) — nenhuma constante de unidade/categoria/
// situação/prefixo vive mais em código.
//
// O tipo `VocabularioImport` é SÓ objetos e arrays comuns — nunca `Map`, `Set`,
// `RegExp`, função, classe ou `Object.create(null)` — porque ele atravessa a
// fronteira RSC como prop (a página lê do banco, o wizard e os cards recebem a
// fatia de cliente). `Object.create(null)` já quebrou essa fronteira uma vez
// nesta casa (`rotulo-tipo.ts`, "Only plain objects … can be passed to Client
// Components") — o motivo de nunca repetir isso aqui.
//
// O ÍNDICE DE BUSCA é memoizado por IDENTIDADE do objeto (`WeakMap`), nunca
// serializado: cada chamada de `buscarVocabularioImport` no servidor devolve um
// objeto novo, então o índice se reconstrói uma vez por leitura — nunca fica
// velho, e nunca atravessa a fronteira RSC (a `WeakMap` não é um dado, é cache).

import { Constants } from '@/lib/types/database'
import { PREFIXO_PATRIMONIO_FONTE } from '@/lib/patrimonio'
import { normalizarTexto } from './deparas'
import type { CategoriaImport, EstadoAlvoImport, EstadoPlanilha } from './tipos'

// ---------------------------------------------------------------------------
// O tipo serializável (Decisão 3 do PLAN-F56.md)
// ---------------------------------------------------------------------------

export type FilialVocabulario = { id: number; nome: string; ativa: boolean }
export type ApelidoVocabulario = { filialId: number; apelido: string }
export type TermoCategoriaVocabulario = {
  termo: string
  categoria: CategoriaImport
  rotulo: string | null
}
export type TermoEstadoVocabulario = {
  termo: string
  estado: EstadoPlanilha
  rotulo: string | null
}

export type VocabularioImport = {
  filiais: FilialVocabulario[]
  apelidos: ApelidoVocabulario[]
  categorias: TermoCategoriaVocabulario[]
  estados: TermoEstadoVocabulario[]
  prefixosPatrimonio: string[]
}

/**
 * A fatia que desce por PROP do Server Component (a página) para os três
 * consumidores de cliente (`grupos-erros.tsx`, `ops-grupo.ts`,
 * `importar-wizard.tsx`) — só o que eles precisam para EXIBIR (Select,
 * "Definir como", o painel do hostname). O servidor nunca julga com o
 * vocabulário que voltou do cliente (critério 6): as duas actions que rodam o
 * motor (`validarImport`/`baixarCsvCorrigido`) leem o `VocabularioImport`
 * INTEIRO do banco a cada chamada, nunca esta fatia.
 */
export type VocabularioCliente = {
  categorias: { categoria: CategoriaImport; rotulo: string }[]
  estados: { estado: EstadoAlvoImport; rotulo: string }[]
  prefixosPatrimonio: string[]
}

/** Erro próprio de `conferirVocabulario` — recusa ALTO, nunca segue com um
 *  vocabulário ambíguo ou incompleto. Mensagem em pt-BR. */
export class VocabularioImportInvalidoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VocabularioImportInvalidoError'
  }
}

// ---------------------------------------------------------------------------
// conferirVocabulario — o construtor confere de NOVO (Decisão 2): o banco é a
// garantia (índices únicos + o gatilho `vocabulario_unidades_guarda`, migration
// 0139), mas o código nunca confia cegamente no que voltou da leitura.
// ---------------------------------------------------------------------------

/** As categorias que o import PRECISA saber exibir — o enum do banco menos
 *  `outro` (o import nunca produz `outro`; o cadastro manual é que o usa). Lido
 *  de `Constants` (gerado, `src/lib/types/database.ts`), nunca redeclarado à
 *  mão — o mesmo espírito da Decisão 4/Frente B (`ExcluirDaUniao`). */
const CATEGORIAS_ENUM_IMPORTAVEIS = Constants.public.Enums.categoria_ativo.filter(
  (c): c is CategoriaImport => c !== 'outro',
)

/** Os estados-ALVO que o import pode produzir — o enum menos `descartado`
 *  (bloqueante, nunca vira `AtivoPlano`) e `devolvido_fornecedor` (baixa
 *  terminal que o import nunca tem como origem nem como alvo). */
const ESTADOS_ENUM_ALVO_IMPORTAVEIS = Constants.public.Enums.status_ativo.filter(
  (e): e is EstadoAlvoImport => e !== 'descartado' && e !== 'devolvido_fornecedor',
)

const PREFIXO_RE = new RegExp(`^${PREFIXO_PATRIMONIO_FONTE}$`)

/**
 * Confere os invariantes do vocabulário — LANÇA `VocabularioImportInvalidoError`
 * (mensagem em pt-BR) na primeira violação encontrada:
 *   · um termo (nome de filial ∪ apelido, pela chave `normalizarTexto`) aponta
 *     para duas filiais;
 *   · apelido de filial inexistente;
 *   · valor importável (toda `CategoriaImport`; todo `EstadoAlvoImport`) sem
 *     EXATAMENTE um rótulo;
 *   · rótulo que não volta ao próprio termo;
 *   · estado `descartado` com rótulo;
 *   · prefixo fora de `'^' + PREFIXO_PATRIMONIO_FONTE + '$'`;
 *   · termo repetido (dentro da própria tabela de categoria/estado).
 *
 * Chamada pela query só-servidor (`buscarVocabularioImport`) logo depois de ler
 * as cinco fontes — nunca confia cegamente no que voltou do banco, mesmo que o
 * banco já tenha os CHECKs e os índices únicos (Decisão 1/2 do PLAN-F56.md).
 */
export function conferirVocabulario(v: VocabularioImport): void {
  // --- unidades: nome ∪ apelido aponta para no máximo uma filial ------------
  const donoPorTermo = new Map<string, number>()
  const registrarTermo = (chave: string, filialId: number, origem: string): void => {
    if (chave === '') return
    const dono = donoPorTermo.get(chave)
    if (dono !== undefined && dono !== filialId) {
      throw new VocabularioImportInvalidoError(
        `O termo "${chave}" (${origem}) aponta para mais de uma filial (id ${dono} e id ${filialId}) — o vocabulário está ambíguo.`,
      )
    }
    donoPorTermo.set(chave, filialId)
  }
  const idsDeFiliais = new Set(v.filiais.map((f) => f.id))
  for (const f of v.filiais) registrarTermo(normalizarTexto(f.nome), f.id, 'nome próprio de filial')
  for (const a of v.apelidos) {
    if (!idsDeFiliais.has(a.filialId)) {
      throw new VocabularioImportInvalidoError(
        `O apelido "${a.apelido}" aponta para a filial id ${a.filialId}, que não existe no vocabulário.`,
      )
    }
    registrarTermo(normalizarTexto(a.apelido), a.filialId, 'apelido de unidade')
  }

  // --- categoria: termo único, rótulo volta ao termo, um rótulo por valor ---
  const termosCategoriaVistos = new Set<string>()
  for (const c of v.categorias) {
    if (termosCategoriaVistos.has(c.termo)) {
      throw new VocabularioImportInvalidoError(`O termo de categoria "${c.termo}" está repetido no vocabulário.`)
    }
    termosCategoriaVistos.add(c.termo)
    if (c.rotulo !== null && normalizarTexto(c.rotulo) !== c.termo) {
      throw new VocabularioImportInvalidoError(
        `O rótulo "${c.rotulo}" da categoria "${c.categoria}" não normaliza de volta ao termo "${c.termo}".`,
      )
    }
  }
  for (const categoria of CATEGORIAS_ENUM_IMPORTAVEIS) {
    const comRotulo = v.categorias.filter((c) => c.categoria === categoria && c.rotulo !== null)
    if (comRotulo.length !== 1) {
      throw new VocabularioImportInvalidoError(
        `A categoria "${categoria}" precisa de exatamente um termo com forma de exibição — achei ${comRotulo.length}.`,
      )
    }
  }

  // --- estado: idem, mais "descartado nunca tem rótulo" ----------------------
  const termosEstadoVistos = new Set<string>()
  for (const e of v.estados) {
    if (termosEstadoVistos.has(e.termo)) {
      throw new VocabularioImportInvalidoError(`O termo de estado "${e.termo}" está repetido no vocabulário.`)
    }
    termosEstadoVistos.add(e.termo)
    if (e.estado === 'descartado' && e.rotulo !== null) {
      throw new VocabularioImportInvalidoError(
        `O termo "${e.termo}" resolve para "descartado" e não pode ter forma de exibição ("${e.rotulo}").`,
      )
    }
    if (e.rotulo !== null && normalizarTexto(e.rotulo) !== e.termo) {
      throw new VocabularioImportInvalidoError(
        `O rótulo "${e.rotulo}" do estado "${e.estado}" não normaliza de volta ao termo "${e.termo}".`,
      )
    }
  }
  for (const estado of ESTADOS_ENUM_ALVO_IMPORTAVEIS) {
    const comRotulo = v.estados.filter((e) => e.estado === estado && e.rotulo !== null)
    if (comRotulo.length !== 1) {
      throw new VocabularioImportInvalidoError(
        `O estado "${estado}" precisa de exatamente um termo com forma de exibição — achei ${comRotulo.length}.`,
      )
    }
  }

  // --- prefixos: formato PREFIXO_PATRIMONIO_FONTE ---------------------------
  for (const p of v.prefixosPatrimonio) {
    if (!PREFIXO_RE.test(p)) {
      throw new VocabularioImportInvalidoError(
        `O prefixo de patrimônio "${p}" está fora do formato esperado (${PREFIXO_RE.source}).`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// O índice de busca — memoizado por IDENTIDADE do objeto, nunca serializado.
// ---------------------------------------------------------------------------

type CategoriaComRotulo = { categoria: CategoriaImport; rotulo: string }
type EstadoComRotulo = { estado: EstadoAlvoImport; rotulo: string }

type Indice = {
  porTermoUnidade: Map<string, number>
  porIdFilial: Map<number, FilialVocabulario>
  porTermoCategoria: Map<string, CategoriaImport>
  porTermoEstado: Map<string, EstadoPlanilha>
  termosCategoria: string[]
  termosEstadoCorrigiveis: string[]
  categoriasImportaveis: CategoriaComRotulo[]
  estadosImportaveis: EstadoComRotulo[]
}

const CACHE_INDICE = new WeakMap<VocabularioImport, Indice>()

function indice(v: VocabularioImport): Indice {
  const cache = CACHE_INDICE.get(v)
  if (cache) return cache

  const porTermoUnidade = new Map<string, number>()
  for (const f of v.filiais) porTermoUnidade.set(normalizarTexto(f.nome), f.id)
  for (const a of v.apelidos) porTermoUnidade.set(normalizarTexto(a.apelido), a.filialId)

  const porIdFilial = new Map<number, FilialVocabulario>(v.filiais.map((f) => [f.id, f]))
  const porTermoCategoria = new Map<string, CategoriaImport>(v.categorias.map((c) => [c.termo, c.categoria]))
  const porTermoEstado = new Map<string, EstadoPlanilha>(v.estados.map((e) => [e.termo, e.estado]))

  const termosCategoria = v.categorias.map((c) => c.termo)
  const termosEstadoCorrigiveis = v.estados.filter((e) => e.estado !== 'descartado').map((e) => e.termo)

  const categoriasImportaveis: CategoriaComRotulo[] = []
  for (const c of v.categorias) if (c.rotulo !== null) categoriasImportaveis.push({ categoria: c.categoria, rotulo: c.rotulo })

  const estadosImportaveis: EstadoComRotulo[] = []
  for (const e of v.estados) {
    if (e.rotulo === null) continue
    // `rotulo !== null` já provou (via conferirVocabulario) que `e.estado` não é
    // 'descartado' — o único estado sem forma de exibição no vocabulário —, então
    // o estreitamento para `EstadoAlvoImport` é seguro (mesmo padrão de
    // `plano.ts:245`, que estreita `EstadoPlanilha` para `EstadoAlvoImport` depois
    // de excluir 'descartado' em tempo de execução).
    estadosImportaveis.push({ estado: e.estado as EstadoAlvoImport, rotulo: e.rotulo })
  }

  const novo: Indice = {
    porTermoUnidade,
    porIdFilial,
    porTermoCategoria,
    porTermoEstado,
    termosCategoria,
    termosEstadoCorrigiveis,
    categoriasImportaveis,
    estadosImportaveis,
  }
  CACHE_INDICE.set(v, novo)
  return novo
}

// ---------------------------------------------------------------------------
// As funções que o motor usa — todas com o vocabulário por PARÂMETRO, no
// padrão `rotuloTipoItem(slug, mapa)` (F39).
// ---------------------------------------------------------------------------

/** Site do CSV → `filial_id` — considera TODAS as filiais (ativas e inativas:
 *  toda filial é unidade CONHECIDA, Decisão 2) pelo NOME PRÓPRIO (termo
 *  implícito — não é uma linha do vocabulário) e pelos APELIDOS cadastrados. */
export function mapearUnidade(raw: string | null | undefined, v: VocabularioImport): number | null {
  return indice(v).porTermoUnidade.get(normalizarTexto(raw ?? '')) ?? null
}

/** `filial_id` → o registro do vocabulário (nome + se está ativa), ou `null`
 *  quando o id não está no vocabulário. */
export function filialDoVocabulario(id: number, v: VocabularioImport): FilialVocabulario | null {
  return indice(v).porIdFilial.get(id) ?? null
}

/** Tipo da planilha → categoria; fora do vocabulário → `null` (bloqueante). */
export function mapearCategoria(raw: string | null | undefined, v: VocabularioImport): CategoriaImport | null {
  return indice(v).porTermoCategoria.get(normalizarTexto(raw ?? '')) ?? null
}

/** Estado corrente segundo a planilha — precedência Situação > Status (spec
 *  §5); fora do vocabulário → `null` (bloqueante `estado_desconhecido`). */
export function estadoPlanilha(
  status: string | null | undefined,
  situacao: string | null | undefined,
  v: VocabularioImport,
): EstadoPlanilha | null {
  const idx = indice(v)
  const sit = normalizarTexto(situacao ?? '')
  const sta = normalizarTexto(status ?? '')
  const efetivo = sit !== '' ? sit : sta
  if (efetivo === '') return null
  return idx.porTermoEstado.get(efetivo) ?? null
}

/** Termos de Tipo aceitos pelo vocabulário — candidatos da sugestão Levenshtein. */
export function termosCategoria(v: VocabularioImport): readonly string[] {
  return indice(v).termosCategoria
}

/** Termos de Situação/Status CORRIGÍVEIS — o vocabulário inteiro menos os que
 *  resolvem para `descartado` (corrigir `estado_descartado` é trocar o estado
 *  ou remover a linha, nunca "aceitar o descartado"). */
export function termosEstadoCorrigiveis(v: VocabularioImport): readonly string[] {
  return indice(v).termosEstadoCorrigiveis
}

/** As categorias que o import pode PRODUZIR, com a forma de exibição — a fonte
 *  do Select, do "Definir como" e do CSV corrigido. */
export function categoriasImportaveis(v: VocabularioImport): readonly CategoriaComRotulo[] {
  return indice(v).categoriasImportaveis
}

/** Os estados-alvo que o import pode PRODUZIR, com a forma de exibição. */
export function estadosImportaveis(v: VocabularioImport): readonly EstadoComRotulo[] {
  return indice(v).estadosImportaveis
}

/** Forma de exibição de uma categoria (ex.: `notebook` → "Notebook") — o que a
 *  tela grava na célula Tipo. Cai no próprio valor se, por algum defeito, o
 *  vocabulário não tiver a forma (nunca deveria — `conferirVocabulario` recusa
 *  antes disso chegar aqui). */
export function rotuloCategoria(categoria: CategoriaImport, v: VocabularioImport): string {
  return indice(v).categoriasImportaveis.find((c) => c.categoria === categoria)?.rotulo ?? categoria
}

/** Forma de exibição de um estado-alvo (ex.: `em_uso` → "Saída") — o que a tela
 *  grava na célula Situação. */
export function rotuloEstado(estado: EstadoAlvoImport, v: VocabularioImport): string {
  return indice(v).estadosImportaveis.find((e) => e.estado === estado)?.rotulo ?? estado
}

/** A fatia que desce por PROP ao cliente (Decisão 3) — nunca o vocabulário
 *  inteiro (que carrega `apelidos`/`filiais`, irrelevantes para exibição e
 *  desnecessários no bundle do cliente). */
export function paraCliente(v: VocabularioImport): VocabularioCliente {
  const idx = indice(v)
  return {
    categorias: idx.categoriasImportaveis,
    estados: idx.estadosImportaveis,
    prefixosPatrimonio: v.prefixosPatrimonio,
  }
}

// Motor de CORREÇÕES do import de startup (OS-F7B / W1). Módulo PURO: opera nas
// CÉLULAS cruas do CSV enviado, antes de `extrairRegistros`. Nada de banco/UI.
//
// Princípio (OS-F7B §1): correção NÃO é bypass. É transformação declarada dos
// dados de entrada, revalidada do zero por `validarCsvImport` a cada mudança — a
// régua da F7 não muda, muda só a forma de alimentá-la. O arquivo enviado é
// imutável: `arquivoHash` continua sendo o sha-256 do buffer ORIGINAL.
//
// As 9 regras da OS-F7B §3 vivem aqui:
//   1. aplicação determinística NA ORDEM DA LISTA, sobre as células;
//   2. patrimônio/service tag SEMPRE pontuais (o tipo `CorrecaoImport` já barra);
//   3. `substituir` em site só com site desconhecido e `para` = filial escolhida;
//   4. estado nunca resolve para `descartado`;
//   5. datas passam por `parseData` (fica no Zod do W3 — ver NOTA abaixo);
//   6. linha física 1-based (header = 1); escrita além do array preenche com '';
//   7. campo fora do layout → no-op com contagem 0 (NÃO é erro);
//   8. cap de 300 ops (Zod do W3);
//   9. correções não alcançam linhas descartadas (sem Site E sem patrimônio).
//
// NOTA (divisão de validação — contrato §1.5 do ultracode): o Zod do W3 faz o
// estrutural (shape da union, whitelist, cap 300, `para` não vazio, DATAS via
// `parseData`). O que depende de CSV/layout/filial fica aqui: op semanticamente
// inválida vira bloqueante `correcao_invalida` na reanálise — nunca silenciosa,
// nunca aplicada.

import {
  CATEGORIAS_TERMOS,
  ESTADOS_CORRIGIVEIS,
  estadoPlanilha,
  mapearCategoria,
  mapearUnidade,
  normalizarTexto,
} from './deparas'
import { decodificarCsv, mapaColunas, parseCsv, type CsvCru, type RegistroImport } from './parse'
import type {
  CampoEditavel,
  CorrecaoImport,
  ErroImport,
  GrupoErro,
} from './tipos'

// ---------------------------------------------------------------------------
// Mapa campo → coluna. ÚNICA fonte da verdade da correspondência entre os campos
// corrigíveis e os nomes de coluna normalizados. Espelha 1:1 o que
// `extrairRegistros` (parse.ts) lê em cada campo — se divergir, a correção
// escreveria numa célula e a validação leria outra. Testado.

export const COLUNA_POR_CAMPO: Record<CampoEditavel, string> = {
  site: 'site',
  tipo: 'tipo',
  patrimonio: 'patrimonio',
  serviceTag: 'service tag',
  situacao: 'situacao',
  colaborador: 'colaborador',
  dataInclusao: 'data de inclusao',
  dataEntrega: 'data de entrega',
}

/** Campo alvo da op (`substituir_estado` escreve em Situação; remoção não tem campo). */
export function campoDaOp(op: CorrecaoImport): CampoEditavel | null {
  switch (op.op) {
    case 'substituir':
      return op.campo
    case 'substituir_estado':
      return 'situacao'
    case 'editar':
      return op.campo
    case 'remover_linha':
      return null
  }
}

/** Descrição curta da op — vai no `valor` do bloqueante `correcao_invalida`. */
function descreverOp(op: CorrecaoImport): string {
  switch (op.op) {
    case 'substituir':
      return `${op.campo}: "${op.de}" → "${op.para}"`
    case 'substituir_estado':
      return `Status="${op.statusDe}" Situação="${op.situacaoDe}" → "${op.para}"`
    case 'editar':
      return `linha ${op.linha} · ${op.campo} → "${op.para}"`
    case 'remover_linha':
      return `linha ${op.linha}`
  }
}

// ---------------------------------------------------------------------------
// Validação semântica das ops (regras 3, 4 e 7 da §3).

/**
 * Regras que dependem do CSV/filial, SEM o layout (o layout é checado à parte
 * porque campo fora do layout é no-op, não erro — regra §3.7). `filialNome`
 * ausente = fachada `csvCorrigido`, que não conhece a filial: a metade "para = a
 * filial selecionada" da regra 3 não roda ali (a op já passou pelo preview, que
 * conhece a filial e teria virado bloqueante).
 */
function validarSemantica(op: CorrecaoImport, filialNome?: string): string | null {
  if (op.op === 'substituir') {
    // Defesa em profundidade: o tipo já barra patrimônio/service tag em massa
    // (regra §3.2), mas um chamador fora do TS (JSON da action) poderia tentar.
    const campo = op.campo as string
    if (campo === 'patrimonio' || campo === 'serviceTag') {
      return 'Patrimônio e service tag só podem ser corrigidos linha a linha — a troca em massa criaria pares duplicados.'
    }
    // Idem para data: em massa ela alcançaria linhas SEM aviso (Inclusão vazia +
    // Entrega válida não está no grupo) e mudaria a dataEntrada delas em silêncio.
    if (campo === 'dataInclusao' || campo === 'dataEntrega') {
      return 'Datas só podem ser corrigidas linha a linha — a troca em massa alcançaria linhas sem erro e mudaria a data de entrada delas.'
    }
  }

  // Regra do Site (decisão 4 do Johnny) — vale para QUALQUER op que escreva na
  // coluna Site, não só a de massa: pela via pontual (`editar`) o ativo de outra
  // filial entraria como acervo da filial do import, que é a transferência
  // mascarada que a decisão proíbe. A metade que depende da linha (o Site ATUAL
  // da célula) é checada em `aplicarCorrecoes`, que tem a linha em mãos.
  if (op.op === 'substituir' && op.campo === 'site') {
    const de = mapearUnidade(op.de)
    if (de !== null) {
      return `Site "${op.de}" já corresponde à filial ${de} — ativo de outra filial não entra por aqui (remova as linhas; transferência é operação do sistema).`
    }
  }
  const paraSite =
    (op.op === 'substituir' || op.op === 'editar') && op.campo === 'site' ? op.para : null
  if (paraSite !== null && filialNome !== undefined) {
    const alvo = mapearUnidade(filialNome)
    const para = mapearUnidade(paraSite)
    const casa = alvo === null ? paraSite.trim() === filialNome.trim() : para === alvo
    if (!casa) {
      return `O Site só pode ser corrigido para a filial selecionada (${filialNome}) — o import não transfere ativo entre filiais.`
    }
  }

  const paraSituacao =
    op.op === 'substituir_estado'
      ? op.para
      : op.op === 'editar' && op.campo === 'situacao'
        ? op.para
        : null
  if (paraSituacao !== null) {
    const estado = estadoPlanilha(null, paraSituacao)
    if (estado === null) {
      return `Situação "${paraSituacao}" não corresponde a nenhum estado do De→Para (spec §5).`
    }
    if (estado === 'descartado') {
      return `Situação "${paraSituacao}" resolve para descartado — ativo descartado não entra num CSV de startup; troque o estado ou remova as linhas.`
    }
  }

  return null
}

/**
 * Op válida? `null` = pode aplicar. String = motivo em pt-BR (regras §3.3–5 e 7).
 * A UI usa para desabilitar o que não vale; o motor usa a parte semântica para
 * gerar os bloqueantes `correcao_invalida` (a parte de layout é no-op, §3.7).
 */
export function validarCorrecao(
  op: CorrecaoImport,
  layoutCols: ReadonlySet<string>,
  filialNome: string,
): string | null {
  const semantica = validarSemantica(op, filialNome)
  if (semantica !== null) return semantica
  const campo = campoDaOp(op)
  if (campo !== null && !layoutCols.has(COLUNA_POR_CAMPO[campo])) {
    return `A coluna "${COLUNA_POR_CAMPO[campo]}" não existe no layout deste CSV — a correção não teria efeito.`
  }
  return null
}

// ---------------------------------------------------------------------------
// Aplicação das correções sobre as células.

type LinhaMutavel = { linha: number; celulas: string[] }

/** Escreve na célula; gap (linha curta tolerada pelo Papa) vira ''. Regra §3.6. */
function escrever(celulas: string[], i: number, valor: string): void {
  while (celulas.length <= i) celulas.push('')
  // Aparado: uma célula corrigida tem que ser indistinguível de uma célula
  // digitada na planilha (`parseCsv` apara todas as células de dados).
  celulas[i] = valor.trim()
}

function celula(l: LinhaMutavel, i: number | undefined): string {
  return i === undefined ? '' : (l.celulas[i] ?? '')
}

/**
 * Aplica as correções, EM ORDEM, sobre uma cópia das células. Nunca lança e nunca
 * muta a entrada: op que não casa, sobre linha removida, sobre linha descartada
 * ou com campo fora do layout é **no-op com contagem 0** (§3.1/§3.7/§3.9). Op
 * semanticamente inválida não é aplicada e vira `correcao_invalida` em `invalidas`.
 *
 * `filialNome` é opcional (fachada `csvCorrigido` não conhece a filial); o
 * `validarCsvImport` sempre passa.
 */
export function aplicarCorrecoes(
  csv: CsvCru,
  correcoes: CorrecaoImport[],
  mapa: Map<string, number>,
  filialNome?: string,
): { csv: CsvCru; porOp: number[]; linhasRemovidas: number; invalidas: ErroImport[] } {
  const linhas: LinhaMutavel[] = csv.linhas.map((l) => ({ linha: l.linha, celulas: [...l.celulas] }))
  const porNumero = new Map<number, LinhaMutavel>(linhas.map((l) => [l.linha, l]))
  const removidas = new Set<number>()
  const porOp: number[] = []
  const invalidas: ErroImport[] = []
  const layoutCols = new Set(mapa.keys())

  const iSite = mapa.get('site')
  const iPatrimonio = mapa.get('patrimonio')

  /** Regra §3.9 + §3.1: linha descartada (sem Site E sem patrimônio), linha 100%
   *  vazia e linha já removida ficam fora do alcance de qualquer correção. */
  const alcancavel = (l: LinhaMutavel): boolean => {
    if (removidas.has(l.linha)) return false
    return !(celula(l, iSite).trim() === '' && celula(l, iPatrimonio).trim() === '')
  }

  for (const op of correcoes) {
    const campo = campoDaOp(op)
    if (campo !== null && !layoutCols.has(COLUNA_POR_CAMPO[campo])) {
      porOp.push(0) // §3.7 — campo fora do layout não é erro, é no-op
      continue
    }
    const motivo = validarSemantica(op, filialNome)
    if (motivo !== null) {
      invalidas.push({
        linha: 0,
        coluna: campo ?? '—',
        valor: descreverOp(op),
        tipo: 'correcao_invalida',
        mensagem: motivo,
      })
      porOp.push(0)
      continue
    }

    switch (op.op) {
      case 'remover_linha': {
        const l = porNumero.get(op.linha)
        if (!l || !alcancavel(l)) {
          porOp.push(0)
          break
        }
        removidas.add(l.linha)
        porOp.push(1)
        break
      }
      case 'editar': {
        const l = porNumero.get(op.linha)
        const i = mapa.get(COLUNA_POR_CAMPO[op.campo])
        if (!l || i === undefined || !alcancavel(l)) {
          porOp.push(0)
          break
        }
        // Decisão 4 (metade que depende da linha): editar o Site de uma linha cujo
        // Site JÁ resolve para uma filial conhecida é transferência mascarada — o
        // ativo daquela filial entraria como acervo da filial do import. Só o Site
        // desconhecido (typo) é corrigível; o de outra filial só se remove.
        if (op.campo === 'site') {
          const atual = celula(l, i).trim()
          const unidade = mapearUnidade(atual)
          if (unidade !== null) {
            invalidas.push({
              linha: op.linha,
              coluna: COLUNA_POR_CAMPO.site,
              valor: descreverOp(op),
              tipo: 'correcao_invalida',
              mensagem: `Site "${atual}" já corresponde à filial ${unidade} — ativo de outra filial não entra por aqui (remova a linha; transferência é operação do sistema).`,
            })
            porOp.push(0)
            break
          }
        }
        escrever(l.celulas, i, op.para)
        porOp.push(1)
        break
      }
      case 'substituir': {
        const i = mapa.get(COLUNA_POR_CAMPO[op.campo])
        if (i === undefined) {
          porOp.push(0)
          break
        }
        const de = op.de.trim()
        let n = 0
        for (const l of linhas) {
          if (!alcancavel(l)) continue
          if (celula(l, i).trim() !== de) continue
          escrever(l.celulas, i, op.para)
          n++
        }
        porOp.push(n)
        break
      }
      case 'substituir_estado': {
        const iStatus = mapa.get('status')
        const iSituacao = mapa.get('situacao')
        if (iStatus === undefined || iSituacao === undefined) {
          porOp.push(0)
          break
        }
        const statusDe = op.statusDe.trim()
        const situacaoDe = op.situacaoDe.trim()
        let n = 0
        for (const l of linhas) {
          if (!alcancavel(l)) continue
          if (celula(l, iStatus).trim() !== statusDe) continue
          if (celula(l, iSituacao).trim() !== situacaoDe) continue
          escrever(l.celulas, iSituacao, op.para)
          n++
        }
        porOp.push(n)
        break
      }
    }
  }

  return {
    csv: { header: csv.header, linhas: linhas.filter((l) => !removidas.has(l.linha)) },
    porOp,
    linhasRemovidas: removidas.size,
    invalidas,
  }
}

// ---------------------------------------------------------------------------
// Serialização — o "Baixar CSV corrigido" é o artefato do que foi importado.

/** Aspas duplicadas + envelope quando a célula tem `;`, aspas ou quebra de linha. */
function escaparCelula(valor: string): string {
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

/**
 * Reserializa o CSV com o header ORIGINAL (ordem e grafia intactas), `;` como
 * delimitador, CRLF, aspas escapadas e SEM as linhas removidas. Sem BOM — quem
 * baixa põe o BOM (padrão do projeto).
 */
export function csvCorrigidoParaTexto(csv: CsvCru): string {
  const linhas = [csv.header, ...csv.linhas.map((l) => l.celulas)]
  return linhas.map((celulas) => celulas.map(escaparCelula).join(';')).join('\r\n')
}

/**
 * Fachada do contrato §1.5: decodificar → parseCsv → aplicarCorrecoes → reserializar.
 *
 * `filialNome` importa: sem ele, a metade "para = a filial selecionada" da regra
 * §3.3 não roda e o artefato baixado poderia conter uma transformação que o
 * preview RECUSOU (revisão adversarial da F7B, 17/07/2026). O CSV corrigido é o
 * artefato do que foi importado — tem de aplicar exatamente as mesmas ops que o
 * preview aplicou, nem uma a mais. A action sempre passa a filial.
 */
export function csvCorrigido(
  conteudo: ArrayBuffer | Uint8Array,
  correcoes: CorrecaoImport[],
  filialNome?: string,
): string {
  const { texto } = decodificarCsv(conteudo)
  const csv = parseCsv(texto)
  const { csv: corrigido } = aplicarCorrecoes(csv, correcoes, mapaColunas(csv.header), filialNome)
  return csvCorrigidoParaTexto(corrigido)
}

// ---------------------------------------------------------------------------
// Sugestões — Levenshtein PRÓPRIO (regra global: nenhuma dependência nova).

/** Distância de edição (inserção/remoção/substituição). Duas linhas rolantes. */
export function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      atual[j] = Math.min(atual[j - 1]! + 1, anterior[j]! + 1, anterior[j - 1]! + custo)
    }
    anterior = atual
  }
  return anterior[b.length]!
}

/**
 * Candidato mais próximo de `valor` — sugere só quando a distância é ≤ 2 E ≤ 40%
 * do comprimento do valor (typo, não palpite: "Notbook"→"notebook" sugere;
 * "Impressora" não). Empate → o primeiro candidato da lista (determinístico).
 * Sem sugestão → null (a UI mostra o Select sem pré-seleção).
 */
export function sugerirValor(valor: string, candidatos: readonly string[]): string | null {
  const v = normalizarTexto(valor)
  if (v === '') return null
  let melhor: string | null = null
  let melhorDist = Infinity
  for (const c of candidatos) {
    const d = distanciaLevenshtein(v, normalizarTexto(c))
    if (d < melhorDist) {
      melhorDist = d
      melhor = c
    }
  }
  if (melhor === null) return null
  return melhorDist <= 2 && melhorDist <= v.length * 0.4 ? melhor : null
}

// ---------------------------------------------------------------------------
// Agrupamento — erros idênticos viram UM card acionável na tela.

const SEP_ESTADO = '␟' // U+241F — não aparece em planilha; separa Status de Situação

/** Valor cru agrupador. Estado usa o PAR (a precedência Situação>Status importa). */
function chaveDoGrupo(
  erro: ErroImport,
  reg: RegistroImport | undefined,
  filialPorLinha: ReadonlyMap<number, string>,
): string {
  switch (erro.tipo) {
    case 'estado_desconhecido':
    case 'estado_descartado':
      return reg ? `${reg.status}${SEP_ESTADO}${reg.situacao}` : erro.valor
    // F7C — agrupa pela FILIAL onde o ativo já está cadastrado: é o que o operador
    // precisa ver ("3 ativos deste CSV já estão em Linhares"), e é o que decide a
    // ação (remover as N linhas daquela filial).
    case 'patrimonio_em_outra_filial':
      return filialPorLinha.get(erro.linha) ?? ''
    // A correção de data em massa grava em Data de Inclusão (OS-F7B §7) — o
    // agrupador é o valor cru DESSA célula, não a mensagem com as duas datas.
    case 'sem_data_entrada':
      return reg ? reg.dataInclusao : erro.valor
    // Sem correção possível e valor cru irrelevante → um card só para todas.
    case 'header_invalido':
    case 'linha_sem_chave':
    case 'plano_vazio':
      return ''
    default:
      return erro.valor
  }
}

function correcaoDoGrupo(tipo: string, chave: string, filialNome: string): GrupoErro['correcao'] {
  switch (tipo) {
    case 'site_divergente': {
      const alvo = mapearUnidade(filialNome)
      // Borda: a filial SELECIONADA não está no De→Para da spec §5 (ex.: uma
      // filial nova cadastrada em admin/filiais). `montarPlanoImport` compara
      // contra `filialAlvo` null, então TODO Site diverge e nenhuma correção de
      // Site fecha o erro. Oferecer "Definir como {filial}" seria um botão que o
      // operador clica para sempre (revisão adversarial da F7B, 17/07/2026): o
      // card vira informativo. O conserto é cadastrar a unidade no De→Para.
      if (alvo === null) return { kind: 'nenhuma' }
      const unidade = mapearUnidade(chave)
      // Site desconhecido (typo) → corrigível para a filial selecionada.
      // Site de OUTRA filial conhecida → só remover (decisão 4 do Johnny: forçar
      // a filial do import mascararia uma transferência).
      return unidade === null || unidade === alvo
        ? { kind: 'site_desconhecido' }
        : { kind: 'site_outra_filial' }
    }
    case 'categoria_desconhecida': {
      const termo = sugerirValor(chave, CATEGORIAS_TERMOS)
      return { kind: 'categoria', sugestao: termo === null ? null : mapearCategoria(termo) }
    }
    case 'estado_desconhecido':
    case 'estado_descartado': {
      const [statusDe = '', situacaoDe = ''] = chave.split(SEP_ESTADO)
      const efetivo = situacaoDe.trim() !== '' ? situacaoDe : statusDe
      const termo = sugerirValor(efetivo, ESTADOS_CORRIGIVEIS)
      return {
        kind: 'estado',
        statusDe,
        situacaoDe,
        sugestao: termo === null ? null : estadoPlanilha(null, termo),
      }
    }
    // F7C — o par já existe no banco, em outra filial: o Substituir tudo não apaga
    // o ativo de lá e o índice único (GLOBAL) recusaria o insert. Mudar de filial é
    // transferência — decisão 4: o import não faz. Única ação: remover a linha.
    case 'patrimonio_em_outra_filial':
      return { kind: 'existe_em_outra_filial', filial: chave }
    case 'patrimonio_invalido':
      return { kind: 'patrimonio' }
    case 'par_duplicado':
    case 'patrimonio_duplicado_sem_service_tag':
      return { kind: 'duplicata' }
    case 'sem_data_entrada':
      return { kind: 'data' }
    case 'estado_em_uso_sem_colaborador':
      return { kind: 'colaborador' }
    default:
      // header_invalido, linha_sem_chave, correcao_invalida, plano_vazio
      return { kind: 'nenhuma' }
  }
}

/**
 * Agrupa bloqueantes + avisos por tipo + valor cru e decide o que a tela oferece
 * em cada grupo. Ordem: do grupo mais numeroso para o menos (empate → primeira
 * linha, depois tipo — determinístico).
 */
export function agruparErros(
  bloqueantes: ErroImport[],
  avisos: ErroImport[],
  registros: RegistroImport[],
  filialNome: string,
  /** F7C — linha → filial onde o ativo daquela linha JÁ está cadastrado (só as
   *  linhas com `patrimonio_em_outra_filial`). Agrupa o card por filial dona. */
  filialPorLinha: ReadonlyMap<number, string> = new Map(),
): GrupoErro[] {
  const porLinha = new Map(registros.map((r) => [r.linha, r]))
  const acumulado = new Map<string, { tipo: string; chave: string; erros: ErroImport[] }>()

  for (const erro of [...bloqueantes, ...avisos]) {
    const chave = chaveDoGrupo(erro, porLinha.get(erro.linha), filialPorLinha)
    const id = `${erro.tipo}${SEP_ESTADO}${chave}`
    const grupo = acumulado.get(id)
    if (grupo) grupo.erros.push(erro)
    else acumulado.set(id, { tipo: erro.tipo, chave, erros: [erro] })
  }

  const grupos: GrupoErro[] = [...acumulado.values()].map(({ tipo, chave, erros }) => ({
    tipo,
    chave,
    linhas: [...new Set(erros.map((e) => e.linha))].sort((a, b) => a - b),
    erros,
    correcao: correcaoDoGrupo(tipo, chave, filialNome),
  }))

  return grupos.sort(
    (a, b) =>
      b.linhas.length - a.linhas.length ||
      (a.linhas[0] ?? 0) - (b.linhas[0] ?? 0) ||
      a.tipo.localeCompare(b.tipo) ||
      a.chave.localeCompare(b.chave),
  )
}

// F56 · Frente C — o orçamento de bytes da RESPOSTA do preview (Decisão 6, item 3
// do PLAN-F56.md). Um CSV em que TODA linha tem erro faz o corpo crescer
// proporcional a linhas × erros × cópias do valor cru (o mesmo erro aparece em
// `bloqueantes`/`avisos`, dentro do `grupo.erros` correspondente e no `contexto`
// da linha) — e nenhum teto de ENTRADA (arquivo/linhas/colunas/conteúdo,
// `limites.ts`) limita isso: um arquivo pequeno, no teto de conteúdo, ainda pode
// ter uma linha problemática em CADA uma das suas até 2.000 linhas.
//
// Quem fecha essa conta é este módulo, aplicado no FIM de `analisar()`
// (`plano.ts`), sobre a `ValidacaoImport` já pronta. Puro: recebe/devolve
// `ValidacaoImport`, nada de I/O, nada de banco.
//
// A régua (medição C2, `docs/f56-evidencias/C2-conta-dos-corpos.txt`): se o JSON
// da validação passa de `ORCAMENTO_RESPOSTA_PREVIEW`, reduz o DETALHE — erros
// INDIVIDUAIS em `bloqueantes`, `avisos` e `grupos[].erros`, agrupados por TIPO —
// em degraus `K ∈ [500, 200, 50, 10, 1]`, na ordem, parando no primeiro que cabe
// (ou no último degrau, `K=1`, mesmo que ainda passe do orçamento — NUNCA abaixo
// de 1 por tipo: zero itens de um tipo faria a tela parecer liberada para aquele
// tipo de erro, quando na verdade ele continua lá).
//
// O que fica INTOCADO em qualquer degrau:
//  - `grupos[].linhas` — TODAS as linhas do grupo, sempre: é com esta lista que o
//    operador vê o alcance real do problema, mesmo quando os `erros[]` individuais
//    foram cortados;
//  - `grupos[].chave` — a correção EM MASSA casa pela chave (`substituir`,
//    `substituir_estado`); abreviá-la quebraria a correção, não só a exibição;
//  - `candidatos` e `plano` — dado NECESSÁRIO à 2ª passada (conferência de outra
//    filial) e ao aplicar, nunca "detalhe de exibição" que o orçamento possa cortar.
//
// O que É reduzido, além do corte por tipo: `mensagem` de cada erro MANTIDO é
// abreviada (o eco do valor cru dentro dela é texto de exibição, nunca dado do
// plano) — só quando o orçamento realmente estourou, nunca no caminho comum.

import type { ErroImport, GrupoErro, ValidacaoImport } from './tipos'
import { ORCAMENTO_RESPOSTA_PREVIEW } from './limites'

export { ORCAMENTO_RESPOSTA_PREVIEW }

/** Degraus tentados NESTA ORDEM — nunca abaixo do último (1 por tipo). */
const DEGRAUS: readonly number[] = [500, 200, 50, 10, 1]

/** Tamanho de exibição da `mensagem` de um erro MANTIDO, só quando o orçamento
 *  estourou — o eco do valor cru dentro da mensagem é texto, não dado do plano. */
const TAMANHO_MENSAGEM_REDUZIDA = 300

function bytesJson(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), 'utf8')
}

function abreviarMensagem(msg: string): string {
  return msg.length > TAMANHO_MENSAGEM_REDUZIDA ? `${msg.slice(0, TAMANHO_MENSAGEM_REDUZIDA)}…` : msg
}

/** Mantém no máximo `k` erros POR TIPO (o resto só deixa de aparecer — a
 *  contagem total continua em `resumo.detalhe`), abreviando a mensagem dos
 *  mantidos. Ordem de tipo estável (`Map` preserva inserção); dentro do tipo, a
 *  ordem original (primeiras `k` linhas). */
function reduzirLista(lista: readonly ErroImport[], k: number): ErroImport[] {
  const porTipo = new Map<string, ErroImport[]>()
  for (const e of lista) {
    const arr = porTipo.get(e.tipo)
    if (arr) arr.push(e)
    else porTipo.set(e.tipo, [e])
  }
  const mantidos: ErroImport[] = []
  for (const arr of porTipo.values()) {
    for (const e of arr.slice(0, k)) mantidos.push({ ...e, mensagem: abreviarMensagem(e.mensagem) })
  }
  return mantidos
}

function construirCandidato(v: ValidacaoImport, k: number, totalBloqueantes: number, totalAvisos: number): ValidacaoImport {
  const bloqueantes = reduzirLista(v.bloqueantes, k)
  const avisos = reduzirLista(v.avisos, k)
  const grupos: GrupoErro[] = v.grupos.map((g) => ({
    ...g,
    // `linhas` e `chave` INTOCADOS de propósito — ver cabeçalho do módulo.
    erros: reduzirLista(g.erros, k),
  }))

  const linhasMantidas = new Set<number>()
  for (const e of bloqueantes) linhasMantidas.add(e.linha)
  for (const e of avisos) linhasMantidas.add(e.linha)
  for (const g of grupos) for (const e of g.erros) linhasMantidas.add(e.linha)

  const contexto: ValidacaoImport['contexto'] = {}
  for (const chave of Object.keys(v.contexto)) {
    const linha = Number(chave)
    if (linhasMantidas.has(linha)) contexto[linha] = v.contexto[linha]!
  }

  return {
    ...v,
    bloqueantes,
    avisos,
    grupos,
    contexto,
    resumo: { ...v.resumo, detalhe: { reduzido: true, totalBloqueantes, totalAvisos, mantidosPorTipo: k } },
  }
}

/**
 * Reduz `bloqueantes`/`avisos`/`grupos[].erros` até o JSON de `v` caber em
 * `ORCAMENTO_RESPOSTA_PREVIEW` bytes, ou até o piso de 1 erro por tipo (que
 * SEMPRE é devolvido, mesmo se ainda passar do orçamento). Quando `v` já cabe,
 * devolve `v` intacto (só com `resumo.detalhe.reduzido = false` preenchido — as
 * telas usam os totais daí no lugar de `bloqueantes.length`/`avisos.length`, que
 * no caminho comum são o mesmo número).
 */
export function aplicarOrcamentoResposta(v: ValidacaoImport): ValidacaoImport {
  const totalBloqueantes = v.bloqueantes.length
  const totalAvisos = v.avisos.length

  const semReducao: ValidacaoImport = {
    ...v,
    resumo: { ...v.resumo, detalhe: { reduzido: false, totalBloqueantes, totalAvisos, mantidosPorTipo: null } },
  }
  if (bytesJson(v) <= ORCAMENTO_RESPOSTA_PREVIEW) return semReducao

  let ultimo = semReducao
  for (const k of DEGRAUS) {
    const candidato = construirCandidato(v, k, totalBloqueantes, totalAvisos)
    ultimo = candidato
    if (k === 1) return candidato // piso — devolve mesmo se ainda passar do orçamento
    if (bytesJson(candidato) <= ORCAMENTO_RESPOSTA_PREVIEW) return candidato
  }
  return ultimo
}

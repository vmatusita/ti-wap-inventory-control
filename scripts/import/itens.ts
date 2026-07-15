// Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10.
//
// Carga dos SALDOS INICIAIS de itens por quantidade (F3B) — ordem F4 §3.2b.
// Fonte: export SEPARADO da planilha de gestão online (entregue na janela do
// go-live). Headers exatos são conferidos ao receber o arquivo: o parser exige
// colunas reconhecíveis de item + filial + saldo; header fora disso = arquivo
// trocado → aborta.

import { normalizarHeader, normalizarTexto, mapearUnidade } from './normalizar'
import type { CsvCru } from './parse'
import type { FilialOficial, Inconsistencia } from './tipos'

export type SaldoItem = {
  arquivo: string
  linha: number
  nomeItem: string
  filial: FilialOficial
  saldo: number
}

export type PlanoItens = {
  saldos: SaldoItem[]
  inconsistencias: Inconsistencia[]
}

const NOMES_ITEM = ['item', 'nome', 'nome do item', 'descricao', 'descrição']
const NOMES_FILIAL = ['filial', 'unidade', 'site']
const NOMES_SALDO = ['saldo', 'quantidade', 'qtd', 'estoque', 'no estoque', 'saldo atual']

function acharColuna(header: string[], candidatos: string[]): number | null {
  const normalizados = header.map(normalizarHeader)
  for (const c of candidatos) {
    const i = normalizados.indexOf(c)
    if (i !== -1) return i
  }
  return null
}

/**
 * Monta o plano de saldos iniciais a partir do export da gestão online.
 * `catalogo` = nomes existentes na tabela `itens` (comparação case-insensitive).
 * Nome fora do catálogo → `item_desconhecido` (bloqueante — decidir criar/mapear
 * no dry-run, ou rodar com --criar-itens-faltantes).
 */
export function montarPlanoItens(
  csv: CsvCru,
  catalogo: string[],
  criarFaltantes: boolean,
): PlanoItens {
  const colItem = acharColuna(csv.header, NOMES_ITEM)
  const colFilial = acharColuna(csv.header, NOMES_FILIAL)
  const colSaldo = acharColuna(csv.header, NOMES_SALDO)
  if (colItem === null || colFilial === null || colSaldo === null) {
    throw new Error(
      `${csv.arquivo}: header não tem colunas reconhecíveis de item/filial/saldo — arquivo trocado? ` +
        `Header lido: ${csv.header.filter((h) => h.trim() !== '').join(' | ')}`,
    )
  }

  const catalogoNorm = new Map(catalogo.map((n) => [normalizarTexto(n), n]))
  const inconsistencias: Inconsistencia[] = []
  const saldos: SaldoItem[] = []
  const vistos = new Set<string>()

  for (const { celulas, linha } of csv.linhas) {
    if (celulas.every((c) => c === '')) continue
    const nomeCru = (celulas[colItem] ?? '').trim()
    const filialCru = (celulas[colFilial] ?? '').trim()
    const saldoCru = (celulas[colSaldo] ?? '').trim()
    if (nomeCru === '') continue

    const filial = mapearUnidade(filialCru)
    if (!filial) {
      inconsistencias.push({
        severidade: 'bloqueante', tipo: 'unidade_desconhecida', arquivo: csv.arquivo, linha,
        valor: filialCru || '(vazio)', acaoProposta: 'mapear a filial para uma das 5 oficiais e reprocessar',
      })
      continue
    }

    const saldo = saldoCru === '' ? 0 : Number(saldoCru.replace(',', '.'))
    if (!Number.isInteger(saldo) || saldo < 0) {
      inconsistencias.push({
        severidade: 'bloqueante', tipo: 'saldo_invalido', arquivo: csv.arquivo, linha,
        valor: `${nomeCru}: "${saldoCru}"`, acaoProposta: 'saldo precisa ser inteiro ≥ 0 — corrigir no export e reprocessar',
      })
      continue
    }

    const nomeCatalogo = catalogoNorm.get(normalizarTexto(nomeCru))
    if (!nomeCatalogo && !criarFaltantes) {
      inconsistencias.push({
        severidade: 'bloqueante', tipo: 'item_desconhecido', arquivo: csv.arquivo, linha,
        valor: nomeCru,
        acaoProposta: 'nome fora do catálogo `itens` — criar no catálogo, mapear, ou rodar com --criar-itens-faltantes',
      })
      continue
    }

    if (saldo === 0) continue // só pares item × filial COM saldo geram lançamento

    const chave = `${normalizarTexto(nomeCru)}|${filial}`
    if (vistos.has(chave)) {
      inconsistencias.push({
        severidade: 'bloqueante', tipo: 'duplicata_exata', arquivo: csv.arquivo, linha,
        valor: `${nomeCru} × ${filial}`, acaoProposta: 'par item × filial repetido no export — consolidar no arquivo e reprocessar',
      })
      continue
    }
    vistos.add(chave)
    saldos.push({ arquivo: csv.arquivo, linha, nomeItem: nomeCatalogo ?? nomeCru, filial, saldo })
  }

  return { saldos, inconsistencias }
}

#!/usr/bin/env node
// A PROVA BARATA DA F44 — o número da linha JÁ segue o filtro de filial.
//
// Ferramenta de DEV, de leitura. Não toca banco, não lê `.env`, não roda no CI.
// Existe para uma coisa só: imprimir, com números na tela, que a tela de `/itens`
// não tem defeito de ARITMÉTICA — tem defeito de LEGENDA.
//
// Por que ela vem ANTES de qualquer desenho: o pedido do Johnny em 01/09/2026
// ("quando eu filtrar para filial que eu quero, aparecer direto na linha o total,
// em estoque, em uso e o que falta da filial que eu filtrei (…) e nao aparecer
// mais o total da ti") se lê, à primeira vista, como "os números estão errados".
// Se estivessem, a fase seria outra: mexeria em `saldoDoRecorte`. Este script
// roda o MESMO caminho que a tela roda — `montarLinhasDeItem` → `linha.saldo` — e
// compara célula a célula com `porFilial`. Se ele passar, o defeito é de frase, e
// a fase é de legenda e cor. Se falhar, o diagnóstico da ordem está errado e o
// primeiro defeito da fase é outro.
//
// ⚠ DADOS 100% FICTÍCIOS (regra 2 do CLAUDE.md): filiais inventadas, itens
// inventados. Nenhuma linha aqui sai da planilha da WAP.
//
// Uso: `npx tsx scripts/design/prova-recorte.ts`
import {
  emUsoDoSaldo,
  montarLinhasDeItem,
  type LinhaDeSaldoPorFilial,
  type NumerosDoItem,
} from '@/lib/itens/lista'
import { efetivar, recorteDe } from '@/lib/auth/recorte-leitura'
import { distribuicaoDoItem, resumoDaLista, rotulosCurtosDeFilial } from '@/lib/itens/distribuicao'
import { minimosDoCatalogo } from '@/lib/itens/repor'

// ---------------------------------------------------------------------------
// O cenário fictício — 3 filiais, 4 itens, com os casos de borda que importam
// ---------------------------------------------------------------------------

const FILIAIS = [
  { id: 1, nome: 'Aurora' },
  { id: 2, nome: 'Barra Nova' },
  { id: 3, nome: 'Corvo Branco' },
]

const n = (total: number, atrelados: number, falta: number, estoque: number): NumerosDoItem => ({
  total,
  estoque,
  atrelados,
  falta,
})

const LINHAS: LinhaDeSaldoPorFilial[] = [
  {
    item_id: 10,
    item: 'Mouse sem fio',
    grupo: 'acessorio',
    ordem: 1,
    porFilial: { 1: n(12, 0, 0, 7), 2: n(9, 0, 0, 2), 3: n(4, 0, 0, 4) },
    consolidado: n(25, 0, 0, 13),
  },
  {
    // Espalhado, com reservado numa filial só.
    item_id: 11,
    item: 'Teclado ABNT2',
    grupo: 'acessorio',
    ordem: 2,
    porFilial: { 1: n(6, 2, 0, 1), 2: n(3, 0, 0, 3), 3: n(0, 0, 0, 0) },
    consolidado: n(9, 2, 0, 4),
  },
  {
    // Só existe numa filial — e o consolidado é MAIOR que a soma das colunas
    // (uma filial desativada guarda 2 unidades). É o caso que `foraDasFiliais`
    // denuncia e o motivo de o consolidado não ser a soma.
    item_id: 12,
    item: 'Memória RAM 8GB',
    grupo: 'componente',
    ordem: 1,
    porFilial: { 1: n(0, 0, 0, 0), 2: n(5, 0, 0, 5), 3: n(0, 0, 0, 0) },
    consolidado: n(7, 0, 0, 7),
  },
  {
    // Déficit numa filial: `falta` sai de zero e tem de somar como as outras.
    item_id: 13,
    item: 'Cabo HDMI 2m',
    grupo: 'acessorio',
    ordem: 3,
    porFilial: { 1: n(2, 0, 1, 0), 2: n(1, 0, 0, 1), 3: n(0, 0, 0, 0) },
    consolidado: n(3, 0, 1, 1),
  },
]

// Mínimos fictícios do catálogo — alimentam o selo "repor" e o cartão "A repor".
const CATALOGO = [
  { id: 10, estoque_minimo: 5 },
  { id: 11, estoque_minimo: 5 },
  { id: 12, estoque_minimo: 3 },
  { id: 13, estoque_minimo: 2 },
]

// ---------------------------------------------------------------------------
// A prova
// ---------------------------------------------------------------------------

const CHAVES = ['total', 'estoque', 'atrelados', 'falta'] as const

let falhas = 0

function conferir(rotulo: string, ok: boolean, detalhe: string) {
  if (!ok) falhas += 1
  console.log(`${ok ? '  OK  ' : ' FALHA'} · ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
}

function montar(filialIds: number[]) {
  const visiveis = filialIds.length > 0 ? filialIds : FILIAIS.map((f) => f.id)
  return montarLinhasDeItem({
    linhas: LINHAS,
    // F57 — a prova descreve o recorte pela lista (vazia = sem recorte); `montarLinhasDeItem`
    // recebe a seleção já efetivada.
    unidades: efetivar(
      recorteDe(null),
      filialIds.length > 0
        ? { familia: 'id', modo: 'lista', ids: filialIds }
        : { familia: 'id', modo: 'todas' },
    ),
    filiaisVisiveis: visiveis,
    tiposPorItem: {},
  })
}

function tabela(titulo: string, filialIds: number[]) {
  const linhas = montar(filialIds)
  const escopo =
    filialIds.length === 0
      ? 'sem recorte'
      : filialIds.map((id) => FILIAIS.find((f) => f.id === id)?.nome ?? `#${id}`).join(' + ')
  console.log(`\n${titulo}  (filialIds = [${filialIds.join(', ')}] · ${escopo})`)
  console.log('  item                 total  estoque   em uso  reserv.  falta   fora')
  for (const l of linhas) {
    const s = l.saldo
    console.log(
      `  ${l.item.padEnd(20)}${String(s.total).padStart(5)}${String(s.estoque).padStart(9)}` +
        `${String(emUsoDoSaldo(s)).padStart(9)}${String(s.atrelados).padStart(9)}` +
        `${String(s.falta).padStart(7)}${String(l.foraDasFiliais).padStart(7)}`,
    )
  }
  return linhas
}

console.log('='.repeat(78))
console.log('F44 · PROVA BARATA — o número da linha de /itens já segue o filtro de filial')
console.log('='.repeat(78))
console.log('Caminho exercitado: montarLinhasDeItem() → linha.saldo — o MESMO que a tabela,')
console.log('a linha expansível, os cartões de resumo e o CSV de saldos consomem.')
console.log('Dados 100% fictícios (regra 2 do CLAUDE.md).')

tabela('[A] SEM RECORTE', [])
tabela('[B] UMA FILIAL — Aurora (id 1)', [1])
tabela('[C] DUAS FILIAIS — Aurora + Barra Nova (id 1, 2)', [1, 2])
tabela('[D] TRÊS FILIAIS — Aurora + Barra Nova + Corvo Branco (id 1, 2, 3)', [1, 2, 3])

console.log('\n' + '-'.repeat(78))
console.log('PROVA 1 · sem recorte, linha.saldo é o CONSOLIDADO da RPC (não a soma das colunas)')
console.log('-'.repeat(78))
for (const l of montar([])) {
  const origem = LINHAS.find((x) => x.item_id === l.item_id)!
  const igual = CHAVES.every((k) => l.saldo[k] === origem.consolidado[k])
  const somaColunas = FILIAIS.reduce((a, f) => a + (origem.porFilial[f.id]?.total ?? 0), 0)
  conferir(
    `${l.item}: saldo === consolidado`,
    igual,
    `total ${l.saldo.total} · soma das colunas ${somaColunas}${
      somaColunas !== l.saldo.total ? ' (diferem de propósito: filial desativada com saldo)' : ''
    }`,
  )
}

console.log('\n' + '-'.repeat(78))
console.log('PROVA 2 · com UMA filial, linha.saldo === porFilial[X] nos QUATRO números')
console.log('-'.repeat(78))
for (const filialId of FILIAIS.map((f) => f.id)) {
  for (const l of montar([filialId])) {
    const origem = LINHAS.find((x) => x.item_id === l.item_id)!
    const esperado = origem.porFilial[filialId] ?? { total: 0, estoque: 0, atrelados: 0, falta: 0 }
    const diferencas = CHAVES.filter((k) => l.saldo[k] !== esperado[k])
    conferir(
      `filial ${filialId} · ${l.item}`,
      diferencas.length === 0,
      diferencas.length === 0
        ? CHAVES.map((k) => `${k}=${l.saldo[k]}`).join(' ')
        : `divergem: ${diferencas.join(', ')}`,
    )
  }
}

console.log('\n' + '-'.repeat(78))
console.log('PROVA 3 · com DUAS filiais, linha.saldo é a soma CÉLULA A CÉLULA das marcadas')
console.log('-'.repeat(78))
for (const l of montar([1, 2])) {
  const origem = LINHAS.find((x) => x.item_id === l.item_id)!
  const a = origem.porFilial[1]!
  const b = origem.porFilial[2]!
  const diferencas = CHAVES.filter((k) => l.saldo[k] !== a[k] + b[k])
  conferir(
    l.item,
    diferencas.length === 0,
    CHAVES.map((k) => `${k}: ${a[k]}+${b[k]}=${l.saldo[k]}`).join(' · '),
  )
}

console.log('\n' + '-'.repeat(78))
console.log('PROVA 4 · "em uso" também recorta (é derivado dos quatro, não lido à parte)')
console.log('-'.repeat(78))
for (const l of montar([2])) {
  const origem = LINHAS.find((x) => x.item_id === l.item_id)!
  const esperado = emUsoDoSaldo(origem.porFilial[2]!)
  conferir(
    `Barra Nova · ${l.item}`,
    emUsoDoSaldo(l.saldo) === esperado,
    `em uso = ${emUsoDoSaldo(l.saldo)} (esperado ${esperado})`,
  )
}

console.log('\n' + '-'.repeat(78))
console.log('PROVA 5 · a MATRIZ (coluna por filial) e a LINHA EXPANSÍVEL saem da mesma conta')
console.log('-'.repeat(78))
{
  const rotulos = rotulosCurtosDeFilial(FILIAIS)
  for (const l of montar([1])) {
    const celulas = distribuicaoDoItem(l, [FILIAIS[0]], rotulos)
    const c = celulas[0]
    conferir(
      `Aurora · ${l.item}`,
      c.numeros.estoque === l.saldo.estoque,
      `coluna da matriz = ${c.numeros.estoque} · coluna "Em estoque" da linha = ${l.saldo.estoque}` +
        ' ← COM UMA FILIAL AS DUAS COLUNAS MOSTRAM O MESMO NÚMERO (ponto 4 do diagnóstico)',
    )
  }
}

console.log('\n' + '-'.repeat(78))
console.log('PROVA 6 · os CARTÕES de resumo somam o RECORTE… e o "A repor" NÃO (o defeito nº 3)')
console.log('-'.repeat(78))
{
  const minimos = minimosDoCatalogo(CATALOGO)
  for (const ids of [[], [1], [1, 2], [1, 2, 3]]) {
    const linhas = montar(ids)
    const r = resumoDaLista(linhas, minimos)
    const escopo = ids.length === 0 ? 'sem recorte' : `filiais [${ids.join(', ')}]`
    const somaManual = linhas.reduce((a, l) => a + l.saldo.estoque, 0)
    conferir(
      `${escopo}: cartão "Em estoque" soma o recorte`,
      r.estoque === somaManual,
      `cartão = ${r.estoque} · soma das linhas na tela = ${somaManual}`,
    )
    console.log(
      `         └─ "A repor" = ${r.aRepor} — contado sobre o CONSOLIDADO, ` +
        'não sobre o recorte (é o que a F44 revoga)',
    )
  }
}

console.log('\n' + '='.repeat(78))
if (falhas === 0) {
  console.log('RESULTADO: as 6 provas passaram. O NÚMERO ESTÁ CERTO — o defeito é de LEGENDA.')
  console.log('A F44 é sobre a frase que acompanha o número, a cor e a ordem de leitura.')
} else {
  console.log(`RESULTADO: ${falhas} prova(s) FALHARAM. O diagnóstico da ordem F44 está errado:`)
  console.log('o defeito é de ARITMÉTICA e vira o defeito número 1 da fase.')
}
console.log('='.repeat(78))

process.exit(falhas === 0 ? 0 : 1)

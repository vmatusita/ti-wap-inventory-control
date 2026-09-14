// OS DADOS DA PRÉVIA DE `/itens` — 100% FICTÍCIOS, e é isso que os torna legais
// (F43).
//
// A regra 2 do `CLAUDE.md` proíbe nome de colaborador real, patrimônio real ou
// linha das planilhas da WAP em seed, fixture, teste, comentário OU SCREENSHOT.
// `scripts/design/capturar.mjs` se recusa a fotografar produção justamente por
// isso, e este repositório não tem `.env.ensaio`. Então a prova visual da F43 se
// faz com o COMPONENTE REAL alimentado por ESTE catálogo — inventado aqui,
// determinístico, sem tocar banco nenhum.
//
// FILIAIS INVENTADAS. Nenhuma das cinco filiais reais da WAP aparece: os nomes
// abaixo são de cidades que não existem, para ninguém confundir a foto com a tela
// de produção nem por descuido.
//
// ⚠ DETERMINÍSTICO DE PROPÓSITO. Sem `Math.random()`: duas passadas do script
// produzem os MESMOS números, então o "antes" e o "depois" comparam o mesmo
// catálogo — que é a única forma de o teste dos 5 segundos medir o DESENHO em vez
// de medir dois sorteios diferentes.

import type { GrupoItem } from '@/lib/dominio'
import {
  montarLinhasDeItem,
  type LinhaDeItem,
  type LinhaDeSaldoPorFilial,
  type NumerosDoItem,
} from '@/lib/itens/lista'
import { efetivar, recorteDe } from '@/lib/auth/recorte-leitura'
import type { MinimosPorItem } from '@/lib/itens/repor'
import type { Filial } from '@/lib/queries/filiais'

/** As filiais visíveis da prévia — cinco, como em produção, com nomes inventados. */
export const FILIAIS_PREVIA: Filial[] = [
  { id: 1, nome: 'Aurora', slug: 'aurora', cidade: 'Vila Aurora' },
  { id: 2, nome: 'Bonança', slug: 'bonanca', cidade: 'Porto Bonança' },
  { id: 3, nome: 'Cerrado Alto', slug: 'cerrado-alto', cidade: 'Cerrado Alto' },
  { id: 4, nome: 'Dunas', slug: 'dunas', cidade: 'Dunas do Sul' },
  {
    id: 5,
    nome: 'Estância Velha do Norte',
    slug: 'estancia-velha-do-norte',
    cidade: 'Estância Velha do Norte',
  },
]

/**
 * A filial DESATIVADA que não aparece na lista e ainda tem saldo — é ela que faz
 * `foraDasFiliais` ser maior que zero em alguns itens, o caso que a tela precisa
 * saber denunciar.
 */
const FILIAL_FORA = 9

/** Gerador congruente linear — reprodutível, e sem `Math.random()`. */
function sorteador(semente: number) {
  let estado = semente >>> 0
  return (teto: number) => {
    estado = (estado * 1664525 + 1013904223) >>> 0
    return estado % teto
  }
}

type Molde = {
  nome: string
  grupo: GrupoItem
  tipo: string | null
  /** Mínimo do catálogo (`itens.estoque_minimo`) — 0 = nunca alerta. */
  minimo: number
  /** Em quantas filiais o item existe. `1` cobre o caso "só numa filial". */
  espalhamento: number
  /** Casos de borda que o desenho tem de aguentar. */
  caso?: 'zerado' | 'falta' | 'fora' | 'repor'
}

// 44 itens: mais que as 40 linhas que a ordem pede, para a paginação de 25 ter
// duas páginas cheias e o teste de "catálogo comprido" valer.
const MOLDES: Molde[] = [
  { nome: 'Mouse sem fio', grupo: 'acessorio', tipo: 'Mouse', minimo: 12, espalhamento: 5 },
  { nome: 'Teclado ABNT2', grupo: 'acessorio', tipo: 'Teclado', minimo: 10, espalhamento: 5 },
  { nome: 'Mousepad', grupo: 'acessorio', tipo: 'Mousepad', minimo: 8, espalhamento: 4 },
  { nome: 'Headset com microfone', grupo: 'acessorio', tipo: 'Fone', minimo: 6, espalhamento: 5, caso: 'repor' },
  { nome: 'Mochila para notebook', grupo: 'acessorio', tipo: 'Mochila', minimo: 5, espalhamento: 3 },
  { nome: 'Carregador de notebook 65 W', grupo: 'acessorio', tipo: 'Carregador', minimo: 8, espalhamento: 5, caso: 'fora' },
  { nome: 'Cabo HDMI 2 m', grupo: 'acessorio', tipo: 'Cabo', minimo: 10, espalhamento: 4 },
  { nome: 'Cabo de rede Cat6 3 m', grupo: 'acessorio', tipo: 'Cabo', minimo: 15, espalhamento: 5 },
  { nome: 'Adaptador USB-C para HDMI', grupo: 'acessorio', tipo: 'Cabo', minimo: 4, espalhamento: 2, caso: 'repor' },
  { nome: 'Suporte ergonômico para notebook', grupo: 'acessorio', tipo: null, minimo: 3, espalhamento: 2 },
  { nome: 'Hub USB de 4 portas', grupo: 'acessorio', tipo: null, minimo: 4, espalhamento: 3 },
  { nome: 'Webcam Full HD', grupo: 'acessorio', tipo: null, minimo: 3, espalhamento: 5, caso: 'falta' },
  { nome: 'Apresentador sem fio', grupo: 'acessorio', tipo: null, minimo: 2, espalhamento: 1 },
  { nome: 'Fone de ouvido intra-auricular', grupo: 'acessorio', tipo: 'Fone', minimo: 6, espalhamento: 4 },
  { nome: 'Capa protetora para tablet', grupo: 'acessorio', tipo: null, minimo: 2, espalhamento: 1, caso: 'zerado' },
  { nome: 'Caneta stylus', grupo: 'acessorio', tipo: null, minimo: 0, espalhamento: 2 },
  { nome: 'Base refrigerada para notebook', grupo: 'acessorio', tipo: null, minimo: 2, espalhamento: 2 },
  { nome: 'Filtro de privacidade 14"', grupo: 'acessorio', tipo: null, minimo: 3, espalhamento: 3, caso: 'repor' },
  { nome: 'Cabo de energia tripolar', grupo: 'acessorio', tipo: 'Cabo', minimo: 12, espalhamento: 5 },
  { nome: 'Régua de tomadas 5 saídas', grupo: 'acessorio', tipo: null, minimo: 6, espalhamento: 4 },
  { nome: 'Leitor de código de barras', grupo: 'acessorio', tipo: null, minimo: 1, espalhamento: 2 },
  {
    nome: 'Suporte articulado de parede para monitor de 27 polegadas com regulagem de altura',
    grupo: 'acessorio',
    tipo: null,
    minimo: 2,
    espalhamento: 3,
  },
  { nome: 'Adaptador de tomada padrão antigo', grupo: 'acessorio', tipo: null, minimo: 0, espalhamento: 2, caso: 'zerado' },
  { nome: 'Bolsa de transporte para projetor', grupo: 'acessorio', tipo: null, minimo: 1, espalhamento: 1 },

  { nome: 'Memória RAM 8 GB DDR4', grupo: 'componente', tipo: null, minimo: 10, espalhamento: 5 },
  { nome: 'Memória RAM 16 GB DDR4', grupo: 'componente', tipo: null, minimo: 8, espalhamento: 4, caso: 'repor' },
  { nome: 'SSD 480 GB SATA', grupo: 'componente', tipo: null, minimo: 8, espalhamento: 5, caso: 'fora' },
  { nome: 'SSD 1 TB NVMe', grupo: 'componente', tipo: null, minimo: 5, espalhamento: 3 },
  { nome: 'HD 1 TB SATA', grupo: 'componente', tipo: null, minimo: 4, espalhamento: 2 },
  { nome: 'Fonte ATX 500 W', grupo: 'componente', tipo: null, minimo: 4, espalhamento: 3 },
  { nome: 'Cooler para processador', grupo: 'componente', tipo: null, minimo: 3, espalhamento: 3 },
  { nome: 'Placa de rede PCIe', grupo: 'componente', tipo: null, minimo: 2, espalhamento: 2 },
  { nome: 'Placa de vídeo de entrada', grupo: 'componente', tipo: null, minimo: 1, espalhamento: 1 },
  { nome: 'Bateria para notebook', grupo: 'componente', tipo: null, minimo: 4, espalhamento: 4, caso: 'falta' },
  { nome: 'Teclado interno de reposição', grupo: 'componente', tipo: null, minimo: 3, espalhamento: 2 },
  { nome: 'Tela LCD 15,6"', grupo: 'componente', tipo: null, minimo: 2, espalhamento: 3 },
  { nome: 'Dobradiça de tampa', grupo: 'componente', tipo: null, minimo: 2, espalhamento: 2, caso: 'zerado' },
  { nome: 'Pasta térmica', grupo: 'componente', tipo: null, minimo: 5, espalhamento: 4 },
  { nome: 'Pilha alcalina AA (cartela)', grupo: 'componente', tipo: null, minimo: 20, espalhamento: 5 },
  { nome: 'Toner compatível preto', grupo: 'componente', tipo: null, minimo: 6, espalhamento: 4, caso: 'repor' },
  { nome: 'Cilindro de impressora', grupo: 'componente', tipo: null, minimo: 2, espalhamento: 2 },
  { nome: 'Rolo de etiqueta térmica', grupo: 'componente', tipo: null, minimo: 10, espalhamento: 3 },
  { nome: 'Cabo flat de impressora', grupo: 'componente', tipo: null, minimo: 2, espalhamento: 1 },
  { nome: 'Ventoinha de gabinete', grupo: 'componente', tipo: null, minimo: 3, espalhamento: 3 },
]

const ZERO: NumerosDoItem = { total: 0, estoque: 0, atrelados: 0, falta: 0 }

function somar(a: NumerosDoItem, b: NumerosDoItem): NumerosDoItem {
  return {
    total: a.total + b.total,
    estoque: a.estoque + b.estoque,
    atrelados: a.atrelados + b.atrelados,
    falta: a.falta + b.falta,
  }
}

/**
 * O catálogo fictício em estado BRUTO — `porFilial` + `consolidado` de cada item,
 * exatamente o que `getSaldosPorFilial` devolveria do banco.
 *
 * Cobre, de propósito, os casos que o desenho tem de aguentar: item em UMA filial
 * só, item espalhado nas cinco, item zerado, item abaixo do mínimo ("repor"),
 * item com déficit ("faltam N"), item com saldo em filial fora da lista
 * (`foraDasFiliais > 0`) e um nome comprido que precisa truncar.
 *
 * ⚠ F44 — ESTA FUNÇÃO PAROU NO SALDO BRUTO DE PROPÓSITO, e quem aplica o recorte
 * é `montarLinhasDeItem`, a função REAL da tela (ver `linhasDaPrevia`). Antes, a
 * prévia montava `saldo: consolidado` à mão — o que fotografava corretamente a
 * tela SEM filtro e tornava impossível fotografar a tela COM filtro, que é
 * justamente o caso em que a legenda mente. Uma prévia que reimplementa a
 * aritmética da tela fotografa a reimplementação.
 */
function saldosDaPrevia(): LinhaDeSaldoPorFilial[] {
  const sortear = sorteador(20260901)
  return MOLDES.map((molde, i) => {
    const item_id = 100 + i
    const porFilial: Record<number, NumerosDoItem> = {}

    // Quais filiais este item ocupa: sempre as `espalhamento` primeiras a partir
    // de um deslocamento fixo por item — assim a distribuição varia entre linhas
    // sem depender de sorteio.
    const inicio = i % FILIAIS_PREVIA.length
    for (let k = 0; k < molde.espalhamento; k += 1) {
      const filial = FILIAIS_PREVIA[(inicio + k) % FILIAIS_PREVIA.length]
      if (molde.caso === 'zerado') {
        porFilial[filial.id] = { ...ZERO }
        continue
      }
      const total = 2 + sortear(molde.minimo > 0 ? molde.minimo + 9 : 12)
      const emUso = sortear(total + 1)
      porFilial[filial.id] = {
        total,
        estoque: total - emUso,
        atrelados: 0,
        falta: 0,
      }
    }

    // Um item com déficit: a primeira filial fica com mais gente usando do que o
    // total registrado — é o "faltam N" da coluna Falta.
    if (molde.caso === 'falta') {
      const primeira = FILIAIS_PREVIA[inicio].id
      porFilial[primeira] = { total: 4, estoque: 0, atrelados: 0, falta: 2 }
    }

    // Saldo numa filial que a lista não mostra (desativada) — `foraDasFiliais`.
    if (molde.caso === 'fora') {
      porFilial[FILIAL_FORA] = { total: 5, estoque: 3, atrelados: 0, falta: 0 }
    }

    let consolidado = { ...ZERO }
    for (const numeros of Object.values(porFilial)) consolidado = somar(consolidado, numeros)

    // "repor": o consolidado tem de ficar ABAIXO do mínimo do catálogo. Puxa-se o
    // estoque para baixo mexendo só no que está na prateleira — o que saiu para
    // as pessoas continua fora dela.
    if (molde.caso === 'repor' && consolidado.estoque >= molde.minimo) {
      const alvo = Math.max(0, molde.minimo - 2)
      let excedente = consolidado.estoque - alvo
      for (const chave of Object.keys(porFilial)) {
        if (excedente <= 0) break
        const id = Number(chave)
        const corte = Math.min(excedente, porFilial[id].estoque)
        porFilial[id] = {
          ...porFilial[id],
          estoque: porFilial[id].estoque - corte,
          total: porFilial[id].total - corte,
        }
        excedente -= corte
      }
      consolidado = { ...ZERO }
      for (const numeros of Object.values(porFilial)) consolidado = somar(consolidado, numeros)
    }

    return {
      item_id,
      item: molde.nome,
      grupo: molde.grupo,
      ordem: i,
      consolidado,
      porFilial,
    }
  })
}

/** `itens.id` → o rótulo do tipo, no formato que `montarLinhasDeItem` recebe. */
function tiposDaPrevia(): Readonly<Record<number, string | null>> {
  const mapa: Record<number, string | null> = {}
  MOLDES.forEach((molde, i) => {
    mapa[100 + i] = molde.tipo
  })
  return mapa
}

/**
 * As linhas prontas para a tabela, JÁ RECORTADAS pelo filtro de filial — pela
 * MESMA função que `src/app/(app)/itens/page.tsx` chama.
 *
 * `filialIds` vazio = sem recorte (a tela mostra o consolidado). Com ids, a tela
 * mostra a soma célula a célula das marcadas, e `filiaisVisiveis` são as colunas
 * que a matriz desenha — exatamente a regra da `page.tsx`.
 */
export function linhasDaPrevia(filialIds: readonly number[] = []): LinhaDeItem[] {
  const visiveis =
    filialIds.length > 0
      ? FILIAIS_PREVIA.filter((f) => filialIds.includes(f.id)).map((f) => f.id)
      : FILIAIS_PREVIA.map((f) => f.id)
  return montarLinhasDeItem({
    linhas: saldosDaPrevia(),
    // F57 — a prévia descreve o recorte pela LISTA do cenário (a vazia é "sem filtro de filial");
    // `montarLinhasDeItem` recebe a seleção já efetivada, com o `todas` por nome.
    unidades: efetivar(
      recorteDe(null),
      filialIds.length > 0
        ? { familia: 'id', modo: 'lista', ids: filialIds }
        : { familia: 'id', modo: 'todas' },
    ),
    filiaisVisiveis: visiveis,
    tiposPorItem: tiposDaPrevia(),
  })
}

/** `itens.id` → `estoque_minimo`, no formato que `BadgeRepor` consulta. */
export function minimosDaPrevia(): MinimosPorItem {
  const mapa: Record<number, number> = {}
  MOLDES.forEach((molde, i) => {
    mapa[100 + i] = molde.minimo
  })
  return mapa
}

/** O catálogo no formato que os dois diálogos e o combobox esperam. */
export function catalogoDaPrevia(): {
  id: number
  nome: string
  grupo: GrupoItem
  estoque_minimo: number
  tipo_id: number | null
}[] {
  return MOLDES.map((molde, i) => ({
    id: 100 + i,
    nome: molde.nome,
    grupo: molde.grupo,
    estoque_minimo: molde.minimo,
    tipo_id: molde.tipo ? 1 : null,
  }))
}

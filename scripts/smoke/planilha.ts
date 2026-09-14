// PLANILHAS FICTÍCIAS para o smoke do import (F56 · Frente G) — layout de 20
// colunas (`COLS_PADRAO20` = `COLS_MATRIZ` + `grade` + `glpi`,
// src/lib/import/parse.ts:81-93 — as COLUNAS são copiadas aqui, NUNCA o
// identificador de layout `'padrao20'`: a Frente H pode renomeá-lo pela Decisão 12
// sem que este arquivo precise mudar).
//
// TERMOS DO VOCABULÁRIO: os valores de Tipo/Situação usados abaixo são os que a
// migration `0139` já semeou — não são invenção deste script (Tipo:
// notebook/desktop/monitor/celular/tablet; Situação: os 17 termos de
// `import_termos_estado`). Os 18 termos históricos da coluna Site (5 nomes de
// filial + 13 apelidos) são COPIADOS do `insert into unidades_apelidos` da própria
// `0139` (não recalculados aqui) — se a migration mudar o seed, este mapa muda
// junto, e é por isso que ele vive num arquivo versionado, não numa constante
// espalhada.
//
// PATRIMÔNIO FICTÍCIO: prefixo `NOO` (um dos 7 oficiais, `import_prefixos_patrimonio`)
// + um bloco numérico na faixa 9.000.000-9.999.999 — improvável de colidir com
// patrimônio real de produção OU de um go-live anterior do ensaio, mas CONFERIDO
// mesmo assim (`conferirPatrimoniosLivres`, só contagem) contra `ativos` de TODAS
// as filiais do ensaio antes de fechar a planilha, como a ordem exige.
//
// NONCE: uma célula de OBSERVAÇÃO carrega um nonce por execução+passe, para o
// `arquivo_hash` (migration 0132, idempotência de 24h) nunca repetir entre o passe
// 1 e o passe 2 da MESMA execução (fato 39a) — e entre execuções diferentes no
// mesmo dia.

import { randomBytes } from 'node:crypto'
// Tipo da sessão usada só para a conferência de colisão de patrimônio —
// DELIBERADAMENTE `any`. Ver o comentário longo em `scripts/smoke/fixtures-passe2.ts`
// (mesma decisão, mesma medição de incompatibilidade entre `SupabaseClient` e
// `ReturnType<typeof createClient>` nesta versão do pacote).
type Sessao = any // eslint-disable-line @typescript-eslint/no-explicit-any

/** As 20 colunas do layout `padrao20`, na ORDEM exata de `COLS_PADRAO20`
 *  (src/lib/import/parse.ts:81-93) — cópia por valor, não import: este script
 *  fica FORA de `src/**`, e importar módulo do app dentro de um script `tsx`
 *  solto reintroduziria o problema de `'use server'`/`server-only` que os outros
 *  módulos deste diretório documentam evitar. */
export const CABECALHO_PADRAO20 = [
  'site', 'marca', 'tipo', 'modelo', 'fornecedor', 'service tag', 'patrimonio',
  'memoria', 'armazenamento', 'processador', 'hostname', 'data de entrega',
  'status', 'situacao', 'data de inclusao', 'colaborador', 'termo de ativos',
  'observacao', 'grade', 'glpi',
] as const

/** Os 18 termos históricos da coluna Site, por filial — 5 nomes próprios + 13
 *  apelidos, copiados do `insert into unidades_apelidos`/o seed das filiais na
 *  `0139`. Usados SÓ no passe 3 (preview), nunca no passe 1/2 (que usam `sede`). */
export const TERMOS_HISTORICOS_POR_FILIAL: Record<string, string[]> = {
  matriz: ['Matriz', 'matriz sao marcos'],
  'cd-afonso-pena': [
    'CD Afonso Pena', 'cd-afp', 'cd afp', 'cd-pena', 'cd pena', 'cd-afonso pena', 'cd-afonsopena', 'afonso pena',
  ],
  linhares: ['Linhares', 'filial - linhares', 'filial linhares'],
  serra: ['Serra', 'serra park'],
  eusebio: ['Eusébio', 'filial-ce', 'filial ce'],
}

function hoje(): string {
  const d = new Date()
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getFullYear()}`
}

/** Nonce curto por execução+passe — entra na célula de observação para o
 *  `arquivo_hash` nunca repetir (idempotência de 24h, migration 0132). */
export function gerarNonce(): string {
  return randomBytes(6).toString('hex')
}

/** `NOO` + 7 dígitos na faixa 9.000.000-9.999.999 — formato canônico
 *  (`PREFIXO_PATRIMONIO_FONTE` + `DIGITOS_PATRIMONIO`, src/lib/patrimonio.ts). */
export function gerarPatrimonioFicticio(indice: number): string {
  const numero = 9_000_000 + indice
  if (numero > 9_999_999) throw new Error('Faixa fictícia de patrimônio esgotada (índice grande demais).')
  return `NOO${numero}`
}

/** Escapa uma célula para o CSV `;`-separado do motor (parse.ts): aspas quando o
 *  valor contém `;`, `"` ou quebra de linha — PapaParse aceita RFC 4180 padrão. */
function celula(v: string): string {
  if (/[;"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function linhaCsv(valores: readonly string[]): string {
  return valores.map(celula).join(';')
}

// ---------------------------------------------------------------------------
// Passe 1 / passe 2 — a filial `sede`
// ---------------------------------------------------------------------------

export type LinhaSede = {
  site: string
  patrimonio: string
  situacao: 'estoque' | 'saida'
  colaborador?: string
}

/**
 * Monta o CSV da `sede`: metade dos ativos em `Estoque` (fica `em_estoque` — a
 * base para a SAÍDA fictícia do passe 2) e metade em `Saída` (fica `em_uso`, com
 * `colaborador` preenchido — a base para a DEVOLUÇÃO fictícia do passe 2). A
 * coluna Site MISTURA o nome próprio ("Sede") e o `apelido` recebido por
 * parâmetro (cadastrado pela tela nova de apelidos, Frente E) — é assim que o
 * apelido entra na prova do smoke, como a ordem exige.
 */
export function gerarCsvSede(args: {
  apelido: string
  quantidade: number
  offsetPatrimonio: number
  nonce: string
}): { csv: string; linhas: LinhaSede[] } {
  const { apelido, quantidade, offsetPatrimonio, nonce } = args
  if (quantidade < 2) throw new Error('A planilha da sede precisa de ao menos 2 linhas (1 estoque + 1 saída).')

  const linhas: LinhaSede[] = []
  for (let i = 0; i < quantidade; i++) {
    const site = i % 2 === 0 ? 'Sede' : apelido
    const patrimonio = gerarPatrimonioFicticio(offsetPatrimonio + i)
    // Metade em Estoque, metade em Saída (em_uso) — nunca 100% de um só, para o
    // passe 2 sempre ter as duas bases que precisa.
    if (i % 2 === 0) {
      linhas.push({ site, patrimonio, situacao: 'estoque' })
    } else {
      linhas.push({ site, patrimonio, situacao: 'saida', colaborador: `Fulano ${i}` })
    }
  }

  const corpo = linhas.map((l, i) => {
    const valores: Record<(typeof CABECALHO_PADRAO20)[number], string> = {
      site: l.site,
      marca: 'Marca Fictícia',
      tipo: 'Notebook',
      modelo: 'Modelo Smoke',
      fornecedor: '',
      'service tag': `SMK${String(offsetPatrimonio + i).padStart(6, '0')}`,
      patrimonio: l.patrimonio,
      memoria: '8GB',
      armazenamento: '256GB SSD',
      processador: 'i5',
      hostname: `NB-SMOKE-${String(offsetPatrimonio + i).padStart(4, '0')}`,
      'data de entrega': '',
      status: '',
      situacao: l.situacao === 'estoque' ? 'Estoque' : 'Saída',
      'data de inclusao': hoje(),
      colaborador: l.colaborador ?? '',
      'termo de ativos': '',
      observacao: `Smoke F56 (fictício) · nonce=${nonce} · linha=${i}`,
      grade: '',
      glpi: '',
    }
    return linhaCsv(CABECALHO_PADRAO20.map((c) => valores[c]))
  })

  const csv = [linhaCsv(CABECALHO_PADRAO20), ...corpo].join('\n') + '\n'
  return { csv, linhas }
}

// ---------------------------------------------------------------------------
// Passe 3 — as cinco filiais WAP, só preview
// ---------------------------------------------------------------------------

/**
 * Uma planilha POR FILIAL, com uma linha para CADA termo histórico dela (nome
 * próprio + apelidos) — nunca aplicada (só `validarImport`, o preview): o passe 3
 * prova que nenhum apelido histórico regrediu para `site_divergente`.
 */
export function gerarCsvFilialWap(args: {
  slugFilial: string
  offsetPatrimonio: number
  nonce: string
}): { csv: string; termos: string[]; patrimonios: string[] } {
  const termos = TERMOS_HISTORICOS_POR_FILIAL[args.slugFilial]
  if (!termos) throw new Error(`Filial "${args.slugFilial}" não tem termos históricos mapeados.`)

  // Devolvidos por FORA do CSV (não é preciso reler/reparsear a planilha) para
  // `conferirPatrimoniosLivres` poder conferir o passe 3 antes de escrever o
  // arquivo — o mesmo tratamento que os passes 1/2 já dão a `gerarCsvSede`.
  const patrimonios: string[] = []

  const corpo = termos.map((termo, i) => {
    const patrimonio = gerarPatrimonioFicticio(args.offsetPatrimonio + i)
    patrimonios.push(patrimonio)
    const valores: Record<(typeof CABECALHO_PADRAO20)[number], string> = {
      site: termo,
      marca: 'Marca Fictícia',
      tipo: 'Notebook',
      modelo: 'Modelo Smoke',
      fornecedor: '',
      'service tag': `SMK3${String(args.offsetPatrimonio + i).padStart(5, '0')}`,
      patrimonio,
      memoria: '8GB',
      armazenamento: '256GB SSD',
      processador: 'i5',
      hostname: `NB-SMOKE-P3-${i}`,
      'data de entrega': '',
      status: '',
      situacao: 'Estoque',
      'data de inclusao': hoje(),
      colaborador: '',
      'termo de ativos': '',
      observacao: `Smoke F56 (fictício, PREVIEW só) · nonce=${args.nonce} · site=${termo}`,
      grade: '',
      glpi: '',
    }
    return linhaCsv(CABECALHO_PADRAO20.map((c) => valores[c]))
  })

  const csv = [linhaCsv(CABECALHO_PADRAO20), ...corpo].join('\n') + '\n'
  return { csv, termos, patrimonios }
}

// ---------------------------------------------------------------------------
// A conferência de colisão — nunca confiar só na faixa improvável
// ---------------------------------------------------------------------------

/**
 * Confere, por SELECT de contagem (nunca lendo linha de negócio), se algum dos
 * patrimônios fictícios já existe em QUALQUER filial do ensaio — a régua do fato
 * 39c/CLAUDE.md ("patrimônio repete em casos raros"; o smoke não pode ser o caso
 * raro). Devolve os que colidem — vazio quando a planilha está livre para uso.
 */
export async function conferirPatrimoniosLivres(
  sessao: Sessao,
  patrimonios: readonly string[],
): Promise<string[]> {
  const { data, error } = await sessao.from('ativos').select('patrimonio').in('patrimonio', patrimonios)
  if (error) throw new Error(`Falha ao conferir colisão de patrimônio: ${error.message}`)
  const linhas: { patrimonio: string | null }[] = data ?? []
  return linhas.map((r) => r.patrimonio).filter((p): p is string => !!p)
}

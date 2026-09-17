import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { coletarLiterais } from '@/lib/varredura/literais'

// A TRAVA `sem-wapismo` (F56 · Decisão 12 do PLAN-F56.md).
//
// NASCE VERMELHA de propósito, no começo da Frente D — ela TEM de acusar
// `src/lib/import/tipos.ts` (a união literal `FilialOficial`) e
// `src/lib/import/deparas.ts` (`UNIDADES`, `ESTADOS`, `PREFIXOS_PATRIMONIO`…). A
// saída vermelha desta primeira execução foi guardada em
// `docs/f56-evidencias/D1-sem-wapismo-vermelha.txt`. Ela só fica VERDE depois que a
// segunda metade da Frente D apagar essas constantes e passar o vocabulário por
// parâmetro (molde `rotuloTipoItem(slug, mapa)`, F39) — não é trabalho desta metade.
//
// O QUE ELA VARRE: só LITERAIS — `StringLiteral`, `NoSubstitutionTemplateLiteral`,
// `TemplateHead`/`TemplateMiddle`/`TemplateTail` e `JsxText` (que também cobre texto
// de atributo JSX, já que um atributo `placeholder="Ex.: Linhares"` sem chaves É um
// `StringLiteral` no AST) — NUNCA comentário (o compilador já não os expõe como nó) e
// NUNCA identificador (`const matriz = …`, `celulasDaMatriz`, a chave NUA
// `matriz: COLS_MATRIZ` de um objeto — nenhum dos três é literal de string).
//
// DOIS ESCOPOS, com padrões diferentes:
//   AMPLO (`src/**`)         — os CINCO nomes de filial, sem caixa, fronteira de
//                              palavra: Matriz, Afonso Pena, Linhares, Serra,
//                              Eusébio/Eusebio.
//   IMPORT (`lib/import/**` e `components/admin/importar/**`) — o AMPLO, MAIS: a
//                              palavra WAP, os 13 apelidos históricos, "rt wap",
//                              "posse wap" e os 7 prefixos como TOKEN MAIÚSCULO.
//
// F56 · Frente D (segunda metade) — os identificadores de LAYOUT do CSV deixaram
// de ser 'matriz'/'cd'/'padrao20' (o nome da planilha) e viraram 'colunas18'/
// 'colunas16'/'colunas20' (a CONTAGEM de colunas — Decisão 12 do PLAN-F56.md:
// "o layout são as colunas"): a régua e a allowlist que existiam para eles
// (LAYOUT_MATRIZ_OU_CD, três linhas nomeadas em tipos.ts/parse.ts/plano.ts)
// SAÍRAM — não sobrou nenhum literal de layout que colida com o vocabulário
// de filial para permitir.
//
// ALLOWLIST NOMINAL (arquivo + trecho, nunca por categoria): o histórico de
// `src/lib/versoes/registry.ts`, toda a ajuda (`src/lib/ajuda/conteudo/**` — decisão
// consciente do plano) e um punhado de placeholders nomeados abaixo, cada um com
// o motivo.

const RAIZ = process.cwd()
const DIR_SRC = join(RAIZ, 'src')

function paraPosix(caminho: string): string {
  return caminho.split('\\').join('/')
}

function listarArquivosTs(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    const st = statSync(caminho)
    if (st.isDirectory()) {
      achados.push(...listarArquivosTs(caminho))
      continue
    }
    if (!/\.(ts|tsx)$/.test(nome)) continue
    if (/\.test\.(ts|tsx)$/.test(nome)) continue
    achados.push(caminho)
  }
  return achados
}

// A varredura por AST mora em `src/lib/varredura/literais.ts` desde a F61 — a trava
// dos pontos de injeção (`src/lib/identidade/sem-literais.test.ts`) faz a MESMA
// pergunta, e duas cópias de um parser divergem em silêncio.

// -----------------------------------------------------------------------------
// Padrões
// -----------------------------------------------------------------------------

/** Os cinco nomes de filial — sem caixa, fronteira de palavra. */
const NOMES_FILIAL = /\b(matriz|afonso\s+pena|linhares|serra|eus[eé]bio)\b/i

const PALAVRA_WAP = /\bwap\b/i
const RT_WAP = /\brt\s+wap\b/i
const POSSE_WAP = /\bposse\s+wap\b/i

/** Os 13 apelidos históricos do seed da 0139 (deparas.ts:UNIDADES de hoje, menos os
 *  5 nomes próprios — Decisão 2). Comparados por INCLUSÃO, sem caixa. */
const APELIDOS_13 = [
  'matriz sao marcos',
  'cd-afp',
  'cd afp',
  'cd-pena',
  'cd pena',
  'cd-afonso pena',
  'cd-afonsopena',
  'afonso pena',
  'filial-ce',
  'filial ce',
  'serra park',
  'filial - linhares',
  'filial linhares',
]

/** Os 7 prefixos, como TOKEN MAIÚSCULO (case-SENSITIVE — é assim que aparecem no
 *  código: hostname/patrimônio em maiúsculas; o vocabulário mora no banco desde
 *  a F56 · Frente D, migration 0139). */
const PREFIXOS_TOKEN = /\b(WAP|PRO|LEA|TEC|STF|PAT|NOO)\b/

function violaEscopoAmplo(texto: string): boolean {
  return NOMES_FILIAL.test(texto)
}

function violaEscopoImport(texto: string): boolean {
  if (violaEscopoAmplo(texto)) return true
  if (PALAVRA_WAP.test(texto)) return true
  if (RT_WAP.test(texto) || POSSE_WAP.test(texto)) return true
  if (PREFIXOS_TOKEN.test(texto)) return true
  const chave = texto.trim().toLowerCase()
  if (APELIDOS_13.includes(chave)) return true
  return false
}

// -----------------------------------------------------------------------------
// Allowlist NOMINAL — arquivo + linha, com o motivo. NADA por categoria/prefixo.
// -----------------------------------------------------------------------------

/** Arquivo/diretório INTEIRO isento (prefixo do caminho relativo, estilo POSIX). */
const ARQUIVOS_ISENTOS: readonly string[] = [
  // Histórico de versões — cada entrada é a fase em que o texto foi escrito;
  // reescrever o passado para tirar "Linhares"/"Matriz" apagaria o que aconteceu.
  'src/lib/versoes/registry.ts',
  // A ajuda do operador cita as filiais o tempo todo, de propósito — é decisão
  // consciente do plano (Decisão 12), não um vazamento a consertar.
  'src/lib/ajuda/conteudo/',
  // F56 · Frente D (segunda metade) — módulo de SUPORTE A TESTE (não é ele
  // próprio um `.test.ts` — importado por vários — mas nada de `src/app/**`
  // ou de produção o importa): lê e REPLICA o texto do seed histórico da
  // migration 0139/0007/0026 para provar, em `vocabulario-sql.test.ts` e
  // `vocabulario.test.ts`, que o seed real bate com os 18 termos históricos.
  // A função que trata o rename idempotente da 0026 (`serra-park` → `serra`)
  // TEM de citar os dois slugs por nome para replicar o que aquela migration
  // faz — não há vocabulário nenhum a receber por parâmetro aqui, porque este
  // módulo SÓ EXISTE para verificar um vocabulário específico e histórico.
  'src/lib/import/leitor-seed-vocabulario.ts',
]

/** `arquivo:linha` → motivo. Nominal: a linha exata, nunca o arquivo inteiro. */
const LINHAS_PERMITIDAS: Record<string, string> = {
  // Exemplo de nome no diálogo de cadastro de filial — texto de UI genérico
  // ("como preencher"), não regra de negócio hardcoded; o campo aceita QUALQUER
  // nome de filial, o texto só ilustra o formato.
  //
  // F56 (Frente E, em paralelo) reestruturou filial-dialog.tsx (seção de
  // apelidos) e deslocou estas três linhas de 123/149/152 para 170/196/199 —
  // mesmo texto, posição nova; e acrescentou o campo de apelido em
  // filial-apelidos.tsx (novo), com um placeholder do mesmo tipo.
  // F56 (revisão adversarial final) — a guarda `if (!filial) return` em
  // `removerApelido` desceu as três uma linha: 170/196/199 → 171/197/200. Mesmo texto.
  // F61 — `useDialogoSemeado` (o diálogo semeia na abertura) desceu as três onze linhas:
  // 171/197/200 → 182/208/211. Mesmo texto.
  'src/components/admin/filial-dialog.tsx:182': 'exemplo de slug no texto de ajuda do diálogo',
  'src/components/admin/filial-dialog.tsx:208': 'placeholder de exemplo do campo Cidade',
  'src/components/admin/filial-dialog.tsx:211': 'exemplo de assinatura de termo no texto de ajuda',
  'src/components/admin/filial-apelidos.tsx:109': 'placeholder de exemplo do campo "novo apelido"',
  'src/components/admin/criar-senha-dialog.tsx:204': 'placeholder de exemplo do campo Rótulo',
}

function permitido(arquivoRel: string, linha: number): boolean {
  if (ARQUIVOS_ISENTOS.some((prefixo) => arquivoRel.startsWith(prefixo))) return true
  return `${arquivoRel}:${linha}` in LINHAS_PERMITIDAS
}

// -----------------------------------------------------------------------------
// A varredura
// -----------------------------------------------------------------------------

type Violacao = { arquivo: string; linha: number; texto: string }

function varrer(): Violacao[] {
  const violacoes: Violacao[] = []
  for (const caminhoAbsoluto of listarArquivosTs(DIR_SRC)) {
    const arquivoRel = paraPosix(relative(RAIZ, caminhoAbsoluto))
    const ehEscopoImport =
      arquivoRel.startsWith('src/lib/import/') ||
      arquivoRel.startsWith('src/components/admin/importar/')
    const violaFn = ehEscopoImport ? violaEscopoImport : violaEscopoAmplo

    for (const { linha, texto } of coletarLiterais(caminhoAbsoluto)) {
      if (!violaFn(texto)) continue
      if (permitido(arquivoRel, linha)) continue
      violacoes.push({ arquivo: arquivoRel, linha, texto })
    }
  }
  return violacoes.sort((a, b) => (a.arquivo === b.arquivo ? a.linha - b.linha : a.arquivo < b.arquivo ? -1 : 1))
}

describe('sem-wapismo: nenhuma palavra da WAP em literal de código-fonte (F56 · Decisão 12)', () => {
  it('a varredura encontra arquivos .ts/.tsx para examinar (guarda do próprio teste)', () => {
    expect(listarArquivosTs(DIR_SRC).length).toBeGreaterThan(100)
  })

  it(
    'nenhum literal viola o vocabulário — allowlist só nominal (arquivo:linha), nunca por categoria',
    () => {
      const violacoes = varrer()
      if (violacoes.length > 0) {
        const relatorio = violacoes
          .map((v) => `  ${v.arquivo}:${v.linha} — ${JSON.stringify(v.texto)}`)
          .join('\n')
        expect(violacoes, `${violacoes.length} literal(is) com vocabulário da WAP fora da allowlist:\n${relatorio}`).toEqual(
          [],
        )
      }
      expect(violacoes).toEqual([])
    },
    // Timeout explícito (F56 · Frente D2, 14/09/2026), no molde de
    // fronteira-rsc.test.ts:162-167: `varrer()` compila TODO `src/**` com o
    // compilador TypeScript (centenas de arquivos, sem cache — ela varre
    // literal por arquivo, não import por import), e sozinha já mede ~22s
    // nesta mesa; sob a carga da suíte inteira ela passa dos 5s padrão do
    // Vitest e o teste falha por timeout, não pelo que ele varre (o mesmo
    // arquivo, rodado isolado, é verde em ~4s — nota do coordenador em
    // 14/09). Não é afrouxamento da trava: nem o padrão varrido (`violaFn`),
    // nem a allowlist mudam aqui — só o relógio do runner. Folga generosa
    // (~3x o pior tempo já medido) para o projeto crescer sem reabrir isto.
    60_000,
  )
})

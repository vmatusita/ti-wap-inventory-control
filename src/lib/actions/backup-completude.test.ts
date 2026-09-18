import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { limpar } from '@/lib/use-server-exports'

// =============================================================================
// A TRAVA DA F54 — quem apaga artefato de Storage COPIA antes, e a classe inteira
// está classificada.
// =============================================================================
// POR QUE ELA EXISTE
//
// A tela do reset diz, com todas as letras: "NADA foi apagado — reset sem backup é
// proibido" (`dev-destrutivo.ts`). A frase era FALSA para uma classe inteira de dado.
// O backup do import, o do reset e o do conflito fazem `select('*')` das LINHAS; os
// `.docx` dos termos de responsabilidade — os documentos que uma pessoa ASSINOU —
// eram apagados do bucket `termos` logo depois, e nenhum dos três backups os levava.
// Restaurar devolvia `termos_gerados` apontando para objetos que não existiam mais.
//
// Esta suíte transforma "copiamos antes de apagar" de intenção em invariante
// conferida a cada `npm run test`, SEM BANCO e SEM STORAGE. Ela lê o FONTE.
//
// ⚠ ELA PEGA A CLASSE, NÃO AS TRÊS AÇÕES DA FASE. A régua é "apagar artefato de
// Storage", e o universo é TODA chamada `.from('<bucket>').remove(` do `src/`. Cada
// uma tem de estar classificada aqui — ou como `copia-antes` (o artefato é a única
// cópia de algo, então some só depois de copiado), ou como `dispensado` com o motivo
// ESCRITO. Chamada nova sem classificação reprova. É deliberadamente o molde de
// `superficie-admin.test.ts` (F49): declarar o universo é o que faz a trava crescer
// junto com o sistema, em vez de envelhecer no dia seguinte.
//
// ⚠ POR QUE `dispensado` NÃO É "EXCEÇÃO". A ordem de serviço avisa que exceção em
// trava nova é a porta por onde a próxima entra, e ela tem razão. A diferença é que
// aqui `dispensado` não afrouxa a régua: ele CLASSIFICA um caso que não é da classe.
// Apagar um backup que não cobre exclusão nenhuma, ou apagar um `.docx` que acabou de
// subir e cuja linha nunca chegou a existir, não é "apagar sem copiar" — é apagar algo
// que não é a única cópia de nada. O que a trava proíbe é a classificação SILENCIOSA:
// os dois campos são obrigatórios, e a frase tem de ser uma frase.
//
// ⚠ A ASSERÇÃO É SOBRE A CADEIA, NÃO SOBRE A PALAVRA "copiar". Uma trava que só
// procurasse a existência de uma chamada de cópia no arquivo passaria verde com a
// cópia cobrindo OUTRO conjunto de caminhos — o defeito realista depois de um
// refactor. Por isso ela confere três elos, e o do meio é o que tem dentes:
//   1. a cópia aparece ANTES do `remove(` no arquivo;
//   2. o argumento do `remove(` DESCENDE da lista que a cópia CONFIRMOU
//      (`listaConfirmada`), e não da lista de ENTRADA (`listaDeEntrada`);
//   3. e explicitamente NÃO é a lista de entrada — trocar uma pela outra é uma
//      edição de uma palavra, e apagaria o `.docx` que não foi copiado.
//
// ⚠ ELA NÃO SABE EXECUTAR O PROGRAMA, e não finge saber. "A cópia falhou, então não
// removeu" é comportamento, e quem responde por isso é
// `copiar-antes-de-remover.test.ts`. Esta aqui responde por outra pergunta, e é a que
// não tem quem responda: "o repositório continua descrevendo uma porta só, e ela
// continua removendo só o que confirmou?".
// =============================================================================

const RAIZ_SRC = join(process.cwd(), 'src')

/**
 * A remoção de objeto de Storage, na forma exata em que o código a escreve. O grupo 1 é o
 * bucket; o argumento NÃO entra na regex de propósito — ver `argumentoDe`.
 */
const RE_REMOVE = /\.from\(\s*'([a-z-]+)'\s*\)\s*\.remove\(/g

/**
 * TODA chamada `.remove(` sobre um `.from(...)`, com o bucket em literal **ou em
 * variável**.
 *
 * ⚠ ELA EXISTE PORQUE A DE CIMA TEM UM PONTO CEGO, e a revisão adversarial o
 * demonstrou: `const bucket = BUCKET_TERMOS; await client.storage.from(bucket).remove(x)`
 * passava VERDE, apesar de o cabeçalho desta suíte afirmar que o universo é "TODA
 * chamada". Uma trava que declara um universo maior do que consegue enxergar é pior que
 * uma que declara o universo certo: ela dá a sensação de cobertura que não tem.
 *
 * A régua nova: o bucket em VARIÁVEL é proibido nos caminhos que apagam artefato — não
 * porque seja feio, mas porque torna o universo inauditável por leitura do fonte. Quem
 * precisar de bucket dinâmico terá de mudar esta trava junto, de propósito.
 */
const RE_REMOVE_QUALQUER = /\.from\(\s*[^)]*\)\s*\.remove\(/g

/**
 * O texto do argumento do `remove(`, lido por BALANCEAMENTO DE PARÊNTESES a partir do
 * `(` de abertura.
 *
 * ⚠ Uma regex não serve aqui, e o custo de descobrir isso tarde seria a trava mentindo.
 * A primeira versão desta suíte usava `\(\s*([^\n]*?)\s*\)` e, no primeiro `npm run test`,
 * leu `remove(orfaos.map((o) => o.arquivo_path))` como o argumento `orfaos.map((o` — o
 * casamento não-guloso para no PRIMEIRO `)`, que ali é o da arrow function. Uma chave
 * truncada é pior que uma chave errada: ela ainda casa com a declaração se a declaração
 * também estiver truncada, e as duas envelhecem juntas sem ninguém notar.
 */
function argumentoDe(fonte: string, aberturaDoRemove: number): string | null {
  let nivel = 0
  for (let i = aberturaDoRemove; i < fonte.length; i++) {
    const c = fonte[i]
    if (c === '(') nivel++
    else if (c === ')') {
      nivel--
      if (nivel === 0) return fonte.slice(aberturaDoRemove + 1, i).replace(/\s+/g, ' ').trim()
    }
  }
  return null
}

/**
 * A cópia obrigatória. É UMA função só, em `src/lib/storage/copiar-antes-de-remover.ts`,
 * e o nome dela é o que esta trava procura — no molde da "porta só" da F51.
 */
const NOME_COPIA = 'copiarArtefatosParaBackup'

type Classificacao =
  | {
      tipo: 'copia-antes'
      motivo: string
      /**
       * O identificador que guarda a lista do que a cópia CONFIRMOU, e do qual o argumento
       * do `remove(` tem de descender. É este campo que dá dentes à trava: sem ele, ela só
       * saberia dizer que a palavra "copiar" aparece no arquivo.
       */
      listaConfirmada: string
      /** A lista de ENTRADA — a que o `remove(` NÃO pode usar, porque inclui o que falhou. */
      listaDeEntrada: string
    }
  | { tipo: 'dispensado'; motivo: string }

/**
 * O universo classificado, arquivo:argumento por arquivo:argumento.
 *
 * A chave é `<caminho relativo>::<texto do argumento>` — o argumento entra na chave de
 * propósito: dois `remove(` no mesmo arquivo sobre conjuntos diferentes são dois fatos
 * diferentes, e colapsá-los num só esconderia exatamente o caso que a fase existe para
 * pegar.
 */
const CLASSIFICADOS: Record<string, Classificacao> = {
  // --- A classe protegida: o `.docx` é a única cópia de um documento assinado. ---
  'src/lib/storage/copiar-antes-de-remover.ts::loteRemocao': {
    tipo: 'copia-antes',
    motivo:
      'A PORTA ÚNICA. Os quatro fluxos destrutivos que apagam `.docx` do bucket `termos` (import, reset, apagar ativo e conflito entre filiais) passam todos por aqui, e é aqui que a cópia acontece antes da remoção. Concentrar a remoção num ponto só é o que permite a esta trava ser uma asserção sobre estrutura, e não um grep espalhado por quatro arquivos que envelhecem em ritmos diferentes.',
    listaConfirmada: 'copiados',
    listaDeEntrada: 'caminhos',
  },

  // --- Os dispensados: não são a única cópia de nada. ---
  'src/lib/storage/copiar-antes-de-remover.ts::[caminho]': {
    tipo: 'dispensado',
    motivo:
      'Apaga o BACKUP que a própria operação acabou de subir, no ramo em que a RPC RECUSOU a exclusão — nada foi apagado, então esse backup não cobre exclusão nenhuma e é sobra, não prova. Copiá-lo seria guardar cópia de um arquivo que existe só por um instante e que o `descartarBackupNaoUsado` existe para não deixar no bucket (o órfão sob prefixo válido é material de replay).',
  },
  'src/lib/actions/termos.ts::arquivos': {
    tipo: 'dispensado',
    motivo:
      'Apaga a VARIANTE SUPERADA do mesmo termo — o sistema mantém uma versão por conjunto de movimentações, e regerar o termo (trocar monitor interno por home office, por exemplo) descarta a anterior. Desde 18/09/2026 a lista é só a das linhas de `termos_gerados` que o DELETE de fato removeu (`.select(\'id\')`), nunca a de entrada: um DELETE barrado pela RLS não leva o arquivo junto. ⚠ ACHADO DA F54, REGISTRADO E NÃO CORRIGIDO AQUI: este é o único caminho em que um `.docx` que JÁ pertenceu ao acervo some sem cópia. Guardá-lo exige decidir por quanto tempo, e retenção é decisão de produto explicitamente fora do escopo desta fase (ver docs/RELATORIO-F54.md, backlog).',
  },
  'src/lib/actions/termos.ts::[arquivoPath]': {
    tipo: 'dispensado',
    motivo:
      'COMPENSA um insert que falhou: o `.docx` subiu segundos antes, nesta mesma função, e a linha de `termos_gerados` não chegou a existir (corrida no índice único tipo+movimentações). O objeto nunca entrou no acervo, ninguém o assinou e nada aponta para ele — removê-lo é desfazer o próprio passo, não apagar documento.',
  },
}

/** Arquivos que a varredura ignora: os próprios testes. */
function ehTeste(caminho: string): boolean {
  return /\.test\.tsx?$/.test(caminho)
}

let cacheArquivos: string[] | null = null

function varrer(dir: string): string[] {
  if (dir === RAIZ_SRC && cacheArquivos) return cacheArquivos
  const saida: string[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) saida.push(...varrer(p))
    else if (/\.tsx?$/.test(ent.name) && !ehTeste(ent.name)) saida.push(p)
  }
  if (dir === RAIZ_SRC) cacheArquivos = saida
  return saida
}

type Sitio = {
  /** caminho relativo com barras normais, para casar com as chaves declaradas */
  arquivo: string
  bucket: string
  /** o texto do argumento do `remove(`, normalizado */
  argumento: string
  chave: string
  /** o fonte já sem comentários (strings preservadas: o bucket vem de uma delas) */
  fonte: string
}

/**
 * Todo `.from('<bucket>').remove(<arg>)` do `src/`, lido sobre o fonte SEM COMENTÁRIOS.
 *
 * `limpar(fonte, false)` neutraliza comentário e preserva o conteúdo das strings — as duas
 * coisas de que esta trava precisa ao mesmo tempo: um `remove(` citado em comentário não é
 * uma chamada, e o nome do bucket só existe dentro de um literal. Reusa o tokenizador da
 * F49 em vez de escrever um terceiro neutralizador (o motivo está escrito lá).
 */
/**
 * O resultado da varredura, MEMOIZADO.
 *
 * ⚠ Sem isto a suíte relê o `src/` inteiro (mais de 200 arquivos) a cada asserção e a
 * cada caso de `it.each` — medido: o `npm run test` local saltou de ~98 s para ~260 s
 * quando as asserções novas entraram. Uma trava que custa dois minutos e meio de CI a
 * cada push é uma trava que alguém vai querer desligar, e o custo não tinha nada a ver
 * com o que ela protege.
 */
let cacheSitios: Sitio[] | null = null

function sitiosDeRemocao(): Sitio[] {
  if (cacheSitios) return cacheSitios
  const achados: Sitio[] = []
  for (const abs of varrer(RAIZ_SRC)) {
    const bruto = readFileSync(abs, 'utf8')
    if (!bruto.includes('.remove(')) continue
    const fonte = limpar(bruto, false)
    const arquivo = ['src', relative(RAIZ_SRC, abs)].join('/').split(sep).join('/')
    for (const m of fonte.matchAll(RE_REMOVE)) {
      // `m.index + m[0].length - 1` é o `(` do próprio `remove(`.
      const argumento = argumentoDe(fonte, m.index + m[0].length - 1)
      if (argumento === null) continue
      achados.push({
        arquivo,
        bucket: m[1],
        argumento,
        chave: `${arquivo}::${argumento}`,
        fonte,
      })
    }
  }
  cacheSitios = achados
  return achados
}

describe('1. o universo de remoções de Storage está inteiro e classificado', () => {
  it('há arquivos para varrer (guarda do próprio teste)', () => {
    // Sem isto, uma varredura que devolvesse vazio — um `RAIZ_SRC` errado, um filtro
    // guloso — faria todas as asserções abaixo passarem por vacuidade. É a tautologia
    // que `pg_temp.assert_zero_de` mata do lado do SQL, escrita do lado do TypeScript.
    expect(varrer(RAIZ_SRC).length).toBeGreaterThan(200)
  })

  it('a varredura encontra remoções de Storage (senão a trava vigia o nada)', () => {
    expect(sitiosDeRemocao().length).toBeGreaterThan(0)
  })

  it('nenhum `.remove(` usa bucket em VARIÁVEL — senão o universo fica inauditável', () => {
    // O ponto cego que a revisão adversarial mediu: `from(bucket).remove(x)` escapava
    // da varredura por literal, e a trava ficava verde sobre uma remoção que ela nem
    // enxergava. Aqui as duas contagens têm de bater — toda remoção que EXISTE é uma
    // remoção que a classificação CONSEGUE ver.
    let comLiteral = 0
    let qualquer = 0
    for (const abs of varrer(RAIZ_SRC)) {
      const bruto = readFileSync(abs, 'utf8')
      if (!bruto.includes('.remove(')) continue
      const fonte = limpar(bruto, false)
      comLiteral += [...fonte.matchAll(RE_REMOVE)].length
      qualquer += [...fonte.matchAll(RE_REMOVE_QUALQUER)].length
    }
    expect(qualquer).toBeGreaterThan(0)
    expect(
      comLiteral,
      'há `.remove(` cujo bucket não é um literal — a classificação abaixo não o enxerga, e o universo que esta suíte declara vigiar deixou de ser o universo que ela vê',
    ).toBe(qualquer)
  })

  it('classifica EXATAMENTE as remoções que existem no fonte', () => {
    // A SIMETRIA, no molde do `import-uma-porta.test.ts`:
    //   · remoção nova que ninguém classificou   → sobra na direita, reprova;
    //   · classificação de uma remoção que sumiu → sobra na esquerda, reprova;
    //   · argumento que mudou (a cópia agora cobre outro conjunto) → a chave muda, reprova.
    const noFonte = [...new Set(sitiosDeRemocao().map((s) => s.chave))].sort()
    const declaradas = Object.keys(CLASSIFICADOS).sort()
    expect(noFonte).toEqual(declaradas)
  })
})

describe('2. quem é `copia-antes` copia o MESMO conjunto, antes de remover', () => {
  const sitios = () => sitiosDeRemocao().filter((s) => CLASSIFICADOS[s.chave]?.tipo === 'copia-antes')

  it('existe pelo menos um sítio `copia-antes` (senão esta seção vigia o nada)', () => {
    expect(sitios().length).toBeGreaterThan(0)
  })

  const copiaAntes = Object.entries(CLASSIFICADOS).filter(
    (e): e is [string, Extract<Classificacao, { tipo: 'copia-antes' }>] => e[1].tipo === 'copia-antes',
  )

  it.each(copiaAntes.map(([k, c]) => [k, c] as const))(
    '`%s` remove a lista CONFIRMADA pela cópia, e a cópia vem antes',
    (chave, c) => {
      const s = sitiosDeRemocao().find((x) => x.chave === chave)
      expect(s, `o sítio ${chave} sumiu do fonte`).toBeDefined()
      if (!s) return

      // (1) A cópia aparece ANTES da remoção no arquivo. É a asserção mais grosseira
      // possível sobre ordem, e é de propósito: uma leitura do fonte não executa o
      // programa, e fingir que analisa fluxo seria uma precisão que ela não tem. A ordem
      // REAL — a cópia falhou, então não remove — é provada pelo teste de comportamento em
      // `copiar-antes-de-remover.test.ts`, que é quem responde por isso.
      const posRemove = s.fonte.indexOf('.remove(')
      const posCopia = s.fonte.indexOf(NOME_COPIA)
      expect(posCopia, `${chave}: não há chamada a ${NOME_COPIA} neste arquivo`).toBeGreaterThan(-1)
      expect(posCopia, `${chave}: a cópia aparece DEPOIS do remove`).toBeLessThan(posRemove)

      // (2) A CADEIA, que é o que dá dentes à trava. O argumento do `remove(` tem de
      // DESCENDER da lista que a cópia confirmou — não da lista de entrada. É aqui que a
      // trava pega o caso realista: "a cópia existe, mas cobre outro conjunto".
      // ⚠ A REGEX EXIGE A ATRIBUIÇÃO, e o motivo foi MEDIDO. A primeira versão aceitava
      // também "`copiarArtefatosParaBackup` aparece a até 200 caracteres de `copiados`" —
      // e a sabotagem A.1 (trocar a chamada por `const copiados = params.caminhos`) passou
      // VERDE, porque aquele ramo casava com a DEFINIÇÃO da função, que mora neste mesmo
      // arquivo e declara `const copiados: string[] = []` no próprio corpo. Uma trava que
      // casa com a definição em vez da chamada prova que o nome existe, não que ele é
      // usado — que é o erro que a F51 documentou e este arquivo repetiu.
      const reOrigem = new RegExp(`\\b${c.listaConfirmada}\\b[^=\\n]{0,60}=\\s*await\\s+${NOME_COPIA}\\s*\\(`)
      expect(
        reOrigem.test(s.fonte),
        `${chave}: \`${c.listaConfirmada}\` não vem de \`await ${NOME_COPIA}(…)\` — a cópia sumiu, ou a lista removida passou a ter outra origem`,
      ).toBe(true)

      // ⚠ A EXPRESSÃO INTEIRA, e não o prefixo dela. A primeira versão casava
      // `\b<arg>\b\s*=\s*copiados\b` — um PREFIXO —, e a revisão adversarial passou com
      // `const loteRemocao = copiados.concat(falharam).slice(…)`: a união com a lista
      // que FALHOU casava, e a trava ficava verde apagando exatamente o `.docx` sem
      // cópia. Agora o lado direito é lido INTEIRO (até o fim da linha) e comparado
      // contra as formas autorizadas — qualquer outra coisa reprova, inclusive as que
      // ninguém pensou em proibir.
      const mAtrib = new RegExp(`\\b${s.argumento}\\b\\s*=\\s*([^\\n]+)`).exec(s.fonte)
      const direita = (mAtrib?.[1] ?? '').trim().replace(/;$/, '')
      const AUTORIZADAS = [
        c.listaConfirmada,
        `${c.listaConfirmada}.slice(i, i + LOTE_REMOCAO)`,
      ]
      expect(
        s.argumento === c.listaConfirmada || AUTORIZADAS.includes(direita),
        `${chave}: o \`remove(${s.argumento})\` recebe \`${direita}\`, que não é uma das formas autorizadas (${AUTORIZADAS.join(' | ')}). Qualquer união, concatenação ou filtro sobre \`${c.listaConfirmada}\` pode reintroduzir caminho que a cópia NÃO confirmou.`,
      ).toBe(true)

      // (3) E o negativo explícito: a remoção NÃO pode ser da lista de ENTRADA, que inclui
      // o que falhou ao copiar. Trocar uma pela outra é exatamente o defeito que esta fase
      // existe para impedir, e é uma edição de uma palavra.
      expect(
        s.argumento,
        `${chave}: o remove voltou a usar \`${c.listaDeEntrada}\` — isso apaga o .docx que NÃO foi copiado`,
      ).not.toBe(c.listaDeEntrada)
      expect(new RegExp(`\\b${s.argumento}\\b\\s*=\\s*${c.listaDeEntrada}\\b`).test(s.fonte)).toBe(false)
    },
  )
})

describe('3. os dispensados têm motivo ESCRITO, e não só a etiqueta', () => {
  const dispensados = Object.entries(CLASSIFICADOS).filter(([, c]) => c.tipo === 'dispensado')

  it('há dispensados classificados (senão esta seção vigia o nada)', () => {
    expect(dispensados.length).toBeGreaterThan(0)
  })

  it.each(dispensados.map(([k, c]) => [k, c] as const))('`%s` explica por que não é da classe', (_k, c) => {
    // O mesmo piso do `superficie-admin.test.ts`: "é assim mesmo" não é motivo. Uma frase
    // curta demais é o sintoma de uma classificação feita para calar a trava.
    expect(c.motivo.length).toBeGreaterThan(120)
    expect(c.motivo).toMatch(/\.$/)
  })

  it('nenhum dispensado mora no bucket `termos` sem dizer por que o objeto não é única cópia', () => {
    // O bucket `termos` guarda documento ASSINADO. Dispensar uma remoção DELE exige que o
    // motivo diga, com estas palavras, por que aquele objeto não é a única cópia de nada.
    for (const s of sitiosDeRemocao()) {
      const c = CLASSIFICADOS[s.chave]
      if (!c || c.tipo !== 'dispensado' || s.bucket !== 'termos') continue
      expect(
        /nunca entrou no acervo|superada|única cópia|nunca chegou a existir/i.test(c.motivo),
        `${s.chave}: dispensado no bucket \`termos\` sem dizer por que o objeto não é a única cópia de nada`,
      ).toBe(true)
    }
  })
})

describe('4. a trava não mente (guardas do próprio teste)', () => {
  it('o leitor IGNORA `.remove(` citado em comentário', () => {
    const fonte = limpar(`// await x.from('termos').remove(lista)\nconst a = 1\n`, false)
    expect([...fonte.matchAll(RE_REMOVE)].length).toBe(0)
  })

  /** O argumento do primeiro `remove(` de um trecho — o mesmo caminho que a varredura usa. */
  const argDe = (trecho: string): string | null => {
    const fonte = limpar(trecho, false)
    const m = [...fonte.matchAll(RE_REMOVE)][0]
    return m ? argumentoDe(fonte, m.index + m[0].length - 1) : null
  }

  it('o leitor NÃO ignora o código de verdade', () => {
    const fonte = limpar(`await x.from('termos').remove(lote)\n`, false)
    const m = [...fonte.matchAll(RE_REMOVE)]
    expect(m.length).toBe(1)
    expect(m[0][1]).toBe('termos')
    expect(argDe(`await x.from('termos').remove(lote)\n`)).toBe('lote')
  })

  it('o argumento é lido por BALANCEAMENTO, não até o primeiro `)`', () => {
    // O furo real, medido no primeiro `npm run test` desta suíte: a arrow function tem um
    // `)` no meio, e a leitura ingênua devolvia `orfaos.map((o`.
    expect(argDe(`x.from('termos').remove(orfaos.map((o) => o.arquivo_path))`)).toBe(
      'orfaos.map((o) => o.arquivo_path)',
    )
  })

  it('argumento diferente é sítio diferente (o caso "a cópia cobre outro conjunto")', () => {
    // Se a chave ignorasse o argumento, trocar `remove(lote)` por `remove(todos)` deixando
    // a cópia em `lote` seria invisível. Esta asserção documenta que não é.
    expect(argDe(`x.from('termos').remove(lote)`)).not.toBe(argDe(`x.from('termos').remove(todos)`))
  })

  it('a classificação não tem chave repetida nem etiqueta fora do vocabulário', () => {
    const tipos = Object.values(CLASSIFICADOS).map((c) => c.tipo)
    expect(new Set(tipos).size).toBeLessThanOrEqual(2)
    for (const t of tipos) expect(['copia-antes', 'dispensado']).toContain(t)
  })
})

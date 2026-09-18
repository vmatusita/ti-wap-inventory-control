// A DERIVA REPOSITÓRIO × PRODUÇÃO — funções PURAS (reauditoria 18/09/2026, item AE · passo 2).
//
// O PROBLEMA (docs/DIVIDA-TECNICA.md, item AE): uma migration mergeada na `main` e não aplicada
// em produção — ou aplicada e não registrada no ledger — hoje só é descoberta por acaso. Já
// aconteceu três vezes (a `0136`/`0137` sem registro; três funções divergentes por colagem
// manual; a `0146` que ficou horas no repositório sem apply).
//
// O CONTRATO COM BASE FIXA. O histórico antigo do ledger é incompatível com os arquivos por
// construção (item A da dívida — decisão do Johnny, R3, segue aberta): medido em 18/09/2026,
// produção guarda `name = 'profiles'` e o ensaio `name = '0001_profiles'` para a MESMA migration,
// e o ensaio tem linha órfã de renomeação (`0126b_lancamento_regulariza_contadores`, sem arquivo).
// Comparar o conjunto inteiro alarmaria os dois bancos o tempo todo. A regra, então, tem uma BASE:
// a `0146`, a primeira migration aplicada pelo conector MCP nos DOIS bancos com o mesmo `name`.
//
//   (P) Todo arquivo do repositório com número ≥ BASE tem de estar no ledger pelo nome
//       (normalizado: o prefixo `NNNN_` sai dos dois lados). Faltou → PENDENTE: aviso dentro da
//       tolerância (o merge e o apply ficam desencontrados de propósito por pouco tempo), alarme
//       além dela.
//   (D) Toda linha do ledger aplicada DEPOIS da linha da BASE (versão maior) tem de corresponder
//       a um arquivo do repositório. Não corresponde → alarme: algo foi aplicado fora do repo.
//       O que é mais antigo que a base (a `0126b_…` do ensaio) é histórico, e fica fora.
//
// POR QUE NÃO "LINHA D'ÁGUA" (o desenho anterior, derrubado na revisão adversarial): "tudo acima
// da maior migration já aplicada está pendente" fica CEGO ao apply fora de ordem — a `0149`
// aplicada antes da `0148` subiria a linha acima da `0148`, que nunca foi aplicada. O contrato
// pergunta arquivo por arquivo, e por isso a RPC (`public.ledger_de_migracoes()`, 0148) devolve
// o ledger INTEIRO, não uma ponta.
//
// Este módulo NÃO fala com banco, git ou rede — por isso é testável na mesa
// (`deriva-migrations.test.mts`). Quem o alimenta é `scripts/smoke/integridade.mjs`.

/** A primeira migration do contrato: da `0146` em diante, repositório e ledger têm de bater. */
export const BASE_DO_CONTRATO = 146

/** Um arquivo de migration reconhecido: `NNNN_nome.sql` → `{ numero, nome, arquivo }`. `null` se
 * o nome não seguir a convenção (defensivo — hoje todas as do repositório seguem). */
export function partesDoArquivo(arquivo) {
  const m = /^(\d{4,})_(.+)\.sql$/.exec(arquivo)
  if (!m) return null
  return { numero: Number(m[1]), nome: m[2], arquivo }
}

/** O nome do ledger, normalizado: tira um prefixo `NNNN_` ou `NNNNa_` se houver. É o que faz
 * `'0001_profiles'` (o formato de um dos dois bancos vivos) e `'profiles'` (o do outro) casarem
 * com o MESMO arquivo. `null`/vazio → `''`, nunca lança. */
export function nomeCanonicoDoLedger(nome) {
  if (typeof nome !== 'string') return ''
  return nome.replace(/^\d+[a-z]?_/, '')
}

/** Compara duas versões do ledger. As recentes são timestamps de 14 dígitos; as mais antigas de
 * produção são `'0001'`…: comparar como TEXTO acertaria só entre iguais de tamanho. Numérica
 * pura (tamanho, depois texto) quando as duas são só dígitos; texto no resto. */
export function compararVersoes(a, b) {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
    const xs = x.replace(/^0+(?=\d)/, '')
    const ys = y.replace(/^0+(?=\d)/, '')
    if (xs.length !== ys.length) return xs.length - ys.length
    return xs < ys ? -1 : xs > ys ? 1 : 0
  }
  return x < y ? -1 : x > y ? 1 : 0
}

/** A análise comum a `arquivosPendentes` e `avaliarDerivaMigrations` — uma só, para as duas
 * nunca discordarem sobre QUEM está pendente (a sonda busca data exatamente desses). */
function analisar({ arquivosRepo, ledger, base }) {
  const todos = []
  for (const arquivo of arquivosRepo ?? []) {
    const p = partesDoArquivo(arquivo)
    if (p) todos.push(p)
  }
  const nomesDoRepo = new Set(todos.map((p) => p.nome))
  const vigiados = todos.filter((p) => p.numero >= base).sort((a, b) => a.numero - b.numero)

  // Ambiguidade só importa DENTRO do contrato: dois arquivos vigiados com o mesmo nome-sem-prefixo
  // tornam impossível dizer a qual deles uma linha do ledger se refere.
  const contagem = new Map()
  for (const p of vigiados) contagem.set(p.nome, (contagem.get(p.nome) ?? 0) + 1)
  const nomesAmbiguos = new Set([...contagem].filter(([, n]) => n > 1).map(([nome]) => nome))

  const todasAsLinhas = (ledger ?? []).map((l) => ({
    versao: l?.versao ?? null,
    nome: nomeCanonicoDoLedger(l?.nome),
  }))
  // Linha SEM nome não casa com arquivo nenhum — mas não pode sumir: se foi aplicada depois
  // da base, é algo que entrou no ledger por fora do fluxo (a revisão final a achou invisível).
  const linhasSemNome = todasAsLinhas.filter((l) => !l.nome)
  const linhas = todasAsLinhas.filter((l) => l.nome)
  const nomesDoLedger = new Set(linhas.map((l) => l.nome))

  // A linha da BASE no ledger — a mais nova, se houver mais de uma com o mesmo nome.
  const arquivoBase = vigiados.find((p) => p.numero === base) ?? null
  let versaoDaBase = null
  if (arquivoBase) {
    for (const l of linhas) {
      if (l.nome !== arquivoBase.nome || l.versao == null) continue
      if (versaoDaBase == null || compararVersoes(l.versao, versaoDaBase) > 0) versaoDaBase = l.versao
    }
  }

  const pendentes = vigiados.filter((p) => !nomesAmbiguos.has(p.nome) && !nomesDoLedger.has(p.nome))
  const aplicados = vigiados.filter((p) => nomesDoLedger.has(p.nome))
  return { vigiados, nomesDoRepo, nomesAmbiguos, linhas, linhasSemNome, arquivoBase, versaoDaBase, pendentes, aplicados }
}

/**
 * A data em que um arquivo entrou na `main`, a partir da resposta de
 * `GET /repos/{dono}/{repo}/commits?path=<arquivo>&per_page=<porPagina>` (do mais NOVO para o mais
 * ANTIGO): é o `committer.date` do ÚLTIMO item — o commit mais antigo que tocou o caminho.
 *
 * Página CHEIA → `null`: o commit que acrescentou o arquivo pode estar na página seguinte, e o
 * último desta seria mais NOVO que a entrada real — a deriva velha passaria por recente. Sem data
 * a sonda avisa; com data errada ela se cala. Resposta vazia ou ilegível → `null` também.
 *
 * @param {unknown} commits o corpo JSON da resposta
 * @param {number} porPagina o `per_page` pedido
 * @returns {string|null} ISO, ou null quando não dá para saber
 */
export function dataDeEntradaDaRespostaDaApi(commits, porPagina) {
  if (!Array.isArray(commits) || commits.length === 0) return null
  if (commits.length >= porPagina) return null
  const maisAntigo = commits[commits.length - 1]
  const data = maisAntigo?.commit?.committer?.date ?? maisAntigo?.commit?.author?.date
  return typeof data === 'string' && data ? data : null
}

/**
 * A mesma data pelo `git log --diff-filter=A --format=%cI -- <arquivo>` local. Checkout RASO →
 * `null`: ali o commit enxertado "acrescenta" todo arquivo, e toda migration pareceria ter entrado
 * AGORA. Com histórico, a última linha é a adição mais antiga.
 *
 * @param {string} saida a saída do `git log`
 * @param {boolean} raso o que `git rev-parse --is-shallow-repository` respondeu
 * @returns {string|null}
 */
export function dataDeEntradaDoGitLog(saida, raso) {
  if (raso) return null
  const linhas = String(saida ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  return linhas.length ? linhas[linhas.length - 1] : null
}

/**
 * Os arquivos PENDENTES pelo contrato (P) — é destes, e só destes, que a sonda precisa da data de
 * entrada na `main`. Mesmo cálculo de `avaliarDerivaMigrations`, nunca uma reimplementação.
 *
 * @param {{arquivosRepo: string[], ledger: Array<{versao?: string, nome?: string|null}>, base?: number}} entrada
 * @returns {string[]}
 */
export function arquivosPendentes({ arquivosRepo, ledger, base = BASE_DO_CONTRATO }) {
  return analisar({ arquivosRepo, ledger, base }).pendentes.map((p) => p.arquivo)
}

/**
 * O VEREDITO da sonda de deriva.
 *
 * @param {object} entrada
 * @param {string[]} entrada.arquivosRepo nomes de arquivo de `supabase/migrations/`
 * @param {Array<{versao?: string, nome?: string|null}>} entrada.ledger o que
 *   `public.ledger_de_migracoes()` devolveu (o ledger inteiro)
 * @param {Date|string} entrada.agora o "agora" da sonda (injetado — nunca `new Date()` aqui dentro)
 * @param {Record<string,string>} [entrada.dataDeEntrada] arquivo → ISO da data em que ele entrou
 *   na `main`. Pendente sem data vira AVISO "data desconhecida" — a sonda não acusa deriva que
 *   não sabe medir; quem garante que a data existe é `integridade.mjs`.
 * @param {number} [entrada.toleranciaHoras] default 24
 * @param {number} [entrada.base] default `BASE_DO_CONTRATO`
 * @returns {{
 *   ok: boolean,
 *   ultimaNoLedger: {numero:number, nome:string, arquivo:string} | null,
 *   pendentes: string[],
 *   achados: Array<{chave:string, total:number|null, base:number|null, motivo:string}>,
 *   avisos: Array<{chave:string, motivo:string}>,
 * }}
 */
export function avaliarDerivaMigrations({
  arquivosRepo,
  ledger,
  agora,
  dataDeEntrada = {},
  toleranciaHoras = 24,
  base = BASE_DO_CONTRATO,
}) {
  const agoraMs = new Date(agora).getTime()
  const achados = []
  const avisos = []
  const a = analisar({ arquivosRepo, ledger, base })

  for (const nome of a.nomesAmbiguos) {
    const arquivos = a.vigiados.filter((p) => p.nome === nome).map((p) => p.arquivo)
    achados.push({
      chave: `deriva_migrations:nome_duplicado:${nome}`,
      total: arquivos.length,
      base: 1,
      motivo:
        `${arquivos.length} arquivos do repositório compartilham o nome-sem-prefixo '${nome}' ` +
        `(${arquivos.join(', ')}) — a sonda não consegue decidir a qual deles uma linha do ledger ` +
        'se refere. Corrija o nome de um dos dois.',
    })
  }

  // (P) — os pendentes, arquivo por arquivo.
  for (const p of a.pendentes) {
    const chave = `deriva_migrations:pendente:${p.arquivo}`
    const iso = dataDeEntrada[p.arquivo]
    const horas = iso ? (agoraMs - new Date(iso).getTime()) / 3_600_000 : NaN
    if (!Number.isFinite(horas)) {
      avisos.push({
        chave,
        motivo:
          `${p.arquivo} não está no ledger e a sonda não soube quando ele entrou na main ` +
          `(${iso ? `data ilegível '${iso}'` : 'sem data'}) — sem data não há tolerância a medir.`,
      })
      continue
    }
    if (horas > toleranciaHoras) {
      // `total`/`base` entram na impressão que deduplica a issue de alarme
      // (`impressaoDoEstado`, alarme.mjs): com as HORAS ali, a impressão mudaria a cada
      // execução e a issue ganharia um "o estado mudou" por dia sem nada ter mudado.
      // Um arquivo pendente além da tolerância = total 1 sobre base 0; as horas vão no motivo.
      achados.push({
        chave,
        total: 1,
        base: 0,
        motivo:
          `${p.arquivo} está no repositório há ${Math.round(horas)}h sem aparecer no ledger ` +
          `(tolerância: ${toleranciaHoras}h) — confira por EFEITO se falta aplicar ` +
          '(docs/RUNBOOK-BANCO.md) ou se já está aplicada e só falta registrar (docs/RUNBOOK-ALARME.md).',
      })
    } else {
      avisos.push({
        chave,
        motivo: `${p.arquivo} pendente há ${horas.toFixed(1)}h — dentro da tolerância de ${toleranciaHoras}h.`,
      })
    }
  }

  // (D) — o que foi aplicado DEPOIS da base e o repositório não conhece.
  if (a.versaoDaBase == null) {
    avisos.push({
      chave: 'deriva_migrations:base_fora_do_ledger',
      motivo:
        `a migration-base (${String(base).padStart(4, '0')}) não está no ledger — a regra "aplicado ` +
        'fora do repositório" não tem a partir de onde olhar. Se ela está pendente, o alarme dela já ' +
        'está acima.',
    })
  } else {
    for (const l of a.linhasSemNome) {
      if (l.versao == null || compararVersoes(l.versao, a.versaoDaBase) <= 0) continue
      achados.push({
        chave: `deriva_migrations:linha_sem_nome:${l.versao}`,
        total: null,
        base: null,
        motivo:
          `o ledger tem uma linha SEM NOME (versão ${l.versao}), aplicada depois da base — nenhum ` +
          'apply pelo fluxo normal grava isso; algo entrou no ledger por fora do repositório.',
      })
    }
    for (const l of a.linhas) {
      if (l.versao == null || compararVersoes(l.versao, a.versaoDaBase) <= 0) continue
      if (a.nomesDoRepo.has(l.nome)) continue
      achados.push({
        chave: `deriva_migrations:desconhecido:${l.nome}`,
        total: null,
        base: null,
        motivo:
          `o ledger tem '${l.nome}' (versão ${l.versao}), aplicada depois da base, que nenhum ` +
          'arquivo de supabase/migrations/ reconhece — algo foi aplicado fora do repositório.',
      })
    }
  }

  const ultimaNoLedger = a.aplicados.length ? a.aplicados[a.aplicados.length - 1] : null
  return {
    ok: achados.length === 0,
    ultimaNoLedger,
    pendentes: a.pendentes.map((p) => p.arquivo),
    achados,
    avisos,
  }
}

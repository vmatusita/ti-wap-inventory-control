import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { carregarMigrations, replayFuncoesRel } from '../../../scripts/db/recorte-rel.mjs'

// O ORÇAMENTO DO AS-OF — F60 (decisão iii do Johnny, 16/09/2026; PLAN-F60 §7.5 e §10.10).
//
// A `0143` trocou o as-of por uma lateral ancorada em `ativos` e o custo SUBIU, medido e
// declarado: 65,7 ms de mediana contra 38,9 ms do corpo da `0134` na mesma sessão (1,69×;
// réplica 1,58×). A fase aceitou o preço por escrito — é a única família de corpo que a trava de
// recorte aceita, e ela cresce com o número de ATIVOS, não com o histórico de cada um. Um preço
// aceito só continua sendo uma decisão enquanto o corpo que o pagou for o corpo que está no ar.
// `docs/perf/asof-orcamento.json` guarda a medição E a identidade do corpo medido; esta trava
// reprova quando as duas se descolam.
//
// ⚠ ENVELHECE PELO CORPO, NUNCA PELO CALENDÁRIO — e nada aqui lê a data de hoje. Um orçamento
// "vence em 90 dias" ficaria vermelho com o projeto parado dois meses, e trava que acende sem
// nada ter mudado é trava que alguém desliga. O que muda o custo é o texto da função; é ele
// que tem hash. A guarda 3 prova isso com uma medição datada de 2000: continua verde.
//
// ⚠ O CORPO VIVO VEM DO REPLAY DE `recorte-rel.mjs`, NÃO DE `corpoVigente`. `corpoVigente` não
// conhece `drop`: depois da `0145` ele ainda acharia a `rel_estoque_asof` da `0134`, e uma
// trava lendo a assinatura errada ficaria verde para sempre. O replay aplica `create`, `create
// or replace`, `drop` e `rename` na ordem das migrations — é a mesma leitura que a trava do
// recorte (`rpcs-recorte-sql.test.ts`) usa para julgar as `rel_*` vivas.
//
// ⚠ O HASH É DA DEFINIÇÃO INTEIRA (do `create function` ao `$$;`), com o espaço em branco
// colapsado — não só do corpo entre os `$$`. O cabeçalho também muda o plano: tirar o `set
// search_path` deixaria a função ser embutida no chamador, e `strict`/`volatile` mudam o que
// o planejador pode fazer. O preço dessa escolha, aceito: uma migration que recrie a função com
// `create or replace` e o MESMO corpo muda o texto do cabeçalho e acende a trava — e recriar o
// as-of é exatamente a hora de medir de novo. Espaço, quebra de linha e indentação não contam
// (guarda 4).
//
// ⚠ AS MENSAGENS SÃO DIFERENTES DE PROPÓSITO. "Arquivo ausente" pede para RECRIAR a medição;
// "velho" pede para MEDIR o corpo novo. A saída errada — trocar só o `corpo.hash` para caber —
// apaga a prova, e a mensagem de "velho" diz isso com todas as letras.
//
// Lê o disco na COLETA, nunca dentro de `it` (a lição da F57): as migrations e o JSON são lidos
// uma vez, e todo veredito — o real e os das guardas em memória — é calculado aqui no topo.

const RAIZ = process.cwd()
const CAMINHO_ORCAMENTO = ['docs', 'perf', 'asof-orcamento.json'] as const
const ROTULO_ORCAMENTO = CAMINHO_ORCAMENTO.join('/')

/** A assinatura medida, como o JSON a escreve (a forma que `regprocedure` aceita). */
const FUNCAO = 'public.rel_estoque_asof_filiais(smallint[], date)'
/** A mesma assinatura na chave do replay (`assinaturaDe`: sem espaço depois da vírgula). */
const CHAVE_REPLAY = 'public.rel_estoque_asof_filiais(smallint[],date)'

type Migration = { arquivo: string; sql: string }

type TipoVeredito =
  | 'ok'
  | 'ausente'
  | 'ilegivel'
  | 'incompleto'
  | 'outra-funcao'
  | 'replay-com-falha'
  | 'sem-corpo-vivo'
  | 'velho'

type Veredito = { tipo: TipoVeredito; mensagem: string }

/** A normalização do hash: todo espaço em branco vira um espaço só, e as pontas saem. */
function normalizarDefinicao(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function hashDaDefinicao(texto: string): string {
  return createHash('sha256').update(normalizarDefinicao(texto), 'utf8').digest('hex')
}

type Objeto = Record<string, unknown>
const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const ehTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const ehNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * O que falta para o JSON ser um ORÇAMENTO, e não um hash solto. Um arquivo só com `corpo.hash`
 * passaria pela conferência de identidade sem medir nada — e o custo que a trava protege é o
 * da medição. `medicao.data` é exigida como TEXTO e nunca comparada com hoje.
 */
function camposFaltando(j: Objeto): string[] {
  const faltando: string[] = []
  const exigir = (ok: boolean, caminho: string) => {
    if (!ok) faltando.push(caminho)
  }
  exigir(ehTexto(j.funcao), 'funcao')
  const corpo = ehObjeto(j.corpo) ? j.corpo : {}
  exigir(typeof corpo.hash === 'string' && /^[0-9a-f]{64}$/.test(corpo.hash), 'corpo.hash (sha256 hex)')
  exigir(corpo.algoritmo === 'sha256', "corpo.algoritmo = 'sha256'")
  exigir(ehTexto(corpo.fonte), 'corpo.fonte')
  exigir(ehTexto(corpo.arquivo), 'corpo.arquivo')
  const m = ehObjeto(j.medicao) ? j.medicao : {}
  exigir(ehTexto(m.alvo), 'medicao.alvo')
  exigir(ehTexto(m.data), 'medicao.data')
  exigir(ehTexto(m.metodo), 'medicao.metodo')
  for (const grupo of ['execucao_ms', 'planejamento_ms'] as const) {
    const g = ehObjeto(m[grupo]) ? m[grupo] : {}
    exigir(ehNumero(g.mediana), `medicao.${grupo}.mediana`)
    exigir(ehNumero(g.p95), `medicao.${grupo}.p95`)
  }
  const buffers = ehObjeto(m.buffers_raiz) ? m.buffers_raiz : {}
  exigir(ehNumero(buffers.hit_mediana), 'medicao.buffers_raiz.hit_mediana')
  exigir(Array.isArray(m.nos_do_plano) && m.nos_do_plano.length > 0, 'medicao.nos_do_plano')
  exigir(ehNumero(m.linhas), 'medicao.linhas')
  return faltando
}

/**
 * O veredito da trava: o JSON (texto, ou `null` quando o arquivo não existe) contra o corpo VIVO
 * pelo replay de `migrations`. Função pura sobre as duas entradas — é o que deixa as guardas
 * abaixo rodarem EM MEMÓRIA, sem tocar o disco.
 */
function conferirOrcamento(textoJson: string | null, migrations: Migration[]): Veredito {
  if (textoJson === null) {
    return {
      tipo: 'ausente',
      mensagem:
        `${ROTULO_ORCAMENTO} NÃO EXISTE. O custo do as-of fica sem orçamento preso ao corpo medido ` +
        `(decisão iii da F60). Recrie o arquivo com a medição do corpo VIVO de ${FUNCAO} — método e ` +
        'campos em PLAN-F60 §7.5 — e com o hash desse corpo; não há valor padrão que o substitua.',
    }
  }

  let json: unknown
  try {
    json = JSON.parse(textoJson)
  } catch (err) {
    return {
      tipo: 'ilegivel',
      mensagem: `${ROTULO_ORCAMENTO} não é JSON válido (${(err as Error).message}).`,
    }
  }
  if (!ehObjeto(json)) {
    return { tipo: 'ilegivel', mensagem: `${ROTULO_ORCAMENTO} não é um objeto JSON.` }
  }

  const faltando = camposFaltando(json)
  if (faltando.length > 0) {
    return {
      tipo: 'incompleto',
      mensagem:
        `${ROTULO_ORCAMENTO} está INCOMPLETO — sem: ${faltando.join(', ')}. Um orçamento é a ` +
        'medição E a identidade do corpo medido; um hash sem medição não prova custo nenhum.',
    }
  }

  if (json.funcao !== FUNCAO) {
    return {
      tipo: 'outra-funcao',
      mensagem:
        `${ROTULO_ORCAMENTO} orça "${String(json.funcao)}", e a função de as-of viva é ${FUNCAO}. ` +
        'Orçamento de outra assinatura não diz nada sobre o custo desta.',
    }
  }

  const replay = replayFuncoesRel(migrations)
  if (replay.falhas.length > 0) {
    return {
      tipo: 'replay-com-falha',
      mensagem:
        `o replay das migrations não sabe dizer qual é o corpo vivo de ${FUNCAO} — ${replay.falhas.length} ` +
        `falha(s) de leitura: ${replay.falhas.map((f) => `${f.arquivo}:${f.linha} ${f.motivo}`).join(' · ')}. ` +
        'A trava falha FECHADO (a mesma leitura reprova em rpcs-recorte-sql.test.ts).',
    }
  }

  const viva = replay.vivas.get(CHAVE_REPLAY)
  if (!viva) {
    return {
      tipo: 'sem-corpo-vivo',
      mensagem:
        `${FUNCAO} não existe mais pelo replay das migrations (derrubada ou renomeada), e ` +
        `${ROTULO_ORCAMENTO} ainda a orça. Se o as-of mudou de assinatura, meça a nova e troque ` +
        '`funcao`, `corpo` e `medicao` juntos.',
    }
  }

  const hashVivo = hashDaDefinicao(viva.definicao)
  const corpo = json.corpo as Objeto
  if (hashVivo !== corpo.hash) {
    return {
      tipo: 'velho',
      mensagem:
        `o orçamento do as-of está VELHO: o corpo vivo de ${FUNCAO} (supabase/migrations/` +
        `${viva.arquivo}:${viva.linha}) não é o corpo medido. sha256 vivo ${hashVivo} ≠ ` +
        `${String(corpo.hash)} em ${ROTULO_ORCAMENTO} (medido de ${String(corpo.arquivo)}). ` +
        'MEÇA O CORPO NOVO pelo método de `medicao.metodo` e grave medição e hash JUNTOS — ' +
        'trocar só o `corpo.hash` para caber é apagar a prova de que o custo foi aceito.',
    }
  }

  return {
    tipo: 'ok',
    mensagem: `o corpo vivo de ${FUNCAO} (supabase/migrations/${viva.arquivo}:${viva.linha}) é o medido (sha256 ${hashVivo})`,
  }
}

// -----------------------------------------------------------------------------
// A COLETA — disco lido uma vez, todo veredito calculado aqui
// -----------------------------------------------------------------------------

const MIGRATIONS: Migration[] = carregarMigrations(RAIZ)
const CAMINHO_ABSOLUTO = join(RAIZ, ...CAMINHO_ORCAMENTO)
const TEXTO_ORCAMENTO: string | null = existsSync(CAMINHO_ABSOLUTO)
  ? readFileSync(CAMINHO_ABSOLUTO, 'utf8')
  : null

const VEREDITO_REAL = conferirOrcamento(TEXTO_ORCAMENTO, MIGRATIONS)

const REPLAY_REAL = replayFuncoesRel(MIGRATIONS)
const DEFINICAO_VIVA: string | null = REPLAY_REAL.vivas.get(CHAVE_REPLAY)?.definicao ?? null

/**
 * Uma migration SINTÉTICA, em memória, acrescentada ao fim da cadeia real: derruba o as-of e o
 * recria com a definição viva transformada por `transformar`. `drop` + `create` (e não `create or
 * replace`) de propósito: assim o cabeçalho continua byte a byte o mesmo, e a única diferença é
 * a que a guarda quer medir.
 */
function comSintetica(transformar: (definicao: string) => string): Migration[] {
  if (DEFINICAO_VIVA === null) return MIGRATIONS
  return [
    ...MIGRATIONS,
    {
      arquivo: '9999_sintetica_orcamento_asof.sql',
      sql: `drop function ${FUNCAO};\n${transformar(DEFINICAO_VIVA)}\n`,
    },
  ]
}

/** Troca `de` por `para` exigindo UMA ocorrência — sem isso a guarda mediria nada. */
function trocarUmaVez(texto: string, de: string, para: string): string {
  const n = texto.split(de).length - 1
  if (n !== 1) throw new Error(`guarda do orçamento: "${de}" aparece ${n} vez(es) na definição viva — escolha outra âncora`)
  return texto.split(de).join(para)
}

// Um byte do CORPO: `limit 1` → `limit 2`. A âncora é conferida (uma ocorrência) na coleta.
const ANCORA_BYTE = 'limit 1'
const ANCORA_OK = DEFINICAO_VIVA !== null && DEFINICAO_VIVA.split(ANCORA_BYTE).length - 1 === 1

const VEREDITO_SEM_JSON = conferirOrcamento(null, MIGRATIONS)
const VEREDITO_UM_BYTE = ANCORA_OK
  ? conferirOrcamento(TEXTO_ORCAMENTO, comSintetica((d) => trocarUmaVez(d, ANCORA_BYTE, 'limit 2')))
  : null
// O controle da guarda do byte: a MESMA migration sintética, só com espaço a mais. Sem ele, o
// vermelho do byte poderia vir de "acrescentou uma migration", e não do byte.
const VEREDITO_SO_ESPACO = conferirOrcamento(
  TEXTO_ORCAMENTO,
  comSintetica((d) => d.replace(/\n/g, '\n\n    ').replace(/ {2}/g, '     ')),
)
const VEREDITO_DERRUBADA: Veredito = conferirOrcamento(TEXTO_ORCAMENTO, [
  ...MIGRATIONS,
  { arquivo: '9999_sintetica_orcamento_asof.sql', sql: `drop function ${FUNCAO};\n` },
])

/** O JSON real com um campo trocado — `null` quando o arquivo real não existe (a guarda 1 acusa). */
function jsonAlterado(mudar: (j: Objeto) => void): string | null {
  if (TEXTO_ORCAMENTO === null) return null
  const j = JSON.parse(TEXTO_ORCAMENTO) as Objeto
  mudar(j)
  return JSON.stringify(j)
}

const VEREDITO_DATA_ANTIGA = conferirOrcamento(
  jsonAlterado((j) => {
    const medicao = j.medicao as Objeto
    medicao.data = '2000-01-01'
    medicao.medido_em = '2000-01-01T00:00:00.000Z'
  }),
  MIGRATIONS,
)
const VEREDITO_HASH_DO_JSON_TROCADO = conferirOrcamento(
  jsonAlterado((j) => {
    const corpo = j.corpo as Objeto
    const h = String(corpo.hash)
    corpo.hash = (h[0] === '0' ? '1' : '0') + h.slice(1)
  }),
  MIGRATIONS,
)
const VEREDITO_SO_HASH = conferirOrcamento(
  jsonAlterado((j) => {
    delete j.medicao
  }),
  MIGRATIONS,
)
const VEREDITO_OUTRA_FUNCAO = conferirOrcamento(
  jsonAlterado((j) => {
    j.funcao = 'public.rel_estoque_asof(smallint, date)'
  }),
  MIGRATIONS,
)
const VEREDITO_ILEGIVEL = conferirOrcamento('{ "funcao": ', MIGRATIONS)

// A IDENTIDADE É A DO POSTGRES, NÃO A GRAFIA (revisão final da F60). O Postgres trata `int2[]`,
// `smallint []` e `smallint[]` — e `pg_catalog.date` e `date` — como a MESMA assinatura, e aceita
// `drop function <nome>;` sem lista quando o nome é único. Antes da revisão, o replay montava a
// chave com a grafia crua: um `create or replace` com outra grafia SUBSTITUÍA o as-of no banco e
// virava uma SEGUNDA chave no replay, e o `drop` sem lista não derrubava nada — nos dois casos a
// chave medida seguia apontando para a definição da 0143 e esta trava dava "ok" sobre um corpo que
// o banco não tem. As sintéticas abaixo recriam o as-of com a definição viva, só trocando a grafia
// dos tipos no cabeçalho por `create or replace` — o texto muda, então o veredito certo é "velho".
const CABECALHO_VIVO = /create function public\.rel_estoque_asof_filiais\(\s*p_filiais\s+smallint\[\],\s*p_data\s+date\s*\)/
const CABECALHO_OK = DEFINICAO_VIVA !== null && CABECALHO_VIVO.test(DEFINICAO_VIVA)
function recriadaComGrafia(argumentos: string): Migration[] {
  if (DEFINICAO_VIVA === null || !CABECALHO_OK) return MIGRATIONS
  return [
    ...MIGRATIONS,
    {
      arquivo: '9999_sintetica_orcamento_asof.sql',
      sql: `${DEFINICAO_VIVA.replace(CABECALHO_VIVO, `create or replace function public.rel_estoque_asof_filiais(${argumentos})`)}\n`,
    },
  ]
}
const VEREDITOS_GRAFIA = (
  [
    ['int2[]', 'p_filiais int2[], p_data date'],
    ['smallint []', 'p_filiais smallint [], p_data date'],
    ['_int2', 'p_filiais _int2, p_data date'],
    ['pg_catalog.date', 'p_filiais smallint[], p_data pg_catalog.date'],
  ] as const
).map(([nome, args]) => ({ nome, veredito: conferirOrcamento(TEXTO_ORCAMENTO, recriadaComGrafia(args)) }))
const VEREDITO_DROP_SEM_LISTA = conferirOrcamento(TEXTO_ORCAMENTO, [
  ...MIGRATIONS,
  { arquivo: '9999_sintetica_orcamento_asof.sql', sql: 'drop function if exists public.rel_estoque_asof_filiais;\n' },
])

// -----------------------------------------------------------------------------

describe('1. o estado do repositório — o corpo vivo do as-of é o corpo medido', () => {
  it(`${ROTULO_ORCAMENTO} existe, é um orçamento completo e o hash é o do corpo vivo pelo replay`, () => {
    expect(VEREDITO_REAL.tipo, `\n${VEREDITO_REAL.mensagem}\n`).toBe('ok')
  })
})

describe('2. a guarda do próprio teste — EM MEMÓRIA, sem tocar o disco', () => {
  it('a guarda tem sujeito: o replay acha a definição viva, e a âncora do byte está nela uma vez', () => {
    expect(DEFINICAO_VIVA, `o replay não achou ${CHAVE_REPLAY} — as guardas abaixo mediriam nada`).not.toBeNull()
    expect(ANCORA_OK, `"${ANCORA_BYTE}" não aparece exatamente uma vez na definição viva`).toBe(true)
  })

  it('SEM o JSON → vermelho, "ausente"', () => {
    expect(VEREDITO_SEM_JSON.tipo).toBe('ausente')
    expect(VEREDITO_SEM_JSON.mensagem).toMatch(/NÃO EXISTE/)
  })

  it('migration sintética que muda UM BYTE do corpo → vermelho, "velho"', () => {
    expect(VEREDITO_UM_BYTE?.tipo, VEREDITO_UM_BYTE?.mensagem).toBe('velho')
    expect(VEREDITO_UM_BYTE?.mensagem).toMatch(/VELHO/)
    expect(VEREDITO_UM_BYTE?.mensagem).toMatch(/9999_sintetica_orcamento_asof\.sql/)
  })

  it('SEM a sintética → verde (a cadeia real, o mesmo JSON)', () => {
    // A "restauração" da sabotagem é a própria cadeia real: o mesmo JSON e as mesmas migrations
    // das duas guardas acima, sem a migration sintética. É o veredito do describe 1, e é de
    // propósito que seja o MESMO objeto — as três situações partem de uma entrada só.
    expect(VEREDITO_REAL.tipo, VEREDITO_REAL.mensagem).toBe('ok')
  })

  it('"ausente" e "velho" têm mensagens DIFERENTES — pedem ações diferentes', () => {
    expect(VEREDITO_SEM_JSON.mensagem).not.toBe(VEREDITO_UM_BYTE?.mensagem)
    expect(VEREDITO_SEM_JSON.mensagem).not.toMatch(/VELHO/)
    expect(VEREDITO_UM_BYTE?.mensagem).not.toMatch(/NÃO EXISTE/)
  })
})

describe('3. nunca por calendário', () => {
  it('a mesma medição datada de 2000, com o corpo vivo igual ao medido → verde', () => {
    expect(VEREDITO_DATA_ANTIGA.tipo, VEREDITO_DATA_ANTIGA.mensagem).toBe('ok')
  })
})

describe('4. o que conta como "o corpo mudou"', () => {
  it('a mesma definição só com espaço e quebra de linha a mais → verde (o controle da guarda do byte)', () => {
    expect(VEREDITO_SO_ESPACO.tipo, VEREDITO_SO_ESPACO.mensagem).toBe('ok')
    // Verde PELA SINTÉTICA, não apesar dela: o corpo julgado é o que a migration 9999 recriou.
    // Sem isto, um replay que ignorasse o `drop`+`create` deixaria esta guarda verde sobre nada.
    expect(VEREDITO_SO_ESPACO.mensagem).toMatch(/9999_sintetica_orcamento_asof\.sql/)
  })

  it('o hash trocado DO LADO DO JSON também é "velho" — a identidade vale nos dois sentidos', () => {
    expect(VEREDITO_HASH_DO_JSON_TROCADO.tipo).toBe('velho')
  })

  it('o as-of derrubado pelo replay, com o orçamento ainda citando a assinatura → vermelho, "sem-corpo-vivo"', () => {
    expect(VEREDITO_DERRUBADA.tipo, VEREDITO_DERRUBADA.mensagem).toBe('sem-corpo-vivo')
  })
})

describe('5. o arquivo tem de ser um orçamento, não um hash solto', () => {
  it('sem `medicao` → vermelho, "incompleto"', () => {
    expect(VEREDITO_SO_HASH.tipo).toBe('incompleto')
    expect(VEREDITO_SO_HASH.mensagem).toMatch(/medicao\.alvo/)
  })

  it('orçando outra assinatura (a velha, que a 0145 derruba) → vermelho, "outra-funcao"', () => {
    expect(VEREDITO_OUTRA_FUNCAO.tipo).toBe('outra-funcao')
  })

  it('JSON quebrado → vermelho, "ilegivel"', () => {
    expect(VEREDITO_ILEGIVEL.tipo).toBe('ilegivel')
  })

  it('cada vermelho tem a sua mensagem — nenhuma repetida', () => {
    const vermelhos = [
      VEREDITO_SEM_JSON,
      VEREDITO_UM_BYTE,
      VEREDITO_DERRUBADA,
      VEREDITO_SO_HASH,
      VEREDITO_OUTRA_FUNCAO,
      VEREDITO_ILEGIVEL,
    ]
    const tipos = vermelhos.map((v) => v?.tipo)
    expect(new Set(tipos).size, `tipos: ${tipos.join(', ')}`).toBe(vermelhos.length)
    expect(new Set(vermelhos.map((v) => v?.mensagem)).size).toBe(vermelhos.length)
  })
})

describe('6. a identidade do as-of é a do Postgres, não a grafia (revisão final da F60)', () => {
  it('a guarda tem sujeito: o cabeçalho vivo tem a forma que as sintéticas trocam', () => {
    expect(CABECALHO_OK, 'o cabeçalho da definição viva mudou — reescreva CABECALHO_VIVO').toBe(true)
  })

  it.each(VEREDITOS_GRAFIA.map((v) => [v.nome, v.veredito] as const))(
    'create or replace com %s substitui o as-of → vermelho, "velho" (antes: "ok" sobre a definição da 0143)',
    (_nome, veredito) => {
      expect(veredito.tipo, veredito.mensagem).toBe('velho')
      expect(veredito.mensagem).toMatch(/9999_sintetica_orcamento_asof\.sql/)
    },
  )

  it('drop function if exists SEM lista de argumentos → vermelho, "sem-corpo-vivo"', () => {
    expect(VEREDITO_DROP_SEM_LISTA.tipo, VEREDITO_DROP_SEM_LISTA.mensagem).toBe('sem-corpo-vivo')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  corpoVigente,
  definicoesDeFuncao,
  listarMigrations,
  PASTA_MIGRATIONS,
} from '../../../scripts/db/corpo-vigente.mjs'

// =============================================================================
// A TRAVA DO ITEM AG — no gatilho de movimentação, cada EFEITO mora numa porta só, e a
// orquestradora alcança cada auxiliar pelo nome.
// =============================================================================
// POR QUE ELA EXISTE
//
// `aplicar_movimentacao` é o gatilho que TODA movimentação atravessa, e o corpo dela foi
// reemitido inteiro onze vezes (0004 → 0146) — o mesmo mecanismo que a F51 desmontou no
// import. A `0150` (reauditoria de 18/09, passo 4) a quebrou numa orquestradora fina sobre
// seis auxiliares nomeadas, e a promessa que ela faz é de LOCALIDADE: a próxima mudança
// recria UMA auxiliar, e cada efeito sobre o banco tem um dono só.
//
// Esta suíte transforma a promessa em invariante conferida a cada `npm run test`, SEM
// BANCO. É a irmã de `import-uma-porta.test.ts` (F51), e as duas réguas vêm de lá: lista
// LITERAL conferida nos dois sentidos, e o corpo lido como CÓDIGO (sem literais e sem
// comentários, nessa ordem).
//
// AS PORTAS — o que cada efeito do gatilho tem como dono ÚNICO
//
//   · `update public.ativos` ............ `movimentacao_estornar` (a restauração) e
//                                         `movimentacao_transicionar` (o caminho normal),
//                                         UMA vez em cada: o UPDATE é um statement só, e
//                                         dividi-lo mudaria o número de versões da linha;
//   · `insert into public.pendencias_item` `movimentacao_abrir_pendencias_item`;
//   · `delete from public.pendencias_item` `movimentacao_desfazer_pendencias_item`;
//   · a trava de linha (`for update`) ..... a ORQUESTRADORA, e ela não escreve nada.
//
// As duas funções PURAS (a sincronização de detentor e a pendência de termo) não têm DML
// nenhum: elas são chamadas DENTRO do SET dos UPDATEs, e é isso que mantém cada UPDATE um
// statement só.
//
// ⚠ ASSERÇÃO SOBRE ESTRUTURA, NUNCA SOBRE TAMANHO — a mesma régua da F51. Um comentário
// novo não pode derrubar a trava.
//
// ⚠ O QUE ELA NÃO PROVA. Ela lê o TEXTO das migrations, não o banco, e não prova que o
// comportamento é o mesmo. Quem prova é `supabase/tests/movimentacao_grade.sql` (o mesmo
// texto passo a passo contra a 0146 e contra a 0150) e o injetor de mutações. Esta trava
// responde por outra pergunta, a que não tem quem responda: "o repositório continua
// descrevendo uma porta por efeito?".
// =============================================================================

/** A função de gatilho — o que `trg_aplicar_movimentacao` executa. */
const ORQUESTRADORA = 'public.aplicar_movimentacao()'

/**
 * As seis auxiliares, nomeadas uma a uma. Lista literal e não prefixo: um prefixo abraçaria
 * qualquer função futura batizada `movimentacao_*`, e a trava passaria a proteger um
 * conjunto que ninguém decidiu. A conferência de CONJUNTO (describe 1) é que impede a lista
 * de envelhecer em silêncio.
 */
const AUXILIARES = [
  'public.movimentacao_estornar(public.movimentacoes, public.ativos)',
  'public.movimentacao_pendencia_de_termo_restaurada(jsonb, text)',
  'public.movimentacao_desfazer_pendencias_item(uuid)',
  'public.movimentacao_abrir_pendencias_item(public.movimentacoes, public.ativos)',
  'public.movimentacao_transicionar(public.movimentacoes, public.ativos)',
  'public.movimentacao_detentor_sincronizado(public.status_ativo, public.tipo_movimentacao, text, text)',
] as const

type Assinatura = (typeof AUXILIARES)[number] | typeof ORQUESTRADORA

/** Os efeitos vigiados, e a ÚNICA função que pode carregá-los (e quantas vezes). */
const PORTAS: { efeito: string; padrao: RegExp; donas: Record<string, number> }[] = [
  {
    efeito: 'update public.ativos',
    padrao: /\bupdate\s+public\.ativos\b/gi,
    donas: {
      'public.movimentacao_estornar(public.movimentacoes, public.ativos)': 1,
      'public.movimentacao_transicionar(public.movimentacoes, public.ativos)': 1,
    },
  },
  {
    efeito: 'insert into public.pendencias_item',
    padrao: /\binsert\s+into\s+public\.pendencias_item\b/gi,
    donas: { 'public.movimentacao_abrir_pendencias_item(public.movimentacoes, public.ativos)': 1 },
  },
  {
    efeito: 'delete from public.pendencias_item',
    padrao: /\bdelete\s+from\s+public\.pendencias_item\b/gi,
    donas: { 'public.movimentacao_desfazer_pendencias_item(uuid)': 1 },
  },
]

/** As que não podem ter DML nenhum. */
const PURAS = [
  'public.movimentacao_pendencia_de_termo_restaurada(jsonb, text)',
  'public.movimentacao_detentor_sincronizado(public.status_ativo, public.tipo_movimentacao, text, text)',
] as const

const QUALQUER_DML = /\b(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from)\b/i

/** Só o nome, sem esquema e sem tipos — para casar referência dentro de um corpo. */
function nomeSimples(assinatura: string): string {
  return assinatura.replace(/^public\./, '').replace(/\(.*$/, '')
}

/**
 * O texto reduzido ao CÓDIGO que executa: primeiro somem os literais (`'…'`, com o `''`
 * escapado tratado), depois o `--` até o fim da linha. A ORDEM importa, e o porquê está
 * medido na F51 (`import-uma-porta.test.ts`, `codigoVivo`): um `--` dentro de string
 * cortaria código real, e um nome de auxiliar dentro de string contaria como chamada.
 */
function limpar(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .split('\n')
    .map((linha) => linha.replace(/--.*$/, ''))
    .join('\n')
}

/** O corpo vigente, só o código. */
function codigoVivo(assinatura: Assinatura | string): string {
  return limpar(corpoVigente(assinatura).sql)
}

function ocorrencias(texto: string, padrao: RegExp): number {
  return (texto.match(new RegExp(padrao.source, padrao.flags)) ?? []).length
}

/** Todo nome `movimentacao_*` que as migrations DEFINEM (definição de verdade, não menção). */
function auxiliaresDefinidasNasMigrations(): string[] {
  const nomes = new Set<string>()
  for (const arquivo of listarMigrations()) {
    const sql = readFileSync(join(process.cwd(), ...PASTA_MIGRATIONS, arquivo), 'utf8')
    for (const d of definicoesDeFuncao(sql)) {
      if (d.esquema === 'public' && d.nome.startsWith('movimentacao_')) nomes.add(d.nome)
    }
  }
  return [...nomes].sort()
}

describe('1. a cadeia do gatilho existe e está inteira', () => {
  it('há migrations para varrer (guarda do próprio teste)', () => {
    expect(listarMigrations().length).toBeGreaterThan(100)
  })

  it('a orquestradora existe, sem argumento e devolvendo trigger', () => {
    const { sql } = corpoVigente(ORQUESTRADORA)
    expect(sql).toMatch(/returns\s+trigger/i)
    expect(sql).toMatch(/security\s+definer/i)
  })

  it('o gatilho continua executando a orquestradora (e não uma auxiliar)', () => {
    // Um gatilho repontado para uma auxiliar pularia a trava de linha e o snapshot, e o
    // SQL continuaria válido. Lido da ÚLTIMA definição do gatilho na cadeia.
    let ultima = ''
    for (const arquivo of listarMigrations()) {
      const sql = limpar(readFileSync(join(process.cwd(), ...PASTA_MIGRATIONS, arquivo), 'utf8'))
      const m = sql.match(/create\s+(?:or\s+replace\s+)?trigger\s+trg_aplicar_movimentacao[\s\S]*?;/gi)
      if (m) ultima = m[m.length - 1]
    }
    expect(ultima, 'nenhuma migration cria trg_aplicar_movimentacao').not.toBe('')
    expect(ultima).toMatch(/before\s+insert\s+on\s+public\.movimentacoes/i)
    expect(ultima).toMatch(/execute\s+(?:function|procedure)\s+public\.aplicar_movimentacao\(\)/i)
  })

  it('a lista classifica EXATAMENTE as `movimentacao_*` que as migrations definem', () => {
    // A SIMETRIA, numa asserção só (o molde do `catalogo_secdef.sql` e da F51):
    //   · auxiliar nova que ninguém declarou aqui → sobra na direita, reprova;
    //   · nome declarado que sumiu das migrations → sobra na esquerda, reprova;
    //   · item removido da lista sem sumir do SQL → reprova.
    expect(AUXILIARES.map(nomeSimples).sort()).toEqual(auxiliaresDefinidasNasMigrations())
  })

  it.each(AUXILIARES.map((a) => [nomeSimples(a), a] as const))(
    'a auxiliar `%s` existe com a assinatura declarada, e é security definer',
    (_nome, assinatura) => {
      const { sql } = corpoVigente(assinatura)
      expect(sql).toMatch(/security\s+definer/i)
      expect(sql).toMatch(/set\s+search_path\s*=\s*public/i)
    },
  )
})

describe('2. uma porta por efeito', () => {
  const todas: string[] = [ORQUESTRADORA, ...AUXILIARES]

  it.each(PORTAS.map((p) => [p.efeito, p] as const))(
    '`%s` mora só na(s) dona(s) declarada(s), e o número de vezes é o declarado',
    (_efeito, porta) => {
      const achado: Record<string, number> = {}
      for (const f of todas) {
        const n = ocorrencias(codigoVivo(f), porta.padrao)
        if (n > 0) achado[f] = n
      }
      expect(achado, `${porta.efeito} mudou de dono ou de número de statements`).toEqual(porta.donas)
    },
  )

  it('toda porta tem dona que DE FATO carrega o efeito (senão a trava vigia o nada)', () => {
    // A metade que ninguém lembra de escrever: se as donas deixassem de ter o efeito,
    // "ninguém mais tem" continuaria verde — e estaria provando o oposto do que se quer.
    for (const porta of PORTAS) {
      for (const [dona, vezes] of Object.entries(porta.donas)) {
        expect(ocorrencias(codigoVivo(dona), porta.padrao), `${dona} perdeu ${porta.efeito}`).toBe(vezes)
      }
    }
  })

  it('nenhuma peça tem DML além das portas declaradas para ela', () => {
    // O complemento das asserções acima (achado da revisão adversarial desta fase): elas
    // provam onde os TRÊS efeitos vigiados moram, mas um quarto efeito — um `insert` numa
    // tabela que ninguém declarou, dentro de uma auxiliar impura — passaria por todas.
    // Aqui o TOTAL de DML de cada peça tem de bater com a soma das portas dela.
    const contarDml = (texto: string) =>
      ocorrencias(texto, /\binsert\s+into\b/gi) +
      ocorrencias(texto, /\bupdate\s+[a-z_.]+\s+set\b/gi) +
      ocorrencias(texto, /\bdelete\s+from\b/gi)
    for (const f of todas) {
      const declarado = PORTAS.reduce((soma, p) => soma + (p.donas[f] ?? 0), 0)
      expect(contarDml(codigoVivo(f)), `${f} tem DML fora das portas declaradas`).toBe(declarado)
    }
  })

  it('a orquestradora trava a linha e NÃO escreve nada', () => {
    const corpo = codigoVivo(ORQUESTRADORA)
    expect(corpo).toMatch(/select\s+\*\s+into\s+v_ativo\s+from\s+public\.ativos\s+where\s+id\s*=\s*new\.ativo_id\s+for\s+update/i)
    expect(corpo, 'a orquestradora voltou a escrever por conta própria — a decomposição foi desfeita').not.toMatch(
      QUALQUER_DML,
    )
  })

  it.each(PURAS.map((a) => [nomeSimples(a), a] as const))(
    'a pura `%s` não tem DML nenhum (ela vive dentro do SET de um UPDATE)',
    (_nome, assinatura) => {
      expect(codigoVivo(assinatura)).not.toMatch(QUALQUER_DML)
    },
  )
})

describe('3. a orquestradora alcança cada auxiliar pelo NOME', () => {
  // A auxiliar órfã é o modo realista de uma decomposição apodrecer: alguém reescreve uma
  // peça, esquece de chamar outra, e o SQL continua válido. Aqui a pergunta é de ALCANCE —
  // as duas puras são chamadas pelas auxiliares de UPDATE, não pela orquestradora —, então
  // o grafo de chamadas é percorrido a partir dela.
  it('toda auxiliar é alcançável a partir da orquestradora', () => {
    const corpos = new Map<string, string>(
      [ORQUESTRADORA, ...AUXILIARES].map((f) => [nomeSimples(f), codigoVivo(f)]),
    )
    const alcancadas = new Set<string>()
    const fila = [nomeSimples(ORQUESTRADORA)]
    while (fila.length) {
      const atual = fila.shift()!
      for (const aux of AUXILIARES.map(nomeSimples)) {
        if (!alcancadas.has(aux) && corpos.get(atual)!.includes(`public.${aux}(`)) {
          alcancadas.add(aux)
          fila.push(aux)
        }
      }
    }
    const orfas = AUXILIARES.map(nomeSimples).filter((a) => !alcancadas.has(a))
    expect(orfas, `auxiliar órfã: existe, e ninguém a partir do gatilho a chama — ${orfas.join(', ')}`).toEqual([])
  })

  it('a orquestradora chama os dois ramos e a abertura de pendência de item diretamente', () => {
    const corpo = codigoVivo(ORQUESTRADORA)
    for (const nome of ['movimentacao_estornar', 'movimentacao_transicionar', 'movimentacao_abrir_pendencias_item']) {
      expect(corpo, `a orquestradora não chama ${nome}`).toContain(`public.${nome}(`)
    }
  })
})

describe('4. a trava não mente (guardas do próprio teste)', () => {
  it('a lista não tem repetido nem a própria orquestradora, e tem as SEIS', () => {
    expect(new Set(AUXILIARES).size).toBe(AUXILIARES.length)
    expect(AUXILIARES as readonly string[]).not.toContain(ORQUESTRADORA)
    expect(AUXILIARES.length).toBe(6)
  })

  it('o leitor NÃO ignora o código e IGNORA o comentário', () => {
    // As duas direções: o efeito real é visto, e a menção em comentário não conta. O
    // cabeçalho da 0150 cita `update public.ativos` e as auxiliares em prosa.
    expect(codigoVivo('public.movimentacao_transicionar(public.movimentacoes, public.ativos)')).toMatch(
      /update\s+public\.ativos/i,
    )
    expect(limpar('  -- update public.ativos set status = 1')).not.toMatch(QUALQUER_DML)
  })

  it('LITERAL DE TEXTO não esconde código nem finge referência', () => {
    // (1) `--` DENTRO de um literal não pode cortar o código que vem depois.
    expect(limpar(`  v := 'a--b'; delete from public.pendencias_item where false;`)).toMatch(
      /delete\s+from\s+public\.pendencias_item/,
    )
    // (2) o NOME de uma auxiliar dentro de um literal não vale como chamada.
    expect(limpar(`  raise notice 'public.movimentacao_estornar( skip';`)).not.toContain(
      'public.movimentacao_estornar(',
    )
    // (3) o `''` escapado não desalinha o casamento de aspas.
    expect(limpar(`  v := 'o''brien'; delete from public.pendencias_item where false;`)).toMatch(
      /delete\s+from\s+public\.pendencias_item/,
    )
  })

  it('o padrão de DML pega as três formas e não pega o SELECT … FOR UPDATE', () => {
    expect('insert into public.x (a) values (1)').toMatch(QUALQUER_DML)
    expect('update public.ativos set status = 1').toMatch(QUALQUER_DML)
    expect('delete from public.x where true').toMatch(QUALQUER_DML)
    expect('select * into v from public.ativos where id = 1 for update').not.toMatch(QUALQUER_DML)
  })
})

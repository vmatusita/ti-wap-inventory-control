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
// A TRAVA DA F51 — na cadeia do import, `delete from public.ativos` mora numa
// função SÓ, e a orquestradora referencia as auxiliares pelo nome.
// =============================================================================
// POR QUE ELA EXISTE
//
// O import de startup é a operação mais destrutiva do sistema: ele apaga o acervo
// inteiro de uma filial e o recria a partir do plano. Até a F51 isso vivia numa
// função de 393 linhas, reescrita INTEIRA a cada mudança — 11 cópias integrais na
// cadeia de migrations (dívida técnica, item X). A F51 quebrou a função em oito
// auxiliares nomeadas, e a promessa que ela faz é: **uma só delas apaga**.
//
// Esta suíte transforma essa promessa de intenção em invariante conferida a cada
// `npm run test`, SEM BANCO. Sem ela, a próxima fase que mexer no import pode
// espalhar o DELETE por duas auxiliares e ninguém fica sabendo até alguém ler as
// 400 linhas de novo — que é precisamente o custo que a decomposição pagou para
// eliminar.
//
// ⚠ A INVARIANTE É ESCOPADA À CADEIA DO IMPORT, E O MOTIVO NÃO É CONVENIÊNCIA.
//
// Escrita na forma GLOBAL ("só uma função no sistema inteiro apaga de
// public.ativos"), ela nasceria VERMELHA por causa de quatro lugares MEDIDOS e
// inteiramente legítimos, que nada têm a ver com o import:
//
//   1. `apagar_ativo`                    — vigente em 0082_dev_apagar.sql:198
//   2. `resetar_acervo`                  — vigente em 0089_reset_backup_do_recorte.sql:206
//   3. `resetar_dados_ficticios`         — vigente em 0090_guarda_furos_revisao.sql:87
//   4. `apagar_ativos_conflito_filiais`  — vigente em 0100_conflito_lock_e_backup.sql:346
//
// São as ferramentas da Zona destrutiva (F23) e a mesa de conflitos entre filiais
// (F24) — cada uma com backup obrigatório, justificativa e trilha na mesma
// transação. Um gate que nasce vermelho por motivo legítimo é um gate que alguém
// desliga (asserção da F48), então a régua correta é a que separa a cadeia do
// import do resto do sistema — e é essa que está escrita aqui.
//
// ⚠ MEDIÇÃO: a ordem de serviço da fase falava em CINCO lugares, listando
// `resetar_itens` entre eles. São QUATRO. `resetar_itens` nunca apagou de
// `public.ativos` em versão nenhuma — ela mexe em `lancamentos_item`, que é saldo
// por quantidade, não acervo. O nome engana quem lê rápido; o corpo, não.
//
// ⚠ ASSERÇÃO SOBRE ESTRUTURA, NUNCA SOBRE TAMANHO. Nada de teto de
// `length(pg_get_functiondef(...))` nem de contagem de linhas: um comentário novo
// derrubaria a trava sem que nada de errado tivesse acontecido, e a fase seguinte
// aprenderia a afrouxá-la.
//
// ⚠ O QUE ELA NÃO PROVA. Ela lê o TEXTO das migrations, não o banco. O que está
// no ar é o que o apply pôs lá; quem responde por isso é a verificação pós-apply
// do `RUNBOOK-BANCO.md` §5. Esta trava responde por outra pergunta, e ela é a que
// não tem quem responda: "o repositório continua descrevendo uma porta só?".
//
// REUSO, EM VEZ DE UMA QUINTA REIMPLEMENTAÇÃO. `corpoVigente()` vem de
// `scripts/db/corpo-vigente.mjs`, cujo cabeçalho diz por escrito que existe para
// esta fase. Os quatro validadores irmãos (`transicoes-sql`, `detentor-sql`,
// `tipos-item-sql`, e o `migrations-lock` por outro caminho) reimplementam o
// resolvedor inline, cada um o seu. Reimplementar de novo criaria a segunda fonte
// do mesmo fato — que é como um gate morre. Medido antes de escolher: o import
// relativo de `.mjs` a partir de `src/` passa em `npx tsc --noEmit` e no Vitest.
// =============================================================================

/** O comando destrutivo que esta trava vigia, na forma exata em que o código o escreve. */
const DELETE_DE_ATIVOS = 'delete from public.ativos'

/** A função de topo — a que `src/lib/actions/importar.ts:423` chama por RPC. */
const ORQUESTRADORA = 'public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)'

/**
 * A CADEIA DO IMPORT, nomeada uma a uma. Lista literal e não prefixo `import_%`:
 * um prefixo abraçaria qualquer função futura que alguém batizasse assim, e a
 * trava passaria a proteger um conjunto que ninguém decidiu.
 */
const AUXILIARES = [
  'public.import_validar_plano(jsonb, text, jsonb, smallint)',
  'public.import_revalidar_contagens(jsonb, smallint)',
  'public.import_apagar_acervo_filial(smallint)',
  'public.import_criar_ativos(jsonb, smallint)',
  'public.import_lancar_movimentacoes(uuid, jsonb, smallint, uuid, date, text)',
  'public.import_conferir_resultado(jsonb, smallint, integer, integer)',
  'public.import_contar_conflitos(smallint)',
  'public.import_gravar_trilha(jsonb, smallint, text, jsonb, uuid, integer, integer, integer, integer, integer)',
] as const

/** A ÚNICA da cadeia autorizada a conter o DELETE. */
const A_PORTA = 'public.import_apagar_acervo_filial(smallint)'

/** Só o nome, sem esquema e sem tipos — para casar referência dentro de um corpo. */
function nomeSimples(assinatura: string): string {
  return assinatura.replace(/^public\./, '').replace(/\(.*$/, '')
}

/**
 * O corpo vigente reduzido ao **código que executa**: sem literais de texto e sem
 * comentários de linha.
 *
 * ⚠ A ORDEM DAS DUAS LIMPEZAS IMPORTA, e ignorá-la deixava a trava CEGA. A
 * revisão adversarial desta fase demonstrou os dois furos editando a `0131` de
 * verdade e vendo os 31 testes passarem:
 *
 *   · `v_sonda := 'a--b'; delete from public.ativos where false;` — o `--` mora
 *     DENTRO de um literal. Cortar a linha no primeiro `--` escondia o `delete`
 *     REAL que vinha depois, na mesma linha: uma segunda porta destrutiva no
 *     corpo, e a suíte verde.
 *   · `raise notice 'import_conferir_resultado(…) skip debug';` no lugar da
 *     chamada real — o nome da auxiliar dentro de uma STRING satisfazia o
 *     `toContain` do describe 3, e a auxiliar órfã passava. Isso atingia em cheio
 *     a premissa da Decisão 3 ("uma chamada esquecida derruba `npm run test`").
 *
 * Então: **primeiro somem os literais** (`'…'`, com o `''` escapado tratado), e só
 * depois some o `--` até o fim da linha. Nome de função dentro de texto deixa de
 * contar como referência; `--` dentro de texto deixa de cortar código.
 *
 * Tirar os comentários continua sendo necessário na outra direção: o corpo da
 * orquestradora CITA `delete from public.ativos` em comentário para explicar o
 * que a auxiliar faz, e um grep cru leria isso como código.
 */
function codigoVivo(assinatura: string): string {
  const { sql } = corpoVigente(assinatura)
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .split('\n')
    .map((linha) => linha.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Todo nome `import_*` que as migrations DEFINEM — o detector que alimenta a
 * conferência nos dois sentidos. Lê definições de verdade (`create [or replace]
 * function`), não menções em comentário, `grant` ou `revoke`.
 */
function auxiliaresDefinidasNasMigrations(): string[] {
  const nomes = new Set<string>()
  for (const arquivo of listarMigrations()) {
    const sql = readFileSync(join(process.cwd(), ...PASTA_MIGRATIONS, arquivo), 'utf8')
    for (const d of definicoesDeFuncao(sql)) {
      if (d.esquema === 'public' && d.nome.startsWith('import_')) nomes.add(d.nome)
    }
  }
  return [...nomes].sort()
}

describe('1. a cadeia do import existe e está inteira', () => {
  it('há migrations para varrer (guarda do próprio teste)', () => {
    // Sem isto, uma pasta vazia faria todas as asserções abaixo passarem por
    // vacuidade — a tautologia que a ferramenta de asserções da F45 existe para matar.
    expect(listarMigrations().length).toBeGreaterThan(100)
  })

  it('a orquestradora existe, com a assinatura de 4 argumentos', () => {
    expect(() => corpoVigente(ORQUESTRADORA)).not.toThrow()
  })

  it('a lista classifica EXATAMENTE as `import_*` que as migrations definem', () => {
    // A SIMETRIA, no molde do `catalogo_secdef.sql`, e numa asserção só:
    //   · auxiliar nova que ninguém declarou aqui  → sobra na direita, reprova;
    //   · nome declarado que sumiu das migrations  → sobra na esquerda, reprova;
    //   · item removido da lista sem sumir do SQL  → reprova.
    //
    // O terceiro caso é o que a revisão adversarial MEDIU: remover um item que não
    // fosse `A_PORTA` fazia a suíte cair de 31 para 28 testes, TODOS VERDES — a
    // auxiliar deixava de ser checada em três lugares e nada acusava a perda de
    // cobertura. Sem esta linha, `AUXILIARES` seria documentação, não classificação.
    expect(AUXILIARES.map(nomeSimples).sort()).toEqual(auxiliaresDefinidasNasMigrations())
  })

  it.each(AUXILIARES.map((a) => [nomeSimples(a), a] as const))(
    'a auxiliar `%s` existe em alguma migration',
    (_nome, assinatura) => {
      expect(() => corpoVigente(assinatura)).not.toThrow()
    },
  )
})

describe('2. uma porta só: `delete from public.ativos` na cadeia do import', () => {
  it('a auxiliar autorizada CONTÉM o delete (senão a trava vigia o nada)', () => {
    // A metade que ninguém lembra de escrever. Se `import_apagar_acervo_filial`
    // deixasse de apagar, as asserções de baixo continuariam verdes — e estariam
    // provando que ninguém apaga, que é o oposto do que se quer saber.
    expect(codigoVivo(A_PORTA)).toContain(DELETE_DE_ATIVOS)
  })

  it('a orquestradora NÃO contém o delete', () => {
    expect(
      codigoVivo(ORQUESTRADORA),
      'a orquestradora voltou a apagar acervo por conta própria — a decomposição da F51 foi desfeita',
    ).not.toContain(DELETE_DE_ATIVOS)
  })

  it.each(AUXILIARES.filter((a) => a !== A_PORTA).map((a) => [nomeSimples(a), a] as const))(
    'a auxiliar `%s` NÃO contém o delete',
    (nome, assinatura) => {
      expect(
        codigoVivo(assinatura),
        `${nome} passou a apagar acervo: a cadeia do import tem DUAS portas, e a promessa da F51 é uma`,
      ).not.toContain(DELETE_DE_ATIVOS)
    },
  )

  it('exatamente UMA função da cadeia contém o delete', () => {
    // A forma agregada, que pega o caso que as asserções individuais não pegam:
    // alguém acrescenta uma auxiliar nova à lista E ao SQL, com o delete dentro.
    const comDelete = [ORQUESTRADORA, ...AUXILIARES].filter((a) =>
      codigoVivo(a).includes(DELETE_DE_ATIVOS),
    )
    expect(comDelete.map(nomeSimples)).toEqual([nomeSimples(A_PORTA)])
  })
})

describe('3. a orquestradora referencia cada auxiliar pelo NOME', () => {
  // A auxiliar órfã é o modo realista de esta decomposição apodrecer: alguém
  // reescreve a orquestradora, esquece de chamar uma das oito, e o SQL continua
  // válido — a função órfã simplesmente nunca roda. A conferência pós-insert é a
  // vítima natural (ela não lança no caminho feliz, então nenhum roteiro acusa).
  const corpo = () => codigoVivo(ORQUESTRADORA)

  it.each(AUXILIARES.map((a) => [nomeSimples(a), a] as const))(
    'a orquestradora chama `%s`',
    (nome) => {
      expect(
        corpo(),
        `a orquestradora não menciona ${nome} em lugar nenhum — auxiliar órfã: ela existe, ninguém a chama`,
      ).toContain(nome)
    },
  )
})

describe('4. a trava não mente (guardas do próprio teste)', () => {
  it('o leitor de corpo IGNORA comentário de linha', () => {
    // Se não ignorasse, a asserção 2 quebraria no dia em que a orquestradora
    // explicasse em comentário o que a auxiliar faz — falso vermelho, que é o
    // jeito mais rápido de um gate ser desligado.
    const { sql } = corpoVigente(A_PORTA)
    expect(sql).toContain(DELETE_DE_ATIVOS)
  })

  it('o leitor de corpo NÃO ignora o código', () => {
    // O contrário do de cima: um filtro guloso demais (que apagasse a linha
    // inteira ao ver `--`) esconderia o próprio delete e deixaria tudo verde.
    const limpo = codigoVivo(A_PORTA)
    expect(limpo).toContain(DELETE_DE_ATIVOS)
    expect(limpo).toContain('delete from public.movimentacoes')
  })

  it('a lista de auxiliares não tem repetido nem a própria orquestradora', () => {
    expect(new Set(AUXILIARES).size).toBe(AUXILIARES.length)
    expect(AUXILIARES).not.toContain(ORQUESTRADORA)
    expect(AUXILIARES).toContain(A_PORTA)
    // A decomposição da F51 tem OITO auxiliares. Não substitui a conferência de
    // conjunto do describe 1 — torna a intenção legível e pega o caso degenerado
    // de a lista e o SQL encolherem juntos.
    expect(AUXILIARES.length).toBe(8)
  })

  it('LITERAL DE TEXTO não esconde código nem finge referência (as duas evasões medidas)', () => {
    // As duas foram demonstradas na revisão adversarial editando a `0131` de
    // verdade e vendo os 31 testes passarem. Sem estas asserções, a correção de
    // `codigoVivo` seria indistinguível de não ter corrigido nada.
    const limpa = (sql: string) =>
      sql
        .replace(/'(?:[^']|'')*'/g, "''")
        .split('\n')
        .map((l) => l.replace(/--.*$/, ''))
        .join('\n')

    // (1) `--` DENTRO de um literal não pode cortar o código que vem depois.
    expect(
      limpa(`  v_sonda := 'a--b'; ${DELETE_DE_ATIVOS} where false;`),
      'o delete real ficou invisível atrás de um -- dentro de string',
    ).toContain(DELETE_DE_ATIVOS)

    // (2) o NOME de uma auxiliar dentro de um literal não vale como referência.
    expect(
      limpa(`  raise notice 'import_conferir_resultado(…) skip debug';`),
      'nome em string contou como chamada — a auxiliar órfã passaria',
    ).not.toContain('import_conferir_resultado')

    // (3) o comentário de verdade continua descartado (a direção original).
    expect(limpa(`  -- ${DELETE_DE_ATIVOS} fica na auxiliar`)).not.toContain(DELETE_DE_ATIVOS)

    // (4) o `''` escapado não desalinha o casamento de aspas.
    expect(limpa(`  v := 'o''brien'; ${DELETE_DE_ATIVOS} where false;`)).toContain(DELETE_DE_ATIVOS)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { comandosDoTexto } from '../../../scripts/db/classificar-migration.mjs'
import { listarMigrations } from '../../../scripts/db/corpo-vigente.mjs'
import { lerExcecoesDoCatalogo } from '../../../scripts/db/predicado-policies.mjs'
import { lerExcecoesDeRecorte } from '../../../scripts/db/recorte-rel.mjs'

// A TRAVA DE MESA DOS CATÁLOGOS DE SEGURANÇA — F48. RODA SEM BANCO, e é essa a razão
// de ela existir.
//
// A mesa do Johnny não tem Postgres nem Docker (RELATORIO-F46.md §2.1, reconfirmado na
// F47 e de novo nesta fase por winget + disco + PATH). Consequência dura: os três
// roteiros novos NÃO se ensaiam aqui — o ciclo é commit → push → ler o job
// `banco-sem-docker`. Cada calibragem custa um ciclo de CI.
//
// Esta suíte é o que faz o ciclo SEGUINTE custar zero push. Ela lê os `.sql` como
// TEXTO e cobra as invariantes que não precisam de banco para serem verdadeiras: que
// os arquivos existem, que emitem a linha `FIM`, que não reintroduzem a isenção por
// prefixo que a F47 arrancou, que toda exceção nominal vem com motivo e migration, e
// que a Decisão 2 (uma fonte por fato) continua valendo.
//
// O que ela NÃO faz: provar que as asserções são VERDADEIRAS contra o banco. Isso só o
// `banco-sem-docker` responde, e é o trabalho de `npm run db:test`.
//
// Mesma técnica de `migrations-lock.test.ts`, `tipos-item-sql.test.ts` e
// `detentor-sql.test.ts`: deriva do próprio SQL, nunca de uma cópia em TypeScript.

const RAIZ = process.cwd()
const PASTA = join(RAIZ, 'supabase', 'tests')

/** Os três roteiros que a F48 acrescenta. */
const NOVOS = ['catalogo_policies', 'catalogo_secdef', 'isolamento_tenant'] as const

function fonte(nome: string): string {
  return readFileSync(join(PASTA, `${nome}.sql`), 'utf8')
}

/**
 * O SQL sem os comentários de linha.
 *
 * ⚠ A distinção não é frescura, e é a mesma que `mutacoes.test.mts` faz: metade das
 * regras abaixo é sobre o que o roteiro EXECUTA, e a outra metade é sobre o que ele
 * DOCUMENTA. Confundir as duas é como se escreve um teste que reprova o comentário
 * certo — foi assim que uma regra parecida quase reprovou a mutação de `import` na
 * F47, porque a função tem `delete from` no corpo de propósito.
 */
function semComentarios(sql: string): string {
  return sql
    .split('\n')
    .map((l) => (/^\s*--/.test(l) ? '' : l))
    .join('\n')
}

describe('1. os três roteiros novos existem e seguem o molde do runner', () => {
  it.each(NOVOS)('%s.sql existe', (nome) => {
    expect(existsSync(join(PASTA, `${nome}.sql`)), `supabase/tests/${nome}.sql não existe`).toBe(
      true,
    )
  })

  it.each(NOVOS)('%s emite UMA linha `FIM` no molde da F45, fechando o bloco', (nome) => {
    // Espelha o describe 6 de `ci-passos.test.ts`, e de propósito: ali a varredura é
    // genérica sobre a pasta; aqui ela é nominal sobre os três desta fase. Se um deles
    // for renomeado ou apagado, o teste genérico não nota (a pasta continua conforme) e
    // este aqui acusa pelo nome.
    const linhas = fonte(nome).split('\n')
    const alvo = `raise notice 'FIM ${nome}: % asserções, % falhas', v_ok + v_falhas, v_falhas;`
    const i = linhas.findIndex((l) => l.includes(alvo))
    expect(i, `${nome}.sql: sem a linha FIM no molde da F45`).toBeGreaterThan(-1)
    expect(
      linhas.filter((l) => l.includes(`'FIM ${nome}:`)).length,
      `${nome}.sql: mais de uma linha FIM — o runner lê a ÚLTIMA e o número sairia errado`,
    ).toBe(1)
    expect(
      (linhas[i + 1] ?? '').trim(),
      `${nome}.sql: a linha FIM tem de fechar o bloco`,
    ).toMatch(/^end(\s*\$\$;)?$/)
  })

  it.each(NOVOS)('%s conta asserções de verdade (v_ok/v_falhas declarados)', (nome) => {
    // O runner REPROVA roteiro que declare zero asserção. Um arquivo que tenha a linha
    // FIM mas nunca incremente os contadores emitiria "0 asserções" e seria reprovado
    // no CI — este teste o pega na mesa.
    const sql = semComentarios(fonte(nome))
    expect(sql, `${nome}.sql: não declara v_ok`).toMatch(/v_ok\s+int\s*:=\s*0/)
    expect(sql, `${nome}.sql: não declara v_falhas`).toMatch(/v_falhas\s+int\s*:=\s*0/)
    expect(
      (sql.match(/v_ok\s*:=\s*v_ok\s*\+\s*1/g) ?? []).length,
      `${nome}.sql: nenhuma asserção incrementa v_ok — ele contaria 0 e o runner reprovaria`,
    ).toBeGreaterThanOrEqual(4)
  })
})

describe('2. nenhuma isenção por PREFIXO — a regressão exata que a F47 arrancou', () => {
  // Havia em `seguranca_catalogo.sql` um `and left(c.relname, 1) <> '_'`, SEM motivo
  // escrito, e ele era a categoria por onde qualquer backup futuro escapava: uma tabela
  // nascida `_scratch` sem RLS não era cobrada por asserção nenhuma. Quatro tabelas `_`
  // já existiram. A F47 removeu a isenção; esta suíte impede que ela volte por uma porta
  // nova — e as portas novas são justamente os três arquivos desta fase.
  const FORMAS = [
    { rotulo: "left(<coluna>, 1) <> '_'", re: /left\s*\(\s*[a-z_.]+\s*,\s*1\s*\)\s*(<>|!=|=)/i },
    { rotulo: "like '\\_%' / not like '\\_%'", re: /(not\s+)?i?like\s*'\s*\\?_%/i },
    { rotulo: 'substring(<coluna>, 1, 1)', re: /substr(ing)?\s*\(\s*[a-z_.]+\s*,\s*1\s*,\s*1\s*\)/i },
    { rotulo: "starts_with(<coluna>, '_')", re: /starts_with\s*\(\s*[a-z_.]+\s*,\s*'_'/i },
    { rotulo: "relname ~ '^_'", re: /~\s*'\^\\?_/ },
  ]

  const pares = NOVOS.flatMap((n) => FORMAS.map((f) => [n, f.rotulo, f.re] as const))

  it.each(pares)('%s não usa a forma `%s`', (nome, rotulo, re) => {
    // Só o SQL EXECUTÁVEL: o cabeçalho CITA a isenção antiga de propósito, para explicar
    // por que ela saiu, e reprovar o comentário seria reprovar a documentação certa.
    expect(
      semComentarios(fonte(nome)),
      `${nome}.sql reintroduziu a isenção por prefixo (${rotulo}) — é a regressão da F47`,
    ).not.toMatch(re)
  })

  it('o casador sabe reprovar (guarda do próprio teste)', () => {
    // Sem esta guarda, um regex quebrado deixaria os 15 casos acima passarem por vazio.
    const sabotado = "where n.nspname = 'public' and left(c.relname, 1) <> '_'"
    expect(FORMAS.some((f) => f.re.test(sabotado))).toBe(true)
    const limpo = "where n.nspname = 'public' and c.relkind in ('r', 'p')"
    expect(FORMAS.some((f) => f.re.test(limpo))).toBe(false)
  })
})

describe('3. toda exceção NOMINAL vem com motivo escrito e a migration que a criou', () => {
  /**
   * Os ARRAYS de exceção — e o ponto é que os NOMES saem do SQL, não daqui.
   *
   * ⚠ A PRIMEIRA VERSÃO DESTE BLOCO LISTAVA OS QUATRO NOMES À MÃO, e uma sabotagem da
   * própria fase a derrubou: acrescentar um nome novo a `k_sem_select` sem motivo
   * nenhum passava verde, porque o teste só olhava os quatro que ele já conhecia. Era
   * o defeito que esta fase existe para não ter — uma lista escrita à mão fingindo ser
   * derivada. Agora só o NOME DO ARRAY é escrito aqui; o conteúdo se lê do `.sql`, e
   * entrada nova entra automaticamente na cobrança.
   */
  const ARRAYS: { arquivo: string; array: string }[] = [
    { arquivo: 'catalogo_policies', array: 'k_sem_select' },
    { arquivo: 'catalogo_secdef', array: 'k_invoker_anon' },
    // F50 — `k_invoker_anon` ESVAZIOU (a 0129 revogou o EXECUTE de `anon` das cinco),
    // e os cinco nomes migraram para `k_invoker_revogadas`, que a asserção 6c vigia.
    // Ele entra aqui porque é a MESMA classe de declaração nominal: uma lista de
    // nomes que precisa dizer, por escrito e com procedência, por que cada um está
    // lá. Sem esta entrada, a guarda "há exceções para conferir" cairia de 8 para 3 e
    // acusaria — corretamente — que a varredura passou a olhar quase nada.
    { arquivo: 'catalogo_secdef', array: 'k_invoker_revogadas' },
  ]
  // F60 — `k_excecoes_recorte` (bloco 7 de `catalogo_secdef.sql`) NÃO entra nesta
  // lista: o formato dela é INLINE (motivo/migration/destino na MESMA linha do
  // literal, "'nome', -- NNNN · motivo: … · destino: …") — o mesmo formato de
  // `k_excecoes_predicado`, que por isso também está FORA de `ARRAYS` e ganha o
  // describe 11 abaixo, com `lerExcecoesDeRecorte`. `linhaComMotivoEProcedencia`
  // exige uma linha que COMECE com `--` (comentário PRÓPRIO, separado do literal)
  // — a forma de `k_sem_select`/`k_invoker_anon`/`k_invoker_revogadas`; testar
  // isso contra o formato inline reprovaria por incompatibilidade de convenção,
  // não por ausência de procedência (medido nesta sessão).

  /** Os literais de um `<nome> text[] := array[ … ];` do roteiro. */
  function nomesDoArray(arquivo: string, array: string): string[] {
    const m = new RegExp(`${array}\\s+text\\[\\]\\s*:=\\s*array\\[([\\s\\S]*?)\\];`).exec(
      fonte(arquivo),
    )
    if (!m) throw new Error(`${arquivo}.sql: não achei o array ${array}`)
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }

  /**
   * A régua do "motivo escrito COM procedência": existe uma LINHA DE COMENTÁRIO que
   * cita o nome, tem prosa de verdade (>40 caracteres) E traz o número de uma
   * migration. As três condições na MESMA linha, de propósito — exigi-las só "no mesmo
   * bloco" deixava a segunda sabotagem passar, porque qualquer outro número de
   * migration do bloco satisfazia qualquer nome dele.
   */
  function linhaComMotivoEProcedencia(arquivo: string, nome: string): string | undefined {
    return fonte(arquivo)
      .split('\n')
      .find(
        (l) =>
          /^\s*--/.test(l) &&
          l.includes(nome) &&
          /\b\d{4}\b/.test(l) &&
          l.replace(/^\s*--\s*/, '').replace(nome, '').length > 40,
      )
  }

  const pares = ARRAYS.flatMap((a) =>
    nomesDoArray(a.arquivo, a.array).map((n) => [a.arquivo, a.array, n] as const),
  )

  it('há exceções para conferir (guarda do próprio teste)', () => {
    expect(pares.length, 'a leitura dos arrays de exceção voltou vazia').toBeGreaterThanOrEqual(8)
  })

  it.each(pares)('%s / %s: a exceção `%s` tem motivo escrito E a migration na mesma linha', (arquivo, array, nome) => {
    expect(
      linhaComMotivoEProcedencia(arquivo, nome),
      `${arquivo}.sql: "${nome}" está em ${array} sem uma linha de comentário que diga POR QUÊ e cite a migration que a criou — isenção sem procedência é isenção disfarçada (ordem F48)`,
    ).toBeDefined()
  })

  /** As quatro cuja migration a ordem F48 nomeia — aqui a procedência é conferida por NÚMERO. */
  const NOMEADAS: { arquivo: string; nome: string; migration: string }[] = [
    { arquivo: 'catalogo_policies', nome: 'senhas_acesso', migration: '0012' },
    { arquivo: 'catalogo_policies', nome: 'senha_tentativas', migration: '0025' },
    { arquivo: 'catalogo_policies', nome: 'ambiente', migration: '0090' },
    { arquivo: 'catalogo_secdef', nome: 'valida_lancamento_item', migration: '0038' },
  ]

  it.each(NOMEADAS.map((e) => [e.arquivo, e.nome, e.migration] as const))(
    '%s: a exceção `%s` cita nominalmente a migration %s',
    (arquivo, nome, migration) => {
      const linhas = fonte(arquivo).split('\n')
      const bloco = linhas.filter((l) => /^\s*--/.test(l) && l.includes(nome))
      expect(bloco.length, `${arquivo}.sql não comenta ${nome}`).toBeGreaterThan(0)
      expect(
        bloco.join('\n'),
        `${arquivo}.sql: a exceção de ${nome} não cita a migration ${migration} que a criou`,
      ).toContain(migration)
    },
  )

  it('a régua sabe reprovar os três casos que ela cobre (guarda do próprio teste)', () => {
    const regua = (l: string, nome: string) =>
      /^\s*--/.test(l) &&
      l.includes(nome) &&
      /\b\d{4}\b/.test(l) &&
      l.replace(/^\s*--\s*/, '').replace(nome, '').length > 40
    // completa — passa
    expect(
      regua("--   · ambiente (0090) — marcador de DEPLOY, e nada no app lê esta tabela.", 'ambiente'),
    ).toBe(true)
    // sem migration — reprova
    expect(
      regua("--   · ambiente — marcador de DEPLOY, e nada no app lê esta tabela nunca.", 'ambiente'),
    ).toBe(false)
    // sem prosa — reprova
    expect(regua('--   · ambiente (0090)', 'ambiente')).toBe(false)
    // não é comentário — reprova
    expect(regua("  k_x text[] := array['ambiente']; -- 0090 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 'ambiente')).toBe(false)
  })
})

describe('4. cada catálogo lê a superfície que promete ler', () => {
  // Um catálogo que não cite a visão do catálogo não está derivando de nada — está
  // afirmando. Estas asserções são baratas e pegam o erro mais caro: o arquivo certo
  // medindo a coisa errada.
  const EXIGIDOS: { arquivo: string; termos: string[] }[] = [
    {
      arquivo: 'catalogo_policies',
      termos: [
        'pg_policies', // as policies de public E de storage
        'pg_publication_tables', // o Realtime
        'pg_publication', // a existência da publication
        "'storage'", // o outro schema
        'supabase_realtime',
        'relforcerowsecurity', // R-ACC-29, o par executável da regra
        'papel_atual', // o piso congelado
        'bucket_id', // a forma proibida de Storage
      ],
    },
    {
      arquivo: 'catalogo_secdef',
      termos: [
        'prosecdef', // o conjunto sai daqui, nunca de uma lista
        'proconfig', // o search_path, lido do EFEITO e não da grafia
        'has_function_privilege', // o alcance de anon
        "'anon'",
        'valida_lancamento_item', // a exceção nominal que impede o ✗ permanente
        'p_filiais', // F60 bloco 7 — o parâmetro de recorte obrigatório das rel_*
        'proargnames', // F60 — onde o nome do parâmetro é lido, sem parsear texto
        'prosrc', // F60 — a prova (fraca, declarada) sobre o corpo em texto
        'proargtypes', // F60 (revisão adversarial) — o fallback quando proallargtypes é nulo (sem `returns table`)
      ],
    },
    {
      arquivo: 'isolamento_tenant',
      termos: [
        'grant select on', // o bloco de grants espelhado
        'grant insert, update, delete on', // idem, do lado da escrita
        'grant update (primeiro_nome, sobrenome)', // o grant de COLUNA da 0063
        'rolbypassrls', // a prova de que "viu zero" quer dizer algo
        'has_table_privilege', // o bloco de grants MEDIDO, não presumido
        'set local role authenticated', // a troca de identidade
      ],
    },
  ]

  const pares = EXIGIDOS.flatMap((e) => e.termos.map((t) => [e.arquivo, t] as const))

  it.each(pares)('%s cita `%s`', (arquivo, termo) => {
    expect(semComentarios(fonte(arquivo)), `${arquivo}.sql não cita ${termo}`).toContain(termo)
  })
})

describe('5. `isolamento_tenant` é honesto sobre o que ainda não sabe', () => {
  /**
   * O RECORTE: `empresa_id` comparado com um VALOR (`=`, `<>`, `!=`, `in`, `= any`, `is [not]
   * distinct from`). `is null` / `is not null` NÃO é recorte — é conferência de completude.
   */
  // Nos DOIS sentidos (revisão adversarial da F63): `a.empresa_id = v` e `v = a.empresa_id` são o mesmo recorte.
  // E com CAST na coluna, `not in`, `between` e comparação de ordem (2ª rodada): `a.empresa_id::text = v::text`
  // e `empresa_id not in (…)` escapavam. A régua é TEXTUAL — a coluna embrulhada numa função
  // (`coalesce(a.empresa_id, …) = v`) não é lida aqui; a trava do recorte no banco é o bloco 7 de
  // `empresa_no_acervo.sql`, que lê o catálogo.
  const CAST = String.raw`(?:\s*::\s*[a-z_][a-z0-9_]*(?:\s*\[\s*\])?)*`
  // E (3ª rodada) o parêntese em volta da coluna (`(a.empresa_id) = v`) e o equijoin implícito `join … using
  // (empresa_id)`, que compara a coluna das duas tabelas sem operador nenhum.
  const RECORTE = new RegExp(
    String.raw`\bempresa_id${CAST}(?:\s*\))*\s*(?:=|<>|!=|<=|>=|<|>|\bnot\s+in\b|\bin\b|\b(?:not\s+)?between\b|\bis\s+(?:not\s+)?distinct\s+from\b)` +
      String.raw`|(?:=|<>|!=|<=|>=|<|>|\bin\b|\bdistinct\s+from)\s*\(?\s*(?:[a-z_][a-z0-9_]*\.)?empresa_id\b` +
      String.raw`|\busing\s*\([^)]*\bempresa_id\b[^)]*\)`,
    'i',
  )

  it('vê a coluna do ACERVO só pelo CATÁLOGO — nenhum comando compara empresa_id de tabela de negócio com um valor (até a F66)', () => {
    // EMENDA F63 (23/09/2026 — decisão 10 do PLAN-F63). Até a F61 este teste reprovava QUALQUER
    // `empresa_id` em código; a F62 passou a permitir as tabelas DELA (`filiais`, `membros`,
    // `operador_filiais`) e proibia juntar a coluna com tabela de negócio, porque a coluna do
    // ACERVO ainda não existia. A F63 a criou nas oito de `k_lote1`, e a varredura 9k — que lê do
    // CATÁLOGO quais tabelas têm a coluna e confere `not null` + FK + nenhuma linha nula — passou
    // a vê-las SOZINHA, sem uma linha editada. A fronteira nova: VER a coluna pelo catálogo
    // (e contar a completude, `is null`) pode; LER O DADO do acervo por empresa — comparar a
    // coluna com um valor numa tabela de negócio que não seja `filiais` — é o recorte, e é da
    // F66. A lista de negócio vem de `k_negocio` (catalogo_policies.sql), a fonte única — nunca
    // copiada para cá. EMENDA F64 (23/09/2026, decisão 10 do PLAN-F64): a F64 pôs a coluna nas
    // onze de `k_lote2` — as 20 de negócio a têm —, e a régua NÃO muda: ela já comparava contra
    // `k_negocio` menos `filiais`, então as onze estavam no universo desde a F63. Ler o dado de
    // qualquer uma das 19 por empresa é o recorte, e continua sendo da F66.
    const cat = fonte('catalogo_policies')
    const m = /k_negocio text\[\] := array\[([\s\S]*?)\];/.exec(cat)
    expect(m, 'não achei k_negocio em catalogo_policies.sql').not.toBeNull()
    const acervo = [...m![1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).filter((t) => t !== 'filiais')
    expect(acervo.length, 'k_negocio veio vazio — o teste compararia com nada').toBeGreaterThan(10)
    // Os comandos pelo léxico único (2ª rodada): o `;` de dentro de um texto não parte o comando, o texto
    // entre aspas sai (o `attname = 'empresa_id'` do catálogo não é o recorte), e o corpo de função e de
    // `do` entra.
    const comandos = comandosDoTexto(fonte('isolamento_tenant')).filter((c) => /\bempresa_id\b/.test(c))
    expect(comandos.length, 'a seção 9 não cita empresa_id — os cenários A↔B sumiram?').toBeGreaterThan(0)
    const lendoOAcervo = comandos.filter((c) => acervo.some((t) => new RegExp(`public\\.${t}\\b`).test(c)) && RECORTE.test(c))
    expect(
      lendoOAcervo.map((c) => c.trim().slice(0, 160)),
      'isolamento_tenant.sql LÊ o acervo por empresa_id — o recorte do acervo é da F66',
    ).toEqual([])
  })

  it('a régua do recorte sabe reprovar, e distingue a completude (guarda do próprio teste)', () => {
    expect(RECORTE.test('select count(*) from public.ativos where empresa_id = v_emp_a')).toBe(true)
    expect(RECORTE.test('select 1 from public.itens i where i.empresa_id in (select 1)')).toBe(true)
    expect(RECORTE.test('where m.empresa_id <> v_emp_b')).toBe(true)
    expect(RECORTE.test('where t.empresa_id is distinct from v_emp')).toBe(true)
    // o valor à esquerda — a forma espelhada
    expect(RECORTE.test('select 1 from public.ativos a where v_emp_a = a.empresa_id')).toBe(true)
    expect(RECORTE.test('select 1 from public.ativos where v_emp <> empresa_id')).toBe(true)
    expect(RECORTE.test('select count(*) filter (where empresa_id is null) from public.ativos')).toBe(false)
    expect(RECORTE.test("a.attname = 'empresa_id' and not a.attisdropped")).toBe(false)
    // 2ª rodada: o cast na coluna, `not in`, `between`, a ordem, e o valor à esquerda entre parênteses
    expect(RECORTE.test('select 1 from public.ativos a where a.empresa_id::text = v_emp::text')).toBe(true)
    expect(RECORTE.test('where empresa_id :: uuid = v_emp')).toBe(true)
    expect(RECORTE.test('where t.empresa_id not in (select id from public.empresas)')).toBe(true)
    expect(RECORTE.test('where t.empresa_id between v_a and v_b')).toBe(true)
    expect(RECORTE.test('where t.empresa_id > v_a')).toBe(true)
    expect(RECORTE.test('where v_emp in (a.empresa_id)')).toBe(true)
    // 3ª rodada: o parêntese em volta da coluna, e o equijoin por `using`
    expect(RECORTE.test('where (a.empresa_id) = v_emp')).toBe(true)
    expect(RECORTE.test('select 1 from public.movimentacoes m join public.colaboradores c using (empresa_id)')).toBe(true)
    expect(RECORTE.test('join public.itens i using (id, empresa_id)')).toBe(true)
    // e o que continua não sendo recorte: a completude com cast, e um PARÂMETRO de nome parecido
    expect(RECORTE.test('where empresa_id::text is null')).toBe(false)
    expect(RECORTE.test('where p_empresa_id = v_emp')).toBe(false)
  })

  it('os comandos do roteiro vêm do léxico único: o `;` de dentro de um texto não esconde o recorte', () => {
    const sql = "do $$ begin perform 1 from public.ativos a where a.nome = 'x; y' and a.empresa_id = v_emp; end $$;"
    const cmds = comandosDoTexto(sql).filter((c) => /\bempresa_id\b/.test(c))
    expect(cmds).toHaveLength(1)
    expect(/public\.ativos\b/.test(cmds[0]) && RECORTE.test(cmds[0])).toBe(true)
    // o split cru partia o comando e separava a tabela do recorte
    expect(sql.split(';').filter((c) => /\bempresa_id\b/.test(c)).some((c) => /public\.ativos\b/.test(c))).toBe(false)
  })

  it('o cabeçalho DIZ o que a F63 e a F64 preencheram e o que falta (F66 para a leitura)', () => {
    // Ausência sem motivo escrito é indistinguível de esquecimento. Até a F62 o cabeçalho
    // explicava por que a varredura do acervo estava vazia; desde a F63 ela tem as oito, e o
    // cabeçalho tem de dizer isso E o que ainda não está lá. EMENDA F64 (23/09/2026, decisão 10 do
    // PLAN-F64): a F64 completou as 20 de `k_negocio` — o cabeçalho diz que ela as preencheu (e não
    // mais "F64 para as restantes") e que o que falta é a LEITURA, da F66.
    const sql = fonte('isolamento_tenant')
    expect(sql, 'o cabeçalho não fala da chave de recorte').toContain('empresa_id')
    expect(sql, 'o cabeçalho não diz o que a F63 preencheu').toMatch(/F63[^\n]*\n?[^\n]*acervo|acervo[^\n]*F63/i)
    expect(sql, 'o cabeçalho não diz o que a F64 preencheu (as onze de k_lote2, as 20 de k_negocio)').toMatch(/F64[\s\S]{0,400}k_lote2[\s\S]{0,600}as 20 de\s*(?:--\s*)?`k_negocio`/)
    expect(sql, 'o cabeçalho ainda anuncia a F64 como pendente').not.toMatch(/a F64 põe a coluna nas 11 tabelas de NEGÓCIO restantes/)
    expect(sql, 'o cabeçalho não nomeia a F66 (a leitura do dado por empresa)').toMatch(/F66/)
  })

  it('traz a convenção de honestidade escrita no cabeçalho', () => {
    const sql = fonte('isolamento_tenant')
    expect(sql).toMatch(/CONVENÇÃO DE HONESTIDADE/i)
    expect(sql, 'a convenção não menciona contar a fixture ANTES do "viu zero"').toMatch(
      /ANTES DE QUALQUER "VIU ZERO"/i,
    )
    expect(sql, 'a convenção não menciona a recusa provada DUAS vezes').toMatch(
      /RECUSA PROVADA DUAS VEZES/i,
    )
    expect(sql, 'a convenção não menciona o par simétrico da FK composta').toMatch(
      /PAR SIMÉTRICO/i,
    )
  })

  it('protege o bloco de grants com a trava do UPDATE de tabela em `profiles`', () => {
    // Sem a trava, um `grant update on public.profiles` devolveria o privilégio que a
    // 0063 revogou e a asserção de escalada passaria por engano. É o mesmo cuidado (e
    // a mesma trava) de `papeis_rls.sql`.
    const sql = semComentarios(fonte('isolamento_tenant'))
    expect(sql, 'sumiu a trava do bloco de grants').toContain('information_schema.table_privileges')
    expect(sql).toMatch(/privilege_type\s*=\s*'UPDATE'/)
    expect(sql, 'a trava não levanta exceção — ela avisaria sem impedir').toMatch(
      /raise exception/i,
    )
  })
})

describe('6. a Decisão 2 continua valendo: UMA fonte por fato', () => {
  // As varreduras schema-wide de RLS ligada e de `security_invoker` nas views moram em
  // `seguranca_catalogo.sql` (asserções 2 e 3) e ficam lá. Duas fontes para o mesmo
  // fato é como um gate morre: a que envelhecer primeiro vira a mentira. Três mutações
  // ativas do injetor miram aqueles dois rótulos.
  //
  // ⚠ `relforcerowsecurity` (R-ACC-29) NÃO é duplicata de `relrowsecurity`: são colunas
  // diferentes e fatos diferentes — uma é "a RLS está ligada", a outra é "a RLS vale
  // também para o dono". A regex abaixo distingue as duas de propósito.
  const DUPLICATAS = [
    { rotulo: 'relrowsecurity (RLS ligada)', re: /\brelrowsecurity\b/ },
    { rotulo: 'security_invoker (views)', re: /security_invoker/ },
  ]

  const pares = NOVOS.flatMap((n) => DUPLICATAS.map((d) => [n, d.rotulo, d.re] as const))

  it.each(pares)('%s não reimplementa `%s`', (nome, rotulo, re) => {
    expect(
      semComentarios(fonte(nome)),
      `${nome}.sql duplica a varredura de ${rotulo}, que mora em seguranca_catalogo.sql (F48, Decisão 2)`,
    ).not.toMatch(re)
  })

  it.each(NOVOS)('%s aponta para `seguranca_catalogo.sql`', (nome) => {
    // A outra metade da decisão: não duplicar é metade do trabalho; dizer ONDE mora o
    // fato é a outra. Sem o ponteiro, o roteiro não se lê sozinho e alguém reescreve a
    // varredura por não saber que ela já existe.
    expect(
      fonte(nome),
      `${nome}.sql não aponta para seguranca_catalogo.sql — sem o ponteiro, a Decisão 2 vira omissão`,
    ).toContain('seguranca_catalogo.sql')
  })

  it('`seguranca_catalogo.sql` aponta de volta para os catálogos novos', () => {
    const sql = fonte('seguranca_catalogo')
    expect(sql, 'seguranca_catalogo.sql não cita catalogo_policies.sql').toContain(
      'catalogo_policies.sql',
    )
    expect(sql, 'seguranca_catalogo.sql não cita catalogo_secdef.sql').toContain(
      'catalogo_secdef.sql',
    )
  })

  it('o casador distingue `relrowsecurity` de `relforcerowsecurity` (guarda do próprio teste)', () => {
    // Sem `\b` no começo, `relrowsecurity` casaria dentro de `relforcerowsecurity` e o
    // teste reprovaria a asserção 4-bis de `catalogo_policies`, que é legítima e nova.
    const re = DUPLICATAS[0].re
    expect(re.test('c.relrowsecurity = false')).toBe(true)
    expect(re.test('c.relforcerowsecurity')).toBe(false)
  })
})

describe('7. os catálogos são DERIVADOS, não listas que afirmam', () => {
  // A trava da fase, na frase da ordem: "os próprios catálogos — derivados do
  // pg_catalog, nunca listas escritas à mão". Uma lista só é honesta quando é conferida
  // nos DOIS sentidos: o catálogo contra a lista (nome novo reprova) E a lista contra o
  // catálogo (nome morto reprova). Sem a segunda metade, a lista acumula fantasmas.
  const SIMETRIAS: { arquivo: string; conjuntos: string[] }[] = [
    // F59: `k_policies_public` (o universo da doutrina do predicado) e `k_excecoes_predicado`
    // (a lista única de exceções) entram com a mesma régua — as asserções 10a/10b e 11a/11b.
    {
      arquivo: 'catalogo_policies',
      conjuntos: ['k_negocio', 'k_infra', 'k_sem_select', 'k_storage', 'k_realtime', 'k_policies_public', 'k_excecoes_predicado'],
    },
    { arquivo: 'catalogo_secdef', conjuntos: ['k_secdef', 'k_invoker_anon', 'k_excecoes_recorte'] },
  ]

  const pares = SIMETRIAS.flatMap((s) => s.conjuntos.map((c) => [s.arquivo, c] as const))

  it.each(pares)('%s: `%s` é conferido nos dois sentidos', (arquivo, conjunto) => {
    const sql = semComentarios(fonte(arquivo))
    // Sentido 1 — do catálogo para a lista: `<alias>.<coluna> = any (<conjunto>)`.
    //
    // ⚠ A COLUNA QUALIFICADA É O PONTO, e ela também nasceu de uma sabotagem que a
    // versão anterior não pegou. `= any (k_secdef)` sozinho é satisfeito por
    // `'valida_lancamento_item' = any (k_secdef)` — uma comparação com LITERAL, que não
    // varre catálogo nenhum. Exigindo `p.proname = any (…)`, o casador passa a cobrar
    // que o conjunto seja confrontado com uma COLUNA do catálogo, que é o fato.
    expect(
      sql,
      `${arquivo}.sql: ${conjunto} não é conferido do CATÁLOGO para a lista (nome novo entraria sem reprovar)`,
    ).toMatch(new RegExp(`[a-z]\\.[a-z_]+\\s*=\\s*any\\s*\\(\\s*${conjunto}`))
    // Sentido 2 — da lista para o catálogo: `unnest(… <conjunto> …)`.
    // ⚠ O `[^)]*` não é frouxidão: `k_infra` é conferida pela forma CONCATENADA
    // `unnest(k_negocio || k_infra)`, que é o mesmo fato — a tabela-verdade inteira
    // contra o catálogo, de uma vez. Exigir `unnest(k_infra)` isolado reprovaria uma
    // conferência correta e empurraria para uma segunda varredura redundante.
    expect(
      sql,
      `${arquivo}.sql: ${conjunto} não é conferido da LISTA para o catálogo (nome morto viraria fantasma)`,
    ).toMatch(new RegExp(`unnest\\s*\\([^)]*${conjunto}`))
  })

  it('o casador dos dois sentidos sabe reprovar (guarda do próprio teste)', () => {
    const catalogo = /[a-z]\.[a-z_]+\s*=\s*any\s*\(\s*k_negocio/
    const soUmSentido = 'where not (c.relname = any (k_negocio))'
    expect(catalogo.test(soUmSentido)).toBe(true)
    expect(/unnest\s*\([^)]*k_negocio/.test(soUmSentido)).toBe(false)
    // Comparação com LITERAL não conta como varredura de catálogo — foi a sabotagem
    // F.10 que descobriu isso, e é o que a coluna qualificada exige.
    const literal = "not ('valida_lancamento_item' = any (k_negocio))"
    expect(catalogo.test(literal)).toBe(false)
    // E a forma concatenada conta para os DOIS nomes, que é o caso real acima.
    const concatenado = 'from unnest(k_negocio || k_infra) as nome'
    expect(/unnest\s*\([^)]*k_infra/.test(concatenado)).toBe(true)
    expect(/unnest\s*\([^)]*k_storage/.test(concatenado)).toBe(false)
  })

  it.each(NOVOS)('%s usa `assert_zero_de` — o universo é PROVADO, não presumido', (nome) => {
    const sql = semComentarios(fonte(nome))
    expect(
      (sql.match(/pg_temp\.assert_zero_de/g) ?? []).length,
      `${nome}.sql: nenhuma asserção usa assert_zero_de — o universo não estaria sendo provado`,
    ).toBeGreaterThanOrEqual(3)
  })

  /**
   * A FORMA TAUTOLÓGICA, proibida nos roteiros NOVOS.
   *
   * `if <contagem> = 0 then v_ok := v_ok + 1` passa sobre conjunto vazio: se o cenário
   * não montou o dado que deveria examinar, `count(*)` devolve 0, o roteiro imprime ✓
   * e o CI fica verde. A F47 mediu **58** ocorrências dessa forma neste acervo. Roteiro
   * novo não nasce com ela — quem conta, conta por `assert_zero_de`, que exige o
   * universo e RECUSA universo vazio.
   *
   * ⚠ A régua é a FORMA, não a palavra. Uma condição COMPOSTA (`if v_cnt = 0 and
   * <prova positiva> then`) não é tautológica — a segunda metade é o universo. Por isso
   * o casador exige `= 0 then` colado, e não `= 0` em qualquer lugar.
   *
   * ⚠ Esta asserção nasceu de uma sabotagem que a versão anterior NÃO pegou: trocar uma
   * chamada de `assert_zero_de` pela forma antiga deixava o contador de chamadas acima
   * do piso e passava verde. O piso mede quantidade; isto mede FORMA.
   */
  const TAUTOLOGIA = /if\s+v_\w+\s*=\s*0\s+then\s*\n\s*v_ok\s*:=\s*v_ok\s*\+\s*1/

  it.each(NOVOS)('%s não contém a forma tautológica `if v_x = 0 then v_ok+1`', (nome) => {
    expect(
      semComentarios(fonte(nome)),
      `${nome}.sql concluiu ✓ a partir de uma contagem zero sem provar o universo — é a forma que a F47 mediu 58 vezes`,
    ).not.toMatch(TAUTOLOGIA)
  })

  it('o casador da tautologia sabe reprovar, e distingue a forma composta (guarda do próprio teste)', () => {
    expect(TAUTOLOGIA.test('  if v_cnt = 0 then\n    v_ok := v_ok + 1;')).toBe(true)
    // Composta: a segunda metade é a prova positiva do universo — legítima.
    expect(TAUTOLOGIA.test('  if v_cnt = 0 and v_existe then\n    v_ok := v_ok + 1;')).toBe(false)
    // Pelo caminho do ✗ não há tautologia nenhuma.
    expect(TAUTOLOGIA.test('  if v_cnt = 0 then\n    v_falhas := v_falhas + 1;')).toBe(false)
  })
})

describe('8. os roteiros novos não escrevem onde não devem', () => {
  it.each(['catalogo_policies', 'catalogo_secdef'] as const)(
    '%s é SÓ LEITURA (sem begin/rollback, porque não grava)',
    (nome) => {
      const sql = semComentarios(fonte(nome))
      expect(sql, `${nome}.sql: um roteiro só-leitura não precisa de transação`).not.toMatch(
        /^\s*begin;\s*$/m,
      )
      for (const verbo of ['insert into', 'update ', 'delete from', 'create table', 'alter table']) {
        expect(
          sql.toLowerCase(),
          `${nome}.sql executa \`${verbo}\` — ele promete ser só leitura de catálogo`,
        ).not.toContain(verbo)
      }
    },
  )

  it('`isolamento_tenant` planta fixture e por isso VAI dentro de begin/rollback', () => {
    const sql = semComentarios(fonte('isolamento_tenant'))
    expect(sql, 'isolamento_tenant.sql escreve e não abre transação').toMatch(/^\s*begin;\s*$/m)
    expect(sql, 'isolamento_tenant.sql não fecha com rollback — a fixture sobreviveria').toMatch(
      /^\s*rollback;\s*$/m,
    )
  })

  it.each(NOVOS)('%s não aponta para produção nem para dado real', (nome) => {
    // Regra permanente 2 (nenhum dado real) e 5 (roteiro nunca aponta para produção).
    const sql = fonte(nome)
    const patrimonios = [...sql.matchAll(/WAP\d{7}/g)].map((m) => m[0])
    for (const p of patrimonios) {
      expect(p, `${nome}.sql cita um patrimônio fora da faixa fictícia: ${p}`).toMatch(
        /^WAP000(9\d{3}|1234)$/,
      )
    }
    expect(sql, `${nome}.sql cita um host de produção`).not.toMatch(/supabase\.co\b/)
  })
})

describe('9. o bloco de grants e os arrays que o espelham não se separam', () => {
  // ACHADO DA REVISÃO ADVERSARIAL DESTA FASE. O comentário de `isolamento_tenant.sql`
  // prometia que acrescentar uma tabela ao bloco de grants sem acrescentá-la aos arrays
  // `k_leitura`/`k_escrita` "ficaria visível" — e não ficava: as asserções 5 e 6 varrem
  // os ARRAYS, não o bloco. A promessa era falsa, e este describe é o que a torna
  // verdadeira.
  //
  // A conferência mora AQUI e não no SQL por um motivo mecânico: é conferência do fonte
  // contra si mesmo, e SQL não enxerga o próprio arquivo. Nos DOIS sentidos: tabela no
  // bloco e fora do array (a asserção não mediria aquele grant), e nome no array e fora
  // do bloco (a asserção mediria um grant que este roteiro não concede — e passaria ou
  // falharia por causa do AMBIENTE, não do bloco, que é a mentira mais cara possível
  // num arquivo cujo trabalho é impedir `permission denied` disfarçado).

  // ⚠ SEM OS COMENTÁRIOS, e a razão é concreta: o cabeçalho do bloco de grants CITA
  // `grant select on all tables in schema public` para explicar por que essa forma é
  // proibida. Casar o fonte cru pegaria a CITAÇÃO em vez do comando — o teste mediria a
  // documentação. (Foi exatamente o que aconteceu na primeira tentativa.)
  const SQL = semComentarios(fonte('isolamento_tenant'))
  const BRUTO = fonte('isolamento_tenant')

  /** As tabelas de um `grant <verbos> on <lista> to authenticated;` do roteiro. */
  function tabelasDoGrant(prefixo: string): string[] {
    const re = new RegExp(`${prefixo}\\s*([\\s\\S]*?)\\s+to authenticated;`)
    const m = re.exec(SQL)
    expect(m, `não achei o bloco \`${prefixo} … to authenticated;\``).not.toBeNull()
    return [...m![1].matchAll(/public\.([a-z_0-9]+)/g)].map((x) => x[1])
  }

  /** Os literais de um `<nome> text[] := array[…]` — lidos do fonte BRUTO. */
  function nomesDoArray(nome: string): string[] {
    const m = new RegExp(`${nome} text\\[\\] := array\\[([^\\]]*)\\]`).exec(BRUTO)
    expect(m, `não achei o array ${nome}`).not.toBeNull()
    return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }

  it('a leitura do fonte funciona (guarda do próprio teste)', () => {
    // Sem esta guarda, um regex quebrado faria as duas asserções abaixo compararem
    // duas listas vazias e passarem por vazio.
    expect(tabelasDoGrant('grant select on').length).toBeGreaterThanOrEqual(3)
    expect(nomesDoArray('k_leitura').length).toBeGreaterThanOrEqual(3)
    expect(tabelasDoGrant('grant insert, update, delete on').length).toBeGreaterThanOrEqual(1)
  })

  it('LEITURA: o bloco de grants e `k_leitura` são o MESMO conjunto', () => {
    expect(
      [...tabelasDoGrant('grant select on')].sort(),
      'o bloco `grant select on` e o array `k_leitura` divergiram — a asserção 5 mediria outra coisa',
    ).toEqual([...nomesDoArray('k_leitura')].sort())
  })

  it('ESCRITA: o bloco de grants e `k_escrita` são o MESMO conjunto', () => {
    expect(
      [...tabelasDoGrant('grant insert, update, delete on')].sort(),
      'o bloco `grant insert, update, delete on` e o array `k_escrita` divergiram — a asserção 6 mediria outra coisa',
    ).toEqual([...nomesDoArray('k_escrita')].sort())
  })
})

describe('10. a lista única de exceções da doutrina do predicado (F59)', () => {
  // `k_excecoes_predicado` é a FONTE ÚNICA das exceções da emenda F59 da MATRIZ-REGRAS:
  // a trava de mesa (`policies-initplan.test.ts`) a lê, e as asserções 11a/11b a conferem
  // contra o catálogo vivo. Aqui se cobra o que não precisa de banco: que cada entrada é
  // uma OCORRÊNCIA (`schema.tabela / policy / função`, nunca um nome de função solto) e
  // carrega, NA MESMA LINHA, a migration de origem, o motivo e o destino. A leitura é a
  // do próprio módulo da trava — uma implementação só do formato.
  const lidas = lerExcecoesDoCatalogo(fonte('catalogo_policies'))
  const MIGRATIONS = new Set(
    listarMigrations(RAIZ).map((f) => f.slice(0, 4)),
  )

  it('há exceções para conferir, e nenhuma fora do formato (guarda do próprio teste)', () => {
    expect(lidas.entradas.length, 'k_excecoes_predicado vazio: a leitura quebrou?').toBeGreaterThan(0)
    expect(lidas.problemas).toEqual([])
  })

  it('toda entrada é por OCORRÊNCIA e aponta uma migration que existe', () => {
    for (const e of lidas.entradas) {
      expect(e.chave.split(' / '), `"${e.chave}" não é schema.tabela / policy / função`).toHaveLength(3)
      expect(MIGRATIONS.has(e.migration), `"${e.chave}" cita a migration ${e.migration}, que não existe`).toBe(true)
      expect(e.destino).toMatch(/^(F\d+[A-Z]?|permanente)$/)
    }
  })

  it('a régua do formato sabe reprovar (guarda do próprio teste)', () => {
    const embrulhar = (linhas: string) => `k_excecoes_predicado text[] := array[\n${linhas}\n  ];`
    const ok = "    'public.t / p / f', -- 0063 · motivo: uma frase honesta com mais de trinta letras · destino: F66"
    expect(lerExcecoesDoCatalogo(embrulhar(ok)).problemas).toEqual([])
    for (const ruim of [
      "    'public.t / p / f', -- 0063 · motivo: uma frase honesta com mais de trinta letras", // sem destino
      "    'public.t / p / f', -- 0063 · destino: F66", // sem motivo
      "    'public.t / p / f', -- motivo: uma frase honesta com mais de trinta letras · destino: F66", // sem migration
      "    'public.t / p / f', -- 0063 · motivo: uma frase honesta com mais de trinta letras · destino: depois", // destino inventado
      "    'pode_escrever_filial', -- 0063 · motivo: uma frase honesta com mais de trinta letras · destino: F66", // por NOME de função
      "    'public.t / p / f', -- 0063 · motivo: curto · destino: F66", // motivo raso
    ]) {
      expect(lerExcecoesDoCatalogo(embrulhar(ruim)).problemas.length, ruim).toBeGreaterThan(0)
    }
  })
})

describe('11. a lista única de exceções do recorte das rel_* (F60, bloco 7)', () => {
  // `k_excecoes_recorte` (catalogo_secdef.sql) é a fonte única da exceção ao
  // recorte obrigatório de `public.rel_*` — mesmo padrão do describe 10
  // (Decisão 2 da F48: a mesa lê o `.sql` como texto, nunca copia a lista para
  // TypeScript), com o leitor próprio da F60 (`recorte-rel.mjs::lerExcecoesDeRecorte`),
  // porque o formato é por NOME de função — um campo só —, não por ocorrência de
  // três campos como `k_excecoes_predicado`.
  const lidas = lerExcecoesDeRecorte(fonte('catalogo_secdef'))
  const MIGRATIONS = new Set(listarMigrations(RAIZ).map((f) => f.slice(0, 4)))

  it('há exceções para conferir, e nenhuma fora do formato (guarda do próprio teste)', () => {
    expect(lidas.entradas.length, 'k_excecoes_recorte vazio: a leitura quebrou?').toBeGreaterThan(0)
    expect(lidas.problemas).toEqual([])
  })

  it('toda entrada é um nome rel_* e aponta uma migration que existe', () => {
    for (const e of lidas.entradas) {
      expect(e.nome, `"${e.nome}" não parece nome de função rel_*`).toMatch(/^rel_[a-z_0-9]*$/)
      expect(MIGRATIONS.has(e.migration), `"${e.nome}" cita a migration ${e.migration}, que não existe`).toBe(true)
      expect(e.destino).toMatch(/^(F\d+[A-Z]?|permanente)$/)
    }
  })

  it('a régua do formato sabe reprovar (guarda do próprio teste)', () => {
    const embrulhar = (linhas: string) => `k_excecoes_recorte text[] := array[\n${linhas}\n  ];`
    const ok = "    'rel_x', -- 0063 · motivo: uma frase honesta com mais de quarenta caracteres de verdade · destino: F66"
    expect(lerExcecoesDeRecorte(embrulhar(ok)).problemas).toEqual([])
    for (const ruim of [
      "    'rel_x', -- 0063 · motivo: uma frase honesta com mais de quarenta caracteres de verdade", // sem destino
      "    'rel_x', -- 0063 · destino: F66", // sem motivo
      "    'rel_x', -- motivo: uma frase honesta com mais de quarenta caracteres de verdade · destino: F66", // sem migration
      "    'rel_x', -- 0063 · motivo: uma frase honesta com mais de quarenta caracteres de verdade · destino: depois", // destino inventado
      "    'rel_x', -- 0063 · motivo: curto · destino: F66", // motivo raso
    ]) {
      expect(lerExcecoesDeRecorte(embrulhar(ruim)).problemas.length, ruim).toBeGreaterThan(0)
    }
  })
})

describe('12. o lote 1 da chave de recorte (F63): a lista das oito mora numa fonte só, e a trava a lê do catálogo', () => {
  // DECISÃO 6 DO PLAN-F63. `k_lote1` (catalogo_policies.sql) é a ÚNICA lista das oito tabelas
  // do acervo que ganharam `empresa_id` na F63. A trava do bloco 5 (15a/15b/15c) a confere
  // contra `k_negocio` e contra o catálogo, e as outras peças que precisam da lista a LEEM
  // daqui (`empresa-acervo-sem-leitura.test.ts`) ou são conferidas contra ela (o roteiro do
  // rollback e o do default, logo abaixo) — uma lista escrita à mão que esquece uma tabela é
  // exatamente o defeito que esta amarração impede.
  const cat = fonte('catalogo_policies')
  const lote1 = (() => {
    const m = /k_lote1 text\[\] := array\[([\s\S]*?)\];/.exec(cat)
    if (!m) throw new Error('catalogo_policies.sql: não achei k_lote1')
    return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).sort()
  })()

  it('k_lote1 são as oito tabelas do acervo da ficha F63', () => {
    expect(lote1).toEqual(['anotacoes', 'ativos', 'colaboradores', 'itens', 'lancamentos_item', 'movimentacoes', 'pendencias_item', 'termos_gerados'])
  })

  it('o bloco 5 confere a lista contra k_negocio (15a) e contra o catálogo (15b/15c), com o default pelo pg_depend', () => {
    const sql = semComentarios(cat)
    expect(sql, '15a: k_lote1 não é conferida contra k_negocio').toMatch(/from unnest\(k_lote1\) as nome\s+where not \(nome = any \(k_negocio\)\)/)
    expect(sql, 'a leitura de catálogo não cobre o lote 1 E as tabelas de negócio que já têm a coluna').toMatch(/unnest\(k_negocio \|\| k_lote1\)/)
    expect(sql, '15b: o default não é conferido pelo pg_depend').toMatch(/refobjid = 'public\.empresa_legada\(\)'::regprocedure/)
    expect(sql, '15b: a FK não exige convalidated').toMatch(/k\.convalidated/)
    expect(sql, '15b: não confere o force').toMatch(/relforcerowsecurity/)
    for (const rotulo of ['15a', '15b', '15c']) {
      expect(sql, `o rótulo ${rotulo} não está literal num assert_zero_de (o injetor lê por token)`).toMatch(new RegExp(String.raw`assert_zero_de\(\s*'${rotulo} `))
    }
  })

  it('os roteiros da F63 que listam as oito tabelas listam EXATAMENTE k_lote1', () => {
    for (const nome of ['f63_rollback', 'empresa_no_acervo']) {
      const caminho = join(PASTA, `${nome}.sql`)
      if (!existsSync(caminho)) continue // nasce com as migrations (commits seguintes)
      const m = /k_oito\s+(?:constant\s+)?text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(fonte(nome)) ?? /array\[([^\]]*'movimentacoes'[^\]]*)\]/.exec(fonte(nome))
      expect(m, `${nome}.sql não declara a lista das oito`).not.toBeNull()
      expect([...m![1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).sort(), `${nome}.sql lista outras tabelas que não as de k_lote1`).toEqual(lote1)
    }
  })
})

describe('13. o lote 2 da chave de recorte (F64): a lista das onze e as exceções de leitura moram numa fonte só', () => {
  // DECISÕES 6 E 7 DO PLAN-F64. `k_lote2` (catalogo_policies.sql) é a ÚNICA lista das onze tabelas de
  // negócio que ganharam `empresa_id` na F64, e `k_leitura_integridade` a ÚNICA lista das funções que
  // podem ler a coluna antes da F66 (as duas leituras de integridade do kit). O bloco 5 (15d a 15j)
  // as confere contra `k_negocio` e contra o catálogo; a trava de mesa `empresa-acervo-sem-leitura`
  // as LÊ daqui; e os roteiros da F64 que repetem uma delas são conferidos contra ela, logo abaixo.
  const cat = fonte('catalogo_policies')
  const lista = (nome: string) => {
    const m = new RegExp(String.raw`${nome} text\[\] := array\[([\s\S]*?)\];`).exec(cat)
    if (!m) throw new Error(`catalogo_policies.sql: não achei ${nome}`)
    return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).sort()
  }
  const lote1 = lista('k_lote1')
  const lote2 = lista('k_lote2')
  const negocio = lista('k_negocio')
  const leitura = lista('k_leitura_integridade')

  it('k_lote2 são as onze tabelas da ficha F64 (as sete de negócio e as quatro do vocabulário do import)', () => {
    expect(lote2).toEqual([
      'eventos_admin', 'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria', 'import_termos_estado',
      'kits_modelos', 'motivos', 'relatorios_gerados', 'senhas_acesso', 'tipos_item', 'unidades_apelidos',
    ])
  })

  it('os dois lotes são disjuntos, e com filiais são k_negocio INTEIRO (nenhuma tabela de negócio sem a chave)', () => {
    expect(lote1.filter((t) => lote2.includes(t))).toEqual([])
    expect([...lote1, ...lote2, 'filiais'].sort()).toEqual(negocio)
  })

  it('as exceções de leitura são as DUAS leituras de integridade do kit, e só elas', () => {
    expect(leitura).toEqual(['checagens_integridade_nucleo', 'kit_motivo_da_empresa'])
  })

  it('o bloco 5 confere o lote 2 contra k_negocio (15d) e contra o catálogo (15e), e a pendência REPROVA (15f)', () => {
    const sql = semComentarios(cat)
    expect(sql, '15d: k_lote2 não é conferida contra k_negocio').toMatch(/from unnest\(k_lote2\) as nome where not \(nome = any \(k_negocio\)\)/)
    expect(sql, '15d: a união dos lotes com filiais não é conferida contra k_negocio').toMatch(/not \(nome = any \(k_lote1 \|\| k_lote2 \|\| array\['filiais'\]\)\)/)
    expect(sql, '15e: a leitura de catálogo não cobre o lote 2').toMatch(/from unnest\(k_lote2\) as nome\s+\), col as/)
    expect(sql, '15e: o default não é conferido pelo pg_depend').toMatch(/refobjid = 'public\.empresa_legada\(\)'::regprocedure/)
    expect(sql, 'a pendência da F64 continua como aviso — ela tem de REPROVAR').not.toMatch(/pendência nomeada da F64, sem reprovar/)
    for (const rotulo of ['15d', '15e', '15f', '15g', '15h', '15i', '15j']) {
      expect(sql, `o rótulo ${rotulo} não está literal num assert_zero_de (o injetor lê por token)`).toMatch(new RegExp(String.raw`assert_zero_de\(\s*'${rotulo} `))
    }
  })

  it('as tabelas que as exceções podem ler são as duas do kit, e só elas', () => {
    expect(lista('k_tabelas_leitura_kit')).toEqual(['kits_modelos', 'motivos'])
  })

  it('15h usa o predicado ÚNICO por comando (revisão adversarial da F64), e 15j confere as exceções de volta (os dois sentidos)', () => {
    const sql = semComentarios(cat)
    // a exceção vale por COMANDO, não pela função inteira: o predicado de `_asserts.sql` recebe as
    // exceções E as tabelas do kit; o corpo é lido pelo léxico (`apagar_usuario`, 0158, cita
    // `eventos_admin` num comentário)
    expect(sql, '15h não usa o predicado único de _asserts.sql').toMatch(
      /pg_temp\.leitura_de_empresa_do_lote\(p\.proname, p\.prosrc, k_lote2, k_leitura_integridade, k_tabelas_leitura_kit\)/,
    )
    expect(sql, '15h voltou a isentar a função inteira pelo nome').not.toMatch(/c\.proname = any \(k_leitura_integridade\)/)
    expect(sql).toMatch(/from unnest\(k_leitura_integridade\) as nome/)
    const asserts = fonte('_asserts')
    expect(asserts, '_asserts.sql perdeu o léxico do corpo').toMatch(/create or replace function pg_temp\.sql_so_codigo\(p_texto text\)/)
    expect(asserts, '_asserts.sql perdeu o predicado da leitura do lote').toMatch(/create or replace function pg_temp\.leitura_de_empresa_do_lote\(/)
  })

  it('os roteiros da F64 que listam as onze tabelas ou as exceções listam EXATAMENTE a fonte única', () => {
    for (const nome of ['f64_rollback', 'empresa_no_vocabulario']) {
      const caminho = join(PASTA, `${nome}.sql`)
      if (!existsSync(caminho)) continue // nasce com as migrations (commits seguintes)
      const m = /k_onze\s+(?:constant\s+)?text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(fonte(nome)) ?? /array\[([^\]]*'senhas_acesso'[^\]]*)\]/.exec(fonte(nome))
      expect(m, `${nome}.sql não declara a lista das onze`).not.toBeNull()
      expect([...m![1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).sort(), `${nome}.sql lista outras tabelas que não as de k_lote2`).toEqual(lote2)
    }
    const caminho = join(PASTA, 'empresa_no_vocabulario.sql')
    if (existsSync(caminho)) {
      const m = /k_leitura_integridade\s+(?:constant\s+)?text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(fonte('empresa_no_vocabulario'))
      expect(m, 'empresa_no_vocabulario.sql não declara a cópia das exceções da auto-sabotagem').not.toBeNull()
      expect([...m![1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).sort()).toEqual(leitura)
      const t = /k_tabelas_leitura_kit\s+(?:constant\s+)?text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(fonte('empresa_no_vocabulario'))
      expect(t, 'empresa_no_vocabulario.sql não declara a cópia das tabelas da leitura do kit').not.toBeNull()
      expect([...t![1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).sort()).toEqual(lista('k_tabelas_leitura_kit'))
    }
  })
})

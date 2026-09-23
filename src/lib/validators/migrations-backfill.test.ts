import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ILEGIVEL,
  LeituraIlegivel,
  censo,
  classificar,
  comandosExecutados,
  conferirMigration,
  escritasExecutadas,
  lexar,
  semComentarios,
  textoExecutado,
} from '../../../scripts/db/classificar-migration.mjs'

// =============================================================================
// O CLASSIFICADOR DE MIGRATIONS E A DISCIPLINA DE BACKUP (F63, 23/09/2026)
// =============================================================================
// O nome deste arquivo é o que a ficha F63 dá. Ele prova três coisas, na ordem do PLAN-F63:
//   1. o LEITOR ÚNICO lê a cadeia inteira sem lançar, trata `do` como código executado,
//      enxerga dollar-quote com rótulo e comentário com `$$`, e falha FECHADO;
//   2. a REGRA (a partir da 0159) — cabeçalho obrigatório, classe declarada nunca menor que a
//      calculada, o par de backup antes de cada comando que sobrescreve dado, nenhuma válvula —
//      reprova cada caso da SABOTAGEM A, e deixa passar a forma canônica;
//   3. o CENSO da cadeia: a classe calculada das 157 de antes da F63, congelada aqui (elas não
//      se editam), com as divergências das `0152`–`0158` nomeadas.
// =============================================================================

const DIR = join(process.cwd(), 'supabase', 'migrations')
const ARQUIVOS = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
const lerArquivo = (nome: string) => readFileSync(join(DIR, nome), 'utf8').replace(/\r\n/g, '\n')
const doCorpus = (prefixo: string) => {
  const nome = ARQUIVOS.find((f) => f.startsWith(prefixo))
  if (!nome) throw new Error(`a migration ${prefixo} não está no disco`)
  return { nome, sql: lerArquivo(nome) }
}

describe('1. o leitor único', () => {
  it('lê a cadeia INTEIRA sem lançar, e acha comando executado em todo arquivo', () => {
    expect(ARQUIVOS.length, 'a cadeia sumiu').toBeGreaterThanOrEqual(157)
    for (const nome of ARQUIVOS) {
      const cmds = comandosExecutados(lerArquivo(nome))
      expect(cmds.length, `${nome}: nenhum comando executado — o leitor engoliu o arquivo?`).toBeGreaterThan(0)
    }
  })

  it('enxerga o dollar-quote de RÓTULO onde ele é CÓDIGO (7 arquivos) e onde é só COMENTÁRIO (5) — fato 14 medido de novo', () => {
    // O fato 14 conta 12 arquivos com `$rótulo$` no TEXTO. O léxico separa: em 7 ele é código
    // (`$function$` 0051/0097/0099/0118, `$copia$` 0153, `$confere$` 0156, `$recopia$` 0158); nos 5
    // da F17–F20 (`$smoke$`, `$idx$`) é um smoke test COMENTADO (`--   do $smoke$`). O leitor
    // antigo, que só via `$$`, era cego aos 7; um leitor que não tirasse comentário antes "veria"
    // corpo nos 5.
    const antigos = ARQUIVOS.filter((f) => f < '0159')
    const rotulados = antigos.filter((f) => lexar(lerArquivo(f)).some((t) => t.tipo === 'dolar' && t.rotulo !== '$$'))
    expect(rotulados.map((f) => f.slice(0, 4))).toEqual(['0051', '0097', '0099', '0118', '0153', '0156', '0158'])
    const soEmComentario = antigos.filter((f) =>
      lexar(lerArquivo(f)).some((t) => t.tipo === 'comentario' && /\$[A-Za-z_][A-Za-z0-9_]*\$/.test(t.texto)),
    )
    expect(soEmComentario.map((f) => f.slice(0, 4))).toEqual(['0032', '0033', '0034', '0036', '0037'])
  })

  it('os dois arquivos com `$$` DENTRO de comentário (0133, 0150) são lidos como comentário, não como corpo', () => {
    const comDolarEmComentario = ARQUIVOS.filter((f) => f < '0159').filter((f) =>
      lexar(lerArquivo(f)).some((t) => t.tipo === 'comentario' && t.texto.includes('$$')),
    )
    expect(comDolarEmComentario.map((f) => f.slice(0, 4))).toEqual(['0133', '0150'])
  })

  it('os 10 arquivos com `do` de topo têm o corpo lido como código EXECUTADO (fato 14)', () => {
    const comDo = ARQUIVOS.filter((f) => f < '0159').filter((f) => comandosExecutados(lerArquivo(f)).some((c) => c.origem === 'do'))
    expect(comDo.map((f) => f.slice(0, 4))).toEqual(['0009', '0018', '0076', '0124', '0127', '0133', '0139', '0153', '0156', '0158'])
    const escrevem = comDo.filter((f) => escritasExecutadas(lerArquivo(f)).some((e) => e.origem === 'do'))
    expect(escrevem.map((f) => f.slice(0, 4)), 'os cinco que escrevem dentro do do').toEqual(['0076', '0127', '0133', '0153', '0158'])
  })

  it.each([
    ['o corpo de função com rótulo sai', 'create function public.f() returns void language plpgsql as $function$ begin update public.x set a = 1; end $function$;', []],
    ['o corpo de `do` entra', 'do $$ begin update public.x set a = 1 where true; end $$;', ['update public.x']],
    ['o `do` com LANGUAGE depois do corpo', 'do $$ begin delete from public.x; end $$ language plpgsql;', ['delete public.x']],
    ['o `do` com corpo em texto simples', "do 'begin update public.x set a = 1 where true; end';", ['update public.x']],
    ['o `create function` DENTRO de `do` continua guardado', 'do $d$ begin create function public.g() returns void language sql as $g$ delete from public.x $g$; end $d$;', []],
    ['um `$$` em comentário não abre corpo', '-- isto cita $$ num comentário\nupdate public.x set a = 1 where true;', ['update public.x']],
    ["um `'$$'` em texto não abre corpo", "select '$$' as x;\nupdate public.x set a = 1 where true;", ['update public.x']],
    ["um `--` em texto não é comentário", "select '-- não é comentário' as x; update public.x set a = 1 where true;", ['update public.x']],
    ['comentário de fim de linha é ignorado', 'select 1; -- update public.x set a = 1', []],
    ['comentário de bloco ANINHADO é ignorado inteiro', '/* /* aninhado */ update public.x set a = 1 */ select 1;', []],
    ["`E'…'` com aspa escapada", "select E'uma \\' aspa'; update public.x set a = 1 where true;", ['update public.x']],
    ['`$1` é parâmetro, não dollar-quote', "create function public.h(int) returns int language sql as 'select $1';\nupdate public.x set a = 1 where true;", ['update public.x']],
  ])('%s', (_nome, sql, esperado) => {
    expect(escritasExecutadas(sql).map((e: { verbo: string; tabela: string }) => `${e.verbo} ${e.tabela}`)).toEqual(esperado)
  })

  it.each([
    ['dollar-quote sem fecho', 'do $$ begin update public.x set a = 1;'],
    ['dollar-quote com rótulo sem fecho', 'create function f() returns void as $corpo$ select 1 $outro$;'],
    ['comentário de bloco sem fecho', 'select 1; /* aberto'],
    ['comentário aninhado sem o segundo fecho', '/* /* só um */ select 1;'],
    ['texto sem fecho', "select 'aberto;"],
    ['identificador citado sem fecho', 'select "aberto from x;'],
  ])('FALHA FECHADA — %s LANÇA com o trecho, em vez de devolver menos', (_nome, sql) => {
    expect(() => comandosExecutados(sql)).toThrow(LeituraIlegivel)
    expect(() => comandosExecutados(sql)).toThrow(/ilegível para o classificador perto de «/)
  })

  it('semComentarios tira comentário de linha, de fim de linha e de bloco, e NÃO toca texto nem corpo', () => {
    const sql = "select 1; -- fora\n/* bloco */ select '-- dentro de texto', $$ -- dentro de corpo $$;"
    expect(semComentarios(sql)).toBe("select 1; \n  select '-- dentro de texto', $$ -- dentro de corpo $$;")
  })

  it('textoExecutado junta o que o apply roda: sem comentário, sem corpo de função, com o `do`', () => {
    const sql = [
      '-- cabeçalho',
      'create or replace function public.f() returns void language sql as $$ delete from public.x $$;',
      'do $$ begin update public.y set a = 1 where true; end $$;',
    ].join('\n')
    const texto = textoExecutado(sql)
    expect(texto).not.toMatch(/cabeçalho/)
    expect(texto).not.toMatch(/delete from public\.x/)
    expect(texto).toMatch(/update public\.y set a = 1/)
  })
})

// -----------------------------------------------------------------------------
// 2. A REGRA — sabotagem A
// -----------------------------------------------------------------------------

const NOME = '0170_sintetica.sql'
const RODAPE = '-- ROLLBACK: (sintético) desfazer à mão.'
const RODAPE_BACKUP = [
  '-- ROLLBACK (a partir de backups_migration):',
  "--   update public.x t set status = (jsonb_populate_record(null::public.x, jsonb_build_object('status', b.valor_anterior))).status",
  `--     from public.backups_migration b where b.migration = '${NOME}' and b.tabela = 'public.x' and b.coluna = 'status' and b.chave = t.id::text;`,
].join('\n')
const migracao = (classe: string | null, corpo: string, rodape = RODAPE) =>
  [classe === null ? '-- (sem cabeçalho)' : `-- classe: ${classe}`, corpo, rodape].join('\n')

const BACKUP = (literal = NOME, where = "where t.status = 'a'") =>
  [
    'insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)',
    `select '${literal}', 'public.x', 'status', t.id::text, to_jsonb(t.status)`,
    '  from public.x t',
    ` ${where};`,
  ].join('\n')
const UPDATE = (where = "where t.status = 'a'") => ['update public.x t', "   set status = 'b'", ` ${where};`].join('\n')

describe('2. a regra a partir da 0159 — sabotagem A', () => {
  it('a forma CANÔNICA de um BACKFILL passa (o controle: a régua sabe dizer sim)', () => {
    expect(conferirMigration(NOME, migracao('BACKFILL', `${BACKUP()}\n${UPDATE()}`, RODAPE_BACKUP))).toEqual([])
  })

  it('uma ADITIVA de verdade passa, com default da lista fechada', () => {
    const sql = migracao(
      'ADITIVA',
      [
        "set lock_timeout = '2s';",
        'alter table public.x add column empresa_id uuid not null default public.empresa_legada() references public.empresas (id);',
        "comment on column public.x.empresa_id is 'sintético';",
        'reset lock_timeout;',
      ].join('\n'),
    )
    expect(conferirMigration(NOME, sql)).toEqual([])
  })

  const reprova = (sql: string, padrao: RegExp) => {
    const problemas = conferirMigration(NOME, sql)
    expect(problemas.join(' · '), `esperava reprovar por ${padrao}`).toMatch(padrao)
  }

  it('A1 — `update` de topo SEM cabeçalho reprova', () => {
    reprova(migracao(null, UPDATE()), /sem o cabeçalho/)
  })
  it('A2 — declarada ADITIVA com `update` de topo reprova', () => {
    reprova(migracao('ADITIVA', UPDATE()), /declara ADITIVA e executa BACKFILL/)
  })
  it('A3 — `update` DENTRO de `do $$ … $$` é visto como executado e reprova', () => {
    const sql = migracao('ADITIVA', "do $$ begin update public.x set status = 'b' where true; end $$;")
    expect(classificar(sql).calculada).toBe('BACKFILL')
    reprova(sql, /declara ADITIVA e executa BACKFILL/)
    reprova(migracao('BACKFILL', "do $$ begin update public.x set status = 'b' where true; end $$;"), /dentro de um bloco do/)
  })
  it('A4 — `update` dentro de `create function … $function$` é IGNORADO', () => {
    const sql = migracao('ADITIVA', "create or replace function public.f() returns void language plpgsql as $function$ begin update public.x set status = 'b'; end $function$;")
    expect(conferirMigration(NOME, sql)).toEqual([])
  })
  it('A5 — um `$$` num comentário ANTES de um `update` de topo: o `update` continua visto', () => {
    reprova(migracao('ADITIVA', `-- este comentário cita $$ de propósito\n${UPDATE()}`), /declara ADITIVA e executa BACKFILL/)
  })
  it('A6 — comentário de fim de linha com `update public.x set` é IGNORADO', () => {
    expect(conferirMigration(NOME, migracao('ADITIVA', "select 1; -- update public.x set status = 'b'"))).toEqual([])
  })
  it('A7 — BACKFILL SEM o bloco de backup reprova', () => {
    reprova(migracao('BACKFILL', UPDATE(), RODAPE_BACKUP), /sem o bloco «insert into public\.backups_migration/)
  })
  it('A8 — o bloco com o literal `migration` de OUTRO arquivo reprova (o bloco copiado)', () => {
    reprova(migracao('BACKFILL', `${BACKUP('0169_outra.sql')}\n${UPDATE()}`, RODAPE_BACKUP), /bloco copiado de outra migration/)
  })
  it('A9 — o `where` do backup diferente do `where` do `update` por UM espaço reprova', () => {
    reprova(migracao('BACKFILL', `${BACKUP()}\n${UPDATE("where t.status =  'a'")}`, RODAPE_BACKUP), /não é byte a byte/)
  })
  it('A9-bis — o `update` com `where` MAIS LARGO que o do backup (`… or true`) reprova', () => {
    reprova(migracao('BACKFILL', `${BACKUP()}\n${UPDATE("where t.status = 'a' or true")}`, RODAPE_BACKUP), /não é byte a byte/)
  })
  it('A9-ter — coluna alterada sem par, e par de outra coluna, reprovam', () => {
    const duas = ['update public.x t', "   set status = 'b', valor = null", " where t.status = 'a';"].join('\n')
    reprova(migracao('BACKFILL', `${BACKUP()}\n${duas}`, RODAPE_BACKUP), /a coluna 'valor' é alterada sem par de backup/)
    const trocada = BACKUP().replace('to_jsonb(t.status)', 'to_jsonb(t.valor)')
    reprova(migracao('BACKFILL', `${trocada}\n${UPDATE()}`, RODAPE_BACKUP), /guarda to_jsonb\(…valor\) mas declara a coluna 'status'/)
  })
  it('A9-quater — o rodapé tem de restaurar a partir de backups_migration, com o nome do arquivo', () => {
    reprova(migracao('BACKFILL', `${BACKUP()}\n${UPDATE()}`), /o rodapé não restaura a partir de public\.backups_migration/)
  })
  it('A10 — `set_config(estoque.dev_destrutivo)` de topo reprova, e dentro de `do` também', () => {
    reprova(migracao('ADITIVA', "select set_config('estoque.dev_destrutivo', 'on', true);"), /abre válvula das guardas: set_config de estoque\.dev_destrutivo/)
    reprova(migracao('ADITIVA', "do $$ begin perform set_config('estoque.dev_destrutivo', 'on', true); end $$;"), /abre válvula/)
    reprova(migracao('ADITIVA', 'set local estoque.dev_destrutivo = on;'), /abre válvula das guardas: set estoque\.dev_destrutivo/)
  })
  it('A10-bis — as outras válvulas: `disable trigger` e `session_replication_role`', () => {
    reprova(migracao('ADITIVA', 'alter table public.movimentacoes disable trigger movimentacoes_guarda_acervo;'), /disable trigger/)
    reprova(migracao('ADITIVA', 'set session_replication_role = replica;'), /session_replication_role/)
  })
  it('A11 — `execute format(…)` é ILEGÍVEL, nunca ADITIVA', () => {
    const sql = migracao('ADITIVA', "do $$ begin execute format('update public.%I set a = 1', 'x'); end $$;")
    expect(classificar(sql).veredito).toBe(ILEGIVEL)
    reprova(sql, /ILEGÍVEL: SQL dinâmico \(execute\)/)
  })
  it('A12 — `select public.f()` e `call public.p()` de topo, com a rotina criada no MESMO arquivo e escrevendo, são ILEGÍVEL', () => {
    const f = "create function public.f() returns void language sql as $$ update public.x set status = 'b' $$;\nselect public.f();"
    expect(classificar(migracao('ADITIVA', f)).veredito).toBe(ILEGIVEL)
    reprova(migracao('ADITIVA', f), /chamada de public\.f\(\) no apply/)
    const p = "create procedure public.p() language sql as $$ update public.x set status = 'b' $$;\ncall public.p();"
    reprova(migracao('ADITIVA', p), /call de procedimento/)
  })
  it('A13 — `merge into` e `with … update` de topo são vistos como escrita', () => {
    const merge = migracao('ADITIVA', "merge into public.x t using (select 1 as id) s on t.id = s.id when matched then update set status = 'b';")
    expect(classificar(merge).calculada).toBe('BACKFILL')
    reprova(merge, /declara ADITIVA e executa BACKFILL/)
    reprova(migracao('BACKFILL', "merge into public.x t using (select 1 as id) s on t.id = s.id when matched then update set status = 'b';", RODAPE_BACKUP), /merge não tem where verificável/)
    const cte = migracao('ADITIVA', "with c as (select 1) update public.x t set status = 'b' where t.status = 'a';")
    reprova(cte, /declara ADITIVA e executa BACKFILL/)
  })
  it('A14 — `add column … default gen_random_uuid()` NÃO é ADITIVA (default volátil reescreve a tabela)', () => {
    const sql = migracao('ADITIVA', 'alter table public.x add column y uuid not null default gen_random_uuid();')
    expect(classificar(sql).veredito).toBe(ILEGIVEL)
    reprova(sql, /default «gen_random_uuid\(\)» fora da lista fechada/)
  })
  it('A15 — `/* /* aninhado */ update public.x set … */` é IGNORADO (o comentário de bloco do Postgres aninha)', () => {
    expect(conferirMigration(NOME, migracao('ADITIVA', "/* /* aninhado */ update public.x set status = 'b' */ select 1;"))).toEqual([])
  })
  it("A16 — `'$$'` dentro de texto de topo NÃO abre corpo (o `update` depois dele é visto)", () => {
    reprova(migracao('ADITIVA', `comment on table public.x is 'um $$ aqui';\n${UPDATE()}`), /declara ADITIVA e executa BACKFILL/)
  })
  it('A17 — a 0133 REAL é ILEGÍVEL com válvula no censo; uma 0159 sintética igual a ela reprova SEMPRE', () => {
    const { sql } = doCorpus('0133')
    const c = classificar(sql)
    expect(c.veredito).toBe(ILEGIVEL)
    expect(c.valvulas.length).toBeGreaterThan(0)
    expect(conferirMigration('0133_ordem_das_movimentacoes.sql', sql), 'abaixo da 0159 a regra não retroage').toEqual([])
    const copia = conferirMigration('0159_copia_da_0133.sql', sql)
    expect(copia.join(' · ')).toMatch(/sem o cabeçalho/)
    expect(copia.join(' · ')).toMatch(/abre válvula/)
    expect(copia.join(' · ')).toMatch(/ILEGÍVEL/)
  })
  it('A18 — dollar-quote sem fecho: o leitor LANÇA (e a regra o reporta, em vez de passar)', () => {
    expect(() => classificar('do $$ begin update public.x set a = 1;')).toThrow(LeituraIlegivel)
    reprova(migracao('ADITIVA', 'do $$ begin update public.x set a = 1;'), /o leitor não conseguiu ler/)
  })
  it('A19 — controle de transação de topo reprova (quem decide a transação é o apply — decisão 2)', () => {
    reprova(migracao('ADITIVA', 'begin;\nselect 1;\ncommit;'), /controle de transação de topo/)
  })
  it('A20 — sem ROLLBACK no rodapé reprova', () => {
    reprova(migracao('ADITIVA', 'select 1;', '-- fim'), /sem o ROLLBACK escrito no rodapé/)
  })
  it('A21 — `insert` puro em tabela que já existia é BACKFILL (não ADITIVA); em tabela criada no mesmo arquivo, ADITIVA', () => {
    expect(classificar("insert into public.x (status) values ('a');").calculada).toBe('BACKFILL')
    expect(classificar("create table public.nova (status text);\ninsert into public.nova (status) values ('a');").calculada).toBe('ADITIVA')
    expect(classificar('delete from public.x where true;').calculada).toBe('DESTRUTIVA')
    expect(classificar('alter table public.x drop column status;').calculada).toBe('DESTRUTIVA')
    expect(classificar('alter table public.x alter column status type varchar(10);').calculada).toBe('DESTRUTIVA')
    expect(classificar('drop function public.f() cascade;').calculada).toBe('DESTRUTIVA')
    expect(classificar('drop function public.f();').calculada).toBe('ADITIVA')
    expect(classificar("revoke truncate on public.ativos from anon;").calculada).toBe('ADITIVA')
  })
})

// -----------------------------------------------------------------------------
// 3. a cadeia real — a regra nas novas, o censo nas antigas
// -----------------------------------------------------------------------------

describe('3. a cadeia real', () => {
  const novas = ARQUIVOS.filter((f) => f >= '0159')

  it.each(novas.length ? novas : ['(nenhuma ainda)'])('%s passa pela regra (cabeçalho, classe, par, válvulas, rodapé)', (nome) => {
    if (nome === '(nenhuma ainda)') return
    expect(conferirMigration(nome, lerArquivo(nome))).toEqual([])
  })

  // O CENSO das 157 anteriores à F63, congelado: elas não se editam, então qualquer mudança aqui é
  // o LEITOR que mudou — e mudança de leitor tem de ser vista, não absorvida.
  const antigas = censo().filter((x: { arquivo: string }) => x.arquivo < '0159')

  it('o censo das 157 anteriores: ADITIVA 139 · BACKFILL 11 · DESTRUTIVA 2 · ILEGÍVEL 5', () => {
    const por: Record<string, number> = {}
    for (const x of antigas) por[x.veredito] = (por[x.veredito] ?? 0) + 1
    expect(antigas.length).toBe(157)
    expect(por).toEqual({ ADITIVA: 139, BACKFILL: 11, DESTRUTIVA: 2, [ILEGIVEL]: 5 })
  })

  it('as ILEGÍVEL do censo são exatamente as cinco medidas (e a 0111 é uma delas)', () => {
    const ilegiveis = antigas.filter((x: { veredito: string }) => x.veredito === ILEGIVEL).map((x: { arquivo: string }) => x.arquivo.slice(0, 4))
    expect(ilegiveis).toEqual(['0057', '0111', '0124', '0125', '0133'])
  })

  it('as sete com cabeçalho (0152–0158): só a 0156 e a 0158 declaram ADITIVA e executam BACKFILL — divergência de ATA, não de migration', () => {
    const comCabecalho = antigas.filter((x: { declarada: string | null }) => x.declarada !== null)
    expect(comCabecalho.map((x: { arquivo: string }) => x.arquivo.slice(0, 4))).toEqual(['0152', '0153', '0154', '0155', '0156', '0157', '0158'])
    const divergentes = comCabecalho.filter((x: { declarada: string; calculada: string }) => x.declarada !== x.calculada)
    expect(divergentes.map((x: { arquivo: string; calculada: string }) => `${x.arquivo.slice(0, 4)} ${x.calculada}`)).toEqual(['0156 BACKFILL', '0158 BACKFILL'])
  })
})

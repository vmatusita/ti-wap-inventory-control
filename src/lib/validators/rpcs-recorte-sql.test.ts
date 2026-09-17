import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARQUIVO_CATALOGO_RECORTE,
  TABELAS_SEM_FILIAL,
  carregarMigrations,
  checarR1,
  checarR4,
  julgarRecorte,
  ligacoesDoParametro,
  mensagemDeViolacao,
} from '../../../scripts/db/recorte-rel.mjs'

// A TRAVA DE MESA DO RECORTE OBRIGATÓRIO DAS `rel_*` — F60 (Frente C).
//
// A F60 troca `p_filial smallint` com `(p_filial is null or col = p_filial)` por
// `p_filiais smallint[]` com `col = any (p_filiais)` nas RPCs de relatório —
// R-ACC-71 da emenda F59: "se nulo pode significar 'mostre tudo', a forma é
// proibida". Esta é a trava que torna a forma velha impossível de voltar: ela
// reprova, na mesa, sem banco, toda `public.rel_*` viva que não declare o
// parâmetro (R1), que não ligue ele a uma coluna com `= any (` (R2), que ligue de
// um jeito anulável — disjunção, `coalesce`, `case` (R3) — ou que leia tabela-base
// num escopo sem cobertura, direta ou herdada (R4).
//
// O PAR dela é o bloco 7 de `supabase/tests/catalogo_secdef.sql`: a mesma
// doutrina, conferida no catálogo VIVO do banco do CI, por fatos de `pg_proc`
// (proargnames/proallargtypes, grants, proconfig). A mesa é a autoridade sobre a
// FORMA (R2–R4) — função `language sql` clássica não expõe o corpo como árvore no
// catálogo (`prosqlbody` fica NULO; só `prosrc`, texto, existe). As EXCEÇÕES moram
// numa fonte só, o array `k_excecoes_recorte` daquele `.sql`, e esta trava as lê
// como texto (Decisão 2 da F48).
//
// ⚠ LEITURA NA COLETA (lição da F57): as 139+ migrations e o `.sql` são lidos UMA
// vez, aqui no topo. Ler disco dentro de `it` estourou o tempo-limite da suíte na
// F57 — e é exatamente o padrão que `policies-initplan.test.ts` (o molde desta
// trava) documenta.
//
// ⚠ A TRAVA NASCEU VERMELHA (commit `4d4bad2`, 16/09/2026): contra a cadeia de então, o
// describe 3 nomeava as SETE `rel_*` que ainda usavam `p_filial smallint`/`is null or` — a
// trava veio ANTES da correção (regra 4 do §4 do plano). O lote 2 da Frente D (a `0143` cria
// as sete `rel_*_filiais`, a `0145` derruba as velhas) a pôs VERDE sem mudar regra nenhuma de
// `recorte-rel.mjs`: mudaram só os FATOS do universo que o describe 1 confere e a `rel_*` viva
// sobre a qual o sintético de `alter function` do describe 2 age (a velha não existe mais).
// NÃO AFROUXAR nenhuma asserção para caber uma `rel_*` nova.

const RAIZ = process.cwd()
const SQL_CATALOGO = readFileSync(join(RAIZ, ...ARQUIVO_CATALOGO_RECORTE), 'utf8')
const MIGRATIONS = carregarMigrations(RAIZ)
const J = julgarRecorte({ migrations: MIGRATIONS, sqlCatalogo: SQL_CATALOGO })

/** O julgamento de uma migration SINTÉTICA acrescentada, em memória, ao fim da cadeia real. */
function comSintetica(sql: string, arquivo = '9999_sintetica_f60.sql') {
  return julgarRecorte({ migrations: [...MIGRATIONS, { arquivo, sql }], sqlCatalogo: SQL_CATALOGO })
}

/**
 * As violações que a migration sintética INTRODUZ — as da cadeia real saem da
 * conta. Sem esse desconto, a cadeia real (hoje vermelha nas sete, de propósito)
 * faria a guarda "confundir" o diagnóstico, no mesmo padrão de
 * `policies-initplan.test.ts::violacoesNovas`.
 */
const MENSAGENS_DA_CADEIA_REAL = new Set(J.violacoes.map(mensagemDeViolacao))
function violacoesNovas(sql: string, arquivo?: string) {
  return comSintetica(sql, arquivo)
    .violacoes.map((v) => ({ ...v, mensagem: mensagemDeViolacao(v) }))
    .filter((v) => !MENSAGENS_DA_CADEIA_REAL.has(v.mensagem))
}

/** Uma `create function` sintética mínima, `language sql stable`, corpo dado. */
const funcaoRel = (nome: string, assinatura: string, corpo: string) =>
  `create function public.${nome}(${assinatura}) returns table (x int) language sql stable security invoker set search_path = public as $$\n  ${corpo}\n$$;`

describe('1. o universo — a mesa julga o MESMO conjunto que o replay das migrations', () => {
  it('o replay leu migrations e achou rel_* vivas (guarda do próprio teste)', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(100)
    expect(J.vivas.size, 'o replay não achou rel_* nenhuma — o casador quebrou?').toBeGreaterThanOrEqual(8)
  })

  it('replay sem falhas contra a cadeia real, e consumidos === encontrados', () => {
    expect(J.falhas.map((f) => `${f.arquivo}:${f.linha} — ${f.motivo}`)).toEqual([])
    expect(J.consumidos).toBeGreaterThan(0)
    expect(J.consumidos, 'consumidos deveria ser >= encontrados (o replay também consome DDL que o regex frouxo da auto-conferência não casa, ex. "drop function if exists")').toBeGreaterThanOrEqual(J.encontrados)
  })

  it('o universo não contém corpos HISTÓRICOS — a rel_estoque_asof_filiais viva vem da migration mais nova que a define', () => {
    const def = J.vivas.get('public.rel_estoque_asof_filiais(smallint[],date)')
    expect(def, 'rel_estoque_asof_filiais deveria estar viva desde a 0143 (F60 · lote 2)').toBeDefined()
    // A migration mais nova que define esta assinatura, medida por varredura direta
    // (sem usar o replay) — se o replay escolhesse um corpo mais antigo, este número
    // seria diferente e o teste acusaria.
    const definidoras = MIGRATIONS.filter((m) =>
      /create\s+(or\s+replace\s+)?function\s+public\.rel_estoque_asof_filiais\s*\(/i.test(m.sql),
    ).map((m) => m.arquivo)
    expect(definidoras.length).toBeGreaterThan(0)
    expect(def!.arquivo, 'o replay pegou um corpo que não é o da migration mais nova').toBe(definidoras.at(-1))
  })

  // F60 · lote 2 — o replay LÊ `drop function`: a `0134` ainda define `rel_estoque_asof(smallint,
  // date)` no disco, e é a `0145` que a tira do universo. `corpoVigente` não enxerga o drop (PLAN-F60
  // §1.2 (l)); a mesa, sim — e é isto que prova.
  it('as SETE assinaturas velhas saíram do universo pelo drop da 0145, ainda que o create delas continue no disco', () => {
    for (const velha of [
      'public.rel_estoque_asof(smallint,date)',
      'public.rel_saldo_itens(smallint,date)',
      'public.rel_mov_itens(smallint,date,date)',
      'public.rel_frescor_itens(smallint,date)',
      'public.rel_mov_por_mes(smallint,date,date)',
      'public.rel_por_motivo(smallint,date,date)',
      'public.rel_resumo(smallint,date,date)',
    ]) {
      expect(J.vivas.has(velha), `${velha} continua viva no replay`).toBe(false)
    }
    expect(MIGRATIONS.some((m) => /create\s+(or\s+replace\s+)?function\s+public\.rel_estoque_asof\s*\(/i.test(m.sql))).toBe(true)
  })

  it('as vivas de hoje (F60 · lote 2): as sete rel_*_filiais, a dos KPIs (0141) e a exceção por pessoa — nove', () => {
    const nomes = [...J.vivas.keys()].map((k) => k.split('(')[0])
    for (const esperado of [
      'public.rel_estoque_asof_filiais',
      'public.rel_saldo_itens_filiais',
      'public.rel_mov_itens_filiais',
      'public.rel_frescor_itens_filiais',
      'public.rel_mov_por_mes_filiais',
      'public.rel_por_motivo_filiais',
      'public.rel_resumo_filiais',
      'public.rel_contagem_status_filiais',
      'public.rel_saldo_colaborador',
    ]) {
      expect(nomes, `${esperado} não está entre as vivas`).toContain(esperado)
    }
    expect(J.vivas.size, 'rel_* viva a mais ou a menos que as nove esperadas').toBe(9)
  })

  it('nome CITADO ("rel_x") entra no universo como qualquer outro rel_* (revisão adversarial F60 — achado 2 "falsos-positivos": antes, definicoesDeFuncao não lia identificador citado e a falha reprovava com diagnóstico confuso)', () => {
    const sql = 'create function public."rel_f60_citado"(p_filiais smallint[]) returns int language sql stable security invoker set search_path = public as $$ select 1 from t where t.filial_id = any (p_filiais); $$;'
    const j = comSintetica(sql, '0200_laco_f60.sql')
    expect(j.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
    expect(j.vivas.has('public.rel_f60_citado(smallint[])')).toBe(true)
  })
})

describe('2. falha fechada — o que o replay não lê reprova, nunca é pulado', () => {
  it('DDL de rel_* dentro de execute format(…) → reprova com arquivo e linha', () => {
    const j = comSintetica(
      "do $$\nbegin\n  execute format('create function public.rel_x(p_filiais smallint[]) returns int language sql as %L', 'select 1');\nend $$;",
      '0200_laco_f60.sql',
    )
    expect(j.falhas.find((f) => /dinamicamente/.test(f.motivo))).toMatchObject({ arquivo: '0200_laco_f60.sql' })
    expect(j.falhas.every((f) => f.arquivo === '0200_laco_f60.sql')).toBe(true)
  })

  it('drop function de uma rel_* inexistente, SEM if exists → reprova', () => {
    const j = comSintetica('drop function public.rel_inexistente_f60(int);', '0200_laco_f60.sql')
    expect(j.falhas.some((f) => /não conhece/.test(f.motivo) && f.arquivo === '0200_laco_f60.sql')).toBe(true)
  })

  it('drop function de uma rel_* inexistente, COM if exists → não reprova (o Postgres também deixaria passar)', () => {
    const j = comSintetica('drop function if exists public.rel_inexistente_f60(int);', '0200_laco_f60.sql')
    expect(j.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
  })

  it('alter function rename de FORA do prefixo rel_ PARA dentro dele → reprova fechado (a trava não conhece o corpo)', () => {
    const j = comSintetica('alter function public.fora_do_prefixo_f60(int) rename to rel_entrou_f60;', '0200_laco_f60.sql')
    expect(j.falhas.some((f) => /rename to/.test(f.motivo) && f.arquivo === '0200_laco_f60.sql')).toBe(true)
  })

  // F60 · lote 2: os dois sintéticos de `alter function` agem sobre `rel_saldo_itens_filiais` — a
  // `rel_saldo_itens(smallint, date)` que eles usavam saiu do universo pela `0145`, e contra uma
  // `rel_*` que NÃO existe o replay reprova por "não conhece", não por "não replica": o teste de
  // `strict` ficaria vermelho pelo motivo errado. A régua é a mesma; muda só a função VIVA.
  it('alter function set/security/strict numa rel_* viva → reprova fechado (a trava não replica o efeito)', () => {
    const j = comSintetica('alter function public.rel_saldo_itens_filiais(smallint[], date) strict;', '0200_laco_f60.sql')
    expect(j.falhas.some((f) => /não replica/.test(f.motivo) && f.arquivo === '0200_laco_f60.sql')).toBe(true)
  })

  it('alter function … strict numa rel_* que o drop já tirou do universo → reprova por "não conhece"', () => {
    const j = comSintetica('alter function public.rel_saldo_itens(smallint, date) strict;', '0200_laco_f60.sql')
    expect(j.falhas.some((f) => /não conhece/.test(f.motivo) && f.arquivo === '0200_laco_f60.sql')).toBe(true)
  })

  it('alter function owner to numa rel_* viva → NÃO reprova (ignorado, por decisão explícita)', () => {
    const j = comSintetica('alter function public.rel_saldo_itens_filiais(smallint[], date) owner to postgres;', '0200_laco_f60.sql')
    expect(j.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
  })

  it('comando ilegível (drop function sem nome legível) → reprova, nunca é pulado', () => {
    const j = comSintetica('drop function public.rel_x_f60(smallint, ****);', '0200_laco_f60.sql')
    expect(j.falhas.some((f) => f.arquivo === '0200_laco_f60.sql')).toBe(true)
  })

  it('alter function … rename to (destino FORA de rel_) é seguido — a função some do universo, sem falha', () => {
    const sql = [
      funcaoRel('rel_temp_f60', 'p_filiais smallint[]', 'select 1 where 1 = any (p_filiais);'),
      'alter function public.rel_temp_f60(smallint[]) rename to nao_e_mais_rel_f60;',
    ].join('\n')
    const j = comSintetica(sql, '0200_laco_f60.sql')
    expect(j.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
    expect(j.vivas.has('public.rel_temp_f60(smallint[])')).toBe(false)
  })

  // ---------------------------------------------------------------------
  // `routine` É `function` (revisão do lote 2, F60). No Postgres `alter routine` e `drop routine`
  // agem sobre FUNÇÃO; até a revisão, o replay só lia a palavra `function` e a auto-conferência só
  // casava `function`. Medido pelo revisor: `alter routine public.<sem recorte>() rename to rel_x`
  // entrava no prefixo com `vivas` 9 e zero violações, e `drop routine` de uma `rel_*` a deixava
  // VIVA no replay (`<scratchpad>/evidencias/revisao-lote2-recorte-rel-routine.txt`). A mesma
  // régua de `migrations-f38.test.ts::funcoesDerrubadas` (commit 2020641): `routine` entra,
  // `procedure` não. Os casos abaixo espelham, um a um, os de `function` acima.
  // ---------------------------------------------------------------------

  it.each([
    ['nu', 'alter routine public.x_sem_recorte_f60() rename to rel_x_f60;'],
    ['em maiúsculas, esquema e nomes citados', 'ALTER ROUTINE "public"."x_sem_recorte_f60"() RENAME TO "rel_x_f60";'],
  ])('alter routine rename de uma função SEM recorte para dentro do prefixo rel_ (%s) → reprova fechado, e a mesa não fica verde', (_nome, alter) => {
    const sql = [
      'create function public.x_sem_recorte_f60() returns table (x int) language sql stable security invoker set search_path = public as $$ select 1 from public.movimentacoes m; $$;',
      alter,
    ].join('\n')
    const j = comSintetica(sql, '0200_laco_f60.sql')
    expect(j.falhas.some((f) => /alter routine .*rename to rel_x_f60/.test(f.motivo) && f.arquivo === '0200_laco_f60.sql')).toBe(true)
    expect(j.vivas.has('public.rel_x_f60()'), 'a função sem recorte entrou no universo sem corpo conhecido').toBe(false)
  })

  it('drop routine de uma rel_* viva → sai do universo, sem falha, e a auto-conferência CONTA o comando', () => {
    const j = comSintetica('drop routine public.rel_saldo_itens_filiais(smallint[], date);', '0200_laco_f60.sql')
    expect(j.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
    expect(j.vivas.has('public.rel_saldo_itens_filiais(smallint[],date)'), 'drop routine deixou a rel_* viva no replay').toBe(false)
    expect(j.vivas.size).toBe(J.vivas.size - 1)
    // o replay consumiu E o casamento léxico enxergou — uma conta sem a outra é a auto-conferência cega
    expect(j.consumidos - J.consumidos, 'o replay não consumiu o drop routine').toBe(1)
    expect(j.encontrados - J.encontrados, 'a auto-conferência não enxergou o drop routine').toBe(1)
  })

  it('drop routine de uma rel_* inexistente: SEM if exists reprova por "não conhece"; COM if exists passa', () => {
    const sem = comSintetica('drop routine public.rel_inexistente_f60(int);', '0200_laco_f60.sql')
    expect(sem.falhas.some((f) => /drop routine de uma rel_\* que o replay não conhece/.test(f.motivo) && f.arquivo === '0200_laco_f60.sql')).toBe(true)
    const com = comSintetica('drop routine if exists public.rel_inexistente_f60(int);', '0200_laco_f60.sql')
    expect(com.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
  })

  it('alter routine … strict numa rel_* viva → reprova fechado como o alter function (a trava não replica o efeito)', () => {
    const j = comSintetica('alter routine public.rel_saldo_itens_filiais(smallint[], date) strict;', '0200_laco_f60.sql')
    expect(j.falhas.some((f) => /alter routine .*não replica/.test(f.motivo) && f.arquivo === '0200_laco_f60.sql')).toBe(true)
  })

  it('alter routine owner to numa rel_* viva → NÃO reprova; alter routine rename para fora de rel_ → sai do universo', () => {
    const dono = comSintetica('alter routine public.rel_saldo_itens_filiais(smallint[], date) owner to postgres;', '0200_laco_f60.sql')
    expect(dono.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
    const saiu = comSintetica('alter routine public.rel_saldo_itens_filiais(smallint[], date) rename to nao_e_mais_rel_f60;', '0200_laco_f60.sql')
    expect(saiu.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
    expect(saiu.vivas.has('public.rel_saldo_itens_filiais(smallint[],date)')).toBe(false)
  })

  it('DDL de routine sobre rel_* em texto de corpo $…$ (sem execute) → a AUTO-CONFERÊNCIA reprova como montado dinamicamente', () => {
    // Sem `execute`, `executesSuspeitosFuncaoRel` não acha nada: quem reprova aqui é só o
    // casamento léxico. É o caso que prova, sozinho, que `PADRAO_DDL_FUNCAO_REL` enxerga `routine`.
    const j = comSintetica("do $$\nbegin\n  raise notice 'drop routine public.rel_saldo_itens_filiais(smallint[], date)';\nend $$;", '0200_laco_f60.sql')
    expect(j.falhas.some((f) => /dinamicamente/.test(f.motivo) && /drop routine/.test(f.motivo) && f.arquivo === '0200_laco_f60.sql')).toBe(true)
  })
})

describe('3. a doutrina, contra as rel_* VIVAS', () => {
  // ⚠ Até o lote 2 da Frente D ESTE TESTE FICOU VERMELHO, nomeando as SETE `rel_*`
  // que usavam `p_filial smallint` — a trava veio antes da correção (a ordem F60,
  // Frente C, regra 4 do §4 do plano). Desde a `0143`/`0145` ele é VERDE com as
  // nove vivas. NÃO AFROUXE esta asserção para caber uma `rel_*` nova: é a função
  // que se corrige. `rel_saldo_colaborador` não aparece — é exceção declarada
  // (describe 4).
  it('nenhuma rel_* fora de R1–R4, salvo exceção declarada', () => {
    expect(J.violacoes.map(mensagemDeViolacao)).toEqual([])
  })
})

describe('4. as exceções — lidas do .sql, formato válido, cada uma viva e sem p_filiais', () => {
  it('a lista de exceções está no formato certo (migration, motivo e destino na linha)', () => {
    expect(J.excecoes.problemas).toEqual([])
    expect(J.excecoes.entradas.length, 'k_excecoes_recorte vazio: a leitura quebrou?').toBeGreaterThan(0)
  })

  it('rel_saldo_colaborador é a exceção declarada, viva, e sem p_filiais', () => {
    const entrada = J.excecoes.entradas.find((e) => e.nome === 'rel_saldo_colaborador')
    expect(entrada, 'rel_saldo_colaborador deveria estar em k_excecoes_recorte (fato 5 da ordem F60)').toBeDefined()
    const def = J.vivas.get('public.rel_saldo_colaborador(uuid)')
    expect(def, 'a exceção declarada não corresponde a nenhuma rel_* viva').toBeDefined()
    expect(checarR1(def!.argumentos).ok, 'a exceção deveria NÃO declarar p_filiais (senão é exceção morta)').toBe(false)
  })

  it('nenhuma violação classificada como "exceção morta" (guarda: a mesa também julga nesse sentido)', () => {
    expect(J.violacoes.filter((v) => v.regra === 'exceção morta')).toEqual([])
  })

  it('nenhuma exceção com overload nem exceção órfã na cadeia real (guarda: a mesa também julga nesses sentidos)', () => {
    expect(J.violacoes.filter((v) => v.regra === 'exceção com overload')).toEqual([])
    expect(J.violacoes.filter((v) => v.regra === 'exceção órfã')).toEqual([])
  })

  it('um SEGUNDO overload do nome isento NÃO herda a isenção — revisão adversarial F60, achado CRÍTICO ("a exceção casa por NOME, não por assinatura"): reprova a própria ambiguidade E devolve as duas assinaturas para R1–R4, sem afrouxar nada', () => {
    const sql =
      'create function public.rel_saldo_colaborador(p_colaborador uuid, p_extra boolean) returns table (x int) language sql stable security invoker set search_path = public as $$ select l.item_id from public.lancamentos_item l where l.colaborador_id = p_colaborador; $$;'
    const novas = violacoesNovas(sql)
    expect(novas.some((v) => v.regra === 'exceção com overload' && v.funcao === 'public.rel_saldo_colaborador')).toBe(true)
    // a assinatura ORIGINAL, que era exceção, também deixa de ser isenta — o
    // overload invalida a exceção nos dois lados, não só no lado novo.
    expect(novas.some((v) => v.regra === 'R1' && v.mensagem.includes('public.rel_saldo_colaborador(uuid)'))).toBe(true)
    expect(novas.some((v) => v.regra === 'R1' && v.mensagem.includes('public.rel_saldo_colaborador(uuid,boolean)'))).toBe(true)
  })

  it('exceção que não corresponde a NENHUMA rel_* viva ("exceção órfã") reprova — julgamento nos dois sentidos do módulo C da spec', () => {
    const catalogoComOrfa =
      "  k_excecoes_recorte text[] := array[\n    'rel_f60_nao_existe' -- 0001 · motivo: uma frase de teste com mais de quarenta caracteres de verdade · destino: permanente\n  ];\n"
    const j = julgarRecorte({ migrations: MIGRATIONS, sqlCatalogo: catalogoComOrfa })
    expect(j.violacoes.some((v) => v.regra === 'exceção órfã' && v.funcao === 'public.rel_f60_nao_existe')).toBe(true)
  })

  it('TABELAS_SEM_FILIAL não têm coluna filial_id em migration nenhuma', () => {
    for (const tabela of TABELAS_SEM_FILIAL) {
      const criaComFilial = MIGRATIONS.some((m) => {
        const re = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${tabela}\\s*\\(([\\s\\S]*?)\\n\\)\\s*;`, 'i')
        const m2 = re.exec(m.sql)
        return m2 ? /\bfilial_id\b/i.test(m2[1]) : false
      })
      const alteraComFilial = MIGRATIONS.some((m) => {
        const re = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?${tabela}\\b[^;]*add\\s+column[^;]*filial_id`, 'i')
        return re.test(m.sql)
      })
      expect(criaComFilial || alteraComFilial, `${tabela} ganhou coluna filial_id em algum lugar — não pode mais ser TABELAS_SEM_FILIAL`).toBe(false)
    }
  })
})

describe('5. a guarda do próprio teste — SQL sintético EM MEMÓRIA (nunca migration nova em disco)', () => {
  // Sem esta guarda, um casador quebrado deixaria os describes 1–4 verdes por
  // vazio ou por sorte. Nada aqui vira arquivo em `supabase/migrations/`.

  it.each([
    ['R1 · sem p_filiais (a forma velha)', funcaoRel('rel_f60_x', 'p_filial smallint', '(p_filial is null or col = p_filial)'), ['R1']],
    // As formas com DUAS ocorrências de "p_filiais" (a bare + a ligada) reprovam
    // em DUAS frentes — a ocorrência solta por R2 (fora da forma exata) e a
    // ocorrência ligada por R3 (a disjunção/o "else" tira a conjunção direta). É
    // uma trava MAIS severa, não mais fraca: as duas formas do fail-open caem.
    ['R2+R3 · is null or (fail-open clássico)', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select 1 from t where p_filiais is null or col = any (p_filiais);'), ['R2', 'R3']],
    ['R2+R3 · = any (p_filiais) or p_filiais is null', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select 1 from t where col = any (p_filiais) or p_filiais is null;'), ['R2', 'R3']],
    ['R2 · coalesce(p_filiais, …)', funcaoRel('rel_f60_x', 'p_filiais smallint[]', "select 1 from t where col = any (coalesce(p_filiais, array[col]));"), ['R2']],
    ['R2 · coalesce(p_x, col) = col com p_filiais aberto', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select 1 from t where coalesce(p_x, col) = col and p_filiais is null;'), ['R2']],
    ['R2+R3 · case when p_filiais is null then true else col = any(p_filiais) end', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select 1 from t where case when p_filiais is null then true else col = any (p_filiais) end;'), ['R2', 'R3']],
    ['R2 · nullif(p_filiais, …)', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select 1 from t where col = any (nullif(p_filiais, array[]::smallint[]));'), ['R2']],
    ['R2 · declarado e não usado', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select 1 from t;'), ['R2']],
    ['R2 · ligado só por <> all', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select 1 from t where col <> all (p_filiais);'), ['R2']],
    ['R3 · not (col = any (p_filiais))', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select 1 from t where not (col = any (p_filiais));'), ['R3']],
    ['R3 · comparação na lista do select (a forma passa em R2, mas não está conjunção-direta de nada)', funcaoRel('rel_f60_x', 'p_filiais smallint[]', 'select (col = any (p_filiais)) from t;'), ['R3']],
  ])('%s → reprova nomeando a(s) regra(s) esperada(s)', (_nome, sql, regrasEsperadas) => {
    const novas = violacoesNovas(sql)
    expect(novas.length, 'a função sintética não produziu violação — o casador está quebrado').toBeGreaterThan(0)
    expect(novas.map((v) => v.regra).sort()).toEqual([...regrasEsperadas].sort())
  })

  it('rel_* sem parâmetro de recorte NENHUM → reprova R1', () => {
    const sql = funcaoRel('rel_f60_x', 'p_de date, p_ate date', 'select 1 from t where t.data between p_de and p_ate;')
    const novas = violacoesNovas(sql)
    expect(novas).toHaveLength(1)
    expect(novas[0].regra).toBe('R1')
  })

  it('R4 · um total por union all cujo ramo lê lancamentos_item SEM recorte → reprova', () => {
    const sql = funcaoRel(
      'rel_f60_x',
      'p_filiais smallint[]',
      [
        'select l.item_id from public.lancamentos_item l where l.filial_id = any (p_filiais)',
        'union all',
        'select l2.item_id from public.lancamentos_item l2;',
      ].join('\n  '),
    )
    const novas = violacoesNovas(sql)
    expect(novas).toHaveLength(1)
    expect(novas[0].regra).toBe('R4')
  })

  it('R4 · CTE que lê movimentacoes SEM recorte enquanto o select final recorta → reprova', () => {
    const sql = funcaoRel(
      'rel_f60_x',
      'p_filiais smallint[]',
      [
        'with total as (',
        '  select m.ativo_id, count(*) as n from public.movimentacoes m group by m.ativo_id',
        ')',
        'select t.n from total t join public.ativos a on a.id = t.ativo_id where a.filial_id = any (p_filiais);',
      ].join('\n  '),
    )
    const novas = violacoesNovas(sql)
    expect(novas).toHaveLength(1)
    expect(novas[0].regra).toBe('R4')
  })

  it('R4 · subconsulta escalar na lista do select lendo ativos SEM recorte → reprova', () => {
    const sql = funcaoRel(
      'rel_f60_x',
      'p_filiais smallint[]',
      [
        'select m.id, (select count(*) from public.ativos a where a.id = m.ativo_id) as n',
        'from public.movimentacoes m',
        'where m.filial_id = any (p_filiais);',
      ].join('\n  '),
    )
    const novas = violacoesNovas(sql)
    expect(novas).toHaveLength(1)
    expect(novas[0].regra).toBe('R4')
  })

  // ---------------------------------------------------------------------
  // Os cinco casos abaixo vêm da revisão adversarial da F60 (três revisores
  // independentes) — cada um é um "coberto" que passava por R2+R3 e por R4
  // sem cobrir de fato o que deveria, e por isso é reprovado agora. NÃO
  // AFROUXAR nenhum deles para caber um caso que devia reprovar.
  // ---------------------------------------------------------------------

  it('R4 · "Furo 3" (revisor "furos") — JOIN cobre a tabela vizinha filtrando uma coluna que NÃO é a de filial (mov.id, não mov.filial_id) → reprova as DUAS tabelas', () => {
    const sql = funcaoRel(
      'rel_f60_furo3',
      'p_filiais smallint[]',
      [
        'select mov.id, ativo.patrimonio',
        'from public.movimentacoes mov',
        'join public.ativos ativo on ativo.id = mov.ativo_id',
        'where mov.id = any (p_filiais);',
      ].join('\n  '),
    )
    const novas = violacoesNovas(sql)
    expect(novas.length).toBeGreaterThan(0)
    expect(novas.every((v) => v.regra === 'R4')).toBe(true)
  })

  it('R4 · "Furo 2" (revisor "furos") — exists() sem NENHUMA correlação com o pai herda cobertura só por estar dentro de um WHERE coberto → reprova', () => {
    const sql = funcaoRel(
      'rel_f60_furo2',
      'p_filiais smallint[]',
      [
        'select a.id from public.ativos a',
        'where a.filial_id = any (p_filiais)',
        "  and exists (select 1 from public.movimentacoes m where m.tipo = 'transferencia');",
      ].join('\n  '),
    )
    const novas = violacoesNovas(sql)
    expect(novas).toHaveLength(1)
    expect(novas[0].regra).toBe('R4')
  })

  it('R4 · subconsulta escalar em WHERE, sem exists()/in() — não é a forma que a spec descreve e não herda (achado 1, revisor "catálogo")', () => {
    const sql = funcaoRel(
      'rel_f60_where_escalar',
      'p_filiais smallint[]',
      [
        'select m.id from public.movimentacoes m',
        'where m.filial_id = any (p_filiais)',
        '  and (select max(l.quantidade) from public.lancamentos_item l) > 100;',
      ].join('\n  '),
    )
    const novas = violacoesNovas(sql)
    expect(novas).toHaveLength(1)
    expect(novas[0].regra).toBe('R4')
  })

  it('R4 · subconsulta em ORDER BY nunca herda — a spec proíbe por nome, mas o balde de cláusulas estava misturado (achado 1, revisor "catálogo")', () => {
    const sql = funcaoRel(
      'rel_f60_order_by',
      'p_filiais smallint[]',
      ['select m.id from public.movimentacoes m', 'where m.filial_id = any (p_filiais)', 'order by (select max(l.quantidade) from public.lancamentos_item l);'].join('\n  '),
    )
    const novas = violacoesNovas(sql)
    expect(novas).toHaveLength(1)
    expect(novas[0].regra).toBe('R4')
  })

  it('R4 · subconsulta em HAVING sem exists()/in() nunca herda — mesmo balde misturado do achado 1 (revisor "catálogo")', () => {
    const sql = funcaoRel(
      'rel_f60_having',
      'p_filiais smallint[]',
      [
        'select m.id, count(*) from public.movimentacoes m',
        'where m.filial_id = any (p_filiais)',
        'group by m.id',
        'having sum((select l.quantidade from public.lancamentos_item l limit 1)) > 0;',
      ].join('\n  '),
    )
    const novas = violacoesNovas(sql)
    expect(novas).toHaveLength(1)
    expect(novas[0].regra).toBe('R4')
  })

  it.each([
    ['a forma simples', 'select 1 from public.movimentacoes m where m.filial_id = any (p_filiais);'],
    [
      'on … and … between … and … (o "and" do between não é conjunção de topo)',
      'select 1 from public.lancamentos_item l join public.itens i on l.item_id = i.id and l.data between current_date - 30 and current_date and l.filial_id = any (p_filiais);',
    ],
    [
      'a guarda "where exists (select 1 from filiais f where f.id = any (p_filiais))"',
      'select 1 from public.itens i where exists (select 1 from public.filiais f where f.id = any (p_filiais));',
    ],
    [
      'exists() CORRELACIONADO ao pai (contraste com o "Furo 2" acima — a mesma forma sintática, mas com relação real) → passa',
      "select m.id from public.movimentacoes m where m.filial_id = any (p_filiais) and exists (select 1 from public.ativos a where a.id = m.ativo_id and a.categoria = 'notebook');",
    ],
    [
      'JOIN por chave primária a partir de uma tabela já recortada (rel_resumo_filiais, corpos-novos.sql §3) — ativos/filiais entram sem repetir o filtro, e isso é o padrão CERTO, não o "Furo 3"',
      'select m.tipo, f.slug, a.categoria from public.movimentacoes m join public.ativos a on a.id = m.ativo_id join public.filiais f on f.id = m.filial_id where m.filial_id = any (p_filiais);',
    ],
  ])('%s → passa (nenhuma violação nova)', (_nome, corpo) => {
    const sql = funcaoRel('rel_f60_x', 'p_filiais smallint[]', corpo)
    expect(violacoesNovas(sql)).toEqual([])
  })

  it('a forma de DOIS NÍVEIS de rel_saldo_itens_filiais (corpos-novos.sql §6) → passa', () => {
    const corpo = `
    with alvo as (
      select f.id as filial_id from public.filiais f where f.id = any (p_filiais)
    ),
    niveis as (
      select a.filial_id from alvo a
      union all
      select null::smallint where exists (select 1 from alvo)
    ),
    rows as (
      select l.item_id, l.filial_id, l.quantidade
      from public.lancamentos_item l
      where l.filial_id = any (p_filiais)
    ),
    tot as (
      select item_id, filial_id, sum(quantidade) as total
      from rows
      group by grouping sets ((item_id, filial_id), (item_id))
    )
    select n.filial_id, i.id, coalesce(t.total, 0) as total
    from niveis n
    cross join public.itens i
    left join tot t on t.item_id = i.id and t.filial_id is not distinct from n.filial_id;`
    const sql = funcaoRel('rel_f60_dois_niveis', 'p_filiais smallint[]', corpo)
    expect(violacoesNovas(sql)).toEqual([])
  })

  it('o as-of lateral (corpos-novos.sql §7, ancorado em ativos, recorte na filial CALCULADA) → passa', () => {
    const corpo = `
    select a.id, e.filial_id
    from public.ativos a
    cross join lateral (
      select m.filial_id
      from public.movimentacoes m
      where m.ativo_id = a.id and m.data <= current_date
      order by m.data desc, m.ordem desc
      limit 1
    ) u
    cross join lateral (
      select coalesce(u.filial_id, a.filial_id) as filial_id
    ) e
    where e.filial_id = any (p_filiais);`
    const sql = funcaoRel('rel_f60_asof', 'p_filiais smallint[]', corpo)
    expect(violacoesNovas(sql)).toEqual([])
  })
})

describe('6. ligacoesDoParametro e checarR1/checarR4 — casos unitários (sem replay)', () => {
  it('checarR1: argumento presente mas tipo errado', () => {
    const r = checarR1([{ nome: 'p_filiais', tipo: 'smallint' }])
    expect(r.ok).toBe(false)
  })

  it('checarR1: aceita as variações de escrita do tipo (int2[], smallint [], _int2)', () => {
    for (const tipo of ['smallint[]', 'int2[]', 'smallint []', '_int2']) {
      expect(checarR1([{ nome: 'p_filiais', tipo }]).ok, tipo).toBe(true)
    }
  })

  it('ligacoesDoParametro: zero ocorrências não é R2 nem R3, é "não usa"', () => {
    const r = ligacoesDoParametro('select 1;')
    expect(r.ocorrencias).toBe(0)
    expect(r.ok).toBe(false)
  })

  it('checarR4: corpo ilegível (não começa com select/with) é reportado, não lançado', () => {
    const r = checarR4('insert into x values (1);', [])
    expect(r.ok).toBe(false)
    expect(r.ilegivel).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 7. A REVISÃO FINAL DA F60 (17/09/2026) — furos da trava medidos pela revisão adversarial e
// confirmados por um cético, cada um com a forma que a mesa deixava passar. Toda forma que
// reprova abaixo devolve o acervo inteiro (ou, no mínimo, linhas) com `p_filiais` nulo ou vazio,
// ou esconde da mesa o corpo de verdade — e a mesa estava VERDE para ela. NÃO AFROUXAR: a função
// que precisar de uma dessas formas é que se reescreve.
// ---------------------------------------------------------------------------

describe('7a. R3 julga a PRECEDÊNCIA — o `and` liga mais forte que o `or`', () => {
  it.each([
    ['or à esquerda de uma cadeia de and', 'select m.id from public.movimentacoes m where m.data >= current_date or true and m.filial_id = any (p_filiais);'],
    ['or à esquerda, dois termos antes', "select m.id from public.movimentacoes m where 1 = 1 or m.tipo = 'saida' and m.filial_id = any (p_filiais);"],
    ['or à direita, depois de um and', 'select m.id from public.movimentacoes m where m.filial_id = any (p_filiais) and true or true;'],
    ['or à direita, com termo no meio', 'select m.id from public.movimentacoes m where m.filial_id = any (p_filiais) and m.id is not null or true;'],
    ['no on de uma junção', 'select l.id from public.itens i join public.lancamentos_item l on l.item_id = i.id or true and l.filial_id = any (p_filiais);'],
    ['o as-of disfarçado', 'select e.filial_id from public.ativos e where e.filial_id is not null or true and e.filial_id = any (p_filiais);'],
    ['negação colada na ligação', "select 1 from public.movimentacoes m where m.tipo = 'x' and not m.filial_id = any (p_filiais);"],
  ])('%s → reprova R3', (_nome, corpo) => {
    const novas = violacoesNovas(funcaoRel('rel_f60_prec', 'p_filiais smallint[]', corpo))
    expect(novas.map((v) => v.regra)).toEqual(['R3'])
  })

  it.each([
    ['$1 is null depois da ligação', 'select m.id from public.movimentacoes m where m.filial_id = any (p_filiais) and true or $1 is null;'],
    ['$1 is null antes da ligação', 'select m.id from public.movimentacoes m where $1 is null or true and m.filial_id = any (p_filiais);'],
  ])('referência POSICIONAL — %s → reprova R2 (o $1) e R3 (o or)', (_nome, corpo) => {
    const novas = violacoesNovas(funcaoRel('rel_f60_pos', 'p_filiais smallint[]', corpo))
    expect(novas.map((v) => v.regra).sort()).toEqual(['R2', 'R3'])
    expect(novas.some((v) => /posicional "\$1"/.test(v.mensagem))).toBe(true)
  })

  it.each([
    ['grupo que é conjunção', "select 1 from public.movimentacoes m where (m.filial_id = any (p_filiais) and m.tipo = 'x');"],
    ['or AGRUPADO antes da ligação', "select 1 from public.movimentacoes m where (m.tipo = 'a' or m.tipo = 'b') and m.filial_id = any (p_filiais);"],
    ['case … end com or por dentro, antes', "select 1 from public.movimentacoes m where case when m.tipo = 'a' or m.tipo = 'b' then true else false end and m.filial_id = any (p_filiais);"],
    ['case … end com or por dentro, depois', "select 1 from public.movimentacoes m where m.filial_id = any (p_filiais) and case when m.tipo = 'a' or m.tipo = 'b' then true else false end;"],
    ['is not distinct from no caminho', 'select 1 from public.movimentacoes m where m.estorno_de is not distinct from null and m.filial_id = any (p_filiais);'],
    ['left()/right() são funções, não junções', "select 1 from public.movimentacoes m where left(m.tipo::text, 1) = 's' and m.filial_id = any (p_filiais) and right(m.tipo::text, 1) = 'a';"],
  ])('%s → passa', (_nome, corpo) => {
    expect(violacoesNovas(funcaoRel('rel_f60_prec_ok', 'p_filiais smallint[]', corpo))).toEqual([])
  })
})

describe('7b. R4 por TABELA — junção externa, junção decorativa e correlação de verdade', () => {
  it.each([
    ['LEFT JOIN: a ligação no on não filtra o lado preservado (ativos)', 'select a.id from public.ativos a left join public.filiais f on f.id = a.filial_id and f.id = any (p_filiais);'],
    ['LEFT JOIN: contagem por ativo, movimentações recortadas no on', 'select a.id, count(m.id) from public.ativos a left join public.movimentacoes m on m.ativo_id = a.id and m.filial_id = any (p_filiais) group by a.id;'],
    ['LEFT JOIN: o recorte no on do lado juntado, preservando movimentacoes', 'select m.id from public.movimentacoes m left join public.ativos a on a.id = m.ativo_id and a.filial_id = any (p_filiais);'],
    ['LEFT JOIN: a ligação do lado preservado dentro do on', 'select m.id from public.movimentacoes m left join public.ativos a on a.id = m.ativo_id and m.filial_id = any (p_filiais);'],
    ['RIGHT JOIN: preserva o lado direito', 'select a.id from public.movimentacoes m right join public.ativos a on m.filial_id = any (p_filiais);'],
    ['FULL JOIN: não restringe lado nenhum', 'select a.id from public.movimentacoes m full join public.ativos a on a.id = m.ativo_id and m.filial_id = any (p_filiais);'],
    ['cross join decorativo com filiais', 'select distinct m.id from public.movimentacoes m cross join public.filiais f where f.id = any (p_filiais);'],
    ['vírgula decorativa com filiais', 'select m.id from public.movimentacoes m, public.filiais f where f.id = any (p_filiais);'],
    ['cross join decorativo com uma tabela que TEM filial_id', 'select m.id from public.movimentacoes m cross join public.ativos a where a.filial_id = any (p_filiais);'],
    ['igualdade que não é de chave', 'select a.id from public.movimentacoes m join public.ativos a on a.categoria = m.categoria where m.filial_id = any (p_filiais);'],
    ['(table x) no FROM é leitura de tabela', 'select m.id from public.filiais f, (table public.movimentacoes) m where f.id = any (p_filiais);'],
    ['derivada NÃO-lateral com alias que sombreia o de fora', 'select x.id from public.filiais f, (select f.id from public.ativos f) x where f.id = any (p_filiais);'],
    ['exists que só MENCIONA o alias de fora, sem igualdade de chave', "select a.id from public.ativos a where a.filial_id = any (p_filiais) and exists (select 1 from public.movimentacoes m where m.tipo = 'x' and a.id is not null);"],
    ['lateral com "filial_id" constante, sem ler a filial de ninguém', 'select m.id from public.movimentacoes m cross join lateral (select 1::smallint as filial_id where m.id is not null) e where e.filial_id = any (p_filiais);'],
    ['is not distinct from não esconde mais as junções seguintes do FROM', 'select m.id from public.movimentacoes m join public.ativos a on a.id = m.ativo_id and a.estorno_de is not distinct from m.id join public.lancamentos_item l on true where m.filial_id = any (p_filiais);'],
  ])('%s → reprova R4', (_nome, corpo) => {
    const novas = violacoesNovas(funcaoRel('rel_f60_r4', 'p_filiais smallint[]', corpo))
    expect(novas.map((v) => v.regra)).toEqual(['R4'])
  })

  it.each([
    ['função que lê tabela no FROM, num ramo de union', 'select null::int from public.filiais f where f.id = any (p_filiais) union all select * from public.le_tudo();'],
    ['função no FROM com alias', 'select m.id from public.movimentacoes m cross join public.le(m.id) x where m.filial_id = any (p_filiais);'],
    ['junção entre parênteses', 'select m.id from (public.movimentacoes m join public.ativos a on a.id = m.ativo_id) where m.filial_id = any (p_filiais);'],
  ])('%s → reprova R4 como ILEGÍVEL (falha fechada)', (_nome, corpo) => {
    const novas = violacoesNovas(funcaoRel('rel_f60_ileg', 'p_filiais smallint[]', corpo))
    expect(novas.map((v) => v.regra)).toEqual(['R4'])
    expect(novas[0].mensagem).toMatch(/ilegível/)
  })

  it.each([
    ['filiais recortada e movimentacoes por chave', 'select m.id from public.filiais f join public.movimentacoes m on m.filial_id = f.id where f.id = any (p_filiais);'],
    ['LEFT JOIN do lado juntado por chave a partir do recortado', 'select m.id, a.id from public.movimentacoes m left join public.ativos a on a.id = m.ativo_id where m.filial_id = any (p_filiais);'],
    ['RIGHT JOIN por chave a partir do recortado', 'select m.id from public.ativos a right join public.movimentacoes m on a.id = m.ativo_id where m.filial_id = any (p_filiais);'],
    ['vírgula com a igualdade de chave no where', 'select m.id from public.movimentacoes m, public.ativos a where a.id = m.ativo_id and m.filial_id = any (p_filiais);'],
    ['having na coluna de filial', 'select l.filial_id, count(*) from public.lancamentos_item l group by l.filial_id having l.filial_id = any (p_filiais);'],
    ['unnest no FROM (função do catálogo que não lê tabela)', 'select m.id from public.movimentacoes m cross join unnest(array[1, 2]) u(n) where m.filial_id = any (p_filiais);'],
    ['in (subconsulta) correlacionada por chave', 'select m.id from public.movimentacoes m where m.filial_id = any (p_filiais) and m.ativo_id in (select a.id from public.ativos a where a.id = m.ativo_id);'],
    ['a forma VIVA de rel_mov_itens_filiais (left join recortado + guarda exists)', 'select i.id, count(l.id) from public.itens i left join public.lancamentos_item l on l.item_id = i.id and l.filial_id = any (p_filiais) where exists (select 1 from public.filiais f where f.id = any (p_filiais)) group by i.id;'],
  ])('%s → passa', (_nome, corpo) => {
    expect(violacoesNovas(funcaoRel('rel_f60_r4_ok', 'p_filiais smallint[]', corpo))).toEqual([])
  })
})

describe('7c. o resultado tem de DEPENDER do recorte (nulo ou vazio → nada)', () => {
  it('rel_mov_itens_filiais SEM a guarda exists → reprova: o catálogo inteiro sai com p_filiais nulo', () => {
    const corpo =
      'select i.id, count(l.id) from public.itens i left join public.lancamentos_item l on l.item_id = i.id and l.filial_id = any (p_filiais) group by i.id;'
    const novas = violacoesNovas(funcaoRel('rel_f60_sem_guarda', 'p_filiais smallint[]', corpo))
    expect(novas.map((v) => v.regra)).toEqual(['R4'])
    expect(novas[0].mensagem).toMatch(/não depende do recorte/)
  })

  it('NOT exists não é guarda (nulo → verdadeiro) → reprova', () => {
    const corpo = 'select i.id from public.itens i where not exists (select 1 from public.filiais f where f.id = any (p_filiais));'
    const novas = violacoesNovas(funcaoRel('rel_f60_not_exists', 'p_filiais smallint[]', corpo))
    expect(novas.map((v) => v.regra)).toEqual(['R4'])
    expect(novas[0].mensagem).toMatch(/não depende do recorte/)
  })

  it('um ramo de union só com vocabulário → reprova, mesmo com o outro ramo recortado', () => {
    const corpo = 'select l.item_id from public.lancamentos_item l where l.filial_id = any (p_filiais) union all select i.id from public.itens i;'
    const novas = violacoesNovas(funcaoRel('rel_f60_ramo_vocab', 'p_filiais smallint[]', corpo))
    expect(novas.map((v) => v.regra)).toEqual(['R4'])
    expect(novas[0].mensagem).toMatch(/não depende do recorte/)
  })
})

describe('7d. o corpo julgado é o corpo que o Postgres executa', () => {
  it('dois comandos (o último é o que a função devolve) → reprova R4 como ilegível, mesmo com R3 verde no primeiro', () => {
    const corpo = 'select m.id from public.movimentacoes m where m.filial_id = any (p_filiais) order by 1; select m2.id from public.movimentacoes m2;'
    const novas = violacoesNovas(funcaoRel('rel_f60_dois_comandos', 'p_filiais smallint[]', corpo))
    expect(novas.map((v) => v.regra)).toEqual(['R4'])
    expect(novas[0].mensagem).toMatch(/2 comandos/)
    const lig = ligacoesDoParametro(corpo)
    expect(lig.falhas).toEqual([])
    expect(checarR4(corpo, lig.passantes).ilegivel).toMatch(/2 comandos/)
  })

  it('um default $d$…$d$ com texto-isca ANTES do corpo → a mesa lê o corpo depois do "as" (e reprova o or dele)', () => {
    const sql =
      'create function public.rel_f60_isca(p_filiais smallint[], p_isca text default $d$select 1 from public.movimentacoes m where m.filial_id = any (p_filiais)$d$) returns table (x uuid) language sql stable security invoker set search_path = public as $$ select m.id from public.movimentacoes m where true or m.filial_id = any (p_filiais) $$;'
    expect(violacoesNovas(sql).map((v) => v.regra)).toEqual(['R3'])
  })

  it('corpo entre ASPAS SIMPLES também é lido', () => {
    const sql =
      "create function public.rel_f60_aspas(p_filiais smallint[]) returns table (x uuid) language sql stable security invoker set search_path = public as 'select m.id from public.movimentacoes m where true or m.filial_id = any (p_filiais)';"
    expect(violacoesNovas(sql).map((v) => v.regra)).toEqual(['R3'])
  })
})

describe('7e. o replay não pula DDL de rel_* escrito de outro jeito', () => {
  const BS = String.fromCharCode(92)
  it.each([
    ['bloco do entre aspas com o nome partido por concatenação', "do 'begin execute ''create function public.re'' || ''l_f60_do(p_filiais smallint[]) returns setof int language sql as $b$ select 1 $b$''; end';"],
    ['bloco do em E-string com o nome em escape', `do E'begin execute ${BS}'create function public.${BS}x72el_f60_do(p_filiais smallint[]) returns setof int language sql as $b$ select 1 $b$${BS}'; end';`],
    ['função plpgsql com corpo entre aspas que monta a rel_*', "create function public.fabrica_f60() returns void language plpgsql as 'begin execute ''create function public.re'' || ''l_f60_fab() returns setof int language sql as $b$ select 1 $b$''; end';"],
  ])('%s → falha fechada com arquivo', (_nome, sql) => {
    const j = comSintetica(sql, '0200_laco_f60.sql')
    expect(j.falhas.some((f) => f.arquivo === '0200_laco_f60.sql' && /rel_/.test(f.motivo))).toBe(true)
  })

  it('texto comum que cita "execute" (comentário de função) NÃO é código e não reprova', () => {
    const j = comSintetica("comment on function public.rel_saldo_itens_filiais(smallint[], date) is 'execute com cuidado: rel_ de itens';", '0200_laco_f60.sql')
    expect(j.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
  })

  it.each([
    ['rename para U&"…" (o nome real não é lido)', 'alter function public.x_sem_recorte_f60() rename to U&"\\0072el_x_f60";'],
    ['drop de U&"…"', 'drop function U&"\\0072el_saldo_itens_filiais"(smallint[], date);'],
  ])('identificador em escape Unicode — %s → falha fechada', (_nome, ddl) => {
    const sql = [
      'create function public.x_sem_recorte_f60() returns table (x int) language sql stable security invoker set search_path = public as $$ select 1 from public.movimentacoes m; $$;',
      ddl,
    ].join('\n')
    const j = comSintetica(sql, '0200_laco_f60.sql')
    expect(j.falhas.some((f) => f.arquivo === '0200_laco_f60.sql' && /U&/.test(f.motivo))).toBe(true)
    expect(j.vivas.has('public.rel_x_f60()')).toBe(false)
  })
})

describe('7f. a identidade da função é a do Postgres, não a grafia', () => {
  it.each([
    ['int2[]', 'p_filiais int2[], p_data date'],
    ['smallint []', 'p_filiais smallint [], p_data date'],
    ['_int2', 'p_filiais _int2, p_data date'],
    ['pg_catalog.date', 'p_filiais smallint[], p_data pg_catalog.date'],
  ])('create or replace com %s SUBSTITUI a viva (não cria uma segunda chave)', (_nome, args) => {
    const sql = `create or replace function public.rel_saldo_itens_filiais(${args}) returns table (x int) language sql stable security invoker set search_path = public as $$ select 1 from public.lancamentos_item l where l.filial_id = any (p_filiais); $$;`
    const j = comSintetica(sql, '0200_laco_f60.sql')
    expect(j.vivas.size).toBe(J.vivas.size)
    expect(j.vivas.get('public.rel_saldo_itens_filiais(smallint[],date)')?.arquivo).toBe('0200_laco_f60.sql')
  })

  it('drop SEM lista de argumentos (nome único) derruba a viva', () => {
    const j = comSintetica('drop function if exists public.rel_saldo_itens_filiais;', '0200_laco_f60.sql')
    expect(j.falhas.filter((f) => f.arquivo === '0200_laco_f60.sql')).toEqual([])
    expect(j.vivas.has('public.rel_saldo_itens_filiais(smallint[],date)')).toBe(false)
    expect(j.vivas.size).toBe(J.vivas.size - 1)
  })

  it('drop SEM lista de argumentos com dois overloads vivos → falha fechada (o Postgres recusa)', () => {
    const sql = [
      funcaoRel('rel_saldo_itens_filiais', 'p_filiais smallint[]', 'select 1 from public.lancamentos_item l where l.filial_id = any (p_filiais);'),
      'drop function public.rel_saldo_itens_filiais;',
    ].join('\n')
    const j = comSintetica(sql, '0200_laco_f60.sql')
    expect(j.falhas.some((f) => f.arquivo === '0200_laco_f60.sql' && /not unique/.test(f.motivo))).toBe(true)
  })
})

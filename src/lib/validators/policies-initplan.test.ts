import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARQUIVO_CATALOGO,
  EMENDA,
  carregarMigrations,
  julgarPolicies,
  mensagemDeViolacao,
} from '../../../scripts/db/predicado-policies.mjs'

// A TRAVA DE MESA DA DOUTRINA DO PREDICADO — F59.
//
// A virada multiempresa vai escrever o predicado de tenant em todas as policies. A forma
// certa é `empresa_id = any (array (select public.empresas_do_membro()))` — a função de
// conjunto roda UMA vez por statement. A forma errada, `public.e_membro(empresa_id)`, roda
// uma vez POR LINHA, em toda leitura, e nada no repositório se mexeria (a `0107` mediu
// −45% ao içar uma função numa policy de escrita). Esta é a trava que torna a forma errada
// impossível de nascer: ela reprova, na mesa, sem banco, toda policy viva fora da régua
// da emenda F59 da `docs/MATRIZ-REGRAS.md` (R-ACC-63 em diante).
//
// O PAR DELA mora em `supabase/tests/catalogo_policies.sql` (rótulos 10a–14): a mesma
// doutrina, conferida no catálogo VIVO do banco do CI pela árvore da expressão. A mesa é
// sintática — é rápida e pega o DDL dinâmico que o catálogo não vê; o catálogo é a
// autoridade. As EXCEÇÕES moram numa fonte só, o array `k_excecoes_predicado` daquele
// `.sql`, e esta trava as lê como texto (Decisão 2 da F48).
//
// ⚠ LEITURA NA COLETA (lição da F57): as 139+ migrations e o `.sql` são lidos UMA vez,
// aqui no topo. Ler disco dentro de `it` estourou o tempo-limite da suíte na F57.

const RAIZ = process.cwd()
const SQL_CATALOGO = readFileSync(join(RAIZ, ...ARQUIVO_CATALOGO), 'utf8')
const MIGRATIONS = carregarMigrations(RAIZ)
const J = julgarPolicies({ migrations: MIGRATIONS, sqlCatalogo: SQL_CATALOGO })

/** O julgamento de uma migration SINTÉTICA acrescentada, em memória, ao fim da cadeia real. */
function comSintetica(sql: string, arquivo = '9999_sintetica_f59.sql') {
  return julgarPolicies({ migrations: [...MIGRATIONS, { arquivo, sql }], sqlCatalogo: SQL_CATALOGO })
}

/**
 * As violações que a migration sintética INTRODUZ — as da cadeia real saem da conta. Sem esse
 * desconto, uma cadeia real vermelha (a sabotagem D da fase) faria a guarda culpar o casador,
 * que é o diagnóstico errado.
 */
const MENSAGENS_DA_CADEIA_REAL = new Set(J.violacoes.map(mensagemDeViolacao))
function violacoesNovas(sql: string) {
  return comSintetica(sql)
    .violacoes.map((v) => ({ ...v, mensagem: mensagemDeViolacao(v) }))
    .filter((v) => !MENSAGENS_DA_CADEIA_REAL.has(v.mensagem))
}

const policyEmAtivos = (nome: string, clausula: string) =>
  `create policy "${nome}" on public.ativos for select to authenticated ${clausula};`

describe('1. o universo — a mesa julga o MESMO conjunto que o catálogo do CI', () => {
  it('o replay leu migrations e policies (guarda do próprio teste)', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(100)
    expect(J.replay.vivas.size, 'o replay não achou policy nenhuma — o casador quebrou?').toBeGreaterThan(50)
  })

  it('as policies vivas pelo replay são EXATAMENTE `k_policies_public` ∪ `k_storage` do .sql', () => {
    // É este o conjunto que 10a/10b (public) e 8a/8b (storage) conferem contra `pg_policies`.
    // Mesa = lista congelada = catálogo: a igualdade é transitiva, por asserção nos dois lados.
    expect(J.universo.soNoReplay, 'policy viva nas migrations que não está no universo congelado do .sql').toEqual([])
    expect(J.universo.soNoCatalogo, 'nome congelado no .sql que o replay não acha vivo').toEqual([])
    expect(J.universo.congelado.size).toBe(J.replay.vivas.size)
  })

  it('cobre public E storage.objects, todos os verbos', () => {
    const schemas = new Set([...J.replay.vivas.values()].map((p) => p.schema))
    const verbos = new Set([...J.replay.vivas.values()].map((p) => p.verbo))
    expect([...schemas].sort()).toEqual(['public', 'storage'])
    for (const v of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) expect(verbos.has(v), v).toBe(true)
  })
})

describe('2. falha fechada — o que o replay não lê reprova, nunca é pulado', () => {
  it('nenhum DDL de policy dinâmico, nenhum comando ilegível, nenhum alter/drop de policy desconhecida', () => {
    expect(J.replay.falhas.map((f) => `${f.arquivo}:${f.linha} — ${f.motivo}`)).toEqual([])
  })

  it('AUTO-CONFERÊNCIA: todo `create|alter|drop policy` fora de comentário foi consumido pelo replay', () => {
    expect(J.replay.consumidos).toBeGreaterThan(0)
    expect(J.replay.noTexto).toBe(J.replay.consumidos)
  })

  it('toda cláusula viva foi lida pelo analisador', () => {
    expect(J.ilegiveis.map((x) => `${x.policy} · ${x.clausula} — ${x.motivo}`)).toEqual([])
  })
})

describe('3. a doutrina, contra as policies vivas', () => {
  it('nenhuma policy fora da régua (R1 fora da lista, R2, R3)', () => {
    expect(J.violacoes.map(mensagemDeViolacao)).toEqual([])
  })

  it('CATRACA — toda exceção declarada ainda descreve uma ocorrência viva', () => {
    expect(
      J.excecoesSemOcorrencia.map((e) => `catalogo_policies.sql:${e.linha} — "${e.chave}" não tem ocorrência viva: tire a linha de k_excecoes_predicado`),
    ).toEqual([])
  })

  it('a lista de exceções está no formato (migration, motivo e destino na linha)', () => {
    expect(J.excecoes.problemas).toEqual([])
    expect(J.excecoes.entradas.length, 'k_excecoes_predicado vazio: a leitura quebrou?').toBeGreaterThan(0)
  })

  it('as ocorrências R1 vivas são exatamente as exceções — nenhuma a mais, nenhuma a menos', () => {
    expect([...J.ocorrencias.keys()].sort()).toEqual(J.excecoes.entradas.map((e) => e.chave).sort())
  })
})

describe('4. a guarda do próprio teste — reprova o que tem de reprovar (SQL sintético em memória)', () => {
  // Sem esta guarda, um casador quebrado deixaria os describes 1–3 verdes por vazio.
  // Nada aqui vira arquivo em `supabase/migrations/`: a migration sintética existe só na
  // memória, acrescentada ao fim da cadeia real.

  it.each([
    ['R1 · coluna nua', policyEmAtivos('f59 sintetica', 'using (public.e_membro(empresa_id))'), 'R1', 'e_membro'],
    ['R1 · o falso içamento', policyEmAtivos('f59 sintetica', 'using ((select public.e_membro(empresa_id)))'), 'R1', 'e_membro'],
    ['R1 · expressão sobre coluna qualificada', policyEmAtivos('f59 sintetica', "using (public.f((t.col ->> 'x')::smallint))"), 'R1', 'f'],
    ['R2 · sem argumento, solta', policyEmAtivos('f59 sintetica', 'using (public.e_admin())'), 'R2', 'e_admin'],
    ['R2 · = any (fn()) sem array (select …)', policyEmAtivos('f59 sintetica', 'using (empresa_id = any (public.empresas_do_membro()))'), 'R2', 'empresas_do_membro'],
    [
      'R3 · exists correlacionado',
      policyEmAtivos('f59 sintetica', 'using (exists (select 1 from public.operador_filiais o where o.filial_id = ativos.filial_id))'),
      'R3',
      null,
    ],
    [
      'R3 · exists que lê tabela sem olhar a linha',
      policyEmAtivos('f59 sintetica', 'using (exists (select 1 from public.membros m where m.profile_id = (select auth.uid())))'),
      'R3',
      null,
    ],
    [
      'R1 · with check de INSERT com fn(col)',
      'create policy "f59 sintetica" on public.ativos for insert to authenticated with check (public.pode_escrever_filial(filial_id));',
      'R1',
      'pode_escrever_filial',
    ],
    [
      'R1 · em storage.objects',
      `create policy "f59 sintetica" on storage.objects for select using (bucket_id = 'termos' and (select public.pode_ler_arquivo_termo(name)));`,
      'R1',
      'pode_ler_arquivo_termo',
    ],
  ])('%s → reprova', (_nome, sql, regra, funcao) => {
    const novas = violacoesNovas(sql)
    expect(novas, 'a migration sintética não produziu violação — o casador está quebrado').toHaveLength(1)
    expect(novas[0].regra).toBe(regra)
    if (funcao) expect(novas[0].funcao).toBe(funcao)
    expect(novas[0].mensagem).toContain(EMENDA)
    expect(novas[0].mensagem).toContain('f59 sintetica')
  })

  it('DDL de policy por execute format(…) → reprova por falha fechada, com arquivo e linha', () => {
    const j = comSintetica(
      "do $$\nbegin\n  execute format('alter policy %I on %I.%I using (%s)', 'leitura operador', 'public', 'ativos', 'true');\nend $$;",
      '0200_laco_f66.sql',
    )
    expect(j.replay.falhas).toHaveLength(1)
    expect(j.replay.falhas[0]).toMatchObject({ arquivo: '0200_laco_f66.sql', linha: 3 })
    expect(j.replay.falhas[0].motivo).toMatch(/dinamicamente/)
  })

  it('policy nova em public fora do universo congelado → reprova pelo universo', () => {
    const j = comSintetica(policyEmAtivos('f59 sintetica', 'using ((select public.papel_atual()) is not null)'))
    expect(j.universo.soNoReplay).toEqual(['public.ativos / f59 sintetica'])
  })

  it('consertar a policy sem tirar a exceção → reprova pela catraca', () => {
    const j = comSintetica(
      'alter policy "operador atualiza" on public.ativos using ((select public.pode_escrever())) with check ((select public.pode_escrever()));',
    )
    expect(j.excecoesSemOcorrencia.map((e) => e.chave)).toEqual(['public.ativos / operador atualiza / pode_escrever_filial'])
    expect(j.violacoes).toEqual([])
  })

  it.each([
    ['a forma-alvo içada', 'using (empresa_id = any (array (select public.empresas_do_membro())))'],
    ['a forma de pares', 'using ((empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u))'],
    ['o piso', 'using ((select public.papel_atual()) is not null)'],
    ['a identidade içada', 'using (id = (select auth.uid()))'],
    ['o literal', "using (bucket_id = 'termos')"],
  ])('%s → passa', (_nome, clausula) => {
    expect(violacoesNovas(policyEmAtivos('f59 sintetica', clausula))).toEqual([])
  })
})

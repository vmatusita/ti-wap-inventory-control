import { describe, expect, it } from 'vitest'
import {
  blocoEquivalencia,
  blocoMesmoNome,
  FUNCOES_PERMITIDAS,
  lerCorposDoRepositorio,
  lerCorposMesmoNome,
  md5Normalizado,
  MESMO_NOME,
  validarBloco,
} from './equivalencia-rel.mjs'

// OS INSTRUMENTOS DA F66 — o modo `mesmo-nome` do `equivalencia-rel.mjs` (PLAN-F66, decisão 9). Sem banco.
//
// A `0179` recria `rel_por_motivo_filiais` e `rel_resumo_filiais` com o MESMO nome. A prova de que nada muda para a
// WAP (uma empresa: todo motivo é dela) é a equivalência antes × depois, célula a célula, nos dois bancos — e ela só
// vale se o instrumento comparar o corpo CERTO com o corpo CERTO. Esta suíte prende isso na mesa.

const DATAS = ['2026-09-16', '2026-08-31']
type Def = { parametros: { nome: string; tipo: string }[]; colunas: { nome: string; tipo: string }[]; corpo: string }
const corpos = lerCorposMesmoNome() as { antes: Record<string, Def>; depois: Record<string, Def> }

describe('1. os corpos vêm das migrations (0143 antes, 0179 depois), nunca copiados', () => {
  it('as duas funções, com a mesma assinatura e as mesmas colunas nos dois lados', () => {
    expect(MESMO_NOME).toEqual(['rel_por_motivo_filiais', 'rel_resumo_filiais'])
    for (const nome of MESMO_NOME) {
      expect(corpos.antes[nome].parametros).toEqual(corpos.depois[nome].parametros)
      expect(corpos.antes[nome].colunas).toEqual(corpos.depois[nome].colunas)
    }
  })

  it('o corpo de depois é o de antes com UMA condição a mais no join de motivos — e só ela', () => {
    for (const nome of MESMO_NOME) {
      const a = corpos.antes[nome].corpo
      const d = corpos.depois[nome].corpo
      expect(a).not.toContain('mo.empresa_id = m.empresa_id')
      expect(d.split(' and mo.empresa_id = m.empresa_id').join('')).toBe(a)
    }
  })
})

describe('2. o bloco, nas duas fases', () => {
  it.each(MESMO_NOME.flatMap((n) => [[n, 'antes'], [n, 'depois']]))('%s, fase %s: passa pela guarda e lê o corpo certo em cada lado', (nome, fase) => {
    const b = blocoMesmoNome(nome, corpos, 'producao', DATAS, fase)
    expect(validarBloco(b)).toBe(b)
    const antes = /v_tpl_antes text := \$ta\$([\s\S]*?)\$ta\$;/.exec(b)?.[1] ?? ''
    const depois = /v_tpl_depois text := \$td\$([\s\S]*?)\$td\$;/.exec(b)?.[1] ?? ''
    const viva = `from public.${nome}(%1$L::smallint[], %2$L::date, %3$L::date) as s`
    if (fase === 'antes') {
      expect(antes, 'antes do apply, o lado de antes é a função VIVA').toContain(viva)
      expect(depois, 'antes do apply, o lado de depois é o corpo da 0179 colado').toContain('mo.empresa_id = m.empresa_id')
    } else {
      expect(depois, 'depois do apply, o lado de depois é a função VIVA').toContain(viva)
      expect(antes, 'depois do apply, o lado de antes é o corpo da 0143 colado').not.toContain('mo.empresa_id')
      expect(antes).toContain('left join public.motivos mo on mo.codigo = m.motivo')
    }
    // a guarda confere o prosrc vivo contra o corpo DA FASE
    const vivo = fase === 'antes' ? corpos.antes[nome] : corpos.depois[nome]
    expect(b).toContain(`if v_md5_vivo <> '${md5Normalizado(vivo.corpo)}' then`)
    expect(b).toContain(`raise exception 'F60_CORPO_VIVO_DIFERENTE ${nome} fase=${fase}';`)
  })

  it('a identidade é escolhida pela membership (o profiles.papel congelou na F62), e o payload não leva id', () => {
    const b = blocoMesmoNome('rel_resumo_filiais', corpos, 'ensaio', DATAS, 'antes')
    expect(b).toMatch(/join public\.membros m on m\.profile_id = p\.id and m\.empresa_id = public\.empresa_legada\(\)\n\s+where m\.ativo and p\.excluido_em is null and m\.papel in \('admin', 'dev'\)/)
    expect(b).not.toMatch(/p\.papel in/)
    const payload = /raise exception 'F60_EQUIVALENCIA %', jsonb_build_object\(([\s\S]*?)\);\nend \$f60\$;$/.exec(b)?.[1] ?? ''
    // só contagens e ordinais: nem o uuid da identidade, nem o array de ids das filiais, nem slug ou nome
    expect(payload).not.toMatch(/v_uid|to_jsonb\(v_todas\)|'slug'|'nome'/)
    expect(payload).toContain("'n_filiais', array_length(v_todas, 1)")
  })

  it('fase, função e alvo fora do modelo são recusados', () => {
    expect(() => blocoMesmoNome('rel_mov_por_mes_filiais', corpos, 'producao', DATAS, 'antes')).toThrow(/RECUSADO/)
    expect(() => blocoMesmoNome('rel_resumo_filiais', corpos, 'producao', DATAS, 'durante')).toThrow(/RECUSADO/)
    expect(() => blocoMesmoNome('rel_resumo_filiais', corpos, 'teste', DATAS, 'antes')).toThrow(/RECUSADO/)
  })

  it('a guarda recusa o bloco com escrita, mesmo que ele venha deste gerador', () => {
    const b = blocoMesmoNome('rel_por_motivo_filiais', corpos, 'producao', DATAS, 'depois')
    expect(() => validarBloco(b.replace('  -- 4. as células', '  delete from public.motivos;\n  -- 4. as células'))).toThrow(/RECUSADO/)
  })
})

describe('3. a guarda fechada (revisão adversarial da F66): funções, configurações e prepare', () => {
  // O achado: a guarda só tinha uma lista NEGRA de verbos; um corpo colado com `pg_advisory_lock(…)` — um lock de SESSÃO,
  // que o `raise` final não desfaz — passava. Agora a lista é FECHADA, lida pelo léxico, dentro dos literais e dos $tag$.
  const b = blocoMesmoNome('rel_resumo_filiais', corpos, 'producao', DATAS, 'antes')

  it('os blocos do modelo passam (os dois modos da F66 e a equivalência real da F60)', () => {
    expect(validarBloco(b)).toBe(b)
    const real = blocoEquivalencia('rel_por_motivo_filiais', (lerCorposDoRepositorio() as Record<string, Def>).rel_por_motivo_filiais, 'producao', DATAS, { real: true })
    expect(validarBloco(real)).toBe(real)
    for (const fn of ['pg_advisory_lock', 'nextval', 'setval', 'pg_sleep', 'dblink', 'lo_import', 'pg_read_file']) {
      expect(FUNCOES_PERMITIDAS.has(fn), fn).toBe(false)
    }
  })

  it.each([
    ['lock de sessão dentro do corpo colado', b.replace('select m.tipo, f.slug, f.nome,', 'select pg_advisory_lock(42), m.tipo, f.slug, f.nome,')],
    ['sequência avançada num execute', b.replace('  -- 4. as células', "  execute 'select nextval(''public.x'')';\n  -- 4. as células")],
    ['função chamada entre aspas duplas', b.replace('  -- 4. as células', '  perform "pg_sleep"(1);\n  -- 4. as células')],
    ['papel que não é authenticated', b.replace("set_config('role', 'authenticated', true)", "set_config('role', 'postgres', true)")],
    ['configuração fora da lista', b.replace('  -- 4. as células', "  perform set_config('session_replication_role', 'replica', true);\n  -- 4. as células")],
    ['nome de configuração que não é literal', b.replace('  -- 4. as células', "  perform set_config(v_rot, 'x', true);\n  -- 4. as células")],
    ['um prepare a mais sem os dois deallocate', b.replace('  -- 4. as células', "  execute format('prepare %I as select 1', 'x');\n  -- 4. as células")],
  ])('%s → recusa', (_nome, sql) => {
    expect(() => validarBloco(sql)).toThrow(/RECUSADO/)
  })
})

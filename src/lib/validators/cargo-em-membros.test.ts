import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARQUIVO_EXCECOES,
  PRIMEIRA_DA_F62,
  achadosRoteiro,
  achadosTs,
  arquivosRoteiro,
  arquivosTs,
  funcoesVigentes,
  julgarCargo,
  leCargoEmProfiles,
  lerExcecoesCargo,
  lerMigrations,
  semComentariosDeFora,
} from '../../../scripts/db/cargo-congelado.mjs'
import { definicoesDeFuncao } from '../../../scripts/db/corpo-vigente.mjs'
import { replayPolicies } from '../../../scripts/db/predicado-policies.mjs'

// A TRAVA DE MESA DO CARGO CONGELADO — F62.
//
// Desde a F62 o cargo e o status moram em `membros`, por empresa; `profiles.papel` e
// `profiles.ativo` ficaram CONGELADOS (decisão iii do Johnny, 22/09/2026) e só existem como
// rede de reversão até a entrega PATCH que os derruba. Um leitor esquecido decidiria acesso
// por um valor parado no tempo: quem foi desativado depois da F62 voltaria a entrar.
//
// Quatro universos, cada um com as exceções NOMEADAS numa fonte só:
//   1–3 · as FUNÇÕES (corpo vigente das migrations) e as POLICIES vivas — exceções em
//         `k_excecoes_cargo` de `supabase/tests/cargo_em_membros.sql`, o PAR de catálogo
//         desta trava, que faz a mesma afirmação sobre o banco do CI (Decisão 2 da F48);
//   4–5 · o TypeScript e os scripts — exceções em `EXCECOES_TS`, abaixo;
//   6–7 · os roteiros — exceções em `EXCECOES_ROTEIRO`, abaixo, casadas pela marca
//         `-- F62/cargo-congelado: <rótulo>` no próprio comando.
//   8   · a grade de comparação (`cargo_equivalencia.sql`) tem o corpo ANTIGO copiado
//         VERBATIM do vigente antes da F62 — e esta trava impede a cópia de envelhecer.
//
// ⚠ LEITURA NA COLETA (lição da F57): disco lido uma vez, aqui no topo.

const RAIZ = process.cwd()
const MIGRATIONS = lerMigrations(RAIZ)
const SQL_EXCECOES = readFileSync(join(RAIZ, ...ARQUIVO_EXCECOES), 'utf8')
const EXCECOES = lerExcecoesCargo(SQL_EXCECOES)
const POLICIES = replayPolicies(MIGRATIONS).vivas
const J = julgarCargo({ migrations: MIGRATIONS, excecoes: EXCECOES.map((e) => e.nome), policiesVivas: POLICIES })

const TS = arquivosTs(RAIZ).map((arquivo) => ({ arquivo, texto: readFileSync(join(RAIZ, arquivo), 'utf8') }))
const ROTEIROS = arquivosRoteiro(RAIZ).map((arquivo) => ({
  arquivo,
  texto: readFileSync(join(RAIZ, 'supabase', 'tests', arquivo), 'utf8'),
}))

/**
 * As exceções do universo TypeScript/scripts, por ARQUIVO, com o motivo. Nenhum código de
 * produção entra aqui — só o que é, por construção, texto SOBRE o defeito.
 */
const EXCECOES_TS: Record<string, string> = {
  'scripts/db/mutacoes.mjs':
    'é o catálogo do injetor de mutações: as sabotagens da F62 reescrevem funções para voltarem a ler o cargo em profiles, e é exatamente isso que o roteiro tem de acusar',
  // Os três instrumentos da F60 têm a IDENTIDADE travada por sha256 no PLAN-F60 §0
  // (`scripts/perf/instrumentos-f60.test.mts`): mediram o antes/depois daquela fase e não se
  // re-rodam. Quem precisar re-rodá-los depois da F62 faz uma versão nova (a identidade pela
  // membership, como `medir-rls.mjs` e `medir-itens.mjs` já fazem) e declara a diferença.
  'scripts/perf/medir-rel.mjs':
    'instrumento da F60 com identidade travada por sha256 no PLAN-F60 §0 — não se re-roda; a versão nova escolhe a identidade pela membership',
  'scripts/perf/medir-custo.mjs':
    'instrumento da F60 com identidade travada por sha256 no PLAN-F60 §0 — não se re-roda; a versão nova escolhe a identidade pela membership',
  'scripts/perf/equivalencia-rel.mjs':
    'instrumento da F60 com identidade travada por sha256 no PLAN-F60 §0 — não se re-roda; a versão nova escolhe a identidade pela membership',
}

/**
 * As exceções dos roteiros: `arquivo / rótulo`, e o rótulo tem de aparecer na marca
 * `-- F62/cargo-congelado: <rótulo>` do comando. Cada uma prova algo SOBRE a coluna
 * congelada — a guarda que continua a protegê-la, a escalada que continua barrada, o
 * corpo antigo da comparação, o rollback — e por isso precisa tocá-la.
 */
const EXCECOES_ROTEIRO: Record<string, string> = {
  'cargo_dev.sql / 2g':
    'o admin forjando UPDATE direto em profiles.papel: a coluna congelada continua sem grant para authenticated',
  'cargo_dev.sql / 2h':
    'o service role tentando conceder dev por UPDATE direto em profiles: profiles_guarda_dev continua recusando',
  'cargo_dev.sql / fixture-legado':
    'planta o dev também na coluna congelada, como os devs de hoje, para a 2i-legado medir profiles_guarda_dev sobre o estado real',
  'cargo_dev.sql / 2i':
    'o service role tentando rebaixar em profiles um dev promovido depois da F62: profiles_guarda_dev o reconhece pela membership',
  'cargo_dev.sql / 2i-legado':
    'o service role tentando rebaixar em profiles um dev de antes da F62: profiles_guarda_dev o reconhece pela coluna congelada',
  'cargo_dev.sql / 2i-bis':
    'o service role tentando desativar um dev em profiles: profiles_guarda_dev continua recusando',
  'cargo_dev.sql / 8a':
    'a PROVA DO CONGELAMENTO: gravar profiles.papel/ativo (com a janela) não muda o acesso de ninguém',
  'papeis_rls.sql / 3g':
    'a escalada de privilégio: o operador tentando se promover por UPDATE em profiles.papel (grant de coluna)',
  'papeis_rls.sql / 5g':
    'o admin também não grava profiles.papel direto (o único caminho é a RPC)',
  'cargo_equivalencia.sql / corpo antigo':
    'a grade de comparação planta o cargo em profiles porque o corpo ANTIGO (o da F61) lê dali',
  'cargo_em_membros.sql / 2':
    'a auto-sabotagem da trava de catálogo: funções fictícias que leem o cargo em profiles',
}

describe('1. mesa: nenhuma função vigente lê ou escreve o cargo em profiles', () => {
  it('o replay das migrations enxergou funções de verdade (universo não vazio)', () => {
    expect(J.universo).toBeGreaterThan(80)
  })

  it('nenhuma função vigente fora de k_excecoes_cargo lê ou escreve profiles.papel/profiles.ativo', () => {
    const msg = J.acusadas.map((a) => `${a.nome} (forma ${a.forma}, vigente em ${a.arquivo})`)
    expect(msg, `leem o cargo congelado: ${msg.join(' · ')}`).toEqual([])
  })

  it('toda exceção de k_excecoes_cargo ainda é acusada (a catraca no outro sentido)', () => {
    expect(J.obsoletas).toEqual([])
  })

  it('as exceções estão no formato (migration que existe, motivo > 40 caracteres, destino)', () => {
    expect(EXCECOES.length).toBeGreaterThan(0)
    const arquivos = new Set(MIGRATIONS.map((m) => m.arquivo.slice(0, 4)))
    for (const e of EXCECOES) {
      expect(arquivos.has(e.migration), `${e.nome}: migration ${e.migration} não existe`).toBe(true)
      expect(e.motivo.length, `${e.nome}: motivo curto`).toBeGreaterThan(40)
    }
  })
})

describe('2. mesa: nenhuma policy viva lê o cargo em profiles', () => {
  it('o replay achou as policies vivas', () => {
    expect(POLICIES.size).toBeGreaterThan(50)
  })
  it('nenhuma policy (public/storage) cita profiles.papel/profiles.ativo', () => {
    expect(J.policies).toEqual([])
  })
})

describe('3. mesa: a varredura SABE reprovar (sabotagem A)', () => {
  it.each([
    ['por alias', 'select p.papel from public.profiles p where p.id = auth.uid()', 'b'],
    ['sem alias', 'select ativo from public.profiles where id = auth.uid()', 'e'],
    ['qualificada', 'select 1 from public.profiles where profiles.papel = \'admin\'', 'a'],
    ['gravando', "update public.profiles set papel = 'consulta' where id = auth.uid()", 'c'],
    ['inserindo', "insert into public.profiles (id, papel) values (auth.uid(), 'dev')", 'd'],
  ])('acusa a leitura %s', (_, sql, forma) => {
    expect(leCargoEmProfiles(sql)).toBe(forma)
  })

  it('não acusa quem lê SÓ o que é da conta (nome, excluido_em) nem o cargo em membros', () => {
    expect(leCargoEmProfiles('select p.nome, p.excluido_em from public.profiles p where p.id = auth.uid()')).toBeNull()
    expect(
      leCargoEmProfiles(
        'select m.papel from public.membros m join public.profiles p on p.id = m.profile_id where m.ativo and p.excluido_em is null',
      ),
    ).toBeNull()
    expect(leCargoEmProfiles("update public.profiles set excluido_em = now() where id = x")).toBeNull()
  })

  it('não acusa comentário (a lição da F53: pseudo-SQL em comentário não é código)', () => {
    expect(leCargoEmProfiles('-- select p.papel from public.profiles p\nselect 1')).toBeNull()
  })

  it('uma migration SINTÉTICA no fim da cadeia com uma função lendo profiles.papel reprova', () => {
    const sintetica = {
      arquivo: '9999_sintetica_f62.sql',
      sql: `create or replace function public.papel_de_quem(p uuid) returns text language sql stable as $$
  select pr.papel::text from public.profiles pr where pr.id = p
$$;`,
    }
    const j = julgarCargo({ migrations: [...MIGRATIONS, sintetica], excecoes: EXCECOES.map((e) => e.nome) })
    expect(j.acusadas.map((a) => a.nome)).toContain('papel_de_quem')
  })

  it('a função que caiu por `drop function` sai do universo', () => {
    const cria = {
      arquivo: '9998_sintetica_f62.sql',
      sql: 'create function public.le_cargo_velho() returns text language sql as $$ select papel::text from public.profiles limit 1 $$;',
    }
    const derruba = { arquivo: '9999_sintetica_f62.sql', sql: 'drop function public.le_cargo_velho();' }
    const vivas = funcoesVigentes([...MIGRATIONS, cria, derruba])
    expect([...vivas.values()].map((f) => f.nome)).not.toContain('le_cargo_velho')
  })
})

describe('4. TS e scripts: nenhum `from(\'profiles\')` seleciona, filtra ou grava papel/ativo', () => {
  it('o universo é o código de verdade (src/** e scripts/**, sem testes)', () => {
    expect(TS.length).toBeGreaterThan(300)
  })

  it('nenhum arquivo fora de EXCECOES_TS lê ou grava o cargo em profiles', () => {
    const achados = TS.filter((t) => !(t.arquivo in EXCECOES_TS))
      .map((t) => ({ arquivo: t.arquivo, achados: achadosTs(t.texto) }))
      .filter((a) => a.achados.length > 0)
      .map((a) => `${a.arquivo} → ${a.achados.map((x) => x.tipo).join(', ')}`)
    expect(achados, achados.join('\n')).toEqual([])
  })

  it('toda exceção de EXCECOES_TS ainda é acusada (a catraca no outro sentido)', () => {
    const velhas = Object.keys(EXCECOES_TS).filter((arquivo) => {
      const t = TS.find((x) => x.arquivo === arquivo)
      return !t || achadosTs(t.texto).length === 0
    })
    expect(velhas).toEqual([])
  })

  it('toda exceção de EXCECOES_TS existe e tem motivo', () => {
    const arquivos = new Set(TS.map((t) => t.arquivo))
    for (const [arquivo, motivo] of Object.entries(EXCECOES_TS)) {
      expect(arquivos.has(arquivo), arquivo).toBe(true)
      expect(motivo.length).toBeGreaterThan(40)
    }
  })
})

describe('5. TS: a varredura SABE reprovar (sabotagem A)', () => {
  it.each([
    ['select', "await supabase.from('profiles').select('id, papel').eq('id', x)"],
    ['filtro', "await admin.from('profiles').select('id').in('papel', ['admin'])"],
    ['grava', "await admin.from('profiles').update({ ativo: false }).eq('id', x)"],
    ['forma', "leituraDeRelacao({ rotulo: 'x', origem: 'profiles', select: 'nome, papel', forma: z.any() })"],
    ['sql', "const q = `select p.id from public.profiles p where p.ativo`"],
  ])('acusa %s', (_, codigo) => {
    expect(achadosTs(codigo).length).toBeGreaterThan(0)
  })

  it('não acusa a leitura de profiles SEM o cargo, nem o cargo em membros', () => {
    expect(achadosTs("await supabase.from('profiles').select('nome, excluido_em').eq('id', x)")).toEqual([])
    expect(achadosTs("await supabase.from('membros').select('papel, ativo').eq('profile_id', x)")).toEqual([])
  })
})

describe('6. roteiros: nenhum lê ou grava o cargo em profiles fora das exceções nomeadas', () => {
  it('o universo são os roteiros de verdade', () => {
    expect(ROTEIROS.length).toBeGreaterThan(35)
  })

  it('todo comando que toca o cargo em profiles carrega a marca de uma exceção nomeada', () => {
    const fora: string[] = []
    for (const r of ROTEIROS) {
      for (const a of achadosRoteiro(r.texto)) {
        const chave = a.marca ? `${r.arquivo} / ${a.marca}` : null
        if (!chave || !(chave in EXCECOES_ROTEIRO)) {
          fora.push(`${r.arquivo}:${a.linha} (forma ${a.forma}${a.marca ? `, marca «${a.marca}»` : ''})`)
        }
      }
    }
    expect(fora, fora.join('\n')).toEqual([])
  })

  it('toda exceção de EXCECOES_ROTEIRO ainda marca um comando (a catraca no outro sentido)', () => {
    const usadas = new Set<string>()
    for (const r of ROTEIROS) {
      for (const a of achadosRoteiro(r.texto)) if (a.marca) usadas.add(`${r.arquivo} / ${a.marca}`)
    }
    const sobrando = Object.keys(EXCECOES_ROTEIRO).filter((k) => !usadas.has(k))
    expect(sobrando).toEqual([])
  })
})

describe('7. roteiros: a varredura SABE reprovar (sabotagem A)', () => {
  it('um roteiro sintético com `update public.profiles set papel` é acusado, sem marca', () => {
    const sintetico = "begin;\ndo $$\nbegin\n  update public.profiles set papel = 'admin' where id = k;\nend $$;\nrollback;\n"
    const a = achadosRoteiro(sintetico)
    expect(a).toHaveLength(1)
    expect(a[0].marca).toBeNull()
  })
  it('a marca é lida do próprio comando', () => {
    const marcado = "  update public.profiles set ativo = false where id = k; -- F62/cargo-congelado: 2h\n"
    expect(achadosRoteiro(marcado)[0].marca).toBe('2h')
  })
})

describe('8. a grade de comparação carrega o corpo ANTIGO verbatim (antes da F62)', () => {
  const GRADE = ROTEIROS.find((r) => r.arquivo === 'cargo_equivalencia.sql')
  const ANTES = funcoesVigentes(MIGRATIONS, PRIMEIRA_DA_F62)
  const normalizar = (s: string) =>
    semComentariosDeFora(s)
      .replace(/--[^\n]*/g, ' ')
      .replace(/create\s+or\s+replace\s+function/gi, 'create function')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

  it.each([
    ['papel_atual', 0],
    ['pode_escrever_filial', 1],
    ['existe_outro_admin_ativo', 2],
  ])('pg_temp.%s_f61 = o corpo vigente até a 0151', (nome, aridade) => {
    expect(GRADE, 'cargo_equivalencia.sql não existe').toBeDefined()
    const copia = definicoesDeFuncao(GRADE!.texto).find((d) => d.esquema === 'pg_temp' && d.nome === `${nome}_f61`)
    expect(copia, `a grade não define pg_temp.${nome}_f61`).toBeDefined()
    const original = ANTES.get(`${nome}/${aridade}`)
    expect(original, `${nome} não existia antes da ${PRIMEIRA_DA_F62}`).toBeDefined()
    const deVolta = copia!.texto
      .replace(/pg_temp\.papel_atual_f61\(\)/g, 'public.papel_atual()')
      .replace(new RegExp(`create function pg_temp\\.${nome}_f61`, 'i'), `create function public.${nome}`)
    expect(normalizar(deVolta)).toBe(normalizar(original!.texto))
  })
})

describe('9. o rollback da F62 devolve EXATAMENTE o banco de antes (supabase/rollback/)', () => {
  // O rollback é escrito ANTES do apply e ensaiado no CI (`supabase/tests/f62_rollback.sql`,
  // a sabotagem G). O que o ensaio não vê é a COMPLETUDE contra as migrations: uma função que
  // a F62 recriou e o rollback esqueceu de reemitir continuaria lendo `membros` depois de a
  // tabela cair. Aqui, sem banco: o rollback reemite TODA função que a F62 recriou (as que
  // existiam antes da 0152), cada uma com o corpo vigente até a 0151 byte a byte (sem
  // comentários), e derruba TODA função que a F62 criou; e a cópia de volta é o passo 1.
  const DIR = join(RAIZ, 'supabase', 'rollback')
  const DESFAZ = readFileSync(join(DIR, 'F62-2-desfaz.sql'), 'utf8')
  const COPIA = readFileSync(join(DIR, 'F62-1-copia-de-volta.sql'), 'utf8')
  const ANTES = funcoesVigentes(MIGRATIONS, PRIMEIRA_DA_F62)
  const DEPOIS = funcoesVigentes(MIGRATIONS)
  const DA_F62 = new Map(
    [...DEPOIS].filter(([, f]) => f.arquivo.slice(0, 4) >= PRIMEIRA_DA_F62),
  )
  const recriadas = [...DA_F62.keys()].filter((k) => ANTES.has(k)).sort()
  const criadas = [...DA_F62.keys()].filter((k) => !ANTES.has(k)).sort()
  const reemitidas = new Map(
    definicoesDeFuncao(semComentariosDeFora(DESFAZ))
      .filter((d) => d.esquema === 'public')
      .map((d) => [`${d.nome}/${d.tipos.length}`, d.texto] as const),
  )
  const normalizar = (s: string) =>
    s
      .replace(/--[^\n]*/g, ' ')
      .replace(/create\s+or\s+replace\s+function/gi, 'create function')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

  it('a F62 recriou e criou funções (guarda do próprio teste)', () => {
    expect(recriadas.length).toBeGreaterThanOrEqual(10)
    expect(criadas.length).toBeGreaterThanOrEqual(8)
  })

  it('reemite TODA função que a F62 recriou — e nenhuma outra', () => {
    expect([...reemitidas.keys()].sort()).toEqual(recriadas)
  })

  it.each(recriadas)('%s volta com o corpo vigente até a 0151', (chave) => {
    expect(normalizar(reemitidas.get(chave as `${string}/${number}`)!)).toBe(
      normalizar(ANTES.get(chave as `${string}/${number}`)!.texto),
    )
  })

  it.each(criadas)('%s é derrubada', (chave) => {
    const nome = chave.split('/')[0]
    expect(DESFAZ).toMatch(new RegExp(`^drop function public\\.${nome}\\(`, 'm'))
  })

  it('derruba as três tabelas da raiz e as colunas novas', () => {
    for (const re of [
      /^drop table public\.membros;/m,
      /^drop table public\.empresas;/m,
      /^drop table public\.plataforma_admins;/m,
      /^alter table public\.filiais drop column empresa_id;/m,
      /^alter table public\.operador_filiais drop column membro_id;/m,
      /^alter table public\.operador_filiais drop column empresa_id;/m,
      /^alter table public\.operador_filiais add constraint operador_filiais_pkey primary key \(usuario_id, filial_id\);/m,
    ]) {
      expect(DESFAZ, String(re)).toMatch(re)
    }
  })

  it('a ORDEM: a membership sai só depois do vínculo, e a raiz por último', () => {
    const pos = (s: string) => DESFAZ.indexOf(s)
    expect(pos('drop column membro_id')).toBeLessThan(pos('drop table public.membros'))
    expect(pos('drop column empresa_id;')).toBeLessThan(pos('drop table public.empresas'))
    expect(pos('drop table public.membros')).toBeLessThan(pos('drop table public.empresas'))
    expect(pos('drop table public.empresas')).toBeLessThan(pos('drop function public.empresa_legada()'))
  })

  it('o passo 1 copia membros → profiles pela membership legada, com a janela do dev', () => {
    expect(COPIA).toMatch(/update public\.profiles p\s+set papel = m\.papel,\s+ativo = m\.ativo/)
    expect(COPIA).toMatch(/m\.empresa_id = public\.empresa_legada\(\)/)
    expect(COPIA).toMatch(/set_config\('estoque\.gestao_usuarios', 'on', true\)/)
  })
})

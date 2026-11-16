import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { limpar } from '@/lib/use-server-exports'
import { corpoVigente } from '../../../scripts/db/corpo-vigente.mjs'
import {
  caminhoBackupConflito,
  caminhoBackupImport,
  caminhoBackupLegado,
  caminhoBackupReset,
  carimboDeArquivo,
  empresaDoCaminhoBackup,
  FAMILIAS_RESERVADAS,
  FORMAS_ANTIGAS,
  FORMAS_NOVAS,
  prefixoBackupConflito,
  prefixoBackupImport,
  prefixoBackupReset,
  prefixoDasCopias,
  raizDoAtivo,
  raizDoBackupEmArquivo,
  raizDoConflito,
  raizDoOrfao,
} from './caminho'

// =============================================================================
// A TRAVA DA F67B — o caminho de `backups-import` tem DONO, e é montado num lugar só.
// =============================================================================
// Desde a F67B o bucket `backups-import` decide pela EMPRESA DO CAMINHO: a policy lê o 2º segmento
// (`import|reset|conflito|ativo/empresa-<uuid>/…`) por `empresa_do_caminho_backup`, e só o admin daquela empresa
// alcança o objeto. Um caminho montado sem a empresa nasce invisível para todos (ou, pior, na forma antiga, legível
// pela cláusula legada ao admin da WAP). Por isso:
//   1. toda função de `caminho.ts` que monta caminho põe `empresa-<uuid>` no 2º segmento — a única exceção NOMINAL é a
//      raiz da ferramenta de órfão (`orfao/<carimbo>`), que de propósito NÃO tem empresa: um `.docx` sem linha não é
//      de empresa nenhuma, e a raiz só é alcançada pelo service role (PLAN-F67B, decisão 9);
//   2. nenhum arquivo de `src/**` ou `scripts/**` monta caminho do bucket por fora dela (a varredura, no molde de
//      `backup-completude.test.ts`);
//   3. o espelho SQL — `empresa_do_caminho_backup`, `caminho_backup_legado` e os `prefixo_backup_*` novos — tem as
//      MESMAS formas que o TS, lidas do corpo VIGENTE (`corpoVigente`), nunca de cópia.
// =============================================================================

const E = '00000000-0000-4000-a000-000000000001' // a empresa legada (fictício o resto)
const E2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const C = '2026-11-16T10-00-00-000Z'
const D = '0123456789abcdef0123456789abcdef'
const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const DOCX = 'cccccccc-3333-4333-8333-cccccccccccc.docx'

describe('1. toda função que monta caminho põe a empresa no 2º segmento', () => {
  const montados: [string, string][] = [
    ['prefixoBackupImport', prefixoBackupImport(E, 3)],
    ['caminhoBackupImport', caminhoBackupImport(E, 3, C)],
    ['prefixoBackupReset (tudo)', prefixoBackupReset(E, 'acervo', null)],
    ['prefixoBackupReset (filial)', prefixoBackupReset(E, 'itens', 3)],
    ['caminhoBackupReset (tudo)', caminhoBackupReset(E, 'acervo', null, C)],
    ['caminhoBackupReset (filial)', caminhoBackupReset(E, 'itens', 3, C)],
    ['prefixoBackupConflito', prefixoBackupConflito(E)],
    ['caminhoBackupConflito', caminhoBackupConflito(E, D, C)],
    ['raizDoConflito', raizDoConflito(E, D)],
    ['raizDoAtivo', raizDoAtivo(E, A)],
    ['raizDoBackupEmArquivo', raizDoBackupEmArquivo(caminhoBackupImport(E, 3, C))],
    ['prefixoDasCopias', prefixoDasCopias(raizDoAtivo(E, A))],
  ]

  it.each(montados)('%s → <família>/empresa-<uuid>/…', (_nome, caminho) => {
    expect(caminho.split('/')[1]).toBe(`empresa-${E}`)
  })

  it('as formas exatas (a ficha e a decisão 1 do PLAN-F67B)', () => {
    expect(caminhoBackupImport(E, 3, C)).toBe(`import/empresa-${E}/filial-3/${C}.json`)
    expect(caminhoBackupReset(E, 'acervo', null, C)).toBe(`reset/empresa-${E}/acervo/tudo/${C}.json`)
    expect(caminhoBackupReset(E, 'itens', 7, C)).toBe(`reset/empresa-${E}/itens/filial-7/${C}.json`)
    expect(caminhoBackupConflito(E, D, C)).toBe(`conflito/empresa-${E}/${D}/${C}.json`)
    expect(prefixoDasCopias(raizDoConflito(E, D))).toBe(`conflito/empresa-${E}/${D}/termos/`)
    expect(prefixoDasCopias(raizDoAtivo(E, A))).toBe(`ativo/empresa-${E}/${A}/termos/`)
    expect(prefixoDasCopias(raizDoBackupEmArquivo(caminhoBackupReset(E, 'acervo', 2, C)))).toBe(
      `reset/empresa-${E}/acervo/filial-2/${C}/termos/`,
    )
  })

  it('todo caminho montado é reconhecido como forma NOVA, da empresa certa, e nunca como forma antiga', () => {
    const caminhos = [
      caminhoBackupImport(E, 3, C),
      caminhoBackupReset(E, 'acervo', null, C),
      caminhoBackupReset(E, 'itens', 3, C),
      caminhoBackupConflito(E, D, C),
      prefixoDasCopias(raizDoConflito(E, D)) + DOCX,
      prefixoDasCopias(raizDoAtivo(E, A)) + DOCX,
      prefixoDasCopias(raizDoBackupEmArquivo(caminhoBackupImport(E, 3, C))) + DOCX,
      prefixoDasCopias(raizDoBackupEmArquivo(caminhoBackupReset(E, 'acervo', null, C))) + DOCX,
    ]
    for (const c of caminhos) {
      expect(empresaDoCaminhoBackup(c), c).toBe(E)
      expect(caminhoBackupLegado(c), c).toBe(false)
    }
    expect(empresaDoCaminhoBackup(caminhoBackupImport(E2, 9, C))).toBe(E2)
  })

  it('a raiz do órfão é a ÚNICA sem empresa — e não é forma nova nem antiga (só o service role a alcança)', () => {
    const raiz = raizDoOrfao(C)
    expect(raiz).toBe(`orfao/${C}`)
    expect(empresaDoCaminhoBackup(prefixoDasCopias(raiz) + DOCX)).toBeNull()
    expect(caminhoBackupLegado(prefixoDasCopias(raiz) + DOCX)).toBe(false)
  })

  it.each([
    ['vazia', ''],
    ['maiúscula', E.toUpperCase()],
    ['sem hífens', E.replace(/-/g, '')],
    ['com barra', `${E}/x`],
  ])('recusa empresa %s — nenhum caminho sai sem a empresa', (_nome, empresa) => {
    expect(() => caminhoBackupImport(empresa, 3, C)).toThrow()
    expect(() => caminhoBackupReset(empresa, 'acervo', null, C)).toThrow()
    expect(() => caminhoBackupConflito(empresa, D, C)).toThrow()
    expect(() => raizDoAtivo(empresa, A)).toThrow()
    expect(() => raizDoConflito(empresa, D)).toThrow()
  })

  it('recusa os outros pedaços malformados (filial, bloco, digest, ativo, carimbo, JSON sem empresa)', () => {
    expect(() => caminhoBackupImport(E, 0, C)).toThrow()
    expect(() => caminhoBackupImport(E, 3, 'a/b')).toThrow()
    expect(() => caminhoBackupReset(E, 'tudo' as never, null, C)).toThrow()
    expect(() => caminhoBackupConflito(E, 'xyz', C)).toThrow()
    expect(() => raizDoAtivo(E, 'nao-e-uuid')).toThrow()
    // a raiz das cópias de um JSON SÓ sai de um JSON na forma nova: um backup antigo não gera cópia nova sem empresa
    expect(() => raizDoBackupEmArquivo(`import/filial-3/${C}.json`)).toThrow()
    expect(() => prefixoDasCopias(`ativo/${A}`)).toThrow()
  })

  it('o carimbo é o ISO sem ":" nem "." (24 caracteres, o mesmo de antes)', () => {
    expect(carimboDeArquivo(new Date('2026-11-16T10:00:00.000Z'))).toBe(C)
    expect(carimboDeArquivo().length).toBe(24)
  })

  it('o pior caso do import cabe no teto de import_logs.backup_path (120, F66B)', () => {
    expect(caminhoBackupImport(E, 32767, C).length).toBeLessThanOrEqual(120)
  })
})

describe('2. a cláusula legada é FECHADA (decisão 16/11-1) — as formas antigas, e só elas', () => {
  it.each([
    ['a histórica <slug>/<carimbo>.json', `curitiba/${C}.json`],
    ['import antigo', `import/filial-3/${C}.json`],
    ['cópia do import antigo', `import/filial-3/${C}/termos/${DOCX}`],
    ['reset antigo global', `reset/acervo/global/${C}.json`],
    ['reset antigo por filial', `reset/itens/filial-3/${C}.json`],
    ['cópia do reset antigo', `reset/acervo/filial-3/${C}/termos/${DOCX}`],
    ['conflito antigo', `conflito/${D}/${C}.json`],
    ['cópia do conflito antigo', `conflito/${D}/termos/${DOCX}`],
    ['cópia do apagar ativo antigo', `ativo/${A}/termos/${DOCX}`],
  ])('%s é forma antiga (e não nova)', (_nome, c) => {
    expect(caminhoBackupLegado(c)).toBe(true)
    expect(empresaDoCaminhoBackup(c)).toBeNull()
  })

  it.each([
    ['fora de toda forma (3 segmentos)', 'zz/sub/x.json'],
    ['família reservada na histórica', `import/${C}.json`],
    ['nova com global', `reset/empresa-${E}/acervo/global/${C}.json`],
    ['nova malformada', `import/empresa-${E}/${C}.json`],
    ['raiz do órfão', `orfao/${C}/termos/${DOCX}`],
    ['o .docx na raiz', DOCX],
    ['vazio', ''],
  ])('%s NÃO cai na cláusula legada', (_nome, c) => {
    expect(caminhoBackupLegado(c)).toBe(false)
  })

  it('as listas são disjuntas e fechadas (nenhuma "qualquer coisa sem empresa")', () => {
    expect(FORMAS_NOVAS.length).toBe(4)
    expect(FORMAS_ANTIGAS.length).toBe(5)
    for (const f of [...FORMAS_NOVAS, ...FORMAS_ANTIGAS]) {
      expect(f.startsWith('^') && f.endsWith('$'), f).toBe(true)
    }
    expect(FAMILIAS_RESERVADAS).toBe('^(import|reset|conflito|ativo|orfao)/')
  })
})

describe('3. o espelho SQL tem as MESMAS formas (lidas do corpo vigente, nunca de cópia)', () => {
  const literaisComAncora = (sql: string) =>
    [...sql.matchAll(/'(\^[^']*)'/g)].map((m) => m[1]).filter((s, i, xs) => xs.indexOf(s) === i).sort()

  it('empresa_do_caminho_backup: as quatro formas novas, byte a byte', () => {
    const { sql } = corpoVigente('public.empresa_do_caminho_backup(text)')
    const doSql = literaisComAncora(sql).filter((l) => l.includes('empresa-('))
    expect(doSql).toEqual([...FORMAS_NOVAS].sort())
  })

  it('caminho_backup_legado: as cinco formas antigas e as famílias reservadas, byte a byte', () => {
    const { sql } = corpoVigente('public.caminho_backup_legado(text)')
    expect(literaisComAncora(sql)).toEqual([...FORMAS_ANTIGAS, FAMILIAS_RESERVADAS].sort())
  })

  it('os prefixo_backup_* NOVOS montam o mesmo prefixo que o TS', () => {
    const imp = corpoVigente('public.prefixo_backup_import(uuid, smallint)').sql
    expect(imp).toContain("'import/empresa-' || p_empresa::text || '/filial-' || p_filial::text || '/'")
    expect(prefixoBackupImport(E, 3)).toBe(`import/empresa-${E}/filial-3/`)
    const res = corpoVigente('public.prefixo_backup_reset(uuid, text, smallint)').sql
    expect(res).toContain(
      "'reset/empresa-' || p_empresa::text || '/' || p_bloco || '/' || case when p_filial is null then 'tudo' else 'filial-' || p_filial::text end || '/'",
    )
    expect(prefixoBackupReset(E, 'acervo', null)).toBe(`reset/empresa-${E}/acervo/tudo/`)
    expect(prefixoBackupReset(E, 'acervo', 4)).toBe(`reset/empresa-${E}/acervo/filial-4/`)
    const con = corpoVigente('public.prefixo_backup_conflito(uuid)').sql
    expect(con).toContain("'conflito/empresa-' || p_empresa::text || '/'")
    expect(prefixoBackupConflito(E)).toBe(`conflito/empresa-${E}/`)
  })
})

// -----------------------------------------------------------------------------
// 4. A VARREDURA — ninguém monta caminho do bucket por fora de `caminho.ts`
// -----------------------------------------------------------------------------
// Um literal que COMEÇA numa família do bucket (`'import/`, `'reset/`, `'conflito/`, `'ativo/`, `'orfao/`), que
// TERMINA em `/termos/` ou que monta `…}/termos/` num template, ou que escreve `empresa-${` — é montagem de caminho de
// `backups-import`. Fora da lista NOMINAL abaixo (cada uma com o motivo escrito), reprova. Lê o FONTE sem comentário
// (`limpar`), como `backup-completude.test.ts`; `import … from '…/termos/…'` não casa (não começa nem termina assim).
const RE_MONTAGEM = /(['"`])(?:import|reset|conflito|ativo|orfao)\/|\/termos\/(['"`])|\}\/termos\/|empresa-\$\{/g

const NOMINAIS: Record<string, string> = {
  'src/lib/storage/caminho.ts': 'a função única — é aqui que o caminho nasce',
  'scripts/db/restaurar.mjs':
    'reconhece, não grava: imprime o prefixo das cópias de um backup que JÁ existe (agnóstico de forma, fato 20 da F67B)',
}

function fontes(dir: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) out.push(...fontes(caminho))
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(nome) && !/\.test\.(ts|tsx|mts)$/.test(nome)) out.push(caminho)
  }
  return out
}

describe('4. ninguém monta caminho de backups-import por fora de caminho.ts', () => {
  const RAIZ = process.cwd()
  const achados = [...fontes(join(RAIZ, 'src')), ...fontes(join(RAIZ, 'scripts'))].flatMap((arq) => {
    const rel = relative(RAIZ, arq).split(sep).join('/')
    const fonte = limpar(readFileSync(arq, 'utf8'), false)
    const linhas = fonte.split('\n')
    return linhas.flatMap((l, i) =>
      /^\s*(import|export)\b.*\bfrom\s+['"]/.test(l) || !RE_MONTAGEM.test(l)
        ? []
        : ((RE_MONTAGEM.lastIndex = 0), [{ rel, linha: i + 1, texto: l.trim().slice(0, 140) }]),
    )
  })

  it('toda montagem achada está na lista nominal, com motivo', () => {
    const fora = achados.filter((a) => !(a.rel in NOMINAIS)).map((a) => `${a.rel}:${a.linha}  ${a.texto}`)
    expect(fora).toEqual([])
  })

  it('a lista nominal não guarda fantasma (todo nome ainda monta algo) e todo motivo é uma frase', () => {
    for (const [arq, motivo] of Object.entries(NOMINAIS)) {
      expect(achados.some((a) => a.rel === arq), `${arq} saiu da lista: não monta mais caminho`).toBe(true)
      expect(motivo.length, arq).toBeGreaterThan(30)
    }
  })

  it('o casador sabe reprovar (guarda da própria trava)', () => {
    const casa = (s: string) => {
      RE_MONTAGEM.lastIndex = 0
      return RE_MONTAGEM.test(s)
    }
    expect(casa("const p = 'import/filial-' + id")).toBe(true)
    expect(casa('const p = `reset/${bloco}/global/${c}.json`')).toBe(true)
    expect(casa("const p = 'conflito/'")).toBe(true)
    expect(casa('const r = `ativo/${id}`')).toBe(true)
    expect(casa('const p = `${raiz}/termos/`')).toBe(true)
    expect(casa("const p = '/termos/'")).toBe(true)
    expect(casa('const p = `import/empresa-${e}`')).toBe(true)
    expect(casa("import { x } from '@/lib/termos/preparo'")).toBe(false)
    expect(casa("const rota = '/ativos/' + id")).toBe(false)
  })
})

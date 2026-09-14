import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Constants } from '@/lib/types/database'
import { categoriasNoSql, estadosNoSql, migracaoComAncora } from './leitor-seed-vocabulario'
import type { CategoriaImport, EstadoAlvoImport, EstadoPlanilha } from './tipos'
import type { ExcluirDaUniao } from '@/lib/tipos-estritos'

// =============================================================================
// A TRAVA DO FATO 16/17 (F56 · Frente B) — as uniões do import VÊM do banco.
// =============================================================================
// POR QUE ELA EXISTE
//
// Até a F56, `src/lib/import/tipos.ts` REDECLARAVA `StatusAtivo` (8 valores) e
// `CategoriaAtivo` (5 valores) à mão — faltando `devolvido_fornecedor` (o banco
// tem 9) e `outro` (o banco tem 6), respectivamente (fato 16). Como consequência,
// `Exclude<StatusAtivo, 'descartado' | 'devolvido_fornecedor'>` (`deparas.ts`,
// `ops-grupo.ts`, `grupos-erros.tsx`) era um NO-OP: `Exclude<T, U>` do TypeScript
// não reclama quando um membro de `U` está FORA de `T` — `devolvido_fornecedor`
// nunca esteve na união local, então excluí-lo não mudava nada (fato 17).
//
// A partir da F56, `CategoriaImport`/`EstadoPlanilha`/`EstadoAlvoImport` (em
// `./tipos`) derivam de `Enums<'categoria_ativo'>`/`Enums<'status_ativo'>` (os
// tipos GERADOS do banco, `src/lib/types/database.ts`) através do utilitário
// estrito `ExcluirDaUniao<T, U extends T>` (`@/lib/tipos-estritos`) — que EXIGE
// que `U` seja subconjunto de `T`, recusando em tempo de COMPILAÇÃO o valor fora
// da união que o `Exclude<>` cru deixava passar calado.
//
// ⚠ O VITEST NÃO CHECA TIPO (esbuild, transpile-only — `vitest.config.mts` não
// declara `test.typecheck`). As asserções de TIPO deste arquivo (seção 2) e o
// `@ts-expect-error` (seção 3) não rodam aqui: quem os verifica é `npx tsc
// --noEmit` (`npm run typecheck`) contra o `tsconfig.json`, que cobre `**/*.ts`
// — inclusive este arquivo. A seção 1 (runtime) e a seção 4 (grep) SÃO
// conferidas pelo Vitest.
//
// ⚠ MEDIDO NA ESCRITA DESTA TRAVA (docs/f56-evidencias/
// B2-sabotagem-ts-expect-error.txt): "Build (inclui type-check do TypeScript)",
// o passo do CI que existia até aqui, NÃO pega uma sabotagem NESTE arquivo — o
// type-check embutido do `next build` só percorre o grafo de módulos que a app
// IMPORTA (páginas, actions…); um `.test.ts` sem importador nenhum em
// `src/app/**` fica fora dele, mesmo casando com o `include` do
// `tsconfig.json`. Por isso o CI ganhou um passo PRÓPRIO, `npm run typecheck`
// (`.github/workflows/ci.yml`), que roda o `tsc --noEmit` direto — é ele, não o
// `next build`, que fecha o caminho de CI que o critério 8 exige.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. RUNTIME — as listas de valores que o import usa batem com `Constants`.
// -----------------------------------------------------------------------------
//
// Não há como ler uma UNIÃO de tipos em runtime (tipo é apagado na compilação).
//
// F56 · Frente D (segunda metade) — a testemunha em runtime MUDOU: até aqui era
// `TIPO_CANONICO`/`SITUACAO_CANONICA`/`ESTADOS`, os `Record<>`/objeto exaustivos
// que `deparas.ts` hardcodava; essas constantes SAÍRAM (o vocabulário virou dado
// no banco, migration 0139). A testemunha agora é o próprio SEED da 0139, lido do
// SQL (`leitor-seed-vocabulario.ts`, o mesmo leitor de `vocabulario-sql.test.ts`)
// — INDEPENDENTE do código TypeScript do import (não deriva de nada que este
// arquivo testa), o que evita a tautologia "provar A com A" tão bem quanto a
// testemunha antiga: `CategoriaImport` via os valores DISTINTOS de `categoria` no
// seed de `import_termos_categoria`; `EstadoPlanilha` via os valores DISTINTOS de
// `estado` no seed de `import_termos_estado` (17 termos → 8 estados, inclusive
// `descartado`); `EstadoAlvoImport` = `EstadoPlanilha` menos `descartado`.

const CATEGORIAS_DO_BANCO = new Set<string>(Constants.public.Enums.categoria_ativo)
const ESTADOS_DO_BANCO = new Set<string>(Constants.public.Enums.status_ativo)

const { sql: SQL_CATEGORIAS } = migracaoComAncora(
  'insert into public.import_termos_categoria (termo, categoria, rotulo) values',
)
const { sql: SQL_ESTADOS } = migracaoComAncora(
  'insert into public.import_termos_estado (termo, estado, rotulo) values',
)

/** `CategoriaImport` em runtime: os valores DISTINTOS de `categoria` no seed. */
const CATEGORIAS_DO_IMPORT = new Set(categoriasNoSql(SQL_CATEGORIAS).map((c) => c.categoria))

/** `EstadoPlanilha` em runtime: os valores DISTINTOS de `estado` no seed —
 *  fonte independente de qualquer `Record<>` de rótulo. */
const ESTADO_PLANILHA_DO_IMPORT = new Set(estadosNoSql(SQL_ESTADOS).map((e) => e.estado))

/** `EstadoAlvoImport` em runtime: `EstadoPlanilha` (testemunha independente) menos
 *  `descartado` — não deriva de nenhum `Record<>` de rótulo. */
const ESTADO_ALVO_DO_IMPORT = new Set([...ESTADO_PLANILHA_DO_IMPORT].filter((e) => e !== 'descartado'))

describe('as uniões do import vêm do banco (Constants), não de enum redeclarado (fato 16)', () => {
  it('guarda do próprio teste: Constants e o seed têm os valores esperados, não vazios', () => {
    expect(CATEGORIAS_DO_BANCO.size).toBeGreaterThan(0)
    expect(ESTADOS_DO_BANCO.size).toBeGreaterThan(0)
    expect(CATEGORIAS_DO_IMPORT.size).toBeGreaterThan(0)
    expect(ESTADO_ALVO_DO_IMPORT.size).toBeGreaterThan(0)
    expect(ESTADO_PLANILHA_DO_IMPORT.size).toBeGreaterThan(0)
  })

  it('CategoriaImport (via o seed da 0139) = categoria_ativo do banco MENOS "outro"', () => {
    const esperado = new Set([...CATEGORIAS_DO_BANCO].filter((c) => c !== 'outro'))
    expect(CATEGORIAS_DO_IMPORT).toEqual(esperado)
  })

  it('EstadoPlanilha (via o seed da 0139, independente) = status_ativo do banco MENOS "devolvido_fornecedor"', () => {
    const esperado = new Set([...ESTADOS_DO_BANCO].filter((e) => e !== 'devolvido_fornecedor'))
    expect(ESTADO_PLANILHA_DO_IMPORT).toEqual(esperado)
  })

  it('EstadoAlvoImport = EstadoPlanilha (testemunha independente) MENOS "descartado"', () => {
    const esperado = new Set([...ESTADO_PLANILHA_DO_IMPORT].filter((e) => e !== 'descartado'))
    expect(ESTADO_ALVO_DO_IMPORT).toEqual(esperado)
  })
})

// -----------------------------------------------------------------------------
// 2. TIPO — igualdade de UNIÃO, no molde que o `tsc` confere (não o Vitest).
// -----------------------------------------------------------------------------

/** `true` só quando `A` e `B` são a MESMA união (extends nos dois sentidos);
 *  senão vira `never`, e a atribuição abaixo falha em tempo de COMPILAÇÃO
 *  (TS2322 "Type 'never' is not assignable to type 'true'"). */
type UniaoIgual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

// Referência LITERAL — as uniões que `tipos.ts` declarava À MÃO até a F56 (fato
// 16). Travam a FORMA que `CategoriaImport`/`EstadoPlanilha`/`EstadoAlvoImport`
// têm de continuar tendo depois de vir de `Enums<...>`: se o enum do banco
// ganhar ou perder um valor sem que ninguém atualize esta lista, a atribuição
// abaixo passa a comparar uniões DIFERENTES e o `npx tsc --noEmit`/`npm run
// build` reprovam — é o alarme de deriva enum↔código.
export type CategoriaImportEsperada = 'notebook' | 'desktop' | 'monitor' | 'celular' | 'tablet'
export type EstadoPlanilhaEsperada =
  | 'em_estoque'
  | 'reservado'
  | 'em_uso'
  | 'emprestado'
  | 'em_triagem'
  | 'em_manutencao'
  | 'defasado'
  | 'descartado'
export type EstadoAlvoImportEsperada = ExcluirDaUniao<EstadoPlanilhaEsperada, 'descartado'>

export const _categoriaImportIgualAoEnum: UniaoIgual<CategoriaImport, CategoriaImportEsperada> = true
export const _estadoPlanilhaIgualAoEnum: UniaoIgual<EstadoPlanilha, EstadoPlanilhaEsperada> = true
export const _estadoAlvoImportIgualAoEnum: UniaoIgual<EstadoAlvoImport, EstadoAlvoImportEsperada> = true

// -----------------------------------------------------------------------------
// 3. O `@ts-expect-error` do fato 17 — `Exclude<>` cru não reclama; o
//    utilitário estrito reclama. Prova por sabotagem em
//    docs/f56-evidencias/B2-sabotagem-ts-expect-error.txt (critério 8).
// -----------------------------------------------------------------------------
//
// `Exclude<T, U>` do TypeScript devolve `T` calado quando um membro de `U` está
// FORA de `T` — é EXATAMENTE como o no-op do fato 16 nasceu. `ExcluirDaUniao<T,
// U extends T>` acrescenta a restrição `U extends T`: um valor de `U` fora de
// `T` vira erro de compilação no PRÓPRIO parâmetro de tipo, não mais um
// `Exclude<>` que silenciosamente devolve `T` inteiro.

/** Uso válido: `'descartado'` pertence a `EstadoPlanilhaEsperada` — sem erro. */
export type ExemploSemErro = ExcluirDaUniao<EstadoPlanilhaEsperada, 'descartado'>

// 'devolvido_fornecedor' NÃO pertence a EstadoPlanilhaEsperada (ela já o
// exclui, por definição). O `Exclude<>` cru IGNORARIA isso calado (fato 17, o
// no-op); o utilitário estrito RECUSA — é o que o `@ts-expect-error` abaixo
// prova. Se `ExcluirDaUniao` regredir para `Exclude<>` cru (ou se
// `devolvido_fornecedor` um dia passar a pertencer à união), este erro deixa
// de acontecer e a própria diretiva vira TS2578 ("Unused '@ts-expect-error'
// directive") — outro erro de compilação, então a sabotagem não passa
// despercebida (critério 8).
//
// ⚠ A diretiva tem de ficar na linha IMEDIATAMENTE ANTERIOR à que reporta o
// erro — daí a declaração ficar numa linha só (um `ExcluirDaUniao<...>`
// quebrado em várias linhas move o erro para a linha do argumento inválido,
// não a do `export type`, e a diretiva "sobra" — foi medido durante a escrita
// desta trava).
// @ts-expect-error — ver o parágrafo acima.
export type ExemploComValorForaDaUniao = ExcluirDaUniao<EstadoPlanilhaEsperada, 'descartado' | 'devolvido_fornecedor'>

// -----------------------------------------------------------------------------
// 4. GREP — nenhum arquivo NÃO-TESTE de src/lib/import/** e
//    src/components/admin/importar/** usa `Exclude<` cru.
// -----------------------------------------------------------------------------

const RAIZ = process.cwd()
const DIRETORIOS_DO_IMPORT = [
  join(RAIZ, 'src', 'lib', 'import'),
  join(RAIZ, 'src', 'components', 'admin', 'importar'),
]

/** Lista recursiva de `.ts`/`.tsx`, caminho absoluto. */
function arquivosTs(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => join(dir, f))
}

/** Remove comentário de bloco e de linha antes de procurar `Exclude<` — uma
 *  MENÇÃO em comentário/JSDoc (documentando o histórico, como este próprio
 *  arquivo faz) não é o defeito que esta trava persegue; só código executável
 *  conta. Não precisa tratar string literal: nenhum arquivo desta árvore tem
 *  `Exclude<` dentro de uma string, e superestripar (о que aconteceria com uma
 *  URL `https://` numa linha de código real) só produziria falso-NEGATIVO,
 *  nunca falso-positivo — aceitável para um grep de estilo, não uma prova fina. */
function semComentarios(ts: string): string {
  return ts
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((linha) => linha.replace(/\/\/.*$/, ''))
    .join('\n')
}

const ARQUIVOS_NAO_TESTE = DIRETORIOS_DO_IMPORT.flatMap(arquivosTs).filter(
  (f) => !/\.test\.tsx?$/.test(f),
)

describe('nenhum arquivo NÃO-TESTE do import usa Exclude< cru — só o utilitário estrito (fato 17)', () => {
  it('guarda do próprio teste: há arquivos para varrer', () => {
    expect(ARQUIVOS_NAO_TESTE.length).toBeGreaterThan(5)
  })

  it.each(ARQUIVOS_NAO_TESTE.map((f) => [f.slice(RAIZ.length + 1), f] as const))(
    '%s não usa Exclude< cru (código executável, fora de comentário)',
    (_rotulo, arquivo) => {
      const texto = semComentarios(readFileSync(arquivo, 'utf8'))
      expect(texto).not.toMatch(/\bExclude</)
    },
  )
})

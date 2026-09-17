import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

// A CONFIRMAÇÃO DIGITADA É UMA SÓ (F61 · decisão ii).
//
// As quatro confirmações "digite X para confirmar" do sistema — a mesa de
// conflitos, o "Substituir tudo" do import, o apagar conta e a Zona destrutiva —
// passaram pelo mesmo componente, `src/components/layout/confirmacao-digitada.tsx`.
// Antes, três delas montavam o campo à mão e importavam a DICA
// (`dicaConfirmacaoNaoConfere`) direto do validador, e a quarta (a mesa) nem isso:
// era a única muda.
//
// A trava: a dica só é importada pelo COMPONENTE (e pelo próprio módulo de
// validação e o teste dele). Quem monta uma confirmação nova e quer a mensagem
// passa pelo componente — e ganha junto o `aria-invalid`, o `aria-describedby` e o
// `role="alert"`. SEM EXCEÇÃO: a ficha a pediu assim, e a medição de 17/09/2026
// mostrou que ela reprovaria no dia (três importadores fora de `layout/`).

const RAIZ = process.cwd()
const PERMITIDOS = new Set([
  'src/components/layout/confirmacao-digitada.tsx',
  'src/lib/validators/confirmacao-digitada.ts',
  'src/lib/validators/confirmacao-digitada.test.ts',
])

type Fonte = { arquivo: string; codigo: string }

function fontes(): Fonte[] {
  const achadas: Fonte[] = []
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        visitar(caminho)
        continue
      }
      if (!/\.(ts|tsx)$/.test(nome)) continue
      achadas.push({
        arquivo: relative(RAIZ, caminho).split(sep).join('/'),
        codigo: readFileSync(caminho, 'utf8'),
      })
    }
  }
  visitar(join(RAIZ, 'src'))
  return achadas
}

/** Quem cita a dica fora da fronteira (import, reexport ou uso). */
function importadoresIndevidos(lista: Fonte[]): string[] {
  return lista
    .filter((f) => !PERMITIDOS.has(f.arquivo))
    .filter((f) => f.arquivo !== 'src/components/layout/confirmacao-digitada-fronteira.test.ts')
    .filter((f) => /\bdicaConfirmacaoNaoConfere\b/.test(f.codigo))
    .map((f) => f.arquivo)
}

describe('a dica da confirmacao digitada so e importada pelo componente (F61)', () => {
  const todas = fontes()

  it('ninguem fora de layout/ importa dicaConfirmacaoNaoConfere', () => {
    expect(importadoresIndevidos(todas)).toEqual([])
  })

  it.each([
    'src/components/pendencias/mesa-conflitos.tsx',
    'src/components/admin/importar/importar-wizard.tsx',
    'src/components/admin/usuarios/apagar-usuario-dialog.tsx',
    'src/components/dev/destrutivo/dialogo-destrutivo.tsx',
  ])('%s usa <ConfirmacaoDigitada>', (arquivo) => {
    const codigo = todas.find((f) => f.arquivo === arquivo)?.codigo ?? ''
    expect(codigo).toMatch(/from '@\/components\/layout\/confirmacao-digitada'/)
    expect(codigo).toMatch(/<ConfirmacaoDigitada\b/)
  })

  // SABOTAGEM F (a metade estática), guardada como teste.
  it('um arquivo sintetico fora de layout/ importando a dica reprova', () => {
    const sintetico = {
      arquivo: 'src/components/admin/confirmar-algo-dialog.tsx',
      codigo: `import { dicaConfirmacaoNaoConfere } from '@/lib/validators/confirmacao-digitada'`,
    }
    expect(importadoresIndevidos([...todas, sintetico])).toContain(sintetico.arquivo)
  })
})

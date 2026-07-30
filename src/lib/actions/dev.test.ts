import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// TRIPWIRES de `src/lib/actions/dev.ts` (F22) — o irmão de `admin.test.ts`, mesmo idioma e
// mesma limitação: leem a FONTE e travam propriedades estruturais, não comportamento (não há
// banco no Vitest; a prova de runtime é supabase/tests/cargo_dev.sql).
//
// O que este arquivo guarda é a fronteira do 4º cargo. As actions daqui são a GESTÃO AVANÇADA
// — trocar o e-mail de login, apagar uma conta, encerrar sessões, rodar as checagens e
// revalidar cache —, exatamente o que o cargo Administrador NÃO tem. Uma action nova aqui sem
// `exigirDev`, ou uma guarda rebaixada para `exigirAdmin`, entregaria essas ferramentas a todo
// administrador em silêncio: o banco continuaria recusando as duas RPCs que exigem `e_dev()`
// por dentro (0074), mas `alterarEmailUsuario` e `revalidarGrupo` NÃO passam por RPC nenhuma —
// elas rodam no service role e no cache do Next, onde não há segunda linha de defesa.

const FONTE = readFileSync(fileURLToPath(new URL('./dev.ts', import.meta.url)), 'utf8')

// CÓDIGO sem comentários: os comentários do módulo citam o que estes tripwires proíbem
// ("exigirAdmin", "admin.signOut()", os nomes das RPCs), e sem a limpeza o teste ficaria
// vermelho pela documentação. Não há `//` dentro de string neste módulo.
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

// Sem espaço nenhum: asserção sobre CHAMADA não pode quebrar por quebra de linha do Prettier.
const SEM_ESPACO = CODIGO.replace(/\s+/g, '')

function actionsExportadas(): { nome: string; corpo: string }[] {
  const re = /export async function (\w+)\(/g
  const inicios: { nome: string; indice: number }[] = []
  for (const m of CODIGO.matchAll(re)) {
    inicios.push({ nome: m[1], indice: m.index })
  }
  return inicios.map((i, k) => ({
    nome: i.nome,
    corpo: CODIGO.slice(i.indice, inicios[k + 1]?.indice ?? CODIGO.length),
  }))
}

function corpoDe(nome: string): string {
  const a = actionsExportadas().find((x) => x.nome === nome)
  expect(a, `a action ${nome} sumiu do módulo`).toBeDefined()
  return a!.corpo
}

describe('actions de /dev — toda action exige o cargo DEV', () => {
  it('o módulo tem as cinco actions da fase (a varredura não está passando a seco)', () => {
    const nomes = actionsExportadas().map((a) => a.nome)
    expect(nomes).toEqual(
      expect.arrayContaining([
        'alterarEmailUsuario',
        'apagarUsuario',
        'encerrarSessoes',
        'rodarChecagensIntegridade',
        'revalidarGrupo',
      ]),
    )
  })

  it('nenhuma action deste arquivo roda sem chamar exigirDev', () => {
    for (const a of actionsExportadas()) {
      expect(a.corpo, `${a.nome} não chama exigirDev`).toContain('exigirDev(')
    }
  })

  it('nenhuma guarda mais fraca aparece no lugar dela', () => {
    // `exigirAdmin` é hierárquico (admin OU dev): usá-lo aqui abriria a gestão avançada para
    // todo administrador. `idOperador` só responde "existe sessão?" — nunca é autorização.
    expect(CODIGO).not.toMatch(/\bexigirAdmin\s*\(/)
    expect(CODIGO).not.toMatch(/\bexigirPapel\s*\(/)
    expect(CODIGO).not.toMatch(/\bexigirOperador\s*\(/)
    expect(CODIGO).not.toMatch(/\bidOperador\s*\(/)
  })

  it('o cargo nunca vem do metadata do usuário', () => {
    // O próprio usuário edita o metadata dele por `auth.updateUser` (ADR-002 §5) — e este
    // módulo tem o service role na mão, o que tornaria o erro fatal.
    expect(CODIGO).not.toContain('user_metadata')
    expect(CODIGO).not.toContain('raw_user_meta_data')
    expect(CODIGO).not.toContain('app_metadata')
  })
})

describe('apagar conta — a sequência de falha segura', () => {
  it('a recusa em pt-BR sai da função pura testada, não de if solto', () => {
    expect(corpoDe('apagarUsuario')).toContain('validarExclusaoDeUsuario(')
  })

  it('o BANCO vem primeiro, o Auth depois', () => {
    // A ordem é o que torna a falha segura: a RPC corta leitura e escrita (0073) e só então a
    // conta de login é removida. Invertida, uma falha na RPC deixaria um perfil VIVO sem conta
    // de login — o pior dos dois estados, e sem nenhum erro visível.
    const corpo = corpoDe('apagarUsuario').replace(/\s+/g, '')
    const rpc = corpo.indexOf(".rpc('apagar_usuario'")
    const auth = corpo.indexOf('deleteUser(')
    expect(rpc, 'a RPC apagar_usuario não é chamada').toBeGreaterThan(-1)
    expect(auth, 'a conta do Auth não é removida').toBeGreaterThan(-1)
    expect(rpc).toBeLessThan(auth)
  })

  it('o perfil NÃO é apagado da tabela — dez FKs de histórico apontam para ele', () => {
    // O arquivamento é `excluido_em` dentro da RPC. Um `delete` em `profiles` por aqui levaria
    // junto o "Quem fez" de toda movimentação, anotação e termo antigos.
    expect(SEM_ESPACO).not.toMatch(/\.from\(['"`]profiles['"`]\)\.delete\(/)
  })
})

describe('as RPCs de gestão são chamadas com o client de SESSÃO', () => {
  // É o que faz a trava valer: `apagar_usuario` e `encerrar_sessoes_usuario` são
  // `security definer` e exigem `e_dev()` POR DENTRO (0074) — o que só funciona porque
  // `auth.uid()` chega preenchido. Pelo service role ele seria nulo e a decisão voltaria a ser
  // do `if` da action.
  it.each(['apagar_usuario', 'encerrar_sessoes_usuario'])('%s', (rpc) => {
    expect(SEM_ESPACO, `${rpc} não é chamada`).toContain(`.rpc('${rpc}'`)
    expect(SEM_ESPACO, `${rpc} chamada pelo client administrativo`).not.toContain(
      `admin.rpc('${rpc}'`,
    )
  })
})

describe('revalidarGrupo — a lista de rotas é FECHADA', () => {
  it('o grupo vem de um mapa constante, não do que o cliente mandou', () => {
    // `revalidatePath(<algo do input>)` seria uma primitiva de invalidação arbitrária de
    // cache exposta numa Server Action. O input só serve de CHAVE do mapa.
    expect(corpoDe('revalidarGrupo')).toContain('GRUPOS_REVALIDACAO[')
    expect(SEM_ESPACO).not.toMatch(/revalidatePath\(input[.,)]/)
    expect(SEM_ESPACO).not.toMatch(/revalidatePath\(grupo[.,)]/)
  })

  it('cada rota revalidada é um literal', () => {
    // Todo `revalidatePath(` do módulo recebe string literal — o laço do grupo itera sobre o
    // mapa constante e usa a variável `rota`, que é a única exceção, coberta pelo caso acima.
    const chamadas = [...SEM_ESPACO.matchAll(/revalidatePath\(([^)]*)\)/g)].map((m) => m[1])
    expect(chamadas.length).toBeGreaterThan(0)
    for (const arg of chamadas) {
      expect(arg === 'rota' || /^'\/[^']*'$/.test(arg), `revalidatePath(${arg})`).toBe(true)
    }
  })
})

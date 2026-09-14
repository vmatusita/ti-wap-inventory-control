import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { podeLer, podeEscreverNoEscopo, filiaisParaEscrita } from './permissoes'

// AUTORIZAÇÃO NÃO SE DERIVA DO COMPRIMENTO DE UMA LISTA (F50).
//
// A doutrina já estava escrita — em `src/lib/auth/papeis.ts`, no comentário de
// `unidadesMarcadasPorPadrao` (até a F57, `filtroFilialPadrao`):
//
//   "⚠ A decisão olha o CARGO, nunca `escopoEscrita.length === 0`. Lista vazia tem
//    dois significados diferentes: `consulta` (que não escreve em lugar nenhum) e
//    `operador` sem vínculo válido — um usuário quebrado."
//
// O que faltava era alguém conferindo. Esta trava confere: nenhuma prop de PERMISSÃO
// pode receber `filiais.length > 0` (ou a variante com `escopoEscrita`). O perigo não
// é estético — é que as duas populações têm respostas diferentes, e um `.length`
// devolve a mesma para as duas. Quando `Permissoes` ganhar `empresaId`, o mesmo
// atalho passaria a confundir "lista vazia porque a empresa não tem filial" com
// "lista vazia porque este cargo não escreve".
const RAIZ = join(process.cwd(), 'src')

/** Props cujo nome declara PERMISSÃO. É por elas que a derivação vira autorização. */
const PROPS_DE_PERMISSAO = ['podeCadastrar', 'podeCriar', 'podeEscrever', 'podeLer', 'podeEditar']

/**
 * O nome da lista cujo comprimento NÃO pode virar permissão: `filiais*` e, desde a F57,
 * `escopo*`. ⚠ A segunda metade não é enfeite: a F57 renomeou o campo `filiaisEscrita` para
 * `escopoEscrita`, e com o prefixo antigo sozinho esta trava ficaria CEGA exatamente para a
 * variante que ela nasceu para pegar — `podeCadastrar={escopoEscrita.length > 0}` passaria
 * verde, sem ninguém notar.
 */
const LISTA_DE_ESCOPO = String.raw`\b(?:filiais|escopo)\w*`

/**
 * `<prop>={…filiais…length…}` — a prop de permissão alimentada por comprimento.
 *
 * Só casa `.length`/`[0]` de algo que se chame `filiais*` ou `escopo*`: um
 * `podeCadastrar={itens.length > 0}` é outra conversa (viabilidade de uma lista de itens), e
 * acusá-lo aqui só ensinaria a desligar a trava.
 */
function derivacoesDeAutorizacao(): string[] {
  const re = new RegExp(
    `(${PROPS_DE_PERMISSAO.join('|')})=\\{[^}]*${LISTA_DE_ESCOPO}(?:\\.length|\\[0\\])[^}]*\\}`,
    'g',
  )
  const achados: string[] = []
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      if (statSync(p).isDirectory()) varrer(p)
      else if (/\.tsx$/.test(nome) && !nome.includes('.test.')) {
        const fonte = readFileSync(p, 'utf8')
        for (const m of fonte.matchAll(re)) {
          achados.push(`${p.slice(RAIZ.length + 1).split(/[\\/]/).join('/')}: ${m[0]}`)
        }
      }
    }
  }
  varrer(RAIZ)
  return achados.sort()
}

// A ÚNICA infração medida na F50, e ela fica — com o motivo, e com data para sair.
//
// `podeCadastrar={filiais.length > 0}` deriva cargo de comprimento, e o comentário ao
// lado dele admite isso por escrito. A correção óbvia seria copiar os dois vizinhos
// (`passo-movimentacao.tsx` e `secao-contrapartida.tsx`, que passam `papel !== 'consulta'`)
// — mas ela MUDA O QUE ALGUÉM VÊ, e esta fase não muda comportamento.
//
// Medido, subindo a cadeia de props (itens/page.tsx:166 → :293 → lancar-item-dialog:609):
//   · `consulta` NUNCA chega aqui — o diálogo só monta dentro de `{escreve && …}`.
//     O comentário no código, que diz "lista vazia = cargo consulta", está ERRADO;
//     ele foi corrigido na F50, e essa correção não muda comportamento nenhum.
//   · a única forma de a lista chegar vazia é OPERADOR SEM VÍNCULO. Hoje ele não vê o
//     botão "Cadastrar"; com `papel !== 'consulta'` passaria a ver — e provavelmente a
//     conseguir usar, porque cadastro de pessoa não é matéria de filial (o `filial_id`
//     é atributo, não escopo de escrita). Ou seja: a troca não só muda a tela, como
//     provavelmente CORRIGE um bloqueio indevido. As duas coisas são mudança visível.
//
// Por isso ela vira exceção nominal, e o conserto vai nomeado para a F70, onde o
// `podeLer` ganha corpo e a pergunta "este cargo cadastra pessoa?" tem casa própria.
const EXCECOES: Record<string, string> = {
  'components/itens/lancar-item-campos.tsx':
    'podeCadastrar={filiais.length > 0}: trocar por `papel !== \'consulta\'` faria o operador SEM VÍNCULO passar a ver o botão de cadastrar pessoa, que hoje não vê — mudança de comportamento visível, carregada para a F70',
}

describe('podeLer (F50)', () => {
  it('responde "existe sessão com permissões?" e nada além disso', () => {
    expect(podeLer({ papel: 'consulta', escopoEscrita: [] })).toBe(true)
    expect(podeLer({ papel: 'operador', escopoEscrita: [] })).toBe(true)
    expect(podeLer(null)).toBe(false)
    expect(podeLer(undefined)).toBe(false)
  })

  it('não olha o cargo nem as filiais — quem lê, lê tudo (ADR-002)', () => {
    // O piso de leitura é `papel_atual() is not null`, e `consulta` com zero filiais
    // é exatamente quem esta função precisa deixar passar. Se um dia ela começar a
    // recusar por cargo, este teste diz que a mudança foi deliberada.
    expect(podeLer({ papel: 'consulta', escopoEscrita: [] })).toBe(
      podeLer({ papel: 'dev', escopoEscrita: [1, 2, 3] }),
    )
  })

  it('é independente de podeEscreverNoEscopo (ler não é escrever)', () => {
    const consulta = { papel: 'consulta' as const, escopoEscrita: [] }
    expect(podeLer(consulta)).toBe(true)
    expect(podeEscreverNoEscopo(consulta, 1)).toBe(false)
    expect(filiaisParaEscrita(consulta, [{ id: 1 }])).toEqual([])
  })
})

describe('nenhum componente deriva AUTORIZAÇÃO do comprimento da lista de filiais', () => {
  it('a varredura enxerga o repositório (guarda do próprio teste)', () => {
    // Sem isto, um regex que parasse de casar deixaria a trava verde e vazia.
    const re = new RegExp(`(${PROPS_DE_PERMISSAO.join('|')})=\\{[^}]*${LISTA_DE_ESCOPO}\\.length[^}]*\\}`)
    expect(re.test('<X podeCadastrar={filiais.length > 0} />')).toBe(true)
    // F57 — o nome novo do campo tem de continuar sendo visto (senão o rename cegou a trava).
    expect(re.test('<X podeCadastrar={escopoEscrita.length > 0} />')).toBe(true)
    expect(re.test('<X podeCadastrar={papel !== \'consulta\'} />')).toBe(false)
  })

  it('só as exceções registradas derivam permissão de `.length`', () => {
    const novas = derivacoesDeAutorizacao().filter(
      (d) => !Object.keys(EXCECOES).some((e) => d.startsWith(e + ':')),
    )
    expect(
      novas,
      'lista vazia tem DOIS significados (cargo que não escreve × vínculo ausente) e ' +
        '`.length` devolve a mesma resposta para os dois — pergunte pelo CARGO ' +
        '(`papel !== \'consulta\'`), como fazem passo-movimentacao.tsx e secao-contrapartida.tsx',
    ).toEqual([])
  })

  it('nenhuma exceção envelheceu (a infração ainda existe onde está declarada)', () => {
    const atuais = derivacoesDeAutorizacao()
    const sumidas = Object.keys(EXCECOES).filter((e) => !atuais.some((a) => a.startsWith(e + ':')))
    expect(sumidas, 'exceção que já não descreve o código: apague a entrada').toEqual([])
  })

  it('os dois vizinhos continuam perguntando pelo CARGO (o molde certo)', () => {
    for (const rel of [
      'components/movimentacoes/nova/passo-movimentacao.tsx',
      'components/movimentacoes/nova/secao-contrapartida.tsx',
    ]) {
      const fonte = readFileSync(join(RAIZ, ...rel.split('/')), 'utf8')
      expect(fonte, `${rel}: o molde de referência mudou`).toContain(
        "podeCadastrar={papel !== 'consulta'}",
      )
    }
  })
})

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// O ERRO ENGOLIDO — a varredura congelada (F50).
//
// `const { data } = await client.from(…)` descarta o `error` do PostgREST. O
// resultado é sempre o mesmo: a função devolve vazio, a tela renderiza vazio, e
// ninguém fica sabendo que houve falha. Não existe stack, não existe log, não existe
// 500 — existe uma tela que some. É o modo de falha mais caro de diagnosticar,
// porque parece dado ausente, não erro.
//
// A F50 consertou o caso de RELATÓRIO (`relatorios/comum.ts`, `resolverFilialPorSlug`),
// que era o que o plano multiempresa vai piorar: quando `filiais.slug` deixar de ser
// único global, o PGRST116 viraria `notFound()` mudo em toda rota de relatório.
//
// ⚠ MEDIDO NA F50: são SEIS, não quatro. A ficha e a ordem de serviço contavam quatro
// porque procuravam a forma literal `const { data } = await`. Três ocorrências usam
// RENOMEAÇÃO — `const { data: compra } = await`, `const { data: est } = await`,
// `const { data: estornos } = await` — e engolem o erro exatamente igual. A varredura
// abaixo casa as duas formas, e foi assim que os três apareceram.
//
// Os cinco restantes NÃO foram convertidos, e não por esquecimento: cada um está fora
// do caminho do relatório, e mudar o que eles fazem em falha é mudança de
// comportamento que esta fase não faz (regra 1 do CLAUDE.md). Ficam CONGELADOS aqui —
// nomeados, com o motivo — para que o sexto não vire o sétimo sem alguém decidir.
//
// A lista só ENCOLHE. Converter um deles é apagar a entrada; acrescentar um exige
// vir aqui, escrever o motivo, e explicar por que aquele caminho pode perder um erro.
const RAIZ = join(process.cwd(), 'src', 'lib', 'queries')

const CONGELADOS: Record<string, string> = {
  'admin.ts::listarMotivosAdmin':
    'catálogo de motivos em /admin/motivos; a tela é de administração e a lista vazia é visível ao próprio admin, que sabe que cadastrou motivo',
  'admin.ts::listarSenhasAcesso':
    'lista de senhas em /admin/senhas, lida pelo client administrativo; mesma tela, mesmo leitor, e o hash nunca sai do servidor',
  'itens.ts::getUltimoLancamento':
    'o "repetir último" do lançamento de item — conveniência de pré-preenchimento: falhar em silêncio devolve formulário vazio, que é o estado normal de quem nunca lançou',
  'itens.ts::getHistoricoLancamentos':
    'lê os lançamentos ESTORNADOS só para riscar a linha no histórico de itens; perder isso mostra o histórico sem o selo de estorno, nunca linha de outra filial (F50: forma com renomeação)',
  'compras.ts::dadosParaDuplicarCompra':
    'pré-preenche o formulário de "duplicar compra"; falha e ausência caem no mesmo formulário vazio, que é o estado de quem abre uma compra nova (F50: forma com renomeação)',
  'movimentacoes.ts::possiveisDuplicatasDoDia':
    'aviso de possível duplicata no wizard; é conselho, não trava — a movimentação segue permitida, e falhar em silêncio só remove o aviso (F50: forma com renomeação)',
}

function modulos(dir = RAIZ, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) modulos(p, acc)
    else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) acc.push(p)
  }
  return acc
}

/**
 * `const { data } = await …` e `const { data: x } = await …` — as duas formas que
 * descartam o `error`. A segunda é a que a contagem anterior perdia.
 *
 * ⚠ Casa `}` logo depois do nome, então `const { data, error } = await` — a forma
 * CERTA — não entra. É essa exclusão que faz o teste medir o defeito, e não o padrão.
 */
const RE_ENGOLIDO = /const\s*\{\s*data\s*(?::\s*[A-Za-z0-9_]+\s*)?\}\s*=\s*await\b/g

/**
 * Comentários fora, aqui — ao contrário do irmão `confinamento-viewer.test.ts`.
 *
 * A diferença não é descuido: lá o alvo é `href=`, que dentro de um comentário ainda
 * denuncia um link real escrito por engano, e tirar comentários exigiria decidir onde
 * `//` abre comentário e onde começa `"//evil.com"` — errar isso ESCONDE vazamento.
 * Aqui o alvo é uma forma de código que só existe executando; citá-la num comentário
 * (como este arquivo faz, e como `comum.ts` passou a fazer para explicar o conserto)
 * é documentação, não defeito. Manter comentários faria a trava acusar quem a explica.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
}

/** Cada ocorrência, rotulada pela FUNÇÃO exportada que a contém. */
function ocorrencias(): string[] {
  const achadas: string[] = []
  for (const caminho of modulos()) {
    const fonte = semComentarios(readFileSync(caminho, 'utf8'))
    const arquivo = caminho.slice(RAIZ.length + 1).split(/[\\/]/).join('/')
    for (const m of fonte.matchAll(RE_ENGOLIDO)) {
      // A função que contém a ocorrência: a última DECLARAÇÃO DE FUNÇÃO antes dela —
      // não a última variável, que seria quase sempre o `const client = await …` da
      // linha de cima e não diria nada a quem lê o relatório da falha.
      const antes = fonte.slice(0, m.index)
      const decls = [
        ...antes.matchAll(
          /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|export\s+const\s+([A-Za-z0-9_]+)\s*=/g,
        ),
      ]
      const ultima = decls[decls.length - 1]
      achadas.push(`${arquivo}::${ultima ? (ultima[1] ?? ultima[2]) : '?'}`)
    }
  }
  return achadas.sort()
}

describe('o erro engolido: `const { data } = await` em src/lib/queries', () => {
  it('a varredura enxerga o repositório (guarda do próprio teste)', () => {
    // Sem isto, um regex que parasse de casar deixaria o teste verde e vazio — a
    // mesma falha silenciosa que ele existe para impedir.
    expect(modulos().length, 'não achei os módulos de queries').toBeGreaterThan(20)
    expect(RE_ENGOLIDO.test('const { data } = await client.from("x")')).toBe(true)
    RE_ENGOLIDO.lastIndex = 0
    expect(RE_ENGOLIDO.test('const { data, error } = await client.from("x")')).toBe(false)
    RE_ENGOLIDO.lastIndex = 0
  })

  it('nenhum caso NOVO — a lista de congelados só encolhe', () => {
    const novos = ocorrencias().filter((o) => !(o in CONGELADOS))
    expect(
      novos,
      'descartar o `error` faz a falha virar tela vazia, sem log: converta para ' +
        '`const { data, error }` e lance, ou congele aqui com o motivo escrito',
    ).toEqual([])
  })

  it('nenhum congelado ENVELHECEU (todos ainda existem no código)', () => {
    const atuais = new Set(ocorrencias())
    const sumidos = Object.keys(CONGELADOS).filter((c) => !atuais.has(c))
    expect(
      sumidos,
      'congelado que já não existe: apague a entrada — exceção não sobrevive ao motivo que a criou',
    ).toEqual([])
  })

  it('cada congelado traz um motivo escrito, não uma categoria', () => {
    for (const [chave, motivo] of Object.entries(CONGELADOS)) {
      expect(motivo.length, `${chave}: motivo curto demais`).toBeGreaterThan(60)
    }
  })

  it('a rota de RELATÓRIO não engole erro (o caso que a F50 consertou)', () => {
    const fonte = readFileSync(join(RAIZ, 'relatorios', 'comum.ts'), 'utf8')
    expect(fonte).toContain('const { data, error } = await client')
    expect(fonte).toContain('Falha ao resolver a filial')
  })
})

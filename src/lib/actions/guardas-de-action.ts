// A LEITURA DAS GUARDAS de um módulo `'use server'` (F49 · frente 3).
//
// POR QUE ESTE MÓDULO EXISTE
// --------------------------
// Uma Server Action exportada É UM ENDPOINT HTTP. O Next lhe dá um id, e qualquer
// pessoa com sessão — ou, dependendo da action, sem nenhuma — pode chamá-la por
// POST direto, sem passar por tela alguma. A tela que a esconde é ergonomia; a
// guarda dentro dela é o que responde "esta pessoa pode?".
//
// Até a F49, NOVE leituras não perguntavam nada: `buscarAtivosParaMovimentacao`,
// as sugestões do wizard e as três de compra devolviam acervo a qualquer sessão
// válida, inclusive à de um perfil DESATIVADO — que `getOperador()` já expulsa de
// toda a UI, mas cujo token continua valendo até expirar. Este módulo é a leitura
// textual que impede o retorno disso: `guardas-de-action.test.ts` varre o `src/`,
// lista os exports de todo módulo `'use server'` e cobra guarda ou isenção NOMINAL.
//
// Não é um parser de TypeScript — não há um na stack fechada (CLAUDE.md) e nem é
// preciso. Comentários e strings são neutralizados pelo MESMO `limpar` de
// `use-server-exports.ts` (reusado, não recopiado), de modo que um `exigirPapel`
// citado num comentário ou dentro de uma string NÃO conta como guarda.
//
// A INDIRETA DE UM NÍVEL, e por que ela é deliberada
// --------------------------------------------------
// Dois módulos do repositório guardam por HELPER LOCAL, e os dois estão certos:
//   · `actions/exportar.ts` — `barrado()` resolve sessão+cargo e devolve a
//     mensagem; os 4 exports de CSV o chamam. O comentário de doze linhas da F21
//     que explica a doutrina inteira mora lá, uma vez só.
//   · `actions/compras.ts` — `sugerir()` concentra o piso de caracteres, a guarda
//     e a degradação com log das três sugestões de compra.
// Exigir a chamada literal em cada export forçaria a desfazer os dois helpers e a
// duplicar `createClient()` sete vezes — pioraria o código para agradar à trava.
// Então a trava aprendeu o padrão: um export conta como guardado quando chama uma
// função DECLARADA NO MESMO ARQUIVO cujo corpo chama uma das cinco guardas.
//
// UM NÍVEL, e só um. Se o helper por sua vez delega a outro helper, a trava
// RECUSA — porque a essa altura ninguém que lê o export consegue mais afirmar,
// olhando, que ele é guardado, e uma trava que aceita cadeia arbitrária vira
// peneira. Helper de OUTRO módulo também não conta: `barrado` é reconhecido pela
// DECLARAÇÃO local, nunca pelo nome (ver a sabotagem C no relatório da fase).
//
// LIMITAÇÕES ACEITAS, e escritas para não serem confundidas com garantias
// ----------------------------------------------------------------------
//  · A trava prova que a guarda é CHAMADA no corpo — não que ela é alcançada em
//    todo caminho, nem que o `if (!aut.ok)` que a segue faz a coisa certa. Guarda
//    dentro de um ramo que nunca executa passaria. Isso é revisão humana, e o
//    custo de fingir o contrário seria maior que o de dizê-lo aqui.
//  · O corpo de uma função de topo vai da linha da declaração até a primeira
//    linha que COMEÇA com `}` na coluna 0 — o formato que o Prettier garante em
//    todo arquivo deste repositório (`npm run lint`). Se um dia não garantir, o
//    corpo lido fica MAIOR que o real, o que pode dar falso NEGATIVO de "sem
//    guarda" (teste vermelho), nunca falso positivo de "guardado".
//  · A segunda linha, não a primeira: a primeira é a RLS no Postgres. As nove
//    leem tabelas cujas policies de SELECT seguem `using (true)` por desenho
//    (ADR-001), e é por isso que a guarda aqui importa — mas ela não substitui o
//    banco, e nenhuma frase deste arquivo deve ser lida como se substituísse.

import { limpar } from '@/lib/use-server-exports'

/**
 * As CINCO guardas de `src/lib/auth/acesso.ts`. Não inclui `idOperador`, e isso é
 * o ponto: `idOperador` responde "existe sessão?", NUNCA "pode fazer isso?"
 * (CLAUDE.md, com essas palavras). Um export que só chama `idOperador` conta como
 * SEM GUARDA aqui, de propósito.
 */
export const GUARDAS = [
  'exigirPapel',
  'exigirAdmin',
  'exigirDev',
  'exigirEscrita',
  'exigirEscritaEm',
] as const

export type NomeDeGuarda = (typeof GUARDAS)[number]

export type ExportDeAction = {
  /** Nome da função exportada. */
  nome: string
  /** Linha da assinatura, 1-indexed (a mesma que o editor mostra). */
  linha: number
  /** A guarda encontrada, ou `null` quando não há nenhuma. */
  guarda: NomeDeGuarda | null
  /** Como ela foi encontrada: no corpo do próprio export, ou num helper local. */
  via: 'direta' | 'indireta' | null
  /** Quando `via === 'indireta'`: o helper local que carrega a guarda. */
  helper?: string
}

type Declaracao = {
  nome: string
  linha: number
  exportada: boolean
  corpo: string
}

// Declaração de função de TOPO (coluna 0). Cobre as quatro formas que existem no
// repositório: `export async function f`, `async function f`, `function f` e
// `export default async function`. Arrow em `const f = async () => {}` também.
const RE_DECL_FUNCAO = /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_$]+)\s*[(<]/
const RE_DECL_ARROW =
  /^(export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*(?::[^=]*)?=>/

/**
 * A linha que FECHA uma função de topo: começa na coluna 0 com `}` e não traz
 * mais nada além de `)`, `;` ou `,` — as caudas de `})` (arrow dentro de
 * chamada, como `cache(async () => { … })`) e `});`.
 *
 * ⚠ ESTA REGEX É O CORAÇÃO DA LEITURA, e as duas formas que ela recusa custaram
 * duas medições erradas na própria F49 (07/09/2026):
 *  · `}): Promise<X> {` — o fecho do PARÂMETRO objeto multilinha, no meio da
 *    assinatura. Aceitá-lo truncava o corpo na assinatura e fazia 12 actions
 *    corretamente guardadas aparecerem como sem guarda (66 falsos contra 18).
 *  · `  }>` — o fecho de um genérico multilinha (`Promise<ConflitoResult<{…}>>`),
 *    que vem INDENTADO e por isso já não casa o `^`. Foi o que escondeu o
 *    `exigirAdmin` de `resumoExclusaoConflito`.
 * Contar profundidade de chaves NÃO resolve nenhum dos dois: nos dois casos a
 * profundidade volta legitimamente a zero antes de o corpo abrir.
 */
const RE_FECHA_TOPO = /^\}[)\s;,]*$/

/**
 * Todas as declarações de função de TOPO do arquivo, com o corpo de cada uma.
 * Recebe a fonte JÁ neutralizada.
 *
 * O corpo vai da linha da declaração até a linha que a fecha (`RE_FECHA_TOPO`) —
 * o formato que o Prettier garante em todo arquivo deste repositório
 * (`npm run lint`).
 */
function declaracoesDeTopo(limpo: string): Declaracao[] {
  const linhas = limpo.split('\n')
  const achados: Declaracao[] = []

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const mFn = RE_DECL_FUNCAO.exec(linha)
    const mArrow = mFn ? null : RE_DECL_ARROW.exec(linha)
    if (!mFn && !mArrow) continue

    const nome = mFn ? mFn[3] : mArrow![2]
    const exportada = Boolean(mFn ? mFn[1] : mArrow![1])

    let fim = linhas.length - 1
    for (let k = i + 1; k < linhas.length; k++) {
      if (RE_FECHA_TOPO.test(linhas[k])) {
        fim = k
        break
      }
      // Rede de segurança: se o fecho não for reconhecido (formatação fora do
      // padrão do Prettier), a próxima declaração de topo encerra o corpo. Erra
      // para MAIS CURTO, nunca para engolir o arquivo inteiro — corpo curto
      // demais dá teste VERMELHO (falso "sem guarda"), que alguém conserta; corpo
      // longo demais daria falso "guardado", que ninguém veria.
      if (RE_DECL_FUNCAO.test(linhas[k]) || RE_DECL_ARROW.test(linhas[k])) {
        fim = k - 1
        break
      }
    }
    achados.push({
      nome,
      linha: i + 1,
      exportada,
      corpo: linhas.slice(i, fim + 1).join('\n'),
    })
  }
  return achados
}

/** A primeira das cinco guardas CHAMADA neste corpo, ou `null`. */
function guardaChamadaEm(corpo: string): NomeDeGuarda | null {
  for (const g of GUARDAS) {
    // `\b` de um lado e `\s*\(` do outro: é a CHAMADA que conta, não a menção.
    // `import { exigirPapel }` não casa (não tem parêntese); `exigirPapelFalso(`
    // não casa (o `\b` do fim exige que o nome termine ali).
    if (new RegExp(`\\b${g}\\s*\\(`).test(corpo)) return g
  }
  return null
}

/**
 * Os exports de um módulo `'use server'`, cada um com a guarda que o protege
 * (direta ou por helper local de UM nível) — ou `null` quando não há nenhuma.
 *
 * Só considera `export async function`: é a única forma que o transform de
 * Server Actions registra como endpoint (`use-server-exports.ts` é quem impede
 * as outras de existirem num módulo desses).
 */
export function guardasDosExports(fonte: string): ExportDeAction[] {
  const limpo = limpar(fonte, true)
  const decls = declaracoesDeTopo(limpo)

  // Os helpers LOCAIS que carregam guarda direta. Chave = nome; só entram os NÃO
  // exportados... e também os exportados, porque um export pode legitimamente
  // servir de helper para outro no mesmo módulo. O que define "local" é estar
  // DECLARADO NESTE ARQUIVO — é isso que impede um homônimo importado de contar.
  const helpersComGuarda = new Map<string, NomeDeGuarda>()
  for (const d of decls) {
    const g = guardaChamadaEm(d.corpo)
    if (g) helpersComGuarda.set(d.nome, g)
  }

  const saida: ExportDeAction[] = []
  for (const d of decls) {
    if (!d.exportada) continue
    // Só `export async function` é endpoint. Um `export const` num módulo
    // 'use server' já é recusado por `use-server-exports.ts`; aqui ele só não
    // é cobrado como action.
    if (!new RegExp(`^export\\s+async\\s+function\\s+${d.nome}\\b`).test(d.corpo)) {
      continue
    }

    const direta = guardaChamadaEm(d.corpo)
    if (direta) {
      saida.push({ nome: d.nome, linha: d.linha, guarda: direta, via: 'direta' })
      continue
    }

    // UM nível de indireta: um helper local, declarado neste arquivo, cujo corpo
    // chama uma guarda DIRETAMENTE. Se o helper só chama OUTRO helper, ele não
    // está em `helpersComGuarda` e o export cai como sem guarda — que é a recusa
    // da cadeia de dois níveis.
    let achou: ExportDeAction | null = null
    for (const [nomeHelper, g] of helpersComGuarda) {
      if (nomeHelper === d.nome) continue
      if (new RegExp(`\\b${nomeHelper}\\s*\\(`).test(d.corpo)) {
        achou = { nome: d.nome, linha: d.linha, guarda: g, via: 'indireta', helper: nomeHelper }
        break
      }
    }
    saida.push(achou ?? { nome: d.nome, linha: d.linha, guarda: null, via: null })
  }
  return saida
}

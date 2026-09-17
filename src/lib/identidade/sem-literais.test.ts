import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { identidadeDoSistema } from '@/lib/identidade/sistema'
import { semComentarios } from '@/lib/layout/texto-fonte'
import { literaisDoCodigo } from '@/lib/varredura/literais'

// A TRAVA DOS PONTOS DE INJEÇÃO (F61 · decisão iii).
//
// Quem lê a identidade da fonte única não pode, ao mesmo tempo, escrever a sigla,
// o nome do sistema ou o autor como TEXTO. Se escrevesse, a F70 trocaria a fonte e
// a tela continuaria dizendo o valor velho — em silêncio, porque nada quebra.
//
// O QUE ELA VARRE: só LITERAIS, pela mesma varredura por AST da `sem-wapismo`
// (`src/lib/varredura/literais.ts`) — nunca comentário, nunca identificador.
//
// ONDE: a lista NOMINAL `LEEM_A_FONTE`, com CATRACA: todo arquivo de `src/` que
// importa `@/lib/identidade/sistema` tem de estar nela (a lista cresce sozinha,
// pela reprovação), e todo arquivo dela tem de importar a fonte (sem entrada
// morta). NÃO é uma varredura de `src/**`: as FRASES DA EMPRESA ("É operador da
// WAP?", o exemplo de e-mail do login, "posse WAP"…) ficam onde estão até a F70
// (decisão iii) e estão no censo do `docs/PLAN-F61.md` §5.2.
//
// O QUE É PROIBIDO nesses arquivos:
//   · a sigla `WAP` como PALAVRA MAIÚSCULA — o placeholder `voce@wap.ind.br` do
//     login é frase da empresa, em minúsculas, e fica (decisão iii);
//   · `Estoque TI`, em qualquer caixa;
//   · o autor e o site dele.

const RAIZ = process.cwd()
const FONTE = '@/lib/identidade/sistema'

/** Os arquivos que leem a identidade da fonte única. Só CRESCE. */
const LEEM_A_FONTE: readonly string[] = [
  'src/app/(app)/ajuda/page.tsx',
  'src/app/(app)/versoes/page.tsx',
  'src/app/auth/confirm/page.tsx',
  'src/app/layout.tsx',
  'src/app/login/page.tsx',
  'src/app/not-found.tsx',
  'src/components/layout/credito-autor.tsx',
  'src/components/layout/marca.tsx',
  'src/components/layout/rodape-sidebar.tsx',
  'src/components/layout/viewer-header.tsx',
]

const PROIBIDOS: readonly { nome: string; padrao: RegExp }[] = [
  { nome: 'a sigla', padrao: /\bWAP\b/ },
  { nome: 'o nome do sistema', padrao: /estoque\s+ti\b/i },
  { nome: 'o autor', padrao: /vmatusita/i },
]

function fontesDeSrc(): { arquivo: string; texto: string }[] {
  const achadas: { arquivo: string; texto: string }[] = []
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        visitar(caminho)
        continue
      }
      if (!/\.(ts|tsx)$/.test(nome) || /\.test\.(ts|tsx)$/.test(nome)) continue
      achadas.push({
        arquivo: relative(RAIZ, caminho).split(sep).join('/'),
        texto: readFileSync(caminho, 'utf8'),
      })
    }
  }
  visitar(join(RAIZ, 'src'))
  return achadas
}

/** Os literais proibidos de um código — a função que a sabotagem também chama. */
function literaisProibidos(arquivo: string, codigo: string): string[] {
  const achados: string[] = []
  for (const { linha, texto } of literaisDoCodigo(arquivo, codigo)) {
    for (const { nome, padrao } of PROIBIDOS) {
      if (padrao.test(texto)) achados.push(`${arquivo}:${linha} escreve ${nome}: ${JSON.stringify(texto)}`)
    }
  }
  return achados
}

const importaAFonte = (texto: string) =>
  new RegExp(`from\\s+['"]${FONTE.replace(/[/.]/g, '\\$&')}['"]`).test(texto)

describe('a fonte unica devolve os textos de hoje (F61)', () => {
  it('a sigla, o nome, a grafia unica, a descricao e o credito', () => {
    expect(identidadeDoSistema()).toEqual({
      sigla: 'WAP',
      nome: 'Estoque TI',
      nomeCompleto: 'Estoque TI WAP',
      descricao: 'Controle de ativos de TI da WAP',
      credito: { autor: 'vmatusita', site: 'https://www.vmatusita.com.br' },
    })
  })

  it('a fonte e pura: sem diretiva, sem server-only, sem ambiente, sem banco', () => {
    // Sem os comentários: o cabeçalho do módulo EXPLICA por que não há server-only.
    const texto = semComentarios(readFileSync(join(RAIZ, 'src/lib/identidade/sistema.ts'), 'utf8'))
    expect(texto).not.toMatch(/^['"]use (client|server)['"]/m)
    expect(texto).not.toMatch(/server-only/)
    expect(texto).not.toMatch(/process\.env/)
    expect(texto).not.toMatch(/supabase|@\/lib\/queries/)
    expect(texto).not.toMatch(/\bimport\b/)
  })
})

describe('quem le a fonte nao escreve a identidade como texto (F61)', () => {
  const fontes = fontesDeSrc()

  it('a lista LEEM_A_FONTE e exatamente quem importa a fonte (sem entrada morta, sem ausente)', () => {
    const importam = fontes
      .filter((f) => f.arquivo !== 'src/lib/identidade/sistema.ts' && importaAFonte(f.texto))
      .map((f) => f.arquivo)
      .sort()
    expect(importam, 'um arquivo passou a ler a fonte e nao entrou em LEEM_A_FONTE').toEqual(
      [...LEEM_A_FONTE].sort(),
    )
  })

  it.each(LEEM_A_FONTE)('%s nao tem literal da sigla, do nome ou do autor', (arquivo) => {
    const texto = readFileSync(join(RAIZ, arquivo), 'utf8')
    expect(literaisProibidos(arquivo, texto)).toEqual([])
  })

  // SABOTAGEM C, guardada como teste: o mesmo arquivo de verdade, com um literal
  // injetado EM MEMÓRIA, reprova; o mesmo texto em comentário e em identificador
  // passa. Nada é escrito em disco.
  describe('a varredura so enxerga literal', () => {
    const alvo = 'src/components/layout/marca.tsx'
    const original = () => readFileSync(join(RAIZ, alvo), 'utf8')

    it.each([
      ['a sigla', `\nexport const SABOTAGEM = 'WAP'\n`],
      ['o nome do sistema', `\nexport const SABOTAGEM = <span>Estoque TI</span>\n`],
      ['o autor', '\nexport const SABOTAGEM = `feito por vmatusita`\n'],
    ])('%s injetado como literal reprova', (_nome, injecao) => {
      expect(literaisProibidos(alvo, original() + injecao).length).toBe(1)
    })

    it.each([
      ['comentário de linha', `\n// WAP · Estoque TI · vmatusita\n`],
      ['comentário de bloco', `\n/* WAP Estoque TI vmatusita */\n`],
      ['identificador', `\nconst WAP = 1\nconst vmatusita = WAP\nexport { vmatusita }\n`],
    ])('%s passa', (_nome, injecao) => {
      expect(literaisProibidos(alvo, original() + injecao)).toEqual([])
    })
  })
})

import { describe, expect, it, vi } from 'vitest'

// F49 — o módulo sob teste declara `import 'server-only'`, que é a fronteira RSC: ele
// existe para QUEBRAR o build se um Client Component o importar. No ambiente `node` do
// Vitest esse import lança sempre, então o stub vazio. Não afrouxa nada — quem prova a
// fronteira é o `npm run build`. Mesmo padrão de `queries/itens.test.ts`.
vi.mock('server-only', () => ({}))

import {
  avisoDaLimpeza,
  copiarEntaoRemoverTermos,
  prefixoDasCopias,
  raizDoAtivo,
  raizDoBackupEmArquivo,
  raizDoConflito,
} from '@/lib/storage/copiar-antes-de-remover'

// =============================================================================
// O COMPORTAMENTO da porta única — F54. É AQUI que "se a cópia falhar, não remove"
// deixa de ser comentário e vira asserção.
// =============================================================================
// A trava irmã (`actions/backup-completude.test.ts`) lê o FONTE e responde "o
// repositório continua descrevendo uma porta só, que remove só o que confirmou?".
// Ela não sabe executar o programa. Quem responde por "a cópia falhou, então aquele
// arquivo NÃO foi removido" é esta suíte, e o caminho da FALHA é o que ela existe para
// cobrir — o caminho feliz sozinho provaria a metade que nunca dá problema.
//
// O client é um dublê de teste, não um mock de biblioteca: ele registra o que foi
// pedido e devolve o que o teste mandar. Nenhum dado real, nenhum `.docx` real
// (regra 2 do CLAUDE.md) — os nomes são uuids fictícios.
// =============================================================================

type Chamada = { de: string; para: string }

/**
 * Um Storage de mentira, com o contrato REAL do storage-js medido na versão instalada:
 * `copy` e `remove` DEVOLVEM `{data, error}` — não lançam. Um dublê que lançasse
 * provaria um contrato que a biblioteca não tem.
 */
function storageFalso(opts: {
  falhamAoCopiar?: string[]
  naoSaemNoRemove?: string[]
  copiaLanca?: string[]
}) {
  const copias: Chamada[] = []
  const removidos: string[] = []
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async copy(de: string, para: string, o?: { destinationBucket?: string }) {
            if (opts.copiaLanca?.includes(de)) throw new Error('rede caiu')
            if (opts.falhamAoCopiar?.includes(de)) {
              return { data: null, error: { message: 'sem permissão' } }
            }
            copias.push({ de: `${bucket}/${de}`, para: `${o?.destinationBucket}/${para}` })
            return { data: { path: para }, error: null }
          },
          async remove(alvos: string[]) {
            const saem = alvos.filter((a) => !opts.naoSaemNoRemove?.includes(a))
            removidos.push(...saem)
            // A API responde 200 com a lista do que REALMENTE saiu.
            return { data: saem.map((name) => ({ name })), error: null }
          },
        }
      },
    },
  }
  return { client: client as never, copias, removidos }
}

const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.docx'
const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.docx'
const C = 'cccccccc-3333-4333-8333-cccccccccccc.docx'
const PREFIXO = 'reset/acervo/filial-9/2026-09-09T12-00-00-000Z/termos/'

describe('1. o caminho feliz', () => {
  it('copia todos e remove todos', async () => {
    const { client, copias, removidos } = storageFalso({})
    const r = await copiarEntaoRemoverTermos(client, { prefixoDestino: PREFIXO, caminhos: [A, B] })

    expect(copias).toEqual([
      { de: `termos/${A}`, para: `backups-import/${PREFIXO}${A}` },
      { de: `termos/${B}`, para: `backups-import/${PREFIXO}${B}` },
    ])
    expect(removidos).toEqual([A, B])
    expect(r.removidos).toEqual([A, B])
    expect(r.naoCopiados).toEqual([])
    expect(r.naoRemovidos).toEqual([])
  })

  it('lista vazia não chama nada', async () => {
    const { client, copias, removidos } = storageFalso({})
    const r = await copiarEntaoRemoverTermos(client, { prefixoDestino: PREFIXO, caminhos: [] })
    expect(copias).toEqual([])
    expect(removidos).toEqual([])
    expect(r.removidos).toEqual([])
  })
})

describe('2. O CAMINHO DA FALHA — o que a fase existe para garantir', () => {
  it('cópia que falha ⇒ o arquivo NÃO é removido', async () => {
    // A asserção central da F54. Se esta virar verde por engano, um documento assinado
    // por uma pessoa some sem cópia.
    const { client, removidos } = storageFalso({ falhamAoCopiar: [B] })
    const r = await copiarEntaoRemoverTermos(client, { prefixoDestino: PREFIXO, caminhos: [A, B, C] })

    expect(removidos, 'o .docx sem cópia foi removido mesmo assim').not.toContain(B)
    expect(removidos).toEqual([A, C])
    expect(r.naoCopiados).toEqual([B])
    expect(r.removidos).toEqual([A, C])
  })

  it('cópia que LANÇA (e não devolve erro) também impede a remoção', async () => {
    // O `copy` da lib devolve `{error}`, mas a rede pode derrubar o fetch antes disso.
    // Conferir só o retorno deixaria este caso apagar o arquivo.
    const { client, removidos } = storageFalso({ copiaLanca: [A] })
    const r = await copiarEntaoRemoverTermos(client, { prefixoDestino: PREFIXO, caminhos: [A, B] })

    expect(removidos).toEqual([B])
    expect(r.naoCopiados).toEqual([A])
  })

  it('TODAS as cópias falham ⇒ NADA é removido', async () => {
    const { client, removidos } = storageFalso({ falhamAoCopiar: [A, B] })
    const r = await copiarEntaoRemoverTermos(client, { prefixoDestino: PREFIXO, caminhos: [A, B] })
    expect(removidos).toEqual([])
    expect(r.removidos).toEqual([])
    expect(r.naoCopiados).toEqual([A, B])
  })

  it('remoção PARCIAL é detectada pelo `data`, não pelo `error`', async () => {
    // A API responde 200 com a lista do que saiu. Sem conferir o `data`, um reset que
    // removesse metade reportaria sucesso limpo — o motivo herdado dos gêmeos.
    const { client } = storageFalso({ naoSaemNoRemove: [B] })
    const r = await copiarEntaoRemoverTermos(client, { prefixoDestino: PREFIXO, caminhos: [A, B] })
    expect(r.removidos).toEqual([A])
    expect(r.naoRemovidos).toEqual([B])
    expect(r.naoCopiados).toEqual([])
  })
})

describe('3. o aviso conta a verdade para quem opera', () => {
  it('tudo certo ⇒ sem aviso', () => {
    expect(
      avisoDaLimpeza(
        { removidos: [A], naoCopiados: [], naoRemovidos: [], prefixoDestino: PREFIXO },
        1,
      ),
    ).toBeNull()
  })

  it('não copiado ⇒ o aviso diz que o documento CONTINUA lá', () => {
    const msg = avisoDaLimpeza(
      { removidos: [A], naoCopiados: [B], naoRemovidos: [], prefixoDestino: PREFIXO },
      2,
    )
    expect(msg).toContain('1 de 2')
    expect(msg).toContain('continuam lá')
    expect(msg).toContain('arquivo de termo órfão')
  })

  it('os dois desfechos aparecem separados, porque são fatos diferentes', () => {
    const msg = avisoDaLimpeza(
      { removidos: [], naoCopiados: [A], naoRemovidos: [B], prefixoDestino: PREFIXO },
      2,
    )
    expect(msg).toContain('não puderam ser copiados')
    expect(msg).toContain('não saíram do armazenamento')
  })
})

describe('4. a convenção de caminho — o espelho do que a 12ª checagem recalcula em SQL', () => {
  it('backup em arquivo: o JSON sem a extensão', () => {
    expect(raizDoBackupEmArquivo('import/filial-3/2026-09-09T14-05-33-102Z.json')).toBe(
      'import/filial-3/2026-09-09T14-05-33-102Z',
    )
    expect(raizDoBackupEmArquivo('reset/acervo/global/2026-09-09T14-05-33-102Z.json')).toBe(
      'reset/acervo/global/2026-09-09T14-05-33-102Z',
    )
  })

  it('só a extensão FINAL sai (um `.json` no meio do nome não é tocado)', () => {
    expect(raizDoBackupEmArquivo('import/filial-3/a.json.b.json')).toBe('import/filial-3/a.json.b')
  })

  it('ativo e conflito: as âncoras dos dois casos SEM backup em arquivo', () => {
    expect(raizDoAtivo('a3d9f001-2222-4444-8888-999900001111')).toBe(
      'ativo/a3d9f001-2222-4444-8888-999900001111',
    )
    expect(raizDoConflito('5e884898da28047151d0e56f8dc62920')).toBe(
      'conflito/5e884898da28047151d0e56f8dc62920',
    )
  })

  it('o prefixo termina em barra — senão a cópia vira irmã, não filha', () => {
    // `${raiz}termos/` sem a barra produziria `…102Ztermos/`, um nome legal no Storage e
    // ilegível para qualquer humano — e que a checagem 12 não reconheceria.
    expect(prefixoDasCopias('import/filial-3/2026-09-09T14-05-33-102Z')).toBe(
      'import/filial-3/2026-09-09T14-05-33-102Z/termos/',
    )
    expect(prefixoDasCopias(raizDoAtivo('x'))).toMatch(/\/termos\/$/)
  })
})

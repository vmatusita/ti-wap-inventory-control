import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  compararConjuntos,
  conjuntosDoArquivoDeTipos,
  mensagemDeDeriva,
} from './tipos-conjuntos.mjs'

// A TRAVA DO GATE DE DERIVA — F47, roda sem banco.
//
// O que se prova aqui é o PARSER e a DIREÇÃO da comparação. As duas coisas que fazem um
// gate deste tipo morrer:
//   · parser que perde nomes → o gate acusa deriva que não existe, e na terceira vez
//     alguém o desliga;
//   · direção invertida → o gate reprova o repositório por ter MAIS do que o banco, que
//     é legítimo por três motivos registrados.

const RAIZ = process.cwd()

/** Uma fixture mínima, no formato REAL do gerador (inclusive a entrada de uma linha só). */
const FIXTURE = `
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ativos: {
        Row: {
          id: string
          patrimonio: string | null
          filial_id: number
        }
        Insert: {
          id?: string
          patrimonio?: string | null
          filial_id: number
        }
        Update: {
          id?: string
          patrimonio?: string | null
          filial_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ativos_filial_id_fkey"
            columns: ["filial_id"]
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
      filiais: {
        Row: { id: number; nome: string }
        Insert: { id?: number; nome: string }
        Update: { id?: number; nome?: string }
        Relationships: []
      }
    }
    Views: {
      v_estoque_atual: {
        Row: {
          item_id: number | null
          saldo: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      papel_atual: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["papel_usuario"]
      }
      apagar_usuario: { Args: { p_alvo: string }; Returns: undefined }
      pode_escrever_filial: {
        Args: { fid: number }
        Returns: boolean
      }
    }
    Enums: {
      papel_usuario: "dev" | "admin" | "operador" | "consulta"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
`

describe('1. o parser lê a forma REAL do gerador', () => {
  const c = conjuntosDoArquivoDeTipos(FIXTURE)

  it('junta Tables e Views num conjunto só de relações', () => {
    expect([...c.relacoes].sort()).toEqual(['ativos', 'filiais', 'v_estoque_atual'])
  })

  it('lê as colunas como `relacao.coluna`, de Row, Insert e Update', () => {
    expect(c.colunas.has('ativos.patrimonio')).toBe(true)
    expect(c.colunas.has('filiais.nome')).toBe(true)
    expect(c.colunas.has('v_estoque_atual.saldo')).toBe(true)
  })

  it('NÃO confunde `Relationships` com coluna', () => {
    // `Relationships` é irmão de `Row` dentro da entrada da tabela; lê-lo como coluna
    // faria o gate carregar um nome que banco nenhum tem.
    expect(c.colunas.has('ativos.Relationships')).toBe(false)
    expect([...c.colunas].some((x) => x.includes('foreignKeyName'))).toBe(false)
  })

  it('lê função escrita em UMA LINHA só — o caso que a regex de linha perde', () => {
    // Medido no arquivo real: uma extração por regex de bloco devolve 54 das 59 funções,
    // porque o gerador emite algumas numa linha (`apagar_usuario: { Args: …; Returns: … }`).
    // Perder nomes do lado do REPOSITÓRIO faria o gate acusar deriva inexistente.
    expect(c.funcoes.has('apagar_usuario')).toBe(true)
    expect([...c.funcoes].sort()).toEqual(['apagar_usuario', 'papel_atual', 'pode_escrever_filial'])
  })

  it('NÃO carrega Enums nem CompositeTypes para os conjuntos comparados', () => {
    expect(c.relacoes.has('papel_usuario')).toBe(false)
    expect(c.funcoes.has('papel_usuario')).toBe(false)
  })

  it('reprova ALTO se o formato do arquivo mudar (em vez de devolver vazio)', () => {
    // Conjunto vazio do lado do repositório reprovaria TUDO, e o log leria como
    // "o database.ts está velho" quando o defeito é o parser.
    expect(() => conjuntosDoArquivoDeTipos('export const nada = 1')).toThrow(/formato do gerador/)
    expect(() => conjuntosDoArquivoDeTipos('export type Database = { outro: {} }')).toThrow(
      /esquema `public`/,
    )
  })
})

describe('2. a comparação só reprova numa direção', () => {
  const vazio = () => ({ relacoes: new Set<string>(), colunas: new Set<string>(), funcoes: new Set<string>() })

  it('VERDE quando os dois lados são iguais', () => {
    const a = { relacoes: new Set(['t']), colunas: new Set(['t.c']), funcoes: new Set(['f']) }
    expect(compararConjuntos(a, a).derivou).toBe(false)
  })

  it('VERMELHO quando o BANCO tem tabela que o arquivo não tem', () => {
    const banco = { ...vazio(), relacoes: new Set(['ativos', 'nova']) }
    const repo = { ...vazio(), relacoes: new Set(['ativos']) }
    const d = compararConjuntos(banco, repo)
    expect(d.derivou).toBe(true)
    expect(d.relacoes).toEqual(['nova'])
  })

  it('VERMELHO quando o BANCO tem coluna que o arquivo não tem — e a NOMEIA', () => {
    const banco = {
      relacoes: new Set(['ativos']),
      colunas: new Set(['ativos.id', 'ativos.empresa_id']),
      funcoes: new Set<string>(),
    }
    const repo = { relacoes: new Set(['ativos']), colunas: new Set(['ativos.id']), funcoes: new Set<string>() }
    const d = compararConjuntos(banco, repo)
    expect(d.colunas).toEqual(['ativos.empresa_id'])
    expect(mensagemDeDeriva(d)).toContain('ativos.empresa_id')
    expect(mensagemDeDeriva(d)).toContain('npm run db:types')
  })

  it('VERMELHO quando o BANCO tem função que o arquivo não tem', () => {
    const banco = { ...vazio(), funcoes: new Set(['papel_atual', 'empresa_atual']) }
    const repo = { ...vazio(), funcoes: new Set(['papel_atual']) }
    expect(compararConjuntos(banco, repo).funcoes).toEqual(['empresa_atual'])
  })

  it('VERDE quando o REPOSITÓRIO tem MAIS — a assimetria deliberada', () => {
    // Os três motivos: PostgrestVersion vem do servidor; o arquivo tem hand-fixes
    // deliberados; e ele é gerado de PRODUÇÃO, que tem objeto que nenhuma migration cria.
    const banco = { ...vazio(), relacoes: new Set(['ativos']), funcoes: new Set(['papel_atual']) }
    const repo = {
      relacoes: new Set(['ativos', '_bkp_relatorios_gerados_f6a']),
      colunas: new Set(['_bkp_relatorios_gerados_f6a.id']),
      funcoes: new Set(['papel_atual', 'so_em_producao']),
    }
    expect(compararConjuntos(banco, repo).derivou).toBe(false)
  })

  it('tabela NOVA não repete cada coluna dela na lista de colunas', () => {
    // Uma tabela nova de 20 colunas viraria 21 linhas dizendo a mesma coisa, e o achado
    // que importa (a tabela) se perderia no meio.
    const banco = {
      relacoes: new Set(['nova']),
      colunas: new Set(['nova.a', 'nova.b', 'nova.c']),
      funcoes: new Set<string>(),
    }
    const d = compararConjuntos(banco, vazio())
    expect(d.relacoes).toEqual(['nova'])
    expect(d.colunas).toEqual([])
  })

  it('as listas saem ordenadas (o log tem de ser estável entre execuções)', () => {
    const banco = { ...vazio(), funcoes: new Set(['zeta', 'alfa', 'meio']) }
    expect(compararConjuntos(banco, vazio()).funcoes).toEqual(['alfa', 'meio', 'zeta'])
  })
})

describe('3. contra o `database.ts` REAL do repositório', () => {
  const real = conjuntosDoArquivoDeTipos(
    readFileSync(join(RAIZ, 'src', 'lib', 'types', 'database.ts'), 'utf8'),
  )

  it('lê as 34 relações (25 tabelas + 9 views) e as 82 funções', () => {
    // ⚠ 08/09/2026 (F51): as funções passaram de 60 para 68 — as OITO auxiliares do
    // import que a migration 0131 cria. Elas entraram no `database.ts` À MÃO, e não
    // pelo gerador: `npm run db:types` lê um projeto REAL pela Management API, e a
    // 0131 ainda não foi aplicada (o apply dela é caminho B do RUNBOOK-BANCO, porque
    // o classificador do modo automático bloqueia DDL com `delete from
    // public.ativos`). Sem as entradas, o gate de deriva reprovaria o
    // `banco-sem-docker` assim que o Postgres do CI aplicasse a 0131 — e afrouxar o
    // gate para passar não era opção. O comentário datado está no próprio
    // `database.ts`, e a primeira regeneração após o apply reescreve tudo sozinha.
    //
    // ⚠ 08/09/2026 (F50): as funções passaram de 59 para 60. A migration 0129 criou
    // `pode_ler_arquivo_termo` e o `npm run db:types` de produção a trouxe para o
    // arquivo. O número SUBIU porque o banco ganhou uma função — que é exatamente o
    // caso em que ele deve subir, e a conversa que este teste existe para forçar.
    //
    // ⚠ 08/09/2026 (F52): as funções passaram de 68 para 71. A migration 0132 criou
    // `mesmo_escopo_de_gestao`, `exigir_ativos_da_empresa` e `prefixo_backup_import`, e o
    // `database.ts` as ganhou por HAND-FIX datado — não por `npm run db:types`, porque a
    // 0132 ainda não foi aplicada (ela é caminho B e depende da 0131, também pendente).
    // `existe_outro_admin_ativo` também mudou de assinatura, mas o nome é o mesmo e o
    // conjunto conta NOMES, então ela não move este número. O número SUBIU porque o banco
    // ganhou funções — o caso em que ele deve subir.
    //
    // Números MEDIDOS em 06/09/2026 no arquivo real. Relações e funções são EXATOS de
    // propósito: elas mudam raramente, e quando mudarem é porque alguém rodou
    // `npm run db:types` — que é justamente o momento de reler este teste. As colunas
    // vão por PISO, porque crescem a cada `add column` e um número exato viraria ruído.
    //
    // Se qualquer um dos três CAIR sem que uma migration tenha removido nada, quem
    // regrediu foi o parser — e um parser que perde nomes do lado do repositório faz o
    // gate acusar deriva que não existe.
    // F55 (10/09/2026): 71 -> 74. A `0138` acrescentou TRES funcoes —
    // `checagens_integridade_nucleo`, `checagens_integridade_resumo` e
    // `rotulo_de_ambiente` — e o `database.ts` foi regenerado DE PRODUCAO depois do
    // apply. E o caso em que este numero deve subir, e o momento de reler o teste e
    // exatamente este.
    //
    // F56 · Frente D (11/09/2026): relações 30 -> 34, funções 74 -> 75. A `0139`
    // (vocabulário do import) cria QUATRO tabelas (`unidades_apelidos`,
    // `import_termos_categoria`, `import_termos_estado`,
    // `import_prefixos_patrimonio`) e UMA função IMMUTABLE nova
    // (`vocabulario_chave`) — o `database.ts` as ganhou por HAND-FIX datado (a
    // `0139` ainda não foi aplicada em nenhum banco real; `npm run db:types`
    // substitui o hand-fix depois do apply). `vocabulario_unidades_guarda` NÃO
    // entra nesta contagem — é função-gatilho (`returns trigger`), a mesma regra
    // que já exclui `aplicar_movimentacao`/`guarda_acervo` logo abaixo.
    //
    // F60 · Frente B (16/09/2026): funções 75 -> 76. A `0141` cria
    // `rel_contagem_status_filiais` (os KPIs do dashboard numa contagem agregada) e o
    // `database.ts` a ganhou por HAND-FIX datado — a `0141` ainda não foi aplicada em banco
    // real, e o gate de deriva do CI constrói a cadeia inteira; a regeneração do ensaio
    // depois do apply substitui a entrada. O número SUBIU porque o banco ganhou uma função.
    //
    // F60 · Frente D · lote 2 (16/09/2026): funções 76 -> 76, e NÃO é que nada mudou. A `0143`
    // cria as sete `rel_*_filiais` e a `0145` derruba as sete `rel_*` velhas: sete nomes saem,
    // sete entram — o `database.ts` o faz por HAND-FIX datado (as duas ainda não foram
    // aplicadas em banco real). O número exato continua sendo a trava certa: um hand-fix que
    // só acrescentasse as novas (sem tirar as velhas) daria 83 e o teste acusaria; e o gate de
    // deriva, que só reprova o que o BANCO tem a mais, não pegaria as velhas sobrando no arquivo.
    //
    // Reauditoria de 18/09/2026, passo 2 (v1.66.3): funções 76 -> 82. A `0148` cria
    // `ledger_de_migracoes` (a leitura do ledger da sonda de deriva, item AE) e a `0149` cria as
    // cinco escritas atômicas "ativos + anotação" (item U). A `0147` só derruba um índice, que não
    // aparece no `database.ts`. Relações não mudam.
    expect(real.relacoes.size).toBe(34)
    expect(real.funcoes.size).toBe(82)
    expect(real.colunas.size).toBeGreaterThanOrEqual(299)
  })

  it('conhece objetos-âncora do schema', () => {
    expect(real.relacoes.has('ativos')).toBe(true)
    expect(real.relacoes.has('v_estoque_atual')).toBe(true)
    expect(real.colunas.has('ativos.filial_id')).toBe(true)
    expect(real.funcoes.has('pode_escrever_filial')).toBe(true)
  })

  it('NÃO lista função-gatilho — a regra de inclusão mais arriscada de errar', () => {
    // O gerador exclui função que retorna `trigger`. Se o gate incluísse essas cinco no
    // lado do BANCO, ele nasceria vermelho por motivo legítimo — e morreria.
    for (const gatilho of [
      'aplicar_movimentacao',
      'guarda_acervo',
      'handle_new_user',
      'profiles_guarda_dev',
      'valida_lancamento_item',
    ]) {
      expect(real.funcoes.has(gatilho), `${gatilho} não deveria estar em Functions`).toBe(false)
    }
  })

  it('conhece a tabela que a migration 0128 adota', () => {
    // Ela existia SÓ em produção; o `database.ts` a carrega porque é gerado de lá. É o
    // motivo de a 0128 vir ANTES de o gate ser ligado.
    expect(real.relacoes.has('_bkp_relatorios_gerados_f6a')).toBe(true)
  })
})

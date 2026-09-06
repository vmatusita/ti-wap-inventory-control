import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARQUIVO_LOCK,
  DIR_MIGRACOES,
  conferirLock,
  hashDoConteudo,
  hashesDoDisco,
  lerLock,
  normalizarConteudo,
  serializarLock,
} from './migrations-lock'

// A TRAVA DE HASH DAS MIGRATIONS (F46, 06/09/2026).
//
// ⚠ O QUE ESTE ARQUIVO IMPEDE, E QUE ATÉ AQUI NADA IMPEDIA. "Migration aplicada nunca se
// edita" está escrito no `CLAUDE.md`, no `docs/RUNBOOK-BANCO.md` e na regra 8 do §4 do
// `docs/PLANO-MULTIEMPRESA.md` — e era só isso, texto. Um byte alterado na `0031` passava por
// `lint`, `test`, `build` e pelo job `banco` VERDE, porque aquele job aplica a cadeia num banco
// NOVO: ele prova que as 126 aplicam limpo, nunca que são as mesmas de ontem. Numa fila de
// vinte migrations como a da virada multiempresa, esse é o erro mais caro que existe.
//
// ⚠ ESTA TRAVA NASCE VERDE — é varredura de catálogo (regra 4 do §4 do plano), então ela não
// pôde nascer vermelha como a doutrina prefere. A compensação é dupla:
//   (1) os testes de UNIDADE abaixo exercitam as três formas de reprovar com dados sintéticos,
//       sem depender do disco — é onde se prova que ela SABE ficar vermelha;
//   (2) as três sabotagens reais, com a saída colada, estão em `docs/RELATORIO-F46.md`.
// Uma trava que só se sabe verde é sensação de rede, não rede — a lição de `_asserts.sql`
// (F45) e da recusa de universo vazio no runner.
//
// ⚠ POR QUE MIGRATION NOVA TAMBÉM REPROVA (decisão da F46, ata em `docs/DECISOES.md`). A ficha
// diz "arquivo novo é aceito e o executor regrava o lock no mesmo commit", e a ordem delegou o
// comportamento a quem executa. Escolhi REPROVAR, com a mensagem dizendo a linha a rodar, por
// dois motivos: sem isso o critério "uma entrada por arquivo" valeria só no dia da entrega e
// apodreceria em silêncio a cada migration nova; e "o executor regrava no mesmo commit"
// dependeria de alguém LEMBRAR — que é exatamente o que a regra 8 do `CLAUDE.md` diz que uma
// regra não pode fazer ("A regra não depende de ninguém lembrar dela"). Reprovar não bloqueia
// o fluxo normal: a resposta é `npm run db:lock`, uma linha, no mesmo commit.
//
// As três classes têm mensagens DIFERENTES de propósito — ver o comentário de `conferirLock`.

const RAIZ = process.cwd()

describe('trava de hash das migrations — o estado do repositório', () => {
  it('o lock cobre EXATAMENTE os arquivos de supabase/migrations/, sem sobra nem falta', () => {
    const lock = lerLock(RAIZ)
    const noDisco = hashesDoDisco(RAIZ)
    const problemas = conferirLock(lock.migrations, noDisco)

    // A mensagem de falha é a saída inteira, uma por linha: quem lê o CI tem de saber QUAL
    // arquivo e O QUE fazer sem abrir mais nada.
    expect(
      problemas.map((p) => `[${p.tipo}] ${p.mensagem}`).join('\n'),
      `\n${problemas.length} problema(s) na trava de hash das migrations:\n` +
        problemas.map((p) => `  • ${p.mensagem}`).join('\n') +
        '\n',
    ).toBe('')
  })

  it('toda migration do disco está travada, e nada mais está', () => {
    const lock = lerLock(RAIZ)
    const noDisco = readdirSync(join(RAIZ, ...DIR_MIGRACOES))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    expect(Object.keys(lock.migrations).sort()).toEqual(noDisco)
  })

  it('o lock no disco é byte a byte o que `npm run db:lock` gravaria', () => {
    // Guarda contra edição à mão do lock: formatação, ordem das chaves e cabeçalho. Um lock
    // editado à mão é um lock em que ninguém confia — e a única forma legítima de mexer nele
    // é o script.
    const atual = lerLock(RAIZ)
    expect(serializarLock(atual.migrations)).toBe(
      serializarLock(hashesDoDisco(RAIZ)),
    )
    expect(atual.algoritmo).toBe('sha256')
  })
})

describe('trava de hash das migrations — a prova de que ela sabe reprovar', () => {
  // Dados sintéticos: estes casos não tocam o disco. É aqui que se prova o comportamento das
  // três classes sem precisar sabotar o repositório de verdade.
  const TRAVADOS = {
    '0001_profiles.sql': 'aaaa',
    '0002_tipos.sql': 'bbbb',
  }

  it('nada mudou → nenhum problema', () => {
    expect(conferirLock(TRAVADOS, { ...TRAVADOS })).toEqual([])
  })

  it('um byte alterado numa migration travada → reprova NOMEANDO o arquivo', () => {
    const problemas = conferirLock(TRAVADOS, { ...TRAVADOS, '0002_tipos.sql': 'cccc' })

    expect(problemas).toHaveLength(1)
    expect(problemas[0].tipo).toBe('alterada')
    expect(problemas[0].arquivo).toBe('0002_tipos.sql')
    expect(problemas[0].mensagem).toContain('supabase/migrations/0002_tipos.sql')
    expect(problemas[0].mensagem).toContain('MUDOU depois de travada')
    // A saída para o caso "alterada" NÃO pode ensinar a regravar o lock — seria mandar apagar
    // a prova. Esta asserção existe para que ninguém "melhore" a mensagem nesse sentido.
    expect(problemas[0].mensagem).not.toContain('npm run db:lock')
    expect(problemas[0].mensagem).toContain('migration NOVA')
  })

  it('migration travada apagada ou renomeada → reprova NOMEANDO o arquivo', () => {
    // Renomear é este mesmo caso visto do lado do lock: o nome antigo some. Quando é renomeio
    // (e não exclusão), o nome NOVO aparece junto, como "nova" — os dois problemas juntos são
    // a assinatura do renomeio.
    const renomeada = { '0001_profiles.sql': 'aaaa', '0002_tipos_novo_nome.sql': 'bbbb' }
    const problemas = conferirLock(TRAVADOS, renomeada)

    expect(problemas.map((p) => p.tipo).sort()).toEqual(['nova', 'sumiu'])
    const sumiu = problemas.find((p) => p.tipo === 'sumiu')!
    expect(sumiu.arquivo).toBe('0002_tipos.sql')
    expect(sumiu.mensagem).toContain('não existe mais no disco')
    expect(problemas.find((p) => p.tipo === 'nova')!.arquivo).toBe('0002_tipos_novo_nome.sql')
  })

  it('migration nova ainda não travada → reprova, e a mensagem dá a linha a rodar', () => {
    const problemas = conferirLock(TRAVADOS, { ...TRAVADOS, '0128_nova.sql': 'dddd' })

    expect(problemas).toHaveLength(1)
    expect(problemas[0].tipo).toBe('nova')
    expect(problemas[0].arquivo).toBe('0128_nova.sql')
    expect(problemas[0].mensagem).toContain('npm run db:lock')
    expect(problemas[0].mensagem).toContain('MESMO commit')
  })

  it('lock vazio contra disco cheio → acusa TODAS, não só a primeira', () => {
    expect(conferirLock({}, TRAVADOS)).toHaveLength(2)
  })
})

describe('trava de hash das migrations — a normalização de fim de linha', () => {
  // ⚠ SEM ISTO A TRAVA SERIA INUTILIZÁVEL, e não é hipótese: medido em 06/09/2026, a árvore de
  // trabalho no Windows tem CRLF em quase todas as migrations (`0001_profiles.sql`: 51 linhas
  // com CR; `0127_conversao_reservas.sql`: 322), enquanto o blob do git — que é o que o Linux
  // do CI recebe no checkout — é LF. Sem normalizar, o MESMO arquivo teria dois hashes e a
  // trava acusaria deriva a cada clone, o que a treinaria a ser ignorada.
  const codificar = (s: string) => new TextEncoder().encode(s)

  it('CRLF e LF do mesmo conteúdo dão o MESMO hash', () => {
    const lf = 'create table x (\n  id uuid\n);\n'
    const crlf = 'create table x (\r\n  id uuid\r\n);\r\n'
    expect(hashDoConteudo(codificar(crlf))).toBe(hashDoConteudo(codificar(lf)))
  })

  it('conteúdo REALMENTE diferente continua dando hash diferente', () => {
    // O par da asserção acima: uma normalização boa demais (ex.: apagar todo `\r`, ou
    // colapsar espaço) faria a trava perder alterações reais.
    expect(hashDoConteudo(codificar('alter table x add y int;\n'))).not.toBe(
      hashDoConteudo(codificar('alter table x add z int;\n')),
    )
  })

  it('um `\\r` SOLTO é preservado — normalizar é tirar o par, não tirar todo CR', () => {
    // `\r` sem `\n` depois faz parte do conteúdo e é igual nas duas plataformas. Apagá-lo
    // mudaria o arquivo em vez de normalizá-lo, e dois arquivos diferentes colidiriam.
    expect(Array.from(normalizarConteudo(codificar('a\rb')))).toEqual(
      Array.from(codificar('a\rb')),
    )
    expect(Array.from(normalizarConteudo(codificar('a\r\nb')))).toEqual(
      Array.from(codificar('a\nb')),
    )
  })

  it('o hash é sha256 hexadecimal minúsculo de 64 caracteres', () => {
    // Contrato do formato do arquivo: se um dia alguém trocar o algoritmo, o lock inteiro tem
    // de ser regravado de propósito, não por acidente.
    expect(hashDoConteudo(codificar(''))).toMatch(/^[0-9a-f]{64}$/)
    // sha256 da string vazia — valor público, ancora que o algoritmo é o que diz ser.
    expect(hashDoConteudo(codificar(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })
})

describe('trava de hash das migrations — o arquivo do lock', () => {
  it('o caminho versionado é supabase/migrations.lock.json', () => {
    expect(ARQUIVO_LOCK.join('/')).toBe('supabase/migrations.lock.json')
    expect(DIR_MIGRACOES.join('/')).toBe('supabase/migrations')
  })

  it('o cabeçalho diz o que fazer e o que NÃO fazer', () => {
    // JSON não tem comentário, e este arquivo vai ser lido por quem o CI acabou de reprovar.
    const lock = lerLock(RAIZ)
    expect(lock._leia).toContain('npm run db:lock')
    expect(lock._leia).toContain('MIGRATION JÁ APLICADA É PROIBIDO')
    expect(lock.normalizacao).toContain('CRLF')
  })
})

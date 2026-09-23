import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { corpoVigente, definicoesDeFuncao } from './corpo-vigente.mjs'
import { MUTACOES, QUARENTENA } from './mutacoes.mjs'

// A TRAVA DO CATÁLOGO — F47. RODA SEM BANCO, e é essa a razão de ela existir.
//
// A mesa do Johnny não tem Postgres (docs/RELATORIO-F46.md §2.1), então tudo que só o
// injetor descobriria custa um ciclo de push. O erro mais caro é o mais bobo: um rótulo
// digitado errado em `derruba`. Ele não quebra nada — ele faz a mutação parecer NÃO
// DETECTADA, que é o diagnóstico mais valioso da fase, gasto num erro de digitação. Esta
// suíte o pega em meio segundo.
//
// O que ela NÃO faz: provar que a mutação é detectada. Isso só o banco responde, e é o
// trabalho do `npm run db:test:mutations`.

const RAIZ = process.cwd()

/**
 * O corpo VIGENTE de cada função que uma mutação reescreve, resolvido UMA VEZ, no
 * import deste arquivo.
 *
 * POR QUE NÃO DENTRO DO `it`. `corpoVigente` varre as 137 migrations de trás
 * para frente a cada chamada — são 38 mutações que reescrevem função, e uma delas
 * (`catalogo-security-definer-nova-nao-classificada`) cria função que NÃO existe,
 * o que força a varredura COMPLETA. Medido: ~650 ms num processo sozinho e sem
 * disputa. Sob a suíte inteira — 178 arquivos disputando CPU e disco no Windows —
 * isso passou dos 5 s de teto por teste do Vitest, e o caso abaixo ficou vermelho
 * por TEMPO, não por asserção. Entrou na conta quando as quatro mutações da F55
 * acrescentaram mais um arquivo a cada varredura.
 *
 * ⚠ O QUE MUDA É O CUSTO, NÃO A ASSERÇÃO. E ele vai para o IMPORT de propósito:
 * o próprio `mutacoes.mjs` já chama `corpoVigente` uma vez por mutação ao ser
 * importado (é o que `mutarFuncao` faz), então esse é um custo que este arquivo
 * comprovadamente aguenta. A memoização fica AQUI, e não em `corpo-vigente.mjs`,
 * para não mudar o comportamento do injetor por causa de um teste.
 */
const VIGENTE_POR_MUTACAO: Map<string, string | null> = new Map(
  MUTACOES.map((m) => {
    const defs = definicoesDeFuncao(m.sql)
    if (defs.length !== 1) return [m.id, null] as const
    const d = defs[0]
    try {
      return [m.id, corpoVigente(`${d.esquema}.${d.nome}(${d.tipos.join(', ')})`, RAIZ).sql] as const
    } catch {
      // A mutação CRIA uma função que não existe nas migrations. `undefined`
      // distingue esse caso de `null` (não é definição única de função).
      return [m.id, undefined as unknown as string] as const
    }
  }),
)
const PASTA_ROTEIROS = join(RAIZ, 'supabase', 'tests')

/** Os seis roteiros que a ficha da F47 nomeia como alvo do lote. */
const ROTEIROS_DA_FICHA = [
  'papeis_rls.sql',
  'seguranca_catalogo.sql',
  'cargo_dev.sql',
  'dev_destrutivo.sql',
  'import_substituir.sql',
  'conflito_filiais.sql',
  // F62 (22/09/2026): o isolamento A↔B passou a existir e a ter mutação que o derruba — a
  // primeira vez que `isolamento_tenant.sql` é alvo do injetor (fato 17 da ordem F62).
  'isolamento_tenant.sql',
]

function fonteDoRoteiro(nome: string): string {
  return readFileSync(join(PASTA_ROTEIROS, nome), 'utf8')
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * O rótulo existe LITERALMENTE no fonte, como `✗ <rótulo>` seguido de delimitador.
 *
 * ⚠ O lookahead não é decoração: sem ele, `2c` casaria dentro de `✗ 2c-bis` e um rótulo
 * inexistente passaria por existir. A mesma armadilha de prefixo que o injetor evita em
 * tempo de execução comparando o TOKEN inteiro.
 *
 * `\s+` e não um espaço só: `conflito_filiais.sql` usa DOIS espaços depois do ✗ em todas
 * as 74 linhas dele, e os outros roteiros usam um.
 */
function rotuloExisteNoFonte(fonte: string, rotulo: string): boolean {
  if (new RegExp(`✗\\s+${escaparRegex(rotulo)}(?=[\\s:'])`).test(fonte)) return true
  // A SEGUNDA FORMA — F48. Os catálogos novos (`catalogo_policies.sql`,
  // `catalogo_secdef.sql`, `isolamento_tenant.sql`) emitem o ✗ pela FERRAMENTA:
  // `pg_temp.assert_zero_de(rotulo, ruins, universo)` monta `raise warning '✗ %: …'`
  // em tempo de execução, então o `✗ <rótulo>` literal não existe no fonte deles.
  //
  // ⚠ Recusar essa forma empurraria os roteiros novos de volta para o `if v_n = 0 then ✓`,
  // que é a tautologia que a F45 criou a ferramenta para matar — a trava de mesa não
  // pode ter opinião sobre COMO se conta, só sobre o rótulo existir de verdade.
  //
  // O rótulo é o começo do PRIMEIRO argumento da chamada, e a régua é a mesma: token
  // inteiro, nunca prefixo (o lookahead exige espaço ou aspas logo depois, então `1a`
  // não casa dentro de `1a-bis`).
  return new RegExp(
    `assert_zero_de\\(\\s*'${escaparRegex(rotulo)}(?=[\\s'])`,
  ).test(fonte)
}

describe('1. o lote tem a forma e o tamanho que a ficha pede', () => {
  it('tem entre 20 e 131 mutações ATIVAS', () => {
    // ⚠ O TETO SUBIU DE 125 PARA 131 NA F63 (23/09/2026), no número EXATO. A decisão 8 do
    // PLAN-F63: mutação só onde ela derruba uma trava DESTA fase que nenhum teste de mesa derruba
    // — as seis são estado de banco. Quatro quebram a FORMA de `empresa_id` no lote 1 (default
    // literal, `drop not null`, FK `not valid`, a coluna ausente), cada uma numa tabela diferente,
    // e o `15b` de `catalogo_policies.sql` tem de acusá-las pelo nome (a sabotagem C); duas abrem
    // `backups_migration` (a policy que o `4` acusa pela simetria de `k_sem_select`; o grant que
    // o `6a` de `empresa_no_acervo.sql` acusa). 125 + 6 = 131. O lote estava NO teto (125/125),
    // sem folga — o número exato é a régua. Quarentena: 2 de 133, longe de um terço.
    //
    // ⚠ E DE 124 PARA 125 NA REVISÃO ADVERSARIAL DA MESMA F62 (22/09/2026): a revisão achou a
    // corrida do apply — a RPC antiga em voo, bloqueada pela trava da recópia, retomava depois
    // do commit e gravava em silêncio a coluna congelada. A guarda de profiles passou a recusá-la
    // (55000), e a mutação `f62-guarda-de-profiles-aceita-a-escrita-antiga` a tira (cenário 8d).
    //
    // ⚠ O TETO SUBIU DE 105 PARA 124 NA F62 (22/09/2026), no número EXATO — é o que a ordem da
    // fase pede. A F62 criou ou reescreveu as funções de autorização do cargo (a ponte de
    // papel_atual, as quatro de conjunto, e_plataforma, a guarda do dev em membros, as RPCs de
    // conta) e a régua da F51/F59 vale igual: UMA mutação por função de autorização criada ou
    // reescrita, cada uma derrubada por cenário nomeado. Dezenove (`F62_CARGO`): as quatro de
    // conjunto, e_plataforma, a ponte em três eixos (arquivamento, desativação, empresa),
    // pode_escrever_filial, existe_outro_admin_ativo, exigir_gestao_de, a guarda do dev em
    // membros, o handle_new_user, as três escritoras voltando à coluna congelada,
    // profiles_guarda_dev esquecendo a membership, o `force` em membros e a FK composta do
    // vínculo. 105 + 19 = 124. Quarentena: 2 de 126, longe de um terço.
    //
    // ⚠ O TETO SUBIU DE 95 PARA 105 NA REAUDITORIA, PASSO 4 (21/09/2026, item AG). A `0150`
    // decompôs `aplicar_movimentacao` em SEIS auxiliares, e a leitura de cobertura da fase
    // achou quatro blocos do gatilho que roteiro nenhum exercitava (estorno sem `estorno_de`,
    // `estorno_de` de outro ativo, a guarda de identidade no estorno e em compra/troca). As duas
    // mutações que miravam o corpo antigo foram REAPONTADAS e não somam; entram DEZ novas
    // (`REAUDITORIA_PASSO4`): pelo menos uma por auxiliar — a régua da F51 — e uma por buraco
    // fechado, mais a de ACL das seis. 92 + 10 = 102.
    //
    // 105 e não 102, pela mesma régua escrita abaixo: teto colado no número de hoje reabre a
    // decisão no primeiro achado da revisão adversarial desta mesma fase, e é assim que um teto
    // vira ritual. A régua de DESENHO continua sendo a quarentena abaixo de um terço e o injetor
    // rodando INCONDICIONALMENTE no `banco-sem-docker`.
    //
    // ⚠ O TETO SUBIU DE 85 PARA 95 NA F60 (16/09/2026). A trava do recorte obrigatório das
    // `rel_*` pôs SETE asserções novas em `catalogo_secdef.sql` (bloco 7, rótulos 7a–7g) e a
    // fase escreveu DOIS cenários de comportamento que o catálogo não enxerga (o transferido
    // depois da data, `11a` de `asof_desempate.sql`; a filial desativada, `2a` de
    // `f60_recorte.sql`). Tudo nasceu VERDE contra a cadeia com a `0143`/`0145` — e a régua da
    // F59 vale igual: uma quebra por rótulo. OITO mutações novas (`F60_RECORTE`): uma por
    // rótulo do bloco 7, com 7a/7b numa só (a `rel_*` nova sem recorte cai pelos dois lados), e
    // uma por cenário. As duas da F53 que miravam `rel_estoque_asof` foram REANCORADAS na
    // assinatura nova e não somam — já estavam no lote. 82 + 8 = 90.
    //
    // 95 e não 91, e o motivo é escrito para não virar hábito. A conta do PLAN-F60 (§7.4) era
    // SETE novas, 89, teto 90 — e ela já furou UMA vez dentro da própria fase: a revisão
    // adversarial da trava achou a exceção por NOME (a `7g`) e trouxe a oitava mutação. A
    // revisão adversarial do lote 2 ainda roda, e o que ela achar no bloco 7 ou nos cenários
    // novos ganha quebra própria pela mesma régua. Teto colado no número de hoje reabriria esta
    // decisão no mesmo PR, que é como um teto vira ritual; cinco de folga cobre essa rodada sem
    // virar teto frouxo — a régua de DESENHO continua sendo a quarentena abaixo de um terço, e o
    // injetor rodando INCONDICIONALMENTE no `banco-sem-docker`.
    //
    // ⚠ O TETO SUBIU DE 75 PARA 85 NA F59 (16/09/2026). A doutrina do predicado pôs dez
    // asserções novas em `catalogo_policies.sql` (bloco 4, rótulos 10a–14), todas nascidas
    // VERDES — o censo mediu zero policy fora da régua. Asserção que nasce verde e nunca
    // ficou vermelha é documento, e a ordem da fase exige uma quebra por regra coberta:
    // OITO mutações novas (`F59_DOUTRINA`), uma por rótulo, com 10a/10b numa só (a policy
    // renomeada sai do universo pelos dois lados) e a 10d provada por dentro do próprio
    // roteiro (as árvores sintéticas). 74 + 8 = 82. 85 e não 82: a F60 acrescenta a trava
    // de parâmetro de recorte das `rel_*` e vai precisar de folga — a mesma conta da F52.
    //
    // ⚠ O TETO SUBIU DE 70 PARA 75 NA F56 · FRENTE F (11/09/2026). A `0140`
    // recria as três funções da cadeia do import para tratar os cinco caminhos
    // de FK do fato 27 (a bomba do "Substituir tudo"), e ganhou CINCO mutações
    // próprias:
    //   · a condição de revalidação (`import-revalidacao-nao-compara-o-vivo`)
    //     REAPONTADA — de duas linhas (0131) para oito (0140), uma por chave; o
    //     rótulo `5a` entrou ao lado do `0b` que já existia, porque desligar a
    //     condição inteira prova as oito de uma vez;
    //   · uma mutação NOVA e isolada (`import-revalidacao-ignora-pendencia-
    //     nova-do-acervo`) que remove SÓ a comparação de `pendencias_item`,
    //     deixando as outras sete intactas — sem ela, esquecer de comparar UMA
    //     chave nova ficaria escondido atrás das outras sete continuando certas;
    //   · quatro mutações "sem-X" em `import_apagar_acervo_filial`, uma por
    //     passo novo (desvincular o elo da pendência, desvincular o elo da
    //     movimentação, apagar as pendências, anular o ponteiro de substituto) —
    //     cada uma reabre um dos cinco caminhos de FK e o cenário 5 do roteiro
    //     (`import_substituir.sql`) acusa o mesmo `23503` não tratado.
    // 69 + 1 nova (a de pendências isolada) + 4 novas (fk-nao-tratada) = 74,
    // teto 75 (uma de folga — a mesma régua de toda fase anterior). A mutação
    // "reapontada" não soma: ela já existia no lote de 69.
    //
    // ⚠ O TETO SUBIU DE 68 PARA 70 NA F56 (11/09/2026). A fase escreveu o roteiro
    // `vocabulario_import.sql` (o vocabulário do import virando dado, migration
    // 0139) e ele nasceu com DUAS quebras próprias — as duas mecânicas que fecham a
    // ambiguidade da Decisão 2 do PLAN-F56.md:
    //   · o gatilho que barra apelido igual ao NOME de outra filial desaparece
    //     (a diagonal nome×apelido volta a aceitar calada);
    //   · o índice único de nome de filial desaparece (duas filiais passam a poder
    //     ter o mesmo nome normalizado, sem erro nenhum).
    // 67 + 2 = 69, teto 70 (uma de folga — a mesma régua de toda fase anterior:
    // teto colado no número de hoje força outra decisão na semana seguinte).
    //
    // ⚠ O TETO SUBIU DE 64 PARA 68 NA F55 (10/09/2026). A fase escreveu o roteiro
    // `integridade_alarme.sql`, que é o primeiro a exercitar as DOZE checagens de
    // integridade uma a uma, e ele nasceu com QUATRO quebras próprias — uma por
    // promessa que o alarme faz e que nada vigiava:
    //   · o núcleo para de contar uma checagem (ela responde ZERO, e o alarme fica
    //     verde sobre uma corrupção que existe — a falha mais silenciosa possível);
    //   · o resumo de integridade vira alcançável por `anon` (as contagens da
    //     empresa inteira pela chave pública, sem sessão);
    //   · o resumo passa a devolver a coluna `amostra` (patrimônio e nome de pessoa
    //     indo para dentro de um secret do GitHub e do corpo de uma issue);
    //   · o rótulo de ambiente vira alcançável por `authenticated`.
    // Nenhuma das quatro quebra `lint`, `build` ou `tsc`: só o roteiro as vê, que
    // é exatamente o que o injetor existe para provar.
    // 63 + 4 = 67, teto 68 (uma de folga — a mesma régua da F52, F53 e F54, porque
    // teto colado no número de hoje força outra decisão na semana seguinte, e é
    // assim que um teto vira ritual).
    // ⚠ O TETO SUBIU DE 59 PARA 64 NA F54 (09/09/2026). A fase escreveu o roteiro
    // `restauracao.sql`, que é o primeiro a exercitar a RESTAURAÇÃO, e ele nasceu com
    // QUATRO quebras próprias — uma por obstáculo que o restaurador enfrenta e que
    // ninguém vigiava:
    //   · a identidade `always` de `movimentacoes.ordem` virando `by default`;
    //   · o índice único da `ordem` sumindo;
    //   · `guarda_acervo` deixando passar `forcado = true` fora da janela;
    //   · `aplicar_movimentacao` parando de abrir pendência de item.
    // As duas primeiras não são hipóteses: descrevem o estado do banco ANTES da
    // `0133`, e a ata 1 da F53 as nomeia como "custo herdado pela F54". A quarta é a
    // que vigia a PREMISSA da Decisão 7 — é porque o trigger insere pendência que
    // restaurar com ele ligado duplica a linha do backup; se isso mudar, o desenho do
    // restaurador precisa ser reavaliado, e quem tem de descobrir é o injetor.
    // 58 + 4 novas + 1 PROMOVIDA da quarentena = 63, teto 64 (uma de folga — a mesma
    // régua da F52 e da F53, porque teto colado no número de hoje força outra decisão na
    // semana seguinte, que é como um teto vira ritual). A promovida é
    // , que a F52 reapontou para a F54
    // com o cenário escrito — e que esta fase adotou em vez de reapontar de novo.
    //
    // A régua de DESENHO continua sendo a de baixo (quarentena abaixo de um terço) e o
    // injetor rodando INCONDICIONALMENTE no `banco-sem-docker`.
    //
    // ⚠ O TETO SUBIU DE 56 PARA 59 NA F53 (09/09/2026). A fase acrescentou a coluna
    // `movimentacoes.ordem` e trocou o desempate em três objetos (0134); TRÊS das
    // travas novas ganharam mutação — uma por objeto tocado (`rel_estoque_asof`
    // duas vezes, com réguas DIFERENTES: volta ao `id` e vira `ordem` pura; e a
    // trava do estorno em `aplicar_movimentacao`). 55 + 3 = 58, teto 59 (uma de
    // folga, a mesma régua da F52). A QUARTA trava — `v_conflitos_filiais` perdendo
    // `, m2.ordem desc` — não entrou no lote: nenhum roteiro lê `ultima_mov_tipo`
    // sob empate hoje, então foi para a quarentena (`f53-view-de-conflitos-perde-
    // o-desempate`, fase F53B) em vez de inflar o lote com uma mutação que sairia
    // "não detectada" por conjunto vazio — o mesmo diagnóstico errado que a F47/F48
    // já haviam identificado e que esta fase não repete.
    //
    // ⚠ O TETO SUBIU DE 48 PARA 56 NA F52 (08/09/2026), e o motivo é este.
    //
    // A F52 acrescentou SETE guardas de escopo no-op e OITO mutações — uma por guarda,
    // mais uma segunda para `mesmo_escopo_de_gestao`. A segunda existe por uma razão que
    // vale escrever, porque ela é a lição da fase inteira: uma guarda que devolve `true`
    // é INDETECTÁVEL POR EFEITO. Remover a chamada não muda resultado nenhum. Então cada
    // guarda no-op precisa de DOIS eixos de mutação:
    //   · PRESENÇA — remover a chamada derruba a asserção que lê `pg_get_functiondef`;
    //   · EFEITO   — fazer a guarda devolver `false` derruba os cenários POSITIVOS, e é
    //     a única prova de que a condição está mesmo NO CAMINHO das cinco RPCs.
    // Sem o segundo eixo, a fase teria entregue uma condição que talvez nem executasse.
    // 47 + 8 = 55, e o teto vai a 56 (uma de folga, não oito: teto largo demais deixa de
    // ser decisão).
    //
    // ⚠ O TETO SUBIU DE 44 PARA 48 NA F51 (08/09/2026). A fase decompôs
    // `importar_ativos_substituir` (393 linhas) em oito auxiliares e escreveu UMA
    // MUTAÇÃO POR AUXILIAR — sem isso, sete das oito nasceriam sem ninguém provar
    // que os roteiros sabem ficar vermelhos quando elas quebram, que é a única
    // coisa que o injetor mede. Duas das oito são as do import REAPONTADAS (não
    // somam), então o lote foi de 39 para 45.
    //
    // 48 e não 45: a F52 acrescenta guardas de escopo e vai precisar de folga, e
    // um teto colado no número de hoje só força outra decisão daqui a uma semana —
    // que é como um teto vira ritual. A régua de desenho continua sendo a de baixo
    // (quarentena abaixo de um terço) e o injetor rodar INCONDICIONALMENTE no CI.
    // ⚠ O TETO SUBIU DE 30 PARA 44 NA F48 (07/09/2026), e o motivo é escrito para não
    // virar hábito. A F47 fechou com 28 ativas e 5 em quarentena. A F48 (a) fortaleceu os
    // quatro cenários que a quarentena nomeava e promoveu TRÊS entradas de volta ao lote,
    // e (b) escreveu OITO mutações novas — as sabotagens obrigatórias dos catálogos
    // novos, que a ordem exige provar e que, escritas aqui, deixam de ser um log de uma
    // tarde e passam a rodar a cada push. 28 + 3 + 8 = 39. O teto de 30 era a folga da
    // F47, não uma régua de desenho.
    //
    // A régua de desenho é a de baixo (a quarentena abaixo de um terço) e a do injetor
    // rodar INCONDICIONALMENTE no CI. O teto existe só para que um lote que cresça sem
    // ninguém perceber passe por uma decisão. Se a F51/F52 precisarem de mais, sobem o
    // número E escrevem por quê, como esta linha faz.
    expect(MUTACOES.length).toBeGreaterThanOrEqual(20)
    expect(MUTACOES.length).toBeLessThanOrEqual(131)
  })

  it('os `id` são únicos', () => {
    const ids = MUTACOES.map((m) => m.id)
    expect(new Set(ids).size, `ids repetidos: ${ids.filter((i, k) => ids.indexOf(i) !== k)}`).toBe(
      ids.length,
    )
  })

  it('os `id` da quarentena não colidem com os do lote ativo', () => {
    const ativos = new Set(MUTACOES.map((m) => m.id))
    for (const q of QUARENTENA) expect(ativos.has(q.id), `${q.id} está nos dois`).toBe(false)
  })

  it.each(MUTACOES.map((m) => [m.id, m] as const))('`%s` tem todos os campos obrigatórios', (_id, m) => {
    expect(m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(m.roteiro).toMatch(/^[a-z0-9_]+\.sql$/)
    expect(m.classe, 'sem classe de defeito').toBeTruthy()
    expect(Array.isArray(m.derruba)).toBe(true)
    expect(m.derruba.length, 'mutação sem rótulo esperado não prova nada').toBeGreaterThan(0)
    expect(m.porque.length, 'o `porque` é uma frase, não uma etiqueta').toBeGreaterThan(40)
    expect(typeof m.sql).toBe('string')
    expect(m.sql.trim().length).toBeGreaterThan(10)
  })

  it('as seis famílias de roteiro da ficha estão cobertas', () => {
    const cobertos = new Set(MUTACOES.map((m) => m.roteiro))
    for (const r of ROTEIROS_DA_FICHA) {
      expect(cobertos.has(r), `nenhuma mutação mira ${r}`).toBe(true)
    }
  })

  it('há ao menos UMA do tipo "confere o papel e esquece o escopo"', () => {
    // É a quebra cross-tenant clássica e o ensaio geral da F66 — a ficha a exige
    // nominalmente. Sem ela o lote inteiro pode estar certo e ainda assim não responder
    // à pergunta que motivou a fase.
    const dela = MUTACOES.filter((m) => m.classe === 'papel-sem-escopo')
    expect(dela.length).toBeGreaterThanOrEqual(1)
    for (const m of dela) {
      expect(m.sql).toContain('pode_escrever()')
      expect(m.sql).not.toContain('pode_escrever_filial')
    }
  })
})

describe('2. todo rótulo em `derruba` existe DE VERDADE no roteiro', () => {
  // A asserção mais importante deste arquivo. Um rótulo com erro de digitação viraria
  // "mutação nunca detectada" — o achado mais valioso da fase, gasto num engano.
  const pares = MUTACOES.flatMap((m) => m.derruba.map((r) => [m.id, m.roteiro, r] as const))

  it('há pares para conferir (guarda do próprio teste)', () => {
    expect(pares.length).toBeGreaterThan(25)
  })

  it.each(pares)('%s → %s tem o cenário `%s`', (id, roteiro, rotulo) => {
    expect(existsSync(join(PASTA_ROTEIROS, roteiro)), `${roteiro} não existe`).toBe(true)
    expect(
      rotuloExisteNoFonte(fonteDoRoteiro(roteiro), rotulo),
      `${id}: o roteiro ${roteiro} não emite "✗ ${rotulo}" em lugar nenhum — rótulo errado ou renomeado`,
    ).toBe(true)
  })

  it('o casador de rótulo NÃO aceita prefixo (guarda do próprio teste)', () => {
    // Se ele aceitasse, a asserção acima passaria para rótulo inventado que fosse
    // prefixo de um real — e o teste estaria mentindo.
    const fonte = "raise warning '✗ 2c-bis operador MOVIMENTOU …'"
    expect(rotuloExisteNoFonte(fonte, '2c-bis')).toBe(true)
    expect(rotuloExisteNoFonte(fonte, '2c')).toBe(false)
    // E aceita os DOIS espaços de conflito_filiais.sql.
    expect(rotuloExisteNoFonte("raise warning '✗ 1a  esperava 4 grupos'", '1a')).toBe(true)
  })

  it('o casador reconhece a forma `assert_zero_de`, e ali também não aceita prefixo (F48)', () => {
    const viaFerramenta = "  if pg_temp.assert_zero_de(\n       '9a nenhuma tabela NOVA na publication' ||"
    expect(rotuloExisteNoFonte(viaFerramenta, '9a')).toBe(true)
    expect(rotuloExisteNoFonte(viaFerramenta, '9')).toBe(false)
    // Rótulo que não existe em forma nenhuma continua reprovando.
    expect(rotuloExisteNoFonte(viaFerramenta, '9b')).toBe(false)
  })
})

describe('3. as provas de que a mutação PEGOU', () => {
  const comProva = MUTACOES.filter((m) => m.prova)

  it('a maioria das mutações tem sonda de prova', () => {
    // Sem sonda, uma mutação que aplica mas não muda nada se disfarça de "não
    // detectada" — o diagnóstico errado, acusando de fraca uma asserção que está certa.
    expect(comProva.length / MUTACOES.length).toBeGreaterThanOrEqual(0.9)
  })

  it.each(comProva.map((m) => [m.id, m] as const))('`%s`: a sonda tem forma válida', (_id, m) => {
    expect(typeof m.prova!.sql).toBe('string')
    expect(m.prova!.sql.trim().toLowerCase().startsWith('select')).toBe(true)
    // Uma linha, uma coluna, comparada como texto: `t`/`f` do booleano do Postgres.
    expect(['t', 'f']).toContain(m.prova!.espera)
  })
})

describe('4. as policies citadas existem nas migrations', () => {
  const MIGRACOES = readdirSync(join(RAIZ, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(RAIZ, 'supabase', 'migrations', f), 'utf8'))
    .join('\n')

  const citadas = MUTACOES.flatMap((m) =>
    (m.policies ?? []).map((p) => [m.id, p.nome, p.tabela] as const),
  )

  it('há policies citadas (guarda do próprio teste)', () => {
    expect(citadas.length).toBeGreaterThanOrEqual(5)
  })

  it.each(citadas)('%s: a policy "%s" em %s existe', (id, nome, tabela) => {
    // Um nome de policy errado faria a mutação morrer em "não aplicou" — diagnóstico
    // certo, mas um ciclo de CI gasto por um erro de digitação que se pega aqui.
    const re = new RegExp(
      `(create|alter) policy "${escaparRegex(nome)}"\\s+on\\s+${escaparRegex(tabela)}\\b`,
      'i',
    )
    expect(re.test(MIGRACOES), `${id}: nenhuma migration declara "${nome}" em ${tabela}`).toBe(true)
  })
})

describe('5. dados 100% sintéticos (regra 2 do CLAUDE.md)', () => {
  const TUDO = JSON.stringify([...MUTACOES, ...QUARENTENA])

  it('nenhuma mutação cita patrimônio fora da faixa fictícia', () => {
    // Os roteiros usam `WAP0009xxx` e o smoke usa `WAP0001234`. Qualquer OUTRO
    // patrimônio num catálogo que só mexe em estrutura é dado real vazando.
    const patrimonios = [...TUDO.matchAll(/WAP\d{7}/g)].map((m) => m[0])
    expect(patrimonios, 'o catálogo não deveria citar patrimônio nenhum').toEqual([])
  })

  /** As formas que EXECUTAM perda de dado. */
  const DESTRUTIVO = /\b(delete\s+from|truncate|drop\s+(database|schema|table))\b/gi

  it('nenhuma mutação executa perda de dado como comando de topo', () => {
    // ⚠ A REGRA É SOBRE O QUE EXECUTA, e a distinção não é frescura: `importar_ativos_
    // substituir` TEM `delete from public.ativos` no corpo — o import de startup apaga a
    // filial antes de gravar, é o desenho dele. Reescrever a função com `create or
    // replace` não apaga nada; APLICAR um `delete` solto, sim. Uma regra que só grepasse
    // o texto reprovaria a mutação certa e ensinaria a afrouxá-la.
    for (const m of MUTACOES) {
      const ehDefinicaoDeFuncao = definicoesDeFuncao(m.sql).length === 1
      if (ehDefinicaoDeFuncao) continue
      expect(
        m.sql.match(DESTRUTIVO),
        `${m.id} não é definição de função e mesmo assim executa perda de dado`,
      ).toBeNull()
    }
  })

  it('as mutações que reescrevem função NÃO acrescentam perda de dado nenhuma', () => {
    // A outra metade: reescrever a função é seguro, mas reescrevê-la ACRESCENTANDO um
    // `delete` não seria. Comparamos contra o corpo vigente — a mutação só pode TIRAR
    // guarda, nunca plantar destruição.
    let conferidas = 0
    for (const m of MUTACOES) {
      const defs = definicoesDeFuncao(m.sql)
      if (defs.length !== 1) continue
      const vigente = VIGENTE_POR_MUTACAO.get(m.id)
      if (vigente === undefined) {
        // F48 — a mutação CRIA uma função que não existe nas migrations (é o caso de
        // `catalogo-security-definer-nova-nao-classificada`, que sabota justamente o
        // "função nova entra sem ninguém decidir"). Não há corpo anterior para comparar,
        // e a regra que este bloco protege — "a mutação não ACRESCENTA destruição a uma
        // função existente" — não se aplica. A régua que se aplica é a do bloco de cima,
        // e ela é cobrada aqui explicitamente para a exceção não virar buraco.
        expect(
          m.sql.match(DESTRUTIVO),
          `${m.id} cria uma função nova E executa perda de dado`,
        ).toBeNull()
        continue
      }
      if (vigente === null) continue
      const antes = (vigente.match(DESTRUTIVO) ?? []).length
      const depois = (m.sql.match(DESTRUTIVO) ?? []).length
      expect(depois, `${m.id} acrescentou comando destrutivo ao corpo da função`).toBeLessThanOrEqual(
        antes,
      )
      conferidas++
    }
    expect(conferidas, 'nenhuma mutação de função foi conferida — o teste está cego').toBeGreaterThan(
      5,
    )
  })
})

describe('6. a quarentena é declarada, não é escape hatch', () => {
  it('nada da quarentena é executado pelo injetor', () => {
    // A garantia é estrutural: `MUTACOES` e `QUARENTENA` são arrays distintos e o motor
    // só percorre o primeiro. Esta asserção trava a separação.
    const ativos = new Set(MUTACOES.map((m) => m.id))
    for (const q of QUARENTENA) expect(ativos.has(q.id)).toBe(false)
  })

  it.each(QUARENTENA.map((q) => [q.id, q] as const))(
    '`%s` nomeia a fase que a adota e por que é indetectável hoje',
    (_id, q) => {
      expect(q.fase, 'entrada de quarentena sem fase adotante vira lixo permanente').toMatch(
        /^F\d+[A-Z]?$/,
      )
      expect(q.indetectavel.length, 'sem o motivo escrito, a quarentena é só uma desculpa').toBeGreaterThan(
        60,
      )
      expect(q.roteiro).toMatch(/^[a-z0-9_]+\.sql$/)
    },
  )

  it('a quarentena não passa de um TERÇO do lote', () => {
    // A régua da ordem: se passar, isso é a manchete do relatório, não nota de rodapé.
    // O teste existe para que a régua não dependa de alguém lembrar dela.
    const total = MUTACOES.length + QUARENTENA.length
    expect(
      QUARENTENA.length / total,
      `${QUARENTENA.length} de ${total} em quarentena — leia a régua da F47`,
    ).toBeLessThan(1 / 3)
  })
})

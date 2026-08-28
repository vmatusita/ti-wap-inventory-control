// scripts/reset.ts — zera os dados de desenvolvimento.
// Apaga anotacoes/lancamentos_item/termos_gerados (+ .docx no Storage) ->
// movimentacoes -> ativos -> itens (nessa ordem, por causa das FKs). PRESERVA
// filiais, motivos e profiles (dados de
// referencia / contas). O catalogo de itens (F3B) e dado de DEV recriado pelo
// seed, entao tambem e limpo aqui. Mesmas guardas anti-acidente do seed.
//
// F21 (29/07/2026) — as duas tabelas novas do modelo de cargos, e por que cada
// uma cai de um lado da linha. A regra desta ferramenta e "apaga o ACERVO, preserva
// as CONTAS":
//   * `operador_filiais` (vinculo de escrita do operador) e PRESERVADA, junto de
//     `profiles`: e configuracao de CONTA, nao dado de acervo. Apaga-la deixaria as
//     contas do banco de ensaio sem escrever em lugar nenhum ate o proximo seed —
//     um efeito colateral que ninguem espera de um "reset dos dados". O seed
//     reescreve os vinculos das contas ficticias a cada rodada, de todo modo.
//   * `eventos_admin` (trilha de auditoria) e LIMPA, porque o seed insere linhas
//     ficticias nela: nao limpar duplicaria a trilha a cada rodada. Este e o UNICO
//     lugar do projeto que apaga a trilha, e so aqui faz sentido — o app nao tem
//     caminho de update/delete nela (migration 0065), de proposito.
// Uso: `npm run db:reset`.
import {
  assertGuardsAndGetConfig,
  createAdminClient,
  loadEnvLocal,
} from './env-guard'

async function main() {
  // Guardas SEMPRE primeiro.
  loadEnvLocal()
  const cfg = assertGuardsAndGetConfig()
  const db = createAdminClient(cfg)

  console.log(`[reset] projeto: ${cfg.projectRef}`)

  const EPOCH = '1970-01-01T00:00:00Z'

  // F23 (30/07/2026) — POR QUE ISTO DEIXOU DE SER UMA SEQUENCIA DE `.delete()`.
  // A migration 0081 instalou a guarda do acervo: um trigger que recusa DELETE em
  // ativos/movimentacoes/lancamentos_item vindo de QUALQUER caminho que nao declare a janela
  // `estoque.dev_destrutivo`. Isso vale tambem para o SERVICE ROLE — que e exatamente o que
  // este script usa, e era o unico papel que a "imutabilidade" anterior (ausencia de policy)
  // nao segurava. Com a guarda no ar, os `.delete()` daqui passariam a devolver 42501.
  //
  // A traducao e a RPC `resetar_dados_ficticios` (migration 0083): um caminho NOMEADO, com
  // execute concedido SO ao service_role, que abre a janela, apaga na ordem certa das FKs e a
  // fecha. Ganho de seguranca liquido: antes o service role apagava qualquer coisa de qualquer
  // jeito; agora ele alcanca o acervo por uma funcao unica e auditavel por pg_get_functiondef.
  //
  // ⚠ A PROTECAO CONTRA RODAR EM PRODUCAO NAO MUDOU e continua sendo a daqui:
  // `assertGuardsAndGetConfig()` (scripts/env-guard.ts) recusa qualquer ref da lista
  // REFS_DE_PRODUCAO antes de abrir conexao. O banco nao sabe em que ambiente esta.
  const { data: apagados, error: rpcErr } = await db.rpc('resetar_dados_ficticios', {
    p_confirmacao: 'RESETAR DADOS FICTICIOS',
  })
  if (rpcErr) throw new Error(`Falha ao zerar o acervo: ${rpcErr.message}`)
  const n = (apagados ?? {}) as Record<string, number>

  // Os .docx do bucket privado `termos`: a RPC apagou as LINHAS, mas nao os objetos — o
  // trigger `storage.protect_objects_delete` recusa DELETE em storage.objects por SQL, entao
  // a remocao e sempre pela API, daqui. Sem isto o bucket fica com orfaos (que a 8a checagem
  // de integridade da /dev passaria a acusar).
  const { data: termoObjs } = await db.storage.from('termos').list('', { limit: 1000 })
  if (termoObjs && termoObjs.length > 0) {
    await db.storage.from('termos').remove(termoObjs.map((o) => o.name))
  }

  // eventos_admin (F21): a trilha de auditoria ficticia que o seed insere. Fica FORA da RPC
  // de proposito — a RPC e a ferramenta de acervo, e a trilha nao e acervo; este e o unico
  // lugar do projeto que a apaga, e so aqui faz sentido. Filtro por `quando` (NOT NULL).
  const { count: eventoCount, error: eventoErr } = await db
    .from('eventos_admin')
    .delete({ count: 'exact' })
    .gte('quando', EPOCH)
  if (eventoErr) throw new Error(`Falha ao apagar eventos_admin: ${eventoErr.message}`)

  // colaboradores (F37): as pessoas ficticias que o seed cadastra. FORA da RPC, pelo
  // MESMO motivo de `eventos_admin` acima — e por um segundo, decisivo: a RPC
  // `resetar_dados_ficticios` e uma funcao EXISTENTE, e a F37 e aditiva (nenhuma funcao
  // existente e recriada). Aqui funciona porque a RPC ja apagou `movimentacoes` e
  // `lancamentos_item`, que sao quem referencia esta tabela: quando chegamos, nenhuma FK
  // aponta mais para ca. `colaboradores` nao tem trigger de guarda, entao o `.delete()`
  // do service role passa direto.
  //
  // `tipos_item` NAO e apagada, de proposito: os 7 slugs vem do SEED DA MIGRATION 0114,
  // nao do seed ficticio — sao vocabulario do sistema, da mesma familia de `motivos` e
  // `filiais`, que este script tambem preserva. Apaga-los deixaria o banco sem o
  // vocabulario que o checklist da devolucao precisa.
  const { count: colabCount, error: colabErr } = await db
    .from('colaboradores')
    .delete({ count: 'exact' })
    .gte('created_at', EPOCH)
  if (colabErr) throw new Error(`Falha ao apagar colaboradores: ${colabErr.message}`)

  console.log(
    `[reset] apagados: ${n.anotacoes ?? 0} anotacoes, ${n.lancamentos_item ?? 0} lancamentos_item, ` +
      `${n.pendencias_item ?? 0} pendencias_item, ${n.termos_gerados ?? 0} termos_gerados, ` +
      `${n.movimentacoes ?? 0} movimentacoes, ${n.ativos ?? 0} ativos, ${n.itens ?? 0} itens, ` +
      `${eventoCount ?? 0} eventos_admin, ${colabCount ?? 0} colaboradores.`,
  )
  console.log(
    '[reset] preservados: filiais, motivos, tipos_item (vocabulario da 0114), profiles (contas, com cargo) e operador_filiais (vinculos de escrita).',
  )
}

main().catch((err) => {
  console.error('[reset] erro:', err instanceof Error ? err.message : err)
  process.exit(1)
})

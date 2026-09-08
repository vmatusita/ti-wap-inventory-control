// =============================================================================
// mutacoes.mjs — o CATÁLOGO de quebras deliberadas (F47)
// =============================================================================
// Cada entrada aqui é um defeito REAL, escrito de propósito, que um dos roteiros
// de `supabase/tests/` tem de saber acusar — e acusar PELO CENÁRIO CERTO. O motor
// (`scripts/db/run-mutation-tests.mjs`) aplica uma mutação por vez num banco
// descartável e exige que os rótulos de `derruba` fiquem `✗`.
//
// ⚠ CATÁLOGO E MOTOR SÃO ARQUIVOS SEPARADOS DE PROPÓSITO. A F51 e a F52 vão
// acrescentar mutações; elas mexem AQUI e não no motor.
//
// ⚠ DADOS 100% SINTÉTICOS (regra 2 do CLAUDE.md). Nenhuma mutação cita nome de
// colaborador, patrimônio ou linha de planilha da WAP — todas mexem em ESTRUTURA
// (policy, função, grant, flag de RLS), nunca em dado.
//
// -----------------------------------------------------------------------------
// OS CAMPOS
// -----------------------------------------------------------------------------
//   id       slug único, kebab-case. É o que aparece na tabela final do injetor.
//   roteiro  o arquivo de `supabase/tests/` que TEM de acusar.
//   classe   a família do defeito — agrupa o relatório e a leitura da F48.
//   derruba  os rótulos EXATOS que precisam ficar `✗`. O token é o que vem logo
//            depois do `✗ ` no `raise warning` do roteiro. `scripts/db/mutacoes.test.mts`
//            confere que cada um existe LITERALMENTE no fonte daquele roteiro —
//            um erro de digitação aqui viraria "mutação nunca detectada" e
//            queimaria um ciclo de push.
//   porque   uma frase: que classe de defeito real esta quebra imita.
//   sql      o SQL da mutação, aplicado com `ON_ERROR_STOP=1`.
//   prova    (opcional) `{ sql, espera }` — uma consulta de UMA linha e UMA coluna
//            que prova que a mutação PEGOU. Sem ela, mutação que não muda nada se
//            disfarçaria de "não detectada", que é o diagnóstico errado.
//   policies (opcional) as policies que o SQL referencia, para a trava de mesa
//            conferir que o nome existe nas migrations.
//
// -----------------------------------------------------------------------------
// POR QUE `corpoVigente` + `trocarNoCorpo`, E NÃO A FUNÇÃO COLADA
// -----------------------------------------------------------------------------
// Mutar uma função de 100 linhas colando a função inteira aqui cria uma cópia que
// envelhece em silêncio. `corpoVigente` resolve o corpo VIVO das migrations e
// `trocarNoCorpo` reprova ALTO se o trecho não existir mais — na mesa, sem banco.
// Ver o cabeçalho de `scripts/db/corpo-vigente.mjs`.
// =============================================================================

import { corpoVigente, trocarNoCorpo } from './corpo-vigente.mjs'

/**
 * @typedef {object} Sonda
 * @property {string} sql consulta de UMA linha e UMA coluna
 * @property {'t'|'f'} espera o valor que prova que a mutação pegou
 */

/**
 * @typedef {object} Mutacao
 * @property {string} id
 * @property {string} roteiro
 * @property {string} classe
 * @property {string[]} derruba
 * @property {string} porque
 * @property {string} sql
 * @property {Sonda} [prova]
 * @property {{nome: string, tabela: string}[]} [policies]
 */

/**
 * @typedef {object} EmQuarentena
 * @property {string} id
 * @property {string} roteiro
 * @property {string} classe
 * @property {string[]} derruba
 * @property {string} porque
 * @property {string} sql
 * @property {string} indetectavel por que o rig de hoje não a acusa
 * @property {string} fase a fase que a adota (`F48`, `F52`…)
 */

/** Reescreve uma função trocando UM trecho do corpo vigente. */
function mutarFuncao(assinatura, de, para, id) {
  return trocarNoCorpo(corpoVigente(assinatura).sql, de, para, id)
}

const MARCA = '-- MUTAÇÃO F47 (injetor): o trecho abaixo foi deliberadamente afrouxado.'

// =============================================================================
// papeis_rls.sql — cargos, vínculo de filial e RLS
// =============================================================================
// ⚠ DOIS PONTOS CEGOS DESTE ROTEIRO, medidos na exploração e respeitados aqui:
//   · ele NUNCA cria um perfil `papel = 'dev'`, então mutação que dependa de
//     distinguir dev de admin é invisível a ele (vai para `cargo_dev.sql`);
//   · ele roda inteiro como `authenticated`, nunca `set local role anon`, então
//     `grant … to anon` é invisível a ele (vai para `seguranca_catalogo.sql`).
// Mapear uma mutação dessas para cá seria escrever uma quarentena disfarçada.
/** @type {Mutacao[]} */
const PAPEIS_RLS = [
  {
    id: 'rls-movimentacao-confia-na-filial-declarada',
    roteiro: 'papeis_rls.sql',
    classe: 'escopo-de-filial',
    derruba: ['2c-bis', '2c-ter'],
    porque:
      'Reabre o furo do deputado confuso que a 0067 fechou: a policy volta a confiar só na filial DECLARADA pelo cliente e para de conferir a filial REAL do ativo, lida do snapshot que o trigger grava. O atacante mente o campo de escopo, não o de identidade.',
    // ⚠ Mutar SÓ a primeira conjunção seria INVISÍVEL: nos cenários testados a
    // segunda (a do snapshot real) decide sozinha o resultado certo. É a segunda
    // que tem de cair.
    sql: `alter policy "operador insere" on public.movimentacoes
  with check (
    public.pode_escrever_filial(filial_id)
  );`,
    prova: {
      sql: `select coalesce(with_check, '') like '%snapshot_anterior%'
              from pg_policies
             where schemaname = 'public' and tablename = 'movimentacoes'
               and policyname = 'operador insere'`,
      espera: 'f',
    },
    policies: [{ nome: 'operador insere', tabela: 'public.movimentacoes' }],
  },
  {
    id: 'rls-lancamento-de-item-confere-papel-e-esquece-filial',
    roteiro: 'papeis_rls.sql',
    classe: 'papel-sem-escopo',
    derruba: ['2e'],
    porque:
      'A GUARDA CONFERE O PAPEL E ESQUECE O ESCOPO — a quebra cross-tenant clássica, e o ensaio geral da F66. Troca `pode_escrever_filial(filial_id)` por `pode_escrever()` na escrita de lançamentos: o operador vinculado a uma filial passa a lançar item em qualquer outra.',
    sql: `alter policy "operador lanca" on public.lancamentos_item
  with check (
    public.pode_escrever()
    and public.estorno_item_coerente(estorna_id, filial_id, item_id)
  );`,
    prova: {
      sql: `select coalesce(with_check, '') like '%pode_escrever_filial%'
              from pg_policies
             where schemaname = 'public' and tablename = 'lancamentos_item'
               and policyname = 'operador lanca'`,
      espera: 'f',
    },
    policies: [{ nome: 'operador lanca', tabela: 'public.lancamentos_item' }],
  },
  {
    id: 'rls-edicao-de-ativo-confere-papel-e-esquece-filial',
    roteiro: 'papeis_rls.sql',
    classe: 'papel-sem-escopo',
    derruba: ['2g'],
    porque:
      'A MESMA classe da anterior, no UPDATE de `ativos`: cargo certo, filial ignorada. Duas instâncias de propósito — é a família de defeito que a virada multiempresa mais vai encostar.',
    sql: `alter policy "operador atualiza" on public.ativos
  using      (public.pode_escrever())
  with check (public.pode_escrever());`,
    prova: {
      sql: `select (coalesce(qual, '') || coalesce(with_check, '')) like '%pode_escrever_filial%'
              from pg_policies
             where schemaname = 'public' and tablename = 'ativos'
               and policyname = 'operador atualiza'`,
      espera: 'f',
    },
    policies: [{ nome: 'operador atualiza', tabela: 'public.ativos' }],
  },
  {
    id: 'rls-piso-de-leitura-aberto-em-ativos',
    roteiro: 'papeis_rls.sql',
    classe: 'piso-de-leitura',
    derruba: ['4d'],
    porque:
      'O piso de leitura da 0070 (`papel_atual() is not null`) afrouxado para `true`: um perfil DESATIVADO volta a ler o acervo inteiro enquanto o token dele não expira. É a revogação imediata deixando de valer para leitura.',
    sql: `alter policy "leitura operador" on public.ativos using (true);`,
    prova: {
      sql: `select coalesce(qual, '') like '%papel_atual%'
              from pg_policies
             where schemaname = 'public' and tablename = 'ativos'
               and policyname = 'leitura operador'`,
      espera: 'f',
    },
    policies: [{ nome: 'leitura operador', tabela: 'public.ativos' }],
  },
  {
    id: 'rls-desligada-em-senhas-de-acesso',
    roteiro: 'papeis_rls.sql',
    classe: 'rls-desligada',
    derruba: ['3d', '5f'],
    porque:
      'RLS DESLIGADA NUMA TABELA. `senhas_acesso` é deny-all por AUSÊNCIA de policy desde a 0012 — não há policy para afrouxar, então o único jeito de reabrir é desligar a RLS. O hash da senha de visualização fica legível para qualquer logado.',
    sql: `alter table public.senhas_acesso disable row level security;`,
    prova: {
      sql: `select relrowsecurity from pg_class where oid = 'public.senhas_acesso'::regclass`,
      espera: 'f',
    },
  },
  {
    id: 'rls-auditoria-visivel-a-quem-escreve',
    roteiro: 'papeis_rls.sql',
    classe: 'nivel-admin-afrouxado',
    derruba: ['3f'],
    porque:
      'Troca `e_admin()` por `pode_escrever()` na LEITURA da trilha de auditoria: o operador passa a ver quem promoveu e quem revogou quem. Classe sorrateira — AMPLIA acesso sem quebrar nenhum cenário "o admin consegue".',
    sql: `alter policy "admin le auditoria" on public.eventos_admin
  using ((select public.pode_escrever()));`,
    prova: {
      sql: `select coalesce(qual, '') like '%e_admin%'
              from pg_policies
             where schemaname = 'public' and tablename = 'eventos_admin'
               and policyname = 'admin le auditoria'`,
      espera: 'f',
    },
    policies: [{ nome: 'admin le auditoria', tabela: 'public.eventos_admin' }],
  },
  {
    id: 'rls-trilha-do-import-visivel-a-quem-escreve',
    roteiro: 'papeis_rls.sql',
    classe: 'nivel-admin-afrouxado',
    derruba: ['3e'],
    porque:
      'A mesma classe em `import_logs`: o operador passa a ver o histórico do import destrutivo, inclusive o caminho do backup no bucket.',
    sql: `alter policy "leitura operador" on public.import_logs
  using ((select public.pode_escrever()));`,
    prova: {
      sql: `select coalesce(qual, '') like '%e_admin%'
              from pg_policies
             where schemaname = 'public' and tablename = 'import_logs'
               and policyname = 'leitura operador'`,
      espera: 'f',
    },
    policies: [{ nome: 'leitura operador', tabela: 'public.import_logs' }],
  },
  {
    id: 'rls-bucket-de-backup-visivel-a-quem-escreve',
    roteiro: 'papeis_rls.sql',
    classe: 'nivel-admin-afrouxado',
    derruba: ['6e'],
    porque:
      'A mesma classe atravessando para o STORAGE: o operador passa a listar os backups de acervo do import destrutivo de qualquer filial. Prova que o padrão sintático "nível-admin vira nível-escreve" atravessa tabela E bucket.',
    sql: `alter policy "backups-import leitura operador" on storage.objects
  using (bucket_id = 'backups-import' and (select public.pode_escrever()));`,
    prova: {
      sql: `select coalesce(qual, '') like '%e_admin%'
              from pg_policies
             where schemaname = 'storage' and tablename = 'objects'
               and policyname = 'backups-import leitura operador'`,
      espera: 'f',
    },
    policies: [{ nome: 'backups-import leitura operador', tabela: 'storage.objects' }],
  },
  {
    id: 'rls-termo-perde-as-invariantes-da-ancora',
    roteiro: 'papeis_rls.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2i-bis-3'],
    porque:
      'A 0069 parcialmente revertida: sobra o gate de FILIAL do termo e somem as duas invariantes que tornam `ativo_ids` não-forjável. O operador queima a vaga única citando movimentação de filial alheia e declarando ativo da própria — a filial vizinha nunca mais gera aquele termo.',
    // ⚠ AS DUAS CONJUNÇÕES SAEM JUNTAS, E ISSO É UM ACHADO, NÃO UMA ESCOLHA.
    // Medido no primeiro ciclo de CI (run 34074319187): neutralizar SÓ
    // `termo_ancora_coerente` NÃO derruba 2i-bis-3 — o INSERT do cenário usa
    // `arquivo_path = 'forjado.docx'` com um `id` sorteado, então a invariante
    // `arquivo_path = id::text || '.docx'` já o recusa sozinha. E remover só a
    // invariante do path também não derruba: a âncora barra. O cenário prova a
    // CONJUNÇÃO, não a âncora — apesar de a mensagem de ✓ dele dizer "a âncora está
    // no ar".
    //
    // ⚠ EMENDA F48 (07/09/2026): o cenário 2i-bis-3 foi FORTALECIDO — o INSERT passou a
    // usar `arquivo_path = <id>::text || '.docx'`, coerente, de modo que a âncora seja a
    // ÚNICA barreira restante. Com isso a mutação isolada saiu da quarentena e virou
    // `ancora-do-termo-sempre-coerente`, logo abaixo. Esta continua no lote por medir
    // outra coisa: a reversão PARCIAL da 0069, com as duas invariantes saindo juntas.
    sql: `alter policy "operador insere" on public.termos_gerados
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
  );`,
    prova: {
      sql: `select coalesce(with_check, '') like '%termo_ancora_coerente%'
              from pg_policies
             where schemaname = 'public' and tablename = 'termos_gerados'
               and policyname = 'operador insere'`,
      espera: 'f',
    },
    policies: [{ nome: 'operador insere', tabela: 'public.termos_gerados' }],
  },
  // ---------------------------------------------------------------------------
  // F48 (07/09/2026) — DUAS PROMOVIDAS DA QUARENTENA DA F47.
  //
  // As duas ficaram na quarentena da F47 com a fase F48 escrita ao lado, e o motivo era
  // o MESMO nos dois casos: o cenário que deveria acusá-las passava sobre conjunto
  // vazio. A F48 fortaleceu os cenários — que é conserto de ROTEIRO, não de policy — e
  // por isso elas voltam ao lote ativo. O que prova que a frente 6 funcionou não é o
  // diff: é o injetor, aqui, no CI.
  // ---------------------------------------------------------------------------
  {
    id: 'ancora-do-termo-sempre-coerente',
    roteiro: 'papeis_rls.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2i-bis-3'],
    porque:
      '`termo_ancora_coerente` passa a devolver sempre `true`: `ativo_ids` volta a ser forjável, e é sobre ele que a autorização por filial decide. O operador queima a vaga única do termo da filial vizinha citando as movimentações dela e declarando ativo da própria.',
    // ⚠ POR QUE ELA SÓ FUNCIONA AGORA. Medida INDETECTÁVEL na F47 (run 34074319187): a
    // mutação aplicou, a sonda confirmou que pegou, e o cenário continuou VERDE, porque
    // o INSERT usava `arquivo_path = 'forjado.docx'` e a QUARTA conjunção da policy
    // (`arquivo_path = id::text || '.docx'`) já o recusava antes de a âncora importar.
    // A F48 deu ao ataque um `arquivo_path` coerente; agora a âncora é a única barreira
    // restante, e neutralizá-la derruba o cenário de verdade.
    sql: `create or replace function public.termo_ancora_coerente(
  p_movimentacao_ids uuid[], p_ativo_ids uuid[]
) returns boolean language sql stable security definer set search_path = public
as $$ select true $$;`,
    prova: {
      sql: `select pg_get_functiondef('public.termo_ancora_coerente(uuid[], uuid[])'::regprocedure)
              like '%select true%'`,
      espera: 't',
    },
  },
  {
    id: 'leitura-de-colaboradores-sem-piso',
    roteiro: 'papeis_rls.sql',
    classe: 'rls-desligada',
    derruba: ['4i'],
    porque:
      'Desligar a RLS de `colaboradores` expõe o cadastro de PESSOAS a perfil desativado — o mesmo piso de leitura da 0070 que a mutação de `ativos` exercita, sobre a tabela que guarda nome, setor e filial de quem recebe equipamento.',
    // ⚠ `derruba` é SÓ `4i`, e não `1j` — a distinção foi medida, não suposta. Com a RLS
    // desligada, o cargo `consulta` ATIVO continua vendo as duas linhas plantadas, então
    // `1j` (o lado POSITIVO do gate) não distingue e continua verde. Quem distingue é o
    // desativado: `4i`. Declarar `1j` aqui seria afirmar mais do que a mutação prova —
    // exatamente o defeito que a F47 encontrou no ✓ do 2i-bis-3.
    sql: `alter table public.colaboradores disable row level security;`,
    prova: {
      sql: `select relrowsecurity from pg_class where oid = 'public.colaboradores'::regclass`,
      espera: 'f',
    },
  },
]

// =============================================================================
// seguranca_catalogo.sql — RLS, security_invoker e grants, lidos do catálogo
// =============================================================================
// Este roteiro NÃO tem `begin; … rollback;` — é só leitura de pg_class/pg_proc/ACL.
// É o único lugar do rig que enxerga GRANT para `anon`.
/** @type {Mutacao[]} */
const SEGURANCA_CATALOGO = [
  {
    id: 'catalogo-rls-desligada-numa-tabela',
    roteiro: 'seguranca_catalogo.sql',
    classe: 'rls-desligada',
    derruba: ['2'],
    porque:
      'Imita a migration que cria (ou altera) uma tabela em `public` e esquece o `enable row level security` — a falha de revisão de migration mais comum que existe.',
    sql: `alter table public.motivos disable row level security;`,
    prova: {
      sql: `select relrowsecurity from pg_class where oid = 'public.motivos'::regclass`,
      espera: 'f',
    },
  },
  {
    id: 'catalogo-tabela-de-backup-sem-rls',
    roteiro: 'seguranca_catalogo.sql',
    classe: 'rls-desligada',
    derruba: ['2'],
    porque:
      'Uma tabela de rascunho/backup nasce com prefixo `_` e sem RLS — o padrão EXATO das quatro que já existiram (`_f8_backup_matriz_compras`, `_f7k_backup_modelo`, `_f18_backup_pendencia` e a `_bkp_relatorios_gerados_f6a`, que a 0128 adotou). É a prova viva de que a isenção por prefixo removida nesta fase fazia diferença: até a F47 esta mutação era INVISÍVEL para os 25 roteiros.',
    sql: `create table public._sabotagem_f47_sem_rls (x int);`,
    prova: {
      sql: `select relrowsecurity from pg_class
             where oid = 'public._sabotagem_f47_sem_rls'::regclass`,
      espera: 'f',
    },
  },
  {
    id: 'catalogo-view-sem-security-invoker',
    roteiro: 'seguranca_catalogo.sql',
    classe: 'view-fura-rls',
    derruba: ['3'],
    porque:
      'Imita recriar uma view sem `with (security_invoker = true)`: ela volta a rodar com o privilégio do DONO e fura a RLS de todas as tabelas de base.',
    sql: `alter view public.v_estoque_atual set (security_invoker = false);`,
    prova: {
      sql: `select coalesce(array_to_string(reloptions, ','), '') like '%security_invoker=true%'
              from pg_class where oid = 'public.v_estoque_atual'::regclass`,
      espera: 'f',
    },
  },
  {
    id: 'catalogo-funcao-gatilho-executavel-por-authenticated',
    roteiro: 'seguranca_catalogo.sql',
    classe: 'grant-devolvido',
    derruba: ['4'],
    porque:
      'Imita a 0038 sendo desfeita sem querer: uma função-gatilho SECURITY DEFINER volta a ser chamável como RPC por `/rest/v1/rpc/*` com a chave pública.',
    sql: `grant execute on function public.aplicar_movimentacao() to authenticated;`,
    prova: {
      sql: `select has_function_privilege('authenticated', 'public.aplicar_movimentacao()'::regprocedure, 'execute')`,
      espera: 't',
    },
  },
  {
    id: 'catalogo-gatilho-de-lancamento-vira-definer',
    roteiro: 'seguranca_catalogo.sql',
    classe: 'guarda-neutralizada',
    derruba: ['4c'],
    porque:
      'Imita alguém marcar `valida_lancamento_item` como SECURITY DEFINER "por segurança", sem perceber que é justamente o `prosecdef = false` que torna inofensivo o EXECUTE que a 0038 deixou de propósito.',
    sql: `alter function public.valida_lancamento_item() security definer;`,
    prova: {
      sql: `select prosecdef from pg_proc where oid = 'public.valida_lancamento_item()'::regprocedure`,
      espera: 't',
    },
  },
  {
    id: 'catalogo-rpc-de-escrita-executavel-por-anon',
    roteiro: 'seguranca_catalogo.sql',
    classe: 'grant-devolvido',
    derruba: ['1'],
    porque:
      'Imita o fix da 0055 sendo desfeito: uma RPC de ESCRITA volta a ser executável pela chave anônima, sem sessão nenhuma.',
    sql: `grant execute on function public.criar_compra_lote(jsonb, uuid) to anon;`,
    prova: {
      sql: `select has_function_privilege('anon', 'public.criar_compra_lote(jsonb, uuid)'::regprocedure, 'execute')`,
      espera: 't',
    },
  },
]

// =============================================================================
// cargo_dev.sql — a hierarquia dev ⊃ admin ⊃ operador ⊃ consulta
// =============================================================================
/** @type {Mutacao[]} */
const CARGO_DEV = [
  {
    id: 'dev-guarda-de-gestao-aceita-nivel-admin',
    roteiro: 'cargo_dev.sql',
    classe: 'e-dev-virou-e-admin',
    derruba: ['2a', '2b', '2c', '2e'],
    porque:
      'Enfraquece a GUARDA COMUM das cinco RPCs de gestão: quando a ação toca um dev, ela passa a aceitar nível administrador. É o núcleo da hierarquia — um admin comum promove, rebaixa, desativa e revincula um desenvolvedor.',
    sql: mutarFuncao(
      'public.exigir_gestao_de(uuid, public.papel_usuario)',
      `    if not public.e_dev() then
      raise exception 'Só um desenvolvedor pode gerir o cargo Desenvolvedor.'`,
      `    if not public.e_admin() then  ${MARCA}
      raise exception 'Só um desenvolvedor pode gerir o cargo Desenvolvedor.'`,
      'dev-guarda-de-gestao-aceita-nivel-admin',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.exigir_gestao_de(uuid, public.papel_usuario)'::regprocedure)
              like '%if not public.e_admin() then  --%'`,
      espera: 't',
    },
  },
  {
    id: 'dev-apagar-conta-aceita-nivel-admin',
    roteiro: 'cargo_dev.sql',
    classe: 'e-dev-virou-e-admin',
    derruba: ['2f-bis'],
    porque:
      'A checagem PRÓPRIA de `apagar_usuario` — a que protege o caso em que o alvo NÃO é dev — passa a aceitar nível administrador. A guarda comum não cobre esse caso, e é exatamente por isso que a checagem própria existe.',
    sql: mutarFuncao(
      'public.apagar_usuario(uuid)',
      `  if not public.e_dev() then
    raise exception 'Só um desenvolvedor pode apagar uma conta de usuário.'`,
      `  if not public.e_admin() then  ${MARCA}
    raise exception 'Só um desenvolvedor pode apagar uma conta de usuário.'`,
      'dev-apagar-conta-aceita-nivel-admin',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.apagar_usuario(uuid)'::regprocedure)
              like '%e_admin() then  --%'`,
      espera: 't',
    },
  },
  {
    id: 'dev-encerrar-sessoes-aceita-nivel-admin',
    roteiro: 'cargo_dev.sql',
    classe: 'e-dev-virou-e-admin',
    derruba: ['2f'],
    porque:
      'A mesma classe na ação mais barulhenta: derrubar as sessões de alguém passa a bastar nível administrador. Igual à anterior, o alvo comum é o caso que só a checagem própria protege.',
    sql: mutarFuncao(
      'public.encerrar_sessoes_usuario(uuid)',
      `  if not public.e_dev() then
    raise exception 'Só um desenvolvedor pode encerrar as sessões de um usuário.'`,
      `  if not public.e_admin() then  ${MARCA}
    raise exception 'Só um desenvolvedor pode encerrar as sessões de um usuário.'`,
      'dev-encerrar-sessoes-aceita-nivel-admin',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.encerrar_sessoes_usuario(uuid)'::regprocedure)
              like '%e_admin() then  --%'`,
      espera: 't',
    },
  },
  {
    id: 'dev-trigger-deixa-conceder-cargo-por-update-direto',
    roteiro: 'cargo_dev.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2h'],
    porque:
      'Tira do trigger o ramo que barra PROMOVER alguém a desenvolvedor por UPDATE direto. É o caminho do service role, que a RLS não alcança — a trava tem de morar no trigger, e é essa metade que some.',
    sql: mutarFuncao(
      'public.profiles_guarda_dev()',
      `  if new.papel = 'dev' and old.papel is distinct from new.papel then
    raise exception 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.'
      using errcode = '42501';
  end if;`,
      `  ${MARCA}`,
      'dev-trigger-deixa-conceder-cargo-por-update-direto',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.profiles_guarda_dev()'::regprocedure)
              like '%old.papel is distinct from new.papel then%'`,
      espera: 'f',
    },
  },
  {
    id: 'dev-auxiliar-de-gestao-executavel-por-authenticated',
    roteiro: 'cargo_dev.sql',
    classe: 'grant-devolvido',
    derruba: ['5e'],
    porque:
      'Um GRANT distraído devolve a `authenticated` uma auxiliar interna que a 0078 tirou da API pública de propósito — ela é chamada só de DENTRO das RPCs de gestão.',
    sql: `grant execute on function public.existe_outro_admin_ativo(uuid) to authenticated;`,
    prova: {
      sql: `select has_function_privilege('authenticated', 'public.existe_outro_admin_ativo(uuid)'::regprocedure, 'execute')`,
      espera: 't',
    },
  },
  // ---------------------------------------------------------------------------
  // F48 (07/09/2026) — a TERCEIRA promovida da quarentena da F47.
  // ---------------------------------------------------------------------------
  {
    id: 'gestao-encerrar-sessoes-mira-o-alvo-errado',
    roteiro: 'cargo_dev.sql',
    classe: 'alvo-trocado',
    derruba: ['3d'],
    porque:
      'O `delete from auth.sessions` de `encerrar_sessoes_usuario` passa a mirar `auth.uid()` em vez de `p_alvo`: o dev que tenta derrubar a sessão de OUTRA pessoa derruba a própria, e a RPC devolve sucesso do mesmo jeito. É a classe de defeito mais silenciosa que existe — a autorização está certa, o alvo é que não.',
    // ⚠ POR QUE ELA SÓ FUNCIONA AGORA. Na F47 o cenário 3d aceitava "0 sessões removidas"
    // como sucesso: num banco novo `auth.sessions` nasce VAZIA, e ele só conferia que não
    // houve exceção. A F48 plantou o universo (2 sessões do alvo + 1 de uma testemunha) e
    // passou a exigir as DUAS metades — as do alvo somem, a da testemunha fica. Com o
    // alvo trocado, a RPC devolve 0, as 2 do alvo continuam lá e o cenário acusa.
    sql: mutarFuncao(
      'public.encerrar_sessoes_usuario(uuid)',
      '  delete from auth.sessions where user_id = p_alvo;',
      `  delete from auth.sessions where user_id = auth.uid();  ${MARCA}`,
      'gestao-encerrar-sessoes-mira-o-alvo-errado',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.encerrar_sessoes_usuario(uuid)'::regprocedure)
              like '%where user_id = auth.uid();  --%'`,
      espera: 't',
    },
  },
]

// =============================================================================
// dev_destrutivo.sql — as ferramentas que apagam, e as guardas delas
// =============================================================================
// ⚠ Os cenários 2a..2h rodam como `authenticated` e são barrados pela AUSÊNCIA de
// policy ANTES de o trigger ser consultado. Quem exercita `guarda_acervo` de
// verdade é o DONO (2i..2p) — e o INSERT (2f/2n), o único verbo em que a guarda
// é a barreira nos dois papéis.
/** @type {Mutacao[]} */
const DEV_DESTRUTIVO = [
  {
    id: 'destrutivo-justificativa-sem-tamanho-minimo',
    roteiro: 'dev_destrutivo.sql',
    classe: 'guarda-neutralizada',
    derruba: ['12b', '12e'],
    porque:
      'Tira a régua de 10 caracteres da justificativa compartilhada por todas as ferramentas destrutivas: passa-se a apagar acervo sem explicar por quê, e a justificativa é o que sobra depois que o dado morre.',
    sql: mutarFuncao(
      'public.exigir_dev_para_destruir(text)',
      `  -- A justificativa é o que sobra depois que o dado morre. Vazia, ela não é justificativa.
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;`,
      `  ${MARCA}`,
      'destrutivo-justificativa-sem-tamanho-minimo',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.exigir_dev_para_destruir(text)'::regprocedure) like '%< 10 then%'`,
      espera: 'f',
    },
  },
  {
    id: 'destrutivo-guarda-do-acervo-aceita-update',
    roteiro: 'dev_destrutivo.sql',
    classe: 'imutabilidade-afrouxada',
    derruba: ['2i', '2k'],
    porque:
      'Afrouxa o ramo UPDATE do trigger de imutabilidade: o DONO (e o service role com ele) volta a editar movimentação e lançamento por escrita direta, que é exatamente o buraco que a 0081 fechou.',
    sql: mutarFuncao(
      'public.guarda_acervo()',
      `  if tg_op = 'UPDATE' then
    raise exception 'Registro histórico não se altera: % é imutável. Para desfazer um efeito, registre um estorno; correção técnica é pela área do desenvolvedor.', tg_table_name
      using errcode = '42501';
  end if;`,
      `  if tg_op = 'UPDATE' then
    return new;  ${MARCA}
  end if;`,
      'destrutivo-guarda-do-acervo-aceita-update',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.guarda_acervo()'::regprocedure) like '%é imutável%'`,
      espera: 'f',
    },
  },
  {
    id: 'destrutivo-guarda-do-acervo-aceita-delete',
    roteiro: 'dev_destrutivo.sql',
    classe: 'imutabilidade-afrouxada',
    derruba: ['2j', '2l', '2m', '13c'],
    porque:
      'Afrouxa o ramo DELETE do mesmo trigger — o cenário mais grave do desenho: o acervo some por fora de qualquer ferramenta, sem confirmação, sem justificativa e sem trilha.',
    sql: mutarFuncao(
      'public.guarda_acervo()',
      `  -- DELETE
  raise exception 'Registro histórico não se remove por este caminho (%). As ferramentas de exclusão da área do desenvolvedor são o único caminho, e elas exigem confirmação, justificativa e deixam trilha.', tg_table_name
    using errcode = '42501';`,
      `  -- DELETE  ${MARCA}
  return old;`,
      'destrutivo-guarda-do-acervo-aceita-delete',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.guarda_acervo()'::regprocedure) like '%não se remove por este caminho%'`,
      espera: 'f',
    },
  },
  {
    id: 'destrutivo-marca-de-forcado-gravavel-por-qualquer-caminho',
    roteiro: 'dev_destrutivo.sql',
    classe: 'imutabilidade-afrouxada',
    derruba: ['2f', '2n'],
    porque:
      'A marca de "forçado" deixa de ser exclusiva das ferramentas do desenvolvedor: um INSERT comum passa a se autorrotular correção técnica. É o único verbo em que o trigger é a barreira nos DOIS papéis.',
    sql: mutarFuncao(
      'public.guarda_acervo()',
      `    if coalesce((to_jsonb(new) ->> 'forcado')::boolean, false) then`,
      `    if false then  ${MARCA}`,
      'destrutivo-marca-de-forcado-gravavel-por-qualquer-caminho',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.guarda_acervo()'::regprocedure) like '%if false then  --%'`,
      espera: 't',
    },
  },
]

// =============================================================================
// import_substituir.sql — o import de startup, que APAGA a filial antes de gravar
// =============================================================================
// ⚠ AS DUAS PRIMEIRAS FORAM REAPONTADAS NA F51 (08/09/2026), e o motivo é o que
// esta família toda existe para provar. Até a 0130, `importar_ativos_substituir`
// era uma função de 393 linhas com TODAS as guardas no próprio corpo. A 0131 a
// decompôs numa orquestradora sobre oito auxiliares, e os dois trechos que estas
// mutações afrouxam MUDARAM DE FUNÇÃO: a guarda de backup foi para
// `import_validar_plano` e a revalidação de contagens para
// `import_revalidar_contagens`.
//
// Reapontar não foi opcional nem adiável. `mutarFuncao()` chama `corpoVigente()`
// no CORPO DO MÓDULO — não é lazy. No instante em que a 0131 moveu os trechos,
// `trocarNoCorpo` passaria a lançar no `import` deste arquivo, derrubando o
// carregamento INTEIRO do catálogo: `mutacoes.test.mts` e
// `npm run db:test:mutations` parariam de rodar por completo, não só as duas do
// import. É o "falhar ALTO" que o cabeçalho de `corpo-vigente.mjs` promete, e o
// raio dele é o lote todo — por isso migration e reapontamento vão no MESMO
// commit.
//
// As SEIS seguintes são novas: uma por auxiliar cuja quebra derruba um rótulo.
// Três delas (conferir/contar/gravar) só têm o que derrubar por causa da SEÇÃO 0
// do roteiro — no caminho feliz do import essas três nunca lançam nem são lidas,
// e sem cenário próprio a mutação sairia "não detectada" por CONJUNTO VAZIO, que
// é o diagnóstico errado: acusaria de fraca uma asserção que nem existia.
/** @type {Mutacao[]} */
const IMPORT_SUBSTITUIR = [
  {
    id: 'import-sem-revalidacao-de-contagens',
    roteiro: 'import_substituir.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2'],
    porque:
      'Reabre o TOCTOU que a 0040 fechou: uma chamada forjada sem as contagens volta a pular por inteiro a revalidação do estado vivo — o acervo da filial é apagado sobre uma foto velha da tela.',
    // ⚠ ELA SAI PELA PORTA (`return`), não afrouxa a condição — e a diferença foi
    // MEDIDA no CI da F51 (run 34243304117), não deduzida. A forma antiga trocava
    // a condição por `if false then`, e isso funcionava enquanto a 0094 tinha,
    // logo abaixo do raise, o resíduo do item N (`if p_contagens is not null and
    // jsonb_typeof(…) = 'object' then`) envolvendo o bloco inteiro: com
    // `p_contagens` nulo, aquele segundo `if` também era falso e a revalidação
    // sumia por completo. A 0131 removeu o resíduo — ele era código MORTO, sempre
    // verdadeiro no ponto em que era avaliado —, e sem ele a mesma troca deixa o
    // corpo seguir com os sentinelas `-1` do `coalesce`, que NÃO batem com o vivo
    // e levantam a exceção de "estado mudou desde o preview". O roteiro via a RPC
    // recusar, marcava ✓, e a mutação saía "NÃO detectada" — a asserção estava
    // certa, a quebra é que não quebrava nada.
    sql: mutarFuncao(
      'public.import_revalidar_contagens(jsonb, smallint)',
      `    raise exception 'Revalidação de contagens obrigatória: gere o preview novamente antes de aplicar (p_contagens ausente ou inválido).';`,
      `    return;  ${MARCA}`,
      'import-sem-revalidacao-de-contagens',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_revalidar_contagens(jsonb, smallint)'::regprocedure)
              like '%2b. revalidação%return;  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-revalidacao-nao-compara-o-vivo',
    roteiro: 'import_substituir.sql',
    classe: 'guarda-neutralizada',
    derruba: ['0b'],
    porque:
      'A OUTRA metade do TOCTOU: as contagens chegam, mas ninguém as compara com o estado real da filial. O preview pode ter sido gerado ontem, alguém pode ter cadastrado dez ativos desde então, e o import apaga tudo assim mesmo — a guarda vira ritual.',
    // A primeira mutação prova que a RECUSA existe; esta prova que a COMPARAÇÃO
    // existe. Separá-las é o que impede uma metade de passar de carona na outra.
    sql: mutarFuncao(
      'public.import_revalidar_contagens(jsonb, smallint)',
      `  if v_conferidos <> v_esp_ativos or v_liv_movs <> v_esp_movs
     or v_liv_anot <> v_esp_anot or v_liv_termos <> v_esp_termos then`,
      `  if false then  ${MARCA}`,
      'import-revalidacao-nao-compara-o-vivo',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_revalidar_contagens(jsonb, smallint)'::regprocedure)
              like '%if false then  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-sem-exigencia-de-backup',
    roteiro: 'import_substituir.sql',
    classe: 'guarda-neutralizada',
    derruba: ['3'],
    porque:
      'O import destrutivo passa a aceitar chamada sem caminho de backup: o acervo da filial é apagado sem que nada tenha sido exportado antes. É a rede da operação mais perigosa do sistema saindo em silêncio.',
    sql: mutarFuncao(
      'public.import_validar_plano(jsonb, text, jsonb, smallint)',
      `  if coalesce(btrim(p_backup_path), '') = '' then`,
      `  if false then  ${MARCA}`,
      'import-sem-exigencia-de-backup',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_validar_plano(jsonb, text, jsonb, smallint)'::regprocedure)
              like '%1b. backup obrigatório%if false then  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-trilha-do-apagado-mente-nas-anotacoes',
    roteiro: 'import_substituir.sql',
    classe: 'contagem-mentida',
    derruba: ['0g'],
    porque:
      'A contagem de anotações destruídas volta zerada. O número que o operador vê ao fim do import, e o que fica gravado em import_logs como registro do que a operação apagou, param de descrever o que aconteceu de verdade — numa operação cujo único registro do estrago é esse.',
    // ⚠ ELA MENTE A CONTAGEM, não deixa de apagar — e o motivo foi MEDIDO no CI da
    // F51 (run 34243304117). A forma anterior neutralizava o próprio
    // `delete from public.anotacoes`, e o resultado não era "mutação detectada":
    // era o roteiro ABORTANDO. `anotacoes.ativo_id` tem FK para `ativos` (0017:8),
    // então deixar as anotações vivas faz o `delete from public.ativos` seguinte
    // estourar violação de chave estrangeira e derrubar o bloco inteiro antes da
    // linha FIM. O injetor reporta ABORTOU, que é diagnóstico diferente de
    // "detectada" — e mereceria ser, porque nesse caminho o roteiro não chegou a
    // afirmar nada. Mesma armadilha vale para movimentacoes: as três tabelas-filha
    // do acervo são apagadas ANTES de `ativos` justamente por causa dessas FKs.
    sql: mutarFuncao(
      'public.import_apagar_acervo_filial(smallint)',
      `  get diagnostics v_anot_apagadas = row_count;`,
      `  v_anot_apagadas := 0;  ${MARCA}`,
      'import-trilha-do-apagado-mente-nas-anotacoes',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_apagar_acervo_filial(smallint)'::regprocedure)
              like '%v_anot_apagadas := 0;  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-ativo-nasce-sem-origem-importacao',
    roteiro: 'import_substituir.sql',
    classe: 'procedencia-perdida',
    derruba: ['4b'],
    porque:
      'O ativo trazido pela planilha de startup passa a nascer como se tivesse sido cadastrado à mão. A procedência é o que separa o acervo importado do que o operador digitou, e é por ela que se audita um go-live que deu errado.',
    sql: mutarFuncao(
      'public.import_criar_ativos(jsonb, smallint)',
      `    'importacao',`,
      `    'cadastro',  ${MARCA}`,
      'import-ativo-nasce-sem-origem-importacao',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_criar_ativos(jsonb, smallint)'::regprocedure)
              like '%''cadastro'',  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-compra-de-abertura-sem-marcador',
    roteiro: 'import_substituir.sql',
    classe: 'baseline-vira-movimento-real',
    derruba: ['1e', '0h'],
    porque:
      'A compra de abertura perde o marcador "import startup" e deixa de ser baseline: o acervo pré-existente inteiro passa a aparecer como ENTRADA no relatório do mês do go-live. É o defeito que a F8 reverteu à mão depois de a F7H o ter causado.',
    sql: mutarFuncao(
      'public.import_lancar_movimentacoes(uuid, jsonb, smallint, uuid, date, text)',
      `    p_filial, p_obs_marcador, p_uid`,
      `    p_filial, 'compra normal', p_uid  ${MARCA}`,
      'import-compra-de-abertura-sem-marcador',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_lancar_movimentacoes(uuid, jsonb, smallint, uuid, date, text)'::regprocedure)
              like '%''compra normal'', p_uid  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-conferencia-de-estado-cega',
    roteiro: 'import_substituir.sql',
    classe: 'conferencia-neutralizada',
    derruba: ['0f'],
    porque:
      'A conferência pós-insert para de comparar o estado gravado com o estado-alvo do plano. O import passa a jurar que deu certo mesmo quando um ativo ficou em estado diferente do que a planilha mandava — e a transação commita a divergência em vez de recusá-la.',
    sql: mutarFuncao(
      'public.import_conferir_resultado(jsonb, smallint, integer, integer)',
      `      and a.status <> (x->>'estadoAlvo')::public.status_ativo
  ) then`,
      `      and false  ${MARCA}
  ) then`,
      'import-conferencia-de-estado-cega',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_conferir_resultado(jsonb, smallint, integer, integer)'::regprocedure)
              like '%and false  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-contagem-de-conflitos-mentida',
    roteiro: 'import_substituir.sql',
    classe: 'numero-inventado',
    derruba: ['0c'],
    porque:
      'O número de conflitos entre filiais gravado no histórico do import deixa de vir de v_conflitos_filiais — a MESMA fonte que a mesa de /pendencias lê. O histórico e a tela passam a discordar sobre quantas pendências o go-live abriu, que é exatamente o que a F24 desenhou para não poder acontecer.',
    sql: mutarFuncao(
      'public.import_contar_conflitos(smallint)',
      `  select count(*) into v_conflitos
    from public.v_conflitos_filiais c
   where c.filial_id = p_filial;`,
      `  v_conflitos := 99;  ${MARCA}`,
      'import-contagem-de-conflitos-mentida',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_contar_conflitos(smallint)'::regprocedure)
              like '%v_conflitos := 99;  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-auxiliar-destrutiva-vira-api',
    roteiro: 'import_substituir.sql',
    classe: 'superficie-de-rpc-aumentada',
    derruba: ['0e'],
    porque:
      'A auxiliar que APAGA o acervo de uma filial passa a ser chamável pela API: qualquer logado, com a anon key e o próprio JWT, alcança /rest/v1/rpc/import_apagar_acervo_filial e apaga uma filial inteira — sem passar pela guarda de admin, sem backup, sem revalidação de contagens e sem trilha, porque todas essas coisas moram na orquestradora.',
    // ⚠ ESTA É A MUTAÇÃO QUE PROVA QUE `0e` NÃO É TAUTOLOGIA. A asserção conta
    // concessões vivas e espera ZERO — e uma asserção que espera zero é
    // exatamente a que pode estar contando sobre conjunto vazio sem ninguém
    // notar. Aqui a concessão existe de verdade e a contagem tem de sair de zero.
    //
    // É também a quebra mais perigosa do lote: decompor uma `security definer`
    // REORGANIZA a superfície, não a reduz, e o que mantém as oito fora da API é
    // uma linha de `revoke` por função. Um `grant` esquecido numa migration futura
    // é indistinguível deste comando.
    sql: `grant execute on function public.import_apagar_acervo_filial(smallint) to authenticated;  ${MARCA}`,
    prova: {
      sql: `select has_function_privilege('authenticated',
              'public.import_apagar_acervo_filial(smallint)', 'execute')`,
      espera: 't',
    },
  },
  {
    id: 'import-trilha-com-id-perdido',
    roteiro: 'import_substituir.sql',
    classe: 'trilha-ausente',
    derruba: ['0d'],
    porque:
      'O id da linha de import_logs deixa de voltar para quem chamou. O retorno da RPC leva log_id nulo, e a tela que abre o histórico daquele import — com o backup_path, o autor e a contagem do que foi destruído — perde o ponteiro para a trilha da operação mais perigosa do sistema.',
    sql: mutarFuncao(
      'public.import_gravar_trilha(jsonb, smallint, text, jsonb, uuid, integer, integer, integer, integer, integer)',
      `  returning id into v_log_id;`,
      `  returning id into v_log_id;
  v_log_id := null;  ${MARCA}`,
      'import-trilha-com-id-perdido',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_gravar_trilha(jsonb, smallint, text, jsonb, uuid, integer, integer, integer, integer, integer)'::regprocedure)
              like '%v_log_id := null;  --%'`,
      espera: 't',
    },
  },
]

// =============================================================================
// conflito_filiais.sql — a mesa de conflitos entre filiais
// =============================================================================
// A ÚNICA exclusão de ativo que o nível administrador alcança (F24 · 0093→0100).
const RPC_CONFLITO = 'public.apagar_ativos_conflito_filiais(uuid[], text, text, text)'

/** @type {Mutacao[]} */
const CONFLITO_FILIAIS = [
  {
    id: 'conflito-justificativa-sem-tamanho-minimo',
    roteiro: 'conflito_filiais.sql',
    classe: 'guarda-neutralizada',
    derruba: ['5f'],
    porque:
      'A exclusão em massa de cadastros em conflito passa a aceitar justificativa de qualquer tamanho — a mesma classe da régua do destrutivo, na única exclusão de ativo que o nível administrador alcança.',
    sql: mutarFuncao(
      RPC_CONFLITO,
      `  if coalesce(length(btrim(p_justificativa)), 0) < 10 then`,
      `  if false then  ${MARCA}`,
      'conflito-justificativa-sem-tamanho-minimo',
    ),
    prova: {
      sql: `select pg_get_functiondef('${RPC_CONFLITO}'::regprocedure)
              like '%if false then  --%justificativa%'`,
      espera: 't',
    },
  },
  {
    id: 'conflito-confirmacao-com-numero-errado-aceita',
    roteiro: 'conflito_filiais.sql',
    classe: 'guarda-neutralizada',
    derruba: ['5d', '5e'],
    porque:
      'A confirmação digitada deixa de ser conferida: some a exigência de escrever `APAGAR <N>` com a quantidade certa. É a única exclusão de ativo que o nível administrador alcança, e a quantidade no texto é o que faz a pessoa ler o que vai apagar.',
    sql: mutarFuncao(
      RPC_CONFLITO,
      `  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then`,
      `  if false then  ${MARCA}`,
      'conflito-confirmacao-com-numero-errado-aceita',
    ),
    prova: {
      sql: `select pg_get_functiondef('${RPC_CONFLITO}'::regprocedure)
              like '%if false then  --%confere%'`,
      espera: 't',
    },
  },
]

/**
 * O LOTE ATIVO — as mutações que o injetor roda e que TÊM de ser detectadas.
 * Qualquer uma não detectada reprova `npm run db:test:mutations`.
 */
/** @type {Mutacao[]} */
// =============================================================================
// catalogo_policies.sql e catalogo_secdef.sql — as superfícies que a F48 enumerou
// =============================================================================
// ⚠ POR QUE ESTAS OITO SÃO MUTAÇÃO PERMANENTE, E NÃO UMA SABOTAGEM DE UMA VEZ SÓ.
//
// A ordem da F48 exige provar, com saída real, que cada catálogo novo sabe ficar
// vermelho: tabela sem RLS, policy `using (true)`, `security definer` não classificada,
// `search_path` solto, EXECUTE de `anon`, tabela nova na publication, policy de Storage
// que decide só por `bucket_id`. A mesa não tem Postgres, então a única forma honesta de
// provar isso é o injetor — e uma vez escritas AQUI, as provas deixam de ser um log de
// uma tarde e passam a rodar a cada push, incondicionalmente, como required check.
//
// É a mesma lógica que fez a F47 transformar a tabela `_` sem RLS numa mutação
// permanente (§6.6 do relatório dela) em vez de num print.
//
// ⚠ A EXECUÇÃO DE CONTROLE do injetor roda ANTES de qualquer mutação e exige os dois
// roteiros VERDES. Uma destas entradas "ser detectada" por um catálogo que já estivesse
// vermelho é estruturalmente impossível — o motor aborta antes de mutar.
/** @type {Mutacao[]} */
const CATALOGOS_F48 = [
  {
    id: 'catalogo-tabela-nova-nao-classificada',
    roteiro: 'catalogo_policies.sql',
    classe: 'catalogo-nao-enumerado',
    derruba: ['1a', '3'],
    porque:
      'Uma tabela nasce em `public` e ninguém decide se ela é de NEGÓCIO ou de INFRA. É o caminho por onde uma tabela entraria no sistema sem nunca passar pela pergunta "esta precisa da chave de recorte?" — a pergunta que a virada multiempresa inteira depende de alguém ter respondido.',
    // Derruba DUAS: `1a` (não classificada) e `3` (sem policy de SELECT e fora da lista
    // nominal de deny-all). As duas juntas são o desenho: classificar não basta, e ter
    // policy não basta — a tabela nova tem de passar pelas duas perguntas.
    sql: `create table public._sabotagem_f48_nao_classificada (x int);`,
    prova: {
      sql: `select to_regclass('public._sabotagem_f48_nao_classificada') is not null`,
      espera: 't',
    },
  },
  {
    id: 'catalogo-policy-volta-a-ser-sempre-verdadeira',
    roteiro: 'catalogo_policies.sql',
    classe: 'predicado-sempre-verdadeiro',
    derruba: ['5', '6a'],
    porque:
      'Uma policy de leitura volta a `using (true)` — o modelo de nível único que as 0059→0107 desmontaram policy por policy. Com uma empresa isso já apaga o piso de perfil ATIVO da 0070; com duas, é o vazamento entre inquilinos na forma mais direta que existe.',
    sql: `alter policy "leitura operador" on public.motivos using (true);`,
    prova: {
      sql: `select coalesce(qual, '') = 'true' from pg_policies
             where schemaname = 'public' and tablename = 'motivos'
               and policyname = 'leitura operador'`,
      espera: 't',
    },
    policies: [{ nome: 'leitura operador', tabela: 'public.motivos' }],
  },
  {
    id: 'catalogo-force-row-level-security-ligado',
    roteiro: 'catalogo_policies.sql',
    classe: 'guarda-neutralizada',
    derruba: ['4-bis'],
    porque:
      'R-ACC-29 desobedecida: `force row level security` faz a RLS valer também para o DONO, e o sistema conta com o contrário em dois lugares independentes — a recursão de `papel_atual()` em `profiles` (42P17 em toda leitura, para todo mundo) e as escritas fora de policy de `aplicar_movimentacao` e do gatilho da 0051. A regra existia desde a 0070 e NENHUMA asserção conferia se estava sendo cumprida.',
    sql: `alter table public.motivos force row level security;`,
    prova: {
      sql: `select relforcerowsecurity from pg_class where oid = 'public.motivos'::regclass`,
      espera: 't',
    },
  },
  {
    id: 'catalogo-tabela-nova-na-publication-do-realtime',
    roteiro: 'catalogo_policies.sql',
    classe: 'superficie-nao-enumerada',
    derruba: ['9a'],
    porque:
      'Uma tabela entra na publication `supabase_realtime` e passa a empurrar cada linha alterada para quem estiver inscrito. Era a única superfície de LEITURA sem inventário nenhum no repositório — nem no tripwire do viewer, nem em papeis_rls.sql —, e na virada multiempresa é um canal direto entre inquilinos.',
    sql: `alter publication supabase_realtime add table public.ativos;`,
    prova: {
      sql: `select exists (select 1 from pg_publication_tables
                            where pubname = 'supabase_realtime'
                              and schemaname = 'public' and tablename = 'ativos')`,
      espera: 't',
    },
  },
  {
    id: 'catalogo-storage-decide-so-por-bucket',
    roteiro: 'catalogo_policies.sql',
    classe: 'predicado-sem-acesso',
    derruba: ['7'],
    porque:
      'A policy de leitura do bucket `termos` volta a decidir SÓ por `bucket_id`. Não é hipótese: é o predicado que a 0070 encontrou no ar e substituiu, e a reversão dele está escrita na própria migration (0070:137). O furo que ele deixava está em 0070:202-207 — quem foi DESATIVADO continuava conseguindo `createSignedUrl` de qualquer .docx enquanto o token vivia, e o .docx traz nome do colaborador, setor e patrimônios.',
    sql: `alter policy "termos leitura operador" on storage.objects
  using (bucket_id = 'termos');`,
    prova: {
      sql: `select coalesce(qual, '') not ilike '%papel_atual%' from pg_policies
             where schemaname = 'storage' and tablename = 'objects'
               and policyname = 'termos leitura operador'`,
      espera: 't',
    },
    policies: [{ nome: 'termos leitura operador', tabela: 'storage.objects' }],
  },
  {
    id: 'catalogo-security-definer-nova-nao-classificada',
    roteiro: 'catalogo_secdef.sql',
    classe: 'catalogo-nao-enumerado',
    derruba: ['1a'],
    porque:
      'Uma função `security definer` nasce e ninguém decide que ela deve existir. Cada uma delas roda com o privilégio do DONO e IGNORA a RLS das tabelas que lê e escreve: é a superfície mais concentrada de poder do banco, e até a F48 uma função nova entrava nela sem nada no repositório se mexer.',
    // O `revoke` faz parte da mutação DE PROPÓSITO: sem ele a função nasceria com o
    // EXECUTE default de PUBLIC e derrubaria também a asserção 4, misturando dois fatos.
    // Com ele, esta mutação isola exatamente um: "não classificada".
    sql: `create function public.sabotagem_f48_definer() returns int
language sql security definer set search_path = public as $sab$ select 1 $sab$;
revoke all on function public.sabotagem_f48_definer() from public, anon;`,
    prova: {
      sql: `select prosecdef from pg_proc
             where oid = 'public.sabotagem_f48_definer()'::regprocedure`,
      espera: 't',
    },
  },
  {
    id: 'catalogo-security-definer-com-search-path-solto',
    roteiro: 'catalogo_secdef.sql',
    classe: 'guarda-neutralizada',
    derruba: ['3'],
    porque:
      'Uma `security definer` perde o `search_path` travado (R-ACC-13): quem controla o `search_path` da sessão planta um schema com uma função homônima, e a definer a executa com o privilégio do dono. `e_admin()` é o alvo certo para a demonstração — é ela que metade das policies de `/admin` consulta.',
    sql: `alter function public.e_admin() reset search_path;`,
    prova: {
      sql: `select proconfig is null from pg_proc
             where oid = 'public.e_admin()'::regprocedure`,
      espera: 't',
    },
  },
  {
    id: 'catalogo-security-definer-executavel-por-anon',
    roteiro: 'catalogo_secdef.sql',
    classe: 'grant-devolvido',
    derruba: ['4'],
    porque:
      'Uma `security definer` volta a ser executável pela chave pública, sem sessão nenhuma, por `/rest/v1/rpc/*`. `papel_atual()` é o alvo mais eloquente: ela lê `profiles` como o DONO, então um `anon` com EXECUTE consulta o cargo de quem quiser. O default do Postgres é EXECUTE para PUBLIC — função nova nasce aberta, e é o revoke que a fecha; o que faltava não era revogar, era SER OBRIGADO a revogar.',
    sql: `grant execute on function public.papel_atual() to anon;`,
    prova: {
      sql: `select has_function_privilege('anon', 'public.papel_atual()'::regprocedure, 'execute')`,
      espera: 't',
    },
  },
]


// =============================================================================
// F52 — as guardas de escopo NO-OP (migration 0132)
// =============================================================================
// ⚠ A DIFICULDADE PRÓPRIA DESTA FAMÍLIA, e por que ela é escrita assim.
//
// Uma guarda que devolve `true` é INDETECTÁVEL POR EFEITO, por definição: remover a
// chamada a `mesmo_escopo_de_gestao` de dentro de `exigir_gestao_de` não muda resultado
// nenhum, porque a função só sabe dizer "sim". Um injetor ingênuo concluiria daí que o
// roteiro é fraco — e estaria errado: não há efeito a detectar.
//
// A saída é mutar nos DOIS eixos, e cada um cobre o que o outro não vê:
//   · PRESENÇA — remover a chamada. O que cai é a asserção que lê `pg_get_functiondef` e
//     exige que o corpo CITE a guarda. É a única coisa observável hoje, e é o que impede a
//     guarda de sumir numa recriação futura (o mecanismo causal que a F51 documentou).
//   · EFEITO   — fazer a guarda devolver `false`. Aí o no-op deixa de ser no-op e TUDO que
//     depende dela tem de ficar vermelho. É a prova de que a guarda está mesmo NO CAMINHO
//     das cinco RPCs, e não pendurada num ramo que ninguém percorre.
//
// Sem o segundo eixo, a fase teria entregue uma condição que talvez nem executasse.
/** @type {Mutacao[]} */
const F52_GUARDAS = [
  {
    id: 'f52-escopo-de-gestao-some-do-corpo',
    roteiro: 'cargo_dev.sql',
    classe: 'guarda-removida',
    derruba: ['7c'],
    porque:
      'Remove a chamada a `mesmo_escopo_de_gestao` de dentro de `exigir_gestao_de` — a guarda de pertencimento das CINCO RPCs de conta. É a forma REALISTA de o defeito nascer: a RPC é recriada em cadeia, e o método de mudá-la sempre foi copiar o corpo e editar o trecho novo. Uma condição de quatro linhas se perde numa recriação sem que roteiro nenhum de comportamento acuse, porque hoje ela não tem efeito.',
    sql: mutarFuncao(
      'public.exigir_gestao_de(uuid, public.papel_usuario)',
      `  if not public.mesmo_escopo_de_gestao(p_alvo) then
    raise exception 'Este usuário não pertence à sua organização.'
      using errcode = '42501';
  end if;`,
      `  ${MARCA}
  -- (a guarda de pertencimento foi removida daqui)`,
      'f52-escopo-de-gestao-some-do-corpo',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.exigir_gestao_de(uuid, public.papel_usuario)'::regprocedure)
              not like '%mesmo_escopo_de_gestao%'`,
      espera: 't',
    },
  },
  {
    id: 'f52-escopo-de-gestao-passa-a-recusar',
    roteiro: 'cargo_dev.sql',
    classe: 'no-op-deixou-de-ser-no-op',
    derruba: ['7a', '7j'],
    porque:
      'O eixo do EFEITO: faz `mesmo_escopo_de_gestao` devolver `false`. Se a guarda estiver mesmo no caminho das cinco RPCs, o cenário que ACEITA O LEGÍTIMO (7a) e o par positivo de `definir_vinculos_usuario` (7j) têm de ficar vermelhos. Se ficarem verdes, a condição foi escrita mas não é percorrida — que é o modo de falha silenciosa desta fase inteira.',
    sql: mutarFuncao(
      'public.mesmo_escopo_de_gestao(uuid)',
      '  select true',
      `  select false  ${MARCA}`,
      'f52-escopo-de-gestao-passa-a-recusar',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.mesmo_escopo_de_gestao(uuid)'::regprocedure)
              like '%select false%'`,
      espera: 't',
    },
  },
  {
    id: 'f52-admin-ativo-volta-a-igualdade-crua',
    roteiro: 'cargo_dev.sql',
    classe: 'escopo-nulo-recusa-tudo',
    derruba: ['7f', '7i'],
    porque:
      'Troca a disjunção GUARDADA (`p_escopo is null or true`) por igualdade CRUA contra NULL. É o risco que o plano da fase nomeia por escrito: escopo ausente faz a comparação virar NULL, o `exists` devolve false, e a trava do último administrador passa a RECUSAR TUDO — toda troca de cargo, toda desativação, todo apagamento de conta. Um defeito silencioso trocado por um travamento barulhento.',
    sql: mutarFuncao(
      'public.existe_outro_admin_ativo(uuid, uuid)',
      '       and (p_escopo is null or true)',
      `       and null::uuid = p_escopo  ${MARCA}`,
      'f52-admin-ativo-volta-a-igualdade-crua',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.existe_outro_admin_ativo(uuid, uuid)'::regprocedure)
              like '%null::uuid = p_escopo%'`,
      espera: 't',
    },
  },
  {
    id: 'f52-import-perde-a-guarda-de-filial',
    roteiro: 'import_fora_da_unidade.sql',
    classe: 'guarda-removida',
    derruba: ['5a-ter'],
    porque:
      'Remove `pode_escrever_filial(v_filial)` da orquestradora do import. Ela é a única das RPCs destrutivas que ficou de fora da varredura da 0064, recebe a filial do PAYLOAD e faz `delete from public.ativos where filial_id = v_filial` sem teto, dentro da janela que desarma a `guarda_acervo`. Hoje a condição é inerte (nível administrador escreve em toda filial), e é justamente por ser inerte que alguém a "simplificaria" por parecer redundante.',
    sql: mutarFuncao(
      'public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)',
      `  if not public.pode_escrever_filial(v_filial) then
    raise exception 'Você não tem permissão de escrita na filial % — o import foi recusado.', v_filial
      using errcode = '42501';
  end if;`,
      `  ${MARCA}
  -- (a guarda de filial foi removida daqui)`,
      'f52-import-perde-a-guarda-de-filial',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)'::regprocedure)
              not like '%pode_escrever_filial%'`,
      espera: 't',
    },
  },
  {
    id: 'f52-backup-do-import-aceita-qualquer-prefixo',
    roteiro: 'import_fora_da_unidade.sql',
    classe: 'guarda-afrouxada',
    derruba: ['2a'],
    porque:
      'Afrouxa a conferência de PREFIXO do backup do import: volta ao ritual de string que existia antes da fase, em que qualquer caminho não-vazio passava — inclusive o backup de OUTRA filial. O backup é a única rede embaixo de um DELETE sem teto.',
    sql: mutarFuncao(
      'public.import_validar_plano(jsonb, text, jsonb, smallint)',
      "  if btrim(p_backup_path) not like v_prefixo || '%' then",
      `  if false and btrim(p_backup_path) not like v_prefixo || '%' then  ${MARCA}`,
      'f52-backup-do-import-aceita-qualquer-prefixo',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_validar_plano(jsonb, text, jsonb, smallint)'::regprocedure)
              like '%if false and btrim(p_backup_path)%'`,
      espera: 't',
    },
  },
  {
    id: 'f52-import-volta-a-nao-conferir-confirmacao',
    roteiro: 'import_fora_da_unidade.sql',
    classe: 'guarda-removida',
    derruba: ['3a'],
    porque:
      'Remove a conferência da confirmação digitada de DENTRO da RPC. Volta ao estado anterior à fase, em que a confirmação parava na Server Action e quem chamasse `/rest/v1/rpc/importar_ativos_substituir` direto, com a anon key e o próprio JWT, pulava o campo inteiro.',
    sql: mutarFuncao(
      'public.import_validar_plano(jsonb, text, jsonb, smallint)',
      "  if upper(btrim(coalesce(v_confirmacao, ''))) <> upper(btrim(coalesce(v_filial_nome, ''))) then",
      `  if false then  ${MARCA}`,
      'f52-import-volta-a-nao-conferir-confirmacao',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_validar_plano(jsonb, text, jsonb, smallint)'::regprocedure)
              not like '%upper(btrim(coalesce(v_confirmacao%'`,
      espera: 't',
    },
  },
  {
    id: 'f52-import-perde-a-janela-de-idempotencia',
    roteiro: 'import_fora_da_unidade.sql',
    classe: 'guarda-removida',
    derruba: ['4a'],
    porque:
      'Remove a janela de 24 h por `arquivo_hash`. Sem ela, dois applies do mesmo arquivo passam — e o SEGUNDO apaga tudo o que o primeiro criou, com uuids novos e os termos destruídos. A coluna existe desde a 0031 com o comentário "idempotência" e nunca foi lida até esta fase.',
    sql: mutarFuncao(
      'public.import_validar_plano(jsonb, text, jsonb, smallint)',
      "  if v_hash <> '' and exists (",
      `  if false and v_hash <> '' and exists (  ${MARCA}`,
      'f52-import-perde-a-janela-de-idempotencia',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_validar_plano(jsonb, text, jsonb, smallint)'::regprocedure)
              like '%if false and v_hash%'`,
      espera: 't',
    },
  },
  {
    id: 'f52-mesa-perde-a-guarda-de-pertencimento',
    roteiro: 'conflito_filiais.sql',
    classe: 'guarda-removida',
    derruba: ['10b'],
    porque:
      'Remove `exigir_ativos_da_empresa(v_ids)` de `apagar_ativos_conflito_filiais`. É a MESMA classe da primeira mutação desta família, e no lugar mais perigoso: a mesa é a ÚNICA exceção à exclusividade do dev sobre exclusão de ativo, e a RPC é recriada em cadeia (0093 → 0098 → 0100 → 0132). A guarda foi extraída como função própria exatamente para que a chamada seja UMA linha que o diff denuncia se sumir.',
    sql: mutarFuncao(
      'public.apagar_ativos_conflito_filiais(uuid[], text, text, text)',
      '  perform public.exigir_ativos_da_empresa(v_ids);',
      `  ${MARCA}
  -- (a guarda de pertencimento foi removida daqui)`,
      'f52-mesa-perde-a-guarda-de-pertencimento',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.apagar_ativos_conflito_filiais(uuid[], text, text, text)'::regprocedure)
              not like '%exigir_ativos_da_empresa%'`,
      espera: 't',
    },
  },
]

export const MUTACOES = [
  ...PAPEIS_RLS,
  ...SEGURANCA_CATALOGO,
  ...CARGO_DEV,
  ...DEV_DESTRUTIVO,
  ...IMPORT_SUBSTITUIR,
  ...CONFLITO_FILIAIS,
  ...CATALOGOS_F48,
  ...F52_GUARDAS,
]

/**
 * A QUARENTENA — quebras REAIS que o rig de hoje não sabe acusar.
 *
 * ⚠ ELA NÃO É ESCAPE HATCH, e há teste afirmando isso: nada daqui é executado pelo
 * injetor, e toda entrada NOMEIA a fase que a adota. Uma mutação só desce para cá
 * depois de se provar indetectável **sem escrever catálogo novo** — e escrever
 * catálogo novo é matéria da F48, não desta fase (a ordem proíbe, com todas as
 * letras, converter ou fortalecer asserção existente aqui).
 *
 * Se um dia a quarentena passar de um terço do lote, isso é a manchete do
 * relatório da fase, não uma nota de rodapé.
 *
 * ⚠ EMENDA F48 (07/09/2026) — A QUARENTENA CAIU DE 5 PARA 2, E ISSO É O PONTO.
 * As três entradas que traziam `fase: 'F48'` eram todas da mesma classe: `asseracao-
 * fraca`, isto é, o cenário que deveria acusá-las passava sobre CONJUNTO VAZIO. A F48
 * fortaleceu os quatro cenários correspondentes (`2i-bis-3`, `1j`/`4i` de
 * `papeis_rls.sql` e `3d` de `cargo_dev.sql`) — conserto de ROTEIRO, não de policy — e
 * as três voltaram ao lote ATIVO. As duas que sobram são de outra classe: não são
 * asserção fraca, são CENÁRIO QUE NÃO EXISTE (concorrência de duas conexões; o ramo de
 * backup em arquivo acima de 25 ativos), e as duas nomeiam a F52.
 *
 * A leitura honesta: a quarentena esvaziou porque a fase seguinte a adotou, que é
 * exatamente o que o campo `fase` existe para fazer acontecer. Ela não é escape hatch
 * enquanto alguém, em algum momento, for obrigado a olhar para ela.
 */
/** @type {EmQuarentena[]} */
export const QUARENTENA = [
  {
    id: 'conflito-serializacao-por-advisory-lock',
    roteiro: 'conflito_filiais.sql',
    classe: 'concorrencia',
    // ⚠ REAPONTADA PELA F52 (08/09/2026), de F52 para F55, e o motivo é escrito porque
    // reapontar em silêncio é mover uma promessa. Esta entrada NÃO é uma asserção que
    // falta: ela exige uma CAPACIDADE que o rig não tem. Um roteiro é um `psql` só,
    // dentro de `begin; … rollback;`; detectar a perda do advisory lock exige DUAS
    // conexões travando as mesmas linhas em ordens opostas ao mesmo tempo. Isso é um
    // harness em Node com dois `psql` — construção nova, do tamanho de
    // `run-mutation-tests.mjs`, e escopo de outra fase.
    //
    // O que a F52 FEZ a respeito, e que não é nada: ela acrescentou uma guarda DENTRO
    // desta RPC e, junto, as asserções `10b`/`10c` de `conflito_filiais.sql`, que provam
    // por `position()` que a chamada nova está DEPOIS da etapa (3) do lock e ANTES da
    // janela `estoque.dev_destrutivo`. Isso não substitui o cenário concorrente — não
    // detecta a REMOÇÃO do advisory lock —, mas fecha o risco que a própria F52
    // introduziria: o de a guarda nova ter sido posta antes dos locks.
    derruba: ['(nenhum rótulo de hoje)'],
    porque:
      'A `pg_advisory_xact_lock` que a 0100 acrescentou serializa duas sessões que apagam grupos de conflito que se cruzam — sem ela, o lock em dois tempos deixa duas transações travarem as mesmas linhas em ordens opostas e uma delas morre em deadlock.',
    sql: 'remover a chamada a pg_advisory_xact_lock de apagar_ativos_conflito_filiais',
    indetectavel:
      'Nenhuma asserção do roteiro abre uma SEGUNDA conexão. Dentro de uma transação psql sozinha, remover a trava não muda resultado nenhum — o roteiro fica verde e a mutação se disfarçaria de "asserção fraca" quando o que falta é um cenário CONCORRENTE, que só existe escrevendo catálogo novo.',
    fase: 'F55',
  },
  {
    id: 'conflito-backup-em-arquivo-sem-prefixo-do-digest',
    roteiro: 'conflito_filiais.sql',
    classe: 'caminho-nao-exercitado',
    derruba: ['(nenhum rótulo de hoje)'],
    porque:
      'Acima de 25 ativos o backup do conflito vira ARQUIVO, e a 0100 exige que o caminho esteja sob o digest da seleção — conferir só o prefixo aceitava o backup de OUTRA exclusão.',
    sql: 'afrouxar a conferência do caminho do backup em apagar_ativos_conflito_filiais',
    indetectavel:
      'A maior seleção que o roteiro monta tem 2 ativos, muito abaixo do teto de 25 — o ramo de backup em arquivo nunca roda. Detectar exige um cenário com 26 ativos, que é catálogo novo.',
    // ⚠ REAPONTADA PELA F52 (08/09/2026), de F52 para F54, com o motivo escrito porque
    // reapontar em silêncio é mover uma promessa.
    //
    // Esta entrada é ESCREVÍVEL hoje — bastam 26 ativos fictícios por `generate_series`,
    // e nisso ela difere da irmã acima, que exige uma capacidade que o rig não tem. A
    // razão de não a adotar aqui não é dificuldade: é ENDEREÇO. Ela é sobre o BACKUP do
    // conflito (o ramo em arquivo, acima de 25 ativos, e a amarra pelo digest da
    // seleção), e a F52 é sobre guardas de ESCOPO. A F54 — "o backup deixa de mentir, e a
    // restauração é ensaiada" — é a fase cujo assunto é exatamente este, e ela já vai
    // abrir os caminhos de backup para mexer neles.
    //
    // Fica registrado, para quem pegar a F54: o cenário que falta é (a) montar 26 ativos
    // em conflito, (b) provar que a RPC EXIGE backup em arquivo acima do teto, e (c)
    // provar que ela RECUSA um caminho que não esteja sob `conflito/<digest dos ids>/` —
    // a correção que a 0100 fez porque conferir só o prefixo aceitava o backup de OUTRA
    // exclusão.
    fase: 'F54',
  },
]

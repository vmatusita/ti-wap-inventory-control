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

/**
 * `mutarFuncao` para a função cujo corpo vigente é `create function` PURO, sem `or replace`.
 *
 * ⚠ POR QUE EXISTE (F60). Função que nasce com NOME NOVO — as sete `rel_*_filiais` da `0143` —
 * não tem o que substituir, e a migration escreve `create function`. Reemitir esse texto contra
 * o banco em que ela já existe colide ("already exists with same argument types") e a mutação
 * sai "NÃO aplicou", o diagnóstico errado. A F52 resolveu o mesmo caso com um `.replace` solto
 * (`f52-admin-ativo-volta-a-igualdade-crua`); aqui a troca do cabeçalho passa também por
 * `trocarNoCorpo`, que reprova ALTO se ele não estiver lá exatamente uma vez — no dia em que uma
 * migration recriar a função com `create or replace`, o import deste catálogo quebra na mesa
 * pedindo `mutarFuncao`, em vez de a mutação virar um `create` que falha só no CI.
 *
 * `create or replace` preserva os grants — a mutação muda o CORPO e nada além dele.
 */
function mutarFuncaoSemReplace(assinatura, de, para, id) {
  const nome = assinatura.slice(0, assinatura.indexOf('(')).trim()
  return trocarNoCorpo(
    mutarFuncao(assinatura, de, para, id),
    `create function ${nome}(`,
    `create or replace function ${nome}(`,
    id,
  )
}

const CIFRAO = String.fromCharCode(36)

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
    // ⚠ F52: a assinatura passou a ser (uuid, uuid) — a de 1 argumento foi DROPADA na
    // 0132. Com a antiga, o `grant` era RECUSADO ("function does not exist") e a mutação
    // saía como "NÃO aplicou" em vez de exercitar o cenário.
    sql: `grant execute on function public.existe_outro_admin_ativo(uuid, uuid) to authenticated;`,
    prova: {
      sql: `select has_function_privilege('authenticated', 'public.existe_outro_admin_ativo(uuid, uuid)'::regprocedure, 'execute')`,
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
    derruba: ['0b', '5a'],
    porque:
      'A OUTRA metade do TOCTOU: as contagens chegam, mas ninguém as compara com o estado real da filial. O preview pode ter sido gerado ontem, alguém pode ter cadastrado dez ativos desde então, e o import apaga tudo assim mesmo — a guarda vira ritual.',
    // A primeira mutação prova que a RECUSA existe; esta prova que a COMPARAÇÃO
    // existe. Separá-las é o que impede uma metade de passar de carona na outra.
    //
    // ⚠ REAPONTADA NA F56 (0140, Frente F): a condição de DUAS linhas da 0131
    // virou OITO — a 0140 acrescenta as quatro chaves da FK (fato 33). O texto
    // velho deixou de existir verbatim no corpo vigente assim que a 0140 nasceu;
    // `trocarNoCorpo` reprovaria no CARREGAMENTO do catálogo se este `de` não
    // fosse atualizado para o texto novo — é o "falhar ALTO" que o cabeçalho de
    // `corpo-vigente.mjs` promete. Desligar a condição INTEIRA (`if false`) prova
    // as OITO comparações de uma vez — inclusive as quatro velhas, por isso o
    // rótulo `0b` (que já existia) continua na lista ao lado do `5a` novo.
    sql: mutarFuncao(
      'public.import_revalidar_contagens(jsonb, smallint)',
      `  if v_conferidos <> v_esp_ativos
     or v_liv_movs <> v_esp_movs
     or v_liv_anot <> v_esp_anot
     or v_liv_termos <> v_esp_termos
     or v_liv_pend <> v_esp_pend
     or v_liv_lanc_mov <> v_esp_lanc_mov
     or v_liv_lanc_pend <> v_esp_lanc_pend
     or v_liv_subst <> v_esp_subst
  then`,
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
    id: 'import-revalidacao-ignora-pendencia-nova-do-acervo',
    roteiro: 'import_substituir.sql',
    classe: 'guarda-neutralizada',
    derruba: ['5a-bis'],
    porque:
      'A revalidação PARA DE COMPARAR só a chave nova `pendencias_item` — as outras sete continuam certas. É a regressão mais provável do conserto da FK: alguém adiciona uma chave nova e esquece dela no `if`, e a asserção agregada (5a, "se QUALQUER uma diverge") não pegaria essa falta isolada, porque as outras sete ainda recusariam por outro motivo. Precisa de um cenário que isole só esta chave.',
    // 0140 (F56): reescreve o corpo já mutado por `import-revalidacao-nao-
    // compara-o-vivo`? NÃO — cada mutação parte do CORPO VIGENTE original, uma
    // de cada vez (o injetor aplica uma mutação por banco descartável). Este
    // `de` mira só a LINHA de `pendencias_item`, comentando-a: o restante da
    // condição (as outras sete comparações) sobrevive intacto.
    sql: mutarFuncao(
      'public.import_revalidar_contagens(jsonb, smallint)',
      `
     or v_liv_pend <> v_esp_pend`,
      `
     ${MARCA}`,
      'import-revalidacao-ignora-pendencia-nova-do-acervo',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_revalidar_contagens(jsonb, smallint)'::regprocedure)
              not like '%or v_liv_pend <> v_esp_pend%'`,
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
  // ===========================================================================
  // F56 (0140, Frente F) — a bomba de FK (fatos 27-35). QUATRO mutações, uma por
  // metade do conserto de `import_apagar_acervo_filial`: cada uma remove UM dos
  // quatro passos novos e reabre EXATAMENTE o caminho de FK que ele fechava. As
  // quatro convergem no MESMO ponto de explosão — o `delete from
  // public.movimentacoes`/`pendencias_item`/`ativos` do bloco que já existia —
  // então o injetor vê o MESMO `23503` não tratado nas quatro: o cenário 5a do
  // roteiro captura a exceção (fato 35, "captura e emite ✗ do rótulo nomeado, em
  // vez de abortar o roteiro") e marca ✗ para todas. `derruba` é uma LISTA, não
  // precisa ser 1:1 — reaproveitar `['5a']` nas quatro é mais barato que quatro
  // fixtures isoladas e ainda prova a coisa certa: a explosão sob FK volta a
  // existir sempre que QUALQUER um dos quatro passos falte.
  // ===========================================================================
  {
    id: 'import-nao-desvincula-lancamento-da-pendencia',
    roteiro: 'import_substituir.sql',
    classe: 'fk-nao-tratada',
    derruba: ['5c'],
    porque:
      'O lançamento que RESOLVEU uma pendência do acervo (o elo pendencia_item_id) deixa de ser desvinculado antes do delete das pendências. A "Substituir tudo" volta a estourar 23503 em qualquer filial com uma pendência resolvida por lançamento — a bomba do fato 27, caminho 4.',
    sql: mutarFuncao(
      'public.import_apagar_acervo_filial(smallint)',
      `  update public.lancamentos_item li
     set pendencia_item_id = null
   where li.pendencia_item_id in (
     select pi.id from public.pendencias_item pi
      where pi.ativo_id in (select id from public.ativos where filial_id = p_filial)
   );
  get diagnostics v_lanc_pend_desvinc = row_count;`,
      `  v_lanc_pend_desvinc := 0;  ${MARCA}`,
      'import-nao-desvincula-lancamento-da-pendencia',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_apagar_acervo_filial(smallint)'::regprocedure)
              like '%v_lanc_pend_desvinc := 0;  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-nao-desvincula-lancamento-da-movimentacao',
    roteiro: 'import_substituir.sql',
    classe: 'fk-nao-tratada',
    derruba: ['5c'],
    porque:
      'O lançamento de item preso a uma MOVIMENTAÇÃO do acervo (o elo movimentacao_id, "o que foi junto") deixa de ser desvinculado antes do delete das movimentações. A "Substituir tudo" volta a estourar 23503 em qualquer filial com item vinculado a uma entrega — a bomba do fato 27, caminho 3, medida em produção: 18 lançamentos presos na Matriz, 16 em Linhares, 12 na Filial de Teste.',
    sql: mutarFuncao(
      'public.import_apagar_acervo_filial(smallint)',
      `  update public.lancamentos_item li
     set movimentacao_id = null
   where li.movimentacao_id in (
     select m.id from public.movimentacoes m
      where m.ativo_id in (select id from public.ativos where filial_id = p_filial)
   );
  get diagnostics v_lanc_mov_desvinc = row_count;`,
      `  v_lanc_mov_desvinc := 0;  ${MARCA}`,
      'import-nao-desvincula-lancamento-da-movimentacao',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_apagar_acervo_filial(smallint)'::regprocedure)
              like '%v_lanc_mov_desvinc := 0;  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-nao-apaga-pendencias-do-acervo',
    roteiro: 'import_substituir.sql',
    classe: 'fk-nao-tratada',
    derruba: ['5c'],
    porque:
      'As pendências de item do acervo substituído deixam de ser apagadas. Sem isso a "Substituir tudo" estoura 23503 no delete de ativos seguinte (pendencias_item.ativo_id é FK imediata) em qualquer filial com pendência aberta — e, se por algum motivo não estourasse, a pendência velha ficaria apontando para um ativo que não existe mais, visível na mesa de /pendencias.',
    sql: mutarFuncao(
      'public.import_apagar_acervo_filial(smallint)',
      `  delete from public.pendencias_item pi
   where pi.ativo_id in (select id from public.ativos where filial_id = p_filial);
  get diagnostics v_pend_apagadas = row_count;`,
      `  v_pend_apagadas := 0;  ${MARCA}`,
      'import-nao-apaga-pendencias-do-acervo',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_apagar_acervo_filial(smallint)'::regprocedure)
              like '%v_pend_apagadas := 0;  --%'`,
      espera: 't',
    },
  },
  {
    id: 'import-nao-anula-ponteiro-de-substituto',
    roteiro: 'import_substituir.sql',
    classe: 'fk-nao-tratada',
    derruba: ['5c'],
    porque:
      'O substituto de OUTRA filial fica com substitui_ativo_id apontando para um ativo do acervo apagado — referência pendurada que o delete de ativos seguinte (ativos.substitui_ativo_id é FK imediata) faz estourar 23503 na hora, e que, se não estourasse, a ficha do ativo ou um join futuro poderia tentar seguir.',
    sql: mutarFuncao(
      'public.import_apagar_acervo_filial(smallint)',
      `  update public.ativos
     set substitui_ativo_id = null
   where substitui_ativo_id in (select id from public.ativos where filial_id = p_filial)
     and filial_id <> p_filial;
  get diagnostics v_subst_anulados = row_count;`,
      `  v_subst_anulados := 0;  ${MARCA}`,
      'import-nao-anula-ponteiro-de-substituto',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.import_apagar_acervo_filial(smallint)'::regprocedure)
              like '%v_subst_anulados := 0;  --%'`,
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
  {
    id: 'conflito-backup-em-arquivo-sem-prefixo-do-digest',
    roteiro: 'conflito_filiais.sql',
    classe: 'guarda-neutralizada',
    derruba: ['11e', '11f', '11g', '11h'],
    porque:
      'Afrouxa a conferencia do caminho do backup para olhar SO o prefixo de conflito, sem o digest da selecao. E exatamente o furo que a 0100 fechou: conferir so o prefixo aceita o backup de QUALQUER outra exclusao de conflito que por acaso esteja no bucket — inclusive o resto de uma tentativa recusada. Com o digest, o proprio nome do arquivo vira uma afirmacao verificavel sobre QUAIS ids ele cobre.',
    sql: mutarFuncao(
      'public.apagar_ativos_conflito_filiais(uuid[], text, text, text)',
      "    if btrim(p_backup_path) not like public.prefixo_backup_conflito() || v_digest || '/%' then",
      `    if btrim(p_backup_path) not like public.prefixo_backup_conflito() || '%' then  ${MARCA}`,
      'conflito-backup-em-arquivo-sem-prefixo-do-digest',
    ),
    prova: {
      sql: "select position('not like public.prefixo_backup_conflito() || ''%'' then  --' in pg_get_functiondef('public.apagar_ativos_conflito_filiais(uuid[],text,text,text)'::regprocedure)) > 0",
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
    // ⚠ A SONDA MIRA A CHAMADA, NÃO O NOME. `pg_get_functiondef` devolve o corpo COM os
    // comentários, e o comentário que a 0132 escreveu em volta da guarda CITA o nome —
    // uma sonda por nome cru diria que a mutação "não pegou" quando ela pegou.
    prova: {
      sql: `select pg_get_functiondef('public.exigir_gestao_de(uuid, public.papel_usuario)'::regprocedure)
              not like '%not public.mesmo_escopo_de_gestao(p_alvo)%'`,
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
    // ⚠ `create or replace` À FORÇA. O corpo vigente desta função na 0132 é um
    // `create function` PURO — ela vem logo depois de um `drop`, porque acrescentar
    // parâmetro cria assinatura nova. Reemitir esse texto colide com a função que já
    // existe ("already exists with same argument types") e a mutação sai como "NÃO
    // aplicou". O `replace` abaixo devolve o `or replace` que o corpo original não tem.
    sql: mutarFuncao(
      'public.existe_outro_admin_ativo(uuid, uuid)',
      '       and (p_escopo is null or true)',
      `       and null::uuid = p_escopo  ${MARCA}`,
      'f52-admin-ativo-volta-a-igualdade-crua',
    ).replace(
      'create function public.existe_outro_admin_ativo',
      'create or replace function public.existe_outro_admin_ativo',
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
    // ⚠ Mesma armadilha da anterior: o comentário da 0132 cita `pode_escrever_filial`
    // três vezes, então a sonda tem de mirar a CHAMADA.
    prova: {
      sql: `select pg_get_functiondef('public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)'::regprocedure)
              not like '%not public.pode_escrever_filial(v_filial)%'`,
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

// =============================================================================
// F53 — a ORDEM TOTAL de `movimentacoes` (coluna `ordem`, migrations 0133/0134)
// =============================================================================
// ⚠ AS TRÊS TRAVAS NOVAS DA FASE, NA ORDEM DO PLANO (D3/D4/D7). Cada uma reverte a
// migration 0134 num objeto por vez, resolvida pelo corpo VIGENTE — nunca colada —
// porque `rel_estoque_asof` e `aplicar_movimentacao` já foram recriadas por essa
// migration e continuarão sendo recriadas por qualquer fase futura que as toque.
//
// As duas primeiras miram o roteiro `asof_desempate.sql`, que outro agente está
// estendendo EM PARALELO com os rótulos 3a/3b/3c/4a/4b/5a/6a/7a/10a/10b/10c — os
// rótulos usados aqui (`3a`, `4c`, `6a`) existem nele quando o injetor rodar.
//
// ⚠ REANCORADAS NA F60 (16/09/2026) — `3a` e `6a`, não a `4c`. A `0143` criou o as-of com
// NOME NOVO (`rel_estoque_asof_filiais(smallint[], date)`), reescrito por lateral ancorada em
// `ativos`, e a `0145` derruba o velho. Sem a reancoragem as duas continuariam passando NA MESA
// — `corpoVigente` não conhece `drop` e seguiria achando o corpo da `0134` — e no banco do CI
// virariam `create or replace` de uma função que ninguém mais chama: aplicariam, a sonda diria
// "pegou", e o roteiro, que agora só lê a função nova, ficaria verde. "NÃO detectada" para uma
// asserção que está certa. A régua trocada é a MESMA (`data desc, ordem desc` → a velha por
// `id`; → a pura por `ordem`), só que no `order by` da lateral `u`, onde ela mora agora; os
// rótulos que caem são os mesmos. A `4c` mira `aplicar_movimentacao`, que a F60 não tocou.
/** @type {Mutacao[]} */
const F53_ORDEM = [
  {
    id: 'f53-asof-volta-ao-desempate-por-id',
    roteiro: 'asof_desempate.sql',
    classe: 'desempate-de-ordem-vira-uuid',
    derruba: ['3a'],
    porque:
      'Reverte a lateral `u` de rel_estoque_asof_filiais (até a F60, o CTE `ult` de rel_estoque_asof) ao desempate antigo por `id` (uuid sorteado), tirando `ordem` da régua. É o mesmo cara-ou-coroa que a 0054 tentou consertar com `(tipo=\'ajuste\') desc` e que a F53 mediu errando o ajuste em 643 dos 1270 pares compra+ajuste empatados de produção.',
    // `created_at` entra na régua velha ANTES do `id`, como na 0054: em 3a a compra e o ajuste
    // nascem na MESMA transação (o mesmo `now()`), então o empate chega ao `id` — e o arranjo de
    // ids fixos do roteiro (alto na compra, baixo no ajuste) faz a régua velha errar SEMPRE.
    sql: mutarFuncaoSemReplace(
      'public.rel_estoque_asof_filiais(smallint[], date)',
      'order by m.data desc, m.ordem desc',
      'order by m.data desc, m.created_at desc, m.id desc',
      'f53-asof-volta-ao-desempate-por-id',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.rel_estoque_asof_filiais(smallint[], date)'::regprocedure)
              like '%m.data desc, m.created_at desc, m.id desc%'`,
      espera: 't',
    },
  },
  {
    id: 'f53-trava-do-estorno-volta-ao-uuid',
    roteiro: 'asof_desempate.sql',
    classe: 'desempate-de-ordem-vira-uuid',
    // ⚠ `4c`, e NÃO `4a` — medido, não deduzido. A Sabotagem C desta fase aplicou esta
    // mutação contra o roteiro e `4a`/`4b` continuaram VERDES: eles montam a saída e a
    // devolução com `created_at` DISTINTOS (10:00 e 10:01), e sobre `created_at` distinto
    // as duas réguas concordam SEMPRE. `4a` prova que a trava funciona; ele não prova nada
    // sobre QUAL régua ela usa. `4c` (e o par positivo `4d`) foram escritos por causa
    // disto: eles montam o empate de `created_at` do import, com uuid ALTO na compra e
    // BAIXO no ajuste, que é o único arranjo em que as duas réguas dão respostas
    // diferentes. Apontar `4a` aqui teria feito o injetor reportar "não detectada" — o
    // diagnóstico errado, acusando de fraca uma asserção que está certa.
    derruba: ['4c'],
    // Reauditoria de 18/09, passo 4 (0150, item AG): o ramo de estorno saiu de
    // `aplicar_movimentacao` para `movimentacao_estornar`, e a trava foi junto, byte a byte.
    // A mutação foi REAPONTADA no mesmo commit da migration — `id`, roteiro e rótulo não
    // mudam, porque o comportamento que `4c` prova não mudou de lugar para quem o observa.
    porque:
      'A trava do estorno (hoje em movimentacao_estornar, o ramo de estorno de aplicar_movimentacao) volta a comparar `(created_at, id)`. Nos 643 ativos de produção em que `created_at` empata, o uuid aleatório decide de novo qual é "a última movimentação efetiva" — e nesses casos a régua velha aceita estornar a COMPRA de abertura de 2024 em vez do ajuste de 2026, o sorteio exato que a D4 do PLAN-F53 mediu (643 de 643 apontando o ajuste com `ordem`, 0 de 643 sem ela).',
    sql: mutarFuncao(
      'public.movimentacao_estornar(public.movimentacoes, public.ativos)',
      '(m.created_at, m.ordem) > (v_orig.created_at, v_orig.ordem)',
      '(m.created_at, m.id) > (v_orig.created_at, v_orig.id)',
      'f53-trava-do-estorno-volta-ao-uuid',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_estornar(public.movimentacoes, public.ativos)'::regprocedure)
              like '%(m.created_at, m.id) > (v_orig.created_at, v_orig.id)%'`,
      espera: 't',
    },
  },
  {
    id: 'f53-asof-passa-a-ordenar-so-por-ordem',
    roteiro: 'asof_desempate.sql',
    classe: 'regua-as-of-perde-a-data',
    derruba: ['6a'],
    porque:
      'Tira `data desc` da frente do `order by` da lateral `u` de rel_estoque_asof_filiais (até a F60, o CTE `ult` de rel_estoque_asof) e deixa só `ordem desc` — a régua PURA que a D3 do PLAN-F53 recusou por escrito: uma movimentação retroativa lançada amanhã ganharia `ordem` maior e passaria a vencer o as-of de um período em que ela não era a verdade (63,7% do acervo de produção é retroativo).',
    // ⚠ SÓ 6a, DE PROPÓSITO — é a única asserção que distingue a régua mista
    // (`data desc, ordem desc`) da pura (`ordem desc`). Sobre o acervo de hoje as
    // duas concordam (o backfill tem `data` como primeira componente do rank), então
    // 3a/3b/3c continuam ✓ com esta mutação — não é lacuna, é a linha exata que o
    // PLAN-F53 traçou entre as duas réguas.
    //
    // A sonda procura `order by m.ordem desc`, que o corpo original NÃO contém (lá o `order
    // by` começa por `m.data`) e que só existe depois da troca — o `like` não casa por acaso.
    sql: mutarFuncaoSemReplace(
      'public.rel_estoque_asof_filiais(smallint[], date)',
      'order by m.data desc, m.ordem desc',
      'order by m.ordem desc',
      'f53-asof-passa-a-ordenar-so-por-ordem',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.rel_estoque_asof_filiais(smallint[], date)'::regprocedure)
              like '%order by m.ordem desc%'`,
      espera: 't',
    },
  },
]

/**
 * F54 — A RESTAURAÇÃO. As quebras que `supabase/tests/restauracao.sql` tem de acusar.
 *
 * As três primeiras são as ARMADILHAS que a ata 1 da F53 deixou de herança e que a F54
 * pagou. Elas não são hipóteses: as duas primeiras descrevem o estado do banco ANTES da
 * `0133`, e voltar a ele em silêncio é exatamente o risco que o roteiro existe para
 * cobrir. A quarta vigia a PREMISSA da Decisão 7 — se o trigger deixar de inserir
 * `pendencias_item`, a razão de desligá-lo evapora, e quem descobre isso tem de ser o
 * injetor, não uma restauração de verdade num dia ruim.
 */
/** @type {Mutacao[]} */
const F54_RESTAURACAO = [
  {
    id: 'ordem-deixa-de-ser-generated-always',
    roteiro: 'restauracao.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2a'],
    porque:
      'Troca a identidade ALWAYS de movimentacoes.ordem por BY DEFAULT. Parece inofensivo — o INSERT do restaurador passa a funcionar sem o overriding system value —, e e por isso que e perigoso: some a recusa que hoje avisa alto e cedo que a coluna e derivada, e um caminho de escrita qualquer passa a poder escolher a propria posicao na ordem total do historico.',
    sql: 'alter table public.movimentacoes alter column ordem set generated by default;',
    prova: {
      sql: "select attidentity = 'd' from pg_attribute where attrelid = 'public.movimentacoes'::regclass and attname = 'ordem'",
      espera: 't',
    },
  },
  {
    id: 'indice-unico-da-ordem-sumiu',
    roteiro: 'restauracao.sql',
    classe: 'trava-removida',
    derruba: ['2c'],
    porque:
      'Derruba o indice unico da ordem. E ele que transforma "esqueci o setval" num erro na hora da PROXIMA movimentacao; sem ele, duas movimentacoes passam a poder ocupar a mesma posicao da ordem total, e o desempate que a F53 comprou volta a ser promessa em vez de garantia — sem nada ficar vermelho no caminho.',
    sql: 'drop index public.movimentacoes_ordem_uidx;',
    prova: {
      sql: "select count(*) = 0 from pg_class where relname = 'movimentacoes_ordem_uidx'",
      espera: 't',
    },
  },
  {
    id: 'guarda-acervo-aceita-forcado-fora-da-janela',
    roteiro: 'restauracao.sql',
    classe: 'guarda-neutralizada',
    derruba: ['5a'],
    porque:
      'Faz a guarda do acervo deixar passar forcado = true fora da janela do desenvolvedor. A marca de "correcao tecnica forcada" passa a ser gravavel por qualquer caminho de escrita — e ela e justamente o que distingue, na auditoria, o que o sistema derivou do que alguem impos a mao.',
    sql: mutarFuncao(
      'public.guarda_acervo()',
      "    if coalesce((to_jsonb(new) ->> 'forcado')::boolean, false) then",
      `    ${MARCA}
    if false and coalesce((to_jsonb(new) ->> 'forcado')::boolean, false) then`,
      'guarda-acervo-aceita-forcado-fora-da-janela',
    ),
    prova: {
      sql: "select pg_get_functiondef(p.oid) like '%if false and coalesce%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'guarda_acervo'",
      espera: 't',
    },
  },
  {
    id: 'trigger-para-de-abrir-pendencia-de-item',
    roteiro: 'restauracao.sql',
    classe: 'efeito-colateral-perdido',
    derruba: ['1b', '3c'],
    // Reauditoria de 18/09, passo 4 (0150, item AG): a abertura da pendência de item saiu de
    // `aplicar_movimentacao` para `movimentacao_abrir_pendencias_item`, com `new` renomeado
    // para `p_mov`. REAPONTADA no mesmo commit da migration — sem isto, o `trocarNoCorpo`
    // lançaria no carregamento deste módulo e derrubaria o catálogo inteiro. A premissa da
    // Decisão 7 da F54 continua valendo: é o GATILHO (por meio da auxiliar) que insere.
    porque:
      'Faz o gatilho de movimentacao parar de abrir pendencia de item na devolucao com itens faltantes (a porta de pendencia de item, movimentacao_abrir_pendencias_item). Some a pendencia que a mesa de /pendencias consome — e, para a F54, some a PREMISSA da Decisao 7: e porque o trigger insere pendencia que restaurar com ele ligado DUPLICA a linha que o backup ja traz. Se a premissa mudar, o desenho do restaurador precisa ser reavaliado.',
    sql: mutarFuncao(
      'public.movimentacao_abrir_pendencias_item(public.movimentacoes, public.ativos)',
      "  if p_mov.tipo = 'devolucao' and coalesce(cardinality(p_mov.itens_faltantes), 0) > 0 then",
      `  ${MARCA}
  if false and p_mov.tipo = 'devolucao' and coalesce(cardinality(p_mov.itens_faltantes), 0) > 0 then`,
      'trigger-para-de-abrir-pendencia-de-item',
    ),
    prova: {
      sql: "select pg_get_functiondef(p.oid) like '%if false and p_mov.tipo%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'movimentacao_abrir_pendencias_item'",
      espera: 't',
    },
  },
]

// =============================================================================
// integridade_alarme.sql — as doze checagens e as duas portas (F55, 0138)
// =============================================================================
// A F55 tirou o SQL das doze de dentro de `dev_checagens_integridade` e o pôs em
// `checagens_integridade_nucleo`, com DUAS portas por cima: a da /dev (guarda
// `e_dev`) e `checagens_integridade_resumo` (guarda `papel_atual() is not null`,
// e só `(chave, total)`). O alarme agendado lê a segunda todo dia com uma conta
// de cargo `consulta`, e o corpo da issue que ele abre nasce dela.
//
// As quatro quebras abaixo são as que transformariam o alarme numa decoração:
// uma checagem que some do núcleo, um resumo alcançável sem sessão, um resumo
// que devolve amostra, e o rótulo do ambiente alcançável por quem tem sessão.
// NENHUMA delas quebra `lint`, `build` ou `tsc` — só o roteiro as vê.
/** @type {Mutacao[]} */
const F55_INTEGRIDADE = [
  {
    id: 'nucleo-perde-uma-checagem',
    roteiro: 'integridade_alarme.sql',
    classe: 'checagem-cega',
    // ⚠ `11a`, e NÃO `11`/`estrutura` — o injetor corrigiu a primeira escrita.
    // O roteiro rotula os cenários com letra (`11a` mede o delta +1, `11b` a
    // volta), e `estrutura` conta os blocos `return query`, que esta mutação NÃO
    // muda: ela deixa o bloco no lugar e mata o predicado. É justamente a forma
    // silenciosa que interessa — a checagem responde, responde ZERO, e o alarme
    // fica verde sobre uma corrupção que existe.
    derruba: ['11a'],
    porque:
      'Faz o nucleo parar de contar reserva_aberta: o bloco continua la, mas o predicado nunca casa. E a falha mais silenciosa que uma checagem pode ter — ela responde, responde ZERO, e o alarme fica verde sobre uma corrupcao que existe. O roteiro planta uma reserva em aberto e exige o delta +1; sem o predicado, o delta e zero.',
    sql: mutarFuncao(
      'public.checagens_integridade_nucleo()',
      '     where l.chamado is not null\n     group by i.nome, f.nome, l.chamado',
      `     where l.chamado is not null and false ${MARCA}\n     group by i.nome, f.nome, l.chamado`,
      'nucleo-perde-uma-checagem',
    ),
    prova: {
      sql: "select pg_get_functiondef(p.oid) like '%l.chamado is not null and false%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checagens_integridade_nucleo'",
      espera: 't',
    },
  },
  {
    id: 'resumo-de-integridade-alcancavel-por-anon',
    roteiro: 'integridade_alarme.sql',
    classe: 'superficie-publica',
    // ⚠ `b2c`, e NÃO `b2a` — o injetor corrigiu a primeira escrita, e o motivo é
    // o entregável. Com o grant de volta, `anon` AINDA leva 42501: só que da
    // guarda interna, não da falta de privilégio. Os dois caminhos dão o mesmo
    // sqlstate, e `b2a` continuava verde. A asserção `b2c` foi ACRESCENTADA ao
    // roteiro por causa desta mutação, e olha a SUPERFÍCIE (`has_function_privilege`),
    // que é o que muda.
    derruba: ['b2c'],
    porque:
      'Devolve a anon o EXECUTE do resumo de integridade. Com a chave publica, qualquer um passaria a ler as contagens das doze checagens por /rest/v1/rpc — quantos conflitos, quantos backups orfaos e quantos perfis sem conta a empresa tem, sem sessao nenhuma. E o mesmo furo que a assercao 4 do catalogo_secdef vigia no schema inteiro, aqui no objeto novo.',
    sql: 'grant execute on function public.checagens_integridade_resumo() to anon;',
    prova: {
      sql: "select has_function_privilege('anon', 'public.checagens_integridade_resumo()', 'execute')",
      espera: 't',
    },
  },
  {
    id: 'resumo-de-integridade-devolve-amostra',
    roteiro: 'integridade_alarme.sql',
    classe: 'vazamento-de-dado',
    derruba: ['b3'],
    porque:
      'Faz o resumo devolver TAMBEM a coluna amostra. E ela que carrega patrimonio, nome de pessoa e filial — e o resumo e justamente o que uma conta guardada num secret do GitHub le todo dia, e o que alimenta o corpo de uma issue do repositorio. A garantia "contagem, nunca linha de dado" vive nesta assinatura, e em nenhum outro lugar.',
    sql: [
      'drop function public.checagens_integridade_resumo();',
      'create or replace function public.checagens_integridade_resumo()',
      'returns table(chave text, total bigint, amostra text[])',
      'language plpgsql stable security definer set search_path = public',
      `as ${CIFRAO}mut${CIFRAO}`,
      'begin',
      '  if public.papel_atual() is null then',
      "    raise exception 'Esta consulta exige uma conta ativa.' using errcode = '42501';",
      '  end if;',
      '  return query select n.chave, n.total, n.amostra from public.checagens_integridade_nucleo() n;',
      'end;',
      `${CIFRAO}mut${CIFRAO};`,
      'revoke all on function public.checagens_integridade_resumo() from public, anon, service_role;',
      'grant execute on function public.checagens_integridade_resumo() to authenticated;',
    ].join('\n'),
    prova: {
      sql: "select pg_get_function_result(p.oid) ilike '%amostra%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checagens_integridade_resumo'",
      espera: 't',
    },
  },
  {
    id: 'rotulo-de-ambiente-alcancavel-por-authenticated',
    roteiro: 'integridade_alarme.sql',
    classe: 'superficie-publica',
    // ⚠ `c4`, e NÃO `C` — mesma lição. `c1`..`c3` medem o VALOR devolvido, que
    // não muda com o grant; a asserção `c4` foi ACRESCENTADA ao roteiro por causa
    // desta mutação e mede QUEM ALCANÇA a função.
    derruba: ['c4'],
    porque:
      'Devolve a authenticated o EXECUTE do rotulo de ambiente. Ele existe para o env-guard confirmar, do lado do BANCO, que a base e a de desenvolvimento — e por isso e alcancavel so pela service_role, o mesmo privilegio de resetar_dados_ficticios. Aberto a qualquer logado, ele vira uma dica de infraestrutura que a API entrega a quem so deveria ler acervo.',
    sql: 'grant execute on function public.rotulo_de_ambiente() to authenticated;',
    prova: {
      sql: "select has_function_privilege('authenticated', 'public.rotulo_de_ambiente()', 'execute')",
      espera: 't',
    },
  },
]

// =============================================================================
// vocabulario_import.sql — o vocabulário do import vira dado (F56 · Frente D)
// =============================================================================
// As DUAS mecânicas que fecham a ambiguidade da Decisão 2 (PLAN-F56.md): o gatilho
// da diagonal nome×apelido, e o índice único nome×nome. As duas quebras imitam o
// mesmo defeito de fundo — "duas linhas do vocabulário passam a apontar para a
// mesma unidade, e nada no banco avisa" —, cada uma por um mecanismo diferente.
/** @type {Mutacao[]} */
const F56_VOCABULARIO = [
  {
    id: 'vocabulario-perde-a-guarda-de-ambiguidade',
    roteiro: 'vocabulario_import.sql',
    classe: 'guarda-removida',
    derruba: ['6a'],
    porque:
      'Derruba o gatilho que barra apelido igual ao NOME de outra filial. Sem ele, dois vocabularios validos e ambiguos coexistem: quem digita na coluna Site o nome de uma filial deixa de saber se a linha e dessa filial ou de OUTRA que cadastrou o mesmo texto como apelido — a identidade da unidade, que a Decisao 2 desta fase existe para tornar univoca, volta a ser ambigua, calada.',
    sql: 'drop trigger unidades_apelidos_vocabulario_guarda on public.unidades_apelidos;',
    prova: {
      sql: "select count(*) = 0 from pg_trigger where tgname = 'unidades_apelidos_vocabulario_guarda'",
      espera: 't',
    },
  },
  {
    id: 'vocabulario-perde-o-indice-de-nome-unico',
    roteiro: 'vocabulario_import.sql',
    classe: 'trava-removida',
    derruba: ['6e'],
    porque:
      'Derruba o indice unico que impede duas filiais com o mesmo nome normalizado. Sem ele, renomear uma filial para o nome (so com caixa ou acento diferentes) de outra ja existente passa limpo, e o import de startup fica sem saber para qual das duas uma linha do CSV pertence — a mesma ambiguidade nome×nome que a Decisao 2 fecha, agora sem a trava que a fecha.',
    sql: 'drop index public.filiais_nome_chave_uidx;',
    prova: {
      sql: "select count(*) = 0 from pg_class where relname = 'filiais_nome_chave_uidx'",
      espera: 't',
    },
  },
]

// =============================================================================
// F59 — A DOUTRINA DO PREDICADO (16/09/2026)
// =============================================================================
// Uma quebra por rótulo do bloco 4 de `catalogo_policies.sql`. Sem elas, as asserções
// 10a–14 seriam documento: nasceram verdes (o censo mediu zero policy fora da régua), e
// só uma mutação prova que cada uma sabe ficar VERMELHA no banco de verdade do CI.
//
// A classe de defeito de fundo é uma só — a virada multiempresa escreve o predicado de
// tenant na forma que roda POR LINHA e nada acusa —, e cada entrada imita um disfarce
// dela: a função recebendo a coluna (11a), a função sem argumento solta (12), a leitura
// de tabela ou a junta com a linha num sub-select (13a/13b), o `array (select …)` sobre
// função que não devolve conjunto (14), a policy nova que escapa do universo julgado
// (10a/10b), o nó que o analisador não sabe ler (10c) e a exceção que sobrevive ao
// conserto (11b).
//
// ⚠ Os `alter policy` partem do texto VIVO de cada policy (migrations 0063/0070) e só
// ACRESCENTAM o disfarce em conjunção — o piso `papel_atual()` fica, para que a quebra
// derrube o rótulo da doutrina e não um rótulo vizinho por acidente.
/** @type {Mutacao[]} */
const F59_DOUTRINA = [
  {
    id: 'doutrina-policy-renomeada-escapa-do-universo',
    roteiro: 'catalogo_policies.sql',
    classe: 'universo-nao-julgado',
    derruba: ['10a', '10b'],
    porque:
      'Uma policy de public muda de nome (ou nasce) sem passar pelo universo congelado. A trava de mesa e o catálogo deixariam de julgar o mesmo conjunto — a mesa lê o replay das migrations, o banco lê pg_policies — e uma policy fora do universo seria julgada por um lado só, calada.',
    sql: `alter policy "admin apaga" on public.filiais rename to "admin apaga renomeada";`,
    prova: {
      sql: `select exists (select 1 from pg_policies
                       where schemaname = 'public' and tablename = 'filiais'
                         and policyname = 'admin apaga renomeada')`,
      espera: 't',
    },
    policies: [{ nome: 'admin apaga', tabela: 'public.filiais' }],
  },
  {
    id: 'doutrina-arvore-com-no-que-o-analisador-nao-le',
    roteiro: 'catalogo_policies.sql',
    classe: 'falha-fechada',
    derruba: ['10c'],
    porque:
      'O predicado ganha um agregado dentro de sub-select — um nó (AGGREF) que o analisador da árvore não sabe julgar. Sem a falha fechada, as regras R1–R3 simplesmente não o veriam, e o predicado passaria por não ser entendido, que é o pior jeito de passar.',
    sql: `alter policy "leitura operador" on public.motivos
  using ((select public.papel_atual()) is not null and (select count(*) from generate_series(1, 1)) = 1);`,
    prova: {
      sql: `select coalesce(qual, '') ilike '%count(%' from pg_policies
             where schemaname = 'public' and tablename = 'motivos' and policyname = 'leitura operador'`,
      espera: 't',
    },
    policies: [{ nome: 'leitura operador', tabela: 'public.motivos' }],
  },
  {
    id: 'doutrina-leitura-passa-a-linha-para-funcao',
    roteiro: 'catalogo_policies.sql',
    classe: 'predicado-por-linha',
    derruba: ['11a'],
    porque:
      'A policy de LEITURA de ativos ganha uma função security definer que recebe a coluna da linha — exatamente o e_membro(empresa_id) que a F66 poderia escrever. Roda uma vez por linha, em toda página de ativos, para todo usuário. É a quebra central que a doutrina existe para impedir.',
    sql: `alter policy "leitura operador" on public.ativos
  using ((select public.papel_atual()) is not null and public.pode_escrever_filial(filial_id));`,
    prova: {
      sql: `select coalesce(qual, '') like '%pode_escrever_filial(filial_id)%' from pg_policies
             where schemaname = 'public' and tablename = 'ativos' and policyname = 'leitura operador'`,
      espera: 't',
    },
    policies: [{ nome: 'leitura operador', tabela: 'public.ativos' }],
  },
  {
    id: 'doutrina-excecao-sobrevive-ao-conserto',
    roteiro: 'catalogo_policies.sql',
    classe: 'lista-que-apodrece',
    derruba: ['11b'],
    porque:
      'A policy de INSERT de ativos deixa de passar a filial para a função, e a exceção dela continua na lista. É assim que uma lista de exceções apodrece: a catraca que devia só encolher passaria a guardar uma licença sem dono, pronta para cobrir a próxima policy que alguém escrever com o mesmo nome.',
    sql: `alter policy "operador insere" on public.ativos with check ((select public.pode_escrever()));`,
    prova: {
      sql: `select coalesce(with_check, '') not like '%pode_escrever_filial%' from pg_policies
             where schemaname = 'public' and tablename = 'ativos' and policyname = 'operador insere'`,
      espera: 't',
    },
    policies: [{ nome: 'operador insere', tabela: 'public.ativos' }],
  },
  {
    id: 'doutrina-funcao-sem-argumento-solta',
    roteiro: 'catalogo_policies.sql',
    classe: 'predicado-por-linha',
    derruba: ['12'],
    porque:
      'A policy de filiais perde o (select …) em volta de e_admin(). Sem argumento, a função não depende da linha, mas solta ela é avaliada POR LINHA — o caso da 0103 que a 0107 teve de consertar em produção, com −45% de custo medido.',
    sql: `alter policy "admin apaga" on public.filiais using (public.e_admin());`,
    prova: {
      sql: `select coalesce(qual, '') not ilike '%select%' from pg_policies
             where schemaname = 'public' and tablename = 'filiais' and policyname = 'admin apaga'`,
      espera: 't',
    },
    policies: [{ nome: 'admin apaga', tabela: 'public.filiais' }],
  },
  {
    id: 'doutrina-subselect-le-tabela',
    roteiro: 'catalogo_policies.sql',
    classe: 'predicado-por-linha',
    derruba: ['13a'],
    porque:
      'A policy de kits ganha um exists que lê operador_filiais direto. Mesmo sem olhar a linha, a leitura de tabela no predicado é a porta pela qual a junta com a linha entra no passo seguinte — a doutrina manda a leitura morar DENTRO da função de conjunto, avaliada uma vez.',
    sql: `alter policy "leitura operador" on public.kits_modelos
  using ((select public.papel_atual()) is not null
         and exists (select 1 from public.operador_filiais o where o.usuario_id = (select auth.uid())));`,
    prova: {
      sql: `select coalesce(qual, '') ilike '%operador_filiais%' from pg_policies
             where schemaname = 'public' and tablename = 'kits_modelos' and policyname = 'leitura operador'`,
      espera: 't',
    },
    policies: [{ nome: 'leitura operador', tabela: 'public.kits_modelos' }],
  },
  {
    id: 'doutrina-subselect-olha-a-linha',
    roteiro: 'catalogo_policies.sql',
    classe: 'predicado-por-linha',
    derruba: ['13b'],
    porque:
      'A policy de itens ganha um sub-select que referencia a coluna da própria linha — correlacionado, reexecutado por linha. É a forma "auth.uid() in (select … where … = tabela.col)" que a documentação da Supabase manda reescrever, sem função nenhuma que a R1 pudesse acusar.',
    sql: `alter policy "leitura operador" on public.itens
  using ((select public.papel_atual()) is not null and (select itens.id) is not null);`,
    prova: {
      sql: `select coalesce(qual, '') ilike '%select itens.id%' from pg_policies
             where schemaname = 'public' and tablename = 'itens' and policyname = 'leitura operador'`,
      espera: 't',
    },
    policies: [{ nome: 'leitura operador', tabela: 'public.itens' }],
  },
  {
    id: 'doutrina-array-sobre-funcao-que-nao-devolve-conjunto',
    roteiro: 'catalogo_policies.sql',
    classe: 'erro-de-execucao',
    derruba: ['14'],
    porque:
      'A policy de profiles consome em array (select …) uma função que não devolve conjunto. Com auth.uid() é inofensivo; com a forma-alvo que a ficha herdou (→ uuid[]), array (select …) monta um array de uma dimensão a mais e ERRA no conjunto vazio e no NULL — a leitura de todo membro sem empresa cairia com erro. Nenhum teste de texto pega erro de execução; só o proretset.',
    sql: `alter policy "leitura operador" on public.profiles
  using ((select public.papel_atual()) is not null and id = any (array (select auth.uid())));`,
    prova: {
      sql: `select coalesce(qual, '') ilike '%array(%' from pg_policies
             where schemaname = 'public' and tablename = 'profiles' and policyname = 'leitura operador'`,
      espera: 't',
    },
    policies: [{ nome: 'leitura operador', tabela: 'public.profiles' }],
  },
]

// =============================================================================
// F60 — O RECORTE OBRIGATÓRIO DAS `rel_*` (16/09/2026)
// =============================================================================
// Uma quebra por rótulo do bloco 7 de `catalogo_secdef.sql` (7a–7g) e uma por cenário de
// COMPORTAMENTO que a fase escreveu e que o catálogo não enxerga (o transferido depois da data
// em `asof_desempate.sql`, a filial desativada em `f60_recorte.sql`). O bloco 7 nasceu VERDE
// contra a cadeia com a `0143`/`0145` — e asserção que nasce verde e nunca ficou vermelha é
// documento (a régua da F59). Só a mutação prova, no banco de verdade do CI, que cada uma sabe
// acordar.
//
// A classe de defeito de fundo é uma só — o relatório volta a devolver MAIS do que o recorte
// pede, ou passa a devolver OUTRA coisa —, e cada entrada imita um caminho dela:
//   · o disfarce textual do nulo-é-tudo voltando ao corpo (7c);
//   · uma `rel_*` nova que nasce sem recorte nenhum (7a/7b);
//   · o atributo que a forma exige, perdido (7d) — e o grant do visualizador, perdido (7e);
//   · a lista de exceções que apodrece (7f) ou que passa a cobrir quem não foi avaliado (7g);
//   · e as duas que mudam o NÚMERO sem mudar a forma, e que por isso só um cenário pega: o
//     pré-filtro pela filial de HOJE no as-of (11a) e o consolidado só das filiais ativas (2a).
//
// ⚠ AS DE CORPO passam por `mutarFuncaoSemReplace` — as sete `rel_*_filiais` nasceram com
// `create function` puro (ver o helper no topo). Nenhuma copia corpo: se a `0143` for sucedida
// por uma migration que mude o trecho, `trocarNoCorpo` reprova na mesa.
//
// ⚠ AS DE ATRIBUTO E DE GRANT miram funções DIFERENTES de propósito (7c no `mov_por_mes`, 7d
// no `frescor`, 7e no as-of): o bloco 7 julga o CONJUNTO das `rel_*`, e espalhar as quebras
// prova que ele não olha só para a primeira da lista. A 7e fica no as-of porque é o relatório
// que o visualizador por senha abre primeiro — é onde a perda do grant dói.
//
// ⚠ 7d POR `strict`, E NÃO POR `security definer` (PLAN-F60 §7.4): uma definer nova derrubaria
// junto a tabela-verdade do bloco 1 (`1a`, "não classificada") e o diagnóstico sairia misturado.
// `strict` é, das quatro propriedades, a única que não tem outra asserção no arquivo.
//
// ⚠ AS QUE CRIAM FUNÇÃO trazem o `revoke … from public, anon` e o `grant … to authenticated,
// service_role` DENTRO da mutação, pelo mesmo motivo da `catalogo-security-definer-nova-nao-
// classificada` (F48): sem eles a função nasceria com o EXECUTE default de PUBLIC e derrubaria
// também a 6a (e sem o grant, a 7e) — dois fatos numa quebra só.
/** @type {Mutacao[]} */
const F60_RECORTE = [
  {
    id: 'f60-recorte-volta-a-is-null-or',
    roteiro: 'catalogo_secdef.sql',
    classe: 'nulo-volta-a-ser-tudo',
    derruba: ['7c'],
    porque:
      'Uma rel_*_filiais é recriada com o recorte embrulhado em `(p_filiais is null or … = any (p_filiais))` — a forma velha, só que sobre a lista. O nome do parâmetro, o tipo, a ligação `= any` e os grants continuam certos (7a, 7b, 7d e 7e ficam verdes), e um chamador que perca a lista no caminho volta a receber o acervo inteiro de todas as filiais, sem erro — o fail-open que a F60 existe para matar, com cara de conserto.',
    // ⚠ A LIGAÇÃO `= any` FICA NO CORPO de propósito: é o disfarce que passa pela 7b (prova
    // POSITIVA) e só cai na 7c (a NEGATIVA textual). Tirar a ligação derrubaria a 7b junto e
    // não provaria que a 7c existe por conta própria.
    sql: mutarFuncaoSemReplace(
      'public.rel_mov_por_mes_filiais(smallint[], date, date)',
      '    and m.filial_id = any (p_filiais)',
      '    and (p_filiais is null or m.filial_id = any (p_filiais))',
      'f60-recorte-volta-a-is-null-or',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.rel_mov_por_mes_filiais(smallint[], date, date)'::regprocedure)
              like '%p_filiais is null or m.filial_id = any (p_filiais)%'`,
      espera: 't',
    },
  },
  {
    id: 'f60-rel-nova-sem-recorte',
    roteiro: 'catalogo_secdef.sql',
    classe: 'rel-sem-recorte',
    derruba: ['7a', '7b'],
    porque:
      'Uma rel_* NOVA nasce do jeito certo em tudo que não é o recorte — invoker, stable, search_path fixo, sem anon, com authenticated e service_role — e lê movimentacoes de todas as filiais, sem parâmetro de filial nenhum. É o caminho mais provável de a regra voltar a ser opcional: a próxima função de relatório escrita às pressas, que o visualizador por senha alcançaria pelo client administrativo.',
    sql: `create function public.rel_sabotagem_f60_sem_recorte(p_ate date)
returns table (total bigint)
language sql stable security invoker set search_path = public as $sab$
  select count(*)::bigint from public.movimentacoes m where m.data <= p_ate;
$sab$;
revoke all on function public.rel_sabotagem_f60_sem_recorte(date) from public, anon;
grant execute on function public.rel_sabotagem_f60_sem_recorte(date) to authenticated, service_role;`,
    // A sonda prova as DUAS coisas que isolam o diagnóstico: a função existe E o
    // `service_role` a executa (com o grant, a 7e não cai junto).
    prova: {
      sql: `select has_function_privilege('service_role', 'public.rel_sabotagem_f60_sem_recorte(date)'::regprocedure, 'execute')`,
      espera: 't',
    },
  },
  {
    id: 'f60-rel-vira-strict',
    roteiro: 'catalogo_secdef.sql',
    classe: 'atributo-da-forma-perdido',
    derruba: ['7d'],
    porque:
      'Uma rel_*_filiais vira `strict`. O efeito imediato parece inofensivo — NULL já dava zero linhas —, mas é mais uma diferença de texto e de atributo entre as oito sem ganho de plano enquanto houver `set search_path` (Decisão 1 do PLAN-F60), e é o primeiro passo do atalho "o banco que recuse o nulo", que tira a prova do vazio do corpo e a põe num atributo que ninguém lê.',
    sql: `alter function public.rel_frescor_itens_filiais(smallint[], date) strict;`,
    prova: {
      sql: `select proisstrict from pg_proc
             where oid = 'public.rel_frescor_itens_filiais(smallint[], date)'::regprocedure`,
      espera: 't',
    },
  },
  {
    id: 'f60-rel-perde-execute-do-service-role',
    roteiro: 'catalogo_secdef.sql',
    classe: 'grant-perdido',
    derruba: ['7e'],
    porque:
      'O as-of perde o EXECUTE do service_role. Para quem tem sessão nada muda — e é por isso que ninguém perceberia —, mas o visualizador por senha lê os relatórios pelo client administrativo (`resolverAcessoRelatorio`), e o relatório que ele abre primeiro passaria a falhar. A 6a só vigia o anon; sem a 7e, uma rel_* recriada por drop+create com o `revoke … from public, anon` de sempre e sem o `grant` perderia o visualizador em silêncio.',
    sql: `revoke execute on function public.rel_estoque_asof_filiais(smallint[], date) from service_role;`,
    prova: {
      sql: `select not has_function_privilege('service_role', 'public.rel_estoque_asof_filiais(smallint[], date)'::regprocedure, 'execute')`,
      espera: 't',
    },
  },
  {
    id: 'f60-excecao-apodrece',
    roteiro: 'catalogo_secdef.sql',
    classe: 'lista-que-apodrece',
    derruba: ['7f'],
    porque:
      'rel_saldo_colaborador(uuid) deixa de existir e `k_excecoes_recorte` continua citando o nome. É assim que uma lista de exceções apodrece: a licença fica sem dono, pronta para cobrir a próxima função que alguém criar com o mesmo nome — que nasceria isenta de 7a/7b sem ninguém ter decidido nada.',
    // ⚠ `drop function`, e não `drop table`: a regra do bloco 5 do `mutacoes.test.mts` é sobre
    // o que PERDE DADO, e derrubar uma função de leitura não apaga linha nenhuma. Nada no banco
    // depende dela (nenhuma view; as chamadas moram em roteiro e no app).
    sql: `drop function public.rel_saldo_colaborador(uuid);`,
    prova: {
      sql: `select to_regprocedure('public.rel_saldo_colaborador(uuid)') is null`,
      espera: 't',
    },
  },
  {
    id: 'f60-excecao-ganha-overload',
    roteiro: 'catalogo_secdef.sql',
    classe: 'excecao-herdada-por-overload',
    derruba: ['7g'],
    porque:
      'Nasce um SEGUNDO rel_saldo_colaborador, com outra assinatura, que lê lancamentos_item de todas as filiais sem recorte nenhum. A exceção é por NOME: sem a 7g, o overload herdaria a isenção inteira de 7a/7b/7c sem ter sido avaliado — o achado CRÍTICO da revisão adversarial da trava, e a forma exata de um furo passar pela porta que a exceção legítima abriu.',
    // Invoker, stable, `search_path` fixo e com os dois grants: a quebra muda UM fato (o nome
    // ganha outra assinatura), e 7d/7e/6a continuam verdes — o diagnóstico cai só na 7g.
    sql: `create function public.rel_saldo_colaborador(p_incluir_zerados boolean)
returns table (item_id smallint, com_a_pessoa bigint)
language sql stable security invoker set search_path = public as $sab$
  select l.item_id, sum(l.quantidade)::bigint
    from public.lancamentos_item l
   where p_incluir_zerados or l.quantidade <> 0
   group by l.item_id;
$sab$;
revoke all on function public.rel_saldo_colaborador(boolean) from public, anon;
grant execute on function public.rel_saldo_colaborador(boolean) to authenticated, service_role;`,
    prova: {
      sql: `select count(*) = 2 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'rel_saldo_colaborador'`,
      espera: 't',
    },
  },
  {
    id: 'f60-asof-pre-filtra-pela-filial-de-hoje',
    roteiro: 'asof_desempate.sql',
    classe: 'recorte-sobre-a-filial-errada',
    derruba: ['11a'],
    porque:
      'O as-of ganha o pré-filtro óbvio para "cortar scan": `a.filial_id = any (p_filiais)` sobre `ativos`, que é a filial de HOJE. O ativo que estava na filial A na data e foi transferido para B depois some do relatório de A naquela data — e não aparece no de B, porque na data ele era de A. Some do passado. Nenhum número de hoje muda, a forma continua passando na trava (é mais uma conjunção direta), e só o cenário do transferido depois da data vê.',
    // ⚠ SÓ 11a. 11b (a data DEPOIS da transferência) e 11c (o consolidado, cuja lista contém
    // as duas filiais) continuam verdes com o pré-filtro — é exatamente por isso que o cenário
    // tem três rótulos: o defeito só aparece no passado da filial de ORIGEM.
    sql: mutarFuncaoSemReplace(
      'public.rel_estoque_asof_filiais(smallint[], date)',
      "  where e.status not in ('descartado', 'devolvido_fornecedor')",
      "  where a.filial_id = any (p_filiais)\n    and e.status not in ('descartado', 'devolvido_fornecedor')",
      'f60-asof-pre-filtra-pela-filial-de-hoje',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.rel_estoque_asof_filiais(smallint[], date)'::regprocedure)
              like '%where a.filial_id = any (p_filiais)%'`,
      espera: 't',
    },
  },
  {
    id: 'f60-saldo-consolidado-so-das-ativas',
    roteiro: 'f60_recorte.sql',
    classe: 'consolidado-perde-a-desativada',
    derruba: ['2a'],
    porque:
      'O nível do total de rel_saldo_itens_filiais passa a somar só as filiais ATIVAS — o atalho de montar o consolidado com a lista de filiais que o app mostra, que esconde as desativadas. Em /itens o consolidado perde o estoque guardado em filial desativada, `estoqueForaDasColunas` vira 0 e a tela mente com o teste da função pura verde: o fato 9 da ordem, dentro do banco.',
    // ⚠ A TROCA É SÓ NO NÍVEL DO TOTAL, e isso é o ponto. O `grouping sets` de `tot` vira as
    // linhas por filial (intactas) + um ramo de total que filtra `filiais.ativo`. As linhas por
    // filial não mudam — a desativada continua com a coluna dela —, então o cenário cai pela
    // EMENDA e não por uma linha sumida:
    //   · 2a (lista de TODAS) cai: total 5 em vez de 12, e o fora das colunas vira 0;
    //   · 2b (lista só das ATIVAS) fica verde: com as ativas o filtro não muda nada — é a
    //     variante que prova que a 2a mede a desativada;
    //   · 3a/4a/4b ficam verdes: as filiais do chamado cruzado são ativas.
    // `atrel` não é tocado: a desativada do cenário não tem reserva, e mexer nele só alargaria
    // a quebra sem derrubar rótulo nenhum a mais.
    sql: mutarFuncaoSemReplace(
      'public.rel_saldo_itens_filiais(smallint[], date)',
      'group by grouping sets ((item_id, filial_id), (item_id))',
      `group by item_id, filial_id
    union all
    select item_id, null::smallint,
           sum(case tipo when 'entrada' then quantidade
                         when 'ajuste'  then quantidade else 0 end),
           sum(case tipo when 'saida'   then quantidade
                         when 'retorno' then -quantidade else 0 end)
    from rows
    where filial_id in (select f.id from public.filiais f where f.ativo)
    group by item_id`,
      'f60-saldo-consolidado-so-das-ativas',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.rel_saldo_itens_filiais(smallint[], date)'::regprocedure)
              like '%where filial_id in (select f.id from public.filiais f where f.ativo)%'`,
      espera: 't',
    },
  },
]

// Reauditoria de 18/09/2026, passo 2 (v1.66.3) — as funções NOVAS da 0148 e da 0149 entram
// no lote no mesmo dia em que nascem (a revisão final apontou: seis funções sem mutação nenhuma).
/** @type {Mutacao[]} */
const REAUDITORIA_PASSO2 = [
  {
    id: 'reaud-u-escrita-atomica-sem-guarda-de-zero-linhas',
    roteiro: 'escrita_atomica_ativos_anotacao.sql',
    classe: 'anotacao-sem-escrita',
    derruba: ['3', '4', '5'],
    porque:
      'A escrita atômica perde a recusa de UPDATE que não alcançou linha nenhuma. O PostgREST não dá erro em update de 0 linhas, então a anotação nasce SOZINHA: para um ativo de outra filial (a RLS filtrou o UPDATE em silêncio, e a policy de anotacoes é só por cargo), e a tela diz "patrimônio corrigido" de um patrimônio que não mudou — exatamente a anotação imutável e falsa que o item U existe para impedir.',
    sql: mutarFuncao(
      'public.corrigir_patrimonio_com_anotacao(uuid, text, text, boolean, text)',
      '  if v_n = 0 then',
      '  if false then',
      'reaud-u-escrita-atomica-sem-guarda-de-zero-linhas',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.corrigir_patrimonio_com_anotacao(uuid, text, text, boolean, text)'::regprocedure)
              like '%if false then%'`,
      espera: 't',
    },
  },
  // Revisão de código de 22/09/2026 (0151) — a pré-condição das três singulares entrou no WHERE
  // do UPDATE. Cada guarda nova ganha a sua quebra, e o roteiro a acusa pelo cenário do "segundo
  // clique" (13/14/15). Com elas o lote chega a 105, o teto de hoje.
  {
    id: 'u151-service-tag-sobrescreve-a-que-ja-existe',
    roteiro: 'escrita_atomica_ativos_anotacao.sql',
    classe: 'guarda-neutralizada',
    derruba: ['13'],
    porque:
      'Definir a service tag perde a pré-condição "só quando vazia" no banco. Dois cliques simultâneos (ou duas abas) passam os dois pela leitura da action, o segundo sobrescreve a tag que o primeiro acabou de gravar — a identidade do equipamento muda em silêncio — e a ficha ganha duas anotações imutáveis "Service tag definida", uma delas falsa.',
    sql: mutarFuncao(
      'public.definir_service_tag_com_anotacao(uuid, text, text, boolean, text)',
      `   where id = p_ativo_id
     and coalesce(btrim(service_tag), '') = '';`,
      `   ${MARCA}
   where id = p_ativo_id;`,
      'u151-service-tag-sobrescreve-a-que-ja-existe',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.definir_service_tag_com_anotacao(uuid, text, text, boolean, text)'::regprocedure)
              like '%btrim(service_tag)%'`,
      espera: 'f',
    },
  },
  {
    id: 'u151-confirmacao-em-dobro',
    roteiro: 'escrita_atomica_ativos_anotacao.sql',
    classe: 'guarda-neutralizada',
    derruba: ['14'],
    porque:
      'Confirmar a assinatura perde a pré-condição "ainda não é sim" no banco. O segundo de dois cliques regrava a data da assinatura por cima da que o primeiro gravou e deixa uma segunda anotação "Termo confirmado como assinado" na linha do tempo — duas confirmações de um documento assinado uma vez.',
    sql: mutarFuncao(
      'public.confirmar_assinatura_termo_com_anotacao(uuid, date, text)',
      `   where id = p_ativo_id
     and termo_assinado is distinct from 'sim';`,
      `   ${MARCA}
   where id = p_ativo_id;`,
      'u151-confirmacao-em-dobro',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.confirmar_assinatura_termo_com_anotacao(uuid, date, text)'::regprocedure)
              like '%is distinct from%'`,
      espera: 'f',
    },
  },
  {
    id: 'u151-desfazer-o-que-nao-esta-confirmado',
    roteiro: 'escrita_atomica_ativos_anotacao.sql',
    classe: 'guarda-neutralizada',
    derruba: ['15'],
    porque:
      'Desfazer a confirmação perde a pré-condição "ainda é sim" no banco. O segundo de dois cliques (ou um desfazer que chega depois de outra pessoa já ter desfeito) reescreve o status do termo com o destino que ELE calculou, apaga a data e anota um "desfeito" de algo que já não estava confirmado.',
    sql: mutarFuncao(
      'public.desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text)',
      `   where id = p_ativo_id
     and termo_assinado = 'sim';`,
      `   ${MARCA}
   where id = p_ativo_id;`,
      'u151-desfazer-o-que-nao-esta-confirmado',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text)'::regprocedure)
              like '%and termo_assinado = ''sim''%'`,
      espera: 'f',
    },
  },
  {
    id: 'reaud-ae-ledger-sem-guarda-de-papel',
    roteiro: 'ledger_de_migracoes.sql',
    classe: 'definer-sem-guarda',
    derruba: ['2a'],
    porque:
      'A leitura do ledger é security definer e perde a guarda de papel: qualquer sessão com o grant de authenticated — inclusive um perfil DESATIVADO, que o piso de leitura da 0070/0073 manda recusar — passa a ler um schema que o PostgREST não expõe. O anon continua barrado pela falta de grant (2b fica verde), que é o disfarce: a guarda de dentro some sem que a de fora denuncie.',
    sql: mutarFuncao(
      'public.ledger_de_migracoes()',
      '  if public.papel_atual() is null then',
      '  if false then',
      'reaud-ae-ledger-sem-guarda-de-papel',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.ledger_de_migracoes()'::regprocedure) like '%if false then%'`,
      espera: 't',
    },
  },
]

// =============================================================================
// movimentacao_grade.sql — a decomposição de aplicar_movimentacao (reauditoria, passo 4)
// =============================================================================
// A 0150 (item AG) quebrou o gatilho de ~150 linhas numa orquestradora fina sobre SEIS
// auxiliares `movimentacao_*`. As duas mutações que miravam o corpo antigo foram
// REAPONTADAS (`f53-trava-do-estorno-volta-ao-uuid`, em F53_ORDEM, e
// `trigger-para-de-abrir-pendencia-de-item`, em F54_RESTAURACAO); estas são as NOVAS, com
// duas réguas, e as duas por escrito:
//
//   · TODA auxiliar tem pelo menos uma quebra que algum roteiro acusa pelo nome — a régua da
//     F51 ("uma por auxiliar sem cobertura"). `movimentacao_abrir_pendencias_item` já tinha a
//     reapontada e ganhou mais uma, a do colaborador da época, que nenhum roteiro vigiava.
//   · Cada BURACO de cobertura que a leitura desta fase achou — estorno sem `estorno_de`,
//     `estorno_de` de outro ativo, guarda de identidade no estorno, guarda de identidade em
//     compra/troca — ganhou cenário novo em `movimentacao_grade.sql` E uma quebra aqui. Um
//     cenário que nasce verde e nunca ficou vermelho é documento, não rede (F59).
//
// Os rótulos `1d`/`1f` são as PROPRIEDADES da grade (o detentor segue o estado; o estorno é
// o inverso completo); os demais são cenários nomeados. `4a` é a asserção de ACL das seis.
/** @type {Mutacao[]} */
const REAUDITORIA_PASSO4 = [
  {
    id: 'ag-estorno-sem-guarda-de-identidade',
    roteiro: 'movimentacao_grade.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2k'],
    porque:
      'O estorno perde a guarda de identidade no destino do desfazer (a da 0097). Desfazer uma transferência para a filial onde, depois dela, nasceu o gêmeo do ativo deixa de ser recusado com a frase que manda resolver o conflito em Pendências — e passa a estourar o 23505 cru do índice por filial, citando nome de índice para o operador.',
    sql: mutarFuncao(
      'public.movimentacao_estornar(public.movimentacoes, public.ativos)',
      `  perform public.exigir_identidade_livre_na_filial(
    p_mov.ativo_id, (v_orig.snapshot_anterior ->> 'filial_id')::smallint, 'desfazer esta movimentação');`,
      `  ${MARCA}
  perform 1;`,
      'ag-estorno-sem-guarda-de-identidade',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_estornar(public.movimentacoes, public.ativos)'::regprocedure)
              like '%desfazer esta movimenta%'`,
      espera: 'f',
    },
  },
  {
    id: 'ag-estorno-sem-recusa-de-origem-ausente',
    roteiro: 'movimentacao_grade.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2b'],
    porque:
      'O estorno sem `estorno_de` perde a recusa própria. Ele ainda cai na seguinte ("precisa apontar para uma movimentação do MESMO ativo"), e é esse o disfarce: o operador lê que apontou para o ativo errado quando não apontou para nada, e a tradução do app manda procurar o problema no lugar errado. Nenhum roteiro exercitava esta recusa antes da grade.',
    sql: mutarFuncao(
      'public.movimentacao_estornar(public.movimentacoes, public.ativos)',
      '  if p_mov.estorno_de is null then',
      `  ${MARCA}
  if false then`,
      'ag-estorno-sem-recusa-de-origem-ausente',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_estornar(public.movimentacoes, public.ativos)'::regprocedure)
              like '%if p_mov.estorno_de is null then%'`,
      espera: 'f',
    },
  },
  {
    id: 'ag-estorno-aceita-origem-de-outro-ativo',
    roteiro: 'movimentacao_grade.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2c'],
    porque:
      'O estorno deixa de conferir que a movimentação de origem é do MESMO ativo. Um `estorno_de` apontando para a saída de OUTRO equipamento passa a ser aceito, e o ativo do estorno recebe o estado de antes daquela outra movimentação — um equipamento "volta" ao estoque por causa do histórico de outro. Nenhum roteiro exercitava esta recusa antes da grade.',
    sql: mutarFuncao(
      'public.movimentacao_estornar(public.movimentacoes, public.ativos)',
      '  if v_orig.id is null or v_orig.ativo_id <> p_mov.ativo_id then',
      `  ${MARCA}
  if v_orig.id is null then`,
      'ag-estorno-aceita-origem-de-outro-ativo',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_estornar(public.movimentacoes, public.ativos)'::regprocedure)
              like '%v_orig.ativo_id <> p_mov.ativo_id%'`,
      espera: 'f',
    },
  },
  {
    id: 'ag-pendencia-de-termo-ressuscita-itens-faltantes',
    roteiro: 'movimentacao_grade.sql',
    classe: 'efeito-colateral-perdido',
    derruba: ['1f', '2l'],
    porque:
      'A restauração da pendência de termo no estorno perde o filtro dos itens faltantes (0051). Estornar qualquer movimentação cujo snapshot guardou o texto antigo "itens faltantes: …" ressuscita esse trecho em ativos.pendencia — a mesma pendência passa a existir duas vezes, como texto e como linha de pendencias_item, e a mesa de /pendencias mostra o que já foi resolvido.',
    sql: mutarFuncao(
      'public.movimentacao_pendencia_de_termo_restaurada(jsonb, text)',
      `
                   and lower(trim(x.val)) not like 'itens faltantes%'), '')`,
      `
                   ${MARCA}
                   ), '')`,
      'ag-pendencia-de-termo-ressuscita-itens-faltantes',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_pendencia_de_termo_restaurada(jsonb, text)'::regprocedure)
              like '%itens faltantes%'`,
      espera: 'f',
    },
  },
  {
    id: 'ag-estorno-deixa-pendencias-de-item',
    roteiro: 'movimentacao_grade.sql',
    classe: 'efeito-colateral-perdido',
    derruba: ['1f', '2j'],
    porque:
      'Estornar a devolução deixa de apagar as pendências de item que ela abriu. O equipamento volta para a pessoa, e a mesa de /pendencias continua cobrando dela os itens de uma devolução que o sistema passou a dizer que nunca aconteceu — o inverso deixa de ser simétrico.',
    sql: mutarFuncao(
      'public.movimentacao_desfazer_pendencias_item(uuid)',
      '  delete from public.pendencias_item where movimentacao_id = p_movimentacao_estornada;',
      `  ${MARCA}
  delete from public.pendencias_item where false and movimentacao_id = p_movimentacao_estornada;`,
      'ag-estorno-deixa-pendencias-de-item',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_desfazer_pendencias_item(uuid)'::regprocedure)
              like '%where false and movimentacao_id%'`,
      espera: 't',
    },
  },
  {
    id: 'ag-destino-volta-a-cobrir-so-transferencia',
    roteiro: 'movimentacao_grade.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2y', '2z'],
    porque:
      'Reabre o buraco da 0097 que a 0099 fechou: a filial de destino deixa de considerar `compra` e `troca`, que também gravam filial. Uma compra ou uma troca que leve o ativo para a filial do gêmeo escapa da guarda de identidade e estoura o 23505 cru do índice por filial. Nenhum roteiro exercitava esses dois caminhos antes da grade — só a transferência.',
    sql: mutarFuncao(
      'public.movimentacao_transicionar(public.movimentacoes, public.ativos)',
      `  v_dest := case
    when p_mov.tipo in ('compra','troca') then p_mov.filial_id
`,
      `  ${MARCA}
  v_dest := case
`,
      'ag-destino-volta-a-cobrir-so-transferencia',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_transicionar(public.movimentacoes, public.ativos)'::regprocedure)
              like '%v_dest := case' || chr(10) || '    when p_mov.tipo = ''transferencia''%'`,
      espera: 't',
    },
  },
  {
    id: 'ag-ajuste-sem-justificativa',
    roteiro: 'movimentacao_grade.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2v'],
    porque:
      'O ajuste deixa de exigir justificativa. Ajuste é a única movimentação que impõe um estado à mão, fora da matriz de transições — sem a observação, a correção entra no histórico sem o porquê, e a auditoria passa a ver um equipamento mudar de estado sem motivo registrado.',
    sql: mutarFuncao(
      'public.movimentacao_transicionar(public.movimentacoes, public.ativos)',
      '    if p_mov.status_resultante is null or p_mov.observacao is null then',
      `    ${MARCA}
    if p_mov.status_resultante is null then`,
      'ag-ajuste-sem-justificativa',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_transicionar(public.movimentacoes, public.ativos)'::regprocedure)
              like '%or p_mov.observacao is null%'`,
      espera: 'f',
    },
  },
  {
    id: 'ag-detentor-fantasma-sobrevive',
    roteiro: 'movimentacao_grade.sql',
    classe: 'efeito-colateral-perdido',
    derruba: ['1d', '2q'],
    porque:
      'A sincronização de detentor deixa de perguntar ao ESTADO resultante (0110) e passa a só olhar o tipo. O colaborador fantasma volta: um equipamento que vai para estoque, triagem, manutenção ou baixa por compra, ajuste, retorno ou descarte continua "com" a pessoa, e o relatório e o termo passam a nomear quem não está mais com ele — o defeito que a F36 existiu para fechar.',
    sql: mutarFuncao(
      'public.movimentacao_detentor_sincronizado(public.status_ativo, public.tipo_movimentacao, text, text)',
      `    when not public.status_tem_detentor(p_status) then null
`,
      `    ${MARCA}
`,
      'ag-detentor-fantasma-sobrevive',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_detentor_sincronizado(public.status_ativo, public.tipo_movimentacao, text, text)'::regprocedure)
              like '%status_tem_detentor%'`,
      espera: 'f',
    },
  },
  {
    id: 'ag-pendencia-de-item-sem-colaborador-da-epoca',
    roteiro: 'movimentacao_grade.sql',
    classe: 'efeito-colateral-perdido',
    derruba: ['3d', '3e'],
    porque:
      'A pendência de item da devolução perde o colaborador da ÉPOCA quando a devolução não o informa (ou informa vazio). Ela nasce sem dono, e a mesa de /pendencias e o bloco "Com esta pessoa" deixam de saber de quem cobrar o carregador que não voltou — e é exatamente a devolução feita às pressas, sem digitar o nome, que mais produz item faltante.',
    sql: mutarFuncao(
      'public.movimentacao_abrir_pendencias_item(public.movimentacoes, public.ativos)',
      "coalesce(nullif(p_mov.colaborador, ''), p_ativo.colaborador_atual)",
      'p_mov.colaborador',
      'ag-pendencia-de-item-sem-colaborador-da-epoca',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.movimentacao_abrir_pendencias_item(public.movimentacoes, public.ativos)'::regprocedure)
              like '%p_ativo.colaborador_atual%'`,
      espera: 'f',
    },
  },
  {
    id: 'ag-auxiliar-executavel-por-authenticated',
    roteiro: 'movimentacao_grade.sql',
    classe: 'grant-devolvido',
    derruba: ['4a'],
    porque:
      'A auxiliar que desfaz uma movimentação passa a ser chamável pela API: qualquer logado, com a anon key e o próprio JWT, alcança /rest/v1/rpc/movimentacao_estornar e reescreve o estado de um ativo a partir de um snapshot — sem gravar movimentação nenhuma, sem trilha e sem passar pela RLS de escrita por filial, porque tudo isso mora no gatilho que a chama. Decompor uma security definer REORGANIZA a superfície; o que mantém as seis fora da API é uma linha de revoke por função.',
    sql: `grant execute on function public.movimentacao_estornar(public.movimentacoes, public.ativos) to authenticated;  ${MARCA}`,
    prova: {
      sql: `select has_function_privilege('authenticated',
              'public.movimentacao_estornar(public.movimentacoes, public.ativos)', 'execute')`,
      espera: 't',
    },
  },
]

// =============================================================================
// F62 (22/09/2026) — a raiz do tenant e o cargo por empresa
// =============================================================================
// UMA mutação por função de autorização que a F62 criou ou reescreveu — as quatro de
// conjunto, `e_plataforma`, a ponte de `papel_atual` (três eixos: o arquivamento, a
// desativação, a empresa), `pode_escrever_filial`, `existe_outro_admin_ativo`,
// `exigir_gestao_de`, a guarda do dev em `membros`, o `handle_new_user` sem a membership,
// as três RPCs escritoras voltando à coluna congelada, `profiles_guarda_dev` esquecendo a
// membership — mais a estrutura: `force` em `membros` (a sabotagem D) e a FK composta de
// `operador_filiais` (a regra 3 da convenção de honestidade). Cada uma é derrubada por um
// cenário NOMEADO: a grade (`cargo_equivalencia.sql`), os A↔B (`isolamento_tenant.sql`), a
// hierarquia do dev (`cargo_dev.sql`) ou o catálogo (`catalogo_policies.sql`).
const provaMarca = (assinatura) => ({
  sql: `select pg_get_functiondef('${assinatura}'::regprocedure) like '%MUTAÇÃO F47 (injetor)%'`,
  espera: 't',
})

/** @type {Mutacao[]} */
const F62_CARGO = [
  {
    id: 'f62-empresas-do-membro-esquece-ativo',
    roteiro: 'isolamento_tenant.sql',
    classe: 'revogacao-perdida',
    derruba: ['9e'],
    porque:
      'O recorte de leitura por empresa esquece a membership DESATIVADA: quem foi desligado continua "membro" da empresa até a próxima troca de token — ou para sempre, se a F72 já tiver tirado o piso. É a revogação no request seguinte deixando de valer justamente na função que a F66 vai pendurar em toda policy (sabotagem C).',
    sql: mutarFuncaoSemReplace(
      'public.empresas_do_membro()',
      '     and m.ativo\n',
      `     ${MARCA}\n`,
      'f62-empresas-do-membro-esquece-ativo',
    ),
    prova: provaMarca('public.empresas_do_membro()'),
  },
  {
    id: 'f62-empresas-de-escrita-aceita-consulta',
    roteiro: 'isolamento_tenant.sql',
    classe: 'papel-afrouxado',
    derruba: ['9b'],
    porque:
      'A escrita no nível de empresa passa a aceitar o cargo consulta: o consultor que é admin no cliente A e só consulta no cliente B ganha escrita no B pelo simples fato de ter membership lá — o cargo por empresa, que é a razão de existir de membros, deixa de valer.',
    sql: mutarFuncaoSemReplace(
      'public.empresas_de_escrita()',
      "     and m.papel in ('dev', 'admin', 'operador')",
      `     and m.papel in ('dev', 'admin', 'operador', 'consulta')  ${MARCA}`,
      'f62-empresas-de-escrita-aceita-consulta',
    ),
    prova: provaMarca('public.empresas_de_escrita()'),
  },
  {
    id: 'f62-empresas-de-admin-aceita-operador',
    roteiro: 'isolamento_tenant.sql',
    classe: 'papel-afrouxado',
    derruba: ['9b'],
    porque:
      'A capacidade administrativa por empresa passa a aceitar o operador: quem só lança movimentação no cliente B vira administrador do catálogo, dos usuários e do import do B — a escalada de privilégio clássica, agora por empresa.',
    sql: mutarFuncaoSemReplace(
      'public.empresas_de_admin()',
      "     and m.papel in ('dev', 'admin')",
      `     and m.papel in ('dev', 'admin', 'operador')  ${MARCA}`,
      'f62-empresas-de-admin-aceita-operador',
    ),
    prova: provaMarca('public.empresas_de_admin()'),
  },
  {
    id: 'f62-unidades-de-escrita-cruza-empresa',
    roteiro: 'isolamento_tenant.sql',
    classe: 'escopo-cruzado',
    derruba: ['9d'],
    porque:
      'O ramo do administrador em unidades_de_escrita perde a junção pela EMPRESA: o admin da empresa A passa a receber os pares de filial da empresa B — a quebra cross-tenant de escrita, na função que a F66 vai usar em toda policy de escrita por unidade (sabotagem C).',
    sql: mutarFuncaoSemReplace(
      'public.unidades_de_escrita()',
      '    join public.filiais f on f.empresa_id = m.empresa_id\n',
      `    join public.filiais f on true  ${MARCA}\n`,
      'f62-unidades-de-escrita-cruza-empresa',
    ),
    prova: provaMarca('public.unidades_de_escrita()'),
  },
  {
    id: 'f62-e-plataforma-responde-por-qualquer-um',
    roteiro: 'isolamento_tenant.sql',
    classe: 'identidade-ignorada',
    derruba: ['9f'],
    porque:
      'e_plataforma() deixa de perguntar QUEM chama: basta existir uma conta de plataforma no banco para todo logado ativo ser tratado como operador da plataforma. É o defeito que a ausência de parâmetro existe para impedir — e o que a F67 herdaria ao trocar e_dev() por ela.',
    sql: mutarFuncaoSemReplace(
      'public.e_plataforma()',
      '     where pa.profile_id = (select auth.uid())\n',
      `     where true  ${MARCA}\n`,
      'f62-e-plataforma-responde-por-qualquer-um',
    ),
    prova: provaMarca('public.e_plataforma()'),
  },
  {
    id: 'f62-ponte-esquece-arquivado',
    roteiro: 'cargo_equivalencia.sql',
    classe: 'revogacao-perdida',
    derruba: ['1', '2', '3'],
    porque:
      'A ponte de papel_atual() esquece o arquivamento da CONTA (profiles.excluido_em): quem foi apagado e ficou com a membership ativa por um UPDATE manual volta a ter cargo. A grade compara o corpo antigo com o vivo e nomeia a célula arquivado×ativo (sabotagem B).',
    sql: mutarFuncao(
      'public.papel_atual()',
      '     and p.excluido_em is null\n',
      `     ${MARCA}\n`,
      'f62-ponte-esquece-arquivado',
    ),
    prova: provaMarca('public.papel_atual()'),
  },
  {
    id: 'f62-ponte-esquece-inativo',
    roteiro: 'cargo_equivalencia.sql',
    classe: 'revogacao-perdida',
    derruba: ['1', '2', '3'],
    porque:
      'A ponte de papel_atual() esquece o status da membership: quem foi DESATIVADO continua com cargo, leitura e escrita. É a desativação no request seguinte (0070) deixando de valer para todo mundo de uma vez — a grade nomeia cada célula inativa (sabotagem B).',
    sql: mutarFuncao(
      'public.papel_atual()',
      '     and m.ativo\n',
      `     ${MARCA}\n`,
      'f62-ponte-esquece-inativo',
    ),
    prova: provaMarca('public.papel_atual()'),
  },
  {
    id: 'f62-ponte-responde-pela-empresa-errada',
    roteiro: 'cargo_equivalencia.sql',
    classe: 'escopo-cruzado',
    derruba: ['1', '5'],
    porque:
      'A ponte de papel_atual() deixa de responder pela empresa LEGADA: o consultor admin na WAP e consulta num cliente passa a valer pelo cargo do cliente — e, com uma empresa só, todo perfil perde o cargo. A ponte tem de ser determinística e apontar a empresa legada até a F67.',
    sql: mutarFuncao(
      'public.papel_atual()',
      '     and m.empresa_id = public.empresa_legada()\n',
      `     and m.empresa_id <> public.empresa_legada()  ${MARCA}\n`,
      'f62-ponte-responde-pela-empresa-errada',
    ),
    prova: provaMarca('public.papel_atual()'),
  },
  {
    id: 'f62-vinculo-de-qualquer-membership',
    roteiro: 'cargo_equivalencia.sql',
    classe: 'vinculo-de-outra-pessoa',
    derruba: ['3'],
    porque:
      'pode_escrever_filial() deixa de exigir que o vínculo seja da membership de QUEM CHAMA: basta alguém estar vinculado à filial para todo operador escrever nela. É a escrita por filial virando escrita por cargo — o recorte de escrita inteiro caindo por uma condição a menos.',
    sql: mutarFuncao(
      'public.pode_escrever_filial(smallint)',
      `       where m.profile_id = (select auth.uid())
         and m.empresa_id = public.empresa_legada()
         and vf.filial_id  = fid`,
      `       where vf.filial_id  = fid  ${MARCA}`,
      'f62-vinculo-de-qualquer-membership',
    ),
    prova: provaMarca('public.pode_escrever_filial(smallint)'),
  },
  {
    id: 'f62-outro-admin-conta-inativo',
    roteiro: 'cargo_equivalencia.sql',
    classe: 'guarda-afrouxada',
    derruba: ['4b'],
    porque:
      'A trava do último administrador passa a contar memberships DESATIVADAS: com o único admin ativo e um desativado, ela responde que "sobra outro", e o sistema deixa rebaixar ou desativar a última conta de nível administrador — trancando /admin para todo mundo.',
    sql: mutarFuncao(
      'public.existe_outro_admin_ativo(uuid, uuid)',
      '       and m.ativo\n',
      `       ${MARCA}\n`,
      'f62-outro-admin-conta-inativo',
    ),
    prova: provaMarca('public.existe_outro_admin_ativo(uuid, uuid)'),
  },
  {
    id: 'f62-guarda-de-gestao-le-o-cargo-congelado',
    roteiro: 'cargo_dev.sql',
    classe: 'fonte-congelada',
    derruba: ['2c', '8b'],
    porque:
      'A guarda comum das RPCs de conta volta a ler o cargo do ALVO na coluna CONGELADA de profiles: um dev promovido depois da F62 (que só a membership diz ser dev) vira um alvo comum, e um administrador passa a desativar, rebaixar e revincular desenvolvedores — o "dev intocável" furado pela fonte errada.',
    sql: mutarFuncao(
      'public.exigir_gestao_de(uuid, public.papel_usuario)',
      `  select m.papel into v_papel_alvo
    from public.membros m
   where m.profile_id = p_alvo
     and m.empresa_id = public.empresa_legada();`,
      `  select p.papel into v_papel_alvo from public.profiles p where p.id = p_alvo;  ${MARCA}`,
      'f62-guarda-de-gestao-le-o-cargo-congelado',
    ),
    prova: provaMarca('public.exigir_gestao_de(uuid, public.papel_usuario)'),
  },
  {
    id: 'f62-guarda-do-dev-em-membros-neutralizada',
    roteiro: 'cargo_dev.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2h-membros', '2i-membros', '2j-membros'],
    porque:
      'A rede final do dev em membros deixa passar tudo: pelo caminho que ignora RLS (service role, SQL Editor) qualquer um concede o cargo dev, rebaixa, desativa ou apaga a membership de um desenvolvedor. Sem ela, a proteção do dev ficaria só na coluna congelada, que ninguém mais lê (sabotagem E).',
    sql: mutarFuncaoSemReplace(
      'public.membros_guarda_dev()',
      '  if v_oficial then\n',
      `  if true then  ${MARCA}\n`,
      'f62-guarda-do-dev-em-membros-neutralizada',
    ),
    prova: provaMarca('public.membros_guarda_dev()'),
  },
  {
    id: 'f62-handle-new-user-sem-membership',
    roteiro: 'isolamento_tenant.sql',
    classe: 'efeito-colateral-perdido',
    derruba: ['9l'],
    porque:
      'A conta nova deixa de nascer com a membership na empresa legada: o convite cria a pessoa, papel_atual() devolve NULL, e ela não entra — nem lê nada — até alguém plantar a linha à mão. É o defeito silencioso de todo convite feito depois da F62 (sabotagem J).',
    sql: mutarFuncao(
      'public.handle_new_user()',
      `  insert into public.membros (empresa_id, profile_id)
  values (public.empresa_legada(), new.id);`,
      `  ${MARCA}`,
      'f62-handle-new-user-sem-membership',
    ),
    prova: provaMarca('public.handle_new_user()'),
  },
  {
    id: 'f62-definir-papel-grava-a-coluna-congelada',
    roteiro: 'cargo_dev.sql',
    classe: 'fonte-congelada',
    derruba: ['2g-bis', '3a'],
    porque:
      'A troca de cargo volta a gravar a coluna CONGELADA de profiles: a tela diz "cargo alterado" e nada muda, porque tudo que decide acesso lê membros. É a dupla fonte que a decisão iii proíbe, virando uma promoção que não promove.',
    sql: mutarFuncao(
      'public.definir_papel_usuario(uuid, public.papel_usuario)',
      `  update public.membros set papel = p_papel
   where profile_id = p_alvo and empresa_id = public.empresa_legada();`,
      `  update public.profiles set papel = p_papel where id = p_alvo;  ${MARCA}`,
      'f62-definir-papel-grava-a-coluna-congelada',
    ),
    prova: provaMarca('public.definir_papel_usuario(uuid, public.papel_usuario)'),
  },
  {
    id: 'f62-definir-status-grava-a-coluna-congelada',
    roteiro: 'cargo_dev.sql',
    classe: 'fonte-congelada',
    derruba: ['3c'],
    porque:
      'A desativação volta a gravar a coluna CONGELADA de profiles: a tela diz "acesso desativado" e a pessoa continua lendo e escrevendo, porque a membership continua ativa. É a revogação mais importante do sistema virando um aviso sem efeito.',
    sql: mutarFuncao(
      'public.definir_status_usuario(uuid, boolean)',
      `  update public.membros set ativo = p_ativo
   where profile_id = p_alvo and empresa_id = public.empresa_legada();`,
      `  update public.profiles set ativo = p_ativo where id = p_alvo;  ${MARCA}`,
      'f62-definir-status-grava-a-coluna-congelada',
    ),
    prova: provaMarca('public.definir_status_usuario(uuid, boolean)'),
  },
  {
    id: 'f62-apagar-nao-desativa-memberships',
    roteiro: 'cargo_dev.sql',
    classe: 'efeito-colateral-perdido',
    derruba: ['6b'],
    porque:
      'Apagar a conta deixa de desligar as memberships: a conta arquivada continua "membro ativo" das empresas, e só o excluido_em a segura. Quando a F72 tirar o piso e as funções de conjunto forem a única porta, a conta apagada volta a ler.',
    sql: mutarFuncao(
      'public.apagar_usuario(uuid)',
      `  update public.membros
     set ativo = false
   where profile_id = p_alvo;`,
      `  ${MARCA}`,
      'f62-apagar-nao-desativa-memberships',
    ),
    prova: provaMarca('public.apagar_usuario(uuid)'),
  },
  {
    id: 'f62-guarda-de-profiles-esquece-a-membership',
    roteiro: 'cargo_dev.sql',
    classe: 'fonte-congelada',
    derruba: ['2i', '8c'],
    porque:
      'profiles_guarda_dev volta a reconhecer o dev SÓ pela coluna congelada: um dev promovido depois da F62 perde a proteção do excluido_em e da coluna congelada — o service role arquiva a conta dele por fora, sem passar pela RPC.',
    sql: mutarFuncao(
      'public.profiles_guarda_dev()',
      `  v_era_dev := old.papel = 'dev'
               or exists (select 1 from public.membros m
                           where m.profile_id = old.id and m.papel = 'dev');`,
      `  v_era_dev := old.papel = 'dev';  ${MARCA}`,
      'f62-guarda-de-profiles-esquece-a-membership',
    ),
    prova: provaMarca('public.profiles_guarda_dev()'),
  },
  {
    id: 'f62-guarda-de-profiles-aceita-a-escrita-antiga',
    roteiro: 'cargo_dev.sql',
    classe: 'guarda-neutralizada',
    derruba: ['8d'],
    porque:
      'A guarda de profiles volta a deixar a janela de gestão gravar a coluna CONGELADA: uma RPC antiga em voo no apply da 0158, bloqueada pela trava da recópia, retoma depois do commit e grava profiles.ativo — a desativação cai na coluna que ninguém lê, a pessoa continua ativa em membros, e a tela diz "feito".',
    sql: mutarFuncao(
      'public.profiles_guarda_dev()',
      `       and coalesce(current_setting('estoque.cargo_congelado', true), '') <> 'on' then`,
      `       and false then  ${MARCA}`,
      'f62-guarda-de-profiles-aceita-a-escrita-antiga',
    ),
    prova: provaMarca('public.profiles_guarda_dev()'),
  },
  {
    id: 'f62-membros-com-force-rls',
    roteiro: 'catalogo_policies.sql',
    classe: 'force-rls',
    derruba: ['4-bis'],
    porque:
      'force row level security em membros: a RLS passa a valer para o DONO, e a policy de membros chama papel_atual(), que lê membros como o dono — a recursão 42P17 que a 0070 provou para profiles volta, agora na tabela do cargo, derrubando toda leitura de todo mundo (R-ACC-72, sabotagem D).',
    sql: `alter table public.membros force row level security;  ${MARCA}`,
    prova: {
      sql: `select relforcerowsecurity from pg_class where oid = 'public.membros'::regclass`,
      espera: 't',
    },
  },
  {
    id: 'f62-vinculo-sem-fk-composta-de-membro',
    roteiro: 'isolamento_tenant.sql',
    classe: 'integridade-estrutural',
    derruba: ['9h'],
    porque:
      'Sem a FK composta (empresa_id, membro_id) → membros, o vínculo de escrita aceita a membership de OUTRA empresa numa filial da empresa A: a camada que devia sobreviver à falha da RLS some, e o consultor escreve em A pelo cargo que tem em B.',
    sql: `alter table public.operador_filiais drop constraint operador_filiais_membro_fk;  ${MARCA}`,
    prova: {
      sql: `select not exists (select 1 from pg_constraint where conname = 'operador_filiais_membro_fk')`,
      espera: 't',
    },
  },
]

// =============================================================================
// F63 (23/09/2026) — `empresa_id` NO ACERVO e O PAR DE BACKUP DE MIGRAÇÃO
// =============================================================================
// A decisão 8 do PLAN-F63: mutação SÓ onde ela derruba uma trava desta fase que nenhum teste
// de MESA derruba — e as seis são estado de BANCO (a forma da coluna, a tabela fechada), que a
// mesa não vê. Quatro quebram a FORMA de `empresa_id` numa das oito tabelas de `k_lote1`, uma
// por defeito, cada uma numa tabela diferente (o bloco 5 de `catalogo_policies.sql` tem de
// acusar as quatro PELO NOME — a sabotagem C); duas abrem `backups_migration` (a policy que a
// simetria de `k_sem_select` acusa; o grant que o bloco 6 de `empresa_no_acervo.sql` acusa).
/** @type {Mutacao[]} */
const F63_ACERVO = [
  {
    id: 'f63-lote1-default-literal',
    roteiro: 'catalogo_policies.sql',
    classe: 'default-literal',
    derruba: ['15b'],
    porque:
      'O default de ativos.empresa_id vira o LITERAL da WAP em vez de public.empresa_legada(): o valor é o mesmo hoje, mas a fonte única deixa de ser a função — trocar a empresa legada (por migration) passaria a deixar esta coluna para trás em silêncio, e a F67 tiraria de uma tabela um default que não é o que ela procura.',
    sql: `alter table public.ativos alter column empresa_id set default '00000000-0000-4000-a000-000000000001'::uuid;  ${MARCA}`,
    prova: {
      sql: `select not exists (select 1 from pg_depend dp join pg_attrdef d on d.oid = dp.objid where dp.classid = 'pg_attrdef'::regclass and d.adrelid = 'public.ativos'::regclass and dp.refobjid = 'public.empresa_legada()'::regprocedure)`,
      espera: 't',
    },
  },
  {
    id: 'f63-lote1-sem-not-null',
    roteiro: 'catalogo_policies.sql',
    classe: 'integridade-estrutural',
    derruba: ['15b'],
    porque:
      'movimentacoes.empresa_id passa a aceitar null: um INSERT que mande empresa_id nulo (um escritor da F67 esquecendo a empresa) grava movimentação SEM dono — invisível para o recorte da F66 e fora da FK composta da F65.',
    sql: `alter table public.movimentacoes alter column empresa_id drop not null;  ${MARCA}`,
    prova: {
      sql: `select not attnotnull from pg_attribute where attrelid = 'public.movimentacoes'::regclass and attname = 'empresa_id'`,
      espera: 't',
    },
  },
  {
    id: 'f63-lote1-fk-not-valid',
    roteiro: 'catalogo_policies.sql',
    classe: 'integridade-estrutural',
    derruba: ['15b'],
    porque:
      'A FK de itens.empresa_id recriada NOT VALID: as linhas que já existiam deixam de ser conferidas contra empresas — uma empresa apagada ou um valor forjado antes da recriação passa a morar no acervo sem que o banco tenha provado que o dono existe.',
    sql: `alter table public.itens drop constraint itens_empresa_id_fkey; alter table public.itens add constraint itens_empresa_id_fkey foreign key (empresa_id) references public.empresas (id) not valid;  ${MARCA}`,
    prova: {
      sql: `select not convalidated from pg_constraint where conname = 'itens_empresa_id_fkey'`,
      espera: 't',
    },
  },
  {
    id: 'f63-lote1-sem-coluna',
    roteiro: 'catalogo_policies.sql',
    classe: 'integridade-estrutural',
    derruba: ['15b'],
    porque:
      'anotacoes perde empresa_id: uma das oito tabelas do acervo sai do lote 1 calada, e o recorte da F66 teria uma tabela de negócio sem a chave — a anotação de um ativo da empresa A legível por todas.',
    sql: `alter table public.anotacoes drop column empresa_id;  ${MARCA}`,
    prova: {
      sql: `select not exists (select 1 from pg_attribute where attrelid = 'public.anotacoes'::regclass and attname = 'empresa_id' and not attisdropped)`,
      espera: 't',
    },
  },
  {
    id: 'f63-backups-ganha-policy',
    roteiro: 'catalogo_policies.sql',
    classe: 'policy-permissiva',
    derruba: ['4'],
    porque:
      'backups_migration ganha uma policy de SELECT para authenticated: com o grant do projeto hospedado, todo logado leria o valor ANTERIOR de cada célula que uma migration alterou — inclusive dado que a migration existiu para corrigir.',
    sql: `create policy f63_mutacao_le_backup on public.backups_migration for select to authenticated using (true);  ${MARCA}`,
    prova: {
      sql: `select exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'backups_migration')`,
      espera: 't',
    },
  },
  {
    id: 'f63-backups-legivel',
    roteiro: 'empresa_no_acervo.sql',
    classe: 'grant-devolvido',
    derruba: ['6a'],
    porque:
      'O revoke de backups_migration some para authenticated (o grant que o default privilege do projeto hospedado dá a toda tabela nova): o par de backup deixa de ser do dono — a tabela fechada no molde de ambiente vira tabela de API.',
    sql: `grant select on public.backups_migration to authenticated;  ${MARCA}`,
    prova: {
      sql: `select has_table_privilege('authenticated', 'public.backups_migration', 'select')`,
      espera: 't',
    },
  },
]

// =============================================================================
// F64 (23/09/2026) — `empresa_id` NO LOTE 2, O KIT E A 13ª CHECAGEM
// =============================================================================
// A decisão 8 do PLAN-F64, a régua da F63: mutação SÓ onde ela derruba uma trava desta fase que
// nenhum teste de MESA derruba — as sete são estado de BANCO. Quatro quebram a FORMA de
// `empresa_id` numa das onze de `k_lote2`, uma por defeito e cada uma numa tabela diferente (o `15e`
// de `catalogo_policies.sql` tem de acusá-las PELO NOME — a sabotagem A; a sem coluna derruba também
// o `15f`, a pendência que virou reprovação). Três quebram o kit: o gatilho some; o gatilho confere
// o código e esquece a EMPRESA; a 13ª checagem confere o código e esquece a empresa (as três em
// `kit_motivo_da_empresa.sql`, a sabotagem C).
/** @type {Mutacao[]} */
const F64_LOTE2_E_KIT = [
  {
    id: 'f64-lote2-default-literal',
    roteiro: 'catalogo_policies.sql',
    classe: 'default-literal',
    derruba: ['15e'],
    porque:
      'O default de motivos.empresa_id vira o LITERAL da WAP em vez de public.empresa_legada(): o valor é o mesmo hoje, mas a fonte única deixa de ser a função — trocar a empresa legada deixaria o motivo para trás em silêncio, e a F67 tiraria de uma tabela um default que não é o que ela procura.',
    sql: `alter table public.motivos alter column empresa_id set default '00000000-0000-4000-a000-000000000001'::uuid;  ${MARCA}`,
    prova: {
      sql: `select not exists (select 1 from pg_depend dp join pg_attrdef d on d.oid = dp.objid where dp.classid = 'pg_attrdef'::regclass and d.adrelid = 'public.motivos'::regclass and dp.refobjid = 'public.empresa_legada()'::regprocedure)`,
      espera: 't',
    },
  },
  {
    id: 'f64-lote2-sem-not-null',
    roteiro: 'catalogo_policies.sql',
    classe: 'integridade-estrutural',
    derruba: ['15e'],
    porque:
      'eventos_admin.empresa_id passa a aceitar null: um escritor da F67 que esqueça a empresa grava um evento da trilha de auditoria SEM dono — invisível para o recorte da F66, legível por ninguém ou por todos.',
    sql: `alter table public.eventos_admin alter column empresa_id drop not null;  ${MARCA}`,
    prova: {
      sql: `select not attnotnull from pg_attribute where attrelid = 'public.eventos_admin'::regclass and attname = 'empresa_id'`,
      espera: 't',
    },
  },
  {
    id: 'f64-lote2-fk-not-valid',
    roteiro: 'catalogo_policies.sql',
    classe: 'integridade-estrutural',
    derruba: ['15e'],
    porque:
      'A FK de senhas_acesso.empresa_id recriada NOT VALID: as senhas que já existiam deixam de ser conferidas contra empresas — e é exatamente a coluna de que a porta pública por empresa (F68) vai derivar o tenant do visualizador.',
    sql: `alter table public.senhas_acesso drop constraint senhas_acesso_empresa_id_fkey; alter table public.senhas_acesso add constraint senhas_acesso_empresa_id_fkey foreign key (empresa_id) references public.empresas (id) not valid;  ${MARCA}`,
    prova: {
      sql: `select not convalidated from pg_constraint where conname = 'senhas_acesso_empresa_id_fkey'`,
      espera: 't',
    },
  },
  {
    id: 'f64-lote2-sem-coluna',
    roteiro: 'catalogo_policies.sql',
    classe: 'integridade-estrutural',
    derruba: ['15e', '15f'],
    porque:
      'import_termos_estado perde empresa_id: uma das onze sai do lote 2 calada — o De→Para de estado de uma empresa volta a ser global, e a pendência que o bloco 5 transformou em reprovação (15f) tem de acusar.',
    sql: `alter table public.import_termos_estado drop column empresa_id;  ${MARCA}`,
    prova: {
      sql: `select not exists (select 1 from pg_attribute where attrelid = 'public.import_termos_estado'::regclass and attname = 'empresa_id' and not attisdropped)`,
      espera: 't',
    },
  },
  {
    id: 'f64-kit-sem-gatilho',
    roteiro: 'kit_motivo_da_empresa.sql',
    classe: 'guarda-removida',
    derruba: ['C1', 'C2'],
    porque:
      'O gatilho do kit some: o motivo volta a ser texto livre sem conferência nenhuma no banco — um kit com motivo inexistente, ou com o motivo homônimo de OUTRA empresa, é gravado em silêncio e sobrevive à virada apontando para nada.',
    sql: `drop trigger kits_modelos_motivo_da_empresa on public.kits_modelos;  ${MARCA}`,
    prova: {
      sql: `select not exists (select 1 from pg_trigger where tgrelid = 'public.kits_modelos'::regclass and tgname = 'kits_modelos_motivo_da_empresa')`,
      espera: 't',
    },
  },
  {
    id: 'f64-kit-gatilho-sem-empresa',
    roteiro: 'kit_motivo_da_empresa.sql',
    classe: 'recorte-esquecido',
    derruba: ['C2'],
    porque:
      'O gatilho confere que o motivo EXISTE, mas esquece a EMPRESA: a quebra cross-tenant clássica — um kit da empresa A aceita o motivo da empresa B só porque o código coincide, e passa a aplicar um motivo que A nunca cadastrou.',
    sql: mutarFuncaoSemReplace(
      'public.kit_motivo_da_empresa()',
      `     where m.codigo = v_motivo
       and m.empresa_id = new.empresa_id
`,
      `     where m.codigo = v_motivo  ${MARCA}
`,
      'f64-kit-gatilho-sem-empresa',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.kit_motivo_da_empresa()'::regprocedure) not like '%m.empresa_id = new.empresa_id%'`,
      espera: 't',
    },
  },
  {
    id: 'f64-checagem-sem-empresa',
    roteiro: 'kit_motivo_da_empresa.sql',
    classe: 'recorte-esquecido',
    derruba: ['C6a'],
    porque:
      'A 13ª checagem confere o código do motivo e esquece a empresa do kit: o kit da empresa A com o motivo que só existe na empresa B deixa de ser contado — o órfão cross-tenant, o caso que a checagem existe para denunciar, some da Integridade e do alarme.',
    sql: mutarFuncao(
      'public.checagens_integridade_nucleo()',
      `          where m.codigo = k.payload->>'motivo'
            and m.empresa_id = k.empresa_id)`,
      `          where m.codigo = k.payload->>'motivo')  ${MARCA}`,
      'f64-checagem-sem-empresa',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.checagens_integridade_nucleo()'::regprocedure) not like '%m.empresa_id = k.empresa_id%'`,
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
  ...F53_ORDEM,
  ...F54_RESTAURACAO,
  ...F55_INTEGRIDADE,
  ...F56_VOCABULARIO,
  ...F59_DOUTRINA,
  ...F60_RECORTE,
  ...REAUDITORIA_PASSO2,
  ...REAUDITORIA_PASSO4,
  ...F62_CARGO,
  ...F63_ACERVO,
  ...F64_LOTE2_E_KIT,
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
    // ⚠ REAPONTADA PELA F55 (10/09/2026), de F55 para F73 — e, de novo, o motivo é
    // escrito, porque reapontar em silêncio é mover uma promessa.
    //
    // A F55 é a fase da observabilidade: funil de erro, sonda de saúde e alarme de
    // integridade. Ela leu esta entrada e MEDIU o que ela pede — um harness em Node
    // com DUAS conexões `psql` simultâneas travando as mesmas linhas em ordens
    // opostas. Isso não é um cenário a mais num roteiro; é construção nova, e
    // construí-la aqui seria a fase seguinte antecipada (regra 1 do CLAUDE.md, e a
    // regra 3 do §4 do PLANO-MULTIEMPRESA).
    //
    // O destino agora é a F73 porque é a única ficha do plano que JÁ EXIGE, por
    // conta própria, um provador com DUAS sessões simultâneas: o canário de
    // isolamento ("a Parte B roda com sessões de dois tenants reais e afirma que
    // cada um vê só o seu"). Quem construir aquele provador tem, no mesmo movimento,
    // a capacidade que falta aqui — e a F55 deixou a Parte B do smoke agendado
    // desenhada para receber a segunda sessão sem ser reescrita
    // (`scripts/smoke/integridade.mjs`, cabeçalho).
    fase: 'F73',
  },
  {
    id: 'f53-view-de-conflitos-perde-o-desempate',
    roteiro: 'conflito_filiais.sql',
    classe: 'desempate-ausente',
    // ⚠ NASCE EM QUARENTENA, não no lote ativo — decidido lendo os dois roteiros que
    // poderiam acusá-la, não por suposição. `derruba` do PAR abaixo é o que ela
    // encostaria SE existisse cenário: nenhum dos dois hoje lê `ultima_mov_tipo`.
    derruba: ['(nenhum rótulo de hoje)'],
    porque:
      'Tira `, m2.ordem desc` do order by que resolve `ultima_mov_tipo` em v_conflitos_filiais — a ÚNICA régua de "última movimentação" da base inteira que a D7 do PLAN-F53 encontrou sem desempate nenhum, com 1448 ativos de produção em empate de created_at esperando por ela.',
    sql: 'remover `, m2.ordem desc` do order by da subconsulta `ultima_mov_tipo` em v_conflitos_filiais',
    indetectavel:
      'Nenhum roteiro lê o valor de `ultima_mov_tipo` sob um cenário de empate. `conflito_filiais.sql` confere contagens e grupos de v_conflitos_filiais, nunca esse campo; `asof_desempate.sql` — a extensão paralela da F53, rótulos 3a..10c — só exercita `rel_estoque_asof` e a trava do estorno de `aplicar_movimentacao`, nunca a view de conflitos. Detectar exige catálogo novo: um grupo de conflito entre filiais cujas movimentações empatam em (data, created_at), com a asserção lendo a coluna.',
    fase: 'F53B',
  },
]

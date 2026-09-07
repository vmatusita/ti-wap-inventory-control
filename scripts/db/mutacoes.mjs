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
    // no ar". A mutação isolada da âncora está na QUARENTENA, com a fase que adota.
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
/** @type {Mutacao[]} */
const IMPORT_SUBSTITUIR = [
  {
    id: 'import-sem-revalidacao-de-contagens',
    roteiro: 'import_substituir.sql',
    classe: 'guarda-neutralizada',
    derruba: ['2'],
    porque:
      'Reabre o TOCTOU que a 0040 fechou: uma chamada forjada sem as contagens volta a pular por inteiro a revalidação do estado vivo — o acervo da filial é apagado sobre uma foto velha da tela.',
    sql: mutarFuncao(
      'public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)',
      `  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then`,
      `  if false then  ${MARCA}`,
      'import-sem-revalidacao-de-contagens',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)'::regprocedure)
              like '%2b. revalidação%if false then  --%'`,
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
      'public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)',
      `  if coalesce(btrim(p_backup_path), '') = '' then`,
      `  if false then  ${MARCA}`,
      'import-sem-exigencia-de-backup',
    ),
    prova: {
      sql: `select pg_get_functiondef('public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)'::regprocedure)
              like '%1b. backup obrigatório%if false then  --%'`,
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
// ⚠⚠ SABOTAGEM TEMPORÁRIA DA F47 — ESTE BLOCO SAI NO COMMIT SEGUINTE.
// Existe para provar, com saída real no CI, que o injetor distingue "a mutação NÃO
// APLICOU" de "a mutação NÃO FOI DETECTADA". São diagnósticos diferentes, e confundi-los
// é o que faz um injetor mentir: SQL com erro deixa o roteiro verde e se disfarça de
// asserção fraca. A policy citada abaixo não existe em lugar nenhum do repositório.
/** @type {Mutacao[]} */
const SABOTAGEM_SQL_QUE_NAO_APLICA = [
  {
    id: 'sabotagem-f47-sql-que-nao-aplica',
    roteiro: 'papeis_rls.sql',
    classe: 'sabotagem-temporaria',
    derruba: ['2e'],
    porque:
      'SABOTAGEM da F47: cita uma policy inexistente, para provar que o injetor reporta "NÃO aplicou" e nunca "NÃO detectada". Sai no commit seguinte.',
    sql: `alter policy "esta policy nao existe em lugar nenhum" on public.ativos using (true);`,
  },
]

/** @type {Mutacao[]} */
export const MUTACOES = [
  ...SABOTAGEM_SQL_QUE_NAO_APLICA,
  ...PAPEIS_RLS,
  ...SEGURANCA_CATALOGO,
  ...CARGO_DEV,
  ...DEV_DESTRUTIVO,
  ...IMPORT_SUBSTITUIR,
  ...CONFLITO_FILIAIS,
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
 */
/** @type {EmQuarentena[]} */
export const QUARENTENA = [
  {
    id: 'conflito-serializacao-por-advisory-lock',
    roteiro: 'conflito_filiais.sql',
    classe: 'concorrencia',
    derruba: ['(nenhum rótulo de hoje)'],
    porque:
      'A `pg_advisory_xact_lock` que a 0100 acrescentou serializa duas sessões que apagam grupos de conflito que se cruzam — sem ela, o lock em dois tempos deixa duas transações travarem as mesmas linhas em ordens opostas e uma delas morre em deadlock.',
    sql: 'remover a chamada a pg_advisory_xact_lock de apagar_ativos_conflito_filiais',
    indetectavel:
      'Nenhuma asserção do roteiro abre uma SEGUNDA conexão. Dentro de uma transação psql sozinha, remover a trava não muda resultado nenhum — o roteiro fica verde e a mutação se disfarçaria de "asserção fraca" quando o que falta é um cenário CONCORRENTE, que só existe escrevendo catálogo novo.',
    fase: 'F52',
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
    fase: 'F52',
  },
  {
    id: 'gestao-encerrar-sessoes-mira-o-alvo-errado',
    roteiro: 'cargo_dev.sql',
    classe: 'asseracao-fraca',
    derruba: ['(3d não distingue)'],
    porque:
      'Trocar `p_alvo` por outro usuário no `delete from auth.sessions` derrubaria a sessão da pessoa errada — e a RPC continuaria devolvendo sucesso.',
    sql: 'trocar o alvo do delete em encerrar_sessoes_usuario',
    indetectavel:
      'O cenário 3d aceita "0 sessões removidas" como sucesso: ele só confere que não houve exceção, nunca que o delete mirou o usuário certo. É asserção sobre conjunto vazio, e fortalecê-la é matéria da F48.',
    fase: 'F48',
  },
  {
    id: 'ancora-do-termo-sempre-coerente',
    roteiro: 'papeis_rls.sql',
    classe: 'asseracao-fraca',
    derruba: ['(2i-bis-3 não isola a âncora)'],
    porque:
      '`termo_ancora_coerente` passa a devolver sempre `true`: `ativo_ids` volta a ser forjável, e é sobre ele que a autorização por filial decide.',
    sql: `create or replace function public.termo_ancora_coerente(
  p_movimentacao_ids uuid[], p_ativo_ids uuid[]
) returns boolean language sql stable security definer set search_path = public
as $$ select true $$;`,
    // ⚠ ESTA ENTRADA É O ACHADO MAIS INTERESSANTE DA FASE, e ela foi MEDIDA, não
    // suposta: no primeiro ciclo de CI (run 34074319187) a mutação aplicou, a sonda
    // confirmou que pegou, e o cenário 2i-bis-3 continuou VERDE.
    indetectavel:
      'O cenário 2i-bis-3 monta o INSERT com `arquivo_path = \'forjado.docx\'` e um `id` sorteado — a quarta conjunção da policy (`arquivo_path = id::text || \'.docx\'`) já o recusa sozinha, antes de a âncora importar. O cenário prova a CONJUNÇÃO das quatro invariantes, embora a mensagem de ✓ dele afirme "a âncora está no ar", que é mais do que ele sabe. Isolar a âncora exige um cenário cujo `arquivo_path` seja coerente e cuja ÚNICA barreira seja ela — catálogo novo, que é matéria da F48.',
    fase: 'F48',
  },
  {
    id: 'leitura-de-colaboradores-sem-piso',
    roteiro: 'papeis_rls.sql',
    classe: 'asseracao-fraca',
    derruba: ['(1j e 4i não distinguem)'],
    porque:
      'Desligar a RLS de `colaboradores` exporia o cadastro de pessoas a perfil desativado — o mesmo piso de leitura da 0070 que a mutação de `ativos` exercita.',
    sql: 'alter table public.colaboradores disable row level security',
    indetectavel:
      'O roteiro não planta NENHUMA linha em `colaboradores` antes de 1j/4i: as duas asserções passam sobre conjunto vazio, e "viu 0 linhas" continua verdadeiro com a RLS desligada. Precisa de fixture, que é catálogo novo.',
    fase: 'F48',
  },
]

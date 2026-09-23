-- =============================================================================
-- 0173_guarda_empresa.sql — F65 (23/09/2026): a empresa de um registro não muda, o termo é da empresa dele, e a diagonal
-- nome × apelido é por empresa
-- =============================================================================
-- classe: ADITIVA (duas funções de gatilho e 21 gatilhos novos; a função da diagonal recriada com duas linhas a mais)
--
-- A última migration da F65 antes do deploy (a 0174 é o passo pós-deploy): os três gatilhos que a integridade do tenant
-- exige e que nenhuma FK alcança.
--
-- 1) `public.guarda_empresa()` e o gatilho `<tabela>_guarda_empresa` nas 20 tabelas de negócio (`k_negocio`, a fonte
--    única em supabase/tests/catalogo_policies.sql; a trava `supabase/tests/imutabilidade_tenant.sql` reprova tabela de
--    negócio sem ele — decisão 2 do Johnny):
--    · recusa com 42501 TODA mudança de `empresa_id` (`new.empresa_id is distinct from old.empresa_id`), com a frase
--      "A empresa de um registro não muda (tabela …)." — nenhum valor, só o nome da tabela (código);
--    · SEM EXCEÇÃO PARA A JANELA `estoque.dev_destrutivo`: o corpo não a cita. Mudar a empresa de um ativo não é
--      operação legítima nem para o dev; é a definição do defeito. Por isso ela vai TAMBÉM em `movimentacoes` e
--      `lancamentos_item`: `guarda_acervo` (0081) deixa o UPDATE passar com a janela aberta (fato 13), e só com a guarda
--      nelas o "sem exceção" vale literalmente. Fora da janela, `*_guarda_acervo` dispara antes (ordem alfabética) e
--      também dá 42501;
--    · `BEFORE UPDATE OF empresa_id … FOR EACH ROW`: custo zero no update normal (o gatilho só dispara com a coluna no
--      SET). A ressalva da doc do PG 17 (sql-createtrigger): "changes made to the row's contents by BEFORE UPDATE
--      triggers are not considered" — um gatilho BEFORE que mudasse `empresa_id` escaparia; a trava de imutabilidade
--      exige que nenhum das 20 atribua `new.empresa_id` ou `new` inteiro (hoje, nenhum). `INSERT … ON CONFLICT DO UPDATE
--      SET empresa_id = …` dispara os gatilhos de UPDATE ("will fire both kinds of triggers as needed") — coberto.
--      `UPDATE … SET empresa_id = <a mesma>` dispara e PASSA: não é troca de empresa;
--    · SECURITY INVOKER por extenso, `search_path = public`; ela não lê tabela nenhuma (só `new`/`old`). `revoke all` de
--      `public`, `anon`, `authenticated` E `service_role` — o molde de `guarda_acervo` (0081), o mais forte: ela só é
--      chamável como gatilho, e disparar gatilho não exige EXECUTE de quem escreve.
--
-- 2) `public.termo_da_empresa()` e o gatilho `termos_gerados_ids_da_empresa` (decisão 8 do PLAN): `termos_gerados` guarda os
--    ids em `uuid[]` (`movimentacao_ids`, `ativo_ids`), e FK não alcança array (fato 16). O gatilho confere que TODO id
--    distinto dos dois arrays existe em `movimentacoes`/`ativos` COM A EMPRESA DO TERMO — na forma POSITIVA, que continua
--    certa depois da F66 (sob a RLS recortada, o id de outra empresa é invisível e conta como "não é da empresa do
--    termo"; a forma negativa passaria calada). Confere a ENTRADA: no INSERT, sempre; no UPDATE, só quando um dos
--    arrays ou a empresa MUDA — `persistirTermo` (src/lib/actions/termos.ts) reenvia o objeto inteiro no UPDATE de
--    reuso, com os mesmos arrays, e passa sem conferir. Recusa com 23503 (a semântica de referência inválida, a do kit
--    da 0164) e a frase própria "O termo cita movimentação ou ativo que não é da empresa do termo." — sem valor. SEM
--    checagem de integridade nova: a contagem do "antes" provou o dado coerente (0 nos dois bancos). INVOKER, `revoke
--    all` dos quatro papéis.
--
-- 3) `public.vocabulario_unidades_guarda()` — A DIAGONAL POR EMPRESA (fato 15). Os índices nome × nome e apelido ×
--    apelido são por empresa desde a 0170; a diagonal nome × apelido, que só este gatilho cobre, procurava sobre TODAS
--    as filiais do sistema — a empresa B não conseguiria chamar uma filial de "Centro" se a A tivesse o apelido
--    "centro", e a mensagem citaria a filial da OUTRA empresa (`v_outra.nome`, vazamento pela mensagem). O corpo é o da
--    0139 BYTE A BYTE, com DUAS linhas a mais, e só elas:
--      · no ramo `unidades_apelidos`, a procura do nome de outra filial ganha `and f.empresa_id = new.empresa_id`;
--      · no ramo `filiais`, a procura do apelido ganha `and ua.empresa_id = new.empresa_id`.
--    O ramo "nome próprio da filial dona" já é da mesma empresa (a FK composta de `unidades_apelidos`, 0167). O LOCK
--    fica global (`hashtext('vocabulario_unidades_guarda')`): serializar renomeações entre empresas não custa nada, e
--    mexer nele é mexer nas travas advisory (decisão 10). `create or replace` preserva dono e ACL (a de hoje — não é
--    mudada aqui). A prova do "resto byte a byte": na mesa, o corpo desta migration MENOS as duas linhas é IGUAL ao da
--    0139 (src/lib/itens/migrations-f38.test.ts); nos bancos, o md5 do `prosrc` antes × depois.
--
-- ⚠ AS LEITURAS DE `empresa_id` ANTES DA F66: as três funções leem a coluna — integridade e identidade, não recorte;
-- nenhuma decide o que alguém VÊ. São as exceções NOMINAIS de `k_leitura_tenant` (supabase/tests/catalogo_policies.sql),
-- cada uma com as tabelas que pode ler, por comando.
--
-- O LOCK: CREATE TRIGGER toma SHARE ROW EXCLUSIVE em cada tabela (doc do PG 17) — bloqueia escrita por milissegundos, até
-- o commit. A ordem das tabelas é a do caminho de escrita do app (o acervo quente primeiro, na ordem da 0161). `lock_timeout`
-- de 2 s por `set`/`reset`, sem `begin`/`commit`; se o lock não vier: registrar e repetir, no máximo três vezes em 30 min.
-- =============================================================================

set lock_timeout = '2s';

-- ---------------------------------------------------------------------------
-- 1) guarda_empresa — a empresa de um registro não muda
-- ---------------------------------------------------------------------------
create function public.guarda_empresa()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa de um registro não muda (tabela %).', tg_table_name
      using errcode = '42501',
            hint = 'Um registro pertence à empresa em que nasceu; para outra empresa, cadastre-o de novo lá.';
  end if;
  return new;
end;
$$;

comment on function public.guarda_empresa() is
  'F65 (0173, 23/09/2026): a função dos gatilhos <tabela>_guarda_empresa (BEFORE UPDATE OF empresa_id, por linha) nas 20 tabelas de negócio. Recusa com 42501 TODA mudança de empresa_id — sem exceção para a janela estoque.dev_destrutivo. SECURITY INVOKER; não lê tabela nenhuma (só new/old). Lê empresa_id antes da F66: integridade, não recorte — exceção nominal de k_leitura_tenant.';

revoke all on function public.guarda_empresa() from public, anon, authenticated, service_role;

create trigger ativos_guarda_empresa
  before update of empresa_id on public.ativos
  for each row execute function public.guarda_empresa();
create trigger movimentacoes_guarda_empresa
  before update of empresa_id on public.movimentacoes
  for each row execute function public.guarda_empresa();
create trigger pendencias_item_guarda_empresa
  before update of empresa_id on public.pendencias_item
  for each row execute function public.guarda_empresa();
create trigger lancamentos_item_guarda_empresa
  before update of empresa_id on public.lancamentos_item
  for each row execute function public.guarda_empresa();
create trigger anotacoes_guarda_empresa
  before update of empresa_id on public.anotacoes
  for each row execute function public.guarda_empresa();
create trigger termos_gerados_guarda_empresa
  before update of empresa_id on public.termos_gerados
  for each row execute function public.guarda_empresa();
create trigger colaboradores_guarda_empresa
  before update of empresa_id on public.colaboradores
  for each row execute function public.guarda_empresa();
create trigger itens_guarda_empresa
  before update of empresa_id on public.itens
  for each row execute function public.guarda_empresa();
create trigger filiais_guarda_empresa
  before update of empresa_id on public.filiais
  for each row execute function public.guarda_empresa();
create trigger tipos_item_guarda_empresa
  before update of empresa_id on public.tipos_item
  for each row execute function public.guarda_empresa();
create trigger motivos_guarda_empresa
  before update of empresa_id on public.motivos
  for each row execute function public.guarda_empresa();
create trigger kits_modelos_guarda_empresa
  before update of empresa_id on public.kits_modelos
  for each row execute function public.guarda_empresa();
create trigger unidades_apelidos_guarda_empresa
  before update of empresa_id on public.unidades_apelidos
  for each row execute function public.guarda_empresa();
create trigger import_prefixos_patrimonio_guarda_empresa
  before update of empresa_id on public.import_prefixos_patrimonio
  for each row execute function public.guarda_empresa();
create trigger import_termos_categoria_guarda_empresa
  before update of empresa_id on public.import_termos_categoria
  for each row execute function public.guarda_empresa();
create trigger import_termos_estado_guarda_empresa
  before update of empresa_id on public.import_termos_estado
  for each row execute function public.guarda_empresa();
create trigger relatorios_gerados_guarda_empresa
  before update of empresa_id on public.relatorios_gerados
  for each row execute function public.guarda_empresa();
create trigger import_logs_guarda_empresa
  before update of empresa_id on public.import_logs
  for each row execute function public.guarda_empresa();
create trigger senhas_acesso_guarda_empresa
  before update of empresa_id on public.senhas_acesso
  for each row execute function public.guarda_empresa();
create trigger eventos_admin_guarda_empresa
  before update of empresa_id on public.eventos_admin
  for each row execute function public.guarda_empresa();

-- ---------------------------------------------------------------------------
-- 2) termo_da_empresa — o termo cita só movimentação e ativo da empresa dele
-- ---------------------------------------------------------------------------
create function public.termo_da_empresa()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- No UPDATE, só confere quando um dos arrays ou a empresa MUDA: o reuso de `persistirTermo` reenvia os mesmos arrays.
  if tg_op = 'UPDATE'
     and new.movimentacao_ids is not distinct from old.movimentacao_ids
     and new.ativo_ids is not distinct from old.ativo_ids
     and new.empresa_id is not distinct from old.empresa_id then
    return new;
  end if;
  -- A forma POSITIVA: todo id distinto existe COM a empresa do termo.
  if (select count(distinct m.id) from public.movimentacoes m
       where m.id = any (new.movimentacao_ids) and m.empresa_id = new.empresa_id)
       <> (select count(distinct x.id) from unnest(new.movimentacao_ids) as x(id) where x.id is not null)
     or (select count(distinct a.id) from public.ativos a
          where a.id = any (new.ativo_ids) and a.empresa_id = new.empresa_id)
       <> (select count(distinct x.id) from unnest(new.ativo_ids) as x(id) where x.id is not null) then
    raise exception 'O termo cita movimentação ou ativo que não é da empresa do termo.'
      using errcode = '23503',
            hint = 'Um termo só reúne movimentações e ativos da empresa em que é emitido.';
  end if;
  return new;
end;
$$;

comment on function public.termo_da_empresa() is
  'F65 (0173, 23/09/2026): a função do gatilho termos_gerados_ids_da_empresa (BEFORE INSERT OR UPDATE OF movimentacao_ids, ativo_ids, empresa_id, por linha). Recusa (23503, frase própria) o termo que cita, em movimentacao_ids ou ativo_ids, id que não existe COM a empresa do termo — a forma positiva, certa também sob a RLS recortada da F66. Confere a ENTRADA: no UPDATE, só quando um array ou a empresa muda. SECURITY INVOKER. Lê empresa_id antes da F66: integridade, não recorte — exceção nominal de k_leitura_tenant.';

revoke all on function public.termo_da_empresa() from public, anon, authenticated, service_role;

create trigger termos_gerados_ids_da_empresa
  before insert or update of movimentacao_ids, ativo_ids, empresa_id on public.termos_gerados
  for each row execute function public.termo_da_empresa();

-- ---------------------------------------------------------------------------
-- 3) vocabulario_unidades_guarda — a diagonal nome × apelido POR EMPRESA
-- ---------------------------------------------------------------------------
create or replace function public.vocabulario_unidades_guarda()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_chave text;
  v_outra record;
begin
  -- Serializa renomear filial × cadastrar apelido concorrentes: os dois índices
  -- únicos acima (nome×nome, apelido×apelido) não cobrem a DIAGONAL nome×apelido —
  -- sem este lock, duas transações concorrentes passariam as duas pela checagem
  -- abaixo antes de qualquer commit, e o conjunto ficaria ambíguo mesmo assim.
  perform pg_advisory_xact_lock(hashtext('vocabulario_unidades_guarda'));

  if tg_table_name = 'unidades_apelidos' then
    -- `apelido_chave` é `generated always as (...) stored`: dentro de um gatilho
    -- BEFORE ela ainda não foi computada (doc. Postgres, ddl-generated-columns —
    -- "it is not allowed to access generated columns in BEFORE triggers"). A chave
    -- tem de vir da coluna BASE, no mesmo molde do branch `filiais` logo abaixo.
    v_chave := public.vocabulario_chave(new.apelido);

    -- o nome PRÓPRIO da filial dona: "o nome próprio já vale", apelido é redundante.
    if exists (
      select 1 from public.filiais f
       where f.id = new.filial_id and public.vocabulario_chave(f.nome) = v_chave
    ) then
      raise exception 'O termo "%" já é o próprio nome da filial — o nome próprio sempre vale na coluna Site, não precisa de apelido.', new.apelido
        using errcode = 'P0001';
    end if;

    -- o nome de QUALQUER OUTRA filial (ativa ou não — toda filial é unidade conhecida).
    select f.nome into v_outra
      from public.filiais f
     where public.vocabulario_chave(f.nome) = v_chave and f.id <> new.filial_id
       and f.empresa_id = new.empresa_id
     limit 1;
    if found then
      raise exception 'O termo "%" já é o nome da filial "%" — apelido não pode repetir o nome de outra filial.', new.apelido, v_outra.nome
        using errcode = 'P0001';
    end if;

    -- apelido × apelido (mesma filial ou outra) É o índice único
    -- (unidades_apelidos_apelido_chave_uidx, 23505) — de propósito FORA desta
    -- guarda (PLAN-F56.md, Decisão 2: "apelido × apelido: índice único..."). A
    -- guarda cobre só a DIAGONAL nome×apelido, que nenhum índice cobre sozinho.

  elsif tg_table_name = 'filiais' then
    if tg_op = 'UPDATE' and public.vocabulario_chave(old.nome) = public.vocabulario_chave(new.nome) then
      return new; -- a chave não mudou (só caixa/acento) — nada a conferir.
    end if;
    v_chave := public.vocabulario_chave(new.nome);

    select ua.apelido, ua.filial_id into v_outra
      from public.unidades_apelidos ua
     where ua.apelido_chave = v_chave
       and ua.empresa_id = new.empresa_id
     limit 1;
    if found then
      if v_outra.filial_id = new.id then
        raise exception 'O nome "%" já é apelido desta própria filial — remova o apelido antes de usá-lo como nome.', new.nome
          using errcode = 'P0001';
      else
        raise exception 'O nome "%" já é apelido de outra filial — escolha outro nome.', new.nome
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.vocabulario_unidades_guarda() is
  'F65 (0173, 23/09/2026 — era F56 · Decisão 2, 0139): a diagonal nome×apelido que os índices únicos não cobrem, POR EMPRESA — o nome de outra filial e o apelido são procurados só na empresa da linha, e a mensagem nunca cita filial de outra empresa. Gatilho, não API: revoke all na função. Serializa com pg_advisory_xact_lock (global) antes de conferir. Lê empresa_id antes da F66: integridade, não recorte — exceção nominal de k_leitura_tenant.';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f65-evidencias/impressao-catalogo.sql: 20 gatilhos `*_guarda_empresa` (BEFORE UPDATE OF empresa_id, por linha) +
--   `termos_gerados_ids_da_empresa`; `funcoes.as_da_f65` com as três; `md5_sem_as_da_f65` IGUAL ao do "antes" (nenhuma outra
--   função mudou); `advisory` com as mesmas 12 e 16 chamadas (a da diagonal com o md5 novo).
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 2):
--   drop trigger if exists termos_gerados_ids_da_empresa on public.termos_gerados;
--   drop function if exists public.termo_da_empresa();
--   drop trigger if exists <tabela>_guarda_empresa on public.<tabela>;   -- as 20
--   drop function if exists public.guarda_empresa();
--   a diagonal volta ao corpo da 0139 BYTE A BYTE (o arquivo de rollback recria `vocabulario_unidades_guarda` com o
--   texto copiado da 0139), e o comentário da função volta ao da 0139.

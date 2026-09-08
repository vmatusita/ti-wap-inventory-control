-- =============================================================================
-- 0132 — As guardas de escopo no-op (F52)
-- =============================================================================
-- Põe dentro do Postgres as guardas de PERTENCIMENTO que hoje não existem, e que na virada
-- multiempresa seriam a única coisa entre um administrador e o dado do vizinho. Todas
-- escritas de forma que, com UMA empresa, NÃO MUDAM NADA.
--
-- O que esta migration NÃO faz, e é deliberado: nenhum `empresa_id`, nenhuma tabela
-- `empresas`/`membros`/`plataforma_admins`, nenhum `force row level security`, nenhum
-- recorte de leitura. Isso é F62→F65. Aqui entram só as FECHADURAS, com o corpo delas
-- devolvendo hoje o veredito que preserva o comportamento atual.
--
-- POR QUE FECHADURA ANTES DE CHAVE. As cinco RPCs de gestão de conta da 0074 decidem por
-- CARGO de quem chama e por propriedades do ALVO — nunca por pertencimento. Um administrador
-- de qualquer empresa rebaixa, desativa, revincula e expulsa conta de qualquer outra, e a
-- trilha registra o ato sem impedi-lo. As cinco passam por `exigir_gestao_de`, então UMA
-- condição protege as cinco. É o item de melhor retorno do dossiê inteiro.
--
-- ---------------------------------------------------------------------------
-- O QUE ENTRA
-- ---------------------------------------------------------------------------
--   1. `mesmo_escopo_de_gestao(uuid)`      — nova, devolve `true` hoje. Chamada de dentro
--                                             de `exigir_gestao_de`.
--   2. `exigir_gestao_de`                  — recriada: só a guarda nova.
--   3. `existe_outro_admin_ativo`          — DROP + CREATE com o parâmetro de escopo.
--   4. `prefixo_backup_import(smallint)`   — nova, molde de `prefixo_backup_reset`.
--   5. `import_validar_plano`              — recriada: cascata de três guardas do backup,
--                                             confirmação digitada e idempotência.
--   6. `importar_ativos_substituir`        — recriada: só `pode_escrever_filial`.
--   7. `exigir_ativos_da_empresa(uuid[])`  — nova, devolve sem levantar hoje.
--   8. `apagar_ativos_conflito_filiais`    — recriada: só a chamada nova.
--   9. índice de `import_logs` para a janela de idempotência.
--  10. o `comment` de `eventos_admin.detalhe`, que descrevia o mundo errado.
--
-- ---------------------------------------------------------------------------
-- ⚠ CAMINHO B (RUNBOOK-BANCO.md). Esta migration recria DUAS funções cujo corpo contém
-- `delete from public.ativos` — `importar_ativos_substituir` e
-- `apagar_ativos_conflito_filiais` — e o gate do modo automático bloqueia DDL com essa
-- string em QUALQUER projeto. Ela é aplicada à mão no SQL Editor.
--
-- ⚠ ORDEM OBRIGATÓRIA: a `0131` (F51) precisa estar aplicada ANTES desta. Medido em
-- 08/09/2026: ela NÃO estava aplicada nem em produção nem no ensaio (zero auxiliares
-- `import_*` nos dois). As duas vão na MESMA janela, NA ORDEM, ou nenhuma vai — esta
-- recria `import_validar_plano` e `importar_ativos_substituir`, que só existem na forma
-- decomposta depois da 0131.
--
-- ---------------------------------------------------------------------------
-- A ORDEM DE ROLLBACK (regra 10 do §4 do PLANO-MULTIEMPRESA) — o inverso da de apply:
--   1. `create or replace` de `apagar_ativos_conflito_filiais` com o corpo da 0100.
--   2. `create or replace` de `importar_ativos_substituir`     com o corpo da 0131.
--   3. `create or replace` de `import_validar_plano`           com o corpo da 0131.
--   4. `create or replace` de `exigir_gestao_de`               com o corpo da 0074.
--   5. `drop` da `existe_outro_admin_ativo(uuid, uuid)` + `create` da de 1 argumento da
--      0074 + REEMITIR `revoke all … from public, anon, service_role` e o `revoke` de
--      `authenticated` da 0078. É o único passo que perde privilégio, porque é o único DROP.
--   6. `drop function` de `mesmo_escopo_de_gestao`, `exigir_ativos_da_empresa` e
--      `prefixo_backup_import`.
--   7. `drop index` de `import_logs_filial_hash_idx`.
-- Os passos 1→4 são `create or replace` PUROS (assinatura idêntica): nenhum grant se perde.
-- Rollback PARCIAL que deixe esta migration pela metade NÃO é estado de repouso válido.
-- =============================================================================


-- =============================================================================
-- 1/10 · mesmo_escopo_de_gestao — a fechadura das cinco RPCs de conta
-- =============================================================================
-- Hoje devolve `true` para todo alvo: com uma empresa, todo mundo está no mesmo escopo, e
-- a condição em `exigir_gestao_de` é logicamente inerte. NÃO É CÓDIGO MORTO — é o ponto de
-- injeção nomeado, com o chamador já no lugar, para a F65 lhe dar corpo trocando SÓ esta
-- função (`create or replace`), sem tocar nas cinco RPCs nem em `exigir_gestao_de`.
--
-- ⚠ PRIVILÉGIO: ela nasce FECHADA NOS QUATRO PAPÉIS, que é o estado final das duas
-- auxiliares irmãs depois da 0078 — `exigir_gestao_de` e `existe_outro_admin_ativo`
-- ganharam `grant` a `authenticated` na 0074 e foram fechadas na migration seguinte, depois
-- de uma leitura de advisors. Nascer aberta aqui repetiria o mesmo erro no mesmo commit e
-- reprovaria a asserção de privilégio de `cargo_dev.sql`. Ela é chamada por `perform` de
-- dentro de uma `security definer`, que roda como o DONO — não precisa de grant nenhum.
create or replace function public.mesmo_escopo_de_gestao(p_alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- F52: com UMA empresa, todo alvo está no mesmo escopo de quem gere.
  -- F65 troca este corpo pelo predicado real (o alvo e o autor na mesma empresa).
  -- O parâmetro é aceito e IGNORADO de propósito — é o que torna a guarda um no-op
  -- verificável em vez de uma promessa em comentário.
  select true
$$;

comment on function public.mesmo_escopo_de_gestao(uuid) is
  'F52: o alvo pertence ao mesmo escopo de gestão de quem chama? Guarda de PERTENCIMENTO das cinco RPCs de conta da 0074, chamada de dentro de exigir_gestao_de. Devolve true hoje (uma empresa): é a fechadura no-op que a F65 preenche trocando SÓ esta função. Fechada nos quatro papéis, como as duas auxiliares irmãs depois da 0078.';

revoke all on function public.mesmo_escopo_de_gestao(uuid) from public, anon, authenticated, service_role;


-- =============================================================================
-- 2/10 · exigir_gestao_de — recriada com a guarda de pertencimento
-- =============================================================================
-- `create or replace` PURO: assinatura idêntica à da 0074, nenhum grant perdido.
-- O diff contra a 0074 é EXCLUSIVAMENTE o bloco novo — nenhuma linha removida.
create or replace function public.exigir_gestao_de(p_alvo uuid, p_papel_pedido public.papel_usuario default null)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel_alvo public.papel_usuario;
  v_toca_dev   boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  -- Autoproteção (decisão 4): vale para TODOS os cargos, dev incluído.
  if p_alvo = (select auth.uid()) then
    raise exception 'Você não pode fazer isso com o seu próprio acesso. Peça a outro administrador.'
      using errcode = '42501';
  end if;

  select p.papel into v_papel_alvo from public.profiles p where p.id = p_alvo;
  if v_papel_alvo is null then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  -- ---------- F52: PERTENCIMENTO ----------
  -- A guarda de escopo entra AQUI, e a posição é a decisão 1 da fase:
  --   · DEPOIS da leitura do perfil do alvo, porque o alvo inexistente tem de continuar
  --     respondendo "Usuário não encontrado" (P0002). Entrar antes trocaria uma mensagem
  --     correta por outra que descreve o mundo errado.
  --   · ANTES do ramo de cargo, porque pertencimento é uma recusa mais fundamental que
  --     patente: um administrador de OUTRA organização que caísse no ramo de cargo leria
  --     "Esta ação é restrita a administradores" — falso, e mandaria investigar a coisa
  --     errada. É o mesmo raciocínio que erros.ts já registra para a mesa de conflitos.
  -- Com uma empresa só, `mesmo_escopo_de_gestao` devolve `true` e esta condição é inerte.
  -- UMA condição protege as CINCO RPCs de gestão de conta, porque as cinco passam por aqui.
  if not public.mesmo_escopo_de_gestao(p_alvo) then
    raise exception 'Este usuário não pertence à sua organização.'
      using errcode = '42501';
  end if;

  v_toca_dev := (v_papel_alvo = 'dev') or (p_papel_pedido = 'dev');

  if v_toca_dev then
    if not public.e_dev() then
      raise exception 'Só um desenvolvedor pode gerir o cargo Desenvolvedor.'
        using errcode = '42501';
    end if;
  else
    if not public.e_admin() then
      raise exception 'Esta ação é restrita a administradores.'
        using errcode = '42501';
    end if;
  end if;
end;
$$;

comment on function public.exigir_gestao_de(uuid, public.papel_usuario) is
  'F22/F52: guarda comum das RPCs de gestão de usuários. Levanta 42501 se: não há sessão; o alvo é o próprio autor (autoproteção); o alvo NÃO PERTENCE ao escopo de gestão de quem chama (F52, via mesmo_escopo_de_gestao — inerte com uma empresa); o alvo é dev ou o cargo pedido é dev e o autor não é dev; ou o autor não é de nível administrador. P0002 se o alvo não existe.';


-- =============================================================================
-- 3/10 · existe_outro_admin_ativo — o parâmetro de escopo
-- =============================================================================
-- ⚠ POR QUE UM `drop` E NÃO UM `create or replace`. Acrescentar `p_escopo uuid default
-- null` por `create or replace` NÃO substitui a função: `create or replace` casa pela
-- LISTA DE TIPOS DOS ARGUMENTOS, então nasceria uma SEGUNDA função. E com as duas
-- coexistindo, as três chamadas de UM argumento que já existem no banco
-- (0074:176, 0074:220, 0074:319) passariam a levantar
--     42725  function public.existe_outro_admin_ativo(uuid) is not unique
-- EM TEMPO DE EXECUÇÃO — a troca de cargo, a desativação e o apagamento de conta
-- quebrariam de uma vez, e nenhum erro apareceria no apply. Medido em begin/rollback no
-- ensaio (PG 17.6) em 08/09/2026; a evidência está em docs/f52-evidencias/.
--
-- Com o `drop` ANTES, sobra UMA função, e as três chamadas de um argumento resolvem para
-- ela com `p_escopo => null`. NENHUMA das três RPCs precisa ser recriada — é o que mantém
-- o diff desta migration no que a fase promete.
drop function if exists public.existe_outro_admin_ativo(uuid);

create function public.existe_outro_admin_ativo(p_excluindo uuid, p_escopo uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.papel in ('dev', 'admin')
       and p.ativo
       and p.excluido_em is null
       and p.id <> p_excluindo
       -- ---------- F52: O RECORTE ----------
       -- `p_escopo is null` significa SEM RECORTE, e é o que as três chamadas de um
       -- argumento produzem hoje: o conjunto contado é EXATAMENTE o de antes desta
       -- migration.
       --
       -- ⚠ A FORMA É DELIBERADA. Escrever `and <coluna> = p_escopo` faria a comparação
       -- virar NULL quando o escopo não viesse, o `exists` devolveria FALSE, e a trava do
       -- último administrador passaria a RECUSAR TUDO — trocando um defeito silencioso por
       -- um travamento barulhento. É o risco que o próprio plano nomeia. Por isso o escopo
       -- entra em DISJUNÇÃO GUARDADA (`p_escopo is null or …`), e nunca em igualdade crua.
       -- Há asserção dedicada em cargo_dev.sql provando que escopo nulo não recusa nada.
       --
       -- F65 troca o `true` do segundo termo pelo predicado real (o alvo na empresa
       -- p_escopo). A CONTA DE PLATAFORMA fica fora do denominador quando existir: um
       -- sistema cujo único administrador é o operador da plataforma está, para aquele
       -- cliente, SEM administrador. `plataforma_admins` não existe no schema hoje —
       -- medido em 08/09/2026 —, então a regra está escrita e não implementada, e o
       -- cabeçalho de cargo_dev.sql a repete para quem for fazer a F65.
       and (p_escopo is null or true)
  )
$$;

comment on function public.existe_outro_admin_ativo(uuid, uuid) is
  'F22/F52: sobra alguma outra conta de NÍVEL ADMINISTRADOR (dev ou admin) ativa e não apagada, além da informada? Insumo da trava "o sistema nunca fica sem administrador". dev conta de propósito. F52 acrescentou p_escopo: null = SEM RECORTE (o comportamento de sempre); o recorte entra em disjunção guardada para que escopo ausente NUNCA faça a função recusar tudo.';

revoke all on function public.existe_outro_admin_ativo(uuid, uuid) from public, anon, authenticated, service_role;


-- =============================================================================
-- 4/10 · prefixo_backup_import — o backup do import amarrado à FILIAL
-- =============================================================================
-- Molde EXATO de `prefixo_backup_reset` (0089) e `prefixo_backup_conflito` (0100):
-- `immutable`, `set search_path`, fechada nos quatro papéis. Uma função só, para que a RPC
-- e a Server Action leiam a MESMA régua — mexeu num, mexa no outro, e o roteiro denuncia.
--
-- ⚠ POR ID, NÃO POR SLUG. A Server Action gravava em `<slug>/<timestamp>.json`. O slug
-- colide quando deixar de ser único global, e com `upsert:false` o segundo import falharia
-- por causa do primeiro. O id da filial é estável e já é a chave de escrita em todo o resto
-- do sistema.
create or replace function public.prefixo_backup_import(p_filial smallint)
returns text
language sql
immutable
set search_path = public
as $$
  select 'import/filial-' || p_filial::text || '/'
$$;

comment on function public.prefixo_backup_import(smallint) is
  'F52: o prefixo obrigatório do caminho do backup de um import de startup — import/filial-N/. Espelha o caminho que a Server Action grava. Existe para que a RPC possa exigir que o backup informado seja o backup DAQUELA filial, e não um qualquer que por acaso exista no bucket. Por ID e não por slug: o slug colide quando deixar de ser único global.';

revoke all on function public.prefixo_backup_import(smallint) from public, anon, authenticated, service_role;


-- =============================================================================
-- 5/10 · import_validar_plano — a cascata de três, a confirmação e a idempotência
-- =============================================================================
-- `create or replace` PURO. O diff contra a 0131 é o bloco 1b inteiro (que ganhou as duas
-- guardas que faltavam e o errcode 22023 das irmãs), mais os blocos 1b-ter e 1b-quater, mais
-- as quatro variáveis novas no `declare`. Nenhum outro bloco muda.
create or replace function public.import_validar_plano(
  p_plano       jsonb,
  p_backup_path text,
  p_correcoes   jsonb,
  p_filial      smallint
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e             jsonb;
  v_total_plano int;
  v_prefixo     text;    -- F52: o prefixo obrigatório do backup desta filial
  v_confirmacao text;    -- F52: a confirmação digitada, que agora viaja em p_plano
  v_filial_nome text;    -- F52: o nome da filial — o texto que a confirmação tem de casar
  v_hash        text;    -- F52: o sha-256 do arquivo, para a janela de idempotência
begin
  -- ---------- 1b. backup obrigatório — A CASCATA DE TRÊS (F52) ----------
  -- Antes desta fase a guarda era só a primeira das três: `btrim(p_backup_path) <> ''`.
  -- Um ritual de string — qualquer texto não-vazio passava, inclusive o caminho do backup
  -- de OUTRA filial ou de outra operação. É o molde de `resetar_acervo` (0089:116-133)
  -- copiado para cá, com o mesmo errcode 22023 das irmãs.
  if coalesce(btrim(p_backup_path), '') = '' then
    raise exception 'Import destrutivo exige backup_path (o acervo da filial deve ser exportado antes).'
      using errcode = '22023';
  end if;

  v_prefixo := public.prefixo_backup_import(p_filial);
  if btrim(p_backup_path) not like v_prefixo || '%' then
    raise exception 'O backup informado não é o backup DESTA filial (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;

  -- ⚠ A MENSAGEM É DE PROPÓSITO LEXICALMENTE DISJUNTA da irmã do reset, que diz "O backup
  -- informado não existe no bucket". `src/lib/actions/erros.ts` casa por SUBSTRING: se as
  -- duas se sobrepusessem, o operador do IMPORT leria a instrução do RESET ("gere a prévia
  -- novamente" — o import não tem prévia de reset). Por isso aqui se diz "backup deste
  -- import não foi encontrado".
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup deste import não foi encontrado no armazenamento (%). Nada foi apagado.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  -- ---------- 1b-ter. A CONFIRMAÇÃO DIGITADA, AGORA DENTRO DA RPC (F52) ----------
  -- Das três destrutivas, o import era a única cuja confirmação parava na Server Action —
  -- quem chamasse `/rest/v1/rpc/importar_ativos_substituir` direto pulava a conferência.
  --
  -- Ela viaja DENTRO de `p_plano` (e não como parâmetro novo) porque acrescentar
  -- parâmetro — mesmo com `default` — cria uma função NOVA: `create or replace` casa pela
  -- lista de tipos dos argumentos. O overload quebraria `seguranca_catalogo.sql`, que
  -- resolve `importar_ativos_substituir(jsonb, text, jsonb, jsonb)` e espera UMA linha.
  --
  -- A régua de normalização é `upper(btrim(coalesce(...)))` — a MESMA das oito irmãs
  -- destrutivas (0082/0083/0087/0089) e a mesma da gêmea em src/lib/validators/importar.ts.
  -- Ter duas réguas para a mesma pergunta é o defeito que a 0100 aprendeu à força.
  select f.nome into v_filial_nome from public.filiais f where f.id = p_filial;
  v_confirmacao := p_plano->>'confirmacao';
  if upper(btrim(coalesce(v_confirmacao, ''))) <> upper(btrim(coalesce(v_filial_nome, ''))) then
    raise exception 'A confirmação do import não confere: digite exatamente "%" para substituir o acervo desta filial.', v_filial_nome
      using errcode = '22023';
  end if;

  -- ---------- 1b-quater. IDEMPOTÊNCIA POR arquivo_hash (F52) ----------
  -- A coluna existe desde a 0031 com o comentário "idempotência" e NUNCA foi lida. Dois
  -- applies do mesmo arquivo passavam — e o segundo apagava tudo o que o primeiro criou,
  -- com uuids novos e os termos destruídos.
  --
  -- A janela é de 24 h e NÃO é permanente, de propósito: reimport legítimo depois de uma
  -- correção precisa passar. Mensagem própria, para não cair no ramo genérico.
  v_hash := coalesce(p_plano->>'arquivoHash', '');
  if v_hash <> '' and exists (
    select 1 from public.import_logs l
     where l.filial_id = p_filial
       and l.arquivo_hash = v_hash
       and l.criado_em > now() - interval '24 hours'
  ) then
    raise exception 'Este mesmo arquivo já foi importado nesta filial nas últimas 24 horas. Nada foi apagado — se a reimportação é intencional, aguarde a janela ou corrija o arquivo.'
      using errcode = '22023';
  end if;

  -- ---------- 1b-bis. correções (auditoria) ----------
  if p_correcoes is not null and jsonb_typeof(p_correcoes) <> 'array' then
    raise exception 'Correções do import inválidas: esperado um array JSON (recebido %).',
      jsonb_typeof(p_correcoes);
  end if;

  -- ---------- 1c. plano não-vazio ----------
  if jsonb_typeof(p_plano->'ativos') <> 'array'
     or jsonb_array_length(p_plano->'ativos') < 1 then
    raise exception 'Plano de import vazio: ao menos 1 ativo é obrigatório.';
  end if;
  v_total_plano := jsonb_array_length(p_plano->'ativos');

  -- ---------- 1d. validação por ativo (enums; patrimônio só sanidade — F7J) ----------
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    -- F7J (Johnny 20/07/2026): o patrimônio pode ser FORÇADO fora do formato canônico
    -- (`LEA7LYHQH4`, `STF003LOC`…) — o operador marca a linha "usar mesmo assim" e o MOTOR
    -- (src/lib/import/plano.ts + a UI) é o juiz do valor. Aqui fica só a SANIDADE: não-nulo,
    -- não-vazio e ≤ 60 caracteres (a régua de FORMATO canônico saiu daqui). O null segue
    -- válido (importa com pendência). Antes exigia `^[A-Z]{2,4}\d{7}$`.
    if (e->>'patrimonio') is not null
       and (btrim(e->>'patrimonio') = '' or length(e->>'patrimonio') > 60) then
      raise exception 'Patrimônio inválido no plano: "%" (vazio ou longo demais — máx. 60 caracteres).',
        e->>'patrimonio';
    end if;
    if not (e->>'categoria' = any (enum_range(null::public.categoria_ativo)::text[])) then
      raise exception 'Categoria inválida "%" no ativo % (fora do enum categoria_ativo).',
        e->>'categoria', coalesce(e->>'patrimonio', '(sem patrimônio)');
    end if;
    if not (e->>'estadoAlvo' = any (enum_range(null::public.status_ativo)::text[])) then
      raise exception 'Estado-alvo inválido "%" no ativo % (fora do enum status_ativo).',
        e->>'estadoAlvo', coalesce(e->>'patrimonio', '(sem patrimônio)');
    end if;
  end loop;

  -- ---------- 1e. unicidade no plano — espelha os DOIS índices (F7E) ----------
  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    where (x->>'patrimonio') is not null
    group by (x->>'patrimonio'), coalesce(x->>'serviceTag','')
    having count(*) > 1
  ) then
    raise exception 'Plano tem par (patrimônio, service tag) duplicado — cada ativo com patrimônio deve ser único.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_plano->'ativos') x
    where (x->>'patrimonio') is null and coalesce(x->>'serviceTag','') <> ''
    group by coalesce(x->>'serviceTag','')
    having count(*) > 1
  ) then
    raise exception 'Plano tem service tag repetida entre ativos sem patrimônio — a tag é a identidade quando não há patrimônio.';
  end if;

  -- ---------- 2. rede de segurança: termo multi-filial ----------
  if exists (
    select 1
    from public.termos_gerados t
    where exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id = p_filial)
      and exists (select 1 from unnest(t.ativo_ids) aid
                    join public.ativos a on a.id = aid where a.filial_id <> p_filial)
  ) then
    raise exception 'Há termo(s) gerado(s) que misturam esta filial com outra — substituição bloqueada. Resolva os termos antes.';
  end if;

  return v_total_plano;
end $$;

comment on function public.import_validar_plano(jsonb, text, jsonb, smallint) is
  'F51/F52 — tudo o que o import recusa ANTES de escrever: backup (não-vazio, sob o prefixo da filial, e existente no bucket), confirmação digitada, idempotência de 24h por arquivo_hash, forma do plano, enums, unicidade e termo multi-filial. Devolve o total de ativos do plano. Fechada nos quatro papéis.';


-- =============================================================================
-- 6/10 · importar_ativos_substituir — a filial é sua?
-- =============================================================================
-- `create or replace` PURO — a assinatura e o `jsonb_build_object` do retorno continuam
-- byte a byte os da 0094/0131, e é isso que preserva `actions/importar.ts`, os grants, o
-- cache do PostgREST e `seguranca_catalogo.sql` (que resolve a assinatura de 4 argumentos e
-- exige UMA linha). O diff contra a 0131 é EXCLUSIVAMENTE o bloco 1a-bis — nenhuma linha
-- removida.
create or replace function public.importar_ativos_substituir(
  p_plano       jsonb,
  p_backup_path text,
  p_contagens   jsonb,
  p_correcoes   jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid              uuid    := auth.uid();
  v_filial           smallint;
  v_filial_ativa     boolean;
  v_total_plano      int;
  v_data_import      date    := current_date;
  v_obs_marcador     text    := 'import startup ' || to_char(current_date, 'DD/MM/YYYY');
  e                  jsonb;
  v_ativo_id         uuid;
  v_apagado          jsonb;
  v_ativos_criados   int     := 0;
  v_movs_apagadas    int     := 0;
  v_anot_apagadas    int     := 0;
  v_termos_apagados  int     := 0;
  v_arquivos_termos  text[]  := '{}';
  v_log_id           uuid;
  v_conflitos        int     := 0;
begin
  -- ---------- 0. contexto de operador ----------
  if v_uid is null then
    raise exception 'Operador não autenticado: o import só roda numa sessão de operador.';
  end if;

  -- ---------- 0b. GUARDA DE CARGO (F21, migration 0064) ----------
  -- Esta funcao e SECURITY DEFINER: roda como o dono e PASSA POR FORA de toda policy de
  -- RLS. As policies da 0063 nao a alcancam, logo a autorizacao TEM de ser interna.
  -- Sem esta guarda, qualquer logado (inclusive o cargo `consulta`) poderia chamar
  -- /rest/v1/rpc/importar_ativos_substituir com a anon key + o proprio JWT e apagar o
  -- acervo inteiro de uma filial — a operacao mais destrutiva do sistema.
  -- 42501 = insufficient_privilege, o SQLSTATE semanticamente correto (o default de um
  -- `raise` de plpgsql seria P0001). A traducao para pt-BR na UI vem do ramo novo de
  -- permissao em src/lib/actions/erros.ts, que a F21 acrescenta e que casa por code E
  -- por substring da mensagem — sem ele, esta excecao cairia no fallback generico.
  --
  -- F51: ela CONTINUA AQUI, antes de qualquer auxiliar. Movê-la para dentro de uma
  -- delas mudaria a ordem em que a recusa acontece.
  if not public.e_admin() then
    raise exception 'Apenas administradores podem executar o import de startup.'
      using errcode = '42501';
  end if;

  -- ---------- 1a. filial ----------
  v_filial := (p_plano->>'filialId')::smallint;
  select ativo into v_filial_ativa from public.filiais where id = v_filial;
  if v_filial_ativa is null then
    raise exception 'Filial % não encontrada.', v_filial;
  end if;
  if v_filial_ativa is false then
    raise exception 'Filial % está inativa: import bloqueado.', v_filial;
  end if;

  -- ---------- 1a-bis. F52: A FILIAL É SUA? ----------
  -- Em CONJUNÇÃO com o `e_admin()` do bloco 0b — nunca no lugar dele. As duas perguntas
  -- são diferentes: `e_admin()` pergunta "você tem patente?", esta pergunta "esta filial
  -- é sua?". Hoje `pode_escrever_filial` devolve `true` para todo `dev`/`admin` em
  -- QUALQUER filial (0064), e como o bloco 0b já exigiu nível administrador, esta condição
  -- é INERTE — nenhum import legítimo de hoje passa a ser recusado.
  --
  -- ⚠ NÃO "simplifique" isto por parecer redundante. Ela é a única das RPCs destrutivas
  -- que ficou de fora da varredura da 0064, recebe a filial do PAYLOAD e faz
  -- `delete from public.ativos where filial_id = v_filial` sem teto, dentro da janela que
  -- desarma a `guarda_acervo`. Quando o cargo deixar de valer em toda filial, é esta
  -- linha — e não o `e_admin()` — que impede o import de apagar o acervo do vizinho.
  --
  -- A POSIÇÃO importa: depois da resolução da filial (`v_filial` já é não-nulo e a filial
  -- já foi provada existente e ativa — `pode_escrever_filial(null)` devolveria `false`) e
  -- ANTES do advisory lock, para recusar sem tomar trava.
  if not public.pode_escrever_filial(v_filial) then
    raise exception 'Você não tem permissão de escrita na filial % — o import foi recusado.', v_filial
      using errcode = '42501';
  end if;

  -- F51: o advisory lock sobe para a orquestradora pela MESMA régua da janela
  -- destrutiva — efeito local à transação, declarado à vista na função que
  -- orquestra. A POSIÇÃO não muda: resolve a filial, trava, e só então valida.
  perform pg_advisory_xact_lock(hashtext('import_substituir'), v_filial::int);

  -- ---------- 1b→2. tudo o que se recusa antes de escrever ----------
  v_total_plano := public.import_validar_plano(p_plano, p_backup_path, p_correcoes, v_filial);

  -- ---------- 2b. a janela TOCTOU ----------
  perform public.import_revalidar_contagens(p_contagens, v_filial);

  -- ---------- 3. DELETE ordenado (só desta filial) ----------
  -- F23: ABRE a janela da guarda do acervo (0081) para os quatro DELETEs de
  -- `import_apagar_acervo_filial` — e só para eles. Sem esta linha, o trigger
  -- `guarda_acervo` recusaria o import inteiro.
  --
  -- F51: a janela fica AQUI, e não dentro da auxiliar. Existem exatamente DUAS
  -- portas que a abrem (a Zona destrutiva e o import); uma terceira aumentaria a
  -- superfície que `dev_destrutivo.sql` e `seguranca_catalogo.sql` vigiam.
  perform set_config('estoque.dev_destrutivo', 'on', true);
  v_apagado := public.import_apagar_acervo_filial(v_filial);
  -- F23: FECHA a janela imediatamente. `set_config(..., true)` é local à TRANSAÇÃO, não
  -- à chamada: sem este fecho, os INSERTs do passo 4 — e qualquer statement seguinte da
  -- mesma transação — correriam com a guarda desligada. Lição medida na F22 (0073).
  perform set_config('estoque.dev_destrutivo', 'off', true);

  v_movs_apagadas   := (v_apagado->>'movs_apagadas')::int;
  v_anot_apagadas   := (v_apagado->>'anotacoes_apagadas')::int;
  v_termos_apagados := (v_apagado->>'termos_apagados')::int;
  select coalesce(array_agg(t), '{}'::text[]) into v_arquivos_termos
    from jsonb_array_elements_text(v_apagado->'arquivos_termos') t;

  -- ---------- 4. INSERT por ativo do plano ----------
  -- F51 (Decisão 2): o LAÇO fica aqui e as duas auxiliares são chamadas POR ATIVO.
  -- Duas passagens completas mudariam a ordem física das escritas, e quem depende
  -- dela é o trigger `trg_aplicar_movimentacao`, que deriva o estado linha a linha.
  -- Assim a equivalência é por construção, não por argumento.
  for e in select jsonb_array_elements(p_plano->'ativos')
  loop
    v_ativo_id := public.import_criar_ativos(e, v_filial);
    perform public.import_lancar_movimentacoes(
      v_ativo_id, e, v_filial, v_uid, v_data_import, v_obs_marcador
    );
    v_ativos_criados := v_ativos_criados + 1;
  end loop;

  -- ---------- 5. conferência dentro da transação ----------
  perform public.import_conferir_resultado(p_plano, v_filial, v_ativos_criados, v_total_plano);

  -- ---------- 5e. (F24) conflitos abertos por este import ----------
  v_conflitos := public.import_contar_conflitos(v_filial);

  -- ---------- 6. log + retorno ----------
  v_log_id := public.import_gravar_trilha(
    p_plano, v_filial, p_backup_path, p_correcoes, v_uid,
    v_ativos_criados, v_movs_apagadas, v_anot_apagadas, v_termos_apagados, v_conflitos
  );

  return jsonb_build_object(
    'log_id',                   v_log_id,
    'filial_id',                v_filial,
    'ativos_criados',           v_ativos_criados,
    'movs_apagadas',            v_movs_apagadas,
    'anotacoes_apagadas',       v_anot_apagadas,
    'termos_apagados',          v_termos_apagados,
    'arquivos_termos_apagados', to_jsonb(v_arquivos_termos),
    'conflitos_abertos',        v_conflitos
  );
end $$;


-- =============================================================================
-- 7/10 · exigir_ativos_da_empresa — a fechadura da mesa de conflitos
-- =============================================================================
-- Hoje não levanta nunca. É EXTRAÍDA, e não inline na RPC, por um motivo medido: a mesa é
-- recriada em cadeia (0093 → 0098 → 0100 → esta), e o método de mudá-la sempre foi copiar o
-- corpo e editar o trecho novo — que é exatamente o mecanismo pelo qual uma guarda inline se
-- perde na recriação seguinte. Sendo função própria, a chamada é UMA linha que o diff
-- denuncia se sumir.
create or replace function public.exigir_ativos_da_empresa(p_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- F52: com UMA empresa, todo ativo é da empresa de quem chama, e esta função é inerte.
  -- F65 troca este corpo pelo predicado real e levanta 42501 quando algum id de p_ids
  -- estiver fora do escopo do autor.
  --
  -- ⚠ QUANDO ELA GANHAR CORPO, A LEITURA DE `public.ativos` TEM DE CONTINUAR ACONTECENDO
  -- DEPOIS DA ETAPA (3) DO LOCK da mesa — ler linha ainda não travada é a porta de TOCTOU
  -- que a 0098 fechou e a 0100 serializou por advisory lock. A chamada já está no lugar
  -- certo; quem mexer no corpo não precisa mexer na posição.
  perform 1 where p_ids is not null;
end;
$$;

comment on function public.exigir_ativos_da_empresa(uuid[]) is
  'F52: todos os ativos informados pertencem à organização de quem chama? Guarda de PERTENCIMENTO da mesa de conflitos entre filiais, chamada por apagar_ativos_conflito_filiais depois da etapa (3) do lock. Não levanta hoje (uma empresa): é a fechadura no-op que a F65 preenche trocando SÓ esta função. Fechada nos quatro papéis.';

revoke all on function public.exigir_ativos_da_empresa(uuid[]) from public, anon, authenticated, service_role;


-- =============================================================================
-- 8/10 · apagar_ativos_conflito_filiais — a chamada nova, depois da etapa (3)
-- =============================================================================
-- `create or replace` PURO. O diff contra a 0100 é EXCLUSIVAMENTE a chamada nova e o seu
-- comentário — nenhuma linha removida, e NADA na ordem dos locks foi tocado.
create or replace function public.apagar_ativos_conflito_filiais(
  p_ativos        uuid[],
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_cap_inline  constant int := 25;
  c_max_lote    constant int := 200;

  v_uid         uuid := (select auth.uid());
  v_ids         uuid[];
  v_n           int;
  v_esperado    text;
  v_chaves      text[];
  v_faltam      text[];
  v_fora        text[];
  v_backup      jsonb;
  v_resumo      jsonb;
  v_movs        int := 0;
  v_anot        int := 0;
  v_pend        int := 0;
  v_termos      int := 0;
  v_subst       int := 0;
  v_arquivos    text[] := '{}'::text[];
  v_inline      boolean;
  -- (0100) o md5 do lote — o caminho do backup em arquivo tem de estar sob ele.
  v_digest      text;
begin
  if v_uid is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  if not public.e_admin() then
    raise exception 'Apenas administradores podem resolver conflitos entre filiais.'
      using errcode = '42501';
  end if;

  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_ids
    from unnest(coalesce(p_ativos, '{}'::uuid[])) x
   where x is not null;

  v_n := coalesce(cardinality(v_ids), 0);
  if v_n = 0 then
    raise exception 'Nenhum ativo selecionado para apagar.' using errcode = '22023';
  end if;
  if v_n > c_max_lote then
    raise exception 'Seleção grande demais (% ativos; máximo de % por operação).', v_n, c_max_lote
      using errcode = '22023';
  end if;

  v_esperado := 'APAGAR ' || v_n::text;
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar.', v_esperado
      using errcode = '22023';
  end if;

  select coalesce(array_agg(x::text order by x::text), '{}'::text[])
    into v_faltam
    from unnest(v_ids) x
   where not exists (select 1 from public.ativos a where a.id = x);

  if cardinality(v_faltam) > 0 then
    raise exception 'Ativo(s) não encontrado(s): %. Nada foi apagado — recarregue a página.',
      array_to_string(v_faltam[1:5], ', ')
      using errcode = 'P0002';
  end if;

  -- ---------- (0100) SERIALIZA a ferramenta, antes de QUALQUER lock de linha ----------
  -- O lock em dois tempos abaixo é o que fecha o TOCTOU da 0098, e é também o que permite
  -- duas sessões travarem as mesmas linhas em ordens opostas (X seleciona B e espera A; Y
  -- seleciona A e espera B). `order by a.id` ordena dentro de cada etapa, não entre elas —
  -- a ordem total que a 0093 tinha num statement só não sobrevive à divisão. Serializar
  -- resolve na raiz: sem intercalação não há ordem para inverter. Mesma doutrina do
  -- advisory lock de `importar_ativos_substituir` (0094).
  perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'));

  -- ---------- LOCK EM DOIS TEMPOS (0098) ----------
  -- (1) trava as linhas SELECIONADAS por ID. O id não muda; a identidade, sim. Travar por
  --     id primeiro é o que impede a identidade de mudar debaixo da leitura seguinte.
  perform 1 from public.ativos a
   where a.id = any (v_ids)
   order by a.id
     for update;

  -- (2) SÓ AGORA lê as chaves — já sob trava, portanto estáveis até o fim da transação.
  select coalesce(array_agg(distinct k), '{}'::text[])
    into v_chaves
    from public.ativos a
    cross join lateral (select public.chave_identidade_ativo(a.patrimonio, a.service_tag) as k) c
   where a.id = any (v_ids)
     and c.k is not null;

  -- (3) trava o RESTO do grupo — os gêmeos que não estão na seleção e que, sem trava,
  --     poderiam sumir entre a revalidação e o delete, deixando o alvo fora de conflito.
  if cardinality(v_chaves) > 0 then
    perform 1
       from public.ativos a
      where public.chave_identidade_ativo(a.patrimonio, a.service_tag) = any (v_chaves)
        and not (a.id = any (v_ids))
      order by a.id
        for update;
  end if;

  -- ---------- F52: OS ATIVOS SÃO DA SUA ORGANIZAÇÃO? ----------
  -- A POSIÇÃO é a decisão 4 da fase, e ela é ditada pelos locks:
  --   · DEPOIS do `pg_advisory_xact_lock` e DEPOIS da etapa (3) — obrigatório, porque a
  --     guarda faz LEITURA PRÓPRIA de `public.ativos`. Ler linha ainda não travada é
  --     exatamente a porta de TOCTOU que a 0098 fechou e a 0100 serializou.
  --   · ANTES da revalidação do grupo, porque pertencimento é uma recusa mais fundamental
  --     que "não está mais em conflito": um ativo de outra organização deve responder que
  --     não é seu, e não que saiu do conflito.
  --   · FORA da janela `estoque.dev_destrutivo`, que só abre bem mais abaixo — a guarda
  --     não tem efeito a desarmar, e a janela continua com exatamente as portas que tinha.
  -- Ela é EXTRAÍDA, e não inline, porque esta RPC é recriada em cadeia (0093 → 0098 → 0100
  -- → 0132) e guarda inline se perde na recriação seguinte — o mecanismo causal que a F51
  -- documentou. Com uma empresa só, ela não levanta nunca.
  perform public.exigir_ativos_da_empresa(v_ids);

  with ident as (
    select a.id, a.filial_id,
           public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
      from public.ativos a
  ),
  grupos as (
    select i.chave from ident i
     where i.chave is not null
     group by i.chave
    having count(distinct i.filial_id) > 1
  ),
  em_conflito as (
    select i.id from ident i join grupos g on g.chave = i.chave
  )
  select coalesce(array_agg(rot order by rot), '{}'::text[])
    into v_fora
    from (
      select coalesce(nullif(btrim(a.patrimonio), ''),
                      nullif(btrim(a.service_tag), ''),
                      a.id::text) as rot
        from unnest(v_ids) x
        join public.ativos a on a.id = x
       where x not in (select id from em_conflito)
    ) s;

  if cardinality(v_fora) > 0 then
    raise exception 'Esta ferramenta só apaga ativo que esteja em conflito entre filiais, e % não está: %. Nada foi apagado.',
      case when cardinality(v_fora) = 1 then 'um dos selecionados' else 'nem todos os selecionados' end,
      array_to_string(v_fora[1:5], ', ')
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
       and exists (select 1 from unnest(t.ativo_ids) x(id) where not (x.id = any (v_ids)))
  ) then
    raise exception 'Um dos selecionados está num termo que também cobre ativos fora desta seleção: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou inclua na seleção os outros ativos do mesmo termo.'
      using errcode = '42501';
  end if;

  v_inline := (v_n <= c_cap_inline);

  if not v_inline then
    if coalesce(length(btrim(p_backup_path)), 0) = 0 then
      raise exception 'Seleção com mais de % ativos exige backup em arquivo: o caminho não veio. Nada foi apagado.', c_cap_inline
        using errcode = '22023';
    end if;
    -- (0100) O caminho tem de estar sob o PREFIXO e sob o DIGEST DESTE lote. Conferir só o
    -- prefixo aceitava o backup de qualquer outra exclusão de conflito que estivesse no
    -- bucket — inclusive a sobra de uma tentativa recusada. A mensagem preserva a frase
    -- "não é o backup desta operação", que é por onde `erros.ts` a reconhece.
    v_digest := public.digest_selecao_conflito(v_ids);
    if btrim(p_backup_path) not like public.prefixo_backup_conflito() || v_digest || '/%' then
      raise exception 'O backup informado não é o backup desta operação (esperado sob "%"). Nada foi apagado.',
        public.prefixo_backup_conflito() || v_digest || '/'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
    ) then
      raise exception 'O backup dos conflitos não existe no bucket (%). Nada foi apagado. Refaça a seleção.', btrim(p_backup_path)
        using errcode = '22023';
    end if;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'ativo_id',    a.id,
             'patrimonio',  a.patrimonio,
             'service_tag', a.service_tag,
             'filial_id',   a.filial_id,
             'filial',      f.nome,
             'status',      a.status
           ) order by a.filial_id, a.id)
    into v_resumo
    from public.ativos a
    join public.filiais f on f.id = a.filial_id
   where a.id = any (v_ids);

  if v_inline then
    select jsonb_agg(
             jsonb_build_object(
               'ativo',           to_jsonb(a),
               'movimentacoes',   coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id)
                                              from public.movimentacoes m where m.ativo_id = a.id), '[]'::jsonb),
               'termos',          coalesce((select jsonb_agg(to_jsonb(t))
                                              from public.termos_gerados t where a.id = any (t.ativo_ids)), '[]'::jsonb),
               'anotacoes',       coalesce((select jsonb_agg(to_jsonb(an))
                                              from public.anotacoes an where an.ativo_id = a.id), '[]'::jsonb),
               'pendencias_item', coalesce((select jsonb_agg(to_jsonb(pi))
                                              from public.pendencias_item pi where pi.ativo_id = a.id), '[]'::jsonb)
             ) order by a.id)
      into v_backup
      from public.ativos a
     where a.id = any (v_ids);
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item where ativo_id = any (v_ids);
  get diagnostics v_pend = row_count;

  with del as (
    delete from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) x(id) where x.id = any (v_ids))
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]), count(*)::int
    into v_arquivos, v_termos
    from del;

  delete from public.anotacoes where ativo_id = any (v_ids);
  get diagnostics v_anot = row_count;

  delete from public.movimentacoes where ativo_id = any (v_ids);
  get diagnostics v_movs = row_count;

  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id = any (v_ids) and not (id = any (v_ids));
  get diagnostics v_subst = row_count;

  delete from public.ativos where id = any (v_ids);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'conflito_filiais_resolvido',
          coalesce((v_resumo->0->>'patrimonio'), (v_resumo->0->>'service_tag'), v_n::text || ' ativos'),
          jsonb_build_object(
            'justificativa',      btrim(p_justificativa),
            'ativos',             v_n,
            'selecionados',       coalesce(v_resumo, '[]'::jsonb),
            'movimentacoes',      v_movs,
            'anotacoes',          v_anot,
            'pendencias_item',    v_pend,
            'termos',             v_termos,
            'ponteiros_anulados', v_subst,
            'arquivos_termos',    to_jsonb(v_arquivos),
            'backup_em_arquivo',  (not v_inline),
            'backup_path',        nullif(btrim(coalesce(p_backup_path, '')), ''),
            'backup',             coalesce(v_backup, 'null'::jsonb)));

  return jsonb_build_object(
    'ativos',             v_n,
    'movimentacoes',      v_movs,
    'anotacoes',          v_anot,
    'pendencias_item',    v_pend,
    'termos',             v_termos,
    'ponteiros_anulados', v_subst,
    'arquivos_termos',    to_jsonb(v_arquivos),
    'selecionados',       coalesce(v_resumo, '[]'::jsonb));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;


-- =============================================================================
-- 9/10 · o índice da janela de idempotência
-- =============================================================================
-- A consulta nova de `import_validar_plano` é exatamente por esta tripla. Sem o índice ela
-- varre `import_logs` inteira a cada import — hoje barato, e caro no dia em que não for.
create index if not exists import_logs_filial_hash_idx
  on public.import_logs (filial_id, arquivo_hash, criado_em desc);

comment on index public.import_logs_filial_hash_idx is
  'F52: serve a janela de 24h de idempotência do import (import_validar_plano). A tripla é a da consulta: filial, hash do arquivo, e o mais recente primeiro.';


-- =============================================================================
-- 10/10 · o comentário que descrevia o mundo errado
-- =============================================================================
-- `eventos_admin.detalhe` foi documentada na 0065 como metadado. Desde a F23 (0082→0100)
-- ela guarda TAMBÉM os backups jsonb do acervo apagado — registro a registro, com os campos
-- do ativo, da movimentação ou do item. Quem for reescrever as policies na virada e ler só o
-- comentário classificaria a coluna como metadado de baixo risco, e ela é o oposto disso.
comment on column public.eventos_admin.detalhe is
  'Metadado do evento em JSON (o que mudou, de/para, contagens) E — desde a F23 — o BACKUP jsonb dos registros apagados pelas ferramentas destrutivas, registro a registro, quando a operação é pequena o bastante para não exigir backup em arquivo. Portanto esta coluna contém DADO DO ACERVO, não só metadado: trate-a como tal em policy, export e retenção.';

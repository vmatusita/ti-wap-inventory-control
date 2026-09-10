-- =============================================================================
-- 0138_resumo_integridade_e_rotulo.sql — F55, 10/09/2026
-- =============================================================================
-- O ALARME DE INTEGRIDADE precisa que uma conta COMUM leia as contagens das doze
-- checagens da /dev — e a função da /dev recusa quem não é dev, na primeira
-- linha do corpo dela. Este arquivo resolve isso SEM uma segunda cópia do SQL.
--
-- POR QUE UM "WRAPPER QUE CHAMA A FUNÇÃO DA /dev POR DENTRO" NÃO FUNCIONA.
-- `dev_checagens_integridade()` abre com `if not public.e_dev()`, e `e_dev()` lê
-- `papel_atual()`, que lê `auth.uid()` — o JWT de QUEM CHAMA. `security definer`
-- troca o `current_user`; NÃO troca o JWT. Um resumo que a chamasse por dentro
-- recusaria todo mundo que não é dev, inclusive a conta que roda o smoke
-- agendado. Medido contra a `0136` e a `0072`/`0073` antes de escrever a linha.
--
-- E A SAÍDA ÓBVIA — copiar o SQL das doze para dentro do resumo — é a doença que
-- a F51 curou nas onze cópias da RPC de import: duas cópias do mesmo SQL é como
-- uma das duas envelhece sem ninguém notar.
--
-- O DESENHO, então, é UM NÚCLEO e DUAS PORTAS:
--
--   public.checagens_integridade_nucleo()   NOVA. O SQL das doze, e só ele.
--                                           Fechada: revoke de public, anon,
--                                           authenticated e service_role. Só as
--                                           duas portas abaixo a alcançam, e as
--                                           duas rodam como o DONO.
--   public.dev_checagens_integridade()      RECRIADA: a guarda `e_dev()` + o
--                                           núcleo. MESMA assinatura, MESMO
--                                           resultado, as doze peças byte a byte
--                                           iguais às da 0136 — o diff está em
--                                           docs/f55-evidencias/.
--   public.checagens_integridade_resumo()   NOVA. A guarda `papel_atual() is not
--                                           null` (o piso de leitura da 0070/
--                                           0073 — decisão do Johnny de
--                                           10/09/2026, divergindo do `e_admin()`
--                                           que a ficha previa) + a projeção
--                                           (chave, total). ZERO linha de dado:
--                                           a coluna `amostra` não sai daqui, e
--                                           é ela que carrega patrimônio, nome e
--                                           filial.
--
-- E a QUARTA função, que é de outra frente e vem junto porque é a mesma leitura
-- de identidade:
--
--   public.rotulo_de_ambiente()             NOVA. Diz se ESTA base é a de
--                                           desenvolvimento, lendo `public.ambiente`
--                                           (0090), que tem `revoke all` até para o
--                                           service_role — por isso a leitura tem de
--                                           ser por função. É o que faz o
--                                           `scripts/env-guard.ts` confirmar no BANCO
--                                           a identidade que hoje ele confere só pelo
--                                           ref do projeto. Alcançável só pela
--                                           `service_role`, o mesmo privilégio de
--                                           `resetar_dados_ficticios`.
--
-- ⚠ SÓ-LEITURA. Nenhuma das quatro escreve em tabela nenhuma; não há comando de
-- exclusão sobre o acervo em lugar nenhum deste arquivo. É caminho A do
-- RUNBOOK-BANCO.md.
--
-- ⚠ E O COMENTÁRIO NÃO CITA AS FRASES QUE O GATE PROCURA, de propósito — a lição
-- escrita no cabeçalho da 0136: escrever a frase para NEGÁ-LA faz o classificador
-- encontrá-la do mesmo jeito, porque ele lê o texto e não a intenção.
--
-- ⚠ SQL FIXO por dentro, nas quatro. Função que receba SQL, tabela ou coluna como
-- parâmetro continua PROIBIDA nesta casa (o console de SQL é assunto do Studio).
--
-- ORDEM DE ROLLBACK (o inverso da de apply — regra 10 do §4 do PLANO-MULTIEMPRESA).
-- Ela COMEÇA FORA DO BANCO, e a ordem importa:
--   1. `gh workflow disable saude.yml` — senão o próximo disparo agendado alarma
--      sobre uma função que acabou de sumir, e abre issue por engano;
--   2. `git revert` do PR + deploy — senão o `scripts/env-guard.ts` recusa seed e
--      reset por falta do rótulo, e o smoke agendado chama uma RPC inexistente;
--   3. só então o SQL, nesta ordem (quem depende primeiro):
--        drop function public.checagens_integridade_resumo();
--        drop function public.rotulo_de_ambiente();
--        reemitir `dev_checagens_integridade` com o corpo INTEIRO da 0136 (as
--            doze checagens inline), por substituição pura da definição;
--            ⚠ a frase acima NÃO usa a forma literal do comando de propósito:
--            `scripts/db/corpo-vigente.mjs` varre o texto do arquivo, e um
--            pseudo-SQL de cabeçalho é lido como se fosse definição de verdade —
--            engolindo o corpo real. Foi exatamente o que aconteceu na primeira
--            escrita deste arquivo, e o `cobertura.test.mts` acusou;
--        drop function public.checagens_integridade_nucleo();
--   4. `notify pgrst, 'reload schema';` — a superfície da API mudou (funções
--      sumiram), e sem isso o PostgREST ainda as anuncia;
--   5. `npm run db:lock` para regravar a trava sem este arquivo.
--
-- QUEM ACRESCENTA MIGRATION ATUALIZA DUAS LISTAS (RUNBOOK-BANCO.md):
--   · `supabase/migrations.lock.json`, por `npm run db:lock`;
--   · `src/lib/itens/migrations-f38.test.ts`, a lista de cobertura.
-- E função `security definer` nova entra em `supabase/tests/catalogo_secdef.sql`
-- (`k_secdef`) no MESMO commit — as três entram. Em `definer_sem_tenant.sql`
-- NENHUMA entra: o universo de lá é a `security definer` que RECEBE id do cliente,
-- e as três não recebem parâmetro nenhum (a asserção 1b reprovaria como fantasma).
-- =============================================================================
-- -----------------------------------------------------------------------------
-- 1. O NÚCLEO — o SQL das doze, e nada mais.
-- -----------------------------------------------------------------------------
-- As doze peças abaixo saíram VERBATIM do corpo vigente da 0136, lidas por
-- `scripts/db/corpo-vigente.mjs`. Nenhum caractere foi tocado: o diff está em
-- docs/f55-evidencias/, e o roteiro `integridade_alarme.sql` prova que cada uma
-- enxerga o estado que diz enxergar.
--
-- SEM guarda de cargo por dentro, e é de propósito: ela não é alcançável de
-- fora. O `revoke` logo abaixo é a guarda, e quem decide QUEM pode ver são as
-- duas portas — que rodam como o dono e por isso não precisam de grant sobre ela.
create or replace function public.checagens_integridade_nucleo()
returns table(chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with d as (
    select a.patrimonio || ' / ' || coalesce(a.service_tag, '—') || ' (' || f.nome || ')' as item
      from public.ativos a
      join public.filiais f on f.id = a.filial_id
     where a.patrimonio is not null
     group by a.filial_id, f.nome, a.patrimonio, a.service_tag
    having count(*) > 1
  )
  select 'patrimonio_duplicado'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select a.patrimonio as item from public.ativos a join public.filiais f on f.id = a.filial_id where not f.ativo
  )
  select 'ativo_filial_inativa'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select t.arquivo_path as item from public.termos_gerados t
      left join storage.objects o on o.bucket_id = 'termos' and o.name = t.arquivo_path
     where o.id is null
  )
  select 'termo_sem_arquivo'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select p.id::text as item from public.profiles p left join auth.users u on u.id = p.id
     where u.id is null and p.excluido_em is null
  )
  select 'perfil_sem_conta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select u.id::text as item from auth.users u left join public.profiles p on p.id = u.id where p.id is null
  )
  select 'conta_sem_perfil'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select pi.id::text as item from public.pendencias_item pi
      join public.movimentacoes m on m.id = pi.movimentacao_id
     where pi.resolvida_em is null
       and exists (select 1 from public.movimentacoes e where e.estorno_de = m.id)
  )
  select 'pendencia_de_estornada'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select p.id::text as item from public.profiles p
     where p.papel = 'operador' and p.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.usuario_id = p.id)
  )
  select 'operador_sem_filial'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select o.name as item from storage.objects o
     where o.bucket_id = 'termos'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
  )
  select 'arquivo_termo_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (select g.rotulo as item from public.v_conflitos_filiais_grupos g)
  select 'conflito_entre_filiais'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select coalesce(nullif(btrim(a.patrimonio), ''), nullif(btrim(a.service_tag), ''), a.id::text)
           || ' (' || a.status::text || ')' as item
      from public.ativos a
     where not public.status_tem_detentor(a.status)
       and (a.colaborador_atual is not null or a.setor_atual is not null)
  )
  select 'detentor_em_estado_sem_dono'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- F41 (0127) — a 11ª. A reserva por chamado saiu da tela: só um `liberacao` com
  -- o MESMO chamado a fecha, e nenhuma tela emite isso. Uma reserva aberta aqui
  -- é uma unidade presa sem caminho de volta — a 0127 converteu as 5 que havia, e
  -- esta checagem existe para que não voltem em silêncio.
  return query
  with d as (
    select i.nome || ' · ' || f.nome || ' · chamado ' || l.chamado
           || ' (' || sum(case l.tipo::text when 'reserva'   then l.quantidade
                                            when 'liberacao' then -l.quantidade
                                            else 0 end)::text || ')' as item
      from public.lancamentos_item l
      join public.itens   i on i.id = l.item_id
      join public.filiais f on f.id = l.filial_id
     where l.chamado is not null
     group by i.nome, f.nome, l.chamado
    having sum(case l.tipo::text when 'reserva'   then l.quantidade
                                 when 'liberacao' then -l.quantidade
                                 else 0 end) > 0
  )
  select 'reserva_aberta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- ---------------------------------------------------------------------------
  -- 12ª (F54) — BACKUP ÓRFÃO em `backups-import`
  -- ---------------------------------------------------------------------------
  -- Objeto no bucket dos backups que não corresponde a operação nenhuma. Duas
  -- populações caem aqui, e as duas merecem: o backup que subiu para uma operação
  -- que a RPC RECUSOU (a partir da F54 o import descarta o dele sozinho; o reset e
  -- o conflito abaixo do teto não descartam) e o resíduo histórico de antes de a
  -- trilha existir — medidos 10 em produção em 09/09/2026, todos de julho.
  --
  -- ⚠ O PREDICADO NÃO FILTRA POR PREFIXO, e isso é decisão, não descuido. Os 22
  -- objetos que existem hoje estão TODOS na forma histórica `<slug>/<carimbo>.json`;
  -- a forma atual (`import/filial-<id>/…`, F52) ainda não produziu nenhum. Um
  -- predicado que reconhecesse só a forma nova acusaria os 22 de uma vez, e um que
  -- listasse as duas nasceria desatualizado na terceira. A pergunta certa é "alguém
  -- registrou este caminho?", e ela é agnóstica de forma.
  --
  -- ⚠ AS CÓPIAS DE `.docx` (F54) NÃO SÃO ÓRFÃS, e reconhecê-las é a metade difícil.
  -- Elas moram em `<raiz>/termos/<arquivo>`, e a RAIZ é sempre um valor que a própria
  -- operação JÁ gravou, DENTRO da transação dela:
  --   · import, reset e conflito acima do teto → o `backup_path` sem o `.json`;
  --   · apagar ativo                           → `detalhe->>'ativo_id'` (RPC 0082);
  --   · conflito abaixo do teto                → o digest da seleção, recalculado a
  --     partir de `detalhe->'selecionados'` com as funções que a 0100 já criou.
  -- É por isso que a F54 não precisou de evento nem de manifesto novo: não há escrita
  -- posterior que possa falhar em silêncio e transformar cópia legítima em órfã.
  --
  -- ⚠ SÓ `bucket_id` e `name` de `storage.objects`. O `bootstrap-storage.sql` do CI é
  -- o recorte MÍNIMO e NÃO tem a coluna `metadata` — um predicado que a usasse passaria
  -- aqui e morreria no `banco-sem-docker`.
  --
  -- ⚠ `not exists`, nunca `not in`: um NULL no subselect faria o `not in` devolver NULL
  -- para toda linha, a contagem sairia ZERO, e a checagem estaria "verde" por não
  -- enxergar nada. É o modo de falha mais silencioso que uma checagem pode ter.
  return query
  with registrados as (
    select l.backup_path as caminho
      from public.import_logs l
     where l.backup_path is not null
    union
    select e.detalhe->>'backup_path'
      from public.eventos_admin e
     where nullif(e.detalhe->>'backup_path', '') is not null
  ),
  copias as (
    select o.name
      from storage.objects o
     where o.bucket_id = 'backups-import'
       and o.name ~ '/termos/[^/]+$'
       and (
         exists (
           select 1 from registrados r
            where r.caminho = regexp_replace(o.name, '/termos/[^/]+$', '.json')
         )
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'ativo_apagado'
              and 'ativo/' || (ea.detalhe->>'ativo_id') || '/'
                  = substring(o.name from '^(ativo/[0-9a-fA-F-]{36}/)termos/')
         )
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'conflito_filiais_resolvido'
              and jsonb_typeof(ea.detalhe->'selecionados') = 'array'
              and public.prefixo_backup_conflito()
                  || public.digest_selecao_conflito(
                       array(select (x->>'ativo_id')::uuid
                               from jsonb_array_elements(ea.detalhe->'selecionados') x)) || '/'
                  = substring(o.name from '^(conflito/[0-9a-f]{32}/)termos/')
         )
       )
  ),
  d as (
    select o.name as item
      from storage.objects o
     where o.bucket_id = 'backups-import'
       and not exists (select 1 from registrados r where r.caminho = o.name)
       and not exists (select 1 from copias c where c.name = o.name)
  )
  select 'backup_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;
end;
$$;

-- O default do Postgres é EXECUTE para PUBLIC: função nova nasce ABERTA, e é o
-- revoke que a fecha. `public` vem primeiro de propósito — revogar de `anon` sem
-- revogar de `public` é no-op.
revoke all on function public.checagens_integridade_nucleo() from public, anon, authenticated, service_role;

comment on function public.checagens_integridade_nucleo() is
  'F55 (0138): o SQL das DOZE checagens de integridade, em UM lugar só. Nasceu da extração VERBATIM do corpo da 0136 — nenhuma checagem foi reescrita, nenhuma mudou o que conta. Não é alcançável de fora (revoke de public, anon, authenticated e service_role): quem a chama são as duas portas, dev_checagens_integridade() (guarda e_dev) e checagens_integridade_resumo() (guarda papel_atual is not null), e as duas rodam como o dono. SQL FIXO por dentro — função que receba SQL, tabela ou coluna como parâmetro é PROIBIDA nesta casa.';

-- -----------------------------------------------------------------------------
-- 2. A PORTA DA /dev — mesma assinatura, mesmo resultado.
-- -----------------------------------------------------------------------------
-- `create or replace` PURO: zero argumento, mesmo tipo de retorno, sem overload —
-- e os grants de hoje (authenticated sim, service_role não) sobrevivem, porque
-- `create or replace` os preserva. `supabase/tests/dev_destrutivo.sql:294-301`
-- afirma exatamente isso, e continua verde sem uma linha de mudança.
create or replace function public.dev_checagens_integridade()
returns table(chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_dev() then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  return query
  select n.chave, n.total, n.amostra from public.checagens_integridade_nucleo() n;
end;
$$;

comment on function public.dev_checagens_integridade() is
  'F22 (0077), ampliada na 0085, 0095, 0098, 0110, 0127 e 0136, e DECOMPOSTA na 0138 (F55): as DOZE checagens de integridade só-leitura da área /dev. Desde a 0138 o SQL delas mora em checagens_integridade_nucleo(), e esta função é a guarda e_dev() sobre ele — mesma assinatura, mesmo resultado, as doze peças byte a byte. A decomposição existe porque o alarme agendado precisa das CONTAGENS sem ser dev, e um resumo que chamasse esta função por dentro recusaria: security definer troca o current_user, não o JWT que e_dev() lê. SECURITY DEFINER com a guarda na primeira linha do corpo, como sempre foi.';

-- -----------------------------------------------------------------------------
-- 3. O RESUMO — só (chave, total), para qualquer logado ATIVO.
-- -----------------------------------------------------------------------------
-- ⚠ A COLUNA `amostra` NÃO SAI DAQUI. É ela que carrega patrimônio, nome de
-- pessoa e filial; o resumo devolve contagem, e contagem não identifica ninguém.
-- É o que torna seguro esta função ser alcançável por uma conta guardada no
-- GitHub, e é o que o roteiro `integridade_alarme.sql` afirma explicitamente.
--
-- ⚠ A GUARDA É `papel_atual() is not null`, o PISO DE LEITURA (0070/0073) — não
-- `e_admin()`. Decisão do Johnny (10/09/2026): a conta do smoke agendado é NOVA e
-- de cargo `consulta`, o cargo que não escreve nada. Perfil desativado ou
-- arquivado devolve NULL em `papel_atual()` e é recusado aqui no request
-- seguinte, como em todo o resto do sistema.
create or replace function public.checagens_integridade_resumo()
returns table(chave text, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.papel_atual() is null then
    raise exception 'Esta consulta exige uma conta ativa.' using errcode = '42501';
  end if;

  return query
  select n.chave, n.total from public.checagens_integridade_nucleo() n;
end;
$$;

revoke all on function public.checagens_integridade_resumo() from public, anon, authenticated, service_role;
grant execute on function public.checagens_integridade_resumo() to authenticated;

comment on function public.checagens_integridade_resumo() is
  'F55 (0138): as contagens das doze checagens de integridade — (chave, total), sem a coluna amostra — para QUALQUER conta logada e ativa (papel_atual() is not null, o piso de leitura da 0070/0073). É o que o smoke agendado do .github/workflows/saude.yml lê uma vez por dia com uma conta de cargo consulta, para comparar com a linha de base versionada e abrir issue de alarme quando uma checagem passa dela. Não devolve linha de dado nenhuma: a amostra, que carrega patrimônio e nome, fica só na função da /dev. Divergência declarada da ficha do PLANO-MULTIEMPRESA, que previa e_admin() — decisão do Johnny de 10/09/2026.';

-- -----------------------------------------------------------------------------
-- 4. O RÓTULO DO AMBIENTE — a identidade da base, lida por função.
-- -----------------------------------------------------------------------------
-- `public.ambiente` (0090) tem RLS ligada, ZERO policy e `revoke all` de anon,
-- authenticated E service_role: nem o client administrativo dos scripts a lê por
-- select. Era por isso que a identidade do banco só existia dentro de
-- `resetar_dados_ficticios`. Esta função a expõe para a MESMA identidade
-- (service_role), sem abrir a tabela.
--
-- Devolve o rótulo, ou NULL onde não há linha nenhuma — que é o estado de
-- PRODUÇÃO, vazia de propósito. `limit 1` porque a tabela é um rótulo, não uma
-- lista: se algum dia houver duas linhas, a mais alfabética responde e a guarda
-- de `env-guard.ts` continua exigindo a palavra exata.
create or replace function public.rotulo_de_ambiente()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.rotulo from public.ambiente a order by a.rotulo limit 1
$$;

revoke all on function public.rotulo_de_ambiente() from public, anon, authenticated, service_role;
grant execute on function public.rotulo_de_ambiente() to service_role;

comment on function public.rotulo_de_ambiente() is
  'F55 (0138): o rótulo de ambiente desta base — "desenvolvimento" no ensaio, NULL em produção (onde public.ambiente é vazia de propósito, 0090). Alcançável só pela service_role, o mesmo privilégio de resetar_dados_ficticios, porque public.ambiente tem revoke all até para ela. É a segunda trava do scripts/env-guard.ts: além do ref do projeto estar na lista de PERMISSÃO, o BANCO tem de confirmar que é o de desenvolvimento — identidade conferida no destino, não no arquivo .env.local de quem chama.';

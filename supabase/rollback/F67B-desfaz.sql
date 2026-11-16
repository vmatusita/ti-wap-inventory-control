-- =============================================================================
-- F67B-desfaz.sql — o ROLLBACK da F67B (docs/PLAN-F67B.md §6)
-- =============================================================================
-- Desfaz as seis migrations da F67B NA ORDEM INVERSA DO APPLY: 0199 → 0198 → 0197 → 0196 → 0195 → 0194.
--   · (0199) as três prefixo_backup_* antigas (sem a empresa) voltam — o corpo, o comentário e a ACL de ANTES da 0194;
--   · (0198) pode_escrever_termo(uuid[]) volta; pode_ler_arquivo_termo e pode_escrever_arquivo_termo voltam ao corpo e ao
--     comentário de antes (o coalesce(…, true) e a leitura sem a linha); as três policies de escrita do bucket termos voltam;
--   · (0197) as três policies de escrita de termos_gerados voltam; pode_escrever_termo(uuid, uuid[]) sai;
--   · (0196) a ferramenta de órfão sai; o núcleo das checagens volta ao corpo de antes (a 12ª só na forma antiga); o
--     comment de eventos_admin.acao volta ao da 0139;
--   · (0195) as quatro RPCs de backup voltam ao corpo de antes (a forma antiga do caminho); as quatro policies do bucket
--     backups-import voltam ao texto de antes;
--   · (0194) as cinco funções do caminho por empresa saem.
-- NADA AQUI É TRANSCRITO À MÃO: o arquivo é GERADO das migrations (os corpos, os comentários e o texto das policies de
-- antes da 0194, byte a byte — o `rollback-f67b.test.ts` confere na mesa) e da ACL medida na cadeia até a 0193. O roteiro
-- `supabase/tests/f67b_rollback.sql` é o ensaio no CI: a impressão do esquema depois deste arquivo = a da cadeia até a 0193.
--
-- IDEMPOTENTE NOS DOIS ESTADOS DE PRODUÇÃO: só a expansão (0194–0197) ou a expansão e a contração (0198–0199). As
-- antigas derrubadas pela contração existem na expansão, e o `create or replace` com o corpo de antes é o mesmo comando
-- nos dois; `drop … if exists` idem; `alter policy` reescreve o texto inteiro. Rodado duas vezes, dá o mesmo esquema.
-- Nenhuma linha de negócio é escrita, e NENHUM OBJETO DE STORAGE é tocado: os backups e as cópias gravados na forma nova
-- (`<família>/empresa-<uuid>/…`) ficam no bucket — depois do rollback, só o service role os alcança (a policy de antes é
-- e_admin_na(empresa_legada()) sobre o bucket inteiro, então o admin da WAP volta a lê-los também), e a 12ª checagem antiga os conta como
-- órfãos até alguém decidir o destino deles (RUNBOOK, Anexo F67B).
--
-- ENTRE FASES: o rollback da F67 (e, por ele, os de antes) EXIGE este ANTES — as policies da F67B citam e_admin_na() e
-- empresas_de_admin(), que o da F67 derruba. Os roteiros f67_rollback.sql, f66_rollback.sql, f65_rollback.sql,
-- f64_rollback.sql, f63_rollback.sql e f62_rollback.sql rodam este arquivo antes do F67-desfaz (o f66b_rollback.sql não
-- roda o da F67: ele só mexe em CHECK de comprimento, que nenhuma das duas fases toca).
--
-- Sem `begin`/`commit` próprios: quem roda decide a transação (o roteiro roda dentro da dele; num banco vivo, o
-- `execute_sql` do MCP com o conteúdo EXATO deste arquivo, uma transação só). O ledger
-- (`supabase_migrations.schema_migrations`) NÃO é reescrito. Cada `alter policy` toma ACCESS EXCLUSIVE em
-- storage.objects/termos_gerados até o fim da transação: `lock_timeout` de 2 s por `set`/`reset` — sem o lock, falha
-- inteiro e se repete (no máximo três vezes em 30 min), nunca espera o app.
-- =============================================================================

set lock_timeout = '2s';

-- =============================================================================
-- 0199 (a contração) — as três prefixo_backup_* antigas de volta, com o corpo, o comentário e a ACL de antes da 0194.
-- Num banco SÓ com a expansão elas existem: o `create or replace` é o mesmo comando.
-- =============================================================================

-- prefixo_backup_import(smallint) — o corpo de 0132_guardas_de_escopo.sql (o vigente antes da 0194)

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

-- prefixo_backup_reset(text, smallint) — o corpo de 0089_reset_backup_do_recorte.sql (o vigente antes da 0194)

create or replace function public.prefixo_backup_reset(p_bloco text, p_filial smallint)
returns text
language sql
immutable
set search_path = public
as $$
  select 'reset/' || p_bloco || '/'
      || case when p_filial is null then 'global' else 'filial-' || p_filial::text end
      || '/'
$$;

comment on function public.prefixo_backup_reset(text, smallint) is
  'F23: o prefixo obrigatório do caminho do backup de um reset — reset/<bloco>/<global|filial-N>/. Espelha o caminho que a Server Action grava. Existe para que a RPC possa exigir que o backup informado seja o backup DAQUELE recorte, e não de um qualquer que por acaso exista no bucket.';

revoke all on function public.prefixo_backup_reset(text, smallint) from public, anon, authenticated, service_role;

-- prefixo_backup_conflito() — o corpo de 0093_apagar_conflito_filiais.sql (o vigente antes da 0194)

create or replace function public.prefixo_backup_conflito()
returns text
language sql
immutable
set search_path = public
as $$
  select 'conflito/'
$$;

comment on function public.prefixo_backup_conflito() is
  'F24: o prefixo obrigatório do caminho do backup de uma exclusão de conflito — conflito/. Espelha o caminho que a Server Action grava. Mesma doutrina da 0089: exigir o prefixo transforma o caminho de "um texto qualquer" em uma afirmação verificável sobre o que aquele arquivo é.';

revoke all on function public.prefixo_backup_conflito() from public, anon, authenticated, service_role;

-- =============================================================================
-- 0198 (a contração) — o termo volta a ser decidido pelo coalesce(…, true) e pela filial dos ativos.
-- =============================================================================

-- pode_escrever_termo(uuid[]) — o corpo de 0186_consumidores_por_empresa.sql (o vigente antes da 0194)

create or replace function public.pode_escrever_termo(p_ativo_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- F67: o termo DEGENERADO (sem ativo) não tem de onde tirar a empresa — a legada EXPLÍCITA (o admin dela o apaga, como
  -- hoje; a F67B fecha pelo join com termos_gerados). Com ativo, cada um pela filial dele: pode_escrever_filial já
  -- responde true ao admin da empresa da filial, e false para filial de empresa onde quem chama não escreve.
  select case
           when coalesce(array_length(p_ativo_ids, 1), 0) = 0 then public.e_admin_na(public.empresa_legada())
           else not exists (
             select 1
               from unnest(p_ativo_ids) aid
               left join public.ativos a on a.id = aid
              where a.id is null                                   -- ativo inexistente → fecha
                 or not public.pode_escrever_filial(a.filial_id)    -- filial onde não se escreve → fecha
           )
         end
$$;

comment on function public.pode_escrever_termo(uuid[]) is
  'F21/0069: true se o usuário logado pode ESCREVER em todas as filiais dos ativos deste termo. admin → sempre (inclusive na linha legada de ativo_ids vazio ou com ativo apagado, para poder LIMPAR); operador → só se TODO ativo estiver em filial vinculada e o array não for vazio; consulta/desativado/sem perfil → nunca. Espelha o `exigirEscritaEm` de gerarTermo (src/lib/actions/termos.ts). A proibição de CRIAR termo sem ativo mora nas with_check das policies, não aqui.';

revoke all on function public.pode_escrever_termo(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.pode_escrever_termo(uuid[]) to authenticated;

-- pode_ler_arquivo_termo(text) — o corpo de 0186_consumidores_por_empresa.sql (o vigente antes da 0194)

create or replace function public.pode_ler_arquivo_termo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select public.papel_na_empresa(public.empresa_legada())) is not null
$$;

comment on function public.pode_ler_arquivo_termo(text) is
  'F67 (era F50/0129): todo membro ATIVO da empresa legada lê todo arquivo de termo — a legada EXPLÍCITA até a F67B fechar por join com termos_gerados. Ignora o parâmetro de propósito.';

-- pode_escrever_arquivo_termo(text) — o corpo de 0069_termos_mesma_filial.sql (o vigente antes da 0194)

create or replace function public.pode_escrever_arquivo_termo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select bool_and(public.pode_escrever_termo(t.ativo_ids))
       from public.termos_gerados t
      where t.arquivo_path = p_nome),
    true
  )
$$;

comment on function public.pode_escrever_arquivo_termo(text) is
  'F21/0069: true se o usuário pode escrever/apagar ESTE objeto do bucket `termos`. Decide pela(s) linha(s) de termos_gerados que apontam o nome (bool_and: a mais restritiva manda). Objeto que nenhuma linha referencia → true, porque a geração de termo sobe o .docx ANTES de gravar a linha (persistirTermo) e porque a limpeza de arquivo órfão precisa continuar possível; o CARGO é exigido na policy. ⚠ Casa por IGUALDADE DE STRING com arquivo_path: linha cujo path não bata com o `name` do objeto fica sem esta proteção (ver a consulta de pré-apply no cabeçalho da 0069).';

alter policy "termos insere operador" on storage.objects
  with check ((bucket_id = 'termos'::text) and (select public.pode_escrever_na(public.empresa_legada()))
              and public.pode_escrever_arquivo_termo(name));

alter policy "termos atualiza operador" on storage.objects
  using ((bucket_id = 'termos'::text) and (select public.pode_escrever_na(public.empresa_legada()))
         and public.pode_escrever_arquivo_termo(name))
  with check ((bucket_id = 'termos'::text) and (select public.pode_escrever_na(public.empresa_legada()))
              and public.pode_escrever_arquivo_termo(name));

alter policy "termos apaga operador" on storage.objects
  using ((bucket_id = 'termos'::text) and (select public.pode_escrever_na(public.empresa_legada()))
         and public.pode_escrever_arquivo_termo(name));

-- =============================================================================
-- 0197 — as policies de escrita de termos_gerados voltam (pela filial dos ativos), e a forma pela empresa da linha sai.
-- =============================================================================

alter policy "operador insere" on public.termos_gerados
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

alter policy "operador atualiza" on public.termos_gerados
  using (
    public.pode_escrever_termo(ativo_ids)
    and empresa_id = any (array (select public.empresas_de_escrita()))
  )
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

alter policy "operador apaga" on public.termos_gerados
  using (
    public.pode_escrever_termo(ativo_ids)
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

drop function if exists public.pode_escrever_termo(uuid, uuid[]);

-- =============================================================================
-- 0196 — a ferramenta de órfão sai; o núcleo das checagens e o comment de eventos_admin.acao voltam.
-- =============================================================================

drop function if exists public.registrar_limpeza_termos_sem_linha(text, text, text);

-- checagens_integridade_nucleo() — o corpo de 0164_kit_motivo_da_empresa.sql (o vigente antes da 0194)

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

  -- F62: o operador ATIVO sem filial é a MEMBERSHIP operadora da empresa legada sem vínculo.
  return query
  with d as (
    select p.id::text as item
      from public.membros m
      join public.profiles p on p.id = m.profile_id
     where m.empresa_id = public.empresa_legada()
       and m.papel = 'operador' and m.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.membro_id = m.id)
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

  -- ---------------------------------------------------------------------------
  -- 13ª (F64, 0164) — KIT COM MOTIVO ÓRFÃO
  -- ---------------------------------------------------------------------------
  -- O motivo de um kit mora como TEXTO dentro do `payload` jsonb de `kits_modelos` (0043), fora
  -- do alcance de qualquer FK. O gatilho `kits_modelos_motivo_da_empresa` (esta migration) recusa
  -- o kit que ENTRA na orfandade; esta peça conta o que JÁ está nela: todo kit — ativo ou não, porque
  -- reativar um kit sem mexer no motivo não passa pelo gatilho — cujo motivo não existe em `motivos`
  -- NA EMPRESA DO KIT. "Tem motivo" é a régua do gatilho: `payload->>'motivo'` não nulo e não vazio
  -- depois de `btrim`; a comparação é pelo valor exato, que é o que o fluxo de aplicação compara.
  -- A amostra é o id do kit: nenhum código de motivo, nenhum nome.
  -- ⚠ Lê `kits_modelos.empresa_id` e `motivos.empresa_id` antes da F66 — leitura de INTEGRIDADE,
  -- não recorte: a exceção nominal de `k_leitura_integridade` (supabase/tests/catalogo_policies.sql).
  return query
  with d as (
    select k.id::text as item
      from public.kits_modelos k
     where btrim(coalesce(k.payload->>'motivo', '')) <> ''
       and not exists (
         select 1 from public.motivos m
          where m.codigo = k.payload->>'motivo'
            and m.empresa_id = k.empresa_id)
  )
  select 'kit_motivo_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;
end;
$$;

-- o comment da coluna — o da 0139_vocabulario_import.sql
comment on column public.eventos_admin.acao is
  'F56 (era F54/F24/F23/F22/F21): o que aconteceu. TEXT e não enum de propósito — ação nova não deve exigir migration. Vocabulário fechado, espelhado em src/lib/auditoria.ts (ACOES_ADMIN/ACAO_ROTULO): convite_gerado, convite_reenviado, papel_alterado, vinculos_alterados, usuario_desativado, usuario_reativado, email_alterado, usuario_apagado, sessoes_encerradas, senha_criada, senha_revogada, senha_reativada, import_executado, import_falhou, ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado, conflito_filiais_resolvido, apelido_incluido, apelido_removido, usuario_criado. Os três da F22 (email_alterado, usuario_apagado, sessoes_encerradas) e os SETE da F23 (ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado) são privativos do cargo dev. O da F24 (conflito_filiais_resolvido) é do NÍVEL ADMINISTRADOR (admin ou dev) — é a única exclusão de ativo fora da Zona destrutiva, e alcança exclusivamente ativo que esteja num grupo de conflito entre filiais. O da F54 (import_falhou) é gravado pela Server Action, e não por RPC: ele registra a tentativa de import que a RPC recusou e o descarte do backup que já havia subido. Os DOIS da F56 (apelido_incluido, apelido_removido) são gravados pela Server Action da tela Administração › Filiais, do NÍVEL ADMINISTRADOR, a cada apelido de unidade incluído ou removido do vocabulário do import (migration 0139) — trocar um apelido é remover e incluir, e cada metade vira sua própria linha de trilha. O TERCEIRO da F56 (usuario_criado) é gravado pelo smoke do import (scripts/smoke/), que cria a persona fictícia seed.admin@wap.ind.br fora do fluxo de convite (auth.admin.createUser direto) — sem convite_gerado que preceda o cadastro dela. Os sete da F23 e o da F24 são gravados DENTRO das próprias RPCs, na mesma transação da operação — se a trilha falhar, a exclusão não acontece. Mexeu aqui, mexa lá — e vice-versa.';

-- =============================================================================
-- 0195 (a expansão) — as quatro RPCs de backup e as quatro policies do bucket backups-import voltam à forma antiga.
-- A 0199 as recriou de novo (só a forma nova); o corpo de antes da 0194 é um só, e vale para os dois estados.
-- =============================================================================

-- import_validar_plano(jsonb, text, jsonb, smallint) — o corpo de 0132_guardas_de_escopo.sql (o vigente antes da 0194)

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
       and l.created_at > now() - interval '24 hours'
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

-- resetar_acervo(uuid, smallint, text, text, text, jsonb) — o corpo de 0190_destrutivas_por_empresa.sql (o vigente antes da 0194)

create or replace function public.resetar_acervo(
  p_empresa       uuid,
  p_filial        smallint,
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text,
  p_contagens     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_esperado  text;
  v_prefixo   text;
  v_ativos    int := 0;
  v_movs      int := 0;
  v_anot      int := 0;
  v_pend      int := 0;
  v_termos    int := 0;
  v_arquivos  text[] := '{}'::text[];
  v_e_ativos  int;
  v_e_movs    int;
  v_e_anot    int;
  v_e_pend    int;
  v_e_termos  int;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;
  if p_filial is not null and not public.filial_da_empresa(p_empresa, p_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  -- A trava: a mesma família do import. O "tudo" trava cada filial DA EMPRESA e a sentinela DA EMPRESA.
  if p_filial is null then
    perform pg_advisory_xact_lock(hashtext('import_substituir'), f.id::int)
       from public.filiais f where f.empresa_id = p_empresa order by f.id;
    perform pg_advisory_xact_lock(hashtext('import_substituir'), hashtext(p_empresa::text));
  else
    perform pg_advisory_xact_lock(hashtext('import_substituir'), p_filial::int);
  end if;

  v_esperado := public.rotulo_alcance_reset(p_empresa, p_filial, 'acervo');
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para executar este reset.', v_esperado
      using errcode = '22023';
  end if;

  -- BACKUP OBRIGATÓRIO, CONFERIDO, e AMARRADO AO RECORTE (0089).
  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  v_prefixo := public.prefixo_backup_reset('acervo', p_filial);
  if btrim(p_backup_path) not like v_prefixo || '%' then
    raise exception 'O backup informado não é o backup DESTE recorte (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  if p_filial is not null and exists (
    select 1 from public.termos_gerados t
     where exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = p_filial)
       and exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id <> p_filial)
  ) then
    raise exception 'Há termo(s) que misturam esta filial com outra — reset bloqueado. Resolva os termos antes.'
      using errcode = '42501';
  end if;

  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere a prévia novamente antes de aplicar.'
      using errcode = '22023';
  end if;

  select count(*)::int into v_ativos from public.ativos a
   where a.empresa_id = p_empresa
     and (p_filial is null or a.filial_id = p_filial);
  select count(*)::int into v_movs from public.movimentacoes m
   where m.empresa_id = p_empresa
     and (p_filial is null
          or m.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_anot from public.anotacoes an
   where an.empresa_id = p_empresa
     and (p_filial is null
          or an.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_pend from public.pendencias_item pi
   where pi.empresa_id = p_empresa
     and (p_filial is null
          or pi.ativo_id in (select id from public.ativos where filial_id = p_filial));
  select count(*)::int into v_termos from public.termos_gerados t
   where t.empresa_id = p_empresa
     and (p_filial is null
          or exists (select 1 from unnest(t.ativo_ids) aid
                       join public.ativos a on a.id = aid where a.filial_id = p_filial));

  v_e_ativos := coalesce((p_contagens->>'ativos')::int, -1);
  v_e_movs   := coalesce((p_contagens->>'movimentacoes')::int, -1);
  v_e_anot   := coalesce((p_contagens->>'anotacoes')::int, -1);
  v_e_pend   := coalesce((p_contagens->>'pendencias_item')::int, -1);
  v_e_termos := coalesce((p_contagens->>'termos')::int, -1);

  if v_ativos <> v_e_ativos or v_movs <> v_e_movs or v_anot <> v_e_anot
     or v_pend <> v_e_pend or v_termos <> v_e_termos then
    raise exception 'O estado mudou desde a prévia/backup (ativos %/%, movimentações %/%, anotações %/%, pendências %/%, termos %/%). Gere a prévia novamente.',
      v_ativos, v_e_ativos, v_movs, v_e_movs, v_anot, v_e_anot, v_pend, v_e_pend, v_termos, v_e_termos
      using errcode = '40001';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item pi
   where pi.empresa_id = p_empresa
     and (p_filial is null
          or pi.ativo_id in (select id from public.ativos where filial_id = p_filial));

  with del as (
    delete from public.termos_gerados t
     where t.empresa_id = p_empresa
       and (p_filial is null
            or exists (select 1 from unnest(t.ativo_ids) aid
                         join public.ativos a on a.id = aid where a.filial_id = p_filial))
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]) into v_arquivos from del;

  delete from public.anotacoes an
   where an.empresa_id = p_empresa
     and (p_filial is null
          or an.ativo_id in (select id from public.ativos where filial_id = p_filial));

  delete from public.movimentacoes m
   where m.empresa_id = p_empresa
     and (p_filial is null
          or m.ativo_id in (select id from public.ativos where filial_id = p_filial));

  update public.ativos set substitui_ativo_id = null
   where substitui_ativo_id in (
     select id from public.ativos where empresa_id = p_empresa and (p_filial is null or filial_id = p_filial));

  delete from public.ativos a
   where a.empresa_id = p_empresa
     and (p_filial is null or a.filial_id = p_filial);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'acervo_resetado', v_esperado,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'alcance',         case when p_filial is null then 'empresa' else 'filial' end,
            'filial_id',       p_filial,
            'backup_path',     btrim(p_backup_path),
            'antes',           jsonb_build_object(
                                 'ativos', v_ativos, 'movimentacoes', v_movs,
                                 'anotacoes', v_anot, 'pendencias_item', v_pend,
                                 'termos', v_termos),
            'depois',          jsonb_build_object(
                                 'ativos', (select count(*) from public.ativos a
                                             where a.empresa_id = p_empresa
                                               and (p_filial is null or a.filial_id = p_filial)),
                                 'movimentacoes', (select count(*) from public.movimentacoes m
                                                    where m.empresa_id = p_empresa
                                                      and (p_filial is null
                                                           or m.ativo_id in (select id from public.ativos where filial_id = p_filial)))),
            'arquivos_termos', to_jsonb(v_arquivos)));

  return jsonb_build_object(
    'alcance',         case when p_filial is null then 'empresa' else 'filial' end,
    'filial_id',       p_filial,
    'rotulo',          v_esperado,
    'ativos',          v_ativos,
    'movimentacoes',   v_movs,
    'anotacoes',       v_anot,
    'pendencias_item', v_pend,
    'termos',          v_termos,
    'arquivos_termos', to_jsonb(v_arquivos),
    'restam_ativos',   (select count(*) from public.ativos a
                         where a.empresa_id = p_empresa
                           and (p_filial is null or a.filial_id = p_filial)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

-- resetar_itens(uuid, smallint, text, text, text, jsonb) — o corpo de 0190_destrutivas_por_empresa.sql (o vigente antes da 0194)

create or replace function public.resetar_itens(
  p_empresa       uuid,
  p_filial        smallint,
  p_confirmacao   text,
  p_justificativa text,
  p_backup_path   text,
  p_contagens     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_esperado text;
  v_prefixo  text;
  v_lanc     int := 0;
  v_e_lanc   int;
begin
  perform public.exigir_dev_para_destruir(p_empresa, p_justificativa);

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;
  if p_filial is not null and not public.filial_da_empresa(p_empresa, p_filial) then
    raise exception 'Esta filial pertence a outra empresa.' using errcode = '42501';
  end if;

  if p_filial is null then
    perform pg_advisory_xact_lock(hashtext('import_substituir'), f.id::int)
       from public.filiais f where f.empresa_id = p_empresa order by f.id;
    perform pg_advisory_xact_lock(hashtext('import_substituir'), hashtext(p_empresa::text));
  else
    perform pg_advisory_xact_lock(hashtext('import_substituir'), p_filial::int);
  end if;

  v_esperado := public.rotulo_alcance_reset(p_empresa, p_filial, 'itens');
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para executar este reset.', v_esperado
      using errcode = '22023';
  end if;

  if coalesce(length(btrim(p_backup_path)), 0) = 0 then
    raise exception 'Reset sem backup é proibido: o caminho do backup não veio. Gere o backup e tente de novo.'
      using errcode = '22023';
  end if;
  v_prefixo := public.prefixo_backup_reset('itens', p_filial);
  if btrim(p_backup_path) not like v_prefixo || '%' then
    raise exception 'O backup informado não é o backup DESTE recorte (esperado sob "%"). Nada foi apagado.', v_prefixo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'backups-import' and o.name = btrim(p_backup_path)
  ) then
    raise exception 'O backup informado não existe no bucket (%). Nada foi apagado. Gere o backup novamente.', btrim(p_backup_path)
      using errcode = '22023';
  end if;

  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then
    raise exception 'Revalidação de contagens obrigatória: gere a prévia novamente antes de aplicar.'
      using errcode = '22023';
  end if;

  select count(*)::int into v_lanc from public.lancamentos_item l
   where l.empresa_id = p_empresa
     and (p_filial is null or l.filial_id = p_filial);

  v_e_lanc := coalesce((p_contagens->>'lancamentos')::int, -1);
  if v_lanc <> v_e_lanc then
    raise exception 'O estado mudou desde a prévia/backup (lançamentos %/%). Gere a prévia novamente.',
      v_lanc, v_e_lanc using errcode = '40001';
  end if;

  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.lancamentos_item l
   where l.empresa_id = p_empresa
     and (p_filial is null or l.filial_id = p_filial);

  perform set_config('estoque.dev_destrutivo', 'off', true);

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'itens_resetados', v_esperado,
          jsonb_build_object(
            'justificativa', btrim(p_justificativa),
            'alcance',       case when p_filial is null then 'empresa' else 'filial' end,
            'filial_id',     p_filial,
            'backup_path',   btrim(p_backup_path),
            'antes',         jsonb_build_object('lancamentos', v_lanc),
            'depois',        jsonb_build_object('lancamentos',
                               (select count(*) from public.lancamentos_item l
                                 where l.empresa_id = p_empresa
                                   and (p_filial is null or l.filial_id = p_filial)))));

  return jsonb_build_object(
    'alcance',            case when p_filial is null then 'empresa' else 'filial' end,
    'filial_id',          p_filial,
    'rotulo',             v_esperado,
    'lancamentos',        v_lanc,
    'restam_lancamentos', (select count(*) from public.lancamentos_item l
                            where l.empresa_id = p_empresa
                              and (p_filial is null or l.filial_id = p_filial)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

-- apagar_ativos_conflito_filiais(uuid, uuid[], text, text, text) — o corpo de 0191_mesa_por_empresa.sql (o vigente antes da 0194)

create or replace function public.apagar_ativos_conflito_filiais(
  p_empresa       uuid,
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
  v_digest      text;
begin
  if v_uid is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  if p_empresa is null then
    raise exception 'Informe a empresa da operação.' using errcode = '42501';
  end if;

  -- F67: administrador DESTA empresa.
  if not public.e_admin_na(p_empresa) then
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

  -- SERIALIZA a ferramenta POR EMPRESA, antes de QUALQUER lock de linha (0100; F67: a chave carrega a empresa).
  perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'), hashtext(p_empresa::text));

  -- LOCK EM DOIS TEMPOS (0098): (1) as linhas SELECIONADAS por id.
  perform 1 from public.ativos a
   where a.id = any (v_ids)
   order by a.id
     for update;

  -- (2) SÓ AGORA lê as chaves — já sob trava.
  select coalesce(array_agg(distinct k), '{}'::text[])
    into v_chaves
    from public.ativos a
    cross join lateral (select public.chave_identidade_ativo(a.patrimonio, a.service_tag) as k) c
   where a.id = any (v_ids)
     and c.k is not null;

  -- (3) trava o RESTO do grupo — DENTRO DESTA EMPRESA: o gêmeo de outra empresa não é do grupo.
  if cardinality(v_chaves) > 0 then
    perform 1
       from public.ativos a
      where a.empresa_id = p_empresa
        and public.chave_identidade_ativo(a.patrimonio, a.service_tag) = any (v_chaves)
        and not (a.id = any (v_ids))
      order by a.id
        for update;
  end if;

  -- F67: OS ATIVOS SÃO DESTA EMPRESA? Depois da etapa (3) (leitura própria de `ativos`, já travada), antes da revalidação
  -- do grupo (pertencimento é recusa mais fundamental que "saiu do conflito") e fora da janela `estoque.dev_destrutivo`.
  perform public.exigir_ativos_da_empresa(p_empresa, v_ids);

  -- O grupo é recalculado DENTRO desta empresa.
  with ident as (
    select a.id, a.filial_id,
           public.chave_identidade_ativo(a.patrimonio, a.service_tag) as chave
      from public.ativos a
     where a.empresa_id = p_empresa
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

  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, v_uid, 'conflito_filiais_resolvido',
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

alter policy "backups-import leitura operador" on storage.objects
  using ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())));

alter policy "backups-import insere operador" on storage.objects
  with check ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())));

alter policy "backups-import atualiza operador" on storage.objects
  using ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())))
  with check ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())));

alter policy "backups-import apaga operador" on storage.objects
  using ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())));

-- =============================================================================
-- 0194 — as cinco funções do caminho por empresa saem (nenhuma policy nem corpo devolvido acima as cita).
-- =============================================================================

drop function if exists public.prefixo_backup_conflito(uuid);
drop function if exists public.prefixo_backup_reset(uuid, text, smallint);
drop function if exists public.prefixo_backup_import(uuid, smallint);
drop function if exists public.caminho_backup_legado(text);
drop function if exists public.empresa_do_caminho_backup(text);

notify pgrst, 'reload schema';

reset lock_timeout;

-- =====================================================================================================================
-- 0196_backup_orfao_duas_formas.sql — F67B (16/11/2026): a 12ª checagem nas DUAS formas, e a ferramenta nomeada de órfão (EXPANSÃO, lote 3)
-- =====================================================================================================================
-- classe: ADITIVA (create or replace do núcleo das checagens, mesma assinatura e grants; uma função NOVA)
--
-- A 12ª checagem (backup_orfao, no núcleo da 0164 — as delegantes não mudam) reconhecia as cópias de .docx só pela forma
-- ANTIGA: as de apagar ativo e de conflito por regex ancorada em ativo/ e conflito/<digest>/, e a de conflito chamando
-- prefixo_backup_conflito() — que a contração derruba. Agora reconhece:
--   · JSON registrado (import_logs.backup_path, eventos_admin.detalhe->>backup_path) — agnóstico, como antes;
--   · cópia de import/reset: o JSON registrado sem a extensão — agnóstico, como antes;
--   · cópia de apagar ativo: ativo/<id>/termos/ (antiga) e ativo/empresa-<uuid>/<id>/termos/ (nova), pelo id do ativo
--     do evento ativo_apagado;
--   · cópia de conflito: conflito/<digest>/termos/ (antiga, com o prefixo antigo CONGELADO como literal) e
--     conflito/empresa-<uuid>/<digest>/termos/ (nova), pelo digest da seleção do evento conflito_filiais_resolvido;
--   · a raiz da ferramenta de órfão, orfao/<carimbo>/termos/, pela trilha termos_sem_linha_limpos.
-- A 12ª NÃO confere a empresa do caminho contra a do evento (decisão da fase, PLAN-F67B): ler eventos_admin.empresa_id no
-- núcleo esbarraria na regra "nenhuma função lê empresa_id das dezenove" (15h de catalogo_policies.sql), e a 12ª é
-- faxina, não segurança — quem garante a empresa da cópia é a policy de escrita (só o admin daquela empresa grava sob
-- ela) e o client administrativo que monta o caminho com a empresa da operação. O resto do núcleo (as outras 12
-- checagens) é byte a byte o vigente. Em produção: 29 objetos, 0 na forma nova — a contagem não muda (os 12 do #84
-- continuam 12).
--
-- registrar_limpeza_termos_sem_linha(p_raiz, p_confirmacao, p_justificativa) → text[]: a FERRAMENTA NOMEADA de órfão
-- (decisão 9). O Storage recusa DELETE direto em storage.objects (o gatilho protect_objects_delete): a remoção é da API,
-- pela Server Action da Zona destrutiva. Esta função é a parte do banco, em SQL FIXO: só a PLATAFORMA (um .docx sem linha
-- não tem empresa — decisão 13/11-1, "dev sou só eu"), justificativa de 10+, raiz na forma orfao/<carimbo de 24>, a
-- lista dos .docx de termos SEM linha HÁ MAIS DE UMA HORA medida agora (o código anterior à F67B sobe o arquivo ANTES da
-- linha: um objeto recém-nascido sem linha pode ser um termo no meio da gravação, e nunca entra na lista), a confirmação digitada "LIMPAR <N> ARQUIVOS DE TERMO" com esse N, e a
-- TRILHA gravada antes de qualquer cópia (a 12ª reconhece a cópia por ela). Devolve a lista; a action copia e remove
-- exatamente ela, pela porta única (copiar-antes-de-remover.ts).
-- =====================================================================================================================

set lock_timeout = '2s';

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
         -- a forma ANTIGA do apagar ativo: ativo/<id>/termos/ (os antigos ficam para sempre — decisão 16/11-1)
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'ativo_apagado'
              and 'ativo/' || (ea.detalhe->>'ativo_id') || '/'
                  = substring(o.name from '^(ativo/[0-9a-fA-F-]{36}/)termos/')
         )
         -- F67B: a forma NOVA do apagar ativo: ativo/empresa-<uuid>/<id>/termos/ — pelo id do ativo do evento (a empresa
         -- do caminho é a da policy de escrita, que só deixa o admin daquela empresa gravar sob ela)
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'ativo_apagado'
              and (ea.detalhe->>'ativo_id')
                  = substring(o.name from '^ativo/empresa-[0-9a-f-]{36}/([0-9a-fA-F-]{36})/termos/')
         )
         -- a forma ANTIGA do conflito: conflito/<digest>/termos/ — o prefixo antigo CONGELADO como literal (a função
         -- antiga, sem empresa, sai na contração; a forma antiga não muda nunca mais)
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'conflito_filiais_resolvido'
              and jsonb_typeof(ea.detalhe->'selecionados') = 'array'
              and 'conflito/'
                  || public.digest_selecao_conflito(
                       array(select (x->>'ativo_id')::uuid
                               from jsonb_array_elements(ea.detalhe->'selecionados') x)) || '/'
                  = substring(o.name from '^(conflito/[0-9a-f]{32}/)termos/')
         )
         -- F67B: a forma NOVA do conflito: conflito/empresa-<uuid>/<digest>/termos/ — pelo digest da seleção do evento
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'conflito_filiais_resolvido'
              and jsonb_typeof(ea.detalhe->'selecionados') = 'array'
              and public.digest_selecao_conflito(
                    array(select (x->>'ativo_id')::uuid
                            from jsonb_array_elements(ea.detalhe->'selecionados') x))
                  = substring(o.name from '^conflito/empresa-[0-9a-f-]{36}/([0-9a-f]{32})/termos/')
         )
         -- F67B: a raiz da ferramenta de órfão (orfao/<carimbo>/termos/), reconhecida pela trilha que a RPC grava ANTES
         -- da cópia (registrar_limpeza_termos_sem_linha)
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'termos_sem_linha_limpos'
              and (ea.detalhe->>'raiz') || '/' = substring(o.name from '^(orfao/[^/]+/)termos/')
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

create function public.registrar_limpeza_termos_sem_linha(p_raiz text, p_confirmacao text, p_justificativa text)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lista    text[];
  v_esperada text;
begin
  if (select auth.uid()) is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;
  -- um .docx sem linha não é de empresa nenhuma: quem o limpa é a PLATAFORMA (decisão 13/11-1)
  if not public.e_plataforma() then
    raise exception 'Limpar arquivos de termo sem registro é restrito à plataforma.' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.' using errcode = '22023';
  end if;
  if p_raiz is null or p_raiz !~ '^orfao/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z$' then
    raise exception 'A pasta da cópia dos arquivos de termo está fora da forma. Nada foi registrado.' using errcode = '22023';
  end if;

  -- duas limpezas ao mesmo tempo contariam a mesma lista
  perform pg_advisory_xact_lock(hashtext('termos_sem_linha_limpar'));

  v_lista := array(
    select o.name
      from storage.objects o
     where o.bucket_id = 'termos'
       and o.created_at < now() - interval '1 hour'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
     order by o.name);
  v_esperada := 'LIMPAR ' || coalesce(array_length(v_lista, 1), 0)::text || ' ARQUIVOS DE TERMO';
  if p_confirmacao is distinct from v_esperada then
    raise exception 'Confirmação incorreta: digite exatamente "%". Nada foi registrado.', v_esperada using errcode = '22023';
  end if;
  if coalesce(array_length(v_lista, 1), 0) = 0 then
    raise exception 'Não há arquivo de termo sem registro para limpar.' using errcode = '22023';
  end if;
  if exists (select 1 from public.eventos_admin e
              where e.acao = 'termos_sem_linha_limpos' and e.detalhe->>'raiz' = p_raiz) then
    raise exception 'Esta pasta de cópia já foi usada. Nada foi registrado.' using errcode = '22023';
  end if;

  -- a TRILHA, antes de qualquer cópia: a 12ª reconhece a cópia sob a raiz por ela
  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values ((select auth.uid()), 'termos_sem_linha_limpos', p_raiz,
          jsonb_build_object('raiz', p_raiz, 'arquivos', to_jsonb(v_lista), 'total', array_length(v_lista, 1),
                             'justificativa', btrim(p_justificativa)));
  return v_lista;
end;
$$;

comment on function public.registrar_limpeza_termos_sem_linha(text, text, text) is
  'F67B (0196): a ferramenta NOMEADA de órfão da Zona destrutiva — a parte do banco. Só a plataforma; justificativa; raiz orfao/<carimbo>; a lista dos .docx de termos sem linha há mais de uma hora (nunca um termo no meio da gravação); a confirmação digitada LIMPAR <N> ARQUIVOS DE TERMO; a trilha termos_sem_linha_limpos gravada ANTES da cópia. A cópia e a remoção são da API do Storage (o gatilho protect_objects_delete recusa DELETE por SQL), pela Server Action, só da lista devolvida.';

revoke all on function public.registrar_limpeza_termos_sem_linha(text, text, text) from public, anon, service_role;
grant execute on function public.registrar_limpeza_termos_sem_linha(text, text, text) to authenticated;

-- O verbo novo na trilha: o comment de eventos_admin.acao REESCRITO POR INTEIRO (o Postgres não faz "append" em comment)
-- — os 25 da 0139, na MESMA ordem, MAIS termos_sem_linha_limpos no fim (src/lib/validators/dev-destrutivo.test.ts confere).
comment on column public.eventos_admin.acao is
  'F67B (era F56/F54/F24/F23/F22/F21): o que aconteceu. TEXT e não enum de propósito — ação nova não deve exigir migration. Vocabulário fechado, espelhado em src/lib/auditoria.ts (ACOES_ADMIN/ACAO_ROTULO): convite_gerado, convite_reenviado, papel_alterado, vinculos_alterados, usuario_desativado, usuario_reativado, email_alterado, usuario_apagado, sessoes_encerradas, senha_criada, senha_revogada, senha_reativada, import_executado, import_falhou, ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado, conflito_filiais_resolvido, apelido_incluido, apelido_removido, usuario_criado, termos_sem_linha_limpos. Os três da F22 (email_alterado, usuario_apagado, sessoes_encerradas) e os SETE da F23 (ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado) são privativos do cargo dev. O da F24 (conflito_filiais_resolvido) é do NÍVEL ADMINISTRADOR (admin ou dev) — é a única exclusão de ativo fora da Zona destrutiva, e alcança exclusivamente ativo que esteja num grupo de conflito entre filiais. O da F54 (import_falhou) é gravado pela Server Action, e não por RPC: ele registra a tentativa de import que a RPC recusou e o descarte do backup que já havia subido. Os DOIS da F56 (apelido_incluido, apelido_removido) são gravados pela Server Action da tela Administração › Filiais, do NÍVEL ADMINISTRADOR, a cada apelido de unidade incluído ou removido do vocabulário do import (migration 0139) — trocar um apelido é remover e incluir, e cada metade vira sua própria linha de trilha. O TERCEIRO da F56 (usuario_criado) é gravado pelo smoke do import (scripts/smoke/), que cria a persona fictícia seed.admin@wap.ind.br fora do fluxo de convite (auth.admin.createUser direto) — sem convite_gerado que preceda o cadastro dela. O da F67B (termos_sem_linha_limpos) é da PLATAFORMA (e_plataforma), gravado por registrar_limpeza_termos_sem_linha (0196) ANTES da cópia dos .docx de termo sem registro — a 12ª checagem reconhece a cópia por ele. Os sete da F23, o da F24 e o da F67B são gravados DENTRO das próprias RPCs, na mesma transação da operação — se a trilha falhar, a exclusão não acontece. Mexeu aqui, mexa lá — e vice-versa.';


notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   o md5 do prosrc do núcleo = o do CI; as 13 checagens IGUAIS aos números travados (backup_orfao 12, detentor 1,
--   arquivo_termo_orfao 3, conflito 59, o resto 0); a função nova existe, definer, search_path vazio, executável só por
--   authenticated.
--
-- ROLLBACK (supabase/rollback/F67B-desfaz.sql, na ordem inversa 0199 → 0194): derrubar registrar_limpeza_termos_sem_linha, recriar o núcleo com o corpo da 0164 e reemitir o comment de eventos_admin.acao da 0139.

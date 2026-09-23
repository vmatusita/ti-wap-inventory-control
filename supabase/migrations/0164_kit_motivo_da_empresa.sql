-- =============================================================================
-- 0164_kit_motivo_da_empresa.sql — F64 (23/09/2026): o kit com o motivo da EMPRESA do kit
-- =============================================================================
-- classe: ADITIVA (uma função de gatilho e um gatilho novos; o núcleo da integridade ganha a 13ª peça)
--
-- O motivo de um kit mora como TEXTO LIVRE dentro do `payload` jsonb de `kits_modelos` (0043:40),
-- fora do alcance de qualquer FK — FK composta não alcança jsonb. Um kit da empresa A apontando para
-- um motivo que não existe (ou para o motivo homônimo de OUTRA empresa) sobreviveria à virada em
-- silêncio: o fluxo só o descarta na hora de aplicar. A ficha F64 manda validar no insert/update do
-- kit que o motivo existe NA EMPRESA DO KIT, mais uma checagem nova de integridade para o kit que já
-- está órfão. Esta migration faz as duas, NO BANCO (a regra crítica mora no Postgres; a action
-- `kits.ts` só traduz a recusa para pt-BR).
--
-- 1) `public.kit_motivo_da_empresa()` + o gatilho `kits_modelos_motivo_da_empresa`
--    (BEFORE INSERT OR UPDATE OF payload, empresa_id, FOR EACH ROW):
--    · "tem motivo" = `payload->>'motivo'` não nulo e não vazio depois de `btrim` — sem a chave,
--      com `null` JSON (que `->>` devolve como SQL NULL) ou com texto vazio/só espaços é "sem
--      motivo", o mesmo que o Zod de `kit.ts` normaliza (a chave ausente);
--    · com motivo, tem de existir linha em `motivos` com esse `codigo` (o valor exato) E o MESMO
--      `empresa_id` do kit — ativa ou não (o fluxo re-filtra ao aplicar). Senão: 23503
--      (foreign_key_violation, a semântica de "referência inexistente" — a 0156 já o usa para um
--      quase-FK por gatilho) com a frase PRÓPRIA "O motivo deste kit não existe na empresa do kit."
--      — sem o texto `foreign key`, para o ramo genérico de FK de `erros.ts` não a pegar; o ramo
--      dela é `kitMotivoForaDaEmpresa` (`erros-do-banco.ts`). Nenhum valor na mensagem;
--    · confere a ENTRADA na orfandade: no INSERT, sempre; no UPDATE, só quando o motivo ou a empresa
--      MUDAM. Desativar (`ativo = false`), renomear ou editar outro campo de um kit que já estava
--      órfão PASSA — é o que a tela faz (`atualizarKit` reenvia o payload inteiro, e o `update of
--      payload` dispararia mesmo sem mudança — doc do PG 17: a coluna no SET basta);
--    · SECURITY INVOKER, `search_path = public`, nomes qualificados: quem grava kit é o admin pela
--      sessão (policy `e_admin()`) ou o dono; `motivos` é legível pelo piso (`leitura operador`,
--      0070); o service role atravessa a RLS. Invoker não entra em `k_secdef`, nem na tabela-verdade
--      de `definer_sem_tenant.sql`, nem soma WARN de definer no advisor. `revoke all` de `public`,
--      `anon`, `authenticated` (o molde de `vocabulario_unidades_guarda`, 0139): ela só é chamável
--      como gatilho.
--
-- 2) `public.checagens_integridade_nucleo()` com a 13ª peça, `kit_motivo_orfao` (o kit, ativo ou
--    não, cujo motivo não existe na empresa dele; amostra = o id do kit). O corpo é o VIGENTE da
--    0158, BYTE A BYTE, com a 13ª peça acrescentada depois da 12ª e antes do `end;` — e nada mais.
--    As provas: o md5 de cada uma das 12 peças (`return query … from d;`) contra o da 0158, no CI
--    (`supabase/tests/kit_motivo_da_empresa.sql`, C8) e nos dois bancos
--    (`docs/f64-evidencias/impressao-vocabulario.sql`, `nucleo.md5_por_peca`); e, na mesa, o corpo
--    desta migration menos o bloco novo é IGUAL ao da 0158. `create or replace` preserva dono e ACL
--    (a 0138 fechou a função a todo papel da API; a 0158 não reemitiu grant, esta também não). As duas
--    portas (`dev_checagens_integridade`, `checagens_integridade_resumo`) só delegam: a chave nova
--    aparece nelas sem recriá-las.
--
-- ⚠ A CHAVE NOVA E O ALARME (fato 14 da ordem): a partir do apply desta migration o núcleo devolve
-- `kit_motivo_orfao`. A política do alarme (`scripts/smoke/linha-de-base.json`, com 0 nos dois
-- alvos), o catálogo curado `CHECAGENS` (`src/lib/queries/dev.ts`) e a cobertura a conhecem NO MESMO
-- commit desta migration; entre o apply em produção e o merge, uma Parte B do `saude.yml` abriria o
-- alarme "checagem que a política não conhece" — por isso o merge vem logo depois das provas
-- (docs/PLAN-F64.md, decisão 11).
--
-- ⚠ AS DUAS LEITURAS DE `empresa_id` ANTES DA F66 (fato 15): o gatilho e a 13ª peça leem
-- `kits_modelos.empresa_id` e `motivos.empresa_id`. É integridade, não recorte — nenhuma decide o que
-- alguém VÊ —, e são as duas exceções NOMINAIS de `k_leitura_integridade` (catalogo_policies.sql),
-- a fonte única que a trava "ninguém lê" usa.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) O gatilho do kit
-- ---------------------------------------------------------------------------
create function public.kit_motivo_da_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_motivo text := new.payload->>'motivo';
begin
  -- Sem motivo: a chave ausente, o null JSON ou texto vazio/só espaços (o que o Zod normaliza).
  if v_motivo is null or btrim(v_motivo) = '' then
    return new;
  end if;
  -- No UPDATE, só confere quando o motivo ou a empresa MUDAM: desativar, renomear ou editar outro
  -- campo de um kit que já estava órfão passa (a checagem kit_motivo_orfao é quem o denuncia).
  if tg_op = 'UPDATE'
     and v_motivo is not distinct from old.payload->>'motivo'
     and new.empresa_id is not distinct from old.empresa_id then
    return new;
  end if;
  if not exists (
    select 1 from public.motivos m
     where m.codigo = v_motivo
       and m.empresa_id = new.empresa_id
  ) then
    raise exception 'O motivo deste kit não existe na empresa do kit.'
      using errcode = '23503',
            hint = 'Escolha um motivo cadastrado na empresa do kit, ou deixe o kit sem motivo.';
  end if;
  return new;
end;
$$;

comment on function public.kit_motivo_da_empresa() is
  'F64 (0164, 23/09/2026): a função do gatilho kits_modelos_motivo_da_empresa. Recusa (23503, frase própria) o kit cujo payload tem motivo que não existe em motivos NA EMPRESA DO KIT; sem motivo (chave ausente, null, vazio) passa. No UPDATE só confere quando o motivo ou a empresa mudam — desativar um kit que já estava órfão continua possível; a checagem kit_motivo_orfao o denuncia. SECURITY INVOKER. Lê kits_modelos.empresa_id/motivos.empresa_id antes da F66: leitura de integridade, a exceção nominal de k_leitura_integridade.';

revoke all on function public.kit_motivo_da_empresa() from public, anon, authenticated;

create trigger kits_modelos_motivo_da_empresa
  before insert or update of payload, empresa_id on public.kits_modelos
  for each row execute function public.kit_motivo_da_empresa();

-- ---------------------------------------------------------------------------
-- 2) checagens_integridade_nucleo — a 13ª peça, kit_motivo_orfao
-- ---------------------------------------------------------------------------
-- O corpo é o VIGENTE da 0158, byte a byte, com a 13ª peça acrescentada antes do `end;`.
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

comment on function public.checagens_integridade_nucleo() is
  'F64 (0164, 23/09/2026 — era F62/0158, F55/0138): o SQL das TREZE checagens de integridade, em UM lugar só. A F64 acrescentou SÓ a 13ª, kit_motivo_orfao (o kit, ativo ou não, cujo motivo não existe em motivos na empresa do kit; amostra = o id do kit) — as doze de antes estão byte a byte como na 0158. Não é alcançável de fora (revoke de public, anon, authenticated e service_role): quem a chama são as duas portas, dev_checagens_integridade() (guarda e_dev) e checagens_integridade_resumo() (guarda papel_atual is not null). SQL FIXO por dentro.';

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo e contagem) ----------
--   docs/f64-evidencias/verificacao-pos-apply.sql (blocos `kit`/`integridade`): o gatilho BEFORE,
--   por linha, INSERT + UPDATE OF payload, empresa_id, a função INVOKER com search_path fixo; o núcleo
--   com 13 chaves e kit_motivo_orfao = 0 (kits_modelos está vazia nos dois bancos — fato 3);
--   docs/f64-evidencias/impressao-vocabulario.sql: `nucleo.md5_por_peca` com as doze de antes iguais.
--   notify pgrst, 'reload schema';
--
-- ROLLBACK (supabase/rollback/F64-desfaz.sql, passo 1 — o PRIMEIRO do rollback da fase):
--   drop trigger if exists kits_modelos_motivo_da_empresa on public.kits_modelos;
--   drop function if exists public.kit_motivo_da_empresa();
--   e o núcleo DE VOLTA ao corpo da 0158 — o arquivo de rollback o traz copiado da 0158, byte a byte,
--   com o comment on function dela (a prova: o md5 do prosrc volta a 06359abd286206bde8432609128ebccd).

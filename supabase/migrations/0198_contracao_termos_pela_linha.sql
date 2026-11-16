-- =====================================================================================================================
-- 0198_contracao_termos_pela_linha.sql — F67B (16/11/2026): CONTRAÇÃO do bucket termos — o dono é a LINHA (lida e escrita), o objeto sem linha fecha
-- =====================================================================================================================
-- classe: ADITIVA (o classificador calcula assim: create or replace de duas funções, alter policy de três, drop de uma)
--
-- ⚠ SÓ DEPOIS DO DEPLOY DO APP NOVO E DA PROVA ESTÁTICA (fato 33 da ordem, RUNBOOK Anexo F67B). Esta migration fecha o
-- que o app VELHO ainda faz, e por isso não roda antes dele sair do ar:
--   (a) o persistirTermo velho sobe o .docx ANTES da linha (upsert: true) — com o coalesce false o upload sem linha é
--       recusado, e o upsert exige SELECT, que pelo join falha sem linha;
--   (c) o import velho copia o .docx pela SESSÃO depois da RPC (a linha já saiu) — pelo join, o SELECT da origem falha e
--       o .docx viraria órfão. O novo copia com o client administrativo (decisão 16/11-2).
--
--   pode_ler_arquivo_termo(nome)   pelo JOIN: existe linha de termos_gerados com arquivo_path = nome cuja empresa tem
--                                  quem chama como membro ativo (papel_na_empresa(t.empresa_id)). Objeto sem linha:
--                                  ninguém da sessão lê. Sai das exceções de definer_sem_tenant.sql (k_escopo_ok, 4b).
--     antes:  select (select public.papel_na_empresa(public.empresa_legada())) is not null
--   pode_escrever_arquivo_termo    coalesce(…, false): objeto que nenhuma linha referencia não é gravável nem apagável.
--     antes:  …), true )   depois: …), false )
--   as 3 policies de escrita de termos: sem o piso (select public.pode_escrever_na(public.empresa_legada())) — quem
--   decide é a linha (pode_escrever_arquivo_termo); o piso só existia porque o true deixava o objeto sem linha aberto.
--   pode_escrever_termo(uuid[])    sai (sem if exists, sem cascade): desde a 0197 nada a cita.
-- =====================================================================================================================

set lock_timeout = '2s';

create or replace function public.pode_ler_arquivo_termo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- F67B: pelo JOIN com termos_gerados — o .docx é lido por quem é membro ativo da empresa DA LINHA que o referencia;
  -- objeto que nenhuma linha referencia não é lido por ninguém da sessão
  select exists (
    select 1
      from public.termos_gerados t
     where t.arquivo_path = p_nome
       and public.papel_na_empresa(t.empresa_id) is not null
  )
$$;

comment on function public.pode_ler_arquivo_termo(text) is
  'F67B (0198): true se quem chama é membro ativo da empresa da LINHA de termos_gerados que referencia este objeto do bucket termos (papel_na_empresa(t.empresa_id)). Objeto que nenhuma linha referencia → false para todos da sessão. A policy "termos leitura operador" a chama pelo falso içamento da 0129 (exceção R1 permanente: o arquivo decide pela linha).';

create or replace function public.pode_escrever_arquivo_termo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select bool_and(public.pode_escrever_termo(t.empresa_id, t.ativo_ids))
       from public.termos_gerados t
      where t.arquivo_path = p_nome),
    false
  )
$$;

comment on function public.pode_escrever_arquivo_termo(text) is
  'F67B (0198): true se quem chama pode escrever/apagar ESTE objeto do bucket termos — decide pela(s) linha(s) de termos_gerados que apontam o nome, na empresa DELAS (pode_escrever_termo(t.empresa_id, t.ativo_ids); bool_and: a mais restritiva manda). Objeto que nenhuma linha referencia → FALSE: desde a F67B o persistirTermo grava a linha ANTES do upload, e a limpeza de órfão é a ferramenta nomeada da Zona destrutiva (client administrativo).';

alter policy "termos insere operador" on storage.objects
  with check (bucket_id = 'termos' and public.pode_escrever_arquivo_termo(name));

alter policy "termos atualiza operador" on storage.objects
  using (bucket_id = 'termos' and public.pode_escrever_arquivo_termo(name))
  with check (bucket_id = 'termos' and public.pode_escrever_arquivo_termo(name));

alter policy "termos apaga operador" on storage.objects
  using (bucket_id = 'termos' and public.pode_escrever_arquivo_termo(name));

drop function public.pode_escrever_termo(uuid[]);

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   to_regprocedure('public.pode_escrever_termo(uuid[])') nulo; o md5 das duas funções e das três policies = o do CI;
--   o conta a conta --fase f67b-contraida: SÓ as classes declaradas divergem, exatamente no esperado (os .docx sem
--   linha); as 13 checagens iguais (a 8ª continua 3: nenhum objeto se moveu).
--
-- ROLLBACK (supabase/rollback/F67B-desfaz.sql, na ordem inversa 0199 → 0194): PRIMEIRO o que esta contração tirou: pode_escrever_termo(uuid[]) recriada (com os grants da 0069), o coalesce de
-- volta a true e o piso de volta nas três policies de escrita, a leitura de volta à legada (0186). Nenhum dado se perde.

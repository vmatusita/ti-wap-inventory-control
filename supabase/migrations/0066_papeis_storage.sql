-- Migration 0066 — F21: as policies de STORAGE também passam a olhar o cargo.
--
-- ACHADO DESTA FASE, fora do mapa da ordem. O §5 da ordem mapeia tabela por tabela e não
-- menciona `storage.objects`. A varredura de descoberta encontrou o resto do buraco: os dois
-- buckets privados têm 4 policies cada — SELECT/INSERT/UPDATE/DELETE — todas
-- `to authenticated` com o único predicado `bucket_id = '<nome>'`, sem nenhuma noção de
-- cargo (0021 para `termos`, 0031 para `backups-import`).
--
-- Sem esta migration, a F21 fecharia a porta e deixaria a janela aberta:
--   · o cargo `consulta` — que por definição não escreve nada — poderia SUBIR e APAGAR
--     arquivos .docx no bucket `termos` chamando a API de Storage direto com a anon key + o
--     próprio JWT (a UI não oferece o botão, mas a UI nunca foi a defesa);
--   · qualquer não-admin continuaria podendo LISTAR e BAIXAR os backups de acervo do
--     bucket `backups-import`, mesmo depois de a 0063 esconder `import_logs.backup_path`
--     dele. Restringir a tabela e deixar o bucket aberto seria fechar a porta e deixar a
--     chave na fechadura.
--
-- MAPA (espelha o das tabelas correspondentes na 0063):
--   `termos`         → leitura: qualquer logado (a ficha do ativo mostra o termo a quem lê;
--                      o link é sempre signed URL curta, gerado no servidor).
--                      escrita (insert/update/delete): papel ∈ {admin, operador} — o mesmo
--                      predicado de `termos_gerados`, para o par tabela+arquivo não poder
--                      divergir.
--   `backups-import` → leitura E escrita: `e_admin()`, igual a `import_logs` e à RPC de
--                      import. Backup de acervo é matéria de admin, ponta a ponta.
--
-- `alter policy` (e não drop/create) nas 8: comando e roles ficam idênticos, muda só o
-- predicado — não há instante sem proteção (precedente 0059). Nos UPDATE, `bucket_id`
-- continua nos DOIS lados (using e with check), senão daria para MOVER um objeto de um
-- bucket para o outro e escapar do predicado pelo lado que não checa.
--
-- `(select ...)` nas chamadas sem argumento: doutrina initplan da 0059.
--
-- NÃO toca objeto nenhum, não apaga arquivo, não muda bucket. Aditiva/reversível.
-- Não bate no gate. Caminho A do runbook (ensaio → produção).
--
-- REVERSÃO: devolver os 8 predicados ao que a 0021/0031 criaram, isto é, remover as
-- conjunções de papel e deixar só `bucket_id = '<nome>'`.

-- ===========================================================================
-- bucket `termos` — leitura para todo logado; escrita para admin/operador
-- ===========================================================================
-- Leitura fica como está de propósito: `consulta` PRECISA ver o termo (é leitura, e o §3 do
-- ADR dá a ele o app inteiro em modo leitura). Reafirmada aqui só para o predicado ficar
-- explícito no histórico — a expressão é idêntica à da 0021.
alter policy "termos leitura operador" on storage.objects
  using (bucket_id = 'termos');

alter policy "termos insere operador" on storage.objects
  with check (
    bucket_id = 'termos'
    and (select public.papel_atual()) in ('admin', 'operador')
  );

alter policy "termos atualiza operador" on storage.objects
  using (
    bucket_id = 'termos'
    and (select public.papel_atual()) in ('admin', 'operador')
  )
  with check (
    bucket_id = 'termos'
    and (select public.papel_atual()) in ('admin', 'operador')
  );

-- DELETE existe porque `persistirTermo` remove o .docx órfão junto com a linha da tabela
-- (src/lib/actions/termos.ts) e porque o import apaga os termos da filial substituída.
alter policy "termos apaga operador" on storage.objects
  using (
    bucket_id = 'termos'
    and (select public.papel_atual()) in ('admin', 'operador')
  );

-- ===========================================================================
-- bucket `backups-import` — admin em tudo, leitura inclusive
-- ===========================================================================
alter policy "backups-import leitura operador" on storage.objects
  using (bucket_id = 'backups-import' and (select public.e_admin()));

alter policy "backups-import insere operador" on storage.objects
  with check (bucket_id = 'backups-import' and (select public.e_admin()));

alter policy "backups-import atualiza operador" on storage.objects
  using      (bucket_id = 'backups-import' and (select public.e_admin()))
  with check (bucket_id = 'backups-import' and (select public.e_admin()));

alter policy "backups-import apaga operador" on storage.objects
  using (bucket_id = 'backups-import' and (select public.e_admin()));

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select policyname, cmd,
--          coalesce(qual, '-')       as usando,
--          coalesce(with_check, '-') as checando
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and (policyname like 'termos%' or policyname like 'backups-import%')
--    order by policyname;
--   -- esperado: 8 linhas. As 4 de `backups-import` citam e_admin() (a de SELECT também);
--   -- em `termos`, as 3 de escrita citam papel_atual() e a de SELECT NÃO cita nenhuma
--   -- função (leitura segue aberta a todo logado).
--
--   -- os buckets continuam privados
--   select id, public from storage.buckets where id in ('termos', 'backups-import');
--   -- esperado: 2 linhas, public = false nas duas
--
--   -- nenhum arquivo foi tocado
--   select bucket_id, count(*) from storage.objects
--    where bucket_id in ('termos', 'backups-import') group by bucket_id;
--   -- esperado: as mesmas contagens de antes do apply

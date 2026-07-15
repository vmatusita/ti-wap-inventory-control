-- 0026: filial "Serra Park" vira "Serra" (decisão do Johnny, 15/07/2026 —
-- pergunta 1 da spec §13): Serra Park é filial própria com estoque, nome
-- oficial "Serra". Filiais oficiais: Matriz, CD-Afonso Pena, Linhares,
-- Eusébio, Serra (slugs: matriz, cd-afonso-pena, linhares, eusebio, serra).
--
-- Idempotente: renomeia se existir o slug antigo; garante que a linha exista
-- em bancos novos (o seed fixo 0007 continua inserindo serra-park antes desta).

update public.filiais
   set slug = 'serra', nome = 'Serra'
 where slug = 'serra-park'
   and not exists (select 1 from public.filiais where slug = 'serra');

insert into public.filiais (slug, nome)
select 'serra', 'Serra'
 where not exists (select 1 from public.filiais where slug = 'serra');

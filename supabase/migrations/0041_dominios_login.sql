-- Migration 0041 — dominios de e-mail aceitos no login de OPERADOR (22/07/2026).
--
-- Ate aqui o trigger `handle_new_user` (0001) so aceitava `@wap.ind.br`. Decisao do
-- Johnny (22/07/2026): a equipe terceirizada da Stefanini passa a OPERAR o sistema —
-- nao so consultar relatorio por senha de acesso —, entao `@stefanini.com` e
-- `@latam.stefanini.com` tambem viram login de operador. Revoga a resposta 3 da
-- §13 da spec (09/07/2026); registrado em docs/DECISOES.md e na spec §3.
--
-- O que NAO muda: nivel unico (todo logado e operador, sem papeis/roles) e convite
-- como unico caminho de entrada (nao ha auto-cadastro) — quem entra continua sendo
-- escolhido por um operador.
--
-- Casamento por SUFIXO EXATO com o '@': `%@stefanini.com` NAO casa
-- `alguem@fake-stefanini.com` (o caractere antes de `stefanini.com` tem que ser o
-- proprio '@') nem `alguem@stefanini.com.br`; e `@latam.stefanini.com` e um dominio
-- a parte — nao entra pelo padrao do outro. `ilike` = case-insensitive.
-- Espelhado em src/lib/auth/dominios-email.ts (2a linha, na UI/Server Action).
--
-- `create or replace` preserva dono e ACL, entao os `revoke` da 0038 continuam
-- valendo; reafirmados no fim por seguranca (idempotente).
--
-- NAO TOCA DADO: so troca o corpo da funcao; contas existentes seguem intactas.
-- Aditiva. Aplicar em prod e ensaio.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or not (
          new.email ilike '%@wap.ind.br'
       or new.email ilike '%@stefanini.com'
       or new.email ilike '%@latam.stefanini.com'
     )
  then
    raise exception 'Login restrito a contas @wap.ind.br, @stefanini.com ou @latam.stefanini.com';
  end if;
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email));
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

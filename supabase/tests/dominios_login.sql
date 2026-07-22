-- =============================================================
-- Roteiro de teste dos DOMINIOS DE LOGIN do operador (trigger handle_new_user,
-- migrations 0001 -> 0041). Escrito em 22/07/2026, quando `@stefanini.com` e
-- `@latam.stefanini.com` entraram ao lado de `@wap.ind.br` (spec §3).
--
-- Rodar no SQL editor do projeto DEV/ensaio (ou automatico no job `banco` do CI).
-- Auto-verificavel:
--   NOTICE  '✓ ...'  quando o resultado bate com o esperado
--   WARNING '✗ ...'  quando NAO bate (procure ✗ na aba Messages / o CI falha em ✗)
-- Os casos negativos DEVEM ser recusados — o roteiro captura a excecao e marca ✓
-- (e exige que a excecao seja A DO TRIGGER, nao um erro qualquer de insert).
--
-- Cobre: os 3 dominios aceitos · caixa alta · e-mail nulo · dominio de fora ·
-- sufixo parecido sem o '@' (fake-stefanini.com) · dominio vizinho (.com.br) ·
-- dominio no meio do endereco · subdominio nao listado. E confere que o profile
-- foi criado para quem entrou.
--
-- Tudo roda numa transacao que termina em ROLLBACK: NADA e gravado (nenhuma conta
-- de teste sobra em auth.users). Sem pre-requisito de dado.
-- =============================================================

begin;

do $$
declare
  r        record;
  v_id     uuid;
  v_ok     boolean;
  v_err    text;
  v_nome   text;
  v_qtd    int;
begin
  for r in
    select * from (values
      ('ana@wap.ind.br',             true,  'dominio WAP (o de sempre)'),
      ('ANA.MAIUSCULA@WAP.IND.BR',   true,  'caixa alta — a checagem e case-insensitive'),
      ('bruno@stefanini.com',        true,  'Stefanini (novo em 22/07/2026)'),
      ('carla@latam.stefanini.com',  true,  'Stefanini LATAM (novo em 22/07/2026)'),
      (null,                         false, 'e-mail nulo (cadastro so por telefone)'),
      ('dora@gmail.com',             false, 'dominio de fora'),
      ('eva@fake-stefanini.com',     false, 'sufixo parecido SEM o @ — nao pode passar'),
      ('gil@stefanini.com.br',       false, 'dominio vizinho (.com.br) nao entra'),
      ('ian@latam.stefanini.com.mx', false, 'sufixo alem do dominio nao entra'),
      ('joao@wap.ind.br.exemplo.com',false, 'dominio WAP no meio do endereco nao entra'),
      ('kim@br.stefanini.com',       false, 'subdominio nao listado nao entra')
    ) as t(email, esperado, descricao)
  loop
    v_id := gen_random_uuid();
    v_err := null;
    begin
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        r.email, '', now(), now(), now()
      );
      v_ok := true;
    exception when others then
      v_ok := false;
      v_err := sqlerrm;
    end;

    if v_ok <> r.esperado then
      raise warning '✗ %: esperava %, veio % (%) [erro: %]',
        coalesce(r.email, '<null>'),
        case when r.esperado then 'ACEITO' else 'RECUSADO' end,
        case when v_ok then 'ACEITO' else 'RECUSADO' end,
        r.descricao, coalesce(v_err, '-');
    elsif not r.esperado and v_err not like 'Login restrito%' then
      -- Recusou, mas por outro motivo (NOT NULL, unique...): o teste nao provaria
      -- a trava de dominio. Falha de proposito.
      raise warning '✗ %: recusado por erro ALHEIO ao trigger de dominio: %',
        coalesce(r.email, '<null>'), v_err;
    else
      raise notice '✓ % → % (%)',
        coalesce(r.email, '<null>'),
        case when v_ok then 'aceito' else 'recusado' end,
        r.descricao;
    end if;

    -- Quem entrou tem que sair com profile criado pelo trigger (nome = e-mail).
    if v_ok then
      select nome into v_nome from public.profiles where id = v_id;
      if v_nome = r.email then
        raise notice '  ✓ profile criado para % (nome = e-mail)', r.email;
      else
        raise warning '✗ profile de %: esperava nome = e-mail, veio %',
          r.email, coalesce(v_nome, '<sem profile>');
      end if;
    end if;
  end loop;

  -- Nenhum recusado pode ter deixado profile para tras.
  select count(*) into v_qtd from public.profiles
   where nome in ('dora@gmail.com', 'eva@fake-stefanini.com', 'gil@stefanini.com.br',
                  'ian@latam.stefanini.com.mx', 'joao@wap.ind.br.exemplo.com',
                  'kim@br.stefanini.com');
  if v_qtd = 0 then
    raise notice '✓ nenhum e-mail recusado deixou profile no banco';
  else
    raise warning '✗ % profile(s) de e-mail recusado sobraram', v_qtd;
  end if;

  raise notice '=== fim do roteiro de dominios de login (ROLLBACK — nada gravado) ===';
end $$;

rollback;

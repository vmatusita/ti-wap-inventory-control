-- Migration 0139 — o vocabulário do import vira dado (F56, Frente D · Decisões 1 e 2).
--
-- ADITIVA. Uma função de normalização, quatro tabelas, um índice de expressão em
-- `filiais`, uma função de guarda com dois gatilhos, o seed exato do De→Para de hoje,
-- e o `comment on column public.eventos_admin.acao` reescrito com os três verbos
-- novos da tela de apelidos. NENHUMA função existente é recriada, NENHUM dado do
-- acervo é tocado, NENHUM valor novo entra em enum nenhum.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- Até esta migration, o vocabulário De→Para do import de startup — os 18 apelidos de
-- unidade, as 5 categorias, os 17 estados, as 12 formas de exibição e os 7 prefixos
-- de patrimônio — mora em constantes TypeScript (`src/lib/import/deparas.ts`), e a
-- identidade da filial escolhida na tela só é reconhecida se o SLUG dela for um dos
-- cinco que o código conhece de cor. Produção tem uma SEXTA filial (`filialteste`) e
-- o import dela é hoje impossível: toda linha vira `site_divergente`, culpando o
-- arquivo por um buraco do código. Esta migration é a metade de BANCO do conserto —
-- o vocabulário sai do código e vira tabela; a metade de MOTOR (o parâmetro que o
-- `deparas.ts` passa a receber) é da segunda metade da Frente D, em cima desta.
--
-- ---------------------------------------------------------------------------
-- DECISÃO 1 — quatro tabelas, tipadas, no molde da 0114 (`tipos_item`)
-- ---------------------------------------------------------------------------
-- Uma tabela genérica `dominio/termo/valor` custaria casts de enum dentro de CHECK e
-- perderia o tipo no `database.ts` gerado; quatro tabelas custam quatro entradas nos
-- catálogos da F48 (feito neste commit) — barato, e o banco ganha os invariantes que
-- hoje só um teste TypeScript garantia:
--
--   · `unidades_apelidos` — os 13 apelidos HISTÓRICOS por filial (o nome PRÓPRIO da
--     filial não entra aqui: vale sempre, sem linha — Decisão 2). Só admin escreve
--     (insere/apaga); sem UPDATE — trocar é remover e incluir, e cada metade vira uma
--     linha de trilha própria (`apelido_removido`/`apelido_incluido`).
--   · `import_termos_categoria` / `import_termos_estado` — o De→Para de Tipo e de
--     Situação/Status, com a FORMA DE EXIBIÇÃO ("Notebook", "Saída"…) na MESMA linha
--     do termo que ela normaliza — é isso que torna "rótulo volta ao próprio termo"
--     um CHECK, e não só um teste de ciclo. Só leitura pelo piso: o vocabulário de
--     Tipo e Situação não ganha tela nesta fase (decisão iii do Johnny) — muda só por
--     migration, até o onboarding (F62+).
--   · `import_prefixos_patrimonio` — os 7 prefixos oficiais, com o MESMO formato que
--     `PREFIXO_PATRIMONIO_FONTE` já usa em `src/lib/patrimonio.ts` (Decisão 5, Frente
--     B) — `'^[A-Z]{2,4}$'`, e não uma cópia independente do literal.
--
-- A CHAVE NORMALIZADA É UMA FUNÇÃO SQL NOMEADA, `public.vocabulario_chave(text)`
-- (molde `colaborador_chave`/`item_chave`), espelho EXATO de `normalizarTexto`
-- (`deparas.ts:25-39`): NFD → remove diacríticos (U+0300–U+036F) → minúsculas → tira
-- UM `:` final → colapsa a classe explícita dos 25 code points do `\s` do JavaScript
-- (medição 4 do relatório B: o `\s` do Postgres diverge em 7 pontos — 4 separadores
-- POSIX/C0, NEL e, na direção oposta, NÃO trata BOM como espaço — então usar `\s`
-- nativo do Postgres aqui reproduziria as duas divergências). Os 25 — e NÃO 24 —
-- incluem o Ogham Space Mark U+1680, que o `\s` do JS TAMBÉM trata como espaço mas
-- que a bateria de teste da medição B nunca chegou a cobrir (nenhuma das faixas que
-- ela testou passa por U+1680); a classe aqui foi reverificada nesta migration por
-- varredura completa do BMP (0..0xFFFF) contra `/\s/` do JavaScript — as duas listas
-- batem 25/25 — e provada comportamentalmente no roteiro
-- `supabase/tests/vocabulario_import.sql`. As FAIXAS SÃO MONTADAS COM `chr(<n>)`,
-- sem barra invertida nem caractere invisível no arquivo — imune a transcrição
-- (digitar um range de combining marks direto numa mensagem já corrompeu este
-- projeto uma vez) e legível pela guarda TS↔SQL
-- (`src/lib/import/vocabulario-chave-sql.test.ts`).
--
-- `lower(...)` roda sob `collate "und-x-icu"` — sem fixar a collation, `lower()`
-- depende do PROVEDOR do banco (ICU em produção/ensaio, libc no `postgres:17` do CI),
-- e um caso como `İ` (I maiúsculo turco com ponto) minusculiza diferente nos dois. A
-- collation fixa faz produção, ensaio e CI concordarem sempre no mesmo resultado.
--
-- `IMMUTABLE STRICT PARALLEL SAFE` — sem extensão nenhuma (a casa PROÍBE `unaccent`,
-- 0112/0125). `parallel safe` é decisão nova (o precedente `colaborador_chave`/
-- `item_chave` ficaram `PARALLEL UNSAFE` por omissão, não por motivo escrito — não há
-- razão para repetir a omissão aqui).
--
-- ---------------------------------------------------------------------------
-- DECISÃO 2 — o nome próprio e a ambiguidade
-- ---------------------------------------------------------------------------
-- "Nome da filial" é `filiais.nome` (o slug é identidade de URL, nunca aparece na
-- coluna Site do CSV). O nome próprio NÃO vira linha em `unidades_apelidos`: o motor
-- (segunda metade da Frente D) lê `filiais` e trata o nome como termo IMPLÍCITO —
-- renomear a filial muda o termo, sem sobra nenhuma para arrumar.
--
-- Toda filial — ATIVA ou INATIVA — é UNIDADE CONHECIDA (uma linha com o nome de uma
-- filial inativa no CSV é "outra filial", nunca aceita calada); só filial ATIVA é
-- ALVO de import — essa segunda metade é checagem de aplicação (a action já recusa
-- filial inativa antes do motor), não desta migration.
--
-- UNICIDADE sobre o conjunto (nomes de TODAS as filiais ∪ TODOS os apelidos), pela
-- chave normalizada, em TRÊS mecanismos:
--   · nome × nome  — índice único de expressão `filiais_nome_chave_uidx`;
--   · apelido × apelido — índice único em `unidades_apelidos.apelido_chave`;
--   · nome × apelido (a DIAGONAL que nenhum dos dois índices acima cobre) — a função
--     `public.vocabulario_unidades_guarda()`, com um gatilho em cada tabela. Ela toma
--     `pg_advisory_xact_lock` de uma chave FIXA antes de conferir — sem o lock, duas
--     transações concorrentes (uma cadastrando um apelido, outra renomeando uma
--     filial para a MESMA chave) passariam as duas pela checagem antes de qualquer
--     commit, e os dois índices únicos — que não cobrem a diagonal — não pegariam a
--     colisão cruzada. Ela recusa com `errcode = 'P0001'` e mensagem em pt-BR que
--     nomeia o termo e a filial dona: apelido igual ao NOME PRÓPRIO da filial dona
--     ("o nome próprio já vale"); apelido igual ao nome de OUTRA filial; renomear uma
--     filial para um termo que já é apelido de QUALQUER filial, inclusive dela mesma
--     ("remova o apelido antes"). ⚠ Apelido × apelido (mesma filial OU outra) fica DE
--     PROPÓSITO fora da guarda — é o índice único (23505) que resolve sozinho, sem
--     mensagem amigável (PLAN-F56.md, Decisão 2: "apelido × apelido: índice único").
--     Reativar uma filial NÃO passa pela guarda: ela nunca saiu do conjunto.
--
-- ---------------------------------------------------------------------------
-- ACESSO (ADR-002 · piso da 0070)
-- ---------------------------------------------------------------------------
-- As quatro tabelas: leitura pelo piso (`papel_atual() is not null` — todo logado
-- ATIVO). `unidades_apelidos`: escrita (insere/apaga) só `e_admin()` — admin OU dev.
-- As três de vocabulário administrado (categoria/estado/prefixo): NENHUMA policy de
-- escrita — mudam só por migration nesta fase. `vocabulario_chave`: sem extensão,
-- `revoke all from public, anon; grant execute to authenticated, service_role` — a
-- asserção 6a de `catalogo_secdef.sql` exige que NENHUMA função INVOKER seja
-- executável por `anon`. `vocabulario_unidades_guarda`: gatilho, não API — `revoke
-- all from public, anon, authenticated` (ninguém chama direto; o mecanismo de gatilho
-- não depende de EXECUTE concedido).
--
-- ---------------------------------------------------------------------------
-- O VERBO NOVO NA TRILHA (fato 12) — apelido_incluido / apelido_removido / usuario_criado
-- ---------------------------------------------------------------------------
-- `eventos_admin.acao` é TEXT de propósito (ação nova não deve exigir migration), mas
-- o `comment on column` é a ÚNICA cópia do vocabulário fechado que quem lê o banco
-- encontra, e `src/lib/validators/dev-destrutivo.test.ts` reprova se ele e
-- `src/lib/auditoria.ts` (`ACOES_ADMIN`) divergirem. `apelido_incluido`/
-- `apelido_removido` são os dois lados da tela de Administração › Filiais (Frente E,
-- em cima desta migration); `usuario_criado` é o smoke do import (Frente G), que cria
-- a persona `seed.admin@wap.ind.br` fora do fluxo de convite. Os TRÊS entram no
-- comentário AGORA, nesta migration, mesmo a UI/o script que os grava nascendo depois
-- — é a mesma migration que já reescreve o comentário inteiro, e não há como
-- acrescentar "por partes" (Postgres não faz append em `comment on column`).
--
-- ---------------------------------------------------------------------------
-- ORDEM DE ROLLBACK (o inverso do apply — regra 10 do §4 do CLAUDE.md)
-- ---------------------------------------------------------------------------
-- Primeiro os DOIS GATILHOS (`filiais_vocabulario_guarda`,
-- `unidades_apelidos_vocabulario_guarda`), depois a função de guarda
-- (`vocabulario_unidades_guarda`) — nada mais depende dela. Depois o índice de
-- expressão de `filiais` (`filiais_nome_chave_uidx`). Depois as QUATRO TABELAS, em
-- qualquer ordem entre si (nenhuma referencia a outra por FK, exceto
-- `unidades_apelidos.filial_id` → `filiais.id`, que sai junto com a própria tabela).
-- Só então a função `vocabulario_chave` — ela é o que a coluna GERADA de
-- `unidades_apelidos` usa, então só pode sair depois que a tabela já foi embora. Por
-- último, reemitir o `comment on column public.eventos_admin.acao` da 0137 (os 21
-- verbos de antes, sem os três desta fase). Nenhum dado do acervo é tocado em
-- nenhuma direção — é uma migration inteiramente aditiva, o rollback é lógico.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) A chave normalizada — espelho exato de normalizarTexto (deparas.ts:25-39)
-- ---------------------------------------------------------------------------
create or replace function public.vocabulario_chave(p_texto text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(
          (regexp_replace(normalize(p_texto, NFD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g'))
          collate "und-x-icu"
        ),
        ':$', ''
      ),
      '[' ||
        chr(9) || '-' || chr(13) ||     -- tab, LF, VT, FF, CR
        chr(32) ||                       -- espaço
        chr(160) ||                      -- NBSP
        chr(5760) ||                     -- Ogham Space Mark (U+1680)
        chr(8192) || '-' || chr(8202) || -- En Quad .. Hair Space
        chr(8232) || chr(8233) ||        -- Line/Paragraph Separator
        chr(8239) || chr(8287) ||        -- Narrow No-Break Space, Medium Math Space
        chr(12288) ||                    -- Ideographic Space
        chr(65279) ||                    -- BOM / Zero Width No-Break Space
      ']+',
      ' ', 'g'
    )
  );
$$;

comment on function public.vocabulario_chave(text) is
  'F56 · Frente D. Chave de normalização do vocabulário do import: NFD, remove diacríticos (U+0300-U+036F), minúsculas sob collate "und-x-icu" (fixa o resultado entre ICU e libc), tira UM `:` final, colapsa a classe explícita dos 25 code points do `\s` do JavaScript (não o `\s` nativo do Postgres, que diverge em 7 pontos — medição B da F56) e apara. Espelho exato de normalizarTexto (src/lib/import/deparas.ts) — NÃO é colaborador_chave/item_chave (essas são mais estreitas, para nome de pessoa/item; o import pode trazer BOM, NBSP e separadores exóticos de exportações antigas). Guarda TS↔SQL: src/lib/import/vocabulario-chave-sql.test.ts.';

revoke all on function public.vocabulario_chave(text) from public, anon;
grant execute on function public.vocabulario_chave(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) unidades_apelidos — os 13 apelidos HISTÓRICOS por filial
-- ---------------------------------------------------------------------------
create table public.unidades_apelidos (
  id            bigint generated always as identity primary key,
  filial_id     smallint    not null references public.filiais (id),
  apelido       text        not null,
  apelido_chave text generated always as (public.vocabulario_chave(apelido)) stored,
  created_at    timestamptz not null default now(),
  constraint unidades_apelidos_apelido_nao_vazio check (btrim(apelido) <> ''),
  constraint unidades_apelidos_apelido_tamanho check (char_length(btrim(apelido)) between 2 and 80),
  constraint unidades_apelidos_chave_nao_vazia check (btrim(apelido_chave) <> '')
);

comment on table public.unidades_apelidos is
  'Apelidos históricos da coluna Site do import de startup (F56 · Decisão 1/2), por filial. O nome PRÓPRIO da filial NÃO entra aqui — vale sempre, sem linha (Decisão 2). Só admin inclui/apaga (Administração › Filiais, Frente E); SEM UPDATE — trocar é remover e incluir, e cada metade vira uma linha de trilha própria.';
comment on column public.unidades_apelidos.apelido_chave is
  'GERADA por public.vocabulario_chave(apelido). Índice único: a diagonal apelido×nome-de-outra-filial é responsabilidade do gatilho vocabulario_unidades_guarda, não deste índice.';

create unique index unidades_apelidos_apelido_chave_uidx on public.unidades_apelidos (apelido_chave);
create index unidades_apelidos_filial_id_idx on public.unidades_apelidos (filial_id);

alter table public.unidades_apelidos enable row level security;

create policy "leitura operador" on public.unidades_apelidos
  for select to authenticated
  using ((select public.papel_atual()) is not null);

create policy "admin insere apelido" on public.unidades_apelidos
  for insert to authenticated
  with check ((select public.e_admin()));

create policy "admin apaga apelido" on public.unidades_apelidos
  for delete to authenticated
  using ((select public.e_admin()));

grant select, insert, delete on table public.unidades_apelidos to authenticated;

-- ---------------------------------------------------------------------------
-- 3) import_termos_categoria — o De→Para de Tipo (5 termos, 5 rótulos)
-- ---------------------------------------------------------------------------
create table public.import_termos_categoria (
  termo    text not null primary key,
  categoria public.categoria_ativo not null,
  rotulo   text,
  constraint import_termos_categoria_termo_normalizado check (termo = public.vocabulario_chave(termo)),
  constraint import_termos_categoria_categoria_valida check (categoria <> 'outro'),
  constraint import_termos_categoria_rotulo_volta_ao_termo check (rotulo is null or public.vocabulario_chave(rotulo) = termo)
);

comment on table public.import_termos_categoria is
  'De→Para de categoria do import de startup (F56 · Decisão 1): TERMO cru (já normalizado) da coluna Tipo → CATEGORIA do sistema. Vocabulário ADMINISTRADO — muda só por migration nesta fase (decisão iii do Johnny), sem tela; a Decisão 2 do PLAN-F56 registra o motivo. Só leitura pelo piso.';
comment on column public.import_termos_categoria.termo is
  'Já normalizado por public.vocabulario_chave — é a CHAVE de busca do CSV, não necessariamente o texto que o operador digitou.';
comment on column public.import_termos_categoria.rotulo is
  'Forma de EXIBIÇÃO ("Notebook") — o que o Select, o "Definir como" e o CSV corrigido gravam. NULL quando este termo não é o representante canônico da categoria. No máximo um termo por categoria tem rótulo não nulo (índice único parcial abaixo).';

create unique index import_termos_categoria_categoria_rotulo_uidx
  on public.import_termos_categoria (categoria) where rotulo is not null;

alter table public.import_termos_categoria enable row level security;

create policy "leitura operador" on public.import_termos_categoria
  for select to authenticated
  using ((select public.papel_atual()) is not null);

grant select on table public.import_termos_categoria to authenticated;

-- ---------------------------------------------------------------------------
-- 4) import_termos_estado — o De→Para de Situação/Status (17 termos, 7 rótulos)
-- ---------------------------------------------------------------------------
create table public.import_termos_estado (
  termo  text not null primary key,
  estado public.status_ativo not null,
  rotulo text,
  constraint import_termos_estado_termo_normalizado check (termo = public.vocabulario_chave(termo)),
  constraint import_termos_estado_estado_valido check (estado <> 'devolvido_fornecedor'),
  constraint import_termos_estado_rotulo_volta_ao_termo check (rotulo is null or public.vocabulario_chave(rotulo) = termo),
  constraint import_termos_estado_descartado_sem_rotulo check (estado <> 'descartado' or rotulo is null)
);

comment on table public.import_termos_estado is
  'De→Para de estado do import de startup (F56 · Decisão 1): TERMO cru (já normalizado) da coluna Situação/Status → ESTADO do sistema (a precedência Situação>Status é do motor, não deste catálogo). Vocabulário ADMINISTRADO, sem tela nesta fase. Só leitura pelo piso.';
comment on column public.import_termos_estado.rotulo is
  'Forma de EXIBIÇÃO ("Saída", "Validar"…) — 7 dos 17 termos têm; os outros 10 resolvem para o MESMO estado de um termo que já tem rótulo, ou (descartado) não têm forma de exibição no De→Para de propósito. No máximo um termo por estado tem rótulo não nulo.';

create unique index import_termos_estado_estado_rotulo_uidx
  on public.import_termos_estado (estado) where rotulo is not null;

alter table public.import_termos_estado enable row level security;

create policy "leitura operador" on public.import_termos_estado
  for select to authenticated
  using ((select public.papel_atual()) is not null);

grant select on table public.import_termos_estado to authenticated;

-- ---------------------------------------------------------------------------
-- 5) import_prefixos_patrimonio — os 7 prefixos oficiais
-- ---------------------------------------------------------------------------
create table public.import_prefixos_patrimonio (
  prefixo text not null primary key,
  constraint import_prefixos_patrimonio_formato check (prefixo ~ '^[A-Z]{2,4}$')
);

comment on table public.import_prefixos_patrimonio is
  'Prefixos oficiais de patrimônio reconhecidos no HOSTNAME pelo import (F56 · Decisão 1) — o mesmo formato de PREFIXO_PATRIMONIO_FONTE em src/lib/patrimonio.ts (Decisão 5, Frente B): duas letras a quatro, maiúsculas. Vocabulário ADMINISTRADO, sem tela nesta fase. Só leitura pelo piso.';

alter table public.import_prefixos_patrimonio enable row level security;

create policy "leitura operador" on public.import_prefixos_patrimonio
  for select to authenticated
  using ((select public.papel_atual()) is not null);

grant select on table public.import_prefixos_patrimonio to authenticated;

-- ---------------------------------------------------------------------------
-- 6) filiais_nome_chave_uidx — nome × nome (a primeira perna da Decisão 2)
-- ---------------------------------------------------------------------------
create unique index filiais_nome_chave_uidx on public.filiais (public.vocabulario_chave(nome));

comment on index public.filiais_nome_chave_uidx is
  'F56 · Decisão 2 — duas filiais não podem ter o mesmo nome normalizado. A diagonal nome×apelido é o gatilho vocabulario_unidades_guarda, não este índice.';

-- ---------------------------------------------------------------------------
-- 7) vocabulario_unidades_guarda — a diagonal nome × apelido (a segunda perna)
-- ---------------------------------------------------------------------------
create or replace function public.vocabulario_unidades_guarda()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_chave text;
  v_outra record;
begin
  -- Serializa renomear filial × cadastrar apelido concorrentes: os dois índices
  -- únicos acima (nome×nome, apelido×apelido) não cobrem a DIAGONAL nome×apelido —
  -- sem este lock, duas transações concorrentes passariam as duas pela checagem
  -- abaixo antes de qualquer commit, e o conjunto ficaria ambíguo mesmo assim.
  perform pg_advisory_xact_lock(hashtext('vocabulario_unidades_guarda'));

  if tg_table_name = 'unidades_apelidos' then
    -- `apelido_chave` é `generated always as (...) stored`: dentro de um gatilho
    -- BEFORE ela ainda não foi computada (doc. Postgres, ddl-generated-columns —
    -- "it is not allowed to access generated columns in BEFORE triggers"). A chave
    -- tem de vir da coluna BASE, no mesmo molde do branch `filiais` logo abaixo.
    v_chave := public.vocabulario_chave(new.apelido);

    -- o nome PRÓPRIO da filial dona: "o nome próprio já vale", apelido é redundante.
    if exists (
      select 1 from public.filiais f
       where f.id = new.filial_id and public.vocabulario_chave(f.nome) = v_chave
    ) then
      raise exception 'O termo "%" já é o próprio nome da filial — o nome próprio sempre vale na coluna Site, não precisa de apelido.', new.apelido
        using errcode = 'P0001';
    end if;

    -- o nome de QUALQUER OUTRA filial (ativa ou não — toda filial é unidade conhecida).
    select f.nome into v_outra
      from public.filiais f
     where public.vocabulario_chave(f.nome) = v_chave and f.id <> new.filial_id
     limit 1;
    if found then
      raise exception 'O termo "%" já é o nome da filial "%" — apelido não pode repetir o nome de outra filial.', new.apelido, v_outra.nome
        using errcode = 'P0001';
    end if;

    -- apelido × apelido (mesma filial ou outra) É o índice único
    -- (unidades_apelidos_apelido_chave_uidx, 23505) — de propósito FORA desta
    -- guarda (PLAN-F56.md, Decisão 2: "apelido × apelido: índice único..."). A
    -- guarda cobre só a DIAGONAL nome×apelido, que nenhum índice cobre sozinho.

  elsif tg_table_name = 'filiais' then
    if tg_op = 'UPDATE' and public.vocabulario_chave(old.nome) = public.vocabulario_chave(new.nome) then
      return new; -- a chave não mudou (só caixa/acento) — nada a conferir.
    end if;
    v_chave := public.vocabulario_chave(new.nome);

    select ua.apelido, ua.filial_id into v_outra
      from public.unidades_apelidos ua
     where ua.apelido_chave = v_chave
     limit 1;
    if found then
      if v_outra.filial_id = new.id then
        raise exception 'O nome "%" já é apelido desta própria filial — remova o apelido antes de usá-lo como nome.', new.nome
          using errcode = 'P0001';
      else
        raise exception 'O nome "%" já é apelido de outra filial — escolha outro nome.', new.nome
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.vocabulario_unidades_guarda() is
  'F56 · Decisão 2 — a diagonal nome×apelido que os índices únicos não cobrem. Gatilho, não API: revoke all na função abaixo. Serializa com pg_advisory_xact_lock antes de conferir.';

revoke all on function public.vocabulario_unidades_guarda() from public, anon, authenticated;

create trigger filiais_vocabulario_guarda
  before insert or update of nome on public.filiais
  for each row execute function public.vocabulario_unidades_guarda();

create trigger unidades_apelidos_vocabulario_guarda
  before insert or update on public.unidades_apelidos
  for each row execute function public.vocabulario_unidades_guarda();

-- ---------------------------------------------------------------------------
-- 8) O SEED — exatamente o que deparas.ts tem hoje (fato 7 da ordem F56)
-- ---------------------------------------------------------------------------

-- 13 apelidos por SLUG (a 0007/0026 criam as cinco filiais; o slug é o que foi feito
-- para ser estável entre produção, ensaio e CI). Os 18 apelidos históricos de
-- deparas.ts são estes 13 MAIS os 5 nomes próprios, que não viram linha (Decisão 2).
insert into public.unidades_apelidos (filial_id, apelido)
select f.id, v.apelido
  from (values
    ('matriz',          'matriz sao marcos'),
    ('cd-afonso-pena',  'cd-afp'),
    ('cd-afonso-pena',  'cd afp'),
    ('cd-afonso-pena',  'cd-pena'),
    ('cd-afonso-pena',  'cd pena'),
    ('cd-afonso-pena',  'cd-afonso pena'),  -- COM hífen — o nome PRÓPRIO não tem
    ('cd-afonso-pena',  'cd-afonsopena'),
    ('cd-afonso-pena',  'afonso pena'),
    ('eusebio',         'filial-ce'),
    ('eusebio',         'filial ce'),
    ('serra',           'serra park'),
    ('linhares',        'filial - linhares'),
    ('linhares',        'filial linhares')
  ) as v(slug, apelido)
  join public.filiais f on f.slug = v.slug;

-- 5 categorias — termo cru = enum (o CSV usa os mesmos nomes das categorias).
insert into public.import_termos_categoria (termo, categoria, rotulo) values
  ('notebook', 'notebook', 'Notebook'),
  ('desktop',  'desktop',  'Desktop'),
  ('monitor',  'monitor',  'Monitor'),
  ('celular',  'celular',  'Celular'),
  ('tablet',   'tablet',   'Tablet');

-- 17 estados, 7 com rótulo (a forma de exibição mora na linha do termo que ela
-- normaliza — deparas.ts SITUACAO_CANONICA/ESTADOS).
insert into public.import_termos_estado (termo, estado, rotulo) values
  ('saida',      'em_uso',        'Saída'),
  ('remanejo',   'em_uso',        null),
  ('guardada',   'em_estoque',    null),
  ('estoque',    'em_estoque',    'Estoque'),
  ('reservada',  'reservado',     null),
  ('reservado',  'reservado',     'Reservado'),
  ('emprestimo', 'emprestado',    'Empréstimo'),
  ('validar',    'em_triagem',    'Validar'),
  ('devolvido',  'em_triagem',    null),
  ('devolucao',  'em_triagem',    null),
  ('manutencao', 'em_manutencao', 'Manutenção'),
  ('rt wap',     'defasado',      null),
  ('posse wap',  'defasado',      null),
  ('defasada',   'defasado',      null),
  ('defasado',   'defasado',      'Defasado'),
  ('descarte',   'descartado',    null),
  ('descartado', 'descartado',    null);

-- 7 prefixos.
insert into public.import_prefixos_patrimonio (prefixo) values
  ('WAP'), ('PRO'), ('LEA'), ('TEC'), ('STF'), ('PAT'), ('NOO');

-- O QUE CONFERE A CONTAGEM: um slug ausente (filial que não existe neste banco) não
-- pode semear menos apelidos em silêncio — o JOIN acima simplesmente descartaria a
-- linha, e sem esta conferência ninguém notaria até um operador digitar o apelido e
-- o import continuar recusando.
do $$
declare
  v_apelidos   int;
  v_categorias int;
  v_estados    int;
  v_prefixos   int;
  v_rotulos    int;
begin
  select count(*) into v_apelidos   from public.unidades_apelidos;
  select count(*) into v_categorias from public.import_termos_categoria;
  select count(*) into v_estados    from public.import_termos_estado;
  select count(*) into v_prefixos   from public.import_prefixos_patrimonio;
  select count(*) into v_rotulos from (
    select rotulo from public.import_termos_categoria where rotulo is not null
    union all
    select rotulo from public.import_termos_estado where rotulo is not null
  ) r;

  if v_apelidos <> 13 then
    raise exception 'seed do vocabulário do import: esperava 13 apelidos, achou % — um slug de filial está ausente deste banco?', v_apelidos;
  end if;
  if v_categorias <> 5 then
    raise exception 'seed do vocabulário do import: esperava 5 categorias, achou %', v_categorias;
  end if;
  if v_estados <> 17 then
    raise exception 'seed do vocabulário do import: esperava 17 estados, achou %', v_estados;
  end if;
  if v_prefixos <> 7 then
    raise exception 'seed do vocabulário do import: esperava 7 prefixos, achou %', v_prefixos;
  end if;
  if v_rotulos <> 12 then
    raise exception 'seed do vocabulário do import: esperava 12 formas de exibição (5 categoria + 7 estado), achou %', v_rotulos;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) O verbo novo na trilha (fato 12) — comment on column REESCRITO POR INTEIRO
-- ---------------------------------------------------------------------------
-- Postgres não faz "append" em comment — a lista abaixo é os 21 verbos vigentes da
-- 0137, na MESMA ordem, MAIS os três desta fase no fim.
comment on column public.eventos_admin.acao is
  'F56 (era F54/F24/F23/F22/F21): o que aconteceu. TEXT e não enum de propósito — ação nova não deve exigir migration. Vocabulário fechado, espelhado em src/lib/auditoria.ts (ACOES_ADMIN/ACAO_ROTULO): convite_gerado, convite_reenviado, papel_alterado, vinculos_alterados, usuario_desativado, usuario_reativado, email_alterado, usuario_apagado, sessoes_encerradas, senha_criada, senha_revogada, senha_reativada, import_executado, import_falhou, ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado, conflito_filiais_resolvido, apelido_incluido, apelido_removido, usuario_criado. Os três da F22 (email_alterado, usuario_apagado, sessoes_encerradas) e os SETE da F23 (ativo_apagado, movimentacao_apagada, item_apagado, acervo_resetado, itens_resetados, estado_forcado, saldo_forcado) são privativos do cargo dev. O da F24 (conflito_filiais_resolvido) é do NÍVEL ADMINISTRADOR (admin ou dev) — é a única exclusão de ativo fora da Zona destrutiva, e alcança exclusivamente ativo que esteja num grupo de conflito entre filiais. O da F54 (import_falhou) é gravado pela Server Action, e não por RPC: ele registra a tentativa de import que a RPC recusou e o descarte do backup que já havia subido. Os DOIS da F56 (apelido_incluido, apelido_removido) são gravados pela Server Action da tela Administração › Filiais, do NÍVEL ADMINISTRADOR, a cada apelido de unidade incluído ou removido do vocabulário do import (migration 0139) — trocar um apelido é remover e incluir, e cada metade vira sua própria linha de trilha. O TERCEIRO da F56 (usuario_criado) é gravado pelo smoke do import (scripts/smoke/), que cria a persona fictícia seed.admin@wap.ind.br fora do fluxo de convite (auth.admin.createUser direto) — sem convite_gerado que preceda o cadastro dela. Os sete da F23 e o da F24 são gravados DENTRO das próprias RPCs, na mesma transação da operação — se a trilha falhar, a exclusão não acontece. Mexeu aqui, mexa lá — e vice-versa.';

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select proname, provolatile, proparallel from pg_proc where proname = 'vocabulario_chave';
--   -- esperado: provolatile='i', proparallel='s'
--   select public.vocabulario_chave('  CD Afonso Pena:  ');   -- 'cd afonso pena:' (o ':' não é o último caractere ANTES de aparar — ver o cabeçalho)
--   select public.vocabulario_chave('Eusébio');               -- 'eusebio'
--   select count(*) from public.unidades_apelidos;            -- 13
--   select count(*) from public.import_termos_categoria;      -- 5
--   select count(*) from public.import_termos_estado;         -- 17
--   select count(*) from public.import_prefixos_patrimonio;   -- 7
--   select count(*) filter (where rotulo is not null) from public.import_termos_categoria;  -- 5
--   select count(*) filter (where rotulo is not null) from public.import_termos_estado;     -- 7
--   select relrowsecurity from pg_class
--    where oid = any (array['public.unidades_apelidos','public.import_termos_categoria',
--                            'public.import_termos_estado','public.import_prefixos_patrimonio']::regclass[]);
--   -- esperado: true nas 4
--   select indexrelid::regclass from pg_index where indrelid = 'public.filiais'::regclass and indisunique;
--   -- esperado: inclui filiais_nome_chave_uidx
--   -- a ambiguidade cruzada (rode e desfaça — não faz parte do smoke read-only acima):
--   --   insert into public.unidades_apelidos (filial_id, apelido)
--   --     select id, nome from public.filiais where slug = 'matriz';  -- deve levantar P0001

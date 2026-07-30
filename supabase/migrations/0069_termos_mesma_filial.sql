-- Migration 0069 — F21: o TERMO (a linha E o .docx) também é matéria de FILIAL.
--
-- Contexto: TERCEIRA volta da revisão adversarial da F21. A `0067` fechou `movimentacoes`, a
-- `0068` fechou `lancamentos_item` — esta é a MESMA classe de furo na terceira tabela, e a
-- pior das três: aqui o dano é DESTRUTIVO e irreversível. O .docx sai do bucket e não volta.
--
-- ===========================================================================
-- O FURO
-- ===========================================================================
-- A `0063` gateou `termos_gerados` pelo CARGO e só pelo cargo, com a justificativa escrita no
-- corpo dela: "sem filial própria (guarda `ativo_ids[]`/`movimentacao_ids[]`, e um termo de
-- lote pode cruzar filiais), então o predicado é o cargo. O recorte por filial deste fluxo
-- vive na action". A `0066` copiou o mesmo predicado para as 3 policies de ESCRITA do bucket
-- `termos`, "para o par tabela+arquivo não poder divergir". O par não divergiu: os dois
-- ficaram igualmente abertos.
--
-- "Vive na action" é justamente o que o CLAUDE.md proíbe como ÚNICA linha — e aqui a action
-- não é atravessada: `authenticated` tem privilégio de TABELA (SELECT/INSERT/UPDATE/DELETE) em
-- `termos_gerados` e em `storage.objects` (default do Supabase hospedado; nenhuma migration o
-- revoga), a anon key está no bundle do navegador e o operador conhece a própria senha.
-- `curl` basta.
--
-- EXPLOIT (operador vinculado só à filial 1; vítima = termo de um ativo da filial 5, cujo uuid
-- e cujo `arquivo_path` são legíveis porque o SELECT é aberto a todo logado — ADR-001):
--   1. DELETE /rest/v1/termos_gerados?id=eq.<termo da f5>   → 204, linha apagada
--   2. DELETE /storage/v1/object/termos/<id da f5>.docx     → 200, .docx DESTRUÍDO
--   O ativo da f5 continua com `termo_assinado = 'sim'` (a coluna mora em `ativos` e ninguém a
--   tocou), a ficha perde o histórico e o documento assinado simplesmente não existe mais.
--   Nada no sistema sabe que houve perda.
-- Variantes da mesma abertura:
--   · PATCH em `dados`/`colaborador`/`arquivo_path` da linha da f5 — reescrever o termo alheio;
--   · upload com `x-upsert: true` em `<id da f5>.docx` — trocar o CONTEÚDO do assinado;
--   · INSERT citando as `movimentacao_ids` da f5 e declarando `ativo_ids` próprios: a chave
--     única `(tipo, movimentacao_ids)` é QUEIMADA e a f5 nunca mais gera aquele termo
--     (`persistirTermo` acha a linha do atacante e o UPDATE dela é recusado para sempre).
--     É o dano da `0068` — vaga queimada —, aqui em documento.
--
-- POR QUE NÃO DÁ PARA COPIAR A 0067. Lá a correção foi gratuita porque `aplicar_movimentacao`
-- preenche `snapshot_anterior` a partir do banco, sob lock, ANTES da WITH CHECK: havia um dado
-- confiável na própria linha. `termos_gerados` NÃO TEM TRIGGER NENHUM (conferido em
-- `pg_trigger`: zero não-internos), logo toda coluna é payload do cliente. O dado confiável
-- tem de ser BUSCADO pelo predicado.
--
-- ===========================================================================
-- A CORREÇÃO — três predicados que se sustentam um no outro
-- ===========================================================================
-- (A) `pode_escrever_termo(ativo_ids)` — a filial de cada ativo, LIDA de `public.ativos` numa
--     função `security definer`, e não declarada pelo cliente. Espelha exatamente o que a
--     action já exige (`exigirEscritaEm` sobre a filial CORRENTE dos ativos —
--     src/lib/actions/termos.ts:418-424), então banco e mensagem concordam por construção,
--     como manda o §4 da ordem F21.
--
-- (B) `termo_ancora_coerente(movimentacao_ids, ativo_ids)` — `ativo_ids` tem de ser EXATAMENTE
--     o conjunto de `movimentacoes.ativo_id` das movimentações citadas. Sem (B), (A) é parede
--     de papel no INSERT: o atacante declara os ativos DELE e passa, queimando a vaga da outra
--     filial. Com (B), `ativo_ids` deixa de ser forjável — e como `movimentacoes` é IMUTÁVEL
--     (insert-only desde a `0005`, sem policy de update/delete), o conjunto derivado é estável
--     para sempre: o que é coerente no INSERT segue coerente no UPDATE de regeneração.
--
-- (C) `arquivo_path = id::text || '.docx'` — o invariante que a action SEMPRE cumpre
--     (`arquivoPath = ${id}.docx`, termos.ts:322, nos dois ramos: id novo do `randomUUID()` e
--     id reaproveitado da linha existente, e o `id` vai explícito no payload). Sem ele um
--     operador aponta a PRÓPRIA linha para o `.docx` da f5 e, pelo `bool_and` de (D), passa a
--     BLOQUEAR a regeneração legítima da f5 — um DoS de brinde ao fechar o furo. Com ele, cada
--     nome de arquivo é referenciado por no máximo uma linha.
--     ⚠ CONSEQUÊNCIA PARA CÓDIGO NOVO: quem inserir em `termos_gerados` tem de MANDAR o `id` e
--     derivar o path DELE. Deixar o default `gen_random_uuid()` gerar o id e mandar um path
--     qualquer passa a ser recusado.
--
-- (D) Storage: `pode_escrever_arquivo_termo(name)` = `bool_and` de (A) sobre as linhas que
--     apontam aquele nome, com `coalesce(..., true)` para nome que NENHUMA linha referencia.
--     A ORDEM DO `persistirTermo` OBRIGA a esse desenho — conferida linha a linha
--     (src/lib/actions/termos.ts:313-366): consulta órfãos → `storage.remove(órfãos)` →
--     `delete` das linhas órfãs → `upload(arquivoPath)` → SÓ DEPOIS insert/update da linha.
--     Para termo NOVO o objeto nasce ANTES da linha; uma policy que exigisse linha
--     correspondente quebraria TODA geração de termo. O fallback preserva quatro fluxos:
--       · upload do termo novo (nome ainda sem linha) — asserção 2i-ter;
--       · remoção do órfão (a linha órfã ainda EXISTE nesse instante — só é apagada na linha
--         seguinte; e se um dia essa ordem inverter, o fallback cobre também);
--       · o rollback `remove([arquivoPath])` do insert falho (nunca houve linha);
--       · o `remove(arquivos)` do import (a RPC já apagou as linhas).
--     E não abre nada: para destruir o `.docx` da f5, o nome ESTÁ referenciado pela linha da f5.
--     `bool_and` e não `bool_or`: se duas linhas apontarem o mesmo nome, a mais restritiva
--     manda (com (C) isso não deve mais acontecer, mas o predicado não depende disso).
--
-- (E) A conjunção de CARGO da `0066` FICA nas 3 policies de storage: com o fallback de (D), é
--     ela que continua barrando o cargo `consulta` de subir/apagar arquivo solto no bucket
--     (asserção 6a). Nas 3 da TABELA ela SAI, porque (A) já a contém — `pode_escrever_filial`
--     devolve false para consulta, desativado e sem perfil. Mesmo idioma de `ativos` na `0063`,
--     que não repete cargo ao lado do vínculo.
--
-- ===========================================================================
-- DECISÃO — QUEM ALCANÇA A LINHA DEGENERADA (corrigido na revisão adversarial)
-- ===========================================================================
-- `e_admin()` é a PRIMEIRA condição de (A), FORA do `and` com a exigência de array não-vazio.
-- A primeira escrita deste arquivo tinha
--     coalesce(array_length(p_ativo_ids,1),0) > 0 and (e_admin() or not exists (...))
-- e três refutadores independentes mostraram o mesmo defeito: para `ativo_ids = '{}'` isso é
-- `false and (...)` = FALSE para TODO MUNDO, admin incluído — nas 3 policies da tabela E no
-- predicado de storage (`bool_and(false)`). A linha virava lixo IMORTAL (nem UPDATE nem DELETE
-- por sessão nenhuma) e o `.docx` dela, indestrutível E insobrescrevível; e como
-- `persistirTermo` acha a linha por igualdade de CONJUNTO de `movimentacao_ids` e reaproveita o
-- id dela, a vaga `(tipo, movimentacao_ids)` ficava queimada PARA SEMPRE — exatamente o dano
-- que esta migration existe para fechar, criado por ela. O estado é representável hoje: não há
-- CHECK sobre `ativo_ids` (medido) e a with_check vigente é só cargo, então qualquer operador
-- insere `ativo_ids: []` por curl. É o resíduo que um atacante deixaria.
--   · não-admin com `{}` → RECUSADO (array vazio ⇒ nenhuma filial ⇒ fecha), como antes;
--   · admin → alcança a linha para LIMPAR (DELETE pela USING). É a válvula que esta decisão
--     promete, e agora ela existe de verdade;
--   · ninguém CRIA `{}`: a exigência de array não-vazio foi para as duas WITH CHECK, onde é
--     ela que barra a linha de fantasia (e é preciso: `termo_ancora_coerente('{}','{}')` é
--     TRUE — dois conjuntos vazios são iguais).
--   · Nota honesta: o admin pode APAGAR a linha degenerada; UPDATE dela exige trazê-la a um
--     estado válido (não-vazia, coerente e com o path canônico). Para lixo, apagar é o certo.
--
-- ATIVO QUE NÃO EXISTE MAIS: falha FECHADA para não-admin, admin alcança. Motivos: (1) ativo
-- morto é âncora de filial perdida — abrir aí seria publicar a receita ("perca o ativo e o
-- termo fica de todos"); (2) é o idioma da fase (`pode_escrever_filial(NULL)` = false,
-- `papel_atual()` NULL = fecha); (3) não existe fluxo legítimo que precise — o único caminho
-- que apaga `ativos` é a RPC `importar_ativos_substituir`, que na MESMA transação apaga as
-- movimentações e os termos puros da filial (`0064`, passo 3) e ANTES recusa o import se houver
-- termo misturando filiais (passo 2); nenhuma sessão apaga ativo (a `0063` deliberadamente não
-- recriou policy de DELETE em `ativos`).
--
-- ===========================================================================
-- O QUE FOI CONFERIDO (leitura de código + catálogo do ENSAIO, só SELECT)
-- ===========================================================================
--   · a ordem do `persistirTermo` (objeto antes da linha) — o item que decidiu (D);
--   · ZERO triggers não-internos em `termos_gerados` → nenhuma coluna é derivada no servidor;
--   · `ativo_ids` da action é sempre o conjunto derivado das movimentações (termos.ts:404-409),
--     nunca o que o cliente manda → (B) é verdade por construção no único escritor do app;
--   · `importar_ativos_substituir` é `prosecdef = true`: o `delete from termos_gerados` dela
--     passa POR FORA de toda policy — o import não é afetado (o que o autoriza é a guarda
--     interna `e_admin()` da `0064`);
--   · `aplicarFlagTermo` (termos.ts:375-387) escreve em `ativos`, não aqui: quem a autoriza é
--     "operador atualiza" de `ativos` (`0063`), e `gerarTermo` já exigiu escrita nas mesmas
--     filiais antes;
--   · a UI já não oferece nada disso entre filiais (a ficha resolve `podeEscreverNaFilial` e
--     passa `podeEscrever` a `termos-da-ficha.tsx`);
--   · `scripts/reset.ts` e `scripts/import/*` usam SERVICE ROLE → RLS não se aplica.
--     ⚠ CORREÇÃO de um item que o desenho original liberou por raciocínio errado:
--     `scripts/smoke/smoke-prod.mjs` NÃO é service role — é anon key + `signInWithPassword`
--     (:76-77 e :952-957), ou seja SESSÃO sujeita a RLS. O que o livra aqui é ser
--     SÓ-LEITURA de `termos_gerados` (contagem, :617-625) e não tocar Storage. É assim que
--     tem de ficar escrito; e é assim que tem de continuar.
--
-- ⚠ O QUE **NÃO** FOI PROVADO EMPIRICAMENTE (ao contrário da 0067/0068): o exploit não foi
--   reproduzido — a revisão foi READ-ONLY e `termos_gerados` tem ZERO linhas no ensaio (medido),
--   então nem havia vítima sem plantar fixture. A prova é o roteiro
--   `supabase/tests/papeis_rls.sql` (asserções 2i-bis*, 2i-ter*, 5h e 5i — ataque e legítimo em
--   par): rode ANTES do apply (os 2i-bis devem FALHAR, provando o furo aberto) e DEPOIS (todas
--   verdes). Esse antes/depois é o que fecha o critério 2 da ordem ("recusado no banco").
--
-- ⚠ CONFERIR EM PRODUÇÃO ANTES DO APPLY (só leitura). Nenhum contador impede o apply — a
--   migration é aditiva e as USING não exigem coerência —, mas cada um muda QUEM alcança
--   aquelas linhas; e o último é o único que diz se a metade de STORAGE é no-op para alguém:
--
--     with base as (
--       select t.id, t.arquivo_path, t.ativo_ids, t.movimentacao_ids,
--              (select count(*) from unnest(t.ativo_ids) aid) as n_ids,
--              (select count(*) from unnest(t.ativo_ids) aid
--                 join public.ativos a on a.id = aid) as n_vivos,
--              (select coalesce(array_agg(distinct m.ativo_id), '{}'::uuid[])
--                 from public.movimentacoes m where m.id = any (t.movimentacao_ids)) as der
--         from public.termos_gerados t)
--     select count(*) as total,
--            count(*) filter (where arquivo_path <> id::text || '.docx') as path_fora_do_padrao,
--            count(*) filter (where n_vivos < n_ids)                     as com_ativo_morto,
--            count(*) filter (where n_ids = 0)                           as ativo_ids_vazio,
--            count(*) filter (where exists (select x from unnest(ativo_ids) x
--                                            except select y from unnest(der) y)
--                                or exists (select y from unnest(der) y
--                                            except select x from unnest(ativo_ids) x))
--                                                                        as incoerente
--       from base;
--
--     -- ⚠ ESTA É A QUE FALTAVA (achado da revisão): a metade de storage casa
--     -- `termos_gerados.arquivo_path` com `storage.objects.name` por IGUALDADE DE STRING, e
--     -- essa igualdade não é garantida por nada no banco — só pelo código. Se `path_sem_objeto`
--     -- > 0, o nome daquela linha é "não referenciado" pelo lado de storage, o fallback é TRUE
--     -- e o DELETE do .docx dela CONTINUA ABERTO — com todas as verificações pós-apply verdes.
--     select count(*) filter (where o.name is null)     as path_sem_objeto,
--            count(*) filter (where o.name is not null) as path_casa_objeto
--       from public.termos_gerados t
--       left join storage.objects o
--              on o.bucket_id = 'termos' and o.name = t.arquivo_path;
--     select count(*) as objetos_nao_referenciados
--       from storage.objects o
--      where o.bucket_id = 'termos'
--        and not exists (select 1 from public.termos_gerados t
--                         where t.arquivo_path = o.name);
--
--   · `path_fora_do_padrao` > 0 → linha antiga que só volta ao padrão na próxima regeneração;
--   · `com_ativo_morto` / `ativo_ids_vazio` / `incoerente` > 0 → linha que passa a ser matéria
--     de admin (a USING de UPDATE avalia o `ativo_ids` ANTIGO, não o novo);
--   · `path_sem_objeto` > 0 → NORMALIZE o path (ou renomeie o objeto) antes de confiar na
--     metade de storage para aquelas linhas.
--
-- ⚠ ADVISOR: as 3 funções novas são `security definer` com `execute` para `authenticated` —
--   inerente ao desenho (a expressão de policy roda com os privilégios do consultante). O lint
--   `authenticated_security_definer_function_executable` passa a apontar 3 funções A MAIS.
--   Precedente aceito e registrado na `0062` (as três da fase) e na `0068`
--   (`estorno_item_coerente`); as três novas respondem só sobre o próprio chamador.
--
-- ADITIVA em dado: 3 funções, 1 índice, 6 `alter policy`. NENHUM `delete from`, nenhuma linha e
-- nenhum objeto de Storage tocado. Não bate no gate do modo automático → caminho A do
-- docs/RUNBOOK-BANCO.md (ENSAIO primeiro, produção depois).
--
-- REVERSÃO:
--   alter policy "operador insere" on public.termos_gerados
--     with check ((select public.papel_atual()) in ('admin', 'operador'));
--   alter policy "operador atualiza" on public.termos_gerados
--     using      ((select public.papel_atual()) in ('admin', 'operador'))
--     with check ((select public.papel_atual()) in ('admin', 'operador'));
--   alter policy "operador apaga" on public.termos_gerados
--     using ((select public.papel_atual()) in ('admin', 'operador'));
--   alter policy "termos insere operador" on storage.objects
--     with check (bucket_id = 'termos' and (select public.papel_atual()) in ('admin','operador'));
--   alter policy "termos atualiza operador" on storage.objects
--     using      (bucket_id = 'termos' and (select public.papel_atual()) in ('admin','operador'))
--     with check (bucket_id = 'termos' and (select public.papel_atual()) in ('admin','operador'));
--   alter policy "termos apaga operador" on storage.objects
--     using (bucket_id = 'termos' and (select public.papel_atual()) in ('admin','operador'));
--   drop index public.termos_gerados_arquivo_path_idx;
--   drop function public.pode_escrever_arquivo_termo(text);
--   drop function public.termo_ancora_coerente(uuid[], uuid[]);
--   drop function public.pode_escrever_termo(uuid[]);
--   (reabre o furo — só faz sentido junto de um rollback completo da F21.)

-- ---------------------------------------------------------------------------
-- 1) pode_escrever_termo(ativo_ids) — a filial de TODOS os ativos do termo
-- ---------------------------------------------------------------------------
-- `security definer` pelo motivo da 0062: a expressão de policy roda com os privilégios de
-- quem consulta, e a leitura de `ativos` aqui dentro não deve depender da RLS de `ativos`
-- (hoje aberta a logado ativo; se um dia fechar mais, toda escrita de termo morreria calada).
-- Parâmetro NOMEADO em vez de `exists` inline pelo motivo descoberto na 0068: dentro de um
-- subselect a referência nua a uma coluna resolve para o alias da subconsulta, e o predicado
-- passa a recusar o fluxo legítimo. Com parâmetro não há escopo ambíguo possível.
create or replace function public.pode_escrever_termo(p_ativo_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- ⚠ A ORDEM DESTA DISJUNÇÃO É A CORREÇÃO. `e_admin()` PRIMEIRO, e a exigência de array
  -- não-vazio DENTRO do ramo não-admin: senão `ativo_ids = '{}'` trancava a linha para todo
  -- mundo, admin incluído, e o lixo virava imortal (ver a DECISÃO no cabeçalho).
  -- Quem barra a CRIAÇÃO de linha sem ativo é a with_check das policies, não esta função.
  select public.e_admin()
      or (
        coalesce(array_length(p_ativo_ids, 1), 0) > 0
        and not exists (
          select 1
            from unnest(p_ativo_ids) aid
            left join public.ativos a on a.id = aid
           where a.id is null                                   -- ativo inexistente → fecha
              or not public.pode_escrever_filial(a.filial_id)    -- filial fora do vínculo → fecha
        )
      )
$$;

comment on function public.pode_escrever_termo(uuid[]) is
  'F21/0069: true se o usuário logado pode ESCREVER em todas as filiais dos ativos deste termo. admin → sempre (inclusive na linha legada de ativo_ids vazio ou com ativo apagado, para poder LIMPAR); operador → só se TODO ativo estiver em filial vinculada e o array não for vazio; consulta/desativado/sem perfil → nunca. Espelha o `exigirEscritaEm` de gerarTermo (src/lib/actions/termos.ts). A proibição de CRIAR termo sem ativo mora nas with_check das policies, não aqui.';

revoke all on function public.pode_escrever_termo(uuid[]) from public, anon;
grant execute on function public.pode_escrever_termo(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) termo_ancora_coerente(movimentacao_ids, ativo_ids) — `ativo_ids` não se inventa
-- ---------------------------------------------------------------------------
-- Igualdade de CONJUNTOS (dois `except`), não de arrays: a action ordena e deduplica, mas o
-- predicado não deve depender de ordem nem de repetição. `movimentacoes` é imutável, então o
-- conjunto derivado nunca muda depois — o que é coerente no INSERT segue coerente no UPDATE.
-- SEM bypass de admin: a coerência é verdade, não privilégio. E por isso ela entra SÓ nas
-- with_check (escrita nova), NUNCA nas USING — linha legada incoerente precisa continuar
-- APAGÁVEL pelo admin.
create or replace function public.termo_ancora_coerente(
  p_movimentacao_ids uuid[],
  p_ativo_ids        uuid[]
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
           select m.ativo_id from public.movimentacoes m
            where m.id = any (p_movimentacao_ids)
           except
           select aid from unnest(p_ativo_ids) aid
         )
     and not exists (
           select aid from unnest(p_ativo_ids) aid
           except
           select m.ativo_id from public.movimentacoes m
            where m.id = any (p_movimentacao_ids)
         )
$$;

comment on function public.termo_ancora_coerente(uuid[], uuid[]) is
  'F21/0069: true se `ativo_ids` é EXATAMENTE o conjunto de `movimentacoes.ativo_id` das movimentações do termo. Torna `ativo_ids` não-forjável (é sobre ele que a autorização por filial decide) e ancora a vaga da chave única (tipo, movimentacao_ids) na filial real, fechando o "queimar a vaga" que impediria a outra filial de gerar o termo dela. ⚠ true também para dois conjuntos VAZIOS — por isso as with_check exigem array não-vazio à parte.';

revoke all on function public.termo_ancora_coerente(uuid[], uuid[]) from public, anon;
grant execute on function public.termo_ancora_coerente(uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) pode_escrever_arquivo_termo(name) — o .docx segue a filial da linha dele
-- ---------------------------------------------------------------------------
-- `coalesce(..., true)` é o coração do desenho: nome que NENHUMA linha referencia é livre para
-- admin/operador (o CARGO é exigido na policy, não aqui). É o que permite o upload do termo
-- NOVO, cujo objeto nasce ANTES da linha (termos.ts:333 antes de :355).
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

revoke all on function public.pode_escrever_arquivo_termo(text) from public, anon;
grant execute on function public.pode_escrever_arquivo_termo(text) to authenticated;

-- Índice: o predicado de storage passa a filtrar `termos_gerados` por `arquivo_path` em TODA
-- escrita no bucket. A tabela é pequena, mas o índice é barato e evita seq scan por
-- upload/remove. `if not exists` para ser idempotente numa reaplicação.
create index if not exists termos_gerados_arquivo_path_idx
  on public.termos_gerados (arquivo_path);

-- ---------------------------------------------------------------------------
-- 4) termos_gerados — filial (USING + WITH CHECK) + coerência e invariantes (só WITH CHECK)
-- ---------------------------------------------------------------------------
-- USING gate a linha ANTIGA (é o que barra apagar/reescrever termo alheio) e WITH CHECK a NOVA
-- (é o que barra criar termo em nome de filial alheia, mentir a âncora e forjar o path). A
-- conjunção de cargo da 0063 sai: `pode_escrever_termo` já recusa consulta/desativado.
alter policy "operador insere" on public.termos_gerados
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
  );

alter policy "operador atualiza" on public.termos_gerados
  using (
    public.pode_escrever_termo(ativo_ids)
  )
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
  );

-- DELETE: só a filial (USING). NÃO se exige coerência nem array não-vazio aqui, de propósito —
-- é este verbo que devolve ao admin a linha legada degenerada (asserções 5h e 5i).
alter policy "operador apaga" on public.termos_gerados
  using (
    public.pode_escrever_termo(ativo_ids)
  );

-- ---------------------------------------------------------------------------
-- 5) storage.objects (bucket `termos`) — o arquivo segue a filial da linha
-- ---------------------------------------------------------------------------
-- A policy de SELECT do bucket NÃO é tocada aqui: a leitura é assunto da 0070 (piso = perfil
-- ATIVO), e o recorte por FILIAL na leitura continua fora de escopo (ADR-001 + 0066: o cargo
-- `consulta` precisa baixar o termo). O que esta seção fecha é a ESCRITA.
-- `bucket_id` continua nos DOIS lados do UPDATE (0066): senão daria para mover o objeto para
-- outro bucket e escapar pelo lado que não checa.
--
-- O INSERT também é gateado — não por causa do objeto novo (esse é livre, ver a função), mas
-- por um caso estreito e real: termo da f5 cuja LINHA existe e cujo ARQUIVO não (upload
-- interrompido). Sem este predicado, um operador de outra filial PREENCHERIA aquele path com um
-- .docx de conteúdo arbitrário, e a ficha da f5 passaria a servir o documento dele. O upload
-- legítimo do termo novo continua passando: naquele instante nenhuma linha aponta o nome.
alter policy "termos insere operador" on storage.objects
  with check (
    bucket_id = 'termos'
    and (select public.papel_atual()) in ('admin', 'operador')
    and public.pode_escrever_arquivo_termo(name)
  );

alter policy "termos atualiza operador" on storage.objects
  using (
    bucket_id = 'termos'
    and (select public.papel_atual()) in ('admin', 'operador')
    and public.pode_escrever_arquivo_termo(name)
  )
  with check (
    bucket_id = 'termos'
    and (select public.papel_atual()) in ('admin', 'operador')
    and public.pode_escrever_arquivo_termo(name)
  );

-- DELETE: é ESTE o verbo do exploit (o .docx destruído). Continua permitindo a remoção do
-- órfão do `persistirTermo` — nesse instante a linha órfã ainda existe e é do próprio
-- operador — e a remoção do que nenhuma linha referencia (rollback do insert falho, arquivos
-- que o import acabou de desvincular).
alter policy "termos apaga operador" on storage.objects
  using (
    bucket_id = 'termos'
    and (select public.papel_atual()) in ('admin', 'operador')
    and public.pode_escrever_arquivo_termo(name)
  );

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) as três funções: uma assinatura cada, definer, stable, grants certos
--   select p.oid::regprocedure::text as assinatura, p.prosecdef as definer, p.provolatile as vol,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('pode_escrever_termo','termo_ancora_coerente','pode_escrever_arquivo_termo')
--    order by p.proname;
--   -- esperado: 3 linhas · definer = true · vol = 's' · anon = false · auth = true
--
--   -- 2) A CORREÇÃO DO `e_admin()` FOI APLICADA? (a prova direta, não por leitura do arquivo)
--   begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub', (select id from public.profiles where papel='admin' and ativo limit 1),
--                         'role','authenticated')::text, true);
--     select public.pode_escrever_termo('{}'::uuid[]) as admin_alcanca_linha_vazia;
--   rollback;
--   -- esperado: true. Se vier FALSE, a ordem da disjunção está errada e a linha legada de
--   -- `ativo_ids` vazio ficou imortal — REVERTA a função (é o defeito que 3 refutadores acharam).
--
--   -- 3) as 3 policies da TABELA citam os predicados novos, e nenhuma sobrou só-cargo
--   select policyname, cmd, coalesce(qual,'-') as usando, coalesce(with_check,'-') as checando
--     from pg_policies
--    where schemaname='public' and tablename='termos_gerados' order by cmd, policyname;
--   -- esperado: SELECT segue como a 0070 o deixou; as 3 de escrita citam pode_escrever_termo;
--   -- INSERT e UPDATE citam também termo_ancora_coerente, array_length e `arquivo_path`;
--   -- DELETE cita SÓ pode_escrever_termo
--
--   -- 4) as 4 policies do bucket `termos`
--   select policyname, cmd, coalesce(qual,'-') as usando, coalesce(with_check,'-') as checando
--     from pg_policies
--    where schemaname='storage' and tablename='objects' and policyname like 'termos%'
--    order by policyname;
--   -- esperado: as 3 de escrita citam papel_atual() E pode_escrever_arquivo_termo(name)
--
--   -- 5) nada foi tocado
--   select (select count(*) from public.termos_gerados)                             as termos,
--          (select count(*) from storage.objects where bucket_id = 'termos')        as docx;
--   -- esperado: as mesmas contagens de antes do apply
--
--   -- 6) o índice existe
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='termos_gerados' order by indexname;
--   -- esperado: inclui termos_gerados_arquivo_path_idx
--
--   -- 7) o roteiro: supabase/tests/papeis_rls.sql — 2i-bis, 2i-bis-2, 2i-bis-3, 2i-bis-4 (ataque), 2i-ter, 2i-ter-2, 2i-ter-3
--   --    (legítimo) e 5h/5i (admin). Rode ANTES do apply (os 2i-bis devem FALHAR) e
--   --    DEPOIS (todas verdes).
--
--   -- 8) depois do apply em cada banco: notify pgrst, 'reload schema';

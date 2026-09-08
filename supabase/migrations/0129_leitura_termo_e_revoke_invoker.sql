-- Migration 0129 — a FECHADURA DE LEITURA do bucket `termos`, e os cinco revoke (F50).
--
-- Três blocos, e nenhum deles muda quem consegue ler ou escrever o que quer que seja
-- hoje. O serviço desta migration é criar o LUGAR onde o recorte por empresa vai
-- encostar, e encolher a superfície alcançável por `anon`.
--
-- ---------------------------------------------------------------------------
-- BLOCO 1 — public.pode_ler_arquivo_termo(text)
-- ---------------------------------------------------------------------------
-- Espelha `pode_escrever_arquivo_termo` (0069:313) em linguagem, volatilidade,
-- `security definer`, `search_path`, `revoke`/`grant` e `comment on function` — mas
-- com a REGRA DE LEITURA DE HOJE, e sem o `coalesce(…, true)` da irmã.
--
-- ⚠ POR QUE SEM O `coalesce(…, true)`. Na ESCRITA aquele fallback é o coração do
-- desenho: o `.docx` sobe para o Storage ANTES de a linha em `termos_gerados` existir
-- (`termos.ts:333` antes de `:355`), então durante o próprio upload o nome não casa
-- com linha nenhuma, o `bool_and` devolve NULL, e sem o `true` a escrita se negaria a
-- si mesma. Ele também mantém possível a limpeza de arquivo órfão.
--
-- Na LEITURA não existe janela equivalente: ninguém precisa ler um objeto que ainda
-- não terminou de nascer. Herdar o fallback aqui seria abrir, de volta, exatamente o
-- que esta função existe para poder fechar: objeto sem linha correspondente passaria
-- a ser legível por regra, e é justamente o objeto órfão — aquele que ninguém
-- consegue atribuir a uma filial, e amanhã a uma empresa. O default certo na leitura
-- é o oposto do da escrita, e é por isso que as duas funções não podem ser a mesma.
--
-- ⚠ E POR QUE A REGRA DE HOJE, E NÃO A DE AMANHÃ. A policy de SELECT do bucket já
-- exige `papel_atual() is not null` desde a `0070` §B — a ficha da fase dizia que ela
-- era `using (bucket_id = 'termos')` e nada mais, o que valeu até a `0066` e deixou de
-- valer na `0070`. Então esta função ENCAPSULA uma regra que já está em produção; ela
-- não aperta nem afrouxa nada. É isso que faz "zero mudança de comportamento" ser
-- demonstrável em vez de esperançoso, e é isso que `supabase/tests/storage_termo.sql`
-- confere: o mesmo conjunto de objetos legível por cada cargo, antes e depois.
--
-- Quando a virada chegar (F67), o corpo passa a exigir que a linha de `termos_gerados`
-- correspondente seja da empresa da sessão — **pelo JOIN, não pelo caminho**. É a
-- decisão registrada: fechar por join dispensa mover os objetos do bucket, e mover
-- objeto com dado pessoal (o .docx traz nome, setor e patrimônios) tem uma janela em
-- que o par path↔linha fica quebrado — a mesma janela que o `coalesce` da escrita
-- transformaria em porta aberta.
create or replace function public.pode_ler_arquivo_termo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select public.papel_atual()) is not null
$$;

comment on function public.pode_ler_arquivo_termo(text) is
  'F50/0129: true se o usuário pode LER este objeto do bucket `termos`. Hoje devolve a regra vigente desde a 0070 §B — todo logado ATIVO lê (papel_atual() não nulo; perfil desativado ou arquivado devolve NULL e não lê). O parâmetro `p_nome` ainda não é consultado: ele existe para que a F67 possa fechar a leitura pelo JOIN com termos_gerados (a linha do termo tem de ser da empresa da sessão) SEM mover um único objeto de bucket nem reescrever arquivo_path. ⚠ SEM o coalesce(…, true) da irmã de escrita, e de propósito: lá o fallback cobre a janela upload→insert (o .docx sobe antes da linha existir) e a limpeza de órfão; na leitura não há janela equivalente, e herdá-lo faria justamente o objeto ÓRFÃO — o que ninguém consegue atribuir a uma filial ou empresa — ser legível por regra.';

revoke all on function public.pode_ler_arquivo_termo(text) from public, anon;
grant execute on function public.pode_ler_arquivo_termo(text) to authenticated;

-- ---------------------------------------------------------------------------
-- BLOCO 2 — a policy de SELECT do bucket `termos` passa a chamá-la
-- ---------------------------------------------------------------------------
-- Predicado ANTES (0070 §B):
--   bucket_id = 'termos' and (select public.papel_atual()) is not null
-- Predicado DEPOIS:
--   bucket_id = 'termos' and (select public.pode_ler_arquivo_termo(name))
--
-- A conjunção mantém `bucket_id` — sem ele a policy passaria a valer para qualquer
-- bucket futuro, que é a armadilha que a 0070 já tinha evitado por escrito. O
-- `(select …)` envolvendo a chamada é o padrão InitPlan das 0059/0065/0070: o
-- planejador avalia uma vez por consulta em vez de uma vez por linha — e aqui isso
-- importa, porque um `createSignedUrl` de listagem toca muitos objetos.
--
-- ⚠ Isto NÃO troca a regra, troca o LUGAR dela. Quem lia continua lendo; quem não
-- lia continua sem ler. A prova está em `supabase/tests/storage_termo.sql`.
--
-- ⚠ O COMENTÁRIO DA 0066 NÃO FOI EDITADO, e a decisão é deliberada. Aquele parágrafo
-- ("Leitura fica como está de propósito… a expressão é idêntica à da 0021") descreve
-- corretamente o que a 0066 fez, no dia em que ela rodou; ele só parece errado quando
-- lido como se descrevesse o presente. Migration é registro histórico, não
-- documentação viva — e desde a F46 isso é executável: `supabase/migrations.lock.json`
-- trava o sha256 de cada arquivo aplicado, e `npm run test` reprova quem mexer num
-- byte. A ordem de serviço pedia essa reescrita; a regra permanente do CLAUDE.md a
-- proíbe, e a regra vence. Onde a regra de leitura mora HOJE está dito aqui, na
-- migration que a mudou — que é onde quem for atrás do histórico vai chegar, seguindo
-- a cadeia 0021 → 0066 → 0070 → 0129.
alter policy "termos leitura operador" on storage.objects
  using (
    bucket_id = 'termos'
    and (select public.pode_ler_arquivo_termo(name))
  );

-- ---------------------------------------------------------------------------
-- BLOCO 3 — o EXECUTE de `anon` nas cinco funções INVOKER
-- ---------------------------------------------------------------------------
-- Achado 8.2 da F48, carregado para esta fase pelo backlog da F49 §12.2 (decisão do
-- Johnny, 08/09/2026). As cinco são `security invoker` e nasceram com o grant default
-- do Supabase, que inclui `anon` — logo, são chamáveis por `/rest/v1/rpc/*` com a
-- chave pública.
--
-- Nenhuma delas escala privilégio, e o motivo é o mesmo para quatro e DIFERENTE para
-- a quinta — o que a revisão adversarial da F48 corrigiu, e é a versão certa que fica
-- registrada aqui:
--
--   · chave_identidade_ativo (0099) — immutable, aritmética de texto sobre os
--     argumentos. Não toca tabela nenhuma.
--   · hoje_brt (0124) — stable, devolve `now()` no fuso do negócio.
--   · mov_da_carga_import (0092) — immutable, um `like` sobre o argumento.
--   · status_apos_movimentacao (0109) — immutable, a máquina de estados em `case`.
--   · valida_lancamento_item (0118) — ⚠ ESTA LÊ TABELA. A primeira redação do achado
--     dizia que "nenhuma lê tabela por conta própria", e isso era FALSO para ela: ela
--     consulta `public.lancamentos_item`. O que a torna inofensiva são duas coisas
--     independentes, e nenhuma é "não toca tabela": (1) é `returns trigger`, então
--     uma chamada por `/rest/v1/rpc/*` FALHA — não existe NEW/OLD fora de um trigger;
--     (2) sendo INVOKER, a leitura vale com o privilégio de QUEM CHAMA e passa pela
--     RLS de `lancamentos_item` como qualquer outra.
--
-- Ou seja: o revoke é DEFESA EM PROFUNDIDADE, não conserto de vazamento. Superfície
-- que não precisa existir não deve existir — e a `seguranca_catalogo.sql:22-23` já
-- previa este dia por escrito ("basta uma migration nova revogando o EXECUTE").
--
-- ⚠ `authenticated` NÃO é revogado. As cinco são usadas por triggers e por SQL de
-- funções que rodam na sessão do operador; tirar o EXECUTE dele quebraria escrita de
-- verdade. O alvo é `anon`, que é quem não tem por que alcançá-las.
--
-- ⚠ E O REVOKE PRECISA INCLUIR `public` — sem isso ele é NO-OP, e silencioso.
-- Medido em produção (ensaio em `begin; … rollback;` antes deste apply): a ACL das
-- cinco é
--     {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- e aquele `=X` sem papel à esquerda é o grant ao pseudo-papel PUBLIC. `anon` alcança
-- a função por DOIS caminhos: o grant próprio e a herança de PUBLIC. Revogar só do
-- primeiro deixa o segundo de pé, e `has_function_privilege('anon', …)` continua
-- devolvendo true — o revoke "roda com sucesso" e não muda nada.
--
-- É exatamente o que a 0069 já fazia para `pode_escrever_arquivo_termo` (`from public,
-- anon`), e a ACL dela mostra o resultado certo: {postgres, authenticated, service_role},
-- sem `=X` e sem `anon`. `authenticated` e `service_role` têm grant EXPLÍCITO nas
-- cinco, então revogar PUBLIC não os alcança — conferido na mesma consulta.
revoke execute on function public.chave_identidade_ativo(text, text) from public, anon;
revoke execute on function public.hoje_brt() from public, anon;
revoke execute on function public.mov_da_carga_import(text) from public, anon;
revoke execute on function public.status_apos_movimentacao(public.status_ativo, public.tipo_movimentacao) from public, anon;
revoke execute on function public.valida_lancamento_item() from public, anon;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a função existe, é SECURITY DEFINER e `anon` NÃO a executa:
--   select p.proname, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'execute')          as anon_executa,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth_executa
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'pode_ler_arquivo_termo';
--   -- esperado: 1 linha — prosecdef = true, anon_executa = false, auth_executa = true
--
--   -- 2) a policy de SELECT do bucket a CHAMA (e continua exigindo o bucket):
--   select policyname, qual from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname = 'termos leitura operador';
--   -- esperado: qual cita `pode_ler_arquivo_termo(name)` E `bucket_id = 'termos'`
--
--   -- 3) as cinco INVOKER deixaram de ser alcançáveis por `anon`:
--   select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_executa
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('chave_identidade_ativo','hoje_brt','mov_da_carga_import',
--                        'status_apos_movimentacao','valida_lancamento_item')
--    order by 1;
--   -- esperado: 5 linhas, anon_executa = false em TODAS
--
--   -- 4) A ASSERÇÃO QUE IMPORTA EM PRODUÇÃO: um objeto do bucket continua legível
--   --    por quem o lia. Conte os objetos e confirme que o total não mudou:
--   select count(*) from storage.objects where bucket_id = 'termos';
--   -- esperado: o MESMO número de antes do apply (a policy não apaga nada; esta
--   -- consulta roda como `postgres`, que ignora RLS — a prova por CARGO está em
--   -- supabase/tests/storage_termo.sql, que roda no CI)
--
-- ---------- REVERSÃO ----------
--   alter policy "termos leitura operador" on storage.objects
--     using (bucket_id = 'termos' and (select public.papel_atual()) is not null);
--   grant execute on function public.chave_identidade_ativo(text, text) to anon;
--   grant execute on function public.hoje_brt() to anon;
--   grant execute on function public.mov_da_carga_import(text) to anon;
--   grant execute on function public.status_apos_movimentacao(public.status_ativo, public.tipo_movimentacao) to anon;
--   grant execute on function public.valida_lancamento_item() to anon;
--   drop function if exists public.pode_ler_arquivo_termo(text);
--   -- ⚠ NESTA ORDEM: a policy tem de largar a função ANTES de o drop rodar.

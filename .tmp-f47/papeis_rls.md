## resumo

supabase/tests/papeis_rls.sql (1219 linhas) é um único `begin; ... do $$ ... $$; rollback;`. Fixtures como `postgres` (super-usuário, ignora RLS): 4 contas em `auth.users`/`profiles` (k_admin/k_operador/k_consulta/k_inativo, papéis admin/operador/consulta/operador-desativado), `operador_filiais` só liga k_operador e k_inativo a v_f1, 2 ativos (um por filial), 1 item, 1 linha em cada tabela "fechada" (senhas_acesso/import_logs/eventos_admin/storage backups-import) para que "ver 0 linhas" prove policy e não tabela vazia, 2 lançamentos de item (um por filial, para estorno cruzado) e um par ativo+movimentação+termo já gerado por filial (para o exploit de termo). Troca de papel é sempre `set local role authenticated` + `perform set_config('request.jwt.claims', json_build_object('sub',<uuid>,'role','authenticated')::text, true)`, com `reset role` entre seções — é o que faz `auth.uid()`/`papel_atual()` responderem como PostgREST responderia. 6 seções em sequência única (não isoladas por SAVEPOINT): 1-consulta (lê tudo, escreve nada, inclui o par 1b-bis/1b-ter do piso de leitura da 0070 e 1i/1i-bis/1j de F37), 2-operador vinculado só a v_f1 (2a..2j: vínculo de filial em ativos/movimentacoes/lancamentos_item, o caso CRUZADO 2c-bis/2c-ter da 0067, o estorno cruzado 2e-bis/2e-ter da 0068, a RPC criar_compra_lote 2g-bis/2g-ter da 0064, o exploit de termo de filial alheia 2i-bis-*/2i-ter-* da 0069, a transferência legítima 2h por último porque MOVE v_ativo_f1, e 2j que cria v_colab_f37), 3-operador não é admin (3a..3i: catálogo fechado, leituras fechadas com fixture plantada, escalada de privilégio 3g via grant de coluna, 3c/3c-quater a F41 que abriu INSERT de itens ao operador), 4-desativado (4a..4i: ativo=false fecha escrita E leitura, a 0070), 5-admin (5a..5i: o que só admin faz, a válvula pode_escrever_termo('{}') da 0069 em 5h/5i), 6-storage (6a..6f: as policies dos buckets termos/backups-import). Resumo final grava (v_ok,v_falhas,v_msgs) em `_papeis_resumo` e imprime `NOTICE 'FIM papeis_rls: % asserções, % falhas'` — a linha que o runner exige.

## armadilhas

(1) RÓTULOS PREFIXO: "2c" é prefixo de "2c-bis"/"2c-ter"; "2e" de "2e-bis"/"2e-ter"; "2g" de "2g-bis"/"2g-ter"; "2i-bis" de "2i-bis-2"/"2i-bis-3"/"2i-bis-4"; "2i-ter" de "2i-ter-2"/"2i-ter-3"; "3c" de "3c-bis"/"3c-ter"/"3c-quater"/"3c-quinquies"; "5c" de "5c-bis"/"5c-ter"; "5e" de "5e-bis"; "1b" de "1b-bis"/"1b-ter"; "1i" de "1i-bis". Um injetor que faça `grep '✗ 2c '` (ou sem delimitador de fim) pode casar com o rótulo errado — precisa comparar o token INTEIRO até o próximo espaço/fim de frase, não substring. (2) GATE CONDICIONAL NO TOPO (linhas 185-191): se o banco não tiver 2 filiais ATIVAS, o `do $$` inteiro retorna cedo com `(0,1,'sem duas filiais ativas')` e NENHUM dos ~150 cenários roda — nenhum token "✗ <rótulo>" aparece nem para o lado bom nem para o mau. Mutação que mexa em `filiais`/seed não é o alvo aqui, mas o injetor precisa saber que "rótulo ausente" pode significar "nunca rodou", não "passou". (3) DEPENDÊNCIA ENTRE BLOCOS — mesma transação, sem SAVEPOINT por cenário: (a) 2h é DE PROPÓSITO a última asserção da seção 2 porque MOVE v_ativo_f1 de v_f1→v_f2; qualquer mutação que faça 2h falhar cedo demais (ou que reordene) deixa asserções seguintes medindo um ativo na filial errada; (b) 2j cria v_colab_f37 e 3c cria v_item_f41 — se uma mutação NÃO relacionada a colaboradores/itens ainda assim derrubar 2j/3c (ex.: fechando de vez o INSERT), as variáveis ficam NULL e os UPDATEs de 3c-ter/5c-ter/3c-quater em "where id = v_colab_f37/v_item_f41" afetam 0 linhas por ACIDENTE — 3c-ter e 3c-quater esperam 0 (passam por engano), mas 5c-ter espera 1 e FALHA por um motivo que nada tem a ver com a policy de UPDATE que ele testa; (c) 2i-bis tenta apagar v_termo_f2 e espera row_count=0 (RLS bloqueia); se uma mutação fizer esse DELETE realmente acontecer, v_termo_f2 desaparece e 5i (que depende da MESMA linha existir para o admin apagar depois) falha em cascata, mascarando qual das duas policies (a do operador ou a do admin) está realmente errada. (4) ASSERÇÃO SOBRE CONJUNTO VAZIO/FRACA: 1j (consulta lê `colaboradores`) só prova "não lançou exceção" — a tabela nasce vazia nesta transação e não há fixture plantada nela como há em senhas_acesso/import_logs/eventos_admin; uma RLS totalmente desligada em `colaboradores` passaria em 1j do mesmo jeito que a policy correta passa. Quem realmente prova o piso de leitura ali é "4i" (desativado, que exige 0 linhas mesmo com fixture inexistente — mais fraco ainda: com a tabela vazia por natureza, 4i também é "vazio coincide com correto", só ganha força de verdade quando ALGUÉM plantou linha, o que aqui não acontece — ou seja, `colaboradores` não tem, dentro deste arquivo, uma prova robusta de que o piso de leitura vale para ela; só prova para consulta/desativado que "não dá erro"/"não vê nada porque não há nada"). (5) PONTO CEGO DO CARGO DEV: este roteiro NUNCA cria um profile com `papel='dev'` — só admin/operador/consulta/operador-desativado. Logo `e_dev()` não é chamado em lugar nenhum do arquivo (conferido por grep) e QUALQUER mutação que dependa de distinguir 'dev' de 'admin' (as ~5 policies literais que a 0072 corrigiu, as guardas `e_dev()` dentro das RPCs da 0074/0077/0082/0085/.../0127, a trava `profiles_guarda_dev`) é INVISÍVEL para papeis_rls.sql. O roteiro certo para essas mutações é `supabase/tests/cargo_dev.sql` (existe no repo), não este arquivo — mapear uma mutação de e_dev() para "papeis_rls.sql derruba tal rótulo" seria falso. (6) PONTO CEGO DE GRANT PARA `anon`: o roteiro roda inteiro como `authenticated` (nunca `set local role anon`), então nenhuma mutação de "grant execute ... to anon" em função alguma (pode_escrever_filial, e_admin, pode_escrever_termo etc.) produz qualquer "✗" aqui — quem prova isso é `seguranca_catalogo.sql` (cenários 1 e 4, via `has_function_privilege('anon', ...)`). (7) A TRAVA PRÉ-VOO (linhas 136-146) não usa o mecanismo "✗ <rótulo>": ela é um `do $trava$ ... raise exception ...` que roda ANTES de qualquer cenário, fora do `do $$` principal. Uma mutação que reabra `grant update on public.profiles to authenticated` (em vez do grant de coluna) É pega, mas por uma EXCEÇÃO SQL solta, não por "✗ 3g" — o texto da falha é "O bloco de grants deste roteiro devolveu UPDATE de TABELA em profiles..." e a linha "FIM papeis_rls: N asserções, M falhas" nunca é impressa. Um injetor que exija encontrar um rótulo "✗ <nome>" no output vai errar o diagnóstico deste caso específico. (8) MUTAÇÃO EM CLÁUSULA REDUNDANTE FICA INVISÍVEL: a policy de `movimentacoes` (0067) é `pode_escrever_filial(filial_id) AND pode_escrever_filial((snapshot_anterior->>'filial_id')::smallint)` — mutar SÓ a primeira cláusula (a do dado "declarado") para `pode_escrever()` não muda o resultado de NENHUM cenário do arquivo, porque em todo caso testado (2b/2c/2c-bis/2h) a segunda cláusula (a do snapshot real) já decide sozinha o resultado correto; é preciso mutar (ou remover) a segunda cláusula para expor o furo que a 0067 fechou.

## mutacoes

[
 {
  "id": "movimentacoes-filial-origem-real",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "2c-bis",
   "2c-ter"
  ],
  "porque": "Reabre o furo do 'deputado confuso' pré-0067: a policy volta a confiar só na filial DECLARADA pelo cliente (`filial_id`), não na filial REAL do ativo lida do `snapshot_anterior` gravado pelo trigger. É o padrão multiempresa clássico: o atacante mente o campo de escopo em vez de o campo de identidade.",
  "sql": "alter policy \"operador insere\" on public.movimentacoes\n  with check (\n    public.pode_escrever_filial(filial_id)\n  );",
  "risco": "2c sozinho (mesma filial não vinculada declarada E real) continua recusado mesmo com a mutação — só o caso CRUZADO 2c-bis expõe o furo, e 2c-ter só cai se 2c-bis realmente passar (é o efeito observável, não a causa). Mutar só a PRIMEIRA cláusula da AND (a declarada) em vez de remover a segunda é invisível a este roteiro — ver armadilha (8).",
  "prova": "select (with_check like '%snapshot_anterior%') as tem_checagem_de_origem from pg_policies where schemaname='public' and tablename='movimentacoes' and policyname='operador insere'; -- esperado false após a mutação (hoje é true)"
 },
 {
  "id": "lancamentos-item-update-so-papel",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "2e"
  ],
  "porque": "GUARDA CONFERE O PAPEL E ESQUECE O ESCOPO — troca o predicado de filial de `lancamentos_item` (onde `filial_id` É o objeto direto da escrita, não um ponteiro livre) por `pode_escrever()`, que só olha cargo. Um operador vinculado só à filial 1 passa a lançar/estornar item na filial 2.",
  "sql": "alter policy \"operador lanca\" on public.lancamentos_item\n  with check (\n    public.pode_escrever()\n    and public.estorno_item_coerente(estorna_id, filial_id, item_id)\n  );",
  "risco": "O positivo vizinho 2d continua verde (operador também satisfaz pode_escrever()). Combinada na MESMA rodada com a mutação nº abaixo em ativos, os dois `derruba` ficam em tabelas diferentes e não colidem — mas aplicar simultaneamente DUAS mutações na mesma policy (esta + remover estorno_item_coerente) derrubaria 2e E 2e-bis juntos, perdendo a granularidade de 1 mutação = 1 cenário.",
  "prova": "select with_check from pg_policies where schemaname='public' and tablename='lancamentos_item' and policyname='operador lanca'; -- esperado NÃO conter 'pode_escrever_filial'"
 },
 {
  "id": "ativos-update-so-papel",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "2g"
  ],
  "porque": "GUARDA CONFERE O PAPEL E ESQUECE O ESCOPO — segunda instância pedida: troca `pode_escrever_filial(filial_id)` por `pode_escrever()` no UPDATE de `ativos`. Operador vinculado só a v_f1 passa a editar ativo de v_f2.",
  "sql": "alter policy \"operador atualiza\" on public.ativos\n  using (public.pode_escrever())\n  with check (public.pode_escrever());",
  "risco": "Positivo vizinho 2f continua verde. NÃO derruba 2g-bis/2g-ter (a RPC criar_compra_lote faz INSERT com guarda própria em pode_escrever_filial, não UPDATE) nem nada em ativos-INSERT (policy separada, intocada) — o alcance da mutação é estritamente o verbo UPDATE.",
  "prova": "select using, with_check from pg_policies where schemaname='public' and tablename='ativos' and policyname='operador atualiza'; -- esperado NÃO conter 'pode_escrever_filial'"
 },
 {
  "id": "pode-escrever-termo-sem-valvula-admin",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "5h"
  ],
  "porque": "Remove o `e_admin() OR (...)` do topo da disjunção — reproduz LITERALMENTE o bug histórico documentado no cabeçalho da 0069 ('a primeira versão... trancava a linha para todo mundo, admin incluído, e o lixo virava imortal'). Sem a válvula, `ativo_ids = '{}'` fica inalcançável mesmo para o admin.",
  "sql": "create or replace function public.pode_escrever_termo(p_ativo_ids uuid[])\nreturns boolean\nlanguage sql stable security definer set search_path = public\nas $$\n  select coalesce(array_length(p_ativo_ids, 1), 0) > 0\n     and not exists (\n       select 1 from unnest(p_ativo_ids) aid\n         left join public.ativos a on a.id = aid\n        where a.id is null or not public.pode_escrever_filial(a.filial_id)\n     )\n$$;",
  "risco": "NÃO derruba 5i: o termo fixture v_termo_f2 tem `ativo_ids` não vazio, e `pode_escrever_filial` já cobre admin em qualquer filial independentemente da válvula — só a linha DEGENERADA (array vazio) fica presa. Mutação de altíssima fidelidade histórica, baixo risco de falso-negativo.",
  "prova": "-- como admin (sub=k_admin), dentro do begin/rollback:\nselect public.pode_escrever_termo('{}'::uuid[]); -- esperado true hoje, false após a mutação"
 },
 {
  "id": "ativos-leitura-piso-afrouxado",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "4d"
  ],
  "porque": "Piso de leitura da 0070 (`papel_atual() is not null`) afrouxado para `true` na policy de SELECT de `ativos` — perfil desativado volta a ler o acervo inteiro enquanto o access token não expira (o exato furo que a 0070 fechou, citado pelo próprio comentário da linha 953: 'a 0070 não está no ar').",
  "sql": "alter policy \"leitura operador\" on public.ativos using (true);",
  "risco": "Positivo vizinho 1b continua verde (consulta ativo sempre lê, com ou sem a mutação). A mesma família de mutação em `profiles` (mesma 0070) derrubaria '4e' em vez de '4d' — são candidatas SEPARADAS, uma por tabela; não misturar numa mesma rodada de injeção se o objetivo é isolar 1 mutação = 1 cenário.",
  "prova": "select qual from pg_policies where schemaname='public' and tablename='ativos' and policyname='leitura operador'; -- esperado NÃO 'true' (hoje contém 'papel_atual')"
 },
 {
  "id": "senhas-acesso-rls-desligada",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "3d",
   "5f"
  ],
  "porque": "RLS DESLIGADA NUMA TABELA — `senhas_acesso` está com RLS ligada e ZERO policies desde a 0012 (deny-all por ausência de policy); não há policy para mutar, então o único jeito de reabrir é desligar a RLS da tabela inteira. O roteiro concede SELECT de teste a `authenticated` nas linhas 91-108, então a mutação expõe o `hash` de senha de acesso ao brute-force offline.",
  "sql": "alter table public.senhas_acesso disable row level security;",
  "risco": "Sem par positivo: NENHUM papel deveria ler `senhas_acesso`, nem o admin — é literalmente o que 5f prova. As duas asserções (3d como operador, 5f como admin) vivem no MESMO `do $$`/mesma transação; a mutação derruba as duas juntas, não dá para isolar uma sem a outra nesta tabela específica.",
  "prova": "select relrowsecurity from pg_class where oid = 'public.senhas_acesso'::regclass; -- esperado true hoje, false após a mutação"
 },
 {
  "id": "eventos-admin-leitura-so-escreve",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "3f"
  ],
  "porque": "Troca `e_admin()` (nível administrador) por `pode_escrever()` (qualquer um que escreve algo) na LEITURA da trilha de auditoria — operador passa a ver quem promoveu/revogou quem, dado sensível de gestão de acesso que o próprio ADR-002 reserva a admin/dev.",
  "sql": "alter policy \"admin le auditoria\" on public.eventos_admin\n  using (public.pode_escrever());",
  "risco": "Positivo vizinho 5e continua verde (admin também satisfaz pode_escrever()) — classe sorrateira: AMPLIA acesso sem quebrar nenhum cenário 'admin consegue X', só os cenários 'operador NÃO consegue X'. Um injetor/revisor que só rode os cenários administrativos como smoke test não pegaria isto.",
  "prova": "select qual from pg_policies where schemaname='public' and tablename='eventos_admin' and policyname='admin le auditoria'; -- esperado conter 'e_admin', não só 'pode_escrever'"
 },
 {
  "id": "import-logs-leitura-so-escreve",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "3e"
  ],
  "porque": "Mesma classe da anterior aplicada a `import_logs`: `e_admin()` → `pode_escrever()` na SELECT. Operador passa a ver o histórico do import destrutivo (inclusive o caminho do backup, via 5e-bis/urlBackup) mesmo não sendo admin.",
  "sql": "alter policy \"leitura operador\" on public.import_logs\n  using (public.pode_escrever());",
  "risco": "Positivo vizinho 5e-bis não é afetado (admin também satisfaz pode_escrever()). Idêntica em espírito a 'eventos-admin-leitura-so-escreve' — as duas juntas na mesma rodada derrubam 3e E 3f simultaneamente; tratar como candidatas separadas se o objetivo é 1 mutação = 1 rótulo.",
  "prova": "select qual from pg_policies where schemaname='public' and tablename='import_logs' and policyname='leitura operador'; -- esperado conter 'e_admin'"
 },
 {
  "id": "backups-import-leitura-so-escreve",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "6e"
  ],
  "porque": "Mesma classe, agora no bucket de STORAGE `backups-import`: `e_admin()` → `pode_escrever()` na policy de SELECT de `storage.objects`. Operador passa a listar/baixar backups de acervo de import destrutivo de qualquer filial.",
  "sql": "alter policy \"backups-import leitura operador\" on storage.objects\n  using (bucket_id = 'backups-import' and public.pode_escrever());",
  "risco": "Positivo vizinho 6f não é afetado (admin também satisfaz pode_escrever()); 6b (consulta) também não é afetado — consulta não satisfaz pode_escrever(), então só o operador vaza. Prova que a classe 'nível-admin vira nível-escreve' atravessa tabela E storage com o mesmo padrão sintático.",
  "prova": "select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='backups-import leitura operador'; -- esperado conter 'e_admin'"
 },
 {
  "id": "termo-ancora-sempre-coerente",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "2i-bis-3"
  ],
  "porque": "`termo_ancora_coerente` hardcoded para `true` — reabre 'queimar a vaga': o operador cita movimentações da filial alheia (v_mov_t2) mas declara `ativo_ids` da própria filial (v_ativo_t1), e o INSERT passa porque a checagem de coerência entre os dois arrays deixou de existir.",
  "sql": "create or replace function public.termo_ancora_coerente(\n  p_movimentacao_ids uuid[],\n  p_ativo_ids        uuid[]\n) returns boolean\nlanguage sql stable security definer set search_path = public\nas $$ select true $$;",
  "risco": "Positivos vizinhos 2i-ter-2/2i-ter-3 continuam verdes (a âncora já era coerente nesses fluxos legítimos, então 'sempre true' não muda o resultado ali). NÃO derruba 2i-bis/2i-bis-2/2i-bis-4 (essas testam a FILIAL do termo via pode_escrever_termo, função diferente) nem 2c-bis (usa pode_escrever_filial, não esta função) — mutação isolada à checagem de coerência ativo↔movimentação.",
  "prova": "select public.termo_ancora_coerente('{}'::uuid[], array['00000000-0000-0000-0000-000000000001'::uuid]); -- esperado false hoje, true após"
 },
 {
  "id": "colaboradores-update-admin-vira-dev",
  "roteiro": "papeis_rls.sql",
  "derruba": [
   "5c-ter"
  ],
  "porque": "Troca `e_admin()` por `e_dev()` na policy de UPDATE de `colaboradores` — um cargo admin comum (não-dev) deixa de conseguir editar/desativar cadastro de pessoa, quebrando o fluxo administrativo normal.",
  "sql": "alter policy \"admin atualiza colaborador\" on public.colaboradores\n  using (public.e_dev())\n  with check (public.e_dev());",
  "risco": "CONFIANÇA MAIS BAIXA e direção enganosa: o defeito real e perigoso de produção é o INVERSO (e_dev() virando e_admin() nas RPCs de gestão de usuário — deixando um admin comum mexer em conta de outro dev), e ESSA direção é INVISÍVEL a papeis_rls.sql porque o arquivo nunca cria um profile papel='dev' (ver armadilha 5; o roteiro certo é cargo_dev.sql). Este candidato só prova que o arquivo reage a QUALQUER troca de e_admin()/e_dev() nesta policy específica, não a direção que interessa de verdade. Não há par positivo que sobreviva à mutação (3c-ter é a metade NEGATIVA do par com 2j, não uma prova de fluxo admin ainda de pé).",
  "prova": "select with_check from pg_policies where schemaname='public' and tablename='colaboradores' and policyname='admin atualiza colaborador'; -- esperado conter 'e_admin', não 'e_dev'"
 },
 {
  "id": "profiles-grant-tabela-inteira",
  "roteiro": "papeis_rls.sql",
  "derruba": [],
  "porque": "Escalada de privilégio clássica: em vez do grant de COLUNA da 0063 (`primeiro_nome, sobrenome`), a migration concede UPDATE de TABELA inteira em `profiles` a `authenticated` — o operador conseguiria `update profiles set papel='admin' where id = <o próprio>`.",
  "sql": "grant update on public.profiles to authenticated;",
  "risco": "BAIXA CONFIANÇA para o mecanismo 'cenário nomeado': esta mutação É pega, mas pela TRAVA PRÉ-VOO do próprio arquivo (linhas 136-146, um `raise exception` fora do `do $$` de cenários), não por um `raise warning '✗ 3g'`. O output é uma exceção SQL solta com o texto 'O bloco de grants deste roteiro devolveu UPDATE de TABELA em profiles...' e a linha 'FIM papeis_rls: N asserções, M falhas' nunca aparece — nenhum rótulo de cenário dispara porque nenhum cenário chega a rodar. Um injetor que procure estritamente '✗ 3g' no output vai concluir (erradamente) que a mutação não foi detectada.",
  "prova": "select has_table_privilege('authenticated','public.profiles','update') as update_tabela; -- true nos dois casos (grant de coluna já satisfaz isto!) — a prova de verdade é a lista de colunas: select column_name from information_schema.column_privileges where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE'; esperado {primeiro_nome, sobrenome} hoje, todas as colunas após a mutação"
 },
 {
  "id": "grant-execute-anon-fora-de-escopo",
  "roteiro": "seguranca_catalogo.sql",
  "derruba": [],
  "porque": "Registro da lacuna pedida no brief ('grant de EXECUTE devolvido a anon/authenticated'): concede EXECUTE de uma função SECURITY DEFINER (ex.: pode_escrever_filial) também a `anon`, reabrindo o caminho de chamar a RPC/função com a anon key sem sessão nenhuma.",
  "sql": "grant execute on function public.pode_escrever_filial(smallint) to anon;",
  "risco": "FORA DE ESCOPO para papeis_rls.sql: o arquivo roda inteiro como `authenticated` (nunca `set local role anon`), então nenhum rótulo deste arquivo reage a esta mutação — `derruba` fica vazio DE PROPÓSITO. Quem prova isto é `seguranca_catalogo.sql`, cenários 1 e 4 (`has_function_privilege('anon', ...)`). Incluído aqui só para que o injetor NÃO mapeie por engano este tipo de mutação para papeis_rls.sql.",
  "prova": "select has_function_privilege('anon','public.pode_escrever_filial(smallint)','execute'); -- esperado false hoje, true após — mas conferido em seguranca_catalogo.sql, não em papeis_rls.sql"
 }
]
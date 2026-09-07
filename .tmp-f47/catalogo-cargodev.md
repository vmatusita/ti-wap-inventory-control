## resumo

FRENTE B — dois roteiros, dois padrões distintos de execução.

**seguranca_catalogo.sql** (141 linhas): SÓ LEITURA de catálogo (pg_class/pg_proc/ACLs), sem begin/rollback — não grava nada, então não precisa de sessão nem de troca de papel; roda inteiro como quem o chamar (psql/service role). 4 asserções top-level dentro de um único `do $$...$$` (linhas 26-141):
- **1** (44-63): laço sobre as 3 RPCs de escrita (`criar_compra_lote`, `devolver_ao_fornecedor`, `importar_ativos_substituir`) — exige `authenticated=EXECUTE, anon=SEM, service_role=SEM` via `has_function_privilege`.
- **2** (65-81): `count(*)` de tabelas `relkind in ('r','p')` em `public` com `relrowsecurity=false`, **excluindo** `left(c.relname,1) <> '_'` (linha 75).
- **3** (83-99): mesmo padrão para views (`relkind='v'`) sem `security_invoker=true` nos `reloptions` — **sem** a isenção de prefixo.
- **4/4c** (101-138): laço sobre `aplicar_movimentacao`/`handle_new_user` (devem estar com EXECUTE revogado de authenticated/anon) + checagem isolada `4c` de `valida_lancamento_item` (deve ser `prosecdef=false`, é por isso que a 0038 não revoga seu EXECUTE).

Hoje (segundo as migrations) **nenhuma tabela `_`-prefixada existe em `public`** — três existiram e foram dropadas: `_f8_backup_matriz_compras` e `_f7k_backup_modelo` (0039), `_f18_backup_pendencia` (0058). Logo a isenção da linha 75 não esconde nenhuma linha *hoje*, mas é um buraco estrutural permanente: qualquer tabela de rascunho/backup nascida `_algumacoisa` no futuro (exatamente o padrão das três que já existiram) nunca seria cobrada de RLS por este roteiro — é essa lacuna que a fase fecha, alinhando a asserção 2 à 3 (que não perdoa nada).

Views de `public` hoje (9, todas com `security_invoker = true` na versão vigente — nenhuma tem drop registrado): `v_estoque_atual`, `v_movimentacoes_mes`, `v_pendencias`, `v_pendencias_item`, `v_fila_pendencias`, `v_conflitos_filiais`, `v_conflitos_filiais_grupos`, `v_colaboradores_textos`, `v_colaboradores_consolidacao`.

**cargo_dev.sql** (743 linhas): ESCRITA fictícia — roda inteiro em `begin; ...; rollback;` (linhas 44/743), autossuficiente (cria filiais/usuários/ativos fictícios `f22.*@wap.ind.br`, patrimônio `WAP0009xxx`). Troca de papel é sempre o mesmo idioma: `set local role authenticated;` + `perform set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true);`, e `reset role` para voltar a postgres. A hierarquia `dev ⊃ admin ⊃ operador ⊃ consulta` é testada em 6 seções: 1 (dev é nível admin, linhas 192-291), 2 (dev intocável por admin/service role, 295-469), 3 (só dev faz X, 470-530), 5 (autoproteção, 532-562, com o 5d/5e "fora de ordem" nas linhas 443-468 por precisar rodar como postgres), 6 (apagar preserva autoria, 564-673), 4 (operador/consulta não alcançam nada, 674-727).

A rede vem de duas camadas que **precisam concordar**: o trigger `profiles_guarda_dev` (migration 0073, `public.profiles_guarda_dev()`, `before insert or update or delete on public.profiles`) recusa por padrão qualquer INSERT com `papel='dev'`, qualquer UPDATE que mude papel/ativo/excluido_em de uma linha `dev`, e qualquer DELETE de uma linha `dev` — **exceto** quando o GUC local-à-transação `estoque.gestao_usuarios` está `'on'`; e as 5 RPCs de gestão da migration 0074 (`definir_papel_usuario`, `definir_status_usuario`, `definir_vinculos_usuario`, `apagar_usuario`, `encerrar_sessoes_usuario`) são o único caminho que abre essa janela — depois de passar pela guarda comum `exigir_gestao_de(p_alvo, p_papel_pedido)` (alvo=dev OU papel pedido=dev → exige `e_dev()`; caso contrário exige `e_admin()`). `apagar_usuario` e `encerrar_sessoes_usuario` têm, além disso, um `if not public.e_dev()` **próprio**, redundante com a guarda comum apenas quando o alvo já é dev — é esse "próprio" que protege o caso alvo-não-dev (2f-bis, 2f). A trava do último administrador (`existe_outro_admin_ativo`, 0074) conta `papel in ('dev','admin')` de propósito (asserção 5d) e suas duas auxiliares (`exigir_gestao_de`, `existe_outro_admin_ativo`) tiveram o EXECUTE de `authenticated` revogado na 0078 (asserção 5e — a única do arquivo que audita GRANT, não policy).

O rollback final devolve o banco ao estado anterior para os DADOS (fixtures fictícias). Mas nenhum dos dois roteiros desfaz mutação de **catálogo** (GRANT/ALTER FUNCTION/ALTER VIEW/DISABLE RLS) — isso é DDL aplicado pelo injetor FORA da transação do roteiro (seguranca_catalogo.sql nem tem transação; cargo_dev.sql só embrulha os dados fictícios), então cabe ao injetor reverter explicitamente cada mutação de catálogo depois de observar o vermelho, nos dois arquivos.

## armadilhas

1. **PREFIXO LITERAL — a trap central pedida.** Em seguranca_catalogo.sql, o rótulo **"4"** (linhas 119/123, laço `aplicar_movimentacao`/`handle_new_user`) é prefixo literal de **"4c"** (linhas 133/137, `valida_lancamento_item`). Um injetor que teste `mensagem.includes('✗ 4')` acende para AMBOS os cenários e não sabe qual mutação pegou. Em cargo_dev.sql isso se repete **cinco vezes**, todas pelo mesmo padrão "-bis": **"2f"⊂"2f-bis"** (347 vs 356), **"2g"⊂"2g-bis"** (365 vs 380), **"2i"⊂"2i-bis"** (409 vs 417), **"2j"⊂"2j-bis"** (425 vs 433), **"6c"⊂"6c-bis"** (587 vs 598). Desambiguação correta: extrair o token pelo padrão `/✗\s+(\S+)/` (o `\S+` já para no espaço, então "2f-bis" nunca colide com "2f" numa comparação de IGUALDADE de string) — o erro só acontece se o injetor comparar por `includes`/substring em vez de igualdade exata do token capturado. Note também que cargo_dev.sql tem seu PRÓPRIO "4c" (linha 697, "operador recusado ao apagar usuário") — sem relação com o "4c" de seguranca_catalogo.sql; só não colide porque são roteiros/arquivos diferentes, mas se o injetor agregar toda a saída psql sem etiquetar por arquivo de origem, os dois "4c" se misturam.

2. **Cenário condicional que engole o resto do roteiro.** A asserção **"0"** (cargo_dev.sql, 124-130) só dispara se o banco-alvo não tiver 2 filiais ativas — condição rara, mas quando acontece o bloco faz `return;` (linha 129) **dentro do `do $$...$$`**, o que aborta TODO o restante do arquivo, inclusive a linha final `raise notice 'FIM cargo_dev: % asserções, % falhas'` (738) e o `select * from _cargo_dev_resumo` (741). O runner exige literalmente a linha "FIM <nome>: N asserções, M falhas" — na ausência dela (não um WARNING nomeado, silêncio total após "0"), o injetor precisa tratar "não achei a linha FIM" como uma falha à parte, não como "nenhum cenário pegou".

3. **Dependência entre blocos — fixture mutada em voo.** `k_operador` é promovido a `dev` na asserção 3a (479) e rebaixado de volta em 3b (494); `k_consulta` é desativado em 3c (509) e reativado na mesma asserção (513) "para não afetar o resto". O próprio arquivo documenta essa armadilha nos comentários de `k_alvo` (100-106): a primeira versão do roteiro usava `k_consulta` como alvo de 2g-bis, e promovê-lo a operador ali fazia a asserção 4d (que espera `k_consulta` com todos os `e_*()` false) medir um OPERADOR e falhar — por isso 2g-bis ganhou um alvo (`k_alvo`) só seu. Qualquer mutação ou asserção nova inserida ENTRE 2g-bis e 4d que reutilize `k_consulta`/`k_operador` herda esse mesmo risco. Também: a janela de fixture (`set_config('estoque.gestao_usuarios','on',true)` nas linhas 164/166) é o único lugar que planta `k_dev`/`k_dev2` como `dev` — uma mutação que quebrasse esse `set_config` (ou o trigger de forma ampla demais) invalidaria SILENCIOSAMENTE a seção 1 inteira (1z-1h), porque `papel_atual()` nunca resolveria 'dev' e as asserções fracassariam por um motivo totalmente diferente do que o mutante pretendia provar.

4. **Asserção que passa sobre conjunto vazio / não valida o alvo certo.** 3d (523-530, cargo_dev.sql) aceita "0 sessões removidas" como sucesso válido — só verifica AUSÊNCIA de exceção, nunca que o `delete from auth.sessions where user_id = p_alvo` mirou o usuário certo. Uma mutação que trocasse `p_alvo` por outra variável no WHERE (ex.: apagar sessões de QUALQUER usuário, ou de nenhum por engano de comparação) passaria por 3d sem ser notada. Do mesmo jeito, 1d (235-249) só reprova se a mensagem de erro contém "administradores" — uma RPC que falhasse por outro motivo (inclusive um motivo errado introduzido por mutação) ainda conta como ✓, contanto que a palavra não apareça.

5. **A isenção de nome em seguranca_catalogo.sql é vazia hoje, mas não inofensiva.** A asserção 2 (linha 75) filtra por PREFIXO de nome, não por natureza da tabela — hoje `v_cnt` para tabelas `_`-prefixadas é 0 porque as três que existiram (`_f8_backup_matriz_compras`, `_f7k_backup_modelo`, `_f18_backup_pendencia`) foram todas dropadas (migrations 0039/0058). Isso significa que uma mutação que CRIASSE uma tabela nova `_scratch` sem RLS **não seria pega por nenhuma das 4 asserções deste arquivo** — é exatamente o buraco que a isenção deixa aberto e que a asserção 3 (views) não tem, porque não filtra por nome. Vale como mutação-fantasma: interessante de mencionar, mas não é candidata a "derrubar" um rótulo existente — é a lacuna que o F47 fecha ao remover a isenção.

## mutacoes

[
 {
  "id": "rls-desligada-tabela-nao-prefixada",
  "roteiro": "seguranca_catalogo.sql",
  "derruba": [
   "2"
  ],
  "porque": "imita alguém criar/alterar uma tabela nova em public e esquecer `enable row level security` — a classe de defeito mais comum de review incompleto de migration",
  "sql": "alter table public.motivos disable row level security;",
  "prova": "select relrowsecurity from pg_class where oid = 'public.motivos'::regclass; -- esperado: false",
  "risco": "nenhum — motivos não é `_`-prefixada, então a isenção da linha 75 não a protege; flip direto e determinístico. Reverter com `alter table public.motivos enable row level security;` depois da checagem."
 },
 {
  "id": "view-perde-security-invoker",
  "roteiro": "seguranca_catalogo.sql",
  "derruba": [
   "3"
  ],
  "porque": "imita esquecer `with (security_invoker = true)` ao recriar uma view — a view volta a rodar com o privilégio do DONO e fura a RLS das tabelas de base (R-ACC-10)",
  "sql": "alter view public.v_estoque_atual set (security_invoker = false);",
  "prova": "select coalesce(array_to_string(reloptions, ','), '') like '%security_invoker=true%' from pg_class where oid = 'public.v_estoque_atual'::regclass; -- esperado: false",
  "risco": "baixo — v_estoque_atual não tem isenção alguma na asserção 3, único cuidado é reverter com `alter view public.v_estoque_atual set (security_invoker = true);` no mesmo teste."
 },
 {
  "id": "grant-execute-gatilho-authenticated",
  "roteiro": "seguranca_catalogo.sql",
  "derruba": [
   "4"
  ],
  "porque": "imita a 0038 nunca ter existido / ser revertida sem querer — expõe uma função-gatilho SECURITY DEFINER como RPC chamável via /rest/v1/rpc/* pela anon key",
  "sql": "grant execute on function public.aplicar_movimentacao() to authenticated;",
  "prova": "select has_function_privilege('authenticated', 'public.aplicar_movimentacao()'::regprocedure, 'execute'); -- esperado: true",
  "risco": "nenhum funcional — mas como o laço testa DUAS funções (aplicar_movimentacao, handle_new_user) sob o mesmo rótulo '4', o injetor não distingue QUAL das duas foi mutada olhando só a saída do roteiro; a distinção exige a prova (catálogo) apontada acima."
 },
 {
  "id": "valida-lancamento-item-vira-definer",
  "roteiro": "seguranca_catalogo.sql",
  "derruba": [
   "4c"
  ],
  "porque": "imita alguém reescrever valida_lancamento_item() e marcar SECURITY DEFINER 'por segurança', sem perceber que isso muda a premissa que justifica NÃO revogar seu EXECUTE (comentário das linhas 15-23)",
  "sql": "alter function public.valida_lancamento_item() security definer;",
  "prova": "select prosecdef from pg_proc where oid = 'public.valida_lancamento_item()'::regprocedure; -- esperado: true",
  "risco": "nenhum — troca só o flag prosecdef, não o corpo; reverter com `alter function public.valida_lancamento_item() security invoker;`. É a MENOS ambígua das 4/4c porque tem laço próprio (sem concorrência de rótulo)."
 },
 {
  "id": "grant-rpc-escrita-para-anon",
  "roteiro": "seguranca_catalogo.sql",
  "derruba": [
   "1"
  ],
  "porque": "imita esquecer de restringir uma RPC nova de escrita a authenticated-only — o fix da migration 0055 sendo desfeito",
  "sql": "grant execute on function public.criar_compra_lote(jsonb, uuid) to anon;",
  "prova": "select has_function_privilege('anon', 'public.criar_compra_lote(jsonb, uuid)'::regprocedure, 'execute'); -- esperado: true",
  "risco": "o laço testa 3 RPCs sob o mesmo rótulo '1' — mesma ambiguidade da mutação de assertion 4: a saída do roteiro não diz qual das três; usar a prova para confirmar o alvo certo antes de reverter."
 },
 {
  "id": "grant-existe-outro-admin-ativo-authenticated",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "5e"
  ],
  "porque": "imita um GRANT distraído devolvendo a authenticated uma auxiliar interna que a migration 0078 tirou de propósito da API pública (0078 revoga precisamente porque são chamadas só de DENTRO das RPCs de gestão)",
  "sql": "grant execute on function public.existe_outro_admin_ativo(uuid) to authenticated;",
  "prova": "select has_function_privilege('authenticated', 'public.existe_outro_admin_ativo(uuid)'::regprocedure, 'execute'); -- esperado: true",
  "risco": "assertion 5e testa DUAS funções na mesma condição `and`; qualquer uma das duas isoladamente já derruba '5e' — ver a mutação irmã abaixo, que produz o MESMO rótulo por um GRANT diferente."
 },
 {
  "id": "grant-exigir-gestao-de-authenticated",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "5e"
  ],
  "porque": "mesma classe de defeito da mutação anterior, na outra auxiliar (`exigir_gestao_de`) — a guarda comum das 5 RPCs de gestão exposta como RPC pública",
  "sql": "grant execute on function public.exigir_gestao_de(uuid, public.papel_usuario) to authenticated;",
  "prova": "select has_function_privilege('authenticated', 'public.exigir_gestao_de(uuid, public.papel_usuario)'::regprocedure, 'execute'); -- esperado: true",
  "risco": "indistinguível da mutação anterior olhando só o roteiro (mesmo rótulo '5e') — o injetor só sabe qual GRANT realmente aplicou pela sua própria prova de catálogo, não pela saída psql. Não rode as duas ao mesmo tempo se quiser atribuição 1:1 entre mutação e causa."
 },
 {
  "id": "encerrar-sessoes-e-admin-no-lugar-de-e-dev",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "2f"
  ],
  "porque": "imita 'relaxar' a ação mais barulhenta (encerrar sessões) achando que nível administrador basta, esquecendo que o §3 da ordem F22 a lista como privativa do dev",
  "sql": "Assinatura: public.encerrar_sessoes_usuario(p_alvo uuid) (migration 0074, linhas 362-382). Trocar SÓ o trecho `if not public.e_dev() then raise exception 'Só um desenvolvedor pode encerrar as sessões de um usuário.'` por `if not public.e_admin() then` (mesma mensagem/errcode) — CREATE OR REPLACE FUNCTION com o corpo idêntico ao da migration, só essa linha alterada.",
  "prova": "select pg_get_functiondef('public.encerrar_sessoes_usuario(uuid)'::regprocedure) ~ 'if not public\\.e_admin\\(\\) then'; -- esperado: true",
  "risco": "isolado de propósito: como o alvo (k_operador) NÃO é dev, a guarda comum exigir_gestao_de já deixa passar um admin (só cobra e_dev() quando alvo=dev OU papel pedido=dev); é ESTE checkpoint interno, redundante só no caso alvo-dev, que protege o caso alvo-não-dev. Fácil de esquecer numa revisão que só olha exigir_gestao_de."
 },
 {
  "id": "apagar-usuario-e-admin-no-lugar-de-e-dev",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "2f-bis"
  ],
  "porque": "mesma classe da mutação anterior, na RPC mais destrutiva (apagar_usuario) — 'apagar é privativo do dev, mesmo quando o alvo não é dev' (comentário da migration 0074, linha 306)",
  "sql": "Assinatura: public.apagar_usuario(p_alvo uuid) (migration 0074, linhas 294-339). Trocar SÓ `if not public.e_dev() then raise exception 'Só um desenvolvedor pode apagar uma conta de usuário.'` por `if not public.e_admin() then`.",
  "prova": "select pg_get_functiondef('public.apagar_usuario(uuid)'::regprocedure) ~ 'if not public\\.e_admin\\(\\) then'; -- esperado: true",
  "risco": "não derruba 2d (admin apagando um DEV) porque ali o alvo É dev e exigir_gestao_de já bloqueia antes de chegar neste checkpoint — só o caso alvo-comum (2f-bis) fica exposto. Se o revisor testar só com alvo dev, a mutação passa despercebida."
 },
 {
  "id": "exigir-gestao-de-e-admin-no-lugar-de-e-dev",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "2a",
   "2b",
   "2c",
   "2e"
  ],
  "porque": "imita enfraquecer a GUARDA COMUM das 5 RPCs de gestão — o núcleo da hierarquia dev⊃admin, onde alvo=dev OU papel pedido=dev deveria exigir e_dev()",
  "sql": "Assinatura: public.exigir_gestao_de(p_alvo uuid, p_papel_pedido public.papel_usuario default null) (migration 0074, linhas 72-112). Dentro de `if v_toca_dev then`, trocar `if not public.e_dev() then raise exception 'Só um desenvolvedor pode gerir o cargo Desenvolvedor.'` por `if not public.e_admin() then` (o ramo `else`/`e_admin()` do caso não-dev permanece intocado).",
  "prova": "select pg_get_functiondef('public.exigir_gestao_de(uuid, public.papel_usuario)'::regprocedure) ~ 'if not public\\.e_admin\\(\\) then\\s+raise exception ''Só um desenvolvedor pode gerir'; -- esperado: true",
  "risco": "blast radius amplo por design — derruba 4 rótulos de uma vez (2a promover a dev, 2b rebaixar dev, 2c desativar dev, 2e mexer vínculo de dev), mas NÃO 2d nem 2f/2f-bis, porque apagar_usuario e encerrar_sessoes_usuario têm checkpoint e_dev() PRÓPRIO redundante (ver as duas mutações acima) que sobrevive mesmo com esta guarda comum enfraquecida. Um injetor que espere derrubar TUDO da seção 2 com esta única mutação vai se surpreender com 2d/2f/2f-bis continuando verdes."
 },
 {
  "id": "trigger-libera-conceder-dev-por-update",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "2h"
  ],
  "porque": "imita afrouxar o trigger profiles_guarda_dev removendo o ramo que barra promover ALGUÉM a dev por UPDATE direto fora do caminho oficial — o caminho que o service role usa e que RLS não alcança",
  "sql": "Assinatura: public.profiles_guarda_dev() returns trigger (migration 0073, linhas 161-214). Remover inteiro o bloco `if new.papel = 'dev' and old.papel is distinct from new.papel then raise exception 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.' using errcode = '42501'; end if;` (linhas 207-210) — o resto da função (ramo DELETE e ramo 'old.papel=dev' do UPDATE) fica intacto.",
  "prova": "select position('old.papel is distinct from new.papel' in pg_get_functiondef('public.profiles_guarda_dev()'::regprocedure)) = 0; -- esperado: true (bloco removido)",
  "risco": "não afeta 3a (dev concedendo dev via RPC), porque a RPC abre a janela oficial (v_oficial=true) e o trigger deixa passar de qualquer forma nesse caminho — só o caminho DIRETO (service role/request forjado) fica exposto, que é justamente o que a asserção 2h mede."
 },
 {
  "id": "trigger-libera-desativar-dev-direto",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "2i-bis"
  ],
  "porque": "imita um refactor do trigger que 'simplifica' a lista de campos vigiados e esquece um deles — aqui, ativo",
  "sql": "Assinatura: public.profiles_guarda_dev() (migration 0073). Dentro do ramo UPDATE, na condição `if old.papel = 'dev' and (new.papel is distinct from old.papel or new.ativo is distinct from old.ativo or new.excluido_em is distinct from old.excluido_em) then`, remover a cláusula `or new.ativo is distinct from old.ativo` (linha ~200-202).",
  "prova": "select position('new.ativo is distinct from old.ativo' in pg_get_functiondef('public.profiles_guarda_dev()'::regprocedure)) = 0; -- esperado: true",
  "risco": "não afeta 2c (admin desativando dev via RPC), que já é bloqueado antes, em exigir_gestao_de (não mutada neste caso) — só o caminho direto de service role (2i-bis) fica exposto, exatamente o par 'defesa em profundidade que só se prova sem a camada de cima'."
 },
 {
  "id": "trigger-libera-apagar-linha-dev",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "2j"
  ],
  "porque": "imita remover a proteção contra DELETE físico de uma linha dev (diferente de 'apagar usuário' do produto, que arquiva) — a única coisa que impede um script de manutenção mal escrito de destruir a linha e junto a autoria",
  "sql": "Assinatura: public.profiles_guarda_dev() (migration 0073). Dentro de `if tg_op = 'DELETE' then`, remover o bloco `if old.papel = 'dev' then raise exception 'Só um desenvolvedor pode apagar o perfil de um desenvolvedor.' using errcode = '42501'; end if;` (linhas 179-182), mantendo só `return old;`.",
  "prova": "select position('Só um desenvolvedor pode apagar o perfil de um desenvolvedor' in pg_get_functiondef('public.profiles_guarda_dev()'::regprocedure)) = 0; -- esperado: true",
  "risco": "não confundir com 6f (linha 642-648), que apaga a conta em auth.users — tabela DIFERENTE, sem relação com este trigger (que é só em public.profiles); os dois usam a palavra 'apagar' mas testam caminhos opostos (6f espera SUCESSO, esta mutação faz 2j indevidamente ter sucesso também)."
 },
 {
  "id": "existe-outro-admin-ativo-nao-conta-dev",
  "roteiro": "cargo_dev.sql",
  "derruba": [
   "5d"
  ],
  "porque": "imita a decisão registrada em docs/DECISOES.md (dev conta como nível administrador na trava do último admin) sendo revertida sem querer num refactor da função",
  "sql": "Assinatura: public.existe_outro_admin_ativo(p_excluindo uuid) (migration 0074, linhas 126-141). Trocar `where p.papel in ('dev', 'admin')` por `where p.papel = 'admin'`.",
  "prova": "select pg_get_functiondef('public.existe_outro_admin_ativo(uuid)'::regprocedure) ~ q'{papel in \\('dev', 'admin'\\)}'; -- esperado: false (a lista de dois valores sumiu)",
  "risco": "a prova é sensível a formatação exata (aspas/ordem 'dev','admin') gerada por pg_get_functiondef — mais frágil que as demais provas baseadas em GRANT/booleano puro; preferir checar o RESULTADO comportamental da função com fixtures reais (como a própria asserção 5d faz dentro do roteiro) em vez de regex sobre o texto da função, se o injetor tiver esse recurso."
 }
]
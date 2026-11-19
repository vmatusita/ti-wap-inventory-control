# F68 — A porta pública por empresa (o visualizador por senha sem service role)

Ordem de serviço da fase **F68** do `PLANO-MULTIEMPRESA.md` (§7). É a primeira das duas em que a decisão 19/11-1 do
Johnny dividiu a ficha F68 original:
- **F68** (esta): a porta — a senha conferida pelo banco, a sessão do visualizador no banco, a rota por empresa e os
  relatórios GERADOS servidos pela porta, sem service role e sem nome de pessoa;
- **F68B** (a próxima): o relatório AO VIVO servido pela mesma porta.

Hoje, quem entra por senha de visualização recebe o client administrativo:
- `resolverAcessoRelatorio()` devolve `createAdminClient()` no ramo do visualizador (service role, `rolbypassrls`). As
  quatro defesas da virada (RLS por membership, FK composta, roteiro de isolamento, guarda nas RPCs) não alcançam esse
  caminho. O tripwire do repositório diz isso com todas as letras: *"para o viewer, o RLS NÃO é a segunda linha; o único
  muro é o próprio CÓDIGO das queries de relatório"*;
- `entrarComSenha` confere a senha digitada contra TODAS as senhas ativas do sistema, em laço, com saída antecipada;
- o cookie carrega o `senha_id` legível (base64), e é ele que vale como portador.

Com uma empresa só, isso é decisão defensável. Com duas, uma senha válida abre o relatório de qualquer empresa trocando
o slug na URL, e o único muro é um programador não esquecer um filtro.

Esta fase entrega:
- **duas funções `security definer`, as únicas de toda a base executáveis por `anon`**: `relatorio_publico_abrir`
  (confere a senha DENTRO do banco e abre uma sessão) e `relatorio_publico_dados` (serve o que a sessão pode ver). Nenhum
  outro papel as executa;
- **a senha conferida pelo Postgres** (bcrypt do `pgcrypto`). As 5 senhas de hoje (scrypt) deixam de abrir no corte, e o
  Johnny cria as novas pela tela (decisão 19/11-3);
- **a sessão do visualizador no banco**: um token opaco, guardado só como hash, que vale 24 h, morre com a senha
  revogada e nunca é o `senha_id`;
- **a entrada por empresa**: `/r/<slug-da-empresa>/relatorios/...`, com 308 dos endereços antigos. As cinco recusas
  (sem senha, senha errada, senha revogada, slug inexistente, senha de A no slug de B) têm a mesma cara e o mesmo
  trabalho; o contador de tentativas passa a ser por empresa e origem;
- **os relatórios gerados pela porta, sem nome de pessoa** (decisão 19/11-2): a resposta é montada por LISTA BRANCA de
  campos, dentro do banco, inclusive para os snapshots antigos que já congelaram nomes;
- **a senha pertence a uma empresa no banco e no tipo**: criar, conferir e revogar passam por funções por empresa, e a
  trilha grava a empresa DA SENHA;
- **as travas**: `isolamento_viewer.sql` (que só passa a ser testável depois desta fase), o par de asserções de catálogo
  das duas exceções de `anon`, e o `fronteira-viewer.test.ts` reescrito para a superfície nova;
- **a ficha F68 reescrita e a ficha F68B escrita**, com os números medidos.

Três condições não se negociam:
- **O service role sai da porta inteira.** Nenhum passo do visualizador (entrar, conferir a sessão, ler, sair) cria
  client administrativo nem client de sessão. A porta fala SÓ pelas duas funções, como `anon`, por um client que não lê
  cookie nenhum.
- **Nenhum nome de pessoa sai pela porta.** Nem colaborador, nem setor, nem autor de anotação, nem quem gerou o
  relatório. Os campos que podem sair estão numa lista branca única, travada entre o TS e o SQL.
- **Nada muda para o operador logado.** `/relatorios/**` do operador fica idêntico (ao vivo e gerados, com nomes, pela
  RLS). Nenhuma policy muda (md5 byte a byte). O smoke, o conferidor e as 13 checagens ficam iguais, com os números do
  #84 travados.

**As decisões do Johnny.**

De 19/11/2026, na conversa que gerou esta ordem:
1. **(19/11-1) Duas fases.** A pergunta foi o que o gestor por senha vê pela porta nova, com a medição de que o ao vivo
   tem ~25 leituras que teriam de ser refeitas em SQL dentro da porta, sob o `statement_timeout` de 3 s do `anon` (fatos
   14 e 21). A escolha: **F68** = a porta, a senha no banco, a rota por empresa e os GERADOS; **F68B** = o ao vivo pela
   porta. Entre as duas, o gestor vê só os gerados; o endereço do ao vivo mostra um aviso com o link para eles.
2. **(19/11-2) Sem nomes, como a ficha.** A porta não monta nem devolve nome de pessoa, nem dos gerados antigos. O
   operador logado continua vendo tudo.
3. **(19/11-3) O banco confere a senha.** Bcrypt do `pgcrypto` (já instalado em produção, fato 16), conferido dentro de
   `relatorio_publico_abrir`. As 5 senhas atuais (scrypt, sem uso desde 27/08) deixam de abrir no corte; o Johnny cria
   as novas na tela Senhas e as repassa aos gestores.

Herdadas, e aplicadas a esta fase por coerência (estão nas suposições do guia):
- **(13/11-1) "dev sou só eu"**: a plataforma é o Johnny;
- **(13/11-2) expandir e contrair, zero janela**: aqui, as peças novas entram antes do deploy (expansão) e as velhas
  (`registrar_tentativa_senha`, `senha_tentativas`) só saem quando ninguém mais as chamar — na abertura da F68B;
- **(13/11-3) o #84 travado**: os números das 13 checagens são remedidos no começo e não podem subir;
- **F67, a regra da empresa**: a da OPERAÇÃO (`empresaDaOperacao()`) quando a operação não tem de onde tirá-la, até a
  F70 trazer a da sessão. **F67, decisão 1**: a trilha grava a empresa ALVO — aqui, a DA SENHA.

---

## Estado de partida: os 25 fatos medidos (19/11/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje no disco e no git, e em PRODUÇÃO pelo conector da
> Supabase, só leitura: contagens, nomes e textos de esquema, configurações. Nenhum valor de linha. O ensaio recusou a
> conexão hoje (fato 4). Divergência da ficha está marcada com ⚠. **Remeça tudo antes de aceitar.**

**Onde o projeto parou**

1. `origin/main` em **`6fc9ee95`** (merge do PR #100, o pós-deploy da F67C); a tag anotada **`v1.75.0`** é a da F67C.
   `package.json` em `1.75.0`; árvore limpa.
   - Última migration: **`0207_contracao_default_filiais.sql`**, aplicada nos dois bancos (o ledger de produção tem 191
     linhas e termina em `contracao_default_filiais`). **A primeira desta fase é a `0208`.**
   - Versão: **`1.76.0`** (fase = MINOR, regra 8).
   - Checks obrigatórios da `main`: **`verificar`** e **`banco-sem-docker`**.
   - Produção `pbtjcalbmepmrqzprusb` (PG 17.6), ensaio `sgmvldiizsrjbxzzpmhh` (PG 17.11).
   - Produção hoje: **1** empresa, **6** filiais, **15** relatórios gerados.
2. **A rede de hoje** (`RELATORIO-F67C.md` §13):
   - mesa: 281 arquivos com 8.965 casos;
   - CI: 65 roteiros com 1.368 asserções;
   - injetor em **188**;
   - 117 funções em `public`, 70 `security definer` (39 executáveis por `authenticated`); 62 policies.
3. **As 13 checagens, hoje em produção**: `arquivo_termo_orfao` **3**, `backup_orfao` **12**, `conflito_entre_filiais`
   **59**, `detentor_em_estado_sem_dono` **1**, as outras nove em 0. São os números travados da F67C (o #84).
   - ⚠ **`checagens_integridade_nucleo()` devolve uma coluna `amostra` com VALORES REAIS** (patrimônios, nomes de
     arquivo). Selecione só `chave, total`. Nunca `select *`.
4. **O conector, hoje:** produção respondeu. O ensaio devolveu `connect ECONNREFUSED` duas vezes por volta das 08:40 de
   19/11, embora o `list_projects` o mostre `ACTIVE_HEALTHY`. O conector do Claude Code da máquina do Johnny é outro:
   confira na primeira hora da run.
5. **Advisors de segurança em produção, hoje:**
   - INFO `rls_enabled_no_policy`: **6** (`ambiente`, `backups_migration`, `empresas`, `plataforma_admins`,
     `senha_tentativas`, `senhas_acesso`);
   - WARN `authenticated_security_definer_function_executable`: **39**;
   - WARN `auth_leaked_password_protection`: **1**;
   - nenhum `anon_security_definer_function_executable`.

   Esta fase acrescenta, DECLARADOS: dois WARN de `anon` (as duas portas) e, para cada tabela nova deny-all, um INFO.

**A porta de hoje**

6. **O ramo do visualizador** (`src/lib/auth/acesso.ts`):
   - `getViewerSession()` (`:473`) confere o cookie e lê `senhas_acesso` com o client administrativo a cada request;
   - `resolverAcessoRelatorio()` (`:497`–`507`) devolve `createAdminClient()` ao visualizador;
   - o tripwire `src/lib/queries/relatorios/fronteira-viewer.test.ts` (605 linhas) declara **11 módulos de query** que o
     client do visualizador alcança, uma lista branca de **9 tabelas** e outra de **7 RPCs** (`rel_*_filiais`).
7. **`entrarComSenha`** (`src/lib/actions/senhas.ts:55`), tudo com o client administrativo:
   - o contador `registrar_tentativa_senha(p_ip)` (`0025`; executável SÓ por `service_role`; 5 tentativas por 60 s por
     IP; falha FECHADA desde a F64, R-ACC-95);
   - lê `id, hash` de TODAS as senhas ativas do sistema e confere por scrypt em laço, **com `break` no primeiro acerto**
     (o tempo depende da posição da senha);
   - grava `ultimo_uso`;
   - grava o cookie `wap_view` (`path: '/relatorios'`, 24 h), um envelope HMAC (`VIEW_SESSION_SECRET`) de
     `{sid: senha_id, exp}`. O corpo é base64 legível: **o `senha_id` é o portador**, e só o cookie impõe as 24 h;
   - destino padrão: `/relatorios/geral` (`destinoRelatorio`).
8. **`senhas_acesso`**: `id`, `rotulo`, `hash`, `ativa`, `criado_por`, `created_at`, `ultimo_uso`, `empresa_id` (not
   null, sem default desde a `0206`, FK simples para `empresas`). RLS ligada e zero policies (`0012`). CHECKs de
   `hash` ≤ 200 e `rotulo` ≤ 80 (`0184`). Só PK em `id`: **não há `unique (empresa_id, id)`**.
   - Em produção: **5 senhas, todas ativas, todas scrypt, todas da WAP. Último uso: 27/08/2026.** Nenhum uso nos
     últimos 30 dias.
9. **Ninguém lê `senhas_acesso.empresa_id`.** Só se escreve: `criarSenhaAcesso` grava a empresa da operação desde a
   F67C. A catraca da legada (`src/lib/auth/empresa-legada-catraca.test.ts:56`–`59`) dá a `senhas.ts` o destino *"F68 —
   a senha de visualização e a trilha dela são da empresa DA SENHA"*. `definirStatusSenha` grava a trilha com
   `empresaDaOperacao()` e o comentário `// F68: a da senha`.
10. **A gestão das senhas** (`senhas.ts`, as três atrás de `exigirAdmin`, todas com o client administrativo):
    - `criarSenhaAcesso`: `hashSenha` (scrypt no Node) + `insert`; devolve a URL `/relatorios/acesso`;
    - `testarSenhaAcesso`: lê o hash e confere por scrypt;
    - `definirStatusSenha`: `update ativa`.

    A LISTA das senhas é `listarSenhasAcesso` (`src/lib/queries/admin.ts:476`, client administrativo, nunca seleciona
    `hash`): é superfície da **F69**. `criarSenhaSchema` aceita senha de 8 a 200 caracteres. ⚠ **O bcrypt usa só os
    primeiros 72 BYTES**: duas senhas iguais nos primeiros 72 bytes abririam as duas.
11. **As rotas do visualizador** moram no grupo `(app)`, **as mesmas do operador**:
    - `/relatorios/acesso` (o formulário), `/relatorios/[filial]` (o ao vivo), `/relatorios/gerados`,
      `/relatorios/gerados/[id]`;
    - o ramo do visualizador em `src/app/(app)/layout.tsx:196` (o `ViewerHeader`);
    - o proxy (`src/lib/supabase/proxy.ts:148`–`170`) deixa passar `/relatorios/**` só pela PRESENÇA do cookie e manda o
      resto para `/relatorios/acesso?next=`; `redirectAcessoRelatorios` (`src/lib/auth/otp.ts:57`) monta o mesmo destino;
    - o ao vivo resolve o slug com `empresaDaOperacao()` (a Nota F67C → F68 da ficha).
12. **O smoke** (`scripts/smoke/smoke-prod.mjs`, tabela de rotas `:191`–`225`): `/relatorios/acesso` é pública;
    `/relatorios/geral` e `/relatorios/gerados` sem sessão redirecionam para ela. **Não há prova positiva da porta**: o
    smoke não tem credencial de visualizador.
13. **`empresas`** (`0152`): `slug` not null, único, com formato e uma lista de reservados que já inclui `r` e
    `relatorios` — o plano previu `/r/<slug>`. O slug da legada é `wap` (o INSERT de `0152:127`–`128`). A árvore
    `src/app/r/` não existe.

**O banco e o `anon`**

14. **`anon` tem `statement_timeout = 3s`** (`rolconfig`); `authenticated` 8 s; `service_role` nenhum; `authenticator`
    8 s. Uma `security definer` chamada por `anon` pelo PostgREST roda sob os 3 s do chamador (o PostgREST aplica as
    configurações do papel ao assumi-lo — confirme; um `set role anon` num bloco SQL NÃO as aplica, e a medição tem de
    pôr o teto à mão). Medido em `pg_stat_statements` como
    `authenticated`: `rel_estoque_asof_filiais` com máximo de **3.206 ms** (média 126 ms), `rel_saldo_itens_filiais`
    1.120 ms, `rel_contagem_status_filiais` 1.067 ms. É o problema da F68B; aqui ele só entra na ficha dela. Confirme na
    documentação do PostgREST se um `statement_timeout` posto na FUNÇÃO (`alter function … set`) é aplicado antes da
    chamada (as *function settings*), e meça.
15. **Hoje NENHUMA função de `public` é executável por `anon`** (0 de 117) e nenhuma policy cita `anon` ou `public` (0
    de 62). 33 das 38 relações de `public` têm SELECT concedido a `anon` (o grant padrão do Supabase), barrado pela RLS.
    **Não existe asserção de catálogo** dizendo "nenhuma função executável por `anon`": o `seguranca_catalogo.sql`
    (bloco 4) só confere duas funções-gatilho.
16. **`pgcrypto` 1.3 no schema `extensions`** em produção (`crypt`, `gen_salt('bf')`, `digest`, `gen_random_bytes`). ⚠
    **O Postgres do CI** (`postgres:17` com `supabase/ci/bootstrap-*.sql`) **não tem o schema `extensions` nem o
    `pgcrypto`**: decida onde nasce (decisão 17).
17. **Os logs de produção:** `log_parameter_max_length_on_error = 0`, `log_min_error_statement = error`, `log_statement
    = ddl`. Os parâmetros de uma chamada que falha não vão para o log. A senha em claro passará como ARGUMENTO de uma
    função pelo PostgREST: confirme na documentação o que o PostgREST, o `pg_stat_statements` e os logs da Supabase
    guardam de um argumento de RPC (decisão 21).
18. **`pg_stat_statements` (`track = top`)** registra 16 chamadas de `registrar_tentativa_senha` pelo `service_role`
    desde o último reset (09/07). É o instrumento da janela de contração (decisão 18).

**Os relatórios gerados**

19. **`relatorios_gerados` em produção: 15 linhas, todas `schema` 2, 8 consolidados, 14 com chave de pessoa** dentro de
    `dados`. Os campos de pessoa nos tipos (`src/lib/relatorios/tipos.ts`):
    - `LinhaSaida.colaboradorSetor`; `LinhaEntrada.colaborador` e `.setor`; `LinhaLancamentoItem.colaborador`;
      `AnotacaoManutencao.autor`; e `MovimentacaoRelatorio.colaborador_setor` (schema 1);
    - fora do `dados`: a lista (`LEITURA_LISTA_RELATORIOS_GERADOS`) e o detalhe trazem o AUTOR (`profiles.nome` de quem
      gerou), e a lista traz `observacao`;
    - texto LIVRE que pode conter nome digitado: `obs`, `obsEnvio`, `retornoObs`, `observacao` (de `ItemManutencao`), o
      `texto` da anotação, `chamado`;
    - ids internos: `ativoId` em várias linhas.
20. **As páginas de gerados** usam `listarRelatoriosGerados`, `vizinhosDoRelatorio` e `buscarRelatorioGerado`
    (`src/lib/queries/gerados.ts`), mais `listarFiliais` e `listarTiposItem`, todas com `acesso.client`.

**O que fica para a F68B**

21. **O ao vivo** (`getSnapshotRelatorioV2`, `src/lib/queries/relatorios/snapshot.ts`): 11 leituras em paralelo e 2
    depois, ~25 chamadas `.from()`/RPC espalhadas por `estoque.ts` (692 linhas), `movimentacoes.ts` (541), `itens.ts`
    (442), `comum.ts`, `recorte-filiais.ts`, mais as 7 `rel_*_filiais`. Sob os 3 s do `anon` (fato 14), não cabe numa
    função só sem medição. Esta fase só escreve a ficha F68B.

**O método**

22. **O método** (ADR-003 + `RUNBOOK-BANCO.md`):
    - `apply_migration` do MCP é UMA transação; o CI (`psql -f` sem `-1`) não é;
    - cabeçalho `-- classe:` (`ADITIVA`/`BACKFILL`/`DESTRUTIVA`) validado por `scripts/db/classificar-migration.mjs`;
      `db:lock` no mesmo commit; `DA_F38` e `RECRIACOES_AUTORIZADAS` (`src/lib/itens/migrations-f38.test.ts`) para
      função recriada; nome-sem-prefixo que não repete; `set lock_timeout = '2s'`/`reset`, sem `begin`/`commit`; a seção
      "`security definer` — três exigências"; o universo de `definer_sem_tenant.sql`;
    - **proibidos**: `supabase db push`, `migration repair`, `db reset --linked`, reescrever `schema_migrations`;
    - a MATRIZ vai até **R-ACC-143** (o próximo é o **R-ACC-144**); o `ADR-002` até o **§19** (o próximo é o **§20**); o
      RUNBOOK até o **Anexo F67C**;
    - rollbacks encadeados até `supabase/rollback/F67C-desfaz.sql`, ensaiado por `supabase/tests/f67c_rollback.sql`.
23. **A Skew Protection da Vercel está LIGADA**, com o teto não legível, tratado como 12 h (F67C, fato 28 medido).
    Projeto `prj_sUTqyUqhj7ZwGv8h5CAXMnpbU3fb`, time `team_3IrMo5TwpVmaniEKb3B0jbcs`. Durante 12 h depois do deploy, uma
    aba aberta antes dele pode chamar o código velho — que usa o service role e `registrar_tentativa_senha`. É por isso
    que as peças velhas só saem na F68B (decisão 18).
24. **⚠ A ficha F68 ficou para trás em cinco pontos:**
    - ela cita as migrations `0166`–`0168`: são a `0208` em diante;
    - `relatorio_publico_abrir(slug, senha, origem)` e "recebem o `senha_id` já verificado pelo servidor" se contradizem.
      Com a decisão 19/11-3, a senha é conferida DENTRO de `abrir`, e `dados` recebe a SESSÃO, nunca o `senha_id`;
    - "a rota antiga permanece atrás de flag" contradiz o "pronto quando" dela mesma (`resolverAcessoRelatorio` sem
      `createAdminClient` no ramo do visualizador). Decisão 13;
    - `p_com_pessoas` não existe: é uma ideia da ficha. A minimização é a lista branca da decisão 7;
    - `supabase/tests/isolamento_viewer.sql` não existe.
25. **As travas e registros que a rota nova vai tocar:**
    - `src/proxy.test.ts` (o mapa de rotas: `/relatorios/acesso` "a entrada por senha");
    - `src/lib/unidades/rotas.test.ts` (toda rota que lê `filial` chama `recusarFilialInexistente`);
    - o registro da ajuda (`/relatorios/acesso` isenta: "porta pública do visualizador");
    - `src/lib/layout/pendentes-da-regua.ts`;
    - `src/lib/supabase/superficie-admin.test.ts` (as entradas de `acesso.ts` e `senhas.ts`);
    - `rpc-unica-porta.test.ts` e os mapas de RPC (toda RPC passa por `chamarRpc`, com Zod);
    - a catraca da legada.

As regras do `CLAUDE.md` que pesam aqui: **1, 2, 3, 5, 6, 7 e 8**. A regra 6 pede a documentação oficial:
- **PG 17 / `pgcrypto`**: `crypt()` com `gen_salt('bf', n)` (o limite de 72 bytes, o custo por rodada),
  `gen_random_bytes`, `digest`; `statement_timeout` dentro de uma função; `security definer` com `search_path = ''`;
- **PostgREST**: como uma RPC é exposta a `anon`; as *function settings* (`statement_timeout`); o que fica registrado
  de um argumento; `request.headers` dentro da função;
- **Supabase**: a chave `anon` e o papel `anon`; os advisors `anon_security_definer_function_executable` e
  `rls_enabled_no_policy`;
- **Next 16**: redirect 308 no proxy; cookies com `path` por segmento.

---

## As frentes, e por que nesta ordem

- **A, o censo e o "antes".** Os 25 fatos remedidos; o `PLAN-F68.md`; a tabela-verdade da superfície do visualizador
  (cada passo de hoje × o passo novo × o client × a prova) e a das travas; e o "antes" nos dois bancos.
- **B, as travas, vermelhas.** A regra 4 da §4 do plano: trava antes da correção.
- **C, o banco.** Uma EXPANSÃO só: a sessão, o contador, as duas portas, as três funções de gestão por empresa. As peças
  velhas ficam de pé (o app velho e as abas da Skew Protection ainda as chamam) e saem na F68B.
- **D, o app.** O client público, a árvore `/r/**`, o proxy e os 308, a gestão das senhas, e a saída do ramo do
  visualizador de `(app)`.
- **E, os roteiros, o rollback e o injetor.** `isolamento_viewer.sql`, o catálogo das exceções de `anon`, a
  minimização provada, o rollback.
- **F, os documentos**, inclusive a ficha F68 reescrita e a ficha F68B nova.
- **G, o fechamento, com ordem rígida.** Versão → revisão adversarial → SHA congelado → CI verde → ensaio (apply e
  provas) → produção (apply e provas) → merge → deploy → conferência → Parte B → relatório → PR de documentação → tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F68 do `docs/PLANO-MULTIEMPRESA.md` (§7), na divisão da decisão 19/11-1 do Johnny: a porta pública por
empresa, com os relatórios GERADOS servidos por ela. O relatório ao vivo pela porta é a F68B. Ao terminar:
- o visualizador por senha não alcança client administrativo nem client de sessão em NENHUM passo (entrar, conferir a
  sessão, ler, sair). Ele fala só por duas funções `security definer` executáveis por `anon`:
  `relatorio_publico_abrir` e `relatorio_publico_dados`. Elas são as ÚNICAS de `public` executáveis por `anon`, não são
  executáveis por `public`, `authenticated` nem `service_role`, e o catálogo prova as duas metades (nenhuma outra; e
  essas duas lá);
- a senha é conferida DENTRO do banco (bcrypt do `pgcrypto`). As 5 senhas scrypt de hoje deixam de abrir por
  construção. As cinco recusas (sem senha, senha errada, senha revogada, slug inexistente, senha de A no slug de B)
  devolvem exatamente a mesma resposta e fazem o mesmo trabalho, medido. O contador de tentativas é por (empresa,
  origem), com teto por empresa, e o erro dele recusa;
- `abrir` devolve uma SESSÃO: um token opaco, guardado no banco só como hash, que vale 24 h e morre no request seguinte
  à revogação da senha. `dados` aceita só essa sessão, deriva a empresa dela POR DENTRO e recusa o slug de outra empresa
  (a diagonal);
- a entrada é `/r/<slug-da-empresa>/relatorios/acesso`; os gerados, `/r/<slug>/relatorios/gerados[/<id>]`; o endereço
  do ao vivo pela porta mostra um aviso com o link para os gerados (até a F68B). `/relatorios/**` sem operador responde
  308 para a porta da legada. Com operador, nada muda;
- nenhum nome de pessoa sai pela porta, nem dos snapshots antigos: a resposta de `dados` é montada por uma LISTA BRANCA
  de campos, com fonte única e trava TS↔SQL;
- criar, conferir e revogar uma senha passam por funções do banco por empresa; `senhas.ts` não cria client
  administrativo; a trilha grava a empresa DA SENHA;
- `isolamento_viewer.sql` verde, com o cabeçalho dizendo por que ele só passou a ser testável agora; o
  `fronteira-viewer.test.ts` reescrito para a superfície nova;
- **nada mudou para o operador**: as páginas de `/relatorios/**` dele iguais; todas as policies byte a byte; o smoke, o
  conferidor e as 13 checagens (com o #84 travado) iguais;
- a ficha F68 do plano reescrita com o escopo real, e a ficha F68B escrita.

Uma run, um PR de código e um PR de documentação com a tag. Versão `1.76.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1, §3 e §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 8, migration
    nunca se edita; a 10, a ORDEM de rollback);
  - a ficha **F68** inteira no §7. Ela é a FONTE DA VERDADE do objetivo e do "pronto quando", exceto onde esta ordem
    declara divergência medida (fato 24) e onde as decisões 19/11-1, 19/11-2 e 19/11-3 do Johnny a mudam;
  - a ficha **F67C** (as notas que mandou para cá) e as fichas **F69**, **F70**, **F71**, **F72** e **F73**, para saber
    o que NÃO antecipar;
  - `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md` §3.1: a origem do achado.
- `docs/prompts/F68-porta-publica-por-empresa-ultracode.md`: o cabeçalho, com os **25 fatos medidos** e as decisões do
  Johnny. Este prompt os cita pelo número.
- `CLAUDE.md`, `AGENTS.md`, e os aninhados `supabase/CLAUDE.md`, `scripts/db/CLAUDE.md` e `src/lib/auth/CLAUDE.md`. As
  regras permanentes 1, 2, 3, 5, 6, 7 e 8.
- **Os moldes:**
  - a **F67** (`docs/PLAN-F67.md`, `docs/RELATORIO-F67.md`): `security definer` por empresa, a doutrina de
    `definer_sem_tenant.sql`, as três exigências, expandir e contrair;
  - a **F67C** (`docs/PLAN-F67C.md`, `docs/RELATORIO-F67C.md`, `docs/f67c-evidencias/`): a tabela-verdade, a prova viva
    no ensaio, o relatório, a Skew Protection;
  - a **F64** (a ata, R-ACC-95): o contador que falha fechado;
  - a **F58** (a fronteira tipada: `chamarRpc`, `linhaDe`, Zod) e a **F50** (o porquê da lista branca no tripwire);
  - a **F55** (o smoke e a Parte B).

  Depois, o `RUNBOOK-BANCO.md` (as seções "`security definer`", "Rollback", os Anexos F67 a F67C), o `ADR-002` §13–19,
  o `ADR-003`, a `docs/MATRIZ-REGRAS.md` (R-ACC-31, R-ACC-95), o `docs/INVENTARIO-LEITURAS.md` e o
  `docs/INVENTARIO-CREDENCIAIS.md` (nomes e destinos de `VIEW_SESSION_SECRET` e da chave `anon`; **nunca o
  `.env.local`**).
- O código, nesta ordem:
  - as migrations `0005`, `0012`, `0025`, `0152`, `0163`, `0184`, `0185` e `0206`;
  - `src/lib/auth/acesso.ts`, `src/lib/auth/senha-sessao.ts`, `src/lib/auth/view-cookie.ts`, `src/lib/auth/otp.ts`,
    `src/lib/actions/senhas.ts`, `src/lib/validators/senha.ts`, `src/lib/supabase/{client,server,admin,proxy,rpc}.ts`,
    `src/proxy.ts`;
  - `src/app/(app)/layout.tsx`, `src/app/(app)/relatorios/**`, `src/components/relatorios/` (o `AcessoForm`, o
    `ViewerHeader`, o corpo dos gerados), `src/lib/queries/gerados.ts`, `src/lib/queries/formas/relatorios-gerados.ts`,
    `src/lib/relatorios/tipos.ts`;
  - as travas: `fronteira-viewer.test.ts`, `superficie-admin.test.ts`, `senhas.test.ts`, `senhas-rate-limit.test.ts`,
    `empresa-legada-catraca.test.ts`, `src/proxy.test.ts`, `unidades/rotas.test.ts`, o registro da ajuda,
    `pendentes-da-regua.ts`, `rpc-unica-porta.test.ts`;
  - os roteiros `supabase/tests/{seguranca_catalogo,catalogo_secdef,catalogo_policies,definer_sem_tenant,
    isolamento_tenant,f67c_rollback,_asserts}.sql` e `supabase/ci/bootstrap-*.sql`;
  - `scripts/smoke/smoke-prod.mjs`, `scripts/db/{classificar-migration,mutacoes,run-mutation-tests,corpo-vigente,
    diff-tipos}.mjs`, `scripts/formas/conferir.mts` e `.github/workflows/{ci,saude}.yml` (só leitura).

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 25 fatos, no cabeçalho desta ordem. Os de banco foram medidos em produção pelo conector do claude.ai, só contagem e
catálogo; o ensaio não respondeu (fato 4). Remeça cada um contra o disco e os dois bancos de hoje antes de agir. Onde a
sua medição contrariar o número escrito, **a sua medição ganha**, desde que vá para o relatório. Os que mais importam:
- **fato 1**: a primeira migration é a `0208`, e a versão é `1.76.0`;
- **fato 3**: as 13 checagens hoje, nos dois bancos, na primeira hora. Elas viram a linha travada. Só `chave, total`;
- **fato 4**: o conector alcança os dois bancos? Se não, veja "Bloqueios";
- **fatos 6, 7, 10 e 11**: TODO passo do visualizador e da gestão das senhas que cria client administrativo ou lê
  `senhas_acesso` — sem exceção;
- **fatos 14, 16 e 17**: o `statement_timeout` do `anon`, o `pgcrypto` nos dois ambientes e no CI, o que os logs guardam
  de um argumento;
- **fato 19**: todo campo de pessoa e todo texto livre do snapshot, nos dois schemas, e nos 15 gerados de produção (só
  contagem por chave, nunca valor).

## Comandos que já existem: use, não reinvente
- `npm run lint` · `npm run test` · `npm run typecheck` (= `npx tsc --noEmit`) · `npm run build` · `npm run contraste` ·
  `npm run verificar:actions`.
- `npm run db:lock`, obrigatório no commit de cada migration. `node scripts/db/classificar-migration.mjs` (e `--censo`).
- `npm run db:test`, `npm run db:test:mutations` e `npm run db:types:diff` precisam de Postgres e rodam no job
  `banco-sem-docker`. Na mesa, só se houver um Postgres 17 descartável que não seja nenhum dos dois bancos vivos. O CI é
  a autoridade.
- Na Frente G:
  - `node scripts/smoke/smoke-prod.mjs`;
  - `NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/formas/conferir.mts
    --alvo=ensaio|producao --saida=docs/f68-evidencias/…`;
  - a Parte B: `gh workflow run saude.yml -f alvo=producao -f partes=b`.
- O MCP da Supabase: `list_projects`, `execute_sql` (só leitura, salvo as exceções escritas aqui), `apply_migration`,
  `list_migrations`, `get_advisors` (segurança E performance), `get_logs`, `generate_typescript_types` e
  `get_publishable_keys` (a chave `anon` é pública por desenho; pegue-a daqui, nunca do `.env.local`).

**Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`. **Não rode** `supabase db push`, `migration
repair` nem `db reset --linked`. **Não suba** `next dev`/`next start` contra o ensaio. **Não chame** em PRODUÇÃO nenhuma
RPC que escreva: nem `relatorio_publico_abrir` (o contador e a sessão são escrita), nem as funções de gestão, nem as de
escrita, destrutivas, de conta ou de import.

# Escopo

## Dentro: sete frentes, nesta ordem

### Frente A: o censo e o "antes"
O primeiro entregável é `docs/PLAN-F68.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`. Ele
contém:
- **Os 25 fatos remedidos**, com cada divergência contra a ficha anotada.
- **A tabela-verdade da SUPERFÍCIE do visualizador**, uma linha por passo, sem linha sem destino:
  - os passos de hoje (o formulário, o contador, a conferência da senha, o `ultimo_uso`, o cookie, o proxy, o layout, a
    conferência da sessão, cada leitura das páginas de gerados e do ao vivo, o sair) × o client que usam;
  - o passo novo: qual das duas funções, ou "some" (o ao vivo até a F68B), ou "fica com o operador";
  - a prova (roteiro, teste de mesa, catálogo, smoke).
- **A tabela-verdade da GESTÃO das senhas**: criar, conferir, revogar/reativar, listar × o client de hoje × o novo × a
  empresa (de onde vem) × a prova. A lista fica com a F69, declarada.
- **A LISTA BRANCA dos campos** (decisão 7): cada campo de cada tipo do snapshot (schemas 1 e 2), da lista e do detalhe
  dos gerados, classificado em `sai` / `não sai`, com o motivo. Nenhum campo sem classe.
- **A tabela-verdade das TRAVAS**: o que cada uma exige hoje e depois (`fronteira-viewer.test.ts`,
  `superficie-admin.test.ts`, `senhas*.test.ts`, a catraca da legada, `proxy.test.ts`, `rotas.test.ts`, a ajuda, R-ACC-31
  e `k_sem_select`, o bloco 4 de `seguranca_catalogo.sql`, `definer_sem_tenant.sql`, o advisor).
- **O desenho**, com as decisões 1 a 23 de "Autonomia" tomadas por escrito.
- **A ordem das migrations**, e **A ORDEM DE ROLLBACK** (o inverso do apply), também no rodapé de cada migration.
- **O "antes", nos dois bancos**, pelo MCP, só leitura, em `docs/f68-evidencias/antes/`:
  - as funções executáveis por `anon` (0) e as policies que citam `anon`/`public` (0); os grants de SELECT a `anon`;
  - `rolconfig` de `anon`, `authenticated`, `service_role` e `authenticator`; as configurações de log do fato 17;
  - `pgcrypto` (versão e schema);
  - `senhas_acesso`: total, ativas, por formato de hash (`scrypt$` / `$2`), por empresa, o último uso por DIA — só
    contagem;
  - `relatorios_gerados`: total, por `schema`, quantos carregam cada chave de pessoa — só contagem;
  - o md5 de `qual`/`with_check` de TODAS as policies e do `prosrc` de TODAS as funções de `public`, com assinatura;
  - as 13 checagens (`chave, total`);
  - os advisors de segurança e de performance, contados por nível e nome;
  - as chamadas de `registrar_tentativa_senha` por papel em `pg_stat_statements` (o T0 da janela da F68B).

  Só contagem, nome de objeto de esquema, texto de esquema, configuração e hash.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f68-evidencias/B-travas/`. Fica vermelha no
PR em rascunho e verde no commit seguinte (o molde das F64 a F67C).
- **O catálogo das exceções de `anon`** (em `seguranca_catalogo.sql` ou `catalogo_secdef.sql` — decida), as duas
  metades:
  - o conjunto das funções de `public` executáveis por `anon` é EXATAMENTE a lista nominal de duas, com as assinaturas
    (universo contado);
  - as duas EXISTEM, são `security definer`, têm `search_path = ''` e NÃO são executáveis por `public`, `authenticated`
    nem `service_role`.

  Sem a segunda metade, bastaria alguém revogar a porta para a primeira passar por engano. E: nenhuma policy cita `anon`
  ou `public`; toda tabela nova desta fase está em `k_sem_select` com motivo e migration (R-ACC-31). Hoje reprova pela
  segunda metade (as duas não existem).
- **`supabase/tests/isolamento_viewer.sql`** (decisão 16), com o cabeçalho dizendo que ele **só passou a ser testável em
  SQL depois desta fase**: antes, com o service role na porta, cada passo seria um `✓` vazio dando falsa segurança. Hoje
  reprova (as funções não existem).
- **A fronteira da porta** (o `fronteira-viewer.test.ts` reescrito, decisão 14): a árvore pública (`src/app/r/**` e o
  que ela importa) não importa `supabase/admin`, `supabase/server` nem `queries/**`; só fala por `supabase/publico.ts`; e
  `publico.ts` só chama as duas funções. Hoje reprova (a árvore não existe; o ramo do visualizador usa o admin).
- **A lista branca, TS↔SQL** (decisão 7): a fonte única dos campos que saem é conferida contra os tipos de
  `src/lib/relatorios/tipos.ts` (todo campo classificado) e contra o corpo vigente de `relatorio_publico_dados` no disco.
  Hoje reprova.
- **A gestão por empresa**: um teste de mesa reprova `createAdminClient` em `senhas.ts`, e a catraca da legada reprova a
  trilha de revogar/reativar com a empresa da operação. Hoje reprova.
- **O contador**: a trava de fonte de `senhas.test.ts` e `senhas-rate-limit.test.ts` migram para o caminho novo (o erro
  do contador recusa antes de conferir qualquer senha — R-ACC-95 não afrouxa).

### Frente C: o banco (migrations `0208`+)
Migrations pequenas, na ordem de dependência. Cada uma leva:
- o cabeçalho de classe, validado pelo classificador;
- o rollback no rodapé;
- `db:lock` no mesmo commit; um nome-sem-prefixo que não repita;
- `set lock_timeout = '2s'`/`reset`, sem `begin`/`commit`;
- para toda `security definer`: `set search_path = ''`, nomes qualificados, `revoke all … from public, anon,
  authenticated, service_role` e o `grant` exato (as três exigências do RUNBOOK).

**Sem `update`/`delete`/backfill em tabela de negócio, sem tocar policy existente, sem `cascade`, sem DDL dinâmica, sem
tocar as 5 senhas de hoje.**

A proposta (a ordem final é sua, escrita):
1. **A base** (decisão 17): o `pgcrypto` em `extensions` garantido onde a decisão mandar; `unique (empresa_id, id)` em
   `senhas_acesso` (para a FK composta da sessão).
2. **A sessão** (decisões 1 e 2): a tabela deny-all das sessões do visualizador.
3. **O contador** (decisão 5): por (empresa, origem), com teto por empresa — tabela nova ou a evolução aditiva de
   `senha_tentativas` (decida; a velha continua servindo o app velho até a F68B).
4. **A gestão por empresa** (decisão 8): criar, conferir e definir o status de uma senha, `security definer` para
   `authenticated`, com a guarda de admin DA EMPRESA informada.
5. **As duas portas** (decisões 3 a 7): `relatorio_publico_abrir` e `relatorio_publico_dados`, com os grants da decisão
   e o comentário de catálogo dizendo por que são as únicas de `anon`.

A CONTRAÇÃO desta fase é nenhuma (decisão 18): `registrar_tentativa_senha` e `senha_tentativas` ficam de pé, sem
chamador novo, e caem na abertura da F68B.

### Frente D: o app
- **`src/lib/supabase/publico.ts`** (decisão 12): o client da porta, `server-only`, com a URL e a chave `anon`, que NÃO lê
  cookie nem sessão (`persistSession`, `autoRefreshToken` e `detectSessionInUrl` desligados). Se a página pública
  falasse pelo client de sessão, bastaria um operador estar logado no mesmo navegador para o papel virar `authenticated`
  e a chamada ser recusada — um bug que só aparece para quem tem conta.
- **A árvore `src/app/r/[empresa]/relatorios/`** (decisões 10 e 11): `acesso`, `gerados`, `gerados/[id]` e `[filial]`
  (o aviso até a F68B). Layout próprio, fora do `(app)`, com o cabeçalho do visualizador e o sair. As páginas pedem a
  `relatorio_publico_dados` e renderizam com os componentes de relatório que já existem, sem as colunas de pessoa.
- **A entrada** (`entrarComSenha` reescrito, ou uma action nova da porta — decida): chama `relatorio_publico_abrir` com o
  slug da ROTA, a senha e a origem; grava o cookie da sessão (decisão 1) com `path` da empresa; redireciona para um
  destino validado DENTRO da mesma empresa. A mensagem de recusa é UMA só.
- **O proxy e os 308** (decisão 10): sem operador, `/relatorios/**` → 308 para a porta da legada, com o `next`
  traduzido; `/r/**` público; o cookie velho `wap_view` ignorado e apagado. Com operador, nada muda.
- **A saída do ramo do visualizador de `(app)`** (decisão 13): `getViewerSession` some; `resolverAcessoRelatorio` deixa de
  ter o modo `viewer` (ou some, se as páginas do operador passarem a chamar `getOperador` direto — decida); o ramo do
  visualizador de `(app)/layout.tsx` some; `ViewerAutoRefresh` fica para a F68B (só o ao vivo o usa).
- **A gestão** (decisão 8): `criarSenhaAcesso`, `testarSenhaAcesso` e `definirStatusSenha` pelas funções do banco, com o
  client de SESSÃO; a URL devolvida passa a ser a da porta da empresa; o validador limita a senha pelos 72 bytes do
  bcrypt (decisão 3); a trilha grava a empresa DA SENHA (decisão 22).
- **A catraca da legada** e `superficie-admin.test.ts` atualizados no mesmo commit de cada mudança, com o destino escrito.

### Frente E: os roteiros, o rollback e o injetor
- **`isolamento_viewer.sql`** (decisão 16) e **o catálogo das exceções de `anon`** (Frente B).
- **O rollback**: `supabase/rollback/F68-desfaz.sql`, na ordem inversa, ensaiado por `supabase/tests/f68_rollback.sql`
  até a impressão do CI tirada antes da `0208`, com o irmão de mesa `rollback-f68.test.ts`. Os rollbacks F62 a F67C
  medidos no CI com a F68 no lugar. A declaração: depois do rollback, o app novo não funciona (as portas sumiram) — o
  rollback do banco vem com o revert do PR de código, nesta ordem: revert e deploy primeiro, `F68-desfaz.sql` depois.
- **O injetor** (decisão 19).
- **O smoke** (decisão 20): o mapa de rotas novo e a recusa de `dados` com um token inválido.

### Frente F: os documentos
- **A ficha F68, reescrita** no `PLANO-MULTIEMPRESA.md`: o escopo real (as duas portas, a senha no banco, a sessão, o
  contador, a rota, a lista branca, a gestão por empresa), os números medidos, as divergências declaradas (fato 24), a
  linha da tabela de fases e a entrega real.
- **A ficha F68B, nova**, logo depois: o ao vivo pela porta. Ela leva: o censo das ~25 leituras (fato 21); o
  `statement_timeout` do `anon` e os máximos medidos (fato 14), com o que a documentação do PostgREST disse sobre
  *function settings*; o desenho proposto (os blocos do ao vivo como pedidos FECHADOS de `relatorio_publico_dados`, os
  blocos com nome de pessoa NÃO computados, a prova de equivalência ao vivo do operador × ao vivo da porta, sem os nomes);
  a contração que esta fase deixou (decisão 18); o `ViewerAutoRefresh`; o "pronto quando"; a trava; a reversão. Também a
  linha nova na tabela de fases.
- **As notas** para a **F69** (a lista das senhas por empresa em `queries/admin.ts`; a conta de plataforma e a gestão de
  senhas de outra empresa), a **F70** (a empresa ESCOLHIDA ao criar a senha; o slug da sessão), a **F71** (as frases do
  `CLAUDE.md` da raiz que esta fase deixou velhas, só listadas — **este arquivo NÃO é editado aqui**) e a **F73** (o
  smoke positivo da porta com uma senha só do smoke; o WAF).
- **MATRIZ**: a emenda F68 a partir do R-ACC-144. Ela fixa: as duas exceções de `anon`, nominais e as únicas; a senha
  conferida pelo banco; a sessão no banco; as cinco recusas iguais; o contador por (empresa, origem) com teto por empresa;
  a diagonal; a lista branca; a gestão por empresa; a trilha com a empresa da senha. E o R-ACC-31 e o R-ACC-95 no que
  mudaram.
- **ADR e RUNBOOK**: o `ADR-002` ganha o §20 (a porta pública: por que duas funções e não RLS para `anon`; por que a
  sessão e não o `senha_id`; por que o banco confere a senha; o que o contador aguenta de quem chama a função direto). O
  `RUNBOOK-BANCO.md` ganha o **Anexo F68**: "abrir uma exceção de `anon`" (as três exigências + os grants + o par do
  catálogo + o advisor esperado) e "o que fazer se a porta precisar fechar" (o revoke de `anon` nas duas como trava de
  emergência, ensaiado).
- **Os `CLAUDE.md` aninhados** cujo contrato mudou (`src/lib/auth/CLAUDE.md`, `supabase/CLAUDE.md`). O da raiz, não
  (F71).
- **A ajuda**: o registro e o `PLANO-AJUDA.md` com a porta nova isenta; e o texto da ajuda do operador sobre senhas de
  acesso (o endereço novo; as senhas antigas que deixam de abrir), se ele existir.
- **`docs/INVENTARIO-CREDENCIAIS.md`**: o destino de `VIEW_SESSION_SECRET` (continua, muda de uso, ou sai — decisão 1) e
  da chave `anon` (agora no servidor também).
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`: as decisões do Johnny (19/11-1, 19/11-2, 19/11-3 e as herdadas que esta fase aplica) e
  as vinte e três da fase.

### Frente G: o fechamento, nesta ordem
1. `1.76.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real. Por exemplo:
   - a entrada dos gestores por senha passou a ter endereço próprio da empresa; os links antigos levam para lá;
   - as senhas de acesso criadas antes desta versão deixaram de funcionar: crie novas em Administração › Senhas;
   - pela senha, o gestor vê os relatórios gerados, sem nomes de pessoas; o relatório ao vivo pela senha volta numa
     próxima versão.

   Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F68.md`. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **No ENSAIO**, pelo `apply_migration` do MCP, com o `name` certo:
   - logo antes: o "antes" refeito;
   - as migrations, uma a uma. Depois de cada uma: o md5 de cada função nova = o do CI; as outras e todas as policies
     byte a byte;
   - depois: **a prova viva da porta** (decisão 15), o catálogo das duas exceções, o `notify pgrst`, os advisors (os dois
     WARN de `anon` e os INFO novos, declarados; nada além), as 13 checagens iguais e o conferidor (0 recusadas).

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com a correção em migration NOVA.
6. **Em PRODUÇÃO**, dentro de 24 h do commit das migrations, com as mesmas provas de catálogo, migration a migration.
   Depois da última:
   - `node scripts/smoke/smoke-prod.mjs` a partir da branch (o app no ar ainda é o velho: prova que o banco novo não o
     quebra; o mapa de rotas NOVO do smoke só vale depois do deploy — rode a versão de antes, ou o subconjunto que não
     depende da rota, e declare);
   - o conferidor contra PRODUÇÃO (a conta do smoke, só contagens) com 0 recusadas;
   - a chamada HTTP de `relatorio_publico_dados` com a chave `anon` e um token INVÁLIDO: a recusa, sem escrita (decisão
     20);
   - os advisors; as 13 checagens iguais; a paridade ensaio × produção do catálogo.

   Smoke, conferidor ou checagem reprovou? **Rollback imediato em produção**, antes do diagnóstico, sem merge, com o
   registro no topo do relatório.
7. Ata e `docs/RELATORIO-F68.md` com o que já dá para escrever. O PR sai do rascunho. Merge com os dois checks verdes,
   logo depois das provas.
8. **O deploy e a conferência, só leitura**:
   - `/api/saude` com `1.76.0` e o commit do merge;
   - o smoke com o mapa de rotas novo e 0 falha;
   - de novo a recusa de `dados` com token inválido, agora pelo app no ar (a página da porta com um cookie forjado →
     a mesma recusa da sessão inexistente);
   - as páginas do operador de `/relatorios/**` com a conta do smoke: iguais.
9. **A Parte B** do `saude.yml` disparada à mão:
   - a deriva sem pendente;
   - as 13 checagens **iguais aos números travados**;
   - qualquer número maior, ou achado novo, é bloqueio (ver "Bloqueios").

   Nenhuma captura de tela de produção.
10. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.76.0` vai no merge
    dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Das outras fases:**
  - o relatório AO VIVO pela porta, o `ViewerAutoRefresh` e a contração de `registrar_tentativa_senha`/
    `senha_tentativas` (**F68B**);
  - `profiles`, `membros`, `plataforma_admins`, `handle_new_user`, `queries/admin.ts` (inclusive `listarSenhasAcesso`) e
    a saída das contas dev de `membros` (**F69**);
  - a empresa da sessão, o seletor, a empresa ESCOLHIDA ao criar a senha (**F70**): aqui a criação usa
    `empresaDaOperacao()`, contada na catraca;
  - o `CLAUDE.md` da raiz (**F71**); o piso e a sua revogação (**F72**); o piloto, o WAF e a senha só do smoke
    (**F73**).
- **O que esta ordem acrescenta:**
  - tocar, revogar ou reescrever as 5 senhas de hoje (decisão 9): elas deixam de abrir por construção, e a revogação
    formal é do Johnny, pela tela;
  - as páginas e as queries do OPERADOR em `/relatorios/**` (só sai o ramo do visualizador);
  - qualquer policy existente (md5 byte a byte); RLS para `anon` em tabela de negócio (descartada: o porquê vai no
    `ADR-002` §20);
  - subdomínio por empresa (a ficha: o slug na rota basta, e a resolução fica num lugar só);
  - Storage, Realtime, os 3 `.docx` sem linha;
  - `update`/`delete`/backfill de negócio em banco vivo; editar migration aplicada; `cascade`; DDL dinâmica;
  - consertar os dados do #84, ou subir a linha de base do alarme ou do smoke (13/11-3);
  - afrouxar o classificador, a guarda de topo, a doutrina do predicado, os catálogos das F48 a F67C, R-ACC-95, ou pôr
    exceção nominal sem motivo;
  - `.github/workflows/**` e a proteção da `main`;
  - dependência nova (nada de lib de hash: o bcrypt é o do `pgcrypto`, no banco), `.env*`, `scratchpad/`, os PRs do
    dependabot, o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F68.md` tem: os 25 fatos remedidos; as tabelas-verdade da superfície, da gestão e das travas, sem linha sem
   destino; a lista branca com todo campo classificado; as vinte e três decisões; a ordem das migrations e a ORDEM DE
   ROLLBACK. Ele é anterior ao primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
3. O "antes" existe nos dois bancos, tirado antes de qualquer apply. Só números, nomes e textos de esquema,
   configurações e hashes.
4. As migrations começam na `0208`, com cabeçalho de classe validado, rollback no rodapé e `db:lock` no mesmo commit.
   Não há `update`/`delete`/backfill de negócio, policy existente tocada, `cascade`, DDL dinâmica nem nome-sem-prefixo
   repetido. As 5 senhas de hoje estão intocadas (o mesmo md5 da linha antes e depois, contado).
5. **As duas exceções de `anon`**: as únicas funções de `public` executáveis por `anon`, nos dois bancos; não executáveis
   por `public`, `authenticated` nem `service_role`; `security definer` com `search_path = ''`. O par do catálogo nasceu
   vermelho e sabe ficar vermelho (sabotagem A).
6. **A senha no banco**: só hash bcrypt abre; scrypt nunca abre; senha acima de 72 bytes é recusada na criação (ou
   pré-hasheada, decisão 3); senha repetida na mesma empresa é recusada na criação.
7. **As cinco recusas** devolvem a MESMA resposta, byte a byte, e o tempo delas é indistinguível pela régua medida e
   escrita (decisão 4), com a medição em `docs/f68-evidencias/`.
8. **A sessão**: token opaco guardado só como hash; vence em 24 h no banco (não só no cookie); morre no request seguinte
   à revogação da senha; o `senha_id` não aparece no cookie nem na resposta.
9. **A diagonal**: a sessão de A com o slug de B é recusada por `dados`, e a página responde 404 (não redirect).
10. **O contador**: por (empresa, origem), com teto por empresa; o erro dele recusa antes de conferir qualquer senha;
    quem chama a função direto com origens forjadas esbarra no teto por empresa (provado no CI).
11. **A minimização**: nenhuma chave de pessoa em nenhuma resposta da porta, inclusive dos 14 gerados de produção que as
    carregam (provado no CI com fixture e no ensaio/produção por contagem de chaves, nunca por valor); a lista branca tem
    fonte única e trava TS↔SQL.
12. **A gestão**: `senhas.ts` sem `createAdminClient`; criar, conferir e definir o status pelas funções por empresa, com a
    guarda de admin DA EMPRESA (admin de A não cria, não confere e não revoga em B — provado no CI); a trilha com a
    empresa da senha.
13. **A rota**: `/r/<slug>/relatorios/{acesso,gerados,gerados/<id>}` funcionam; `/r/<slug>/relatorios/<filial>` mostra o
    aviso com o link; `/r/<slug-inexistente>/…` dá 404; sem operador, `/relatorios/**` dá 308 para a porta da legada, com
    o `next` traduzido; com operador, `/relatorios/**` igual a antes. Provado pelo smoke depois do deploy e por
    `proxy.test.ts`.
14. **O ramo do visualizador saiu de `(app)`**: `getViewerSession` não existe; `resolverAcessoRelatorio` (se existir) não
    menciona `createAdminClient` nem o modo `viewer`; a árvore pública não importa `supabase/admin`, `supabase/server`
    nem `queries/**`; `publico.ts` só chama as duas funções.
15. **`isolamento_viewer.sql` verde**, com todos os casos da decisão 16.
16. **Nada mudou para o operador**: md5 de todas as policies igual; as funções fora da fase byte a byte; o smoke com 0
    falha; o conferidor com 0 recusadas no ensaio e em produção; as 13 checagens nos números travados.
17. Os advisors de segurança ganharam só o declarado (os dois WARN de `anon`, os INFO das tabelas deny-all novas). A
    paridade ensaio × produção do catálogo fecha.
18. O rollback está em `supabase/rollback/F68-desfaz.sql`, foi **ensaiado no Postgres do CI**, e a ordem (revert do app
    primeiro) está escrita. Os rollbacks F62 a F67C foram medidos com a F68 no lugar.
19. A decisão sobre o injetor está na ata. As mutações entraram e são detectadas pelo cenário nomeado. O teto está no
    número exato (188 → N), com o porquê datado, e a quarentena abaixo de ⅓.
20. `database.ts` mudou SÓ no que esta fase mudou (as funções e tabelas novas, e a `unique`), e `db:types:diff` está
    verde.
21. Os documentos estão feitos: a ficha F68 reescrita, a ficha F68B nova, as notas F69/F70/F71/F73, a MATRIZ (F68), o
    `ADR-002` §20, o `RUNBOOK-BANCO.md` (Anexo F68), os aninhados tocados, a ajuda, o inventário de credenciais, os
    índices e a ata.
22. Nenhuma dependência nova. Ficaram intocados `.github/workflows/**`, o `CLAUDE.md` da raiz, as policies, as páginas do
    operador, `queries/admin.ts` e as 5 senhas. Nenhum número de linha de base subiu.
23. `package.json` em `1.76.0`, e `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.76.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
24. As sabotagens A a K estão com saída real em `docs/f68-evidencias/`.
25. Nenhum dado real (nome, e-mail, id, patrimônio, rótulo de senha, hash, token, texto de linha, a `amostra` das
    checagens, uma senha — nem de fixture copiada de produção) em migration, teste, roteiro, evidência ou log. Da
    produção, só números, nomes de esquema, textos de esquema e hashes de catálogo. Ninguém abriu o `.env.local`.
26. `docs/RELATORIO-F68.md` segue o padrão F45 a F67C, com o roteiro do Johnny no topo, o estado de repouso e a seção "o
    que este relatório NÃO prova".

# Verificação: rode de verdade
A cada incremento, rode `npm run lint`, `npm run test` e `npm run typecheck`. Rode `npm run build` antes de cada push.
Tudo o que é SQL (roteiros, injetor, `db:types:diff`) passa pelo `banco-sem-docker` do PR. Leia a falha, corrija a
**causa raiz** e repita até passar.

Não faça nada disto para um teste passar:
- alargar exceção para caber um caso que devia reprovar (a lista de `anon` tem DOIS nomes, e só);
- trocar detecção por `skip`;
- afrouxar um catálogo, o classificador, a guarda de topo, R-ACC-95 ou a lista branca;
- subir a linha de base;
- mudar uma asserção existente sem a declaração no relatório (as de `/relatorios/acesso` do smoke e do `proxy.test.ts`
  mudam de sentido: declare cada uma);
- devolver o client administrativo "só para o visualizador", ou um grant a `authenticated`/`service_role` "só por
  enquanto".

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**A PORTA É DO BANCO. QUEM ENTRA POR SENHA SÓ ALCANÇA DUAS FUNÇÕES, E NENHUM NOME SAI POR ELAS.** As travas e o CI verdes
são o portão do apply no ensaio. O ensaio com a prova viva limpa é o portão do apply de produção. Produção com o
catálogo, o smoke e o conferidor limpos é o portão do merge. O smoke com o mapa novo depois do deploy é o portão do
fechamento.

Provas obrigatórias, cada uma com a saída real em `docs/f68-evidencias/`:
- **Sabotagem A, uma terceira porta.** Numa subtransação do CI: `grant execute` a `anon` numa função qualquer de `public`
  → a primeira metade do catálogo acusa pelo nome. `revoke execute` de `anon` numa das duas → a segunda metade acusa.
  `grant execute` a `authenticated` numa das duas → acusa.
- **Sabotagem B, a senha de A no slug de B.** As duas empresas com a MESMA senha em claro: cada uma abre só a sua; a de A
  no slug de B é recusada. Trocando, numa subtransação, a busca de candidatos para ignorar a empresa: o roteiro acusa.
- **Sabotagem C, a diagonal.** `dados` sem a conferência do slug contra a empresa da sessão: o roteiro acusa.
- **Sabotagem D, as cinco caras.** Uma recusa com texto ou forma diferente (ex.: "senha revogada"): o roteiro acusa. Um
  `abrir` que pula o trabalho do hash quando não há candidato: a medição de tempo (decisão 4) acusa.
- **Sabotagem E, o nome que vaza.** Uma chave de pessoa acrescentada à lista branca (no SQL ou no TS): a trava TS↔SQL e
  o roteiro de minimização acusam.
- **Sabotagem F, a sessão eterna.** `dados` ignorando o vencimento, ou a senha revogada: o roteiro acusa.
- **Sabotagem G, o contador.** O erro do contador ignorado, ou o teto por empresa removido (origens forjadas em laço): o
  roteiro e a trava de mesa acusam.
- **Sabotagem H, o service role de volta.** `createAdminClient` importado na árvore pública, ou em `senhas.ts`: a
  fronteira acusa. O client de sessão em `publico.ts`: acusa.
- **Sabotagem I, scrypt abrindo.** Uma linha com hash `scrypt$…` correspondente à senha digitada: não abre.
- **Sabotagem J, a gestão atravessando.** Admin de A criando, conferindo ou revogando senha de B: o roteiro acusa se a
  guarda for removida.
- **Sabotagem K, o rollback.** `F68-desfaz.sql` devolve o catálogo à impressão de antes da `0208`. Os rollbacks F62 a
  F67C com a F68 no lugar, com a saída real e a declaração.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI;
  - mutações e teto;
  - funções e `security definer` em `public`; executáveis por `anon` (0 → 2); o universo de `definer_sem_tenant`;
  - policies (md5, iguais);
  - advisors por nível e nome;
  - senhas por formato (5 scrypt → 5 scrypt, intocadas; bcrypt 0 → 0 em produção até o Johnny criar);
  - as 13 checagens;
  - o conferidor (pontos, linhas, recusadas) no ensaio e em produção;
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco, os bancos de hoje e a documentação oficial;
2. as decisões do Johnny abaixo;
3. a ficha da F68 no §7 do plano, menos as divergências que esta ordem declara;
4. este prompt, no que ele detalha;
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, a MATRIZ, o código existente, os moldes
   F67/F67C/F64/F58/F50/F55);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**As decisões do Johnny:**
- **19/11-1, duas fases**: esta faz a porta, a senha no banco, a rota por empresa e os GERADOS. O ao vivo pela porta é a
  F68B. Entre as duas, o endereço do ao vivo mostra um aviso com o link para os gerados.
- **19/11-2, sem nomes**: a porta não monta nem devolve nome de pessoa, nem dos gerados antigos. O operador logado vê
  tudo.
- **19/11-3, o banco confere**: bcrypt do `pgcrypto`, conferido dentro de `relatorio_publico_abrir`. As 5 senhas scrypt
  deixam de abrir no corte; o Johnny cria as novas pela tela.
- **Herdadas, aplicadas aqui**: 13/11-1 ("dev sou só eu"); 13/11-2 (expandir e contrair, zero janela — aqui, as peças
  velhas só saem na F68B); 13/11-3 (o #84 travado, nada de consertar dado); F67 (a empresa da operação até a F70; a
  trilha com a empresa ALVO, que aqui é a da senha).

**As vinte e três decisões que esta fase precisa tomar por escrito:**
1. **A credencial da sessão.** A proposta: um token aleatório gerado no banco (`gen_random_bytes`, ≥ 32 bytes), devolvido
   UMA vez por `abrir` e guardado só como hash (`digest` sha-256). O cookie carrega o token, com `path` da empresa,
   `httpOnly`, `secure` em produção, `sameSite: 'lax'`, 24 h. Decida se o token vai dentro do envelope HMAC de
   `VIEW_SESSION_SECRET` (defesa a mais, sem credencial nova) ou cru, e escreva o destino da variável no inventário.
   **Descartado, com o motivo na ata e no ADR §20**: o `senha_id` como portador. Ele é a senha em outra forma, legível no
   cookie, e vale enquanto a senha estiver ativa: um cookie copiado viraria acesso sem prazo, e as 24 h só existiriam no
   navegador.
2. **Onde a sessão mora.** A proposta: uma tabela deny-all nova (RLS ligada, zero policy, `revoke` de `anon` e
   `authenticated`), com `empresa_id`, `senha_id`, o hash do token, criada/vence/encerrada, FK composta `(empresa_id,
   senha_id)` → `senhas_acesso` (daí a `unique` do passo 1 da Frente C). Nenhum dado pessoal (nem a origem). Ela entra em
   `k_sem_select` com motivo e migration (R-ACC-31), e na classe que o catálogo pedir para tabela com `empresa_id`.
   Limpeza das vencidas dentro de `abrir`, limitada por chamada.
3. **O bcrypt.** Meça no ensaio o custo de `crypt()` com `gen_salt('bf', n)` e escolha `n` para o pior caso de `abrir`
   (decisão 4) caber com folga nos 3 s do `anon`. O limite de 72 bytes: o validador e a função de criação recusam senha
   acima de 72 bytes em UTF-8 (ou pré-hasheiam — decida, escreva, e prove que a escolha não aceita duas senhas diferentes
   como iguais). Senha repetida na MESMA empresa é recusada na criação (a criação confere a nova contra as ativas da
   empresa). Duas empresas com a mesma senha em claro coexistem.
4. **As cinco recusas com a mesma cara e o mesmo trabalho.** A MESMA resposta (o mesmo retorno de `abrir`, a mesma
   mensagem na tela) para: sem senha, senha errada, senha revogada, slug inexistente, senha de A no slug de B — e também
   para o contador estourado? Decida: a ficha só pede as cinco; o "muitas tentativas" hoje é mensagem própria (R-ACC-95
   escreve a do erro do contador). O mesmo TRABALHO: a função calcula o mesmo número de `crypt()` em todos os caminhos —
   proposta, sempre `K` (um teto de senhas ativas por empresa, imposto na criação), completando com um hash fictício
   quando há menos candidatos, e sem `break`. A régua de "indistinguível": meça no ensaio, n ≥ 30 por caminho, e escreva
   o critério (ex.: a mediana de cada caminho dentro de ±10% da mediana geral) ANTES de medir.
5. **O contador.** Duas réguas: por (empresa, origem) — proposta, as 5 por 60 s de hoje — e um teto por EMPRESA, somando
   todas as origens. **O porquê do teto por empresa**: a chave `anon` é pública, e quem chamar `abrir` direto pelo
   PostgREST escolhe a origem que quiser; sem o teto, a força bruta só pagaria o bcrypt. O custo: quem esgotar o teto de
   uma empresa tranca a porta dela por um minuto (escreva o número, o porquê, e o que o Johnny faz se acontecer).
   Investigue (documentação) se `request.headers` dentro da função traz o IP de quem chamou o PostgREST e se dá para
   usá-lo como terceira chave. Slug inexistente conta num balde único, para a tabela não crescer com slugs inventados.
   O erro do contador RECUSA antes de conferir qualquer senha (R-ACC-95, sem afrouxar).
6. **`relatorio_publico_dados`.** A proposta: `(p_sessao text, p_slug text, p_pedido text, p_args jsonb) returns jsonb`,
   com uma lista FECHADA de pedidos (`sessao`, `gerados`, `gerado`, `encerrar` — decida) e qualquer outro pedido = a
   mesma recusa. Por dentro: a sessão → a empresa; o slug confere com a empresa da sessão (a diagonal: divergiu, recusa,
   e a página dá 404); a senha ainda ativa; a sessão não vencida nem encerrada. Só `encerrar` escreve; os outros são
   leitura (e é por isso que dá para chamá-la em produção com um token inválido — decisão 20). O retorno passa pelo Zod
   no TS (a fronteira tipada da F58). A F68B acrescenta os pedidos do ao vivo; a lista fechada é o que mantém a função
   auditável por inteiro.
7. **A lista branca** (19/11-2). A proposta:
   - uma fonte única dos campos que SAEM, por seção do snapshot (schemas 1 e 2), da lista e do detalhe dos gerados, com
     trava TS↔SQL (o molde das travas TS↔SQL do projeto): todo campo dos tipos de `tipos.ts` está classificado, e o SQL
     monta a resposta só com os campos `sai`;
   - os campos estruturados de pessoa NÃO saem (fato 19), nem o autor do relatório, nem ids internos (`ativoId`);
   - o TEXTO LIVRE (`obs`, `obsEnvio`, `retornoObs`, `observacao`, o texto da anotação, `chamado`) — proposta: sai, porque
     é o conteúdo operacional do relatório, e fica declarado em "o que este relatório NÃO prova" (um operador pode ter
     digitado um nome ali). Decida e escreva;
   - a página renderiza sem as colunas de pessoa (não com a coluna vazia).
8. **A gestão por empresa.** A proposta: três `security definer` para `authenticated` — criar (`p_empresa, p_rotulo,
   p_senha`, devolve o id), conferir (`p_empresa, p_id, p_senha`, devolve só `confere`) e definir o status (`p_empresa,
   p_id, p_ativa`) —, cada uma com a guarda de admin DA EMPRESA informada (`e_admin_na`) e a linha da senha conferida
   contra `p_empresa` (o molde da F67 e de `definer_sem_tenant.sql`). As actions passam a usá-las com o client de SESSÃO;
   `senhas.ts` deixa de importar `createAdminClient`. Conferir uma senha scrypt responde "formato antigo — crie uma nova"
   sem conferir nada. A lista (`listarSenhasAcesso`) fica como está (F69).
9. **As 5 senhas de hoje** (19/11-3). A porta só confere hash bcrypt, então elas deixam de abrir no corte **por
   construção**. O agente NÃO as revoga nem as muda: a revogação formal (o "ativa = não" e a linha da trilha com o nome
   de quem revogou) é do Johnny, pela tela, no roteiro do relatório. Escreva no relatório quantas são e que todas são da
   legada (só contagem).
10. **A rota e os 308.** `src/app/r/[empresa]/relatorios/…`, fora do grupo `(app)`. O slug da rota é conferido na porta
    (inexistente → 404, pela mesma recusa). O proxy (Edge, sem banco): sem operador, `/relatorios/acesso` e
    `/relatorios/**` → **308** para `/r/<slug-da-legada>/relatorios/acesso`, com o `next` traduzido para a árvore nova
    quando houver equivalente (o ao vivo antigo → o aviso novo); com operador, nada muda. O slug da legada vira uma
    constante ESPELHO do INSERT da `0152`, com trava (o molde de `EMPRESA_LEGADA_ID` e `empresa-legada.test.ts`). O
    `next` só aceita caminho da MESMA empresa. O cookie velho `wap_view` não abre nada e é apagado.
11. **O layout público.** O cabeçalho do visualizador (o rótulo da senha, o nome da empresa, sair), sem nada do shell do
    operador; a régua de layout (`pendentes-da-regua.ts`) e o registro da ajuda (isenta) atualizados; o aviso do ao vivo
    em linguagem de operador ("o relatório ao vivo pela senha volta numa próxima versão; veja os gerados").
12. **`publico.ts`.** O client sem cookie (fato 6 e Frente D). A trava: a árvore pública só importa `publico.ts` para
    falar com o banco, e `publico.ts` só chama as duas funções (pela porta única `chamarRpc`, com o mapa de Zod).
13. **A rota antiga atrás de flag** (a ficha) é **descartada**, com o motivo na ata: ela manteria o service role vivo no
    código, o "pronto quando" da própria ficha (`resolverAcessoRelatorio` sem `createAdminClient`) viraria mentira, e ela
    depende das senhas scrypt que esta fase aposenta. A reversão passa a ser o revert do PR de código seguido de
    `F68-desfaz.sql` (Frente E), ensaiada.
14. **A fronteira reescrita** (`fronteira-viewer.test.ts`). A superfície do visualizador deixa de ser "11 módulos de
    query sob service role" e passa a ser "duas funções". A proposta, em duas metades:
    - mesa (TS): a árvore pública e o que ela importa, por LISTA BRANCA (falha em qualquer import de `supabase/admin`,
      `supabase/server` ou `queries/**`, e em qualquer RPC fora das duas);
    - mesa (SQL): o corpo vigente das duas funções no disco (`corpo-vigente.mjs`) só cita tabelas de uma lista branca com
      motivo (`senhas_acesso`, a sessão, o contador, `empresas`, `filiais`, `relatorios_gerados`, `tipos_item` —
      remeça); `profiles` e `colaboradores` nunca.

    A premissa velha ("o único muro é o código das queries") sai do arquivo, com a data.
15. **A prova viva no ENSAIO**, depois do apply: um bloco que termina em `raise`, que planta duas empresas fictícias (ou
    usa a legada fictícia e uma B fictícia) com senhas bcrypt de fixture, faz `set local role anon` e chama as duas
    funções (com `set local statement_timeout = '3s'`, o teto que o PostgREST daria ao `anon`): as cinco recusas
    iguais, a abertura, a diagonal, a revogação, a minimização (contagem de chaves de pessoa na resposta = 0), e a
    medição de tempo da decisão 4 (os tempos saem do bloco como número, no `raise`). Nada fica no
    ensaio. A chamada HTTP pelo PostgREST no ensaio, com a chave `anon` do `get_publishable_keys`: a recusa com token
    inválido e com senha errada (o contador do ensaio anda; declare). **Em produção, nenhum `abrir`.**
16. **`isolamento_viewer.sql`.** No mínimo: duas empresas com a MESMA senha em claro coexistem, e cada uma abre só a sua;
    a de A no slug de B é recusada; a sessão de A em `dados` com o slug de B é recusada; as cinco recusas com o mesmo
    retorno; a senha revogada mata a sessão na chamada seguinte; a sessão vencida e a encerrada são recusadas; hash
    scrypt nunca abre; nenhuma chave de pessoa em nenhuma resposta (percorrendo o jsonb), com fixture de gerado que TEM
    as chaves; o contador por (empresa, origem) e o teto por empresa com origens forjadas; a gestão por empresa (admin de
    A não cria, não confere, não revoga em B; quem não é admin não faz nada); e um pedido fora da lista fechada recusado.
17. **O `pgcrypto` no CI** (fato 16). A proposta: o bootstrap do CI (`supabase/ci/`) espelha o ambiente gerenciado
    (`create schema extensions` + `create extension pgcrypto with schema extensions`), e a primeira migration da fase
    CONFERE que `extensions.crypt` existe (e recusa com mensagem clara se não), sem criar extensão em produção. O teto de
    3 s do `anon` não chega aos roteiros por `rolconfig` (eles fazem `set role`, e o papel assumido assim não carrega as
    configurações dele): os casos que medem tempo põem `set local statement_timeout = '3s'` à mão, e o bootstrap espelha
    o `rolconfig` só para documentar o ambiente (declare as duas coisas). A alternativa
    (`create extension if not exists` na migration) só se o bootstrap não puder — e então escreva o que ela faz em
    produção (nada) e por quê.
18. **Expandir e contrair.** Esta fase só EXPANDE: nada que o app velho usa é derrubado. `registrar_tentativa_senha` e
    `senha_tentativas` ficam de pé, porque o deployment velho continua atendendo abas abertas por até 12 h (fato 23). A
    contração (o `drop` das duas, com a janela por `pg_stat_statements`: zero chamada pelo `service_role` depois do
    deploy, a partir do T0 do "antes") vai para a abertura da **F68B**, escrita na ficha dela. Assim a F68 não espera 12
    h e fecha no mesmo dia.
19. **O injetor**: uma mutação por classe de trava desta fase que nenhum teste de mesa já derruba. As candidatas: um
    grant a `authenticated` numa porta; o revoke de `anon` numa porta; a diagonal tirada de `dados`; a busca de
    candidatos sem a empresa; uma chave de pessoa na lista branca; o vencimento da sessão ignorado; a senha revogada
    aceita; o teto por empresa removido; a guarda de admin da empresa removida numa função de gestão. Teto novo exato
    (188 → N), ou a ata diz por que não entrou.
20. **O smoke** (`smoke-prod.mjs`): o mapa de rotas novo (`/relatorios/acesso` sem operador → 308; `/r/<slug>/relatorios/
    acesso` → 200; `/r/<slug>/relatorios/gerados` sem cookie → a entrada da MESMA empresa; `/r/<inexistente>/relatorios/
    acesso` → 404) e a chamada de `relatorio_publico_dados` com a chave `anon` e um token inválido → a recusa (leitura
    pura, sem escrita). **Não há prova positiva em produção**: não existe senha de visualização bcrypt lá até o Johnny
    criar, e uma senha só do smoke é da F73. A prova positiva é o CI, o ensaio (decisão 15) e o roteiro do Johnny.
21. **A senha em claro a caminho do banco** (fato 17). Confirme na documentação o que o PostgREST, o `pg_stat_statements`
    e os logs da Supabase guardam de um argumento de RPC, e escreva. `abrir` nunca lança erro com a senha no contexto
    (nem `raise` com o argumento, nem erro de cast sobre ele); a senha nunca é gravada, nem truncada, nem em log; o
    `registrarFalha` do TS nunca recebe o formulário.
22. **A trilha.** `senha_criada` com a empresa da senha criada (= a da operação até a F70); `senha_revogada`/
    `senha_reativada` com a empresa DA LINHA da senha, lida pela função de status (não `empresaDaOperacao()`). Nenhum
    evento de login (como hoje). A catraca da legada com o destino novo de `senhas.ts` (só a criação fica com a operação,
    destino F70).
23. **"Nada muda para o operador".** md5 de todas as policies e das funções fora da fase; o smoke; o conferidor; as 13
    checagens; e as páginas de `/relatorios/**` do operador: o diff delas é só a remoção do ramo do visualizador
    (declarado linha a linha no relatório).

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **O MCP da Supabase não está conectado, recusa o apply ou não autentica num dos bancos** (o ensaio recusou a conexão
  hoje, fato 4). Não procure token, não leia o Gerenciador de Credenciais, não abra o `.env.local`. Confira de novo
  algumas vezes ao longo da run.
  - Se só o ENSAIO falhar: **nada vai a produção** sem o ensaio antes. Entregue tudo o que não depende de banco vivo, com
    o PR ABERTO e **SEM merge**, e ponha no topo do relatório o caminho B: as migrations na ordem, as provas, o rollback.
  - Se os dois falharem: o mesmo.
- **O bcrypt não cabe nos 3 s** com o custo mínimo aceitável e o `K` da decisão 4: baixe `K` (o teto de senhas ativas
  por empresa), nunca o custo abaixo do que a documentação recomenda, e escreva. Se nem assim, confirme as *function
  settings* do PostgREST (fato 14) para um `statement_timeout` só nesta função. Não mude o `rolconfig` de `anon`.
- **Os números das checagens mudaram** (mais achados, achado maior, achado novo) depois da linha travada:
  - se foi a fase: rollback e bloqueio no topo;
  - se não foi (o dado de produção andou sozinho): registre os números (só número), não conserte nada, e declare na
    seção "o que este relatório NÃO prova".
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO de
  `supabase/rollback/F68-desfaz.sql` que o CI ensaiou. É a única exceção ao "`execute_sql` só leitura" além do bloco que
  termina em `raise` no ENSAIO (decisão 15). Se o app novo já estiver no ar, o revert do PR de código e o deploy vêm
  ANTES. Se o classificador barrar o rollback, não reformule: o comando exato vai no topo do relatório.
- **O lock não veio** (`lock_timeout`): registre e tente de novo, no máximo três vezes em 30 minutos. Não suba o timeout
  nem mate sessões. Depois da terceira, pare o apply daquele banco: PR aberto sem merge, com o comando no topo do
  relatório.
- **Advisor de segurança novo** depois do apply, não declarado: se cita objeto desta fase, escalada do runbook e rollback
  antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e siga.
- **O smoke ou o conferidor recusam** depois de um apply de produção, ou o smoke do mapa novo recusa depois do deploy:
  rollback daquele estado (revert + deploy primeiro, se o app novo estiver no ar), PR sem merge ou correção por PR novo,
  e a causa no topo do relatório. Não tente consertar na mesma run.
- **A sonda de deriva abre alarme** porque as migrations ficaram mais de 24 h no repositório sem apply: registre. O alarme
  fecha sozinho na Parte B seguinte ao apply.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a pendência.
  Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, merge, push de tag, disparo de workflow,
  rollback, a chamada HTTP com a chave `anon`): registre, não repita, não reformule, siga no que não depende dela e ponha
  o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui já
há cinco divergências medidas de saída** (fato 24), e elas vão no relatório:
- a numeração (`0208`) e a versão (`1.76.0`);
- `abrir` recebe a senha, e `dados` recebe a SESSÃO — não o `senha_id`;
- a rota antiga atrás de flag, descartada (decisão 13);
- `p_com_pessoas`, que não existe: a lista branca;
- `isolamento_viewer.sql`, que nasce aqui.

Declare também o que este prompt acrescenta à ficha:
- a divisão F68/F68B (19/11-1) e a ficha F68B;
- a sessão no banco e a tabela dela;
- o teto por empresa do contador e o porquê (a chave `anon` é pública);
- a gestão das senhas por empresa no banco;
- a lista branca com trava TS↔SQL;
- o `pgcrypto` e o teto de 3 s do `anon` no bootstrap do CI;
- a contração adiada para a F68B.

# Git e segurança
- **Branch** `f68-porta-publica`, com commits pequenos e frequentes e mensagens em pt-BR no padrão conventional
  (`docs(f68): …`, `test(f68): …`, `feat(f68): …`, `fix(f68): …`, `chore(f68): …`).
- **Documentação primeiro.** Commite também esta ordem (`docs/prompts/F68-porta-publica-por-empresa-ultracode.md`) num
  commit de documentação. O `PLAN-F68.md` vem antes do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os commits vão nesta ordem:**
  1. as travas vermelhas;
  2. o bootstrap do CI e as migrations, um commit por migration, com `db:lock`;
  3. `isolamento_viewer.sql`, o catálogo, o rollback;
  4. o app: `publico.ts`, a árvore `/r/**`, a entrada, o proxy e os 308, a gestão, a saída do ramo do visualizador, a
     catraca e as fronteiras;
  5. o smoke;
  6. o injetor;
  7. os documentos (as fichas, a MATRIZ, o ADR, o RUNBOOK, os aninhados, a ajuda, o inventário, a ata);
  8. a versão.
- **Pushes agrupados**: cada um custa CI numa cota apertada.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece quando:
  - `verificar` e `banco-sem-docker` estão verdes;
  - as migrations estão aplicadas nos dois bancos, com as provas;
  - o conferidor deu 0 recusadas e o smoke 0 falha em produção.

  A evidência pós-deploy vai por um PR só de documentação, e qualquer correção de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `cascade`, DDL dinâmica,
  `update`/`delete`/backfill, mudar o `rolconfig` de `anon`;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; chamar `relatorio_publico_abrir` ou qualquer RPC que
  escreva em PRODUÇÃO; escrever em produção fora do `apply_migration` e do rollback autorizado; tocar as 5 senhas;
  imprimir ou gravar valor de coluna, id, nome, e-mail, patrimônio, rótulo de senha, hash, token, a `amostra` das
  checagens ou texto de linha (nem em log, nem em evidência, nem na resposta);
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de 10/09);
  ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha, token ou a chave `service_role`. A chave `anon`
  é pública por desenho, mas também não vai para evidência: use-a, não a imprima;
- **no repositório:** mexer na proteção da `main` ou nos workflows, instalar dependência, mexer nos PRs do dependabot,
  subir número da linha de base, editar o `CLAUDE.md` da raiz.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local`, e que de banco só lê catálogo, contagens,
configurações, textos de esquema e hashes (nunca valores de linha, nunca a `amostra` das checagens, nunca o texto de um
log de erro). As frentes de exploração:
- (a) **a superfície do visualizador**: cada passo de hoje e o client dele (fatos 6, 7, 11 e 20);
- (b) **a gestão das senhas** e a catraca (fatos 9 e 10);
- (c) **os tipos do snapshot e os gerados**: todo campo, para a lista branca (fato 19);
- (d) **as rotas e as travas** que a árvore nova toca (fatos 11, 12, 13 e 25);
- (e) **a documentação oficial** (regra 6): `pgcrypto`/bcrypt, PostgREST (*function settings*, `request.headers`, o que
  se registra de um argumento), Supabase (`anon`, advisors), Next 16 (308 no proxy, cookie por `path`);
- (f) **os bancos, só leitura**: o "antes" (Frente A), o `rolconfig`, o `pgcrypto`, os logs;
- (g) **o CI**: o bootstrap, onde o `pgcrypto` e o teto do `anon` entram.

Escreva `docs/PLAN-F68.md` antes de implementar. **A edição do banco e do app é sequencial** (as funções, a sessão, o
client, a rota e as travas se cruzam). O que pode ir em paralelo, com conjuntos DISJUNTOS de arquivos: os documentos
(fichas, MATRIZ, ADR, RUNBOOK, ajuda) depois do código congelado, e a classificação da lista branca.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**. Eles leem
o código **pelo SHA** (nunca pela árvore de trabalho), contra o `PLAN-F68.md` e os 26 critérios, com estas perguntas:
- Sobrou algum caminho do visualizador (entrar, sessão, ler, sair, o 308, o layout) que crie client administrativo ou
  client de sessão? Algum import indireto da árvore pública chega em `supabase/admin`, `supabase/server` ou `queries/**`?
- Alguma função além das duas é executável por `anon`? Alguma das duas é executável por `authenticated` ou
  `service_role`? O par do catálogo pega as duas direções?
- As cinco recusas são de fato idênticas — o retorno, a mensagem, o status HTTP, o tempo? Algum caminho sai antes do
  trabalho do hash? O contador estourado vaza alguma coisa?
- Quem chama `abrir` direto pelo PostgREST com origens forjadas consegue força bruta? E consegue trancar a porta de outra
  empresa?
- A sessão: o token sai em algum log, evidência ou resposta além do cookie? O hash é o que se guarda? O vencimento e a
  revogação valem no banco, não só no cookie? Um cookie de A abre alguma coisa em `/r/<B>`?
- A lista branca: alguma chave de pessoa sai, em algum schema, em algum snapshot antigo, na lista, no detalhe, nos
  vizinhos? Algum id interno sai sem motivo? A trava TS↔SQL pega um campo novo nos tipos?
- A gestão: admin de A cria, confere ou revoga em B? A trilha de revogar grava a empresa da linha? Conferir uma senha
  scrypt confere alguma coisa?
- A senha em claro: há algum `raise`, cast, log, `registrarFalha` ou evidência que a contenha?
- O operador: alguma página de `/relatorios/**` dele mudou além da saída do ramo do visualizador? O 308 alcança quem está
  logado?
- O rollback: o revert vem antes do `F68-desfaz.sql`? O CI ensaiou?
- Alguma sabotagem prova só o caminho feliz? Alguma evidência tem valor real de linha?
- Algum arquivo fora do escopo foi tocado (policies existentes, `queries/admin.ts`, as 5 senhas, workflow, o `CLAUDE.md`
  da raiz, o ao vivo da F68B)?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado, não
preferências de estilo.** Corrija e re-revise até limpar. Se as passadas acharem bordas cada vez mais hipotéticas, pare e
registre a troca (o molde da F66B §13).

# Relatório final
`docs/RELATORIO-F68.md`, em pt-BR, no padrão dos relatórios F45 a F67C, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B completo, se o MCP
  faltou);
- **o rollback**, sempre: o revert do PR de código + o deploy, e depois o bloco de `F68-desfaz.sql`;
- **as senhas novas** (19/11-3), passo a passo:
  1. em Administração › Senhas, criar a(s) senha(s) nova(s) dos gestores (a tela devolve o endereço novo da porta);
  2. numa janela anônima, abrir o endereço, entrar com a senha nova, ver os relatórios gerados SEM nomes de pessoas, e
     sair;
  3. conferir que uma senha ANTIGA não abre (a mesma mensagem de senha errada);
  4. revogar, na mesma tela, as 5 senhas antigas (todas as que existiam antes do deploy), para a trilha ficar com o seu
     nome;
  5. mandar aos gestores o endereço novo e a senha nova;
- conferir `/api/saude` com `1.76.0` e, no dia seguinte, a Parte B do `saude.yml`, com a deriva limpa e as 13 checagens
  nos números travados;
- o `git diff v1.75.0 v1.76.0 --stat`, com o que deve e o que não deve aparecer;
- os lembretes: o próximo prompt é o da **F68B** (o ao vivo pela porta, e a contração de `registrar_tentativa_senha`/
  `senha_tentativas`); o diagnóstico do #84 continua como entrega avulsa; o seed de duas empresas continua no backlog.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas cinco já conhecidas;
- as decisões do Johnny e as **vinte e três decisões** da fase;
- as tabelas-verdade da superfície, da gestão e das travas, e a lista branca;
- a medição das cinco recusas (o critério escrito antes, os números depois);
- o custo do bcrypt e o `K` escolhidos, medidos;
- o conferidor e o smoke;
- as 13 checagens antes e depois;
- as sabotagens com saída real;
- a contagem final;
- os 26 critérios autoverificados;
- o estado de repouso: o que acontece se o projeto parar aqui por dois meses (a porta nova no ar, só com os gerados; as
  peças velhas de pé sem chamador; a F68B por fazer);
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que um gestor de verdade entra em produção com uma senha nova (não existe senha bcrypt lá até o Johnny criar;
    provado no CI, no ensaio e no roteiro dele);
  - que uma segunda empresa real entra pela porta (não há segunda empresa nos bancos vivos; provado no CI);
  - que nenhum nome passa pelo TEXTO LIVRE (decisão 7);
  - que a porta aguenta uma força bruta distribuída de verdade (o teto por empresa a limita; a WAF é da F73);
  - nada sobre os dados do #84.

Pendências e **backlog nomeado**:
- **F68B**: o ao vivo pela porta; a contração das peças velhas; o `ViewerAutoRefresh`;
- **F69**: a lista das senhas por empresa (`queries/admin.ts`); a plataforma na gestão das senhas de outra empresa;
- **F70**: a empresa ESCOLHIDA ao criar a senha; a empresa da sessão;
- **F71**: as frases do `CLAUDE.md` da raiz;
- **F73**: a senha só do smoke (a prova positiva da porta em produção, agendada); a WAF;
- **o diagnóstico do #84** (entrega avulsa); **o seed com duas empresas** (16/11-4);
- **Backlog** (das fases anteriores, sem mudança): o conta a conta com as memberships desativadas; os caminhos sem
  `.max()` e os pares de tetos da F66B; `movimentacoes.itens_faltantes`; o `savepoint` por linha na RPC do import; a
  paginação keyset; derrubar `profiles.papel`/`ativo`; o WARN `multiple_permissive_policies` de `pendencias_item`; a
  retenção dos backups antigos; `senha_testada` no vocabulário da trilha (F29).

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`porta`, `sessao`, `visualizador`, `senha`). Os nomes que a ficha fixa
  (`relatorio_publico_abrir`, `relatorio_publico_dados`, `isolamento_viewer.sql`, `fronteira-viewer.test.ts`) ficam como
  estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~20 minutos)

Esta fase **toca os dois bancos uma vez, só acrescentando**: uma tabela de sessões, o contador novo, as duas funções da
porta e as três de gestão das senhas. Nada que o app de hoje usa é derrubado (as peças velhas saem na F68B), então não
há janela de 12 h para esperar: a run fecha no mesmo dia.

O efeito visível, depois do deploy:
- o endereço da entrada por senha muda para `/r/wap/relatorios/acesso` (os links antigos levam para lá);
- **as 5 senhas de hoje param de abrir** — você cria as novas pela tela (roteiro no topo do relatório);
- pela senha, o gestor vê só os relatórios gerados, sem nomes de pessoas, até a F68B.

Para você, logado, nada muda.

Este arquivo já está salvo em `docs/prompts/F68-porta-publica-por-empresa-ultracode.md`, **sem commit**. O agente o
commita na branch da fase. O prompt cita os 25 fatos do cabeçalho pelo número, então o arquivo precisa estar lá quando
você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.75.0, main em 6fc9ee95 (PR #100); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git status --short          # só deve aparecer docs/prompts/F68-porta-publica-por-empresa-ultracode.md
Test-Path .git\index.lock   # tem de dar False

# 3. Produção com a mesma versão, e o estado do alarme #84 (os números que a fase vai travar).
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
& "C:\Program Files\GitHub CLI\gh.exe" run list --workflow saude.yml --limit 3

# 4. O smoke de produção passa HOJE: é a conferência da fase.
node scripts/smoke/smoke-prod.mjs

# 5. O MCP da Supabase conectado ao Claude Code, enxergando os dois projetos.
claude mcp list

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O passo 5 é o que mais importa, e hoje o ensaio falhou.** Às 08:40 de hoje o ensaio recusou a conexão duas vezes
(`ECONNREFUSED`), embora o painel o mostre ativo. Dentro do Claude Code, confira:
- que o MCP lista `pbtjcalbmepmrqzprusb` (produção) e `sgmvldiizsrjbxzzpmhh` (ensaio);
- que **as ferramentas estão ligadas**: `execute_sql`, `apply_migration`, `list_migrations`, `get_advisors`, `get_logs`,
  `generate_typescript_types` e `get_publishable_keys`;
- que o `execute_sql` funciona nos DOIS. Peça ao Claude Code um `select 1` em cada projeto. Se o ensaio continuar
  recusando, abra o projeto de ensaio no painel da Supabase (um projeto parado acorda assim) e tente de novo. Sem ensaio,
  **nada vai a produção**: o agente entrega o PR aberto, sem merge, com o caminho B no topo do relatório.

**Mais três coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. As travas nascem vermelhas (um push a mais), há um roteiro
   novo grande, e o `banco-sem-docker` roda algumas vezes, mais o PR de documentação e a Parte B disparada à mão.
2. **Dentro do Claude Code:** `/permissions` (nada pode negar `git push`, `gh`, `node`, `npx tsx` nem as ferramentas do
   MCP da Supabase) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).
3. **Durante a run, use o sistema normalmente**, mas **não crie nem revogue senha de acesso** em Administração › Senhas
   até o relatório pedir. O agente mede as 5 de hoje no começo e no fim, e uma mudança no meio confunde a contagem.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f68
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP nos dois bancos, chama a porta no ensaio
pelo PostgREST, abre e mergeia PRs, publica tag, dispara workflow e roda o smoke e o conferidor. Nada disso cabe numa
allowlist estreita. `bypassPermissions` numa máquina com credencial de produção está fora de questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção, no merge na `main`, no push da tag,
no disparo da Parte B e, talvez, na chamada HTTP com a chave `anon`. Se barrar, o prompt manda não reformular: o agente
registra, segue no resto e põe o comando no topo do relatório.

**`--worktree` NÃO serve.** O smoke e o conferidor precisam do `.env.local`, que não vai para a worktree, e o prompt
proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** Menor que a F67C na parte mecânica (não há centenas de roteiros para adaptar) e maior na parte de desenho e
revisão: a porta é a superfície mais exposta do produto, e a revisão adversarial ("as cinco recusas são mesmo iguais?",
"algum nome escapa?", "dá para forçar a senha chamando a função direto?") é onde o modelo forte rende. Se a cota semanal
estiver apertada, use `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`: os subagentes de exploração e de
documentação aguentam bem.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F68.md existe com as tabelas-verdade da superficie, da gestao e das travas e a lista branca com todo campo classificado; package.json em 1.76.0; docs/RELATORIO-F68.md existe com o rollback e o roteiro das senhas novas no topo; as fichas F68 (reescrita) e F68B (nova) estao no PLANO-MULTIEMPRESA; e UM destes desfechos: (a) o PR da fase e o PR de documentacao mergeados com verificar e banco-sem-docker verdes, as migrations 0208+ aplicadas no ensaio e em producao, relatorio_publico_abrir e relatorio_publico_dados como as unicas funcoes executaveis por anon nos dois bancos, isolamento_viewer.sql verde, as 13 checagens iguais aos numeros travados, o conferidor com 0 recusadas, o smoke com o mapa de rotas novo sem falha depois do deploy, a Parte B com os mesmos numeros e a tag v1.76.0 publicada; (b) o apply de producao nao aconteceu (classificador ou lock): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F68.md; (c) sem MCP da Supabase ou sem acesso ao ensaio: PR aberto sem merge, com o caminho B no topo do docs/RELATORIO-F68.md; (d) uma checagem, o conferidor ou o smoke reprovaram depois de um apply ou do deploy: rollback aplicado (ou o comando no topo), PR sem merge ou correcao pendente, e a causa no topo do docs/RELATORIO-F68.md; ou (e) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F68.md
```

**Headless.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f68.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f68.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f68.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. **Prefira a sessão
interativa deixada rodando, com o `/goal`**, e com a suspensão do Windows desligada no plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **O "antes" e o plano.** `docs/PLAN-F68.md` com a lista branca (cada campo do relatório: sai ou não sai) e
   `docs/f68-evidencias/antes/` com as funções de `anon` (0), as senhas por formato (5 scrypt) e as 13 checagens. Só
   números, nomes de esquema e hashes. **Se aparecer um nome, um e-mail, um patrimônio, um rótulo de senha ou um hash de
   senha ali, interrompa a sessão.**
2. **As travas vermelhas.** O par do catálogo de `anon`, `isolamento_viewer.sql`, a fronteira — antes de qualquer
   migration.
3. **O ensaio.** A prova viva: as cinco recusas iguais, a medição de tempo, a diagonal, a revogação, zero chave de pessoa.
4. **Produção e o merge.** O catálogo com as duas exceções e nada mais; o smoke e o conferidor limpos.
5. **O deploy.** `/api/saude` em `1.76.0`, o smoke com o mapa novo (os 308 e o 404 da empresa inexistente).

### Ao voltar

1. **Execute o roteiro que está no topo do relatório**, a começar pelas senhas novas: criar, testar numa janela anônima,
   conferir que a antiga não abre, revogar as 5 antigas, mandar o endereço e a senha nova aos gestores.
2. Entre com a sua conta e abra `/relatorios/geral` e `/relatorios/gerados`: tudo igual a antes, com nomes.
3. `git diff v1.75.0 v1.76.0 --stat`. Devem aparecer:
   - `supabase/migrations/0208_*` em diante, `supabase/migrations.lock.json`, `supabase/rollback/F68-desfaz.sql`,
     `supabase/ci/` (o bootstrap do `pgcrypto`);
   - `supabase/tests/`: `isolamento_viewer.sql`, `f68_rollback.sql` e o catálogo das exceções de `anon`;
   - `src/lib/supabase/publico.ts`, `src/app/r/**`, `src/lib/auth/acesso.ts`, `src/lib/actions/senhas.ts`,
     `src/lib/validators/senha.ts`, `src/lib/supabase/proxy.ts`, `src/app/(app)/layout.tsx`, `src/lib/types/database.ts`,
     as travas de mesa (`fronteira-viewer.test.ts` reescrito);
   - `scripts/smoke/smoke-prod.mjs`, `scripts/db/mutacoes.mjs`, `registry.ts`, `package.json`, `CHANGELOG.md`,
     `docs/**`.

   **Não** devem aparecer:
   - migration antiga alterada; policy nova ou reescrita em tabela existente;
   - `src/lib/queries/admin.ts` ou as páginas do operador em `/relatorios/**` mudando além da saída do ramo do
     visualizador;
   - `scripts/smoke/linha-de-base.json` com número que SUBIU;
   - o `CLAUDE.md` da raiz, `.github/workflows/**`, mudança de dependência no `package-lock.json`.
4. Abra `docs/f68-evidencias/`: a medição das cinco recusas, a prova viva do ensaio, o catálogo de `anon` e a saída das
   sabotagens.
5. Confira no `PLANO-MULTIEMPRESA.md` a ficha F68 reescrita e a **F68B**: é dela o próximo prompt.
6. Rode você mesmo `npm run test` uma vez.
7. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **Suas três escolhas de hoje viraram as decisões 19/11-1, 19/11-2 e 19/11-3**: F68 + F68B (entre as duas, o gestor vê
   só os gerados, e o endereço do ao vivo mostra um aviso), sem nomes pela porta, e a senha conferida pelo banco.
2. **As 5 senhas antigas deixam de abrir no corte por construção** (a porta nova só confere bcrypt), mas **o agente não
   as revoga**: a revogação formal fica no seu roteiro, pela tela, para a trilha de Auditoria sair com o seu nome. Se
   preferir que uma migration as marque como revogadas, me diga e eu ajusto (vira uma migration de dados com backup).
3. **O texto livre continua aparecendo para o gestor** (observações, o texto das anotações, o número do chamado). Saem os
   campos de pessoa: colaborador, setor, autor da anotação e quem gerou o relatório. Se quiser o texto livre fora também,
   me diga: o relatório do gestor fica bem mais pobre.
4. **A sessão do visualizador vira uma linha no banco** (um token que vale 24 h e morre quando a senha é revogada), não
   mais o id da senha dentro do cookie. É uma tabela nova que a ficha não previa.
5. **A gestão das senhas passa a ser feita pelo banco, por empresa** (criar, testar e revogar), sem o service role. A
   LISTA das senhas na tela continua como está: é da F69.
6. **As peças velhas (o contador de hoje) só saem na abertura da F68B.** A Skew Protection deixa abas velhas chamando o
   código antigo por até 12 h; adiando a limpeza, a F68 fecha no mesmo dia, sem esperar janela.
7. **A "rota antiga atrás de flag" da ficha foi descartada**: manteria o service role vivo no código. A reversão é o
   revert do PR seguido do rollback do banco, ensaiado.
8. **Não há prova positiva da porta em produção** nesta fase: não existe senha nova lá até você criar, e uma senha só do
   smoke é da F73. A prova positiva é o CI, o ensaio e o seu teste numa janela anônima.
9. **Os links antigos (`/relatorios/acesso`) levam para a porta da WAP**, porque todo link que existe hoje é da WAP.
10. **Os números do cabeçalho foram medidos hoje em produção pelo conector do claude.ai**, só contagens, catálogo e
    configurações. O ensaio recusou a conexão; o agente remede tudo nos dois bancos.

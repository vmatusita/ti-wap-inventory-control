# F67B — Storage e Realtime por empresa

Ordem de serviço da fase **F67B** do `PLANO-MULTIEMPRESA.md` (§7). É a segunda das três fases em que a decisão 12/11-2
do Johnny dividiu a F67 original:
- **F67** (no ar, v1.73.0): o cargo por empresa, as `security definer`, as destrutivas, a mesa e a trava do termo;
- **F67B** (esta): os dois buckets do Storage e o canal de tempo real;
- **F67C**: o fim do default `empresa_legada()`.

A ficha F67B foi escrita pela F67 (13/11/2026). Esta ordem a executa com os números medidos hoje e corrige três pontos
em que a ficha subestimou o trabalho (fatos 18, 19 e 25).

Hoje o Storage e o Realtime são as duas superfícies que nenhuma auditoria de RLS de tabela examina:
- o bucket `termos` deixa ler todo `.docx` a qualquer membro da WAP, ignorando o nome do arquivo;
- o bucket `termos` deixa gravar e apagar objeto que nenhuma linha referencia (`coalesce(…, true)`);
- o bucket `backups-import` decide só pelo cargo de admin na WAP, sem olhar de quem é o backup;
- o canal de tempo real assina as três tabelas sem filtro nenhum.

Com uma segunda empresa, o admin da B teria a porta do Storage fechada pela legada explícita da F67. Mas a regra não
saberia dizer DE QUEM é cada objeto. Esta fase faz cada objeto ter dono.

Ela entrega:
- **o bucket `termos` pelo JOIN**: ler e escrever um `.docx` exige a linha de `termos_gerados` que o referencia, e o
  cargo NA EMPRESA DELA. Nenhum objeto se move. Objeto sem linha não é lido nem escrito por ninguém da sessão;
- **`persistirTermo` invertido** (a linha antes do upload, com rollback correto) e só então o `coalesce(…, true)` vira
  `false`;
- **o bucket `backups-import` por empresa**: as QUATRO famílias de backup (import, reset, conflito e as cópias de `.docx`)
  passam a gravar com a empresa no caminho, montado por UMA função (`src/lib/storage/caminho.ts`) e um espelho SQL. As 4
  policies exigem que a empresa do caminho seja uma em que quem pede é administrador;
- **os backups antigos visíveis só ao admin da WAP** (decisão 16/11-1), por uma cláusula legada FECHADA e escrita;
- **a ferramenta nomeada de órfão** na Zona destrutiva, que copia antes de remover;
- **o Realtime com `filter: 'empresa_id=eq.<id>'`** nas três assinaturas, e a trava no catálogo da publication;
- **a ficha F67B reescrita** com o escopo real, e as notas para a F67C, a F70 e a F71.

Três condições não se negociam:
- **Nada muda para a WAP**, exceto o que está declarado. Cada membership ativa, em produção, enxerga e escreve os MESMOS
  objetos antes e depois, nos dois buckets. As únicas diferenças permitidas são os 3 `.docx` sem linha (fato 6), que
  deixam de ser lidos e escritos pela sessão. A prova é conta a conta, só contagem. O smoke, o conferidor e as 13
  checagens de integridade ficam iguais (com os números do #84 travados).
- **Zero janela.** Em nenhum momento o app no ar faz uma operação que o banco passou a recusar. Tudo o que quebraria o
  app velho (o upload do `.docx` antes da linha; o backup gravado na forma antiga; a cópia de `.docx` pela sessão depois
  da RPC) só é fechado depois do deploy, na CONTRAÇÃO.
- **Nenhum dado de negócio muda e nenhum objeto se move.** Esta fase reescreve policies e funções. Ela não reescreve
  linha nem move, copia ou apaga objeto em banco vivo.

**As decisões do Johnny.**

De 16/11/2026, na conversa que gerou esta ordem:
1. **(16/11-1) Os backups antigos ficam visíveis só ao administrador da WAP.** A pergunta foi o que fazer com os 29
   objetos de `backups-import` gravados sem a empresa no caminho (22 de import, que alimentam o "Baixar backup" dos 12
   imports em Administração › Importar, e 7 de reset). A ficha mandava deixá-los invisíveis pelo app. A escolha foi uma
   **regra legada escrita e FECHADA**: objeto numa das formas antigas = só administrador da WAP. Nada muda para a WAP, e
   outra empresa nunca os vê.
2. **(16/11-2) O client administrativo SÓ no passo dos `.docx` do import.** Depois que `importar_ativos_substituir`
   apaga as linhas dos termos, o app copia e remove os `.docx` com o client da sessão. Com a leitura pelo join e o
   `coalesce(…, false)`, objeto sem linha não pode ser lido nem apagado pela sessão: a cópia e a remoção falhariam, e cada
   `.docx` viraria órfão (a 8ª checagem está travada em 3). A escolha: só a cópia/remoção dos `.docx` depois da RPC usa o
   client administrativo, como a Zona destrutiva e a mesa já fazem. O resto do import continua na sessão.

Herdadas, e aplicadas a esta fase por coerência (estão nas suposições do guia):
- **(12/11-2)** a divisão F67 / F67B / F67C;
- **(13/11-1) "dev sou só eu"**: o cargo dev é só do Johnny, e a plataforma é ele;
- **(13/11-2) expandir e contrair, zero janela**: aqui, aplicada à FORMA do caminho e à ordem do termo, não a assinatura;
- **(13/11-3) o #84 travado**: os números das checagens de integridade são remedidos no começo e não podem subir. Esta
  fase mexe exatamente nas duas checagens de Storage (a 8ª e a 12ª).

---

## Estado de partida: os 33 fatos medidos (16/11/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje no disco e no git, com os corpos de função lidos pelo
> `scripts/db/corpo-vigente.mjs`, e **em produção** pelo conector da Supabase, só leitura: contagens, nomes e textos de
> esquema, md5. Nenhum valor de linha. **O ensaio NÃO foi medido**: o `execute_sql` dele recusou duas vezes com `28P01`
> (fato 5). Divergência da ficha está marcada com ⚠. **Remeça tudo antes de aceitar.**

**Onde o projeto parou**

1. `origin/main` em **`2ad31e9`** (merge do PR #95, o pós-deploy da F67), e a tag anotada **`v1.73.0`** aponta para ele.
   `package.json` em `1.73.0`; árvore limpa.
   - Última migration: **`0193_contracao_assinaturas_antigas.sql`**, aplicada nos dois bancos (em produção, o ledger
     termina em `contracao_assinaturas_antigas`). **A primeira desta fase é a `0194`.**
   - Versão: **`1.74.0`** (fase = MINOR, regra 8).
   - Checks obrigatórios da `main`: **`verificar`** e **`banco-sem-docker`**.
   - Produção `pbtjcalbmepmrqzprusb` (PG 17.6), ensaio `sgmvldiizsrjbxzzpmhh` (PG 17.11).
   - Produção hoje: **1** empresa, **14** memberships ativas.
2. **A rede de hoje** (`RELATORIO-F67.md` §13):
   - mesa: 271 arquivos com 8.589 testes;
   - CI: 61 roteiros com 1.248 asserções e 0 ✗;
   - injetor em **170/170**, quarentena 2;
   - smoke: *"109 OK · 1 aviso · 0 falha"*;
   - conferidor de formas: 272 pontos, 0 recusadas;
   - gate de tipos: 38 relações · 360 colunas · 102 funções;
   - 69 `security definer` em `public` (38 executáveis por `authenticated`); o universo da trava da F52 tem **26**.
3. **O mapa do `CLAUDE.md`**: os diretórios de topo de `src/lib` e `src/components` e os 14 `CLAUDE.md` aninhados.
   Remeça no começo (é a regra do `CLAUDE.md`). `src/lib/storage/` hoje tem só `copiar-antes-de-remover.ts` e o teste:
   `caminho.ts` é arquivo NOVO dentro de diretório existente, e não muda o mapa.
4. **A Parte B está vermelha desde 19/10** (issue de alarme **#84**). Na conferência da F67 (13/11):
   - `backup_orfao` **12** (linha de base 10) e `detentor_em_estado_sem_dono` **1** (linha de base 0): os dois achados
     do #84;
   - `arquivo_termo_orfao` **3** (linha de base 3, uma CATRACA: só desce);
   - `conflito_entre_filiais` 59 (linha de base 69);
   - as outras nove em 0.

   A linha de base está em `scripts/smoke/linha-de-base.json`. **As duas checagens de Storage (a 8ª,
   `arquivo_termo_orfao`, e a 12ª, `backup_orfao`) são exatamente as que esta fase pode fazer subir sem querer.**
5. **⚠ O ensaio recusou o conector daqui.** Em 16/11, `execute_sql` no `sgmvldiizsrjbxzzpmhh` respondeu duas vezes
   `FATAL 28P01: password authentication failed for user "postgres"`. A produção respondeu normalmente. O conector do
   Claude Code da máquina do Johnny é OUTRO, e pode não ter o problema. Confira na primeira hora da run.

**O bucket `termos`**

6. **Produção, hoje:**
   - **301** objetos, todos na forma `<uuid>.docx` na raiz do bucket;
   - **298** linhas em `termos_gerados`, todas da empresa legada;
   - **3** objetos sem linha (= a 8ª checagem); **0** linhas sem objeto; **0** termos degenerados (`ativo_ids = '{}'`);
   - **0** conjuntos de movimentações com mais de um termo. O ramo de "órfãos de variantes antigas" de `persistirTermo`
     não tem hoje caso nenhum em produção.
7. **As 4 policies de `termos` em `storage.objects`:**
   - `termos leitura operador` (`0129`): `bucket_id = 'termos' and (select public.pode_ler_arquivo_termo(name))`;
   - `termos insere/atualiza/apaga operador` (`0187`): `bucket_id = 'termos' and (select
     public.pode_escrever_na(public.empresa_legada())) and public.pode_escrever_arquivo_termo(name)`.
8. **`pode_ler_arquivo_termo(p_nome)`** (`0186`): `select (select public.papel_na_empresa(public.empresa_legada())) is
   not null`. Ela **ignora o parâmetro**. É a exceção nominal de `supabase/tests/definer_sem_tenant.sql` (`:137`, com o
   motivo em `:157`), apontando para cá.
9. **`pode_escrever_arquivo_termo(p_nome)`** (`0069`): `coalesce((select bool_and(public.pode_escrever_termo(t.ativo_ids))
   from public.termos_gerados t where t.arquivo_path = p_nome), true)`. **Objeto que nenhuma linha referencia é gravável
   e apagável por qualquer um que passe o piso.** Basta o par path↔linha divergir para o bucket ficar aberto.
10. **`pode_escrever_termo(p_ativo_ids)`** (`0186`):
    - com ativos: `pode_escrever_filial(a.filial_id)` por ativo (já por empresa da filial desde a F67);
    - **degenerado** (`'{}'`): `e_admin_na(public.empresa_legada())`, a legada EXPLÍCITA, apontando a F67B;
    - a `0069` (`:93`–`:113`, `:247`) documenta o "lixo IMORTAL": se o degenerado fechar para todos, ninguém mais o apaga.
      A ficha exige que o admin da A **ainda apague** o degenerado da própria empresa.
11. **`persistirTermo`** (`src/lib/actions/termos.ts:452`–`541`, chamado por `gerarTermo` em `:633`):
    - lê os termos do MESMO conjunto de movimentações (`:472`) e reutiliza o primeiro (`id` existente → UPDATE) ou cria
      um id novo (INSERT). O caminho é `${id}.docx`;
    - órfãos de variantes antigas (`:486`–`505`): apaga as LINHAS primeiro e os arquivos depois, pelo client da sessão;
    - **o upload vem ANTES da linha** (`:508`, `upsert: true`); depois o UPDATE (`:524`) ou o INSERT (`:530`). Se o INSERT
      falha, remove o `.docx` recém-enviado (`:536`);
    - as URLs assinadas saem em `:647` e `:697`.

    Com o `coalesce(…, false)`, o upload sem linha é recusado. Por isso a inversão e o `false` são um trabalho só, nesta
    ordem, e **a inversão vai ao ar ANTES do `false`** (zero janela).
12. **Quem remove `.docx`:** só a porta única `src/lib/storage/copiar-antes-de-remover.ts` (`:222`), mais as duas remoções
    de `persistirTermo`. A trava `src/lib/actions/backup-completude.test.ts` exige que toda chamada
    `.from('<bucket>').remove(` esteja classificada. A porta é chamada por:
    - `actions/importar.ts`, com o client da **SESSÃO**. O cabeçalho do módulo (`:57`) e o comentário de `:720` proíbem
      service role;
    - `actions/dev-destrutivo.ts` e `actions/conflitos.ts`, com o client **ADMINISTRATIVO**.

    `src/lib/supabase/superficie-admin.test.ts` (F49) declara, arquivo a arquivo, quem invoca `createAdminClient()`.
    `importar.ts` **não** está lá.
13. **O passo dos `.docx` do import** (`importar.ts:805`–`830`): DEPOIS da RPC, `copiarEntaoRemoverTermos(client de
    sessão, …)`. `copy()` exige SELECT na origem e INSERT no destino; `remove()` exige DELETE. Com a leitura pelo join, o
    SELECT da origem falha (a linha já saiu): o `.docx` não é copiado, portanto não é removido, e vira órfão. A decisão
    16/11-2 resolve isso.
14. **O Storage recusa DELETE direto em `storage.objects`.** Em produção existe o gatilho `protect_objects_delete`
    (função `storage.protect_delete`). Apagar objeto só pela API do Storage. Consequência: a "ferramenta NOMEADA" de
    órfão não pode ser só SQL `security definer`, como as da Zona destrutiva. Confirme na documentação (regra 6).
15. **O caminho do `.docx` não muda**: `termos_gerados.arquivo_path` tem teto 80 (`src/lib/validators/tetos-coluna.ts:46`)
    e é `<uuid>.docx`. Quem decide é o join, não o caminho (a ficha).

**O bucket `backups-import`**

16. **Produção, hoje: 29 objetos**, todos sem a empresa no caminho:
    - **22** na forma histórica `<slug>/<carimbo>.json`, de antes da F52;
    - **5** em `reset/<bloco>/<global|filial-N>/<carimbo>.json`;
    - **2** em `reset/…/termos/<arquivo>` (cópias de `.docx`, F54);
    - **0** em `import/filial-N/` (nenhum import desde a F52), em `conflito/` e em `ativo/`.

    Também em produção:
    - `import_logs`: **12** linhas, todas com `backup_path` na forma histórica, com no máximo 44 caracteres;
    - `eventos_admin`: **42** eventos com `detalhe->'backup_path'` e **44** `ativo_apagado`;
    - 0 linhas fora da empresa legada em `import_logs`.
17. **As 4 policies de `backups-import`** (`0187`): `bucket_id = 'backups-import' and (select
    public.e_admin_na(public.empresa_legada()))`, para leitura, insere, atualiza e apaga.
18. **⚠ QUATRO famílias gravam no bucket, e a ficha só nomeia uma** (o import):

    | família | forma de hoje | quem monta (TS) | espelho SQL | quem valida o caminho |
    |---|---|---|---|---|
    | import | `import/filial-<id>/<carimbo>.json` | `prefixoBackupImport` (`validators/importar.ts:231`), usado em `importar.ts:623` (sessão) | `prefixo_backup_import(smallint)` (`0132`) | `import_validar_plano` (`0132`), chamada por `importar_ativos_substituir` (`0190`) |
    | reset | `reset/<bloco>/<global\|filial-N>/<carimbo>.json` | `dev-destrutivo.ts:420`–`426` (sessão) | `prefixo_backup_reset(text, smallint)` (`0089`) | `resetar_acervo`/`resetar_itens` (`0190`) |
    | conflito | `conflito/<digest>/<carimbo>.json` | `PREFIXO_BACKUP_CONFLITO` (`validators/conflitos.ts:35`), em `conflitos.ts:270` (sessão) | `prefixo_backup_conflito()` (`0093`) | `apagar_ativos_conflito_filiais` (`0191:314`), com o digest |
    | cópias de `.docx` | `<raiz>/termos/<arquivo>` | `raizDoBackupEmArquivo`, `raizDoAtivo` (`ativo/<id>`), `raizDoConflito` (`copiar-antes-de-remover.ts:80`–`113`) | o reconhecimento da 12ª checagem (fato 19) | — |

    Depois da F67, o "tudo" do reset é a empresa inteira, mas o caminho ainda diz `global`. **Família sem empresa no
    caminho torna impossível a trava da ficha** ("a função única que monta caminho nunca devolve string sem prefixo de
    empresa"). E pior: um backup de reset da B gravado na forma antiga cairia na cláusula legada (decisão 16/11-1) e
    ficaria legível ao admin da WAP. **As quatro famílias ganham a empresa.**
19. **A 12ª checagem reconhece as cópias pela forma ANTIGA.** `backup_orfao` mora em `checagens_integridade_nucleo`
    (`0164`), e `dev_checagens_integridade` e `checagens_integridade_resumo` delegam a ela.
    - Para JSON ela é agnóstica de forma ("alguém registrou este caminho?", via `import_logs.backup_path` e
      `eventos_admin.detalhe->>'backup_path'`).
    - Para as cópias, NÃO: as regexes são `^(ativo/[0-9a-fA-F-]{36}/)termos/`, `^(conflito/[0-9a-f]{32}/)termos/` e
      `regexp_replace(o.name, '/termos/[^/]+$', '.json')`.

    Uma forma nova que ela não reconheça faz cada backup novo contar como órfão, e a Parte B alarma. Os objetos antigos
    ficam para sempre (decisão 16/11-1), então **ela reconhece as duas formas para sempre**.
20. **`scripts/db/restaurar.mjs`** (service role) baixa pelo caminho (`:421`) e recalcula o prefixo das cópias
    (`<raiz>/termos/`). Tem de aceitar as duas formas.
21. **`urlBackup`** (`importar.ts:895`–`921`) gera a URL assinada com o client da SESSÃO (`createSignedUrl(log.backup_path,
    60)`), atrás de `pertenceAoEscopo(escopoDeGestaoAtual(), escopoDoImportLog(log))`. É um no-op desde a F54
    (`src/lib/escopo/pertencimento.ts:57`–`88`).
    - O comentário de `:905` diz "arrumar policy de bucket NÃO fecha isto".
    - Com a policy por empresa do caminho, o próprio Storage recusa a `createSignedUrl` de objeto de outra empresa (exige
      SELECT). Confirme na documentação.
    - Decida o que a fechadura de pertencimento passa a ser (decisão 12).
22. **Os tetos:**
    - `import_logs.backup_path` tem teto **120** (`tetos-coluna.ts:131`). O import na forma nova tem ≈ 94 caracteres:
      confira com o carimbo e o maior id de filial;
    - os caminhos de reset e conflito vão como parâmetro de RPC e em `eventos_admin.detalhe` (jsonb). Confira se algum
      CHECK de comprimento da F66B os alcança.
23. **⚠ `storage.foldername` existe em produção, mas NÃO no Postgres do CI.** O cabeçalho de
    `supabase/ci/bootstrap-storage.sql` (`:11`) diz isso com todas as letras. A forma da ficha,
    `(storage.foldername(name))[2] = any(array(select …))`, quebraria o apply no CI. As saídas:
    - uma função `public` imutável que extrai a empresa do caminho (`split_part`/regex), devolvendo null fora da forma;
    - ou o espelho exato de `storage.foldername` no bootstrap.

    Escolha (decisão 3). A doutrina do predicado (F59: `policies-initplan`, `catalogo_policies.sql`) vale.

**O Realtime**

24. **A publication `supabase_realtime`** (produção) tem exatamente `anotacoes`, `lancamentos_item` e `movimentacoes`
    (`0009`, `0018`).
    - As três têm RLS ligada (não forçada), `replica identity` default e `empresa_id` (`0160`, `0161`).
    - Cada uma tem UMA policy de SELECT, `leitura operador`, com o MESMO md5 nas três: a forma da F66,
      `(select papel_atual()) is not null and empresa_id = any(array(select public.empresas_do_membro()))` (`0175:109`,
      `0176:55`, `0176:88`).
    - Há 0 linhas fora da empresa legada nas três.
    - `realtime.messages` tem 0 policies: o app não usa Broadcast nem Presence, só `postgres_changes`.
    - O conjunto da publication é congelado por `catalogo_policies.sql` §9 (asserção `9a`), com a mutação
      `catalogo-tabela-nova-na-publication-do-realtime` (`mutacoes.mjs:1220`).
25. **⚠ "RLS na publication" não é um objeto do Postgres.** Uma publication não tem policy.
    - O Realtime da Supabase confere, para cada mudança e cada assinante, a policy de SELECT da TABELA, com o JWT do
      assinante. É o "Realtime RLS" da Supabase, desde 2021.
    - Logo, **a trava já existe desde a F66**: as três policies de SELECT recortam por empresa. Confirme na documentação
      oficial (regra 6) antes de aceitar.
    - Os comentários de `src/lib/relatorios/assinatura-realtime.ts:36`–`41` e `src/lib/escopo/chave.ts:26`–`29` dizem
      que a "RLS na publication não existe hoje e é F70". Estão desatualizados (a ficha trouxe o Realtime para cá) e
      conceitualmente errados.
    - O que a F67B entrega aqui:
      1. a trava de CATÁLOGO da publication: toda tabela nela tem RLS, `empresa_id` e a policy de SELECT com o recorte
         pareado, e está em `TABELAS_ASSINADAS` (e vice-versa);
      2. a prova pela documentação;
      3. o filtro do cliente, que é ergonomia;
      4. os comentários corrigidos.
26. **As assinaturas.** `RealtimeRefresh` (`src/components/relatorios/realtime-refresh.tsx`) é `'use client'`, sem
    props, e é montado em:
    - `relatorios/[filial]/page.tsx:185`, só no modo operador (o visualizador por senha usa `ViewerAutoRefresh`, sem
      canal);
    - `itens/page.tsx:281`;
    - `itens/historico/page.tsx:215`.

    As opções saem de `opcoesDaAssinatura(table)` (`src/lib/relatorios/assinatura-realtime.ts`), hoje SEM `filter`,
    testada em `assinatura-realtime.test.ts`.
    - A regra da F50: "não emitir filtro que não se consiga provar total".
    - `anotacoes` agora TEM `empresa_id`, e há 0 linhas fora da legada nas três tabelas. Então `empresa_id=eq.<legada>`
      é provadamente total hoje.
    - O canal se chama `wap:relatorio-tempo-real` (`nomeDoCanal`).
    - Pelas convenções do `CLAUDE.md`, a empresa chega ao `'use client'` por **prop**, de um Server Component.
27. **O `filter` do `postgres_changes`**: a sintaxe `coluna=eq.valor`, um filtro por assinatura, o comportamento com
    `uuid` e o que acontece com INSERT. Confirme na documentação.

**Os instrumentos e as travas**

28. **⚠ A catraca TS da legada** (`src/lib/auth/empresa-legada-catraca.test.ts`) **não tem nenhuma entrada de Storage.**
    A ficha diz "a catraca TS da legada perde as entradas de Storage". A legada do Storage mora no SQL:
    - as 7 policies da `0187`;
    - `pode_ler_arquivo_termo` e o ramo degenerado de `pode_escrever_termo` (`0186`);
    - a exceção de `definer_sem_tenant.sql`;
    - as linhas do `PLAN-F67.md` §2 com destino F67B (`:124`–`126`, `:143`–`144`, `:194`, `:200`).

    A trava desta fase é de CATÁLOGO (decisão 14). A catraca TS só muda se o filtro do Realtime somar
    `empresaDaOperacao()`.
29. **`definer_sem_tenant.sql`**: universo de 26. As exceções são `estorno_item_coerente`, `termo_ancora_coerente` e
    `pode_ler_arquivo_termo` (`:137`); `pode_escrever_arquivo_termo` e `pode_escrever_termo` estão em `k_escopo_ok`
    (`:117`).
30. **`supabase/tests/storage_termo.sql`** (F50) prova a leitura POR CARGO ("todo logado ativo lê"), e o próprio
    cabeçalho diz que a F67 fecharia pelo join. Com o join, a asserção que provava "lê objeto sem linha" passa a provar o
    contrário. Adapte declarando. `supabase/tests/isolamento_tenant.sql` já tem fixtures de duas empresas (F67).
31. **O conta a conta** (`scripts/perf/conta-a-conta.mjs`, F66/F67) tem as fases `emulada|real` e `f67-antes|f67-depois`.
    É um bloco só leitura que termina sempre em `raise`, com as claims de cada membership escolhidas DENTRO do banco, e só
    devolve contagem. É o instrumento do "nada muda para a WAP": estenda com `f67b-antes|f67b-depois` (decisão 15).
32. **O método** (ADR-003 + `RUNBOOK-BANCO.md`):
    - `apply_migration` do MCP é UMA transação; o CI (`psql -f` sem `-1`) não é;
    - cabeçalho `-- classe:` validado por `scripts/db/classificar-migration.mjs`; `db:lock` no mesmo commit; entrada em
      `DA_F38` e em `RECRIACOES_AUTORIZADAS` (`src/lib/itens/migrations-f38.test.ts`) para toda função recriada, com o diff
      contra o corpo vivo no cabeçalho;
    - nome-sem-prefixo que não repete; `set lock_timeout = '2s'`/`reset`, sem `begin`/`commit`; a seção "`security
      definer` — três exigências";
    - **proibidos**: `supabase db push`, `migration repair`, `db reset --linked`, reescrever `schema_migrations`;
    - a MATRIZ vai até **R-ACC-130**, então o próximo é o **R-ACC-131**. O `ADR-002` vai até o §17, então o próximo é o
      **§18**. O RUNBOOK tem até o **Anexo F67**;
    - rollbacks encadeados até `supabase/rollback/F67-desfaz.sql`, ensaiado por `supabase/tests/f67_rollback.sql`;
    - os bloqueios das fases recentes: o conector ligado a OUTRA conta (F66B); as ferramentas do MCP amanhecendo
      desligadas (F60, F63, F64); o classificador barrando o apply do ensaio (F65); e agora o `28P01` do fato 5.
33. **A janela (Anexo F67 do RUNBOOK, molde da F60).** Aqui o "antigo" não é uma assinatura de função: é o
    COMPORTAMENTO do app no ar. Três coisas quebrariam o app velho se o banco as fechasse antes do deploy:
    - (a) o upload do `.docx` antes da linha (fato 11);
    - (b) o backup gravado na forma antiga, pelas policies e pelas checagens de prefixo das RPCs (fato 18);
    - (c) a cópia de `.docx` pela sessão depois da RPC do import, pela leitura por join (fato 13).

    A prova de que "ninguém mais faz o antigo" é:
    - o SHA no ar = o merge;
    - a prova estática (`git grep` dos montadores antigos, vazio);
    - a contagem de objetos CRIADOS depois do deploy em cada forma antiga = 0 (só contagem, por forma).

    As operações que gravam backup são raras: Δ 0 por ausência é o esperado, e deve ser declarado.

As regras do `CLAUDE.md` que pesam aqui: **1, 2, 3, 5, 6, 7 e 8**. A regra 6 pede a documentação oficial:
- **Storage da Supabase**: que operação exige qual permissão RLS em `storage.objects` (upload com e sem `upsert`,
  `createSignedUrl`, `copy`, `remove`, `list`), `storage.protect_delete` e `storage.foldername`;
- **Realtime**: Postgres Changes, a RLS por assinante, o `filter`;
- **PG 17**: `ALTER POLICY`, `split_part`/regex, funções `immutable` em predicado.

---

## As frentes, e por que nesta ordem

- **A, o censo e o "antes".** Os 33 fatos remedidos; o `PLAN-F67B.md`; as tabelas-verdade do Storage (por policy, por
  função, por escritor e leitor, por família de caminho) e do Realtime; e o "antes" nos dois bancos, inclusive o conta a
  conta e as 13 checagens.
- **B, as travas, vermelhas.** A regra 4 da §4 do plano: trava antes da correção.
- **C, o banco.** A EXPANSÃO em lotes (aceita a forma antiga E a nova; cria as funções novas; a 12ª reconhece as duas). A
  CONTRAÇÃO em arquivo separado, aplicada em produção só depois do deploy (fecha o que quebraria o app velho).
- **D, o TS.** `caminho.ts`, as quatro famílias, `persistirTermo`, o passo dos `.docx` do import, a ferramenta de órfão, o
  filtro do Realtime.
- **E, os roteiros, o injetor, o rollback e o conta a conta.**
- **F, os documentos**, inclusive a ficha F67B reescrita.
- **G, o fechamento, com ordem rígida.** Versão → revisão adversarial → SHA congelado → CI verde → no ensaio: expansão,
  provas, contração → em produção: expansão e provas → merge → deploy → conferência → a janela → contração em produção →
  Parte B → relatório → PR de documentação → tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F67B do `docs/PLANO-MULTIEMPRESA.md` (§7): Storage e Realtime por empresa. Ao terminar:
- o bucket `termos` decide pelo JOIN com `termos_gerados`, nunca pelo caminho. Ler um `.docx` exige ser membro ativo da
  empresa da linha que o referencia. Escrever exige poder escrever o termo daquela linha, e o degenerado (`ativo_ids =
  '{}'`) ainda é apagável pelo admin DA EMPRESA DELE. Objeto sem linha não é lido nem escrito por ninguém da sessão.
  `pode_ler_arquivo_termo` saiu da lista de exceções de `definer_sem_tenant.sql`. Nenhum objeto se moveu;
- `persistirTermo` grava a linha antes do upload, com rollback correto nos dois ramos (INSERT e UPDATE), e só depois do
  deploy dessa inversão o `coalesce(…, true)` de `pode_escrever_arquivo_termo` virou `false`;
- o bucket `backups-import` é por empresa. As QUATRO famílias (import, reset, conflito, cópias de `.docx`) gravam com a
  empresa no caminho, montado por UMA função TS (`src/lib/storage/caminho.ts`) e pelo espelho SQL. As 4 policies exigem
  que a empresa do caminho seja uma em que quem pede é administrador. As RPCs que conferem o prefixo do backup conferem a
  forma nova. A 12ª checagem reconhece as formas nova e antiga;
- os objetos nas formas ANTIGAS continuam legíveis só pelo administrador da WAP, por uma cláusula legada FECHADA
  (decisão 16/11-1). Nenhuma outra empresa os vê;
- no import, só a cópia/remoção dos `.docx` depois da RPC usa o client administrativo (decisão 16/11-2), declarado em
  `superficie-admin.test.ts`;
- existe uma ferramenta NOMEADA na Zona destrutiva que limpa `.docx` sem linha, copiando antes de remover, com trilha;
- o Realtime assina as três tabelas com `filter: 'empresa_id=eq.<id>'`, com a empresa vinda do servidor. A trava de
  catálogo da publication exige que toda tabela nela tenha RLS, `empresa_id` e a policy de SELECT com o recorte pareado;
- **zero janela**: o que quebraria o app velho só foi fechado em produção depois do deploy e da prova (fato 33);
- **nada mudou para a WAP**, exceto o declarado: conta a conta em produção, antes × depois, os mesmos objetos lidos e
  escritos por membership, nos dois buckets. As únicas diferenças são os 3 `.docx` sem linha. O smoke, o conferidor e as
  13 checagens (com o #84 travado) estão iguais;
- a ficha F67B do plano está reescrita com o escopo real e os números medidos.

Uma run, um PR de código (com a expansão e a contração em arquivos separados) e um PR de documentação com a tag.
Versão `1.74.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1, §3 e §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 8, migration
    nunca se edita; a 10, a ORDEM de rollback);
  - a ficha **F67B** inteira no §7. Ela é a FONTE DA VERDADE do que entra, exceto onde esta ordem declara divergência
    medida (fatos 18, 19, 23, 25 e 28) e onde as decisões 16/11-1 e 16/11-2 do Johnny a mudam;
  - as fichas **F67C**, **F68**, **F69**, **F70** e **F72**, para saber o que NÃO antecipar.
- `docs/prompts/F67B-storage-e-realtime-por-empresa-ultracode.md`: o cabeçalho, com os **33 fatos medidos** e as
  decisões do Johnny. Este prompt os cita pelo número.
- `CLAUDE.md`, `AGENTS.md`, e os aninhados `supabase/CLAUDE.md`, `scripts/db/CLAUDE.md`, `src/lib/auth/CLAUDE.md`,
  `src/lib/termos/CLAUDE.md` e `src/components/relatorios/CLAUDE.md`. As regras permanentes 1, 2, 3, 5, 6, 7 e 8.
- **Os moldes:**
  - a **F67** (`docs/PLAN-F67.md`, `docs/RELATORIO-F67.md`, `docs/f67-evidencias/`): a expansão e a contração, a janela,
    o conta a conta e a tabela-verdade;
  - a **F54** (`docs/RELATORIO-F54.md`): a porta única de remoção, as cópias de `.docx` e a 12ª checagem;
  - a **F52** (`docs/PLAN-F52.md`): os prefixos de backup e a cascata de três nas RPCs;
  - a **F50** (`docs/RELATORIO-F50.md`): `storage_termo.sql`, `opcoesDaAssinatura`, `nomeDoCanal`;
  - a **F66** (`docs/RELATORIO-F66.md`): o recorte pareado e o Anexo F66 ("reescrever policy viva").

  Depois, o `RUNBOOK-BANCO.md` inteiro (as seções "`security definer`", "A janela do `drop`", "Rollback", os Anexos F65 a
  F67), o `ADR-002` §13–17, o `ADR-003`, a `docs/MATRIZ-REGRAS.md` e o `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e
  destinos, **nunca o `.env.local`**).
- O código, nesta ordem:
  - as migrations `0009`, `0018`, `0021`, `0031`, `0066`, `0069`, `0070`, `0089`, `0093`, `0100`, `0129`, `0132`, `0136`,
    `0164`, `0175`, `0176` e `0186`–`0193`, pelo corpo VIGENTE (`scripts/db/corpo-vigente.mjs`);
  - os roteiros `supabase/tests/storage_termo.sql`, `definer_sem_tenant.sql`, `catalogo_policies.sql` (§9),
    `catalogo_secdef.sql`, `isolamento_tenant.sql`, `cargo_por_empresa.sql`, `dev_destrutivo.sql`,
    `conflito_filiais.sql`, `import_substituir.sql`, `f67_rollback.sql` e `_asserts.sql`, e o
    `supabase/ci/bootstrap-storage.sql`;
  - o TS: `src/lib/actions/{termos,importar,dev-destrutivo,conflitos}.ts`, `src/lib/storage/copiar-antes-de-remover.ts`,
    `src/lib/validators/{importar,conflitos,tetos-coluna}.ts`, `src/lib/escopo/{chave,pertencimento,empresa-da-filial}.ts`,
    `src/lib/auth/empresa-legada.ts` e a catraca, `src/lib/relatorios/assinatura-realtime.ts`,
    `src/components/relatorios/realtime-refresh.tsx`, as três páginas que o montam (fato 26),
    `src/lib/supabase/superficie-admin.test.ts`, `src/lib/actions/backup-completude.test.ts`, `src/lib/queries/dev.ts`
    e `src/lib/itens/migrations-f38.test.ts`;
  - os scripts `scripts/db/{restaurar,classificar-migration,mutacoes,run-mutation-tests,corpo-vigente}.mjs`,
    `scripts/perf/conta-a-conta.mjs`, `scripts/smoke/{smoke-prod,integridade,alarme}.mjs`,
    `scripts/smoke/linha-de-base.json`, `scripts/formas/conferir.mts` e `.github/workflows/{ci,saude}.yml` (só leitura).

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 33 fatos, no cabeçalho desta ordem. Os de produção foram medidos pelo conector, só contagem; os do ensaio, não
(fato 5). Remeça cada um contra o disco e os dois bancos de hoje antes de agir. Onde a sua medição contrariar o número
escrito, **a sua medição ganha**, desde que vá para o relatório. Os que mais importam:
- **fato 1**: a primeira migration é a `0194`, e a versão é `1.74.0`;
- **fato 4**: as 13 checagens hoje, nos dois bancos, na primeira hora da run. Elas viram a linha travada;
- **fato 5**: o conector alcança o ensaio? Se não, veja "Bloqueios";
- **fato 16**: as contagens por forma de caminho, nos dois bancos;
- **fatos 18 e 19**: TODO escritor de `backups-import` (TS, SQL, scripts) e TODO reconhecedor de forma (a 12ª, o
  restaurador, as RPCs). Uma família esquecida = backup gravado sem empresa, ou backup novo contado como órfão;
- **fato 25**: a documentação oficial do Realtime sobre a RLS por assinante. Se ela disser outra coisa, a trava da
  publication muda de natureza, e isso vai para a ata;
- **fatos 13 e 14**: o que cada operação do Storage exige de RLS, e o DELETE direto bloqueado.

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
    --alvo=ensaio|producao --saida=docs/f67b-evidencias/…`;
  - `node scripts/perf/conta-a-conta.mjs gerar|analisar|embrulhar …` com a fase nova;
  - a Parte B: `gh workflow run saude.yml -f alvo=producao -f partes=b`.
- O MCP da Supabase: `list_projects`, `execute_sql` (só leitura), `apply_migration`, `list_migrations`, `get_advisors`
  (segurança E performance) e `generate_typescript_types`.

**Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`. **Não rode** `supabase db push`, `migration
repair` nem `db reset --linked`. **Não suba** `next dev`/`next start` contra o ensaio. **Não chame** nenhuma RPC
destrutiva, de conta ou de import em banco vivo. **Não grave, não copie, não mova e não apague objeto** de Storage em
banco vivo (nem a ferramenta nova): a prova delas é no CI.

# Escopo

## Dentro: sete frentes, nesta ordem

### Frente A: o censo e o "antes"
O primeiro entregável é `docs/PLAN-F67B.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`. Ele
contém:
- **Os 33 fatos remedidos**, com cada divergência contra a ficha anotada.
- **A tabela-verdade do Storage**:
  - por policy de `storage.objects` (as 8): o predicado de hoje, o da expansão e o da contração;
  - por função SQL que decide sobre objeto (`pode_ler_arquivo_termo`, `pode_escrever_arquivo_termo`,
    `pode_escrever_termo`, os `prefixo_backup_*`, `import_validar_plano`, as RPCs que conferem o caminho do backup e a
    12ª checagem): o corpo de hoje e o novo;
  - por escritor e leitor TS e script: o client (sessão ou administrativo), a operação (upload, `upsert`,
    `createSignedUrl`, `copy`, `remove`, download) e a permissão RLS que ela exige, confirmada na documentação;
  - por família de caminho (fato 18): a forma antiga → a nova, o montador TS, o espelho SQL, quem valida, quem reconhece
    (a 12ª) e quem restaura (`restaurar.mjs`).

  Nenhuma linha fica sem destino.
- **A tabela-verdade do Realtime**: as três tabelas da publication (RLS, `empresa_id`, policy de SELECT, md5, linhas
  fora da legada), as três montagens e de onde vem a empresa de cada uma.
- **O desenho**, com as decisões 1 a 18 de "Autonomia" tomadas por escrito.
- **A ordem das migrations e a fronteira expansão | contração**: o que entra em cada lado, e por que cada item da
  contração quebraria o app velho (fato 33). **A ORDEM DE ROLLBACK** (o inverso do apply), também no rodapé de cada
  migration.
- **O "antes", nos dois bancos**, pelo MCP, só leitura, em `docs/f67b-evidencias/antes/`:
  - o md5 de `qual`/`with_check` de TODAS as policies (`public` e `storage`) e o md5 do `prosrc` de TODAS as funções de
    `public`, com assinatura;
  - as contagens de objetos por bucket e por FORMA de caminho (fato 16), com as regexes escritas;
  - as 13 checagens de integridade (os números do #84, a 8ª e a 12ª);
  - a publication e as policies das três tabelas;
  - os advisors de segurança e de performance, contados por nível e nome;
  - **o conta a conta "antes"** (decisão 15).

  Só contagem, nome de objeto de esquema, texto de esquema e hash. **Nenhum nome de objeto de Storage**: um caminho
  carrega id, slug, carimbo e digest de linha real.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f67b-evidencias/`. Fica vermelha no PR em
rascunho e verde no commit seguinte (o molde das F64 a F67).
- **`supabase/tests/storage_por_empresa.sql`** (o nome é da ficha). Com duas empresas fictícias e as policies REAIS:
  - **`termos`**:
    - o admin, o operador e o consulta da A NÃO leem nem escrevem o `.docx` de um termo da B;
    - os da B leem os seus, e o par simétrico ACEITA o legítimo;
    - o objeto SEM linha não é lido nem escrito por ninguém (nem pelo admin da legada);
    - **o admin da A ainda apaga o termo degenerado da A**, e o da B não o alcança (a "não-imortalidade" da `0069`, por
      empresa).
  - **`backups-import`**:
    - o admin da A lista, lê, cria, atualiza e apaga só sob a empresa A, e é recusado sob a B;
    - o operador e o consulta da A não alcançam nada;
    - um caminho fora de toda forma (sem empresa e fora da lista legada) não é alcançado por ninguém;
    - **as formas antigas são LIDAS pelo admin da WAP, e só por ele** (decisão 16/11-1): o admin só da B não lê;
    - depois da contração, ninguém GRAVA na forma antiga.

  Hoje reprova (o termo sem linha, o join, a empresa do caminho).
- **`src/lib/storage/caminho.test.ts`** (o nome é da ficha):
  - toda função exportada de `caminho.ts` devolve um caminho com o segmento de empresa na posição decidida;
  - nenhum arquivo de `src/**` ou `scripts/**` monta caminho de `backups-import` por fora dela. É uma varredura, no molde
    de `backup-completude.test.ts`: um literal `'import/'`, `'reset/'`, `'conflito/'`, `'ativo/'` ou `'/termos/'` fora
    da lista nominal reprova;
  - o espelho SQL bate com o TS, pelo texto lido do corpo vigente.

  Hoje reprova.
- **A trava do Realtime**, em duas metades:
  - mesa (`assinatura-realtime.test.ts`): `opcoesDaAssinatura` SEMPRE emite `filter: 'empresa_id=eq.<uuid>'`, recusa
    empresa vazia ou malformada, e o componente não monta assinatura por fora dela;
  - catálogo (`catalogo_policies.sql` §9, estendido, não duplicado): toda tabela da publication tem RLS ligada, a coluna
    `empresa_id` e uma policy de SELECT com o recorte pareado da F66 (lida pela forma, não por md5 fixo).

  Hoje a metade da mesa reprova.
- **`definer_sem_tenant.sql`**: `pode_ler_arquivo_termo` sai das exceções e passa a chamar uma primitiva POR EMPRESA (a
  lista nominal da F67). Hoje reprova se a lista de exceções perder o nome sem o corpo mudar.
- **A trava da legada no Storage**, de catálogo (decisão 14): nenhuma policy de `storage.objects` e nenhuma função que
  decide sobre objeto cita `empresa_legada()`, fora da cláusula legada NOMINAL da decisão 16/11-1, com motivo escrito.
  Hoje reprova pelas 7 policies da `0187`, por `pode_ler_arquivo_termo` e pelo ramo degenerado.
- **A 12ª checagem reconhece as formas novas**, num roteiro:
  - para cada família, um backup na forma NOVA com a sua trilha (`import_logs` ou `eventos_admin`) e a cópia de `.docx`
    não conta como órfão;
  - o mesmo na forma ANTIGA continua não contando;
  - um objeto sem trilha, nas duas formas, continua contando.

  Hoje reprova pela forma nova.
- **O termo invertido**, na mesa: o teste de `persistirTermo` com o client simulado prova a ordem (linha → upload no
  INSERT; o desenho escolhido no UPDATE) e o rollback de cada ramo. Hoje reprova.

### Frente C: o banco (migrations `0194`+)
Migrations pequenas, por lote, na ordem de dependência. Cada uma leva:
- o cabeçalho de classe, validado pelo classificador;
- o diff contra o corpo vivo de cada função recriada;
- o rollback no rodapé;
- `db:lock` no mesmo commit; entrada em `DA_F38` e em `RECRIACOES_AUTORIZADAS`;
- um nome-sem-prefixo que não repita;
- `set lock_timeout = '2s'`/`reset`, sem `begin`/`commit`;
- grants explícitos em toda função nova: `revoke all … from public, anon` e o `grant` mínimo.

**Sem `update`/`delete` em tabela de negócio, sem tocar objeto do Storage, sem `cascade`, sem DDL dinâmica, sem mexer em
default de coluna** (F67C).

A proposta de lotes (decisão 10; a ordem final é sua, escrita):
1. **As primitivas de caminho**: a função que extrai a empresa de um caminho de backup (decisão 3); os montadores SQL
   novos por família (decisão 1), ao lado dos antigos; a classificação "forma legada" (decisão 2).
2. **`backups-import`, EXPANSÃO**: as 4 policies aceitam a forma NOVA pela empresa do caminho (∧ admin daquela empresa) E
   a forma ANTIGA pela legada explícita, como hoje. As RPCs que conferem o caminho (`import_validar_plano`,
   `resetar_acervo`, `resetar_itens`, `apagar_ativos_conflito_filiais`) aceitam as duas formas. A mudança nelas é SÓ
   essa, e o diff do `prosrc` prova isso.
3. **A 12ª checagem** reconhece as duas formas (em `checagens_integridade_nucleo`; as delegantes não mudam).
4. **`termos`, a parte que não quebra o app velho**: `pode_escrever_termo` (o degenerado pela empresa da linha) e as
   policies de escrita sem a legada explícita, desde que o predicado novo dê, com o `coalesce` ainda `true`, a MESMA
   resposta para o app no ar. Se não der, vai para a contração.
5. **A CONTRAÇÃO**, em arquivo(s) separado(s), aplicada em produção só depois do deploy e da prova (Frente G, passo 10):
   - `pode_escrever_arquivo_termo` com `coalesce(…, false)`;
   - `pode_ler_arquivo_termo` pelo join, se a decisão 10 a puser aqui (o fato 13 diz por quê);
   - as policies de escrita de `backups-import` só na forma nova; a cláusula legada só de LEITURA (decisão 16/11-1);
   - as RPCs aceitando só a forma nova;
   - o `drop` dos montadores SQL antigos, sem `if exists` e sem `cascade`.

Se uma migration de expansão recriar uma RPC destrutiva só para aceitar a forma nova, a mudança nela é SÓ essa. A F67
mediu os corpos: o diff tem de mostrar só a cláusula do prefixo.

### Frente D: o TS
- **`src/lib/storage/caminho.ts`**: a função única de montagem de caminho de `backups-import`, uma por família, cada uma
  recebendo a empresa explícita. Os montadores de hoje (`prefixoBackupImport`, o caminho do reset em `dev-destrutivo.ts`,
  `PREFIXO_BACKUP_CONFLITO`, as raízes de `copiar-antes-de-remover.ts`) passam a delegar a ela, ou somem. Os quatro
  escritores passam a empresa pelo caminho que a F67 já usa: `empresaDaFilial` onde há filial, e `empresaDaOperacao()`
  onde não há (o "tudo", a mesa). O banco confere de novo.
- **`persistirTermo`** (decisão 6): a linha antes do upload no INSERT, com o rollback da linha se o upload falhar. O ramo
  UPDATE (id reutilizado, mesmo caminho) sem janela em que a linha diga uma coisa e o arquivo outra, ou com a janela
  declarada e mínima. Os órfãos de variantes (fato 6: hoje zero casos) por um caminho que não crie objeto sem linha nem
  linha sem objeto.
- **O passo dos `.docx` do import** (decisão 16/11-2): o client administrativo SÓ em `copiarEntaoRemoverTermos` depois da
  RPC. `importar.ts` entra em `superficie-admin.test.ts` com motivo e guarda. O cabeçalho do módulo (`:57`) e o comentário
  de `:720` passam a dizer a exceção, por extenso. O destino das cópias é a forma nova.
- **A ferramenta nomeada de órfão** (decisão 9), na Zona destrutiva.
- **`urlBackup` e a fechadura de pertencimento** (decisão 12).
- **O Realtime** (decisão 13): `RealtimeRefresh` recebe a empresa por prop das três páginas (Server Components);
  `opcoesDaAssinatura(table, empresaId)` emite o filtro. Os comentários de `assinatura-realtime.ts`, `escopo/chave.ts` e
  `realtime-refresh.tsx` são corrigidos (fato 25). Se a empresa sair de `empresaDaOperacao()`, a catraca conta cada nova
  ocorrência com destino F70.
- **`scripts/db/restaurar.mjs`** aceita as duas formas, e o seu teste prova as duas.
- **As frases pt-BR** das recusas novas (backup de outra empresa, caminho fora da forma) em `erros-do-banco.ts`,
  conferidas contra o esquema vivo (`erros-do-banco-sql.test.ts`).
- **`src/lib/queries/dev.ts`**: se o catálogo de checagens descreve a 12ª, o texto acompanha.

### Frente E: os roteiros, o injetor, o rollback e o conta a conta
- **Os roteiros existentes** que dependem do comportamento de hoje (`storage_termo.sql`, `dev_destrutivo.sql`,
  `conflito_filiais.sql`, `import_substituir.sql`, `isolamento_tenant.sql`, os que montam caminho de backup): ajustados um
  a um, com a lista no relatório. Onde a asserção provava "lê sem linha" e a fase o fecha, ela vira a asserção do join,
  declarada. **Nenhuma asserção muda para passar.**
- **O rollback**: `supabase/rollback/F67B-desfaz.sql`, na ordem inversa. Ele cobre os dois estados: só expansão, e
  expansão + contração. Fica ensaiado por `supabase/tests/f67b_rollback.sql` até a impressão do CI tirada antes da
  `0194`, com o irmão de mesa `rollback-f67b.test.ts`. Os rollbacks F62 a F67 são medidos no CI com a F67B no lugar.
- **O injetor** (decisão 16).
- **O conta a conta** (decisão 15).

### Frente F: os documentos
- **A ficha F67B, reescrita** no `PLANO-MULTIEMPRESA.md`:
  - o escopo real (as quatro famílias, a 12ª, a janela, a cláusula legada, o client administrativo do import);
  - os números medidos;
  - as divergências declaradas (fatos 18, 19, 23, 25 e 28);
  - a linha da tabela de fases e a entrega real.
- **A ficha F67C**: só as notas que esta fase deixar explícitas para lá (se alguma escrita de Storage depender do default
  de `termos_gerados.empresa_id`, por exemplo).
- **A nota da F70**: o Realtime de quem é membro de mais de uma empresa (e da plataforma) filtra pela empresa da SESSÃO;
  `empresaDaOperacao()` no filtro é a legada até lá.
- **A nota da F71**: as frases do `CLAUDE.md` da raiz sobre Storage e Realtime que esta fase deixou desatualizadas, só
  listadas. **Este arquivo NÃO é editado aqui.**
- **MATRIZ**: a emenda F67B a partir do R-ACC-131. Ela fixa:
  - o termo pelo join;
  - o objeto sem linha fechado;
  - o backup com a empresa no caminho e a função única;
  - a cláusula legada só de leitura e só para a WAP;
  - o client administrativo nominal do import;
  - a trava do catálogo da publication e o filtro do Realtime.
- **ADR e RUNBOOK**:
  - o `ADR-002` ganha o §18 (Storage e Realtime por empresa: o join, o caminho, a cláusula legada e por que a "RLS na
    publication" é a RLS da tabela);
  - o `RUNBOOK-BANCO.md` ganha o **Anexo F67B**, "trocar a FORMA DO CAMINHO de objeto com o app no ar": expansão (as duas
    formas) → deploy → a janela por contagem de objetos novos na forma antiga → contração. Inclui o rollback dos dois
    estados e a limpeza de órfão pela ferramenta nomeada.
- **Os `CLAUDE.md` aninhados** cujo contrato mudou (`src/lib/termos/CLAUDE.md`, `supabase/CLAUDE.md`,
  `src/components/relatorios/CLAUDE.md` se citar o Realtime): atualizados. O da raiz, não (F71).
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`: as decisões do Johnny (16/11-1 e 16/11-2, e as herdadas que esta fase aplica) e as
  dezoito da fase.

### Frente G: o fechamento, nesta ordem
1. `1.74.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real. Por exemplo:
   - os termos de responsabilidade só abrem e baixam para quem é da empresa do termo;
   - os backups de import, de reset e de conflitos passam a ficar guardados por empresa, e os antigos continuam
     disponíveis para os administradores da WAP;
   - o "ao vivo" dos relatórios e de Itens passa a acordar só com o que acontece na sua empresa;
   - a Zona destrutiva ganha uma ferramenta para limpar arquivos de termo sem registro, guardando uma cópia antes.

   Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F67B.md`. Depois dele, só `docs/**` e `CHANGELOG.md`. Ele CONTÉM a contração.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **No ENSAIO**, pelo `apply_migration` do MCP, com o `name` certo:
   - logo antes: o "antes" refeito;
   - os lotes de EXPANSÃO, um a um. Depois de cada um: o md5 de cada policy e função tocada = o do CI; as outras byte a
     byte;
   - depois da expansão: o conta a conta (0 divergência fora das declaradas), o `notify pgrst`, os advisors, o
     conferidor (0 recusadas) e as 13 checagens iguais;
   - a CONTRAÇÃO (o ensaio não tem app de produção: lá ela não espera deploy), e de novo o conta a conta, o conferidor e
     as 13.

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com a correção em migration NOVA.
6. **Em PRODUÇÃO**, só a EXPANSÃO, dentro de 24 h do commit das migrations, com as mesmas provas, lote a lote.
   - Imediatamente antes do primeiro lote: o conta a conta "antes" e as 13 checagens.
   - Depois do último lote de expansão:
     - o conta a conta (0 divergência fora das declaradas);
     - `node scripts/smoke/smoke-prod.mjs` a partir da branch;
     - o conferidor contra PRODUÇÃO (a conta do smoke, só contagens) com 0 recusadas;
     - os advisors;
     - as 13 checagens iguais;
     - a paridade ensaio × produção, menos o delta declarado da contração que só o ensaio tem.

   Smoke, conferidor, conta a conta ou checagem reprovou? **Rollback imediato em produção** do que foi aplicado, antes do
   diagnóstico, sem merge, com o registro no topo do relatório.
7. Ata e `docs/RELATORIO-F67B.md` com o que já dá para escrever. O PR sai do rascunho. Merge com os dois checks verdes,
   logo depois das provas.
8. **O deploy e a conferência, só leitura**: `/api/saude` com `1.74.0` e o commit do merge; o smoke com 0 falha.
9. **A janela** (fato 33, no molde do Anexo F67):
   - T0: as contagens de objetos por forma e por bucket, só número;
   - a prova estática: o `git grep` dos montadores antigos em `src/**` e `scripts/**` sai vazio, e o SHA no ar = o merge;
   - uma janela de ≥ 30 min;
   - T1;
   - a condição: **nenhum objeto NOVO numa forma antiga** entre o deploy e T1. Δ 0 por ausência de operação é o
     esperado: declare.
10. **A CONTRAÇÃO em PRODUÇÃO**, só com a condição atendida. Depois dela: o conta a conta, o smoke, o conferidor, os
    advisors, as 13 checagens e a paridade ensaio × produção (agora iguais).
11. **A Parte B** do `saude.yml` disparada à mão:
    - a deriva sem pendente;
    - as 13 checagens **iguais aos números travados** (os dois do #84 e a catraca da 8ª em 3, nem um a mais);
    - qualquer número maior, ou achado novo, é bloqueio (ver "Bloqueios").

    Nenhuma captura de tela de produção.
12. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.74.0` vai no merge
    dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Das outras fases:**
  - o default `empresa_legada()` de QUALQUER coluna, inclusive `termos_gerados.empresa_id` e `import_logs.empresa_id`
    (F67C);
  - a empresa da sessão na tela, e o seletor (F70);
  - `profiles`, `membros`, `plataforma_admins` e a saída das contas dev de `membros` (F69);
  - a porta pública e o visualizador por senha, inclusive `ViewerAutoRefresh` (F68);
  - o `CLAUDE.md` da raiz (F71);
  - o piso e a sua revogação (F72).
- **O que esta ordem acrescenta:**
  - mover, copiar, renomear ou apagar objeto do Storage em banco vivo, inclusive rodar a ferramenta de órfão nos 3
    `.docx` de produção. Ela é entregue, não executada;
  - reescrever `import_logs.backup_path`, `termos_gerados.arquivo_path` ou `eventos_admin.detalhe`;
  - editar migration aplicada; `update`/`delete` em tabela de negócio; criar coluna `text` numa das 20 sem teto;
  - consertar os dados do #84, ou subir a linha de base do alarme ou do smoke (decisão 13/11-3);
  - chamar RPC destrutiva, de conta ou de import em banco vivo;
  - `cascade`, `drop … if exists` na contração, DDL dinâmica em migration;
  - afrouxar o classificador, a guarda de topo, a doutrina do predicado, os catálogos das F48 a F67, ou pôr exceção
    nominal sem motivo e sem migration;
  - o client administrativo em qualquer passo do import além do dos `.docx` depois da RPC (decisão 16/11-2);
  - Broadcast/Presence e as policies de `realtime.messages`; tabela nova na publication;
  - `.github/workflows/**` e a proteção da `main`;
  - dependência nova, `.env*`, `scratchpad/`, os PRs do dependabot, o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F67B.md` tem: os 33 fatos remedidos; as tabelas-verdade do Storage e do Realtime, sem linha sem destino; as
   dezoito decisões; a ordem das migrations; a fronteira expansão | contração com o porquê de cada item; e a ORDEM DE
   ROLLBACK. Ele é anterior ao primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
3. O "antes" existe nos dois bancos, tirado antes de qualquer apply, com o conta a conta, as contagens por forma e as 13
   checagens. Só números, nomes e textos de esquema e hashes: nenhum nome de objeto de Storage.
4. As migrations começam na `0194`, com cabeçalho de classe validado, o diff contra o corpo vivo, rollback no rodapé,
   `db:lock` no mesmo commit e entrada em `DA_F38` e `RECRIACOES_AUTORIZADAS`. Não há `update`/`delete` de negócio,
   toque em objeto do Storage, `cascade`, DDL dinâmica, default mudado nem nome-sem-prefixo repetido. A contração está em
   arquivo próprio.
5. **`termos` pelo join**: ler exige ser membro ativo da empresa da linha; escrever exige poder escrever o termo daquela
   linha; o objeto sem linha fecha para todos da sessão; o admin da A ainda apaga o degenerado da A, e o da B não. O
   `coalesce` é `false`. `pode_ler_arquivo_termo` saiu das exceções de `definer_sem_tenant.sql`.
6. **`persistirTermo`**: a linha antes do upload no INSERT, com rollback; o ramo UPDATE sem janela, ou com a janela
   declarada; os órfãos de variantes por um caminho que não cria objeto sem linha. Provado na mesa, nos dois ramos e nas
   falhas.
7. **`backups-import` por empresa**: as quatro famílias montam o caminho por `caminho.ts`, com a empresa; as 4 policies
   decidem pela empresa do caminho ∧ admin dela; as RPCs aceitam só a forma nova depois da contração.
   `storage_por_empresa.sql` e `caminho.test.ts` estão verdes, nasceram vermelhos e sabem ficar vermelhos.
8. **A cláusula legada** (decisão 16/11-1) é FECHADA (a lista nominal das formas antigas, escrita), só de LEITURA e só
   para o admin da WAP. O admin só da B não lê nenhum objeto antigo. O "Baixar backup" dos 12 imports antigos funciona
   para a WAP como antes.
9. **A 12ª checagem** reconhece as formas nova e antiga, nas quatro famílias. `restaurar.mjs` aceita as duas.
10. **O import** usa o client administrativo SÓ na cópia/remoção dos `.docx` depois da RPC, declarado em
    `superficie-admin.test.ts` com motivo e guarda. O cabeçalho de `importar.ts` diz a exceção.
11. **A ferramenta de órfão** existe na Zona destrutiva: é só do dev (decisão 13/11-1), copia antes de remover pela porta
    única, grava trilha, e a cópia é reconhecida pela 12ª. Provada no CI. Não executada em banco vivo.
12. **O Realtime**: as três assinaturas com `filter: 'empresa_id=eq.<id>'`, com a empresa vinda do servidor por prop; a
    trava de mesa e a trava de catálogo da publication verdes; os comentários do fato 25 corrigidos; a documentação
    oficial citada no relatório.
13. **Zero janela**: a contração em produção só depois do deploy e da janela, com T0, T1 e a prova estática em
    `docs/f67b-evidencias/`.
14. **Nada mudou para a WAP**: o conta a conta em produção, depois da expansão e depois da contração, com 0 divergência
    fora das declaradas (os 3 `.docx` sem linha). O smoke deu 0 falha. O conferidor deu 0 recusadas no ensaio e em
    produção. As 13 checagens estão iguais aos números travados.
15. As policies e funções fora da tabela-verdade estão byte a byte (md5 do "antes" × "depois"), e as tocadas batem com o
    CI. Os advisors de segurança não ganharam nada não declarado. A paridade ensaio × produção fecha.
16. O rollback cobre os dois estados, está em `supabase/rollback/F67B-desfaz.sql` e foi **ensaiado no Postgres do CI**.
    Os rollbacks F62 a F67 foram medidos com a F67B no lugar, e o resultado está declarado.
17. Os roteiros adaptados estão listados, com o motivo de cada um, e nenhuma asserção mudou para passar.
18. A decisão sobre o injetor está na ata. As mutações entraram e são detectadas pelo cenário nomeado. O teto está no
    número exato (170 → N), com o porquê datado, e a quarentena abaixo de ⅓.
19. `database.ts` mudou SÓ no que esta fase mudou de assinatura (ou não mudou), e `db:types:diff` está verde.
20. Os documentos estão feitos:
    - o `PLANO-MULTIEMPRESA.md`, com a ficha F67B reescrita e as notas F67C/F70/F71;
    - a MATRIZ (F67B), o `ADR-002` §18 e o `RUNBOOK-BANCO.md` (Anexo F67B);
    - os `CLAUDE.md` aninhados tocados, os índices e a ata.
21. Nenhuma dependência nova. Ficaram intocados `.github/workflows/**`, o `CLAUDE.md` da raiz, os defaults e
    `ViewerAutoRefresh`. Nenhum número de linha de base subiu. Nenhum objeto de Storage foi tocado em banco vivo.
22. `package.json` em `1.74.0`, e `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.74.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
23. As sabotagens A a J estão com saída real em `docs/f67b-evidencias/`.
24. Nenhum dado real (nome, e-mail, id, patrimônio, slug, caminho de objeto, texto de linha) em migration, teste,
    roteiro, evidência ou log. Da produção, só números, nomes de esquema, textos de esquema e hashes. Ninguém abriu o
    `.env.local`.
25. `docs/RELATORIO-F67B.md` segue o padrão F45 a F67, com o roteiro do Johnny no topo, o estado de repouso e a seção
    "o que este relatório NÃO prova".

# Verificação: rode de verdade
A cada incremento, rode `npm run lint`, `npm run test` e `npm run typecheck`. Rode `npm run build` antes de cada push.
Tudo o que é SQL (roteiros, injetor, `db:types:diff`) passa pelo `banco-sem-docker` do PR. Leia a falha, corrija a
**causa raiz** e repita até passar.

Não faça nada disto para um teste passar:
- alargar exceção para caber um caso que devia reprovar;
- trocar detecção por `skip`;
- afrouxar um catálogo, o classificador ou a guarda de topo;
- subir a linha de base;
- mudar uma asserção existente sem conferir que ela prova a mesma coisa;
- abrir a cláusula legada para "qualquer caminho sem empresa" em vez da lista fechada.

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**O OBJETO TEM DONO: O TERMO PELA LINHA, O BACKUP PELO CAMINHO. O ANTIGO SÓ FECHA DEPOIS QUE NINGUÉM MAIS O FAZ.** O
conta a conta e as 13 checagens iguais no ensaio são o portão do apply de produção. Os mesmos em produção, mais o smoke e
o conferidor, são o portão do merge. Nenhum objeto novo na forma antiga é o portão da contração.

Provas obrigatórias, cada uma com a saída real em `docs/f67b-evidencias/`:
- **Sabotagem A, o termo pelo caminho.** Numa subtransação, `pode_ler_arquivo_termo` voltando a ignorar o nome: o
  consulta da A lê o `.docx` da B, e `storage_por_empresa.sql` acusa. A trava de `definer_sem_tenant.sql` também.
- **Sabotagem B, o `coalesce`.** `pode_escrever_arquivo_termo` com `true` de volta: um objeto sem linha fica gravável e
  apagável, e o roteiro acusa pelo nome.
- **Sabotagem C, o degenerado.** O ramo degenerado fechando para todos (o lixo imortal da `0069`): o admin da A não apaga
  o próprio degenerado, e o roteiro acusa. E abrindo para qualquer admin: o da B apaga o da A, e o roteiro acusa.
- **Sabotagem D, o backup sem empresa.** Uma policy de `backups-import` sem a empresa do caminho: o admin da B lê o
  backup da A, e o roteiro acusa. E um montador de `caminho.ts` sem o segmento de empresa: `caminho.test.ts` vermelho.
- **Sabotagem E, a cláusula legada aberta.** A cláusula como "qualquer caminho sem empresa" (em vez da lista fechada):
  um caminho novo fora de toda forma passa a ser lido pelo admin da WAP, e o roteiro acusa. E a cláusula sem o "só
  leitura": o admin da WAP grava na forma antiga depois da contração, e o roteiro acusa.
- **Sabotagem F, a 12ª.** Sem o reconhecimento da forma nova, um backup novo com cópia de `.docx` e trilha conta como
  órfão, e o roteiro acusa.
- **Sabotagem G, o Realtime.** `opcoesDaAssinatura` sem `filter`: a trava de mesa vermelha. E, no catálogo, uma tabela da
  publication com a policy de SELECT sem o recorte (numa subtransação): a trava §9 estendida vermelha.
- **Sabotagem H, o import.** `importar.ts` com o client administrativo num passo além do dos `.docx`:
  `superficie-admin.test.ts` (ou a trava que você escrever) vermelha.
- **Sabotagem I, "nada mudou".** O conta a conta com 0 divergência fora das declaradas, com o número de memberships, de
  objetos e de avaliações. E a prova de que o bloco SABE achar divergência: no ensaio, dentro do próprio bloco (que
  termina em `raise`), uma função sabotada dá > 0.
- **Sabotagem J, o rollback.** `F67B-desfaz.sql` devolve as policies e as funções à impressão de antes da `0194`, a
  partir dos dois estados. Os rollbacks F62 a F67 com a F67B no lugar, com a saída real e a declaração.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI;
  - mutações e teto;
  - `security definer` (69 → N) e o universo da trava (26 → N), com as exceções;
  - policies de `storage.objects` por predicado;
  - objetos por bucket e por forma (iguais: nada se move);
  - as 13 checagens;
  - o conta a conta (memberships × objetos × operações) nos dois bancos, antes, depois da expansão e depois da contração;
  - o conferidor (pontos, linhas, recusadas) no ensaio e em produção;
  - advisors por nível e nome;
  - T0/T1 da janela;
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco, os bancos de hoje e a documentação oficial;
2. as decisões do Johnny abaixo;
3. a ficha da F67B no §7 do plano, menos as divergências que esta ordem declara;
4. este prompt, no que ele detalha;
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, a MATRIZ, o código existente, os moldes
   F67/F54/F52/F50/F66);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**As decisões do Johnny:**
- **16/11-1, os backups antigos**: visíveis só ao administrador da WAP, por uma regra legada escrita e FECHADA. Nada muda
  para a WAP, e outra empresa nunca os vê.
- **16/11-2, o import**: o client administrativo SÓ na cópia/remoção dos `.docx` depois da RPC, como a Zona destrutiva e
  a mesa já fazem. O resto do import continua no client da sessão.
- **Herdadas, aplicadas aqui**:
  - 12/11-2: a divisão em F67/F67B/F67C;
  - 13/11-1, "dev sou só eu": a plataforma é o Johnny, e a ferramenta de órfão é dele;
  - 13/11-2: expandir e contrair, zero janela;
  - 13/11-3: os números das checagens travados, nada de consertar dado.

**As dezoito decisões que esta fase precisa tomar por escrito:**
1. **A forma do caminho novo, nas quatro famílias** (fato 18). A proposta: a família primeiro e a empresa em segundo,
   sempre na MESMA posição, para que uma regra só leia todas:
   - `import/empresa-<uuid>/filial-<id>/<carimbo>.json` (a forma da ficha);
   - `reset/empresa-<uuid>/<bloco>/<tudo|filial-N>/<carimbo>.json` (o `global` some, porque o "tudo" é a empresa);
   - `conflito/empresa-<uuid>/<digest>/<carimbo>.json`;
   - as cópias em `<raiz-da-forma-nova>/termos/<arquivo>`, e a raiz de `apagarAtivo` em `ativo/empresa-<uuid>/<ativo_id>`.

   A função única é `src/lib/storage/caminho.ts`, e o espelho SQL são os `prefixo_backup_*` novos (com a empresa como
   parâmetro, ao lado dos antigos, que caem na contração). Confira o teto do fato 22 com o pior caso. A alternativa,
   empresa primeiro (`empresa-<uuid>/import/…`), perde: contradiz a ficha e todos os `like 'reset/%'` medidos.
2. **A cláusula legada** (decisão 16/11-1): uma lista FECHADA e nominal das formas antigas que existem ou existiram (a
   histórica `<slug>/<carimbo>.json`, `import/filial-N/…`, `reset/<bloco>/<global|filial-N>/…`, `conflito/<digest>/…`,
   `ativo/<id>/termos/…` e as cópias `…/termos/…` de cada uma). Ela vale numa função nomeada, para a policy e a 12ª
   lerem a mesma definição.
   - Só LEITURA, e só `e_admin_na(empresa_legada())`. É a exceção nominal da trava da legada no Storage, com motivo
     escrito.
   - A gravação na forma antiga fecha na contração.
   - Apagar objeto antigo: a proposta é fechar para a sessão (ninguém do app apaga objeto antigo hoje; só a
     ferramenta/script). Meça e declare.
   - "Qualquer caminho sem empresa" é PROIBIDO (sabotagem E).
3. **Como a policy lê a empresa do caminho** (fato 23). A proposta: uma função `public` imutável, `search_path` travado,
   que devolve o `uuid` do segmento de empresa ou null fora da forma nova. A policy fica `(bucket) and
   public.<empresa_do_caminho>(name) = any(array(select public.empresas_de_admin()))`, no formato que a doutrina da F59
   aceita (confira `policies-initplan`, `k_excecoes_predicado` e o `medir-rls.mjs`). A alternativa (o espelho de
   `storage.foldername` no bootstrap do CI) perde: é um segundo lugar para envelhecer. Decida se o piso
   `(select e_admin())` pareado entra (a trava Q da F67 exige o par do MESMO cargo).
4. **`termos`, a leitura pelo join.** A proposta: `pode_ler_arquivo_termo(p_nome)` = existe linha de `termos_gerados` com
   `arquivo_path = p_nome` e `papel_na_empresa(t.empresa_id) is not null`. Ela chama a primitiva por empresa e sai das
   exceções. Confira o custo com o `createSignedUrl` de listagem (o comentário InitPlan da `0129`) e o índice em
   `arquivo_path`; se faltar índice, é migration ADITIVA, declarada.
5. **`termos`, a escrita.** A proposta:
   - `pode_escrever_arquivo_termo(p_nome)` = `coalesce(…, false)`, com o degenerado pela empresa DA LINHA
     (`e_admin_na(t.empresa_id)`), e não pela legada (o fato 10 e a ficha);
   - as 3 policies de escrita sem o `pode_escrever_na(empresa_legada())`, decidindo só pelo `bucket` e pela função (ou
     com o piso pareado, se a trava Q exigir; decida e escreva);
   - nada disso pode mudar a resposta para o app no ar antes do deploy da inversão (fato 33).
6. **`persistirTermo`.**
   - INSERT: a linha (com `arquivo_path`) → o upload → se o upload falhar, apagar a linha, e se isso também falhar,
     `registrarFalha` com o id (a 8ª e a "linha sem objeto" são as redes).
   - UPDATE (id e caminho reutilizados): escolha entre (a) upload → update, onde a falha do update deixa o arquivo novo
     com a linha antiga, e (b) update → upload, onde a falha do upload exige devolver os campos antigos. Declare a janela
     e a rede.
   - Os órfãos de variantes (fato 6: zero casos): remover o arquivo enquanto a linha ainda existe e então a linha, ou a
     ferramenta de órfão. Nunca um caminho que crie objeto sem linha no fluxo normal (a 8ª é catraca).
   - Confirme na documentação o que o upload com `upsert: true` exige (INSERT + SELECT + UPDATE).
7. **O passo dos `.docx` do import** (decisão 16/11-2): o client administrativo é criado SÓ ali, depois da RPC e depois
   de `exigirAdmin`. Ele é passado a `copiarEntaoRemoverTermos`, que já recebe o client de fora. A entrada em
   `superficie-admin.test.ts` diz o motivo ("a linha já saiu; a sessão não alcança mais o objeto") e a guarda
   (`exigirAdmin` + a RPC concluída). Nada mais do import muda de client.
8. **As RPCs que conferem o caminho do backup** (`import_validar_plano`, `resetar_acervo`, `resetar_itens`,
   `apagar_ativos_conflito_filiais`):
   - na expansão, aceitam a forma antiga OU a nova, e a nova com a empresa = `p_empresa` (ou a empresa da filial);
   - na contração, só a nova;
   - o resto do corpo, byte a byte;
   - a mensagem pt-BR da recusa continua lexicalmente disjunta entre import e reset (o comentário de
     `import_validar_plano`).
9. **A ferramenta de órfão** (a ficha; fato 14). A proposta:
   - uma Server Action da Zona destrutiva, só dev (`e_dev_na`/plataforma), atrás de uma RPC `security definer` nomeada
     que LISTA os objetos de `termos` sem linha (SQL fixo, sem parâmetro de tabela ou coluna);
   - a ação copia pela porta única (`copiar-antes-de-remover.ts`) para uma raiz NOVA e reconhecível (ex.:
     `orfao/<carimbo>/termos/`), com o client administrativo da Zona, e remove só o que copiou;
   - grava `eventos_admin` com a raiz, para que a 12ª reconheça a cópia;
   - confirmação digitada (`ConfirmacaoDigitada`, F61), com a contagem.

   Um objeto sem linha não tem empresa. Decida e escreva de quem é a raiz da cópia: a proposta é uma família que a
   cláusula legada NÃO abre e a policy nunca alcança pela sessão (só o service role). Se a ferramenta exigir mudar a 12ª
   de novo, é no mesmo lote do fato 19.
10. **Os lotes, a fronteira e a ordem** (fato 33). Cada item vai para a expansão ou para a contração, com o teste "o app
    no ar hoje continuaria funcionando com isto aplicado?":
    - não → contração;
    - a leitura por join: o app velho do import copia `.docx` pela sessão depois da RPC, o que dá "não" → contração (ou
      prove que não);
    - entre dois lotes, o estado é repouso válido.
11. **A janela, por contagem de objetos** (fato 33): o T0/T1 é a contagem de objetos por forma (antiga/nova) e por
    bucket, com `created_at` depois do deploy, só número. A condição: nenhum objeto novo em forma antiga. Repita a janela
    até três vezes em 2 h se não fechar; se persistir, a contração fica PENDENTE (repouso válido: as duas formas
    convivem).
12. **A fechadura de pertencimento de `urlBackup`** (fato 21). A proposta: `escopoDoImportLog` passa a ler a empresa do
    log (a coluna `empresa_id` de `import_logs`, F64) e `escopoDeGestaoAtual` a de `empresaDaOperacao()`. Com uma empresa,
    a comparação é sempre `true`; com duas, recusa antes do Storage. Ou, se a medição mostrar que o Storage já fecha e a
    fechadura vira redundante, ela fica como está, com o comentário corrigido. Decida.
13. **O Realtime** (fatos 24 a 27):
    - a empresa sai de `empresaDaOperacao()` num Server Component e chega a `RealtimeRefresh` por prop (nunca lida no
      cliente);
    - `opcoesDaAssinatura(table, empresaId)` valida o uuid e emite `empresa_id=eq.<id>`;
    - o filtro é "provadamente total" hoje (0 linhas fora da legada nas três tabelas, nos dois bancos): meça de novo e
      escreva;
    - a trava de catálogo (§9 estendido) é a "RLS na publication" da ficha, com o nome corrigido;
    - o nome do canal (`nomeDoCanal`) não muda (é da F70).
14. **A trava da legada no Storage** (fato 28): de catálogo. Nenhuma policy de `storage.objects` e nenhuma função da
    tabela-verdade do Storage cita `empresa_legada()`, fora da lista nominal (a cláusula da 16/11-1, com motivo). A catraca
    TS só muda pelo filtro do Realtime.
15. **O "nada muda para a WAP"**, conta a conta. Estenda `conta-a-conta.mjs` com a fase `f67b`. Para cada membership
    ativa, dentro do bloco, com as claims dela e o papel `authenticated`:
    - quantos objetos de cada bucket ela lê (pela própria RLS de `storage.objects`);
    - quantos ela escreveria (as funções e predicados de escrita, por objeto);
    - quantos do bucket de backups pela cláusula legada.

    Antes × depois, só a contagem de divergências por classe. Divergência DECLARADA: os 3 `.docx` sem linha (lidos e
    escritos antes, nem lidos nem escritos depois), exatamente 3 por membership que os alcançava. Qualquer outra é
    bloqueio. Rode no ensaio antes de produção, com a sabotagem I.
16. **O injetor**: uma mutação por classe de trava desta fase que nenhum teste de mesa já derruba. As candidatas:
    - `pode_ler_arquivo_termo` ignorando o nome;
    - o `coalesce` de volta a `true`;
    - o degenerado pela legada;
    - a policy de backup sem a empresa do caminho;
    - a cláusula legada aberta para qualquer caminho;
    - a 12ª sem a forma nova;
    - uma tabela da publication sem o recorte.

    Teto novo exato (170 → N), ou a ata diz por que não entrou.
17. **O rollback e o encadeamento**:
    - para o estado só-expansão: as policies e funções de antes, e os montadores novos derrubados;
    - para o estado contraído: primeiro devolver a aceitação da forma antiga e o `coalesce(…, true)`, depois o resto;
    - a ordem, escrita;
    - a declaração: depois do rollback, a forma antiga volta a ser a única aceita na escrita. Um backup gravado na forma
      nova continua no bucket, legível pela cláusula da expansão ou só por service role. Diga qual e quantos;
    - nenhum dado se perde.
18. **A frase de cada recusa nova**: backup de outra empresa; caminho fora da forma; termo sem linha. Uma por classe,
    pt-BR, sem valor de linha nem caminho, traduzida em `erros-do-banco.ts` e conferida contra o esquema vivo. O Storage
    devolve as recusas de RLS pela API dele, não por SQLSTATE: confira como o supabase-js as entrega e traduza no ponto
    de chamada.

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **O conta a conta deu divergência não declarada, ou uma das 13 checagens subiu** (qualquer banco, qualquer momento):
  - no ensaio: rollback no ensaio, causa raiz, migration NOVA e o ciclo de novo;
  - em produção: **rollback imediato**, antes do diagnóstico, sem merge, com o registro no topo do relatório.
- **O MCP da Supabase não está conectado, recusa o apply ou não autentica num dos bancos** (o `28P01` do fato 5). Não
  procure token, não leia o Gerenciador de Credenciais, não abra o `.env.local`. Confira de novo algumas vezes ao longo
  da run.
  - Se só o ENSAIO falhar: **nada vai a produção** sem o ensaio antes. Entregue tudo o que não depende de banco vivo, com
    o PR ABERTO e **SEM merge**, e ponha no topo do relatório o caminho B: as migrations na ordem (expansão e contração
    separadas), o bloco do conta a conta, as contagens e o rollback.
  - Se os dois falharem: o mesmo.
- **Nenhum objeto novo na forma antiga não se confirmou na janela.** Alguém ainda grava na forma antiga: uma aba com o app
  velho, ou um caminho que o `git grep` não pegou. **Não contraia.** Descubra pela família (só contagem). Repita a janela,
  no máximo três vezes em 2 h. Se persistir, o PR de documentação sai com a contração PENDENTE no topo do relatório (o
  comando exato e a condição), e a tag espera. É estado de repouso válido.
- **Os números das checagens mudaram** (mais achados, achado maior, achado novo) em qualquer momento depois da linha
  travada:
  - se foi a fase (um achado da 8ª ou da 12ª, que esta fase toca): rollback e bloqueio no topo;
  - se não foi (o dado de produção andou sozinho, como um import ou reset feito pela WAP no meio da run): registre os
    números (só número), não conserte nada, e declare na seção "o que este relatório NÃO prova". A conferência compara
    com o vivo do momento do apply, declarado.
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO do bloco de
  `supabase/rollback/F67B-desfaz.sql` que o CI ensaiou para aquele estado. É a única exceção ao "`execute_sql` só
  leitura", e vale só para esse arquivo. A linha do ledger fica: registre o que a sonda de deriva vai dizer dela. Se o
  classificador barrar o rollback, não reformule: o comando exato vai no topo do relatório, e o PR fica sem merge.
- **O lock não veio** (`lock_timeout` disparou; `alter policy` em `storage.objects` toma ACCESS EXCLUSIVE): registre e
  tente de novo, no máximo três vezes em 30 minutos. Não suba o timeout nem mate sessões. Depois da terceira, pare o
  apply daquele banco: PR aberto, sem merge, e o comando no topo do relatório.
- **Advisor de segurança novo** depois do apply, não declarado: se cita objeto desta fase, escalada do runbook e rollback
  antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e siga.
- **O smoke ou o conferidor recusam** depois de um apply de produção: rollback daquele estado, PR sem merge, e a causa no
  topo do relatório. Não tente consertar na mesma run.
- **A documentação oficial do Realtime contradiz o fato 25** (a RLS da tabela NÃO vale por assinante para Postgres
  Changes): não invente uma "RLS na publication". Registre a citação. A F67B entrega só o filtro e a trava de catálogo,
  e põe no topo do relatório que o Realtime NÃO está fechado no banco, com a fase que fecha.
- **A sonda de deriva abre alarme** porque a contração ficou mais de 24 h no repositório sem apply: registre. O alarme
  fecha sozinho na Parte B seguinte ao apply.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a pendência.
  Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, merge, push de tag, disparo de workflow,
  rollback): registre, não repita, não reformule, siga no que não depende dela e ponha o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui já
há oito divergências medidas de saída**, e elas vão no relatório:
- a numeração (`0194`) e a versão (`1.74.0`) (fato 1);
- as QUATRO famílias de backup, não só o import (fato 18);
- a 12ª checagem reconhece as cópias pela forma antiga, e muda nesta fase (fato 19);
- `storage.foldername` não existe no CI (fato 23);
- "RLS na publication" não existe: a trava é a RLS da tabela, que já recorta desde a F66 (fato 25);
- a catraca TS não tem entrada de Storage: a trava da legada é de catálogo (fato 28);
- a decisão 16/11-1: os objetos antigos ficam legíveis ao admin da WAP, não invisíveis;
- a decisão 16/11-2: o client administrativo no passo dos `.docx` do import.

Declare também o que este prompt acrescenta à ficha:
- a expansão e a contração para a forma do caminho e para a ordem do termo;
- o conta a conta por objeto;
- as 13 checagens travadas como portão;
- a fechadura de `urlBackup`;
- a correção dos comentários do Realtime.

# Git e segurança
- **Branch** `f67b-storage-e-realtime-por-empresa`, com commits pequenos e frequentes e mensagens em pt-BR no padrão
  conventional (`docs(f67b): …`, `test(f67b): …`, `feat(f67b): …`, `fix(f67b): …`, `chore(f67b): …`).
- **Documentação primeiro.** Commite também esta ordem
  (`docs/prompts/F67B-storage-e-realtime-por-empresa-ultracode.md`) num commit de documentação. O `PLAN-F67B.md` vem antes
  do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os commits vão nesta ordem:**
  1. as travas vermelhas;
  2. cada lote de expansão, um commit por migration, com `db:lock`;
  3. o TS (`caminho.ts`, os escritores, `persistirTermo`, o import, a ferramenta, o Realtime);
  4. os roteiros adaptados, o rollback e o conta a conta;
  5. o injetor;
  6. a contração;
  7. os documentos (a ficha, a MATRIZ, o ADR, o RUNBOOK, os aninhados, a ata);
  8. a versão.
- **Pushes agrupados**: cada um custa CI numa cota apertada.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece quando:
  - `verificar` e `banco-sem-docker` estão verdes;
  - a expansão está aplicada nos dois bancos, com o conta a conta e as 13 checagens iguais;
  - o conferidor deu 0 recusadas e o smoke 0 falha em produção.

  A contração é aplicada em produção DEPOIS do merge (é a única parte desse PR que vai a produção depois dele). A
  evidência vai por um PR só de documentação, e qualquer correção de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `cascade`, `drop … if
  exists` na contração, abrir a janela `estoque.dev_destrutivo`, DDL dinâmica, mudar default;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; chamar RPC destrutiva, de conta ou de import; gravar,
  copiar, mover ou apagar objeto de Storage (nem pela ferramenta nova, nem por script); matar sessão do app; imprimir ou
  gravar valor de coluna, id, nome, e-mail, patrimônio, slug, caminho de objeto ou texto de linha real (nem em log, nem
  em evidência, nem na resposta); qualquer escrita fora do `apply_migration` e do rollback autorizado;
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de 10/09);
  ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha e token;
- **no repositório:** mexer na proteção da `main` ou nos workflows, instalar dependência, mexer nos PRs do dependabot,
  subir número da linha de base, editar o `CLAUDE.md` da raiz.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local`, e que de banco só lê catálogo,
contagens, textos de esquema e hashes (nunca valores de linha nem nomes de objeto do Storage). As frentes de exploração:
- (a) **o bucket `termos`**: as policies, as três funções, `persistirTermo`, as URLs assinadas, a 8ª checagem,
  `storage_termo.sql`, a `0069` (fatos 6 a 15);
- (b) **o bucket `backups-import`**: as quatro famílias, ponta a ponta (montador TS, espelho SQL, RPC que valida, 12ª,
  `restaurar.mjs`, `urlBackup`), e as contagens por forma nos dois bancos (fatos 16 a 23);
- (c) **o Realtime**: a publication, as policies das três tabelas, as três montagens, `assinatura-realtime.ts`, o §9 de
  `catalogo_policies.sql` (fatos 24 a 27);
- (d) **as travas, os roteiros e o injetor**: `definer_sem_tenant.sql`, `catalogo_policies.sql`, `isolamento_tenant.sql`,
  `backup-completude.test.ts`, `superficie-admin.test.ts`, `migrations-f38.test.ts`, `mutacoes.mjs` e os rollbacks F62 a
  F67 (fatos 28 a 30);
- (e) **a documentação oficial** (regra 6): Storage (permissões por operação, `protect_delete`, `foldername`), Realtime
  (Postgres Changes, RLS por assinante, `filter`) e PG 17;
- (f) **os bancos, só leitura**: o "antes" (Frente A), as 13 checagens e o conta a conta "antes".

Escreva `docs/PLAN-F67B.md` antes de implementar. **A edição é sequencial**: as policies, as funções, os montadores e a
12ª se cruzam. Paralelize exploração, medição e revisão, não edição.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**. Eles leem
o código **pelo SHA** (nunca pela árvore de trabalho), contra o `PLAN-F67B.md` e os 25 critérios, com estas perguntas:
- Algum `.docx` é legível ou gravável por quem não é da empresa da linha? Algum objeto sem linha continua gravável por
  algum caminho (o `upsert`, o `copy`, o `move`)?
- O degenerado da A ainda é apagável pelo admin da A? Ficou imortal, ou ficou aberto ao da B?
- `persistirTermo` cria, em algum ramo de falha, objeto sem linha ou linha sem objeto? O ramo UPDATE tem janela não
  declarada?
- Sobrou algum escritor de `backups-import` montando caminho por fora de `caminho.ts`? Algum caminho novo sai sem a
  empresa, ou com a empresa errada (a da sessão onde devia ser a da filial)?
- A cláusula legada é mesmo FECHADA e só de leitura? Um caminho novo malformado cai nela?
- A 12ª reconhece as quatro famílias nas duas formas, e a cópia da ferramenta de órfão? Algum backup legítimo novo conta
  como órfão?
- Alguma RPC recriada mudou além da cláusula do prefixo?
- A contração pode rodar antes do deploy por algum caminho? O app no ar quebra com a expansão aplicada?
- O client administrativo do import vaza para além do passo dos `.docx`?
- O filtro do Realtime é provadamente total hoje? A empresa vem do servidor? A trava §9 lê a FORMA da policy ou um md5
  fixo?
- O conta a conta compara funções e RLS de verdade, ou uma cópia? Sabe achar divergência?
- Alguma sabotagem prova só o caminho feliz? Alguma evidência tem valor real de linha ou caminho de objeto?
- Algum arquivo fora do escopo foi tocado (defaults, `profiles`, workflow, o `CLAUDE.md` da raiz, `ViewerAutoRefresh`)?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado, não
preferências de estilo.** Corrija e re-revise até limpar. Se as passadas acharem bordas cada vez mais hipotéticas, pare e
registre a troca (o molde da F66B §13).

# Relatório final
`docs/RELATORIO-F67B.md`, em pt-BR, no padrão dos relatórios F45 a F67, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, a contração, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B completo, se
  o MCP faltou);
- depois do deploy, entrar com a própria conta e conferir, sem executar nada destrutivo:
  - **um termo de responsabilidade já gerado**: abre e baixa como antes;
  - **Administração › Importar**: o "Baixar backup" de um import ANTIGO funciona como antes (a cláusula legada);
  - **Zona destrutiva**: a ferramenta nova de órfão aparece e mostra a contagem (3 hoje). **Não execute**: a decisão de
    limpar os 3 é sua, e a linha de base da 8ª desce depois, com ata;
  - **Relatórios e Itens**: o selo "ao vivo" continua acordando quando alguém registra uma movimentação;
  - na próxima vez que gerar um termo de verdade, ele sai igual;
- conferir `/api/saude` com `1.74.0` e, no dia seguinte, a Parte B do `saude.yml`, com a deriva limpa e as 13 checagens
  nos números travados;
- o `git diff v1.73.0 v1.74.0 --stat`, com o que deve e o que não deve aparecer;
- os lembretes: o próximo prompt é o da **F67C** (o fim do default), e o diagnóstico do #84 continua como entrega
  avulsa.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas oito já conhecidas;
- as decisões do Johnny e as **dezoito decisões** da fase;
- as tabelas-verdade do Storage e do Realtime;
- o conta a conta nos dois bancos (antes, depois da expansão, depois da contração);
- a janela (T0, T1, as contagens por forma, a prova estática);
- o conferidor e o smoke;
- as 13 checagens antes e depois;
- as sabotagens com saída real;
- a contagem final;
- os 25 critérios autoverificados;
- o estado de repouso: o que acontece se o projeto parar aqui por dois meses, inclusive com a contração pendente;
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que o Realtime entrega só a linha da empresa a um assinante REAL de outra empresa (provado pela documentação, pelo
    catálogo e pela RLS de SELECT no CI; não há segunda empresa nem segundo assinante nos bancos vivos);
  - que as recusas cruzadas disparam nos bancos VIVOS (provadas no CI; nos vivos, a prova é o texto igual ao do CI e o
    conta a conta);
  - que a ferramenta de órfão funciona em produção (provada no CI; não executada);
  - que uma linha nova de outra empresa recebe a empresa certa (o default é a WAP até a F67C);
  - nada sobre os dados do #84.

Pendências e **backlog nomeado**:
- **F67C** (o fim do default);
- **F70**: a empresa da sessão no filtro do Realtime e no lugar de `empresaDaOperacao()`;
- **F71**: as frases do `CLAUDE.md` da raiz;
- **os 3 `.docx` sem linha**: a limpeza pela ferramenta nova, decisão do Johnny, com a linha de base da 8ª descendo
  depois;
- **o diagnóstico do #84** (entrega avulsa);
- **Backlog** (das fases anteriores, sem mudança): o conta a conta com as memberships desativadas; `database.ts`
  regenerado do banco (o hand-fix datado); os caminhos sem `.max()` e os pares de tetos da F66B;
  `movimentacoes.itens_faltantes`; o `savepoint` por linha na RPC do import; o seed de duas empresas; a paginação keyset;
  derrubar `profiles.papel`/`ativo`; o WARN `multiple_permissive_policies` de `pendencias_item`.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`empresa`, `caminho`, `objeto`, `cópia`). Os nomes que a ficha fixa
  (`storage_por_empresa.sql`, `caminho.ts`) ficam como estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~20 minutos)

Esta fase **toca os dois bancos duas vezes**:
- **a expansão**, antes do merge: as policies dos dois buckets passam a aceitar a forma antiga E a nova; entram as
  funções de caminho e o reconhecimento novo da checagem de backups;
- **a contração**, depois do deploy: o `.docx` sem linha e a gravação na forma antiga fecham, só quando o app novo já
  estiver no ar e ninguém mais gravar na forma antiga.

Antes de cada apply, ela roda em cada banco um bloco só leitura que compara, pessoa a pessoa, quantos objetos cada uma lê
e escreve antes e depois. Ela não toca nenhum objeto do Storage, não chama RPC destrutiva e não reescreve linha.

Este arquivo já está salvo em `docs/prompts/F67B-storage-e-realtime-por-empresa-ultracode.md`, **sem commit**. O agente o
commita na branch da fase. O prompt cita os 33 fatos do cabeçalho pelo número, então o arquivo precisa estar lá quando
você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.73.0, main em 2ad31e9 (PR #95); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git status --short          # só deve aparecer docs/prompts/F67B-...-ultracode.md
Test-Path .git\index.lock   # tem de dar False

# 3. Produção com a mesma versão, e o estado do alarme #84 (os números que a fase vai travar).
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
& "C:\Program Files\GitHub CLI\gh.exe" run list --workflow saude.yml --limit 3
& "C:\Program Files\GitHub CLI\gh.exe" issue view 84 --comments | Select-Object -Last 30

# 4. O smoke de produção passa HOJE: é a conferência da fase.
node scripts/smoke/smoke-prod.mjs

# 5. O MCP da Supabase conectado ao Claude Code, enxergando os dois projetos.
claude mcp list

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O passo 5 é o que mais importa, e desta vez tem um detalhe novo.** Dentro do Claude Code, confira:
- que o MCP lista `pbtjcalbmepmrqzprusb` (produção) e `sgmvldiizsrjbxzzpmhh` (ensaio);
- que **as ferramentas estão ligadas**: `execute_sql`, `apply_migration`, `list_migrations`, `get_advisors` e
  `generate_typescript_types`;
- **que o `execute_sql` funciona no ENSAIO.** Peça ao Claude Code um `select 1` em cada projeto. Ao gerar esta ordem, o
  conector do claude.ai respondeu na produção, mas no ensaio deu duas vezes `28P01 password authentication failed`. O
  conector do Claude Code é outro e pode estar bom. Se o ensaio falhar lá também, reconecte a Supabase (ou reautorize a
  organização) antes de colar o prompt. Sem ensaio, **nada vai a produção**: o agente entrega o PR aberto, sem merge, com
  o caminho B no topo do relatório.

**Mais quatro coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. As travas nascem vermelhas (um push a mais), e o
   `banco-sem-docker` roda algumas vezes, mais o PR de documentação e a Parte B disparada à mão.
2. **Dentro do Claude Code:** `/permissions` (nada pode negar `git push`, `gh`, `node`, `npx tsx` nem as ferramentas do
   MCP da Supabase) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).
3. **Ninguém importa, reseta nem resolve conflito durante a run.** Essas são as operações que gravam backup. Uma delas
   feita pelo app VELHO entre o apply da expansão e o deploy grava na forma antiga, o que é permitido, mas atrasa a janela
   da contração. Feita no meio, ela também mexe nas checagens que a fase trava. Se alguém da WAP precisar, avise que é
   para depois. E recarregue as abas do sistema que você tiver abertas depois do deploy.
4. **O horário.** `alter policy` em `storage.objects` toma lock exclusivo por milissegundos, e o `lock_timeout` de 2 s
   protege o app. A janela pede ≥ 30 min depois do deploy. Comece cedo o bastante para a run caber no dia, e evite a
   Parte B das 06:43.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f67b
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP em lotes nos dois bancos (em dois
momentos), roda blocos só leitura, abre e mergeia PRs, publica tag, dispara workflow e roda o smoke e o conferidor.
Nada disso cabe numa allowlist estreita. `bypassPermissions` numa máquina com credencial de produção está fora de questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção (as policies do Storage), no merge na
`main`, no push da tag e no disparo da Parte B. Se barrar, o prompt manda não reformular: o agente registra, segue no resto
e põe o comando no topo do relatório. A contração pendente é estado de repouso válido.

**`--worktree` NÃO serve.** O smoke, o conferidor e o conta a conta precisam do `.env.local`, que não vai para a
worktree, e o prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** Parecido com a F67. A parte pesada é o censo das quatro famílias de backup (do montador TS ao reconhecimento
da checagem) e a revisão adversarial sobre "algum caminho sai sem empresa?" e "algum ramo de falha cria órfão?", que é
onde o modelo forte rende. Só se a cota semanal estiver apertada, use `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes
do `claude`, para economizar na exploração.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F67B.md existe com as tabelas-verdade do Storage e do Realtime; package.json em 1.74.0; docs/RELATORIO-F67B.md existe; a ficha F67B do PLANO-MULTIEMPRESA esta reescrita; e UM destes desfechos: (a) o PR da fase e o PR de documentacao mergeados com verificar e banco-sem-docker verdes, a expansao 0194+ aplicada no ensaio e em producao com o conta a conta sem divergencia fora das declaradas, as 13 checagens iguais aos numeros travados, o conferidor com 0 recusadas e o smoke sem falha, a janela sem objeto novo na forma antiga, a contracao aplicada em producao, a Parte B com os mesmos numeros e a tag v1.74.0 publicada; (b) a contracao pendente porque a janela nao fechou em tres tentativas: PR de documentacao com o comando e a condicao no topo do docs/RELATORIO-F67B.md; (c) o apply de producao nao aconteceu (classificador ou lock): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F67B.md; (d) sem MCP da Supabase ou sem acesso ao ensaio: PR aberto sem merge, com o caminho B no topo do docs/RELATORIO-F67B.md; (e) o conta a conta, uma checagem, o conferidor ou o smoke reprovaram depois de um apply: rollback aplicado (ou, se barrado, o comando no topo), PR sem merge e a causa no topo do docs/RELATORIO-F67B.md; ou (f) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F67B.md
```

**Headless.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f67b.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f67b.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f67b.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. Esta fase aplica em
produção duas vezes e espera uma janela, então **prefira a sessão interativa deixada rodando, com o `/goal`**, e com a
suspensão do Windows desligada no plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Seis momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F67B.md` com a tabela das quatro famílias de backup (cada uma com montador, espelho SQL,
   quem valida, quem reconhece e quem restaura) e `docs/f67b-evidencias/antes/` com as contagens por forma, as 13
   checagens e o conta a conta. Só números, nomes de esquema e hashes. **Se aparecer um caminho de objeto, um nome, um
   e-mail ou um patrimônio ali, interrompa a sessão.**
2. **As travas vermelhas.** `storage_por_empresa.sql`, `caminho.test.ts`, a trava do Realtime e a da 12ª, antes de
   qualquer migration.
3. **O ensaio.** A expansão lote a lote, o conta a conta e as 13 checagens iguais, e então a contração (lá ela não espera
   deploy).
4. **A produção, a expansão.** O mesmo, mais o smoke e o conferidor. Se algum falhar, o prompt manda fazer o rollback na
   hora, e o relatório diz isso no topo.
5. **O merge, o deploy e a janela.** `/api/saude` em `1.74.0`, e depois ≥ 30 min contando objetos novos na forma antiga
   (tem de dar zero). **Recarregue as abas do sistema que você tiver abertas.**
6. **A conferência.** A contração em produção, o conta a conta de novo, e a Parte B com os MESMOS números.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Entre com a sua conta em produção e confira, **sem executar nada destrutivo**:
   - abrir e baixar um termo já gerado;
   - Administração › Importar: o "Baixar backup" de um import antigo;
   - Zona destrutiva: a ferramenta de órfão mostra 3 (não execute: limpar é decisão sua, e a linha de base da checagem
     desce depois, com ata);
   - Relatórios e Itens: o "ao vivo" acordando com uma movimentação.
3. `git diff v1.73.0 v1.74.0 --stat`. Devem aparecer:
   - `supabase/migrations/0194_*` em diante (a contração por último), `supabase/migrations.lock.json`,
     `supabase/rollback/F67B-desfaz.sql`;
   - `supabase/tests/storage_por_empresa.sql`, `f67b_rollback.sql`, e mudanças em `storage_termo.sql`,
     `catalogo_policies.sql`, `definer_sem_tenant.sql` e nos roteiros adaptados, cada um explicado no relatório;
   - `src/lib/storage/caminho.ts` e o teste, `src/lib/storage/copiar-antes-de-remover.ts`,
     `src/lib/actions/{termos,importar,dev-destrutivo,conflitos}.ts`, `src/lib/validators/{importar,conflitos}.ts`,
     `src/lib/escopo/**`, `src/lib/relatorios/assinatura-realtime.ts`, `realtime-refresh.tsx` e as três páginas, a
     ferramenta da Zona destrutiva, `superficie-admin.test.ts`;
   - `scripts/db/restaurar.mjs`, `scripts/db/mutacoes.mjs`, `scripts/perf/conta-a-conta.mjs`, `registry.ts`,
     `package.json`, `CHANGELOG.md`, `docs/**`.

   **Não** devem aparecer:
   - migration antiga alterada;
   - default de coluna mudado; `scripts/seed.ts`, `scripts/import/**`;
   - `scripts/smoke/linha-de-base.json` com número que SUBIU;
   - `viewer-auto-refresh.tsx`, o `CLAUDE.md` da raiz, `.github/workflows/**`, mudança de dependência no
     `package-lock.json`.
4. Abra `docs/f67b-evidencias/`: o conta a conta nos três momentos, a janela (T0, T1), o conferidor, as 13 checagens e a
   saída das sabotagens.
5. Confira no `PLANO-MULTIEMPRESA.md` a ficha F67B reescrita e a **F67C**: é dela o próximo prompt.
6. Rode você mesmo `npm run test` uma vez.
7. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **As quatro famílias de backup ganham a empresa, não só o import.** A ficha só nomeia o import, mas reset, conflito e
   as cópias de `.docx` gravam no mesmo bucket. Deixar uma delas sem empresa abriria o backup de outra empresa ao admin
   da WAP pela regra legada que você escolheu (fato 18). Isso amplia a fase: as quatro RPCs que conferem o caminho do
   backup são recriadas, mudando só essa cláusula.
2. **Apliquei à F67B as três decisões que você tomou para a F67 (13/11):** "dev sou só eu" (a ferramenta de órfão é só
   sua), **expandir e contrair com zero janela** (aqui para a forma do caminho e a ordem do termo) e **os números do #84
   travados** (agora as 13 checagens, porque esta fase mexe nas duas de Storage). Se preferir uma run sem janela, com
   tudo num apply só, diga antes de rodar: fica mais curta, mas abre minutos em que um import ou termo gerado pelo app
   velho seria recusado.
3. **"RLS na publication" virou "trava de catálogo da publication + filtro do cliente".** Pela documentação da Supabase,
   o Realtime confere a RLS de SELECT da tabela para cada assinante, e as três tabelas já recortam por empresa desde a
   F66 (fato 25). O agente confirma na documentação antes de seguir; se ela disser o contrário, o relatório diz no topo
   que o Realtime não está fechado.
4. **A regra legada é só de LEITURA.** Você escolheu "visíveis só ao admin da WAP". Fechei a gravação e a exclusão na
   forma antiga para a sessão: ninguém do app apaga backup antigo hoje, e limpar os órfãos do #84 é a entrega avulsa.
5. **A ferramenta de órfão é entregue, não executada.** Os 3 `.docx` sem linha de produção ficam onde estão. Limpar é
   decisão sua, depois; a linha de base da checagem desce em seguida, com ata.
6. **O agente aplica no ensaio E em produção** (a expansão antes do merge, a contração depois do deploy), pelo MCP. É o
   fluxo das F53 a F67, não decisão nova sua. Sem acesso ao ensaio (o `28P01` de hoje), nada vai a produção.
7. **Uma run, um PR de código (expansão + contração em arquivos separados) e um PR de documentação com a tag.** Versão
   `1.74.0`, migrations a partir da `0194`.
8. **Os números de produção do cabeçalho foram medidos hoje pelo conector do claude.ai**, só contagens e catálogo
   (nenhum valor de linha nem caminho de objeto). Os do ensaio não puderam ser medidos. O agente remede tudo.

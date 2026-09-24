# F66 — As policies ganham o recorte, em conjunção

Ordem de serviço da fase **F66** do `PLANO-MULTIEMPRESA.md` (§7), a quinta da virada. É a primeira fase em que alguém
passa a LER por empresa: o predicado de tenant entra nas policies de `public`, **em conjunção com o piso de hoje**, de
forma que o sistema fique com a RLS de tenant escrita, medida e provada, e a WAP não perceba nada.

Ela entrega quatro coisas:
- **as 51 policies de tabela com `empresa_id` ganham o recorte**, na forma içada da doutrina (R-ACC-63):
  `empresa_id = any (array (select public.<função de conjunto>()))`, com a função certa para a classe da policy. O piso
  (`papel_atual()`, `pode_escrever()`, `e_admin()`) FICA — apagá-lo é a F72;
- **as 6 policies de escrita com `pode_escrever_filial(filial_id)` passam à forma de pares** (`unidades_de_escrita()`,
  R-ACC-68), que a F59 marcou para esta fase. Aqui a regra de escrita é TROCADA, não somada, e a equivalência é provada
  conta a conta, nos dois bancos;
- **os índices de lista passam a ser liderados por `empresa_id`** onde a medição provar que o plano os usa sob a policy
  nova (decisão 1 do Johnny na F65), e o join por código de `rel_por_motivo_filiais`/`rel_resumo_filiais` ganha a
  empresa;
- **as travas que diziam "nenhuma policy cita `empresa_id` antes da F66" se invertem**: toda policy de tabela com a
  coluna passa a TER de citá-la, na forma e com a função da sua classe, e `isolamento_tenant.sql` ganha a bateria de
  LEITURA entre empresas, que agora pode falhar de verdade.

Duas condições não se negociam:
- **Nada muda para a WAP.** Hoje há uma empresa, toda linha é dela e toda conta que passa pelo piso é membro dela
  (fato 8). A conjunção de leitura é inerte por construção; a troca da escrita é equivalente e a prova sai conta a
  conta, só com contagens. Smoke, conferidor de formas e o TTFB do mesmo dia confirmam.
- **Nenhuma linha é reescrita.** `alter policy`, `create index` e `create or replace function` não tocam tupla. A prova
  continua sendo o `relfilenode` das 20 tabelas de `k_negocio`, igual antes e depois, nos dois bancos.

**As três decisões do Johnny (24/09/2026) mudam a ficha em três pontos:**
1. **O CHECK de comprimento sai da F66 e vira fase própria, a F66B.** O recorte é inerte; o CHECK é recusa NOVA (um
   import com texto longo passa a falhar), alcança 65 colunas e quatro caminhos de escrita sem Zod. A F66 só escreve a
   ficha da F66B no plano, com o censo medido. O prompt dela sai em outra conversa.
2. **A troca de `pode_escrever_filial` pela forma de pares entra, com prova em PRODUÇÃO conta a conta**: um bloco só
   leitura assume cada membership ativa e compara as duas regras em todas as filiais. Sai do banco **só o número de
   divergências**, que tem de ser 0. Nenhum id, nome ou e-mail atravessa o canal.
3. **`eventos_admin` não muda de forma.** O jsonb fica onde está: medido hoje, são 102 linhas, a maior com 5 KB, 120 kB
   no total. A leitura da trilha ganha o recorte, a medição vai para a ata e o "considerar" da ficha fecha.

Depois dela vem a F66B (o comprimento como regra do banco) e a F67 (escrita, definer, Storage e Realtime por tenant).

---

## Estado de partida: os 28 fatos medidos no disco, no git e nos dois bancos (24/09/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje contra a árvore e o git, e contra o catálogo e as tabelas
> de PRODUÇÃO e do ENSAIO pelo MCP da Supabase, só leitura e só contagem. **Não** foram copiados da ficha, que é de
> 04/09 (v1.49.1), anterior às F45→F65. Onde divergem dela, a divergência está marcada com ⚠. O prompt manda o agente
> **remedir antes de aceitar**.

**Onde o projeto parou**

1. `origin/main` em **`3f7a642`** (merge do PR #78, o fecho de documentação da F65), com a tag anotada **`v1.70.0`**
   nesse commit; `package.json` em `1.70.0`; árvore limpa.
   - A cópia de trabalho está na branch `f65-fecho-docs`, no mesmo commit; o `main` LOCAL ficou em `469632b`. O pré-voo
     faz `git checkout main; git pull`.
   - Última migration: **`0174_colaboradores_nome_chave_pos_deploy.sql`**. O ledger dos dois bancos termina em
     `colaboradores_nome_chave_pos_deploy`: produção com 158 linhas, ensaio com 171 (a divergência histórica do
     `RUNBOOK-BANCO.md`).
   - Produção `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh`: `ACTIVE_HEALTHY`, Postgres **17.6**.
   - ⚠ A ficha lista `0156`–`0159`, números gastos pela F62/F63. **A primeira desta fase é a `0175`.** Versão da fase:
     **`1.71.0`**. Os checks obrigatórios da `main` são **`verificar`** e **`banco-sem-docker`**.
2. **A rede de hoje** (o fecho da F65):
   - 256 arquivos de teste com 7.862 testes;
   - 51 roteiros SQL, 1.095 asserções, 0 ✗;
   - injetor em **143/143**, no teto, com 2 em quarentena;
   - `db:types:diff` em 38 relações · 358 colunas · 94 funções;
   - smoke de produção: *"109 OK · 1 aviso (kits_modelos) · 0 falha"*;
   - conferidor de formas em produção: 271 pontos · 100.549 linhas · 0 recusadas.
3. **Os advisors de produção, medidos hoje:**
   - **segurança**: 6 INFO `rls_enabled_no_policy` · 34 WARN de definer executável por `authenticated` · 1 WARN de senha
     vazada (Auth). O mesmo do fecho da F65;
   - **performance**: 39 INFO `unindexed_foreign_keys` (22 delas são as compostas da F65) · 1 INFO `no_primary_key`
     (`_bkp_relatorios_gerados_f6a`) · 8 INFO `unused_index` · 1 WARN `multiple_permissive_policies` (`pendencias_item`,
     UPDATE). **Nenhum `auth_rls_initplan`**: a F59 deixou toda função de policy içada.

**As policies**

4. **62 policies vivas, iguais nos dois bancos: `public` 54 · Storage 8.** Por tabela, em `public`:
   `_bkp_relatorios_gerados_f6a` 1 · `anotacoes` 2 · `ativos` 3 · `colaboradores` 3 · `eventos_admin` 1 · `filiais` 4 ·
   `import_logs` 2 · `import_prefixos_patrimonio` 1 · `import_termos_categoria` 1 · `import_termos_estado` 1 · `itens` 4 ·
   `kits_modelos` 4 · `lancamentos_item` 2 · `membros` 1 · `motivos` 4 · `movimentacoes` 2 · `operador_filiais` 1 ·
   `pendencias_item` 3 · `profiles` 2 · `relatorios_gerados` 2 · `termos_gerados` 4 · `tipos_item` 3 ·
   `unidades_apelidos` 3. `senhas_acesso` é negócio sem policy nenhuma (deny-all, `k_sem_select`).
   - ⚠ **As 62 já são `to authenticated`** (`roles = {authenticated}`), nos dois bancos. O item da ficha ("`to
     authenticated` em todas") já é verdade. O que falta é a TRAVA: nenhuma asserção de `catalogo_policies.sql` confere
     `roles` hoje (R-ACC-72, item 2, ainda "CONFORME-POR-LEITURA").
5. **As classes de predicado de hoje (o piso)**, medidas no `pg_policies` de produção:

   | classe | policies | quais |
   |---|---:|---|
   | SELECT pelo piso `(select papel_atual()) is not null` | 20 | as 17 de negócio com SELECT, mais `membros`, `operador_filiais` e `profiles` (`k_piso_papel`) |
   | SELECT por cargo | 3 | `eventos_admin` e `import_logs` por `e_admin()`; `_bkp_relatorios_gerados_f6a` por `e_dev()` (`k_piso_cargo`) |
   | escrita por `(select pode_escrever())` | 4 | `anotacoes`, `colaboradores`, `itens` e `relatorios_gerados`, INSERT |
   | escrita por `(select e_admin())` | 17 | `filiais` ×3, `kits_modelos` ×3, `motivos` ×3, `itens` ×2, `tipos_item` ×2, `unidades_apelidos` ×2, `colaboradores` UPDATE, `import_logs` INSERT |
   | escrita por `pode_escrever_filial(filial_id)`, POR LINHA | 6 | `ativos` INSERT e UPDATE; `lancamentos_item` INSERT (com `estorno_item_coerente`); `movimentacoes` INSERT (duas chamadas: `filial_id` e `(snapshot_anterior ->> 'filial_id')::smallint`); `pendencias_item` "admin reabre" (`e_admin()` e a filial) e "operador resolve" |
   | escrita em `termos_gerados` | 3 | `pode_escrever_termo(ativo_ids)`, `termo_ancora_coerente(…)`, `array_length(…)` — exceções PERMANENTES da doutrina |
   | o próprio perfil | 1 | `profiles` "atualiza proprio perfil", `id = (select auth.uid())` |

   Soma: 54. **51 delas estão em tabela que TEM `empresa_id`** (as 19 de negócio com policy, mais `membros` e
   `operador_filiais`). As três que não têm a coluna são as duas de `profiles` e a de `_bkp_relatorios_gerados_f6a`.
   - ⚠ A ficha fala em "54 policies". Medido: **51 recebem o recorte**. `profiles` é a leitura cruzada de perfis, da
     **F69** (a ficha dela diz isso por extenso). `_bkp_relatorios_gerados_f6a` é infra congelada, só `e_dev()`, sem a
     coluna. As três entram como exceção NOMINAL, com o motivo e o destino.
6. **As quatro funções de conjunto existem nos dois bancos** (`0157`, F62): `empresas_do_membro()`,
   `empresas_de_escrita()`, `empresas_de_admin()` (`setof uuid`) e `unidades_de_escrita()` (`returns table (empresa_id,
   filial_id)`). Todas `language sql stable security definer set search_path = ''`, `auth.uid()` içado dentro, `revoke`
   de `public, anon` e `grant` a `authenticated`, exigindo membership ATIVA e perfil não arquivado. O comentário de cada
   uma diz "sem consumidor até a F66". A forma de consumo está na MATRIZ ("A forma-alvo, para copiar", R-ACC-68).
7. **⚠ A PONTE: `papel_atual()` só responde pela membership na empresa LEGADA** (`where m.empresa_id =
   public.empresa_legada()`). `e_admin()`, `e_dev()`, `pode_escrever()` e `pode_escrever_filial()` leem `papel_atual()`.
   - Consequência que a ficha não mede: **um membro SÓ da empresa B tem `papel_atual()` NULL, e o piso fecha tudo para
     ele** (o 9g de `isolamento_tenant.sql` prova a ponte). Nas policies reais, "B vê B" é impossível até a F67 tirar a
     ponte.
   - Então a bateria de leitura "nas duas direções" não se prova só com as policies reais. A direção A (a WAP) prova-se
     com elas. A direção B, com o piso NEUTRALIZADO dentro da transação do roteiro (decisão 7).
8. **A inércia, medida nos dois bancos:**
   - 1 empresa. **0 linha com `empresa_id` diferente da WAP** nas 20 tabelas de negócio e em `operador_filiais`;
     0 membership em outra empresa;
   - perfis vivos sem membership ativa: **0 em produção**, 2 no ensaio (contas de teste: `papel_atual()` NULL, já não veem
     nada hoje);
   - `plataforma_admins`: 2, as duas também membros da WAP;
   - produção: 14 memberships ativas (operador 5 · consulta 5 · admin 2 · dev 2) e 2 inativas; **5 operadores com
     vínculo**, 25 vínculos, 6 filiais, todas ativas. **O ensaio não tem operador com vínculo** (a lacuna que a F59 já
     registrou);
   - ⇒ toda conta que passa pelo piso é membro da WAP e toda linha é da WAP: a conjunção de LEITURA é inerte por
     construção. A troca da ESCRITA é equivalente se, para cada membership, `{f : pode_escrever_filial(f)}` for igual a
     `{f : (WAP, f) ∈ unidades_de_escrita()}`. Essa é a prova da decisão 2 do Johnny.
9. **Os dois corpos que a troca compara:**
   - `pode_escrever_filial(fid)` (plpgsql, definer): `fid` nulo → `false`; `dev`/`admin` → `true` para QUALQUER `fid`,
     inclusive filial desativada; `operador` → existe vínculo da membership legada naquela filial; o resto → `false`;
   - `unidades_de_escrita()`: `dev`/`admin` → toda filial da empresa da membership, **sem filtro de `ativo`** (a desativada
     entra, como hoje); `operador` → as filiais vinculadas à própria membership, da mesma empresa;
   - a única diferença de domínio é `fid` de filial que NÃO existe (hoje `true` para admin; nos pares, ausente). A FK
     composta já recusa essa linha antes: declare;
   - na forma de pares, `fid` nulo dá `(e, null) in (…)` → NULL → recusa. É o mesmo "fecha em vez de abrir" de hoje.
10. **A doutrina do predicado (F59)** vale inteira: R-ACC-63 a R-ACC-72 em `docs/MATRIZ-REGRAS.md`, as asserções 10a a
    14 de `catalogo_policies.sql` e a guarda de mesa `src/lib/validators/policies-initplan.test.ts`.
    - `k_excecoes_predicado` tem **18** ocorrências: 6 `pode_escrever_filial` com destino **F66**; 1 `pode_ler_arquivo_termo`
      (Storage) com destino F67; 11 permanentes. A catraca `11b` reprova exceção sem ocorrência viva: **as 6 têm de sair
      da lista no MESMO commit em que saem das policies** (18 → 12).
    - O universo `k_policies_public` (54) e `k_storage` (8) é congelado **pelo NOME** (`10a`/`10b`).
    - ⚠ **R-ACC-70: DDL de policy montado dinamicamente REPROVA** (`execute format('alter policy %I …')`, verbo em
      variável, palavra partida). As 51 mudanças são 51 comandos `alter policy` LITERAIS, que o replay da mesa consome
      um a um (a auto-conferência "todo `create|alter|drop policy` fora de comentário foi consumido").
    - A forma de pares é caso "passa" da guarda (describe 4 da mesa; a árvore sintética `pares` do `10d`), mas **só
      existiu emulada** até hoje: a R-ACC-68 é "CONFORME-POR-LEITURA (a forma em policy real só existe na F66)".
11. **⚠ O caso de `movimentacoes` "operador insere"**: a segunda chamada é `pode_escrever_filial((snapshot_anterior ->>
    'filial_id')::smallint)`, a filial REAL do ativo lida do snapshot da própria linha. Na forma de pares, a expressão
    vai à esquerda do `in`: `(empresa_id, (snapshot_anterior ->> 'filial_id')::smallint) in (select u.empresa_id,
    u.filial_id from public.unidades_de_escrita() u)`. O `->>` é OPERADOR, não função. Confira na árvore (11a, 13b) e na
    mesa (describe 3) que ele passa. Se não passar, é decisão escrita (decisão 3), nunca exceção por nome de função.

**As travas que a F66 inverte**

12. **Cinco lugares dizem hoje, com todas as letras, "nenhuma policy lê `empresa_id` ANTES DA F66"**, e esta é a fase
    em que isso vira o contrário:
    - `catalogo_policies.sql` **15g** ("nenhuma policy das onze do lote 2 cita `empresa_id` (o recorte é da F66)"),
      **15h** (nenhuma FUNÇÃO lê a coluna das dezenove, fora de `k_leitura_integridade`/`k_leitura_tenant`) e **15i**
      (nenhuma VIEW lê a coluna do lote 2);
    - `empresa_no_acervo.sql` **7a** ("nenhuma policy das oito tabelas do acervo cita `empresa_id`");
    - `src/lib/validators/catalogos-seguranca.test.ts`: o describe "vê a coluna do ACERVO só pelo CATÁLOGO — nenhum
      comando compara `empresa_id` … (até a F66)", o caso "isolamento_tenant.sql LÊ o acervo por `empresa_id` — o recorte
      do acervo é da F66" e o que exige que o cabeçalho de `isolamento_tenant.sql` nomeie a F66;
    - `src/lib/validators/empresa-acervo-sem-leitura.test.ts` (a catraca TS);
    - o cabeçalho de `isolamento_tenant.sql` ("o que falta é a LEITURA — o recorte do acervo, da F66").

    As três camadas mudam de natureza de formas diferentes (decisão 6): a POLICY passa a TER de citar; a FUNÇÃO continua
    com exceção nominal (e ganha duas: o join composto das `rel_*`); o TS continua sem recortar (quem recorta é a RLS; a
    F67 passa a empresa na escrita).
13. **`isolamento_tenant.sql` hoje** prova as funções de conjunto (9a–9f), a ponte (9g), as FKs compostas de
    `operador_filiais` (9h), que `authenticated` não escreve na raiz (9i) e a completude da coluna (9j/9k). Não tem
    leitura de acervo por empresa. A convenção de honestidade vale: universo contado como `postgres` antes de qualquer
    "viu zero" (`assert_zero_de` recusa universo vazio), toda recusa provada duas vezes, o par simétrico.

**Os índices de lista (decisão 1 do Johnny na F65)**

14. **Os índices de lista de hoje, com o uso medido** (`pg_stat_user_indexes` de produção, estatística desde 29/06):

    | índice | forma | `idx_scan` |
    |---|---|---:|
    | `movimentacoes_data_ordem_idx` | `(data desc, ordem desc)` | **41.389** |
    | `movimentacoes_ordem_lista_idx` | `(data desc, created_at desc, id desc)` | 18.078 |
    | `mov_created_idx` | `(created_at desc)` | 4.044 |
    | `lanc_item_created_idx` | `(created_at desc)` | 780 |
    | `eventos_admin_quando_idx` | `(quando desc, acao)` | 209 |
    | `import_logs_created_idx` | `(created_at desc)` | 187 |
    | `movimentacoes_ordem_uidx` | unique `(ordem)` | 12 |

    - ⚠ **O índice mais usado do sistema, `movimentacoes_data_ordem_idx`, não está na lista da ficha.** A lista da nota
      F65 é ponto de partida; o censo sai do catálogo e do `pg_stat`.
    - `/ativos` não tem índice de `(updated_at, id)`: o "(empresa_id, updated_at desc, id asc) que `/ativos` nunca teve"
      é índice NOVO, não troca.
    - Tamanhos: `movimentacoes` 3.631 linhas (4,9 MB), `ativos` 1.649 (2,2 MB), o resto abaixo de 0,4 MB. Tudo cabe em
      memória: a diferença entre planos vai ser pequena em milissegundos, e o que decide é o NÓ do plano e os buffers.
    - **O PG 17 não tem skip scan** (o 18 tem). Se `empresa_id = any (array (select …))` na coluna líder serve um `ORDER
      BY … LIMIT` sem sort é pergunta para a documentação do 17 E para o `EXPLAIN`, não para a memória.
    - Consumidores SEM o predicado (as `security definer` e o service role, que não passam por policy) perdem o índice
      antigo se ele cair. O censo de consumidores vem antes de qualquer `drop index`.
15. **O advisor de FK sem índice (39)**: 22 são as compostas da F65, que começam por `empresa_id`. A decisão 1 do
    Johnny continua valendo: **nenhum índice só para calar o lint**. Se um índice de lista liderado por `empresa_id`
    cobrir uma composta pela frente, é efeito colateral, declarado por nome.

**Os relatórios, as views e o Realtime**

16. **O join por código das `rel_*`.** `rel_por_motivo_filiais` e `rel_resumo_filiais` (`0143`, `security invoker`)
    fazem `join public.motivos mo on mo.codigo = m.motivo`. Desde a `0168` a PK de `motivos` é `(empresa_id, codigo)`.
    Com duas empresas e o mesmo código, a linha do relatório duplica.
    - Sendo `invoker`, depois da F66 a RLS de `motivos` já esconde o motivo da outra empresa de quem é membro de UMA
      só. A duplicata sobra para quem é membro das duas. O conserto continua certo: `and mo.empresa_id = m.empresa_id`,
      e a FK composta `movimentacoes_motivo_fkey` garante que o par existe.
    - `create or replace` das duas exige a entrada em `RECRIACOES_AUTORIZADAS` (`src/lib/itens/migrations-f38.test.ts`)
      e mantém a trava de recorte das `rel_*` (`rpcs-recorte-sql.test.ts`, `catalogo_secdef.sql` bloco 7) verde.
    - `docs/perf/asof-orcamento.json` só amarra `rel_estoque_asof_filiais`, que a fase não toca.
    - O instrumento de equivalência da F60 existe: `scripts/perf/equivalencia-rel.mjs`.
17. **As nove views são `security_invoker`** e herdam a RLS de cada tabela base. `v_conflitos_filiais` e `_grupos`
    agrupam `ativos` inteira; sob o recorte, o grupo de quem é membro de uma empresa passa a ser da empresa dele
    sozinho (a F67 ainda põe o `where` explícito). E `rel_saldo_colaborador` (a exceção de `k_excecoes_recorte`)
    declara que o recorte de inquilino dela "é a RLS … que a virada escreve nas policies": é esta fase.
18. **O Realtime**: `supabase_realtime` publica `movimentacoes`, `anotacoes` e `lancamentos_item`. O `postgres_changes`
    aplica a policy de SELECT do assinante, então o termo novo passa a filtrar o payload também. Confirme na documentação
    da Supabase (regra 6) que a avaliação por assinante chama função `security definer` com `auth.uid()` das claims. O
    filtro no cliente e a RLS na publication são da F67.
19. **`docs/INVENTARIO-LEITURAS.md`**: **102** call-sites TS classificados "confia na RLS · F66" (89 literais + 13
    dinâmicos). O próprio inventário avisa: *"Uma leitura pela sessão cuja correção dependa de ver OUTRAS empresas …
    mudaria de sentido em silêncio na F66"*. Três linhas levantam a mão: `getDiagnostico` (`/dev`: as contagens passam a
    ser da empresa), `excluirItem` (a contagem de lançamentos de um item) e `paresEmOutrasFiliais` (o conflito entre
    filiais tem de ser por empresa, e o recorte o torna por empresa).

**`eventos_admin` e o comprimento**

20. **`eventos_admin`**: `(id, quando, autor, acao, alvo text, detalhe jsonb, empresa_id)`. Produção: 102 linhas, a maior
    com 5.070 bytes, 120 kB no total, **nenhuma acima de 8 kB**. A leitura é "admin le auditoria", por `e_admin()`.
    O reset já manda o backup para o bucket acima de 25 registros. `alvo` guarda o e-mail do convidado.
21. **O comprimento** (vai para a F66B, decisão 1 do Johnny): 36 CHECK em `public`, **7** de comprimento; **65** colunas
    de texto nas 20 tabelas de negócio; `.max(` aparece 80 vezes em 16 arquivos de `src/lib/validators`. A ficha dizia
    "9 CHECK × 61 `.max()`": a F66B remede.

**A medição**

22. **Os instrumentos herdados** (a decisão 8 do `PLAN-F59.md`: a F66 herda o INSTRUMENTO, não o número):
    - `scripts/perf/medir-rls.mjs`: `gerar`/`analisar` pelo canal MCP. Os blocos são `do $f59$ … $f59$;` que terminam em
      `raise exception`, com `transaction_read_only = on`, `set local role authenticated` e claims. A identidade é
      escolhida DENTRO do banco e o id nunca atravessa. Falha fechada: recusa alvo/ref trocados e qualquer escrita, DDL
      ou `set_config` fora da lista;
    - `scripts/perf/medir.mjs`: TTFB só GET, com aquecimento, rodadas em round-robin, mediana e p95, credenciais do
      smoke;
    - os números da F59 em produção (mediana de execução, N = 9): `ativos` F0 1,62 ms · F3 2,13 ms; `movimentacoes` F0
      1,92 ms · F3 2,74 ms. A ficha cita o p95 de `/ativos`, 1.037 ms a frio;
    - ⚠ **o ruído entre dias foi de 3,5% a 18%** nas rotas autenticadas, com o MESMO código no ar (`PLAN-F59.md`). A
      régua de 15% da ficha só significa algo contra uma linha de base do MESMO dia, tirada imediatamente antes.
23. **O lock.** `alter policy` e `create index` tomam lock na tabela até o commit, e o `apply_migration` é UMA transação.
    Confira na documentação do PostgreSQL 17 o nível de cada um (a expectativa é `ACCESS EXCLUSIVE` para policy e
    `SHARE` para índice comum). Agrupe por lote, na ordem de lock do app, com `set lock_timeout = '2s'`/`reset` (o molde
    F63–F65).

**O apply, o método e a conferência (o molde da F65)**

24. **O `apply_migration` do MCP é ATÔMICO**, e o CI (`psql -f` sem `-1`) não é. `create index concurrently` é
    **proibido** (falha dentro da transação do MCP). O classificador (`scripts/db/classificar-migration.mjs`) trata
    `alter policy`, `create index`, `drop index` sem `cascade` e `create or replace function` como **ADITIVA**; cabeçalho
    obrigatório; entrada em `DA_F38` e em `migrations.lock.json`; `db:lock` no mesmo commit; nome-sem-prefixo que não
    repete.
25. **ADR-003 + `RUNBOOK-BANCO.md`.** Apply pelo MCP, ensaio primeiro, `name` = nome do arquivo sem `NNNN_`, e nenhuma
    migration toca banco real antes de o CI tê-la rodado. **Proibidos:** `supabase db push`, `migration repair`, `db reset
    --linked` e reescrever `schema_migrations`. Prova pós-apply: `notify pgrst, 'reload schema'`, `get_advisors`
    (segurança E performance), paridade das 11 classes, sonda de exatidão (o texto aplicado igual ao do arquivo) e smoke.
    A sonda de deriva cobra em até 24 h. Sem MCP, é caminho B, e o PR não é mergeado.
26. **A conferência e as credenciais.**
    - `/api/saude` devolve `{ok, versao, commit, banco, ms}`.
    - `node scripts/smoke/smoke-prod.mjs`; `gh workflow run saude.yml -f partes=b` dispara a Parte B.
    - O conferidor de formas: `NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local
      scripts/formas/conferir.mts --alvo=ensaio|producao --saida=…`.
    - O `.env.local` aponta para o ENSAIO e as `SMOKE_*` para PRODUÇÃO. Regra do `INVENTARIO-CREDENCIAIS.md` §9: **nunca
      abrir, filtrar nem imprimir o `.env.local`**. Ele só entra por `--env-file`.
    - **Esta fase não muda o TS que o app executa** (as policies, os índices e o corpo de duas `rel_*` são do banco; o
      TS muda só em testes e travas). O app no ar entre o apply e o deploy é o mesmo de depois.
27. **Os rollbacks encadeados** (R-ACC-90): `supabase/rollback/F62-1-*`, `F62-2-*`, `F63-desfaz.sql`,
    `F64-desfaz.sql` e `F65-desfaz.sql`, com `f62_rollback.sql` a `f65_rollback.sql`.
    - ⚠ **Policy que cita `empresa_id` DEPENDE da coluna**: o `drop column empresa_id` dos rollbacks F63/F64 passa a
      falhar depois da F66. **Os quatro roteiros de rollback têm de rodar o da F66 ANTES**, e o `F66-desfaz.sql` devolve
      cada policy ao texto de antes, byte a byte (o texto do catálogo, não o da migration original).
28. **As regras do `CLAUDE.md` que pesam aqui** são a 1, a 2, a 3, a 5, a 6, a 7 e a 8. A regra 6 pede documentação
    oficial antes de afirmar:
    - no PostgreSQL 17: `ALTER POLICY` (o que ele troca, o lock), `CREATE INDEX` dentro de transação e o lock dele, o uso
      de índice com `= ANY` sobre `InitPlan` e `ORDER BY … LIMIT`, `row_security`, e a avaliação de sub-select em
      qualificador de segurança (a R-ACC-68 cita `planner.c`);
    - na Supabase: *RLS Performance and Best Practices*, e a RLS do Realtime `postgres_changes`.
    - A F64 mediu que o Context7 não indexa o PG 17; nesse caso, vá a `postgresql.org/docs/17`.
    - O molde de fechamento é o das F58→F65: um PR de código, com as migrations aplicadas no ensaio e em produção
      **antes** do merge; merge com os dois checks verdes; conferência pós-deploy; e um PR só de documentação que leva a
      tag.

---

## As três decisões do Johnny (24/09/2026)

1. **O CHECK de comprimento vira a fase F66B**, depois da F66 e antes da F67. A F66 não cria CHECK nenhum; só escreve a
   ficha da F66B no `PLANO-MULTIEMPRESA.md`, com o censo do fato 21, os quatro caminhos sem Zod, a pergunta "o que
   acontece com a linha do import que passa do teto" e a contagem de violação por coluna medida em produção.
   - Motivo: a F66 é inerte por construção, e o CHECK é recusa nova, visível para o operador.
   - **Desvio declarado** da ficha.
2. **A troca de `pode_escrever_filial` pela forma de pares entra na F66, com prova em produção conta a conta.** Um bloco
   `do … raise exception`, só leitura, no molde do `medir-rls.mjs`, percorre DENTRO do banco cada membership ativa,
   assume a identidade dela pelas claims e compara as duas regras em todas as filiais. O mesmo bloco compara também
   `pode_escrever()` × `empresas_de_escrita()` e `e_admin()` × `empresas_de_admin()`. Sai **só a contagem de
   divergências**, que tem de ser 0, e o número de memberships e de pares conferidos.
   - Motivo: os 5 operadores com vínculo só existem em produção.
   - O desenho é da decisão 10; o bloqueio, se der ≠ 0, está em "Bloqueios".
3. **`eventos_admin`: só o recorte da leitura.** O jsonb fica. A medição do fato 20 vai para a ata, e o "considerar" da
   ficha fecha com ela. Se um dia a trilha crescer, o assunto volta pelo backlog, não por esta fase.

---

## As frentes, e por que nesta ordem

- **A — o censo e o "antes".** Os 28 fatos remedidos, o `PLAN-F66.md`, a tabela-verdade classe → função, o censo dos
  índices e dos consumidores, a linha de base do MESMO dia (`medir-rls` e `medir.mjs`), a prova conta a conta EMULADA
  (antes de qualquer apply) e a impressão "antes" nos dois bancos.
- **B — as travas, vermelhas.** A forma do recorte (derivada do catálogo), `to authenticated`, as travas que invertem,
  a bateria de leitura de `isolamento_tenant.sql`. Regra 4 da §4: trava antes da correção.
- **C — o banco.** Três lotes de policies (acervo → vocabulário → registros e vínculos), depois as `rel_*`, depois os
  índices medidos.
- **D — o TS.** Só travas e testes. Nenhum código que o app executa muda.
- **E — os roteiros, os catálogos, o injetor e os rollbacks encadeados.**
- **F — os documentos**, inclusive a ficha da F66B.
- **G — o fechamento, com ordem interna rígida.** Versão → revisão adversarial → SHA congelado → CI verde → no ensaio:
  "antes" refeito + prova emulada + apply lote a lote com a prova real entre eles + conferidor → em produção: o mesmo +
  smoke + TTFB do mesmo dia → merge → deploy → conferência → relatório → PR de documentação → tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F66 do `docs/PLANO-MULTIEMPRESA.md` (§7), a quinta da virada: as policies ganham o recorte de tenant,
EM CONJUNÇÃO com o piso de hoje. Ao terminar:
- as 51 policies de `public` cuja tabela tem `empresa_id` (fato 5) citam a coluna na forma içada da doutrina —
  `empresa_id = any (array (select public.<função de conjunto>()))` —, com a função da classe da policy (decisão 2),
  em USING e em WITH CHECK, e o piso de hoje continua lá, intacto;
- as 6 policies de escrita com `pode_escrever_filial(filial_id)` estão na forma de pares, `(empresa_id, filial_id) in
  (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)`, em conjunção com o termo de empresa que dá
  o índice (R-ACC-68). As 6 saíram de `k_excecoes_predicado` no mesmo commit;
- as três policies sem a coluna (`profiles` ×2, `_bkp_relatorios_gerados_f6a`) são exceção NOMINAL, com motivo e
  destino, numa fonte só;
- toda policy de `public` e de Storage é `to authenticated`, e uma trava o confere;
- as travas que diziam "nenhuma policy cita `empresa_id` antes da F66" se inverteram: a policy de tabela com a coluna
  que NÃO a cita, ou que a cita com a função errada para a classe, reprova — derivado do catálogo;
- `isolamento_tenant.sql` prova a LEITURA entre empresas: na direção A com as policies reais; na direção B com o piso
  neutralizado dentro da transação do roteiro (fato 7); e o membro das duas vê as duas;
- os índices de lista são liderados por `empresa_id` ONDE a medição provou que o plano os usa sob a policy nova, e
  o antigo caiu só onde nenhum consumidor sem o predicado dependia dele;
- `rel_por_motivo_filiais` e `rel_resumo_filiais` juntam `motivos` pelo par `(empresa_id, codigo)`;
- **nada mudou para a WAP**: a prova conta a conta (decisão 2 do Johnny) deu 0 divergência de leitura e de escrita
  nos dois bancos, o smoke e o conferidor passaram, e o TTFB não regrediu mais que 15% contra a linha de base do MESMO
  dia;
- **nenhuma tupla foi reescrita**;
- a ficha da F66B (o comprimento como regra do banco) está escrita no plano, com o censo medido.

Uma run, um PR de código e um PR de documentação com a tag. Versão `1.71.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1 e §3 (a conjunção e a remoção como duas fases; a ordem estrutura → integridade → policy → definer → …);
  - §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 5, no-op primeiro;
    a 8, migration nunca se edita; a 10, a ORDEM de rollback);
  - a ficha **F66** no §7, com as notas F65 (os índices de lista, o join por código). Ela é a FONTE DA VERDADE do
    escopo: onde esta ordem e ela divergirem sem declaração, vale a ficha;
  - as fichas **F67**, **F69** e **F72**, para saber o que NÃO antecipar.
- `docs/prompts/F66-policies-ganham-o-recorte-ultracode.md`: o cabeçalho com os **28 fatos medidos** e as três decisões
  do Johnny. Este prompt os cita pelo número.
- `CLAUDE.md`, `AGENTS.md`, `supabase/CLAUDE.md` e `scripts/db/CLAUDE.md`: as regras permanentes, em especial a **1**,
  a **2**, a **3**, a **5**, a **6** (Context7 e a documentação oficial do PostgreSQL 17 e da Supabase; o Context7 não
  indexa o PG 17, então use `postgresql.org/docs/17`), a **7** e a **8**.
- **A doutrina que esta fase finalmente executa.** `docs/MATRIZ-REGRAS.md`, a emenda F59 inteira (R-ACC-63 a R-ACC-72 e
  "A forma-alvo, para copiar"), a emenda F62 (R-ACC-80) e a emenda F65 (R-ACC-98 a R-ACC-107); `docs/PLAN-F59.md`
  (§2.4, as decisões 2, 5 e 8, e a tabela de medição); `docs/f59-evidencias/B-forma-alvo-ensaio.json`.
- **O molde imediato é a F65.** Leia `docs/RELATORIO-F65.md`, `docs/PLAN-F65.md`, a ata de 2026-09-23 · F65 em
  `docs/DECISOES.md` e `docs/f65-evidencias/` (`impressao-tenant.sql`, `impressao-catalogo.sql`,
  `exatidao-pos-apply.sql`, `antes/`, `depois/`). Leia também `docs/f64-evidencias/impressao-policies.sql`.
- `docs/ADR-001-rls-por-filial.md`, `docs/ADR-002-papeis-e-permissoes.md`, `docs/ADR-003-metodo-de-migration.md`,
  `docs/RUNBOOK-BANCO.md` inteiro (os Anexos F63 a F65 e a ordem de rollback), `docs/INVENTARIO-LEITURAS.md` e
  `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e destinos, **nunca o `.env.local`**).
- O código, nesta ordem:
  - as migrations `0063`, `0067`, `0068`, `0070`, `0103`, `0107`, `0112`, `0114`, `0143`, `0153`, `0155`–`0158`,
    `0168` e `0173`;
  - `supabase/tests/catalogo_policies.sql` inteiro (os conjuntos, o bloco 4 da doutrina, o 6a–6c do piso, o bloco 5 e
    o 15g/15h/15i), `isolamento_tenant.sql` (a convenção de honestidade e a seção 9), `empresa_no_acervo.sql` (o 7a),
    `empresa_no_vocabulario.sql`, `catalogo_secdef.sql` (o bloco 7), `f60_recorte.sql`, `papeis_rls.sql`,
    `f62_rollback.sql` a `f65_rollback.sql` e `_asserts.sql`;
  - `src/lib/validators/policies-initplan.test.ts`, `scripts/db/predicado-policies.mjs` e o teste dele,
    `catalogos-seguranca.test.ts` (os describes 5, 7, 9, 10, 13 e 14), `empresa-acervo-sem-leitura.test.ts`,
    `rpcs-recorte-sql.test.ts`, `asof-orcamento.test.ts` e `src/lib/itens/migrations-f38.test.ts`;
  - `scripts/perf/medir-rls.mjs` e o teste dele, `scripts/perf/medir.mjs`, `scripts/perf/equivalencia-rel.mjs`;
  - `scripts/db/classificar-migration.mjs`, `mutacoes.mjs`, `mutacoes.test.mts`, `run-mutation-tests.mjs` e
    `corpo-vigente.mjs`;
  - `scripts/formas/conferir.mts`, `scripts/smoke/smoke-prod.mjs`, `scripts/smoke/deriva-migrations.mjs`,
    `supabase/ci/impressao-schema.sql` e `.github/workflows/ci.yml` (só leitura).

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 28 fatos, medidos em 24/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco e os bancos de hoje antes de
agir. Onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o relatório. Os que
mais importam:
- **fato 1**: a primeira migration é a `0175`, não a `0156`;
- **fato 4**: as 62 já são `to authenticated`; falta a trava;
- **fato 5**: 51 policies recebem o recorte, não 54, e as classes de hoje;
- **fato 7**: a ponte de `papel_atual()` fecha tudo para o membro só da B — a direção B não se prova com as policies
  reais;
- **fato 8**: a inércia medida, e a lacuna do ensaio (nenhum operador com vínculo);
- **fato 10**: as 6 exceções saem da lista no mesmo commit, e nada de DDL de policy dinâmica;
- **fato 11**: o `->>` do snapshot na forma de pares;
- **fato 12**: as cinco travas que invertem;
- **fato 14**: o índice mais usado não está na ficha, e o PG 17 sem skip scan;
- **fato 22**: a linha de base é a do MESMO dia;
- **fato 27**: a policy depende da coluna, e os rollbacks anteriores passam a rodar o da F66 antes.

## Comandos que já existem: use, não reinvente
- `npm run lint` · `npm run test` · `npm run typecheck` (= `npx tsc --noEmit`) · `npm run build` · `npm run contraste` ·
  `npm run verificar:actions`.
- `npm run db:lock`, obrigatório no commit de cada migration.
- `node scripts/db/classificar-migration.mjs` (e `--censo`).
- `npm run db:test`, `npm run db:test:mutations` e `npm run db:types:diff` precisam de Postgres e rodam no job
  `banco-sem-docker`. Na mesa, só se houver um Postgres 17 descartável que não seja nenhum dos dois bancos vivos (a
  F65 usou PGlite fora do projeto; o CI é a autoridade).
- `node scripts/perf/medir-rls.mjs gerar|analisar … --canal mcp --dir <fora do repositório>` e `node
  scripts/perf/medir.mjs --rotulo <antes|depois> --saida docs/perf/f66-….json`.
- `node scripts/perf/equivalencia-rel.mjs` (a equivalência das `rel_*`, F60).
- Na Frente G: `node scripts/smoke/smoke-prod.mjs` e `NODE_OPTIONS=--conditions=react-server npx tsx
  --env-file=.env.local scripts/formas/conferir.mts --alvo=ensaio|producao --saida=docs/f66-evidencias/…` (fato 26).
- O MCP da Supabase: `list_projects`, `execute_sql` (só leitura), `apply_migration`, `list_migrations`, `get_advisors`
  (segurança E performance) e `generate_typescript_types`.

**Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`; **não rode** `supabase db push`, `migration
repair` nem `db reset --linked`; **não suba** `next dev`/`next start` contra o ensaio.

# Escopo

## Dentro: sete frentes, nesta ordem

### Frente A: o censo e o "antes"
O primeiro entregável é `docs/PLAN-F66.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`.
- **Os 28 fatos remedidos**, cada divergência contra a ficha anotada.
- **A tabela-verdade das 54 policies** (decisão 2): para cada uma, a classe de hoje, o texto normalizado de USING e de
  WITH CHECK (do `pg_policies`), a função de conjunto que ela ganha e o texto-alvo completo; ou a exceção nominal com
  motivo e destino.
- **O censo dos índices de lista** (decisão 8): todo índice não-único das tabelas com lista paginada, com forma,
  `idx_scan`, e os consumidores — as consultas TS pela sessão (que ganham o predicado), as funções `security definer` e
  o service role (que NÃO ganham). Para cada um: fica, é trocado ou ganha irmão, e por quê.
- **A releitura dos 102 "confia na RLS · F66"** do `INVENTARIO-LEITURAS.md` (fato 19): quais mudam de sentido sob o
  recorte. A resposta esperada é "nenhuma muda com uma empresa; estas três ficam por empresa com duas", e cada uma vai
  com a frase de por que isso é o certo ou o que a F67/F70 precisa fazer.
- **O desenho**, com as decisões 1 a 15 de "Autonomia" tomadas por escrito.
- **A ordem das migrations e a ORDEM DE ROLLBACK** (o inverso do apply), escrita também no rodapé de cada migration.
- **A linha de base do MESMO dia, nos dois bancos, antes de qualquer apply** (fato 22):
  - `medir-rls.mjs` re-rodado, com a forma de hoje (F0) e a forma NOVA emulada inline (a conjunção piso ∧ recorte, por
    classe), em `ativos` e `movimentacoes` no mínimo, persona de nível administrador (a de hoje) — em
    `docs/perf/f66-rls-{ensaio,producao}-antes.json`;
  - `medir.mjs --rotulo antes` contra produção, em `docs/perf/f66-producao-ttfb-antes.json`.
- **A prova conta a conta EMULADA, nos dois bancos, antes de qualquer apply** (decisão 2 do Johnny; desenho na decisão
  10). Leitura e escrita. Tem de dar 0 divergência. Se der mais que 0, **pare antes do apply** (ver "Bloqueios").
- **A impressão "antes"**, nos dois bancos, pelo MCP, só leitura, em `docs/f66-evidencias/antes/`:
  - **as policies**: `docs/f66-evidencias/impressao-policies.sql`, derivado do da F64: nome, tabela, comando, roles,
    permissive e o md5 de `qual` e de `with_check`, das 62 — e o TEXTO normalizado das 51 que a fase muda (é o que o
    rollback devolve; texto de esquema, não de dado);
  - **o catálogo**: índices das 20 tabelas (nome, `pg_get_indexdef`), o md5 do `prosrc` das funções que a fase NÃO pode
    tocar (todas, menos as duas `rel_*` da decisão 9), o `relfilenode` das 20 tabelas de `k_negocio`;
  - os advisors de segurança E de performance, contados por nível e nome.

  A saída é **só contagem, nome de objeto de esquema, texto de policy e hash**: nenhum id, código, slug, nome, termo ou
  texto de linha sai da consulta.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f66-evidencias/`. Vermelha no PR em
rascunho, verde no commit seguinte: o molde da F64/F65.
- **A forma do recorte** (em `catalogo_policies.sql`, bloco novo ou extensão do 4 — decisão 5), DERIVADA DO CATÁLOGO,
  lendo a ÁRVORE (`pg_policy.polqual`/`polwithcheck`), não o texto:
  - toda policy de tabela que TEM `empresa_id` (lida do catálogo, não de lista) cita a coluna no termo canônico
    `empresa_id = any (array (select public.<fn>()))` em USING (quando tem) e em WITH CHECK (quando tem);
  - a `<fn>` é a da classe da policy, pela tabela-verdade (decisão 2) — SELECT pelo piso com `empresas_do_membro`,
    SELECT de admin com `empresas_de_admin`, escrita com `empresas_de_escrita` ou `empresas_de_admin`;
  - as policies de escrita por unidade citam a forma de pares sobre `unidades_de_escrita()`, e nenhuma policy chama
    `pode_escrever_filial`;
  - o termo está em CONJUNÇÃO no nível de cima (um `or` com o termo dentro não conta);
  - as exceções nominais (as três sem a coluna) moram numa fonte só, com motivo e destino, e a lista é conferida nos
    dois sentidos (exceção sem policy viva reprova).

  Hoje ela reprova pelas 51.
- **`to authenticated`** (R-ACC-72, item 2): toda policy de `public` e de `storage.objects` tem `roles =
  {authenticated}`. Hoje nasce VERDE (fato 4), e a prova de que ela sabe ficar vermelha é a sabotagem.
- **As travas que invertem** (fato 12), cada uma reescrita para a verdade nova no MESMO commit em que ela passa a
  reprovar o estado de hoje:
  - o **15g** e o **7a** de `empresa_no_acervo.sql` viram "toda policy das [onze|oito] cita `empresa_id` na forma da
    classe" (ou saem, se a trava da forma acima já os cobre — decisão 5, sem duas fontes para o mesmo fato);
  - o **15h** e o **15i** continuam "nenhuma função/view lê `empresa_id` fora das exceções nominais", e as duas `rel_*`
    da decisão 9 entram como exceção nominal, por comando, com o motivo (integridade de junção, não recorte);
  - os describes de `catalogos-seguranca.test.ts` que diziam "até a F66" passam a dizer o que vale agora; a catraca TS
    (`empresa-acervo-sem-leitura.test.ts`) continua: o TS não recorta (quem recorta é a RLS), e o texto dela aponta a
    F67/F70.
- **A bateria de leitura** em `isolamento_tenant.sql` (decisão 7), sobre o CATÁLOGO (toda tabela com `empresa_id` e
  policy de SELECT), com a empresa B fictícia e fixture de B contada como `postgres`:
  - direção A, com as policies reais: o membro da WAP vê as linhas da WAP (universo > 0) e **0** da B;
  - direção B, com o piso neutralizado dentro da transação: o membro só da B vê as da B e **0** da WAP;
  - o membro das duas vê as duas;
  - a escrita cruzada: o admin da WAP inserindo linha com `empresa_id` da B leva 42501 pelo WITH CHECK (não pela guarda
    da F65, que só vê troca de empresa em UPDATE); atualizando ou apagando linha da B, afeta 0 linhas (ela é
    invisível); como `postgres`, o dado continua intacto; o par legítimo passa.

  Hoje a direção A reprova (a policy não recorta) e a B também.
- **A forma de pares** (decisão 3): um cenário de roteiro com operador vinculado à filial X da WAP — escreve em X, é
  recusado em Y e em filial da B; o admin escreve em toda filial da WAP, inclusive desativada, e é recusado na da B.
  Vermelho hoje nos cenários da B.
- **O join das `rel_*`** (decisão 9): um cenário com duas empresas, o mesmo código de motivo, e um membro das duas —
  o relatório não duplica. Vermelho hoje.

### Frente C: o banco (migrations `0175`+)
Migrations pequenas, por lote, na ordem de lock do app. Cada uma leva o cabeçalho de classe (validado pelo
classificador), o rollback no rodapé, `db:lock` no mesmo commit, entrada em `DA_F38` e um nome-sem-prefixo que não
repita nenhum arquivo do repositório. `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit` (o molde F63–F65).
**Sem `concurrently`, sem `cascade`, sem `update`, sem abrir a janela destrutiva, sem DDL de policy dinâmica**
(fatos 10, 23 e 24).
- **As policies, em três lotes** (decisão 1), cada policy por UM `alter policy … using (…) with check (…)` LITERAL, com
  o nome de hoje:
  - o **acervo** (23): `anotacoes`, `ativos`, `colaboradores`, `itens`, `lancamentos_item`, `movimentacoes`,
    `pendencias_item`, `termos_gerados` — inclui as 6 trocas por pares, todas em tabela do acervo;
  - o **vocabulário** (21): `filiais`, `tipos_item`, `motivos`, `kits_modelos`, `unidades_apelidos` e as três do import;
  - os **registros e os vínculos** (7): `eventos_admin`, `import_logs`, `relatorios_gerados`, `membros`,
    `operador_filiais`.

  O piso de cada policy fica EXATAMENTE como está hoje (a F72 o apaga): o termo novo entra ao lado dele. Nas 6 de
  unidade, o que sai é só `pode_escrever_filial(…)`; o `e_admin()` de "admin reabre", o `estorno_item_coerente` e as
  condições de `status` ficam.
- **As `rel_*`** (decisão 9): `create or replace` de `rel_por_motivo_filiais` e `rel_resumo_filiais`, com a mudança SÓ
  no join (`and mo.empresa_id = m.empresa_id`), o resto do corpo byte a byte, grants e `search_path` como estão.
- **Os índices** (decisão 8), numa migration própria, por último, e SÓ os que a medição da Frente A justificou: `create
  index` comum; o antigo cai no MESMO commit só se o censo provou que ninguém sem o predicado depende dele.
- **Nenhuma outra função criada ou recriada**, nenhuma coluna, nenhum CHECK (decisão 1 do Johnny), nenhuma policy de
  Storage (F67).

### Frente D: o TS
Esta fase não muda código que o app executa (fato 26). O TS que muda:
- as travas e os testes da Frente B e da Frente E;
- `policies-initplan.test.ts` e `predicado-policies.mjs`, se a forma de pares ou o `->>` do fato 11 pedirem ajuste na
  mesa — ajuste que ENSINA a guarda a ler uma forma nova, nunca que afrouxa uma regra;
- `migrations-f38.test.ts` (`RECRIACOES_AUTORIZADAS` para as duas `rel_*`);
- `scripts/perf/medir-rls.mjs` (a forma nova, emulada antes e real depois) e o bloco da prova conta a conta
  (decisão 10), se você o puser num script — com o mesmo portão de falha fechada do `medir-rls.mjs`.

`src/lib/types/database.ts` não muda (nenhuma coluna, nenhuma assinatura). Se a geração do MCP depois do apply
mostrar diferença, é achado: registre e descubra por quê antes de continuar.

### Frente E: os roteiros, os catálogos, o injetor e os rollbacks
- **`isolamento_tenant.sql`**: a bateria da Frente B, e o cabeçalho reescrito — o que a F66 entregou (a leitura
  recortada, em conjunção), o que falta (a ponte, na F67; o piso, na F72; `profiles`, na F69). A regra 3 da convenção
  fica como está.
- **Os roteiros que já montam uma segunda empresa** (`cargo_dev`, `cargo_equivalencia`, `catalogo_policies`,
  `empresa_no_acervo`, `empresa_no_vocabulario`, `integridade_tenant`, `kit_motivo_da_empresa`, `restauracao`): se
  algum passa a ver menos linhas porque agora o recorte vale, a fixture ou a identidade do cenário se ajusta, uma a uma,
  com a lista no relatório. **Nenhuma asserção muda para passar.**
- **O rollback**: `supabase/rollback/F66-desfaz.sql` na ordem inversa: as policies de volta ao texto de antes (o da
  impressão), as `rel_*` com o corpo de antes, os índices de antes. Ensaiado por `supabase/tests/f66_rollback.sql` até
  a impressão do CI tirada antes da `0175`. **`f65_rollback.sql`, `f64_rollback.sql`, `f63_rollback.sql` e
  `f62_rollback.sql` passam a rodar o da F66 antes** (fato 27), e `rollback-f65.test.ts` ganha o irmão da F66.
- **Os catálogos**: as travas da Frente B entram no `rodar-roteiros.sh`/CI pelo caminho que os outros usam. A fonte
  única da tabela-verdade e das exceções é amarrada por um describe de `catalogos-seguranca.test.ts`.
- **O injetor** (decisão 12).

### Frente F: os documentos
- **MATRIZ**: emenda **F66** em `docs/MATRIZ-REGRAS.md`, com regras a partir de **R-ACC-108**:
  - o recorte em conjunção, com a tabela-verdade classe → função;
  - a forma de pares em policy real (a R-ACC-68 sai de "CONFORME-POR-LEITURA");
  - `to authenticated` como trava (a R-ACC-72, item 2, sai de "CONFORME-POR-LEITURA");
  - as exceções nominais (`profiles` → F69; `_bkp` → permanente);
  - a regra nova de "quem lê `empresa_id`": a policy TEM de ler; a função, só por exceção nominal; o TS não recorta;
  - os índices liderados por `empresa_id` e o critério que os aceitou (R-ACC-72, item 3).
- **ADR e RUNBOOK**: a emenda F66 no `ADR-001` (a RLS por filial ganha a empresa) e no `ADR-002` (as funções de conjunto
  têm consumidor); o **Anexo F66** no `RUNBOOK-BANCO.md`: a receita "trocar policy em lote com o app no ar"
  (literal, por lote, prova conta a conta entre os lotes), o rollback por `alter policy`, e a ordem dos rollbacks.
- **PLANO**:
  - a nota **F66** no `PLANO-MULTIEMPRESA.md`, com os desvios medidos e as três decisões do Johnny;
  - **a ficha nova da F66B** (decisão 1 do Johnny), no formato das outras (Objetivo, Entra, Não entra, Entregas, Pronto
    quando, Trava, Dependências, Risco, Reversão), com o censo do fato 21 e a contagem de violação por coluna medida em
    produção (só contagem);
  - a ficha da **F67** ganha o que esta fase deixou (a ponte de `papel_atual()` e a direção B com as policies reais;
    o que a releitura do inventário apontou; o `where` explícito de `v_conflitos_filiais`);
  - a ficha da **F72** ganha o número medido do piso (as policies de SELECT com o piso, derivadas do catálogo — a ficha
    diz "16", o `k_piso_papel` diz 20) e a nota de que a bateria da F66 já provou o recorte sozinho;
  - a nota de `eventos_admin` (decisão 3 do Johnny), fechando o "considerar".
- **`docs/INVENTARIO-LEITURAS.md`**: as 102 linhas "F66" ganham o estado depois da fase, com as três que levantam a mão.
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`, com as três decisões do Johnny e as quinze da fase.

### Frente G: o fechamento, nesta ordem
1. `1.71.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real. Por exemplo:
   - cada pessoa passou a enxergar só os dados da empresa em que tem acesso — hoje, a WAP, então nada muda na tela;
   - a permissão de escrever numa unidade passou a vir da mesma regra que decide quem é de qual empresa;
   - listas longas (movimentações, lançamentos, auditoria) continuam rápidas com o novo recorte.

   Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F66.md`. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **No ENSAIO**, pelo `apply_migration` do MCP, com o `name` certo:
   - logo antes: a impressão "antes" e a prova conta a conta EMULADA refeitas (0 divergência);
   - o **lote 1**; depois dele, a prova conta a conta REAL do lote (0 divergência) e o catálogo do lote igual ao do CI;
   - o **lote 2**, a prova; o **lote 3**, a prova; as **`rel_*`**, com a equivalência antes × depois
     (`equivalencia-rel.mjs`, 0 célula divergente); os **índices**, com o `EXPLAIN (ANALYZE, BUFFERS)` "depois";
   - a prova pós-apply do runbook: `notify pgrst`; `get_advisors` de segurança (nenhum achado novo esperado) e de
     performance (o delta declarado por nome); o `relfilenode` das 20 **igual**; o `prosrc` intocado; as 11 policies
     que não mudam byte a byte; a sonda de exatidão; e **o conferidor de formas contra o ENSAIO**, com 0 recusadas.

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com a correção em migration NOVA.
6. **Em PRODUÇÃO**, na mesma ordem e com as mesmas provas, dentro de 24 h do commit das migrations:
   - a prova conta a conta entre os lotes, e o `relfilenode` igual, sem exceção;
   - logo depois do último apply, e antes do merge: `node scripts/smoke/smoke-prod.mjs` a partir da branch, o
     conferidor contra PRODUÇÃO (conta do smoke, só contagens) com 0 recusadas, `medir-rls.mjs` "depois" e `medir.mjs
     --rotulo depois` (decisão 11);
   - a paridade ensaio × produção nas 11 classes.

   Se a prova conta a conta der ≠ 0, se o `relfilenode` mudou, se o smoke ou o conferidor recusaram, ou se apareceu
   advisor de segurança não declarado que cita objeto da fase: **rollback imediato em produção** antes do diagnóstico,
   e registro no topo do relatório.
7. Ata e `docs/RELATORIO-F66.md` com o que já dá para escrever; o PR sai do rascunho; merge com os dois checks verdes,
   logo depois das provas.
8. **A conferência pós-deploy, só leitura**: `/api/saude` com `1.71.0` e o commit do merge; `node
   scripts/smoke/smoke-prod.mjs` com 0 falha; a Parte B do `saude.yml` disparada à mão, verde, com a sonda de deriva
   sem pendente. Nenhuma captura de tela de produção.
9. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.71.0` vai no merge
   dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Das decisões do Johnny e da ficha:**
  - o CHECK de comprimento (F66B: aqui só a ficha);
  - mover o jsonb de `eventos_admin` (decisão 3 do Johnny);
  - remover o piso de qualquer policy (F72);
  - a ponte de `papel_atual()`, `e_admin()`/`pode_escrever()` por empresa, `pode_escrever_unidade`, as guardas no-op
    da F52, o default `empresa_legada()`, os escritores por chave natural, `idsDeAdminsAtivos`, `v_conflitos_filiais`
    com `where`, as RPCs destrutivas com `p_empresa`, as travas advisory (F67);
  - Storage (as 8 policies, os dois buckets, `pode_ler_arquivo_termo`) e o Realtime (filtro e RLS na publication)
    (F67);
  - `profiles` e a leitura cruzada de perfis (F69);
  - a porta pública por senha e o visualizador (F68);
  - o seletor de empresa e qualquer UI (F70).
- **O que esta ordem acrescenta:**
  - editar migration aplicada;
  - DDL de policy dinâmica (`execute format(… policy …)`), laço que gera policy, ou policy nova com outro nome;
  - afrouxar a doutrina (R1–R3, a catraca 11b, o universo congelado), o classificador, a guarda de topo ou as travas
    das F59–F65 (só entram exceções NOMINAIS, com motivo);
  - índice criado só para calar o advisor, ou `drop` de índice sem o censo de consumidores;
  - mesclar as duas policies permissivas de UPDATE de `pendencias_item` (o WARN do advisor fica; é outra conversa);
  - subir número da linha de base do smoke ou do alarme;
  - `carga.ts`, `reset.ts`, `restaurar.mjs`, `scripts/seed.ts`;
  - `CLAUDE.md` da raiz;
  - `.github/workflows/**` e a proteção da `main`;
  - dependência nova;
  - `.env*` e `scratchpad/`;
  - os PRs do dependabot;
  - o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F66.md` tem os 28 fatos remedidos, a tabela-verdade das 54 policies, o censo dos índices e dos
   consumidores, a releitura do inventário, as quinze decisões, a ordem das migrations e a ORDEM DE ROLLBACK. Ele é
   anterior ao primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
3. A linha de base do mesmo dia (`medir-rls` nos dois bancos e o TTFB de produção), a prova conta a conta emulada (0
   divergência) e a impressão "antes" existem, tiradas antes de qualquer apply, só com contagens, nomes e textos de
   esquema e hashes.
4. As migrations começam na `0175`, com cabeçalho de classe validado pelo classificador, rollback no rodapé, `db:lock`
   no mesmo commit e entrada em `DA_F38`. Não há `update`, `cascade`, `concurrently`, abertura da janela destrutiva,
   DDL de policy dinâmica nem nome-sem-prefixo repetido. As únicas funções recriadas são as duas `rel_*`.
5. As 51 policies citam `empresa_id` no termo canônico da classe, em USING e em WITH CHECK, em conjunção no nível de
   cima, com o piso de antes intacto, nos dois bancos e no CI. A trava da forma nasceu vermelha e está verde.
6. As 6 de unidade estão na forma de pares, nenhuma policy chama `pode_escrever_filial`, e `k_excecoes_predicado` tem
   12 entradas (13, só se a decisão 3 declarou a ocorrência do snapshot de `movimentacoes` como exceção permanente),
   com `11a` e `11b` verdes.
7. As três policies sem a coluna são exceção nominal, com motivo e destino, numa fonte só, conferida nos dois sentidos.
8. Toda policy de `public` e de Storage é `to authenticated`, e a trava que confere isso existe.
9. As travas do fato 12 dizem a verdade nova; nenhuma ficou tautológica, e as exceções de função são nominais, por
   comando, com motivo.
10. `isolamento_tenant.sql` prova a leitura nas duas direções (A com as policies reais, B com o piso neutralizado na
    transação), o membro das duas, e a escrita cruzada recusada com o par legítimo aceito — com universo contado como
    `postgres` e toda recusa provada duas vezes.
11. A forma de pares está provada no roteiro (operador, admin, filial desativada, filial da B, o snapshot de
    `movimentacoes`) e a equivalência com `pode_escrever_filial` está provada no CI sobre as fixtures.
12. **Nada mudou para a WAP**: a prova conta a conta deu 0 divergência de leitura e de escrita nos dois bancos, antes
    (emulada) e depois de cada lote (real), com o número de memberships, tabelas e pares conferidos; o smoke logo
    depois do apply deu 0 falha; o conferidor deu 0 recusadas no ensaio e em produção.
13. O TTFB de produção "depois" não regrediu mais que 15% contra o "antes" do MESMO dia, rota a rota, pela regra da
    decisão 11; e o `medir-rls` "depois" está lado a lado com o "antes" e com a F59.
14. Os índices: cada um criado ou derrubado tem o `EXPLAIN (ANALYZE, BUFFERS)` antes × depois nos dois bancos, com a
    policy nova no plano, e o censo de consumidores. Nenhum foi criado só para o advisor.
15. As duas `rel_*` juntam por `(empresa_id, codigo)`, o resto do corpo byte a byte; a equivalência antes × depois deu 0
    célula divergente nos dois bancos; as travas de recorte das `rel_*` continuam verdes.
16. **Nenhuma tupla reescrita**: o `relfilenode` das 20 é igual antes × depois, nos dois bancos.
17. As funções que a fase não podia tocar estão byte a byte (md5 do `prosrc`), e as 11 policies que não mudam (as 8 de
    Storage e as 3 exceções) também.
18. A decisão sobre o injetor está na ata. As mutações entraram, são detectadas pelo cenário nomeado, o teto está no
    número exato com o porquê datado e a quarentena abaixo de ⅓.
19. O rollback está escrito na ordem inversa em `supabase/rollback/F66-desfaz.sql` e foi **ensaiado no Postgres do CI**
    até a impressão tirada antes da `0175`. `f65_rollback.sql`, `f64_rollback.sql`, `f63_rollback.sql` e
    `f62_rollback.sql` rodam o da F66 antes e continuam verdes.
20. O advisor de segurança só mudou no que foi declarado (o esperado é nada). O de performance mudou só no delta
    declarado por nome. A paridade ensaio × produção fecha nas 11 classes.
21. Os roteiros adaptados estão listados, com o motivo de cada um, e nenhuma asserção mudou para passar.
22. Nenhuma dependência nova; `.github/workflows/**`, o `CLAUDE.md` da raiz, `scripts/seed.ts`, os embeds de
    `formas/**` e o código que o app executa intocados; nenhum número da linha de base subiu.
23. As emendas estão feitas: MATRIZ (F66, a partir de R-ACC-108), `ADR-001`, `ADR-002`, `RUNBOOK-BANCO.md` (Anexo
    F66), `PLANO-MULTIEMPRESA.md` (nota F66, **a ficha da F66B**, as fichas F67 e F72, a nota de `eventos_admin`),
    `INVENTARIO-LEITURAS.md`, `docs/README.md`, `docs/prompts/README.md` e a ata em `docs/DECISOES.md`.
24. `package.json` em `1.71.0`, `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.71.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
25. Os dois PRs estão mergeados com os dois checks verdes e a conferência pós-deploy foi feita; se não, o bloqueio está
    no topo do relatório.
26. As sabotagens A a L estão com saída real em `docs/f66-evidencias/`.
27. Nenhum dado real (nome, e-mail, id, código de motivo, slug de produção, termo, patrimônio) em migration, teste,
    roteiro, evidência ou log. Da produção, só contagens, nomes e textos de esquema e hashes. Ninguém abriu o
    `.env.local`.
28. `docs/RELATORIO-F66.md` segue o padrão F45→F65, com o roteiro do Johnny no topo, o estado de repouso e a seção "o
    que este relatório NÃO prova".

# Verificação: rode de verdade
A cada incremento, rode `npm run lint`, `npm run test` e `npm run typecheck`. Rode `npm run build` antes de cada push.
Tudo o que é SQL (roteiros, injetor, `db:types:diff`) passa pelo `banco-sem-docker` do PR. Leia a falha, corrija a
**causa raiz** e repita até passar.

Não faça nada disto para um teste passar:
- alargar exceção para caber um caso que devia reprovar;
- trocar detecção por `skip`;
- afrouxar um catálogo, a doutrina, uma varredura, o classificador ou a guarda de topo;
- subir a linha de base;
- baixar o rigor da convenção de honestidade;
- mudar uma asserção existente sem conferir que ela prova a mesma coisa;
- ensinar a guarda da mesa a aceitar uma forma que o catálogo reprova (as duas julgam o MESMO universo — R-ACC-70).

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**NADA MUDA PARA A WAP, NENHUMA TUPLA É REESCRITA, E O "ANTES" VEM ANTES DE QUALQUER APPLY.** A prova conta a conta com 0
divergência (emulada antes, real entre os lotes), o `relfilenode` igual nas 20 e o conferidor com 0 recusadas no ensaio
são o portão do apply de produção. Os mesmos, em produção, mais o smoke, são o portão do merge.

Provas obrigatórias, cada uma com a saída real em `docs/f66-evidencias/`:
- **Sabotagem A, a forma do recorte.** A trava vermelha pelas 51 sobre o banco de hoje, verde depois. Cada um destes a
  deixa vermelha, pelo nome da policy:
  - uma policy de negócio sem o termo (uma das 51 de volta ao texto de antes);
  - o termo só em USING, sem WITH CHECK, numa policy de UPDATE;
  - a função errada para a classe (`empresas_do_membro()` numa policy de escrita de admin);
  - o termo dentro de um `or` (`… or empresa_id = any (…)`);
  - `using (public.e_membro(empresa_id))`, a forma proibida (a doutrina já a barra; a prova é que continua barrando);
  - uma tabela de negócio sintética com a coluna e uma policy sem o termo.
- **Sabotagem B, `to authenticated`.** Uma policy de `public` recriada `to public`, e uma de Storage, deixam a trava
  vermelha pelo nome.
- **Sabotagem C, a leitura, direção A.** Para cada tabela com a coluna e policy de SELECT (laço sobre o catálogo), o
  membro da WAP vê o universo da WAP (contado como `postgres`, > 0) e 0 da B. Com o termo retirado de UMA policy dentro
  da transação, o cenário daquela tabela fica vermelho.
- **Sabotagem D, a leitura, direção B e o membro das duas.** Com o piso neutralizado dentro da transação (decisão 7), o
  membro só da B vê o universo da B e 0 da WAP; o membro das duas vê as duas. Sem neutralizar, o membro só da B vê 0 de
  tudo — declarado como o efeito da ponte, não como prova.
- **Sabotagem E, a escrita cruzada.** O admin da WAP inserindo linha com `empresa_id` da B (e pais da B, para a FK
  composta não ser quem recusa): 42501 pelo WITH CHECK. Atualizando ou apagando linha da B: 0 linhas afetadas. Como
  `postgres`, o dado está intacto; o par legítimo (a linha da WAP) passa. Sem o termo no WITH CHECK, dentro da
  transação, o INSERT passa — a prova de que quem recusou foi o recorte.
- **Sabotagem F, os pares.**
  - operador vinculado a X escreve em X, é recusado em Y e em filial da B; admin escreve em toda filial da WAP,
    inclusive desativada, e é recusado na da B; `filial_id` nulo é recusado;
  - `movimentacoes`: o snapshot com a filial real de outra unidade é recusado para o operador, como hoje;
  - no CI, para cada fixture de pessoa × filial: `pode_escrever_filial(f)` = `(e, f) ∈ unidades_de_escrita()` — 0
    divergência;
  - `pode_escrever_filial` de volta a uma policy → `11a` vermelho; uma das 6 de volta à lista de exceções → `11b`
    vermelho.
- **Sabotagem G, "nada mudou", conta a conta** (decisão 10), nos dois bancos: a emulada antes (0), a real depois de
  cada lote (0), com o número de memberships, tabelas e pares conferidos. E a prova de que o bloco SABE achar
  divergência: no ensaio, dentro do próprio bloco (que termina em `raise exception`), uma comparação sabotada de
  propósito dá ≠ 0.
- **Sabotagem H, as `rel_*`.** No roteiro, duas empresas com o mesmo código de motivo e um membro das duas: o relatório
  não duplica; sem o `and mo.empresa_id = m.empresa_id`, duplica. Nos dois bancos, a equivalência antes × depois: 0
  célula divergente.
- **Sabotagem I, os índices.** Para cada índice criado: o `EXPLAIN (ANALYZE, BUFFERS)` da lista, como `authenticated`
  com a policy nova, antes × depois do índice, nos dois bancos — o nó, as linhas, os buffers, o tempo. Para cada
  derrubado: o censo de consumidores e a prova de que as consultas sem o predicado não pioraram.
- **Sabotagem J, o custo.** `medir-rls` antes × depois nos dois bancos (mediana, p95, o nó `InitPlan` ×1 por função), e
  o TTFB de produção antes × depois do mesmo dia, rota a rota, pela regra da decisão 11.
- **Sabotagem K, o rollback.** `F66-desfaz.sql` devolve o catálogo à impressão de antes da `0175`, com o texto de cada
  policy de antes. `f65_rollback.sql` a `f62_rollback.sql` rodam o da F66 antes e continuam verdes. Sem o da F66 antes,
  o `drop column` do da F63 falha — a prova de que o encadeamento é necessário.
- **Sabotagem L, o instrumento.** A impressão "antes"/"depois": uma policy alterada numa subtransação muda o md5 dela;
  um `alter column … type` muda o `relfilenode`; as migrations da fase não mudam o `relfilenode` de nenhuma das 20.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI;
  - mutações e teto;
  - policies com o recorte (0 → 51), exceções da doutrina (18 → 12, ou 13 pela decisão 3), policies `to
    authenticated` (62 → 62);
  - índices de lista (quais, com `empresa_id` na frente);
  - advisors de segurança e de performance, por nível e nome;
  - o `relfilenode` das 20 nos dois bancos;
  - a prova conta a conta (memberships, tabelas, pares, divergências) nos dois bancos;
  - o conferidor (pontos, linhas, recusadas) no ensaio e em produção;
  - `medir-rls` e TTFB;
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco e os bancos de hoje;
2. as três decisões do Johnny abaixo, que mudam a ficha;
3. a ficha da F66 no §7 do plano;
4. este prompt, no que ele detalha (onde ele diverge da ficha, a divergência está declarada aqui e vai para o
   relatório);
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, a MATRIZ, o código existente, o molde da
   F65);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**As três decisões do Johnny (24/09/2026), que a ficha não tinha:**
1. o CHECK de comprimento sai da F66 e vira a fase F66B; aqui só a ficha dela, com o censo medido;
2. a troca de `pode_escrever_filial` pela forma de pares entra, com a prova em produção conta a conta, saindo do banco
   só a contagem de divergências;
3. `eventos_admin` não muda de forma: só o recorte da leitura, com a medição na ata.

**As quinze decisões que esta fase precisa tomar por escrito:**
1. **As migrations e os lotes.** A proposta é: lote 1, o acervo (23 policies); lote 2, o vocabulário (21); lote 3, os
   registros e os vínculos (7); depois as `rel_*`; depois os índices. Cada lote numa migration, na ordem de lock do
   app, e o estado entre dois lotes é repouso válido (umas policies com recorte, outras sem — inerte com uma empresa).
   - A ficha pede "`isolamento_tenant.sql` verde entre os lotes". No CI a cadeia roda inteira; nos bancos vivos, o que
     roda entre os lotes é a prova conta a conta real do lote e o catálogo do lote. Declare esse desvio.
   - Se a migration do lote 1 ficar grande demais para o `lock_timeout` de 2 s (o acervo tem as tabelas mais quentes),
     divida por família e registre.
2. **A tabela-verdade classe → função**, a fonte única que a trava da forma lê. A proposta:

   | classe de hoje | termo que entra |
   |---|---|
   | SELECT pelo piso `papel_atual()` | `empresa_id = any (array (select public.empresas_do_membro()))` |
   | SELECT por `e_admin()` (`eventos_admin`, `import_logs`) | `… public.empresas_de_admin() …` |
   | escrita por `pode_escrever()` | `… public.empresas_de_escrita() …` |
   | escrita por `e_admin()` | `… public.empresas_de_admin() …` |
   | escrita por `pode_escrever_filial(filial_id)` | pares sobre `unidades_de_escrita()` + `… public.empresas_de_escrita() …` (decisão 3) |
   | `pendencias_item` "admin reabre" | `e_admin()` fica + pares + `… public.empresas_de_admin() …` |
   | `termos_gerados` (as 3 de escrita) | o de hoje fica + `… public.empresas_de_escrita() …` |
   | `membros`, `operador_filiais` (SELECT) | `… public.empresas_do_membro() …` |
   | `profiles` ×2 | exceção nominal → **F69** (a leitura cruzada de perfis) |
   | `_bkp_relatorios_gerados_f6a` | exceção nominal → permanente (infra congelada, sem a coluna, só `e_dev()`) |

   Confira cada linha contra o `pg_policies` e a semântica da função; onde divergir, a sua medição ganha, com o motivo.
   `membros` e `operador_filiais` são `k_infra` com a coluna: a proposta é recortá-las já (a leitura das memberships de
   outra empresa não tem motivo de existir). Se você decidir o contrário, é exceção nominal com destino.
3. **A forma de escrita por unidade.**
   - o texto-alvo de cada uma das 6, com a expressão da linha à ESQUERDA do `in` e o sub-select qualificado pelo alias;
   - o caso do snapshot de `movimentacoes` (fato 11): prove na mesa e na árvore que `(empresa_id, (snapshot_anterior
     ->> 'filial_id')::smallint) in (…)` passa R1/R3; se não passar, a saída é exceção nominal PERMANENTE daquela
     ocorrência, com motivo (a filial real do ativo é dado da própria linha), nunca por nome de função;
   - `fid` nulo e filial inexistente (fato 9), escritos;
   - a ordem: o `with check` de INSERT recebe a linha com o default da WAP antes da checagem — confirme que o default
     `empresa_legada()` vale antes do WITH CHECK (documentação do PG 17) e que a F67 é quem tira o default.
4. **`alter policy`, não `drop`/`create`.** O nome fica, o universo congelado (`10a`/`10b`) não mexe, os grants e o
   `to authenticated` ficam. Um comando literal por policy. O `alter policy` troca a expressão INTEIRA: o texto-alvo
   carrega o piso de hoje por extenso, copiado da impressão "antes". Confira que o texto normalizado do piso "depois" é
   o mesmo de "antes" (a 6a do piso casa por `ilike`, mas o rollback devolve texto exato).
5. **As travas**: onde mora a trava da forma (bloco novo em `catalogo_policies.sql` ou extensão do bloco 4); que o 15g e
   o 7a viram ou saem sem deixar duas fontes para o mesmo fato; a leitura da árvore (não do texto normalizado) para o
   termo canônico, a conjunção no nível de cima e a função da classe; o describe que amarra a fonte única; a trava de
   `to authenticated`.
6. **"Quem lê `empresa_id`" depois da F66**:
   - a POLICY tem de ler (a trava da forma);
   - a FUNÇÃO só por exceção nominal: as duas `rel_*` entram em `k_leitura_tenant` (ou numa fonte irmã), por comando,
     com o motivo "integridade de junção pelo par da FK composta, não recorte";
   - a VIEW continua não lendo (herda a RLS);
   - o TS continua não recortando: a catraca fica, com o texto apontando a F67 (a escrita recebe a empresa) e a F70 (a
     empresa na tela).
7. **A bateria de leitura.** A proposta para a direção B: dentro da transação do roteiro, neutralizar o piso das
   policies de SELECT (o estado que a F72 vai deixar), com `alter policy` sintético que o `rollback` do roteiro desfaz,
   e provar que o recorte SOZINHO isola nas duas direções. A alternativa é emular a F67 (`papel_atual()` respondendo
   por qualquer membership). Escolha, com o motivo, e diga no cabeçalho o que cada cenário prova e o que ele não
   prova. A escrita da direção B depende da ponte e é da F67: declare.
8. **Os índices** (decisão 1 do Johnny na F65):
   - o censo do fato 14 e da Frente A, inclusive `movimentacoes_data_ordem_idx`, que a ficha não lista;
   - o índice novo entra só se o `EXPLAIN (ANALYZE, BUFFERS)` como `authenticated`, com a policy nova (emulada antes
     do apply), mostrar que o plano o usa e não piora; `create index` comum, numa migration própria;
   - o antigo cai no MESMO commit só se nenhum consumidor sem o predicado (definer, service role) depende dele — pelo
     censo e pelo `idx_scan`; senão, fica, declarado;
   - a pergunta do PG 17 (o `= any` sobre `InitPlan` na coluna líder serve o `ORDER BY … LIMIT` sem sort?) é respondida
     pela documentação e pelo plano, nunca pela memória;
   - o delta do advisor de FK sem índice vai por nome.
9. **As `rel_*`**: o texto novo do join; o resto do corpo byte a byte, provado pelo diff de `prosrc` antes × depois
   restrito à linha; `RECRIACOES_AUTORIZADAS`; a equivalência com `equivalencia-rel.mjs`; as travas de recorte das
   `rel_*` verdes.
10. **A prova conta a conta** (decisão 2 do Johnny). Um bloco `do … raise exception`, só leitura, no molde do
    `medir-rls.mjs` (falha fechada, `transaction_read_only`, o alvo confirmado pelo `rotulo_de_ambiente()`), que
    percorre DENTRO do banco cada membership ativa:
    - **leitura**: para cada tabela com policy de SELECT, o que a conta vê sob a RLS é igual ao que ela via (antes: a
      policy de hoje × a policy de hoje ∧ o termo emulado; depois: a policy real × o universo que o piso de hoje lhe
      dava, no mesmo statement, sem corrida com o app);
    - **escrita**: para cada filial, `pode_escrever_filial(f)` = `(WAP, f) ∈ unidades_de_escrita()`;
      `pode_escrever()` = `WAP ∈ empresas_de_escrita()`; `e_admin()` = `WAP ∈ empresas_de_admin()`;
    - sai só: memberships conferidas, tabelas, pares e o número de divergências. Nenhum id, nenhum cargo por pessoa.

    O texto do bloco vai para `docs/f66-evidencias/` e é o MESMO no ensaio e em produção.
11. **A medição de custo e a régua de 15%.**
    - a linha de base é a do MESMO dia, tirada imediatamente antes do apply (fato 22), nunca o número da F59;
    - `medir.mjs` com o mesmo método antes e depois (aquecimento, round-robin, N rodadas);
    - uma rota que passar de 15% no p95 é medida mais duas vezes, intercalando;
    - se a regressão persistir e o `medir-rls` a atribuir ao predicado: um índice medido pode resolver na mesma run (a
      decisão 8); se não resolver, é bloqueio (ver "Bloqueios");
    - se o `medir-rls` NÃO atribuir, é ruído declarado, com os números.
12. **O injetor**: uma mutação por classe de policy onde ela derrubar uma trava desta fase que nenhum teste de mesa já
    derruba. As candidatas:
    - a policy de SELECT perde o termo;
    - o termo vira `or`;
    - a policy de admin com `empresas_do_membro`;
    - a de unidade de volta a `pode_escrever_filial`;
    - `to public`;
    - a quebra cross-tenant clássica: "a guarda confere o papel e esquece o tenant" (o WITH CHECK de escrita com o piso e
      sem o termo);
    - o join das `rel_*` sem a empresa.

    Teto novo exato, ou a ata diz por que não entrou.
13. **O rollback**: o texto de cada policy de antes (da impressão), a ordem inversa dos lotes, as `rel_*`, os índices; o
    encadeamento com os rollbacks F62–F65 (fato 27), e a declaração: depois da F73 (uma segunda empresa de verdade), o
    rollback da F66 abre a leitura entre empresas e só roda com o dado da segunda empresa fora.
14. **O instrumento "antes/depois"**: a impressão das policies (md5 por policy e o texto das 51), o `relfilenode` das
    20, os índices, o md5 do `prosrc` das funções intocáveis, e o critério que separa "mudou como planejado" de
    "mudou".
15. **O que a releitura dos 102 "confia na RLS" achou** (fato 19): cada linha que muda de sentido com duas empresas,
    com o que a F67/F70 precisa fazer. Nenhuma delas vira código nesta fase.

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **A prova conta a conta deu mais que 0** (emulada, em qualquer banco): não aplique nada naquele banco. Registre o
  número (só contagem) no topo do relatório, com o bloco que o reproduz. Entregue o resto, com o PR ABERTO e SEM merge.
  Uma conta que ganharia ou perderia acesso é decisão do Johnny, não da migration.
- **A prova conta a conta deu mais que 0 DEPOIS de um lote**: rollback daquele banco na ordem escrita, antes do
  diagnóstico. No ensaio: causa raiz, correção em migration NOVA, o ciclo de novo. Em produção: rollback imediato, sem
  merge, e o bloqueio no topo do relatório.
- **O MCP da Supabase não está conectado, ou recusa o apply.** Nas F60, F63 e F64, as ferramentas amanheceram
  desligadas uma a uma nas configurações do conector e voltaram horas depois. Não procure token, não leia o
  Gerenciador de Credenciais, não abra o `.env.local`. Confira de novo algumas vezes ao longo da run. Se não voltar,
  entregue tudo o que não depende do banco vivo, com o PR ABERTO e **SEM merge**. No topo do relatório vai o caminho B:
  as migrations na ordem, a prova conta a conta e as impressões para rodar antes e depois, e o rollback.
- **O `relfilenode` mudou, ou o conferidor recusou, no ensaio.** Rollback no ensaio na ordem escrita, causa raiz,
  correção por migration NOVA e o ciclo de novo. **Em produção:** rollback imediato, antes do diagnóstico, sem merge, e
  o bloqueio no topo do relatório.
- **O TTFB passou de 15% pela regra da decisão 11, sem conserto na run**: rollback em produção só do que o `medir-rls`
  apontou (o lote ou o índice), por `alter policy`/`drop index` do `F66-desfaz.sql`; PR sem merge; os números e a
  causa no topo do relatório. Com uma empresa, voltar é perder só a fase, não um dado.
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO de
  `supabase/rollback/F66-desfaz.sql` que o CI já ensaiou (ou o bloco dele que desfaz o lote em questão, se o arquivo
  estiver dividido por lote e o CI tiver ensaiado cada bloco). É a única exceção ao "`execute_sql` só leitura", e vale
  só para esse arquivo. A linha do ledger fica; registre o que a sonda de deriva vai dizer dela. Se o classificador de
  segurança barrar o rollback, não reformule: o comando exato vai no topo do relatório, e o PR fica sem merge.
- **O lock não veio** (o `lock_timeout` disparou): registre e tente de novo, no máximo três tentativas em 30 minutos.
  Não suba o timeout nem mate sessões do app. Depois da terceira, pare o apply daquele banco: PR aberto, sem merge, e o
  comando no topo do relatório. Parar entre dois lotes é repouso válido (decisão 1).
- **Advisor de segurança novo** depois do apply que não esteja declarado: se ele cita objeto desta fase, escalada do
  runbook e rollback antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e
  siga. O advisor de performance é informativo: registre o delta, não reverta por ele.
- **O smoke recusa** depois do apply de produção: alguém deixou de ver ou de escrever o que via. Rollback em produção,
  PR sem merge, e a causa no topo do relatório. Não tente consertar na mesma run.
- **A sonda de deriva abre alarme** porque um apply passou das 24 h: registre; o alarme fecha sozinho na Parte B
  seguinte.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a pendência
  com o que falta. Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, bloco que assume identidade, merge,
  push de tag, disparo de workflow): registre, não repita, não reformule, siga no que não depende dela, e ponha o
  comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui
já há doze divergências medidas de saída**, e elas vão no relatório:
- a numeração das migrations (`0175`, não `0156`; fato 1);
- as 62 já `to authenticated`: falta só a trava (fato 4);
- 51 policies recebem o recorte, não 54; `profiles` é da F69 e `_bkp` é permanente (fato 5);
- a ponte de `papel_atual()` e a direção B provada com o piso neutralizado (fato 7);
- as 6 exceções da doutrina saem no mesmo commit (18 → 12) e nenhuma DDL de policy dinâmica (fato 10);
- as cinco travas "até a F66" que se invertem (fato 12);
- o índice mais usado fora da lista da ficha, e o PG 17 sem skip scan (fato 14);
- o join das `rel_*` já protegido pela RLS para quem é de uma empresa só (fato 16);
- a linha de base do MESMO dia, com o ruído de 3,5% a 18% entre dias (fato 22);
- "`isolamento_tenant.sql` verde entre os lotes" vira a prova conta a conta entre os lotes nos bancos vivos
  (decisão 1);
- a policy depende da coluna, e os rollbacks F62–F65 rodam o da F66 antes (fato 27);
- as três decisões do Johnny (o CHECK na F66B, a prova conta a conta em produção, `eventos_admin` só recortada).

Declare também o que este prompt acrescenta à ficha:
- a tabela-verdade classe → função;
- a prova conta a conta, leitura e escrita;
- a releitura do inventário de leituras;
- a trava de `to authenticated`;
- o censo de consumidores antes de qualquer `drop index`;
- os rollbacks encadeados;
- a ficha da F66B.

# Git e segurança
- **Branch** `f66-policies-ganham-o-recorte`, com commits pequenos e frequentes e mensagens em pt-BR no padrão
  conventional (`docs(f66): …`, `test(f66): …`, `feat(f66): …`, `fix(f66): …`, `refactor(f66): …`, `chore(f66): …`).
- **Documentação primeiro.** Commite também esta ordem (`docs/prompts/F66-policies-ganham-o-recorte-ultracode.md`) num
  commit de documentação. O `PLAN-F66.md` vem antes do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os lotes vão em commits separados, nesta ordem:**
  1. as travas vermelhas;
  2. o lote 1 (o acervo), com as 6 exceções de pares saindo da lista;
  3. o lote 2 (o vocabulário);
  4. o lote 3 (os registros e os vínculos);
  5. as `rel_*`;
  6. os índices;
  7. os roteiros e os rollbacks;
  8. os catálogos e as travas que invertem;
  9. o injetor;
  10. os documentos;
  11. a versão.

  Cada migration leva o `db:lock` no mesmo commit. Se a decisão 1 dividir o lote 1 por família, cada exceção de pares
  sai da lista no commit da migration que a elimina.
- **Pushes agrupados**: cada um custa CI numa cota apertada.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece quando:
  - `verificar` e `banco-sem-docker` estão verdes;
  - a prova conta a conta deu 0 nos dois bancos, emulada e real;
  - o `relfilenode` é igual nos dois bancos;
  - o conferidor deu 0 recusadas no ensaio e em produção, e o smoke 0 falha;
  - o TTFB passou pela regra da decisão 11.

  Depois do merge: a evidência vai por um PR só de documentação, e qualquer correção de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `update`, `cascade`,
  `concurrently`, abrir a janela `estoque.dev_destrutivo`, `force row level security`, DDL de policy dinâmica;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; matar sessão do app; imprimir ou gravar id, código,
  slug, termo, rótulo, nome, e-mail, patrimônio, cargo por pessoa ou texto de linha real (nem em log, nem em evidência,
  nem na resposta); qualquer escrita fora do `apply_migration` e do rollback autorizado;
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de
  10/09); ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha e token;
- **no repositório:** mexer na proteção da `main` ou no workflow, instalar dependência, mexer nos PRs do dependabot,
  subir número da linha de base, mudar embed de `formas/**` ou código que o app executa.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local` e que, de banco, só lê catálogo,
contagens, textos de esquema e hashes. As frentes de exploração:
- (a) **as policies e a doutrina**: as 54 com o texto normalizado, a tabela-verdade, o bloco 4 e o 6a–6c de
  `catalogo_policies.sql`, a guarda da mesa e o que ela precisa aprender para a forma de pares e o `->>` (fatos 4 a 11);
- (b) **as travas que invertem e a bateria**: o 15g/15h/15i, o 7a, os describes "até a F66", a catraca TS,
  `isolamento_tenant.sql` e os roteiros com segunda empresa (fatos 12 e 13);
- (c) **os índices e a medição**: o censo, o `pg_stat`, os consumidores definer e service role, a documentação do PG 17
  sobre `= any` e ordem, `medir-rls.mjs` e `medir.mjs` (fatos 14, 15, 22 e 23);
- (d) **os relatórios, as views, o Realtime e o inventário**: as duas `rel_*` e as travas delas, as nove views, a RLS do
  `postgres_changes` na documentação da Supabase, a releitura dos 102 (fatos 16 a 19);
- (e) **os bancos, só leitura e só catálogo/contagem/texto de esquema/hash**: os fatos 1 a 9 e 14 remedidos, a
  impressão "antes" e o texto da prova conta a conta ensaiado no ensaio.

Escreva `docs/PLAN-F66.md` antes de implementar. **A edição é sequencial**: as migrations, as travas e os roteiros se
cruzam. Paralelize exploração, medição e revisão, não edição.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**, lendo o
código **pelo SHA** (nunca pela árvore de trabalho), contra o `PLAN-F66.md` e os 28 critérios, com estas perguntas:
- Alguma das 51 policies perdeu, trocou ou reescreveu o piso de hoje? O texto do piso "depois" é o de "antes"?
- Alguma policy tem o termo em USING e não em WITH CHECK (ou o contrário) onde as duas existem? Algum termo ficou dentro
  de `or`?
- A função de cada policy é a da classe? Uma policy de admin com `empresas_do_membro()` abriria a escrita a quem só lê.
- A forma de pares é equivalente a `pode_escrever_filial` para todo cargo, filial desativada, `fid` nulo e o snapshot de
  `movimentacoes`? Algum caminho legítimo de hoje passa a ser recusado?
- Alguma policy nova foi escrita por DDL dinâmica, ou escapou do replay da mesa?
- A trava da forma é derivada do catálogo e lê a árvore, ou é lista à mão ou texto que o Postgres pode reescrever?
- As travas que inverteram ficaram tautológicas? Sobrou duas fontes para o mesmo fato?
- A bateria de leitura prova o recorte, ou prova o piso? A direção B diz o que ela neutralizou e por quê?
- A prova conta a conta sabe achar divergência? Ela vaza algum id, cargo por pessoa ou nome?
- Algum índice derrubado ainda serve um consumidor sem o predicado (definer, service role)?
- As `rel_*` mudaram fora da linha do join?
- O `F66-desfaz.sql` devolve o texto EXATO de antes? Os rollbacks F62–F65 ainda rodam?
- Alguma sabotagem prova só o caminho feliz? Alguma evidência tem dado real?
- Algum arquivo fora do escopo foi tocado (código do app, embeds, seed, workflow, Storage)?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado,
não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F66.md`, em pt-BR, no padrão dos relatórios F45→F65, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B completo, se o MCP
  faltou; a prova conta a conta, se ela barrou);
- depois do deploy, entrar com a própria conta e conferir que tudo está como sempre:
  - a lista de ativos, a ficha de um ativo, as movimentações, os itens e o histórico de lançamentos;
  - registrar uma movimentação e um lançamento de item (a escrita por unidade);
  - a tela de Administração (filiais, tipos, motivos, kits, apelidos) e a Auditoria;
  - um relatório por motivo e o resumo;
  - com duas abas abertas, registrar uma movimentação numa e ver a outra atualizar (o Realtime com o termo novo);
- conferir `/api/saude` com `1.71.0` e a Parte B do `saude.yml` verde no dia seguinte, sem issue de alarme aberta;
- o `git diff v1.70.0 v1.71.0 --stat`, com o que deve e o que não deve aparecer;
- os lembretes: o CHECK é a F66B; a ponte e a escrita por tenant são a F67; `profiles` é a F69; o piso cai na F72.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas doze já
  conhecidas;
- as três decisões do Johnny e as **quinze decisões** da fase;
- a tabela-verdade das 54 policies;
- **a prova conta a conta** nos dois bancos (emulada e real, lote a lote);
- o `relfilenode` e a impressão antes × depois;
- os índices, com o `EXPLAIN` antes × depois e o censo;
- a medição: `medir-rls` e TTFB, antes × depois do mesmo dia, lado a lado com a F59;
- o conferidor no ensaio e em produção, e o smoke;
- as sabotagens com saída real;
- a contagem final;
- os 28 critérios autoverificados;
- o estado de repouso;
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que a empresa B vê o próprio dado pelas policies reais (a ponte fecha tudo para ela até a F67: a direção B foi
    provada com o piso neutralizado na transação do roteiro);
  - que uma linha nova de uma segunda empresa receberia a empresa certa (o default é a WAP até a F67);
  - que as `security definer` recortam (elas atravessam a RLS por construção: F67);
  - que o Storage e o canal do Realtime estão recortados por empresa além do que a policy de SELECT já faz (F67);
  - que `profiles` está recortado (F69);
  - que o custo se mantém com duas empresas e volume maior (a medição é do volume de hoje, uma empresa);
  - que a janela de produção entre os lotes ficou sem tráfego.

Pendências e **backlog nomeado**:
- **F66B**: o comprimento como regra do banco (a ficha escrita nesta fase);
- **F67**: a ponte de `papel_atual()`, a escrita por tenant, os definer, Storage, Realtime, o default, os escritores por
  chave natural, o que a releitura do inventário apontou;
- **F69**: `profiles`;
- **F72**: o piso;
- **Backlog nomeado** (decisão 3 do Johnny na F65): o seed de duas empresas, `scripts/seed.test.ts` e o `onConflict`
  de `seed.ts:886`;
- **Backlog** (do `RELATORIO-F60.md`): a paginação keyset e a ordem visível no empate;
- **PATCH** (do backlog da F62): derrubar `profiles.papel`/`ativo` a partir de 13/10/2026;
- **PATCH** (do `RELATORIO-F65.md` §13): o hand-fix da F62 em `operador_filiais.Insert` no gate de tipos;
- **Avulsos** (das F63/F64): `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` rastreados pelo git; o corpo vivo de
  `apagar_movimentacao`/`resetar_acervo` × o arquivo;
- o WARN `multiple_permissive_policies` de `pendencias_item` (UPDATE), se a medição disser que vale uma conversa.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`empresas_do_membro`, `empresa_id`); os nomes que a ficha fixa ficam como estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---
## Como executar

### Pré-voo (uma vez, ~15 minutos)

Esta fase **toca os dois bancos**: aplica migrations no ensaio e em produção pelo MCP da Supabase, antes do merge, em
lotes, e roda em produção um bloco só leitura que assume cada conta ativa para contar divergências (a sua decisão 2).
Ela muda 51 policies, talvez alguns índices e o corpo de duas funções de relatório. Como nas F60, F63 e F64, o item do
pré-voo que mais importa é o MCP: ele já amanheceu com as ferramentas desligadas uma a uma nas configurações do
conector.

Este arquivo já está salvo em `docs/prompts/F66-policies-ganham-o-recorte-ultracode.md`, **sem commit**. O agente o
commita na branch da fase. O prompt cita os 28 fatos do cabeçalho pelo número, então o arquivo precisa estar lá quando
você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull      # a cópia está na branch f65-fecho-docs; o main local ficou em 469632b
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.70.0, tag v1.70.0 no merge do PR #78 (3f7a642); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short
Test-Path .git\index.lock    # tem de dar False — uma trava órfã derruba o primeiro commit da run
Test-Path docs\prompts\F66-policies-ganham-o-recorte-ultracode.md   # tem de dar True

# 3. Produção com a mesma versão, e a Parte B do saude.yml verde hoje (sem issue de alarme aberta).
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
& "C:\Program Files\GitHub CLI\gh.exe" run list --workflow saude.yml --limit 3
& "C:\Program Files\GitHub CLI\gh.exe" issue list --state open --limit 5

# 4. O smoke de produção passa HOJE — é a conferência da fase.
node scripts/smoke/smoke-prod.mjs

# 5. O MCP da Supabase conectado ao Claude Code, enxergando os dois projetos.
claude mcp list

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O passo 5 é o que mais importa.** Dentro do Claude Code, confira duas coisas:
- que o MCP lista `pbtjcalbmepmrqzprusb` (produção) e `sgmvldiizsrjbxzzpmhh` (ensaio);
- que **as ferramentas estão ligadas** nas configurações do conector no claude.ai: `execute_sql`, `apply_migration`,
  `list_migrations`, `get_advisors` e `generate_typescript_types`.

Sem elas, o agente entrega tudo verde no CI, **deixa o PR aberto, sem merge**, e põe o caminho B no topo do relatório.

**Mais três coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. As travas nascem vermelhas no CI (um push a mais), e o
   `banco-sem-docker` vai rodar algumas vezes, mais o PR de documentação e a Parte B disparada à mão.
2. **Dentro do Claude Code:** `/permissions` (nada pode negar `git push`, `gh`, `node`, `npx tsx` nem as ferramentas
   do MCP da Supabase) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).
3. **O horário.** A fase é desenhada para ser inerte, e a prova conta a conta roda entre os lotes. Mas o TTFB "antes" e
   "depois" é medido no mesmo dia e compara horários diferentes: rodar num horário de uso estável (não no pico da
   manhã) reduz o ruído que a régua de 15% precisa ignorar. Evite a janela da Parte B das 06:43.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f66
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP em lotes, roda blocos só leitura que
assumem identidade em produção, mede TTFB, abre e mergeia PRs, publica tag, dispara workflow e roda o smoke e o
conferidor contra os dois bancos. Nada disso cabe numa allowlist estreita. `bypassPermissions` numa máquina com
credencial de produção está fora de questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção, no bloco que assume a identidade
de cada conta (é só leitura e termina em `raise exception`, mas o classificador pode estranhar), no merge na `main`, no
push da tag e no disparo da Parte B. As F53→F65 passaram por ele, e a F65 parou uma vez no apply do ensaio. Se barrar,
o prompt manda não reformular: o agente registra, segue no resto e põe o comando no topo do relatório.

**`--worktree` NÃO serve.** O smoke, o conferidor e o `medir.mjs` precisam do `.env.local`, que não vai para a
worktree, e o prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** Parecido com a F65: a tabela-verdade das 54 policies, a doutrina aplicada pela primeira vez em policy real,
as travas que se invertem, a bateria nas duas direções, a medição de índices e de TTFB, e os rollbacks encadeados. Rode
tudo no modelo forte. A revisão adversarial (o piso intacto, a função certa por classe, a equivalência dos pares) é onde
ele mais rende. Só se a cota semanal estiver apertada, use `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do
`claude`, para economizar na exploração.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F66.md e docs/f66-evidencias/impressao-policies.sql existem; package.json em 1.71.0; docs/RELATORIO-F66.md existe; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, as migrations 0175+ aplicadas no ensaio e em producao, com docs/f66-evidencias/antes preenchido, a prova conta a conta com 0 divergencia emulada e real nos dois bancos, o relfilenode das 20 tabelas igual antes e depois nos dois bancos, o conferidor de formas com 0 recusadas no ensaio e em producao, o smoke apos o apply sem falha, o TTFB do mesmo dia dentro da regra dos 15 por cento, a conferencia pos-deploy e a Parte B passaram sem issue de alarme aberta e a tag v1.71.0 foi publicada; (b) o apply de producao nao aconteceu (classificador barrou, lock nao veio em tres tentativas, ou a prova conta a conta deu mais que 0): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F66.md; (c) tudo aplicado e mergeado, mas o push da tag ou a conferencia barrados, com o comando no topo do docs/RELATORIO-F66.md; (d) sem MCP da Supabase: PR aberto sem merge, com o caminho B, a prova conta a conta e as impressoes para rodar antes e depois no topo do docs/RELATORIO-F66.md; (e) a prova conta a conta, o relfilenode, o conferidor, o smoke ou o TTFB reprovaram depois do apply: rollback aplicado (ou, se barrado, o comando do rollback no topo), PR sem merge e a causa no topo do docs/RELATORIO-F66.md; ou (f) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F66.md
```

**Headless.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f66.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f66.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f66.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. Como esta fase aplica em
produção e assume identidade em bloco só leitura, **prefira a sessão interativa deixada rodando, com o `/goal`**, e com
a suspensão do Windows desligada no plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Seis momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F66.md` com a tabela-verdade das 54 policies, `docs/f66-evidencias/antes/` e
   `docs/perf/f66-*-antes.json`, antes de qualquer migration aplicada. A prova conta a conta emulada tem de dar 0. Só
   contagens, nomes, textos de policy e hashes: se aparecer um id, um e-mail, um nome ou o cargo de uma pessoa ali,
   interrompa a sessão.
2. **As travas vermelhas.** A forma do recorte reprovando pelas 51, e a bateria de leitura reprovando nas duas direções,
   antes de qualquer correção.
3. **O ensaio.** Lote a lote, a prova conta a conta real com 0, o `relfilenode` igual nas 20, e **o conferidor no ensaio
   com 0 recusadas**.
4. **A produção.** O mesmo, mais o smoke logo depois do último lote, o conferidor com 0 recusadas e o TTFB "depois". Se
   algum falhar, o prompt manda fazer o rollback na hora, e o relatório diz isso no topo.
5. **O merge e o deploy.** Não há código do app mudando: o deploy só leva as travas e os documentos.
6. **A conferência.** `/api/saude` em `1.71.0`, o smoke com 0 falha, a Parte B verde e nenhuma issue de alarme aberta.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Entre com a sua conta em produção e faça o roteiro do topo do relatório:
   - abra a lista de ativos, uma ficha, as movimentações, os itens e o histórico;
   - registre uma movimentação e um lançamento de item;
   - passe pela Administração e pela Auditoria;
   - gere um relatório por motivo e o resumo;
   - com duas abas abertas, registre uma movimentação numa e veja a outra atualizar.

   Tudo tem de funcionar e mostrar exatamente o que mostrava antes.
3. `git diff v1.70.0 v1.71.0 --stat`. Devem aparecer:
   - `supabase/migrations/0175_*` em diante, `supabase/migrations.lock.json`, `supabase/rollback/F66-desfaz.sql` e
     `supabase/tests/**` (`catalogo_policies.sql`, `isolamento_tenant.sql`, `empresa_no_acervo.sql`, `f66_rollback.sql`,
     os quatro rollbacks anteriores e talvez os roteiros com segunda empresa, cada um explicado no relatório);
   - os testes de `src/lib/validators/` e de `src/lib/itens/`, e talvez `scripts/db/predicado-policies.mjs`,
     `scripts/db/mutacoes.mjs` e `scripts/perf/medir-rls.mjs`;
   - `docs/perf/f66-*`, `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`.

   **Não** devem aparecer:
   - `src/lib/queries/**`, `src/lib/actions/**`, `src/components/**` e `src/app/**` (nenhum código do app muda);
   - `src/lib/types/database.ts`;
   - `scripts/seed.ts`, `scripts/reset.ts`, `scripts/import/**` e `scripts/db/restaurar.mjs`;
   - migration antiga alterada;
   - `scripts/smoke/linha-de-base.json` com número que SUBIU;
   - `.github/workflows/**`;
   - mudança de dependência no `package-lock.json`.
4. Abra `docs/f66-evidencias/`: a prova conta a conta (emulada e real, lote a lote, nos dois bancos), a impressão
   antes × depois, os `EXPLAIN` dos índices, o conferidor, e a saída das sabotagens. E `docs/perf/f66-*`, o TTFB e o
   `medir-rls` antes × depois.
5. Confira no `PLANO-MULTIEMPRESA.md` que a **ficha da F66B** está lá, com o censo medido: é dela o próximo prompt.
6. Rode você mesmo `npm run test` uma vez.
7. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A `v1.70.0` está fechada e no ar.** Medido: `origin/main` e a tag `v1.70.0` em `3f7a642`, e o ledger dos dois bancos
   terminando em `colaboradores_nome_chave_pos_deploy`. O `/api/saude` e o estado do CI não foram consultados daqui; o
   pré-voo confere.
2. **O agente aplica no ensaio E em produção, antes do merge**, pelo MCP, em lotes. É o fluxo das F53→F65, não decisão
   nova sua. Sem MCP, é caminho B e PR sem merge.
3. **Uma run, um PR de código e um PR de documentação com a tag**, no molde das F58→F65. Versão `1.71.0` (fase =
   MINOR).
4. **51 policies recebem o recorte, não 54.** `profiles` fica para a F69, que é a fase da leitura cruzada de perfis, e
   `_bkp_relatorios_gerados_f6a` é infra congelada sem a coluna. As três viram exceção nominal. **`membros` e
   `operador_filiais` recebem o recorte já**, embora sejam `k_infra`, porque têm a coluna e não há motivo para alguém
   ler as memberships de outra empresa. O agente pode decidir o contrário, com motivo.
5. **O piso fica exatamente como está** em todas as policies, inclusive nas 6 de unidade (o `e_admin()` de "admin
   reabre" continua). O que sai é só a chamada `pode_escrever_filial(…)`, como a F59 marcou.
6. **A direção B da bateria é provada com o piso neutralizado dentro da transação do roteiro** (só no CI), porque a
   ponte de `papel_atual()` fecha tudo para quem é só da B até a F67. O agente escolhe entre emular a F72 (tirar o piso)
   ou a F67 (a ponte por qualquer membership), com o motivo.
7. **"`isolamento_tenant.sql` verde entre os lotes"** vira, nos bancos vivos, a prova conta a conta real entre os lotes.
   No CI a cadeia roda inteira.
8. **A prova conta a conta que você autorizou vale para leitura E escrita**, no mesmo bloco, só com contagens. Você
   respondeu sobre a escrita; estendi à leitura porque é o mesmo método e a mesma saída.
9. **Os índices só entram se a medição provar**, e o antigo só cai se nenhum consumidor sem o predicado depender dele. É
   a mesma régua da sua decisão 1 na F65 ("índice sem consulta que o use é custo sem prova"). Isso pode resultar em
   menos índices que a lista da ficha, ou em um que ela não lista (`movimentacoes_data_ordem_idx`, o mais usado).
10. **A régua de 15% do TTFB é contra a linha de base do MESMO dia**, não contra o número da F59: a própria F59 escreveu
    isso (decisão 8), e o ruído entre dias chegou a 18%. Se a regressão for real e sem conserto na run, o agente desfaz
    o lote ou o índice culpado em produção e deixa o PR sem merge.
11. **O rollback num banco vivo roda pelo `execute_sql`**, com o conteúdo exato de `supabase/rollback/F66-desfaz.sql`
    que o CI ensaiou. É a única escrita fora do `apply_migration`, e só num desfecho ruim.
12. **Nenhum código que o app executa muda.** Se o agente achar que precisa mudar, é sinal de que a fase saiu do
    escopo: ele registra e deixa para a F67.

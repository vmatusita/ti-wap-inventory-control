# F67C — O fim do default (a escrita informa a empresa)

Ordem de serviço da fase **F67C** do `PLANO-MULTIEMPRESA.md` (§7). É a terceira e última das fases em que a decisão
12/11-2 do Johnny dividiu a F67 original:
- **F67** (no ar, v1.73.0): o cargo por empresa, as `security definer`, as destrutivas, a mesa e a trava do termo;
- **F67B** (no ar, v1.74.0): os dois buckets do Storage e o canal de tempo real;
- **F67C** (esta): o fim do default `empresa_legada()`.

A ficha F67C foi escrita pela F67 (13/11/2026) e recebeu a nota da F67B. Esta ordem a executa com os números medidos
hoje e corrige quatro pontos em que a ficha ficou para trás (fatos 11, 12, 19 e 26).

Hoje, as 20 tabelas de negócio têm `empresa_id uuid not null default public.empresa_legada()`. Toda linha que alguém
cria sem dizer a empresa nasce **da WAP por omissão**. Com uma empresa só, isso é invisível. Com duas, é o defeito mais
silencioso possível:
- uma movimentação registrada numa filial da B, por um caminho que esqueceu a empresa, recebe a WAP e é recusada pela
  FK composta (`23503`) — o erro aparece, mas a causa não;
- um item, um motivo, um tipo, um colaborador sem filial ou uma linha da trilha de Auditoria criados por alguém da B
  nascem da WAP **sem erro nenhum**, porque não têm pai que os confira;
- e o compilador não ajuda: no `database.ts`, `empresa_id` é opcional no `Insert` das 20.

Esta fase faz toda escrita dizer a empresa, e só então tira o default.

Ela entrega:
- **as 18 funções SQL** que inserem numa das 20 sem a coluna passam a gravar a empresa **do pai** (a filial, o ativo, a
  movimentação), com a MESMA assinatura — a troca de corpo é atômica;
- **os 17 pontos de INSERT do app** passam a mandar a empresa: a da filial quando a operação tem filial; a da operação
  quando não tem (até a F70 trazer a da sessão). A trilha de Auditoria (`registrarEventoAdmin`, 15 chamadas) grava a
  empresa ALVO;
- **o tipo como trava**: `empresa_id` obrigatório no `Insert` das 20. Um INSERT sem empresa deixa de compilar;
- **os 16 INSERTs dos scripts**, o `restaurar.mjs` (um backup de antes da F63 restaura com a empresa preenchida) e os
  **705 INSERTs dos roteiros** do CI, que hoje dependem do default;
- **os quatro leitores por chave natural** da nota F65, a começar pelo `update motivos … .eq('codigo')`, que com duas
  empresas gravaria nas DUAS;
- **o `drop default` nas 20**, por lote, só depois do deploy do app que manda a empresa; as travas 15b/15e invertidas
  (passam a EXIGIR a ausência) e uma trava derivada (nenhuma `empresa_id` de `public` com default, inclusive em tabela
  futura);
- **a ficha F67C reescrita** com o escopo real.

Três condições não se negociam:
- **Nada muda para a WAP.** Toda linha que nascer depois desta fase nasce com a empresa da WAP, como hoje (0 linhas fora
  da legada nas 20, antes e depois). Nenhuma policy muda (md5 byte a byte). O smoke, o conferidor e as 13 checagens de
  integridade ficam iguais (com os números do #84 travados).
- **Zero janela.** Em nenhum momento o app no ar faz um INSERT que o banco passou a recusar. O default só sai depois do
  deploy do app que manda a empresa e de uma janela medida por FORMA de INSERT em `pg_stat_statements`. As funções trocam
  de corpo sem trocar de assinatura.
- **Nenhum dado muda.** Toda linha já tem a empresa (o default preencheu). Esta fase troca corpos de função, tira
  defaults, muda o app, os scripts e os roteiros. Ela não faz `update`, `delete` nem backfill em banco vivo.

**As decisões do Johnny.**

De 16/11/2026, na conversa que gerou esta ordem:
1. **(16/11-3) Uma run, em lotes por família.** A pergunta foi se a F67C, com 18 funções, 33 pontos de INSERT no app e
   nos scripts, 705 INSERTs em 35 roteiros e os quatro leitores, rodava inteira ou se dividia em duas fases (o acervo
   numa, o resto noutra). A escolha: **uma run**, em lotes — **acervo (8) → vocabulário e registros (11) → `filiais`** —,
   cada lote com os escritores antes e o `drop default` por último, depois do deploy. Um PR de código e um PR de
   documentação com a tag `v1.75.0`, no molde F60/F67B.
2. **(16/11-4) O seed com duas empresas fica no backlog.** O `scripts/seed.ts` passa a dizer a empresa fictícia de hoje
   em todo INSERT (e o `onConflict` do upsert de colaboradores, que é o MESMO comando, passa a `'empresa_id,nome_chave'`),
   e só. As duas empresas fictícias, as seis tabelas sem fixture e o `seed.test.ts` continuam no backlog PATCH (decisão 3
   da F65). Regra 1 do `CLAUDE.md`.

Herdadas, e aplicadas a esta fase por coerência (estão nas suposições do guia):
- **(12/11-2)** a divisão F67 / F67B / F67C;
- **(13/11-1) "dev sou só eu"**: o cargo dev é só do Johnny, e a plataforma é ele;
- **(13/11-2) expandir e contrair, zero janela**: aqui, aplicada ao DEFAULT — os escritores passam a dizer a empresa
  (expansão) e o default sai depois do deploy e da janela (contração);
- **(13/11-3) o #84 travado**: os números das 13 checagens são remedidos no começo e não podem subir;
- **F67, decisão 1**: a trilha grava a empresa ALVO; **F67, regra da empresa**: a da FILIAL quando a operação tem filial,
  senão a da operação (`empresaDaOperacao()`, a legada explícita até a F70).

---

## Estado de partida: os 32 fatos medidos (16/11/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje no disco e no git, e **nos dois bancos** pelo conector da
> Supabase, só leitura: contagens, nomes e textos de esquema, configurações. Nenhum valor de linha. Divergência da ficha
> está marcada com ⚠. **Remeça tudo antes de aceitar.**

**Onde o projeto parou**

1. `origin/main` em **`bdf3e23`** (merge do PR #98, o pós-deploy da F67B); a tag anotada **`v1.74.0`** é a da F67B.
   `package.json` em `1.74.0`; árvore limpa.
   - Última migration: **`0199_contracao_backups_por_empresa.sql`**, aplicada nos dois bancos (o ledger do ensaio termina
     em `contracao_backups_por_empresa`; produção tem as 117 funções e as 70 `security definer` que o relatório da F67B
     diz). **A primeira desta fase é a `0200`.**
   - Versão: **`1.75.0`** (fase = MINOR, regra 8).
   - Checks obrigatórios da `main`: **`verificar`** e **`banco-sem-docker`**.
   - Produção `pbtjcalbmepmrqzprusb` (PG 17.6), ensaio `sgmvldiizsrjbxzzpmhh`.
   - Produção hoje: **1** empresa, **14** memberships ativas.
2. **A rede de hoje** (`RELATORIO-F67B.md` §3 e §8):
   - mesa: 274 arquivos com 8.775 casos;
   - CI: 63 roteiros com 1.299 asserções e 0 ✗;
   - injetor em **184/184**, quarentena 2;
   - smoke: *"109 OK · 1 aviso · 0 falha"*;
   - conferidor de formas: 272 pontos, 0 recusadas;
   - gate de tipos: 105 = 105;
   - 117 funções em `public`, 70 `security definer` (39 executáveis por `authenticated`); o universo de
     `definer_sem_tenant.sql` tem 27; 62 policies (8 em `storage.objects`).
3. **O mapa do `CLAUDE.md`**: os diretórios de topo de `src/lib` e `src/components` e os 14 `CLAUDE.md` aninhados.
   Remeça no começo (é a regra do `CLAUDE.md`). Esta fase não deveria criar diretório de topo.
4. **As 13 checagens, hoje** (pelo `checagens_integridade_nucleo()`, só contagem):
   - produção: `arquivo_termo_orfao` **3**, `backup_orfao` **12**, `conflito_entre_filiais` **59**,
     `detentor_em_estado_sem_dono` **1**, as outras nove em 0;
   - ensaio: `operador_sem_filial` **1**, as outras doze em 0.

   A linha de base (`scripts/smoke/linha-de-base.json`, de 10/09) ainda diz `backup_orfao` 10, `conflito_entre_filiais`
   69 e `detentor_em_estado_sem_dono` 0: a Parte B está vermelha desde 19/10 pelos dois achados do #84. **A F67C não toca
   nenhuma checagem diretamente**, mas recria as funções que gravam movimentações, lançamentos e pendências — e três
   checagens (`detentor_em_estado_sem_dono`, `pendencia_de_estornada`, `reserva_aberta`) derivam do que elas gravam.
5. **O conector alcançou os dois bancos hoje.** Ao contrário da F67B (o `28P01` nas cinco primeiras tentativas), o
   `execute_sql` respondeu no ensaio e em produção. O conector do Claude Code da máquina do Johnny é outro: confira na
   primeira hora da run.

**O default e o que o segura**

6. **22 tabelas de `public` têm `empresa_id`; 20 têm o default**, nos dois bancos (20 = 20), todas `not null`, o default
   sendo SÓ a chamada de `public.empresa_legada()` (pelo `pg_depend`):
   - lote 1 (`k_lote1`, F63): `anotacoes`, `ativos`, `colaboradores`, `itens`, `lancamentos_item`, `movimentacoes`,
     `pendencias_item`, `termos_gerados`;
   - lote 2 (`k_lote2`, F64): `eventos_admin`, `import_logs`, `import_prefixos_patrimonio`, `import_termos_categoria`,
     `import_termos_estado`, `kits_modelos`, `motivos`, `relatorios_gerados`, `senhas_acesso`, `tipos_item`,
     `unidades_apelidos`;
   - e `filiais` (F62, `0155`).

   `membros` e `operador_filiais` têm a coluna SEM default (F62). Linhas fora da legada: 0 em `ativos`, `movimentacoes`,
   `eventos_admin` e `filiais` (remeça nas 20).
7. **As travas que hoje EXIGEM o default** (`supabase/tests/catalogo_policies.sql`, bloco 5):
   - **15b**: as oito do lote 1 com a coluna visível, `uuid`, `not null`, FK validada e **default `empresa_legada()`**;
   - **15e**: o mesmo para as onze do lote 2;
   - **15c**: derivada do catálogo — toda tabela de `k_negocio` que TEM a coluna obedece à mesma forma (é ela que cobre
     `filiais`).

   Os comentários dizem "a F67 inverte". Desde a divisão 12/11-2, é a F67C. A ficha manda inverter **no MESMO commit**
   que tira o default.
8. **O que já confere a empresa de uma linha** (por isso o default nunca foi a única rede):
   - as **FKs compostas** (`0166`, `0167`): `(empresa_id, filial_id) → filiais`, `(empresa_id, ativo_id) → ativos`,
     `(empresa_id, movimentacao_id) → movimentacoes`, `(empresa_id, colaborador_id)`, `(empresa_id, item_id)`,
     `(empresa_id, tipo_id)` etc.;
   - **`guarda_empresa`** (`0173`): a empresa de um registro não muda, nas 20, sem exceção;
   - os gatilhos que LEEM `new.empresa_id` no INSERT: `termo_da_empresa` (`0173`), `termo_exige_modelo_da_empresa`
     (`0192`, só a WAP emite termo) e `kit_motivo_da_empresa` (`0164`).

   Sem o default: o escritor que **omite** a empresa leva `23502` (not null); o que manda a **errada**, `23503` (FK
   composta) — ou, numa tabela sem pai, passa calado. É por isso que a fonte da empresa de cada escritor (decisão 1) é o
   coração da fase.
9. **Os pais de cada tabela** (catálogo):
   - com `filial_id not null`: `ativos`, `movimentacoes`, `lancamentos_item`, `pendencias_item`, `import_logs`,
     `unidades_apelidos`;
   - com `filial_id` **nulo** permitido: `colaboradores` (o colaborador sem filial) e `relatorios_gerados` (o
     consolidado);
   - `anotacoes` → `ativo_id`; `termos_gerados` → `ativo_ids uuid[]` (FK não alcança array; quem confere é
     `termo_da_empresa`);
   - **sem pai**: `itens`, `tipos_item`, `motivos`, `kits_modelos`, `import_prefixos_patrimonio`,
     `import_termos_categoria`, `import_termos_estado`, `eventos_admin`, `senhas_acesso` e `filiais`.
10. **`drop default` e `set default` são metadado**: não reescrevem tupla nem varrem a tabela, mas tomam `ACCESS
    EXCLUSIVE` por instantes (confirme na doc do PG 17, regra 6). Com `lock_timeout = '2s'`, o risco é o lock não vir,
    não o app travar. **A reversão é tão barata quanto a ida**: `alter column empresa_id set default
    public.empresa_legada()`.

**Os escritores SQL**

11. **⚠ 18 funções inserem numa das 20 sem `empresa_id` na lista de colunas** (corpo VIGENTE em produção, `prosrc`; nenhum
    INSERT sem lista de colunas):

    | tabela | funções |
    |---|---|
    | `anotacoes` | `confirmar_assinatura_lote_com_anotacoes`, `confirmar_assinatura_termo_com_anotacao`, `corrigir_patrimonio_com_anotacao`, `definir_service_tag_com_anotacao`, `desfazer_confirmacao_termo_com_anotacao` |
    | `ativos` | `criar_compra_lote`, `devolver_ao_fornecedor`, `import_criar_ativos` |
    | `movimentacoes` (7 INSERTs) | as duas primeiras acima, `criar_movimentacao_com_itens`, `estornar_movimentacao_com_itens`, `import_lancar_movimentacoes` |
    | `lancamentos_item` (11 INSERTs) | `criar_movimentacao_com_itens`, `estornar_movimentacao_com_itens`, `lancar_itens_lote`, `reabrir_pendencias_item_com_estornos`, `resolver_pendencias_item_com_lancamentos`, `transferir_item` |
    | `pendencias_item` | `movimentacao_abrir_pendencias_item` |
    | `import_logs` | `import_gravar_trilha` |
    | `eventos_admin` | **`registrar_limpeza_termos_sem_linha`** |

    É o orçamento do `PLAN-F63.md` §2 (16) menos `forcar_estado_ativo`/`forcar_saldo_item` (que a F67 já fez gravar a
    empresa), mais `import_gravar_trilha` (F64) e **mais `registrar_limpeza_termos_sem_linha`, que a F67B criou (`0196`) e
    que a ficha não conhece**. As que JÁ gravam explícito: as oito destrutivas e a mesa (`eventos_admin`, desde a F67) e
    as duas `forcar_*`.
12. **⚠ `registrar_limpeza_termos_sem_linha` não tem de onde tirar a empresa.** É a trilha da ferramenta de órfão da
    F67B: um `.docx` sem linha não tem empresa (decisão 9 da F67B), e a trilha nasce hoje do default. Decida (decisão 3).
13. **O import de outra empresa é desta fase.** O `PLAN-F67.md` (decisão 10) diz: *"O que a RPC grava continua pelo
    default (F67C) — com outra empresa, a FK composta recusaria o `ativos` criado (23503): o import de uma empresa que não
    seja a WAP é da F67C"*. As três funções internas do import (`import_criar_ativos`, `import_lancar_movimentacoes`,
    `import_gravar_trilha`) são chamadas por `importar_ativos_substituir(p_empresa, …)`, que já confere que a filial é de
    `p_empresa`.
14. **`pg_stat_statements.track = 'top'`** em produção. O INSERT de dentro de uma função não aparece lá — só a chamada.
    Consequência boa: **as 18 funções não precisam de janela**. Trocar o corpo com `create or replace`, sem mudar a
    assinatura, é atômico: o app velho e o novo chamam a mesma função, e ela passa a gravar a empresa explícita.
15. **Duas constantes de CI acompanham os corpos** (o molde da F67): o **L4** de `supabase/tests/integridade_tenant.sql`
    (md5 de toda função de `public` fora das recriadas nominalmente) e `k_escritores` de
    `supabase/tests/empresa_no_vocabulario.sql` (md5 do `prosrc` dos escritores de `eventos_admin`). Cada função recriada
    entra na exclusão nominal do L4, e os md5 de `k_escritores` passam aos corpos novos, declarados.

**Os escritores do app e dos scripts**

16. **⚠ 17 pontos de INSERT/UPSERT em `src/**`** numa das 20 (fora de teste). **Nenhum envia `empresa_id` hoje.** (Na
    conversa com o Johnny eu disse 18: são 17.)

    | arquivo:linha | tabela | o pai |
    |---|---|---|
    | `actions/admin.ts:614` | `filiais` | — |
    | `actions/admin.ts:737` | `motivos` (`.insert(parsed.data)`) | — |
    | `actions/ativos.ts:133` | `anotacoes` | o ativo |
    | `actions/pendencias.ts:442` | `anotacoes` | o ativo |
    | `actions/colaboradores.ts:166`, `:197` | `colaboradores` | a filial (ou nenhuma) |
    | `actions/colaboradores.ts:305` | `colaboradores` (`upsert`, `onConflict: 'empresa_id,nome_chave'`) | a filial |
    | `actions/itens.ts:448` | `lancamentos_item` (o estorno) | a filial |
    | `actions/itens.ts:571`, `:710` | `itens` | — |
    | `actions/kits.ts:69` | `kits_modelos` | — |
    | `actions/relatorios.ts:150` | `relatorios_gerados` | a filial (ou o consolidado) |
    | `actions/senhas.ts:170` | `senhas_acesso` | — |
    | `actions/tipos-item.ts:103` | `tipos_item` | — |
    | `actions/unidades-apelidos.ts:62` | `unidades_apelidos` | a filial |
    | `auditoria-registro.ts:30` | `eventos_admin` (service role) | — (a empresa ALVO) |
    | `termos/persistir.ts:121` | `termos_gerados` | os ativos do termo |

    O comentário de `colaboradores.ts:299`–`303` diz, com todas as letras: *"A `empresa_id` também não é enviada: nasce do
    default."* A ficha ainda cita `termos.ts:532`: o INSERT do termo mudou para `src/lib/termos/persistir.ts` na F67B.
17. **⚠ `registrarEventoAdmin` engole a falha.** `src/lib/auditoria-registro.ts` grava com o client administrativo e,
    se o INSERT falha, **não propaga**: só `registrarFalha` (decisão consciente da F21 — a ação já aconteceu). São **15
    chamadas** (`admin.ts` 5, `dev.ts` 3, `importar.ts` 3, `senhas.ts` 2, `unidades-apelidos.ts` 2). Se a empresa faltar
    depois do `drop default`, **a trilha de Auditoria para de ser gravada sem ninguém ver na tela**. É o pior modo de falha
    desta fase, e é por isso que o tipo (fato 19) e a vigília depois do drop (decisão 13) existem.
18. **`persistirTermo`** (`src/lib/termos/persistir.ts`): desde a F67B, a linha nasce ANTES do upload, e é ela que decide
    o bucket. A nota F67B da ficha diz: quando o default sair, `persistirTermo` passa a empresa de quem gera, **a dos
    ativos do termo**; `storage_por_empresa.sql` (bloco T) já prova o bucket por empresa com linhas plantadas nas duas. O
    gatilho `termo_exige_modelo_da_empresa` recusa a emissão para empresa sem modelo (só a WAP tem).
19. **⚠ O compilador hoje não obriga ninguém a mandar a empresa.** `src/lib/types/database.ts` tem **43** ocorrências de
    `empresa_id?: string` (os `Insert`/`Update` das 20, o hand-fix da F63/F64) e o gate `db:types:diff` compara CONJUNTO
    (relações, colunas, funções), não opcionalidade (`scripts/db/diff-tipos.mjs`). Tornar `empresa_id: string`
    **obrigatório no `Insert`** das 20 transforma o `npm run typecheck` na trava do app — mas nada impede uma regeneração
    futura de reintroduzir o `?` sem que ninguém perceba (decisão 4).
20. **16 INSERTs nos scripts**, que o compilador não pega (os scripts usam o client **sem** o generic `Database` — o
    comentário de `scripts/smoke/fixtures-passe2.ts:38` diz por quê):
    - `scripts/seed.ts` (9): `ativos` `:704`/`:804`, `movimentacoes` `:757`/`:809`, `colaboradores` upsert `:885` (com
      `onConflict: 'nome_chave'`, que já não infere índice nenhum desde a `0174`), `itens` `:920`, `lancamentos_item`
      `:1047`, `anotacoes` `:1093`, `eventos_admin` `:1525`;
    - `scripts/import/carga.ts` (4): `ativos` `:314`, `movimentacoes` `:362`, `itens` `:468`, `lancamentos_item` `:520`
      (a carga do go-live, com guardas anti-produção — `scripts/import/CLAUDE.md`);
    - `scripts/manutencao/gerar-errata-truncamento.ts:229` (`relatorios_gerados`), `scripts/smoke/fixtures-passe2.ts:82`
      (`itens`), `scripts/smoke/persona.ts:80` (`eventos_admin`).

    O `PLAN-F67.md` §2 dá destino F67C ao `EMPRESA_LEGADA_ID` de `seed.ts` (4), `smoke/persona.ts` (4),
    `design/previa-ficha-dados.ts` (2) e `manutencao/gerar-errata-truncamento.ts` (2). Os de `scripts/perf/**` são
    leitura e ficam.
21. **`scripts/db/restaurar.mjs`** monta o INSERT pelas CHAVES do backup (`sqlDeInsercao`, `:270`–`278`): coluna que o
    JSON não traz fica fora da lista, e o default a preenche. **Um backup de antes da F63 não tem a chave `empresa_id`**:
    depois do drop, `23502`. Cuidado com o caso misto: se uma linha do backup tem a chave e outra não, a lista de colunas
    a inclui e a linha sem ela vai com `null` EXPLÍCITO (`literal(l[c] ?? null)`), o que já falha hoje, com ou sem
    default. O roteiro é `supabase/tests/restauracao.sql` (F54).
22. **`empresaDaFilial`** (`src/lib/escopo/empresa-da-filial.ts`, a RPC `empresa_da_filial` da `0185`) é a ponte da F67:
    usada hoje em `dev-destrutivo.ts` (3) e `importar.ts` (1). Custa uma ida ao banco por chamada.
23. **A régua "ninguém lê `empresa_id`"** (F63/F64, decisão 7 dos dois planos) continua de pé, em três lugares:
    - mesa, `src/lib/validators/empresa-acervo-sem-leitura.test.ts`: (1) nenhuma cadeia `.from('<uma das 19>')…` cita
      `empresa_id`; (2) a **catraca do literal** `empresa_id` em `src/**`, por TRECHO desde o `.from(` (hoje: as leituras
      de `membros`/`operador_filiais`, o filtro do Realtime, `gerados.ts`, o `onConflict` de `colaboradores.ts` e
      `unidadesDaMesmaEmpresa`); (3) o corpo vigente das funções no disco;
    - catálogo, `catalogo_policies.sql` 15g–15i, com as exceções nominais `k_leitura_tenant` (`função:tabelas`). As
      `forcar_*` estão lá porque **escrever a coluna conta como citá-la**.

    Com a F67C, cada INSERT passa a citar a coluna: dezenas de trechos novos no app e 18 funções novas no disco. **A
    régua tem de mudar de natureza** (decisão 6): escrever passa a ser OBRIGATÓRIO; ler para recortar continua nominal.
24. **A catraca da legada** (`src/lib/auth/empresa-legada-catraca.test.ts`) conta `EMPRESA_LEGADA_ID` e
    `empresaDaOperacao()` em 9 arquivos de `src/**`, cada um com destino (F69/F70). Todo escritor sem pai que passar a
    usar `empresaDaOperacao()` entra nela, com o destino escrito.

**Os leitores por chave natural (nota F65 (a)–(d), na ficha F67C)**

25. Com os uniques por empresa (F65), uma chave natural deixa de ser única no SISTEMA. Com a RLS da F66, só quem é membro
    de mais de uma empresa (a plataforma, isto é, o Johnny) enxerga as duas — mas é exatamente quem administra:
    - **(a)** `resolverFilialPorSlug` (`queries/relatorios/comum.ts:36`, `.eq('slug')` + `maybeSingle`, que LANÇA com
      duas linhas); `actions/tipos-item.ts:67` (`.eq('slug')`); `actions/itens.ts:656` e `actions/colaboradores.ts:116`
      (`.eq('nome_chave')`), `colaboradores.ts:268` (`.in('nome_chave')`), `queries/colaboradores.ts:388`;
    - **(b)** `actions/admin.ts:765`: `update motivos … .eq('codigo', codigo)` — a PK de `motivos` é
      `(empresa_id, codigo)` desde a `0168`: **com duas empresas, grava nas DUAS**. O mais grave;
    - **(c)** `lerVocabularioImport` (`src/lib/queries/vocabulario-import`, chamado em `importar.ts:410`, `:538`, `:961`)
      e a RPC do import leem termo e prefixo sozinhos: o vocabulário da B entraria no import da A;
    - **(d)** `actions/relatorios.ts:138`, `lerUltimaVersao` + `max(versao)+1` sem empresa: a versão do consolidado da A
      contaria as da B.

**Os roteiros**

26. **⚠ 705 INSERTs sem `empresa_id` em 35 roteiros** (de 860 nas 20, em 64 arquivos de `supabase/tests/`): 624 no lote
    1, 59 no lote 2, 22 em `filiais`. Os 155 que já trazem a coluna são as fixtures de duas empresas. Os maiores:
    `dev_destrutivo` 72, `f34_triagem_reserva` 48, `papeis_rls` 41, `asof_desempate` 35, `manutencao_fornecedor` 33,
    `transicoes_extra` 33, `pendencias_item` 30, `f36_detentor` 29, `f37_colaboradores_tipos` 29, `maquina_estados` 28.
    A ficha diz "27 roteiros com 569 INSERTs" (F63) e "38 em ~15 roteiros, mais 22 em `filiais` em 10" (F64): os
    roteiros cresceram desde então. **Com o default fora, cada um dá `23502` no CI** — o CI aplica a cadeia inteira,
    contração incluída, do zero.

**A janela, a vigília e a prova**

27. **`pg_stat_statements` em produção**: `track = top`, `max = 5000`, `save = on`, último reset em 09/07/2026. O INSERT
    de topo (o do PostgREST) guarda **a lista de colunas no texto normalizado** — e o PostgREST monta essa lista a partir
    das chaves do payload (confirme na documentação, regra 6). Hoje, por tabela, há dezenas de FORMAS sem `empresa_id`
    (`movimentacoes` 61, `ativos` 52, `lancamentos_item` 27, `eventos_admin` 25, `itens` 19, `import_logs` 16…), dos
    papéis `authenticated`, `service_role` e `postgres` (migrations e scripts). **É o instrumento da janela**: depois do
    deploy, nenhuma chamada NOVA numa forma sem `empresa_id`, por papel de app.
28. **⚠ A Skew Protection da Vercel não foi medida.** Projeto `prj_sUTqyUqhj7ZwGv8h5CAXMnpbU3fb` (time
    `team_3IrMo5TwpVmaniEKb3B0jbcs`). Se estiver ligada, uma aba aberta antes do deploy pode chamar a Server Action do
    deployment VELHO por um tempo, e esse código ainda omite a empresa. Meça (decisão 12).
29. **O erro depois do drop é ruidoso nos logs, e carrega dado real.** `23502 null value in column "empresa_id" … violates
    not-null constraint`, com um `DETAIL: Failing row contains (…)` que traz **os valores da linha**. Nos logs do Postgres
    (Supabase) e nos da Vercel. **Só se CONTA, nunca se imprime.**
30. **Ninguém escreve em produção para provar.** As regras das fases recentes proíbem escrita fora do `apply_migration`
    e do rollback autorizado, e um bloco que escreve e termina em `raise` em produção ainda avança sequências
    (`movimentacoes.ordem` é `identity`). A prova viva da escrita é: o tipo, as varreduras, o CI (com o default fora), o
    ensaio, a janela por forma, a vigília depois do drop — e as operações do dia a dia do Johnny depois do deploy.

**O método**

31. **O método** (ADR-003 + `RUNBOOK-BANCO.md`):
    - `apply_migration` do MCP é UMA transação; o CI (`psql -f` sem `-1`) não é;
    - cabeçalho `-- classe:` validado por `scripts/db/classificar-migration.mjs`; `db:lock` no mesmo commit; entrada em
      `DA_F38` e em `RECRIACOES_AUTORIZADAS` (`src/lib/itens/migrations-f38.test.ts`) para toda função recriada, com o diff
      contra o corpo vivo no cabeçalho;
    - nome-sem-prefixo que não repete; `set lock_timeout = '2s'`/`reset`, sem `begin`/`commit`; a seção "`security
      definer` — três exigências";
    - **proibidos**: `supabase db push`, `migration repair`, `db reset --linked`, reescrever `schema_migrations`;
    - a MATRIZ vai até **R-ACC-136**, então o próximo é o **R-ACC-137**. O `ADR-002` vai até o §18, então o próximo é o
      **§19**. O RUNBOOK tem até o **Anexo F67B**;
    - rollbacks encadeados até `supabase/rollback/F67B-desfaz.sql`, ensaiado por `supabase/tests/f67b_rollback.sql`;
    - os bloqueios das fases recentes: o conector ligado a OUTRA conta (F66B); as ferramentas do MCP amanhecendo
      desligadas (F60, F63, F64); o classificador barrando o apply do ensaio (F65); o `28P01` do ensaio (F67B).
32. **⚠ Uma linha da ficha F67B ficou velha.** O "Pronto quando — o estado" dela ainda diz *"Falta o apply (ensaio →
    produção)"*, e o cabeçalho e o `RELATORIO-F67B.md` dizem que está no ar desde 16/11. Corrija ao reescrever a F67C (é o
    mesmo arquivo; uma linha, declarada).

As regras do `CLAUDE.md` que pesam aqui: **1, 2, 3, 5, 6, 7 e 8**. A regra 6 pede a documentação oficial:
- **PG 17**: `ALTER TABLE … ALTER COLUMN … DROP DEFAULT`/`SET DEFAULT` (nível de lock, sem reescrita), `pg_stat_statements`
  (`track`, normalização, quando um statement é registrado), `CREATE OR REPLACE FUNCTION` (mesma assinatura preserva ACL
  e dependências);
- **PostgREST/supabase-js**: como o INSERT/UPSERT monta a lista de colunas a partir do payload; o tipo `Insert` gerado
  (coluna `not null` sem default = obrigatória);
- **Vercel**: Skew Protection (o que faz com Server Actions e por quanto tempo o deployment velho atende).

---

## As frentes, e por que nesta ordem

- **A, o censo e o "antes".** Os 32 fatos remedidos; o `PLAN-F67C.md`; as tabelas-verdade dos escritores (tabela ×
  escritor × fonte da empresa × lote × prova), dos leitores (a)–(d) e das travas; e o "antes" nos dois bancos, inclusive
  as formas de INSERT em `pg_stat_statements`.
- **B, as travas, vermelhas.** A regra 4 da §4 do plano: trava antes da correção.
- **C, o banco.** A EXPANSÃO por lote (as funções recriadas, com a mesma assinatura). A CONTRAÇÃO (o `drop default`) em
  arquivos separados, por lote, aplicada em produção só depois do deploy.
- **D, o app.** O tipo, os 17 escritores, a trilha, os leitores (a)–(d), a catraca.
- **E, os scripts, os roteiros, o rollback e o injetor.** Os 705 INSERTs são o grosso do volume e a parte que mais
  ganha com paralelismo — e a que mais precisa de revisão, porque é onde uma edição mecânica pode mudar o que um teste
  prova.
- **F, os documentos**, inclusive a ficha F67C reescrita.
- **G, o fechamento, com ordem rígida.** Versão → revisão adversarial → SHA congelado → CI verde → no ensaio: expansão,
  provas, contração, provas → em produção: expansão e provas → merge → deploy → conferência → a janela por forma → a
  contração em produção, lote a lote, com a vigília → Parte B → relatório → PR de documentação → tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F67C do `docs/PLANO-MULTIEMPRESA.md` (§7): o fim do default `public.empresa_legada()`. Ao terminar:
- nenhuma das 20 colunas `empresa_id` de `k_negocio` tem default, nos dois bancos. As travas 15b e 15e de
  `catalogo_policies.sql` EXIGEM a ausência, e uma trava derivada do catálogo reprova qualquer `empresa_id` de `public`
  com default, inclusive em tabela futura;
- as 18 funções SQL do fato 11 gravam a empresa EXPLÍCITA, tirada do pai (a filial, o ativo, a movimentação), com a MESMA
  assinatura (a exceção possível é a decisão 3). A varredura de INSERT sem `empresa_id` nas 20 dá zero no corpo vigente
  (disco e catálogo);
- os 17 escritores do app mandam a empresa: a da filial quando a operação tem filial; a da operação
  (`empresaDaOperacao()`) quando não tem. O colaborador criado dentro de uma movimentação nasce na empresa da FILIAL dela;
  o termo, na dos ATIVOS. `registrarEventoAdmin` exige a empresa ALVO nas 15 chamadas. `empresa_id` é OBRIGATÓRIO no
  `Insert` das 20 em `database.ts`, e uma trava de mesa reprova a volta do `?`;
- os scripts (`seed.ts`, `carga.ts`, `persona.ts`, `fixtures-passe2.ts`, `gerar-errata-truncamento.ts`) mandam a empresa;
  `restaurar.mjs` restaura um backup de antes da F63 com a empresa preenchida;
- os 705 INSERTs dos roteiros dizem a empresa, e nenhuma asserção mudou;
- os quatro leitores por chave natural (nota F65 (a)–(d)) recortam pela empresa de quem escreve. O `update motivos` não
  alcança outra empresa;
- a régua "ninguém lê `empresa_id`" virou "toda escrita escreve a empresa; ler para recortar continua nominal", sem
  afrouxar a parte da leitura;
- a escrita de uma empresa que não é a WAP funciona no CI (cada uma das 18 funções, os escritores do app, o import) e
  nasce com a empresa certa;
- **zero janela**: o default saiu de produção só depois do deploy e de uma janela sem chamada nova em forma de INSERT sem
  `empresa_id`, e uma vigília depois do drop contou zero `23502` em `empresa_id`;
- **nada mudou para a WAP**: 0 linhas fora da legada nas 20, antes e depois; todas as policies byte a byte; o smoke, o
  conferidor e as 13 checagens (com o #84 travado) iguais;
- a ficha F67C do plano está reescrita com o escopo real e os números medidos.

Uma run, em lotes por família (decisão 16/11-3), um PR de código (com a expansão e a contração em arquivos separados) e
um PR de documentação com a tag. Versão `1.75.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1, §3 e §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 8, migration
    nunca se edita; a 10, a ORDEM de rollback);
  - a ficha **F67C** inteira no §7. Ela é a FONTE DA VERDADE do que entra, exceto onde esta ordem declara divergência
    medida (fatos 11, 12, 16, 19 e 26) e onde as decisões 16/11-3 e 16/11-4 do Johnny a mudam;
  - as fichas **F67** e **F67B** (o que já foi feito e as notas que mandaram para cá) e as fichas **F68**, **F69**,
    **F70**, **F71** e **F72**, para saber o que NÃO antecipar.
- `docs/prompts/F67C-fim-do-default-ultracode.md`: o cabeçalho, com os **32 fatos medidos** e as decisões do Johnny.
  Este prompt os cita pelo número.
- `CLAUDE.md`, `AGENTS.md`, e os aninhados `supabase/CLAUDE.md`, `scripts/db/CLAUDE.md`, `scripts/import/CLAUDE.md`,
  `src/lib/auth/CLAUDE.md`, `src/lib/itens/CLAUDE.md`, `src/lib/colaboradores/CLAUDE.md` e `src/lib/termos/CLAUDE.md`. As
  regras permanentes 1, 2, 3, 5, 6, 7 e 8.
- **Os moldes:**
  - a **F67B** (`docs/PLAN-F67B.md`, `docs/RELATORIO-F67B.md`, `docs/f67b-evidencias/`): a expansão e a contração, a
    janela, a contração em produção depois do deploy, o relatório;
  - a **F67** (`docs/PLAN-F67.md` §2 e as decisões 10, 13 e 18): a tabela-verdade, `empresaDaFilial`/`empresaDaOperacao`,
    a catraca, as `forcar_*` gravando a empresa explícita, o L4 e `k_escritores`;
  - a **F63** e a **F64** (`docs/PLAN-F63.md` §2, `docs/PLAN-F64.md` §2): o orçamento, os lotes, 15b/15e, a régua
    "ninguém lê";
  - a **F65** (`docs/PLAN-F65.md`): as FKs compostas, `guarda_empresa`, as notas (a)–(d);
  - a **F66B** (`docs/RELATORIO-F66B.md`, Anexo F66B): DDL de metadado com o app no ar, lote a lote, com `lock_timeout`;
  - a **F54** (`docs/RELATORIO-F54.md`): `restaurar.mjs` e `restauracao.sql`.

  Depois, o `RUNBOOK-BANCO.md` inteiro (as seções "`security definer`", "A janela do `drop`", "Rollback", os Anexos F66 a
  F67B), o `ADR-002` §13–18, o `ADR-003`, a `docs/MATRIZ-REGRAS.md`, o `docs/INVENTARIO-LEITURAS.md` e o
  `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e destinos, **nunca o `.env.local`**).
- O código, nesta ordem:
  - as migrations `0152`, `0155`, `0160`–`0174`, `0185`, `0190`–`0192` e `0196`, e o corpo VIGENTE das 18 funções do fato
    11 (`scripts/db/corpo-vigente.mjs`);
  - os roteiros `supabase/tests/catalogo_policies.sql` (blocos 5 e as listas `k_*`), `empresa_no_acervo.sql`,
    `empresa_no_vocabulario.sql`, `integridade_tenant.sql`, `isolamento_tenant.sql`, `imutabilidade_tenant.sql`,
    `restauracao.sql`, `import_substituir.sql`, `f67b_rollback.sql` e `_asserts.sql`;
  - o TS: os 17 pontos do fato 16, `src/lib/auditoria-registro.ts` e as 15 chamadas, `src/lib/types/database.ts`,
    `src/lib/escopo/empresa-da-filial.ts`, `src/lib/auth/empresa-legada.ts` e a catraca,
    `src/lib/validators/empresa-acervo-sem-leitura.test.ts`, os leitores do fato 25,
    `src/lib/supabase/erros-do-banco.ts` (e `erros-do-banco-sql.test.ts`), `src/lib/supabase/superficie-admin.test.ts` e
    `src/lib/itens/migrations-f38.test.ts`;
  - os scripts do fato 20, `scripts/db/{restaurar,classificar-migration,mutacoes,run-mutation-tests,corpo-vigente,
    diff-tipos}.mjs`, `scripts/perf/conta-a-conta.mjs`, `scripts/smoke/{smoke-prod,integridade,alarme}.mjs`,
    `scripts/smoke/linha-de-base.json`, `scripts/formas/conferir.mts` e `.github/workflows/{ci,saude}.yml` (só leitura).

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 32 fatos, no cabeçalho desta ordem. Os de banco foram medidos pelo conector do claude.ai, só contagem e catálogo.
Remeça cada um contra o disco e os dois bancos de hoje antes de agir. Onde a sua medição contrariar o número escrito, **a
sua medição ganha**, desde que vá para o relatório. Os que mais importam:
- **fato 1**: a primeira migration é a `0200`, e a versão é `1.75.0`;
- **fato 4**: as 13 checagens hoje, nos dois bancos, na primeira hora da run. Elas viram a linha travada;
- **fato 5**: o conector alcança os dois bancos? Se não, veja "Bloqueios";
- **fatos 11, 16 e 20**: TODO escritor das 20, sem exceção — SQL vigente (inclusive gatilhos e INSERT dentro de `do`,
  `execute` ou CTE), TS (inclusive `.insert(variavel)`, `.upsert`, client administrativo), scripts, `restaurar.mjs`. Um
  escritor esquecido é `23502` na cara do operador depois do drop — ou, no caso da trilha (fato 17), um buraco calado na
  Auditoria;
- **fato 26**: os INSERTs dos roteiros, por arquivo e por tabela;
- **fato 27**: as formas de INSERT de topo por tabela e por papel, e que o PostgREST põe na lista só as chaves do
  payload (documentação);
- **fato 28**: a Skew Protection.

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
    --alvo=ensaio|producao --saida=docs/f67c-evidencias/…`;
  - a Parte B: `gh workflow run saude.yml -f alvo=producao -f partes=b`.
- O MCP da Supabase: `list_projects`, `execute_sql` (só leitura), `apply_migration`, `list_migrations`, `get_advisors`
  (segurança E performance), `get_logs` e `generate_typescript_types`.

**Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`. **Não rode** `supabase db push`, `migration
repair` nem `db reset --linked`. **Não suba** `next dev`/`next start` contra o ensaio. **Não chame** RPC de escrita,
destrutiva, de conta ou de import em banco vivo — nem dentro de bloco que termina em `raise` em PRODUÇÃO (fato 30).

# Escopo

## Dentro: sete frentes, nesta ordem

### Frente A: o censo e o "antes"
O primeiro entregável é `docs/PLAN-F67C.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`. Ele
contém:
- **Os 32 fatos remedidos**, com cada divergência contra a ficha anotada.
- **A tabela-verdade dos ESCRITORES**, uma linha por (tabela × escritor), sem linha sem destino:
  - o escritor (função SQL, arquivo:linha do app, script, `restaurar.mjs`), o client (sessão, administrativo, service
    role do script) e o papel que aparece em `pg_stat_statements`;
  - **de onde vem a empresa** (decisão 1): o pai (qual), a operação (`empresaDaOperacao()`, destino F70), a ALVO (a
    trilha), ou o parâmetro já conferido (`p_empresa` do import);
  - o lote (decisão 9), a fronteira (expansão: o escritor passa a mandar; contração: o default sai) e a prova (roteiro,
    teste de mesa, tipo, varredura).
- **A tabela-verdade dos LEITORES (a)–(d)**: a consulta de hoje, a nova, de onde vem a empresa, a prova.
- **A tabela-verdade das TRAVAS**: o que cada uma exige hoje e depois (15b, 15c, 15e, 15g–15i, `k_leitura_tenant`, a
  varredura TS, a catraca do literal, a catraca da legada, o L4, `k_escritores`, `migrations-f38.test.ts`).
- **O desenho**, com as decisões 1 a 20 de "Autonomia" tomadas por escrito.
- **A ordem das migrations e a fronteira expansão | contração**, por lote, e **A ORDEM DE ROLLBACK** (o inverso do
  apply), também no rodapé de cada migration.
- **O censo dos roteiros** (fato 26): por arquivo, quantos INSERTs, em que tabelas, com que filial/empresa de fixture, e o
  número de asserções ANTES (é o que tem de ficar igual).
- **O "antes", nos dois bancos**, pelo MCP, só leitura, em `docs/f67c-evidencias/antes/`:
  - o default das 22 colunas `empresa_id` (pelo `pg_depend`) e o `attnotnull`;
  - as linhas fora da legada, por tabela, nas 20 (só contagem);
  - o md5 de `qual`/`with_check` de TODAS as policies (`public` e `storage`) e o md5 do `prosrc` de TODAS as funções de
    `public`, com assinatura;
  - as 13 checagens (os números do #84);
  - as formas de INSERT de topo nas 20 em `pg_stat_statements`: por tabela e por papel, quantas formas e quantas
    chamadas COM e SEM `empresa_id` na lista de colunas. **Só número**: o texto da forma não sai do banco;
  - os advisors de segurança e de performance, contados por nível e nome;
  - a Skew Protection (fato 28), medida ou declarada como não medível.

  Só contagem, nome de objeto de esquema, texto de esquema, configuração e hash.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f67c-evidencias/B-travas/`. Fica vermelha no
PR em rascunho e verde no commit seguinte (o molde das F64 a F67B).
- **15b e 15e invertidas, e a derivada**, em `catalogo_policies.sql`: as oito e as onze SEM default (o resto da forma —
  coluna visível, `uuid`, `not null`, FK validada, sem force — continua exigido); e uma asserção derivada do catálogo:
  nenhuma coluna `empresa_id` de tabela de `public` tem default. Hoje reprova pelos 20 nomes.
- **A varredura SQL de escrita**, nas duas metades:
  - mesa, sobre o corpo vigente no disco (`corpo-vigente.mjs`): todo INSERT em uma das 20 tem `empresa_id` na lista de
    colunas, e todo INSERT nelas TEM lista de colunas;
  - catálogo, sobre o `prosrc` de `public` no CI: o mesmo.

  Universo CONTADO (uma varredura que não achasse INSERT nenhum passaria verde sem olhar nada). Hoje reprova pelos 18
  nomes do fato 11.
- **A trava do tipo** (decisão 4): uma trava de mesa que lê `database.ts` pelo compilador e exige `empresa_id` obrigatório
  (`string`, sem `?`) no `Insert` das 20 — e que a lista das 20 venha de `k_negocio` (a fonte única), não de uma cópia.
  Hoje reprova pelos 20.
- **A varredura TS de escrita** (decisão 5): todo `.from('<uma das 20>').insert(`/`.upsert(` em `src/**` e
  `scripts/**` manda `empresa_id` — no literal do payload, ou por um construtor nomeado que o tipo prova. Hoje reprova
  pelos 33.
- **A trilha**: `registrarEventoAdmin` exige a empresa no tipo `EventoAdmin`, e um teste de mesa prova que as 15
  chamadas a passam. Hoje reprova.
- **Os leitores (a)–(d)**: um teste por leitor que, com duas empresas na mesma chave natural (a plataforma enxergando as
  duas), prova que ele devolve/altera só a da empresa de quem escreve. Para (b), o roteiro SQL: com dois `motivos` de
  mesmo `codigo` em empresas diferentes, o `update` da action alcança só um. Hoje reprova.
- **O restaurar**: `restauracao.sql` (ou o teste de `restaurar-guarda.test.mts`) com um backup SEM a chave `empresa_id`
  restaura com a empresa da filial do backup no banco de destino. Hoje, com o default, passa por acaso — então a trava
  nasce junto com o `drop` (a contração) no CI, e prova vermelho na sabotagem F.

### Frente C: o banco (migrations `0200`+)
Migrations pequenas, por lote (decisão 9), na ordem de dependência. Cada uma leva:
- o cabeçalho de classe, validado pelo classificador;
- o diff contra o corpo vivo de cada função recriada;
- o rollback no rodapé;
- `db:lock` no mesmo commit; entrada em `DA_F38` e em `RECRIACOES_AUTORIZADAS`;
- um nome-sem-prefixo que não repita;
- `set lock_timeout = '2s'`/`reset`, sem `begin`/`commit`;
- grants preservados (`create or replace` com a mesma assinatura preserva a ACL; confira e declare).

**Sem `update`/`delete`/backfill em tabela de negócio, sem tocar policy, sem `cascade`, sem DDL dinâmica, sem coluna
nova.**

A proposta (a ordem final é sua, escrita):
1. **EXPANSÃO, lote acervo**: as 15 funções que inserem nas oito do lote 1 recriadas, MESMA assinatura, gravando a
   empresa do pai. O diff contra o corpo vivo mostra SÓ a coluna na lista, o valor e a leitura do pai (decisão 2).
2. **EXPANSÃO, lote vocabulário e registros**: `import_gravar_trilha` e `registrar_limpeza_termos_sem_linha` (decisão
   3). Se a decisão 3 mudar a assinatura, a assinatura nova entra AO LADO da antiga (o molde da F67), e a antiga cai na
   contração.
3. **Se a leitura do vocabulário do import (c) mora no SQL**, a recriação dela, no lote 2, com a mesma régua de diff.
4. **CONTRAÇÃO**, em arquivos separados, aplicados em produção só depois do deploy e da janela (Frente G, passo 10), na
   ordem acervo → vocabulário e registros → `filiais`:
   - `alter table public.<t> alter column empresa_id drop default`, uma tabela por comando, o lote num arquivo;
   - no lote em que entrar, a queda da assinatura antiga da decisão 3, sem `if exists` e sem `cascade`.

   As travas 15b/15e invertidas entram no MESMO commit da contração do lote delas (a ficha).

### Frente D: o app
- **O tipo** (decisão 4): `empresa_id: string` obrigatório no `Insert` das 20 em `database.ts`; o `Update` continua
  opcional (ninguém troca empresa — `guarda_empresa`).
- **Os 17 escritores** (decisão 1): cada um manda a empresa pela fonte da tabela-verdade. Onde há filial,
  `empresaDaFilial` (ou uma variante que não pague uma ida ao banco por linha num laço — meça e escreva). Onde não há,
  `empresaDaOperacao()`, contada na catraca com destino F70 — exceto `senhas_acesso` (destino **F68**, a porta pública).
  O colaborador inline nasce na empresa da filial da movimentação. O termo, na dos ativos. O comentário de
  `colaboradores.ts:299`–`303` passa a dizer o novo.
- **A trilha** (decisão 20): `EventoAdmin` ganha `empresa: string` obrigatório; cada uma das 15 chamadas diz a empresa
  ALVO. O "não propaga" da F21 fica (decisão consciente), mas a falha passa a nomear a causa no `registrarFalha` quando o
  código for `23502` (sem valor de linha).
- **Os leitores (a)–(d)** (decisão 8).
- **A frase pt-BR do `23502` em `empresa_id`** (decisão 18), em `erros-do-banco.ts`, conferida contra o esquema vivo.
- **A régua "ninguém lê"** (decisão 6) e **a catraca da legada**, atualizadas no mesmo commit de cada escritor.

### Frente E: os scripts, os roteiros, o rollback e o injetor
- **Os scripts** (fato 20, decisão 19): `seed.ts` (a empresa fictícia de hoje; o `onConflict` do upsert de colaboradores
  passa a `'empresa_id,nome_chave'`; as duas empresas ficam no backlog — 16/11-4), `carga.ts` (a empresa da filial da
  carga), `persona.ts`, `fixtures-passe2.ts`, `gerar-errata-truncamento.ts`.
- **`restaurar.mjs`** (decisão 11).
- **Os 705 INSERTs dos roteiros** (decisão 10). **Nenhuma asserção muda.** Por roteiro: o número de asserções antes =
  depois, o diff só nas listas de colunas e valores dos INSERTs, a empresa de cada fixture = a da filial (ou do pai) dela.
- **Os roteiros que provam a fase** (no `isolamento_tenant.sql`, estendido, ou num roteiro novo
  `supabase/tests/escrita_por_empresa.sql` — decida): **a escrita da B nasce da B** — cada uma das 18 funções chamada por
  um membro da B grava empresa = B, e o par simétrico na A; o import de uma filial da B grava tudo na B; um INSERT sem a
  coluna nas 20 é recusado com `23502`; um com a empresa de outra é recusado pela FK composta (onde há pai) ou pelo WITH
  CHECK (onde não há).
- **As constantes do CI** (fato 15): o L4 de `integridade_tenant.sql` e `k_escritores` de `empresa_no_vocabulario.sql`,
  com a lista nominal das recriadas e os md5 novos, declarados.
- **O rollback**: `supabase/rollback/F67C-desfaz.sql`, na ordem inversa, cobrindo os dois estados (só expansão; expansão +
  contração). Ensaiado por `supabase/tests/f67c_rollback.sql` até a impressão do CI tirada antes da `0200`, com o irmão de
  mesa `rollback-f67c.test.ts`. Os rollbacks F62 a F67B medidos no CI com a F67C no lugar.
- **O injetor** (decisão 17).

### Frente F: os documentos
- **A ficha F67C, reescrita** no `PLANO-MULTIEMPRESA.md`: o escopo real (as 18 funções, os 17 + 16 escritores, os 705
  INSERTs, a trilha, o tipo como trava, a janela por forma, a vigília), os números medidos, as divergências declaradas
  (fatos 11, 12, 16, 19 e 26), a linha da tabela de fases e a entrega real. E a linha velha da F67B (fato 32).
- **As notas para a F68** (`senhas_acesso` grava a empresa da operação até a porta pública dizer a dela), **a F70** (cada
  `empresaDaOperacao()` nova vira a empresa da SESSÃO; o vocabulário inicial de uma empresa nova, sem o qual o import dela
  não encontra termo nem prefixo) e **a F71** (as frases do `CLAUDE.md` da raiz que esta fase deixou velhas, só
  listadas — **este arquivo NÃO é editado aqui**).
- **MATRIZ**: a emenda F67C a partir do R-ACC-137. Ela fixa: nenhuma `empresa_id` com default; toda escrita diz a
  empresa, pela fonte da tabela-verdade; o tipo obrigatório; a trilha com a empresa ALVO; os leitores por chave natural
  recortados; o restaurar com a empresa da filial.
- **ADR e RUNBOOK**: o `ADR-002` ganha o §19 (o fim do default: por que a empresa vem do pai e não de parâmetro; por que
  não um gatilho que deriva — decisão 1); o `RUNBOOK-BANCO.md` ganha o **Anexo F67C**, "tirar um default com o app no
  ar": escritores primeiro → deploy → a janela por forma em `pg_stat_statements` → o drop por lote → a vigília dos
  `23502` → o `set default` como rollback.
- **Os `CLAUDE.md` aninhados** cujo contrato mudou (`supabase/CLAUDE.md`, `src/lib/termos/CLAUDE.md`,
  `src/lib/colaboradores/CLAUDE.md`, `scripts/import/CLAUDE.md`, se citarem o default). O da raiz, não (F71).
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`: as decisões do Johnny (16/11-3, 16/11-4 e as herdadas que esta fase aplica) e as vinte
  da fase.

### Frente G: o fechamento, nesta ordem
1. `1.75.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real. Por exemplo:
   - tudo o que você cadastra ou registra (ativos, movimentações, itens, colaboradores, termos, relatórios) passa a ser
     gravado já com a sua empresa, em vez de cair nela por padrão;
   - em Administração › Motivos, editar um motivo mexe só no motivo da sua empresa;
   - a Auditoria passa a registrar de qual empresa é cada ação.

   Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F67C.md`. Depois dele, só `docs/**` e `CHANGELOG.md`. Ele CONTÉM a contração.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **No ENSAIO**, pelo `apply_migration` do MCP, com o `name` certo:
   - logo antes: o "antes" refeito;
   - os lotes de EXPANSÃO, um a um. Depois de cada um: o md5 de cada função tocada = o do CI; as outras e todas as
     policies byte a byte;
   - a CONTRAÇÃO, lote a lote (o ensaio não tem app de produção: lá ela não espera deploy);
   - depois: a prova viva da escrita (decisão 14), os 22 defaults pelo `pg_depend`, o `notify pgrst`, os advisors, o
     conferidor (0 recusadas), as 13 checagens iguais e 0 linhas fora da legada.

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com a correção em migration NOVA.
6. **Em PRODUÇÃO**, só a EXPANSÃO, dentro de 24 h do commit das migrations, com as mesmas provas, lote a lote. Depois do
   último lote de expansão:
   - `node scripts/smoke/smoke-prod.mjs` a partir da branch;
   - o conferidor contra PRODUÇÃO (a conta do smoke, só contagens) com 0 recusadas;
   - os advisors; as 13 checagens iguais; 0 linhas fora da legada;
   - a paridade ensaio × produção, menos o delta declarado da contração que só o ensaio tem.

   Smoke, conferidor ou checagem reprovou? **Rollback imediato em produção** do que foi aplicado, antes do diagnóstico,
   sem merge, com o registro no topo do relatório.
7. Ata e `docs/RELATORIO-F67C.md` com o que já dá para escrever. O PR sai do rascunho. Merge com os dois checks verdes,
   logo depois das provas.
8. **O deploy e a conferência, só leitura**: `/api/saude` com `1.75.0` e o commit do merge; o smoke com 0 falha.
9. **A janela por forma** (decisão 12, no molde do Anexo F67):
   - T0: as chamadas por forma de INSERT de topo nas 20, por papel de app, COM e SEM `empresa_id` (só número);
   - a prova estática: as varreduras de escrita (SQL, TS, scripts) verdes no SHA no ar, e o SHA no ar = o merge;
   - uma janela de ≥ 30 min (mais, se a Skew Protection pedir — decisão 12);
   - T1;
   - a condição: **nenhuma chamada nova numa forma SEM `empresa_id`** entre o deploy e T1, nos papéis do app. Δ 0 por
     ausência nos escritores raros (filial, motivo, tipo, kit, senha, apelido, vocabulário) é o esperado: declare.
10. **A CONTRAÇÃO em PRODUÇÃO**, só com a condição atendida, lote a lote (acervo → vocabulário e registros → `filiais`).
    Depois de cada lote, a vigília curta (decisão 13); depois do último, a vigília de ≥ 30 min, o smoke, o conferidor,
    os advisors, as 13 checagens, 0 linhas fora da legada e a paridade ensaio × produção (agora iguais). **Um `23502` em
    `empresa_id` na vigília = `set default` do lote imediatamente**, antes do diagnóstico, com o registro no topo do
    relatório.
11. **A Parte B** do `saude.yml` disparada à mão:
    - a deriva sem pendente;
    - as 13 checagens **iguais aos números travados**;
    - qualquer número maior, ou achado novo, é bloqueio (ver "Bloqueios").

    Nenhuma captura de tela de produção.
12. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.75.0` vai no merge
    dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Das outras fases:**
  - a porta pública e a senha de visualização por empresa, no banco e no tipo (F68): aqui `senhas_acesso` só passa a
    gravar a empresa da operação;
  - `profiles`, `membros`, `plataforma_admins`, `handle_new_user` e a saída das contas dev de `membros` (F69);
  - a empresa da sessão, o seletor, o vocabulário inicial de uma empresa nova (F70);
  - o `CLAUDE.md` da raiz (F71); o piso e a sua revogação (F72); o piloto (F73).
- **O que esta ordem acrescenta:**
  - o seed com duas empresas, as seis tabelas sem fixture e o `seed.test.ts` (16/11-4: backlog);
  - qualquer policy (a F67C não reescreve nenhuma; o md5 delas é byte a byte);
  - Storage, Realtime e os 3 `.docx` sem linha;
  - a função `public.empresa_legada()` e o literal `EMPRESA_LEGADA_ID` (continuam: são a legada EXPLÍCITA);
  - `update`/`delete`/backfill de negócio em banco vivo; coluna nova; editar migration aplicada; `cascade`, `drop … if
    exists` na contração, DDL dinâmica;
  - um gatilho que preencha `empresa_id` (decisão 1: é o default disfarçado);
  - consertar os dados do #84, ou subir a linha de base do alarme ou do smoke (13/11-3);
  - chamar RPC de escrita, destrutiva, de conta ou de import em banco vivo;
  - afrouxar o classificador, a guarda de topo, a doutrina do predicado, os catálogos das F48 a F67B, a parte de LEITURA
    da régua "ninguém lê", ou pôr exceção nominal sem motivo;
  - `.github/workflows/**` e a proteção da `main`;
  - dependência nova, `.env*`, `scratchpad/`, os PRs do dependabot, o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F67C.md` tem: os 32 fatos remedidos; as tabelas-verdade dos escritores, dos leitores e das travas, sem linha
   sem destino; as vinte decisões; o censo dos roteiros; a ordem das migrations; a fronteira expansão | contração por
   lote; e a ORDEM DE ROLLBACK. Ele é anterior ao primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
3. O "antes" existe nos dois bancos, tirado antes de qualquer apply, com os defaults, as linhas fora da legada, as formas
   de INSERT, as 13 checagens e a Skew Protection. Só números, nomes e textos de esquema, configurações e hashes.
4. As migrations começam na `0200`, com cabeçalho de classe validado, o diff contra o corpo vivo, rollback no rodapé,
   `db:lock` no mesmo commit e entrada em `DA_F38` e `RECRIACOES_AUTORIZADAS`. Não há `update`/`delete`/backfill de
   negócio, policy tocada, `cascade`, DDL dinâmica, coluna nova nem nome-sem-prefixo repetido. A contração está em
   arquivos próprios, por lote.
5. **Nenhuma das 20 tem default**, nos dois bancos. 15b e 15e EXIGEM a ausência; a derivada reprova `empresa_id` com
   default em qualquer tabela de `public`. Nasceram vermelhas e sabem ficar vermelhas (sabotagem A).
6. **As 18 funções** gravam a empresa do pai, com a mesma assinatura (ou, na decisão 3, a nova ao lado e a antiga
   derrubada na contração). O diff de cada uma mostra só a coluna, o valor e a leitura do pai. A varredura SQL de escrita
   (disco e catálogo) dá zero, com o universo contado.
7. **O app**: `empresa_id` obrigatório no `Insert` das 20, com a trava de mesa contra a volta do `?`; os 17 escritores
   mandam a empresa pela fonte da tabela-verdade; o colaborador inline nasce na empresa da filial; o termo, na dos ativos;
   `registrarEventoAdmin` exige a empresa, e as 15 chamadas dizem a ALVO. A varredura TS de escrita dá zero.
8. **Os scripts e o restaurar**: os 16 INSERTs mandam a empresa; um backup de antes da F63 restaura com a empresa da
   filial dele no banco de destino (provado no CI).
9. **Os leitores (a)–(d)** recortam pela empresa de quem escreve; o `update motivos` alcança um só motivo com duas
   empresas de mesmo código (provado no CI e na mesa).
10. **A régua "ninguém lê"** passou a "toda escrita escreve; ler segue nominal", e a parte de leitura acusa como antes
    (sabotagem G).
11. **A escrita de outra empresa funciona no CI**: cada uma das 18 funções e o import, chamados por um membro da B,
    gravam a B, e o par na A grava a A; o INSERT sem a coluna é `23502`; o com a empresa errada é recusado.
12. **Os roteiros**: 0 INSERT nas 20 sem a coluna; o número de asserções de cada roteiro antes = depois (mais as novas,
    declaradas); nenhuma asserção mudou.
13. **Zero janela**: a contração em produção só depois do deploy e da janela por forma, com T0, T1, a Skew Protection e a
    prova estática em `docs/f67c-evidencias/`.
14. **A vigília**: depois de cada lote da contração, e por ≥ 30 min depois do último, 0 `23502` em `empresa_id` nos logs
    do Postgres e 0 falha de `auditoria.registro-evento` na Vercel (só contagem).
15. **Nada mudou para a WAP**: 0 linhas fora da legada nas 20, antes e depois; todas as policies byte a byte; o smoke com
    0 falha; o conferidor com 0 recusadas no ensaio e em produção; as 13 checagens nos números travados.
16. As funções fora da tabela-verdade estão byte a byte (md5 do "antes" × "depois"), e as tocadas batem com o CI. Os
    advisors de segurança não ganharam nada não declarado. A paridade ensaio × produção fecha.
17. O rollback cobre os dois estados, está em `supabase/rollback/F67C-desfaz.sql` e foi **ensaiado no Postgres do CI**.
    Os rollbacks F62 a F67B foram medidos com a F67C no lugar, e o resultado está declarado.
18. A decisão sobre o injetor está na ata. As mutações entraram e são detectadas pelo cenário nomeado. O teto está no
    número exato (184 → N), com o porquê datado, e a quarentena abaixo de ⅓.
19. `database.ts` mudou SÓ no que esta fase mudou (a obrigatoriedade no `Insert`, e assinatura se a decisão 3 a mudar), e
    `db:types:diff` está verde.
20. Os documentos estão feitos: a ficha F67C reescrita (e a linha da F67B), as notas F68/F70/F71, a MATRIZ (F67C), o
    `ADR-002` §19, o `RUNBOOK-BANCO.md` (Anexo F67C), os `CLAUDE.md` aninhados tocados, os índices e a ata.
21. Nenhuma dependência nova. Ficaram intocados `.github/workflows/**`, o `CLAUDE.md` da raiz, as policies, o Storage, o
    seed de duas empresas e `empresa_legada()`. Nenhum número de linha de base subiu.
22. `package.json` em `1.75.0`, e `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.75.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
23. As sabotagens A a J estão com saída real em `docs/f67c-evidencias/`.
24. Nenhum dado real (nome, e-mail, id, patrimônio, slug, texto de linha, a linha do `DETAIL` de um `23502`) em
    migration, teste, roteiro, evidência ou log. Da produção, só números, nomes de esquema, textos de esquema e hashes.
    Ninguém abriu o `.env.local`.
25. `docs/RELATORIO-F67C.md` segue o padrão F45 a F67B, com o roteiro do Johnny no topo, o estado de repouso e a seção
    "o que este relatório NÃO prova".

# Verificação: rode de verdade
A cada incremento, rode `npm run lint`, `npm run test` e `npm run typecheck`. Rode `npm run build` antes de cada push.
Tudo o que é SQL (roteiros, injetor, `db:types:diff`) passa pelo `banco-sem-docker` do PR. Leia a falha, corrija a
**causa raiz** e repita até passar.

Não faça nada disto para um teste passar:
- alargar exceção para caber um caso que devia reprovar;
- trocar detecção por `skip`;
- afrouxar um catálogo, o classificador, a guarda de topo ou a parte de leitura da régua;
- subir a linha de base;
- mudar uma asserção existente — num roteiro, só a lista de colunas e os valores de um INSERT de fixture mudam;
- devolver um default "só no CI", ou pôr `?` de volta no tipo "só por enquanto".

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**TODA LINHA DIZ DE QUE EMPRESA É. O DEFAULT SÓ SAI DEPOIS QUE NINGUÉM MAIS DEPENDE DELE.** As varreduras e o tipo
verdes, o CI verde com o default fora e o ensaio contraído limpo são o portão do apply de produção. Os mesmos em
produção, mais o smoke e o conferidor, são o portão do merge. Nenhuma chamada nova em forma sem `empresa_id` é o portão
da contração. A vigília sem `23502` é o portão do fechamento.

Provas obrigatórias, cada uma com a saída real em `docs/f67c-evidencias/`:
- **Sabotagem A, o default de volta.** Numa subtransação do CI, `set default public.empresa_legada()` numa tabela do lote
  1 e noutra do lote 2: 15b, 15e e a derivada acusam pelo nome. E numa tabela fictícia nova com `empresa_id` e default: a
  derivada acusa.
- **Sabotagem B, a função que esquece.** Uma das 18 recriada sem a coluna (numa subtransação): a varredura do catálogo
  acusa pelo nome, e o roteiro da função dá `23502`. A mesma sabotagem no disco (um texto sintético): a varredura de mesa
  acusa.
- **Sabotagem C, o app que esquece.** Um escritor TS sem a empresa: o `typecheck` vermelho. O `?` de volta no `Insert`:
  a trava do tipo vermelha. Um `.insert(variavel)` não tipado sem a coluna: a varredura TS vermelha.
- **Sabotagem D, a empresa errada.** O colaborador inline com a empresa da operação onde devia ser a da filial (com a
  filial na B): o roteiro da escrita por empresa acusa (`23503`). Uma função SQL gravando a empresa de quem chama em vez
  da do pai: o roteiro acusa.
- **Sabotagem E, o motivo nas duas.** O `update motivos` sem a empresa: com dois motivos de mesmo código, o teste acusa
  as duas linhas alteradas.
- **Sabotagem F, o backup antigo.** `restaurar.mjs` sem o preenchimento da empresa: o backup sem a chave dá `23502` no
  roteiro de restauração.
- **Sabotagem G, a régua de leitura.** Uma leitura nova `.eq('empresa_id', …)` numa das 19, fora da lista nominal: a
  varredura de leitura acusa — a régua não afrouxou ao virar "escrita obrigatória".
- **Sabotagem H, a janela sabe ver.** No ENSAIO, no estado de expansão (default ainda presente), dentro de um bloco que
  termina em `raise`, um INSERT de topo SEM a coluna numa das 20: o Δ da forma sem `empresa_id` em `pg_stat_statements`
  sobe (confirme na doc se um statement de transação abortada é registrado; se não for, desenhe a prova equivalente e
  escreva). Sem a sabotagem, Δ 0.
- **Sabotagem I, a trilha calada.** `registrarEventoAdmin` chamado sem empresa: o `typecheck` vermelho; e o teste de mesa
  com o client simulado devolvendo `23502` prova que `registrarFalha` recebe a causa nomeada, sem valor de linha.
- **Sabotagem J, o rollback.** `F67C-desfaz.sql` devolve os defaults e os corpos à impressão de antes da `0200`, a partir
  dos dois estados. Os rollbacks F62 a F67B com a F67C no lugar, com a saída real e a declaração.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI (por roteiro, nos 35 adaptados);
  - mutações e teto;
  - funções e `security definer` em `public`; o universo de `definer_sem_tenant` (27 → N);
  - colunas `empresa_id` com default (20 → 0) nos dois bancos;
  - linhas fora da legada nas 20 (0 → 0);
  - policies (md5, iguais);
  - formas de INSERT de topo sem `empresa_id` com chamada nova (T0 → T1);
  - `23502` em `empresa_id` na vigília;
  - as 13 checagens;
  - o conferidor (pontos, linhas, recusadas) no ensaio e em produção;
  - advisors por nível e nome;
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco, os bancos de hoje e a documentação oficial;
2. as decisões do Johnny abaixo;
3. a ficha da F67C no §7 do plano, menos as divergências que esta ordem declara;
4. este prompt, no que ele detalha;
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, a MATRIZ, o código existente, os moldes
   F67B/F67/F63/F64/F65/F66B/F54);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**As decisões do Johnny:**
- **16/11-3, uma run em lotes**: acervo (8) → vocabulário e registros (11) → `filiais`, escritores antes e o `drop
  default` por último, depois do deploy. Um PR de código e um PR de documentação com a tag.
- **16/11-4, o seed**: só passa a dizer a empresa fictícia de hoje (e o `onConflict` do mesmo upsert). As duas empresas
  ficam no backlog.
- **Herdadas, aplicadas aqui**:
  - 12/11-2: a divisão em F67/F67B/F67C;
  - 13/11-1, "dev sou só eu": a plataforma é o Johnny;
  - 13/11-2: expandir e contrair, zero janela — aqui, os escritores (expansão) e o default (contração);
  - 13/11-3: os números das checagens travados, nada de consertar dado;
  - F67, decisão 1: a trilha grava a empresa ALVO; F67, a regra da empresa: a da filial quando há filial, senão a da
    operação.

**As vinte decisões que esta fase precisa tomar por escrito:**
1. **De onde vem a empresa, por tabela** (fatos 8, 9 e 16). A proposta:
   - **com pai**, do pai: no SQL, lida do pai dentro da função; no app, `empresaDaFilial` (a da filial da operação);
   - o **colaborador inline** (criado dentro de uma movimentação), da filial da movimentação — nunca da operação: com a
     filial na B, a FK composta da movimentação recusaria o colaborador da WAP;
   - o **colaborador sem filial**, da operação;
   - o **termo**, da filial dos ativos do termo (todos da mesma empresa — `termo_da_empresa` confere);
   - o **relatório consolidado** (`filial_id` nulo), da operação;
   - **sem pai** (`itens`, `tipos_item`, `motivos`, `kits_modelos`, o vocabulário do import, `filiais`), da operação;
     `senhas_acesso`, da operação com destino **F68**;
   - a **trilha**, a empresa ALVO (decisão 20).

   **Descartada, com o motivo na ata e no ADR §19**: um gatilho BEFORE INSERT que derive a empresa do pai quando ela vier
   nula. É o default disfarçado (a linha continua nascendo "por omissão", só que de outro lugar), o tipo gerado exige a
   coluna no `Insert` de qualquer jeito, e ele somaria um gatilho às 20 com ordem alfabética a vigiar
   (`termo_da_empresa`, `kit_motivo_da_empresa`, `termo_exige_modelo_da_empresa` leem `new.empresa_id`).
2. **As 18 funções: a empresa do pai, sem parâmetro novo.** `create or replace` com a MESMA assinatura; a empresa lida do
   pai que a função já conhece (a filial do lote, o ativo, a movimentação), uma vez por comando quando der (não uma
   leitura por linha num laço — meça). Nenhum `p_empresa` novo: um parâmetro que só pode divergir do pai é um modo de
   falha a mais, e mudar a assinatura obrigaria expandir e contrair as 18. As três do import usam a empresa que
   `importar_ativos_substituir` já conferiu (a da filial do plano). A leitura de `filiais.empresa_id` não é leitura do
   acervo (`filiais` está fora dos lotes 1 e 2); a de `ativos`/`movimentacoes` é, e entra na régua nova (decisão 6).
3. **`registrar_limpeza_termos_sem_linha`** (fato 12). A proposta: a trilha da ferramenta é da empresa da OPERAÇÃO, que a
   action (`limparTermosSemLinha`) já tem (`empresaDaOperacao()`): a função ganha `p_empresa uuid` no molde da F67 —
   assinatura nova AO LADO da antiga na expansão, a action passa a chamá-la, a antiga cai na contração do lote 2. A
   alternativa (`empresa_legada()` no corpo, como exceção nominal com motivo) só se a medição mostrar custo
   desproporcional — e então declarada, com destino F70.
4. **O tipo como trava** (fato 19). `empresa_id: string` obrigatório no `Insert` das 20. Duas saídas, escolha e escreva:
   - hand-fix datado no `database.ts` (o molde F63/F65), mínimo;
   - ou regenerar pelo `generate_typescript_types` do MCP a partir do ENSAIO contraído, preservando os hand-fixes de
     nulabilidade das `rel_*` (a CLI fixada em 2.109.1 — `diff-tipos.mjs` explica) e conferindo o diff linha a linha.

   Nas duas, a trava de mesa nova lê o tipo pelo compilador (como `diff-tipos.mjs` faz) e reprova o `?` de volta. O
   `Update` fica opcional.
5. **A varredura TS de escrita** (o que o tipo não alcança): os scripts sem o generic `Database` e os `.insert(variavel)`.
   A proposta: toda cadeia `.from('<uma das 20>')…insert(`/`upsert(` em `src/**` e `scripts/**` (fora de teste) cita
   `empresa_id` no payload literal, OU o payload vem de um construtor de uma lista nominal pequena (com o tipo que prova a
   coluna). Universo contado.
6. **A régua "ninguém lê" muda de natureza** (fato 23). A proposta:
   - mesa: a varredura `.from` passa a ignorar o PAYLOAD de `insert`/`upsert` e o `onConflict` (escrita), e continua
     acusando `select`/`eq`/`filter`/`match`/`order`/`in` (leitura). A catraca do literal deixa de contar os trechos de
     escrita (que a varredura de escrita cobre) e ganha os leitores (a)–(d), nominais, com motivo;
   - disco e catálogo (15g–15i, `k_leitura_tenant`): `empresa_id` na LISTA DE COLUNAS de um INSERT não é leitura; a
     leitura da empresa do pai nas 18 entra como categoria nova e nominal ("a empresa do pai para gravar o filho"), com a
     origem provada no comando (o molde das exceções da F65); as `forcar_*` migram para ela.

   A sabotagem G prova que a leitura não afrouxou.
7. **A varredura SQL de escrita** (Frente B): todo INSERT nas 20 tem lista de colunas e `empresa_id` nela, no disco e no
   catálogo, **sem lista de exceção**. Inclui INSERT dentro de `do`, de CTE (`with … insert`), de `execute` com texto
   fixo, e de gatilho.
8. **Os leitores (a)–(d)** (fato 25):
   - (a) cada um ganha a empresa de quem escreve (da filial quando a operação tem filial; senão da operação);
     `resolverFilialPorSlug` recebe a empresa e deixa de lançar com duas;
   - (b) `update motivos` com `.eq('empresa_id', …)` — e o mesmo olhar em todo `update`/`delete` de vocabulário por
     chave natural (`tipos_item` por `slug`, os `import_*` por termo/prefixo, `unidades_apelidos`): meça e escreva a
     lista;
   - (c) `lerVocabularioImport` e a leitura do vocabulário dentro da RPC do import, pela empresa da filial do plano;
   - (d) `lerUltimaVersao` pela empresa do relatório (a da filial, ou a da operação no consolidado), alinhada com o
     unique por empresa da `0171`.
9. **Os lotes, a fronteira e a ordem** (16/11-3). Cada lote: as funções SQL dele (expansão) → os escritores do app e dos
   scripts dele → (depois do deploy) o `drop default` dele. Entre dois lotes, o estado é repouso válido (as tabelas de um
   lote contraído e as do outro ainda com default convivem).
10. **Os 705 INSERTs dos roteiros** (fato 26). A proposta:
    - a empresa EXPLÍCITA, por literal, igual à da fixture: a legada fictícia (`00000000-0000-4000-a000-000000000001`)
      onde a filial é dela, a B onde a filial é da B. Onde a forma do roteiro dificultar o literal, um subselect da
      empresa do pai (`(select empresa_id from public.filiais where id = …)`) — escolha uma forma por roteiro e escreva;
    - transformação por script DESCARTÁVEL (fora do repositório, ou removido antes do commit), roteiro a roteiro, com o
      diff conferido;
    - por roteiro, o número de asserções e o texto de cada `assert`/`raise` antes = depois (uma conferência mecânica, que
      vai para a evidência);
    - paralelizável por arquivo (cada subagente com um conjunto DISJUNTO de roteiros), e revisado por outro subagente que
      só procura uma coisa: alguma mudança fora das listas de colunas e valores dos INSERTs.
11. **`restaurar.mjs`** (fato 21). A proposta: linha do backup sem a chave → a empresa da FILIAL da linha no banco de
    DESTINO (lida de `filiais`; a FK composta confere de novo); linha com a chave → a dela. A conferência (sem
    `--aplicar`) imprime quantas linhas receberam a empresa pela filial. Backup misto (fato 21): a coluna entra para
    todas, preenchida. Sem filial de onde tirar: recusa, com frase.
12. **A janela por forma** (fatos 27 e 28):
    - T0/T1 por (tabela, forma COM/SEM `empresa_id`, papel `authenticated`/`service_role`), só número;
    - a condição: Δ 0 nas formas SEM `empresa_id` nos papéis do app entre o deploy e T1; o papel `postgres` (migrations,
      scripts) fica fora, declarado;
    - **a Skew Protection**: meça (o MCP da Vercel, `vercel project inspect` ou a API, só leitura). Desligada: janela de
      ≥ 30 min. Ligada: a janela cobre o tempo máximo em que o deployment velho atende (a doc), ou a contração fica
      PENDENTE para uma sessão posterior (repouso válido), com o comando e a condição no topo do relatório. Não medível:
      trate como ligada;
    - repita a janela até três vezes em 2 h se não fechar; se persistir, contração pendente.
13. **A vigília depois do drop.** Depois de cada lote contraído em produção, uma vigília curta (≥ 5 min); depois do
    último, ≥ 30 min. Conta, só número: os `23502` em `empresa_id` nos logs do Postgres (`get_logs`, filtro pelo nome da
    coluna; a linha do `DETAIL` NUNCA sai do filtro) e os erros de `auditoria.registro-evento` nos logs de runtime da
    Vercel. **Qualquer número > 0 = `set default` do lote imediatamente** (o bloco ensaiado de `F67C-desfaz.sql`),
    antes do diagnóstico. Se os logs não forem alcançáveis, declare e conte só pelo que der.
14. **A prova viva da escrita no ENSAIO** (fato 30), depois da contração: um bloco que termina em `raise`, como
    `authenticated` com as claims de uma membership do ensaio, que (i) recusa com `23502` um INSERT sem a coluna em cada
    uma das 20 e (ii) aceita o mesmo INSERT com a empresa certa. As 18 funções são provadas no CI (com o default fora);
    no ensaio, só se der para montar argumentos válidos sem ler valor de linha — decida e escreva. **Em produção, nada de
    escrita, nem em bloco com `raise`.**
15. **"Nada muda para a WAP"**: 0 linhas fora da legada nas 20 antes e depois; md5 de todas as policies igual; as 13
    checagens; o smoke; o conferidor. O conta a conta (`scripts/perf/conta-a-conta.mjs`) não é o instrumento desta fase
    (nenhuma policy muda): rode uma fase existente como regressão só se o custo for baixo, e declare.
16. **O rollback e o encadeamento**:
    - do estado contraído: `set default public.empresa_legada()` nas 20, lote a lote, na ordem inversa — PRIMEIRO, e
      sozinho já devolve o comportamento de antes;
    - da expansão: os corpos de antes das funções recriadas (e a assinatura antiga da decisão 3, se ela já tiver caído);
    - a declaração: depois do rollback, os escritores novos continuam mandando a empresa (o que é inofensivo com o
      default de volta); nenhum dado se perde;
    - a ordem, escrita, antes dos rollbacks da F67B para trás.
17. **O injetor**: uma mutação por classe de trava desta fase que nenhum teste de mesa já derruba. As candidatas:
    - o default de volta numa das 20 (15b/15e e a derivada);
    - uma das 18 sem a coluna (a varredura do catálogo);
    - a empresa do pai trocada pela de quem chama numa função (o roteiro da escrita por empresa);
    - o `update motivos` sem a empresa (o roteiro de (b));
    - a restauração sem o preenchimento (`restauracao.sql`).

    Teto novo exato (184 → N), ou a ata diz por que não entrou.
18. **A frase do `23502` em `empresa_id`**: pt-BR, sem valor de linha nem nome de tabela técnico ao operador, em
    `erros-do-banco.ts`, conferida contra o esquema vivo. Nunca o `DETAIL`.
19. **Os scripts**: `seed.ts` com a empresa fictícia (a legada fictícia de hoje, pelo `EMPRESA_LEGADA_ID` ou pela leitura
    da filial semeada — escolha); `carga.ts` com a empresa da filial da carga (e a guarda anti-produção intacta);
    `persona.ts`, `fixtures-passe2.ts` e `gerar-errata-truncamento.ts` com a da operação ou a da filial. O que for
    `EMPRESA_LEGADA_ID` explícito ganha uma linha na tabela-verdade com o destino.
20. **A trilha** (fato 17): `EventoAdmin.empresa` obrigatório; cada chamada com a empresa ALVO — a da filial nos eventos de
    filial, apelido e import; a da operação nas contas e nas senhas. O "não propaga" fica (F21), com a causa nomeada no
    `registrarFalha` quando o código for `23502`.

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **Um `23502` em `empresa_id` apareceu em produção** (na vigília, ou em qualquer momento depois de um drop): **`set
  default` do lote imediatamente**, pelo bloco ensaiado de `F67C-desfaz.sql`, antes do diagnóstico. Registro no topo do
  relatório. Achou o escritor esquecido? A correção vai por PR novo, e o drop daquele lote fica PENDENTE (repouso válido).
- **O MCP da Supabase não está conectado, recusa o apply ou não autentica num dos bancos.** Não procure token, não leia o
  Gerenciador de Credenciais, não abra o `.env.local`. Confira de novo algumas vezes ao longo da run.
  - Se só o ENSAIO falhar: **nada vai a produção** sem o ensaio antes. Entregue tudo o que não depende de banco vivo, com
    o PR ABERTO e **SEM merge**, e ponha no topo do relatório o caminho B: as migrations na ordem (expansão e contração
    separadas, por lote), as contagens e o rollback.
  - Se os dois falharem: o mesmo.
- **A janela não fecha** (chamada nova numa forma sem `empresa_id`). Alguém ainda grava pelo app velho: uma aba aberta,
  a Skew Protection, ou um escritor que as varreduras não pegaram. **Não contraia.** Descubra pela forma e pela tabela
  (só contagem). Repita a janela, no máximo três vezes em 2 h. Se persistir, o PR de documentação sai com a contração
  PENDENTE no topo do relatório (o comando exato e a condição), e a tag espera. É estado de repouso válido.
- **Os números das checagens mudaram** (mais achados, achado maior, achado novo) em qualquer momento depois da linha
  travada:
  - se foi a fase (uma das funções recriadas gravando diferente): rollback e bloqueio no topo;
  - se não foi (o dado de produção andou sozinho): registre os números (só número), não conserte nada, e declare na seção
    "o que este relatório NÃO prova".
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO do bloco de
  `supabase/rollback/F67C-desfaz.sql` que o CI ensaiou para aquele estado. É a única exceção ao "`execute_sql` só
  leitura", e vale só para esse arquivo. A linha do ledger fica: registre o que a sonda de deriva vai dizer dela. Se o
  classificador barrar o rollback, não reformule: o comando exato vai no topo do relatório.
- **O lock não veio** (`lock_timeout` disparou no `drop default` ou no `create or replace`): registre e tente de novo, no
  máximo três vezes em 30 minutos. Não suba o timeout nem mate sessões. Depois da terceira, pare o apply daquele banco
  (ou daquele lote da contração): PR aberto sem merge, ou contração pendente, com o comando no topo do relatório.
- **Advisor de segurança novo** depois do apply, não declarado: se cita objeto desta fase, escalada do runbook e rollback
  antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e siga.
- **O smoke ou o conferidor recusam** depois de um apply de produção: rollback daquele estado, PR sem merge, e a causa no
  topo do relatório. Não tente consertar na mesma run.
- **A sonda de deriva abre alarme** porque a contração ficou mais de 24 h no repositório sem apply: registre. O alarme
  fecha sozinho na Parte B seguinte ao apply.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a pendência.
  Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, merge, push de tag, disparo de workflow,
  rollback): registre, não repita, não reformule, siga no que não depende dela e ponha o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui já
há sete divergências medidas de saída**, e elas vão no relatório:
- a numeração (`0200`) e a versão (`1.75.0`) (fato 1);
- as 18 funções, com `registrar_limpeza_termos_sem_linha`, que a ficha não conhece (fatos 11 e 12);
- os 17 pontos do app, com o termo em `src/lib/termos/persistir.ts`, não em `termos.ts:532` (fato 16);
- a trilha que engole a falha (fato 17);
- o tipo opcional que o `db:types:diff` não vê (fato 19);
- os 705 INSERTs em 35 roteiros, não 569 + 38 + 22 (fato 26);
- a linha velha da ficha F67B (fato 32).

Declare também o que este prompt acrescenta à ficha:
- o tipo como trava e a varredura TS de escrita;
- a régua "ninguém lê" mudando de natureza;
- a janela por forma em `pg_stat_statements` e a Skew Protection;
- a vigília dos `23502` depois do drop;
- a escrita de outra empresa provada no CI;
- o colaborador inline pela filial da movimentação.

# Git e segurança
- **Branch** `f67c-fim-do-default`, com commits pequenos e frequentes e mensagens em pt-BR no padrão conventional
  (`docs(f67c): …`, `test(f67c): …`, `feat(f67c): …`, `fix(f67c): …`, `chore(f67c): …`).
- **Documentação primeiro.** Commite também esta ordem (`docs/prompts/F67C-fim-do-default-ultracode.md`) num commit de
  documentação. O `PLAN-F67C.md` vem antes do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os commits vão nesta ordem:**
  1. as travas vermelhas;
  2. cada lote de expansão, um commit por migration, com `db:lock`;
  3. o app, por lote (o tipo, os escritores, a trilha, os leitores, a régua, a catraca);
  4. os scripts e o `restaurar.mjs`;
  5. os roteiros adaptados (por roteiro ou por grupo pequeno, com a conferência de asserções na mensagem), os roteiros
     novos, as constantes do CI e o rollback;
  6. o injetor;
  7. a contração, por lote, com 15b/15e invertidas no commit do lote delas;
  8. os documentos (a ficha, a MATRIZ, o ADR, o RUNBOOK, os aninhados, a ata);
  9. a versão.
- **Pushes agrupados**: cada um custa CI numa cota apertada. Os roteiros ficam vermelhos entre o commit da contração e o
  dos roteiros se a ordem os separar: agrupe no mesmo push.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece quando:
  - `verificar` e `banco-sem-docker` estão verdes;
  - a expansão está aplicada nos dois bancos, com as provas;
  - o conferidor deu 0 recusadas e o smoke 0 falha em produção.

  A contração é aplicada em produção DEPOIS do merge. A evidência vai por um PR só de documentação, e qualquer correção
  de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `cascade`, `drop … if
  exists` na contração, abrir a janela `estoque.dev_destrutivo`, DDL dinâmica, `update`/`delete`/backfill;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; chamar RPC de escrita, destrutiva, de conta ou de import;
  escrever em produção fora do `apply_migration` e do rollback autorizado (nem em bloco com `raise`); matar sessão do
  app; imprimir ou gravar valor de coluna, id, nome, e-mail, patrimônio, slug, texto de linha ou a linha do `DETAIL` de
  um erro (nem em log, nem em evidência, nem na resposta);
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de 10/09);
  ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha e token;
- **no repositório:** mexer na proteção da `main` ou nos workflows, instalar dependência, mexer nos PRs do dependabot,
  subir número da linha de base, editar o `CLAUDE.md` da raiz.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local`, e que de banco só lê catálogo, contagens,
configurações, textos de esquema e hashes (nunca valores de linha, nunca o texto de um log de erro). As frentes de
exploração:
- (a) **os escritores SQL**: as 18 funções pelo corpo vigente, o pai de cada INSERT, gatilhos, `do`, CTE, `execute`
  (fatos 11 a 15);
- (b) **os escritores do app**: os 17 pontos, a trilha e as 15 chamadas, `persistirTermo`, o colaborador inline, o tipo,
  as réguas e a catraca (fatos 16 a 19, 22 a 24);
- (c) **os scripts e o restaurar** (fatos 20 e 21);
- (d) **os leitores (a)–(d)** (fato 25);
- (e) **os roteiros**: o censo do fato 26, por arquivo, com as asserções contadas;
- (f) **a documentação oficial** (regra 6): PG 17 (`drop default`, `pg_stat_statements`), PostgREST (a lista de colunas do
  INSERT), supabase-js (o `Insert` gerado), Vercel (Skew Protection);
- (g) **os bancos, só leitura**: o "antes" (Frente A).

Escreva `docs/PLAN-F67C.md` antes de implementar. **A edição do banco e do app é sequencial** (as funções, o tipo, os
escritores e as réguas se cruzam). **A edição dos roteiros é a exceção**: cada roteiro é independente, então ela pode ser
dividida entre subagentes com conjuntos DISJUNTOS de arquivos (decisão 10), cada um devolvendo o diff resumido e a
contagem de asserções antes/depois, e um subagente revisor em contexto fresco confere cada diff procurando só mudança
fora das listas de colunas e valores dos INSERTs.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**. Eles leem
o código **pelo SHA** (nunca pela árvore de trabalho), contra o `PLAN-F67C.md` e os 25 critérios, com estas perguntas:
- Sobrou algum INSERT ou UPSERT numa das 20 sem `empresa_id` — no SQL vigente (gatilho, `do`, CTE, `execute`), no app
  (`.insert(variavel)`, client administrativo), nos scripts, no `restaurar.mjs`, nos roteiros?
- A empresa vem do lugar certo em cada escritor? Algum escritor com pai usa a da operação (o colaborador inline, a
  anotação, o lançamento, o apelido)? Algum sem pai usa um pai que não existe?
- Alguma das 18 mudou além da coluna, do valor e da leitura do pai? A assinatura mudou fora da decisão 3? A ACL ficou?
- O drop pode rodar antes do deploy por algum caminho? O app no ar quebra com a expansão aplicada?
- `registrarEventoAdmin`: alguma das 15 chamadas sem a empresa, ou com a empresa errada? A falha da trilha continua
  calada sem a causa nomeada?
- Os leitores (a)–(d): o `update motivos` ainda alcança duas empresas? Algum outro `update`/`delete` por chave natural
  ficou sem a empresa?
- A régua de leitura afrouxou em algum ponto ao virar "escrita obrigatória"?
- Nos roteiros: alguma asserção mudou? Alguma fixture mudou de empresa? Algum roteiro passou a provar menos?
- O `restaurar.mjs` restaura um backup de antes da F63 com a empresa certa? E o backup misto?
- O tipo exige a coluna no `Insert` das 20? Uma regeneração que reintroduza o `?` é pega?
- A janela mede por forma e por papel de app? A Skew Protection foi medida ou tratada como ligada?
- A vigília conta sem imprimir o `DETAIL`?
- Alguma sabotagem prova só o caminho feliz? Alguma evidência tem valor real de linha?
- Algum arquivo fora do escopo foi tocado (policies, Storage, `profiles`, workflow, o `CLAUDE.md` da raiz, o seed de duas
  empresas)?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado, não
preferências de estilo.** Corrija e re-revise até limpar. Se as passadas acharem bordas cada vez mais hipotéticas, pare e
registre a troca (o molde da F66B §13).

# Relatório final
`docs/RELATORIO-F67C.md`, em pt-BR, no padrão dos relatórios F45 a F67B, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, a contração (de qualquer lote), o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o
  caminho B completo, se o MCP faltou);
- **o comando de rollback do default** (o `set default` por lote, de `F67C-desfaz.sql`), sempre, para ele usar se uma
  tela der erro de empresa;
- depois da contração, entrar com a própria conta e fazer as operações do dia a dia, **sem nada destrutivo**: registrar
  uma movimentação; uma anotação na ficha de um ativo; um colaborador novo direto na movimentação; um lançamento de item;
  gerar um termo; e conferir que a Auditoria registrou o que é auditado. Cada uma tem de funcionar como antes; se uma der
  erro de empresa, o rollback acima;
- conferir `/api/saude` com `1.75.0` e, no dia seguinte, a Parte B do `saude.yml`, com a deriva limpa e as 13 checagens
  nos números travados;
- o `git diff v1.74.0 v1.75.0 --stat`, com o que deve e o que não deve aparecer;
- os lembretes: o próximo prompt é o da **F68** (a porta pública por empresa); o diagnóstico do #84 continua como entrega
  avulsa; o seed de duas empresas continua no backlog (16/11-4).

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas sete já conhecidas;
- as decisões do Johnny e as **vinte decisões** da fase;
- as tabelas-verdade dos escritores, dos leitores e das travas;
- os roteiros adaptados, com as asserções antes × depois;
- a janela (T0, T1, as formas por papel, a Skew Protection, a prova estática);
- a vigília (os `23502` contados, por lote);
- o conferidor e o smoke;
- as 13 checagens antes e depois;
- as sabotagens com saída real;
- a contagem final;
- os 25 critérios autoverificados;
- o estado de repouso: o que acontece se o projeto parar aqui por dois meses, inclusive com a contração de um lote
  pendente;
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que cada escritor RARO funciona em produção depois do drop (filial, motivo, tipo, kit, senha, apelido, vocabulário,
    errata): provado pelo tipo, pelas varreduras e pelo CI, e Δ 0 por ausência na janela;
  - que uma empresa que não é a WAP escreve em produção (não há segunda empresa nos bancos vivos; provado no CI);
  - que o import de uma empresa nova funciona de ponta a ponta (o vocabulário inicial dela é da F70);
  - nada sobre os dados do #84.

Pendências e **backlog nomeado**:
- **F68**: a senha de visualização por empresa (aqui ela grava a da operação);
- **F70**: cada `empresaDaOperacao()` desta fase vira a empresa da SESSÃO; o vocabulário inicial de uma empresa nova;
- **F71**: as frases do `CLAUDE.md` da raiz;
- **o seed com duas empresas** (16/11-4);
- **o diagnóstico do #84** (entrega avulsa); **os 3 `.docx` sem linha** (decisão do Johnny);
- **Backlog** (das fases anteriores, sem mudança): o conta a conta com as memberships desativadas; `database.ts`
  regenerado do banco (se a decisão 4 não o fez); os caminhos sem `.max()` e os pares de tetos da F66B;
  `movimentacoes.itens_faltantes`; o `savepoint` por linha na RPC do import; a paginação keyset; derrubar
  `profiles.papel`/`ativo`; o WARN `multiple_permissive_policies` de `pendencias_item`; a retenção dos backups antigos.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`empresa`, `escritor`, `pai`, `trilha`). Os nomes que a ficha e os roteiros fixam
  (`empresa_id`, `k_negocio`, `15b`) ficam como estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~20 minutos)

Esta fase **toca os dois bancos duas vezes**:
- **a expansão**, antes do merge: as 18 funções que gravam no acervo passam a dizer a empresa (troca de corpo, mesma
  assinatura — o app no ar nem percebe);
- **a contração**, depois do deploy: o default sai das 20 tabelas, lote a lote, só quando o app novo já estiver no ar e
  nenhuma gravação sem empresa aparecer numa janela de pelo menos 30 minutos. Depois de cada lote, o agente vigia os logs
  por erro de empresa; se aparecer um, ele devolve o default na hora.

Nada disso reescreve linha nem toca policy. Toda linha já tem a empresa da WAP, e continua tendo.

Este arquivo já está salvo em `docs/prompts/F67C-fim-do-default-ultracode.md`, **sem commit**. O agente o commita na
branch da fase. O prompt cita os 32 fatos do cabeçalho pelo número, então o arquivo precisa estar lá quando você colar o
bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.74.0, main em bdf3e23 (PR #98); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git status --short          # só deve aparecer docs/prompts/F67C-fim-do-default-ultracode.md
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

**O passo 5 é o que mais importa.** Dentro do Claude Code, confira:
- que o MCP lista `pbtjcalbmepmrqzprusb` (produção) e `sgmvldiizsrjbxzzpmhh` (ensaio);
- que **as ferramentas estão ligadas**: `execute_sql`, `apply_migration`, `list_migrations`, `get_advisors`, `get_logs` e
  `generate_typescript_types`;
- que o `execute_sql` funciona nos DOIS. Peça ao Claude Code um `select 1` em cada projeto. Hoje o conector do claude.ai
  respondeu nos dois (o `28P01` da F67B não se repetiu), mas o do Claude Code é outro. Sem ensaio, **nada vai a
  produção**: o agente entrega o PR aberto, sem merge, com o caminho B no topo do relatório.

**Mais cinco coisas que só você confere antes de colar:**

1. **A Skew Protection da Vercel**, em Project › Settings › Advanced. Se estiver **ligada**, uma aba aberta antes do
   deploy continua chamando o código velho (que ainda não manda a empresa) por um tempo. O agente mede e decide: ou a
   janela cresce, ou a contração fica para depois (repouso válido, com o comando pronto no relatório). Se você quiser a
   fase fechada no mesmo dia, desligue-a antes de colar o prompt e religue depois.
2. **A cota de Actions**, em github.com/settings/billing. As travas nascem vermelhas (um push a mais), os roteiros são
   35 adaptados, e o `banco-sem-docker` roda algumas vezes, mais o PR de documentação e a Parte B disparada à mão.
3. **Dentro do Claude Code:** `/permissions` (nada pode negar `git push`, `gh`, `node`, `npx tsx` nem as ferramentas do
   MCP da Supabase) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).
4. **Durante a run, use o sistema normalmente** — movimentações, anotações, termos. Isso até ajuda: a janela vê as
   gravações do app novo com a empresa. Só evite criar filial, motivo, tipo, kit ou senha de visualização entre o merge
   e o fim da run, e **recarregue as abas do sistema que você tiver abertas logo depois do deploy** (o agente avisa no
   relatório quando foi).
5. **O horário.** O `drop default` toma lock exclusivo por milissegundos em cada tabela (inclusive `movimentacoes`), e
   o `lock_timeout` de 2 s protege o app. A janela pede ≥ 30 min depois do deploy, e a vigília mais 30 min depois do
   último lote. Comece cedo o bastante para a run caber no dia, e evite a Parte B das 06:43.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f67c
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP em lotes nos dois bancos (em dois
momentos), lê logs, abre e mergeia PRs, publica tag, dispara workflow e roda o smoke e o conferidor. Nada disso cabe numa
allowlist estreita. `bypassPermissions` numa máquina com credencial de produção está fora de questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção, no `set default` de rollback, no
merge na `main`, no push da tag e no disparo da Parte B. Se barrar, o prompt manda não reformular: o agente registra,
segue no resto e põe o comando no topo do relatório. A contração pendente é estado de repouso válido.

**`--worktree` NÃO serve.** O smoke e o conferidor precisam do `.env.local`, que não vai para a worktree, e o prompt
proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** Parecido com a F67B na parte de banco, e maior na parte mecânica: os 705 INSERTs dos roteiros são o grosso,
e o prompt manda dividi-los entre subagentes e revisar cada diff. A revisão adversarial ("sobrou escritor sem
empresa?", "a empresa vem do pai certo?") é onde o modelo forte rende. Se a cota semanal estiver apertada, use
`$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`: os subagentes que editam roteiros são os que mais gastam,
e o trabalho deles é mecânico.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F67C.md existe com as tabelas-verdade dos escritores, dos leitores e das travas; package.json em 1.75.0; docs/RELATORIO-F67C.md existe com o comando de rollback do default no topo; a ficha F67C do PLANO-MULTIEMPRESA esta reescrita; e UM destes desfechos: (a) o PR da fase e o PR de documentacao mergeados com verificar e banco-sem-docker verdes, a expansao 0200+ aplicada no ensaio e em producao, as 13 checagens iguais aos numeros travados, 0 linhas fora da legada, o conferidor com 0 recusadas e o smoke sem falha, a janela sem chamada nova em forma de INSERT sem empresa_id, a contracao aplicada em producao nos tres lotes, a vigilia com 0 erros 23502 em empresa_id, nenhuma das 20 colunas com default nos dois bancos, a Parte B com os mesmos numeros e a tag v1.75.0 publicada; (b) a contracao de algum lote pendente porque a janela nao fechou ou a Skew Protection pede mais tempo: PR de documentacao com o comando e a condicao no topo do docs/RELATORIO-F67C.md; (c) um 23502 na vigilia: o set default daquele lote aplicado (ou, se barrado, o comando no topo), a causa e o escritor esquecido no topo do docs/RELATORIO-F67C.md; (d) o apply de producao nao aconteceu (classificador ou lock): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F67C.md; (e) sem MCP da Supabase ou sem acesso ao ensaio: PR aberto sem merge, com o caminho B no topo do docs/RELATORIO-F67C.md; (f) uma checagem, o conferidor ou o smoke reprovaram depois de um apply: rollback aplicado (ou o comando no topo), PR sem merge e a causa no topo do docs/RELATORIO-F67C.md; ou (g) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F67C.md
```

**Headless.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f67c.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f67c.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f67c.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. Esta fase aplica em
produção em dois momentos, espera uma janela e uma vigília, então **prefira a sessão interativa deixada rodando, com o
`/goal`**, e com a suspensão do Windows desligada no plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Seis momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F67C.md` com a tabela dos escritores (cada tabela, cada escritor, de onde vem a empresa) e
   `docs/f67c-evidencias/antes/` com os defaults, as formas de INSERT, as 13 checagens e a Skew Protection. Só números,
   nomes de esquema e hashes. **Se aparecer um nome, um e-mail, um patrimônio ou uma linha de erro com valores ali,
   interrompa a sessão.**
2. **As travas vermelhas.** 15b/15e invertidas, as varreduras de escrita, a trava do tipo — antes de qualquer migration.
3. **Os roteiros.** O censo por arquivo e, depois, a conferência "asserções antes = depois" de cada um dos 35.
4. **O ensaio.** A expansão, a contração e a prova viva da escrita (o INSERT sem empresa recusado nas 20).
5. **O merge, o deploy e a janela.** `/api/saude` em `1.75.0`, e depois ≥ 30 min contando gravações sem empresa (tem
   de dar zero). **Recarregue as abas do sistema que você tiver abertas.**
6. **A contração e a vigília.** Lote a lote; se aparecer um erro de empresa, o agente devolve o default daquele lote na
   hora, e o relatório diz qual escritor ficou para trás.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.** O comando de rollback do default fica lá de qualquer jeito.
2. Entre com a sua conta em produção e faça as operações do dia a dia, **sem nada destrutivo**:
   - registrar uma movimentação (entrega ou devolução);
   - uma anotação na ficha de um ativo;
   - um colaborador novo direto na movimentação;
   - um lançamento de item;
   - gerar um termo;
   - a Auditoria mostrando o que você fez de administrativo.

   Tudo tem de funcionar como antes. Se uma tela der erro falando de empresa, rode o rollback do topo do relatório e me
   traga o relatório.
3. `git diff v1.74.0 v1.75.0 --stat`. Devem aparecer:
   - `supabase/migrations/0200_*` em diante (as contrações por último), `supabase/migrations.lock.json`,
     `supabase/rollback/F67C-desfaz.sql`;
   - `supabase/tests/`: `catalogo_policies.sql`, `f67c_rollback.sql`, o roteiro da escrita por empresa, `restauracao.sql`
     e os 35 roteiros adaptados (só listas de colunas e valores), cada um explicado no relatório;
   - `src/lib/types/database.ts`, os 17 escritores, `src/lib/auditoria-registro.ts`, os leitores (a)–(d),
     `src/lib/supabase/erros-do-banco.ts`, as travas de mesa;
   - `scripts/seed.ts`, `scripts/import/carga.ts`, `scripts/smoke/{persona,fixtures-passe2}.ts`,
     `scripts/manutencao/gerar-errata-truncamento.ts`, `scripts/db/restaurar.mjs`, `scripts/db/mutacoes.mjs`,
     `registry.ts`, `package.json`, `CHANGELOG.md`, `docs/**`.

   **Não** devem aparecer:
   - migration antiga alterada; policy nova ou reescrita;
   - `scripts/smoke/linha-de-base.json` com número que SUBIU;
   - o `CLAUDE.md` da raiz, `.github/workflows/**`, mudança de dependência no `package-lock.json`;
   - um seed com duas empresas (16/11-4).
4. Abra `docs/f67c-evidencias/`: a janela (T0, T1), a vigília, o conferidor, as 13 checagens e a saída das sabotagens.
5. Confira no `PLANO-MULTIEMPRESA.md` a ficha F67C reescrita e a **F68**: é dela o próximo prompt.
6. Rode você mesmo `npm run test` uma vez.
7. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **Suas duas escolhas de hoje viraram as decisões 16/11-3 e 16/11-4**: uma run em lotes (acervo → vocabulário e
   registros → `filiais`), e o seed só passando a empresa de hoje. Conto como parte do mesmo comando o `onConflict` do
   upsert de colaboradores no seed (`'nome_chave'` → `'empresa_id,nome_chave'`): sem ele o seed nem roda; as duas
   empresas, as seis tabelas e o `seed.test.ts` ficam no backlog.
2. **A empresa vem do PAI, não de um parâmetro novo, nas 18 funções.** Assim elas trocam de corpo sem trocar de
   assinatura, e o app no ar nem percebe a expansão. A única exceção possível é a trilha da ferramenta de órfão da F67B
   (`registrar_limpeza_termos_sem_linha`), que não tem pai: proponho que ela receba a empresa da operação, no molde da
   F67.
3. **Descartei um gatilho que preencha a empresa sozinho.** Seria o default com outro nome, e o tipo gerado exige a
   coluna no `Insert` de qualquer jeito. A escrita diz a empresa, como a ficha manda.
4. **O tipo vira a trava do app.** `empresa_id` passa a ser obrigatório no `Insert` das 20 em `database.ts`: um INSERT
   sem empresa deixa de compilar. Os scripts, que não usam o tipo, ficam com uma varredura.
5. **Apliquei as decisões herdadas:** "dev sou só eu", **expandir e contrair com zero janela** (aqui: os escritores
   primeiro, o default por último, depois do deploy), **os números do #84 travados**, e a regra da F67 (a empresa da
   filial quando há filial, senão a da operação; a trilha grava a empresa ALVO).
6. **O colaborador criado dentro de uma movimentação nasce na empresa da FILIAL dela**, não na da operação. Com uma
   empresa só dá no mesmo; com duas, o contrário seria recusado pelo banco.
7. **O agente aplica no ensaio E em produção** (a expansão antes do merge, a contração depois do deploy), pelo MCP. É o
   fluxo das F53 a F67B, não decisão nova sua. Ele **não escreve nada em produção para provar**, nem dentro de bloco
   desfeito: a prova viva da escrita é o CI, o ensaio, a janela, a vigília e as suas operações do dia a dia depois.
8. **Se a Skew Protection estiver ligada e o agente não puder esperar o tempo dela**, a contração fica pendente, com o
   comando pronto. Prefiro isso a tirar o default enquanto uma aba velha ainda pode gravar sem empresa.
9. **Os números de banco do cabeçalho foram medidos hoje pelo conector do claude.ai**, nos dois bancos, só contagens,
   catálogo e configurações (nenhum valor de linha). Na pergunta eu disse "18 pontos de INSERT no app": a contagem
   correta é **17** (fato 16). O agente remede tudo.

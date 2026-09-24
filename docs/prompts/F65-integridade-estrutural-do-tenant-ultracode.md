# F65 — Integridade estrutural do tenant

Ordem de serviço da fase **F65** do `PLANO-MULTIEMPRESA.md` (§7), a quarta da virada. A fase monta a camada que
**sobrevive à falha da RLS**: o banco passa a recusar sozinho o dado cruzado entre empresas, sem depender de policy
nenhuma.

Ela entrega três coisas:
- **as relações entre tabelas de negócio passam a carregar a empresa**. As 23 FKs simples viram FKs compostas
  `(empresa_id, x) → (empresa_id, id)`, e os sete pais que ainda não têm `unique (empresa_id, id)` o ganham. A PK de
  `motivos` vira `(empresa_id, codigo)`, e as três PKs naturais do vocabulário do import também;
- **as unicidades de negócio passam a valer por empresa**, com os nomes preservados. Inclui a do snapshot semanal e a
  chave `chaveVersao`, que a F57 deixou travada esperando esta fase;
- **o `empresa_id` de uma linha de negócio não muda nunca mais**. `guarda_empresa()` recusa com 42501, sem exceção,
  nem na janela destrutiva.

Duas condições não se negociam, herdadas da F63 e da F64:
- **Nenhuma linha é reescrita.** Constraint, índice e gatilho entram sem tocar tupla. A prova, nas 20 tabelas de
  `k_negocio` e nos dois bancos, é o `relfilenode` e o md5 de `(pk, xmin)` iguais antes e depois.
- **Nada lê a coluna para recortar.** O recorte é da F66. As leituras de `empresa_id` que esta fase cria são de
  INTEGRIDADE ou de IDENTIDADE de chave, e cada uma entra como exceção nominal, com o motivo.

**As três decisões do Johnny (23/09/2026) mudam a ficha em três pontos:**
1. **Os índices de lista liderados por `empresa_id` vão para a F66.** Até lá nenhuma consulta iguala `empresa_id`, e
   no PG 17, que não tem skip scan, um índice com a coluna na frente não serve o `ORDER BY` de hoje. A F65 cria só os
   índices que a integridade exige: os `(empresa_id, id)` e os uniques por empresa.
2. **`guarda_empresa()` entra em toda tabela de negócio**, com a lista lida do catálogo e uma trava que reprova tabela
   nova sem ela. Não fica restrita às quatro da ficha.
3. **O seed com duas empresas fictícias sai da F65** e vai para o backlog nomeado. O seed não roda em banco nenhum, e o
   `isolamento_tenant.sql` já monta A↔B dentro do roteiro.

Depois dela vem a F66, as policies ganhando o recorte em conjunção.

---

## Estado de partida: os 28 fatos medidos no disco, no git e nos dois bancos (23/09/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje contra a árvore e o git, e contra o catálogo e as tabelas
> de PRODUÇÃO e do ENSAIO pelo MCP da Supabase, só leitura e só contagem. **Não** foram copiados da ficha, que é de
> 04/09 (v1.49.1), anterior às F45→F64. Onde divergem dela, a divergência está marcada com ⚠. O prompt manda o agente
> **remedir antes de aceitar**.

**Onde o projeto parou**

1. `main` em **`469632b`** (merge do PR #76, o fecho de documentação da F64), com a tag anotada **`v1.69.0`** nesse
   commit; `package.json` em `1.69.0`; árvore limpa.
   - Última migration: **`0164_kit_motivo_da_empresa.sql`**. São 163 arquivos, `0001`→`0164`, e a `0029` é gap real.
   - O ledger dos dois bancos termina em `kit_motivo_da_empresa`: produção com 148 linhas, ensaio com 161 (a
     divergência histórica do `RUNBOOK-BANCO.md`).
   - Produção `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh` estão `ACTIVE_HEALTHY`, Postgres **17.6**.
   - ⚠ A ficha lista `0151`–`0155`, números gastos pela F60/F62. **A primeira desta fase é a `0165`.** Versão da fase:
     **`1.70.0`**. Os checks obrigatórios da `main` são **`verificar`** e **`banco-sem-docker`**.
2. **A rede de hoje** (o fecho da F64):
   - 254 arquivos de teste com 7.693 testes;
   - 46 roteiros SQL, 1.045 asserções, 0 ✗;
   - injetor em **138/138**, no teto, com 2 em quarentena;
   - `db:types:diff` em 38 relações · 358 colunas · 94 funções;
   - `k_negocio`/`k_infra`/`k_sem_select`/`k_lote1`/`k_lote2` em **20/9/6/8/11**, mais `k_leitura_integridade`
     (2 funções) e `k_tabelas_leitura_kit` (2 tabelas);
   - 62 policies vivas (`public` 54 · Storage 8);
   - paridade nas 11 classes: 350 colunas · 137 constraints · 7 enums · 103 funções · 103 grants · 98 índices ·
     54 + 8 policies · 28 flags de RLS · 11 gatilhos · 9 views.
3. **Os advisors de produção, medidos hoje:**
   - **segurança**: 6 INFO `rls_enabled_no_policy` · 34 WARN de definer executável por `authenticated` · 1 WARN de
     senha vazada (Auth). É o mesmo número do fecho da F64;
   - **performance**: 31 INFO `unindexed_foreign_keys` (18 delas são `*_empresa_id_fkey`) · 1 INFO `no_primary_key`
     (`_bkp_relatorios_gerados_f6a`) · 8 INFO `unused_index` · 1 WARN `multiple_permissive_policies` (`pendencias_item`,
     UPDATE).
   - ⚠ FK composta cujas colunas não são prefixo de um índice **soma** em `unindexed_foreign_keys`. O delta é esperado e
     vai declarado. A decisão 1 do Johnny vale aqui também: não se cria índice só para calar o lint.

**As relações (catálogo de produção; o ensaio tem as mesmas 63 FKs e os mesmos 98 índices)**

4. **63 FKs em `public`.** Destas, **23 ligam duas tabelas de `k_negocio`**. Todas são simples, validadas, `MATCH
   SIMPLE`, `ON DELETE NO ACTION` e `ON UPDATE NO ACTION`. Na tabela, o nome completo é `<filho>` + o sufixo:

   | filho | FK (nome) → pai |
   |---|---|
   | `ativos` | `ativos_filial_id_fkey` → `filiais` · `ativos_substitui_ativo_id_fkey` → `ativos` |
   | `movimentacoes` | `_ativo_id_fkey` → `ativos` · `_colaborador_id_fkey` → `colaboradores` · `_estorno_de_fkey` → `movimentacoes` · `_filial_id_fkey` → `filiais` · `_filial_destino_id_fkey` → `filiais` · `_motivo_fkey` → `motivos(codigo)` |
   | `lancamentos_item` | `_colaborador_id_fkey` → `colaboradores` · `_estorna_id_fkey` → `lancamentos_item` · `_filial_id_fkey` → `filiais` · `_item_id_fkey` → `itens` · `_movimentacao_id_fkey` → `movimentacoes` · `_pendencia_item_id_fkey` → `pendencias_item` |
   | `pendencias_item` | `_ativo_id_fkey` → `ativos` · `_filial_id_fkey` → `filiais` · `_movimentacao_id_fkey` → `movimentacoes` |
   | `anotacoes` | `_ativo_id_fkey` → `ativos` |
   | `colaboradores` | `_filial_id_fkey` → `filiais` |
   | `itens` | `_tipo_id_fkey` → `tipos_item` |
   | `relatorios_gerados` | `_filial_id_fkey` → `filiais` |
   | `import_logs` | `_filial_id_fkey` → `filiais` |
   | `unidades_apelidos` | `_filial_id_fkey` → `filiais` |

   As outras 40 FKs apontam para `empresas` (a raiz: ficam simples), para `profiles` (identidade da conta, não de
   negócio: ficam simples) ou são as da F62 em `operador_filiais` e `membros`.
   - ⚠ **A ficha erra em três pontos.**
     - Ela lista `ativos (unidade, tipo, colaborador, antecessor)`, mas `ativos` **não tem** FK de tipo
       (`categoria` é o enum `categoria_ativo`) nem de colaborador (`colaborador_atual` é texto). São duas FKs, não
       quatro.
     - `termos_gerados` **não tem FK nenhuma**: `movimentacao_ids` e `ativo_ids` são `uuid[]`, e FK não alcança array
       (fato 16).
     - `membros` é o vínculo-raiz, e sua FK para `empresas` fica simples.
   - ⚠ **A F62 deixou duas relações em `operador_filiais` → `filiais`**: a simples `operador_filiais_filial_id_fkey`
     (`ON DELETE RESTRICT`) ao lado da composta `operador_filiais_filial_da_empresa_fk`. Ninguém embute por ela hoje.
5. **Os pais.** As 23 FKs apontam para nove pais.
   - `filiais` já tem `filiais_empresa_id_uidx`, que é `unique (empresa_id, id)`, desde a F62. `membros` também tem o
     seu.
   - **Sete não têm:** `ativos`, `movimentacoes`, `lancamentos_item`, `pendencias_item`, `colaboradores`, `itens` e
     `tipos_item`.
   - `motivos` tem PK natural (`codigo`), e o alvo da FK composta é a PK nova, `(empresa_id, codigo)`.
   - ⚠ A ficha fala em "~11 tabelas que podem ser pai". Medido: são **sete novas mais `motivos`**.
6. **⚠ O MAIOR RISCO DA FASE: os embeds do PostgREST.** O app embute recursos pelas FKs.
   - **Sete FKs de negócio são citadas pelo NOME** como dica (`!nome_da_fkey`), em `src/lib/queries/formas/**` e
     `src/lib/queries/relatorios/estoque.ts`: `movimentacoes_ativo_id_fkey`, `movimentacoes_filial_id_fkey`,
     `movimentacoes_filial_destino_id_fkey`, `movimentacoes_motivo_fkey`, `lancamentos_item_item_id_fkey`,
     `lancamentos_item_filial_id_fkey` e `relatorios_gerados_filial_id_fkey`.
   - **Há ~25 embeds SEM dica** entre tabelas de negócio. Exemplos: `filiais(nome)` a partir de `ativos` e de
     `import_logs`; `ativos!inner(…)` a partir de `movimentacoes`; `itens!inner(tipo_id, tipos_item(…))`;
     `movimentacoes!inner(ativo_id)` a partir de `lancamentos_item`; e os reversos `movimentacoes(…)` e
     `lancamentos_item(…)` a partir de `colaboradores` e de `itens`.
   - **O que isso quer dizer:**
     - FK simples derrubada e composta nascendo com OUTRO nome → o embed com dica quebra (PGRST200).
     - Composta ACRESCENTADA ao lado da simples → todo embed sem dica entre aquele par vira ambíguo (PGRST201).
     - Nos dois casos, a quebra acontece **no instante em que o cache de esquema recarrega, com o app VELHO no ar,
       antes do deploy**.
   - A única forma que preserva as duas coisas: **cada FK simples é SUBSTITUÍDA, na mesma migration, pela composta de
     MESMO NOME**, com as mesmas ações.
   - Confirme na documentação do PostgREST (Context7) o embed por FK composta e a regra de ambiguidade antes de
     escrever a primeira FK (regra 6).
7. **Os uniques globais de hoje** (a lista medida, com a forma e quem depende do nome):

   | índice / constraint | forma | quem depende |
   |---|---|---|
   | `filiais_slug_key` | constraint `unique (slug)` | `CONSTRAINTS_TRADUZIDAS` (`unique-implicita`) |
   | `filiais_nome_chave_uidx` | **expressão** `(vocabulario_chave(nome))` | `CONSTRAINTS_TRADUZIDAS` |
   | `tipos_item_slug_key` | constraint `unique (slug)` | `CONSTRAINTS_TRADUZIDAS` (`unique-implicita`) |
   | `itens_nome_chave_uidx` | `(nome_chave)` | `CONSTRAINTS_TRADUZIDAS` |
   | `colaboradores_nome_chave_uidx` | `(nome_chave)` | `CONSTRAINTS_TRADUZIDAS` + o **`ON CONFLICT`** do fato 10 |
   | `kits_modelos_nome_uidx` | **expressão** `(lower(nome))` | `CONSTRAINTS_TRADUZIDAS` |
   | `unidades_apelidos_apelido_chave_uidx` | `(apelido_chave)` | `CONSTRAINTS_TRADUZIDAS` |
   | `motivos_pkey` | PK `(codigo)` | a FK de `movimentacoes` (fato 11) |
   | `import_prefixos_patrimonio_pkey` | PK `(prefixo)` | — |
   | `import_termos_categoria_pkey` | PK `(termo)` | — |
   | `import_termos_estado_pkey` | PK `(termo)` | — |
   | `import_termos_categoria_categoria_rotulo_uidx` | **parcial** `(categoria) where rotulo is not null` | — |
   | `import_termos_estado_estado_rotulo_uidx` | **parcial** `(estado) where rotulo is not null` | — |
   | o snapshot (fato 8) | dois | `ehViolacaoDeVersao`, `chaveVersao` |

   - ⚠ **Onde a ficha diverge do banco:**
     - `itens (lower(nome))` **não existe** mais: a `0147` o derrubou (comentário em `CONSTRAINTS_TRADUZIDAS`).
     - A ficha esquece `filiais_nome_chave_uidx` e `unidades_apelidos_apelido_chave_uidx` (o "Para a F65" do
       `RELATORIO-F56.md`) e as PKs naturais do import (decisão 2 da F64).
     - Nenhuma nota cita os dois **parciais** do vocabulário do import.
     - São **três** os uniques de expressão (`indkey[k] = 0`), não dois: `filiais_nome_chave_uidx`,
       `kits_modelos_nome_uidx` e o do snapshot.
   - **Ficam como estão**, porque já são por tenant de forma implícita (a chave carrega um id ou uuid global):
     - `ativos_patrimonio_service_tag_uidx` e `ativos_service_tag_sem_patrimonio_uidx` (`filial_id`, desde a `0091`);
     - `termos_gerados_tipo_movimentacao_ids_key` (`uuid[]`);
     - `movimentacoes_ordem_uidx` (identidade global de inserção, F53);
     - `lanc_item_estorna_uidx`;
     - `operador_filiais_usuario_filial_uidx` e os de `membros`;
     - toda PK em `id`.
   - **Globais de propósito:** `empresas_slug_uidx`. **Infra:** `senha_tentativas_pkey`, `ambiente_pkey` e
     `backups_migration_par_uidx`.
8. **⚠ O snapshot tem DOIS uniques.**
   - `relatorios_gerados_periodo_de_periodo_ate_filial_id_versao_key` vem da `0010`. Ele é inofensivo entre empresas:
     `filial_id` é id global, e NULL não colide com NULL.
   - `relatorios_gerados_periodo_filial_versao_uidx` vem da `0013`: é expressão com `coalesce(filial_id, -1)`. **É ele o
     defeito:** a partir da segunda empresa, só a primeira a gerar o consolidado da semana consegue.
   - `ehViolacaoDeVersao` (`src/lib/relatorios/versao-snapshot.ts:38-48`) casa o `23505` ou o **NOME** do índice da
     `0013`. `chaveVersao` (`:64`) é `periodo_de|periodo_ate|filial`, sem empresa.
   - `src/lib/queries/gerados.ts:164` lê `periodo_de, periodo_ate, filial_id, versao` sem recorte e chama `chaveVersao`
     em `:172` e `:189`. **Pôr a empresa na chave exige que `gerados.ts` SELECIONE `empresa_id` de `relatorios_gerados`.**
     É a primeira leitura TS da coluna antes da F66, e entra como exceção nominal: identidade da chave, não recorte.
   - `src/lib/relatorios/chave-versao-sql.test.ts` lê a `0010` e a `0013` do disco.
9. **Os nomes são contrato.**
   - `CONSTRAINTS_TRADUZIDAS` (`src/lib/supabase/erros-do-banco.ts:52-81`) traduz o `23505` **pelo NOME** do índice ou
     da constraint.
   - `src/lib/supabase/erros-do-banco-sql.test.ts` confere que cada nome existe no esquema que as migrations produzem.
   - Renomear mata a tradução em silêncio (a armadilha que a `0091:61-65` registrou).
   - No Postgres, o nome de índice é único no schema. "Criar o novo antes de derrubar o antigo" exige, na mesma
     migration: nome provisório, `drop` do antigo e `alter index … rename` (ou `alter table … rename constraint`).
   - `filiais_slug_key` e `tipos_item_slug_key` estão hoje tipados como `unique-implicita`. Recriados por extenso, o
     tipo muda.
10. **⚠ O ÚNICO `ON CONFLICT` QUE A FASE QUEBRA.** `src/lib/actions/colaboradores.ts:299-308` (`consolidarColaboradores`)
    faz `.upsert(…, { onConflict: 'nome_chave', ignoreDuplicates: true })`.
    - No instante em que `colaboradores_nome_chave_uidx` virar `(empresa_id, nome_chave)`, `ON CONFLICT (nome_chave)`
      não tem mais unique para inferir e falha com **42P10**.
    - Falha no app VELHO, que fica no ar entre o apply e o deploy (~8 min na F64), e falha no novo se o TS não mudar.
    - `scripts/seed.ts:886` tem o mesmo (o seed está fora: decisão 3).
    - As funções SQL vivas só têm `on conflict (empresa_id, membro_id, filial_id)` e `on conflict (ip)`, que a fase não
      toca.

**`motivos` e o vocabulário do import (a decisão 2 da F64)**

11. **`motivos`**: PK `motivos_pkey (codigo)`, 14 linhas em produção e 13 no ensaio.
    - A FK `movimentacoes_motivo_fkey (motivo) → motivos(codigo)` é citada por nome em dois embeds
      (`formas/relatorios.ts:156` e `formas/termos.ts:96`).
    - **A PK só cai depois da FK.** `drop constraint` da PK com FK dependente falha sem `cascade`, e `cascade` torna a
      migration DESTRUTIVA para o classificador.
    - O trio vai numa migration SÓ: derrubar a FK, trocar a PK e criar a FK composta com o MESMO nome. A ficha F64
      avisa: errar ali é recusa de INSERT na tabela mais quente.
    - **Os leitores por código sozinho continuam certos com uma empresa:** `admin.ts:761-763` (`.eq('codigo', …)`), os
      joins por código de `rel_por_motivo_filiais`/`rel_resumo_filiais`, e o gatilho do kit (F64), que já lê
      `(codigo, empresa_id)`. Com duas empresas o join por código fica errado. Isso é backlog da F66/F67, não da F65.
12. **O vocabulário do import:**
    - `import_prefixos_patrimonio (prefixo)`: 7 · 7 linhas;
    - `import_termos_categoria (termo)`: 5 · 5;
    - `import_termos_estado (termo)`: 17 · 17.

    São PKs naturais, sem FK dependente, mais os dois parciais do fato 7. Os leitores (a RPC de import da F56) procuram
    por termo ou prefixo sozinho. Estão certos com uma empresa; com duas, é a F67 (o import passa a receber a empresa).

**A imutabilidade do tenant**

13. **Os gatilhos de hoje nas tabelas de negócio:**
    - `guarda_acervo`: `BEFORE INSERT OR DELETE OR UPDATE` em `movimentacoes` e `lancamentos_item`. Recusa UPDATE com
      42501, **exceto com a janela `estoque.dev_destrutivo` aberta, quando deixa tudo passar**. Em `ativos` é só
      `BEFORE DELETE`;
    - `trg_aplicar_movimentacao`, `trg_valida_lancamento_item` e `kits_modelos_motivo_da_empresa` (F64);
    - as duas pontas de `vocabulario_unidades_guarda`;
    - `operador_filiais_deriva_membership`, `profiles_guarda_dev` e `membros_guarda_dev`.

    **Nenhum gatilho protege o `empresa_id` de nenhuma das 20.** A sabotagem E da F63 provou que `update ativos set
    empresa_id` passa. ⚠ E a janela abre `movimentacoes` e `lancamentos_item` ao UPDATE: dentro dela, só a FK composta
    segura o `empresa_id` delas, com 23503, não 42501.
14. **A transferência.** `aplicar_movimentacao` (definer, ignora policy) grava `ativos.filial_id` com o
    `filial_destino_id` que vem do formulário. Depois da F65, a FK composta `(empresa_id, filial_id) → filiais` já recusa
    filial de destino de outra empresa (23503). A guarda é a segunda linha, e é ela que dá 42501 com frase própria.

**A diagonal do vocabulário das unidades**

15. **`vocabulario_unidades_guarda`** (F56) é serializada por `pg_advisory_xact_lock(hashtext('vocabulario_unidades_guarda'))`,
    global. Ela confere a DIAGONAL nome × apelido, que nenhum índice cobre, **sobre todas as filiais do sistema**:
    `where vocabulario_chave(f.nome) = v_chave and f.id <> new.filial_id`, e `from unidades_apelidos where apelido_chave =
    v_chave`.
    - Com nome × nome e apelido × apelido por empresa e a diagonal global, a empresa B não consegue chamar uma filial de
      "Centro" se a A tem o apelido "centro".
    - **E a mensagem de erro cita a filial da OUTRA empresa** (`'… já é o nome da filial "%"'`, `v_outra.nome`). É
      vazamento entre tenants pela mensagem, e torna falsa a "unicidade de filial por empresa".
    - Corrigir exige ler `empresa_id` na função, como exceção nominal.

**`termos_gerados`**

16. **`termos_gerados`**: 123 linhas em produção, 2 no ensaio.
    - `movimentacao_ids uuid[]` e `ativo_ids uuid[]`, com índices GIN e o unique `(tipo, movimentacao_ids)`. **Nenhuma
      FK.** A FK composta da ficha é impossível por construção.
    - `termo_ancora_coerente(p_movimentacao_ids, p_ativo_ids)` (definer, usada por policy) confere a coerência entre os
      arrays, não a empresa.
    - Com a guarda (decisão 2), a linha não troca de empresa. O que fica aberto é um termo de A citar ids de B no INSERT
      ou no UPDATE dos arrays.
    - `persistirTermo` (`src/lib/actions/termos.ts:452`) reusa o id (UPDATE) num dos ramos.

**Os ids e as travas advisory**

17. **Os tipos dos ids:**
    - `filiais.id`, `itens.id` e `tipos_item.id` são `smallint generated always as identity`;
    - `unidades_apelidos.id` é `bigint identity`;
    - o resto é `uuid`.

    Os números queimados:
    - `itens`: 23 linhas, id máximo e sequência em 139;
    - `filiais`: 6 linhas, sequência em 20;
    - `tipos_item`: 10 linhas, sequência em 40.

    29 das 103 funções de `public` têm parâmetro `smallint`, e há 19 colunas `smallint` em `public`. Alargar o tipo
    reescreveria 19 colunas (`movimentacoes` e `ativos` entre elas) e 29 assinaturas: fora da escala da F65.
18. **As travas advisory.** São **14 chamadas em 12 funções**; a ficha diz 13.
    - `(int, int)` com `(item_id, filial)`: `criar_movimentacao_com_itens`, `estornar_movimentacao_com_itens`,
      `lancar_itens_lote`, `reabrir_pendencias_item_com_estornos`, `resolver_pendencias_item_com_lancamentos`,
      `transferir_item` e `valida_lancamento_item`;
    - `(hashtext('import_substituir'), filial)`: `importar_ativos_substituir`, `resetar_acervo` ×2 (uma com `-1` = todas)
      e `resetar_itens` ×2;
    - `(bigint)`: `hashtext('conflito_filiais_apagar')` em `apagar_ativos_conflito_filiais`, e
      `hashtext('vocabulario_unidades_guarda')`.

    **Enquanto os ids forem GLOBAIS** (identidade por tabela, não por empresa), o par `(3,1)` da A e o `(3,1)` da B não
    existem os dois. A colisão da ficha só acontece se os ids forem reescalados por empresa.

**A identidade do ativo (regra 2 do `CLAUDE.md`)**

19. ⚠ **O "pronto quando" da ficha contradiz o produto.** Ele diz que a mesma empresa não tem o par patrimônio + service
    tag em duas filiais.
    - `ativos_patrimonio_service_tag_uidx` é por FILIAL desde a `0091`.
    - A regra 2 do `CLAUDE.md` diz que o par que já existe em OUTRA filial não bloqueia o import: os dois cadastros
      coexistem e viram a pendência "conflito entre filiais" (F24). Só o cadastro manual e a edição recusam, pelo app.
    - A fase **não toca** nisso. O "pronto" correto é:
      - o mesmo par na mesma filial é recusado;
      - em duas empresas, coexiste;
      - em duas filiais da mesma empresa, o comportamento da F24 fica intacto.

**Os roteiros e a trava "ninguém lê"**

20. **Oito roteiros já criam uma segunda empresa:** `cargo_dev`, `cargo_equivalencia`, `catalogo_policies`,
    `empresa_no_acervo`, `empresa_no_vocabulario`, `isolamento_tenant`, `kit_motivo_da_empresa` e `restauracao`.
    - Fixture de B que insere filho SEM `empresa_id` explícito recebe a WAP pelo default e, a partir da F65, a FK composta
      a recusa (23503). O roteiro estava gravando uma incoerência que a FK agora vê.
    - Adaptar essa fixture (passando o `empresa_id` de B) é legítimo e vai no relatório, roteiro por roteiro. Mudar uma
      asserção para passar, não.
21. **A trava "ninguém lê"** tem três partes: `src/lib/validators/empresa-acervo-sem-leitura.test.ts`, o 15h de
    `catalogo_policies.sql` e `k_leitura_integridade`, com as duas exceções nominais da F64, por comando.
    - A F65 cria pelo menos cinco leitores legítimos novos: a função de `guarda_empresa`, o gatilho de `termos_gerados`
      (se a decisão 8 o criar), a diagonal do fato 15, `gerados.ts` (`chaveVersao`) e o
      `onConflict: 'empresa_id,nome_chave'` do fato 10.
    - Cada um entra como exceção nominal, com o motivo, na fonte única. A trava continua sendo "quem lê para recortar
      reprova".

**O apply, o método e a conferência (o molde da F64)**

22. **O `apply_migration` do MCP é ATÔMICO** (decisão 2 da F63), e o CI (`psql -f` sem `-1`) não é. Três consequências:
    - `create index concurrently` falha dentro da transação do MCP, e passaria no CI. **É proibido**: seria divergência
      entre o CI e o banco;
    - `not valid` + `validate` na MESMA migration não encurta lock nenhum, porque tudo fica preso até o commit. A
      separação só existe entre duas migrations;
    - a migration inteira segura os locks de todas as tabelas que toca até o commit. Agrupe por família e ordene pela
      ordem de lock do app (o molde F63/F64).

    Tamanhos: `movimentacoes` com 3.631 linhas (4,9 MB), `ativos` com 1.649 (2,2 MB), o resto abaixo de 0,4 MB. O
    `lock_timeout` segue em 2 s por `set`/`reset`, no máximo três tentativas em 30 minutos.
23. **O classificador** (`scripts/db/classificar-migration.mjs`):
    - `add constraint`, `drop constraint` e `drop index` sem `cascade`, `create index`, `create trigger` e `create or
      replace function` são ADITIVA. `cascade` é DESTRUTIVA;
    - o cabeçalho é obrigatório;
    - cada migration entra em `DA_F38` e em `migrations.lock.json`, e o nome sem prefixo não repete;
    - `db:lock` vai no mesmo commit.
24. **"Nenhuma tupla reescrita" continua provável.**
    - `add constraint` de FK, `unique` ou PK sobre colunas já `not null` não reescreve a tabela (confirme na doc do PG
      17).
    - O instrumento da F64 (`docs/f64-evidencias/impressao-vocabulario.sql`, com a PK lida do catálogo), estendido às 20,
      é o portão: `relfilenode`, md5 de `(pk, xmin)` e md5 do conteúdo iguais antes e depois.
    - Some a ele a impressão do catálogo (FKs, uniques, gatilhos, que é a única coisa que DEVE mudar) e **a contagem de
      violações medida ANTES**: por FK composta, filhos cujo par `(empresa_id, x)` não existe no pai; por unique por
      empresa, duplicatas. Tem de dar 0.
25. **ADR-003 + `RUNBOOK-BANCO.md`.**
    - O apply é pelo MCP, ensaio primeiro, com `name` = nome do arquivo sem `NNNN_`, e nenhuma migration toca banco real
      antes de o CI tê-la rodado.
    - **Proibidos:** `supabase db push`, `migration repair`, `db reset --linked` e reescrever `schema_migrations`.
    - A prova pós-apply tem grants, `notify pgrst, 'reload schema'`, `get_advisors(security)`, a paridade das 11
      classes, a sonda de exatidão da F64 (o texto aplicado igual ao do arquivo) e o smoke.
    - A sonda de deriva cobra em até 24 h.
    - Sem MCP, é o caminho B, e o PR não é mergeado.
26. **A conferência e as credenciais.**
    - `/api/saude` devolve `{ok, versao, commit, banco, ms}`.
    - `node scripts/smoke/smoke-prod.mjs` tem a referência *"109 OK · 1 aviso (kits_modelos) · 0 falha"*.
    - `gh workflow run saude.yml -f partes=b` dispara a Parte B.
    - **O conferidor de formas aceita o ENSAIO:** `NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local
      scripts/formas/conferir.mts --alvo=ensaio|producao --saida=…`. Na F64 deu 271 pontos · 100.530 linhas · 0
      recusadas. **A primeira prova de que nenhum embed quebrou vem do ensaio, logo depois do apply lá**, antes de
      produção.
    - O `.env.local` aponta para o ENSAIO e as `SMOKE_*` para PRODUÇÃO. Regra do `INVENTARIO-CREDENCIAIS.md` §9: **nunca
      abrir, filtrar nem imprimir o `.env.local`**. Ele só entra por `--env-file`.
27. **Os rollbacks encadeados** (R-ACC-90, `RUNBOOK-BANCO.md:501`): `supabase/rollback/F62-1-*`, `F62-2-*`, `F63-desfaz.sql`
    e `F64-desfaz.sql`, com `f62_rollback.sql`, `f63_rollback.sql` e `f64_rollback.sql`.
    - A F65 pendura constraints e gatilhos em colunas que os três rollbacks anteriores derrubam. **Os três roteiros de
      rollback têm de rodar o da F65 ANTES.**
    - O `F65-desfaz.sql` recria as FKs simples e os uniques globais **com os mesmos nomes**. Isso só é possível enquanto
      houver uma empresa: declare que, depois da F73, o rollback da F65 exige que o dado da segunda empresa já tenha saído.
28. **As regras do `CLAUDE.md` que pesam aqui** são a 1, a 2, a 3, a 5, a 6, a 7 e a 8.
    - A regra 6 pede documentação oficial antes de afirmar. No PostgreSQL 17:
      - os locks de `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`, `NOT VALID` e `VALIDATE CONSTRAINT`;
      - `ADD CONSTRAINT … UNIQUE/PRIMARY KEY USING INDEX`;
      - `ALTER INDEX … RENAME` e `RENAME CONSTRAINT`;
      - `CREATE INDEX CONCURRENTLY` dentro de bloco de transação;
      - a inferência do `ON CONFLICT`;
      - `CREATE TRIGGER … BEFORE UPDATE OF`;
      - `RAISE … USING ERRCODE`.

      No PostgREST: o embed, a FK composta e a desambiguação `!dica` (PGRST200/PGRST201).
    - A F64 mediu que o Context7 não indexa o PG 17; nesse caso, vá a `postgresql.org/docs/17`.
    - O molde de fechamento é o das F58→F64: um PR de código, com as migrations aplicadas no ensaio e em produção
      **antes** do merge; merge com os dois checks verdes; conferência pós-deploy; e um PR só de documentação que leva a
      tag.

---

## As três decisões do Johnny (23/09/2026)

1. **Os índices de lista liderados por `empresa_id` vão para a F66**, junto do predicado, medidos com `scripts/perf/medir.mjs`
   e `medir-rls.mjs`. Isso vale para `mov_created_idx`, `movimentacoes_ordem_lista_idx`, `lanc_item_created_idx`,
   `eventos_admin_quando_idx`, `import_logs_created_idx`, `(empresa_id, ordem)` e o `(empresa_id, updated_at desc, id)`
   de `/ativos`.
   - A F65 cria **só** os índices que a integridade exige: os que nascem com os `unique (empresa_id, id)` e com os
     uniques por empresa.
   - Motivo: índice sem consulta que o use é custo sem prova. Com a coluna na frente e sem igualdade sobre ela, o PG 17
     não o usa para ordenar, e derrubar o antigo no mesmo commit deixaria as listas quentes ordenando a frio até a F66.
   - **Desvio declarado** do "o antigo cai no MESMO commit" da ficha.
2. **`guarda_empresa()` entra em TODA tabela de negócio.** A lista é lida do catálogo (`k_negocio`), com trava que
   reprova tabela de negócio nova sem o gatilho.
   - É `BEFORE UPDATE OF empresa_id`, com custo zero no update normal.
   - Recusa com 42501 e frase própria, **sem exceção para a janela `estoque.dev_destrutivo`**.
   - **Desvio declarado** das "quatro tabelas" da ficha.
   - Ver o fato 13 sobre as duas que têm `guarda_acervo`.
3. **O seed com duas empresas fictícias e `scripts/seed.test.ts` saem da F65** e vão para o backlog nomeado (a fase
   que precisar de dado de demonstração, F70/F73).
   - Motivo: o seed não roda em banco nenhum (medido na F62), e a prova que ele daria (A↔B no CI) o
     `isolamento_tenant.sql` já dá.
   - O `onConflict: 'nome_chave'` de `scripts/seed.ts:886` vai junto para esse backlog.
   - **Desvio declarado** da nota F62 da ficha.

---

## As frentes, e por que nesta ordem

- **A — o censo e o "antes".** Antes de tocar qualquer banco: os 28 fatos remedidos, o `PLAN-F65.md`, a contagem de
  violações de cada FK composta e de cada unique por empresa (tem de dar 0), e **a impressão "antes" nas 20 tabelas e no
  catálogo, nos dois bancos**.
- **B — as travas, vermelhas.** As três de catálogo da ficha (a forma, a unicidade e a imutabilidade), a do snapshot e a
  da diagonal. Regra 4 da §4: trava antes da correção.
- **C — o banco.** Primeiro os pais, depois as FKs por família com o MESMO nome, depois `motivos` e o import, depois os
  uniques e o snapshot, e por último os gatilhos.
- **D — o TS.** A chave do snapshot, o `onConflict` dos colaboradores, os tipos de `CONSTRAINTS_TRADUZIDAS` e o
  `database.ts`.
- **E — os roteiros, os catálogos, o injetor e os rollbacks encadeados.**
- **F — os documentos.**
- **G — o fechamento, com ordem interna rígida.** Versão → revisão adversarial → SHA congelado → CI verde → apply no
  ensaio + impressão + **conferidor no ensaio** → apply em produção + impressão → smoke e conferidor → merge → deploy →
  (o passo pós-deploy do fato 10, se a decisão 5 o criar) → conferência → relatório → PR de documentação → tag.

---
## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F65 do `docs/PLANO-MULTIEMPRESA.md` (§7), a quarta da virada: a integridade estrutural do tenant, a
camada que faz o banco recusar dado cruzado entre empresas MESMO SEM policy. Ao terminar:
- as 23 FKs entre tabelas de negócio (fato 4) são COMPOSTAS, `(empresa_id, x) → (empresa_id, id)`, com o MESMO nome e
  as mesmas ações da FK simples que substituíram, validadas, e nenhum par de tabelas de negócio tem duas relações entre
  si (fato 6). Os sete pais sem `unique (empresa_id, id)` o ganharam (fato 5);
- a PK de `motivos` é `(empresa_id, codigo)`, trocada junto com a FK de `movimentacoes` numa migration só (fato 11). As
  três PKs naturais do vocabulário do import e os dois parciais delas são por empresa (fatos 7 e 12);
- toda unicidade de negócio da lista do fato 7 vale POR EMPRESA, com o nome contratual preservado. Isso inclui o
  unique do snapshot, com `chaveVersao` e `gerados.ts` carregando a empresa no mesmo commit (fato 8). Os que já são por
  tenant de forma implícita ficam, com o motivo escrito;
- `guarda_empresa()` recusa com 42501 qualquer mudança de `empresa_id` em toda tabela de negócio, inclusive com a
  janela destrutiva aberta (decisão 2 do Johnny);
- a diagonal nome × apelido é por empresa, e a mensagem dela não cita filial de outra empresa (fato 15);
- `termos_gerados` tem a integridade de empresa que a FK não alcança, na forma da decisão 8;
- nenhuma escrita do app vivo quebra na janela entre o apply e o deploy: nem embed (fato 6), nem `ON CONFLICT` (fato
  10);
- **nenhuma tupla foi reescrita e nada lê a coluna para recortar**;
- cada peça tem a trava que reprova a volta, e as três travas de catálogo da ficha são derivadas do catálogo.

Uma run, um PR de código e um PR de documentação com a tag. Versão `1.70.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1 e §3 (por que a integridade vem antes da policy);
  - §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 5, no-op primeiro;
    a 8, migration nunca se edita; a 10, a ORDEM de rollback);
  - a ficha **F65** no §7, com as notas F62 e F64. Ela é a FONTE DA VERDADE do escopo: onde esta ordem e ela
    divergirem sem declaração, vale a ficha;
  - as notas que empurram trabalho para cá: F53 (`(empresa_id, ordem)`), F57 (a trava de `chaveVersao`), F58 (o
    `erros.ts` enumerável), F63 e F64;
  - as fichas **F66**, **F67** e **F68**, para saber o que NÃO antecipar.
- `docs/prompts/F65-integridade-estrutural-do-tenant-ultracode.md`: o cabeçalho com os **28 fatos medidos** e as três
  decisões do Johnny. Este prompt os cita pelo número.
- `CLAUDE.md`, `AGENTS.md`, `supabase/CLAUDE.md` e `scripts/db/CLAUDE.md`: as regras permanentes, em especial a **1**,
  a **2**, a **3**, a **5**, a **6** (Context7 e a documentação oficial do PostgreSQL 17 e do PostgREST; o Context7
  não indexa o PG 17, então use `postgresql.org/docs/17`), a **7** e a **8**.
- **O molde imediato é a F64.** Leia `docs/RELATORIO-F64.md`, `docs/PLAN-F64.md` (§3, as onze decisões), a ata de
  2026-09-23 · F64 em `docs/DECISOES.md` e `docs/f64-evidencias/` (`impressao-vocabulario.sql`,
  `impressao-policies.sql`, `verificacao-pos-apply.sql` e `exatidao-pos-apply.sql`). Leia também os "Para a F65" de
  `docs/RELATORIO-F56.md`, `RELATORIO-F57.md`, `RELATORIO-F58.md`, `RELATORIO-F60.md` e `RELATORIO-F63.md`.
- `docs/ADR-003-metodo-de-migration.md`, `docs/RUNBOOK-BANCO.md` inteiro (os Anexos F63 e F64 e a ordem de rollback),
  `docs/MATRIZ-REGRAS.md` (R-ACC-29, R-ACC-68, R-ACC-77 a R-ACC-97) e `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e
  destinos, **nunca o `.env.local`**).
- O código, nesta ordem:
  - as migrations `0003`, `0010`, `0013`, `0014`, `0043`, `0081`, `0091`, `0112`, `0125`, `0139`/`0140` (o vocabulário
    da F56), `0147`, `0155`, `0156`, `0160`–`0164`;
  - `supabase/tests/catalogo_policies.sql` (os conjuntos, o bloco 5 e o 15h), `isolamento_tenant.sql` (a convenção de
    honestidade, regra 3: FK composta provada com o par simétrico), `empresa_no_vocabulario.sql`,
    `kit_motivo_da_empresa.sql`, `f62_rollback.sql`, `f63_rollback.sql`, `f64_rollback.sql`, `dev_destrutivo.sql`,
    `conflito_filiais.sql`, `vocabulario_import.sql` e `_asserts.sql`;
  - `src/lib/supabase/erros-do-banco.ts`, `erros-do-banco-sql.test.ts`, `casamento-por-texto.test.ts`,
    `src/lib/actions/erros.ts`, `src/lib/relatorios/versao-snapshot.ts`, `chave-versao-sql.test.ts`,
    `src/lib/queries/gerados.ts` e `src/lib/actions/colaboradores.ts`;
  - todo `src/lib/queries/formas/**` (os embeds do fato 6) e `src/lib/queries/relatorios/estoque.ts`;
  - `src/lib/validators/empresa-acervo-sem-leitura.test.ts`, `catalogos-seguranca.test.ts` (describes 5, 9, 12 e 13),
    `migrations-backfill.test.ts`, `rollback-f64.test.ts` e `src/lib/itens/migrations-f38.test.ts`;
  - `scripts/db/classificar-migration.mjs`, `mutacoes.mjs`, `mutacoes.test.mts`, `run-mutation-tests.mjs`,
    `corpo-vigente.mjs` e `diff-tipos.test.mts`;
  - `src/lib/actions/termos.ts` (`persistirTermo`) e a função `termo_ancora_coerente`;
  - `src/lib/types/database.ts`, `scripts/formas/conferir.mts`, `scripts/smoke/deriva-migrations.mjs`,
    `supabase/ci/impressao-schema.sql` e `.github/workflows/ci.yml` (só leitura).

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 28 fatos, medidos em 23/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco e os bancos de hoje antes de
agir. Onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o relatório. Os que
mais importam:
- **fato 1**: a primeira migration é a `0165`, não a `0151`;
- **fato 4**: são 23 FKs, e a ficha erra em `ativos` (sem tipo, sem colaborador) e em `termos_gerados` (sem FK);
- **fato 6**: os embeds do PostgREST, o maior risco da fase;
- **fato 7**: a lista real de uniques globais, com os dois parciais que nenhuma nota cita e os três de expressão;
- **fato 8**: os dois uniques do snapshot, e a leitura de `empresa_id` que a chave exige;
- **fato 10**: o `ON CONFLICT (nome_chave)` que quebra na janela;
- **fato 11**: a PK de `motivos` só cai depois da FK;
- **fato 13**: a janela destrutiva abre `movimentacoes`/`lancamentos_item`;
- **fato 15**: a diagonal global que vaza nome de filial;
- **fato 19**: o "pronto quando" que contradiz a regra 2;
- **fato 22**: o apply atômico, que proíbe `concurrently` e esvazia `not valid` na mesma migration.

## Comandos que já existem: use, não reinvente
- `npm run lint` · `npm run test` · `npm run typecheck` (= `npx tsc --noEmit`) · `npm run build` · `npm run contraste` ·
  `npm run verificar:actions`.
- `npm run db:lock`, obrigatório no commit de cada migration.
- `node scripts/db/classificar-migration.mjs` (e `--censo`).
- `npm run db:test`, `npm run db:test:mutations` e `npm run db:types:diff` precisam de Postgres e rodam no job
  `banco-sem-docker`. Na mesa, só se houver um Postgres 17 descartável que não seja nenhum dos dois bancos vivos.
- Na Frente G: `node scripts/smoke/smoke-prod.mjs` e `NODE_OPTIONS=--conditions=react-server npx tsx
  --env-file=.env.local scripts/formas/conferir.mts --alvo=ensaio|producao --saida=docs/f65-evidencias/…` (fato 26).
- O MCP da Supabase: `list_projects`, `execute_sql` (só leitura), `apply_migration`, `list_migrations`, `get_advisors`
  (segurança E performance) e `generate_typescript_types`.

**Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`; **não rode** `supabase db push`, `migration
repair` nem `db reset --linked`; **não suba** `next dev`/`next start` contra o ensaio.

# Escopo

## Dentro: sete frentes, nesta ordem

### Frente A: o censo e o "antes"
O primeiro entregável é `docs/PLAN-F65.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`.
- **Os 28 fatos remedidos**, cada divergência contra a ficha anotada.
- **O censo dos consumidores**: todo embed (com e sem dica) entre tabelas de negócio em `src/**` e `scripts/**`; todo
  `onConflict`/`upsert`/`on conflict`; todo `.single()`/`.maybeSingle()` sobre chave natural que deixa de ser única
  (`codigo`, `slug`, `termo`, `prefixo`, `nome_chave`); todo leitor SQL por chave natural sozinha (fatos 11 e 12). Para
  cada um: continua certo com uma empresa? Quebra na janela? É backlog de qual fase?
- **O desenho**, com as decisões 1 a 14 de "Autonomia" tomadas por escrito.
- **A ordem das migrations e a ORDEM DE ROLLBACK** (o inverso do apply), escrita também no rodapé de cada migration.
- **A contagem de violações, nos DOIS bancos, antes de qualquer apply**, pelo MCP, só contagem. Tem de dar 0:
  - para cada uma das 23 FKs compostas, os filhos cujo `(empresa_id, x)` não existe no pai;
  - para cada unique por empresa, as duplicatas;
  - para `termos_gerados`, os ids dos arrays cuja empresa difere da do termo.

  Se der mais que 0, **pare antes do apply**: é dado incoerente que nenhuma migration conserta em silêncio. Registre
  no topo do relatório e siga no que não depende do banco.
- **A impressão "antes"**, nos DOIS bancos, pelo MCP, só leitura, antes de qualquer apply, em
  `docs/f65-evidencias/antes/`. Duas partes, cada uma com o MESMO texto antes e depois:
  - **as linhas**: `docs/f65-evidencias/impressao-tenant.sql`, derivado de `impressao-vocabulario.sql` da F64 e
    estendido às **20** tabelas de `k_negocio`. Para cada uma: `count(*)`, `pg_relation_filenode()`, o md5 de `(pk,
    xmin)` com a PK LIDA DO CATÁLOGO (atenção: a PK de `motivos` e das três do import MUDA na fase; o instrumento
    precisa ordenar por uma chave estável, antes e depois, e dizer qual), o md5 do conteúdo e, em produção, a
    atividade da janela a partir do `pg_current_xact_id()` gravado no "antes";
  - **o catálogo**: `docs/f65-evidencias/impressao-catalogo.sql`, com toda FK, unique, PK e gatilho das 20 (nome,
    `pg_get_constraintdef`/`pg_get_indexdef`, ações, `convalidated`), o md5 do `prosrc` das funções que a fase NÃO
    pode tocar, e as 62 policies (reuse `impressao-policies.sql`).

  Junto vão os advisors de segurança E de performance, contados por nível e nome. A saída é **só contagem, nome de
  objeto de esquema e hash**: nenhum id, código, slug, nome, termo ou texto de linha sai da consulta.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f65-evidencias/`. Vermelha no PR em
rascunho, verde no commit seguinte: é o molde da F64. O artifício de `raise notice` até o fim da fase, que a ficha
descreve, não é preciso, e isso vai declarado.
- **`supabase/tests/forma_multiempresa.sql`**, DERIVADA DO CATÁLOGO (`pg_constraint`):
  - toda FK entre duas tabelas de `k_negocio` é composta e começa por `empresa_id` dos dois lados;
  - todo pai referenciado tem unique ou PK que a cobre;
  - não sobra FK simples entre tabelas de negócio;
  - nenhum par de tabelas de negócio tem duas relações;
  - `termos_gerados` fica coberta pela forma da decisão 8;
  - as exceções nominais (as FKs para `empresas` e `profiles`; `operador_filiais`, se a decisão 3 a mantiver) moram
    numa fonte só, com motivo.

  Hoje ela reprova pelos 23 nomes e pelos sete pais.
- **`supabase/tests/unicidade_por_empresa.sql`**, DERIVADA DO CATÁLOGO (`pg_index`/`pg_constraint`): todo unique ou PK
  de tabela de `k_negocio` contém `empresa_id`, OU está na lista nominal dos "por tenant de forma implícita" do fato 7,
  com o motivo.
  - Trate `indkey[k] = 0` explicitamente: são três uniques de expressão, e as colunas deles vêm de
    `pg_get_indexdef`/`indexprs`.
  - Trate também os parciais (`indpred`).

  Hoje ela reprova pelos catorze nomes do fato 7: os treze da tabela e o índice da `0013`. O `_key` da `0010` depende
  da decisão 4.
- **`supabase/tests/imutabilidade_tenant.sql`**:
  - toda tabela de `k_negocio` (lida do catálogo) tem o gatilho de `guarda_empresa` `BEFORE UPDATE OF empresa_id FOR
    EACH ROW`, ou está na lista nominal da decisão 7;
  - o corpo da função não menciona `dev_destrutivo`;
  - **comportamental**: `update … set empresa_id = <B>` leva 42501 em cada tabela com linha, inclusive com `set local
    estoque.dev_destrutivo = 'on'`, dentro da transação do roteiro, e o dado continua intacto como `postgres`.

  Hoje ela reprova em todas.
- **O snapshot**: um teste de mesa em que o consolidado de A e o de B do mesmo período dão chaves DIFERENTES, e um
  roteiro em que as duas empresas inserem o mesmo período e versão. Os dois vermelhos hoje.
- **A diagonal**: um roteiro em que B nomeia uma filial com o apelido de A e a mensagem de recusa não cita filial
  alheia. Vermelho hoje.
- **O `ON CONFLICT`**: um teste de mesa (e um cenário SQL) que prova que `ON CONFLICT (nome_chave)` falha com 42P10
  contra o esquema-alvo e que o alvo novo infere. É a prova de que a janela do fato 10 existe.

### Frente C: o banco (migrations `0165`+)
Migrations pequenas, por família, na ordem de lock do app. Cada uma leva o cabeçalho de classe (validado pelo
classificador), o rollback no rodapé, `db:lock` no mesmo commit, entrada em `DA_F38` e um nome-sem-prefixo que não
repita nenhum arquivo do repositório. `set lock_timeout = '2s'` / `reset`, sem `begin`/`commit` (o molde F63/F64).
**Sem `concurrently`, sem `cascade`, sem `update`, sem abrir a janela destrutiva** (fatos 22 e 23).
- **Os pais**: `unique (empresa_id, id)` nos sete do fato 5, no molde de `filiais_empresa_id_uidx` (F62).
- **As FKs, por família** (decisão 3): cada FK simples do fato 4 é derrubada e recriada COMPOSTA com o MESMO nome e as
  mesmas ações, na mesma migration. A família de `movimentacoes` e a de `lancamentos_item` são as mais quentes.
- **`motivos`** (fato 11): derrubar `movimentacoes_motivo_fkey`, trocar `motivos_pkey` para `(empresa_id, codigo)` com
  o mesmo nome, e recriar `movimentacoes_motivo_fkey` como `(empresa_id, motivo) → motivos(empresa_id, codigo)`. Numa
  migration só.
- **O import** (fato 12): as três PKs para `(empresa_id, …)`, com os mesmos nomes, e os dois parciais para
  `(empresa_id, categoria|estado) where rotulo is not null`.
- **Os uniques por empresa e o snapshot** (decisões 4 a 6), com os nomes do fato 9 preservados, pela sequência nome
  provisório → `drop` do antigo → `rename`, na mesma migration.
- **Os gatilhos** (decisões 7 a 9), numa migration PRÓPRIA, por último:
  - `public.guarda_empresa()` e o gatilho em cada tabela da decisão 7;
  - o gatilho de `termos_gerados`, se a decisão 8 o criar;
  - `create or replace function public.vocabulario_unidades_guarda()` com a diagonal por empresa. **O resto do corpo
    fica byte a byte**, e a prova é o diff de `prosrc` antes × depois restrito às linhas declaradas.

  Grants, `revoke` e `search_path` no molde das funções vizinhas; confira `seguranca_catalogo.sql` e
  `catalogo_secdef.sql`.
- **Nenhuma outra função criada ou recriada.** As 14 chamadas advisory do fato 18 ficam intactas (decisão 10),
  inclusive a de `vocabulario_unidades_guarda`, que só muda nas linhas da diagonal.

### Frente D: o TS
- **O snapshot** (decisão 6): `chaveVersao` ganha a empresa, `gerados.ts` a seleciona (exceção nominal da trava
  "ninguém lê"), `chave-versao-sql.test.ts` passa a ler a migration nova como fonte, e `ehViolacaoDeVersao` continua
  casando pelo NOME preservado. Tudo no mesmo commit da migration do snapshot.
- **O `consolidarColaboradores`** (decisão 5): o `onConflict` passa ao alvo que casa com o unique novo, sem janela
  quebrada.
- **`CONSTRAINTS_TRADUZIDAS`**: o tipo de `filiais_slug_key` e `tipos_item_slug_key` acompanha a forma nova, e
  `erros-do-banco-sql.test.ts` continua provando que cada nome existe.
- **A frase de `guarda_empresa`** (e a do gatilho de `termos_gerados`, se houver) em `MSG_SQL`/`erros.ts`, pelo idioma
  da F58, antes do ramo genérico.
- **`src/lib/types/database.ts`**:
  - *hand-fix* datado antes do SHA congelado (as `Relationships` das FKs compostas);
  - depois do apply no ensaio, a geração do MCP e a conferência de que batem;
  - se diferir: commit novo, CI de novo, e o SHA congelado passa a ser esse, antes do apply de produção.
- **Nenhum embed muda** em `src/lib/queries/formas/**`. Se a sua medição provar que algum precisa mudar, é sinal de
  que a decisão 3 errou: reveja a decisão, não o embed.

### Frente E: os roteiros, os catálogos, o injetor e os rollbacks
- **O roteiro da fase** (por exemplo, `supabase/tests/integridade_tenant.sql`), com os cenários A↔B do "pronto quando",
  corrigidos pelo fato 19, e as sabotagens D, E, H, I e J. Toda recusa é **provada duas vezes** (a falha, e depois,
  como `postgres`, o dado intacto), e toda FK composta é provada **com o par simétrico** (regra 3 de
  `isolamento_tenant.sql`). Tudo usa `assert_zero_de`, que recusa universo vazio.
- **Os roteiros que já montam uma segunda empresa** (fato 20): a fixture de B incoerente ganha o `empresa_id`
  explícito, uma a uma, com a lista no relatório. Nenhuma asserção muda para passar.
- **O rollback**: `supabase/rollback/F65-desfaz.sql` na ordem inversa, recriando as FKs simples e os uniques globais
  com os MESMOS nomes, e o corpo anterior da diagonal. É ensaiado por `supabase/tests/f65_rollback.sql` até a impressão
  do CI tirada antes da `0165`. **`f64_rollback.sql`, `f63_rollback.sql` e `f62_rollback.sql` passam a rodar o da F65
  antes** (fato 27), e `rollback-f64.test.ts` ganha o irmão da F65.
- **Os catálogos**: as três travas da Frente B entram no `rodar-roteiros.sh`/CI pelo caminho que os outros roteiros
  usam. As exceções nominais moram numa fonte única, amarrada por um describe de `catalogos-seguranca.test.ts`. A
  trava "ninguém lê" ganha as exceções da decisão 12.
- **`isolamento_tenant.sql`**: o cabeçalho diz o que a F65 entregou (a camada estrutural) e o que falta (a leitura, na
  F66). A regra 3 da convenção de honestidade deixa de dizer "sem FK composta hoje".
- **O injetor** (decisão 13).

### Frente F: os documentos
- **MATRIZ**: emenda **F65** em `docs/MATRIZ-REGRAS.md`, com regras a partir de **R-ACC-98**:
  - a FK composta de mesmo nome;
  - os uniques por empresa com os nomes contratuais;
  - a imutabilidade do tenant sem exceção;
  - a diagonal por empresa;
  - a integridade de `termos_gerados`;
  - as exceções nominais novas de leitura.
- **ADR e RUNBOOK**: a emenda F65 no `ADR-003` e o Anexo F65 no `RUNBOOK-BANCO.md`. O Anexo traz a receita "trocar FK
  simples por composta sem quebrar o PostgREST", a receita "trocar unique preservando o nome", a proibição de
  `concurrently` pelo MCP, e o passo pós-deploy, se a decisão 5 o criar.
- **PLANO**:
  - a nota **F65** no `PLANO-MULTIEMPRESA.md`, com os desvios medidos e as três decisões do Johnny;
  - a ficha da **F66** ganha os índices de lista (decisão 1), com a medição que ela precisa fazer, e o join por
    código de `rel_*`;
  - a ficha da **F67** ganha:
    - os leitores por chave natural sozinha (fatos 11 e 12);
    - o `max(versao)+1` sem empresa;
    - `idsDeAdminsAtivos` (a `DECISOES.md` ~linha 9190 diz "fecha na F65"; a ficha da F67 é quem dá corpo às guardas
      da F52, e isso vai junto);
    - as travas advisory que a F67 reescreve (`resetar_*` com `-1`, `conflito_filiais_apagar`);
  - o backlog ganha o seed de duas empresas (decisão 3).
- **Os comentários do repositório que prometem à F65 o que é da F67**: `catalogo_secdef.sql:83/110` e
  `cargo_dev.sql:1073`. Corrija o texto dos comentários para apontar a F67. Nenhuma asserção muda.
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`, com as três decisões do Johnny e as catorze da fase.

### Frente G: o fechamento, nesta ordem
1. `1.70.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real:
   - o sistema passou a recusar, por conta própria, qualquer ligação entre registros de empresas diferentes (um
     ativo, uma movimentação ou um lançamento nunca aponta para filial, colaborador, item ou motivo de outra
     empresa);
   - nomes que não podem repetir (filial, tipo de item, colaborador, item, kit, apelido, motivo, termos do import)
     passaram a não poder repetir DENTRO da mesma empresa;
   - um registro não muda de empresa, nem pelas ferramentas do desenvolvedor.

   Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F65.md`. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **Apply no ENSAIO**, migration a migration, pelo `apply_migration` do MCP, com o `name` certo. Logo antes, a
   contagem de violações e a impressão "antes" refeitas. Depois, a prova pós-apply do runbook:
   - `notify pgrst` e `get_advisors` de segurança (nenhum achado novo esperado) e de performance (o delta de
     `unindexed_foreign_keys`, declarado por nome);
   - a impressão "depois": nas 20, o `relfilenode` e os dois md5 **iguais** aos do "antes";
   - o catálogo "depois" igual ao do CI;
   - o `prosrc` intocado das funções que a fase não pode tocar;
   - as 62 policies byte a byte;
   - a sonda de exatidão (o texto aplicado igual ao do arquivo);
   - **o conferidor de formas contra o ENSAIO** (`--alvo=ensaio`), com 0 recusadas. **Ele é o portão do embed (fato
     6).**

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com o arquivo que falhou retirado da
   branch antes do merge e a correção em migration NOVA.
6. **Apply em PRODUÇÃO**, na mesma ordem, dentro de 24 h do commit das migrations, com as mesmas provas.
   - O **`relfilenode` é igual, sem exceção**. Os md5 são iguais, ou a diferença se explica SÓ pela atividade da
     janela, com a contagem na evidência.
   - Depois, a paridade ensaio × produção nas 11 classes.
   - Se o `relfilenode` mudou, se o `(pk, xmin)` divergiu além da janela, ou se apareceu advisor de segurança não
     declarado que cita objeto da fase: **rollback imediato em produção** antes do diagnóstico, e registro no topo do
     relatório.
   - Logo depois do apply, e antes do merge, rode `node scripts/smoke/smoke-prod.mjs` a partir da branch.
7. O conferidor de formas contra PRODUÇÃO (conta do smoke, só contagens), **com 0 recusadas**. Rode-o exatamente como a
   F64 rodou. Se o classificador de segurança barrar esse passo, registre, não reformule, e fique com a prova do
   ensaio e do smoke, declarada como a única no relatório.
8. Ata e `docs/RELATORIO-F65.md` com o que já dá para escrever; o PR sai do rascunho; merge com os dois checks verdes,
   logo depois das provas. Declare no relatório a janela entre o apply de produção e o deploy, e o tamanho dela.
9. **Se a decisão 5 criou um passo pós-deploy** (por exemplo, o `drop` do unique global de `colaboradores`): depois que
   `/api/saude` mostrar o commit do merge, aplique a migration desse passo no ensaio e em produção, com as mesmas
   provas. A migration já está no `main` e já rodou no CI. Não crie outro PR de código para ela.
10. **A conferência pós-deploy, só leitura**:
    - `/api/saude` com `1.70.0` e o commit do merge;
    - `node scripts/smoke/smoke-prod.mjs` com 0 falha;
    - a Parte B do `saude.yml` disparada à mão, verde, com a sonda de deriva sem pendente.

    Nenhuma captura de tela de produção.
11. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.70.0` vai no merge
    dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Das decisões do Johnny e da ficha:**
  - policy, e qualquer leitura da coluna para recortar (F66);
  - **os índices de lista** liderados por `empresa_id`, inclusive `(empresa_id, ordem)` e o de `/ativos` (F66,
    decisão 1);
  - a paginação keyset e a troca `created_at desc, id desc` → `ordem desc` que o `RELATORIO-F60.md` empurrou "para a
    F65" (muda a ordem visível no empate; backlog);
  - o default `empresa_legada()` das 20 e de `filiais` (F67);
  - as guardas no-op da F52 (`mesmo_escopo_de_gestao`, `existe_outro_admin_ativo`, `exigir_ativos_da_empresa`),
    `idsDeAdminsAtivos`, `v_conflitos_filiais`, `p_empresa` nas RPCs destrutivas e `pode_escrever_unidade` (F67);
  - os leitores por chave natural sozinha (`rel_*` por código, o import por termo/prefixo) e o `max(versao)+1` sem
    empresa (F66/F67);
  - converter as travas advisory e alargar o tipo dos ids (decisão 10);
  - o seed de duas empresas, `scripts/seed.ts` e `scripts/seed.test.ts` (decisão 3);
  - o jsonb de `eventos_admin` e o CHECK de comprimento (F66).
- **O que esta ordem acrescenta:**
  - editar migration aplicada;
  - afrouxar a guarda de topo, o classificador, a trava "ninguém lê" (só entram exceções NOMINAIS, com motivo) ou as
    travas das F63/F64;
  - subir número da linha de base, ou acrescentar checagem de integridade nova sem a ordem do alarme da F64 (decisão
    11 dela);
  - mudar embed em `src/lib/queries/formas/**`;
  - `carga.ts`, `reset.ts` e `restaurar.mjs`;
  - `CLAUDE.md` da raiz;
  - `.github/workflows/**` e a proteção da `main`;
  - dependência nova;
  - `.env*` e `scratchpad/`;
  - os PRs do dependabot;
  - o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F65.md` tem os 28 fatos remedidos, o censo dos consumidores, o desenho, as catorze decisões, a ordem das
   migrations e a ORDEM DE ROLLBACK. Ele é anterior ao primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
3. A contagem de violações (0 em tudo) e a impressão "antes" (as 20 tabelas, o catálogo, as policies e os dois
   advisors) existem nos dois bancos, tiradas antes de qualquer apply, só com contagens, nomes de objeto de esquema e
   hashes, em `docs/f65-evidencias/antes/`.
4. As migrations começam na `0165`, com cabeçalho de classe validado pelo classificador, rollback no rodapé, `db:lock`
   no mesmo commit e entrada em `DA_F38`. Não há `update`, `cascade`, `concurrently`, abertura da janela destrutiva
   nem nome-sem-prefixo repetido. As únicas funções criadas ou recriadas são as das decisões 7 a 9.
5. As 23 FKs são compostas, validadas, com o nome e as ações de antes, nos dois bancos e no CI. Os sete pais têm
   `unique (empresa_id, id)`. Nenhum par de tabelas de negócio tem duas relações (fora a exceção nominal, se houver). A
   trava `forma_multiempresa.sql` nasceu vermelha e está verde.
6. `motivos_pkey` é `(empresa_id, codigo)`, e `movimentacoes_motivo_fkey` é composta, criadas na mesma migration. As
   três PKs do import e os dois parciais são por empresa.
7. Toda unicidade do fato 7 vale por empresa, com o nome contratual. A trava `unicidade_por_empresa.sql`, derivada do
   catálogo e tratando expressão e parcial, nasceu vermelha e está verde. A lista dos "por tenant de forma implícita"
   está nominal, com motivo.
8. O snapshot: as duas empresas inserem o consolidado do mesmo período e versão; na mesma empresa, a segunda é
   recusada, e `ehViolacaoDeVersao` casa. `chaveVersao` e `gerados.ts` carregam a empresa, e
   `chave-versao-sql.test.ts` lê a fonte nova.
9. `guarda_empresa()`: 42501 em toda tabela da decisão 7, inclusive com a janela aberta; dado intacto como `postgres`;
   nenhuma menção à janela no corpo. A trava `imutabilidade_tenant.sql`, derivada do catálogo, nasceu vermelha e está
   verde. A frase chega em pt-BR.
10. A diagonal é por empresa: B nomeia filial com o apelido de A; em A continua recusado; a mensagem nunca cita filial
    de outra empresa. O resto do corpo de `vocabulario_unidades_guarda` está byte a byte.
11. `termos_gerados`: a forma da decisão 8 recusa termo de A que cite id de B, aceita o coerente, e o caminho de
    `persistirTermo` (UPDATE de `dados`/`arquivo_path`) continua possível.
12. **Nenhuma janela quebrada**: nenhum embed de `formas/**` mudou; o conferidor contra o ENSAIO e contra PRODUÇÃO deu
    0 recusadas; o smoke logo depois do apply de produção deu 0 falha; `consolidarColaboradores` funciona antes,
    durante e depois do deploy (decisão 5), com a prova.
13. **Nenhuma tupla reescrita**: o `relfilenode` e o md5 de `(pk, xmin)` são iguais antes × depois nas 20, nos dois
    bancos, com a diferença de produção explicada só pela janela.
14. As funções que a fase não podia tocar estão byte a byte (md5 do `prosrc`), incluindo as 11 das travas advisory
    que a fase não recria (a 12ª, `vocabulario_unidades_guarda`, muda só nas linhas da diagonal, com o diff declarado) e
    as escritoras das F63/F64. As 62 policies estão byte a byte.
15. Os cenários do "pronto quando", com o fato 19: duas empresas com filial `matriz`; o mesmo par patrimônio + service
    tag em duas empresas; o mesmo tipo, motivo, termo, prefixo, colaborador, item, kit e apelido em duas empresas. Todos
    coexistem entre empresas e são recusados dentro de uma, e a regra da F24 continua intacta.
16. A trava "ninguém lê" continua verde, com as exceções novas NOMINAIS e com motivo, numa fonte só, e acusa um caso
    sintético fora delas.
17. O `database.ts` tem *hand-fix* declarado e foi conferido contra a geração do MCP depois do apply no ensaio; o
    `db:types:diff` está verde.
18. A decisão sobre o injetor está na ata. Se entrou mutação, ela é detectada, o teto está no número exato com o porquê
    datado e a quarentena abaixo de ⅓.
19. O rollback está escrito na ordem inversa, em `supabase/rollback/F65-desfaz.sql`, e foi **ensaiado no Postgres do
    CI** até a impressão tirada antes da `0165`. `f64_rollback.sql`, `f63_rollback.sql` e `f62_rollback.sql` rodam o
    da F65 antes e continuam verdes.
20. O advisor de segurança só mudou no que foi declarado (o esperado é nada). O de performance mudou só no delta
    declarado por nome. A paridade ensaio × produção fecha nas 11 classes.
21. Os roteiros adaptados pelo fato 20 estão listados, com o motivo de cada um, e nenhuma asserção mudou para passar.
22. Nenhuma dependência nova; `.github/workflows/**`, o `CLAUDE.md` da raiz, `scripts/seed.ts` e os embeds de
    `formas/**` intocados; nenhum número da linha de base subiu.
23. As emendas estão feitas: MATRIZ (F65, a partir de R-ACC-98), `ADR-003`, `RUNBOOK-BANCO.md` (Anexo F65),
    `PLANO-MULTIEMPRESA.md` (nota F65, fichas F66 e F67, backlog), os comentários que apontavam a F65 para a F67,
    `docs/README.md`, `docs/prompts/README.md` e a ata em `docs/DECISOES.md`.
24. `package.json` em `1.70.0`, `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.70.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
25. Os dois PRs estão mergeados com os dois checks verdes, o passo pós-deploy (se houver) foi aplicado nos dois bancos,
    e a conferência pós-deploy foi feita; se não, o bloqueio está no topo do relatório.
26. As sabotagens A a L estão com saída real em `docs/f65-evidencias/`.
27. Nenhum dado real (nome, e-mail, id, código de motivo, slug de produção, termo, patrimônio) em migration, teste,
    roteiro, evidência ou log. Da produção, só contagens, nomes de objeto de esquema e hashes. Ninguém abriu o
    `.env.local`.
28. `docs/RELATORIO-F65.md` segue o padrão F45→F64, com o roteiro do Johnny no topo, o estado de repouso e a seção "o
    que este relatório NÃO prova".

# Verificação: rode de verdade
A cada incremento, rode `npm run lint`, `npm run test` e `npm run typecheck`. Rode `npm run build` antes de cada push.
Tudo o que é SQL (roteiros, injetor, `db:types:diff`) passa pelo `banco-sem-docker` do PR. Leia a falha, corrija a
**causa raiz** e repita até passar.

Não faça nada disto para um teste passar:
- alargar exceção para caber um caso que devia reprovar;
- trocar detecção por `skip`;
- afrouxar um catálogo, uma varredura, o classificador ou a guarda de topo;
- subir a linha de base;
- baixar o rigor da convenção de honestidade;
- mudar uma asserção existente sem conferir que ela prova a mesma coisa;
- mudar um embed para caber a FK nova.

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**NENHUMA TUPLA É REESCRITA, NENHUM EMBED QUEBRA, E O "ANTES" VEM ANTES DE QUALQUER APPLY.** O `relfilenode` e o md5 de
`(pk, xmin)` iguais nas 20 tabelas, nos dois bancos, e o conferidor de formas com 0 recusadas no ensaio, são o portão do
apply de produção. Os mesmos, em produção, são o portão do merge.

Provas obrigatórias, cada uma com a saída real em `docs/f65-evidencias/`:
- **Sabotagem A, a forma.** `forma_multiempresa.sql` vermelha pelos 23 nomes e pelos sete pais sobre o banco de hoje,
  verde depois. Cada um destes a deixa vermelha, pelo nome:
  - uma FK simples recriada (`anotacoes_ativo_id_fkey`);
  - uma composta deixada `not valid`;
  - um pai sem o `unique (empresa_id, id)` (`tipos_item`);
  - uma composta ACRESCENTADA ao lado da simples (`ativos` → `filiais`), a forma que o PostgREST veria ambígua;
  - uma composta com `empresa_id` fora da posição.
- **Sabotagem B, a unicidade.** `unicidade_por_empresa.sql` vermelha pelos catorze nomes, verde depois. Cada um destes a
  deixa vermelha, pelo nome:
  - `tipos_item_slug_key` global recriado;
  - `kits_modelos_nome_uidx` de expressão sem a empresa;
  - o parcial de `import_termos_categoria` sem a empresa;
  - um unique global novo fora da lista nominal.

  Na mesa, `erros-do-banco-sql.test.ts` fica vermelho se um nome contratual sumir.
- **Sabotagem C, a imutabilidade.** `update … set empresa_id = <B>` leva 42501 em cada tabela da decisão 7 com linha,
  com e sem `set local estoque.dev_destrutivo = 'on'`, e o dado continua intacto como `postgres`. Cada um destes deixa
  `imutabilidade_tenant.sql` vermelha:
  - o gatilho retirado de uma tabela;
  - um ramo `if current_setting('estoque.dev_destrutivo', true) = 'on'` na função;
  - uma tabela de negócio sintética com a coluna e sem o gatilho.
- **Sabotagem D, a FK composta com o par simétrico.** Para CADA uma das 23 (laço sobre o catálogo, não lista à mão),
  filho de A apontando para pai de B leva 23503, e o par legítimo (filho de B → pai de B) passa. A recusa é provada duas
  vezes.
  - E a transferência: a movimentação que manda um ativo de A para filial de B é recusada, e o ativo segue na filial
    de origem.
- **Sabotagem E, `motivos` e o import.**
  - o mesmo código de motivo em A e em B coexiste; na mesma empresa, é recusado;
  - movimentação de A com motivo que só existe em B → 23503;
  - o gatilho do kit da F64 continua recusando o motivo de B no kit de A;
  - o mesmo termo e o mesmo prefixo em A e em B coexistem, e o parcial por rótulo vale por empresa.
- **Sabotagem F, o "pronto quando"** (com o fato 19):
  - duas empresas com filial `matriz` e o mesmo nome;
  - o mesmo tipo, colaborador, item, kit e apelido nas duas.

  Tudo coexiste entre empresas e é recusado dentro de uma, com a tradução pt-BR casando pelo NOME. O mesmo par
  patrimônio + service tag em duas empresas coexiste, e `conflito_filiais.sql` (a F24) continua verde, sem edição.
- **Sabotagem G, o snapshot.**
  - A e B inserem o consolidado do mesmo período e versão, e os dois passam;
  - na mesma empresa, o segundo leva 23505 com o nome do índice, e `ehViolacaoDeVersao` dá `true` por nome;
  - na mesa, `chaveVersao` de A ≠ de B.
- **Sabotagem H, a diagonal.**
  - B nomeia uma filial "Centro" enquanto A tem o apelido "centro" → passa;
  - em A, o mesmo continua recusado;
  - a mensagem de toda recusa não contém o nome de filial de outra empresa (asserção sobre o texto do erro);
  - o resto do corpo da função está byte a byte.
- **Sabotagem I, `termos_gerados`.**
  - termo de A com `movimentacao_ids` de B → recusado; com `ativo_ids` de B → recusado;
  - o coerente → passa;
  - o UPDATE de `dados`/`arquivo_path` → passa.

  Se a decisão 8 for "nada", a sabotagem prova a lacuna e a ata diz por quê.
- **Sabotagem J, a janela do `ON CONFLICT`.**
  - contra o esquema-alvo, `ON CONFLICT (nome_chave)` → 42P10, e o alvo novo infere;
  - no estado intermediário da decisão 5 (se houver), os dois alvos funcionam;
  - na mesa, `consolidarColaboradores` manda o alvo novo, e a trava estática fica vermelha diante da volta ao
    `onConflict: 'nome_chave'`.
- **Sabotagem K, o rollback.** `F65-desfaz.sql` devolve o catálogo à impressão de antes da `0165`, com os nomes de
  antes. `f64_rollback.sql`, `f63_rollback.sql` e `f62_rollback.sql` rodam o da F65 antes e continuam verdes.
- **Sabotagem L, o instrumento.** No Postgres do CI:
  - um `update` de uma linha num `savepoint` deixa o `relfilenode` igual e MUDA o md5 de `(chave, xmin)`;
  - um `alter column … type` muda o `relfilenode`;
  - as migrations da fase não mudam nenhum dos dois nas 20;
  - o md5 do `prosrc` das funções intocáveis é igual antes × depois.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI;
  - mutações e teto;
  - FKs de negócio simples × compostas (23 + 0 → 0 + 23);
  - pais com `(empresa_id, id)`;
  - uniques de negócio com `empresa_id`;
  - gatilhos e funções (a paridade);
  - policies;
  - advisors de segurança e de performance, por nível e nome;
  - as 20 contagens, o `relfilenode` e o md5 nos dois bancos;
  - o conferidor (pontos, linhas, recusadas) no ensaio e em produção;
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco e os bancos de hoje;
2. as três decisões do Johnny abaixo, que mudam a ficha;
3. a ficha da F65 no §7 do plano;
4. este prompt, no que ele detalha (onde ele diverge da ficha, a divergência está declarada aqui e vai para o
   relatório);
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, o código existente, o molde da F64);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**As três decisões do Johnny (23/09/2026), que a ficha não tinha:**
1. os índices de lista liderados por `empresa_id` vão para a F66, medidos lá; a F65 só cria os índices que a
   integridade exige;
2. `guarda_empresa()` em toda tabela de negócio, lista lida do catálogo, trava para tabela nova, 42501, sem exceção na
   janela;
3. o seed de duas empresas e `seed.test.ts` saem da F65 e vão para o backlog nomeado.

**As catorze decisões que esta fase precisa tomar por escrito:**
1. **As migrations**: quantas, quais objetos em cada uma e em que ordem.
   - Os pais vêm antes das FKs.
   - `motivos` e a sua FK ficam juntas.
   - Os gatilhos vêm por último, numa migration própria.
   - Agrupe por família e siga a ordem de lock do app (decisão 1 da F64).
2. **O lock e a validação** (fato 22):
   - FK validada direto ou `not valid` numa migration e `validate` na seguinte, com o motivo. Na mesma migration, a
     separação é inútil;
   - `lock_timeout` e as tentativas;
   - se a família de `movimentacoes` vai sozinha.
3. **A troca das FKs** (fato 6):
   - o mesmo nome, e a mesma ação `ON DELETE`/`ON UPDATE`, `MATCH` e deferrability, conferidos no catálogo "antes";
   - as FKs para `empresas` e `profiles` ficam simples;
   - o destino de `operador_filiais_filial_id_fkey`, a simples que a F62 deixou ao lado da composta (derrubar, porque
     a composta a cobre, ou manter como exceção nominal com motivo);
   - a prova, no catálogo, de que nenhum par de tabelas de negócio tem duas relações;
   - se usar `not valid` entre migrations: confirme na doc que o PostgREST enxerga a FK não validada como relação.
4. **Os uniques por empresa** (fatos 7 e 9):
   - para cada um da lista, a ordem das colunas. Hoje há consultas que filtram SÓ pela chave natural (`slug`,
     `nome_chave`, `codigo`, `termo`), e com `empresa_id` na frente o índice não as serve até a F66. Meça quais existem
     e o tamanho das tabelas, e escolha com o motivo;
   - o nome provisório → `drop` → `rename` preservando o nome contratual;
   - os dois parciais;
   - o destino do `_key` da `0010` (fato 8);
   - o tipo de `filiais_slug_key`/`tipos_item_slug_key` em `CONSTRAINTS_TRADUZIDAS`.
5. **O `consolidarColaboradores`** (fato 10). **Janela zero é requisito**: a ação funciona antes, durante e depois do
   deploy. A sugestão tem dois passos:
   - a F65 cria o unique por empresa AO LADO do global (o global, mais estrito, segue decidindo; os dois alvos inferem),
     e o TS passa a `onConflict: 'empresa_id,nome_chave'`;
   - depois do deploy, a migration do passo pós-deploy (Frente G, passo 9) derruba o global e deixa o nome contratual
     `colaboradores_nome_chave_uidx` no unique por empresa.

   Nesse caminho:
   - a migration do passo pós-deploy entra no MESMO PR e roda no CI com as outras; só o apply dela nos bancos vivos
     espera o deploy;
   - o estado intermediário (os dois uniques) é um repouso válido e vai declarado;
   - a tradução do 23505 não pode quebrar em nenhum estado intermediário.

   Outra forma serve se tiver janela zero provada.
6. **O snapshot e a chave** (fato 8):
   - a forma do índice novo;
   - como `chaveVersao` representa a empresa (determinística, e sem dado pessoal);
   - `gerados.ts` selecionando `empresa_id` como exceção nominal;
   - o destino do `_key` da `0010`;
   - `chave-versao-sql.test.ts` lendo a fonte nova.
7. **`guarda_empresa()`**:
   - uma função genérica (com o nome da tabela na frase) ou uma por tabela;
   - INVOKER (ela só compara `new` e `old`);
   - o errcode 42501 e a frase;
   - **a lista**: a decisão do Johnny é "toda tabela de negócio, sem exceção na janela". O fato 13 mediu que
     `guarda_acervo` DEIXA o UPDATE passar em `movimentacoes`/`lancamentos_item` com a janela aberta. A proposta é as
     **20** de `k_negocio`, por fonte única. Se as duas ficarem de fora, o roteiro prova que a FK composta as segura
     dentro da janela, e a ata diz por quê;
   - `BEFORE UPDATE OF empresa_id` (custo zero, a escolha do Johnny) tem uma ressalva documentada: o gatilho de coluna
     não vê mudança feita por OUTRO gatilho `BEFORE`. Confirme na doc do PG 17 e ponha na trava uma asserção de que
     nenhum gatilho `BEFORE` de tabela de negócio escreve `empresa_id`.
8. **`termos_gerados`** (fato 16): um gatilho de coerência no molde do kit da F64 (INVOKER; `BEFORE INSERT OR UPDATE OF
   movimentacao_ids, ativo_ids, empresa_id`; todo id dos dois arrays é da empresa do termo; errcode e frase próprios)
   ou nada, com o motivo.
   - Proposta: o gatilho, SEM checagem de integridade nova. A contagem de violações do "antes" prova que o dado de hoje
     está coerente, e checagem nova arrastaria a ordem do alarme da F64 para esta fase.
9. **A diagonal** (fato 15):
   - o recorte por empresa nas duas pontas;
   - a mensagem que nunca cita filial alheia;
   - o lock fica como está, global (`hashtext`): serializar renomeações entre empresas não custa nada, e mexer nele é
     mexer nas travas advisory (decisão 10). A ata diz isso;
   - o resto do corpo byte a byte.
10. **Os ids e as travas advisory** (fatos 17 e 18). Proposta firme: **nada converte**, os ids ficam `smallint`
    globais, e as 14 chamadas ficam intactas. A ata registra:
    - o teto efetivo e o ritmo de queima medidos;
    - por que a colisão da ficha não existe com ids globais;
    - a regra para quem um dia reescalar ids por empresa: as 14 convertem TODAS na mesma migration, porque `(bigint)` e
      `(int,int)` são espaços de lock diferentes.
11. **As três travas de catálogo**:
    - arquivos novos ou extensão do bloco 5 de `catalogo_policies.sql`;
    - a fonte única das exceções nominais, com motivo;
    - o tratamento de expressão (`attnum = 0`) e de parcial;
    - o describe que amarra a fonte única.
12. **"Ninguém lê"**: as exceções novas (`guarda_empresa`, o gatilho de `termos_gerados`, a diagonal, `gerados.ts` e o
    `onConflict` de `colaboradores.ts`), cada uma nominal, POR COMANDO onde der (o molde da F64), com o motivo. O caso
    sintético fora delas continua vermelho.
13. **O injetor**: as candidatas são uma composta virando simples, o unique do snapshot perdendo a empresa, a guarda
    ganhando a exceção da janela, a diagonal perdendo o filtro de empresa, e o gatilho de termos perdendo a
    comparação. Mutação só onde ela derrubar uma trava desta fase que nenhum teste de mesa já derruba. Teto novo exato,
    ou a ata diz por que não entrou.
14. **O instrumento**:
    - a chave estável do md5 de `(chave, xmin)` nas quatro tabelas cuja PK MUDA na fase (a coluna natural de antes
      continua única com uma empresa: declare);
    - o texto da contagem de violações;
    - a impressão do catálogo;
    - o critério que separa "atividade normal" de "reescrita".

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **A contagem de violações do "antes" deu mais que 0** em qualquer banco: não aplique nada naquele banco. Registre o
  número (só contagem) no topo do relatório, com a consulta que o reproduz. Entregue o resto, com o PR ABERTO e SEM
  merge. Dado incoerente é decisão do Johnny, não da migration.
- **O MCP da Supabase não está conectado, ou recusa o apply.** Nas F60, F63 e F64, as ferramentas amanheceram
  desligadas uma a uma nas configurações do conector e voltaram horas depois. Não procure token, não leia o
  Gerenciador de Credenciais, não abra o `.env.local`. Confira de novo algumas vezes ao longo da run. Se não voltar,
  entregue tudo o que não depende do banco vivo, com o PR ABERTO e **SEM merge**. No topo do relatório vai o caminho B:
  as migrations na ordem, a contagem de violações e as impressões para rodar antes e depois, e o rollback.
- **O `relfilenode` mudou, ou um md5 divergiu sem explicação, ou o conferidor recusou, no ensaio.** Rollback no
  ensaio na ordem escrita, causa raiz, correção por migration NOVA e o ciclo de novo. **Em produção:** rollback
  imediato, antes do diagnóstico, sem merge, e o bloqueio no topo do relatório.
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO de
  `supabase/rollback/F65-desfaz.sql` que o CI já ensaiou. É a única exceção ao "`execute_sql` só leitura", e vale só
  para esse arquivo. A linha do ledger fica; registre o que a sonda de deriva vai dizer dela. Se o classificador de
  segurança barrar o rollback, não reformule: o comando exato vai no topo do relatório, e o PR fica sem merge.
- **O lock não veio** (o `lock_timeout` disparou): registre e tente de novo, no máximo três tentativas em 30 minutos.
  Não suba o timeout nem mate sessões do app. Depois da terceira, pare o apply daquele banco: PR aberto, sem merge, e o
  comando no topo do relatório. Se isso acontecer no MEIO da sequência de produção, pare ali. Cada migration é
  atômica, e o estado entre duas delas precisa ser um repouso válido: garanta isso no desenho da decisão 1.
- **Advisor de segurança novo** depois do apply que não esteja declarado: se ele cita objeto desta fase, escalada do
  runbook e rollback antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e
  siga. O advisor de performance é informativo: registre o delta, não reverta por ele.
- **O conferidor ou o smoke recusam** depois do apply de produção: um embed quebrou. Rollback em produção, PR sem
  merge, e a causa no topo do relatório. Não tente consertar na mesma run.
- **O passo pós-deploy (decisão 5) foi barrado ou falhou:** o estado intermediário é repouso válido. Registre, deixe o
  comando exato no topo do relatório e siga para a conferência e o PR de documentação. A sonda de deriva vai cobrar o
  arquivo em 24 h: registre isso também.
- **A sonda de deriva abre alarme** porque um apply passou das 24 h: registre; o alarme fecha sozinho na Parte B
  seguinte.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a pendência
  com o que falta. Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, merge, push de tag, disparo de
  workflow): registre, não repita, não reformule, siga no que não depende dela, e ponha o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui
já há catorze divergências medidas de saída**, e elas vão no relatório:
- a numeração das migrations (`0165`, não `0151`; fato 1);
- 23 FKs; `ativos` sem FK de tipo e de colaborador; `termos_gerados` sem FK (fato 4);
- sete pais mais `motivos`, não ~11 (fato 5);
- os embeds e a regra do mesmo nome (fato 6);
- a lista de uniques: `itens (lower(nome))` não existe; entram `filiais_nome_chave_uidx`, o apelido, as PKs do import
  e os dois parciais; são três de expressão (fato 7);
- os dois uniques do snapshot, e a leitura de `empresa_id` que a chave exige (fato 8);
- o `ON CONFLICT` que quebra na janela (fato 10);
- a janela destrutiva abrindo `movimentacoes`/`lancamentos_item` (fato 13);
- a diagonal global que vaza nome (fato 15);
- 14 chamadas advisory, não 13, e a colisão que não existe com ids globais (fatos 17 e 18);
- o "pronto quando" contra a regra 2 (fato 19);
- `concurrently` proibido pelo MCP e `not valid` inútil na mesma migration (fato 22);
- as três decisões do Johnny (os índices de lista na F66, a guarda em toda tabela de negócio, o seed fora);
- o artifício `raise notice` → `warning` dispensado (Frente B).

Declare também o que este prompt acrescenta à ficha:
- o censo dos consumidores;
- a contagem de violações nos dois bancos;
- o conferidor no ENSAIO como portão do embed;
- a troca de FK de mesmo nome;
- a diagonal por empresa;
- a integridade de `termos_gerados`;
- o passo pós-deploy;
- os rollbacks encadeados;
- a correção dos comentários que prometiam à F65 o que é da F67.

# Git e segurança
- **Branch** `f65-integridade-do-tenant`, com commits pequenos e frequentes e mensagens em pt-BR no padrão
  conventional (`docs(f65): …`, `test(f65): …`, `feat(f65): …`, `fix(f65): …`, `refactor(f65): …`, `chore(f65): …`).
- **Documentação primeiro.** Commite também esta ordem (`docs/prompts/F65-integridade-estrutural-do-tenant-ultracode.md`)
  num commit de documentação. O `PLAN-F65.md` vem antes do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os lotes vão em commits separados, nesta ordem:**
  1. as travas vermelhas;
  2. os pais;
  3. as FKs, por família;
  4. `motivos` e o import;
  5. os uniques e o snapshot, com o TS da chave no mesmo commit;
  6. `colaboradores` (o unique e o `onConflict`);
  7. os gatilhos;
  8. os roteiros e os rollbacks;
  9. os catálogos e os tipos;
  10. o injetor;
  11. os documentos;
  12. a versão.

  Cada migration leva o `db:lock` no mesmo commit.
- **Pushes agrupados**: cada um custa CI numa cota apertada.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece quando:
  - `verificar` e `banco-sem-docker` estão verdes;
  - o `relfilenode` é igual nos dois bancos;
  - o `(chave, xmin)` é igual no ensaio, e igual ou explicado só pela janela em produção;
  - o conferidor deu 0 recusadas no ensaio e em produção.

  Depois do merge: a evidência vai por um PR só de documentação, e qualquer correção de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `update`, `cascade`,
  `concurrently`, abrir a janela `estoque.dev_destrutivo`, `force row level security`;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; matar sessão do app; imprimir ou gravar id, código,
  slug, termo, rótulo, nome, e-mail, patrimônio ou texto de linha real (nem em log, nem em evidência, nem na resposta);
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de
  10/09); ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha e token;
- **no repositório:** mexer na proteção da `main` ou no workflow, instalar dependência, mexer nos PRs do dependabot,
  subir número da linha de base, mudar embed de `formas/**`.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local` e que, de banco, só lê catálogo,
contagens e hashes. As frentes de exploração:
- (a) **as relações e os embeds**: as 23 FKs e as ações delas, os pais, todo embed com e sem dica em `src/**` e
  `scripts/**`, e a doc do PostgREST sobre FK composta e ambiguidade (fatos 4 a 6);
- (b) **os uniques e os consumidores**: a lista do fato 7, `CONSTRAINTS_TRADUZIDAS`, `erros-do-banco-sql.test.ts`, todo
  `ON CONFLICT`/`upsert`/`.single()` por chave natural, os leitores SQL por chave natural sozinha, e o laço do snapshot
  (fatos 7 a 12);
- (c) **a imutabilidade e os gatilhos**: `guarda_acervo` e a janela, `aplicar_movimentacao`, a diagonal,
  `persistirTermo` e `termo_ancora_coerente`, as travas advisory e os ids (fatos 13 a 18);
- (d) **os catálogos, as travas, o injetor, os tipos, os rollbacks e o classificador**: o bloco 5 e o 15h, "ninguém
  lê", o teto, o `db:types:diff`, a cadeia `f62`→`f63`→`f64`, e os oito roteiros com segunda empresa (fatos 20 a 23 e
  27);
- (e) **os bancos, só leitura e só catálogo/contagem/hash**: os fatos 1 a 5, 7, 13 e 16 a 18 remedidos, a contagem de
  violações, e o texto das duas impressões ensaiado no ensaio.

Escreva `docs/PLAN-F65.md` antes de implementar. **A edição é sequencial**: as migrations, os roteiros e os catálogos se
cruzam. Paralelize exploração, medição e revisão, não edição.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**, contra o
`PLAN-F65.md` e os 28 critérios, com estas perguntas:
- Alguma migration reescreve tupla, usa `cascade`/`concurrently`, ou deixa um estado entre duas migrations que não é
  repouso válido?
- Alguma FK composta nasceu com nome diferente da simples, ou com ação diferente? Sobrou algum par de tabelas com duas
  relações?
- Algum embed de `formas/**` muda de forma (cardinalidade, nulidade) com a FK composta?
- Algum unique perdeu o nome contratual, em algum estado intermediário?
- A PK de `motivos` pode cair antes da FK em alguma ordem de execução?
- O `ON CONFLICT` funciona antes, durante e depois do deploy?
- `guarda_empresa` tem qualquer caminho que deixe `empresa_id` mudar (janela, outro gatilho `BEFORE`, `insert … on
  conflict do update`)?
- A diagonal ainda vaza nome de filial alheia em algum ramo?
- O gatilho de `termos_gerados` trava o caminho legítimo de `persistirTermo`?
- As três travas são derivadas do catálogo, ou há lista à mão que esquece uma tabela? E os uniques de expressão e
  parciais estão cobertos?
- A trava "ninguém lê" ficou tautológica, ou as exceções são fechadas e por comando?
- Os rollbacks das F62, F63 e F64 ainda rodam depois da F65? O da F65 recria os nomes de antes?
- Alguma sabotagem prova só o caminho feliz? Alguma FK foi provada sem o par simétrico?
- Alguma evidência tem dado real?
- Algum arquivo fora do escopo foi tocado (embeds, seed, workflow)?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado,
não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F65.md`, em pt-BR, no padrão dos relatórios F45→F64, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, o passo pós-deploy, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B
  completo, se o MCP faltou; a contagem de violações, se ela barrou);
- depois do deploy, entrar com a própria conta e conferir que tudo está como sempre:
  - cadastrar e editar filial, tipo de item, colaborador, item, kit, apelido e motivo;
  - "Consolidar colaboradores";
  - registrar uma movimentação e uma transferência entre filiais;
  - gerar um relatório consolidado e ver a lista de gerados;
- conferir `/api/saude` com `1.70.0` e a Parte B do `saude.yml` verde no dia seguinte, sem issue de alarme aberta;
- o `git diff v1.69.0 v1.70.0 --stat`, com o que deve e o que não deve aparecer;
- os lembretes: os índices de lista são da F66, o default cai na F67, e o seed de duas empresas está no backlog.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas catorze já
  conhecidas;
- as três decisões do Johnny e as **catorze decisões** da fase;
- o censo dos consumidores;
- **a contagem de violações e a impressão antes × depois nos dois bancos** (linhas, `relfilenode`, md5, catálogo, a
  janela);
- o conferidor no ensaio e em produção;
- as sabotagens com saída real;
- a contagem final;
- os 28 critérios autoverificados;
- o estado de repouso, inclusive o intermediário da decisão 5, se houver;
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que a empresa A não VÊ o dado da B (é da F66/F72: aqui só o banco recusa a LIGAÇÃO cruzada);
  - que uma linha nova de uma segunda empresa receberia a empresa certa (o default é a WAP até a F67);
  - que os leitores por chave natural sozinha estejam certos com duas empresas (F66/F67);
  - que o custo das listas mudou ou não mudou (nenhum índice de lista mudou; o custo novo é o da checagem de FK no
    INSERT, e só vale como provado se medido com o instrumental existente);
  - que os ids `smallint` não se esgotam;
  - que a janela de produção tenha ficado sem tráfego.

Pendências e **backlog nomeado**:
- **F66**: os índices de lista liderados por `empresa_id`, medidos (decisão 1); a leitura e o recorte nas policies; o
  join por código de `rel_*`;
- **F67**: o default das 20 e de `filiais`; os escritores; as guardas da F52, `idsDeAdminsAtivos` e
  `v_conflitos_filiais`; os leitores por termo/prefixo; o `max(versao)+1` sem empresa; as travas advisory que ela
  reescreve;
- **F68**: a porta pública por empresa;
- **Backlog nomeado** (decisão 3): o seed de duas empresas, `scripts/seed.test.ts` e o `onConflict` de `seed.ts:886`;
- **Backlog** (do `RELATORIO-F60.md`): a paginação keyset e a ordem visível no empate;
- **PATCH** (do backlog da F62): derrubar `profiles.papel`/`ativo` a partir de 13/10/2026;
- **Avulsos** (das F63/F64): `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` rastreados pelo git; o corpo vivo de
  `apagar_movimentacao`/`resetar_acervo` × o arquivo.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`guarda_empresa`, `empresa_id`); os nomes que a ficha fixa ficam como estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---
## Como executar

### Pré-voo (uma vez, ~15 minutos)

Esta fase **toca os dois bancos**: aplica migrations no ensaio e em produção pelo MCP da Supabase, antes do merge, e
talvez um passo pequeno depois do deploy (decisão 5). Ela troca 23 FKs, sete pais, catorze uniques e põe gatilho em até
20 tabelas. É a fase de constraint mais larga da virada. O item do pré-voo que mais importa continua sendo o MCP: nas
F60, F63 e F64, ele amanheceu com as ferramentas desligadas uma a uma nas configurações do conector.

Este arquivo já está salvo em `docs/prompts/F65-integridade-estrutural-do-tenant-ultracode.md`, **sem commit**. O
agente o commita na branch da fase. O prompt cita os 28 fatos do cabeçalho pelo número, então o arquivo precisa estar
lá quando você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.69.0, tag v1.69.0 no merge do PR #76 (469632b); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short
Test-Path .git\index.lock    # tem de dar False — uma trava órfã derruba o primeiro commit da run
Test-Path docs\prompts\F65-integridade-estrutural-do-tenant-ultracode.md   # tem de dar True

# 3. Produção com a mesma versão, e a Parte B do saude.yml verde hoje (sem issue de alarme aberta).
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
& "C:\Program Files\GitHub CLI\gh.exe" run list --workflow saude.yml --limit 3
& "C:\Program Files\GitHub CLI\gh.exe" issue list --state open --limit 5

# 4. O smoke de produção passa HOJE — é a conferência pós-deploy da fase.
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
3. **Não use a tela de cadastro durante a janela do apply**, se estiver acordado vendo. A fase foi desenhada para
   janela zero (os nomes das FKs e dos uniques preservados, o `ON CONFLICT` em dois passos), e o conferidor no ensaio é
   o portão disso. Mas é a primeira fase que troca constraint com o app no ar. Qualquer horário do dia serve. A
   proposta da decisão 8 é não criar checagem de integridade nova, e nesse caso a Parte B das 06:43 não é problema. Se
   o agente criar uma, ele segue a ordem do alarme da F64, e o jeito limpo é não rodar de madrugada perto das 06:43.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f65
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP (antes do merge e, talvez, um passo
depois do deploy), abre e mergeia PRs, publica tag, dispara workflow e roda o smoke e o conferidor contra os dois
bancos. Nada disso cabe numa allowlist estreita. `bypassPermissions` numa máquina com credencial de produção está fora
de questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção, no merge na `main`, no push da tag,
no disparo da Parte B e no passo pós-deploy. As F53→F64 passaram por ele. Se barrar, o prompt manda não reformular: o
agente registra, segue no resto e põe o comando no topo do relatório.

**`--worktree` NÃO serve.** O smoke e o conferidor precisam do `.env.local`, que não vai para a worktree, e o prompt
proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** É maior que a F64: a troca das 23 FKs sem quebrar o PostgREST, as três travas de catálogo derivadas (com
expressão e parcial), o laço do snapshot, a diagonal e os rollbacks encadeados. Rode tudo no modelo forte. A revisão
adversarial (os embeds, o `ON CONFLICT`, a janela da guarda) é onde ele mais rende. Só se a cota semanal estiver
apertada, use `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`, para economizar na exploração.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F65.md, docs/f65-evidencias/impressao-tenant.sql e docs/f65-evidencias/impressao-catalogo.sql existem; package.json em 1.70.0; docs/RELATORIO-F65.md existe; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, as migrations 0165+ aplicadas no ensaio e em producao (e o passo pos-deploy, se houver, aplicado nos dois), com docs/f65-evidencias/antes preenchido, a contagem de violacoes em 0, o relfilenode das 20 tabelas igual antes e depois nos dois bancos, o md5 de (chave, xmin) igual no ensaio e igual ou explicado so pela janela em producao, o conferidor de formas com 0 recusadas no ensaio e em producao, o smoke apos o apply sem falha, a conferencia pos-deploy e a Parte B passaram sem issue de alarme aberta e a tag v1.70.0 foi publicada; (b) o apply de producao nao aconteceu (classificador barrou, lock nao veio em tres tentativas, ou violacoes acima de 0): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F65.md; (c) tudo aplicado e mergeado, mas o passo pos-deploy, o push da tag ou a conferencia barrados, com o comando no topo do docs/RELATORIO-F65.md; (d) sem MCP da Supabase: PR aberto sem merge, com o caminho B e as duas impressoes para rodar antes e depois no topo do docs/RELATORIO-F65.md; (e) o relfilenode ou o md5 divergiu, ou o conferidor/smoke recusou: rollback aplicado (ou, se barrado, o comando do rollback no topo), PR sem merge e a causa no topo do docs/RELATORIO-F65.md; ou (f) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F65.md
```

**Headless.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f65.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f65.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f65.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. Como esta fase aplica em
produção, **prefira a sessão interativa deixada rodando, com o `/goal`**, e com a suspensão do Windows desligada no
plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Seis momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F65.md` e `docs/f65-evidencias/antes/`, com a contagem de violações (tem de ser 0) e as
   duas impressões nos dois bancos, antes de qualquer migration aplicada. Só contagens, nomes de objeto de esquema e
   hashes: se aparecer um código de motivo, um slug, um termo, um nome ou um patrimônio ali, interrompa a sessão.
2. **As travas vermelhas.** `forma_multiempresa`, `unicidade_por_empresa` e `imutabilidade_tenant` reprovando pelos
   nomes, antes de qualquer correção.
3. **O ensaio.** O `relfilenode` igual nas 20, os md5 idênticos e **o conferidor de formas no ensaio com 0 recusadas**.
   É o portão do embed.
4. **A produção.** O mesmo, mais o smoke logo depois do apply e o conferidor com 0 recusadas. Se algum falhar, o prompt
   manda fazer o rollback na hora, e o relatório diz isso no topo.
5. **O passo pós-deploy**, se a decisão 5 o criou: a migration do `colaboradores` aplicada nos dois bancos depois de o
   `/api/saude` mostrar o commit do merge.
6. **A conferência.** `/api/saude` em `1.70.0`, o smoke com 0 falha, a Parte B verde e nenhuma issue de alarme aberta.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Entre com a sua conta em produção e faça o roteiro do topo do relatório:
   - cadastre e edite filial, tipo, colaborador, item, kit, apelido e motivo;
   - rode "Consolidar colaboradores";
   - registre uma movimentação e uma transferência;
   - gere um relatório consolidado.

   Tudo tem de funcionar como antes.
3. `git diff v1.69.0 v1.70.0 --stat`. Devem aparecer:
   - `supabase/migrations/0165_*` em diante, `supabase/migrations.lock.json`, `supabase/rollback/F65-desfaz.sql` e
     `supabase/tests/**` (as três travas novas, o roteiro da fase e `f65_rollback.sql`; os três rollbacks anteriores; e
     talvez os roteiros com segunda empresa, cada um explicado no relatório);
   - `src/lib/relatorios/versao-snapshot.ts` e o teste dele, `src/lib/queries/gerados.ts` e
     `src/lib/actions/colaboradores.ts`;
   - `src/lib/supabase/erros-do-banco.ts` e `src/lib/actions/erros.ts`;
   - os testes de `src/lib/validators/`, `src/lib/supabase/` e `src/lib/itens/`, e talvez `scripts/db/mutacoes.mjs`;
   - `src/lib/types/database.ts`;
   - `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`.

   **Não** devem aparecer:
   - `src/lib/queries/formas/**` (nenhum embed muda);
   - `src/components/**` e `src/app/**`;
   - `scripts/seed.ts`, `scripts/reset.ts`, `scripts/import/**` e `scripts/db/restaurar.mjs`;
   - migration antiga alterada;
   - `scripts/smoke/linha-de-base.json` com número que SUBIU;
   - `.github/workflows/**`;
   - mudança de dependência no `package-lock.json`.
4. Abra `docs/f65-evidencias/`: a contagem de violações, as impressões antes × depois dos dois bancos, o conferidor no
   ensaio e em produção, e a saída das sabotagens.
5. Rode você mesmo `npm run test` uma vez.
6. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A `v1.69.0` está fechada e no ar.** Medido: `main` em `469632b` com a tag `v1.69.0`, e o ledger dos dois bancos
   terminando em `kit_motivo_da_empresa`. O `/api/saude` e o estado do CI não foram consultados daqui; o pré-voo
   confere.
2. **O agente aplica no ensaio E em produção, antes do merge**, pelo MCP. É o fluxo das F53→F64, não decisão nova sua.
   Sem MCP, é caminho B e PR sem merge.
3. **Uma run, um PR de código e um PR de documentação com a tag**, no molde das F58→F64. Versão `1.70.0` (fase =
   MINOR).
4. **"Toda tabela de negócio" foi lida como as 20 de `k_negocio`, inclusive `movimentacoes` e `lancamentos_item`.** A
   opção que eu te mostrei dizia "~18, sem as que têm `guarda_acervo`", mas a medição mostrou que a janela destrutiva
   abre essas duas ao UPDATE. Então o "sem exceção na janela" só vale literalmente com as 20. O prompt deixa o agente
   tirar as duas só se ele provar que a FK composta as segura dentro da janela. **Se você prefere as 18 de qualquer
   jeito, me diga e eu ajusto.**
5. **Os índices de lista vão TODOS para a F66**, inclusive `(empresa_id, ordem)` e o `(empresa_id, updated_at desc,
   id)` de `/ativos`. A F65 só cria os índices que nascem com os uniques.
6. **Janela zero no "Consolidar colaboradores"**, com um passo depois do deploy: a única migration aplicada depois do
   merge, no mesmo PR, já rodada no CI. É desvio consciente do "tudo aplicado antes do merge", e vai declarado. A
   alternativa seria aceitar ~8 minutos em que essa ação falha.
7. **`termos_gerados` ganha um gatilho de coerência de empresa, sem checagem de integridade nova.** É a proposta, e o
   agente decide. Sem checagem nova, a Parte B não entra na dança da F64.
8. **A diagonal do vocabulário entra na F65**, embora a ficha não a cite. É o que torna verdadeira a "filial única por
   empresa", e ela vaza o nome de filial alheia pela mensagem.
9. **Os ids ficam `smallint` globais, e nenhuma trava advisory converte.** Com ids globais, a colisão da ficha não
   existe. Alargar o tipo mexeria em 19 colunas e 29 assinaturas.
10. **As guardas no-op da F52 e `idsDeAdminsAtivos` ficam com a F67**, que é o que a ficha manda, embora três
    comentários do repositório e uma linha da `DECISOES.md` digam "F65". A fase só corrige o texto desses comentários.
11. **O rollback num banco vivo roda pelo `execute_sql`**, com o conteúdo exato de `supabase/rollback/F65-desfaz.sql`
    que o CI ensaiou. É a única escrita fora do `apply_migration`, e só num desfecho ruim.
12. **A contagem de violações deve dar 0** (há uma empresa só). Se não der, o agente não aplica, e a decisão fica com
    você.

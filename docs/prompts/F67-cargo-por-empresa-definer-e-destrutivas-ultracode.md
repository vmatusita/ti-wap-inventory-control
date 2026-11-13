# F67 — O cargo por empresa, as `security definer` e as destrutivas

Ordem de serviço da fase **F67** do `PLANO-MULTIEMPRESA.md` (§7). Pela decisão 2 do Johnny (12/11/2026), a ficha original
"Escrita, definer, Storage e Realtime por tenant" virou **três fases**. Esta é a primeira:
- **F67**: o cargo por empresa, as `security definer`, as RPCs destrutivas, a mesa de conflitos e a trava do termo;
- **F67B**: Storage e Realtime;
- **F67C**: o fim do default `empresa_legada()`, quando a escrita passa a informar a empresa.

**Quem escreve as fichas F67B e F67C é esta fase**, com a distribuição fechada na conversa que gerou esta ordem (Frente
F). Ela também reescreve a ficha F67 com o escopo estreito e os números medidos.

Hoje o cargo de cada pessoa só existe na empresa legada (a WAP), pela ponte da F62. Com uma segunda empresa, um admin da
B teria o cargo vindo da WAP, e `pode_escrever_filial` diria "sim" a qualquer admin em qualquer filial, de qualquer
empresa. Esta fase faz o cargo valer **por empresa** em tudo que atravessa a RLS: as funções `security definer`, as RPCs
que destroem e a gestão de contas.

Ela entrega:
- **o cargo por empresa de verdade.** Funções por empresa, com a empresa testada ANTES do cargo e argumento nulo
  fechando. O cargo "sem empresa" (`papel_atual()`, `e_admin()`, `pode_escrever()`) só sobrevive como **piso de
  policy**, sempre em conjunção com o recorte do MESMO cargo. Todo outro consumidor passa à forma por empresa;
- **as `security definer` alcançáveis conferem a empresa.** `definer_sem_tenant.sql` passa a exigir uma primitiva POR
  EMPRESA, não só classificação;
- **`p_empresa` como 1º parâmetro** das destrutivas da Zona destrutiva, da prévia, da mesa de conflitos, do import de
  startup e das cinco RPCs de gestão de conta. A confirmação do "tudo" carrega a quantidade, e nenhum alcance de RPC
  atravessa empresas;
- **conflito entre empresas impossível por construção**: as views, a trava advisory e a recusa;
- **a trava do termo**: o banco recusa emitir termo para empresa sem modelo próprio (hoje, toda que não seja a WAP);
- **as fichas F67B e F67C**, escritas.

Três condições não se negociam:
- **Nada muda para a WAP.** Cada membership ativa, em produção, responde igual antes e depois, em toda função de cargo
  e de escopo. A prova é conta a conta, só contagem. O smoke, o conferidor e a Parte B (com os números do #84 travados)
  continuam iguais.
- **Zero janela.** Em nenhum momento o app no ar chama uma assinatura que não existe. A nova nasce ao lado da antiga, o
  app novo vai ao ar, e a antiga só sai depois da prova de que ninguém mais a chama (decisão 2 de hoje).
- **Nenhum dado de negócio muda.** Esta fase reescreve funções, views e gatilhos, não linhas. Nenhum `update`/`delete`
  em tabela de negócio fora do que um roteiro faz dentro de transação desfeita.

**As decisões do Johnny.**

De 12/11/2026, na conversa da F66B:
- **(12/11-2)** a F67 vai ser dividida em três (acima);
- **(12/11-3)** as duas contas dev continuam em `membros` por ora. Na F67, `e_dev()` passa a ser "dev da empresa OU
  `e_plataforma()`". A saída de `membros` vai para a F69, junto com quanto a plataforma enxerga.

De 13/11/2026, na conversa que gerou esta ordem:
1. **"dev sou só eu."** A pergunta foi se a Zona destrutiva de uma empresa devia exigir ser dev DAQUELA empresa, já que
   as duas contas dev estão em `plataforma_admins` e, ao pé da letra, a 12/11-3 as deixa destruir dado de qualquer
   empresa. A resposta: o cargo dev é só dele (as duas contas são dele, uma por máquina), e a plataforma é ele. **Logo,
   a 12/11-3 vale também para a Zona destrutiva**:
   - `e_dev` por empresa = dev membro ativo daquela empresa OU `e_plataforma()`;
   - o Johnny resetar, apagar ou forçar dado de qualquer empresa é o desenho, não o defeito;
   - a trilha (`eventos_admin`) grava a empresa ALVO e o autor.

   Registre a frase literal na ata. A forma (dev = plataforma, fora de `membros`) é da F69.
2. **Expandir e contrair, zero janela** (molde da F60): a assinatura nova nasce ao lado da antiga, o app novo vai ao ar,
   e a antiga sai na mesma run, depois da prova de que ninguém a chama.
3. **A F67 convive com o alarme #84, com os números travados.** A Parte B do `saude.yml` está vermelha desde 19/10 por
   dois achados de DADO de produção. A conferência exige os MESMOS dois achados, remedidos no começo da run. Qualquer
   número maior, ou achado novo, reprova. O diagnóstico do #84 é entrega avulsa à parte.

---

## Estado de partida: os 28 fatos medidos (13/11/2026)

> O prompt cita estes fatos **pelo número**. Todos foram medidos hoje no disco e no git, com os corpos de função lidos
> pelo `scripts/db/corpo-vigente.mjs` (a última definição na cadeia, sem comentário). **Nenhum foi medido nos bancos
> vivos** nesta conversa: o conector da Supabase daqui não enxerga os projetos da WAP. Divergência da ficha está marcada
> com ⚠. **Remeça tudo antes de aceitar.**

**Onde o projeto parou**

1. `origin/main` em **`8f4b50d`** (merge do PR #93, o pós-deploy da F66B). A tag anotada **`v1.72.0`** está nesse mesmo
   commit. `package.json` em `1.72.0`, cópia na `main`, e fora do git só este arquivo (mais, talvez, um `.cv-tmp.mjs`
   esquecido pela conversa que gerou a ordem: ele não é da fase; se existir, não commite).
   - Última migration: **`0184_comprimento_registros.sql`**, aplicada nos dois bancos. **A primeira desta fase é a
     `0185`.** ⚠ A ficha diz "migrations `0160`–`0165`": numeração de antes da F63.
   - Versão: **`1.73.0`** (fase = MINOR, regra 8).
   - Checks obrigatórios da `main`: **`verificar`** e **`banco-sem-docker`**.
   - Produção `pbtjcalbmepmrqzprusb`, ensaio `sgmvldiizsrjbxzzpmhh`, Postgres 17.6.
2. **A rede de hoje** (relatório F66B, §8):
   - mesa: 268 arquivos com 8.442 testes;
   - CI: 57 roteiros SQL com 1.203 asserções e 0 ✗;
   - injetor em **163/163**, quarentena 2;
   - smoke: *"109 OK · 1 aviso (kits_modelos) · 0 falha"*;
   - conferidor de formas: 272 pontos, 0 recusadas;
   - gate de tipos: 38 relações · 358 colunas · 95 funções.
3. **O mapa do `CLAUDE.md` bate**: os diretórios de topo de `src/lib` e `src/components` e os 14 `CLAUDE.md` aninhados.
   Remeça no começo (é a regra do `CLAUDE.md`).
4. **A Parte B está vermelha desde 19/10** (issue de alarme **#84**), por dois achados de integridade de DADO de produção:
   - `backup_orfao` 12 (linha de base 10);
   - `detentor_em_estado_sem_dono` 1 (linha de base 0).

   Medidos em 12/11, antes e depois do apply da F66B. A deriva está limpa. Pela decisão 3, esses números são travados no
   começo da run.

**O cargo hoje**

5. **As funções de cargo:**
   - `papel_atual()` (`0158`) responde pela membership na **empresa legada** (`empresa_legada()`, `0152`, o uuid fixo
     `…0001`);
   - `e_admin()`, `e_dev()` e `pode_escrever()` (`0072`) derivam dela;
   - `pode_escrever_filial(fid)` (`0158`) devolve **`true` para dev/admin em QUALQUER filial**, de qualquer empresa (o
     defeito que a ficha nomeia: o teste de cargo vem antes de qualquer teste de empresa). O operador vale pelo vínculo
     na legada;
   - `e_plataforma()` (`0154`) exige membership ativa na legada e **não tem consumidor nenhum** hoje;
   - `unidades_de_escrita()`, `empresas_de_admin()`, `empresas_de_escrita()` e `empresas_do_membro()` (`0157`) JÁ
     respondem por todas as memberships ativas;
   - **`pode_escrever_unidade` não existe.**
6. **⚠ O `create or replace` não muda a lista de parâmetros.** A ficha diz "`papel_atual()` ganha `p_empresa uuid`, e
   `e_admin`/`pode_escrever` acompanham". Medido:
   - as três são citadas por policy. Nas `0175`–`0178` há 50 citações de piso:
     - 19 `(select papel_atual()) is not null`, com `empresas_do_membro()`;
     - 27 `(select e_admin())`, com `empresas_de_admin()`;
     - 4 `(select pode_escrever())`, com `empresas_de_escrita()`;

     e todas as que li estão em conjunção com o recorte **do mesmo cargo**;
   - acrescentar um parâmetro cria uma função NOVA (sobrecarga), que é ambígua na chamada sem argumento e que a
     asserção 2 de `catalogo_secdef.sql` reprova ("nenhum nome `security definer` tem mais de uma assinatura viva");
   - dropar a antiga exige `cascade` por causa das policies, e `cascade` é proibido.

   **As formas por empresa precisam de OUTRO nome. As sem empresa mudam de corpo por `create or replace`.** Confirme na
   documentação do PG 17 (regra 6): `sql-createfunction` sobre trocar tipo de argumento, e `sql-dropfunction` com a
   dependência de policy.
7. **Os consumidores no CORPO de função** (vigente, sem comentário, 13/11). `*` = `security definer`:
   - `papel_atual()`: `checagens_integridade_resumo*`, `ledger_de_migracoes*`, `pode_ler_arquivo_termo*`,
     `pode_escrever_filial*`, mais `e_admin*`, `e_dev*` e `pode_escrever*`, que derivam dela;
   - `e_admin()`: `apagar_ativos_conflito_filiais*`, `exigir_gestao_de*`, `importar_ativos_substituir*`,
     `pode_escrever_termo*`;
   - `e_dev()`: `apagar_usuario*`, `dev_checagens_integridade*`, `encerrar_sessoes_usuario*`, `exigir_dev_para_destruir*`,
     `exigir_gestao_de*`, `ultima_migracao_aplicada*`;
   - `pode_escrever_filial(`: `importar_ativos_substituir*`, `pode_escrever_termo*`, e **sete INVOKER que escrevem**
     (`confirmar_assinatura_termo_com_anotacao`, `criar_compra_lote`, `criar_movimentacao_com_itens`,
     `definir_service_tag_com_anotacao`, `desfazer_confirmacao_termo_com_anotacao`, `lancar_itens_lote`,
     `transferir_item`);
   - `empresa_legada()`: 11 (`apagar_usuario`, `checagens_integridade_nucleo`, `definir_papel_usuario`,
     `definir_status_usuario`, `definir_vinculos_usuario`, `e_plataforma`, `exigir_gestao_de`,
     `existe_outro_admin_ativo`, `handle_new_user`, `papel_atual`, `pode_escrever_filial`).
8. **Os consumidores fora das 20 tabelas de negócio**, onde o piso NÃO tem recorte:
   - a policy de `membros` (`0153:165`: `papel_atual() is not null`, sozinha);
   - as policies de `storage.objects` (bucket `termos`, `0021`/`0066`/`0069`/`0129`; bucket `backups-import`,
     `0031`/`0066`/`0072`);
   - e as de `profiles`, `empresas` e `plataforma_admins`. **Meça no catálogo**: esta é a medição que mais importa da
     fase (fato 6 + decisão 3).
9. **Os consumidores no TS:**
   - `src/lib/auth/acesso.ts:121`: `chamarRpc(supabase, 'papel_atual')`;
   - `src/lib/auth/acesso.ts:154`: `pode_escrever_filial`;
   - `EMPRESA_LEGADA_ID` (`src/lib/auth/empresa-legada.ts:12`, o espelho da `0152`) em `acesso.ts:201` e em
     `queries/admin.ts:163,164,230,289,338`;
   - `scripts/perf/medir-guarda.mjs:233,245`: `rpc('papel_atual')`;
   - `idsDeAdminsAtivos` (`queries/admin.ts:225`), usado em `actions/admin.ts:406` e `actions/dev.ts:127` (nota F65
     (e) da ficha: ela vai com as guardas da F52).

**As `security definer`**

10. **65 `security definer` em `public`**, todas classificadas em `catalogo_secdef.sql` (`k_secdef`). ⚠ A ficha diz
    "~37 funções que atravessam policy": é o inventário de antes da F52.
11. **A trava da F52, `definer_sem_tenant.sql`.** O universo é `security definer` ∧ executável por `authenticated` ∧
    recebe `uuid`/`uuid[]`/`smallint`/`text`. Hoje são **21**:
    - **18 em `k_escopo_ok`**: `pode_escrever_filial`; as cinco de conta (`apagar_usuario`, `definir_papel_usuario`,
      `definir_status_usuario`, `definir_vinculos_usuario`, `encerrar_sessoes_usuario`); `pode_escrever_arquivo_termo`
      e `pode_escrever_termo`; as oito da Zona destrutiva (`apagar_ativo`, `apagar_item`, `apagar_movimentacao`,
      `forcar_estado_ativo`, `forcar_saldo_item`, `previa_reset`, `resetar_acervo`, `resetar_itens`);
      `apagar_ativos_conflito_filiais`; e `importar_ativos_substituir`;
    - **3 exceções**: `estorno_item_coerente` (`0068`), `termo_ancora_coerente` (`0069`) e `pode_ler_arquivo_termo`
      (`0129`, que fecha por join na **F67B**).

    "Escopo ok" hoje = chamar uma de seis primitivas, e **nenhuma delas é por empresa**. ⚠ A ficha cita
    `definer-escopo.test.ts`: ele **não existe**; a trava é este roteiro, mais `catalogo_secdef.sql`.
12. **As guardas no-op da F52** (`0132`):
    - `mesmo_escopo_de_gestao(p_alvo)` = `select true`;
    - `exigir_ativos_da_empresa(p_ids)` = `perform 1 where p_ids is not null`;
    - `existe_outro_admin_ativo(p_excluindo, p_escopo)` (`0158`) tem `(p_escopo is null or true)` e conta as memberships
      dev/admin ativas da legada. O dev CONTA, de propósito (decisão 1 da `0074`).

    ⚠ A ficha manda tirar "a conta de plataforma do denominador, porque ela vive em `plataforma_admins`". Mas pela
    12/11-3 as contas dev continuam em `membros` até a F69: elas são membros dev da WAP e contam como tal. Resolva e
    declare.
13. **As primitivas de gestão:**
    - `exigir_gestao_de(p_alvo, p_papel_pedido)` (`0158`) lê o cargo do ALVO na legada e decide por
      `e_dev()`/`e_admin()` sem empresa;
    - `exigir_dev_para_destruir(p_justificativa)` (`0082`) = `e_dev()` + justificativa com ≥ 10 caracteres.

**As destrutivas, o import e a mesa**

14. **As assinaturas vigentes:**
    - `resetar_acervo(p_filial smallint, p_confirmacao text, p_justificativa text, p_backup_path text, p_contagens
      jsonb)` e `resetar_itens(…)`, mesmo formato (`0089`);
    - `previa_reset(p_bloco text, p_filial smallint)` (`0086`);
    - `apagar_ativo(p_ativo uuid, p_confirmacao text, p_justificativa text)` (`0082`), `apagar_item` (`0082`),
      `apagar_movimentacao` (`0090`);
    - `forcar_estado_ativo` (`0110`), `forcar_saldo_item(p_item smallint, p_filial smallint, p_saldo_alvo int,
      p_justificativa text)` (`0084`);
    - `apagar_ativos_conflito_filiais(p_ativos uuid[], p_confirmacao text, p_justificativa text, p_backup_path text
      default null)` (`0132`);
    - `importar_ativos_substituir(p_plano jsonb, p_backup_path text, p_contagens jsonb, p_correcoes jsonb default
      '[]')` (`0140`), mais as auxiliares fechadas do import (`import_apagar_acervo_filial` e as da `0131`/`0140`);
    - as cinco de conta (`0158`, por `exigir_gestao_de`).

    Leia o corpo vigente de cada uma, não a assinatura daqui.
15. **O "tudo" de hoje é o sistema inteiro.**
    - `resetar_acervo(p_filial => null)` apaga **todos os ativos de todas as empresas** (`where p_filial is null or
      a.filial_id = p_filial`, em sete comandos) e grava `'alcance' = 'global'` em `eventos_admin`;
    - a confirmação é `rotulo_alcance_reset(null)` = **`'RESETAR TUDO'`**, 12 caracteres e nenhuma quantidade (`0083`).
16. **As travas advisory** (censo da F65): **16 chamadas reais em 12 funções**.
    - A família `hashtext('import_substituir')` usa a forma `(int, int)` com `filial::int`. Ela é compartilhada pelo
      import e pelos dois resets, que têm **3** chamadas cada: o laço, a sentinela `-1` do "tudo" e o `else`.
    - A mesa usa `hashtext('conflito_apagar')`.
    - `(bigint)` e `(int, int)` são espaços de lock diferentes.
    - `filiais.id` é `smallint` único no sistema, então a chave POR FILIAL já não colide entre empresas. Quem precisa da
      empresa é a sentinela do "tudo" e a mesa.
    - **Na expansão, a assinatura antiga e a nova vivem juntas.** Se elas não tomarem a MESMA chave, o app velho e o
      novo deixam de se excluir mutuamente.
17. **`v_conflitos_filiais`/`_grupos`** (vigente `0134`, `security_invoker`): o `group by … having count(distinct
    filial_id) > 1` roda sobre `ativos` INTEIRA.
    - Com duas empresas, o gêmeo alheio forma grupo, e a mesa exibe marca, modelo, hostname, `colaborador_atual` e
      `setor_atual` dele.
    - Pior: ele autoriza a exclusão do próprio.
18. **Os leitores TS da nota F66 da ficha** (as linhas andaram):
    - `paresEmOutrasFiliais` (`src/lib/queries/import-logs.ts:249`);
    - `cadastrosComMesmaIdentidade` (`src/lib/ativos/identidade.ts:126`).
19. **A porta única de RPC** é `chamarRpc` (`src/lib/supabase/rpc.ts:212`, F58), com os schemas de forma em
    `src/lib/queries/formas/**` (o conferidor os usa). Quem chama as RPCs desta fase:
    - `actions/dev-destrutivo.ts` (`:422`, os resets, e as outras da Zona);
    - `actions/conflitos.ts`;
    - `actions/importar.ts`;
    - `actions/admin.ts` e `actions/dev.ts` (as cinco de conta);
    - `queries/dev-destrutivo.ts` (a prévia e os backups).

**O termo**

20. **`termos_gerados`:**
    - o escritor TS é só `actions/termos.ts` (`persistirTermo`, `:452`, com insert/update em `:473`, `:492`, `:525`,
      `:531`);
    - o gatilho `termos_gerados_ids_da_empresa` (`0173`) já confere que os ids dos arrays são da empresa do termo;
    - `empresa_id` tem default `empresa_legada()` (F63) até a **F67C**: até lá, todo termo do app nasce WAP. A trava se
      prova no roteiro, com a empresa B explícita;
    - os 7 modelos `.docx` (`src/templates/termos/`) carregam a identidade da WAP como texto fixo (decisão 7 do plano).
      Emitir para outra empresa é gerar documento falso.

**As provas e os instrumentos**

21. **`isolamento_tenant.sql` §10:**
    - **10e** afirma a PONTE ("quem é só da B não vê nada"). A F67 a INVERTE: quem é só da B vê o que é dela;
    - **10c/10d** (a direção B) rodam com o piso neutralizado numa subtransação. Com o piso por empresa, passam a rodar
      com as policies reais e ganham a ESCRITA (nota F66 da ficha);
    - **10g** prova a escrita cruzada pelas policies.
22. **`scripts/perf/conta-a-conta.mjs`** (F66) é um bloco só leitura que termina sempre em `raise`. Ele usa as claims de
    cada membership ativa, escolhida DENTRO do banco, e só devolve contagem. É o instrumento do "nada muda para a WAP":
    estenda com uma fase `f67`.
23. **A receita "A janela do `drop`"** (`RUNBOOK-BANCO.md`, F60):
    - a criação e o `drop` vão em ARQUIVOS SEPARADOS, no mesmo PR;
    - no CI e no ensaio, rodam na ordem da cadeia;
    - em produção, o `drop` é a última coisa, depois do deploy e da prova pelo `pg_stat_statements` (por papel, sem
      dado; `track_functions = none`), mais a prova estática (`git grep`) de que ninguém chama a antiga;
    - `drop function` sem `if exists` e sem `cascade`.

    ⚠ A F60 trocou NOME. Aqui o nome fica e a assinatura muda (decisão 2), então a sobrecarga existe **só nos bancos
    vivos**, entre o apply da expansão e o da contração. No CI a cadeia termina contraída, e a asserção 2 de
    `catalogo_secdef.sql` não a vê. Confira se alguma sonda de produção (Parte B, deriva, smoke) lê essa asserção. As
    destrutivas são raras: "Δ das novas > 0" (a condição (b) da F60) pode nunca acontecer na janela. A prova vira
    "Δ das antigas = 0 + prova estática + o SHA no ar = o merge", declarada.
24. **`src/lib/itens/migrations-f38.test.ts`** guarda funções INTOCÁVEIS e uma lista exaustiva de
    `RECRIACOES_AUTORIZADAS` por migration. Toda função que esta fase recria entra lá, nomeada. O diff contra o corpo
    vivo vai no cabeçalho da migration.
25. **O método** (ADR-003 + `RUNBOOK-BANCO.md`):
    - `apply_migration` do MCP é UMA transação; o CI (`psql -f` sem `-1`) não é;
    - cabeçalho `-- classe:` validado por `scripts/db/classificar-migration.mjs`; `db:lock` no mesmo commit; entrada em
      `DA_F38`; nome-sem-prefixo que não repete; `set lock_timeout = '2s'`/`reset`, sem `begin`/`commit`;
    - a seção "`security definer` — três exigências" (F52);
    - **proibidos**: `supabase db push`, `migration repair`, `db reset --linked`, reescrever `schema_migrations`;
    - a MATRIZ vai até **R-ACC-123**, então o próximo livre é o **R-ACC-124**;
    - rollbacks encadeados: `supabase/rollback/F62-1-*`, `F62-2-*`, `F63-desfaz.sql` … `F66B-desfaz.sql`, ensaiados
      por `f62_rollback.sql` … `f66b_rollback.sql`.
26. **Os bloqueios das fases recentes:**
    - a F66B começou com o conector da Supabase ligado a OUTRA conta (só "Invoice Control");
    - nas F60, F63 e F64, as ferramentas do MCP amanheceram desligadas;
    - na F65, o classificador de segurança barrou o apply do ensaio uma vez.
27. **O comprimento (F66B):**
    - toda coluna `text` nova numa das 20 tabelas de negócio nasce reprovada por `comprimento_por_coluna.sql`, até
      ganhar teto em `src/lib/validators/tetos-coluna.ts` e o CHECK na migration;
    - `import_logs.backup_path` tem teto 120 (hoje 49; ≈ 94 com a empresa no prefixo que a F67B vai pôr).
28. **As regras do `CLAUDE.md` que pesam aqui: 1, 2, 3, 5, 6, 7 e 8.** A 6 pede a documentação oficial: o PG 17
    (`CREATE FUNCTION`/`DROP FUNCTION` e as dependências, `pg_advisory_xact_lock`, `CREATE VIEW`/`security_invoker`,
    `CREATE TRIGGER`, `pg_stat_statements`) e o PostgREST (resolução de RPC sobrecarregada por argumentos nomeados).

---

## As frentes, e por que nesta ordem

- **A, o censo e o "antes".** Os 28 fatos remedidos; o `PLAN-F67.md`; a tabela-verdade dos consumidores do cargo
  (policies, corpos, TS); a tabela-verdade das `security definer`; o mapa de assinaturas antiga → nova com os chamadores;
  e o "antes" nos dois bancos, inclusive o conta a conta.
- **B, as travas, vermelhas.** A regra 4 da §4: trava antes da correção.
- **C, o banco.** A expansão em lotes, na ordem de dependência. A contração vai em arquivo separado, aplicada em produção
  só depois do deploy.
- **D, o TS.** Os chamadores passam `p_empresa`; a ponte TS fica EXPLÍCITA e contada.
- **E, os roteiros, o injetor e o rollback.**
- **F, os documentos**, inclusive a ficha F67 reescrita e as fichas F67B e F67C.
- **G, o fechamento, com ordem rígida.** Versão → revisão adversarial → SHA congelado → CI verde → no ensaio: expansão e
  provas, contração → em produção: expansão e provas → merge → deploy → conferência → a janela do `drop` → contração em
  produção → relatório → PR de documentação → tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F67 do `docs/PLANO-MULTIEMPRESA.md` (§7) no escopo estreito que a decisão 12/11-2 do Johnny fixou:
o cargo por empresa, as `security definer`, as RPCs destrutivas, a mesa de conflitos e a trava do termo. Ao terminar:
- existem funções de cargo POR EMPRESA, com nome próprio (fato 6). Elas testam a empresa ANTES do cargo, devolvem
  null/false para argumento nulo e têm `e_dev` por empresa = dev membro ativo da empresa OU `e_plataforma()`. Existe
  `pode_escrever_unidade(p_empresa, p_filial)`, que confere que a filial é daquela empresa;
- `papel_atual()`, `e_admin()` e `pode_escrever()` sem argumento só aparecem como PISO de policy, sempre em conjunção
  com o recorte do MESMO cargo. Nenhum corpo de função e nenhuma chamada TS as usa. Todo consumidor sem esse par passou
  à forma por empresa: com a empresa de verdade, ou com a LEGADA EXPLÍCITA onde o recorte é de fase futura, declarado e
  apontando a fase (decisão 3);
- `pode_escrever_filial(fid)` responde pela empresa da filial. O admin da A deixou de "poder" na filial da B;
- toda `security definer` do universo de `definer_sem_tenant.sql` confere a empresa por uma primitiva POR EMPRESA, e a
  trava exige isso (não só a classificação);
- as guardas da F52 (`mesmo_escopo_de_gestao`, `existe_outro_admin_ativo`, `exigir_ativos_da_empresa`) e
  `idsDeAdminsAtivos` têm corpo por empresa;
- as destrutivas da Zona destrutiva, `previa_reset`, `apagar_ativos_conflito_filiais`, `importar_ativos_substituir` e as
  cinco RPCs de conta recebem `p_empresa uuid` como 1º parâmetro e recusam (42501, frase pt-BR) linha, filial ou alvo de
  outra empresa. O "tudo" é "todas as filiais DESTA empresa", com a confirmação `RESETAR TUDO — <N> ATIVOS`. Nenhuma RPC
  alcança duas empresas;
- conflito entre empresas é impossível por construção: as duas views particionam por empresa; a mesa e o import recusam
  filial de outra empresa; e as travas advisory carregam a empresa onde a chave não a carregava;
- o banco recusa (42501, frase própria) gravar `termos_gerados` para empresa sem modelo próprio de termo (hoje: toda que
  não seja a WAP);
- `isolamento_tenant.sql` prova, nas duas direções e com as policies REAIS, que o admin da A não escreve em nada da B
  (`ativos`, `movimentacoes`, `lancamentos_item`, `termos_gerados` e as cinco RPCs de conta), que o admin da A não
  destrói nada da B, e que quem é só da B vê o que é dela (o 10e invertido);
- **zero janela**: as assinaturas antigas só saíram de produção depois do deploy e da prova de que ninguém as chama;
- **nada mudou para a WAP**: conta a conta em produção, antes × depois, 0 divergências; o smoke, o conferidor e a Parte B
  (com o #84 nos números travados) iguais;
- a ficha F67 do plano está reescrita com o escopo estreito e os números medidos, e as fichas **F67B** e **F67C** estão
  escritas com a distribuição desta ordem (Frente F).

Uma run, um PR de código (com a expansão e a contração em arquivos separados) e um PR de documentação com a tag.
Versão `1.73.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md`:
  - §1, §3 e §4, as 10 regras comuns (em especial a 2, estado de repouso; a 4, trava antes da correção; a 8, migration
    nunca se edita; a 10, a ORDEM de rollback);
  - a ficha **F67** inteira no §7, com as notas F63, F64, F65, F66 e F66B. É a FONTE DA VERDADE do que entra. Onde esta
    ordem e ela divergirem sem declaração, vale a ficha, exceto no que a decisão 12/11-2 tirou daqui (Storage, Realtime,
    o fim do default);
  - as fichas **F68**, **F69**, **F70** e **F72**, para saber o que NÃO antecipar.
- `docs/prompts/F67-cargo-por-empresa-definer-e-destrutivas-ultracode.md`: o cabeçalho, com os **28 fatos medidos** e
  as decisões do Johnny. Este prompt os cita pelo número.
- `CLAUDE.md`, `AGENTS.md`, `supabase/CLAUDE.md`, `scripts/db/CLAUDE.md`, `src/lib/auth/CLAUDE.md` e
  `src/lib/pendencias/CLAUDE.md`. As regras permanentes 1, 2, 3, 5, 6, 7 e 8.
- **Os moldes:**
  - a **F52** (`docs/PLAN-F52.md`, `RELATORIO-F52.md`): as guardas e a trava `definer_sem_tenant.sql`;
  - a **F60** (`RELATORIO-F60.md` §7): a janela do `drop`;
  - a **F62** (`PLAN-F62.md`, `RELATORIO-F62.md`): a ponte e a grade `cargo_equivalencia.sql`;
  - a **F66** (`RELATORIO-F66.md`, `PLAN-F66.md`, `docs/f66-evidencias/`): o conta a conta e a bateria de isolamento;
  - a **F66B** (`RELATORIO-F66B.md`), o último apply.

  Depois, o `RUNBOOK-BANCO.md` inteiro (as seções "`security definer`", "A janela do `drop`", "Rollback", os Anexos F65,
  F66 e F66B), o `ADR-002` §13–16, o `ADR-003`, a `docs/MATRIZ-REGRAS.md` (a numeração R-ACC vigente) e o
  `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e destinos, **nunca o `.env.local`**).
- O código, nesta ordem:
  - as migrations `0062`, `0072`, `0074`, `0082`–`0090`, `0092`–`0100`, `0110`, `0129`, `0131`, `0132`, `0134`,
    `0140`, `0152`–`0158`, `0173` e `0175`–`0178`, pelo corpo VIGENTE (`scripts/db/corpo-vigente.mjs`);
  - `supabase/tests/definer_sem_tenant.sql`, `catalogo_secdef.sql`, `catalogo_policies.sql`, `isolamento_tenant.sql`,
    `cargo_equivalencia.sql`, `cargo_dev.sql`, `cargo_em_membros.sql`, `conflito_filiais.sql`, `dev_destrutivo.sql`,
    `import_substituir.sql`, `storage_termo.sql`, `f66b_rollback.sql` e `_asserts.sql`;
  - `src/lib/auth/*` (`acesso.ts`, `empresa-legada.ts`), `src/lib/supabase/rpc.ts`, `src/lib/supabase/erros-do-banco.ts`,
    `src/lib/actions/{dev-destrutivo,conflitos,importar,admin,dev,termos}.ts`,
    `src/lib/queries/{admin,dev-destrutivo,import-logs}.ts`, `src/lib/queries/formas/**`, `src/lib/ativos/identidade.ts`
    e `src/lib/itens/migrations-f38.test.ts`;
  - `scripts/db/{classificar-migration,mutacoes,run-mutation-tests,corpo-vigente}.mjs`,
    `scripts/perf/conta-a-conta.mjs`, `scripts/perf/medir-guarda.mjs`, `scripts/formas/conferir.mts`,
    `scripts/smoke/smoke-prod.mjs`, `supabase/ci/impressao-schema.sql` e `.github/workflows/{ci,saude}.yml` (só leitura).

## O diagnóstico: CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
São 28 fatos, no cabeçalho desta ordem. Todos foram medidos no disco: **nenhum nos bancos vivos**. Remeça cada um
contra o disco e os dois bancos de hoje antes de agir. Onde a sua medição contrariar o número escrito, **a sua medição
ganha**, desde que vá para o relatório. Os que mais importam:
- **fato 1**: a primeira migration é a `0185`; a versão é `1.73.0`;
- **fato 4**: os dois números do #84, hoje, na primeira hora da run. Eles viram a linha travada da conferência;
- **fato 6**: o nome das formas por empresa e a impossibilidade de dar parâmetro a `papel_atual()`, confirmados na
  documentação;
- **fatos 7, 8 e 9**: TODOS os consumidores do cargo sem empresa (catálogo de policies de TODOS os esquemas, `prosrc` de
  TODAS as funções, views, TS, scripts). **O fato 8 é o mais perigoso**: um piso que passe a "em alguma empresa" numa
  policy sem recorte abre o bucket de backups da WAP para o admin da B;
- **fato 11**: o universo da trava, hoje, nos dois bancos;
- **fato 16**: as 16 chamadas advisory e as famílias de chave;
- **fato 23**: se alguma sonda de produção lê a asserção de sobrecarga.

## Comandos que já existem: use, não reinvente
- `npm run lint` · `npm run test` · `npm run typecheck` (= `npx tsc --noEmit`) · `npm run build` · `npm run contraste` ·
  `npm run verificar:actions`.
- `npm run db:lock`, obrigatório no commit de cada migration. `node scripts/db/classificar-migration.mjs` (e `--censo`).
- `npm run db:test`, `npm run db:test:mutations` e `npm run db:types:diff` precisam de Postgres e rodam no job
  `banco-sem-docker`. Na mesa, só se houver um Postgres 17 descartável que não seja nenhum dos dois bancos vivos (as F65
  a F66B usaram PGlite fora do projeto). O CI é a autoridade.
- Na Frente G: `node scripts/smoke/smoke-prod.mjs`; `NODE_OPTIONS=--conditions=react-server npx tsx
  --env-file=.env.local scripts/formas/conferir.mts --alvo=ensaio|producao --saida=docs/f67-evidencias/…`; e
  `node scripts/perf/conta-a-conta.mjs gerar|analisar|embrulhar …` com a fase nova.
- O MCP da Supabase: `list_projects`, `execute_sql` (só leitura), `apply_migration`, `list_migrations`, `get_advisors`
  (segurança E performance) e `generate_typescript_types`.

**Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`. **Não rode** `supabase db push`, `migration
repair` nem `db reset --linked`. **Não suba** `next dev`/`next start` contra o ensaio. **Não chame** nenhuma RPC
destrutiva, de conta ou de import em banco vivo: a prova delas é no CI.

# Escopo

## Dentro: sete frentes, nesta ordem

### Frente A: o censo e o "antes"
O primeiro entregável é `docs/PLAN-F67.md`, antes do primeiro commit que toque `supabase/`, `src/` ou `scripts/`. Ele
contém:
- **Os 28 fatos remedidos**, com cada divergência contra a ficha anotada.
- **A tabela-verdade dos consumidores do cargo** (decisões 2 e 3). Para cada uso de `papel_atual()`, `e_admin()`,
  `e_dev()`, `pode_escrever()`, `pode_escrever_filial(`, `e_plataforma()` e `empresa_legada()`, lido do catálogo nos dois
  bancos (policies de TODOS os esquemas, `prosrc`, views) e do código (TS, scripts):
  - onde está;
  - se é piso pareado com o recorte do mesmo cargo (e qual);
  - o destino: fica como piso / forma por empresa com a empresa de verdade / forma por empresa com a legada EXPLÍCITA e
    a fase que a recorta (F67B, F67C, F69, F70).

  Nenhuma linha fica sem destino.
- **A tabela-verdade das `security definer`** (decisão 4): as 65, com a classe da F48. Para as do universo de
  `definer_sem_tenant.sql` e as auxiliares fechadas que elas chamam: de onde vem a empresa (parâmetro, linha, filial,
  alvo), qual primitiva por empresa confere, e o que recusa.
- **O mapa de assinaturas** (decisões 5, 7 e 12): cada RPC que ganha `p_empresa`, com a assinatura antiga e a nova, e os
  chamadores TS (arquivo:linha) e scripts. Também a forma de retorno no `src/lib/queries/formas/**`, que não pode
  mudar sem declaração.
- **O desenho**, com as decisões 1 a 20 de "Autonomia" tomadas por escrito.
- **A ordem das migrations, a ORDEM DE ROLLBACK** (o inverso do apply), e a fronteira expansão | contração. Tudo escrito
  também no rodapé de cada migration.
- **O "antes", nos dois bancos**, pelo MCP, só leitura, em `docs/f67-evidencias/antes/`:
  - o md5 do `prosrc` de TODAS as funções de `public`, com assinatura;
  - o md5 de `qual`/`with_check` de TODAS as policies (`public` e `storage`);
  - os grants de EXECUTE das funções do universo;
  - as definições das duas views (md5);
  - os gatilhos de `termos_gerados`;
  - os advisors de segurança e de performance, contados por nível e nome;
  - **os dois números do #84** (a linha travada);
  - **o conta a conta "antes"**: para cada membership ativa, as respostas de todas as funções de cargo e de escopo que
    existem hoje (decisão 15).

  Só contagem, nome de objeto de esquema, texto de esquema e hash.

### Frente B: as travas, vermelhas
Cada uma nasce no commit anterior à correção, com a saída vermelha em `docs/f67-evidencias/`. Fica vermelha no PR em
rascunho e verde no commit seguinte (o molde das F64 a F66B).
- **`definer_sem_tenant.sql` exige escopo POR EMPRESA** (decisão 4):
  - `k_escopo_ok` deixa de aceitar as seis primitivas sem empresa. A função tem de chamar uma primitiva POR EMPRESA
    (lista nominal nova, conferida por NOME, nunca por prefixo: a asserção 3 de hoje), ou delegar a uma que chame;
  - `e_admin()`, `e_dev()`, `papel_atual()` e `pode_escrever()` sem argumento NÃO contam;
  - as exceções restantes têm motivo e migration atualizados, e `pode_ler_arquivo_termo` aponta a F67B.

  Hoje reprova pelas 18.
- **A trava do piso** (decisões 2 e 3), derivada do catálogo:
  - (a) nenhum `prosrc` de `public` chama `papel_atual()`, `e_admin()`, `e_dev()` ou `pode_escrever()` sem argumento,
    exceto a própria família do piso, numa lista nominal;
  - (b) toda policy (de qualquer esquema) que cita uma delas está em CONJUNÇÃO (no AND do topo da árvore, lida pela
    forma) com o recorte do MESMO cargo (`papel_atual` ↔ `empresas_do_membro`, `e_admin` ↔ `empresas_de_admin`,
    `pode_escrever` ↔ `empresas_de_escrita`/`unidades_de_escrita`);
  - (c) a que não está foi convertida para a forma por empresa.

  Hoje reprova por (a) e pelo fato 8.
- **`conflito_entre_empresas.sql`** (decisão 9): duas empresas com o MESMO patrimônio + service tag em filiais
  diferentes. As views não formam grupo entre elas; a mesa recusa apagar o da B pela A (42501); o import da A não
  enxerga o par da B como conflito; e o par legítimo dentro da A continua formando grupo e sendo apagável. Hoje reprova.
- **`termo_bloqueado.sql`** (decisão 11): um insert em `termos_gerados` com a empresa B leva 42501 com a frase; com a
  WAP, passa. Também como `postgres` (a trava mora no banco), e sem o gatilho, dentro da transação, o da B passa. Hoje
  reprova.
- **`isolamento_tenant.sql`, a direção B e a escrita**:
  - o **10e** invertido: com as policies reais, quem é só da B vê o que é dela;
  - o **10c/10d** com as policies reais (sem neutralizar o piso);
  - a ESCRITA da direção B nas quatro tabelas;
  - as cinco RPCs de conta: o admin da A não troca cargo, status, vínculo, sessão nem apaga conta de quem é só da B, e
    o par legítimo passa;
  - cada destrutiva: o dev membro só da A não destrói nada da B, e a plataforma destrói (decisão 1 do Johnny), com a
    trilha gravando a empresa alvo.

  Hoje o 10e novo reprova.
- **A trava das destrutivas** (decisão 5), no catálogo:
  - toda função da lista nominal de destrutivas tem `p_empresa uuid` como 1º argumento, sem default;
  - `rotulo_alcance_reset` contém `count(` (o texto da ficha);
  - nenhuma destrutiva tem `p_filial is null` sem `empresa_id = p_empresa` no mesmo comando (lido do `prosrc`, por
    comando).

  Hoje reprova.
- **A trava das chaves advisory** (decisão 8), de mesa sobre o replay das migrations: por família de chave, uma forma só
  em todos os corpos vigentes, inclusive os das assinaturas antigas que vivem na expansão; e a sentinela do "tudo"
  carrega a empresa. Hoje reprova pela sentinela.
- **A catraca TS** (decisão 13):
  - `EMPRESA_LEGADA_ID` e `empresa_legada()` só aparecem nos pontos da tabela-verdade, com o número EXATO e o destino
    escrito ao lado (F67C/F70). Subir o número reprova;
  - nenhum `chamarRpc` desta fase deixa de passar `p_empresa`: o tipo de `rpc.ts` o exige.

### Frente C: o banco (migrations `0185`+)
Migrations pequenas, por lote, na ordem de dependência. Cada uma leva:
- o cabeçalho de classe, validado pelo classificador;
- o diff contra o corpo vivo de cada função recriada;
- o rollback no rodapé;
- `db:lock` no mesmo commit; entrada em `DA_F38` e em `RECRIACOES_AUTORIZADAS` (fato 24);
- um nome-sem-prefixo que não repita;
- `set lock_timeout = '2s'`/`reset`, sem `begin`/`commit`;
- grants explícitos em toda função nova: `revoke all … from public, anon` e o `grant` mínimo, seguindo a seção
  "`security definer`" do RUNBOOK.

**Sem `update`/`delete` em tabela de negócio, sem `cascade`, sem DDL dinâmica, sem abrir a janela destrutiva, sem
mexer em default de coluna** (F67C).

A proposta de lotes (decisão 6; a ordem final é sua, escrita):
1. **As primitivas por empresa:** as funções por empresa (novas), `pode_escrever_unidade`, e o corpo novo de
   `pode_escrever_filial`, das sem empresa (o piso) e de `e_plataforma` (se a decisão 1 pedir).
2. **Os consumidores sem par:** as policies do fato 8 e os corpos do fato 7 que não ganham `p_empresa` (`pode_escrever_termo`,
   as de observabilidade). Tudo por `create or replace`/`alter policy`, sem trocar assinatura.
3. **As guardas e a gestão de contas, EXPANSÃO:** as guardas da F52 com corpo; `exigir_gestao_de` por empresa; as cinco
   novas, com `p_empresa`, ao lado das antigas.
4. **As destrutivas e o import, EXPANSÃO:** `exigir_dev_para_destruir` por empresa, `rotulo_alcance_reset` com a
   quantidade, as oito da Zona, `previa_reset` e `importar_ativos_substituir` novas, ao lado das antigas. As travas
   advisory convertidas em TODAS as funções da família, inclusive as antigas, nesta MESMA migration (decisão 8).
5. **A mesa, EXPANSÃO:** as duas views particionadas por empresa e `apagar_ativos_conflito_filiais` nova.
6. **A trava do termo.**
7. **A CONTRAÇÃO**, em arquivo separado: o `drop` das assinaturas antigas, sem `if exists` e sem `cascade`. Aplicada em
   produção só depois do deploy e da prova (Frente G, passo 10).

Se uma migration de expansão recriar uma assinatura antiga (por exemplo, para converter a trava advisory), a mudança
nela é SÓ essa, e o diff do `prosrc` prova isso.

### Frente D: o TS
- **Os chamadores** das RPCs que ganham `p_empresa` passam a empresa (decisão 13), sempre pela porta única
  (`chamarRpc`). O tipo da RPC é regenerado: `database.ts` muda SÓ nas assinaturas desta fase, e o
  `db:types:diff` confirma.
- **As guardas TS** (`src/lib/auth/acesso.ts`) passam a perguntar o cargo pela forma por empresa, com a empresa da
  operação; a do cargo de navegação usa a legada EXPLÍCITA (decisão 13). A mensagem pt-BR continua a mesma. Quem decide
  é o Postgres.
- **`idsDeAdminsAtivos`** por empresa (a nota F65 (e)), e **`paresEmOutrasFiliais`** e **`cadastrosComMesmaIdentidade`**
  pela empresa da filial ou do cadastro (a nota F66).
- **A Zona destrutiva**: a confirmação do "tudo" passa a ser `RESETAR TUDO — <N> ATIVOS`, com o N lido do banco (a
  prévia), nunca calculado no cliente. O texto da tela que mostra o que digitar acompanha.
- **As frases pt-BR** das recusas novas (empresa errada, termo bloqueado) em `erros-do-banco.ts`, pelo caminho que
  ele já usa. O teste confere que nenhuma frase cita objeto morto.
- **Os schemas de forma** (`src/lib/queries/formas/**`) acompanham só onde o retorno mudou, declarado. O conferidor
  continua com 0 recusadas.
- **`scripts/perf/medir-guarda.mjs`** acompanha a função de cargo que ele mede.

### Frente E: os roteiros, o injetor e o rollback
- **Os roteiros existentes** que chamam as RPCs antigas, ou que dependem da ponte (o 10e, `cargo_equivalencia.sql`,
  `cargo_dev.sql`, `dev_destrutivo.sql`, `conflito_filiais.sql`, `import_substituir.sql`): ajustados um a um, com a
  lista no relatório. Onde a asserção provava a PONTE e a fase a desfaz, ela vira a asserção do recorte, declarado.
  **Nenhuma asserção muda para passar.**
- **A grade de equivalência** (`cargo_equivalencia.sql`, F62) ganha a grade da F67. Para cada pessoa das fixtures e cada
  empresa, a forma por empresa com a WAP = a resposta da ponte de antes, célula a célula; e, com uma empresa só, o piso
  novo = o piso antigo.
- **O rollback**: `supabase/rollback/F67-desfaz.sql`, na ordem inversa. Ele cobre os dois estados: só expansão
  aplicada, e expansão + contração (que recria as antigas). É ensaiado por `supabase/tests/f67_rollback.sql` até a
  impressão do CI tirada antes da `0185`, com o irmão de mesa `rollback-f67.test.ts`. Os rollbacks F62 a F66B são
  medidos no CI com a F67 no lugar: se algum falhar, ele passa a rodar o da F67 antes, declarado.
- **O injetor** (decisão 16).

### Frente F: os documentos
- **A ficha F67, reescrita** no `PLANO-MULTIEMPRESA.md`:
  - o escopo desta ordem, os números medidos e o que foi para F67B e F67C;
  - as notas F63, F64, F65, F66 e F66B redistribuídas (cada uma no lugar novo, com ponteiro a partir da antiga);
  - a linha da tabela de fases;
  - a entrega real (as migrations e os roteiros desta fase).
- **A ficha F67B**, Storage e Realtime, no molde das fichas (Objetivo · Entra · Não entra · Entregas · Pronto quando ·
  Trava · Dependências · Risco · Reversão). Ela leva da ficha F67 original:
  - o bucket `termos` (`pode_ler_arquivo_termo` pelo join com `termos_gerados`, nunca pelo caminho);
  - o bucket `backups-import` (o prefixo `import/empresa-<id>/filial-<id>/`, as 4 policies com o recorte e `e_admin()`,
    os objetos legados invisíveis de propósito e escritos; o teto de `backup_path`, fato 27);
  - `persistirTermo` invertido + o `coalesce(…, true)` → `false`, e a ferramenta nomeada de órfão na Zona destrutiva;
  - o Realtime (`filter: 'empresa_id=eq.'` nas três assinaturas + RLS na publication);
  - as travas `storage_por_empresa.sql`, `src/lib/storage/caminho.test.ts` e a do `postgres_changes`;
  - do "pronto quando" original: os dois buckets e o termo degenerado (`ativo_ids = '{}'`) ainda apagável;
  - **e o que ESTA fase deixou explícito para ela**: as policies de `storage` que ficaram na legada EXPLÍCITA (decisão 3)
    e a exceção `pode_ler_arquivo_termo`.
- **A ficha F67C**, o fim do default. Ela leva:
  - a nota F63 (o orçamento das 18 funções SQL, 9 pontos TS, scripts, `restaurar.mjs`, 27 roteiros e os três casos
    sem pai);
  - a nota F64 (`eventos_admin` na origem, só no que esta fase não recriou; o default de `filiais`; `admin.ts:610`);
  - a nota F65 (a), (b), (c) e (d): os leitores por chave natural, o `update motivos … .eq('codigo')`, o vocabulário do
    import e o `max(versao)+1`;
  - as travas 15b/15e invertidas;
  - a ponte TS (`EMPRESA_LEGADA_ID`) e a "empresa de quem escreve";
  - **e o que ESTA fase deixou explícito para ela**: a catraca TS e as linhas da tabela-verdade com destino F67C.
- **A nota da F69**: a decisão 1 do Johnny ("dev sou só eu") como insumo da saída das contas dev de `membros`;
  `handle_new_user` (a membership nova nasce na legada) e as linhas com destino F69.
- **A nota da F70** (a empresa da sessão na tela substitui a legada explícita do TS) e a **da F71** (as frases do
  `CLAUDE.md` da raiz que o cargo por empresa deixou desatualizadas, listadas: este arquivo NÃO é editado aqui).
- **MATRIZ**: a emenda F67 a partir do R-ACC-124. Ela fixa:
  - o cargo por empresa e a ordem empresa-antes-de-cargo;
  - o piso sem empresa só em policy pareada;
  - toda destrutiva com `p_empresa` e nenhum alcance multi-empresa;
  - o conflito entre empresas impossível;
  - a trava do termo;
  - a plataforma na Zona destrutiva (decisão 1).
- **ADR e RUNBOOK**:
  - o `ADR-002` ganha a seção do cargo por empresa (§17), com a reversão da frase "nunca pelo cargo mais forte" da
    `0158`, se a decisão 2 a reverter, e o porquê;
  - o `RUNBOOK-BANCO.md` ganha o **Anexo F67**: "trocar ASSINATURA sem trocar o NOME" (expansão → deploy → a janela do
    `drop` → contração, com a sobrecarga viva só nos bancos), o rollback dos dois estados e a prova de zero chamadas
    para função rara.
- **Os `CLAUDE.md` aninhados** que descrevem uma função cujo contrato mudou (`src/lib/auth/CLAUDE.md`,
  `supabase/CLAUDE.md`, o da Zona se houver): atualizados. O da raiz, não (F71).
- **Índices**: `docs/README.md` e `docs/prompts/README.md`.
- **Ata** em `docs/DECISOES.md`: as decisões do Johnny (12/11-2, 12/11-3 e as três de 13/11, a 1 com a frase literal) e
  as vinte da fase.

### Frente G: o fechamento, nesta ordem
1. `1.73.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código:
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real. Por exemplo:
   - na Zona destrutiva, apagar tudo agora pede para digitar a quantidade de ativos que vai sumir;
   - apagar, importar, resolver conflito e gerir contas passaram a valer só dentro da empresa de quem faz. Para a WAP, o
     dia a dia é o mesmo;
   - o sistema recusa emitir termo de responsabilidade para empresa que ainda não tem modelo próprio.

   Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F67.md`. Depois dele, só `docs/**` e `CHANGELOG.md`. Ele CONTÉM a migration de contração.
4. O CI do PR verde sobre esse SHA (`verificar` e `banco-sem-docker`), com os roteiros, o injetor e o `db:types:diff`.
5. **No ENSAIO**, pelo `apply_migration` do MCP, com o `name` certo:
   - logo antes: o "antes" refeito;
   - os lotes de EXPANSÃO, um a um, e depois de cada um: o md5 do `prosrc` de cada função tocada = o do CI; as
     assinaturas antigas byte a byte (salvo a trava advisory declarada); as policies = o CI;
   - depois da expansão: o conta a conta (0 divergências), o `notify pgrst`, os advisors e o conferidor (0 recusadas);
   - a CONTRAÇÃO (o ensaio não tem app de produção: lá o `drop` não espera deploy), e de novo o conta a conta e o
     conferidor.

   Divergiu? Rollback no ensaio, na ordem escrita, causa raiz, e o ciclo de novo, com a correção em migration NOVA.
6. **Em PRODUÇÃO**, só a EXPANSÃO, dentro de 24 h do commit das migrations, com as mesmas provas, lote a lote.
   - Imediatamente antes do primeiro lote: o conta a conta "antes" e os dois números do #84.
   - Depois do último lote de expansão:
     - o conta a conta (0 divergências);
     - `node scripts/smoke/smoke-prod.mjs` a partir da branch;
     - o conferidor contra PRODUÇÃO (a conta do smoke, só contagens) com 0 recusadas;
     - os advisors;
     - a paridade ensaio × produção nas 11 classes, menos o delta declarado da contração que só o ensaio tem.

   Smoke, conferidor ou conta a conta reprovou? **Rollback imediato em produção** do que foi aplicado, antes do
   diagnóstico, sem merge, com o registro no topo do relatório.
7. Ata e `docs/RELATORIO-F67.md` com o que já dá para escrever. O PR sai do rascunho. Merge com os dois checks verdes,
   logo depois das provas.
8. **O deploy e a conferência, só leitura:** `/api/saude` com `1.73.0` e o commit do merge; o smoke com 0 falha.
9. **A janela do `drop`** (RUNBOOK, receita da F60, adaptada no Anexo F67):
   - T0 do `pg_stat_statements` por papel, só chamadas e número de formas;
   - a prova estática (o `git grep` de toda chamada às assinaturas antigas em `src/**` e `scripts/**`, vazio; o SHA no ar
     = o merge);
   - uma janela de ≥ 30 min;
   - T1;
   - a condição: **Δ das antigas = 0** em `authenticated`, `service_role` e `anon`.

   As novas podem ter Δ 0 (são raras): declare.
10. **A CONTRAÇÃO em PRODUÇÃO**, só com a condição atendida. Depois dela: o conta a conta, o smoke, o conferidor, os
    advisors e a paridade ensaio × produção nas 11 classes (agora iguais).
11. **A Parte B** do `saude.yml` disparada à mão:
    - a deriva sem pendente;
    - os achados de integridade **iguais aos dois números travados** (o vermelho de antes, nem um a mais);
    - qualquer número maior, ou achado novo, é bloqueio (ver "Bloqueios").

    Nenhuma captura de tela de produção.
12. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.73.0` vai no merge
    dele, o commit final da fase, e é publicada.

## Fora: não toque
- **Da decisão 12/11-2 (vai para F67B e F67C):**
  - os dois buckets e as policies de `storage.objects` além da troca para a legada EXPLÍCITA da decisão 3;
  - `pode_ler_arquivo_termo` e `pode_escrever_arquivo_termo`, além do que a decisão 3 exigir;
  - `persistirTermo` e o `coalesce`;
  - o Realtime e a publication;
  - o default `empresa_legada()` de QUALQUER coluna;
  - os escritores comuns (as invoker de escrita, os INSERTs TS, os scripts, `restaurar.mjs`);
  - os leitores por chave natural da nota F65 (a)–(d).
- **Das outras fases:**
  - `profiles`, `handle_new_user`, `plataforma_admins` (além de ler) e a saída das contas dev de `membros` (F69);
  - a porta pública e o viewer (F68);
  - a empresa da sessão na tela (F70);
  - o `CLAUDE.md` da raiz (F71);
  - o piso e a sua revogação (F72);
  - aposentar a mesa de conflitos (decisão 13 do plano: não decidir).
- **O que esta ordem acrescenta:**
  - editar migration aplicada;
  - `update`/`delete` em tabela de negócio; mudar default; criar coluna `text` numa das 20 sem teto (fato 27);
  - consertar os dados do #84, ou subir a linha de base do alarme ou do smoke (decisão 3);
  - chamar RPC destrutiva, de conta ou de import em banco vivo;
  - `cascade`, `drop … if exists` na contração, DDL dinâmica em migration;
  - afrouxar o classificador, a guarda de topo, a doutrina do predicado, os catálogos das F48 a F66B, ou pôr exceção
    nominal sem motivo e sem migration;
  - trava nova sobre conceder o cargo dev (a forma é da F69; registre só a decisão 1);
  - `.github/workflows/**` e a proteção da `main`;
  - dependência nova, `.env*`, `scratchpad/`, os PRs do dependabot, o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F67.md` tem: os 28 fatos remedidos; as duas tabelas-verdade (consumidores do cargo, `security definer`),
   sem linha sem destino; o mapa de assinaturas com os chamadores; as vinte decisões; a ordem das migrations; a fronteira
   expansão | contração; e a ORDEM DE ROLLBACK. Ele é anterior ao primeiro commit que toca `supabase/`, `src/` ou
   `scripts/`.
3. O "antes" existe nos dois bancos, tirado antes de qualquer apply, com o conta a conta e os dois números do #84. Só
   números, nomes e textos de esquema e hashes.
4. As migrations começam na `0185`, com cabeçalho de classe validado, o diff contra o corpo vivo, rollback no rodapé,
   `db:lock` no mesmo commit e entrada em `DA_F38` e `RECRIACOES_AUTORIZADAS`. Não há `update`/`delete` de negócio,
   `cascade`, DDL dinâmica, default mudado nem nome-sem-prefixo repetido. A contração está em arquivo próprio.
5. As funções por empresa existem, testam a empresa ANTES do cargo e fecham para argumento nulo. `e_dev` por empresa =
   dev membro ativo OU `e_plataforma()`. `pode_escrever_unidade` recusa a filial de outra empresa. `pode_escrever_filial`
   responde pela empresa da filial, e o admin continua alcançando filial desativada.
6. **A trava do piso** está verde: nenhum corpo de função usa o cargo sem empresa (fora a lista nominal), e toda policy
   que o usa está em conjunção com o recorte do mesmo cargo. Ela nasceu vermelha e sabe ficar vermelha (sabotagem B).
7. **`definer_sem_tenant.sql` exige primitiva POR EMPRESA**. Ele nasceu vermelho, está verde, e as exceções restantes
   têm motivo atualizado (a de `pode_ler_arquivo_termo` aponta a F67B).
8. As guardas da F52 e `idsDeAdminsAtivos` têm corpo por empresa. A divergência do denominador (fato 12) está resolvida
   e declarada.
9. As destrutivas, `previa_reset`, a mesa, o import e as cinco de conta têm `p_empresa uuid` como 1º parâmetro, sem
   default, e recusam linha, filial ou alvo de outra empresa com 42501 e frase pt-BR. O "tudo" é por empresa, e a
   confirmação é `RESETAR TUDO — <N> ATIVOS`. A trava das destrutivas está verde.
10. A plataforma destrói em qualquer empresa e o dev membro só da A não destrói na B, provado no CI (decisão 1). A
    trilha grava a empresa alvo.
11. Conflito entre empresas é impossível: `conflito_entre_empresas.sql` está verde, com o par legítimo dentro da A
    ainda funcionando. `paresEmOutrasFiliais` e `cadastrosComMesmaIdentidade` recortam pela empresa.
12. As travas advisory têm uma forma só por família, inclusive nas assinaturas antigas da expansão, e a sentinela do
    "tudo" carrega a empresa. A trava de mesa está verde.
13. Termo para empresa sem modelo leva 42501 com a frase, também como `postgres`; para a WAP, passa. A lista de
    empresas com modelo mora num lugar só, e liberar uma empresa exige migration (decisão 11).
14. `isolamento_tenant.sql` prova, nas duas direções e com as policies REAIS: nenhuma escrita cruzada nas quatro tabelas
    nem nas cinco RPCs de conta; nenhuma destruição cruzada; e quem é só da B vê o que é dela. Cada recusa tem o par
    simétrico que ACEITA o legítimo.
15. **Zero janela**: a contração em produção só depois do deploy e de Δ = 0 das antigas na janela, com T0, T1 e a prova
    estática em `docs/f67-evidencias/`.
16. **Nada mudou para a WAP**: o conta a conta deu 0 divergências em produção depois da expansão e depois da contração;
    o smoke, 0 falha; o conferidor, 0 recusadas no ensaio e em produção; a Parte B com os MESMOS dois achados do #84.
17. As funções e policies fora da tabela-verdade estão byte a byte (md5 do "antes" × "depois"). As tocadas batem com o
    CI. Os advisors de segurança não ganharam nada não declarado. A paridade ensaio × produção fecha nas 11 classes.
18. O rollback cobre os dois estados (só expansão; expansão + contração), está em `supabase/rollback/F67-desfaz.sql` e
    foi **ensaiado no Postgres do CI**. Os rollbacks F62 a F66B foram medidos com a F67 no lugar, e o resultado está
    declarado.
19. Os roteiros adaptados estão listados, com o motivo de cada um, e nenhuma asserção mudou para passar.
20. A decisão sobre o injetor está na ata. As mutações entraram e são detectadas pelo cenário nomeado. O teto está no
    número exato (163 → N), com o porquê datado, e a quarentena abaixo de ⅓.
21. `database.ts` mudou SÓ nas assinaturas desta fase, e `db:types:diff` está verde. As formas de retorno não mudaram,
    ou a mudança está declarada.
22. Os documentos estão feitos:
    - o `PLANO-MULTIEMPRESA.md`, com a ficha F67 reescrita, **as fichas F67B e F67C** (todas as notas da ficha antiga
      com destino, nenhuma perdida) e as notas F69/F70/F71;
    - a MATRIZ (F67), o `ADR-002` §17 e o `RUNBOOK-BANCO.md` (Anexo F67);
    - os `CLAUDE.md` aninhados tocados, os índices e a ata.
23. Nenhuma dependência nova. Ficaram intocados: `.github/workflows/**`, o `CLAUDE.md` da raiz, os escritores comuns,
    os defaults e o Storage (fora da decisão 3). Nenhum número de linha de base subiu.
24. `package.json` em `1.73.0`, e `CHANGELOG.md` e `registry.ts` com entrada. A tag anotada `v1.73.0` foi publicada no
    merge do PR de documentação; se não, o motivo e o comando estão no topo do relatório.
25. As sabotagens A a K estão com saída real em `docs/f67-evidencias/`.
26. Nenhum dado real (nome, e-mail, id, patrimônio, código, slug, texto de linha) em migration, teste, roteiro,
    evidência ou log. Da produção, só números, nomes de esquema, textos de esquema e hashes. Ninguém abriu o
    `.env.local`.
27. `docs/RELATORIO-F67.md` segue o padrão F45 a F66B, com o roteiro do Johnny no topo, o estado de repouso e a seção
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
- reescrever uma prova de PONTE como prova de recorte sem declarar.

Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**A EMPRESA VEM ANTES DO CARGO, O PISO SEM EMPRESA SÓ VIVE PAREADO, E A ASSINATURA ANTIGA SÓ SAI DEPOIS DE NINGUÉM A
CHAMAR.** O conta a conta com 0 divergências e o conferidor com 0 recusadas no ensaio são o portão do apply de produção.
Os mesmos em produção, mais o smoke, são o portão do merge. Δ = 0 das antigas é o portão da contração.

Provas obrigatórias, cada uma com a saída real em `docs/f67-evidencias/`:
- **Sabotagem A, a ordem empresa-antes-de-cargo.** Numa subtransação, a função por empresa com o teste de cargo
  ANTES do de empresa (o defeito da ficha): o admin da A passa na filial da B, e o roteiro acusa. E argumento nulo:
  `false`/null em todas.
- **Sabotagem B, o piso.** Cada uma deixa a trava do piso vermelha, pelo nome:
  - um corpo de função que chama `e_admin()` sem argumento;
  - uma policy com `e_admin()` pareado com `empresas_do_membro()` (cargo mais fraco);
  - uma policy de `storage.objects` com o piso sem recorte;
  - uma policy com o piso em OR, não em AND.
- **Sabotagem C, a trava da F52.** `definer_sem_tenant.sql` vermelho quando:
  - uma função do universo só chama `e_admin()`;
  - uma chama uma primitiva cujo nome só COMEÇA como uma por empresa;
  - uma `security definer` fictícia nova, alcançável e com `uuid`, não está classificada.
- **Sabotagem D, as destrutivas.** Para cada uma: sem a recusa de empresa, dentro da transação, o dev membro só da A
  destrói na B, e o cenário acusa. E a trava das destrutivas fica vermelha com:
  - `p_empresa` com default;
  - `p_empresa` fora da 1ª posição;
  - um comando com `p_filial is null` sem a empresa;
  - `rotulo_alcance_reset` sem `count(`.
- **Sabotagem E, a mesa.** As views sem a partição por empresa formam grupo entre A e B, e o cenário acusa. Sem a
  recusa, a mesa da A apaga o gêmeo da B.
- **Sabotagem F, o import.** Um plano com filial da B, pela A: 42501, nada gravado e o backup não removido. Sem a
  recusa, grava.
- **Sabotagem G, o termo.** Sem o gatilho, o termo da B grava. Com o gatilho, 42501 também como `postgres`.
- **Sabotagem H, as travas advisory.** A trava de mesa vermelha quando:
  - uma assinatura antiga fica com a chave velha;
  - a sentinela do "tudo" volta a ser `-1` sem empresa;
  - uma chamada da família muda de `(int,int)` para `(bigint)`.
- **Sabotagem I, "nada mudou".** O conta a conta com 0 divergências, com o número de memberships e de funções
  conferidas. E a prova de que o bloco SABE achar divergência: no ensaio, dentro do próprio bloco (que termina em
  `raise`), uma função por empresa sabotada para responder a ponte errada dá > 0.
- **Sabotagem J, a janela.** No ensaio, depois da contração: uma chamada à assinatura antiga dá o 404/`PGRST202` do
  PostgREST (é isso que a janela evita em produção). E, no CI, a cadeia contraída não tem sobrecarga (a asserção 2 de
  `catalogo_secdef.sql`).
- **Sabotagem K, o rollback.** `F67-desfaz.sql` devolve as funções, as views e os gatilhos à impressão de antes da
  `0185`, a partir dos dois estados. Os rollbacks F62 a F66B com a F67 no lugar, com a saída real e a declaração.
- **A contagem final**, antes × depois:
  - testes (arquivos e casos), roteiros e asserções do CI;
  - mutações e teto;
  - `security definer` (65 → N) e o universo da trava (21 → N), com as exceções;
  - os consumidores do cargo por destino;
  - assinaturas expandidas e contraídas;
  - advisors por nível e nome;
  - o conta a conta (memberships × funções) nos dois bancos, antes, depois da expansão e depois da contração;
  - o conferidor (pontos, linhas, recusadas) no ensaio e em produção;
  - os dois números do #84;
  - o `pg_stat_statements` T0/T1;
  - `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem:
1. uma medição sua contra o disco e os bancos de hoje;
2. as decisões do Johnny abaixo;
3. a ficha da F67 no §7 do plano, menos o que a 12/11-2 tirou daqui;
4. este prompt, no que ele detalha (onde ele diverge da ficha, a divergência está declarada aqui e vai para o
   relatório);
5. as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, a MATRIZ, o código existente, os moldes
   F52/F60/F62/F66);
6. a opção mais simples e reversível.

Decisão não-óbvia vai para `docs/DECISOES.md`, com data, contexto, escolha e motivo.

**As decisões do Johnny:**
- **12/11-2**: a F67 dividida em F67 (esta), F67B (Storage e Realtime) e F67C (o fim do default). As fichas novas são
  escritas por esta fase.
- **12/11-3**: as duas contas dev continuam em `membros`. `e_dev` por empresa = dev da empresa OU `e_plataforma()`. A
  saída de `membros` é da F69.
- **13/11-1, "dev sou só eu"**: o cargo dev é só do Johnny, e a plataforma é ele. A 12/11-3 vale também para a Zona
  destrutiva: a plataforma reseta, apaga e força em qualquer empresa, e a trilha grava a empresa alvo. Sem trava nova
  sobre conceder dev.
- **13/11-2, expandir e contrair, zero janela**: o molde da F60, com o nome mantido.
- **13/11-3, o #84 travado**: a conferência exige os mesmos dois achados, remedidos no começo. Nada de consertar dado.

**As vinte decisões que esta fase precisa tomar por escrito:**
1. **As funções por empresa** (fato 6). A proposta:
   - `papel_na_empresa(p_empresa uuid)`, `e_admin_na(p_empresa uuid)`, `e_dev_na(p_empresa uuid)`,
     `pode_escrever_na(p_empresa uuid)` e `pode_escrever_unidade(p_empresa uuid, p_filial smallint)`, todas `security
     definer`, `stable`, com `search_path` travado;
   - argumento nulo → null/`false`; o teste "a pessoa é membro ativo de `p_empresa`, com o perfil não excluído" vem
     antes de qualquer teste de cargo; `e_dev_na` = (dev membro ativo de `p_empresa`) OU `e_plataforma()`;
   - `pode_escrever_unidade` confere `filiais.empresa_id = p_empresa` ANTES do cargo, e o admin NÃO ganha `where
     f.ativo` (a ficha).

   Os nomes são seus: escolha, escreva e use os mesmos nas travas. A ficha diz "`papel_atual()` ganha `p_empresa`", e o
   fato 6 mostra por que não pode. Declare a divergência.
2. **O sentido do piso sem empresa.** A proposta: `papel_atual()` sem argumento passa a ser "o cargo mais forte entre
   as memberships ativas", e `e_admin()`/`pode_escrever()` = "em alguma empresa". Ele vale só como piso de policy
   pareada: a conjunção com o recorte do mesmo cargo é EXATAMENTE "este cargo nesta empresa".
   - Isso reverte a frase da `0158` ("nunca pelo cargo mais forte entre empresas"). Ela existia porque havia consumidor
     sem par. Com a trava do piso, deixa de haver: escreva o porquê no `ADR-002` §17.
   - `e_dev()` sem argumento: se, depois da conversão, não sobrar consumidor nenhum, ele SAI na contração (não está em
     policy: confira). Se sobrar, siga a mesma regra.
   - A alternativa, `p_empresa` default null com ponte, perde: é sobrecarga (fato 6).
   - Com uma empresa e uma membership por pessoa, o piso novo = o antigo. O conta a conta prova.
3. **Os consumidores sem par** (fatos 7, 8 e 9). Cada linha da tabela-verdade sem recorte pareado vai à forma por
   empresa:
   - com a empresa REAL quando ela existe no contexto (a da linha, a da filial, a do alvo, o `p_empresa`);
   - com a **legada EXPLÍCITA** (`…_na(public.empresa_legada())`) onde o recorte daquela superfície é de fase futura
     (`storage.objects` → F67B; `membros`/`profiles`/`empresas` → F69; a observabilidade → a decisão 14). A linha é
     declarada e aponta a fase.

   **Nunca o piso "em alguma empresa" sem par.** Sem isso, entre a F67 e a F67B, o admin só da B leria os backups do
   import da WAP.
4. **A trava da F52 por empresa.** A lista nominal de primitivas por empresa (as da decisão 1, `exigir_gestao_de` e
   `exigir_dev_para_destruir` na forma nova, `pode_escrever_filial` com o corpo novo, `pode_escrever_termo` com o corpo
   novo). Conferida por NOME no `prosrc` e na delegação. As duas exceções de coerência (`estorno_item_coerente`,
   `termo_ancora_coerente`): ficam, com o motivo reescrito (a FK composta da F65 + o AND da policy), ou passam a
   conferir a empresa e saem da lista. Meça e decida. `pode_ler_arquivo_termo` fica, apontando a F67B.
5. **As destrutivas e a empresa.** A proposta: `p_empresa uuid` 1º, sem default, em `resetar_acervo`, `resetar_itens`,
   `previa_reset`, `apagar_ativo`, `apagar_item`, `apagar_movimentacao`, `forcar_estado_ativo`, `forcar_saldo_item`,
   `apagar_ativos_conflito_filiais` e `importar_ativos_substituir`. Também nas auxiliares fechadas que elas chamam,
   onde a empresa muda o que fazem.
   - Por id: a linha tem de ser de `p_empresa`, senão 42501 *"este registro pertence a outra empresa"* (ou a frase que
     você fixar).
   - Por filial: a filial tem de ser de `p_empresa`.
   - O "tudo": `where empresa_id = p_empresa` em TODO comando, e `rotulo_alcance_reset(p_empresa, p_filial)` =
     `'RESETAR TUDO — ' || <count(*) dos ativos da empresa> || ' ATIVOS'` para o tudo (a filial continua pelo nome).
     Decida o formato do número (sem separador de milhar é o que se digita) e declare.
   - `eventos_admin` grava `'alcance' = 'empresa'` no lugar de `'global'`, e a empresa alvo.
6. **Os lotes e a ordem** (Frente C). A ordem final, com o porquê. Entre dois lotes, o estado é repouso válido
   (nenhuma recusa nova para a WAP).
7. **A expansão e a contração** (decisão 13/11-2, fato 23):
   - o nome fica; a assinatura nova nasce ao lado; a antiga só ganha a trava advisory convertida (decisão 8) e mais
     nada;
   - a contração vai em arquivo separado, no mesmo PR;
   - confirme na documentação do PostgREST que a chamada nomeada da versão no ar resolve SÓ a antiga e a da nova SÓ a
     nova (sem ambiguidade, `p_empresa` sem default), e prove no ensaio pela forma do erro;
   - se alguma sonda de produção ler a asserção de sobrecarga, ela ganha uma exceção nominal TEMPORÁRIA, com a lista
     das assinaturas e a data de expiração, removida no commit da contração;
   - se a sobrecarga se mostrar inviável (ambiguidade real no PostgREST), o plano B é o da F60, com NOME novo. Registre
     a troca e o motivo.
8. **As chaves advisory** (fato 16). A proposta:
   - manter a forma `(int, int)` de cada família;
   - a chave por filial fica (`filiais.id` é único no sistema);
   - a sentinela do "tudo" passa a `(hashtext('import_substituir'), hashtext(p_empresa::text))`, e a da mesa a
     `(hashtext('conflito_apagar'), hashtext(p_empresa::text))`. Colisão de hash só serializa, nunca libera.
   - Todas as chamadas da família convertidas na MESMA migration, inclusive as das assinaturas antigas vivas.
   - Confirme na doc do PG 17 o espaço de `pg_advisory_xact_lock(int, int)` × `(bigint)`.
9. **A mesa de conflitos** (fato 17). A proposta: as duas views agrupam por `(empresa_id, identidade)`, para que o grupo
   nunca atravesse empresas, em vez de filtrar por uma "empresa da sessão" que a view não tem. E
   `apagar_ativos_conflito_filiais(p_empresa, …)` exige que todos os ids sejam de `p_empresa` e recalcula o grupo DENTRO
   dela. `paresEmOutrasFiliais` e `cadastrosComMesmaIdentidade` recortam pela empresa da filial ou do cadastro.
10. **O import de startup.** `importar_ativos_substituir(p_empresa, …)`: a filial do plano tem de ser de `p_empresa`
    (42501 antes do lock e do backup), e a autorização é `pode_escrever_unidade(p_empresa, filial)` ∧ admin da empresa.
    O que a RPC grava continua com o default (F67C), e o vocabulário do import não muda (F65 (c), F67C).
11. **A trava do termo.** A proposta:
    - um gatilho `BEFORE INSERT` em `termos_gerados` (o `UPDATE` de empresa já é recusado pela `guarda_empresa`, `0173`)
      que consulta UMA fonte: `empresas_com_modelo_de_termo()`, `immutable`, `uuid[]` literal com a WAP;
    - liberar uma empresa = migration nova junto com os modelos `.docx` dela (código);
    - 42501 com *"a emissão de termo ainda não está disponível para esta empresa"*, traduzida em `erros-do-banco.ts`;
    - a alternativa, uma coluna-interruptor em `empresas`, perde: liberar sem modelo viraria um clique que gera
      documento falso.

    Confira que o gatilho não conflita com `termos_gerados_ids_da_empresa` (ordem alfabética dos BEFORE) nem com o
    `zz_guarda_empresa`.
12. **A gestão de contas.**
    - As cinco ganham `p_empresa`; `exigir_gestao_de(p_empresa, p_alvo, p_papel_pedido)` exige o alvo membro de
      `p_empresa` e decide por `e_admin_na`/`e_dev_na` daquela empresa. "Ninguém age sobre o próprio acesso" fica.
    - `definir_vinculos_usuario` só aceita filiais de `p_empresa`.
    - **`apagar_usuario` e `encerrar_sessoes_usuario` agem na CONTA** (todas as memberships, todas as sessões). A
      proposta: exigem `e_dev_na(p_empresa)`, que é só o Johnny pela decisão 13/11-1; e, se o alvo for membro de outra
      empresa além de `p_empresa`, só a plataforma passa. Declare.
    - `mesmo_escopo_de_gestao` compara a empresa.
    - `existe_outro_admin_ativo` conta por `p_empresa` as memberships dev/admin ativas: as contas dev CONTAM enquanto
      forem membros (12/11-3, fato 12). A ficha dizia "plataforma fora do denominador": declare a divergência.
    - `idsDeAdminsAtivos` acompanha.
13. **De onde o TS tira `p_empresa`.** A proposta:
    - a operação por filial ou por linha passa a empresa da filial ou da linha, lida no servidor (o banco confere de
      novo; o TS só declara);
    - a operação da empresa inteira (o "tudo", a gestão de contas, o cargo de navegação) passa `EMPRESA_LEGADA_ID`
      EXPLÍCITO, contado pela catraca, com o destino F70 escrito.

    Nunca um valor vindo do cliente sem conferência.
14. **A observabilidade** (`checagens_integridade_resumo`, `checagens_integridade_nucleo`, `dev_checagens_integridade`,
    `ledger_de_migracoes`, `ultima_migracao_aplicada`).
    - Elas contam o sistema inteiro. A proposta: a legada EXPLÍCITA no lugar do piso. O smoke usa uma conta consulta da
      WAP, e o resumo continua aceitando "qualquer logado ativo DA WAP".
    - As de dev passam a `e_dev_na(public.empresa_legada())` OU `e_plataforma()`.
    - Por empresa de verdade é da F69/F70: declare.
15. **O "nada muda para a WAP"**, conta a conta. Estenda `conta-a-conta.mjs` com a fase `f67`. Para cada membership
    ativa e cada filial:
    - a forma por empresa com a WAP = a função de antes (`papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()`,
      `pode_escrever_filial(f)`);
    - o piso novo = o antigo;
    - `pode_escrever_unidade(WAP, f)` = `pode_escrever_filial(f)` de antes;
    - `exigir_gestao_de`/`exigir_dev_para_destruir` recusam e aceitam as MESMAS (dentro do bloco, capturando a exceção);
    - `existe_outro_admin_ativo` igual.

    Só contagem de divergência sai do banco. Rode no ensaio antes de produção, com a sabotagem I.
16. **O injetor**: uma mutação por classe de trava desta fase que nenhum teste de mesa já derruba. As candidatas:
    - a ordem empresa-antes-de-cargo invertida;
    - o piso num corpo;
    - a recusa de empresa removida de uma destrutiva;
    - a partição da view removida;
    - a sentinela sem empresa;
    - o gatilho do termo desligado;
    - `existe_outro_admin_ativo` voltando a `or true`.

    Teto novo exato (163 → N), ou a ata diz por que não entrou.
17. **O rollback e o encadeamento**:
    - para o estado só-expansão: `drop` das novas e recriação dos corpos de antes;
    - para o estado contraído: recriar as antigas primeiro;
    - a ordem, escrita;
    - os rollbacks F62 a F66B medidos com a F67 no lugar;
    - e a declaração: depois do rollback, a ponte volta e o cargo volta a vir da WAP. Nenhum dado se perde.
18. **`eventos_admin` nas funções recriadas.** A proposta: toda função que esta fase recria e que grava na trilha passa
    a gravar `empresa_id` EXPLÍCITO (a empresa alvo). O default fica para quem não foi recriado (F67C).
19. **A distribuição das fichas** (Frente F): como esta ordem diz. O que você achar que muda de lugar vai para a ata
    com o porquê. Nenhuma nota da ficha original pode ficar sem destino.
20. **A frase de cada recusa nova**: empresa errada, alvo de outra empresa, filial de outra empresa, termo bloqueado.
    Uma por classe, pt-BR, sem valor de linha, traduzida em `erros-do-banco.ts` e conferida contra o esquema vivo
    (`erros-do-banco-sql.test.ts`).

**Bloqueios reais, e o que fazer em cada um.** Falha persistindo depois de ~3 tentativas: **mude de abordagem** e
registre.
- **O conta a conta deu divergência** (qualquer banco, qualquer momento):
  - no ensaio: rollback no ensaio, causa raiz, migration NOVA e o ciclo de novo;
  - em produção: **rollback imediato**, antes do diagnóstico, sem merge, com o registro no topo do relatório.
- **O MCP da Supabase não está conectado, ou recusa o apply.** Não procure token, não leia o Gerenciador de
  Credenciais, não abra o `.env.local`. Confira de novo algumas vezes ao longo da run. Se não voltar, entregue tudo o
  que não depende do banco vivo, com o PR ABERTO e **SEM merge**. No topo do relatório vai o caminho B: as migrations
  na ordem (expansão e contração separadas), o bloco do conta a conta, as impressões e o rollback.
- **Δ das antigas ≠ 0 na janela do `drop`.** Alguém ainda chama: uma aba aberta com o app velho, ou um caminho que o
  `git grep` não pegou. **Não contraia.** Descubra pelo papel e pela forma da chamada (sem dado). Repita a janela, no
  máximo três vezes em 2 h. Se persistir: o PR de documentação sai com a contração PENDENTE no topo do relatório (o
  comando exato e a condição), e a tag espera. Estado de repouso válido: a sobrecarga vive, nada quebra.
- **Os números do #84 mudaram** (mais achados, achado maior, achado novo) em qualquer momento depois da linha travada:
  - se foi a fase (um achado novo que cite objeto tocado): rollback e bloqueio no topo;
  - se não foi (o dado de produção andou sozinho): registre os números (só número), não conserte nada, e declare na
    seção "o que este relatório NÃO prova". A conferência compara com o vivo do momento do apply, declarado.
- **Como se aplica um rollback num banco vivo.** Pelo `execute_sql` do MCP, com o conteúdo EXATO do bloco de
  `supabase/rollback/F67-desfaz.sql` que o CI ensaiou para aquele estado. É a única exceção ao "`execute_sql` só
  leitura", e vale só para esse arquivo. A linha do ledger fica: registre o que a sonda de deriva vai dizer dela. Se o
  classificador barrar o rollback, não reformule: o comando exato vai no topo do relatório, e o PR fica sem merge.
- **O lock não veio** (`lock_timeout` disparou): registre e tente de novo, no máximo três vezes em 30 minutos. Não suba
  o timeout nem mate sessões do app. Depois da terceira, pare o apply daquele banco: PR aberto, sem merge, e o comando
  no topo do relatório. Parar entre dois lotes é repouso válido.
- **Advisor de segurança novo** depois do apply, não declarado: se cita objeto desta fase, escalada do runbook e
  rollback antes do diagnóstico. Se não cita, é lint novo da Supabase sem relação com a fase: registre e siga.
- **O smoke ou o conferidor recusam** depois de um apply de produção: rollback daquele estado, PR sem merge, e a causa
  no topo do relatório. Não tente consertar na mesma run.
- **A sonda de deriva abre alarme** porque a contração ficou mais de 24 h no repositório sem apply: registre. O alarme
  fecha sozinho na Parte B seguinte ao apply.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a
  pendência. Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador de segurança** em qualquer ação (apply em produção, merge, push de tag, disparo de
  workflow, rollback): registre, não repita, não reformule, siga no que não depende dela e ponha o comando no topo do
  relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. **Aqui
já há nove divergências medidas de saída**, e elas vão no relatório:
- a numeração (`0185`) e a versão (`1.73.0`): a ficha dizia `0160`–`0165` (fato 1);
- "~37 funções": são 65 `security definer`, e 21 no universo da trava (fatos 10 e 11);
- `definer-escopo.test.ts` não existe; a trava é `definer_sem_tenant.sql` (fato 11);
- `papel_atual()` não pode ganhar parâmetro: as formas por empresa têm nome próprio (fato 6, decisão 1);
- o piso muda de sentido, e o consumidor sem par vai à legada EXPLÍCITA (fato 8, decisões 2 e 3);
- "plataforma fora do denominador" × as contas dev em `membros` (fato 12, decisão 12);
- a F60 trocou NOME, e aqui o nome fica: a sobrecarga só vive nos bancos (fato 23, decisão 7);
- a decisão 12/11-2: Storage, Realtime e o default saíram daqui para a F67B e a F67C;
- a decisão 13/11-1: a plataforma vale também na Zona destrutiva.

Declare também o que este prompt acrescenta à ficha:
- o conta a conta como portão;
- a trava do piso;
- a catraca TS;
- a trava das chaves advisory;
- a janela do `drop` para função rara;
- o #84 travado;
- as fichas F67B e F67C.

# Git e segurança
- **Branch** `f67-cargo-por-empresa-e-destrutivas`, com commits pequenos e frequentes e mensagens em pt-BR no padrão
  conventional (`docs(f67): …`, `test(f67): …`, `feat(f67): …`, `fix(f67): …`, `chore(f67): …`).
- **Documentação primeiro.** Commite também esta ordem
  (`docs/prompts/F67-cargo-por-empresa-definer-e-destrutivas-ultracode.md`) num commit de documentação. O
  `PLAN-F67.md` vem antes do primeiro commit que toca `supabase/`, `src/` ou `scripts/`.
- **Os commits vão nesta ordem:**
  1. as travas vermelhas;
  2. cada lote de expansão, um commit por migration, com `db:lock`;
  3. o TS (os chamadores, as guardas, a catraca);
  4. os roteiros adaptados e o rollback;
  5. o injetor;
  6. a contração;
  7. os documentos (as fichas, a MATRIZ, o ADR, o RUNBOOK, os aninhados, a ata);
  8. a versão.
- **Pushes agrupados**: cada um custa CI numa cota apertada.
- **PR com `gh pr create`**, como rascunho desde o primeiro push que precisar de CI. O merge só acontece quando:
  - `verificar` e `banco-sem-docker` estão verdes;
  - a expansão está aplicada nos dois bancos, com o conta a conta em 0;
  - o conferidor deu 0 recusadas e o smoke 0 falha em produção.

  A contração é aplicada em produção DEPOIS do merge (é a única migration desse PR que vai a produção depois dele). A
  evidência vai por um PR só de documentação, e qualquer correção de código por PR novo.

**Nunca:**
- **no git:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu;
- **nas migrations:** editar migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset
  --linked`, reescrever `schema_migrations` além da linha da migration que acabou de aplicar, `cascade`, `drop … if
  exists` na contração, abrir a janela `estoque.dev_destrutivo`, DDL dinâmica, mudar default;
- **nos bancos vivos:** rodar `db:seed`, `db:reset` ou `carga`; chamar RPC destrutiva, de conta ou de import; matar
  sessão do app; imprimir ou gravar valor de coluna, id, nome, e-mail, patrimônio, código, slug ou texto de linha real
  (nem em log, nem em evidência, nem na resposta); qualquer escrita fora do `apply_migration` e do rollback autorizado;
- **nas credenciais:** abrir, filtrar, imprimir ou copiar o `.env.local` (nem você, nem subagente: o incidente de
  10/09); ler o Gerenciador de Credenciais do Windows; imprimir ou gravar senha e token;
- **no repositório:** mexer na proteção da `main` ou nos workflows, instalar dependência, mexer nos PRs do dependabot,
  subir número da linha de base, editar o `CLAUDE.md` da raiz.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local` e que, de banco, só lê catálogo,
contagens, textos de esquema e hashes (nunca valores de linha). As frentes de exploração:
- (a) **os consumidores do cargo no banco**: policies de todos os esquemas (pela árvore, não só pelo texto), `prosrc` de
  todas as funções, as views, nos dois bancos e na cadeia (fatos 6, 7 e 8);
- (b) **as `security definer` e as destrutivas**: o corpo vigente das 21 do universo e das auxiliares, de onde vem a
  empresa em cada uma, as travas advisory, as views da mesa, `termos_gerados` e os gatilhos (fatos 10 a 17 e 20);
- (c) **o TS e os scripts**: os chamadores por `chamarRpc`, `acesso.ts`, `EMPRESA_LEGADA_ID`, `idsDeAdminsAtivos`, os
  leitores da nota F66, os schemas de forma e a Zona destrutiva (fatos 9, 18 e 19);
- (d) **as travas, os roteiros e o injetor**: `definer_sem_tenant.sql`, `catalogo_secdef.sql`,
  `catalogo_policies.sql`, `isolamento_tenant.sql`, a grade da F62, `migrations-f38.test.ts`, `mutacoes.mjs` e os
  rollbacks F62 a F66B (fatos 11, 21 e 24);
- (e) **a documentação oficial** (regra 6): o PG 17 (fato 28) e o PostgREST (a resolução de sobrecarga por nome);
- (f) **os bancos, só leitura**: o "antes" (Frente A), o universo da trava, os números do #84 e o conta a conta "antes".

Escreva `docs/PLAN-F67.md` antes de implementar. **A edição é sequencial**: as funções, as travas e os roteiros se
cruzam. Paralelize exploração, medição e revisão, não edição.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**. Eles
leem o código **pelo SHA** (nunca pela árvore de trabalho), contra o `PLAN-F67.md` e os 27 critérios, com estas
perguntas:
- Alguma função por empresa testa o cargo antes da empresa, ou abre com argumento nulo?
- Sobrou algum consumidor do cargo sem empresa sem par (um corpo, uma policy de `storage`, `membros`, uma view, uma
  chamada TS)? Algum par é de cargo mais fraco que o piso?
- Alguma `security definer` alcançável age sobre linha, filial ou alvo sem conferir a empresa? A trava pega por NOME
  ou por prefixo?
- Alguma destrutiva tem um comando que ainda alcança outra empresa (um `where` sem `empresa_id`, um `delete` em tabela
  filha, um backup que copia demais)?
- O "tudo" conta e apaga só a empresa? A confirmação lê o N do banco?
- A view da mesa ainda forma grupo entre empresas em algum caminho? A mesa recalcula o grupo dentro da empresa?
- A assinatura antiga e a nova tomam a mesma chave advisory? A antiga mudou em mais alguma coisa?
- A contração tem `if exists` ou `cascade`? Ela pode rodar antes do deploy por algum caminho?
- O gatilho do termo é contornável (UPDATE, `ON CONFLICT`, service role)?
- O conta a conta compara funções de verdade, ou uma cópia? Sabe achar divergência?
- Alguma prova de PONTE virou prova de recorte sem declaração? Alguma sabotagem prova só o caminho feliz? Alguma
  evidência tem valor real de linha?
- Alguma nota da ficha F67 original ficou sem destino nas fichas novas?
- Algum arquivo fora do escopo foi tocado (Storage, Realtime, default, escritores comuns, `profiles`, workflow, o
  `CLAUDE.md` da raiz)?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado,
não preferências de estilo.** Corrija e re-revise até limpar. Se as passadas acharem bordas cada vez mais hipotéticas
de uma réplica, pare e registre a troca (o molde da F66B §13).

# Relatório final
`docs/RELATORIO-F67.md`, em pt-BR, no padrão dos relatórios F45 a F66B, **com o roteiro do Johnny no TOPO**: o que ficou
com ele, passo a passo, e por quê. No mínimo:
- se o apply, a contração, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B completo,
  se o MCP faltou);
- depois do deploy, entrar com a própria conta e conferir, sem executar nada destrutivo:
  - **Zona destrutiva › Resetar**: a prévia do "tudo" mostra `RESETAR TUDO — <N> ATIVOS` (N = o total de ativos da
    WAP). Feche sem confirmar;
  - **Pendências › conflitos entre filiais**: a mesa abre como antes, com os mesmos grupos;
  - **Administração › Usuários**: a lista e os cargos são os de antes; abra a edição de um usuário e feche sem salvar;
  - **Administração › Importar**: a conferência de uma planilha FICTÍCIA abre como antes. Não aplique;
  - na próxima vez que gerar um termo de verdade, ele sai igual;
- conferir `/api/saude` com `1.73.0` e a Parte B do `saude.yml` no dia seguinte, com a deriva limpa e os MESMOS dois
  achados do #84;
- o `git diff v1.72.0 v1.73.0 --stat`, com o que deve e o que não deve aparecer;
- os lembretes: o próximo prompt é o da **F67B** (Storage e Realtime), e o diagnóstico do #84 é entrega avulsa à parte.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas nove já
  conhecidas;
- as decisões do Johnny e as **vinte decisões** da fase;
- as duas tabelas-verdade e o mapa de assinaturas;
- o conta a conta nos dois bancos (antes, depois da expansão, depois da contração);
- a janela do `drop` (T0, T1, Δ, prova estática);
- o conferidor e o smoke;
- os números do #84 antes e depois;
- as sabotagens com saída real;
- a contagem final;
- os 27 critérios autoverificados;
- o estado de repouso: o que acontece se o projeto parar aqui por dois meses, inclusive com a contração pendente;
- a seção **"o que este relatório NÃO prova"**. No mínimo:
  - que o Storage e o Realtime recortam (F67B);
  - que uma linha nova de outra empresa recebe a empresa certa (o default é a WAP até a F67C);
  - que a empresa B opera pela tela (F70);
  - que as recusas cruzadas disparam nos bancos VIVOS (provadas no CI; nos vivos, a prova é o texto igual ao do CI e o
    conta a conta);
  - que nenhuma aba antiga viu erro na janela (o `pg_stat_statements` mede chamada, não erro de tela);
  - nada sobre os dados do #84.

Pendências e **backlog nomeado**:
- **F67B** (Storage e Realtime) e **F67C** (o fim do default), com as fichas escritas nesta fase;
- **F69**: a saída das contas dev de `membros`, `handle_new_user`, a forma do "dev sou só eu";
- **F70**: a empresa da sessão no lugar da legada explícita do TS;
- **F71**: as frases do `CLAUDE.md` da raiz;
- **o diagnóstico do #84** (entrega avulsa);
- **Backlog** (das fases anteriores, sem mudança): os caminhos sem `.max()` e os pares de tetos da F66B;
  `movimentacoes.itens_faltantes`; o `savepoint` por linha na RPC do import; o seed de duas empresas,
  `scripts/seed.test.ts` e o `onConflict` de `seed.ts:886`; a paginação keyset; derrubar `profiles.papel`/`ativo`; o
  hand-fix da F62 em `operador_filiais.Insert`; os `scratch_tmp/scripts/db/*` rastreados; o WARN
  `multiple_permissive_policies` de `pendencias_item`.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório e comentários em **pt-BR**.
- Domínio em português sem acento (`empresa`, `cargo`, `piso`, `recorte`). Os nomes que a ficha fixa ficam como estão.
- Commits em pt-BR no padrão conventional.
- As mudanças do `registry.ts` vão em LINGUAGEM DE OPERADOR: há teste que recusa termo de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~20 minutos)

Esta fase **toca os dois bancos duas vezes**:
- **a expansão**, antes do merge: funções novas ao lado das antigas, policies e gatilho;
- **a contração**, depois do deploy: o `drop` das assinaturas antigas, só quando ninguém mais as chamar.

Antes de cada apply, ela roda em cada banco um bloco só leitura que compara, conta a conta, o cargo de cada pessoa antes
e depois. Ela não chama nenhuma RPC destrutiva em banco vivo e não reescreve linha.

Este arquivo já está salvo em `docs/prompts/F67-cargo-por-empresa-definer-e-destrutivas-ultracode.md`, **sem commit**. O
agente o commita na branch da fase. O prompt cita os 28 fatos do cabeçalho pelo número, então o arquivo precisa estar lá
quando você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.72.0, main em 8f4b50d (PR #93); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git status --short          # se aparecer .cv-tmp.mjs, apague: sobra da conversa que gerou a ordem
Test-Path .git\index.lock   # tem de dar False
Test-Path docs\prompts\F67-cargo-por-empresa-definer-e-destrutivas-ultracode.md   # tem de dar True

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

**O passo 5 é o que mais importa.** Dentro do Claude Code, confira duas coisas:
- que o MCP lista `pbtjcalbmepmrqzprusb` (produção) e `sgmvldiizsrjbxzzpmhh` (ensaio). Na F66B ele começou ligado a
  outra conta e só via "Invoice Control";
- que **as ferramentas estão ligadas** nas configurações do conector: `execute_sql`, `apply_migration`,
  `list_migrations`, `get_advisors` e `generate_typescript_types`.

Sem elas, o agente entrega tudo verde no CI, **deixa o PR aberto, sem merge**, e põe o caminho B no topo do relatório.

**Mais quatro coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. As travas nascem vermelhas (um push a mais), e o
   `banco-sem-docker` roda algumas vezes, mais o PR de documentação e a Parte B disparada à mão.
2. **Dentro do Claude Code:** `/permissions` (nada pode negar `git push`, `gh`, `node`, `npx tsx` nem as ferramentas do
   MCP da Supabase) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).
3. **Abas abertas do sistema.** A contração só acontece quando o `pg_stat_statements` mostra zero chamadas às assinaturas
   antigas por ≥ 30 min depois do deploy. Uma aba velha da Zona destrutiva, do import ou da Administração aberta em
   algum computador pode atrasar isso. Recarregue as suas depois do deploy.
4. **O horário.** Os applies tomam lock por milissegundos, e o `lock_timeout` de 2 s protege o app. A janela do `drop`
   pede ≥ 30 min de observação depois do deploy. Comece cedo o bastante para a run caber no dia, e evite a Parte B das
   06:43.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f67
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A fase roda testes e build, aplica migrations por MCP em lotes nos dois bancos (em dois
momentos), roda blocos só leitura, abre e mergeia PRs, publica tag, dispara workflow e roda o smoke e o conferidor.
Nada disso cabe numa allowlist estreita. `bypassPermissions` numa máquina com credencial de produção está fora de
questão.

**Onde o classificador de segurança pode barrar:** no `apply_migration` em produção (a expansão e a contração, que é um
`drop function`), no merge na `main`, no push da tag e no disparo da Parte B. Se barrar, o prompt manda não reformular: o
agente registra, segue no resto e põe o comando no topo do relatório. A contração pendente é estado de repouso válido.

**`--worktree` NÃO serve.** O smoke, o conferidor e o conta a conta precisam do `.env.local`, que não vai para a
worktree, e o prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** Maior que a F66B. A parte pesada é a tabela-verdade dos consumidores do cargo (catálogo inteiro, nos dois
bancos) e a revisão adversarial sobre "sobrou piso sem par?" e "alguma destrutiva ainda alcança outra empresa?", que é
onde o modelo forte rende. Só se a cota semanal estiver apertada, use `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes
do `claude`, para economizar na exploração.

**Condição de parada com avaliador separado** (recomendado para desatendido). Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F67.md existe com as duas tabelas-verdade; package.json em 1.73.0; docs/RELATORIO-F67.md existe; o PLANO-MULTIEMPRESA tem as fichas F67B e F67C; e UM destes desfechos: (a) o PR da fase e o PR de documentacao mergeados com verificar e banco-sem-docker verdes, a expansao 0185+ aplicada no ensaio e em producao com o conta a conta em 0 divergencias, o conferidor com 0 recusadas e o smoke sem falha, a janela do drop com delta 0 das assinaturas antigas, a contracao aplicada em producao, a Parte B com os mesmos dois achados do #84 e a tag v1.73.0 publicada; (b) a contracao pendente porque o delta das antigas nao zerou em tres janelas: PR de documentacao com o comando e a condicao no topo do docs/RELATORIO-F67.md; (c) o apply de producao nao aconteceu (classificador ou lock): PR aberto sem merge, com o comando no topo do docs/RELATORIO-F67.md; (d) sem MCP da Supabase: PR aberto sem merge, com o caminho B no topo do docs/RELATORIO-F67.md; (e) o conta a conta, o conferidor ou o smoke reprovaram depois de um apply: rollback aplicado (ou, se barrado, o comando no topo), PR sem merge e a causa no topo do docs/RELATORIO-F67.md; ou (f) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F67.md
```

**Headless.** O prompt vai por stdin, porque o bloco passa do limite de linha de comando do Windows:

```powershell
# salve só o bloco do prompt em prompt-f67.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f67.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f67.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. Esta fase aplica em
produção duas vezes e espera uma janela de observação, então **prefira a sessão interativa deixada rodando, com o
`/goal`**, e com a suspensão do Windows desligada no plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Seis momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F67.md` com a tabela-verdade dos consumidores do cargo (toda linha com destino; as de
   `storage` e `membros` indo para a legada EXPLÍCITA) e `docs/f67-evidencias/antes/` com o conta a conta e os números
   do #84. Só números, nomes de esquema e hashes: se aparecer um nome, um e-mail ou um patrimônio ali, interrompa a
   sessão.
2. **As travas vermelhas.** `definer_sem_tenant.sql` reprovando pelas 18, a trava do piso, `conflito_entre_empresas.sql`
   e `termo_bloqueado.sql`, antes de qualquer migration.
3. **O ensaio.** A expansão lote a lote, o conta a conta em 0, e então a contração (lá ela não espera deploy).
4. **A produção, a expansão.** O mesmo, mais o smoke e o conferidor. Se algum falhar, o prompt manda fazer o rollback na
   hora, e o relatório diz isso no topo.
5. **O merge, o deploy e a janela do `drop`.** `/api/saude` em `1.73.0`, e depois ≥ 30 min de `pg_stat_statements` até
   a contração. **Recarregue as abas do sistema que você tiver abertas.**
6. **A conferência.** A contração em produção, o conta a conta de novo, e a Parte B com os MESMOS dois achados do #84.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Entre com a sua conta em produção e faça o roteiro do topo, **sem confirmar nada destrutivo**:
   - Zona destrutiva › a prévia do "tudo" com `RESETAR TUDO — <N> ATIVOS`, e feche;
   - a mesa de conflitos;
   - a lista de usuários;
   - a conferência de um import fictício (sem aplicar).
3. `git diff v1.72.0 v1.73.0 --stat`. Devem aparecer:
   - `supabase/migrations/0185_*` em diante (a contração por último), `supabase/migrations.lock.json`,
     `supabase/rollback/F67-desfaz.sql`;
   - `supabase/tests/conflito_entre_empresas.sql`, `termo_bloqueado.sql`, `f67_rollback.sql`, e mudanças em
     `definer_sem_tenant.sql`, `isolamento_tenant.sql` e nos roteiros adaptados, cada um explicado no relatório;
   - `src/lib/auth/**`, `src/lib/supabase/{rpc,erros-do-banco}.ts`,
     `src/lib/actions/{dev-destrutivo,conflitos,importar,admin,dev}.ts`, `src/lib/queries/{admin,dev-destrutivo,import-logs}.ts`,
     `src/lib/ativos/identidade.ts`, `src/lib/types/database.ts` (só as assinaturas), a tela da Zona destrutiva;
   - `src/lib/itens/migrations-f38.test.ts`, `scripts/db/mutacoes.mjs` e o teste, `scripts/perf/conta-a-conta.mjs`,
     `registry.ts`, `package.json`, `CHANGELOG.md`, `docs/**`.

   **Não** devem aparecer:
   - migration antiga alterada;
   - `src/lib/storage/**`, `persistirTermo` (`actions/termos.ts`, fora de uma frase de erro, se houver), qualquer
     `.channel(`/Realtime;
   - default de coluna mudado;
   - `scripts/seed.ts`, `scripts/import/**`, `scripts/db/restaurar.mjs`;
   - `scripts/smoke/linha-de-base.json` com número que SUBIU;
   - o `CLAUDE.md` da raiz, `.github/workflows/**`, mudança de dependência no `package-lock.json`.
4. Abra `docs/f67-evidencias/`: o conta a conta nos três momentos, a janela do `drop` (T0, T1, Δ), o conferidor, os
   números do #84 e a saída das sabotagens.
5. Confira no `PLANO-MULTIEMPRESA.md` as **fichas F67B e F67C**: é delas o próximo prompt (a F67B primeiro).
6. Rode você mesmo `npm run test` uma vez.
7. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **Li "dev sou só eu" como "a plataforma, que é você, pode destruir em qualquer empresa".** A ordem registra a frase
   literal e aplica a 12/11-3 também à Zona destrutiva, sem trava nova sobre conceder dev (a forma é da F69). Se a sua
   intenção era outra (por exemplo, proibir o cargo dev em qualquer empresa que não seja a WAP), diga antes de rodar.
2. **Nenhum número de banco foi medido nesta conversa.** O conector da Supabase daqui não enxerga os projetos da WAP. Os
   28 fatos são do disco e do git de hoje e dos relatórios. O agente remede tudo, e o conta a conta (o portão) é dele.
3. **`papel_atual()` não ganha parâmetro**, ao contrário da letra da ficha: dar parâmetro a uma função citada por
   policy exige `cascade` ou cria uma sobrecarga ambígua (fato 6). As formas por empresa ganham nome próprio, e o
   "sem empresa" passa a ser só o piso pareado. É a divergência mais importante da ordem. O agente confirma na
   documentação antes de seguir.
4. **As policies de `storage` e de `membros` vão para a forma por empresa com a WAP EXPLÍCITA nesta fase.** O recorte de
   verdade delas é da F67B e da F69. Sem isso, a mudança do piso abriria o bucket de backups para o admin de outra
   empresa entre a F67 e a F67B.
5. **O agente aplica no ensaio E em produção**: a expansão antes do merge, a contração depois do deploy, pelo MCP. É o
   fluxo das F53 a F66B mais a receita da F60, não decisão nova sua. Sem MCP, é caminho B, com o PR sem merge.
6. **Uma run, um PR de código (expansão + contração em arquivos separados) e um PR de documentação com a tag.** Versão
   `1.73.0`.
7. **A lista de empresas com modelo de termo fica no banco e só muda por migration**, junto com os modelos `.docx` da
   empresa. Não fica num interruptor clicável.
8. **A distribuição das notas da ficha** entre F67, F67B e F67C é a da Frente F. O agente pode mover uma nota com motivo
   na ata.
9. **Sobrou um arquivo `.cv-tmp.mjs` na raiz do repositório**, um script de leitura que usei para medir os corpos de
   função. Não consegui apagá-lo daqui: apague antes de rodar (o pré-voo lembra), ou eu peço permissão para apagar.

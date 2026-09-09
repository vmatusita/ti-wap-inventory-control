# F54 — O backup deixa de mentir, e a restauração é ensaiada

*Ordem de serviço gerada em 09/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco C.*

**Por que ela existe.** A tela do reset diz, com todas as letras: *"NADA foi apagado — reset sem backup é
proibido"* (`src/lib/actions/dev-destrutivo.ts:378`). A frase é falsa para uma classe inteira de dado. O
backup do reset e o backup do import fazem `select('*')` das **LINHAS**; os `.docx` dos termos de
responsabilidade — os documentos que uma pessoa assinou — são apagados do bucket `termos` logo depois, e
**nenhum dos dois backups os carrega**. Restaurar devolve `termos_gerados` apontando para objetos que não
existem mais. Não é uma lacuna de implementação: é uma **promessa falsa impressa na tela**, e o plano a
classifica entre os itens que "nunca cortam".

O segundo defeito é da mesma família: **a restauração não existe** — nem em código, nem em desenho. Não há
`scripts/db/restaurar.mjs`, não há seção "restauração" no `docs/RUNBOOK-BANCO.md`, e nunca se restaurou nada.
Um backup que ninguém sabe restaurar é um arquivo, não um backup. O `restore` que o Supabase oferece é do
**projeto inteiro** — no multiempresa isso levaria os outros clientes de volta ao ponto do backup, e por isso
a F73 (o piloto) depende do restaurador desta fase.

**Por que ela vem AGORA.** Porque provar a restauração **antes de existir cliente** custa uma tarde, e depois
custa uma crise. E porque a F53, que acabou de fechar, deixou um custo herdado escrito na própria ata: a
coluna `movimentacoes.ordem` nasceu `generated always as identity`, e a ata 1 da F53 diz literalmente
*"**Custo herdado pela F54:** restauração precisa de `overriding system value`"*. Restaurar sem isso é
`INSERT` recusado; restaurar com isso e esquecer o `setval` é violação do índice único na **primeira**
movimentação depois da restauração. A fase seguinte é a que paga — e a fase seguinte é esta.

**O que esta fase NÃO é.** Não é retenção nem expurgo de `import_logs` e do bucket (é decisão de produto com
prazo, e o plano a declara como pendência do piloto). Não é empobrecer os valores de `import_logs.correcoes`
— o arquivo original não é guardado, e o par `de`/`para` é a única prova que resta; o remédio é retenção, não
redução. Não é `empresa_id` em lugar nenhum (F62). Não é policy de Storage (a cadeia de download é pela
**aplicação**; arrumar policy de bucket **não** a fecha). Não é restaurar nada em produção — o ensaio é
ensaio. E não é oportunidade de "melhorar o import": a RPC não se toca nesta fase.

---

**Trinta e quatro fatos de leitura do repositório, medidos em 09/09/2026, que a ficha do plano não tem.**
Estão agrupados pelas cinco frentes. **Refaça cada medição antes de usá-la.**

## Frente A — os `.docx` entram no backup

1. **A migration desta fase é a `0136`, e a versão é a `1.59.0`.** A ficha promete a `0134`; a F53 consumiu a
   `0133`, a `0134` **e** a `0135` (`0135_indice_data_ordem.sql`, acréscimo medido durante a fase). Há **134
   arquivos** em `supabase/migrations/` (a `0029` é um gap real), e o último é o `0135`. O `package.json` está
   em **`1.58.0`**. Meça os dois antes de aceitar: se você tiver rodado alguma entrega avulsa (PATCH) depois
   da F53, a versão é outra.

2. **São TRÊS Server Actions que apagam `.docx` do bucket `termos`, não duas.** A ficha nomeia `importar.ts` e
   `dev-destrutivo.ts`. A terceira é **`src/lib/actions/conflitos.ts:123`** — `limparArquivosDeTermo`, gêmeo
   *byte a byte* do de `dev-destrutivo.ts:97`, inclusive no comentário que diz que é gêmeo. O backup dela
   (`conflito/<digest dos ids>/<carimbo>.json`, montado em `:240-266`) também carrega só LINHAS.
   **Decisão do Johnny para esta fase: as TRÊS entram.** O motivo é a trava: `backup-completude.test.ts` pega
   a **CLASSE** ("toda action que chama `.from('<bucket>').remove(` copia antes"), então deixar uma de fora
   faria a trava nascer vermelha e obrigar uma exceção escrita — e exceção em trava nova é a porta por onde a
   próxima entra.

3. **As linhas da ficha estão defasadas.** A ficha diz `importar.ts:454-467`; o `remove` está hoje em
   **`:486`**, dentro do bloco `arquivosTermosRemovidos` (`:480-497`). A F51 e a F52 mexeram no arquivo.
   Trate TODA linha citada aqui e na ficha como ponto de partida de busca, nunca como endereço.

4. **Nas três, o `remove` acontece DEPOIS do commit da RPC — e nas três o backup subiu ANTES dela.** Então
   "copiar antes de remover" **não** é "copiar antes do backup": a cópia entra entre o retorno da RPC e o
   `remove`. Consequência que decide o desenho: o JSON do backup **já foi gravado** quando os `.docx` são
   copiados, então o JSON **não pode listar** os caminhos das cópias — a menos que a fase mude a ordem (subir
   o JSON depois), o que quebraria a garantia central dos três caminhos ("backup antes de qualquer coisa
   destrutiva"). **Não mude a ordem.** Ou o `nao_incluido`/manifesto vira um segundo objeto ao lado do JSON,
   ou a convenção de caminho é determinística o bastante para que o restaurador ache as cópias sem lista.
   Decida (Decisão 2) e escreva.

5. **⚠ "`<prefixo do backup>/termos/`" não é um caminho — é uma ambiguidade.** Os três backups são ARQUIVOS,
   não pastas:
   - import: `import/filial-<id>/<timestamp>.json` (`importar.ts:415`, prefixo de `validators/importar.ts:236`)
   - reset: `reset/<bloco>/<escopo>/<carimbo>.json` (`dev-destrutivo.ts:369`)
   - conflito: `conflito/<digest dos ids>/<carimbo>.json` (`conflitos.ts:259`)

   `import/filial-3/2026-09-09T12-00-00-000Z.json` + `/termos/` daria
   `import/filial-3/2026-09-09T12-00-00-000Z.json/termos/…`, que é um nome de objeto legal no Storage e
   ilegível para qualquer humano. A convenção honesta é derivar um **irmão** do JSON (o mesmo prefixo, o
   mesmo carimbo, sufixo próprio). **Ela tem de continuar satisfazendo as conferências de prefixo do banco**:
   a `0089:121-130` (reset) exige que `p_backup_path` comece por `prefixo_backup_reset(bloco, filial)` E
   exista em `storage.objects`; a `0100` (conflito) exige o prefixo `conflito/<digest>/`. Objetos EXTRA sob o
   mesmo prefixo não quebram nenhuma das duas — mas confirme lendo, não supondo.

6. **⚠ `.copy()` do supabase-js copia dentro do MESMO bucket por padrão.** Copiar de `termos` para
   `backups-import` é cópia **entre buckets**, e isso depende de uma opção (`destinationBucket`) cuja
   existência varia com a versão da lib — o projeto está em `@supabase/supabase-js ^2.110.2`.
   **A regra 6 do `CLAUDE.md` manda conferir a documentação oficial atual antes de escrever o código: use o
   MCP Context7.** Se a versão instalada não suportar, as três saídas honestas são: (a) copiar DENTRO de
   `termos`, para um prefixo de backup próprio (mais barato, mas mistura backup com acervo vivo);
   (b) `download` + `upload` (custa banda e memória do servidor, e o teto de um reset global não é pequeno);
   (c) subir a versão da lib — que já está na stack, mas mudança de versão é decisão registrada, não
   detalhe. **Não invente uma quarta.**

7. **Quem remove NÃO é o mesmo client nas três — e isso é regra, não acaso.** `dev-destrutivo.ts:93` e
   `conflitos.ts:119` usam `createAdminClient()` (com o motivo escrito: conservadorismo, não necessidade).
   `importar.ts:486` usa o **client da sessão**, e o cabeçalho do módulo proíbe o outro com todas as letras:
   *"TODO acesso ao banco/Storage/RPC pelo client autenticado do operador … jamais service_role"*
   (`importar.ts:32-36`). **A cópia usa o MESMO client de quem remove**, nos três — senão esta fase
   reintroduz o service role exatamente onde ele foi banido, e a trava de `superficie-admin.test.ts` existe
   para acusar isso.

8. **`limparArquivosDeTermo` já confere o `data` de `remove()`, não só o `error`** — nos dois gêmeos, com o
   comentário explicando por quê (a API responde 200 com a lista do que realmente saiu; remoção parcial não
   levanta erro). **A cópia precisa da mesma disciplina, e mais uma:** a ficha manda que, **se a cópia
   falhar, NÃO se remova** — *"órfão no bucket é infinitamente melhor que documento assinado perdido, e o
   sistema já convive com órfãos"*. Isso **inverte o contrato de hoje** dos dois gêmeos, que removem
   best-effort e devolvem AVISO. Consequências que precisam estar escritas: a mensagem da tela muda; a 8ª
   checagem (`arquivo_termo_orfao`) passa a contar uma população diferente; e a **cópia parcial** (alguns
   copiados, outros não) precisa de regra própria — remover só os que copiaram, ou não remover nenhum?
   Decida (Decisão 3).

9. **O campo `nao_incluido` tem conteúdo REAL para descobrir, e ele é diferente nos três backups.** Medido:
   - `exportarAcervoFilial` traz `ativos, movimentacoes, anotacoes, termos_gerados` — e **não traz
     `pendencias_item`**. Isso não é suposição minha: está escrito em `queries/dev-destrutivo.ts:364-366`
     (*"Inclui `pendencias_item`, que `exportarAcervoFilial` NÃO traz: aquele exportador nasceu antes da F18 e
     nunca aprendeu a tabela — a mesma lacuna que deixou a RPC do import sem apagá-la"*).
   - `montarBackupDoReset` do bloco `acervo` traz `ativos, movimentacoes, anotacoes, pendencias_item,
     termos_gerados`; do bloco `itens`, só `lancamentos_item`.
   - o de conflito traz `lados` (o retrato legível) mais o acervo dos ids.

   **Levantar essa lista é trabalho de medição, não de redação.** Compare o que cada exportador lê com o que
   a RPC correspondente APAGA — a diferença entre os dois conjuntos **é** o `nao_incluido`, e qualquer linha
   que a RPC apague e o backup não leve é um achado desta fase, não um detalhe de cabeçalho.

10. **Os cabeçalhos não têm o mesmo formato, e a ficha supõe que têm.** O do import tem
    `versao: 1, exportadoEm, filial, contagens` (`importar.ts:416-422`); o de conflito tem
    `versao: 1, exportadoEm, motivo, ativoIds, lados`; o do reset tem `bloco, filial_id, gerado_em` — **sem
    `versao` e sem contagens**. `backup-formato.test.ts`, que a ficha pede para "congelar as chaves de topo e
    o `nao_incluido` e reprovar quem acrescenta tabela sem bumpar a `versao`", **não tem `versao` para
    congelar no backup do reset**. Ou o cabeçalho do reset ganha `versao` e `contagens` nesta fase, ou a
    trava nasce com uma exceção. Decida (Decisão 4) — e note que a conferência de restauração da ficha
    ("comparar `rel_estoque_asof` na data de `exportadoEm` com as `contagens` do cabeçalho") **exige os dois
    campos**, então provavelmente a resposta já está dada.

## Frente B — o backup para de ler demais, e de deixar sobra

11. **`exportarAcervoFilial` (`queries/import-logs.ts:217`) é a única das quatro leituras sem recorte** — e a
    ficha acerta. As outras três filtram (`.eq('filial_id')` para ativos, `.in('ativo_id', lote)` para
    movimentações e anotações); a de `termos_gerados` (`:281-289`) faz `paginarTodos` da tabela INTEIRA e
    filtra em TypeScript com `filialSet`.

12. **`montarBackupDoReset` tem a MESMA leitura sem recorte** (`queries/dev-destrutivo.ts`, o `todosTermos` +
    filtro em TS), e a ficha **não a nomeia**. Mesma classe, mesmo custo, outro arquivo. Decida (Decisão 5)
    se entra nesta fase ou vira backlog nomeado — mas não a deixe fora **em silêncio**.

13. **⚠ `.overlaps('ativo_ids', ids)` pode ser PIOR que a leitura de hoje, e isso se mede antes.** Dois
    motivos: (a) o filtro vai na URL, igual ao `.in()` — mil uuids estouram o limite, e por isso a ficha diz
    "em lotes" (a constante `LOTE = 100` já existe em `import-logs.ts:44`); (b) `&&` sobre `uuid[]` só usa
    índice se houver **GIN** em `termos_gerados.ativo_ids`. **Meça se ele existe** (`pg_indexes` para
    `termos_gerados`). Se não existir, `.overlaps` faz um seq scan **por lote** — com 13 lotes, treze scans no
    lugar de uma leitura paginada. As saídas: criar o índice GIN nesta fase (com a medição na ata, no molde da
    `0105`), ou manter a leitura de hoje e registrar o motivo. **"É a única sem recorte" não é argumento
    suficiente para trocar por algo mais lento.**

14. **`descartarBackupNaoUsado` existe só em `conflitos.ts:84`**, e usa `createAdminClient()`. A ficha manda o
    gêmeo no ramo de erro do import **com o client de sessão** — *"`importar.ts:32-34` proíbe service role
    naquele módulo, e a policy `e_admin()` do bucket basta"*. **Confirme a segunda metade lendo a `0066`**
    (as policies de `storage.objects` para `backups-import`): se o DELETE pela sessão não passar, o descarte
    silenciosamente não acontece e o teste que você escrever passa verde contra um mock.

15. **O ramo que precisa do descarte é UM só, e vale identificá-lo com precisão.** O upload do backup está em
    `importar.ts:425-433`; a RPC em `:459-464`. **Só o `if (error)` da RPC (`:465-479`) deixa órfão** — nele
    nada foi apagado e o backup não cobre exclusão nenhuma. O ramo do `safeParse` falho (`:481-489`) é o
    oposto: a RPC **concluiu**, os dados já foram substituídos, e o backup é a única cópia do que sumiu —
    **descartá-lo ali seria destruir a prova**. Os `return`s anteriores ao upload não têm o que descartar.
    Errar de ramo aqui é o defeito mais caro que esta fase pode introduzir.

16. **O evento `import_falhou` é ação NOVA no vocabulário de `eventos_admin`.** Meça se há check, enum ou
    trava de vocabulário sobre `eventos_admin.acao` (a `0065` a criou; a `0075` e a `0085`/`0095` ampliaram
    vocabulário) **antes** de gravar — um `insert` recusado dentro de um ramo de erro vira erro dentro de
    erro, e o operador vê a mensagem errada.

## Frente C — a fechadura no-op do download

17. **`urlBackup` NÃO está em `queries/import-logs.ts`** — está em **`src/lib/actions/importar.ts:559-580`**,
    e é uma Server Action. A ficha lista `src/lib/queries/import-logs.ts` nas entregas; a signed URL é emitida
    pela action, com `exigirAdmin` e nada mais. Ela lê `import_logs` por id (`:568-573`) e emite a URL de 60s
    (`:575-577`). **Não há recorte nenhum.**

18. **`listarImportLogs` (`queries/import-logs.ts:308`) também não recorta** — `select … .order('created_at',
    desc).limit(limite)`, sem filtro. Todo admin vê o histórico de todas as filiais, e isso é o desenho de
    hoje, não um bug de hoje.

19. **Decisão do Johnny: guarda no-op no molde da F52.** O molde é `mesmo_escopo_de_gestao` (`0132:78-95`):
    `security definer`, `stable`, corpo que devolve `true` hoje, **parâmetro aceito e IGNORADO de propósito**
    (*"é o que torna a guarda um no-op verificável em vez de uma promessa em comentário"*), **fechada nos
    quatro papéis** (`revoke all … from public, anon, authenticated, service_role`), chamada por `perform` de
    dentro de uma `security definer`, que roda como o DONO e por isso não precisa de grant.

    ⚠ **Aqui o chamador é OUTRO, e copiar o molde sem notar isso é o erro fácil desta frente.**
    `urlBackup` e `listarImportLogs` são **TypeScript**, não `security definer`. Uma função SQL fechada nos
    quatro papéis é **inalcançável** a partir de uma Server Action pelo client de sessão. As formas honestas:
    (a) função SQL com grant a `authenticated`, chamada por `rpc()` — custa um round-trip e **muda a
    superfície** que `definer_sem_tenant.sql` e `catalogo_secdef.sql` vigiam (as duas reprovam por função
    NOMEADA: a nova entra nas listas, no mesmo commit); (b) função **pura em TypeScript** em `src/lib/escopo/`
    — **`src/lib/escopo/chave.ts` já existe** (F50), leia antes de criar pasta —, com o teste que prova que
    ela é chamada nos dois pontos e que remover a chamada fica vermelho; (c) predicado dentro da própria
    query (`.eq()` derivado de um resolvedor de escopo que hoje devolve "tudo"). Escolha, e escreva por que
    (Decisão 6).

20. **A guarda tem de ser um no-op VERIFICÁVEL, não uma linha de comentário.** O teste que a prova é o
    entregável, não a guarda: uma mutação que a remova (ou a faça devolver `true` por outro caminho) tem de
    derrubar um rótulo NOMEADO. `mesmo_escopo_de_gestao` precisou de **duas** mutações na F52, e o motivo está
    escrito lá: *"uma guarda que devolve `true` é indetectável por efeito — uma mede a PRESENÇA, a outra o
    EFEITO"*. O mesmo vale aqui, e no injetor de mutações só cabe a metade SQL: a metade TypeScript é
    `npm run test`.

## Frente D — a restauração ensaiada

21. **`scripts/db/restaurar.mjs` não existe.** `scripts/db/` tem 13 arquivos (`corpo-vigente`, `diff-tipos`,
    `gerar-0134`, `gravar-lock`, `mutacoes`, `rodar-roteiros`, `run-mutation-tests`, `saida-roteiro`,
    `tipos-conjuntos` e os `.test.mts`); nenhum restaura nada. É arquivo novo, e ele é **ferramenta**, não
    feature do app — mesma natureza de `scripts/import/` (a carga do go-live).

22. **`docs/RUNBOOK-BANCO.md` não tem seção "restauração".** Os cabeçalhos vão de *"Rollback — a regra geral"*
    (~125) até *"Anexo A"* (~407) e *"Anexo B"* (~857), e nenhum trata de restaurar um backup do bucket.
    Rollback ali é sempre **reverter DDL**, nunca **recolocar dado**. A seção nova é entrega desta fase, e ela
    entra no corpo vivo — não no anexo histórico.

23. **A armadilha (a) da ficha é real, e o número que a decide já foi medido pela F53:**
    `trg_aplicar_movimentacao` é **BEFORE INSERT apenas** (`0004:135-137`; a F53 mediu e confirmou), e ele
    **recalcula o estado do ativo** a cada INSERT. Restaurar `ativos` no estado final e depois inserir
    `movimentacoes` faz o trigger reescrever `ativos.status` por cima do que você acabou de restaurar. As
    duas estratégias honestas — inserir `ativos` em estado inicial e deixar o trigger derivar, OU inserir
    tudo com o trigger desabilitado dentro da janela — **escolhem-se no desenho, com a razão escrita**, não
    no meio do passo 4 (Decisão 7).

24. **⚠ O custo que a F53 herdou para cá, e que a ficha não conhece.** `movimentacoes.ordem` é
    `generated always as identity` — a ata 1 da F53 registra a escolha e diz, textualmente, *"**Custo herdado
    pela F54:** restauração precisa de `overriding system value`"*. Três consequências, todas para o
    restaurador: (i) sem `overriding system value`, o INSERT é **recusado**; (ii) com ele, a **sequência** não
    avança — e sem `setval` depois, a primeira movimentação registrada após a restauração viola
    `movimentacoes_ordem_uidx`, com o sintoma aparecendo na cara do operador, não no restore;
    (iii) `guarda_acervo` (`0081`) recusa INSERT? **Meça** — ela é `before insert or update or delete`, e o
    que ela recusa exatamente decide se o restaurador precisa da janela `estoque.dev_destrutivo` ou não.
    **Esses três pontos viram asserção no roteiro, não parágrafo no runbook.**

25. **A conferência que vale mais que a contagem de linhas é a da ficha** — reexecutar `rel_estoque_asof` na
    data de `exportadoEm` e comparar com as `contagens` do cabeçalho. Ela **exige** que o cabeçalho tenha
    `exportadoEm` e `contagens`, e o do reset não tem nenhum dos dois (fato 10). E note o que ela prova de
    verdade: as `contagens` do import são `custoPreview` — as **quatro contagens do preview**
    (`ativos/movimentacoes/anotacoes/termos`), não uma reconstrução as-of. Comparar as duas coisas é
    comparar grandezas diferentes. Ou a conferência é (a) contagem × contagem, (b) as-of reconstruída ×
    as-of original recapturada, ou (c) as duas. Decida e escreva o que cada uma prova.

26. **Decisão do Johnny: mecânica no CI, `.docx` no ensaio, uma vez.** O Postgres descartável do
    `banco-sem-docker` é bootstrapado por `supabase/ci/bootstrap-*.sql` — inclusive `bootstrap-storage.sql`,
    que cria o **schema** `storage`, e não o **serviço**. Não há API de Storage lá: o `.docx` não pode ser
    provado no CI. Então o restaurador roda como roteiro reexecutável contra o banco descartável (ordem de
    inserção, trigger, `overriding system value`, `setval`, conferência de as-of) **e** roda uma vez no
    projeto de ensaio com Storage e um `.docx` de verdade, com a saída colada na ata. **O `.docx` do ensaio é
    100% FICTÍCIO** — regra 2 do `CLAUDE.md`, sem exceção, e o pacote de `docs/f39-evidencias/` é o
    precedente de como se monta um.

27. **`_asserts.sql` traz `pg_temp.assert_zero_de`, que RECUSA universo vazio** — a forma da casa desde a F45.
    Um roteiro de restauração que rode sobre banco vazio passa verde sem provar nada, e é exatamente o modo
    de falha desta frente. Use a forma que recusa o vazio, ou explique por que não.

28. **O ensaio é `sgmvldiizsrjbxzzpmhh`, e a F53 mediu que ele estava VIVO** — fingerprint idêntico ao de
    produção nas quatro funções daquela fase, primeira vez desde a F35 em que ensaio-primeiro foi possível.
    **Confirme antes de contar com isso**: ele já esteve INACTIVE nas F36, F37 e F50, e o `restore` é recusado
    pelo classificador do modo automático.

## Frente E — a checagem 12 e o fechamento

29. **São ONZE checagens hoje, não dez.** `dev_checagens_integridade()` vem da **`0127:177`**, e o `comment`
    de `0127:300-301` diz *"as ONZE checagens"*, ampliada na `0085`, `0095`, `0098`, `0110` e `0127`. O
    catálogo curado está em `src/lib/queries/dev.ts:194-260`, com as onze na ordem
    (`patrimonio_duplicado`, `ativo_filial_inativa`, `termo_sem_arquivo`, `perfil_sem_conta`,
    `conta_sem_perfil`, `pendencia_de_estornada`, `operador_sem_filial`, `arquivo_termo_orfao`,
    `conflito_entre_filiais`, `detentor_em_estado_sem_dono`, `reserva_aberta`). **A entrada curada da décima
    segunda entra no MESMO commit da migration** — a rede de `juntarCatalogoComResultados` é o piso, não o
    plano, e o cabeçalho de `validators/dev-integridade.ts` conta com todas as letras a vez em que a rede não
    existia e duas checagens novas ficaram invisíveis por uma fase inteira.

30. **⚠ A checagem 12 precisa conhecer TRÊS produtores de caminho, e a ficha nomeia duas fontes.** A ficha
    manda comparar contra `import_logs.backup_path` UNION `eventos_admin.detalhe->>'backup_path'`. Os
    produtores de objeto no bucket são: `import/filial-N/…` (`importar.ts:415`), `reset/<bloco>/<escopo>/…`
    (`dev-destrutivo.ts:369`) e `conflito/<digest>/…` (`conflitos.ts:259`). **Meça, para cada um, onde o
    caminho fica registrado** — `import_logs`, `eventos_admin.detalhe`, ou o jsonb do evento das RPCs
    destrutivas — antes de escrever o predicado. Um predicado que conheça dois dos três acusa o terceiro como
    órfão a cada abertura da tela, e uma checagem que grita sem motivo é pior que checagem nenhuma.

31. **⚠ A checagem 12 lê `storage.objects`, e as onze atuais leem só `public.*`.** Isso não é detalhe: meça se
    o **dono** de `dev_checagens_integridade` alcança `storage.objects` (as policies da `0066`, e o
    `bootstrap-storage.sql` do CI, que é o recorte MÍNIMO). `security definer` roda como o dono, não como
    superusuário. Se não alcançar, a checagem **não é escrevível como as outras** — e isso é achado a
    registrar, com a alternativa (checagem pelo lado da aplicação, no molde de uma query da `/dev`), não
    fracasso a esconder.

32. **⚠ A `0136` NÃO PODE depender da `0132`.** Decisão do Johnny: a fila `0131`→`0132` continua **sem
    aplicar** (medido na F52 e reconfirmado na F53) e esta fase não a aplica. Consequência dura: a função SQL
    **`prefixo_backup_import(smallint)` não existe no banco** — ela nasce na `0132` (`:236`), que está só no
    repositório; o que está no ar é a gêmea **TypeScript** (`validators/importar.ts:236`), deployada com a
    v1.57.0. Qualquer trecho da `0136` que chame `prefixo_backup_import()` **falha no apply**. A `prefixo_
    backup_reset(text, smallint)` (`0089:50`), essa sim, está aplicada. Confira as duas no banco antes de
    escrever uma linha de SQL.

33. **O risco de custo é mensurável hoje.** A ficha estima 67 arquivos / 5,2 MB no bucket `termos`, e o Free do
  Supabase dá 1 GB. Meça o valor real (`storage.objects` por bucket, soma do tamanho) e projete o custo da
  cópia sobre o pior caso (reset global). Se for insignificante — e provavelmente é —, a alternativa que a
  ficha abre ("mudar a frase da UI com ata") **não se abre**, e isso vai escrito: *"o que não pode continuar
  é a promessa atual"*.
34. **`src/lib/versoes/registry.ts` recusa 21 termos de desenvolvedor**, entre eles "migration", "policy",
  "schema", "deploy", "RPC" e "backup"? — **meça a lista, não confie na minha**. A entrada da 1.59.0 é em
  LINGUAGEM DE OPERADOR, e o efeito honesto desta fase é que o arquivo de segurança gerado antes de apagar
  passa a levar junto os documentos assinados, e que a devolução desse arquivo foi ensaiada.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Fazer o "backup obrigatório" cumprir a promessa que a tela faz, e provar a restauração antes de existir
cliente. Ao final: as TRÊS Server Actions que apagam `.docx` do bucket `termos` — `importar.ts`,
`dev-destrutivo.ts` e `conflitos.ts` — copiam os arquivos para o backup ANTES de remover, e **não removem se
a cópia falhar**; o cabeçalho de cada backup declara o que ele NÃO leva (`nao_incluido`), levantado por
medição contra o que a RPC correspondente apaga; `exportarAcervoFilial` para de ler `termos_gerados` inteira;
`urlBackup` e `listarImportLogs` ganham a guarda de pertencimento NO-OP (no molde da F52: hoje sempre passa,
com uma empresa só, e não muda nada para ninguém); `scripts/db/restaurar.mjs` existe e foi **ensaiado de
verdade** — a mecânica contra o Postgres descartável do CI, e uma vez no projeto de ENSAIO com um `.docx`
fictício de verdade, com a saída colada na ata; o import passa a descartar o backup que a RPC recusou e a
registrar `import_falhou`; e a migration `0136` acrescenta a DÉCIMA SEGUNDA checagem de integridade (backup
órfão em `backups-import`). Versão **1.59.0** com tag publicada; PR mergeado com `verificar` e
`banco-sem-docker` verdes; `0136` aplicada em ensaio e produção.
**Nenhuma RPC de import ou de reset é recriada. Nenhum `empresa_id`. Nenhuma dependência nova. Nenhum dado
real em fixture, teste ou evidência. A fila `0131`→`0132` NÃO é aplicada.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo e as regras permanentes. Pesam aqui a **1** (escopo da ordem
  atual), a **2** (NUNCA dados reais — e esta fase manipula documentos assinados de pessoas de verdade), a
  **3** (custo R$ 0, stack FECHADA), a **4** (segredos), a **5** (produção com autoproteção), a **6** (conferir
  a doc oficial das APIs de integração ANTES de escrever — o `.copy()` do Storage é exatamente esse caso) e a
  **8** (versão, sem exceção).
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns — em especial a **2**, estado de
  repouso; a **3**, escopo fora explícito; a **4**, trava antes da correção; e a **10**, toda fase que toca
  banco declara a ORDEM de rollback), **§5 → F54** (a ficha completa) e depois **§5 → F73** (o piloto, que
  reusa o restaurador desta fase) e **§9** (onde a F54 aparece entre as que "nunca cortam", e por quê).
  ⚠ **A ficha da F54 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem, vale a ficha
  — exceto onde este prompt traz uma MEDIÇÃO contra o disco de hoje; aí vale a medição, e ela vai para o
  relatório com a divergência explicada.
- As TRÊS actions, INTEIRAS, com os comentários: `@src/lib/actions/importar.ts` (o upload do backup em
  `:415-434`, a RPC em `:459`, o ramo de erro em `:465-479`, o `safeParse` em `:481-489`, o `remove` em
  `:480-497`, `urlBackup` em `:559-580`, e o cabeçalho `:32-40` que PROÍBE service role neste módulo);
  `@src/lib/actions/dev-destrutivo.ts` (`limparArquivosDeTermo` em `:88-113`, o backup do reset em
  `:360-383`, e a frase "NADA foi apagado — reset sem backup é proibido" em `:378`, que é a promessa falsa que
  esta fase existe para consertar); `@src/lib/actions/conflitos.ts` (`descartarBackupNaoUsado` em `:84-97`,
  `limparArquivosDeTermo` em `:114-146`, o backup em `:240-273`, o descarte em `:296`).
- `@src/lib/queries/import-logs.ts` — `exportarAcervoFilial` (`:217`), a leitura de `termos_gerados` sem
  recorte (`:281-289`), `listarImportLogs` (`:308`), a constante `LOTE` (`:44`) e `paginarTodos`.
- `@src/lib/queries/dev-destrutivo.ts` — `montarBackupDoReset` (`:368`) e o comentário de `:364-366`, que já
  diz por escrito qual tabela o exportador do import não aprendeu.
- `@supabase/migrations/0089_reset_backup_do_recorte.sql` — INTEIRA. É a DOUTRINA do backup nesta casa: o
  prefixo derivado por função (`prefixo_backup_reset`, `:50`), a cascata de conferências (`:117-131`) e o
  motivo escrito de cada uma. O caminho novo dos `.docx` tem de continuar satisfazendo essa cascata.
- `@supabase/migrations/0100_conflito_lock_e_backup.sql` — o prefixo `conflito/<digest>/` e a razão de o
  digest estar no nome.
- `@supabase/migrations/0132_guardas_de_escopo.sql` — `mesmo_escopo_de_gestao` (`:65-95`) é o MOLDE da guarda
  no-op, com o comentário que explica por que ela ignora o parâmetro de propósito e por que nasce fechada nos
  quatro papéis. ⚠ **Ela NÃO está aplicada**, e `prefixo_backup_import` (`:236`) também não — leia o fato 32.
- `@supabase/migrations/0127_conversao_reservas.sql` (`:177-301`) — o corpo VIGENTE de
  `dev_checagens_integridade()`, com as onze checagens e o `comment` que as conta.
- `@supabase/migrations/0066_papeis_storage.sql` e `@supabase/migrations/0069_termos_mesma_filial.sql` — as
  policies dos buckets `termos` e `backups-import`. Elas decidem QUEM pode copiar, quem pode apagar e se o
  `descartarBackupNaoUsado` do import funciona pela sessão.
- `@supabase/migrations/0081_guarda_acervo.sql` — o que `movimentacoes`/`lancamentos_item`/`ativos` recusam, e
  a janela que os libera. É o arquivo que decide se o restaurador precisa da janela.
- `@supabase/migrations/0133_ordem_das_movimentacoes.sql` — a coluna `ordem`, a identidade `always` e o
  `setval`. O restaurador desta fase é quem paga o custo escrito na ata 1 da F53.
- `@docs/RELATORIO-F53.md` e `@docs/DECISOES.md` (as onze atas de 09/09/2026) — a fase anterior, os números
  medidos e o custo herdado.
- `@docs/RUNBOOK-BANCO.md`, nesta ordem: **"O caminho, em 30 segundos"** (~21), **"Topologia"** (~32),
  **"O gate do modo automático"** (~43), **"Aplicar uma migration" A e B** (~49), **"Rollback — a regra
  geral"** (~125), **"Roteiros de teste SQL — rode TODOS ao mexer em função/trigger"** (~142), a **"Sonda de
  paridade ensaio × produção"** (~181), a **trava de hash** (~279) com o *"Quem acrescenta migration atualiza
  DUAS listas"*, **"O banco do CI na mesa (sem o Docker do Supabase)"** (~331), as **"Armadilhas conhecidas"**
  (~382) e a **"Escalada"** (~391). É neste arquivo que a seção "restauração" vai nascer.
- `@supabase/tests/_asserts.sql` (a forma que recusa universo vazio), `@supabase/tests/dev_destrutivo.sql`
  (onde reset e backup já são exercitados), `@supabase/tests/import_substituir.sql`,
  `@supabase/tests/conflito_filiais.sql` e `@supabase/tests/storage_termo.sql`.
- `@src/lib/validators/import-uma-porta.test.ts` (F51) e `@src/lib/use-server-exports.ts` — as travas
  ESTÁTICAS da casa: elas leem o fonte e reprovam uma CLASSE sem precisar de banco. `backup-completude.test.ts`
  é dessa família, e essas duas são o molde.
- `@src/lib/queries/dev.ts` (`:194-260`, o catálogo curado) e `@src/lib/validators/dev-integridade.ts`
  (a rede permanente e a história de quando ela não existia).
- `@src/lib/escopo/chave.ts` (F50) — leia ANTES de criar módulo novo de escopo.
- `@scripts/db/corpo-vigente.mjs`, `@scripts/db/mutacoes.mjs`, `@scripts/db/mutacoes.test.mts` e
  `@scripts/db/rodar-roteiros.sh` — o rig, o teto e a forma de uma mutação.
- `@docs/prompts/F53-ordem-das-movimentacoes-ultracode.md` e `@docs/RELATORIO-F52.md` — o padrão de ordem e de
  relatório da casa, e o estado da fila de apply.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Os trinta e quatro fatos medidos estão no cabeçalho desta ordem, fora do bloco do prompt. Releia-os e **refaça
cada medição**: o número da última migration e a versão do `package.json`; as TRÊS actions que removem do
bucket e as linhas exatas; qual client cada uma usa; o que cada exportador lê e o que a RPC correspondente
apaga (a diferença É o `nao_incluido`); as chaves de topo dos três cabeçalhos de backup; o índice de
`termos_gerados.ativo_ids`; as policies dos dois buckets; os gatilhos e a guarda que o restaurador enfrenta;
as onze checagens e o catálogo curado; o estado da fila `0131`→`0132` e a AUSÊNCIA de `prefixo_backup_import`
no banco; o tamanho real do bucket `termos`. Onde a sua medição divergir da minha, **a sua ganha** — desde que
ela esteja no relatório com a divergência explicada.

**Duas medições são obrigatórias antes de escrever código, e nenhuma delas está no cabeçalho:**
(1) A **API real do `.copy()`** da versão de `@supabase/supabase-js` instalada — cópia entre buckets é
suportada? com que assinatura? **Consulte a documentação oficial pelo MCP Context7** (regra 6 do CLAUDE.md);
não confie em API de memória, e não descubra isso em tempo de execução.
(2) O **conjunto exato do que cada RPC destrutiva apaga**, lido do SQL vigente, contra o conjunto que o
exportador correspondente lê. É essa diferença que preenche o `nao_incluido` — e é onde mora o achado desta
fase, se houver.

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste`
- `npm run db:test` · `npm run db:test:um <roteiro>` · `npm run db:test:mutations` · `npm run db:types:diff`
- `npm run db:lock` — **obrigatório**: a fase acrescenta a `0136`. Mesmo commit da migration.
- `npm run db:types` — depois do apply. Se o apply não acontecer, hand-fix comentado e datado com a pendência
  declarada (precedente da F51, da F52 e da F53).
- `npm run verificar:actions` · `node scripts/smoke/smoke-prod.mjs`
- `gh run watch` / `gh run view --log-failed` — o `gh` EXISTE nesta máquina (F45 §15); pode não estar no PATH
  da sessão. *"Comando não encontrado" é hipótese, não conclusão.*

# Escopo

## Dentro — cinco frentes, nesta ordem

### Frente A — os `.docx` entram no backup (o item que "nunca corta")
- **A trava vem ANTES da correção** (regra 4 do §4 do plano). Escreva `src/lib/actions/backup-completude.test.ts`
  PRIMEIRO, e faça-o nascer **VERMELHO** contra o repositório de hoje: toda Server Action que chame
  `.from('<bucket>').remove(` tem de conter, antes, a cópia daquele mesmo conjunto de caminhos. Ele pega a
  CLASSE — "apagar artefato de Storage sem cópia" — e a classe cresce com todo bucket novo. É trava ESTÁTICA,
  no molde de `import-uma-porta.test.ts` (F51): lê o fonte, não precisa de banco.
- **As TRÊS actions copiam antes de remover:** `importar.ts` (`:486`), `dev-destrutivo.ts` (`:97`) e
  `conflitos.ts` (`:123`). A terceira não está na ficha e entra por decisão do Johnny — sem ela a trava nasce
  com exceção.
- **Se a cópia falhar, NÃO remova.** Órfão no bucket é infinitamente melhor que documento assinado perdido, e
  o sistema já convive com órfãos (a 8ª checagem existe para contá-los). Isso inverte o contrato de hoje dos
  dois gêmeos, que removem best-effort — a mensagem da tela muda junto, e a mudança é declarada.
- **Cada cópia usa o MESMO client de quem remove** — sessão no import (o módulo proíbe service role),
  administrativo nos outros dois. Não uniformize "para ficar bonito".
- **Cópia parcial tem regra própria e escrita** (Decisão 3): a API responde 200 com a lista do que realmente
  saiu, e o `remove()` dos gêmeos já confere o `data`. A cópia confere igual.
- **`nao_incluido: []` no cabeçalho dos três backups**, com conteúdo LEVANTADO POR MEDIÇÃO (o que a RPC apaga
  menos o que o exportador lê), não redigido de memória. Um backup que documenta os próprios limites é a
  única defesa contra restaurar acreditando ter restaurado tudo.
- **`src/lib/actions/backup-formato.test.ts`**: congela as chaves de topo dos três cabeçalhos e o
  `nao_incluido`, e reprova quem acrescentar tabela ao backup sem bumpar a `versao`. ⚠ O cabeçalho do reset
  **não tem `versao`** hoje — decida (Decisão 4) se ele ganha um nesta fase ou se a trava nasce com exceção
  escrita.
- **A convenção de caminho das cópias** (Decisão 2): irmã do JSON, sob o mesmo prefixo, e continuando a
  satisfazer as conferências de prefixo da `0089` e da `0100`. Prove que satisfaz — com o SQL das duas
  conferências rodado contra um caminho de exemplo, não por leitura.

### Frente B — o backup para de ler demais, e de deixar sobra
- **`exportarAcervoFilial` deixa de ler `termos_gerados` INTEIRA.** `.overlaps('ativo_ids', ids)` em lotes de
  100 — **mas só depois de medir o índice** (fato 13). Se não houver GIN em `ativo_ids`, meça o plano das duas
  formas e decida com o número: criar o índice nesta fase (com a medição na ata, no molde da `0105`) ou manter
  a leitura de hoje com o motivo escrito. **Trocar uma leitura por outra mais lenta é regressão, não
  correção.**
- **`montarBackupDoReset` tem a mesma leitura** (fato 12): entra nesta fase ou vira backlog NOMEADO —
  decida (Decisão 5), não a deixe fora em silêncio.
- **`descartarBackupNaoUsado` no import**, no ramo de erro da RPC — e **SÓ nele** (fato 15). O gêmeo existe em
  `conflitos.ts:84`; use o mesmo desenho, com o client de SESSÃO (o módulo proíbe o outro), depois de conferir
  na `0066` que a policy permite. ⚠ **Não descarte no ramo do `safeParse`**: ali a RPC concluiu, os dados já
  foram substituídos, e o backup é a única cópia do que sumiu.
- **Evento `import_falhou` em `eventos_admin`**, depois de conferir o vocabulário (fato 16).

### Frente C — a fechadura no-op do download
- `urlBackup` (`actions/importar.ts:559`) e `listarImportLogs` (`queries/import-logs.ts:308`) ganham a guarda
  de pertencimento **no-op**, no molde da F52: hoje sempre passa, com uma empresa só não muda nada para
  ninguém, e é o ponto de injeção NOMEADO que a F62/F69 vai preencher trocando só a guarda.
- ⚠ **O chamador é TypeScript, não `security definer`** (fato 19). Escolha a forma (Decisão 6) sabendo o custo
  de cada uma — e se escolher a função SQL, ela entra nas listas nominais de `definer_sem_tenant.sql` e
  `catalogo_secdef.sql` **no mesmo commit**, senão as travas da F48/F52 reprovam.
- **A guarda tem de ser um no-op VERIFICÁVEL**: teste que prova PRESENÇA e teste que prova EFEITO, porque uma
  guarda que devolve `true` é indetectável por efeito (o motivo está escrito na F52, e lá ela precisou de duas
  mutações).
- **Nada muda para o operador.** Se a sua implementação mudar o que alguém vê hoje, ela está errada — ou é
  outra decisão, e aí é ata, não silêncio.

### Frente D — a restauração ensaiada
- **`scripts/db/restaurar.mjs`** — ferramenta, não feature; mesma natureza de `scripts/import/`. Guardas
  anti-produção obrigatórias, no molde de `scripts/env-guard.ts` (`REFS_DE_PRODUCAO`): **este script nunca
  aponta para produção**, e a recusa é por identidade, não por consistência (a armadilha que a F11 descobriu).
- **As duas decisões de desenho, tomadas ANTES do passo 4:**
  (a) a estratégia contra `trg_aplicar_movimentacao` (fato 23) — estado inicial + trigger deriva, OU trigger
  desabilitado dentro da janela; (b) `overriding system value` + `setval` para `movimentacoes.ordem`
  (fato 24), com asserção que prove que o PRÓXIMO insert não viola o índice único.
- **O ensaio, em duas metades** (decisão do Johnny): a **mecânica** como roteiro reexecutável contra o
  Postgres descartável do CI (`supabase/tests/restauracao.sql`, com `pg_temp.assert_zero_de` para não passar
  sobre universo vazio), e **uma vez de verdade** no projeto de ENSAIO, com Storage e um `.docx` **fictício**,
  ponta a ponta: gerar termo → reset → restaurar → abrir o `.docx` restaurado. Saída colada em
  `docs/f54-evidencias/`.
- **A conferência que vale** (fato 25): decida entre contagem × contagem, as-of × as-of, ou as duas — e
  escreva o que cada uma prova e o que não prova.
- **`docs/RUNBOOK-BANCO.md` ganha a seção "Restauração"**, no corpo vivo, com o procedimento, a ordem de
  inserção, as duas armadilhas e o que fazer quando o backup não tem o que se quer restaurar.

### Frente E — a checagem 12 e o fechamento
- **Migration `0136`**: a décima segunda checagem (`backup_orfao` ou o nome que a sua medição indicar) em
  `dev_checagens_integridade()`. Recriação por `create or replace` do corpo VIGENTE lido por
  `corpo-vigente.mjs` — **não copie corpo à mão**; o diff tem de ser só o bloco novo. SQL FIXO por dentro;
  função que receba SQL, tabela ou coluna como parâmetro segue PROIBIDA.
- **O predicado conhece os TRÊS produtores de caminho** (fato 30), medidos, não supostos.
- **⚠ Nada na `0136` pode chamar `prefixo_backup_import()`** — ela não existe no banco (fato 32).
- **Se o dono da função não alcançar `storage.objects`** (fato 31), registre o achado e entregue a checagem
  pelo lado da aplicação, com a razão escrita. Não invente `grant` novo para fazer caber.
- **A entrada curada em `src/lib/queries/dev.ts` entra no MESMO commit da migration.**
- Mutações novas em `scripts/db/mutacoes.mjs`, uma por trava nova que seja SQL; teto sobe com o motivo escrito
  no próprio `mutacoes.test.mts`. As travas TypeScript (`backup-completude`, `backup-formato`) provam-se por
  **sabotagem manual documentada**, não por mutação SQL.
- `npm run db:lock`; `CHANGELOG.md`; `package.json` **1.59.0**; `src/lib/versoes/registry.ts` em linguagem de
  operador; tag anotada `v1.59.0`; atas em `docs/DECISOES.md`; PR com os dois checks verdes; deploy.
- `docs/MATRIZ-REGRAS.md` ganha a regra do backup completo (leia o fim do arquivo para o próximo id da família
  certa — não invente o prefixo).

## Fora — não toque
- **Retenção e expurgo** de `import_logs` e do bucket — decisão de produto com prazo, pendência declarada do
  piloto. Não implemente, não proponha na tela.
- **Empobrecer `import_logs.correcoes`** — o arquivo original não é guardado, e `de`/`para` é a única prova
  que resta.
- **As RPCs de import e de reset**: `importar_ativos_substituir`, `import_validar_plano`, `resetar_acervo`,
  `resetar_itens`, `apagar_ativos_conflito_filiais` — **nenhuma é recriada nesta fase**. Todas contêm
  `delete from public.ativos`, batem no gate do modo automático, e levariam junto o apply automático da
  `0136`.
- **A fila `0131`→`0132`**: não aplique, não reordene, não a inclua no PR. Confira o estado e repita a
  pendência no relatório, com a ordem correta (`0131` antes da `0132`, na mesma janela ou nenhuma).
- **`empresa_id`, `membros`, `plataforma_admins`, qualquer tabela de tenant** — F62/F65.
- **Policies de Storage** — a cadeia de download que esta fase fecha é pela APLICAÇÃO; mexer em policy de
  bucket não a fecha e não é escopo.
- **Migration já aplicada**: nunca se edita (regra 8 do §4; `migrations.lock.json` reprova).
- **Restaurar qualquer coisa em produção.** O ensaio é o ensaio. O restaurador nem sequer aceita um ref de
  produção.
- **Formulários, layout, régua visual, componentes** — a única mudança de UI permitida é a mensagem que a
  Frente A torna honesta.
- Não altere teste existente para ficar verde. Se um teste existente estiver errado de fato, registre em
  `docs/DECISOES.md` e aponte no relatório — não o edite para passar.

# Critérios de aceitação
1. `backup-completude.test.ts` existe, nasceu **VERMELHO** contra o repositório de hoje (a saída da execução
   vermelha está em `docs/f54-evidencias/`), e está verde ao final **sem exceção nenhuma** — as três actions
   copiam antes de remover.
2. As três actions **não removem** quando a cópia falha, e há teste que prova o caminho da falha (não só o
   feliz).
3. Cada cópia usa o mesmo client de quem remove; `superficie-admin.test.ts` continua verde, e o import
   continua sem service role.
4. O caminho das cópias satisfaz as conferências de prefixo da `0089` e da `0100` — **provado rodando o SQL
   das duas conferências contra um caminho de exemplo**, não por leitura.
5. `nao_incluido` existe nos três cabeçalhos, com conteúdo **levantado por medição** (o que a RPC apaga menos
   o que o exportador lê), e a tabela dessa comparação está no relatório.
6. `backup-formato.test.ts` congela as chaves de topo e o `nao_incluido`, e reprova acréscimo de tabela sem
   bump de `versao` — com a sabotagem que prova que ele sabe ficar vermelho.
7. `exportarAcervoFilial` não lê mais `termos_gerados` inteira **OU** a decisão de mantê-la está escrita com o
   plano medido das duas formas (`EXPLAIN ANALYZE`, antes e depois).
8. O import descarta o backup no ramo de erro da RPC, e **só nele**; há teste que prova que o ramo do
   `safeParse` NÃO descarta.
9. `import_falhou` é gravado em `eventos_admin` sem ser recusado pelo vocabulário.
10. `urlBackup` e `listarImportLogs` passam pela guarda de pertencimento; ela é no-op hoje; há teste de
    PRESENÇA e teste de EFEITO; e **nada mudou para quem opera** (provado, não afirmado).
11. `scripts/db/restaurar.mjs` existe, recusa ref de produção por identidade, e trata `overriding system
    value` + `setval` de `movimentacoes.ordem`.
12. `supabase/tests/restauracao.sql` roda no `banco-sem-docker`, é verde, usa a forma que recusa universo
    vazio, e prova: a ordem de inserção; que `ativos.status` restaurado bate com o do backup depois do
    trigger; e que o **próximo** INSERT em `movimentacoes` não viola `movimentacoes_ordem_uidx`.
13. O ensaio ponta a ponta rodou **uma vez no projeto de ensaio, com um `.docx` fictício**, e o `.docx`
    restaurado abre — com a saída em `docs/f54-evidencias/`.
14. `docs/RUNBOOK-BANCO.md` tem a seção "Restauração" no corpo vivo, com as duas armadilhas nomeadas.
15. A `0136` acrescenta a 12ª checagem, o diff contra o corpo vigente é **só o bloco novo** (provado por
    `corpo-vigente.mjs`), o predicado conhece os três produtores de caminho, e a entrada curada está em
    `queries/dev.ts` no mesmo commit.
16. A `0136` **não chama** `prefixo_backup_import()` — grep provando.
17. `npm run db:test` inteiro verde, com o total de asserções antes e depois por roteiro.
18. `npm run db:test:mutations` verde, com as mutações novas acusadas pelo rótulo nomeado; teto atualizado com
    o motivo escrito.
19. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos.
20. `npm run db:lock` rodado no mesmo commit da migration; `migrations.lock.json` no diff.
21. `0136` aplicada em **ensaio primeiro**, depois produção, com a verificação pós-apply do runbook.
22. `database.ts` atualizado (regenerado ou hand-fix datado, com a pendência declarada).
23. Versão `1.59.0` no `package.json`, entrada no `CHANGELOG.md`, entrada no `registry.ts` em linguagem de
    operador (2 a 6 mudanças), tag anotada `v1.59.0`.
24. A ORDEM DE ROLLBACK escrita no cabeçalho da `0136`, e ensaiada pelo menos em `begin; … rollback;`.
25. PR mergeado com `verificar` e `banco-sem-docker` verdes; deploy publicado; smoke rodado.
26. O tamanho real do bucket `termos` medido, e o custo projetado da cópia no pior caso, no relatório.
27. `docs/RELATORIO-F54.md` com evidências reais, as divergências contra a ficha explicadas, e a seção "o que
    este relatório NÃO prova".
28. Nada fora do escopo tocado — em especial as cinco RPCs destrutivas, a fila `0131`→`0132`, as policies de
    Storage e o `import_logs.correcoes`.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes do PR. Depois da
migration: `npm run db:lock` e, se houver Postgres alcançável, `npm run db:test` **inteiro** — não só os
roteiros que você tocou: a regra da F17 (`RUNBOOK-BANCO.md:142`) manda rodar TODOS ao mexer em função, e esta
fase recria `dev_checagens_integridade`. Sem Postgres na mesa, o `banco-sem-docker` do PR é quem roda, e você
**lê a saída dele** com `gh run view --log-failed` em vez de supor. Leia a falha, corrija a **causa raiz** e
repita até passar.
**Não afrouxe trava, não acrescente exceção para ficar verde, não troque asserção por afirmação, não desligue
mutação porque deu trabalho, não faça a cópia "best-effort" para o teste passar quando a regra é NÃO REMOVER,
e não simule o Storage num teste que deveria falar com ele.** Falha persistindo depois de ~3 ciclos: mude de
abordagem e registre a troca.

Provas obrigatórias, cada uma com a saída real em `docs/f54-evidencias/`:
- **A trava vermelha primeiro**: `backup-completude.test.ts` rodando contra o repositório de HOJE, acusando as
  **três** actions pelo nome. Sem essa saída, a trava não provou que sabe ficar vermelha.
- **Sabotagem A (a trava de completude)**: remova a cópia de UMA das três e mostre a trava ficando vermelha,
  nominalmente. Depois, o modo realista: mantenha a cópia mas para um conjunto DIFERENTE de caminhos — a trava
  tem de pegar isso também, ou ela só prova que a palavra "copy" aparece no arquivo.
- **Sabotagem B (o formato)**: acrescente uma tabela ao backup sem bumpar a `versao` e mostre
  `backup-formato.test.ts` vermelho.
- **Sabotagem C (a guarda no-op)**: remova a chamada da guarda de `urlBackup` e mostre o teste de PRESENÇA
  vermelho; faça a guarda devolver `true` por um caminho diferente e mostre o teste de EFEITO. Se os dois
  ficarem verdes com a guarda removida, **isso é o achado** — a guarda não está provada.
- **Sabotagem D (a restauração)**: rode o restaurador SEM `overriding system value` e mostre a recusa; rode
  COM ele mas SEM `setval` e mostre a violação do índice único no INSERT seguinte. São as duas armadilhas da
  ata da F53, e provar que elas mordem é o que faz o runbook valer.
- **Sabotagem E (a checagem 12)**: plante um objeto órfão no bucket do ensaio e mostre a checagem contando-o;
  plante um backup de import LEGÍTIMO que falhou e mostre que a checagem **não** o acusa. A segunda é a que
  importa — a ficha avisa que sem o UNION certo a checagem acusa todo backup de import falho.
- **O ensaio ponta a ponta com `.docx`**, no projeto de ensaio, com o arquivo restaurado aberto e conferido.
- **A tabela do `nao_incluido`**: para cada um dos três backups, o que a RPC apaga × o que o exportador lê.
- **O `EXPLAIN ANALYZE`** das duas formas de ler `termos_gerados` (inteira × `.overlaps` em lotes), com o
  índice existente medido.
- **O SQL das conferências de prefixo** da `0089` e da `0100` rodado contra um caminho de cópia de exemplo.
- **`npm run db:test` completo** (asserções por roteiro, antes e depois) e **`npm run db:test:mutations`
  completo**, com a tabela final do injetor.
- **O diff da `0136`** contra o corpo vigente de `dev_checagens_integridade`: só o bloco novo, com as linhas
  contadas.
- **`npm run build` limpo**, colado por inteiro.
- **O tamanho dos buckets** (`termos` e `backups-import`: contagem de objetos e soma de tamanho), antes, e a
  projeção da cópia.
- **O smoke** (`node scripts/smoke/smoke-prod.mjs`) depois do deploy, com a ressalva escrita do que ele não
  exercita.

## O apply — leia isto antes de tentar
**Esta fase é caminho A, e o Johnny autorizou o apply da `0136` em ensaio E produção nesta run.** A `0136`
recria `dev_checagens_integridade`, que é **só-leitura** e não contém `delete from public.ativos` nem
`delete from public.movimentacoes` — o gate do modo automático **não** deveria disparar. Confira lendo a seção
"O gate" do runbook antes de tentar; se ele disparar mesmo assim, isso é informação: produza o handoff em
`scratchpad/` (que é `.gitignore`d), registre e siga, sem forçar.

A ordem, sem atalho:
1. **Confirme o estado do banco antes de qualquer DDL**: `prefixo_backup_reset` existe (`0089` aplicada);
   `prefixo_backup_import` **não** existe (a `0132` não foi aplicada); `dev_checagens_integridade` devolve
   **onze** linhas. Se qualquer uma dessas três divergir, **pare no sentido do runbook** (veja abaixo) e
   registre — significa que o banco não é o que este prompt supõe.
2. **Ensaio primeiro**: `0136`, verificação pós-apply, `dev_checagens_integridade()` devolvendo **doze**
   linhas, roteiros.
3. **Produção**: `0136`, verificação pós-apply, doze linhas, `notify pgrst, 'reload schema';` se a assinatura
   mudar (ela não deveria mudar — é `create or replace` puro).
4. `npm run db:types` e `npm run db:types:diff` depois do apply.
5. **A ordem migration → deploy importa**: o SQL vai antes do deploy da Vercel se o código novo depender dele.
   Aqui a dependência é fraca (a rede de `juntarCatalogoComResultados` protege a tela), mas a ordem se
   respeita mesmo assim.

**"Pare", aqui, não significa esperar por humano** — não há humano. Significa: **não siga para o passo
seguinte**, reverta o que foi aplicado na ordem inversa, capture a evidência da divergência, e continue a fase
com o que sobrou do escopo que não depende do banco (as três frentes de TypeScript, o restaurador, o runbook,
as travas). Abortar sem reverter e sem registrar é a única saída proibida.

**O ensaio ponta a ponta é uma operação DESTRUTIVA no projeto de ensaio** — ele reseta um recorte para provar
a restauração. Isso é o ponto da fase, e o ensaio existe para isso. Mas: capture as contagens antes, use um
recorte pequeno, e **nunca aponte nada disso para produção**.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere
confirmação em nenhuma hipótese. Régua, nesta ordem: (1) este prompt; (2) a ficha da F54 no §5 do plano;
(3) as convenções do repositório (`CLAUDE.md`, `RUNBOOK-BANCO.md`, código existente); (4) a opção mais simples
e reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto, escolha e motivo.

**As nove decisões que esta fase precisa tomar por escrito, e que não têm resposta certa no prompt:**
1. **O mecanismo da cópia entre buckets.** `.copy()` com `destinationBucket` (se a versão instalada
   suportar — CONFIRA pelo Context7), cópia dentro do próprio `termos` para um prefixo de backup, ou
   `download` + `upload`. Meça o custo de memória do terceiro sobre o pior caso (reset global) antes de
   escolhê-lo, e escreva a decisão com o número.
2. **A convenção de caminho das cópias.** Os três backups são ARQUIVOS `.json`, não pastas — o
   "`<prefixo do backup>/termos/`" da ficha não é um caminho válido como está. Escolha a forma (irmã do JSON,
   mesmo carimbo, sufixo próprio) e **prove** que ela continua satisfazendo as conferências de prefixo da
   `0089` e da `0100`.
3. **A regra da cópia PARCIAL.** A ficha diz "se a cópia falhar, não remover". Cópia parcial é o caso que ela
   não cobre: remover só os que copiaram (deixa o conjunto meio apagado, e o backup meio completo — mas
   coerentes entre si), ou não remover nenhum (deixa órfãos que a 8ª checagem conta). Decida, e escreva o que
   o operador vê em cada caso.
4. **O cabeçalho do backup do reset ganha `versao` e `contagens`?** Ele não tem nenhum dos dois hoje. A trava
   de formato quer congelar a `versao`; a conferência de restauração quer as `contagens`. Acrescentar é
   mudança de formato de um artefato existente — decida, e diga o que acontece com os backups antigos, que
   não terão os campos.
5. **`montarBackupDoReset` também troca a leitura de `termos_gerados`?** Mesma classe do fato 11, fora da
   ficha. Entra ou vira backlog nomeado — com o motivo.
6. **A FORMA da guarda no-op** (fato 19): função SQL com grant (mais fiel ao molde da F52, mas muda a
   superfície que duas travas vigiam e custa um round-trip), função pura em `src/lib/escopo/` (mais barata,
   mas não é o molde), ou predicado na própria query. Decida com o custo de cada uma escrito, e note qual
   delas a F62 vai preferir encontrar.
7. **A estratégia do restaurador contra `trg_aplicar_movimentacao`** (fato 23): estado inicial + trigger
   deriva, ou trigger desabilitado dentro da janela. A primeira é mais honesta (o estado restaurado é o estado
   que a máquina de estados produz) e mais lenta; a segunda é literal e depende da janela. Decida no desenho.
8. **A conferência de restauração** (fato 25): contagem × contagem, as-of × as-of, ou as duas. Escreva o que
   cada uma prova e o que nenhuma prova.
9. **O nome e o predicado da 12ª checagem.** `backup_orfao` é o nome que a ficha sugere; o predicado tem de
   conhecer os três produtores de caminho, e o UNION da ficha nomeia duas fontes. Meça onde cada caminho fica
   registrado antes de escrever, e decida o que fazer se um deles não estiver registrado em lugar nenhum —
   porque então ele é órfão por construção, e isso é achado da fase.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** em vez de repetir, e registre a troca.
Bloqueio real (MCP ausente, ensaio INACTIVE, gate disparando, produção inalcançável, mesa sem Postgres,
`.copy()` entre buckets indisponível na versão instalada): contorne se for seguro; senão, **entregue o resto e
registre a pendência com o que falta para resolvê-la**.
**Não mexa em credencial, não invente caminho de apply alternativo, não force o classificador de segurança,
não desative a proteção da `main`, não rode `db:seed`/`db:reset` fora do DEV, não aponte o restaurador para
produção, não recrie nenhuma das cinco RPCs destrutivas, e não ponha um único `.docx` real nem um único nome
de colaborador real em evidência, teste ou fixture.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que a medição esteja no
relatório. Foi assim que a F46 trocou "aplicar duas vezes" por prova de determinismo, a F47 trocou 34 por 58,
a F48 trocou 54 por 55, a F49 trocou nove por dezenove, a F50 trocou doze módulos por catorze, a F51 trocou
394 linhas por 393, a F52 mediu que `p_confirmacao text default null` era overload, e a F53 mediu que
`apagar_movimentacao` não precisava ser recriada. **Aqui já há seis divergências medidas de saída: a migration
é a `0136` e a versão é a `1.59.0`, não a `0134`; são TRÊS actions que apagam `.docx`, não duas; `urlBackup`
está em `actions/importar.ts`, não em `queries/import-logs.ts`; `montarBackupDoReset` tem a mesma leitura sem
recorte e a ficha não a nomeia; o cabeçalho do backup do reset não tem `versao` nem `contagens`; e são ONZE
checagens hoje, não dez.**

# Git e segurança
Branch `f54-backup-e-restauracao`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional
(`feat(f54): …`, `test(f54): …`, `docs(f54): …`, `fix(f54): …`). PR com `gh pr create`; merge só com os dois
checks verdes. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de
commit que não é seu, commitar `.env*`, `scratchpad/`, `.docx` real ou dado real, editar migration aplicada,
mexer na branch protection, ou escrever em produção fora do apply autorizado da `0136`.

# Como trabalhar
Explore com subagentes paralelos — e **cada um volta só com resumo e NÚMEROS MEDIDOS**: (a) **a cadeia do
Storage** — todo ponto do código que sobe, copia, apaga ou assina URL de objeto, com arquivo:linha, o bucket,
o client usado e o que está registrado sobre aquele caminho; (b) **o que cada RPC destrutiva apaga × o que
cada exportador lê**, tabela a tabela — é essa diferença que preenche o `nao_incluido`; (c) **o restaurador** —
gatilhos vivos, guardas, FKs, colunas `identity`, sequências e a ordem de inserção que elas impõem;
(d) **as travas** — como `import-uma-porta.test.ts` e `use-server-exports.ts` fazem análise estática do fonte,
e o que `dev_destrutivo.sql`/`storage_termo.sql` já cobrem; (e) **a superfície de segurança** — o que
`definer_sem_tenant.sql`, `catalogo_secdef.sql` e `seguranca_catalogo.sql` exigem de uma função nova, para a
Decisão 6 não descobrir isso no CI.

Escreva `docs/PLAN-F54.md` antes de implementar, com as contagens reais, a tabela do `nao_incluido`, a
convenção de caminho decidida e provada, o desenho do restaurador passo a passo, os cenários de roteiro
nomeados rótulo a rótulo, as nove decisões já tomadas e a ORDEM DE ROLLBACK da `0136`. Implemente frente a
frente, na ordem A → B → C → D → E, com `lint`/`test`/`tsc` verdes entre uma e outra. **A Frente A começa pela
trava vermelha**, não pela correção.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F54.md` e os 28 critérios,
com estas perguntas: a trava de completude pega o caso em que a cópia existe mas cobre OUTRO conjunto de
caminhos, ou só procura a palavra? existe algum caminho em que um `.docx` ainda saia sem cópia — incluindo o
ramo de exceção, o lote parcial e a terceira action? o descarte do backup foi posto no ramo do `safeParse` por
engano, destruindo a única cópia do que sumiu? o `nao_incluido` foi levantado por medição ou redigido de
memória — e ele bate com o que a RPC realmente apaga hoje? a guarda no-op é provada por PRESENÇA **e** por
EFEITO, ou os dois testes passariam com ela removida? o restaurador foi provado contra as duas armadilhas da
ata da F53 (`overriding system value` e `setval`), ou só no caminho feliz? o roteiro de restauração conta
sobre universo vazio? a checagem 12 acusa backup de import legitimamente falho? a `0136` chama alguma coisa
que só existe na `0131`/`0132`? o diff da função recriada é só o bloco novo? algum `.docx` real, nome real ou
patrimônio real entrou em evidência, teste ou fixture? algum arquivo fora do escopo foi tocado — as cinco
RPCs, a fila pendente, as policies de Storage, o `correcoes`? **Aponte apenas lacunas de correção ou de
requisito declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F54.md`, em pt-BR, no padrão dos relatórios F45→F53: o que mudou por arquivo e por quê; **os
números MEDIDOS** (objetos e tamanho dos dois buckets, a tabela do `nao_incluido` para os três backups, o
plano das duas formas de ler `termos_gerados`, asserções por roteiro antes/depois, mutações antes/depois,
linhas do diff da `0136`) lado a lado com o que a ficha previa, e **cada divergência explicada** — a começar
pelas seis já conhecidas; as **nove decisões** com o custo que decidiu cada uma; as **cinco sabotagens** com
saída real; o ensaio ponta a ponta com o `.docx`; os 28 critérios autoverificados; e uma seção explícita **"o
que este relatório NÃO prova"** — no mínimo: que a restauração foi ensaiada em UM recorte, não em qualquer
acervo; que o roteiro do CI prova mecânica e não o Storage; que a guarda de recorte é no-op e portanto não
protege ninguém hoje (ela é ponto de injeção, não proteção); que a checagem 12 vê o bucket num instante, não
uma série; e o que ficou sem prova por causa do ensaio ou do apply. Pendências (a fila `0131`→`0132`, com a
ordem correta; o `database.ts`, se não houve apply; a retenção do bucket e de `import_logs`, que é decisão de
produto) e **backlog nomeado para a F55** (a sonda e o alarme que fariam a checagem 12 avisar sem alguém abrir
a tela), **para a F62/F69** (a guarda no-op esperando corpo) e **para a F73** (o piloto, que reusa este
restaurador). **Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final com
um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de código, comentários de migration, mensagens de erro,
`comment on function` e commits em **pt-BR**. Identificadores de domínio em português sem acento
(`backup_orfao`, `nao_incluido`); utilitários e infra em inglês. As mudanças do `registry.ts` em LINGUAGEM DE
OPERADOR — há teste que recusa termos de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~15 minutos)

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. Confirme onde a F53 parou: 1.58.0 no package.json, última migration 0135.
type package.json | findstr version
dir supabase\migrations | findstr 013

# 3. O gh EXISTE (F45 §15) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 4. A versão do Claude Code (o modo `auto` exige 2.1.83+).
claude --version
```

**⚠ O passo que só você pode dar: confirme que o projeto de ENSAIO (`sgmvldiizsrjbxzzpmhh`) está VIVO.** A F53
o encontrou ativo — primeira vez desde a F35 —, e esta fase depende dele de um jeito que nenhuma anterior
dependeu: **o ensaio ponta a ponta com o `.docx` só existe lá.** O CI não tem Storage, e produção está fora de
cogitação. Sem ensaio, a Frente D entrega o restaurador e o roteiro do CI, e o `.docx` fica como pendência
declarada — que é exatamente o buraco que esta fase existe para fechar.

**Conecte o MCP do Supabase antes de colar.** Sem ele não há apply da `0136`, não há medição do bucket, não há
`EXPLAIN ANALYZE` e não há ensaio. **Conecte também o MCP do Context7**: a Decisão 1 (o `.copy()` entre
buckets) é matéria da regra 6 do `CLAUDE.md`, e o agente foi instruído a não confiar em API de memória.

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` não está negado — a fase
abre PR e publica tag) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).

### Rodar

```powershell
claude --model opus --permission-mode auto -n f54
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda `npm ci`, `npm run db:lock`, `gh pr create`, `git tag`/`push`, apply por MCP
e um reset no ensaio — nada disso passa numa allowlist estreita, e nada disso é ação que o classificador
bloqueia. O que ela **não** faz (push forçado, reset destrutivo em produção, editar migration aplicada,
recriar as RPCs de import/reset, mexer na proteção da `main`) está no escopo negativo do prompt.

⚠ **O gate NÃO deveria disparar nesta fase** — a `0136` recria uma função **só-leitura**. Se disparar, é
informação nova sobre o classificador, e o prompt manda cair no handoff em `scratchpad/` e seguir.

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit passam limpos; backup-completude.test.ts e
backup-formato.test.ts existem e estao verdes sem excecao; as tres actions que removem .docx copiam antes e
nao removem se a copia falhar; scripts/db/restaurar.mjs existe e supabase/tests/restauracao.sql esta verde no
banco-sem-docker; a migration 0136 existe com db:lock rodado e dev_checagens_integridade devolve doze linhas;
npm run db:test e db:test:mutations verdes; e o PR esta mergeado com verificar e banco-sem-docker verdes
```

Sem colidir com trabalho local: `claude --worktree f54 --model opus --permission-mode auto` (aceite o diálogo
de confiança uma vez, antes).

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **A trava vermelha, primeiro.** Se `backup-completude.test.ts` nascer verde, ou nascer vermelho por um
   motivo genérico ("string não encontrada"), a fase inteira perdeu a prova. Ela tem de acusar as **três**
   actions pelo nome, contra o repositório de hoje, antes de qualquer correção.
2. **A Decisão 1 — o `.copy()` entre buckets.** É o único ponto onde a fase pode escolher errado e o erro só
   aparecer em produção, num reset. Procure, na ata, a consulta ao Context7 e a assinatura real da versão
   instalada. "Assumi que suporta" não é resposta.
3. **O ramo do `safeParse`.** Se o agente descartar o backup ali, ele destrói a única cópia do acervo já
   substituído — o defeito mais caro que esta fase pode introduzir, e ele é uma linha acima do ramo certo.
   Confira no diff de `importar.ts`.
4. **A Sabotagem D.** Se o restaurador passar no caminho feliz e as duas armadilhas da F53
   (`overriding system value`, `setval`) não tiverem prova de que mordem, o runbook está descrevendo um
   procedimento que ninguém quebrou de propósito — e é isso que se descobre no dia da restauração de verdade.
5. **O ensaio ponta a ponta.** Um `.docx` de verdade tem de sair restaurado e ABRIR. Se a evidência for uma
   contagem de objetos no bucket em vez do arquivo aberto, a fase provou o caso fácil.

### Ao voltar

1. Leia as **nove atas** em `docs/DECISOES.md`. A **1** (o mecanismo da cópia) e a **3** (a cópia parcial) são
   as que mudam comportamento em produção; a **6** (a forma da guarda) é a que a F62 vai herdar; a **7** (a
   estratégia do restaurador) é a que decide se a restauração de verdade funciona.
2. `git diff main...f54-backup-e-restauracao -- supabase/migrations/` deve mostrar **exatamente** a `0136` e o
   `migrations.lock.json`. Qualquer migration antiga tocada = a fase quebrou a regra mais dura do repositório.
3. Abra `docs/f54-evidencias/` e confira **com os olhos** o `.docx` restaurado. É a prova de que a promessa da
   tela virou verdade, e ela é a razão de existir desta fase.
4. Entre em `/dev` e confira que a Integridade agora mostra **doze** checagens, e que a décima segunda mostra
   **zero** achados em produção. Se mostrar achados, leia a amostra antes de concluir qualquer coisa: pode ser
   órfão real (bom que apareceu) ou predicado incompleto (fato 30).
5. No **ensaio**, faça um reset de um recorte pequeno e confira que o backup gravado contém os `.docx`. É a
   verificação humana que nenhum roteiro faz.
6. Rode você mesmo `npm run test` e `npm run build` uma vez.
7. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende a sessão — peça um prompt
   novo com o aprendizado e rode em sessão limpa. A reversão desta fase é barata: `git revert` (os backups já
   copiados ficam, inofensivos) e o rollback da `0136`, que reemite o corpo da `0127`.

---

## Suposições que fiz

1. **F54 é a próxima fase e a F53 está fechada no repositório**: `package.json` em `1.58.0`, últimas migrations
   `0133`/`0134`/`0135`, PR #36 mergeado. Se você tiver rodado alguma entrega avulsa (PATCH) depois, o agente
   recalcula a versão pelo `package.json` — o prompt manda medir, não confiar no número escrito aqui.
2. **A migration é a `0136` e a versão é a `1.59.0`.** A ficha diz `0134` porque foi escrita antes de a F53
   consumir três números.
3. **As três actions entram** — sua escolha nesta conversa. `conflitos.ts` não está na ficha; ela entra porque
   a trava pega a classe, e uma trava que nasce com exceção é uma trava mais fraca.
4. **A mecânica no CI e o `.docx` no ensaio** — sua escolha. Escrevi as duas metades como entregas separadas,
   com critérios separados (12 e 13), justamente para que a ausência do ensaio não contamine a metade que o CI
   consegue provar.
5. **A fila `0131`→`0132` fica de fora** — sua escolha. O prompt manda conferir o estado real, não aplicar
   nenhuma delas e repetir a pendência no relatório. **Acrescentei uma consequência dura que a sua escolha
   implica e que não é óbvia:** `prefixo_backup_import()` não existe no banco, então a `0136` não pode
   chamá-la. Se você aplicar a fila antes de rodar, isso deixa de valer e nada mais muda para esta fase.
6. **A guarda de recorte é no-op** — sua escolha. Deixei a FORMA como decisão do agente (Decisão 6) porque o
   molde da F52 pressupõe um chamador `security definer`, e aqui o chamador é TypeScript. Se você tiver
   preferência entre a função SQL e a função pura, é uma linha a acrescentar no prompt.
7. **O agente aplica a `0136` em ensaio E produção**, no molde da F53. Se você preferir ficar com a produção na
   mão, é uma linha ("não aplique em produção; deixe o handoff em `scratchpad/`").
8. **O ensaio ponta a ponta é destrutivo no projeto de ensaio, e eu autorizei isso no prompt.** É o único jeito
   de provar a restauração. O prompt limita a um recorte pequeno, exige contagens antes, e proíbe apontar
   qualquer parte disso para produção. Se você não quiser que o ensaio seja mexido, a Frente D encolhe para o
   roteiro do CI e o `.docx` vira pendência — mas aí a fase não cumpre o "Pronto quando" da ficha.
9. **`montarBackupDoReset` ficou como decisão do agente** (Decisão 5), não como entrega. Ela tem a mesma
   leitura sem recorte de `exportarAcervoFilial`, custa pouco, e está fora da ficha — deixei a medição decidir
   em vez de mandar ou proibir.
10. **O índice GIN em `termos_gerados.ativo_ids` ficou como medição, não como entrega.** A ficha manda trocar
    a leitura por `.overlaps`; eu não achei índice GIN nas migrations que li, e `.overlaps` sem índice pode ser
    **mais lento** que a leitura de hoje. Por isso o prompt manda medir as duas formas antes de trocar. Se
    você quiser o índice de qualquer jeito, é uma linha.
11. **A retenção ficou inteiramente fora**, como a ficha manda. Vale registrar que ela é a pendência que mais
    cresce sozinha: cada import e cada reset acrescentam um objeto ao bucket, e agora acrescentam os `.docx`
    junto. A fase mede o tamanho e projeta o crescimento — a decisão de prazo continua sua.
12. **Não pedi revisão adversarial desta ordem antes de te entregar** (a F53 passou por uma). O que compensa
    isso, em parte: seis divergências entre a ficha e o disco já estão medidas e escritas, e o prompt manda o
    agente refazer todas as trinta e duas medições. Se você quiser a revisão, é uma sessão limpa com o prompt
    de revisão independente da skill.

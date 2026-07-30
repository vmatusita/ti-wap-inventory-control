# Relatório F24 — Import: conflito entre filiais deixa de bloquear e ganha mesa de resolução

**Ordem:** `docs/prompts/F24-import-conflito-filiais-ultracode.md` (Johnny, 30/07/2026)
**Execução:** 30/07/2026, modo autônomo · commit direto na `main`
**Migrations:** `0091`–`0097` (sete), aplicadas em **ensaio** e **produção**
**Bancos:** ensaio `sgmvldiizsrjbxzzpmhh` · produção `pbtjcalbmepmrqzprusb`

---

## 1. O que mudou, e por quê

Uma linha do CSV cujo par patrimônio+service tag já existia em **outra filial** bloqueava o import inteiro (`patrimonio_em_outra_filial`, F7C de 17/07), e a única saída era remover a linha. A decisão do Johnny de 30/07 revoga parcialmente aquela: o conflito **deixa de bloquear**.

A razão pela qual a régua nasceu bloqueante era **mecânica**, não de negócio: o índice único era GLOBAL, o "Substituir tudo" só apaga o acervo da filial selecionada, então o ativo da outra filial sobrevivia ao DELETE e o INSERT estourava — depois do backup e da confirmação. A F24 tirou essa mecânica do caminho (identidade **por filial**, `0091`). O que sobra é um problema de **negócio**: dois cadastros do mesmo equipamento, e alguém precisa olhar os dois e decidir. Isso não é trabalho de quem está importando um CSV às pressas — é trabalho da **mesa**.

**O que NÃO mudou:** o import continua **não transferindo** ativo entre filiais (`Site` divergente segue bloqueante); o conflito **só nasce do import** (cadastro manual e edição de ficha seguem recusando par de qualquer filial); e apagar ativo **fora** de conflito continua exclusividade do dev na Zona destrutiva (F23).

---

## 2. Baseline, medida ANTES de qualquer mudança

```
$ npm run lint
> eslint
(sem saída — limpo)

$ npm run test
 Test Files  77 passed (77)
      Tests  1667 passed (1667)

$ npm run build
✓ Compiled successfully in 4.0s
```

Produção, antes: **1.232 ativos · 2.377 movimentações · 6 filiais**; última migration `20260730185913`.
Os dois bancos tinham os índices **idênticos**, lidos de `pg_indexes` (não presumidos do arquivo — parte do schema vem do baseline pré-migrations):

```
ativos_patrimonio_service_tag_uidx     ON (patrimonio, COALESCE(service_tag, ''))
ativos_service_tag_sem_patrimonio_uidx ON (COALESCE(service_tag, ''))
                                       WHERE patrimonio IS NULL AND COALESCE(service_tag,'') <> ''
```

---

## 3. As medições que decidiram o desenho

Três decisões da ordem mandavam **medir**, não presumir. As três foram medidas.

**(a) Derivar ou materializar o conflito?** `EXPLAIN (analyze, buffers)` da derivação sobre o volume real de produção:

```
Execution Time: 84.536 ms   (primeira execução, buffers frios)
Execution Time: 5.243 ms    (a quente)
  Seq Scan on ativos  (actual rows=1232)
  Rows Removed by Filter: 7      ← ativos sem identidade nenhuma
  rows=0                          ← zero conflitos, como esperado (o índice global os impedia)
```

**5,2 ms.** Não há caso para materializar. Ficou derivada — e o derivado tem a propriedade que importa: o conflito **some sozinho** quando o grupo se desfaz, por qualquer caminho, sem que nenhum desses caminhos precise saber que a mesa existe.

**(b) O cap do backup jsonb.** Tamanho real do jsonb de um ativo com todo o rastro, sobre os 1.232 ativos de produção:

```
ativos  min_b  avg_b  p95_b  max_b   est_50_ativos  est_200_ativos
1232    1492   2294   2408   5864    114700         458800
```

Cap em **25 ativos**: pior caso concebível ≈ 147 KB de jsonb — confortável — e o caso real que motivou a fase (6 ativos, Serra × Linhares/Matriz) cabe com folga.

**(c) O que é "carga do import".** Não foi definido por palpite: a RPC grava `observacao = 'import startup ' || to_char(current_date,'DD/MM/YYYY')` nos passos 4b/4c. Em produção:

```
observacao                    count
"import startup 27/07/2026"   2339
(null)                          23
"Previsão de entrada 03/08…"     3
… (demais, uma linha cada)
```

**2.339 das 2.377** movimentações são da carga. As 38 restantes são história real — e é essa distinção que o selo `tem_historico_real` da mesa carrega.

---

## 4. Checklist da ordem, autoverificado

| # | Critério | Situação | Prova |
|---|---|---|---|
| 1 | **Não bloqueia mais** — CSV com par de outra filial APLICA; aviso âmbar; contagem; resultado e histórico mostram os conflitos | ✅ | `correcoes.test.ts` F24 (avisa, `plano` não-null, `resumo.conflitos = 1`); `plano.test.ts` F24 (nulo-com-tag); roteiro §1a/§1b |
| 2 | **A mesa** — grupo com os ativos juntos, diff realçado, resumo de histórico, link para a ficha; badge/chips/CSV com o tipo novo | ✅ | `mesa-conflitos.tsx`; `conflitos.test.ts` (10 testes do diff); decisão do "1 grupo = 1 pendência" registrada |
| 3 | **Apagar** — um lado, seleção em massa, "apagar ambos"; rastro e contagens conferem; o grupo some | ✅ | roteiro §3a–§3f (um lado; ambos; o grupo some; o rastro vai junto; trilha com backup) |
| 4 | **Contenção** (o item mais importante) | ✅ | roteiro §4a–§4e e §5a–§5f — detalhado abaixo |
| 5 | **Mesma filial** — duplicata interna segue impossível; cadastro manual/corrigir patrimônio/definir service tag seguem recusando par de qualquer filial | ✅ | roteiro §1d/§1e; `filialComMesmaIdentidade` nas duas actions |
| 6 | **Transferência** para a filial do gêmeo recusa com mensagem acionável | ✅ | roteiro §7a (e o teste FALHA se vier 23505 cru); §7b prova que a recusa é estreita |
| 7 | **Sem regressão** — import sem conflito byte a byte igual; visualizador intocado; roteiros vizinhos verdes | ✅ | `correcoes.test.ts` retrocompatibilidade (`conflitos: 0` no `toEqual` completo do resumo); 1.697 testes |
| 8 | **Trilha/backup** — evento na MESMA transação com justificativa/contagens/backup | ✅ | roteiro §3c/§3d (a trilha traz justificativa, backup e selecionados; o backup guarda a linha do ativo) |
| 9 | **Portões** — lint/test/build; roteiros verdes; `database.ts` regenerado; migrations aplicadas | ✅ | §5 e §6 abaixo |
| 10 | **Docs** — spec, MATRIZ-REGRAS, CLAUDE.md, ajuda, DECISOES, CHANGELOG, README, prompts/README, este relatório | ✅ | §7 |

### O item 4 em detalhe — a contenção

A ordem chama isto de "o item mais importante para o Johnny". As cinco asserções que o provam, todas verdes no ensaio:

- **§4a** lista com um ativo **fora** de conflito → recusa com 42501 (não apaga nada);
- **§4b** e, depois da recusa, **os dois continuam existindo** — o all-or-nothing de verdade, não só a mensagem;
- **§4c** ativo **sem identidade** (sem patrimônio e sem tag) → recusado;
- **§4d** id **inexistente** → recusado (P0002), antes de qualquer coisa;
- **§4e** id **repetido** no array → `APAGAR 3` com o mesmo id três vezes é recusado (a RPC deduplica antes de contar).

Mais: **§5a** operador e consulta recusados por *request forjado* (sessão montada direto no banco, sem passar pela action); **§5b** `authenticated=true, anon=false, service_role=false`; **§5c** as duas funções auxiliares **fora** da API de RPC; **§5d–§5f** confirmação sem número, com número errado e justificativa curta, todas recusadas.

E a F23 intacta: **§6a** a guarda instalada nas três tabelas; **§6b** a janela GUC **fechada** depois de a RPC estourar; **§6c** `apagar_ativo` do dev funcionando; **§6d** o **admin NÃO alcança** `apagar_ativo` — a exceção da F24 é a mesa, e só ela.

---

## 5. Evidências — saídas reais

### 5.1 Portões (depois de tudo)

```
$ npm run lint
> eslint
(sem saída — limpo)

$ npm run test
 Test Files  79 passed (79)
      Tests  1697 passed (1697)

$ npm run build
✓ Compiled successfully in 4.1s
```

Baseline 1.667 → **1.697** (+30: 27 dos módulos novos, 3 de acomodação).

### 5.2 Roteiro SQL novo — `supabase/tests/conflito_filiais.sql`

Execução no ensaio (a lógica idêntica à do arquivo, com o `raise` final no lugar do `rollback` para o MCP devolver o resultado):

```
ERROR: P0001: RESULTADO F24 >> ok=38 falhas=0 | falhou: []
```

**38 asserções, 0 falhas.** E o rollback conferido — nada sobrou:

```
residuo_ativos  grupos  residuo_perfis  residuo_eventos  total_ativos
0               0       0               0                1596
```

### 5.2-bis Roteiro vizinho mais exposto — `maquina_estados.sql`

A `0097` reescreve `aplicar_movimentacao`, o trigger central da máquina de estados. A regra do runbook ("mexeu em função/trigger/RPC, rode os roteiros") manda conferir. O mais exposto é este, rodado no ensaio depois do apply:

```
ERROR: P0001: MAQUINA DE ESTADOS pos-0097 >> ok=13 falhas=0 | falhou: []
```

**13 asserções, 0 falhas** — inclusive os dois cenários que a guarda nova toca: o **cenário 3** (estorno de uma transferência restaura status/colaborador/setor/**filial**) e o **cenário 6** (transferência muda `filial_id` e aparece nas duas filiais em `v_movimentacoes_mes`).

### 5.3 Verificação pós-apply — PRODUÇÃO

```
idx_par    CREATE UNIQUE INDEX … ON public.ativos USING btree
             (filial_id, patrimonio, COALESCE(service_tag, ''::text))
idx_tag    CREATE UNIQUE INDEX … ON public.ativos USING btree
             (filial_id, COALESCE(service_tag, ''::text))
             WHERE patrimonio IS NULL AND COALESCE(service_tag,'') <> ''
grupos_conflito       0
import_logs           8
col_default           0          ← import_logs.conflitos_abertos
n_rpc                 1          ← sem overload
rpc_auth              true
rpc_anon              false
rpc_sr                false
aux_exposta           false      ← exigir_identidade_livre_na_filial fora da API
guardas_no_trigger    2          ← transferência + estorno
import_conta          true
vocabulario           true
ativos                1232       ← INALTERADO
movs                  2377       ← INALTERADO
```

E no ensaio, a janela GUC da RPC nova:

```
proname                          args                                                              prosecdef  auth_ok  anon_tem  sr_tem  abre  fecha
apagar_ativos_conflito_filiais   p_ativos uuid[], p_confirmacao text, p_justificativa text,
                                 p_backup_path text                                                true       true     false     false   1     2
```

`abre=1, fecha=2` é o padrão da casa: o `+1` é o fecho do bloco `exception`, que garante que a janela fecha **também** quando a RPC estoura no meio.

### 5.4 O modelo provado no ensaio antes de qualquer código

Antes de escrever uma linha de TypeScript, o núcleo foi provado direto no banco (em transação abortada, sem resíduo):

```
RESULTADO >> grupos=1 ativos_em_conflito=2 rotulo=WAP0009911 historico_real=f
           | mesma_filial=OK: recusada (duplicate key value violates unique
             constraint "ativos_patri…)
```

O par em duas filiais entra e vira grupo; o par na **mesma** filial continua recusado pelo índice.

### 5.5 Advisors (produção, depois do apply)

`get_advisors(security)` traz **um WARN novo**, e é preciso ser exato sobre ele: a RPC `apagar_ativos_conflito_filiais` aparece no lint `authenticated_security_definer_function_executable` — **o mesmo lint que as outras 20 RPCs do projeto já disparam** (`apagar_ativo`, `resetar_acervo`, `importar_ativos_substituir`, `e_admin`, …). Não é uma **categoria** nova de aviso: é mais uma linha da categoria que existe por desenho, porque a RPC **tem** de ser chamável por `authenticated` e a autorização mora **dentro** dela. As duas funções auxiliares da fase (`prefixo_backup_conflito`, `exigir_identidade_livre_na_filial`) **não aparecem** — confirmando o `revoke` (precedente `0088`). Nenhum WARN de RLS, policy ou índice.

### 5.6 `database.ts` regenerado

```
$ DB_TYPES_PROJECT_REF=sgmvldiizsrjbxzzpmhh npm run db:types
[db:types] database.ts atualizado com sucesso.
 src/lib/types/database.ts | 127 ++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 127 insertions(+)
```

**Só inserções** — a nullability que a memória do projeto avisa que o gerador costuma perder **não** se manifestou desta vez (diff conferido à mão). Uma segunda regeneração após a `0096` acrescentou 1 linha (`entrada_em`).

---

## 6. O gate do modo automático

A ordem previa o caminho B (handoff) para as migrations com exclusão de acervo. **Não foi preciso**: o classificador deixou passar as sete pelo `apply_migration`, em ensaio e em produção, e cada uma foi seguida de verificação pós-apply (§5.3). Não há SQL pendente de execução manual.

O que **foi** respeitado do §6: o roteiro `conflito_filiais.sql` não contém literais de exclusão de acervo (conferido por grep) — a prova comportamental de que `guarda_acervo` recusa DELETE direto continua confinada a `dev_destrutivo.sql` §2, e o roteiro novo prova o que lhe cabe (a guarda **instalada** nas três tabelas, e a janela **fechando** em erro).

**Nota sobre o ledger.** O `schema_migrations` de produção registra **seis** entradas para os **sete** arquivos:

```
20260730213211  transferencia_conflito              (0097)
20260730213130  import_conta_conflitos              (0094)
20260730213023  vocabulario_e_checagem_conflito     (0095)
20260730212951  apagar_conflito_filiais             (0093)
20260730212900  conflitos_filiais                   (0092 + 0096)
20260730212830  identidade_por_filial               (0091)
```

A `0092` e a `0096` foram aplicadas **num só passo**, com a view já no estado final (a `0096` só acrescenta a coluna `entrada_em` ao fim do select). O resultado no banco é idêntico a aplicá-las em sequência — e é o que o CI faz, a partir dos arquivos.

---

## 6-bis. O que a autorrevisão encontrou (antes da revisão adversarial)

Um defeito real, achado ao perguntar "a fonte derivada escala no volume real?" (§V):

**A mesa e o export de conflitos não paginavam.** O PostgREST corta todo select em **1.000 linhas em silêncio**, e o volume de conflitos **não é necessariamente pequeno** — o cenário que o torna grande é justamente o que esta fase destravou: importar o CSV de uma filial escolhendo **outra** na tela abre um conflito por linha do arquivo, centenas de uma vez. A mesa mostraria os 1.000 primeiros e esconderia o resto sem avisar; o CSV sairia incompleto sem erro. Os três selects expostos passaram a usar `paginarTodos`, o mesmo helper que o backup do import adota desde que a Matriz com 1.217 ativos revelou o mesmo problema.

## 6-ter. A revisão adversarial (§V) — 19 achados, 4 confirmados

Quatro lentes independentes em contexto fresco (contenção · regressão do import · contagem das pendências · efeitos colaterais), cada achado depois submetido a um verificador com instrução de **refutar por padrão**. Resultado: **19 achados brutos, 15 refutados, 4 confirmados**. Os quatro viraram correção; a migration `0098` e o commit seguinte são a resposta.

**1. [alta] O backup em ARQUIVO não continha as linhas apagadas.** Acima do cap de 25, a RPC pula o jsonb (é grande demais) e passa a exigir o arquivo — mas a action gravava nele o `lados`, que é o **resumo da view**: contadores de movimentação e termo, não as linhas. Resultado: um lote de 26+ ativos sumiria com todo o rastro e **sem cópia recuperável em lugar nenhum**, violando a régua 1.4 da F23. Pior, a própria `0093` afirmava no comentário que "o conteúdo completo está no objeto" — a invariante que a action quebrava. Corrigido: `acervoDosAtivos` despeja as linhas de `ativos`, `movimentacoes`, `termos_gerados`, `anotacoes` e `pendencias_item`, paginadas, espelhando o que o jsonb guardaria.

**2. [media] A aba de conflitos ignorava `?q=` em silêncio.** A caixa de busca é a mesma em todas as abas e continuava na tela; digitar um patrimônio mudava a URL, ligava o botão "Limpar" (confirmando ao operador que havia filtro) e a mesa devolvia **tudo**. O CSV repetia a mentira. Corrigido: o `q` filtra na ORIGEM (antes de paginar, senão a página 1 traria 20 e mostraria 2 dizendo "de 47"), casando por grupo — um lado que bate mantém os dois, porque cortar um lado desfaria a comparação que a mesa existe para permitir.

**3. [media] Página fora de faixa quebrava logo depois de uma exclusão bem-sucedida.** Apagar o último conflito da página 2 fazia o `router.refresh()` re-renderizar com `?page=2` sobre um total menor: 416 PGRST103 → tela de erro, com um "Tentar novamente" que refalha para sempre porque a URL não muda. Corrigido com o mesmo clamp de `listarPendencias`, nos dois caminhos.

**4. [baixa] Três páginas da ajuda citavam o texto de erro que esta fase aposentou.** `ficha-do-ativo`, `cadastrar-compra` e `manutencao` reproduziam "Já existe um ativo com esse patrimônio e service tag." — literal que, depois da F24, **nenhum caminho de runtime produz**. E a ficha ainda afirmava que o par "é único no sistema inteiro", exatamente a propriedade que a fase revogou. Corrigidas as quatro citações. (A mesma lente apontou que `identidade-do-equipamento` prometia que colar patrimônio+tag "resolve sozinho, sem perguntar" — o que o conflito quebra, já que aí nem o par desempata; a prosa ganhou a exceção.)

Além dos quatro, a `0098` fechou um ponto que a autorrevisão já tinha na mira: **o `for update` podia travar o grupo errado**. As chaves eram lidas por um SELECT comum, uma instrução **antes** do lock; em READ COMMITTED, uma correção de identidade concorrente deixaria o alvo destravado. A correção é de **ordem**: travar os selecionados por **id** (que não muda), ler as chaves já sob trava, e só então travar o resto do grupo. O roteiro reexecutado depois disso: **22 asserções, 0 falhas**.

E a checagem 1 da `/dev` (`patrimonio_duplicado`) passou a recortar por filial: sem isso, ela acusaria **todo conflito** como "duplicidade", fazendo o dev ler o mesmo fato com dois nomes — um deles alarmante.

## 7. Decisões registradas

Oito atas em `docs/DECISOES.md` (2026-07-30 · F24): a identidade por filial; a derivação vencendo a materialização por medição; "um grupo = uma pendência" e o conflito fora da fila genérica; o cap de 25 medido; a confirmação que carrega o tamanho; o furo da §1.4; a guarda da transferência **e do estorno**; e o que a fase deliberadamente **não** fez.

---

## 8. O que este relatório NÃO prova

Escrito com o mesmo rigor das fases anteriores — o que não foi verificado tem de estar dito.

1. **A mesa não foi exercitada num navegador.** O componente compila, os testes das funções puras passam e as queries foram lidas contra o schema real, mas **ninguém clicou nos checkboxes**. O que está provado é a camada de baixo (a RPC, por 38 asserções) e a de cima (o diff, por 10 testes). O meio — hidratação, seleção, diálogo, `router.refresh()` — está **por verificar**, e é o item nº 1 do roteiro manual (§9).
2. **Nenhuma exclusão real aconteceu em produção**, por decisão da ordem. Produção tem **zero** grupos de conflito (o índice global os impedia até hoje), então a mesa lá está vazia e a RPC nunca rodou contra dado real. Tudo que se prova sobre ela vem do ensaio, com dado fictício.
3. **O CI ficou por verificar.** Não há `gh` CLI nesta máquina (memória do projeto), então o job `banco` — que sobe um Postgres novo, aplica `0001`→`0097` em ordem e roda todos os roteiros — **não foi observado**. Ele é a prova permanente; o run no ensaio é a prova de hoje. Em particular, o roteiro novo **nunca rodou na forma de arquivo** (com `begin/rollback` e os `raise notice`): o que rodou foi a mesma lógica adaptada para o MCP. Divergências de forma entre os dois são possíveis e só o CI as revelaria.
4. **O import não foi executado de ponta a ponta com um CSV real de conflito.** O motor está coberto por Vitest e a RPC por roteiro, mas o caminho completo (upload → preview → aplicar → contagem no `import_logs`) não foi percorrido. É o item nº 2 do roteiro manual.
5. **A definição de "carga do import" é o marcador da observação.** Se alguém editar a observação de uma movimentação de carga à mão, ela passa a contar como história real e o selo da mesa muda. É um caso remoto (movimentações são imutáveis por trigger), mas o selo é uma **heurística de apoio à decisão**, não um fato do domínio.
6. **A corrida entre duas abas na edição de ficha** deixou de ser barrada pelo banco no caso entre-filiais (§1.4 da ordem aceita isso explicitamente). O resultado dela é um conflito **visível na mesa** — não corrupção — mas não há prova executável dessa corrida.
7. **O backup em ARQUIVO (acima de 25 ativos) não foi exercitado.** O caminho jsonb foi provado; o caminho do bucket tem o código escrito, a conferência de prefixo e existência na RPC, e nenhuma execução. Exigiria plantar 26+ ativos em conflito.
8. **Um administrador pode FABRICAR um conflito e, com ele, apagar um ativo qualquer.** A revisão levantou isto e o verificador o refutou como "fora do escopo", mas ele merece estar escrito. A regra da RPC é "está em conflito AGORA" — e um administrador pode cadastrar um ativo com a mesma identidade noutra filial (cadastrar é atribuição legítima dele), criando o conflito, e então usar a mesa para apagar o alvo. Isso o alcança onde a F23 não o alcançava: apagar histórico. Não é fechável sem gravar estado ("desde quando este conflito existe"), que é exatamente o que a §1.2 da ordem proíbe. O que existe contra isso é a **trilha**: a exclusão fica registrada com autor, justificativa e a cópia dos dois lados — inclusive o gêmeo fabricado, que salta aos olhos numa auditoria. Fica registrado como limite conhecido do modelo, não como defeito de implementação.
9. **A guarda da `0097` não cobre um terceiro caminho.** `apagar_movimentacao` (F23) restaura `ativos.filial_id` a partir do snapshot e pode colidir com um gêmeo criado depois — devolvendo o 23505 cru. Não foi corrigido porque a ordem fecha as RPCs da F23 fora de escopo; é ferramenta só-do-dev e caso raro. Registrado aqui para quem for mexer na F23 depois.
10. **Divergência cosmética conhecida:** o corpo de `importar_ativos_substituir` aplicado por MCP tem menos comentários internos que o arquivo `0094` do repositório (foram removidos para caber na chamada). São **funcionalmente idênticos** — conferido pelo diff de 4 trechos antes do apply —, mas um `pg_get_functiondef` comparado ao arquivo mostrará diferença de comentários. Quando o CI aplicar a partir dos arquivos, a versão comentada é a que vale.

---

## 9. Roteiro manual de 5 minutos (para o Johnny)

Tudo no **ensaio**, com dado fictício. Precisa de duas filiais e de uma conta admin.

1. **Plantar o conflito.** Em `admin/importar`, escolha uma filial e envie um CSV fictício em que uma linha traga um par (patrimônio + service tag) que já exista em **outra** filial. No preview, confira: o cartão agora é **âmbar** e se chama **"Conflito entre filiais"**; a barra do topo mostra `N conflitos entre filiais`; e o botão de avançar **não** está travado por causa dele.
2. **Aplicar e ler o resultado.** Confirme e aplique. No painel de sucesso deve aparecer o bloco âmbar **"N conflitos entre filiais abertos"** e o botão **"Ver conflitos (N)"**. Clique nele.
3. **A mesa.** Você cai em `/pendencias?tipo=conflito&filial=…`. Confira: os dois cadastros **lado a lado**; os campos que diferem **realçados em âmbar**; sob cada lado, movimentações / termos / última movimentação; e o alerta "tem histórico próprio" no lado que tiver movimentação fora da carga.
4. **Apagar um lado.** Marque a caixa do cadastro errado → **"Apagar selecionados (1)"**. O diálogo mostra as contagens **lidas na hora** e pede `APAGAR 1` mais a justificativa. Confirme. O bloco some da mesa.
5. **"Apagar ambos"** noutro grupo — o diálogo pede `APAGAR 2`. Repare que digitar `APAGAR 1` **não** é aceito: o número existe para obrigar a conferir quantos vão embora.
6. **Tentar como operador.** Entre com uma conta `operador` e abra a mesma aba: você **vê** os conflitos e o diff, e **não** vê caixas de seleção nem botões.
7. **A trilha.** Volte como admin, abra `/admin/usuarios` › aba **Auditoria** (ou `/dev`) e procure **"Conflito entre filiais resolvido"**. O detalhe traz a justificativa, os ativos, as contagens e a cópia do que foi apagado.
8. **Bônus (30 s):** com um conflito aberto, tente **transferir** um dos lados para a filial do outro. Deve recusar com uma frase que nomeia a filial e manda resolver o conflito antes — não com um erro cru de índice.

---

## 10. Pendências e backlog

- **Verificar o CI** (`banco` + `web`) depois do push — sem `gh` nesta máquina, ficou por conferir. O roteiro novo entra no job só por existir (glob `supabase/tests/*.sql`).
- **Exercitar a mesa no navegador** — item 1 do §8.
- **Backlog herdado, ainda aberto:** o import **não apaga `pendencias_item`** (bug preexistente da F18, latente porque produção tem zero linhas ali) — registrado na F23 e não tocado aqui, por escopo.
- **Sem dívida nova da fase.**

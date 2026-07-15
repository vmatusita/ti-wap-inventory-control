# OS-F4 — Carga inicial única (scripts) + ensaio + go-live

> **Revisão de 15/07/2026** (pré-execução, após verificação da planilha real): inventário passou a ser **5 CSVs** (um por filial), entrou o passo obrigatório de **reconciliação de estado**, o De→Para foi ampliado com os valores reais e as metas de contagem foram atualizadas. Volumes, vocabulários e casos concretos estão no anexo **`docs/ANALISE-PLANILHA-F4.md`** — leitura obrigatória junto com esta ordem. Decisões do Johnny de 15/07 (filiais oficiais, fontes, abas obsoletas) registradas em `docs/DECISOES.md`.

Executor desta ordem no repositório `ti-wap-inventory-control`. É a fase mais delicada: é aqui que os dados REAIS entram — **uma única vez**. Decisão de 09/07/2026: **o sistema NÃO tem tela de importação**; a carga é feita por scripts na janela do go-live. **Modo autônomo com acesso total (CLAUDE.md): você executa tudo, produção inclusa, sem pedir autorização** — compensando com as autoproteções obrigatórias desta ordem (ensaio, dry-run, backup, conferência de contagens). A única dependência física do Johnny são os **7 CSVs reais** exportados (+ o export de itens na janela do go-live).

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md`, **`docs/ANALISE-PLANILHA-F4.md` (anexo desta ordem)**, `docs/ESPECIFICACAO.md` **§5 (vocabulários De→Para e regra do patrimônio — serão implementados literalmente; ampliado em 15/07)** e **§10 (carga inicial em 4 passos)**, `docs/PLANEJAMENTO.md` §3 e a entrada de **15/07/2026** do `docs/DECISOES.md`.
2. Pré-requisitos: F3/F3B na `main` ✓; **filiais oficiais RESPONDIDAS (15/07/2026): Matriz, CD-Afonso Pena, Linhares, Eusébio, Serra** — confira que o cadastro `admin/filiais` da produção terá exatamente essas 5 no go-live; os **7 CSVs reais** exportados **fora do repositório** (ex.: `~/cargas/` — nunca dentro do repo).
3. **Fatos dos arquivos reais (validados contra a planilha em 15/07/2026 — não mude sem confirmar):** delimitador `;`, encoding **Windows-1252/cp1252**, datas `dd/mm/aaaa`. São **7 arquivos**:
   - **Inventários (5, um por filial) — 3 layouts.** Mapeie colunas **por NOME normalizado** (minúsculas, sem `:`/espaços à direita — os headers reais têm `Site:`, `Observação:` etc.; "Service tag" × "Service Tag" variam de caixa), **nunca por posição**:
     - `Matriz` (18 col): Site;Marca;Tipo;Modelo;Fornecedor;Service tag;Patrimônio;Memoria;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação
     - `CD-AfonsoPena` (16 col): idem **sem** Data de Entrega, Termo de Ativos (e sem Grade/GLPI)
     - `Filial - Linhares` / `Filial-CE` / `Serra` (20 col): idem Matriz **mais** Grade (após Modelo — **ignorar**) e GLPI (após Colaborador — nº de chamado, ver 3.1.7)
     - Validação de header: o conjunto de nomes normalizados deve casar com um dos 3 layouts; fora disso = arquivo trocado → aborta. Tolerar colunas vazias à direita (a aba de Saída tem 2).
   - **Saída** (10 col): Data da Saída;Unidade;Categoria;Marca / Modelo;Patrimônio;Tipo de Movimentação;Chamado;Colaborador/Setor;Tipo;Termo Assinado
   - **Devolução** (10 col): Data da devolução;Unidade;Categoria;Marca / Modelo;Patrimônio;Colaborador;Tipo de entrada;Itens faltantes;Setor;Tipo
   - **O `Site` da LINHA decide a filial do ativo, não o arquivo** (há linhas com Site ≠ aba: Serra tem 12 `Site=Linhares`, Linhares tem `Site=Serra/Matriz`).
   - **Abas obsoletas — nenhum dado delas entra na carga** (o Johnny as está removendo da pasta de trabalho): `AllTabelas` (quebrada — `#REF!` em todas as linhas), `PivotFollowUp`, `DINAMICA`, `Totais`, `Equipamentos Atrelados`, `Perifericos Geral`, `Acessórios Matriz/Linhares`.
   - **Itens por quantidade (4ª fonte):** export **separado** da planilha de gestão online, fornecido pelo Johnny na janela do go-live (3.2b).

## 1. Objetivo

Scripts em `scripts/import/` que fazem a carga única com segurança: parse → normalização → **dry-run com relatório de inconsistências** → carga idempotente **com reconciliação de estado**. Ensaio completo no projeto de ensaio, go-live na produção, seed fictício removido, cutover registrado. **Nenhuma tela, rota ou item de menu novo no app.**

## 2. Escopo proibido

- **NÃO criar tela/rota/menu de importação.** Se encontrar qualquer resquício de rota `admin/importador`, remova e reporte.
- NÃO executar carga em produção **antes de**: ensaio completo aprovado por você no projeto de ensaio + dry-run limpo em produção + backup exportado (autoproteção obrigatória — não é pedido de autorização).
- NÃO "corrigir" dado real fora dos De→Para documentados: caso novo de sujeira → relatório de inconsistências, não palpite.
- NÃO commitar os CSVs reais nem trechos deles (nomes reais!) em código, teste, fixture ou saída de exemplo. Testes usam CSVs sintéticos criados por você com os mesmos padrões de sujeira (o anexo lista os padrões reais — reproduza a ESTRUTURA da sujeira, jamais os valores). Os relatórios `carga-*.csv/json` gerados também não vão para o git (adicione ao `.gitignore`).

## 3. Tarefas

### 3.1 Motor de normalização — `scripts/import/normalizar.ts` (funções puras + Vitest)

1. `parsePatrimonio(raw)`: canoniza para `PREFIXO+7 dígitos` (WAP4491→WAP0004491); casa variantes ignorando zeros **dentro do mesmo prefixo** (números repetem entre prefixos — LEA0000002 ≠ PRO0000002); só dígitos sem prefixo (125 casos reais) → infere **1º pelo Hostname da própria linha** (costuma ser o patrimônio canônico — resolve 96), **2º por match único contra os já vistos**, senão inconsistência; vazio/`N/A`/`-`/"SEM PATRIMONIO" → `{semPatrimonio:true}`; prefixo `STFC` → `STF` (typo, 1 caso — registrar); não-parseável (7 casos reais, ex. sufixo `LOC`, service tag na coluna errada) → inconsistência `patrimonio_invalido`.
2. `parseData(raw)`: `dd/mm/aaaa` e variações com espaços; inválida/vazia/lixo real (`#######`, `XX`, nomes, `24/06/205`, `19/209/2025`, service tags) → null + flag `data_invalida`. Data futura → aviso.
3. Mapas De→Para EXATAMENTE como a spec §5 (ampliada em 15/07): motivos de saída e devolução, **unidades** (`CD-AFP`/`CD-PENA`/`Afonso Pena` = CD-Afonso Pena; `Eusebio`/`Filial-CE` = Eusébio; `Serra Park` = Serra; "Matriz " = Matriz), "Sáida"→saida, "Deligamento"→desligamento, "Emprétimo"→fim_emprestimo, termo ("15/12/2025"/"enviado"/"Termo enviado" → enviado + data quando houver; `Sim!`→sim; `N/A`/vazio→nao; nº de chamado na coluna — caso real `2413` → nao + aviso `termo_invalido`). Novos casos reais de motivo: `Troca de titular`→troca_titular; **motivo VAZIO/`-`/`XX` (84 saídas) → `outro` + aviso `motivo_vazio`** (não bloqueia); texto livre não mapeado (ex. "Realizada a solicitação do celular", "Estava no setor", "ASSISTÊNCIA" em devolução) → inconsistência `motivo_desconhecido` com ação proposta (mapear no dry-run e registrar em DECISOES, ou `outro` preservando o texto em `movimentacoes.observacao`) — nada vira `outro` silenciosamente.
4. **Estado da planilha:** `estadoPlanilha(status, situacao)` mapeia pela tabela da spec §4 com precedência **`Situação` quando preenchida, senão `Status`** (≈200 linhas conflitam — ex. `Estoque|Descarte`, `Estoque|Manutenção`; registrar a precedência em DECISOES). Valor fora da tabela → inconsistência.
5. Classificador de linha: Devolução com Tipo de entrada = "Compra" → movimentação `compra` (20 casos); Saída com Tipo = "Transferência Uni." → `transferencia` (27); "Empréstimo" → `emprestimo` (6). Coluna Observação do inventário → `ativos.observacoes`; textos livres relevantes das planilhas de saída/devolução → `movimentacoes.observacao` (regra 9 da spec).
6. Dedup: linhas exatamente idênticas na mesma planilha → mantém 1 + inconsistência informativa `duplicata_exata` (6 casos reais na Devolução; 0 na Saída).
7. **Consolidação entre arquivos:** mesmo patrimônio canônico + mesma service tag em 2+ arquivos (139 casos reais) = **1 ativo**; filial = `Site` da linha; Sites divergentes → vence a linha **auto-consistente** (Site == filial do próprio arquivo), senão a de Data de Inclusão mais recente, sempre com inconsistência informativa `ativo_em_multiplas_abas`. `GLPI`, quando houver, vai para o `chamado` da movimentação de reconciliação do ativo (3.2.4c) — não existe campo em `ativos`.
8. Duplicidade de patrimônio (spec §5): tags todas distintas → ativos distintos (24 casos reais); tag repetida parcial ou ausente → **bloqueante `patrimonio_duplicado_sem_service_tag`** para decisão manual no dry-run (16 casos reais — lista no anexo).
9. **Vitest em `scripts/import/__tests__/` com CSVs sintéticos** (mín. 30 casos), cobrindo: os 3 layouts de inventário (+ header com `:`), inferência por hostname, mesmo ativo em 2 arquivos com Site divergente, patrimônio duplicado com/sem tags distintas, movimentação de ativo ausente do inventário → `origem='inferido'`, precedência Situação>Status, motivo vazio × desconhecido, reconciliação (3.2.4).

### 3.2 CLI de carga — `scripts/import/carga.ts`

1. Uso: `npm run carga -- --inventarios=<p1,p2,p3,p4,p5> --saidas=<path> --devolucoes=<path> --dry-run|--executar`. Script no package.json: `"carga": "tsx scripts/import/carga.ts"`.
2. **Guardas (primeiras linhas, iguais às do seed):** exige `CARGA_CONFIRM=sim`; exige que a URL do Supabase em uso corresponda à env `CARGA_PROJECT_REF`; exige `CARGA_ADMIN_EMAIL` que resolva para um profile admin (vira o `criado_por`). Sem qualquer uma → aborta com mensagem clara.
3. Pipeline: parse com PapaParse (`;`, cp1252, validação dos headers da seção 0.3 — por conjunto de nomes normalizados, 3 layouts) → normalização (3.1) → montagem do plano: ativos consolidados dos 5 inventários + ativos `inferidos` (~28 casos reais) + movimentações em **ordem cronológica global**.
4. **Reconciliação de estado (novo — obrigatório).** As planilhas de movimentação cobrem só **jan–jul/2026**, mas ~1.358 linhas do inventário estão "em uso" — replay puro deixaria quase tudo `em_estoque` e os relatórios nasceriam errados. Para cada ativo, o plano gera:
   a. **`compra` inicial** (abre a linha do tempo; data = Data de Inclusão/Entrega válida mais antiga, senão a data da carga; observação "carga go-live"; filial do `Site`). Atende a premissa da migration 0022 (todo ativo tem ≥1 movimentação efetiva — sem isso o as-of não o enxerga).
   b. **Replay** das movimentações das planilhas em ordem; inválida para o estado corrente → loga `estado_divergente`, pula e segue (como na spec §10.4).
   c. **`ajuste` final** SOMENTE se o estado calculado ≠ `estadoPlanilha` (3.1.4): leva o ativo ao estado da planilha com colaborador/setor atuais do inventário, `chamado` = GLPI quando houver, justificativa "carga go-live: estado conforme planilha (divergência documentada)". O nº de ajustes por filial sai no relatório do dry-run.
5. **Dry-run (padrão):** imprime prévia (contagens por arquivo, ativos novos/inferidos/consolidados entre abas, movimentações por tipo, ajustes de reconciliação previstos) e grava `carga-inconsistencias-<timestamp>.csv` (`;` + BOM) com colunas: severidade (`bloqueante`/`aviso`), tipo (`patrimonio_duplicado_sem_service_tag`, `patrimonio_invalido`, `motivo_desconhecido`, `motivo_vazio`, `data_invalida`, `ativo_inferido`, `ativo_em_multiplas_abas`, `duplicata_exata`, `estado_divergente`, `termo_invalido`…), arquivo, linha, valor cru, ação proposta. **Havendo bloqueante: exit code 1, e `--executar` recusa rodar.**
6. **`--executar` (só sem bloqueantes):** insere ativos primeiro, depois movimentações uma a uma em ordem (o trigger do banco recalcula estado). Ao final grava `carga-resultado-<timestamp>.json` (criados, atualizados, pulados por tipo, ajustes de reconciliação, duração) e imprime comparação com os totais esperados via flags `--esperado-ativos= --esperado-saidas= --esperado-devolucoes=` (você informa: nº de linhas de dados de cada CSV **do dia do export** — os números mudam a cada semana; referências de 15/07 no anexo).
7. **Idempotência:** reexecutar não duplica nada — ativo já existente (mesmo patrimônio + service tag) só preenche campos cadastrais vazios; movimentação com mesma chave natural (ativo, tipo, data, chamado) é pulada como `ja_importada`; a reconciliação não gera novo `ajuste` se o estado já confere.

### 3.2b Carga dos saldos iniciais de ITENS por quantidade (F3B — 4ª fonte)

**Fonte confirmada em 15/07/2026: export SEPARADO da planilha de gestão online**, fornecido pelo Johnny na janela do go-live (as abas de acessórios/periféricos do xlsx antigo estão obsoletas e não entram).

1. Uso: `npm run carga -- --itens=<path> --dry-run|--executar` (mesmas guardas da 3.2). Pode rodar junto ou separado da carga de ativos.
2. Pipeline: parse do export (headers exatos conferidos ao receber o arquivo — header errado = arquivo trocado → aborta) → normalização dos nomes de item contra o catálogo `itens` (nome não casado → inconsistência `item_desconhecido`, ação proposta = criar no catálogo ou mapear; o catálogo real substitui o do seed) → um lançamento inicial por item × filial.
3. **Carga:** para cada par item × filial com saldo, **um lançamento `entrada`** ("abertura de estoque") com a quantidade da planilha, data do go-live, observação "saldo inicial (go-live)". Reservas em aberto (se houver) viram `reserva` com o chamado. O trigger valida saldo ≥ 0.
4. **Dry-run + inconsistências:** contagens por grupo/filial, `item_desconhecido`, `saldo_invalido`. Bloqueante recusa `--executar`.
5. **Idempotência:** abertura de estoque de item × filial já carregado é pulada (`ja_importada`).
6. **Plano B (se o export não sair):** lançamentos de `ajuste` manuais na tela `/itens` — documentar no resumo.

### 3.3 Ensaio (obrigatório antes de produção)

1. `supabase link` no projeto de **ensaio** + push das migrations + 1 admin de teste + `db:seed` NÃO (ensaio roda limpo).
2. Rode você mesmo dry-run e depois `--executar` com os 7 CSVs reais (fora do repo). **Metas = os `--esperado-*` do export do dia.** Referências de 15/07/2026 (anexo): 437 saídas (das quais 27 viram `transferencia` e 6 `emprestimo`), 297 devoluções (−6 duplicatas exatas, −20 compras reclassificadas), 1.766 linhas de inventário ≈ **~1.620 ativos** após consolidar as 139 repetições entre abas (+ ~28 inferidos; 16 duplicidades problemáticas a decidir). Desvio não explicado pelo relatório → investigue e resolva antes de seguir.
3. **Conferência da reconciliação:** amostra de ≥20 ativos (misturando em uso/estoque/manutenção/defasado/descartado e as 5 filiais) com estado final, colaborador e filial iguais aos da planilha; total por estado × filial comparado com o inventário.
4. Ata do ensaio no resumo final: contagens, inconsistências por tipo e a decisão tomada para cada bloqueante (sua, registrada em `docs/DECISOES.md`; bloqueante sem regra clara nos De→Para é o raro caso em que vale perguntar).

### 3.4 Go-live (produção — execução autônoma, com as autoproteções desta ordem)

Roteiro numerado, executado por você de ponta a ponta:
1. Confira o cadastro de filiais da produção (as 5 oficiais; slugs: `matriz`, `cd-afonso-pena`, `linhares`, `eusebio`, `serra`). `db:reset` do seed fictício na produção (guardas exigem confirmação) → conferir que ativos/movimentações/lançamentos = 0.
2. Dry-run com os CSVs reais → você revisa as inconsistências (decisões em `docs/DECISOES.md`) → **backup/export do estado atual** → `--executar`.
3. Conferir contagens (ativos, movimentações **e saldos de itens**) + abrir os relatórios das filiais com dados reais — os 3 grupos do e-mail devem bater com a conferência 3.3.3.
4. Você dispara os convites reais e cria as senhas de acesso das filiais; apaga cópias temporárias dos CSVs; registra a data do cutover no `README.md`. Único item físico do Johnny: marcar as planilhas antigas como somente-leitura.
5. Deixar `scripts/import/` com aviso no topo de cada arquivo: "Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10."

## 4. Critérios de aceite

- [ ] Vitest do motor: 100% passando; `lint` + `build` limpos.
- [ ] Nenhuma rota/tela/menu de importação no app (`grep -ri importador src/` = zero resultados).
- [ ] Parser aceita os 3 layouts de inventário por nome de coluna; filial vem do `Site` da linha; os 139 ativos repetidos entre abas consolidam em 1.
- [ ] **Reconciliação:** todo ativo termina com ≥1 movimentação (`compra` inicial) e estado final = estado da planilha (amostra 3.3.3 conferida); divergências viram `ajuste` documentado, nunca correção silenciosa.
- [ ] Dry-run com bloqueante → exit 1 e `--executar` recusa; sem bloqueante → executa.
- [ ] Guardas: sem `CARGA_CONFIRM`/project-ref errado/admin inexistente → aborta antes de qualquer leitura do banco.
- [ ] Reexecutar a mesma carga não duplica nada (contagens idênticas; tudo `ja_importada`; zero `ajuste` novo).
- [ ] Ensaio bate os `--esperado-*` do export do dia, com ata (referências de 15/07 no anexo explicam a composição).
- [ ] Produção: relatórios com dados reais; zero fictício restante (patrimônios da faixa 8000–9999 = 0 linhas).
- [ ] Nenhum CSV real, nome real ou relatório de carga commitado (`git log -p` conferido; `.gitignore` cobre `carga-*.csv`/`carga-*.json`).

## 5. Entrega

Direto na `main` ou branch `f4-carga-inicial` com merge por sua conta. Resumo final: checklist autoverificado, ata do ensaio, ata do go-live (data/hora, contagens, decisões), pendências. Atualize o README (fases + data do cutover) e registre em `docs/DECISOES.md` a precedência Situação>Status, o destino do GLPI, o mapeamento dos motivos decididos no dry-run e o tratamento das 16 duplicidades.

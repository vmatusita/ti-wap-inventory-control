# OS-F2 — Operação (ativos, ficha, nova movimentação em lote, estorno)

Executor desta ordem no repositório `ti-wap-inventory-control`. Siga na ordem. **Modo autônomo (CLAUDE.md): não peça autorização** — decida, registre em `docs/DECISOES.md` e siga. Esta é a fase mais longa; se o contexto da sessão ficar pesado, feche a Parte A antes de abrir a Parte B em nova sessão (as duas estão neste arquivo).

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md` §4 (estados e transições — decore a tabela), §5, §6 (itens 3 e 4), §8 (regras 1–8) e `docs/PLANEJAMENTO.md` §5.
2. Pré-requisitos (o que faltar, providencie e registre): F1 na `main`; `db:seed` populado no dev; tipos gerados atualizados; login de operador funcionando.

## 1. Objetivo

A operadora registra TODO o dia a dia pelo sistema: consulta ativos com filtros, abre a ficha com linha do tempo, registra movimentações (inclusive em lote) com as validações certas e estorna a última movimentação de um ativo. Modelo de acesso (spec §3): qualquer operador logado opera tudo; sem sessão, nada — não existe papel de leitura com conta.

## 2. Escopo proibido

- NÃO construir relatórios/gráficos (F3), admin de usuários/filiais/motivos (F3) nem importador (F4).
- NÃO fazer a escrita no cliente: TODA escrita é Server Action com Zod; o cliente Supabase de browser não recebe service key nunca.
- NÃO duplicar a máquina de estados no front além do especificado (a fonte é o banco; o front só melhora a UX).

## PARTE A — Consulta

### 3.1 Lista de ativos — `src/app/(app)/ativos/page.tsx`

1. Data-table do shadcn (TanStack) com colunas: Patrimônio (fonte tabular, link para a ficha), Categoria (badge), Marca/Modelo, Filial, Status (badge com cor por grupo: em_uso azul-claro, em_estoque verde-claro, manutenção âmbar, descartado cinza, defasado neutro), Colaborador atual, Atualizado em.
2. Filtros na toolbar (server-side, via searchParams): busca livre (patrimônio OU colaborador OU modelo, `ilike`), Filial (select), Categoria (select), Status (multi). Paginação server-side de 50 em 50, ordenação por Atualizado em desc por padrão.
3. Estados obrigatórios: skeleton no carregamento, vazio ("Nenhum ativo encontrado com esses filtros") e erro com retry.
4. Busca por patrimônio que case com **mais de um ativo** (caso raro legítimo) mostra os dois normalmente — a desambiguação visual é a coluna Service Tag exibida quando houver duplicata no resultado.
5. Botão **"Novo equipamento"** na toolbar da lista (e atalho no dashboard) — leva ao fluxo de entrada por compra da tarefa 3.5.5.

### 3.2 Ficha do ativo — `src/app/(app)/ativos/[id]/page.tsx`

1. Cabeçalho: patrimônio canônico grande + badge de status + service tag + botão "Nova movimentação" (pré-selecionando este ativo).
2. Grid de dados: categoria, marca/modelo, specs (memória/armazenamento/processador), hostname, fornecedor, filial, colaborador/setor atuais, termo (status + data), pendência (destacada em âmbar se houver), observações, origem.
3. **Linha do tempo** (query própria em `src/lib/queries/movimentacoes.ts`): lista vertical das movimentações do ativo, mais recente no topo — data, tipo (badge), motivo, colaborador/setor, chamado, `status_anterior → status_resultante`, itens faltantes, **observação (quando houver — texto em itálico na linha)**, quem registrou. Movimentação estornada aparece riscada com link para o estorno.
4. Admin vê botão "Editar dados cadastrais" (dialog com form Zod para campos NÃO derivados: specs, hostname, observações, termo). Status/colaborador/filial **não são editáveis aqui** — mudam só por movimentação (deixe um hint explicando).

## PARTE B — Escrita

### 3.3 Validações compartilhadas — `src/lib/validators/movimentacao.ts`

1. Schema Zod discriminado por tipo, espelhando spec §8: `saida`/`emprestimo` exigem (colaborador OU setor) + motivo; `devolucao` exige motivo + array `itens_faltantes` (pode ser vazio); `transferencia` exige `filial_destino_id` ≠ filial atual; `ajuste` exige `status_resultante` + observação ≥ 10 caracteres; `estorno` exige `estorno_de`; `compra` exige filial de recebimento + dados cadastrais do ativo novo (patrimônio canônico, categoria, marca/modelo — ver 3.5.5), observação recomendada (nº da nota). Campos comuns: `ativo_id`, `data` (não-futura), `chamado` (opcional, numérico como texto), `termo_assinado`/`termo_data` opcionais, **`observacao` (opcional, texto livre ≤ 500 caracteres — spec §8 regra 9; no `ajuste` é obrigatória com ≥ 10)**.
2. Exporte também `TRANSICOES: Record<status, tipo[]>` — cópia EXATA da tabela da spec §4 — usada só para filtrar o select de tipos na UI.

### 3.4 Server Action — `src/lib/actions/movimentacoes.ts`

1. `registrarMovimentacoes(input)` recebe **um lote**: `{ itens: MovimentacaoInput[] }` (1..10). Valida com Zod; exige sessão de operador (sem sessão → erro claro); insere **um a um em ordem** via cliente server; se o trigger do banco rejeitar algum (transição inválida), interrompe, retorna quais entraram e qual falhou com a mensagem do banco traduzida para pt-BR amigável.
2. `estornarMovimentacao(movimentacaoId)`: monta o insert de estorno (`tipo='estorno'`, `estorno_de`) e devolve sucesso/erro do trigger.
3. `revalidatePath` nas rotas afetadas após sucesso.

### 3.5 Nova movimentação — `src/app/(app)/movimentacoes/nova/page.tsx`

O fluxo mais importante do sistema. Meta: **registrar 1 ativo em ≤ 30 segundos e um kit de 3 em ≤ 90 segundos.**

1. Passo 1 — ativo: combobox com busca por patrimônio (server, debounce 300ms, mín. 2 caracteres) mostrando `patrimônio · modelo · status atual · filial`. **Se o patrimônio digitado tiver duplicata, as opções exibem também a service tag e o campo fica com aviso "patrimônio duplicado — confira a service tag"**. Selecionar adiciona o ativo a uma lista de "itens do lote" (chips/cards) — dá para adicionar vários antes de prosseguir.
2. Passo 2 — movimentação: select de tipo mostrando SOMENTE os tipos válidos para o estado de cada item (use `TRANSICOES`; com itens em estados diferentes, aplique por item e sinalize). Campos aparecem conforme o tipo (motivo filtrado por `motivos.aplica_a`; colaborador/setor; chamado; termo; itens faltantes como checkboxes carregador/mochila/mouse/teclado/mousepad/fone/cabo + campo livre; **observação — textarea opcional, visível para TODOS os tipos, placeholder "Observação (opcional) — ex.: aguardando NF-e, tela trincada…"**; filial destino para transferência). Um único preenchimento vale para o lote inteiro, com opção "ajustar por item".
3. Passo 3 — revisão: tabela-resumo do lote (`patrimônio → tipo → destino/motivo`) e botão "Registrar". Sucesso: toast por lote ("3 movimentações registradas"), limpa o formulário e mostra links para as fichas. Falha parcial: mantém no form apenas os itens que falharam, com o erro de cada um.
4. Acesso: exige sessão de operador (o middleware da F0 já cobre — sem sessão, redirect ao login).
5. **Entrada de equipamento novo (tipo `compra` — spec §8 regra 8):** o botão "Novo equipamento" abre a variante do fluxo em que o passo 1 é um **form de cadastro** em vez de busca: patrimônio (valida formato canônico e duplicidade — se já existir, exige service tag distinta), service tag, categoria, marca, modelo, specs opcionais, fornecedor, **filial que recebeu**, observação (nº da nota fiscal etc.). **Suporta lote**, porque compra chega em série (caso real: 10 Samsung Galaxy A17, WAP0006026–0006035, numa única entrada): colar lista de patrimônios (um por linha, service tag opcional após vírgula) **ou** informar faixa (`WAP0006026-WAP0006035`) para N unidades do mesmo modelo. Um único submit cria os ativos (nascem `em_estoque` na filial informada) e registra uma movimentação `compra` por ativo — **tudo ou nada**: se um patrimônio falhar na validação, nada entra e o erro aponta a linha.

### 3.6 Estorno (na ficha)

Na linha do tempo, a movimentação **mais recente** do ativo (e só ela) mostra o botão "Estornar" → dialog de confirmação mostrando o que o ativo volta a ser (status/colaborador/filial do snapshot) + campo observação opcional → chama a action. Sucesso atualiza a ficha; erro do banco vira toast pt-BR.

### 3.7 Facilitadores — o que faz o sistema ganhar do Excel (spec §6.4)

Sem importação depois do go-live, a operação manual é a única entrada de dados — estes detalhes são requisito, não luxo:
1. **Defaults:** data = hoje; ao abrir `/movimentacoes/nova` o foco já está na busca de patrimônio; `Enter` avança entre os passos do fluxo.
2. **Atalho global `N`** (quando nenhum input está focado): abre nova movimentação de qualquer tela autenticada — só para admin.
3. **"Repetir última":** botão na tela de nova movimentação que pré-preenche tipo, motivo, colaborador/setor, chamado e termo da última movimentação registrada pelo usuário logado (menos o ativo).
4. **"Duplicar":** ação em cada item da linha do tempo da ficha que abre `/movimentacoes/nova` pré-preenchida com aquela movimentação (permitindo trocar o ativo).
Proibido aqui: kits salvos de lote (é item 5.9 da F5) e qualquer dependência nova.

## 4. Critérios de aceite (roteiro manual do Johnny — com o seed carregado)

- [ ] Lista filtra por filial+status combinados e a busca acha por pedaço de patrimônio e por nome fictício.
- [ ] Ficha de um ativo com patrimônio duplicado do seed: os dois aparecem na busca distinguíveis pela service tag.
- [ ] Registrar kit (notebook+monitor+celular `em_estoque` → saída, novo_colaborador, mesmo chamado): 3 movimentações criadas, fichas atualizadas p/ em_uso com colaborador, em ≤ 90s.
- [ ] Entrada de compra em lote: cadastrar 10 celulares do mesmo modelo por faixa de patrimônio em ≤ 2 minutos; todos nascem `em_estoque` na filial certa, cada um com movimentação `compra` na linha do tempo; faixa com 1 patrimônio já existente → nada entra e o erro aponta qual.
- [ ] Tentar saída de ativo `em_uso` direto no form: o tipo "saída" nem aparece no select; forçando via ajuste sem observação, Zod barra.
- [ ] Devolução com itens faltantes → pendência aparece na ficha; triagem_ok → some.
- [ ] Movimentação com observação → texto aparece na linha do tempo; sem observação → nada quebra (campo é opcional em todo tipo, menos ajuste).
- [ ] Estorno da última movimentação restaura status/colaborador/filial e aparece na linha do tempo; botão não existe em movimentação antiga.
- [ ] Sem sessão: rotas redirecionam ao login e chamada direta da Server Action é rejeitada (teste via fetch manual).
- [ ] Facilitadores: data default = hoje com foco na busca; atalho `N` abre a tela; "repetir última" e "duplicar" pré-preenchem os campos certos.
- [ ] Estados de loading/vazio/erro visíveis; mobile 375px usável; `lint`+`build` limpos.

## 5. Entrega

Direto na `main` ou branch `f2-operacao` com merge por sua conta. Commits por bloco (3.1 a 3.7). Resumo final com checklist autoverificado, mensagens de erro do banco mapeadas (tabela trigger→texto pt-BR), decisões em `docs/DECISOES.md`, pendências.

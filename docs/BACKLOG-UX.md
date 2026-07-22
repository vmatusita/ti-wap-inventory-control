# Backlog de melhorias — UX e facilitadores de operação

> Análise de 22/07/2026 sobre o working tree (F0–F8 concluídas e em produção; pendentes F6C e itens de F5). Este documento é **insumo de backlog** — cada item só vira trabalho quando entrar numa ordem de serviço.
>
> **Estado (22/07/2026):** a **Onda 1 (§5) foi executada pela F9** — os 14 itens estão em produção; os textos abaixo descrevem o problema *como era antes* da correção e ficam como registro do diagnóstico. As Ondas 2 e 3 continuam abertas. Nenhuma sugestão exige dependência fora da stack fechada (as duas únicas ressalvas estão marcadas), nenhuma cria custo, nenhuma mexe no modelo de acesso de nível único e nenhuma reabre decisões registradas (modo *Atualizar* do import, roles, dark mode, upload de PDF assinado).

**Legenda de esforço:** P ≈ até meio dia · M ≈ 1–2 dias · G ≈ 3+ dias. Quando o item exige migration nova ou decisão do Johnny, está indicado em "requer".

---

## 0. Base do diagnóstico — o que já existe e não deve ser refeito

O fluxo de movimentação já tem: lote de até 10 com interseção da máquina de estados em tempo real, atalho global `N` (com badge no botão do header), pré-preenchimento via `?ativo=` e `?duplicar=`, "Repetir última", data default hoje, Enter-avança, termo gerado direto no painel de sucesso. A compra já tem colar-lista/faixa com preview canônico ao vivo e "Cadastrar mais" preservando categoria/filial/data. Itens já tem atalho `L`, "Repetir último" (persistido no banco) e descrição do efeito de cada tipo de lançamento. A F6B entregou barra de progresso, skeletons, `/ajuda`, sessões 24h, confirmar assinatura e corrigir patrimônio. As sugestões abaixo constroem **em cima** disso.

---

## 1. Nova movimentação

**M1 · Colar lista de patrimônios no passo "Ativos" — M**
Hoje o lote é montado um a um pelo combobox; o parser de lista/faixa (`src/lib/patrimonio.ts` — `parsearLista`, `expandirFaixa`) existe mas só serve à compra. Proposta: botão "Colar lista" no passo 1 que abre um textarea, resolve cada patrimônio no servidor (tratando o caso de patrimônio duplicado — pedir a service tag quando houver ambiguidade) e reporta não-encontrados. É o maior acelerador para transferências e devoluções em volume, e casa com a bipagem por leitor USB (que digita + Enter = uma linha por bip).

**M2 · Buscar por colaborador no combobox de ativos — P**
`buscarAtivosParaCombobox` varre patrimônio/marca/modelo/service_tag/hostname (`src/lib/queries/ativos.ts:278-280`), mas não `colaborador_atual` — que a lista `/ativos` já busca (`ativos.ts:92`). Quem sabe "o notebook do João" não encontra pela pessoa. Incluir o campo no `or()` e atualizar o placeholder (que hoje nem menciona service tag/hostname, `ativo-combobox.tsx:70`).

**M3 · Sugestões iniciais no combobox — P/M**
Com menos de 2 caracteres o combobox mostra só "Digite ao menos 2 caracteres" (`ativo-combobox.tsx:81-85`). Mostrar ali os últimos ativos movimentados pelo operador (a query de "Repetir última" já existe em `queries/movimentacoes.ts`) acelera o caso mais comum: mexer de novo no que se mexeu ontem.

**M4 · Autocomplete de colaborador e setor — M**
Colaborador e setor são texto livre redigitado a cada movimentação (`passo-movimentacao.tsx:171-185`), com risco de grafias divergentes — o mesmo problema que a spec §5 combate para motivos. Proposta: sugestões a partir dos valores distintos já usados em `movimentacoes` (datalist ou Command), mantendo texto livre para nomes novos.

**M5 · Alerta de possível duplicata (spec §8 regra 7) — M · requer: nada, é regra prometida**
A spec prevê aviso não-bloqueante para "mesmo ativo + mesmo tipo + mesmo dia" (6 casos reais nas planilhas) e nada disso existe no fluxo (grep vazio). Proposta: checagem no servidor antes do insert; no passo Revisão, aviso âmbar "WAP0004491 já teve *saída* hoje — registrar mesmo assim?". É a lacuna spec↔código mais clara da tela.

**M6 · Rascunho persistente do lote — P/M**
Nenhum estado sobrevive à navegação: sair da tela (ou apertar `N` no meio do fluxo) descarta lote e config. Guardar o rascunho em `sessionStorage` e oferecer "Continuar de onde parou?" ao voltar; limpar no sucesso.

**M7 · Explicar o reset silencioso do tipo — P**
Adicionar um ativo que estreita a interseção de transições **limpa** o tipo escolhido sem dizer qual ativo causou (`nova-movimentacao-form.tsx:122-137`); o aviso de estados mistos é genérico. Ao limpar, informar: "WAP0001234 está *em manutenção* e não permite 'Saída' — escolha outro tipo ou remova-o do lote."

**M8 · Página de lista de movimentações (`/movimentacoes`) — G**
Não existe lista/auditoria de movimentações — a sidebar vai direto ao form (`sidebar-nav.tsx:28`) e o único histórico é a linha do tempo por ativo. Uma lista com filtros (período, tipo, filial, operador, busca) responde "o que registrei hoje?", dá visão do lote recém-criado e vira o lugar natural do botão "Nova". Complementa M9 no caso de sucesso parcial.

**M9 · Pós-registro: termos e sucesso parcial mais bem resolvidos — M**
No painel de sucesso cada termo de responsabilidade é um dialog isolado por ativo, e "Registrar outra movimentação" descarta o acesso a eles (`painel-sucesso.tsx:46-76, 104-106`); em sucesso parcial, os itens que **entraram** somem do form (ficam só os que falharam). Propostas: (a) fluxo "gerar próximo termo" encadeado ou lista de termos pendentes do lote com link para `/pendencias?tipo=termo`; (b) no erro parcial, mostrar também os registrados com links para as fichas.

**M10 · Chips "Hoje / Ontem" nos campos de data — P**
Data da movimentação e data do termo são sempre `type="date"` manual (`passo-movimentacao.tsx:225-234, 287-296`). Dois chips ao lado do input cobrem ~95% dos casos (registro no dia ou no dia seguinte).

**M11 · Rever o teto do lote (10 → 30?) — P · requer: decisão**
Movimentação aceita 10 (`validators/movimentacao.ts:316`) e compra aceita 200 (`MAX_LOTE_COMPRA`, `patrimonio.ts:8`). Um lote real de 15 monitores exige duas rodadas. O banco valida transição por transição de qualquer forma; subir a constante é barato — decidir o número e registrar em DECISOES.md.

**M12 · Kits salvos ("Kit novo colaborador") — G · já previsto (spec §6.4, adiado para F5)**
Único facilitador "anti-Excel" da spec ainda ausente. Preset nomeado de config (tipo, motivo, termo, checklist de categorias) que o operador aplica ao lote. Registrado aqui só para priorização — pertence à F5.

---

## 2. Cadastro de novos ativos (compra)

**A1 · Aceitar TAB e ponto-e-vírgula no colar-lista — P**
`parsearLista` só entende vírgula como separador de service tag (`patrimonio.ts:34-40`). Quem copia duas colunas do Excel cola `WAP0006026\tST-ABC` e recebe erro. Aceitar `\t` e `;` torna o caminho planilha → sistema direto, sem retrabalho.

**A2 · Service tags no modo Faixa — M**
A faixa gera só patrimônios (`nova-compra-form.tsx:69`); com service tags por unidade a única saída é montar a lista à mão. Proposta: textarea opcional "Service tags (uma por linha)" ao lado da faixa, casando 1:1 na ordem, com pareamento visível no preview.

**A3 · Detectar duplicata ainda no preview — P**
O preview canonicaliza mas não deduplica (`parsearLista` não checa chave repetida); a repetição só aparece no erro do servidor pós-submit (`compras.ts:44-53`). Marcar no preview o chip repetido (mesma chave patrimônio+ST) em vermelho, antes do envio.

**A4 · Memória de marca/modelo/fornecedor — M**
Os três campos são texto livre puro (`nova-compra-form.tsx:335-390`), sem sugestão do acervo — risco de "Dell" vs "DELL" e digitação repetida. Combobox com valores distintos já cadastrados + texto livre para novos. De quebra melhora os agrupamentos por modelo dos relatórios.

**A5 · Defaults e autofoco na compra — P**
Filial e categoria começam vazias a cada compra (`nova-compra-form.tsx:39,46`), enquanto o dialog de itens já pré-seleciona filial. Lembrar filial/categoria do último cadastro do operador e focar o textarea de patrimônios ao abrir a tela.

**A6 · "Comprar outro igual" e "Repetir última compra" — M**
Não há duplicar/repetir na compra (o "Duplicar" existe só na movimentação). Propostas: na ficha do ativo, ação "Comprar outro igual" (`/ativos/novo?duplicar=<id>` pré-preenchendo categoria/marca/modelo/specs/fornecedor/filial); no form, botão "Repetir última compra" análogo ao da movimentação.

**A7 · Documentar a bipagem por leitor USB — P (doc/ajuda)**
Leitor de código de barras emula teclado + Enter, então o textarea do colar-lista já aceita bipagem hoje — só ninguém foi avisado. Documentar em `/ajuda` (e garantir A5, o foco automático) transforma o recebimento físico: bipar N plaquetas em sequência e submeter. Zero código além da ajuda.

**A8 · Compra com patrimônio pendente — M · requer: decisão (muda regra da spec §6.3)**
Hoje a compra exige patrimônio canônico sempre; "sem patrimônio" só existe via import de startup. No mundo real o equipamento chega antes da plaqueta. Permitir cadastro "sem patrimônio (pendente)" cairia na esteira já existente de pendências + "Definir patrimônio" (`corrigir-patrimonio-dialog.tsx`). Só com decisão registrada, pois altera regra de negócio.

---

## 3. Itens por quantidade

**I1 · Lançamento multi-item (carrinho) — M/G**
Cada lançamento é um item por vez (`actions/itens.ts:37-47`); receber uma NF com 5 itens = abrir o dialog 5 vezes. Proposta: linhas dinâmicas item+quantidade compartilhando filial/tipo/data/chamado num único salvar (N inserts — o trigger valida cada um). É o análogo do lote de ativos que a tela de itens não ganhou.

**I2 · Criar item inline no lançamento — M**
O `CommandEmpty` do combobox é texto morto "Nenhum item encontrado." (`lancar-item-dialog.tsx:206`); item novo exige ir a `/admin/itens`, criar, voltar e reabrir o dialog. Trocar por "+ Criar item '<texto digitado>'" abrindo mini-form (nome/grupo) sem fechar o lançamento — todo operador é admin, não há barreira de permissão.

**I3 · Filtros no histórico de lançamentos — P/M**
O histórico só filtra por filial (`itens/page.tsx:51-55`), embora a query já aceite `itemId` (`queries/itens.ts:154`). Adicionar item, tipo e período na URL torna auditável "todas as saídas de mouse em junho" — hoje inviável na tela.

**I4 · Saldos das 5 filiais lado a lado — M**
`rel_saldo_itens` retorna uma filial por vez ou o consolidado; a tabela não tem coluna de filial (`itens/page.tsx:102-106`). Um toggle "por filial" com as 5 colunas (ou linha expansível com a distribuição) responde "onde tem mouse sobrando?" numa olhada, sem trocar filtro 5 vezes.

**I5 · Estoque mínimo por item — M · requer: migration (já previsto na F5) + correção imediata na ajuda — P**
Ponto de reposição não existe (catálogo é só nome/grupo/ordem/ativo), mas **a ajuda afirma que existe** — "Falta = quanto falta para o estoque mínimo configurado" (`src/lib/ajuda/conteudo.ts:299`) e "catálogo (nome, grupo, estoque mínimo)" (`conteudo.ts:497`). Duas ações: corrigir a ajuda **agora** (P, ela induz o operador a procurar configuração inexistente) e, na F5, campo `estoque_minimo` no catálogo + badge "repor" nos saldos + card no dashboard.

**I6 · Lançar a partir da linha do saldo — P**
Botão discreto na linha da tabela de saldos abrindo o dialog já com item+filial preenchidos (hoje o caminho é Lançar → procurar o item de novo no combobox).

---

## 4. Sistema inteiro (transversal)

**T1 · Busca global / paleta de comandos (Ctrl+K ou "/") — M**
Não há busca no header (`app-header.tsx:48-66`); cada lista tem a sua. O componente `ui/command.tsx` **já está no projeto** (usado nos comboboxes) — zero dependência nova. Paleta com: busca de ativo por patrimônio/ST/hostname/colaborador (1 resultado → vai direto à ficha), atalhos de navegação ("Ir para Pendências") e ações ("Nova movimentação", "Lançar item").

**T2 · Badge de contagem em "Pendências" na sidebar — P**
O item é link simples (`sidebar-nav.tsx:30`); o operador não vê o volume sem entrar. Uma contagem (a query das chips de pendências já existe) dá o "puxão" diário. Conferir também se os KPI tiles do dashboard linkam para as listas filtradas — se não, linkar.

**T3 · Ajuda contextual — P/M**
A `/ajuda` (F6B, 577 linhas, com âncoras) só é alcançável pela sidebar; nenhuma tela linka `/ajuda#secao` no ponto de dúvida (grep confirma). Ícones "?" discretos nos títulos das telas de operação + o atalho `?`, que já está registrado como backlog em DECISOES.md:570.

**T4 · Confirmação em "Revogar senha" + padronizar confirmações destrutivas — P**
Revogar senha de acesso é 1 clique sem diálogo (`senha-acoes.tsx:15-25`), enquanto estorno e desfazer-assinatura confirmam. Padronizar (AlertDialog via shadcn CLI, ou o Dialog comum já usado — sem dependência se ficar no Dialog).

**T5 · Export CSV nas listas operacionais — M (P por lista)**
Só existem `.docx` de termos e backup JSON do import; Ativos/Pendências/Itens não exportam. PapaParse **já está na stack** (F3). Botão "Exportar CSV" respeitando os filtros atuais da URL — mata os pedidos avulsos de planilha.

**T6 · Copiar patrimônio com um clique — P**
Clipboard hoje só em convite e senha (`convidar-usuario-dialog.tsx:65`, `criar-senha-dialog.tsx:69`). Clique no patrimônio na ficha (e ícone nas tabelas) copia com toast — patrimônio é o dado mais re-digitado em chamados/e-mails.

**T7 · Ordenação de colunas + paginação melhor — M**
Nenhuma tabela ordena por coluna; paginação é só Anterior/Próxima (`ativos-paginacao.tsx`), sem salto nem tamanho de página. Ordenação server-side via param na URL (o TanStack Table já está montado) + "página X de Y" com salto.

**T8 · Empty states padronizados — P**
Ativos e Relatórios gerados têm vazios ricos (ícone + CTA); Pendências, Itens, Import e dashboard são texto seco (`pendencias/page.tsx:95`, `itens/page.tsx:88`, `admin/importar/page.tsx:39`). Um componente `EstadoVazio` único com ícone + frase + ação sugerida.

**T9 · Acessibilidade e consistência de forms — M (paga dívidas K/O)**
`sr-only` ×0 e `aria-invalid` ×1 no app inteiro — erros de formulário quase não são anunciados a leitores de tela; loading ora é `useState` manual, ora `useTransition`. Convergir para o padrão react-hook-form/`useTransition` (dívida K) já resolve boa parte, adicionando `aria-invalid` + mensagem associada por `aria-describedby`.

**T10 · Filtros das tabelas do relatório na URL — P/M**
As tabelas internas do relatório usam estado efêmero (`filtros-tabela.tsx:24-41`), divergindo do padrão URL de Ativos/Pendências/Itens — filtro se perde ao atualizar e não é compartilhável. Migrar para searchParams alinha o app inteiro num padrão só.

**T11 · Unificar as duas definições de "semana" — P · requer: decisão**
Relatório ao vivo abre dom–sáb (decisão B2); o dialog de gerar snapshot sugere seg–sex (`semanaUtilCorrente`, `relatorios/[filial]/page.tsx:63-66`). Se a diferença é intencional (visão corrente vs relatório semanal), explicitar nos rótulos; se não, unificar — e registrar.

**T12 · Remover `next-themes` (dependência morta) — P · requer: decisão registrada**
`package.json` lista `next-themes ^0.4.6`, mas DECISOES.md:289 fixa "tema claro por design, toggle não adicionado" e não há `ThemeProvider`/`useTheme` em uso no `src`. Remover a dep (e manter os tokens `.dark` inertes no CSS, que não custam nada) fecha a contradição com a stack fechada.

---

## 5. Priorização sugerida

| Onda | Tema | Itens | Observação |
|---|---|---|---|
| ~~**1 — Quick wins**~~ ✅ **CONCLUÍDA em 22/07/2026 (F9)** | Polimento de alto retorno | M2, M7, M10, A1, A3, A5, A7, I3, I6, T2, T4, T6, T8 + correção da ajuda (I5a) | Entregues os 14 pela `docs/prompts/F9-ultracode.md`, zero migration e zero dependência nova. Ata em `docs/DECISOES.md` (2026-07-22 · F9) |
| ~~**2 — Operação em massa**~~ ✅ **CONCLUÍDA em 22/07/2026 (F10)** | Lote e memória | M1, M3, M4, M5, M6, M9, M11, A2, A4, A6, I1, I2, T5 | Entregues os 13 pela `docs/prompts/F10-ultracode.md`, zero migration e zero dependência nova. M5 (a regra prometida pela spec §8.7) saiu como **aviso âmbar não-bloqueante**; o teto do M11 fechou em **30** (`MAX_LOTE_MOVIMENTACAO`). Ata em `docs/DECISOES.md` (2026-07-22 · F10); roteiro E2E em `docs/E2E-F10.md` |
| **3 — Navegação e estrutura** | Busca e auditoria | T1, T3, T7, T9, T10, M8, I4 | T1 e M8 são os de maior impacto percebido — **próxima onda** |
| **Já previstos (F5/F6C)** | — | M12 (kits), I5 (estoque mínimo), carga F6C | Priorizar dentro da F5 quando ela abrir |
| **Exigem decisão antes** | — | A8, ~~M11~~ (decidido: 30, na F10), T11, T12 | Registrar em DECISOES.md ao decidir |

## 6. Não sugerido de propósito (decisões vigentes respeitadas)

Modo *Atualizar* do import (adiado — correção é no sistema, linha a linha); roles/papéis (nível único é decisão de spec); toggle de dark mode (tema claro por design); upload do PDF assinado do termo (adiado, F5 item 5.5); qualquer sincronização automática de dados do dia a dia (entrada é 100% manual por regra); qualquer dependência fora da stack fechada — as sugestões acima usam apenas o que já existe no projeto (`ui/command.tsx`, PapaParse, Supabase realtime) ou componentes shadcn via CLI.

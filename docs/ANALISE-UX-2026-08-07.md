# Análise minuciosa — Fluxos, facilitadores e UX/UI

> **Estoque TI WAP** · análise de 07/08/2026 sobre o working tree na F26 (04/08/2026) · 472 arquivos em `src/`, docs e migrations lidos.
> Método: leitura da documentação interna (spec, BACKLOG-UX, dívida técnica, relatórios F9–F26) + varredura profunda do código em 7 frentes paralelas (navegação/layout, movimentações, ativos, itens+pendências, relatórios, admin/import/dev, transversal de a11y/consistência), com **cada achado verificado no código-fonte** (arquivo:linha citados). Os achados de maior impacto foram reconferidos manualmente por segunda leitura.
>
> Este documento segue o formato do `docs/BACKLOG-UX.md` original (diagnóstico → itens com evidência → priorização) e foi escrito para virar insumo de ordem de serviço. **Nada aqui repete** o que as ondas F9–F12 já entregaram, o que a F13–F26 corrigiu, nem o que está vetado por decisão registrada (§9).

**Legenda:** Impacto **A**lto / **M**édio / **B**aixo · Esforço **P** ≈ até meio dia · **M** ≈ 1–2 dias · **G** ≈ 3+ dias. Dimensão: 🔀 fluxo · ⚡ facilitador · 🎨 UX/UI (inclui a11y).

---

## 0. Leitura geral — onde o projeto está

A base de UX deste sistema é **incomumente madura** para um interno: as três ondas do backlog original fecharam (F9–F11), os facilitadores anti-Excel existem e são bons (colar/bipar, kits, rascunho, repetir/duplicar, paleta Ctrl+K, troca/upgrade em uma tela), o vocabulário pt-BR é consistente, datas são 100% centralizadas, toasts têm padrão, dialogs são Radix (foco/Esc corretos), o dark mode tem tokens completos e a ajuda cobre 33 páginas com teste que impede envelhecer. Vale registrar o que **foi conferido e está OK** para não virar falso achado: anti-duplo-clique via `useTransition` em 43 arquivos, `aria-sort` na ordenação, print styles com tema claro forçado, guardas de teclado fiéis à documentação, saldo negativo impossível por trigger, export CSV da mesa de conflitos com fonte própria.

O que esta análise encontra é a **camada seguinte**, e ela tem um padrão claro: os grandes fluxos individuais são excelentes, mas (1) as **costuras entre telas** perdem contexto (login→destino, lista→ficha→lista, fila→ficha→fila, sucesso→próxima ação); (2) o **feedback de erro de formulário** ficou atrás do resto (erros longe do campo, sem foco, toasts que somem); (3) meia dúzia de **facilitadores de rotina diária** ainda não nasceram (agir em lote a partir das listas, transferir itens entre filiais, "o que eu registrei hoje"); e (4) sobras pequenas de **consistência/a11y** que as fases novas (F24/F25) introduziram sem passar pelas réguas das fases de UX (F9/F11/F19).

Total: **84 itens consolidados** (16 de impacto alto, 52 médio, 16 baixo — vários agrupam subitens). Nenhum exige dependência nova; um pede migration aditiva pequena (`motivos.ordem`) e dois podem pedir RPC/constraint (reabrir pendência de item, versão única do snapshot); nenhum toca o modelo de acesso nem decisões registradas.

---

## 1. Top 15 — o que eu faria primeiro

| # | ID | Achado | Dim. | Imp. | Esf. |
|---|----|--------|------|------|------|
| 1 | FLX-01 | Login e senha de acesso não preservam o destino — sessão expirada volta sempre à estaca zero | 🔀 | A | P |
| 2 | MOV-01 | Erros de validação do wizard nascem fora da tela, sem foco e longe do campo | 🎨 | A | M |
| 3 | MOV-03 | Operador sem vínculo na filial só descobre no fim: monta o lote inteiro e perde tudo | 🔀 | A | M |
| 4 | MOV-02 | O passo Revisão não mostra data, termo, chamado nem observação — revisa-se sem ver o que será gravado | 🔀 | A | M |
| 5 | ATV-01 | Busca da lista de ativos não acha por service tag, hostname, IMEI (o combobox acha) | ⚡ | A | P |
| 6 | ATV-02 | Ativo com pendência é invisível na lista | 🎨 | A | M |
| 7 | PND-01 | Pendências de patrimônio e triagem não têm ação na fila — 4+ cliques e 2 telas cada | 🔀 | A | M |
| 8 | DEV-01 | A tela /dev descarta 2 das 9 checagens de integridade em silêncio (catálogo ficou nas 7) | 🔀 | A | P |
| 9 | ADM-01 | Excluir item do catálogo não pede confirmação nenhuma | 🎨 | A | P |
| 10 | UXG-01 | Não existe `global-error.tsx` — erro fora do grupo (app) cai na tela crua do Next, em inglês | 🎨 | A | P |
| 11 | REL-01 | Impressão do relatório perde colunas inteiras (Colab., Termo, Obs. não saem no papel) | 🎨 | A | M |
| 12 | MOV-05 | A lista de movimentações não responde "o que registrei hoje?" (sem chips de período, sem filtro "minhas") | ⚡ | A | M |
| 13 | ATV-04 | Termo assinado editável por duas portas — uma audita, a outra não | 🔀 | A | M |
| 14 | ATV-03 | Sem seleção múltipla na lista — a movimentação em lote não nasce de onde o operador filtra | ⚡ | A | G |
| 15 | ITN-01 | Transferir item entre filiais não existe — e o caminho intuitivo corrompe o Total para sempre | ⚡ | A | G |

Quick wins de uma tarde (P, retorno imediato): FLX-01, ATV-01, DEV-01, ADM-01, UXG-01, MOV-04 (teto do lote no `adicionar`), MOV-09 (data do termo retroativo), FLX-03 (títulos de aba), UXG-02 ("Close"→"Fechar"), REL-02 (trocar período preserva filtros), REL-13 (verde AA), ADM-06 (import zera a filial no "Novo import"), PND-03 (chips clicáveis).

---

## 2. Fluxos transversais (entrar, navegar, errar, voltar)

**FLX-01 · Reentrada perde o destino — as duas portas 🔀 A/P**
A porta do operador: sessão expirada ou acesso sem sessão descartam a URL atual (`src/lib/supabase/proxy.ts:74-77` zera `url.search`; `:116-118` nem grava `next`) e `signIn` faz `redirect('/')` fixo (`src/lib/actions/auth.ts:38`). Quem estava em `/pendencias?filial=3` ou recebeu link de ficha pelo Teams cai no Dashboard e renavega na mão. A porta do visualizador: o proxy até grava `?next=` quando o cookie está **ausente** (`proxy.ts:98-112`), mas cookie **expirado** (24 h) redireciona sem `next` nas três chamadas (`relatorios/[filial]/page.tsx:63`, `(app)/layout.tsx:159`, `gerados/page.tsx:31`) — e o `ViewerAutoRefresh` de 60 s dispara isso sozinho no meio da leitura: o gestor redigita a senha e cai no `/relatorios/geral` padrão, perdendo filial, período e filtros. *Sugestão:* gravar `next=pathname+search` nos redirects e honrá-lo nas duas actions — a sanitização (`destinoSeguro`) e o precedente (fluxo de convite, `auth.ts:80-86`) já existem.

**FLX-02 · "Ver todas" das últimas movimentações leva ao relatório, não à lista 🔀 M/P**
O card do dashboard lista movimentações individuais, mas o link expande para o consolidado (`src/app/(app)/page.tsx:302-312`, `href={ROTA_RELATORIO_CONSOLIDADO}`) — resquício de antes da F11, quando `/movimentacoes` não existia. *Sugestão:* `href="/movimentacoes?filial=todas"` (a sentinela pelo mesmo motivo documentado em `LINKS_KPI`).

**FLX-03 · Todas as rotas têm o mesmo título de documento 🎨 M/P**
`metadata` só existe no root e na ajuda (grep: 5 arquivos em 28 páginas). Abas, histórico, favoritos e o route announcer do leitor de tela dizem "Estoque TI · WAP" para tudo (WCAG 2.4.2). *Sugestão:* `title: { template: '%s · Estoque TI WAP' }` no root + um `metadata.title` por página; na ficha, `generateMetadata` com o patrimônio.

**FLX-04 · Card Pendências do dashboard ignora os conflitos que o selo da sidebar soma 🔀 M/P**
O selo soma `pendencias + conflitos` (`(app)/layout.tsx:69-73`); o card lê só `v_fila_pendencias` (`page.tsx:115-117`). Com fila vazia e 2 conflitos, a home comemora "Nenhuma pendência 🎉" ao lado de um selo "2" — o próprio comentário do código admite a contradição e mitiga só com microcopy condicional. *Sugestão:* incluir `contarConflitosAbertos` no `Promise.all` e renderizar linha destacada com link quando > 0.

**FLX-05 · Devolução ao fornecedor tem porta única (a ficha) 🔀 M/P**
O único link para `/movimentacoes/devolucao-fornecedor` no app é o botão da ficha de ativo `em_manutencao` (`ativos/[id]/page.tsx:160`); a paleta não tem a ação e a lista não oferece o caminho. Quem parte do evento real ("o fornecedor disse que não tem conserto") precisa saber que o fluxo começa achando a ficha. *Sugestão:* entrada na paleta ("Devolver ao fornecedor" → `/ativos?status=em_manutencao&filial=todas`) com apelidos `fornecedor`, `baixa`, `sem conserto`.

**FLX-06 · Not-found do grupo (app) manda o operador para relatórios 🔀 B/P**
As duas saídas da 404 interna são de relatório, escolhidas para servir o visualizador — mas o arquivo já chama `getOperador()` (`(app)/not-found.tsx:30-39`) e não usa o resultado. *Sugestão:* com operador, oferecer "Ir para o início" + "Ver ativos".

---

## 3. Nova movimentação e lista (o coração do sistema)

**MOV-01 · Erros de validação nascem fora da viewport, sem foco e longe do campo 🎨 A/P+M**
Duas metades: (a) `avancarParaRevisao()` só faz `setErros(msgs)` e o box `role="alert"` fica **acima** do stepper (`nova-movimentacao-form.tsx:810-814`, `1115-1130`) — no passo 2 longo, o clique em "Revisar" parece inerte porque o erro nasce fora da tela, sem scroll nem foco (P: `tabIndex={-1}` + `scrollIntoView`/`focus()` ao setar). (b) O Zod já devolve `issue.path` com o campo (`:783-791`), mas a mensagem vira lista genérica no topo: nenhum input recebe `aria-invalid` nem mensagem adjacente (M: derivar `Record<campo, msg>` e exibir sob o campo com `aria-describedby`, mantendo o resumo no topo).

**MOV-02 · A Revisão não mostra o que será gravado 🔀 A/M**
O passo 3 exibe só Patrimônio · Movimentação · Destino/Motivo (`nova/passo-revisao.tsx:50-75`, `212-225`). **A data não aparece em nenhum lugar da revisão** — com os chips Hoje/Ontem tornando rotina o lançamento retroativo, 12 movimentações com a data errada passam por uma "revisão" que não a mostra. Termo+data, chamado, observação, status resultante e itens faltantes idem; e as colunas repetem o mesmo valor N vezes (config compartilhada). *Sugestão:* card-resumo da config acima da tabela (Data em destaque) e tabela reduzida aos ativos.

**MOV-03 · Vínculo de filial só é checado no submit — e recusa o lote inteiro 🔀 A/M**
Por decisão correta, a leitura é global e `exigirEscritaEm` recusa o lote inteiro no servidor (`actions/movimentacoes.ts:229-245`). Mas o formulário não dá **nenhum sinal antecipado**: o operador vinculado só a Curitiba bipa 12 ativos de Joinville, preenche 3 passos e recebe `erroGeral`. *Sugestão:* a página já tem `getOperador()` — passar `filiaisEscrita` ao form e marcar com aviso âmbar, já no passo 1, item de filial fora do vínculo ("o registro será recusado"), sem travar (a regra continua no servidor).

**MOV-04 · O caminho um-a-um fura o teto de 30 até o Revisar 🔀 M/P**
`adicionarVarios` corta pelo teto e a contrapartida recusa com toast, mas `adicionar()` — o caminho do combobox — não checa `MAX_LOTE_MOVIMENTACAO` (`nova-movimentacao-form.tsx:364-388`): dá para adicionar o 31º, 32º…, e o erro só estoura no Zod do Revisar, longe do gesto. *Sugestão:* guarda com o mesmo toast da contrapartida.

**MOV-05 · Lista não responde "o que registrei hoje?" ⚡ A/M**
Sem chips Hoje/Ontem/7 dias (o componente existe no wizard) e sem filtro por autor — `queryLista()` não filtra `criado_por` (`queries/movimentacoes.ts:624-664`) e a coluna Operador só aparece em `xl` (`lista-filtros.tsx:208-243`). Para quem registra 30/dia, conferir o próprio dia exige preencher `type="date"` a cada visita. *Sugestão:* chips de período + param `?autor=eu`.

**MOV-06 · Lote invisível na lista e "Duplicar" só pela ficha ⚡ M/M**
Um lote de 12 vira 12 linhas idênticas sem hora (`created_at` já vem na query e não é usado — `lista-movimentacoes.tsx:88-115`) e sem vínculo visual; "Duplicar" existe só na linha do tempo da ficha. *Sugestão:* hora em coluna estreita/`title`, separador leve quando autor+minuto mudam, ação "Duplicar" por linha.

**MOV-07 · "Repetir última" aplica motivo de um tipo que não foi aplicado 🔀 M/P**
Quando `tipoValido === false`, mantém-se `config.tipo` mas aplica-se `motivo: ultimaMov.motivo ?? ''` incondicionalmente (`nova-movimentacao-form.tsx:691-711`) — o Select mostra placeholder, o Zod só exige `min(1)` e não há checagem de `aplica_a` na action nem no banco: grava-se motivo incoerente com o tipo, invisível na tela. *Sugestão:* aplicar motivo/termo/termoData apenas quando `tipoValido`; senão limpar e avisar (o toast de aviso já existe).

**MOV-08 · Enter duplo registra antes de o aviso de duplicata chegar 🔀 M/P**
O aviso âmbar (F10/M5) é consultado num `useEffect` ao montar o passo 3 (`passo-revisao.tsx:129-155`); dois Enters seguidos (`nova-movimentacao-form.tsx:1016-1018`) despacham o envio antes da resposta — o aviso, único propósito do passo, nunca é visto. *Sugestão:* enquanto a consulta está em voo, "conferindo duplicatas…" ao lado do botão e ignorar Enter-registro nessa janela curta (clique continua livre).

**MOV-09 · Termo abre sempre com a data de hoje, ignorando a movimentação retroativa ⚡ M/P**
`prepararTermo` nem seleciona `data`/`termo_data` da movimentação (`actions/termos.ts:97-100`) e o dialog abre com `hoje` (`:172`, `:229`) — o operador redigita a data que o sistema já sabe; esquecer gera termo divergente do registro. *Sugestão:* `data: mov.termo_data ?? mov.data ?? hoje` (campo segue editável).

**MOV-10 · Pós-sucesso de lote estourado recomeça do zero 🔀 M/P**
O colar-lista diz "Registre o resto em outro lote" (`colar-lista-dialog.tsx:413-424`), mas o painel de sucesso só tem "Registrar outra movimentação" que zera tudo (`painel-sucesso.tsx:332-334`). *Sugestão:* segundo botão "Registrar outro lote com os mesmos campos" (`reiniciar({manterConfig: true})`).

**MOV-11 · Banner de rascunho decide às cegas 🎨 M/P**
"Você tem um lote não registrado — 3 ativos" não diz quais, de que tipo nem quando foi salvo (`rascunho.ts:46-52` guarda só ids+config), e Descartar é irreversível. *Sugestão:* snapshot de exibição no rascunho (`patrimonios[]`, `salvoEm`) → "3 ativos (WAP0001234…) · Saída · salvo há 2 h".

**MOV-12 · Devolução ao fornecedor fala outro dialeto 🎨 M/M**
No fluxo irmão: obrigatórios do substituto só por toast que some (`devolucao-fornecedor-form.tsx:86-88`), box de erro sem `role="alert"` (`:428-440`), data sem chips Hoje/Ontem, sem Enter-envia. Mesma persona, mesma tarefa, regras de feedback diferentes. *Sugestão:* reusar `ChipsData`, `role="alert"` e erros por campo do wizard.

**MOV-13 · Sucesso não é anunciado nem focado 🎨 M/P**
Ao registrar, o form desmonta e o foco morre no `body`; o painel não tem `role="status"` nem foco programático (`painel-sucesso.tsx:261-269`; idem devolução-fornecedor). Leitor de tela não ouve "N movimentações registradas". *Sugestão:* `tabIndex={-1}` + `focus()` no `<h2>` ao montar (técnica que o encadeamento de termos já usa).

**MOV-14 · `?duplicar=`/`?ativo=` inválido abre o form vazio em silêncio 🔀 B/P**
`if (mov) {…}` sem `else` (`movimentacoes/nova/page.tsx:105-125`): id apagado (Zona destrutiva) ou quebrado → wizard em branco sem aviso. *Sugestão:* banner âmbar "a origem não foi encontrada — o formulário abriu em branco".

**MOV-15 · Miudezas de teclado e formulário 🎨 B/P**
(a) Enter no combobox vazio não avança o passo — quem monta lote inteiro no teclado precisa sair do campo (`nova-movimentacao-form.tsx:1002-1018`; liberar quando input vazio e `itens.length > 0`). (b) Motivo/termo opcionais não têm como voltar a vazio (Radix Select não desseleciona; falta item "— sem motivo", `passo-movimentacao.tsx:346-360`, `424-438`). (c) O lote do passo 1 não mostra "com Fulano" — o combobox mostra, a linha adicionada não (`passo-ativos.tsx:78-111`); conferir a devolução de 8 máquinas depende da memória. (d) `gerar-termo-dialog` sem trava de reentrância (`gerando` é state; usar `gerandoRef` como o wizard, `:183-212`). (e) Checklist sem `fieldset/legend` e busca de ativos sem nome acessível (`checklist-faltantes.tsx:21-23`, `ativo-combobox.tsx:164-169`).

---

## 4. Ativos — lista, ficha e compra

**ATV-01 · A busca da lista não acha por service tag, hostname, IMEI, telefone ⚡ A/P**
`aplicarFiltrosAtivos` varre 4 campos (`queries/ativos.ts:110-112`); o combobox da movimentação, no mesmo arquivo, já cobre `service_tag`+`hostname` (`:452-454`). Colar uma service tag (o identificador imutável) ou um IMEI (coluna desde a F25) na busca da lista devolve vazio. *Sugestão:* acrescentar os campos ao `.or()` e atualizar o placeholder — o CSV herda de graça por ser a mesma função.

**ATV-02 · Pendência invisível na lista 🎨 A/M**
O select da lista não traz `pendencia` (`queries/ativos.ts:20-32`) — nenhuma linha sinaliza "termo pendente"/"sem service tag"/"conflito"; só a ficha avisa (faixa âmbar). *Sugestão:* ícone âmbar com tooltip junto ao patrimônio + chip de filtro "Com pendência" (padrão `aria-pressed` do chip "Sem patrimônio").

**ATV-03 · Sem seleção múltipla → o lote não nasce da lista ⚡ A/G**
O fluxo é de lote por natureza e `buscarAtivosResumoPorIds` já existe (`queries/ativos.ts:592-619`), mas a tabela não tem checkbox: quem filtrou "notebooks em estoque da Matriz" para emprestar 5 recomeça a seleção dentro do wizard. *Sugestão:* row selection (TanStack já montado) + barra "N selecionados → Movimentar" navegando para `/movimentacoes/nova?ativos=id1,id2` (e de brinde "copiar patrimônios selecionados"). Habilita também o ATV-07 em lote.

**ATV-04 · Termo assinado editável por duas portas — uma audita, a outra não 🔀 A/M**
O fluxo oficial (Confirmar/Desfazer assinatura) grava anotação com autor+data; `atualizarDadosCadastrais` grava os mesmos `termo_assinado`/`termo_data` sem rastro nenhum (`actions/ativos.ts:181-201`; campos expostos em `editar-ativo-dialog.tsx:240-281`). *Sugestão:* retirar os dois campos do dialog de edição (apontando para o card Termos) ou anotar a mudança no update.

**ATV-05 · Cabeçalho afirma "N ativos cadastrados" para resultado filtrado 🎨 M/P**
`resultado.total` já vem com busca+filtros+recorte aplicados, mas o subtítulo diz "cadastrados" (`ativos/page.tsx:187-189`). A página já calcula `temFiltro`/`temRecorteFilial` (F25) — usar: "37 encontrados" / "1.204 nas suas filiais".

**ATV-06 · Service tag: coluna que pisca e some no mobile 🎨 M/P**
`showServiceTag` é calculado **por página** (`queries/ativos.ts:59-61`) — a coluna aparece/some ao paginar; e quando existe é `hidden lg:table-cell` (`ativos-table.tsx:47`), sumindo exatamente onde desambigua patrimônio repetido. *Sugestão:* service tag como sublinha do patrimônio (`text-xs text-muted-foreground`) nas linhas duplicadas — sem coluna condicional.

**ATV-07 · Ficha → próxima ação: boas pontes que faltam ⚡ M/P–M**
(a) Painel de sucesso da compra não emenda "Movimentar agora" (`/movimentacoes/nova?ativo=<id>` já existe; `nova-compra-form.tsx:601-606`). (b) Colaborador/marca+modelo na ficha são texto morto — sem pivô "ver tudo do Fulano" (`/ativos?q=` já busca por esses campos; `[id]/page.tsx:265`). (c) Ficha não diz no topo com quem o ativo está — colaborador é a 9ª célula do grid (`:133-147` vs `:265-266`); acrescentar "· com Fulano (Setor)" ao subtítulo.

**ATV-08 · Linha do tempo monocromática 🎨 M/P**
Todo evento usa o mesmo trilho e badge secundário (`linha-do-tempo.tsx:143-149`), embora a paleta por tipo exista, testada em contraste, em `TIPO_PILL` (`dominio.ts:159-165`) e seja usada na lista. Escanear "quando saiu?" exige ler badge por badge. *Sugestão:* aplicar `TIPO_PILL` (e/ou ícone por tipo) na timeline.

**ATV-09 · Compra: validação por toast e teto sem régua no modo lista 🎨 M/P–M**
(a) Obrigatórios falham só por `toast.error` que some — nenhum campo é marcado nem focado (`nova-compra-form.tsx:462-470`). (b) `parsearLista` não valida o teto de 200 no cliente — 250 linhas mostram preview ok e o erro só vem do servidor (`patrimonio.ts:33-83`; a aba Faixa valida). *Sugestão:* erros por campo (padrão dos dialogs) e régua do teto no preview + rótulo da aba.

**ATV-10 · Perda de trabalho silenciosa 🔀 M/P–M**
(a) Fechar o dialog de edição com Esc/clique-fora descarta alterações sem confirmação — o RHF tem `isDirty` e não é consultado (`editar-ativo-dialog.tsx:120-127`). (b) A compra não tem rascunho: lista de até 200 patrimônios + specs vivem em `useState` — um clique na sidebar perde tudo (o wizard irmão tem `rascunho.ts`; a "memória" da compra salva só categoria/filial após sucesso).

**ATV-11 · Miudezas da lista/ficha 🎨 B/P**
(a) Clique na linha ignora Ctrl/Shift e seleção de texto (`ativos-table.tsx:255-259`; o projeto já trata modificadores em `voltar-para-ativos.tsx:31-32`). (b) "Voltar para ativos" faz `push` (empilha histórico) e perde a posição de rolagem (`voltar-para-ativos.tsx:38-39`). (c) CTA "Novo equipamento" é `outline`, mesmo peso do Exportar CSV (`ativos/page.tsx:196-203`); a ficha faz certo (primário único). (d) Sem "Entrada em"/idade no grid da ficha; IMEI/telefone sem botão copiar (o `CopiarPatrimonio` já parametriza rótulo). (e) Busca sem "X" para limpar só o termo — o "Limpar" derruba filial+status juntos (`ativos-filtros.tsx:167-180`). (f) Microcopy do "Editar dados cadastrais" não aponta onde se corrige patrimônio/ST (menu ⋯). (g) Ficha faz 4 rodadas sequenciais de leitura — `buscarSubstitutoDe` só depende do param e podia ir no primeiro `Promise.all` (`[id]/page.tsx:58-98`).

**ATV-12 · Visões rápidas da lista ⚡ M/M (chips = P)**
Nenhuma visão pronta: "Em manutenção", "Em estoque da minha filial", "Sem patrimônio" exigem remontar popovers a cada visita. *Sugestão:* linha de chips-link predefinidos (são `<Link href="/ativos?status=…">`) e, depois, "fixar filtro atual" em `localStorage`.

---

## 5. Itens por quantidade e Pendências

**ITN-01 · Transferir item entre filiais não existe — e o caminho intuitivo corrompe o Total ⚡ A/G**
`TIPOS` não tem transferência e o lote fixa uma filial (`lancar-item-dialog.tsx:45`; `validators/item.ts:129-141`). Mover 10 mouses Matriz→Serra são dois lançamentos desconexos — e a escolha "intuitiva" (Liberação na origem + Entrada no destino) **infla o Total da origem para sempre** (`saida` baixa estoque, não o total — `dominio.ts:241`). O caminho correto (par de ajustes) não é sugerido em lugar nenhum. Com a visão "onde tem sobrando?" lado a lado (F11/I4), remanejar é o passo seguinte natural. *Sugestão:* preset "Transferir entre filiais" no dialog (origem, destino, itens) gravando o par de ajustes com observações cruzadas na mesma submissão, validando saldo na origem.

**ITN-02 · Histórico esconde colaborador e autor 🎨 M/M**
`colaborador` é digitado no lançamento e buscado pela query (`queries/itens.ts:333`) mas nunca exibido — numa Liberação, "quem levou" só existe no CSV; `criado_por` nem entra no select. *Sugestão:* coluna Colaborador (`hidden lg:table-cell`) + autor na `Dica`/dialog de estorno.

**ITN-03 · Histórico sem saldo acumulado nem busca por chamado ⚡ M/M**
(a) Reconstruir "quando zerou?" exige somar ±N de cabeça através de páginas de 20 (`historico-lancamentos.tsx:126`). Quando o filtro tem exatamente 1 item + 1 filial, calcular "Saldo após" no servidor (partindo do saldo atual, desfazendo linha a linha). (b) O chamado é obrigatório em atrelar/devolução mas não há como buscar por ele (`historico-filtros.tsx:45`; `FiltrosHistorico` sem `q`) — "o que saiu no chamado 48211?" não tem resposta na tela.

**ITN-04 · Inventário/contagem periódica não tem fluxo ⚡ M/G**
Conferência física de uma filial = calcular diferenças à mão e digitá-las em lotes de 10 ajustes com justificativa (`MAX_LINHAS_LOTE_ITEM = 10`). É a tarefa que mantém planilha paralela viva. *Sugestão:* modo "Conferência" na visão por filial — coluna "Contado", diff calculado, ajustes gerados em lote com observação padrão.

**ITN-05 · Miudezas de itens 🎨 B–M/P**
(a) Cabeçalhos Total/Estoque/Atrelados/Falta sem explicação na visão consolidada — envolver na `Dica` (a visão por filial já usa; `itens/page.tsx:358`). (b) Quantidade negativa do ajuste é inacessível no teclado numérico do iOS (`inputMode="numeric"` sem tecla de menos; `lancar-item-dialog.tsx:382`) — alternador "+ Acrescentar / − Baixar" resolve melhor. (c) Estorno sem campo de motivo — a trilha registra o inverso, não o porquê (`actions/itens.ts:118-120`). (d) Combobox do lançamento não mostra o saldo do item na filial — escolhe-se às cegas e o erro do trigger chega depois do carrinho montado (`item-combobox.tsx:222`).

**PND-01 · Patrimônio e triagem não têm ação na fila 🔀 A/M**
Na coluna Ação, só `termo` e `itens` têm botão (`fila-pendencias-tabela.tsx:188`); resolver um patrimônio custa: linha → ficha → menu ⋯ → "Definir patrimônio" → voltar pelo back. *Sugestão:* embutir `CorrigirPatrimonioDialog` na linha (padrão do termo) e, para `triagem`, botão "Movimentar" → `/movimentacoes/nova?ativo=<id>` (o preset já é aceito).

**PND-02 · Confirmar assinatura não trabalha em lote ⚡ M/M**
A seleção múltipla filtra `tipo === 'itens'` (`fila-pendencias-tabela.tsx:51`); a pilha de termos assinados do mutirão volta um a um, com a mesma data. *Sugestão:* estender o checkbox aos termos + "Confirmar assinatura (N)" com data única (a action espelha `resolverPendenciaItem`, que já opera sobre `ids[]`).

**PND-03 · Chips de contagem não são clicáveis 🎨 M/P**
"12 termos pendentes · 3 conflitos" são `<span>` estáticos (`pendencias-chips.tsx:30`) tanto em `/pendencias` quanto no relatório (onde os KPI tiles viraram link na F16 e os chips não — `corpo-relatorio-v2.tsx:191-196`). *Sugestão:* prop `href` opcional por chip (operador+ao vivo; viewer/snapshot seguem span), apontando para `/pendencias?tipo=…`.

**PND-04 · A fila não conta o porquê nem o peso da idade 🎨 M/P**
(a) `p.pendencia` (texto) é buscado e nunca renderizado — "Patrimônio" e "Outra" são baldes opacos (`fila-pendencias-tabela.tsx:158`). (b) A fila ordena da mais antiga para a mais nova, mas "há 94 dias" e "há 2 dias" têm o mesmo cinza (`:184`) — badge âmbar/vermelho acima de um limiar (linguagem do "repor"). (c) O link da linha vira "—" justamente no balde sem patrimônio (`:172`) — alvo minúsculo e mudo para leitor de tela; usar "sem patrimônio — abrir ficha" ou linkar o modelo.

**PND-05 · Pendência de item resolvida é definitiva — nem o dev reabre 🔀 M/M**
"É definitivo." (`resolver-pendencia-item-dialog.tsx:92`; comentário: "reabrir = backlog"). Desfecho errado (baixa no lugar de recuperado; id a mais no lote) não tem correção em camada nenhuma — o termo tem o Desfazer, a pendência de item não. *Sugestão:* "Reabrir pendência" (nível admin) espelhando o desfazer do termo, com rastro.

**PND-06 · Mesa de conflitos: semântica da marcação e barra fora da viewport 🎨 M/P**
(a) Marcar a caixa é **condenar** o cadastro — mas o `aria-label` é "Selecionar o cadastro de {filial}" e nada explica antes da primeira marcação (`mesa-conflitos.tsx:228`); para admin não-técnico, marcar "o certo" é leitura natural e é a inversa. Linha fixa no topo ("Marque o cadastro errado — a exclusão é do que estiver marcado") + aria-label "Marcar … para exclusão". (b) A barra de lote renderiza acima dos até 20 grupos — selecionar no 15º não dá feedback visível (`:153`); torná-la `sticky bottom`. (c) "Ficha" tem ícone de link externo mas navega na mesma aba, derrubando seleção e rolagem (`:233`) — `target="_blank"` honra o ícone e preserva a mesa.

**PND-07 · Miudezas da fila 🎨 B/P**
(a) Subtítulo não cita patrimônio nem conflitos (`pendencias/page.tsx:212`). (b) Abas sem `aria-pressed`/`aria-current` (`pendencias-filtros.tsx:87`; `/itens` já faz certo). (c) "Selecionar todos" sem estado `indeterminate` (fila e mesa). (d) 8 colunas sempre visíveis no mobile — ação só após rolagem horizontal (aplicar o padrão de `historico-lancamentos`).

---

## 6. Relatórios e visualizador por senha

**REL-01 · A impressão perde colunas inteiras 🎨 A/M**
Papel A4 ≈ viewport < `lg`: Marca/Modelo e Colab./Setor (`hidden lg:table-cell`) e Termo/Obs. (`hidden xl:table-cell`) **não saem impressos** (`tabela-saidas.tsx:128-135` e irmãs), e a linha expansível que as revelaria é `print:hidden` (`linha-expansivel.tsx:80`). Grep confirma 0 `print:table-cell` no repo. O relatório impresso — o substituto do e-mail arquivável — sai sem colaborador, termo e observação. *Sugestão:* `print:table-cell` nas colunas ocultas (+ `print:text-[11px]`) ou imprimir a `LinhaDetalhe`.

**REL-02 · Trocar período apaga filtros e busca das tabelas 🔀 M/P**
`aplicarPreset`/`aplicarCustom` montam `new URLSearchParams({ preset })` do zero (`periodo-filtro.tsx:47`, `:53`), descartando `sd.*`/`tr.q`…; as tabs de filial preservam (`filial-tabs.tsx:32-34`) e `gerados-filtro.tsx:33-38` documenta o padrão certo. *Sugestão:* partir da query atual e sobrescrever só `preset/de/ate`.

**REL-03 · Falta o preset "Semana passada" ⚡ M/P**
`PRESETS = semana | 30dias | ano | tudo` (`lib/relatorios/periodo.ts:36-41`). O sistema substitui um e-mail **semanal**: na segunda-feira, os números da semana fechada exigem "Personalizado" com duas datas — `semanaUtilCorrente()` já existe, falta a variante −1. (Toca a decisão aberta T11 — se resolver os dois juntos, registrar.)

**REL-04 · Gerar snapshot: sem aviso de duplicata e ignorando o período em tela 🔀 M/M**
(a) Nada checa se o período já tem versão — o operador descobre a v3 no toast; a versão é `max+1` em duas queries sem lock (`actions/relatorios.ts:99-113`), dois operadores geram duplicata em silêncio. (b) O dialog abre sempre com a semana útil corrente (`gerar-relatorio-dialog.tsx:44-45`), não com o período que o operador está analisando — armadilha tela × snapshot. *Sugestão:* consulta leve ao abrir ("Já existe a v2 deste período — você criará a v3"), pré-preencher com o período ativo + atalho "Usar semana corrente".

**REL-05 · Arquivo de gerados cresce sem paginação e sem marcar "superada" 🎨 M/M**
`listarRelatoriosGerados` traz tudo (`queries/gerados.ts:84-87`) — ~6 snapshots/semana passam de 300 linhas/ano; e uma v1 superada é idêntica à vigente na lista (o aviso só existe depois de abrir). *Sugestão:* paginação/carregar-mais + badge "superada" calculado em memória + navegação anterior/próximo no próprio snapshot (`gerados/[id]` só tem "← Relatórios gerados") e link "ver este período no ao vivo".

**REL-06 · Gráficos: tooltip ausente nos empilhados/divergentes 🎨 M/P**
`BarrasEmpilhadas`/`BarrasDivergentes` não montam `ChartTooltip` (diferente da série e das horizontais), e `rotuloSegmento` esconde valores < 2 (`barras-empilhadas.tsx:4`, `:20-23`) — segmento de valor 1 não é legível em canal nenhum; âmbar × laranja vizinhos são quase iguais para daltônicos e o tooltip seria o desempate. Na série, rótulos em todo ponto colidem em períodos longos e não há eixo Y (`grafico-mov-serie.tsx:52-83`; o mockup previa réguas).

**REL-07 · Δ dos KPIs não mostra o valor anterior ⚡ M/P**
Só seta+percentual (`kpi-tiles.tsx:28-45`); `kpisAnterior` está no snapshot v2 e não aparece, nem a janela de comparação. *Sugestão:* `Dica` com "Anterior: N (dd/MM–dd/MM) → atual: M".

**REL-08 · "Copiar texto" não inclui a lista que abria o e-mail ⚡ M/M**
`gerarTextoResumo` monta só saídas+devoluções (`lib/relatorios/resumo.ts:59-69`); o mockup registra que "Disponíveis por modelo" é a lista que **abre** o e-mail semanal — quem cola o resumo ainda transcreve o estoque à mão. *Sugestão:* estender o texto com "Em estoque (N): 16× Modelo A…" + linha de KPIs (função pura, testada).

**REL-09 · Âncoras: sem "Resumo", e grupo recolhido não abre no mobile 🎨 M/P**
(a) A barra sticky não tem chip para "Resumo do período" nem "Observações", e o card do resumo nem recebe `id` (`chips-ancora.tsx:11-17`) — sem permalink para a seção mais procurada. (b) Em <768px Acessórios/Componentes nascem fechados e a âncora rola até título com corpo oculto — nada expande (`grupo-colapsavel.tsx:26`, `:51`); abrir quando `location.hash === '#'+id`.

**REL-10 · Verde reprovado em AA sobreviveu em duas telas 🎨 M/P**
A F19 corrigiu `text-green-600` (3,22:1) para `green-700` só em `CLASSE_COR_DELTA`; a tabela "Saldo por item" (`tabela-itens-grupo.tsx:111`) e o "Retorno:" da manutenção (`manutencao-casos.tsx:104`) continuam `green-600` em texto pequeno. *Sugestão:* importar de `CLASSE_COR_DELTA` como fonte única.

**REL-11 · Viewer: "Ao vivo" sempre volta ao Consolidado ⚡ B–M/P**
`viewer-nav.tsx:12-19` é `href` fixo `/relatorios/geral`; o gestor de UMA filial re-seleciona a aba a cada volta (o operador ganhou destino por cargo na F25; o viewer não). *Sugestão:* memorizar o último `/relatorios/[slug]` em `sessionStorage`.

**REL-12 · Porta da senha: `autoComplete="off"` e beco sem senha 🎨 B/P**
Impede o gerenciador de senhas de guardar a credencial de longa vida (`acesso-form.tsx:41`) — com a sessão de 24 h, redigita-se de memória toda manhã; e não há microcopy "Não tem a senha? Solicite à TI". *Sugestão:* `autoComplete="current-password"` + uma linha de socorro.

**REL-13 · Miudezas do relatório 🎨 B/P**
(a) Observação truncada imprime cortada — tooltip não existe no papel (`celulas.tsx:134-150`; `print:whitespace-normal`). (b) Sem carimbo "Atualizado às HH:mm" (o mockup previa; só um `title` de hover no auto-refresh). (c) `animate-ping` do "ao vivo" sem `motion-reduce:animate-none` (`realtime-refresh.tsx:52`) e dot `bg-green-500` fora dos tokens/dark. (d) Snapshot congelado sem atalho para o ao vivo do mesmo período.

---

## 7. Administração, import e área dev

**ADM-01 · Excluir item do catálogo executa no clique, sem confirmação 🎨 A/P**
Todo caminho destrutivo confirma (padrão OS-F9 T4, foco no Cancelar); aqui "Excluir" chama `remover()` direto, no rodapé onde mora o Cancelar (`item-dialog.tsx:225`, função em `:97`). *Sugestão:* confirmação no padrão da casa ou dupla confirmação no próprio botão.

**ADM-02 · Convite sem estado "aguardando primeiro acesso" nem reobter link 🔀 M/M**
Convidado que nunca ativou fica indistinguível de usuário ativo ("Sem nome" · Ativo, `usuarios-tabela.tsx:115`, `:174-203`); reenviar o acesso exige deduzir que se deve reabrir "Convidar usuário" e **redigitar o e-mail** (o ramo de reenvio existe em `actions/admin.ts:192-235`). *Sugestão:* badge "aguardando primeiro acesso" (`last_sign_in_at` null) + ação por linha "Gerar novo link".

**ADM-03 · Tabelas admin sem busca; recém-convidado entra no fim 🎨 M/M**
Usuários ordenam `created_at asc` (`queries/admin.ts:102`) — a linha nova (com o link recém-gerado) está no fundo; nenhuma tabela administrativa tem filtro por nome/e-mail/cargo. *Sugestão:* filtro client-side em Usuários e Itens + inverter ordenação.

**ADM-04 · Kits: sem preview do efeito e sem duplicar ⚡ M/P–M**
(a) O admin preenche 5 campos sem ver o que o operador recebe no "Aplicar kit" (`kit-dialog.tsx:186`) — bloco "Como o kit aplica" montado ao vivo com o vocabulário real (`rotuloTipo`/`rotuloTermo`). (b) Não há "Duplicar" (`admin/kits/page.tsx:117`) e kit não se exclui — errar na criação gera lixo permanente; duplicar com nome "Cópia de {nome}" é P.

**ADM-05 · Senha de acesso nasce sem o link junto — e não há como testá-la depois ⚡ M/P–M**
A tela pós-criação instrui "entregue junto do link do relatório" mas não fornece o link (`criar-senha-dialog.tsx:100`); e não existe como conferir "essa senha ainda é a que passei?" — só revogar e recriar. *Sugestão:* "Copiar link + senha" (mensagem pronta) e ação "Testar senha…" contra o hash (Server Action `exigirAdmin`).

**ADM-06 · "Novo import" mantém a filial anterior selecionada 🔀 M/P**
`recomecar()` zera arquivo/prévia/correções/confirmação — mas não `filialId` (`importar-wizard.tsx:438-448`). O segundo import em sequência é tipicamente **outra** filial; um "Avançar" apressado com a filial errada pré-marcada, num fluxo que apaga o acervo da filial. *Sugestão:* `setFilialId('')` no recomeçar.

**ADM-07 · Três réguas de confirmação digitada — e o import não diz quando não confere 🎨 M/P**
Import exige igualdade exata e o botão fica desabilitado **sem mensagem** ("linhares" ≠ "Linhares", `importar-wizard.tsx:913`); apagar-conta tolera caixa (`apagar-usuario-dialog.tsx:52`); a Zona destrutiva tem o helper `confirmacaoConfere` (trim+caixa, `validators/dev-destrutivo.ts:87`). *Sugestão:* adotar o helper nas três + dica "O texto não confere — digite exatamente {nome}".

**ADM-08 · Slug de filial editável sem aviso de que os links quebram 🔀 M/P**
O dialog diz que o slug entra na URL do relatório (`filial-dialog.tsx:120-128`) — e o público dessas URLs são gestores com senha e favorito salvo. Renomear derruba silenciosamente os favoritos ("a senha parou de funcionar"). *Sugestão:* aviso âmbar quando o slug editado difere do original.

**ADM-09 · Import: microcopy e feedback 🎨 B/P**
(a) Stepper com "Upload"/"Preview" numa UI 100% pt-BR (`importar-wizard.tsx:52`) → "Enviar arquivo"/"Conferência". (b) Análise de `.xlsx` grande sem `role="status"` nem spinner além do label do botão (`:554`, `:604-606`). (c) CSV de erros exporta o tipo cru (`patrimonio_invalido`) em vez de `rotuloTipoErro` já importado (`:73`). (d) Histórico de imports mostra a contagem de conflitos sem link para a mesa (`admin/importar/page.tsx:100-102`; o passo 5 do wizard tem o atalho, o histórico não). (e) Toggles "Ver as N linhas" sem `aria-expanded`; stepper sem `aria-current="step"`.

**ADM-10 · Microcopy e estados do admin 🎨 B/P**
(a) "Convidar operador" num diálogo que convida qualquer cargo desde a F21 (`convidar-usuario-dialog.tsx:186`). (b) "({N} ativo(s) — o servidor pode bloquear)" para uma recusa que é **certa** (`filial-dialog.tsx:150-153`; a action sempre recusa) — texto assertivo + desabilitar o Salvar. (c) Motivos/Itens/Filiais sem estado vazio (tabela só com cabeçalho; Kits/Senhas tratam). (d) `title` morto em botão desabilitado no caso `eVoceMesmo` (`editar-usuario-dialog.tsx:153`; o próprio arquivo documenta o problema e usa `Dica` no outro caso). (e) Badge verde "Ativo" copiado literal em 5 telas + gramática divergente em Usuários — extrair `<BadgeStatus>`. (f) Motivos sem campo `ordem` (itens têm) — o motivo mais usado fica onde o alfabeto mandar, inclusive no select do passo 2 (requer migration aditiva pequena).

**DEV-01 · /dev descarta 2 das 9 checagens de integridade em silêncio 🔀 A/P**
A RPC vigente devolve 9 chaves (`0098:414` `arquivo_termo_orfao`, `:422` `conflito_entre_filiais`), mas o catálogo `CHECAGENS` tem 7 (`queries/dev.ts:156-198`) e `rodarChecagens()` itera sobre o catálogo — os resultados das duas chaves extras são descartados sem aviso (a tela ainda diz "São 7 checagens"). *Sugestão:* acrescentar as duas entradas e, como rede permanente, renderizar no fim qualquer chave devolvida pela RPC que não esteja no catálogo.

**DEV-02 · Zona destrutiva: "filial 3" na escolha do ativo a apagar 🎨 A/P**
A lista de candidatos exibe `filial {c.filial_id}` cru (`painel-ativo.tsx:123`) — e o próprio componente avisa que a busca existe para distinguir gêmeos, cujo caso típico pós-F24 é o conflito **entre filiais**. A página já carrega `listarFiliaisParaVinculo()` e não passa ao painel. *Sugestão:* mapear id→nome. Junto: a prévia do reset lista chaves cruas ("lancamentos item", `painel-reset.tsx:136`) — mapa chave→rótulo pt-BR.

---

## 8. Transversal — a11y, consistência, feedback

Números-base medidos: 79 `aria-label` · 16 `aria-invalid` · 12 `role=status/alert` · 188 `toast.*` · 21 usos de `EstadoVazio` · 13 `loading.tsx` · 5 `error.tsx` · 0 `global-error.tsx` · 162 `tabular-nums` · 108 `dark:` · h1 idêntico em 17/18 páginas.

**UXG-01 · `global-error.tsx` ausente; login/auth sem boundary 🎨 A/P**
Erro fora do grupo (app) — inclusive em `/login`, `/auth/confirm`, `/auth/definir-senha` — cai na tela default do Next em inglês. O backlog da F13 já apontava; a F20B criou só o `(app)/error.tsx`. *Sugestão:* `src/app/global-error.tsx` com `<html lang="pt-BR">` e a linguagem do `PainelErro`.

**UXG-02 · Todo modal anuncia "Close" em inglês 🎨 M/P**
`<span className="sr-only">Close</span>` em `ui/dialog.tsx:82` e `ui/sheet.tsx:83`, herdado do shadcn, num app 100% pt-BR — 52 arquivos usam esses primitives. Editar `ui/` aqui tem motivo documentável. Junto: o X dos modais tem 28px (`size-7`) sem o bump mobile `size-10 sm:size-7` que o app usa em 12 outros pontos.

**UXG-03 · Alvos <40px do backlog F13 continuam abertos 🎨 M/M**
Conferido no código atual: ordenação (`ativos-table.tsx:222-232`, ~28px), stepper do wizard (`nova-movimentacao-form.tsx:1085-1095`), 11+ botões `h-7/h-8` fixos (fila de pendências, termos da ficha, linha do tempo…) e os filtros das listas (`h-8` sem compensação). O padrão corretivo já existe no repo (`h-10 sm:h-8`, 12 usos) — falta varrer.

**UXG-04 · Navs roláveis sem affordance de rolagem 🎨 M/P**
`filial-tabs`, `admin-nav` e `chips-ancora` escondem a scrollbar (`[scrollbar-width:none]`) sem fade/chevron — em 360px, "Itens" e "Importar" simplesmente não existem para quem não adivinha que a fileira rola (também era backlog F13). *Sugestão:* máscara de gradiente (`mask-image`) num wrapper comum.

**UXG-05 · `role="alert"` existe no wizard e falta nos irmãos 🎨 M/P**
Caixas de erro pós-submit sem `role`/`aria-live` em `nova-compra-form` (×2), `devolucao-fornecedor-form`, `colar-lista-dialog`, `filial-dialog`, `apagar-usuario-dialog`, `mesa-conflitos` (17 arquivos com `text-destructive` têm 0 `role="alert"`). Replicar o padrão que o wizard/login/import já usam.

**UXG-06 · Skeletons e loading mudos; skeleton trocado em /dev 🎨 M/P**
0 `aria`/`sr-only` nos 13 `loading.tsx` — leitor de tela não ouve "Carregando…" (a barra de progresso é `aria-hidden` de propósito e delega ao loading, que não anuncia). E `/dev`+`/dev/destrutivo` caem no skeleton do Dashboard; `ativos/novo` herda skeleton de lista. *Sugestão:* `role="status"` + `sr-only` num wrapper comum; `dev/loading.tsx` próprio.

**UXG-07 · Contraste: o script existe, mas mede 44 pares e está fora do CI ⚡ M/P**
`scripts/contraste.mjs` cobre só os pares tocados por revisões passadas — faltam o dark das pílulas violet/cyan/orange/slate/teal, `muted-foreground`×`background` (o texto mais usado), `primary`×`primary-foreground` (todo botão), `brand-amarelo`×`brand-dark` (header); e o CI não o roda (o script já prevê `exit 1`). *Sugestão:* registrar os pares + step no CI — custo zero.

**UXG-08 · Feedbacks ausentes pontuais 🎨 B/P**
(a) `copiar-patrimonio` falha em silêncio total sem `navigator.clipboard` ou permissão negada (`:36-46`) — `toast.error('Não foi possível copiar…')`. (b) Sign-out sem estado pending nos dois shells (`user-menu.tsx:94`, `viewer-header.tsx:22`) — os únicos submits sem anti-duplo-clique do app. (c) `animate-pulse` do skeleton e `animate-ping` do realtime sem `motion-reduce`.

**UXG-09 · Consistência menor 🎨 B/P**
(a) "Tente novamente" ×24 vs "Tente de novo" ×20 — escolher uma. (b) Pluralização "(s)" em 8 mensagens com helper de plural já existente. (c) `EstadoVazio` reimplementado à mão em 4 telas (gerados, linha-do-tempo, auditoria, termos-da-ficha). (d) Espaçamento raiz varia `space-y-4/5/6` sem critério. (e) Params de paginação em inglês/crípticos (`page`, `pp`, `ord`) vs domínio em pt — registrar a convenção em `ARQUITETURA.md`. (f) `<Label>` órfão como título de grupo em 4 pontos (o padrão `role="group"+aria-labelledby` existe em 3 dialogs). (g) `TableHead` sem `scope="col"` (1 linha em `ui/table.tsx`) e 0 `<caption>`. (h) Páginas públicas sem `<h1>` (login, acesso, confirm). (i) 3 `<nav>` sem `aria-label`; sem skip-link "Pular para o conteúdo" (`(app)/layout.tsx:111-131`); foco no chrome escuro com 3 tratamentos (o do `viewer-nav` é o certo). (j) 45 usos de `amber-*` hardcoded convivendo com o token `--warning` calibrado.

**UXG-10 · Descoberta e memória da paleta ⚡ M/P–M**
(a) A única porta visível da busca global é um botão-fantasma de 28px no header (o centro do header fica vazio em desktop) — trocar por campo-placebo `w-64` "Buscar ativo, tela ou ação…" (`app-header.tsx:86-105`). (b) A paleta abre sempre vazia — "Recentes" com os últimos ~5 ativos abertos (padrão `lista-visitada.ts` já existe). (c) Faltam ações: "Novo equipamento" não está na paleta (o dashboard oferece; `paleta-comandos.tsx:133-154`). (d) `?` navega para /ajuda em vez de abrir um overlay de atalhos — e não existe cheat-sheet nenhum. (e) A marca no header não é link para o início (`marca.tsx:20` é `<div>`; convenção universal logo→home — no shell do viewer, → `/relatorios/geral`).

**UXG-11 · Limitações auto-documentadas na ajuda = backlog pronto ⚡ B–M/P**
`lib/ajuda/conteudo/limites-e-atalhos.ts` admite: só `/ativos` escolhe tamanho de página (movimentações=30 e histórico=20 fixos); os limites numéricos da doc são literais digitados (risco de divergir — exportar constantes); o visualizador por senha não tem nenhum atalho; o `L` ainda dispara com a janela "Estornar lançamento" aberta, ao contrário de N e "?" (inconsistência admitida em `limites-e-atalhos.ts:98`); Ctrl+K não abre sobre dialog. Cada item é pequeno e o texto de ajuda para atualizar já existe.

**UXG-12 · User-menu não responde "por que não vejo o botão?" ⚡ M/P**
Mostra nome+cargo, mas para operador a resposta completa depende do **vínculo** de filiais — que está resolvido no shell (`acesso.ts:17-27`) e não desce ao menu; o e-mail da conta também não aparece em lugar nenhum. *Sugestão:* e-mail em `text-xs` + linha "Escreve em: Matriz, Serra".

**UXG-13 · Sidebar plana e sem colapso 🎨 B/P–M**
(a) "Administração"/"Desenvolvedor" colados em "Relatórios"/"Ajuda" sem separador (`sidebar-nav.tsx:34-65`) — um `border-t` antes dos grupos raros basta. (b) 240px fixos sem recolher em notebooks 1366×768 — toggle só-ícones com preferência em `localStorage` (padrão do tema), atalho `[`.

**UXG-14 · Erro sem identificador para o chamado ⚡ B/P**
Os boundaries dizem "avise o administrador" mas o `digest` vai só ao console (`(app)/error.tsx:22-24`) — o chamado chega como "deu erro" e não há como correlacionar com o log da Vercel. *Sugestão:* "Código do erro: `abc123` [Copiar]" quando `error.digest` existir (hash opaco, não vaza infra).

---

## 9. O que NÃO está sendo sugerido (decisões vigentes respeitadas)

Modo *Atualizar* do import e qualquer sincronização automática (entrada 100% manual é regra); upload do PDF assinado do termo (adiado — F5 item 5.5); alertas/e-mail (já previstos na F5 — os itens REL-03/REL-08 são complementares, não substitutos); papéis/permissões e RLS (ADR-002 — nada aqui toca o modelo de acesso); dependência fora da stack fechada (**zero** sugestão exige lib nova; a única migration aditiva proposta é `motivos.ordem`, mais RPC/constraint opcionais em PND-05 e REL-04); console de SQL na /dev (proibição mantida — DEV-01/02 são só UI sobre RPCs existentes). Os itens **A8** (compra com patrimônio pendente) e **T11** (duas semanas) continuam sendo decisão do Johnny — REL-03 tangencia T11 e convém decidir junto.

Também não repito a **dívida técnica** já auditada (`docs/DIVIDA-TECNICA.md`): K (react-hook-form nos forms centrais) é pré-requisito natural de MOV-01b/ATV-09a; E (componentes gigantes do import) casa com ADM-09 se o import for tocado — vale fazer na mesma ordem.

## 10. Sugestão de empacotamento (3 ondas, no modelo F9–F11)

**Onda A — "Costuras e segurança de operação" (≈1 fase, zero migration):** FLX-01..05 · MOV-01a/04/07/08/09/13/14 · ATV-01/05 · PND-03 · REL-02/10/13a · ADM-01/06/07 · DEV-01/02 · UXG-01/02/08. Só P's de retorno alto; metade é correção de percepção de erro.

**Onda B — "Rotina diária" (≈1–2 fases):** MOV-02/03/05/06/10/11/12 · ATV-02/06/07/08/09/10/12 · PND-01/02/04/05/06 · ITN-02/03/05 · REL-03/04/05/06/07/08/09 · ADM-02/03/04/05 · UXG-03/04/05/06/07/10/12.

**Onda C — "Recursos novos" (1 fase cada, decidir escopo):** ATV-03 (seleção múltipla → lote), ITN-01 (transferência de itens), ITN-04 (modo conferência/inventário), REL-01 (impressão — pode antecipar para B se o papel for rotina), UXG-13b (sidebar colapsável).

---

*Gerado por análise estática do código (working tree de 07/08/2026, pós-F26). Nenhuma tela foi executada contra produção; contagens vêm de grep e leitura direta. Cada achado cita arquivo:linha verificados — se algum divergir do working tree atual, a causa provável é commit posterior a 04/08.*

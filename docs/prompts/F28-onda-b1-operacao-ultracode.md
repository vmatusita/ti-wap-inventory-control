ultracode

# Missão

Executar a **primeira metade da Onda B** da análise de UX de 07/08/2026 (`docs/ANALISE-UX-2026-08-07.md`, §10 — "Rotina diária"): os **22 itens das telas de operação** — movimentações, ativos, pendências e itens — que tiram retrabalho do dia a dia do operador. Sem dependência nova; migration só se inevitável (regra no escopo). Ao final: `npm run lint`, `npm run test` e `npm run build` limpos, documentação atualizada e **main pushada** (a Vercel deploya sozinha). Esta é a ordem de serviço **F28**. (A segunda metade — relatórios, admin e base global — é a F29, outra ordem; não a antecipe.)

# Contexto

- Projeto **Estoque TI WAP** (Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · Supabase). Regras permanentes de `@CLAUDE.md` valem inteiras: modo autônomo, stack fechada, UI/commits pt-BR, NUNCA dados reais em fixture/teste/screenshot, custo R$ 0.
- **Fonte:** `@docs/ANALISE-UX-2026-08-07.md` (seções 3–5 detalham cada item; §10 define a onda). Os arquivo:linha foram verificados em 07/08/2026 — se a linha se moveu (a F27 mexeu em vários desses arquivos), vale a **intenção**; ancore pelo trecho citado.
- **Pressupõe a F27 aplicada** (foco no box de erros, foco no painel de sucesso, `next` no login etc.). Se algo da F27 não estiver no código, não refaça a F27 — implemente o item desta ordem do jeito que o código atual pedir e registre a divergência.
- Comandos: `npm run lint` · `npm run test` (Vitest, funções puras) · `npm run build`. Os testes da ajuda (F20) travam frases literais: texto/comportamento documentado que mudar aqui exige atualizar a página em `src/lib/ajuda/conteudo/` — o teste quebrando é o sistema funcionando.
- Padrões de referência do repo: filtros na URL como `ativos-filtros.tsx`/`url-params.ts` (inclusive `temFiltro`/`temRecorteFilial` da F25); chips de data `nova/chips-data.tsx`; pílulas por tipo `TIPO_PILL` em `lib/dominio.ts`; resolução em lote `resolverPendenciaItem` (`actions/pendencias.ts`, opera sobre `ids[]`); dialogs com RHF como `editar-ativo-dialog.tsx`; rascunho `nova/rascunho.ts`.

# Escopo — os 22 itens (implemente todos)

## Bloco 1 · Wizard e lista de movimentações (MOV)

1. **MOV-02 — A Revisão mostra o que será gravado.** O passo 3 exibe só Patrimônio · Movimentação · Destino/Motivo (`nova/passo-revisao.tsx:50-75`, `212-225`) — **a data não aparece**, nem termo+data, chamado, observação, status resultante ou itens faltantes; e as colunas repetem o mesmo valor N vezes. Monte um card-resumo da config compartilhada acima da tabela (Data em destaque, Motivo, Colaborador/Setor, Termo e data do termo, Chamado, Observação, Status novo, checklist de faltantes) — com a contrapartida da troca mostrando o resumo **das duas metades** — e reduza a tabela à lista de ativos. Extraia a montagem do resumo para função pura testável.
2. **MOV-03 — Aviso antecipado de vínculo de filial.** O operador sem vínculo só descobre no submit, que recusa o lote inteiro (`actions/movimentacoes.ts:229-245` — regra correta, não mude). A página já tem `getOperador()`: passe `filiaisEscrita` ao form e, já no passo 1, marque com aviso âmbar todo item de filial fora do vínculo ("Você não escreve em {filial} — o registro será recusado"), inclusive na contrapartida; sem travar nada (a regra continua no servidor). Cargos com escrita ampla não veem aviso nenhum.
3. **MOV-05 — "O que registrei hoje?" na lista.** `/movimentacoes` não tem chips de período nem filtro por autor (`lista-filtros.tsx:208-243`; `queries/movimentacoes.ts:624-664` não filtra `criado_por`). Acrescente chips **Hoje · Ontem · 7 dias** que setam `de`/`ate` na URL (reaproveite a lógica de `chips-data.tsx`) e um filtro "Minhas" (`?autor=eu`, resolvido no servidor para o uid da sessão — nunca exponha uid na URL). Query, contagem e CSV respeitam o filtro.
4. **MOV-06 — Lote visível e "Duplicar" na linha.** Um lote de 12 vira 12 linhas idênticas sem hora nem vínculo (`lista-movimentacoes.tsx:88-115`; `created_at` já vem na query). Exiba a hora (coluna estreita ou `title`), aplique um separador visual leve quando autor+minuto mudam (agrupamento derivado, sem coluna nova no banco) e adicione ação "Duplicar" por linha → `/movimentacoes/nova?duplicar=<id>` (hoje só existe na linha do tempo da ficha).
5. **MOV-10 — "Registrar outro lote com os mesmos campos".** O painel de sucesso só oferece reiniciar do zero (`painel-sucesso.tsx:332-334`), contrariando o próprio aviso do colar-lista ("Registre o resto em outro lote"). Segundo botão que chama `reiniciar({ manterConfig: true })` — limpa itens/contrapartida/erros e preserva config + statusResultante.
6. **MOV-11 — Banner de rascunho informativo.** "3 ativos" sem dizer quais, de que tipo, de quando (`rascunho.ts:46-52`; banner em `nova-movimentacao-form.tsx:1046-1074`). Grave no rascunho um snapshot só-para-exibição (`patrimonios: string[]`, `tipo`, `salvoEm: ISO`) e mostre "3 ativos (WAP0001234, WAP0001250…) · Saída · salvo há 2 h". Restauração continua re-buscando por id; rascunho **antigo** (sem os campos novos) restaura sem erro — trave por teste, como a F26 fez.
7. **MOV-12 — Devolução ao fornecedor no dialeto do wizard.** No fluxo irmão (`devolucao-fornecedor-form.tsx`): obrigatórios do substituto só por toast que some (`:86-88`), box de erro sem `role="alert"` (`:428-440`), data sem chips Hoje/Ontem. Reuse `ChipsData`, dê `role="alert"` ao box e converta a pré-validação do substituto em erros inline por campo (marcação + mensagem adjacente), mantendo o toast como resumo se quiser.

## Bloco 2 · Ativos — lista, ficha e compra (ATV)

8. **ATV-02 — Pendência visível na lista.** O select da lista não traz `pendencia` (`queries/ativos.ts:20-32`) e nenhuma linha sinaliza termo pendente/sem service tag/conflito. Inclua o campo, renderize um indicador âmbar discreto (ícone com `title`/`Dica` do texto) junto ao patrimônio ou status, e acrescente o chip de filtro "Com pendência" ao lado do "Sem patrimônio" (`ativos-filtros.tsx:239-249`, mesmo padrão `aria-pressed`; filtro aplicado no servidor). CSV pode ganhar a coluna — registre a escolha.
9. **ATV-06 — Service tag sem coluna que pisca.** `showServiceTag` é calculado **por página** (`queries/ativos.ts:59-61`) — a coluna aparece/some ao paginar — e é `hidden lg:table-cell` (`ativos-table.tsx:47`), sumindo no mobile onde desambigua. Troque a coluna condicional por **sublinha** da célula de patrimônio (`text-xs text-muted-foreground`) exibida quando o patrimônio se repete na página — visível em qualquer largura, sem salto de layout. Remova o mecanismo antigo se ficar morto.
10. **ATV-07 — Pontes ficha→ação.** (a) No painel de sucesso da compra com **1** ativo criado, botão "Movimentar agora" → `/movimentacoes/nova?ativo=<id>` (`nova-compra-form.tsx:601-606`). (b) Na ficha, colaborador vira link "ver todos os ativos deste colaborador" (`/ativos?q=<nome>&filial=todas`) e marca+modelo idem (`[id]/page.tsx:249-251`, `:265`). (c) O subtítulo da ficha ganha "· com {colaborador} ({setor})" quando houver detentor (`:133-147`).
11. **ATV-08 — Linha do tempo com cor por tipo.** Todo evento usa o mesmo trilho e badge secundário (`linha-do-tempo.tsx:143-149`). Aplique `TIPO_PILL` (`dominio.ts:159-165` — paleta pronta e aprovada em contraste, usada na lista) ao badge do tipo; opcionalmente ícone por tipo. Anotação (âmbar) e "forçada" continuam distintos como hoje.
12. **ATV-09 — Compra valida perto do campo e no preview.** (a) Obrigatórios falham só por toast (`nova-compra-form.tsx:462-470`): guarde `faltando` em estado, marque os campos (`aria-invalid` + mensagem sob o input) e foque o primeiro. (b) O modo Colar lista não valida o teto de 200 no cliente (`patrimonio.ts:33-83` sem cap; só a Faixa valida): acuse `itens.length > MAX_LOTE_COMPRA` como erro no preview e cite o teto no rótulo da aba.
13. **ATV-10 — Nada de trabalho perdido.** (a) O dialog "Editar dados cadastrais" descarta tudo no Esc/clique-fora sem confirmação (`editar-ativo-dialog.tsx:120-127`): quando `form.formState.isDirty`, intercepte `onInteractOutside`/`onEscapeKeyDown` e confirme ("Descartar alterações?"). (b) A compra não tem rascunho — lista de até 200 patrimônios em `useState` puro: persista em `sessionStorage` no padrão de `nova/rascunho.ts` (texto da lista, faixa, campos do modelo), restaure no mount com banner, limpe no sucesso.
14. **ATV-12 — Visões rápidas na lista.** Linha de chips-link acima da tabela com 3–4 visões de rotina prontas — ex.: "Em manutenção", "Em estoque", "Sem patrimônio", "Com pendência" (herda do item 8) — cada uma um `<Link>` para a URL filtrada; ativa fica destacada (mesma linguagem dos chips existentes). Sem persistência de filtro custom nesta fase (fica no backlog).

## Bloco 3 · Pendências (PND)

15. **PND-01 — Ação direta na fila para patrimônio e triagem.** Só termo e itens têm botão na coluna Ação (`fila-pendencias-tabela.tsx:188`). Embuta o `CorrigirPatrimonioDialog` na linha de `patrimonio` (padrão do termo) e, para `triagem`, botão "Movimentar" → `/movimentacoes/nova?ativo=<id>`. Ao resolver, a linha some/atualiza sem F5 (o padrão de revalidação das ações vizinhas).
16. **PND-02 — Confirmar assinatura em lote.** A seleção múltipla aceita só `tipo === 'itens'` (`fila-pendencias-tabela.tsx:51`). Estenda o checkbox às linhas de `termo` e crie "Confirmar assinatura (N)" com **uma data única** para o lote — Server Action espelhando `resolverPendenciaItem` (`actions/pendencias.ts`, que já opera sobre `ids[]`), validação Zod, `exigirEscritaEm` das filiais tocadas, anotação por ativo como o fluxo individual faz. Seleção mista (termos + itens) mostra as duas ações, cada uma sobre o seu subconjunto — deixe isso óbvio na barra.
17. **PND-04 — A fila conta o porquê e o peso.** (a) Renderize `p.pendencia` truncado sob o badge de tipo (o dado já vem na query; `Dica` com o texto completo) — "Patrimônio" e "Outra" deixam de ser opacos. (b) "Desde": badge âmbar acima de 30 dias e vermelho acima de 90 (limiar como constante em `lib/pendencias/`, com teste). (c) O link da linha vira "—" quando não há patrimônio (`:172`): use "sem patrimônio — abrir ficha" ou linke o modelo.
18. **PND-05 — Reabrir pendência de item.** Hoje o desfecho é definitivo e ninguém reabre (comentário em `resolver-pendencia-item-dialog.tsx:31`; o termo tem o Desfazer, a pendência de item não). Crie "Reabrir pendência" (nível administrador) na ficha, junto de onde a resolvida aparece: volta a `aberta`, limpa o desfecho, grava anotação com autor+justificativa. **Prefira resolver na camada de app** (action + update); se as policies/estrutura exigirem migration ou RPC nova, escreva-a **aditiva**, aplique pelo caminho do `docs/RUNBOOK-BANCO.md` (ensaio → produção) se o ambiente tiver o acesso — sem acesso, deixe a migration escrita + nota de handoff no relatório e entregue a UI pronta atrás da action (falhando com mensagem honesta).
19. **PND-06 — Mesa de conflitos sem armadilhas.** (a) Marcar a caixa é **condenar** o cadastro, e nada diz isso antes (`mesa-conflitos.tsx:228`): linha fixa no topo quando `podeApagar` ("Marque o cadastro **errado** — a exclusão é do que estiver marcado") e `aria-label` "Marcar o cadastro de {filial} para exclusão". (b) A barra de lote fica no topo de até 20 grupos (`:153`): torne-a `sticky bottom` (aparece onde o clique acontece). (c) "Ficha" tem ícone de link externo mas navega na mesma aba e derruba a seleção (`:233`): `target="_blank" rel="noopener"`.

## Bloco 4 · Itens por quantidade (ITN)

20. **ITN-02 — Histórico diz quem.** `colaborador` é digitado no lançamento, vem na query (`queries/itens.ts:333`) e nunca aparece; `criado_por` nem entra no select. Coluna "Colaborador" (`hidden lg:table-cell`) e o autor do lançamento exposto (join com `profiles`, exibido na `Dica` da linha ou no dialog de estorno). CSV ganha as colunas.
21. **ITN-03 — Histórico auditável.** (a) Quando o filtro tem **exatamente 1 item + 1 filial**, calcule no servidor a coluna "Saldo após" (partindo do saldo atual da RPC e desfazendo linha a linha na ordem decrescente — função pura com teste); nos demais recortes a coluna não aparece. (b) Busca `?q` no histórico com `ilike` em chamado/colaborador (sanitização no padrão de `queryPendencias`), respondendo "o que saiu no chamado 48211?".
22. **ITN-05 — Quatro lixas no lançamento.** (a) Cabeçalhos Total/Estoque/Atrelados/Falta da visão consolidada ganham `Dica` de uma linha cada (`itens/page.tsx:358`; a visão por filial já explica). (b) Ajuste no celular: `inputMode="numeric"` não tem tecla de menos no iOS (`lancar-item-dialog.tsx:382`) — quando `tipo === 'ajuste'`, alternador segmentado "+ Acrescentar / − Baixar" por linha aplicando o sinal (some a necessidade de digitar o menos). (c) Estorno ganha campo "Motivo (opcional)" concatenado na observação do inverso ("Estorno: {motivo}"). (d) O combobox do lançamento mostra o saldo do item na filial selecionada à direita de cada opção ("Mouse USB · 14"), atualizando quando a filial muda — o dado vem por query leve, sem travar a digitação.

## Housekeeping

- Commite esta ordem (`docs/prompts/F28-onda-b1-operacao-ultracode.md`) e a F29 (`docs/prompts/F29-onda-b2-relatorios-admin-ultracode.md`) se estiverem untracked; `_claude_tmp/` na raiz, se ainda existir, apague.
- Sujeira de git que não seja sua nem os untracked esperados: não toque; registre.

## Fora (não toque)

- **Itens da F29** (relatórios REL-*, admin ADM-*, transversais UXG-*) e da **Onda C** (ATV-03 seleção múltipla, ITN-01 transferência, ITN-04 inventário, REL-01 impressão): nada deles aqui, por mais adjacente que pareça — backlog no relatório.
- Dependência nova, jamais. Migration: **só** o caminho estreito do item 18, aditiva, pelo runbook; nenhuma outra. Nada destrutivo em banco; `supabase db push` proibido.
- Modelo de acesso, RLS, policies existentes, RPCs existentes, máquina de estados, contagens de relatório: leitura apenas. O recorte de vínculo continua sendo imposto **no servidor** (item 2 é aviso, não gate).
- `src/lib/types/database.ts` (gerado) e `src/components/ui/` (fora de motivo documentado).
- Dados reais em fixture/teste/screenshot: proibição permanente.

# Critérios de aceitação

- Os 22 itens implementados e **autoverificados um a um** (checklist no relatório com evidência por item). Item já resolvido por commit posterior à análise: "já atendido" com prova. Item que crescer demais: núcleo entregue + excedente no backlog, registrado.
- `npm run lint`, `npm run test`, `npm run build` **limpos**, saídas reais no relatório. Funções novas extraíveis têm teste puro (resumo da revisão, snapshot do rascunho com retrocompatibilidade, limiar de idade da pendência, "Saldo após", sinal do ajuste); a contagem total de testes **sobe**.
- `package.json` sem dependência nova; diff de `supabase/` vazio **ou** contendo apenas a migration aditiva do item 18 com ata; nenhum texto novo de UI em inglês; nenhuma contagem/regra de relatório alterada.
- `CHANGELOG.md` (entrada F28 no topo), `README.md` (status), `docs/DECISOES.md` (atas — no mínimo: escolha do agrupamento visual do MOV-06, escopo do CSV no ATV-02, desenho do lote de termos no PND-02, caminho escolhido no PND-05) e páginas de ajuda afetadas (lista de movimentações, pendências, itens, compra) atualizados.
- Commits pequenos pt-BR (`feat(f28): …`), `git pull --rebase` antes do push, **main pushada** com tudo verde. Push bloqueado pelo ambiente: não insista — commits locais + pendência no relatório.

# Verificação — rode de verdade

Após cada bloco: `npm run lint && npm run test`; leia, corrija a **causa raiz**, repita até passar — sem suprimir erro nem desabilitar/deletar teste (teste da ajuda quebrando = atualizar a documentação, não o teste). Ao final: `npm run build` + suíte completa, saídas guardadas. Comportamentos que teste puro não cobre (chips na URL, aviso de vínculo, sticky bar, dialog em lote, combobox com saldo): **roteiro manual** por item no relatório — passos e resultado observado, no padrão F14+. Depois do push, com credenciais no ambiente, rode `node scripts/smoke/smoke-prod.mjs` e cole o resultado; sem credenciais, pendência para o Johnny.

# Autonomia e decisões

Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua: (1) esta ordem; (2) a análise (seções 3–5); (3) `CLAUDE.md`/spec e convenções do código; (4) o mais simples e reversível, registrado em `docs/DECISOES.md`. Divergência análise × código: o código vale, adapte a intenção, registre. Mesma falha após ~3 tentativas: mude de abordagem e registre. Bloqueio real (acesso a banco para o item 18, rede): contorne se seguro; senão siga com o resto e registre a pendência com o que falta.

# Git e segurança

Trabalhe direto na `main` (modo autônomo do projeto; push autorizado pelo Johnny nesta ordem), commits pequenos e frequentes. **PROIBIDO:** force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit alheio, qualquer operação destrutiva em banco de produção, commitar `.env*` ou dado real.

# Como trabalhar

Explore com subagentes paralelos e escreva `PLAN.md` autossuficiente (item → arquivos → ordem) antes de editar. Os quatro blocos são quase disjuntos e podem virar frentes paralelas (worktrees se editarem simultaneamente); dentro do bloco 1, faça MOV-02 antes de MOV-11/MOV-10 (mexem no mesmo trio form/rascunho/painel). Incrementos pequenos, um commit por item ou par correlato, verificação por bloco. Ao final, **revisão adversarial em contexto fresco** contra o checklist dos 22 e os critérios — item resolvido de fato? algo fora do escopo mudou? regressão de comportamento/a11y? — só lacunas de correção ou requisito, não estilo; corrija e re-revise até limpar. Não refatore fora dos pontos tocados (dívidas K/E têm ordem própria).

# Relatório final

`docs/RELATORIO-F28.md` em pt-BR, padrão da casa: o que mudou por item; checklist autoverificado com evidências; decisões (→ `DECISOES.md`); saídas reais de lint/test/build (e smoke, se rodou); roteiro manual executado; pendências e backlog novo; e a seção **"O que este relatório NÃO prova"**. Resposta final: resumo de ~8 linhas — o que entrou, o que ficou, estado do push/deploy, o que o Johnny confere de olho.

# Idioma

Narrativa, plano, relatório, UI e commits em **pt-BR**; identificadores de domínio em português sem acento, utilitários/infra em inglês (convenção do `CLAUDE.md`).

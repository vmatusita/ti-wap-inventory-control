ultracode

# Missão

Executar a **Onda A** da análise de UX de 07/08/2026 (`docs/ANALISE-UX-2026-08-07.md`, §10 — "Costuras e segurança de operação"): os **26 itens** listados abaixo, todos pequenos, **zero migration e zero dependência nova**, deixando `npm run lint`, `npm run test` e `npm run build` limpos, a documentação do projeto atualizada e a **main pushada** (produção deploya sozinha pela Vercel). Esta é a ordem de serviço **F27**.

# Contexto

- Projeto **Estoque TI WAP** (Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · Supabase). As regras permanentes de `@CLAUDE.md` valem inteiras: modo autônomo, stack fechada, UI/commits em pt-BR, NUNCA dados reais em fixture/screenshot, custo R$ 0.
- **Fonte desta ordem:** `@docs/ANALISE-UX-2026-08-07.md` — cada item abaixo cita o ID e o arquivo:linha verificados em 07/08/2026. Se uma linha tiver se movido por commit posterior, vale a **intenção** descrita na análise; ancore pelo trecho de código citado, não pelo número da linha.
- Comandos do projeto: `npm run lint` · `npm run test` (Vitest, ~1.860 testes de funções puras) · `npm run build` (inclui o gate `scripts/verificar-actions-build.mjs`).
- A ajuda (F20) tem testes que travam frases literais das páginas de `src/lib/ajuda/conteudo/`. Se um texto ou comportamento documentado mudar com esta ordem, **atualize a página de ajuda correspondente** — teste de ajuda quebrando é o sistema funcionando, não um empecilho.
- Padrões de referência do próprio repo (siga-os em vez de inventar): foco pós-ação como no encadeamento de termos (`painel-sucesso.tsx`, `proximoRef`); confirmação destrutiva como `senha-acoes.tsx` (padrão OS-F9 T4, foco no Cancelar); `useFormStatus` como `app/auth/confirm/botao-ativar.tsx`; preservação de query na URL como `gerados-filtro.tsx:33-38`; toast de recusa como o da contrapartida no wizard.

# Escopo — os 26 itens (implemente todos)

## Bloco 1 · Reentrada e navegação (FLX)

1. **FLX-01 — `next` nas duas portas.** Operador: os dois redirects para `/login` no proxy descartam a URL (`src/lib/supabase/proxy.ts:74-77` zera `url.search`; `:116-118` nem grava) e `signIn` faz `redirect('/')` fixo (`src/lib/actions/auth.ts:38`). Grave `next=pathname+search` nos redirects, repasse por campo oculto no form de login e redirecione com `destinoSeguro(next)` — o precedente completo já existe no fluxo do visualizador (`proxy.ts:98-112` + `confirmarAcesso`). Visualizador com cookie **expirado**: os redirects sem `next` em `relatorios/[filial]/page.tsx:63`, `(app)/layout.tsx:159`, `relatorios/gerados/page.tsx:31` e `gerados/[id]/page.tsx` passam a carregar o destino atual. Pronto quando: sessão expirada em `/pendencias?filial=3` → login → volta a `/pendencias?filial=3`; visualizador expirado num snapshot → senha → volta ao snapshot.
2. **FLX-02 — "Ver todas" do card de últimas movimentações** aponta para o relatório consolidado (`src/app/(app)/page.tsx:302-312`); troque para `/movimentacoes?filial=todas` (a sentinela pelo mesmo motivo documentado em `LINKS_KPI`).
3. **FLX-03 — Título de documento por página.** `metadata` só existe no root e na ajuda; todas as outras rotas exibem "Estoque TI · WAP" (WCAG 2.4.2). No root: `title: { default: 'Estoque TI · WAP', template: '%s · Estoque TI WAP' }`; um `metadata.title` curto por página (Ativos, Movimentações, Itens, Pendências, Relatórios, Relatórios gerados, Administração — uma por tela de `/admin/**`, Desenvolvedor, Ajuda já tem); na ficha, `generateMetadata` com o patrimônio (ou "Ativo sem patrimônio"); `/login` é client — crie `src/app/login/layout.tsx` só com o metadata.
4. **FLX-04 — Card Pendências do dashboard ignora conflitos.** O selo da sidebar soma fila+conflitos (`(app)/layout.tsx:69-73`); o card lê só a fila (`page.tsx:115-117`) e comemora "Nenhuma pendência" com o selo mostrando 2. Inclua `contarConflitosAbertos` no `Promise.all` da página e, quando > 0, renderize linha destacada "N conflito(s) entre filiais — resolver em Pendências" com link, no lugar da frase condicional atual (`:270-275`).
5. **FLX-05 — Devolução ao fornecedor na paleta.** Único acesso hoje é o botão da ficha de ativo em manutenção. Acrescente ao grupo Ações da paleta (`paleta-comandos.tsx:133-154`): "Devolver ao fornecedor" → `/ativos?status=em_manutencao&filial=todas`, apelidos `fornecedor`, `baixa`, `sem conserto` (o gate `podeEscrever` do grupo já serve). Aproveite e acrescente "Novo equipamento" → `/ativos/novo` (apelidos `compra`, `cadastrar`) — é ação de primeira linha do dashboard que a paleta não tem.

## Bloco 2 · Wizard de movimentação (MOV)

6. **MOV-01a — Erros de validação ganham scroll e foco.** `avancarParaRevisao()` só faz `setErros(msgs)` e o box `role="alert"` fica acima do stepper, fora da viewport (`nova-movimentacao-form.tsx:810-814`, `1115-1130`) — o clique em "Revisar" parece inerte. Dê `tabIndex={-1}` + ref ao box e, ao setar erros (validação local E retorno de servidor com `setPasso(2)`), chame `focus()` + `scrollIntoView({ block: 'nearest' })`. (A metade "b" — erro por campo com `aria-invalid` — é da Onda B; NÃO faça agora.)
7. **MOV-04 — Teto de 30 no caminho um-a-um.** `adicionar()` não checa `MAX_LOTE_MOVIMENTACAO` (`nova-movimentacao-form.tsx:364-388`) — dá para passar de 30 pelo combobox e o erro só aparece no Revisar. Guarda no início, contando `itens.length + naOutraMetade.size`, com o mesmo toast de recusa da contrapartida.
8. **MOV-07 — "Repetir última" não aplica motivo de tipo não aplicado.** Quando `tipoValido === false`, o código mantém o tipo atual mas aplica `motivo`/`termo`/`termoData` da última mesmo assim (`nova-movimentacao-form.tsx:691-711`) — grava-se motivo incoerente, invisível (Zod só exige `min(1)`). Aplique os três apenas quando `tipoValido`; senão limpe-os e mantenha o `toast.warning` que já existe.
9. **MOV-08 — Enter duplo fura o aviso de duplicata.** O aviso âmbar é consultado num `useEffect` ao montar o passo 3 (`passo-revisao.tsx:129-155`); dois Enters seguidos registram antes da resposta. Enquanto a consulta está em voo: indicador "conferindo duplicatas…" junto ao botão e Enter-de-registrar ignorado só nessa janela (clique no botão continua livre — o aviso é não-bloqueante por decisão registrada, não mude isso).
10. **MOV-09 — Termo herda a data da movimentação retroativa.** `prepararTermo` abre sempre com hoje e nem seleciona `data`/`termo_data` (`actions/termos.ts:97-100`, `:172`, `:229`, `:290`). Inclua as colunas no `MOV_SELECT` e pré-preencha `data: mov.termo_data ?? mov.data ?? hoje` (campo segue editável).
11. **MOV-13 — Sucesso focado e anunciado.** Ao registrar, o form desmonta e o foco morre no body; o painel não tem foco programático (`painel-sucesso.tsx:261-269`; mesmo padrão em `devolucao-fornecedor-form.tsx:155-198`). `tabIndex={-1}` + `focus()` no `<h2>` ao montar, nos dois painéis.
12. **MOV-14 — `?duplicar=`/`?ativo=` inválido avisa.** Busca que devolve `null` (id apagado/quebrado) abre o wizard em branco em silêncio (`movimentacoes/nova/page.tsx:105-125`). Passe um aviso ao form e renderize banner âmbar "A movimentação/o ativo de origem não foi encontrado — o formulário abriu em branco."

## Bloco 3 · Ativos e pendências

13. **ATV-01 — Busca da lista com paridade de campos.** `aplicarFiltrosAtivos` varre só patrimonio/colaborador/marca/modelo (`queries/ativos.ts:110-112`); acrescente `service_tag`, `hostname`, `telefone`, `imei` ao `.or()` (o combobox já cobre os dois primeiros — `:452-454`) e atualize o placeholder da busca (`ativos-filtros.tsx:172`). O CSV herda por ser a mesma função. Se a ajuda descrever os campos da busca, atualize-a.
14. **ATV-05 — Subtítulo honesto na lista.** "N ativos cadastrados" com filtro ativo mente (`ativos/page.tsx:187-189`). Use os booleanos que a página já calcula: com filtro → "N encontrados"; só recorte de cargo → "N nas suas filiais"; repouso de admin → "N cadastrados".
15. **PND-03 — Chips de pendência clicáveis.** `pendencias-chips.tsx:30` renderiza `<span>` estáticos. Prop opcional de link por chip: em `/pendencias`, cada chip vira `<Link href="/pendencias?tipo=…">`; no relatório **ao vivo para operador**, idem (`corpo-relatorio-v2.tsx:191-196`, espelhando o corte que `kpi-links` já faz); visualizador por senha e snapshot congelado continuam `<span>` — o viewer nunca ganha href para fora de `/relatorios/**`.

## Bloco 4 · Relatórios

16. **REL-02 — Trocar período preserva filtros.** `aplicarPreset`/`aplicarCustom` montam `URLSearchParams` do zero e descartam `sd.*`/`en.*`/`tr.q`/`mi.q` (`periodo-filtro.tsx:47`, `:53`); as tabs de filial preservam. Parta da query atual e sobrescreva só `preset`/`de`/`ate` (padrão documentado em `gerados-filtro.tsx:33-38`).
17. **REL-10 — Verde reprovado em AA.** A F19 fixou `green-700` em `CLASSE_COR_DELTA`, mas `tabela-itens-grupo.tsx:111` e `manutencao-casos.tsx:104` seguem `text-green-600` (3,22:1) em texto pequeno. Importe da fonte única (`CLASSE_COR_DELTA.verde` ou constante equivalente) — não duplique a classe à mão.
18. **REL-13a — Observação imprime completa.** `CelulaObs` trunca a 220px e o texto completo só existe em tooltip (`celulas.tsx:134-150`, `obs-tooltip.tsx:39`) — impresso sai cortado. Na mídia print, remova o clamp (`print:whitespace-normal print:overflow-visible`; `break-words` já protege o layout).

## Bloco 5 · Administração e /dev

19. **ADM-01 — Excluir item confirma.** "Excluir" no dialog do catálogo executa `remover()` no clique, sem confirmação, colado no Cancelar (`item-dialog.tsx:225`, função em `:97`). Confirmação no padrão da casa (`senha-acoes.tsx`: dialog com foco no Cancelar, frase nomeando o item).
20. **ADM-06 — "Novo import" zera a filial.** `recomecar()` limpa tudo menos `filialId` (`importar-wizard.tsx:438-448`) — o segundo import em sequência é tipicamente outra filial, num fluxo que apaga o acervo da filial. `setFilialId('')` no recomeçar.
21. **ADM-07 — Confirmação digitada: uma régua e uma dica.** Três implementações hoje: import exige igualdade exata e o botão fica desabilitado sem explicação (`importar-wizard.tsx:913`), apagar-conta tolera caixa (`apagar-usuario-dialog.tsx:52`), Zona destrutiva usa o helper `confirmacaoConfere` (`validators/dev-destrutivo.ts:87`). Unifique a UX nas três: quando o campo não está vazio e não confere, mostre "O texto não confere — digite exatamente {alvo}". Sobre tolerância de caixa/espaços: **investigue o que a action/RPC de cada tela aceita** antes de afrouxar o cliente — se o servidor compara exato (caso do import), o cliente continua exato e ganha só a dica; registre em DECISOES.md o que encontrou e o que unificou.
22. **DEV-01 — As 9 checagens de integridade na tela.** A RPC vigente devolve 9 chaves (`0098` acrescentou `arquivo_termo_orfao` e `conflito_entre_filiais`), mas o catálogo `CHECAGENS` tem 7 (`queries/dev.ts:156-198`) e `rodarChecagens()` itera sobre ele — os dois resultados extras são descartados em silêncio, e a tela diz "São 7 checagens" (`integridade-painel.tsx:133`). Acrescente as duas entradas (nome + descrição pt-BR) **e** uma rede permanente: qualquer chave devolvida pela RPC fora do catálogo aparece no fim da lista rotulada pela própria chave. Corrija o texto da contagem (derive do tamanho do catálogo em vez de literal, se simples).
23. **DEV-02 — Zona destrutiva fala nome de filial.** A escolha do ativo a apagar mostra `filial {c.filial_id}` cru (`painel-ativo.tsx:123`) exatamente onde escolher errado apaga o ativo errado; a página já carrega `listarFiliaisParaVinculo()` (`dev/destrutivo/page.tsx:38`) e não passa ao painel — passe e exiba o nome. Na prévia do reset, troque `chave.replace(/_/g,' ')` (`painel-reset.tsx:136`, `:209`) por mapa fixo chave→rótulo pt-BR ("lançamentos de item", "movimentações"…), com o replace como fallback de chave nova.

## Bloco 6 · Base global (UXG)

24. **UXG-01 — `global-error.tsx`.** Não existe (`/login` e `/auth/*` sem boundary nenhum): exceção fora do grupo (app) cai na tela default do Next em inglês — era backlog da F13. Crie `src/app/global-error.tsx` com `<html lang="pt-BR">`/`<body>` próprios, mesma linguagem visual do `PainelErro` e botão de tentar de novo; avalie também um `src/app/error.tsx` simples.
25. **UXG-02 — Modais falam pt-BR e têm alvo de toque.** `<span className="sr-only">Close</span>` em `ui/dialog.tsx:82` e `ui/sheet.tsx:83` (52 arquivos herdam) → "Fechar"; e o X é `size-7` (28px) sem o bump mobile que o app usa em 12 outros pontos → `size-10 sm:size-7`. Editar `src/components/ui/` exige motivo documentado (convenção do CLAUDE.md): deixe comentário no arquivo e ata em DECISOES.md.
26. **UXG-08 — Três feedbacks ausentes.** (a) `copiar-patrimonio.tsx:36-46` falha em silêncio total sem `navigator.clipboard` ou com permissão negada → `toast.error('Não foi possível copiar — copie manualmente.')` nos dois caminhos. (b) Sign-out sem pending nos dois shells (`user-menu.tsx:94`, `viewer-header.tsx:22`) — únicos submits sem anti-duplo-clique do app → `useFormStatus` como em `botao-ativar.tsx`. (c) `motion-reduce:animate-none` no `animate-ping` do realtime (`realtime-refresh.tsx:52`) e no `animate-pulse` de `ui/skeleton.tsx`; de quebra, dê par `dark:` (ou token) ao dot `bg-green-500` do "ao vivo".

## Housekeeping (parte da ordem)

- Apague a pasta `_claude_tmp/` na raiz (sobra da sessão de análise; fora do git).
- Commite `docs/ANALISE-UX-2026-08-07.md` (fonte desta ordem) e esta própria ordem (`docs/prompts/F27-onda-a-ux-ultracode.md`) se ainda estiverem untracked.
- Sujeira de git que não seja sua nem os untracked esperados acima: não toque; registre no relatório.

## Fora (não toque)

- **Nenhum item das Ondas B/C** da análise (inclusive as metades "b" de MOV-01 e REL-13, ATV-02+, PND-01/02, REL-01…): o que surgir de tentador vai para o backlog do relatório. Escopo da ordem atual é regra do CLAUDE.md.
- Nada de migration, nada de dependência nova (`package.json` sem entrada nova), nada em `supabase/` além de leitura.
- Modelo de acesso, RLS, policies, RPCs — leitura apenas. O aviso de duplicata continua **não-bloqueante**; o import continua **Substituir tudo**; nenhuma regra de negócio muda além do que os itens 8 e 22 descrevem.
- `src/lib/types/database.ts` (gerado) e componentes shadcn fora do item 25.
- Dados reais em qualquer fixture, teste, screenshot ou exemplo — proibição permanente.

# Critérios de aceitação

- Os 26 itens implementados e **autoverificados um a um** (checklist no relatório com evidência por item: trecho de código, saída de teste ou passo manual executado). Item que se revelar já resolvido por commit posterior à análise: marque "já atendido" com a prova. Item que crescer além de ~meio dia: implemente o núcleo que o resolve e registre o excedente no backlog — não inche a fase.
- `npm run lint`, `npm run test` e `npm run build` **limpos**, com as saídas reais coladas no relatório. Testes novos de função pura onde a correção criou lógica extraível (candidatos naturais: subtítulo do ATV-05, guarda do MOV-07, mapa de rótulos do DEV-23); a contagem total de testes não diminui.
- Diff de `supabase/` vazio; `package.json` sem dependência nova; nenhum texto novo de UI em inglês.
- `CHANGELOG.md` (entrada F27 no topo), `README.md` (status) e `docs/DECISOES.md` (ata com data · contexto · escolha · motivo das decisões não-óbvias — no mínimo: item 21 e a edição de `ui/` do item 25) atualizados; páginas de ajuda ajustadas onde a realidade mudou.
- Commits pequenos em pt-BR no estilo do projeto (`feat(f27): …` / `fix(f27): …`) e **main pushada** ao final com tudo verde. Se o push for bloqueado pelo ambiente, não insista: deixe os commits locais e registre a pendência no relatório.

# Verificação — rode de verdade

Após cada bloco: `npm run lint && npm run test`; leia as falhas, corrija a **causa raiz** e repita até passar — não suprima erro, não desabilite nem delete teste para passar (inclusive os testes da ajuda: se um quebrar porque o texto da UI mudou, o conserto é atualizar a documentação, não o teste). Ao final do todo: `npm run build` e a suíte completa, com as saídas guardadas para o relatório. Para os comportamentos que teste puro não cobre (foco, scroll, navegação com `next`, banner, toast), execute e documente um **roteiro manual** por item no relatório — passos e resultado observado, no padrão dos relatórios F14+. Depois do push, se o ambiente tiver as credenciais do smoke, rode `node scripts/smoke/smoke-prod.mjs` pós-deploy e cole o resultado; sem credenciais, registre como pendência de conferência do Johnny.

# Autonomia e decisões

Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua de decisão: (1) esta ordem; (2) a análise (`docs/ANALISE-UX-2026-08-07.md`, seções 2–8, que detalham cada item); (3) `CLAUDE.md`/spec e convenções do código existente; (4) restando ambiguidade, a opção mais simples e reversível, registrada em `docs/DECISOES.md`. Divergência entre a análise e o código atual (linha movida, trecho já alterado): o código vale, adapte a intenção e registre. A mesma falha persistindo após ~3 tentativas: mude de abordagem e registre a troca. Bloqueio real (rede, credencial): contorne se seguro; senão siga com o resto e registre a pendência.

# Git e segurança

Trabalhe direto na `main` (modo autônomo do projeto; decisão do Johnny reafirmada nesta ordem), commits pequenos e frequentes, `git pull --rebase` antes do push final. **Push na main autorizado; PROIBIDO:** force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu, qualquer deploy ou script contra o banco de produção (esta ordem não tem migration — nada de `supabase db push`, nada de SQL em produção). Commitar `.env*` ou dado real: jamais.

# Como trabalhar

Explore com subagentes paralelos e escreva um `PLAN.md` autossuficiente antes de editar (itens → arquivos → ordem de execução). Sequência recomendada: primeiro os transversais que tocam muitos arquivos (FLX-03, UXG-02) para não conflitar; depois os blocos por área — são majoritariamente disjuntos e podem virar frentes paralelas (worktrees se editarem em paralelo). Incrementos pequenos: um commit por item ou por par de itens correlatos, verificação a cada bloco. Ao final, **revisão adversarial em contexto fresco**: um subagente revisa o diff completo contra o checklist dos 26 itens e os critérios — cada item de fato resolvido? algo fora do escopo mudou? alguma regressão de a11y/comportamento? — apontando só lacunas de correção ou de requisito, não estilo; corrija e re-revise até limpar. Não refatore nada fora dos pontos tocados (as dívidas K/E do `DIVIDA-TECNICA.md` ficam para as ordens delas).

# Relatório final

Escreva `docs/RELATORIO-F27.md` em pt-BR, no padrão dos relatórios do projeto: o que mudou e por quê (por item, com arquivos); checklist dos 26 autoverificado com evidência; decisões (apontando `docs/DECISOES.md`); saídas reais e completas de lint/test/build (e do smoke, se rodou); roteiro manual executado; pendências e backlog novo (o que você viu e não fez, por escopo); e a seção **"O que este relatório NÃO prova"**, na tradição da casa. Termine a resposta final com um resumo de ~8 linhas em pt-BR: o que entrou, o que ficou de fora, estado do push/deploy e o que o Johnny deve conferir com os próprios olhos.

# Idioma

Narrativa, plano, relatório, mensagens de UI e commits em **pt-BR**. Identificadores de domínio em português sem acento, utilitários/infra em inglês — a convenção vigente do `CLAUDE.md`.

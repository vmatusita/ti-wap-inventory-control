ultracode

# Missão

Executar a **segunda metade da Onda B** da análise de UX de 07/08/2026 (`docs/ANALISE-UX-2026-08-07.md`, §10 — "Rotina diária"): os **18 itens** de relatórios, administração e base global (a11y/consistência/paleta). Sem dependência nova; sem migration (uma exceção estreita, opcional, no item 8). Ao final: `npm run lint`, `npm run test` e `npm run build` limpos, documentação atualizada e **main pushada** (a Vercel deploya sozinha). Esta é a ordem de serviço **F29** — roda **depois** da F28.

# Contexto

- Projeto **Estoque TI WAP** (Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · Recharts v3 via shadcn `chart` · Supabase). Regras permanentes de `@CLAUDE.md` valem inteiras. O **visualizador por senha** só alcança `/relatorios/**` e **nunca** ganha link para fora delas — regra dura em tudo que tocar relatório.
- **Fonte:** `@docs/ANALISE-UX-2026-08-07.md` (seções 6–8 detalham cada item). Arquivo:linha verificados em 07/08; a F27/F28 mexeram em arquivos vizinhos — se a linha se moveu, vale a **intenção**, ancore pelo trecho.
- **Pressupõe F27 e F28 aplicadas** (chips de pendência clicáveis, preservação de query no período, verde AA na fonte única etc. já existem). O que não estiver aplicado: não refaça as ordens anteriores; implemente o item desta no código como está e registre.
- Comandos: `npm run lint` · `npm run test` · `npm run build`. Testes da ajuda travam frases literais — realidade que mudar aqui atualiza a página correspondente em `src/lib/ajuda/conteudo/`.
- Padrões de referência: legendas centralizadas em funções puras (`lib/relatorios/legendas.ts` — "NUNCA só em hover: impressão precisa ler"); corte operador × visualizador em `kpi-links.ts`; `Dica` (`components/ui/dica.tsx`) para explicação acessível por teclado; `ChartTooltip`/`ChartTooltipContent` como em `grafico-mov-serie.tsx:63`; padrão de alvo mobile `h-10 sm:h-8` (12 usos no repo); `useFormStatus` em `botao-ativar.tsx`; `confirmacaoConfere` em `validators/dev-destrutivo.ts`.

# Escopo — os 18 itens (implemente todos)

## Bloco 1 · Relatórios (REL)

1. **REL-03 — Preset "Semana passada".** `PRESETS = semana | 30dias | ano | tudo` (`lib/relatorios/periodo.ts:36-41`); o recorte mais comum do relatório semanal (a semana que fechou) exige duas datas manuais. Acrescente o preset (variante −1 da janela vigente) em `PRESETS` + `intervaloDoPreset` + UI, e ofereça-o como atalho no dialog de gerar snapshot. **Atenção à decisão aberta T11** (dom–sáb no ao vivo × seg–sex no gerar): não a resolva — siga a janela que cada superfície já usa e deixe registrado que o preset herda a mesma dualidade.
2. **REL-04 — Gerar snapshot sem surpresa.** (a) Ao abrir o dialog (e ao mudar as datas), uma consulta leve responde se já existe snapshot para (período, escopo): "Já existe a v2 deste período, gerada por {nome} em {data} — você criará a v3" no box de confirmação (`gerar-relatorio-dialog.tsx:97-100`). (b) O dialog abre com a **semana útil corrente** mesmo quando o operador analisa outro período (`:44-45`): pré-preencha com o período ativo da página e mantenha "Usar semana corrente" como atalho. (c) A versão é `max+1` em duas queries sem lock (`actions/relatorios.ts:99-113`): feche a corrida na camada de app (re-checagem pós-insert com retry, ou subselect no insert) — **sem** migration; se concluir que só constraint única resolve de verdade, escreva-a aditiva e deixe em handoff pelo runbook, com a mitigação de app entregue.
3. **REL-05 — Arquivo de gerados navegável.** (a) `listarRelatoriosGerados` traz tudo (`queries/gerados.ts:84-87`): pagine (ou "carregar mais") mantendo filtros na URL. (b) Versão superada é indistinguível da vigente na lista: badge "superada" quando existe versão maior do mesmo (período, escopo) — calculado em memória sobre a página carregada é aceitável; registre o limite. (c) No snapshot aberto (`gerados/[id]/page.tsx:26-75`): links "← período anterior / próximo →" (mesma filial) e "Ver este período no ao vivo" (`/relatorios/[slug]?de=…&ate=…` — a query já devolve `filialId`; resolva o slug). **Para o visualizador por senha os três links valem** (continuam dentro de `/relatorios/**`); confirme que nada aponta para fora.
4. **REL-06 — Gráficos legíveis.** (a) `BarrasEmpilhadas` e `BarrasDivergentes` não montam tooltip (`barras-empilhadas.tsx:4`, `:20-23`; `barras-divergentes.tsx:4`) e segmento de valor 1 fica sem rótulo e sem hover — acrescente `ChartTooltip`/`ChartTooltipContent` aos dois (o config por status existe) e baixe o corte do rótulo para ≥1 quando a barra comportar. (b) Na série (`grafico-mov-serie.tsx:52-83`), rótulos em todo ponto colidem em período longo: esconda-os quando `pontos.length` passar de ~20 e, nesse caso, exiba um `YAxis` enxuto — o tooltip cobre o valor exato. Nada de lib nova; tudo via shadcn chart/Recharts já presentes.
5. **REL-07 — Δ com o valor anterior.** O tile mostra só seta+percentual (`kpi-tiles.tsx:28-45`), com `kpisAnterior` completo disponível no snapshot v2. Envolva o Δ na `Dica`: "Anterior: {N} ({dd/MM–dd/MM}) → atual: {M}" — funciona por teclado, no ao vivo e no congelado; datas da janela de comparação vêm do período (função pura testada).
6. **REL-08 — "Copiar texto" completo.** `gerarTextoResumo` só monta saídas+devoluções (`lib/relatorios/resumo.ts:59-69`); o e-mail real abria com "Disponíveis por modelo". Estenda o texto com o bloco "Em estoque ({N}): 16× {Modelo A}, 04× {Modelo B}…" (dados de `disponiveisPorModelo`) e uma linha de KPIs no topo — mantendo função pura + testes, mesmo formato de texto simples colável.
7. **REL-09 — Âncoras completas e que abrem.** (a) Dê `id` ao card do Resumo do período e chip "Resumo" na barra sticky (`chips-ancora.tsx:11-17`); chip "Observações" quando houver observação (`#observacao` já existe). (b) No mobile, âncora que aponta para grupo recolhido rola até título fechado (`grupo-colapsavel.tsx:26`, `:51`): abra o grupo quando `location.hash === '#'+id` (no mount e no `hashchange`).
8. **REL — regra transversal deste bloco:** cada mudança respeita o trio operador × visualizador × snapshot congelado e a impressão (nada só em hover que o papel precise ler — a REL-13a da F27 já tratou a observação; não regrida).

## Bloco 2 · Administração (ADM)

9. **ADM-02 — Convite com estado e reenvio.** Convidado que nunca ativou fica indistinguível de ativo (`usuarios-tabela.tsx:115`, `:174-203`) e reobter o link exige redigitar o e-mail no dialog. (a) Badge "aguardando primeiro acesso" quando a conta nunca logou (`last_sign_in_at` null — `lerContasAuth` já consulta o Auth) ou o perfil está sem nome. (b) Ação por linha "Gerar novo link de acesso" reaproveitando o ramo de reenvio de `actions/admin.ts:192-235`, com o e-mail da linha; o link aparece no mesmo padrão de cópia do convite. Trilha em `eventos_admin` como as ações vizinhas.
10. **ADM-03 — Tabelas admin encontráveis.** (a) Filtro client-side na tabela de Usuários (nome, e-mail, cargo, filial) e no catálogo de Itens (nome, grupo) — input com `aria-label`, contagem "N de M". (b) Usuários ordenados por `created_at desc` (`queries/admin.ts:102` hoje é asc — o recém-convidado, que é quem você procura, está no fundo) ou por nome; registre a escolha.
11. **ADM-04 — Kits com preview e duplicar.** (a) Bloco "Como o kit aplica" no rodapé do `kit-dialog.tsx`, montado ao vivo dos estados com o vocabulário real (`rotuloTipo`/`rotuloTermo`/`rotuloCategoria`): "Saída · Motivo: Novo colaborador · Termo: Gerar agora · Checklist: Notebook, Monitor". (b) Ação "Duplicar" por linha em `admin/kits/page.tsx:117`: abre o dialog em modo criação com payload copiado e nome "Cópia de {nome}" (o índice único de nome barra colisão).
12. **ADM-05 — Senha de acesso utilizável.** (a) Na tela pós-criação (`criar-senha-dialog.tsx:100`), mostre também a URL pública de entrada e um botão "Copiar link e senha" (mensagem pronta de colar no Teams/WhatsApp). (b) Ação "Testar senha…" em `senha-acoes.tsx`: dialog que confere um texto digitado contra o hash daquela senha via Server Action com `exigirAdmin`, respondendo só confere/não confere — sem exibir nem logar a senha digitada, sem afrouxar nada do modelo (scrypt continua; nenhuma senha em claro persiste).

## Bloco 3 · Base global (UXG)

13. **UXG-03 — Alvos de toque ≥40px (backlog F13).** Varra e aplique o padrão do repo `h-10 sm:h-8` / `size-10 sm:size-8` / `min-h-10 sm:min-h-0` nos pontos medidos: botões de ordenação (`ativos-table.tsx:222-232`), stepper do wizard (`nova-movimentacao-form.tsx:1085-1095`), botões `h-7`/`h-8` fixos de `fila-pendencias-tabela`, `termos-da-ficha`, `linha-do-tempo`, `pendencias-item-ficha`, `baixar-backup-button`, `confirmar-assinatura-dialog`, `itens-filtros`, e os Inputs/Selects `h-8` dos filtros de `lista-filtros`/`historico-filtros`/`pendencias-filtros`. Desktop não muda (o `sm:` preserva a densidade).
14. **UXG-04 — Navs roláveis com affordance.** `filial-tabs`, `admin-nav` e `chips-ancora` escondem a scrollbar sem fade/chevron. Um wrapper comum com máscara de gradiente na borda que ainda tem conteúdo (`mask-image` em CSS puro, sem JS se possível; senão, observer leve) aplicado às três navs.
15. **UXG-05 — `role="alert"` nos irmãos.** Caixas de erro pós-submit sem `role`/`aria-live` em `nova-compra-form` (×2), `colar-lista-dialog`, `filial-dialog`, `apagar-usuario-dialog`, `mesa-conflitos` (a devolução-fornecedor a F28 tratou). Replique o padrão do wizard/login/import; onde a caixa nasce fora da viewport, o foco/scroll da F27 (MOV-01a) é o modelo.
16. **UXG-06 — Loading anunciado e skeleton certo.** (a) Wrapper comum de loading com `role="status"` + `<span class="sr-only">Carregando…</span>` aplicado aos 13 `loading.tsx` (ou ao componente que compartilham). (b) `dev/loading.tsx` próprio (hoje /dev cai no skeleton do Dashboard); avalie um skeleton de form para `ativos/novo` e `movimentacoes/devolucao-fornecedor` — se não valer o custo, registre.
17. **UXG-07 — Contraste no CI.** `scripts/contraste.mjs` mede 44 pares e está fora do CI. (a) Registre os pares faltantes: dark das pílulas violet/cyan/orange/slate/teal, `muted-foreground`×`background`, `primary`×`primary-foreground`, `brand-amarelo`×`brand-dark`, `white/70`×`brand-dark`. (b) Reprovação encontrada nos pares novos: corrija o token/classe (no espírito da F19) ou, se a correção estourar o escopo, registre o par como known-fail explícito no script com comentário e item de backlog. (c) Step no CI (`.github/workflows/ci.yml`) rodando `node scripts/contraste.mjs` (o script já prevê `exit 1`); entrada `npm run` correspondente.
18. **UXG-10 + UXG-12 — Descoberta e identidade.** (a) Header desktop: troque o botão-fantasma da busca por um campo-placebo `w-64` ("Buscar ativo, tela ou ação…", kbd à direita, mesmo `onClick` que abre a paleta) — mobile mantém a lupa (`app-header.tsx:86-105`). (b) Paleta abre com grupo "Recentes": últimos ~5 ativos abertos, gravados em `sessionStorage` pela ficha (padrão `lista-visitada.ts`) — zero servidor. (c) `?` abre um Dialog leve com a tabela de atalhos (N, L, Ctrl+K, /, ?) + link "documentação completa" para `/ajuda`, em vez de navegar direto (`atalho-global.tsx:79-82`); atualize a página de ajuda que descreve o `?`. (d) A marca do header vira link — operador → `/`, visualizador → `/relatorios/geral` (`marca.tsx` continua burro; o link envolve). (e) User-menu ganha e-mail (`text-xs`) e, para operador, "Escreve em: {filiais}" (`user-menu.tsx:62-70`; o shell já resolve `filiaisEscrita` e `listarFiliais()`).

## Housekeeping

- Commite esta ordem se estiver untracked. Sujeira de git alheia: não toque; registre.

## Fora (não toque)

- **Itens da Onda C** (REL-01 impressão das colunas, ATV-03, ITN-01, ITN-04, sidebar colapsável) e qualquer item já entregue pela F27/F28 — não os refaça, não os "melhore".
- Dependência nova, jamais. Migration/banco: só o handoff opcional do item 2c, aditivo, sem aplicar nada destrutivo; `supabase db push` proibido.
- Modelo de acesso, RLS, policies, RPCs, contagens e números do relatório: leitura apenas. O visualizador por senha **nunca** ganha href para fora de `/relatorios/**`; snapshot congelado permanece imutável.
- `src/lib/types/database.ts`; `src/components/ui/` fora de motivo documentado (o item 5 usa `Dica` existente; o 13 pode tocar `ui/` só se um tamanho-base exigir — documente).
- Dados reais em fixture/teste/screenshot: proibição permanente.

# Critérios de aceitação

- Os 18 itens implementados e **autoverificados um a um** (checklist com evidência por item; "já atendido" com prova quando for o caso; excedente vira backlog registrado).
- `npm run lint`, `npm run test`, `npm run build` **limpos** com saídas reais; o step de contraste roda **verde no CI** (evidência: run do CI ou execução local do script + o diff do workflow). Funções novas têm teste puro (preset de período, texto do resumo, janela do Δ, "superada", rótulo do preview de kit); contagem total de testes **sobe**.
- `package.json` sem dependência nova; diff de `supabase/` vazio (ou só a constraint em handoff, não aplicada, com ata); nenhum texto novo de UI em inglês; nenhuma contagem de relatório alterada; visualizador continua confinado a `/relatorios/**` (prove no roteiro manual).
- `CHANGELOG.md` (entrada F29 no topo), `README.md`, `docs/DECISOES.md` (atas — no mínimo: dualidade de semana no item 1, corrida de versão no 2c, limite do "superada" no 3b, known-fails de contraste se houver) e páginas de ajuda afetadas (relatórios, atalhos, administração) atualizados.
- Commits pequenos pt-BR (`feat(f29): …`), `git pull --rebase` antes do push, **main pushada** com tudo verde. Push bloqueado: commits locais + pendência registrada.

# Verificação — rode de verdade

Após cada bloco: `npm run lint && npm run test`; causa raiz, itere até passar — sem suprimir erro nem desabilitar/deletar teste (teste da ajuda quebrando = atualizar a documentação). Ao final: `npm run build`, suíte completa e `node scripts/contraste.mjs`, saídas guardadas. Roteiro manual no relatório para o que teste puro não cobre — em especial: visualizador por senha navegando gerados/anterior/próximo/ao-vivo **sem** escapar de `/relatorios/**`; âncora abrindo grupo recolhido no mobile; "Testar senha" com senha certa e errada; campo-placebo abrindo a paleta; Recentes populando. Depois do push, com credenciais, `node scripts/smoke/smoke-prod.mjs`; sem, pendência.

# Autonomia e decisões

Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua: (1) esta ordem; (2) a análise (seções 6–8); (3) `CLAUDE.md`/spec e convenções do código; (4) o mais simples e reversível, registrado. Divergência análise × código: o código vale, adapte a intenção, registre. Mesma falha após ~3 tentativas: mude de abordagem e registre. Bloqueio real: contorne se seguro; senão siga com o resto e registre a pendência.

# Git e segurança

Direto na `main` (modo autônomo; push autorizado pelo Johnny nesta ordem), commits pequenos e frequentes. **PROIBIDO:** force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit alheio, qualquer operação em banco de produção, commitar `.env*` ou dado real.

# Como trabalhar

Explore com subagentes paralelos e escreva `PLAN.md` autossuficiente antes de editar. Faça o item 13 (alvos de toque) **primeiro ou por último, isolado** — toca muitos arquivos e conflita com os outros se correr em paralelo; os blocos REL/ADM/UXG-restante são disjuntos e podem ser frentes paralelas (worktrees se editarem simultaneamente). Incrementos pequenos, um commit por item ou par correlato, verificação por bloco. Ao final, **revisão adversarial em contexto fresco** contra o checklist dos 18 e os critérios — com atenção especial a: vazamento de link para o visualizador, snapshot congelado alterado, contagem de relatório mudada — só lacunas de correção ou requisito, não estilo; corrija e re-revise até limpar. Não refatore fora dos pontos tocados.

# Relatório final

`docs/RELATORIO-F29.md` em pt-BR, padrão da casa: mudanças por item; checklist autoverificado com evidências; decisões (→ `DECISOES.md`); saídas reais de lint/test/build/contraste (e smoke, se rodou); roteiro manual executado (incluindo a prova do confinamento do visualizador); pendências e backlog novo; seção **"O que este relatório NÃO prova"**. Resposta final: resumo de ~8 linhas — o que entrou, o que ficou, estado do push/deploy/CI, o que o Johnny confere de olho.

# Idioma

Narrativa, plano, relatório, UI e commits em **pt-BR**; identificadores de domínio em português sem acento, utilitários/infra em inglês (convenção do `CLAUDE.md`).

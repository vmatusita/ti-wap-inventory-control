# F19 — Correções da revisão de UX/UI + modo escuro (prompt autônomo)

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a ordem F19 — robustez de feedback, acessibilidade e modo escuro. Aplicar TODAS as correções da revisão de UX/UI de 24/07/2026 (4 achados P1 + polimentos P2, listados abaixo com âncora arquivo:linha) e ligar o modo escuro de verdade (toggle Claro/Escuro/Sistema no menu do usuário), trabalhando direto na main, com lint, build, testes e contraste MEDIDO como régua de pronto.

# Contexto
- Repositório: Estoque TI WAP — Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase. Leia @CLAUDE.md e siga tudo dele (modo autônomo, convenções pt-BR, stack fechada, regras permanentes).
- A base do modo escuro JÁ existe e está morta: tokens `.dark` completos em @src/app/globals.css (l.108-145), dezenas de variantes `dark:` espalhadas pelos componentes e `next-themes@0.4` JÁ presente no package.json — só que nada nunca aplica a classe `.dark` (não há ThemeProvider nem toggle). Ligar o tema NÃO exige dependência nova.
- Comandos do projeto: `npm run lint` · `npm run build` · `npx vitest run` (testes só de funções puras).
- As âncoras arquivo:linha abaixo vêm da revisão de 24/07 — as linhas podem ter deslocado; confirme no código atual antes de editar.
- ANTES de qualquer mudança, rode lint, build e vitest para registrar a BASELINE no PLAN.md (se algo já estiver vermelho, registre, não conserte fora do escopo e não piore).

# Escopo — DENTRO (todos os itens; nenhum é opcional)

## P1 (4 achados sistêmicos)
1. REDE MUDA EM MUTAÇÃO: toda chamada client de Server Action hoje roda `await` dentro de `startTransition` sem try/catch — falha de rede vira silêncio (dialog aberto, sem toast). O padrão correto já existe no repositório: @src/components/admin/importar/importar-wizard.tsx (~l.386) captura e transforma em `toast.error`. Replique-o (ou extraia um helper client fino, ex.: `src/lib/safe-action-call.ts` — decida e registre) em TODOS os pontos sem catch, verificados por grep: anotar-dialog, estornar-dialog, editar-ativo-dialog, corrigir-patrimonio-dialog, definir-service-tag-dialog, confirmar-assinatura-dialog, filial-dialog, item-dialog, kit-dialog, motivo-dialog, senha-acoes, lancar-item-dialog, gerar-relatorio-dialog, devolucao-fornecedor-form, resolver-pendencia-item-dialog — e o `registrar()` de @src/components/movimentacoes/nova-movimentacao-form.tsx (~l.470, tem try/finally mas não tem catch; mensagem deve deixar claro que o lote não se perdeu). Mensagens de erro em pt-BR, curtas, sem jargão.
2. SELECT SEM NOME ACESSÍVEL: os `<Label>` ao lado de `<Select>` (Radix) estão soltos — sem `htmlFor` apontando para um `id` no `SelectTrigger`. Corrija em: passo-movimentacao.tsx (~l.261 Tipo, ~337 Motivo, ~420 Termo, ~459 Filial de destino, ~483 Novo status), lancar-item-dialog.tsx (~l.399 Filial, ~417 Tipo), gerar-relatorio-dialog.tsx (~l.107 Escopo), nova-compra-form.tsx (~l.722 e ~742), devolucao-fornecedor-form.tsx (~l.297 e ~317), editar-ativo-dialog.tsx (~l.180). Depois faça uma varredura para garantir que não sobrou `<Label>` órfão de Select em lugar nenhum.
3. Δ DOS KPIs REPROVA CONTRASTE: em @src/lib/relatorios/delta-kpi.ts (~l.45), `verde: 'text-green-600 …'` mede 3,22:1 sobre o card claro (11px exige 4,5:1). Troque para `text-green-700` mantendo o `dark:text-green-400`, e comprove ≥4,5:1 com o script de contraste.
4. TOASTS SEGUINDO O TEMA DO SISTEMA OPERACIONAL: @src/components/ui/sonner.tsx usa `useTheme()` sem provider e cai em "system" — toasts escuros num app claro em Windows escuro. Isso se resolve sozinho ao ligar o ThemeProvider (item abaixo); NÃO edite ui/sonner.tsx. Critério: o toast segue o tema do APP nos dois temas.

## Modo escuro (a decisão do Johnny: LIGAR)
- ThemeProvider do next-themes no root layout (@src/app/layout.tsx): `attribute="class"`, `defaultTheme="light"`, `enableSystem`, `disableTransitionOnChange`; `suppressHydrationWarning` no `<html>`. Padrão continua CLARO — nada muda para quem não mexer; escuro é opt-in.
- Toggle acessível no @src/components/layout/user-menu.tsx: opções Claro / Escuro / Sistema, com ícones, estado marcado perceptível (não só cor) e rótulos pt-BR. Sem flash de tema errado no reload.
- Visualizador por senha (shell reduzido de /relatorios/**) NÃO ganha toggle nesta ordem — segue claro. Registre em docs/DECISOES.md.
- O chrome da marca (header `bg-brand-dark`, lockup do login) é escuro por design e NÃO acompanha o tema — já documentado em globals.css; preserve.
- VARREDURA DE PARES `dark:` FALTANTES: com o tema ligado, cor clara fixa sem par escuro vira defeito visível. Casos já identificados: `TIPO_PILL` em @src/lib/dominio.ts (~l.116 — saida/devolucao/compra sem variante dark:, só troca tem) e o `text-amber-800` da lista de pendências do dashboard @src/app/(app)/page.tsx (~l.231). Faça a varredura completa (grep por bg-*-50/100/200 e text-*-700/800/900 sem `dark:` no mesmo className) e complete os pares, medindo AA nos DOIS temas.
- IMPRESSÃO SEMPRE CLARA: com tema escuro ativo, `Ctrl+P` no relatório precisa sair claro (o @media print de globals.css já força body branco — garanta que cards, textos e tabelas também saem claros; implemente da forma mais simples que funcionar).
- Gráficos (Recharts/shadcn chart) legíveis nos dois temas — os hex fixos de STATUS_CHART_COLOR continuam; o que muda é rótulo/eixo (ver P2-8).

## P2 (polimentos — todos)
5. ESTADO VAZIO DE /ativos: @src/app/(app)/ativos/page.tsx (~l.109-116) — trocar o bloco manual pelo componente `EstadoVazio`, diferenciar `temFiltro` (com filtros: "Nenhum ativo com esses filtros" + ação "Limpar filtros" → /ativos; sem filtros: "Nenhum ativo cadastrado ainda" + ação "Cadastrar o primeiro" → /ativos/novo), como /movimentacoes e /pendencias já fazem.
6. ERROS ANUNCIADOS A LEITOR DE TELA: `role="alert"` no box "Revise antes de continuar" (@src/components/movimentacoes/nova-movimentacao-form.tsx ~l.667) e no "Itens que falharam no último envio" (@src/components/movimentacoes/nova/passo-movimentacao.tsx ~l.232) — o importar-wizard já usa esse padrão. No login (@src/app/login/page.tsx ~l.27-36), além do toast, mostre o erro inline persistente (`<p role="alert">` sob o formulário).
7. RÓTULOS DO GRÁFICO EMPILHADO: @src/components/relatorios/barras-empilhadas.tsx (~l.84-87) — `fill-white` a 10px reprova em quase todos os segmentos (defasado #9ca3af = 2,54:1). Escolha a cor do rótulo pela LUMINÂNCIA do segmento (branco só onde ≥4,5:1 — hoje só o violeta; escuro nos demais) e suba a fonte para 11-12px; alternativa aceitável: suprimir o rótulo interno nos segmentos claros (o total da ponta, `fill-foreground`, permanece). Válido nos dois temas.
8. CONTRASTE MIÚDO: fallback de `pillTipo`/`pillTipoLancamento` em @src/lib/dominio.ts (`bg-muted text-muted-foreground` = 4,34:1 a 11px) → use o par `bg-gray-200 text-gray-600` (6,11:1, o mesmo do badge "descartado") com as variantes dark: correspondentes; chip "em breve" da sidebar (@src/components/layout/sidebar-nav.tsx ~l.73) de 10px → 11px.
9. STEPPER COM SEMÂNTICA: @src/components/movimentacoes/nova-movimentacao-form.tsx (~l.633-664) — `aria-current="step"` no passo ativo e `aria-label="Etapas"` na lista.
10. INFORMAÇÃO SÓ EM title=: trocar por Tooltip do shadcn (o TooltipProvider já está montado no layout) em @src/components/itens/saldos-filiais.tsx (~l.88 e ~114), @src/components/itens/badge-repor.tsx (~l.30) e no BadgeEstornada de @src/components/relatorios/celulas.tsx (~l.73). Conteúdo idêntico ao title atual; acessível por foco de teclado.
11. prefers-reduced-motion: barra de progresso de navegação (@src/components/layout/progresso-navegacao.tsx ~l.110-126) não anima com motion-reduce (ex.: `motion-reduce:hidden` — o feedback de pendência continua pelos estados aria-busy/opacidade); spinners `animate-spin` acompanhados de texto ganham `motion-reduce:animate-none`.
12. ERGONOMIA DE NAVEGAÇÃO: (a) "Voltar para ativos" na ficha (@src/app/(app)/ativos/[id]/page.tsx ~l.95) deve preservar os filtros — client link que usa history.back() quando o referrer é a própria lista, com fallback /ativos; (b) na mesma ficha (~l.131-170), agrupar as ações de exceção "Corrigir patrimônio" e "Definir service tag" num menu "mais ações" (⋯, DropdownMenu, com rótulo acessível), mantendo expostas Nova movimentação, Anotar e Editar; (c) destaque visual temporário no alvo da âncora `#mov-…` da linha do tempo (@src/components/ativos/linha-do-tempo.tsx ~l.121/136), ex.: variante `target:` com anel âmbar.

# Escopo — FORA (não toque)
- NADA de banco: nenhuma migration, nenhuma alteração em supabase/, RLS, triggers. Esta ordem é 100% camada de UI/client.
- Server Actions e regras de negócio (src/lib/actions/*, validators, queries) — exceto se um item acima exigir leitura; não altere comportamento de servidor.
- Nenhuma dependência nova no package.json (next-themes já está lá). Playwright APENAS avulso via npx para o smoke (aprovado pelo Johnny nesta ordem), sem entrar no package.json.
- src/components/ui/* (gerados pelo shadcn) — não edite sem necessidade real; se precisar, registre o motivo em docs/DECISOES.md. ui/sonner.tsx não deve precisar de mudança.
- Templates de termos (src/templates/), scripts/ de carga/seed, mockups/.
- NUNCA rode `npm run db:reset`, `npm run db:seed` ou `supabase db reset` — o ambiente aponta para produção.
- NUNCA dados reais (nome de colaborador, patrimônio real) em código, teste, screenshot ou relatório.
- Não remova variantes `dark:` existentes; não "modernize" nada fora dos itens listados.

# Critérios de aceitação
- `npm run lint` e `npm run build` zerados; `npx vitest run` 100% verde (ou exatamente igual à baseline registrada, sem piora).
- Greps zerados: nenhuma chamada client de action sem catch nos arquivos listados; nenhum `<Label>` de Select sem associação; nenhuma cor clara fixa sem par dark: nos componentes tocados pela varredura.
- Todos os pares de cor alterados medem ≥4,5:1 (texto normal) ou ≥3:1 (só onde for texto ≥18,66px bold ou elemento gráfico) NOS DOIS TEMAS, comprovado pelo script e tabelado no relatório (antes → depois).
- Toggle de tema: html recebe/perde a classe `dark`, escolha persiste entre reloads, "Sistema" segue o SO, sem flash de tema errado; toasts seguem o tema do app.
- Tema claro permanece visualmente idêntico ao atual fora dos pontos corrigidos.
- Impressão do relatório sai clara mesmo com tema escuro ativo.
- Smoke: rotas públicas respondem 200 (/login, /relatorios/acesso); logado (se credenciais disponíveis), dashboard, /ativos e /movimentacoes/nova renderizam nos dois temas sem erro de console — e NENHUMA escrita no banco é feita durante o smoke.
- CHANGELOG.md atualizado no formato existente; decisões em docs/DECISOES.md; relatório final escrito.

# Verificação — rode de verdade
- A cada incremento: `npm run lint`, `npm run build`, `npx vitest run`. Leia as falhas, corrija a CAUSA RAIZ e repita até passar. Não suprima erros, não desabilite regras/testes para passar.
- Contraste: escreva `scripts/contraste.mjs` (Node puro, sem dependências — oklch→sRGB + fórmula WCAG; os tokens do globals.css estão em oklch, os do Tailwind v4 também) medindo cada par alterado nos dois temas. Saída em tabela; cole no relatório. O script fica no repositório (ferramenta de dev, sem guardas especiais — não toca banco).
- Smoke sem login: `npm run build && npm run start` + curl nas rotas públicas (status e presença de marcadores no HTML).
- Smoke logado (leitura apenas): se existirem SMOKE_EMAIL e SMOKE_SENHA (arquivo .env.smoke na raiz — NUNCA logue os valores), use Playwright avulso (`npx playwright@latest install chromium` uma vez; script Node fora do package.json, ex.: scripts/smoke-f19.mjs) para: logar, abrir dashboard, /ativos e /movimentacoes/nova, alternar Claro→Escuro→Sistema, conferir a classe no html, capturar screenshots claro/escuro em docs/f19-evidencias/, checar console sem erro. PROIBIDO submeter qualquer formulário de mutação — o banco é produção. Se o Playwright falhar (download bloqueado, ambiente) após ~2 tentativas, degrade: smoke via curl + checklist manual de 2 minutos no relatório. Nunca trave por causa do smoke.
- Ao final, rode a bateria completa mais uma vez e guarde as saídas reais para o relatório.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua de decisão: (1) esta ordem; (2) a spec e as convenções do repositório (docs/ESPECIFICACAO.md, CLAUDE.md, código existente); (3) a opção mais simples e reversível. Toda decisão não-óbvia vai para docs/DECISOES.md (data · contexto · escolha · motivo) — inclusive: helper de action vs. try/catch inline; abordagem da impressão clara; forma do destaque :target; viewer sem toggle. Se a mesma falha persistir após ~3 tentativas, mude de abordagem e registre. Bloqueio real (credencial ausente, download bloqueado): contorne se seguro; senão siga com o resto e registre a pendência no relatório.

# Git e segurança
Trabalhe direto na main LOCAL (decisão do Johnny para esta ordem, alinhada ao CLAUDE.md), com commits pequenos e frequentes em pt-BR no padrão do repositório (`fix(f19): …`, `feat(f19): modo escuro opt-in …`). Push para origin/main UMA única vez, no final, somente com todos os critérios verdes — o push dispara deploy de produção na Vercel, então ele é o último ato. Se o ambiente de permissão bloquear o push, tente UMA vez, não insista: deixe tudo commitado e registre no relatório que falta só o `git push`. PROIBIDO: force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu, qualquer comando de banco destrutivo.

# Como trabalhar
Explore primeiro com subagentes paralelos (frentes: dialogs/formulários de mutação; relatórios e gráficos; tema/tokens/varredura dark:) que voltam só com resumos. Escreva PLAN.md autossuficiente com a lista COMPLETA de arquivos-alvo por item — essa lista é o gabarito antifuga da revisão final. Implemente em incrementos verificáveis, nesta ordem de risco: (1) P1-1 rede; (2) P1-2 selects; (3) P1-3/P2-8 contrastes; (4) núcleo do modo escuro (provider + toggle); (5) varredura dark: + impressão; (6) P2 restantes. Frentes paralelas que editam arquivos rodam isoladas em worktrees. Ao final, um subagente em contexto FRESCO revisa o diff contra PLAN.md e os critérios de aceitação — apenas lacunas de correção ou de requisito declarado, não estilo. Corrija e re-revise até limpar.

# Relatório final
Escreva docs/F19-RELATORIO.md em pt-BR: o que mudou por item da revisão (checklist ✔ item a item, autoverificado); decisões (aponte docs/DECISOES.md); tabela de contrastes antes→depois nos dois temas; saídas REAIS e completas de lint, build e vitest; evidências do smoke (saídas, caminhos dos screenshots em docs/f19-evidencias/); pendências (ex.: push bloqueado) com o que falta; checklist manual de 2 minutos para o Johnny validar ao voltar (login, alternar tema, imprimir relatório no escuro, provocar um erro de validação no lote). Atualize CHANGELOG.md no formato das entradas existentes. Evidências, não afirmações. Termine a resposta final com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, relatório e mensagens de UI em pt-BR; identificadores de domínio em português sem acento e utilitários em inglês (convenção do CLAUDE.md); commits em pt-BR no estilo conventional do repositório.
```

## Como executar

### Preparo (5 minutos, uma vez)

1. **Árvore limpa e baseline verde.** No repositório: `git status` sem pendências; depois rode hoje, você mesmo, `npm run lint`, `npm run build` e `npx vitest run`. Se algo já estiver vermelho antes de começar, anote — o prompt registra a baseline e não pode piorá-la.
2. **Credenciais do smoke** (é o "login pra smoke test"): crie `.env.smoke` na raiz do repo com

   ```
   SMOKE_EMAIL=seu-operador@wap.ind.br
   SMOKE_SENHA=...
   ```

   O padrão `.env*` já é ignorado pelo git (regra 4 do CLAUDE.md). Sem esse arquivo nada trava: o smoke degrada para as rotas públicas + checklist manual.
3. **Cinto de segurança duro** (vale em qualquer modo de permissão): crie `.claude/settings.local.json` no repo com

   ```json
   {
     "permissions": {
       "deny": [
         "Bash(git push --force*)", "Bash(git push -f*)",
         "Bash(git reset --hard*)", "Bash(git clean*)",
         "Bash(npm run db:reset*)", "Bash(npm run db:seed*)",
         "Bash(supabase db reset*)"
       ]
     }
   }
   ```

   (Não bloqueie `git push` genérico — o prompt dá UM push na main ao final, que é o seu deploy.)
4. **Diálogos pendentes:** abra `claude` interativamente uma vez dentro do repo (confirmação de confiança do diretório) e confira `claude --version` — o modo `auto` pede 2.1.83+.
5. Se for deixar rodando longe do teclado, ajuste o plano de energia do Windows para a máquina não suspender.

### Rodar (recomendado: interativo desatendido)

```powershell
cd C:\Users\yukig\ti-wap-inventory-control
claude --model opus --permission-mode auto -n f19-ux-dark
```

Cole o prompt inteiro (ele também está salvo em `docs/prompts/F19-PROMPT.txt`) e saia de perto. Opcional, se sua versão tiver `/goal`:

```
/goal npm run lint e npm run build passam sem erro, npx vitest run passa, e docs/F19-RELATORIO.md existe com a tabela de contrastes
```

**Por que `auto` e não bypass:** é a sua máquina de trabalho, com credenciais reais (Supabase/Vercel) — `auto` executa tudo sozinho com um classificador de segurança de guarda; `bypassPermissions` é só para sandbox descartável. Único atrito provável: o classificador pode barrar o `git push` na main — o prompt já prevê isso (tenta uma vez, deixa commitado e registra; você dá o push ao voltar).

**Alternativa headless** (ex.: rodar de madrugada) — PowerShell:

```powershell
cd C:\Users\yukig\ti-wap-inventory-control
claude -p (Get-Content docs\prompts\F19-PROMPT.txt -Raw) --model opus --permission-mode auto --output-format json > f19-run.json
```

(Em Git Bash/WSL: `claude -p "$(cat docs/prompts/F19-PROMPT.txt)" ... > f19-run.json 2>&1 &` com `nohup`.) Guarde o `session_id` do JSON — é a única forma de retomar uma sessão `-p`. Em headless, bloqueios repetidos abortam a run; é exatamente por isso que o prompt manda tentar o push só uma vez e seguir.

### Acompanhar e retomar

- Voltar à sessão: `claude --resume f19-ux-dark` (o `-n` deu esse nome). Caiu o terminal? A transcrição persiste; retome e siga.
- A rede de segurança real são os commits frequentes que o prompt exige: `git log --oneline` mostra o progresso a qualquer momento.

### Ao voltar: revisão em 10 minutos

1. Leia `docs/F19-RELATORIO.md` — confira as **evidências** (saídas reais de lint/build/vitest, tabela de contrastes antes→depois, screenshots claro/escuro em `docs/f19-evidencias/`).
2. Audite o diff: `git log --oneline origin/main..HEAD` e `git diff origin/main..HEAD --stat`.
3. Rode você mesmo `npm run lint && npm run build` uma vez.
4. Smoke manual de 2 min (o relatório traz o checklist): logar, alternar Claro/Escuro/Sistema, imprimir o relatório no tema escuro (tem de sair claro), provocar um erro de validação no lote.
5. Se o push ficou pendente: `git push origin main` — é isso que dispara o deploy na Vercel.
6. Se vier errado: regra dos 2 strikes — depois de duas correções falhas, não emende; me peça um prompt novo incorporando o que se aprendeu e rode em sessão limpa.

## Suposições que fiz

1. **Tema padrão continua CLARO** — o escuro é opt-in pelo toggle (com opção "Sistema"). Ninguém vê mudança sem pedir.
2. **Toggle só no shell do operador**; o visualizador por senha segue claro nesta ordem (registrado em DECISOES).
3. **"Direto no main" inclui um push único ao final** = deploy de produção na Vercel. Se o classificador barrar, fica commitado para você empurrar.
4. **Impressão do relatório sempre clara**, mesmo com tema escuro ativo (o mockup/spec fixa o relatório em tema claro).
5. **Smoke logado usa Playwright avulso via `npx`** (não entra no package.json — a stack fechada segue intacta), com credenciais de `.env.smoke`; sem elas, degrada para rotas públicas + checklist manual.
6. **Smoke é 100% leitura** — nenhuma movimentação/cadastro é submetido (o banco é produção).
7. **Escopo = todos os itens P1+P2 da revisão de 24/07**, incluindo os três de ergonomia (voltar preservando filtros, menu "⋯" na ficha, destaque da âncora de estorno).

Se alguma suposição estiver errada, ajuste a linha correspondente do prompt antes de colar — é texto, não código.

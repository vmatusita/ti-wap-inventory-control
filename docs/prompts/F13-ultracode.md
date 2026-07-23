ultracode

# OS-F13 (ultracode) — Correções em produção: convite de operador · busca de ativos do fluxo de movimentação · âncoras da ajuda · responsivo mobile

Ordem **executável e autocontida**. Quatro defeitos relatados pelo Johnny (23/07/2026) no sistema em produção, **sem stack trace nem print** — por isso o diagnóstico faz parte da ordem, antes de qualquer correção. Objetivo em uma linha: os quatro fluxos voltam a funcionar, com causa raiz **provada por evidência** (log, teste ou screenshot), correção mínima direto na `main`, deploy verificado por smoke e relatório auditável.

**Modo autônomo com acesso total (CLAUDE.md).** Você roda de forma autônoma: **ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) convenções do repositório/CLAUDE.md; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

**Produção, de verdade.** ~1.600 ativos reais, 5 filiais. Trabalho **direto na `main`** (decisão do Johnny nesta ordem; precedente F12 §2.2) — e como **push = deploy automático (Vercel)**: commits locais pequenos e frequentes, **`git push` SOMENTE no marco verde da §1.4**. Expectativa: **zero migration** — se uma correção exigir (candidato possível: trigger `handle_new_user`/`profiles` no B1), ela é aditiva/idempotente, numerada como a **próxima livre** (última conhecida: `0043` — confira `ls supabase/migrations/` antes de numerar), ensaiada em DEV pelo `docs/RUNBOOK-BANCO.md` e aplicada em produção só pelo orquestrador, com backup antes. Nada destrutivo, nunca: sem `drop`, sem `delete` em massa, sem force push, sem `git reset --hard`, sem `git clean`.

**Dados e segredos.** Nenhum dado real (nome, patrimônio, e-mail de colaborador) em código, teste, screenshot, log citado ou relatório — exemplos sempre fictícios (`WAP0001234` / "Fulano" / `fulano.teste@wap.ind.br`). Screenshots e E2E **somente contra DEV** (dados fictícios do seed); em produção, apenas leitura de logs e o smoke por contagens/status (padrão F12). **Nenhum usuário, convite ou dado de teste é criado em produção por esta ordem.** Credenciais só por env (`SMOKE_*`, as mesmas da F12); senha mascarada em qualquer saída. Cuidado com o `.env.local` da máquina: identifique DEV × produção pelos refs (`scripts/env-guard.ts`, precedente F11) antes de rodar qualquer script.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. O orquestrador segue a §1; §D e §C descrevem os prompts das frentes.

---

## §0 — Os quatro defeitos (sintoma → onde olhar; âncoras por símbolo — localize por Grep, nunca por número de linha)

| # | Sintoma (relato do Johnny) | Área / arquivos-âncora |
|---|---|---|
| **B1** | "Criar usuário novo está entrando em página de erro." O único fluxo de criação de usuário é o convite de operador. O relato **não diz** se o erro é (a) do admin ao gerar o link em `/admin/usuarios`, (b) do convidado ao abrir/ativar o link, ou (c) depois de definir a senha, ao cair no app — descubra. | `src/lib/actions/admin.ts` (`convidarUsuario` → `generateLink` invite/recovery → `linkConfirmacao`), `src/components/admin/convidar-usuario-dialog.tsx`, `src/app/auth/confirm/page.tsx` (intersticial anti-prefetch; a tela de `?erro=1` — "Não foi possível ativar o acesso" — é a "página de erro" mais provável) + `botao-ativar.tsx`, `src/lib/actions/auth.ts` (`confirmarAcesso` → `verifyOtp`), `src/app/auth/definir-senha/page.tsx`, `src/lib/auth/otp.ts`, `src/lib/auth/dominios-email.ts`, trigger `handle_new_user` (migrations `0001` → `0041`), tabela `profiles` |
| **B2** | Busca de ativos no fluxo de nova movimentação **nunca** encontra nada ("Nenhum ativo encontrado" para termos que existem no acervo). | `src/components/movimentacoes/ativo-combobox.tsx` → action `buscarAtivosParaMovimentacao` em `src/lib/actions/movimentacoes.ts` — ela degrada exceção para lista vazia **e loga `[buscarAtivosParaMovimentacao]` no servidor: o log de runtime do Vercel provavelmente JÁ diz a causa** → `buscarAtivosParaCombobox`, `RESUMO_SELECT` e `patrimoniosDuplicados` em `src/lib/queries/ativos.ts` |
| **B3** | O "?" de ajuda das telas leva a `/ajuda`, mas **não posiciona na seção correta** — fica no topo. | `src/components/layout/link-ajuda.tsx` (href `/ajuda#<ancora>`; o mapa tela→âncora está no comentário do arquivo), `src/app/(app)/ajuda/page.tsx` (ids das seções, `scroll-mt-28`, sumário sticky) **+ o `loading.tsx` da rota** — hipótese forte: navegação client-side com hash + streaming/skeleton faz o alvo ainda não existir quando o Next tenta rolar; os chips DENTRO da página funcionam. `SECOES` em `src/lib/ajuda/conteudo.ts`; pontos de uso: `Grep LinkAjuda` (hoje 8 telas) |
| **B4** | Responsivo mobile quebrado; corrigir **em todos os tamanhos de tela**. | Shell: `src/app/(app)/layout.tsx`, `app-header.tsx` (o Sheet mobile já existe), `sidebar-nav.tsx`. Suspeitos típicos: tabelas largas (`/ativos`, `/movimentacoes`, `/itens`, relatórios), wizard `movimentacoes/nova` (passos, combobox, revisão), dashboard, dialogs grandes (kit, lançar item, colar lista, importar), paleta `Ctrl+K`, `/ajuda` — **e o ramo do visualizador por senha** (`/relatorios/acesso` + relatórios + snapshots), que é exatamente o que se abre no celular. Itens já conhecidos: `docs/BACKLOG-UX.md`. Referência visual desktop (não regredir): `mockups/dashboard-relatorio.html` |

**Hipóteses B1** (investigue nesta ordem; não assuma): token de invite expirado/consumido → `?erro=1` (qual é o TTL do link do `generateLink`? reenvio `recovery` para quem nunca ativou funciona?); erro no próprio `generateLink` (config/limite do projeto Supabase); `handle_new_user`/`profiles` sem linha ou sem nome → quebra DEPOIS do login (não há `error.tsx` na raiz do grupo `(app)` — um throw no dashboard vira página de erro genérica do Next); e-mail com maiúsculas/espaços. Fontes: logs de runtime do Vercel e logs de Auth do Supabase (MCPs da sessão se disponíveis; senão CLI/painel; nada acessível → reproduza em DEV e registre a limitação). **Guarda de desenho: a correção NÃO pode voltar a consumir o token no GET** — o intersticial com `verifyOtp` só no clique existe por causa do prefetch de WhatsApp/Teams/Outlook (comentário em `auth/confirm/page.tsx`); preserve-o.

**Hipóteses B2**: exceção sistemática do PostgREST visível no log (`RESUMO_SELECT` com coluna/embed que não existe mais? **as migrations `0042`/`0043` da F12 estão aplicadas em produção?** — confira com `supabase migration list` ou equivalente); RLS; regressão recente (`git log -- src/lib/queries/ativos.ts` — o arquivo mudou na F11/F12). O que ISOLA a causa: os "Movimentados recentemente" (outra query) aparecem? A busca da lista `/ativos` (query irmã, `aplicarFiltrosAtivos`) funciona?

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) Working tree **limpo na `main`** e sincronizado com `origin` (este arquivo de ordem, untracked ou commitado, não conta). Sujo → PARE e reporte (pode ser trabalho manual do Johnny). (b) Baseline verde **hoje**: `npm run lint && npm run test && npm run build` (a F12 fechou com 870 testes) — vermelho → PARE e reporte. (c) `.env.local` presente e classificado (DEV × produção, via `scripts/env-guard.ts`). (d) `scratchpad/smoke/smoke-prod.mjs` existe (baseline F12: 33 OK). Env `SMOKE_*` ausentes **não** travam: o smoke degrada para a parte sem sessão + pendência registrada.

### 1.1 Grafo de execução

```
ONDA 0 (∥, read-only)         ONDA 1 (∥, arquivos disjuntos §1.3)   ONDA 2                ONDA 3 (orquestrador)
D1 convite   D2 busca         C1 convite   C2 busca   C3 ajuda      C4 responsivo         revisão adversarial → emendas →
D3 ajuda     D4 responsivo →  (cada frente lê o diag-<bug>.md    →  (na árvore já     →   lint+test+build na união →
(diagnóstico com causa raiz    correspondente e corrige)             integrada com         E2E DEV dos 4 aceites →
PROVADA; não editam código)                                          C1–C3)                smoke baseline prod → push ÚNICO
                                                                                           (deploy) → smoke pós-deploy →
                                                                                           docs + RELATORIO-F13
```

- **Diagnóstico separado da correção:** cada Dn entrega `scratchpad/f13/diag-<bug>.md` com causa raiz + evidência colada (saída real de log/console/teste) + plano de correção mínima (arquivos, abordagem, riscos, como verificar). Causa não provada → registre as 2 hipóteses mais fortes e o experimento que decide entre elas; o Cn correspondente começa executando esse experimento.
- Onda 1 na **mesma árvore**, `main` local, commits pequenos por frente, **push proibido às frentes** (só o orquestrador, §1.4).
- **C4 roda depois (onda 2)** porque toca páginas de todo mundo — assim não colide com C1–C3.

### 1.2 Regras globais

1. **Correção mínima.** Conserte a causa raiz do defeito; não refatore o entorno, não "aproveite para fazer" (CLAUDE.md regra 1) — o que surgir de fora vira pendência/backlog no relatório.
2. **Zero dependência nova no `package.json`** (byte a byte igual). **Exceção instrumental autorizada nesta ordem:** Playwright via `npx playwright@latest` (ou binário já instalado na máquina) **só como ferramenta de verificação** — screenshots e E2E em DEV; não entra em `package.json`, lockfile nem CI. Se o `npx` falhar, degrade para verificação manual descrita passo a passo no relatório e registre.
3. **DEV primeiro:** reproduzir, corrigir e verificar contra o Supabase DEV com `npm run db:seed` (fictício). Produção: só leitura de logs no diagnóstico + o rollout da §1.4.
4. Convenções CLAUDE.md: pt-BR em UI/erros/commits; escrita via Server Actions + Zod; leituras em `src/lib/queries/` (client só via proxies de action); `src/components/ui/**` intocado salvo motivo documentado em DECISOES; `src/lib/types/database.ts` só regenerado; datas `dd/MM/yyyy`; `tabular-nums`.
5. **Verificação — rode de verdade:** `npm run lint && npm run test && npm run build` no recorte de cada frente e na união; toda função pura nova ou corrigida ganha teste Vitest; causa raiz, nunca supressão — desabilitar/deletar/skipar teste para passar é proibido.
6. **Invariantes intocáveis:** máquina de estados no banco; vocabulários §5 da spec (nenhum texto muda); lote máx 30; nível único de acesso + visualizador por senha (nada novo exposto ao viewer); import, termos e relatórios não mudam de **comportamento** (só de layout, se o B4 exigir); a busca da lista `/ativos` continua devolvendo os mesmos resultados de hoje (a query irmã não pode regredir com o conserto do combobox); o E2E nunca digita credencial de produção.
7. Cada frente entrega: diff + checklist do próprio aceite autoverificado + rascunho para `docs/DECISOES.md` + pendências.
8. Commits pt-BR, estilo conventional: `fix(f13): âncora da ajuda sobrevive ao streaming`, `fix(f13): responsivo /ativos`.

### 1.3 Propriedade de arquivos (disjunta na onda 1)

| Frente | Arquivos |
|---|---|
| **C1** | `src/lib/actions/admin.ts` (só `convidarUsuario` e helpers), `src/lib/actions/auth.ts`, `src/app/auth/**`, `src/components/admin/convidar-usuario-dialog.tsx`, `src/lib/auth/otp.ts`; migration nova SÓ se o diagnóstico provar defeito no banco (aplicada em produção apenas pelo orquestrador) |
| **C2** | `src/lib/queries/ativos.ts`, `src/lib/actions/movimentacoes.ts` (só os proxies de busca), `src/components/movimentacoes/ativo-combobox.tsx` |
| **C3** | `src/components/layout/link-ajuda.tsx`, `src/app/(app)/ajuda/**`, `src/components/ajuda/**`, `src/lib/ajuda/**` (+ pontos de uso do `LinkAjuda` SÓ para trocar âncora errada) |
| **C4** | O resto de `src/app/**` e `src/components/**` (exceto `ui/**`); onde C1–C3 mexeram, C4 trabalha por cima na onda 2 — nunca em paralelo |
| **Orquestrador** | `docs/**`, `README.md`, `CHANGELOG.md`, `scratchpad/smoke/**`, push, produção |

### 1.4 Rollout (orquestrador — a parte sensível)

1. União verde (`lint`+`test`+`build`) + E2E DEV dos 4 aceites (§1.5) passando.
2. **Smoke baseline** contra a produção atual (`scratchpad/smoke/smoke-prod.mjs`): registre a saída. Falha pré-existente fora dos 4 bugs → corrija se for pequena e relacionada; senão, pendência no relatório.
3. (Se houver migration) backup lógico das tabelas afetadas em `scratchpad/backups/f13-<data>/` (local, fora do git — confira o `.gitignore`) → aplicar em DEV → aplicar em produção pelo `docs/RUNBOOK-BANCO.md`, conferindo depois.
4. **Estender o smoke** com o check do B2 (busca logada pela MESMA forma de query da app, reportando **contagem > 0** para um termo do acervo — nunca conteúdo de linha). Baseline dos 33 checks continua OK.
5. **Push único na `main`** → aguardar deploy READY no Vercel.
6. **Smoke pós-deploy** (com o check novo): exit ≠ 0 → trate como incidente — corrija e repita; se grave, **promova o deploy anterior no painel Vercel** (não é git revert destrutivo) e registre.
7. **Fallback sem drama** (precedente 0034/F7): push/migration/ação barrada pelo classificador → não insista; deixe pronto (SQL na pasta, código commitado local), relatório completo e a instrução de 2 minutos para o Johnny no resumo.
8. Docs: `docs/RELATORIO-F13.md` (novo), `docs/DECISOES.md` (2026-07-23 · F13), `CHANGELOG.md`, `README.md`, `docs/prompts/README.md` (linha F13), `docs/BACKLOG-UX.md` (se itens de lá foram resolvidos pelo B4). Resumo final ~10 linhas em pt-BR apontando o relatório.

### 1.5 Aceites — o "pronto" de cada bug (verificados em DEV; produção via smoke/logs)

- **B1:** E2E em DEV: convidar `fulano.teste@wap.ind.br` → **copiar o link exibido no próprio dialog** (não há e-mail no fluxo — o link aparece na UI, o que torna o E2E trivial) → abrir → "Ativar meu acesso" → definir senha → cair no dashboard **sem página de erro**. E-mail fora do domínio → mensagem amigável no dialog (nunca página de erro). Reenvio para usuário existente gera link `recovery` que funciona. Intersticial anti-prefetch preservado (token só é consumido no clique). Causa raiz de produção demonstrada no relatório com evidência de log (e-mails reais mascarados). Se a causa for token expirado: a tela de erro passa a dizer isso claramente e aponta o caminho do reenvio. Em produção **não se cria usuário de teste** — a validação humana final é do Johnny, e o relatório diz exatamente o que ele deve clicar.
- **B2:** Em DEV (seed): busca por fragmento de patrimônio (`0001`), patrimônio completo, service tag, hostname, modelo e colaborador retorna resultados (≤12, null-last); patrimônio duplicado exibe o aviso âmbar com a service tag. O contrato da busca não muda (mesmos campos por palavra; E entre palavras, OU entre campos; guarda de 2 caracteres). Se a causa for em código testável, entra teste de regressão. Pós-deploy: check novo do smoke passa e o log do Vercel **não registra novas** ocorrências de `[buscarAtivosParaMovimentacao]`.
- **B3:** Playwright em DEV: para **cada** ponto de uso do `LinkAjuda` (Grep; hoje 8 telas), navegação fria a partir da tela → `/ajuda#<ancora>` termina com a seção correta visível (o `h2` da âncora dentro do viewport, abaixo do sumário sticky) — **inclusive com o `loading.tsx` no caminho** (primeira navegação, sem cache). Âncoras conferidas contra os ids reais de `SECOES`. Chips do sumário e URL com hash aberta direto (aba nova) continuam funcionando; back/forward não fica preso.
- **B4:** Em DEV, para **cada rota** do operador e do visualizador (enumere por Glob `page.tsx` no grupo `(app)` + `login` + `auth`) × larguras **360, 390, 414, 768, 1024, 1280**: (i) sem scroll horizontal do documento (`document.documentElement.scrollWidth <= innerWidth + 1`); (ii) tabelas largas roláveis **dentro** de um contêiner próprio; (iii) dialogs/sheets cabem na viewport com scroll interno e ações alcançáveis; (iv) o wizard de nova movimentação é completável a 360px; (v) alvos de toque ≥ 40px nos controles ajustados; (vi) charts do relatório redimensionam sem estourar; (vii) desktop a 1280 permanece visualmente igual — mudança visível no desktop só se ela FOR a correção (ex.: tabela que já estourava). Evidência: screenshots antes/depois por rota×breakpoint em `scratchpad/f13/shots/` (fora de commit) + tabela-resumo rota×breakpoint no relatório com OK/corrigido.

---

## §D — Onda 0: diagnósticos (4 subagentes em paralelo, read-only)

Prompt comum a todos: "Você é o subagente de diagnóstico **Dn** da OS-F13. **Não edite nada** além de `scratchpad/f13/diag-<bug>.md`. Reproduza o defeito (DEV primeiro; logs de produção como fonte de leitura), **prove a causa raiz com evidência colada** (saída real de comando/log/console) e proponha a correção MÍNIMA: arquivos, abordagem, riscos, como verificar. Não conseguiu provar → entregue as 2 hipóteses mais fortes e o experimento barato que decide entre elas. Regras §1.2; dados fictícios sempre." Cada Dn recebe a linha da §0 do seu bug (sintoma, âncoras, hipóteses).

- **D4 (responsivo), além disso:** varra TODAS as rotas a 360px com Playwright em DEV logado (dica: se digitar senha no form for barrado pelo ambiente, monte a sessão via `supabase-js` com credencial fictícia de DEV e injete os cookies no contexto do Playwright — padrão do smoke da F12) e liste cada quebra encontrada (rota + o que estoura + arquivo suspeito + screenshot), priorizada por gravidade. Essa lista é o backlog do C4.

## §C1–§C3 — Onda 1: correções (paralelas, arquivos da §1.3)

Prompt comum: "Você é a frente **Cn** da OS-F13. Leia `scratchpad/f13/diag-<bug>.md`; valide a causa raiz (se o diagnóstico estiver errado, prove e registre a divergência). Corrija a causa raiz com a **menor** mudança que satisfaz o aceite §1.5 do seu bug. Teste antes quando couber (função pura → Vitest; fluxo → roteiro E2E DEV descrito no seu checklist). `npm run lint && npm run test && npm run build` no fim. Entregue: diff, checklist do aceite autoverificado, rascunho para DECISOES, pendências. Regras §1.2."

- **C1 extra:** qualquer mudança preserva o desenho do intersticial (verifyOtp só no POST do clique). Se precisar de migration, escreva-a aditiva/idempotente, aplique **só em DEV** e deixe produção para o orquestrador (§1.4.3).
- **C2 extra:** os testes existentes de movimentação continuam passando; se o defeito estiver no SQL/select, confira o select contra o schema real de DEV **e** de produção (migrations aplicadas) antes de culpar o código.
- **C3 extra:** a solução tem que funcionar com streaming/`loading.tsx` (a causa provável) — por exemplo, um client component pequeno na página da ajuda que rola até `location.hash` quando as seções montam. Sem `scroll-behavior` global novo, sem quebrar âncora aberta direto em aba nova. Se nascer lógica de resolução de âncora, é função pura com teste.

## §C4 — Onda 2: responsivo (na árvore com C1–C3 integrados)

"Você é a frente **C4** da OS-F13. Sua lista de trabalho é o `diag-responsivo.md` (D4) + o que a varredura dos aceites §1.5-B4 revelar. Padrões do repositório primeiro: o contêiner de rolagem que as tabelas de relatório já usam, o Sheet/`hidden md:block` do shell, `min-w-0`/`truncate`, grid → coluna única no mobile. Corrija página a página, commits pequenos (`fix(f13): responsivo /ativos`). **Não redesenhe**: mesmo conteúdo, mesma hierarquia — só se adapta. `src/components/ui/**` só com motivo documentado. Screenshot antes/depois por item corrigido. Regras §1.2; aceite §1.5-B4."

## §R — Onda 3: revisão adversarial + fechamento (orquestrador)

1. Subagente revisor em **contexto fresco**, com refutação por padrão (precedente F9–F12): revisa o diff inteiro contra os aceites §1.5 e as invariantes §1.2.6 — "aponte lacunas de correção, regressão ou requisito descumprido; não estilo; para cada achado, tente refutá-lo antes de reportar". Emendas → re-revisão até limpar.
2. E2E DEV final dos 4 aceites + suíte na união → rollout §1.4 completo (smoke baseline → push → smoke pós-deploy).
3. `docs/RELATORIO-F13.md`: causa raiz de cada bug com a evidência do diagnóstico; o que mudou (arquivos e porquês); saídas **reais** de lint/test/build e dos smokes (antes/depois); tabela rota×breakpoint do B4; decisões (aponte DECISOES.md); pendências; e a seção **"o que este relatório NÃO prova"** (precedente F12 — ex.: o B1 em produção só será confirmado pelo clique do Johnny). Evidências, não afirmações.

## Idioma

Narrativa, relatório, commits e UI em pt-BR. Identificadores de domínio em português sem acento, utilitários/infra em inglês (padrão do repositório).

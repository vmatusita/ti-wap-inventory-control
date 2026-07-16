# OS-F6B — Melhorias de UX e features pós-go-live

Executor desta ordem no repositório `ti-wap-inventory-control`. **Modo autônomo com acesso total (CLAUDE.md)** — decide, implementa, aplica migrations em produção, deploya; autoproteções e rastro em `docs/DECISOES.md`. Sistema **em produção**: migrations com cuidado, dados fictícios só em DEV.

Nasce da sessão de melhorias de 16/07/2026 com o Johnny (decisões em §5). **Pré-requisito: OS-F6A concluída** (a página `/pendencias` do A5 é destino de ações do B6; a semântica Total/Estoque do A4 aparece em telas que o B5 toca).

> **Para executar, prefira `F6B-ultracode.md`** (mesmo escopo, mesmas decisões): versão com prompts detalhados por frente e orquestração multi-agente em duas ondas, fatos verificados no código pós-F6A e migrations pré-alocadas (0030+). Este arquivo permanece como registro do escopo e das decisões.

## 0. Antes de qualquer coisa

1. Leia `CLAUDE.md`, spec §4/§5/§6/§7 e `docs/PLANO-RELATORIOS-V2.md`.
2. Regra 6 do CLAUDE.md vale forte aqui: **confira a documentação atual** de Next 16 (loading UI, `useLinkStatus`/transitions) e Supabase SSR/Auth (expiração de sessão) antes de codar B1 e B8 — não confie em API de memória.
3. Working tree limpo, build verde.

## 1. Objetivo

O sistema está confiável (F6A); agora fica confortável: feedback de carregamento, defaults inteligentes, relatório mais legível, correções administrativas com rastro, sessões mais curtas e um manual interno.

## 2. Escopo desta ordem (e nada além)

B1 loading · B2 semana default · B3 quebra de linha no resumo · B4 obs no snapshot · B5 seção de itens nas saídas/entradas · B6 confirmação de assinatura do termo · B7 corrigir patrimônio · B8 sessões 24h · B9 página de documentação.

Escopo proibido: **nenhuma dependência nova** (stack fechada — loading e docs com recursos nativos do App Router/React; nada de nprogress, MDX externo etc.); não mexer no layout das tabelas de **ativos** do relatório (decisão do Johnny — item 7: só itens); sem upload de PDF assinado (continua item 5.5 da F5); sem roles.

## 3. Itens

### B1 — Loading entre páginas: barra global + skeletons

1. **Barra de progresso fina no topo** em toda navegação (estilo GitHub). Implementação nativa: `loading.tsx`/Suspense + `useLinkStatus` ou transition state do App Router — conforme doc atual do Next 16. Cor do acento WAP (`#eda100`).
2. **Skeletons (`loading.tsx`)** nas rotas pesadas: `/ativos`, `/ativos/[id]`, `/relatorios/[filial]`, `/relatorios/gerados`, `/itens`, `/pendencias` — esqueleto que ecoa o layout real (KPI tiles, tabelas fantasma), componentes `Skeleton` do shadcn.
3. Botões de submit já mostram estado de envio? Onde faltar (ações demoradas: gerar termo, gerar snapshot), spinner/disabled.

**Aceite:** nenhuma navegação fica em tela morta — sempre barra e/ou skeleton visível em conexão lenta (teste com throttling); zero dependência nova.

### B2 — Período default do relatório: semana atual (dom–sáb)

1. Ao abrir qualquer relatório ao vivo (`/relatorios/[filial]`, incluindo `geral`) **sem período na URL**, o filtro vem em **semana atual: domingo a sábado** (`date-fns` com `weekStartsOn: 0`, locale `ptBR`).
2. O preset "esta semana" existe no seletor de período (se não existir, criar); os demais períodos continuam disponíveis e a URL continua mandando quando presente.
3. Snapshots não mudam (já são semanais por natureza).

**Aceite:** abrir `/relatorios/geral` sem query mostra dom–sáb da semana corrente; trocar de período continua funcionando; links antigos com período na URL não quebram.

### B3 — Resumo do período: quebra de linha no ";"

No resumo em formato de e-mail, cada segmento separado por `;` vira **linha própria** (hoje ficam um do lado do outro). Vale **em todos os lugares**: relatório ao vivo, snapshot novo, snapshot antigo (o texto congelado contém `;` — quebre na renderização) e impressão. Um único ponto de formatação compartilhado, não três cópias.

**Aceite:** resumo legível em lista de linhas nos 4 contextos; sem `;` órfão no fim das linhas (decida se o `;` permanece visível e registre).

### B4 — Observação ao gerar o snapshot

1. No fluxo de gerar snapshot semanal, **campo de texto livre opcional** ("Observações da semana").
2. Persistida no snapshot (migration: coluna/campo no jsonb congelado — imutável como o resto).
3. Exibida **no final do snapshot, junto do resumo do período em formato de e-mail**, com destaque visual (card/borda no acento WAP) — visível para operador e visualizador.
4. Snapshots sem obs não mostram seção vazia.

**Aceite:** gerar com obs → aparece no final do snapshot com destaque; sem obs → nada; snapshot continua imutável; visualizador por senha vê.

### B5 — Seção própria de itens nas Saídas/Entradas do relatório

Decisão do Johnny (item 7): a melhoria é **só para itens por quantidade** (periféricos, acessórios, componentes) — tabelas de ativos não mudam.

1. Nova(s) tabela(s) no relatório do período: **movimentações de itens** — item, quantidade, tipo (atrelado/liberação/devolução/entrada), filial (no consolidado), pessoa/ativo vinculado quando houver, data. Fonte: `lancamentos_item` (migration 0015) + atrelados do período.
2. Visual no padrão do relatório (mockup `dashboard-relatorio.html`); chips-âncora ganham a âncora da nova seção se fizer sentido.
3. Snapshot schema: se o snapshot congela seções, a nova seção entra no congelamento (versione o schema como na F3B — v1/v2 continuam abrindo).

**Aceite:** relatório do período mostra a seção de itens com os lançamentos/atrelados da janela; consolidado agrega as 5 filiais; snapshots novos congelam a seção; antigos seguem abrindo.

### B6 — Confirmar assinatura do termo

1. Na ficha do ativo (seção Termos) e na página `/pendencias` (A5), ação **"Confirmar assinatura"** para termo `gerado`/`enviado`: grava **data da confirmação + quem confirmou** e move o termo para o estado que já não conta como pendência (`sim` — confira o enum `termo_status`; campos novos via migration se preciso).
2. Sem upload de arquivo (decisão do Johnny — botão simples; upload do PDF segue na F5 item 5.5).
3. Rastro na linha do tempo do ativo; permitir desfazer engano (ação inversa com rastro) — decida o desenho e registre.
4. `v_pendencias` reflete na hora (realtime já cobre? confira).

**Aceite:** confirmar remove a pendência imediatamente nas contagens e na `/pendencias`; ficha mostra quem/quando confirmou; desfazer funciona; estorno da movimentação (0023) continua coerente.

### B7 — Corrigir patrimônio (service tag fixa)

1. Na ficha do ativo, ação **"Corrigir patrimônio"**: service tag é **imutável** (nunca editável); patrimônio pode ser corrigido.
2. Validações: formato canônico (`WAP0004491`); o par patrimônio + service tag permanece único (spec §5 regra 1); buscas que exibem o patrimônio antigo continuam achando o ativo pelo novo.
3. **Rastro obrigatório na linha do tempo**: evento "patrimônio corrigido de X para Y" com autor e data (use a infraestrutura de anotações/eventos existente — 0017 — ou crie tipo próprio; movimentações são imutáveis, não as reaproveite).
4. Server Action com Zod, como toda escrita.

**Aceite:** editar patrimônio funciona e aparece na linha do tempo (de → para, quem, quando); service tag não é editável em lugar nenhum; par duplicado é rejeitado; termo/relatórios passam a exibir o patrimônio novo.

### B8 — Sessões expiram em 24h (operador e visualizador)

1. **Visualizador:** `VIEW_MAX_AGE_SEG` (em `src/lib/auth/senha-sessao.ts`) de 30 dias → **24h**. O cookie já carrega `exp` assinado — sessões antigas passam a valer a regra nova no request seguinte ao deploy? Confira e registre o comportamento.
2. **Operador:** sessão Supabase expira **24h após o login** — no dia seguinte, login de novo. Implemente conforme doc atual do `@supabase/ssr` (ex.: verificação no middleware do momento do login — `last_sign_in_at` ou carimbo próprio assinado — e `signOut` + redirect quando estourar). Não quebre o refresh de token dentro da janela.
3. Mensagem amigável no login quando a sessão expirou ("Sua sessão expirou, entre novamente").

**Aceite:** operador logado há mais de 24h é deslogado no próximo request e relogando volta normal; visualizador redigita a senha após 24h; dentro da janela nada muda (sem deslogar no meio do trabalho); revogação de senha continua tendo efeito imediato.

### B9 — Página de documentação interna (manual do operador)

1. Rota interna (ex.: `/(app)/ajuda`), **só para operador logado** — decisão do Johnny: o visualizador não tem manual.
2. Conteúdo (derive da spec §4/§5/§8 e das telas reais — nada inventado):
   - **Glossário de tags/status:** estados do ativo (disponível, reservado, em uso, triagem, manutenção…), status de termo (não/enviado/gerado/sim), tipos de pendência, grupos de item — o que significa cada um e quando o sistema aplica.
   - **Como realizar cada ação**, passo a passo: nova movimentação (lote), entrada por compra, estorno, gerar/confirmar termo, lançar item, corrigir patrimônio, gerar snapshot, senhas de acesso, convites, filiais/motivos.
3. Página TSX estática com navegação por âncoras/sumário e filtro de busca client-side simples — **sem lib nova**; escaneável (títulos, passos numerados, exemplos com dados fictícios).
4. Link no menu/sidebar e atalho `?` se for barato.
5. Componha de forma que atualizar o manual em ordens futuras seja trivial (conteúdo estruturado em um módulo, não espalhado no JSX).

**Aceite:** operador acha na página o significado de qualquer status visível no sistema e o passo a passo de cada ação; visualizador por senha não acessa; busca/âncoras funcionam; zero dado real nos exemplos.

## 4. Aceite geral (autoverificado)

- [ ] B1–B9 com seus aceites individuais passando
- [ ] Zero dependência nova (`package.json` sem entradas novas)
- [ ] `npm run lint`, `npm run test` e `npm run build` limpos; deploy feito
- [ ] `docs/DECISOES.md` atualizado (cada decisão de desenho); README e spec tocados onde o comportamento mudou
- [ ] Nenhum dado real em exemplo, screenshot ou fixture

## 5. Decisões do Johnny — sessão de 16/07/2026 (autoridade desta OS)

1. Termo: **botão "marcar como assinado"** com data + quem confirmou; sem upload → B6.
2. Obs do snapshot: **no final, junto do resumo em formato de e-mail**, com destaque se necessário → B4.
3. Loading: **barra de progresso global + skeletons** nas telas pesadas → B1.
4. Semana default: **domingo a sábado da semana atual**, em todos os relatórios ao vivo, consolidado incluso → B2.
5. Saídas/entradas: melhoria **só nos itens** (periféricos/acessórios/componentes), em **seção própria**; ativos não mudam → B5.
6. Resumo do período: quebra de linha no `;` **em todos os lugares** → B3.
7. Patrimônio: **editável com rastro** na linha do tempo; service tag fixa → B7.
8. Sessões: **operador e visualizador expiram em 24h** → B8.
9. Documentação: **só operadores**; glossário de tags/status + passo a passo de cada ação → B9.

# CLAUDE.md — Estoque TI WAP

Sistema interno de controle de ativos de TI da WAP (notebooks, celulares, monitores, desktops, tablets de 5 filiais). Substitui 3 planilhas desconectadas + relatório semanal por e-mail. Conceito central: **a movimentação é a fonte da verdade** — registra-se o evento uma vez e o estado do ativo, o estoque e os relatórios derivam por trigger no banco.

Cada fase do projeto é executada como uma **ordem de serviço** em `docs/prompts/` (F0 em diante). Execute somente a ordem que o Johnny colar na conversa. O status das fases está no `README.md` e no `CHANGELOG.md`.

## Documentos-fonte (ordem de autoridade)

1. `docs/ESPECIFICACAO.md` — **o quê** construir: modelo de dados, máquina de estados (§4), vocabulários De→Para (§5), telas (§6), relatórios (§7), regras de negócio (§8).
2. `docs/PLANEJAMENTO.md` — **como**: stack fechada (§2), estratégia de dados (§3), fases (§4), definição de pronto (§6).
3. `supabase/migrations/` — **fonte da verdade do banco** desde a F1: cada alteração vira uma nova migration numerada (nunca editar uma já aplicada). O rascunho original `supabase/schema.sql` foi **aposentado em 21/07/2026** (histórico no git; decisão em `docs/DECISOES.md`).

Se o código existente, a ordem de serviço e os documentos se contradisserem: resolva pela hierarquia acima (a spec manda), **registre a decisão em `docs/DECISOES.md`** e siga — não trave.

## Modo de operação: AUTÔNOMO — acesso total (decisão do Johnny, 09/07/2026)

O Claude Code **não pede autorização**: decide, implementa, aplica migrations, roda scripts, mergeia na `main` e deploya — **inclusive direto em produção**. Perguntar ao Johnny é exceção rara, reservada a insumo físico que só ele tem (ex.: os CSVs reais, uma credencial que não existe no ambiente) — nunca para pedir permissão.

Autonomia com disciplina — práticas de **autoproteção do próprio agente** (não são autorizações):

- **Decida e registre.** Diante de ambiguidade, decida pelo que a spec indica, anote em `docs/DECISOES.md` (data · contexto · escolha · motivo) e siga. Não fique bloqueado esperando resposta.
- **Operação destrutiva em produção** (reset, carga, migration que altera/apaga dado): antes, exporte backup das tabelas afetadas; rode dry-run quando existir; confira contagens depois. Deu errado → corrija você mesmo e registre.
- **Autoverificação no lugar de aceite:** execute e marque você mesmo o checklist da ordem; o resumo final traz checklist, decisões e pendências. O Johnny audita quando quiser — nada fica esperando por ele.

## Regras permanentes (continuam valendo — não são pedidos de autorização)

1. **Escopo da ordem atual.** Não "aproveite para fazer" trabalho de outra fase — o que surgir de fora vai para o backlog no resumo.
2. **NUNCA dados reais.** Nenhum nome de colaborador real, patrimônio real ou linha das planilhas da WAP em seed, fixture, teste, comentário ou screenshot. Dados de desenvolvimento são 100% fictícios (F1). Os dados reais só entram em produção pela **carga de go-live** — a carga global inicial pelos **scripts da F4** (autônoma, com os CSVs do Johnny) e, desde a **F7 (16/07/2026)**, o **import de startup por filial** pela tela `admin/importar` (só modo *Substituir tudo*, go-live novo de uma filial; ver spec §10.2 e `docs/DECISOES.md`). A entrada de dados **do dia a dia continua 100% manual** — não há sincronização recorrente nem modo *Atualizar* (adiado). CSVs de teste e o smoke do import são **100% fictícios** (`WAP0001234`/"Fulano"); os CSVs reais nunca entram no repositório.
3. **Custo R$ 0.** Não habilitar nenhum recurso pago, nenhum serviço novo, nenhuma lib com licença comercial. Infra permitida: Supabase Free + Vercel (conta Pro existente do Johnny).
4. **Segredos:** nunca commitar `.env*` (mantenha `.env.example` atualizado). `SUPABASE_SERVICE_ROLE_KEY` só em código server-side ou scripts locais — jamais em Client Component ou variável `NEXT_PUBLIC_*`.
5. **Produção: acesso total, com autoproteção.** Migrations, scripts e deploy rodam direto em produção sem pedir autorização — precedidos de backup/dry-run quando destrutivos (ver Modo de operação). Seed fictício jamais roda em produção depois do go-live.
6. **APIs de integração: confira a documentação oficial atual antes de escrever o código** (Supabase SSR/Auth, shadcn `chart`, Next 16, Recharts v3) — use o MCP Context7 ou a doc online; não confie em API de memória.
7. **Ao terminar qualquer ordem:** `npm run lint` e `npm run build` limpos; checklist da ordem **autoverificado** item a item; resumo final com checklist, decisões registradas em `docs/DECISOES.md` e pendências.

## Stack (fechada — proibido adicionar dependência fora desta lista sem aprovação do Johnny)

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- **Tailwind CSS v4** + **shadcn/ui** (componentes via CLI) + **Recharts v3** (só via componente `chart` do shadcn)
- **Supabase**: `@supabase/supabase-js` + `@supabase/ssr` · tipos gerados por `supabase gen types typescript`
- **Zod** + **react-hook-form** (+ `@hookform/resolvers`) · **TanStack Table** (via data-table do shadcn) · **date-fns** (locale `ptBR`) · **PapaParse** (F3 export / scripts de carga única F4) · **ExcelJS** (leitura do `.xlsx` no import de startup — F7G, MIT, aprovado pelo Johnny 20/07/2026; `serverExternalPackages`) · **sonner** (toasts, via shadcn)
- **docxtemplater** + **pizzip** (preenchem os templates `.docx` dos termos, server-side — F5A) · **docx-preview** (preview do termo no navegador). Libs **MIT**, aprovadas pelo Johnny (PLANO-TERMOS §3.1). `serverExternalPackages` no `next.config.ts`.
- Dev: **Supabase CLI**, **@faker-js/faker** (locale pt_BR, só em `scripts/`), **seedrandom**, **Vitest** (só funções puras), ESLint + Prettier
- Proibidos (decisão registrada): Prisma/Drizzle, Redux/Zustand/TanStack Query, ECharts (upgrade futuro documentado), Highcharts/AG Charts/MUI X Pro, i18n, monorepo.

## Convenções

- **Idioma:** UI, mensagens, erros e commits em **pt-BR**. Identificadores de domínio em português sem acento (`ativo`, `movimentacao`, `filial`); utilitários/infra em inglês (`getServerClient`, `formatDate`).
- **Banco:** snake_case; toda alteração via nova migration em `supabase/migrations/` (nunca editar migration já aplicada). Regras de negócio críticas (máquina de estados, RLS) vivem no Postgres — a UI é a segunda linha, nunca a única.
- **Componentes:** Server Components por padrão; `'use client'` apenas quando necessário (forms, charts, realtime). Escritas **sempre** via Server Actions com validação Zod; leituras via funções em `src/lib/queries/`.
- **shadcn:** componentes gerados ficam em `src/components/ui/` e não se editam sem motivo documentado.
- **Datas** exibidas `dd/MM/yyyy`; números em tabelas com `tabular-nums`. Patrimônio exibido sempre no formato canônico (`WAP0004491`).
- **Patrimônio repete em casos raros** — o par patrimônio + service tag é a chave (spec §5). Toda busca de ativo por patrimônio precisa tratar o caso de múltiplos resultados.
- **Modelo de acesso (spec §3 · `docs/ADR-002-papeis-e-permissoes.md`):** duas portas. **Login** = conta Supabase restrita aos domínios corporativos — `@wap.ind.br`, `@stefanini.com`, `@latam.stefanini.com` (lista única em `src/lib/auth/dominios-email.ts`; trava no trigger `handle_new_user`, migration `0041`) — com **três cargos em hierarquia estrita, `admin ⊃ operador ⊃ consulta`** (enum `papel_usuario`; F21 revogou o nível único de 09/07/2026). **Todo logado ATIVO lê tudo** (o piso de leitura é `papel_atual() is not null` — perfil desativado não lê nem escreve, migration `0070`); a escrita é que se restringe: admin escreve em todas as filiais e é o único que alcança `/admin/**` e o import; **operador escreve só nas filiais vinculadas** (`operador_filiais`); consulta não escreve nada. Desativar (`profiles.ativo = false`) vale **no request seguinte**, para leitura E escrita, e toda ação administrativa vai para `eventos_admin`. A regra mora no **Postgres** (funções `papel_atual()`/`e_admin()`/`pode_escrever_filial()` + policies, migrations `0061`→`0070` — o TERMO e o `.docx` também são matéria de filial (`0069`), guarda interna nas RPCs `security definer` que escrevem); vocabulário e funções puras em `src/lib/auth/papeis.ts`; guardas de Server Action (`exigirAdmin`/`exigirEscrita`/`exigirEscritaEm`/`exigirPapel`) em `src/lib/auth/acesso.ts` — elas dão a **mensagem em pt-BR**, não a segurança. `idOperador()` responde "existe sessão?", **nunca** "pode fazer isso?". Cargo NUNCA vem de `raw_user_meta_data` (o próprio usuário edita o metadata dele). **Visualizador** = senha de acesso gerida em `admin/senhas` (hash `crypto.scrypt` nativo — proibido lib de hash) → cookie httpOnly assinado, válido só nas rotas `/relatorios/**`, queries servidas pelo servidor; **é outra porta, não o cargo "consulta"** — e a F21 não a tocou. Nunca expor o client administrativo ou a anon key para sessões por senha; revogação de senha tem efeito no request seguinte.

## Estrutura de pastas (prescrita — criada progressivamente pelas fases)

```
src/
  app/
    login/page.tsx                  # público — operadores (domínios corporativos)
    auth/confirm/page.tsx           # convite/senha — intersticial anti-prefetch (verifyOtp só no clique)
    auth/definir-senha/page.tsx     # operador define a senha após aceitar o convite
    relatorios/acesso/page.tsx      # público — entrada por SENHA de acesso (F3)
    (app)/                          # protegido: sessão (rotas de relatório também aceitam cookie de visualização — F3)
      layout.tsx                    # sidebar + header
      page.tsx                      # dashboard home
      ativos/page.tsx               # lista
      ativos/[id]/page.tsx          # ficha + linha do tempo
      ativos/novo/page.tsx          # cadastro de equipamento novo (compra — single/lote)
      movimentacoes/nova/page.tsx   # fluxo de nova movimentação (lote)
      movimentacoes/page.tsx        # lista/histórico de movimentações (F11 · M8)
      movimentacoes/devolucao-fornecedor/page.tsx  # baixa + substituto no mesmo passo (F8)
      itens/page.tsx                # itens por quantidade: saldos + lançamento + histórico (F3B)
      pendencias/page.tsx           # ativos com pendência (sem patrimônio/termo) — só operador (F6A/F7E)
      ajuda/page.tsx                # ÍNDICE da documentação + busca (F20)
      ajuda/[slug]/page.tsx         # uma página da documentação — rota dinâmica do registry (F20)
      ajuda/manual/page.tsx         # manual completo numa página só, para ler e imprimir (F20)
      relatorios/[filial]/page.tsx  # relatório AO VIVO por filial ('geral' = consolidado)
      relatorios/gerados/page.tsx        # histórico de snapshots semanais
      relatorios/gerados/[id]/page.tsx   # snapshot congelado e interativo (spec §7.1)
      admin/usuarios/page.tsx       # convites — só domínios corporativos
      admin/senhas/page.tsx         # senhas de acesso dos relatórios (F3)
      admin/filiais/page.tsx
      admin/motivos/page.tsx
      admin/itens/page.tsx          # catálogo de itens por quantidade (F3B)
      admin/kits/page.tsx           # catálogo de kits de movimentação (F12 · M12)
      admin/importar/page.tsx      # import de startup por filial (F7 — Substituir tudo; spec §10.2)
  components/
    ui/            # shadcn (CLI)
    layout/  ativos/  movimentacoes/  itens/  pendencias/  relatorios/  admin/  ajuda/
  lib/
    supabase/      # client.ts, server.ts, middleware de sessão
    actions/       # Server Actions (Zod dentro) — inclui termos.ts (F5A)
    queries/       # leituras tipadas (ativos, movimentacoes, relatorios, itens, termos…)
    validators/    # schemas Zod compartilhados
    termos/        # tipos, mapa motivo→Descrição, ordenação do lote, datas (F5A)
    ajuda/         # documentação do operador (F20) — SÓ-SERVIDOR, exceto tipos.ts/busca.ts/ancora.ts
      registry.ts    # A lista ordenada das páginas = sitemap, índice, manual e testes
      conteudo/      # uma página por arquivo (o texto)
      derivacao.ts   # rótulos e vocabulário DERIVADOS de dominio.ts/validators
      indice.ts  legado.ts  tipos.ts  busca.ts  ancora.ts
    auth/  ativos/  itens/  pendencias/  relatorios/  import/
    types/database.ts   # GERADO — não editar à mão
  templates/
    termos/*.docx  # 7 modelos de termo tagueados e sanitizados (F5A) — lidos em runtime
supabase/
  migrations/      # fonte da verdade do banco a partir da F1
  tests/           # roteiros SQL auto-verificáveis (domínios de login, RLS)
scripts/
  seed.ts  reset.ts     # dados fictícios (guardas anti-produção obrigatórias)
  import/               # carga ÚNICA do go-live (F4) — ferramenta, não feature do app
  smoke/                # smoke reexecutável contra produção (F12 §W5)
docs/  mockups/
```

Se a estrutura real divergir desta ao começar uma ordem, PARE e reporte a diferença.

## Git

- Branch por fase é **opcional** — commit direto na `main` é permitido (modo autônomo). Se usar branch (`f0-fundacao`, `f1-banco-seed`…), **você mesmo faz o merge** quando o checklist da fase passar na autoverificação.
- Commits em pt, estilo conventional: `feat(f2): fluxo de movimentação em lote`, `fix(f3): fuso nas datas do relatório`.
- Proibido: push forçado na `main`, commitar `node_modules`, `.env*`, dados reais.

## Comandos do projeto

- `npm run dev` · `npm run build` · `npm run lint`
- A partir da F1: `npm run db:seed` (popula fictício), `npm run db:reset` (zera), `npm run db:types` (regenera `src/lib/types/database.ts`)
- Supabase local (opcional): `supabase start` / `supabase db reset`
- Só na janela do go-live (F4): `npm run carga` (`scripts/import/` — guardas obrigatórias; não é feature)

## Referência visual

`mockups/dashboard-relatorio.html` é a referência de layout/estilo do relatório (F3): tema claro, acento amarelo WAP `#eda100` sobre header escuro `#111110`, azul `#2a78d6` como segunda série, KPI tiles, barras com rótulo de valor. Fonte do sistema; nada de fonte externa.

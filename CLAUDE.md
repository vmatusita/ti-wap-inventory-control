# CLAUDE.md — Estoque TI WAP

Sistema interno de controle de ativos de TI da WAP (5 filiais). Conceito central: **a movimentação é a fonte da verdade** — registra-se o evento uma vez e o estado do ativo, o estoque e os relatórios derivam por trigger no banco. Detalhe do modelo: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) §1.

Cada fase é uma **ordem de serviço** em `docs/prompts/`. Execute só a que o Johnny colar na conversa. Status das fases: `README.md` e `CHANGELOG.md`.

## Documentos-fonte (ordem de autoridade)

1. `docs/ESPECIFICACAO.md` — **o quê**: modelo de dados, máquina de estados (§4), vocabulários De→Para (§5), telas (§6), relatórios (§7), regras de negócio (§8).
2. `docs/PLANEJAMENTO.md` — **como**: stack (§2), dados (§3), fases (§4), definição de pronto (§6).
3. `supabase/migrations/` — **fonte da verdade do banco**: cada alteração vira migration numerada nova (nunca editar uma já aplicada — trava executável em `supabase/migrations.lock.json`, `npm run db:lock` obrigatório no mesmo commit).

Código × ordem × documentos se contradizem: resolve pela hierarquia acima (a spec manda), **registre em `docs/DECISOES.md`** e siga — não trave.

`docs/README.md` é o índice de toda a documentação. Consulte-o antes de abrir/escrever documento em `docs/`. Doc interna de dev (README, índice, onboarding, runbook) não entra no `CHANGELOG.md` (regra 8 é só para o que muda o sistema do operador) — o registro dela é a ata em `DECISOES.md`.

## Modo de operação: AUTÔNOMO — acesso total (Johnny, 09/07/2026)

Não pede autorização: decide, implementa, aplica migration, roda script, mergeia na `main` e deploya — **inclusive direto em produção**. Perguntar ao Johnny é exceção rara, reservada a insumo físico que só ele tem (CSVs reais, credencial que não existe no ambiente) — nunca para pedir permissão.

Autoproteção (não são autorizações):

- **Decida e registre.** Ambiguidade → decida pela spec, anote em `DECISOES.md` (data · contexto · escolha · motivo), siga. Não fique bloqueado esperando resposta.
- **Operação destrutiva em produção** (reset, carga, migration que altera/apaga dado): backup antes, dry-run quando existir, confira contagens depois. Deu errado → corrija você mesmo e registre.
- **Autoverificação no lugar de aceite:** execute e marque você mesmo o checklist da ordem; resumo final com checklist, decisões e pendências. O Johnny audita quando quiser.

## Regras permanentes

Numeração é estável — código, migrations e testes citam "regra N do CLAUDE.md" por extenso em dezenas de arquivos; não renumere.

1. **Escopo da ordem atual.** Não "aproveite para fazer" trabalho de outra fase — o que surgir de fora vai para o backlog no resumo.
2. **NUNCA dados reais** — nome de colaborador, patrimônio ou linha das planilhas da WAP em seed, fixture, teste, comentário ou screenshot; dados de dev são 100% fictícios (`WAP0001234`/"Fulano"). Dado real só entra em produção por carga de go-live: a carga global inicial (`scripts/import/`, F4 — guardas anti-produção; ver `scripts/import/CLAUDE.md`) ou, por filial, o import de startup em `admin/importar` (só *Substituir tudo* — spec §10.2). O dia a dia é **100% manual** (sem sync recorrente, sem modo *Atualizar*). CSVs de teste e o smoke do import são fictícios; CSVs reais nunca entram no repositório. A linha cujo par já existe em OUTRA filial não bloqueia o import — os dois cadastros coexistem (identidade do ativo é **por filial**) e o par vira pendência "conflito entre filiais" em `/pendencias`; o import não transfere ativo entre filiais, e esse conflito só nasce do import — cadastro manual e edição de ficha seguem recusando par de qualquer filial. Vocabulário de acessório/item é só o catálogo `tipos_item` (nunca lista fixa no código) — ver `src/lib/itens/CLAUDE.md`.
3. **Custo R$ 0.** Nenhum recurso pago, serviço novo, lib com licença comercial. Infra: Supabase Free + Vercel (conta Pro do Johnny).
4. **Segredos:** nunca commitar `.env*` (mantenha `.env.example`). `SUPABASE_SERVICE_ROLE_KEY` só server-side/script local — jamais em Client Component ou `NEXT_PUBLIC_*`.
5. **Produção: acesso total, com autoproteção.** Direto em produção sem pedir autorização — backup/dry-run antes quando destrutivo. Seed fictício jamais roda em produção depois do go-live.
6. **APIs de integração: confira a documentação oficial atual antes de escrever código** (Supabase SSR/Auth, shadcn `chart`, Next 16, Recharts v3) — MCP Context7 ou doc online; não confie em memória.
7. **Ao terminar qualquer ordem:** `npm run lint` e `npm run build` limpos; checklist autoverificado item a item; resumo final com checklist, decisões em `DECISOES.md`, pendências.
8. **Toda entrada nova no `CHANGELOG.md` EXIGE uma versão** (regra permanente desde a F35). Gatilho é a entrada no CHANGELOG — não "achar que é visível". Três passos, sem exceção:
   - **bump** no `package.json` (só o campo `version`). **Fase (ordem `F*`) → MINOR** (`1.40.0`→`1.41.0`). **Entrega avulsa fora de fase** (ajuste, auditoria, rollout, diagnóstico, revisão) **→ PATCH** (`1.40.0`→`1.40.1`).
   - **entrada nova no topo** de `src/lib/versoes/registry.ts`: `versao`, `data`, `fase` (só quando for fase), `titulo`, 2 a 6 `mudancas` em **LINGUAGEM DE OPERADOR** — rótulos reais das telas, efeito antes da causa, nada de vocabulário de dev (teste recusa). Detalhe de implementação: `src/lib/versoes/CLAUDE.md`.
   - **tag anotada `v<versão>`** no commit final, publicada (`git push origin v<versão>`).

   Fase invisível ao usuário (auditoria, desempenho, CI, dívida técnica) também ganha versão — só muda o texto: 2 frases honestas sobre o efeito real, nunca "nada mudou para você", nunca pular a entrada.

   `VERSOES[0]` **é** a versão no ar (fonte única). `registry.test.ts` recusa divergência com `package.json`; `cobertura-changelog.test.ts` derruba `npm run test` se uma entrada nova do CHANGELOG ficar sem versão na mesma data.

## Stack (fechada — proibido dependência fora desta lista sem aprovação do Johnny)

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- **Tailwind CSS v4** + **shadcn/ui** (CLI) + **Recharts v3** (só via componente `chart` do shadcn)
- **Supabase**: `@supabase/supabase-js` + `@supabase/ssr` · tipos por `supabase gen types typescript`
- **Zod** + **react-hook-form** (+ `@hookform/resolvers`) · **TanStack Table** (data-table shadcn) · **date-fns** (`ptBR`) · **PapaParse** · **ExcelJS** (`serverExternalPackages`) · **sonner**
- **docxtemplater** + **pizzip** (termos `.docx`, server-side) · **docx-preview** (preview no navegador). `serverExternalPackages`.
- Dev: **Supabase CLI**, **@faker-js/faker** (pt_BR, só `scripts/`), **seedrandom**, **Vitest** (função pura; componente em dois graus: render estático em `*.test.tsx`, interação em `*.dom.test.tsx`), **@testing-library/react** + `/dom` + `/user-event` e **happy-dom** (só o projeto Vitest `dom`; MIT, aprovados 22/09/2026), **tsx**, **Playwright** (só `scripts/`, MIT), ESLint + Prettier
- **Proibidos** (decisão registrada): Prisma/Drizzle, Redux/Zustand/TanStack Query, ECharts, Highcharts/AG Charts/MUI X Pro, i18n, monorepo.

## Convenções

- **Idioma:** UI, mensagens, erros e commits em **pt-BR**. Domínio em português sem acento (`ativo`, `movimentacao`, `filial`); utilitários/infra em inglês (`getServerClient`, `formatDate`).
- **Banco:** snake_case; toda alteração via migration nova, nunca editar uma já aplicada (trava executável — ver item 3 dos Documentos-fonte). Regra crítica (máquina de estados, RLS) vive no Postgres — UI é 2ª linha, nunca única.
- **Componentes:** Server Components por padrão; `'use client'` só quando precisa. Escrita **sempre** via Server Action + Zod; leitura via `src/lib/queries/`. Um módulo de `src/lib/**` **nunca** depende de valor vindo de um módulo `'use client'` — vira `undefined` na Server Action, com o build passando verde. Na direção oposta, um `'use client'` **nunca** importa função de `src/lib/queries/` direto — recebe o dado do servidor por **prop**, a partir de um Server Component. Ambas as lições: `src/lib/itens/CLAUDE.md`.
- **shadcn:** `src/components/ui/` não se edita sem motivo documentado.
- **Tailwind:** classes sempre **literais** no código-fonte — o v4 varre o código procurando nomes de classe; um nome montado em runtime (`` `bg-${cor}-500` ``) não gera CSS.
- **Datas** `dd/MM/yyyy`; números em tabela com `tabular-nums`. Patrimônio no formato canônico (`WAP0004491`).
- **Patrimônio repete em casos raros** — a chave é patrimônio + service tag (spec §5). Busca por patrimônio sempre trata múltiplos resultados.
- **Modelo de acesso** (regra vigente abaixo; porquê/migration-a-migration: [`ADR-002`](docs/ADR-002-papeis-e-permissoes.md) §13–14; estado completo: [`ARQUITETURA.md`](docs/ARQUITETURA.md) §4): duas portas. **Login** = domínios corporativos (`src/lib/auth/dominios-email.ts`), **quatro cargos em hierarquia estrita `dev ⊃ admin ⊃ operador ⊃ consulta`**. **Todo logado ATIVO lê tudo** (desativado/arquivado não lê nem escreve — vale no request seguinte); a escrita se restringe — dev/admin escrevem em todas as filiais e só eles alcançam `/admin/**` e o import; operador só nas filiais vinculadas; consulta não escreve. **Duas exceções — `colaboradores` e `itens`:** onde o operador INSERE (nasce inline na movimentação); editar/desativar/apagar seguem `e_admin()`. `e_admin()` = admin OU dev; `e_dev()` = só dev; `pode_escrever()` = escreve algo no acervo. Cargo **nunca** vem de `raw_user_meta_data`; as guardas de Server Action dão a **mensagem** pt-BR, não a segurança — quem decide é o Postgres. **Só o dev:** trocar e-mail, apagar conta (perfil arquivado + conta removida do Auth), encerrar sessões, conceder/revogar o cargo dev — recusa vale no banco (trigger); **ninguém age sobre o próprio acesso**, nem o dev. Cargo/status/vínculos por RPC com a sessão de quem clicou (nunca service role); toda ação administrativa vai para `eventos_admin`. **Zona destrutiva** (`/dev/destrutivo`, só dev — subrota própria, nunca atalho na ficha) e a exceção única — a **mesa de conflitos entre filiais** (`/pendencias`), onde o administrador apaga cadastro em conflito naquele instante: ferramentas NOMEADAS, SQL fixo, `security definer`, backup + trilha na mesma transação. **Console de SQL proibido**; função com SQL/tabela/coluna como parâmetro também. Acervo imutável por **trigger**, não ausência de policy — não segura service role. Detalhe completo: `ARQUITETURA.md` §4.4. **Visualizador** = senha (`admin/senhas`, hash `scrypt` **nativo** — proibido lib de hash) → cookie httpOnly, só `/relatorios/**` — outra porta, não o cargo consulta. As queries dele rodam no servidor com o client administrativo (`resolverAcessoRelatorio`); esse client e a anon key nunca chegam ao navegador dessa sessão. Revogar a senha vale no request seguinte.

## Estrutura de pastas (mapa — não é inventário arquivo a arquivo)

```
src/app/(app)/**      rotas protegidas por área: ativos, movimentacoes, itens, pendencias,
                       relatorios, admin/**, dev/** (+ dev/destrutivo), ajuda, versoes
src/app/login|auth|relatorios/acesso   rotas públicas (login, convite, senha de acesso)
src/components/**     um diretório por área, espelha app/ (ui/ = shadcn, não editar sem motivo)
src/lib/
  supabase/ auth/ actions/ queries/ validators/ layout/ storage/               núcleo transv.
  dominio.ts format.ts busca/ escopo/ filtros/ identidade/ unidades/ varredura/ dominio/  idem
  ativos/ movimentacoes/ itens/ pendencias/ relatorios/ import/ termos/  domínio por área
  colaboradores/ ajuda/ versoes/                                        domínio por área
  types/database.ts (GERADO — não editar à mão)
src/templates/termos/*.docx   7 modelos tagueados, lidos em runtime
supabase/   migrations/ (verdade do banco) · migrations.lock.json (trava) · tests/ · ci/
scripts/    db/ · import/ · termos/ · seed.ts · reset.ts · design/ (prévias estáticas, nunca banco) · perf/ · smoke/
docs/  mockups/
```

Área com convenção própria carrega seu `CLAUDE.md` aninhado ao ler/editar algo ali: `src/lib/auth`, `src/lib/itens`, `src/lib/versoes`, `src/lib/colaboradores`, `src/lib/ajuda`, `src/lib/pendencias`, `src/lib/termos`, `supabase`, `scripts/db`, `scripts/import`, `scripts/termos`, `src/components/layout`, `src/components/ativos`, `src/components/relatorios`. Mapa arquivo-a-arquivo vivo ("quero mudar X → mexo em Y"): [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) §10.

PARE e reporte se os diretórios de topo de `src/lib`/`src/components`, ou a lista de aninhados acima, não baterem com o que você encontrar ao começar uma ordem — sinal de fase que criou área nova sem atualizar este mapa.

## Git

- Branch por fase é **opcional** — commit direto na `main` é permitido. Usou branch? Você mesmo faz o merge quando o checklist passar na autoverificação.
- Commits em pt, conventional: `feat(f2): fluxo de movimentação em lote`, `fix(f3): fuso nas datas do relatório`.
- Proibido: push forçado na `main`, commitar `node_modules`, `.env*`, dados reais.

## Comandos do projeto

- `npm run dev` · `npm run build` · `npm run lint`
- A partir da F1: `npm run db:seed` (fictício) · `npm run db:reset` (zera) · `npm run db:types` (regenera tipos)
- Banco (precisa de Postgres, `DATABASE_URL` aponta o alvo): `npm run db:test` (roteiros `supabase/tests/`) · `npm run db:lock` (**obrigatório** no commit de migration nova) · `npm run db:test:mutations` (injetor) · `npm run db:types:diff` (gate de deriva) — os dois últimos rodam incondicionalmente no CI
- Supabase local (opcional): `supabase start` / `supabase db reset`
- Só na janela do go-live (F4): `npm run carga` (guardas obrigatórias; não é feature)

## Referência visual

Fonte do sistema em toda a UI; nada de fonte externa. Layout/estilo do relatório (`mockups/dashboard-relatorio.html`): `src/components/relatorios/CLAUDE.md`.

ultracode

# Ordem de serviço F21 — Cargos, permissões, vínculo de filiais e controle de usuários

> Ordem de 29/07/2026. Base: `docs/ADR-002-papeis-e-permissoes.md` (o ADR desta mudança — leia
> antes de qualquer código; em conflito entre esta ordem e o ADR, **esta ordem manda** e a
> divergência vai para `docs/DECISOES.md`). Esta ordem REVERTE a decisão de nível único de
> 09/07/2026 (spec §3, "NUNCA criar roles/papéis") pelo caminho que a própria ADR-001 previu na
> emenda de 22/07/2026 ("um ADR novo sobre papéis").
> Numeração: na escrita desta ordem, a última fase é F20B e a última migration é `0060`. Confira
> os próximos números livres e, se houver colisão, renumere (precedente F19/F20B: nomes
> distintos, nada é sobrescrito) e registre.

## §0 — Parâmetros (Johnny edita AQUI antes de colar; o agente NÃO pergunta)

```
ESTORNO_OPERADOR                    = sim   # 'nao' → estorno (ativos e itens) só Admin
TRANSFERENCIA_EXIGE_VINCULO_DESTINO = nao   # 'sim' → transferir exige vínculo também no destino
CONSULTA_EXPORTA_CSV                = sim   # 'nao' → botões de exportação somem para Consulta
BACKFILL                            = admin # todos os usuários existentes viram admin com todas
                                            # as filiais ativas (deploy sem mudança de comportamento)
```

## Missão

Implantar três cargos com hierarquia — **admin ⊃ operador ⊃ consulta** — e vínculo de filiais de
escrita por operador, com a regra valendo no Postgres (RLS + funções), nas Server Actions e na UI;
mais gestão completa de usuários em `/admin/usuarios` (convidar com cargo e filiais, editar,
desativar/reativar com efeito imediato) e auditoria de ações administrativas (`eventos_admin`).
Todo logado continua LENDO tudo (as 5 filiais, todas as telas fora de `/admin`); o vínculo
restringe só escrita. Custo R$ 0: nenhuma dependência nova, nenhum serviço novo, nenhum recurso
pago — só migrations e código.

## Contexto (leia a origem, não descrições dela)

- Doutrina e stack: `@CLAUDE.md` (regras permanentes, modo autônomo, runbook de banco caminho A).
- O ADR desta mudança e o antecessor: `@docs/ADR-002-papeis-e-permissoes.md` ·
  `@docs/ADR-001-rls-por-filial.md` (leitura aberta e caminho do visualizador continuam como lá) ·
  item M de `@docs/DIVIDA-TECNICA.md`.
- Modelo de acesso atual: `@src/lib/auth/acesso.ts` (`getOperador`/`exigirOperador`),
  `@src/lib/supabase/proxy.ts` (roteamento por sessão), `@src/app/(app)/admin/layout.tsx`.
- RLS atual: `@supabase/migrations/0005_rls.sql` + consolidação `@supabase/migrations/0059_advisors_rls_perf.sql`
  (padrão initplan `(select ...)` — siga-o em TODA policy nova).
- Perfis: `@supabase/migrations/0001_profiles.sql`, `@supabase/migrations/0057_perfil_nome_sobrenome.sql`
  (`nome` é coluna GERADA — nunca escrever nela).
- Trigger `security definer` que já antecipa RLS restrita: `@supabase/migrations/0004_maquina_estados.sql`.
- Convite de usuário: `@src/lib/actions/admin.ts` (`convidarUsuario`, `generateLink` sem e-mail) e
  `@src/components/admin/convidar-usuario-dialog.tsx`.
- Nomes REAIS de tabelas/colunas: `@src/lib/types/database.ts` (gerado) e as migrations — confira
  ali antes de escrever qualquer policy/função; não invente coluna.
- Padrão de roteiro SQL auto-verificável: `@supabase/tests/seguranca_catalogo.sql` e vizinhos.
- Comandos: `npm run lint` · `npm run test` (Vitest, 1457+ testes) · `npm run build` ·
  `npm run db:types` · smoke `scripts/smoke/smoke-prod.mjs`.

## Escopo

**Dentro:** migrations novas (numeradas a partir do próximo número livre; nunca editar migration
aplicada), funções e policies de RLS, guardas internas nas RPCs `security definer` que escrevem,
`src/lib/auth/**`, `src/lib/actions/**` (guardas por papel/filial), `/admin/usuarios` completa,
gating de UI (sidebar, layouts, botões de escrita, paleta de comandos, atalho `N`), tabela e aba de
auditoria, seeds fictícios, roteiro `supabase/tests/papeis_rls.sql`, testes Vitest de funções puras
novas, documentação (spec §3, CLAUDE.md, DECISOES, ajuda) e encerramento padrão.

**Fora (não toque):** o fluxo de visualizador por senha (`senha-sessao.ts`, `/relatorios/acesso`,
cookie de visualização) — continua funcionando idêntico; a semântica da máquina de estados e a
imutabilidade de `movimentacoes`/`lancamentos_item`; os domínios de login (`0041`); templates
`.docx`; `src/components/ui/**`; a lógica interna do import (só ganha guarda de papel);
dependência nova NENHUMA; migration antiga NENHUMA; MFA fica para fase futura (backlog).

## O modelo a implementar

### Banco (a camada que vale)

1. `create type public.papel_usuario as enum ('admin','operador','consulta')`.
2. `profiles` + `papel papel_usuario not null default 'operador'` + `ativo boolean not null default true`.
   Backfill conforme §0: todos os perfis existentes → `admin`.
3. `create table public.operador_filiais (usuario_id uuid references profiles(id) on delete cascade,
   filial_id smallint references filiais(id), primary key (usuario_id, filial_id))`. Backfill:
   todo perfil existente × toda filial ativa. RLS ligada; leitura para `authenticated`; NENHUMA
   policy de escrita (escreve só o service role, pelas actions de admin).
4. Funções `security definer`, `stable`, `set search_path = public`, com
   `revoke all ... from public, anon` (padrão 0024/0038/0041):
   - `papel_atual() returns papel_usuario` — NULL se não houver perfil OU `ativo = false` (é o que
     derruba desativado no request seguinte);
   - `e_admin() returns boolean`;
   - `pode_escrever_filial(fid smallint) returns boolean` — admin → true; operador → existe vínculo;
     consulta/inativo/sem perfil → false.
5. Policies novas substituindo as `using (true)` de escrita — **os verbos por tabela não mudam**
   (insert-only continua insert-only; sem update/delete onde hoje não há), muda só o QUEM. Toda
   chamada de função embrulhada em `(select ...)` (initplan, doutrina da 0059). Mapa:
   - `ativos`: insert/update `pode_escrever_filial(filial_id)` (update: USING e WITH CHECK);
   - `movimentacoes`: insert `pode_escrever_filial(filial_id)`; se
     `TRANSFERENCIA_EXIGE_VINCULO_DESTINO = sim`, o with check também exige
     `filial_destino_id is null or pode_escrever_filial(filial_destino_id)`; se
     `ESTORNO_OPERADOR = nao`, acrescente `tipo <> 'estorno' or e_admin()`;
   - `lancamentos_item`: insert `pode_escrever_filial(filial_id)` (mesma regra de estorno via
     `estorna_id` quando `ESTORNO_OPERADOR = nao`);
   - `pendencias_item`: update (resolver) `pode_escrever_filial(filial_id)`;
   - `anotacoes`, `termos_gerados`, `relatorios_gerados`: escrita `papel_atual() in ('admin','operador')`;
   - `filiais`, `motivos`, `itens` (catálogo), `kits_modelos`: escrita `e_admin()`;
   - `senhas_acesso`: **leitura E escrita `e_admin()`** — hoje qualquer logado lê os hashes; feche.
     Antes, confirme por grep que nenhuma leitura fora de `/admin` e do service role depende dela;
   - `import_logs`: escrita como está (RPCs); leitura → `e_admin()` SE nenhuma view/tela fora de
     `/admin/importar` a consome (confira `pg_views` + grep; se consumir, mantenha e registre);
   - `profiles`: leitura como está; update do próprio perfil restrito por **grant de coluna**:
     `revoke update on public.profiles from authenticated;`
     `grant update (primeiro_nome, sobrenome) on public.profiles to authenticated;`
     `papel`/`ativo` mudam só via service role (as policies existentes de update `id = auth.uid()` permanecem).
6. **RPCs `security definer` que escrevem passam por fora de RLS** — audite TODAS
   (`select proname from pg_proc` + grep `security definer` nas migrations) e acrescente guarda
   interna no topo: `criar_compra_lote` → `pode_escrever_filial(<filial do lote>)`; RPCs do import
   (`0032`/`0033`/`0034`/`0037`/`0048`) → `e_admin()`; RPC de snapshot de relatório → papel ∈
   {admin, operador}. RPCs só de LEITURA não ganham guarda de papel. Nenhuma RPC de gatilho volta
   a ser executável por `authenticated` (0038 continua valendo).
7. `create table public.eventos_admin (id, quando timestamptz default now(), autor uuid references
   profiles(id), acao text, alvo text, detalhe jsonb)` — insert-only via service role; leitura
   `e_admin()`; sem update/delete. Registre: convite gerado/reenviado, papel alterado, vínculos
   alterados, usuário desativado/reativado, senha de acesso criada/revogada/renomeada, import
   executado.
8. Uma migration por assunto, comentadas no padrão da casa (contexto, por quê, reversão), aplicadas
   por você em ensaio e produção (caminho A do runbook; backup antes de qualquer passo destrutivo —
   aqui não há passo destrutivo: tudo aditivo + troca de policies). Depois: `npm run db:types`.

### Camada de acesso do app

Em `src/lib/auth/acesso.ts`: `Operador` ganha `papel: PapelUsuario` e `filiaisEscrita: number[]`
(admin → todas as ativas); `getOperador()` lê `papel`/`ativo`/vínculos e devolve `null` para
inativo; nova família de guardas com erros pt-BR — `exigirAdmin()`, `exigirEscrita(filialId)`,
`exigirPapel(minimo)` (hierarquia admin > operador > consulta como função pura testável). Troque
`exigirOperador` action a action conforme a matriz: `admin.ts` (convite, filiais, motivos) /
`senhas.ts` / `kits.ts` / catálogo em `itens.ts` / `importar.ts` → `exigirAdmin()`;
`movimentacoes.ts`, `compras.ts`, `devolucao-fornecedor.ts`, `ativos.ts`, lançamentos em
`itens.ts`, `pendencias.ts`, `termos.ts` → `exigirEscrita(filial da operação)`;
`relatorios.ts` (gerar snapshot) → `exigirPapel('operador')`; `exportar.ts` → logado (ou
`exigirPapel('operador')` se `CONSULTA_EXPORTA_CSV = nao`); `auth.ts` intocado. O RLS é o
guarda-costas; a action é a mensagem amigável — as duas têm de concordar.

### UI e gestão de usuários

- `(app)/layout.tsx` resolve papel/filiais uma vez e distribui; sidebar esconde "Administração"
  para não-admin; `admin/layout.tsx` exige admin (defesa em profundidade).
- Consulta: nenhum CTA de escrita em tela nenhuma (botões de nova movimentação/compra/lançamento,
  estornar, anotar, resolver, corrigir, gerar termo/relatório, atalho global `N`, comandos de
  escrita da paleta — todos condicionados a papel). Formulários de escrita continuam protegidos no
  servidor mesmo se alguém abrir a URL direto.
- Operador: nas telas de escrita, selects de filial oferecem só as vinculadas (a lista completa
  continua visível em filtros de leitura).
- `/admin/usuarios` completa: tabela (nome, e-mail, papel, filiais de escrita, status
  ativo/desativado) servida por action admin (service role lista `auth.users` + `profiles` +
  vínculos); convidar com papel + filiais (mínimo 1 quando operador — validação Zod client E
  server); editar papel/vínculos; desativar/reativar = `profiles.ativo` + ban/unban via
  `auth.admin.updateUserById` (`ban_duration`); reenvio de convite mantido. Guardas de
  autoproteção: não rebaixar/desativar a si mesmo; nunca deixar o sistema sem admin ativo (conte
  antes de gravar). Toda ação grava em `eventos_admin`; aba "Auditoria" simples (tabela paginada,
  filtro por ação) na própria área de usuários.
- Convite: após `generateLink` criar a conta, a MESMA action grava papel + vínculos via service
  role. O papel NUNCA vem de `raw_user_meta_data` (usuário edita o próprio metadata via
  `auth.updateUser` — não é canal confiável).

### Seeds, testes e documentação

- `scripts/seed.ts`/`reset.ts`: perfis fictícios nos três papéis + vínculos variados (guardas
  anti-produção intactas; dados 100% fictícios — regra 2 do CLAUDE.md).
- `supabase/tests/papeis_rls.sql` no padrão auto-verificável da pasta: simule os papéis
  (`set role authenticated` + `request.jwt.claims`) e prove — consulta não insere nada; operador
  insere movimentação/lançamento na filial vinculada e É RECUSADO na não-vinculada; operador não
  toca `filiais`/`motivos`/`senhas_acesso` nem lê `senhas_acesso`; admin tudo; desativado
  (`ativo=false`) não escreve nada; `criar_compra_lote` e uma RPC de import recusam papel
  insuficiente; update de `profiles.papel` como authenticated falha (grant de coluna).
- Vitest para as funções puras novas (hierarquia de papéis, validação mínimo-1-filial) e ajuste
  dos testes que a mudança legitimamente quebrar (ex.: `use-server-exports`, conteúdo da ajuda) —
  nunca enfraquecer teste para passar.
- Documentação: spec §3 e CLAUDE.md (§Modelo de acesso) reescritos; `ADR-002` de *proposto* →
  *aceito* e nota de sucessão na `ADR-001` (só no ponto "papéis"; o resto dela permanece);
  registro em `docs/DECISOES.md`; ajuda `usuarios-e-senhas`, `acesso-e-sessoes`, `administracao`,
  `mapa-das-telas` (e telas com matéria própria que citem permissão) atualizadas com o modelo novo.

## Critérios de aceitação

1. Consulta logada: navega e lê tudo, exporta CSV conforme §0, e NÃO consegue escrever nada — nem
   pela UI (sem botões) nem por request direto (RLS recusa; teste SQL prova).
2. Operador com vínculo só na filial X: escreve em X; recusado em Y no banco (SQL prova) e avisado
   em pt-BR pela action; transferência respeita o parâmetro §0.
3. Admin: comportamento de hoje, mais a gestão de usuários funcionando de ponta a ponta
   (convidar com papel+filiais → aceitar convite → papel correto; editar; desativar derruba o
   usuário no request seguinte; reativar devolve).
4. Autoproteção: rebaixar/desativar a si mesmo e remover o último admin ativo são recusados com
   mensagem clara.
5. `/admin/**` inteiro (UI + actions + RLS + RPCs de import) inacessível para não-admin.
6. `senhas_acesso` ilegível para não-admin; visualizador por senha dos relatórios segue
   funcionando idêntico (smoke prova).
7. Pós-backfill, antes de qualquer ajuste manual de papel: NENHUMA mudança de comportamento para
   os usuários atuais (todos admin com todas as filiais).
8. `npm run lint`, `npm run test` e `npm run build` limpos; `papeis_rls.sql` verde;
   `database.ts` regenerado; advisors do Supabase sem WARN novo de RLS.

## §V — Verificação (rode de verdade, itere até passar)

A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a causa
raiz, repita; nunca suprima erro nem desabilite/delete teste para passar. Rode
`supabase/tests/papeis_rls.sql` nos dois bancos (ensaio e produção) e o smoke
(`scripts/smoke/smoke-prod.mjs`) após aplicar em produção; confira os advisors (novo WARN de RLS =
consertar antes de seguir; o WARN `rls_policy_always_true` de LEITURA continua por-design — ADR-001).
Ao final, revisão adversarial em contexto fresco: o diff contra esta
ordem e contra `docs/ADR-002-papeis-e-permissoes.md`, com atenção a: alguma tabela/RPC de escrita ficou sem
guarda? algum caminho de UI escreve sem checar papel? o backfill preserva o comportamento? aponte
só lacunas de correção/requisito, não estilo — corrija e re-revise até limpar.

## Autonomia, decisões e git

Você roda de forma autônoma (modo do CLAUDE.md): ninguém responderá perguntas — não pare, não
espere confirmação. Régua: (1) esta ordem; (2) a proposta; (3) convenções do repositório;
(4) opção mais simples e reversível — decisões não-óbvias em `docs/DECISOES.md` (data · contexto ·
escolha · motivo). Mesma falha 3 vezes → troque de abordagem e registre. Bloqueio real → contorne
com segurança ou siga com o resto e registre a pendência. Se o ambiente vetar um passo sensível
(push, apply de migration em produção), NÃO insista até abortar: deixe o comando exato pronto e
testado em ensaio, registre no relatório como "pendente de execução pelo Johnny" e siga. Git: commits pequenos e frequentes em
pt-BR estilo conventional (`feat(f21): ...`); branch opcional (`f21-papeis`) com merge próprio ao
fechar o checklist; PROIBIDO push forçado, reset destrutivo, `.env*`, dado real em
seed/teste/fixture. Migrations: ensaio antes de produção, sempre; nunca editar migration aplicada.

## §R — Encerramento e relatório

`CHANGELOG.md` (topo) · `docs/prompts/README.md` (linha da F21) · `README.md` (status) ·
`docs/DECISOES.md` (ADR + decisões da execução) · `docs/RELATORIO-F21.md` em pt-BR com: o que
mudou e por quê (arquivo a arquivo), o checklist desta ordem autoverificado item a item,
**evidências coladas** (saídas reais de lint/test/build, do `papeis_rls.sql`, do smoke e dos
advisors — afirmação sem saída não vale), decisões, pendências e backlog (MFA TOTP para admins,
política de senha do painel, revisão trimestral via `eventos_admin`), e o roteiro manual de 5
minutos para o Johnny (logar como consulta / operador sem vínculo / desativar usuário). Push =
deploy Vercel, só com o §V inteiro verde. Termine a resposta final com um resumo de ~5 linhas em
pt-BR.

## Idioma

UI, mensagens, erros, commits, docs e relatório em pt-BR; identificadores de domínio em português
sem acento (`papel`, `operador_filiais`, `eventos_admin`); utilitários/infra em inglês — a
convenção vigente do repositório.

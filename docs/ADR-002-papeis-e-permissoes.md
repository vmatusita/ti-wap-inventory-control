# ADR-002 — Cargos, permissões e controle de usuários

**Status:** **aceito** · 29/07/2026 (proposto e aprovado pelo Johnny no mesmo dia; executado pela ordem de serviço [`prompts/F21-papeis-ultracode.md`](prompts/F21-papeis-ultracode.md))
**Sucede:** a emenda de 22/07/2026 da **[ADR-001](ADR-001-rls-por-filial.md)** previu exatamente este passo — *"se um dia surgir a necessidade de um operador com poderes menores, isso é um ADR novo sobre papéis, que a spec §3 hoje proíbe"*. A necessidade surgiu (decisão do Johnny, 29/07/2026); este é o ADR novo. A ADR-001 **continua valendo** no que decidiu sobre **leitura** (operador vê todas as filiais) e sobre o caminho do visualizador por senha.
**Contexto do plano de dívida técnica:** item **M** de [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md) — a migration `0059` registrou que mexer no modelo de acesso "exige ADR". Este é ele.

> **Nota de proveniência (30/07/2026 — execução da F21).** Este arquivo foi **materializado no repositório durante a execução da F21**: a ordem o citava como pré-leitura (`docs/ADR-002-papeis-e-permissoes.md`), mas ele existia apenas fora do repo (vault do Johnny). O conteúdo abaixo é o da proposta aprovada, com **três correções factuais** que a medição direta dos bancos derrubou — marcadas com ⚠ **corrigido na execução** e registradas em [`DECISOES.md`](DECISOES.md). Onde a proposta e a ordem divergem, **a ordem manda** (regra do próprio cabeçalho da F21).

## 1. Resumo executivo

Hoje **todo logado pode tudo**: qualquer operador convida usuários, revoga senhas de relatório, desativa filiais, estorna, e roda o import "Substituir tudo" — a operação mais destrutiva do sistema. Não existe como **desligar** um usuário, nem trilha de quem fez ações administrativas.

Este ADR cria três cargos com hierarquia (**Admin ⊃ Operador ⊃ Consulta**), um **vínculo de filiais de escrita** por operador (todos continuam **vendo** as filiais; escrever, só onde tem vínculo — no mínimo uma), **desativação imediata de usuário** e **auditoria de ações administrativas**. Tudo com o que já está pago: Supabase Free + Vercel + Postgres + código. Nenhuma lib nova, nenhum serviço novo, nenhum recurso pago.

## 2. Onde estamos hoje (diagnóstico)

O modelo atual (spec §3) tem duas portas: **operador** (login Supabase restrito aos domínios `@wap.ind.br`, `@stefanini.com`, `@latam.stefanini.com`, nível único) e **visualizador** (senha de acesso → cookie assinado, só `/relatorios/**`). A base é sólida — trigger que barra domínio no banco (`0041`), sessão de 24h, anti-prefetch de convite, scrypt + rate limit nas senhas (`0025`), RPCs endurecidas (`0040`, `0056`) — mas a autorização parou no "está logado?":

- RLS de todas as tabelas de negócio é `using (true)` para `authenticated` (`0005`, consolidada na `0059`). O próprio código chama isso de "item M da dívida técnica".
- As Server Actions só checam sessão (`idOperador`), nunca *quem* é.
- `/admin/**` inteiro (usuários, senhas, filiais, motivos, itens, kits, **importar**) está aberto a qualquer logado.
- ⚠ **corrigido na execução:** a proposta afirmava que *"qualquer logado lê os hashes das senhas de acesso (`senhas_acesso` tem select `true`)"*. **Falso.** A migration **`0012`** (achado da revisão da F3) já dropou **as duas** policies de `senhas_acesso`; com RLS habilitada e **zero policies**, `anon` e `authenticated` não leem nem escrevem — só a service role. Medido nos dois bancos em 29/07/2026: `senhas_acesso` = **0 policies**. O endurecimento pedido **já estava feito, e mais forte do que o ADR pedia** — ver §4.1.
- Não há desativação de usuário: quem saiu da equipe continua entrando até alguém apagar a conta à mão no painel do Supabase.
- Não há registro de quem convidou, revogou senha, mudou cadastro.

## 3. O modelo

Três cargos, hierarquia estrita, e um vínculo de escrita por filial:

| Capacidade | Admin | Operador | Consulta |
|---|---|---|---|
| Ver todas as telas e todas as filiais (listas, fichas, relatórios, dashboards) | ✓ | ✓ | ✓ |
| Exportar CSV | ✓ | ✓ | ✓ *(parâmetro §10.3 = sim)* |
| Registrar movimentações, compras, devolução a fornecedor, trocas | todas as filiais | **filiais vinculadas** | — |
| Lançar itens por quantidade | todas | vinculadas | — |
| Editar ativo, corrigir patrimônio, service tag, anotar | todas | vinculadas | — |
| Resolver pendências | todas | vinculadas | — |
| Gerar termos de responsabilidade/devolução | todas | vinculadas | — |
| Estornar (ativos e itens) | ✓ | vinculadas *(parâmetro §10.1 = sim)* | — |
| Gerar/congelar snapshot de relatório | ✓ | ✓ | — |
| Administração: usuários, senhas de acesso, filiais, motivos, catálogo de itens, kits | ✓ | — | — |
| Import de startup ("Substituir tudo") | ✓ | — | — |

O **vínculo de filiais** vale só para escrita e só para o cargo Operador: todo operador tem no mínimo uma filial vinculada (a UI impede salvar com zero; no banco, zero vínculo simplesmente fecha toda escrita — **falha segura**). Admin escreve em todas sem precisar de vínculo; Consulta não escreve em lugar nenhum. Na transferência entre filiais, o operador precisa de vínculo na filial de **origem**; o destino é livre (enviar para outra filial é o fluxo normal — quem recebe é outro operador), conforme o parâmetro §10.2.

O que **não muda**: leitura ampla para todo logado (é o que a ADR-001 sustentou — o recorte que faz sentido aqui é por papel na *escrita*, não por filial na *leitura*), o visualizador por senha dos relatórios (fica exatamente como está), a imutabilidade de movimentações e lançamentos, os domínios de login e o convite como único caminho de entrada.

## 4. Como funciona por baixo (arquitetura)

A regra crítica continua vivendo no Postgres — a UI segue sendo a segunda linha, nunca a única (doutrina do CLAUDE.md). Três camadas, da mais dura para a mais amigável:

**Camada 1 — banco (a que vale).** `profiles` ganha `papel` (`enum papel_usuario: 'admin' | 'operador' | 'consulta'`, default `'operador'`) e `ativo boolean not null default true`. Nova tabela `operador_filiais (usuario_id, filial_id)` com PK composta. Três funções `security definer`, `stable`, com `search_path` fixo e `revoke` de `public`/`anon` (padrão das `0024`/`0038`/`0041`):

```sql
public.papel_atual()  -- papel do usuário logado; NULL se sem perfil OU ativo = false
public.e_admin()      -- papel_atual() = 'admin'
public.pode_escrever_filial(fid smallint)
  -- admin → true · operador → existe vínculo em operador_filiais · consulta/inativo → false
```

As policies novas substituem as `using (true)` — sempre com a função embrulhada em `(select ...)`, o padrão initplan que a `0059` instituiu (avaliada uma vez por statement; custo ~zero na escala do banco, ~3 mil linhas na maior tabela). Mapa por tabela — os **verbos não mudam** (o que era insert-only continua insert-only), muda só o *quem*:

| Tabela | Leitura | Escrita |
|---|---|---|
| `ativos` | logado | insert/update: `pode_escrever_filial(filial_id)` |
| `movimentacoes` | logado | insert: `pode_escrever_filial(filial_id)` (imutável como hoje) |
| `lancamentos_item` | logado | insert: `pode_escrever_filial(filial_id)` (imutável como hoje) |
| `pendencias_item` | logado | update (resolver): `pode_escrever_filial(filial_id)` |
| `anotacoes`, `termos_gerados`, `relatorios_gerados` | logado | papel ∈ {admin, operador} |
| `filiais`, `motivos`, `itens` (catálogo), `kits_modelos` | logado | `e_admin()` |
| `senhas_acesso` | ⚠ **service role apenas** (ver §4.1) | ⚠ **service role apenas** |
| `import_logs` | `e_admin()` (condição da ordem verificada — ver §4.2) | como está (RPCs) |
| `profiles` | logado | update do próprio: **só colunas `primeiro_nome`/`sobrenome`** via grant de coluna; `papel`/`ativo` só pelo service role |
| `operador_filiais` | logado | nenhuma policy (só service role, pelas actions de admin) |
| `eventos_admin` (nova) | `e_admin()` | nenhuma policy (só service role) |

### 4.1 ⚠ `senhas_acesso`: já fechada, e mais do que o pedido

A proposta pedia `leitura E escrita e_admin()`. A medição (§2) mostrou que a tabela já está em **deny-all para `anon`/`authenticated`** desde a `0012` — só a service role chega nela, e **todo** o app já a trata server-side com o client administrativo. **Trocar isso por `e_admin()` seria afrouxar**: abriria a coluna `hash` para o client de sessão de um admin, reintroduzindo exatamente o vetor de brute-force offline que a `0012` fechou (RLS é row-level, não column-level).

**Decisão da execução:** **manter zero policies**. O critério de aceitação 6 da ordem ("`senhas_acesso` ilegível para não-admin") fica satisfeito *a fortiori* — é ilegível para **todos** os papéis via PostgREST, inclusive admin. O controle de quem gerencia senhas passa a ser feito na camada de action (`exigirAdmin()`) + rota, que é onde ele pode existir sem expor o hash. Registrado em [`DECISOES.md`](DECISOES.md).

### 4.2 `import_logs`: leitura restrita a admin (condição verificada)

A ordem condicionava restringir a leitura a `e_admin()` a *"SE nenhuma view/tela fora de `/admin/importar` a consome"*. **A condição se cumpre**, medido em 29/07/2026:

- **Nenhuma view** do banco referencia `import_logs` (`pg_views` + grep nas migrations — as duas únicas menções fora da `0031` são comentários na `0033`).
- **Dois** consumidores de leitura no código, ambos com o client de sessão e ambos dentro da superfície `/admin/importar`: `listarImportLogs` ([src/lib/queries/import-logs.ts:280](../src/lib/queries/import-logs.ts)), importado só por `src/app/(app)/admin/importar/page.tsx`; e `urlBackup` ([src/lib/actions/importar.ts:444](../src/lib/actions/importar.ts)), chamado só por `src/components/admin/importar/baixar-backup-button.tsx` e `importar-wizard.tsx`.

Logo a leitura passa a `e_admin()`, coerente com o resto de `/admin/**`. A **escrita** continua como está (só pelas RPCs).

### 4.3 Dois pontos que uma implementação apressada erraria

1. O trigger `aplicar_movimentacao` é `security definer` **de propósito** ("para poder atualizar ativos mesmo com RLS restrita" — comentário da `0004`), então **gatear o INSERT de `movimentacoes` basta**: o efeito derivado no ativo (e o INSERT em `pendencias_item` da F18) continua funcionando por dentro.
2. As **RPCs `security definer` que escrevem** passam por fora das policies e precisam de guarda interna. ⚠ **corrigido na execução:** a auditoria de `pg_proc` nos dois bancos mostrou que, das RPCs de escrita, **`criar_compra_lote` e `devolver_ao_fornecedor` são `security INVOKER`** (`prosecdef = false`) — logo já estão sujeitas às policies novas, sem bypass. A **única** RPC `security definer` que escreve e é executável por `authenticated` é **`importar_ativos_substituir`**, que recebe a guarda `e_admin()`. As demais secdef (`aplicar_movimentacao`, `handle_new_user`, `registrar_tentativa_senha`) são triggers/internas sem `execute` para `authenticated`. A guarda em `criar_compra_lote` é acrescentada de todo modo — **cinto e suspensório**, pela mensagem de erro em pt-BR antes de o RLS recusar em SQLSTATE cru.

**Por que o papel mora em `profiles` e não no JWT** (alternativa considerada e rejeitada): o caminho "custom claims no token" é mais rápido por request, mas rebaixamento/desativação só valeria no próximo refresh do token (até ~1h). O projeto tem doutrina explícita de revogação **no request seguinte** (senhas de acesso, OS-F3 3.9.3) — com o papel lido do banco via função, **rebaixar ou desativar alguém vale na próxima requisição**. Na escala de ~dezena de usuários, a diferença de performance é irrelevante.

## 5. Controle de usuários (a parte de gestão)

`/admin/usuarios` deixa de ser só "gerar convite" e vira gestão de verdade:

- **Convidar** escolhendo cargo e filiais de escrita (mínimo 1 quando Operador). O convite continua por link copiável (decisão de custo R$ 0 da F6); após o `generateLink`, **a mesma action** grava papel e vínculos via service role. O papel **nunca** vem de `raw_user_meta_data` — o usuário edita o próprio metadata via `auth.updateUser`, então não é canal confiável.
- **Editar** cargo e vínculos de quem já existe.
- **Desativar/reativar** na hora: `profiles.ativo = false` + ban no Supabase Auth (`ban_duration`). O ban impede novo login; o `ativo = false` derruba **imediatamente** quem já está com sessão aberta, porque `papel_atual()` devolve NULL e toda policy fecha — mesma filosofia da revogação de senha de acesso.
- **Proteções**: ninguém rebaixa nem desativa a si mesmo; o último admin ativo não pode ser rebaixado/desativado (sem isso, um clique errado tranca o sistema inteiro).
- **Auditoria**: tabela `eventos_admin` (insert-only, via service role) registrando convite gerado/reenviado, papel alterado, vínculos alterados, usuário (des)ativado, senha de acesso criada/revogada/renomeada, import executado — quem, quando, o quê. Visível só para admin, numa aba simples da tela de usuários.

## 6. Rollout sem susto (e sem trancar ninguém)

A migração de dados é o truque que torna o deploy um não-evento: o backfill marca **todos os usuários existentes como `admin` com vínculo em todas as filiais ativas** — ou seja, no dia do deploy o comportamento é *idêntico* ao de hoje, ninguém perde acesso, nada quebra. Depois, o Johnny (na tela nova) rebaixa quem deve ser Operador/Consulta e ajusta vínculos, no seu tempo.

Ordem de aplicação: migrations primeiro (ensaio → produção, caminho A do runbook), app depois; reversão é recriar as policies antigas (documentado na própria migration, como a `0059` fez).

## 7. Custo: R$ 0, item a item

Tudo aqui é migration SQL + código TypeScript no repositório que já existe: RLS, funções, enum, tabelas, telas — Postgres e Next.js, já pagos (Supabase Free + Vercel). Nenhuma dependência nova (a stack fechada do CLAUDE.md permanece intacta), nenhum serviço novo, nenhum plano pago. O extra opcional de MFA também é grátis: a doc oficial do Supabase confirma que o **MFA TOTP (app autenticador) é "free to use" e vem habilitado em todos os projetos** — só o MFA por SMS é pago, e fica fora. A política de senha mínima é configuração do painel (grátis, sem código).

## 8. Extras recomendados (fase 2, backlog — também R$ 0)

Não entram na F21 para não inchá-la, mas ficam registrados: **MFA TOTP opcional para admins** (telas de enrolar/desafiar via API nativa do Supabase); **senha mínima mais forte** no painel de Auth (ex.: 10+ caracteres); **revisão periódica de acessos** — uma olhada trimestral em `eventos_admin` + lista de usuários ativos, que a própria tela nova viabiliza; e o item que a ADR-001 apontou como o risco real, que segue de pé e independente desta fase: **tirar o service_role do caminho do visualizador** (servir as leituras do relatório por cliente anon + policies de SELECT derivadas do escopo do cookie).

## 9. Alternativas consideradas e rejeitadas

**Custom claims no JWT** — rejeitada pela latência de revogação (§4). **Matriz fina de permissões por usuário** (pode importar, pode estornar…) — rejeitada: para uma equipe pequena, multiplica telas, testes e estados possíveis sem ganho real; os 3 cargos cobrem os casos e a matriz pode nascer depois *por cima* deles se um dia faltar. **Restringir leitura por filial** — rejeitada por decisão do Johnny (todos veem tudo; relatórios consolidados dependem disso). **SSO/SAML corporativo** — recurso pago/enterprise, fora por custo. **MFA por SMS** — pago, fora; o TOTP grátis cobre.

## 10. Parâmetros da execução (fixados pelo Johnny no §0 da ordem F21)

1. `ESTORNO_OPERADOR = sim` — operador estorna nas filiais vinculadas (estorno já é restrito à última movimentação e é a correção normal do dia a dia).
2. `TRANSFERENCIA_EXIGE_VINCULO_DESTINO = nao` — origem vinculada basta.
3. `CONSULTA_EXPORTA_CSV = sim` — exportar é leitura.
4. `BACKFILL = admin` — todos os existentes → `admin` com todas as filiais (§6).

## 11. Consequências

- **Positivas:** a autorização deixa de parar no "está logado?"; `/admin/**` e o import destrutivo ficam restritos; existe desligar-usuário com efeito no request seguinte; existe trilha de auditoria; o item **M** da dívida técnica sai de "aberto por decisão" para "resolvido no que importava" (escrita), mantendo a leitura aberta como a ADR-001 decidiu.
- **Negativas / a aceitar:** mais superfície de policy para manter (cada tabela de escrita nova precisa nascer com a policy certa — o roteiro `supabase/tests/papeis_rls.sql` é a rede); o WARN `rls_policy_always_true` do advisor **continua**, agora só nas policies de **leitura**, e segue por-design (ADR-001); dois lugares passam a ter de concordar (RLS e action) — divergência entre eles é bug, e o roteiro SQL + os testes cobrem.
- **Neutro:** o visualizador por senha e a máquina de estados não são tocados.

## 12. Impacto em documentos

Spec §3 e CLAUDE.md ("Modelo de acesso… NUNCA criar roles/papéis") reescritos para o modelo novo; este ADR-002 nasce **aceito** e a ADR-001 ganha nota de sucessão no ponto "papéis"; registro em [`DECISOES.md`](DECISOES.md); páginas de ajuda `usuarios-e-senhas`, `acesso-e-sessoes`, `administracao` e `mapa-das-telas` atualizadas (e seus testes de conteúdo, que são rigorosos); `README.md`/`CHANGELOG.md` no encerramento; `database.ts` regenerado; seeds fictícios com papéis variados; roteiro SQL novo `supabase/tests/papeis_rls.sql` no padrão auto-verificável da pasta.

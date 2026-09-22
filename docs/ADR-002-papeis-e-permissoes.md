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

Três cargos, hierarquia estrita, e um vínculo de escrita por filial *(a F22 acrescentou um quarto cargo no topo — **Dev**, coluna da esquerda; ver §13)*:

| Capacidade | Dev | Admin | Operador | Consulta |
|---|---|---|---|---|
| Ver todas as telas e todas as filiais (listas, fichas, relatórios, dashboards) | ✓ | ✓ | ✓ | ✓ |
| Exportar CSV | ✓ | ✓ | ✓ | ✓ *(parâmetro §10.3 = sim)* |
| Registrar movimentações, compras, devolução a fornecedor, trocas | todas as filiais | todas as filiais | **filiais vinculadas** | — |
| Lançar itens por quantidade | todas | todas | vinculadas | — |
| Editar ativo, corrigir patrimônio, service tag, anotar | todas | todas | vinculadas | — |
| Resolver pendências | todas | todas | vinculadas | — |
| Gerar termos de responsabilidade/devolução | todas | todas | vinculadas | — |
| Estornar (ativos e itens) | ✓ | ✓ | vinculadas *(parâmetro §10.1 = sim)* | — |
| Gerar/congelar snapshot de relatório | ✓ | ✓ | ✓ | — |
| Administração: usuários, senhas de acesso, filiais, motivos, kits, tipos de item | ✓ | ✓ | — | — |
| Catálogo de itens: **criar** | ✓ | ✓ | ✓ *(F41 — inline no fluxo)* | — |
| Catálogo de itens: editar, desativar, apagar | ✓ | ✓ | — | — |
| Import de startup ("Substituir tudo") | ✓ | ✓ | — | — |
| **Gestão de conta**: trocar e-mail, apagar conta, encerrar sessões (F22) | ✓ | — | — | — |
| **Conceder/revogar o cargo Dev**, e agir sobre quem é Dev (F22) | ✓ | — | — | — |
| **Área `/dev`**: diagnóstico, checagens de integridade, auditoria completa, manutenção (F22) | ✓ | — | — | — |

O **vínculo de filiais** vale só para escrita e só para o cargo Operador: todo operador tem no mínimo uma filial vinculada (a UI impede salvar com zero; no banco, zero vínculo simplesmente fecha toda escrita — **falha segura**). Admin escreve em todas sem precisar de vínculo; Consulta não escreve em lugar nenhum. Na transferência entre filiais, o operador precisa de vínculo na filial de **origem**; o destino é livre (enviar para outra filial é o fluxo normal — quem recebe é outro operador), conforme o parâmetro §10.2.

O que **não muda**: leitura ampla para todo logado **ATIVO** (é o que a ADR-001 sustentou — o recorte que faz sentido aqui é por papel na *escrita*, não por filial na *leitura*), o visualizador por senha dos relatórios (fica exatamente como está), a imutabilidade de movimentações e lançamentos, os domínios de login e o convite como único caminho de entrada.

> ⚠ **Emenda de 30/07/2026 (F22 — o quarto cargo).** A hierarquia passou a ser **dev ⊃ admin ⊃ operador ⊃ consulta**. O dev faz tudo que o admin faz (e a maior parte disso ele herda **sem policy nova**, porque `e_admin()` passou a significar "nível administrador"), mais a gestão de conta que só existia no painel do Supabase, e é intocável por quem está abaixo dele. Nada do que este ADR decidiu para admin/operador/consulta muda. Detalhes, motivos e consequências no **§13**.

> ⚠ **Emenda de 30/07/2026 (migration `0070`).** A leitura segue ampla *por cargo* e *por filial* — `consulta` lê o app inteiro, `operador` lê as cinco filiais —, mas ganhou um **piso**: perfil desativado não lê mais nada. O texto original dizia "todo logado LÊ tudo", e isso era literalmente verdade demais: `ativo = false` fechava só a ESCRITA, e o access token de quem foi desligado continua valendo ~1h, tempo em que o acervo inteiro saía por `GET /rest/v1/ativos?select=*` com a anon key do bundle. As 5 views (`security_invoker = true`) e as 7 RPCs `rel_*` (invoker) derivavam o mesmo vazamento. O piso é `papel_atual() is not null` nas 13 policies de SELECT de `public` e no SELECT do bucket `termos`. Ver `docs/DECISOES.md` (2026-07-30).

## 4. Como funciona por baixo (arquitetura)

A regra crítica continua vivendo no Postgres — a UI segue sendo a segunda linha, nunca a única (doutrina do CLAUDE.md). Três camadas, da mais dura para a mais amigável:

**Camada 1 — banco (a que vale).** `profiles` ganha `papel` (`enum papel_usuario: 'admin' | 'operador' | 'consulta'`, default `'operador'`) e `ativo boolean not null default true`. Nova tabela `operador_filiais (usuario_id, filial_id)` com PK composta. Três funções `security definer`, `stable`, com `search_path` fixo e `revoke` de `public`/`anon` (padrão das `0024`/`0038`/`0041`):

```sql
public.papel_atual()  -- papel do usuário logado; NULL se sem perfil OU ativo = false
public.e_admin()      -- papel_atual() = 'admin'
public.pode_escrever_filial(fid smallint)
  -- admin → true · operador → existe vínculo em operador_filiais · consulta/inativo → false
```

> ⚠ **Emenda de 30/07/2026 (F22, migrations `0071`–`0074`).** O enum ganhou `'dev'` (`add value ... before 'admin'`, para manter "ordem dos labels = ordem de força") e as funções acima passaram a ser **quatro**: `papel_atual()` também devolve NULL para perfil **arquivado** (`excluido_em is not null`, `0073`); **`e_admin()` deixou de significar "o cargo é admin" e passou a significar "o cargo é de NÍVEL administrador"** (`in ('admin','dev')`) — é essa redefinição que faz as ~20 policies de `/admin` e a guarda da RPC do import herdarem o dev **sem serem reescritas**; entram `e_dev()` (`= 'dev'`) e `pode_escrever()` ("escreve algo no acervo", espelho de `podeEscrever()` do app); e `pode_escrever_filial()` trata dev como admin. A herança tinha **dois buracos**, tapados na `0072`: `pode_escrever_filial()` não chamava `e_admin()` (tinha o seu próprio `= 'admin'`), e **cinco** policies gateavam por lista literal `papel_atual() in ('admin','operador')` — `anotacoes`, `relatorios_gerados` e as três de escrita do bucket `termos` —, que redefinição de função nenhuma alcança; as cinco passaram a chamar `pode_escrever()`, de modo que o quinto cargo, se houver, é uma linha. Ver **§13**.

> ⚠ **Emenda de 22/09/2026 (F62, migrations `0152`–`0158`).** O cargo e o `ativo` saíram de `profiles` e foram para
> **`membros (empresa_id, profile_id, papel, ativo)`** — uma linha por empresa em que a pessoa trabalha; `profiles.papel`/
> `ativo` ficaram **congelados** (legado, rede de reversão). `papel_atual()` continua sem parâmetro: é a **ponte**, que
> responde pela membership na empresa legada (a WAP). `operador_filiais` passou a ser o vínculo da **membership**
> (`membro_id`, `empresa_id`, FKs compostas). A escolha de fundo deste §4 continua valendo — cargo em TABELA consultada
> a cada request, nunca em claim do JWT — e ficou mais necessária com várias empresas. Ver **§15**.

> ⚠ **Emenda de 31/08/2026 (F41, migration `0125`).** `itens` deixou de ser cadastro de admin **no
> INSERT**: a policy passou de `e_admin()` para `pode_escrever()`. Com isso são **DOIS** os cadastros
> em que o operador insere — `colaboradores` (F37/D5) e `itens` —, e a razão é a mesma, palavra por
> palavra: é ele quem cadastra a pessoa e o acessório **inline no meio da movimentação**, e exigir
> admin ali quebra o fluxo na mão dele. O custo de não abrir estava medido: a maioria dos itens do
> acervo sequer estava cadastrada.
>
> **A abertura é cirúrgica, e o contraste importa.** Só o INSERT mudou: `admin atualiza` e
> `admin apaga` seguem `e_admin()` — criar, sim; editar e desativar, não, exatamente como em
> colaborador. E `tipos_item` (`0114`) **continua** `e_admin()` no INSERT, de propósito: tipo é
> VOCABULÁRIO administrado, item é CADASTRO OPERACIONAL que nasce no fluxo. As três camadas seguem
> alinhadas — policy `pode_escrever()`, guarda `exigirPapel(…, 'operador')` em `criarItemInline`, e
> a tela oferecendo "Cadastrar" a quem escreve.
>
> O par de cenários que trava isso está em `supabase/tests/papeis_rls.sql`: **3c** (o operador CRIA)
> e **3c-quater** (o operador NÃO edita — 0 linhas, no molde do 3c-ter). O 3c dizia o contrário até a
> véspera, e virou porque a REGRA virou; ata em `docs/DECISOES.md`.

As policies novas substituem as `using (true)` — sempre com a função embrulhada em `(select ...)`, o padrão initplan que a `0059` instituiu (avaliada uma vez por statement; custo ~zero na escala do banco, ~3 mil linhas na maior tabela). Mapa por tabela — os **verbos não mudam** (o que era insert-only continua insert-only), muda só o *quem*:

> **Nota de emenda (F59, 16/09/2026).** O "sempre embrulhada" vale para função **sem dado da linha** (`papel_atual()`, `e_admin()`, `pode_escrever()`): aí o `(select …)` vira `InitPlan`. Para função que **recebe** a linha — as da tabela abaixo —, embrulhar não iça nada: vira sub-select correlacionado, avaliado por linha (medido: `SubPlan` com um loop por linha). A régua vigente é a **emenda F59 da `MATRIZ-REGRAS.md`** (R-ACC-63 em diante), e as ocorrências de hoje que dependem da linha estão declaradas, uma a uma, em `supabase/tests/catalogo_policies.sql` (`k_excecoes_predicado`).

| Tabela | Leitura | Escrita |
|---|---|---|
| `ativos` | logado ativo | insert/update: `pode_escrever_filial(filial_id)` |
| `movimentacoes` | logado ativo | ⚠ insert: `pode_escrever_filial(filial_id)` **E** `pode_escrever_filial(snapshot_anterior->>'filial_id')` — ver §4.4 (imutável como hoje) |
| `lancamentos_item` | logado ativo | ⚠ insert: `pode_escrever_filial(filial_id)` **E** `estorno_item_coerente(estorna_id, filial_id, item_id)` — ver §4.4 (imutável como hoje) |
| `pendencias_item` | logado ativo | update (resolver): `pode_escrever_filial(filial_id)` |
| `anotacoes`, `relatorios_gerados` | logado ativo | papel ∈ {admin, operador} → **`pode_escrever()`** desde a `0072` (inclui dev) |
| `termos_gerados` | logado ativo | ⚠ `pode_escrever_termo(ativo_ids)` (a filial dos ativos, LIDA do banco) **E**, só na WITH CHECK, `termo_ancora_coerente(movimentacao_ids, ativo_ids)` + `arquivo_path = id‖'.docx'` — ver §4.4 (`0069`) |
| `storage.objects` bucket `termos` | logado ativo | ⚠ cargo ∈ {admin, operador} → **`pode_escrever()`** (`0072`) **E** `pode_escrever_arquivo_termo(name)` (`0069`) |
| `filiais`, `motivos`, `kits_modelos`, `tipos_item` | logado ativo | `e_admin()` |
| `itens` (catálogo) | logado ativo | ⚠ **insert: `pode_escrever()`** desde a F41 (`0125`); update/delete: `e_admin()` — ver a emenda do §4 |
| `senhas_acesso` | ⚠ **service role apenas** (ver §4.1) | ⚠ **service role apenas** |
| `import_logs` | `e_admin()` (condição da ordem verificada — ver §4.2) | como está (RPCs) |
| `profiles` | logado ativo | update do próprio: **só colunas `primeiro_nome`/`sobrenome`** via grant de coluna; `papel`/`ativo` ⚠ **só pelas RPCs de gestão** desde a `0074` (era o service role), com o trigger `profiles_guarda_dev` (`0073`) recusando todo o resto — inclusive o service role |
| `operador_filiais` | logado ativo | nenhuma policy — ⚠ desde a `0074`, pela RPC `definir_vinculos_usuario` (era o service role) |
| `eventos_admin` (nova) | `e_admin()` (passou a incluir dev) | nenhuma policy (só service role) |

### 4.1 ⚠ `senhas_acesso`: já fechada, e mais do que o pedido

A proposta pedia `leitura E escrita e_admin()`. A medição (§2) mostrou que a tabela já está em **deny-all para `anon`/`authenticated`** desde a `0012` — só a service role chega nela, e **todo** o app já a trata server-side com o client administrativo. **Trocar isso por `e_admin()` seria afrouxar**: abriria a coluna `hash` para o client de sessão de um admin, reintroduzindo exatamente o vetor de brute-force offline que a `0012` fechou (RLS é row-level, não column-level).

**Decisão da execução:** **manter zero policies**. O critério de aceitação 6 da ordem ("`senhas_acesso` ilegível para não-admin") fica satisfeito *a fortiori* — é ilegível para **todos** os papéis via PostgREST, inclusive admin. O controle de quem gerencia senhas passa a ser feito na camada de action (`exigirAdmin()`) + rota, que é onde ele pode existir sem expor o hash. Registrado em [`DECISOES.md`](DECISOES.md).

### 4.2 `import_logs`: leitura restrita a admin (condição verificada)

A ordem condicionava restringir a leitura a `e_admin()` a *"SE nenhuma view/tela fora de `/admin/importar` a consome"*. **A condição se cumpre**, medido em 29/07/2026:

- **Nenhuma view** do banco referencia `import_logs` (`pg_views` + grep nas migrations — as duas únicas menções fora da `0031` são comentários na `0033`).
- **Dois** consumidores de leitura no código, ambos com o client de sessão e ambos dentro da superfície `/admin/importar`: `listarImportLogs` ([src/lib/queries/import-logs.ts:280](../src/lib/queries/import-logs.ts)), importado só por `src/app/(app)/admin/importar/page.tsx`; e `urlBackup` ([src/lib/actions/importar.ts:444](../src/lib/actions/importar.ts)), chamado só por `src/components/admin/importar/baixar-backup-button.tsx` e `importar-wizard.tsx`.

Logo a leitura passa a `e_admin()`, coerente com o resto de `/admin/**`. A **escrita** continua como está (só pelas RPCs).

### 4.3 Dois pontos que uma implementação apressada erraria

1. ⚠ **corrigido na execução — esta era a premissa mais errada do ADR.** O texto original dizia: *"o trigger `aplicar_movimentacao` é `security definer` de propósito, então **gatear o INSERT de `movimentacoes` basta**"*. A primeira metade é verdadeira e importante (é por ela que o efeito derivado no ativo, e o INSERT em `pendencias_item` da F18, continuam funcionando com RLS restrita). A segunda **não segue dela** — e é justamente por o trigger ser `definer` que ela é perigosa. Ver **§4.4**: gatear só o INSERT de `movimentacoes` **não basta**, porque a coluna gateada é escolhida por quem escreve.
2. As **RPCs `security definer` que escrevem** passam por fora das policies e precisam de guarda interna. ⚠ **corrigido na execução:** a auditoria de `pg_proc` nos dois bancos mostrou que, das RPCs de escrita, **`criar_compra_lote` e `devolver_ao_fornecedor` são `security INVOKER`** (`prosecdef = false`) — logo já estão sujeitas às policies novas, sem bypass. A **única** RPC `security definer` que escreve e é executável por `authenticated` é **`importar_ativos_substituir`**, que recebe a guarda `e_admin()`. As demais secdef (`aplicar_movimentacao`, `handle_new_user`, `registrar_tentativa_senha`) são triggers/internas sem `execute` para `authenticated`. A guarda em `criar_compra_lote` é acrescentada de todo modo — **cinto e suspensório**, pela mensagem de erro em pt-BR antes de o RLS recusar em SQLSTATE cru.

### 4.4 ⚠ Não gateie a coluna que o escritor escolhe (a lição que custou duas migrations)

Acrescentado **depois** da revisão adversarial da F21, porque o desenho original errou aqui e o erro chegou a ser aplicado em produção antes de ser encontrado.

A regra que o §4 dava — *"a policy de escrita olha `pode_escrever_filial(filial_id)`"* — parece uniforme, mas **só é correta quando `filial_id` É o objeto da escrita**. Quando ele é apenas um *rótulo* que o cliente informa sobre outra entidade, gateá-lo é o padrão do **deputado confuso**: a policy confere um dado que o próprio atacante escolheu.

| Tabela | `filial_id` é… | Predicado suficiente? |
|---|---|---|
| `lancamentos_item` | **o objeto** — o saldo daquela filial é o que muda | Sim para o saldo. **Não** para `estorna_id`, que é ponteiro livre para outra linha → `estorno_item_coerente(...)` (`0068`) |
| `ativos` | **o objeto** — a linha gateada é a que muda | Sim (USING + WITH CHECK) |
| `movimentacoes` | **um rótulo**: o objeto real é o ATIVO, cuja filial é outro fato do banco | **Não.** Precisa também da filial de ORIGEM lida do banco → `snapshot_anterior->>'filial_id'` (`0067`) |

**O exploit, reproduzido no ensaio** (operador vinculado só à filial 1, ativo na filial 2): `insert into movimentacoes (ativo_id=<ativo da f2>, tipo='transferencia', filial_id=1, filial_destino_id=1)` foi **aceito** — e o trigger `security definer`, que por design escreve em `ativos` sem passar por policy, **moveu o ativo para a filial 1**. A partir daí toda escrita nele era legítima. Variantes: `ajuste` com `status_resultante='descartado'`, e `saida` trocando o detentor.

**A fonte confiável, quando ela existe, é o que o BANCO já leu.** `aplicar_movimentacao` preenche `new.snapshot_anterior` a partir de `select * into v_ativo from ativos where id = new.ativo_id for update` — sob lock, e **sobrescrevendo** o que o cliente tenha mandado nesse campo. Usar `exists (select ... from ativos ...)` **não** serve: naquele ponto o trigger já moveu o ativo, e o `exists` recusaria a transferência legítima que o §10.2 autoriza. A ordem de avaliação (BEFORE trigger → WITH CHECK) foi confirmada por teste.

**Ao escrever a próxima policy de escrita, pergunte:** *o dado que eu estou gateando é o que muda, ou é o que o escritor diz sobre outra coisa que muda?* Se for o segundo, gateie também a outra coisa — lida do banco, nunca do payload.

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

## 13. Emenda: Cargo dev — 30/07/2026

**Status:** aceito · 30/07/2026 (decisão do Victor; executada pela ordem [`prompts/F22-cargo-dev-ultracode.md`](prompts/F22-cargo-dev-ultracode.md), migrations `0071`–`0078`). Esta seção **acrescenta** um cargo ao modelo do §3; nada do que este ADR decidiu para admin, operador e consulta é revogado. Atas em [`DECISOES.md`](DECISOES.md) (2026-07-30 · F22).

> ⚠ **Emenda de 22/09/2026 (F62).** O cargo mora em `membros` (§15). A rede do dev passou a existir nos DOIS lugares:
> `membros_guarda_dev()` (na membership, a fonte viva) e `profiles_guarda_dev()` (na coluna congelada, que agora
> reconhece como dev também quem é dev pela membership). `exigir_gestao_de` lê o cargo do alvo em `membros`; as RPCs
> gravam lá; `apagar_usuario` desativa todas as memberships da conta. `plataforma_admins` + `e_plataforma()` nascem
> sem consumidor — a `/dev` continua decidindo por `e_dev()`.

### 13.1 Contexto — o que a F21 deixou aberto

A F21 fechou a autorização em três cargos, mas deixou o **topo achatado**: um admin rebaixa, desativa e — com a gestão nova — apagaria **qualquer pessoa**, inclusive quem mantém o sistema. E a gestão de conta de verdade (trocar o e-mail, apagar a conta, derrubar sessão) não existia em lugar nenhum do app: só no painel do Supabase, que não tem trilha de auditoria do projeto, não valida os domínios de login e não sabe o que é `profiles`.

Some-se a isso o desenho de gravação que a F21 aceitou: `profiles.papel`/`ativo` e `operador_filiais` eram escritos pelo **service role** (`aplicarCargoEVinculos`), que passa por fora de toda policy. Ou seja: a única coisa entre um admin e a gravação era o `if` de uma Server Action — o que não protege contra request forjado nem contra uma action futura que esqueça a guarda.

### 13.2 Decisão

Um quarto cargo, **`dev`** (rótulo de UI "Desenvolvedor"), no **topo** da hierarquia — **dev ⊃ admin ⊃ operador ⊃ consulta** — com três propriedades:

1. **O dev faz tudo que o admin faz**, e a maior parte disso ele **herda sem policy nova**: `e_admin()` deixou de significar "o cargo é admin" e passou a significar "o cargo é de **nível administrador**" (`in ('admin','dev')`). As ~20 policies de `/admin`, a guarda interna da RPC do import e as guardas do app seguiram valendo, sem serem reescritas.
2. **Ninguém abaixo de dev tem poder algum sobre um dev** — não edita, não rebaixa, não desativa, não apaga, não concede o cargo —, e a recusa vale **no Postgres**, não só na tela.
3. **Gestão de conta e diagnóstico** que antes só existiam no painel do Supabase passam a existir no sistema, com trilha: trocar o e-mail de login, apagar uma conta, encerrar as sessões de alguém, e a área `/dev` (diagnóstico, checagens de integridade, auditoria completa com export, manutenção).

### 13.3 Como funciona por baixo

**Enum e funções (`0071`/`0072`).** `alter type papel_usuario add value 'dev' before 'admin'` — a posição mantém a invariante da `0061` ("a ordem dos labels = a ordem de força"), e valor novo de enum não pode ser usado na mesma transação que o cria, daí a migration ir sozinha (precedente `0044`/`0045`). Depois: `e_admin()` vira nível administrador, nascem `e_dev()` e `pode_escrever()`, e `pode_escrever_filial()` trata dev como admin. Os dois buracos que a herança **não** tapava sozinha estão descritos na emenda do §4: `pode_escrever_filial()` tinha o seu próprio `= 'admin'` (um dev perderia toda a escrita de acervo, e **em silêncio** no UPDATE, porque o `USING` de uma policy de UPDATE é filtro de linha, não erro), e cinco policies gateavam por **lista literal** de cargos, que redefinição de função nenhuma alcança.

**A rede (`0073`).** Um trigger `profiles_guarda_dev` recusa **por padrão** qualquer mexida numa linha `dev` e qualquer concessão do cargo `dev` — e trigger roda para todo mundo, **inclusive o service role**, que é justamente quem policy não alcança. Como o service role não carrega identidade, o trigger não pergunta "quem é você?", e sim "você veio pelo caminho oficial?".

**O caminho oficial (`0074`).** Cinco RPCs `security definer` chamadas com o **client de sessão** (nunca o service role): `definir_papel_usuario`, `definir_status_usuario`, `definir_vinculos_usuario`, `apagar_usuario`, `encerrar_sessoes_usuario`. A autorização mora na guarda interna (`exigir_gestao_de`): alvo dev **ou** cargo pedido dev → exige `e_dev()`; o resto → exige `e_admin()`. As funções puras do app (`validarTrocaDePapel`, `validarStatusDeUsuario`, `validarExclusaoDeUsuario`) continuam existindo para dar a **mensagem em pt-BR** antes do SQLSTATE — elas são conveniência, a RPC é a trava.

**Apagar sem apagar a história (`0073`).** A FK `profiles.id → auth.users` foi derrubada e entrou `profiles.excluido_em`: apagar = arquivar o perfil + apagar a conta no Auth. Motivo e consequências na ata de 30/07 em `DECISOES.md` — resumidamente: dez FKs de histórico apontam para `profiles` com `NO ACTION`, então apagar a linha é impossível sem destruir o acervo, e o cascade para `auth.users` fazia `deleteUser()` **falhar**. `papel_atual()` passou a exigir `excluido_em is null`, então perfil arquivado não lê nem escreve.

**Vocabulário e leituras (`0075`/`0077`).** `eventos_admin` ganhou `email_alterado`, `usuario_apagado` e `sessoes_encerradas` (comment da coluna atualizado, regra "mexeu aqui, mexa lá" da `0065`). A `/dev` lê por duas RPCs `security definer` com guarda `e_dev()`: `ultima_migracao_aplicada()` e `dev_checagens_integridade()` — ambas **só-leitura**, com o SQL **fixo dentro da função**. Uma versão anterior recebia a consulta como parâmetro a partir de uma lista fechada no TypeScript; isso é execução de SQL arbitrário com os privilégios do dono da função ("o app só manda da lista" não protege nada, porque quem tem o cargo fala com a API direto), e foi descartada — a proibição de console de SQL viraria letra morta.

**Superfície de RPC (`0078`).** A leitura de advisors **depois** do apply mostrou onze funções novas no lint `authenticated_security_definer_function_executable`. Para nove delas isso é o desenho (são chamadas dentro de expressão de policy, ou são as RPCs de gestão que a Server Action invoca com o client de sessão, cada uma com guarda interna). Duas não eram nenhum dos casos — `exigir_gestao_de()` e `existe_outro_admin_ativo()`, só chamadas **por dentro** das RPCs — e perderam o `execute` de `authenticated`. Nenhuma delas vazava algo grave; "não vaza nada grave" é um argumento pior do que "não está exposta".

**Promoção (`0076`).** As contas do §0 da ordem foram promovidas por **e-mail** (não por uuid: o uuid difere entre ensaio e produção, o e-mail não — é o que faz a mesma migration rodar nos dois bancos e no CI). Zero linha afetada num banco novo é resultado válido.

### 13.4 Consequências

- **Positivas:** o topo deixou de ser achatado — existe um nível de manutenção que um administrador comum não alcança nem apagando, e a recusa vale para request forjado; a gestão de conta saiu do painel do Supabase e entrou no sistema, **com trilha**; o service role saiu do caminho de gravação de acesso (cargo, status **e** vínculos agora são RPC, com `auth.uid()` real); e o diagnóstico do sistema (commit no ar, migrations aplicadas × repositório, contagens, sete checagens de integridade) virou tela em vez de investigação manual.
- **Negativas / a aceitar:** (a) apagar uma conta **pelo painel do Supabase** passa a deixar perfil órfão, porque a FK saiu — o sistema não impede, ele denuncia, e isso virou checagem de integridade; (b) mais uma camada para manter em concordância (guarda pura do app ↔ guarda da RPC ↔ trigger) — divergência é bug, e `supabase/tests/cargo_dev.sql` é a rede; (c) `e_admin()` mudou de significado sem mudar de nome, o que é conveniente e perigoso ao mesmo tempo: quem ler o nome sem ler o comment vai supor "admin exato" — daí o comment do banco e este parágrafo; (d) "encerrar sessões" **não** mata o access token corrente (~1h de janela), limite declarado na própria tela.
- **Neutro:** o **visualizador por senha** não foi tocado (continua sendo outra porta, não um cargo); a máquina de estados, a imutabilidade das movimentações e os domínios de login seguem idênticos; operador e consulta não perceberam nada.

### 13.5 O que **não** foi criado, de propósito

- **Trava de "último dev".** Sistema sem dev é estado legal — era o estado do projeto até 30/07/2026 — e recolocar é uma migration. Trava aqui prenderia a pessoa ao próprio cargo sem ganho.
- **Console de SQL na `/dev`.** O lugar disso é o Supabase Studio. Ver §13.3.
- **Correção automática nas checagens de integridade.** Elas diagnosticam e mostram amostra; corrigir é ato humano, pelo fluxo normal do sistema. Diagnóstico que conserta sozinho é como se perde a confiança no diagnóstico.
- **ADR-003.** O volume não justificou: o modelo do §3 continua de pé, com um cargo a mais no topo — o formato correto para isso é emenda datada, como esta.

---

## 14. Emenda — Ferramentas DESTRUTIVAS do cargo dev (F23 — 30/07/2026)

Emenda ao §13. O modelo de acesso não muda: continuam os quatro cargos em hierarquia estrita, e nada aqui afrouxa nada para admin, operador ou consulta. O que muda é **o que o dev alcança** e, principalmente, **onde a imutabilidade do acervo passa a morar**.

### 14.1 O achado que reorientou a fase

A ordem pedia "prove que UPDATE/DELETE direto segue recusado fora das RPCs, inclusive para o service role". Medindo antes de escrever: **essa garantia não existia**. A imutabilidade de `movimentacoes` e `lancamentos_item` era a AUSÊNCIA de policy de UPDATE/DELETE — e `ativos` não tinha policy de DELETE. Isso segura `authenticated` (a RLS nega o que nenhuma policy permite) e **não segura o service role**, que tem `rolbypassrls` e recebe do Supabase os grants amplos de tabela por default. O app tem um client de service role; o caminho existia de verdade.

Ou seja: o critério de aceitação pedia para *preservar* algo que era preciso *construir*.

### 14.2 A guarda (`0081`) — trigger, como na `0073`

Policy não serve (o service role a ignora). Trigger serve: roda para todo mundo, sempre. `guarda_acervo()` recusa por padrão e as RPCs oficiais abrem a janela `estoque.dev_destrutivo` por GUC **local à transação**, fechando-a ao sair — inclusive no ramo de erro. É o desenho da `0073` aplicado ao ACERVO em vez de a `profiles`.

- `movimentacoes` e `lancamentos_item`: INSERT/UPDATE/DELETE (no INSERT recusa apenas `forcado = true`, para a marca não ser mentida por request forjado).
- `ativos`: **só DELETE** — UPDATE ali é o estado derivado que o sistema grava o tempo todo.
- `pendencias_item` e `anotacoes`: **fora**, e é decisão, não esquecimento — `aplicar_movimentacao` apaga `pendencias_item` no ramo do estorno, e `security definer` **não** isenta de trigger: uma guarda ali quebraria o estorno comum.

Consequência assumida e registrada: a RPC de import teve de ser recriada (`0080`) para abrir a janela — ela apaga acervo e o trigger a alcançaria. O §Escopo da ordem dizia "não toque no import"; a leitura adotada foi "não mude o que o import FAZ", e o diff é provadamente de duas linhas (o `md5` normalizado do corpo, removidas só as linhas `F23`, volta ao valor de antes). Pelo mesmo motivo, `scripts/reset.ts` passou a chamar uma RPC nomeada, `resetar_dados_ficticios`, com `execute` só para `service_role`: antes o service role apagava qualquer coisa de qualquer jeito, agora alcança o acervo por uma função única e auditável.

### 14.3 As sete ferramentas

`apagar_ativo`, `apagar_movimentacao`, `apagar_item` (`0082`); `resetar_acervo`, `resetar_itens` (`0083`); `forcar_estado_ativo`, `forcar_saldo_item` (`0084`). Todas `security definer`, `authenticated`-only, com `exigir_dev_para_destruir()` no topo (cargo dev **e** justificativa de 10+ caracteres) e confirmação digitada validada **na action E na RPC**.

Três escolhas de desenho merecem registro:

- **Apagar movimentação é SÓ-A-ÚLTIMA**, pela ordenação `(created_at, id)` — a mesma do guard de estorno. `snapshot_anterior` encadeia: apagar do meio faria toda snapshot posterior descrever um passado que deixou de existir, e é dela que o estorno restaura. "Replay" seria reescrever histórico para poder apagar um registro. A invariante que sobra é forte e testável: apagar a última deixa o ativo exatamente onde um estorno o deixaria, sem o par na linha do tempo. (Medição incômoda registrada em DECISOES: existem **três** definições vivas e não equivalentes de "a última movimentação" no sistema.)
- **Forçar não revoga a doutrina.** `ajuste` já ignora as transições válidas desde a `0004` e já exige justificativa; forçar grava uma movimentação `ajuste` marcada `forcado`, e o status segue DERIVADO pelo trigger. O que a fase acrescentou de fato foi trilha, guarda de cargo, marca e o **zeramento de detentor nos estados terminais**, que o `ajuste` sozinho não faz.
- **A trilha é gravada dentro da RPC**, na mesma transação — mudando o padrão da F21/F22, em que a action a escrevia. `registrarEventoAdmin` não propaga erro de propósito: aceitável para "convite gerado", inaceitável para uma exclusão irreversível. Ou a trilha entra, ou nada é apagado.

### 14.4 Consequências

- **Positivas:** o acervo passou a ter imutabilidade de verdade (com trigger), e não por omissão de policy; o dev ganhou as correções que antes exigiam SQL no painel do Supabase — agora com confirmação, justificativa, backup e trilha; o backup do reset é **conferido** (a RPC olha se o objeto existe no bucket), endurecendo o ritual de string que o import usa.
- **Negativas / a aceitar:** (a) mais uma camada em concordância — guarda pura ↔ RPC ↔ trigger —, com `supabase/tests/dev_destrutivo.sql` como rede; (b) toda escrita futura em `movimentacoes`/`lancamentos_item` que precise de UPDATE/DELETE terá de declarar a janela, o que é atrito **desejado**; (c) a 8ª checagem de integridade não nasce em zero (3 órfãos antigos no bucket `termos`), o que exigiu escrever o valor de partida na própria tela.
- **Neutro:** visualizador por senha, domínios de login, máquina de estados e o alcance de admin/operador/consulta seguem idênticos.

### 14.5 O que **não** foi criado, de propósito

- **Console de SQL, ou função que receba SQL/tabela/coluna como parâmetro.** Continua proibido — as ferramentas são operações NOMEADAS com SQL fixo.
- **Atalho destrutivo fora da `/dev`.** Nenhum botão "apagar de vez" na ficha, nas listas ou na paleta. Um botão desses ao lado do "estornar" seria clicado por engano algum dia.
- **Tipo novo de enum para a correção-dev.** Custaria um ramo em `status_apos_movimentacao`, a recriação da `0054` e ~8 listas exaustivas em TS — e não compraria exclusão nenhuma, porque as allow-lists de relatório já excluem `ajuste`.
- **Reset que recria dados.** Reset não é seed nem import: deixa o alcance vazio.

## 15. Emenda — O cargo por empresa (F62 — 22/09/2026)

**Status:** aceito · 22/09/2026 (ordem [`prompts/F62-raiz-do-tenant-e-cargo-por-empresa-ultracode.md`](prompts/F62-raiz-do-tenant-e-cargo-por-empresa-ultracode.md), migrations `0152`–`0158`, com as quatro decisões do Johnny da mesma data). Esta seção **muda onde o cargo mora**; nenhum cargo, nenhuma permissão e nenhuma policy mudaram. Ata em [`DECISOES.md`](DECISOES.md) (2026-09-22 · F62).

### 15.1 Contexto

Até a F61 o cargo era **um por pessoa**: `profiles.papel` e `profiles.ativo`. A virada multiempresa ([`PLANO-MULTIEMPRESA.md`](PLANO-MULTIEMPRESA.md), decisão 6: uma conta, vários vínculos) precisa representar um consultor que é administrador na empresa A e só consulta na empresa B — e isso não cabe numa coluna de `profiles`. Mover o cargo depois, com clientes dentro, tocaria o mecanismo de autorização com dado de mais de uma empresa em jogo. Com uma empresa só, é a janela barata.

### 15.2 Decisão

1. **O cargo e o `ativo` moram em `membros (empresa_id, profile_id, papel, ativo)`**, uma linha por (empresa, pessoa). `profiles` guarda o que é da **conta**: nome, e-mail, arquivamento.
2. **`papel_atual()` continua sem parâmetro — é a PONTE.** Responde pela membership na empresa legada (`empresa_legada()`, a WAP): membership ativa e perfil não arquivado; com duas memberships, vale a da empresa legada, nunca a mais forte. Até a F64/F67, as 61 policies e todos os chamadores seguem intactos por causa dela.
3. **O vínculo de escrita é da membership**: `operador_filiais` ganhou `empresa_id` e `membro_id`, com FKs compostas que recusam vínculo com membership ou filial de outra empresa.
4. **As quatro decisões do Johnny:** (i) `filiais.empresa_id` nasce aqui, `not null`, com default constante na WAP até a F64; (ii) as contas dev ganham membership como todo mundo — a trava do último administrador continua contando quem contava; (iii) `profiles.papel`/`ativo` ficam **congelados**, não derrubados, e o rollback **copia de volta primeiro**; (iv) o seed só troca a linha do cargo — as duas empresas fictícias são da F65.

**A escolha de fundo do §4 continua, e ficou mais necessária:** o cargo mora em TABELA consultada a cada request, não em claim do JWT. Com várias empresas, uma claim guardaria o cargo — e a empresa — errados até a renovação do token.

### 15.3 Como funciona por baixo

**A raiz (`0152`).** `public.empresas` com a WAP (uuid fixo, igual nos dois bancos), `slug` com formato e lista fechada de reservados (os segmentos de topo de `src/app/**`, travados por teste de mesa), `razao_social`/`cnpj` separados do `nome`, `patrimonio_digitos`, `cor_acento`, `config jsonb` só objeto. `empresa_legada()` é a fonte única do id da WAP — o app espelha o literal em `src/lib/auth/empresa-legada.ts`, com teste que compara os dois.

**A membership (`0153`).** Tabela, cópia de `profiles` (uma linha por perfil, com papel e ativo), policy de SELECT com o piso de sempre, escrita só pelas RPCs. `membros_guarda_dev()` é a rede do dev na membership, espelho de `profiles_guarda_dev()` (§13.3): fora da janela `estoque.gestao_usuarios`, ninguém concede o cargo dev nem mexe na membership de um dev — nem o service role. `handle_new_user` passou a criar a membership `operador` junto com o perfil.

**A plataforma (`0154`).** `plataforma_admins` (um retrato das contas dev) e `e_plataforma()`, sem parâmetro e **sem consumidor**: a `/dev` segue decidindo por `e_dev()`. A F67 decide a regra.

**Filial e vínculo (`0155`/`0156`).** `filiais.empresa_id` com default `empresa_legada()` (sem reescrever a tabela: default não-volátil). Em `operador_filiais`, um gatilho deriva empresa e membership do par (pessoa, filial) que as telas e as RPCs já gravam — nenhuma chamada precisou mudar.

**As funções de conjunto (`0157`).** As quatro da forma-alvo (MATRIZ R-ACC-68), `security definer`, `search_path = ''`, sem consumidor até a F66.

**A troca (`0158`).** Uma recópia sob lock (fecha a janela entre a `0153` e a troca; a RPC antiga que estiver em voo no apply retoma depois do commit e é RECUSADA pela guarda de `profiles` — `55000` —, em vez de gravar em silêncio na coluna congelada), e as dez funções que liam ou gravavam o cargo em `profiles` recriadas para `membros`: `papel_atual`, `pode_escrever_filial`, `existe_outro_admin_ativo`, `exigir_gestao_de`, as quatro RPCs de gravação, `profiles_guarda_dev` (que passa a reconhecer dev pela membership também) e `checagens_integridade_nucleo`. `apagar_usuario` desativa **todas** as memberships da conta arquivada. As duas colunas de `profiles` ganharam o comentário LEGADO.

**O app.** `getOperador()` lê cargo e status da membership na empresa legada e o que é da conta de `profiles`; `/admin/usuarios` lista a partir de `membros`. Nada muda na tela.

**Rollback.** `supabase/rollback/F62-1-copia-de-volta.sql` (a membership é a verdade desde o apply: quem foi desligado depois volta desligado) e só então `F62-2-desfaz.sql` (os corpos anteriores, na ordem inversa) — este sempre junto de uma cópia refeita, na mesma transação, com `membros` travada (RUNBOOK, "O rollback da F62"). O roteiro `f62_rollback.sql` prova os dois caminhos no CI: com a cópia, a impressão de todo perfil volta idêntica; sem ela, o desligado recupera o cargo.

### 15.4 Consequências

- **Positivas:** o modelo representa "uma conta, vários vínculos" sem mudar o acesso de ninguém — provado pela impressão do acesso por perfil antes × depois nos dois bancos e pela comparação célula a célula no CI; a rede do dev passou a valer também onde o cargo mora agora; o vínculo cruzado entre empresas é recusado pelo banco antes de existir segunda empresa.
- **Negativas / custo:** duas fontes de "dev" durante a transição (a coluna congelada e a membership), e por isso `profiles_guarda_dev` olha as duas até o PATCH que derrubar as colunas; `plataforma_admins` pode divergir do cargo dev (inerte enquanto não houver consumidor); a janela entre o apply de produção e o deploy, em que o app antigo lê a coluna congelada — só a TELA; quem decide acesso é o banco.

### 15.5 O que **não** foi criado, de propósito

- **Nenhuma policy de recorte por empresa.** As 61 seguem iguais; o recorte é da F66.
- **`p_empresa` em `papel_atual()`.** A ponte fica sem parâmetro até as RPCs receberem a empresa (F67).
- **Derrubar `profiles.papel`/`ativo`.** É a rede de reversão; cai num PATCH depois de semanas verdes.
- **Seletor de empresa, segunda empresa no seed, consumidor de `e_plataforma()`.** F70, F65 e F67.

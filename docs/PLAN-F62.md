# PLAN-F62 — A raiz do tenant e o cargo por empresa

> Plano de execução da ordem `docs/prompts/F62-raiz-do-tenant-e-cargo-por-empresa-ultracode.md`
> (F62 do `PLANO-MULTIEMPRESA.md` §7). Escrito **antes** do primeiro commit que toca `supabase/` ou
> `src/`, como a Frente A exige. Versão da fase: **`1.67.0`**. Branch: `f62-raiz-do-tenant`.
>
> Régua de decisão (a da ordem, nesta ordem): (1) medição própria contra o disco e os bancos de
> hoje; (2) as quatro decisões do Johnny; (3) a forma-alvo da MATRIZ (R-ACC-68); (4) a ficha F62;
> (5) a ordem; (6) as convenções do repositório; (7) o mais simples e reversível.

---

## 0. O "antes" — já tirado (22/09/2026, antes de qualquer apply)

| instrumento | ensaio (`sgmvldiizsrjbxzzpmhh`) | produção (`pbtjcalbmepmrqzprusb`) |
|---|---|---|
| impressão do acesso (`docs/f62-evidencias/impressao-acesso.sql`, md5 do texto `a3caf6da…`) | 5 perfis · 6 filiais · 4 combinações · md5 global **`f2cfd5a11d551ca0edfcfd78f28a5ff1`** | 16 perfis · 6 filiais · 9 combinações · md5 global **`a5de88cfd5b5fe4038e693db1693013f`** |
| policies vivas (`docs/f62-evidencias/impressao-policies.sql`) | public 53 · `d4fb378c…` · storage 8 · `f116b8d0…` | idem, **idênticos** |
| funções de `public` (frente e) | 94 · 58 definer · md5 `6d96a09d…` | idem, **idênticos** |
| advisors de segurança | 29 WARN definer · 1 WARN senha vazada · 3 INFO sem policy | idem |

Evidências: `docs/f62-evidencias/antes/`. Só agregados — nenhum id, nome ou e-mail saiu de consulta.
Canal: MCP da Supabase, `transaction_read_only = on`, resultado pela `EXCEPTION` (molde F59/F60).

---

## 1. Os 30 fatos, remedidos

Medição por oito frentes paralelas de exploração (resumos só com números) e por mim. "=" bate com o
fato; **⚠** diverge (a medição ganha e vai para o relatório).

| # | o fato diz | medi (22/09) | |
|---|---|---|---|
| 1 | `main` em `275ab61`, tag `v1.66.7`, 150 migrations `0001`→`0151` (gap `0029`), ledger dos dois bancos termina em `escrita_atomica_reconfere_no_banco`, PG 17.6, primeira da fase `0152` | tudo igual; `/api/saude` = `{versao 1.66.7, commit 275ab61, banco ok}`; ledger de produção com 135 linhas e o do ensaio com 148 (o ensaio guarda nomes históricos) — **os dois terminam na 0151** | = |
| 2 | 246 arquivos de teste; 38 roteiros + `_asserts.sql`; 7.035 testes (18/09) | 246 arquivos, **7.231 testes** verdes em 349 s (`npm run test`, 22/09); 39 arquivos em `supabase/tests` (38 roteiros + `_asserts.sql`) | ⚠ número de casos cresceu (7.035 → 7.231) |
| 3 | produção 16 perfis (dev 2, admin 2+1 arq., operador 5+1 arq., consulta 5), 14 contas, 25 vínculos (18 inertes); ensaio 5 perfis sem dev, 5 vínculos | idêntico nos dois bancos; e 2 perfis sem conta no Auth em produção (os 2 arquivados — estado correto) | = |
| 4 | `profiles.papel` enum not null default `operador`, `ativo` not null default true, `excluido_em` (0073), sem e-mail, 2 policies, grant de coluna | = | = |
| 5 | as funções de autorização e as linhas | todas nas linhas citadas (`0073:118-130`, `0072:56-157`, `0129:41`, `0138:354`, `0148:65`) | = |
| 6 | **101 funções vivas**; 9 leem `papel`, 6 leem `ativo` | **94 funções vivas** em `public` nos dois bancos (58 definer + 36 invoker); "101" é a contagem de NOMES já criados no histórico (7 `rel_*` derrubadas na F60). 9 leem `papel` e 6 leem `ativo` — confirmado corpo a corpo; e **8 leem `excluido_em`** (as 6 + `definir_vinculos_usuario` e `apagar_usuario`) | ⚠ 94, não 101 |
| 7 | as 5 RPCs, `on conflict (usuario_id, filial_id)` em `0074:270` | = (o corpo vigente de `definir_vinculos_usuario` é o da `0074`) | = |
| 8 | `existe_outro_admin_ativo(p_excluindo, p_escopo)` na `0132`, fechada nos 4 papéis | = (em produção: `authenticated`/`service_role`/`anon` sem EXECUTE) | = |
| 9 | `profiles_guarda_dev` é a única proteção do dev | = | = |
| 10 | `operador_filiais` (PK `(usuario_id, filial_id)`, 1 policy), 15 roteiros a citam | = ; 15 citam, **12 inserem** — sempre `(usuario_id, filial_id)` | = |
| 11 | `getOperador` lê `profiles` direto; guardas por `papel_atual` (`acesso.ts:116`, `:257-264`) | = ; mas `:257-264` são tipos e comentário — o caminho real é `cargoDoRequest` (`:286-293`) → `resolverCargo` → as cinco `exigir*`; 17 `exigirDev` | ⚠ citação de linha |
| 12 | 61 policies (53 + 8), piso 19 | = nos dois bancos | = |
| 13 | forma-alvo `setof` + `search_path = ''` | = (`MATRIZ-REGRAS.md:670-737`) | = |
| 14 | `k_negocio` 20, `k_infra` 5, `k_secdef` 58, `k_escopo_ok` 18, `k_excecoes_predicado` 18 | = | = |
| 15 | describe 5 de `catalogos-seguranca.test.ts` reprova `empresa_id` em código no isolamento | = (`:297-310`) | = |
| 16 | 18 roteiros, **61** ocorrências | 18 roteiros, **62** ocorrências (os 16 "outros" somam 40, não 39); 7 são o próprio cenário (a guarda do dev e a escalada de privilégio), 55 são plantio | ⚠ 62 |
| 17 | injetor no teto: 105 ativas + 2 quarentena | = | = |
| 18 | lock + `DA_F38` + três guardas | ver §1.1 | |
| 19 | não existe a trava do cargo; molde `asof_desempate.sql` 10a/10b | = | = |
| 20 | ADR-003 + runbook; 29 WARN; paridade 10 classes no runbook × 11 no CI | = (a 11ª é `policy_storage`) | = |
| 21 | sonda de deriva, 24 h, `nome_duplicado`, Parte B com conta `consulta` | ver §1.1 | |
| 22 | tipos por MCP com hand-fix; `database.ts` 2.153 linhas | ver §1.1 | |
| 23 | `/api/saude`; smoke "109 OK · 1 aviso · 0 falha" | `/api/saude` conferido; o smoke roda na Frente G | = |
| 24 | credenciais: nomes e destinos | não medido de propósito — **ninguém abriu o `.env.local`** | — |
| 25 | `seed.ts` insere em 8 tabelas, faz `update` de cargo em `profiles` | ver §1.1 | |
| 26 | `ESCOPO_UNICO`, `chaveDoEscopo`, `empresa: null` | = (`pertencimento.ts:45-48`, `chave.ts:32`, `observabilidade-linha.ts:288,380`) | = |
| 27 | máscara não cabe em prefixo/dígitos; segmentos de topo | `src/app/(app)/`: admin, ajuda, ativos, dev, itens, movimentacoes, pendencias, relatorios, versoes; `src/app/`: api, auth, login; valor de URL `todas`; `patrimonio.ts:16-17` (`[A-Z]{2,4}` + 7) | = |
| 28 | onde os documentos dizem que o cargo mora | ver §1.1 | |
| 29 | linha de base `medir-rls` F0 (16/09) | = (`docs/perf/f59-rls-*.json`); o script NÃO fala com banco: emite o bloco `do … raise exception` para o MCP | = |
| 30 | regras 1, 2, 3, 5, 6, 7, 8 | aplicadas | = |

### 1.1 Fatos 18, 21, 22, 25, 27 e 28 (frente "fatos")

- **18** = — `migrations.lock.json` com 150 entradas; `DA_F38` em `migrations-f38.test.ts:41`; `INTOCAVEIS` em
  `:199` sem `papel_atual` (nem nenhuma das funções que esta fase recria); a guarda "toda migration ≥ 0116 na
  lista" em `:405-411`.
- **21** = — `deriva-migrations.mjs:33` `BASE_DO_CONTRATO = 146`, tolerância de 24 h contada da data do commit
  que acrescentou o arquivo, `nome_duplicado`; Parte B do `saude.yml` às 09:43 UTC com a conta `consulta`.
- **22** = — `database.ts` com 2.153 linhas; `gen-types.ts` com `DB_TYPES_PROJECT_REF` ou `--linked`; o hand-fix
  da F60 conferido contra a geração de produção (`RELATORIO-F60.md:336`).
- **25** = — `seed.ts` com 1.799 linhas, escrita em 8 tabelas; cargo lido em `:1407` e gravado em `:1422-1423`;
  recusa com acervo presente em `:1754-1758`; `main()` no topo do módulo.
- **27** ⚠ — `--brand-amarelo: #eda100` está em `globals.css:163`, não `:147` (o valor está certo).
- **28** = — ADR-002 `:61`, `:149`, §13.3 `:214`; ARQUITETURA §4.2 `:80` ainda atribui `papel_atual` a
  `0061/0062`; `src/lib/auth/CLAUDE.md:44,50`; MATRIZ R-ACC-02/25; `catalogo_policies.sql:96-98`.
- Achado de passagem, fora do escopo (backlog): `scratch_tmp/scripts/db/{corpo-vigente,mutacoes}.mjs` estão
  rastreados pelo git na raiz — resíduo de sessão de agente.

---

## 2. A tabela dos leitores e escritores do cargo

"Hoje" = antes da F62. "Depois" = o que passa a fazer. Toda migration nova tem `db:lock` e entrada em `DA_F38`.

### 2.1 SQL (as nove que leem `profiles.papel`, as seis que leem `profiles.ativo`, e quem toca `operador_filiais`)

| objeto | hoje | depois | onde |
|---|---|---|---|
| `papel_atual()` | lê `profiles.papel` com `ativo` e `excluido_em is null` | **ponte**: lê `membros` na empresa legada (`m.ativo`) + `profiles.excluido_em is null` | `0158` |
| `e_admin()`, `e_dev()`, `pode_escrever()` | chamam `papel_atual()` | inalteradas (herdam a ponte) | — |
| `pode_escrever_filial(fid)` | `papel_atual()` + vínculo por `usuario_id` | `papel_atual()` + vínculo pela **membership** legada (`o.membro_id = m.id`) | `0158` |
| `existe_outro_admin_ativo(p, esc)` | conta `profiles` dev/admin ativos não arquivados | conta **membros** dev/admin ativos da empresa legada com perfil não arquivado; `(p_escopo is null or true)` intacto | `0158` |
| `exigir_gestao_de(alvo, pedido)` | lê `profiles.papel` do alvo | lê `membros.papel` do alvo na empresa legada | `0158` |
| `definir_papel_usuario` | grava `profiles.papel` | grava `membros.papel` | `0158` |
| `definir_status_usuario` | grava `profiles.ativo` | grava `membros.ativo` | `0158` |
| `definir_vinculos_usuario` | apaga/insere por `usuario_id`, `on conflict (usuario_id, filial_id)` | apaga/insere pela membership, `on conflict (empresa_id, membro_id, filial_id)` | `0158` |
| `apagar_usuario` | `excluido_em` + `ativo = false` em `profiles`, apaga vínculos | `excluido_em` em `profiles` (é da conta) + **desativa TODAS as memberships** + apaga vínculos | `0158` |
| `encerrar_sessoes_usuario` | não lê cargo (só via `exigir_gestao_de`) | inalterada | — |
| `checagens_integridade_nucleo` (`operador_sem_filial`) | `profiles.papel/ativo` + vínculo por `usuario_id` | `membros` legada + vínculo pela membership | `0158` |
| `profiles_guarda_dev` (gatilho em `profiles`) | lê `old/new.papel/ativo` | **exceção nomeada** — continua protegendo a coluna congelada e o `excluido_em`; o "é dev?" passa a olhar também `membros` | `0158` |
| `handle_new_user` | insere o perfil (cargo pelo default) | insere o perfil **e a membership** `'operador'` ativa na empresa legada; trava de domínio intacta | `0153` |
| `pode_ler_arquivo_termo`, `checagens_integridade_resumo`, `ledger_de_migracoes` | chamam `papel_atual()` | inalteradas | — |
| policies (61) | 60 dependem de `papel_atual()`, nenhuma lê `profiles.papel` | **nenhuma muda** | — |

### 2.2 TypeScript e scripts

| arquivo | hoje | depois | commit |
|---|---|---|---|
| `src/lib/auth/acesso.ts` `getOperador` | `profiles` `nome, papel, ativo, excluido_em`; vínculos por `usuario_id` | `profiles` `nome, excluido_em` + `membros` `id, papel, ativo` (empresa legada); vínculos pela membership | app |
| `src/lib/queries/formas/auth.ts` | `LEITURA_PERFIL_OPERADOR` com papel/ativo | `LEITURA_PERFIL_OPERADOR` (`nome, excluido_em`) + `LEITURA_MEMBRO_OPERADOR` (`membros`) | app |
| `src/lib/queries/admin.ts` `listarUsuarios` | `profiles` com papel/ativo | `profiles` (`id, nome, created_at`) + `membros` (empresa legada) | app |
| `idsDeAdminsAtivos` | `profiles` papel in (admin, dev), ativo, não arquivado | `membros` papel in (admin, dev), ativo, empresa legada ∩ perfis não arquivados — o MESMO conjunto do SQL | app |
| `perfilPorEmail`, `getEstadoUsuario` | `profiles` papel/ativo | `membros` papel/ativo (+ `profiles` nome/arquivamento) | app |
| `scripts/smoke/persona.ts` | lê e grava `profiles` papel/ativo (service role) | `membros` | app |
| `scripts/manutencao/gerar-errata-truncamento.ts` | `profiles` papel=dev, ativo | `membros` | app |
| `scripts/seed.ts` (só a linha do cargo — decisão iv) | `update profiles set papel, ativo` | `profiles` só nomes; cargo em `membros` | app |
| `src/lib/auth/CLAUDE.md:44,50` | "tabela `profiles` direto" | "`membros`" | docs |

### 2.3 Roteiros

Os 18 que plantam cargo em `profiles` (62 ocorrências) passam a `pg_temp.plantar_cargo(...)` (novo, em
`_asserts.sql`). Os cenários que provam a guarda de `profiles` (`cargo_dev.sql` 2g/2h/2i/2i-bis), a escalada
de privilégio (`papeis_rls.sql` 3g/5g), o congelamento e a grade de comparação ficam como **exceções
nomeadas** da varredura de roteiros. Os 12 que inserem vínculo continuam inserindo `(usuario_id, filial_id)`
— o banco deriva a membership (decisão 6).

---

## 3. O desenho

### 3.1 `public.empresa_legada()` — a fonte única (decisão 3)

`language sql stable security invoker set search_path = ''`, sem parâmetro, devolve o uuid fixo da WAP
`00000000-0000-4000-8000-000000000001` ("o tenant nº 1"). Usada por: o default de `filiais.empresa_id`, o
`handle_new_user`, a ponte de `papel_atual()` e as leitoras/escritoras do cargo. O TypeScript tem a
constante espelhada (`src/lib/auth/empresa-legada.ts`), e um teste de mesa amarra as duas ao literal da
migration. A F67/F69 trocam UM lugar.

### 3.2 `public.empresas` (decisões 1 e 2)

```
id uuid pk default gen_random_uuid()
slug text not null unique
     check formato: ^[a-z0-9]+(-[a-z0-9]+)*$ e 2..40 caracteres
     check reservados: admin, ajuda, api, app, ativos, auth, dev, geral, itens, login,
                       movimentacoes, pendencias, plataforma, r, relatorios, todas, versoes, www
nome text not null (exibição, 1..80)
razao_social text null · cnpj text null (check ^[0-9]{14}$)
patrimonio_digitos smallint not null default 7 (check 1..12)
cor_acento text null (check ^#[0-9a-fA-F]{6}$)
config jsonb not null default '{}' (check jsonb_typeof(config) = 'object')
created_at timestamptz not null default now()
```

- **Máscara (decisão 1):** só `patrimonio_digitos`. O prefixo continua em `import_prefixos_patrimonio`
  (7 prefixos oficiais, a F64 dá `empresa_id` a ela) e a validação continua monopólio do TS
  (`patrimonio.ts`). Um par único prefixo/dígitos não representa a WAP (fato 27).
- **`razao_social`/`cnpj`:** colunas separadas, **nulas na WAP** — os termos continuam com o texto fixo do
  modelo (decisão 7 do §1 do plano); a fase não grava dado cadastral de empresa numa migration.
- **Do catálogo de requisitos:** entram `cor_acento` e `config`; **ficam fora** `logo` (F70 — é arquivo de
  Storage e UI), `cidade` (F70/F71) e `ativo` (sem consumidor, uma empresa "desativada" que continuasse
  acessível seria armadilha; entra na fase que define o que isso significa — F69/F70).
- **Reservados (decisão 2):** a lista fechada = censo dos segmentos de topo de `src/app/**` (12) ∪ a lista
  da ficha (12) ∪ o valor de URL `todas`. Trava: `src/lib/validators/empresas-slug.test.ts` lê os segmentos
  de topo de `src/app` (descendo nos grupos `(x)`) e a lista do CHECK na migration vigente, e reprova
  segmento não reservado (sabotagem H com um segmento sintético).
- WAP: `slug 'wap'`, `nome 'WAP'`, `cor_acento '#eda100'` (`--brand-amarelo`, `globals.css:163`).
- RLS ligada, **sem `force`**, **zero policy** (`k_sem_select`: nenhuma tela lê nesta fase; quem precisar é
  definer); `revoke all` de `anon` e `authenticated` (os privilégios padrão do projeto hospedado dariam tudo).
- Classificação: **INFRA** (é a raiz do mecanismo; recorta-se pelo próprio id, via as funções de conjunto,
  não por `empresa_id`).

### 3.3 `public.membros` (decisão 5)

```
id uuid pk default gen_random_uuid()
empresa_id uuid not null references empresas(id)            (restrict)
profile_id uuid not null references profiles(id) on delete cascade
papel public.papel_usuario not null default 'operador'       (o enum de hoje — nenhum valor novo)
ativo boolean not null default true
created_at timestamptz not null default now()
unique (empresa_id, profile_id)   — uma membership por pessoa por empresa
unique (empresa_id, id)           — alvo da FK composta de operador_filiais
index (profile_id, empresa_id)    — as funções de conjunto filtram por profile_id primeiro
```

- `profile_id … on delete cascade`: `profiles` nunca é apagado (só arquivado), e o `cascade` espelha
  `operador_filiais.usuario_id`; apagar a linha de um dev continua barrado pelas DUAS guardas.
- **Guarda do dev em `membros`** (`membros_guarda_dev`, BEFORE INSERT/UPDATE/DELETE por linha, 42501), com a
  MESMA janela `estoque.gestao_usuarios`: recusa apagar a membership de um dev, inserir já como dev, mudar
  `papel`/`ativo`/`empresa_id`/`profile_id` de uma membership dev e conceder o cargo dev.
- Cópia: uma linha por perfil existente (arquivados incluídos), na WAP, com `papel` e `ativo` de `profiles`.
- RLS ligada, sem `force`; policy `"leitura operador"` `for select to authenticated using ((select
  public.papel_atual()) is not null)` — o espelho EXATO da leitura de `profiles` (o app a lê com a sessão).
  Sem recursão: `papel_atual()` é definer e o dono não sofre RLS (R-ACC-72, o segundo motivo do "sem
  `force`"). Entra em `k_policies_public` e `k_piso_papel`.
- `revoke all` de `anon`; de `authenticated`, tudo menos SELECT. Classificação: **INFRA** (vínculo da conta,
  como `profiles`).

### 3.4 `public.plataforma_admins` e `e_plataforma()` (decisões ii e 7)

- `plataforma_admins (profile_id uuid pk references profiles(id) on delete cascade, created_at)`. RLS ligada,
  zero policy, `revoke all` de `anon`/`authenticated` (`k_sem_select`). INFRA. Cópia: as memberships
  `'dev'` da WAP (as duas contas dev em produção; zero no ensaio).
- `e_plataforma()`: `sql stable security definer set search_path = ''`, sem parâmetro; `true` só se o
  chamador tem linha em `plataforma_admins`, perfil não arquivado e membership ativa na empresa legada — ou
  seja, **falso nos mesmos quatro casos em que `papel_atual()` é NULL** (sem sessão, sem perfil, inativo,
  arquivado). `revoke … public, anon, service_role` + `grant authenticated`. **Sem consumidor** nesta fase.
  O cargo `dev` continua em `membros` (decisão ii) e a 5d de `cargo_dev.sql` continua valendo.
- ⚠ Declarado: `plataforma_admins` é a fotografia dos devs no apply; conceder/revogar dev depois não a
  mexe (seria dupla escrita). Enquanto `e_plataforma()` não tiver consumidor, a deriva é inerte; a F67
  decide a fonte.

### 3.5 `filiais.empresa_id` (decisão i)

`add column empresa_id uuid not null default public.empresa_legada() references public.empresas(id)` — o
default é função `stable` que devolve constante: o PG 11+ preenche sem reescrever tupla e **sem `update`**.
`unique (empresa_id, id)` entra aqui (alvo da FK composta de `operador_filiais`). O default fica até a F64,
escrito no `comment on column` e na ata. O "Nova filial" continua funcionando sem código novo.

### 3.6 `operador_filiais` por membership (decisão 6)

- `add column empresa_id uuid`, `membro_id uuid`; preenchidas pela migration a partir de `usuario_id` e da
  empresa da filial (os 25 de produção, os 18 inertes incluídos; os 5 do ensaio); `set not null`; a
  conferência aborta a migration se sobrar nulo.
- PK nova `(empresa_id, membro_id, filial_id)`; a PK velha vira `unique (usuario_id, filial_id)` — o
  `on conflict (usuario_id, filial_id)` de quem ainda o use continua válido.
- FK composta `(empresa_id, membro_id) → membros(empresa_id, id) on delete cascade`; FK composta
  `(empresa_id, filial_id) → filiais(empresa_id, id)` — **o vínculo com filial de outra empresa é recusado
  pelo banco aqui mesmo** (não fica para a F65: a tabela é reestruturada nesta fase e custa 6 linhas).
- **O banco deriva a membership** (gatilho `operador_filiais_deriva_membership`, BEFORE INSERT/UPDATE): quem
  informa só `(usuario_id, filial_id)` — a RPC antiga no intervalo entre applies, os 12 roteiros, o seed —
  ganha `empresa_id` da filial e `membro_id` da membership daquela pessoa naquela empresa; quem informa
  `membro_id` ganha o `usuario_id`; os dois informados e divergentes → 23503. Sem membership na empresa da
  filial → 23503 com mensagem própria.
- `usuario_id` FICA (o TS lê por ele; sair é da F69). A policy `"leitura operador"` não muda.
  Classificação: continua **INFRA** (fato 14: é o vínculo de escrita de uma conta — a chave de recorte dela é
  a membership, não a linha).

### 3.7 As quatro funções de conjunto

Copiadas da forma-alvo (`MATRIZ-REGRAS.md:677-713`), com os joins pelos nomes desta fase: `setof uuid` /
`returns table (empresa_id uuid, filial_id smallint)`, `language sql stable security definer set
search_path = ''`, `auth.uid()` içado, tudo qualificado, `revoke execute … from public, anon` + `grant
execute … to authenticated`. Diferenças declaradas: o join do operador em `unidades_de_escrita()` é pela
membership (`o.membro_id = m.id and o.empresa_id = m.empresa_id`), e as quatro exigem também o perfil não
arquivado (`profiles.excluido_em is null`) — os mesmos quatro casos de NULL de `papel_atual()`. Fora de
`definer_sem_tenant.sql` (sem parâmetro); em `k_secdef`.

### 3.8 A ponte de `papel_atual()` (decisão 4)

Sem parâmetro. Responde pela membership na **empresa legada** — nunca pelo cargo mais forte entre empresas.
Com uma empresa e uma linha por perfil, é byte a byte o comportamento de hoje (provado pela grade de CI e
pela impressão antes × depois). O `excluido_em` continua vindo de `profiles` (é da conta).

### 3.9 O que fica (decisão 12)

`ESCOPO_UNICO` (`pertencimento.ts`), `chaveDoEscopo` (`chave.ts`) e o `empresa: null` da observabilidade
**ficam**: o valor real depende de `import_logs.empresa_id` (F64) e da empresa da SESSÃO (F69/F70). Tirar
agora só deslocaria o literal. `src/lib/escopo/**` não aparece no diff.

---

## 4. As doze decisões da fase (por escrito)

1. **Colunas de `empresas`** — §3.2. uuid fixo da WAP; `razao_social`/`cnpj` nulos; só `patrimonio_digitos`.
2. **Slugs reservados** — as 18 do §3.2, com a trava de mesa sobre `src/app`.
3. **A empresa legada** — `public.empresa_legada()` + espelho TS amarrado por teste.
4. **A ponte** — §3.8.
5. **`membros`** — §3.3 (FK `cascade` para `profiles`, `restrict` para `empresas`, guarda do dev, piso de leitura, INFRA).
6. **`operador_filiais`** — §3.6 (o banco deriva; `on conflict` da RPC nova pela PK nova; FK composta de filial AQUI; INFRA).
7. **`plataforma_admins` e `e_plataforma()`** — §3.4.
8. **Ordem e transação da troca** — §5. A recópia `profiles → membros` é o PRIMEIRO comando da `0158`, num
   bloco que trava `profiles` (`share row exclusive`) até o fim da transação do apply; o `handle_new_user`
   entra já na `0153`, para que nenhuma conta nova nasça sem membership entre dois applies.
9. **As travas do cargo** — §6: catálogo (`cargo_em_membros.sql`), mesa, TS e roteiros
   (`src/lib/validators/cargo-em-membros.test.ts`). Exceções de função/policy numa fonte só
   (`k_excecoes_cargo` no `.sql`, lido pela mesa); as de TS e de roteiro, no próprio teste.
10. **A comparação** — grade de CI (`cargo_equivalencia.sql`) com o corpo antigo em `pg_temp`, conferido
    contra o arquivo vigente por teste de mesa; impressão do acesso antes × depois (§0).
11. **Mutações e teto** — §7.
12. **O que fica** — §3.9.

---

## 5. As migrations, a ordem de apply e a ORDEM DE ROLLBACK

| # | arquivo | classe | o que faz |
|---|---|---|---|
| 1 | `0152_raiz_do_tenant.sql` | ADITIVA | `empresa_legada()`, `empresas`, a WAP |
| 2 | `0153_membros.sql` | ADITIVA + CÓPIA | `membros`, `membros_guarda_dev`, a cópia de `profiles`, a policy, `handle_new_user` com membership |
| 3 | `0154_plataforma_admins.sql` | ADITIVA + CÓPIA | `plataforma_admins`, a cópia dos devs, `e_plataforma()` |
| 4 | `0155_filiais_empresa.sql` | ADITIVA | `filiais.empresa_id` (default constante), `unique (empresa_id, id)` |
| 5 | `0156_vinculo_por_membership.sql` | ADITIVA + PREENCHIMENTO (`operador_filiais`, não é acervo) | colunas, preenchimento, PK nova, FKs compostas, gatilho de derivação |
| 6 | `0157_funcoes_de_conjunto.sql` | ADITIVA | as quatro funções |
| 7 | `0158_cargo_em_membros.sql` | RECRIAÇÃO + RECÓPIA | recópia travada; a troca das leitoras/escritoras; comentários de LEGADO |

Nenhum valor novo de enum, nenhum `update`/`delete` de topo em acervo, nenhuma INTOCÁVEL recriada, nenhum
nome-sem-prefixo repetido (conferido: nenhum arquivo termina em `_raiz_do_tenant`, `_membros`,
`_plataforma_admins`, `_filiais_empresa`, `_vinculo_por_membership`, `_funcoes_de_conjunto`, `_cargo_em_membros`).

### 5.1 A ORDEM DE ROLLBACK (o inverso; a cópia de volta PRIMEIRO)

Rodável em `supabase/rollback/F62-1-copia-de-volta.sql` e `supabase/rollback/F62-2-desfaz.sql`, ensaiada no
CI por `supabase/tests/f62_rollback.sql` (sabotagem G). Com o app novo no ar, a ordem inteira é:

1. **Copiar `membros` → `profiles`** (`papel`, `ativo`, pela membership legada, com a janela
   `estoque.gestao_usuarios`). Nada ainda lê `profiles`; depois deste passo `profiles` é o estado MAIS NOVO.
2. **Religar os leitores antigos**: reverter o app (redeploy do commit anterior ao merge — nunca `git revert`
   do merge inteiro, que tiraria as migrations do repositório) e reemitir os corpos pré-F62 das dez funções
   da `0158` (`F62-2`, bloco 0158).
3. Derrubar as quatro funções de conjunto (0157).
4. `operador_filiais`: gatilho, FKs compostas, PK nova → PK `(usuario_id, filial_id)` de volta, colunas (0156).
5. `filiais`: `unique (empresa_id, id)` e a coluna (0155).
6. `e_plataforma()` e `plataforma_admins` (0154).
7. `handle_new_user` pré-F62, `membros_guarda_dev`, `membros` (0153).
8. `empresas` e `empresa_legada()` (0152). `notify pgrst, 'reload schema'`.

Sem o passo 1, quem foi desativado (ou rebaixado) depois da F62 voltaria ao cargo congelado — o roteiro do
rollback prova isso nos dois sentidos. O ledger não é reescrito; a sonda de efeito é quem confere.

---

## 6. As travas (Frente B) — nascem vermelhas no commit anterior à correção

| trava | onde | reprova hoje em |
|---|---|---|
| catálogo: nenhuma função/view/policy de `public` lê ou escreve `profiles.papel`/`ativo`, com auto-sabotagem | `supabase/tests/cargo_em_membros.sql` (fonte de `k_excecoes_cargo`) | as 9 funções do fato 6 |
| mesa: a mesma afirmação sobre o corpo vigente (replay das migrations, com `drop function` e sem comentários) | `src/lib/validators/cargo-em-membros.test.ts` | as mesmas 9 |
| TS: nenhum `from('profiles')` em `src/**`/`scripts/**` seleciona, filtra ou grava `papel`/`ativo` (nem por forma Zod) | idem | `acesso.ts`/`formas/auth.ts`, `queries/admin.ts` (3), `seed.ts`, `persona.ts`, `gerar-errata-truncamento.ts` |
| roteiros: nenhum roteiro grava `papel`/`ativo` em `profiles`, salvo os cenários nomeados | idem | os 18 roteiros |
| a comparação: grade papel × ativo × arquivado × vínculo (+ duas memberships, sem perfil, sem sessão), corpo antigo × vivo | `supabase/tests/cargo_equivalencia.sql` | verde por construção antes da troca; a sabotagem B a derruba |

---

## 7. As mutações (Frente E)

Uma por função de autorização criada ou reescrita, cada uma detectada por cenário nomeado:
`empresas_do_membro` (sem `m.ativo`), `empresas_de_escrita` (aceita consulta), `empresas_de_admin` (aceita
operador), `unidades_de_escrita` (par de outra empresa), `e_plataforma` (responde por qualquer um),
`papel_atual` (sem arquivado; sem inativo; empresa errada), `pode_escrever_filial` (vínculo de qualquer
membership), `existe_outro_admin_ativo` (conta inativo), `exigir_gestao_de` (não enxerga o dev alvo), a
guarda do dev em `membros` (neutralizada), `handle_new_user` (sem a membership), e as escritoras
(`definir_papel_usuario`, `definir_status_usuario`, `apagar_usuario` voltando a gravar só `profiles`).
O teto sobe de 105 para o número exato, com o porquê datado; quarentena segue abaixo de ⅓;
`isolamento_tenant.sql` entra em `ROTEIROS_DA_FICHA`.

---

## 8. Commits e pushes

1. `docs(f62)`: a ordem (feito) · este plano + evidências "antes".
2. `test(f62)`: as travas vermelhas + a saída vermelha em `docs/f62-evidencias/B-*` → **push 1** (CI vermelho de propósito).
3. `feat(f62)`: `0152` · `0153` · `0154` · `0155`+`0156` · `0157` · `0158` (um commit por lote, `db:lock` junto).
4. `refactor(f62)`: o app e os scripts (+ `database.ts` com hand-fix datado).
5. `test(f62)`: o ajudante e os 18 roteiros · o isolamento A↔B + describe 5/9 · catálogos · rollback ensaiado + slugs · mutações e teto.
6. `docs(f62)`: documentos. `chore(f62)`: `1.67.0`.
7. **push 2+** até o CI verde · revisão adversarial · SHA congelado · apply ensaio · apply produção · merge · pós-deploy · PR de docs · tag.

## 9. SHA de código congelado

_(preenchido na Frente G, passo 3)_

## 10. O que este plano NÃO promete

Isolamento no acervo (F63/F66/F72); cargo por empresa valendo nas policies (a ponte responde pela empresa
legada até a F67); o caminho do dev provado no ensaio (o ensaio não tem dev); seed de duas empresas (F65).

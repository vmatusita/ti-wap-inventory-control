# Relatório F62 — A raiz do tenant e o cargo por empresa

**v1.67.0** · **migrations `0152`–`0158`, aplicadas no ensaio e em produção antes do merge** · 22/09/2026 · SHA de
código congelado **`f31175a`** · código no [PR #70](https://github.com/vmatusita/ti-wap-inventory-control/pull/70) ·
documentação de fecho no PR seguinte, com a tag anotada `v1.67.0` no merge dele

> A primeira fase da virada multiempresa que muda o banco. Nasceram a raiz do tenant (`empresas`, com a WAP), a
> membership (`membros`, uma linha por perfil) e a tabela da plataforma (`plataforma_admins` + `e_plataforma()`), com
> `filiais.empresa_id` e o vínculo de escrita por membership — e **o cargo saiu de `profiles` e passou a morar em
> `membros`**. **Nenhum perfil mudou de acesso:** a impressão do acesso de cada perfil, tirada antes e depois do apply,
> saiu **idêntica nos dois bancos**, combinação a combinação e no md5 global (ensaio `f2cfd5a1…`, 5 perfis; produção
> `a5de88cf…`, 16 perfis). As 61 policies vivas ficaram byte a byte; a paridade ensaio × produção fechou nas 11 classes.
> `profiles.papel`/`ativo` ficaram congelados — no banco, não só nas travas — com um rollback que copia de volta
> primeiro, ensaiado no CI. A revisão adversarial rodou em duas rodadas e achou **nove** lacunas antes do apply, uma
> delas real e perigosa (a corrida do apply); todas fecharam com prova própria. E a medição derrubou uma premissa escrita
> desde a `0070`: o `42P17` com `force` não acontece nos nossos bancos.

---

# 1. O ROTEIRO DO JOHNNY — o que conferir, e o que ficou

*Nada aqui é pedido de autorização: a fase fechou. É o que vale a pena olhar, e o que ficou com dono.*

### Pendente de comando teu

**Nada.** O apply nos dois bancos (antes do merge), o merge (`fa10b54`), o deploy, a conferência pós-deploy e a tag
anotada `v1.67.0` (no merge deste PR de documentação) foram feitos pela fase — §14.

### Conferir (5 minutos, só leitura)

1. **Entre com a sua conta** e confira que o menu e o acesso são os de sempre — nenhuma tela mudou.
2. **Abra Administração → Usuários** e confira os cargos e o status da lista, **sem mudar nada**. A lista agora vem de
   `membros`; se algum cargo ou status parecer diferente do que você sabe, é bug — o banco mediu que não é.
3. **`/api/saude`** tem de mostrar `1.67.0` e o commit do merge; e a **Parte B do `saude.yml` de amanhã** tem de sair
   verde (a conta `consulta` lê o ledger pela ponte nova — a fase já disparou uma à mão, §14).
4. **O diff da fase** (mais abaixo): `git diff v1.66.7 v1.67.0 --stat`. **Tem de aparecer:** `supabase/migrations/0152`…`0158`,
   `supabase/rollback/F62-*`, os roteiros de `supabase/tests/` (41, com os novos `cargo_em_membros`, `cargo_equivalencia`,
   `f62_rollback` e o `isolamento_tenant` completo), `src/lib/auth/` (`acesso.ts`, `empresa-legada.ts`), `src/lib/queries/admin.ts`,
   `src/lib/types/database.ts`, os scripts de seed/smoke/perf, `scripts/db/mutacoes.mjs`, a documentação. **Não pode
   aparecer:** nada em `src/components/**` ou `src/app/**` (a fase não muda tela), `.github/workflows/**`,
   `src/lib/escopo/**`, `package-lock.json` (nenhuma dependência nova), `.env*`, o `CLAUDE.md` da raiz.

```bash
git diff v1.66.7 v1.67.0 --stat
```

### A data da entrega PATCH que derruba `profiles.papel`/`profiles.ativo`

**A partir de 13/10/2026** (três semanas verdes depois do deploy de 22/09), e só se nada neste meio-tempo precisou do
rollback. A entrega derruba as duas colunas, a exceção nomeada de `profiles_guarda_dev` (`k_excecoes_cargo`) e as
exceções de roteiro marcadas `-- F62/cargo-congelado:`. Até lá, as colunas são a rede de reversão.

### Rollback — se precisar

[`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md), seção "O rollback da F62": a **cópia de volta primeiro**
(`supabase/rollback/F62-1-copia-de-volta.sql`), o app anterior, e só então a cópia **de novo junto** do
`F62-2-desfaz.sql`, na mesma transação. O roteiro `f62_rollback.sql` prova no CI que sem a cópia o desligado volta a
entrar.

---

# 2. O que mudou, por arquivo e por quê

| onde | o quê | por quê |
|---|---|---|
| `supabase/migrations/0152_raiz_do_tenant.sql` | `empresa_legada()`, `empresas` com a WAP (uuid fixo), slug com formato e reservados, `config` só objeto | a raiz do tenant; a WAP é o tenant nº 1 no mesmo banco |
| `0153_membros.sql` | `membros`, a cópia, `membros_guarda_dev`, a policy de SELECT com o piso, `handle_new_user` com a membership | o cargo por empresa; a guarda do dev onde o cargo mora |
| `0154_plataforma_admins.sql` | `plataforma_admins` (retrato dos devs) e `e_plataforma()` sem consumidor | declarar a plataforma sem mexer em quem decide (decisão ii) |
| `0155_filiais_empresa.sql` | `filiais.empresa_id` com default `empresa_legada()` e `unique (empresa_id, id)` | a hierarquia empresa → filial (decisão i), sem `update` |
| `0156_vinculo_por_membership.sql` | `operador_filiais` com `empresa_id`/`membro_id`, PK nova, FKs compostas, o gatilho que deriva a membership | o vínculo é da membership; o banco recusa o cruzado |
| `0157_funcoes_de_conjunto.sql` | as quatro funções de conjunto, na forma-alvo | a F66 as consome |
| `0158_cargo_em_membros.sql` | a recópia sob trava; as dez funções que liam/gravavam o cargo em `profiles`, recriadas para `membros`; `profiles_guarda_dev` recusando a escrita antiga pela janela; os comentários LEGADO | a troca |
| `supabase/rollback/F62-1…`, `F62-2…` | a cópia de volta (trava `membros`, abre a marca) e o desfazer GERADO do corpo vigente | a decisão iii |
| `src/lib/auth/acesso.ts`, `empresa-legada.ts` | `getOperador` lê a membership na empresa legada; o espelho do uuid da WAP | o app lê onde o cargo mora |
| `src/lib/queries/admin.ts`, `formas/auth.ts`, `catalogo.ts` | a lista de usuários, os admins ativos, o estado do usuário por `membros`; a forma `LEITURA_MEMBRO_OPERADOR` | idem |
| `src/lib/types/database.ts` | as tabelas, colunas e funções novas (à mão antes do apply; conferido contra a geração depois) | tipos |
| `scripts/seed.ts`, `smoke/persona.ts`, `manutencao/…`, `perf/medir-rls.mjs`, `medir-itens.mjs` | o cargo em `membros` (o seed só na linha do cargo — decisão iv) | nenhum script grava a coluna congelada |
| `supabase/tests/` (33 roteiros tocados, 3 novos) | as fixtures plantam cargo por `pg_temp.plantar_cargo`; `cargo_em_membros`, `cargo_equivalencia`, `f62_rollback` novos; `isolamento_tenant` com os cenários A↔B; `cargo_dev` com a guarda em `membros` e a seção 8 | a prova |
| `supabase/tests/catalogo_policies.sql`, `catalogo_secdef.sql` | 28 tabelas (20/8), 54 policies em `public`, 65 definer | os catálogos conhecem a F62 |
| `scripts/db/mutacoes.mjs`, `cargo-congelado.mjs` | 20 mutações `f62-*`; a varredura do cargo congelado | as travas |
| `src/lib/validators/cargo-em-membros.test.ts`, `empresas-slug.test.ts`, `src/lib/auth/acesso-cargo.test.ts`, `empresa-legada.test.ts` | a mesa | idem |
| `package.json`, `CHANGELOG.md`, `src/lib/versoes/registry.ts` | 1.67.0 | regra 8 |
| `docs/` | MATRIZ (R-ACC-77 a 84 + emendas), ADR-002 §15, ARQUITETURA §4, RUNBOOK (rollback + Anexo A), PLANO (notas F62/F64/F65), índices, ata | a Frente F |

---

# 3. Os números MEDIDOS, lado a lado com a ficha

| fato | a ficha / a ordem dizia | medido | onde |
|---|---|---|---|
| a numeração | migrations `0141`–`0144` | **`0152`–`0158`** (a `0151` foi a última da v1.66.7) | PLAN §1 fato 1 |
| as funções que leem o cargo | "as cinco" (`papel_atual`, `e_admin`, `e_dev`, `pode_escrever`, `pode_escrever_filial`) | **nove funções SQL** leem `profiles.papel`; três das cinco da ficha só DERIVAM de `papel_atual()` e não mudaram; mais as 5 RPCs e o `handle_new_user` | fato 6 |
| funções vivas | 101 | **94** (101 é a contagem de nomes já criados; 7 `rel_*` derrubadas na F60); depois da F62, 102 | fato 6, paridade |
| o `on conflict` de `definir_vinculos_usuario` | — | a PK nova quebraria o `on conflict (usuario_id, filial_id)`: a 0156 mantém o par como unique e a RPC nova usa a PK nova | fato 7 |
| a proteção do dev | — | morava só em `profiles`; a 0153 a pôs em `membros` | fato 9 |
| `getOperador` | — | lia `profiles` direto; agora lê a membership | fato 11 |
| "199 call-sites" | ficha | são texto de migration, não chamadores do app; a ponte os deixa intactos | fato 11 |
| as policies | 54 | **61** (53 + 8) — nenhuma mudou; o piso em **19** (não 16), 20 depois de `membros` | fato 12, R-ACC-32 |
| a forma das funções de conjunto | `uuid[]` na ficha | **`setof uuid` com `search_path = ''`** (R-ACC-67/68) | fato 13 |
| o join da forma-alvo | pelo `usuario_id` | pela membership, e usa `filiais.empresa_id` (decisão i) | fato 13 |
| a classificação | 16/5 ou "17" | **20/5** antes, **20/8** depois | fato 14, R-ACC-30 |
| o roteiro de isolamento | — | o describe 5 proibia `empresa_id` no roteiro; emendado (o que vale é não juntar `empresa_id` com tabela de acervo) | fato 15 |
| os roteiros que plantam cargo | 18 roteiros, 61 ocorrências | **18 roteiros, 62 ocorrências** | fato 16 |
| o injetor | — | estava no teto (105); foi a 124 e, depois da revisão, a **125** | fato 17 |
| a conta da Parte B | — | precisa de membership — tem (a cópia cobre todo perfil) | fato 21 |
| o seed | "insere em 11 tabelas" | **8** tabelas, não roda em lugar nenhum, e não comporta duas empresas antes da F65 (decisão iv) | fato 25 |
| a máscara e os slugs | prefixo + dígitos; lista curta | só `patrimonio_digitos` (a WAP tem 7 prefixos); **18** reservados | fato 27 |
| **o `42P17` com `force`** | 0070, R-ACC-29, R-ACC-72: "com `force`, 42P17" | **não acontece**: `postgres` tem BYPASSRLS no hospedado e é superusuário no CI; o atributo vence o `force` (cenário 9o) | ata (h) |
| o uuid da WAP | PLAN: `…-4000-8000-…001` | `…-4000-a000-…001` — o outro já era id fictício em seis lugares | ata (f) |
| testes | 246 arquivos, 7.231 testes | **250 arquivos, 7.434 testes** | `npm run test` |

---

# 4. As decisões

As **quatro do Johnny** — (i) `filiais.empresa_id` aqui, com default até a F64; (ii) os devs com membership, e
`plataforma_admins` como retrato; (iii) as colunas congeladas e o rollback que copia de volta; (iv) o seed só na linha
do cargo —, as **doze da fase** e as **tomadas na execução** estão, com o motivo de cada uma, na ata de
2026-09-22 · F62 em [`DECISOES.md`](DECISOES.md) (itens 1–12 e (a)–(o)). O desenho completo: [`PLAN-F62.md`](PLAN-F62.md) §3.

As que mais pesaram: a ponte sem parâmetro (as 61 policies intactas); a recópia sob trava como primeiro comando da
`0158`; a FK composta do vínculo já nesta fase; o rollback GERADO do corpo vigente, com mesa de fidelidade; e, depois da
revisão, o **congelamento no banco** — a guarda de `profiles` recusa (`55000`) a escrita na coluna congelada que chegue
pela janela de gestão sem a marca `estoque.cargo_congelado`.

---

# 5. Os leitores e escritores do cargo, antes × depois

A tabela completa está em [`PLAN-F62.md`](PLAN-F62.md) §2, e a execução a seguiu. Em uma linha por grupo:

| grupo | antes | depois |
|---|---|---|
| `papel_atual()` | `profiles.papel` com `ativo`/`excluido_em` | a PONTE: `membros` na empresa legada + `profiles.excluido_em` |
| `e_admin()`/`e_dev()`/`pode_escrever()` | chamam `papel_atual()` | inalteradas (herdam a ponte) |
| `pode_escrever_filial()` | vínculo por `usuario_id` | vínculo pela membership legada |
| `existe_outro_admin_ativo()`, `exigir_gestao_de()`, `checagens_integridade_nucleo()` | `profiles` | `membros` |
| as quatro RPCs que gravam | `profiles.papel`/`ativo`, vínculos por pessoa | `membros`; vínculos da membership; `apagar_usuario` desativa todas |
| `handle_new_user` | só o perfil | o perfil e a membership `operador` |
| `profiles_guarda_dev` | protege a coluna | continua (exceção nomeada), "é dev" também pela membership, e recusa a escrita antiga pela janela |
| TS (`getOperador`, `admin.ts`) e scripts | `profiles` | `membros` |
| roteiros | 18 plantavam em `profiles` | `pg_temp.plantar_cargo`; as exceções nomeadas marcadas |
| policies (61) | nenhuma lia `profiles.papel` | nenhuma muda; +1 em `membros` |

---

# 6. A impressão do acesso, antes × depois

O instrumento: [`f62-evidencias/impressao-acesso.sql`](f62-evidencias/impressao-acesso.sql) (md5 `a3caf6da…`), o MESMO texto
antes e depois — cada perfil sob personificação, as seis funções de autorização, duas linhas de controle, e só
agregados (o id entra só no hash).

| banco | antes (tirado 18:23/18:27 UTC e refeito na hora de cada apply) | depois | veredito |
|---|---|---|---|
| **ensaio** | 5 perfis · 6 filiais · 4 combinações · md5 `f2cfd5a11d551ca0edfcfd78f28a5ff1` | idem, `f2cfd5a11d551ca0edfcfd78f28a5ff1` | **IGUAL** |
| **produção** | 16 perfis · 6 filiais · 9 combinações (dev 2, admin 2, sem cargo 2, cinco combinações de operador, consulta 5) · md5 `a5de88cfd5b5fe4038e693db1693013f` | idem, `a5de88cfd5b5fe4038e693db1693013f` | **IGUAL** |

As **policies** (instrumento `impressao-policies.sql`): `public` 53 · `d4fb378c…`, Storage 8 · `f116b8d0…` — iguais antes e
depois nos dois bancos; a única nova é `membros / leitura operador / SELECT`. Evidência:
[`antes/`](f62-evidencias/antes/) e [`depois/`](f62-evidencias/depois/).

---

# 7. As provas pós-apply, nos dois bancos

- **md5 do `prosrc`** = md5 do trecho entre os `$$` do arquivo nas **19** funções criadas ou recriadas, uma assinatura
  cada, os mesmos md5 nos dois bancos; grants como desenhados.
- **Dados:** perfis = memberships na WAP = iguais em papel e ativo (**5 · 16**); 0 perfil sem membership; vínculos
  **5 · 25**, 0 incoerentes; `plataforma_admins` = devs (**0 · 2**); 6 filiais na WAP; 1 empresa.
- **RLS ligada e sem `force`** nas três tabelas novas; `membros` só com SELECT para `authenticated`; `empresas` e
  `plataforma_admins` fechadas.
- **Advisor de segurança:** 3 → 5 (`empresas`, `plataforma_admins` — deny-all declarado) e 29 → 34 (`e_plataforma` e as
  quatro de conjunto — forma-alvo), iguais nos dois bancos; **0 achado não declarado**.
- **Paridade ensaio × produção** (`supabase/ci/impressao-schema.sql`): as 11 classes iguais em contagem e fingerprint.
- **Tipos:** a geração do conector bate com o `database.ts`, salvo o Insert de `operador_filiais` (opcional de propósito
  — ata (m)).
- **Conferidor de formas contra produção:** 271 pontos, 100.398 linhas, **0 recusadas**; `auth.membro-operador` 16/16.
- **`medir-rls` no ensaio:** o piso manteve a forma (`InitPlan 1`, 1 loop; 0,624 → 0,712 ms); a forma por linha ficou
  2,4× mais cara — ata (n), [`depois/medir-rls-F0-ensaio.md`](f62-evidencias/depois/medir-rls-F0-ensaio.md).

---

# 8. As sabotagens, com a saída real

Índice com a linha real de cada uma: [`f62-evidencias/sabotagens-A-J.md`](f62-evidencias/sabotagens-A-J.md). As dez
(A varredura · B comparação · C isolamento · D `force` · E guarda do dev · F revogação · G rollback · H slugs · I `config`
· J usuário novo) ficaram vermelhas quando sabotadas e verdes no código da fase — e duas a mais, da revisão (a RPC
antiga em voo, 8d; a recópia, 6).

---

# 9. A revisão adversarial — o que ela quebrou

**Duas rodadas**, em contexto fresco, com dois céticos por achado, só leitura. **Primeira** (5 lentes): 5 achados, os 5
sobreviveram — (1) a recópia sem teste do ramo de reconciliação; (2) **a corrida do apply**: a RPC antiga em voo, bloqueada
pela trava da recópia, retomava depois do commit e gravava em silêncio a coluna congelada, com "feito" na tela; (3) o
rollback perdendo a troca feita entre a cópia e o desfazer; (4) a ata ausente; (5) o índice das ordens. **Segunda** (3
lentes, sobre os consertos): confirmou os cinco no código e achou 4 lacunas de TEXTO (o CHANGELOG e o `registry.ts`
afirmando resultado antes do apply; links para um relatório que não existia; números da F48 ao lado dos vigentes).
**Terceira passada** (um verificador): mais 4 frases de documentação no mesmo defeito, acertadas quando o resultado
existiu. Tudo na ata, itens (i)–(k). A 0158 foi corrigida no lugar — medido antes que nenhuma das sete tinha chegado a
banco real — com `db:lock --regravar-alterada`.

---

# 10. A contagem final

| | antes | depois |
|---|---|---|
| testes (Vitest) | 246 arquivos · 7.231 | **250 arquivos · 7.434** |
| roteiros no CI | 38 · 924 asserções | **41 · 969 asserções**, 0 `✗` |
| mutações (injetor) · teto | 105 · 105 | **125 · 125** (quarentena 2 de 127) |
| `k_secdef` | 58 | **65** |
| `k_policies_public` | 53 | **54** (as 53 byte a byte) |
| `k_negocio` / `k_infra` | 20 / 5 | **20 / 8** |
| `membros` · `plataforma_admins` · `operador_filiais` | — | ensaio **5 · 0 · 5**; produção **16 · 2 · 25** |
| `medir-rls` F0 (ensaio) | 0,624 ms · InitPlan 1 (1) | **0,712 ms · InitPlan 1 (1)** |

`npm run lint`, `npm run typecheck`, `npm run contraste` e `npm run verificar:actions` limpos; `npm run build`, por
inteiro:

<details><summary>npm run build (22/09/2026, código do SHA congelado)</summary>

```

> estoque-ti-wap@1.67.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 38ms
- Experiments (use with caution):
  · serverActions

  Creating an optimized production build ...
✓ Compiled successfully in 6.7s
  Running TypeScript ...
  Finished TypeScript in 7.7s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/32) ...
  Generating static pages using 7 workers (8/32) 
  Generating static pages using 7 workers (16/32) 
  Generating static pages using 7 workers (24/32) 
✓ Generating static pages using 7 workers (32/32) in 1526ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /admin/colaboradores
├ ƒ /admin/filiais
├ ƒ /admin/importar
├ ƒ /admin/itens
├ ƒ /admin/kits
├ ƒ /admin/motivos
├ ƒ /admin/senhas
├ ƒ /admin/tipos-item
├ ƒ /admin/usuarios
├ ƒ /ajuda
├ ƒ /ajuda/[slug]
├ ƒ /ajuda/manual
├ ƒ /api/saude
├ ƒ /ativos
├ ƒ /ativos/[id]
├ ƒ /ativos/novo
├ ƒ /auth/confirm
├ ƒ /auth/definir-senha
├ ƒ /dev
├ ƒ /dev/destrutivo
├ ƒ /itens
├ ƒ /itens/conferencia
├ ƒ /itens/historico
├ ○ /login
├ ƒ /movimentacoes
├ ƒ /movimentacoes/devolucao-fornecedor
├ ƒ /movimentacoes/nova
├ ƒ /pendencias
├ ƒ /relatorios/[filial]
├ ƒ /relatorios/acesso
├ ƒ /relatorios/gerados
├ ƒ /relatorios/gerados/[id]
└ ƒ /versoes


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

</details>

---

# 11. Os 30 critérios, autoverificados

| # | critério | | evidência |
|---|---|---|---|
| 1 | lint, test, typecheck, build, contraste, `verificar:actions`; CI verde | ✅ | §10; run `35783705125` |
| 2 | `PLAN-F62.md` com os 30 fatos, a tabela, o desenho, as decisões, a ordem e o rollback, antes do primeiro commit em `supabase/`/`src/` | ✅ | `da64272` antes de `ec275b9` |
| 3 | impressão "antes" nos dois bancos, antes de qualquer apply, só agregados | ✅ | `f62-evidencias/antes/` |
| 4 | migrations a partir da `0152`, classe, rollback, `db:lock`, `DA_F38`, sem enum novo, sem `update`/`delete` de topo no acervo, sem nome repetido | ✅ | `migrations-lock.test.ts`, `migrations-f38.test.ts` |
| 5 | `empresas` com a WAP, slug com formato e reservados + trava, `config` só objeto, máscara com ata | ✅ | 9m, 9n, `empresas-slug.test.ts`, ata 1 |
| 6 | `membros` = uma linha por perfil (16 · 5), papel e ativo iguais, as duas contas dev `'dev'`; a guarda em `membros` recusa o que a de `profiles` recusa | ✅ | §7; `cargo_dev` 2h→2j-quater |
| 7 | `plataforma_admins` com as duas contas dev; `e_plataforma()` sem parâmetro, sobre o chamador, sem consumidor | ✅ | §7 (2 em produção); 9f |
| 8 | `filiais.empresa_id` not null, WAP nas 6, default documentado, sem `update` | ✅ | §7; `0155` |
| 9 | `operador_filiais` com `empresa_id`/`membro_id` nos 25 (e 5), PK nova, FK composta; `definir_vinculos_usuario` e os roteiros funcionam | ✅ | §7; 9h; CI |
| 10 | as quatro de conjunto na forma-alvo, mesa e catálogo; nenhuma tabela da fase com `force` | ✅ | `catalogo_secdef`, 9j, 4-bis |
| 11 | a varredura do cargo congelado verde em catálogo, mesa, TS e roteiros, exceções numa fonte só, cada uma nascida vermelha | ✅ | `B-travas/`, sabotagem A |
| 12 | as seis funções iguais ao corpo antigo em toda célula da grade | ✅ | `cargo_equivalencia` 1–5 e 4b |
| 13 | **impressão "depois" IGUAL à "antes" nos dois bancos** | ✅ | §6 |
| 14 | `isolamento_tenant.sql` A↔B verde, honestidade, describe 5 emendado, describe 9 verde | ✅ | CI; `catalogos-seguranca.test.ts` |
| 15 | as RPCs, `exigir_gestao_de`, `checagens_integridade_nucleo`, `handle_new_user` em `membros`; o usuário novo com membership; `apagar_usuario` desativa as memberships | ✅ | 9l, 6b |
| 16 | `getOperador`, `admin.ts`, `persona.ts`, manutenção e seed em `membros`; as formas novas no conferidor contra produção | ✅ | §7 (conferidor) |
| 17 | tabelas classificadas, definer em `k_secdef`, policy nova no universo e no piso; as 61 byte a byte | ✅ | §6; catálogos |
| 18 | uma mutação por função de autorização + guarda em `membros` + `handle_new_user`; teto exato com porquê; quarentena < ⅓; `isolamento_tenant` em `ROTEIROS_DA_FICHA` | ✅ | 125/125; `mutacoes.test.mts` |
| 19 | rollback na ordem inversa, cópia primeiro, ensaiado no CI | ✅ | `f62_rollback.sql` rb0–rb3 |
| 20 | comparação de produção, paridade, advisors e md5 do `prosrc` na evidência | ✅ | `depois/producao.json` |
| 21 | `database.ts` conferido contra a geração do MCP, hand-fix declarado | ✅ | ata (m) |
| 22 | `ESCOPO_UNICO`, `chaveDoEscopo` e `empresa: null` ficaram, com ata e destino | ✅ | ata (o) |
| 23 | nenhuma dependência nova; workflows e `CLAUDE.md` da raiz intocados | ✅ | §1, o diff |
| 24 | as emendas: MATRIZ, ADR-002, ARQUITETURA, RUNBOOK, `auth/CLAUDE.md`, PLANO, `docs/README.md`, `prompts/README.md`, ata | ✅ | Frente F |
| 25 | 1.67.0, CHANGELOG, registry; tag anotada no merge do PR de documentação | ✅ | `v1.67.0` no merge deste PR (§14) |
| 26 | os dois PRs mergeados com os checks verdes; a conferência pós-deploy | ✅ | §14 |
| 27 | as sabotagens A–J com saída real | ✅ | `sabotagens-A-J.md` |
| 28 | nenhum dado real; da produção, só contagens e hashes; ninguém abriu o `.env.local` | ✅ | as evidências são agregados; o conferidor recebeu a credencial por `--env-file` |
| 29 | este relatório, com o roteiro do Johnny no topo | ✅ | §1 |
| 30 | o estado de repouso, com a data do PATCH | ✅ | §12 |

---

# 12. O estado de repouso — se o projeto parar aqui por dois meses

**Estável.** O cargo mora em `membros`, com uma linha por perfil e uma empresa; `papel_atual()` responde pela empresa
legada; toda tela, toda RPC e toda policy funcionam como antes (provado). `profiles.papel`/`ativo` ficam de pé,
congelados — o banco recusa a escrita pela janela de gestão, e nada os lê. A partir de **13/10/2026** a entrega PATCH
pode derrubá-los; se ela não vier, nada quebra: é peso morto documentado, não risco. `plataforma_admins` fica com os
dois devs de hoje; promover ou rebaixar dev não a mexe (sem consumidor — a F67 decide). As quatro funções de conjunto
existem e ninguém as chama. O que **pede atenção** num repouso longo: uma conta nova ganha membership pelo
`handle_new_user` (provado, 9l); uma conta criada por fora do Auth (não existe esse caminho hoje) ficaria sem
membership e sem acesso — falha fechada, não aberta.

---

# 13. O que este relatório NÃO prova

1. **Que exista isolamento entre empresas no acervo.** Não existe: o piso ainda deixa todo logado ativo ler tudo, e
   `empresa_id` no acervo é da F63; o recorte nas policies é da F66/F72.
2. **Que o cargo por empresa já valha nas policies.** A ponte responde pela empresa legada até a F67.
3. **Que o caminho do dev tenha sido provado no ensaio.** O ensaio não tem dev (fato 3); a guarda do dev está provada no
   CI (`cargo_dev.sql`) e, em produção, só pela impressão (os 2 devs com o mesmo acesso de antes).
4. **Que a fixture de duas empresas represente um cliente real.** Os cenários A↔B usam slugs fictícios e nenhum acervo.
5. **Que o seed cubra duas empresas.** É da F65 (decisão iv).
6. **Que a corrida do apply não tenha acontecido.** A guarda nova a torna ruidosa (`55000`); a impressão depois = antes
   mostra que nenhum cargo divergiu no apply de 22/09.
7. **Que o `force` seja inofensivo para sempre.** Ele é inócuo HOJE porque o dono tem BYPASSRLS; o 9o reprova no dia em
   que isso mudar.

---

# 14. Pendências, backlog nomeado e a conferência pós-deploy

**Backlog nomeado:**
- **F63:** a disciplina de backup e o `empresa_id` do acervo.
- **F64:** tirar o default de `filiais.empresa_id` (e, com ele, a ponte e `EMPRESA_LEGADA_ID`); o prefixo de patrimônio
  por empresa; o corpo de `escopoDoImportLog`.
- **F65:** o seed de duas empresas, com a trava inteira da ficha F62 (`EMPRESAS.length >= 2`, slug repetido, patrimônio
  compartilhado, cobertura das tabelas de negócio), e os uniques por empresa.
- **F66:** a linha de base do `medir-rls` depois da F62 (§7) — e a forma içada que tira o custo por linha.
- **F67:** `papel_atual(p_empresa)`, a conta de plataforma fora de `membros`, `e_dev()` por `e_plataforma()`, a regra de
  `plataforma_admins`.
- **F69/F70:** a empresa da sessão, o `ESCOPO_UNICO`, o `empresa` do funil.
- **PATCH:** derrubar `profiles.papel`/`ativo` e a exceção de `profiles_guarda_dev` (a partir de 13/10/2026); o
  comentário do hand-fix do `database.ts`; o item AS; o "✅" da Faixa 2.

**A conferência pós-deploy** (só leitura; detalhe em [`depois/pos-deploy.md`](f62-evidencias/depois/pos-deploy.md)):

- **Merge** do PR #70 com `verificar` e `banco-sem-docker` verdes: `fa10b54`.
- **`/api/saude`:** `{"ok":true,"versao":"1.67.0","commit":"fa10b54","banco":"ok"}`.
- **Smoke de produção:** 109 OK · 1 aviso (antigo: `kits_modelos` sem kit cadastrado) · **0 falha**.
- **Parte B do `saude.yml`, à mão** (run `35787899991`): verde — a conta `consulta` leu pela ponte nova, e a sonda de
  deriva deu **0 pendente**, com a `0158_cargo_em_membros.sql` como a mais nova do ledger.
- **A janela entre o apply de produção e o deploy:** a `0158` às **18:20:07**, o deploy pronto às **18:36:44** (-03) —
  **16,6 minutos**, com a tela antiga lendo a coluna congelada (igual à membership: a impressão "depois", tirada dentro
  da janela, saiu igual à "antes"); o banco já decidia por `membros`.
- **A tag anotada `v1.67.0`** vai no merge deste PR de documentação e é publicada (`git push origin v1.67.0`).

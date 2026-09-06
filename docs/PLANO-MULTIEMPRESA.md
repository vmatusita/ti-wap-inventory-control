# Plano — preparação estrutural e virada multiempresa in-place

### Estoque TI WAP · v1.49.1 · 126 migrations (a última é a `0127`; a `0029` é um gap real) · fases **F45 → F73**

*Escrito em 04/09/2026. Cada fase abaixo vira uma ordem de serviço em `docs/prompts/`.*

**Como este plano foi produzido.** Auditoria de 8 dimensões (isolamento e RLS, performance, acoplamento a filial, camada de dados e tipos, componentes e forms, testes e CI, operação, motor de import), com cada achado **verificado adversarialmente contra o código** por um segundo revisor — 137 sobreviveram. Mais a colheita do repositório irmão `stefanini-ti-inventory-control` antes de aposentá-lo, um painel de três arquiteturas independentes (lente do isolamento, da entrega contínua, da estrutura de código) julgadas e sintetizadas, e uma passagem final de crítica de completude que procurou o que as três deixaram passar.

**Sobre os números.** Uma última passagem conferiu as afirmações estruturais deste documento contra o repositório e **corrigiu quatro**: as policies vivas são 54 (46 em `public` + 8 em `storage.objects`), não 73 — 73 é artefato de grep que conta comentários; o piso de leitura cobre **16** policies, não 13, porque a `0112` e a `0114` nasceram já com ele depois da `0070`; o corpo vivo de `importar_ativos_substituir` tem 394 linhas, não 430; e os modelos `.docx` são mais acoplados do que parecia — "WAP" está fixo nos sete, cabeçalho incluído. Onde um número aparece abaixo, ele foi lido do código, não estimado.

---

# § 0 — Diagnóstico honesto

O Estoque TI WAP é um bom sistema com uma tese arquitetural correta e provada: a movimentação é a fonte da verdade, o estado deriva por trigger, o histórico é imutável, e a regra crítica mora no Postgres. Treze meses, 44 fases, 126 migrations, 149 arquivos de teste e 24 roteiros SQL sustentam isso. A auditoria não encontrou um sistema mal feito — encontrou **um sistema corretamente construído para um único inquilino**, cujas decisões mais acertadas passam a ser exatamente as mais perigosas quando existir um segundo.

A aritmética que governa este plano:

| O que está torto | Medida verificada | O que custa na virada |
|---|---|---|
| "Filial" com significados fundidos | 275 arquivos não-teste citam filial; ~109 call-sites de leitura de tabela de negócio | Cada um decide, isolado, se ganha recorte de tenant — e decide num vocabulário ambíguo |
| Recorte *fail-open* | `filtros/filial.ts:15-17` declara `[] = SEM RECORTE`; 72 `p_filial is null` em RPC | O valor de FALHA é o valor de VAZAMENTO. Nenhuma linha precisa mudar para o default virar "tudo de todo mundo" |
| Tipo descartado na fronteira | 53 `as unknown as` + ~28 `as X[]` sobre `select`; 37 `.rpc(` sem porta única | `empresa_id` ausente do select vira `undefined`, e a comparação passa em silêncio |
| A função que apaga acervo só muda por reescrita | `importar_ativos_substituir`: 11 cópias integrais; o corpo vivo (`0094`) tem 394 linhas | Cada guarda nova é outra colagem de 19 KB à mão em dois bancos |
| Porta pública com service role | `acesso.ts:454` devolve `createAdminClient()`; senha sem escopo no banco **e** no tipo | Uma senha válida abre o relatório de qualquer empresa trocando o slug na URL |
| CI que não fecha nada | um workflow, sem *required checks*; `vercel.json` de 4 linhas | Toda trava deste plano vira documentação do vazamento depois que ele foi ao ar |
| Sem teste de componente | 0 `.test.tsx` em 273 `.tsx`; `nova-movimentacao-form` 1.465 linhas / 19 `useState` | A virada acrescenta seletor de empresa e marca a quase toda tela |
| Backup incompleto por construção | import e reset apagam os `.docx` de `termos`; nenhum dos dois backups os carrega | Restaurar devolve `termos_gerados` apontando para objetos que não existem |
| Os 7 modelos `.docx` estão cravados na WAP | **Os 5 de responsabilidade** trazem "FRESNOMAQ INDUSTRIA DE MÁQUINAS" (×3 cada) e o CNPJ 06.337.280/0001-04 como texto fixo; **os 2 de devolução** dizem "para a empresa WAP" em prosa; **todos os 7** têm "WAP" fixo, inclusive no cabeçalho ("Wap – WAAW by Alok"). Foro de São José dos Pinhais e logotipo idem. Nenhum tem tag `{empresa}`, `{cnpj}` ou `{foro}` | O cliente nº 2 emitiria, sem erro nenhum, um termo assinado dizendo que o funcionário **dele** recebeu equipamento da Fresnomaq — ou, nos dois de devolução, que devolveu "para a empresa WAP" |

E o achado que amarra tudo, e que nenhum documento interno tinha escrito:

> **"Filial" tem três significados hoje — escopo de escrita, atributo de exibição, chave de identidade. O quarto, RECORTE DE LEITURA, não tem nome porque hoje ele é universal (`papel_atual() is not null`: todo logado ativo lê tudo). É exatamente esse quarto que a virada cria, e ele vai nascer sem lugar para morar.**

Se ele nascer dentro de `src/lib/filtros/filial.ts` — o único arquivo onde "quem é você" hoje encontra "o que você vê", e cuja convenção declarada é `[] = sem recorte` —, `?empresa=todas` vira chave mestra, com layout perfeito e sem erro nenhum.

---

# § 1 — As decisões travadas (04/09/2026)

Oito decisões suas, que este plano assume e não revisita. Estão aqui para o executor de cada fase não precisar de contexto de conversa.

| # | Decisão | Consequência no plano |
|---|---|---|
| 1 | **Evoluir o WAP, não criar projeto novo.** O repositório irmão `stefanini-ti-inventory-control` ("Acervo") é aposentado; o que ele tem de bom foi colhido para cá | O plano é de refatoração sobre um sistema em produção, não de construção. O `PLANO-PRODUTO-MULTIEMPRESA.md` (14/08) e o `SYSTEM-DESIGN-ACERVO-2026-08-31.md` passam a valer como **catálogo de requisitos**, não como plano de execução — e ganham cabeçalho dizendo isso na F59 |
| 2 | **Migração in-place e aditiva.** `empresa_id` entra com default da WAP; produção nunca é recriada; cada fase é reversível | Nenhuma migration recria schema. Nenhum export/reimport. O `drop default` vem logo depois do `not null` — o default é a rede da migração, não do produto |
| 3 | **A WAP vira o tenant nº 1 no MESMO banco de produção** | O pior defeito possível é vazar 13 meses de dado real. É por isso que 17 fases de preparação vêm antes de qualquer `empresa_id` |
| 4 | **R$ 0 na preparação e na virada.** Serviço pago só quando houver cliente | As 28 fases são desenhadas para não precisar de dependência nova nem mensalidade. O único ponto com custo é o piloto (F73), isolado de propósito |
| 5 | **Sem prazo — prioridade é fazer certo** | Fases pequenas e verificáveis, com estado de repouso, em vez de poucas fases grandes |
| 6 | **Uma conta, vários vínculos: tabela `membros` com cargo POR EMPRESA** | `profiles.papel` (cargo global) migra para `membros.papel` **na fase que cria `membros`**, não depois. Isso é o que permite `@stefanini.com` ser admin na WAP e consulta num segundo cliente. Muda a forma de todos os predicados de autorização — ver §6/F62 |
| 7 | **Termos `.docx` adiados: o piloto opera sem emitir termo** | Não há fase de parametrização de modelo. Em compensação, entra uma **trava dura** (F67/F70): empresa que não seja a WAP tem a emissão de termo RECUSADA pelo banco, com mensagem própria. "Adiar" não pode significar "emitir errado em silêncio" |
| 8 | **Portão do CI fechado já na F45**, com PR por fase e bypass na sua conta | Aceita-se o custo de alguns minutos por fase. As ~30 travas anti-reincidência deste plano valem zero sem ele: hoje o job `banco` pode marcar ✗ e a Vercel publica igual |

---

# § 2 — A estratégia, em três parágrafos

**Primeiro: nada é feito sem portão.** O CI hoje não bloqueia deploy, e dois pushes seguidos na `main` cancelam o CI do primeiro — o commit intermediário é publicado sem validação nenhuma. Este plano deixa cerca de trinta travas anti-reincidência, e todas valem zero até esse portão fechar. Fechá-lo é configuração e YAML, custa uma tarde, e multiplica as 27 fases seguintes. Junto vem a trava de hash das migrations — porque a virada é uma fila de vinte migrations aditivas contra um banco cujo ledger sabidamente não bate com o repositório — e o injetor de mutações, que é a única ferramenta capaz de provar que um roteiro SQL consegue ficar vermelho. Um roteiro de isolamento tautológico é pior do que roteiro nenhum: ele dá sensação de rede.

**Segundo: a preparação só contém trabalho que se paga sozinho, mesmo que o multiempresa nunca aconteça.** Cada uma das dezessete fases de preparação ou conserta um defeito que já morde hoje (o desempate por uuid aleatório que já custou duas correções em produção; o import que recusa 100% das linhas de qualquer filial fora das cinco da WAP enquanto a tela de admin deixa criar uma sexta; o backup que promete o que não entrega), ou fecha uma categoria inteira de risco com uma condição dentro de uma função (as cinco RPCs de conta que decidem por cargo e nunca por pertencimento), ou é uma mudança de forma com comportamento idêntico cujo custo cresce de forma irreversível se ficar para depois (o fim do fail-open, a porta única de RPC, a decomposição da RPC de import). O que não passa nesse crivo — a régua de layout inteira, a decomposição dos formulários gigantes, a migração para react-hook-form — está fora, nomeado no §8.

**Terceiro: a virada é aditiva, em lotes pequenos, e a mudança perigosa é dividida em duas.** `empresa_id` entra com default, backfill onde couber, `not null`, `drop default`. E o predicado de tenant entra **em conjunção com o piso antigo** — logicamente inerte enquanto houver uma empresa —, de forma que "escrever o recorte" (F66, reversível, testável, sem janela) e "apagar o piso" (F72, uma linha por policy) sejam duas coisas. Isso converte a fase que a análise ingênua chama de ponto de não retorno numa fase pequena, ensaiada e revertível em segundos. A ordem interna da virada é **estrutura → integridade → policy → definer → porta pública → identidade → UI → revogação**, porque a camada de integridade (FK composta) **sobrevive à falha da camada de policy**: o banco recusa pendurar filho de uma empresa em pai de outra mesmo sem RLS, mesmo com bug de aplicação.

---

# § 3 — A espinha, e por que esta ordem

**As dependências que fixam a ordem, em linguagem de "o que destrava o que":**

- **F45 destrava tudo.** Sem *required check*, as ~30 travas deste plano informam, não reprovam.
- **F46 destrava a fila de migrations da virada.** Uma migration editada depois de aplicada é o erro mais caro possível numa fila de vinte.
- **F47 destrava F48.** Escrever quatro catálogos novos sem ter provado que roteiro SQL consegue ficar vermelho é escrever quatro documentos — e o repositório já tem 34 asserções do formato `if v_n = 0 then ✓` que passam sobre conjunto vazio.
- **F51 destrava F52 e F56.** Quatro guardas novas mais o vocabulário como dado, no método atual, são **cinco colagens de ~400 linhas à mão em dois bancos**. Decompor primeiro converte cinco riscos de transcrição em cinco diffs revisáveis.
- **F53 destrava F60.** `movimentacoes.ordem` é o cursor de que a paginação keyset precisa.
- **F57 destrava F58 e a virada inteira.** Ela cria o lugar onde o recorte de leitura vai morar e mata a convenção `[] = tudo`. É o único item cujo custo cresce de forma **irreversível** se ficar para depois: hoje é TypeScript com o compilador de rede; depois é a fronteira de autorização, em produção, com dois clientes.
- **F58 destrava F60.** Sem porta única de RPC, trocar a assinatura das `rel_*` é 37 pontos à mão.
- **F59 destrava F66.** A régua içada tem de estar ensaiada e travada por teste **antes** de alguém escrever a primeira policy com `empresa_id` — senão nasce `e_membro(empresa_id)`, que é o que o próprio `PLANO-PRODUTO-MULTIEMPRESA.md:71` propõe e que a migration `0107` do próprio repositório já provou custar 45%.
- **F62 é a fase mais pesada da virada**, porque a decisão 6 (cargo por empresa) faz `profiles.papel` migrar para `membros.papel` junto com a criação da raiz.
- **F65 destrava F66.** FK composta com backfill incompleto falha no `add constraint`; policy sobre coluna nula deixa passar linha invisível.
- **F66 destrava F72 e a esvazia.** Depois dela o predicado novo já está no ar, provado e medido; F72 só apaga o termo redundante.
- **F68 destrava o piloto.** Enquanto o viewer rodar sob service role, uma senha válida abre o dado de qualquer empresa, e o único muro é o código das queries.

---

# § 4 — Regras comuns a TODAS as fases

Cada fase vira `docs/prompts/F<N>-<slug>-ultracode.md` e um relatório `docs/RELATORIO-F<N>.md`. Toda ordem herda o que segue, sem repetir:

1. **Modo autônomo** (`CLAUDE.md`): decide, implementa, aplica migration, abre PR, mergeia e deploya. Perguntar ao Johnny só por insumo físico.
2. **Estado de repouso obrigatório.** Ao fim de cada fase o sistema fica num estado terminal válido — sem dupla escrita, sem coluna esperando backfill, sem flag pendente, sem branch aberta. Cada ficha declara o que acontece se o projeto parar ali por dois meses.
3. **Escopo fora explícito.** O campo "Não entra" existe para impedir que a fase seguinte seja antecipada "já que estou aqui". O que aparecer fora do escopo vai para o backlog do relatório final.
4. **Trava antes da correção**, sempre que a trava puder nascer vermelha. Onde ela nasce verde (varreduras de catálogo), vem no mesmo commit.
5. **No-op primeiro.** Na virada, toda mudança de segurança entra em conjunção com o predicado antigo, logicamente inerte enquanto houver uma empresa.
6. **Fechamento:** `npm run lint`, `npm run build` e `npx tsc --noEmit` limpos; checklist autoverificado; ata em `docs/DECISOES.md`.
7. **Versionamento (regra permanente 8), sem exceção:** entrada no `CHANGELOG.md` ⇒ bump **MINOR** no `package.json` + entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em linguagem de operador + tag anotada `v<versão>`. Fase invisível ao operador também ganha versão — muda só o texto ("as telas de operação passaram a responder em cerca de metade do tempo"), nunca o silêncio. Correção avulsa fora de fase = **PATCH**.
8. **Migration nunca se edita.** Alteração = migration nova (a última hoje é `0127_conversao_reservas.sql`).
9. **R$ 0.** Nenhuma das 28 fases precisa de dependência nova ou serviço pago — isso é requisito de desenho, não coincidência. O único ponto com custo é o piloto (F73), e ele está isolado.
10. **Reversão padrão:** fase só-código = `git revert` + redeploy; `create or replace` = reemitir o corpo anterior; `add column … default` = `drop column` enquanto nada escreve; `set not null` = `alter column drop not null`. **Toda fase que toca banco declara a ORDEM de rollback** — que é o inverso da ordem de apply, e o `RUNBOOK-BANCO.md:31` só documenta a de apply.


---

# § 5 — PARTE I: PREPARAÇÃO (F45 → F61)

## Bloco A — O portão e as provas

---

### F45 — O portão fecha, e o teste de componente ganha piso

**Objetivo.** Fazer o CI poder REPROVAR um deploy, fazer os roteiros SQL rodarem na máquina antes do push, e criar a única infraestrutura de teste que falta — render de componente — sem dependência nova.

**Entra.**

- *Branch protection* na `main` com `verificar` e `banco` como *required status checks*. **Consequência mecânica, aceita na decisão 8 e escrita na ata:** *required check* sem *require pull request* torna push direto impossível na prática, então as 28 fases seguintes passam a ser PR com espera do job `banco`. O Johnny mantém bypass na conta, e usá-lo é ato consciente.
- Desligar `cancel-in-progress` para `push: branches: [main]`, mantendo para PR — hoje dois pushes seguidos cancelam o CI do primeiro e o commit intermediário é publicado sem validação nenhuma.
- Passo `npm run verificar:actions` no job `verificar` + script no `package.json`. É o gate de artefato que existe por causa das 20 horas de indisponibilidade da F13 e que **não roda no CI nem é script npm**.
- `scripts/db/rodar-roteiros.sh`, extraído do loop de `ci.yml` e **chamado pelo CI e pelo desenvolvedor** (`npm run db:test`, `npm run db:test:um <arquivo>`), para que local e CI não possam divergir.
- **Honestidade dos roteiros:** todo roteiro termina com `raise notice 'FIM <nome>: % asserções, % falhas'`; o CI falha se a linha `FIM` não aparecer (roteiro que aborta cedo hoje passa verde) e passa a contar `NOTICE:.*✗` como falha. Os 13 roteiros sem contador ganham `v_ok`/`v_falhas`.
- `supabase/tests/_asserts.sql` com `pg_temp.assert_zero_de(rotulo, ruins, universo)`, que **recusa universo vazio**. Carregado **antes** do `begin` de cada roteiro (dentro da transação some no rollback); o loop do CI passa a pular `_*.sql`.
- **Piso de teste de componente, grau 1:** `vitest.config.mts` migra para `test.projects` — `puro` (o de hoje) e `componentes` (`include: src/**/*.test.tsx`). Render por `renderToStaticMarkup` de `react-dom/server`, **que já é dependência**. Escopo enumerado: componentes sem efeito e sem `next/navigation` — `Aviso`, `EstadoVazio`, `CartaoDeMetrica`, `Marca`, `QuadroDeTabela`, `ConfirmacaoDigitada`, badges. Três testes-semente: papel ARIA por variante do `Aviso`; `aria-describedby` do `ConfirmacaoDigitada` apontando para id existente; `<h1>` no `Pagina`.
- `.gitattributes` com `* text=auto eol=lf` e o motivo escrito.

**Não entra.** jsdom, `@testing-library/*`, `@vitejs/plugin-react` (dependência nova — vira proposta escrita ao Johnny como grau 2, depois do piloto). Nenhum teste de componente com interação. Nenhuma refatoração.

**Entregas.** `.github/workflows/ci.yml`, `scripts/db/rodar-roteiros.sh`, `supabase/tests/_asserts.sql`, `vitest.config.mts`, 3 `.test.tsx`, `.gitattributes`, `src/lib/ci-passos.test.ts`.

**Pronto quando.** Um commit que quebre um roteiro SQL **não chega em produção**; `npm run db:test` roda na máquina do Johnny; `npm run test` executa pelo menos um `.test.tsx`; `verificar:actions` aparece no log do CI.

**Trava.** `src/lib/ci-passos.test.ts` — lê o YAML como texto e afirma que os passos existem e que os scripts estão no `package.json` (é assim que esse tipo de gate morre: alguém o remove para o CI ficar mais rápido). Mais a asserção de que todo `*.test.ts?(x)` do repositório está coberto por um projeto do Vitest — hoje `scripts/env-guard.ts`, `scripts/design/` e `scripts/termos/` estão fora do runner: teste escrito ali nunca roda e ninguém fica sabendo.

**Dependências.** Nenhuma. É a raiz.

**Risco.** O *required check* é configuração **fora** do repositório, e nenhuma trava interna impede que alguém a desligue no painel. Fica dito assim, sem fingir que o teste cobre: registre a decisão com data no `README.md` e no `DECISOES.md`.

**Reversão.** Painel do GitHub + `git revert`. Não toca produção.

**Repouso.** Perfeito. O sistema fica com um CI que fecha e um rig de teste que ninguém é obrigado a usar.

---

### F46 — A trava de hash das migrations e o CI de banco sem Docker

**Objetivo.** Tornar "migration aplicada nunca se edita" uma defesa executável, e deixar o job `banco` rápido e legível — **sem criar um caminho novo de apply em produção e sem dependência nova**.

**A correção de rota que esta fase carrega.** A leitura ingênua desta dívida diz "trocar `supabase db push` por um aplicador próprio". Isso está errado por três motivos verificados no repositório: (a) `db push` **já é proibido por escrito** (`RUNBOOK-BANCO.md:122`) e a CLI local aponta para o ensaio, nunca para produção — não há ferramenta insegura para trocar; (b) o ledger é furado porque **o MCP grava timestamps de 14 dígitos** no ato do apply enquanto os arquivos usam prefixo sequencial, e um aplicador novo com hash não conserta isso, só cria um quarto esquema de identificação ao lado dos três que já existem; (c) `pg` **não está no `package.json`** — nem `pg`, nem `postgres`, nem a CLI `supabase` (que é global). Um aplicador que fale com o Postgres é dependência nova, e a decisão 4 a proíbe na preparação.

**Entra.**

- **`supabase/migrations.lock.json`** — mapa `arquivo → sha256 do conteúdo normalizado` (`\r\n` → `\n`, senão o Windows acusa deriva a cada clone), versionado no repositório. `src/lib/validators/migrations-lock.test.ts` recalcula os hashes e **falha se um arquivo já travado mudou um byte**; arquivo novo é aceito e o executor regrava o lock no mesmo commit. Zero dependência, roda no Vitest que já existe, e é a peça que de fato faz a regra permanente 6 virar defesa executável.
- **`supabase/ci/bootstrap-auth.sql` e `supabase/ci/bootstrap-storage.sql`** — o recorte mínimo dos schemas `auth`/`storage`, dos roles `anon`/`authenticated`/`service_role` e dos *default privileges* de que as migrations e os roteiros dependem, declarado à vista e versionado em vez de escondido numa imagem de terceiro.
- **Job `banco` reescrito** para `services: postgres:<major de produção>` → bootstrap → aplicar as migrations em ordem por `psql` (já disponível no runner, sem pacote npm) → **aplicar de novo, provando idempotência** → `db:test`. Sai o `supabase start` (Docker, lento).
- **O job antigo fica em paralelo** até o novo estar verde em três pushes seguidos. Removê-lo é entrega avulsa PATCH, não fase.
- **A dívida A fica registrada como aberta, não como paga.** Ata em `DECISOES.md` dizendo com todas as letras: o caminho de apply de produção continua sendo o MCP + sonda de efeito por `pg_get_functiondef`; o que esta fase entrega é *o CI sem Docker* e *a impossibilidade de editar migration aplicada*. Se um dia o Johnny quiser abandonar o MCP como caminho de apply, isso é ADR próprio e exige aprovação de `pg` como dependência.
- Apagar o campo "ledger em dia" do `/dev` — é uma comparação que não pode dar falso, e o `RUNBOOK-BANCO.md:120-130` já escreveu que o controle que funciona é a sonda de efeito.

**Não entra.** Aplicador com conexão direta ao Postgres de produção. Renomear as 126 migrations para o padrão timestamp. Qualquer mudança de schema.

**Entregas.** `supabase/migrations.lock.json`, `src/lib/validators/migrations-lock.test.ts`, `supabase/ci/bootstrap-*.sql`, `.github/workflows/ci.yml`, `docs/RUNBOOK-BANCO.md`, `src/lib/queries/dev.ts`, `src/components/dev/diagnostico-painel.tsx`.

**Pronto quando.** O job `banco` aplica as 126 migrations do zero sem Docker do Supabase; aplicar duas vezes é no-op; editar um byte de migration antiga derruba o CI com a mensagem certa.

**Trava.** O `migrations.lock.json` + o teste.

**Dependências.** F45.

**Risco (o maior do bloco).** O `supabase start` de hoje entrega `auth.users`, `storage.objects` e os roles de graça, e 7 dos 24 roteiros usam `set local role authenticated`. Bootstrap incompleto quebra o job inteiro. **Mitigação:** conferir o major de produção primeiro e aplicar as 126 migrations nesse major localmente **antes** de ligar o job; o job antigo em paralelo; se falhar, a fase entrega só a trava de hash e o bootstrap vira backlog nomeado.

**Reversão.** `git revert`. Não toca produção nem dado.

---

### F47 — O injetor de mutações e o gate de deriva

**Objetivo.** Provar que os roteiros SQL conseguem ficar vermelhos, e fazer o CI descobrir sozinho quando `database.ts` ou o schema de produção derivaram do repositório.

**Entra.**

- **`scripts/db/run-mutation-tests.mjs`.** Execução de controle primeiro (sem mutação, tudo verde — sem ela, um roteiro já vermelho faria tudo "ser detectado"). Cada mutação declara `derruba: ['<cenário>']` e o injetor exige **o cenário certo**, não "deu ✗ em algum lugar". Lote inicial de 20 a 30 quebras, concentradas onde a virada vai depender: `papeis_rls.sql`, `seguranca_catalogo.sql`, `cargo_dev.sql`, `dev_destrutivo.sql`, `import_substituir.sql`, `conflito_filiais.sql` — com pelo menos uma do tipo **"a guarda confere o papel e esquece o escopo"**, que é a quebra cross-tenant clássica. O helper `corpoVigente(assinatura)` (resolve o corpo vivo varrendo as migrations da maior para a menor) é reusado pela F51 e é o antídoto parcial da dívida X. `npm run db:test:mutations`, no `push` da `main` e em PR marcado.
- **Gate de tipos por CONJUNTO, não `diff -u`.** Gerar com `supabase gen types typescript --local` e comparar extraindo de cada lado o conjunto (tabela, coluna) de `Row`/`Insert` e os nomes de `Functions`, falhando só quando o repositório **não contém** o que o banco tem. O `diff` estrito é frágil por três motivos verificados: `PostgrestVersion` vem do servidor; o arquivo já foi editado cirurgicamente à mão de propósito (`DECISOES.md:448`, para preservar hand-fixes de nulabilidade que a CLI regride); e produção tem objeto que nenhuma migration cria. Um passo de CI que falha por motivo legítimo é desabilitado na terceira vez.
- **O destino de `_bkp_relatorios_gerados_f6a`**, decidido e registrado: ela existe em produção (linha 17 de `database.ts`), nenhuma migration a cria, não tem RLS, e `seguranca_catalogo.sql:73` a exclui de propósito por `left(relname,1) <> '_'`. **Adotar:** migration com `enable row level security` + policy `e_dev()`, trazendo-a para o versionamento sem apagar snapshot. E **remover o filtro por prefixo do roteiro** — a isenção não tem motivo escrito e é a categoria por onde qualquer backup futuro escapa.
- Ordem interna obrigatória: adotar a `_bkp_` → gerar tipos → ligar o gate. (Senão o gate nasce vermelho por causa dela.)

**Não entra.** A "impressão do schema" por fingerprint de classe — é um terceiro mecanismo para o mesmo fato que o gate de tipos e a trava de hash já cobrem. Inverter a fonte dos tipos (comitar o gerado do banco local revoga decisão registrada — se for o caminho, é ata própria).

**Entregas.** `scripts/db/run-mutation-tests.mjs`, `scripts/db/diff-tipos.mjs`, migration `0128` (adoção da `_bkp_`), `.github/workflows/ci.yml`, `supabase/tests/seguranca_catalogo.sql`.

**Pronto quando.** As mutações são todas detectadas pelo cenário nomeado; desligar uma asserção de `papeis_rls.sql` faz o injetor acusar a mutação correspondente como não-detectada; acrescentar coluna sem rodar `db:types` derruba o CI.

**Trava.** O injetor; o gate de tipos; `seguranca_catalogo.sql` sem exclusão por prefixo.

**Dependências.** F46.

**Risco.** Baixo. O cuidado é o injetor virar teatro: exigir o cenário nomeado, e não "algum ✗", é o que impede isso.

**Reversão.** `git revert`; `alter table … disable row level security`.

---

### F48 — Os catálogos de segurança

**Objetivo.** Enumerar, por catálogo do Postgres e não por lista nomeada, as quatro superfícies que hoje ninguém enumera: as **54 policies vivas** (46 em `public` + 8 em `storage.objects`), as ~37 funções `security definer`, as policies de Storage e a publication de Realtime.

**Entra.**

- **`supabase/tests/catalogo_policies.sql`.** Lê `pg_policies` e afirma: toda tabela de negócio tem policy de SELECT; nenhuma é `using (true)`; o piso `papel_atual() is not null` está exatamente onde deve estar hoje (comparação `ilike '%papel_atual%'`, porque `pg_policies.qual` normaliza a expressão). `senhas_acesso` classificada como tabela de **negócio**, não infra — a virada precisa dela lá.
- **`supabase/tests/catalogo_secdef.sql`.** Tabela-verdade das `security definer` vigentes: função nova não classificada **reprova**. Asserções que já valem hoje: `search_path` travado em todas; nenhuma executável por `anon`. Exceção nominal para `valida_lancamento_item`, que é INVOKER de propósito e cujo motivo o `seguranca_catalogo.sql:16-23` já explica — sem repetir essa exceção, a trava nova vira ✗ permanente e alguém a desliga. **Nota de calibragem para o executor:** o hardening de grants é *melhor* do que parece — são 107 `revoke all on function` (não 5), 77 citando `anon` explicitamente. O que falta não é revogar; é **ser obrigado a revogar**.
- Asserção de **publication** varrendo `pg_publication_tables`. O Realtime é a única superfície de leitura que não aparece em inventário nenhum — nem no tripwire do viewer, nem em `papeis_rls.sql`.
- Asserção de **Storage**: nenhuma policy de `storage.objects` cujo `using` decida só por `bucket_id`. Hoje não existe uma única asserção sobre Storage no repositório.
- **Esqueleto de `supabase/tests/isolamento_tenant.sql`** — só as partes que valem com uma empresa: o bloco de grants espelhado de `papeis_rls.sql:90-127` (sem ele, no Postgres do CI `authenticated` não tem GRANT e "vi zero linhas" é `permission denied` disfarçado — o roteiro mentindo onde não pode); a **convenção de honestidade** (fixtures contadas como `postgres` **antes** de qualquer "viu zero"; toda recusa provada duas vezes — a operação falha E, de volta como `postgres`, o dado original continua intacto; FK composta provada com o par simétrico, porque "recusou" sem o par pode estar recusando por outro motivo); e as varreduras schema-wide (nenhuma tabela de `public` sem RLS, sem exceção por prefixo; nenhuma view sem `security_invoker`; nenhuma linha com a chave de recorte nula). Os cenários A↔B nascem na F62.
- Regra escrita em `docs/MATRIZ-REGRAS.md`: **`force row level security` continua proibido**, com o `42P17` esperado ao lado. Em `profiles` derruba o sistema com erro em toda leitura para todo mundo ao mesmo tempo (`papel_atual()` lê `profiles`, a policy de `profiles` chama `papel_atual()`, e o ciclo só não fecha porque a função roda como dono); em `ativos`, `pendencias_item` e `movimentacoes` quebra `aplicar_movimentacao` e o trigger da `0051`, que escrevem fora de policy contando com o bypass do dono — a mesma seção da `0070` documenta as duas coisas, uma quatro linhas abaixo da outra.

**Não entra.** Nenhuma correção de policy ou função. Esta fase só **enumera** e **congela a linha de base**.

**Entregas.** `supabase/tests/{catalogo_policies,catalogo_secdef,isolamento_tenant}.sql`, `seguranca_catalogo.sql` estendido, `docs/MATRIZ-REGRAS.md`.

**Pronto quando.** Os quatro catálogos passam verdes contra o estado atual; acrescentar uma tabela sem RLS, uma view sem `security_invoker`, uma policy `using (true)` ou uma `security definer` não classificada derruba o CI.

**Trava.** Os próprios catálogos — derivados, não listas.

**Dependências.** F47 (o injetor prova que essas asserções conseguem falhar).

**Risco.** Baixo. O único cuidado é o `catalogo_secdef` nascer vermelho por uma exceção legítima não declarada — por isso a exceção nominal com motivo escrito é requisito, não opção.

**Reversão.** `git revert`.


---

## Bloco B — As fronteiras nomeadas e as fechaduras no-op

---

### F49 — A fronteira do servidor

**Objetivo.** Fechar a fronteira HTTP e a fronteira RSC — as duas camadas onde o `CLAUDE.md` afirma "a UI é a segunda linha" e onde hoje não há primeira.

**Entra.**

- **`import 'server-only'` em `src/lib/queries/**`** — hoje só 5 de 28 módulos têm, e **os 7 de `queries/relatorios/` estão 100% sem**, que são justamente os servidos ao visualizador com service role. `prefixo-busca.ts` tem a parte pura extraída antes (o teste o importa direto); os três testes que importam módulos de query usam `vi.mock('server-only', () => ({}))`, receita já usada em `scrypt-senha.test.ts`.
- **Guarda em toda Server Action exportada.** Nove leituras não têm nenhuma — `buscarAtivosParaMovimentacao`, `resolverPatrimoniosParaLote`, `buscarColaboradoresDoCampo`, `buscarSugestoesSetores`, `buscarPossiveisDuplicatasDoDia`, `buscarResumoDeAtivosPorIds` (`actions/movimentacoes.ts`), `buscarSugestoesMarca`/`Modelo`/`Fornecedor` (`actions/compras.ts`) — enquanto `buscarAtivosRecentesDoOperador`, no mesmo arquivo, chama `exigirPapel(supabase,'consulta')`. Acrescentar a mesma guarda, e teto em `buscarResumoDeAtivosPorIds` (reusar `MAX_LOTE_COMPRA`). **Ganho imediato com uma empresa:** perfil desativado com cookie vivo deixa de enumerar patrimônio e nomes de pessoas.
- **A paleta de comandos entra nesta fase, e é o call-site mais quente das nove.** `paleta-comandos.tsx:42` importa `buscarAtivosParaMovimentacao` e busca com debounce a cada tecla, em toda tela, para todo logado; a linha 523 mostra `{r.filial_nome}` no resultado — é um oráculo de busca de acervo que devolve o nome da filial dona. Ela também é uma **superfície de autorização de UI paralela ao `sidebar-nav`** (`soAdmin`, `soDev`, `podeEscrever` nas linhas 72-76, 399 e 408), e o `podeLer` criado na F50 precisa alcançá-la. Medir aqui, não só nas telas.
- **`src/lib/supabase/superficie-admin.test.ts`** — enumera os ~30 call-sites de `createAdminClient()` em 11 arquivos e exige que cada arquivo esteja numa lista **com motivo escrito e a guarda que o protege**. Na virada, essa lista é a agenda do recorte fora da RLS.
- Cabeçalho em `src/lib/queries/admin.ts` no tom do de `fronteira-viewer.test.ts`, declarando que este é o **segundo módulo sem RLS** — ele lê com service role em nove funções e **enumera o projeto Auth inteiro** (`listUsers`, até 10 mil contas), e o que ele lê são pessoas, não inventário.

**Não entra.** Recorte de filial nas queries (é F57). Mudar o que as queries fazem.

**Entregas.** 23 arquivos de `queries/` com `server-only`, 9 actions com guarda, `src/lib/queries/prefixo-busca.ts`, `paleta-comandos.tsx`, `src/lib/actions/guardas-de-action.test.ts`, `src/lib/supabase/superficie-admin.test.ts`, `src/lib/queries/servidor-apenas.test.ts`.

**Pronto quando.** O teste de guardas reprova ao remover qualquer uma das nove; a suíte passa com `server-only` nos 23; nada mudou de comportamento (smoke igual); a paleta continua respondendo dentro do orçamento medido.

**Trava.** `guardas-de-action.test.ts` varre todo módulo `'use server'`, extrai `export async function` e exige uma das cinco guardas de `src/lib/auth/acesso.ts` **ou** presença em `SEM_GUARDA: Record<'arquivo::função', motivo>` — os 4 exports de `actions/auth.ts` entram nomeados (públicos por desenho), e as nove nascem corrigidas, não isentas. Mais o teste que reprova import de VALOR de `@/lib/queries/*` em módulo cliente, e a catraca "todo módulo de `lib/queries` declara `server-only`" que só encolhe.

**Dependências.** F45.

**Risco.** `exigirPapel` faz uma ida ao banco por chamada, e três das nove são chamadas com **debounce por tecla** no combobox e na paleta. Medir com `scripts/perf/medir.mjs` antes/depois; se doer, resolver a sessão uma vez por request com `cache()` (padrão já usado em `acesso.ts:165`).

**Reversão.** `git revert`.

---

### F50 — A fronteira da leitura

**Objetivo.** Consertar os tripwires que já estão furados, dar escopo ao canal de tempo real, e criar — trivialmente hoje — os dois lugares onde o recorte de tenant vai encostar na UI.

**Entra.**

- **Tripwire do viewer invertido para allow-list, com superfície DERIVADA.** Hoje é deny-list de três nomes sobre `readdirSync` de uma pasta mais dois arquivos declarados à mão, e **já está desatualizado**: a F39 pôs `queries/tipos-item.ts` na superfície do viewer (aceita client resolvido, dois call-sites com `acesso.client` em `relatorios/[filial]/page.tsx:131` e `gerados/[id]/page.tsx:57`) e ninguém o declarou. Correção em três peças: (1) `tipos-item.ts` entra hoje; (2) superfície derivada da **assinatura** — toda função de `src/lib/queries/**` que aceite `client?: SupabaseClient<Database>` tem de estar declarada, mais recusa de atribuição de `acesso.client` a variável; (3) lista **branca** de tabelas em `.from(` **e de RPCs em `.rpc(`** — deny-list não cobre tabela que ainda não nasceu, e a virada cria `empresas`. Caso de sanidade obrigatório: `expect(superficie).toContain('queries/tipos-item.ts')`.
- **`confinamento-viewer.test.ts` com superfície derivada do grafo de imports**, não por pasta, e `SUPERFICIE_MINIMA` como catraca que só sobe. É pré-requisito de F61, que leva componentes de `layout/` para dentro das telas de relatório.
- **`queries/relatorios/comum.ts:14-24` para de engolir o erro.** Hoje `const { data } = await …maybeSingle()` sobre `.eq('slug', slug)` descarta o `error`; quando `filiais.slug` deixar de ser único global, o PGRST116 vira `notFound()` silencioso em TODA rota de relatório, para operador e para viewer, sem log. Uma linha separa "quebrou" de "quebrou em silêncio". Mais a varredura de `const { data } = await` em `src/lib/queries/**` com a lista de infratores atuais congelada.
- **Realtime com escopo.** `realtime-refresh.tsx:49-54` assina INSERT de `movimentacoes`, `lancamentos_item` e `anotacoes` **sem filtro nenhum**, em canal de nome literal. Acrescentar `filter:` com o valor que hoje não recorta nada, nome de canal parametrizado por `chaveDoEscopo` (a mesma função que a F61 usa para as chaves de storage), e ata registrando que **o Realtime não passa por `lib/queries` e portanto não herda nenhum recorte que a virada ponha lá**. Bônus imediato: `ViewerAutoRefresh` para de refrescar aba oculta (`document.visibilityState`) e coalesce rajadas — hoje a rota mais cara do sistema roda a cada 60 s numa aba esquecida, e cada escrita de qualquer usuário dispara `router.refresh()` em toda aba aberta.
- **`podeLer(p)` em `src/components/layout/permissoes.ts`** — o módulo só responde "pode escrever?". `return p !== null` é trivial hoje, nasce com consumidores reais (os pontos que hoje perguntam "existe operador?", **inclusive a paleta de comandos**) e é o ponto onde a revogação do piso vai encostar. Trava: nenhum componente deriva autorização de `filiais.length` ou `filiais[0]`.
- **Cabeçalho e trava em `use-filtros-tabela.ts`** — `filial` já é um `CampoFiltro` resolvido no CLIENTE, e ali está o precedente pronto para alguém acrescentar `empresa` e transformar recorte de tenant em `Array.filter` no navegador de quem não devia ter recebido as linhas. Escrever em prosa que o hook filtra o que **já chegou** — recorte de leitura voluntária, nunca de autorização — e `it('CampoFiltro não conhece a empresa')` lendo o arquivo como texto.
- **`public.pode_ler_arquivo_termo(name)`**, espelhando `pode_escrever_arquivo_termo`, mas com a regra de leitura de hoje (todo logado ativo). A policy de SELECT do bucket `termos` — hoje literalmente `bucket_id = 'termos'` e nada mais — passa a chamá-la. **Zero mudança de comportamento; cria o LUGAR onde o tenant entra sem mover um único objeto.** Sem `coalesce(…, true)`: esse fallback existe na policy de escrita por causa da janela upload→insert; numa policy de leitura seria o furo de volta.

**Não entra.** Mover objetos do bucket. Prefixo de tenant no caminho dos termos (é F67 — e a decisão registrada aqui é que a leitura será fechada **pelo join com `termos_gerados`**, não pelo caminho, justamente para não migrar arquivo com dado pessoal).

**Entregas.** `fronteira-viewer.test.ts` reescrito, `confinamento-viewer.test.ts` derivado, `queries/relatorios/comum.ts`, `realtime-refresh.tsx`, `viewer-auto-refresh.tsx`, `permissoes.ts` + teste, `use-filtros-tabela.test.ts`, migration `0129`, `supabase/tests/storage_termo.sql`.

**Pronto quando.** O tripwire reprova ao acrescentar query a tabela fora da allow-list; slug ambíguo lança em vez de 404; o canal só acorda com o que a tela mostra; o bucket `termos` continua legível exatamente para quem lia antes.

**Trava.** As seis listadas.

**Dependências.** F49.

**Risco.** Baixo, com ganho de custo imediato no Realtime.

**Reversão.** `git revert` + `alter policy` de volta.

---

### F51 — A decomposição da RPC de import

**Objetivo.** Transformar `importar_ativos_substituir` (394 linhas de corpo vivo na `0094`, 11 cópias integrais) numa orquestradora fina sobre 7 auxiliares nomeadas, **antes** que qualquer guarda nova ou que a virada acrescente `empresa_id` a cada insert e a cada delete dela.

**Por que ela vem ANTES das guardas.** Medido: as 11 cópias somam de 392 a 648 linhas cada; o corpo vivo na `0094` tem 430. Uma guarda de quatro linhas custa reemitir 430. Acrescentar guardas primeiro produz a cópia nº 12 — e depois a decomposição tem de reescrever essa cópia inteira de novo. É a inversão que o próprio diagnóstico da dívida X identifica como o erro central.

**Entra.**

- Extrair, a partir do mapa de blocos da `0094`: `import_validar_plano`, `import_revalidar_contagens`, `import_apagar_acervo_filial` (**a única função do sistema que conterá `delete from public.ativos`**), `import_criar_ativos`, `import_lancar_movimentacoes`, `import_contar_conflitos`, `import_gravar_trilha`.
- **A janela `estoque.dev_destrutivo` fica na função de TOPO**, não no auxiliar; o auxiliar só faz os DELETEs. Motivo: hoje existem exatamente duas portas para abrir essa janela (as RPCs da Zona destrutiva e a de import — é o que a `0080`/`0081` amarram), e criar uma terceira aumenta a superfície que `dev_destrutivo.sql` e `seguranca_catalogo.sql` precisam vigiar.
- `revoke all on function … from public, anon, authenticated, service_role` em **todas** as auxiliares. A palavra `authenticated` é a que muda o resultado: sem ela a superfície de RPC **cresce** em vez de encolher.
- A assinatura da orquestradora fica **byte a byte** igual — preserva `actions/importar.ts:423`, os grants e o cache do PostgREST, dispensando `notify pgrst`.
- Limpar o resíduo vivo: `0094:200` tem `if p_contagens is not null and jsonb_typeof(p_contagens) = 'object' then`, sempre verdadeiro desde que o `raise` de `:195` virou obrigatório (dívida N, hoje em 5 cópias).
- Extensão da mesma disciplina ao par `status_apos_movimentacao` × `rel_estoque_asof`: são espelhos, recriados sempre juntos, e a assimetria entre as duas listas de tipos **já foi bug**. Extrair `tipos_que_zeram_detentor()` mata a classe.
- Prova de equivalência: `import_substituir.sql` roda antes e depois, com uma seção 0 nova exercitando cada auxiliar isoladamente; md5 normalizado do corpo antigo registrado na ata (método do `RUNBOOK-BANCO.md:653`); mutação nova no injetor por auxiliar.

**Não entra.** Nenhuma guarda nova, nenhuma mudança de comportamento, nenhuma mudança de assinatura. Refatoração pura, provada por roteiro.

**Entregas.** Migration `0130`, `supabase/tests/import_substituir.sql` estendido, mutações no injetor, `src/lib/import/import-uma-porta.test.ts`.

**Pronto quando.** O roteiro dá o mesmo resultado antes e depois, cenário a cenário; o md5 e a lista de seções batem; o smoke do import contra o ensaio com CSV 100% fictício produz o mesmo resultado.

**Trava.** `delete from public.ativos` só pode aparecer no corpo de **uma** função, e a orquestradora referencia os sete auxiliares nomeados e não contém a string. Transforma "a função destrutiva é uma só" de intenção em invariante conferida a cada `npm run test`. (Asserção sobre estrutura, não sobre contagem de bytes — comentário novo derrubaria um teto de `length(pg_get_functiondef(...))`.)

**Dependências.** F46 (`db:test` local — iterar numa RPC de 394 linhas a um push por vez é inviável), F47 (injetor), F48 (o `catalogo_secdef` acusa as auxiliares como classificadas).

**Risco.** O maior risco técnico da preparação: reescrita de 394 linhas de SQL na função que apaga acervo. **Mitigação:** roteiro antes/depois no Postgres real do CI; uma mutação por auxiliar; ensaio contra o projeto de ensaio antes do apply em produção (a regra do runbook que já foi quebrada uma vez, na F36).

**Reversão.** `create or replace` da definição monolítica da `0094`, que está no git. Não toca dado.

---

### F52 — As guardas de escopo no-op

**Objetivo.** Pôr, dentro do Postgres, as guardas de pertencimento que hoje não existem e que na virada seriam a única coisa entre um admin e o dado do vizinho — todas escritas de forma que **não mudam nada com uma empresa**.

**Entra (uma migration de prólogo).**

1. **`exigir_gestao_de` ganha escopo.** As CINCO RPCs de gestão de conta (`definir_papel_usuario`, `definir_status_usuario`, `definir_vinculos_usuario`, `apagar_usuario`, `encerrar_sessoes_usuario`, da `0074`) decidem por cargo de quem chama e por propriedades do alvo — **nunca por pertencimento**. Todas passam por essa função: `if not public.mesmo_escopo_de_gestao(p_alvo) then raise exception 'Este usuário não pertence à sua organização.' using errcode = '42501'; end if;`, com `mesmo_escopo_de_gestao` devolvendo `true` hoje. **Uma condição protege as cinco.** É o item de melhor retorno de todo o dossiê: sem ele, um admin de qualquer empresa rebaixa, desativa, revincula e expulsa contas de qualquer outra, e a trilha registra o ato sem impedi-lo.
2. **`existe_outro_admin_ativo` ganha o parâmetro de escopo** (hoje ignorado). A trava "o sistema nunca fica sem administrador" hoje conta administradores **globalmente**. Decidir e escrever no roteiro **como a conta de plataforma entra nessa conta** — a recomendação é excluí-la do denominador; se ela ficar com escopo nulo, a comparação vira NULL e a RPC passa a recusar tudo, trocando um defeito silencioso por um travamento barulhento.
3. **`importar_ativos_substituir` ganha `pode_escrever_filial(v_filial)`**, logo após resolver a filial e **antes** do advisory lock. É a única das RPCs destrutivas que ficou de fora da varredura da `0064`, recebe a filial do payload e faz `delete from public.ativos where filial_id = v_filial` **sem teto** dentro da janela que desarma a `guarda_acervo`.
4. **`exigir_ativos_da_empresa(uuid[])`** extraída como função reusável e chamada por `apagar_ativos_conflito_filiais` — **depois** do `pg_advisory_xact_lock` e do lock em dois tempos da `0098` (a ordem dos locks ali já foi ajustada duas vezes por deadlock; ler `0098`/`0100` antes de mexer). Extrair em vez de inline porque a RPC é recriada em cadeia e a guarda inline se perde na próxima recriação.
5. **Backup do import conferido de verdade.** Hoje a guarda é `btrim(p_backup_path) <> ''` — um ritual de string, e o próprio `0083:141-156` escreveu isso por extenso e nunca voltou. `prefixo_backup_import(p_filial)` devolvendo `'import/filial-' || p_filial || '/'` (molde exato de `prefixo_backup_reset` e `prefixo_backup_conflito`); `importar.ts:395` passa a gravar por **id**, não por slug (que colide quando o slug deixar de ser único global, e com `upsert:false` faz o segundo import falhar por causa do primeiro); a RPC confere prefixo **e** existência do objeto em `storage.objects`.
6. **Confirmação digitada dentro da RPC.** Das três destrutivas, o import é a única cuja confirmação para na Server Action — e o comentário de `importar-wizard.tsx:272-278` diz isso com todas as letras. `p_confirmacao text default null` (com default: mantém `create or replace` puro e sobrevive a deploy fora de ordem), conferida contra uma função gêmea da TS, com teste de que as duas produzem a mesma string (a lição que a `0100` aprendeu à força com o digest).
7. **Idempotência por `arquivo_hash`.** A coluna existe desde a `0031` com o comentário "idempotência" e **nunca foi lida**. Dois applies do mesmo arquivo passam hoje — e o segundo apaga tudo que o primeiro criou, com uuids novos e os termos destruídos. Bloqueio de 24 h por filial com mensagem própria, não permanente (reimport legítimo após correção precisa passar).
8. **Comentários que mentem, corrigidos:** `comment on column eventos_admin.detalhe` descreve só metadado, e desde a F23 a coluna guarda **backups jsonb do acervo apagado** — quem reescrever as policies na virada vai classificá-la como metadado de baixo risco. E `importar.ts:35-36` diz "o conteúdo do CSV nunca é persistido", enquanto `import_logs.correcoes` guarda valores CRUS de célula desde a `0033`.
9. **Régua no `RUNBOOK-BANCO.md`:** toda `security definer` que receba id do cliente confere escopo ANTES de qualquer efeito — com o filtro incluindo parâmetro `text` (`p_backup_path`, `pode_escrever_arquivo_termo(p_nome text)`), não só `uuid`/`smallint`.

**Não entra.** `force row level security`. Nenhum `empresa_id`.

**Entregas.** Migration `0131`, `supabase/tests/import_fora_da_unidade.sql`, `cargo_dev.sql` estendido, `import_substituir.sql` (+5 casos), `src/lib/actions/erros.ts` (a mensagem de "backup informado não existe" diz "deste reset" e sairia mentindo no import), `src/lib/validators/importar.ts` (a gêmea TS da confirmação).

**Pronto quando.** Todos os roteiros verdes; comportamento com a WAP **idêntico**; o injetor derruba cada guarda nova quando removida.

**Trava.** `supabase/tests/definer_sem_tenant.sql` — enumera `pg_proc where prosecdef` e falha para função cujo corpo não cite a guarda de escopo, **por função NOMEADA e não pelo prefixo `exigir_`**: as cinco RPCs de gestão citam `exigir_gestao_de` e passariam verdes por um critério de prefixo. Exceções nomeadas para funções-gatilho (`aplicar_movimentacao`, `handle_new_user`, `colaborador_chave`) e para as 7 `rel_*`, que são `security invoker` e herdam a RLS do chamador — atenuante real: a superfície é menor que 37, e acertar as policies conserta as `rel_*` de graça.

**Dependências.** F51, F48.

**Risco.** Uma guarda no-op deixar de ser no-op e barrar operação legítima. Falha barulhenta (42501 em pt-BR), não silenciosa. **Mitigação:** ensaio primeiro, e cada guarda tem o par "recusa o alheio / **aceita o legítimo**" no roteiro.

**Reversão.** `create or replace` reemitindo o corpo anterior. O script de Storage é precedido de listagem e conferência de contagens.


---

## Bloco C — Os defeitos que já mordem

---

### F53 — A ordem exata das movimentações

**Objetivo.** Substituir o desempate por uuid aleatório — que já custou duas correções em produção — por uma sequência, **sem mudar um único número histórico**.

**Entra.**

- `alter table public.movimentacoes add column ordem bigint;`
- Backfill **deliberadamente compatível byte a byte com o desempate atual**: `row_number() over (order by data, created_at, (tipo = 'ajuste'), id)`. Como `rel_estoque_asof` hoje ordena `data desc, created_at desc, (tipo='ajuste') desc, id desc`, `ordem desc` reproduz exatamente a ordem de hoje. **Consequência: nenhum relatório histórico muda de número.** O que muda é o futuro — movimentações novas têm ordem exata de inserção, e o empate deixa de existir.
- **O UPDATE esbarra em `guarda_acervo`** (`0081`, `before insert or update or delete` em `movimentacoes`, `for each row`, que recusa **até para o service role**). O caminho doutrinariamente correto é abrir `set local estoque.dev_destrutivo = 'on'` **dentro da própria migration** — o mecanismo existe exatamente para isso, e o `set local` aborta com a transação. Backup do par `(id, data, created_at, tipo)` antes; `count(*)` e `count(ordem)` idênticos depois, na ata.
- `set not null`, `generated always as identity` com `setval` para `max+1`, `create unique index movimentacoes_ordem_uidx`.
- **Migration separada, mesma fase:** `rel_estoque_asof`, `status_apos_movimentacao` e `estornar_movimentacao_com_itens` passam a desempatar por `ordem desc`.
- Contexto obrigatório na ata: a premissa que protegia o sistema ("cada movimentação é uma transação") **deixou de valer** — `0117`, `0121`, `0122` e `0123` gravam mais de uma movimentação por transação, e `now()` é o instante de início da transação. O sistema já pagou duas vezes: `0054` ("resolvia errado em ~metade dos 1.002 ativos afetados") e `0087` ("defeito REAL da `0082` que atinge em cheio o acervo de produção", resolvido por **recusar** o empate em vez de ordená-lo).

**Não entra.** Paginação keyset (é F60 — esta fase entrega o cursor, não o uso). `(empresa_id, ordem)` (é F65).

**Entregas.** Migrations `0132` (coluna + backfill) e `0133` (o desempate), `supabase/tests/asof_desempate.sql`, ata com as contagens.

**Pronto quando.** `asof_desempate.sql` verde; um script de conferência mostra `rel_estoque_asof` idêntica em 12 datas de amostra antes e depois; duas movimentações do mesmo lote da F38 recebem `ordem` distinta e ordenada.

**Trava.** O unique + o roteiro + a asserção de que `rel_estoque_asof` não contém mais `id desc` no desempate.

**Dependências.** F46, F47.

**Risco.** Operação destrutiva por definição (UPDATE em tabela imutável, com a janela aberta). **Mitigação:** o backfill é escolhido para ser **semanticamente neutro**, o que retira do risco a parte irrecuperável; a janela é `set local`; backup e contagens obrigatórios.

**Reversão.** `drop column ordem cascade` + recriar as três funções nas definições anteriores. Minutos.

---

### F54 — O backup deixa de mentir, e a restauração é ensaiada

**Objetivo.** Fazer o "backup obrigatório" cumprir a promessa que a tela faz, e provar a restauração **antes** de existir cliente.

**Entra.**

- **Os `.docx` entram no backup.** Hoje `importar.ts:454-467` e `dev-destrutivo.ts` fazem `.from('termos').remove(arquivos)` e nenhum dos dois backups carrega os binários — `exportarAcervoFilial` e `montarBackupDoReset` fazem `select('*')` das LINHAS. Restaurar devolve `termos_gerados` apontando para objetos que não existem mais, e a frase da action ("NADA foi apagado — reset sem backup é proibido") é falsa para essa classe. Correção: **antes** do `remove`, `.copy()` server-to-server para `<prefixo do backup>/termos/`; se a cópia falhar, **não remover** — órfão no bucket é infinitamente melhor que documento assinado perdido, e o sistema já convive com órfãos.
- Campo `nao_incluido: []` no cabeçalho do JSON. Um backup que documenta os próprios limites é a única defesa contra restaurar acreditando ter restaurado tudo.
- `exportarAcervoFilial` para de ler `termos_gerados` INTEIRA e filtrar em TypeScript — `.overlaps('ativo_ids', ids)` em lotes. É a única das quatro leituras do backup sem recorte.
- **`urlBackup` e `listarImportLogs` ganham recorte.** É a cadeia mais curta de download do dump alheio e ela é **pela aplicação**, não pelo bucket: a signed URL é emitida pelo servidor com a credencial do admin, e o Storage não tem como saber que aquele admin é de outra empresa. Arrumar policies de Storage **não** fecha isso.
- **`scripts/db/restaurar.mjs` e o ensaio executado uma vez de verdade**, contra banco descartável, com o roteiro escrito no repositório. Dois cuidados que o desenho ingênuo erra: (a) a ordem de inserção não é só a das FKs — `movimentacoes` tem trigger `aplicar_movimentacao` que **recalcula o estado**; escolher a estratégia no desenho (inserir `ativos` em estado inicial e deixar o trigger derivar, OU inserir tudo com o trigger desabilitado dentro da janela), não no passo 4; (b) a conferência que vale mais que a contagem de linhas: reexecutar `rel_estoque_asof` na data de `exportadoEm` e comparar com as `contagens` do cabeçalho. **O ensaio inclui um termo `.docx`** — senão ele prova o caso fácil.
- `descartarBackupNaoUsado` no ramo de erro do import (o gêmeo já existe em `conflitos.ts`) — **com o client de sessão, não com service role**: `importar.ts:32-34` proíbe service role naquele módulo, e a policy `e_admin()` do bucket basta. Mais evento `import_falhou` em `eventos_admin`.
- Checagem 12 em `dev_checagens_integridade()`: backup órfão em `backups-import` — comparando contra `import_logs.backup_path` UNION `eventos_admin.detalhe->>'backup_path'`, senão a checagem acusa como órfão todo backup de import que falhou legitimamente.

**Não entra.** Retenção/expurgo de `import_logs` e do bucket (decisão de produto com prazo — pendência declarada do piloto). **Empobrecer os valores de `correcoes`**: o arquivo original não é guardado, e `de`/`para` é a única prova que resta; o remédio é retenção, não redução.

**Entregas.** `src/lib/actions/{importar,dev-destrutivo}.ts`, `src/lib/queries/import-logs.ts`, `src/lib/queries/dev-destrutivo.ts`, `scripts/db/restaurar.mjs`, `docs/RUNBOOK-BANCO.md` (seção "restauração"), migration `0134`, `src/lib/actions/backup-completude.test.ts`, `backup-formato.test.ts`.

**Pronto quando.** O ensaio de restore rodou, com termo incluído, e o resultado está colado na ata; um reset no ENSAIO produz backup que **contém** os `.docx`.

**Trava.** `backup-completude.test.ts` — toda Server Action que chame `.from('<bucket>').remove(` tem de conter a cópia daquele conjunto de caminhos antes. Pega a CLASSE (apagar artefato de Storage sem cópia), e a classe vai crescer com todo bucket novo. Mais `backup-formato.test.ts`, que congela as chaves de topo e o `nao_incluido` e reprova quem acrescenta tabela ao backup sem bumpar a `versao`.

**Dependências.** F52 (o prefixo estruturado do backup do import).

**Risco.** A cópia aumenta o uso do bucket no Free. Medir (hoje 67 arquivos / 5,2 MB); se o custo for real, a alternativa honesta é **mudar a frase da UI** com ata — o que não pode continuar é a promessa atual.

**Reversão.** `git revert` (os backups já copiados ficam, inofensivos).

---

### F55 — Observabilidade, sonda e alarme de integridade

**Objetivo.** Fazer o sistema avisar quando quebra, em vez de esperar alguém abrir a tela.

**Entra.**

- **`src/lib/observabilidade.ts` — `registrarFalha({ escopo, erro, ctx })`**, `server-only`, saída estruturada, com **`empresa` como campo reservado desde já**. Migrar os 94 `console.error` (o prefixo `[x]` vira o `escopo`). Exceções nomeadas: `src/app/error.tsx` e `global-error.tsx` são Client Components e não podem importar `server-only`. O funil tolera "sem usuário" como estado normal — 22 dos 94 estão em `lib/queries`, chamados também pelo visualizador, onde `idOperador()` é null, e `empresa` será igual.
- **`src/instrumentation.ts` com o hook `onRequestError`** do Next: erro estruturado (rota, digest, método; **nunca** dado pessoal nem segredo), visível nos logs da Vercel. Custo zero, sem dependência.
- **`/api/saude`**: `select 1` pela anon key, versão e commit. **Não** devolve estado de migração (informação de schema em rota pública). Atenção: o `matcher` de `src/proxy.ts:11-15` exclui só assets e **interceptaria** a rota.
- **`public.checagens_integridade_resumo()`**: `security definer`, `stable`, SQL fixo chamando `dev_checagens_integridade()` por dentro, devolvendo só `(chave, quantidade)` — zero linha de dado, segura para log e smoke. Guarda `e_admin()` (não `e_dev()`), para a conta do smoke alcançar. Hoje o único detector de corrupção de dado do sistema é um humano abrindo `/dev` — e a décima checagem nasceu **depois** do defeito que ela deveria ter detectado (`0111`).
- **`.github/workflows/saude.yml`**: Parte A do smoke a cada 6 h (sem sessão, sem segredo); Parte B uma vez por dia. Falha quando qualquer checagem hoje-zero passa de zero. Matar `--exigir-f12` e os três `preF12` — um flag que transforma falha em `n/a` para uma migration em produção desde julho é falso-verde puro. Os secrets `SMOKE_EMAIL`/`SMOKE_SENHA` são decisão de segurança: ata, conta dedicada de cargo mínimo, rotação registrada.
- **`supabase/tests/integridade_alarme.sql`**: planta cada estado impossível e afirma que a checagem correspondente o enxerga. Hoje as onze checagens são SQL sem roteiro que prove que elas veem o que dizem ver — o job `banco` prova que aplicam, não que funcionam.
- **`.env.local` aponta para o ENSAIO, não para produção** — uma linha, e é o item mais urgente e mais barato do dossiê inteiro. A lista `REFS_DE_PRODUCAO` de `scripts/env-guard.ts` **inverte** de negação para permissão (`REFS_DE_ENSAIO`): ref inventado passa a ser recusado. O consumidor lê o rótulo por RPC só-leitura, não por `select` direto — a `0090` faz `revoke all on public.ambiente from … service_role`.
- **`SUPABASE_ACCESS_TOKEN` sai do `.env.local`** (é credencial de ferramenta; o app nunca o lê), vira export de shell, ganha escopo reduzido, inventário e rotação registrada. Mais `.env.example` atualizado (regra 4) e `scripts/env-exemplo.test.ts`.

**Não entra.** Sentry ou qualquer agregador (dependência + custo). Dashboard. Alerta por taxa de erro — num sistema de nove usuários nunca dispara; o que falta é sonda sintética, não painel.

**Entregas.** `src/lib/observabilidade.ts`, `src/instrumentation.ts`, `src/app/api/saude/route.ts`, `.github/workflows/saude.yml`, migration `0135`, `scripts/env-guard.ts`, `.env.example`, `scripts/smoke/cobertura.test.ts`.

**Pronto quando.** Um erro provocado aparece estruturado no log da Vercel com rota e escopo e **sem** nenhum dado pessoal; o workflow agendado rodou e falhou ao plantar uma inconsistência; `db:reset` contra ref inventado é recusado.

**Trava.** Nenhum campo de `ctx` cujo nome case `/senha|token|key|hash|cpf/i` chega à saída; nenhum `console.error` em `lib/actions/**` e `lib/queries/**` fora do funil; `} catch {` proibido dentro de funções exportadas de módulos `'use server'`; `cobertura.test.ts` (toda chave de `dev-integridade.ts` aparece no smoke).

**Dependências.** F45.

**Risco.** Secrets do smoke no GitHub. Mitigação: conta dedicada, cargo mínimo, ata, rotação.

**Reversão.** `git revert`; a função nova fica inofensiva.

---

### F56 — O import sem WAP-ismo e sem bomba

**Objetivo.** Tirar o vocabulário da WAP do TIPO e do CÓDIGO, e consertar três defeitos do motor que hoje transformam erro de cadastro em arquivo recusado sem diagnóstico.

**Entra.**

- **Correção imediata, primeiro commit:** `src/lib/import/tipos.ts:71-76` define `FilialOficial` como união literal dos cinco nomes; `plano.ts:342` faz `filialPorSlug(filial.slug) ?? mapearUnidade(filial.nome)`; e `plano.ts:112-117` transforma `filialAlvo === null` em bloqueante em **toda** linha. A tela `/admin/filiais` deixa criar uma sexta filial com slug livre, sem aviso. **Uma sexta filial da WAP hoje já torna o import dela impossível**, com mensagem que culpa o ARQUIVO. Correção: bloqueante distinto `filial_fora_do_vocabulario` com mensagem verdadeira, mais aviso na tela de cadastro.
- `FilialOficial` vira `string` (o nome canônico da unidade); o conjunto válido vem do CADASTRO. `mapearUnidade(raw, deparaDaUnidade)` recebe o dicionário **por parâmetro**, no padrão da F39 (`rotuloTipoItem(slug, mapa)`), com o mapa descendo por prop a partir de um Server Component. `unidades_apelidos (filial_id, apelido)` — migration aditiva; as 18 chaves de `UNIDADES` viram seed da WAP. **`filialPorSlug` some**: o alvo é a unidade já selecionada na tela; o motor precisa reconhecer os APELIDOS da coluna Site, não a filial. Essa simplificação sozinha remove metade do acoplamento.
- Vocabulários de categoria e estado (`CATEGORIAS`, `ESTADOS` com `'rt wap'`/`'posse wap'`) pelo mesmo caminho.
- **Enums derivados do banco:** `import/tipos.ts` redeclara `StatusAtivo` e `CategoriaAtivo` à mão, e `deparas.ts:317` tem um `Exclude<StatusAtivo,'devolvido_fornecedor'>` que é **no-op** porque a união local nunca conteve o valor — alguém escreveu uma restrição acreditando que ela trabalhava. Trocar por `Enums<'status_ativo'>` e `Exclude<Enums<'categoria_ativo'>,'outro'>`, como `dominio.ts:7` já faz.
- **A regex de patrimônio numa fonte só:** 4 cópias em TS (inclusive `import/deparas.ts:166`, com semântica **divergente** — `\d{1,7}` com lookahead) + 16 ocorrências em 12 migrations. `PATRIMONIO_CANONICAL_RE` deriva de `PARTES_RE`; a quarta cópia é derivada com a quantificação explícita ao lado ou documentada como divergência deliberada.
- `PREFIXOS_PATRIMONIO` (`deparas.ts:152`) × `PREFIXOS_CONHECIDOS` (`scripts/import/normalizar.ts:91`): mesmos 7 valores, zero trava. Quinze minutos.
- **Tetos que conversam.** Três números independentes: 5 MB de arquivo, `MAX_LINHAS_PLANILHA = 20.000` (aplicado só no leitor `.xlsx`; **nunca no CSV** — `parse.ts:50-68` não tem teto de linha nem de coluna) e `bodySizeLimit: '8mb'`. O plano de 20.000 ativos sozinho já passa dos 8 MB, e o 413 acontece **antes** da action — sem log, sem `import_logs`, sem `eventos_admin`, com o backup possivelmente já no bucket. `conferirTetos(csv)` na **primeira linha** de `analisar()`, cobrindo linhas e colunas nos dois formatos; `MAX_LINHAS_PLANILHA` **derivado** do orçamento de body com medição registrada.
- **`FieldMismatch` deixa de ser descartado.** Uma linha com um `;` a mais importa valores nas colunas erradas com preview VERDE — e a operação seguinte apaga o acervo e recria a partir disso. Comparar `celulas.length` com `header.length` e emitir `linha_desalinhada`.
- `.max()` no `planoImportSchema` — hoje sem teto nenhum em array e em campo de texto, enquanto o schema das **correções** tem `MAX_CORRECOES`, `MAX_PARA`, `MAX_CRU`: o payload de auditoria é mais rigoroso que o payload que apaga o acervo.

**Não entra.** Onboarding (criar empresa/filial/colaborador/item pelo import) — é virada. O fallback por substring de `scripts/import/normalizar.ts:522-527` **não** é transplantado (heurística de planilha específica). `scripts/import/` não é generalizado — morre com o go-live.

**Entregas.** Migration `0136` (`unidades_apelidos` + seed), `src/lib/import/{tipos,deparas,plano,parse,limites,correcoes,index}.ts`, `src/lib/patrimonio.ts`, `src/app/(app)/admin/filiais/*`, `src/lib/import/limites.test.ts`, `deparas.test.ts`, `prefixos.test.ts`, `enums-sql.test.ts`, `patrimonio-sql.test.ts`, `sem-wapismo.test.ts`.

**Pronto quando.** O smoke do import passa contra uma unidade chamada `sede` com planilha 100% fictícia — **é a única prova que conta**; uma `FilialSelecionada` com slug inventado produz `filial_fora_do_vocabulario`; um CSV desalinhado é recusado; `limites.test.ts` reprova ao mudar um dos três números.

**Trava.** `sem-wapismo.test.ts` (nenhum literal dos cinco nomes em `src/**` fora de testes, ajuda e placeholders) — escrito **vermelho** antes, como definição de pronto. Mais `limites.test.ts`, `prefixos.test.ts`, `enums-sql.test.ts` (com um caso que falhe em `Exclude<…>` com valor fora da união), `patrimonio-sql.test.ts`.

> **Nota sobre a *allowlist* de `lib/ajuda/conteudo/**` no `sem-wapismo.test.ts`.** Medido: `src/lib/ajuda/conteudo/` tem **39 arquivos / 9.053 linhas — mas 4 deles são `.test.ts`**, então o conteúdo real são **35 arquivos / 5.914 linhas** e os testes, 3.139. Nele há 371 ocorrências de "filial" (519 contando "filiais"), 38 de "WAP" e 9 nomes de filial real. Em `src/lib/ajuda/` inteiro (54 arquivos, 11.413 linhas) são 549. As **424 asserções `toContain` de frase literal** estão espalhadas por dois níveis: 289 nos testes dentro de `conteudo/` e 135 nos da raiz. Isolar a ajuda da varredura é decisão consciente desta fase, não esquecimento — e a pergunta "o que acontece com a ajuda no primeiro cliente" está no §10, em aberto.

**Dependências.** F51, F52.

**Risco.** O import da WAP regride no De→Para. Mitigação: o seed é exatamente as 18 chaves de hoje; teste provando que os apelidos históricos continuam mapeando; smoke com CSV fictício antes do deploy.

**Reversão.** `drop table unidades_apelidos` + `git revert`.


---

## Bloco D — Forma

---

### F57 — Os quatro significados de filial, e o fim do fail-open

**Objetivo.** Dar nome distinto a cada significado hoje fundido, criar o lugar onde o recorte de leitura vai morar, e **tornar irrepresentável** o estado "sem recorte".

**Os quatro:**

| Hoje | Significado | Nome novo | Onde mora |
|---|---|---|---|
| `filiaisDeEscrita`, `Operador.filiaisEscrita`, `podeEscreverNaFilial` | Escopo de escrita (autorização) | `escopoDeEscrita`, `Operador.escopoEscrita`, `podeEscreverNoEscopo` | `src/lib/auth/papeis.ts` |
| — (não existe) | **Recorte de leitura** | `RecorteDeLeitura`, `recorteDe(operador)` | `src/lib/auth/recorte-leitura.ts` (novo) |
| `resolverFiliaisIds`/`…Slugs`, `filtroFilialPadrao` | Filtro de exibição (o que o usuário escolheu) | `SelecaoDeUnidades`, `unidadesMarcadasPorPadrao` | `src/lib/filtros/filial.ts` |
| `chave_identidade_ativo`, par patrimônio+service tag | Chave de identidade | `chaveDeIdentidade(unidadeId, patrimonio, serviceTag)` | `src/lib/ativos/identidade.ts` (novo) |

**Entra.**

- **Matar a convenção `[] = sem recorte`.** `resolverFiliaisIds` devolve `SelecaoDeUnidades = { modo: 'todas' } | { modo: 'lista'; ids: readonly number[] }` — que o módulo **já usa internamente** (`selecaoFilialIds` devolve `{ modo }` e a função só o achata na saída). É desfazer um achatamento.
- **A interseção obrigatória com tipo nominal.** `UnidadesEfetivas` é um *branded type* que **só** `efetivar(recorte, selecao)` produz. Toda query recebe `UnidadesEfetivas`, nunca `number[]`. Hoje `efetivar` é a identidade (o recorte é universal); na virada ela ganha `empresa_id` e **nenhum call-site precisa ser encontrado à mão**.
- **O valor para "linha que não pertence a unidade nenhuma"** — `resolverFiliaisSlugsSemPadrao` existe por decisão explícita da F25 §4.7: o histórico de gerados tem snapshots CONSOLIDADOS com `filial_id is null`, que sumiriam sob recorte. O tipo precisa representá-lo, senão a refatoração quebra `/relatorios/gerados` em silêncio — o defeito que ela existe para evitar.
- **Estender às escritas:** os ~39 call-sites de `src/lib/actions/**`, não só os ~70 de `queries/`. É o lado em que o fail-open custa exclusão, não leitura.
- **`compras.ts` corrigido:** aplica a regra de identidade GLOBAL (`chavePatrimonio` + `.in('patrimonio', …)` **sem cláusula de filial**) enquanto o índice do banco é por filial desde a `0091`. Um classificador por identificador não o pegaria, porque ali a identidade aparece como QUERY, não como nome.
- **`chaveVersao` ganha trava TS↔SQL.** `queries/gerados.ts:55` é um **espelho em TypeScript da chave única do snapshot** (`periodo_de|periodo_ate|filial_id`), sem trava — a mesma classe de `colaborador_chave`/`chave-sql.test.ts`, que este projeto já travou seis vezes. Ela alimenta a badge "superada" por uma consulta em `:172` **sem recorte nenhum**, com `catch` que degrada para Map vazio. Na virada, consolidado de A e de B produzem a chave idêntica `periodo|periodo|null`. A trava nasce agora; o `empresa_id` entra na F65, junto com o índice.
- Unificar as constantes homônimas de slug (`SLUGS_RESERVADOS` privado em `validators/admin.ts:286`, `'geral'`/`'todas'` em `queries/gerados.ts:61` e `papeis.ts:204`, e o homônimo sem relação em `ajuda/registry.ts:133`) em `src/lib/unidades/slugs.ts`. Trava estreita: os literais não aparecem em `src/lib/**` fora desse módulo (não em `src/**` — `components/` tem textos legítimos).
- Generalizar a validação de pertinência de `/itens/conferencia` para **as 8 rotas** que leem `sp.filial`/`params.filial`, num helper único. Transforma "id alheio → tela vazia ambígua" em recusa explícita: observabilidade de isolamento de graça.
- **`docs/INVENTARIO-LEITURAS.md`** — os ~109 call-sites de `.from('ativos'|'movimentacoes'|'lancamentos_item'|'pendencias_item'|'colaboradores')` listados e classificados arquivo a arquivo: precisa de `empresa_id` explícito, ou confia na RLS. **Esta lista é o orçamento verdadeiro das fases F63–F67** e é a entrega mais valiosa da fase.

**Não entra.** Renomear a tabela `filiais` (ver §7). Mudança de rota. `empresa_id`.

**Entregas.** `src/lib/auth/recorte-leitura.ts`, `src/lib/unidades/slugs.ts`, `src/lib/ativos/identidade.ts`, `filtros/filial.ts` reescrito, `auth/papeis.ts` renomeado, ~109 call-sites migrados, `src/lib/filtros/recorte.test.ts`, `src/lib/unidades/rotas.test.ts`, `src/lib/relatorios/chave-versao-sql.test.ts`, `docs/INVENTARIO-LEITURAS.md`.

**Pronto quando.** `npx tsc --noEmit` e `npm run build` limpos; o smoke passa idêntico; nenhuma tela mudou; a lista dos 109 existe e está classificada; `?filial=<id de outra filial>` responde recusa explícita nas 8 rotas.

**Trava.** O tipo nominal `UnidadesEfetivas` — **o compilador é a trava, não um grep**. Mais `recorte.test.ts` (prova que o tipo não consegue representar lista vazia como "tudo"), `rotas.test.ts` (assert `>= 8`) e a trava da `chaveVersao`.

**Dependências.** F49, F50.

**Risco.** Refatoração larga (~109 arquivos) que pode mudar comportamento em silêncio nos três casos-limite documentados: consolidado com `filial_id is null`; slug de filial desativada preservado de propósito; operador sem vínculo que hoje cai em "todas" com o ⚠ explicando. **Mitigação:** escrever a tabela de casos (cargo × vínculos × parâmetro) **antes** do refactor, ver os três passarem no código atual, e só então mexer. Migrar em lotes por superfície, com o smoke entre eles.

**Reversão.** `git revert` — grande, por isso os lotes.

---

### F58 — A fronteira tipada do banco

**Objetivo.** Fazer o TypeScript voltar a conferir o que sai do Supabase, para que uma coluna ausente (`empresa_id`, amanhã) seja erro de compilação e não `undefined` silencioso.

**Entra.**

- **`src/lib/supabase/rpc.ts` — a porta única.** `chamarRpc(client, nome, args)` tipada por `Database['public']['Functions']`, admitindo `| null` onde o gerador mente, e **devolvendo o BUILDER** (não o `Promise` resolvido) — as 8 chamadas `rel_*` usam `Promise.all` sobre builders e `.single()`/`.maybeSingle()` precisam sobreviver. `filialParaRpc` (`rpc-filial.ts:33`, o cast documentado em 26 linhas) **some**, porque o *mapped type* admite `| null`; os 15 `as unknown as Json` somem junto.
- **`src/lib/supabase/linhas.ts`** com `linhasDe`/`linhaDe` conferindo a forma por Zod (já é dependência). Escopo: **todos os ~50 pontos**, não só os 22 `as unknown as` — os ~28 casts simples (`(data ?? []) as ItemCatalogo[]`, `r.dados as AnySnapshot`) apagam o tipo exatamente igual.
  - **Ordem dos lotes, corrigida:** *lote 1* é `queries/tipos-item.ts` (a superfície real do viewer) e `queries/relatorios/**`; *lote 2* é o resto; **`gerados.ts` fica por último e nunca usa `.strict()`** — é o único ponto do sistema onde uma forma **antiga** precisa passar (`AnySnapshot = SnapshotRelatorio | SnapshotRelatorioV2`, `tipos.ts:309`), e começar por ele é escolher o pior caso primeiro.
- Desempenho: `.passthrough()` nas leituras de lote (export, backup, histórico paginado), `.strict()` só nas pequenas; harness mede antes/depois.
- **`erros.ts` com lista enumerável.** Ele traduz por substring — 63 ramos sobre ~110 substrings, das quais 8 são nomes de constraint e ~100 são o TEXTO LIVRE dos `raise exception`. `CONSTRAINTS_TRADUZIDAS` + `MSG_SQL` nomeadas, com teste que confere existência nas migrations, **case-insensitive** (o `erros.ts:20` faz `toLowerCase()` e o SQL escreve com maiúscula; sem isso o teste nasce com 35 falsos negativos). A virada reescreve RPCs — e reescrever RPC é a hora clássica de reescrever a mensagem, sem nome de objeto para uma trava casar. Incluir `versao-snapshot.ts:43`, que casa a violação **pelo nome do índice** `relatorios_gerados_periodo_filial_versao_uidx` — recriá-lo com nome novo na F65 mata a segunda pista do laço de renumeração da F29.

**Não entra.** Mudar o gerador. Trocar enum por `text + CHECK` (o argumento é bom — `alter type … add value` não pode ser usado na mesma transação que o cria, e o projeto pagou isso três vezes: 0044/0045, 0046/0047, 0108/0109 —, mas os enums estão em produção com 126 migrations de história, views e funções dependentes; registre a lição no runbook e não faça a conversão). Tocar em `database.ts` à mão.

**Entregas.** `src/lib/supabase/{rpc,linhas}.ts`, 37 chamadas de RPC migradas, ~50 leituras migradas, `rpc-unica-porta.test.ts`, `sem-cast-de-leitura.test.ts`, `erros.ts` + teste.

**Pronto quando.** Zero `.rpc(` fora da porta; zero cast de leitura em `queries/`+`actions/` fora da allow-list justificada; `tsc --noEmit` limpo; TTFB medido não regride mais que 10 %.

**Trava.** `rpc-unica-porta.test.ts` é de **arquitetura**, não de grafia: não há como escrever a chamada de outro jeito (varre também `scripts/`, ou declara por que os isenta). `sem-cast-de-leitura.test.ts` reprova por **forma** — `as <Identificador>` ou `as unknown as` aplicado a `data`/`(data ?? [])` —, não por texto: uma busca por `as unknown as` deixaria de fora os 28 casts simples.

**Dependências.** F57 (as assinaturas mudam lá; o retorno muda aqui — a ordem inversa escreve as duas vezes), F47.

**Risco.** Zod por linha vira regressão em leitura de lote. Mitigação: `.passthrough()` e o critério de pronto acima.

**Reversão.** `git revert`.

---

### F59 — A doutrina do predicado, escrita e travada

**Objetivo.** Escrever a régua do predicado de recorte **antes** da primeira policy de tenant, e torná-la impossível de violar — sem reescrever policy de produção para "praticar".

**A correção de rota que esta fase carrega.** A leitura ingênua diz "ensaiar reescrevendo as 12 policies de escrita com `filial_id`, para errar barato". O ensaio, porém, **não está na reescrita: está na trava**. A `0107` já mediu o ganho do padrão içado em −45% (`cost=164.50 → 89.76`) numa policy de **escrita**, que toca poucas linhas, num sistema de nove usuários — isso é milissegundos. Reescrever 12 policies de autorização em produção para ganhar milissegundos e treinar é risco em produção por valor pedagógico. **Escreva a trava; não reescreva as policies.**

**Entra.**

- **A doutrina escrita.** `docs/MATRIZ-REGRAS.md`: predicado de recorte é sempre `col = any(array(select public.<fn>()))`, **nunca** `fn(col)`; a função de recorte não recebe parâmetro que venha da linha; parâmetro de recorte em RPC é obrigatório e não-anulável.
- **`src/lib/validators/policies-initplan.test.ts`** — reprova qualquer policy cujo predicado passe nome de coluna como argumento para uma função, **inclusive nas de SELECT** (hoje limpas; sem isso, a primeira policy de tenant escapa por não estar no escopo), com lista de exceções que carrega o MOTIVO por escrito ao lado de cada nome. Hoje a exceção legítima é `pode_escrever_filial(filial_id)`, que **depende da linha de propósito** e fica documentada como tal. **É a trava mais importante do plano inteiro**: é ela que, na F66, barra `e_membro(empresa_id)`.
- **A forma-alvo especificada, para o executor da F62/F66 não ter de inventar.** Com a decisão 6 (cargo por empresa), todo predicado que dependa de cargo vira **função sem parâmetro que devolve o CONJUNTO em que o chamador tem aquela capacidade**:
  - `empresas_do_membro() → uuid[]` — recorte de leitura;
  - `empresas_de_escrita() → uuid[]` — escopo de escrita no nível de empresa;
  - `empresas_de_admin() → uuid[]` — capacidade administrativa;
  - `unidades_de_escrita() → setof (empresa_id uuid, filial_id smallint)` — escopo de escrita no nível de unidade.
  Todas `language sql stable security definer set search_path`, e toda policy as consome içadas. Assim o cargo deixa de ser atributo global consultado por linha e vira conjunto avaliado uma vez por statement — **é essa forma que torna a decisão 6 barata em vez de catastrófica**.
- **`scripts/perf/medir-rls.mjs`**: mede as duas formas sobre os `ativos` de produção pelo método da `0107`. O número vai para a ata e é a linha de base contra a qual a F66 é comparada.
- **Correção dos documentos que hoje ensinam o padrão errado.** `docs/PLANO-PRODUTO-MULTIEMPRESA.md:71` propõe `e_membro(empresa_id)`. Corrigir **copiando** a forma já escrita em `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md:193-196` (reinventar o texto é como as duas versões divergem), com cabeçalho de status dizendo que a decisão de 09/2026 é **migração in-place aditiva sobre este repositório** e que as seções de schema valem como catálogo de requisitos, não plano de execução. `docs/README.md:60-64` atualizado (ainda diz "ainda não foi decidida").
- **`docs/ESPECIFICACAO.md` ganha o cabeçalho de escopo.** Ela é a autoridade nº 1 do `CLAUDE.md`, tem 478 linhas e **80 menções a "filial"** descrevendo um sistema mono-empresa. A partir da F62 todo executor que a abrir encontra a autoridade nº 1 contradizendo o que ele acabou de construir — e a regra manda resolver pela spec. O cabeçalho declara: *"esta spec descreve o sistema mono-empresa; as fases F62+ acrescentam a camada de empresa, e para essa camada a autoridade é o `PLANO-MULTIEMPRESA.md` até a spec ser emendada na F71"*.

**Não entra.** Reescrever as 12 policies de escrita. `empresa_id`. Mudar o que as policies autorizam.

**Entregas.** `src/lib/validators/policies-initplan.test.ts`, `scripts/perf/medir-rls.mjs`, `docs/MATRIZ-REGRAS.md`, `docs/PLANO-PRODUTO-MULTIEMPRESA.md`, `docs/ESPECIFICACAO.md`, `docs/README.md`.

**Pronto quando.** `policies-initplan.test.ts` passa verde contra as 54 policies vivas de hoje e **reprova** quando se acrescenta uma policy de teste com `fn(coluna)`; a medição está na ata; os quatro documentos não ensinam mais o padrão lento.

**Trava.** `policies-initplan.test.ts`.

**Dependências.** F48, F47.

**Risco.** Baixo — a fase não toca produção. O risco é o teste nascer com exceções demais e virar decorativo: cada exceção carrega motivo escrito, e a lista é catraca que só encolhe.

**Reversão.** `git revert`.

---

### F60 — O recorte que corta scan, e o custo do caminho quente

**Objetivo.** Fazer as RPCs de relatório recortarem **por dentro** em vez de filtrar na saída, e parar de pagar duas vezes por request o que já é caro.

**Entra (dois commits internos, nesta ordem).**

**Commit 1 — o custo, sem tocar em motor:**

- `cache()` em `contarConflitosAbertos` e `contarPendenciasAbertas` — hoje o dashboard as executa **duas vezes** no mesmo request (layout **e** página), e só três funções da casa são memoizadas. A chave do memo é o ARGUMENTO: verificar que o array de slugs é estável entre as duas chamadas, não supor.
- `getKpis` deixa de ler `ativos` INTEIRA (paginada, ~1.600 objetos materializados numa função serverless) para produzir 8 contadores na rota mais visitada: `count exact head` por status ou `group by categoria, status`. `kpisDeEstado` continua função pura e só muda de fonte.
- **A lista de `/ativos`:** decidir explicitamente o `count`. Ela paga `count: 'exact'` a cada render **e** busca com oito `ILIKE` de curinga à esquerda. Com predicado de tenant somado, é a combinação que transforma lista em incidente. Ou `estimated`, ou `planned`, ou teto com aviso — mas escrito, não herdado.
- **`cap` como terceiro parâmetro OBRIGATÓRIO de `paginarTodos`** — transforma a omissão em erro de TypeScript e dispensa teste. Junto, o laço interno vira **keyset** (todas as chamadas já ordenam por ordem total, o pré-requisito), usando `movimentacoes.ordem` da F53. Nas listas de tela o OFFSET pode ficar, com a decisão registrada.
- Teto explícito nas três tabelas do relatório, com aviso na tela (padrão de `filaDeConsolidacao`) — hoje `CAP_PAGINACAO = 100_000` **lança** em vez de truncar, e um dia isso é uma exceção na cara do gestor. Os KPIs continuam exatos (não vêm dessas linhas).
- `maxDuration` explícito nas rotas do grupo `(app)` que leem de `lib/queries` — hoje existe em **uma** rota só; e conferir/fixar `statement_timeout` para o papel que serve o visualizador, hoje o único caminho **sem** o teto de 8 s do `authenticated`.
- Índice parcial `lanc_item_criado_por_idx (criado_por, created_at desc) where estorna_id is null` — a única FK do levantamento da `0124` que ficou de fora por decisão de categoria e é consultada em todo render de `/itens`. Medir antes/depois e registrar o plano no cabeçalho (regra 4).
- **Consertar o harness** `scripts/perf/medir-itens.mjs`, que mede um `SELECT` **sem `WHERE` nenhum** — forma que o app nunca emite — e por isso produz conclusões falsas nas duas direções. (É por isso que `lanc_item_ordem_lista_idx` **não** entra: os 708 ms que o justificariam vêm dessa medição inválida, e `lanc_item_item_filial_idx` já serve a forma real.)

**Commit 2 — o motor:**

- **`p_filial smallint` → `p_filiais smallint[] NOT NULL`** nas RPCs `rel_*`. `(p_filial is null or col = p_filial)` é não-sargável e, pior, é **a forma que a próxima fase copia**. Duas migrations: criar com nome novo → migrar os 10 chamadores (a F58 deixou porta única) → dropar a velha. **Entre as duas, o app novo tem de estar no ar** — senão o app velho chama a função dropada e recebe 404 do PostgREST. `grant execute … to service_role` obrigatório (é por esse papel que o visualizador lê hoje). `db:types` no mesmo commit.
- **Não matar `estoqueForaDasColunas`:** o consolidado hoje soma lançamentos de QUALQUER filial, inclusive desativada, e a divergência com a soma das colunas é feature declarada (`itens/page.tsx:187-191`). A RPC nova precisa de **dois níveis** via `grouping sets` — `p_filiais` (as colunas) e "tudo do recorte de cima" —, não "a soma do array que eu passei". Sem essa emenda, o número vira sempre 0, a tela mente e o teste correspondente passa.
- `rel_estoque_asof` reescrita: hoje a CTE `efetivas` varre `movimentacoes` inteira com anti-join, o `distinct on (ativo_id)` obriga a ordenar tudo, e `p_filial` é aplicado no FIM sobre uma **coluna calculada**. Inversão por `join lateral` ancorado em `public.ativos a` — servido por `mov_ativo_idx (ativo_id, data desc)` **e** `movimentacoes_estorno_de_idx` (`0106:31`); dizer isso na migration, senão alguém mede sem o segundo e conclui que não ajudou. Preservar o predicado `existe` e a precedência do ajuste.
- `/itens` deixa de disparar `1 + N_filiais` varreduras do diário por render.
- `buscarEstornosAteData` ganha `.in('estorno_de', ids)` alimentado pelos ids já lidos no período. **Não** ganha filtro de filial: `estornar_movimentacao_com_itens` grava a filial ATUAL do ativo (`0122:205-219`), não a da movimentação estornada, e filtrar apagaria silenciosamente a marca "estornada" no relatório da filial de origem. Na virada o recorte é de **empresa**, que é seguro porque estorno nunca cruza empresa.
- **`v_colaboradores_textos` e `/admin/colaboradores` entram aqui.** A view varre `movimentacoes` e `lancamentos_item` inteiras com função por linha e `mode() within group`; `listarColaboradoresAdmin` embute duas contagens por pessoa sem paginação de tela. É `security_invoker`, então a RLS filtra linhas mas o `group by` continua rodando sobre tudo que passou — o mesmo mecanismo de `v_conflitos_filiais`, que a F67 trata. Materializar o recorte antes do agregado, ou paginar a tela.

**Não entra.** `lanc_item_ordem_lista_idx` (motivo acima). Trocar a busca de `/ativos` para prefixo — desfaz explicitamente a correção da F27/B5, que existe porque colar a service tag na busca devolvia vazio; ou se habilita `pg_trgm` (extensão nativa, R$ 0, mas exige aprovação registrada), ou não se mexe.

**Entregas.** Migrations `0137`–`0140`, `src/lib/queries/relatorios/*`, `src/lib/queries/itens.ts`, `src/lib/queries/colaboradores.ts`, `src/app/(app)/layout.tsx` e `page.tsx`, ~10 `page.tsx` com `maxDuration`, `scripts/perf/medir-itens.mjs`, `src/lib/validators/rpcs-recorte-sql.test.ts`, `docs/perf/asof-orcamento.json`.

**Pronto quando.** `asof_desempate.sql` verde; `explain analyze` antes/depois registrado; o consolidado de `/itens` continua divergindo da soma das colunas exatamente quando deve; `paginarTodos` não compila sem `cap`; TTFB melhora ou empata em todas as rotas medidas.

**Trava.** `rpcs-recorte-sql.test.ts` — regra **POSITIVA**: toda função `rel_*` declara o parâmetro de recorte, ele não é anulável, e o corpo o liga a uma coluna com `= any(` ou `=`. (Proibir a substring `is null or` é frágil: `or p_x is null` invertido e `coalesce(p_x, col) = col` passam.) O teste replica as migrations em ordem para achar o corpo VIVO, senão os corpos históricos (0016, 0019, 0022, 0045, 0047, 0054, 0109) reprovam para sempre e ele é desligado na primeira semana. Mais `cap` obrigatório pelo compilador e o orçamento de as-of versionado, que **falha quando o arquivo está ausente ou velho demais**.

**Dependências.** F53 (o cursor), F58 (a porta única).

**Risco.** É o motor dos relatórios. Mitigação: roteiro antes/depois; conferência de 12 datas de amostra contra produção; as duas migrations separadas, com o `drop function` só depois de o app novo estar no ar.

**Reversão.** `create or replace` da definição anterior. A única parte não reversível é a janela do `drop`, por isso ela é a segunda migration.

---

### F61 — Os pontos de injeção da UI  ⟵ **última fase de preparação**

**Objetivo.** Criar, sem refatorar nada grande, os lugares onde "a empresa" vai entrar na interface — e fechar as correções pequenas que a virada tornaria caras.

**Entra.**

- **`Marca` com par de contraste e sigla parametrizável.** Hoje `marca.tsx:21-28` tem `text-black` fixo no `cn()` e a string `WAP` literal na linha 27. Trocar por tokens pareados e `sigla?: string` (default `'WAP'`); `label`/`labelClassName` já existem. **Não** trocar os 18 `text-white` cegamente — só os 7 arquivos que estão sobre `bg-brand-dark`. `src/app/layout.tsx` (metadata "Estoque TI · WAP") no **mesmo commit** da trava, senão a suíte nasce vermelha.
- **Régua de layout destravada onde importa.** `consistencia.test.ts:130` faz `p.endsWith('/') ? arquivo.startsWith(p) : arquivo === p` — qualquer arquivo criado hoje em `src/components/admin/` ou `src/components/relatorios/` é isento **por construção, sem ninguém listá-lo**, e são justamente os diretórios onde a UI de tenant vai nascer e onde vive a superfície do visualizador. Escopo desta fase: **remover a isenção por prefixo desses dois diretórios**, converter os culpados que aparecerem, e pôr catraca `SOB_REGRA.length` que só cresce. Os outros prefixos ficam, nomeados, com o motivo escrito.
- **Verde de sucesso tokenizado.** `--selo-em-estoque`/`--selo-em-estoque-texto` **já existem** em `globals.css:174-175` e `:293-294` com os valores certos nos dois temas. São **12 sítios** (não 10 — faltam `relatorios/manutencao-casos.tsx:47` e `relatorios/medidor-minimo.tsx:22`). `<Badge variant="sucesso">` no molde de `warning`, que já é adição do projeto. **Decidir explicitamente** o destino de `medidor-minimo.tsx`: o verde ali significa FOLGA de medidor, não "em estoque" — mapeá-lo para `--selo-em-estoque` é escrever o token errado; ou token próprio, ou ata. `TETO_PALETA_CRUA` desce para o número medido.
- **`ConfirmacaoDigitada` ganha o primeiro consumidor:** a mesa de conflitos (`mesa-conflitos.tsx:539-551`) é a única confirmação MUDA do sistema — sem `aria-invalid`, sem `aria-describedby`, sem dica — e é o único lugar fora de `/dev` onde se apaga cadastro de ativo, com o texto esperado GERADO (`APAGAR <N>`) e não copiado da tela. O componente precisa de `mono` (a mesa usa `font-mono`) e `spellCheck={false}`.
- **`useDialogoSemeado`** — 3 de 5 diálogos de CRUD do admin usam `onOpenChange={setAberto}` direto com `useState` inicializado de prop, e o `tipo-item-dialog` já tem o `mudarAberto` correto **e o comentário explicando**. O diálogo de EMPRESA vai ser copiado de um dos cinco. Varredura em `src/components/**/*-dialog.tsx`, não só `admin/`.
- **`url-filtros` unificado** — 3 dos 5 filtros reimplementam a base da URL e perdem o fix do `useSearchParams()` atrasado. **Promover para `src/components/filtros/url.ts`, NÃO para `src/lib/`**: o módulo é `'use client'` e guarda estado de MÓDULO (`let pendente`), e o `CLAUDE.md` registra o que isso custou com `checklist-lote.ts`. Documentar que `pendente` é compartilhado.
- **`chaveDoEscopo` nas 7 chaves de storage** (as duas de `*-evento.ts` são CustomEvent, não storage). Prioridade nas **3 de `localStorage`** — `wap:compra:defaults` guarda uma FILIAL e atravessa abas, sessões e dias. Mesma função que a F50 usou para o nome do canal de realtime.
- **O crédito de autoria vira decisão, não default.** `credito-autor.tsx:19-20` tem `const AUTOR = 'vmatusita'` em três pontos: rodapé do login, pé da sidebar, rodapé de `/versoes`. Num sistema interno é escolha sua; num produto vendido a terceiros é decisão comercial. Esta fase o torna **parametrizável e desligável por empresa**; a escolha do que exibir fica no §9.

**Não entra.** Decomposição de `PassoMovimentacao` (29 props), `nova-compra-form` (32 `useState`), `importar-wizard`, `grupos-erros`. Migração para react-hook-form. Trocar o `<datalist>` por listbox própria. Cor por empresa. Tudo isso está no §8, como backlog PATCH.

**Entregas.** `marca.tsx`, `src/app/layout.tsx`, `badge.tsx`, 12 sítios do verde, `mesa-conflitos.tsx`, `use-dialogo-semeado.ts`, `src/components/filtros/url.ts`, `credito-autor.tsx`, `consistencia.test.ts`, `cores.test.ts`, 6 a 8 `.test.tsx` usando o rig da F45.

**Pronto quando.** `components/admin/` e `components/relatorios/` estão sob a régua com catraca; `TETO_PALETA_CRUA` baixou; a mesa de conflitos anuncia o erro de confirmação; nenhum pixel mudou onde não devia (fotos de `scripts/design/capturar.mjs` antes/depois).

**Trava.** Régua por arquivo nos dois diretórios + catraca; regra absoluta de tinta **com lista de exceções nomeada** (a derivação automática dos comentários do CSS faria a regra proibir `amber-100` no dia em que alguém declarar um selo âmbar, inclusive nos 302 usos legítimos de callout); `dicaConfirmacaoNaoConfere` só importável de `components/layout/`; `dialogo-semeado.test.ts`; `chaveDoEscopo` como única construtora de chave de storage.

**Dependências.** F45 (rig), F50 (`confinamento-viewer.test.ts` derivado — **obrigatório**, porque esta fase leva componentes de `layout/` para dentro das telas de relatório).

**Risco.** A régua revela mais arquivos que o esperado nos dois diretórios. Mitigação: rodar o teste sem os dois prefixos é a **primeira entrega**, e o resto da fase é orçado depois disso; se estourar, converte-se `admin/` e `relatorios/` fica para F61B.

**Reversão.** `git revert`; as fotos de design são a evidência.

---

# § 6 — A FRONTEIRA

> **Última fase de preparação: F61.**
> **Primeira fase da virada: F62.**

Ao fim da F61 o sistema continua mono-empresa, com o mesmo comportamento visível de hoje, mas: o CI reprova e o deploy não passa por cima dele; migration aplicada não pode ser editada e o CI de banco roda sem Docker; existe prova de que os roteiros SQL conseguem falhar; as quatro superfícies de segurança estão enumeradas por catálogo; as fronteiras de módulo têm nome, guarda e trava; a RPC de import cabe numa tela e tem guardas de escopo no-op; o desempate das movimentações é exato; o backup contém os `.docx` e a restauração foi ensaiada uma vez; existe funil de erro e sonda agendada; o import funciona para qualquer unidade; "filial" tem quatro nomes distintos e o estado "sem recorte" é irrepresentável no tipo; a fronteira do banco é tipada e tem porta única de RPC; a forma do predicado de RLS está escrita e travada por teste; e a UI tem os pontos de injeção prontos.

**Nenhuma linha de F45 a F61 é desperdício se o multiempresa nunca acontecer.**

De F62 em diante cada fase acrescenta estrutura que só o multiempresa usa. Todas continuam aditivas, reversíveis e com estado de repouso — mas custam sem render, se o produto parar.


---

# § 7 — PARTE II: A VIRADA (F62 → F73)

---

### F62 — A raiz do tenant e o cargo por empresa

**Objetivo.** Criar a hierarquia empresa → filial, mover o cargo de `profiles` para `membros`, e criar as funções de recorte — com tudo inerte: nada no app lê nada disso.

**Por que esta fase é a mais pesada da virada.** A decisão 6 (uma conta, vários vínculos) tem uma consequência que não pode ser adiada: **`profiles.papel` é hoje um cargo GLOBAL por pessoa** (`0061:63`, com o comentário dizendo que ele mora ali por decisão do ADR §4). Um consultor que seja admin no cliente A e consulta no cliente B **não é representável**, e migrar depois toca `papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()`, `pode_escrever_filial()`, as 5 RPCs de gestão de conta, `handle_new_user`, `operador_filiais` e as 54 policies. Fazer isso **na fase que cria `membros`**, com uma empresa só e nenhum cliente dentro, é a única janela barata que existe.

**Entra.**

- **`public.empresas`**: `slug` com CHECK de formato **e lista de reservados fechada** (`admin`, `api`, `app`, `auth`, `geral`, `login`, `plataforma`, `r`, `relatorios`, `todas`, `versoes`, `www`…), `razao_social` e `cnpj` separados do `nome` de exibição (o termo diz FRESNOMAQ, o sistema se chama WAP — são campos diferentes), `patrimonio_prefixo`/`patrimonio_digitos` (a máscara vira dado), `cor_acento` com CHECK hex, `config jsonb` com `check (jsonb_typeof(config) = 'object')` — sem ele `'"texto"'::jsonb` entra e quebra todo consumidor. Empresa WAP inserida.
- **`public.membros (id, empresa_id, profile_id, papel, ativo, created_at)`**, com `unique (empresa_id, profile_id)`. Backfill: uma linha por perfil existente, apontando para a WAP, **copiando `profiles.papel` e `profiles.ativo`**. Depois `profiles.papel` e `profiles.ativo` são marcados como **legado** por comentário e deixam de ser lidos — mas **não são derrubados nesta fase** (é a rede de reversão; caem numa entrega PATCH depois de três semanas verdes).
- **`operador_filiais` ganha `(empresa_id, membro_id)`** ao lado de `usuario_id`, com backfill; a PK passa a `(empresa_id, membro_id, filial_id)`. O vínculo de escrita deixa de ser por pessoa e passa a ser por membership.
- **`public.plataforma_admins(profile_id)`** e `e_plataforma()` — que **não aceita parâmetro** (responde só sobre o próprio chamador, e por isso não há o que vazar). Ata: isto é o que o cargo `dev` já faz, mas passa a estar declarado. **A `/dev` não vira `/plataforma`; ela ganha um andar acima.** Isso também resolve a armadilha do NULL: a conta de plataforma fica **fora** de `membros`, e por isso não entra no denominador de `existe_outro_admin_ativo`.
- **As quatro funções de conjunto especificadas na F59**, todas `language sql stable security definer set search_path`, sem parâmetro, com `revoke … from public, anon` + `grant execute to authenticated`:
  `empresas_do_membro()`, `empresas_de_escrita()`, `empresas_de_admin()`, `unidades_de_escrita()`.
  Elas leem `membros` e **precisam ser `security definer`**: a policy de `membros` vai chamá-las e elas leem `membros` — se fossem `invoker`, o Postgres abortaria com *"infinite recursion detected in policy for relation membros"*. **Corolário obrigatório na ata: nenhuma tabela desta virada usa `force row level security`** — isso aplicaria RLS ao próprio dono e reintroduziria a recursão. (A regra já está em `MATRIZ-REGRAS.md` desde a F48; aqui ela ganha um segundo motivo.)
- **Por que membership e não claim no JWT**, registrado em ata: conferir contra a tabela a cada request é o que faz a revogação valer no request **seguinte**. Uma claim no JWT só mudaria na próxima renovação do token — uma janela de acesso indevido que um produto multiempresa não pode ter. A otimização por claim fica no §8, como pós-piloto, e depende de conferir no painel se o projeto Free oferece as chaves assimétricas necessárias.
- **`papel_atual()` continua existindo e continua sem parâmetro**, mas passa a ler de `membros`. Com uma empresa só e uma linha por perfil, o comportamento é **byte a byte o de hoje**. Ela ganha `p_empresa uuid` na F67, quando as RPCs passarem a receber a empresa; até lá é a ponte que mantém as 54 policies e os 199 call-sites intactos.
- **`scripts/seed.ts` semeia DUAS empresas fictícias**, com slugs de filial repetidos entre elas de propósito, patrimônio compartilhado e máscaras diferentes. **E cobre as seis tabelas que hoje ficam de fora** — hoje ele insere em 11 (`anotacoes`, `ativos`, `colaboradores`, `eventos_admin`, `filiais`, `itens`, `lancamentos_item`, `movimentacoes`, `operador_filiais`, `profiles`, `tipos_item`) e deixa sem fixture justamente **`senhas_acesso`** (a porta pública, o pior defeito possível), **`termos_gerados`** (o documento assinado com nome de pessoa), **`relatorios_gerados`** (snapshots congelados com PII), `kits_modelos`, `import_logs` e `pendencias_item`. Sem elas, o `assert_zero_de` do roteiro encontra universo vazio e ou reprova a virada inteira (virando alarme desligado) ou passa verde mentindo exatamente sobre as três tabelas que mais importam.
- **`supabase/tests/isolamento_tenant.sql` completado** — o esqueleto da F48 ganha os cenários A↔B: contagem nas duas direções; toda recusa de escrita provada duas vezes; FK composta provada com o par simétrico; `set local role authenticated` + `set_config('request.jwt.claims', …)` em todo cenário (o papel `postgres` tem `bypassrls` e testar com ele não prova nada sobre policy); e o passo de varredura iterando sobre o **catálogo**, nunca sobre lista de 20 nomes — `eventos_admin` é exatamente a tabela que uma lista à mão esqueceria.

**Não entra.** `empresa_id` em tabela de negócio. Qualquer policy. Qualquer UI. Derrubar `profiles.papel`.

**Entregas.** Migrations `0141`–`0144`, `scripts/seed.ts`, `scripts/seed.test.ts`, `supabase/tests/isolamento_tenant.sql`, `database.ts`.

**Pronto quando.** `isolamento_tenant.sql` verde com duas empresas fictícias no CI, incluindo as seis tabelas novas do seed; `empresas_do_membro()` devolve `[wap]` para todo perfil de produção; `papel_atual()` devolve para cada perfil de produção **exatamente** o que devolvia antes (roteiro de comparação obrigatório); nada na UI mudou.

**Trava.** O roteiro de isolamento + `seed.test.ts`: `EMPRESAS.length >= 2`, ao menos um slug de filial repetido entre elas, ao menos um patrimônio nas duas, e cobertura mínima das 17 tabelas de negócio — **um seed que "conserta" as colisões por acidente é um seed que parou de testar isolamento, e isso acontece calado.** Mais a asserção de catálogo de que nenhuma policy e nenhuma função lê `profiles.papel`.

**Dependências.** F59 (a forma do predicado escrita e travada), F47.

**Risco.** O maior da virada. Mover o cargo é mexer no mecanismo de autorização de um sistema em uso diário. **Mitigação:** `profiles.papel` permanece preenchido e íntegro (rede de reversão); o roteiro de comparação prova equivalência perfil a perfil antes do apply; ensaio no projeto de ensaio; uma mutação no injetor por função de autorização reescrita.

**Reversão.** `create or replace` de `papel_atual()` lendo `profiles` de volta, `drop table membros cascade`, `drop table empresas cascade`. `profiles.papel` nunca foi tocado.

**Repouso.** Perfeito e indefinido — desde que `profiles.papel` continue de pé.

---

### F63 — `empresa_id` no acervo (lote 1)

**Objetivo.** Acrescentar a coluna às 8 tabelas de acervo, preenchida e não usada — e criar a disciplina de backup de migração.

**A armadilha que esta fase evita, e que é fácil de escrever errado.** A receita ingênua é `add column … default` → **`update` de backfill** → `set not null`. O `update` **aborta em 42501 na primeira linha** de `movimentacoes` e `lancamentos_item`: `guarda_acervo` (`0081`) é `before insert or update or delete`, `for each row`, e recusa todo UPDATE **inclusive para o service role**. E abrir a janela `estoque.dev_destrutivo` para um backfill de rotina **desarma a imutabilidade de todo o acervo dentro da transação** — usar a válvula que a F23 criou para exclusão deliberada como ferramenta de migração normaliza o mecanismo mais perigoso do banco.

> **A resposta certa é que o backfill é desnecessário.** `add column empresa_id uuid ... default '<wap>'` com default **constante** preenche todas as linhas existentes sem reescrever tupla e sem disparar trigger (PG 11+). O `update` não deve ser escrito. Isto precisa estar em letras grandes na ordem de serviço, porque um executor lendo "backfill em lote" vai escrever o UPDATE.

**Entra.**

- `ativos`, `movimentacoes`, `lancamentos_item`, `pendencias_item`, `anotacoes`, `termos_gerados`, `colaboradores`, `itens`: `add column empresa_id uuid references public.empresas(id) not null default '<wap>'` → `set not null` (já satisfeito) → **`drop default`**. O default é a rede da migração, não do produto; deixá-lo é como um cliente novo herda a WAP em silêncio. Três a quatro tabelas por migration.
- **`public.backups_migration`** (RLS ligada, ZERO policy, `revoke all … from anon, authenticated, service_role` — molde de `public.ambiente`, `0090:53-56`), e o par de backup obrigatório em toda migration que **de fato** altere dado: o par `(id, valor_anterior)`, **não** a linha inteira — `to_jsonb` de 1.615 ativos numa linha só são 1 a 2 MB num banco Free de 500 MB.
- **`scripts/db/classificar-migration.mjs`** e o cabeçalho `-- classe: ADITIVA | DESTRUTIVA | BACKFILL` obrigatório. O parser remove comentários **antes** de procurar delimitadores `$$`, e remove corpos de função antes de classificar. Isso pega a classe que o gate de hoje não vê: **o `update` de topo**. A `0111` é a prova — passa reto pelo classificador (que olha `delete`) e pela `guarda_acervo` (cujo trigger em `ativos` é `before delete` apenas), e ela dependia de uma função criada na migration imediatamente anterior, nunca exercitada contra dado real; polaridade invertida teria zerado o detentor de todo o acervo.

**Não entra.** FK composta (F65); policy (F66); qualquer leitura da coluna.

**Entregas.** Migrations `0145`–`0147`, `scripts/db/classificar-migration.mjs`, `src/lib/validators/migrations-backfill.test.ts`, `database.ts`.

**Pronto quando.** `count(*) = count(empresa_id)` nas 8 tabelas; nenhuma das migrations contém `update public.movimentacoes` nem abre a janela destrutiva; `isolamento_tenant.sql` verde; contagens antes/depois na ata.

**Trava.** Migration de classe `BACKFILL` sem bloco de backup reprova; o literal `migration` no INSERT do backup tem de ser **exatamente** o nome do arquivo (o erro mais provável é copiar o bloco e esquecer de trocar o nome, o que faria o rollback restaurar as linhas de outra migration); o `where` do backup tem de aparecer **byte a byte** no comando seguinte; e uma asserção que **reprova `update` sobre `movimentacoes`/`lancamentos_item` em qualquer migration** que não declare classe DESTRUTIVA com justificativa nomeada.

**Dependências.** F62.

**Risco.** `set not null` toma ACCESS EXCLUSIVE. Mitigação: `add constraint … check (empresa_id is not null) not valid` → `validate constraint` → `set not null` (então instantâneo). Volumes atuais tornam isso quase acadêmico, mas o padrão fica escrito.

**Reversão.** `drop column`.

**Repouso.** Perfeito e indefinido.

---

### F64 — `empresa_id` no vocabulário e na infra (lote 2)

**Objetivo.** O mesmo para as 12 tabelas restantes, com as decisões que só elas exigem.

**Entra.**

- `filiais`, `tipos_item`, `motivos`, `kits_modelos`, `senhas_acesso`, `eventos_admin`, `import_logs`, `relatorios_gerados`, `senha_tentativas`, `operador_filiais` (já feito na F62), `ambiente` (com decisão explícita: é infra, não negócio, e continua global).
- **`senhas_acesso.empresa_id` é o item crítico do lote.** Hoje a senha não tem escopo nem no banco nem no tipo, e `entrarComSenha` faz varredura linear com scrypt sobre TODAS as senhas ativas do sistema, com o rate-limit falhando **ABERTO** (`const { data: excedeu } = await admin.rpc(...)` — o `error` é descartado e `null` é falsy). A coluna entra aqui, a rota entra na F68, e **o `error` descartado é corrigido agora**.
- **`eventos_admin.empresa_id` preenchido na ORIGEM** por `src/lib/auditoria-registro.ts` — trilha nova nasce escopada, trilha velha fica com o default. Backfill de escopo em trilha imutável é bem mais caro que default na origem.
- **`motivos` tem PK natural** (`codigo text primary key`) referenciada por FK em `movimentacoes`: **trocar a chave e a FK juntas, na mesma migration**. Errar ali não dá mensagem de UNIQUE — dá recusa de INSERT na tabela mais quente do sistema.
- **`kits_modelos.payload` guarda o código do motivo como TEXTO LIVRE dentro do jsonb** (`0043:40`), sem FK. FK composta **não alcança jsonb**, então o kit fica de fora da integridade estrutural por construção: um kit da empresa A com `motivo: 'troca'` sobreviveria à virada apontando para nada, ou para o motivo homônimo de outra empresa. Correção nesta fase: validação no `insert`/`update` do kit conferindo que o `motivo` do payload existe **na empresa do kit**, mais checagem nova em `dev_checagens_integridade()` para kits com motivo órfão.

**Não entra.** Trocar as UNIQUE globais (F65).

**Entregas.** Migrations `0148`–`0150`, `src/lib/auditoria-registro.ts`, `src/lib/actions/senhas.ts`, `src/lib/actions/kits.ts`, `database.ts`.

**Pronto quando.** As 20 tabelas têm `empresa_id not null` (ou estão na lista de infra nomeada e justificada); a asserção de catálogo passa; nenhum kit tem motivo órfão.

**Trava.** A varredura de catálogo "toda tabela de negócio tem `empresa_id not null`, com lista de infra nomeada e justificada" + a checagem de kit órfão.

**Dependências.** F63.

**Risco.** A PK de `motivos`. Mitigação: ensaio no projeto de ensaio; a migration inteira em uma transação.

**Reversão.** `drop column`; para `motivos`, o par de migrations reverso, documentado.

---

### F65 — Integridade estrutural do tenant

**Objetivo.** Montar a camada que **sobrevive à falha da RLS** — a que faz o banco recusar dado cruzado mesmo sem policy nenhuma.

**Entra.**

- `unique (empresa_id, id)` nas ~11 tabelas que podem ser pai. Parece redundante e não é: sem ele o Postgres **nem aceita** a FK composta.
- **FK compostas** em toda relação filha: `ativos` (unidade, tipo, colaborador, antecessor), `movimentacoes` (ativo, motivo, colaborador, unidade, unidade_destino, estorno), `lancamentos_item`, `pendencias_item`, `operador_filiais`, `membros`, `termos_gerados`, `anotacoes`.
- **UNIQUEs por empresa.** As que de fato quebram: `colaboradores.nome_chave`, `itens.nome_chave`, `itens (lower(nome))`, `kits_modelos (lower(nome))`, `tipos_item.slug`, `filiais.slug`, `motivos.codigo`. Os dois índices de `ativos` **já carregam `filial_id` desde a `0091`** e são implicitamente por-tenant — não precisam ser recriados. **Preservar os nomes dos índices**: `src/lib/actions/erros.ts` casa o 23505 pelo NOME da constraint para traduzir a violação em pt-BR, e renomear mata a tradução em silêncio (a armadilha que a `0091:61-65` já registrou).
- **O unique do snapshot.** `relatorios_gerados (periodo_de, periodo_ate, coalesce(filial_id,-1), versao)` ganha `empresa_id`. Sem isso, a partir da segunda empresa só a PRIMEIRA a gerar o consolidado da semana consegue; todas as outras levam "Outra pessoa gerou este mesmo período" quando ninguém da empresa delas gerou nada, **para sempre**, sem nada nos logs. Criar o índice novo **antes** de derrubar o antigo; manter o `-1` (ele não é o defeito); e **`chaveVersao` (a trava criada na F57) ganha `empresa_id` no mesmo commit**, junto com o casamento por nome de índice em `versao-snapshot.ts:43`.
- **Índices de lista liderados por `empresa_id`:** `mov_created_idx`, `movimentacoes_ordem_lista_idx`, `lanc_item_created_idx`, `eventos_admin_quando_idx`, `import_logs_created_idx`, `(empresa_id, ordem)` em `movimentacoes`, e o `(empresa_id, updated_at desc, id asc)` que `/ativos` nunca teve (o p95 dela é 1.037 ms contra mediana de 369 — o Sort sem índice a frio). O antigo cai no MESMO commit. `create index concurrently` onde possível.
- **`guarda_empresa()`** — trigger `before update` recusando `new.empresa_id is distinct from old.empresa_id` com 42501, em `ativos`, `pendencias_item`, `colaboradores` e `itens` (`movimentacoes`/`lancamentos_item` já são cobertas por `guarda_acervo`). **Sem exceção para a janela `estoque.dev_destrutivo`** — mudar o tenant de um ativo não é operação legítima nem para o dev; é a definição do defeito. É a **única** defesa que segura `aplicar_movimentacao`, que é `security definer` e ignora policy — e é ela que impede o único caminho do sistema que move um ativo de escopo (a transferência, cujo `filial_destino_id` vem do formulário) de virar teleporte cross-tenant com histórico junto.
- `ativos.empresa_id` **não pode** ser coluna gerada nem derivada de `filial_id`; senão a transferência continua movendo o tenant em silêncio.
- **As 13 travas advisory.** Duas notas na ata: ids reescalados por empresa fazem `(3,1)` de A colidir com `(3,1)` de B (lentidão intermitente sem erro, diagnosticada como "o Free está ruim"); e `pg_advisory_xact_lock(bigint)` e `(int,int)` são **espaços de lock diferentes** — conversão parcial desliga a exclusão mútua sem erro nenhum. Converter todas atomicamente ou não começar. Decidir aqui o tipo de `itens.id`/`filiais.id` (`smallint`: `generated always as identity` queima números em transação abortada, então o teto efetivo é menor que 32.767 e imprevisível).

**Não entra.** Policy.

**Entregas.** Migrations `0151`–`0155`, `supabase/tests/{forma_multiempresa,unicidade_por_empresa,imutabilidade_tenant}.sql`, `src/lib/relatorios/versao-snapshot.ts`, `src/lib/queries/gerados.ts`, `database.ts`.

**Pronto quando.** Duas empresas com filial `matriz` coexistem; o mesmo par patrimônio+service tag em duas empresas coexiste; a mesma empresa não o tem em duas filiais; duas empresas inserem o consolidado do mesmo período e mesma versão e as duas passam; `update ativos set empresa_id = <B>` leva 42501 **inclusive dentro da janela destrutiva aberta**.

**Trava.** `forma_multiempresa.sql` e `unicidade_por_empresa.sql`, **derivados de catálogo** (`pg_index`/`pg_constraint`). Tratar `attnum = 0` explicitamente — dois dos sete uniques são de EXPRESSÃO e `indkey[0] = 0` neles. Emitir os ✗ como `raise notice` até a fase fechar (o CI conta `WARNING`, não `NOTICE`) e trocar para `warning` no commit final: um roteiro permanentemente vermelho torna o job inútil.

**Dependências.** F64.

**Risco.** `add constraint` de FK composta falha se o preenchimento não estiver perfeito. Mitigação: `not valid` → `validate constraint` em passo separado, com contagem de violações medida antes.

**Reversão.** `drop constraint` / `drop index`, com os antigos escritos na própria migration.

---

### F66 — As policies ganham o recorte, em conjunção

**Objetivo.** Escrever o predicado de tenant nas 54 policies vivas **sem** remover o piso — de forma que a mudança seja logicamente inerte hoje e provada antes de valer.

**Entra.**

- Cada policy ganha, **em conjunção**: `and empresa_id = any (array (select public.empresas_do_membro()))`. Forma içada, uma avaliação por statement. **Nunca `e_membro(empresa_id)`** — `policies-initplan.test.ts` (F59) já barra. As policies de escrita passam a consumir `unidades_de_escrita()` na mesma forma.
- **`to authenticated` em todas as policies** — a própria doc do Supabase mostra que o `TO` sozinho elimina o custo de avaliação para `anon`.
- Três lotes (acervo, vocabulário, infra), com `isolamento_tenant.sql` verde entre eles.
- `catalogo_policies.sql` (F48) passa a exigir que toda policy sobre tabela de negócio cite `empresa_id`, e congela a linha de base nova.
- `isolamento_tenant.sql` ganha a bateria completa de LEITURA nas duas direções — e agora ela **pode** falhar de verdade.
- Uma mutação nova no injetor por classe de policy, incluindo a quebra cross-tenant clássica ("a guarda confere o papel e esquece o tenant").
- **`eventos_admin`** entra junto e merece nota: desde a F23 ela guarda backups jsonb do acervo apagado, é lida por `e_admin()` sem escopo, é insert-only sem policy de escrita (não existe caminho de expurgo por dentro do modelo), e `alvo` guarda e-mail de convidado. Considerar mandar o jsonb volumoso para o bucket (como o reset já faz acima de 25 registros) e deixar só o ponteiro — isso a devolve a metadado e faz o recorte proteger menos superfície.
- **O comprimento vira regra do banco, não só do Zod.** Há 9 CHECK em 126 migrations contra 61 `.max()` nos validators, e **quatro caminhos de escrita que não passam por Zod nenhum** (a RPC do import com jsonb cru, a Zona destrutiva, os ~30 `createAdminClient()`, os scripts). Em banco compartilhado isso é o vizinho barulhento: um cliente enche 500 MB e derruba todos. CHECK de comprimento nas colunas de texto livre das tabelas de negócio, com os tetos derivados dos `.max()` que já existem.

**Não entra.** Remover o piso (F72). Storage e definer (F67). Escrita por tenant (F67).

**Entregas.** Migrations `0156`–`0159`, `supabase/tests/{catalogo_policies,isolamento_tenant}.sql`, `scripts/db/run-mutation-tests.mjs`.

**Pronto quando.** `isolamento_tenant.sql` verde nas duas direções para LEITURA; **nada mudou para a WAP** (smoke verde); o TTFB medido não regride mais que 15 % contra a linha de base da F59.

**Trava.** `catalogo_policies.sql` + `policies-initplan.test.ts`.

**Dependências.** F65.

**Risco.** 54 policies é muito para um commit. Mitigação: três lotes, roteiro verde entre eles, cada lote reversível por `alter policy`.

**Reversão.** `alter policy` de volta, por lote.

**Repouso.** Perfeito. O sistema fica com RLS de tenant escrita, medida e provada, e o piso ainda aberto — seguro indefinidamente.

---

### F67 — Escrita, definer, Storage e Realtime por tenant

**Objetivo.** Fechar tudo o que a RLS de leitura não alcança: a escrita, as ~37 funções que atravessam policy por construção, os dois buckets e o canal de tempo real.

**Entra.**

- **`pode_escrever_unidade(p_empresa uuid, p_filial smallint)`**, com duas propriedades deliberadas: **recebe a empresa junto** e confere que a filial é daquela empresa (senão um admin de A que passasse o id de uma filial de B seria aprovado pela checagem de papel — ele *é* admin em algum lugar); e devolve **`false` para argumento nulo** (fecha em vez de abrir). **O teste de empresa vem ANTES do teste de cargo** — se vier depois, o ramo `dev/admin` retorna `true` antes de alcançá-lo, que é o defeito de hoje. `create or replace` faz as dez policies herdarem sem serem reescritas (o mesmo truque da `0072`). E o ramo do admin **não** ganha `where f.ativo`: `pode_escrever_filial` devolve `true` para admin em qualquer filial, inclusive desativada, e o sistema convive com filial desativada que ainda tem saldo (`itens.ts:302-309` diz isso por extenso).
- **`papel_atual()` ganha `p_empresa uuid`**, e `e_admin`/`pode_escrever` acompanham. `e_dev()` se resolve por `e_plataforma()` **ou** dev-da-empresa — decisão em ata. Este é o commit em que o cargo por empresa (F62) sai da ponte e passa a valer de fato.
- **As guardas no-op da F52 ganham corpo:** `mesmo_escopo_de_gestao` compara `empresa_id`; `existe_outro_admin_ativo` conta por escopo (com a conta de plataforma fora do denominador, porque ela vive em `plataforma_admins`); `exigir_ativos_da_empresa` deixa de ser identidade; o import e a mesa de conflitos recusam filial de outra empresa.
- **`v_conflitos_filiais`/`_grupos`** ganham `where a.empresa_id = ...` nas CTEs `ident`/`grupos`. Hoje o `group by … having count(distinct filial_id) > 1` roda sobre `ativos` INTEIRA: duas empresas com numeração patrimonial parecida — caso comum — formam grupo de conflito entre si, e **o gêmeo alheio passa a autorizar a exclusão do próprio**. Antes da exclusão já há vazamento: a mesa exibe marca, modelo, hostname, `colaborador_atual` e `setor_atual` do ativo alheio. Advisory lock com duas chaves (`hashtext('conflito_apagar'), empresa`). **Conflito ENTRE empresas deve ser impossível por construção, não resolvido por mesa.**
- **`p_empresa uuid NOT NULL` como primeiro parâmetro das RPCs destrutivas.** `resetar_acervo(p_filial => null)` deixa de significar "tudo": com N tenants, é uma RPC que apaga todos os clientes com uma frase de 12 caracteres digitável de memória. Alcance global sai do alcance de RPC, e a confirmação passa a carregar a quantidade (`RESETAR TUDO — <N> ATIVOS`, idioma do `APAGAR <N>`), com trava exigindo que `rotulo_alcance_reset` contenha `count(`.
- **A TRAVA DO TERMO (decisão 7).** Enquanto os 7 modelos `.docx` carregarem a identidade da WAP como texto fixo — razão social e CNPJ da Fresnomaq nos 5 de responsabilidade, "para a empresa WAP" nos 2 de devolução, e "WAP" no cabeçalho de todos —, **emitir termo para empresa que não seja a WAP é gerar documento falso**. Esta fase põe a recusa **no banco**: `termos_gerados` ganha um CHECK/trigger que recusa insert cuja `empresa_id` não esteja numa lista de empresas com modelo próprio (hoje: só a WAP), com 42501 e mensagem própria — *"a emissão de termo ainda não está disponível para esta empresa"*. A UI correspondente entra na F70. **Sem essa trava, "adiar" vira "emitir errado em silêncio", que é o pior desfecho possível.**
- **Storage.** Bucket `termos`: `pode_ler_arquivo_termo` (criada na F50 com a regra de hoje) passa a exigir que o `termos_gerados` correspondente seja da empresa da sessão — **pelo join, não pelo caminho**, o que dispensa mover um único objeto (mover os 67 objetos existentes exigiria reescrever `arquivo_path` por igualdade de string, e a janela em que o par path↔linha fica quebrado é exatamente a que desarma a proteção de escrita via o `coalesce(…, true)`). Bucket `backups-import`: prefixo `import/empresa-<id>/filial-<id>/` para objetos novos (os antigos continuam resolvendo, porque `import_logs.backup_path` guarda o literal); as 4 policies passam a exigir `(storage.foldername(name))[2] = any(array(select …))`, mantendo `e_admin()` — cinto e suspensórios, porque é o objeto de maior valor do sistema. Objetos legados ficam fora de todo prefixo, isto é, invisíveis: comportamento seguro, mas **decidido de propósito e escrito**.
- **`persistirTermo` invertido** (linha antes do upload, com rollback correto no ramo de INSERT) e só então `coalesce(…, true)` vira `false` em `pode_escrever_arquivo_termo`. Os dois são um trabalho só, nesta ordem: hoje objeto que nenhuma linha referencia é gravável e apagável por qualquer `pode_escrever()`, e basta o par path↔linha divergir para o bucket inteiro ficar aberto. A limpeza de órfão migra para ferramenta nomeada na Zona destrutiva. Cuidado: `persistirTermo` reutiliza id existente (UPDATE) num dos ramos e apaga órfãos de variantes antigas — inverter é mais trabalho que trocar duas linhas.
- **Realtime:** `filter: 'empresa_id=eq.<id>'` nas três assinaturas (o gancho existe desde a F50) **e** RLS na publication `supabase_realtime`. O filtro do cliente é ergonomia; a trava mora no Postgres. Sem isso, `postgres_changes` entrega o **payload da linha** ao navegador de todo cliente aberto de toda empresa, por um canal que nenhuma auditoria de RLS de tabela examina.

**Não entra.** A porta pública (F68).

**Entregas.** Migrations `0160`–`0165`, `src/lib/actions/{importar,conflitos,termos,dev-destrutivo}.ts`, `supabase/tests/{definer_escopo,storage_por_empresa,conflito_entre_empresas,realtime_escopo,termo_bloqueado}.sql`.

**Pronto quando.** `isolamento_tenant.sql` prova, nas duas direções, que admin de A não escreve em nada de B — em `ativos`, `movimentacoes`, `lancamentos_item`, `termos_gerados` e nas cinco RPCs de conta; admin de A não lista nem baixa objeto de B em nenhum dos dois buckets; admin de A **ainda apaga** o termo degenerado (`ativo_ids = '{}'`) da própria empresa — o teste que prova que a correção não recriou o lixo imortal que a `0069` documenta; emitir termo para a empresa B é recusado com 42501; `definer-escopo.test.ts` fica sem exceções.

**Trava.** `definer_sem_tenant.sql` (a tabela-verdade da F52, agora exigindo escopo e não só classificação), `storage_por_empresa.sql`, `termo_bloqueado.sql`, `src/lib/storage/caminho.test.ts` (a função única que monta caminho nunca devolve string sem prefixo de tenant), e a trava do `postgres_changes` exigindo `empresa_id=eq.` no filter.

**Dependências.** F66.

**Risco.** Alto — mexe em tudo que destrói. Mitigação: uma mutação por RPC no injetor; ensaio antes; cada função é `create or replace` reversível; cada recusa tem o par simétrico que **aceita** o legítimo.

**Reversão.** `create or replace` da definição anterior; `alter policy` de volta.


---

### F68 — A porta pública por empresa

**Objetivo.** Tirar o service role da única superfície sem login, e fazer a senha de visualização pertencer a uma empresa — no banco e no tipo.

**Por que é a fase que destrava o piloto.** `resolverAcessoRelatorio()` (`acesso.ts:443-457`) devolve, para o modo viewer, um `createAdminClient()` — service role, `rolbypassrls`. As quatro defesas que a virada monta (RLS por membership, FK composta, roteiro de isolamento, guarda nas RPCs) **são todas irrelevantes nesse caminho**. O tripwire do repositório já diz, textualmente, que *"para o viewer, o RLS NÃO é a segunda linha; o único muro é o CÓDIGO das queries de relatório"*. Numa empresa isso é decisão defensável; com duas, uma senha válida abre o relatório de qualquer empresa trocando o slug na URL.

**Entra.**

- **O tenant do visualizador deriva sempre do `senha_id` do cookie**, nunca do slug. O slug serve para exibição e é **conferido contra** a empresa derivada — divergiu, **404, não redirect**. Rota passa a `/r/<slug-da-empresa>/relatorios/...` com 308 dos endereços antigos.
- **`entrarComSenha` deixa de varrer.** Hoje faz scrypt linear sobre todas as senhas ativas do sistema. Passa a exigir a empresa na rota e consultar `.eq('ativa', true).eq('empresa_id', <empresa da rota>)`. **As cinco recusas têm a mesma cara** — sem senha, senha errada, senha revogada, slug inexistente, e senha de A no slug de B devolvem exatamente a mesma resposta, e a função faz o mesmo trabalho nos dois caminhos (calcula um hash mesmo sem candidato) para não vazar por tempo. Força bruta: janela de 60 s, teto por (empresa, origem), com o `error` do rate-limit **não** mais descartado (F64).
- **O service role sai da porta.** Duas RPCs `security definer` — `relatorio_publico_abrir(slug, senha, origem)` e `relatorio_publico_dados(...)` — recebem o `senha_id` já verificado pelo servidor e derivam a empresa **por dentro**; `revoke all … from public, authenticated, service_role` e `grant execute … to anon`. São a **única exceção de `anon` de toda a base**, e por isso são pequenas, auditáveis por inteiro e nomeadas na varredura de catálogo. Cliente próprio em `src/lib/supabase/publico.ts` que **não lê cookie de sessão nenhum** — se a página pública falasse pelo cliente de sessão, bastaria um operador estar logado para o papel virar `authenticated` e a chamada ser recusada, um bug que só aparece para quem tem conta.
- **Minimização:** o painel público é montado sem dado pessoal (`p_com_pessoas => false`), e os blocos com nome de pessoa **não são computados** — não são montados e descartados.
- **A diagonal**, que é o ataque novo desta fase: `relatorio_publico_dados` exige que o slug pedido **bata com a empresa da sessão**.
- `fronteira-viewer.test.ts` reescrito para a superfície nova (que passa a ser duas RPCs, não N módulos de query).

**Não entra.** Subdomínio por empresa (o slug na rota basta, e a resolução fica numa função só — trocar "slug na rota" por "slug no host" depois é mudança localizada).

**Entregas.** Migrations `0166`–`0168`, `src/lib/supabase/publico.ts`, `src/lib/auth/acesso.ts`, `src/app/r/**` + 308, `src/lib/actions/senhas.ts`, `fronteira-viewer.test.ts`, `supabase/tests/isolamento_viewer.sql`.

**Pronto quando.** `resolverAcessoRelatorio` não menciona `createAdminClient` no ramo do viewer; `isolamento_viewer.sql` verde (duas senhas iguais em empresas diferentes coexistem e cada uma abre só a sua; senha de A no slug de B recusa; `/r/<slug-de-B>/…` com sessão de A recusa); os 308 funcionam com um link antigo real; smoke da porta pública verde.

**Trava.** `isolamento_viewer.sql` — que **só passou a ser testável em SQL depois** de esta fase tirar o service role da porta; escrever isso no cabeçalho, porque antes disso o passo seria um `✓` vazio dando falsa segurança. Mais o par de asserções do catálogo: nenhuma função de `public` executável por `anon` fora da lista nominal de duas, **e** essas duas continuam lá (sem o segundo, bastaria alguém revogar a porta pública para o cenário passar por engano).

**Dependências.** F50 (superfície do viewer derivada), F64 (`senhas_acesso.empresa_id`), F67.

**Risco.** É a superfície mais exposta do produto. Mitigação: as duas funções são pequenas e auditáveis por inteiro; mutações no injetor mirando cada uma das cinco recusas; a rota antiga permanece atrás de flag até a nova estar provada, e o corte é entrega avulsa PATCH.

**Reversão.** Reativar a rota antiga (mantida por uma fase) + `alter policy`.

---

### F69 — Identidade e governança de contas por empresa

**Objetivo.** Fazer a porta de entrada de gente ser por empresa, e escopar o segundo módulo sem RLS.

**Entra.**

- **Domínios de login por empresa.** Hoje são três `ilike` literais dentro de `handle_new_user` (a versão viva é a da `0057`, não a `0041` que a doc cita) mais um array em `src/lib/auth/dominios-email.ts`, com o comentário *"mexeu aqui, mexa lá também"* e **nenhuma trava** — num projeto que tem seis travas TS↔SQL desse exato tipo. **Primeiro a trava, depois a tabela:** `empresa_dominios (empresa_id, dominio)`, com o trigger consultando-a. Um `ilike` que sobreviva sem recorte coloca o funcionário do cliente A dentro do cliente B na hora do convite — vazamento de identidade que nasce autorizado.
- **O convite é que cria o vínculo.** Com `membros` (decisão 6), `handle_new_user` deixa de atribuir cargo: ele cria o `profile`, e a linha de `membros` (empresa + papel) nasce do convite. Um mesmo e-mail convidado por duas empresas ganha **duas linhas de `membros` e uma conta só** — que é exatamente o caso `@stefanini.com`.
- **`queries/admin.ts` escopado.** Nove funções leem com service role e **enumeram o projeto Auth inteiro** (`listUsers`, até 10 mil contas). `auth.users` é do PROJETO, não da empresa: não há filtro possível na API, e o recorte tem de ser feito **depois**, em memória, contra `membros` — hoje o código faz o contrário (lê tudo do Auth e junta por id). Toda função recebe `empresaId` **obrigatório**. `perfilPorEmail` é o caso agudo: existe para responder "de quem é este e-mail?" e com N empresas responde sobre contas de outros clientes — reduzir a superfície fazendo a busca partir de `membros`, com `getUserById` (pontual) no lugar da enumeração.
- **A leitura cruzada de perfis, com a distinção fina que vale copiar:** quem LÊ tem de ser membro **ativo**; quem É LIDO continua sendo colega mesmo desativado — o histórico precisa do nome de quem já saiu.
- `fronteira-admin.test.ts` nasce **allow-list** (o tripwire do viewer nasceu deny-list, e é por isso que estava furado): falha em qualquer `.from('X')` fora de `['profiles','membros','operador_filiais','filiais','motivos','senhas_acesso']` e em qualquer `admin.auth.admin.<método>` fora de lista nominal com motivo.

**Não entra.** UI (F70).

**Entregas.** Migrations `0169`–`0170`, `src/lib/auth/dominios-email.ts`, `src/lib/auth/convite.ts`, `src/lib/queries/admin.ts`, `src/lib/queries/fronteira-admin.test.ts`, `src/lib/validators/dominios-sql.test.ts`, `supabase/tests/cargo_dev.sql` estendido.

**Pronto quando.** `cargo_dev.sql` verde (admin de A não rebaixa usuário de B; a trava do último administrador é por escopo; a conta de plataforma tem lugar definido nessa conta); um mesmo e-mail com vínculo em duas empresas fictícias opera com cargos diferentes em cada; `dominios-sql.test.ts` verde; `fronteira-admin.test.ts` verde.

**Trava.** As três acima, mais a asserção de catálogo de que `handle_new_user` não contém domínio literal. **Âncora do teste TS↔SQL: `create or replace function public.handle_new_user`, não `function public.handle_new_user`** — a `0038`/`0041` contêm `revoke all on function public.handle_new_user()`, que casaria com a âncora ingênua sem redefinir a função.

**Dependências.** F62, F67.

**Risco.** A conta de plataforma com escopo nulo faz `existe_outro_admin_ativo` recusar tudo (NULL propaga). Mitigação: ela vive em `plataforma_admins`, fora de `membros`, e o caso é explícito no roteiro, escrito **antes** da migration.

**Reversão.** `create or replace` do trigger + `drop table empresa_dominios`.

---

### F70 — A camada de UI multiempresa

**Objetivo.** Dar ao operador a empresa como coisa visível, com o recorte resolvido em **um** lugar.

**Entra.**

- **`src/lib/empresa/contexto.ts` — `contextoDoApp()`**, memoizada por request com `cache()`, resolvendo empresa + papel + unidades numa leitura só. **O cookie de empresa é um SELETOR, não autorização**: ele guarda qual empresa a pessoa escolheu ver, e quem decide se vale é o banco — a RPC só aceita id que esteja entre as empresas de que quem pede é membro ativo, e cai na primeira dela quando não está. Conferir o FORMATO do cookie em TS **não é** conferir o direito.
- Seletor de empresa no header, visível só para quem alcança mais de uma. `Permissoes` ganha `empresaId`; `podeLer` (criado trivial na F50) ganha corpo; **a paleta de comandos** (superfície de autorização paralela, `paleta-comandos.tsx:72-76`) passa a consumi-lo.
- `Marca` recebendo nome/sigla/cor por empresa (os pontos de injeção estão prontos desde a F61); metadata de `src/app/layout.tsx` derivado; `credito-autor.tsx` respeitando a configuração por empresa.
- **Máscara de patrimônio por empresa** (`patrimonio_prefixo`/`patrimonio_digitos`), consumida pelos validators Zod, pelo motor de import e pela RPC — com a régua lida **da linha da empresa, nunca de parâmetro** (regex vindo de parâmetro dentro de `!~` é superfície de ReDoS no Postgres), e CHECK de formato na coluna.
- **A UI da trava de termo (decisão 7).** Para empresa sem modelo próprio, o botão de gerar termo não aparece — e onde o fluxo o pressupõe (a pendência de termo), o estado é explicado em português: *"emissão de termo indisponível para esta empresa"*. A recusa do banco (F67) é a garantia; esta é a cortesia. O piloto opera assim, conscientemente.
- **Vocabulário na UI:** decidir e registrar se "filial" vira "unidade" no **rótulo** que o cliente lê. **O custo real, medido:** `src/lib/ajuda/conteudo/` tem 35 arquivos de conteúdo (5.914 linhas) mais 4 de teste (3.139), com 519 ocorrências de "filial/filiais" e 9 nomes de filial real; em `src/lib/ajuda/` inteiro são 549. A cobertura é de **424 asserções `toContain` de frase literal**, em dois níveis. Trocar o rótulo derruba centenas delas. A recomendação é **não trocar agora** e deixar a decisão para o §9 — mas ela precisa estar tomada antes de a primeira tela de cliente ir ao ar.
- **Se houver cor por empresa** (e só se houver): derivação de tema com contraste garantido por construção — matiz preservado (é a identidade), luminosidade resolvida por busca binária até a razão exigida, **medindo o hex final** e não a cor teórica, com varredura do cubo sRGB nos dois temas. E a regra que a acompanha: **marca veste a moldura; a língua funcional não se mexe** — as oito famílias de selo, o âmbar de pendências e o vermelho destrutivo são semântica, não marca. Se não houver cor por empresa, **corte esta peça inteira**.

**Não entra.** Decomposição dos componentes gigantes. Subdomínio. Reescrita da ajuda.

**Entregas.** `src/lib/empresa/contexto.ts`, `src/components/layout/{marca,seletor-empresa,permissoes,credito-autor}.tsx`, `paleta-comandos.tsx`, `src/app/layout.tsx`, `src/lib/patrimonio.ts`, `.test.tsx` do header e do seletor.

**Pronto quando.** Um membro que alcança duas empresas troca entre elas e nenhuma tela mostra dado misturado; trocar de empresa muda tudo o que a tela **mostra** e nada do que ela **autoriza**; `confinamento-viewer.test.ts` e `use-filtros-tabela.test.ts` verdes; `contraste` e `medir-acessibilidade.mjs` verdes para as cores do seed fictício.

**Trava.** As da F50, que agora encostam em código real: `CampoFiltro` não conhece `empresa`; nenhum componente deriva autorização de lista recebida por prop. Mais o cenário do **parâmetro forjado** em `isolamento_tenant.sql`: pedir o contexto com o id da empresa B devolve a empresa A — o cookie seleciona, não autoriza.

**Dependências.** F61, F66–F69.

**Risco.** É a única fase que o usuário vê inteira. Mitigação: fotos de `scripts/design/capturar.mjs` antes/depois; smoke; rollout com a WAP como única empresa antes de qualquer cliente.

**Reversão.** `git revert`.

---

### F71 — Os documentos alcançam o sistema

**Objetivo.** Fazer a hierarquia documental do `CLAUDE.md` parar de apontar para o lugar errado, e decidir o que o cliente lê.

**Por que ela é uma fase e não um rodapé.** O `CLAUDE.md` manda resolver contradição **pela spec**. `docs/ESPECIFICACAO.md` tem 478 linhas e 80 menções a "filial" descrevendo um sistema mono-empresa; a partir da F62 todo executor que a abrir encontra a autoridade nº 1 contradizendo o que ele acabou de construir. O cabeçalho de escopo da F59 é um paliativo com prazo — esta fase o resolve.

**Entra.**

- `docs/ESPECIFICACAO.md` emendada: a camada de empresa entra como parte da spec, com o vocabulário final. `docs/PLANEJAMENTO.md` e `docs/ARQUITETURA.md` acompanham. **`ARQUITETURA.md` §2 e §4 ainda afirmam "nível único, sem papéis" e "policies `USING (true)`"** — resquício revogado pela F21/F22 em 30/07/2026 num documento classificado como *vivo*. Corrigir junto: é defeito de documentação real, não questão de data.
- `docs/README.md` reclassificado: o que virou histórico, o que virou vivo, e os documentos de exploração (`PLANO-PRODUTO-MULTIEMPRESA.md`, `SYSTEM-DESIGN-ACERVO-2026-08-31.md`, `PLANO-ESPELHO-SHAREPOINT.md`) marcados como **superados por este plano**.
- **`/versoes` e o registry decididos.** `src/lib/versoes/registry.ts` tem 964 linhas contando a história da implementação da WAP — *"o botão 'Ver as 5 filiais'"*, *"estoque em Linhares"* —, e `versoes/page.tsx:12` declara leitura livre para qualquer perfil ativo. Depois da revogação do piso, "qualquer perfil ativo" passa a significar **qualquer usuário de qualquer cliente**, lendo o roadmap do provedor e o vocabulário do cliente A. E a regra permanente 8 obriga cada uma destas 28 fases a escrever entrada nova nessa mesma página. Três saídas, e uma tem de ser escolhida: (a) `/versoes` vira página do provedor, visível só a `e_plataforma()`; (b) vira histórico por empresa, com as entradas marcadas; (c) as entradas passam a ser escritas em linguagem neutra de produto desde já. **Recomendação: (a) agora, (c) como disciplina daqui para a frente** — porque o cliente não precisa ler "empresa_id" e "RLS".
- `docs/DECISOES.md` (8.565 linhas) ganha índice por fase — 28 atas novas chegam nele.

**Não entra.** Reescrever as ~5.900 linhas de conteúdo de `src/lib/ajuda/conteudo/`.

**Entregas.** `docs/ESPECIFICACAO.md`, `docs/PLANEJAMENTO.md`, `docs/ARQUITETURA.md`, `docs/README.md`, `docs/DECISOES.md`, `src/app/(app)/versoes/page.tsx`, `src/lib/versoes/registry.ts`.

**Pronto quando.** Nenhum documento vivo descreve o sistema errado; `/versoes` tem escopo decidido e implementado; a ata da decisão está escrita.

**Trava.** `docs-vivos.test.ts` — nenhum documento marcado como vivo contém as frases revogadas (`USING (true)` como descrição do modelo de acesso, "nível único", "sem papéis").

**Dependências.** F70.

**Risco.** Nenhum técnico. O risco é ser adiada para sempre por não ter código.

**Reversão.** `git revert`.

---

### F72 — A revogação do piso de leitura

**Objetivo.** Remover o piso `(select public.papel_atual()) is not null` das **16 policies de SELECT** que o carregam hoje — 15 em `public` e 1 em `storage.objects` —, deixando só o recorte de tenant.

> **Cuidado com o número herdado.** A `0070` aplicou o piso a 13 policies de `public` + 1 de Storage, mas **duas migrations posteriores nasceram já com ele** (`0112_colaboradores.sql:147-149` e `0114_tipos_item.sql:94-96`). Quem partir de "13" deixa duas policies com o piso aberto depois de a fase fechar. A lista sai do catálogo, nunca de memória — e a forma na `pg_policies` é `(select public.papel_atual()) is not null`, não `papel_atual() is not null`: um grep pela segunda string dá **zero** resultados.

**Por que ela é pequena.** O predicado novo está no ar, medido e provado desde a F66. Esta fase **apaga o termo redundante** da conjunção — não introduz nada. É a diferença entre "escrever o recorte" e "apagar o piso", e é a razão pela qual este plano não tem ponto de não retorno com prazo de minutos.

**Entra.**

- Remoção do primeiro termo da conjunção, **em lotes de 3 a 4 policies** (as 16, derivadas do catálogo), com `isolamento_tenant.sql` verde entre cada lote.
- `catalogo_policies.sql` **inverte** a asserção que congelou na F48: o piso antigo não pode aparecer em policy nenhuma, e a linha de base nova é essa.
- Asserção nova: nenhuma migration acima do PISO faz `alter policy … using (true)`. **Cuidado obrigatório** — a `0070:122-135` contém treze linhas exatamente com esse comando, **em comentário**, na seção de reversão; um grep cru daria falso positivo. Usar o filtro de comentário que `funcoesDefinidas()` já implementa.
- Regra reafirmada em `docs/MATRIZ-REGRAS.md`: **`force row level security` continua proibido**, com o `42P17` esperado ao lado e a lista de tabelas escritas por `security definer` derivada do catálogo, não escrita à mão.
- **A janela, escrita com o que ninguém costuma escrever.** Ordem SQL-antes-de-deploy (`RUNBOOK-BANCO.md:31`), com o **rollback de deploy ensaiado antes** — o rollback da Vercel é instantâneo e o do banco não é, e código que espera ler tudo contra um banco que já recorta dá telas vazias para todos. Mais os três cenários de sessão viva que precisam estar previstos:
  - **operador com o wizard de movimentação aberto** (rascunho em `sessionStorage`, lote de ativos bipados) que submete durante a janela — a escrita passa por `criar_movimentacao_com_itens`, e se o código velho não passar escopo a recusa é 42501 e o lote se perde. Escolher: janela fora do horário de operação, ou aviso na tela, ou os dois;
  - **visualizador com aba aberta**: `ViewerAutoRefresh` dispara `router.refresh()` a cada 60 s, para sempre — dizer o que ele vê;
  - **Realtime**: `supabase_realtime` publica `movimentacoes`, `lancamentos_item` e `anotacoes`, e a checagem de RLS dele é por linha e por assinante — trocar 16 policies com N WebSockets vivos não é o mesmo que trocar com ninguém conectado.

**Não entra.** Absolutamente mais nada. Esta fase é deliberadamente a menor possível.

**Entregas.** Migrations `0171`–`0174` (um lote por migration), `supabase/tests/catalogo_policies.sql`, `docs/MATRIZ-REGRAS.md`, ata da janela.

**Pronto quando.** Nenhuma policy de SELECT cita o piso isolado, conferido pelo catálogo e não por grep; `isolamento_tenant.sql` verde; `catalogo_policies.sql` afirmando que o piso não voltou; smoke verde.

**Trava.** A asserção invertida + `isolamento_tenant.sql` como **required check nomeado à parte**, para que seja impossível mergear o commit que revoga o piso sem ele verde.

**Dependências.** Todas.

**Risco.** Se o predicado estiver errado, **todo mundo deixa de ver tudo** — falha barulhenta e imediata, que é a boa notícia. E esta é a **única migration do plano que não pode ser ensaiada em `begin/rollback` contra produção**: durante a transação a RLS nova vale para quem estiver usando o sistema, e o `statement_timeout` de 8 s do `authenticated` faz o rollback não-garantido ser risco real, não teórico. Ensaiar no job `banco` (Postgres real, migrations do zero, seed de duas empresas) e no projeto de ensaio.

**Reversão.** `alter policy` recolocando o piso — devolve o comportamento anterior em segundos, e o código novo continua funcionando porque a conjunção era inerte.

---

### F73 — O piloto

**Objetivo.** Pôr o segundo cliente no ar com rede de segurança, e declarar o que custa dinheiro.

**Entra.**

- **Pré-requisitos DE CUSTO, declarados aqui e só aqui** — a preparação e a virada inteiras foram R$ 0:
  - **Supabase Pro** (PITR, sem pausa por inatividade, `statement_timeout` configurável, pooling);
  - **SMTP próprio** — é o limite do Free que **morde primeiro**, e não é o banco: o remetente embutido trava o convite dos operadores **na primeira empresa real**. Dependência nova ⇒ ata em `DECISOES.md` com sua aprovação;
  - possivelmente WAF na Vercel para a porta pública;
  - **um projeto de ensaio que não se apaga sozinho** — hoje ele pausa após uma semana sem requisição, e a ata da F36 registra por escrito que *"o ensaio rodou contra PRODUÇÃO em transação desfeita"*. Os 2 projetos do Free já estão ocupados por produção + ensaio.
- **Restauração POR TENANT**, desenhada e ensaiada. Ela não existe hoje nem em desenho: o restore que o Supabase oferece é do **projeto inteiro**, e usá-lo levaria os outros clientes de volta ao ponto do backup. No multiempresa a restauração é quase sempre parcial. Reusa o restaurador da F54.
- **Canário de isolamento no smoke agendado** (F55): a Parte B roda com sessões de **dois tenants reais** e afirma que cada um vê só o seu. Só produção tem os dois clientes de verdade, e é a única forma de o canário existir.
- Onboarding do cliente: criar a empresa, criar as filiais, subir os apelidos do De→Para (F56), rodar o import de startup, conferir as contagens. **O cliente é informado, por escrito, de que a emissão de termo `.docx` não está disponível** (decisão 7) e de quando estará.
- **Retenção declarada** de `import_logs.correcoes`, `eventos_admin.detalhe`, `relatorios_gerados.dados`, `backups_migration` e do bucket de backups — as três perguntas de LGPD que um cliente com jurídico faz (quanto tempo guarda, quem alcança, como se apaga o dado de um titular). Hoje as três respostas são *"para sempre / qualquer admin / não se apaga"*, e há **13 meses de snapshots semanais congelando nome de funcionário em jsonb**. Policy de DELETE por `e_dev()` + ferramenta nomeada na Zona destrutiva que apague a linha **e** o objeto do bucket. O backup de import domina o Storage (22 MB de 27 MB) e no produto cresce mais rápido, porque o import vira a porta de entrada com re-imports.
- **`SUPABASE_ACCESS_TOKEN` rotacionado** — o token passou por sessões de agente e por arquivos de trabalho, e é a primeira pergunta de qualquer diligência de segurança.
- **A decisão de produto sobre a mesa de conflitos**, tomada agora, com a planilha real do primeiro cliente na mão (§7, item 12).

**Pronto quando.** Um restore por tenant voltou de verdade, uma vez, com termo `.docx` incluído; o segundo cliente opera uma semana e o canário roda sem acusar nada.

**Trava.** `backup-formato.test.ts` estendido; `cobertura.test.ts`; a asserção de isolamento no smoke, com trava de texto que falha se a seção sumir.

**Dependências.** Todas.

**Risco.** O ensaio de restauração é a coisa que se adia para sempre. Mitigação: é o critério de pronto da fase; sem ele a fase não fecha, e sem a fase não há piloto.

**Reversão.** A segunda empresa é criada e apagada na mesma janela, com backup e contagens.


---

# § 8 — Conflitos resolvidos

Vinte pontos em que as três arquiteturas discordaram, ou em que a leitura ingênua erra. Cada um com a decisão e **por que a alternativa perde**.

**1. Teste de componente: antes ou depois de refatorar?** → **Antes (F45), e só o grau 1**: `renderToStaticMarkup` de `react-dom/server`, que já é dependência, sob o Vitest em `node` que já existe, com `test.projects`. *A alternativa perde porque:* refatorar `mesa-conflitos.tsx` e os diálogos de admin sem rede é trocar dívida por risco, e o grau 2 (jsdom + testing-library + plugin-react) exige aprovação e não é pré-requisito de isolamento nenhum.

**2. `empresa_id` cedo ou tarde?** → **Tarde na sequência (F63), e em lotes de 3 a 4 tabelas.** *A alternativa perde porque:* a coluna é barata; o que é caro é a policy e a FK composta, e elas exigem o preenchimento perfeito. Pôr a coluna cedo não destrava nada e obriga o gate de tipos a conviver com uma coluna que ninguém usa por dezoito fases.

**3. Separar os significados de filial antes ou junto da virada?** → **Antes (F57), e é o item cujo custo cresce de forma irreversível.** *A alternativa perde porque:* hoje é refatoração de tipos com o compilador de rede e zero mudança de comportamento; depois é a mesma refatoração na fronteira de autorização, em produção, com dois clientes. E o argumento decisivo é o quarto significado: o recorte de leitura não tem lugar para nascer, e se nascer dentro de `filtros/filial.ts` — cuja convenção declarada é `[] = sem recorte` — `?empresa=todas` vira chave mestra sem erro nenhum.

**4. Revogação do piso: fase perigosa própria, ou conjunção seguida de remoção?** → **Conjunção (F66) e depois remoção (F72).** *A alternativa perde porque:* concentra num único commit uma mudança que não pode ser ensaiada em `begin/rollback` contra produção, cujo rollback não é garantido pelo `statement_timeout` de 8 s, e cuja reversão tem prazo de minutos. Dividindo, a parte que introduz o predicado é reversível com calma e provada por roteiro por semanas, e a parte que apaga o piso é uma linha por policy, em lotes, com o predicado novo já medido no ar.

**5. Renomear `filiais` → `unidades`?** → **Não na tabela. Na UI, decisão adiada para o §9.** *A alternativa perde porque:* renomear é DDL instantânea, e o custo não é esse — é a falsa sensação de progresso. Depois de um `rename column` o compilador aponta os 275 arquivos e fica **mudo** sobre o `.eq('empresa_id')` que falta em cada um. E se uma view de compatibilidade `create view public.filiais …` for criada, ela precisa **obrigatoriamente** de `with (security_invoker = true)`: sem isso roda com o privilégio do dono e **bypassa a RLS de tenant**, abrindo por conveniência de transição exatamente o buraco que a fase existe para fechar.

**6. Sistema de design: fase dupla, cortado, ou enxuto?** → **Enxuto (F61).** *As alternativas perdem porque:* cortar tudo deixa `Marca` com `text-black` fixo e `WAP` no JSX, e deixa `components/admin/` e `components/relatorios/` isentos da régua **por construção** — os dois diretórios onde a UI de tenant vai nascer e onde vive a superfície do visualizador. Duas fases inteiras incluem a decomposição de quatro componentes gigantes que não são pré-requisito de isolamento nenhum.

**7. Trocar o aplicador de migrations em produção?** → **Não. Trava de hash sem dependência (F46), e a dívida A fica registrada como aberta.** *A alternativa perde porque:* `supabase db push` **já é proibido por escrito** e a CLI local aponta para o ensaio — não há ferramenta insegura para trocar; o ledger é furado porque o MCP grava timestamps, e um aplicador novo cria um **quarto** esquema de identificação em vez de conciliar os três; e `pg` **não está no `package.json`**, o que faria a fase violar a decisão 4. O `migrations.lock.json` + teste Vitest entrega a parte que importa (migration aplicada não se edita) a custo zero.

**8. Reescrever as 12 policies de escrita para o padrão içado, como "ensaio"?** → **Não. Só a trava (F59).** *A alternativa perde porque:* o ensaio não está na reescrita, está na trava — `policies-initplan.test.ts` impede o antipadrão de nascer sem tocar uma policy de produção. A `0107` mediu −45% numa policy de **escrita**, que toca poucas linhas, num sistema de nove usuários: são milissegundos. Reescrever autorização em produção por valor pedagógico é risco sem retorno.

**9. `p_filiais smallint[]` obrigatório quebra o `estoqueForaDasColunas`?** → **Quebraria se feito ingenuamente; a RPC nova tem dois níveis via `grouping sets`.** *A alternativa perde porque:* "consolidado = a soma do array que eu passei" faz o número de divergência virar sempre 0 e mata em silêncio uma feature declarada da F44 — e o teste correspondente passaria, com a tela mentindo.

**10. Filtrar `buscarEstornosAteData` por filial?** → **Não.** *A alternativa perde porque:* `estornar_movimentacao_com_itens` grava a filial **ATUAL do ativo** (`0122:205-219`), não a da movimentação estornada. Um ativo que saiu na Matriz, foi transferido para a Serra e teve a saída estornada gera estorno com `filial_id = Serra`; filtrar apagaria silenciosamente a marca "estornada" no relatório da filial de origem. O comentário do código já diz isso.

**11. Criar `lanc_item_ordem_lista_idx`?** → **Não; consertar o harness.** *A alternativa perde porque:* os 708 ms que motivam o índice foram medidos sobre um `SELECT` **sem `WHERE` nenhum** (`medir-itens.mjs:687-695`), forma que a tela nunca emite — a tripla completa só é pedida junto com igualdade em `item_id` e `filial_id`, e `lanc_item_item_filial_idx` já serve. Enquanto o harness medir uma forma que o app não produz, vai continuar produzindo conclusões falsas nas duas direções.

**12. Ligar `force row level security`?** → **Não; vira regra escrita.** *A alternativa perde porque:* em `profiles` derruba o sistema com 42P17 em toda leitura, para todo mundo ao mesmo tempo (`papel_atual()` lê `profiles`, a policy de `profiles` chama `papel_atual()`, e o ciclo só não fecha porque a função roda como dono). Em `ativos`, `pendencias_item` e `movimentacoes` quebra `aplicar_movimentacao` e o trigger da `0051`, que escrevem fora de policy contando com o bypass do dono. Com `membros` (decisão 6) o motivo dobra: as funções de conjunto leem `membros` e são chamadas pela policy de `membros`.

**13. Aposentar a mesa de conflitos entre filiais?** → **Não decidir agora; registrar a disputa.** *A alternativa perde porque:* dois documentos internos discordam — o `PLANO-PRODUTO-MULTIEMPRESA.md:57` (14/08) diz "WAP-ismo, não nasce no produto"; o `SYSTEM-DESIGN-ACERVO-2026-08-31.md:352` (31/08, mais recente) diz "com planilhas reais de terceiros a probabilidade de precisar dela é alta; o desenho existe e está provado, não jogue fora". Um plano não resolve sozinho uma decisão de produto que dois documentos disputam, e ela depende de um dado que ninguém tem: como são as planilhas do primeiro cliente. **Entrega concreta:** ata em `DECISOES.md` nomeando os dois documentos e as duas conclusões, e uma linha no bloco da F24 do `CLAUDE.md` apontando para ela — hoje o `CLAUDE.md` descreve a mesa em três parágrafos e **não tem ponteiro nenhum** para a discussão. O que vale em qualquer desfecho está na F65/F67.

**14. Converter enum para `text + CHECK`?** → **Não.** *A alternativa perde porque:* o argumento é bom (`alter type … add value` não pode ser usado na mesma transação que o cria, e o projeto pagou isso três vezes), mas os enums estão em produção com 126 migrations de história, views e funções dependentes. Registre a lição no runbook; não faça a conversão.

**15. Copiar `e_membro(empresa_id)` do repositório irmão?** → **Não.** *A alternativa perde porque:* é o único ponto em que o WAP está **à frente** do Acervo — lá as 25 policies usam o predicado avaliado por linha, e a auditoria içável estava planejada numa fase que nunca rodou. A `0107` do próprio WAP já mediu a diferença (`cost=164.50 → 89.76`) numa policy de **escrita**; em policy de **leitura** sobre `ativos` seria uma chamada plpgsql `security definer` por linha, em toda página, num Supabase Free. `policies-initplan.test.ts` (F59) existe para tornar isso impossível.

**16. `ignoreCommand` do `vercel.json` como gate?** → **Não; required checks (decisão 8).** *A alternativa perde porque:* é mecanicamente errado — o `ignoreCommand` é avaliado **uma vez**, no push, e sair 0 significa "não construa este commit"; a Vercel não reavalia. Um script que sai 0 enquanto o CI não terminou **cancela** o deploy daquele commit para sempre, não o adia. E fica dito, sem fingir cobertura: o required check mora fora do repositório e **nenhuma trava interna impede que o desliguem no painel**.

**17. `diff -u` estrito de `database.ts`?** → **Não; comparação por conjunto.** *A alternativa perde porque:* `PostgrestVersion` vem do servidor; o arquivo já foi editado cirurgicamente à mão de propósito (`DECISOES.md:448`); e produção tem objeto que nenhuma migration cria. Um passo de CI que falha por motivo legítimo é desabilitado na terceira vez.

**18. `profiles.empresa_id` ou tabela `membros`?** → **`membros`, com o cargo dentro dela (decisão 6 do Johnny).** *A alternativa perde porque:* `profiles.empresa_id` + cargo global não representa `@stefanini.com` sendo admin na WAP e consulta num segundo cliente — e esse é o modelo dominante do mercado que este produto vai encontrar, **já dentro do sistema hoje**. O argumento de que "trocar depois é uma função" é falso: `papel` mora em `profiles` (`0061:63`), e migrá-lo depois toca `papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()`, `pode_escrever_filial()`, as 5 RPCs de gestão, `handle_new_user`, `operador_filiais` e as 54 policies. O preço de fazer certo é a F62 ser a fase mais pesada da virada; o preço de fazer depois é fazer isso com clientes dentro.

**19. Onde nasce o roteiro de isolamento?** → **O esqueleto na F48** (grants espelhados, convenção de honestidade, varreduras schema-wide, que valem hoje); **os cenários A↔B na F62.** *As alternativas perdem porque:* escrevê-lo inteiro na preparação produz um `✓` vazio com uma empresa — falsa segurança, que é o defeito que ele existe para evitar. Escrevê-lo só na virada perde as varreduras que já valem e a maquinaria de grants, que é a parte trabalhosa.

**20. Mover os objetos do bucket `termos` para prefixo de tenant?** → **Não; fechar pelo join com `termos_gerados`.** *A alternativa perde porque:* obrigaria a mover N objetos de produção com `arquivo_path` casado por **igualdade de string**, e a janela em que o par path↔linha fica quebrado é exatamente a que desarma a proteção de escrita (`coalesce(…, true)`). Para `backups-import` vale o oposto e por motivo verificável: lá o caminho é artefato de operação passada e `import_logs.backup_path` guarda o literal, então os antigos continuam resolvendo — por isso ele ganha prefixo e o `termos` não.

---

# § 9 — O que fica deliberadamente de fora, e por quê

Um plano que só acrescenta é covarde. Estes itens apareceram no dossiê, têm mérito, e **não entram** — cada um com o motivo e o destino.

**Backlog PATCH (entregas avulsas, para as tardes entre fases — nenhuma destrava a virada nem fica mais cara por causa dela):**

- **A decomposição de `PassoMovimentacao` (29 props, 10 callbacks).** Dívida real de manutenção e testabilidade. Se for feita, o contexto para o estático nasce em `nova/contexto.tsx`, **nunca** dentro de `nova/config.ts` — que é módulo puro testado e viraria dependente de React (a armadilha do `checklist-lote.ts`, registrada no `CLAUDE.md`). E `validarLote` extraída como função pura **antes** de mexer nas props.
- **`nova-compra-form.tsx` (1.412 linhas, 32 `useState`) e `importar-wizard.tsx` (1.041, 13 `useState`).** O que vale sozinho é extrair `camposObrigatoriosFaltando()` e `ORDEM_CAMPOS_OBRIGATORIOS` para `src/lib/ativos/obrigatorios.ts` — hoje elas decidem o foco num formulário de 1.412 linhas **sem teste nenhum**. **Não** mexer no `agoraRascunho`: a divergência com o wizard é decisão documentada (congelar no instante da LEITURA vs. da MONTAGEM), e a guarda `&& agoraRascunho` já impede o "salvo há 56 anos".
- **A régua de layout nos outros prefixos.** A F61 destrava `admin/` e `relatorios/`; os demais ficam nomeados, com motivo escrito e catraca. Converter 100+ arquivos legados não é pré-requisito de isolamento.
- **A máquina de rascunho unificada.** A terceira cópia (`conferencia-estoque.tsx:147-159`) perdeu debounce e flush — mas o efeito real é uma serialização JSON por tecla, não perda de dado (a gravação é síncrona). O que a F61 leva é só o `chaveDoEscopo`.

**Recusados por conflito com decisão registrada:**

- **Migrar os formulários para react-hook-form.** É verdade que são duas dependências para **um** uso (`editar-ativo-dialog.tsx:101`) e que esse único uso **não passa `zodResolver`** (zero ocorrências em `src`). Mas migrar `nova-compra-form` sem teste de interação é trocar dívida por risco, e o repositório irmão — que teve a chance de fazer melhor do zero — produziu um formulário de 1.314 linhas com 24 `useState`. Não é colheita. **Vale apresentar as duas opções sobre a dependência** (adotar de verdade ou remover), porque remover dependência aprovada também é decisão sua.
- **Trocar o `<datalist>` por listbox própria.** `campo-colaborador.tsx:24-28` registra por escrito: trocar por Popover/Command mexeria no Enter do wizard, que *"tem história — aceitar a sugestão com Enter no Chrome dispara o keydown da página e pularia direto para a Revisão"*. E são **três** implementações, não duas. O que vale, se algum dia: fundir as duas de `datalist`.
- **Mudar a semântica do consolidado** (toda movimentação contando em uma unidade só, como no repositório irmão). O WAP conta transferência nas **duas** filiais, deliberadamente, e há treze meses de relatórios congelados com esses números. Mudar isso reescreve o passado.
- **Trocar a busca de `/ativos` para prefixo.** Desfaz explicitamente a correção da F27/B5, que existe porque colar a service tag na busca devolvia vazio. Ou se habilita `pg_trgm` (extensão nativa, R$ 0, mas exige aprovação registrada), ou não se mexe.

**Recusados por serem do piloto, não da preparação:**

- **Supabase Pro, SMTP próprio, WAF, projeto de ensaio persistente.** Aparecem uma vez, na F73, e em lugar nenhum antes. A regra de R$ 0 vale para as 28 fases.
- **jsdom, `@testing-library/*`, `@vitejs/plugin-react`.** Grau 2 do teste de componente. Vira proposta escrita depois do piloto.
- **Agregador de erro (Sentry ou similar).** Num sistema de nove usuários, alerta por taxa de erro nunca dispara; o que falta é sonda sintética, e a F55 a entrega com `instrumentation.ts` + `/api/saude` + smoke agendado, a custo zero.
- **Custom claims de empresa no JWT.** A ideia é boa (`auth.jwt()->>'empresa_id'` é grátis; ler `membros` é uma leitura por statement) e a **decisão** precisa estar escrita antes da primeira policy com `empresa_id` — está: as funções de conjunto leem a tabela, porque revogação valendo no request seguinte é propriedade que um multiempresa não pode perder. A **implementação** por claim é mexer no mecanismo de sessão de um sistema em uso diário, e a premissa "o Free já oferece ES256/RS256 e a troca é de configuração" tem de ser **conferida no painel** antes de virar plano (regra 6 do `CLAUDE.md`). Fica documentada como otimização pós-piloto.
- **Parametrização dos 7 modelos `.docx`** (decisão 7). Vira fase própria depois do piloto, e o §10 lista as quatro perguntas que ela precisa responder.

**E a última coisa, que é onde eu discordo do enunciado do próprio pedido.** Você pediu preparação que melhore o sistema "ao máximo". Este plano entrega preparação que torna a virada **segura** e que paga dívida cujo custo **cresce** com ela. Preparar ao máximo é o inimigo do plano: empilha no caminho crítico trabalho real que não destrava nada, e a fase que trava é sempre a que ninguém previu.

Se em algum momento a preparação precisar encolher, **a ordem de corte é**: F61 inteira (dói na F70, mas é dor de esforço, não de correção) → as partes de desempenho da F60 (mantendo `p_filiais` obrigatório, `cap` obrigatório e o keyset, que são o ensaio) → a segunda metade da F56 (mantendo o bloqueante honesto e os tetos derivados).

**Nunca corta:** F45 (sem portão, todo o resto é documentação), F46 (sem a trava de hash, a fila de vinte migrations é o vetor de erro mais caro), F51 (sem ela, cada guarda é outra cópia de ~400 linhas), F52 (uma condição fecha cinco RPCs de *takeover* de conta), F54 na parte dos `.docx` (o "backup obrigatório" é incompleto por construção, e isso é uma promessa falsa impressa na tela), F57 (o único item cujo custo cresce de forma irreversível) e F59 (a régua que decide a forma de 54 policies).

E se for para **acrescentar** uma coisa só, seria o injetor de mutações da F47 — é o único mecanismo deste plano que prova que os outros mecanismos funcionam.

---

# § 10 — Pendências que continuam suas

Perguntas que o plano não pode responder sozinho, agrupadas pelo momento em que travam alguma coisa.

**Antes da F70 (a UI multiempresa):**

1. **"Filial" vira "unidade" no rótulo que o cliente lê?** Custo medido: 519 ocorrências de "filial/filiais" nas 5.914 linhas de conteúdo de ajuda (549 em `src/lib/ajuda/` inteiro), cobertas por **424 asserções `toContain` de frase literal** em dois níveis. Recomendação: não trocar; se trocar, é fase própria.
2. **As ~5.900 linhas de conteúdo de ajuda** descrevem "filial" como escopo e citam Matriz e Linhares por nome. Elas são reescritas, congeladas como "ajuda da WAP" (invisível a outros clientes), ou o primeiro cliente opera sem ajuda?
3. **"Desenvolvido por vmatusita"** no login e na sidebar de todo cliente: fica, sai, ou vira acordo comercial por cliente? (A F61 torna parametrizável; a escolha é sua.)
4. **`/versoes`**: a recomendação da F71 é torná-la página do provedor, visível só a `e_plataforma()`. Confirma?

**Antes do piloto (F73):**

5. **Empresa é a razão social ou a marca?** O termo diz FRESNOMAQ, o sistema se chama WAP, e as duas coisas vão para campos diferentes de `empresas` — o plano prevê os dois campos, mas quem preenche o quê é sua decisão.
6. **A mesa de conflitos entre filiais** (§8, item 13): decidir com a planilha do primeiro cliente na mão.
7. **Retenção**: quanto tempo guardar `import_logs.correcoes`, `eventos_admin.detalhe`, os snapshots e os backups de import? Hoje a resposta é "para sempre".

**Quando os termos voltarem à pauta (pós-piloto):**

8. O termo de um cliente sai com a razão social, o CNPJ, o logotipo e o foro **dele**, ou o produto entrega um modelo genérico e o cliente assume o risco jurídico? (Lembrando que a despersonalização é maior do que parece: **"WAP" está fixo nos sete modelos, cabeçalho incluído** — não basta trocar "FRESNOMAQ".)
9. Se sair com os dele: os modelos saem de `src/templates/` para um bucket de Storage por empresa (bucket novo, policy nova, `outputFileTracingIncludes` fora, e a trava `modelos-docx.test.ts` morre), ou cada cliente ganha um build? Quem edita os modelos — você, por script, como a F25/F39 fizeram, ou o cliente?
10. Logotipo por empresa exige o *image module* do docxtemplater: o oficial é **pago**, o `-free` é MIT. Aprova a dependência MIT, aceita termo sem logotipo, ou entra o módulo pago?
11. `{pulsus}` é o MDM da WAP e está cravado no modelo de celular. Vira tag genérica (`{mdm}`), vira dado da empresa, ou some?

---

# § 11 — Mapa das fases

| Fase | Nome | Bloco | Toca produção? |
|---|---|---|---|
| F45 | O portão fecha, e o teste de componente ganha piso | A | não |
| F46 | A trava de hash das migrations e o CI de banco sem Docker | A | não |
| F47 | O injetor de mutações e o gate de deriva | A | migration aditiva |
| F48 | Os catálogos de segurança | A | não |
| F49 | A fronteira do servidor | B | código |
| F50 | A fronteira da leitura | B | migration aditiva |
| F51 | A decomposição da RPC de import | B | `create or replace` |
| F52 | As guardas de escopo no-op | B | `create or replace` |
| F53 | A ordem exata das movimentações | C | **backfill com janela** |
| F54 | O backup deixa de mentir, e a restauração é ensaiada | C | código + Storage |
| F55 | Observabilidade, sonda e alarme de integridade | C | migration aditiva |
| F56 | O import sem WAP-ismo e sem bomba | C | migration aditiva |
| F57 | Os quatro significados de filial, e o fim do fail-open | D | código |
| F58 | A fronteira tipada do banco | D | código |
| F59 | A doutrina do predicado, escrita e travada | D | não |
| F60 | O recorte que corta scan, e o custo do caminho quente | D | RPCs + índices |
| F61 | Os pontos de injeção da UI | D | código |
| — | **FRONTEIRA** | | |
| F62 | A raiz do tenant e o cargo por empresa | virada | **estrutura + backfill de cargo** |
| F63 | `empresa_id` no acervo (lote 1) | virada | aditiva |
| F64 | `empresa_id` no vocabulário e na infra (lote 2) | virada | aditiva |
| F65 | Integridade estrutural do tenant | virada | constraints + índices |
| F66 | As policies ganham o recorte, em conjunção | virada | 54 policies (inerte) |
| F67 | Escrita, definer, Storage e Realtime por tenant | virada | funções + Storage |
| F68 | A porta pública por empresa | virada | rotas + RPCs |
| F69 | Identidade e governança de contas por empresa | virada | trigger + admin |
| F70 | A camada de UI multiempresa | virada | código |
| F71 | Os documentos alcançam o sistema | virada | docs |
| F72 | A revogação do piso de leitura | virada | **janela combinada** |
| F73 | O piloto | virada | segundo cliente |

**Dezessete fases de preparação. Onze de virada. Uma fronteira, no fim da F61, a partir da qual nada do que veio antes foi desperdiçado.**

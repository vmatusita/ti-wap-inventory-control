# F41 — o motor: o item para de bloquear e passa a falar a língua do ativo

Ordem de serviço autônoma (ultracode) para executar a **§5** de
[`docs/PLANO-ITENS.md`](../PLANO-ITENS.md). A **F42** (as telas) é ordem separada — o próprio plano
fatia assim, na decisão **J4**: *"Cada uma fecha sozinha, com versão e tag."*

Escrita em 31/08/2026, com as quatro decisões do Johnny (§3 do plano) já tomadas e o rollout **até
produção** confirmado por ele nesta data.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a ordem F41 do plano `docs/PLANO-ITENS.md` (§5, "o motor"): três migrations, as funções
puras, as actions e o texto — para que marcar "Voltou" no checklist de uma devolução NUNCA derrube
o lote, o operador cadastre item no meio do fluxo, e nenhuma tela ofereça dois nomes para a mesma
coisa. Ao final: as migrations aplicadas em ensaio E em produção pelo `docs/RUNBOOK-BANCO.md`,
`lint`/`test`/`contraste`/`build` verdes, versão 1.46.0 publicada com tag `v1.46.0`, fase mergeada
na `main`,
deploy no ar e smoke reexecutado. O redesenho das telas de `/itens` é a F42 e NÃO entra aqui.

# Contexto
- **Leia `@docs/PLANO-ITENS.md` INTEIRO antes de escrever qualquer código.** Ele é a fonte de
  verdade desta ordem: §1 as quatro dores medidas, §2 o diagnóstico de cada uma, §3 as quatro
  decisões do Johnny, §4 o desenho novo (§4.1 o vocabulário, §4.2 as duas camadas do cadastro
  passivo, §4.3 o que sai da tela), §5 as frentes A–D e o checklist de aceite, §7 os não-objetivos
  declarados, §8 os riscos e as travas da casa, §9 as contagens de referência de hoje, o Apêndice A
  com o caso do print passo a passo e o Apêndice B com o mapa de arquivos. Onde este prompt e o
  plano divergirem, vale ESTE PROMPT — e registre a divergência em `docs/DECISOES.md`.
- `@CLAUDE.md` manda em tudo o mais: o modo autônomo (09/07/2026), as 8 regras permanentes — a
  **regra 8 é a versão, e ela não se reinterpreta** —, a stack fechada, o modelo de acesso e as
  convenções.
- `@docs/RUNBOOK-BANCO.md` é o procedimento de banco desta casa e ele NÃO se improvisa: migration
  nova numerada (nunca editar uma aplicada), rollback escrito no rodapé ANTES do apply, **ensaio
  primeiro** (`sgmvldiizsrjbxzzpmhh`) e produção depois (`pbtjcalbmepmrqzprusb`), tudo por MCP
  Supabase (`apply_migration` / `execute_sql` / `list_migrations` / `get_advisors`), verificação
  pós-apply (assinatura, grants, contagens antes = depois), `notify pgrst, 'reload schema';` quando
  muda assinatura de RPC, TODOS os roteiros de `supabase/tests/*.sql` quando se mexe em função ou
  trigger, e o SQL SEMPRE antes do deploy da Vercel.
- `@docs/ESPECIFICACAO.md` (§4, §5, §6, §8 e o glossário) e `@docs/MATRIZ-REGRAS.md` são o contrato
  do domínio: mudou a regra, eles mudam no MESMO commit.
- **O modelo a espelhar existe, é da própria casa e é de três dias atrás: a F37/D5**, o cadastro
  híbrido de colaborador. Leia e siga o padrão: `supabase/migrations/0112`–`0115`,
  `src/lib/colaboradores/chave.ts` + `chave-sql.test.ts` (a guarda TS↔SQL) e
  `src/components/movimentacoes/nova/campo-colaborador.tsx`. A camada 1 da F41 (§4.2 do plano) é o
  espelho EXATO disso para `itens` — não invente uma segunda maneira de fazer a mesma coisa.
- Comandos do projeto: `npm run lint` · `npm run test` · `npm run build`.
- **Não existe teste de componente neste repositório:** `vitest.config.mts` roda em ambiente `node`
  e só inclui `*.test.ts`; `.test.tsx` não entra na suíte e não há biblioteca de render. Vitest aqui
  é para FUNÇÃO PURA. Não tente contornar isso — o que precisa de prova de comportamento no banco
  vira roteiro SQL em `supabase/tests/`.

# Primeiro passo obrigatório: revalidar a linha de base
Antes de mudar uma linha:
1. Rode `npm run lint`, `npm run test`, `npm run contraste` e `npm run build` — os quatro que o job
   `verificar` do CI roda. Se algum já estiver vermelho ANTES da sua primeira mudança, registre
   exatamente quais falhas são pré-existentes: não as conserte e não as piore.
2. Reproduza, por `SELECT` só-leitura em PRODUÇÃO via MCP, as contagens de `§9` do plano (58
   lançamentos, 0 com `movimentacao_id`, 30 pares com lançamento, 22 com estoque, 4 com saída em
   aberto, 5 reservas abertas, 22 itens, 14 pendências, 264 unidades). **Nenhum nome, nenhum
   patrimônio — só contagem** (regra 2 do `CLAUDE.md`). Se algum número divergir, ATUALIZE o plano
   com a data e siga: ele foi medido em 31/08/2026 e pode ter envelhecido.
3. Confirme, por `SELECT`, que os itens do catálogo continuam SEM colisão sob a chave nova
   (`item_chave`) — o plano afirma zero colisões, e um índice único que falha ao criar trava a
   migration. Se houver colisão, resolva-a ANTES (ata em `docs/DECISOES.md` dizendo qual foi o
   critério) e só então crie o índice.
4. Leia do BANCO, com `pg_get_functiondef`, os corpos vigentes de `criar_movimentacao_com_itens`,
   `resolver_pendencias_item_com_lancamentos`, `estornar_movimentacao_com_itens` e
   `valida_lancamento_item`, e guarde o `md5` de cada um. É deles que partem as recriações.

# Escopo
Dentro:
- **Frente A — banco.** As três migrations de `§5` do plano, com o rollback no rodapé de cada uma:
  `0125_item_chave_e_regularizacao.sql` (a função `public.item_chave(text)` `immutable`, espelho de
  `colaborador_chave`; `itens.nome_chave` gerada + índice único; `itens.criado_por`; a policy de
  INSERT de `itens` passando para `pode_escrever()`; `lancamentos_item.regularizacao boolean not
  null default false`), `0126_lancamento_regulariza.sql` (recria `criar_movimentacao_com_itens` e
  `resolver_pendencias_item_com_lancamentos` com a partição da quantidade; cria `lancar_itens_lote`,
  o avulso transacional que hoje é um `for` de INSERTs — e ele nasce COM a mesma partição, porque a
  §4.2 do plano é explícita: "a regra é a mesma nos dois caminhos, senão nascem dois comportamentos")
  e `0127_conversao_reservas.sql` (a conversão única e só-INSERT das reservas abertas + a checagem
  `reserva_aberta` em `dev_checagens_integridade` — que hoje tem DEZ checagens, porque a `0110`
  acrescentou `detentor_em_estado_sem_dono`; logo a sua é a **décima primeira**, e o catálogo curado
  `CHECAGENS`/`TOTAL_CHECAGENS` de `src/lib/queries/dev.ts` entra no MESMO commit, senão `/dev`
  mostra a chave crua).
- **Tipos gerados:** `npm run db:types` logo depois do apply em ENSAIO (a Supabase CLI local está
  linkada ao ensaio), com `src/lib/types/database.ts` commitado. Sem isso, `nome_chave`,
  `criado_por`, `regularizacao` e a RPC `lancar_itens_lote` não existem para o TypeScript e o
  `npm run build` cai.
- **Frente B — funções puras** em `src/lib/itens/`: `chave.ts` + `chave-sql.test.ts`,
  `regularizacao.ts` (a partição da quantidade e os textos prontos da observação) com teste caso a
  caso, `estorno.ts` (`planejarEstorno` passa a planejar o inverso do ajuste de regularização),
  `escolha-tipo.ts` (4 grupos, sem a segunda pergunta) — e, FORA de `src/lib/itens/`,
  `src/lib/dominio.ts`, onde moram `TIPO_LANCAMENTO_META` e `pillTipoLancamento`. Os rótulos novos
  são os da tabela de §4.1 do plano, sem interpretação: `entrada`→**Compra**, `saida`→**Saída**,
  `retorno`→**Devolução**, `ajuste`→**Ajuste**, `reserva`→**Reserva**, `liberacao`→**Devolução de
  reserva** (estes dois últimos só no histórico, nunca na escolha), e o número `Atrelados` passa a
  chamar-se **Reservado**. A pílula de cada tipo usa a MESMA tinta do tipo correspondente do ativo.
  Não crie um segundo módulo de vocabulário.
- **Frente C — actions e fluxo:** `src/lib/actions/movimentacoes.ts` (`montarItensJunto`),
  `src/lib/actions/itens.ts` (`criarItemInline` para operador, `lancarItens` pela RPC nova),
  `src/lib/actions/pendencias.ts` ("Item recuperado"), o campo de item do fluxo ganhando
  "Cadastrar" no padrão do `campo-colaborador`, e a linha de aviso no painel de sucesso e no toast
  dizendo o que foi regularizado. Some-se a isso `src/lib/queries/dev.ts` (o catálogo curado das
  checagens) e as superfícies que HOJE exibem os rótulos velhos e que o critério 10 vai cobrar:
  `src/components/relatorios/tabela-itens-grupo.tsx`, `corpo-relatorio-v2.tsx`,
  `src/lib/relatorios/tipos.ts`, `src/lib/queries/relatorios/itens.ts`, `src/lib/actions/exportar.ts`
  e `importar.ts` — legenda é render, não dado (precedente F17): nenhuma contagem muda.
- **Frente D — texto e documentação:** `src/lib/ajuda/conteudo/` (`itens-por-quantidade.ts`,
  `lancar-itens.ts`, `mensagens-de-erro.ts`), `src/lib/actions/erros.ts`, `docs/ESPECIFICACAO.md`,
  `docs/MATRIZ-REGRAS.md`, `docs/ARQUITETURA.md` §10, `docs/DECISOES.md`, `docs/DIVIDA-TECNICA.md`,
  `docs/README.md` (o índice), `CHANGELOG.md` — e mais dois que esta fase torna FALSOS se ficarem
  como estão: `docs/ADR-002-papeis-e-permissoes.md` e o parágrafo do modelo de acesso do `CLAUDE.md`,
  que hoje afirmam que `colaboradores` é o ÚNICO cadastro em que o operador insere. A partir da F41
  são dois.
- **Roteiros SQL:** cenários novos em `supabase/tests/f38_itens_com_ativo.sql`, um roteiro novo
  `supabase/tests/f41_regularizacao.sql` e — obrigatório — o cenário **3c** de
  `supabase/tests/papeis_rls.sql`, que hoje afirma "operador recusado ao criar item" e fica VERMELHO
  no job `banco` no instante em que a policy passa para `pode_escrever()`. Inverta a asserção no
  molde do `3c-ter` (o de colaborador, da F37) e registre a ata: é o teste que muda porque a REGRA
  mudou — não para ficar verde.
- **Versão 1.46.0** (é fase → MINOR): `package.json` (só o campo `version`), entrada nova no topo de
  `src/lib/versoes/registry.ts` em LINGUAGEM DE OPERADOR, entrada no `CHANGELOG.md`, tag anotada
  `v1.46.0` publicada.
- **Rollout:** ensaio → produção → merge na `main` → deploy → smoke (ver § Banco e produção).
- O commit do próprio `docs/PLANO-ITENS.md`, que hoje está sem versionar e é a fonte desta ordem.

Fora (não toque):
- **O redesenho de `/itens` (F42 inteira).** `src/app/(app)/itens/page.tsx` e
  `src/components/itens/**` só mudam no que a mudança de RÓTULO e a chamada da RPC nova exigirem —
  nada de casco da F40, nada de tabela única, nada de `/itens/historico`, nada de encolher o diálogo
  de 876 linhas. Se você se pegar reescrevendo tela, parou de fazer a F41.
- **`valida_lancamento_item`.** As quatro guardas dela ficam de pé, incluindo a que gerou o print —
  o desenho inteiro do plano é escolher entre gravações que o banco JÁ aceita. Se a sua
  implementação precisa afrouxar o trigger, ela está errada.
- **Os valores do enum `tipo_lancamento`** (§4.1: renomear valor reescreveria a leitura de todo
  lançamento histórico) e **os nomes das colunas SQL** (`total`, `estoque`, `atrelados`).
- **`/ativos`** e o wizard de movimentação além da seção de itens; `src/components/ui/` (shadcn pela
  CLI); `src/lib/types/database.ts` a não ser por `npm run db:types`.
- Dependência nova (regra 3 do `CLAUDE.md` — custo R$ 0), `.env*` no commit, dado real em qualquer
  lugar (regra 2), `npm run db:seed` / `db:reset` / `carga` — nenhum deles roda nesta ordem.
- Os outros documentos sem versionar da pasta `docs/` (`PLANO-ESPELHO-SHAREPOINT.md`,
  `PLANO-PRODUTO-MULTIEMPRESA.md`, `ROTEIRO-ESPELHO-ENTRA.md`, `SYSTEM-DESIGN-ACERVO-2026-08-31.md`,
  `prompt-produto-f0-fundacao.md`): são de outras frentes. Não os apague, não os edite e não os
  commite. **Nunca use `git add -A` nem `git add .` — adicione por caminho.**

# Critérios de aceitação
São os 11 do `§5` do plano, mais um décimo segundo que a `§4.2` exige e o checklist de lá não
listou. Cada um com a prova que o relatório tem de carregar:
1. **O caso do print:** devolução com "Voltou" num item SEM saída em aberto grava a movimentação E o
   acerto; o lote não é recusado; o item aparece em "Itens que foram junto" na ficha do ativo.
   Provado por cenário no roteiro SQL e por um ensaio ponta a ponta no banco de ENSAIO.
2. Devolução de 2 unidades com 1 saída em aberto grava `retorno 1` + `ajuste +1`, e os três números
   fecham: `total +1`, `em estoque +2`, `em uso 0`.
3. Entrega ("Itens que vão junto") de item SEM saldo na filial grava a saída e regulariza.
4. "Item recuperado" numa pendência de item funciona sem saldo prévio.
5. **Estorno** de uma movimentação que regularizou desfaz as DUAS linhas, e a conferência interna da
   `0121` ("nenhum lançamento ficou sem estorno") passa.
6. As reservas abertas viraram saída: `reservado = 0` em todas as filiais e `total` e `em estoque`
   IDÊNTICOS antes e depois — contagem provada nos dois momentos, colada no relatório.
7. Um usuário de cargo **operador** cadastra item no meio da movimentação; item criado a partir de
   uma linha do checklist já nasce com o `tipo_id` dela. Editar/desativar/apagar item continua
   recusado a ele — prove os dois lados no roteiro SQL (policy), não só na tela.
8. Nome de item duplicado por acento ou espaço é recusado com frase em pt-BR, pelo índice único da
   chave — e a guarda TS↔SQL (`chave-sql.test.ts`) prova que os dois lados normalizam igual.
9. **Nenhum lançamento histórico alterado:** a contagem em produção é `58 + N`, com N exatamente o
   que esta fase gravou, e o `guarda_acervo` continua de pé (nenhum UPDATE, nenhum DELETE).
10. Nenhuma tela OFERECE "Liberação", "Atrelar" ou "Retorno"; o histórico antigo continua legível.
    Cole no relatório a saída de um `grep -rn` por esses três termos em `src/` e justifique cada
    ocorrência que sobrar.
11. `npm run lint`, `npm run test`, `npm run contraste` e `npm run build` verdes — são os QUATRO
    que o job `verificar` do CI roda, não três; TODOS os roteiros de `supabase/tests/*.sql` rodados
    no ENSAIO; os DOIS jobs do CI (`verificar` e `banco`) verdes depois do push; smoke reexecutado
    sem falha depois do deploy.
12. **O lançamento avulso regulariza igual ao checklist:** pela tela de itens, lançar a devolução de
    um item sem saída em aberto grava o mesmo par (`ajuste` de regularização + `retorno`) que o
    checklist grava. A `§4.2` do plano cobra isso com todas as letras — "a regra é a mesma nos dois
    caminhos, senão nascem dois comportamentos".

# Verificação — rode de verdade
Rode `npm run lint`, `npm run test`, `npm run contraste` e `npm run build` após CADA incremento,
não só no fim. Leia as falhas, corrija a CAUSA RAIZ e repita até passar. Guarde a saída real e
completa para o relatório.

**Proibido:** desabilitar, pular ou apagar teste para fazê-lo passar; afrouxar uma guarda do banco
para acomodar código que não se ajustou; marcar como esperado um erro que a fase deveria eliminar.
Se um teste existente quebrar, ele é o contrato: ou o seu código está errado, ou o teste está de
fato errado — e nesse caso NÃO o altere sem registrar em `docs/DECISOES.md` e apontar no relatório.

No banco, a verificação é outra e é obrigatória:
- **Todos** os roteiros de `supabase/tests/*.sql` rodam no ENSAIO quando se mexe em função ou
  trigger — não só o roteiro novo. Foi exatamente esse o furo da F15, contado no `RUNBOOK-BANCO.md`.
- Rode-os por MCP `execute_sql` em bloco `begin; … rollback;` que devolve **LINHAS**: o MCP engole
  `NOTICE` e `WARNING`, então nunca conclua "passou" por ausência de aviso — compare o valor real
  numa `select` final.
- Antes disso, confirme com `list_migrations` que o ensaio está com as migrations em dia.
- Depois de cada apply: `get_advisors`, a assinatura da função por
  `select p.oid::regprocedure::text …` (EXATAMENTE uma linha, sem overload), os grants
  (`authenticated=true`, `anon=false`, `service_role=false` no padrão da casa) e as contagens
  antes = depois.
- `notify pgrst, 'reload schema';` sempre que a assinatura de uma RPC mudar.
- A prova final dos roteiros é o job `banco` do CI VERDE depois do push (ele sobe um Postgres,
  aplica `0001`→última e roda cada `*.sql`). Confira com `gh run list` / `gh run watch`; se o `gh`
  não estiver autenticado, registre a pendência com essa frase exata no relatório.

# As sete armadilhas desta fase — todas já custaram caro nesta casa
1. **Corpo de partida lido do BANCO, nunca de migration antiga.** A linhagem real, conferida no
   repositório: `criar_movimentacao_com_itens` nasceu na `0116`, passou pela `0117` e foi recriada
   pela **`0123`**; `resolver_pendencias_item_com_lancamentos` existe só na **`0119`**. O plano diz
   "0117 → 0121" e "0119/0122" e está ERRADO nos dois — que é precisamente por que o corpo se lê do
   banco. Monte cada recriação a partir de `pg_get_functiondef` e registre o `md5` do corpo de
   partida no cabeçalho da migration: é a lição escrita na `0047`, repetida na `0109` e na `0118`.
2. **O que NÃO pode sair da recriação:** as duas classes de trava e a ordem entre elas (ativos
   primeiro, advisory depois), a filial derivada do ativo lido SOB A TRAVA, o bloco `exception` que
   etiqueta a linha culpada (`f38_linha` / `f38_item`), o `security invoker` declarado, a ORDEM
   TOTAL de inserção por efeito e o guard `jsonb_typeof(…) = 'number'` que a `0123` introduziu.
   Depois de
   recriar, faça o diff do corpo novo contra o corpo de partida e confira que a ÚNICA diferença é a
   partição da quantidade. Diferença a mais é bug — nesta casa isso é revisão byte a byte.
3. **A conta é feita no Postgres, dentro da RPC, depois das travas** — nunca na action. Entre ler o
   saldo no servidor e gravar, outra sessão pode mexer no mesmo par, e a partição sairia errada,
   o trigger recusaria e o lote morreria de novo, pelo mesmo motivo que estamos consertando.
4. **A RPC desta casa não redige texto** (regra do cabeçalho da `0117`): a observação da
   regularização chega pronta da aplicação, de uma função pura testada, e o `CHECK`
   `lanc_item_ajuste_obs` exige justificativa em todo ajuste.
5. **Ordem de inserção:** o ajuste positivo entra ANTES dos demais positivos — é a mesma regra que a
   `0122` já escreveu, e a ordem errada faz o trigger recusar por estoque negativo.
6. **O estorno cobra a linha a mais.** `estornar_movimentacao_com_itens` (`0121`) recusa a
   transação inteira se algum lançamento da movimentação ficou sem estorno. `planejarEstorno` tem de
   planejar o inverso do ajuste de regularização, ou o estorno passa a falhar — cenário obrigatório
   no roteiro SQL e no Vitest.
7. **A ajuda quebra sozinha — mas não pelo motivo que o plano dá.** Nenhum teste desta suíte
   importa `src/lib/actions/erros.ts`: a sincronia ajuda↔erro é MANUAL e é sua responsabilidade
   fazê-la no mesmo commit. O que quebra sozinho ao mudar rótulo são
   `src/lib/ajuda/conteudo/referencia.test.ts` e `gestao.test.ts`, que importam
   `TIPO_LANCAMENTO_META` de `src/lib/dominio.ts` e conferem o texto da ajuda contra ele. Trate os
   dois.

E duas travas de ambiente que não são armadilha, são muro:
- **`guarda_acervo` (`0081`)** recusa UPDATE e DELETE em `lancamentos_item` a todo mundo, service
  role incluso. Tudo nesta fase é INSERT — inclusive a conversão das reservas. Se a sua solução
  precisa de UPDATE numa linha de lançamento, ela está errada; encontre a que é só-INSERT.
- **O gate do modo automático:** DDL cujo corpo contenha `delete from public.ativos` ou
  `delete from public.movimentacoes` é BLOQUEADO, em qualquer projeto. Nada desta fase precisa
  disso. Se um corpo lido do banco trouxer uma dessas linhas, não insista: é o caminho B do
  `RUNBOOK-BANCO.md` (SQL de handoff em `scratchpad/` para o Johnny rodar no SQL Editor) — escreva
  o handoff, registre a pendência e siga com o resto.

# Banco e produção — o rollout, na ordem
O Johnny autorizou o rollout completo nesta run (31/08/2026). A ordem é esta, e ela não se inverte:
1. **Ensaio** (`sgmvldiizsrjbxzzpmhh`): aplique `0125`, `0126` e `0127`; rode `npm run db:types` e
   commite `src/lib/types/database.ts`; rode TODOS os roteiros de `supabase/tests/*.sql`; faça o
   ensaio ponta a ponta dos critérios 1 a 5 e 12 com dados FICTÍCIOS; confira contagens.
2. **Produção** (`pbtjcalbmepmrqzprusb`): antes de qualquer escrita, exporte para `scratchpad/` as
   linhas das reservas abertas e as contagens de referência (`scratchpad/` é ignorado pelo git por
   construção). Aplique `0125` e `0126`, verifique, e só então a `0127`. Confira contagem por
   contagem que `total` e `em estoque` de cada par ficaram IDÊNTICOS aos de antes — é a prova de que
   a conversão não moveu estoque. `notify pgrst, 'reload schema';` ao final.
3. **A janela entre o SQL e o deploy é o risco real:** entre aplicar a `0126` em produção e o deploy
   do código novo, a aplicação NO AR ainda chama a assinatura antiga. E cuidado com o atalho óbvio:
   em Postgres, `create or replace` com lista de argumentos diferente NÃO substitui — cria uma
   SOBRECARGA, exatamente o que o `RUNBOOK-BANCO.md` proíbe e o que a verificação pós-apply
   ("EXATAMENTE 1 linha") reprova. Portanto **mantenha a assinatura idêntica**: o payload de itens já
   é `jsonb` e comporta a linha crua e a observação pronta sem parâmetro novo. Se mudar a assinatura
   for mesmo inevitável, `drop function` + `create` na MESMA transação, com os grants reaplicados,
   aplicado imediatamente antes do merge — e a decisão registrada.
4. **Só então** merge na `main` + push + tag `v1.46.0` — é o push que dispara o deploy da Vercel.
5. **Depois do deploy:** `node scripts/smoke/smoke-prod.mjs`, e cole a saída no relatório. Confira
   também as ONZE checagens de integridade em `/dev` — a nova, `reserva_aberta`, tem de responder
   zero.

Se algo der errado em produção, o `RUNBOOK-BANCO.md` tem o rollback por molde — use-o, corrija você
mesmo e registre. Não deixe produção num estado intermediário em silêncio.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. **Não pare para perguntar e
não espere confirmação em nenhuma hipótese** — o `CLAUDE.md` registra esse modo desde 09/07/2026,
inclusive para migration e produção.

Régua de decisão: (1) este prompt; (2) `docs/PLANO-ITENS.md`; (3) `CLAUDE.md` e a hierarquia de
documentos-fonte dele (spec → planejamento → migrations); (4) as convenções do código existente;
(5) restando ambiguidade, a opção mais simples e reversível. Toda decisão não-óbvia vai para
`docs/DECISOES.md` no formato da casa (data · contexto · escolha · alternativas · motivo).

Se a mesma falha persistir depois de ~3 tentativas, MUDE DE ABORDAGEM em vez de repetir, e registre
a troca. Bloqueio real (MCP fora, credencial ausente): contorne se for seguro; se não for, siga com
o resto do escopo, escreva o SQL de handoff quando o bloqueio for de banco, e registre a pendência
com o que falta para resolvê-la. Nunca deixe a ordem pela metade em silêncio.

O `CLAUDE.md` diz "se a estrutura real divergir, PARE e reporte". Nesta run ninguém recebe o reporte
em tempo real: registre a divergência em `docs/DECISOES.md`, adapte e siga — exceto se ela tornar o
escopo inteiro sem sentido, e aí sim pare e explique no relatório.

## Decisões já tomadas pelo Johnny (31/08/2026) — registre as seis em DECISOES.md
1. **J1 — um par só, com as palavras do ativo.** Compra · Saída · Devolução · Ajuste (+
   Transferência). O par Atrelar/Devolução-de-chamado sai da tela e continua legível no histórico,
   onde passa a ler-se **Reserva** e **Devolução de reserva**. Os números viram Total · Em estoque ·
   Em uso, e a coluna `Atrelados` vira **Reservado**.
2. **J2 — regulariza sozinho e avisa.** O sistema grava um acerto de contagem com justificativa
   automática, amarrado àquela movimentação, e segue. NUNCA bloqueia o registro do equipamento.
3. **J3 — o redesenho de `/itens` é a F42**, no padrão de `/ativos`. Não antecipe nada dele aqui.
4. **J4 — duas ordens.** Esta é a do motor; a das telas vem depois, com versão e tag próprias.
5. **Rollout completo nesta run**, até produção, incluindo a conversão das reservas abertas — com
   backup e contagens antes/depois, no padrão do `RUNBOOK-BANCO.md`.
6. **A conversão das reservas é irreversível por construção** (só-INSERT, e o `guarda_acervo` proíbe
   apagar lançamento). Ele sabe disso e aprovou: o efeito no estoque é zero, e o que muda é o
   caminho de fechamento. Registre a ata dizendo isso com todas as letras.

# Git e segurança
- Trabalhe na branch `f41-motor-itens`, com commits pequenos e frequentes, em pt-BR, estilo
  conventional: `feat(f41): a partição da quantidade dentro da RPC`.
- O primeiro commit inclui `docs/PLANO-ITENS.md` (a fonte desta ordem, hoje sem versionar) e este
  arquivo de prompt. Adicione **por caminho** — nunca `git add -A`, nunca `git add .`: há outros
  documentos sem versionar na pasta `docs/` que são de outras frentes.
- Ao final, com os quatro comandos verdes, o banco aplicado nos dois projetos e o checklist
  autoverificado item a item: mergeie na `main`, faça push e publique a tag `v1.46.0` — é o fluxo do
  modo autônomo deste repositório.
- **NUNCA:** `git push --force`, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de
  commit que não é seu, commitar `.env*` ou `node_modules`, rodar `npm run db:seed`,
  `npm run db:reset` ou `npm run carga`.
- Segredo nenhum entra em prompt, log, relatório ou commit. O `.env.local` deste repositório aponta
  para PRODUÇÃO: não o edite e não o use para nada além do que o próprio projeto já faz.

# Como trabalhar
1. **Explorar em paralelo, com subagentes** (o contexto principal fica limpo; cada um volta só com
   resumo): (a) revalidar a linha de base — comandos + as contagens de §9 em produção, só-leitura;
   (b) ler do banco, por `pg_get_functiondef`, os quatro corpos vigentes e registrar os `md5`;
   (c) mapear o caminho do checklist até a RPC (`itens-do-lote.ts` → `montarItensJunto` → RPC) e o
   caminho da pendência de item; (d) ler o modelo F37/D5 (`0112`–`0115`, `chave.ts`,
   `chave-sql.test.ts`, `campo-colaborador.tsx`) e resumir o padrão a espelhar; (e) inventariar TODO
   texto — tela, ajuda, erros, spec, matriz — que cita "Liberação", "Atrelar", "Retorno" ou
   "Atrelados".
2. **Planejar:** escreva `docs/PLAN-F41.md` autossuficiente — arquivos e interfaces nomeados, o
   fora-de-escopo declarado, a verificação de ponta a ponta no fim. Ele sobrevive à compactação e
   vira o gabarito da revisão adversarial.
3. **Implementar em quatro etapas, NESTA ordem, cada uma com os quatro comandos verdes antes de
   seguir:** (A) banco em ensaio; (B) as funções puras com seus testes; (C) actions e fluxo;
   (D) texto, documentação e versão. A etapa A só fecha com `npm run db:types` rodado e o
   `database.ts` commitado. Não trabalhe em worktrees paralelas: as quatro frentes tocam
   os mesmos arquivos, e o custo da colisão é maior que o ganho.
4. **Verificar adversarialmente, com DOIS subagentes em contexto fresco:** o primeiro revisa o diff
   inteiro contra `docs/PLAN-F41.md` e os 11 critérios; o segundo revisa **só o diff das migrations,
   byte a byte, contra os corpos lidos do banco** — é o risco nº 1 do plano, e ele merece um par de
   olhos que não escreveu o código. Instrução dos dois: apontar apenas lacunas de correção ou de
   requisitos declarados, não preferências de estilo. Corrija e re-revise até limpar. Se um deles
   apontar que uma guarda do banco foi afrouxada ou que uma trava sumiu da RPC, é BLOQUEANTE.

# Relatório final
Escreva `docs/RELATORIO-F41.md` em pt-BR, com EVIDÊNCIAS e não afirmações:
- o que mudou, por arquivo, e por quê;
- **a tabela das contagens**: as medidas de §9 do plano ANTES e DEPOIS, em produção, com o SQL que
  as produziu — é a prova dos critérios 6 e 9;
- o `md5` do corpo de partida de cada função recriada e o diff que mostra que só a partição entrou;
- a saída real e completa de `npm run lint`, `npm run test`, `npm run contraste` e `npm run build`;
- a saída dos roteiros SQL no ensaio, e o estado dos dois jobs do CI (`verificar` e `banco`);
- o ensaio ponta a ponta do caso do print (Apêndice A do plano), passo a passo, com o resultado;
- a saída do smoke pós-deploy e o estado das onze checagens de `/dev`;
- o `grep` do critério 10, com a justificativa de cada ocorrência remanescente;
- as decisões registradas em `docs/DECISOES.md` (aponte, não repita);
- pendências, dívidas novas em `docs/DIVIDA-TECNICA.md` e o que fica para a F42;
- próximos passos sugeridos.

Termine a resposta final com um resumo de 5 linhas em pt-BR: o que entrou, o estado dos quatro
comandos, o que foi aplicado em cada banco, o que ficou pendente e a versão publicada.

# Idioma
Narrativa, plano, decisões, relatório, ajuda e commits em pt-BR. Identificadores de domínio em
português sem acento (`ativo`, `movimentacao`, `filial`, `lancamento`); utilitários e infra em
inglês. Nomes de arquivo em kebab-case, como o resto do repositório.
```

---

## Como executar

### Pré-voo (uma vez, antes de sair de perto)

```bash
cd C:\Users\victor.matusita\ti-wap-inventory-control
git status                              # veja os pendentes antes de começar
npm run lint && npm run test && npm run contraste && npm run build
```

Os quatro precisam passar **hoje** — são os mesmos que o job `verificar` do CI roda. O prompt manda
o agente comparar contra essa linha de base, e uma
suíte já vermelha faz ele gastar a run consertando o que não é dele.

**O working tree não está limpo** — `docs/DECISOES.md` e `docs/README.md` estão modificados e há
cinco documentos sem versionar em `docs/`, de outras frentes. O prompt já trata disso: manda commitar
`docs/PLANO-ITENS.md` (a fonte da ordem) e proíbe `git add -A`. Se você preferir começar do zero,
commite ou guarde o que é seu antes de disparar.

**O MCP do Supabase é a frente A inteira.** Sem ele o agente não aplica migration nenhuma. Confirme
com `/mcp` dentro do Claude Code e, se estiver mudo, resolva ANTES — não adianta descobrir isso às
duas da manhã.

Trave o que não é para acontecer, em `.claude/settings.json` (a única garantia dura — `CLAUDE.md` é
contexto, não configuração imposta):

```json
{
  "permissions": {
    "deny": [
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(git reset --hard*)",
      "Bash(git clean -fd*)",
      "Bash(npm run db:reset*)",
      "Bash(npm run db:seed*)",
      "Bash(npm run carga*)"
    ]
  }
}
```

Note o que **não** está na lista: nada de Supabase. A ordem precisa aplicar migrations nos dois
projetos, e uma regra ampla demais aqui mata a fase no meio.

Por fim: `claude --version` (o modo `auto` exige 2.1.83+), `gh auth status` (é como o agente confere
o job `banco` do CI) e um `claude` interativo uma vez neste diretório — o diálogo de confiança do
workspace, se ficar pendente, trava a run. No Windows, plano de energia sem suspensão: notebook que
dorme mata a sessão.

### Rodar

```bash
claude --model opus --permission-mode auto -n f41-motor-itens
```

Cole o prompt inteiro e, logo depois, suba o rigor com uma condição que um avaliador separado
re-checa a cada turno:

```
/goal npm run lint, npm run test, npm run contraste e npm run build passam os quatro, as migrations 0125/0126/0127 estão aplicadas em ensaio e em produção, reservado é zero em todas as filiais e a versão 1.46.0 está publicada com tag
```

Então saia de perto.

Modo `auto` porque a run precisa aplicar migrations por MCP, rodar build, mergear e dar push com
tag; `dontAsk` exigiria uma allowlist cobrindo exatamente tudo isso, e qualquer buraco vira negação
no meio do caminho. Se quiser baratear a run, exporte `CLAUDE_CODE_SUBAGENT_MODEL` com um Sonnet
antes do comando — os exploradores e revisores rodam no modelo barato, o forte fica no orquestrador.

### Acompanhar e retomar

`claude --resume f41-motor-itens` volta para a sessão de qualquer momento. Se ela estiver inchada
quando você voltar, `/compact foque nas migrations aplicadas, nos testes e no que falta do checklist`.
A transcrição é salva continuamente — queda de terminal não perde a sessão —, mas quem segura o
código é o git: por isso o prompt manda commit pequeno e frequente.

### Ao voltar: revisar o resultado

1. Leia `docs/RELATORIO-F41.md` e confira as **evidências**, não as afirmações — as contagens antes
   e depois, os `md5`, a saída dos quatro comandos, o smoke.
2. `git log --oneline -20` e `git diff v1.45.1..v1.46.0 -- supabase/migrations/` — o diff das
   migrations é o que merece seus olhos.
3. Rode você mesmo `npm run lint && npm run test && npm run contraste && npm run build` uma vez.
4. Abra `/dev` e confira as onze checagens; `reserva_aberta` tem de responder zero.
5. **O teste que importa não é nenhum dos automáticos:** registre no sistema a devolução por
   desligamento que gerou o print, com os itens que voltaram, e veja se ela grava.
6. Se veio errado: **regra dos 2 strikes** — depois de duas correções que não pegaram, não emende.
   Uma sessão limpa com um prompt melhor supera a longa cheia de remendos; peça a re-geração deste
   prompt com o aprendizado.

---

## Suposições que fiz

1. **O arquivo mora em `docs/prompts/F41-motor-itens-ultracode.md`**, no padrão das ordens
   anteriores (F37, F38, F39, F40).
2. **Branch `f41-motor-itens`, merge na `main` e tag `v1.46.0`** — precedente da F40, e o
   `CLAUDE.md` permite os dois caminhos.
3. **As migrations são `0125`, `0126` e `0127`**: a última no repositório é a `0124`. Se alguma
   frente entrar antes desta, o agente renumera — o prompt manda seguir o `RUNBOOK-BANCO.md`.
4. **Rollout completo até produção nesta run**, incluindo a conversão das reservas abertas (sua
   resposta de hoje). É a única parte irreversível da fase, e o prompt exige backup e contagens
   antes/depois.
5. **Os rótulos mudam já na F41**, porque a Frente B do plano assim manda (`dominio.ts` e
   `escolha-tipo.ts`): a tela de lançamento avulso passa a mostrar 4 botões com as palavras do
   ativo. O **redesenho** de `/itens` continua sendo F42.
6. **Sem `.env.ensaio` neste repositório**, então não há captura de tela nesta ordem: a prova é SQL,
   teste e smoke. Se você criar um ambiente de ensaio antes de rodar, diga isso ao agente ao colar o
   prompt — ele passa a poder fotografar sem esbarrar na regra 2.
7. **`docs/PLANO-ITENS.md` ainda não está versionado**, e o prompt manda commitá-lo no primeiro
   commit da fase: uma ordem de serviço não pode apontar para um documento que só existe na sua
   máquina.

ultracode

# Ordem de serviço F37 — Fundação: quem é a pessoa e o que é o item

> Ordem de 28/08/2026, emitida pelo Johnny. Sucede a **F36** (`docs/RELATORIO-F36.md` · **v1.41.0**, migrations `0110`/`0111`) — que, note, **não deixou ordem em `docs/prompts/`**: esta volta a ser o arquivo da fase, e a linha da F36 no `docs/prompts/README.md` deve apontar para o relatório dela. O **o quê** e o **porquê** desta fase estão fechados em `@docs/PLAN-F36-F39.md` **§4** (decisões **D5**, **D6**, **D7** do §1) — **leia o §4 inteiro antes de planejar**; esta ordem é a execução dele, e onde as duas divergirem, **esta ordem manda** (emende o plano e registre em `docs/DECISOES.md`). Na escrita desta ordem a última migration era a **`0111`** e a última fase a **F36**: **confira os números livres reais antes de começar**; colisão → renumere (precedente F19/F20B) e registre. Esta fase é **ADITIVA e de fundação**: **nenhuma função ou trigger existente é recriada**, **nenhum registro histórico é alterado**, **nenhuma otimização entra**. Se você se pegar escrevendo `create or replace function public.aplicar_movimentacao`, `rel_estoque_asof`, `rel_saldo_itens`, `valida_lancamento_item` ou `guarda_acervo`, o desenho saiu do trilho — **pare e repense**. Se `git status` mostrar trabalho não commitado de outra sessão, PARE e reporte (uma ordem por vez) — **exceto o próprio arquivo desta ordem**, que é insumo da fase: commite-o no primeiro commit.

## Missão

A F38 (itens que andam com o ativo) e a F39 (o termo que lista o que foi junto) precisam de três coisas que hoje não existem: **uma pessoa que é sempre a mesma pessoa**, **um tipo que é sempre o mesmo tipo** e **um número medido de desempenho**. Esta fase entrega só isso — duas telas de cadastro e uma curva — sem encostar no fluxo de movimentação:

- **A — Cadastro de colaboradores (modelo híbrido, D5).** Tabela `colaboradores` com chave de deduplicação gerada, vínculo **anulável** nos registros **novos**, texto histórico **preservado e intocado**, e uma tela que consolida os nomes digitados à mão em cadastros de verdade.
- **B — Tipos de item (D7).** Lista fechada `tipos_item` gerida no admin, semeada com **os 7 slugs que já existem no código e no histórico**, e `itens.tipo_id` anulável no catálogo.
- **C — A medição, antes de otimizar (D6).** Harness que popula um banco de **ensaio** com volume simulado e publica a curva de `rel_saldo_itens`, `rel_mov_itens`, do trigger `valida_lancamento_item` e do histórico paginado. **A decisão de otimizar não é desta fase** — o entregável é o número.

## Contexto (leia a origem, não descrições dela)

- **Fonte do escopo:** `@docs/PLAN-F36-F39.md` §1 (D5, D6, D7), **§2.2** (o que o código faz hoje com itens e colaborador — verificado, não presumido), **§4** (o desenho desta fase, com o DDL proposto), §7 (rollout), §8 (versão), §9 (o que o plano NÃO faz).
- Doutrina: `@CLAUDE.md` (modo autônomo; stack fechada; **a árvore prescrita — que esta ordem emenda**; regra 8 do versionamento; modelo de acesso) · `@docs/ESPECIFICACAO.md` §5/§6/§8 · `@docs/RUNBOOK-BANCO.md` (**caminho A** e a regra F17: rode TODOS os roteiros SQL ao mexer em banco; leia também as armadilhas do bloco de grants do `papeis_rls.sql`).
- **A guarda que decide o desenho da tela de vínculo:** `@supabase/migrations/0081_*.sql` (`guarda_acervo`) — `movimentacoes` e `lancamentos_item` **recusam UPDATE e DELETE para todo mundo, service role incluso**, fora da janela `estoque.dev_destrutivo`. Leia o corpo antes de desenhar a frente A.
- **Precedente de coluna gerada IMMUTABLE sem extensão:** `profiles.nome` na migration `0057`. Nada de `unaccent`.
- **Precedente de criação inline no meio do fluxo:** `itemInlineSchema` (`@src/lib/validators/item.ts`, `@src/lib/actions/itens.ts`, `@src/components/itens/item-combobox.tsx`, F10). **Campo de colaborador hoje:** `@src/components/movimentacoes/nova/campo-sugerido.tsx` (datalist nativo da F10) + `buscarSugestoesColaboradores` em `@src/lib/actions/movimentacoes.ts`; no lançamento de item, `@src/components/itens/lancar-item-dialog.tsx`.
- **Padrão de tela de cadastro do admin:** `@src/app/(app)/admin/itens/page.tsx` + `@src/components/admin/itens-tabela.tsx` / `item-dialog.tsx` / `admin-nav.tsx`; RLS de catálogo: siga a policy da tabela `itens`.
- **Padrão do harness de medição:** `@scripts/perf/medir.mjs` (F33) — mesmo cabeçalho de regras, mesmo mascaramento de segredo, saída JSON versionada em `docs/perf/`. Guarda de ambiente: `@scripts/env-guard.ts` (`REFS_DE_PRODUCAO`).
- **A lição do teto de 1.000 linhas** (v1.40.2, `@docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md`): nenhuma contagem desta fase pode nascer de uma leitura truncada. Agregue **no SQL**.
- **Guardas que VÃO reclamar de rota nova (F20/F27):** mapa rota→página de ajuda em `@src/lib/ajuda/registry.test.ts`, jargão de dev, título de aba, paleta `Ctrl+K` (`@src/components/layout/paleta-comandos.tsx`) e o smoke (`@scripts/smoke/smoke-prod.mjs`). Leia os guardas **antes** de criar as rotas.
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run db:types` · `npm run db:seed` / `db:reset` (só ensaio/local). **Meça a baseline ANTES de mudar qualquer coisa** e cole no relatório.
- APIs (regra 6 do CLAUDE.md): precisou conferir Supabase/Next 16/React 19 — doc oficial vigente via MCP Context7, nunca de memória.

## Escopo

**Dentro:** migrations `0112` (tabela `colaboradores`), `0113` (colunas `colaborador_id` anuláveis em `movimentacoes` e `lancamentos_item`), `0114` (tabela `tipos_item` + seed dos 7 slugs + `itens.tipo_id`), com RLS e grants; combobox de colaborador com criação inline no wizard de movimentação e no lançamento de item; telas `(app)/admin/colaboradores` e `(app)/admin/tipos-item`; coluna de tipo em `admin/itens`; queries e validators novos; roteiro SQL `supabase/tests/f37_colaboradores_tipos.sql`; guarda TS↔SQL dos 7 slugs; harness `scripts/perf/medir-itens.mjs` + a curva em `docs/perf/`; `scripts/seed.ts`/`reset.ts` cobrindo o cadastro novo; ajuda, paleta, smoke, título de aba, `admin-nav`; versão **1.42.0** (bump + registry + tag); emendas de documentação; encerramento padrão (§R e relatório).

**Fora (não toque):**

- **Qualquer função ou trigger existente.** `aplicar_movimentacao`, `rel_estoque_asof`, `rel_saldo_itens`, `rel_mov_itens`, `valida_lancamento_item`, `guarda_acervo`, `status_apos_movimentacao`, `status_tem_detentor` ficam **byte a byte**. `git diff` nas migrations antigas termina vazio.
- **`ativos`.** Nada de `colaborador_atual_id` nesta fase — isso exigiria recriar `aplicar_movimentacao`, e o híbrido não precisa disso para a F38 medir nada.
- **UPDATE em `movimentacoes` ou `lancamentos_item`**, por qualquer caminho, inclusive service role e inclusive "só a coluna nova". Ver §A.3.
- **Otimização de qualquer espécie** (D6/§9 do plano): nenhum índice novo em `lancamentos_item`, nenhuma paginação nova, nenhum saldo materializado, nenhum cache. O entregável da frente C é o **número**, não a correção.
- **O checklist de devolução** (`ACESSORIOS_DEVOLUCAO`/`ACESSORIO_ROTULO`/`rotuloAcessorio` em `src/lib/dominio.ts`) continua governando o checklist e as pendências: ele **só sai do código na F39**. Aqui ele ganha um espelho no banco e **uma** correção de rótulo (§B.2).
- Máquina de estados, modelo de acesso (nenhum cargo, nenhuma policy sobre tabela existente), termos e `.docx`, relatórios e snapshots, visualizador por senha, `src/components/ui/**`, dependência nova, custo acima de R$ 0, dado real em qualquer lugar.

## O modelo a implementar

### A — Cadastro de colaboradores (migrations `0112` e `0113`)

**A.1 — A tabela.** `public.colaboradores` conforme o DDL do §4.1 do plano: `id uuid`, `nome`, `matricula`, `setor`, `filial_id`, `ativo`, `criado_por`, `created_at` e a coluna **gerada** `nome_chave` (minúsculas, sem acento por `translate`, espaços colapsados por `regexp_replace` de 4 argumentos — ambos IMMUTABLE; **proibido** `unaccent`), com índice único sobre ela. **Consequência a tratar na UI, não a esconder:** duas pessoas reais com o mesmo nome normalizado não cabem no cadastro — a colisão do índice único vira **mensagem em pt-BR** ("Já existe um colaborador com este nome; diferencie o nome ou use a matrícula"), nunca um `23505` cru na tela. Registre a limitação em ata.

**A.2 — O vínculo, sempre anulável** (`0113`): `movimentacoes.colaborador_id` e `lancamentos_item.colaborador_id`, ambos `references colaboradores(id)`, ambos nulos por padrão. Como as duas escritas são **INSERT direto** (o `aplicar_movimentacao` é trigger, não RPC), **nenhuma função precisa ser recriada** — confirme isso lendo o código antes de aceitar como verdade.

**A.3 — A ligação do passado é por CHAVE, nunca por UPDATE.** `guarda_acervo` (`0081`) recusa UPDATE em `movimentacoes` e `lancamentos_item` para todo mundo, e a definição de pronto do §4.4 diz "nenhum registro histórico alterado". Portanto, e isto **é decisão desta ordem**, que resolve a ponta solta do §4.1 do plano:

- `colaborador_id` só é gravado **no INSERT do registro novo**;
- a tela de vínculo **não altera uma linha de histórico**: ela **consolida cadastros** a partir das chaves distintas encontradas no texto (agrupando "João Silva" / "Joao Silva" / "joão  silva" numa `nome_chave` só) e criando/reaproveitando o `colaboradores` correspondente;
- a resolução do passado é **por `nome_chave` na leitura**, não por FK gravada;
- se alguma implementação exigir UPDATE em histórico para funcionar, **pare**: o desenho saiu do trilho.

**A.4 — O campo no fluxo (o que NÃO pode mudar).** O campo de colaborador do wizard e o do lançamento de item passam a oferecer os cadastros existentes **com criação inline** (molde `itemInlineSchema`), mas: **texto livre continua valendo e nunca bloqueia** — quem digita um nome que não está no cadastro salva a movimentação do mesmo jeito, com `colaborador_id` nulo, e a tela de vínculo pega isso depois; **o texto continua sendo gravado exatamente como hoje** (snapshot da época, doutrina da casa); rascunho, "repetir última", kits, resumo de revisão e o painel de sucesso continuam funcionando, e **os testes existentes desses fluxos ficam verdes sem serem editados**.

**A.5 — A tela `(app)/admin/colaboradores`.** Lista os cadastros (busca, filtro por filial, ativar/desativar, editar) e, na mesma tela, **a fila de consolidação**: os nomes de texto que ainda não têm cadastro correspondente, agrupados por `nome_chave`, **com a contagem de ocorrências**, e a ação de criar em lote. A contagem sai de **agregação no SQL** (RPC ou view) — nunca de linhas lidas no cliente (lição do teto de 1.000). A tela diz na cara quantos registros antigos seguem sem cadastro correspondente, em vez de fingir um total completo. Acesso: **nível administrador** para escrever (`e_admin()`); leitura pelo piso de leitura.

**A.6 — RLS das tabelas novas.** Leitura: todo logado ATIVO (piso `papel_atual() is not null`). Escrita em `colaboradores`: **INSERT por `pode_escrever()`** — senão a criação inline no wizard quebra na mão do operador —, UPDATE/desativação por `e_admin()`. Siga o precedente da tabela `itens` para grants e decida com a régua da §"Autonomia"; registre a escolha em ata.

### B — Tipos de item (migration `0114`)

**B.1 — A tabela e o seed.** `public.tipos_item` (`id smallint identity`, `slug` único, `rotulo`, `ativo`, `ordem`) e `itens.tipo_id smallint` **anulável**. O seed são **exatamente** os 7 slugs que já vivem no código e no histórico — `carregador`, `mochila`, `mouse`, `teclado`, `mousepad`, `fone`, `cabo` — porque `movimentacoes.itens_faltantes` e `pendencias_item.item` guardam **esses mesmos literais**. **Slug gravado nunca muda.**

**B.2 — A única mudança de rótulo:** `fone` passa a exibir **"Fone de ouvido"**. Para que tela e banco não discordem enquanto o vocabulário ainda mora nos dois lugares, `ACESSORIO_ROTULO.fone` em `src/lib/dominio.ts` muda junto — **só o rótulo, jamais o código**. Isso muda o que as pendências antigas **exibem**, não o que guardam: entra na ata.

**B.3 — A guarda contra a divergência.** Teste TS↔SQL no molde de `@src/lib/validators/detentor-sql.test.ts` (F36) e de `transicoes-sql.test.ts`: os slugs e rótulos de `dominio.ts` e o seed da `0114` são **o mesmo conjunto**, e o teste **derruba `npm run test`** se um lado andar sem o outro. É essa guarda que deixa a F39 remover a constante do código sem quebrar histórico.

**B.4 — A tela `(app)/admin/tipos-item`** (cadastro: criar, editar rótulo/ordem, ativar/desativar — **nunca** editar slug de tipo já usado) e a **coluna de tipo em `admin/itens`**, com selo discreto nos itens sem tipo. Acesso: `e_admin()` para escrever, como as demais telas de `/admin`. `itens.tipo_id` nasce nulo e ninguém é obrigado a preencher.

### C — A medição, antes de otimizar

**C.1 — O harness** `scripts/perf/medir-itens.mjs`, no molde do `scripts/perf/medir.mjs` da F33: popula um banco de **ENSAIO** com volume **100% fictício** em três patamares — **10 mil, 100 mil e 500 mil** lançamentos — e mede, com `EXPLAIN ANALYZE` em cada patamar: `rel_saldo_itens`, `rel_mov_itens`, o trigger `valida_lancamento_item` (custo por INSERT) e o histórico paginado da tela de itens.

**C.2 — As guardas, que valem mais que o número.** Recusa qualquer ref de `REFS_DE_PRODUCAO` (reutilize `scripts/env-guard.ts`; **nenhuma execução contra produção, em hipótese nenhuma**); segredos só do ambiente e mascarados em qualquer saída, stack trace incluso; dados 100% fictícios (`@faker-js/faker`, seed determinístico). **Limpeza obrigatória:** o ensaio volta ao estado anterior, com contagem **antes e depois** no relatório — meio milhão de linhas esquecidas envenenam todo rehearsal futuro. Se a limpeza falhar, isso é a pendência número um do relatório, escrita em voz alta.

**C.3 — O tempo de POPULAR é dado, não obstáculo.** O trigger soma o diário inteiro a cada INSERT: se popular 500 mil linhas ficar inviável, **isso é o achado** — registre o número real, o método usado (lote, `set session_replication_role`, o que for, desde que declarado e só no ensaio) e siga.

**C.4 — O entregável é a curva, não a correção.** `docs/RELATORIO-F37.md` publica a tabela por patamar e o JSON vai para `docs/perf/`. Ao final, **nomeie** as opções (índice, paginação, saldo materializado por item×filial com reconciliação) e diga **qual o número recomenda** — como recomendação para a fase seguinte, **sem implementar nenhuma**. Otimizar antes do número é o erro que a F33 documentou ter cometido e revertido.

### D — Versão e emendas de documentação

Versão **`1.42.0`** pela regra 8 do `CLAUDE.md`, sem reinterpretação: bump só do campo `version`; entrada nova no topo de `src/lib/versoes/registry.ts` (data, `fase: 'F37'`, título e **2 a 6 mudanças em linguagem de operador** — "Agora dá para cadastrar as pessoas e escolher o nome numa lista, em vez de digitar de novo a cada movimentação"; há teste que recusa jargão); entrada nova no topo do `CHANGELOG.md`; **tag anotada `v1.42.0` publicada**. Emende ainda: a **árvore prescrita do `CLAUDE.md`** (as duas rotas, os componentes, `lib/colaboradores/`, o script de perf — sem isso a F38 PARA ao ver a estrutura divergir), spec §5/§6, `README.md`, `docs/prompts/README.md` (linha F37), `docs/PLAN-F36-F39.md` (marque o §4 como executado e **corrija o §4.1 com a decisão A.3**) e `docs/DECISOES.md` (uma ata por decisão: A.3 chave-em-vez-de-UPDATE · colisão de `nome_chave` · RLS das tabelas novas · texto livre que não bloqueia · rótulo do `fone` · o método e o resultado da medição).

## Critérios de aceitação

1. **Aditiva de verdade:** as três migrations criam tabelas, colunas anuláveis, políticas e seed — e **nada mais**. Nenhuma função ou trigger existente foi recriada (prove por diff e por `pg_get_functiondef` antes/depois), nenhum estado de ativo mudou, **nenhuma linha de `movimentacoes`, `lancamentos_item` ou `ativos` foi alterada** (contagens e amostras antes/depois no relatório).
2. **Chave, não UPDATE:** a tela de consolidação cria/reaproveita cadastros e **não emite um único UPDATE em histórico**; o roteiro SQL prova, por asserção **negativa**, que `guarda_acervo` recusa `update movimentacoes set colaborador_id = …` fora da janela.
3. **O fluxo não mudou de comportamento:** movimentação e lançamento de item continuam aceitando **texto livre** que não está no cadastro, gravando o texto exatamente como hoje; rascunho, repetir-última, kits e resumo de revisão intactos; **os testes existentes desses fluxos passam sem edição**.
4. **Híbrido funcionando:** registro novo feito a partir de um cadastro grava **os dois** (`colaborador_id` e o texto); registro antigo continua com texto e id nulo; a tela mostra a contagem real de registros sem cadastro correspondente, **agregada no SQL**.
5. **Vocabulário:** `tipos_item` tem exatamente os 7 slugs do histórico, `itens.tipo_id` é anulável, `admin/itens` mostra o tipo com selo para os sem tipo, e a guarda TS↔SQL derruba o `test` se os dois lados divergirem. `fone` exibe "Fone de ouvido" nos dois lados; nenhum código gravado mudou.
6. **Duas telas no ar:** `/admin/colaboradores` e `/admin/tipos-item` funcionando nos dois temas, com título de aba próprio, entrada em `admin-nav`, ajuda mapeada, paleta `Ctrl+K` e smoke — todos os guardas F20/F27 verdes.
7. **Acesso:** operador cria colaborador inline (senão o wizard quebra na mão dele) e **não** alcança `/admin/**`; consulta não escreve nada; perfil desativado ou arquivado não lê nem escreve. Provado no `papeis_rls.sql`, com as relações novas **dentro** do bloco de grants (armadilha `42501` do runbook).
8. **Medição publicada:** a curva dos três patamares está em `docs/RELATORIO-F37.md` com o JSON em `docs/perf/`; o ensaio voltou ao estado anterior (contagem antes/depois); **zero otimização entrou** (`git diff` não mostra índice novo, paginação nova nem tabela de saldo).
9. **Portões:** `npm run lint` · `npm run test` · `npm run build` limpos (baseline antes, colada no relatório); **TODOS** os roteiros de `supabase/tests/*.sql` rodados (regra F17), job `banco` do CI verde, deploy READY, smoke pós-deploy OK com as rotas novas, `npm run db:types` regenerado e commitado.
10. **Versão e relatório:** `1.42.0` no `package.json`, no registry e na tag anotada publicada; `docs/RELATORIO-F37.md` com o checklist autoverificado item a item, evidências reais (saídas de comando, contagens, `EXPLAIN ANALYZE`), decisões, pendências e a seção **"o que este relatório NÃO prova"**.

## §V — Verificação (rode de verdade, itere até passar)

Meça a baseline (lint/test/build + contagem de testes + contagens das tabelas do acervo em produção, só-leitura) **ANTES** de qualquer mudança. A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a **causa raiz**, repita; nunca suprima erro, nunca desabilite ou delete teste para passar. Banco pelo **caminho A** do runbook: aplique em **ensaio** primeiro, rode **todos** os roteiros SQL lá (`begin; … rollback;`, comparando **linhas** de uma `select` final — o MCP engole `NOTICE`), confira `get_advisors`, e só então produção; a prova final é o job `banco` **verde** no GitHub, não o run no ensaio. Suba o dev server e confira as duas telas novas, o wizard e o lançamento de item nos dois temas, com o campo de colaborador nos três caminhos (escolher cadastro · criar inline · digitar texto que não existe).

Ao final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão, atenção especial a: sobrou algum `create or replace` de função existente, ou algum `.update(`/`.delete()` sobre `movimentacoes`/`lancamentos_item` em `src/` ou `scripts/`?; alguma contagem da tela de consolidação nasce de leitura truncada em vez de agregação no SQL?; o wizard ficou **mais estrito** em algum caminho (texto livre que antes salvava e agora não salva)?; a colisão de `nome_chave` aparece como mensagem em pt-BR ou vaza `23505`?; o seed de `tipos_item` bate slug a slug com o histórico (`itens_faltantes`, `pendencias_item.item`)?; alguma otimização entrou de carona?; o harness pode, por qualquer caminho de ambiente, apontar para produção?; o ensaio ficou limpo?; os grants novos entraram no bloco do `papeis_rls.sql`?; a árvore do `CLAUDE.md` bate com a estrutura real DEPOIS da fase? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise até limpar.

## Como trabalhar

Explore com subagentes paralelos (o §4 do plano e o DDL proposto; o caminho de escrita de `movimentacoes`/`lancamentos_item` e o alcance real do `guarda_acervo`; o wizard, o rascunho e os testes que não podem ser editados; os guardas de ajuda/paleta/smoke/título; o harness da F33 e o `env-guard`) e escreva um `PLAN.md` autossuficiente antes de implementar — com o DDL final das três migrations, as policies nome a nome e a lista dos testes existentes que **não** podem mudar. Implemente em incrementos testáveis e independentes — `0112`+`0113`+RLS → combobox e criação inline → tela de consolidação → `0114`+seed+guarda TS↔SQL → telas de tipo → harness e medição → versão e documentação —, verificando a cada um. Frentes A e B podem correr em paralelo até tocarem `admin-nav`/ajuda/smoke, que são ponto de encontro: sincronize ali. A revisão adversarial final é a do §V.

## Autonomia, decisões e git

Você está rodando em modo autônomo (`CLAUDE.md`): ninguém vai responder perguntas — não pare para perguntar nem espere confirmação. Régua: (1) esta ordem; (2) `docs/PLAN-F36-F39.md` §4, spec e convenções do repositório; (3) opção **mais simples e reversível**, registrada. Toda decisão não-óbvia vira ata em `docs/DECISOES.md` (data · contexto · escolha · motivo). Falha persistindo após ~3 tentativas: **mude de abordagem** e registre a troca. Bloqueio real (ensaio fora do ar, MCP indisponível): contorne se for seguro; senão siga com o resto da fase e registre a pendência com o que falta para resolver — **nunca** force a mão em produção para destravar. Git: commits pequenos e frequentes em pt-BR (`feat(f37): …`, `fix(f37): …`), direto na `main` ou em branch `f37` com merge próprio ao fechar o checklist; NUNCA force push, `reset --hard`, `git checkout -- .`, deleção de teste para passar, `.env*` ou dado real em commit.

## §R — Rollout

1. **Banco pelo caminho A** (nenhuma das três bate no gate — nenhuma contém `delete from public.ativos` ou `delete from public.movimentacoes`): ensaio → roteiros SQL → `get_advisors` → produção → `notify pgrst, 'reload schema';` → conferência pós-apply (as três tabelas/colunas existem, o índice único existe, o seed tem 7 linhas, os grants estão como o desenho previu).
2. **Ordem migration → deploy:** o SQL entra **antes** do deploy da Vercel, porque o código novo lê colunas que só existem depois dele.
3. CI verde (lint + test + build + job `banco`), deploy READY, smoke pós-deploy incluindo as duas rotas novas, conferência read-only das telas tocadas nos dois temas.
4. Tag anotada `v1.42.0` publicada apontando para o commit deployado.
5. Encerramento: `docs/RELATORIO-F37.md` (checklist autoverificado, evidências, a curva de desempenho, decisões, pendências, "o que este relatório NÃO prova") + todas as emendas de documentação + resumo final de ~10 linhas em pt-BR na resposta.

## Idioma

Narrativa, atas, relatório e UI em **pt-BR**; identificadores de domínio em português sem acento (`colaborador`, `colaboradores`, `tipos_item`, `nome_chave`, `tipo_id`); utilitários e infra em inglês; commits em pt-BR no padrão conventional da casa.

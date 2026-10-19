# v1.71.1 + v1.71.2 — Reservados por categoria · o colaborador que sobra do estorno

Duas entregas avulsas fora do plano multiempresa (versão PATCH, regra 8), numa run só e com dois PRs de código:

- **v1.71.1, os Reservados por categoria.** O card "Reservados" do relatório ganha o total, os chips por categoria e a
  lista separada por categoria, no lugar da lista corrida de hoje.
- **v1.71.2, o colaborador sem uso.** Primeiro a run prova o que acontece com o colaborador cadastrado no campo da
  movimentação quando ela é estornada. Depois, em Administração › Colaboradores, quem não tem nenhum registro que
  continue valendo ganha o selo e o filtro "Sem uso". Nada muda sozinho.

## Estado de partida: os fatos medidos no disco (19/10/2026)

1. **Versão `1.71.0`.** A `main` está em `47344c9` (merge do PR #81, fecho da F66), com a tag `v1.71.0` no HEAD e a
   árvore limpa. A última migration é a `0179_rel_motivo_por_empresa.sql`, então a próxima livre é a `0180`.
2. **O card "Reservados"** é `src/components/relatorios/lista-reservados.tsx`: um `<ul>` corrido com
   `patrimônio · modelo · #chamado`, sem total e sem categoria. Ele é usado em dois lugares:
   - `corpo-relatorio-v2.tsx` (~l.260), no grupo "Equipamentos principais", com `janela="foto"` e o subtítulo fixo
     `"patrimônio · modelo · nº do chamado"`;
   - `corpo-relatorio.tsx` (~l.171, o corpo v1 dos snapshots antigos).
3. **O dado vem de `reservadosDeEstado`** (`src/lib/queries/relatorios/estoque.ts` ~l.428). A função filtra o
   `EstadoAtivo[]` por `status === 'reservado'` e devolve `{patrimonio, modelo, chamado}` ordenado por patrimônio.
   **O `EstadoAtivo` já traz `categoria`** (l.49–58), mas o `map` a descarta. Ela recebe o MESMO `estado` que alimenta
   `kpisDeEstado` (`src/lib/queries/relatorios/snapshot.ts` ~l.137–163).
4. **`ItemReservado` faz parte da forma do JSON congelado.** O tipo fica em `src/lib/relatorios/tipos.ts` l.30 e entra
   em `SnapshotRelatorio` e `SnapshotRelatorioV2`. A forma Zod de leitura é
   `ITEM_RESERVADO = z.looseObject({ patrimonio, modelo, chamado })` em `src/lib/queries/formas/relatorios-gerados.ts`
   l.62. Desde a F58, forma que não bate faz a leitura lançar o erro em produção. Os snapshots já gerados não têm
   categoria e não podem ganhar uma: o snapshot é congelado (spec §7). Os precedentes de campo opcional que mantêm o
   `schema: 2` são `emprestado?`, `serieEstado?` e `movimentacoesItens?`.
5. **O molde visual já existe:** `lista-modelo-categoria.tsx` ("Disponíveis por modelo"), agrupado com
   `rotuloCategoria` de `@/lib/dominio` e com o total do grupo à direita do cabeçalho.
6. **`lista-reservados.tsx` está em `PENDENTES`** da régua de layout (`src/lib/layout/pendentes-da-regua.ts` l.483). A
   lista só encolhe.
7. **Onde o card está descrito:**
   - spec §7, item 2 ("→ **reservados com nº do chamado**");
   - ajuda `src/lib/ajuda/conteudo/relatorio-ao-vivo.ts` l.60, que lista os cards do grupo;
   - ajuda `entregar-emprestar-reservar.ts` l.95–97, que cita o card "Reservados".
8. **O colaborador nasce no clique, não no salvar.** O botão "Cadastrar" de
   `src/components/movimentacoes/nova/campo-colaborador.tsx` (l.102) chama `criarColaboradorInline`
   (`src/lib/actions/colaboradores.ts` l.95) antes de a movimentação existir. O insert em `colaboradores` não guarda
   vínculo com a movimentação, só `criado_por` e `created_at`. Se houver um homônimo desativado, a função o reativa
   (quando é admin) ou devolve `precisaAdminParaReativar` (quando é operador). O mesmo campo é usado na contrapartida e
   no `lançar-item-dialog`.
9. **A doutrina da tabela** (`0112`, no comentário da tabela) é "Não se apaga: desativa-se". O UPDATE exige `e_admin()`
   e não há DELETE. `movimentacoes.colaborador_id` e `lancamentos_item.colaborador_id` (`0113`) são FK gravadas só no
   INSERT e imutáveis (`guarda_acervo`, `0081`). Desde a `0172`/`0174`, `nome_chave` é única **por empresa**.
10. **O que o estorno faz.** Na `0121` (recriada na `0122` e na `0161`; parta da ÚLTIMA definição, lida no banco),
    `estornar_movimentacao_com_itens` grava a movimentação `estorno` com `estorno_de` e **sem** `colaborador` nem
    `colaborador_id`. Os lançamentos inversos copiam o `colaborador_id` do original, exceto sem saldo: aí vão sem o
    vínculo (§C.3 da F38, ata "O estorno era o único caminho que mandava o vínculo sem olhar saldo"). A restauração do
    ativo é feita por `movimentacao_estornar` (`0150`). **Nenhum caminho toca `colaboradores`.**
11. **Administração › Colaboradores.** `listarColaboradoresAdmin` (`src/lib/queries/colaboradores.ts` l.91) conta
    `movimentacoes(count)` e `lancamentos_item(count)` por embed, ou seja, TUDO o que está vinculado, inclusive a
    movimentação estornada e o lançamento inverso. A coluna "Registros" de `src/components/admin/colaboradores-tabela.tsx`
    (l.125–153) soma os dois. Os filtros de hoje são busca de texto e filial, em estado local, e o status é o badge
    Ativo/Inativo.
12. **O campo continua sugerindo a pessoa.** `sugestoesDoCampoColaborador` filtra só `ativo = true` (l.334), então um
    cadastro que só tem registro estornado continua aparecendo.
13. **A armadilha da consolidação.** `consolidarColaboradores` cria cadastro a partir de `v_colaboradores_textos`, ou
    seja, de nomes que só existem como TEXTO no histórico, com `colaborador_id` nulo para sempre. É uma pessoa real e
    usada, com "Registros" igual a 0. **Uma regra de "sem uso" que só olhe o id marcaria essa pessoa por engano.** O
    histórico anterior à F37 se resolve **por chave**, na leitura (comentário da `0112`).
14. **Os roteiros da área** são `supabase/tests/f37_colaboradores_tipos.sql` e `f38_itens_com_ativo.sql`. O saldo por
    pessoa é a view `rel_saldo_colaborador` (`0118`/`0120`).
15. **A lição do teto de 1.000** (`docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md`): contagem vem pronta do banco, nunca de
    linhas lidas no cliente.

## As decisões do Johnny (19/10/2026)

1. **Reservados:** total no subtítulo, linha de chips por categoria no topo e a lista separada por categoria, cada grupo
   com o seu total.
2. **Colaborador:** diagnóstico mais o selo "Sem uso" em Administração › Colaboradores, com filtro. O admin decide
   desativar. Nada muda sozinho: o estorno não desativa e ninguém apaga. O selo também pega o formulário abandonado
   (fato 8).

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Duas entregas avulsas do Estoque TI WAP (regra 8 do CLAUDE.md: entrega fora de fase = PATCH), cada uma com o seu PR,
mergeadas, deployadas, conferidas em produção e com a tag publicada:

1. v1.71.1: no relatório (ao vivo, consolidado, snapshots novos, visualizador por senha e impressão), o card
   "Reservados" mostra o TOTAL de reservados, os chips com o total por categoria e a lista SEPARADA POR CATEGORIA, no
   lugar da lista corrida de hoje. Os snapshots antigos continuam abrindo sem erro.
2. v1.71.2: está PROVADO, por roteiro executável, o que acontece com o colaborador cadastrado no campo da movimentação
   quando ela é estornada, e também quando o formulário é abandonado. Em Administração › Colaboradores, todo cadastro
   ATIVO sem nenhum registro que continue valendo ganha o selo "Sem uso" e entra no filtro "Uso". O admin decide o
   resto: nenhum estado muda sozinho.

O arquivo desta ordem traz um cabeçalho "Estado de partida" com 15 fatos numerados. Leia-o primeiro:
@docs/prompts/prompt-reservados-por-categoria-e-colaborador-sem-uso.md

# Contexto

## Leia antes de escrever qualquer coisa
- @CLAUDE.md (regras permanentes 1–8, stack fechada, modelo de acesso, convenções) e os CLAUDE.md aninhados que ele
  manda carregar: src/components/relatorios, src/lib/colaboradores, src/lib/versoes, src/lib/ajuda, supabase,
  scripts/db. Confira o MAPA do CLAUDE.md: se os diretórios de topo de src/lib e src/components, ou a lista de
  aninhados, não baterem com o disco, PARE antes de editar e escreva o relatório com a divergência. É a única parada
  prevista.
- @docs/README.md (o índice de docs: registre ali o que você criar em docs/), @docs/ESPECIFICACAO.md §7 (relatório) e
  a seção de colaboradores e telas de administração, @docs/ARQUITETURA.md §4 e §10.
- O relatório: @src/components/relatorios/lista-reservados.tsx,
  @src/components/relatorios/lista-modelo-categoria.tsx (O MOLDE), @src/components/relatorios/corpo-relatorio-v2.tsx,
  @src/components/relatorios/corpo-relatorio.tsx, @src/lib/relatorios/tipos.ts,
  @src/lib/queries/relatorios/estoque.ts, @src/lib/queries/relatorios/snapshot.ts,
  @src/lib/queries/formas/relatorios-gerados.ts, @mockups/dashboard-relatorio.html.
- O colaborador: @src/lib/actions/colaboradores.ts, @src/components/movimentacoes/nova/campo-colaborador.tsx,
  @src/lib/queries/colaboradores.ts, @src/components/admin/colaboradores-tabela.tsx,
  @src/app/(app)/admin/colaboradores/page.tsx, @src/lib/actions/movimentacoes.ts (estornarMovimentacao, ~l.632),
  @supabase/migrations/0112_colaboradores.sql, @supabase/migrations/0113_colaborador_vinculo.sql,
  @supabase/migrations/0121_estorno_com_itens.sql e a última definição de cada função citada, lida no banco por
  pg_get_functiondef (nunca de uma migration antiga).

## Os fatos: CONFIRA CADA UM ANTES DE ACEITAR
Os 15 fatos do cabeçalho foram medidos em 19/10/2026. Reconfira cada um no disco (e, os de banco, no ensaio, só
leitura). Fato que não se sustenta vira ata em docs/DECISOES.md e muda o plano, e a ordem não é seguida às cegas. O fato
13 (a pessoa consolidada que só tem histórico em texto) decide a regra da Frente B: confirme-o com um caso real de
forma, contando no ensaio, não lendo o código.

## Comandos que já existem: use, não reinvente
- npm run lint · npm run test · npm run build · npx tsc --noEmit · npm run contraste · npm run verificar:actions
- npm run db:lock (obrigatório no commit de migration nova) · npm run db:types (regenera
  src/lib/types/database.ts, que é GERADO) · npm run db:test (roteiros; precisa de Postgres). O CI (verificar e
  banco-sem-docker) roda incondicionalmente os roteiros, o injetor e o gate de deriva de tipos. Se não houver Postgres
  local, quem decide é o CI.
- node scripts/smoke/smoke-prod.mjs (o smoke de produção) · GET https://ti-wap-inventory-control.vercel.app/api/saude
  (a versão no ar)
- npx tsx --env-file=.env.local scripts/formas/varrer-evidencias.mts <pasta>: confere que a evidência não tem dado
  real. A saída é só contagem.
- scripts/design/ (prévias estáticas com dado fictício + capturar.mjs, Playwright): o molde da prova fotografada da F43
  e da F61. Prévia nunca lê banco.
- O MCP da Supabase (execute_sql só leitura, apply_migration, list_migrations, get_advisors,
  generate_typescript_types) nos projetos de ensaio e de produção, pelo fluxo de docs/RUNBOOK-BANCO.md.

# Escopo

## Frente A: v1.71.1, os Reservados por categoria (código, SEM migration)
- `ItemReservado` ganha `categoria?: CategoriaAtivo`. É OPCIONAL, para que o snapshot antigo continue válido, e mantém
  o schema 2. A forma Zod `ITEM_RESERVADO` aceita o campo ausente e o campo presente.
- `reservadosDeEstado` preenche `categoria` a partir do `EstadoAtivo`, que já está em memória: zero leitura nova no
  banco.
- Uma função pura em src/lib/relatorios/ (por exemplo `agruparReservados`) devolve o total, os grupos na ORDEM DE
  CATEGORIA que o card vizinho "Disponíveis por modelo" já usa no mesmo relatório (descubra a fonte dessa ordem, não
  invente outra) e, dentro de cada grupo, os itens por patrimônio como hoje. Se QUALQUER item vier sem categoria
  (snapshot antigo), ela devolve "sem grupos".
- O card:
  - subtítulo `"N reservados"` / `"1 reservado"`, com `toLocaleString('pt-BR')`;
  - uma linha de chips `"<categoria> N"` só quando houver 2 categorias ou mais (com uma só, o chip repetiria o
    cabeçalho do grupo);
  - os grupos no molde de lista-modelo-categoria.tsx: o rótulo da categoria (o MESMO `rotuloCategoria` do card
    vizinho) à esquerda e `"N reservados"` à direita, com as linhas de hoje (patrimônio · modelo · #chamado) embaixo;
  - snapshot antigo: subtítulo com o total e a lista corrida de hoje, sem chips e sem grupos, e sem ler o banco;
  - os chips são resumo: não são link, filtro nem âncora. O visualizador por senha nunca ganha href.
- Vale para os dois corpos (o v1 cai no caminho do snapshot antigo), para /relatorios/[filial], /relatorios/geral, os
  snapshots e a impressão. O cabeçalho do grupo nunca fica separado da sua primeira linha na quebra de página.
- Régua de layout: se a reescrita deixar lista-reservados.tsx dentro da régua, tire-o de PENDENTES (a lista só
  encolhe). Se não, ele fica lá. Não converta outros arquivos da pasta.
- Documentos:
  - emenda na spec §7, item 2;
  - as duas páginas da ajuda do fato 7;
  - o mapa da ARQUITETURA §10, se nascer arquivo novo;
  - ata em DECISOES.md;
  - CHANGELOG + versão 1.71.1 (os três passos da regra 8).

## Frente B: v1.71.2, o colaborador sem uso (diagnóstico → regra no banco → selo)
B1. **Diagnóstico, provado por execução, não por leitura de código.** Um roteiro SQL novo em supabase/tests/ (ou a
    extensão de f37_colaboradores_tipos.sql, com motivo) reproduz os caminhos e AFIRMA o comportamento de hoje:
    - (i) cadastro inline → movimentação (com e sem item junto) → estorno;
    - (ii) cadastro inline e formulário abandonado.

    Depois de cada caminho, ele afirma:
    - `colaboradores.ativo` segue true;
    - o `colaborador_id` da movimentação original;
    - a linha do `estorno`;
    - o `colaborador_id` dos inversos de item;
    - o detentor do ativo restaurado;
    - `rel_saldo_colaborador`;
    - as contagens que "Registros" lê;
    - se o campo ainda sugere a pessoa;
    - `v_colaboradores_textos`.

    Mapeie também, por leitura, onde mais a pessoa aparece depois do estorno: as tabelas do relatório (linha estornada
    sinalizada), o termo já gerado, as pendências de item e "Com esta pessoa". O resultado é a tabela "superfície · o
    que mostra · está certo?" no topo do relatório.
B2. **A medição de hoje, só números.** No ensaio e em produção, por SELECT só leitura, conte:
    - os cadastros ativos;
    - os ativos sem registro vinculado por id;
    - os ativos sem uso efetivo pela regra B3, separados em "nunca usado" e "só registros estornados";
    - quantos dos "sem vínculo por id" são salvos pela chave do texto (o fato 13).

    Na evidência e na resposta só entram contagens e o texto do SELECT, nunca nome, id, patrimônio ou filial.
B3. **A regra do uso efetivo, escrita no banco.** Um cadastro tem uso efetivo quando existe pelo menos UM registro da
    MESMA empresa que continua valendo:
    - (a) movimentação vinculada à pessoa, que não é `estorno` e não tem estorno apontando para ela;
    - (b) lançamento de item vinculado à pessoa, com `estorna_id` nulo e sem inverso apontando para ele;
    - (c) o detentor atual de algum ativo é a pessoa.

    "Vinculada" vale por `colaborador_id` OU, quando o id é nulo, pela chave do texto (`colaborador_chave(texto) =
    nome_chave`), que é o histórico anterior à F37 e o fato 13. A resposta sai PRONTA do banco (fato 15). O caminho
    esperado é uma view nova `security_invoker` (migration a partir da `0180`, `-- classe: ADITIVA`, ROLLBACK no
    rodapé, grants só para authenticated) que exponha, por cadastro, os usos efetivos e os registros estornados. A view
    tem de passar por todas as travas que um objeto novo encontra hoje: os catálogos, o recorte por empresa da F66, a
    forma multiempresa, o injetor, a deriva de tipos e a forma Zod da F58 na leitura. Se você provar que dá para
    responder no banco sem migration, pode, registrando o motivo.
B4. **O selo.** Em Administração › Colaboradores, na linha ATIVA sem uso efetivo, aparece o selo "Sem uso" com o
    porquê em linguagem de operador ("nunca usado" ou "N registros, todos estornados"). A tabela ganha também o
    filtro "Uso: Todos · Em uso · Sem uso", em estado local como os dois filtros que já existem. "Registros" mantém o
    significado de hoje. Inativo não ganha selo. Desativar continua pelo "Editar" que já existe.
B5. **Documentos:**
    - emenda na spec (o cadastro nasce no clique; o estorno não toca o cadastro; o selo);
    - a ajuda da tela de colaboradores;
    - ARQUITETURA §10;
    - ata;
    - RUNBOOK, se aplicável;
    - CHANGELOG + versão 1.71.2.

## Fora: não toque
- O texto do e-mail/resumo copiado, os KPI tiles, os outros cards, o "Disponíveis por modelo" (não refatore o vizinho
  para "compartilhar código"), o jsonb dos snapshots já gerados.
- O momento do cadastro inline (cadastrar no clique continua), as RPCs de estorno, a máquina de estados, as sugestões
  do campo, a fila de consolidação e o significado de "Registros".
- Desativar, reativar ou apagar qualquer colaborador, em qualquer banco. Nenhuma escrita em produção além do
  apply_migration da Frente B.
- Tudo o que é do plano multiempresa: F66B, F67, os defaults de `empresa_id`, as policies existentes.
- src/components/ui/** (shadcn), dependências (regra 3, stack fechada), workflows, proteção da main,
  scripts/smoke/linha-de-base.json com número que sobe.
- O que surgir fora disso vai para o backlog do relatório (regra 1).

# Critérios de aceitação
A1. O total do card é igual ao `kpis.reservado` do mesmo relatório e à soma dos grupos (teste puro com fixture). Se o
    tile "Reservados" do grupo "Equipamentos principais" divergir desse total, o relatório explica por quê.
A2. Os grupos seguem a ordem de categoria do card vizinho, cada um com o seu total, e os itens vêm por patrimônio.
A3. Os chips aparecem só com 2 categorias ou mais, com os números iguais aos cabeçalhos.
A4. Um snapshot sem categoria (fixture) passa na forma Zod e renderiza o total + a lista corrida. Um snapshot novo
    grava `categoria` e, relido, renderiza os grupos.
A5. Os testes:
    - a função pura (vazio, 1 categoria, várias categorias, item sem categoria, singular/plural);
    - o componente em grau 1 (`*.test.tsx`, render estático), nos dois caminhos;
    - a forma Zod.
A6. A prova fotografada em docs/v1.71.1-evidencias/:
    - prévia estática com dado fictício, nos temas claro e escuro;
    - larguras 1366 e 390, sem rolagem lateral em 390;
    - a captura de impressão;
    - o card antes e depois;
    - `varrer-evidencias` com 0 ocorrência.
A7. B1 tem o roteiro verde no CI e a tabela de superfícies no relatório, com a resposta, em uma frase no topo, à
    pergunta "o que acontece com o colaborador criado numa movimentação estornada".
A8. B2 tem as contagens do ensaio e da produção, antes da migration e depois do deploy (o número do filtro "Sem uso"
    tem de bater com a contagem da regra).
A9. Um roteiro da regra B3 prova pelo menos estes casos, cada um com a afirmação certa:
    - estornada → sem uso;
    - abandonado → sem uso;
    - estornada + outra válida → em uso;
    - consolidado só com texto → em uso;
    - item lançado e estornado → sem uso;
    - detentor atual → em uso;
    - inativo → fora do selo;
    - homônimo em OUTRA empresa → não conta (use as fixtures de duas empresas que os roteiros já têm, se houver).

    Antes da regra existir, o roteiro nasce VERMELHO no CI, num push.
A10. O selo e o filtro têm teste de componente (render estático, mais `*.dom.test.tsx` para o filtro), contraste AA no
     claro e no escuro (npm run contraste, se houver token novo) e a prévia fotografada em docs/v1.71.2-evidencias/.
A11. A migration (se houver) cumpre tudo isto:
     - número ≥ 0180, com classe e rollback;
     - db:lock no mesmo commit;
     - aplicada no ensaio e depois em produção pelo MCP, antes do merge, com a sonda de efeito;
     - db:types regenerado;
     - advisors sem achado novo;
     - o rollback ensaiado do jeito que o supabase/CLAUDE.md manda.
A12. Por versão (1.71.1 e 1.71.2):
     - package.json;
     - a entrada no topo de registry.ts, com 2 a 6 mudanças em LINGUAGEM DE OPERADOR (rótulos reais das telas);
     - a entrada no CHANGELOG;
     - registry.test e cobertura-changelog verdes;
     - a tag anotada publicada;
     - /api/saude com a versão;
     - o smoke com 0 falha.
A13. lint, test, build, tsc --noEmit e verificar:actions limpos. O CI (verificar e banco-sem-docker) fica verde em cada
     PR.

# Verificação: rode de verdade
Depois de cada incremento, rode npm run lint, npm run test e npx tsc --noEmit, leia as falhas, corrija a CAUSA RAIZ e
repita até passar. Antes de cada PR, rode também npm run build e npm run verificar:actions. Não desabilite, não pule,
não apague e não afrouxe teste, trava ou catraca para ficar verde. Se uma trava reprovar algo legítimo, o motivo vai
para a ata e você ajusta o lado que ficou desatualizado. O SQL é decidido pelo CI: agrupe os pushes (cada um custa
cota de Actions) e leia o log com gh run view --log-failed. Depois de cada merge, confira o deploy, o /api/saude com a
versão nova e rode o smoke. Guarde a saída real de cada comando para o relatório.

# Autonomia e decisões
Você roda de forma autônoma (modo do CLAUDE.md, acesso total com autoproteção): ninguém responde perguntas. Não pare
para perguntar nem para pedir confirmação. A régua de decisão é:
1. esta ordem e as decisões do Johnny no cabeçalho;
2. a hierarquia do CLAUDE.md (a spec manda);
3. a opção mais simples e reversível.

Toda decisão não óbvia vira ata em docs/DECISOES.md (data · contexto · escolha · motivo).

Para os imprevistos:
- Falha que persiste depois de ~3 tentativas: mude de abordagem e registre a troca.
- O classificador de segurança barrou uma ação (apply em produção, merge, tag): não reformule para contornar. Registre,
  siga com o resto e ponha o comando exato no topo do relatório.
- MCP da Supabase ausente ou sem as ferramentas ligadas: a Frente A sai inteira (não tem migration). A Frente B fica
  com o PR aberto, sem merge, com o caminho B (o SQL, a ordem do apply e a sonda) no topo do relatório.
- A Frente B reprovou depois do apply em produção (o roteiro, as contagens ou o smoke): aplique o rollback que o CI
  ensaiou, deixe o PR sem merge e ponha a causa no topo.

# Git e segurança
- Três branches, em sequência:
  1. `v1.71.1-reservados-por-categoria`: o PR A, que leva também o commit de documentação desta ordem e o
     docs/PLAN-v1.71.1-v1.71.2.md;
  2. `v1.71.2-colaborador-sem-uso`: o PR B, aberto a partir da main já com o A mergeado;
  3. `v1.71-fecho-documentacao`: o PR C, só de docs, com o relatório final e as evidências pós-deploy.
- Commits pequenos, em pt-BR, no padrão das avulsas (`feat: … (v1.71.1)`, `test: …`, `docs: …`, `chore: versão
  1.71.1`). Uma migration nova leva o db:lock no MESMO commit.
- PRs com gh pr create, como rascunho até o CI verde. Você mesmo faz o merge (a main é protegida e o CI é o portão).
  Depois de cada merge: a tag anotada `v<versão>` no commit do merge, publicada com `git push origin v<versão>`.
- **Nunca:**
  - **no git:** push forçado, git reset --hard, git checkout -- ., git clean -fd, amend de commit que não é seu;
  - **nas migrations:** editar migration já aplicada, supabase db push, migration repair, db reset --linked;
  - **nos bancos vivos:** rodar db:seed, db:reset ou carga, ou fazer qualquer escrita fora do apply_migration (e do
    rollback, só no desfecho ruim);
  - **com dado real (regra 2):** imprimir ou gravar nome, id, patrimônio, filial ou e-mail real, seja em evidência,
    log, teste ou resposta;
  - **nas credenciais:** abrir, filtrar, imprimir ou copiar o .env.local (nem você, nem subagente) e imprimir token;
  - **no repositório:** mexer na proteção da main, nos workflows ou nas dependências.

# Como trabalhar
1. Explore com subagentes paralelos, cada um voltando SÓ com resumo e números medidos. O prompt de cada subagente diz,
   com todas as letras, que ele não abre o .env.local e que, de banco, só lê catálogo, contagem e texto de esquema.
   As frentes de exploração:
   - (a) os relatórios: os fatos 2 a 7, a ordem de categoria do card vizinho, as regras de impressão e de mobile, as
     prévias de scripts/design;
   - (b) o colaborador: os fatos 8 a 14, a última definição das funções de estorno no ensaio, todas as superfícies em
     que a pessoa aparece, e a consolidação e a chave;
   - (c) o banco e as travas: o que uma view nova precisa para passar nos catálogos, no recorte por empresa, na forma
     multiempresa, no injetor, no gate de tipos e na forma Zod, mais as contagens B2 "antes".
2. Escreva docs/PLAN-v1.71.1-v1.71.2.md, autossuficiente (arquivos, interfaces, a regra B3 por extenso, o que está fora
   e a verificação de ponta a ponta), antes do primeiro commit que toca src/, supabase/ ou scripts/.
3. Execute a Frente A inteira até a tag v1.71.1. Depois, a Frente B: primeiro o roteiro vermelho, depois a migration
   (ensaio, e então produção), as queries, a tela e a ajuda, até a tag v1.71.2. Por último, o PR C. A edição é
   sequencial. Paralelize a exploração, a medição e a revisão, não a edição.
4. Antes de cada PR sair do rascunho, faça a revisão adversarial por subagentes em contexto fresco, lendo o diff contra
   o PLAN e os critérios. Para a Frente A, eles respondem:
   - o snapshot antigo ainda abre?
   - o total bate com o KPI?
   - a ordem é a do vizinho?
   - algum href vazou para o visualizador?
   - alguma classe foi montada em runtime?
   - um 'use client' importa de src/lib/queries?

   Para a Frente B, respondem:
   - a regra marca por engano o consolidado, o detentor atual ou alguém de outra empresa?
   - alguma contagem saiu de linhas lidas no cliente?
   - a view passou por todas as travas, ou ganhou exceção?
   - algum estado mudou sozinho?
   - alguma evidência tem dado real?
   - algo fora do escopo foi tocado?

   Cada achado passa por um cético instruído a refutá-lo. Aponte só lacunas de correção ou de requisito declarado, não
   preferências de estilo. Corrija e re-revise até limpar.

# Relatório final
docs/RELATORIO-v1.71.1-v1.71.2.md, em pt-BR, registrado no índice de docs. O conteúdo, nesta ordem:
- **No TOPO:** a resposta em uma frase à pergunta do Johnny sobre o colaborador estornado; o roteiro do Johnny (onde
  clicar para ver o card novo e o selo); qualquer comando que ficou para ele (caminho B, classificador).
- A tabela de superfícies do B1.
- As contagens B2, antes e depois.
- O que mudou, por arquivo.
- As decisões (aponte as atas).
- As evidências, com a saída REAL de lint, test, build, tsc, CI, smoke e /api/saude, colada.
- As pendências e o backlog (por exemplo, "o cadastro só nasce ao salvar", "desativar em lote os sem uso", "o card
  mostra para quem está reservado").

"Passou" sem saída não vale. Termine a resposta com um resumo de 5 linhas em pt-BR.

# Idioma
- Narrativa, plano, ata, relatório, UI e commits em pt-BR.
- Código pela convenção do repositório: domínio em português sem acento (`agruparReservados`, `uso_efetivo`),
  utilitário e infra em inglês.
- O registry.ts vai em linguagem de operador: há teste que recusa termo de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~10 minutos)

A Frente A é só código. A Frente B cria uma migration (provavelmente uma view) e o agente a aplica no ensaio e em
produção pelo MCP da Supabase, antes do merge. É o fluxo das F53→F66. O item do pré-voo que mais importa é o MCP com as
ferramentas ligadas. Sem ele, a v1.71.1 sai inteira e a v1.71.2 fica com o PR aberto, sem merge.

Este arquivo já está salvo em `docs/prompts/prompt-reservados-por-categoria-e-colaborador-sem-uso.md`, **sem commit**.
O agente o commita no PR A. O prompt aponta para o arquivo, então ele precisa estar lá quando você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.71.0, tag v1.71.0 no merge do PR #81 (47344c9); fora do git, só este arquivo.
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short
Test-Path .git\index.lock    # tem de dar False
Test-Path docs\prompts\prompt-reservados-por-categoria-e-colaborador-sem-uso.md   # tem de dar True

# 3. Produção em 1.71.0, e o smoke passa HOJE.
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
node scripts/smoke/smoke-prod.mjs

# 4. O MCP da Supabase, o gh e a versão do Claude Code (o modo auto exige 2.1.83+).
claude mcp list
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

Ainda no pré-voo:
- **No conector da Supabase do claude.ai:** `execute_sql`, `apply_migration`, `list_migrations`, `get_advisors` e
  `generate_typescript_types` têm de estar ligados, enxergando a produção (`pbtjcalbmepmrqzprusb`) e o ensaio
  (`sgmvldiizsrjbxzzpmhh`).
- **Dentro do Claude Code:** `/permissions` não pode negar `git push`, `gh`, `node`, `npx tsx` nem o MCP, e o
  `CLAUDE.md` do projeto tem de aparecer em `/memory`.
- **A cota de Actions** (github.com/settings/billing): são três PRs, e o roteiro da Frente B nasce vermelho de
  propósito, o que custa um push a mais.

### Rodar

```powershell
claude --model opus --permission-mode auto -n v1-71-reservados-colaborador
# cole o bloco do prompt inteiro e deixe rodando
```

**Por que o modo `auto`.** A run edita, roda testes e build, aplica a migration por MCP em dois bancos, abre e mergeia
PRs, publica duas tags e roda o smoke. Isso não cabe numa allowlist estreita, e `bypassPermissions` numa máquina com
credencial de produção está fora de questão. **Onde o classificador pode barrar:** no `apply_migration` em produção, no
merge na `main` e no push da tag. O prompt manda não reformular: o agente registra e deixa o comando no topo do
relatório.

**`--worktree` não serve.** O smoke e o `varrer-evidencias` precisam do `.env.local`, que não vai para a worktree.
Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** É bem menor que uma fase do plano multiempresa: a Frente A é UI com testes, e a B é um roteiro, uma view e
um selo. Se a cota semanal estiver apertada, use `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude`: a
exploração e a medição vão no modelo mais barato e a revisão adversarial continua rendendo no orquestrador.

**Condição de parada com avaliador separado.** Digite logo depois de colar o prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-v1.71.1-v1.71.2.md e docs/RELATORIO-v1.71.1-v1.71.2.md existem; e UM destes desfechos: (a) PR A e PR B mergeados com verificar e banco-sem-docker verdes, tags v1.71.1 e v1.71.2 publicadas, /api/saude em 1.71.2, smoke sem falha, contagens B2 antes e depois no relatorio, e PR C de documentacao mergeado; (b) v1.71.1 entregue e a Frente B com PR aberto sem merge porque o MCP faltou, o classificador barrou o apply ou o merge, ou a verificacao pos-apply reprovou (com rollback aplicado), com o comando ou a causa no topo do relatorio; ou (c) o mapa do CLAUDE.md nao bateu e a run parou antes de editar, com a divergencia no relatorio
```

**Headless** (só se precisar): salve só o bloco do prompt em `..\prompt-v1-71.txt`, fora do repositório, e passe por
stdin, em UTF-8 sem BOM, como nas fases anteriores:

```powershell
$utf8 = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-v1-71.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-v1-71.json
# guarde o session_id: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador aborta a sessão e o `/goal` não se aplica. Como a Frente B aplica em
produção, **prefira a sessão interativa com o `/goal`**, com a suspensão do Windows desligada no plano de energia.

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Quatro momentos para acompanhar:
1. **O plano.** `docs/PLAN-v1.71.1-v1.71.2.md`, com a regra B3 escrita por extenso. A pessoa consolidada que só tem
   histórico em texto tem de aparecer como "em uso".
2. **As contagens "antes".** Só números. Se aparecer um nome, um id ou um patrimônio na evidência ou na tela,
   interrompa a sessão.
3. **A v1.71.1 no ar.** `/api/saude` em `1.71.1` e a prévia fotografada em `docs/v1.71.1-evidencias/`.
4. **A Frente B.** O roteiro vermelho no CI, a migration no ensaio e depois em produção, o PR B mergeado, `/api/saude`
   em `1.71.2`.

### Ao voltar

1. **Leia a frase do topo do relatório:** é a resposta sobre o colaborador estornado. Execute o roteiro que vem logo
   abaixo dela.
2. **Abra o relatório de uma filial com reservados** e confira:
   - o total no subtítulo;
   - os chips;
   - os grupos por categoria;
   - o mesmo número do KPI "Reservados" do topo.

   Abra também um relatório GERADO ANTIGO: tem de abrir com o total e a lista corrida, sem erro. Imprima um para ver a
   quebra.
3. **Em Administração › Colaboradores**, use o filtro "Uso: Sem uso" e confira:
   - a quantidade bate com a contagem B2 do relatório;
   - alguém que você sabe que recebeu equipamento antes do cadastro existir NÃO pode estar ali.

   Desative quem você quiser pelo "Editar". Isso é decisão sua, e o sistema não faz sozinho.
4. **Confira o diff:** `git diff v1.71.0 v1.71.2 --stat`.

   Devem aparecer:
   - `src/components/relatorios/lista-reservados.tsx`, `src/lib/relatorios/**`, `src/lib/queries/relatorios/estoque.ts`
     e `src/lib/queries/formas/relatorios-gerados.ts`;
   - `src/lib/queries/colaboradores.ts` e `src/components/admin/colaboradores-tabela.tsx`;
   - `supabase/migrations/0180_*`, `supabase/migrations.lock.json`, `supabase/tests/**` e
     `src/lib/types/database.ts` (regenerado);
   - `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`.

   **Não** devem aparecer:
   - as RPCs de estorno;
   - `campo-colaborador.tsx` e `criarColaboradorInline`;
   - `src/components/ui/**`;
   - workflows;
   - mudança de dependência no `package-lock.json`;
   - migration antiga alterada.
5. **Rode você mesmo `npm run test`** uma vez.
6. **Veio errado de forma ampla?** Regra dos 2 strikes: depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **Avulsa, não fase.** São duas versões PATCH (`1.71.1` e `1.71.2`), uma por entrega, e não uma F nova no meio do
   plano multiempresa. A F66B continua sendo a próxima fase (1.72.0).
2. **Dois PRs de código, e não um.** A Frente A não tem migration e sai mesmo se o MCP faltar. A B depende do apply em
   produção. Separadas, uma não segura a outra.
3. **Chips só com 2 categorias ou mais.** Com uma, o chip repetiria o cabeçalho do grupo. Os chips são resumo, não link
   nem filtro.
4. **O snapshot antigo não é reescrito nem relido.** Ele mostra o total + a lista corrida de hoje. Agrupar exigiria ler
   o banco, e o snapshot é congelado.
5. **O texto do e-mail/resumo copiado não muda.** Você falou do card, não do resumo. Se quiser a contagem por
   categoria no texto copiado também, é um ajuste pequeno, para depois.
6. **A regra de "uso efetivo" casa também pela chave do nome**, não só pelo id. Sem isso, toda pessoa criada pela fila
   de consolidação (histórico só em texto) seria marcada "Sem uso" por engano. É o fato 13, e a run o confirma
   contando antes.
7. **O detentor atual de um ativo conta como uso**, mesmo que o vínculo venha do histórico em texto ou da carga do
   go-live.
8. **"Registros" mantém o significado de hoje** (tudo o que está vinculado, inclusive o estornado). O selo diz o
   porquê, para os dois números não se contradizerem na tela.
9. **O agente aplica a migration no ensaio E em produção, antes do merge**, pelo MCP. É o seu fluxo padrão desde a F53,
   não decisão nova.

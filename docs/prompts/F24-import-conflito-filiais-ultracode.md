ultracode

# Ordem de serviço F24 — Import: conflito entre filiais deixa de bloquear e ganha mesa de resolução

> Ordem de 30/07/2026, emitida pelo Johnny. Sucede a F23 (`docs/prompts/F23-dev-destrutivo-ultracode.md` · `docs/RELATORIO-F23.md`). Em conflito entre esta ordem e a spec/ADRs, **esta ordem manda** — emende os documentos e registre em `docs/DECISOES.md`. Numeração: na escrita desta ordem, a última fase era a F23 e a última migration a `0090`. **Confira os números livres reais antes de começar**; colisão → renumere (precedente F19/F20B) e registre. Se `git status` mostrar trabalho não commitado de outra sessão, PARE e reporte (regra da casa: uma ordem por vez) — **exceto o próprio arquivo desta ordem** (`docs/prompts/F24-import-conflito-filiais-ultracode.md`), que é insumo da fase: commite-o no primeiro commit.

## Missão

Hoje, uma linha do CSV cujo par patrimônio+service tag já existe em OUTRA filial **bloqueia o import inteiro** (`patrimonio_em_outra_filial`, F7C) e a única saída é remover a linha. Decisão do Johnny (30/07/2026), que **revoga parcialmente a decisão F7C de 17/07**: o conflito **deixa de bloquear** — a linha importa, os dois cadastros coexistem e o par vira a pendência **"conflito entre filiais"**. A página `/pendencias` ganha uma **mesa própria** que mostra os (2+) ativos do conflito **juntos, lado a lado**, com as diferenças entre eles realçadas e o histórico resumido de cada lado, para decidir qual cadastro é o correto. E dessa mesa se **apaga** o(s) errado(s) — um a um, **em massa por seleção com checkbox + botão**, ou **"apagar ambos"** — com a exclusão **presa a essa pendência**: nenhum ativo fora de um conflito é alcançável por esse caminho, request forjado incluso.

O que NÃO muda: o import continua **não transferindo** ativo entre filiais (transferência é operação do sistema); e exclusão de ativo fora da mesa continua sendo exclusividade do dev na Zona destrutiva (F23). Decisões do Johnny fechadas nesta ordem: quem apaga na mesa é o **nível administrador (admin e dev)** — todo logado vê a mesa, mas operador/consulta veem sem checkboxes e sem botões; ativo com **histórico real** além da carga do import **pode** ser apagado, com **aviso destacado** e as contagens reais no diálogo.

## Contexto (leia a origem, não descrições dela)

- Doutrina: `@CLAUDE.md` (modo autônomo; regra 2 — import; §Modelo de acesso) · `@docs/RUNBOOK-BANCO.md` (**"O gate do modo automático"** e os caminhos A/B — esta ordem BATE no gate: a RPC nova contém exclusão de acervo).
- **A regra que esta ordem revoga, no código** — mapeie ANTES de mexer: o bloqueante `patrimonio_em_outra_filial` nasce na 2ª passada do motor (`@src/lib/import/plano.ts`, bloco F7C) com as chaves de identidade de `@src/lib/patrimonio.ts` (`chavePatrimonio`; `∅::<service tag>` para os sem patrimônio); a consulta que o alimenta é `paresEmOutrasFiliais` (`@src/lib/queries/import-logs.ts`); o kind `existe_em_outra_filial` (só-remover) vive em `@src/lib/import/tipos.ts` e `@src/lib/import/correcoes.ts`; a action das duas passadas é `validarImport` (`@src/lib/actions/importar.ts`). A doutrina revogada: `docs/DECISOES.md` (2026-07-17 · F7C, decisão 4) e spec `@docs/ESPECIFICACAO.md` §10.2.
- **A rede que hoje impede o par em duas filiais**: os índices únicos GLOBAIS de identidade — `ativos_patrimonio_service_tag_uidx` (`patrimonio + coalesce(service_tag,'')`) e o parcial `ativos_service_tag_sem_patrimonio_uidx` (F7E/`0034`). Localize as definições VIGENTES por `pg_indexes` nos DOIS bancos (parte pode vir do baseline pré-migrations) — nesta ordem eles viram índices POR FILIAL.
- Pendências: views `v_pendencias` (`0028`) e `v_fila_pendencias` (F18, `0050`–`0053`) · `@src/lib/queries/pendencias-detalhe.ts` (buckets, badge, export) · `@src/lib/pendencias/rotulos.ts` e `@src/lib/pendencias/filtro.ts` (fonte única de tipo/rótulo/predicado) · `@src/app/(app)/pendencias/page.tsx` · `@src/components/pendencias/**` (a fila da F18 já faz **seleção em lote** — o precedente de UI com checkbox desta ordem).
- **O padrão destrutivo a seguir (F23)**: `guarda_acervo` (`0081` — DELETE em `ativos`/`movimentacoes` só passa pela janela GUC `estoque.dev_destrutivo`, local à transação, fechada ao sair inclusive em erro); `apagar_ativo` (`0082`, revisões `0087`/`0090` — backup jsonb no evento, trilha NA MESMA transação, termo de lote que mistura ativos, `arquivos_termos` devolvidos para a action limpar após o commit com conferência de órfãos — `limparArquivosDeTermo` em `@src/lib/actions/dev-destrutivo.ts`); confirmação digitada validada na action E na RPC (`@src/lib/validators/dev-destrutivo.ts`); e a RPC de import como precedente de **RPC não-dev que abre a janela** (`0080`).
- Acesso: `e_admin()` = admin OU dev (`0072`); guardas de action em `@src/lib/auth/acesso.ts` (`exigirAdmin` é a MENSAGEM pt-BR, a RPC é a trava); trilha `eventos_admin` + vocabulário `ACOES_ADMIN`/`ACAO_ROTULO` em `@src/lib/auditoria.ts` (regra "mexeu aqui, mexa lá" da `0065`).
- Tradução de erros: `@src/lib/actions/erros.ts` (o 23505 hoje é lido como "índice do import" — textos e casos mudam quando o índice vira por-filial).
- Documentação viva que esta ordem emenda: spec §5/§6/§10.2 · `@docs/MATRIZ-REGRAS.md` (regras R-IMP afetadas) · ajuda F20 (`@src/lib/ajuda/conteudo/import-de-startup.ts`, `resolver-pendencias.ts`, `problemas-import-e-acesso.ts`, `mensagens-de-erro.ts` — os guardas de cobertura/vocabulário derivado QUEBRAM o build se esquecer).
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run db:types` · smoke `scripts/smoke/smoke-prod.mjs` · roteiros `supabase/tests/` (`import_substituir.sql`, `dev_destrutivo.sql`, `papeis_rls.sql`). **Meça a baseline ANTES de mudar qualquer coisa** e cole no relatório.
- APIs externas (regra 6 do CLAUDE.md): confira na documentação oficial vigente (MCP Context7) o que usar de Supabase SSR/Storage. Não escreva de memória.

## Escopo

**Dentro:** migrations novas a partir do próximo número livre (índices por filial; a fonte derivada dos conflitos; a RPC de exclusão restrita; vocabulário de eventos; coluna aditiva em `import_logs` se o desenho pedir); motor do import (bloqueante→aviso); tela `/pendencias` (mesa de conflitos + tipo/filtro/chip/badge/CSV); Server Action + validator + queries novos; roteiro SQL novo + emendas nos existentes; Vitest; smoke; ajuda F20; documentação (spec, MATRIZ-REGRAS, CLAUDE.md, DECISOES) e encerramento padrão.

**Fora (não toque):** a Zona destrutiva do dev e TODAS as RPCs da F23 (a mesa não mora lá, não as chama e não as altera); a `guarda_acervo` fica **como está** (a RPC nova é mais um caminho oficial que abre a janela — precedente `0080`); o modo *Atualizar* do import (segue adiado) e qualquer sincronização recorrente; **transferir ativo como "resolução" do conflito** (fora — quem quiser transferir usa o fluxo normal de movimentação); o cadastro manual e a edição de ficha **continuam recusando** par duplicado em QUALQUER filial (o conflito só nasce do import — ver §1.4); o visualizador por senha; dependência nova; `src/components/ui/**`; migration aplicada não se edita; seed em produção JAMAIS; **nenhuma exclusão real em produção nesta ordem** (a mesa se instala e se prova com dado fictício; usar é decisão de quem opera).

## O modelo a implementar

### 1. Banco: identidade por filial + fonte derivada do conflito

1.1. **Índices por filial.** Os dois índices únicos de identidade passam a incluir `filial_id` (ex.: `(filial_id, patrimonio, coalesce(service_tag,''))`; o parcial idem). DENTRO da mesma filial nada muda — duplicata segue impossível, o dedupe interno do CSV fica intacto; ENTRE filiais o par duplicado passa a PODER existir — esse é o estado "em conflito". Recriação com verificação pós-apply nos dois bancos.

1.2. **Conflito é DERIVADO, não gravado.** Nada de flag nem tabela de estado: uma view (sugestão: `v_conflitos_filiais`, `security_invoker` como as vizinhas) agrupa ativos pela MESMA chave de identidade do motor (par com patrimônio; `∅::<tag>` sem patrimônio) presente em **mais de uma filial**, e devolve o GRUPO (2+ ativos — três filiais é raro mas possível; não force par). O conflito **some sozinho** quando o grupo deixa de existir: apagou um lado, corrigiu patrimônio/service tag na ficha, transferiu pelo fluxo normal. A definição do grupo mora num **lugar só** (a view, ou uma função SQL que a view e a RPC do §4 compartilham) — duas cópias da regra é o caminho para a mesa e a RPC discordarem. Se a medição provar que a derivação é cara para a mesa (EXPLAIN com o volume real — ~1,2 mil ativos e ~2,4 mil movimentações em produção), a alternativa materializada entra com trigger de manutenção — decida MEDINDO e registre.

1.3. **`ativos.pendencia` (texto livre) NÃO ganha trecho de conflito** — o campo é editável e `;`-joinável, e dessincronizaria da derivação. O tipo `'conflito'` entra pela fonte própria (§3.3).

1.4. **A regra de produto "não crie duplicata" fica.** Cadastro manual (compra), corrigir patrimônio e definir service tag hoje contam com o índice GLOBAL como rede; com o índice por filial, a checagem dessas ações vira a única linha global — **audite os pontos** que validam o par, garanta que seguem recusando par existente em QUALQUER filial com mensagem pt-BR, e cubra por teste. (Corrida entre duas abas deixa de ser barrada pelo banco nesse caso; aceite — é o modelo de outras validações da casa — e registre.)

### 2. Import: o conflito vira aviso

2.1. No motor, `patrimonio_em_outra_filial` sai de `bloqueantes` e vira **aviso âmbar** (tier F7F), agrupado por filial-dona como hoje, com texto que diz o que vai acontecer ("N linhas também existem na filial X — importam e abrem conflito para resolver em Pendências"). A correção **remover a linha** continua existindo, agora **opcional**. `resumo` ganha o contador (ex.: `resumo.conflitos`), exibido no preview. Manter ou renomear o `tipo` do erro é decisão sua — a página de mensagens de erro da ajuda mapeia esses textos; rode os guardas.

2.2. **Nenhuma outra régua muda**: dedupe interno, descartado bloqueante, site de outra filial (só-remover), patrimônio/ST/datas — **o import sem conflito tem de sair byte a byte igual** (mesmos erros, avisos, contagens, plano). `paresEmOutrasFiliais` e a 2ª passada de `validarImport` continuam existindo — muda o veredito, não a detecção.

2.3. **Resultado + histórico** (decisão do Johnny): o painel de sucesso mostra "N conflitos abertos" com link para a mesa; `import_logs` guarda a contagem (coluna aditiva, default 0) e o evento `import_executado` a carrega no detalhe. Se a RPC `importar_ativos_substituir` precisar mudar para contar/registrar, é `create or replace` PURO com diff mínimo (precedente `0048`/`0080`) — meça se a contagem sai melhor da RPC ou da action e registre.

### 3. A mesa de conflitos em `/pendencias`

3.1. Seção própria "Conflitos entre filiais" (aba ou bloco destacado — decida pela clareza), servida por query paginada da fonte do §1.2. Cada linha da mesa é UM GRUPO com os ativos **lado a lado**: patrimônio/service tag, filial, estado, colaborador/setor, marca/modelo, hostname, data de entrada, e link para a ficha de cada um.

3.2. **Diff campo a campo** (decisão do Johnny): os campos que DIVERGEM entre os lados são realçados visualmente (função pura de comparação, testada). **Resumo de histórico por lado** (decisão do Johnny): nº de movimentações, nº de termos e a última movimentação (data + tipo) de cada ativo — quem tem vida real de sistema provavelmente é o cadastro certo; o lado com histórico real além da carga do import ganha o selo que o §4.3 reusa no diálogo. Agregue no servidor com custo medido (a mesa é paginada).

3.3. **Contagem e navegação:** o tipo `'conflito'` entra no vocabulário de pendências (rotulos/filtro/classificação/CSV — fonte única; os testes derivados quebram se esquecer); o badge da sidebar e os chips passam a incluir os conflitos — **sugestão: um GRUPO = 1 pendência** (decida e registre); as linhas de conflito NÃO duplicam na fila genérica (a mesa é a casa delas — registre a leitura). Export CSV da mesa: siga o padrão de `exportar.ts` se sair barato; senão registre como backlog.

3.4. **Seleção e ações** (precedente da fila F18): checkbox por ATIVO (não por grupo), "selecionar todos" no cabeçalho, botão **"Apagar selecionados (N)"**; atalho por grupo **"Apagar ambos"** (ou "Apagar os 3"). Visível e habilitado só para nível administrador — na UI pelo papel; a segurança é a RPC.

### 4. A exclusão restrita ao conflito (o coração da ordem)

4.1. **RPC nova** `security definer` (sugestão: `apagar_ativos_conflito_filiais(p_ativos uuid[], p_confirmacao text, p_justificativa text) returns jsonb`), grants só `authenticated` (anon/service_role = false, padrão `0040`), com, NA ORDEM: guarda de cargo interna **`e_admin()`** (42501 na recusa); confirmação + justificativa (≥10 caracteres, padrão da casa) validadas também aqui; **lock + revalidação DENTRO da transação** de que CADA id pertence a um grupo de conflito ATIVO pela MESMA definição do §1.2 — **qualquer um fora → recusa TUDO** (all-or-nothing), mensagem pt-BR dizendo qual; janela `estoque.dev_destrutivo` aberta SÓ no trecho destrutivo e fechada ao sair, **inclusive em erro** (lição F22/F23); exclusão do rastro no MESMO desenho da `apagar_ativo` da `0082` (movimentações, pendências de item, anotações, termos — termo de LOTE que cita ativo fora da seleção recusa aquele ativo, mesma regra da F23; `arquivos_termos` devolvidos para a action limpar após o commit, com o backstop de órfãos); **trilha DENTRO da transação** — se a trilha falhar, nada é apagado.

4.2. **Backup antes da perda** (régua 1.4 da F23): as linhas apagadas (ativos + movimentações + termos) em jsonb no `detalhe` do evento com cap sensato; lote acima do cap → arquivo no bucket `backups-import` **conferido pela RPC** antes de apagar (precedente `0083`/`0089`). Escolha os números MEDINDO (o primeiro caso real teve 6 ativos — Serra × Linhares/Matriz) e registre.

4.3. **O diálogo** (padrão `dialogo-destrutivo` da F23): resumo REAL lido na hora — quantos ativos por filial, quantas movimentações/termos morrem juntos — e o **aviso destacado** quando um selecionado tem histórico real além da carga do import (decisão do Johnny: permite, avisando; defina "carga do import" com precisão MEDIDA — ex.: só as movimentações com o marcador `import startup` — e registre); **confirmação digitada que force a leitura do tamanho** (sugestão: `APAGAR <N>`; decida e registre) validada NA ACTION E NA RPC; justificativa única por operação; resultado com números.

4.4. **Vocabulário e trilha:** ação nova em `ACOES_ADMIN`/`ACAO_ROTULO` + comment da `0065` (sugestão: `conflito_filiais_resolvido`); o evento carrega ids, patrimônios, filiais, contagens, justificativa e o backup (jsonb ou path). A Auditoria (`/admin/usuarios` e `/dev`) exibe e exporta.

4.5. **Nenhum atalho fora da mesa**: nada na ficha, nas listas, na paleta. A action nova mora em módulo `'use server'` que passa nos guardas (`use-server-exports`, `verificar-actions-build.mjs`).

### 5. Efeitos colaterais — MEÇA, não presuma

5.1. **Transferência para a filial do gêmeo** agora colide no índice por filial (via trigger `aplicar_movimentacao`): recuse com mensagem pt-BR acionável ("já existe um ativo com este patrimônio+service tag na filial de destino — resolva o conflito antes de transferir") no lugar do 23505 cru; cubra no roteiro.

5.2. **Buscas por par que assumiam resultado único** (colar/bipar lista M1, comboboxes, geração de termo, corrigir patrimônio): a casa JÁ trata patrimônio repetido (regra do CLAUDE.md); confira que par repetido ENTRE filiais também cai no tratamento de múltiplos (desempate com a filial visível) e nada explode com 2 resultados.

5.3. **Relatórios/KPIs**: ativo em conflito conta normal nos números da filial dele (são dois cadastros reais até alguém decidir) — confirme que nada quebra e registre a leitura na spec.

5.4. **`dev_checagens_integridade`**: avalie acrescentar uma checagem só-leitura barata (ex.: nº de grupos de conflito abertos — SQL FIXO, precedente `0077`/`0085`); decida e registre.

5.5. **`traduzErroBanco`**: os ramos de 23505 e os textos que citavam o índice global ganham os casos novos.

### 6. Migrations, o GATE e produção

A RPC nova contém `delete from public.ativos`/`delete from public.movimentacoes` — **bate no gate do modo automático**. Não brigue com ele (precedente F23/`0080`): tente o apply por MCP UMA vez no ENSAIO; bloqueado → **caminho B do runbook** (migration no repo + SQL de handoff em `scratchpad/` + verificação pós-apply escrita + `notify pgrst, 'reload schema'`), registre "pendente de execução manual pelo Johnny" e siga com o resto. Roteiros e scripts SEM os literais que o gate caça (o texto fica confinado às migrations; os roteiros chamam as RPCs). Índices e view são aditivos/não-destrutivos → caminho A (ensaio primeiro, produção depois, verificação pós-apply SEMPRE). Valor novo de enum, se houver, em migration SOZINHA (precedente `0044`/`0071`). `db:types` regenerado. Advisors sem WARN novo.

### 7. Testes

- **Roteiro SQL novo** `supabase/tests/conflito_filiais.sql` (padrão auto-verificável da pasta), provando no MÍNIMO: import com par de outra filial APLICA e o grupo aparece na fonte; dentro da MESMA filial a duplicata segue impossível; a RPC apaga 1 lado / vários / ambos e o grupo some; **lista com QUALQUER ativo fora de conflito → recusa TUDO**; operador/consulta não executam (request forjado incluso); service role sem EXECUTE; confirmação/justificativa não contornáveis; UPDATE/DELETE direto segue recusado fora das janelas (`guarda_acervo` intacta); `apagar_ativo` do dev e o estorno comum continuam funcionando; transferência para a filial do gêmeo recusa com a mensagem nova; termo de lote misto recusa o ativo certo. Ensaio completo com dado 100% fictício; produção só read-only/recusas.
- **Emendas**: `import_substituir.sql` (as asserções R-IMP que citavam o bloqueio) e o que mais acusar — regra do runbook: mexeu em função/trigger/RPC, rode TODOS os roteiros.
- **Vitest**: motor (bloqueante→aviso, resumo, mensagens), diff puro da mesa, validators novos, classificação/rótulos de pendência. Testes existentes do motor F7*/ajuda/registry NÃO se deletam — se quebrarem, é efeito real a acomodar.
- **Smoke**: acrescente a conferência read-only da mesa (200 + marcador de conteúdo) se o padrão comportar.

## Critérios de aceitação

1. **Não bloqueia mais**: no ensaio, um CSV fictício com par existente em outra filial APLICA (antes bloqueava); preview com aviso âmbar e contagem certa; resultado e histórico mostram os conflitos abertos.
2. **A mesa**: `/pendencias` mostra o grupo com os ativos JUNTOS, diff realçado, resumo de histórico por lado e link para as fichas; badge/chips/CSV incluem o tipo novo conforme a decisão registrada.
3. **Apagar**: um lado, seleção em massa (checkbox + selecionar todos + botão com contagem) e "apagar ambos" funcionam; rastro e contagens conferem; o grupo some da mesa após a operação (revalidação de cache).
4. **Contenção** (o item mais importante para o Johnny, provado por roteiro): request com QUALQUER ativo fora de conflito não apaga NADA; operador/consulta/forjado recusados; service role sem EXECUTE; confirmação+justificativa exigidas nas DUAS camadas; nenhum atalho de UI fora da mesa; `guarda_acervo` e as ferramentas da F23 intactas.
5. **Mesma filial**: duplicata interna segue impossível (índice por filial + motor); cadastro manual/corrigir patrimônio/definir service tag seguem recusando par de qualquer filial (provado por teste).
6. **Transferência** para a filial do gêmeo recusa com mensagem pt-BR acionável.
7. **Sem regressão**: import sem conflito byte a byte igual; visualizador intocado; advisors sem WARN novo; roteiros vizinhos verdes; smoke pós-deploy OK.
8. **Trilha/backup**: toda exclusão gera evento na MESMA transação com justificativa/contagens/backup; a Auditoria exibe e exporta.
9. **Portões**: `npm run lint`, `npm run test`, `npm run build` limpos; roteiros SQL verdes (ensaio completo; produção read-only); `database.ts` regenerado; migrations aplicadas OU handoff do gate registrado com SQL pronto e conferência escrita; deploy READY + smoke pós-deploy.
10. **Docs**: spec §5/§6/§10.2 emendadas (o "bloqueia" cai; o "não transfere" FICA), MATRIZ-REGRAS (R-IMP afetadas), CLAUDE.md (regra 2 + a exceção nova de exclusão no §Modelo de acesso), ajuda F20, `docs/DECISOES.md` (uma ata por decisão), CHANGELOG, README, `docs/prompts/README.md` (linha F24), `docs/RELATORIO-F24.md`.

## §V — Verificação (rode de verdade, itere até passar)

Meça a baseline (lint/test/build + contagem de testes) ANTES de qualquer mudança e cole no relatório. A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a CAUSA RAIZ, repita; nunca suprima erro nem desabilite/delete teste para passar. Roteiros SQL no ensaio com dado 100% fictício (`WAP0001234`/"Fulano"); produção só recebe apply + verificação pós-apply + advisors + smoke, jamais execução destrutiva. Ao final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão, atenção especial a: a exclusão escapa do conflito por algum caminho (request forjado, TOCTOU entre a leitura e o delete, id repetido no array, grupo que se desfaz no meio da transação)?; a janela GUC fecha em TODO caminho de erro?; o import sem conflito mudou em algum byte observável?; par na MESMA filial voltou a ser possível por algum caminho (import, RPC, corrida)?; a fonte derivada escala no volume real?; o badge conta dobrado (fila + mesa)?; transferência, termo de lote e estorno nos casos do §5; os testes derivados da ajuda passam por acomodação real, não por afrouxamento? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise até limpar.

## Autonomia, decisões e git

Você roda de forma autônoma (modo do CLAUDE.md): ninguém responderá perguntas — não pare, não espere confirmação. Régua: (1) esta ordem; (2) spec/ADRs/RUNBOOK e as convenções do repositório; (3) a opção mais simples e reversível — decisões não-óbvias em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha 3 vezes → troque de abordagem e registre. Bloqueio real → contorne com segurança ou siga com o resto e registre a pendência. Se o ambiente vetar um passo sensível (o gate no apply, push), NÃO insista até abortar: deixe o SQL/comando exato pronto e provado no ensaio, registre "pendente de execução manual" e siga. Git: commits pequenos em pt-BR estilo conventional (`feat(f24): …`); branch opcional (`f24-conflito-filiais`) com merge próprio ao fechar o checklist; PROIBIDO push forçado, reset destrutivo de git, commitar `.env*`, dado real em seed/fixture/teste/screenshot.

## §R — Encerramento e relatório

`CHANGELOG.md` (topo) · `docs/prompts/README.md` (linha da F24) · `README.md` (status) · `docs/DECISOES.md` · `docs/RELATORIO-F24.md` em pt-BR com: o que mudou e por quê; o checklist desta ordem autoverificado item a item; **evidências coladas** (saídas reais de lint/test/build, dos roteiros SQL, das verificações pós-apply, dos advisors e do smoke — afirmação sem saída não vale); decisões; pendências (o handoff do gate, se houver, com o caminho do SQL em `scratchpad/`); a seção "o que este relatório NÃO prova"; e o roteiro manual de 5 minutos para o Johnny — sugestão: importar no ENSAIO um CSV fictício que conflita com outra filial, ver o aviso âmbar e o resultado com a contagem, abrir a mesa, conferir diff + resumo de histórico, apagar um lado sozinho, "apagar ambos" noutro grupo, tentar apagar como operador (recusa) e conferir a trilha na Auditoria. Push = deploy Vercel, só com o §V inteiro verde. Termine a resposta final com um resumo de ~5 linhas em pt-BR.

## Idioma

UI, mensagens, erros, commits, docs e relatório em pt-BR; identificadores de domínio em português sem acento (`v_conflitos_filiais`, `apagar_ativos_conflito_filiais`, `conflito_filiais_resolvido`); utilitários/infra em inglês — a convenção vigente do repositório.

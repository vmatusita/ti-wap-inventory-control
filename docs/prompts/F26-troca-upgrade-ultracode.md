ultracode

# Ordem de serviço F26 — Facilitador troca/upgrade: devolução e saída do par registradas na mesma tela

> Ordem de 04/08/2026, emitida pelo Johnny. Sucede a F25 (`docs/prompts/F25-celular-cidade-filtros-ultracode.md` · `docs/RELATORIO-F25.md`). Em conflito entre esta ordem e a spec/ADRs, **esta ordem manda** — emende os documentos e registre em `docs/DECISOES.md`. Numeração: na escrita desta ordem, a última fase era a F25 e a última migration a `0102`. **Confira o número de fase livre real antes de começar**; colisão → renumere (precedente F19/F20B) e registre. Esta ordem **não cria migration nenhuma** — se você se pegar escrevendo uma, o desenho saiu do trilho (a decisão registrada é "só a tela"; ver Escopo): pare e repense. Se `git status` mostrar trabalho não commitado de outra sessão, PARE e reporte (regra da casa: uma ordem por vez) — **exceto o próprio arquivo desta ordem** (`docs/prompts/F26-troca-upgrade-ultracode.md`), que é insumo da fase: commite-o no primeiro commit.

## Missão

A troca/upgrade de equipamento é UMA operação do mundo real que hoje exige DUAS passadas completas pelo fluxo de nova movimentação: devolver o equipamento antigo (devolução, motivo Troca/upgrade) e entregar o novo (saída, motivo Troca/upgrade), redigitando colaborador e contexto. Esta ordem cria o **facilitador do par**: quando o operador monta uma **devolução** com motivo **Troca/upgrade**, a mesma tela abre uma seção para registrar **junto** a **saída** do(s) equipamento(s) que entra(m) no lugar — e **vice-versa** (saída com Troca/upgrade abre a seção da devolução do equipamento antigo). O padrão é registrar as duas metades **num único registrar**; sempre existe a opção **"deixar a contrapartida para depois"**, e nesse caso o painel de sucesso oferece um atalho pré-preenchido para registrá-la em seguida. **Zero mudança de banco**: o motivo `troca_upgrade` já existe para `saida` e `devolucao` (seed `0007`), a máquina de estados já aceita as duas metades e a Server Action de lote já processa itens heterogêneos. É exatamente a família dos "facilitadores para vencer o Excel" da spec §6 (repetir última, duplicar, kits) — mais um, no mesmo lugar.

**Cuidado com o vocabulário — são duas coisas diferentes com nome parecido:** `troca` é um **TIPO de movimentação** (F15): o nascimento do equipamento substituto vindo do **FORNECEDOR**, gravado só pela RPC `devolver_ao_fornecedor`, fora do formulário manual. `troca_upgrade` é um **MOTIVO** de saída/devolução entre **colaboradores e o estoque**. Esta ordem é 100% sobre o MOTIVO. O tipo `troca`, a RPC, o fluxo `movimentacoes/devolucao-fornecedor` e tudo da F14/F15 ficam **byte a byte** como estão. Na UI, o facilitador se apresenta sempre como "Troca/upgrade" (o rótulo do motivo) — nunca "Troca" solta, que colidiria com a pílula teal das Entradas do relatório.

## Contexto (leia a origem, não descrições dela)

- Doutrina: `@CLAUDE.md` (modo autônomo; stack fechada; convenções) · spec `@docs/ESPECIFICACAO.md` §4 (máquina de estados), §5 (motivos De→Para; `troca_upgrade` aplica a `{saida,devolucao}` — confirme no seed `@supabase/migrations/0007_seeds_fixos.sql`), §6 item "Facilitadores para vencer o Excel" (é a lista que esta ordem estende).
- **O wizard de nova movimentação** (a tela do facilitador): `@src/components/movimentacoes/nova-movimentacao-form.tsx` (orquestrador — Config única do lote, `tiposDoLote`, `trocarTipo` limpa campos do tipo anterior, `validarLote`, `registrar` com falha parcial M9/M10, rascunho M6, `jaRegistrados`) · `@src/components/movimentacoes/nova/config.ts` (`Config`, `configPadrao`, `construirItem`/`montarItensInput`, `SucessoLote`) · `nova/passo-movimentacao.tsx` (selects de tipo e motivo — `motivosAplicaveis` filtra por `aplica_a`) · `nova/passo-ativos.tsx` + `@src/components/movimentacoes/ativo-combobox.tsx` (a busca acha ativo por patrimônio **e pelo nome do colaborador** — F9/M2; não filtra por status de propósito, a interseção de tipos é quem guarda, com toast nomeando o culpado — F9/M7) · `nova/passo-revisao.tsx` (+ aviso de duplicata do dia, M5) · `nova/painel-sucesso.tsx` (termos de responsabilidade encadeados por ativo elegível; termo de devolução consolidado por lote — o mapa `motivo === 'desligamento' ? devolucao_desligamento : devolucao_equipamento` já dá `devolucao_equipamento` para troca/upgrade) · `nova/rascunho.ts` (sessionStorage com validação de forma — **compatibilidade com rascunho antigo é requisito**) · `nova/aplicar-kit.ts` e `nova/campo-sugerido.tsx`.
- **Server Action**: `@src/lib/actions/movimentacoes.ts` — `registrarMovimentacoes` já aceita **lote heterogêneo** (cada item carrega o próprio `tipo` na união discriminada), já recusa ativo repetido no lote (é a disjunção das metades de graça, no servidor), já exige escrita em TODAS as filiais tocadas (`exigirEscritaEm`) e já interrompe no primeiro erro deixando o resto "não processado". A UI é quem sempre mandou lote homogêneo — o servidor não precisa mudar para aceitar o par; avalie se alguma mudança é necessária apenas na **forma do resultado** consumida pelo cliente.
- **Validators**: `@src/lib/validators/movimentacao.ts` (`movimentacaoSchema` por tipo; `MAX_LOTE_MOVIMENTACAO = 30` — o teto vale para o array inteiro submetido, logo para a SOMA das metades; `TRANSICOES`/`tiposManuaisPara`; `CAMPOS_POR_TIPO`).
- **Motivo**: tabela `motivos` (`codigo` PK · `aplica_a` · `ativo`), `@src/lib/queries/motivos.ts`, tela `admin/motivos`. A detecção do facilitador é **pelo `codigo` `troca_upgrade`** — nunca pelo rótulo (o admin pode renomear o rótulo à vontade). Crie a constante ÚNICA exportada (ex.: `MOTIVO_TROCA_UPGRADE`) num módulo puro e importe dela em todo lugar. Se o admin desativar o motivo, o facilitador simplesmente não dispara — comportamento correto, registre.
- **`AtivoResumo`** (`@src/lib/queries/ativos.ts`): já carrega `colaborador_atual` (F9/M2) — o pré-preenchimento do colaborador da saída sai do próprio lote em memória, **capturado ANTES do envio** (depois do insert o trigger `aplicar_movimentacao` zera `colaborador_atual` do devolvido). `setor_atual` NÃO está no resumo: decida entre acrescentá-lo ao `RESUMO_SELECT` (mudança aditiva de leitura, sem migration) ou pré-preencher só colaborador — registre a decisão.
- **Ajuda F20**: `@src/lib/ajuda/conteudo/registrar-movimentacao.ts` · `devolucao-e-triagem.ts` (+ o que os guardas de cobertura/vocabulário derivado exigirem — eles QUEBRAM o build se esquecer).
- Documentação viva que esta ordem emenda: spec §6 (lista de facilitadores) · `@docs/MATRIZ-REGRAS.md` · `@docs/DECISOES.md` · `CHANGELOG.md` · `README.md` · `docs/prompts/README.md`.
- Comandos: `npm run lint` · `npm run test` · `npm run build` · smoke `scripts/smoke/smoke-prod.mjs`. **Meça a baseline ANTES de mudar qualquer coisa** e cole no relatório.
- APIs externas (regra 6 do CLAUDE.md): se precisar conferir React 19/Next 16 (ex.: comportamento de foco/aria), use a documentação oficial vigente via MCP Context7 — não escreva de memória.

## Escopo

**Dentro:** o facilitador nos DOIS sentidos, dentro do fluxo `/movimentacoes/nova` (passos 2 e 3, painel de sucesso, estado do formulário e rascunho); funções puras novas com Vitest; o atalho pré-preenchido do painel de sucesso quando a contrapartida ficou para depois; ajuda F20; emendas de documentação; encerramento padrão.

**Fora (não toque):** **NENHUMA migration, RPC, policy ou trigger** — zero mudança de banco (decisão do Johnny em 04/08/2026: "só a tela"; **vínculo do par no banco** e **pendência de troca sem contrapartida** são BACKLOG — registre a ata em `docs/DECISOES.md`); o tipo `troca`, a RPC `devolver_ao_fornecedor` e o fluxo `movimentacoes/devolucao-fornecedor` (byte a byte); a máquina de estados e `TRANSICOES`; RLS/cargos/vínculos (o par usa as guardas existentes da action); **relatórios e snapshots** (as duas metades são `saida` e `devolucao` normais com motivo `troca_upgrade` — NENHUMA contagem, KPI, tabela ou RPC de relatório muda); kits e `admin/kits` (o payload do kit continua definindo só tipo/motivo/termo/observação — kit NÃO ganha "contrapartida"); `admin/motivos`; o import; a lista `/movimentacoes` e a linha do tempo da ficha (as movimentações do par aparecem nelas como sempre apareceriam); `src/components/ui/**`; dependência nova; dado real em seed/fixture/teste/screenshot.

## O modelo a implementar

### 1. A regra num lugar só (funções puras, Vitest)

Módulo novo ao lado dos irmãos do wizard (sugestão: `src/components/movimentacoes/nova/troca-upgrade.ts`, sem React — como `config.ts`/`aplicar-kit.ts`), concentrando TODA a regra do par:

- `MOTIVO_TROCA_UPGRADE = 'troca_upgrade'` — a constante única do app; quem detecta importa daqui.
- `tipoContrapartida(tipo)`: `devolucao → saida`, `saida → devolucao`, qualquer outro → `null`. O facilitador vale SÓ para esses dois tipos (o seed aplica `troca_upgrade` só a eles; `emprestimo`/`reserva` ficam de fora — se um dia o admin ampliar o `aplica_a`, a seção continua não aparecendo para outros tipos, e está certo assim).
- `ofereceContrapartida(config)`: tipo com contrapartida definida E `config.motivo === MOTIVO_TROCA_UPGRADE`.
- A forma do estado da contrapartida (sugestão `ContrapartidaTroca`): lista própria de `AtivoResumo` + os campos exclusivos da metade oposta (sentido devolução→saída: `colaborador`, `setor`, `termo`, `termoData`; sentido saída→devolução: `itensFaltantes`) + o flag `deixarParaDepois`. **Motivo da contrapartida é sempre `troca_upgrade`, fixo** (a UI mostra como informação, não como select). `data`, `chamado` e `observacao` são **compartilhados** da Config principal — um preenchimento, como o resto do lote (registre a decisão).
- `prefillContrapartida(lotePrincipal)`: TODOS os devolvidos com o MESMO `colaborador_atual` não-vazio → esse colaborador pré-preenchido (editável); misto ou vazio → `''` (sem chute silencioso).
- `validarPar(...)`: metades **disjuntas** (mesmo ativo nas duas → mensagem clara); teto **somado** ≤ `MAX_LOTE_MOVIMENTACAO` (mensagem derivada da constante, não número à mão); contrapartida **ligada e vazia** → erro pedindo para adicionar ativo(s) ou marcar "deixar para depois"; cada ativo da contrapartida precisa aceitar o tipo dela (`tiposManuaisPara` por metade — saída pede `em_estoque`/`reservado`/`em_triagem`; devolução pede `em_uso`/`emprestado`).
- `montarItensDoPar(...)`: itens da metade principal (via `montarItensInput` vigente) + itens da contrapartida (mesma serialização, com o tipo oposto, motivo fixo e os campos próprios da metade), **principal primeiro** na ordem do array (a interrupção-no-primeiro-erro da action deixa o resto "não processado" — comportamento vigente; registre a ordem como decisão).

Tudo isso testado no Vitest no padrão de `config.test.ts`/`rascunho.test.ts` — inclusive os casos: misto de colaboradores, teto somado estourando, interseção inválida na contrapartida, disjunção.

### 2. Passo 2 — a seção da contrapartida

- A seção **aparece e some DERIVADA do estado** (`ofereceContrapartida(config)`) — vale para motivo escolhido à mão, por kit, por "repetir última" ou por "duplicar", sem caso especial por origem. Mudar tipo ou motivo para algo que não oferece contrapartida **limpa a seção E o estado dela** (estenda a limpeza que `trocarTipo` já faz nos campos condicionais — nada de lote órfão da contrapartida sobrevivendo invisível).
- Sentido **devolução → saída** ("Saída da troca"): texto curto explicando ("registre junto a entrega do equipamento que substitui"); seletor de ativos **reutilizando o combobox existente** (mesma busca, mesmos toasts de interseção nomeando o culpado); colaborador/setor pré-preenchidos pelo `prefillContrapartida` e editáveis (com as mesmas sugestões M4 do passo 2, se sair barato reutilizar o `campo-sugerido`); termo (status/data) próprio da metade; chip informativo do motivo fixo "Troca/upgrade".
- Sentido **saída → devolução** ("Devolução da troca"): mesmo desenho; dica de uso apontando que a busca do combobox **acha pelo nome do colaborador** (F9/M2) — é como o operador localiza o equipamento antigo de quem está recebendo o novo; checklist de `itensFaltantes` próprio da metade (o mesmo componente da devolução principal).
- O controle **"Deixar a contrapartida para depois"** (switch/checkbox) — ligado, a seção recolhe e o registrar grava só a metade principal. O PADRÃO é a contrapartida ABERTA (decisão do Johnny: por padrão as duas na mesma tela).
- Acessibilidade no padrão F19: a seção que nasce anuncia a chegada para leitor de tela (mesma família do `role="alert"` dos erros — escolha o semanticamente certo), não rouba foco, e o Enter-avança do formulário (`onKeyDown`) não registra por cima de contrapartida inválida (a validação do §1 entra no `validarLote`).

### 3. Passo 3 — revisão e registro do par

- A revisão mostra **dois blocos claramente separados** ("Devolução — N ativo(s)" / "Saída da troca — M ativo(s)"), cada um com seus campos, no padrão visual vigente do passo 3. O aviso de possível duplicata do dia (M5) cobre os ativos **das duas metades**.
- O registro é **UMA chamada** à `registrarMovimentacoes` com `montarItensDoPar` — sem action nova e sem RPC. A barreira de ativo repetido do servidor já garante a disjunção contra payload forjado; `exigirEscritaEm` já cobre as filiais das duas metades (lote recusado inteiro se faltar vínculo — comportamento vigente, correto para o par).
- **Falha parcial** (M9/M10): cada ativo que falhou volta para a **sua** metade no formulário (principal ou contrapartida), com o erro por ativo; os que entraram viram os chips de "já registrados" como hoje. Não misture as metades na volta.
- `SucessoLote` precisa passar a representar o par (ex.: grupos com tipo/motivo/ativos por metade) — é a mudança de forma que o painel de sucesso (§4) consome. Mantenha o caso de lote simples intacto.

### 4. Painel de sucesso — termos do par e o atalho do "depois"

- Registrado o par: o painel mostra os DOIS grupos — **termos de responsabilidade** encadeados para os ativos elegíveis da metade **saída** (lista com estado pendente/gerado/pulado, foco andando sozinho — mecânica vigente) E o **termo de devolução consolidado** da metade **devolução** (que para `troca_upgrade` já resolve para `devolucao_equipamento` — confira que o mapa continua o mesmo). Vale para os dois sentidos.
- Contrapartida deixada **para depois**: o painel ganha o atalho **"Registrar agora a saída da troca"** (ou "…a devolução da troca"), que reabre `/movimentacoes/nova` **pré-preenchida por querystring** — reutilize o mecanismo existente de `ConfigInicial` (`?duplicar=`/`?ativo=` em `nova/page.tsx`); se precisar de uma forma nova de link (ex.: tipo+motivo+colaborador sem ativo), desenhe-a como extensão pequena do mesmo mecanismo e registre. **Nenhuma pendência automática, nenhum estado no servidor** — o atalho é só conveniência de navegação (decisão "só a tela").

### 5. Rascunho (M6) — o par sobrevive e o antigo não quebra

- O esqueleto salvo no sessionStorage ganha a contrapartida (ids + campos + `deixarParaDepois`). A restauração refaz a interseção de tipos **das duas metades** (estados podem ter mudado enquanto o rascunho dormia) e avisa o que caiu, como hoje.
- **Rascunho gravado antes desta fase restaura sem erro** (a validação de forma de `rascunho.ts` trata os campos novos como opcionais) — com teste cobrindo o rascunho antigo e o novo.

### 6. Interações com o resto do fluxo — confira, não presuma

- "Repetir última", "Aplicar kit" e "duplicar" continuam mexendo só na config principal; se o resultado deixar tipo+motivo casando com o facilitador, a seção aparece (vazia ou com prefill) — derivação pura, sem estado escondido por origem.
- O atalho global `N`, `?ativo=`, a paleta e a página em si não mudam de contrato; cargo consulta continua vendo o `EstadoVazio` (nada do par vaza para leitura).
- `/movimentacoes` (lista), linha do tempo da ficha, estorno: as movimentações do par são movimentações normais — estornar uma delas NÃO mexe na outra (sem vínculo, sem cascata; é o comportamento decidido — registre a ata).

### 7. Ajuda F20 e documentação

- `registrar-movimentacao.ts` e `devolucao-e-triagem.ts` explicam o facilitador: quando a seção aparece, o que é pré-preenchido, o "deixar para depois" e o atalho do painel — com os guardas de cobertura/vocabulário derivado verdes (eles quebram o build se esquecer).
- Emendas: spec §6 (lista de facilitadores ganha o item, com a data e a referência desta ordem); `MATRIZ-REGRAS.md`; `docs/DECISOES.md` (uma ata por decisão desta ordem — "só a tela" com vínculo+pendência no backlog; campos compartilhados; prefill; ordem das metades; estorno sem cascata; `setor_atual` no resumo se feito); `CHANGELOG.md` (topo); `README.md` (status); `docs/prompts/README.md` (linha F26).

### 8. Testes

- **Vitest**: todo o §1 (constante, `tipoContrapartida`, `ofereceContrapartida`, prefill com colaborador único/misto/vazio, `validarPar` nos casos-limite, `montarItensDoPar` com a ordem e os campos certos por metade); rascunho antigo × novo; o que os testes derivados da ajuda exigirem.
- **Roteiro SQL**: nada novo (zero mudança de banco); o CI de banco continua verde como está.
- **Smoke**: `/movimentacoes/nova` continua 200 com marcador de conteúdo, no padrão existente.
- Testes existentes NÃO se deletam — se quebrarem, é efeito real a acomodar.

## Critérios de aceitação

1. **Sentido devolução → saída**: montando uma devolução com motivo Troca/upgrade, a seção "Saída da troca" aparece na mesma tela; registrando junto, saem as N devoluções e as M saídas (todas com motivo `troca_upgrade`) numa chamada só; os devolvidos ficam `em_triagem` sem detentor e os entregues `em_uso` com o colaborador informado.
2. **Sentido saída → devolução**: o espelho exato — a seção "Devolução da troca" aparece, a busca acha o equipamento antigo pelo nome do colaborador, e o registro conjunto sai certo.
3. **Prefill honesto**: devolvidos com um único detentor → colaborador da saída pré-preenchido e editável; detentores mistos ou vazios → campo vazio, sem chute.
4. **"Deixar para depois"**: registra só a metade principal; o painel de sucesso oferece o atalho que reabre o fluxo pré-preenchido (tipo + motivo, e colaborador quando fizer sentido); nenhuma pendência ou estado novo no servidor.
5. **Painel de sucesso do par**: termos de responsabilidade para a metade saída (encadeamento por teclado intacto) + termo de devolução (`devolucao_equipamento`) para a metade devolução — nos dois sentidos.
6. **Guardas**: mesmo ativo nas duas metades é barrado com mensagem clara antes do envio (e a barreira do servidor continua); teto SOMADO ≤ 30 com a mensagem derivada da constante; contrapartida aberta e vazia bloqueia o registrar com mensagem; trocar tipo/motivo limpa a seção sem sobras; ativo em estado inválido para a contrapartida é avisado como no lote principal (toast nomeando o culpado).
7. **Falha parcial**: cada ativo que falhou volta para a metade certa com o erro; os que entraram viram chips "já registrados"; nada se perde nem troca de metade.
8. **Rascunho**: o novo salva e restaura o par (com re-interseção das duas metades); um rascunho de antes desta fase restaura sem erro — teste cobrindo os dois.
9. **Nada fora do fluxo mudou**: zero migration (git não tem arquivo novo em `supabase/migrations/`); tipo `troca`, RPC `devolver_ao_fornecedor` e fluxo devolução-fornecedor byte a byte; contagens de relatório idênticas para os mesmos dados; kits, `admin/motivos`, import e lista `/movimentacoes` intocados.
10. **Portões**: `npm run lint`, `npm run test`, `npm run build` limpos (baseline medida antes e colada no relatório); guardas da ajuda verdes; smoke OK; deploy READY + smoke pós-deploy.
11. **Docs**: todas as emendas do §7 feitas + `docs/RELATORIO-F26.md` com o checklist autoverificado e evidências.

## §V — Verificação (rode de verdade, itere até passar)

Meça a baseline (lint/test/build + contagem de testes) ANTES de qualquer mudança e cole no relatório. A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a CAUSA RAIZ, repita; nunca suprima erro nem desabilite/delete teste para passar. No ENSAIO, com dados 100% fictícios (`WAP0001234`/"Fulano"), exercite de ponta a ponta: os dois sentidos registrando junto; o "deixar para depois" + o atalho do painel; uma falha parcial induzida (ex.: movimente por fora um ativo da contrapartida entre a revisão e o registrar e veja cada metade voltar certa); rascunho novo e um rascunho forjado no formato antigo. Ao final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão, atenção especial a: a detecção dispara por rótulo em vez de `codigo` em algum ponto?; kit/repetir última/duplicar deixam estado órfão da contrapartida ao trocar tipo/motivo?; o prefill lê `colaborador_atual` DEPOIS do insert (quando o trigger já zerou)?; o teto somado e a disjunção valem no cliente E continuam garantidos no servidor?; o painel de sucesso com par mostra os dois grupos de termo e mantém `desligamento → devolucao_desligamento` intacto no lote simples?; rascunho antigo explode ou apaga o lote do operador?; Enter registra com contrapartida inválida?; alguma contagem de relatório mudou?; o fluxo devolução-fornecedor/tipo `troca` foi tocado em qualquer byte?; sobrou migration criada por engano? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise até limpar.

## Autonomia, decisões e git

Você roda de forma autônoma (modo do CLAUDE.md): ninguém responderá perguntas — não pare, não espere confirmação. Régua: (1) esta ordem; (2) spec/ADRs e as convenções do repositório; (3) a opção mais simples e reversível — decisões não-óbvias em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha 3 vezes → troque de abordagem e registre. Bloqueio real → contorne com segurança ou siga com o resto e registre a pendência. Se o ambiente vetar um passo sensível (push, deploy), NÃO insista até abortar: deixe o comando exato pronto, registre "pendente de execução manual" e siga. Git: commits pequenos em pt-BR estilo conventional (`feat(f26): …`); branch opcional (`f26-troca-upgrade`) com merge próprio ao fechar o checklist; PROIBIDO push forçado, reset destrutivo de git, commitar `.env*`, dado real em seed/fixture/teste/screenshot.

## §R — Encerramento e relatório

`CHANGELOG.md` (topo) · `docs/prompts/README.md` (linha da F26) · `README.md` (status) · `docs/DECISOES.md` · `docs/RELATORIO-F26.md` em pt-BR com: o que mudou e por quê; o checklist desta ordem autoverificado item a item; **evidências coladas** (saídas reais de lint/test/build antes e depois, do smoke e do exercício de ponta a ponta no ensaio — afirmação sem saída não vale); decisões; pendências; a seção "o que este relatório NÃO prova"; e o roteiro manual de 5 minutos para o Johnny — sugestão: no ENSAIO, devolver um notebook fictício que está com "Fulano de Tal" usando motivo Troca/upgrade → ver a seção "Saída da troca" abrir com o colaborador já preenchido → escolher um notebook `em_estoque` → registrar junto → conferir as duas fichas, o termo de responsabilidade e o termo de devolução no painel; repetir no sentido saída (buscando o antigo pelo nome do colaborador); testar "deixar para depois" e o atalho do painel; conferir em `/relatorios` que as contagens são as mesmas movimentações normais de sempre. Push = deploy Vercel, só com o §V inteiro verde. Termine a resposta final com um resumo de ~5 linhas em pt-BR.

## Idioma

UI, mensagens, erros, commits, docs e relatório em pt-BR; identificadores de domínio em português sem acento (`trocaUpgrade`, `contrapartida`, `MOTIVO_TROCA_UPGRADE`); utilitários/infra em inglês — a convenção vigente do repositório.

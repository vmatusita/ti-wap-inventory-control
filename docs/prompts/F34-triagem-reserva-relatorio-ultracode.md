ultracode

# Ordem de serviço F34 — Triagem manual (devolução direto ao estoque), re-reserva de colaborador e dois acertos no relatório

> Ordem de 11/08/2026, emitida pelo Johnny. Sucede a F33 (`docs/prompts/F33-performance-ultracode.md` · `docs/RELATORIO-F33.md`). Em conflito entre esta ordem e a spec/ADRs, **esta ordem manda** — emende os documentos e registre em `docs/DECISOES.md`. Numeração: na escrita desta ordem, a última fase era a **F33** e a última migration a **`0107`**. **Confira os números livres reais antes de começar**; colisão → renumere (precedente F19/F20B) e registre. Esta ordem cria **DUAS migrations, ambas ADITIVAS** (valor novo de enum + `create or replace` de função/trigger): se você se pegar escrevendo `UPDATE`/`DELETE` de dados do acervo, o desenho saiu do trilho — pare e repense (nenhum ativo muda de estado nesta fase). Se `git status` mostrar trabalho não commitado de outra sessão, PARE e reporte (regra da casa: uma ordem por vez) — **exceto o próprio arquivo desta ordem** (`docs/prompts/F34-triagem-reserva-relatorio-ultracode.md`), que é insumo da fase: commite-o no primeiro commit.

## Missão

Quatro mudanças pedidas pelo uso real do sistema, independentes entre si, fechadas numa ordem só:

- **A — Texto do e-mail sem o bloco de estoque.** O texto do card "Resumo do período" (formato do e-mail semanal, botão Copiar texto) deixa de trazer o bloco **"Em estoque (N): 16× Modelo A, …"**. A **linha de totais** (Total · Em uso · Em estoque · Reservados · …) **continua como está**, e o card visual "Disponíveis por modelo" da tela não muda em nada — a mudança é SÓ no texto copiado.
- **B — Chamado com destaque na manutenção.** Nos cards **"Em manutenção, caso a caso"** do relatório, o nº do chamado (interno **e** o do fornecedor) sai da linha miúda em cinza e ganha **posição visível própria** em cada caso — **sempre presente**, com "—" quando não informado. Vale no ao vivo e nos snapshots v2 (é render, não dado).
- **C — Triagem deixa de ser etapa automática.** Hoje **toda** devolução joga o ativo em "Em triagem" e obriga um segundo registro ("Triagem OK") só para ele voltar a existir como estoque — na prática virou um log a mais, sem valor. Decisão do Johnny (11/08/2026): a **`devolucao` passa a resultar direto em `em_estoque`**, e a triagem vira **opt-in manual**: nasce o tipo de movimentação **`envio_triagem`** ("Envio para triagem", `em_estoque → em_triagem`) para quando o operador **quiser** inspecionar; **`triagem_ok` continua** sendo a saída da triagem (`em_triagem → em_estoque`). Nenhum ativo existente muda de estado — quem está `em_triagem` hoje fica onde está, e todas as saídas atuais da triagem continuam valendo.
- **D — Reservado muda de dono sem gambiarra.** Equipamento **reservado** para um colaborador precisa poder passar a **outro** colaborador continuando reservado (caso real: notebook reservado para um novo contratado; a pessoa desiste da vaga e entra outra). Decisão: o tipo **`reserva` passa a valer também sobre `reservado`** (`reservado → reservado`), trocando colaborador/setor/chamado pelos informados — sem estorno, sem ajuste, com as duas reservas na linha do tempo. **Atenção ao vocabulário:** o Johnny chamou isso de "transferência de colaborador", mas o tipo `transferencia` do sistema é **transferência de FILIAL** e fica **byte a byte** como está — nada desta ordem o toca.

## Contexto (leia a origem, não descrições dela)

- Doutrina: `@CLAUDE.md` (modo autônomo; stack fechada; convenções) · spec `@docs/ESPECIFICACAO.md` §4 (estados e a tabela de transições — as linhas de `devolucao`, `triagem_ok` e `reserva` são o objeto desta ordem), §5, §7 (relatórios; item 9 = o resumo em texto), §8 · `@docs/RUNBOOK-BANCO.md` (caminho A ensaio→produção; a regra da F17: **mexeu em função/trigger/RPC → rode TODOS os roteiros de `supabase/tests/`**) · `@docs/MATRIZ-REGRAS.md`.
- **Máquina de estados (banco):** `@supabase/migrations/0004_maquina_estados.sql` (origem) — mas o corpo VIGENTE de `status_apos_movimentacao` e do trigger `aplicar_movimentacao` foi recriado várias vezes depois (0045, 0047, F18…). **Parta SEMPRE do corpo vigente lido do banco (`pg_get_functiondef`), nunca de uma migration antiga** — recriar por cima de corpo velho é regressão silenciosa (a lição escrita na própria 0047). Guarde o functiondef anterior na ata (é o backup lógico da mudança).
- **Espelho TS da máquina:** `@src/lib/validators/movimentacao.ts` (`TRANSICOES`, `tiposManuaisPara`, `CAMPOS_POR_TIPO`, `movimentacaoSchema`, `ehTipoManual`) + `@src/lib/validators/transicoes-sql.test.ts` (o teste que trava TS×SQL idênticos) · `@src/lib/validators/kit.ts` (tipos kit-áveis) · `@src/lib/dominio.ts` (`TIPO_META`, `pillTipo`, `STATUS_META`) · `@src/components/movimentacoes/nova/config.ts` e o wizard em `@src/components/movimentacoes/nova/**` · filtro de tipos da lista: `@src/components/movimentacoes/lista-filtros.tsx` · tipos gerados: `npm run db:types` (`src/lib/types/database.ts`, nunca à mão).
- **Trigger e efeitos colaterais da devolução:** o `aplicar_movimentacao` vigente zera colaborador/setor na `devolucao` e abre `pendencias_item` por item faltante (F18) — os dois comportamentos **continuam**; só o `status_resultante` muda. `rel_estoque_asof` tem CASEs paralelos de colaborador/setor — se mexer nas listas de tipos do trigger, espelhe lá e registre.
- **Relatório:** texto do e-mail `@src/lib/relatorios/resumo.ts` (+ `resumo.test.ts` — os casos do bloco "Em estoque (N)" mudam LEGITIMAMENTE nesta ordem) · quem passa os extras: `@src/components/relatorios/resumo-periodo.tsx` e `@src/components/relatorios/corpo-relatorio-v2.tsx` (§9 do corpo) · cards de manutenção `@src/components/relatorios/manutencao-casos.tsx` (dados: `ManutencaoCaso` em `@src/lib/relatorios/tipos.ts` — `chamado` e `chamadoFornecedor?` já existem; `chamadoFornecedor` é OPCIONAL em snapshot pré-F14 → renderize "—", nunca quebre) · glossário/legendas `@src/components/relatorios/legendas.tsx` + `@src/lib/relatorios/legendas.ts` (verbete de "Em triagem" cita a devolução — emende).
- **Ajuda F20 (os guardas derivados QUEBRAM o build se esquecer):** `@src/lib/ajuda/conteudo/devolucao-e-triagem.ts` (a página muda de história — inclusive a tabela de erros, que hoje diz "A devolução sempre leva para a triagem — é o desenho do fluxo") · `tipos-de-movimentacao.ts` · `status-do-ativo.ts` · `entregar-emprestar-reservar.ts` (ganha a re-reserva) · `registrar-movimentacao.ts` · e o que os testes de cobertura/vocabulário pedirem.
- **Seed fictício:** `@scripts/seed.ts` gera cadeias de movimentação — se ele encadeia `devolucao → triagem_ok`, isso passa a ser transição INVÁLIDA (triagem_ok de em_estoque). Ajuste o gerador para a máquina nova (ex.: `devolucao → envio_triagem → triagem_ok`).
- **Checagens do /dev:** leia o SQL vigente de `dev_checagens_integridade()` e confira se alguma das nove pressupõe "devolução ⇒ em_triagem"; se sim, emenda por migration (SQL FIXO dentro da função — regra permanente).
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run db:types` · smoke `scripts/smoke/smoke-prod.mjs`. **Meça a baseline ANTES de mudar qualquer coisa** e cole no relatório.
- APIs externas (regra 6 do CLAUDE.md): precisou conferir Next 16/React 19/Supabase, use a doc oficial vigente (MCP Context7) — não escreva de memória.

## Escopo

**Dentro:** as quatro frentes A–D; as duas migrations aditivas; espelho TS×SQL + tipos regenerados; wizard oferecendo `envio_triagem` (lote `em_estoque`) e `reserva` sobre `reservado`; seed ajustado; roteiros SQL atualizados/rodados TODOS; ajuda F20; emendas de documentação; encerramento padrão (§R e relatório).

**Fora (não toque):** o tipo **`transferencia`** (filial), o tipo **`troca`**, a RPC `devolver_ao_fornecedor` e o fluxo `movimentacoes/devolucao-fornecedor` (byte a byte — F14/F15); **import** (RPC, telas, De→Para — "Validar/Devolvido" continua mapeando o estado `em_triagem`, que segue existindo); identidade/conflitos F24; cargos/RLS/policies (os tipos novos passam pelas MESMAS policies de INSERT de `movimentacoes` — nenhuma policy muda); Zona destrutiva e RPCs do dev (exceto a checagem de integridade, se a leitura da frente C exigir); **nenhuma fórmula de contagem de relatório** (KPIs, séries, tabelas, chips — o KPI "Em triagem" continua existindo e tende a esvaziar com o uso, consequência esperada, não é bug); o card v1 de snapshots pré-F3B (`lista-manutencao.tsx` — o dado `chamado` não existe naqueles snapshots); a **linha de totais** do texto do e-mail (byte a byte); `src/components/ui/**`; dependência nova; dado real em seed/fixture/teste/screenshot; **backfill/UPDATE de dados** — nenhum ativo muda de estado por esta ordem.

## O modelo a implementar

### Frente C — banco primeiro (as duas migrations)

1. **`0108_envio_triagem_valor.sql`** (confira o nº livre): `alter type public.tipo_movimentacao add value 'envio_triagem'` — arquivo SÓ com isso: valor novo de enum precisa estar COMMITADO antes de qualquer função citá-lo (precedente 0046/0047).
2. **`0109_devolucao_direta_e_re_reserva.sql`**: recria, por `create or replace` PURO sobre o corpo VIGENTE, com **diff mínimo comentado**:
   - `status_apos_movimentacao`: `devolucao` (de `em_uso`,`emprestado`) passa a resultar **`em_estoque`**; linha nova `envio_triagem` (de `em_estoque`) → **`em_triagem`**; `reserva` passa a aceitar (`em_estoque`,`reservado`) → `reservado`. Nada mais muda.
   - `aplicar_movimentacao`: avalie o diff mínimo necessário — a `devolucao` CONTINUA zerando colaborador/setor e abrindo `pendencias_item` (F18); decida se `envio_triagem` entra nas listas de zeramento (de `em_estoque` o detentor já é nulo — no-op defensivo) e, se entrar, espelhe em `rel_estoque_asof`; registre a decisão. `reserva` já grava colaborador/setor do payload — **confirme no roteiro** que a re-reserva troca o detentor.
   - Se alguma checagem do `/dev` pressupõe devolução⇒triagem, emende na mesma migration (ou numa terceira, se ficar mais legível).
3. **Roteiros `supabase/tests/`**: atualize os cenários que esperavam `devolucao → em_triagem` e acrescente: devolução → `em_estoque` com detentor limpo E pendência de item aberta; `envio_triagem` só de `em_estoque`; `triagem_ok` segue só de `em_triagem`; re-reserva trocando colaborador (e o caso re-reserva sem colaborador → detentor limpo, comportamento herdado da `reserva` — registre); `envio_triagem` recusado de `em_uso`/`reservado`/etc. Rode **TODOS** os roteiros (regra F17), não só os que você editou.

### Frente C — app

- `TRANSICOES.em_estoque` ganha `'envio_triagem'`; `movimentacaoSchema` ganha o caso (mesma família dos "simples": motivo opcional; observação/chamado já são do base); `CAMPOS_POR_TIPO.envio_triagem` espelhando; `TIPO_META.envio_triagem = 'Envio para triagem'`; pílula neutra (se der cor, rode `scripts/contraste.mjs`); `kit.ts` — inclua nos kit-áveis (simetria com `triagem_ok`; registre); `lista-filtros.tsx` da lista `/movimentacoes`; `npm run db:types`; `transicoes-sql.test.ts` espelhado.
- **Nada de fluxo novo**: `envio_triagem` é tipo manual comum do wizard (a interseção `tiposManuaisPara` o oferece sozinha para lote `em_estoque`; `ehTipoManual` passa a aceitá-lo por derivação — confira que a querystring da F26 não abre brecha).
- **Textos que prometem o fluxo antigo**: caça dirigida por grep (ex.: "triagem", "em_triagem", "Triagem OK") em `src/lib/ajuda/**`, `legendas.ts`/glossário, `resumo-revisao`/painéis do wizard e mensagens de erro — tudo que diga "devolução leva à triagem" muda de história. A pendência **"triagem parada (7+ dias)" continua** e agora só acusa quem foi mandado à triagem de propósito — a ajuda explica isso.
- Par troca/upgrade (F26): a metade devolvida agora termina `em_estoque` — a LÓGICA não muda (derivada de `TRANSICOES`), mas textos/ajuda que citavam `em_triagem` mudam.

### Frente D — re-reserva

- O grosso já saiu na migration (mesma função). No app: `TRANSICOES.reservado` ganha `'reserva'` — o select do wizard passa a oferecer "Reserva" para lote reservado, com os mesmos campos de sempre (colaborador/setor/chamado opcionais — simetria com a reserva original; registre). O aviso de possível duplicata (M5) para re-reserva no mesmo dia **avisa e não trava** (comportamento vigente — confira).
- **Chamado exibido em "Reservados"** (relatório) é o último não-vazio as-of (`chamadoAteData`): re-reserva COM chamado novo passa a exibi-lo; re-reserva SEM chamado deixa o antigo aparecendo. **Aceite e documente** (ajuda + ata) — refinar a leitura as-of está fora do espírito da ordem; se discordar com motivo forte, registre a alternativa em `DECISOES.md` antes de implementar.
- Ajuda (`entregar-emprestar-reservar.ts`): o caso "a reserva mudou de dono" — nova Reserva por cima, sem estorno e sem ajuste, com o exemplo do candidato que desistiu da vaga.

### Frente A — texto do e-mail

- `gerarTextoResumo` para de emitir o bloco "Em estoque (N): …". Prefira **remover** o extra `disponiveis`/`achatarDisponiveis` e seus repasses (`corpo-relatorio-v2.tsx`, `resumo-periodo.tsx`) a deixar plumbing morto — a linha de KPIs (`extras.kpis`) fica intocada. Os testes da F29/REL-08 sobre o bloco mudam porque o REQUISITO mudou (revogação parcial da REL-08) — ata em `DECISOES.md`, e um teste novo trava que o texto NÃO contém "Em estoque (".
- Consequência aceita (registre): o texto é gerado NO RENDER, então snapshot antigo reaberto também copia sem o bloco — o DADO congelado (`disponiveisPorModelo`) não muda, e o card visual continua.

### Frente B — chamado nos cards de manutenção

- Em `manutencao-casos.tsx`, chamado interno e do fornecedor ganham **linha/posição própria e legível** (padrão visual da casa; AA claro/escuro — pares novos passam por `scripts/contraste.mjs` se sair de token; presente na impressão), **sempre renderizada**: "Chamado —" quando vazio, idem fornecedor (snapshot pré-F14 sem o campo → "—", sem erro). Filial/data de envio continuam onde couberem melhor. Nenhuma query, snapshot ou contagem muda — é só render.

### Documentação (emendas obrigatórias)

- Spec: §4 tabela de transições (devolucao → em_estoque; linha nova `envio_triagem`; `reserva` com `reservado`; contagem de tipos 15→16) + descrição do estado `em_triagem` (deixa de ser "devolvido aguardando" e vira "separado para conferência — entrada manual"); §7 item 9 (o texto copiado sem o bloco); §5 se citar a contagem de tipos.
- `MATRIZ-REGRAS.md` (as regras de transição afetadas), `docs/DECISOES.md` (uma ata por decisão: revogação parcial da REL-08; nome/campos do `envio_triagem`; kit-ável; zeramento no trigger; chamado as-of da re-reserva; consequência do texto em snapshot antigo), `CHANGELOG.md` (topo), `README.md` (status), `docs/prompts/README.md` (linha F34).

## Critérios de aceitação

1. **Texto**: com os mesmos dados, o texto copiado de qualquer filial (ao vivo e snapshot) não contém `Em estoque (`; a linha de totais permanece byte a byte; testes provam os dois.
2. **Manutenção**: todo caso exibe chamado interno e do fornecedor em posição destacada, com "—" quando ausente (inclusive snapshot pré-F14), nos dois temas e na impressão.
3. **Devolução**: registrar devolução (de `em_uso` ou `emprestado`) resulta `em_estoque`, detentor limpo, pendências de item abertas quando marcadas — nenhum passo de triagem exigido; o termo de devolução sai como sempre.
4. **Triagem manual**: `envio_triagem` aparece no wizard só para lote `em_estoque` e resulta `em_triagem`; `triagem_ok` devolve a `em_estoque`; "triagem parada (7+ dias)" continua contando; as demais saídas de `em_triagem` (saída, manutenção, defasado, descarte, transferência) continuam.
5. **Re-reserva**: ativo `reservado` aceita `reserva` de novo, permanece `reservado` e colaborador/setor/chamado passam a ser os informados; a linha do tempo mostra as duas reservas; "Reservados" do relatório mostra o chamado mais recente não-vazio.
6. **Espelhos**: `transicoes-sql.test.ts` verde com TS×SQL idênticos; `db:types` regenerado; TODOS os roteiros SQL verdes (ensaio e CI).
7. **Nada além do combinado**: `transferencia`/`troca`/`devolucao_fornecedor`/import byte a byte; nenhuma fórmula de contagem de relatório mudou; nenhum ativo mudou de estado pela fase (contagens por status antes = depois no §R).
8. **Ajuda e docs**: páginas da ajuda emendadas com os guardas derivados verdes; todas as emendas da seção de documentação feitas.
9. **Portões**: `npm run lint` · `npm run test` · `npm run build` limpos (baseline antes, colada no relatório); smoke OK; migrations aplicadas em ENSAIO e PRODUÇÃO com verificação pós-apply; deploy READY + smoke pós-deploy.
10. **Relatório**: `docs/RELATORIO-F34.md` com o checklist autoverificado item a item e evidências reais (saídas de comando, contagens).

## §V — Verificação (rode de verdade, itere até passar)

Meça a baseline (lint/test/build + contagem de testes) ANTES de qualquer mudança. A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a CAUSA RAIZ, repita; nunca suprima erro nem desabilite/delete teste para passar (os testes do bloco "Em estoque (N)" e das transições mudam porque o REQUISITO mudou — com ata, nunca em silêncio). No ENSAIO, com dados 100% fictícios (`WAP0001234`/"Fulano"), exercite ponta a ponta: devolução simples → `em_estoque`; devolução com itens faltantes (pendência nasce E o ativo vai ao estoque); `envio_triagem` → `triagem_ok`; saída direto de `em_triagem`; re-reserva trocando colaborador; re-reserva sem colaborador (detentor limpa — comportamento decidido); texto copiado sem o bloco; card de manutenção com e sem chamado; seed rodando limpo na máquina nova.

Ao final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão, atenção especial a: a função foi recriada a partir do corpo VIGENTE (`pg_get_functiondef`) ou de uma migration velha (a regressão clássica)?; TODOS os roteiros rodaram (regra F17), não só os editados?; algum caminho (kit, duplicar, repetir última, colar lista, querystring da F26, seed) ainda monta ou promete `devolucao → em_triagem`?; `envio_triagem` vazou para estado além de `em_estoque` ou para fluxo que não devia (compra/troca/devolução-fornecedor)?; o espelho TS×SQL ficou idêntico mesmo?; a re-reserva realmente troca o detentor no banco (provado por roteiro, não por leitura de código)?; alguma contagem de relatório mudou de fórmula?; snapshot antigo (v1 e v2 pré-F14) abre sem erro e o texto copiado dele também perdeu o bloco?; a linha de totais do texto ficou byte a byte?; as checagens do `/dev` seguem coerentes?; sobrou `UPDATE`/`DELETE` de dado em migration? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise até limpar.

## Autonomia, decisões e git

Você está rodando em modo autônomo (CLAUDE.md): ninguém vai responder perguntas — não pare para perguntar nem espere confirmação. Régua: (1) esta ordem; (2) spec e convenções do repositório; (3) opção mais simples e reversível, registrada. Toda decisão não-óbvia vira ata em `docs/DECISOES.md` (data · contexto · escolha · motivo). Falha persistindo após ~3 tentativas: mude de abordagem e registre. Bloqueio real (ex.: apply barrado pelo gate): siga o §R e registre a pendência — nunca trave o resto da ordem. Git: commits pequenos e frequentes em pt-BR (`feat(f34): …`), direto na `main` ou em branch `f34` com merge próprio ao fechar o checklist; NUNCA force push, `reset --hard`, deleção de teste para passar, `.env*` ou dado real em commit.

## §R — Rollout

1. **ENSAIO primeiro**: aplique as migrations no projeto de ensaio, rode TODOS os roteiros SQL e o E2E do §V; verificação pós-apply (functiondef novo confere; advisors sem achado novo).
2. **PRODUÇÃO**: as migrations são aditivas — aplique com a verificação pós-apply de sempre; guarde na ata o `pg_get_functiondef` ANTERIOR das funções recriadas (backup lógico). **Contagens por status antes = depois** (a fase não move nenhum ativo) — cole os números. Se o gate do classificador barrar um apply, siga o `RUNBOOK-BANCO.md` (Johnny aplica no SQL Editor) e registre — precedente das migrations do import.
3. Deploy na Vercel (READY) + smoke pós-deploy (`scripts/smoke/smoke-prod.mjs`) + conferência read-only das telas tocadas. **Banco antes do app**: se o apply de produção ficar pendente no gate, NÃO deploye — o app novo depende do valor de enum e da máquina nova; deixe deploy como pendência junto do apply, registrado no relatório.
4. Encerramento: `docs/RELATORIO-F34.md` (checklist autoverificado, evidências, decisões, pendências, "o que este relatório NÃO prova") + todas as emendas de documentação + resumo final de ~10 linhas em pt-BR na resposta.

## Idioma

Narrativa, atas, relatório e UI em pt-BR; identificadores de domínio em português sem acento (`envio_triagem`); utilitários em inglês; commits em pt-BR no padrão conventional da casa.

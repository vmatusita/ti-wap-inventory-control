ultracode

# OS-F14 (ultracode) — Manutenção com fornecedor: chamado do fornecedor (MN1) · estado "Devolvido ao fornecedor" (MN2) · devolução com substituto vinculado (MN3/MN4)

Ordem **executável e autocontida**. Quatro melhorias encomendadas pelo Johnny (23/07/2026) no ciclo de manutenção: toda manutenção vai para o fornecedor, que abre um chamado próprio — e hoje o sistema não registra esse chamado, não tem o desfecho "não teve conserto" e não liga o equipamento trocado ao que o substituiu. Objetivo em uma linha: o ciclo de manutenção passa a registrar o **chamado do fornecedor**, ganha o desfecho terminal **"Devolvido ao fornecedor"** e, nesse desfecho, cadastra o **substituto no mesmo submit** com vínculo de sucessão — tudo verificado por teste (Vitest + roteiro SQL do CI + E2E em DEV), aplicado em produção pelo runbook e relatado com evidências.

**Modo autônomo com acesso total (CLAUDE.md).** Você roda de forma autônoma: **ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) convenções do repositório/CLAUDE.md/spec; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

**Produção, de verdade — e desta vez com migrations.** ~1.600 ativos reais, 5 filiais. Trabalho **direto na `main`** (decisão do Johnny nesta ordem; precedente F12 §2.2 e F13) — e como **push = deploy automático (Vercel)**: commits locais pequenos e frequentes, **`git push` SOMENTE no marco verde da §1.4**. As migrations desta ordem são **aditivas** (valores novos de enum, colunas novas, funções recriadas por `create or replace` puro; **nenhum** `delete from ativos/movimentacoes` — não batem no gate do modo automático): siga o caminho **A** do `docs/RUNBOOK-BANCO.md` — MCP Supabase, **ensaio primeiro, produção depois**, verificação pós-apply, `notify pgrst, 'reload schema'`, e **SQL aplicado ANTES do deploy** (armadilha 4 do runbook). Nada destrutivo, nunca: sem `drop` de dado, sem `delete` em massa, sem force push, sem `git reset --hard`, sem `git clean`. Se o classificador barrar um apply/push (precedente 0034/F7): não insista — deixe pronto (migration no repo, código commitado local), relatório completo e a instrução de 2 minutos para o Johnny.

**Dados e segredos.** Nenhum dado real (nome, patrimônio, e-mail) em código, teste, seed, screenshot ou relatório — exemplos sempre fictícios (`WAP0001234` / "Fulano"). E2E e screenshots **somente contra DEV** (seed fictício); em produção, só leitura (smoke por contagens/status, padrão F12) e os applies da §1.4. **Nenhum dado de teste entra em produção por esta ordem.** Classifique o `.env.local` antes de qualquer script (`scripts/env-guard.ts`, precedente F11).

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. O orquestrador segue a §1; §W descreve os prompts das frentes.

---

## §0 — O que muda (contrato fixado — não re-decida os nomes)

Nomes definitivos desta ordem, escolhidos para **não confundir** com a `devolucao` do colaborador (que leva a `em_triagem`) — nenhum vocabulário existente da spec §5 muda:

| Peça | Nome | Rótulo pt-BR |
|---|---|---|
| Tipo de movimentação novo | `devolucao_fornecedor` | "Devolução ao fornecedor" |
| Estado novo (terminal) | `devolvido_fornecedor` | "Devolvido ao fornecedor" |
| Coluna nova em `movimentacoes` | `chamado_fornecedor text` | "Chamado do fornecedor" |
| Coluna nova em `ativos` | `substitui_ativo_id uuid references ativos(id)` | vínculo de sucessão — o ativo NOVO aponta para o ANTIGO |
| RPC nova (atômica) | `devolver_ao_fornecedor(...)` | devolução + substituto num submit só |

### MN1 — Chamado do fornecedor na manutenção

Hoje a movimentação só tem o `chamado` interno (coluna `movimentacoes.chamado`, numérico — `src/lib/validators/movimentacao.ts`). Entra `movimentacoes.chamado_fornecedor`: **texto livre, sem máscara nem validação de formato** (o formato do fornecedor é desconhecido), **obrigatório no `envio_manutencao`** — no Zod/UI (com `*`) e no banco por `check (tipo <> 'envio_manutencao' or chamado_fornecedor is not null) not valid` (`NOT VALID` preserva as linhas históricas; linhas novas são validadas). Na matriz `CAMPOS_POR_TIPO`, `envio_manutencao` deixa de ser `CAMPOS_SIMPLES`: passa a coletar `chamado` interno (**opcional**, hoje a matriz nem o exibe nesse tipo — alinhe e registre) e `chamado_fornecedor` (**obrigatório**; campo novo do tipo `CampoMovimentacao`).

**Baixa visibilidade, de propósito:** o campo aparece SÓ no contexto de manutenção — o passo 2 do fluxo de nova movimentação quando o tipo é `envio_manutencao` (e, herdado/read-only, na devolução ao fornecedor — MN3), o detalhe das movimentações de manutenção na linha do tempo da ficha (`src/components/ativos/linha-do-tempo.tsx`), e a seção de manutenção do relatório (`manutencao-casos.tsx` — o card já mostra `#chamado`; acrescente o do fornecedor — e/ou `lista-manutencao.tsx`). **Fora** das colunas/filtros de `/ativos` e `/movimentacoes`, do combobox de busca e do export CSV geral.

### MN2 — Estado terminal "Devolvido ao fornecedor"

Hoje `em_manutencao` só tem uma saída de ciclo: `retorno_manutencao` → `em_estoque` (consertou). Falta o desfecho "não teve conserto": o fornecedor fica com o equipamento e o troca. Entra o estado **`devolvido_fornecedor`**, atingível **somente** por `em_manutencao + devolucao_fornecedor`. É **terminal como `descartado`**: sai do inventário e, na máquina de estados, só a válvula de escape `ajuste` sai dele (`TRANSICOES['devolvido_fornecedor'] = ['ajuste']`). Atenção às duas pontas da função `status_apos_movimentacao`:

- caso novo: `when p_tipo = 'devolucao_fornecedor' and p_status in ('em_manutencao') then 'devolvido_fornecedor'`;
- **`transferencia` hoje aceita qualquer estado `not in ('descartado')`** — passe a excluir também `devolvido_fornecedor` (transferir um ativo que voltou ao fornecedor não faz sentido).

O espelho TS (`TRANSICOES` em `src/lib/validators/movimentacao.ts`), a matriz `CAMPOS_POR_TIPO`, os metadados de `src/lib/dominio.ts` (`STATUS_META` com badge cinza-neutra de baixa, `STATUS_CHART_COLOR`, `STATUS_ORDEM`, `TIPO_META`, `pillTipo`) e a ajuda (`src/lib/ajuda/conteudo.ts` + testes) acompanham — `dominio.test.ts` e `movimentacao.test.ts` travam as permutações e a sincronia matriz×schema, então o build acusa o que faltar.

### MN3 — Devolução com substituto (padrão) ou sem (opção)

Ao registrar "Devolução ao fornecedor", o **padrão é cadastrar o ativo substituto no mesmo fluxo** — o modelo é o "Novo equipamento" da compra, que já faz cadastro + movimentação num submit só (`registrarCompra` em `src/lib/actions/compras.ts` → RPC `criar_compra_lote`, migration `0008`). Mas não é 100% obrigatório: existe a opção **"sem substituto"** (fornecedor não repôs — crédito/estorno), que registra só a devolução.

Implemente como RPC atômica (SECURITY INVOKER, grants espelhando a 0008 — `revoke` de `public`, `grant execute` a `authenticated`):

    devolver_ao_fornecedor(
      p_ativo_id    uuid,    -- ativo em manutenção
      p_mov         jsonb,   -- {data, chamado, chamado_fornecedor, observacao}
      p_substituto  jsonb,   -- null = sem substituto; senão {patrimonio, service_tag,
                             --  categoria, marca, modelo, memoria, armazenamento,
                             --  processador, hostname, filial_id, observacoes, data, observacao}
      p_criado_por  uuid
    ) returns table (mov_id uuid, substituto_id uuid, substituto_mov_id uuid)

Numa transação: (1) insere a movimentação `devolucao_fornecedor` no ativo antigo — o trigger `aplicar_movimentacao` valida a transição e vira o estado; (2) se houver substituto, insere o ativo novo (nasce `em_estoque`, `origem 'cadastro'`, `substitui_ativo_id = p_ativo_id`, **`fornecedor` copiado do ativo antigo no servidor** — não vem do payload) + a movimentação `compra` dele (padrão 0008). **Tudo ou nada**: colisão do substituto no índice único `patrimonio + service_tag` (§5) faz rollback total — nem a devolução entra.

**UI:** acessível para ativo `em_manutencao` a partir do fluxo de nova movimentação e/ou de um atalho na ficha (precedente do "duplicar" da F9 para pré-carregar o fluxo) — decida o encaixe mais simples e registre. **Lote sempre 1** para esse tipo (cada devolução tem SEU substituto; se o tipo aparecer no fluxo em lote, ele some/avisa com lote > 1). O sub-form do substituto reusa as regras da compra (`src/lib/validators/compra.ts`: patrimônio canônico, categoria/marca/modelo obrigatórios; extraia partes do `nova-compra-form.tsx` só se a extração for limpa). Painel de sucesso mostra os dois ativos (antigo devolvido + novo em estoque) com links para as fichas.

### MN4 — Cadastro e vínculo do substituto

No ativo novo, **todos os campos cadastrais são preenchíveis/editáveis** — patrimônio e service tag inclusive (unidade nova; o par é a chave §5 — reusar o patrimônio do antigo com service tag distinta é legítimo), modelo/categoria podem diferir do antigo, specs e `hostname` (a compra normal não coleta hostname; o sub-form do substituto coleta) —, **exceto** `fornecedor` (herdado do ativo antigo — manutenção é sempre com o fornecedor) e os **chamados** (`chamado` interno + `chamado_fornecedor` herdados da última movimentação `envio_manutencao` do ativo; exibidos read-only no form da devolução e gravados na movimentação `devolucao_fornecedor` — não se redigita). `filial_id` default = a do antigo, editável como na compra.

**Histórico por vínculo, sem cópia:** cada movimentação continua pertencendo ao ativo em que aconteceu. A ficha do substituto ganha uma seção própria ("Histórico do ativo substituído — WAP…") que **consulta e renderiza a linha do tempo do ativo antigo** (reuso somente-leitura do componente `LinhaDoTempo`) + link para a ficha dele; a ficha do antigo ganha o link reverso ("Substituído por WAP…" — consulta por `substitui_ativo_id`). Índice na coluna do vínculo.

### Varredura de impacto (a lista é sua, a régua é esta)

`devolvido_fornecedor` **espelha `descartado`** em todo lugar que trata baixa: `Grep 'descartado'` em `src/` e `supabase/migrations/` e decida ponto a ponto (KPIs do dashboard e do relatório, `src/lib/queries/relatorios/estoque.ts` — vários pontos —, série/tabelas de movimentações do relatório — trate `devolucao_fornecedor` como o `descarte` é tratado —, as-of/`asof_existencia` (0022), views (0006), `v_pendencias`/pendências (0028: devolvido não cobra termo, como descartado), export CSV, filtros de status das telas — que derivam de `STATUS_ORDEM`, confirme que nada hard-coda a lista). O card do caso de manutenção no relatório: caso encerrado por devolução ao fornecedor ganha badge própria (neutra, "devolvido ao fornecedor") no lugar do "voltou" verde. Registre a tabela ponto × decisão em `scratchpad/f14/impacto.md` — ela é insumo das frentes e do revisor.

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) Working tree **limpo na `main`** e sincronizado com `origin` (este arquivo de ordem, untracked ou commitado, não conta). Sujo → PARE e reporte. (b) Baseline verde **hoje**: `npm run lint && npm run test && npm run build` (a F13 fechou com 925 testes) — vermelho → PARE e reporte. (c) `.env.local` classificado (DEV × produção, `scripts/env-guard.ts`); MCP Supabase acessível (o rollout depende dele). (d) `scratchpad/smoke/smoke-prod.mjs` presente (baseline F12/F13: 33 OK); env `SMOKE_*` ausentes não travam — degrada + pendência. (e) **Numeração real das migrations**: `ls supabase/migrations/` — última conhecida `0043`; esta ordem assume `0044`/`0045`, corrija se houver arquivo mais novo.

### 1.1 Grafo de execução

    ONDA 0 (orquestrador)      ONDA 1        ONDA 2 (∥, arquivos disjuntos §1.3)   ONDA 3 (orquestrador)
    gate + varredura §0     →  W1 banco   →  W2 motor + fluxo de devolução     →   integração (lint+test+build na união)
    (scratchpad/f14/           (migrations,   W3 leituras + ficha + relatório      → revisão adversarial → emendas →
    impacto.md)                testes SQL,    + varredura                          E2E DEV §1.5 → rollout §1.4
                               apply DEV,                                          (SQL prod → smoke → push único →
                               db:types)                                           smoke pós-deploy) → docs + RELATORIO-F14

- **W1 vem sozinho na onda 1** porque W2/W3 dependem do `src/lib/types/database.ts` regenerado (enums novos) — o arquivo é GERADO, nunca editado à mão.
- Onda 2 na **mesma árvore**, `main` local, commits pequenos por frente, **push proibido às frentes** (só o orquestrador, §1.4).

### 1.2 Regras globais

1. **Escopo fechado nos MN1–MN4 + varredura §0.** Nada de "aproveitar para fazer" (CLAUDE.md regra 1); o que surgir de fora vira backlog no relatório.
2. **Zero dependência nova** no `package.json` (byte a byte igual). Playwright via `npx` segue autorizado **só como ferramenta de verificação** (precedente F13) — fora de package.json/lockfile/CI.
3. **DEV primeiro:** migrations, seed (`npm run db:seed` ganha 1–2 casos fictícios do fluxo novo, para o E2E e o relatório renderizarem o caminho), E2E — tudo contra o projeto de ensaio/DEV. Produção só na §1.4.
4. Convenções CLAUDE.md: pt-BR em UI/erros/commits; escrita via Server Actions + Zod; leituras em `src/lib/queries/`; `src/components/ui/**` intocado; datas `dd/MM/yyyy`; `tabular-nums`; identificadores de domínio em pt sem acento.
5. **Verificação — rode de verdade:** `npm run lint && npm run test && npm run build` no recorte de cada frente e na união; função pura nova → teste Vitest; roteiro SQL novo roda no Postgres do CI (job `banco`) e em DEV; causa raiz, nunca supressão — desabilitar/deletar/skipar teste para passar é proibido.
6. **Invariantes intocáveis:** import (`importar_ativos_substituir`) não muda; termos, kits, itens por quantidade, paleta e telas fora do escopo não mudam de comportamento; lote máx 30 nos demais tipos; textos existentes do §5 intactos; migrations antigas nunca editadas (mudança = migration nova); movimentações históricas continuam válidas (o `NOT VALID` do MN1 existe para isso).
7. Cada frente entrega: diff + checklist do próprio aceite autoverificado + rascunho para `docs/DECISOES.md` + pendências.
8. Commits pt-BR, estilo conventional: `feat(f14): estado devolvido_fornecedor na máquina de estados`, `feat(f14): devolução ao fornecedor com substituto`.

### 1.3 Propriedade de arquivos (disjunta na onda 2)

| Frente | Arquivos |
|---|---|
| **W1** | `supabase/migrations/0044_*.sql` + `0045_*.sql`, `supabase/tests/**` (roteiro novo ou cenários no `maquina_estados.sql`), apply em DEV/ensaio via MCP, `npm run db:types` (`src/lib/types/database.ts`), `scripts/seed.ts` |
| **W2** | `src/lib/dominio.ts`, `src/lib/validators/**`, `src/lib/actions/**`, `src/components/movimentacoes/**`, `src/components/ativos/nova-compra-form.tsx` (só se extrair partilha limpa), `src/app/(app)/movimentacoes/**` |
| **W3** | `src/lib/queries/**`, `src/lib/relatorios/**`, `src/components/relatorios/**`, `src/app/(app)/ativos/[id]/**`, `src/components/ativos/linha-do-tempo.tsx` (+ demais componentes da ficha), `src/app/(app)/page.tsx` e os pontos da varredura §0, `src/lib/ajuda/**` |
| **Orquestrador** | `docs/**`, `README.md`, `CHANGELOG.md`, `scratchpad/**`, produção, push |

Fronteira W2×W3: `dominio.ts` é de W2 (W3 só consome); a ficha e as queries são de W3 (W2 só consome). Precisou cruzar → o orquestrador arbitra na integração.

### 1.4 Rollout (orquestrador — a parte sensível)

1. União verde (`lint`+`test`+`build`) + roteiros SQL ✓ em DEV + E2E DEV dos aceites §1.5.
2. **Smoke baseline** contra a produção atual (`scratchpad/smoke/smoke-prod.mjs`): registre a saída.
3. **Aplicar `0044` e depois `0045` em produção** via MCP (caminho A do runbook — aditivas, sem gate). Verificação pós-apply obrigatória: os dois enums contêm os valores novos (`select unnest(enum_range(null::public.status_ativo))` e o equivalente de `tipo_movimentacao`), as colunas existem, `devolver_ao_fornecedor` tem **exatamente 1 assinatura** e grants certos (authenticated=true, anon/service_role=false), `status_apos_movimentacao` contém o caso novo (`pg_get_functiondef`). Depois: `notify pgrst, 'reload schema';`.
4. **Push único na `main`** → aguardar deploy READY na Vercel. (SQL antes do deploy — o código novo depende das colunas; o código velho ignora as colunas novas, então a janela é segura.)
5. **Smoke pós-deploy**: exit ≠ 0 → incidente — corrija e repita; se grave, promova o deploy anterior no painel Vercel (não é git revert destrutivo) e registre.
6. Docs: `docs/RELATORIO-F14.md` (novo), `docs/DECISOES.md` (2026-07-23 · F14), `docs/ESPECIFICACAO.md` (§4 estados+transições, §5 vocabulário novo, §7 se o relatório mudou — emendas marcadas, precedente F7), `CHANGELOG.md`, `README.md`, `docs/prompts/README.md` (linha F14), `docs/RUNBOOK-BANCO.md` (ledger: 0044/0045 registradas). Resumo final ~10 linhas em pt-BR apontando o relatório.

### 1.5 Aceites — o "pronto" de cada MN (verificados em DEV; produção via smoke/SQL de conferência)

- **MN1:** registrar `envio_manutencao` sem chamado do fornecedor é barrado no form (mensagem pt-BR) e no banco (teste SQL da check); com o campo, grava. Linhas históricas continuam válidas (`NOT VALID`). O campo aparece no form de manutenção, na linha do tempo da ficha e no card de manutenção do relatório — e **não** aparece em colunas/filtros de `/ativos`/`/movimentacoes`, no combobox nem no export geral. `chamado` interno visível (opcional) no envio.
- **MN2:** roteiro SQL ✓: `em_manutencao` + `devolucao_fornecedor` → `devolvido_fornecedor`; o tipo novo de QUALQUER outro estado → exceção; de `devolvido_fornecedor`, `saida`/`transferencia`/`envio_manutencao` falham e `ajuste` funciona; estorno da devolução restaura `em_manutencao` (regra 6 — e **não** apaga o substituto já criado: imutabilidade; registre a decisão). `TRANSICOES` TS espelha o banco; `dominio.test.ts`/`movimentacao.test.ts` verdes; badge e rótulo "Devolvido ao fornecedor" nas telas; inventário/KPIs/pendências excluem o estado como excluem `descartado` (100% da tabela `impacto.md` endereçado).
- **MN3:** fluxo com substituto num submit só — teste SQL da RPC: com substituto cria movimentação + ativo + compra + vínculo; **colisão de patrimônio+service tag do substituto → rollback total** (nem a devolução entra); sem substituto (`p_substituto null`) registra só a devolução. UI: disponível para ativo `em_manutencao`, lote sempre 1, opção "sem substituto" visível; painel de sucesso com os dois ativos.
- **MN4:** substituto nasce `em_estoque` com todos os campos cadastrais editáveis (hostname incluso) exceto fornecedor (herdado do antigo) e chamados (herdados do último `envio_manutencao`, read-only e gravados na devolução); `substitui_ativo_id` gravado; ficha do novo mostra a seção "Histórico do ativo substituído" com a linha do tempo do antigo (sem copiar movimentações) + link; ficha do antigo mostra "Substituído por …"; a compra do substituto aparece nas **Entradas** do período (é entrada real, não baseline).
- **Qualidade:** `npm run lint && npm run test && npm run build` verdes (novos testes somam sobre os 925); job `banco` do CI verde (todas as migrations aplicam do zero + roteiros ✓); smoke baseline e pós-deploy OK; docs da §1.4.6 atualizados; `RELATORIO-F14.md` com saídas reais coladas.

---

## §W — Prompts das frentes

**Comum a todas:** "Você é a frente **Wn** da OS-F14. Contrato de nomes na §0 — não re-decida. Regras §1.2; arquivos só da sua linha na §1.3. Antes de escrever, leia os arquivos-âncora citados na §0 do seu recorte e siga o padrão do repositório (não o genérico). `npm run lint && npm run test && npm run build` no fim do seu recorte. Entregue: diff, checklist do aceite §1.5 autoverificado, rascunho para DECISOES, pendências."

- **W1 (banco):** duas migrations, e a separação **não é estética**: valor novo de enum não pode ser usado na mesma transação que o adiciona, e cada migration roda numa transação (o job `banco` do CI aplica todas em ordem). `0044_manutencao_fornecedor_enums.sql` = só os dois `alter type ... add value if not exists`. `0045_manutencao_fornecedor.sql` = colunas (`chamado_fornecedor`, `substitui_ativo_id` + índice), a check `NOT VALID` do MN1, a recriação de `status_apos_movimentacao` **partindo da última definição vigente** (confira se 0024/0040 a recriaram; diff = só o caso novo + a exclusão na `transferencia` — precedente do diff-review do runbook §B.3), a RPC `devolver_ao_fornecedor` e grants. Roteiro SQL no padrão de `supabase/tests/maquina_estados.sql` (✓/✗, transação com rollback) cobrindo os cenários dos aceites MN2/MN3. Aplicar em DEV/ensaio via MCP, rodar os roteiros lá, `npm run db:types`, seed com 1–2 casos do fluxo novo. Se alguma view/função antiga enumerar estados de baixa (varredura §0), a recriação entra na 0045.
- **W2 (motor + fluxo):** `dominio.ts` (metas/ordens/pill do estado e do tipo novos), `validators/movimentacao.ts` (`TRANSICOES`, `CAMPOS_POR_TIPO` com `chamado_fornecedor` como campo novo, schema do tipo novo na união discriminada — o form de lote NÃO cria `devolucao_fornecedor`; o tipo entra no schema para a action dedicada), validator + Server Action da devolução (padrão `registrarCompra`: pré-checagens amigáveis + RPC + `revalidatePath` de `/ativos` e `/relatorios`), UI do fluxo (encaixe §MN3, sub-form do substituto com herdados read-only, opção "sem substituto", painel de sucesso). Toda função pura nova com teste.
- **W3 (leituras + ficha + relatório + varredura):** queries e tipos do relatório (chamado do fornecedor no caso de manutenção; caso encerrado por devolução com badge própria; `devolucao_fornecedor` tratado como `descarte` nas tabelas/série), ficha (vínculo nos dois sentidos + seção com a linha do tempo do antigo), linha do tempo exibindo `chamado_fornecedor` nas movimentações de manutenção, varredura `impacto.md` aplicada (KPIs, estoque, as-of, pendências, export), ajuda (`conteudo.ts` + testes) descrevendo o fluxo novo.

## §R — Onda 3: revisão adversarial + fechamento (orquestrador)

1. Subagente revisor em **contexto fresco, com refutação por padrão** (precedente F9–F13): revisa o diff inteiro contra os aceites §1.5, as invariantes §1.2.6 e a tabela `impacto.md` — "aponte lacunas de correção, regressão ou requisito descumprido; não estilo; para cada achado, tente refutá-lo antes de reportar". Lentes obrigatórias: máquina de estados (SQL×TS em sincronia), atomicidade/corrida da RPC, vazamento de visibilidade do MN1 (o campo aparecendo onde não devia), inventário (algum lugar ainda conta `devolvido_fornecedor`?). Emendas → re-revisão até limpar.
2. E2E DEV final dos aceites + suíte na união → rollout §1.4 completo.
3. `docs/RELATORIO-F14.md`: o que mudou (arquivos e porquês), decisões (aponte DECISOES.md), saídas **reais** de lint/test/build, dos roteiros SQL e dos smokes (antes/depois), a tabela `impacto.md` final, pendências, e a seção **"o que este relatório NÃO prova"** (precedente F12/F13 — ex.: o fluxo real em produção só será exercitado na próxima manutenção de verdade; diga exatamente o que o Johnny confere no primeiro caso real). Evidências, não afirmações.

## Idioma

Narrativa, relatório, commits e UI em pt-BR. Identificadores de domínio em português sem acento (`devolucao_fornecedor`, `chamado_fornecedor`), utilitários/infra em inglês (padrão do repositório).

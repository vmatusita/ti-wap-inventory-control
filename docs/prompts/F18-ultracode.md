ultracode

# OS-F18 (ultracode) — Pendência de item faltante por MOVIMENTAÇÃO (ciclo de vida próprio, sem prender o ativo)

Ordem **executável e autocontida** (24/07/2026). Hoje o checklist da devolução grava `itens faltantes: mochila, …` como TEXTO no campo livre `ativos.pendencia` — a pendência gruda no ATIVO: viaja com o próximo dono (saída a partir de `em_triagem` não limpa), só morre num `triagem_ok` (que apaga o campo INTEIRO, sem rastro de desfecho) e, como não existe cobrança formal na empresa (mochila de desligamento quase nunca volta), a fila só cresce. Decisão do Johnny (24/07/2026): **a pendência de item faltante vira um registro próprio, POR ITEM, atrelado à DEVOLUÇÃO que a gerou** (e ao colaborador daquela movimentação), com ciclo de vida explícito — nasce aberta e encerra por ação **manual com desfecho** ("item recuperado" ou "baixa — não vai voltar", observação opcional, individual ou **em lote**). E **dados vindos do import não abrem pendência de item** — mesmo racional da migration `0049` para o termo: o legado da planilha não inunda a fila; o rastro fica nas movimentações. O ativo circula livre; o histórico imutável continua na movimentação. Objetivo em uma linha: **nenhum ativo carregando "itens faltantes" no campo livre**, uma fila de pendências de item que a operadora consegue ZERAR com critério e rastro, e o ciclo novo coberto por roteiro SQL, testes e relatório com contagens medidas.

**Modo autônomo com acesso total (CLAUDE.md).** Você roda de forma autônoma: **ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) spec/CLAUDE.md/convenções do repositório; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

**Produção e git.** Trabalho **direto na `main`** (precedente F14–F17), commits pequenos e frequentes; **push = deploy automático (Vercel)**. Esta ordem TEM migrations novas (a partir da **`0050`**) e TEM **backfill que altera dados em produção**: siga o `docs/RUNBOOK-BANCO.md` — **ENSAIO primeiro** (medições coladas), depois **PRODUÇÃO** precedida de **backup/export das tabelas afetadas** (`ativos`, `movimentacoes` e a tabela nova) e conferência de contagens (precedente 0049, que traz os números medidos no próprio comentário da migration). Proibido sempre: force push, `git reset --hard`, `git clean`, editar migration já aplicada, deletar/pular/enfraquecer teste ou cenário de roteiro para passar. Se o classificador barrar um push (precedente F7/0034): não insista — deixe commitado local, relatório completo e a instrução de 2 minutos para o Johnny.

**Dados e segredos.** Nenhum dado real (nome, patrimônio, e-mail) em teste, exemplo, seed ou relatório — sempre fictícios (`WAP0001234`/"Fulano"). Roteiros SQL são `begin; … rollback;` no stack local do Supabase CLI ou no projeto de **ENSAIO** (ids no runbook) — prova destrutiva nunca em produção; em produção só o rollout do §R, com backup antes.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre.

---

## §0 — Mapa do terreno (levantado no código em 24/07/2026 — confirme antes de mexer)

1. **Escrita:** o trigger `aplicar_movimentacao`. CUIDADO: a versão VIGENTE da função **não é a `0004`** — ela foi recriada na `0023` (snapshot completo p/ estorno) e possivelmente de novo nas `0045`/`0047` (manutenção/troca). **Parta da última definição aplicada** (leia as migrations em ordem; a sua migration recria a função inteira a partir da vigente, com o diff comentado). Hoje ela: (a) em `devolucao` com `itens_faltantes` não vazio grava `pendencia = 'itens faltantes: ' || array_to_string(new.itens_faltantes, ', ')` no ativo; (b) em `triagem_ok` faz `pendencia = null` — **apagando o campo INTEIRO**, inclusive trechos alheios e `;`-joinable (`sem patrimônio físico`, `sem service tag`, `patrimônio não canônico…`) — bug latente que esta ordem corrige de passagem.
2. **Leitura:** `v_pendencias` (vigente = **`0049`**, já com a dispensa de termo para `origem='importacao'`) expõe o texto; o bucket "Itens faltantes" é derivado por prefixo em `src/lib/queries/pendencias-detalhe.ts` (`classificarPendencia`). Consumidores: página `/pendencias` (lista + chips + ação inline), badge da sidebar (`contarPendenciasAbertas`), chips de `getPendencias` (`src/lib/queries/relatorios/pendencias.ts` — usados também no relatório §5 e no dashboard), export CSV (`exportarPendenciasCSV` — mesmas linhas da tela, F10·T5).
3. **Estorno:** restaura `ativos.pendencia` pelo `snapshot_anterior` (0023) — isso continua valendo para os OUTROS trechos; para itens, o inverso de "criou linhas" passa a ser "remove as linhas" (§A2).
4. **Import:** go-live F4 e import de startup (RPCs `importar_*`, migrations `0032→0048`) escrevem `ativos.pendencia` e criam movimentações marcadas (`ativos.origem='importacao'`; observação com prefixo `OBS_IMPORT_STARTUP` de `src/lib/dominio.ts`). Investigue ONDE o import pode produzir trecho "itens faltantes" ou devolução com checklist; a regra desta ordem: **nada com origem no import abre pendência de item** (precedente 0049).
5. **Checklist:** `ACESSORIOS_DEVOLUCAO` em `src/lib/dominio.ts` (carregador, mochila, mouse, teclado, mousepad…). O array imutável `movimentacoes.itens_faltantes` continua sendo a fonte histórica — esta ordem **não muda o formulário de devolução** nem a coluna "Itens faltantes" das Entradas do relatório.

---

## §1 — Orquestração

### 1.0 GATE de entrada

(a) Working tree **limpo na `main`** e sincronizado com `origin` (este arquivo, untracked, não conta). Sujo → PARE e reporte. (b) Baseline verde HOJE: `npm run lint && npm run test && npm run build` — vermelho → PARE e reporte. (c) Inventário de capacidades, registrado no relatório: MCP Supabase enxerga ENSAIO e PRODUÇÃO (`list_projects`/`list_migrations`)? Docker/`supabase start` disponível? `gh` autenticado? As provas do §V se adaptam ao que existir. (d) `ls supabase/migrations/` — última conhecida **`0049`**; as novas começam na **`0050`**. (e) Leia ANTES de escrever qualquer SQL: a definição VIGENTE de `aplicar_movimentacao` e de `v_pendencias`, o `docs/RUNBOOK-BANCO.md` e TODOS os roteiros de `supabase/tests/`.

### 1.1 Grafo

    ONDA 1 (sequencial, banco)            ONDA 2 (∥, arquivos disjuntos §1.3)   ONDA 3 (orquestrador)
    Frente A: migrations 0050+ (tabela,   Frente B (app: queries/actions/UI)  → integração (lint+test+build na união)
    trigger, leitura, backfill) provadas  ∥ Frente C (ajuda/spec)             → revisão adversarial (5 lentes) → emendas
    no ENSAIO + roteiros SQL; SEM tocar                                       → re-verificação → rollout §R (produção)
    produção nesta onda                                                       → docs §D → RELATORIO-F18

A Frente B nasce sobre os tipos regenerados (`npm run db:types` contra o ensaio com as migrations aplicadas) — por isso a onda 1 vem antes.

### 1.2 Regras globais

1. **Escopo fechado nesta ordem.** O que surgir de fora vira backlog no relatório (CLAUDE.md regra 1).
2. **Zero dependência nova** (`package.json` byte a byte igual). Nenhum papel/role novo, nenhum serviço novo. Realtime: não adicione a tabela nova à publication por padrão — `/pendencias` não usa realtime hoje.
3. Convenções CLAUDE.md integrais: pt-BR em UI/erros/commits; Server Components por padrão; escritas via Server Actions com Zod; `src/components/ui/**` intocado; datas `dd/MM/yyyy`; `tabular-nums`; identificadores de domínio em português sem acento.
4. **Verificação real a cada incremento** (§V). Causa raiz, nunca supressão. Roteiros/testes que asserem o comportamento ANTIGO são **atualizados** para o comportamento novo (com a mudança explicada em comentário) — nunca apagados ou enfraquecidos.
5. **Invariantes:** buckets `termo`/`triagem`/`patrimonio`/`outras` com contagens IDÊNTICAS antes/depois (só o bucket de itens muda de fonte); NENHUMA contagem de movimentações/relatório muda; snapshots gerados continuam abrindo; o viewer por senha não ganha acesso novo; import, termos, kits, manutenção e troca com comportamento intacto (exceto a dispensa de pendência de item, objeto da ordem).
6. Commits pt-BR conventional: `feat(f18): pendência de item faltante por movimentação`, `fix(f18): triagem_ok preserva trechos alheios de pendencia`.

### 1.3 Propriedade de arquivos (disjunta na onda 2)

| Frente | Arquivos |
|---|---|
| **A** (onda 1) | `supabase/migrations/0050+`, `supabase/tests/**`, `src/lib/types/database.ts` (gerado) |
| **B** | `src/lib/queries/**`, `src/lib/actions/**`, `src/lib/validators/**`, `src/lib/dominio.ts` (+ testes), `src/app/(app)/pendencias/**`, `src/app/(app)/ativos/[id]/**`, `src/components/pendencias/**`, `src/components/ativos/**`, `src/components/relatorios/pendencias-chips.tsx` (se precisar) |
| **C** | `src/lib/ajuda/conteudo.ts` (+ teste), `docs/ESPECIFICACAO.md` (emendas §5/§6/§8) |
| **Orquestrador** | `docs/DECISOES.md`, `README.md`, `CHANGELOG.md`, `docs/prompts/README.md`, `docs/RELATORIO-F18.md`, rollout, push |

---

## §A — Frente A: banco (modelo novo, trigger, leitura, backfill)

**A1 — Tabela nova** (nome sugerido `pendencias_item`; ajuste se houver razão, registrando): **uma linha por ITEM faltante**. Colunas mínimas: `id` pk, `ativo_id` fk, `movimentacao_id` fk (a devolução geradora), `item text` (valor do checklist), `colaborador text` (quem devia devolver — da própria movimentação: `colaborador` dela, senão `snapshot_anterior->>'colaborador'`; snapshot textual deliberado, como o resto do sistema), `filial_id` (da movimentação — para o filtro por filial da página), `status` aberta/resolvida (enum novo ou text+check — o mais simples, registre), `desfecho` (`recuperado` | `baixa`, null enquanto aberta), `observacao text null`, `resolvida_em timestamptz null`, `resolvida_por` fk `profiles` null, `created_at`. **RLS** no padrão das demais tabelas de operador (o viewer por senha NUNCA alcança — `/pendencias` segue bloqueada no proxy). Índices para as consultas reais da página (abertas por filial/ativo).

**A2 — Trigger `aplicar_movimentacao`** (recriar a partir da versão VIGENTE, diff mínimo comentado):
- `devolucao` com `itens_faltantes` não vazio → INSERT de uma linha ABERTA por item; **para de escrever** `itens faltantes: …` em `ativos.pendencia` (o array na movimentação continua — histórico imutável).
- `triagem_ok` → **deixa de tocar `pendencia`** (correção do bug latente do §0.1b; nenhum trecho alheio pode mais ser apagado por triagem).
- `estorno` de uma `devolucao` → **remove (DELETE) as linhas de pendência criadas por aquela movimentação** — inverso exato e simétrico do insert (o rastro do que faltou permanece na própria movimentação estornada); a restauração de `ativos.pendencia` via snapshot continua como está, para os outros trechos. Se preferir marcar em vez de deletar, justifique em DECISOES — a régua é o inverso mais limpo.
- **Import:** garanta que NENHUM caminho de import (RPCs `importar_*`) crie linha aberta — se alguma RPC replica a lógica de devolução/pendência, ela ganha a mesma dispensa. Investigue e registre o que encontrou, mesmo que a resposta seja "nenhum caminho cria".

**A3 — Leitura:** `v_pendencias` **não ganha nem perde coluna** (regra do `create or replace`); após o backfill o texto `itens faltantes` simplesmente deixa de existir no campo livre — se algum ajuste na view for mesmo necessário, diff mínimo comentado (precedente 0049). Para a página, crie a fonte de leitura das pendências de item (view `v_pendencias_item` com `security_invoker = true` juntando ativo/filial/movimentação — patrimônio, marca/modelo, categoria, filial slug+nome, colaborador da época, item, `desde` = data da devolução — ou consultas diretas na camada `src/lib/queries/`; escolha o desenho mais simples que sustente filtros + paginação estável + CSV = tela, e registre).

**A4 — Backfill (migration própria; altera dados → backup antes em produção).** Para cada ativo cujo `pendencia` contém o trecho `itens faltantes…`:
1. Localize a devolução geradora: a ÚLTIMA `movimentacao` do ativo com `tipo='devolucao'` e `itens_faltantes` não vazio.
2. **Origem sistema** (devolução real registrada no dia a dia) → crie as linhas ABERTAS ligadas a ela, a partir do **array da movimentação** (fonte mais confiável que o parse do texto; se divergirem, o array manda e a divergência vai para o relatório).
3. **Origem import** (`ativos.origem='importacao'` sem devolução real no sistema, ou trecho escrito pelo import) → **não cria linha aberta** — dispensa, precedente 0049; o rastro permanece na movimentação/ficha.
4. **Órfãos** (trecho sem devolução localizável e sem marca de import) → não invente vínculo: dispensa, com contagem separada no relatório (régua da 0049: fila limpa > cobrança sem lastro).
5. Em TODOS os casos, remova **só o trecho** `itens faltantes…` de `ativos.pendencia`, preservando os demais trechos `;`-joinable (mesma semântica de `limparTrechoPendencia` em `src/lib/actions/ativos.ts`, reimplementada em SQL — **atenção: a lista de itens tem vírgulas internas; o separador de trechos é `;`, nunca `,`**).
6. **Idempotente** (rodar duas vezes não duplica linha) e com bloco de SMOKE comentado no fim (padrão 0049): trechos encontrados = abertas criadas + dispensadas-import + dispensadas-órfãs; invariante forte: **zero ativos com `pendencia ilike '%itens faltantes%'` depois**; buckets restantes idênticos.

**A5 — Roteiro SQL novo** `supabase/tests/pendencias_item.sql` (padrão `begin;…rollback;` com ✓/✗, como os existentes), cobrindo no mínimo: devolução com 2 itens cria 2 abertas ligadas à movimentação; devolução sem item marcado não cria nada; `triagem_ok` não mexe nas abertas NEM em `ativos.pendencia` (plante `sem patrimônio físico` antes e confira que sobrevive); saída seguinte do ativo não cria nem limpa nada; estorno da devolução remove as linhas dela; resolução (update simulando a action) grava desfecho/quem/quando; caminho de import não abre pendência. **E atualize os roteiros existentes** que asserem o comportamento antigo (ex.: `maquina_estados.sql`, se cobre a regra 3 / o `triagem_ok` limpando). Regra do RUNBOOK (F17): mudou função/trigger → **rode TODOS os roteiros**, zero ✗.

**Aceite A (autoverifique item a item):**
- [ ] Tabela nova com RLS + `npm run db:types` regenerado sem edição manual.
- [ ] Trigger vigente recriado: devolução → abertas; `triagem_ok` não toca `pendencia`; estorno remove as linhas da movimentação estornada; NADA mais mudou no diff da função.
- [ ] Backfill provado no ENSAIO com contagens coladas; zero `%itens faltantes%` em `ativos.pendencia`; buckets restantes idênticos antes/depois.
- [ ] TODOS os roteiros de `supabase/tests/` com zero ✗ num Postgres com TODAS as migrations aplicadas.

---

## §B — Frente B: app (fila, resolução, ficha, contagens)

**B1 — Página `/pendencias`:** o tipo "Itens faltantes" passa a listar as ABERTAS do modelo novo — uma linha por item: item, patrimônio (link para a ficha), marca/modelo, **colaborador da ÉPOCA** (o da devolução — NUNCA `colaborador_atual` do ativo), filial, "desde" (data da devolução, com o "há N dias"). Os demais tipos seguem vindo de `v_pendencias`; a fusão acontece na camada de queries (`listarPendencias` compõe as duas fontes mantendo filtros — filial, tipo, busca `q` —, paginação estável com desempate por id e a MESMA semântica no export CSV, que continua espelhando exatamente a tela — F10·T5; se o CSV ganhar colunas novas, ex. `item`, registre). Chips da página e badge da sidebar (`contarPendenciasAbertas`) somam as duas fontes.

**B2 — Ação "Resolver":** na própria linha (padrão `ConfirmarAssinaturaDialog`): desfecho **"Item recuperado"** ou **"Baixa — não vai voltar"** + observação opcional; Server Action nova (`resolverPendenciaItem`) com Zod, aceitando **1..N ids** (resolução em LOTE com uma justificativa só — é o caminho para zerar a fila herdada); grava `resolvida_em/por`, revalida `/pendencias`, a ficha e os relatórios. Resolver é definitivo nesta fase (reabrir = backlog). Na lista, seleção múltipla simples (checkboxes) + botão de lote; o estado vazio comemorativo existente continua correto quando zerar.

**B3 — Ficha do ativo:** pendências de item do ativo visíveis na ficha — abertas com destaque, resolvidas com desfecho/quem/quando (decida a forma: bloco próprio ou entrada na linha do tempo; recomendo visível sem clique quando houver aberta). Resolvida NÃO some da ficha (auditoria) — só da fila.

**B4 — Relatório §5 / dashboard:** os chips de pendências passam a contar as abertas do modelo novo no AO VIVO; snapshots congelados **não retroagem** (jsonb `schema: 2` intacto; campo novo só se opcional — precedente F16/F17; registre). Card do dashboard idem.

**B5 — `src/lib/dominio.ts`:** rotulagem dos desfechos e helpers puros necessários, com teste Vitest (padrão do arquivo).

**Aceite B (autoverifique item a item):**
- [ ] Fluxo E2E no ensaio, com evidência textual no relatório: devolução com mochila marcada → pendência aberta com o colaborador da época → **saída do mesmo ativo para OUTRA pessoa → a pendência continua na fila apontando a pessoa antiga e nada de "dívida" aparece para o dono novo** → resolver com "baixa" → some da fila/badge/chips/CSV e permanece na ficha como resolvida.
- [ ] Resolução individual E em lote funcionando, auditáveis (quem/quando/desfecho por linha).
- [ ] Filtros/busca/paginação/CSV coerentes entre si (mesmas linhas da tela).
- [ ] Mobile 375px sem scroll lateral novo; dark mode ok; nenhum href novo para o viewer.
- [ ] `npm run lint && npm run test && npm run build` verdes; contagem de testes só sobe.

---

## §C — Frente C: documentação viva

`src/lib/ajuda/conteudo.ts` (+ teste): verbete "Itens faltantes" reescrito — atrelada à devolução e ao colaborador da época, não gruda no ativo; encerra-se na própria lista com desfecho (recuperado/baixa), individual ou em lote; import não gera pendência (como o termo, 0049); triagem OK não apaga mais nada disso. `docs/ESPECIFICACAO.md`: emenda F18 na regra 3 do §8 (que hoje diz "vira a pendência automaticamente" no ativo) e nos trechos do §5/§6 que descrevem pendência — passa a descrever o modelo por movimentação, o encerramento manual e a dispensa de import. **Aceite C:** ajuda e spec sem contradição com o comportamento novo; testes da ajuda verdes.

---

## §V — Verificação (rode de verdade, a cada incremento)

1. `npm run lint && npm run test && npm run build` — verdes, sempre; itere até passar, causa raiz, nunca supressão.
2. **Roteiros SQL pelo melhor caminho disponível** (precedente F17·A1; registre qual): Docker/`supabase start` → réplica do job `banco` do CI sobre TODOS os roteiros; senão MCP no ENSAIO com provas por SELECT que retornam linhas (não dependa de NOTICE/WARNING); senão análise estática + o CI do push como prova final.
3. Fluxo E2E do Aceite B no ensaio, com evidência.
4. **Revisão adversarial** (entre integração e rollout): cinco lentes independentes em contexto fresco, refutação por padrão, apontando só lacuna de correção/requisito (não estilo): (1) **trigger/migrations** — o diff da função vigente muda SÓ o que a ordem manda? estorno continua inverso completo? (2) **backfill** — idempotente? preserva trechos alheios (vírgulas internas!)? contagens fecham? import/órfãos como mandado? (3) **RLS/viewer** — tabela/view novas invisíveis à senha de acesso; nada vaza além de contagem; (4) **UI** — colaborador da ÉPOCA (nunca o atual), lote, estados vazios, 375px, dark, CSV = tela; (5) **regressão** — buckets restantes idênticos, contagens de relatório intactas, snapshots antigos abrem, dashboard ok, nenhum teste enfraquecido. Achado real → corrija → re-revise até limpar.

## §R — Rollout (orquestrador, só depois de tudo verde)

1. União verde local + roteiros zero ✗ + E2E do ensaio ok.
2. Migrations em **PRODUÇÃO** pelo runbook: **backup/export antes** (`ativos`, `movimentacoes`), aplicar `0050+`, rodar o smoke da migration com contagens antes/depois **COLADAS no relatório** (invariante zero `%itens faltantes%`; buckets restantes idênticos; abertas criadas + dispensadas conferem com o medido no ensaio em proporção).
3. Push na `main` → deploy Vercel; conferir **READY** + `get_runtime_errors` limpo (MCP Vercel, padrão F15–F17).
4. GitHub Actions **verde** (job `banco` incluso — os roteiros rodam lá): `gh run watch`; sem `gh` → pendência com link.
5. Smoke leve de produção: `/pendencias` abre para operador e as contagens batem com o medido.

## §D — Documentação e relatório final

- `docs/DECISOES.md` — ata F18: modelo por movimentação (pedido do Johnny, 24/07/2026), encerramento manual com desfecho, dispensa de import (precedente 0049), nome/forma da tabela, DELETE no estorno, órfãos, CSV.
- `CHANGELOG.md` + `README.md` (status F18) + `docs/prompts/README.md` (linha F18 na tabela).
- `docs/RELATORIO-F18.md` em pt-BR: o que mudou e por quê, por frente; **evidências reais coladas** (saídas de lint/test/build, roteiros com ✓, contagens do backfill no ensaio E na produção, fluxo E2E, estado da run do Actions); pendências; seção "o que este relatório NÃO prova" (padrão F12–F17).
- Resposta final no chat: resumo de ~10 linhas em pt-BR com os aceites A/B/C **autoverificados item a item**.

# Idioma

Narrativa, decisões, relatório e UI em pt-BR; identificadores de domínio em português sem acento e utilitários em inglês (convenção do repo); commits em pt-BR, estilo conventional.

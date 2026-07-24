# Relatório F17 — CI de banco verde de novo + legendas explicativas no relatório

**Data:** 24/07/2026 · **Modo:** autônomo (CLAUDE.md) · **Base:** `da45284` (fim da F16)

Duas frentes independentes, **sem migration, sem RPC nova/alterada e sem dependência nova** (`package.json` byte a byte igual). **(A)** O job `banco` do CI (GitHub Actions) estava **vermelho desde o push da F15** — voltou ao verde pela causa raiz. **(B)** O relatório ganhou **legendas que se explicam sozinhas** para o operador e para o visualizador por senha. Orquestração: descoberta do subsistema de relatórios e a revisão adversarial de 5 lentes rodaram como **workflows** (read-only); as **edições de repositório ficaram no loop principal, com verificação `git diff` a cada escrita** (autoproteção contra o hazard intermitente de Write/Edit sob o OneDrive — ver `docs/DECISOES.md`).

---

## Frente A — o CI de banco de volta ao verde

### Causa raiz (confirmada por reprodução)

O job `banco` sobe um Postgres pela Supabase CLI, aplica **todas** as migrations em ordem e roda cada `supabase/tests/*.sql` com `psql`, falhando em qualquer `WARNING: ✗`. A mensagem observada era `roteiro supabase/tests/manutencao_fornecedor.sql marcou ✗ (cenário falhou)`.

- O cenário **4d** de `manutencao_fornecedor.sql` (F14) exigia que a movimentação do **substituto** criado pela RPC `devolver_ao_fornecedor` fosse `compra`.
- A migration **`0047`** (F15/C3) mudou exatamente isso: o substituto passou a nascer por **`troca`** (não é compra — o equipamento chegou por substituição do fornecedor). O roteiro novo `troca.sql` (cenário C3.1) já assevera o comportamento novo, inclusive `count(compra) = 0`.
- Ou seja: os dois roteiros exigiam comportamentos **opostos** da mesma RPC. Com a `0047` aplicada, o 4d marcava `✗ 4d compra do substituto ausente` em toda run desde o push da F15. **O produto está certo** (spec §7 item 7, Emenda F15); o roteiro é que ficou para trás.

### Prova no projeto de ENSAIO (`sgmvldiizsrjbxzzpmhh`, caminho 2 da ordem)

Sem Docker/psql local, a reprodução foi no ENSAIO via MCP Supabase `execute_sql`, num bloco `begin … rollback` que **devolve linhas** (a ferramenta engole `NOTICE`/`WARNING`; então não se depende deles — compara-se o valor real). Reproduzido o cenário 4 (compra → envio_manutenção → `devolver_ao_fornecedor` com substituto):

```
4a_antigo_status          = devolvido_fornecedor
4b_sub_status             = em_estoque
4b_sub_link_igual_antigo  = true          (substitui_ativo_id -> antigo)
4c_sub_fornecedor         = Proprinter Fic (herdado do antigo)
4d_submov_tipo            = troca
4d_submov_compra_count    = 0
4d_submov_troca_count     = 1
```

Confirma que o comportamento **vigente** é `troca`, e que as demais asserções do cenário 4 (4a/4b/4c) seguem verdadeiras. (Nota: o ENSAIO está sem `0039`/`0040` no ledger — pendentes de reconciliação —, o que é irrelevante para a Frente A: ambas PRECEDEM a criação de `devolver_ao_fornecedor` nas `0044`/`0045` e não a alteram. A prova final "os 5 roteiros sem ✗" é o job `banco` verde no GitHub.)

### A correção (no roteiro, nunca no produto)

O cenário 4d passou a exigir a movimentação do substituto como **`troca`** (asserção + mensagens ✓/✗ + comentário explicando a origem F15/0047). **Todas** as demais asserções do cenário 4 e dos outros 6 cenários ficaram intactas — nenhum cenário deletado, pulado ou enfraquecido. Varredura dos outros 4 roteiros (`maquina_estados`, `itens_quantidade`, `dominios_login`, `troca`) contra `0044`–`0048`: nada mais defasado (as migrações da F14/F15 são aditivas e não tocam os ramos exercidos por esses roteiros).

### Prevenção (barata, textual)

Regra nova em `docs/RUNBOOK-BANCO.md`: **mudou função/trigger/máquina de estados/RPC → rode TODOS os roteiros de `supabase/tests/` antes do push, não só o novo.** O `lint`/`test`/`build` locais **não executam** os roteiros SQL — só o job `banco` do GitHub os roda. Foi exatamente o furo da F15. Bullet correspondente nas "Armadilhas conhecidas".

### Prova no mundo real — CI verde

Push da Frente A: `da45284..4c74c38`. Run do GitHub Actions **`30089531148`** (commit `4c74c38`):

| Job | Conclusão |
|---|---|
| `banco` (aplica todas as migrations + roda os 5 roteiros `*.sql`) | **success** |
| — passo "Rodar os roteiros de teste SQL (falha o CI em ✗)" | **success** |
| `verificar` (lint · test · build) | **success** |

Link: `https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/30089531148`. (A run anterior — commit `da45284`, F16 — tinha `conclusion: failure`, confirmando o vermelho pré-existente.)

---

## Frente B — o relatório que se explica sozinho

**Por quê:** o leitor mais importante do relatório — o **visualizador por senha** — não acessa `/ajuda` (rota de operador). Toda a semântica visual das F14–F16 chegava a ele sem explicação. As legendas moram **dentro do relatório**, para as duas audiências, no ao vivo **e** nos snapshots v2 (inclusive antigos — legenda é render, não dado).

**Forma (todas):** textos centralizados em `src/lib/relatorios/legendas.ts` (puro, testado); componentes finos em `src/components/relatorios/legendas.tsx` (sem `'use client'`, sem hooks); estilo discreto (`text-xs text-muted-foreground`); **nunca só em hover/tooltip** (mobile e impressão precisam ler); **texto puro sem href** (viewer-safe).

- **B1 — legenda do Δ dos KPIs.** Sob os KPIs em `corpo-relatorio-v2` (que sempre tem `kpisAnterior`): "Δ = variação frente ao período anterior. A seta ▲▼ mostra a direção; a cor mostra o juízo por indicador: verde = melhorou, vermelho = piorou, cinza = neutro (ex.: em 'Em manutenção', subir é vermelho)." Dashboard e snapshots v1 (sem Δ) não passam por este corpo.
- **B2 — nota de estorno nas tabelas.** Nas 4 tabelas detalhadas, quando há linha estornada visível: "Linha esmaecida (marca 'estornada') = movimentação estornada depois. A contagem do período continua incluindo a movimentação original." Na tabela de itens, a variante descreve o par (o "(estorno)" também). **Nenhuma contagem muda** (comunicação honesta do achado F16 §3).
- **B3 — legenda dos badges de manutenção.** No card "Em manutenção, caso a caso", mostrando SÓ as cores presentes nos casos exibidos: âmbar = em andamento · vermelho = parado há 30+ dias · verde = voltou ao estoque · cinza = devolvido ao fornecedor (sem conserto — o substituto, quando houve, entra nas Entradas como "Troca"). `corDoCaso` espelha a árvore de decisão de `manutencao-casos.tsx` (teste trava o espelho e o limiar de 30 dias). Pública (não gateia por operador).
- **B4 — "Como ler este relatório" (glossário).** Seção recolhível (`GrupoColapsavel`) ao fim do relatório, recolhida no mobile e aberta no desktop e **na impressão**; com chip-âncora `#como-ler` (fragmento na mesma página). Verbetes derivados de `dominio.ts` por `glossarioRelatorio()`, com teste que **trava a cobertura** (todo status de `STATUS_ORDEM` tem verbete). Cobre os 7 KPIs, "Guardados (= Em estoque)", "Reserva técnica (Defasado)", Saída (saída+empréstimo), Entrada (devolução+compra+**troca**), Transferência (nas duas filiais), estoque as-of e estorno (§8 regra 6).
- **B5 — melhorias de leitura (feitas):** empty-state das buscas em Saídas/Entradas diz "nenhuma … encontrada" quando há filtro/busca ativo (pendência da F16 §8); subtítulo nos `GRUPO_TILES` ("Guardados" ganhou "= Em estoque" inline); nota contextual da pílula "Troca"; chip-âncora "Como ler". Descartadas com motivo (registradas em DECISOES): período por extenso (já no cabeçalho), `title`/`aria-label` nas badges (texto já legível), rodapé "dados até dd/MM" (redundante). Fora (não reabertas): contagens × estornadas, snapshot automático, motivo da regeração, selo "repor", T11, T12, export/HTML.

**Alcance v1/v2.** As legendas entram no corpo **v2** (ao vivo + snapshots v2) e nas 4 tabelas. O corpo **v1** (`CorpoRelatorioV1`, snapshots pré-F3B) não usa nenhum componente tocado → intacto, sem regressão. Snapshots v2 antigos ganham as legendas de graça e degradam sozinhos em campo ausente (`estornada?`/`desfecho?` opcionais; `troca` inexistente pré-F15 → nota some).

**Transversais.** A ajuda do operador (`conteudo.ts`, seção "Relatórios") ganhou uma nota de que as explicações agora aparecem dentro do relatório (para o viewer). A spec §7 ganhou a "(Emenda F17)".

---

## Revisão adversarial (5 lentes, refutação por padrão)

Rodada como workflow, em contexto fresco, sobre o diff local:

| Lente | Foco | Veredito |
|---|---|---|
| 1 | Fidelidade dos roteiros SQL ao comportamento vigente (0001→0048) | **limpo** |
| 2 | Viewer/RLS (href novo, vazamento de seção de operador) | **limpo** |
| 3 | Compatibilidade v1/v2 e snapshots antigos | **limpo** |
| 4 | Mobile 375px + impressão | **1 achado (média)** |
| 5 | Contagens e regressão | **limpo** |

**Achado (lente 4), corrigido.** A tabela de movimentações de itens exibe DOIS marcadores de estorno independentes: a badge "estornada" (linhas com `r.estornada`, o original desfeito) e o texto "(estorno)" (linhas com `r.ehEstorno`, o lançamento-inverso). A `LEGENDA_ESTORNO_ITENS` descreve **os dois**, mas o gatilho só checava `r.estornada`. Cenário: um lançamento estornado na virada de período — o inverso cai no período (mostra "(estorno)") enquanto o original fica fora (não há linha `estornada` na tela) → a legenda não renderizava e o "(estorno)" ficava órfão. **Correção no gatilho:** `filtradas.some((r) => r.estornada || r.ehEstorno)`. Mudança localizada e estritamente mais abrangente — sem re-abrir lente.

---

## Evidências (locais)

```
$ npm run lint          → limpo (eslint, sem erros)
$ npm run test          → Test Files 51 passed (51) · Tests 1010 passed (1010)   [era 993 na F16 → +17 de função pura; nenhum deletado/enfraquecido]
$ npm run build         → ✓ Compiled successfully · Running TypeScript OK · 24 rotas geradas (exit 0)
$ npx vitest run src/lib/relatorios/legendas.test.ts  → 17 passed (17)
```

Arquivos novos: `src/lib/relatorios/legendas.ts` (+ `legendas.test.ts`), `src/components/relatorios/legendas.tsx`. Editados: `corpo-relatorio-v2.tsx`, `kpi-tiles.tsx`, `chips-ancora.tsx`, `tabela-{saidas,entradas,transferencias,mov-itens}.tsx`, `ajuda/conteudo.ts`, `ESPECIFICACAO.md` §7. Frente A: `supabase/tests/manutencao_fornecedor.sql`, `RUNBOOK-BANCO.md`.

---

## Rollout

_(Frente A já em produção via o push `4c74c38`; a Vercel republicou sem mudança funcional — a Frente A não toca o app. A verificação de deploy READY + smoke pós-deploy da Frente B é anexada abaixo após o push do marco final.)_

<!-- ROLLOUT-B -->

---

## O que este relatório NÃO prova

- **Sem E2E visual autenticado do relatório.** As legendas moram nas telas de relatório, atrás do login de operador (ou da senha de acesso do viewer). O agente não digita senha em formulário e o bypass de autenticação é corretamente barrado (limite herdado das F11–F16). A prova é por: leitura de código, **17 testes de função pura** (cobertura do glossário, espelho das cores de manutenção, sincronia do limiar de 30 dias, textos das legendas), build tipado, a **revisão adversarial de 5 lentes** (incluindo mobile/impressão por análise de código) e, na Frente B, a compatibilidade v1/v2 conferida por tipos. O render real das legendas a 375px e na impressão não foi visto num navegador logado.
- **Frente A:** a prova "os 5 roteiros sem ✗" é o **job `banco` verde no GitHub** (run 30089531148) + a reprodução do cenário 4 no ENSAIO. Não se rodou psql localmente (indisponível no ambiente).

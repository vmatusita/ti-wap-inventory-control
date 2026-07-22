# OS-F10 (ultracode) — operação em massa: colar lote na movimentação · carrinho de itens · memória do acervo · export CSV (+9)

Ordem **executável e autocontida**. Nasce da **Onda 2** do `docs/BACKLOG-UX.md` (22/07/2026). Objetivo em uma linha: **acabar com o "um a um"** — os **13 itens** de operação em massa: lote colado na movimentação (com teto novo de 30), sugestões e memória em tudo que hoje é redigitado, alerta de duplicata prometido pela spec §8.7, rascunho que sobrevive à navegação, carrinho multi-item nos lançamentos, compra que se repete sozinha e export CSV nas listas. **Zero migration, zero dependência nova.**

**Modo autônomo com acesso total (CLAUDE.md).** Sistema **em produção com dados reais** (~1.600 ativos, 5 filiais). Esta OS não toca banco (nenhuma RPC/trigger/view nova — a leitura nova é toda via `src/lib/queries/`), não toca no import e não afrouxa salvaguarda nenhuma. Subagente que se pegar puxando item da Onda 3 (busca global, ordenação, M8, I4…) está fora do escopo: pare e registre.

**Pré-requisito: F9 concluída.** Esta ordem foi escrita sobre a base **pós-F9** (o carrinho do I1 precisa preservar o listener `wap:lancar-item` do I6; a compra ganhou memória/autofoco na F9; regra de ouro do `docs/prompts/README.md`: uma ordem por vez). As **âncoras de linha do §0 foram medidas na base pré-F9** — espere drift de algumas linhas e **confirme sempre ao abrir o arquivo**; função/símbolo é a referência, número é atalho.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. O orquestrador segue a §1; os blocos §W1–§W6 são os prompts completos dos subagentes (autocontidos). A autoridade do escopo e das decisões está na **§2 (decidido pelo Johnny, 22/07/2026)** — inclusive o **teto 30** do M11, editável ali antes de colar.

---

## §0 — O que estamos consertando (diagnóstico já feito — âncoras da base pré-F9)

| ID | Fricção (fato) | Âncora |
|---|---|---|
| **M1** | O lote de movimentação é montado um a um no combobox; o parser de colar-lista existe mas só serve à compra | `src/components/movimentacoes/nova/passo-ativos.tsx`; `src/lib/patrimonio.ts:25-44` (`parsearLista`) |
| **M3** | Combobox com <2 caracteres mostra só "Digite ao menos 2 caracteres" — nenhuma sugestão de recentes | `src/components/movimentacoes/ativo-combobox.tsx:81-85` |
| **M4** | Colaborador e setor são texto livre redigitado a cada movimentação — grafias divergem (o problema que a spec §5 combate para motivos) | `src/components/movimentacoes/nova/passo-movimentacao.tsx:171-185` |
| **M5** | Regra §8.7 da spec ("alerta de possível duplicata: mesmo ativo + mesmo tipo + mesmo dia — 6 casos reais nas planilhas") **não implementada** em ponto nenhum do fluxo | `docs/ESPECIFICACAO.md` §8 (regra 7, ~linha 214); grep vazio no código |
| **M6** | Nenhum rascunho: navegar para fora (ou o atalho `N` no meio do fluxo) descarta lote e config | grep `sessionStorage` vazio em `components/movimentacoes/**`; `atalho-global.tsx:30` (`router.push`) |
| **M9** | Termo de responsabilidade é um dialog isolado por ativo e "Registrar outra" descarta o acesso; em sucesso parcial os itens **registrados** somem do form (ficam só as falhas) | `src/components/movimentacoes/nova/painel-sucesso.tsx:46-76, 104-106`; `nova-movimentacao-form.tsx` (mantém só `falhaIds`); `actions/movimentacoes.ts:135-138` |
| **M11** | Lote de movimentação aceita **10**; a compra aceita **200** — 15 monitores = duas rodadas | `src/lib/validators/movimentacao.ts:312-317`; `src/lib/patrimonio.ts:8` |
| **A2** | O modo Faixa da compra gera só patrimônios — service tags por unidade obrigam a montar a lista à mão | `src/lib/patrimonio.ts:47-70` (`expandirFaixa`); consumo em `nova-compra-form.tsx:69` |
| **A4** | Marca/modelo/fornecedor são texto livre sem sugestão do acervo ("Dell" vs "DELL"; agrupamentos por modelo dos relatórios sofrem) | `src/components/ativos/nova-compra-form.tsx:335-390` |
| **A6** | Não existe "duplicar/repetir" na compra (o Duplicar é só da movimentação); comprar outro igual = redigitar tudo | ficha `ativos/[id]/page.tsx:102-116` (sem ação de compra); `nova-compra-form.tsx` |
| **I1** | Cada lançamento de item é **um item por vez** — NF com 5 itens = abrir o dialog 5 vezes | `src/lib/actions/itens.ts:37-47` (insert único); `lancar-item-dialog.tsx:122-149` |
| **I2** | Item novo no meio do lançamento exige ir a `/admin/itens`, criar, voltar e reabrir — o `CommandEmpty` é texto morto | `src/components/itens/lancar-item-dialog.tsx:206` |
| **T5** | Nenhuma lista operacional exporta (só `.docx` de termos e backup JSON do import); pedidos avulsos de planilha viram trabalho manual | grep export vazio em Ativos/Pendências/Itens; PapaParse já na stack (F3) |

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) **F9 concluída** (linha F9 no `README.md`/`docs/prompts/README.md`) e working tree **limpo** na `main`; `npm run lint` + `npm run test` + `npm run build` **verdes** (baseline). Se a F9 **não** rodou → **PARE** (esta ordem depende dela). (b) `supabase/migrations/` termina em `0040_hardening_rpcs.sql` — **esta OS não cria migration nenhuma**; frente que "precisar" de banco está com escopo errado: PARE a frente e registre. (c) `docs/BACKLOG-UX.md` §5 marca como **Onda 2** exatamente os 13 itens da §2. (d) Estrutura conforme CLAUDE.md. Falhou qualquer um → **PARE e reporte**.

### 1.1 Grafo de execução

```
FASE 0 (orquestrador)   ONDA 1 (4 frentes ∥ · arquivos disjuntos)      ONDA 2 (1 frente)         ONDA 3            FINAL (orquestrador)
gate §1.0 · branch f10  W1 motor da movimentação (só src/lib/**)       W5 UI do fluxo de         W6 revisão        lint+test+build ·
contrato §1.5 fixado →  W2 compra    (A2 · A4 · A6)                 →  movimentação (M1 · M3  →  adversarial +  →  merge na main ·
baseline verde          W3 itens     (I1 · I2)                         · M4 · M5 · M6 · M9 ·     E2E em DEV +      deploy único Vercel ·
                        W4 export    (T5)                              M11-UI), sobre W1         emendas de docs   resumo consolidado
```

- **Isolamento (precedente F6A/F7B/F7E/F7F/F9):** subagentes paralelos na **mesma árvore**, branch única `f10`, propriedade de arquivos disjunta (§1.3). Worktrees baratos disponíveis → aceitável; decida, registre, siga.
- **W1 é só `src/lib/**`** (queries/actions/validators + testes); **W5 é só `src/components/movimentacoes/**`** e roda na onda 2, **sobre o W1 integrado** — o acoplamento entre eles é o CONTRATO §1.5, fixado para permitir o resto do paralelismo.
- **W4 tem uma única dependência cruzada** (a query de export de ativos, dona W1): implementa Pendências/Itens primeiro e codifica o botão de Ativos **contra a assinatura do contrato**; se o W1 ainda não aterrissou quando o W4 fechar, o orquestrador liga na integração (é 1 import).
- **Ninguém toca** `next.config.ts`, `package.json`, `src/components/ui/**`, `.env`, migrations.

### 1.2 Regras globais

1. **Desenvolvimento e smokes dos subagentes contra o Supabase DEV** (projeto de ensaio); **nenhum subagente toca produção** — produção e deploy são só do orquestrador (§1.4). Custo **R$ 0**.
2. **Zero migration, zero RPC/trigger/view.** Toda leitura nova é função em `src/lib/queries/` sobre tabelas/views existentes; escrita nova continua insert simples via Server Action (o trigger do banco segue sendo o juiz).
3. **Zero dependência nova.** `package.json` sai desta OS **byte a byte igual**. Para o CSV: PapaParse **já está na stack** (CLAUDE.md/F3) — se por qualquer motivo não estiver no `package.json`, **não instale**: escreva o serializador em `src/lib/csv.ts` na mão (escape de aspas é pouco código).
4. **Nenhum dado real** em código/teste/fixture/screenshot: exemplos sempre `WAP0001234` / "Fulano da Silva" / `ST-ABC123`.
5. Convenções CLAUDE.md: UI/erros/commits **pt-BR**; escrita só via Server Actions + Zod (client e servidor com o mesmo schema); leituras em `src/lib/queries/`; datas exibidas `dd/MM/yyyy`; números de tabela `tabular-nums`; patrimônio sempre canônico; Server Components por padrão, `'use client'` só onde precisa.
6. Cada subagente entrega: código na branch + checklist **autoverificado** + rascunho para `docs/DECISOES.md` (data · contexto · escolha · motivo) + pendências; `lint`+`test`+`build` limpos **no seu recorte**.
7. **Invariantes intocáveis:** máquina de estados e validação final no Postgres (a UI e o Zod continuam sendo filtro, nunca juiz); "a movimentação é a fonte da verdade"; estorno como está; modelo de acesso de nível único + viewer por senha; import e salvaguardas; F9 inteira (busca por colaborador, chips de data, badge, `EstadoVazio`, listener `wap:lancar-item`, copiar patrimônio) — **nada da F9 pode regredir**.
8. Commits pt-BR estilo conventional por frente: `feat(f10): colar lista de patrimônios no lote de movimentação`, etc.

### 1.3 Mapa de propriedade de arquivos (disjunto por construção)

| Dono | Arquivos |
|---|---|
| **W1** | `src/lib/queries/movimentacoes.ts`, `src/lib/queries/ativos.ts`, `src/lib/actions/movimentacoes.ts`, `src/lib/validators/movimentacao.ts` + `movimentacao.test.ts`. **Lê** `patrimonio.ts`/`dominio.ts` (não edita). |
| **W2** | `src/components/ativos/nova-compra-form.tsx`, `src/lib/patrimonio.ts` + `patrimonio.test.ts`, `src/lib/queries/compras.ts` (**novo**), `src/lib/actions/compras.ts`, `src/app/(app)/ativos/novo/page.tsx`, `src/app/(app)/ativos/[id]/page.tsx` (**só** o botão "Comprar outro igual") |
| **W3** | `src/components/itens/lancar-item-dialog.tsx` (+ novos arquivos em `components/itens/` se dividir), `src/lib/actions/itens.ts`, `src/lib/validators/item.ts` (+ teste novo se criar funções puras) |
| **W4** | `src/lib/csv.ts` (**novo**) + `csv.test.ts` (**novo**), `src/lib/actions/exportar.ts` (**novo**), `src/lib/queries/pendencias-detalhe.ts`, `src/lib/queries/itens.ts` (variantes de export), `src/components/layout/exportar-csv-button.tsx` (**novo** — mesma casa do `EstadoVazio` da F9), `src/app/(app)/ativos/page.tsx`, `src/app/(app)/pendencias/page.tsx`, `src/app/(app)/itens/page.tsx` (só os botões de export) |
| **W5** | `src/components/movimentacoes/**` (form, passos, combobox, painel-sucesso, config; `gerar-termo-dialog.tsx` **só se** o encadeamento do M9 exigir — preferir orquestrar de fora) |
| **W6** | Revisão (toca qualquer arquivo para **corrigir** achados) + `README.md`, `CHANGELOG.md`, `docs/prompts/README.md`, `docs/DECISOES.md`, `docs/BACKLOG-UX.md`, `docs/ESPECIFICACAO.md` (se o teto 10 estiver escrito lá), `src/lib/ajuda/conteudo.ts` + `conteudo.test.ts` |

Conflito previsto: só o já descrito em §1.1 (W4→W1, resolvido por contrato + ligação na integração). Fora isso, nenhum arquivo tem dois donos. Quem precisar de arquivo alheio: quem é dono implementa, quem precisa especifica; na dúvida, anote pro W6.

### 1.4 Integração e final (orquestrador)

1. **Fim da onda 1:** mesma árvore → sem merge; ligar o que ficou pendente do contrato (ex.: botão de export de Ativos → `listarAtivosParaExport` do W1); `npm run lint && npm run test && npm run build` verdes na união; smoke rápido em DEV do contrato (chamar `resolverPatrimoniosParaLote` com lista fictícia e conferir encontrados/ambíguos/não-encontrados).
2. **Lançar W5** sobre a base integrada (ele consome o contrato inteiro do W1).
3. **Lançar W6** (revisão adversarial + E2E em DEV + emendas). Aplicar as correções dos achados.
4. **Merge na `main`** com o aceite geral §3 todo verde → **deploy único** Vercel → smoke de leitura em produção (dashboard, `/ativos` com um export, `/itens`, fluxo de movimentação **até a revisão, sem registrar**) → resumo consolidado.

### 1.5 CONTRATO entre frentes (fixo — mudar = decisão registrada + aviso ao orquestrador)

**W1 declara e implementa; W5 e W4 consomem sem editar os arquivos do W1:**

```ts
// src/lib/validators/movimentacao.ts  (M11 — única fonte do teto)
export const MAX_LOTE_MOVIMENTACAO = 30   // mensagens do schema citam o valor a partir da constante

// src/lib/queries/ativos.ts
buscarAtivosResumoPorIds(ids: string[]): Promise<AtivoResumo[]>                    // M6 (restaurar rascunho; PRESERVA a ordem pedida)
listarAtivosParaExport(filtros: ParamsDeListarAtivos, cap?: number)                // T5 — mesmos filtros/ordem de listarAtivos
  : Promise<{ linhas: LinhaExportAtivo[]; total: number }>                         //   (exporte o tipo de params se hoje for privado)
// LinhaExportAtivo: patrimonio, service_tag, hostname, categoria, marca, modelo,
//   filial, status, colaborador_atual, setor_atual
// cap default 5000 — buscar em BLOCOS de .range() (Max Rows do PostgREST, default
//   1000, corta requests maiores EM SILÊNCIO); total = count 'exact'; "truncado"
//   é SEMPRE derivado de linhas.length < total, nunca de total > cap

// src/lib/queries/movimentacoes.ts
ultimosAtivosMovimentadosDoOperador(operadorId: string, limite?: number): Promise<AtivoResumo[]>  // M3 (dedup por ativo; exclui compra/estorno; default 8)
sugestoesColaboradores(prefixo: string): Promise<string[]>                         // M4 (distinct não-nulo, ilike prefixo, limit 10)
sugestoesSetores(prefixo: string): Promise<string[]>                               // M4
possiveisDuplicatasDoDia(pares: { ativoId: string; tipo: TipoMovimentacao; data: string }[])
  : Promise<{ ativoId: string; patrimonio: string | null; tipo: TipoMovimentacao }[]>  // M5
// M5 "exclui estornadas": NÃO existe coluna 'estornada' — estorno é OUTRA movimentação
//   com tipo='estorno' e estorno_de=<id da original>. Candidatas por ativo_id/tipo/data
//   e descarte das que têm estorno apontando (2ª consulta .in('estorno_de', ids) — padrão
//   de getHistoricoLancamentos — ou embed reverso). Nº FIXO de queries (≤2), nunca N+1.

// src/lib/actions/movimentacoes.ts — proxies client→server (padrão buscarAtivosParaMovimentacao)
resolverPatrimoniosParaLote(texto: string): Promise<ResultadoResolucaoLote>        // M1
// REGRA: o W1 exporta proxy de action para TODAS as queries novas deste contrato
//   (recentes, sugestões×2, duplicatas, resumo-por-ids) — padrão buscarAtivosParaMovimentacao.
//   O W5 roda em Client Components e SÓ pode chamar proxies, nunca importar src/lib/queries/.

export type ResultadoResolucaoLote = {
  erro?: string                                                     // canal de erro (ex.: acima do teto) — nada de exceção
  encontrados: AtivoResumo[]                                        // resolvidos sem ambiguidade
  ambiguos: { patrimonio: string; candidatos: AtivoResumo[] }[]     // patrimônio duplicado sem ST na linha
  naoEncontrados: string[]                                          // canônicos que não existem
  invalidos: string[]                                               // linhas que nem canonicalizam
}
```

**Regras do resolver (M1, letra a letra):** cada linha aceita `PATRIMONIO` ou `PATRIMONIO<sep>SERVICE_TAG` com os mesmos separadores da compra pós-F9 (vírgula, `;`, TAB); canonicalizar com `canonicalizarPatrimonio` (não editar `patrimonio.ts` — importar); patrimônio **duplicado legítimo** (§5): com ST na linha → resolve direto; sem ST → vai para `ambiguos` com os candidatos (nunca escolha silenciosa); dedup **interno do texto** apenas — o dedup contra o lote atual e o teto ao adicionar são da **UI (W5)**; texto com mais de `MAX_LOTE_MOVIMENTACAO` linhas → devolve `erro` preenchido **sem ir ao banco**; **nada de filtrar por estado aqui** (a interseção de tipos da UI continua sendo o guarda).

---

## §W1 — Subagente W1: motor da movimentação — resolver de lote · recentes · sugestões · duplicata §8.7 · teto 30 · export de ativos

Você é um subagente executando a frente **W1** da OS-F10. Modo autônomo. **Só `src/lib/**`** (linha W1 do §1.3) — nenhuma UI. Você implementa o CONTRATO §1.5 exatamente como declarado. Leia antes: `queries/ativos.ts` (`RESUMO_SELECT`/`resumoDe`/`buscarAtivosParaCombobox` — a F9 acrescentou `colaborador_atual`), `queries/movimentacoes.ts` (`ultimaMovimentacaoDoUsuario`, `buscarMovimentacaoParaDuplicar`), `actions/movimentacoes.ts` (proxy `buscarAtivosParaMovimentacao`, `registrarMovimentacoes`), `validators/movimentacao.ts` inteiro, `patrimonio.ts` (importar, não editar), `dominio.ts`. **Atenção:** `RESUMO_SELECT`, `resumoDe` e `patrimoniosDuplicados` hoje são **privados** em `queries/ativos.ts` — exporte-os (o arquivo é seu) para reusar em `queries/movimentacoes.ts`, e lembre que `AtivoResumo.patrimonio_duplicado` precisa ser preenchido também nas queries novas.

### Entregas

1. **M11 — teto 30.** `MAX_LOTE_MOVIMENTACAO = 30` exportada; `loteMovimentacaoSchema.max(MAX_LOTE_MOVIMENTACAO, ...)` com mensagem citando o valor; varra o arquivo por outros "10" do lote. O servidor re-valida o mesmo schema — nada mais de comportamento a mudar lá; **atualize só os comentários** "1..10"/"lote de 1 a 10" nos seus arquivos (ex.: `actions/movimentacoes.ts:135`) para citarem a constante. Teste atualizado (30 passa, 31 falha, mensagem certa).
2. **M1 — `resolverPatrimoniosParaLote`.** Server Action de leitura (padrão do proxy existente) que implementa as regras do §1.5: parse próprio das linhas (separadores vírgula/`;`/TAB — **não** reutilize `parsearLista`, que é da compra e tem semântica de erro própria; extraia o que fizer sentido para função pura local), canonicalização, busca em lote (`in ('patrimonio', [...])` + tratamento de duplicados via os candidatos), montagem de `encontrados/ambiguos/naoEncontrados/invalidos`. Cap de segurança: mais de `MAX_LOTE_MOVIMENTACAO` linhas → devolve o campo `erro` do contrato **antes de ir ao banco** (nada de exceção — o dialog do W5 exibe). As funções puras (parsear/validar linhas, agrupar candidatos) moram em `validators/movimentacao.ts` — arquivo seu, **não**-`'use server'`, já pareado com `movimentacao.test.ts`; `actions/movimentacoes.ts` é `'use server'` e só pode exportar async.
3. **M3 — `ultimosAtivosMovimentadosDoOperador`.** Últimas movimentações do operador (excluindo `compra` e `estorno`, como a query do "Repetir última" já faz), com embed do ativo (`ativos(<RESUMO_SELECT>)`), limit ~30 ordenado por mais recente, **dedup por ativo em código** (PostgREST não agrupa) e corte no default 8; mapear com `resumoDe`.
4. **M4 — `sugestoesColaboradores` / `sugestoesSetores`.** Atenção: **PostgREST não tem `DISTINCT`** — busque só a coluna (`select('colaborador')`, não-nulo, `ilike prefixo%`, limit generoso ~500), **dedup em código** (trim + case-insensitive) e devolva os 10 primeiros ordenados. Proxy de action para o client (mín. 2 chars no proxy — não bata no banco por 1 letra).
5. **M5 — `possiveisDuplicatasDoDia`.** Para os pares `{ativo, tipo, data}` do lote: existe movimentação **efetiva** do mesmo ativo, mesmo tipo, mesma data? **Não existe coluna "estornada"** — estorno é outra movimentação com `tipo='estorno'` e `estorno_de=<id da original>` (`actions/movimentacoes.ts:278-286`; a linha do tempo deriva isso em código): busque as candidatas por `ativo_id`/`tipo`/`data` e descarte as que têm estorno apontando para elas — 2ª consulta fixa `.in('estorno_de', idsDasCandidatas)` (padrão que `getHistoricoLancamentos` já usa) ou embed reverso. **Número fixo de queries (≤2), nunca N+1.** Devolve o suficiente para a UI montar o aviso âmbar (patrimônio + tipo). É **aviso**, não gate — nenhuma mudança em `registrarMovimentacoes`.
6. **M6 — `buscarAtivosResumoPorIds`.** Busca por ids preservando a ordem pedida; ids inexistentes simplesmente não voltam (a UI descobre pela diferença).
7. **T5 (lado servidor) — `listarAtivosParaExport`.** Mesmos filtros e ordem de `listarAtivos` (exporte o tipo de params se hoje for privado), buscando em **blocos de `.range()`** — o **Max Rows do PostgREST** (default 1.000) corta em silêncio qualquer request maior, então acumule em código — até o `cap` (default 5.000), com `count: 'exact'`; retorna `{ linhas, total }` com os campos de `LinhaExportAtivo` (§1.5). Quem decide "truncado" e exibe é o W4 — aqui é só a leitura fiel.

### O que NÃO fazer

Não tocar em `components/**`, `patrimonio.ts`, `dominio.ts`, no fluxo de escrita (`registrarMovimentacoes` fica **intacto** — o teto novo entra pelo schema), nem criar view/RPC.

### Aceite W1

- [ ] Contrato §1.5 exportado com as assinaturas exatas; smoke em DEV: resolver com lista fictícia mista (válido, duplicado-sem-ST, inexistente, lixo) devolve os 4 baldes certos; acima do teto → campo `erro`, sem exceção
- [ ] **Proxies de action exportados para TODAS as queries novas** (recentes, sugestões×2, duplicatas, resumo-por-ids) — o W5 não pode importar `src/lib/queries/` de client
- [ ] Smokes por query em DEV: duplicata **ignora** movimentação estornada; recentes deduplica e exclui compra/estorno; resumo-por-ids preserva a ordem; export de ativos com cap artificialmente baixo devolve `total` maior que `linhas.length`
- [ ] Teto 30 no schema com teste; suite antiga verde; zero mudança de comportamento em quem já chama as queries existentes
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W2 — Subagente W2: compra — service tags na faixa · memória do acervo · comprar outro igual

Você é um subagente executando a frente **W2** da OS-F10. Modo autônomo. Seus arquivos: linha W2 do §1.3. Leia antes: `nova-compra-form.tsx` inteiro (a F9 adicionou separadores TAB/`;`, dedup no preview com `linha?`, defaults com `localStorage` e autofoco — **preserve tudo**), `patrimonio.ts` + testes, `actions/compras.ts` (`registrarCompra`), `queries/ativos.ts` (**só leitura** — para copiar padrões de select), `queries/movimentacoes.ts` (**só leitura** — `ultimaMovimentacaoDoUsuario` `:128-144`, o padrão de query por `criado_por` que o A6 copia), `movimentacoes/nova/page.tsx:30-64` (**só leitura** — como obter o operador no server), `ativos/novo/page.tsx`, `ativos/[id]/page.tsx`.

### Entregas

1. **A2 — service tags no modo Faixa.** Na aba Faixa, textarea opcional "Service tags (uma por linha, na ordem da faixa)". Helper **puro** em `patrimonio.ts`: `parearFaixaComServiceTags(patrimonios: string[], stsTexto: string)` → pares ou erro (`contagem diferente: 10 patrimônios × 7 service tags`). Vazio = faixa sem STs (comportamento atual). Preview mostra os pares (`WAP0001234 · ST-ABC123`) — reusa o preview existente. Teste: pareamento ok, contagem errada, linhas em branco ignoradas, ST com espaços.
2. **A4 — memória do acervo em marca/modelo/fornecedor.** `src/lib/queries/compras.ts` (**novo**): `sugestoesMarcas(prefixo)`, `sugestoesModelos(marca | null, prefixo)` (filtra pela marca quando houver), `sugestoesFornecedores(prefixo)` — **PostgREST não tem `DISTINCT`**: busque a coluna com `ilike` + limit generoso e **dedup em código** (trim + case-insensitive; o acervo de ~1.600 aguenta), devolvendo os 10 primeiros; proxy em `actions/compras.ts` (padrão dos proxies existentes; mín. 2 chars). O filtro por marca em `sugestoesModelos` é **case-insensitive sem wildcard** (`.ilike('marca', valorEscapado)`, escapando `%`/`_` do valor) — grafia divergente do acervo ("Dell"/"DELL") não pode sonegar modelos da sugestão. Na UI: os 3 campos viram combobox leve (`Command`+`Popover`, padrão do app) com **digitação livre sempre permitida** (valor novo é normal); sugestão selecionada preenche o input. **Nenhuma normalização retroativa** do acervo (fora de escopo).
3. **A6 — "Comprar outro igual" + "Repetir última compra".**
   - `queries/compras.ts`: `dadosParaDuplicarCompra(ativoId)` → categoria, marca, modelo, memória, armazenamento, processador, fornecedor, filial (**nunca** patrimônio/ST); `ultimaCompraDoOperador(operadorId)` → os mesmos campos da última compra registrada por ele. Caminho de dados: `movimentacoes` com `tipo='compra'` e `criado_por=<uid>`, `order('created_at', desc).limit(1)`, embed `ativos(...)` via `ativo_id` — o padrão de `ultimaMovimentacaoDoUsuario`; a filial pré-preenchida vem de `movimentacoes.filial_id` (a filial **da compra**, não a atual do ativo, que muda com transferência).
   - Ficha: ação "Comprar outro igual" no bloco de ações (`[id]/page.tsx`) → `/ativos/novo?duplicar=<id>`.
   - `ativos/novo/page.tsx`: lê `?duplicar`, busca os dados e passa como `inicial` ao form (prop nova).
   - Form: botão "Repetir última compra" (visível quando existir), preenchendo os mesmos campos.
   - **Precedência de pré-preenchimento (decisão §2): `?duplicar=` > "Repetir última compra" > memória `localStorage` da F9.** O `?duplicar` nunca é sobrescrito pela memória no mount.

### O que NÃO fazer

Não mexer em `registrarCompra`/schema Zod da compra (os campos são os mesmos), não preencher patrimônios/STs em duplicar/repetir, não tocar no fluxo de movimentação nem em `queries/ativos.ts`.

### Aceite W2

- [ ] Em DEV: faixa de 5 + 5 STs pareia no preview; 5×3 dá erro claro; faixa sem STs continua idêntica à F9
- [ ] Digitar "De" em marca sugere marcas fictícias do acervo; modelo filtra pela marca; valor novo digitado livre funciona
- [ ] "Comprar outro igual" na ficha pré-preenche tudo menos patrimônios; "Repetir última compra" idem; precedência §2 respeitada (testar com `localStorage` povoado)
- [ ] Testes novos + suite antiga verdes; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W3 — Subagente W3: itens — carrinho multi-item · criar item inline

Você é um subagente executando a frente **W3** da OS-F10. Modo autônomo. Seus arquivos: linha W3 do §1.3. Leia antes: `lancar-item-dialog.tsx` inteiro (a F9 adicionou o listener `wap:lancar-item` e o preset da linha do saldo — **preservar**; atalho `L`, `repetirUltimo` e o foco na quantidade idem), `actions/itens.ts` (`lancarItem` `:37-47`, `estornarLancamento`, e **`criarItem` `~:113-136`** — a action que o I2 reusa), `validators/item.ts` inteiro.

### Entregas

1. **I1 — carrinho multi-item.** O dialog passa a ter **linhas** `{ itemId, quantidade }` (adicionar/remover linha; máx. **10** linhas; item repetido no carrinho = erro de validação) sobre os campos **comuns** (filial, tipo, data, chamado, colaborador, observação). Regras por tipo (chamado obrigatório em reserva/liberação, qtd negativa só no ajuste, observação obrigatória no ajuste) valem para o lançamento inteiro como hoje.
   - `validators/item.ts`: `loteLancamentoItemSchema` (comum + linhas 1..10, mensagens pt-BR), reutilizando as regras existentes; funções puras com teste.
   - `actions/itens.ts`: `lancarItens(payload)` re-valida e insere **uma linha por vez, sequencial**, coletando resultado por linha (decisão §2 — sequencial + resultado por linha **como** o lote da F2, **mas SEM o `interromper` da F2**: lá a primeira falha derruba o resto; aqui cada linha é independente e falha não impede as seguintes — diferença **intencional** desta OS; o trigger de saldo é o juiz). Retorno `{ ok, resultados: { itemId, ok, erro? }[] }`.
   - UI: sucesso total → toast + fecha + `router.refresh()`; parcial → mantém no carrinho **só as linhas que falharam**, com o erro por linha (traduzido) e toast de aviso — espelho do comportamento do lote de ativos.
   - `repetirUltimo` preenche a **primeira linha** (e os comuns); o listener `wap:lancar-item` (F9) idem. `lancarItem` singular pode ser mantido ou virar caso N=1 de `lancarItens` — decida e registre.
2. **I2 — criar item inline.** No combobox de item (por linha do carrinho), `CommandEmpty` vira ação: `+ Criar item "<texto digitado>"` → mini-form no próprio popover ou dialog leve (nome pré-preenchido, grupo `acessorio|componente`; **a ordem é calculada no servidor** dentro de `actions/itens.ts` — max(`ordem`) do grupo + 10; o `ItemCatalogo` do client não carrega `ordem` e `queries/itens.ts` é do W4 — **não toque**) → **reusa `criarItem` de `actions/itens.ts`** (`~:113-136`; nome duplicado já devolve "Já existe um item com esse nome." `~:127-131`), estendendo o retorno para `{ ok: true, id }` (insert com `.select('id').single()` — o consumidor `admin/item-dialog.tsx:61` só lê `ok`, compatível) → o id retornado entra **selecionado** na linha ativa (nome exibido do estado local até o `router.refresh()` repassar a prop) . Todo operador é admin (nível único) — sem gate de permissão.

### O que NÃO fazer

Não mexer no estorno, no histórico, nas queries (`queries/itens.ts` é do W4 nesta OS), no catálogo `admin/itens` (a action de criar é reusada, não movida), nem quebrar `L`/repetir-último/listener da F9.

### Aceite W3

- [ ] Em DEV: NF fictícia com 3 itens → **um** lançamento com 3 linhas → 3 registros no histórico; linha com saldo insuficiente falha **só ela**, permanece no carrinho com erro claro, as outras entram
- [ ] Criar "Headset USB fictício" inline no meio do lançamento, sem sair do dialog; nome duplicado mostra erro traduzido
- [ ] `L`, repetir-último e o botão da linha do saldo (F9) funcionando como antes; carrinho com item repetido bloqueado pelo schema
- [ ] Testes novos + suite antiga verdes; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W4 — Subagente W4: export CSV — Ativos · Pendências · Itens

Você é um subagente executando a frente **W4** da OS-F10. Modo autônomo. Seus arquivos: linha W4 do §1.3. Leia antes: `ativos/page.tsx` (você adiciona **só o botão**; veja como os filtros da URL são parseados), `ativos-filtros.tsx` (**só leitura**), `pendencias/page.tsx`, `itens/page.tsx` (a F9 adicionou filtros do histórico na URL — o export respeita), `queries/pendencias-detalhe.ts`, `queries/itens.ts`, `lib/import/xlsx.ts`/`parse.ts` (**só leitura** — para ver como PapaParse é usado no projeto).

### Entregas

1. **`src/lib/csv.ts` (novo, puro, com teste).** `gerarCsv(colunas: { titulo, valor(l) }[], linhas): string` — separador **`;`**, quebras **CRLF**, **BOM UTF-8** no início (Excel pt-BR abre acentuação certa), escape de `"` e de células com `;`/quebra, datas já formatadas `dd/MM/yyyy`. Use PapaParse (`unparse`) se estiver no `package.json`; senão, serialize na mão (regra §1.2.3). Teste: escape, BOM, `;` dentro da célula, vazio.
2. **`src/lib/actions/exportar.ts` (novo).** Três Server Actions de leitura: `exportarAtivosCSV(filtros)`, `exportarPendenciasCSV(filtros)`, `exportarItensCSV(filtros)` (esta com `saldos` + `historico` no mesmo arquivo ou dois botões — decida pelo mais simples e registre). Cada uma: parseia/valida os filtros (mesma semântica da página) e busca **em blocos de `.range()` de até 1.000** — o **Max Rows do PostgREST** (default 1.000) corta em silêncio qualquer request maior, então acumule em código — até o **cap de 5.000**, com `count: 'exact'`. `truncado` é **sempre** derivado de `linhas.length < total`, **nunca** de `total > cap` (é isso que mantém o comportamento correto seja qual for o Max Rows do projeto; registre em `DECISOES.md` o valor verificado em DEV). Monta o CSV com `csv.ts` e retorna `{ nome, conteudo, total, truncado }`. Colunas: as da tela + o que identifica a linha (Ativos: patrimônio, service tag, hostname, categoria, marca, modelo, filial, status, colaborador, setor; Pendências: tipo, patrimônio/ativo, filial, desde; Itens-saldos: item, grupo, total, estoque, atrelados, falta; Itens-histórico: data, tipo, item, qtd, filial, chamado, obs, estorno). Nome do arquivo: `ativos-2026-07-22.csv` (data do dia).
3. **Queries de export.** Pendências: variante em blocos (como na entrega 2) em `queries/pendencias-detalhe.ts`, respeitando os filtros existentes. Itens: **saldos** reusam `getSaldosItens` (RPC, já sem paginação) com o filtro `grupo`/`q` replicado **em código** — é assim que a página faz; não procure esses filtros na query; **histórico** ganha variante própria em `queries/itens.ts` respeitando os filtros da F9 (item/tipo/de/ate), e a coluna "estorno" do CSV reporta só `ehEstorno` derivado de `estorna_id` (**sem** reusar o lookup de estornadas com milhares de ids — estoura o limite de URL). **Ativos: consome `listarAtivosParaExport` do contrato §1.5 (dona W1)** — codifique contra a assinatura; se o W1 ainda não aterrissou quando você fechar, deixe o `TODO(f10-integracao)` de 1 linha e avise o orquestrador.
4. **`src/components/layout/exportar-csv-button.tsx` (novo, client, genérico — mesma casa do `EstadoVazio` da F9).** Recebe a action + os filtros atuais (da URL); ao clicar: estado "Exportando…", chama a action, baixa via `Blob`/`URL.createObjectURL`, `toast.success('Exportadas N linhas.')` — e se `truncado`, `toast.warning('Exportadas 5.000 de N — refine os filtros.')` (**nunca truncar em silêncio**). Botão outline discreto no cabeçalho das três listas.

### O que NÃO fazer

Não adicionar export no relatório/snapshot (fora do escopo — Onda 3/decisão própria), não mexer em `queries/ativos.ts` (contrato), não usar rota de API (Server Action + Blob resolve), não paginar por baixo do cap sem avisar.

### Aceite W4

- [ ] `/ativos?status=em_uso&filial=…` → Exportar → CSV abre no Excel pt-BR com acentos certos e **só** as linhas do filtro; idem Pendências e Itens (saldos e histórico filtrado F9)
- [ ] `truncado` sai de `linhas.length < total` (smoke em DEV com cap artificialmente baixo); mais linhas que o cap → aviso "5.000 de N"; CSV com `;`, BOM, CRLF; `csv.test.ts` cobrindo escape
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (colunas escolhidas, um-arquivo-ou-dois em itens)

---

## §W5 — Subagente W5 (ONDA 2): UI do fluxo de movimentação — colar lote · recentes · sugestões · aviso §8.7 · rascunho · pós-registro · teto 30

Você é um subagente executando a frente **W5** da OS-F10, **sobre a base integrada com W1** (consome o contrato §1.5 inteiro; não edita arquivos do W1). Modo autônomo. Seus arquivos: `src/components/movimentacoes/**`. Leia antes: todos os arquivos da pasta (a F9 mexeu em combobox/passo-movimentacao/form — chips de data, toast do reset, placeholder novo), e o contrato §1.5.

### Entregas

1. **M1 — "Colar lista" no passo Ativos.** Botão ao lado do combobox → dialog com textarea monoespaçado (mesmo tom do da compra: "um patrimônio por linha; service tag opcional após vírgula/`;`/TAB — cole direto do Excel") → chama `resolverPatrimoniosParaLote` → resultado em 4 blocos: **encontrados** (entram no lote respeitando teto e dedup), **ambíguos** (cards com os candidatos — patrimônio duplicado exige escolher pelo ST/status; nada entra sem escolha), **não encontrados** e **inválidos** (listas copiáveis). Se o resolver devolver `erro` (ex.: acima do teto), o dialog o exibe — nada falha mudo. Bipagem por leitor USB funciona aqui também (Enter = nova linha) — mencione no hint.
2. **M3 — recentes no combobox.** Com <2 caracteres e lote com espaço, mostrar grupo "Movimentados recentemente" (contrato M3; exclui os já no lote). A mensagem "Digite ao menos 2 caracteres…" continua como rodapé.
3. **M4 — sugestões em colaborador/setor.** `datalist` nativo alimentado pelo proxy de sugestões (debounce 300ms, mín. 2 chars, limit 10 — decisão §2). Texto livre continua valendo; nenhuma validação nova.
4. **M5 — aviso de possível duplicata na Revisão.** Ao entrar no passo 3, chamar `possiveisDuplicatasDoDia` com os pares do lote; se houver, card **âmbar não-bloqueante** acima da tabela: `Possível duplicata: WAP0001234 já teve "Saída" hoje — confira antes de registrar.` (fallback `sem patrimônio`; a referência "spec §8 regra 7" fica em comentário/DECISOES, **não** na tela do operador). Registrar continua permitido; nenhum gate novo no servidor (decisão §2).
5. **M6 — rascunho persistente.** `sessionStorage` chave `wap:mov:rascunho`: salvar `{ ids do lote, config, passo }` com debounce a cada mudança; **ler só em `useEffect`** (hidratação). Ao montar com rascunho não-vazio e sem `?ativo`/`?duplicar`: banner "Você tem um lote não registrado — Restaurar / Descartar". Restaurar: `buscarAtivosResumoPorIds` (contrato), reaplicar config, re-rodar o ajuste de interseção (estados podem ter mudado; ids que sumiram → toast informando). Limpar no sucesso total e no Descartar. `?ativo=`/`?duplicar=` têm precedência sobre o rascunho.
6. **M9 — pós-registro decente.**
   - **Termos encadeados:** no painel de sucesso, os termos elegíveis viram **lista com estado** (pendente/gerado) e um fluxo "Gerar próximo termo" que abre os dialogs em sequência (ao concluir um, oferece o próximo; pular permitido). Rodapé: "dá para gerar depois pela ficha ou em Pendências → termo" (link).
   - **Sucesso parcial:** no retorno ao passo 2, acima do bloco de falhas, chips **"Já registrados:"** com link para cada ficha (a informação existe no resultado da action — hoje é jogada fora).
7. **M11 — textos do teto.** Tudo que citar o limite usa `MAX_LOTE_MOVIMENTACAO` (contador do passo 1, mensagens, hint do colar-lista). Nenhum "10" hard-coded sobrando (grep).

### O que NÃO fazer

Não editar arquivos do W1; não mexer no `atalho-global.tsx`, no schema, na action de escrita; não regredir nada da F9 (chips de data, toast do reset M7, placeholder, busca por colaborador).

### Aceite W5

- [ ] Colar 15 linhas fictícias (com 1 duplicado-sem-ST, 1 inexistente, 1 lixo) → 12 entram, ambíguo pede escolha, não-encontrado/ inválido listados; lote respeita 30
- [ ] Combobox vazio mostra recentes; colaborador sugere "Fulano da Silva" após 2 letras; datalist não bloqueia texto novo
- [ ] Registrar a mesma movimentação 2× no mesmo dia → aviso âmbar na Revisão da 2ª (e registro ainda permitido)
- [ ] F5 no meio do fluxo → banner Restaurar/Descartar; restaurar reconstrói lote+config; sucesso limpa o rascunho
- [ ] Sucesso parcial mostra "Já registrados" com links; termos encadeados geram 2 termos em sequência sem reabrir manualmente
- [ ] `grep` por "10" em `components/movimentacoes/**` sem sobra do teto antigo; hint do colar-lista menciona bipagem; `erro` do resolver aparece no dialog
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W6 — Subagente W6 (ONDA 3): revisão adversarial + E2E + emendas

Você é um subagente executando a frente **W6** da OS-F10, sobre a base com W1–W5 integrados. Seu papel é **quebrar** o que as frentes entregaram e emendar os documentos. Corrija o que achar; registre tudo (ok / corrigido / pendência justificada).

1. **Regressão dos fluxos centrais em DEV** (seed fictício — `npm run db:seed` **no Supabase DEV, jamais em produção**): movimentação ponta a ponta (colar lote → tipo → revisão com aviso → sucesso → termos encadeados), compra (faixa+ST, duplicar, repetir, memória F9), lançamento multi-item (parcial incluso), exports das 3 listas, estorno, **tudo da F9** (regra §1.2.7).
2. **Escopo e higiene:** `git diff main...f10 --stat` — só arquivos do mapa §1.3; `package.json` **byte a byte igual**; pasta de migrations termina em `0040`; nenhum item da Onda 3 de carona; nenhum dado real.
3. **Adversarial dirigido:** colar teto+1 linhas (31 no default da §2); colar o mesmo patrimônio 2× (dedup); duplicado legítimo com e sem ST; rascunho restaurado depois que outro operador moveu um dos ativos (interseção re-ajusta e avisa); duplicata §8.7 com movimentação estornada no meio (estornada **não** conta); carrinho com o mesmo item 2×; criar item inline com nome duplicado; export com 0 linhas (CSV só de cabeçalho, sem crash) e com célula contendo `;` e aspas; CSV aberto no Excel pt-BR (BOM).
4. **A11y e mobile dos elementos novos:** foco/`aria-label` nos dialogs novos (colar lote, criar item), datalist utilizável por teclado, aviso âmbar com contraste AA, alvos ≥40px.
5. **E2E documentado:** roteiro reproduzível (12–18 passos cobrindo os 13 itens).
6. **Emendas (parte da execução):** `README.md` (status F10), `CHANGELOG.md` (entrada F10 com os 13), `docs/prompts/README.md` (linha F10), `docs/DECISOES.md` (entrada consolidada `2026-07-22 · F10`: decisões da §2 + rascunhos das frentes), `docs/BACKLOG-UX.md` (Onda 2 concluída, com data), `docs/ESPECIFICACAO.md` (**se** o teto 10 do lote estiver escrito na spec, emendar para 30 citando a decisão; se não estiver, registrar que não estava), `src/lib/ajuda/conteudo.ts` (+ teste): blocos novos — colar lote na movimentação (com bipagem), sugestões/recentes, aviso de duplicata, rascunho, carrinho de itens, criar item inline, comprar outro igual, export CSV — e **grep por "10"** no arquivo para atualizar menções ao teto antigo do lote.

### Aceite W6

- [ ] Cada item acima com veredito; correções commitadas; E2E documentado
- [ ] Docs emendados; `lint`+`test`+`build` limpos na base final

---

## §2 — Escopo e decisões (Johnny, 22/07/2026) — autoridade

1. **Executar exatamente os 13 itens da Onda 2** do `docs/BACKLOG-UX.md` §5: **M1, M3, M4, M5, M6, M9, M11, A2, A4, A6, I1, I2, T5**. Nada da Onda 3 pega carona (nem busca global T1, nem ordenação T7, nem lista de movimentações M8, nem saldos multi-filial I4).
2. **Decisões pré-tomadas nesta ordem** (W6 consolida em `DECISOES.md`):
   - **M11**: teto do lote de movimentação = **30** (constante única `MAX_LOTE_MOVIMENTACAO`; compra continua 200). *Quer outro número? Edite este parágrafo antes de colar a ordem — e ajuste os literais em §1.5, §W1.1 e nos Aceites W1/W5/§W6.3 (usam o teto e teto+1).*
   - **M5**: aviso **âmbar não-bloqueante** no passo Revisão (a spec §8.7 pede alerta, não trava); sem re-checagem bloqueante no servidor.
   - **M6**: rascunho em `sessionStorage` (por aba; some ao fechar o navegador), chave `wap:mov:rascunho`; restauração re-busca os ativos por id e re-valida a interseção de tipos; `?ativo=`/`?duplicar=` têm precedência sobre o rascunho.
   - **M1**: linha aceita `PATRIMONIO` ou `PATRIMONIO<sep>ST` (vírgula/`;`/TAB, como a compra pós-F9); patrimônio duplicado sem ST vira **ambíguo com escolha manual** — nunca escolha silenciosa; o resolver não filtra por estado (a interseção de tipos continua sendo o guarda).
   - **M4/A4**: sugestões dinâmicas via Server Action (debounce 300ms, mín. 2 chars, limit 10); `datalist` nativo para colaborador/setor, `Command` para marca/modelo/fornecedor; texto livre sempre permitido; **nenhuma normalização retroativa** do acervo.
   - **I1**: carrinho com **inserts sequenciais e resultado por linha** como o lote da F2, **mas sem o `interromper` da F2** (diferença intencional: linha que falha não impede as seguintes) — sem RPC nova, sem transação; o trigger de saldo é o juiz.
   - **A6**: precedência de pré-preenchimento na compra: `?duplicar=` > "Repetir última compra" > memória `localStorage` (F9).
   - **T5**: CSV com separador `;`, BOM UTF-8, CRLF, datas `dd/MM/yyyy`, cap **5.000** linhas com aviso explícito ao truncar; PapaParse só se já estiver no `package.json` — senão serializador próprio; **proibido instalar**.
3. **M9 não muda a regra dos termos** (quais categorias têm termo, templates, pendência de termo) — só a ergonomia de gerar em sequência e enxergar o que já foi registrado.

## §3 — Aceite geral (orquestrador)

- [ ] Gate §1.0 passou (F9 concluída; baseline verde); contrato §1.5 conferido na integração; ondas na ordem; propriedade §1.3 respeitada (diff confere)
- [ ] Aceites W1–W6 completos e autoverificados; os **13 itens** da §2 entregues; revisão adversarial sem pendência crítica
- [ ] **Zero migration** (pasta termina em `0040`), **zero dependência nova** (`package.json` intacto), **zero dado real**, custo R$ 0
- [ ] Invariantes §1.2.7 intactas (máquina de estados no banco, acesso, import, F9 sem regressão)
- [ ] `npm run lint` + `npm run test` + `npm run build` verdes na base final; deploy Vercel READY; smoke de leitura em produção ok
- [ ] `DECISOES.md` consolidado; README/CHANGELOG/prompts/BACKLOG-UX/spec/ajuda emendados; resumo final com checklist, decisões, pendências e o que ficou para a Onda 3

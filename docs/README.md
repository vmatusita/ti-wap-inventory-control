# Índice da documentação

Este diretório tem 60+ arquivos, e a maior parte é **histórico**. Esta página existe para você não abrir o arquivo errado.

## Comece pelo que você precisa fazer

| Se você quer… | Leia |
|---|---|
| Entender o problema e o modelo de dados | [`ESPECIFICACAO.md`](ESPECIFICACAO.md) — §4 máquina de estados, §5 vocabulários De→Para, §6 telas, §7 relatórios, §8 regras |
| Entender o código que já existe | [`ARQUITETURA.md`](ARQUITETURA.md) — sobretudo §10, *"quero mudar X → mexo em Y"* |
| Trabalhar aqui pela primeira vez | [`ONBOARDING.md`](ONBOARDING.md) |
| Aplicar uma migration ou mexer no banco | [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md) |
| **Escrever ou mudar uma policy de RLS** | a **emenda F59** de [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md) (R-ACC-63 em diante) — a doutrina do predicado: `col = any (array (select public.<fn>()))` sobre função `setof`, nunca `fn(col)`, e a forma-alvo das funções de conjunto. Travada na mesa por `src/lib/validators/policies-initplan.test.ts` e no catálogo do CI pelo bloco 4 de `supabase/tests/catalogo_policies.sql`, onde mora a lista única de exceções (`k_excecoes_predicado`). Para medir o custo de uma forma: `scripts/perf/medir-rls.mjs` |
| **Escrever ou mudar uma RPC de relatório (`rel_*`), ou o as-of** | a **emenda F60** de [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md) (R-ACC-73 em diante) — o recorte como LISTA obrigatória: `p_filiais smallint[]` ligado por `= any`, NULL e `'{}'` → vazio, o consolidado como lista explícita com as filiais desativadas. Travada na mesa por `src/lib/validators/rpcs-recorte-sql.test.ts` e no catálogo do CI pelo bloco 7 de `supabase/tests/catalogo_secdef.sql`, onde mora a lista única de exceções (`k_excecoes_recorte`). O corpo do as-of está preso ao orçamento `docs/perf/asof-orcamento.json` (`asof-orcamento.test.ts`); para medir: `scripts/perf/medir-rel.mjs`. Para tirar uma assinatura velha do banco depois do deploy: a receita "A janela do `drop`" do [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md) |
| **Chegou uma issue de alarme** — a sonda ficou vermelha | [`RUNBOOK-ALARME.md`](RUNBOOK-ALARME.md) — o que cada checagem quer dizer, onde olhar e o que **não** fazer |
| Saber onde vive uma credencial (por NOME, nunca o valor) | [`INVENTARIO-CREDENCIAIS.md`](INVENTARIO-CREDENCIAIS.md) |
| Saber por que algo foi decidido assim | [`DECISOES.md`](DECISOES.md) — atas em ordem cronológica, append-only |
| Achar onde mora uma regra de negócio | [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md) — cada regra com localização e prova |
| Saber quem pode fazer o quê | [`ADR-002-papeis-e-permissoes.md`](ADR-002-papeis-e-permissoes.md) e [`ADR-001-rls-por-filial.md`](ADR-001-rls-por-filial.md) |
| Executar a próxima fase | [`prompts/README.md`](prompts/README.md), depois a ordem `F*` correspondente |
| Entender para onde o sistema vai (F45 → F73) | [`PLANO-MULTIEMPRESA.md`](PLANO-MULTIEMPRESA.md) — o plano de preparação e virada multiempresa: §1 as 8 decisões travadas, §4 as 10 regras comuns a todas as fases, §5 a ficha de cada uma |
| Saber o que está torto e ainda não foi consertado | [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md) e [`BACKLOG-UX.md`](BACKLOG-UX.md) |

Fora deste diretório: [`../CLAUDE.md`](../CLAUDE.md) (regras permanentes do agente), [`../CHANGELOG.md`](../CHANGELOG.md) (o que mudou, fase a fase) e `src/lib/ajuda/` (a documentação do **operador**, publicada em `/ajuda`).

## Hierarquia de autoridade

Quando código, ordem de serviço e documento se contradisserem, resolva **nesta ordem** — e registre a decisão em [`DECISOES.md`](DECISOES.md):

1. [`ESPECIFICACAO.md`](ESPECIFICACAO.md) — **o quê** construir
2. [`PLANEJAMENTO.md`](PLANEJAMENTO.md) — **como e quando**: stack fechada (§2), estratégia de dados (§3), fases (§4), definição de pronto (§6)
3. `../supabase/migrations/` — **fonte da verdade do banco** desde a F1

## Documentos vivos

Mantidos atualizados; espera-se que digam a verdade sobre o sistema de hoje.

| Documento | O que é |
|---|---|
| [`ESPECIFICACAO.md`](ESPECIFICACAO.md) | A especificação completa do produto |
| [`PLANEJAMENTO.md`](PLANEJAMENTO.md) | Stack, estratégia de dados, fases, definição de pronto |
| [`ARQUITETURA.md`](ARQUITETURA.md) | Modelo mental, camadas do código, onde mora cada regra |
| [`ONBOARDING.md`](ONBOARDING.md) | Do clone à primeira mudança em produção |
| [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md) | Procedimento de migrations, o "gate", rollback, a janela do `drop` de assinatura velha, armadilhas — o anexo A é histórico |
| [`RUNBOOK-ALARME.md`](RUNBOOK-ALARME.md) | O alarme de saúde e de integridade (F55): o que cada uma das doze checagens quer dizer, o que fazer quando a issue chega, e o que NUNCA fazer (subir a linha de base, plantar estado em produção, apagar achado) |
| [`INVENTARIO-CREDENCIAIS.md`](INVENTARIO-CREDENCIAIS.md) | Onde cada credencial vive, quem a lê, quem é dona e quando gira — **por NOME, nunca o valor** (F55) |
| [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md) | Matriz viva: cada regra de negócio, onde ela mora e o que a prova. A **emenda F59** é a doutrina do predicado de RLS; a **emenda F60**, o recorte obrigatório das RPCs de relatório |
| [`PLANO-MULTIEMPRESA.md`](PLANO-MULTIEMPRESA.md) | O plano das 28 fases F45→F73 (preparação e virada multiempresa), de 04/09/2026. **A ficha de cada fase no §5 é a fonte da verdade do escopo dela** — onde a ordem de serviço e ela divergirem, vale a ficha |
| [`DECISOES.md`](DECISOES.md) | Rastro de auditoria das decisões autônomas (append-only, nunca reescrito) |
| [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md) | Diagnóstico priorizado do que está torto |
| [`BACKLOG-UX.md`](BACKLOG-UX.md) | Backlog de UX — fechado, exceto o que depende de decisão do Johnny |
| [`ADR-001-rls-por-filial.md`](ADR-001-rls-por-filial.md) · [`ADR-002-papeis-e-permissoes.md`](ADR-002-papeis-e-permissoes.md) | Decisões de arquitetura do modelo de acesso |
| [`prompts/`](prompts/) | As ordens de serviço, uma por fase (índice em [`prompts/README.md`](prompts/README.md)) |

## Planos de área

Escritos antes de construir um subsistema. Continuam úteis como **razão de desenho** — mas quem manda sobre o comportamento de hoje é a spec e o código.

| Documento | Subsistema |
|---|---|
| [`PLANO-TERMOS.md`](PLANO-TERMOS.md) | Termos de responsabilidade em `.docx` (F5A) |
| [`PLANO-RELATORIOS-V2.md`](PLANO-RELATORIOS-V2.md) | Relatórios ao vivo e snapshots |
| [`PLANO-AJUDA.md`](PLANO-AJUDA.md) | A documentação do operador em `/ajuda` (F20) |
| [`PLANO-DESIGN-SYSTEM.md`](PLANO-DESIGN-SYSTEM.md) | O sistema de design e o piloto em `/ativos` (F40) |
| [`PLANO-CORRECAO-TRUNCAMENTO-1000.md`](PLANO-CORRECAO-TRUNCAMENTO-1000.md) | O corte de 1.000 linhas nas leituras de estoque |
| [`PLANO-ITENS.md`](PLANO-ITENS.md) | O item passa a falar a língua do ativo — vocabulário único, cadastro passivo e o fim do bloqueio (F41/F42) |
| [`INVENTARIO-LEITURAS.md`](INVENTARIO-LEITURAS.md) | O orçamento das F63–F68 (F57): cada call-site das cinco tabelas do acervo em `src/**`, com a classificação "precisa de `empresa_id` explícito" × "confia na RLS", o porquê e a fase de destino. É uma fotografia de 14/09/2026 por LEITURA do código — a F63 revalida antes de usar. Os módulos que a F57 criou para separar os quatro significados de filial (`auth/recorte-leitura.ts`, `filtros/filial.ts`, `queries/recorte-consulta.ts`, `unidades/slugs.ts`, `unidades/pertinencia.ts`, `ativos/identidade.ts`) estão em [`ARQUITETURA.md`](ARQUITETURA.md) §10 |

## Catálogo de requisitos do multiempresa — a direção está decidida

A direção multiempresa **foi decidida** em 09/2026 ([`PLANO-MULTIEMPRESA.md`](PLANO-MULTIEMPRESA.md) §1, decisão 1): evoluir **este** repositório por migração in-place e aditiva, nas fases F45→F73. Os dois documentos abaixo, escritos antes da decisão para um repositório novo, valem como **catálogo de requisitos, não como plano de execução** — cada um traz o cabeçalho de status dizendo isso. A doutrina do predicado de RLS que eles discutem está na emenda F59 da [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md).

[`SYSTEM-DESIGN-ACERVO-2026-08-31.md`](SYSTEM-DESIGN-ACERVO-2026-08-31.md) · [`PLANO-PRODUTO-MULTIEMPRESA.md`](PLANO-PRODUTO-MULTIEMPRESA.md) · `prompt-produto-f0-fundacao.md` (a ordem do repositório novo — **aposentada** pela decisão 1; não se executa)

## Exploração — ainda não é compromisso

Trabalho de projeto de sistema para uma direção que **ainda não foi decidida**: espelhar a planilha do SharePoint. Nada disso está construído.

`PLANO-ESPELHO-SHAREPOINT.md` · `ROTEIRO-ESPELHO-ENTRA.md`

## Histórico — leia para arqueologia, não para trabalhar

Estes arquivos descrevem o sistema **na data em que foram escritos**. Não os atualize: se o comportamento mudou, o lugar da verdade é a spec, a matriz de regras ou o CHANGELOG.

- **Relatórios de fase** — `RELATORIO-F11.md` → `RELATORIO-F61.md` (mais `F19-RELATORIO.md` e `RELATORIO-CORRECAO-TRUNCAMENTO-1000.md`): o que cada ordem entregou, com as evidências. As pastas `f45-evidencias/` a `f61-evidencias/` guardam as saídas reais das sabotagens que provam que cada trava sabe ficar vermelha — leia-as junto com o relatório da fase, nunca no lugar dele. A de F57 guarda também a matriz de casos-limite do filtro de filial rodada ANTES e DEPOIS do refactor (`casos-limite-antes.md`/`casos-limite-depois.md`). A de F58 guarda também os censos só-contagem de ensaio e produção, a equivalência da tradução de erros e as rodadas do conferidor de formas, só com contagens e caminhos normalizados. A porta de RPC, `linhas.ts`, as listas de erro do banco e o conferidor que a F58 criou estão em [`ARQUITETURA.md`](ARQUITETURA.md) §10. A de F59 guarda também o censo das policies nas quatro fontes, a pergunta de planejador e a prova da forma-alvo no ensaio, e os nós do plano das formas do predicado no ensaio e em produção — só números, nomes de nó e de tabela. A de F60 guarda a trava de recorte vermelha contra a cadeia de antes do lote 2 (mesa e catálogo, nos dois bancos), as sabotagens do teto obrigatório, do orçamento do as-of, dos dois níveis de `/itens`, da memória por request e das revisões adversariais, a grade de rótulos dos roteiros antes × depois da migração das 59 chamadas e o censo do `maxDuration`; as medições da F60 (as linhas de base, a equivalência EMULADA e o custo dos corpos novos) estão em `perf/`. Como a F60 ficou com as migrations sem apply em banco real (ata (j) de 17/09/2026 em [`DECISOES.md`](DECISOES.md)), as evidências pós-apply e da janela do `drop` ainda não existem. A de **F61** é de outra natureza: além das onze sabotagens, ela guarda a **prova visual** — as fotos e o HTML normalizado das 8 vitrines da prévia estática ANTES e DEPOIS da fase (`antes/`, `depois/`), o gabarito e o relatório da comparação de PIXEL por quadro, e o portão que confere o diff de classes por arquivo contra a tabela de mudanças de propósito (`mudancas-de-proposito.json`/`.md`). Tudo com dados 100% fictícios: nenhuma captura é da tela de produção. Guarda também a medição do **relógio do runner** (`L-`) e o que a **revisão adversarial** virou conserto (`M-`) — cinco furos fechados com sabotagem própria, e cinco declarados no §12 do relatório.
- **Planos de fase** — `PLAN-F30.md`, `PLAN-F31.md`, `PLAN-F32.md`, `PLAN-F33.md`, `PLAN-F35.md`, `PLAN-F36-F39.md`, `PLAN-F39.md`, `PLAN-F40.md`, `PLAN-F41.md`, `PLAN-F42.md`, `PLAN-F43.md`, `PLAN-F44.md`, `PLAN-F45.md`, `PLAN-F46.md`, `PLAN-F47.md`, `PLAN-F48.md`, `PLAN-F50.md`, `PLAN-F51.md`, `PLAN-F52.md`, `PLAN-F53.md`, `PLAN-F54.md`, `PLAN-F55.md`, `PLAN-F56.md`, `PLAN-F57.md`, `PLAN-F58.md`, `PLAN-F59.md`, `PLAN-F60.md`, `PLAN-F61.md`: o plano medido antes de executar a fase. *(A lista pulava de `PLAN-F45.md` para `PLAN-F55.md` e não tinha `PLAN-F59.md`, que existem; não há `PLAN-F49.md`. Corrigido na F60, 17/09/2026.)*
- **`F56-HANDOFF.md`** — não é plano nem relatório: é o ponto de retomada escrito no meio da F56, quando a máquina trocou antes de a fase terminar. Descreve o que já tinha ido para a `main`, o que ficou em WIP na branch e o roteiro exato para continuar. A pasta `f56-handoff/` guarda o que essa retomada precisou (medições da sessão original, scripts dos workflows, os relatórios que orientaram as decisões do plano) — histórico da troca de máquina, não documentação viva.
- **Análises datadas** — `ANALISE-PLANILHA-F4.md`, `ANALISE-UX-2026-08-07.md`, `ANALISE-RELATORIOS-2026-08-10.md`, `SYSTEM-DESIGN-2026-08-30.md`, `E2E-F10.md`.
- **Evidências** — `f19-evidencias/` (capturas de tela do modo escuro), `f39-evidencias/` (os 5 modelos `.docx` renderizados para conferência visual), `f43-evidencias/` (a tela `/itens` antes e depois, mais as três candidatas de desenho, com as respostas literais do teste dos 5 segundos em `teste-5-segundos.json`), `f44-evidencias/` (a mesma tela nos TRÊS recortes de filial — sem filtro, uma filial, três filiais — e a ficha do ativo, mais a prova de que o número já seguia o filtro em `prova-recorte.txt` e a medição do estado expandido em `acessibilidade-ficha.txt`), `f45-evidencias/` (as quatro provas da F45: o transform de JSX sem dependência, a lógica de reprovação do runner de roteiros contra um `psql` dublê, as quatro sabotagens que fazem a trava do CI ficar vermelha, e o diff da instrumentação dos roteiros que reverte exato — mais a saída dos cinco comandos e a lista de arquivos do Vitest antes/depois), `perf/` (as medições em JSON, fase a fase — TTFB, planos, `pg_stat_statements`, equivalências; o nome do arquivo diz a fase). ⚠ **Um arquivo dali NÃO é histórico:** `perf/asof-orcamento.json` é o orçamento VIVO do as-of, preso ao corpo da função por `src/lib/validators/asof-orcamento.test.ts` (F60) — mudou o corpo, mede de novo.

## Antes de escrever componente, filtro, diálogo ou chave (F61)

Cinco regras que valem para código novo de tela, cada uma com a trava que a recusa. A régua inteira, com o veredito e o
comando, está na **emenda F61** de [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md); o censo e as doze decisões, em
[`PLAN-F61.md`](PLAN-F61.md).

| se você vai… | leia | a trava |
|---|---|---|
| criar ou mexer em componente de `src/components/admin/` ou `src/components/relatorios/` | [`PLANO-DESIGN-SYSTEM.md`](PLANO-DESIGN-SYSTEM.md) §3.1/§3.4/§3.8 e `src/lib/layout/pendentes-da-regua.ts` | `src/lib/layout/consistencia.test.ts` — **nenhum arquivo desses dois diretórios é isento** |
| escrever "digite X para confirmar" | `src/components/layout/confirmacao-digitada.tsx` | `confirmacao-digitada-fronteira.test.ts` — a dica só é importável de `components/layout/` |
| criar um diálogo de cadastro | `src/components/dialogos/use-dialogo-semeado.ts` | `dialogo-semeado.test.ts` — semear na ABERTURA, não no fechamento |
| guardar algo no navegador | `src/lib/escopo/chave.ts` | `src/lib/escopo/chaves-de-storage.test.ts` — a chave sai de `chaveDeStorage`, calculada no uso |
| escrever o nome do sistema, a sigla ou o crédito numa tela | `src/lib/identidade/sistema.ts` | `src/lib/identidade/sem-literais.test.ts` — quem lê a fonte não escreve o literal |
| montar a próxima URL de um filtro de lista | `src/components/filtros/url.ts` | `url.test.ts` — o pendente é POR CAMINHO |
| pintar de verde, de branco sobre o cromo ou de preto sobre o amarelo | `src/app/globals.css` (os tokens) e `src/lib/layout/regra-de-tinta.ts` | `src/lib/dominio/cores.test.ts` — o par cru que virou token não volta |

## Regras para quem escreve documentação aqui

1. **Cada fato mora em um lugar só.** Se já está na spec, no CHANGELOG ou na matriz de regras, **link** — não copie. Cópia envelhece sem avisar.
2. **Documento datado não se atualiza.** Relatórios, análises e atas registram um momento. Corrigir o passado apaga a evidência; escreva a correção no documento vivo.
3. **Documento vivo não vira diário.** Se um procedimento acumulou histórico até enterrar o passo 1, o histórico vai para um anexo no fim — foi o que se fez com o `RUNBOOK-BANCO.md`.
4. **Toda entrada nova no CHANGELOG exige uma versão** (regra permanente, item 7 do `CLAUDE.md`): bump no `package.json`, entrada no `src/lib/versoes/registry.ts` em linguagem de operador, e tag anotada. Documentação interna de desenvolvedor — esta pasta, o README, o runbook — **não** entra no CHANGELOG: ela não muda nada para quem opera o sistema. O registro dela é a ata em [`DECISOES.md`](DECISOES.md).

ultracode

# Ordem de serviço F25 — Celular com campos próprios, cidade da filial no termo e filtro de filial com padrão por cargo + multi-seleção

> Ordem de 04/08/2026, emitida pelo Johnny. Sucede a F24 (`docs/prompts/F24-import-conflito-filiais-ultracode.md` · `docs/RELATORIO-F24.md`). Em conflito entre esta ordem e a spec/ADRs, **esta ordem manda** — emende os documentos e registre em `docs/DECISOES.md`. Numeração: na escrita desta ordem, a última fase era a F24 e a última migration a `0100`. **Confira os números livres reais antes de começar**; colisão → renumere (precedente F19/F20B) e registre. Se `git status` mostrar trabalho não commitado de outra sessão, PARE e reporte (regra da casa: uma ordem por vez) — **exceto o próprio arquivo desta ordem** (`docs/prompts/F25-celular-cidade-filtros-ultracode.md`), que é insumo da fase: commite-o no primeiro commit.

## Missão

Três melhorias de uso pedidas pelo Johnny (04/08/2026), independentes entre si mas entregues juntas nesta ordem:

**(A) Celular ganha campos próprios.** Nº do telefone, IMEI e Pulsus hoje vivem soltos em `ativos.observacao` e são digitados à mão a cada termo. Viram colunas do ativo, aparecem no cadastro/edição/ficha **só quando a categoria é celular**, e o termo de responsabilidade de celular passa a **pré-preencher** esses campos do cadastro (seguem editáveis no dialog, como todo campo de termo). Isso **entrega dois itens do backlog declarado** em `docs/PLANO-TERMOS.md` §9 ("colunas novas no ativo (IMEI, telefone, Pulsus)") — emende o plano.

**(B) A cidade do termo sai da filial.** Os 7 templates cravam "São José dos Pinhais" na linha da assinatura — errado para Linhares, Serra e Eusébio (era a pergunta aberta nº 4 do PLANO-TERMOS §10; o Johnny respondeu em 04/08/2026: varia por filial). `filiais` ganha `cidade`; a linha da assinatura vira `{cidade}, {data_extenso}`, pré-preenchida pela filial do(s) ativo(s) e editável no dialog. Decisão do Johnny: **só a linha da assinatura** — a cláusula de foro ("Comarca de São José dos Pinhais/PR") é texto jurídico e **fica intocada** em todos os modelos.

**(C) Filtro de filial: padrão por cargo + multi-seleção.** Em toda lista que filtra por filial, o filtro vira **multi-seleção** (marcar 2+ filiais) e o **padrão deixa de ser "Todas"** para o operador: ele entra com **todas as filiais vinculadas dele já marcadas** (decisão do Johnny — o operador de Serra+Linhares entra vendo as duas juntas); nível administrador, dev e consulta continuam entrando com todas. Em `/relatorios`, o operador cai direto na **aba da filial dele** em vez do Consolidado (aba é uma só: com 2+ vínculos, a 1ª em ordem alfabética — dá Linhares no exemplo do Johnny); admin/dev/consulta continuam no Consolidado. Em `/itens`, a visão padrão dos saldos vira **"Por filial"** (as filiais lado a lado) **para todos os cargos** — o Consolidado continua a um clique. Relatório somando 2+ filiais escolhidas **não entra** (backlog, decisão do Johnny).

## Contexto (leia a origem, não descrições dela)

- Doutrina: `@CLAUDE.md` (modo autônomo; regra 2 — import; §Modelo de acesso) · `@docs/RUNBOOK-BANCO.md` (caminho A — esta ordem só tem migrations **aditivas**, nada que bata no gate).
- **Termos (A e B)**: `@src/lib/actions/termos.ts` (`prepararTermo` — os extras do celular hoje saem `''` fixos, comentário "manuais, §4.1"; `gerarTermo`/`renderizarDocx` com `nullGetter: () => ''`) · `@src/lib/validators/termo.ts` (`camposTermoSchema` já tem `telefone`/`imei`/`pulsus` max 60) · `@src/components/movimentacoes/gerar-termo-dialog.tsx` (`CAMPOS_CELULAR`; repare que ao reabrir um termo já salvo o dialog usa `existente.dados` — um termo antigo sem `cidade` precisa completar com a da filial, não ficar vazio) · `@src/lib/termos/tipos.ts` e `datas.ts` · os 7 modelos em `@src/templates/termos/*.docx` — a linha `São José dos Pinhais, {data_extenso}` (com variação de caixa "Dos" nos de devolução) existe em TODOS; o processo de retag seguro (mesclar runs, sanitizar, conferir fidelidade página a página) está em `@docs/PLANO-TERMOS.md` §6 item 1 — siga-o.
- **Cadastro/ficha (A)**: `@src/components/ativos/nova-compra-form.tsx` (single/lote — veja o que a UI de lote comporta por unidade, no precedente das service tags da faixa/F10) · `@src/components/ativos/editar-ativo-dialog.tsx` · `@src/app/(app)/ativos/[id]/page.tsx` (ficha) · validators `@src/lib/validators/compra.ts` e `ativo.ts` · actions `@src/lib/actions/ativos.ts` · export CSV `@src/lib/actions/exportar.ts`.
- **Filiais (B)**: tabela `filiais` (id, slug, nome, ativo — SEM cidade; slugs em produção: `matriz`, `cd-afonso-pena`, `linhares`, `eusebio`, `serra` — confira por select antes de escrever o seed) · `@src/lib/queries/filiais.ts` (`Filial`) · tela `admin/filiais` (`@src/components/admin/filial-dialog.tsx`, `@src/lib/queries/admin.ts`, validator `admin.ts`).
- **Filtros (C)** — o inventário mínimo (o que achar a mais, inclua e registre): `@src/components/ativos/ativos-filtros.tsx` (o Popover+Checkbox de **Status** é o precedente de UI multi da casa) · `@src/components/movimentacoes/lista-filtros.tsx` · `@src/components/itens/itens-filtros.tsx` (+ `url-filtros.ts` e a neutralização do `filial` na visão por filial — leia o comentário) · `@src/components/pendencias/pendencias-filtros.tsx` (**usa SLUG**, `v_pendencias.filial`) · `@src/components/relatorios/gerados-filtro.tsx` · exports em `@src/lib/actions/exportar.ts` (leem os MESMOS params — regra F12/W6A) · parsers em `@src/lib/url-params.ts` (`idNumerico`) · queries `listarAtivos` (`.eq('filial_id', …)` em `@src/lib/queries/ativos.ts`), `@src/lib/queries/movimentacoes.ts`, `itens.ts`, `pendencias-detalhe.ts`, `gerados.ts`.
- **Cargo e vínculos (C)**: `getOperador()` → `{papel, filiaisEscrita}` (`@src/lib/auth/acesso.ts`, memoizada por request) · `filiaisDeEscrita` (`@src/lib/auth/papeis.ts`) · `@src/components/layout/permissoes.ts` — **filtro de LEITURA ≠ select de ESCRITA**: os selects que gravam (lançamento, movimentação, compra) continuam recortados por `filiaisParaEscrita` e NÃO mudam nesta ordem.
- **Relatórios (C)**: `@src/components/layout/sidebar-nav.tsx` (href fixo `/relatorios/geral`) · `@src/components/layout/paleta-comandos.tsx` (confira se aponta para `geral` também) · `@src/app/(app)/relatorios/[filial]/page.tsx` + `filial-tabs.tsx` · `@src/app/(app)/itens/page.tsx` (parse de `visao`).
- Documentação viva que esta ordem emenda: spec `@docs/ESPECIFICACAO.md` §5/§6 (e §7 na aba padrão) · `@docs/PLANO-TERMOS.md` §9/§10 · `@docs/MATRIZ-REGRAS.md` · ajuda F20 (`@src/lib/ajuda/conteudo/` — no mínimo `termos-de-responsabilidade.ts`, `lista-de-ativos.ts`, `itens-por-quantidade.ts`, `relatorio-ao-vivo.ts`, `lista-de-movimentacoes.ts`, `resolver-pendencias.ts`; os guardas de cobertura/vocabulário derivado QUEBRAM o build se esquecer).
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run db:types` · smoke `scripts/smoke/smoke-prod.mjs` · roteiros `supabase/tests/`. **Meça a baseline ANTES de mudar qualquer coisa** e cole no relatório.
- APIs externas (regra 6 do CLAUDE.md): confira na documentação oficial vigente (MCP Context7) o que usar de Supabase SSR e docxtemplater. Não escreva de memória.

## Escopo

**Dentro:** migrations novas **aditivas** a partir do próximo número livre (colunas do celular em `ativos`; `cidade` em `filiais` + seed das 5); cadastro/edição/ficha do celular; `prepararTermo` + dialog + retag dos 7 templates (cidade); filtros de filial (multi + padrão por cargo) nas superfícies inventariadas, com exports acompanhando; aba padrão de `/relatorios` e visão padrão de `/itens`; `admin/filiais` com cidade; Vitest; smoke; ajuda F20; documentação e encerramento padrão.

**Fora (não toque):** o **import de startup** — layout do CSV, motor, RPCs e telas ficam byte a byte como estão (os campos novos do celular NÃO entram pela planilha; se um dia entrarem, é ordem futura); a **cláusula de foro** dos templates; **snapshots congelados** (`relatorios/gerados/[id]` — formato e conteúdo dos jsonb antigos intocados); **relatório multi-filial somado** (backlog registrado); o **visualizador por senha** (sem cargo → sem padrão personalizado; as tabs e o Consolidado dele ficam como estão); RLS, policies, cargos e vínculos (filtro é leitura — **nenhuma permissão muda**); selects de ESCRITA (recorte `filiaisParaEscrita` intocado); a Zona destrutiva e a mesa de conflitos (F23/F24); dependência nova; `src/components/ui/**`; migration aplicada não se edita; seed em produção JAMAIS; **migração automática das observações existentes para os campos novos** — NÃO faça (dado real de produção em texto livre; mover é decisão humana, na ficha, quando o operador tocar no ativo — registre).

## O modelo a implementar

### 1. Banco (migrations aditivas — caminho A do runbook)

1.1. **`ativos` ganha `telefone`, `imei` e `pulsus`** (`text null`, com `comment` dizendo que são campos de celular). Sem CHECK por categoria — a exibição condicional é da UI e a categoria do ativo não muda depois de criada; registre a leitura. Nomes em pt sem acento, como o resto do domínio.

1.2. **`filiais` ganha `cidade`** (`text not null default ''`) + UPDATE de seed **por slug**: `matriz` e `cd-afonso-pena` → "São José dos Pinhais"; `linhares` → "Linhares"; `serra` → "Serra"; `eusebio` → "Eusébio". Confira os slugs reais por select ANTES (ensaio e produção) e a verificação pós-apply confere as 5 preenchidas. Sem UF — o foro não muda, e a linha da assinatura só usa a cidade.

1.3. `npm run db:types` regenerado; advisors sem WARN novo. Nenhuma RPC, policy ou trigger muda nesta ordem — se o desenho te levar a mexer numa, pare e repense (provavelmente é sinal de caminho errado); se for inevitável, vale a regra do runbook (rode TODOS os roteiros).

### 2. Celular no app

2.1. **Cadastro e edição**: os 3 campos aparecem SÓ quando a categoria selecionada é `celular` (aparecer/sumir reativo no form). Validação: opcionais, `max` espelhando o `camposTermoSchema` (60), `trim`; sem máscara de IMEI (o legado vem sujo — texto livre, como o resto da casa). Na compra em **lote**, decida pelo que a UI por-unidade já comporta (precedente: service tags da faixa — F10); se ficar caro, lote sai sem os campos (preenche-se na ficha depois) — registre.

2.2. **Ficha** (`ativos/[id]`): exibe os 3 quando a categoria é celular (vazio → "—"), com edição pelo dialog de editar.

2.3. **Termo pré-preenchido**: em `prepararTermo`, `telefone`/`imei`/`pulsus` saem do ativo em vez de `''` (o `obs` do aparelho continua manual, só do documento). O aviso de campos faltantes ("o ativo não tem X cadastrado") passa a cobrir os 3 quando a categoria é celular. Continuam editáveis no dialog e gravados no snapshot `dados` — edição no termo NÃO grava de volta no ativo (regra vigente do §3.9, fica).

2.4. **Export CSV de ativos**: acrescente as colunas se sair barato no padrão de `exportar.ts`; senão registre como backlog.

### 3. Cidade no termo

3.1. **Retag dos 7 templates**: a linha da assinatura vira `{cidade}, {data_extenso}` (atenção à variação "São José Dos Pinhais" dos modelos de devolução; a caixa final sai do dado, não do template). Siga o processo da F5A (PLANO-TERMOS §6 item 1): mesclar runs fragmentados antes de taguear, nenhum dado real, e **fidelidade conferida** — render antes × depois lado a lado, mudando SÓ a linha da cidade. **A cláusula de foro fica intocada.**

3.2. **`CamposTermo.cidade`** (max 120) entra no validator, no dialog (campo editável nas DUAS famílias — responsabilidade e devolução) e no payload. `prepararTermo` a preenche pela filial do(s) ativo(s): lote com filiais divergentes → usa a do primeiro e **avisa** (mesmo padrão do aviso de múltiplos donos na devolução); filial com `cidade` vazia → avisa ("cadastre em Administração → Filiais ou preencha aqui"). Ao reabrir termo já salvo cujo `dados` não tem `cidade` (todos os anteriores a esta fase), completa com a da filial — nunca deixa vazio silencioso.

3.3. **Nada retroativo no Storage**: `.docx` já gerados não mudam; regerar um termo antigo passa a sair com a cidade certa. `termo_assinado`/`termo_data`/flags: intocados.

### 4. Filtro de filial — multi-seleção + padrão por cargo

4.1. **A regra do padrão mora num lugar só**: função pura testada (sugestão: `filtroFilialPadrao(papel, filiaisEscrita, filiaisAtivas)` ao lado de `filiaisDeEscrita` em `papeis.ts`, ou em `permissoes.ts`): operador → **todas as vinculadas**; dev/admin/consulta → todas (sem recorte). Derivada dela, a regra da ABA de relatório: operador → slug da **1ª vinculada em ordem alfabética de nome**; demais → `geral`. Nenhuma tela reimplementa a regra.

4.2. **Semântica do param** (o ponto sutil da ordem — desenhe antes de codar): `filial` na URL vira **lista** (CSV). AUSÊNCIA de param = padrão do cargo; a opção "Todas as filiais" do operador grava **sentinela explícita** (sugestão: `filial=todas`) para ser distinguível do padrão; para admin/consulta, ausência segue significando todas (URLs antigas não mudam de sentido para eles). Um `filial=<ids>` explícito abre IGUAL para qualquer cargo (link compartilhável); link SEM param muda por cargo — aceite e registre. "Limpar" volta ao padrão do cargo (preserva `ord`/`pp`, regra F11/T7). Parser novo em `url-params.ts` (CSV validado item a item por `idNumerico`; inválido é ignorado, nunca derruba a página); `/pendencias` mantém a chave por **slug** (CSV de slugs) — não force unificação de tipo onde a view entrega slug; registre.

4.3. **UI**: o Select vira multi no padrão do Popover+Checkbox do filtro de **Status** de `ativos-filtros.tsx` (contagem no gatilho, "Todas as filiais" como estado sem recorte). Mesmo componente/mesma forma nas superfícies — não invente três UIs.

4.4. **Queries e exports**: `.eq('filial_id', id)` → `.in('filial_id', ids)` (e o equivalente por slug em pendências); as actions de `exportar.ts` leem a MESMA lista — tela e CSV nunca divergem (regra F12/W6A). Contagens, paginação e estados vazios respeitam a lista.

4.5. **`/relatorios`**: o item da sidebar (e a entrada da paleta, se houver) deixa de apontar fixo para `/relatorios/geral` — resolve pelo cargo (a regra do §4.1; o layout do grupo já tem o operador resolvido). As tabs, o período, os snapshots e o visualizador ficam como estão.

4.6. **`/itens`**: a visão padrão dos saldos vira **"Por filial"** para todos (ausência de `visao` = lado a lado; Consolidado por sentinela explícita, sugestão `visao=consolidado`; links antigos com `?visao=filiais` seguem funcionando). A neutralização vigente do `filial` na visão por filial FICA (leia o comentário do parse — ela existe por causa de recorte invisível); o padrão por cargo do filtro `filial` vale quando o usuário estiver no Consolidado. O pré-preenchimento do lançamento (`filialPreset`) só vale quando a lista efetiva tem EXATAMENTE uma filial e ela é de escrita do cargo — com 2+ marcadas, dialog abre sem preset.

4.7. **Exceção registrada**: `/relatorios/gerados` (histórico de snapshots) ganha a multi-seleção, mas o padrão continua "todas" mesmo para o operador — o arquivo é global e o recorte por padrão esconderia os consolidados; registre a decisão.

### 5. Efeitos colaterais — MEÇA, não presuma

5.1. **Termo antigo regerado** (dados sem `cidade`) e **termo de lote multi-filial**: cubra os dois por teste (§3.2).

5.2. **KPI tiles do relatório** (`linksKpiAtivos`) geram links `/ativos?filial=<id>` — com o param em lista, o link de uma filial continua válido (lista de 1); confira que nada quebra.

5.3. **"Voltar para ativos"** (`lembrar-lista`) e navegação por URL memorizada: a URL gravada carrega o filtro novo — confira ida e volta.

5.4. **Import intocado de verdade**: rode o preview de um CSV fictício no ensaio antes e depois — byte a byte igual (contagens, erros, avisos).

5.5. **Consulta e viewer**: cargo consulta (sem vínculo) entra com todas em tudo — não pode explodir em `filiaisEscrita = []`; o visualizador por senha não passa pelo padrão por cargo.

### 6. Migrations e produção

Tudo aditivo → **caminho A** do runbook: ensaio primeiro, produção depois, verificação pós-apply SEMPRE (as 5 cidades preenchidas; colunas novas presentes; `select` de sanidade). Sem valor novo de enum, sem RPC — o gate não deve acionar; se acionar, não brigue: caminho B (SQL de handoff em `scratchpad/` + registro "pendente de execução manual") e siga. `db:types` regenerado. Advisors sem WARN novo. Deploy pela `main` só com o §V verde; smoke pós-deploy.

### 7. Testes

- **Vitest**: `filtroFilialPadrao` (os 4 cargos × com/sem vínculos) e a regra da aba; parser CSV de filiais (ids e slugs; lixo ignorado); `prepararTermo` — celular pré-preenchido, cidade por filial, lote misto avisa, termo salvo sem cidade completa; validators novos; testes derivados da ajuda passando por acomodação real.
- **Roteiro SQL**: nada novo obrigatório (sem RPC/policy nova); o CI de banco já aplica as migrations em ordem — confira que segue verde.
- **Smoke**: as telas tocadas continuam 200 com marcador de conteúdo, no padrão existente.
- Testes existentes NÃO se deletam — se quebrarem, é efeito real a acomodar.

## Critérios de aceitação

1. **Celular**: cadastro single, edição e ficha exibem os 3 campos só para categoria celular; termo de responsabilidade de celular vem pré-preenchido do cadastro e continua 100% editável; snapshot `dados` grava o que saiu no papel.
2. **Cidade**: no ensaio, termos gerados para ativos fictícios das 5 filiais saem cada um com a cidade certa na linha da assinatura; a cláusula de foro está byte a byte intocada nos 7 templates; lote multi-filial e filial sem cidade avisam; termo antigo regenerado sai com cidade.
3. **Multi-seleção**: em `/ativos`, `/movimentacoes`, `/itens` (Consolidado), `/pendencias` e `/relatorios/gerados` dá para marcar 2+ filiais; lista, contagens, paginação e export CSV respeitam a mesma seleção; a URL é compartilhável e abre igual para qualquer cargo.
4. **Padrões por cargo** (provado no ensaio com um operador fictício vinculado a Serra+Linhares): ele entra nas listas com as duas marcadas e em `/relatorios` na aba Linhares; admin/dev/consulta entram com todas e no Consolidado; `/itens` abre na visão "Por filial" para todos; "Todas as filiais" continua alcançável para o operador (sentinela) e "Limpar" volta ao padrão do cargo.
5. **Nada de permissão mudou**: selects de escrita idênticos aos de antes; RLS intocada; consulta continua lendo tudo e escrevendo nada.
6. **Sem regressão**: preview do import byte a byte igual; snapshots antigos abrem; termo de categoria não-celular idêntico ao de antes exceto a cidade; visualizador por senha intocado; advisors sem WARN novo.
7. **Portões**: `npm run lint`, `npm run test`, `npm run build` limpos; `database.ts` regenerado; migrations aplicadas nos DOIS bancos com verificação pós-apply escrita; deploy READY + smoke pós-deploy OK.
8. **Docs**: spec §5/§6 (campos do celular; filtros e padrões) e §7 (aba padrão) emendadas; PLANO-TERMOS §9/§10 (itens entregues, pergunta 4 respondida); MATRIZ-REGRAS; ajuda F20 com os guardas verdes; `docs/DECISOES.md` (uma ata por decisão — inclusive as desta ordem: foro fica, padrão do operador = todas as vinculadas, aba = 1ª alfabética, gerados = todas, observação não migra); CHANGELOG; README; `docs/prompts/README.md` (linha F25); `docs/RELATORIO-F25.md`.

## §V — Verificação (rode de verdade, itere até passar)

Meça a baseline (lint/test/build + contagem de testes) ANTES de qualquer mudança e cole no relatório. A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a CAUSA RAIZ, repita; nunca suprima erro nem desabilite/delete teste para passar. Ensaio com dado 100% fictício (`WAP0001234`/"Fulano"); produção só recebe apply + verificação pós-apply + advisors + smoke. Ao final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão, atenção especial a: os campos do celular vazam para outra categoria (form, ficha, termo)?; a cidade sai errada em lote misto, termo antigo ou filial sem cadastro?; o retag alterou QUALQUER coisa além da linha da assinatura (render comparado)?; o padrão do operador quebra link compartilhado, bookmark antigo ou o "Limpar"?; a sentinela "todas" e a ausência de param se confundem em alguma tela?; tela e CSV exportado podem divergir?; `/pendencias` (slug) e as demais (id) convergiram no comportamento?; sidebar e paleta ainda apontam `geral` para operador?; `/itens` com `visao` ausente, `filiais` e `consolidado` faz o certo nos três casos, e o preset do lançamento com 2+ filiais marcadas?; consulta sem vínculo explode em algum lugar?; o import mudou em algum byte observável? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise até limpar.

## Autonomia, decisões e git

Você roda de forma autônoma (modo do CLAUDE.md): ninguém responderá perguntas — não pare, não espere confirmação. Régua: (1) esta ordem; (2) spec/ADRs/RUNBOOK e as convenções do repositório; (3) a opção mais simples e reversível — decisões não-óbvias em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha 3 vezes → troque de abordagem e registre. Bloqueio real → contorne com segurança ou siga com o resto e registre a pendência. Se o ambiente vetar um passo sensível (apply, push), NÃO insista até abortar: deixe o SQL/comando exato pronto e provado no ensaio, registre "pendente de execução manual" e siga. Git: commits pequenos em pt-BR estilo conventional (`feat(f25): …`); branch opcional (`f25-celular-cidade-filtros`) com merge próprio ao fechar o checklist; PROIBIDO push forçado, reset destrutivo de git, commitar `.env*`, dado real em seed/fixture/teste/screenshot.

## §R — Encerramento e relatório

`CHANGELOG.md` (topo) · `docs/prompts/README.md` (linha da F25) · `README.md` (status) · `docs/DECISOES.md` · `docs/RELATORIO-F25.md` em pt-BR com: o que mudou e por quê; o checklist desta ordem autoverificado item a item; **evidências coladas** (saídas reais de lint/test/build, das verificações pós-apply, dos advisors e do smoke — afirmação sem saída não vale); decisões; pendências; a seção "o que este relatório NÃO prova"; e o roteiro manual de 5 minutos para o Johnny — sugestão: no ENSAIO, cadastrar um celular fictício com telefone/IMEI/Pulsus e gerar o termo vendo os campos e a cidade da filial preenchidos; gerar um termo de Linhares e conferir a cidade; logar como operador fictício de Serra+Linhares e conferir os padrões (listas com as duas marcadas, relatório na aba Linhares, `/itens` lado a lado); marcar/desmarcar filiais no filtro e exportar o CSV conferindo que bate; conferir como admin que nada mudou de padrão. Push = deploy Vercel, só com o §V inteiro verde. Termine a resposta final com um resumo de ~5 linhas em pt-BR.

## Idioma

UI, mensagens, erros, commits, docs e relatório em pt-BR; identificadores de domínio em português sem acento (`telefone`, `imei`, `pulsus`, `cidade`, `filtroFilialPadrao`); utilitários/infra em inglês — a convenção vigente do repositório.

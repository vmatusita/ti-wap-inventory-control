ultracode

# OS-F20 (ultracode) — A `/ajuda` vira DOCUMENTAÇÃO do operador: multi-página, derivada do código, com busca, cobertura completa e âncoras antigas preservadas

Ordem **executável e autocontida** (24/07/2026). O manual do operador nasceu na F6B como **uma página única** (`/ajuda`): 10 seções num scroll só, busca por filtro de seção, âncoras + "?" contextual em 8 telas (F11) e a **regra de ouro** — glossário derivado de `dominio.ts`/validators, nunca copiado à mão. Funcionou até o sistema crescer: da F9 à F19-UX entraram lote de 30 com colar/bipar, kits, estoque mínimo, lista `/movimentacoes`, paleta `Ctrl+K`, export CSV, manutenção com fornecedor (chamado, devolução, troca, sucessão), pendência de item com desfecho, legendas do relatório, import com correções em massa e dark mode — e o manual virou 56 KB num scroll, com cobertura defasada em relação ao CHANGELOG. Decisão do Johnny (24/07/2026): **transformar a ajuda de hoje em documentação robusta, escalável, intuitiva e prática**, direto na `main`, seguindo a melhor prática de documentação — **no mesmo repositório e dentro do app** (custo R$ 0, login já existe, e a regra de ouro da derivação só funciona no mesmo build; repo/site separado foi considerado e descartado — registre em DECISOES). Objetivo em uma linha: **uma seção `/ajuda` multi-página organizada por intenção (começar · fazer · consultar · resolver), 100% coerente com o comportamento atual do sistema, com busca global, links contextuais certos, toda âncora antiga levando ao lugar novo — e testes que obrigam a documentação a acompanhar o código, hoje e nas próximas fases**.

**Modo autônomo com acesso total (CLAUDE.md).** Você roda de forma autônoma: **ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) spec/CLAUDE.md/convenções do repositório; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

**Produção e git.** Trabalho **direto na `main`** (precedente F14–F18), commits pequenos e frequentes (`feat(f20): …`, `docs(f20): …`); **push = deploy automático (Vercel)**. Esta ordem é **100% camada de app e conteúdo: ZERO migration, zero script de banco, zero operação destrutiva** — `supabase/` não é tocada. Proibido sempre: force push, `git reset --hard`, `git clean`, deletar/enfraquecer teste para passar, dependência nova (`package.json` byte a byte igual). Se o classificador barrar um push (precedente F7/0034): não insista — deixe commitado local, relatório completo e a instrução de 2 minutos para o Johnny.

**Dados e imagens.** Nenhum dado real (nome, patrimônio, e-mail) em exemplo, teste ou relatório — sempre fictícios (`WAP0001234`/"Fulano"). **A documentação não usa screenshot nem imagem**: prints envelhecem a cada fase e são vetor de vazamento de dado real; o texto usa os rótulos exatos da UI (decisão a registrar).

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. (Este arquivo em `docs/prompts/`, ainda untracked, não conta como working tree sujo.)

---

## §0 — Mapa do terreno (levantado no código em 24/07/2026 — confirme antes de mexer)

1. **Ajuda hoje:** `src/app/(app)/ajuda/page.tsx` (página única, só operador — o viewer por senha é barrado no proxy) renderiza `SECOES` de `src/lib/ajuda/conteudo.ts` (~56 KB), ids: `conceito · status · movimentacoes · termos · itens · pendencias · relatorios · como-fazer · admin · acesso`. Busca = filtro client-side de seções (`ajuda-busca.tsx` + `normalizarBusca` em `src/lib/ajuda/busca.ts`); âncoras via `ancora.ts` + `AncoraAoMontar` (correção F13-B3: o App Router desiste de rolar sob o `loading.tsx` — pegadinha conhecida, vale para qualquer rota nova). Blocos tipados sem JSX (`paragrafo · nota · lista · passos · glossario · movimentacoes`), renderizados por `src/components/ajuda/bloco-ajuda.tsx`.
2. **Regra de ouro (preserve e ESTENDA):** rótulos/vocabulários derivam de `src/lib/dominio.ts` (`STATUS_META`, `TIPO_META`, `TERMO_META`, `CATEGORIA_META`, `GRUPO_ITEM_META`, `ACESSORIOS_DEVOLUCAO`…), campos por tipo de `CAMPOS_POR_TIPO` (`validators/movimentacao.ts`) e tetos das constantes reais (`MAX_LOTE_MOVIMENTACAO`, `MAX_LOTE_COMPRA`, `MAX_LINHAS_LOTE_ITEM`, `CAP_EXPORT`, `DOMINIOS_TEXTO`). Só a prosa explicativa mora no conteúdo, em `Record`s tipados pelo enum (o TS exige completude). `conteudo.test.ts` (~22 KB) trava isso — **testes de completude nunca enfraquecem, só crescem**.
3. **TRAP de arquitetura (comentário no topo de `conteudo.ts`):** o conteúdo é **só-servidor** (arrasta `CAP_EXPORT`→PapaParse). A paleta `Ctrl+K` (`paleta-comandos.tsx`) é **client**. Qualquer índice de busca consumido no client precisa vir por prop/payload serializado a partir do servidor, ou de um módulo separado sem imports server-only — **nunca** importe `conteudo` num Client Component.
4. **Consumidores de âncora que NÃO podem quebrar:** `LinkAjuda` (`src/components/layout/link-ajuda.tsx`) com mapa fixo em 8 telas; atalho `?` e entrada de ajuda na paleta (F11); hashes antigos `/ajuda#<secao>` em favoritos/histórico dos operadores. Compatibilidade total é critério de aceite.
5. **Cobertura defasada (mínimo a auditar — a fonte é o CHANGELOG/RELATORIOs da F6B à F19-UX):** kits (F12), estoque mínimo/"repor" (F12), lista `/movimentacoes` + filtros na URL (F11), paleta e atalhos `Ctrl+K`/`/`/`N`/`L`/`?` (F11), ordenação/paginação de Ativos (F11), saldos por filial (F11), export CSV com cap (F10), colar/bipar lote de até 30 + rascunho + duplicata (F10), manutenção com fornecedor: `chamado do fornecedor`, devolução ao fornecedor, `troca`, vínculo de sucessão (F14/F15), service tag obrigatória + pendências de service tag (F15), pendência de item com desfecho individual/em lote e a dispensa do import (F17-pós/F18), legendas e busca do relatório, Δ com cor, KPIs clicáveis, estornadas sinalizadas, manutenção 30+ dias (F16/F17), import de startup: correções em massa, hostname automático, avisos âmbar, `.xlsx` (F7B–F7K), modo escuro opt-in (F19-UX).
6. **Verificação disponível:** `npm run lint` · `npm run test` (Vitest node, só funções puras) · `npm run build`; baseline pós-F19-UX ≈ **1119 testes / 58 arquivos** e build de **24 rotas** — meça no GATE, não confie. Smoke reexecutável `scripts/smoke/smoke-prod.mjs` com **passo logado** via `.env.smoke` (existe na máquina do Johnny). MCP Vercel (`get_runtime_errors`, deploy READY) e `gh` (CI: lint+test+build e job `banco`) disponíveis nas fases anteriores.
7. **Hazard OneDrive (F17):** edição que "não pega" já aconteceu nesta máquina — após cada leva de edições em massa, confie em `git status`/`git diff`, não na memória do editor.

---

## §1 — Orquestração

### 1.0 GATE de entrada

(a) Working tree **limpo na `main`** e sincronizado com `origin`. Sujo → PARE e reporte. (b) Baseline verde HOJE: `npm run lint && npm run test && npm run build` — vermelho → PARE e reporte; **registre a contagem exata de testes e de rotas** (é o piso: contagem só sobe). (c) Inventário de capacidades no relatório: `gh` autenticado? MCP Vercel enxerga o projeto? `.env.smoke` presente para o smoke logado? As provas do §V se adaptam ao que existir. (d) Leia ANTES de escrever: `conteudo.ts` + `conteudo.test.ts` + `bloco-ajuda.tsx` + `ajuda-busca.tsx` + `ancora.ts` + `link-ajuda.tsx` + `paleta-comandos.tsx` inteiros; `docs/ESPECIFICACAO.md` §6–§8; CHANGELOG e RELATORIOs F6B→F19-UX. (e) Um `PLAN.md` de outra fase na raiz não é seu — não toque.

### 1.1 Grafo

    ONDA 0 (∥, read-only)                ONDA 1 (motor, sequencial)      ONDA 2 (∥, conteúdo, arquivos disjuntos)
    I-A conteúdo atual verbete a verbete → docs/PLANO-AJUDA.md   →  M1–M6 rotas/registry/busca/  →  C1 começar+conceitos ∥ C2 operação
    I-B CHANGELOG/RELATORIOs → capacidades    (gabarito, commitado)      âncoras/print/paleta          ∥ C3 itens+pendências+admin+import
    I-C telas reais: rotas, títulos, rótulos                                                           ∥ C4 relatórios+referência
                                        ONDA 3: integração → revisão adversarial (5 lentes) → emendas → re-revisão → §R rollout → §D docs

### 1.2 Regras globais

1. **Escopo fechado.** O que surgir de fora (bug de tela, ideia de feature) vira backlog no relatório — esta ordem só escreve documentação, motor de navegação/busca dela e os pontos de entrada (LinkAjuda/paleta/atalho `?`). Nenhuma regra de negócio, action, query de produção ou tela fora disso muda.
2. **Zero migration, zero dependência nova** (sem MDX/markdown pipeline — o conteúdo segue TS tipado, que é o que permite os testes de completude), `src/components/ui/**` intocado, nenhum papel/role novo.
3. **A documentação descreve o comportamento ATUAL.** Proibido documentar futuro/backlog (A8, T11, modo *Atualizar* do import, upload de PDF assinado…) — nada de "em breve". Divergência doc↔código encontrada no caminho: o **código manda**; se o código parecer errado, registre no backlog do relatório e documente o que o sistema FAZ.
4. **Nada do conteúdo atual se perde em silêncio.** Reorganizar ≠ apagar: todo verbete/passo/nota de hoje aparece na matriz do §P com destino (página nova) ou motivo de descarte (ex.: obsoleto desde F12) — descartes viram lista no relatório.
5. **Invariantes:** o visualizador por senha **não ganha** rota, link ou dado novo (proxy inalterado; decisão F17 — as legendas dele vivem no próprio relatório — mantida); contagens/relatórios/snapshots intocados; âncora antiga nunca vira 404/lugar errado; mobile 375 px sem scroll lateral novo; dark mode ok (F19-UX); impressão ok.
6. Convenções CLAUDE.md integrais: pt-BR, Server Components por padrão, datas `dd/MM/yyyy`, patrimônio canônico `WAP0004491` (fictício), identificadores de domínio em pt sem acento.

### 1.3 Propriedade de arquivos (disjunta na onda 2)

| Frente | Arquivos |
|---|---|
| **M** (onda 1) | `src/app/(app)/ajuda/**`, `src/lib/ajuda/**` (registry, busca, âncoras, tipos de bloco), `src/components/ajuda/**`, `src/components/layout/link-ajuda.tsx`, `paleta-comandos.tsx` (só o grupo de ajuda) |
| **C1–C4** | cada frente é dona **só dos módulos de conteúdo das suas páginas** (`src/lib/ajuda/conteudo/<pagina>.ts` + seus testes) — o registry central é editado uma vez pelo orquestrador ao integrar |
| **Orquestrador** | `docs/PLANO-AJUDA.md`, `docs/DECISOES.md`, `README.md`, `CHANGELOG.md`, `docs/prompts/README.md`, `docs/ARQUITETURA.md` (emenda §manutenção), `docs/RELATORIO-F20.md`, `scripts/smoke/**`, rollout, push |

---

## §P — Onda 0: inventário e `docs/PLANO-AJUDA.md` (o gabarito)

Três inventários read-only em paralelo: **I-A** o conteúdo atual, verbete a verbete (id, tipo de bloco, o que afirma); **I-B** capacidades entregues F6B→F19-UX a partir de CHANGELOG + RELATORIOs, cada uma classificada `documentada ok / desatualizada / ausente`; **I-C** as telas reais — cada rota do grupo `(app)` com título, ações, campos e **rótulos exatos** (o texto da doc usará esses rótulos, não paráfrase).

Consolide em **`docs/PLANO-AJUDA.md`** (padrão `PLANO-TERMOS`/`PLANO-RELATORIOS-V2`), autossuficiente — é o gabarito da revisão adversarial e vira o **mapa vivo** da documentação no §D:

1. **Arquitetura da informação** por intenção do operador (adaptação de Diátaxis, decisão a registrar): **Comece aqui** (o essencial em 10 min: conceito movimentação-fonte-da-verdade, par patrimônio+service tag, as duas portas de acesso, o mapa das telas) · **Guias de tarefa** ("como fazer X", um fluxo por página) · **Referência** (consulta seca e derivada: status, tipos e efeitos, campos por tipo, limites, atalhos, mensagens de erro, domínios) · **Solução de problemas** (sintoma → causa → saída). Páginas curtas e focadas (regra prática: uma tarefa por página; referência separada de tutorial).
2. **Sitemap com slugs estáveis** (`/ajuda` índice + `/ajuda/<slug>` por página), título e resumo de 1 linha por página.
3. **Matriz de cobertura**: (rota do app × página que a documenta) e (capacidade do I-B × página) — célula vazia = lacuna a fechar na onda 2.
4. **Mapa de compatibilidade**: cada id antigo (`#status`, `#como-fazer`…) → destino novo (página ou página#âncora); os 8 usos do `LinkAjuda` → novo href.
5. **Régua de qualidade por guia** (contrato da onda 2): pré-condições · passos numerados com os rótulos reais da UI · "o que acontece por trás" (estado→estado, o que muda em pendências/relatório) · erros comuns e como sair · links relacionados · exemplos 100% fictícios.

## §M — Onda 1: motor (navegação, busca, compatibilidade)

**M1 — Conteúdo modular:** fatie o monólito em `src/lib/ajuda/conteudo/<pagina>.ts` (blocos tipados, sem JSX, prosa + derivação como hoje) + um **registry central tipado** (slug, título, categoria, resumo, blocos, âncoras) que alimenta rotas, índice, busca e testes. Tipos de bloco novos se precisar (ex.: `atalhos`, `tabela`, `sintoma-solucao`, `links`) — sempre renderizados em `bloco-ajuda.tsx`, sempre importáveis no Vitest node.
**M2 — Rotas:** `/ajuda` (índice: busca + categorias + páginas mais usadas) e `/ajuda/[slug]` via `generateStaticParams` do registry — Server Components, `metadata` por página, sumário da página (âncoras dos títulos), navegação anterior/próxima dentro da categoria, breadcrumb. Cuidado F13-B3 nas âncoras internas.
**M3 — Busca global:** índice construído do registry por função pura testada (reuse `normalizarBusca`); resultados por página+âncora no índice da ajuda **e** num grupo "Ajuda" da paleta `Ctrl+K` — respeitando o TRAP do §0.3 (client nunca importa o conteúdo server-only; sirva o índice serializado).
**M4 — Compatibilidade de âncoras:** `/ajuda#<id-antigo>` continua funcionando — o índice lê o hash no client e redireciona pelo mapa do §P.4 (hash não chega ao servidor; reuse o padrão `AncoraAoMontar`). `LinkAjuda` passa a apontar direto para a página/âncora nova nas 8 telas; atalho `?` → índice. **Teste**: todo id antigo tem destino existente; todo href do LinkAjuda existe no registry.
**M5 — Impressão:** uma visão "manual completo" imprimível (agregado de todas as páginas na ordem do sitemap) — substitui o papel do scroll único; link discreto no índice.
**M6 — Aceite do motor:** build lista as rotas `/ajuda/*` esperadas; lint/test/build verdes; navegação por teclado ok; 375 px, dark e print ok.

## §C — Onda 2: conteúdo (4 frentes, sob a régua do §P.5)

**C1 — Comece aqui + conceitos:** visão geral do sistema e mapa das telas; movimentação como fonte da verdade (registra uma vez → estado/estoque/relatório derivam); par patrimônio+service tag e patrimônio repetido; as duas portas (operador × senha de visualização); pendências como esteira de regularização; atalhos essenciais; modo escuro.
**C2 — Guias de operação (ativos):** nova movimentação em lote (até o teto real, colar/bipar, kits, rascunho, aviso de duplicata, sucesso parcial, termos em sequência); cadastro de compra (single/lote/faixa, service tags pareadas, "Comprar outro igual"); entrega/reserva/empréstimo; devolução com checklist + triagem; manutenção completa (envio com chamado do fornecedor, retorno, devolução ao fornecedor com substituto por `troca` e vínculo de sucessão); transferência; defasado/descarte; ajuste e estorno (onde ficam e o que desfazem); termos (gerar, confirmar/desfazer assinatura, devolução).
**C3 — Itens, pendências, administração e import:** lançamentos por quantidade (carrinho, criar item inline, histórico com filtros, saldos por filial, "repor"/estoque mínimo); pendências (os buckets reais: termo, patrimônio, service tag, item faltante com desfecho individual/em lote — e as dispensas do import); administração (usuários/convites e domínios, senhas de acesso — criar/entregar/revogar —, filiais, motivos, catálogo de itens, kits); import de startup por filial (quando usar, *Substituir tudo*, correções no preview, hostname automático, avisos âmbar × erros).
**C4 — Relatórios + referência + solução de problemas:** relatório ao vivo e snapshots (o que cada grupo/KPI mostra, Δ e cores, busca e filtros no link, estornadas, impressão, "como ler"); o fluxo do visualizador do ponto de vista do OPERADOR (entregar link+senha, revogar); referência derivada: status com badges reais, tipos com efeito e campos, limites/tetos, atalhos de teclado, **mensagens de erro → o que fazer** (a partir das mensagens reais de `src/lib/actions/erros.ts`), domínios de e-mail; solução de problemas (mínimo: "não encontro o ativo", "o tipo que quero não aparece no lote", "patrimônio duplicado", "termo continua pendente depois de gerado", "import recusou meu arquivo", "esqueci/perdi a senha de acesso").

Cada frente atualiza a matriz do §P.3 (célula → página) e escreve os **testes de completude** dos seus módulos no padrão de `conteudo.test.ts`.

---

## §V — Verificação (rode de verdade, a cada incremento)

1. `npm run lint && npm run test && npm run build` — verdes, sempre; itere até passar, causa raiz, nunca supressão; contagem de testes **só sobe** a partir do piso do GATE.
2. **Testes estruturais novos** (função pura): slugs únicos e estáveis; toda rota do `(app)` presente na matriz (com página ou isenção justificada no próprio teste); todo id antigo com destino; todo href de `LinkAjuda` existente; índice de busca cobre toda página; `Record`s por enum completos (os existentes continuam valendo).
3. **Smoke:** estenda `scripts/smoke/smoke-prod.mjs` com as rotas novas da ajuda (200 + marcador de conteúdo por página, no passo logado). Rode contra produção após o deploy, se `.env.smoke` existir; senão registre a pendência.
4. **Revisão adversarial** (entre integração e rollout): cinco lentes independentes em contexto fresco, refutação por padrão, só lacuna de correção/requisito (não estilo): **(1) fidelidade UI↔doc** — amostra ampla de guias conferida contra o código real das telas: cada passo cita rótulo/campo/limite que existem? nenhum teto/comportamento inventado?; **(2) cobertura** — matriz do §P.3 sem célula vazia; nada do I-B ausente; nada do conteúdo antigo sumido sem registro (§1.2.4); **(3) derivação e testes** — nenhum rótulo/vocabulário copiado à mão; testes de completude cobrem os módulos novos; nenhum teste enfraquecido; **(4) navegação e acesso** — âncoras antigas redirecionam; LinkAjuda certo nas 8 telas; paleta ok; 375 px/dark/print; **viewer por senha sem acesso novo**; TRAP §0.3 respeitado (nenhum import server-only em client); **(5) linguagem** — pt-BR de operador (sem jargão de dev), datas `dd/MM/yyyy`, exemplos fictícios, zero dado real, zero promessa de futuro. Achado real → corrija → re-revise até limpar.

## §R — Rollout (orquestrador, só depois de tudo verde)

1. União verde local (lint/test/build) + revisão limpa.
2. Push na `main` → deploy Vercel; conferir **READY** + `get_runtime_errors` limpo (MCP Vercel, padrão F15–F18).
3. GitHub Actions **verde**: `gh run watch`; sem `gh` → pendência com link.
4. Smoke de produção (§V.3): índice, cada página, uma âncora antiga (`/ajuda#movimentacoes`) e o atalho `?` — e conferir que `/relatorios/**` do visualizador segue idêntico.

## §D — Documentação e relatório final

- `docs/DECISOES.md` — ata F20: mesma base/sem repo novo, sem MDX/dependência, arquitetura da informação escolhida, slugs, política sem-screenshot, mapa de âncoras, o que foi descartado do conteúdo antigo e por quê.
- `docs/PLANO-AJUDA.md` finalizado como **mapa vivo** (sitemap + matriz de cobertura + mapa de âncoras) e `docs/ARQUITETURA.md` com a emenda **"como manter a documentação"**: toda ordem futura que mudar comportamento visível atualiza a página correspondente e os testes de completude acusam vocabulário novo não documentado — a regra de ouro ganha a dimensão de cobertura.
- `CHANGELOG.md` + `README.md` (status F20) + `docs/prompts/README.md` (linha F20 na tabela).
- `docs/RELATORIO-F20.md` em pt-BR: o que mudou e por quê, por onda/frente; **evidências reais coladas** (saídas de lint/test/build com contagens antes→depois, lista de rotas do build, resultado do smoke, matriz de cobertura final, achados da revisão e correções); pendências/backlog (inclusive divergências doc↔código encontradas); seção **"o que este relatório NÃO prova"** (padrão F12–F19).
- Resposta final no chat: resumo de ~10 linhas em pt-BR com os aceites de §M/§C/§V **autoverificados item a item**.

# Idioma

Narrativa, decisões, relatório e todo o conteúdo da documentação em **pt-BR** (voz de manual de operação: direta, segunda pessoa, sem jargão de desenvolvedor). Identificadores de domínio em português sem acento e utilitários em inglês (convenção do repo); commits em pt-BR, estilo conventional.

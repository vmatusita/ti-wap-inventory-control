# RELATÓRIO F20 — A `/ajuda` vira documentação do operador

**Data:** 24/07/2026 · **Ordem:** [`prompts/F20-ultracode.md`](prompts/F20-ultracode.md) · **Branch:** `main`
**Escopo:** 100% camada de app e conteúdo — **zero migration, zero script de banco, zero operação
destrutiva, zero dependência nova** (`package.json` byte a byte igual).

---

## 1. O problema, medido

A `/ajuda` nasceu na F6B como **uma página**: 10 seções num scroll só, busca por filtro de seção,
âncoras `#<secao>` e um "?" contextual em 8 telas. A **regra de ouro** sempre valeu — rótulo e teto
**derivados** de `dominio.ts` e dos validators, nunca copiados.

O sistema cresceu da F7 à F19-UX e a página não acompanhou. O inventário da Onda 0 mediu:

| Medida | Antes |
|---|---|
| Conteúdo | **56 KB** num arquivo, num scroll só |
| Unidades de conteúdo (blocos + itens) | **254** |
| Guias ("passos") — todos numa seção só | **26**, dentro de `como-fazer` |
| Capacidades do operador entregues F6B→F19-UX | **103** |
| — documentadas corretamente | **67** |
| — **desatualizadas** (o texto não bate com a tela) | **11** |
| — **ausentes** (zero menção) | **25** |

**1 em cada 3 coisas que o operador pode fazer estava ausente ou errada na ajuda** — e o formato já
não deixava achar o que estava lá.

## 2. O que mudou

**33 páginas** organizadas por **intenção do operador** (adaptação de Diátaxis — decisão registrada):

| Categoria | Páginas | Para quê |
|---|---|---|
| **Comece aqui** | 5 | entender o sistema antes de operar |
| **Como fazer** | 19 | um passo a passo por tarefa |
| **Consultar** | 7 | glossário, limites, mensagens de erro |
| **Resolver** | 2 | sintoma → causa → saída |

Rotas: `/ajuda` (índice com busca), `/ajuda/<slug>` (uma por página) e `/ajuda/manual` (tudo numa
página, para ler de ponta a ponta e imprimir — o papel que o scroll único fazia).

Sitemap completo, matriz de cobertura e mapa de âncoras: [`PLANO-AJUDA.md`](PLANO-AJUDA.md), que
fica como **mapa vivo**. Como manter: [`ARQUITETURA.md §11`](ARQUITETURA.md).

### As 36 lacunas fechadas

Todas as **25 ausentes** e **11 desatualizadas** do inventário foram fechadas e conferidas no
código. As de maior impacto:

- **modo escuro** (Claro/Escuro/Sistema) — zero menção antes;
- **o painel inicial** como tela: os KPI tiles clicáveis, o card "Itens para repor", o de pendências;
- **chamado do fornecedor** — obrigatório no envio à manutenção, e existia só como nome de campo numa
  lista derivada, sem uma linha de prosa;
- **devolução ao fornecedor** com substituto e **vínculo de sucessão** — guia completo, que não existia;
- as **ações de exceção no menu ⋯** da ficha: "Corrigir patrimônio" e "Definir service tag" tinham
  saído do lugar que a ajuda mandava procurar;
- **import de startup**: correção em massa no preview, sugestão automática, Desfazer, "Aplicar tudo",
  âmbar × vermelho, "Usar mesmo assim"/"Sem patrimônio";
- **convite**: o link sai **na tela** (nenhum e-mail é enviado) e a pessoa informa **nome e sobrenome**;
- **mensagens de erro** — 58 linhas de "a mensagem · o que aconteceu · o que fazer", com o texto
  exato que o operador vê;
- **solução de problemas** — 16 sintomas com causa e saída, que não existiam em formato nenhum.

### Divergências doc↔código corrigidas pelo código

O código mandou; o texto foi corrigido e o achado registrado:

1. O "?" **não** está em todas as telas (a ajuda prometia "cada tela").
2. O formulário **não** oferece só "os tipos válidos": Compra, Troca, Devolução ao fornecedor e
   Estorno têm caminho próprio e nunca aparecem no seletor.
3. A busca de `/ativos` **não** procura por service tag nem hostname (quem faz isso é o `Ctrl+K`).
4. O estorno de lançamento de item **não** é sempre "retorno" — o inverso depende do tipo original.
5. "Sem service tag" cai no tipo **Outras**, não em Patrimônio.
6. Pendências tem **5 tipos** (Patrimônio existia na tela desde a F7E), com **4** chips.
7. O relatório ao vivo abre **do domingo até HOJE**, nunca até sábado.
8. O chip "Manutenção parada (30+ dias)" vive na seção Pendências **do relatório**, não na tela.
9. Chamado é obrigatório em **Atrelar e Devolução** — "Liberação" é outro tipo, que não exige.
10. A **Reserva** não exige colaborador nem setor.
11. A tecla `L` **não** navega até Itens — só abre o lançamento, e só lá dentro.
12. A pessoa convidada entra na tabela de Usuários **na hora**, não ao ativar.

## 3. O que impede a documentação de envelhecer de novo

Esta é a parte que sobrevive à fase.

| Guarda | O que quebra o build |
|---|---|
| **Derivação** (regra de ouro, ampliada) | valor novo num enum → o `Record<Enum, string>` de prosa **não compila** sem o texto |
| **Tetos** | são interpolados das constantes reais — não há número para digitar |
| **Matriz de cobertura executável** | rota nova sem página, ou tela que não cita o `?` declarado |
| **`LinkAjuda`** | alvo que não existe no registry |
| **Referências cruzadas** | `links` para página inexistente, âncora inexistente, âncora duplicada |
| **Busca** | página fora do índice |
| **Linguagem** | jargão de dev, promessa de futuro, patrimônio não-fictício |
| **Smoke** | página nova sem entrada em `smoke-prod.mjs` |
| **TRAP só-servidor** | Client Component importando valor de `registry`/`conteudo`/`derivacao`/`legado`/`indice` |
| **"Nada se perdeu"** | frase do manual antigo apagada (ver abaixo) |

### O guarda-corpo do "nada se perdeu"

`src/lib/ajuda/conteudo.test.ts` — 46 asserções acumuladas da F9 à F18 — **atravessou a fase com
uma única linha alterada**, e para mais forte (`'definitivo nesta fase'` virou `'definitivo'` **+**
`'não há reabrir'`: uma asserção substituída por duas, porque *"nesta fase"* é vocabulário do
projeto e insinuava um futuro que a documentação não promete).

Ele continua rodando sobre uma **visão de compatibilidade**: cada página declara `legado: [...]` com
as seções antigas que herdou, e `legado.ts` remonta as 10 seções originais. Apagar uma frase do
manual antigo **quebra o teste** — sem ninguém precisar lembrar dela. "Reorganizar ≠ apagar" deixou
de ser promessa e virou build.

## 4. Como foi executado

| Onda | O quê | Como |
|---|---|---|
| **0** | 3 inventários read-only (conteúdo atual · capacidades F6B→F19-UX · telas reais com rótulos exatos) | workflow, 3 agentes ∥ |
| **1** | motor: registry, rotas, busca, âncoras, manual, `LinkAjuda`, paleta, smoke | sequencial, no loop principal |
| **2** | conteúdo das 33 páginas, arquivos disjuntos | workflow, 4 frentes ∥ |
| **3** | revisão adversarial | workflow, **5 lentes** ∥ em contexto fresco |
| **3b** | emendas | workflow, 4 frentes ∥ |
| **3c** | re-revisão | workflow, **3 lentes** ∥ |

## 5. Evidências

### 5.1 Gate de entrada (baseline, antes de tocar em nada)

```
npm run lint   → limpo
npm run test   → Test Files 59 passed · Tests 1125 passed
npm run build  → 24 rotas
```

Capacidades do ambiente, levantadas no gate: `gh` **ausente** nesta máquina · `.env.smoke`
**presente** · MCP Vercel enxerga o projeto (`prj_sUTqyUqhj7ZwGv8h5CAXMnpbU3fb`).

### 5.2 Verificação final

```
npm run lint   → limpo
npm run test   → Test Files 68 passed · Tests 1446 passed
npm run build  → 26 rotas (24 + /ajuda/[slug] + /ajuda/manual)
```

**Testes: 1125 → 1446 (+321).** Só em `src/lib/ajuda/`: 11 arquivos, **380 testes** (eram 46, no
único `conteudo.test.ts`). Contagem só subiu — nenhuma asserção foi removida ou enfraquecida.

### 5.3 Rotas do build

```
├ ƒ /ajuda
├ ƒ /ajuda/[slug]
├ ƒ /ajuda/manual
```

### 5.4 Smoke autenticado (sessão real, contra o dev local)

Estendido nesta fase para conferir **cada uma das 33 páginas** por HTTP 200 **e marcador de
conteúdo** (o título que o `<h1>` renderiza) — slug que exista mas caia numa página vazia devolveria
200 alegremente.

```
PARTE C — rotas do app COM sessão
  [OK] /ajuda            — HTTP 200 (226.315 bytes)
  [OK] /ajuda/manual     — HTTP 200 (493.197 bytes)
  [OK] /ajuda/comece-aqui … /ajuda/problemas-import-e-acesso   (33 páginas, todas 200 + marcador)

RESUMO · 86 OK · 1 aviso · 0 n/a · 0 falha
```

O aviso é pré-existente e não é desta fase (RLS de `kits_modelos` não comprovada porque não há kit
cadastrado). A lista de páginas do smoke é travada contra o registry por `smoke-ajuda.test.ts`:
página nova sem entrada lá quebra o `npm run test`.

### 5.5 Conferido no navegador (medição no DOM, sessão de operador)

| O quê | Resultado |
|---|---|
| `/ajuda#movimentacoes` (favorito antigo) | → `/ajuda/tipos-de-movimentacao` ✔ |
| `/ajuda#como-fazer` (favorito antigo) | → `/ajuda#fazer`, rolando até a categoria ✔ |
| Trilha "Como fazer" de dentro de um guia | rola até a categoria (`scrollY` 843) ✔ |
| `Ctrl+K` → "estoque minimo" | grupo **Ajuda** → "Ler os saldos e o estoque mínimo" ✔ |
| 375 px | `scrollWidth` = `clientWidth` = 375 — **sem rolagem lateral** ✔ |
| Tabela a 375 px | 448 px de largura **dentro** do contêiner `overflow-x:auto`, que rola sozinho ✔ |
| Tema escuro | fundo `lab(2.75 0 0)` / texto `lab(98.26 0 0)` ✔ |
| Impressão | a regra que neutraliza `.dark` em `@media print` continua de pé (invariante F19) ✔ |
| Sumário e trilha | 1 de cada visível (sem duplicação) ✔ |

### 5.6 Revisão adversarial

**Rodada 1 — 5 lentes** (fidelidade UI↔doc · cobertura · derivação e testes · navegação e acesso ·
linguagem e dados), refutação por padrão, cada achado exigindo prova em `arquivo:linha`:

| Gravidade | Achados |
|---|---|
| grave | **3** |
| médio | **13** |
| menor | **21** |
| **total** | **37** |

**Rodada 2 — 3 lentes** (os 37 fecharam? · o que as emendas mudaram está certo? · o motor depois da
cirurgia): os **três graves confirmados fechados**, três vereditos `achados-menores`, **14** achados
restantes — todos tratados.

**Total: 51 problemas achados e resolvidos.** Um achado foi **refutado com prova** (o texto sobre o
"?" do visualizador já estava correto depois da correção de código) — refutação é resultado válido.

#### Os dois defeitos de código que a fase introduziu (e a revisão pegou)

1. **`/relatorios/gerados` mostrava o "?" para o visualizador por senha.** A rota é dele; o destino
   não. O clique o expulsava para `/login` — exatamente o desfecho que a tela irmã já declarava
   inaceitável em comentário. Ganhou a mesma guarda de operador.
2. **A lista branca das âncoras antigas herdava o `Object.prototype`.** Era `mapa[hash]`, então
   `/ajuda#toString` devolvia uma **função** (truthy) e o `.split('#')` seguinte derrubava o índice
   com `TypeError`. Passou a usar `hasOwnProperty`; a função pura migrou para o módulo puro
   `ancora.ts` e o componente **chama** a função testada em vez de reimplementá-la — antes, a lista
   branca executada no navegador **não era a que os testes cobriam**.

#### O que a revisão mudou de método

- A **matriz de cobertura virou executável**: deixou de só conferir que o slug existe e passou a
  exigir que a tela **cite** o `?` da página declarada. Foi isso que revelou três abas de
  administração apontando para o lugar errado — corrigidas.
- O **TRAP do só-servidor virou teste**. Era comentário: um `import { PAGINAS }` num Client Component
  compilava, passava no lint e nos 1.443 testes, e arrastava as 33 páginas e o PapaParse para o
  bundle de toda tela. `so-servidor.test.ts` varre todo `'use client'` e falha se isso acontecer —
  **provado nos dois sentidos** (passa limpo, falha quando a violação é introduzida).
- Um **teste de fachada** foi desmascarado e reescrito: ele afirmava travar rótulos digitados à mão,
  mas só checava se a string do `import` aparecia no arquivo — e o contraexemplo estava três linhas
  abaixo, no mesmo arquivo. A varredura de verdade encontrou mais 12 rótulos digitados.

## 6. Git

5 commits diretos na `main`, **83 arquivos, +10.210/−991**:

| Commit | O quê |
|---|---|
| `12ea342` | `docs(f20)`: PLANO-AJUDA — o gabarito |
| `7849adc` | `feat(f20)`: motor — registry, rotas por página, busca e âncoras |
| `4f5156b` | `feat(f20)`: conteúdo das 33 páginas |
| `5309dc4` | `fix(f20)`: emendas da revisão — 2 defeitos de código e 30 de conteúdo |
| `526d8a5` | `fix(f20)`: re-revisão — âncora do índice, guarda do só-servidor e 12 menores |

## 7. Backlog gerado

Nada disto bloqueia a fase; tudo saiu do caminho como observação.

1. **Constantes sem casa pura.** O tamanho de página de `/pendencias` (`PAGE_SIZE`, não exportado),
   o do histórico de itens (literal inline em `itens/page.tsx`) e os `maxLength` dos formulários
   (500 / 2.000 / 200 / 80) são literais espalhados. A documentação os espelha à mão, e diz isso.
   Extraí-los para um módulo folha (no padrão de `import/limites.ts`) fecharia a última brecha de
   derivação.
2. **`placeholder="Filial Linhares, Stefanini…"`** em `admin/senhas` cita filial real e a parceira.
   Decisão desta fase: **não é dado real proibido** (a regra do `CLAUDE.md` fala de colaborador,
   patrimônio e linha de planilha) e o placeholder fica; a documentação, porém, descreve o campo sem
   reproduzi-lo. Registrado em `DECISOES.md`. Trocar o placeholder por algo genérico continua sendo
   uma melhoria possível.
3. **Código morto na sidebar:** `sidebar-nav.tsx` mantém um ramo que renderizaria a pílula "em
   breve" para item sem `href` — nenhum item está nessa condição hoje, então o ramo nunca roda.
   Deliberadamente fora da documentação (seria promessa de futuro); vale remover.
4. **`filtrarSecoes`** (em `legado.ts`) só tem o `conteudo.test.ts` como consumidor. Fica porque o
   guarda-corpo o usa; se um dia o teste antigo for aposentado, ela vai junto.

## 8. O que este relatório NÃO prova

- **Não houve deploy verificado em produção no momento em que este relatório foi escrito.** As
  provas de execução são contra o **dev local** com sessão de operador real (forjada no padrão do
  smoke). O resultado do push, do deploy e do smoke de produção está na seção de rollout abaixo —
  se ela estiver vazia, o rollout não aconteceu.
- **Não há screenshot.** O painel do navegador desta sessão não estava sendo exibido, então
  `screenshot` falhou por timeout. As afirmações visuais (375 px, tema escuro, tabela que rola no
  próprio contêiner, sumário sem duplicação) foram medidas **no DOM**, com números — o que é mais
  específico que uma imagem para essas perguntas, mas **não** substitui um olho humano em cima do
  resultado.
- **Não foi exercitado nenhum fluxo de escrita.** A fase é de leitura e conteúdo: nenhuma
  movimentação, compra, import ou senha foi criada. Que os guias descrevem corretamente esses fluxos
  foi conferido **lendo o código** das telas, validators e actions — não executando-os.
- **A cobertura de capacidades vale para a data.** Ela foi levantada do CHANGELOG e dos relatórios
  F6B→F19-UX. Uma capacidade que exista no código e nunca tenha sido registrada em documento nenhum
  não teria como aparecer no inventário.
- **Os testes de linguagem são lista negra, não julgamento.** Eles pegam as palavras proibidas que
  alguém pensou em listar. Jargão novo, ou uma frase confusa escrita em português impecável, passa.
- **O CI não foi conferido:** não há `gh` nesta máquina. `lint`, `test` e `build` rodaram local e
  estão verdes; o resultado do GitHub Actions fica por verificar.
- **A busca é `includes` de substring normalizada**, não busca semântica: quem procurar por um
  sinônimo que não está na lista `termos` da página não a encontra pelo índice (encontra pelo manual
  completo, com o Ctrl+F do navegador).

---

## 9. Rollout

**Push:** `b9a68ad..193c829` → `origin/main` (5 commits + o do gabarito; árvore limpa, `0 0` de
divergência com o remoto).

**Deploy:** `dpl_FzAgVmaSPK1LYJ71EASkSq5RMjHp` (commit `193c829`) → **READY**, alias
`ti-wap-inventory-control.vercel.app`, região `iad1`.
`get_runtime_errors` do projeto (janela de 2 h): **nenhum erro**.

### Smoke de produção — `scripts/smoke/smoke-prod.mjs`, sessão de operador real

```
PARTE A — sem sessão
  [OK] /ajuda — HTTP 307 → /login          (continua barrada sem sessão)

PARTE C — rotas do app COM sessão
  [OK] /ajuda           — HTTP 200 (550.775 bytes)
  [OK] /ajuda/manual    — HTTP 200 (1.156.034 bytes)
  [OK] as 33 páginas    — HTTP 200 + marcador de conteúdo, uma a uma

RESUMO · 86 OK · 1 aviso · 0 n/a · 0 falha
```

O aviso é pré-existente e não é desta fase (RLS de `kits_modelos` não comprovada porque não há kit
cadastrado em produção).

### Compatibilidade e invariantes, conferidos no ar

| Verificação | Resultado |
|---|---|
| `/ajuda#movimentacoes` (favorito antigo) | → `/ajuda/tipos-de-movimentacao` ✔ |
| `/ajuda#como-fazer` (favorito antigo) | → `/ajuda#fazer`, rolando até "Como fazer" (topo em 112 px) ✔ |
| Índice | **33 páginas visíveis**, 4 categorias ✔ |
| `/relatorios/acesso` (porta do visualizador) | HTTP **200** — inalterada ✔ |
| `/relatorios/geral` e `/relatorios/gerados` sem sessão | HTTP **307** → `/login` — inalteradas ✔ |
| `/ajuda/*` sem sessão | HTTP **307** → `/login` — o visualizador não ganhou nada ✔ |

### Pendências do rollout

1. **CI não conferido.** Não há `gh` nesta máquina, então o resultado do GitHub Actions (jobs
   `verificar` e `banco`) ficou por verificar. `lint`, `test` (1.446) e `build` rodaram local e estão
   verdes, e a fase **não tocou em `supabase/`** — o job `banco` não tinha o que quebrar. Conferir em
   <https://github.com/vmatusita/ti-wap-inventory-control/actions>.
2. **`/ajuda/<slug-inexistente>` responde HTTP 200, não 404.** O operador **vê** a tela de "não
   encontrado" (conferido: o corpo traz *"This page could not be found"*), mas o status sai 200
   porque o `loading.tsx` da rota faz o Next transmitir o esqueleto antes de a página resolver o
   `notFound()`. É comportamento conhecido do App Router com fronteira de carregamento, não regressão
   desta fase, e sem efeito prático num app interno atrás de login. Remover o `loading.tsx` daria o
   404 correto ao custo de a navegação herdar o esqueleto do dashboard — não vale a troca.

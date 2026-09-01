# PLAN-F43 — `/itens` legível ao bater o olho

**Escrito em 01/09/2026**, com a `v1.47.2` no ar, na branch `f43-legibilidade-itens`.
Plano de execução de UMA ordem de serviço (`docs/prompts/F43-legibilidade-itens-ultracode.md`), no molde
dos planos de fase anteriores: é autossuficiente — quem abrir só este arquivo consegue continuar.

---

## 1. O problema, em uma frase

A F42 consertou a **estrutura** de `/itens` (matou o `?visao=`, pôs a tela no casco da F40, deu rota
própria ao histórico) e **não consertou a leitura**. O Johnny, olhando a tela entregue, em 01/09/2026:

> "ainda está mto confusa e a visualização não está boa, não consigo entender de cara o que é cada coisa,
> tem que ser algo que entenda logo ao bater o olho"

Perguntado sobre o que a tela tem de responder em 5 segundos, sem tooltip e sem contar coluna, ele
escolheu **uma** coisa: **onde está o item — quanto tem em cada filial.**

## 2. O critério, e ele manda em tudo

O **teste dos 5 segundos**: uma imagem da tela vai para um subagente em contexto fresco, que responde

- **a.** Quais itens precisam ser comprados/repostos agora?
- **b.** O item *X*: em quais filiais ele está e quanto tem em cada uma? *(em 390px: onde você tocaria?)*
- **c.** Desse mesmo item, quanto está na prateleira e quanto está com as pessoas?
- **d.** *(diagnóstica, não reprova)* Algum número te deixa em dúvida?

Régua assimétrica: **uma** reprovação em a, b ou c derruba de imediato; para APROVAR, a pergunta tem de
passar em **duas rodadas independentes, com subagentes diferentes**. Condição de parada: depois de
**três desenhos** com a mesma pergunta reprovando, escolhe-se o melhor medido, declara-se NÃO ATENDIDA
e segue-se para o rollout.

## 3. A linha de base, medida antes de tocar em código

Fotografada em `docs/f43-evidencias/antes/` pela ferramenta nova (§4), com o `ItensTable` **de hoje**,
sem uma linha alterada. Oito julgamentos (2 larguras × 2 temas × 2 rodadas):

| | 1440×900 | 390×844 |
|---|---|---|
| **a** — o que repor | ✅ certeza 4/4 | ✅ certeza 4/4 |
| **b** — em quais filiais | ❌ **NÃO SEI 4/4** | ✅ certeza 4/4 (apontaram o chevron) |
| **c** — prateleira × pessoas | ✅ certeza 4/4 | ❌ **NÃO SEI 4/4** |

E um **achado medido** que nenhum dos sete pontos do diagnóstico da ordem previa:

> **Em 390px a tabela precisa de 740px e tem 356px.** As colunas *Em estoque* e *Em uso* existem no
> HTML e estão **fora da área visível** — o operador vê só o nome do item e o chevron. Nenhum número
> aparece no celular sem rolar a tabela para o lado. É por isso que a pergunta **c** dá NÃO SEI lá.

Respostas literais em `docs/f43-evidencias/antes/teste-5-segundos.json`.

## 4. A ferramenta que torna a prova possível

`scripts/design/capturar.mjs` **se recusa** a fotografar produção (regra 2 do `CLAUDE.md`), este
repositório não tem `.env.ensaio` e o `.env.local` aponta para produção — foi por isso que a F42 não
fotografou nada. A F43 não pode se dar a esse luxo: sem imagem, "ficou legível" é afirmação, não prova.

`scripts/design/previa-itens.tsx` resolve por outro caminho: **o componente real, dados fictícios.**

```bash
npx tsx --tsconfig scripts/design/tsconfig.previa.json scripts/design/previa-itens.tsx --saida docs/f43-evidencias/antes
```

- **React de verdade** — `renderToStaticMarkup` (react-dom 19.2.8, já é dependência).
- **CSS de verdade** — `src/app/globals.css` compilado pelo `@tailwindcss/postcss`, o mesmo do build.
- **Foto de verdade** — Playwright (devDependency desde 30/08/2026), 1440×900 e 390×844, claro e escuro.
- **Zero dependência nova** (regra 3), zero banco, zero `.env`.

São REAIS na foto: `Pagina`, `CabecalhoDaPagina`, `ItensFiltros`, `ItensTable`, `AtivosPaginacao`,
`EstadoVazio`, `RealtimeRefresh`, `ExportarCsvButton`, os dois diálogos e o kit `ui/`. São DUBLÊS o
cabeçalho e a barra lateral do app — desenhados com as MESMAS medidas do `(app)/layout.tsx` (`h-14`,
`w-60` a partir de `md`, `main` com `p-4 md:p-6`) para a **largura útil** da foto ser a real: **1150px**
em 1440, **356px** em 390. Não existe na foto a fonte Geist (vem do `next/font`) — cai no fallback
`system-ui` que o próprio `globals.css` declara.

## 5. O fato que destrava o desenho

**Os dados já estão na linha.** `getSaldosPorFilial` devolve `porFilial` e `consolidado` numa leitura
só, e `montarLinhasDeItem` já entrega isso em `LinhaDeItem`. Trazer a distribuição por filial para a
superfície **não precisa de query, RPC nem migration** — precisa de desenho.

## 6. As duas revisões de decisão que esta fase assume

Registradas em `docs/DECISOES.md` como **revisão**, nunca como "a F42 errou":

1. **A distribuição por filial volta para a superfície da linha.** A F42 a mandou para a linha
   expansível — e acertou em matar o `?visao=`, que era um filtro trocando COLUNA em vez de recortar
   LINHA. O que esta fase revisa é só o esconderijo: a comparação volta como **apresentação
   permanente**, nunca como modo, alternador ou preferência. A linha expansível **continua existindo**,
   com os quatro números por filial e o atalho de transferir.
2. **A hierarquia dos quatro números muda.** A F42 entregou quatro números de peso quase igual. Esta
   fase elege *Em estoque* como âncora e rebaixa *Total* e *Falta* — sem trocar UM rótulo (decisão do
   Johnny, 01/09/2026: ele escolheu redesenho visual e RECUSOU revisão de vocabulário).

## 7. As três variantes candidatas

Todas mantêm: rotas, params, filtros, permissões, CSV, os três estados vazios, o realtime, a linha
expansível e **o vocabulário** (*Total · Em estoque · Em uso · Falta · Reservado*, de `NUMEROS_ITEM`).

**Comum às três — o bloco de identidade.** A célula *Item* passa a ter duas linhas: nome + selo
`repor` em cima; `Acessório · Mouse` (grupo · tipo) embaixo, em `text-xs` atenuado. Isso **conserta**
o ponto 5 do diagnóstico (grupo e tipo não existiam abaixo de `md`/`lg`) e **devolve ~215px** de
largura de coluna para a distribuição por filial.

| | **A — Matriz** | **B — Faixa de chips** | **C — Linha de duas alturas** |
|---|---|---|---|
| Como a filial aparece | uma **coluna por filial**, permanente | uma coluna "Em cada filial" com N chips `Nome N` | uma faixa de filiais ocupando a **largura toda** da 2ª linha da linha da tabela |
| Em 1440 | 5 colunas alinhadas — dá para varrer a coluna inteira e comparar itens | chips na linha, ordenados por saldo | faixa larga, um bloco por filial |
| Em 390 | precisa rolar de lado (o defeito de hoje) | os chips **quebram** e continuam visíveis | a faixa **continua visível** |
| Risco | densidade; N filiais variável estoura a largura | ordem instável entre linhas atrapalha comparar | altura da linha dobra; menos linhas por tela |

A escolha é **por evidência**: as três são fotografadas e submetidas ao mesmo teste. A escolhida vai
para `src/components/itens/`; as recusadas viram ata em `docs/DECISOES.md`.

> **Nota de execução (01/09/2026, depois do bake-off).** As candidatas B e C foram consolidadas na
> implementação: em vez de "chips numa coluna" e "faixa na segunda linha", a faixa foi construída UMA
> vez, **dentro da célula do nome** — que é onde ela aparece em toda largura e onde o defeito de
> altura no celular se revelou. A terceira candidata virou a **matriz dupla** (a mesma coluna por
> filial, com `N em uso` numa segunda linha da célula). O que foi de fato medido, com números, está na
> §5 do [`RELATORIO-F43.md`](RELATORIO-F43.md) — esta seção fica como o plano que se tinha antes.

## 8. O que fica FORA — não-objetivos declarados

- **Banco.** Nenhuma migration, RPC, view ou policy. Os números todos já existem.
- **Vocabulário.** `NUMEROS_ITEM` continua a fonte única dos rótulos e das explicações. As colunas do
  CSV de saldos não mudam de nome, ordem nem conteúdo.
- **O `?visao=` não ressuscita.**
- **Telas irmãs:** `/itens/historico`, `/itens/conferencia`, `/admin/itens`, `/admin/tipos-item`, os
  diálogos, os relatórios, a ficha do ativo, a home. O que aparecer de lá vira backlog no relatório.
- **Dependência nova** (regra 3) e **`src/components/ui/`**.
- **A lista PENDENTES de `consistencia.test.ts` não cresce.** `src/components/itens/` e
  `src/app/(app)/itens/` estão 100% sob as 8 regras desde a F42, e continuam.

## 9. As travas que vão brigar, e como não brigar com elas

| Trava | O que ela exige |
|---|---|
| Regra 1 | nenhum `<h1>` fora do casco |
| Regra 2 | nenhum `max-w-*` fora de `{xs,sm,md,full,none,fit,min,max}`; nada de `mx-auto` com `max-w-*`; nada de `style={{maxWidth}}` |
| Regras 3/4 | espaçamento só na ESCALA `{0,0.5,1,1.5,2,3,4,6,8,12,16,auto,px}` — `p-5`, `gap-7`, `p-2.5` reprovam |
| Regra 4b | `p-*` genérico + `py-0`/`px-0` no mesmo grupo de variante reprova |
| Regra 5 | nada de `text-[Npx]`, `w-[Npx]`, `min-w-[Npx]`, `max-w-[Npx]` |
| Regra 6 | agrupamento com borda vem de `Card`/`QuadroDeTabela` — `rounded-* border` à mão reprova |
| Regras 7/8 | `page.tsx` abre com `<Pagina>` + `<CabecalhoDaPagina>`; o `loading.tsx` declara a MESMA largura |
| `contraste.mjs` | todo par de cor novo entra em `PARES` com `exigir: true`, nos dois temas, e mede AA |
| Acessibilidade | nada essencial só por cor; alvo de toque ≥ 40px; `aria-label` em todo controle novo |

Ainda: **não existe na casa** (nem no repositório irmão) um padrão pronto de distribuição de N filiais
dentro de uma linha de tabela. O mais próximo é `relatorios/medidor-minimo.tsx` — uma barra de UM
segmento dentro de célula — e o `.hbar` do `mockups/dashboard-relatorio.html`. **Não existe cor por
filial** no domínio (`STATUS_CHART_COLOR` é de status de ativo e está semanticamente ocupado). Logo: a
distribuição se comunica por **número e rótulo**, com a cor no papel de reforço, nunca de portadora.

## 10. Gabarito recurso-a-recurso (não-regressão)

Tudo abaixo tem de continuar existindo depois do redesenho. É a tabela que o relatório vai preencher.

**Filtros e URL:** `q` (só no submit) · `filial` (multi, com `todas` e o padrão do cargo) · `grupo` ·
`page` (com clamp na última) · `pp` (25/50/100, sobrevive ao "Limpar") · `lancar=1` · o `?visao=`
legado ignorado sem quebrar · o desvio do link antigo do histórico (que mora em `proxy.ts`, **não**
na `page.tsx`) · `baseFiltrosItens` contra a corrida de navegação.

**Colunas e selos:** Item · Grupo · Tipo · Total · Em estoque · Em uso · Falta · selo âmbar `repor`
(compara com o CONSOLIDADO) · selo vermelho `faltam N` · `foraDasFiliais` · o aviso de reservado.

**Ações:** `RealtimeRefresh` · "Exportar saldos" · "Histórico" · "Conferir estoque" (com a filial no
link quando há uma só) · "Transferir" (≥ 2 filiais de escrita) · "Lançar" + atalho `L` · o menu `⋯`
com "Lançar quantidade" e "Ver histórico deste item" · o atalho de transferir por filial na linha
expansível · a linha expansível em si.

**Estados vazios (três):** "Nenhum item no catálogo" (+ destino admin) · "Nenhum item com esses
filtros" (+ Limpar) · "Nenhum saldo nas suas filiais" (+ Ver todas) · e "Nenhum saldo ainda".

**Por cargo:** consulta não vê o menu `⋯`, nem Conferir, nem Transferir, nem Lançar; operador de uma
filial só abre recortado e vê o estado vazio próprio.

**CSV:** `Item · Grupo · Tipo · Filial · Total · Em estoque · Em uso · Reservado · Falta · <cada
filial> · <cada filial> — faltam · Fora das colunas` — **nome, ordem e conteúdo inalterados**.

## 11. Verificação de ponta a ponta

1. `npm run lint` · `npm run test` · `npm run contraste` · `npm run build` a cada incremento.
2. Prévia refotografada e teste dos 5 segundos nas duas larguras e nos dois temas, duas rodadas.
3. Revisão adversarial em contexto fresco contra este plano e contra o gabarito da §10.
4. Regra 8 do `CLAUDE.md`: `package.json` em **1.48.0**, entrada no topo de `registry.ts` com
   `fase: 'F43'`, entrada no `CHANGELOG.md` na mesma data, tag anotada `v1.48.0` publicada.
5. Merge na `main`, CI verde, deploy, smoke reexecutado com a saída colada no relatório.

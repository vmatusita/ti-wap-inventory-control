# Relatório F57 — Os quatro significados de filial, e o fim do fail-open

**v1.62.0** · **sem migration** · 14/09/2026 · branch `f57-quatro-significados-de-filial` → [PR #46](https://github.com/vmatusita/ti-wap-inventory-control/pull/46)

> A palavra "filial" carregava quatro significados fundidos: onde a pessoa ESCREVE, o que a sessão pode LER, o que a
> tela FILTRA e a IDENTIDADE do ativo. O filtro de leitura ainda usava a convenção `[] = todas as filiais` — um
> fail-open que, na virada multiempresa, faria uma interseção vazia (empresa ∩ filtro da URL) devolver o acervo de
> todas as empresas, sem erro nenhum. A fase deu nome a cada significado, criou o lugar onde o recorte de leitura vai
> morar (`src/lib/auth/recorte-leitura.ts`) e tornou "sem recorte" **irrepresentável**: as queries recebem um tipo
> nominal que só `efetivar` produz, e `[]` passado a uma query migrada não compila. Nenhum cargo passou a ver menos, e
> a única mudança de tela é a recusa de filial inexistente no endereço. **Uma decisão da ordem não foi aplicada** — a da
> compra — e ela é a primeira pergunta abaixo.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você

*Nada aqui é pedido de autorização. É a decisão que só você pode tomar, e o olho humano sobre produção depois do
deploy — que esta fase, por ordem, não roda.*

### 1. (Decisão sua) A compra com patrimônio repetido em OUTRA filial continua RECUSADA — a decisão i não foi aplicada

**O que a ordem pedia:** "`compras.ts` é consertado de verdade — recorta por filial, alinhando com a `0091`/`0092`",
partindo da premissa de que a régua certa (`actions/ativos.ts`) consultava por filial e a compra era a exceção global.

**O que a medição achou:** as **três** checagens de cadastro manual eram globais — `actions/ativos.ts`
(`filialComMesmaIdentidade`, sob o comentário "A CHECAGEM GLOBAL DE IDENTIDADE, que virou a ÚNICA linha de defesa"),
`actions/compras.ts` e `actions/devolucao-fornecedor.ts`. E é isso que a spec manda: `ESPECIFICACAO.md` §10.2 — *"o
conflito só nasce do import"*, cadastro manual recusa par que exista em qualquer filial —, a ata F24 de 30/07/2026 e a
regra permanente 2 do `CLAUDE.md`. A RPC `criar_compra_lote` não confere identidade (depende só do índice, que é por
filial desde a `0091`), então a pré-checagem global da compra é a **única** coisa que impede uma compra de criar o mesmo
par em duas filiais.

**O que a fase fez:** juntou as três consultas numa régua só (`src/lib/ativos/identidade.ts`) e **manteve** a recusa em
qualquer filial, com a mesma mensagem. O alcance virou uma constante nomeada, `ALCANCE_DA_RECUSA_MANUAL`.

**A pergunta:** você quer que a COMPRA passe a aceitar patrimônio + service tag que já existe em OUTRA filial? Se sim,
a troca é pequena e reversível, e fica numa ordem própria:
1. na chamada de `cadastrosComMesmaIdentidade` em `src/lib/actions/compras.ts`, passar o alcance da unidade da compra
   em vez de `ALCANCE_DA_RECUSA_MANUAL` (uma linha);
2. inverter o teste de PRESENÇA de `src/lib/ativos/identidade.test.ts`, que hoje exige o alcance de todas as unidades
   nas três actions (a sabotagem D.4 mostra que ele fica vermelho com essa troca — é de propósito), e acrescentar ao teste
   de EFEITO o caso da compra aceitando o par de outra filial (o de hoje prova a recusa e continua valendo para as outras
   duas actions; quem o derruba é trocar a própria constante, a sabotagem D.5);
3. emendar a spec §10.2 e a regra 2 do `CLAUDE.md`, que dizem hoje que cadastro manual nunca cria o par em duas filiais.

Se não, nada a fazer: o comportamento de hoje é o da spec. **Por que a fase não aplicou sozinha:** se aplicasse e você
não quisesse, desfazer exigiria apagar conflitos entre filiais criados em produção por compras reais. No sentido
escolhido, reverter é uma linha. A ata está em `docs/DECISOES.md` (14/09/2026 · F57 · ⚠ A decisão i do Johnny NÃO foi
aplicada).

### 2. Depois do deploy, em PRODUÇÃO — só olhar, sem gravar nada

- **`/relatorios/gerados` sem filtro:** os relatórios CONSOLIDADOS aparecem junto dos de filial, como antes.
  **`?filial=geral`:** só os consolidados. **`?filial=geral,<slug de uma filial>`:** os dois. **`?filial=todas`:** igual a
  sem filtro.
- **O filtro de filial padrão:** entrando como um operador com vínculo, `/ativos`, `/movimentacoes`, `/itens` e
  `/pendencias` abrem com as filiais dele marcadas; como admin, abrem em "Todas". O selo de pendências da barra lateral
  conta o mesmo recorte.
- **A recusa nova:** `/ativos?filial=9999` → **página não encontrada**. `/ativos?filial=99999` → abre normal (fora da
  faixa do id, é lixo e sempre foi ignorado — não confunda os dois). `/pendencias?filial=geral` → página não encontrada
  (antes abria vazia: em `/pendencias`, `geral` nunca foi o Consolidado). Se houver filial desativada com dado, o link
  dela continua abrindo filtrado.

### 3. Rodar `npm run test` e `npm run build` uma vez, na sua máquina

Sem banco: a fase não toca SQL. O total esperado está no §2.4.

### 4. Se precisar reverter, nesta ordem

Sem banco, sem dado: `git revert` dos commits da fase **de trás para frente** (fechamento → lote 4 → lote 3 → lote 2 →
lote 1 → G → F → E → D → C → B → A) e o deploy normal. Os lotes existem para que a reversão possa parar no meio com
`tsc` verde — reverter só o lote 4, por exemplo, devolve os invólucros transitórios de `filtros/filial.ts`.

---

# 2. Os números MEDIDOS, lado a lado com a ficha e a ordem

## 2.1 Estado de partida (`docs/PLAN-F57.md` §1)

| Medida | Ficha / ordem | Medido na `main` 711facd | Nota |
|---|---|---|---|
| Versão / última migration | `1.61.0` / `0140` | `1.61.0` / `0140` | a fase é `1.62.0`, sem migration |
| `.from()` literal nas 5 tabelas | ~109 (ficha) · 116 em `lib/queries`+`lib/actions` (ordem) | **116 + 1** em `src/app/(app)/ativos/[id]/page.tsx` = **117 em 21 arquivos** | o inventário cobre `src/**` inteiro |
| `filtros/filial.ts` | "97 linhas" | **84 linhas**, três funções | |
| `podeEscreverNaFilial` | `auth/papeis.ts` (ficha) | `src/components/layout/permissoes.ts` | a ordem já corrigia |
| Tipos com `filiaisEscrita` | dois (ordem) | **três** — o terceiro é `OperadorDoFiltro` | |
| Rotas que leem `filial` | 8 | **8** — só `/relatorios/[filial]` recusava | |
| Funções exportadas com `[] = todas` | — | **18** em 9 arquivos | a lista do `PLAN-F57.md` §6 tem 9 arquivos; o §1 do plano escreveu "8" — erro de contagem do plano, achado pela checagem factual do fechamento (§9) |
| O "⚠" do operador sem vínculo | "com o ⚠ que a tela já mostra" | **só do lado da escrita** (`AvisoSemFilialDeEscrita`) | ver §3 |
| Testes | — | **192 arquivos · 5.014 testes**, `tsc` limpo | `00-linha-de-base.txt` |

## 2.2 Referências de cada nome em `src/**` — antes × depois

Linhas com a palavra inteira (`git grep -w`), `main` × HEAD — saída em `docs/f57-evidencias/contagem-final.txt` §3.

| Nome | `main` | HEAD | O que sobrou, e por quê |
|---|---:|---:|---|
| `resolverFiliaisIds` | 26 | 1 | a regex da trava de presença (`recorte.test.ts`) que reprova o nome |
| `resolverFiliaisSlugs` | 16 | 1 | idem |
| `resolverFiliaisSlugsSemPadrao` | 7 | 1 | idem |
| `filtroFilialPadrao` | 20 | 3 | dois comentários que contam o nome antigo (`papeis.ts`, `permissoes.test.ts`) e a regex da trava |
| `filiaisDeEscrita` | 27 | 0 | |
| `filiaisEscrita` | 85 | 1 | um comentário de `permissoes.test.ts` que explica o rename |
| `podeEscreverNaFilial` | 13 | 0 | |
| `escreveNaFilial` | 28 | 28 | **fica por decisão** (pergunta sobre UMA filial dada — o nome continua verdadeiro) |
| `exigirEscritaEm` | 19 | 19 | fora do rename |
| `selecaoDeUnidades` · `…PorSlug` · `…SemPadrao` | 0 | 30 · 21 · 16 | |
| `unidadesMarcadasPorPadrao` | 0 | 20 | |
| `escopoDeEscrita` · `escopoEscrita` · `podeEscreverNoEscopo` | 0 | 29 · 70 · 15 | `escopoEscrita` < 85 porque as props com NOMES viraram `nomesDoEscopoEscrita` e os locais com objetos, `opcoesDeEscrita` |
| `recorteDe` · `efetivar` · `lerUnidades` | 0 | 52 · 91 · 63 | |
| `recortarPorUnidade` · `recusarFilialInexistente` · `cadastrosComMesmaIdentidade` | 0 | 22 · 26 · 17 | |

## 2.3 Arquivos por commit

| Commit | Frente / lote | Arquivos | + / − |
|---|---|---:|---|
| `6eab805` | a ordem de serviço | 1 | +670 |
| `89cafce` | a matriz de casos-limite ANTES | 5 | +3.558 |
| `a15994c` | A — o recorte de leitura e o tipo nominal | 4 | +648 |
| `e326829` | B — a seleção de unidades | 5 | +278 / −77 |
| `49b61c6` | C — o rename nas três camadas | 27 | +201 / −147 |
| `f926250` | D — os slugs numa fonte só | 12 | +319 / −29 |
| `2d70cc8` | E — a identidade numa régua só | 7 | +1.002 / −74 |
| `0173575` | F — filial inexistente responde 404 | 13 | +479 / −5 |
| `727b013` | G — a `chaveVersao` travada | 4 | +236 / −6 |
| `8ea5fcf` | H1 — queries de relatório | 9 | +239 / −20 |
| `053209e` | H2 — o resto das queries | 15 | +231 / −100 |
| `2e97165` | H3 — actions | 6 | +96 / −38 |
| `3504dd7` | H4 — telas e o fim do legado (inclui a matriz DEPOIS) | 16 | +2.996 / −122 |
| `4eadd9b` | o inventário | 1 | +331 |
| `42776d3` | sabotagens B e C | 2 | +515 |
| `2588bcf` | o detector de rotas fortalecido (revisão adversarial) + sabotagem E.3/E.4 | 2 | +89 / −11 |
| `5b868a7` | as varreduras de disco dos testes saem do corpo do `it` (o tempo-limite do fechamento) | 6 | +71 / −33 |
| `8d2d6cc` | I — o fechamento (versão, CHANGELOG, atas, arquitetura, índice, relatório, evidências) | 9 | +953 / −3 |

**Total da fase** (`git diff --shortstat main...HEAD` no fechamento): **97 arquivos, +12.763 / −516** — a maior parte é
teste, evidência e documento; só a matriz de casos-limite (`.json` e `.md`, antes e depois) soma cerca de 120 KB.

## 2.4 Testes — antes × depois

| | Arquivos | Testes |
|---|---:|---:|
| Linha de base (`main` + a ordem) | 192 | 5.014 |
| Fechamento (`fechamento-verificacao.txt`, segunda rodada) | **201** | **5.104** |

Os 9 arquivos a mais são os testes novos da fase (`recorte`, `casos-limite`, `slugs`, `identidade`, `identidade-sql`,
`pertinencia`, `rotas`, `chave-versao-sql`, `recorte-consulta`). Os **90** testes a mais: **80** nesses nove arquivos,
**+9** nos casos acrescentados a `filial.test.ts` (+7), `lista.test.ts` (+1) e `escopo.test.ts` (+1), e **+1** gerado por
`src/lib/queries/servidor-apenas.test.ts`, que cria um teste por módulo de `src/lib/queries/` e passou a ver
`recorte-consulta.ts`. Nenhum teste existente foi removido.

## 2.5 Os call-sites e o inventário

- **Varredura literal:** `main` **117 em 21 arquivos** → HEAD **115 em 21 arquivos**. A diferença é só a Frente E: as
  consultas de identidade de `actions/ativos.ts` (8→7), `actions/compras.ts` (2→1) e `actions/devolucao-fornecedor.ts`
  (1→0) viraram uma em `lib/ativos/identidade.ts` (0→1).
- **O inventário** (`docs/INVENTARIO-LEITURAS.md`) lista os 115 e mais **13** pares ponto × tabela de `.from(<variável>)`
  que a varredura literal não enxerga (`import-logs.ts`, `conflitos.ts#acervoDosAtivos`, `dev-destrutivo.ts`, `dev.ts`):
  **128**. A tabela por arquivo bate com o disco em todas as linhas (`contagem-final.txt` §2).

| Classificação | Fase de destino | Literais | Dinâmicas | Total |
|---|---|---:|---:|---:|
| confia na RLS | F66 (SELECT pela sessão) | 89 | 13 | 102 |
| confia na RLS | F67 (UPDATE/DELETE pela sessão) | 10 | 0 | 10 |
| precisa de `empresa_id` explícito | F63 (INSERT/UPSERT) | 4 | 0 | 4 |
| precisa de `empresa_id` explícito | F68 (service role alcançável pelo visualizador) | 12 | 0 | 12 |
| **soma** | | **115** | **13** | **128** |

---

# 3. As divergências — cada uma explicada

## As cinco que a ordem já declarava (todas confirmadas pela medição)

1. **116, não ~109** — e, medindo `src/**` inteiro, 117 (§2.1).
2. **`podeEscreverNaFilial` mora em `components/layout/permissoes.ts`**, não em `auth/papeis.ts`.
3. **O campo `filiaisEscrita` vive em mais de um tipo** — medido: três (`Operador`, `Permissoes`, `OperadorDoFiltro`).
4. **O defeito de identidade apontado é em `actions/compras.ts`**, não em `queries/compras.ts` — e a medição foi além:
   não é defeito (§1.1 e a próxima seção).
5. **`url-params.ts` já devolvia `{ modo }`** — desfazer o achatamento foi remover os dois `return []`.

## As quatro decisões do Johnny

- **i — compra recortada por filial: NÃO aplicada.** A premissa (a régua de `ativos.ts` é por filial) é falsa na
  medição, e a spec §10.2 manda recusar em qualquer filial. Roteiro item 1; ata em `DECISOES.md`.
- **ii — `notFound()` só para filial que não existe: aplicada.** Ela também corrige a ficha, que pedia recusa para
  "id de outra filial": outra filial ativa continua abrindo.
- **iii — uma run, uma PR, lotes internos com `tsc` verde: aplicada** (§2.3).
- **iv — rename nas três camadas: aplicado** (§2.2; prova de rename puro no §6).

## As que a execução acrescentou

- **O "⚠" do operador sem vínculo só existe do lado da ESCRITA.** Nas telas de leitura, a queda em "todas" é
  silenciosa — antes e depois. O caso-limite 3 foi provado como o código é; a frase da ficha ("com o ⚠ que a tela já
  mostra") descreve só `/itens/conferencia` e os formulários de escrita.
- **As seleções ganharam o campo `familia`**, que a forma da ficha não tinha — sem ele, `efetivar` não sabe se "todas"
  com um recorte restrito vira ids ou slugs.
- **`recorte.test.ts` mora em `src/lib/auth/`**, ao lado do módulo, e não em `src/lib/filtros/`.
- **O comentário do homônimo** foi para `unidades/slugs.ts` e `validators/admin.ts` (a antiga casa de
  `SLUGS_RESERVADOS`): a outra ponta do homônimo é `ajuda/registry.ts`, que a ordem proíbe tocar.
- **`/pendencias?filial=geral` passou a 404.** Em `/pendencias`, `geral` sempre foi um slug qualquer (a tela abria vazia);
  pela régua da decisão ii, é filial que não existe. Está entre as 8 células declaradas (§7).
- **O smoke que a ficha cita ("o smoke passa idêntico") não foi rodado** — ele roda contra ensaio/produção, e a ordem
  proíbe as duas coisas. A equivalência foi provada pela matriz de casos-limite e pela suíte.

---

# 4. O que mudou, por arquivo e por quê

## Frente A — o tipo que não sabe mentir (`a15994c`)

- **`src/lib/auth/recorte-leitura.ts` (novo).** `RecorteDeLeitura`, `RECORTE_UNIVERSAL`, `recorteDe`, `VistaDasUnidades`,
  `UnidadesEfetivas<F>`, `efetivar` (duas sobrecargas) e `lerUnidades`. O cabeçalho explica o que o módulo é hoje (um
  no-op correto: ADR-001/002), o que muda na virada (o corpo de `recorteDe`) e por que `efetivar` não é `return selecao`.
- **`src/lib/auth/recorte.test.ts` (novo).** Provas de tipo por `@ts-expect-error` (verificadas pelo `tsc`), trava de
  fonte contra `as (unknown as)? UnidadesEfetivas`, EFEITO com recorte restrito, NO-OP com o universal, resultado
  congelado — e, no lote 4, a PRESENÇA (§4 · H4).

## Frente B — o achatamento desfeito (`e326829`)

- **`src/lib/filtros/filial.ts`** passa a devolver `SelecaoDeUnidades`/`SelecaoDeUnidadesPorSlug`
  (`selecaoDeUnidades`, `selecaoDeUnidadesPorSlug`, `selecaoDeUnidadesSemPadrao`). A variante sem padrão transforma o
  slug do Consolidado no flag `incluiSemUnidade`. Os três nomes antigos viveram como invólucros `@deprecated` até o H4.
- **`src/lib/auth/papeis.ts`** — `unidadesMarcadasPorPadrao` (era `filtroFilialPadrao`) devolve a seleção com o modo
  nomeado, mantendo a trava pelo CARGO (nunca `escopoEscrita.length === 0`).
- **`filial.test.ts`** migrado caso a caso, mais os três casos-limite no nível do módulo e a propriedade "nenhuma
  seleção é lista vazia querendo dizer todas".

## Frente C — o vocabulário de escrita nas três camadas (`49b61c6`)

26 arquivos renomeados por script com mapa de ida e mapa inverso (27 no commit, com a evidência). `permissoes.test.ts`
teve a regex estendida a `escopo\w*` e ganhou a guarda de que `escopoEscrita.length` é detectado.

## Frente D — os slugs numa fonte só (`f926250`)

`src/lib/unidades/slugs.ts` (novo) com `FILIAL_TODAS`, `SLUG_CONSOLIDADO`, `SLUGS_RESERVADOS`; `slugs.test.ts` com trava
por AST. Os literais saíram de `url-params.ts`, `validators/admin.ts`, `queries/gerados.ts`, `actions/relatorios.ts`,
`relatorios/snapshot.ts`, `relatorios/pendencias.ts` e `papeis.ts`.

## Frente E — a identidade do ativo (`2d70cc8`)

`src/lib/ativos/identidade.ts` (novo), `identidade-sql.test.ts` (lê o corpo da `0099` e os índices da `0091` do disco,
com o corpus `'A😀'` para o prefixo por code point) e `identidade.test.ts` (acervo falso: mesma filial recusa, OUTRA
filial também recusa; guarda de régua única nas actions; presença do alcance nas três). `actions/ativos.ts`,
`actions/compras.ts` e `actions/devolucao-fornecedor.ts` delegam.

## Frente F — as 8 rotas (`0173575`)

`src/lib/unidades/pertinencia.ts` (novo, `server-only`), `pertinencia.test.ts` e `rotas.test.ts` (descoberta pelo disco,
`>= 8`). As sete rotas que abriam com qualquer valor chamam o helper; `/relatorios/[filial]` passou a usá-lo no lugar
da checagem própria.

## Frente G — a `chaveVersao` (`727b013`)

`chaveVersao` exportada de `src/lib/relatorios/versao-snapshot.ts` (usando `SLUG_CONSOLIDADO`), com o comentário do laço
com a F65; `chave-versao-sql.test.ts` lê a `0010` e a `0013`.

## Frente H — os lotes

- **H1 (`8ea5fcf`)** — `queries/relatorios/pendencias.ts` (`getPendencias(client, unidades)`),
  `queries/relatorios/snapshot.ts` (`getSnapshotRelatorioV2` recebe o `recorte`), `src/lib/queries/recorte-consulta.ts`
  (novo: `recortarPorUnidade`, `switch` exaustivo; `nenhuma` vira filtro garantidamente falso, nunca `in.()` vazio, que o
  PostgREST v14 não documenta) e os chamadores (`[filial]`, `actions/relatorios.ts`, dois scripts).
- **H2 (`053209e`)** — `queries/ativos.ts`, `movimentacoes.ts`, `itens.ts`, `pendencias-detalhe.ts`, `conflitos.ts`,
  `gerados.ts` com `unidades` obrigatório; as páginas calculam `efetivar(recorteDe(operador), seleção)`; o selo do layout
  e o card do painel também.
- **H3 (`2e97165`)** — `actions/exportar.ts` (os parsers de CSV reparseiam a URL pela mesma seleção, `filtrosHistorico`
  religado ao parser compartilhado de itens), `lib/itens/lista.ts` (`saldoDoRecorte`, `montarLinhasDeItem`).
- **H4 (`3504dd7`)** — as seis telas deixam a lista antiga (o estado de tela sai da vista); `lib/itens/escopo.ts`
  recebe as unidades (a interseção vazia deixa de afirmar "todas as filiais"); os invólucros transitórios saem; as
  prévias de `scripts/design/` compartilham `unidadesDaPrevia`. A trava de PRESENÇA entra em `recorte.test.ts`: toda
  chamada de `efetivar` recebe `recorteDe(…)` ou o parâmetro `recorte` (declarado `RecorteDeLeitura`), catraca de 14
  chamadas; `RECORTE_UNIVERSAL` não sai do módulo; `filtros/filial.ts` não tem `return []` nem os nomes antigos.

## Frente I — o fechamento

`package.json` 1.62.0; `CHANGELOG.md`; `src/lib/versoes/registry.ts`; atas em `docs/DECISOES.md`; `docs/ARQUITETURA.md`
§10 (sete linhas novas); `docs/README.md`; este relatório.

---

# 5. As nove decisões, e o custo que decidiu cada uma

A escolha e o motivo completos estão na ata `2026-09-14 · F57 · As nove decisões da fase`; aqui, o custo que pesou.

| # | Decisão | O custo que decidiu |
|---:|---|---|
| 1 | `RecorteDeLeitura` com `alcance` nomeado; `recorteDe({ papel } \| null)` | Receber `Operador` obrigaria telas a importar módulo `server-only`; lista vazia para "universal" seria o próprio valor proibido |
| 2 | Marca por `unique symbol` não exportado, dado sob a chave, por família | Marca por propriedade string (`__brand`) aceitaria objeto literal; as duas famílias juntas exigiriam id e slug em todo chamador |
| 3 | Flag `incluiSemUnidade` + modos `somente-sem-unidade` e `nenhuma` | Só flag deixaria `?filial=geral` como lista vazia com flag; só modo não expressaria `geral,bravo` |
| 4 | Rename nos três tipos; ficam `escreveNaFilial`, `filiaisParaEscrita`, `filiaisEscritaSchema` | Renomear o que continua verdadeiro custaria diff sem ganho e mexeria no formulário de vínculos |
| 5 | `slugs.ts` + trava por AST, com o discriminante `'todas'` isento | Um `grep` acusaria o `modo: 'todas'` das uniões; renomear o modo custaria a união inteira |
| 6 | Uma consulta de identidade, alcance por parâmetro, espelho do SQL travado | Três consultas divergindo é o defeito que a ficha apontava; o alcance num lugar só barateia a decisão i |
| 7 | Helper com consulta própria, `filiais` sem filtro de `ativo`, só quando há lista | Reusar a lista da página esconderia a desativada (a página carrega só as ativas); consultar sempre custaria uma ida ao banco por request |
| 8 | Lotes por superfície, chamador arrastado no mesmo commit; classificação por operação × client | Lote por arquivo quebraria o `tsc` entre commits; classificar por tabela ignoraria quem ignora RLS |
| 9 | `chaveVersao` exportada e travada; nada consertado | Consertar antecipa a F65 (índice novo) — fora de escopo; sem trava, a F65 quebraria a pista em silêncio |

---

# 6. As sete sabotagens, com saída real

Todas em `docs/f57-evidencias/`, cada uma restaurada byte a byte e seguida da rodada verde. Nenhuma tem dado real.

| # | Arquivo | O que prova |
|---|---|---|
| A | `sabotagem-A-tipo-nominal.txt` | **A.1:** objeto literal, `as` direto, `number[]`, `[] as` e a seleção convertida — o `tsc` recusa as **cinco** formas (TS2353, TS2352, TS2741, TS2352, TS2352). **A.2:** `efetivar` reescrita para ignorar o recorte → o teste de EFEITO fica vermelho (**5 falhas** de 12) |
| B | `sabotagem-B-lista-vazia.txt` | `[]` em cinco chamadas migradas ao mesmo tempo (`recortarPorUnidade` em `queries/ativos.ts`, `getPendencias`, o selo do layout, `listarRelatoriosGerados`, `escopoDosNumeros`) → **o `tsc` recusa as cinco**; restaurado, compila |
| C | `sabotagem-C-casos-limite.txt` | **C.1** tirar o terceiro valor → o Consolidado some de `/relatorios/gerados` no teste; **C.2** resolver slug/id pelas filiais ATIVAS → o caso da desativada fica vermelho; **C.3** trocar o gate de cargo por `escopoEscrita.length === 0` → admin/dev com escopo cheio passam a entrar recortados, vermelho; **C.4** tirar o fallback do operador sem vínculo → ele cai em "nenhuma", vermelho. Restaurado: verde |
| D | `sabotagem-D-identidade.txt` | **D.1** a guarda nasce vermelha contra o código de antes (3 falhas); **D.2** verde depois (13); **D.3** reintroduzir a consulta global inline em `compras.ts` → a guarda de régua única fica vermelha; **D.4** aplicar a decisão i na chamada da compra → a guarda de presença fica vermelha; **D.5** trocar o alcance da recusa manual por uma unidade → o EFEITO "outra filial também recusa" fica vermelho (3 falhas) |
| E | `sabotagem-E-rotas.txt` | **E.1** uma rota nova que lê `sp.filial` sem o helper → `rotas.test.ts` vermelho nomeando o arquivo; **E.2** removida, verde. **E.3** (depois da revisão adversarial) a rota nova lê `filial` por desestruturação → o detector fortalecido acusa o arquivo; **E.4** removida, verde |
| F | `sabotagem-F-slugs.txt` | `'geral'` num módulo de `src/lib/**` → a trava acusa; o MESMO literal num componente → ela não acusa (o escopo é `src/lib/**`) |
| G | `sabotagem-G-chave-versao.txt` | a chave TS vira `periodo\|filial` → `chave-versao-sql.test.ts` vermelho (2 falhas); restaurada, verde (7) |

E as provas que não são sabotagem: `frente-C-rename-puro.txt` (o mapa inverso devolve o HEAD em **26 de 26** arquivos;
zero nome antigo depois), `casos-limite-antes.md`/`-depois.md` (§7) e `contagem-final.txt` (§2).

---

# 7. A matriz de casos-limite, antes × depois

`src/lib/filtros/casos-limite.test.ts`, 16 combinações de cargo × vínculo × até 13 valores de parâmetro, em seis
superfícies (S1 por id, S2 por slug, S3 gerados, S4 aba padrão, S5 conferência, P pertinência). O ANTES foi gravado no
commit `89cafce`, antes de o primeiro byte de `filtros/filial.ts` mudar; o DEPOIS, depois do lote 4. **O diff inteiro
entre os dois arquivos são os cabeçalhos e estas quatro linhas da tabela P:**

| Rota | `inexistente` | `misto` (válido + inexistente) | `geral` |
|---|---|---|---|
| `/ativos` · `/movimentacoes` · `/itens` · `/itens/historico` | `abre` → **`404`** | `abre` → **`404`** | — |
| `/pendencias` | `abre` → **`404`** | `abre` → **`404`** | `abre` → **`404`** |
| `/relatorios/gerados` | `abre` → **`404`** | `abre` → **`404`** | `abre` (inalterado) |
| `/itens/conferencia` | `abre` → **`404`** | — | — |

Oito células, as oito declaradas em `MUDANCAS_DECLARADAS` antes do refactor. S1–S5 idênticas: o Consolidado continua
em gerados (sem param, `todas`, `geral`, `geral+valido`), a desativada continua recortando (`ids:5`, `slugs:extinta`,
`in(filial_id, [5])`), o operador sem vínculo e o só-desativada continuam em `todas` nas leituras e no
`aviso-sem-escrita` da conferência, e `fora-da-faixa`/`lixo` continuam caindo no padrão.

---

# 8. Os 28 critérios, autoverificados

| # | Critério | Veredito |
|---:|---|---|
| 1 | `lint`, `test`, `build` e `tsc` limpos | ✅ `fechamento-verificacao.txt`, saída inteira: lint e `tsc` limpos, 201 arquivos / 5.104 testes verdes, build limpo. A primeira rodada reprovou 1 teste por tempo-limite — consertado na causa (§9) |
| 2 | `recorte-leitura.ts` com `RecorteDeLeitura`, `recorteDe`, `efetivar` e o cabeçalho que explica hoje / virada / por que não é `return true` | ✅ cabeçalho, linhas 1–33 |
| 3 | `UnidadesEfetivas` nominal, com `@ts-expect-error` | ✅ `recorte.test.ts`; sabotagem A.1 |
| 4 | Nenhuma função exportada em `src/lib/**` devolve "sem recorte" como lista vazia | ✅ os 18 consumidores migrados (§2.1); propriedade em `filial.test.ts`; trava de `return []` em `recorte.test.ts`; revisão §9 (tipo e fail-open: 0 achados). Fora do alvo, com semântica OPOSTA (vazio = nenhuma): `cidadesDasFiliais`, `aplicarCargoEVinculos` (`PLAN-F57.md` §6) |
| 5 | `filtros/filial.ts` devolve `SelecaoDeUnidades`; os dois `return []` não existem | ✅ trava em `recorte.test.ts` |
| 6 | Os três casos-limite, antes e depois | ✅ §7 e sabotagem C — com a divergência do "⚠", que só existe na escrita (§3) |
| 7 | Nomes novos nas três camadas; nenhum antigo sobrevive sem justificativa | ✅ §2.2 — o que sobrou são dois comentários de história e a regex da trava; ficam por decisão `escreveNaFilial`, `filiaisParaEscrita`, `filiaisEscritaSchema` |
| 8 | `Operador.escopoEscrita` e `Permissoes.escopoEscrita` `readonly` e casados | ✅ `auth/acesso.ts:27` e `components/layout/permissoes.ts:27`, os dois `readonly number[]`; revisão §9 |
| 9 | A Frente C é rename puro, com prova | ✅ `frente-C-rename-puro.txt` (26/26) |
| 10 | `slugs.ts` é a única fonte de `'geral'`/`'todas'` em `src/lib/**`, allowlist nominal | ✅ `slugs.test.ts`; sabotagem F |
| 11 | `ajuda/registry.ts` intocado; os dois módulos com o comentário do homônimo | ✅ `contagem-final.txt` §4 (nenhum commit o tocou); o comentário está em `slugs.ts` e `validators/admin.ts` (§3) |
| 12 | `identidade.ts` existe; `compras.ts` e `ativos.ts` consomem a mesma régua | ✅ as duas e `devolucao-fornecedor.ts`; guarda de régua única (D.3) |
| 13 | Compra repetida em OUTRA filial passa; na MESMA é recusada com a mensagem de hoje; teste nasceu vermelho | ❌ **não cumprido, por decisão** — a outra filial continua recusada (spec §10.2; roteiro item 1). A metade da MESMA filial ✅ com a mensagem de hoje; os testes nasceram vermelhos (D.1) |
| 14 | As 8 rotas chamam o helper; `rotas.test.ts` `>= 8` por varredura | ✅ sabotagem E (E.1; e E.3, com o detector fortalecido pela revisão) |
| 15 | Id inexistente → `notFound()`; slug desativado recorta; id de outra filial ativa abre | ✅ §7; `pertinencia.test.ts` |
| 16 | `/itens/conferencia` cai no seletor para filial que existe e o cargo não escreve | ✅ §7, S5 idêntica (`operador · um` com `outra-ativa` → `seletor`) |
| 17 | `chave-versao-sql.test.ts` lê o SQL e reprova divergência | ✅ sabotagem G |
| 18 | Inventário com os call-sites medidos, classificação e justificativa; soma bate | ✅ 115 + 13; `contagem-final.txt` §2 (zero divergência por arquivo) |
| 19 | Nenhuma migration criada ou tocada; lock intacto | ✅ `contagem-final.txt` §4 |
| 20 | Nenhuma tela ou texto de operador mudou além do critério 15 | ✅ §7; revisão §9 (nenhum literal de tela mudou no diff de `src/app`/`src/components`) |
| 21 | Nenhum cargo passou a ver menos | ✅ recorte universal; S1–S4 idênticas; revisão §9 (as 8 rotas, o CSV, o selo, o painel e os relatórios) |
| 22 | `verificar:actions` e `db:test:mutations` verdes | `verificar:actions` ✅ (39 chunks, verde); `db:test:mutations` ✅ no `banco-sem-docker` do PR #46 (run `34887305598`): **74/74 detectadas pelo cenário nomeado, 2 em quarentena** — os mesmos números da F56, ou seja, não se mexeu; com o gate de deriva (34 relações · 312 colunas · 75 funções) e os 34 roteiros (818 asserções) iguais. `ci-pr46.txt` |
| 23 | `1.62.0`, CHANGELOG, registry, tag anotada | ✅ versão · ⏳ tag — `package.json`, `CHANGELOG.md` e `registry.ts` em 1.62.0 (`registry.test.ts` e `cobertura-changelog.test.ts` verdes). A tag anotada `v1.62.0` vai no commit de merge do PR #46, publicada com `git push origin v1.62.0` — depois deste commit, que não pode conter o próprio merge (§13) |
| 24 | Ata datada em `DECISOES.md` | ✅ sete atas "2026-09-14 · F57": a decisão i, as nove decisões, as divergências, as correções do caminho, a revisão adversarial, o tempo-limite e o fechamento |
| 25 | Este relatório, com o roteiro no topo | ✅ |
| 26 | PR mergeado com `verificar` e `banco-sem-docker` verdes | ⏳ **pendente no momento deste commit** — os dois checks verdes no PR #46 (run `34887305598` sobre `8d2d6cc`, o código final); o merge acontece depois deste commit, que só acrescenta o relatório e a evidência do CI, e só com os dois checks verdes também sobre ele. Confirmado na resposta final da sessão (§13) |
| 27 | `ARQUITETURA.md` §10 e `README.md` com os módulos novos | ✅ |
| 28 | Nenhum dado real | ✅ `contagem-final.txt` §5 |

---

# 9. A revisão adversarial final

Seis revisores em contexto fresco, um por grupo de critérios, cada um com as perguntas da seção "Como trabalhar" da
ordem e com a lista das divergências já declaradas, proibidos de editar arquivo e de tocar banco; cada achado passou por
um cético instruído a refutá-lo. Workflow `f57-revisao-adversarial`: 7 agentes, 303 chamadas de ferramenta.

| Dimensão | Critérios | O que o revisor conferiu (resumo dele) | Achados |
|---|---|---|---:|
| tipo e fail-open | 2–5 | nenhum `as`/`as unknown as` de `UnidadesEfetivas` fora do módulo, nem cópia do símbolo por spread, `Object.assign` ou JSON; nenhum `return []` exportado com sentido de "tudo" em `src/lib/**`; os quatro modos de `recortarPorUnidade`; as travas de presença; 138/138 testes da dimensão | 0 |
| casos-limite e leitura | 6, 15, 16, 20, 21 | `main` × HEAD nos módulos centrais, nas 8 rotas, no CSV, no selo, no painel e nos relatórios; o diff das matrizes é exatamente o de `MUDANCAS_DECLARADAS`; nenhum literal de tela mudou no diff de `src/app`/`src/components`; 4 + 153 + 68 testes | 0 |
| rename, slugs e registry | 7–11 | `git show 49b61c6` arquivo a arquivo: só identificadores e comentários; `readonly number[]` nos dois tipos; cada `todas` restante em `src/lib/**` dentro da isenção de discriminante; nenhum commit tocou `ajuda/registry.ts` | 0 |
| identidade | 12, 13 | as três actions comparadas com a `main`: a mesma régua, mensagens idênticas caractere a caractere, `trim` e "patrimônio vazio = null" preservados; zero consulta de patrimônio/service tag fora do módulo; 71/71 testes | 0 |
| rotas e `chaveVersao` | 14–17 | as 8 rotas chamam o helper antes de ler; desativada, outra filial e o Consolidado não recebem 404; lixo não consulta; erro de consulta lança; o client certo nas rotas de relatório; 19/19 testes | 1, refutado |
| inventário e escopo | 18, 19, 22, 28 | varredura independente: 115 em 21 arquivos, igual linha a linha; os 13 dinâmicos; ~15 linhas conferidas contra o código; a régua de classificação sem exceção; 38 call-sites em `scripts/`; nenhum teste existente afrouxado; nenhum dado real | 0 |

**O único achado, e o que virou.** O revisor de rotas reproduziu que o detector de `rotas.test.ts` não reconhecia
`filial` lido por desestruturação (`const { filial } = await searchParams`), por `props.searchParams` nem por
`(await searchParams)?.filial` — uma rota nova escrita assim, sem o helper, passaria. O cético o refutou como defeito da
fase: nenhuma das 8 rotas usa essas formas, e o plano declarava exatamente as formas cobertas. **Consertei assim mesmo**,
porque a pergunta da ordem é justamente "o `rotas.test.ts` quebraria com uma rota nova?", e fortalecer uma trava custa
pouco: o leitor passou a reconhecer as três formas, a guarda do próprio teste ganhou os quatro casos e um negativo, e a
sabotagem **E.3** prova, com uma rota temporária por desestruturação, que a trava fica vermelha nomeando o arquivo
(E.4: removida, verde). O que continua fora do alcance da varredura — o objeto de search params passado a OUTRA função
que lê `filial` lá dentro — está escrito no cabeçalho do teste. Ata: `2026-09-14 · F57 · A revisão adversarial final`.

**E o que a verificação do fechamento achou depois dela.** A primeira rodada completa reprovou **1 de 5.104** testes por
tempo-limite: `chave-versao-sql.test.ts` levou 10.198 ms num `it` que, sozinho, leva 136 ms. A causa era do próprio teste:
`vigenteCom` relia e normalizava as 140 migrations a cada chamada, uma delas dentro do corpo do `it`, e sob a carga da
suíte inteira isso passou dos 5 s. **Consertado na causa** — a pasta é lida uma vez, na coleta, e o teste caiu para 2 ms
—, **sem subir o tempo-limite e sem rodar de novo até passar**. A mesma classe (varredura de disco dentro de um `it`)
foi fechada nos outros cinco testes da fase que a tinham (`recorte`, `rotas`, `slugs`, `identidade`,
`identidade-sql`), com as asserções intactas. A segunda rodada é a que está em `fechamento-verificacao.txt`; a ata é
`2026-09-14 · F57 · A verificação do fechamento reprovou por tempo-limite`.

**E a checagem factual dos documentos, antes do último commit.** Sete checadores em contexto fresco conferiram cada
número, caminho, linha, hash e run deste relatório, das atas, do CHANGELOG, do registry, da `ARQUITETURA.md` e do índice
contra o disco, o git e as evidências; cada divergência passou por um cético. **Cinco mantidas, uma refutada — as cinco
corrigidas neste commit:** o roteiro atribuía à sabotagem D.4 a queda dos testes de presença E de efeito (a D.4 derruba só
o de presença; o de efeito é a D.5); "18 funções em 8 arquivos" são 18 em **9** (o erro veio do §1 do plano, que não se
reescreve); a conta dos 90 testes somava 89 (o 90º é o que `servidor-apenas.test.ts` gera para `recorte-consulta.ts`); o
critério 24 dizia "quatro atas" e são **sete**; e o critério 26 estava marcado ✅ antes do merge — agora ⏳, como o fato é.
A refutada: a leitura de "fechamento" na ordem de reversão, que abrange os três commits do fechamento.

---

# 10. O que este relatório NÃO prova

1. **O tipo nominal impede o fail-open FUTURO; ele não prova que nenhum call-site de hoje já estava errado.** O
   inventário é a lista de suspeitos para as fases de `empresa_id`, não o veredito — e as leituras que não passam por
   filtro de filial (a maioria dos 128) não passam por `UnidadesEfetivas` e não ganharam trava nenhuma aqui.
2. **A recusa de filial inexistente foi provada em teste** (a matriz, `pertinencia.test.ts`, `rotas.test.ts`), **não
   contra um link antigo real de alguém**, e não no ensaio — a fase não rodou a aplicação contra banco nenhum.
3. **A régua da compra foi provada por teste, com acervo falso.** Como a decisão i não foi aplicada, não existe "primeiro
   lote real de compra com patrimônio repetido entre filiais" a esperar; o que falta de prova real é o contrário — que
   nenhuma compra de produção tenha passado a ser recusada por engano pela régua unificada, e isso só o uso mostra.
4. **O inventário classifica por LEITURA do código de 14/09/2026.** A F63 pode discordar de linhas dele; as quatro
   chamadas dinâmicas fora de `import-logs.ts` foram rastreadas à mão, sem a verificação adversarial dupla das outras.
5. **O caminho restrito de `efetivar` só existe em teste.** Nenhuma sessão de hoje produz um recorte restrito; o que
   ele fará com dado real só a F70/F72 mostra.
6. **O smoke da ficha não foi rodado** (§3), e `db:test:mutations` não roda nesta mesa — ele cria bancos descartáveis
   num Postgres, e a ordem proíbe escrever em qualquer banco. Quem prova que ele não se mexeu é o `banco-sem-docker` do
   CI.
7. **O custo da consulta de pertinência não foi medido** (TTFB). Ela é uma ida ao banco a mais, só quando a URL traz
   uma lista de filiais.
8. **A trava de presença confia no NOME do parâmetro.** Ela aceita `efetivar(recorte, …)` quando o arquivo declara
   `recorte: RecorteDeLeitura`; um `recorte` que viesse de `RECORTE_UNIVERSAL` por outro caminho passaria — a trava
   que proíbe `RECORTE_UNIVERSAL` fora do módulo é a segunda linha contra isso.

---

# 11. Pendências e backlog nomeado

## Para a F58 — as assinaturas que esta fase mudou

A F58 muda o RETORNO; a F57 mudou a ENTRADA. As 19 funções abaixo passaram a receber `UnidadesEfetivas` (ou o
`RecorteDeLeitura`) e são a entrada dela:

- `queries/ativos.ts` — `listarAtivos`, `listarAtivosParaExport` (`ListarAtivosParams.unidades`)
- `queries/movimentacoes.ts` — `listarMovimentacoes` (`params.unidades`)
- `queries/itens.ts` — `getSaldosItensDeFiliais(unidades)`, `getHistoricoLancamentos` e `listarHistoricoParaExport`
  (`FiltrosHistorico.unidades`)
- `queries/pendencias-detalhe.ts` — `contarPendenciasAbertas(unidades)`, `listarPendencias` e
  `listarPendenciasParaExport` (`FiltrosPendencias.unidades`)
- `queries/conflitos.ts` — `contarGruposConflito(client, unidades)`, `contarConflitosAbertos(unidades)`,
  `listarConflitos({ unidades, q, page })`, `listarConflitosParaExport({ unidades, q })`
- `queries/gerados.ts` — `listarRelatoriosGerados(client, unidades, opcoes)`
- `queries/relatorios/pendencias.ts` — `getPendencias(client, unidades)`
- `queries/relatorios/snapshot.ts` — `getSnapshotRelatorioV2(client, recorte, …)`
- `lib/itens/lista.ts` — `saldoDoRecorte(linha, unidades)`, `montarLinhasDeItem({ unidades, … })`
- `lib/itens/escopo.ts` — `escopoDosNumeros(filiais, unidades)`

`getSaldosItens(filialId | null)` e `filialParaRpc` ficaram de fora de propósito (UMA filial, `null` = consolidado — é
da F58). E `versao-snapshot.ts:44` (a ficha diz `:43`; a linha andou uma) casa a violação pelo NOME do índice — está na
lista do `erros.ts` enumerável da F58.

## Para a F65

- **A `chaveVersao` ganha `empresa_id` junto com o índice recriado.** Hoje ela é `periodo_de|periodo_ate|filial` (com o
  slug do Consolidado para `null`); consolidado de duas empresas na mesma semana produziria a chave idêntica.
- **`ehViolacaoDeVersao` (`src/lib/relatorios/versao-snapshot.ts:44`) casa pelo NOME
  `relatorios_gerados_periodo_filial_versao_uidx`.** Recriar o índice com outro nome mata essa pista em silêncio; o
  `chave-versao-sql.test.ts` desta fase reprova quando a `0013` deixar de ser a fonte do índice, mas a F65 precisa mudar
  os dois lados no mesmo commit.

## Para a F70/F72 — o que muda lá, em linhas

- **`recorteDe`** (`src/lib/auth/recorte-leitura.ts:79-84`): o corpo tem **2 linhas de código** hoje
  (`void sessao` e `return RECORTE_UNIVERSAL`). Elas viram a leitura das unidades da empresa da sessão. O tipo
  `SessaoDoRecorte` (hoje `{ papel }`) cresce com o que identifica a empresa, e há três formas de chamador a decidir:
  `operador` (as páginas), `{ papel: aut.papel }` (`actions/relatorios.ts`) e `null` (o visualizador por senha e os
  scripts) — o que `null` recebe na virada é decisão da F70/F72.
- **`efetivar`** (`:200-234`, com `intersectar` em `:154-179`): **zero linhas** precisam mudar. A interseção já é real e o
  caminho restrito já é testado por EFEITO.

## O que o inventário classificou como "precisa de `empresa_id` explícito"

**16**, por fase de destino: **F63: 4** (os INSERT/UPSERT, que perdem o default da coluna) · **F68: 12** (leituras por
service role alcançáveis pelo visualizador por senha). A lista nominal, com arquivo, linha e porquê, está em
`docs/INVENTARIO-LEITURAS.md`. Os 112 "confia na RLS" dividem-se em F66: 102 e F67: 10.

## Achados fora do escopo, nomeados (`PLAN-F57.md` §8)

- **`ehFiltroDeFilial` na família por id:** `?filial=abc` em `/ativos` faz a tela dizer que há filtro e aplica o padrão
  do cargo.
- **`typeof sp.filial === 'string'` em `/relatorios/gerados`:** um parâmetro `filial` repetido na URL é descartado em vez
  de somado.
- **A ambiguidade do separador `::` em `chavePatrimonio`** do motor de import (o espelho SQL da `0099` usa prefixo de
  comprimento; o do import não).

---

# 12. Escopo e segurança — as varreduras finais

Saída inteira em `docs/f57-evidencias/contagem-final.txt` §4–§5, medida na árvore de trabalho do fechamento.

- **Nada fora do escopo.** `git diff --stat main -- supabase .github src/lib/ajuda/registry.ts package-lock.json '.env*'`
  vazio; nenhum commit da fase tocou `supabase/`, `.github/` ou `ajuda/registry.ts`; `package.json` mudou só em
  `version` (1.61.0 → 1.62.0); nenhuma dependência nova; `supabase/migrations.lock.json` intacto. Nenhum `empresa_id`,
  nenhuma rota ou URL nova — a rota temporária da sabotagem E.3 foi criada e removida na mesma execução, conferido por
  `git status`. `git diff --shortstat main...HEAD` antes dos commits do fechamento: 88 arquivos, 11.694 inserções, 513
  remoções.
- **Nenhum valor de credencial.** Zero ocorrência de padrão de token (JWT, chave publicável/secreta, token de acesso) nos
  arquivos que a fase criou ou mudou.
- **Nenhum dado real.** Patrimônios nas linhas acrescentadas: só `WAP0001234` (o fictício canônico) e `WAP0009999`
  (fictício desde a F23 — o `RELATORIO-F23.md` o declara assim —, já usado por seis testes da `main`). Nenhum e-mail. As
  filiais das fixtures são `alfa`/`bravo`/`charlie`/`delta`/`extinta`, e os ids, 1 a 5, 77 e 9999.

---

# 13. O fechamento

**O PR.** [PR #46](https://github.com/vmatusita/ti-wap-inventory-control/pull/46), aberto com os 18 commits da tabela do
§2.3: a ordem, a matriz ANTES, as sete frentes A–G, os quatro lotes da H, o inventário, as sabotagens B e C e os três do
fechamento. Um push só antes do CI, sem rodada intermediária para "ver se passa" — lint, `tsc`, a suíte inteira e o
build rodaram na mesa antes (`fechamento-verificacao.txt`).

**O CI.** Run `34887305598`, head `8d2d6cc` — `verificar` verde em 3m21s (lint, 201 arquivos / 5.104 testes, typecheck,
contraste, build, `verificar:actions`) e `banco-sem-docker` verde em 1m43s (gate de deriva 34 · 312 · 75, 34 roteiros com
818 asserções, injetor 74/74 com 2 em quarentena). Os trechos estão em `docs/f57-evidencias/ci-pr46.txt`. O único
comentário no PR foi o aviso automático da prévia da Vercel, sem nada a responder.

**O que vem depois deste commit, e por que ele não o contém.** Este commit acrescenta só este relatório preenchido e a
evidência do CI; os dois checks rodam de novo sobre ele, e **o merge só acontece com os dois verdes nesse head**. A tag
anotada `v1.62.0` vai no commit de merge e é publicada com `git push origin v1.62.0`. O deploy é o automático da Vercel no
merge; **esta fase não confere nada em produção** (a ordem proíbe rodar qualquer coisa lá) — o item 2 do roteiro do Johnny é
o olho humano que falta. O merge, o commit de merge e a tag são confirmados na resposta final da sessão. A ata
`2026-09-14 · F57 · fechamento` de `docs/DECISOES.md` foi escrita ANTES do merge e registra o plano, não o resultado; ela
não se reescreve depois — se o merge trouxer algo a registrar, isso vai numa ata nova, por PR.

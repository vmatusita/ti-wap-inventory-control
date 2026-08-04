# Relatório da F25 — celular com campos próprios, cidade do termo por filial e filtro de filial com padrão por cargo

> Ordem: [`prompts/F25-celular-cidade-filtros-ultracode.md`](prompts/F25-celular-cidade-filtros-ultracode.md) (04/08/2026, Johnny).
> Execução autônoma (modo do `CLAUDE.md`), orquestração multiagente.
> Baseline: `bb426ca` (topo da `main` ao fim da F24) · Entrega: `7547416`.
> **Em produção desde 04/08/2026** (deploy pela `main`, smoke pós-deploy verde).

---

## 1. O que mudou, e por quê

Três melhorias de uso, independentes entre si, entregues na mesma ordem.

### (A) O celular deixou de morar num campo de texto livre

Nº do telefone, IMEI e Pulsus viviam soltos em `ativos.observacoes` e eram **redigitados a cada termo** — o mesmo aparelho tem o mesmo IMEI a vida inteira. A decisão §3.6 do `PLANO-TERMOS` (14/07) os fixara como manuais porque "não existem no ativo"; agora existem (migration `0101`).

Aparecem no cadastro, na edição e na ficha **só quando a categoria é celular**, entram no CSV de ativos e **pré-preenchem** o termo de responsabilidade de celular. Continuam 100% editáveis no diálogo, e editar o termo segue **não** alterando o cadastro (regra §3.9 do plano, intacta).

**Onde eles NÃO entram, e por quê.** No cadastro em **lote** somem. Não existe formulário "single" neste app: todo cadastro é lote, e os campos de "Dados do modelo" são **compartilhados por todas as unidades**. Um campo compartilhado gravaria o **mesmo IMEI em vinte celulares** — corrupção silenciosa de dado. Com 2+ unidades a tela explica que se preenche na ficha. Pela mesma razão, "Comprar outro igual" e "Repetir última compra" **não** os copiam: eles identificam a unidade, como patrimônio e service tag, que o formulário já excluía por escrito no banner.

**Como são gravados.** Por `UPDATE` **depois** da RPC `criar_compra_lote`, não dentro dela. A RPC lê chaves **nominais** do jsonb `p_itens`: acrescentar as novas sem recriá-la seria um **no-op silencioso** — a tela "funcionaria" e o aparelho nasceria sem IMEI. Recriar a RPC dispararia a regra F17 do runbook (rodar TODOS os roteiros SQL) e contraria o §1.3 da própria ordem. Preço aceito e registrado: o UPDATE está fora da transação da compra; se falhar, o ativo existe e os campos ficam vazios (a ficha os oferece), e o erro é **logado sem derrubar o cadastro** — devolver falha faria o operador repetir uma compra que já aconteceu.

### (B) A cidade do termo saiu do template e foi para a filial

Os 7 modelos cravavam "São José dos Pinhais" na linha da assinatura — errado para Linhares, Serra e Eusébio. `filiais` ganhou `cidade` (migration `0102`, semeada **por slug**, não por id: id de filial não é garantido igual entre os bancos) e a linha virou `{cidade}, {data_extenso}`, preenchida pela filial corrente do(s) ativo(s) e editável no diálogo.

Isso responde a **pergunta aberta nº 4** do `PLANO-TERMOS` §10, de 14/07/2026.

**A cláusula de foro ficou intocada** ("Comarca de São José dos Pinhais/PR") — decisão explícita do Johnny: a linha da assinatura diz **onde se assinou** e varia; o foro é escolha **jurídica**, ligada à sede.

**O buraco fechado no caminho.** `renderizarDocx` usa `nullGetter: () => ''`: chave ausente rende **vazio**. Nenhum termo salvo antes desta fase tem `cidade` no jsonb — reabrir um deles traria o campo em branco e o documento sairia **começando por vírgula**. O diálogo passou a mesclar o preparado **sob** o snapshot: o snapshot manda nas chaves que tem, e o que ele não trouxe vem do cadastro. Cidade salva vazia continua vencendo (é edição deliberada, não ausência).

### (C) Filtro de filial: multi-seleção com padrão por cargo

Em `/ativos`, `/movimentacoes`, `/itens`, `/pendencias` e `/relatorios/gerados` o seletor virou **painel de caixas** (o padrão do filtro de Status, que já era o precedente de multi da casa). O **Operador** entra com **todas as filiais vinculadas a ele** já marcadas; nível administrador, dev e consulta continuam com todas. Em `/relatorios` o operador cai na **aba da filial dele** (a 1ª alfabética, quando são várias); `/itens` abre na visão **"Por filial"** para todos.

**O ponto sutil foi a URL.** O param `filial` ganhou **três** estados, e não dois:

| na URL | significa |
|---|---|
| ausente | o **padrão do cargo** |
| `filial=todas` | sem recorte (sentinela **explícita**) |
| `filial=2,3` | essas filiais — **igual para qualquer cargo** |

Sem a sentinela o operador não teria como pedir "todas": a ausência já é o padrão dele. Consequência **aceita e registrada**: um link **sem** o param muda de sentido conforme quem abre (para admin/consulta nada mudou; para o operador, um bookmark antigo passa a abrir recortado). Link com `?filial=` explícito abre idêntico para todo mundo.

A regra mora num lugar só (`filtroFilialPadrao`/`abaRelatorioPadrao`, com teste próprio) e nenhuma tela a reimplementa. Ela decide pelo **cargo**, nunca por "lista de vínculos vazia" — que significa duas coisas diferentes (consulta, que não escreve em lugar nenhum, e operador sem vínculo válido, um usuário quebrado que veria a tela sempre vazia sem nenhuma pista).

**Duas contas que a multi-seleção quebrava em silêncio:**

1. A **contagem de conflitos** usava um `count/head` barato apoiado no invariante da F24 "um grupo tem no máximo UM lado por filial" — que vale **por filial**. Com duas marcadas, um grupo com lados nas duas seria contado **duas vezes** e o chip anunciaria o dobro do trabalho. Passou a contar **chaves distintas** (custo medido: 282 lados / 137 grupos em produção, uma requisição na prática).
2. Os **saldos de `/itens`** vêm de uma RPC que aceita **uma** filial ou NULL: 2+ viraram N leituras somadas em memória por função pura testada, **sem tocar RPC nenhuma**. E o rótulo do CSV de saldos, que carimbava "Consolidado", passou a **nomear as filiais somadas** — senão o arquivo mentiria por omissão.

**Nenhuma permissão mudou.** Filtro é **leitura**: os selects de escrita seguem recortados por `filiaisParaEscrita`, RLS e policies intocadas, nenhuma migration de permissão. O **visualizador por senha** não tem cargo e não passa pelo padrão.

---

## 2. Checklist da ordem — autoverificado item a item

### Critérios de aceitação

| # | Critério | Situação | Prova |
|---|---|---|---|
| 1 | **Celular**: cadastro single, edição e ficha exibem os 3 só para celular; termo pré-preenchido e editável; snapshot grava o que saiu | ✅ | `preparo.test.ts` §`camposFaltantesDoTermo` prova que notebook/monitor/desktop **não** cobram IMEI; render condicional em `nova-compra-form.tsx`, `editar-ativo-dialog.tsx` e `ativos/[id]/page.tsx`; smoke `ativos · campos do celular (F25)` |
| 2 | **Cidade**: termos das 5 filiais saem com a cidade certa; foro byte a byte intocado; lote misto e filial sem cidade avisam; termo antigo regenerado sai com cidade | ✅ | render dos **7 modelos × 4 cidades** (28 assinaturas conferidas) + conferência do foro; `preparo.test.ts` (10 casos de cidade, incluindo o lote misto **com** a primeira filial sem cidade) |
| 3 | **Multi-seleção** nas 5 telas; lista, contagens, paginação e CSV respeitam a mesma seleção; URL compartilhável | ✅ | `.eq`→`.in` nos 8 pontos; tela e export chamam a **mesma** `resolverFiliais*`; smoke `/ativos?filial=1,2`, `?filial=todas`, `?filial=abc,99999` |
| 4 | **Padrões por cargo** provados no ensaio com operador fictício de Serra+Linhares | ⚠️ **parcial** | as regras estão provadas por **teste** (`filial.test.ts`, 38 casos, os 4 cargos × com/sem vínculo). O exercício **ponta a ponta com um operador logado** não foi feito — ver §6 e o roteiro manual |
| 5 | **Nada de permissão mudou** | ✅ | nenhuma migration de policy; `filiaisDeEscrita` intocada; `git diff` dos selects de escrita vazio |
| 6 | **Sem regressão**: import byte a byte, snapshots antigos, termo não-celular, visualizador, advisors | ✅ | diff do motor do import **vazio** (só anotação de tipo, apagada no build); `getPendencias` traduzida no `snapshot.ts` sem mudar a forma do jsonb; advisors sem WARN novo |
| 7 | **Portões**: lint, test, build, `database.ts`, migrations nos dois bancos, deploy + smoke | ✅ | ver §3 |
| 8 | **Docs**: spec, PLANO-TERMOS, MATRIZ-REGRAS, ajuda, DECISOES, CHANGELOG, README, prompts/README, este relatório | ✅ | ver §5 |

### Escopo — o que a ordem mandou NÃO tocar

| Item | Situação |
|---|---|
| Import de startup (layout, motor, RPCs, telas) | ✅ diff do motor **vazio**; só o tipo `Filial` → `Pick<Filial,…>` em `actions/importar.ts` e no wizard |
| Cláusula de foro | ✅ intocada nos 7; contada antes/depois e conferida no render |
| Snapshots congelados | ✅ forma do jsonb inalterada |
| Relatório multi-filial somado | ✅ não entrou (backlog) |
| Visualizador por senha | ✅ não tem cargo, não passa pelo padrão; destino segue o Consolidado |
| RLS, policies, cargos, vínculos | ✅ nenhuma migration de permissão |
| Selects de ESCRITA | ✅ `filiaisParaEscrita` intocado |
| Zona destrutiva / mesa de conflitos (F23/F24) | ✅ só a **contagem** por filial mudou, e para ficar correta com multi |
| Dependência nova | ✅ nenhuma |
| `src/components/ui/**` | ✅ intocado |
| Migração das observações para os campos novos | ✅ **não feita** — 0 ativos com os campos preenchidos nos dois bancos |

---

## 3. Evidências (saídas reais)

### 3.1 Baseline — medida ANTES de qualquer mudança

```
$ npm run lint
> eslint
(sem saída = limpo)

$ npm run test
 Test Files  79 passed (79)
      Tests  1697 passed (1697)

$ npm run build
✓ Generating static pages using 7 workers (27/27)
(exit code 0)
```

### 3.2 Portões ao fim

```
$ npm run lint
> eslint
(sem saída = limpo)

$ npm run test
 Test Files  82 passed (82)
      Tests  1777 passed (1777)

$ npm run build
✓ Compiled successfully in 19.8s
```

**+80 testes** (1697 → 1777), **+3 arquivos** de teste.

### 3.3 Migrations — aplicadas e verificadas nos DOIS bancos

`0101_celular_campos_proprios.sql` e `0102_filial_cidade.sql`, ambas **aditivas** (caminho A do runbook). Ensaio (`sgmvldiizsrjbxzzpmhh`) primeiro, produção (`pbtjcalbmepmrqzprusb`) depois.

**Verificação pós-apply — ENSAIO:**

```
filiais:
 1 | matriz         | Matriz          | São José dos Pinhais
 2 | cd-afonso-pena | CD Afonso Pena  | São José dos Pinhais
 3 | linhares       | Linhares        | Linhares
 4 | serra          | Serra           | Serra
 5 | eusebio        | Eusébio         | Eusébio

colunas novas de ativos:
 imei     | text | YES
 pulsus   | text | YES
 telefone | text | YES
```

**Verificação pós-apply — PRODUÇÃO:**

```
filiais:
 1 | matriz         | Matriz          | true  | São José dos Pinhais
 2 | cd-afonso-pena | CD Afonso Pena  | true  | São José dos Pinhais
 3 | linhares       | Linhares        | true  | Linhares
 4 | serra          | Serra           | true  | Serra
 5 | eusebio        | Eusébio         | true  | Eusébio
 6 | nova-teste     | Nova teste      | false | ''          ← INATIVA, vazia de propósito

colunas_celular | ativos_com_campo_preenchido | total_ativos | filiais_com_cidade | total_filiais
              3 |                           0 |         1708 |                  5 |             6
```

O **0** da segunda coluna é a prova de que a fase **não fez backfill** de `observacoes` — decisão registrada.

**Advisors (produção, após o apply):** nenhum WARN novo. Os presentes são os de sempre — as RPCs `security definer` chamáveis por `authenticated` (por desenho, guarda por dentro), as 4 tabelas com RLS sem policy e o `leaked password protection` desligado (backlog aberto desde 21/07). Nada relacionado a `ativos.telefone/imei/pulsus` nem a `filiais.cidade`.

**`db:types`** regenerado com a CLI fixada (2.109.1). O diff trouxe as 4 colunas novas e, de brinde, duas funções da F24 (`digest_selecao_conflito`, `exigir_identidade_livre_na_filial`) que a geração anterior não capturara — deriva pré-existente, agora corrigida.

### 3.4 Retag dos 7 modelos — a fidelidade é provada, não prometida

A linha da assinatura é um **run único** nos 7 modelos (medido antes de tocar em qualquer coisa) — ou seja, **não havia mesclagem de runs a fazer**, que é a armadilha clássica do retag do Word descrita no `PLANO-TERMOS` §6.1.

```
$ node scripts/termos/retaguear-cidade.mjs
✓ devolucao-desligamento.docx      "São José Dos Pinhais, {data_extenso}" → "{cidade}, {data_extenso}" | foro intacto (0) | 33 partes, 1 divergente
✓ devolucao-equipamento.docx       "São José Dos Pinhais, {data_extenso}" → "{cidade}, {data_extenso}" | foro intacto (0) | 33 partes, 1 divergente
✓ responsabilidade-celular.docx    "São José dos Pinhais, {data_extenso}" → "{cidade}, {data_extenso}" | foro intacto (1) | 42 partes, 1 divergente
✓ responsabilidade-desktop.docx    …                                                                   | foro intacto (1) | 40 partes, 1 divergente
✓ responsabilidade-monitor-homeoffice.docx …                                                           | foro intacto (1) | 38 partes, 1 divergente
✓ responsabilidade-monitor-interno.docx …                                                              | foro intacto (1) | 42 partes, 1 divergente
✓ responsabilidade-notebook.docx   …                                                                   | foro intacto (1) | 42 partes, 1 divergente
```

A prova que vale é **"1 divergente"**: de 33–42 partes do pacote `.docx`, **apenas `word/document.xml`** mudou, e dentro dele a volta (`{cidade}` → texto original) reconstrói o arquivo byte a byte.

**Render com payload 100% fictício — 7 modelos × 4 cidades:**

```
CIDADE = Linhares
  ✓ devolucao-desligamento.docx      assinatura: "Linhares, 4 de agosto de 2026."
  ✓ responsabilidade-celular.docx    assinatura: "Linhares, 4 de agosto de 2026"
  … (28 renders no total, 0 falhas)
```

**Cláusula de foro no documento RENDERIZADO** (conferência independente do script):

```
  ✓ devolucao-desligamento.docx      foro presente=false (esperado=false)
  ✓ devolucao-equipamento.docx       foro presente=false (esperado=false)
  ✓ responsabilidade-celular.docx    foro presente=true  (esperado=true)
  ✓ responsabilidade-desktop.docx    foro presente=true  (esperado=true)
  ✓ responsabilidade-monitor-homeoffice.docx foro presente=true (esperado=true)
  ✓ responsabilidade-monitor-interno.docx    foro presente=true (esperado=true)
  ✓ responsabilidade-notebook.docx           foro presente=true (esperado=true)
```

Os 2 de devolução nunca tiveram a cláusula — o "false" ali é o correto, não uma perda.

### 3.5 Import intocado — a prova é o tipo

```
$ git diff --stat bb426ca..HEAD -- src/lib/import/ scripts/import/ src/lib/validators/importar.ts
(vazio)

$ git diff bb426ca..HEAD -- src/lib/actions/importar.ts src/components/admin/importar/
-  filial: Filial
+  filial: Pick<Filial, 'id' | 'slug' | 'nome'>
(mais comentários)
```

Anotação de tipo do TypeScript é **apagada no build** (type erasure): não existe em runtime. Nenhuma linha executável do motor, do layout do CSV ou da RPC mudou — logo contagens, erros e avisos do preview são os mesmos **por construção**, o que é uma garantia mais forte que rodar um preview e comparar.

### 3.6 Smoke pós-deploy (produção)

```
RESUMO · 93 OK · 4 aviso · 0 n/a (pré-F12) · 0 falha
```

Checagens novas desta fase:

```
[OK] ativos · campos do celular (F25) — telefone, imei e pulsus presentes
[OK] filiais · cidade do termo (F25) — 5 filiais com cidade; nenhuma ativa sem
[OK] /ativos?filial=1,2      — HTTP 200 (337578 bytes)
[OK] /ativos?filial=todas    — HTTP 200 (337544 bytes)
[OK] /ativos?filial=abc,99999 — HTTP 200 (337560 bytes)   ← lixo ignorado, não derruba
[OK] /itens                  — HTTP 200 (124961 bytes)    ← abre em "Por filial"
[OK] /itens?visao=consolidado — HTTP 200 (126617 bytes)    ← sentinela funciona
[OK] /itens?visao=filiais    — HTTP 200 (125304 bytes)    ← link antigo ainda vale
```

Os **4 avisos** são pré-existentes e não têm relação com a fase: o catálogo de itens de produção está vazio, o que deixa 3 checagens de item inconclusivas e a de RLS de kits sem massa para comprovar.

**A única falha da primeira execução não era regressão** — e vale registrar. O check `/pendencias?tipo=conflito` da F24 usava como marcador o **estado vazio** ("Nenhum conflito entre filiais"), com uma nota dizendo que passaria a falhar no dia em que houvesse conflito real. Esse dia chegou: **produção tem 137 grupos de conflito**, medidos **antes** do deploy desta fase (um import trouxe máquinas que já existiam em outra unidade). Um check que reprova por causa do estado dos DADOS deixa de medir o que deveria e normaliza smoke vermelho; ganhou um marcador alternativo que aceita as duas faces legítimas da tela e continua reprovando erro, redirect e página em branco.

### 3.7 Revisão adversarial em contexto fresco (§V)

Seis lentes independentes (celular · cidade · semântica do filtro · queries e contagens · padrões e navegação · regressão), **refutação por padrão**, e cada achado verificado por um agente separado instruído a derrubá-lo.

**17 candidatos → 6 confirmados** após refutação independente (vários outros foram marcados "refutado" justamente porque já haviam sido corrigidos enquanto a revisão rodava). Todos corrigidos:

| Achado | Por que era real |
|---|---|
| Selo da sidebar contava **todas** as filiais e `/pendencias` abria recortada | o operador via "20" no selo e encontrava 5 na lista |
| KPI tiles (dashboard e relatório Consolidado) iam para `/ativos` **sem** `filial` | a ausência do param passou a significar "o padrão do cargo": clicar num total global levava a uma lista recortada |
| Card "Pendências" do painel inicial continuou global | selo dizia 0, card listava 5 de outra filial, "ver todas" abria vazio — três superfícies vizinhas discordando |
| `temFiltro` das **pages** contava o padrão do cargo como filtro | numa filial recém-aberta o operador via "nada com esses filtros — limpe os filtros" onde a verdade é "não há nada cadastrado", com um "Limpar" que recaía no mesmo recorte |
| O aviso "filial sem cidade" era engolido pelo de lote misto (`else if`) | justamente no pior caso: lote misto cuja primeira filial não tem cidade → documento começando por vírgula, sem aviso |
| `?filial=2&filial=4` (param repetido → array) | a tela descartava o param e o CSV usava o primeiro valor — divergência anterior à F25 que o padrão por cargo agravou |

Corrigidos ainda **durante** a revisão, antes da verificação: o **menu mobile** (que monta a mesma `SidebarNav` e continuava levando o operador ao Consolidado), o `trim` do `visao` que só existia no export (`?visao=%20consolidado` abria a tela lado a lado e baixava o CSV do Consolidado), o `await listarFiliais()` **sem guarda** no layout do grupo (um blip do banco derrubaria o shell inteiro por causa de um selo), a **regra por-unidade do celular que só existia no cliente** (o servidor gravava os 3 em todo o lote com `.in('id', ids)` — um request forjado escreveria o mesmo IMEI em vinte aparelhos) e a **não-determinação da cidade** (`.in()` não garante ordem, e a cidade saía do "primeiro" ativo).

**Dois dos meus próprios testes falharam ao corrigir o comportamento** — o de "lote misto avisa uma coisa só" e os de `kpi-links` — e foram reescritos para a regra nova. Testes que pegam a própria correção são o sinal de que estavam medindo algo.

---

## 4. Decisões registradas

**14 atas** em [`DECISOES.md`](DECISOES.md) (2026-08-04 · F25). As que mais importam:

1. **A cláusula de foro fica intocada** — só a linha da assinatura varia.
2. **O padrão do operador é TODAS as filiais vinculadas**; a aba do relatório é a 1ª alfabética.
3. **A ausência do param virou "padrão do cargo"** — e por isso existe a sentinela `todas`. Link sem param muda de sentido conforme quem abre: aceito e registrado.
4. **`todas` e `geral` viraram slugs reservados** de filial (`geral` já era, de fato, desde a F3 — nunca estivera escrito).
5. **`/relatorios/gerados` não recebe o padrão por cargo** — o arquivo é global e contém os consolidados.
6. **Nenhum backfill das observações** — dado real em texto livre; adivinhar qual pedaço é IMEI erra em silêncio sobre dado que ninguém confere.
7. **Sem CHECK por categoria** nas colunas do celular — registrado como o oposto da doutrina "a regra mora no Postgres", com o porquê.
8. **Campos do celular só em cadastro de unidade única.**
9. **UPDATE pós-RPC**, e não recriação de `criar_compra_lote`.
10. **Saldos de 2+ filiais somados em memória**; somar `falta` entre filiais é o que a casa já fazia.
11. **A contagem de conflitos abandona o `count/head`** com 2+ filiais.
12. **O default de `/itens` inverteu** — com a consequência de URL antiga registrada.
13. **`listarFiliais` virou memoizada** por requisição.
14. **O import ficou intocado, e a prova é o tipo.**

---

## 5. Documentação emendada

| Documento | O que mudou |
|---|---|
| `ESPECIFICACAO.md` | §5: `filiais.cidade` e os 3 campos do celular em `ativos`; §6: emenda datada do filtro multi-seleção com padrão por cargo |
| `PLANO-TERMOS.md` | §9: dois itens saíram do backlog (colunas no ativo · variação de cidade); §10: **pergunta 4 respondida** |
| `MATRIZ-REGRAS.md` | 7 regras novas (R-TER-14/15/16, R-ME-30/31, R-ACC-27/28) — contador **224** |
| Ajuda F20 | 11 páginas: lista de ativos, saldos, relatório ao vivo, relatórios gerados, lançar itens, ficha, cadastrar compra, termos, movimentações, pendências, administração › filiais |
| `CHANGELOG.md` · `README.md` · `prompts/README.md` | entrada da fase |

**Um guarda da ajuda pegou de verdade:** `conteudo.test.ts` exige a frase literal *"Por filial põe uma coluna de estoque para CADA filial"*, e a reescrita tinha inserido um aparte no meio dela. As **demais** correções de documentação **não quebravam teste nenhum** — os guardas são aditive-safe e a prosa simplesmente ficaria errada em silêncio, que é o tipo de lacuna mais perigoso.

---

## 6. O que este relatório NÃO prova

- **O padrão por cargo não foi exercitado ponta a ponta com um operador logado.** As regras estão provadas por **teste de função pura** (38 casos: 4 cargos × com/sem vínculo, a aba, o parser, a sentinela) e as telas foram provadas por **smoke com conta ADMIN**. Ninguém logou como operador vinculado a duas filiais e conferiu a tela. É exatamente o que o roteiro manual da §7 pede — e o critério 4 da ordem está marcado **parcial** por isso.
- **O `.docx` não foi aberto no Word.** A conferência foi por render + comparação de partes do pacote, que é mais estrita que o olho para o que mudou — mas não substitui abrir o arquivo e olhar a página.
- **Nenhum termo real foi gerado em produção.** A cidade foi provada com payload fictício.
- **O preview do import não foi reexecutado com um CSV.** A prova usada é mais forte para o que se quer garantir (nenhuma linha executável mudou), mas é uma prova de **código**, não de **execução**.
- **A soma de `falta` entre filiais é uma leitura, não um teorema.** Faltar 2 na Serra e 1 em Linhares vira "falta 3 nas duas"; o número não diz "falta 3 num lugar só". É a mesma aritmética que a casa já usava, agora mais visível.
- **O CSV de saldos na visão "Por filial" continua saindo CONSOLIDADO** (uma linha por item, não uma coluna por filial). Isso é comportamento anterior, documentado na ajuda e com o rótulo do arquivo dizendo "Consolidado" — mas a F25 **tornou essa visão o padrão**, então o que era caminho raro virou o comum. Está no backlog da §8.
- **137 grupos de conflito esperam em produção** (§3.6). A fase não os criou nem os resolve.
- **Concorrência não foi testada.** Dois operadores mexendo no mesmo filtro/termo ao mesmo tempo não é cenário desta fase.

---

## 7. Roteiro manual de 5 minutos (para o Johnny)

Faça no **ENSAIO**, com dados fictícios.

1. **Celular com campos próprios (1 min).** Ativos → Novo equipamento → categoria **Celular**, um patrimônio só (`WAP0001234`). Aparecem "Nº do telefone", "IMEI" e "Pulsus" — preencha. Cadastre e abra a ficha: os três aparecem depois do Hostname. Troque a categoria para Notebook antes de cadastrar: os três **somem**. Cole 3 patrimônios com a categoria Celular: eles **somem** e a tela explica por quê.
2. **O termo puxa do cadastro (1 min).** Faça uma saída desse celular e gere o **termo de responsabilidade**. "Nº do telefone", "IMEI" e "Pulsus" vêm **preenchidos**, e a "Cidade da assinatura" vem da filial. Baixe e confira a última linha antes das assinaturas.
3. **A cidade muda por filial (1 min).** Repita com um ativo de **Linhares**: a linha sai "Linhares, …". Confira que a **cláusula de foro** continua "Comarca de São José dos Pinhais/PR". Em Administração › Filiais, apague a cidade de uma filial e gere outro termo: o diálogo **avisa** em vez de deixar sair um documento começando por vírgula.
4. **O padrão por cargo (2 min) — é o que o relatório não provou.** Crie um usuário fictício com cargo **Operador** vinculado a **Serra + Linhares** e entre com ele:
   - `/ativos`, `/movimentacoes`, `/pendencias`: o botão **Filial** já vem com **2** marcadas.
   - **Relatórios** (menu lateral **e** menu do celular) abre na aba **Linhares**.
   - `/itens` abre **lado a lado**; o Consolidado está a um clique.
   - Abra o painel de filial → **"Todas as filiais"**: a lista passa a mostrar tudo e a URL ganha `?filial=todas`.
   - **"Limpar"** volta às duas filiais dele.
   - Clique num **KPI do painel inicial**: a lista abre com **todas** (o número do tile é global).
   - Marque só Serra e **Exporte CSV**: o arquivo tem exatamente as linhas da tela.
   - Entre como **admin** e confira que tudo abre com todas as filiais e no **Consolidado**.

---

## 8. Pendências e backlog

| Item | Nota |
|---|---|
| **137 grupos de conflito em produção** | anterior a esta fase; esperam na mesa de `/pendencias?tipo=conflito`. **Ação do Johnny** |
| CSV de saldos na visão "Por filial" sai **consolidado** | pré-existente e documentado, mas a inversão do default o tornou o caminho comum. Sugestão: uma coluna por filial no arquivo |
| Relatório somando 2+ filiais escolhidas | fora de escopo por decisão do Johnny (a aba continua sendo de uma filial) |
| `criar_compra_lote` não grava os campos do celular | o UPDATE pós-RPC cobre; recriar a RPC é o caminho "certo" quando houver janela para rodar os roteiros SQL |
| `observacoes` com telefone/IMEI antigos | migração é decisão humana, na ficha, quando o operador tocar no ativo |
| Campos do celular no cadastro em **lote** | exigiria três textareas e a generalização do pareamento por índice; preenche-se na ficha |
| `leaked password protection` desligado | backlog aberto desde 21/07, fora do escopo desta fase |

---

*Relatório escrito ao fim da execução autônoma da F25, em 04/08/2026.*

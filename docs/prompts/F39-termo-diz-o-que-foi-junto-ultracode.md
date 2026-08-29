ultracode

# Ordem de serviço F39 — O termo diz o que foi junto

> Ordem de 29/08/2026, emitida pelo Johnny. **Fecha a série F36→F39.** Sucede a **F38** (`docs/RELATORIO-F38.md` · **v1.43.0**, migrations `0116`–`0121`) e a revisão de código que a fechou (**v1.43.1**, migrations `0122`/`0123`). O **o quê** e o **porquê** desta fase estão em `@docs/PLAN-F36-F39.md` **§6** (decisões **D8**, **D9**, **D10**, **D11** do §1) — **leia o §6 inteiro, mais o §2.3, antes de planejar**; esta ordem é a execução dele e, onde as duas divergirem, **esta ordem manda** (emende o plano e registre em `docs/DECISOES.md`). Na escrita desta ordem a última migration era a **`0123`** e a versão no ar, **`1.43.1`**: **confira os números reais antes de começar**. Se `git status` mostrar trabalho não commitado de outra sessão, PARE e reporte (uma ordem por vez) — **exceto o próprio arquivo desta ordem**, que é insumo da fase: commite-o no primeiro commit.
>
> **As três pontas que o §10 do plano deixou com o Johnny foram fechadas por ele em 29/08/2026. São decisão dele, não sua:**
>
> 1. **A redação da cláusula é a proposta do §6.1, aprovada como está:** `Acompanham o equipamento os seguintes acessórios e periféricos: {acessorios}`. Não reescreva, não "melhore", não traduza para outra voz. O que fica com você é a marcação e a formatação, não o texto.
> 2. **A conferência visual NÃO bloqueia a fase.** Ela vai até produção em modo autônomo, como toda ordem desta casa; o que ela exige é o **pacote de evidências da §A.4**, para o Johnny auditar quando quiser. A prova mecânica cobre o que dá para provar: o script mostra byte a byte que só a seção nova mudou, e o **critério 2** prova que um termo SEM acessório sai idêntico ao de hoje. **O que ela não cobre é a diagramação da cláusula quando há acessório** — e é exatamente por isso que o pacote de evidências da §A.4 é obrigatório, e por isso a §A.3 exige que o `w:pPr` aplicado seja declarado por escrito.
> 3. **A remoção de `ACESSORIOS_DEVOLUCAO` ENTRA nesta fase**, fechando a pendência nº 4 da F38. É a **§E**, e ela toca mais arquivos que todo o resto da ordem somado. A régua dela é uma só: **nenhum rótulo que o operador vê hoje pode mudar.**

## Missão

Hoje o termo mente por omissão. A F38 fez o acessório andar junto com o equipamento no banco — "o que foi junto com este notebook" virou um join —, mas o papel que a pessoa assina continua listando só marca, modelo, service tag e patrimônio. Nenhum dos 5 modelos de responsabilidade tem onde citar periférico, e `{outros_componentes}`, que existe nos 2 de devolução desde a F5A, sai `''` fixo desde então. Esta fase põe no papel o que o sistema já sabe:

- **A — Os 5 `.docx` ganham a seção** (D9/D10), por **script** que edita `word/document.xml` e prova o resto byte a byte — nunca pelo Word. Sem periférico, o parágrafo inteiro some do documento.
- **B — Uma função pura** monta a linha: agrupa por tipo, ordena, respeita o teto do campo, descarta item sem tipo e diz quantos descartou.
- **C — O preenchimento**: `prepararTermo` lê os lançamentos vinculados à movimentação e sugere a linha; ela é **editável como todo campo do termo**.
- **D — O termo de devolução** (D11): `{outros_componentes}` passa a listar **o que voltou**; o que faltou continua na `{observacao}`, intocada.
- **E — `ACESSORIOS_DEVOLUCAO` sai do código.** O vocabulário passa a vir de `tipos_item` (F37) nas sete superfícies que hoje dependem da constante.

**Zero migration. Zero dependência nova.** Se você se pegar escrevendo SQL de schema, o desenho saiu do trilho: pare e repense.

## Contexto (leia a origem, não descrições dela)

- **Fonte do escopo:** `@docs/PLAN-F36-F39.md` §1 (D8, D9, D10, D11), **§2.3** (as tags reais dos 7 modelos, extraídas do `word/document.xml` — verificadas, não presumidas), **§6** (o desenho desta fase), §7 (rollout: F39 tem "Migrations: nenhuma"), §8 (versão), §9 (o que o plano NÃO faz) e §10 (as três pontas, já fechadas no cabeçalho acima). E `@docs/RELATORIO-F38.md` **§10** (as sete pendências nomeadas — a **nº 3** é a razão desta fase existir e a **nº 4** é a §E).
- Doutrina: `@CLAUDE.md` (modo autônomo; stack fechada; **regra 2 — nunca dado real**; regra 8 do versionamento; a árvore prescrita, que esta ordem emenda) · `@docs/ESPECIFICACAO.md` §6/§7 · `@docs/PLANO-TERMOS.md` (**§3.9** — todo campo do termo é editável; **§4.2** — as regras do termo de devolução; **§6 item 1** — o processo de preparação dos modelos, que é a régua da §A).
- **O precedente EXATO da §A, e o mais importante desta ordem:** `@scripts/termos/retaguear-cidade.mjs` (F25). **Leia o arquivo inteiro, cabeçalho incluso**, antes de escrever uma linha do script novo. Ele traz de graça o que a §A precisa: por que não se abre o modelo no Word, o modo conferência por padrão com `--aplicar` para gravar, e as **três provas** que fazem a edição ser auditável (o pacote fora do `document.xml` sai byte a byte; a única parte divergente é o `document.xml`; o XML anterior é reconstituível a partir do novo). A diferença que você tem de tratar: a F25 **substituiu** uma substring; aqui se **insere** parágrafo.
- **O caminho do termo, de ponta a ponta:** `@src/lib/actions/termos.ts` (`prepararTermo` — repare que a família `responsabilidade` decide tudo por `movs[0]`, e que `outros_componentes: ''` é literal; `gerarTermo`/`renderizarDocx` com `paragraphLoop: true`, `linebreaks: true` e `nullGetter: () => ''`; `persistirTermo` gravando o payload inteiro em `termos_gerados.dados`) · `@src/lib/validators/termo.ts` (`camposTermoSchema`, **chaves fechadas** e `.partial()`) · `@src/lib/termos/preparo.ts` (o cabeçalho explica **por que** o julgamento mora fora da action — é o molde da §B; e `mesclarCamposSalvos` é o que faz termo antigo reabrir sem quebrar) · `@src/lib/termos/devolucao.ts` (`observacaoSugestao`, que a §D **não** muda de comportamento) · `@src/components/movimentacoes/gerar-termo-dialog.tsx` (`CAMPOS_RESP`/`CAMPOS_CELULAR`/`CAMPOS_DEVOL` e o preview por `docx-preview`).
- **O dado que a F38 entregou e esta fase imprime:** `@supabase/migrations/0116_lancamento_item_movimentacao.sql` (o vínculo `movimentacao_id`), `@supabase/migrations/0119_ciclo_pendencia_item.sql` (o ciclo da pendência: **leia o `insert` da RPC**, não o cabeçalho — quais colunas ele grava e quais não grava é o que governa a §C.2) e `@supabase/migrations/0121_estorno_com_itens.sql` (corpo vigente na `0122` — **leia o comentário do `v_novo`**: o lançamento inverso pertence à movimentação DE ESTORNO, não à original), `@src/lib/queries/itens.ts` (`itensQueForamJunto`, o join que já existe e o molde da leitura nova), `@src/lib/itens/ponte-tipo-item.ts` (a ponte tipo→item e o que o modelo **não** suporta).
- **O vocabulário que substitui a constante:** `@supabase/migrations/0114_tipos_item.sql` (a tabela, o seed dos 7 slugs históricos, e a nota de que **não há policy de DELETE** — tipo citado no histórico não se apaga) e `@src/lib/queries/tipos-item.ts` (`listarTiposItem` = todos, inclusive desativados · `listarTiposItemAtivos` = só os ativos). Para o histórico continuar legível, quem exibe passado usa **todos**.
- **A armadilha da §E, e ela é séria:** `@src/lib/queries/relatorios/fronteira-viewer.test.ts`. O visualizador por senha roda com o client **administrativo** (service_role) resolvido em `resolverAcessoRelatorio` (`@src/lib/auth/acesso.ts`); uma leitura de `tipos_item` feita com `createClient()` dentro da superfície do relatório devolveria **vazio** para ele, e o relatório impresso sairia com slug cru. Leia o tripwire antes de mexer ali. ⚠ E repare que `listarTiposItem` (`@src/lib/queries/tipos-item.ts`) resolve o client por dentro e **não aceita client** — para servir o viewer ela precisa do parâmetro, no precedente exato de `listarFiliais(acesso.client)`.
- **A outra armadilha de fronteira:** `fronteira-rsc.test.ts` (F32) — Server Component não importa VALOR de módulo `'use client'`. Mapa de rótulos vai para Client Component **por prop**, nunca por import de query.
- **Guardas que VÃO reclamar** (F20/F27/F32/F35): `@src/lib/ajuda/registry.test.ts` (mapa rota→página), o teste de jargão do registry de versões, `@src/lib/versoes/cobertura-changelog.test.ts` (derruba o `npm run test` se uma entrada nova do CHANGELOG ficar sem versão), `@src/lib/validators/tipos-item-sql.test.ts` (a guarda TS↔SQL que a §E vira do avesso) e `@src/lib/dominio.test.ts`. Leia-os **antes** de mexer no que eles vigiam.
- **A lição do teto de 1.000 linhas** (`@docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md`): nenhuma contagem desta fase pode nascer de leitura truncada.
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run db:types` (nesta fase tem de sair **sem diff** — não há schema novo). **Meça a baseline ANTES de mudar qualquer coisa** e cole no relatório.
- APIs (regra 6 do `CLAUDE.md`): **docxtemplater** é a integração central desta fase. A semântica de bloco condicional com `paragraphLoop` decide se a seção some limpa ou deixa linha vazia — **confira na documentação oficial vigente (MCP Context7), não de memória.** O mesmo vale para qualquer coisa de Next 16/React 19 que você precise tocar.

## Escopo

**Dentro:** `scripts/termos/inserir-acessorios.mjs` e os **5** `.docx` de responsabilidade retagueados; o pacote de evidências em `docs/f39-evidencias/`; a função pura `src/lib/termos/acessorios.ts` com teste próprio; `acessorios` no `camposTermoSchema` e no diálogo; `prepararTermo` preenchendo `acessorios` (responsabilidade) e `outros_componentes` (devolução) com a leitura nova em `src/lib/queries/itens.ts`; `tem_acessorios` derivado no render; a remoção de `ACESSORIOS_DEVOLUCAO`/`ACESSORIO_ROTULO`/`rotuloAcessorio` com as sete superfícies migradas para `tipos_item`; a guarda nova dos modelos `.docx`; a inversão da guarda TS↔SQL; ajuda, versão **1.44.0** (bump + registry + CHANGELOG + tag), emendas de documentação, deploy, smoke e `docs/RELATORIO-F39.md`.

**Fora (não toque):**

- **Banco.** Nenhuma migration, nenhuma função, nenhum trigger, nenhuma policy. `git diff supabase/` tem de sair **vazio** no fim da fase. `npm run db:types` sem diff.
- **Os 2 `.docx` de devolução.** `{outros_componentes}` já existe neles desde a F5A — preenchê-la é código, não arquivo. O script da §A **recusa** tocar qualquer arquivo que não seja um dos 5 de responsabilidade.
- **A cláusula de FORO** ("Comarca de São José dos Pinhais/PR") e a **linha da assinatura** (`{cidade}, {data_extenso}`, F25). Texto jurídico e retag alheio: contados antes e depois, idênticos.
- **A identificação do equipamento principal (D8).** `{marca}`, `{modelo}`, `{service_tag}` e `{patrimonio}` continuam saindo como hoje. "Tipo em vez do nome" vale **só para o periférico** — é marca, modelo e patrimônio que amarram a responsabilidade a um bem específico.
- **`{observacao}` e `observacaoSugestao`.** O que faltou continua saindo por ali, com o mesmo texto (`Não devolvido(s): …`), a partir de `movimentacoes.itens_faltantes`. As duas linhas dizem coisas diferentes e é isso que tira a ambiguidade do documento (D11).
- **O fluxo de itens da F38.** Wizard, checklist de dois desfechos, "Com esta pessoa", ciclo da pendência, estorno acoplado, RPC do lote: byte a byte. Esta fase **lê** o que a F38 grava; não muda uma regra de escrita.
- **`termos_gerados`, o Storage e os `.docx` já gerados.** Nada é retroativo: documento antigo no bucket continua como está; regerar passa a sair com a seção nova.
- Máquina de estados, modelo de acesso (nenhum cargo, nenhuma policy, nenhuma guarda de action nova além do que já existe), relatórios e snapshots como produto, `src/components/ui/**`, dependência nova, custo acima de R$ 0, **dado real em qualquer lugar** — payloads de teste e evidências são `WAP0001234`/"Fulano de Tal", regra 2 do `CLAUDE.md`.

## O modelo a implementar

### A — Os 5 `.docx` ganham a seção (D9 · D10)

**Por script, nunca pelo Word.** Reabrir e salvar no Word (ou no LibreOffice) reescreve o pacote inteiro — ordem das partes, `rels`, revisão do editor — e nenhuma inspeção prova depois que só a seção nova mudou. `scripts/termos/inserir-acessorios.mjs` nasce no molde do `retaguear-cidade.mjs`: **modo conferência por padrão**, grava só com `--aplicar`, e imprime as provas.

**A.1 — Onde entra.** Verificado em 29/08/2026 lendo o `word/document.xml` dos 5, e **confira você mesmo antes de gravar** (o modelo pode ter mudado):

| Modelo | Último parágrafo do bloco de identificação | Observação |
|--------|--------------------------------------------|------------|
| `responsabilidade-notebook` · `-desktop` · `-monitor-interno` | `NÚMERO DO CHAMADO: {chamado}` | item de lista numerada (`w:numPr`) |
| `responsabilidade-monitor-homeoffice` | `Número do Chamado: {chamado}` (caixa diferente — o modelo inteiro usa Title Case) | item de lista numerada |
| `responsabilidade-celular` | `OBS: {obs}` — **não** o `{chamado}`, porque telefone, IMEI, Pulsus e OBS vêm depois dele | item de lista numerada |

A seção nova entra **logo depois** desse parágrafo e **antes** das cláusulas de responsabilidade ("Uso Exclusivo e Intransferível…"). Em cada modelo, o parágrafo a clonar é o **vizinho do próprio arquivo**: herde dele o `w:pPr` (estilo, recuo, alinhamento, espaçamento — com a ressalva do `w:numPr` na §A.3) e o `w:rPr` do run. **Nada de estilo inventado.** Negrito no rótulo é desejável e sai de propriedades de run que já existem no próprio modelo; não havendo o que clonar, sai sem negrito — e a escolha vira ata.

**A.2 — A marcação, e por que são três parágrafos.** A cláusula aprovada é uma só:

```
Acompanham o equipamento os seguintes acessórios e periféricos: {acessorios}
```

O D10 exige que, **não havendo periférico, o parágrafo inteiro suma** — não uma linha vazia pendurada, não um marcador de lista órfão. Isso é bloco condicional do docxtemplater (`{#tem_acessorios}` … `{/tem_acessorios}`) com as tags de abertura e fechamento **sozinhas, cada uma no seu próprio parágrafo**, envolvendo o parágrafo da cláusula: é essa forma que o `paragraphLoop: true` (que `renderizarDocx` já usa) remove por inteiro. Abrir e fechar **dentro do mesmo parágrafo** apaga o texto e deixa o parágrafo — exatamente o defeito proibido. **Confirme a semântica na doc oficial vigente (Context7) antes de gravar**, e prove o resultado pelo critério 2, que é quem manda.

**A.3 — O que o script imprime, por modelo** (sem isso a edição não é auditável):

- conjunto de partes do pacote idêntico antes e depois, e **uma única parte divergente**: `word/document.xml`;
- o XML anterior **reconstituível** a partir do novo (removendo o trecho inserido, volta byte a byte ao original) — a prova 2 da F25, invertida para inserção;
- contagem de `<w:p>`: **+3** por modelo, nem mais nem menos;
- a cláusula de foro contada antes e depois, **igual**; a linha da assinatura (`{cidade}, {data_extenso}`) intacta;
- `sha` do arquivo antes → depois;
- **idempotência:** rodar de novo em modelo já tratado imprime "já inserido — nada a fazer" e **não** grava (o `retaguear-cidade.mjs` já faz isso; copie o comportamento);
- **recusa** qualquer arquivo fora dos 5 nomes de responsabilidade, e falha com saída ≠ 0 se qualquer modelo não bater com o esperado;
- **o `w:pPr` aplicado ao parágrafo novo, declarado por modelo** (`pStyle`, `numPr`, `ind`, `jc`) — é a **única** prova mecânica que existe do caso **com** acessório, já que todas as outras olham o documento sem ele. O relatório transcreve essa saída.

⚠ **A decisão do `w:numPr`, e ela é sua.** Nos 5 modelos o bloco de identificação é **lista numerada** (medido: `numId` 2 no notebook, 1 no desktop/monitor interno/celular, 36 no home office; as cláusulas de responsabilidade usam outra lista, então nada mais é renumerado). Clonar o `w:pPr` do vizinho **inteiro** faz a cláusula virar mais um item numerado ao lado de "MARCA"/"MODELO". A regra: clone o `w:pPr` do vizinho **menos o `w:numPr`** — a cláusula é frase, não campo da lista —, e se o resultado ficar visualmente solto no PDF, mantenha o `numPr` e **registre a troca em ata**. O que não é opcional é declarar o que foi aplicado.

**A.4 — O pacote de evidências (`docs/f39-evidencias/`).** É o que substitui o aceite prévio do Johnny, e é obrigatório:

- os 5 modelos renderizados **com** acessórios e **sem** acessórios, e os 5 modelos **DE ANTES DA FASE** renderizados com o **mesmo** payload — o par lado a lado é o que prova o critério 2. ⚠ A referência é o **SHA da baseline** (`git rev-parse HEAD` medido na §V, antes de mudar qualquer coisa): `git show <sha-baseline>:src/templates/termos/<arquivo>`. `HEAD` **não** serve — depois do commit dos `.docx` novos ele devolve o arquivo novo, e o par vira o arquivo comparado consigo mesmo;
- **PDF** se houver conversor já instalado na máquina (`soffice --headless --convert-to pdf`, `libreoffice`, `pandoc`). **Não instale nada** para isso (custo R$ 0, stack fechada): não havendo conversor, guarde os `.docx` e **diga no relatório** que a conferência visual do Johnny será no Word, com o caminho dos arquivos;
- payload **100% fictício** (`WAP0001234`, "Fulano de Tal", filial fictícia). Regra 2 do `CLAUDE.md` vale para evidência e screenshot como vale para seed.

**A.5 — A guarda que hoje não existe.** Nenhum teste do repositório abre os `.docx`. Nasce um: lê os 7 modelos com `pizzip` e confere o **conjunto de tags** de cada um (os 5 de responsabilidade com `acessorios` e `tem_acessorios`; os 2 de devolução com `outros_componentes` e sem as novas). ⚠ Extraia as tags do **texto** (o conteúdo dos `<w:t>` concatenado), **nunca** do XML cru: três dos cinco modelos carregam um GUID entre chaves num atributo de DrawingML (`<a:ext uri="{28A0092B-…}">`), e um `matchAll` sobre o XML o captura como se fosse tag. É barato, é durável, e é o que impede um modelo trocado à mão de derrubar o termo em silêncio na próxima fase.

### B — A função pura que monta a linha (`src/lib/termos/acessorios.ts`)

Módulo **puro**, com teste próprio, no molde de `termos/preparo.ts` — e pelo motivo escrito no cabeçalho daquele arquivo: caso de borda dentro de Server Action ninguém escreve.

Recebe os lançamentos vinculados à(s) movimentação(ões), o catálogo de tipos e o **limite do campo**; devolve `{ linha, descartados }`.

- **Agrupa por tipo** (`itens.tipo_id` → `tipos_item`), **soma as quantidades**, **ordena pela `ordem` do tipo** (desempate estável pelo rótulo, `localeCompare('pt-BR')` — sem isso o mesmo lote gera linhas diferentes em chamadas diferentes, o defeito que o `.order('id')` de `prepararTermo` já documenta).
- **Formato (D10):** linha única separada por `, `. Soma 1 imprime `Rótulo`; soma maior imprime `Rótulo (N)` — `Fone de ouvido, Mouse (2), Teclado, Mochila`. Documento assinado que diz "Mouse" quando saíram dois está errado, e a quantidade é barata.
- **Item sem `tipo_id` é descartado** (D8) e **contado**: a contagem alimenta o aviso da §C. Item cujo tipo está **desativado ENTRA** — o histórico é fato, e a `0114` nem sequer permite apagar tipo citado.
- **O teto do campo é responsabilidade da função, não do Zod.** `acessorios` cabe em 600 e `outros_componentes` em 400 (`camposTermoSchema`): estourar faria `gerarTermo` morrer em "Há campos inválidos", que é uma mensagem que não ajuda ninguém. Estourando, corte no último item **inteiro** que cabe e acrescente ` e mais N` — com o resultado **dentro** do limite, contado.
- Teste cobrindo, no mínimo: vazio → `''`; item sem tipo descartado com a contagem certa; soma de quantidades; ordem pela `ordem` do tipo; tipo desativado presente; corte com ` e mais N` nos **dois** limites.

### C — O preenchimento (`prepararTermo`, Zod, diálogo)

**C.1 — O campo.** `camposTermoSchema` ganha `acessorios: z.string().max(600)` (chaves fechadas, `.partial()`, como todos). No diálogo, entra em `CAMPOS_RESP` como **"Acessórios que acompanham"**, `multi: true`. **Editável como todo campo do termo** (§3.9 do `PLANO-TERMOS`): o pré-preenchimento é sugestão e nunca trava a geração.

**C.2 — De onde vem o dado.**

- **Responsabilidade:** os lançamentos de tipo `saida` da **movimentação de referência** — `movs[0]`, a mesma que já governa marca, modelo, patrimônio e chamado. É o **D13 no papel**: o fone que acompanhou o notebook aponta a movimentação do notebook, e cada termo lista só o que é dele.
- **Devolução:** a união dos lançamentos de tipo `retorno` de **todas** as movimentações do lote. `{outros_componentes}` = o que foi conferido como devolvido **naquele ato**, e só isso.
- **Duas exclusões, e as duas são de correção — não de estilo.** Confira as duas no código **antes** de aceitá-las como verdade (a leitura abaixo é de 29/08/2026):
  - **Inverso de estorno fica FORA** (`estorna_id is not null`). O estorno acoplado (`estornar_movimentacao_com_itens`, `0121`, corpo vigente na `0122`) grava o inverso apontando a movimentação **DE ESTORNO**, não a original — está escrito no comentário do `v_novo`, e é o que faz "o que foi junto" responder certo dos dois lados da linha do tempo. Logo, filtrar pela movimentação do termo **já** deixa o inverso de fora: esta exclusão é o cinto que cobre o caso de se preparar termo sobre a **própria movimentação de estorno**, onde o inverso de uma entrega apareceria como se fosse acessório devolvido.
  - **Lançamento nascido de pendência fica FORA** (`pendencia_item_id is null`). Um item recuperado semanas depois não pode aparecer como "voltou" num papel cuja `{observacao}` o declara faltante — as duas linhas se contradiriam no mesmo documento. ⚠ Lido hoje, `resolver_pendencias_item_com_lancamentos` (`0119`) **não** grava `movimentacao_id` nesses lançamentos (a coluna não está na lista do `insert`), então o filtro é redundante **neste momento**; ele entra porque declara a intenção e sobrevive ao dia em que alguém passar a vincular. **Verifique**: se a coluna já estiver sendo gravada quando você chegar, o filtro deixa de ser redundante e vira a única coisa que segura o defeito.
- **A leitura mora em `src/lib/queries/itens.ts`**, tipada, no molde de `itensQueForamJunto` — **não** engorde `actions/termos.ts` (832 linhas, item **L** da `docs/DIVIDA-TECNICA.md`). Traga tipo, rótulo, ordem e quantidade de uma vez; agregue no SQL ou prove que o resultado é limitado pelo teto de 20 movimentações do schema. Nenhuma contagem nascida de leitura truncada.

**C.3 — Os avisos.** Entram em `avisos` (o banner do diálogo já existe e já é lido). Aviso, **nunca** bloqueio: o termo sai do mesmo jeito.

- **Item sem tipo:** *"N item(ns) que foram junto não têm tipo cadastrado e ficaram fora do termo — classifique em Administração → Itens."*
- **Conferido como devolvido, mas sem lançamento** — o caso que o papel esconderia: o "Voltou" da devolução **nem sempre** vira lançamento, e a F38 previu isso em dois caminhos: lote **misto** (filiais ou detentores diferentes) desliga o lançamento do checklist (`checklistPodeLancar`/`MSG_LOTE_MISTO_SEM_LANCAMENTO`, `@src/components/movimentacoes/nova/itens-do-lote.ts`), e tipo cuja **ponte não resolve item** (zero candidatos, ou ambiguidade que ninguém decidiu — `@src/lib/itens/ponte-tipo-item.ts`) também não gera linha. Nos dois, `{outros_componentes}` sairia **vazio** afirmando que nada acompanhou, num papel assinado, enquanto o operador conferiu que acompanhou. Havendo `movimentacoes.itens_faltantes` ou conferência sem lançamento correspondente, avise: *"Houve item conferido nesta devolução que não gerou lançamento de estoque — confira a linha de componentes antes de gerar."* Como a fonte do "voltou" é o lançamento (e não existe registro do que foi marcado e não lançou), **é legítimo derivar o aviso do que dá para saber no servidor** — o mínimo aceitável é avisar quando o lote é misto. Registre em ata o critério que você escolheu.

**C.4 — `tem_acessorios` é derivado no servidor, do texto FINAL.** Em `gerarTermo`, ao lado de `data_extenso`/`data_mes_ano`, o `DadosTermo` ganha `tem_acessorios = (campos.acessorios ?? '').trim().length > 0`. **Nunca** do que o banco leu: apagar o campo no diálogo tem de fazer a seção sumir do papel, e digitar a linha à mão tem de fazê-la aparecer — o campo é editável, e é o texto que foi ao papel que manda. Como `dados` guarda o payload inteiro, o snapshot registra o que foi renderizado, sem migration nenhuma.

**C.5 — Termo antigo reabre sem quebrar.** `mesclarCamposSalvos` (`termos/preparo.ts`) já trata chave ausente: termo gerado **antes** desta fase abre com a linha sugerida pelo que a movimentação diz hoje — mesmo comportamento e mesma razão da `cidade` na F25 —, e chave **presente-e-vazia** continua vencendo, porque é edição deliberada de quem gerou.

### D — O termo de devolução (D11)

`outros_componentes: ''` deixa de ser literal em `prepararTermo` e passa a sair da **mesma** função pura da §B, com limite 400. **Nenhum `.docx` de devolução é tocado** — a tag existe desde a F5A. `{observacao}` continua vindo de `observacaoSugestao(itensFaltantes)`, com o mesmo texto de hoje: o que voltou e o que faltou são duas linhas diferentes, e é isso que tira a ambiguidade do documento.

### E — `ACESSORIOS_DEVOLUCAO` sai do código (pendência nº 4 da F38)

**A régua desta frente: nenhum rótulo que o operador vê hoje pode mudar.** "Fone de ouvido" continua "Fone de ouvido" nas pendências antigas — a `0114` semeou os 7 slugs com exatamente os rótulos da constante, e é isso que torna a troca segura.

**E.1 — A fonte passa a ser `tipos_item`.** `ACESSORIOS_DEVOLUCAO`, `ACESSORIO_ROTULO` e `rotuloAcessorio` saem de `src/lib/dominio.ts`. Entra uma função **pura** de rótulo — sugestão: `rotuloTipoItem(slug, mapa)` em `src/lib/itens/rotulo-tipo.ts` — com **fallback pelo slug cru**, o mesmo `?? codigo` de hoje, que é o que mantém legível um slug histórico sem tipo correspondente. Quem exibe **passado** carrega o mapa de `listarTiposItem()` (**todos**, inclusive desativados); quem oferece **escolha** continua com os ativos.

**E.2 — As sete superfícies.** A lista é de 29/08 — **refaça o `grep` você mesmo** (`ACESSORIOS_DEVOLUCAO|ACESSORIO_ROTULO|rotuloAcessorio`) e trate o que achar:

1. `src/components/ativos/linha-do-tempo.tsx` — itens faltantes na linha do tempo
2. `src/components/ativos/pendencias-item-ficha.tsx`
3. `src/components/pendencias/fila-pendencias-tabela.tsx`
4. `src/components/relatorios/tabela-entradas.tsx` — **o ponto perigoso, ver E.3**
5. `src/components/movimentacoes/nova/resumo-revisao.ts`
6. `src/lib/ajuda/derivacao.ts` (`rotulosAcessorios`) — ver E.4
7. `src/lib/termos/devolucao.ts` (`observacaoSugestao`) — comportamento **idêntico** para os 7 slugs, provado por teste

Client Component recebe o mapa **por prop**, do Server Component que já o renderiza (a fronteira do `fronteira-rsc.test.ts`). Nada de import de query em módulo cliente.

**E.3 — O relatório e o visualizador por senha.** `tabela-entradas.tsx` também serve quem entrou por **senha**, e essa sessão roda com o client **administrativo** (service_role) resolvido em `resolverAcessoRelatorio`. Uma leitura de `tipos_item` feita com `createClient()` dentro da superfície do relatório devolveria **vazio** para o viewer, e o relatório impresso sairia com slug cru — defeito que passa por todo teste de operador. A leitura sai do **client resolvido**, como as demais de `queries/relatorios/**`. `tipos_item` **não** está entre os proibidos do `fronteira-viewer.test.ts` (é tabela de inventário), mas leia o tripwire antes e diga no relatório que ele foi consultado.

**E.4 — A ajuda para de enumerar.** `rotulosAcessorios()` morre com a constante, e a frase de `src/lib/ajuda/conteudo/devolucao-e-triagem.ts` ("Checklist de devolução (acessórios conferidos): carregador, mochila…") passa a **apontar o cadastro**, que é o que virou verdade na F38: a lista vem do catálogo de tipos e o administrador acrescenta o que quiser em Administração → Tipos de item. A página de conteúdo é módulo **estático, sem banco** — não invente leitura assíncrona ali, e não mova a lista para dentro dela (seria a mesma constante com outro nome).

**E.5 — A guarda TS↔SQL inverte.** `src/lib/validators/tipos-item-sql.test.ts` prova hoje que a constante e o seed da `0114` são o mesmo conjunto; sem o lado TS, ela perde o sentido. Substitua por uma guarda que continue protegendo o que importa: os **7 slugs históricos** — `carregador`, `mochila`, `mouse`, `teclado`, `mousepad`, `fone`, `cabo` — seguem no seed da `0114`, na mesma ordem e com os mesmos rótulos, porque são eles que `movimentacoes.itens_faltantes` e `pendencias_item.item` citam em produção. Se não der para manter uma guarda honesta, **diga isso por escrito no relatório** em vez de apagar a proteção em silêncio.

**E.6 — Os únicos testes existentes que esta ordem autoriza a mudar** são **quatro arquivos**, e a autorização é limitada:

1. `src/lib/dominio.test.ts` — os casos que exercitam a constante saem com ela;
2. `src/lib/validators/tipos-item-sql.test.ts` — a guarda invertida da E.5;
3. `src/lib/termos/devolucao.test.ts` e 4. `src/components/movimentacoes/nova/resumo-revisao.test.ts` — aqui a mudança permitida é **só a de assinatura**: `observacaoSugestao` e o contexto do resumo passam a receber o mapa de rótulos, e **os rótulos esperados continuam idênticos** (`Mouse`, `Teclado`, `Carregador`, `Fone de ouvido`). Se você se pegar trocando o valor esperado, parou de ser adaptação de assinatura e virou regressão: conserte a causa.

**Nenhum outro teste muda.** Se outro quebrar, é sinal de que um rótulo mudou de verdade — conserte a causa, não o teste.

### F — Versão e emendas de documentação

Versão **`1.44.0`** pela regra 8 do `CLAUDE.md`, sem reinterpretação: bump só do campo `version`; entrada nova no topo de `src/lib/versoes/registry.ts` (data, `fase: 'F39'`, título e **2 a 6 mudanças em linguagem de operador** — "O termo de entrega agora lista o fone, o mouse e a mochila que saíram com o equipamento"; há teste que recusa jargão); entrada nova no topo do `CHANGELOG.md`; **tag anotada `v1.44.0` publicada**.

Emende ainda:

- **A árvore prescrita do `CLAUDE.md`.** ⚠ **Ela já diverge hoje**: `scripts/termos/` existe desde a F25 e não está lá. Isso é divergência **conhecida** — **não pare por causa dela**; corrija-a nesta fase, junto com `src/lib/termos/acessorios.ts`, o módulo de rótulo da §E.1 e `docs/f39-evidencias/`.
- **O §2 do `CLAUDE.md`**, que hoje diz que a constante "segue viva como fallback de rótulo do histórico, e a remoção dela é da F39" — reescreva para o que passa a valer.
- `docs/ESPECIFICACAO.md` (§6/§7 e o verbete de `tipos_item`), `docs/PLANO-TERMOS.md` (as tags dos 5 modelos mudaram — a tabela de tags tem de refletir isso), `docs/MATRIZ-REGRAS.md` (**R-MOV-04** cita `ACESSORIOS_DEVOLUCAO` e um número de linha de `dominio.ts` que vai deixar de existir), `README.md`, `docs/prompts/README.md` (linha F39), `docs/PLAN-F36-F39.md` (marque o §6 como executado e registre as divergências desta ordem), `docs/DIVIDA-TECNICA.md` (item **L** — diga o número de linhas de `termos.ts` antes e depois).
- ⚠ **Uma afirmação que fica falsa no banco, e que esta fase NÃO conserta:** o `comment on column public.tipos_item.slug` (`0114`) diz "Espelhado em ACESSORIOS_DEVOLUCAO (src/lib/dominio.ts) com guarda TS↔SQL". Depois da §E isso deixa de ser verdade, mas corrigir exigiria migration, e o Escopo desta fase manda `git diff supabase/` **vazio**. O comentário **fica como está** e vira **pendência declarada** no relatório, com a frase certa já escrita para quem pegar a próxima migration.
- `docs/DECISOES.md`, **uma ata por decisão**: a cláusula aprovada e o ponto de inserção em cada modelo · a marcação em três parágrafos · o formato com quantidade e o corte por `e mais N` · o recorte do `pendencia_item_id is null` na devolução · `tem_acessorios` derivado do texto final · a inversão da guarda TS↔SQL · a ajuda que para de enumerar · o que o pacote de evidências prova e o que não prova.

## Critérios de aceitação

1. **O papel diz o que foi junto.** Entrega com periféricos → o termo de responsabilidade traz a linha `Acompanham o equipamento os seguintes acessórios e periféricos: Fone de ouvido, Mouse (2), …`; devolução com "Voltou" → `{outros_componentes}` lista o que voltou. Provado pelos arquivos renderizados no pacote de evidências, não por afirmação. **E o inverso também é critério:** quando a conferência não gerou lançamento (lote misto, ponte sem item — §C.3), o papel **não** afirma silenciosamente que nada acompanhou: o aviso aparece antes de gerar.
2. **Sem periférico, o documento é o de hoje.** Renderizando o modelo NOVO (com `tem_acessorios` falso) e o modelo **do SHA da baseline** (§A.4 — nunca `HEAD`) com o **mesmo** payload: o texto extraído (`<w:t>` concatenados) é **idêntico** e a contagem de `<w:p>` é **igual** — nenhum parágrafo vazio, nenhum marcador de lista órfão. Se sair byte a byte, diga; se não sair, explique cada byte de diferença.
3. **Os 5 mudaram só onde deviam, e só eles.** Saída do script em modo conferência colada no relatório: partes idênticas menos `word/document.xml`, XML anterior reconstituível, +3 `<w:p>` por modelo, foro e linha da assinatura intactos. `git diff --stat` mostra **5** `.docx`, não 7. Rodar o script de novo diz "já inserido" e não grava.
4. **A função pura decide sozinha**, com teste para cada caso da §B — incluindo o corte por limite nos dois campos (600 e 400) e o descarte de item sem tipo com a contagem certa.
5. **O que voltou e o que faltou não se confundem.** No mesmo papel, `{outros_componentes}` traz o que foi conferido como devolvido e `{observacao}` o que faltou, com o texto de hoje — provado **em tela**, numa devolução com um item "Voltou" e outro "Faltou". As duas exclusões da §C.2 (`estorna_id`, `pendencia_item_id`) são provadas **em teste**, alimentando o leitor com linhas marcadas e verificando que não entram na linha: o dado de hoje não produz esses casos (a §C.2 explica por quê), e por isso a prova é de teste, não de tela — dizer o contrário no relatório seria autoverificação desonesta.
6. **Editar continua valendo.** Limpar o campo no diálogo faz a seção sumir do documento; digitar a linha à mão faz aparecer — porque `tem_acessorios` deriva do texto final, no servidor.
7. **Termo antigo reabre sem quebrar.** Snapshot sem a chave `acessorios` abre com a sugestão; chave presente-e-vazia continua vencendo. Nenhum `.docx` do Storage foi alterado.
8. **A constante morreu e nenhum rótulo mudou.** `grep -rn "ACESSORIOS_DEVOLUCAO\|ACESSORIO_ROTULO\|rotuloAcessorio" src/ scripts/` volta **vazio**; as sete superfícies exibem exatamente os rótulos de antes (o do `fone` incluso); e o relatório visto pelo **visualizador por senha** mostra rótulo, não slug — conferido nesse caminho, não só no do operador.
9. **A fase sabe o que consegue provar em produção, e diz.** Duas medições só-leitura de 29/08/2026, que você **refaz** antes de fechar: **7 dos 18 itens** do catálogo têm `tipo_id` (`itens.tipo_id` nasce nulo na `0114` e nenhuma migration o preenche) — os outros 11 são silenciosamente descartados da linha, com o aviso da §C.3; e **`lancamentos_item.movimentacao_id` está preenchido em ZERO linhas** de produção, porque a F38 subiu em 28/08 e ninguém registrou entrega pelo caminho novo ainda. Consequência que o relatório tem de escrever com todas as letras: **nenhuma movimentação existente em produção produz linha de acessório hoje** — a fase se prova no ensaio e nos testes, e em produção só na primeira entrega registrada com "Itens que vão junto". Não force um registro em produção para provar; conte, diga, e deixe como pendência nomeada.
10. **Zero banco, zero dependência.** `git diff supabase/` vazio; `npm run db:types` sem diff; no `package.json`, só a linha `version`; nenhuma entrada nova em `dependencies`/`devDependencies`.
11. **Nada de dado real.** Payloads, evidências e testes 100% fictícios (`WAP0001234`, "Fulano de Tal"). Nenhum arquivo de `docs/f39-evidencias/` contém nome de colaborador ou patrimônio real.
12. **Portões:** `npm run lint` · `npm run test` · `npm run build` limpos, com a baseline colada ao lado; a contagem de testes antes e depois; **nenhum teste existente removido** além dos autorizados na §E.6; CI verde (o job `banco` roda de qualquer forma — esta fase não toca função nem trigger, então a regra F17 não se aplica: diga isso no relatório em vez de rodar roteiro por hábito); deploy READY e smoke pós-deploy OK.
13. **Versão e relatório:** `1.44.0` no `package.json`, no registry, no `CHANGELOG.md` e na **tag anotada publicada**; `docs/RELATORIO-F39.md` com o checklist autoverificado item a item, evidências reais (saídas de comando, o par antes/depois dos modelos, contagens), as decisões, as pendências e a seção **"o que este relatório NÃO prova"**.

## §V — Verificação (rode de verdade, itere até passar)

Meça a **baseline antes de mudar qualquer coisa** e cole no relatório: `npm run lint`, `npm run test` (com a contagem de testes), `npm run build`, `git rev-parse HEAD`, o `sha256` dos 7 `.docx` e a saída de `npm run db:types` (que tem de continuar sem diff no fim).

A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a **causa raiz**, repita. Nunca suprima erro, nunca desabilite, pule ou delete teste para passar; teste existente só muda pela autorização explícita da §E.6, e isso vai **nomeado** no relatório.

Suba o dev server e percorra, nos dois temas: **(a)** entrega com "Itens que vão junto" (2 tipos, um deles com quantidade 2) → gerar o termo de responsabilidade → conferir a linha **no preview do diálogo** (`docx-preview`) **e no arquivo baixado**; **(b)** termo de um ativo **sem** periférico nenhum → a seção some, o documento fica igual ao de hoje; **(c)** devolução com um item "Voltou" e outro "Faltou" → conferir `{outros_componentes}` e `{observacao}` no mesmo papel; **(d)** limpar o campo e gerar de novo → seção some; digitar à mão e gerar → seção aparece; **(e)** reabrir um termo salvo **antes** desta fase; **(f)** o relatório ao vivo pela porta do **visualizador por senha**, conferindo que os itens faltantes saem com rótulo.

Ao final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão, atenção especial a: sobrou alguma linha vazia ou marcador órfão quando não há periférico?; algum `.docx` mudou além dos 5?; a cláusula de foro ou a linha da assinatura foram tocadas?; `{observacao}` mudou de texto?; um `retorno` de pendência recuperada vaza para `{outros_componentes}`?; o teto de 600/400 pode estourar e derrubar a geração?; `tem_acessorios` pode discordar do que está escrito no campo?; algum rótulo mudou para o operador por causa da §E?; a leitura de `tipos_item` no relatório passa pelo client resolvido (o viewer veria vazio)?; algum Client Component importa valor de módulo de servidor?; alguma contagem nasceu de leitura truncada?; a árvore do `CLAUDE.md` bate com a estrutura real **depois** da fase?; algum dado real entrou em evidência ou teste? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise até limpar.

## Como trabalhar

Explore com subagentes paralelos (o pacote `.docx` e o precedente do `retaguear-cidade.mjs`, com a estrutura XML dos 5 modelos medida, não presumida; o caminho do termo de ponta a ponta, do `prepararTermo` ao render e ao snapshot; as sete superfícies da constante, com o caminho do visualizador por senha incluído; o que a F38 grava e com qual `movimentacao_id`, lido das migrations `0116`/`0119` e do código das actions) e escreva um `PLAN.md` autossuficiente antes de implementar — com a marcação XML final da seção nova, a assinatura da função pura e do leitor novo, a lista arquivo a arquivo da §E com quem passa o mapa a quem, e a lista dos testes existentes que **não** podem mudar.

Implemente em incrementos testáveis e independentes, **nesta ordem** — ela é escolhida para dar rollback limpo e para o teste vir antes do papel: **§B função pura + testes** → **§A script + os 5 modelos + evidências + guarda de tags** → **§C preenchimento e diálogo** → **§D devolução** → **§E remoção da constante** → **§F versão e documentação**. Verifique a cada um. A §E vem depois de C e D de propósito: as duas tocam `termos/devolucao.ts`, e é o ponto de encontro.

## Autonomia, decisões e git

Você está rodando em modo autônomo (`CLAUDE.md`): ninguém vai responder perguntas — não pare para perguntar nem espere confirmação, inclusive sobre os `.docx` (as três pontas do §10 do plano já foram fechadas pelo Johnny; estão no cabeçalho desta ordem). Régua: (1) esta ordem; (2) `docs/PLAN-F36-F39.md` §6, a spec e as convenções do repositório; (3) opção **mais simples e reversível**, registrada. Toda decisão não-óbvia vira ata em `docs/DECISOES.md` (data · contexto · escolha · motivo). Falha persistindo após ~3 tentativas: **mude de abordagem** e registre a troca. Bloqueio real (conversor de PDF ausente, MCP fora do ar): contorne se for seguro; senão siga com o resto da fase e registre a pendência com o que falta — **nunca** force a mão em produção para destravar. Git: commits pequenos e frequentes em pt-BR (`feat(f39): …`, `fix(f39): …`), direto na `main` ou em branch `f39` com merge próprio ao fechar o checklist; os `.docx` entram como binário no mesmo commit do script que os gerou. NUNCA force push, `reset --hard`, `git checkout -- .`, deleção de teste para passar, `.env*` ou dado real em commit.

## §R — Rollout

1. **Não há banco.** Nenhuma migration, nenhum `notify pgrst`. O deploy é o único evento — e é por isso que esta fase é a mais reversível da série: reverter é um deploy do commit anterior, com os `.docx` voltando junto.
2. CI verde (lint + test + build + job `banco`), deploy READY na Vercel, **smoke pós-deploy** OK.
3. **Antes da conferência, conte** (critério 9): itens com `tipo_id` e lançamentos com `movimentacao_id` em produção. Com zero lançamento vinculado — a leitura de 29/08 —, **não existe em produção termo "com periférico" para gerar sem inventar movimentação**: confira o caminho **sem** periférico (que é o de todo termo emitido hoje, e o que o critério 2 protege), prove o caminho **com** periférico no **ensaio**, e escreva os dois números no relatório. Havendo lançamento vinculado quando você chegar: conferência nas telas tocadas e nos dois temas — gerar um termo de responsabilidade **com** e outro **sem** periférico, e um de devolução; conferir o arquivo baixado. Use ativo real de produção **apenas para conferir na tela** — nenhum dado real vai para o repositório, para o relatório ou para as evidências.
4. Tag anotada `v1.44.0` publicada apontando para o commit deployado.
5. Encerramento: `docs/RELATORIO-F39.md` (checklist autoverificado, evidências, o par antes/depois dos 5 modelos, decisões, pendências, "o que este relatório NÃO prova") + todas as emendas de documentação da §F + resumo final de ~10 linhas em pt-BR na resposta, dizendo **onde estão os arquivos que o Johnny precisa olhar** para a conferência visual.

## Idioma

Narrativa, atas, relatório e UI em **pt-BR**; identificadores de domínio em português sem acento (`acessorios`, `tem_acessorios`, `tipos_item`, `rotuloTipoItem`, `outros_componentes`); utilitários e infra em inglês; commits em pt-BR no padrão conventional da casa. O texto da cláusula nos `.docx` é o aprovado, com acentuação correta e caixa respeitando cada modelo.

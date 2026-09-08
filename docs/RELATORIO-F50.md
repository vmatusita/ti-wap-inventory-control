# Relatório F50 — A fronteira da leitura

**08/09/2026 · v1.55.0 · branch `f50-fronteira-da-leitura` · PR #33**

O visualizador por senha lê o relatório com o client **administrativo** — `service_role`, que ignora
a RLS —, porque quem entra por senha não tem identidade no banco. Para ele, o único muro é o **código**
das queries de relatório. Os dois tripwires que guardavam esse muro derivavam a superfície da **pasta**,
e um deles estava furado havia três fases: a F39 pôs `queries/tipos-item.ts` no caminho do viewer e
ninguém a declarou.

**A pasta mente; a assinatura não.** Esta fase inverte os dois tripwires e cria — trivialmente hoje —
os lugares onde o recorte de tenant vai encostar. Nenhum recorte foi feito; nenhum `empresa_id` existe
em lugar nenhum.

---

## 1. O que mudou, por arquivo

| Arquivo | O quê | Por quê |
|---|---|---|
| `src/lib/queries/relatorios/fronteira-viewer.test.ts` | Reescrito: superfície derivada da **assinatura**, listas **brancas** de tabelas e RPCs, recusa de apelido do client | A pasta não enxerga quem aceita client resolvido de fora dela; deny-list não cobre tabela que ainda não nasceu |
| `src/components/relatorios/confinamento-viewer.test.ts` | Só `arquivosDaSuperficie()` trocada, por fecho de imports + `SUPERFICIE_MINIMA`; extrator de `href` corrigido; 4ª exceção | Pré-requisito declarado da F61, que leva componentes de `layout/` para dentro das telas de relatório |
| `src/lib/queries/relatorios/comum.ts` | `resolverFilialPorSlug` lê o `error` e lança | Uma linha separa "quebrou" de "quebrou em silêncio" |
| `src/lib/queries/erro-engolido.test.ts` | **Novo** — a varredura congelada | Para o sétimo caso não nascer sem alguém decidir |
| `src/lib/escopo/chave.ts` | **Novo** — `chaveDoEscopo`, `nomeDoCanal`, `chaveDeStorage` | Um lugar só para os dois consumidores (canal de realtime e chaves de storage) |
| `src/lib/relatorios/assinatura-realtime.ts` | **Novo** — `opcoesDaAssinatura` | Três objetos montados à mão divergem sozinhos |
| `src/components/relatorios/realtime-refresh.tsx` | Canal parametrizado; as três assinaturas saem de uma função | O gancho do escopo, sem filtro inventado |
| `src/components/relatorios/auto-refresh-decisao.ts` | **Novo** — `deveRefrescar` (função pura) | Sem jsdom, e jsdom é dependência nova que a regra 3 proíbe |
| `src/components/relatorios/viewer-auto-refresh.tsx` | Pausa em aba oculta, refresh único ao voltar, coalesce | A rota mais cara rodava a cada 60 s numa aba esquecida |
| `src/components/layout/permissoes.ts` | `podeLer(p)` | O ponto único da pergunta de leitura na UI |
| `src/app/(app)/layout.tsx` | Resolve `podeLer(operador)` e desce por prop | Junto das outras três perguntas de cargo |
| `src/components/layout/paleta-comandos.tsx` | Consome `podeLer` no filtro de navegação; item 3 do cabeçalho atualizado | O ponto exato que a F49 marcou |
| `src/components/itens/lancar-item-campos.tsx` | Comentário corrigido (só o comentário) | Ele afirmava algo factualmente errado |
| `src/components/relatorios/use-filtros-tabela.ts` | Cabeçalho em prosa | O hook filtra o que **já chegou** |
| `supabase/migrations/0129_*.sql` | `pode_ler_arquivo_termo` + policy + cinco `revoke` | A fechadura de leitura, e o backlog da F49 §12.2 |
| `supabase/migrations/0130_*.sql` | Cinco `grant … to authenticated` | O CI provou que o `revoke` de PUBLIC precisava do par |
| `supabase/tests/storage_termo.sql` | **Novo** — 10 asserções | Prova que quem lia continua lendo |
| `supabase/tests/catalogo_secdef.sql` | `k_invoker_anon` vazia, `k_invoker_revogadas` + asserção 6c | A lista mudou de papel: de exceção tolerada para revogação provada |

---

## 2. Os números MEDIDOS, contra o que a ficha previa

| | Ficha / ordem | **Medido** | Divergência |
|---|---|---|---|
| Módulos de `queries/**` que aceitam client resolvido | 12 | **14** | A ordem contava por duas formas de assinatura; há três |
| Formas de aceitar client | 2 | **3** | `Awaited<ReturnType<typeof createClient>>` não estava prevista |
| Arrastados pela regra | 4, incluindo `pendencias-detalhe.ts` | **6**, e `pendencias-detalhe.ts` **não é um deles** | Ele só recebe client em funções INTERNAS |
| Tabelas na lista branca | 9 | **9** (mas a superfície de hoje tem **8**) | A nona só existe porque `tipos-item.ts` entrou |
| RPCs na lista branca | 7 | **7** | Bate |
| `const { data } = await` em `queries/**` | 4 | **6** | Três usam renomeação (`const { data: compra } = await`) |
| `filiais.length` / `filiais[0]` | ~11 | **22** (18 código + 4 comentário) | Classificados: **1** autorização, 17 ergonomia |
| `ehOperador` na superfície de relatório | 53 | **57 ocorrências em 46 linhas**, 9 arquivos | Censo, não conversão |
| Asserções do `confinamento-viewer` | 7 | **8** | Uma nona ocorrência de `it(` era `split(` |
| Superfície do confinamento | — | 46 por pasta → **134** derivada | 7 de `components/layout/` |
| Montagens do `RealtimeRefresh` | 3 | **3** — mas **duas não são de relatório** | São `/itens` e `/itens/historico` |
| Chaves de storage `wap:` | 7, "3 de localStorage" | **7** + `wap-sidebar`; só **1** é localStorage | A 3ª seria a do `next-themes`, cujo nome não está no repositório |

### 2.1 Os 14 módulos e o destino de cada um

**Superfície (9):** `relatorios/comum.ts`, `relatorios/estoque.ts`, `relatorios/itens.ts`,
`relatorios/movimentacoes.ts`, `relatorios/pendencias.ts`, `relatorios/snapshot.ts`,
`relatorios/index.ts`, `gerados.ts`, `filiais.ts` — **mais `tipos-item.ts`**, o furo da F39.

**Exceções nominais (5), com o call-site medido:**

| Arquivo | Quem chama | Com que client |
|---|---|---|
| `conflitos.ts` | `pendencias/page.tsx:181`, `actions/conflitos.ts:172,239,240` | sessão do operador |
| `import-logs.ts` | `actions/importar.ts`, `admin/importar/page.tsx:35` | sessão do operador |
| `ativos.ts` | `queries/movimentacoes.ts:285` (interno) e a rota `/ativos` | sessão do operador |
| `colaboradores.ts` | `actions/colaboradores.ts:382`, `actions/itens.ts:105`, `actions/movimentacoes.ts` | sessão do operador |
| `queries/itens.ts` | `actions/itens.ts:127`, `actions/movimentacoes.ts:515`, `actions/termos.ts:262,360` | sessão do operador |

**Prova estrutural:** a superfície inteira importa de `@/lib/queries/` apenas `filiais`, `relatorios`
e `rpc-filial` — nenhum dos cinco.

### 2.2 As 22 ocorrências de `filiais.length`, classificadas

**Autorização (1):** `components/itens/lancar-item-campos.tsx:139` — `podeCadastrar={filiais.length > 0}`.

**Ergonomia (17):** pré-seleção de default (`nova-compra-form.tsx:362`, `lancar-item-dialog.tsx:102`);
troca de widget por aviso (`nova-compra-form.tsx:1199`, `lancar-item-campos.tsx:74`); pluralização de
rótulo (`itens-table.tsx:471`); matriz de colunas (`itens-table.tsx:345`); texto de estado vazio e
recorte de leitura `< filiais.length` (`ativos/page.tsx:134`, `movimentacoes/page.tsx:114`,
`pendencias/page.tsx:119`, `itens/page.tsx:203`, `itens/historico/page.tsx:167`); viabilidade de
transferência (`itens/page.tsx:283,358`); link de conferência (`itens/page.tsx:265`); explicação de
estado (`itens/conferencia/page.tsx:76`); linha do menu (`user-menu.tsx:118`); contagem em tela de
admin (`admin/filiais/page.tsx:25`).

**Comentário (4):** `ativos/page.tsx:130`, `movimentacoes/page.tsx:113`, `pendencias/page.tsx:114`,
`lib/auth/papeis.ts:173`.

**Reclassificação contra o parecer inicial:** `itens/page.tsx:283` e `:358` (`filiaisEscrita.length >= 2`)
foram classificados como autorização por um subagente e **reclassificados** para ergonomia: `>= 2` não
deriva **cargo**, deriva **viabilidade** — transferir item exige origem e destino, e um único destino
torna a operação impossível, não proibida. A pergunta de cargo está literalmente ao lado (`escreve &&`).

### 2.3 O censo de `ehOperador` — contado, não convertido

**57 ocorrências em 46 linhas**, 9 arquivos de produção: `corpo-relatorio.tsx` (8), `corpo-relatorio-v2.tsx`
(8), `[filial]/page.tsx` (7), `tabela-saidas.tsx` (4), `tabela-transferencias.tsx` (4), `celulas.tsx` (3),
`manutencao-casos.tsx` (3), `tabela-entradas.tsx` (3), `gerados/[id]/page.tsx` (2).

⚠ **`ehOperador` não é cargo.** É `acesso.modo === 'operador'` — a fronteira das **duas portas** (sessão
Supabase × visualizador por senha), não uma distinção entre os quatro papéis. Converter para `podeLer`
seria trocar uma pergunta por outra. Fica para a F70 decidir.

---

## 3. As seis decisões obrigatórias

Todas em `docs/DECISOES.md` (2026-09-08 · F50), com contexto, escolha, motivo e reversão. Em resumo:

1. **Os arrastados** — `tipos-item.ts` entra; cinco viram exceção nominal; `pendencias-detalhe.ts` não é
   nem uma coisa nem outra. **Custo que decidiu:** nenhum dos cinco é importado pela superfície.
2. **O `filter:` do Realtime** — **nenhum emitido**. Três medições independentes: a tela consolidada
   monta o mesmo componente sem prop e precisa acordar com qualquer filial; duas das três montagens não
   são de relatório; `anotacoes` não tem `filial_id`. **Custo:** um filtro errado não dá erro, só faz o
   canal parar de acordar em silêncio.
3. **`chaveDoEscopo`** — módulo puro com dois compositores. **Custo:** `chaveDeStorage('compra:defaults')`
   devolve a chave literal de hoje; um prefixo diferente apagaria todo rascunho salvo no primeiro deploy.
4. **Travar sem jsdom** — função pura `deveRefrescar`. **Custo:** a alternativa provava grafia, não
   comportamento; jsdom é dependência nova, proibida pela regra 3.
5. **`lancar-item-campos.tsx:139`** — exceção nominal, conserto para a F70. **Custo:** a troca faria o
   operador **sem vínculo** passar a ver o botão de cadastrar pessoa, e provavelmente a usá-lo com
   sucesso (cadastro de pessoa não é matéria de filial). Mudança visível não é desta fase.
6. **O `database.ts`** — caminho (a): apply em produção + `npm run db:types`. **Custo:** o MCP estava
   conectado, então não houve por que hand-fixar.

---

## 4. As cinco decisões que a execução obrigou

1. **A `0066` NÃO foi editada**, apesar de a ordem pedir. Migration aplicada nunca se edita, e desde a
   F46 isso é defesa executável. Cheguei a fazer a edição e a revertei. A regra permanente vence o
   pedido da ordem; o histórico correto está na `0129`.
2. **O `revoke ... from anon` era no-op silencioso** — ver §6.
3. **`k_invoker_anon` esvaziada exigiu asserção nova**, não só lista vazia: `array_length` de array
   vazio é NULL, e `assert_zero_de` levanta exceção com universo nulo. Esvaziá-la crua faria a 6b
   **explodir** em vez de acusar, abortando o bloco antes da linha `FIM`.
4. **O falso negativo no detector de `href`** — ver §5.
5. **As raízes do grafo incluem o chrome do viewer** — ver §5.

---

## 5. Os dois achados que mudaram o desenho

### 5.1 O fecho puro perderia as duas peças mais sensíveis

Partir só das rotas de `/relatorios/**` **perde** `viewer-header.tsx` e `viewer-nav.tsx`: os dois são
importados por `app/(app)/layout.tsx`, o layout do grupo inteiro, cujo caminho não contém o segmento
`relatorios`. São justamente as peças que carregam a navegação real do visualizador — é `viewer-nav.tsx`
que a última asserção do arquivo confere ter `lerHrefAoVivo`.

Seguir a ordem ao pé da letra teria **trocado a rede por um furo, com cara de melhoria**. As raízes
passaram a incluir o chrome. Tomar `(app)/layout.tsx` como raiz resolveria pelo caminho errado: ele
serve também o shell do operador, e traria dezenas de `href` legítimos como falsos positivos.

### 5.2 O detector de `href` tinha um falso negativo

`RE_HREF` exigia template sem crase por dentro, e `link-ajuda.tsx` escreve
``href={`/ajuda/${pagina}${ancora ? `#${ancora}` : ''}`}`` — a crase aninhada fazia o href sumir da
varredura **inteira**. Enquanto o componente morava fora da superfície não havia consequência; a
derivação o trouxe para dentro.

O cabeçalho do próprio arquivo diz que um tripwire pode dar falso positivo mas **não pode dar falso
negativo**. Essa doutrina obrigou a correção: o extrator deixou de ser regex e passou a contar `${` e
`}`. `link-ajuda.tsx` virou a **quarta** exceção, com mecanismo novo (`guardaEm`), porque a guarda de um
componente reusado mora nos **chamadores** — e as duas páginas escrevem a mesma pergunta de formas
diferentes (`ehOperador` × `acesso.modo === 'operador'`), então cada uma traz o seu literal.

---

## 6. O apply em produção, e o que o ensaio pegou

O projeto de ensaio (`sgmvldiizsrjbxzzpmhh`) está **INACTIVE**. Cada migration foi validada em
`begin; … rollback;` contra produção antes do apply — valida sintaxe e efeito sem persistir. Nenhum
roteiro de teste rodou contra produção (regra permanente 5).

### 6.1 A `0128`, pendente havia três fases

| Verificação | Esperado | Medido |
|---|---|---|
| Colunas | 8, todas anuláveis | **8, todas `YES`** |
| RLS + policy | `true`, 1 policy | **`true`, "dev le backup f6a · SELECT · {authenticated}"** |
| Snapshots | **2** | **2** |

Ela ainda **removeu um alerta** do advisor: `_bkp_relatorios_gerados_f6a` não aparece mais em
`rls_enabled_no_policy`.

### 6.2 A `0129`, e o no-op que o ensaio pegou

O ensaio da versão travada devolveu **`ainda_com_anon = 5`** depois dos cinco `revoke`. A ACL era:

```
{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

O `=X` sem papel à esquerda é o grant ao pseudo-papel **PUBLIC**, de onde `anon` herda. Revogar só o
grant próprio deixava o segundo caminho de pé, e o comando "rodava com sucesso" sem mudar nada. É por
isso que a `0069` escreve `from public, anon` — e a ACL de `pode_escrever_arquivo_termo` já era a limpa.

Corrigido e re-ensaiado: `ainda_com_anon = 0`, `auth_preservado = 5`, 88 objetos intactos.

| Verificação pós-apply | Medido |
|---|---|
| `pode_ler_arquivo_termo` | `prosecdef = true`, `anon = false`, `auth = true`, ACL idêntica à da irmã |
| Policy | `((bucket_id = 'termos') AND (SELECT pode_ler_arquivo_termo(objects.name)))` |
| As cinco INVOKER | `anon_executa = false`, `auth_executa = true` |
| Objetos do bucket | **88** antes, **88** depois |
| Smoke | **108 OK · 1 aviso pré-existente · 0 falha** |

### 6.3 A `0130`, que o CI obrigou

O `banco-sem-docker` reprovou com **"permission denied for function chave_identidade_ativo"**. A `0129`
revogou de PUBLIC — obrigatório — mas não reconcedeu a `authenticated`. Em produção isso não teve
efeito (o Supabase concede explicitamente ao criar objeto em `public`); **no banco do CI**, construído
pelas migrations mais `supabase/ci/`, esse grant não existe, e `authenticated` alcançava as cinco só
pela herança de PUBLIC.

É uma divergência CI × produção que produção sozinha **não mostraria**. A `0069` já escrevia o par junto;
segui metade do molde. Corrigido por migration **nova** — a `0129` já estava aplicada, e migration
aplicada não se edita.

---

## 7. As doze sabotagens, com saída real

Todas em `docs/f50-evidencias/`.

| # | O quê | Acusou? |
|---|---|---|
| **vermelha** | O tripwire novo, antes de declarar qualquer arrastado | ✅ acusou os **6**, `tipos-item.ts` incluído |
| A | `.from('senhas_acesso')` num módulo da superfície | ✅ lista branca **e** deny-list residual |
| B | `.rpc('alguma_coisa_nova')` | ✅ |
| C | `const c = acesso.client` | ✅ nomeando a rota |
| D | Módulo novo em `queries/` com client, não declarado | ✅ |
| E | Componente de `layout/` com href externo, importado por tela de relatório | ✅ pelo derivado — e a superfície **por pasta** passaria calada |
| F | Sétimo `const { data } = await` | ✅ nomeando a função |
| G | `podeCadastrar={filiais.length > 0}` num componente novo | ✅ duas camadas |
| H | `'empresa'` em `CampoFiltro` | ✅ duas asserções |
| **J** | `.from('ativos' + '_arquivo_oculto')` — concatenação com prefixo branco | ✅ **depois da correção**; antes passava |
| **K** | `export default function` com client | ✅ **depois da correção**; antes passava |
| **L** | `const { client } = acesso` | ✅ **depois da correção**; antes passava |

A sabotagem **I** (remover a chamada da função da policy e ver `storage_termo.sql` reprovar) **não foi
executada**: esta mesa não tem Postgres nem Docker desde a F46, e rodar o roteiro contra produção é
proibido pela regra permanente 5. O que existe no lugar é a asserção **4a** do próprio roteiro, que
confere que a policy cita `pode_ler_arquivo_termo` — ela roda no `banco-sem-docker`. Está registrado
como não-provado, não como provado.

---

## 8. A revisão adversarial, e os quatro achados que procederam

Quatro ângulos independentes, em contexto fresco. Dois voltaram **LIMPO** (Realtime/auto-refresh/`podeLer`;
migration/roteiro/escopo). Os outros dois trouxeram **quatro achados que procediam** — e três deles eram
furos **reais** na trava de leitura, cada um provado ao vivo com os 14 testes verdes. É o pior tipo de
defeito num tripwire: ele passa a dar sensação de rede sem ser rede.

1. **[GRAVE] Concatenação que começa com nome branco evadia as DUAS peneiras.**
   `.from('ativos' + '_arquivo_oculto')`: a varredura de literais capturava até a primeira aspa e
   devolvia `ativos` — que **está** na lista branca —, enquanto a de não-literais tinha `(?!')` e
   descartava de propósito tudo que começasse com aspa. **Era exatamente o vetor que a inversão para
   lista branca existe para fechar.** Corrigido por **uma** varredura que classifica: o argumento é
   lido até a vírgula ou parêntese de topo, e só conta como literal se for a constante inteira.
2. **[MODERADO-GRAVE] `export default function` era invisível** para o leitor de exports, então um
   módulo inteiro escapava da derivação. Para essa forma, a assinatura mentia tanto quanto a pasta.
3. **[MODERADO] A trava de apelido só pegava `const c = acesso.client`** — `const { client } = acesso`
   e `acesso['client']` apagam o rastro igual, e são sintaxe corriqueira.
4. **O comentário do `SUPERFICIE_MINIMA` prometia margem que o número não entregava:** dizia que uma
   "queda de dez" reprovaria, com piso 120 contra fecho de 134 (folga de 14). E o número documentado já
   estava velho — a própria F50 acrescentou três módulos depois de escrevê-lo. Piso para **125**, folga
   de nove, frase verdadeira.

As três correções viraram **asserção de comportamento** (17 no tripwire, não 14).

O revisor do ângulo 2 também confirmou, por medição independente com `git worktree`, que o fecho derivado
**contém a superfície antiga inteira** (0 perdidos), que as 8 asserções e as 3 exceções originais estão
intactas, que `guardaEm` pega a perda de guarda em **qualquer um** dos dois chamadores, e que o extrator
novo de `href` é **superconjunto estrito** do antigo (corrige dois falsos negativos, não regride nenhum).

---

## 9. Os 21 critérios de aceitação, autoverificados

| # | Critério | Situação |
|---|---|---|
| 1 | Superfície derivada da assinatura; `toContain('queries/tipos-item.ts')` | ✅ |
| 2 | Os arrastados declarados, cada um, com motivo medido | ✅ **6**, não 4; `pendencias-detalhe.ts` derrubado |
| 3 | Listas brancas com motivo por nome, provadas por sabotagem | ✅ A, B, **J** |
| 4 | Recusa de `const c = acesso.client` | ✅ C, **L** (3 formas) |
| 5 | Confinamento derivado, contém os fixos, `SUPERFICIE_MINIMA`, 8 asserções e 3 exceções mantidas | ✅ E |
| 6 | `resolverFilialPorSlug` lança, com comentário datado | ✅ |
| 7 | Varredura congelada, reprova o próximo | ✅ F — **6** congelados, não 4 |
| 8 | Canal parametrizado; três assinaturas de uma função; nenhum filtro não-provável | ✅ |
| 9 | Ata registra que o Realtime não passa por `lib/queries` | ✅ |
| 10 | `ViewerAutoRefresh` pausa, refresca uma vez, coalesce; RV-16 obedecido | ✅ |
| 11 | `podeLer` existe, consumido pela paleta; item 3 do cabeçalho atualizado | ✅ |
| 12 | Trava de `filiais.length`; Decisão 5 aplicada; ocorrências classificadas | ✅ G — **22**, não ~11 |
| 13 | Cabeçalho e `it('CampoFiltro não conhece a empresa')` | ✅ H |
| 14 | `0129` no molde da irmã, sem `coalesce`, `comment` explicando | ✅ |
| 15 | Cinco `revoke` com justificativa corrigida; `k_invoker_anon` esvaziada | ✅ + asserção 6c |
| 16 | `storage_termo.sql` com linha `FIM` e >0 asserções, dado sintético | ✅ 10 asserções |
| 17 | `db:lock` rodado; `db:types:diff` passa | ⏳ **no CI** |
| 18 | `lint`, `test`, `build`, `tsc` limpos; sem dependência nova; sem `empresa_id` nem bucket movido | ✅ 165 arquivos, 4114 testes |
| 19 | Emenda F50 a partir de R-ACC-40, contador atualizado | ✅ **248** |
| 20 | `1.55.0` no `package.json` e no registry; tag; CHANGELOG | ⏳ tag após o merge |
| 21 | PR mergeado com os dois checks verdes; `main` em repouso | ⏳ |

---

## 10. O que este relatório NÃO prova

1. **Tripwire de leitura é teste de CÓDIGO, não de banco.** O viewer continua rodando sob `service_role`,
   e **nenhuma RLS o segura**. As listas brancas provam o que as queries **escrevem**, não o que o
   Postgres permitiria. Um `service_role` continua podendo tudo; o que mudou é a chance de alguém
   escrever a query errada sem ser avisado.
2. **`SUPERFICIE_MINIMA` conta ARQUIVOS, não caminhos de execução** — e o grafo é **estático**. Import
   dinâmico (hoje inexistente na superfície, medido) o atravessaria sem ser visto.
3. **A policy nova do bucket não mudou quem lê HOJE, e não diz nada sobre depois da virada.** A função
   sequer consulta o `p_nome` que recebe: ela é o **lugar** onde a F67 vai encostar, pelo join com
   `termos_gerados`.
4. **O Realtime continua sem trava no Postgres.** Ele **não passa por `src/lib/queries`** e portanto
   **não herda recorte nenhum** que a virada ponha lá. `postgres_changes` entrega o **payload da linha**
   ao navegador, não um aviso de que algo mudou. A trava de verdade é RLS na publication
   `supabase_realtime`, que não existe — é F70.
5. **`podeLer` é sempre `true` hoje**, e por construção: o ramo que monta a paleta vive dentro do
   `if (operador)`. Ele não foi exercitado com `false` em produção porque esse caso não existe ainda.
6. **A prova por CARGO da leitura do bucket roda no CI, com dado sintético** — não contra os 88 objetos
   reais. Em produção, o que se provou é que a contagem não mudou e que o smoke passou.
7. **A sabotagem I não foi executada** (ver §7): esta mesa não tem Postgres desde a F46.
8. **Nada aqui é recorte por filial ou por empresa.** Nenhum `empresa_id` foi criado, em lugar nenhum.

---

## 11. Pendências e backlog

### 11.1 Nenhuma pendência de banco

Pela primeira vez em quatro fases, **não há migration pendente**: a `0128` (parada havia três fases), a
`0129` e a `0130` foram aplicadas em produção nesta sessão, com verificação pós-apply colada em
`docs/f50-evidencias/apply-producao.txt`.

### 11.2 Backlog nomeado para a F51

- Nada desta fase. A F51 (decomposição da RPC de import) segue como o plano a descreve.

### 11.3 Backlog nomeado para a F61

- **`chaveDoEscopo` nas 7 chaves de storage.** A função existe, com `chaveDeStorage(base)` já devolvendo
  a chave literal de hoje — e teste afirmando isso, para que a troca não apague rascunho de ninguém.
  Prioridade em `wap:compra:defaults`, a única `localStorage` com prefixo `wap:`, que guarda uma FILIAL.
- **`wap-sidebar` usa hífen**, não `:` — a única fora do padrão. Decidir se entra na normalização.

### 11.4 Backlog nomeado para a F70

- **`podeLer` ganha corpo**, com `empresaId` em `Permissoes`.
- **`lancar-item-campos.tsx:139`** — trocar `filiais.length > 0` por pergunta de cargo. Mudança de
  comportamento medida: o operador **sem vínculo** passaria a ver o botão de cadastrar pessoa (e
  provavelmente a usá-lo com sucesso, porque cadastro de pessoa não é matéria de filial). Decidir se é
  correção de bug ou mudança indesejada — os dois são defensáveis.
- **As 57 aparições de `ehOperador`** (46 linhas, 9 arquivos): decidir se a pergunta "operador logado ×
  viewer por senha" deve continuar espalhada. **Não convertidas de propósito** — é outra pergunta que a
  de leitura.
- **O `filter:` real do Realtime**, junto da RLS na publication `supabase_realtime`. O gancho
  (`opcoesDaAssinatura`) existe; o filtro não, e o motivo está medido na Decisão 2.

### 11.5 Backlog herdado, ainda aberto (entrega avulsa, PATCH)

- Comentário morto em `scripts/gen-types.ts` (cita o job `banco`, removido na v1.51.1);
- exclusão `_%` em `supabase/ci/impressao-schema.sql`.

### 11.6 Observação para quem cuidar do gerador de tipos

`npm run db:types` com a CLI 2.109.1 reformata genéricos do `database.ts` (parênteses em cláusulas
`extends`) além de acrescentar o que o banco ganhou. É output do gerador, não edição manual, e passa em
`tsc` e no build — mas produz diff maior do que a mudança real, o que dificulta revisar.

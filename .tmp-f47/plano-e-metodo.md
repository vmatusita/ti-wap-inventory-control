## ficha_f47

### F47 — O injetor de mutações e o gate de deriva (docs/PLANO-MULTIEMPRESA.md, §5, Bloco A)

**Objetivo.** Provar que os roteiros SQL conseguem ficar vermelhos, e fazer o CI descobrir sozinho quando `database.ts` ou o schema de produção derivaram do repositório.

**Entra.**
- **`scripts/db/run-mutation-tests.mjs`.** Execução de controle primeiro (sem mutação, tudo verde — sem ela, um roteiro já vermelho faria tudo "ser detectado"). Cada mutação declara `derruba: ['<cenário>']` e o injetor exige **o cenário certo**, não "deu ✗ em algum lugar". Lote inicial de 20 a 30 quebras, concentradas onde a virada vai depender: `papeis_rls.sql`, `seguranca_catalogo.sql`, `cargo_dev.sql`, `dev_destrutivo.sql`, `import_substituir.sql`, `conflito_filiais.sql` — com pelo menos uma do tipo **"a guarda confere o papel e esquece o escopo"**, que é a quebra cross-tenant clássica. O helper `corpoVigente(assinatura)` (resolve o corpo vivo varrendo as migrations da maior para a menor) é reusado pela F51 e é o antídoto parcial da dívida X. `npm run db:test:mutations`, no `push` da `main` e em PR marcado.
- **Gate de tipos por CONJUNTO, não `diff -u`.** Gerar com `supabase gen types typescript --local` e comparar extraindo de cada lado o conjunto (tabela, coluna) de `Row`/`Insert` e os nomes de `Functions`, falhando só quando o repositório **não contém** o que o banco tem. O `diff` estrito é frágil por três motivos verificados: `PostgrestVersion` vem do servidor; o arquivo já foi editado cirurgicamente à mão de propósito (`DECISOES.md:448`, para preservar hand-fixes de nulabilidade que a CLI regride); e produção tem objeto que nenhuma migration cria. Um passo de CI que falha por motivo legítimo é desabilitado na terceira vez.
- **O destino de `_bkp_relatorios_gerados_f6a`**, decidido e registrado: ela existe em produção (linha 17 de `database.ts`), nenhuma migration a cria, não tem RLS, e `seguranca_catalogo.sql:73` a exclui de propósito por `left(relname,1) <> '_'`. **Adotar:** migration com `enable row level security` + policy `e_dev()`, trazendo-a para o versionamento sem apagar snapshot. E **remover o filtro por prefixo do roteiro** — a isenção não tem motivo escrito e é a categoria por onde qualquer backup futuro escapa.
- Ordem interna obrigatória: adotar a `_bkp_` → gerar tipos → ligar o gate. (Senão o gate nasce vermelho por causa dela.)

**Não entra.** A "impressão do schema" por fingerprint de classe — é um terceiro mecanismo para o mesmo fato que o gate de tipos e a trava de hash já cobrem. Inverter a fonte dos tipos (comitar o gerado do banco local revoga decisão registrada — se for o caminho, é ata própria).

**Entregas.** `scripts/db/run-mutation-tests.mjs`, `scripts/db/diff-tipos.mjs`, migration `0128` (adoção da `_bkp_`), `.github/workflows/ci.yml`, `supabase/tests/seguranca_catalogo.sql`.

**Pronto quando.** As mutações são todas detectadas pelo cenário nomeado; desligar uma asserção de `papeis_rls.sql` faz o injetor acusar a mutação correspondente como não-detectada; acrescentar coluna sem rodar `db:types` derruba o CI.

**Trava.** O injetor; o gate de tipos; `seguranca_catalogo.sql` sem exclusão por prefixo.

**Dependências.** F46.

**Risco.** Baixo. O cuidado é o injetor virar teatro: exigir o cenário nomeado, e não "algum ✗", é o que impede isso.

**Reversão.** `git revert`; `alter table … disable row level security`.

### O que o §3 diz sobre "F47 destrava F48"
"**F47 destrava F48.** Escrever quatro catálogos novos sem ter provado que roteiro SQL consegue ficar vermelho é escrever quatro documentos — e o repositório já tem 34 asserções do formato `if v_n = 0 then ✓` que passam sobre conjunto vazio." (linha 72). E, na listagem "as dependências que fixam a ordem": "**F47 destrava F48.** Escrever quatro catálogos novos sem ter provado que roteiro SQL consegue ficar vermelho é escrever quatro documentos [...] É literalmente o que o §3 do plano diz: 'F47 destrava F48'" (repetido, com essas palavras, no cabeçalho do próprio `docs/prompts/F47-...md`, linhas 13-14).

## regras_comuns

### §4 do plano — Regras comuns a TODAS as fases

Cabeçalho: "Cada fase vira `docs/prompts/F<N>-<slug>-ultracode.md` e um relatório `docs/RELATORIO-F<N>.md`. Toda ordem herda o que segue, sem repetir:"

1. **Modo autônomo** (`CLAUDE.md`): decide, implementa, aplica migration, abre PR, mergeia e deploya. Perguntar ao Johnny só por insumo físico.
2. **Estado de repouso obrigatório.** Ao fim de cada fase o sistema fica num estado terminal válido — sem dupla escrita, sem coluna esperando backfill, sem flag pendente, sem branch aberta. Cada ficha declara o que acontece se o projeto parar ali por dois meses.
3. **Escopo fora explícito.** O campo "Não entra" existe para impedir que a fase seguinte seja antecipada "já que estou aqui". O que aparecer fora do escopo vai para o backlog do relatório final.
4. **Trava antes da correção**, sempre que a trava puder nascer vermelha. Onde ela nasce verde (varreduras de catálogo), vem no mesmo commit.
5. **No-op primeiro.** Na virada, toda mudança de segurança entra em conjunção com o predicado antigo, logicamente inerte enquanto houver uma empresa.
6. **Fechamento:** `npm run lint`, `npm run build` e `npx tsc --noEmit` limpos; checklist autoverificado; ata em `docs/DECISOES.md`.
7. **Versionamento (regra permanente 8), sem exceção:** entrada no `CHANGELOG.md` ⇒ bump **MINOR** no `package.json` + entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em linguagem de operador + tag anotada `v<versão>`. Fase invisível ao operador também ganha versão — muda só o texto ("as telas de operação passaram a responder em cerca de metade do tempo"), nunca o silêncio. Correção avulsa fora de fase = **PATCH**.
8. **Migration nunca se edita.** Alteração = migration nova (a última hoje é `0127_conversao_reservas.sql`).
9. **R$ 0.** Nenhuma das 28 fases precisa de dependência nova ou serviço pago — isso é requisito de desenho, não coincidência. O único ponto com custo é o piloto (F73), e ele está isolado.
10. **Reversão padrão:** fase só-código = `git revert` + redeploy; `create or replace` = reemitir o corpo anterior; `add column … default` = `drop column` enquanto nada escreve; `set not null` = `alter column drop not null`. **Toda fase que toca banco declara a ORDEM de rollback** — que é o inverso da ordem de apply, e o `RUNBOOK-BANCO.md:31` só documenta a de apply.

**Destaques pedidos:**
- **Regra 2 (estado de repouso):** é a razão pela qual a F47 tem que terminar sem gate meio-ligado — "ordem interna obrigatória: adotar a `_bkp_` → gerar tipos → ligar o gate", e a isenção por prefixo só sai DEPOIS da `0128`. Um gate ligado antes da adoção, ou uma migration aplicada só no CI e não em produção, seria repouso quebrado — daí o cuidado do prompt em nomear a pendência se a `0128` não puder ser aplicada em produção na janela.
- **Regra 4 (trava antes da correção):** é o motivo estrutural da fase inteira — o injetor de mutações É a trava que prova que as travas (roteiros SQL) sabem reprovar, e ele nasce ANTES de qualquer correção de segurança (que fica para F48/F51/F52). A ficha reforça isso em "Não entra": nenhuma correção de policy/função nesta fase.

## divergencias

Comparando a ficha do §5 (docs/PLANO-MULTIEMPRESA.md) com o prompt da ordem (docs/prompts/F47-injetor-de-mutacoes-e-gate-de-deriva-ultracode.md), a maior parte do escopo (Entra/Não entra/Entregas/Trava/Dependências/Reversão) é reproduzida fielmente pelo prompt — ele só ELABORA. O próprio prompt já assume o papel de corrigir a ficha em dois pontos explícitos, e eu confirmei os dois contra o repositório de hoje:

**1) O flag `--local` do gate de tipos.**
- Ficha (§5): "Gerar com `supabase gen types typescript --local` e comparar extraindo de cada lado o conjunto..."
- Prompt: "O `--local` do gate de tipos está morto desde ontem. A ficha manda gerar com `supabase gen types typescript --local`, que exige `supabase start` — Docker, que a F46 tirou do caminho crítico e que a mesa não tem. A ficha é anterior à F46." E, no fato 1: "A mesa do Johnny não tem Postgres nem Docker" (evidência no `RELATORIO-F46.md` §2.1).
- **Quem está certo hoje:** o **prompt**. Confirmei: o job `banco` (Docker/`supabase start`) foi removido do `.github/workflows/ci.yml` no commit `40f5897` ("ci: o job `banco` antigo sai, e `banco-sem-docker` vira o portão", v1.51.1) — só resta `banco-sem-docker` (linha 174 do YAML), sem `supabase start`/`init`/`setup-cli`. `--local` fala com o Postgres do `supabase start`, que não existe mais no caminho crítico nem na mesa. A ficha, escrita em 04/09 (antes da F46 fechar em 06/09), ficou desatualizada nesse ponto — daí o prompt propor a Decisão 1 (CLI com `--db-url` × leitura direta do catálogo por SQL) em vez de seguir a ficha ao pé da letra.

**2) A contagem de asserções tautológicas `if v_n = 0 then ✓`.**
- Ficha (§3, linha 72): "o repositório já tem **34** asserções do formato `if v_n = 0 then ✓` que passam sobre conjunto vazio."
- Prompt (fato 5): "A ficha diz '34 asserções...'. O grep de hoje devolve outro número (**58** ocorrências do padrão, incluindo o próprio arquivo de ferramenta e o autoteste). Meça você mesmo, use o número medido e registre a divergência — não repita o número da ficha."
- **Quem está certo hoje:** o **prompt** — e medi eu mesmo para confirmar: `grep -rc "if v_.* = 0 then" supabase/tests/*.sql` soma **58** hoje (distribuídas por `papeis_rls.sql`=17, `dev_destrutivo.sql`=9, `f41_regularizacao.sql`=7, `f38_itens_com_ativo.sql`=6, `cargo_dev.sql`=4, `f37_colaboradores_tipos.sql`=3, `pendencias_item.sql`=3, `seguranca_catalogo.sql`=2, mais 8 arquivos com 1, incluindo o próprio `_asserts.sql` e `asserts_ferramenta.sql`, que o prompt já avisa que o grep inclui). A ficha, escrita em 04/09, tinha 34; o repositório cresceu (novos roteiros/asserções entre 04/09 e hoje) e a contagem real subiu para 58. O prompt está certo em mandar medir de novo em vez de repetir "34".

**Pontos que CONFEREM entre ficha e prompt (não são divergência, e vale registrar que não são):**
- Os seis roteiros-alvo do lote de mutações (`papeis_rls.sql`, `seguranca_catalogo.sql`, `cargo_dev.sql`, `dev_destrutivo.sql`, `import_substituir.sql`, `conflito_filiais.sql`) existem exatamente com esses nomes em `supabase/tests/` — confirmado por `ls`.
- `_bkp_relatorios_gerados_f6a` de fato não é criada por nenhuma migration (`grep -rn "_bkp_relatorios" supabase/migrations/` só acha comentários nas migrations `0039` e `0058` dizendo que ela NÃO é removida) e está na linha 17 de `src/lib/types/database.ts` — bate com a ficha e com o prompt.
- A isenção por prefixo em `seguranca_catalogo.sql` existe (`and left(c.relname, 1) <> '_'`), mas está na **linha 75**, não na linha 73 citada tanto pela ficha quanto pelo prompt (`seguranca_catalogo.sql:73`/`:122`) — os dois documentos erram a mesma linha por 2, então não é divergência ENTRE eles, é um deslize de citação que os dois repetem (arquivo tem 141 linhas hoje).
- `src/lib/ci-passos.test.ts` afirma mesmo, hoje, que a lista de jobs é exatamente `['verificar', 'banco-sem-docker']` (linha 377) — bate com o fato 4 do prompt.

**Achado incidental (fora do que foi pedido, mas relevante para "onde a F47 entra"):** tanto `docs/README.md` (linha 72, "Relatórios de fase — `RELATORIO-F11.md` → `RELATORIO-F45.md`") quanto a seção Status do `README.md` raiz ("Versão no ar: `1.51.0`", "Entregue da F0 à F46") estão desatualizados em relação ao repositório de hoje (falta `RELATORIO-F46.md`/`f46-evidencias/` no índice, e falta a entrega avulsa `1.51.1` no Status) — gap que a própria F46 deveria ter fechado e não fechou, e que o prompt da F47 assume corrigir junto ("`docs/README.md` (índice) e o Status do `README.md` atualizados").

## metodo_asserts

**`supabase/tests/_asserts.sql`** define `pg_temp.assert_zero_de(rotulo text, ruins bigint, universo bigint) returns boolean`. Por que existe (comentário do próprio arquivo): "O repositório tem dezenas de asserções da forma `if v_n = 0 then ✓ else ✗`. Todas elas passam sobre CONJUNTO VAZIO: se o cenário não montou o dado que deveria examinar, `count(*)` devolve 0, o roteiro imprime ✓ e o CI fica verde." A função:
- Levanta exceção (`raise exception`) se `universo is null or universo = 0` — mensagem: "assert_zero_de: universo vazio em '%' — a asserção passaria sobre conjunto vazio (tautologia). Monte o cenário ou conte outra coisa."
- Levanta exceção se `ruins is null` — "contagem de ruins NULA... provavelmente veio de um `select into` que não achou linha."
- Levanta exceção se `ruins < 0 or ruins > universo` — "contagem incoerente... % ruins de um universo de %."
- Se `ruins = 0`: `raise notice '✓ % (0 de % conferidos)', rotulo, universo` e devolve `true`.
- Senão: `raise warning '✗ %: % de % fora da regra', rotulo, ruins, universo` e devolve `false`.

Ela precisa ser carregada com `psql "$DBURL" -f supabase/tests/_asserts.sql -f supabase/tests/<roteiro>.sql` (dois `-f` = uma sessão só, `pg_temp` sobrevive entre eles), porque cada roteiro é `begin; do $$...$$; rollback;` e função criada dentro da transação some no rollback. É exatamente o que `scripts/db/rodar-roteiros.sh` já faz.

**`supabase/tests/asserts_ferramenta.sql`** é o autoteste — o modelo de como o repositório prova que uma verificação sabe reprovar (citado literalmente pelo prompt da F47 como leitura obrigatória: "leia-o antes de desenhar o injetor"). Ele roda em `begin; do $$ ... $$; rollback;` sobre banco vazio (não precisa de dado de produto) e prova, um a um:
1. Universo vazio (`assert_zero_de('autoteste 1', 0, 0)`) é RECUSADO — captura a exceção com `exception when others` e confere `sqlerrm like '%universo vazio%'`.
2. Universo `NULL` é recusado do mesmo jeito (mesmo texto de erro).
3. Universo povoado sem ruins (`assert_zero_de(..., 0, 7)`) devolve `true` e marca `✓`.
4. Universo com ruins (`assert_zero_de(..., 2, 7)`) devolve `false` — testado com `client_min_messages = error` ligado só durante a chamada, para o `✗` real emitido pela função não ser contado como falha DESTE roteiro (comentário do arquivo: "um `✗` de verdade na saída faria o runner reprovar este roteiro, que é justamente o que ele NÃO deve fazer ao provar que o ✗ funciona").
5. Contagens incoerentes (`ruins > universo`, ou `ruins` nulo) são recusadas com exceção citando "incoerente"/"NULA".
6. Uma prova filosófica final: `(select count(*) from (select 1 where false) t) = 0` é verdadeiro — confirmando que a forma antiga (`if v_n = 0 then ✓`) de fato passaria sobre conjunto vazio, é o motivo de a ferramenta existir.

Termina com `raise notice 'FIM asserts_ferramenta: % asserções, % falhas', v_ok + v_falhas, v_falhas;` — o padrão que `rodar-roteiros.sh` exige de todo roteiro.

**Este é o modelo que o injetor de mutações (F47) deve seguir**: assim como `asserts_ferramenta.sql` prova a ferramenta `assert_zero_de` quebrando-a de propósito (universo vazio, universo nulo, contagem incoerente) e conferindo que ela recusa pelo motivo certo, o `run-mutation-tests.mjs` tem que quebrar cada roteiro SQL de propósito (mutação no banco) e conferir que o roteiro acusa o **cenário nomeado** certo — não "deu ✗ em algum lugar" (mesma disciplina de "recusar pelo motivo certo, não por acidente").

## relatorios_modelo

Ambos os relatórios (`docs/RELATORIO-F45.md` e `docs/RELATORIO-F46.md`) seguem o mesmo esqueleto e tom — são o padrão explícito que a ordem da F47 manda seguir ("no padrão dos relatórios F45/F46").

**Abertura (sem numeração):** título `# Relatório da F<N> — <subtítulo da ficha>`; logo abaixo, em negrito, a linha de metadados: versão · data · link do PR · branch. Depois um parágrafo curto contextualizando a fase dentro do plano (ex.: "Segunda fase do `docs/PLANO-MULTIEMPRESA.md` (§5, Bloco A)...") e uma lista do que a fase resolvia, seguida de uma frase-resumo em negrito do tipo "**Sem migration, sem dependência nova...**".

**Seção 1 — O resultado, em números.** Uma tabela markdown "Antes × Depois" compacta, valores medidos, não estimados (ex.: tempo de job, contagem de testes).

**Seção 2 — O diagnóstico do prompt, conferido item a item.** Tabela `# | O prompt afirma | Como conferi | Resultado` com ✅/❌/⚠ por linha — é aqui que divergências entre ordem e repositório são batidas uma a uma, com o comando usado para conferir. Tem subseções numeradas (ex. "2.1") para achados que precisam de mais desenvolvimento.

**Seções seguintes — uma por frente de trabalho** (ex. F46: "3. Frente 1 — a trava de hash", "5. Frente 2 — o CI de banco sem Docker"), cada uma com subseções "O que mudou, por arquivo", explicações técnicas com trechos de código/SQL colados, e comparações medidas (não afirmadas).

**Seção das sabotagens** ("4. A prova de que a trava sabe ficar vermelha") — cada sabotagem numerada (4.1, 4.2...), com: o que foi alterado (comando real colado, ex. `git diff -U0`), a saída real do comando de teste rodado depois (bloco de código com a mensagem de erro literal), e uma linha "✅ Critério N — <o que isso prova>" fechando cada uma. As evidências completas ficam em arquivos `docs/f<N>-evidencias/sabotagem-*.txt`, e o relatório cola só o essencial inline.

**Seção "as decisões obrigatórias"** — cada decisão numerada com a medição feita, a escolha e o porquê, e por que a alternativa foi descartada.

**Seção "as divergências entre a ficha e o código"** — bate PONTO A PONTO onde a ordem de serviço/ficha errou contra o repositório real, dizendo quem tinha razão.

**Seção "as saídas reais dos comandos"** — cola literalmente output de `npm run lint`/`test`/`build` etc.

**"O que mudou, por arquivo"** — lista/tabela de todo arquivo tocado.

**"A revisão adversarial"** — subseções por achado: o que sobreviveu e foi corrigido, o que foi refutado (com o porquê), o que foi conferido e estava certo.

**"Os N critérios de aceitação, autoverificados"** — vai item por item do "Critérios de aceitação" do prompt, cada um com ✅/status e a evidência.

**"O fechamento"** — os runs do CI (com números, todos verdes), os required checks lidos DE VOLTA depois do merge (prova, não afirmação), e "o repouso" (confirmação do estado terminal, regra 2 do §4).

**"Pendências e backlog nomeado"** — subseções: "Pendências da fase: NENHUMA" (ou o que ficou pendente, nomeado), "Backlog aberto por esta fase" (itens para fases futuras, cada um nomeando a fase que os adota), "A dívida X, com todas as letras" (dívidas técnicas que a fase NÃO paga, escritas explicitamente, no espírito de nunca deixar implícito), "Fora de escopo, encontrado no caminho".

**Fecho — "O que este relatório NÃO prova"** — uma seção final de honestidade epistêmica, nomeando os limites do que foi de fato verificado versus o que foi assumido/documentado sem prova direta (ex.: o F46 fecha dizendo que não prova certas coisas sobre produção).

**Tom geral:** primeira pessoa, direto, denso em números medidos (nunca estimados), trechos de comando+saída colados literalmente como prova, marcação ✅/❌/⚠ consistente, e citação explícita de quando uma medição contraria o prompt/ficha (ganhando da frase escrita). É exatamente esse padrão que o prompt da F47 pede para o `docs/RELATORIO-F47.md`: "o que mudou por arquivo e por quê; as três decisões obrigatórias...; o lote de mutações listado uma a uma...; as quatro sabotagens com saída real; os 14 critérios autoverificados item a item; as divergências entre a ficha e o repositório; o limite honesto do gate de deriva...; pendências e backlog nomeados para a F48."

## registry_versoes

**A forma de uma entrada** (`src/lib/versoes/tipos.ts`, tipo `EntradaVersao`, módulo puro sem import de servidor):
```ts
export type EntradaVersao = {
  /** Semver `maior.menor.correcao`. Fase = menor nova; entrega avulsa = correcao. */
  versao: string
  /** Data ISO `yyyy-MM-dd` — a do cabeçalho da entrada no CHANGELOG, não a do commit. */
  data: string
  /** Rótulo curto da ordem de serviço (`F34`), quando a versão veio de uma fase. */
  fase?: string
  /** Uma linha: o que esta versão entregou. */
  titulo: string
  /** De 2 a 6 itens, EM LINGUAGEM DE OPERADOR — o que a pessoa que usa o sistema
   *  vê mudar. O CHANGELOG é narrativa de desenvolvedor; aqui se traduz. */
  mudancas: string[]
}
```

**As 3 últimas entradas LITERAIS de `VERSOES` (topo do array, mais recente primeiro):**

1. `{ versao: '1.51.1', data: '2026-09-06', titulo: 'A conferência do banco de dados ficou quatro vezes mais rápida para todo mundo', mudancas: [ 'Nenhuma tela mudou. A versão anterior instalou uma conferência de banco de dados mais rápida e a deixou rodando lado a lado com a antiga, para comparar as duas. Elas deram exatamente o mesmo resultado cinco vezes seguidas, então a antiga foi desligada.', 'O efeito prático: a bateria que confere o banco antes de qualquer alteração ir ao ar caiu de cerca de 3 minutos para menos de 1. Uma correção urgente termina de ser conferida bem mais cedo — e a conferência deixou de depender de um programa externo que já a derrubou duas vezes por motivos que nada tinham a ver com o sistema.' ] }` — **sem `fase`** (é entrega avulsa PATCH, não fase).

2. `{ versao: '1.51.0', data: '2026-09-06', fase: 'F46', titulo: 'O histórico de alterações do banco de dados ficou protegido contra reescrita', mudancas: [ 4 itens — resumidos: (i) proteção nova sobre o histórico de alterações do banco ("cada arquivo de alteração já aplicada passou a ter uma assinatura registrada, e mexer num deles agora REPROVA a conferência automática, dizendo o nome do arquivo"); (ii) por que isso importa ("as alterações do banco são aplicadas uma a uma, na ordem: reescrever uma que já foi aplicada deixa o projeto dizendo uma coisa e o banco fazendo outra"); (iii) a bateria de conferências caiu "de 3 minutos e 52 segundos para 57 segundos"; (iv) deixou de depender de "um programa externo que já a derrubou duas vezes" ] }`.

3. `{ versao: '1.50.1', data: '2026-09-05', titulo: 'A conferência automática deixou de pular alteração que ficava na fila', mudancas: [ 'Nenhuma tela mudou. A correção é na bateria de conferências automáticas que a versão anterior instalou: quando duas alterações eram enviadas em sequência rápida, a que ficava esperando na fila era DESCARTADA sem ser conferida — e ia ao ar assim mesmo. Era metade do buraco que a versão anterior dizia ter fechado.', 'Agora cada alteração tem a fila dela: nenhuma espera pela outra, e nenhuma é descartada. O defeito foi encontrado observando as conferências rodarem de verdade, não lendo o texto delas.' ] }` — **sem `fase`** (correção avulsa).

`package.json` tem `"version": "1.51.1"` — bate com `VERSOES[0].versao` de hoje.

**O que `registry.test.ts` exige** (18 `it`s): tem entradas; toda `versao` é semver válido (`/^\d+\.\d+\.\d+$/`); nenhuma `versao` repetida; ordem estritamente decrescente por comparação NUMÉRICA (não textual — `compararSemver`, testado contra a armadilha `'1.10.0' > '1.9.0'`); toda `data` é uma data real `yyyy-MM-dd` (rejeita `2026-02-31`); nenhuma data no futuro (comparada contra `hojeISO()`, fuso `America/Sao_Paulo`, não `new Date().toISOString()`); datas não crescem lendo de cima para baixo; todo `titulo` tem 1 linha (sem `\n`), não vazio; `mudancas` tem entre 2 e 6 itens, nenhuma vazia, nenhuma com `\n`; `fase`, quando existe, é única no array e casa `/^F\d+[A-Z]?(-UX)?$/`; `versaoAtual()` === `VERSOES[0]`; `VERSOES[0].versao` === versão do `package.json`; a entrada `1.0.0` é o go-live de `2026-07-15`, `fase: 'F4'`; tudo antes do go-live é `0.x`, tudo depois é `>= 1.x`.

E o teste que **recusa vocabulário de desenvolvedor** (`'nao vaza vocabulario de desenvolvedor para quem opera'`), que serializa `VERSOES` inteiro com `JSON.stringify` e falha se QUALQUER uma dessas strings aparecer:
```
'Server Action', 'Server Component', 'RLS', 'row-level security', 'migration',
'trigger do banco', 'endpoint', 'payload', 'jsonb', 'PostgREST', 'Supabase',
'RPC', 'policy', 'Postgres', 'commit', 'deploy', 'enum', 'schema', 'Next.js',
'TypeScript', 'Vercel'
```
(comentário do teste: "Mesma lista da documentação (`src/lib/ajuda/registry.test.ts`), acrescida do que o CHANGELOG usa e a tradução pode arrastar sem querer.")

**`cobertura-changelog.test.ts`** lê `CHANGELOG.md` de verdade (parseando cabeçalhos `## `) e faz 5 verificações POR CONTAGEM, não por presença: (1) o CHANGELOG foi lido de verdade (>40 entradas, toda entrada com data reconhecível); (2) toda fase citada no CHANGELOG (regex `\bF\d+[A-Z]?(?:-UX)?\b`) tem versão correspondente no registry, salvo as nomeadas em `SEM_VERSAO = new Set(['F5', 'F6', 'F6C', 'F7C'])` (fases de backlog nunca executadas, ou rótulos que não são ordem de serviço); (3) **cada entrada do CHANGELOG tem uma versão PRÓPRIA na MESMA data** — contagem, não presença de data, porque duas entregas no mesmo dia são a norma (7 em 24/07, 5 em 23/07) e contar só presença deixaria passar a segunda entrega do dia sem bump/tag; (4) há pelo menos uma versão por entrada do CHANGELOG (`VERSOES.length >= entradas.length`); (5) o registry não inventa fase que o CHANGELOG desconhece. É este teste que faz a regra permanente 8 do CLAUDE.md ("toda entrada nova no CHANGELOG exige uma versão") "não depender de ninguém lembrar dela" — ele derruba `npm run test` se a F47 esquecer o bump/entrada/tag.
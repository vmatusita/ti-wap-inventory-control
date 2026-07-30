# Relatório da F23 — Ferramentas destrutivas do cargo dev

**Ordem:** `docs/prompts/F23-dev-destrutivo-ultracode.md` (30/07/2026)
**Execução:** 30/07/2026, modo autônomo · **Migrations `0079`–`0090`, aplicadas em ensaio e em produção**
**Emenda de arquitetura:** §14 da `docs/ADR-002-papeis-e-permissoes.md` · **21 atas** em `docs/DECISOES.md`

---

## 1. O achado que reorientou a fase

A ordem pedia, no critério 7, que UPDATE/DELETE direto em `ativos`/`movimentacoes`/`lancamentos_item` seguisse **recusado para todo papel fora das RPCs oficiais, service role incluso**. Medindo antes de escrever qualquer coisa:

> **Essa garantia não existia.**

A "imutabilidade" de `movimentacoes` e `lancamentos_item` era a **AUSÊNCIA** de policy de UPDATE/DELETE — e `ativos` não tinha policy de DELETE. Isso segura o cargo `authenticated` (a RLS nega o que nenhuma policy permite) e **não segura o service role**, que tem `rolbypassrls` e recebe do Supabase os grants amplos de tabela por *default privilege*:

```
grants de TABELA (medido): anon/authenticated/service_role têm DELETE,INSERT,SELECT,UPDATE,TRUNCATE
  em ativos, movimentacoes, lancamentos_item, pendencias_item, termos_gerados, itens,
  relatorios_gerados, eventos_admin
triggers em public (medido): só 3 — trg_valida_lancamento_item (BEFORE INSERT),
  trg_aplicar_movimentacao (BEFORE INSERT), profiles_guarda_dev (BEFORE I/U/D)
```

E o app **tem** um client de service role (`src/lib/supabase/admin.ts`). O caminho existia de verdade.

Ou seja: o critério de aceitação pedia para **preservar** algo que era preciso **construir**. Foi o que a fase fez primeiro, e é a peça de que tudo o mais depende.

---

## 2. O que foi entregue

### 2.1 A guarda (`0081`) — trigger, no molde da `0073`

Policy não serve (o service role a ignora). **Trigger serve**: roda para todo mundo, sempre. `guarda_acervo()` recusa por padrão; as RPCs oficiais abrem a janela `estoque.dev_destrutivo` por GUC **local à transação** e a fecham — inclusive no ramo de erro.

| tabela | eventos guardados | por quê |
|---|---|---|
| `movimentacoes` | INSERT (só `forcado = true`), UPDATE, DELETE | append-only; a marca não pode ser mentida por request forjado |
| `lancamentos_item` | idem | espelho, do lado dos itens |
| `ativos` | **só DELETE** | UPDATE ali é o estado derivado que o sistema grava o tempo todo — guardá-lo pararia tudo |
| `pendencias_item`, `anotacoes` | **nenhum**, de propósito | `aplicar_movimentacao` apaga `pendencias_item` no estorno, e `security definer` **não** isenta de trigger: guardá-la quebraria o estorno comum |

### 2.2 As sete ferramentas

`apagar_ativo`, `apagar_movimentacao`, `apagar_item` (`0082`); `resetar_acervo`, `resetar_itens` (`0083`); `forcar_estado_ativo`, `forcar_saldo_item` (`0084`). Todas `security definer`, `authenticated`-only, com `exigir_dev_para_destruir()` no topo (cargo dev **e** justificativa de 10+ caracteres), confirmação digitada validada **na action E na RPC**, e **trilha gravada dentro da mesma transação**.

Mais: `previa_reset` (`0086`, só-leitura), a coluna `forcado` (`0079`), o vocabulário da trilha e a 8ª checagem de integridade (`0085`), e o caminho nomeado do `db:reset` (`0083`).

### 2.3 A UI

Subrota **`/dev/destrutivo`** — e não um quinto card na `/dev`. Tudo na `/dev` é seguro de clicar; nada ali é. As ferramentas vivem **só** nessa rota: nenhum atalho na ficha, nas listas ou na paleta.

---

## 3. Evidências

### 3.1 Portões (baseline → final)

```
BASELINE (antes de qualquer mudança)          FINAL
lint: limpo                                    lint: limpo
test: 76 arquivos / 1647 testes                test: 77 arquivos / 1667 testes
build: limpo                                   build: ✓ Compiled successfully in 43s
                                               gate de Server Actions: VERDE
                                                 (33 chunks varridos, nenhum identificador
                                                  registrado sem binding)
```

### 3.2 A guarda morde — **provado em PRODUÇÃO**, dentro de `begin; … rollback;`

O rollback explícito é deliberado: se a guarda tivesse falhado, o teste teria apagado dado real. Rodado como **service role**, que é o caso difícil.

```
caso                                    veredito             sqlstate
delete movimentacoes (service role)     RECUSADO             42501
update movimentacoes (service role)     RECUSADO             42501
delete ativos (service role)            RECUSADO             42501
delete lancamentos_item (service role)  RECUSADO             42501
apagar_ativo (service role)             RECUSADO             42501
previa_reset (service role)             RECUSADO             42501
insert legitimo de movimentacao         PASSOU (esperado)    —
```

O último caso é o par positivo, e ele é obrigatório: sem ele, uma guarda que **cegasse o app** passaria verde.

### 3.3 Comportamento ponta a ponta (ensaio, papel simulado, transação revertida)

```
caso                                     esperado         obtido         ok
1a admin chama apagar_ativo              recusa 42501     42501          true
1b admin chama forcar_estado             recusa 42501     42501          true
2a justificativa curta                   recusa 22023     22023          true
2b forcar -> status derivado             descartado       descartado     true
2c estado terminal zera detentor         (nulo)           (nulo)         true
2d nasce ajuste marcado forcado          1                1              true
2e rel_resumo NAO conta a correcao-dev   9                9              true
3a apagar movimentacao do MEIO           recusa 42501     42501          true
4a confirmacao errada                    recusa 22023     22023          true
4b ativo apagado                         0                0              true
4c rastro some                           0                0              true
4d RPC devolve contagem de movs          3                3              true
4e par patrimonio+tag liberado           aceita           aceitou        true
5a trilha dos dois eventos               2                2              true
5b evento carrega backup + justificativa 1                1              true
```

A linha **2e** é o critério 6 provado **por consulta**, não por raciocínio: `rel_resumo` devolve o mesmo número antes e depois de forçar um estado.

### 3.4 Roteiro SQL — `supabase/tests/dev_destrutivo.sql`

```
_dev_destrutivo_resumo → [{"ok":103,"falhas":0,"detalhe":null}]
```

**103 asserções, 0 falhas** no ensaio — ⚠ **esta saída é da versão do roteiro anterior às
migrations `0089`/`0090`**. Depois delas o arquivo ganhou asserções novas (`4e-bis` invertida,
`4e-ter`, o backup fora do prefixo e o TRUNCATE revogado), então o contador final é MAIOR.
O comportamento novo foi verificado por **medição independente** no ensaio (§3.12); o número
consolidado do roteiro é re-rodado no fecho da fase e o CI (`job banco`) é a prova permanente.

### 3.12 Medição independente do comportamento pós-`0089`/`0090` (ensaio, transação revertida)

```
caso                                     veredito    detalhe
1 apagar ESTORNO                         RECUSADO    42501 · mensagem própria
2 reset com backup fora do prefixo       RECUSADO    22023 · mensagem própria
3 truncate movimentacoes (authenticated) RECUSADO    42501
4 estado intacto apos as recusas         INTACTO     antes=em_estoque|<nulo>|3  depois=idem
5 marcador de ambiente no ENSAIO         PRESENTE    1        (produção: 0 — é a trava)
```

O caso **4** é o que dá sentido aos três primeiros: uma recusa que já tivesse mexido no ativo
antes de recusar seria pior que a operação. E ele também corrigiu um erro meu — eu havia
escrito a `4e-ter` afirmando `em_triagem` de cor; o estado real é `em_estoque`. Cobre: exclusividade (3 cargos × 7 RPCs + service role + request forjado), imutabilidade (5 casos `authenticated`, 5 como DONO, 2 de marca mentida, 2 pares positivos), apagar ativo/movimentação/item, reset por filial e global, recusas, forçar estado e saldo, **estorno comum intacto**, confirmação/justificativa e o fecho da janela em erro.

**Roteiros vizinhos, todos no ensaio, todos com 0 falhas** — nenhum quebrou por causa da F23:
`itens_extra.sql` · `maquina_estados.sql` · `itens_quantidade.sql` · `pendencias_item.sql` · `troca.sql` · `manutencao_fornecedor.sql` · `import_substituir.sql`

### 3.5 A `0080` é diff mínimo — provado, não afirmado

O corpo vivo do import era idêntico nos dois bancos antes da fase (`md5` normalizado `d533780c5084f907c27d29d8f4af5642`, 17.486 bytes). **Depois** do apply, removendo do corpo vivo só as linhas marcadas `F23` e recalculando:

```
ENSAIO     → recriacao_fiel = true · abre = 1 · fecha = 1 · guarda_cargo_intacta = true
PRODUÇÃO   → recriacao_fiel = true · abre = 1 · fecha = 1 · guarda_cargo_intacta = true
             assinaturas = 1 · anon = false · authenticated = true · service_role = false
```

Isso fecha o risco real de colar 19 KB de função à mão: **erro de transcrição seria detectado**.

### 3.6 Verificação pós-apply (idêntica nos dois bancos)

```
proname                    definer  anon   auth   srv    abre  fecha
apagar_ativo               true     false  true   false  1     2
apagar_item                true     false  true   false  1     2
apagar_movimentacao        true     false  true   false  1     2
exigir_dev_para_destruir   true     false  FALSE  false  0     0   ← fechada pela 0088
forcar_estado_ativo        true     false  true   false  1     2
forcar_saldo_item          true     false  true   false  1     2
guarda_acervo              true     false  false  false  —     —   ← ninguém chama à mão
previa_reset               true     false  true   false  0     0
resetar_acervo             true     false  true   false  1     2
resetar_dados_ficticios    true     false  FALSE  TRUE   1     2   ← invertida, de propósito
resetar_itens              true     false  true   false  1     2
rotulo_alcance_reset       true     false  FALSE  false  0     0   ← fechada pela 0088
```

`fecha = abre + 1` nas que abrem a janela: o `+1` é o fecho do bloco `exception`.

Triggers em produção:
```
ativos            → BEFORE DELETE
lancamentos_item  → BEFORE INSERT OR DELETE OR UPDATE
movimentacoes     → BEFORE INSERT OR DELETE OR UPDATE
```

### 3.7 Produção não foi tocada

```
                antes da fase    depois
ativos          1232             1232
movimentacoes   2373→2377        2377   (a variação é operação real no meio do rollout)
lancamentos     9                9
termos          7                7
movs forcadas   —                0      ← a fase INSTALA; usar é decisão do dev, depois
```

### 3.8 A prévia conta EXATAMENTE como a RPC revalida

Se `previa_reset` (`0086`) contasse por régua diferente de `resetar_acervo`/`resetar_itens`
(`0083`), a guarda de contagens recusaria **todo** reset com `40001` e a mensagem apontaria a
causa errada ("o estado mudou"). Comparação direta no ensaio — prévia × as expressões literais
da `0083`, nos três escopos:

```
escopo          chave             previa   rpc_expr   bate
acervo/filial   ativos            1217     1217       true
acervo/filial   movimentacoes     2477     2477       true
acervo/filial   anotacoes         0        0          true
acervo/filial   pendencias_item   18       18         true
acervo/filial   termos            0        0          true
acervo/global   ativos            1596     1596       true
acervo/global   movimentacoes     3231     3231       true
acervo/global   termos            0        0          true
itens/filial    lancamentos       4        4          true
```

### 3.9 Smoke pós-deploy (produção, sessão de ADMINISTRADOR)

```
RESUMO · 88 OK · 1 aviso · 0 n/a (pré-F12) · 0 falha        (exit 0)

  [OK   ] /dev            — HTTP 200 (68293 bytes)
  [OK   ] /dev/destrutivo — HTTP 200 (69116 bytes)
```

As duas rotas passam pelo critério de **conteúdo**, não de status: a conta do smoke é de
administrador, o `redirect()` do layout é resolvido pelo Next **no servidor** e a resposta volta
200 **com o HTML do painel** — o que prova a ausência de vazamento é o corpo **não** trazer o
marcador da área (`Área técnica de manutenção` / `Zona destrutiva`). A entrada de
`/dev/destrutivo` é nova nesta fase.

O **1 aviso é pré-existente e não tem relação com a F23**:
`kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado — RLS não comprovada`.
É uma limitação do próprio smoke (sem kit em produção, ele não consegue *provar* a RLS), não uma falha.

### 3.10 Advisors (produção, antes → depois)

```
rls_enabled_no_policy                              3 → 3    (as mesmas pré-existentes)
authenticated_security_definer_function_executable 17 → 26  (+9 líquido, após a 0088)
auth_leaked_password_protection                    1 → 1    (backlog anterior)
```

**Nenhum WARN novo de RLS.** O crescimento é da mesma classe inerente que a `0062`/`0069` já aceitaram: função chamada com o client de sessão precisa de `execute` para `authenticated`, e cada uma tem guarda interna.

---

## 4. O defeito que a prova encontrou — e que teria mordido 90% do acervo

Ao escrever as fixtures do roteiro, apareceu isto: **`movimentacoes.created_at` tem default `now()`, que dentro de UMA transação é o mesmo instante para todas as linhas.** O import de startup insere a `compra` de abertura e o `ajuste` de reconciliação na mesma transação — logo com `created_at` idêntico.

`apagar_movimentacao` decidia "é a última?" por `(created_at, id)`. Num par empatado, o desempate caía no **uuid v4, aleatório**:

- uuid do **ajuste** maior → ele é "a última"; apagá-lo desfaz a reconciliação. **Correto.**
- uuid da **compra** maior → a COMPRA vira "a última"; apagá-la restaura o ativo do snapshot **anterior ao próprio nascimento** e deixa o `ajuste` referenciando um nascimento que não existe mais. **Incoerente** — e a metade errada saía por sorteio.

Medido em produção:

```
ativos_com_empate = 1111   (de 1232 ativos, ~90% do acervo)
```

É a **mesma causa** que a `0054` já tinha diagnosticado para o as-of (lá resolvia errado em ~metade dos 1.002 ativos afetados).

**Correção (`0087`): RECUSAR o empate**, em vez de eleger um critério de desempate. Copiar o desempate da `0054` seria eleger uma ordem plausível para uma operação **irreversível** a partir de dados que genuinamente não dizem qual veio primeiro. Numa ferramenta que apaga, "não sei qual é a última" tem de virar **recusa**. O caminho para desmontar um ativo importado é `apagar_ativo`, que leva o par inteiro e não depende de ordem.

A recusa é **estreita**: só dispara quando existe outra movimentação do mesmo ativo com o mesmo instante. Ativo importado que depois recebeu movimentação de verdade (transação própria) segue apagável na ponta. Provado:

```
1a empate: apagar o ajuste      RECUSADO   42501 — "movimentações gravadas no mesmo instante…"
1b empate: apagar a compra      RECUSADO   42501
2a sem empate: a do MEIO        RECUSADO   42501
2b sem empate: a ULTIMA         APAGOU     restaurou para em_estoque
3a forcar_estado apos 0088      OK         defasado
3b previa_reset apos 0088       OK         ativos=1219
4a exigir_dev direto (0088)     RECUSADO   42501
```

---

### 3.11 Paridade ensaio × produção das 14 funções da fase — e um falso-positivo instrutivo

O fingerprint agregado das 14 funções **divergiu** entre os bancos
(`e2b629fa…` × `a8b79ace…`). O runbook manda **abrir a diferença antes de reportá-la**, e foi
o que aconteceu: das 14, **12 batem byte a byte**; `apagar_ativo` (5580 × 5529) e `apagar_item`
(2567 × 2563) diferiam.

Removendo as **linhas de comentário** do corpo e refazendo o hash:

```
                 ENSAIO                             PRODUÇÃO
apagar_ativo     22538e43d784799062cd7c1e895cc312   22538e43d784799062cd7c1e895cc312   (4492 B)
apagar_item      258c32ea5f325ae6ec6a254149fea3a1   258c32ea5f325ae6ec6a254149fea3a1   (2075 B)
```

**O CÓDIGO é idêntico.** A diferença inteira é prosa de comentário interno, que eu reescrevi
levemente entre a colagem no ensaio e a colagem em produção. Nenhuma divergência de
comportamento — e é exatamente a armadilha que o runbook documenta para o fingerprint cru
(lá era CRLF × LF; aqui é comentário), agora com um segundo exemplar: **normalizar espaço não
basta quando a recriação é manual; é preciso comparar o código sem comentário.**

## 4-bis. A revisão adversarial, e o que ela derrubou

Sete lentes em contexto fresco, com refutação por padrão (§V da ordem). Ela **não** voltou
limpa — e os achados que sobreviveram viraram as migrations `0089` e `0090` e quatro correções
de app. Os principais:

| # | Achado | Gravidade | O que virou |
|---|---|---|---|
| 1 | **A varredura de relatórios parou em `movimentacoes`.** O lado dos ITENS tem duas leituras sem allow-list de tipo, e a correção-dev entrava nas duas — com a justificativa escrita pelo dev **impressa e exportada no CSV** | ALTA | `.eq('forcado', false)` em `getLancamentosItensPeriodo` e na leitura de observações (`relatorios/itens.ts`) |
| 2 | **A marca `forcado` não era lida por NENHUMA tela fora da /dev** — a ficha do ativo não a mostrava, e o botão "Estornar" ficava em cima da correção-dev para qualquer operador | ALTA | `forcado` entrou no `TIMELINE_SELECT`, virou selo "forçada" na linha do tempo, e `podeEstornar` passou a excluí-la |
| 3 | **`resetar_dados_ficticios` deixava o service role zerar a PRODUÇÃO com uma chamada** — sem cargo, backup, contagens ou trilha; a defesa era só o `env-guard` do lado do script | ALTA | `0090`: trava de ambiente **dentro do banco** (`public.ambiente`), vazia em produção |
| 4 | **TRUNCATE passava por cima da guarda** — trigger `for each row` não vê TRUNCATE, e a RLS não o cobre; `anon`/`authenticated`/`service_role` tinham o privilégio | BAIXA→real | `0090`: `revoke truncate` nas seis tabelas do acervo |
| 5 | **Apagar um ESTORNO não devolvia as `pendencias_item`** que o estorno-strip removeu — o ativo voltava a um estado que a fila de pendências não reflete | MEDIA | `0090`: recusa apagar movimentação de tipo `estorno` |
| 6 | **A guarda de backup do reset só conferia que EXISTE um objeto com aquele nome** — nada o amarrava ao recorte que ia morrer | MEDIA | `0089`: o caminho tem de estar sob `reset/<bloco>/<alcance>/` |
| 7 | **A recusa mais frequente da fase (empate, ~90% do acervo) chegava como "seu cargo não permite"** — eu adicionei os ramos de tradução ANTES de escrever a `0087` | MEDIA | ramo próprio em `traduzErroBanco`, antes do genérico de 42501 |
| 8 | `remove()` do Storage mandava tudo numa chamada (teto de 1000) e ignorava o `data` de remoção **parcial** | MEDIA | lotes de 500 + conferência do que realmente saiu |
| 9 | O comentário que justificava o client admin na limpeza do bucket era **factualmente falso** | BAIXA | reescrito: é conservadorismo, não necessidade |
| 10 | Arquivo vazio `import-novo.sql` commitado na raiz (resto de um redirect meu que falhou) | BAIXA | removido |
| 11 | **O reset por filial anula `substitui_ativo_id` de ativos de OUTRAS filiais** — em silêncio e **fora do backup**, porque o backup só trazia os ativos do recorte | MEDIA | `montarBackupDoReset` passou a guardar a linha inteira de quem aponta para dentro do recorte (`ponteiros_perdidos`) |
| 12 | A asserção `4e-bis` do roteiro afirmava que apagar um ESTORNO **funciona** — com a `0090` ela passou a estar do lado errado | (efeito do #5) | reescrita para exigir a RECUSA, mais a `4e-ter` nova, que prova que a recusa **não deixou efeito colateral** comparando um retrato do ativo capturado ANTES da tentativa |

**Dois achados de gravidade BAIXA ficaram deliberadamente sem correção**, e é honesto dizer
quais: (a) apagar uma `devolucao_fornecedor` deixa o ativo substituto apontando para uma
devolução que não existe mais — o ponteiro `substitui_ativo_id` sobrevive à exclusão da
movimentação, e nada na ficha do substituto explica isso; (b) uma chamada DIRETA às RPCs pelo
PostgREST (pulando a tela) não executa a limpeza do Storage, porque essa metade é da Server
Action — o `.docx` fica órfão e só a 8ª checagem o revela. O segundo é inerente ao desenho
(`storage.protect_objects_delete` proíbe apagar objeto por SQL) e está no §7; o primeiro é
material para uma fase futura.

**E uma crítica de MÉTODO que merece registro**, porque é a mais útil das dez: a única asserção
de janela do roteiro era **tautológica** — media o GUC depois de um ERRO, e o rollback ao
savepoint já reverteria o GUC de qualquer jeito. O caso que pode falhar de verdade é o
**caminho de SUCESSO** (a lição da F22: `set_config(…, true)` é local à TRANSAÇÃO, não à
chamada). Medido explicitamente, no ensaio, numa transação só:

```
caso                                  veredito     detalhe
1 GUC apos RPC bem-sucedida           FECHADO      off
2 delete direto na mesma transacao    RECUSADO     42501
3 GUC apos RPC que estourou           FECHADO      off
4 delete de ativo apos o erro         RECUSADO     42501
```

## 5. Checklist da ordem, item a item

| # | Critério | Situação |
|---|---|---|
| 1 | **Exclusividade** — nenhuma operação alcançável por admin/operador/consulta; service role não fura | ✅ roteiro §1 (3 cargos × 7 RPCs + forjado + service role) e §3.2/§3.3 acima |
| 2 | **Apagar ativo** — rastro completo some, par patrimônio+tag liberado | ✅ §3.3 linhas 4b–4e; roteiro §3 (8 asserções, com termo e `.docx` plantados) |
| 3 | **Apagar movimentação** — desenho provado, recusas apontam o caminho, estorno intacto | ✅ roteiro §4 (8 asserções) + §11; correção da §4 deste relatório |
| 4 | **Apagar item** — catálogo, lançamentos e saldos somem; `/itens` não quebra | ✅ roteiro §5 (confere `rel_saldo_itens` antes/depois) |
| 5 | **Reset** — por filial não apaga ativo de outra; global zera; cadastros/relatórios/eventos/logs intactos; contagens antes/depois; backup garantido | ✅ roteiro §6 (5) e §7 (7); backup **conferido no bucket** pela RPC, não só declarado |
| 6 | **Forçar** — qualquer estado com justificativa; ficha explica; relatórios não contam; saldo chega ao alvo | ✅ §3.3 linha 2e (por consulta) + roteiro §9 (6) e §10 (2) |
| 7 | **Imutabilidade fora da janela** — recusa para todo papel, service role incluso; janela fecha mesmo em erro | ✅ §3.2 (produção) + roteiro §2 (14 asserções) e §13 (3) |
| 8 | **Trilha** — evento com justificativa/contagens; vocabulário e comment atualizados; Auditoria exibe e exporta | ✅ §3.3 linhas 5a–5b; `detalhe-evento.ts` ganhou ramo para os 7 verbos |
| 9 | **Sem regressão** — operador/consulta/visualizador idênticos; estorno, import e F22 intactos; advisors sem WARN novo de RLS; checagens verdes | ✅ 7 roteiros vizinhos verdes; §3.8; import provado fiel (§3.5) |
| 10 | **Portões** — lint/test/build; roteiros verdes; `database.ts` regenerado; migrations aplicadas; deploy + smoke | ✅ §3.1; migrations `0079`–`0088` nos dois bancos |

---

## 6. Decisões (as 17 atas estão em `docs/DECISOES.md`)

As de maior consequência:

1. **A guarda é trigger, não policy** — é a única forma de alcançar o service role.
2. **A `0080` toca o import**, que o §Escopo listava como "não toque" — por **necessidade**, não escolha: a guarda o alcançaria. Lido como "não mude o que o import FAZ", com diff provado de duas linhas.
3. **Apagar movimentação é só-a-última**, por `(created_at, id)` — com a recusa de empate da `0087`.
4. **A marca é COLUNA**, não motivo de catálogo (que o admin edita) nem tipo novo de enum (que custaria caro e não compraria exclusão nenhuma).
5. **A trilha é gravada dentro da RPC** — muda o padrão da F21/F22, porque `registrarEventoAdmin` não propaga erro.
6. **O recorte por filial é pelo ATIVO**, e a tela **diz isso** em vez de prometer "não vaza".

---

## 7. O que este relatório **NÃO** prova

Honestidade sobre os limites, no idioma das fases anteriores:

- **Nenhuma ferramenta destrutiva foi executada em produção.** Por determinação da própria ordem. O que se provou em produção foi o **apply**, os **grants/assinaturas**, a **recusa** (em transação revertida) e que **nada mudou**. As execuções bem-sucedidas foram todas no ensaio, com dado fictício.
- **A UI não foi exercitada por um humano nem por navegador automatizado.** O que garante a rota é o build, o smoke (que prova que um administrador NÃO a abre) e o gate de Server Actions. Cliques reais são o roteiro manual do §8.
- **O `.docx` do Storage é a única promessa da fase que o Postgres não garante sozinho.** `storage.protect_objects_delete` recusa DELETE por SQL, então a RPC devolve os caminhos e a **action** remove pela API depois do commit. Se a action falhar, o arquivo fica órfão — a 8ª checagem passa a contá-lo e o aviso na tela diz o que fazer. Não há como tornar isso atômico.
- **A 8ª checagem não nasce em zero:** 3 órfãos antigos em produção (10 objetos para 7 linhas), resíduo de regeneração de termo anterior à fase. O que se vigia é o **crescimento**.
- **A mensagem em pt-BR da guarda nunca chega ao usuário do app.** Para `authenticated`, a RLS filtra antes: o comando afeta 0 linhas **em silêncio**, sem erro. A frase "Registro histórico não se altera" só aparece para quem ignora RLS (service role / SQL Editor). Isso é aceitável porque nenhum caminho do app faz UPDATE/DELETE direto — mas é bom não confundir a mensagem com uma tela.
- **`resetar_acervo`/`resetar_itens` tomam os advisory locks ANTES de conferir a confirmação digitada.** Uma chamada com confirmação errada segura a chave da filial pelo resto da transação. Em produção cada request do PostgREST é sua própria transação, então o efeito é desprezível — mas a ordem inversa seria mais barata. Observação, não correção.
- **O ensaio não reproduz a divergência de ordenação de produção.** Lá `created_at` é monotônico e concorda com `data`; em produção o import quebra isso em 1111 ativos. Todo cenário sensível a ordem foi **plantado** no roteiro, com `created_at` explícito.

---

## 8. Roteiro manual de 5 minutos (para o Johnny)

Ciclo completo **em produção, sem encostar em dado real** — cria um ativo fictício, mexe nele e o apaga.

1. **Como ADMINISTRADOR** (ou peça a alguém que seja): abra `…/dev/destrutivo` na barra de endereços. Você cai no painel. Nada da Zona destrutiva aparece. *(É o que o smoke também verifica a cada deploy.)*
2. **Como DEV**, entre em **Desenvolvedor › Zona destrutiva** (o card vermelho no fim da `/dev`).
3. Antes, crie o alvo: **Ativos › Novo**, patrimônio `WAP0009999`, categoria qualquer. *(Fictício — regra da casa.)*
4. Na Zona destrutiva, busque `WAP0009999` e clique **Abrir**. Confira o resumo: "1 movimentação, 0 termos…".
5. **Forçar estado** → escolha *Em manutenção* → justificativa ("teste do roteiro manual da F23") → confirme digitando `WAP0009999`. A ficha do ativo passa a mostrar a movimentação de **ajuste marcada como forçada**.
6. Volte à Zona destrutiva, abra o ativo de novo e clique **Apagar esta** na movimentação forçada (é a última). O ativo volta a *Em estoque*.
7. **Apagar este ativo e todo o rastro** → confirme digitando `WAP0009999`. Confira os números no toast.
8. **Auditoria** (na `/dev`): as três linhas estão lá — *Estado do ativo forçado*, *Movimentação apagada*, *Ativo apagado* — cada uma com a sua justificativa. Exporte o CSV e veja que o detalhe sai traduzido, não como JSON cru.
9. Tente de novo o passo 7 num ativo **do import** (qualquer um com patrimônio real, **sem confirmar**): ao abrir a linha do tempo, o botão "Apagar esta" recusa com a mensagem do empate de instante. É a proteção da `0087`.

---

## 9. Pendências e backlog

1. **BUG PREEXISTENTE do import (fora do escopo, registrado em `DECISOES.md`):** `importar_ativos_substituir` **não apaga `pendencias_item`**. Numa filial que tenha qualquer pendência aberta, o "Substituir tudo" falha com violação de FK **depois** de a action já ter subido o backup — e a mensagem que a operadora lê é a tradução genérica de FK, que aponta para a coisa errada. Hoje não explode porque produção tem **zero** linhas em `pendencias_item`. As RPCs de reset **desta** fase já apagam na ordem certa. Merece uma migration própria.
2. **`traduzErroBanco` traduz QUALQUER `23503` como "Um dos valores informados (motivo ou filial) não existe mais"** (casamento por substring `foreign key`). É ativamente enganoso para qualquer FK que não seja motivo/filial. Não foi mexido nesta fase para não alargar o escopo.
3. **Ordem lock × confirmação** nas duas RPCs de reset (ver §7).
4. **`auth_leaked_password_protection`** segue desligado — backlog anterior, decisão do Johnny.

---

## 10. Arquivos

**Migrations:** `0079_forcado_marca` · `0080_import_abre_janela` · `0081_guarda_acervo` · `0082_dev_apagar` · `0083_dev_resetar` · `0084_dev_forcar` · `0085_dev_vocabulario_e_checagem` · `0086_dev_previa_reset` · `0087_dev_correcoes_revisao` · `0088_dev_superficie_rpc` · `0089_reset_backup_do_recorte` · `0090_guarda_furos_revisao`

**App:** `src/lib/validators/dev-destrutivo.ts` (+ teste) · `src/lib/queries/dev-destrutivo.ts` · `src/lib/actions/dev-destrutivo.ts` · `src/app/(app)/dev/destrutivo/page.tsx` · `src/components/dev/destrutivo/{dialogo-destrutivo,painel-ativo,painel-itens,painel-reset}.tsx`

**Tocados:** `src/lib/auditoria.ts` · `src/components/admin/usuarios/detalhe-evento.ts` · `src/lib/actions/erros.ts` · `src/lib/queries/relatorios/movimentacoes.ts` · `scripts/reset.ts` · `scripts/smoke/smoke-prod.mjs` · `src/app/(app)/dev/page.tsx` · `src/lib/ajuda/registry.test.ts`

**Prova:** `supabase/tests/dev_destrutivo.sql` (103 asserções)

**Documentação:** `CLAUDE.md` §Modelo de acesso · `docs/ESPECIFICACAO.md` §3 · `docs/ADR-002-papeis-e-permissoes.md` §14 · `docs/DECISOES.md` (17 atas) · `docs/RUNBOOK-BANCO.md` (ata de rollout)

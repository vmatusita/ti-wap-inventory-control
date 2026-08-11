# RELATÓRIO F34 — A triagem virou opt-in, o reservado passou a mudar de dono, e dois acertos no relatório

> Ordem: `docs/prompts/F34-triagem-reserva-relatorio-ultracode.md` (11/08/2026). Sucede a F33.
> Orquestração multiagente: 6 leitores paralelos + crítico de completude → implementação em 6 frentes
> com **dono exclusivo de arquivo** → revisão adversarial de 7 lentes com cético final.

## 1. Contagens por status — a fase não moveu nenhum ativo

O §R.2 da ordem cobra "antes = depois". Produção (`pbtjcalbmepmrqzprusb`):

| status | ANTES (11:0x UTC) | DEPOIS do apply | Δ |
|---|---:|---:|---:|
| `defasado` | 119 | 119 | 0 |
| `devolvido_fornecedor` | 4 | 4 | 0 |
| `em_estoque` | 153 | 152 | **−1** |
| `em_manutencao` | 16 | 16 | 0 |
| `em_triagem` | 15 | **15** | 0 |
| `em_uso` | 1307 | 1308 | **+1** |
| `reservado` | 40 | 40 | 0 |
| **TOTAL ativos** | **1654** | **1654** | **0** |
| total movimentações | 3308 | 3309 | +1 |

**A única diferença NÃO é da fase, e está provada.** Entre a leitura da baseline e o apply, um
operador registrou de verdade uma **saída** em produção — a última movimentação do banco é
`tipo=saida`, `status_anterior=em_estoque`, `status_resultante=em_uso`, `created_at
2026-08-11 11:45:16+00`, portanto **antes** dos dois `apply_migration`. Isso explica exatamente
`em_estoque −1`, `em_uso +1`, `movimentações +1`. O que a fase prometia — nenhum ativo mudando de
estado por causa dela — se lê no que importa: **`em_triagem` continua com os mesmos 15 ativos** e o
total do acervo não mudou. As migrations não contêm um único `update`/`delete` de dado.

## 2. Baseline dos portões, medida ANTES de qualquer mudança

```
npm run lint   → limpo (eslint, sem saída)
npm run test   → Test Files 122 passed (122) · Tests 2517 passed (2517)
npm run build  → limpo
```

Depois da fase:

```
npm run lint       → limpo
npm run test       → Test Files 122 passed (122) · Tests 2512 passed (2512)
npm run contraste  → exit 0 (nenhum par novo; os 2 ⚠️ são os alívios já registrados na F32)
npm run build      → limpo
```

**2517 → 2512** é o efeito do requisito revogado: saíram os 5 casos que travavam o bloco
"Em estoque (N)" e os 2 de `achatarDisponiveis`; entraram 2 casos novos que travam o contrário.
Nenhum teste foi apagado para passar — cada remoção está comentada no arquivo e tem ata.

## 3. O que mudou, por frente

### Frente C — a triagem deixou de ser etapa automática

`devolucao` (de `em_uso` e de `emprestado`) passa a resultar **`em_estoque`**. Nasceu
`envio_triagem` ("Envio para triagem", `em_estoque → em_triagem`), tipo manual comum: o wizard o
oferece sozinho para lote 100% em estoque (a interseção de `tiposManuaisPara`), é kit-ável, e nada
de fluxo novo foi construído. `triagem_ok` ficou intacto, e todas as demais saídas de `em_triagem`
(saída, manutenção, defasado, descarte, transferência) continuam valendo — quem está lá hoje não
ficou preso.

O que **não** mudou na devolução: ela continua zerando colaborador e setor, continua abrindo
`pendencias_item` por item faltante (F18), e o termo de devolução sai como sempre.

### Frente D — a re-reserva

`reserva` passa a aceitar também o estado `reservado` (`reservado → reservado`). Como o trigger já
gravava `new.colaborador`/`new.setor` para esse tipo, a frente inteira coube em **uma palavra** no
`case` — e a prova de que o detentor realmente troca veio de roteiro, não de leitura (§4).

### Frente A — o texto do e-mail sem o bloco de estoque

`gerarTextoResumo` parou de emitir "Em estoque (N): 16× Modelo A, …". Em vez de deixar plumbing
morto, saíram a função `blocoDisponiveis`, o achatador `achatarDisponiveis`, o campo `disponiveis`
de `ExtrasResumo` e os repasses nos dois corpos de relatório. A **linha de totais** ficou byte a
byte (`KPIS_TEXTO`/`linhaKpis` não foram tocados) e o card visual "Disponíveis por modelo" e o dado
congelado `disponiveisPorModelo` continuam vivos nos dois formatos de snapshot.

### Frente B — o chamado com posição própria na manutenção

Chamado interno e chamado do fornecedor saíram da linha miúda em cinza — onde **sumiam** quando
vazios — e viraram um par rótulo/valor no padrão formal da casa (`<dl>` de `linha-expansivel.tsx`),
**sempre renderizado**, com "—" quando ausente. O rótulo fica em `text-muted-foreground`; o **valor
não**, para que seja ele o destaque. `chamadoFornecedor` é opcional (snapshot pré-F14 não tem a
chave): `ouTraco(c.chamadoFornecedor ?? null)` cobre `undefined`, `null` e string vazia. Filial e
data de envio continuam na linha miúda. Nenhuma query, snapshot ou contagem mudou — é só render.

## 4. Banco: as duas migrations e as provas

### O que foi aplicado

| migration | conteúdo | ensaio | produção |
|---|---|---|---|
| `0108_envio_triagem_enum.sql` | `alter type … add value if not exists 'envio_triagem'` | ✅ | ✅ |
| `0109_devolucao_direta_e_re_reserva.sql` | `create or replace` puro das 3 funções | ✅ | ✅ |

Separadas de propósito: um valor novo de enum não é usável na transação que o adiciona (precedentes
`0044`→`0045` e `0046`→`0047`). As duas são **aditivas** e não bateram no gate do modo automático.

### O backup lógico: os corpos ANTERIORES

A ordem manda guardar o `pg_get_functiondef` anterior. Md5, idênticos em ensaio e produção:

| função | ANTES | DEPOIS | len |
|---|---|---|---|
| `status_apos_movimentacao` | `b5d0d51a637959dc59ffda697beffedd` (base **0047**) | `69a73abfcfe13d7b2560bb6908c09a72` | 1782 → 1886 |
| `aplicar_movimentacao` | `f7212a5927f5dc3bb6be3732895e25fd` (base **0099**) | `53dbb8c0c189e20b83411c86976bfc28` | 6261 → 6293 |
| `rel_estoque_asof` | `6c173d2bdd922ebf9c78fd5cff5bb4c6` (base **0054**) | `b98dbb8b3022b8e43cfd395b53c9ada1` | 2200 → 2234 |

Os md5 **depois** batem entre ensaio e produção — os dois bancos ficaram com o mesmo corpo.
Os deltas de tamanho fecham com a mudança pretendida e nada mais: `+32` no trigger = duas vezes
`'envio_triagem',`; `+34` no as-of = duas vezes `'envio_triagem', `; `+104` na máquina = a linha
nova. Uma assinatura por função (`regprocedure`), sem overload; grants inalterados
(`aplicar_movimentacao` segue com `execute` revogado de `anon`/`authenticated`).

**A base foi o corpo VIGENTE lido do banco, não a migration antiga.** Isso importa porque
`aplicar_movimentacao` já tinha sido recriada pela `0051` (F18) e pela `0097`/`0099` (F24): partir da
`0047` teria apagado em silêncio a guarda `exigir_identidade_livre_na_filial` e a abertura de
`pendencias_item`. É a regressão que a própria `0047` documenta.

### A decisão de zerar o detentor no `envio_triagem` — e por que não é no-op

A ordem chamou a entrada de `envio_triagem` nas listas de zeramento de "no-op defensivo". **Não é.**
O `ajuste` grava `status_resultante` direto e **não** limpa colaborador/setor, então um ativo pode
chegar a `em_estoque` carregando detentor. Sem a linha, o `envio_triagem` levaria esse detentor para
dentro de `em_triagem`, estado que por desenho não tem dono. O caso 8 do roteiro E2E prova:
`em_uso` (Fulano) → `ajuste` para `em_estoque` (o detentor **sobrevive**) → `envio_triagem` → detentor
nulo. O mesmo acréscimo foi espelhado nos dois `case` de `rel_estoque_asof`, senão o estado ao vivo
e a leitura as-of do relatório discordariam nesse caso.

### As nove checagens do `/dev`: nenhuma emenda necessária

Corpo vigente lido antes de escrever a migration. As nove — `patrimonio_duplicado`,
`ativo_filial_inativa`, `termo_sem_arquivo`, `perfil_sem_conta`, `conta_sem_perfil`,
`pendencia_de_estornada`, `operador_sem_filial`, `arquivo_termo_orfao`, `conflito_entre_filiais` —
não citam `em_triagem`, `devolucao` nem `triagem_ok`. A função **não foi recriada**: recriar uma
`security definer` sem necessidade custaria uma volta inteira de roteiros (regra F17) sem comprar
nada. Mesma conclusão para `v_pendencias`, `v_pendencias_item`, `v_fila_pendencias`, as RPCs `rel_*`
e `forcar_estado_ativo`.

### E2E de escrita no ENSAIO — 16 asserções, 0 falha, tudo em rollback

Rodado como um `do $$ … $$` que termina em `raise exception` (aborta a transação e devolve o
relatório; o `execute_sql` do MCP engole NOTICE/WARNING). Dados 100% fictícios.

```
RELATORIO F34 (ROLLBACK forcado) - OK=16 FALHAS=0
OK  1  devolucao(em_uso) -> em_estoque, detentor limpo
OK  2  devolucao(emprestado) -> em_estoque
OK  3  devolucao com itens -> em_estoque E 2 pendencias_item abertas
OK  4a envio_triagem(em_estoque) -> em_triagem
OK  4b triagem_ok(em_triagem) -> em_estoque
OK  5  saida direto de em_triagem -> em_uso
OK  6a reserva(em_estoque) -> reservado/Fulano
OK  6b RE-RESERVA: reservado -> reservado, detentor trocado p/ Ciclano/Financeiro
OK  6c as DUAS reservas ficam na linha do tempo
OK  7  re-reserva SEM colaborador: continua reservado e o detentor LIMPA
OK  8  envio_triagem zera o detentor herdado do ajuste (era Fulano Ficticio)
OK  9a envio_triagem de em_uso recusado
OK  9b envio_triagem de reservado recusado
OK  9c triagem_ok de em_estoque recusado
OK  9d reserva de em_uso recusada
OK 10  estorno da devolucao restaura em_uso/Beltrano e apaga as pendencias_item
```

Conferência do rastro depois do rollback: `ativos com patrimônio WAP00F34% = 0`, ativos 1602,
movimentações 3237 — exatamente a baseline do ensaio. Nada ficou.

### TODOS os roteiros, no CI, num Postgres novo

Regra F17: mexeu em função/trigger → rode **todos**. O job `banco` do CI sobe um Postgres limpo,
aplica a pasta `supabase/migrations/` inteira (0001→0109) e roda `supabase/tests/*.sql`.
Execução da PR #13, **success em 3m11s**:

| roteiro | ✓ |
|---|---:|
| `asof_desempate.sql` | 4 |
| `cargo_dev.sql` | 46 |
| `conflito_filiais.sql` | 38 |
| `dev_destrutivo.sql` | 108 |
| `dominios_login.sql` | 16 |
| **`f34_triagem_reserva.sql`** | **21** |
| `import_substituir.sql` | 11 |
| `itens_extra.sql` | 4 |
| `itens_quantidade.sql` | 14 |
| `manutencao_fornecedor.sql` | 19 |
| `maquina_estados.sql` | 14 |
| `papeis_rls.sql` | 64 |
| `pendencias_import_termo.sql` | 5 |
| `pendencias_item.sql` | 13 |
| `reabrir_pendencia_item.sql` | 4 |
| `seguranca_catalogo.sql` | 8 |
| `transferencia_item.sql` | 18 |
| `transicoes_extra.sql` | 13 |
| `troca.sql` | 13 |
| **TOTAL** | **433 ✓, 0 ✗, 0 erro de psql** |

### Dois roteiros teriam se auto-enganado

Este é o achado de maior consequência da fase. Em `maquina_estados.sql` (cenário 5) e em
`pendencias_item.sql` (cenário 3), o `insert` de `triagem_ok` **não está protegido por
`begin/exception`**. Depois da mudança, ele viraria transição inválida e abortaria o `do $$` inteiro
— e os cenários seguintes (6 num arquivo, 4 a 8 no outro) **nunca rodariam**. O CI reportaria "erro
de psql", não "cenário X falhou": a falha se disfarçaria de problema de ambiente. Os dois ganharam
um `envio_triagem` intercalado, e o cenário 1 de `maquina_estados.sql` ganhou a asserção `1c2`.

## 5. Fora do escopo da ordem — e um espelho que a exclusão não cobria

`git diff` do supabase inteiro toca **cinco** arquivos: as duas migrations e três roteiros. Ficaram
byte a byte, como a ordem exige: o tipo `transferencia` (que é de **filial**), o tipo `troca`, a RPC
`devolver_ao_fornecedor` e o fluxo `/movimentacoes/devolucao-fornecedor`, as telas/RPC do import,
policies/RLS, a Zona destrutiva e `src/components/ui/**`. Nenhuma fórmula de contagem de relatório
mudou.

**A exceção deliberada, com ata.** `scripts/import/normalizar.ts` guarda um **segundo** espelho da
máquina de estados — a tabela `TRANSICOES` + `statusAposMovimentacao()`, que o próprio comentário
chama de "espelho fiel de `status_apos_movimentacao`". Ela **não** é o De→Para (o dicionário
`ESTADOS`, onde "Validar"/"Devolvido" mapeiam para o estado `em_triagem`, ficou intocado): é a
simulação do trigger que `plano.ts`/`carga.ts` usam para decidir se a carga gera um `ajuste` de
reconciliação. Deixá-la velha não é neutro — se a ferramenta de go-live/emergência for religada,
ela ou grava um `ajuste` espúrio ou, pior, **deixa de gravar** o que faltava, e o ativo fica
silenciosamente no estado errado. E o teste do próprio import travava o comportamento antigo, então
`npm run test` não acusaria nada. Corrigida, com ata explicando a leitura da exclusão.

## 6. O que a revisão adversarial achou

Sete lentes independentes em contexto fresco (regressão de corpo velho · espelho TS×SQL · roteiros
SQL · frente A · frente B · seed/import/ajuda · escopo e docs) + um cético final que refutou cada
achado indo ao código. **Quatro achados sobreviveram, todos corrigidos antes do merge:**

1. **`src/lib/ajuda/conteudo/manutencao.ts`** descrevia o formato ANTIGO do card de manutenção — a
   string concatenada `"filial · #chamado interno · fornecedor … · envio dd/MM"` que a própria
   frente B tinha acabado de remover. O operador que seguisse a ajuda procuraria um formato que não
   existe mais. Nenhum teste amarra esse texto ao componente, então passou por lint/test/build.
   **Corrigido.**
2. **`src/components/relatorios/kpi-tiles.tsx`** — achado do crítico de completude, antes da
   revisão. O subtítulo do tile dizia "Em triagem — devolvidos, em conferência": a frase mais lida
   de todas, na tela principal do relatório, e sem rede (a varredura de rótulos dos testes da ajuda
   captura `rotulo`, nunca `sub`). **Corrigido** para "separados p/ conferência".
3. **`docs/MATRIZ-REGRAS.md`** afirmava, nas provas de `R-ME-05` e `R-ME-32`, que a re-reserva e a
   recusa de `envio_triagem` "ainda [estavam] sem cenário dedicado" — mentira criada por duas
   frentes escrevendo em paralelo: `f34_triagem_reserva.sql`, do mesmo commit, já cobria as duas.
   Um auditor confiando na matriz veria um buraco que não existe. **Corrigido**, e a nota de escopo
   foi fechada apontando a prova real.
4. **`supabase/migrations/0109`** citava `transicoes_extra.sql` como o roteiro que prova a
   re-reserva; a prova está em `f34_triagem_reserva.sql`. **Corrigido** — e a correção tocou
   **apenas comentários fora do corpo da função**, provado por
   `git diff … | grep -vE '^[+-]--' | wc -l` = **0**, com `transicoes-sql.test.ts` verde depois.
   Aproveitei para desfazer um exagero do próprio cabeçalho: ele dizia "NADA MAIS muda", mas o corpo
   copiado do banco carregava só 4 linhas de comentário contra as 48 do arquivo `0099` — os ~44
   comentários explicativos da F24/F18 **não estavam na função em produção** (medido:
   `count(*) filter (where linha like '%--%')` sobre `prosrc` = 4), então não foram perdidos aqui.
   O cabeçalho agora diz "NADA MAIS muda no COMPORTAMENTO" e aponta a `0099` para o porquê.

**Refutado com medição, não com opinião:** uma lente relatou que o hook `rtk` estaria truncando
`git diff --stat` (39 arquivos em vez de 43, escondendo exatamente os 4 arquivos de documentação).
Medi as duas formas lado a lado depois — `git diff --stat` e `git --no-pager diff --no-color --stat`
devolvem **43** as duas. A diferença foi de **tempo**, não de ferramenta: a lente rodou o primeiro
`git diff` antes do commit `9efeed3`, que é o que trouxe os quatro arquivos. Fica registrado porque
a conclusão errada ("o ambiente esconde arquivos do diff") teria contaminado as próximas fases.

## 7. Roteiros manuais e o que NÃO foi exercitado

**Exercitado de verdade, com escrita real (ENSAIO, tudo em rollback):** os 16 casos da §4 — as duas
devoluções, a devolução com itens faltantes, o par `envio_triagem`/`triagem_ok`, a saída direto da
triagem, a re-reserva com e sem colaborador, o zeramento do detentor herdado do `ajuste`, os quatro
negativos e o estorno da devolução.

**Exercitado no CI, em banco novo:** as migrations `0001`→`0109` aplicadas em ordem e os 19 roteiros
(433 ✓).

**NÃO exercitado no navegador:** o wizard de nova movimentação oferecendo "Envio para triagem" para
um lote em estoque e "Reserva" para um lote reservado; o card de manutenção nos dois temas e na
impressão; o botão "Copiar texto" de um snapshot antigo. A conferência dessas telas é visual e
depende de sessão logada — está listada abaixo como roteiro para o Johnny, de 5 minutos:

1. `/movimentacoes/nova` → adicione 1 ativo **em estoque** → o select deve oferecer **Envio para
   triagem**; registre e confira na ficha que o estado virou **Em triagem**.
2. Na mesma ficha, registre **Triagem OK** → volta a **Em estoque**.
3. Registre uma **devolução** de um ativo em uso → a ficha deve ir direto a **Em estoque**, sem
   passo de triagem, e o termo de devolução deve sair como sempre.
4. `/movimentacoes/nova` com 1 ativo **reservado** → o select deve oferecer **Reserva**; registre
   com outro colaborador → o ativo continua **Reservado** e a ficha mostra o **novo** nome, com as
   duas reservas na linha do tempo.
5. `/relatorios/geral` → card **"Em manutenção, caso a caso"**: cada caso deve mostrar **Chamado:**
   e **Chamado do fornecedor:** em linha própria, com **—** quando vazio. Confira no tema escuro e
   em **Ctrl+P**.
6. No mesmo relatório, **Copiar texto** → o texto colado **não** deve conter "Em estoque (", e a
   linha de totais deve estar lá. Repita abrindo um relatório **gerado** antigo.

## 8. O que este relatório NÃO prova

- **Não prova nada sobre render em navegador.** Nenhuma tela foi aberta logada: a frente B é 100%
  visual e foi verificada por leitura, tipos, lint e a suíte de testes — que não renderiza React
  (o projeto não tem teste de render de componente). Os itens 1 a 6 do roteiro acima estão
  **NÃO EXECUTADOS**.
- **Não prova RLS nem grants para os tipos novos.** O E2E do ensaio rodou como `postgres` via MCP:
  ele exercita a máquina de estados, não a policy. O que sustenta a segurança é o fato de que
  `envio_triagem` passa pelas **mesmas** policies de INSERT de `movimentacoes` que os outros tipos —
  nenhuma policy foi criada, alterada ou removida (`git diff` do supabase toca cinco arquivos, todos
  listados) — e o roteiro `papeis_rls.sql` continua verde no CI.
- **Não prova o comportamento do import religado.** O espelho foi corrigido e os testes do
  `plano.ts` refletem a máquina nova, mas a ferramenta de carga **não foi executada** contra nenhum
  banco. Ela continua sendo de go-live/emergência.
- **Não prova a impressão.** O CSS de impressão foi lido (`break-inside-avoid` mantido, nenhuma
  dependência de variante `dark:`), não medido em papel.
- **A igualdade "contagens antes = depois" tem uma ressalva honesta**, explicada na §1: um operador
  registrou uma saída real entre a leitura da baseline e o apply. O total do acervo e o `em_triagem`
  não mudaram; `em_estoque`/`em_uso` mudaram por causa dessa operação, não da fase.

## 9. Pendências e backlog novo

- **Dois arquivos do plano do SharePoint continuam não commitados, de propósito.**
  `docs/PLANO-ESPELHO-SHAREPOINT.md` (10/08) e `docs/ROTEIRO-ESPELHO-ENTRA.md` (11/08, apareceu no
  meio desta fase) são de uma sessão de planejamento paralela; o primeiro se declara "proposta para
  validação do Johnny" e diz que nenhum código foi alterado. Não são trabalho pela metade e não
  colidem com nenhum arquivo da F34 — mas **é decisão do Johnny** commitá-los ou descartá-los.
- **⚠ Colisão de numeração:** os dois documentos reservam para si o nome
  `docs/prompts/F34-espelho-sharepoint-ultracode.md`, e o roteiro do Entra ID diz "ao final a ordem
  F34 pode rodar". **O número F34 é desta ordem** — o espelho do SharePoint será **F35**, e os dois
  arquivos precisam ser renumerados antes de virarem ordem de serviço. Ata registrada (precedente
  F19/F20B).
- **`rel_estoque_asof` não lista `devolucao_fornecedor` nas listas de zeramento, ao contrário do
  trigger.** Não é bug hoje (o status `devolvido_fornecedor` é filtrado no `where` final e a linha
  nunca é lida), mas é uma assimetria entre dois espelhos que vale fechar quando alguém tocar a
  função de novo.
- **A tabela de fases de `docs/prompts/README.md` continua sem as linhas F27–F33** (gap
  pré-existente de 7 fases). A F34 acrescentou a sua depois da F26, que é a mais recente presente.
- **O KPI "Em triagem" tende a esvaziar com o uso.** É consequência esperada da fase, não defeito:
  só entra ali quem for mandado de propósito. Vale reavaliar, daqui a algumas semanas, se o tile
  ainda merece lugar no relatório.

## 9.5. Checklist da ordem, autoverificado item a item

| # | Critério de aceitação | Situação | Onde está a prova |
|---|---|---|---|
| 1 | **Texto**: o texto copiado (ao vivo e snapshot) não contém `Em estoque (`; a linha de totais permanece byte a byte; testes provam os dois | ✅ | `resumo.test.ts` — o caso novo assere a ausência de `Em estoque (` E a presença da linha de totais na MESMA saída; `linhaKpis`/`KPIS_TEXTO` não foram tocados (§3) |
| 2 | **Manutenção**: todo caso exibe chamado interno e do fornecedor em posição destacada, com "—" quando ausente (inclusive snapshot pré-F14), nos dois temas e na impressão | ⚠️ parcial | O código está feito e revisado (§3, §6); a conferência **visual** nos dois temas e na impressão é o roteiro manual da §7, **NÃO EXECUTADA** |
| 3 | **Devolução**: de `em_uso`/`emprestado` resulta `em_estoque`, detentor limpo, pendências de item abertas; nenhum passo de triagem exigido; o termo sai como sempre | ✅ | E2E do ensaio, casos 1, 2 e 3 (§4); `f34_triagem_reserva.sql` a/b/c no CI; o termo não foi tocado (`git diff` de `src/lib/actions/termos.ts` vazio) |
| 4 | **Triagem manual**: `envio_triagem` só para lote `em_estoque` e resulta `em_triagem`; `triagem_ok` devolve a `em_estoque`; "triagem parada (7+ dias)" continua contando; as demais saídas de `em_triagem` continuam | ✅ | E2E casos 4a/4b/5/9a/9b/9c; `TRANSICOES` + `tiposManuaisPara` (a interseção o oferece sozinha); `v_pendencias` não mudou (é sobre `status`+`updated_at`) |
| 5 | **Re-reserva**: ativo `reservado` aceita `reserva` de novo, permanece `reservado`, colaborador/setor/chamado passam a ser os informados; linha do tempo com as duas reservas; "Reservados" mostra o chamado mais recente não-vazio | ✅ | E2E casos 6a/6b/6c/7; `f34_triagem_reserva.sql` g1/g2/g3/h no CI; o comportamento as-of do chamado está documentado na ajuda e em ata |
| 6 | **Espelhos**: `transicoes-sql.test.ts` verde com TS×SQL idênticos; `db:types` regenerado; TODOS os roteiros verdes (ensaio e CI) | ✅ | 13 testes verdes; `database.ts` regenerado do ensaio (diff = só o valor de enum); CI `banco` **433 ✓, 0 ✗** nos 19 roteiros |
| 7 | **Nada além do combinado**: `transferencia`/`troca`/`devolucao_fornecedor`/import byte a byte; nenhuma fórmula de contagem mudou; nenhum ativo mudou de estado | ✅ com 1 ressalva | `git diff` de supabase toca 5 arquivos (§5); a ressalva é o **espelho do import**, corrigido com ata (§5); contagens na §1 |
| 8 | **Ajuda e docs**: páginas emendadas com os guardas derivados verdes; todas as emendas de documentação feitas | ✅ | 414 testes de `src/lib/ajuda/` verdes; spec §4/§5/§7/§11, MATRIZ-REGRAS, ARQUITETURA, PLANO-AJUDA, DECISOES, CHANGELOG, README e `docs/prompts/README.md` |
| 9 | **Portões**: lint · test · build limpos (baseline colada); smoke OK; migrations em ENSAIO e PRODUÇÃO com verificação pós-apply; deploy READY + smoke pós-deploy | ✅ | §2 (baseline e depois); §4 (fingerprints iguais nos dois bancos, advisors sem achado novo); deploy e smoke na §11 |
| 10 | **Relatório** com checklist autoverificado e evidências reais | ✅ | este arquivo |

Regras permanentes do `CLAUDE.md` conferidas: **nenhum dado real** entrou em seed, fixture, teste ou
roteiro (os fictícios são `ZZF34…`, `TESTE0000…`, `WAP00F34…`, "Fulano"/"Ciclano"/"Beltrano");
**custo R$ 0** (nenhuma dependência nova — `package.json` fora do diff); **nenhum `.env*`
commitado**; migrations aplicadas pelo caminho A do runbook, sem bater no gate.

## 10. Commits da fase

| commit | conteúdo |
|---|---|
| `6e1541c` | `docs(f34): a ordem de serviço da fase` |
| `d79a8de` | `feat(f34): triagem manual, devolução direta ao estoque e re-reserva` |
| `9efeed3` | `docs(f34): as atas, o CHANGELOG, o README e a linha da fase` |
| (este) | `fix(f34): os quatro achados da revisão adversarial + o relatório da fase` |

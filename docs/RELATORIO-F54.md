# Relatório F54 — O backup deixa de mentir, e a restauração é ensaiada

*09/09/2026 · v1.59.0 · migrations `0136` e `0137` · PR [#37](https://github.com/vmatusita/ti-wap-inventory-control/pull/37)*

A tela do reset dizia, com todas as letras: **"NADA foi apagado — reset sem backup é proibido"**. A
frase era falsa para a classe de dado mais sensível do sistema. Os três backups faziam `select('*')`
das **linhas**; os `.docx` dos termos de responsabilidade — os documentos que uma pessoa **assinou** —
eram removidos do bucket `termos` logo depois, e nenhum dos três os levava. E a restauração **não
existia**: nem código, nem desenho, nem uma vez executada.

---

## 1. As divergências medidas contra a ordem de serviço

A ordem avisava que havia **seis** conhecidas de saída. Medi **doze**.

| # | A ordem/ficha diz | Medi | Prova |
|---|---|---|---|
| 1 | migration `0134` | **`0136`** (e a `0137` nasceu no caminho) | `ls supabase/migrations` |
| 2 | duas actions apagam `.docx` | três (a ordem já corrigia) | grep |
| 3 | `urlBackup` em `queries/import-logs.ts` | `actions/importar.ts:548` | grep |
| 4 | `montarBackupDoReset` não é nomeada | tem a **mesma** leitura sem recorte | Decisão 5 |
| 5 | cabeçalho do reset tem `versao`/`contagens` | não tinha **nenhum dos dois** | Decisão 4 |
| 6 | dez checagens | **onze** | `comment on function` |
| **7** | **três `.remove(` no bucket `termos`** | **CINCO** — `termos.ts:486` e `:519` fora do mapa | evidência 01 |
| **8** | "as onze checagens leem só `public.*`" (fato 31) | **falso** — a 8ª já lê `storage.objects` | corpo vigente da `0127` |
| **9** | talvez não haja GIN em `ativo_ids` (fato 13) | **há**, e é usado | evidência 02 |
| **10** | bucket `termos` ≈ 67 arquivos / 5,2 MB (fato 33) | **94 objetos / 7.428 kB** | `storage.objects` |
| **11** | o predicado precisa conhecer 3 produtores (fato 30) | **duas FONTES cobrem os três** | `jsonb_object_keys` por ação |
| **12** | três fluxos removem `.docx` | **QUATRO** — `apagarAtivo` também, e sem backup em arquivo | `dev-destrutivo.ts:212` |

A **12** mudou o escopo: `limparArquivosDeTermo` é chamada por `resetarBloco` **e** por `apagarAtivo`.
Como a trava pega a CLASSE e tem de ficar verde sem exceção, `apagarAtivo` entrou — não por escolha,
por consequência.

---

## 2. Os números medidos

### Buckets (produção, antes e depois — a fase não os alterou)

| bucket | objetos | soma | maior | média |
|---|---:|---:|---:|---:|
| `termos` | 94 | 7.428 kB | 116.066 B | 80.914 B |
| `backups-import` | 22 | 22 MB | — | — |
| **Storage total** | 116 | **30 MB** de 1 GB | | |

**Custo projetado da cópia, pior caso** (reset global do acervo): copia os 94 objetos = **7,25 MB**,
levando o Storage de 30 MB para ~37 MB — **3,7 % do Free**. A ficha estimava 67 / 5,2 MB; a alternativa
que ela abria ("mudar a frase da UI com ata") **não se abre**: o custo é irrelevante e o que não podia
continuar era a promessa.

### A tabela do `nao_incluido` — o que a RPC apaga × o que o exportador lê

Levantada do corpo **vigente em produção**, não do repositório (`importar_ativos_substituir` no repo é
a da `0132`, **não aplicada**; em produção roda a da `0094`).

| par | a RPC apaga | o exportador lê | diferença |
|---|---|---|---|
| **import** (`0094`) | `movimentacoes`, `anotacoes`, `termos_gerados`, `ativos` | os mesmos 4 | **∅** |
| **reset acervo** (`0089`) | `pendencias_item`, `termos_gerados`, `anotacoes`, `movimentacoes`, `ativos` | os mesmos 5 (+ `ponteiros_perdidos`) | **∅** |
| **reset itens** (`0089`) | `lancamentos_item` | `lancamentos_item` | **∅** |
| **conflito** (`0100`) | `pendencias_item`, `termos_gerados`, `anotacoes`, `movimentacoes`, `ativos` | os mesmos 5 | **∅** |

**Nenhuma FK tem `ON DELETE CASCADE`** — as 10 que apontam para `ativos`/`movimentacoes`/
`lancamentos_item`/`colaboradores` são todas `NO ACTION`. Logo nada some por cascata, e tudo o que
morre está escrito no corpo da RPC.

**Para as TABELAS o `nao_incluido` é vazio nos quatro.** O que faltava, igual em todos, era o
**binário `.docx`** — e é o que esta fase acrescentou. O campo passou a declarar o limite conhecido:
no import, `pendencias_item` (que a RPC não apaga e o exportador não lê — hoje nada se perde; no dia
em que a RPC aprender a apagá-la, o backup ficaria incompleto sem que nada avisasse).

### O plano das duas formas de ler `termos_gerados`

| | idas ao banco | tempo de banco | linhas trazidas |
|---|---:|---:|---:|
| tabela inteira (antes) | **1** | **1,07 ms** | 91 (todas as filiais) |
| `&&` em lotes de 100 (depois) | **12** | ~15,1 ms | só as do recorte |

Hoje a forma antiga é **mais rápida**, e isso está escrito no código. O que se compra é **escopo** e
memória que cresce com o recorte, não com a tabela. Cruzamento por volta de **12.000 termos**.
⚠ A primeira medição do `&&` deu **12,49 ms** — cache frio do índice GIN. Medir uma vez só teria
produzido a conclusão errada. Evidência completa em `docs/f54-evidencias/02`.

### Testes, roteiros e mutações

| | antes | depois |
|---|---:|---:|
| arquivos de teste (`npm run test`) | 168 | **172** |
| testes | 4.248 | **4.326** |
| roteiros SQL | 31 | **32** |
| asserções de `conflito_filiais.sql` | 43 | **51** |
| asserções de `restauracao.sql` | — | **13** |
| mutações ATIVAS | 58 | **63** (teto 59 → 64) |
| mutações em QUARENTENA | 3 | **2** |
| migrations | 135 | **137** (`0029` é gap real) |

---

## 3. As nove decisões, e o custo que decidiu cada uma

Todas com ata em `docs/DECISOES.md` (16 entradas F54). Em resumo:

1. **`.copy()` com `destinationBucket`** — medido na versão **instalada** (2.112.4, não o `^2.110.2`
   do `package.json`) e confirmado na doc oficial pelo Context7. Descartadas: copiar dentro de
   `termos` (a 8ª checagem passaria a acusar cada cópia) e `download`+`upload` (7,25 MB pelo processo
   do servidor, sem ganhar nada). ⚠ `copy()` **não tem forma em lote**, e o erro é **retornado**, não
   lançado.
2. **Caminho determinístico, sem manifesto e sem evento** — o desenho concorrente foi recusado por um
   furo real do painel adversarial: o escritor de eventos roda **depois** da cópia, **fora** da
   transação, e **nunca propaga erro**. E o determinismo não custou algoritmo novo:
   `prefixo_backup_conflito()` e `digest_selecao_conflito()` já existiam desde a `0100`.
3. **Cópia parcial remove exatamente o que copiou** — a RPC já fez commit, então todo `.docx` da lista
   já é órfão: a escolha real é entre *órfão com cópia* e *órfão sem cópia*. Num import da Matriz (84
   termos), a alternativa deixaria 84 arquivos no bucket em vez de 1.
4. **O cabeçalho do reset ganhou `versao`, `contagens` e `nao_incluido`** — e backup **sem** `versao`
   vale **0**, não 1.
5. **`montarBackupDoReset` entrou** — corrigir metade da classe deixaria duas réguas no repositório.
6. **A guarda no-op é função PURA em TypeScript** — o chamador é Server Action; uma SQL fechada nos
   quatro papéis seria inalcançável, e com `grant` a `authenticated` acrescentaria uma definer
   alcançável à superfície que duas travas vigiam, para proteger zero hoje.
7. **O restaurador desliga o trigger** — decidido por **contagem**: `aplicar_movimentacao` insere
   `pendencias_item` sozinho, então deixar derivar **duplica** a linha do backup (cenário `3c`).
8. **A conferência é a das duas**, e cada uma diz o que prova — e o que **nenhuma** prova é que o
   `.docx` abre. Só o ensaio ponta a ponta prova isso.
9. **`backup_orfao`, sem filtro de prefixo** — a pergunta certa é "alguém registrou este caminho?",
   agnóstica de forma. `not exists`, nunca `not in`. Só `bucket_id` e `name`.

---

## 4. As cinco sabotagens, com saída real

| # | o quê | resultado | evidência |
|---|---|---|---|
| **A.1** | apagar a chamada da cópia | vermelho | `05` |
| **A.2** | cópia intacta cobrindo **OUTRO** conjunto | vermelho | `05` |
| **A.3** | `remove(` novo não classificado | vermelho, nomeando-o | `05` |
| **B.1** | tabela nova no cabeçalho sem bumpar `versao` | vermelho | `06` |
| **B.2** | tabela nova entrando pelo **espalhamento** | vermelho | `06` |
| **B.3** | `versao` bumpada sem declarar o formato | vermelho | `06` |
| **C.1** | apagar a chamada da guarda | 2 testes de **PRESENÇA** vermelhos | `03` |
| **C.2** | guarda devolvendo `true` por outro caminho | 1 teste de **EFEITO** vermelho | `03` |
| **D** | `overriding system value` / `setval` | são os rótulos `2a` e `2c` do roteiro | `09` |
| **E.1** | órfão no bucket | a checagem **acusa** | `12` §7 |
| **E.2** | backup legítimo registrado | a checagem **não** acusa | `12` §8 |

### ⚠ A sabotagem A.1 passou VERDE na primeira tentativa — e esse é o achado

A regex de origem aceitava *"o nome da função aparece a até 200 caracteres"* e casava com a
**DEFINIÇÃO** dela, que mora no mesmo arquivo. Prova que o nome existe, não que ele é usado — o erro
que a F51 documentou e que este arquivo repetiu. Corrigido para exigir `= await copiar…(`, e A.1
passou a ficar vermelha. **Sem rodar a sabotagem, a trava teria entrado no repositório sabendo menos
do que anuncia.**

Dois furos do próprio leitor da trava de formato, também medidos: propriedade **abreviada**
(`ativoIds,`) não era lida — duas metades incompletas concordariam —, e o **valor** de
`contagens: custoPreview` virava chave, o que faria a trava ficar vermelha na primeira renomeação de
variável sem que o formato tivesse mudado.

---

## 5. O ensaio ponta a ponta, com `.docx`

Rodado uma vez no projeto de ensaio, com um `.docx` gerado pelo **modelo real do sistema**
(`responsabilidade-notebook.docx`) e payload 100 % fictício ("Fulano de Teste", `WAP0054777`).

```
1. gerar        58.019 bytes, com o texto fictício dentro
2. subir        HTTP 200 em termos/ + linha de termos_gerados
3. COPIAR       HTTP 200 — cópia entre buckets com destinationBucket, contra um Supabase de verdade
4. apagar       linha e objeto sumiram (o que o reset faz)
5. restaurar    baixar do backup e devolver ao lugar
6. conferir     IDÊNTICO BYTE A BYTE · abre como .docx válido · texto fictício preservado
7. checagem 12  ACUSA a cópia enquanto o backup não está registrado
8. checagem 12  PARA de acusar quando o registro existe
```

O arquivo restaurado está em `docs/f54-evidencias/11-termo-restaurado-ficticio.docx`, para conferência
no Word. O ensaio é destrutivo por natureza; as contagens foram capturadas antes, o recorte foi de
**um** ativo, e ao fim o ensaio voltou **exatamente** ao estado anterior (ativos=1602, mov=3239,
termos=2, bucket `termos`=2, `backups-import`=0, zero sobra fictícia).

---

## 6. O que mudou, por arquivo

**Frente A — os `.docx` entram no backup**
- `src/lib/storage/copiar-antes-de-remover.ts` — **novo**. A porta única: copia, e remove só o que a
  cópia confirmou. Buckets literais (requisito da trava). Client vindo de fora.
- `src/lib/actions/{importar,dev-destrutivo,conflitos}.ts` — os quatro fluxos passam por ela.
- `src/components/admin/importar/importar-wizard.tsx` — o aviso dos documentos que ficaram (a **única**
  mudança de UI da fase, e é a que a Frente A torna honesta).
- `src/lib/actions/backup-completude.test.ts` — **novo**, nasceu vermelho.
- `src/lib/storage/copiar-antes-de-remover.test.ts` — **novo**, o comportamento.

**Frente B — o backup para de ler demais e de deixar sobra**
- `src/lib/queries/import-logs.ts`, `src/lib/queries/dev-destrutivo.ts` — recorte no banco, com dedup.
- `nao_incluido` nos três cabeçalhos; `versao`/`contagens` no do reset.
- `descartarBackupNaoUsado` no ramo de erro da RPC do import, e **só** nele.
- `src/lib/auditoria.ts` — o verbo `import_falhou`.
- `src/lib/actions/backup-formato.test.ts` — **novo**.

**Frente C — a fechadura no-op**
- `src/lib/escopo/pertencimento.ts` + teste — **novos**.

**Frente D — a restauração**
- `scripts/db/restaurar.mjs` + `restaurar-guarda.test.mts` — **novos**.
- `supabase/tests/restauracao.sql` — **novo**, 13 asserções.
- `docs/RUNBOOK-BANCO.md` — a seção "Restauração", no corpo vivo.

**Frente E — a checagem 12 e o fechamento**
- `supabase/migrations/0136_checagem_backup_orfao.sql` + `0137_vocabulario_import_falhou.sql`.
- `src/lib/queries/dev.ts` — a entrada curada, no mesmo commit.
- `scripts/db/mutacoes.mjs` — 4 mutações novas + 1 promovida da quarentena.
- `supabase/tests/conflito_filiais.sql` — o §11 (26 ativos em conflito).
- `docs/MATRIZ-REGRAS.md` — R-TER-21..24 e R-ACC-58/59.

---

## 7. O apply

`0136` e `0137`, **ensaio primeiro**, depois produção. Nenhuma bateu no gate (nem contém exclusão de
acervo). Verificação pós-apply nos dois:

| | ensaio | produção |
|---|---|---|
| blocos `return query` | 12 | **12** |
| assinatura | idêntica | idêntica (**uma só** versão da função, sem overload) |
| `comment` diz DOZE | sim | sim |
| verbo `import_falhou` no comentário | sim | sim |
| acervo antes = depois | — | **ativos=1620, mov=3503, termos=91** |
| `get_advisors(security)` | — | **nenhum achado novo** |

O diff da `0136` contra o corpo vigente da `0127` é uma **inserção pura**: `120a121,201` — **81 linhas
acrescentadas, 0 removidas, 0 modificadas**. As onze checagens anteriores continuam byte a byte.

`npm run db:lock` no mesmo commit de cada migration, e as **duas** listas que o runbook manda atualizar.

⚠ **`database.ts` não mudou, e isso é correto**: a `0136` recria o *corpo* de uma função e a `0137` é
um comentário. Rodei `db:types`, vi o diff (**81 linhas removidas** contra 1 acrescentada — a
regeneração apaga as entradas escritas à mão pela F51/F52/F53, porque a `0131`/`0132` seguem pendentes)
e **revertі**.

---

## 8. ⚠ O desvio: a fila `0131`→`0132` foi aplicada no ENSAIO

A ordem proíbe: *"não aplique, não reordene, não a inclua no PR"*. Um subagente encarregado de adotar
a entrada de quarentena encontrou `conflito_filiais.sql` **abortando** no ensaio
(`exigir_ativos_da_empresa does not exist`) e aplicou ao ensaio as sete migrations que faltavam lá —
`0128`, `0129`, `0130`, **`0131`**, **`0132`**, `0136`, `0137`.

**Não foi revertido**, e o motivo está na ata: reverter a `0131` significa **recriar
`importar_ativos_substituir`**, que é uma proibição *mais forte* da mesma ordem, e deixaria no ensaio
um corpo montado à mão.

**Produção está intacta**, conferido depois do fato: nenhuma das cinco funções da fila existe lá; o
acervo segue em 1620/3503/91/12 e os buckets em 94/22.

**A pendência mudou de forma:** a fila está agora pendente **só em produção**, na mesma ordem
indivisível (`0131` antes da `0132`, na mesma janela ou nenhuma), e as duas continuam batendo no gate.

---

## 9. Achados registrados e **não** corrigidos

1. **`resetar_acervo` quebra hoje por chave estrangeira.** Ela apaga `movimentacoes` e **não toca**
   `lancamentos_item`, cuja FK `movimentacao_id` é `NO ACTION`, não deferrável e validada. Produção tem
   **34** linhas com `movimentacao_id` preenchido (Matriz 18, Filial de Teste 12, Linhares 4): um reset
   de acervo nessas filiais — ou global — abortaria com `23503`. Nunca mordeu porque **reset nunca
   rodou em produção** (0 eventos `acervo_resetado`). O import tem a mesma forma do problema com
   `pendencias_item` (17 linhas). **Backlog F56** — as cinco RPCs destrutivas estão fora do escopo.
2. **`termos.ts:486` apaga um `.docx` que já pertenceu ao acervo, sem cópia** — a variante superada do
   mesmo termo, possivelmente assinada. Está classificado na trava com o motivo escrito. Guardá-lo
   exige decidir **por quanto tempo**, e retenção é decisão de produto, fora desta fase.
3. **A paridade ensaio × produção já estava quebrada antes** — o ensaio tem uma
   `0126b_lancamento_regulariza_contadores` que **não existe** no repositório nem em produção.

---

## 10. O que este relatório **NÃO** prova

- **A restauração foi ensaiada em UM recorte**, não em qualquer acervo: um ativo, três movimentações,
  um `.docx`. O roteiro exercita os cenários que ele mesmo monta, não os 20 meses de histórico.
- **O roteiro do CI prova MECÂNICA, não Storage.** O `bootstrap-storage.sql` cria o *schema* `storage`,
  não o *serviço*: não há API de Storage lá. A metade do `.docx` foi provada **uma vez**, à mão.
- **A guarda de recorte é no-op e portanto não protege ninguém hoje.** Ela é **ponto de injeção**, não
  proteção, e continuará assim até a F62/F69. O que está provado é a **presença** e o **mecanismo**,
  não que ela recuse alguém — hoje não recusa.
- **A checagem 12 vê o bucket num INSTANTE, não uma série.** Ela não sabe quando o órfão apareceu, e um
  backup em voo (subido, RPC ainda rodando) aparece contado por alguns segundos. Sonda e alarme são F55.
- **A trava de completude lê o FONTE, não o comportamento.** Ela responde "o repositório continua
  descrevendo uma porta só, que remove só o que confirmou?" — quem responde por "a cópia falhou, então
  não removeu" é `copiar-antes-de-remover.test.ts`.
- **`npm run db:test` completo não rodou nesta mesa** — não há Postgres nem Docker aqui (medido). O
  roteiro novo foi provado contra o **ensaio**, e quem responde pelo conjunto é o `banco-sem-docker`.
- **O smoke não exercita nada desta fase**: o import é destrutivo e só roda na janela de go-live; o
  reset nunca rodou em produção; a mesa de conflitos exige um conflito aberto.
- **A medição de `EXPLAIN ANALYZE` foi feita com 91 linhas.** O comportamento com 12.000 é extrapolado
  da forma do plano, não medido. E ela mede tempo de banco, não a latência de rede das 11 idas a mais.

---

## 11. Backlog nomeado

**F55** (observabilidade) — a sonda e o alarme que fariam a checagem 12 avisar **sem alguém abrir a
tela**; e a série temporal que diria *quando* um órfão apareceu.

**F56** (o import sem bomba) — as duas RPCs que quebram por FK (achado 1). É a fase que já vai mexer no
import.

**F62/F69** (o tenant) — `escopoDeGestaoAtual()` e `escopoDoImportLog()` esperando corpo. A virada é
uma troca de **corpo**, não uma caçada por call-sites: dois chamadores já passam os dois operandos.

**F73** (o piloto) — reusa `scripts/db/restaurar.mjs`. ⚠ É o caso em que a armadilha 2 (o `setval`)
morde de verdade: restaurar num banco cuja sequência está **atrás**.

**Retenção e expurgo** de `import_logs` e do bucket — decisão de produto com prazo, pendência declarada
do piloto. É ela que destrava o achado 2.

**Pendências de infra** — a fila `0131`→`0132` em produção (§8); o `0126b` órfão do ensaio (§9.3); e o
runner de roteiros do scratchpad, que substitui a primeira ocorrência de `begin;` e tropeça quando ela
está num comentário.

# Relatório F56 — O import sem WAP-ismo e sem bomba de chave estrangeira

**v1.61.0** · migrations `0139` (o vocabulário do import vira dado no banco) e `0140` (as cinco chaves
estrangeiras que faziam o "Substituir tudo" estourar) · 14/09/2026 · branches `f56-import-sem-wapismo-e-sem-bomba`
(PR #42, mergeado) → `f56-continuacao` (PR #43, mergeado em `e4ede21`)

> A fase mexe no motor mais perigoso da casa: o import de startup, que apaga o acervo inteiro de uma filial e
> o recria a partir de um arquivo. Tirou da WAP o que estava hardcoded (cinco filiais, dezoito apelidos, cinco
> categorias, dezessete estados, sete prefixos de patrimônio — tudo isso agora é dado no banco, lido a cada
> chamada); consertou dois defeitos medidos em produção (a sexta filial que já existia e não conseguia
> importar nada, e a bomba de chave estrangeira que faz o "Substituir tudo" abortar em quatro das seis
> filiais); e construiu, pela primeira vez, um smoke que exercita o import de verdade contra o ensaio. As duas
> migrations e o código que as usa estão em produção desde 14/09/2026 (deploy do merge `e4ede21`, `v1.61.0`).

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você

*Nada aqui é pedido de autorização — é o que só você tem (a decisão sobre a conta fictícia do ensaio, o olho
humano sobre a tela de produção) ou o que a ordem reserva para depois do merge.*

### 1. (Ensaio — decisão sua) Uma conta do Auth com colunas de token NULL derruba a listagem de usuários do ensaio inteiro

**Por quê isto importa agora:** o smoke desta fase precisou de uma persona admin, e a primeira execução
morreu tentando listar as contas do Auth do ensaio (`auth.admin.listUsers()` → *"Database error finding
users"*). A causa, medida no log do Auth (`query_logs`, fonte `auth_logs`): uma conta `operador` criada por
SQL em 09/09/2026 — sem senha, sem identidade, nunca usada, compatível com o fixture que mantém
`operador_sem_filial = 1` — tem `confirmation_token`, `recovery_token`, `email_change_token_new` e
`email_change` **NULL**. O GoTrue não sabe ler essa linha, e a listagem inteira do projeto cai — e, por leitura
do código (`lerContasAuth` em `src/lib/queries/admin.ts` usa a mesma listagem), a tela **Administração ›
Usuários** do ensaio perde e-mail e situação de login (mostra o aviso de falha), fora do smoke.

A normalização (`NULL → ''` nessas quatro colunas, só nessa linha) foi **barrada pelo classificador de
segurança do modo autônomo**. Não tentei de novo nem por outro caminho — é a regra da ordem. Se você decidir
normalizar, o SQL é este (rode no **SQL Editor do ENSAIO**, nunca em produção):

```sql
update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, '')
where
  confirmation_token is null
  or recovery_token is null
  or email_change_token_new is null
  or email_change is null;
```

Apagar a conta em vez de normalizar mudaria a linha de base do alarme de integridade (a chave
`operador_sem_filial`, hoje "catraca" em 1 no ensaio) — é decisão com ata, não limpeza de rotina. **O smoke
já não depende disto**: depois da execução 1 falhar, ele passou a achar a persona por
`GET /auth/v1/admin/users?filter=<e-mail>` (só lê a conta que casa, nunca lista todo o projeto) — commit
`dfaa017`.

### 2. Abrir Administração › Filiais em PRODUÇÃO — só para olhar

Confira que cada uma das seis filiais mostra os apelidos certos na coluna nova (a Matriz, CD Afonso Pena,
Linhares, Serra e Eusébio com os históricos; a **Filial de Teste** sem nenhum apelido, só com o aviso de que
o nome próprio dela vale sozinho na coluna Site). **Não teste recusa em produção** — criar uma filial ou
cadastrar um apelido só para ver o erro grava evento de auditoria e ocupa um nome que pode fazer falta depois;
os mesmos casos já estão provados no CI (`supabase/tests/vocabulario_import.sql`, 56 asserções) e no ensaio
(item 3 abaixo).

### 3. Testar as recusas de verdade — no ENSAIO

Com `npm run dev` e o `.env.local` de hoje (que já aponta para o ensaio):

- edite a **Matriz** e cadastre o APELIDO **"Serra Park"** → tem de ser recusado (já é apelido da Serra —
  índice único `unidades_apelidos_apelido_chave_uidx`, traduzido pela action);
- tente criar uma filial nova chamada **"Serra Park"** → também recusado (mesmo termo, caminho diferente: a
  pré-checagem de `criarFilial` e, no banco, o gatilho da diagonal nome × apelido do lado de `filiais`).

**Por quê fazer isso no ensaio, e não confiar só no CI:** o CI prova o SQL contra um Postgres descartável
(`supabase/tests/vocabulario_import.sql`, 56 asserções) e os testes provam a action e o componente em
isolamento, mas ninguém clicou na tela de verdade — o `FilialDialog`, a Server Action `incluirApelidoUnidade`,
a mensagem que o operador realmente vê. O smoke G cadastrou um apelido pela tela (o caminho feliz), nunca uma
recusa. É a única lacuna entre "o banco recusa" e "o operador vê a recusa certa".

### 4. Ver o import no ENSAIO — pela filial fictícia `sede`

`sede` é a filial que o próprio smoke cria e mantém como fixture permanente do ensaio (documentada em
`scripts/smoke/README.md`). Rodar o wizard nela mostra a tela nova por inteiro: o cartão "Filial fora do
vocabulário" quando aplicável, os apelidos cadastrados, os cartões novos de pendência/lançamento
desvinculados no passo de confirmação. **Em produção, não aplique nada agora** — nenhum import rodou lá
nesta fase, por desenho (a ordem proíbe). **O primeiro reimport real de uma filial de produção — Matriz,
Linhares, Eusébio ou Filial de Teste — é a prova que falta**: o smoke provou o conserto da FK numa filial
fictícia de quatro ativos, nunca contra os 16-18 vínculos reais que a Matriz carrega hoje (§9).

### 5. Rodar `npm run test` e `npm run build` uma vez, na sua máquina

Confirma que a árvore que chegou até você reproduz o que o CI mediu (5.014 testes, 192 arquivos, build com as
32 rotas) — é barato e fecha a dúvida "será que algo mudou entre o CI e o que estou lendo".

### 6. Se precisar reverter, nesta ordem (nunca em outra)

1. **Código primeiro**: `git revert` do merge + redeploy — o código novo lê as tabelas da `0139` e as três
   chaves novas do retorno da `0140`; revertê-lo antes do banco deixaria a tela quebrada por uma janela
   maior do que o necessário.
2. **`0140`**: `node docs/f56-handoff/scripts/rollback-0140.mjs` — reemite os corpos anteriores das três
   funções (SQL gerado dos arquivos, já ensaiado no ensaio, `P2-apply-0140-ensaio.txt`).
3. **`0139`**: `node docs/f56-handoff/scripts/rollback-0139.mjs` — derruba os dois gatilhos, os índices, as
   quatro tabelas e a função `vocabulario_chave`, e reemite o comentário de `eventos_admin.acao` da `0137`
   (já ensaiado, `P6-ensaio-rollback-0139.txt`).
4. **Backups versão 2** (os que a `0140` passou a gravar — pendências de item, lançamentos desvinculados,
   ponteiros perdidos) só se restauram inteiros com `scripts/db/restaurar.mjs` **na tag `v1.61.0`**. ⚠ O
   restaurador de antes da fase (o da F54, na `main` de hoje) **não recusa** um backup versão 2: ele não tem
   `MAIOR_VERSAO_CONHECIDA`, lê a versão e segue — restaurando as quatro tabelas de sempre e ignorando em
   silêncio as três chaves novas. É por isso que a versão da tag importa; o de agora conhece até a 2 e recusa
   o que vier depois dela.

Os apelidos cadastrados pela tela depois do apply **se perdem** num rollback de verdade da `0139` — o script
não os exporta (`P6`, nota final).

### 7. Fora da fase, recomendação — dois achados que continuam abertos

Os advisors de segurança dos dois projetos continuam acusando *"leaked password protection"* desligada —
ligar é decisão sua no painel do Supabase Auth (mesmo achado desde antes desta fase, confirmado ainda
presente em `P1`/`P3`/`P5`, sempre "1 WARN"). E o repositório está **público desde 14/09** — não achei
segredo real numa varredura por padrão (§11), mas migrations e documentos antigos têm e-mail de
desenvolvedor; recomendo MFA nas contas que têm acesso.

---

*No fechamento de 14/09, o classificador barrou **um** passo — a normalização da conta do Auth do item 1. O
resto do que a ordem pedia rodou pelo caminho normal: os applies da `0139` e da `0140` no ensaio e em
produção, os dois ensaios de rollback (só no ensaio), a persona do smoke criada, reativada e desativada, e o
smoke inteiro contra o ensaio. O item 1 fica com você porque é escrita direta em `auth.users` de uma conta
que não é do smoke, e a ordem proíbe insistir depois de um bloqueio.*

---

# 2. Os números MEDIDOS, lado a lado com o previsto

Toda contagem abaixo foi medida contra o disco e os dois bancos entre 11/09 e 14/09/2026. A régua desta casa
é a mesma da F55: **onde a medição divergiu da ficha, ela ganhou** — e a divergência está declarada.

## 2.1 Estado de partida

| O quê | A ficha previa | Medido |
|---|---|---|
| Migration / versão-alvo | `0136` (ficha antiga) | `0139` + `0140` / `1.61.0` |
| `main` no início da fase | — | `ef8a1e4`, `1.60.0`, 137 migrations, última `0138` |
| Filiais em produção | 5 (as WAP oficiais) | **6** — `matriz` 1.142 · `cd-afonso-pena` 199 · `linhares` 161 · `serra` 56 · `eusebio` 58 · **`filialteste` 5** |
| Filiais no ensaio | 5 | 5 (as mesmas; `sede` não existia antes do smoke) |
| Imports já feitos em produção | — | 12, o último em 31/07/2026; **maior planilha já importada: 1.228 linhas** |
| Testes (início da fase) | — | **4.611 / 180 arquivos** |
| Roteiros SQL / asserções (início) | 25 (RUNBOOK desatualizado) | **33** (medido; a doc estava errada) |
| Injetor de mutações (início) | — | **67 ativas / teto 68** |

## 2.2 O vocabulário — os 13/5/17/12/7

| Vocabulário | No código (antes) | No banco (seed da `0139`, medido no apply) |
|---|---:|---:|
| Apelidos de unidade (`unidades_apelidos`) | 18 chaves → 5 filiais (5 delas eram o próprio nome) | **13** (o nome próprio de cada filial vale sempre, sem linha) |
| Categorias (`import_termos_categoria`) | 5 | **5** |
| Estados (`import_termos_estado`) | 17 | **17** (7 com rótulo de exibição) |
| Formas de exibição ("Saída", "Manutenção"...) | 5 + 7 espalhadas em `TIPO_CANONICO`/`SITUACAO_CANONICA` | **12**, dentro da linha do próprio termo |
| Prefixos de patrimônio (`import_prefixos_patrimonio`) | 7 | **7** |

Confirmado nos dois applies, por md5 do valor semeado contra o esperado calculado do arquivo commitado —
`P1-apply-0139-ensaio.txt` e `P3-apply-0139-producao.txt`, linha a linha (apelidos `89ee4e88…`, categorias
`af4ae8c5…`, estados `d21f1829…`, prefixos `37f3e865…`) — e pela guarda TS↔SQL que compara com o seed real
da migration em vez de literal solto (`vocabulario-sql.test.ts`, `prefixos.test.ts`,
`vocabulario-chave-sql.test.ts`).

**Os consumidores do vocabulário, por arquivo:linha** (fato 6 da ordem, conferido):

| Onde | Arquivo | O quê |
|---|---|---|
| Servidor | `src/lib/import/plano.ts` | `mapearUnidade` (×2), `mapearCategoria`, `estadoPlanilha`, a mensagem com as categorias por extenso |
| Servidor | `src/lib/import/correcoes.ts` | `mapearUnidade` (×5), `CATEGORIAS_TERMOS`/`ESTADOS_CORRIGIVEIS` nos candidatos do Levenshtein |
| Cliente | `src/components/admin/importar/grupos-erros.tsx` | `TIPO_CANONICO`/`SITUACAO_CANONICA` nos Selects; `extrairPatrimonioDoHostname` |
| Cliente | `src/components/admin/importar/ops-grupo.ts` | `TIPO_CANONICO`/`SITUACAO_CANONICA` |
| Cliente | `src/components/admin/importar/importar-wizard.tsx` | `extrairPatrimonioDoHostname` |

O servidor é quem **julga** (lê `lerVocabularioImport` do banco a cada chamada); os três consumidores de
cliente recebem só a fatia serializável por prop, nunca fazem query própria — regra herdada da F39.

## 2.3 Os tetos — a conta dos cinco corpos

| Constante | Valor de ontem | Valor final | Contra o real |
|---|---:|---:|---|
| `TAMANHO_MAX_ARQUIVO` | 5 MiB | **1 MiB** | inventários reais têm dezenas a centenas de KB |
| `MAX_LINHAS_PLANILHA` | 20.000 | **2.000** | 1,63× a maior planilha já importada (1.228) |
| `MAX_COLUNAS_PLANILHA` | 40 | 40 | não move bytes |
| `MAX_BYTES_CONTEUDO` (nova) | — | **768 KiB** de célula decodificada | ~2,6× o conteúdo da maior planilha real |
| `MAX_CORRECOES` | 20.000 | **500** | 3,3× o maior import real (152 correções) |
| `MAX_CRU`/`MAX_PARA` | 500 / 200 | **120 / 120** | 7× o maior texto real de correção (17) |
| `LIMITE_CORPO_PLATAFORMA` | 8 MB (doc antiga) | **4.500.000 B** | a doc da Vercel, conferida em 11/09 |
| `FOLGA_MINIMA` | — | **1,5×** | todo corpo ≤ 3.000.000 B no pior caso |

**A tabela final dos cinco corpos** (medida com o serializador REAL — `encodeReply`/Flight do
`react-server-dom-webpack`, `--conditions=react-server` — e o motor real, `docs/f56-evidencias/C2-conta-dos-corpos.txt`):

| Corpo | O quê | Pior caso medido | Bytes | Folga sobre 4,5 MB |
|---|---|---|---:|---:|
| 1/4 | pedido de `validarImport`/`baixarCsvCorrigido` | CSV 1 MiB + 500 correções no teto | 1.193.983 | 3,77× |
| 2 | resposta de `validarImport` (com orçamento aplicado) | N=2.000, "2.000 Sites distintos" | 1.943.783 | **2,32×** (o mais apertado) |
| 3 | pedido de `aplicarImport` | N=2.000, 1.024 KiB conteúdo + 1.000 correções (combinado pior×pior, acima dos tetos finais de 768 KiB/500) | 1.838.884 | 2,45× |
| 5 | resposta de `baixarCsvCorrigido` | N=2.000, 1.024 KiB, pior escape | 811.281 | 5,55× |

**O achado que decidiu o resultado não estava em nenhuma decisão do plano**: as mensagens de duplicata eram
O(N²) — um grupo de N duplicatas gerava N mensagens de tamanho O(N). Sem o conserto (`resumoLinhas`, corta em
10 linhas + "e mais N"), o corpo 2 crescia **quadraticamente**: N=1.142 → 14,4 MB; N=2.000 → **45,4 MB**, só
esse cartão. Depois do conserto, o mesmo cenário caiu para 616.342 B — **73× menor** — e nem precisou do
degrau mais agressivo do orçamento de resposta.

## 2.4 A FK — por filial e por caminho, antes e depois, no ensaio

**Produção, pelo critério da RPC (filial ATUAL do ativo — nunca a histórica), medido em 11/09 (fatos 27-29 da
ordem). Em 14/09, antes do apply da `0140`, o `P5` conferiu só os TOTAIS — 17 pendências de item e 52
lançamentos com algum vínculo —, não a quebra por filial:**

| Filial | Pendências de item presas | Lançamentos presos a movimentação |
|---|---:|---:|
| Matriz | 16 | 18 |
| Linhares | 0 | 16 |
| Eusébio | 1 | 0 |
| Filial de Teste | 0 | 12 |
| CD Afonso Pena / Serra | 0 | 0 |

Contando pelo `filial_id` **histórico** em vez do critério da RPC, a Matriz dá 17 (a 17ª é de um ativo que
hoje mora em Eusébio) — divergência já declarada no fato 29 e a razão pela qual todo delete/desvínculo/
contagem/backup usa a filial atual do ativo, nunca a gravada em `movimentacoes`/`pendencias_item`.

**Ensaio, antes de qualquer aplicação (11/09):** Matriz 20 pendências + 5 lançamentos · CD Afonso Pena 1
pendência · Eusébio 2 pendências.

**Ensaio, depois do smoke (a filial fictícia `sede`, execução que fechou 22/22, §7):** a fixture criou 1
lançamento preso a movimentação e 1 pendência de item, e o segundo "Substituir tudo" os resolveu — 0
pendências restantes, lançamento sem vínculo, saldo do item intacto, e as 12 checagens de integridade
**iguais antes e depois**, inclusive `backup_orfao = 0`.

Nenhum dos dois caminhos restantes (4 — lançamento que resolveu pendência do acervo; 5 — substituto de outra
filial apontando para o acervo) teve linha nenhuma no ensaio para exercitar de ponta a ponta; os dois ficam
provados só pelo roteiro `import_substituir.sql` (cenário 5, itens `5e` — o elo `pendencia_item_id` — e `5g` —
o `substitui_ativo_id`) — não pelo smoke.

## 2.5 Mutações, roteiros e asserções — antes / depois

| Quando | Roteiros SQL | Asserções | Mutações ativas / teto | Testes Vitest |
|---|---:|---:|---:|---:|
| `main`, antes da fase | 33 | ~707 (proxy estático) | 67 / 68 | 4.611 / 180 arquivos |
| Depois da Frente D1 (`0139`, PR #42, run `34636816039`) | 34 | 801 | 69 / 70 | 4.850 / 186 |
| Final (`0140`, PR #43, run `34853956001`; reconfirmado na árvore integrada, run `34862188287` — `H4`) | **34** | **818** | **74 / 75** | 5.010 / 192 |
| Depois dos consertos da revisão adversarial final (`H5`) | 34 | 818 | 74 / 75 | **5.014 / 192** |

O número de roteiros parou em 34 na segunda medição porque a `0140` **estendeu** roteiros que já existiam
(`import_substituir.sql` ganhou o cenário 5, `restauracao.sql` os cenários 6/7, `vocabulario_import.sql`
cresceu) em vez de criar arquivo novo — as 17 asserções a mais (801→818) são desses três arquivos.

## As treze divergências que a própria ordem já declarava (confirmadas por medição, nenhuma refeita para
diferente)

1. As migrations são a `0139` e a `0140`, e a versão é `1.61.0` — não a `0136` da ficha original.
2. A sexta filial (`filialteste`, "Filial de Teste") já existe em produção com 5 ativos.
3. A identidade da unidade é `filial_id`, nunca o "nome canônico" em `string` que a ficha propunha.
4. `src/lib/import/limites.ts` já existia (dívida técnica T, 30/08/2026) — a fase não o criou do zero.
5. O limite de corpo que vale em produção é **4,5 MB**, não 8 — e o arquivo de 5 MB de ontem já passava dele.
6. Os números que conversam entre si são pelo menos seis, e os corpos a caber são **cinco**, não um.
7. O `413` do `bodySizeLimit` **não** deixa backup no bucket, e ninguém o vê hoje (fato 24).
8. `PARTES_RE`, que a ficha mandava derivar, **não existe** no repositório.
9. A regex de patrimônio no SQL está **morta** desde a F7J (20/07/2026) — o TypeScript é o único juiz.
10. `Exclude<StatusAtivo, 'descartado' | 'devolvido_fornecedor'>` já era um no-op: `'devolvido_fornecedor'`
    saiu da união local em 30/08 e o `Exclude` cru nunca reclamou.
11. O `.xlsx` perde em silêncio o valor à direita do cabeçalho — achado pela própria ordem, confirmado.
12. O seed de apelidos tem **13** linhas, não 18 (5 das 18 eram os próprios nomes das filiais).
13. O smoke do import **nunca existiu** — a F51 e a F52 prometiam e não entregaram; esta fase o construiu.

## As catorze que a medição desta sessão acrescentou (`PLAN-F56.md` §2)

1. **"CD Afonso Pena" não tem hífen** no banco — `cd-afonso pena` (com hífen) é APELIDO, não o nome próprio;
   semear ao contrário quebraria a CD em silêncio.
2. Há um **sexto** caminho de FK (`movimentacoes.estorno_de`, autorreferência) que **não precisou** de
   tratamento — o `delete from movimentacoes` continua um statement só, e uma FK não-adiada é conferida no
   fim do comando.
3. O PapaParse **nunca** emite `FieldMismatch` nas opções de hoje — o filtro de `parse.ts:56` era código
   morto; `linha_desalinhada` precisou de checagem própria.
4. O `bodySizeLimit` do Next só existe para o PEDIDO — as respostas (corpos 2 e 5) só têm o limite bruto da
   Vercel.
5. O pior caso do corpo 2 **não estava medido** pela ordem — o achado do O(N²) das mensagens de duplicata
   (§2.3).
6. O `.xlsx` **não** é limitado pelo tamanho do arquivo — 1 MiB de `.xlsx` carrega muito mais texto de
   célula que 1 MiB de CSV; o teto que fecha a conta é sobre o CONTEÚDO decodificado.
7. O `\s` do JavaScript tem **25** code points (inclusive U+FEFF e U+1680); o do Postgres diverge em 7 — a
   chave SQL usa classe explícita montada por `chr()`.
8. Sétimo catálogo por nome: `src/lib/itens/migrations-f38.test.ts` (`DA_F38`) — a `0139`/`0140` entraram lá
   no mesmo commit.
9. `restaurar.mjs` **nunca** lia `ponteiros_perdidos`, nem do backup do reset (que o grava desde a F23) —
   lacuna anterior à fase, fechada aqui só para o backup versão 2 do import (a do reset "ganhou de graça").
10. O ramo `safeParse` do retorno (RPC já commitou, resposta fora do formato) **não gravava evento nenhum** —
    o backup dele virava órfão; entrou no conserto do ramo de erro honesto.
11. O Portal do Radix **nunca** monta sob `renderToStaticMarkup` — a parte testável da tela de apelidos teve
    de ser extraída para fora do `Dialog` (primeira vez que este repositório faz isso).
12. `ESPECIFICACAO.md:211` já estava desatualizada (faltavam 9 dos 13 apelidos reais) antes mesmo desta
    fase — emendada, não reescrita.
13. `lower()` do Postgres depende do provedor de collation (ICU nos bancos reais, libc no CI) — a chave SQL
    fixa `collate "und-x-icu"` para ser a mesma nos três lugares.
14. As outras quatro RPCs destrutivas (`apagar_ativo`, `apagar_movimentacao`, `resetar_acervo`,
    `apagar_ativos_conflito_filiais`) **não tratam nenhum** dos dois elos de `lancamentos_item` — backlog
    nomeado (§10).

## O que a ordem criou além da ficha, por decisão do Johnny (11/09/2026)

(i) o conserto da FK pelos cinco caminhos, que a ficha não tinha; (ii) Tipo, Situação e prefixo também no
banco, além da tabela de unidades que a ficha listava; (iii) a tela que edita apelidos, além do aviso que a
ficha pedia; (iv) o apply da `0140` pelo próprio agente, contra a letra do `RUNBOOK-BANCO.md` (que pedia o
caminho B só por handoff) — sustentado pela ata de 09/09 que mediu o classificador reagindo à EXECUÇÃO do
`delete`, nunca à definição da função.

---

# 3. O que mudou, por arquivo e por quê

## Frente A — a correção imediata

| Arquivo | O quê |
|---|---|
| `src/lib/import/plano.ts` | `filial_fora_do_vocabulario` como bloqueante ÚNICO, verdadeiro, apontando o cadastro em vez do arquivo |
| `src/lib/import/plano.test.ts` | os três cenários do critério 1, provados vermelhos antes (`A1`) e verdes depois (`A2`) |

Primeiro commit de código da fase (`f7cee4b`), antes de qualquer outra frente — exatamente como o critério 1
exige. Depois da Frente D, o gatilho final passou a comparar por `filial_id` contra o vocabulário do banco em
vez de comparar contra o De→Para hardcoded — mudança de desenho já prevista no fato 5.

## Frente B — tipos, enums e a regex numa fonte só

| Arquivo | O quê |
|---|---|
| `src/lib/tipos-estritos.ts` (novo) | `ExcluirDaUniao<T, U extends T> = Exclude<T, U>` — a versão que reclama de valor fora da união |
| `src/lib/import/tipos.ts` | `CategoriaImport`/`EstadoPlanilha`/`EstadoAlvoImport` derivados de `Enums<...>`, não mais hardcoded |
| `src/lib/patrimonio.ts` | `PREFIXO_PATRIMONIO_FONTE`/`DIGITOS_PATRIMONIO` exportados; as quatro cópias da regex passam a derivar deles |
| `src/lib/import/deparas.ts` | `PATRIMONIO_EMBUTIDO_RE` do hostname referencia a mesma fonte, com a divergência `{1,7}` documentada |
| `.github/workflows/ci.yml` + `package.json` | passo novo "Checagem de tipo completa (`tsc --noEmit`)" e script `typecheck` |

**Achado que forçou a mudança no CI**: o type-check embutido do `next build` só percorre o grafo de módulos
que a aplicação importa — um `.test.ts` sem importador na app (como `enums-sql.test.ts`) fica invisível para
ele, mesmo satisfazendo o `include` do `tsconfig.json`. Sem o passo novo, a prova do critério 8 ("por
sabotagem, num caminho de CI que reprova") seria verdade só na intenção. Ata em `docs/DECISOES.md`
(11/09/2026, "Frente B").

## Frente C — os tetos e o arquivo desalinhado

| Arquivo | O quê |
|---|---|
| `src/lib/import/limites.ts` | as nove constantes finais (§2.3), com carimbo dos números para os quais a conta foi feita |
| `src/lib/import/orcamento.ts` (novo) | `aplicarOrcamentoResposta` — o degrau que reduz DETALHE, nunca totais nem o plano |
| `src/lib/import/plano.ts` | `resumoLinhas` (corta a mensagem de duplicata em 10 + "e mais N" — o conserto do O(N²)) |
| `src/lib/import/xlsx.ts` | `confirmarTamanhoDescomprimido` — o teto pré-`load` contra zip-bomb, sem dependência nova |
| `src/lib/import/parse.ts` | `larguraUtil`, a régua de desalinhamento (célula a mais/a menos) |
| `scripts/perf/medir-corpos-import.mts`, `scripts/perf/xlsx-pre-load.mts` (novos, versionados) | os scripts que refazem as medições 1 e 2 |

A checagem de linhas/colunas **saiu** de `xlsx.ts` e foi para `conferirTetos` (`limites.ts`), chamada UMA vez
em `analisar()` — evita duas fontes da mesma régua divergirem entre CSV e `.xlsx`.

## Frente D — o vocabulário vira dado

**D1 — o banco** (`0139_vocabulario_import.sql`): quatro tabelas (`unidades_apelidos`,
`import_termos_categoria`, `import_termos_estado`, `import_prefixos_patrimonio`); a função
`vocabulario_chave(text)` — espelho exato de `normalizarTexto`, imune a `unaccent` (proibido na casa); o
gatilho `vocabulario_unidades_guarda()` com `pg_advisory_xact_lock` cobrindo a diagonal nome↔apelido; os
índices únicos `filiais_nome_chave_uidx` e `unidades_apelidos_apelido_chave_uidx`; o comentário de
`eventos_admin.acao` com os três verbos novos (`apelido_incluido`, `apelido_removido`, `usuario_criado`).

**D2 — o motor por parâmetro**: `src/lib/import/vocabulario.ts` (novo, tipo serializável
`VocabularioImport`, `conferirVocabulario`), `src/lib/queries/vocabulario-import.ts` (`lerVocabularioImport`,
server-only), e a reescrita de `deparas.ts`/`plano.ts`/`correcoes.ts`/`patrimonio.ts` para receber o
vocabulário por parâmetro em vez de importar constante. `src/lib/import/sem-wapismo.test.ts` (novo) — a
trava que varre `src/**` atrás de literal da WAP fora de allowlist nominal.

Dois bugs reais achados e corrigidos por revisão adversarial, antes do CI: (1) `vocabulario_unidades_guarda()`
lia `new.apelido_chave` **dentro** do próprio gatilho `BEFORE INSERT` — coluna gerada armazenada não existe
ainda nesse ponto (documentação do Postgres é explícita), então a guarda da diagonal virava no-op silencioso;
corrigido para computar a chave a partir da coluna base, no mesmo molde que o branch de `filiais` já usava ao
lado. (2) O cenário 4e do roteiro testava a exceção errada — a fixture violava um `CHECK` antes de chegar
perto do índice único que deveria provar (o Postgres avalia `CHECK` antes de gravar índice); corrigido
trocando a fixture. Os dois em `docs/DECISOES.md`, atas de 11/09/2026.

## Frente E — a tela de Filiais

| Arquivo | O quê |
|---|---|
| `src/components/admin/filial-apelidos.tsx` (novo) | apresentação pura, fora do `Dialog` — primeira vez que a casa extrai conteúdo de dentro de um Portal só para caber no piso de teste grau 1 |
| `src/lib/unidades/dono-do-termo.ts` (novo) | a régua de colisão, uma função só para os dois lados (apelido↔filial, nome↔filial) |
| `src/lib/actions/unidades-apelidos.ts` (novo) | `incluirApelidoUnidade`/`removerApelidoUnidade` |
| `src/lib/actions/admin.ts` | `criarFilial`/`atualizarFilial` ganham a pré-checagem de colisão |
| `src/lib/actions/erros.ts` | tradução dos dois índices únicos por NOME de constraint, e o backstop genérico do P0001 do gatilho |

Achado que corrigiu um comportamento pré-existente: o `catch` de "duplicate" em `criarFilial`/`atualizarFilial`
interceptava QUALQUER violação de unicidade da tabela (inclusive a nova `filiais_nome_chave_uidx`) e sempre
dizia "já existe uma filial com esse slug" — mesmo quando a colisão era de nome. Trocado por checagem do nome
exato da constraint (`filiais_slug_key`).

## Frente F — a bomba de FK

**Metade SQL** (`0140_import_desarma_fk.sql`): recria `import_apagar_acervo_filial`,
`import_revalidar_contagens` e `importar_ativos_substituir`, tratando os cinco caminhos do fato 27 na ordem
que as duas FKs imediatas de `lancamentos_item` exigem (§4, Decisão 9). `supabase/tests/import_substituir.sql`
ganha o cenário 5 (a-l); `supabase/tests/restauracao.sql` ganha os cenários 6/7; `scripts/db/mutacoes.mjs`
ganha cinco mutações novas (teto 70→75); `scripts/db/restaurar.mjs` vira versão 2.

**Metade TypeScript**: `src/lib/queries/import-logs.ts` (`CustoSubstituir` com as quatro chaves novas,
`exportarDesvinculosFk`); `src/lib/actions/importar.ts` (`RECUSAS_DA_RPC` com os seis SQLSTATE novos, o
backup versão 2, o ramo `safeParse` honesto); `src/components/admin/importar/importar-wizard.tsx` (três
cartões condicionais novos no preview/confirmação/resultado).

## Frente G — o smoke do import

`scripts/smoke/{guarda-ensaio.ts,persona.ts,checagens.ts,fixtures-passe2.ts,planilha.ts,import-ensaio.ts,README.md}`
— construído do zero (nunca existiu antes desta fase, fato 36). Guarda de dois portões (`REFS_DE_ENSAIO` +
`rotulo_de_ambiente()`), persona `seed.admin@wap.ind.br` com senha aleatória em memória, fixtures do passe 2
criadas pela RPC do próprio sistema (`criar_movimentacao_com_itens`), nunca por INSERT direto.

## Frente H — as travas e o fechamento

`src/lib/ajuda/conteudo/{import-de-startup,problemas-import-e-acesso,administracao}.ts` (cartões novos, sem
tocar `toContain` pinado); `docs/ESPECIFICACAO.md` §5/§10.2 (emendadas, lista fixa de unidades removida — a
fonte agora é `unidades_apelidos`); `docs/ARQUITETURA.md` §10; `docs/MATRIZ-REGRAS.md` (onze regras novas
`R-IMP-42`→`R-IMP-52`, a `R-IMP-41` emendada no próprio lugar); `docs/RUNBOOK-BANCO.md` (a seção do gate
corrigida — o classificador reage à EXECUÇÃO do delete, não à definição da função); `CHANGELOG.md`,
`package.json` (`1.61.0`), `src/lib/versoes/registry.ts` (cinco mudanças em linguagem de operador).

---

# 4. As treze decisões, e o custo que decidiu cada uma

*A ata completa está em `docs/DECISOES.md`; aqui, o que cada alternativa custava.*

| # | Decisão | O que a alternativa custava |
|---|---|---|
| 1 | Quatro tabelas tipadas (molde da `0114`), não uma genérica `dominio/termo/valor` | A genérica exigiria cast de enum dentro de `check` e perderia o tipo em `database.ts`; quatro custam quatro entradas nos catálogos (e, na F64, quatro `empresa_id`) — barato, e o banco ganha os invariantes |
| 2 | Nome próprio nunca vira linha; unicidade por índice (nome×nome, apelido×apelido) + gatilho só na diagonal | Um terceiro `if` no gatilho para apelido×apelido duplicaria o que o índice único já garante, sem mensagem melhor — e a ordem/critérios/PLAN não concordavam entre si; resolvido pela hierarquia (o PLAN é o "plano aprovado") |
| 3 | `VocabularioImport` serializável, lido do banco a cada chamada; `aplicarImport` recusa categoria/estado fora do vocabulário fresco | Deixar `aplicarImport` confiar no plano recebido abriria a mesma classe de defeito que a ordem existe para fechar: cliente forjando vocabulário |
| 4 | `ExcluirDaUniao<T, U extends T>`, proibição só no import | Proibir `Exclude` cru em todo `src/` tocaria 8 usos fora de escopo, sem ganho — o defeito real é só com enum do banco |
| 5 | Regex numa fonte só em `patrimonio.ts`, hostname com `{1,7}` explícito e documentado | Unificar para `\d{7}` fixo quebraria o caso de zeros à esquerda que a canonicalização aceita |
| 6 | Tetos pela CONTA contra `LIMITE_CORPO_PLATAFORMA` = 4.500.000 B (em `limites.ts`, o decimal conservador), folga 1,5×; `next.config.ts` com `bodySizeLimit: 4_500_000`, e o teste lê o `next.config.ts` em vez de importá-lo | Manter 5 MiB/20.000 linhas estourava o corpo 3 já com 1.142 linhas; importar `limites.ts` dentro da config (que só resolve CommonJS) seria acoplamento frágil no carregamento |
| 7 | Conferir o `.xlsx` ANTES do `load`, pelo zip cru + `inflateRawSync`, sem `<dimension>` | `<dimension>` pode faltar OU MENTIR (confirmado: um `.xlsx` real com 8.000 linhas vazias formatadas teria dimensão inflada por engano) — um teto baseado nela recusaria arquivo legítimo |
| 8 | Largura útil = última coluna com nome + 1; linha desalinhada EXCLUÍDA do CSV, não só marcada | Deixá-la seguir para `extrairRegistros` leria valor de coluna ERRADA em silêncio — o exato defeito que esta régua existe para evitar |
| 9 | O conserto entra DENTRO de `import_apagar_acervo_filial`, na ordem que as duas FKs imediatas exigem | Desvincular fora de ordem estouraria `23503` no meio do próprio `DELETE`; a ordem é forçada, não estética |
| 10 | `RECUSAS_DA_RPC` ganha os SQLSTATE de violação de integridade e concorrência; `import_falhou` grava a chave certa em cada ramo | A régua antiga gravava `backup_descartado` mesmo quando o backup FICAVA — o defeito exato do fato 30, que deixava backup órfão invisível para a 12ª checagem |
| 11 | Playwright contra `next dev` local apontado para o ensaio, persona com senha aleatória nunca escrita | É o único caminho que exercita login real, Server Action, bucket e RPC juntos — um script Node "direto" pularia a tela, que é onde a Frente E vive |
| 12 | `sem-wapismo.test.ts` varre literal (nunca comentário), escopo amplo para os cinco nomes de filial e escopo do import para WAP/apelidos/prefixos | Varrer identificador também acusaria variável interna sem palavra da WAP no texto — falso positivo sem ganho |
| 13 | Tela de apelidos dentro do `FilialDialog`, apresentação extraída para fora do Portal | O Portal do Radix nunca monta sob `renderToStaticMarkup` (medição E) — sem extrair, nenhum teste grau 1 alcançaria o conteúdo |

---

# 5. O que quebrou por desenho, e os defeitos que a própria fase achou

| Quem achou | O quê | O que virou |
|---|---|---|
| Sabotagem B do critério 8 | `npm run build` sozinho não pega `@ts-expect-error` sobrando em teste sem importador na app | passo novo de CI, `npm run typecheck` (§3, Frente B) |
| Revisão adversarial (Frente D1) | `vocabulario_unidades_guarda()` lia coluna gerada dentro do próprio gatilho `BEFORE` | corrigido para computar a chave da coluna base |
| Revisão adversarial (Frente D1) | cenário 4e do roteiro testava `CHECK`, não o índice único que deveria provar | fixture trocada |
| Revisão adversarial (Frente D1) | hand-fix de `database.ts` tipava `apelido_chave` como não-nulável | corrigido para `string \| null`, no molde de `colaboradores.nome_chave`/`itens.nome_chave` |
| O próprio smoke, ao rodar (Frente integração) | cinco defeitos do SCRIPT do smoke, não do produto: opção "Eusébio" montada por regex do slug (nunca casaria com o acento); arquivo enviado antes do passo onde o campo existe; a régua "site divergente" procurando um card que se chama "Site"; "ativos criados" sempre lido como 0; status de pendência `'pendente'` (o banco usa `'aberta'`) | corrigidos (commit `e717917`); a régua do saldo comparada contra a foto errada (antes da fixture do passe 2, não depois) também apareceu na execução 2 e foi corrigida antes da execução 3 |
| Classificador de segurança | bloqueio da normalização da conta Auth do ensaio (item 1 do roteiro) | registrado, não reformulado — o smoke contornou achando a persona por filtro de e-mail |
| Revisão adversarial final | "Baixar corrigido" fora dos tetos e da recusa de linha desalinhada (médio) + três baixos | corrigidos (§12); três baixos para o backlog (§10) |
| O CI do push dos consertos (run `34865411451`) | teste instável em `importar.test.ts`: dois `File` criados em milissegundos diferentes (`lastModified` = `Date.now()`) quebravam a comparação profunda | `lastModified` fixo no arquivo de teste, a asserção intacta — nunca "rodar de novo até passar" |

Nenhum destes é "trava afrouxada para ficar verde" — os oito estão documentados no próprio código/ata, com a
causa raiz escrita ao lado.

---

# 6. As sabotagens, com saída real

Todas em `docs/f56-evidencias/`. Nenhuma tem valor de credencial, nome de pessoa ou patrimônio real.

| # | Arquivo | O que prova |
|---|---|---|
| A1/A2 | `A1-trava-vermelha-filial-fora-do-vocabulario.txt`, `A2-trava-verde-…` | `filial_fora_do_vocabulario` nasce vermelho (4 falhas nomeadas) e fica verde depois da Frente A |
| B1 | `B1-travas-vermelhas.txt` | `patrimonio-sql.test.ts` (8 falhas) e `enums-sql.test.ts` (3 falhas) vermelhos pelo motivo certo, mais um bug achado NA CONSTRUÇÃO da trava (falso-positivo de `drop function` não contabilizado) |
| B2 | `B2-sabotagem-ts-expect-error.txt` | duas sabotagens do `@ts-expect-error` (valor dentro da união; utilitário cru) — as duas reprovam por `tsc --noEmit`/`npm run typecheck`, nenhuma por `npm run build` sozinho — o achado que forçou o passo novo de CI |
| B3 | `B3-identidade-da-regex.txt` | 180.000 comparações (90.000 × 2 rodadas), zero diferenças entre a regex antiga (literal) e a nova (composta pela fonte única) |
| C2 | `C2-conta-dos-corpos.txt` | a tabela final dos cinco corpos, com o serializador Flight real — folga mínima 2,32× |
| C3 | `C3-sabotagem-tetos.txt` | `MAX_LINHAS_PLANILHA` subido sem refazer a conta → `limites.test.ts` vermelho pela mensagem certa; CSV no teto+1 recusado; `;` a mais → `linha_desalinhada`; colunas vazias à direita + `\n` final → aceito |
| C4 | `C4-xlsx-antes-do-load.txt` | `.xlsx` legítimo no teto de conteúdo passa (mesmo com 8.000 linhas vazias formatadas); bomba disfarçada (3×1, ~45 MB descomprimidos) recusada em **135 ms**, antes do `load`; bomba "alta" (100k linhas curtas) não pega no pré-load POR DESENHO e é pega pela 2ª linha de defesa — nenhum caso passa de ~550 MB de RSS |
| D1 | `D1-guardas-vermelhas.txt`, `D1-sem-wapismo-vermelha.txt` | as guardas do vocabulário (13/5/17/12/7) e a trava `sem-wapismo` nascem vermelhas — 59 literais fora da allowlist, nomeados arquivo:linha |
| D2 | `D2-vocabulario-forjado.txt`, `D2-sem-wapismo-verde.txt` | as nove provas de que um `FormData` com vocabulário forjado não muda o resultado; a trava `sem-wapismo` verde, e vermelha de novo ao reintroduzir "Serra Park" |
| E1/E2 | `E1-componente-vermelho.txt`, `E2-componente-verde.txt` | `FilialApelidos` nasce inexistente (módulo não encontrado) e fica verde com 12/12 casos, extraído do Portal |
| F1 | `F1-diff-dos-corpos.txt` | o diff byte a byte das três funções da `0140` contra os corpos vigentes da `0131`/`0132` — só o trecho novo entra, nada do meio é removido ou reordenado |
| F2/F3 | `F2-backup-formato-vermelho.txt`, `F3-backup-formato-verde.txt` | o backup grava `versao: 2` antes da suíte declará-la (vermelho), depois verde com a versão 2 ao lado da 1 |
| G1 | `G1-guarda-vermelha.txt`, `G1-guarda-verde.txt` | a guarda do smoke nasce inexistente e fica verde com 11 casos (mais que os 5 mínimos pedidos) |
| H2 | `H2-sabotagem-a-final.txt` | **Sabotagem A final**, com tudo verde, numa worktree descartável: um nome de filial em `lib/import/` (a `sem-wapismo` acusa `vocabulario.ts:348`), um `Exclude` com valor fora da união pelo utilitário estrito (`tsc` acusa `tipos.ts:60`), um teto maior sem refazer a conta (o carimbo de `limites.test.ts` acusa `MAX_LINHAS_PLANILHA` 2000→3000) |
| H3 | `H3-sabotagem-b-final.txt` | **Sabotagem B final**: `{ slug: 'serra', apelido: 'serra park' }` some da fixture da guarda (nunca da migration) e `vocabulario-sql.test.ts` acusa o apelido exato; inclui a primeira tentativa, que quebrou no escape e serviu de controle verde |
| H4 | `H4-ci-final-roteiros-e-injetor.txt` | o CI final na árvore integrada: gate de deriva verde (34 relações · 312 colunas · 75 funções), o placar dos 34 roteiros (818 asserções) e o injetor inteiro — 74/74 pelo cenário nomeado, 2 em quarentena declarada |
| H5 | `H5-verificacao-pos-revisao.txt` | lint, `tsc`, 5.014/5.014 testes e o build de 32 rotas depois dos consertos da revisão adversarial final |
| H6 | `H6-smoke-prod-pos-deploy.txt` | o smoke pós-deploy contra produção: `109 OK · 1 aviso · 0 n/a · 0 falha`, com `/api/saude` em `1.61.0`/`e4ede21` |
| P2/P6 | `P2-apply-0140-ensaio.txt`, `P6-ensaio-rollback-0139.txt` | os dois ensaios de rollback, num bloco que se desfaz por exceção proposital e devolve as leituras de dentro da transação |

---

# 7. O smoke do import — a saída real

Três execuções em 14/09/2026 (`docs/f56-evidencias/G2-smoke-import-ensaio.txt`), contra o `next dev` local
com a branch `f56-continuacao` (D2+E+F já commitadas) apontado para o ensaio, com `0139` e `0140` já
aplicadas lá.

**Execução 1 — parou na persona.** `auth.admin.listUsers()` falhou com *"Database error finding users"* — a
conta com tokens NULL do item 1 do roteiro. Nada criado; corrigido trocando a busca da persona para um
filtro por e-mail (commit `dfaa017`).

**Execução 2 — 21/22.** Passe 1 (filial `sede`, criada agora, nome próprio + apelido cadastrado pela tela
nova): 4 ativos criados, conferidos no banco. Fixtures do passe 2 criadas (lançamento preso a movimentação,
pendência aberta). Passe 2 (segundo "Substituir tudo", arquivo diferente): passou, pendência apagada e no
backup versão 2, lançamento desvinculado — mas **"saldo do item igual antes×depois" falhou**: a foto "antes"
tinha sido tirada ANTES da própria fixture de saída de item, então comparava contra o número errado. Corrigido
(a foto passou para depois das fixtures, antes do passe 2) — não afrouxou a asserção, só a régua do momento em
que ela é tirada.

**Execução 3 — 22/22, a que vale.** Mesma árvore, persona REAPROVEITADA (estava inativa desde a execução 2,
reativada, trilha `usuario_reativado`), filial `sede` já existente.

```
[✓] passe 1 — "Substituir tudo" na sede — 4 ativos criados (esperado 4)
[✓] saldo do item do smoke garantido — {"total":6,"estoque":5,"atrelados":0,"falta":0}
[✓] lançamento de item preso à movimentação — movimentacao_id=bb9523a0-…
[✓] pendência de item aberta — id=352a1195-…
[✓] passe 2 — segundo "Substituir tudo" (arquivo diferente) — 4 ativos criados (esperado 4)
[✓] saldo do item igual antes×depois — antes={"total":6,"estoque":4,…} depois={"total":6,"estoque":4,…}
[✓] pendência sumiu do acervo — restam 0 pendência(s) na sede
[✓] lançamento ficou SEM vínculo de movimentação — movimentacao_id=—
[✓] pendência apagada está no backup (versão 2) — id=352a1195…
[✓] passe 3 preview · matriz/cd-afonso-pena/linhares/serra/eusebio — "0 bloqueantes" cada
[✓] as 12 checagens iguais antes×depois — nenhuma diferença (operador_sem_filial=1 nas duas fotos)
[✓] persona desativada (finally) — ativo=false

RESUMO — 22/22 passos ✓
```

*Trecho da execução 3 (os cinco passes 3 e a tabela das 12 checagens resumidos numa linha cada); a saída
inteira das três execuções, sem edição, está em `G2`.*

**O que isto prova**: a filial que o código não conhecia (`sede`) importa pelo nome próprio E por apelido
cadastrado na tela nova; o "Substituir tudo" sobre lançamento preso e pendência aberta não estoura mais
`23503` — a pendência sai do acervo e entra no backup, o lançamento perde só o vínculo, o saldo do item não
muda; os 18 termos históricos das cinco filiais WAP continuam resolvendo; as 12 checagens ficam idênticas
antes/depois; a persona termina inativa.

**O que isto NÃO prova**: o caminho 5 da FK (substituto de outra filial) e o caminho 4
(`lancamentos_item.pendencia_item_id`) — zero linhas assim no ensaio, cobertos só pelo roteiro SQL; nada
sobre produção (o smoke nunca aponta para lá); a UI por teste automatizado próprio (os seletores foram
conferidos à mão contra o código, não por Playwright codegen); e as outras quatro RPCs destrutivas.

---

# 8. Os 35 critérios, autoverificados

| # | Critério | Veredito |
|---:|---|---|
| 1 | Primeiro commit é a correção imediata, provada com slug inventado; o gatilho final testado depois da Frente D | ✅ `A1`/`A2`, commit `f7cee4b` |
| 2 | Cada trava nasceu vermelha e está verde sem exceção fora das allowlists nominais | ✅ `A1`, `B1`, `D1-sem-wapismo-vermelha`, `D2-sem-wapismo-verde`, `E1`/`E2`, `F2`/`F3`, `G1`; e as sabotagens finais com tudo verde, `H2` (A) e `H3` (B) |
| 3 | Nenhuma constante do fato 7 existe mais em `src/lib/import/**`; motor recebe vocabulário por parâmetro, unidade por `filial_id` | ✅ ata Frente D2 (item 2 da tarefa, conferido por grep) |
| 4 | `0139` com seed exato 13/5/17/12/7, guarda contra o SQL; Selects/CSV mantêm caixa e acento | ✅ `P1`, `P3`; `vocabulario-sql.test.ts` |
| 5 | Nome próprio vale sempre, sem linha; ambiguidade barrada nos quatro caminhos | ✅ Decisão 2, `vocabulario_import.sql` (56 asserções) |
| 6 | As duas actions julgam com o vocabulário que leram; `aplicarImport` recusa categoria/estado fora do vocabulário | ✅ `D2-vocabulario-forjado.txt` (9 provas) |
| 7 | 18 apelidos históricos mapeiam certo; prefixos batem com `scripts/import/normalizar.ts` | ✅ ata Frente D2 item 8; `prefixos.test.ts` |
| 8 | Enums de `Enums<…>`; `@ts-expect-error` reprova em caminho de CI, por sabotagem | ✅ `B2`, passo novo de CI |
| 9 | Regex numa fonte só; testes antigos sem mudança; `patrimonio-sql.test.ts` fala do corpo vigente | ✅ `B3` (180.000 comparações) |
| 10 | `conferirTetos` na primeira linha de `analisar()` | ✅ ata Frente C — ⚠ a revisão final marcou PARCIAL: "Baixar corrigido" não passava pelos tetos; **corrigido** (`csvCorrigidoDeArquivo` chama `conferirTetos`; teste em `plano.test.ts`) |
| 11 | `limites.test.ts` prova os cinco corpos com folga ≥1,5×, com carimbo | ✅ `C2` (folga mínima 2,32×) — ⚠ PARCIAL na revisão final pelo mesmo motivo (os corpos 4/5 são do "Baixar corrigido"); **corrigido** com o item 10 |
| 12 | `planoImportSchema` com `.max()` no array e por campo; motor recusa célula longa antes do aplicar | ✅ `LIMITES_CAMPO_PLANO`, R-IMP-47 |
| 13 | `linha_desalinhada`/aceitação de colunas vazias e `\n` final, com fixture | ✅ `C3` (b/c/d) — ⚠ PARCIAL na revisão final: o "Baixar corrigido" devolvia linha desalinhada; **corrigido** (recusa com `ErroArquivoImport`; testes da recusa e do arquivo legítimo em `plano.test.ts`) |
| 14 | Medição do `.xlsx` descomprimido, em processo filho com teto de heap | ✅ `C4` |
| 15 | `0140` recria as três funções; auxiliar trata os cinco caminhos na ordem certa | ✅ `F1` |
| 16 | Preview/backup/revalidação conhecem as classes novas; ausente vale 0 | ✅ ata Frente F-SQL; `coalesce(…,0)` no `F1` |
| 17 | Backup versão 2, pendências/elos/ponteiros sob chaves próprias; restaurador religa e recusa versão desconhecida | ✅ `F2`/`F3`; `restaurar-guarda.test.mts` |
| 18 | CI com `set constraints all immediate`/`deferred`; saldo idêntico; ativo transferido intocado; mutações pelo rótulo nomeado | ✅ CI `banco-sem-docker` runs `34853956001` e `34862188287` (`H4`) — `import_substituir` 32 asserções, cenário 5 (a-l); e o smoke `G2` com o saldo do item idêntico antes × depois |
| 19 | Ramo de erro honesto: `RECUSAS_DA_RPC`, `import_falhou` grava a chave certa | ✅ R-IMP-51 |
| 20 | Filiais mostra/inclui/remove apelidos, com trilha, `exigirAdmin`+Zod+RLS, teste grau 1 | ✅ `E1`/`E2`; R-IMP em Decisão 13 |
| 21 | `criarFilial`/`atualizarFilial` recusam nome colidente | ✅ ata Frente E |
| 22 | O smoke passou no ENSAIO — passe 1 e 2 | ✅ `G2` (22/22 na execução 3) |
| 23 | Passe 3 rodou — preview sem `site_divergente` nas cinco filiais WAP | ✅ `G2` |
| 24 | 12 checagens iguais antes×depois; nenhum backup órfão; persona desativada | ✅ `G2` |
| 25 | Smoke só lê `NEXT_PUBLIC_*` e a chave de serviço; guarda recusa produção e ref inventado | ✅ `G1` (11 casos) |
| 26 | Catálogos acolhem por nome; `db:types:diff` verde; `db:test:mutations` verde com as novas | ✅ `H4` (run `34862188287`) — gate de deriva verde, injetor 74/74 pelo cenário nomeado, teto 75 |
| 27 | `lint`/`test`/`build`/`tsc` limpos; `db:lock` no commit de cada migration | ✅ `H1-verificacao-integrada.txt` (5.010) e, depois dos consertos da revisão final, `H5-verificacao-pos-revisao.txt` (5.014/192, build com 32 rotas) |
| 28 | `0139`/`0140` no ensaio antes de produção, verificação pós-apply, `prosrc` normalizado igual, CI verde antes de cada apply, contagens antes=depois | ✅ `P1`→`P5` |
| 29 | `database.ts` regenerado de produção | ✅ ata "F56 (integração)" — diff só de ordem/comentário |
| 30 | Ajuda, emendas de spec/arquitetura, `MATRIZ-REGRAS.md` | ✅ ata Frente H; `MATRIZ-REGRAS.md` Emenda F56 |
| 31 | Versão, CHANGELOG, registry, tag `v1.61.0` publicada | ✅ `package.json`, `CHANGELOG.md` e `registry.ts` em 1.61.0; tag anotada `v1.61.0` no commit final da fase, publicada (§12) |
| 32 | Ordem de rollback no cabeçalho das duas migrations, ensaiada só no ensaio | ✅ `P2` (rollback da `0140`), `P6` (rollback da `0139`) |
| 33 | PR mergeado com os dois checks verdes; deploy; smoke pós-deploy contra produção | ✅ PR #43 mergeado (`e4ede21`) com `verificar` e `banco-sem-docker` verdes (run `34865935016`); deploy confirmado por `/api/saude` (`1.61.0`, `e4ede21`); smoke de produção `109 OK · 1 aviso · 0 falha` (`H6`) |
| 34 | `docs/RELATORIO-F56.md` com evidências, roteiro no topo, divergências e "o que não prova" | ✅ este arquivo |
| 35 | Nada fora do escopo; nenhum dado real nem credencial, com varredura final | ✅ §11 |

---

# 9. O que este relatório NÃO prova

1. **O smoke prova uma unidade FICTÍCIA no ensaio (`sede`, 4 ativos), não uma planilha real da WAP.** A
   filial com mais vínculos presos é a Matriz, com 16 pendências e 18 lançamentos — o smoke exercitou 1 de
   cada. A forma do conserto é a mesma (o SQL não distingue "fictício" de "real"), mas a escala nunca foi
   testada de ponta a ponta fora do CI.
2. **O limite de 4,5 MB da Vercel não se reproduz no `next dev`.** O teto está provado pela CONTA (a doc da
   Vercel + o serializador real medindo os cinco corpos), não por um `413` observado ao vivo — o ambiente
   local não tem esse limite.
3. **O conserto da FK foi provado no CI (roteiro SQL) e em `sede` (smoke), nunca na Matriz.** Não há import
   em produção nesta fase — é proibido por desenho. O primeiro reimport real de uma filial de produção é a
   prova que falta (item 4 do roteiro do Johnny).
4. **As outras quatro RPCs destrutivas** (`apagar_ativo`, `apagar_movimentacao`, `resetar_acervo`,
   `apagar_ativos_conflito_filiais`) **continuam com os mesmos caminhos de FK não tratados** — confirmado por
   leitura (fato 27/PLAN divergência 14), não corrigido (fora de escopo, decisão do Johnny). Não foi medida
   nesta fase uma contagem própria de pendências/lançamentos presos para cada uma dessas quatro RPCs
   separadamente das contagens por filial já citadas em §2.4 — ficam sem número próprio, só a confirmação do
   defeito.
5. **O vocabulário de Tipo e Situação só muda por migration** — não ganhou tela nesta fase (decisão iii do
   Johnny foi só sobre unidades/apelidos); um valor de tipo/estado novo exige nova migration até a F73.
6. **O que ficou sem prova por causa do classificador**: a normalização da conta Auth do ensaio (item 1 do
   roteiro) — não tentei de novo nem por outro caminho. Por leitura de `src/lib/queries/admin.ts`
   (`lerContasAuth` usa `listUsers`), a tela Administração › Usuários do ensaio perde e-mail e situação de
   login até alguém rodar o SQL — não conferido clicando.
7. **A prova por Playwright dos seletores da tela** foi feita à mão (leitura do componente antes de cada
   execução), não por `codegen` nem por teste próprio de UI — os cinco defeitos do §5 acharam justamente onde
   essa leitura tinha errado.
8. **O critério 18 (o cenário 5 do roteiro `import_substituir.sql`) foi lido duas vezes por revisão, nunca
   executado nesta mesa contra um Postgres real** — sem `psql`/Docker/CLI Supabase disponíveis; quem prova de
   verdade é o `banco-sem-docker` do CI (run `34853956001`, 32 asserções verdes no arquivo).
9. **A prova do rollback (`P2`/`P6`) foi feita só no ensaio**, dentro de um bloco que desfaz a si mesmo — nunca
   em produção, e nunca com dado real para restaurar (a `0140` não move dado; a `0139` só teria os apelidos
   cadastrados pela tela, que se perderiam num rollback de verdade).
10. **A janela entre o apply da `0140` em produção e o deploy do código novo** foi medida (nenhum import
    rodou nela — o último foi em 31/07), mas não EXERCITADA: ninguém tentou um "Substituir tudo" contra
    produção nessa janela para confirmar ao vivo que a mensagem nova aparece em vez do `23503` cru.
11. **Os privilégios padrão do Supabase** (TRUNCATE para `anon`/`authenticated` nas quatro tabelas novas) são
    os mesmos que toda tabela nova já tem no banco — achado, não corrigido; backlog de hardening
    transversal, não defeito desta fase.
12. **A linha de base do alarme de integridade não foi tocada por esta fase** (as 12 checagens do ensaio e o
    smoke fecham iguais antes×depois), mas ela também não foi RECONFERIDA em produção depois do apply — a
    próxima batida do `saude.yml` agendado é quem prova isso.

---

# 10. Pendências e backlog nomeado

## Para a F62 / F64 (multiempresa)

- **As quatro tabelas novas da `0139` precisam de `empresa_id`.** A lista de doze tabelas sem `empresa_id`
  que a F64 já rastreia precisa de emenda para incluir `unidades_apelidos`, `import_termos_categoria`,
  `import_termos_estado` e `import_prefixos_patrimonio`.

## Para a F65

- **A unicidade do apelido e do nome de filial passa a ser por empresa**, não global — os índices
  `filiais_nome_chave_uidx` e `unidades_apelidos_apelido_chave_uidx` desta fase terão de ganhar o tenant na
  chave.

## Para a F73 (o piloto)

- **O onboarding usa a tela de apelidos** (Administração › Filiais) para o passo "subir os apelidos do
  De→Para" que o `PLANO-MULTIEMPRESA.md` §5 já prevê.
- **O vocabulário de Tipo e Situação ainda não tem tela** — muda só por migration; se o onboarding de um
  tenant novo precisar de categorias/estados diferentes dos de hoje, isso é trabalho da F73, não desta fase.

## A classe das quatro RPCs destrutivas

`apagar_ativo`, `apagar_movimentacao`, `resetar_acervo` e `apagar_ativos_conflito_filiais` compartilham a
mesma forma de defeito que esta fase consertou só no import: nenhuma delas desvincula
`lancamentos_item.pendencia_item_id`/`movimentacao_id` antes de apagar o que esses lançamentos referenciam.
Confirmado por leitura (não corrigido, decisão do Johnny — item explícito de "Fora — não toque" da ordem).
Fica nomeado desde a F54, reafirmado aqui.

## Da revisão adversarial final — os três achados baixos que ficaram (§12)

- **O saldo do item fictício do smoke cresce a cada execução** (`scripts/smoke/fixtures-passe2.ts`
  `garantirSaldoSede` lança uma entrada nova sem olhar o saldo que já existe) — dado fictício do ensaio, sem
  efeito nas 12 checagens; conserto: lançar só a diferença até o mínimo.
- **O smoke não tem trava contra duas execuções simultâneas** — as duas usariam a mesma persona e a mesma
  `sede`; é ritual manual de uma pessoa, mas uma trava de arquivo/advisory lock no início custa pouco.
- **A janela de pré-imagem do backup da FK** — entre a leitura do backup (`exportarDesvinculosFk`) e a
  revalidação dentro da RPC, uma pendência resolvida e outra criada mantêm a contagem e o backup guarda uma
  linha que não é a apagada. É a mesma limitação aceita desde a F21 para as quatro contagens antigas; a
  revalidação dentro da RPC continua sob advisory lock. Fechá-la de verdade exige gravar o backup DENTRO da
  transação da RPC — mudança de desenho, não conserto pontual.

## Achados de produção, relatados e não consertados

- Privilégios padrão de tabela (TRUNCATE incluso) para `anon`/`authenticated` nas quatro tabelas novas —
  hardening transversal (o mesmo já vale para `tipos_item`, `colaboradores`, `itens`, `filiais` etc.; só
  `ativos` teve TRUNCATE revogado).

---

# 11. Escopo e segurança — as varreduras finais

**Nada fora do escopo.** `git diff --stat main...HEAD` (só a parte 2, PR #43 — a parte 1 já está na `main` pelo
PR #42), medido antes dos últimos commits de evidência: **153 arquivos, 24.379 inserções, 915 remoções**.
Conferido: nenhuma migration antiga tocada (`0139` e `0140` são as duas únicas novas em
`supabase/migrations/`); nenhuma dependência nova (`package.json` mudou só em `version`); `scripts/import/`
(a carga F4) intocado, exceto leitura para a trava de paridade de prefixos; nenhum código de
`onboarding`/`empresa_id` tocado.

**Nenhum valor de credencial.** Varredura por padrão sobre `docs/f56-evidencias/` e `docs/f56-handoff/`:

```
git grep -nE "eyJ[A-Za-z0-9_-]{20,}|sb_(publishable|secret)_[A-Za-z0-9]{10,}|sbp_[A-Za-z0-9]{20,}"
```

Zero achados. Padrão de patrimônio (`WAP[0-9]{7}`) nas mesmas pastas: só valores fictícios já usados em
outras fases (`WAP0001234`, `WAP0004491` — o próprio exemplo canônico do `CLAUDE.md`, `WAP0006026`,
`WAP9000001`/`WAP9020000`) — nenhum patrimônio real. Nenhum nome de colaborador real em nenhuma evidência,
fixture ou script de medição — os geradores de medição usam dados sintéticos. A varredura completa de dado
real e credencial sobre tudo o que a fase acrescentou é da revisão adversarial final (§12).

---

# 12. O fechamento

**O CI final do PR #43.** Depois dos consertos da revisão (`7a5115f`), o `verificar` reprovou uma vez (run
`34865411451`) por um teste instável — os dois `File` de `importar.test.ts` nasciam em milissegundos
diferentes — e o `banco-sem-docker` passou. Corrigido na causa (`lastModified` fixo, `1a44165`), sem rodar o CI
de novo até passar: a run `34865935016`, no head `1a44165`, fechou com `verificar` e `banco-sem-docker` verdes
(e os dois checks da Vercel).

**O merge.** PR #43 mergeado na `main` em 14/09/2026 às 16:04:59 UTC, commit de merge `e4ede21`, com o head
conferido igual ao da run verde antes de mergear.

**O deploy.** A Vercel publicou o merge em produção (deployment `dpl_5eDfygMdV2eg6Widax3VCojmwi4Q`, alvo
`production`, commit `e4ede21`). A sonda pública confirmou às 16:06:14 UTC, cerca de um minuto depois do merge:
`GET https://ti-wap-inventory-control.vercel.app/api/saude` →
`{"ok":true,"versao":"1.61.0","commit":"e4ede21","banco":"ok","ms":96}`. A partir daqui, produção roda o código
novo sobre a `0139` e a `0140` — a janela de deploy fora de ordem (RPC nova com código velho) fechou.

**O smoke pós-deploy contra PRODUÇÃO** (`node scripts/smoke/smoke-prod.mjs`, saída inteira em
`H6-smoke-prod-pos-deploy.txt`): **`RESUMO · 109 OK · 1 aviso · 0 n/a · 0 falha`**, código de saída 0, com
`/api/saude` → `banco ok · versao 1.61.0 · commit e4ede21`. O único aviso não é desta fase: `kits_modelos · anon
NÃO lê (RLS)` fica sem comprovação porque não há nenhum kit cadastrado em produção (estado de dado, o mesmo das
rodadas anteriores). **O que este smoke não exercita:** o import (nenhum import roda em produção nesta fase, por
desenho) e a tela de apelidos — os dois ficam provados no ensaio (`G2`) e no CI.

**A tag.** `v1.61.0`, anotada, no commit final da fase — o merge do PR que traz este relatório, o
`CHANGELOG.md` fechado (✅ 🔒) e a evidência `H6` para a `main`, com os dois checks obrigatórios verdes — e
publicada com `git push origin v1.61.0` (regra 8 do `CLAUDE.md`). Até aqui a última tag era `v1.60.0`.

**Sabotagem A final e sabotagem B final — feitas em 14/09/2026.** As três travas da A reprovaram cada uma pelo
motivo certo (`H2`), e a guarda do vocabulário acusou o apelido tirado da fixture (`H3`) — ver §6.

**A revisão adversarial final (14/09/2026), em contexto fresco, contra os 35 critérios, o `PLAN-F56.md` e o
diff da fase inteira.** Nenhum achado de gravidade alta; a segurança das duas migrations e a ordem dos cinco
passos de FK conferidas linha a linha; a varredura de dado real e credencial sobre a fase inteira (parte 1 e
parte 2) não achou nada. O que ela achou, e o que virou (ata "F56 (revisão adversarial final)" em
`docs/DECISOES.md`):

| Gravidade | Achado | O que virou |
|---|---|---|
| Média | "Baixar corrigido" (`csvCorrigidoDeArquivo`) não passava por `conferirTetos` nem pela recusa de linha desalinhada — os corpos 4/5 sem teto, e linha desalinhada saindo com valor na coluna errada; critérios 10, 11 e 13 marcados PARCIAL | **corrigido**: mesmo leitor, `conferirTetos` e recusa de linha desalinhada; três testes novos em `plano.test.ts` |
| Baixa | `removerApelidoUnidade` apagava pelo id sem conferir a filial da tela | **corrigido**: `filialId` obrigatório, recusa quando diverge |
| Baixa | a página de importar caía no boundary genérico se o vocabulário não fosse lido | **corrigido**: `Aviso` de erro com o motivo e `registrarFalha`; o histórico continua |
| Baixa | a persona do smoke ficava ativa se o processo fosse interrompido por sinal | **corrigido**: handler de `SIGINT`/`SIGTERM` que desativa uma vez só |
| Baixa | saldo do item fictício do smoke cresce entre execuções; smoke sem trava contra execução simultânea; janela de pré-imagem do backup da FK | **não corrigidos**, com motivo — backlog (§10) |

A correção de "Baixar corrigido" deslocou uma linha em `filial-dialog.tsx`, e a `sem-wapismo` acusou na hora os
três literais já permitidos da allowlist nominal — ajustados para 171/197/200, mesmo texto, com comentário.

Os critérios 31, 33 e 34 (§8) estão fechados com a evidência ao lado; a ata de fechamento, em `docs/DECISOES.md`,
registra a ordem em que merge, deploy, smoke e tag aconteceram.

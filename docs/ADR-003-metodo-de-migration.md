# ADR-003 — Método de aplicação de migrations: o ledger não é o controle

**Status:** aceito · 22/09/2026 — decisão do Johnny na reauditoria de dívida técnica (passo 5, item **A** / recomendação **R3**).
**Contexto do plano de dívida técnica:** item **A** de [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md) ("ledger incompatível com o
repositório por construção"), aberto desde 24/07/2026, e **R3** de [`SYSTEM-DESIGN-2026-08-30.md`](SYSTEM-DESIGN-2026-08-30.md).
O item **AE** (deriva sem alarme) já foi fechado pela v1.66.3; este ADR decide o **método**, que continuava sendo folclore oral.

## Contexto

O `supabase_migrations.schema_migrations` (o "ledger") nunca foi o registro confiável de migration aplicada neste projeto.
Medido em 22/09/2026, na `main` em `fc94b56`, pelos dois bancos lidos por `list_migrations`:

| | Repositório | Produção | Ensaio |
|---|---|---|---|
| Migrations / linhas | 149 arquivos (`0001`→`0150`, sem a `0029`) | 134 linhas | 147 linhas |
| Arquivo sem linha | — | 16: `0031`–`0037`, `0039`, `0040`, `0096`, `0098`, `0110`–`0114` | 5: `0032`, `0035`, `0039`, `0040`, `0098` |
| Linha sem arquivo | — | 1: `0115_fila_consolidacao_grupo_sem_pessoa` | 3: `f19_paridade_criar_compra_lote_0040`, `0100b_digest_selecao_distinct`, `0126b_lancamento_regulariza_contadores` |
| Formato de `version` | prefixo de 4 dígitos no nome do arquivo | 7 sequenciais (`0001`…`0007`) + 127 timestamps de 14 dígitos | 147 timestamps |

- **Os buracos são de anotação, não de migration faltando.** Quatro amostras em produção por sonda de efeito: `tipos_item`
  existe (`0114`), `status_tem_detentor` existe (`0110`), `apagar_ativos_conflito_filiais` existe (`0098`), e as tabelas de
  backup que a `0039` apaga não existem. Os outros doze não foram sondados, e não precisam ser para este método (ver
  Consequências).
- **O timestamp nasce no ato do apply.** O conector MCP (`apply_migration`) grava `version` = hora do apply; o caminho pela
  Management API grava o que o `insert` manual disser. Nenhum dos dois lê o prefixo do arquivo.
- **O contrato de base fixa está íntegro:** `0146`→`0150` têm linha nos dois ledgers (conferido por leitura em 22/09).

### O que `supabase db push` faria hoje

Lido na fonte atual da Supabase CLI (`findPendingMigrations` e `db-push-core`), não de memória:

- A CLI aceita **qualquer** prefixo numérico no nome do arquivo (`^([0-9]+)_(.*)\.sql$`), então `0001_…` seria lido. O
  problema não é o nome do arquivo, é o ledger.
- A comparação local × remoto é **texto** sobre `version`. `"20260713112242"` nunca casa com `"0008"`: as versões remotas
  sobram, o resultado é `missing-local`, e o `db push` **aborta de cara** com `DbPushMissingLocalError` ("Remote migration
  versions not found in local migrations directory"). Não há flag que contorne (`--include-all` só cobre o caso inverso).
- ⚠ A frase de 24/07 no [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md) ("um `db push` tentaria reaplicar migrations já aplicadas")
  descrevia o risco pelo lado errado. Hoje a CLI **se recusa**. O perigo real está no passo que alguém daria para
  "destravá-la": um `supabase migration repair` que reescreve o ledger a partir dos arquivos locais e passa a declarar
  aplicado o que ninguém conferiu. Depois disso, qualquer replay de `0031`→`0037` regride a RPC do import por cima de
  `0048`/`0064`/`0080`/`0094`.
- A CLI **não está em nenhum ponto do fluxo**: saiu do CI na v1.51.1 (o job `banco-sem-docker` roda Postgres puro, depois de
  duas quebras documentadas por dependência externa), não há `supabase/config.toml` versionado e nada faz `supabase link`.

## Decisão

**Formalizar o método que já está em uso, e proibir o da CLI contra os bancos vivos.**

1. **Apply:** pelo conector MCP (`apply_migration`) ou pela Management API (`POST /v1/projects/{ref}/database/query`, com o
   `insert` no ledger feito à mão). Ensaio primeiro, produção depois. Plano B: o Johnny no SQL Editor. O passo a passo é o do
   [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md).
2. **Conteúdo:** a trava de hash (`supabase/migrations.lock.json`, F46) garante que migration aplicada não muda um byte, e
   `npm run db:lock` entra no mesmo commit da migration nova.
3. **Cadeia:** o job `banco-sem-docker` do CI aplica as migrations em ordem num Postgres limpo e roda os roteiros de
   `supabase/tests/`.
4. **Realidade do banco:** quem confere é a **sonda de efeito** (objeto existe? corpo normalizado bate? grant existe?), nunca o
   ledger. A sonda de paridade das 10 classes do runbook compara ensaio × produção.
5. **Deriva daqui para a frente:** o contrato de base fixa da v1.66.3. Da `0146` em diante, todo arquivo tem de ter linha no
   ledger, e toda linha aplicada depois da base tem de ter arquivo, lido por `ledger_de_migracoes()` (`0148`) na Parte B do
   `saude.yml`.
6. **Proibido contra produção e ensaio:** `supabase db push`, `supabase migration repair`, `supabase db reset --linked` e
   qualquer comando que reescreva `supabase_migrations.schema_migrations` em massa. Inserir a linha da migration que se acabou
   de aplicar (item 1) é o único write no ledger.

## Alternativas consideradas

- **Reparar o ledger para `version` = prefixo e adotar `db push`** (sem renomear arquivos). Viável, porque a CLI aceita o
  prefixo de 4 dígitos, mas custa 3 a 5 dias: sondar os 21 buracos um a um antes de marcá-los aplicados, trazer de volta a CLI
  que o CI removeu, reescrever o runbook. O ganho líquido é só "não precisar do conector para aplicar", e a trava de hash e a
  sonda de efeito continuam necessárias. Um reparo mal sondado seria um ledger que mente com convicção, pior que o de hoje, que
  sabidamente não é confiável. O `CHANGELOG` da F46 já notava que conciliar o ledger pediria aprovar `pg` como dependência.
- **Renomear as 149 migrations para timestamp + a opção acima.** De 1 a 2 semanas: ~970 referências a `NNNN_nome` (824 em
  `docs/`, 88 em `src/`, 58 em `scripts/`), o `migrations.lock.json` inteiro trocando de chave, e o rename é, ele mesmo, editar
  149 arquivos travados. O maior custo para nenhum ganho sobre a anterior.
- **Reparar só a anotação** (inserir as 16 linhas faltantes, sem adotar a CLI). Deixaria o ledger bonito para quem lê
  `list_migrations`, mas não daria a ninguém uma garantia que a sonda de efeito já não dê, e escreveria em
  `supabase_migrations` dos dois bancos por cosmética.

## Consequências

- **O ledger anterior à `0146` fica incoerente por desenho**, e está tudo bem: nenhum controle deste projeto o lê. Os 16 + 5
  buracos e as 4 linhas sem arquivo ficam registrados aqui como fato, não como pendência.
- **A proibição continua em prosa**, e a trava de fato é tripla: a CLI está fora do fluxo, o `db push` se recusa sozinho
  enquanto o ledger tiver timestamps, e o `migration repair` que o destravaria está proibido pelo item 6.
- **Reabrir este ADR quando:** alguém além do Johnny passar a operar o banco (o [`SYSTEM-DESIGN-2026-08-30.md`](SYSTEM-DESIGN-2026-08-30.md)
  já apontava esse gatilho), ou a CLI voltar ao fluxo por outro motivo, por exemplo uma fase do multiempresa. Nesse dia, a
  emenda precisa trazer uma trava executável contra `db push`, não só esta prosa.

## Emenda F63 (23/09/2026) — a classe da migration e o par de backup

O método de APLICAR não muda (conector, ensaio primeiro, sonda de efeito, nunca `db push`/`repair`). O que a F63
acrescenta é uma disciplina sobre o que a migration FAZ, porque a virada multiempresa é uma fila de migrations sobre um
banco com dado real:

1. **A classe no cabeçalho é obrigatória a partir da `0159`** — `-- classe: ADITIVA | BACKFILL | DESTRUTIVA` — e um
   classificador estático (`scripts/db/classificar-migration.mjs`, o leitor único que a guarda de topo também usa)
   confere que a declarada não é menor que a calculada. Ele lê como o Postgres lê: o corpo de função é guardado, o de
   `do` é executado. O que ele não sabe ler (SQL dinâmico, chamada de função no apply, default volátil) reprova como
   ILEGÍVEL. O censo das 157 anteriores é evidência, não trava — migration aplicada não se edita.
2. **Quem sobrescreve dado vivo guarda antes o valor antigo** em `public.backups_migration` (o par por coluna, no bloco
   canônico, com o nome do arquivo e o `where` byte a byte), e o rodapé traz o rollback que o devolve. Receita no
   [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md), "A disciplina de backup de migração".
3. **A coluna nova numa tabela viva nasce sem reescrita** (`add column … not null default <não-volátil>`, sem `update`,
   com `lock_timeout` por `set`/`reset`), e a prova é por impressão antes × depois nos DOIS bancos: `relfilenode` e md5
   de `(id, xmin)`.
4. **O rollback declara a ordem ENTRE fases**: o de uma fase pressupõe o das fases posteriores (o da F62 exige o da F63
   antes). Os arquivos de rollback moram em `supabase/rollback/`, fora do ledger e da trava de hash, e são ensaiados no
   CI por roteiro.

Isto não reabre o ADR: a ressalva continua a mesma (a CLI fora do fluxo). A regra é a R-ACC-85 a R-ACC-90 da
[`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md), emenda F63.

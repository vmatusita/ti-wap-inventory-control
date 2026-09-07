# PLAN-F47 — O injetor de mutações e o gate de deriva

**Fase F47 · `docs/PLANO-MULTIEMPRESA.md` §5, Bloco A · 06/09/2026 · versão 1.52.0**

Documento de desenho da fase, escrito para ser lido sozinho. O relatório da execução é
o `docs/RELATORIO-F47.md`.

---

## 1. A pergunta que a fase responde

O repositório tem 25 roteiros SQL e 577 asserções, e **nenhuma prova de que alguma delas
saiba ficar vermelha**. A F45 nomeou o defeito de forma — dezenas de asserções são
`if v_n = 0 then ✓ else ✗`, e todas passam sobre conjunto vazio — e entregou a ferramenta
que recusa esse caso (`pg_temp.assert_zero_de`), mas **não converteu as asserções
existentes**, de propósito.

O que faltava é o instrumento que responde de fora: *quebre o banco de propósito e veja
se o roteiro acusa*. Sem ele, a F48 escreveria quatro catálogos de segurança novos sem
saber se catálogo consegue reprovar — quatro documentos com sensação de rede.

O segundo mecanismo fecha o buraco simétrico: uma migration pode acrescentar coluna e
ninguém é obrigado a rodar `npm run db:types`. **Já aconteceu**, e está na ata da F41.

---

## 2. As cinco medições do diagnóstico

Nenhuma foi aceita por estar escrita. Cada uma tem o comando que a confirmou.

| # | O prompt afirma | Medido | Resultado |
|---|---|---|---|
| 1 | A mesa não tem Postgres nem Docker | `winget list --name PostgreSQL` → "No installed package found"; `C:\Program Files\PostgreSQL` não existe; `C:\Program Files\Docker` existe e está **vazio**; `which psql` → nada | ✅ confirmado — a fase inteira se prova sem banco na mesa, e o resto é ciclo de CI |
| 2 | `_bkp_relatorios_gerados_f6a` só existe em produção | `grep -rn "_bkp_relatorios" supabase/migrations/` → só COMENTÁRIOS na 0039 e na 0058; `database.ts:17` a lista | ✅ confirmado |
| 3 | O `--local` do gate de tipos está morto | O job `banco` (Docker/`supabase start`) saiu no commit `40f5897` (v1.51.1) | ✅ confirmado — **e a leitura do fonte da CLI fez a Decisão 1 mudar de resposta**, ver §4 |
| 4 | 34 asserções `if v_n = 0 then ✓` | `grep -rn "if v_.* = 0 then" supabase/tests/*.sql \| wc -l` → **58** | ⚠ a ficha está velha; vale o número medido. **Nenhuma foi convertida** — é matéria da F48 |
| 5 | `ci-passos.test.ts` trava a lista de jobs | linha 377: `expect(nomesDosJobs()).toEqual(['verificar', 'banco-sem-docker'])` | ✅ confirmado |

**Consequência de desenho do item 1:** a maior fatia possível do trabalho tem de ser
verificável **sem banco**, senão a fase vira dez pushes às cegas. É por isso que
`corpoVigente`, o catálogo, o parser da saída e o parser do `database.ts` são módulos
próprios, puros e testados por Vitest — 184 asserções que rodam na mesa em menos de um
segundo.

---

## 3. As peças

| Arquivo | O que é | Roda sem banco? |
|---|---|---|
| `scripts/db/corpo-vigente.mjs` | resolve o corpo VIVO de uma função varrendo as migrations da maior para a menor; `trocarNoCorpo` recusa a troca que viraria no-op | ✅ |
| `scripts/db/mutacoes.mjs` | o CATÁLOGO — 27 quebras ativas + 4 em quarentena | ✅ |
| `scripts/db/saida-roteiro.mjs` | a leitura da saída do runner: token, nunca substring | ✅ |
| `scripts/db/run-mutation-tests.mjs` | o MOTOR: controle, banco descartável, sonda, cenário nomeado | ❌ precisa de Postgres |
| `scripts/db/tipos-conjuntos.mjs` | os conjuntos do `database.ts`, pelo compilador TypeScript, e a comparação | ✅ |
| `scripts/db/diff-tipos.mjs` | o gate de deriva: lê o catálogo do Postgres e compara | ❌ precisa de Postgres |
| `supabase/migrations/0128_adota_bkp_relatorios_f6a.sql` | adota a tabela órfã | ❌ |

Catálogo e motor são arquivos separados de propósito: a F51 e a F52 vão acrescentar
mutações mexendo só no catálogo.

---

## 4. As três decisões obrigatórias, com o número que decidiu cada uma

### Decisão 1 — como o gate de tipos lê o banco → **opção (b): catálogo por SQL + compilador TypeScript**

A ficha mandava `supabase gen types typescript --local`, que exige `supabase start` →
Docker, removido do caminho crítico pela F46 e ausente da mesa. Restavam duas opções, e a
medição inverteu o trade-off que a ficha descreve.

**A vantagem prometida da opção (a)** — "os dois lados saem do MESMO gerador, então as
regras de inclusão são idênticas por construção" — só vale para os caminhos
`--project-id`/`--linked`, que falam com a Management API hospedada. **Nenhum dos dois
alcança o Postgres efêmero do `banco-sem-docker`**: não é projeto Supabase, não tem ref,
não tem `linked-project.json`.

O único caminho que alcança uma connection string arbitrária é `--db-url`. Medido no
**fonte da CLI na tag exata que este repositório fixa** (`v2.109.1`,
`apps/cli-go/internal/gen/types/types.go`): fora do caminho `projectId`, ele monta um
`hostConfig{NetworkMode: host}` e chama `DockerRunOnceWithConfig` com a imagem
`supabase/postgres-meta` — ou seja, **`--db-url` sobe um container Docker** e delega a
introspecção a ele, mesmo com o Postgres-alvo local. É exatamente a classe de dependência
que a F46 gastou uma fase inteira tirando do caminho crítico, e que o escopo desta fase
proíbe com todas as letras.

**Custo da opção (b), que a ficha temia:** reproduzir as regras de inclusão do gerador.
Medido, ele é **uma regra só**, e ela foi provada com resíduo zero nas duas direções:

```
funções definidas nas migrations em `public` .......... 64
funções listadas em src/lib/types/database.ts ......... 59
diferença ............................................. 5
as 5: aplicar_movimentacao, guarda_acervo, handle_new_user,
      profiles_guarda_dev, valida_lancamento_item
todas as 5 declaram `returns trigger`.
```

Logo: `prokind = 'f' and pg_get_function_result(oid) <> 'trigger'`. Relações e colunas são
diretas (`relkind in ('r','p','v')`, `attnum > 0 and not attisdropped`); as 9 views das
migrations batem com as 9 do arquivo.

**A extração do lado do arquivo é pelo compilador TypeScript** (já dependência: `5.9.3`),
e não por regex — medido: uma extração por regex de linha devolve **54** das 59 funções,
porque o gerador emite algumas entradas numa linha só
(`apagar_usuario: { Args: { p_alvo: string }; Returns: undefined }`). Perder nomes do lado
do repositório faria o gate acusar deriva inexistente, que é como um gate morre.

### Decisão 2 — onde o injetor roda no CI → **passo dentro de `banco-sem-docker`, INCONDICIONAL**

Medido no run `34048772118` (06/09/2026), passo a passo:

| | tempo |
|---|---|
| `Initialize containers` (subir o `postgres:17`) | 26s |
| `Garantir psql` (apt-get) | 15s |
| bootstrap (4 arquivos) | <1s |
| 126 migrations | 6s |
| determinismo (2º banco: bootstrap + 126 migrations + 2 fingerprints + diff) | 6s |
| 25 roteiros, 577 asserções | 2s |
| **job inteiro** | **62s** |
| **job `verificar`, em paralelo** | **280s** |

Um **job próprio** pagaria de novo os **41s de overhead fixo** (container + `psql`) para
economizar os **6-8s** de reaplicar bootstrap + migrations — 5 a 7 vezes mais caro do que
o que evita. Pior: como a **branch protection não se toca nesta fase**, um job novo nunca
seria *required check*. Seria um portão que não fecha.

Como **passo** dentro do job que já é required, o gate vale desde o primeiro dia. O custo
somado (`setup-node` 4s + `npm ci` 22s + o lote) cabe inteiro na folga de 218s que este
job tem contra o `verificar`, que domina o relógio — **o CI não fica mais lento**.

**Incondicional, contrariando a ficha ("em PR marcado"), e o motivo é documental.** A
documentação oficial do GitHub diz, na página de condições de execução de job: *um job
pulado reporta status "Success" e não impede o merge de um pull request, mesmo sendo um
required check*. Um gate gateado por label ficaria **verde sem ter rodado** — e ninguém
saberia. A restrição inegociável da ordem ("o que é condicional não pode ser required
check") resolve-se aqui na outra ponta: nada é condicional. Há asserção em
`ci-passos.test.ts` impedindo que um `if:` apareça nesses dois passos depois.

### Decisão 3 — o que fazer com mutação NÃO detectada → **reprova, e a quarentena é declarada**

O injetor sai não-zero com **qualquer** mutação ativa não detectada. Uma quebra que se
prove indetectável **sem escrever catálogo novo** sai do lote ativo e vai para a
`QUARENTENA` do mesmo arquivo, com o SQL, o motivo escrito e **a fase que a adota**.
`scripts/db/mutacoes.test.mts` exige que toda entrada nomeie uma fase, que o motivo tenha
substância, e que a quarentena **não passe de um terço do lote** — a régua não depende de
alguém lembrar dela.

Hoje: **27 ativas, 4 em quarentena (12,9% de 31)**.

---

## 5. O lote, uma a uma

27 mutações ativas, 10 classes de defeito, os seis roteiros da ficha cobertos.

| mutação | roteiro | cenário esperado | classe |
|---|---|---|---|
| `rls-movimentacao-confia-na-filial-declarada` | papeis_rls | `2c-bis`, `2c-ter` | escopo-de-filial |
| `rls-lancamento-de-item-confere-papel-e-esquece-filial` | papeis_rls | `2e` | **papel-sem-escopo** |
| `rls-edicao-de-ativo-confere-papel-e-esquece-filial` | papeis_rls | `2g` | **papel-sem-escopo** |
| `rls-piso-de-leitura-aberto-em-ativos` | papeis_rls | `4d` | piso-de-leitura |
| `rls-desligada-em-senhas-de-acesso` | papeis_rls | `3d`, `5f` | rls-desligada |
| `rls-auditoria-visivel-a-quem-escreve` | papeis_rls | `3f` | nivel-admin-afrouxado |
| `rls-trilha-do-import-visivel-a-quem-escreve` | papeis_rls | `3e` | nivel-admin-afrouxado |
| `rls-bucket-de-backup-visivel-a-quem-escreve` | papeis_rls | `6e` | nivel-admin-afrouxado |
| `rls-ancora-do-termo-sempre-coerente` | papeis_rls | `2i-bis-3` | guarda-neutralizada |
| `catalogo-rls-desligada-numa-tabela` | seguranca_catalogo | `2` | rls-desligada |
| `catalogo-view-sem-security-invoker` | seguranca_catalogo | `3` | view-fura-rls |
| `catalogo-funcao-gatilho-executavel-por-authenticated` | seguranca_catalogo | `4` | grant-devolvido |
| `catalogo-gatilho-de-lancamento-vira-definer` | seguranca_catalogo | `4c` | guarda-neutralizada |
| `catalogo-rpc-de-escrita-executavel-por-anon` | seguranca_catalogo | `1` | grant-devolvido |
| `dev-guarda-de-gestao-aceita-nivel-admin` | cargo_dev | `2a`, `2b`, `2c`, `2e` | e-dev-virou-e-admin |
| `dev-apagar-conta-aceita-nivel-admin` | cargo_dev | `2f-bis` | e-dev-virou-e-admin |
| `dev-encerrar-sessoes-aceita-nivel-admin` | cargo_dev | `2f` | e-dev-virou-e-admin |
| `dev-trigger-deixa-conceder-cargo-por-update-direto` | cargo_dev | `2h` | guarda-neutralizada |
| `dev-auxiliar-de-gestao-executavel-por-authenticated` | cargo_dev | `5e` | grant-devolvido |
| `destrutivo-justificativa-sem-tamanho-minimo` | dev_destrutivo | `12b`, `12e` | guarda-neutralizada |
| `destrutivo-guarda-do-acervo-aceita-update` | dev_destrutivo | `2i`, `2k` | imutabilidade-afrouxada |
| `destrutivo-guarda-do-acervo-aceita-delete` | dev_destrutivo | `2j`, `2l`, `2m`, `13c` | imutabilidade-afrouxada |
| `destrutivo-marca-de-forcado-gravavel-por-qualquer-caminho` | dev_destrutivo | `2f`, `2n` | imutabilidade-afrouxada |
| `import-sem-revalidacao-de-contagens` | import_substituir | `2` | guarda-neutralizada |
| `import-sem-exigencia-de-backup` | import_substituir | `3` | guarda-neutralizada |
| `conflito-justificativa-sem-tamanho-minimo` | conflito_filiais | `5f` | guarda-neutralizada |
| `conflito-confirmacao-com-numero-errado-aceita` | conflito_filiais | `5d`, `5e` | guarda-neutralizada |

### A quarentena

| mutação | roteiro | por que é indetectável hoje | adota |
|---|---|---|---|
| `conflito-serializacao-por-advisory-lock` | conflito_filiais | nenhuma asserção abre uma SEGUNDA conexão; a trava só tem efeito sob concorrência | F52 |
| `conflito-backup-em-arquivo-sem-prefixo-do-digest` | conflito_filiais | a maior seleção testada tem 2 ativos, e o ramo de backup em arquivo só roda acima de 25 | F52 |
| `gestao-encerrar-sessoes-mira-o-alvo-errado` | cargo_dev | o cenário `3d` aceita "0 sessões removidas" como sucesso — asserção sobre conjunto vazio | F48 |
| `leitura-de-colaboradores-sem-piso` | papeis_rls | o roteiro não planta linha em `colaboradores`; "viu 0 linhas" continua verdadeiro com a RLS desligada | F48 |

**As quatro são achados**, não desculpas: duas apontam asserção fraca (insumo direto da
F48) e duas apontam caminho não exercitado (insumo da F52). Nenhuma vira correção nesta
fase — o escopo proíbe.

### Os dois pontos cegos que o lote respeita

Medidos na exploração, e escritos no cabeçalho do catálogo:

- **`papeis_rls.sql` nunca cria um perfil `papel = 'dev'`.** Mutação que dependa de
  distinguir dev de admin é invisível a ele — vai para `cargo_dev.sql`.
- **`papeis_rls.sql` roda inteiro como `authenticated`**, nunca `set local role anon`.
  `grant … to anon` é invisível a ele — vai para `seguranca_catalogo.sql`.

Mapear uma mutação dessas para o roteiro errado seria escrever quarentena disfarçada de
lote ativo.

---

## 6. A ordem de entrega, que não é livre

1. `corpoVigente` + catálogo + travas de Vitest — tudo que roda sem banco vem primeiro.
2. O motor do injetor.
3. **A migration `0128`** + `npm run db:lock` + a segunda lista (`migrations-f38.test.ts`).
4. **Só então** o gate de tipos ligado. Antes da adoção ele nasceria vermelho pela própria
   tabela que a fase está trazendo para dentro.
5. **Só então** a isenção por prefixo sai do `seguranca_catalogo.sql`, pelo mesmo motivo.
6. O CI, e a trava do `ci-passos.test.ts` no mesmo commit.
7. As sabotagens.
8. Versão, tag, documentação, relatório, merge.

---

## 7. A verificação de ponta a ponta

**Na mesa, sem banco:** `npm run lint`, `npm run test`, `npm run build`, `npx tsc --noEmit`.

**No CI (é onde o banco existe):** `banco-sem-docker` verde com os dois passos novos.

**As quatro sabotagens** — cada uma com a saída real em `docs/f47-evidencias/`, revertida
e a reversão conferida:

1. asserção de `papeis_rls.sql` desligada → o injetor acusa **a mutação certa** como não
   detectada;
2. mutação com SQL que não aplica → mensagem de **"não aplicou"**, nunca "não detectada";
3. coluna nova sem `db:types` → gate vermelho **nomeando a coluna**;
4. tabela `_` sem RLS → `seguranca_catalogo.sql` vermelho (a prova de que a isenção
   removida fazia diferença).

---

## 8. O limite honesto do gate de deriva

Ele compara o `database.ts` com o banco **do CI** — o que as 128 migrations constroem. A
deriva de **produção** (um objeto criado à mão no SQL Editor, como a própria
`_bkp_relatorios_gerados_f6a` foi) continua invisível até alguém rodar `npm run db:types`.
O que ele garante é o inverso, e já é muito: **nenhuma migration nova entra sem os tipos
correspondentes**.

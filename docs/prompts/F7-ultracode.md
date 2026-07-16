# OS-F7 (ultracode) — Import de startup por CSV (Substituir tudo), execução paralela

Versão **executável** da `F7-import-csv-ativos.md` com o escopo refinado pelo Johnny em 16/07/2026 (2ª rodada): **somente o modo Substituir tudo** — o "import de startup", o go-live novo de cada filial pela tela de administração. O modo Atualizar foi **adiado** ("não vamos atualizar nada agora — correção manual é no próprio sistema, linha por linha"). As decisões do Johnny estão na §2 — são autoridade, junto com o alinhamento coluna a coluna da F7 original (§3 de lá).

**Modo autônomo com acesso total (CLAUDE.md).** Sistema **em produção com dados reais** — e esta OS constrói uma operação **destrutiva por design** (delete físico assumido pelo Johnny com o custo explícito na mesa). As salvaguardas da §2.4 não são opcionais: são parte do produto.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O orquestrador segue a §1; os blocos §W1–§W4 são os prompts completos dos subagentes.

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) F6A **e** F6B concluídas e em produção (README; migrations até `0030` aplicadas — confira a numeração real); (b) working tree limpo, build verde; (c) esta OS **revoga a regra "não existe importação, nunca"** (spec §10/CLAUDE.md/README) — a revogação é decisão registrada do Johnny (16/07/2026) e a emenda dos documentos é parte da execução (W4). Não trave na contradição: siga com a emenda.

### 1.1 Grafo de execução

```
ONDA 1 (paralela)                 INTEGRAÇÃO                ONDA 2 (serial)         FINAL
┌─ W1: motor puro (parser/ ─┐   merge W1→W2            W3: action + tela      W4: revisão adversarial
│      De→Para/plano+testes)│→  contrato conferido  →      admin/importar   →      + E2E dev + emendas docs
└─ W2: banco (RPC/log/      ┘   db:types · lint/test        (wizard 5 passos)      → migrations produção
       backup/filtro)                                                              → deploy → smoke → resumo
```

- **W1 ∥ W2** não compartilham nenhum arquivo — o acoplamento entre eles é o **CONTRATO da §1.5**, fixado aqui exatamente para permitir o paralelismo. Worktrees `f7-w1`, `f7-w2`.
- **W3** integra os dois (única frente que toca UI/actions). **W4** é o revisor adversarial — obrigatório numa feature cujo requisito nº 1 é "não pode conter erros".
- Migrations em produção e deploy: **só o orquestrador, no final**.

### 1.2 Regras globais

1. Desenvolvimento contra Supabase DEV/local. Nenhum subagente toca produção.
2. **Migrations pré-alocadas**: os 2 próximos números livres após o estado real da pasta (a F6B usou `0030`, talvez `0031`) — **W2** usa ambos: um para `import_logs` + bucket de backup, outro para as RPCs. Confira a pasta antes de numerar.
3. Stack fechada (PapaParse já aprovado; **nenhuma dependência nova**), custo R$ 0, **nenhum dado real** em código/teste/fixture (CSVs de teste 100% fictícios, padrão `WAP0001234`/"Fulano").
4. Convenções: pt-BR, Server Actions + Zod, leituras em `src/lib/queries/`, snake_case no banco, migration nova nunca edita aplicada, `security definer` com `set search_path = public` (padrão 0024).
5. Cada subagente entrega: código na branch + checklist autoverificado + rascunho para `docs/DECISOES.md` + pendências; `lint`+`test`+`build` limpos no worktree.

### 1.3 Mapa de propriedade de arquivos

| Dono | Arquivos |
|---|---|
| **W1** | `src/lib/import/**` (novo: `deparas.ts`, `parse.ts`, `plano.ts`, `tipos.ts` + testes `*.test.ts`). Leitura de `scripts/import/*` e `src/lib/patrimonio.ts` (sem editar) |
| **W2** | `supabase/migrations/00XX_import_logs.sql` e `00XX_import_rpcs.sql`, `src/lib/queries/relatorios/movimentacoes.ts` (ampliação do filtro de carga), `src/lib/dominio.ts` (constante nova do marcador) |
| **W3** | `src/lib/actions/importar.ts` (novo), `src/lib/queries/import-logs.ts` (novo), `src/app/(app)/admin/importar/**` (novo), `src/components/admin/importar/**` (novo), `src/components/admin/admin-nav.tsx` (item novo), `src/lib/types/database.ts` via `db:types` |
| **W4** | Revisão (toca qualquer arquivo para CORRIGIR achados), `docs/ESPECIFICACAO.md` §10, `CLAUDE.md`, `README.md`, `docs/DECISOES.md`, `docs/prompts/README.md` |

### 1.4 Integração e final (orquestrador)

1. Merge `f7-w1` → `f7-w2`; conferir o contrato (§1.5): os testes do W1 produzem um `PlanoImport` que a RPC do W2 aceita (rode o smoke SQL do W2 com um plano gerado pelo W1). `npm run db:types`, `lint`+`test`+`build`.
2. Lançar **W3** sobre a main integrada. Merge, re-teste.
3. Lançar **W4** (revisão adversarial + E2E em DEV + emendas de documentos). Aplicar correções.
4. **Produção:** aplicar as 2 migrations (na ordem) → smoke: RPC existe, `import_logs` vazia, bucket de backup com policy correta → deploy único → smoke manual na tela com um **CSV fictício de 3 linhas numa filial de teste?** NÃO — produção não tem filial de teste: o smoke de produção é só de leitura (tela abre, upload valida, preview aparece, **sem aplicar**). A primeira aplicação real é o go-live de filial do Johnny.
5. Resumo consolidado: checklists, decisões em `DECISOES.md`, README/prompts atualizados (F7 concluída; F6C continua na fila para itens).

### 1.5 CONTRATO entre frentes (fixo — mudou, é decisão registrada + aviso ao orquestrador)

```ts
// Produzido pelo W1 (montarPlanoImport), consumido pela RPC do W2 (p_plano jsonb) e pela UI do W3
type PlanoImport = {
  filialId: number
  arquivoHash: string            // sha-256 do conteúdo do CSV
  totalLinhasDados: number
  ativos: AtivoPlano[]
}
type AtivoPlano = {
  patrimonio: string             // canônico (WAP0004491)
  patrimonioOriginal: string     // como veio no CSV
  serviceTag: string | null
  categoria: 'notebook'|'desktop'|'monitor'|'celular'|'tablet'|'outro'
  marca: string|null; modelo: string|null; fornecedor: string|null
  memoria: string|null; armazenamento: string|null; processador: string|null; hostname: string|null
  observacoes: string|null       // Observação do CSV (sobrescreve sempre; vazio = null)
  dataEntrada: string|null       // yyyy-MM-dd = mais antiga válida entre Inclusão/Entrega; null = SEM data válida
  estadoAlvo: StatusAtivo        // precedência Situação>Status, De→Para spec §5
  colaborador: string|null; setor: string|null
  chamado: string|null           // GLPI
}
// Resultado da validação (W1) para o preview (W3):
type ValidacaoImport = {
  bloqueantes: ErroImport[]      // 1+ => NADA pode ser aplicado
  avisos: ErroImport[]           // ex.: sem_data_entrada, estado_em_uso_sem_colaborador
  plano: PlanoImport | null      // null quando há bloqueante
  resumo: { criar: number; semData: number; layout: 'matriz'|'cd'|'padrao20' }
}
type ErroImport = { linha: number; coluna: string; valor: string; tipo: string; mensagem: string }
```

Marcador de carga (W2 exporta em `dominio.ts`, RPC grava, relatório filtra): `OBS_IMPORT_STARTUP = 'import startup'` — a observação gravada é `` `${OBS_IMPORT_STARTUP} dd/MM/yyyy` `` e o filtro do relatório exclui por **prefixo** (além do `OBS_CARGA_GOLIVE` existente, por igualdade).

---

## §W1 — Subagente W1: motor puro do import (parser, De→Para, validação, plano)

Você é um subagente executando a frente W1 da OS-F7, branch `f7-w1`, worktree próprio. Modo autônomo. **Só módulos puros + testes** em `src/lib/import/` — nada de banco, nada de UI, nada de Server Action. É o coração do requisito "o import não pode conter erros": a régua de validação é sua.

### Contexto e fontes

- O CSV é o export da planilha de inventário, **uma filial por arquivo**, no layout da F4 (3 variantes por nome de coluna): Site, Marca, Tipo, Modelo, Fornecedor, Service Tag, Patrimônio, Memória, Armazenamento, Processador, Hostname, Data de Entrega, Status, Situação, Data de Inclusão, Colaborador, GLPI (só no layout 20 col), Termo de Ativos (ausente no CD), Observação, Grade (ignorada).
- **Reaproveite por EXTRAÇÃO** (copiar/adaptar para módulo de produção, com testes) — leia e espelhe, sem editar os originais: `scripts/import/parse.ts` (validação de header por conjunto de nomes normalizados — sem `:`/espaços/acentos —, detecção dos 3 layouts, extração por nome), `scripts/import/normalizar.ts` (De→Para de unidades/categorias/estados, precedência **Situação > Status**, parse de datas pt-BR), `src/lib/patrimonio.ts` (`canonicalizarPatrimonio`, `chavePatrimonio` — **importe**, não copie). Se preferir que os scripts da F4 passem a importar do módulo novo, NÃO faça — fica como pendência para o orquestrador decidir (os scripts são ferramenta histórica).
- Encoding: aceite UTF-8 (com/sem BOM) **e** cp1252, separador `;` (o Excel da WAP exporta assim). PapaParse é dependência aprovada; para cp1252 decida entre `TextDecoder('windows-1252')` no buffer antes do parse — teste com bytes reais de acentuação (`ç`, `ã` fictícios).

### Regras de validação (decisões do Johnny — 16/07/2026)

**Bloqueantes** (qualquer um ⇒ `plano: null`, nada aplicável):
1. Header não corresponde a nenhum dos 3 layouts (mensagem lista faltantes/sobrando).
2. Patrimônio inválido/vazio (`canonicalizarPatrimonio` → null). **Sem** inferência por hostname.
3. Par patrimônio+service tag repetido dentro do CSV; ou patrimônio repetido **sem** service tag (colisão do índice único `coalesce(service_tag,'')`).
4. `Site` da linha ≠ filial selecionada, após o De→Para de unidades (Serra Park→Serra, Filial-CE→Eusébio, CD-PENA/Afonso Pena→CD-Afonso Pena, "Matriz "→Matriz…). Import **nunca** transfere.
5. Categoria (`Tipo`) fora do De→Para; Status+Situação sem estado resolvível no De→Para da spec §5; estado alvo `descartado`? — decida: linha de ativo descartado num CSV de startup é provável lixo; recomendo **bloqueante** com mensagem ("remova a linha ou corrija a situação") e registre.
6. Linha 100% vazia é pulada em silêncio (não é erro); linha sem Site E sem patrimônio → descartada com **aviso** (padrão da F4).

**Avisos** (não bloqueiam — vão no preview):
- `sem_data_entrada`: Data de Inclusão e Entrega ambas vazias/ilegíveis (`#######`, `XX`, datas quebradas, data futura) → `dataEntrada: null` (decisão do Johnny: "opção sem data, para não ficar incluso nos relatórios atuais" — o W2 marca essas compras fora do período).
- `estado_em_uso_sem_colaborador`: estadoAlvo em_uso/emprestado sem Colaborador no CSV (a F4 tinha 77 casos — segue aviso).

**Montagem do plano** (`montarPlanoImport`): 1 `AtivoPlano` por linha válida, campos do alinhamento da F7 §3 (Termo de Ativos **ignorado**; Grade ignorada; cadastrais vazios → null; Observação vazia → null; `dataEntrada` = mais antiga válida entre Inclusão/Entrega). `arquivoHash` = sha-256. Datas normalizadas `yyyy-MM-dd` (aceite dd/MM/yyyy, dd/MM/yy e serial Excel se os scripts da F4 aceitavam — espelhe).

### Testes (Vitest — o grosso da frente)

Casos mínimos: os 3 layouts válidos; header quebrado; cp1252 e UTF-8; canonicalização (WAP4491→WAP0004491, prefixos LEA/PRO/TEC/STF); par duplicado com/sem ST; Site divergente e Site com De→Para; precedência Situação>Status (`Estoque|Descarte`, `Remanejo|vazio`, `Estoque|Manutenção`); datas válidas/quebradas/futuras → `dataEntrada` e aviso; em_uso sem colaborador → aviso; linha vazia/sem chave; Observação/Termo/Grade conforme decisões; hash estável. **Nenhum dado real.**

### Aceite W1

- [ ] `src/lib/import/` com módulos puros exportando `validarCsvImport(buffer, filialSlug) → ValidacaoImport` (nomes finais a seu critério, contrato da §1.5 respeitado)
- [ ] Todos os casos de teste acima passando; cobertura dos De→Para espelhada dos scripts da F4 (cite na entrega quais tabelas De→Para foram extraídas e de onde)
- [ ] Zero import de `scripts/import/*` em código de produção (só espelhamento) e zero edição nos scripts
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (descartado bloqueante?, datas aceitas, encoding)

---

## §W2 — Subagente W2: banco — RPC transacional, log, backup e filtro do relatório

Você é um subagente executando a frente W2 da OS-F7, branch `f7-w2`, worktree próprio. Modo autônomo. Migrations **em DEV** (o orquestrador aplica em produção). Consome o CONTRATO da §1.5 — não o altere.

### Fatos do código (verificados nas sessões de planejamento — releia antes de editar)

- `movimentacoes` é **insert-only** por RLS (0005) — o delete do Substituir NÃO passa pela policy: por isso a aplicação é **RPC `security definer`** (transação + bypass controlado). `ativos`/`anotacoes` têm escrita p/ authenticated, mas o delete em massa fica DENTRO da RPC de qualquer forma (atomicidade).
- FKs: `movimentacoes.ativo_id → ativos` (not null), `anotacoes.ativo_id → ativos`; `termos_gerados` referencia por **arrays** `ativo_ids`/`movimentacao_ids` (sem FK) + arquivos no bucket privado `termos` (`arquivo_path`).
- O trigger `aplicar_movimentacao` (0004/0023) deriva estado/colaborador/filial — **inserts de movimentação passam por ele** (nunca update direto em `ativos.status`).
- Snapshots congelados (`relatorios_gerados.dados` jsonb) não referenciam ativos por FK — **sobrevivem** ao delete (decisão consciente do Johnny).
- O relatório exclui a carga do go-live das tabelas de período filtrando `observacao = OBS_CARGA_GOLIVE` (`'carga go-live'`, igualdade exata) em `src/lib/queries/relatorios/movimentacoes.ts` (helper com `.or('observacao.is.null,...')` — cuidado com o gotcha do `.neq`+NULL).
- Enum `tipo_movimentacao` tem `compra` e `ajuste`; `ajuste` exige `status_resultante` + observação (justificativa) e **não aparece** nas tabelas/série do relatório.

### Entregas

**Migration A — `00XX_import_logs.sql`:**
- Tabela `import_logs`: `id uuid pk`, `filial_id smallint not null references filiais`, `modo text not null check (modo = 'substituir')`, `arquivo_hash text not null`, `total_linhas int not null`, `ativos_criados int not null`, `movs_apagadas int not null`, `anotacoes_apagadas int not null`, `termos_apagados int not null`, `backup_path text not null`, `criado_por uuid not null references profiles`, `created_at timestamptz default now()`. RLS: select/insert `authenticated` (insert real acontece dentro da RPC, mas mantenha a policy coerente).
- Bucket **privado** `backups-import` + policies só `authenticated` (padrão do bucket `termos` na 0021).

**Migration B — `00XX_import_rpcs.sql`:**
- `importar_ativos_substituir(p_plano jsonb, p_backup_path text) returns jsonb`, `security definer`, `set search_path = public`:
  1. **Revalidação interna** (a UI é a segunda linha, nunca a única): filial existe e ativa; `p_backup_path` não vazio; plano com ≥1 ativo; para cada ativo — patrimônio casa `^[A-Z]{2,4}\d{7}$`, categoria/estado válidos nos enums, par único dentro do plano. Falhou → `raise exception` com mensagem pt-BR (rollback automático).
  2. **Guarda do termo multi-filial:** se existir `termos_gerados` cujo `ativo_ids` contenha ativos da filial **e** de outra filial → exception (o preview do W3 já barra antes; aqui é a rede).
  3. **DELETE ordenado** (só da filial): `movimentacoes` dos ativos da filial → `anotacoes` → `termos_gerados` (onde TODOS os `ativo_ids` são da filial; colete os `arquivo_path` apagados e devolva no retorno para o W3 remover do Storage — Storage não se apaga de dentro do Postgres) → `ativos`.
  4. **INSERT por ativo do plano**: `ativos` (com `origem: 'importacao'`, `patrimonio_original`, cadastrais, observações) → movimentação `compra` (`data` = `dataEntrada` **ou**, se null, a data do import; `observacao` = `OBS_IMPORT_STARTUP || ' ' || dd/MM/yyyy` **sempre** — decisão do Johnny: entrada de startup não é entrada do período, com ou sem data) → se `estadoAlvo <> 'em_estoque'`: movimentação `ajuste` (`status_resultante` = estadoAlvo, colaborador/setor/chamado do plano, `data` = data do import, mesma observação-marcador).
  5. **Contagens conferidas na transação**: `count(ativos da filial) = jsonb_array_length(p_plano->'ativos')`; estado de cada ativo = estadoAlvo (compare via `ativos.status`). Divergiu → exception (rollback).
  6. `insert into import_logs (...)`; `return jsonb` com contagens + `arquivos_termos_apagados`.
- **Grant execute só `authenticated`.** Rate: uma execução por vez (advisory lock por filial, padrão 0019).
- Comente o SQL generosamente; inclua no fim (comentado) o **smoke SQL** para o orquestrador (plano fictício de 2 ativos numa transação com rollback).

**Código TS:**
- `src/lib/dominio.ts`: `export const OBS_IMPORT_STARTUP = 'import startup'` ao lado de `OBS_CARGA_GOLIVE`, com comentário.
- `src/lib/queries/relatorios/movimentacoes.ts`: amplie o filtro de carga para excluir também por **prefixo** `OBS_IMPORT_STARTUP` (todas as tabelas do período + últimas movimentações — os mesmos pontos do A1). Confirme o operador PostgREST para "not like" com null-safe (`.or('observacao.is.null,and(...)')`) na doc atual do supabase-js — regra 6.

### Aceite W2

- [ ] Em DEV: rodar a RPC com um plano fictício (via SQL) numa filial de teste cria ativos+compras+ajustes com estados corretos derivados pelo trigger; contagens batem; segunda execução substitui de novo (idempotência do modo: apagar e recriar)
- [ ] Falha simulada no meio (ex. estado inválido na 3ª linha) → rollback TOTAL (contagens idênticas às de antes)
- [ ] Termo multi-filial em DEV → exception; termos só-da-filial são apagados e os paths retornados
- [ ] Compras do import (com e sem data) NÃO aparecem em Entradas/Últimas do relatório; compra operacional normal continua aparecendo; observação NULL continua aparecendo (gotcha verificado)
- [ ] `rel_estoque_asof` numa data entre a `dataEntrada` e hoje enxerga os ativos importados (a data real do CSV vale no histórico de estoque)
- [ ] RLS de `movimentacoes` inalterada para o resto do app; grants conferidos (anon sem execute)
- [ ] `db:types` regenerado; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W3 — Subagente W3 (ONDA 2): action + tela `admin/importar`

Você é um subagente executando a frente W3 da OS-F7, branch `f7-w3`, **sobre a main já integrada com W1+W2**. Modo autônomo. Sem migration, sem deploy.

### O que construir

**Server Actions (`src/lib/actions/importar.ts`):**
1. `validarImport(formData)` — recebe o arquivo (File), **limite de tamanho** (ex. 5 MB — registre) e extensão `.csv`; chama o motor do W1 (`validarCsvImport`); retorna `ValidacaoImport` + o **custo do Substituir** consultado do banco: contagens atuais da filial (ativos, movimentações, anotações, termos que serão apagados) e a checagem prévia de **termo multi-filial** (bloqueante com a lista). O arquivo NÃO é persistido — só o hash viaja no plano.
2. `aplicarImport(plano, confirmacaoTexto)` — guardas: `getOperador()`; `confirmacaoTexto` = nome exato da filial; **grava o BACKUP primeiro** (export jsonb de ativos+movimentações+anotações+termos da filial → arquivo no bucket `backups-import`, path com timestamp; sem sucesso no upload, aborta); chama a RPC `importar_ativos_substituir(plano, backupPath)`; com o retorno, remove do bucket `termos` os `arquivos_termos_apagados`; `revalidatePath` amplo (`/ativos`, `/relatorios` layout, `/pendencias`, `/`); retorna contagens + link assinado do backup.
   - **Revalidação de estado**: se entre o preview e o aplicar o banco mudou (compare as contagens do custo exibido com as atuais dentro da action antes de chamar a RPC), aborte com "o estado da filial mudou — gere o preview novamente".
3. `urlBackup(logId)` — URL assinada curta do backup de um log (para o histórico).

**Tela `src/app/(app)/admin/importar/page.tsx` + componentes (`src/components/admin/importar/`):**
- Item "Importar" no `admin-nav.tsx`.
- **Wizard de 5 passos** (client, estados claros): **1 Configurar** (select de filial ativa; o modo é fixo "Substituir tudo — go-live da filial" com texto explicando o que significa) → **2 Upload** (input file, `.csv`, tamanho) → **3 Preview**: números grandes (criar N · sem data M · apagar: X ativos, Y movimentações, Z anotações, K termos), tabela de **bloqueantes** (linha · coluna · valor · motivo — o motor W1 já entrega pronto) e de **avisos**, com **download da lista em CSV** (`;`+BOM, padrão do projeto); com 1+ bloqueante o passo 4 fica desabilitado com a mensagem "corrija o CSV e reenvie" → **4 Confirmar**: resumo do custo + campo "digite o nome da filial para confirmar" (padrão GitHub; botão só habilita com o texto exato) + aviso vermelho do que será apagado permanentemente → **5 Resultado**: contagens finais, link do backup, link "ver ativos da filial".
- **Histórico de imports** na mesma página (tabela de `import_logs` via `src/lib/queries/import-logs.ts`: quando, quem, filial, criados/apagados, backup para baixar).
- Estados de pending em todos os botões (padrão do projeto); erros da action via `toast.error` + inline.

### Aceite W3

- [ ] Fluxo completo em DEV com CSV fictício: filial nova (vazia) → preview "apagar 0" → aplica → ativos criados com estados/datas certos na ficha e na lista
- [ ] Filial com dados → preview mostra o custo real; confirmação exige o nome exato; aplicar substitui; backup baixável e completo (as 4 coleções)
- [ ] CSV com bloqueantes (1 de cada tipo da §W1) → passo 4 desabilitado, tabela de erros correta e baixável
- [ ] Banco mudado entre preview e aplicar (registre uma movimentação manual no meio) → aborta com mensagem de regerar
- [ ] Arquivos de termos apagados somem do bucket; snapshots congelados antigos continuam abrindo
- [ ] Viewer por senha não acessa `/admin/importar` (proxy); `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (limite de tamanho, formato do backup)

---

## §W4 — Subagente W4 (FINAL): revisão adversarial + E2E + emendas de documentos

Você é um subagente executando a frente W4 da OS-F7, branch `f7-w4`, sobre a main com W1+W2+W3 integrados. Seu papel é **quebrar** a feature antes que o Johnny a use num go-live real — e emendar os documentos da revogação.

### Revisão adversarial (corrija o que achar; registre tudo)

1. **Segurança:** service role nunca em Client Component; RPC com grant correto (anon sem execute); rota e actions exigem operador; o plano jsonb do cliente é revalidado na RPC (tente injetar categoria/estado inválido, patrimônio malformado, filial de outra, plano vazio, plano gigante); CSV com fórmula/injeção (`=cmd`, aspas, `;` no meio de campo com aspas) não quebra parser nem UI; `arquivo_hash` não vaza conteúdo.
2. **Destrutividade:** aplicar 2× seguidas (advisory lock segura?); aplicar em paralelo em 2 abas; falha do upload do backup → NADA aplicado; falha da remoção dos .docx pós-RPC → o que acontece (órfãos no bucket são aceitáveis? registre); conferir que **só a filial alvo** é tocada (crie 2 filiais em DEV, importe numa, confira a outra intacta por contagem).
3. **Relatórios:** após um substituir em DEV — Entradas da semana vazias (marcador funciona), as-of histórico enxerga `dataEntrada`, pendências/dashboard coerentes, snapshot congelado antigo abre.
4. **E2E completo em DEV**: roteiro do go-live de uma filial fictícia do zero (CSV de ~30 linhas cobrindo todos os estados/casos), documentado passo a passo no resumo.
5. **Emendas (parte da execução, não opcional):** `docs/ESPECIFICACAO.md` §10 (nova subseção: import de startup via admin — substitui a regra "não existe importação"), `CLAUDE.md` (regra 2 e o comentário `# (não existe admin/importador...)` da estrutura), `README.md` (status F7 + descrição da feature), `docs/prompts/README.md` (linha F7 → executada via ultracode), `docs/DECISOES.md` (revogação da §10 · delete físico assumido · sem-data marcado fora do período · modo Atualizar adiado — data · contexto · escolha · motivo).

### Aceite W4

- [ ] Cada item da revisão com veredito (ok / corrigido / pendência justificada); correções commitadas
- [ ] E2E documentado e reproduzível; `lint`+`test`+`build` limpos na main
- [ ] Documentos emendados (a contradição "nunca" não existe mais em nenhum doc vivo)

---

## §2 — Decisões do Johnny (16/07/2026, 2ª rodada) — autoridade

1. **Só o import de startup** (Substituir tudo, go-live novo por filial). Modo Atualizar **adiado** — "correção manual é no próprio sistema, linha por linha" (ficha, movimentações, corrigir patrimônio).
2. **A entrada não pode contar como se estivesse entrando agora**: compra inicial com a **data do CSV** (mais antiga válida entre Inclusão/Entrega). Linha **sem data válida** → importa com a "opção sem data": marcador de carga, **fora dos relatórios do período** (aviso no preview com contagem).
3. Compras/ajustes do import levam **sempre** o marcador `import startup dd/MM/yyyy` — startup não é movimentação operacional do período (herda o comportamento validado no F6A-A1); a data real vale para o histórico de estoque (as-of) e para a ficha.
4. Delete físico do Substituir **assumido com o custo explícito** (linha do tempo, termos e anotações da filial somem; snapshots congelados ficam) — salvaguardas obrigatórias: backup automático pré-aplicação, preview com o custo, confirmação digitando o nome da filial, tudo-ou-nada transacional.
5. Alinhamento coluna a coluna: o da `F7-import-csv-ativos.md` §3 (par patrimônio+service tag como chave; Site = filial selecionada senão bloqueia; Situação>Status via ajuste; Termo ignorado; Observação sobrescreve sempre; demais vazios preservam — irrelevante no Substituir, tudo nasce do CSV; GLPI → chamado do ajuste).
6. Tudo-ou-nada com erros exibidos **um a um** para correção manual do CSV; zero bloqueante para aplicar.

## §3 — Aceite geral (orquestrador)

- [ ] Gate verificado; contrato W1↔W2 conferido na integração; ondas na ordem
- [ ] Aceites de W1–W4 completos; revisão adversarial sem pendência crítica
- [ ] Migrations aplicadas em produção com backup de definição prévio; deploy único; smoke de produção **somente leitura** (sem aplicar import real)
- [ ] Zero dependência nova; zero dado real; custo R$ 0
- [ ] Documentos emendados e `DECISOES.md` consolidado; README com F7 concluída (F6C segue na fila, para itens)
- [ ] Resumo final: o que mudou, decisões, pendências — e o roteiro de go-live de filial pronto para o Johnny usar

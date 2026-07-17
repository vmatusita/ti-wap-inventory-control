# OS-F7E (ultracode) — datas dd/MMM · patrimônio vazio como pendência · cards agrupados, execução paralela

Versão **executável** da `F7E-melhorias-import.md` (a OS-F7E, escrita em 17/07/2026 — **autoridade desta execução** junto com as decisões do Johnny na §1 de lá, repetidas na §2 daqui). Objetivo em uma linha: o import de startup passa a **interpretar datas de entrega `dd/MMM`** (ano puxado da inclusão, +1 na virada) datando o **ajuste de reconciliação**; **patrimônio vazio deixa de bloquear** (importa nulo com pendência "sem patrimônio físico", visível na lista de ativos e em `/pendencias`); e os erros `patrimonio_invalido`/`sem_data_entrada` viram **um card por tipo** com sugestão 1-clique do hostname.

**Modo autônomo com acesso total (CLAUDE.md).** Sistema **em produção com dados reais**. Esta OS **não toca** na parte destrutiva do import (backup/confirmação/TOCTOU/advisory lock) além do corpo da RPC descrito no contrato — subagente que se pegar "melhorando" salvaguardas da F7 está fora do escopo: pare e registre.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O orquestrador segue a §1; os blocos §W1–§W5 são os prompts completos dos subagentes. Os subagentes leem `docs/prompts/F7E-melhorias-import.md` (está no repo) para o detalhe fino das suas seções — este arquivo fixa o grafo, o contrato e as fronteiras.

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada (= OS-F7E §0)

(a) **F7B em produção**: migration `0033` aplicada no prod, correções funcionando em `admin/importar`. (b) Working tree limpo; `lint`+`test`+`build` verdes. (c) Próxima migration livre = **`0034`** (a pasta vai até `0033_import_correcoes.sql` — confira antes de numerar). (d) Estrutura conforme CLAUDE.md. Falhou qualquer um → PARE e reporte.

### 1.1 Grafo de execução

```
ONDA 1 (paralela)               INTEGRAÇÃO            ONDA 2 (paralela)                  FINAL
┌─ W1: motor (datas dd/MMM, ─┐  merge W1+W2       ┌─ W3: validators + actions +  ─┐  W5: revisão adversarial
│   patrimônio nulo, cards   │→ contrato conferido │     UI do import (cards)      │→   + E2E dev + emendas docs
│   agrupados + testes)      │  smoke SQL          ├─ W4: pendência fora do import─┤    → 0034 produção → deploy
└─ W2: banco (0034: null +  ─┘  lint/test/build    │     (db:types, lista, ficha,  │    → smoke leitura → resumo
       índice parcial + RPC)                       │     /pendencias, termos)      │
                                                   └── arquivos DISJUNTOS (§1.3) ──┘
```

- **W1 ∥ W2 não compartilham arquivo nenhum** — o acoplamento é o CONTRATO §1.5, fixado para permitir o paralelismo.
- **W3 ∥ W4 também não** (§1.3): W3 vive em `validators/actions/components do import`; W4 vive em `queries/páginas/fichas/termos`. Ambos partem da base integrada da onda 1.
- **Isolamento (precedente F6A/F7B):** worktrees no Windows/OneDrive custam caro — preferência por **subagentes paralelos na mesma árvore**, branch única `f7e`, propriedade de arquivos disjunta como garantia de não-colisão. Worktrees baratos disponíveis → aceitável; decida, registre, siga.
- **`db:types` fica com o W4** (decisão registrada): regenerar `database.ts` torna `ativos.patrimonio` `string | null` e o compilador **aponta sozinho** todos os pontos de exibição a tratar — esse fallout é exatamente o trabalho do W4. Regenerar na onda 1 quebraria o build da integração sem ninguém para consertar.
- Migration em produção e deploy: **só o orquestrador, no final.**

### 1.2 Regras globais

1. Desenvolvimento contra o Supabase **DEV** (projeto de ensaio). Nenhum subagente toca produção.
2. Migration pré-alocada: **`0034_import_melhorias.sql`** — só o W2 cria migration; ninguém edita migration aplicada.
3. Stack fechada, **nenhuma dependência nova**, custo R$ 0, **nenhum dado real** em código/teste/fixture/doc (CSVs fictícios `WAP0001234`/"Fulano"; o CSV real da Matriz NUNCA entra no repo — os números da OS §7.8 são só referência de escala).
4. Convenções: pt-BR, Server Actions + Zod, leituras em `src/lib/queries/`, `security definer` + `set search_path = public`, datas exibidas `dd/MM/yyyy`, `tabular-nums`.
5. Cada subagente entrega: código na branch + checklist autoverificado + rascunho para `docs/DECISOES.md` + pendências; `lint`+`test`+`build` limpos **no seu recorte** (exceção do W4/types explicada na §W4).
6. **Invariantes F7/F7B intocáveis:** régua de bloqueio (descartado e fora-do-formato continuam bloqueantes), tudo-ou-nada, backup pré-aplicação, confirmação pelo nome da filial, TOCTOU por contagens, advisory lock, RLS, `arquivoHash` = sha-256 do arquivo ORIGINAL, correções = ops auditadas revalidadas do zero.

### 1.3 Mapa de propriedade de arquivos (disjunto por construção)

| Dono | Arquivos |
|---|---|
| **W1** | `src/lib/import/deparas.ts` + teste, `tipos.ts`, `plano.ts` + teste, `correcoes.ts` + teste, `index.ts`. Leitura de `patrimonio.ts` (sem editar) |
| **W2** | `supabase/migrations/0034_import_melhorias.sql` (novo). **Nada de TS** (nem `database.ts` — é do W4) |
| **W3** | `src/lib/validators/importar.ts`, `src/lib/actions/importar.ts`, `src/components/admin/importar/**` (`grupos-erros.tsx`, `ops-grupo.ts` + teste, `rotulos.ts`, `importar-wizard.tsx`) |
| **W4** | `src/lib/types/database.ts` (via `db:types`/rota MCP com guard), `src/lib/queries/ativos.ts`, `queries/pendencias-detalhe.ts`, `src/lib/actions/ativos.ts` (só `corrigirPatrimonio`), `src/lib/dominio.ts` (constante nova), `src/components/ativos/**`, `components/pendencias/**`, `src/app/(app)/ativos/**`, `app/(app)/pendencias/**`, `src/lib/termos/**` + `src/lib/actions/termos.ts` (pontos de patrimônio nulo), demais pontos de exibição que o compilador apontar |
| **W5** | Revisão (toca qualquer arquivo para CORRIGIR achados), `docs/ESPECIFICACAO.md` §10.2, `README.md`, `docs/prompts/README.md`, `docs/DECISOES.md`, `src/lib/ajuda/conteudo.ts` |

Conflito raro previsto: se o compilador mandar o W4 a um arquivo do W3, o W4 **não edita** — anota e o orquestrador resolve na integração da onda 2 (na prática não deve ocorrer: o import não lê `ativos.patrimonio` do banco em componente).

### 1.4 Integração e final (orquestrador)

1. Fim da onda 1: merge W1+W2; **conferir o contrato §1.5**: rodar em DEV o smoke SQL do W2 com um plano gerado pelo motor do W1 a partir de CSV fictício com os casos novos (patrimônio nulo com/sem tag, `dataAjuste` nas 3 quedas); `lint`+`test`+`build` verdes (types ainda antigos — ok, o W4 regenera).
2. Lançar **W3 ∥ W4** sobre a base integrada. Merge; `lint`+`test`+`build` verdes na união; smoke manual do W3 e do W4 fazem parte dos aceites deles.
3. Lançar **W5** (revisão adversarial + E2E em DEV + emendas). Aplicar as correções dos achados.
4. **Produção:** backup da definição atual da RPC (arquivo local, padrão F6A) → aplicar `0034` → smoke de leitura: `ativos.patrimonio` nullable (`information_schema.columns`), índice parcial presente (`pg_indexes`), RPC com **mesma assinatura de 4 args, sem overload** (`pg_proc` → 1 linha), `v_pendencias` com contagem inalterada (a view não mudou), tela do import analisa CSV fictício com os casos novos **até o preview — sem aplicar** (padrão F7). Advisors depois.
5. Deploy único Vercel → resumo consolidado: checklists, decisões em `DECISOES.md`, README/prompts/spec/ajuda atualizados, pendências e backlog (SEMPAT do go-live — OS §8).

### 1.5 CONTRATO entre frentes (fixo — mudar = decisão registrada + aviso ao orquestrador)

**Tipos (W1 declara em `src/lib/import/tipos.ts`; W3 consome; W2 espelha no jsonb):**

```ts
AtivoPlano.patrimonio: string | null      // null = sem patrimônio → pendência
AtivoPlano.dataAjuste: string | null      // yyyy-MM-dd: entrega resolvida ?? dataEntrada ?? null
GrupoErro['correcao'] += { kind: 'patrimonio_vazio' }
ValidacaoImport['resumo'] += { semPatrimonio: number }
// aviso novo: tipo 'patrimonio_vazio' (coluna 'Patrimônio')
// candidatos: passa a incluir { linha, patrimonio: null, serviceTag } dos sem-patrimônio-com-tag (F7C ampliado)
```

**Superfície do motor (W1 exporta; W3 usa):** `resolverDataEntrega(raw, inclusaoIso, hoje): ParseDataResult` e `patrimonioVazio(raw): boolean` em `deparas.ts` (+ re-export no `index.ts`). Regras letra a letra na OS §2.1–§2.5 — destaques que são contrato: virada de ano **+1**; resultado futuro = inválida; entrega vazia → ajuste datado pela inclusão; nenhuma data → aviso `sem_data_entrada` como hoje (não bloqueia); chaves de dedupe `∅::<tag>` para nulo-com-tag e **sem dedupe** para nulo-sem-tag; `chaveDoGrupo` devolve `''` para `patrimonio_invalido` e `sem_data_entrada` (card único); a sugestão de hostname **não** entra no motor (a UI deriva de `contexto[linha].hostname` + `canonicalizarPatrimonio`).

**Literal compartilhado:** `PENDENCIA_SEM_PATRIMONIO = 'sem patrimônio físico'` — constante nova em `src/lib/dominio.ts` (**W4 cria**; W3 não usa; o SQL do W2 hard-coda com comentário de sincronia, precedente `OBS_IMPORT_STARTUP`). É o MESMO texto do go-live F4 — a fila de pendências fica uma só.

**RPC (W2):** `importar_ativos_substituir` — **assinatura idêntica** (4 args; ao contrário da F7B, aqui é `create or replace` puro, SEM drop — não há mudança de parâmetros; `pg_proc` continua com 1 linha). Corpo: OS §3.2 (regex só quando patrimônio não-nulo; unicidade espelhando os DOIS índices; insert com `pendencia`; ajuste com `coalesce(dataAjuste, data do import)`; conferência null-safe + agregada para linhas sem chave).

**Actions (W3):** consulta F7C ampliada — além dos pares com patrimônio, buscar em outra filial `patrimonio is null and service_tag in (…)` para os candidatos nulos-com-tag → mesmo bloqueante `patrimonio_em_outra_filial`. **Cap de correções: 300 → 1.500** no Zod (motivo na OS §4.1).

**Fora do import (W4):** bucket novo `'patrimonio'` em `TipoPendencia` (casa `sem patrimônio…` E `patrimônio não canônico…` — cobre os 61 do go-live); `getPendencias`/chips dos relatórios **intactos** (caem em "outras"); filtro `semPatrimonio` na lista de ativos; `corrigirPatrimonio` limpa o trecho `PENDENCIA_SEM_PATRIMONIO` de `ativos.pendencia` preservando outros trechos (`;`).

---

## §W1 — Subagente W1: motor (datas dd/MMM · patrimônio nulo · agrupamento)

Você é um subagente executando a frente W1 da OS-F7E. Modo autônomo. **Só módulos puros + testes** em `src/lib/import/` — nada de banco, action ou UI. Leia `docs/prompts/F7E-melhorias-import.md` §2 (autoridade do detalhe) e o contrato §1.5 acima. Leia antes: `deparas.ts`, `tipos.ts`, `plano.ts`, `correcoes.ts` e `src/lib/patrimonio.ts` (não editar este último).

### Entregas

1. **`deparas.ts`**: `MESES_ABREV` (jan–dez → 1–12; caixa qualquer; ponto final opcional), `resolverDataEntrega(raw, inclusaoIso, hoje)` (OS §2.1 — dd/MM/aaaa delega a `parseData`; dd/MMM exige inclusão válida, ano da inclusão, **+1 quando (mês, dia) < (mês, dia) da inclusão**, valida dia/mês reais, marca `futura`), `PATRIMONIO_VAZIO`/`patrimonioVazio` (OS §2.2 — `VAZIOS` ∪ `sem patrimonio`/`sem patrimônio` via `normalizarTexto`). `parseData` **não muda**.
2. **`tipos.ts`**: contrato §1.5 letra a letra (patrimônio nullable, `dataAjuste`, kind e resumo novos). Comentar a ampliação do contrato §1.5 da F7/F7B.
3. **`plano.ts`** (`montarPlanoImport` + `validarCsvImport`): OS §2.4 — aviso `patrimonio_vazio` (não bloqueante) com patrimônio nulo; `patrimonio_invalido` intacto para o resto; entrega resolvida participa da `dataEntrada` (regra "mais antiga válida" inalterada); `dataAjuste = entrega ?? dataEntrada ?? null`; dedupe com as chaves do contrato; `candidatos` inclui os nulos-com-tag; `resumo.semPatrimonio`.
4. **`correcoes.ts`**: `chaveDoGrupo` → `''` para `patrimonio_invalido` e `sem_data_entrada`; `correcaoDoGrupo` → `{ kind: 'patrimonio_vazio' }`. Nada além disso aqui.
5. **`index.ts`**: exportar a superfície nova do contrato.

### Regras que NÃO se dobram

`descartado` e fora-do-formato continuam bloqueantes. Linha sem Site E sem patrimônio continua descartada (`linha_sem_chave`) — patrimônio "vazio-na-prática" (`n/a`…) com Site preenchido **não** é linha descartada, é ativo com aviso. Datas corrigidas pela tela continuam `dd/MM/aaaa` (dd/MMM é só do arquivo). Nada de import de `scripts/import/*`. Sem dependência nova.

### Testes (Vitest — o grosso da frente; casos = OS §2.6)

`resolverDataEntrega`: `18/nov` com inclusão `01/11/2024` → `2024-11-18`; `21/jan` com `18/12/2024` → `2025-01-21` (+1); resultado futuro → `futura`; inclusão inválida/vazia → inválida; `31/fev` inválida; `Nov.`/caixa; vazio → null. `montarPlanoImport`: variantes de vazio (`""`, `-`, `n/a`, `SEM PATRIMONIO`) → nulo + aviso + `semPatrimonio` no resumo; só-números → bloqueante; dedupe `∅::tag` colide, nulo-sem-tag não; `dataAjuste` nas 3 quedas; entrega resolvida participando da `dataEntrada`. Agrupamento: N valores distintos de `patrimonio_invalido` → 1 grupo; idem `sem_data_entrada` (`""` + `#######` + lixo juntos). **Retrocompatibilidade:** CSV sem os casos novos → resultado idêntico ao da F7B campo a campo (suite existente verde sem editar expectativa, exceto campos novos do retorno).

### Aceite W1

- [ ] Contrato §1.5 exportado e tipado; testes acima passando; suite antiga verde
- [ ] Zero banco/UI/action; zero dependência nova; zero dado real
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (regra +1, quedas do `dataAjuste`, chaves de dedupe)

---

## §W2 — Subagente W2: banco — migration 0034 (patrimônio nulo + índice parcial + RPC)

Você é um subagente executando a frente W2 da OS-F7E. Modo autônomo. Migration **em DEV** (o orquestrador aplica em produção). Consome o CONTRATO §1.5 — não o altere. Leia `docs/prompts/F7E-melhorias-import.md` §3 e a migration `0032_import_rpcs.sql` inteira (o corpo que você vai emendar) + `0033` antes de escrever uma linha. **Não toque em arquivo TS** (o `db:types` é do W4).

### Entregas — `supabase/migrations/0034_import_melhorias.sql`

1. `alter table public.ativos alter column patrimonio drop not null;` + índice parcial da OS §3.1 (tag = identidade quando não há patrimônio; nulo-sem-tag = linhas livres). Comentários generosos explicando por que o índice composto existente não cobre nulos.
2. RPC: **`create or replace` puro** (assinatura idêntica — SEM drop; não repetir o gotcha da F7B que aqui não existe). Emendas exatas da OS §3.2: 1d regex condicional; 1e unicidade espelhando os DOIS índices (com-patrimônio pelo par; nulos-com-tag pela tag; nulos-sem-tag livres); 4a insert com `pendencia = 'sem patrimônio físico'` quando nulo (comentário de sincronia com `PENDENCIA_SEM_PATRIMONIO` em `dominio.ts`); 4c `coalesce(nullif(e->>'dataAjuste','')::date, v_data_import)`; 5b/5c null-safe (`is not distinct from`) + **conferência agregada** (estado × colaborador) para as linhas sem patrimônio E sem tag. Grants/revokes reafirmados como na 0032.
3. No fim, **comentado**, o smoke do orquestrador: transação com rollback, plano fictício de 4 ativos — 1 normal, 1 nulo-com-tag (vira pendência), 1 nulo-sem-tag, 1 com `dataAjuste` de entrega — conferindo estado, `pendencia`, data do ajuste e as violações esperadas (2 nulos com a MESMA tag → erro do índice parcial).
4. Aplicar em DEV e rodar o smoke. `v_pendencias` deve passar a listar os nulos criados no smoke **sem** mudança na view (ela já filtra `pendencia is not null`) — provar com uma query no smoke.

### Aceite W2

- [ ] Em DEV: coluna nullable, índice parcial ativo (colisão provada), RPC 1 linha no `pg_proc` (sem overload), smoke com rollback limpo
- [ ] Nenhum objeto além dos descritos; RLS/grants idênticos; view intacta (contagem antes = depois, fora o smoke)
- [ ] Migration comentada; rascunho para `DECISOES.md` (índice parcial, conferência agregada); **nenhum arquivo TS tocado**

---

## §W3 — Subagente W3 (ONDA 2): validators + actions + UI do import

Você é um subagente executando a frente W3 da OS-F7E, **sobre a base integrada com W1+W2**. Modo autônomo. Sem migration, sem deploy, sem tocar nos arquivos do W4 (§1.3). Leia `docs/prompts/F7E-melhorias-import.md` §§4–5 e o contrato §1.5. Leia antes: `grupos-erros.tsx`, `ops-grupo.ts`, `rotulos.ts`, `importar-wizard.tsx`, `actions/importar.ts`, `validators/importar.ts`.

### O que construir

1. **`validators/importar.ts`**: `AtivoPlano` com patrimônio nullable + `dataAjuste`; **cap 300 → 1.500** (comentário com o motivo da OS §4.1).
2. **`actions/importar.ts`**: consulta F7C ampliada para os nulos-com-tag (§1.5); repasse de `resumo.semPatrimonio` e `dataAjuste` (nenhuma lógica nova além do repasse).
3. **UI**: OS §5 —
   - `CardPatrimonio` (agora card único): botão outline **"usar WAP0001234"** por linha quando `canonicalizarPatrimonio(contexto[linha].hostname)` resolve → preenche o rascunho (F7D aplica via seção/global). Sem hostname aproveitável → input como hoje.
   - **`CardPatrimonioVazio`** novo (aviso): texto da OS §5.1; inputs opcionais por linha com "Corrigir" **por linha**; **fora** do botão de seção e do lote global (preencher é opcional — doutrina do card `duplicata`); remover linha disponível.
   - `CardData`: mensagem nova ("linhas com entrega dd/MMM resolvem sozinhas quando a inclusão ganhar data"); controles inalterados.
   - `ops-grupo.ts`: `patrimonio_vazio` → `opsDoGrupo` emite só linhas preenchidas válidas; `grupoPronto` = false; `faltamNoGrupo` = 0. Teste.
   - `rotulos.ts` (rótulo novo) e `importar-wizard.tsx` (`tiposAviso` += `patrimonio_vazio`; resumo mostra "N sem patrimônio (importam com pendência)").

### Aceite W3

- [ ] Smoke manual em DEV com CSV fictício: 117-em-1-card simulado (vários fora-do-formato → UM card), sugestão do hostname preenche com 1 clique, seção/global aplicam; card de vazio importa sem preencher e o ativo nasce com pendência; datas dd/MMM datam o ajuste (conferir na linha do tempo)
- [ ] Sugestão que criaria duplicata é acusada pela reanálise (o motor segue o juiz); >300 e ≤1.500 ops passam; >1.500 barra com mensagem clara
- [ ] Import sem os casos novos idêntico ao comportamento F7B; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W4 — Subagente W4 (ONDA 2): pendência fora do import (types · lista · ficha · /pendencias · termos)

Você é um subagente executando a frente W4 da OS-F7E, **sobre a base integrada com W1+W2**, em paralelo ao W3 — **não toque nos arquivos dele** (§1.3). Modo autônomo. Leia `docs/prompts/F7E-melhorias-import.md` §6 e o contrato §1.5.

### O que construir

1. **Regenerar `src/lib/types/database.ts`** (`npm run db:types`; projeto não linkado → rota MCP com o guard do `gen-types.ts`, precedente F6A). `ativos.patrimonio` vira `string | null` — **a lista de erros de compilação resultante é o seu mapa de trabalho**: trate TODOS os pontos (exibição "— sem patrimônio", ordenação null-last, busca null-safe). Ponto fora dos seus arquivos (§1.3) → anote para o orquestrador, não edite.
2. **`dominio.ts`**: `PENDENCIA_SEM_PATRIMONIO = 'sem patrimônio físico'` (comentário de sincronia com a RPC).
3. **Lista de ativos** (`queries/ativos.ts`, `ativos-filtros.tsx`, `ativos-table.tsx`): badge "sem patrimônio" + filtro `semPatrimonio` (`.is('patrimonio', null)`).
4. **Ficha** (`ativos/[id]`, `corrigir-patrimonio-dialog.tsx`, `actions/ativos.ts#corrigirPatrimonio`): título/exibição com nulo; diálogo abre a partir de nulo (anotação "de — para WAP…"); ao corrigir, **limpar o trecho `PENDENCIA_SEM_PATRIMONIO`** de `ativos.pendencia` preservando outros trechos (`;`). Zod ajustado.
5. **`/pendencias`** (`pendencias-detalhe.ts`, `pendencias-filtros.tsx`): bucket `'patrimonio'` (casa `sem patrimônio…` e `patrimônio não canônico…`); filtro na UI (atenção à sintaxe `.or()`/`ilike` do PostgREST); `getPendencias` dos relatórios **intacto**.
6. **Termos F5A** (`src/lib/termos/`, `actions/termos.ts`): patrimônio nulo ordena por último e imprime "sem patrimônio" no docx; conferir preview.
7. **Fluxo de movimentação**: garantir que ativo sem patrimônio é encontrável na busca (service tag/hostname); se a busca for só por patrimônio, ampliar (arquivo de queries é seu).

### Aceite W4

- [ ] `build` verde DEPOIS do types novo (zero `!`/cast para esconder nulo — tratamento real em cada ponto)
- [ ] Smoke manual em DEV: ativo com patrimônio nulo criado via SQL de teste aparece na lista (badge + filtro), em `/pendencias` (bucket patrimônio, junto dos legados "não canônico"), é movimentável, entra em termo com "sem patrimônio", e corrigir o patrimônio pela ficha limpa a pendência (e some do bucket)
- [ ] Viewer por senha: fronteira intacta (`fronteira-viewer.test.ts` verde; /pendencias segue operador-only; chips dos relatórios inalterados)
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (bucket, limpeza da pendência, busca ampliada)

---

## §W5 — Subagente W5 (FINAL): revisão adversarial + E2E + emendas

Você é um subagente executando a frente W5 da OS-F7E, sobre a base com W1–W4 integrados. Seu papel é **quebrar** a feature antes do próximo go-live de filial — e emendar os documentos. Corrija o que achar; registre tudo (ok / corrigido / pendência justificada).

1. **Datas:** tabela de casos na unha contra `resolverDataEntrega` (virada +1, mesmo dia, futuro, bissexto `29/fev`, inclusão inválida); provar que a entrega resolvida **nunca** antecipa a `dataEntrada` indevidamente (min é sobre válidas; ajuste ≥ compra na linha do tempo); relatórios continuam excluindo a carga pelo prefixo (datas novas NÃO vazam para os relatórios do período).
2. **Patrimônio nulo:** colisões dos DOIS índices provadas em DEV (par com patrimônio; tag entre nulos; nulos-sem-tag livres); conferência agregada da RPC com 2 nulos-sem-tag de estados/colaboradores distintos (join linha-a-linha seria ambíguo — a agregada tem que fechar); F7C ampliado acusa nulo-com-tag existente noutra filial; injeção de plano com patrimônio `''` (string vazia ≠ null) → rejeitado.
3. **UI/cap:** 1.501 ops barradas; card de vazio não trava o lote global; sugestão do hostname jamais aplica sem clique; XSS/injeção nos valores (`=cmd`, aspas, `;`) inertes.
4. **Invariantes F7/F7B (regra §1.2.6):** diff da RPC 0032→0034 é só o descrito; TOCTOU/lock/backup/confirmação intactos; import sem casos novos byte-a-byte igual; `arquivoHash` inalterado.
5. **E2E completo em DEV:** CSV fictício ~18 linhas com TODOS os casos (OS §7.1–§7.5) → corrigir pela tela (1 clique de hostname incluso) → aplicar → conferir ativos/estados/datas do ajuste/pendências/log; ficha corrige um nulo e a pendência some; baixar CSV corrigido → reimportar limpo. Documentar o roteiro no resumo.
6. **Emendas (parte da execução):** `docs/ESPECIFICACAO.md` §10.2 (patrimônio opcional com pendência; datas dd/MMM; agrupamento por tipo); `README.md` (linha F7E); `docs/prompts/README.md`; `src/lib/ajuda/conteudo.ts` (ajuda do import); `docs/DECISOES.md` (entrada `2026-07-17 · F7E`: decisões da §2 + técnicas — cap 1.500, índice parcial, conferência agregada, types com o W4, backlog SEMPAT).

### Aceite W5

- [ ] Cada item com veredito; correções commitadas; E2E documentado e reproduzível
- [ ] Documentos emendados; `lint`+`test`+`build` limpos na base final

---

## §2 — Decisões do Johnny (17/07/2026) — autoridade (= OS-F7E §1)

1. **Entrega `dd/MMM` interpretada com ano da inclusão → data do ajuste** (saída/posse na linha do tempo); `dataEntrada` mantém a regra atual.
2. **Virada de ano: +1** quando (mês, dia) da entrega < inclusão; futuro = inválida.
3. **Entrega vazia → data da inclusão; nenhuma → aviso corrigível** (não bloqueia; carga sem data, como hoje).
4. **Patrimônio vazio/n-a/"sem patrimônio" → importa NULO com pendência** 'sem patrimônio físico' + aviso; visível na lista de ativos e em `/pendencias`; corrige-se na ficha (F6B).
5. **Só-números/não-canonicalizável → segue BLOQUEANTE**, com sugestão 1-clique do hostname (nada aceito sem confirmação; a não-inferência de 16/07 vale para o automático).
6. **Um card por tipo de erro** (`patrimonio_invalido`, `sem_data_entrada`), correção em lote pela F7D.

## §3 — Aceite geral (orquestrador)

- [ ] Gate §1.0; contrato §1.5 conferido na integração (smoke SQL do W2 com plano do W1); ondas na ordem; propriedade §1.3 respeitada
- [ ] Aceites W1–W5 completos; revisão adversarial sem pendência crítica
- [ ] `0034` em produção com backup de definição prévio; smoke de produção **somente leitura** (§1.4.4); advisors sem novidade além do aceito
- [ ] Zero dependência nova; zero dado real; custo R$ 0; invariantes F7/F7B intactas
- [ ] Documentos emendados; `DECISOES.md` consolidado; README com F7E concluída
- [ ] Resumo final: o que mudou, decisões, pendências, backlog (SEMPAT) — e o import pronto para o próximo go-live de filial

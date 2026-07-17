# OS-F7B (ultracode) — Correção de erros do import na tela, execução paralela

Versão **executável** da `F7B-correcao-erros-import.md` (a OS-F7B, escrita em 17/07/2026 — **autoridade desta execução** junto com as decisões do Johnny na §2 de lá e daqui). Objetivo: no passo Preview do `admin/importar`, erros e avisos viram correções **na própria tela** — em massa para valores repetidos, pontuais com contexto — com reanálise automática pelo motor da F7. O CSV original nunca muda; correções são operações auditadas.

**Modo autônomo com acesso total (CLAUDE.md).** Sistema **em produção com dados reais**. Esta OS **não toca** na parte destrutiva do import (backup/confirmação/RPC de delete/TOCTOU) além de acrescentar um parâmetro de auditoria à RPC — qualquer subagente que se pegar "melhorando" as salvaguardas da F7 está fora do escopo: pare e registre.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O orquestrador segue a §1; os blocos §W1–§W4 são os prompts completos dos subagentes. Os subagentes leem `docs/prompts/F7B-correcao-erros-import.md` (está no repo) para o detalhe fino das suas seções — este arquivo fixa o grafo, o contrato e as fronteiras.

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada (= OS-F7B §0)

(a) **F7 efetivamente em produção**: migrations `0031`/`0032` aplicadas no prod, tela `admin/importar` no ar, `import_logs` existente. O `README.md` ainda diz "gate: aguarda aval do Johnny" — o Johnny confirmou em 17/07/2026 que está no ar; conferido o fato, a atualização da linha é do W4. Se NÃO estiver no ar, PARE e reporte. (b) Working tree limpo, `lint`+`test`+`build` verdes. (c) Próxima migration livre = `0033` (a pasta vai até `0032_import_rpcs.sql` — confira antes de numerar).

### 1.1 Grafo de execução

```
ONDA 1 (paralela)                INTEGRAÇÃO               ONDA 2 (serial)          FINAL
┌─ W1: motor de correções ──┐   merge W1+W2           W3: validators + actions  W4: revisão adversarial
│   (ops/grupos/sugestões/  │→  contrato conferido →      + UI do passo 3    →     + E2E dev + emendas docs
│   serialização + testes)  │   db:types · lint/test      (wizard/cards/undo)      → 0033 produção → deploy
└─ W2: banco (0033: coluna ─┘                                                      → smoke leitura → resumo
       + RPC c/ p_correcoes)
```

- **W1 ∥ W2 não compartilham nenhum arquivo** — o acoplamento é o CONTRATO da §1.5, fixado exatamente para permitir o paralelismo.
- **Isolamento (adaptação registrada na F6A):** worktrees no Windows/OneDrive custam caro (node_modules não atravessa de graça). Preferência: **subagentes paralelos na mesma árvore**, branch única `f7b`, propriedade de arquivos DISJUNTA (§1.3) como garantia de não-colisão. Se o ambiente tiver worktrees baratos, `f7b-w1`/`f7b-w2` são aceitáveis — decida, registre, siga.
- **W3** integra os dois (única frente que toca action/UI). **W4** é o revisor adversarial — obrigatório numa feature que mexe na porta de entrada de dados de produção.
- Migration em produção e deploy: **só o orquestrador, no final.**

### 1.2 Regras globais

1. Desenvolvimento contra o Supabase **DEV** (projeto de ensaio). Nenhum subagente toca produção.
2. Migration pré-alocada: **`0033_import_correcoes.sql`** — só o W2 cria migration; ninguém edita migration aplicada.
3. Stack fechada, **nenhuma dependência nova** (Levenshtein é função própria de ~15 linhas no W1), custo R$ 0, **nenhum dado real** em código/teste/fixture (CSVs fictícios `WAP0001234`/"Fulano").
4. Convenções: pt-BR, Server Actions + Zod, leituras em `src/lib/queries/`, `security definer` com `set search_path = public`, migration nova nunca edita aplicada.
5. Cada subagente entrega: código na branch + checklist autoverificado + rascunho para `docs/DECISOES.md` + pendências; `lint`+`test`+`build` limpos no seu recorte.
6. **Invariantes da F7 intocáveis:** régua de bloqueio (descartado continua bloqueante), tudo-ou-nada, backup pré-aplicação, confirmação pelo nome da filial, revalidação TOCTOU por contagens, RLS, advisory lock, `arquivoHash` = sha-256 do arquivo ORIGINAL.

### 1.3 Mapa de propriedade de arquivos (disjunto por construção)

| Dono | Arquivos |
|---|---|
| **W1** | `src/lib/import/correcoes.ts` + `correcoes.test.ts` (novos), `src/lib/import/tipos.ts`, `deparas.ts` + `deparas.test.ts`, `plano.ts` + `plano.test.ts`, `parse.ts` (só exportar `mapaColunas`), `index.ts`. Leitura de `src/lib/patrimonio.ts` (sem editar) |
| **W2** | `supabase/migrations/0033_import_correcoes.sql` (novo), `src/lib/types/database.ts` via `db:types` (ou rota MCP com guard, precedente F6A) |
| **W3** | `src/lib/validators/importar.ts` (novo), `src/lib/actions/importar.ts`, `src/lib/queries/import-logs.ts`, `src/app/(app)/admin/importar/page.tsx`, `src/components/admin/importar/**` (wizard + novos `grupos-erros.tsx`, `correcoes-aplicadas.tsx`; `tabela-erros.tsx` permanece) |
| **W4** | Revisão (toca qualquer arquivo para CORRIGIR achados), `docs/ESPECIFICACAO.md` §10.2, `README.md` (linha F7 + linha F7B), `docs/prompts/README.md`, `docs/DECISOES.md` |

### 1.4 Integração e final (orquestrador)

1. Fim da onda 1: merge/integração W1+W2; **conferir o contrato** (§1.5): rodar em DEV o smoke SQL do W2 com um plano + correções gerados pelo motor do W1; `db:types` regenerado sem diff inesperado; `lint`+`test`+`build`.
2. Lançar **W3** sobre a base integrada. Merge, re-teste (o smoke manual do W3 em DEV faz parte do aceite dele).
3. Lançar **W4** (revisão adversarial + E2E em DEV + emendas de documentos). Aplicar correções dos achados.
4. **Produção:** backup da definição atual de `importar_ativos_substituir` (arquivo local, padrão F6A) → aplicar `0033` → smoke de leitura: função com **4 parâmetros e sem overload sobrando** (`select proname, pronargs from pg_proc where proname = 'importar_ativos_substituir'` → 1 linha, 4 args), coluna `import_logs.correcoes` presente, tela abre, análise de CSV fictício com erro mostra grupos e a correção funciona **até o preview — sem aplicar** (produção não tem filial de teste; padrão F7).
5. Deploy único Vercel → resumo consolidado: checklists, decisões em `DECISOES.md`, README/prompts atualizados (F7B concluída).

### 1.5 CONTRATO entre frentes (fixo — mudou, é decisão registrada + aviso ao orquestrador)

**Tipos (W1 declara em `src/lib/import/tipos.ts`; W3 consome; W2 espelha no jsonb):** exatamente os da OS-F7B §3 — `CampoEditavel`, `CorrecaoImport` (ops `substituir` | `substituir_estado` | `editar` | `remover_linha`), `GrupoErro` (com o discriminado `correcao.kind`) e o `ValidacaoImport` ampliado (`grupos`, `contexto`, `correcoes: { aplicadas, porOp }`, `resumo.linhasRemovidas`). Copie de lá letra a letra; as 9 regras da OS-F7B §3 são parte do contrato (destaques: patrimônio/service tag **nunca em massa**; `substituir` em site só com `mapearUnidade(de) === null` e `para` = filial selecionada; estado nunca resolve para `descartado`; ordem da lista, no-op conta 0; cap 300; correções zeram ao trocar arquivo/filial; linhas `descartadas` fora).

**Superfície do motor (W1 exporta via `src/lib/import/index.ts`; W3 só usa isto):**

```ts
validarCsvImport(conteudo: ArrayBuffer|Uint8Array, filial: FilialSelecionada,
                 hoje?: string, correcoes?: CorrecaoImport[]): ValidacaoImport
csvCorrigido(conteudo: ArrayBuffer|Uint8Array, correcoes: CorrecaoImport[]): string
  // fachada: decodificar → parseCsv → aplicarCorrecoes → reserializar (header/ordem
  // originais, `;`, CRLF, aspas escapadas, SEM linhas removidas, SEM BOM — quem baixa põe o BOM)
SITUACAO_CANONICA: Record<Exclude<StatusAtivo,'descartado'>, string>   // deparas.ts
parseData, mapearUnidade, canonicalizarPatrimonio (re-export)          // p/ Zod e preview da UI
```

**Divisão da validação de ops (refina OS-F7B §4.1/§5.1 — decisão registrada):** o **Zod do W3** (`validators/importar.ts`) faz o estrutural — shape da union, whitelist de campos, cap 300, `para` não vazio, datas via `parseData` (válida, não futura), `substituir` proibida para patrimônio/serviceTag. As checagens que dependem de CSV/layout/filial (site conhecido em `substituir`, estado→descartado, campo fora do layout) ficam **no motor do W1**: op que viole vira **bloqueante `tipo: 'correcao_invalida'`** na reanálise (linha 0, coluna = campo da op) — nunca silencioso, nunca aplicado. A UI é a segunda linha (nem oferece o inválido).

**RPC (W2):** `importar_ativos_substituir(p_plano jsonb, p_backup_path text, p_contagens jsonb, p_correcoes jsonb default '[]'::jsonb)` — assinatura única (a de 3 args é DROPADA). `import_logs` ganha `correcoes jsonb not null default '[]'`.

**Actions (W3):** `validarImport` lê `formData.get('correcoes')` (JSON; ausente = `[]`); `aplicarImport` ganha `correcoes` no input (auditoria: vai como `p_correcoes`; NÃO altera o fluxo — o plano já vem corrigido) e devolve `correcoesAplicadas`; nova `baixarCsvCorrigido(formData)` → `{ ok: true; nome: string; conteudo: string }`.

---

## §W1 — Subagente W1: motor de correções (puro + testes)

Você é um subagente executando a frente W1 da OS-F7B. Modo autônomo. **Só módulos puros + testes** em `src/lib/import/` — nada de banco, action ou UI. Leia `docs/prompts/F7B-correcao-erros-import.md` §§3–4 e 8 (autoridade do detalhe) e o contrato §1.5 acima. A F7 construiu o motor que você amplia: `tipos.ts`, `parse.ts`, `deparas.ts`, `plano.ts` — leia-os antes.

### Entregas

1. **`tipos.ts`**: acrescentar `CampoEditavel`, `CorrecaoImport`, `GrupoErro` e ampliar `ValidacaoImport`/`resumo` (OS-F7B §3, letra a letra). Comentar que o CONTRATO §1.5 da F7 foi ampliado pela F7B.
2. **`correcoes.ts`** (novo): `aplicarCorrecoes(csv: CsvCru, correcoes, mapa) → { csv; porOp: number[]; linhasRemovidas; invalidas: ErroImport[] }` operando nas CÉLULAS, antes de `extrairRegistros` (constante única `COLUNA_POR_CAMPO` espelhando os nomes de `extrairRegistros`: `serviceTag→'service tag'`, `dataInclusao→'data de inclusao'`…, testada); `validarCorrecao(op, layoutCols, filialNome) → string | null` (regras semânticas — usada pelo próprio motor para gerar os bloqueantes `correcao_invalida` do contrato); `agruparErros(...) → GrupoErro[]` (tipo+valor cru; estado agrupa pelo par `status␟situacao`; `site_desconhecido` × `site_outra_filial` via `mapearUnidade`); `sugerirValor(valor, candidatos) → string | null` (Levenshtein próprio; distância ≤ 2 e ≤ 40% do comprimento); serialização para o `csvCorrigido` da fachada (round-trip: sem correções ≡ conteúdo lógico original).
3. **`deparas.ts`**: `SITUACAO_CANONICA` (7 estados, sem descartado) + teste de ciclo: cada valor volta ao estado via `estadoPlanilha`.
4. **`plano.ts`**: `validarCsvImport` ganha o 4º parâmetro opcional (chamadas existentes intactas); pipeline decodificar → `parseCsv` → `detectarLayout` → **`aplicarCorrecoes`** → `extrairRegistros` → validação como hoje → `agruparErros`/`contexto`/`correcoes`/`linhasRemovidas` no retorno; bloqueante novo `plano_vazio` quando todas as linhas foram removidas; com `header_invalido`, correções não se aplicam e `grupos` = 1 grupo `kind: 'nenhuma'`.
5. **`parse.ts`**: exportar `mapaColunas` (sem outra mudança). **`index.ts`**: exportar a superfície do contrato (inclusive a fachada `csvCorrigido`).

### Regras que NÃO se dobram

Escrever célula além do comprimento do array → preencher gap com `''`. Op sobre linha removida/valor que não casa → no-op contagem 0. Campo fora do layout (`dataEntrega` no `cd`) → no-op 0 (a UI nem oferece; se vier, não é erro). Correções não alcançam linhas `descartadas`. `contexto` só das linhas com erro/aviso. Nada de import de `scripts/import/*`.

### Testes (Vitest — o grosso da frente; casos mínimos = OS-F7B §10 + estes)

Cada op aplica e conta certo; ordem determinística; no-ops; `substituir` de site conhecido → `correcao_invalida`; estado para descartado → `correcao_invalida`; ciclo `SITUACAO_CANONICA`; datas inválidas/futuras; correção criando duplicata → `par_duplicado` na reanálise; remoção resolvendo duplicata; `plano_vazio`; agrupamento e sugestões (typo próximo sugere, distante não); round-trip do `csvCorrigido` (aspas/`;`/linhas removidas/header intacto); **retrocompatibilidade**: `validarCsvImport` sem correções ≡ comportamento atual (suite existente segue verde sem edição de expectativa, exceto os campos novos do retorno).

### Aceite W1

- [ ] Superfície do contrato exportada e tipada; testes acima passando; suite antiga verde
- [ ] Zero banco/UI/action; zero dependência nova; zero dado real
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (COLUNA_POR_CAMPO, `correcao_invalida`, limiar da sugestão)

---

## §W2 — Subagente W2: banco — migration 0033 (coluna + RPC com p_correcoes)

Você é um subagente executando a frente W2 da OS-F7B. Modo autônomo. Migration **em DEV** (o orquestrador aplica em produção). Consome o CONTRATO §1.5 — não o altere. Leia `docs/prompts/F7B-correcao-erros-import.md` §6 e a migration `0032_import_rpcs.sql` inteira antes de escrever uma linha.

### Entregas — `supabase/migrations/0033_import_correcoes.sql`

1. `alter table public.import_logs add column correcoes jsonb not null default '[]'::jsonb;` (aditiva; linhas antigas ficam `[]`).
2. **Gotcha central:** `create or replace` com lista de parâmetros diferente cria **OVERLOAD**. Então: `drop function public.importar_ativos_substituir(jsonb, text, jsonb);` e `create function` com `(p_plano jsonb, p_backup_path text, p_contagens jsonb, p_correcoes jsonb default '[]'::jsonb)`. **Corpo copiado da 0032** — as ÚNICAS mudanças: validar `jsonb_typeof(p_correcoes) = 'array'` (senão `raise exception` pt-BR) e incluir `correcoes` no `insert into import_logs`. `security definer`, `set search_path = public`, revoke `public`/`anon`, grant execute `authenticated` — espelhados da 0032, reaplicados (o drop os perdeu).
3. Comentários generosos; no fim, **comentado**, o smoke SQL do orquestrador: plano fictício de 2 ativos + `p_correcoes` de exemplo numa transação com rollback + a query de unicidade (`pg_proc` → 1 linha, `pronargs = 4`).
4. Aplicar em DEV; regenerar `src/lib/types/database.ts` (`npm run db:types`; se o projeto não estiver linkado, rota MCP com o guard do `gen-types.ts` — precedente F6A, diff cirúrgico).

### Aceite W2

- [ ] Em DEV: função única com 4 args (query do `pg_proc`); chamada com 3 args continua funcionando (default) e com 4 grava `correcoes` no log; rollback do smoke limpo
- [ ] Coluna nova presente; RLS/grants idênticos aos da 0032 (anon sem execute); nenhum outro objeto tocado
- [ ] `db:types` regenerado; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (drop/recreate + motivo)

---

## §W3 — Subagente W3 (ONDA 2): validators + actions + UI do passo 3

Você é um subagente executando a frente W3 da OS-F7B, **sobre a base já integrada com W1+W2**. Modo autônomo. Sem migration, sem deploy. Leia `docs/prompts/F7B-correcao-erros-import.md` §§5, 7 e 8 (autoridade do detalhe de UX) e o contrato §1.5. O wizard atual (`importar-wizard.tsx`) já guarda o `File` em memória entre passos — o ciclo reenvia arquivo + correções acumuladas.

### O que construir

1. **`src/lib/validators/importar.ts`** (novo): schema Zod de `CorrecaoImport[]` — o recorte ESTRUTURAL do contrato (union discriminada, whitelist de campos, cap 300, `para` não vazio, datas via `parseData` do motor, patrimônio/serviceTag proibidos em `substituir`). Único lugar do schema; as duas actions importam daqui; o wizard importa só o tipo.
2. **`src/lib/actions/importar.ts`**: `validarImport` lê e valida `correcoes` do FormData e repassa ao motor; `aplicarImport` ganha `correcoes` no input (Zod), passa `p_correcoes` na RPC, retorna `correcoesAplicadas`; nova action `baixarCsvCorrigido(formData)` (mesmas guardas de operador/extensão/tamanho; usa a fachada `csvCorrigido`; devolve `{ ok, nome, conteudo }` — o client baixa com BOM, padrão do projeto).
3. **UI (`src/components/admin/importar/`)**: estado `correcoes: CorrecaoImport[]` no wizard; `analisar` passa a enviar as correções; trocar arquivo ou filial **zera** a lista. Componentes novos `grupos-erros.tsx` (um card por `GrupoErro`, controle por `correcao.kind` conforme a tabela da OS-F7B §7 — Select com sugestão pré-selecionada para categoria/estado, ação única para site, Input com preview de `canonicalizarPatrimonio` para patrimônio, duplicatas lado a lado com `contexto`, data em massa, colaborador pontual, `nenhuma` informativo) e `correcoes-aplicadas.tsx` (painel com descrição legível, `porOp[i]` linhas afetadas, badge "sem efeito" para 0, **Desfazer** → remove da lista → reanálise). Barra de status "X bloqueantes · Y avisos · Z removidas · N correções"; zero bloqueante → banner verde, Avançar habilita (lógica `aplicavel` e termos multi-filial INTACTAS). Botão "Baixar CSV corrigido" ao lado do "Baixar lista de erros". Passo 5 e histórico (`import-logs.ts` + `page.tsx`) mostram a contagem de correções. Pending states em tudo ("Reanalisando…"); pt-BR; `tabular-nums`.

### Aceite W3

- [ ] Smoke manual em DEV com CSV fictício sujo: cada tipo de erro corrigido PELA TELA (massa e pontual), reanálise automática, desfazer funciona, zero bloqueante → aplicar → ativos certos e `import_logs.correcoes` preenchido
- [ ] `correcao_invalida` do motor aparece como bloqueante legível se uma op inválida for injetada por fora da UI
- [ ] CSV corrigido baixado reimporta limpo na primeira análise; import SEM correções idêntico ao comportamento F7
- [ ] Viewer por senha continua sem acesso a `/admin/importar`; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W4 — Subagente W4 (FINAL): revisão adversarial + E2E + emendas

Você é um subagente executando a frente W4 da OS-F7B, sobre a base com W1+W2+W3 integrados. Seu papel é **quebrar** a feature antes do próximo go-live de filial — e emendar os documentos. Corrija o que achar; registre tudo (ok / corrigido / pendência justificada).

1. **Segurança/robustez:** injete pela API (fora da UI): op com campo fora da whitelist, `substituir` de patrimônio, site conhecido, estado→descartado, 301 ops, `para` com fórmula (`=cmd`)/aspas/`;` — nada aplica sem virar erro claro; valores corrigidos passam pelas MESMAS normalizações de célula digitada; nenhum conteúdo de CSV em log de servidor; `arquivoHash` continua o do arquivo original.
2. **Invariantes F7 (regra §1.2.6):** backup/confirmação/contagens TOCTOU/advisory lock/RLS intocados — diff da 0032→0033 é só coluna + parâmetro + insert; aplicar 2× em paralelo continua barrado; import sem correções byte-a-byte igual ao fluxo F7.
3. **Ciclo de correção:** correção que cria duplicata acusa; desfazer reabre o erro; correção órfã marca "sem efeito"; `plano_vazio` bloqueia; `header_invalido` sem ação; avisos corrigíveis mas nunca bloqueiam.
4. **E2E completo em DEV** (roteiro da OS-F7B §10): CSV fictício ~15 linhas com todos os casos → corrigir tudo pela tela sem tocar no arquivo → aplicar → conferir ativos/estados/datas/log; baixar CSV corrigido → reimportar limpo. Documentar passo a passo no resumo.
5. **Emendas (parte da execução):** `docs/ESPECIFICACAO.md` §10.2 (a frase "para correção manual no CSV" morre — descreve a correção em tela, massa + pontual, avisos inclusos, site conhecido só remove, auditoria no log); `README.md` (linha F7 com o gate resolvido — §1.0 — e linha nova F7B); `docs/prompts/README.md` (linha F7B); `docs/DECISOES.md` (entrada `2026-07-17 · F7B`: 4 decisões do Johnny da §2 + técnicas: modelo de ops, patrimônio nunca em massa, contrato ampliado, `correcao_invalida` no motor, drop/recreate da RPC).

### Aceite W4

- [ ] Cada item com veredito; correções commitadas; E2E documentado e reproduzível
- [ ] Documentos emendados (nenhum doc vivo manda mais corrigir no CSV); `lint`+`test`+`build` limpos na base final

---

## §2 — Decisões do Johnny (17/07/2026) — autoridade

1. **Correção na tela, não no CSV** — com facilitadores; **em massa** para erros repetidos (trocar vários de uma vez).
2. **Bloqueantes E avisos corrigíveis** (`sem_data_entrada`, `estado_em_uso_sem_colaborador` inclusos; avisos seguem não bloqueando).
3. **Correções valem só no import atual** — sem catálogo persistente; registro no log daquele import.
4. **Site de outra filial conhecida: só remover a linha** (forçar mascararia transferência); site desconhecido é corrigível para a filial selecionada.

## §3 — Aceite geral (orquestrador)

- [ ] Gate §1.0 conferido; contrato §1.5 verificado na integração (smoke SQL do W2 com plano+correções do W1); ondas na ordem
- [ ] Aceites W1–W4 completos; revisão adversarial sem pendência crítica
- [ ] `0033` aplicada em produção com backup de definição prévio; `pg_proc` → função única de 4 args; deploy único; smoke de produção **somente leitura** (grupos e correção até o preview, sem aplicar)
- [ ] Zero dependência nova; zero dado real; custo R$ 0; invariantes F7 intactas
- [ ] Documentos emendados e `DECISOES.md` consolidado; README com F7 (gate resolvido) e F7B concluída
- [ ] Resumo final: o que mudou, decisões, pendências — e o ciclo de correção pronto para o próximo go-live de filial

# OS-F7F (ultracode) — facilitadores do import que funcionam: hostname automático · "aplicar tudo" que aplica tudo · vazio em laranja · fim do erro genérico

Ordem **executável e autocontida** (não depende de OS irmã). Nasce dos defeitos que o Johnny reportou **depois de rodar a F7E** (17/07/2026). Objetivo em uma linha: os **facilitadores** da tela `admin/importar` passam a fazer o que prometem — patrimônio que existe no hostname é **preenchido automaticamente** (some do vermelho e do fluxo de correção), **"Aplicar todas as correções"** aplica de fato tudo o que está pronto (inclusive parciais), **patrimônio vazio** vira **aviso âmbar** e não erro vermelho, e o **"Substituir tudo"** nunca mais falha com um **"Não foi possível concluir a operação. Tente novamente."** sem diagnóstico.

**Modo autônomo com acesso total (CLAUDE.md).** Sistema **em produção com dados reais**. Esta OS **não afrouxa** salvaguardas da F7/F7B/F7E (backup, confirmação pelo nome da filial, TOCTOU por contagens, advisory lock, RLS, `arquivoHash` do arquivo ORIGINAL, correções auditadas e revalidadas do zero). Subagente que se pegar "melhorando" essas salvaguardas está fora do escopo: pare e registre.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. O orquestrador segue a §1; os blocos §W1–§W4 são os prompts completos dos subagentes (autocontidos — o detalhe fino está aqui, não numa OS separada). A autoridade das decisões de produto está na **§2 (decisões do Johnny, 17/07/2026)** — ela **revoga** a não-inferência por hostname de 16/07.

---

## §0 — O que está quebrado (diagnóstico já feito — âncoras reais)

Cinco defeitos reportados pelo Johnny, com a causa-raiz já localizada no código atual (pós-F7E). Trate os cinco; não "aproveite" para outra fase.

**P1 — "Não foi possível concluir a operação. Tente novemente." ao clicar em "Substituir tudo".**
O botão de confirmação final é **"Substituir tudo"** (Passo 4, `src/components/admin/importar/importar-wizard.tsx:743-750`), handler `aplicar()` (`importar-wizard.tsx:300-325`), que chama a action `aplicarImport` (`src/lib/actions/importar.ts:275`). A única origem daquela frase é `traduzErroBanco` em `src/lib/actions/erros.ts:13` e `:90-93` (fallback). No fluxo de aplicar ela é chamada **num único ponto**: erro da RPC `importar_ativos_substituir` (`importar.ts:376-378`). Causa provável (a **confirmar reproduzindo**, não chutar): `traduzErroBanco` casa só por **substring de `error.message`** e **ignora `error.code`/SQLSTATE** — timeout de statement no `DELETE`+`INSERT` de ~1.200 ativos numa transação, um `raise` custom da migration `0034` fora da tabela de mensagens, ou `error.message` vazio caem todos no genérico. Hipótese secundária: estouro do `serverActions.bodySizeLimit` (default **1 MB** no Next; `next.config.ts` **não configura**) — o plano serializado da maior filial beira 1 MB; mas esse caminho seria **silencioso** (a action estoura antes do corpo e `aplicar()` **não tem try/catch**), então como o Johnny **vê** a mensagem, o caminho vivo é o da RPC. **Corrigir os dois** assim mesmo (defensivo) + a causa-raiz real.

**P2 — "Aplicar todas as correções" não aplica tudo; corrigir botão por botão é ruim.**
O controle global existe (`src/components/admin/importar/grupos-erros.tsx:969-986`), mas `opsGlobais` (`grupos-erros.tsx:956-962`) só inclui grupos com `grupoPronto === true`. Em `src/components/admin/importar/ops-grupo.ts:206-230`, `grupoPronto` para os pontuais (`patrimonio`, `colaborador`, `data`) é **tudo-ou-nada** (`.every(...)`): se 1 linha do grupo falta, o grupo **inteiro** contribui **zero** — inclusive as linhas já preenchidas. E `patrimonio_vazio`, `duplicata` e `nenhuma` retornam `false` sempre → **nunca** entram no lote. O banner global também não diz "faltam N".

**P3 — Sem patrimônio, mas com patrimônio no hostname → tem que substituir sozinho e não aparecer como erro.**
Hoje **não há inferência automática** — a F7E decidiu "SEM inferência por hostname" (16/07) e só oferece um botão 1-clique **por linha** ("usar WAP…", `grupos-erros.tsx:472` e `:488-500`) que apenas preenche o input. Nunca automático, nunca em lote. **O Johnny reverteu essa decisão** (§2): quando o patrimônio é vazio-na-prática **e** `canonicalizarPatrimonio(hostname)` resolve, o valor deve ser **preenchido automaticamente**, sumindo do fluxo de erro/aviso — auditado, não silencioso.

**P4 — Patrimônio vazio tem que ser aviso LARANJA, não aviso vermelho.**
`patrimonio_vazio` já é **aviso não-bloqueante** no motor (`src/lib/import/plano.ts:119-128`), mas visualmente sai errado: **não existe tier âmbar** no design (o `Badge` em `src/components/ui/badge.tsx:11-22` só tem `default/secondary/destructive/outline/ghost/link`). O badge do card sai `secondary` (cinza) e — pior — `PreviewPatrimonio` (`grupos-erros.tsx:212-228`) **hard-coda `text-destructive` (vermelho)** para a linha vazia mesmo dentro do card de aviso, pintando de erro um campo que é **opcional**.

**P5 — Revisão geral dos facilitadores que não funcionam direito.**
Varredura ponta-a-ponta de todos os facilitadores: substituição em massa por valor (categoria/estado/site), sugestão por Levenshtein, edição pontual, remover linha, **desfazer**, reanálise automática, lote global e sugestão do hostname. Achados já conhecidos: global tudo-ou-nada (P2), vermelho onde devia ser âmbar (P4), falta de `try/catch` no `aplicar()`/`analisarCom()` (P1), erros não mapeados (P1). O que mais aparecer, conserte e registre.

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) **F7E em produção**: migration `0034` aplicada no prod (patrimônio nullable + índice parcial + RPC com pendência); tela `admin/importar` operando. (b) Working tree limpo; `npm run lint` + `npm run test` + `npm run build` **verdes**. (c) Próxima migration livre = **`0035`** (a pasta vai até `0034_import_melhorias.sql` — **confira** antes de numerar). **Só criar `0035` se o diagnóstico do P1 exigir mexer na RPC.** (d) Estrutura conforme CLAUDE.md. Falhou qualquer um → **PARE e reporte**.

### 1.1 Grafo de execução

```
ONDA 1 (paralela · arquivos disjuntos)      INTEGRAÇÃO        ONDA 2            ONDA 3
┌─ W1: motor — inferência automática ──┐   merge W1+W2     W3: UI/facilitadores  W4: revisão adversarial
│   hostname→patrimônio + avisos +     │→  contrato §1.5 →  (âmbar, hostname   →   + E2E em DEV + emendas
│   resumo + testes (src/lib/import/**)│   smoke em DEV      auto no preview,      docs → (0035 SE preciso
├─ W2: robustez do "aplicar" —         ┘   lint/test/build   "aplicar tudo",       → produção) → deploy
│   diagnóstico + erro genérico                             try/catch, revisão)    → smoke leitura → resumo
│   (actions/importar.ts, erros.ts,
│   next.config.ts [+0035 em DEV se preciso])
```

- **W1 ∥ W2 não compartilham arquivo** — o acoplamento é o CONTRATO §1.5, fixado para permitir o paralelismo. W1 vive em `src/lib/import/**`; W2 em `actions/` + `next.config.ts` (+ migration em DEV, se preciso). Zero interseção.
- **W3 é onda 2 sozinho** (a superfície do import — `importar-wizard.tsx` + os cards — é uma peça acoplada; um dono só evita conflito de merge). Parte da base integrada da onda 1.
- **Isolamento (precedente F6A/F7B/F7E):** worktrees no Windows/OneDrive custam caro — **subagentes paralelos na mesma árvore**, branch única `f7f`, propriedade de arquivos disjunta (§1.3) como garantia. Worktrees baratos disponíveis → aceitável; decida, registre, siga.
- **Migration em produção e deploy: só o orquestrador, no fim.** Migration `0035` é **contingente** ao diagnóstico do W2 (P1). Se necessária, é destrutiva (mexe na RPC do import) → gate destrutivo da F7 (backup da definição da RPC + aplicação controlada; precedente: 0034 foi aplicada pelo Johnny no SQL Editor). Registre o caminho seguido.

### 1.2 Regras globais

1. Desenvolvimento contra o Supabase **DEV** (projeto de ensaio). Nenhum subagente toca produção.
2. Migration pré-alocada **contingente**: `0035_import_robustez.sql` — **só** o W2 cria, **só** se o P1 exigir; ninguém edita migration aplicada.
3. Stack fechada, **nenhuma dependência nova**, custo **R$ 0**, **nenhum dado real** em código/teste/fixture/doc/screenshot. CSVs de teste 100% fictícios (`WAP0001234`/"Fulano"); hostnames fictícios do tipo `NB-WAP0001234` / `DESKTOP-WAP0004491`. O CSV real **nunca** entra no repo.
4. Convenções: pt-BR; escrita via Server Actions + Zod; leituras em `src/lib/queries/`; RPC `security definer` + `set search_path = public`; datas exibidas `dd/MM/yyyy`; números em tabela `tabular-nums`; patrimônio no formato canônico (`WAP0004491`).
5. Cada subagente entrega: código na branch + checklist **autoverificado** + rascunho para `docs/DECISOES.md` (data · contexto · escolha · motivo) + pendências; `lint`+`test`+`build` limpos **no seu recorte**.
6. **Invariantes F7/F7B/F7E intocáveis:** régua de bloqueio (**`descartado`** e **patrimônio com valor fora do formato** continuam **bloqueantes**; **só-números** continua bloqueante); tudo-ou-nada na aplicação; backup pré-aplicação; confirmação pelo nome da filial; TOCTOU por contagens; advisory lock; RLS; `arquivoHash` = sha-256 do arquivo ORIGINAL; correções = ops **auditadas** e **revalidadas do zero** (o motor é o juiz — duplicata reaparece); patrimônio vazio-na-prática **sem** hostname aproveitável continua importando **nulo** com a pendência `'sem patrimônio físico'` (F7E).

### 1.3 Mapa de propriedade de arquivos (disjunto por construção)

| Dono | Arquivos |
|---|---|
| **W1** | `src/lib/import/plano.ts` + teste, `src/lib/import/tipos.ts`, `src/lib/import/deparas.ts` + teste (se precisar), `src/lib/import/correcoes.ts` + teste, `src/lib/import/index.ts`. **Lê** `src/lib/patrimonio.ts` (não edita). |
| **W2** | `src/lib/actions/importar.ts`, `src/lib/actions/erros.ts`, `next.config.ts`, e — **só se o diagnóstico exigir** — `supabase/migrations/0035_import_robustez.sql` (novo). **Nada de UI, nada de `src/lib/import/**`.** |
| **W3** | `src/components/admin/importar/**` (`grupos-erros.tsx`, `ops-grupo.ts` + teste, `rotulos.ts`, `importar-wizard.tsx`, `correcoes-aplicadas.tsx`, `tabela-erros.tsx`), `src/components/ui/badge.tsx` (variant `warning`), `src/lib/validators/importar.ts` (espelho Zod do tipo novo). |
| **W4** | Revisão (toca qualquer arquivo para **corrigir** achados), `docs/ESPECIFICACAO.md` §10.2, `README.md`, `docs/prompts/README.md`, `docs/DECISOES.md`, `src/lib/ajuda/conteudo.ts` (ajuda do import). |

Conflito previsto: o `try/catch` do P1 mora no `importar-wizard.tsx` (dono **W3**), mas surfaça os erros que o **W2** melhora na action. Resolução: **W2 especifica** exatamente o formato de erro que a action retorna; **W3 implementa** o `try/catch` que exibe. Sem edição cruzada de arquivo.

### 1.4 Integração e final (orquestrador)

1. **Fim da onda 1:** merge W1+W2. **Conferir o contrato §1.5:** rodar em DEV o motor do W1 sobre um CSV fictício com os casos novos (vazio-com-hostname → preenchido; vazio-sem-hostname → nulo+pendência; hostname que geraria duplicata → bloqueante) e confirmar que o W2 reproduziu **e mapeou** o erro do P1. `lint`+`test`+`build` verdes na união.
2. **Lançar W3** sobre a base integrada. Merge; `lint`+`test`+`build` verdes; smoke manual do W3 faz parte do aceite dele.
3. **Lançar W4** (revisão adversarial + E2E em DEV + emendas). Aplicar as correções dos achados.
4. **Produção (só se houve `0035`):** backup da definição atual da RPC (arquivo local, padrão F6A) → aplicar `0035` pelo gate destrutivo → smoke de **leitura**: RPC com **mesma assinatura de 4 args, sem overload** (`pg_proc` → 1 linha), `v_pendencias` com contagem inalterada, tela do import analisa CSV fictício **até o preview, sem aplicar** (padrão F7). Advisors depois. **Se não houve `0035`:** direto ao deploy.
5. **Deploy único** Vercel → resumo consolidado: checklists, decisões em `DECISOES.md`, README/prompts/spec/ajuda atualizados, pendências e backlog.

### 1.5 CONTRATO entre frentes (fixo — mudar = decisão registrada + aviso ao orquestrador)

**Tipos (W1 declara em `src/lib/import/tipos.ts`; W3 espelha no Zod de `validators/importar.ts` e consome na UI):**

```ts
// aviso informativo novo (não-bloqueante): patrimônio veio do hostname
//   tipo: 'patrimonio_do_hostname'  (coluna 'Patrimônio')
ValidacaoImport['resumo'] += { patrimonioDoHostname: number }
// AtivoPlano.patrimonio: string | null  (mantém F7E) — linha auto-preenchida
//   carrega o canônico do hostname; só vazio-sem-hostname fica null (pendência)
```

**Superfície do motor (W1; regra letra-a-letra na §W1):** a inferência automática vive **dentro de `montarPlanoImport`** (`plano.ts`). Ordem: para patrimônio **vazio-na-prática** (`patrimonioVazio(reg.patrimonio) === true`), **antes** de emitir o aviso `patrimonio_vazio`, tentar `canonicalizarPatrimonio(reg.hostname)`. Resolveu (não-nulo) → `patrimonio = <canônico>`, **não** emite `patrimonio_vazio`, emite aviso **informativo** `patrimonio_do_hostname` (âmbar) e incrementa `resumo.patrimonioDoHostname`; a **dedupe usa o valor preenchido** (duplicata reaparece bloqueante). Não resolveu → segue F7E (nulo + `patrimonio_vazio` + pendência). `canonicalizarPatrimonio` e `patrimonioVazio` **não mudam**. A auto-inferência **só** atua sobre vazio-na-prática — **não** sobrescreve um patrimônio **com valor** inválido (esse mantém a sugestão 1-clique do W3, sem override automático).

**Contrato de erro (W2; W3 consome):** `aplicarImport` mantém o retorno `{ ok: true; … } | { ok: false; erro: string }`, mas `erro` passa a ser **específico e acionável** (timeout, tamanho do payload, mensagem da RPC **com o `code`/SQLSTATE logado no servidor**) — nunca mais o genérico cru. `traduzErroBanco` passa a considerar `error.code` além de `error.message` e a mapear **timeout** (`57014`) e payload. `next.config.ts` define `experimental.serverActions.bodySizeLimit` com folga para o maior plano (medir; confirmar a chave correta na doc do **Next 16** — regra 6 do CLAUDE.md, via Context7/doc oficial). Se o diagnóstico achar bug na RPC `0034`, `0035` é `create or replace` **puro** (assinatura idêntica, sem drop, sem overload).

**Contrato de UI (W3):**
- **"Aplicar todas as correções"** deixa de ser tudo-ou-nada: para grupos pontuais, emite ops **das linhas válidas** (ignora as pendentes **sem** zerar o grupo); inclui as correções de hostname que o preview já auto-aplicou; o banner mostra **"aplicadas N · faltam M"**.
- **Âmbar:** `Badge` ganha `variant="warning"` (âmbar alinhado ao amarelo WAP `#eda100`, contraste AA); todos os avisos do import (inclusive `patrimonio_vazio` e `patrimonio_do_hostname`) usam âmbar; `PreviewPatrimonio` deixa de pintar de vermelho o estado **opcional** no card de vazio.
- **`try/catch`** em `aplicar()` e `analisarCom()` surfando o `erro` do W2 como `toast.error` + `setErroAcao` (hoje um throw fica sem toast — `importar-wizard.tsx:300-325`, `:229-247`).

---

## §W1 — Subagente W1: motor — inferência automática hostname→patrimônio

Você é um subagente executando a frente **W1** da OS-F7F. Modo autônomo. **Só módulos puros + testes** em `src/lib/import/` — nada de banco, action ou UI. Consome e cumpre o CONTRATO §1.5. Leia antes: `src/lib/import/plano.ts` (foco em `montarPlanoImport`, ~linhas 115-205), `tipos.ts`, `deparas.ts`, `correcoes.ts` e `src/lib/patrimonio.ts` (**não editar** — só usar `canonicalizarPatrimonio` e `PATRIMONIO_CANONICAL_RE`).

### Contexto do código atual (F7E)

- `patrimonio_vazio` é emitido em `plano.ts:119-128`: quando `patrimonioVazio(reg.patrimonio)` é `true`, empurra aviso e deixa `patrimonio = null`. É aqui que a auto-inferência entra **antes** do aviso.
- `patrimonioVazio` mora em `deparas.ts` (conjunto `PATRIMONIO_VAZIO`); `canonicalizarPatrimonio` (`patrimonio.ts:11-19`) exige prefixo de 2–4 letras + dígitos → **só-números continua `null` → bloqueante** (não mexa nisso).
- Hoje **não há** leitura de patrimônio a partir do hostname em lugar nenhum do motor (comentários "SEM inferência por hostname" em `plano.ts:7` e `:115` — **atualize-os** para refletir a nova regra).

### Entregas

1. **`plano.ts` — `montarPlanoImport`:** implementar a regra do §1.5. Para vazio-na-prática, tentar `canonicalizarPatrimonio(reg.hostname)`:
   - **resolveu** → `patrimonio = <canônico>`; **não** emite `patrimonio_vazio`; emite aviso `{ tipo: 'patrimonio_do_hostname', coluna: 'Patrimônio', mensagem: 'patrimônio ausente — preenchido pelo hostname (\<canônico\>); confira' }`; `resumo.semPatrimonio` **não** conta essa linha; `resumo.patrimonioDoHostname++`. A linha entra na **dedupe** com o valor preenchido (par patrimônio+service tag), como qualquer ativo normal.
   - **não resolveu** → comportamento F7E intacto (nulo + `patrimonio_vazio` + pendência; conta em `resumo.semPatrimonio`).
   - **Nunca** atua sobre patrimônio **com valor** (vazio-na-prática só): valor presente que não canonicaliza segue **bloqueante** `patrimonio_invalido`.
2. **`tipos.ts`:** declarar o aviso `patrimonio_do_hostname` e `resumo.patrimonioDoHostname: number`. Comentar a ampliação do contrato.
3. **`correcoes.ts`:** o aviso `patrimonio_do_hostname` **não** gera grupo de correção (é informativo — some do fluxo de erro). Confirmar que `chaveDoGrupo`/`correcaoDoGrupo` o ignoram; `patrimonio_vazio` continua como F7E (card de aviso opcional).
4. **`index.ts`:** exportar o que for novo do contrato.
5. Atualizar os comentários "SEM inferência por hostname" (`plano.ts:7`, `:115`) para a regra nova, citando a decisão do Johnny (§2, 17/07/2026).

### Regras que NÃO se dobram

`descartado`, fora-do-formato-com-valor e só-números continuam **bloqueantes**. Linha sem Site **e** sem patrimônio continua descartada (`linha_sem_chave`). A dedupe e o `arquivoHash` não mudam. Sem dependência nova, sem dado real (hostnames fictícios `NB-WAP0001234`).

### Testes (Vitest — o grosso da frente)

`montarPlanoImport`: (a) patrimônio `""`/`n/a`/`SEM PATRIMONIO` **com** hostname `NB-WAP0001234` → `patrimonio: 'WAP0001234'`, aviso `patrimonio_do_hostname`, **sem** `patrimonio_vazio`, `resumo.patrimonioDoHostname === 1`, `resumo.semPatrimonio === 0`; (b) mesmo caso **sem** hostname aproveitável (`DESKTOP-SALA`) → nulo + `patrimonio_vazio` + `semPatrimonio === 1` (F7E intacto); (c) duas linhas vazias cujo hostname canoniza para o **mesmo** `WAP0001234` → **par_duplicado bloqueante** (dedupe usou o preenchido); (d) patrimônio **com valor** só-números `12345` + hostname válido → **continua** `patrimonio_invalido` bloqueante (não sobrescreve); (e) hostname com número que **não** canoniza (`PC-01`) + patrimônio vazio → cai no F7E (nulo+pendência). **Retrocompatibilidade:** CSV sem hostname aproveitável → resultado **idêntico** ao F7E campo a campo (suite existente verde, exceto os campos novos do retorno).

### Aceite W1

- [ ] Contrato §1.5 exportado e tipado; testes (a)–(e) passando; suite antiga verde
- [ ] Zero banco/UI/action; zero dependência nova; zero dado real; comentários de não-inferência atualizados
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (reversão da não-inferência; dedupe com o valor preenchido; aviso informativo âmbar)

---

## §W2 — Subagente W2: robustez do "aplicar" — matar o erro genérico

Você é um subagente executando a frente **W2** da OS-F7F. Modo autônomo. **Reproduza antes de corrigir** — nada de chute. Seus arquivos: `src/lib/actions/importar.ts`, `src/lib/actions/erros.ts`, `next.config.ts` e — **só se o diagnóstico exigir** — `supabase/migrations/0035_import_robustez.sql`. **Não** toque em `src/lib/import/**` nem em UI. Leia antes: `importar.ts` (foco na action `aplicarImport` e na chamada `client.rpc('importar_ativos_substituir', …)` em `:376-378`), `erros.ts` inteiro (`traduzErroBanco`), a migration `0034_import_melhorias.sql` (corpo da RPC) e `next.config.ts`.

### Passo 1 — REPRODUZIR em DEV (obrigatório, primeiro)

Gere um CSV fictício em **escala real** (~1.200 linhas `WAP…`/"Fulano", vários estados/datas, alguns vazios-com-hostname) e rode o fluxo `admin/importar` contra o Supabase **DEV** até o **"Substituir tudo"**. Capture o erro **real**: leia os **logs do Postgres/Supabase** (mensagem + `code`/SQLSTATE) e, no cliente, o que a action devolve. Decida qual das causas é a viva:
- **(i) Erro/`raise` da RPC não mapeado** ou `error.message` vazio → `traduzErroBanco` cai no genérico (`erros.ts:13`, `:90-93`).
- **(ii) Timeout de statement** (`57014`, "canceling statement due to statement timeout") no `DELETE`+`INSERT` grande → não casa nenhuma branch → genérico.
- **(iii) `bodySizeLimit`** (default 1 MB) estourado pelo plano serializado → a Server Action **estoura antes do corpo** (silencioso hoje, sem try/catch no cliente).
- **(iv) Bug real na RPC `0034`** (ex.: a conferência agregada, a unicidade null-safe, o insert com `pendencia`) que dispara `raise`/constraint em input válido.

Anote a causa comprovada em `DECISOES.md` **com a mensagem/`code` reais** (fictícios). **Corrija a causa-raiz + blinde as demais** (defensivo).

### Passo 2 — Correções

1. **`erros.ts` — `traduzErroBanco`:** aceitar também `error.code`; mapear **timeout** (`57014`) para uma mensagem clara ("A importação demorou demais e foi cancelada — tente novamente ou avise o TI"); mapear violação do índice parcial/único do import para mensagem específica; **logar no servidor** (`console.error`) `code`+`message`+contexto **sempre** que cair no fallback (para o próximo erro nunca ser cego). O genérico continua existindo como último recurso, mas agora é **raro e logado**.
2. **`importar.ts` — `aplicarImport`:** no ponto `:376-378`, logar `error.code`/`error.message` antes de traduzir; se a causa foi **(ii) timeout**, avaliar (e registrar a escolha) `set local statement_timeout` maior **dentro da RPC** (via `0035`) ou orientação de retry — sem quebrar a transação tudo-ou-nada. Repasse do erro específico no `{ ok:false, erro }`.
3. **`next.config.ts`:** definir `experimental.serverActions.bodySizeLimit` com folga sobre o maior plano medido (ex.: `'4mb'` se o plano for ~1 MB — **meça**). **Confirme a chave exata na doc do Next 16** (Context7/doc oficial; não confie na memória) e registre a versão consultada.
4. **`0035_import_robustez.sql` (contingente):** só se o diagnóstico for **(iv)** ou se **(ii)** pedir `statement_timeout` na função. `create or replace` **puro** (assinatura idêntica de 4 args, sem drop, sem overload); mudança **mínima** e cirúrgica; grants/revokes reafirmados como na `0034`; smoke comentado com rollback no fim. **Em DEV apenas** — o orquestrador aplica em produção.

### Aceite W2

- [ ] Causa do P1 **reproduzida em DEV** e registrada com `code`/mensagem reais (fictícios); erro final agora **específico e logado**, nunca mais o genérico cru sem rastro
- [ ] `bodySizeLimit` configurado e medido; chave confirmada na doc do Next 16 (versão citada)
- [ ] Se houve `0035`: `create or replace` puro, 1 linha no `pg_proc`, smoke com rollback limpo em DEV; se não, TS-only
- [ ] Contrato de erro do §1.5 cumprido (para o W3 surfaçar); `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W3 — Subagente W3 (ONDA 2): UI/facilitadores — âmbar · hostname no preview · "aplicar tudo" · try/catch

Você é um subagente executando a frente **W3** da OS-F7F, **sobre a base integrada com W1+W2**. Modo autônomo. Sem migration, sem deploy, sem tocar nos arquivos do W1/W2 (§1.3). Consome os tipos do W1 e o contrato de erro do W2. Leia antes: `grupos-erros.tsx`, `ops-grupo.ts` (+ teste), `rotulos.ts`, `importar-wizard.tsx`, `correcoes-aplicadas.tsx`, `src/components/ui/badge.tsx`, `src/lib/validators/importar.ts`.

### O que construir

1. **Tier âmbar (P4).** Adicionar `variant: 'warning'` ao `Badge` (`badge.tsx:11-22`) — âmbar da paleta WAP (base no amarelo `#eda100`; garantir contraste AA em claro/escuro; token semântico, sem cor mágica solta). Trocar o ternário binário `bloqueante ? 'destructive' : 'secondary'` (`grupos-erros.tsx:154`) por **três vias**: bloqueante = vermelho (`destructive`); aviso = **âmbar** (`warning`); neutro/ok = `secondary`. Corrigir `PreviewPatrimonio` (`grupos-erros.tsx:212-228`): dar-lhe noção de "opcional" para que, dentro do `CardPatrimonioVazio`, o estado vazio apareça **âmbar/discreto** ("opcional — preencha se souber") e **não** `text-destructive`. A barra de status do Passo 3 e o tile "sem patrimônio" (`importar-wizard.tsx:~519`, `~477`) ganham o mesmo âmbar (aviso ≠ cromo neutro).

2. **Hostname automático no preview (P3 — lado UI).** Com o motor (W1) já preenchendo, a maioria dos "sem patrimônio + hostname" **não chega** como erro. Na UI: (a) renderizar o aviso `patrimonio_do_hostname` como **card/linha âmbar informativa** ("N patrimônios preenchidos pelo hostname — confira"), listando linha + valor, **fora** do fluxo de correção bloqueante; (b) refletir a contagem no resumo do Passo 3 e, idealmente, no painel `correcoes-aplicadas.tsx` (auditoria — não silencioso); (c) o botão 1-clique "usar WAP…" (`grupos-erros.tsx:488-500`) **permanece** para o caso de patrimônio **com valor inválido** + hostname bom (que o motor **não** auto-preenche). Nada de aplicar sem o motor revalidar.

3. **"Aplicar todas as correções" que aplica tudo (P2).** Em `ops-grupo.ts:206-230`, para os grupos pontuais (`patrimonio`, `colaborador`, `data`): `opsDoGrupo` passa a emitir ops **das linhas válidas** mesmo com o grupo incompleto; `grupoPronto`/`faltamNoGrupo` refletem "parcialmente pronto" (nº de linhas prontas > 0) em vez de tudo-ou-nada. Em `grupos-erros.tsx:956-962`, `opsGlobais` passa a incluir essas parciais. O banner global (`:969-986`) mostra **"aplicadas N · faltam M"** e, se M>0, um hint do que falta. `patrimonio_vazio`/`duplicata`/`nenhuma` seguem **fora** do lote (preencher vazio é opcional; duplicata é decisão humana) — mas isso agora é **coerente**, porque o hostname já resolveu os vazios-com-hostname no motor.

4. **`try/catch` que surfaça o erro (P1 — lado UI).** Envolver `await aplicarImport(...)` em `aplicar()` (`importar-wizard.tsx:300-325`) e `await ...` em `analisarCom()` (`:229-247`) com `try/catch` que faz `toast.error(msg)` + `setErroAcao(msg)` — igual ao padrão já usado em `baixarCorrigido` (`:277-297`). Assim, mesmo um throw (payload/serialização/rede) vira mensagem visível, e o erro **específico** do W2 aparece pro usuário.

5. **`validators/importar.ts`:** espelhar no Zod o tipo novo do W1 (aviso `patrimonio_do_hostname`, `resumo.patrimonioDoHostname`). Sem afrouxar o resto.

6. **Revisão dos facilitadores (P5).** Passar por: substituição em massa (categoria/estado/site), sugestão Levenshtein, edição pontual, **remover linha**, **desfazer**, reanálise automática, lote global, hostname. Cada um: funciona ponta-a-ponta? feedback claro? Conserte o que estiver quebrado no seu recorte; o que estiver fora dele, anote pro W4.

### Aceite W3

- [ ] Smoke manual em DEV com CSV fictício: vazio-com-hostname **não** aparece como erro (preenchido, card âmbar informativo, contagem no resumo/auditoria); patrimônio vazio-sem-hostname aparece **âmbar** (nunca vermelho) e importa com pendência; "Aplicar todas" aplica **parciais** e mostra "aplicadas N · faltam M"
- [ ] Forçar um erro no aplicar (ex.: derrubar a conexão DEV) → **toast visível** com mensagem específica (não some silencioso)
- [ ] Sugestão que criaria duplicata é acusada pela reanálise; import sem casos novos idêntico ao F7E; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W4 — Subagente W4 (FINAL): revisão adversarial + E2E + emendas

Você é um subagente executando a frente **W4** da OS-F7F, sobre a base com W1–W3 integrados. Seu papel é **quebrar** os facilitadores antes do próximo go-live — e emendar os documentos. Corrija o que achar; registre tudo (ok / corrigido / pendência justificada).

1. **Hostname automático:** tabela de casos na unha — vazio-com-hostname canoniza; vazio-sem-hostname vira pendência; **dois** vazios com o mesmo hostname → duplicata bloqueante; patrimônio **com valor** inválido **não** é sobrescrito; hostname com número que não canoniza cai no F7E; injeção (`=cmd`, aspas, `;`) no hostname inerte. Provar que o preenchimento é **auditável** (aparece na tela e no `import_logs`/resultado).
2. **Erro genérico (P1):** confirmar que a causa reproduzida pelo W2 está **corrigida e logada**; timeout e payload agora dão mensagem específica; `bodySizeLimit` aguenta o maior plano; se houve `0035`, o diff da RPC `0034→0035` é **só** o descrito e a assinatura é idêntica.
3. **"Aplicar tudo" (P2):** grupos parcialmente prontos aplicam as linhas válidas; banner "aplicadas N · faltam M" bate; nada de linha pendente aplicada por engano; `desfazer` e reanálise consistentes.
4. **Âmbar (P4):** nenhum aviso pintado de vermelho; bloqueante segue vermelho; contraste AA em claro/escuro; `patrimonio_vazio` e `patrimonio_do_hostname` âmbar.
5. **Invariantes F7/F7B/F7E (regra §1.2.6):** TOCTOU/lock/backup/confirmação/`arquivoHash` intactos; import sem casos novos byte-a-byte igual; régua de bloqueio preservada; RLS/viewer por senha intactos.
6. **E2E completo em DEV:** CSV fictício ~20 linhas com **todos** os casos → preview (hostname auto + âmbar) → "Aplicar todas" (parciais) → "Substituir tudo" → conferir ativos/estados/pendências/log; forçar e ver o erro específico; baixar CSV corrigido → reimportar limpo. Documentar o roteiro no resumo.
7. **Emendas (parte da execução):** `docs/ESPECIFICACAO.md` §10.2 (inferência automática por hostname; vazio âmbar; "aplicar tudo" parcial); `README.md` (linha **F7F**); `docs/prompts/README.md`; `src/lib/ajuda/conteudo.ts` (ajuda do import); `docs/DECISOES.md` (entrada `2026-07-17 · F7F`: reversão da não-inferência + causa do erro genérico + demais decisões técnicas).

### Aceite W4

- [ ] Cada item com veredito; correções commitadas; E2E documentado e reproduzível
- [ ] Documentos emendados; `lint`+`test`+`build` limpos na base final

---

## §2 — Decisões do Johnny (17/07/2026) — autoridade

1. **Patrimônio no hostname → preenchimento AUTOMÁTICO.** Quando o patrimônio é vazio-na-prática e o hostname contém um patrimônio canonizável, o sistema **preenche sozinho** no preview — **sem** clique, **sem** aparecer como erro/aviso de "patrimônio vazio". **Isto revoga** a não-inferência por hostname de 16/07 (que valia inclusive para o automático). O preenchimento é **auditável** (visível na tela + registrado), e a **reanálise do motor continua sendo o juiz** (se o valor gerar duplicata, reaparece bloqueante). Patrimônio **com valor** inválido **não** é sobrescrito automaticamente — mantém a sugestão 1-clique.
2. **Patrimônio vazio (sem hostname aproveitável) = aviso ÂMBAR**, nunca vermelho. Importa nulo com pendência `'sem patrimônio físico'` (F7E), mas visualmente é aviso, não erro.
3. **"Aplicar todas as correções" aplica tudo o que está pronto**, inclusive grupos **parcialmente** preenchidos (as linhas válidas), com feedback "aplicadas N · faltam M". Corrigir botão por botão deixa de ser o único caminho.
4. **O "Substituir tudo" não pode mais falhar com o genérico "Não foi possível concluir a operação. Tente novamente." sem diagnóstico** — o erro tem que ser específico, visível e logado.
5. **Só-números / patrimônio-com-valor fora do formato seguem BLOQUEANTES** (régua da F7 intacta). A automação é só para o campo **vazio** com hostname bom.

## §3 — Aceite geral (orquestrador)

- [ ] Gate §1.0; contrato §1.5 conferido na integração; ondas na ordem; propriedade §1.3 respeitada
- [ ] Aceites W1–W4 completos; revisão adversarial sem pendência crítica; os **cinco** defeitos (P1–P5) fechados
- [ ] Se houve `0035`: produção com backup de definição prévio + smoke de leitura; se não, TS-only + deploy
- [ ] Zero dependência nova; zero dado real; custo R$ 0; invariantes F7/F7B/F7E intactas
- [ ] Documentos emendados; `DECISOES.md` consolidado; README com **F7F** concluída
- [ ] Resumo final: o que mudou, decisões, pendências, backlog — e o import pronto para o próximo go-live de filial

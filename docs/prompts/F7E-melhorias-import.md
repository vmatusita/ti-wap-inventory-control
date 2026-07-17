# OS-F7E — Import: datas dd/MMM, patrimônio vazio como pendência, cards agrupados

Executor desta ordem no repositório `ti-wap-inventory-control`. **Modo autônomo com acesso total (CLAUDE.md)** — decide, implementa, aplica migration, deploya, registra em `docs/DECISOES.md`. Sistema **em produção com dados reais**. Ordem **sequencial, sessão única** (motor → banco → actions → UI → pendências) — a feature é acoplada; não paralelize.

**Contexto:** rodando o import da Matriz (F7/F7B/F7C/F7D no ar), o Johnny apontou 3 dores, confirmadas na análise do CSV real (1.250 linhas, fora do repo):

1. **Datas de entrega `dd/MMM`** (ex.: `18/nov`, `21/jan`) — 529 linhas. `parseData` só aceita `dd/MM/aaaa`, então elas são **descartadas em silêncio** e a movimentação de ajuste (que registra a saída/posse) fica com a data do dia do import. Em 321 delas a Data de Inclusão da linha traz o ano; nas outras 208 não há fonte de ano.
2. **Patrimônio vazio bloqueia** — 31 linhas (`""`, `n/a`, `SEM PATRIMONIO`). São ativos reais sem plaqueta; o próprio go-live (F4) cadastrou 61 assim, com pendência. Bloquear obriga a inventar valor ou remover a linha.
3. **Cards não agrupam** — `patrimonio_invalido` agrupa pelo *valor* cru, e cada valor é diferente (113 só-números + 4 estranhos = **117 cards de 1 linha**). `sem_data_entrada` idem (`""` vs `#######` vs lixo viram cards distintos). Corrige-se um a um.

## 0. GATE de entrada

1. F7B em produção (migração `0033` aplicada; correções funcionando em `admin/importar`). Se não estiver, PARE e reporte.
2. Working tree limpo; `npm run lint` + `npm run test` + `npm run build` verdes antes de começar.
3. Próxima migration livre: a pasta vai até `0033_import_correcoes.sql` → usar **`0034`** (confira antes de numerar).
4. Estrutura conforme CLAUDE.md; se divergir, PARE e reporte.

## 1. Decisões do Johnny (17/07/2026) — autoridade desta ordem

1. **Entrega `dd/MMM` → interpretar puxando o ano da Data de Inclusão** da mesma linha. O destino é a **data do ajuste de reconciliação** (a saída/posse na linha do tempo do ativo); `dataEntrada` mantém a regra atual (mais antiga válida entre Inclusão/Entrega — agora com a entrega resolvida participando).
2. **Virada de ano:** se (mês, dia) da entrega < (mês, dia) da inclusão → **ano + 1** (entrega nunca antecede a inclusão na planilha; ex.: entrega `21/jan`, inclusão `18/12/2024` → `21/01/2025`). No CSV da Matriz isso vale para 143 das 321 linhas resolvíveis. Resultado no futuro → data inválida (ignorada na escolha, linha cai no aviso se não sobrar data).
3. **Entrega vazia → assume a data da inclusão** (o ajuste é datado pela inclusão). **Nenhuma das duas** → continua o **aviso corrigível** `sem_data_entrada` (não bloqueia; importa como carga sem data) — comportamento F7 preservado.
4. **Patrimônio vazio não bloqueia.** Vazio-na-prática (`""`, `-`, `n/a`, `x`, `0`, `sem`, `sem patrimonio`/`sem patrimônio`…) → importa com **patrimônio NULO** + `ativos.pendencia = 'sem patrimônio físico'` (mesmo texto do go-live F4 — a fila fica uma só) + **aviso novo** `patrimonio_vazio` no preview. A pendência aparece na **lista de ativos** (badge + filtro) e na **página `/pendencias`** (bucket próprio). Correção posterior: `corrigirPatrimonio` na ficha (F6B).
5. **Só-números e demais não-canonicalizáveis continuam BLOQUEANTES** (`patrimonio_invalido`, correção linha a linha). Novo: quando o **Hostname** da linha canonicaliza (padrão real: patrimônio `1234`, hostname `WAP0001234`), o card oferece **sugestão de 1 clique** ("usar WAP0001234"). Nada é aceito sem confirmação — a decisão de 16/07 ("SEM inferência por hostname") segue valendo para o *automático*.
6. **Erros do mesmo tipo num card só:** `patrimonio_invalido` e `sem_data_entrada` passam a agrupar com chave única (um card com N linhas dentro), aproveitando os controles por linha + "corrigir a seção" da F7D.

## 2. Motor (`src/lib/import/`) — ordem de implementação

### 2.1 `deparas.ts` — datas

- Nova tabela `MESES_ABREV`: `jan fev mar abr mai jun jul ago set out nov dez` → 1–12. Aceitar caixa qualquer e ponto final opcional (`Nov.`).
- Nova função pura **`resolverDataEntrega(raw, inclusaoIso: string | null, hoje): ParseDataResult`**:
  - vazio-na-prática (`DATA_VAZIA`) → `{ iso: null, invalida: false }`;
  - `dd/MM/aaaa` → delega a `parseData` (comportamento atual);
  - `dd/MMM` → exige `inclusaoIso` válida (senão `invalida: true`); ano = ano da inclusão; se `(mês, dia)` < `(mês, dia)` da inclusão → ano + 1; valida dia/mês reais (`31/fev` → inválida); `iso > hoje` → `futura: true`;
  - qualquer outra coisa → `invalida: true`.
- `parseData` **não muda** (correções digitadas na tela continuam exigindo `dd/MM/aaaa` completa — `dd/MMM` só é interpretado vindo do arquivo).

### 2.2 `deparas.ts` — patrimônio vazio

- Novo conjunto `PATRIMONIO_VAZIO` = `VAZIOS` ∪ {`sem patrimonio`, `sem patrimônio`} (comparar via `normalizarTexto`).
- Predicado `patrimonioVazio(raw): boolean`. **Não** mexer em `canonicalizarPatrimonio`.

### 2.3 `tipos.ts` — contrato §1.5 (ampliação registrada)

- `AtivoPlano.patrimonio: string | null` (null = sem patrimônio, importa com pendência). `patrimonioOriginal` continua guardando o cru.
- `AtivoPlano` ganha **`dataAjuste: string | null`** — data da movimentação de ajuste (yyyy-MM-dd): entrega resolvida ?? `dataEntrada` ?? null (RPC usa a data do import).
- `GrupoErro['correcao']` ganha `{ kind: 'patrimonio_vazio' }`.
- `ValidacaoImport['resumo']` ganha `semPatrimonio: number`.

### 2.4 `plano.ts` — `montarPlanoImport`

- **Patrimônio:** `patrimonioVazio(reg.patrimonio)` → `patrimonio: null` + **aviso** `{ tipo: 'patrimonio_vazio', coluna: 'Patrimônio', mensagem: 'sem patrimônio — importa com pendência "sem patrimônio físico"; preencha na tela se souber o número' }`. Não-vazio que não canonicaliza → **bloqueante** `patrimonio_invalido` (como hoje).
- **Datas:** `entrega = resolverDataEntrega(reg.dataEntrega, inclusaoIso, hoje)`; `dataEntrada` = mais antiga válida não-futura entre inclusão e entrega resolvida (regra atual, entrada nova); `dataAjuste = entrega.iso válida-não-futura ?? dataEntrada`. Aviso `sem_data_entrada` inalterado (dispara quando nenhuma data válida sobrou).
- **Chave de dedupe** (linhas repetidas no CSV): com patrimônio → `chavePatrimonio` como hoje; sem patrimônio e **com** service tag → chave `∅::<chaveServiceTag>` (duas linhas sem patrimônio com a mesma tag = colisão do índice parcial novo → mesmo bloqueante de duplicata); sem patrimônio e sem tag → **sem dedupe** (linhas distintas permitidas — sem identidade não há como deduplicar; espelha os índices §3.1).
- **F7C (`existentesEmOutraFilial`):** `candidatos` passa a incluir os sem-patrimônio-com-tag (`patrimonio: null`). A action (§4.2) consulta o banco também por `patrimonio is null and service_tag in (…)` em outra filial → mesmo bloqueante `patrimonio_em_outra_filial` (mensagem pela tag). Sem patrimônio e sem tag não é detectável — aceito e documentado.
- `resumo.semPatrimonio` = ativos do plano com patrimônio null.

### 2.5 `correcoes.ts` — agrupamento e cards

- `chaveDoGrupo`: `patrimonio_invalido` → `''` (card único); `sem_data_entrada` → `''` (card único — o agrupador por valor cru da inclusão era herança da correção em massa por `substituir`, abandonada na F7B; o card de data já preenche todas as linhas de uma vez).
- `correcaoDoGrupo`: novo `patrimonio_vazio` → `{ kind: 'patrimonio_vazio' }`.
- A **sugestão do hostname** NÃO entra no motor: a UI deriva de `contexto[linha].hostname` com `canonicalizarPatrimonio` (§5.1). Se a confirmação criar par duplicado, a reanálise pega (o motor segue o único juiz).

### 2.6 Testes do motor (fixtures 100% fictícias — `WAP0001234`, "Fulano")

`resolverDataEntrega`: dd/MMM com ano da inclusão; virada de ano (+1); resultado futuro; inclusão inválida/vazia (→ inválida); `dd/MM/aaaa` passa direto; vazio → null; `31/fev` inválida; `Nov.` com ponto/caixa. `montarPlanoImport`: patrimônio vazio → aviso + null + pendência no resumo; só-números → bloqueante; dedupe `∅::tag`; duas linhas sem patrimônio sem tag NÃO colidem; `dataAjuste` nas 3 quedas (entrega ?? inclusão ?? null). Agrupamento: N `patrimonio_invalido` de valores distintos → 1 grupo; idem `sem_data_entrada`. Retrocompatibilidade: CSV sem os casos novos → resultado byte-a-byte igual ao da F7B (teste existente segue verde).

## 3. Banco — migration `0034` (aditiva; aplicar em DEV, depois produção)

### 3.1 Schema

```sql
alter table public.ativos alter column patrimonio drop not null;

-- Sem patrimônio, a service tag vira a identidade: duas iguais colidem.
-- Sem patrimônio E sem tag: linhas livres (sem identidade não há dedupe).
create unique index ativos_service_tag_sem_patrimonio_uidx
  on public.ativos ((coalesce(service_tag, '')))
  where patrimonio is null and coalesce(service_tag, '') <> '';
```

O índice único existente `(patrimonio, coalesce(service_tag,''))` fica intacto — linhas com patrimônio null não colidem nele (NULL distinto no btree), por isso o parcial acima.

### 3.2 RPC `importar_ativos_substituir` (create or replace, mesma assinatura)

- **1d:** regex de patrimônio só quando não-null; null passa.
- **1e (unicidade no plano):** espelhar os DOIS índices — grupos por `(patrimonio, coalesce(serviceTag,''))` quando patrimônio não-null; grupos por `coalesce(serviceTag,'')` entre os null com tag ≠ ''; pares (null, '') livres.
- **4a:** `patrimonio` pode ser null; quando null, gravar **`pendencia = 'sem patrimônio físico'`** no insert.
- **4c:** data do ajuste = `coalesce(nullif(e->>'dataAjuste','')::date, v_data_import)`.
- **5b/5c (conferência):** join null-safe (`is not distinct from`) para quem tem patrimônio OU tag; para as linhas **sem ambos** o join linha-a-linha é impossível → conferir por **contagem agregada** (nº por estado × colaborador entre os sem-chave do plano = idem no banco). Divergiu → rollback, como hoje.
- Atualizar o smoke comentado com 1 ativo sem patrimônio + tag e 1 sem ambos (fictícios).

### 3.3 Efeitos fora do import

`v_pendencias` **não muda** (já inclui `a.pendencia is not null` — os novos ativos aparecem sozinhos). `getPendencias`/chips dos relatórios **intactos**: essas linhas caem em "outras pendências" (consequência aceita). Rodar advisors após a migration.

## 4. Validators / Actions

### 4.1 Zod (`src/lib/validators/` + action do import)

- Schema do `AtivoPlano`: `patrimonio` nullable; `dataAjuste` string-data nullable.
- **Cap de correções: 300 → 1.500** (OS-F7B §3.8). Motivo: o card único de patrimônio emite um `editar` por linha (a Matriz sozinha geraria ~330 ops entre patrimônios e datas); 1.500 ≥ maior CSV real (1.250 linhas). Continua barato (ops são JSON pequenos).
- Correções de data continuam validadas com `parseData` (`dd/MM/aaaa`) — sem mudança.

### 4.2 `actions/importar.ts`

- Consulta F7C ampliada: além dos pares com patrimônio, buscar em outra filial os `patrimonio is null` com `service_tag` nas tags dos candidatos sem patrimônio (§2.4).
- Preview/aplicação: propagar `resumo.semPatrimonio` e `dataAjuste` (nenhuma lógica nova além do repasse).

## 5. UI (`src/components/admin/importar/`)

### 5.1 `grupos-erros.tsx`

- **CardPatrimonio** (agora card único com N linhas): cada `LinhaPatrimonio` ganha, quando `canonicalizarPatrimonio(reg.hostname)` resolve, um botão outline **"usar WAP0001234"** que preenche o rascunho da linha (1 clique; o "Corrigir a seção"/global da F7D aplica tudo). Sem hostname aproveitável → input como hoje.
- **Novo CardPatrimonioVazio** (aviso `patrimonio_vazio`): texto "estas linhas importam **sem patrimônio**, com pendência 'sem patrimônio físico' — preencha só as que você souber"; inputs por linha (mesma `LinhaPatrimonio`) com botão "Corrigir" **por linha**; **fora** do botão de seção e do lote global (preencher é opcional — a regra F7D "tudo preenchido para aplicar" não se aplica a um card que pode legitimamente ficar em branco; mesma doutrina do card `duplicata`). Remover linha continua disponível.
- **CardData**: sem mudança de controle (massa + linha), agora um card só; acrescentar na mensagem: "linhas com entrega `dd/MMM` resolvem sozinhas quando a inclusão ganhar data".

### 5.2 `ops-grupo.ts` / `rotulos.ts` / `importar-wizard.tsx`

- `ops-grupo.ts`: `patrimonio_vazio` → `opsDoGrupo` emite `editar` só das linhas preenchidas válidas; `grupoPronto` = false (fora do lote); `faltamNoGrupo` = 0.
- `rotulos.ts`: rótulos para `patrimonio_vazio` ("patrimônio vazio — vira pendência").
- `importar-wizard.tsx`: `tiposAviso` ganha `patrimonio_vazio`; o resumo do preview mostra "N sem patrimônio (importam com pendência)" ao lado de "N sem data".

## 6. Pendência visível fora do import

1. **`/pendencias`** (`queries/pendencias-detalhe.ts` + `components/pendencias/pendencias-filtros.tsx`): novo bucket `'patrimonio'` em `TipoPendencia` — `classificarPendencia` casa `sem patrimônio…` **e** `patrimônio não canônico…` (cobre também os 61 do go-live F4); filtro correspondente em `listarPendencias` (atenção à sintaxe `.or()` do PostgREST com `ilike`); chip novo na UI. `getPendencias` (chips dos relatórios) **não muda**.
2. **Lista de ativos** (`queries/ativos.ts`, `ativos-filtros.tsx`, `ativos-table.tsx`): patrimônio null exibe badge "sem patrimônio"; filtro novo `semPatrimonio` (`.is('patrimonio', null)`); conferir a busca textual null-safe.
3. **Ficha** (`ativos/[id]` + `corrigir-patrimonio-dialog.tsx`): título com patrimônio null → "Sem patrimônio" + badge de pendência; o diálogo da F6B deve abrir a partir de null (anotação "de — para WAP…"); **ao corrigir, limpar o trecho 'sem patrimônio físico' de `ativos.pendencia`** (preservando outros trechos separados por `;`).
4. **Toda exibição/ordenação/busca de patrimônio null-safe:** fluxo de nova movimentação (o ativo sem patrimônio precisa ser encontrável — por service tag/hostname se a busca for só por patrimônio, ampliar), termos F5A (`src/lib/termos/` ordena/imprime patrimônio → null ordena por último e imprime "sem patrimônio"), export CSV F3 (célula vazia), snapshots (leitura tolerante). Verificar `grep -rn "patrimonio"` em `src/` e tratar cada ponto de exibição.

## 7. Aceite (autoverificado — checklist da ordem)

Com **CSV fictício** que reproduza os padrões (dd/MMM com e sem inclusão; virada de ano; patrimônio vazio/n-a/"SEM PATRIMONIO"; só-números com hostname canônico; duas linhas sem patrimônio com mesma tag; sem patrimônio e sem tag):

1. dd/MMM + inclusão válida → ajuste datado pela entrega; virada de ano soma 1; futuro → cai para o aviso.
2. Entrega vazia → ajuste datado pela inclusão; nenhuma data → aviso `sem_data_entrada` (não bloqueia), importa como carga.
3. Patrimônio vazio → importa com null + pendência 'sem patrimônio físico'; aparece em `/pendencias` (bucket patrimônio) e na lista de ativos (badge + filtro); corrigir na ficha limpa a pendência.
4. Só-números → 1 card único com todas as linhas; botão "usar …" do hostname preenche; seção/global aplicam.
5. Duas linhas sem patrimônio + mesma tag → bloqueante de duplicata; mesma tag em OUTRA filial → `patrimonio_em_outra_filial`.
6. RPC: smoke em DEV com plano contendo patrimônio null (estado, colaborador e contagens conferem); migration `0034` aplicada em DEV e produção; advisors sem novidade além do aceito.
7. `npm run lint` + `npm run test` + `npm run build` verdes; testes novos do motor passando; suíte antiga intacta (retrocompatibilidade byte-a-byte sem os casos novos).
8. Referência de escala (1ª execução real, CSV fora do repo): ~529 entregas dd/MMM (≈321 resolvidas, ≈143 com ano+1), ~31 patrimônios vazios, ~117 fora do formato num card só. Ordens de grandeza — não são critérios de teste.

## 8. Registro e higiene

- `docs/DECISOES.md`: entrada `2026-07-17 · F7E` com as decisões da §1 (data · contexto · escolha · motivo) + o aumento do cap (§4.1) + a conferência agregada da RPC (§3.2).
- `docs/ESPECIFICACAO.md` §10.2: emendar — patrimônio opcional no import (pendência), datas `dd/MMM`, agrupamento por tipo.
- `README.md`: linha F7E no status.
- `src/lib/ajuda/conteudo.ts`: atualizar o texto de ajuda do import (patrimônio vazio deixa de ser bloqueante; datas dd/MMM automáticas).
- **NUNCA dados reais** em fixture/teste/screenshot/doc (CLAUDE.md regra 2). O CSV real não entra no repositório.
- Fora do escopo → backlog no resumo final: migrar os 61 placeholders `SEMPAT*` do go-live para patrimônio null (mutação de dado real — decisão à parte); modo Atualizar segue adiado.

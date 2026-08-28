# PLAN — F38 · Os itens andam com o ativo

> Plano de execução da ordem `docs/prompts/F38-itens-andam-com-o-ativo-ultracode.md` (28/08/2026).
> Escrito **depois** da exploração e **antes** da implementação. Onde este plano e a ordem
> divergirem, **a ordem manda**.

## 0. O estado medido, não presumido (28/08/2026)

| fato | valor |
|---|---|
| Versão no ar | `1.42.1` (`package.json` + `VERSOES[0]`) |
| Última migration no repo | `0115_fila_consolidacao_chave_vazia.sql` → **`0116`–`0119` livres** |
| `git status` | limpo, exceto o próprio arquivo da ordem (insumo da fase) |
| Baseline `npm run lint` | limpo |
| Baseline `npm run test` | **132 arquivos · 2663 testes · 0 falhas** |
| Baseline `npm run build` | limpo |
| Produção (`pbtjcalbmepmrqzprusb`) | ativos 1615 · movimentacoes 3430 · lancamentos_item 30 · itens 18 · pendencias_item 17 · colaboradores 0 · tipos_item 7 · filiais 6 |
| Ensaio (`sgmvldiizsrjbxzzpmhh`) | **ACTIVE_HEALTHY**, `public.ambiente.rotulo = 'desenvolvimento'`, última migration aplicada **`0109`** — faltam `0110`…`0115` |
| md5 `valida_lancamento_item` | `90f5c1bb63d215f196da4e2a7e9d87f0` — **idêntico** em produção e ensaio |
| md5 `rel_saldo_itens` | `552a9f0b9a2527cadd62770d2d1a90d2` — idêntico nos dois |
| md5 `rel_mov_itens` | `02cfff1692e6549fd983036637300cf2` — idêntico nos dois |

### md5 das funções que a fase promete NÃO tocar (produção, antes)

```
aplicar_movimentacao()                                    d2010a896dabc442a04cfe2f72c7b068
status_apos_movimentacao(status_ativo, tipo_movimentacao) 69a73abfcfe13d7b2560bb6908c09a72
status_tem_detentor(status_ativo)                         551c37d163ecd06fbf9c70fdb7f6945b
rel_estoque_asof(smallint, date)                          817f81d9f52b7694f2c1ae48899bc6f8
rel_saldo_itens(smallint, date)                           552a9f0b9a2527cadd62770d2d1a90d2
guarda_acervo()                                           0829c62705d936370e95eb6e42b67c4f
rel_mov_itens(smallint, date, date)                       02cfff1692e6549fd983036637300cf2
criar_compra_lote(jsonb, uuid)                            58533fd3d3011eb527065c9660c847a1
devolver_ao_fornecedor(uuid, jsonb, jsonb, uuid)          a7641d50a19e252141fc762117b687e2
transferir_item(...)                                      da0a511f3f57e11017a43be46ffa4b72
```

⚠ **`aplicar_movimentacao()` É o trigger da `0051`.** A ordem lista os dois como intocáveis; são a
mesma restrição, não duas. Um único md5 prova as duas promessas.

**A única função existente que esta fase recria:** `valida_lancamento_item()`, e sobre o corpo lido
do banco por `pg_get_functiondef` (gravado em `docs/perf/valida_lancamento_item-vigente.sql`).

## 1. A aritmética que governa tudo (cabeçalho da `0027`, transcrito)

```
total     = max(0, Σentrada + Σajuste)
atrelados = Σ_chamado max(0, Σreserva − Σliberacao)
liberados = max(0, Σsaida − Σretorno)
estoque   = max(0, total − atrelados − liberados)
falta     = max(0, atrelados + liberados − total)
```

Rótulos (F6A §A4): `entrada`→"Entrada" · `saida`→"Liberação" · `reserva`→"Atrelar" ·
`liberacao`→"Devolução" · `retorno`→"Retorno" · `ajuste`→"Ajuste".

**A partição da §C — não é fórmula nova:**

```
com_a_pessoa(item, filial, colaborador) = Σ saida(colaborador_id = C) − Σ retorno(colaborador_id = C)
```

Prova de que nada muda de número:
`Σ_C com_a_pessoa(C) + (Σ saida sem vínculo − Σ retorno sem vínculo) = Σsaida − Σretorno`, que é
exatamente o `liberados` **antes** do `max(0, …)`. O `max` fica onde sempre esteve, em
`rel_saldo_itens` — `rel_saldo_colaborador` **não** o replica (saldo por pessoa é uma parcela, e
zerá-la por baixo esconderia anomalia). Nenhuma das cinco fórmulas é reescrita, nenhuma sexta nasce.

## 2. As quatro migrations — DDL final

### `0116_lancamento_item_movimentacao.sql` — o vínculo

```sql
alter table public.lancamentos_item
  add column movimentacao_id uuid references public.movimentacoes (id);

create index lanc_item_mov_idx on public.lancamentos_item (movimentacao_id);
```

- Anulável, **sem default** — todo lançamento histórico continua válido, o avulso da tela de itens
  continua nascendo com ela nula. **Nenhum UPDATE em linha existente.**
- FK **imediata** (não `deferrable`). Confirmado por leitura: a `0050` precisou de `deferrable`
  porque quem insere é um trigger `before insert` em `movimentacoes` (a linha ainda não está na
  heap). Aqui a RPC da §B insere a movimentação **antes** dos itens, na mesma transação — quando o
  `insert` do item roda, a movimentação já está na heap.
- **Só `movimentacao_id`, nunca `ativo_id`.** "O que foi junto com este notebook" é um join.
- Índice de FK é **estrutural** (precedente `0106`), não otimização — serve ao join e ao `on delete`
  das ferramentas do `/dev`. Não é o índice de saldo por pessoa da §C (esse depende da curva).
- **Sem policy nova.** `lancamentos_item` já tem `"leitura operador"` (SELECT, piso) e
  `"operador lanca"` (INSERT, `pode_escrever_filial(filial_id) and estorno_item_coerente(...)`).
  Coluna nova entra na policy existente sem reescrevê-la — a policy não enumera colunas.
- Rollback lógico: `drop index lanc_item_mov_idx; alter table … drop column movimentacao_id;`

### `0117_criar_movimentacao_com_itens.sql` — a RPC transacional

```sql
create or replace function public.criar_movimentacao_com_itens(
  p_movimentacoes jsonb,   -- [ {row de movimentacoes}, … ] na ordem do lote
  p_itens         jsonb,   -- [ {indice_movimentacao, item_id, filial_id, tipo, quantidade, data, colaborador, colaborador_id, observacao, chamado}, … ]
  p_criado_por    uuid
) returns jsonb              -- {"movimentacoes": [uuid,…], "itens": <int>}
language plpgsql
security invoker             -- DECLARADO, não por omissão (§B.1)
set search_path to 'public'
```

**Ordem de execução, e por que é essa:**

1. Validar forma: `p_movimentacoes` array não-vazio, teto 30 (`MAX_LOTE_MOVIMENTACAO`);
   `indice_movimentacao` de cada item dentro do intervalo.
2. **Travar os ativos do lote em ordem crescente de `id`** —
   `perform 1 from public.ativos where id = any(v_ativos) order by id for update`.
   *Por que:* a transação única passa a segurar N row locks de `ativos` que hoje não coexistem (cada
   INSERT é a própria transação). Dois lotes com os mesmos ativos em ordens diferentes deadlockariam
   nos row locks que o trigger `aplicar_movimentacao` pega (`select … for update`). Ordem total pelo
   `id` fecha isso. **Ata obrigatória** — é decisão desta ordem, não da ordem escrita.
3. **Adquirir TODAS as advisory locks `(item_id, filial_id)`, em ordem total crescente, ANTES do
   primeiro INSERT** (§B.3, passo 5 da `0104`). Advisory locks são reentrantes: as que o trigger
   `valida_lancamento_item` pedir depois já estarão nas mãos.
4. INSERT das movimentações, **na ordem do array**, guardando os ids em `v_ids uuid[]`. Falha →
   `raise` com `detail = 'f38_linha=<i>'` para a action dizer QUAL linha derrubou o lote.
5. INSERT dos lançamentos de item, cada um com `movimentacao_id = v_ids[indice_movimentacao + 1]`.
6. `return jsonb_build_object('movimentacoes', to_jsonb(v_ids), 'itens', v_n_itens)`.

**O que a RPC NÃO faz** (lições da `0104`): não recalcula saldo (quem valida é o trigger, sob a
trava); não redige texto (observações chegam prontas de `src/lib/`); não decide autorização
(`security invoker` + as policies `"operador insere"` e `"operador lanca"`, linha a linha). As
guardas `pode_escrever_filial` no corpo são **cinto-e-suspensórios pela mensagem** — sem elas o
operador recebe `42501` cru, que a UI traduz como conselho errado.

Grants (padrão `0104`/`0064`):
```sql
revoke all on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid) from public, anon, service_role;
grant execute on function public.criar_movimentacao_com_itens(jsonb, jsonb, uuid) to authenticated;
```

### `0118_saldo_colaborador.sql` — a conta por pessoa + a guarda no trigger

```sql
create or replace function public.rel_saldo_colaborador(p_colaborador uuid)
returns table (
  item_id      smallint,
  item         text,
  filial_id    smallint,
  filial       text,
  com_a_pessoa bigint
) language sql stable security invoker set search_path = public as $$ … $$;
```

Corpo: `sum(case tipo when 'saida' then quantidade when 'retorno' then -quantidade else 0 end)`
agrupado por `(item_id, filial_id)`, `where colaborador_id = p_colaborador`, `having <> 0`.
**Sem `max(0, …)`** (ver §1). Grants: `revoke … from public, anon;`
`grant execute … to authenticated, service_role;` (precedente `0056`).

**A guarda nova em `valida_lancamento_item`** — recriação sobre o corpo lido do banco, md5 de
partida `90f5c1bb63d215f196da4e2a7e9d87f0` registrado na migration. A primeira linha
(`perform pg_advisory_xact_lock(new.item_id::int, new.filial_id::int)`) e toda a aritmética existente
saem **byte a byte**. Entra **um bloco novo**, espelho exato da guarda de `liberacao` contra
`reserva`:

```sql
if new.tipo::text = 'retorno' and new.colaborador_id is not null then
  select coalesce(sum(case l.tipo::text when 'saida'   then l.quantidade
                                        when 'retorno' then -l.quantidade else 0 end), 0)
  into v_pessoa_net
  from public.lancamentos_item l
  where l.item_id = new.item_id and l.filial_id = new.filial_id
    and l.colaborador_id = new.colaborador_id;
  if v_pessoa_net - new.quantidade < 0 then
    raise exception 'Retorno maior que o registrado com esta pessoa (não há % para retornar).', new.quantidade
      using errcode = 'check_violation';
  end if;
end if;
```

✅ **`lancamentos_item.colaborador_id` JÁ EXISTE** — conferido em produção: `uuid`, anulável, sem
default, nascido na F37 (`0113`), e `lancarItens` já o grava por `resolverColaboradoresPorNome`. A
`0118` **não cria coluna nenhuma**: só a leitura nova e o bloco novo no trigger.

⚠ **Retorno SEM `colaborador_id` continua valendo exatamente como hoje** — é o caminho de todo o
histórico, e não pode virar erro retroativo. A guarda antiga (retorno ≤ liberado em aberto, sem
recorte de pessoa) **continua valendo para os dois casos**; a nova só ACRESCENTA um teto quando há
pessoa nomeada.

### `0119_ciclo_pendencia_item.sql` — o ciclo fecha

RPC `public.resolver_pendencias_item_com_lancamentos(p_ids uuid[], p_desfecho text, p_observacao text, p_lancamentos jsonb, p_criado_por uuid)`,
`security invoker`, `set search_path`:

1. Travas advisory `(item_id, filial_id)` em ordem total crescente, antes do primeiro INSERT.
2. `update public.pendencias_item set … where id = any(p_ids) and status = 'aberta'` **returning id**
   — idempotência preservada (reenviar não re-resolve).
3. Insere os lançamentos **só das pendências que o UPDATE de fato resolveu** (`returning`), nunca das
   que já estavam resolvidas — é isso que impede lançamento duplicado numa corrida.
4. Tudo na mesma transação. Falha em qualquer ponto → nada resolvido, nada lançado.

RPC irmã `public.reabrir_pendencias_item_com_estornos(p_ids uuid[], p_justificativa text, p_criado_por uuid)`:
mesmo desenho, insere os **inversos** (`estorna_id` apontando o lançamento original;
`lanc_item_estorna_uidx` garante uma vez só) e reabre. Não conseguindo gravar o inverso, **recusa** —
nunca reabre deixando lançamento de pé.

**A aritmética dos dois desfechos, conferida contra a `0027`:**

| Desfecho | Lançamentos | total | atrelados | liberados | estoque | com_a_pessoa |
|---|---|---|---|---|---|---|
| `recuperado` | `retorno` 1 (com vínculo) | `=` | `=` | `−1` | **`+1`** | **`−1`** |
| `baixa` | `retorno` 1 (com vínculo) **+** `ajuste` −1 | **`−1`** | `=` | `−1` | `+1−1 = ` **`=`** | **`−1`** |

Conferência linha a linha: `retorno` não entra em `total` (só `entrada`/`ajuste`) → `recuperado`
deixa o Total intacto; entra em `liberados` com sinal negativo → `estoque = total − atrelados −
liberados` sobe 1. Na `baixa`, o `ajuste −1` derruba `total` em 1 e o `estoque` volta ao valor de
antes (`+1` do retorno, `−1` do ajuste). **Por que dois lançamentos e não um `ajuste` só:** `ajuste`
**não** entra em `Σsaida − Σretorno`, então um ajuste negativo sozinho tiraria do Total e deixaria o
item na conta da pessoa para sempre — o furo exato que esta frente fecha.

O `ajuste` exige `observacao` não vazia (`lanc_item_ajuste_obs`): texto composto por **função pura
em `src/lib/pendencias/texto-baixa.ts`**, testada — nunca dentro da função SQL (lição da `0104`).

## 3. A ponte tipo→item (§D e §E) — a regra, e o que a leitura corrigiu

**O que o modelo diz hoje:** `tipos_item` **não tem `filial_id`**; `itens` é catálogo **global** (18
linhas em produção), com `tipo_id smallint null references tipos_item(id)` (`0114`). A filial só
aparece no *saldo* (`lancamentos_item.filial_id`), nunca no catálogo. Logo "item de catálogo ativo
naquela filial" **não é uma consulta que o modelo suporte** como escrito.

**Regra implementada** (ata obrigatória):

- Candidatos = `itens` com `ativo = true` e `tipo_id` = o tipo da linha do checklist.
- **Exatamente um** candidato → resolve sozinho.
- **Zero** candidatos → a linha marcada "Devolvido" **não bloqueia**: a devolução é registrada, o
  lançamento não nasce, e a tela diz por quê ("nenhum item de catálogo deste tipo").
- **Dois ou mais** → a linha pergunta qual (combobox restrito ao tipo). A filial entra no combobox
  como **informação** (o saldo daquele item naquela filial), não como filtro do catálogo — porque o
  catálogo é global.
- O mesmo par de regras vale na §E, a partir de `pendencias_item.item` (que é um **slug de tipo**).
  **Resolver pendência nunca falha por causa do catálogo.**

Módulo: `src/lib/itens/ponte-tipo-item.ts` (função pura + teste). **Nome escolhido de propósito:**
`src/lib/itens/escolha-tipo.ts` já existe e é outra coisa (a escolha do *tipo de lançamento*).

## 4. O lote tudo-ou-nada (§B.2) — o que a leitura corrigiu sobre "o painel"

⚠ **O sucesso parcial do lote NÃO passa por `painel-sucesso.tsx`.** A leitura mostrou que
`nova-movimentacao-form.tsx:966-1030` só monta o `PainelSucesso` quando `res.ok === true` (sucesso
**total**). O caminho de sucesso parcial é `nova-movimentacao-form.tsx:1035-1076`: volta ao passo 2,
popula `errosPorAtivo` e `jaRegistrados` (renderizados em `passo-movimentacao.tsx:222-265`,
"Já registrados (N):" e "Itens que falharam no último envio:"), e emite o toast
`` `${res.criadas} registrada(s); ${falhaIds.length} falhou(aram). Revise os itens restantes.` ``.

**É esse caminho que é reescrito**, não o `painel-sucesso.tsx`. O que muda:

- `jaRegistrados` deixa de existir para este fluxo — nada foi gravado.
- O texto passa a dizer: **nada foi gravado**, **qual linha falhou**, **por quê**, e **o que fazer**.
- `RegistrarLoteResult.criadas` passa a ser `0` sempre que `ok === false`.
- Teste que quebra por decisão explícita: `src/lib/ajuda/conteudo.test.ts:192-212`, que exige o
  título de manual **"Depois de registrar: termos em sequência e sucesso parcial"** — o texto do
  manual é reescrito junto, e isso vai **nomeado no relatório**.
- **Nenhum outro teste existente muda.** Confirmado por grep: nenhum `*.test.ts` referencia
  `RegistrarLoteResult`, `ItemResultado`, `LancarItensResult` nem renderiza `PainelSucesso`.

**Validação antes de gravar** (§B.2, segunda bala): o passo de revisão passa a conferir o lote
inteiro contra o banco (patrimônio existe, estado permite a transição, filial) e mostrar o que vai
falhar **antes** do envio. Não substitui a validação do banco — é a primeira linha.

**O carrinho avulso (`lancarItens`) continua linha a linha.** O cabeçalho de `transferirItens`
(`src/lib/actions/itens.ts:141-153`) explica por que os dois desenhos coexistem de propósito: "lá as
linhas não se relacionam entre si". **Não unificar.**

## 5. Testes existentes que NÃO podem mudar

`config.test.ts` (27) · `troca-upgrade.test.ts` (58) · `rascunho.test.ts` (22) ·
`resumo-revisao.test.ts` (18) · `aplicar-kit.test.ts` (12) · `repetir-ultima.test.ts` (7) ·
`validators/movimentacao.test.ts` (~48) · `validators/item.test.ts` (~35) · `lote-url.test.ts` (18) ·
`agrupar-lote.test.ts` (9) · `selecao-ativos.test.ts` (25) · `tipos-item-sql.test.ts` (98 linhas) ·
`chave-sql.test.ts` · `dominio.test.ts` · `versoes/registry.test.ts` · `ajuda/registry.test.ts`.

**Muda um só, e por decisão explícita da §B.2:** `src/lib/ajuda/conteudo.test.ts:192-212`.

## 6. Guardas que vão reclamar — e como não acordá-las

**Preferência da ordem: sem rota nova.** "Com esta pessoa" entra como **bloco expansível na linha da
tabela** de `/admin/colaboradores` e como bloco no diálogo de devolução. Assim:

- `ajuda/registry.test.ts:199-203` (toda rota de `(app)` precisa de linha em `COBERTURA`) — não
  dispara.
- `ajuda/registry.test.ts:262-272` (a tela renderiza o `<LinkAjuda>` prometido) — não dispara.
- `paleta-comandos.tsx` — sem rota, sem entrada nova (não há teste, mas o comentário de
  `:79-80` pede espelho com a sidebar; a sidebar não muda).
- `smoke-prod.mjs` `ROTAS_LOGADO` — sem rota nova, nada a acrescentar. As checagens da Parte B
  (contagens/shape) ganham a conferência da coluna e das RPCs novas.
- Jargão de dev: `registry.test.ts:333-351` (11 termos) e `versoes/registry.test.ts:157-189` (21
  termos, inclui `RPC`, `policy`, `enum`, `deploy`, `commit`, `schema`). A entrada de versão e o
  texto de ajuda passam por essa peneira.

## 7. Roteiro SQL — `supabase/tests/f38_itens_com_ativo.sql`

Cenários (todos em `begin; … rollback;`, comparando **linhas de uma `select` final** — o MCP engole
`NOTICE`):

1. Vínculo: lançamento nascido pela RPC aponta a movimentação certa; o avulso continua com
   `movimentacao_id` nulo.
2. **Tudo-ou-nada:** lote com uma linha inválida grava **0** movimentações e **0** lançamentos
   (contagens antes/depois).
3. **Ordem das travas:** a RPC pede as advisory locks em ordem crescente `(item_id, filial_id)`
   mesmo quando o carrinho chega em ordem decrescente — provado por `pg_locks`.
4. Saldo por pessoa: `Σ_C com_a_pessoa(C) + sem_vínculo = liberados` para todo item×filial.
5. Guarda nova: `retorno` com pessoa acima do saldo dela é recusado; `retorno` **sem** pessoa passa
   como sempre passou.
6. §C.3: devolução de equipamento entregue **antes** da fase (pessoa com saldo zero) grava o
   `retorno` **sem** vínculo e repõe o estoque.
7. `recuperado`: estoque +1, pessoa −1, Total inalterado.
8. `baixa`: pessoa −1, Total −1, estoque de volta ao que era.
9. Reabertura grava os inversos; reenviar não duplica.
10. Estorno de movimentação com itens grava os inversos dos itens vinculados.
11. O caminho "Faltante" continua **byte a byte**: `itens_faltantes` com os mesmos slugs, pendência
    nasce pelo trigger, `aplicar_movimentacao` não foi recriado.

⚠ **Regra da pendência nº 5 da F37:** duas movimentações do mesmo ativo na mesma transação precisam
de `created_at` **explícito e distinto**, senão o desempate cai num sorteio de uuid e o roteiro fica
intermitente.

## 8. Ordem de implementação (escolhida para dar rollback limpo)

1. **Curva** (frente 0) — rodando; decide o índice `lanc_item_colaborador_idx`.
2. Pôr o **ensaio em dia** (`0110`…`0115`) — pré-requisito para rodar `f37_colaboradores_tipos.sql`
   e `papeis_rls.sql` lá (regra F17).
3. `0116` vínculo.
4. `0117` RPC + wizard + o caminho de erro do lote reescrito + validação prévia na revisão.
5. `0118` saldo por pessoa + guarda no trigger.
6. Checklist de dois desfechos (encontra a §C no diálogo de devolução — **ponto de sincronização**).
7. `0119` ciclo da pendência + reabertura.
8. Leituras de tela ("o que foi junto", "Com esta pessoa", contagem de sem-vínculo agregada no SQL).
9. Versão `1.43.0` + documentação + tag.

Verificar `lint`/`test`/`build` a cada incremento.

## 9. O que esta fase NÃO toca

Termos e os 7 `.docx` (é a F39) · `ACESSORIOS_DEVOLUCAO` continua vivo como fallback de rótulo ·
`aplicar_movimentacao` / `status_apos_movimentacao` / `status_tem_detentor` / `rel_estoque_asof` /
`guarda_acervo` / `rel_saldo_itens` byte a byte · nenhum valor novo de enum · nenhum UPDATE/DELETE em
`movimentacoes` ou `lancamentos_item` · nenhum índice sem número da curva · `ativos.colaborador_atual`
continua texto · nenhuma dependência nova · custo R$ 0 · nenhum dado real.

# PLAN-F31 — Onda C2: transferência de item entre filiais + modo Conferência

Plano autossuficiente da ordem `docs/prompts/F31-onda-c2-ultracode.md` (itens **ITN-01** e
**ITN-04** de `docs/ANALISE-UX-2026-08-07.md` §5). Os dois recursos tocam a MESMA área
(`/itens`, `actions/itens.ts`, o diálogo) — por isso são trabalhados **em sequência**:
a transferência primeiro, porque ela consolida a esteira de ajustes que a conferência reusa.

---

## 0. Fatos medidos ANTES de desenhar (não são suposições)

Tudo abaixo foi lido do banco de **ensaio** (`sgmvldiizsrjbxzzpmhh`) ou do código, nesta ordem
de serviço, e é o que sustenta as decisões.

### 0.1 A semântica do saldo — por que transferir "do jeito intuitivo" corrompe o Total

Corpo vivo de `valida_lancamento_item()` (trigger de `lancamentos_item`, 0015→0027):

```
total_raw = Σ(entrada) + Σ(ajuste)
lib_raw   = Σ(saida)   − Σ(retorno)
atrelados = Σ por chamado de max(0, Σ(reserva) − Σ(liberacao))
estoque   = total_raw − atrelados − max(0, lib_raw)
recusa se total_raw < 0  →  'Ajuste inválido: deixaria o item com total % …'
recusa se estoque   < 0  →  'Estoque insuficiente: a operação deixaria % na prateleira …'
```

Logo: **só `entrada` e `ajuste` mexem no Total.** `saida` (rótulo "Liberação") baixa o estoque
e **deixa o Total intacto** — é isso que faz "Liberação na origem + Entrada no destino" inflar
o Total consolidado em +N para sempre. O par de **ajustes −N/+N** é o único caminho que mexe
no estoque das duas filiais e devolve **Total consolidado inalterado**.

### 0.2 O padrão de RPC da casa é **SECURITY INVOKER**, não definer

```
proname                 | args                                             | prosecdef
criar_compra_lote       | p_itens jsonb, p_criado_por uuid                  | false
devolver_ao_fornecedor  | p_ativo_id uuid, p_mov jsonb, …                   | false
```

Consequência de desenho: a autorização real é a **RLS**, não uma guarda escrita dentro da
função. A policy de INSERT de `lancamentos_item` é

```
"operador lanca"  INSERT  with check (pode_escrever_filial(filial_id)
                                      AND estorno_item_coerente(estorna_id, filial_id, item_id))
```

— e ela é avaliada **linha a linha**. Ou seja: numa RPC invoker, a perna de origem E a perna de
destino passam cada uma pela policy, e a **permissão nos dois lados sai de graça e no lugar
certo (o Postgres)**. A guarda `pode_escrever_filial` dentro da função é cinto-e-suspensórios
**pela mensagem** (sem ela o operador recebe o 42501 cru, que a UI traduz como "faça login
novamente" — conselho errado para quem só não tem a filial vinculada). É o que o cabeçalho da
`0064` já diz, textualmente, sobre `criar_compra_lote`.

Grants: `revoke all … from public, anon, service_role;` + `grant execute … to authenticated;`

### 0.3 As constraints que o par de ajustes tem de satisfazer

```
lanc_item_qtd_valida  CHECK (tipo = 'ajuste' → quantidade <> 0; senão quantidade > 0)
lanc_item_ajuste_obs  CHECK (tipo <> 'ajuste' OR (observacao is not null AND length(btrim(observacao)) > 0))
lanc_item_chamado     CHECK (tipo not in (reserva, liberacao) OR chamado não vazio)
```

O ajuste **exige observação não vazia** — e a observação cruzada da transferência
("Transferência para Serra …") já a satisfaz por construção.

### 0.4 ⚠ O deadlock que o desenho ingênuo cria (achado desta fase, não copiado de lugar nenhum)

O trigger faz, **na primeira linha do corpo**:

```sql
perform pg_advisory_xact_lock(new.item_id::int, new.filial_id::int);
```

Advisory lock **de transação**, por par (item, filial). Numa RPC que grava as duas pernas na
MESMA transação, isso significa **duas travas por item**, adquiridas na ordem em que os
INSERTs acontecem. Duas transferências simultâneas em sentidos opostos —
`Matriz→Serra` e `Serra→Matriz` do mesmo item — pegariam `(item, matriz)` e `(item, serra)`
em ordens **invertidas**: deadlock clássico. Com carrinho de vários itens, a mesma inversão
acontece entre itens em ordens diferentes.

É exatamente a classe de bug que a `0100` (F24) precisou consertar depois de já estar em
produção. **Fecho preventivo:** a RPC adquire TODAS as travas ela mesma, **antes do primeiro
INSERT**, em ordem total determinística `(item_id, filial_id)` crescente. Advisory locks são
reentrantes na mesma sessão, então as travas que o trigger pedir depois já estarão nas mãos e
não haverá nova aquisição fora de ordem. Provado no roteiro SQL (caso 6).

---

## 1. Recurso 1 · ITN-01 — Transferir item entre filiais

### 1.1 Caminho de atomicidade: **1a (RPC transacional)** — decidido, não presumido

Os dois projetos Supabase respondem por MCP (`list_projects` → ensaio `sgmvldiizsrjbxzzpmhh`
ACTIVE_HEALTHY, produção `pbtjcalbmepmrqzprusb` ACTIVE_HEALTHY) e `execute_sql` roda. O
caminho **1b (compensação por estorno na camada de app)** fica **descartado** e registrado:
ele é estritamente pior aqui, porque o estorno compensatório é ele mesmo uma escrita que pode
falhar (e falha **exatamente** nas condições em que se precisa dela: rede caindo, sessão
expirando), e porque um estorno de perna **é** o dano que este recurso existe para evitar
(§1.6). A migration é **aditiva** (função nova, nenhum objeto existente tocado) → **caminho A**
do `docs/RUNBOOK-BANCO.md`: ensaio primeiro, produção depois, verificação pós-apply.

### 1.2 A migration — `supabase/migrations/0104_transferir_item.sql`

Assinatura **exata** (é o contrato; qualquer mudança nela é mudança de plano):

```sql
create or replace function public.transferir_item(
  p_origem      smallint,
  p_destino     smallint,
  p_itens       jsonb,   -- [{"item_id": 3, "quantidade": 10}, …]  quantidade > 0
  p_data        date,
  p_chamado     text,
  p_obs_origem  text,    -- já composta pela action (ver §1.3) — o SQL não redige texto
  p_obs_destino text,
  p_criado_por  uuid
) returns integer        -- nº de ITENS transferidos (= metade das linhas gravadas)
language plpgsql
security invoker
set search_path to 'public'
```

Corpo, na ordem:

1. `p_origem = p_destino` → `raise … 'A filial de destino não pode ser a mesma da origem.'`
   (errcode `22023`).
2. `p_itens` não-array ou vazio → `raise … 'Transferência sem item.'`
3. `p_obs_origem`/`p_obs_destino` vazias → `raise` (o CHECK `lanc_item_ajuste_obs` pegaria
   depois, mas com mensagem de banco em vez de mensagem nossa).
4. **Guardas de vínculo, nos DOIS lados**, com a frase que `traduzErroBanco` já reconhece
   (`'sem permissao de escrita na filial'` → "Você não tem permissão de escrita nesta filial."):
   `if not pode_escrever_filial(p_origem) then raise … 'Sem permissao de escrita na filial % (origem da transferencia).'` e o espelho para destino, ambas `errcode = '42501'`.
5. Validação por item: `item_id` inteiro > 0, `quantidade` inteira > 0, **item repetido recusa**
   (`'O item % aparece duas vezes na transferência — some as quantidades.'`).
6. **Travas em ordem total determinística** (§0.4):
   ```sql
   for v_par in
     select x.item_id, x.filial from (
       select (e->>'item_id')::int as item_id, p_origem  as filial from jsonb_array_elements(p_itens) e
       union all
       select (e->>'item_id')::int,            p_destino        from jsonb_array_elements(p_itens) e
     ) x order by x.item_id, x.filial
   loop perform pg_advisory_xact_lock(v_par.item_id, v_par.filial); end loop;
   ```
7. Por item, dois INSERTs `tipo = 'ajuste'`: `−quantidade` em `p_origem` com `p_obs_origem`,
   `+quantidade` em `p_destino` com `p_obs_destino`. `criado_por = coalesce(auth.uid(), p_criado_por)`
   (idêntico a `criar_compra_lote`). `chamado = nullif(btrim(p_chamado), '')`, `colaborador = null`,
   `data = coalesce(p_data, current_date)`.
8. `return jsonb_array_length(p_itens)`.

Grants no rodapé: `revoke all … from public, anon, service_role;` + `grant … to authenticated;`.
Rollback documentado: `drop function public.transferir_item(smallint,smallint,jsonb,date,text,text,text,uuid);`
— aditiva, nenhum dado se perde.

**O que a RPC NÃO faz, de propósito:** não valida saldo por conta própria. Quem valida é o
trigger, linha a linha, sob a trava — e ele é a fonte da verdade. Uma segunda conta aqui só
criaria uma segunda definição de "estoque", que é o defeito que o CLAUDE.md proíbe.

### 1.3 Os textos das duas pernas — **em TypeScript, nunca em SQL**

`src/lib/itens/transferencia.ts` (módulo PURO, testado):

```ts
export const PREFIXO_TRANSFERENCIA_SAIDA   = 'Transferência para '
export const PREFIXO_TRANSFERENCIA_ENTRADA = 'Transferência de '

/** As duas observações cruzadas de uma transferência. `obs` é o texto do operador. */
export function observacoesDaTransferencia(
  filialOrigem: string, filialDestino: string, obs?: string | null,
): { origem: string; destino: string }

/** Esta linha do histórico é perna de transferência? (derivação de APRESENTAÇÃO) */
export function ehPernaDeTransferencia(
  tipo: string, observacao: string | null | undefined,
): 'saida' | 'entrada' | null
```

**Por que o texto não mora no SQL:** se a frase fosse escrita dentro da função, o selo visual
do histórico teria de repeti-la em TypeScript — duas cópias da mesma string, em linguagens
diferentes, que divergem no primeiro `create or replace`. Compondo na action e passando pronta,
existe **uma** definição, e o teste puro a trava. (É o mesmo raciocínio da "REGRA DE OURO" das
páginas de ajuda.)

Formato: `Transferência para Serra — Estoque de giro` / `Transferência de Matriz — Estoque de
giro` (o `— {obs}` só aparece se o operador escreveu algo).

### 1.4 Validação compartilhada — `src/lib/validators/item.ts`

```ts
export const MAX_LINHAS_TRANSFERENCIA_ITEM = MAX_LINHAS_LOTE_ITEM  // mesmo teto, mesma razão
export const MSG_TRANSFERENCIA_MESMA_FILIAL = 'A filial de destino não pode ser a mesma da origem'
export const transferenciaItemSchema = z.object({
  origem_id, destino_id, linhas: [{ item_id, quantidade > 0 }], chamado?, data, observacao?
}).superRefine(…)   // origem ≠ destino; quantidade > 0 em TODA linha; item repetido
```

Reusa `indicesDeItemRepetido` e `errosPorLinhaDoLote` (já existem). **Não** cria tipo novo no
enum do banco — decisão da análise, registrada.

### 1.5 A Server Action — `src/lib/actions/itens.ts`

```ts
export type TransferirItensResult = { ok: boolean; itens?: number; erro?: string }

export async function transferirItens(input: TransferirItemInput): Promise<TransferirItensResult>
```

1. `transferenciaItemSchema.safeParse` → erro de payload volta como `erro`.
2. **`exigirEscrita(supabase, origem)` E `exigirEscrita(supabase, destino)`** — as duas, em
   sequência, ANTES da RPC. É a mensagem em pt-BR; a segurança é a RLS (§0.2).
3. Lê os NOMES das duas filiais (`listarFiliais`) para compor as observações — nome que a UI
   mandasse viria do cliente e poderia mentir no histórico.
4. `supabase.rpc('transferir_item', { … })`; erro → `traduzErroBanco(error.message, error.code)`.
5. `revalidarItens()` + `revalidatePath('/relatorios', 'layout')` (idêntico a `lancarItens`).

**Tudo-ou-nada:** a RPC é uma transação; não há resultado por linha e não há sucesso parcial.
Se uma linha estourar saldo, **nada** é gravado — que é o ponto do recurso.

### 1.6 Estorno de perna de transferência — comportamento ESCOLHIDO e por quê

`estornarLancamento` cria o inverso **na mesma filial** do original. Estornar só a perna de
origem (`−10`) grava `+10` na origem e **o Total consolidado sobe 10** — exatamente a corrupção
que este recurso existe para impedir; e a transferência fica pela metade.

**Escolha: AVISAR, não bloquear.** O diálogo de estorno passa a mostrar um aviso explícito
quando a linha é perna de transferência, dizendo (a) que desfaz **só este lado**, (b) que o
Total consolidado muda, e (c) qual é o caminho certo — **transferir de volta**.

- *Por que não bloquear:* bloquear só na UI não é trava (a regra viveria fora do Postgres, o
  que o CLAUDE.md proíbe como única linha), e travar no banco exigiria mexer em constraint/policy
  de `lancamentos_item` — **fora do escopo** desta ordem ("nenhum toque em tabelas/policies/RPCs
  existentes"). Um bloqueio de UI daria a **ilusão** de garantia sem a garantia.
- *Por que avisar resolve:* o operador que errou o item tem o caminho certo na frente
  (transferência inversa), e quem insistir no estorno o faz sabendo o efeito.

Registrado em `docs/DECISOES.md` e escrito na ajuda.

### 1.7 UI

- **`src/components/itens/transferir-item-dialog.tsx`** (client): origem, destino (opções =
  `filiaisEscrita` menos a origem), carrinho de linhas (mesmo padrão do lançamento, `ItemCombobox`),
  quantidade sempre positiva, chamado e observação opcionais, data.
  **Saldo da origem por item:** reusa `buscarSaldosItens(origem)` (o mesmo mecanismo do
  combobox da F28/ITN-05d) — o combobox recebe `filialId={origemId}` e já mostra "Mouse USB · 14".
  Além disso o diálogo **recusa no cliente** quantidade > saldo da origem, com o erro na linha
  ("Só há 14 na origem"). O servidor recusa de novo pelo trigger, de qualquer forma.
- **Entrada 1:** botão "Transferir" no cabeçalho de `/itens`, ao lado de "Lançar" — só quando
  `escreve` **e** `filiaisEscrita.length >= 2` (com uma filial só não há transferência possível).
- **Entrada 2:** na visão por filial, a célula de cada filial ganha o atalho que **pré-preenche
  item + origem** (`CustomEvent`, espelho de `EVENTO_LANCAR_ITEM`). ⚠ Diferente do "+" de
  lançamento, que é da LINHA e não manda filial: aqui a **célula** é o dado que falta (a origem),
  então o atalho é **da célula** — e só aparece na célula cuja filial este cargo escreve **e**
  que tenha estoque > 0.
- Fora do escopo: transferência de **ativos** (já é movimentação), agendamento/aprovação.

### 1.8 Histórico e relatório

As duas pernas aparecem como **Ajuste**, com as observações cruzadas. **Nenhuma contagem muda**
— `ajuste` já era contado como sempre foi, em toda parte. O único acréscimo é o **selo visual
"transferência"** na coluna Tipo do histórico de `/itens`, derivado de
`ehPernaDeTransferencia(tipo, observacao)`: é **apresentação**, não dado, e está registrado como
tal em `DECISOES.md`.

### 1.9 Roteiro SQL — `supabase/tests/transferencia_item.sql`

Padrão da casa (`begin; … rollback;`, `NOTICE '✓'` / `WARNING '✗'`, o CI falha em qualquer `✗`,
fixtures 100% fictícias). Casos:

1. transfere 2 itens Matriz→Serra: origem −N, destino +N em `lancamentos_item`;
2. **Total consolidado ANTES = DEPOIS** (via `rel_saldo_itens(null, null)`) e estoque de cada
   lado mexeu na medida certa — **é a evidência numérica que o critério de aceitação exige**;
3. saldo insuficiente na origem → recusa, e **nada** sobra (nem a perna de destino);
4. `origem = destino` → recusa;
5. item repetido no payload → recusa;
6. as travas são adquiridas em ordem `(item_id, filial_id)` — provado por
   `pg_locks` dentro da transação (o conjunto de `objid` esperado, e a ORDEM em que a função
   as pediu, conferida por `select … from pg_locks where locktype='advisory'`);
7. grants: `authenticated` = true, `anon`/`service_role` = false.

---

## 2. Recurso 2 · ITN-04 — Modo Conferência (inventário físico)

### 2.1 Onde mora: **rota própria `/itens/conferencia`** (não um modo dentro de `/itens`)

`/itens` já é um Server Component grande, orientado 100% por `searchParams`, com duas visões,
dois blocos de filtros e uma tabela sticky. A conferência é o oposto: um fluxo **client, com
estado longo** (contagens, rascunho, progresso por bloco, sucesso parcial). Enfiá-la como modo
de `?conferir=N` faria a página renderizar um corpo completamente diferente e misturaria as
duas naturezas.

O precedente da casa para exatamente isso é **`/movimentacoes/nova`** — fluxo stateful, com
rascunho em `sessionStorage`, fora da lista. A conferência segue o mesmo molde.

**Custo assumido (mecânico, e todo travado por teste):** rota nova em `src/app/(app)/**` exige
(a) página de ajuda nova no registry, (b) entrada em `PAGINAS_AJUDA` de
`scripts/smoke/smoke-prod.mjs`, (c) linha na matriz `COBERTURA` de `registry.test.ts`, e
(d) um `<LinkAjuda pagina="conferencia-de-estoque">` de verdade na page.

### 2.2 Escolha da filial

`/itens/conferencia?filial=N`. Sem `filial` (ou com filial em que o cargo não escreve), a página
mostra o **seletor de entrada**: "De qual filial é a conferência?" com as filiais de escrita.
Uma filial por vez — casa com o mundo físico e não deixa ambiguidade de saldo.

### 2.3 A tela

Tabela dos itens **daquela filial** (`getSaldosItens(filialId)`, a mesma leitura de `/itens`),
agrupada por `GrupoItem` como a visão consolidada, com as colunas:

| Item | Sistema | **Contado** | **Diferença** |

- **Contado**: `<input type="number" inputMode="numeric" min={0}>`, `min-h-11` (alvo de toque
  do padrão F29). Vazio = **não conferido**, fica de fora de tudo.
- **Diferença**: `contado − sistema`, ao vivo, com realce (verde sobrando, vermelho faltando,
  neutro batendo).
- **Resumo fixo** (barra grudada no rodapé): `"N conferidos · M com diferença (+X / −Y)"`.

### 2.4 Rascunho — `src/components/itens/conferencia/rascunho.ts`

Módulo **PURO** (sem React), chave `wap:itens:conferencia`, cópia do padrão de
`src/components/movimentacoes/nova/rascunho.ts` — **copiado, não importado** (a ordem diz isso
explicitamente, e os dois têm formas diferentes).

```ts
export const CHAVE_RASCUNHO_CONFERENCIA = 'wap:itens:conferencia'
export type RascunhoConferencia = {
  filialId: number
  contagens: Record<number, string>   // itemId → texto digitado
  gravados: number[]                  // itens JÁ registrados (idempotência do reenvio)
  observacao?: string
  iniciadaEm?: string                 // ISO — alimenta "começada às {hora}"
}
export function desserializarRascunhoConferencia(bruto: string | null): RascunhoConferencia | null
export function lerRascunhoConferencia(): RascunhoConferencia | null
export function salvarRascunhoConferencia(r: RascunhoConferencia): void
export function limparRascunhoConferencia(): void
```

Desserialização defensiva (o operador edita o `sessionStorage`; uma versão antiga do app gravou
outra forma): filial inválida → `null`; contagens com chave/valor fora de forma → descartadas;
`gravados` saneado como lista de inteiros. Nunca lança. Banner
**"Continuar conferência de {filial} começada às {hora}?"** com **Continuar** / **Descartar**;
limpa ao concluir.

### 2.5 Cálculo — `src/lib/itens/conferencia.ts` (puro, testado)

```ts
export type LinhaConferencia = { itemId: number; item: string; sistema: number; contado: number; diff: number }
export type ResumoConferencia = { conferidos: number; comDiferenca: number; sobrando: number; faltando: number }

export function linhasDaConferencia(saldos, contagens): LinhaConferencia[]  // só as CONTADAS
export function resumoDaConferencia(linhas): ResumoConferencia
export function ajustesDaConferencia(linhas): { item_id: number; quantidade: number }[] // só diff ≠ 0
export function particionar<T>(itens: readonly T[], teto: number): T[][]
export function itensPendentes(ajustes, gravados: readonly number[]): typeof ajustes  // idempotência
export const MSG_OBS_INVENTARIO = (dataBR: string) => `Inventário de ${dataBR}`
```

### 2.6 Gravação — reusa `lancarItens`, em blocos

Botão **"Registrar diferenças (M)"** → diálogo de confirmação listando **cada** ajuste
(item, −/+N) e o campo de observação pré-preenchido com `Inventário de {dd/MM/yyyy}` (editável;
vira a justificativa de **cada** linha; o CHECK `lanc_item_ajuste_obs` a exige).

Envio: `particionar(pendentes, MAX_LINHAS_LOTE_ITEM)` → um `lancarItens({ tipo: 'ajuste', … })`
por bloco, **sequencial**, com progresso visível ("Bloco 2 de 4 · 18 de 34 itens"). **Teto
reusado, não inventado** — o trigger valida linha a linha de qualquer forma, e uma constante
própria seria uma segunda definição do mesmo limite.

**Sucesso parcial (padrão do wizard):** cada bloco devolve `resultados[]` por linha. Item com
`ok` entra em `gravados` (e é salvo no rascunho **imediatamente**); item com erro fica na tela
com o motivo na própria linha. **Reenviar só manda o que falta** — `itensPendentes` filtra por
`gravados`, então nada é gravado duas vezes, mesmo com o mesmo clique repetido.

### 2.7 Permissão

Página resolve `getOperador()`; sem sessão → `/login`. As filiais oferecidas são
`filiaisParaEscrita(operador, filiais)`; filial fora dela → volta ao seletor. O botão
**"Conferir estoque"** em `/itens` só aparece com `escreve && filiaisEscrita.length > 0`.
Consulta não vê o botão e, se digitar a URL, cai no seletor sem opções com o aviso
`AvisoSemFilialDeEscrita`. A trava real continua sendo a policy `"operador lanca"` (a
conferência grava pelo mesmo `lancarItens`, com o mesmo `exigirEscrita`).

### 2.8 Ajuda

Página nova **`conferencia-de-estoque`** (categoria `fazer`), com o bloco
`{ tipo: 'titulo', id: 'conferencia', texto: 'Conferência de estoque (inventário)' }`, o passo a
passo, a relação com os ajustes, e a tabela "erros comuns e como sair". Links cruzados de/para
`lancar-itens` e `saldos-e-estoque-minimo`.

### 2.9 Fora deste recurso (backlog)

Histórico/agenda de inventários; contagem cega; relatórios de acuracidade; conferência de
**ativos**.

---

## 3. O que NÃO se toca

- Modelo de acesso, RLS, máquina de estados de ativos, contagens de relatório: **leitura apenas**.
- Enum `tipo_lancamento`: **nenhum valor novo** — a transferência é `ajuste` (decisão da análise).
- `supabase/`: **só** a migration aditiva `0104` + o roteiro `transferencia_item.sql`.
  `supabase db push` proibido. Nada destrutivo.
- `src/components/ui/`, `src/lib/types/database.ts` (só se a RPC exigir e o ambiente permitir).
- Dependência nova: **jamais**. Dados reais em fixture/teste/screenshot: proibição permanente.
- Recursos da F30 e as sobras miúdas sem onda (FLX-06, MOV-15, ATV-11, PND-07, REL-11/12,
  ADM-08/09/10, UXG-09/11/14…): backlog.

---

## 4. Verificação de ponta a ponta (obrigatória no relatório, com números)

### 4.1 Transferência (dados fictícios)

Transferir 2 itens Matriz→Serra → saldos dos dois lados refletem → **Total consolidado
inalterado (número antes = número depois)** → histórico mostra o par com as observações
cruzadas e o selo → estornar uma perna avisa o que avisa (§1.6) → quantidade acima do saldo
recusada **no cliente E no servidor**.

### 4.2 Conferência (dados fictícios)

Conferir uma filial com 6 itens (2 batendo, 2 sobrando, 2 faltando) → refresh no meio (o
rascunho volta com o banner) → registrar → saldos atualizados e histórico com os ajustes e a
observação de inventário → **refazer a conferência dá tudo zerado**. Mais: linha em branco fica
de fora; erro forçado numa linha mantém as demais e o reenvio manda **só** a que faltou.

### 4.3 Portões

`npm run lint`, `npm run test`, `npm run build` limpos, saídas reais coladas. Roteiro SQL verde
nos **dois** bancos. Smoke (`node scripts/smoke/smoke-prod.mjs`) depois do push.

# Relatório — F28 · Onda B1 (a rotina diária do operador)

Ordem: [`docs/prompts/F28-onda-b1-operacao-ultracode.md`](prompts/F28-onda-b1-operacao-ultracode.md) ·
Fonte: [`docs/ANALISE-UX-2026-08-07.md`](ANALISE-UX-2026-08-07.md) §§3–5 (empacotamento em §10) ·
Execução: 07/08/2026, modo autônomo, direto na `main`.

**22 itens** nas quatro telas de operação — movimentações, ativos, pendências e itens.
**Zero dependência nova.** O diff de `supabase/` contém **apenas** a migration aditiva do item 18 e
o roteiro que a prova — **aplicadas em ensaio e produção** no fim da sessão, quando o MCP de banco
foi conectado (§9).

---

## 1. Baseline medido antes de editar

| Medida | Antes (`0ecf4ae`) | Depois (`ef42e39`) |
|---|---|---|
| `npm run lint` | exit 0, sem saída | exit 0, sem saída |
| `npm run test` | **87 arquivos · 1.899 testes** | **95 arquivos · 2.041 testes** |
| `npm run build` | — | ✓ compilado, 27 páginas |
| Arquivos alterados | — | 91 (+6.188 / −666) |

Untracked esperados no início: as duas ordens de serviço da Onda B (`F28`, `F29`), commitadas no
primeiro commit da fase. `_claude_tmp/` **não existia** — nada a apagar.

---

## 2. Como a fase foi executada

Os quatro blocos da ordem são quase disjuntos, então a execução foi **paralela de verdade**: nove
frentes simultâneas, cada uma com **dono exclusivo por arquivo**, mais dois estágios sequenciais
dentro das frentes que mexiam no mesmo trio de arquivos (a ordem manda MOV-02 antes de MOV-10/11).

O que tornou isso seguro, e vale para a próxima fase que repetir a receita:

- **Dono único por arquivo, escrito antes de começar** (o `PLAN.md` é o contrato). Quem não é dono
  lê à vontade e não escreve.
- **`Edit` (substituição de trecho), nunca `Write`, em arquivo existente** — `Write` sobrescreve o
  arquivo inteiro e apagaria o trabalho de quem estivesse no mesmo arquivo.
- **Os arquivos compartilhados foram feitos ANTES, pelo orquestrador** (`formatTime` e
  `formatTempoRelativo` em `lib/format.ts`; a prop `trigger` do `CorrigirPatrimonioDialog`) e os
  disputados ficaram **reservados** a ele (`actions/exportar.ts`, a linha do `podeReabrir` na ficha).
- **Nenhuma frente roda `git` nem `npm run build`** (índice do git e `.next` são recursos únicos);
  cada uma roda só `npx eslint` e `npx vitest` dos seus arquivos. Lint, suíte completa e build são do
  orquestrador, no fim.

Resultado: **16 agentes, 0 colisão de escrita, 0 trabalho perdido**.

---

## 3. Checklist dos 22 itens — autoverificado

Legenda: ✅ entregue · ⚠️ entregue com desvio registrado.

### Bloco 1 · Wizard e lista de movimentações

| # | Item | Estado | Evidência |
|---|---|---|---|
| 1 | **MOV-02** Revisão mostra o que será gravado | ✅ | `nova/resumo-revisao.ts` (+**19 testes**) monta o card a partir de `campoAplica`; `passo-revisao.tsx` desenha o card acima da tabela, com **Data em destaque**, e a tabela ficou só com os ativos. Na troca são **dois cards**, o da contrapartida via `configDaContrapartida` — a mesma função. `PassoRevisao` ganhou a prop `statusResultante`, que não recebia. |
| 2 | **MOV-03** Aviso antecipado de vínculo | ✅ | `escreveNaFilial(papel, filiaisEscrita, filialId)` em `auth/papeis.ts` (testada nos 4 cargos); a página passa `papel`+`filiaisEscrita`; badge âmbar por item em `passo-ativos.tsx` **e** em `secao-contrapartida.tsx`. Nada trava; `exigirEscritaEm` intacto. |
| 3 | **MOV-05** "O que registrei hoje?" | ✅ | `lib/movimentacoes/chips-periodo.ts` (+15 testes) → chips **Hoje · Ontem · 7 dias** na URL; `?autor=eu` resolvido no servidor para `criadoPor`; query e contagem saem da mesma `queryLista`; `autor` entra em `temFiltro` e no "Limpar". **CSV: não existe export de movimentações** — ata §7. |
| 4 | **MOV-06** Lote visível e "Duplicar" | ✅ | `formatTime(created_at)` ao lado da data do evento; `lib/movimentacoes/agrupar-lote.ts` (+9 testes) marca onde **autor+minuto** mudam; "Duplicar" por linha, escondido em `estorno`. Limitação do agrupamento derivado documentada no módulo e na ata §1. |
| 5 | **MOV-10** "Registrar outro lote…" | ✅ | `reiniciar({ manterConfig: true })` preserva `config`+`statusResultante` e limpa o resto; segundo botão em `painel-sucesso.tsx`. Chamada sem argumento segue idêntica ao comportamento antigo. |
| 6 | **MOV-11** Banner de rascunho informativo | ✅ | `Rascunho` ganhou `patrimonios?`/`tipo?`/`salvoEm?`, **opcionais e saneados**; banner mostra "N ativos (WAP…, WAP…) · Tipo · salvo há X"; **3 testes novos** em `rascunho.test.ts`, incluindo o rascunho antigo restaurando sem erro. |
| 7 | **MOV-12** Devolução no dialeto do wizard | ✅ | `ChipsData` no campo de data; box de erro com `role="alert"` + `tabIndex={-1}` + foco/scroll (cópia do wizard); 6 erros inline com `aria-invalid`/`aria-describedby` e **foco no primeiro na ordem VISUAL** — o código checava filial por último. |

### Bloco 2 · Ativos

| # | Item | Estado | Evidência |
|---|---|---|---|
| 8 | **ATV-02** Pendência visível na lista | ✅ | `pendencia` no select, no tipo e no mapeamento; ícone âmbar em `Dica` com nome acessível; chip "Com pendência" (`?comPendencia=1`, `aria-pressed`); filtro **no servidor** em `aplicarFiltrosAtivos`; **coluna no CSV** (ata §2). |
| 9 | **ATV-06** Service tag sem coluna que pisca | ✅ | `showServiceTag: boolean` → `duplicados: ReadonlySet<string>`; sublinha `text-xs text-muted-foreground` sob o patrimônio, só nas linhas repetidas, **em qualquer largura**; coluna condicional, `COL_RESP.service_tag` e a dep. do `useMemo` removidas; comentário de `ativos/lista.ts` corrigido. |
| 10 | **ATV-07** Pontes ficha→ação | ✅ | (a) "Movimentar agora" com `resultado.length === 1`; (b) colaborador e marca+modelo viram `/ativos?q=…&filial=todas` (sentinela obrigatória) com `encodeURIComponent`; (c) subtítulo "· com {colab} ({setor})" só com detentor. |
| 11 | **ATV-08** Linha do tempo com cor por tipo | ✅ | `pillTipo(m.tipo)` no formato de `lista-movimentacoes.tsx`; anotação (âmbar) e "forçada" continuam distintas; vale para as duas renderizações da página. |
| 12 | **ATV-09** Compra valida perto do campo | ✅ | (a) `faltando` em estado, `aria-invalid` + mensagem sob o input, foco no primeiro na ordem do grid, erro some ao preencher; (b) `erroTetoLista` (função pura nova, +2 testes) acusa no preview e o rótulo da aba cita o teto — **derivado** de `MAX_LOTE_COMPRA`. `parsearLista` intacta (41 testes dependem dela). |
| 13 | **ATV-10** Nada de trabalho perdido | ✅ | (a) os **quatro** caminhos de saída do diálogo (Esc, clique-fora, X, Cancelar) convergem para `tentarFechar()`, que confirma só com `isDirty`; (b) `rascunho-compra.ts` (+**21 testes**) em `sessionStorage`, chave `wap:compra:rascunho`, banner, limpeza só no sucesso, link direto com prioridade. |
| 14 | **ATV-12** Visões rápidas | ✅ | `ativos-visoes-rapidas.tsx`: 4 chips-link, URL montada do zero, ativo com `aria-current="page"`. Não carregam `filial` (ata §8). |

### Bloco 3 · Pendências

| # | Item | Estado | Evidência |
|---|---|---|---|
| 15 | **PND-01** Ação direta na fila | ✅ | `CorrigirPatrimonioDialog` embutido na linha (prop `trigger`, criada no commit de preparação); "Movimentar" na triagem; `corrigirPatrimonio` já revalidava `/pendencias` — conferido, nada a mudar. A service tag, que a view não expõe, vem de leitura suplementar restrita aos ids **da página** (ata §8). |
| 16 | **PND-02** Confirmar assinatura em lote | ✅ | Checkbox nos termos; `confirmarAssinaturaLote` espelha `resolverPendenciaItem` (Zod, `exigirEscritaEm` das filiais **lidas do banco**, update idempotente, anotação por ativo, `revalidatePath`); data única; seleção mista com **as duas ações** e contador em cada; toast honesto quando o lote encolhe. Ata §3. |
| 17 | **PND-04** A fila conta o porquê e o peso | ✅ | `p.pendencia` truncado com `Dica`; `lib/pendencias/idade.ts` (+9 testes) com limiar **exclusivo** provado nas bordas (30→nova, 31→atenção, 90→atenção, 91→crítica); "sem patrimônio — abrir ficha" no lugar do "—". |
| 18 | **PND-05** Reabrir pendência de item | ✅ | **App entregue e funcionando**: `reabrirPendenciaItem` (`exigirAdmin` + `exigirEscritaEm` + justificativa de 10+ caracteres + anotação por ativo) e `ReabrirPendenciaItemDialog` na ficha; ajuda e o teste que travava "não há reabrir" reescritos. **A trava de cargo NO BANCO** veio na migration `0103` + roteiro SQL, **aplicados em ensaio e produção** no fim da sessão (§9, e atas §9/§10). |
| 19 | **PND-06** Mesa de conflitos sem armadilhas | ✅ | Aviso fixo "Marque o cadastro **errado**…"; `aria-label` "Marcar o cadastro de {filial} para exclusão"; barra de lote `sticky bottom-0` com fundo opaco, `safe-area` e espaçador; "Ficha" com `target="_blank" rel="noopener"` + `sr-only`. |

### Bloco 4 · Itens

| # | Item | Estado | Evidência |
|---|---|---|---|
| 20 | **ITN-02** Histórico diz quem | ✅ | Coluna "Colaborador" (`hidden lg:table-cell`); autor via `autor:profiles!lancamentos_item_criado_por_fkey(nome)`, exposto na `Dica` da data **e** no diálogo de estorno; **CSV ganhou "Autor"** ao lado de "Colaborador". |
| 21 | **ITN-03** Histórico auditável | ✅ | (a) `lib/itens/saldo-apos.ts` (+7 testes) só com 1 item + 1 filial, sobre o histórico **completo** do par; reconstrói acumulados **brutos** porque o piso da fórmula do banco não é inversível, **confere** contra a RPC e **degrada para "—"** quando não bate; a grade passa a ordenar por data de negócio nesse recorte, e o CSV também. (b) busca `?busca=` com sanitização do padrão de `queryPendencias` — ata §5. |
| 22 | **ITN-05** Quatro lixas no lançamento | ✅ | (a) `Dica` nos 4 cabeçalhos, texto derivado de `NUMEROS_ITEM`; (b) `lib/itens/sinal-ajuste.ts` (+9 testes) e o alternador "+ Acrescentar / − Baixar" só no ajuste, alvo de toque de 40 px no celular; (c) "Motivo (opcional)" no estorno, que **acrescenta** ao texto automático (+5 testes em `estorno.test.ts`); (d) saldo no combobox, uma chamada por troca de filial, nunca por tecla, e sem "0" chutado quando o dado não chegou. |

---

## 4. Desvios da letra da ordem (e por quê)

### 4.1 MOV-05 — o CSV que a ordem cita não existe
O item pede "Query, contagem e CSV respeitam o filtro". Medido: `actions/exportar.ts` tem export de
ativos, pendências, conflitos e itens (saldos e histórico) — **não há export de movimentações**, e a
tela não tem botão. Query e contagem respeitam; o CSV não foi criado porque criá-lo é feature nova.
Vai para o backlog (§10). Ata §7.

### 4.2 ITN-03b — o param é `busca`, não `q`
A ordem diz "busca `?q`". `/itens` **já usa `?q`** para o filtro de saldos, na mesma URL: reusar o
nome faria um campo apagar o outro. Ata §5.

### 4.3 PND-05 — entregue em duas etapas, na mesma sessão
A UI e a Server Action saíram no corpo da fase; a trava equivalente **no banco** (migration `0103`)
só pôde ser aplicada depois, quando o MCP de banco foi conectado. Rollout completo no §9.

---

## 5. Revisão adversarial — duas voltas, 12 achados, todos corrigidos (mais um 13º, do CI — §7.1)

A ordem manda revisar em contexto fresco e re-revisar até limpar. Foram **duas rodadas**, com lentes
independentes (cumprimento por bloco, matemática das funções puras, regressão, a11y, segurança,
escopo, documentação) e, na segunda, duas lentes dedicadas a **refutar as próprias correções**.

### 1ª volta — 8 achados

1. **CSV × tela (ATV-02)** — três lentes independentes acharam o mesmo: `filtrosAtivos` nunca lia
   `comPendencia`. Ligar o chip e exportar baixava **todos** os ativos do recorte, com a coluna
   "Pendência" vazia na maioria das linhas. Os campos são opcionais, então **o TypeScript compilava,
   o lint passava e os 2.022 testes passavam**.
2. **CSV × tela (ITN-03b)** — mesma classe: `filtrosHistorico` nunca lia `busca`.
3. **"Saldo após" (ITN-03a)** — a grade ordenava por data de **registro** enquanto a coluna era
   calculada por data de **negócio**. Cada célula certa para a sua linha, mas com um lançamento
   retroativo a coluna descia fora de ordem — a leitura "quando o saldo chegou a 15?" que motivou o
   item. A ata dizia que as ordens coincidiam; **não coincidiam**.
4. **Contraste (PND-06)** — o aviso "Marque o cadastro **errado**" media **3,99:1** e reprovava AA
   (medido com `scripts/contraste.mjs`): a frase que existe para impedir que se apague o cadastro
   certo era o texto mais difícil de ler da tela. Foi para a família do callout âmbar (9,21:1 claro ·
   12,21:1 escuro), e os três pares entraram no script.
5. **Alvo de toque (ITN-05b)** — o alternador de sinal tinha 32 px ao lado de irmãos de 40 px, na
   mesma linha. É o controle com maior consequência de erro de toque da tela.
6. **Ajuda (PND-02)** — a doc citava "Resolver selecionados", rótulo que o próprio item renomeou.
   **O teste que travava a frase pegou** — o sistema funcionando.
7. **Ajuda (PND-04)** — "Ler a fila" não descrevia nada do item (texto da pendência, cores de idade,
   link sem patrimônio). Agora descreve, com os limiares vindos da constante.
8. **Ajuda (MOV-12)** — a devolução ao fornecedor não mencionava os chips de data que ganhou.

**Junto veio a guarda permanente** `src/lib/actions/exportar-filtros.test.ts`: é a **segunda vez**
que o defeito tela×CSV nasce (a primeira foi F12-W4-03), e não havia teste nenhum sobre
`exportar.ts`.

### 2ª volta — 4 achados (dois deles contra a correção da 1ª)

9. **A guarda nova era falso-verde.** Ela procurava o param no **arquivo inteiro**, e `'tipo'`,
   `'q'` e `'filial'` são lidos por mais de um parser: apagar a leitura dentro de `filtrosHistorico`
   deixava o teste passando porque a string sobrevivia em `filtrosPendencias`. Passou a buscar na
   **fatia da função**. *(Medido: com a leitura inteira removida, o teste falha; com só a atribuição
   removida, quem acusa é o `no-unused-vars` do ESLint, como **aviso** — está escrito no arquivo.)*
10. **A guarda cobria 3 dos 4 exports** — `exportarItensSaldosCSV` ficou de fora. Entrou.
11. **O CSV do histórico não herdava a ordenação** por data de negócio: no mesmo recorte, tela e
    arquivo saíam invertidos entre si.
12. **PND-05: a restrição de cargo vivia só na Server Action.** Ver §9 — o achado mais sério da fase.

---

## 6. Documentação da ajuda ajustada

A realidade mudou em oito páginas, e o texto seguiu: `registrar-movimentacao`,
`lista-de-movimentacoes`, `lista-de-ativos`, `ficha-do-ativo`, `cadastrar-compra`,
`resolver-pendencias`, `lancar-itens`, `itens-por-quantidade`, `manutencao` — mais
`identidade-do-equipamento` e `problemas-comuns`, que ainda afirmavam que a lista mostra a **coluna**
"Service Tag" quando há patrimônio repetido (premissa que o ATV-06 matou).

Três testes de trava foram **reescritos, nunca deletados**:
`conteudo.test.ts` (o "não há reabrir" do PND-05), `gestao.test.ts` ("Resolver selecionados" →
"Resolver itens", e a frase da coluna que virou sublinha em `comecar.test.ts`).

Todos os números novos na prosa vêm de **constante importada** (`PENDENCIA_ATENCAO_DIAS`,
`PENDENCIA_CRITICA_DIAS`, `MAX_LOTE_COMPRA`, `TETO_MOTIVO_ESTORNO`) — `operacao.test.ts` recusa teto
digitado à mão.

---

## 7. Verificação executada

### `npm run lint`
```
> estoque-ti-wap@0.1.0 lint
> eslint

(sem saída — exit 0)
```

### `npm run test`
```
 Test Files  95 passed (95)
      Tests  2041 passed (2041)
   Duration  82.70s
```
Baseline da fase: **87 arquivos · 1.899 testes**. Saldo: **+8 arquivos · +142 testes**.

### `npm run build`
```
✓ Compiled successfully in 24.6s
✓ Generating static pages using 7 workers (27/27) in 1391ms
```

### `node scripts/contraste.mjs`
Exit 0 — nenhum par `exigir: true` reprova. Os três pares do PND-06 entraram no script:
ANTES `destructive/destructive-10` **3,99:1 ❌** · DEPOIS `red-900/red-50` **9,21:1 ✅ AAA** ·
DEPOIS escuro `red-200/red-950/40` **12,21:1 ✅ AAA**.

### Guardas da ordem
| Guarda | Resultado |
|---|---|
| `git diff 0ecf4ae..HEAD -- package.json package-lock.json` | **vazio** — zero dependência nova |
| `git diff 0ecf4ae..HEAD -- supabase/` | **2 arquivos**: a migration `0103` do item 18 + o roteiro que a prova. **Nenhuma aplicada.** |
| `git diff 0ecf4ae..HEAD -- src/lib/relatorios src/components/relatorios src/lib/queries/relatorios*` | **vazio** — nenhuma contagem ou regra de relatório tocada |
| `src/lib/types/database.ts`, `src/components/ui/**` | **intocados** |
| `npx vitest run src/lib/use-server-exports.test.ts` | passa — nenhum `export type { X }` nos módulos `'use server'` alterados |

### Prova de que as guardas novas pegam o defeito
Não basta uma guarda verde; ela precisa **falhar** quando deve:
- Removida a leitura de `comPendencia` de `filtrosAtivos` → `exportar-filtros.test.ts` **falha**.
- Removida a leitura de `tipo` de `filtrosHistorico`, mantendo-a em `filtrosPendencias` (o
  falso-verde da 1ª versão) → **falha** na versão por fatia.
- Ambos restaurados e re-verificados depois.

### 7.1 O CI, e o 13º achado — que veio do roteiro SQL, não da revisão

O push disparou o CI. O job `verificar` (lint + test + build) passou de primeira. O job **`banco`**,
que sobe um Postgres novo, aplica **todas** as migrations em ordem e roda `supabase/tests/*.sql`,
**falhou** — e falhou no roteiro escrito nesta fase, na sua primeira execução real:

```
==== supabase/tests/reabrir_pendencia_item.sql ====
ERROR:  permission denied for table pendencias_item
HINT:   Grant the required privileges to the current role with:
        GRANT SELECT, UPDATE ON public.pendencias_item TO authenticated;
CONTEXT: SQL statement "update public.pendencias_item set status = 'resolvida' …"
```

**O que isso significa.** A parada não foi na reabertura nova: foi no **cenário 1**, o do operador
**resolvendo** — o fluxo da F18, em produção desde 24/07. Num banco construído **pelas migrations
deste repositório**, o papel `authenticated` não tem privilégio nenhum sobre `pendencias_item`.

**Por que ninguém tinha visto.** Nenhum roteiro exercia essa tabela sob `set local role
authenticated`: `pendencias_item.sql` roda como `postgres`, que é superusuário e ignora **RLS e
grants**. Policy sem grant é regra que nunca chega a ser avaliada — o Postgres barra antes, no
privilégio. A F18 escreveu a policy e nunca precisou do grant para os testes passarem.

**Correção.** A `0103` passa a conceder `select, update` a `authenticated` (INSERT/DELETE continuam
exclusivos do trigger `security definer`; `anon` fica de fora). Segunda rodada do CI:

```
==== supabase/tests/reabrir_pendencia_item.sql ====
NOTICE:  ✓ 1 operador vinculado RESOLVE a pendência (aberta → resolvida)
NOTICE:  ✓ 2 operador vinculado NÃO reabre — a linha continua resolvida
NOTICE:  ✓ 3 operador de OUTRA filial não reabre
NOTICE:  ✓ 4 nível administrador REABRE (resolvida → aberta)
NOTICE:  — reabrir_pendencia_item: 4 ok, 0 falha(s)
```

Os dois jobs verdes. **A `0103` está provada**: aplica limpo num banco novo e as quatro invariantes
de cargo valem.

**O que ainda não se sabe (e a migration diz como descobrir).** Se produção tem o grant, ele veio do
`alter default privileges` do bootstrap do Supabase, **não** das migrations — e produção tem **zero
linhas** em `pendencias_item` desde a medição da `0083`, então o caminho pode nunca ter sido
exercido de verdade. A consulta que responde isso está no bloco de verificação da `0103`, para rodar
**antes** de aplicar:

```sql
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'pendencias_item'
 order by grantee, privilege_type;
```

Se `authenticated` não aparecer ali, o fluxo de **resolver** pendência de item está quebrado em
produção — silenciosamente, porque nunca houve linha para resolver.

---

## 8. Roteiro manual (o que teste puro não cobre)

**Estes passos NÃO foram executados nesta sessão** — ver §11. Estão escritos para quem tiver a tela
na frente.

1. **MOV-02** — passo 3 de uma saída com data de ontem, termo, chamado e observação: o card mostra
   os cinco, **com a data em destaque**; a tabela lista só os ativos. Repetir com **troca/upgrade**:
   dois cards, um por metade.
2. **MOV-03** — logado como operador vinculado a UMA filial, bipar um ativo de outra: badge âmbar
   por item no passo 1 e na contrapartida; "Revisar" **não** trava. Repetir como admin: sem aviso.
3. **MOV-05** — clicar "Hoje": a URL ganha `de`/`ate` iguais; clicar de novo desliga. "Minhas" põe
   `?autor=eu`; **conferir no DevTools que nenhum uid aparece na URL nem no HTML**. Contagem do
   rodapé bate com a lista. "Limpar" desliga o chip e o "Minhas".
4. **MOV-06** — registrar um lote de 3 e conferir na lista: separador acima da primeira linha do
   lote, hora do registro ao lado da data, "Duplicar" na linha (ausente no estorno).
5. **MOV-10** — registrar, clicar "Registrar outro lote com os mesmos campos": volta ao passo 1 com
   a configuração preservada e os itens vazios.
6. **MOV-11** — montar 3 ativos, sair da tela, voltar: banner com os patrimônios, o tipo e "salvo
   há…". Com um rascunho gravado **antes** deste deploy, o banner mostra só a contagem, sem erro.
7. **MOV-12** — marcar substituto, deixar tudo vazio, "Registrar": campos em vermelho, foco no
   **patrimônio**; deixar só a filial vazia: foco na **filial**. Chips Hoje/Ontem preenchem a data.
8. **ATV-02** — ativo com pendência mostra o triângulo âmbar com o texto ao passar o mouse; chip
   "Com pendência" filtra; **exportar CSV com o chip ligado e conferir que o arquivo tem as MESMAS
   linhas da tela** e a coluna "Pendência" preenchida.
9. **ATV-06** — busca que devolva patrimônio repetido: service tag em letra menor sob o número, nas
   linhas repetidas, **inclusive no celular**; paginar não faz coluna aparecer/sumir.
10. **ATV-07** — comprar 1 ativo → "Movimentar agora" abre o wizard com ele; comprar 2 → o botão não
    aparece. Na ficha, clicar no colaborador leva à lista filtrada **com todas as filiais**.
11. **ATV-08** — linha do tempo com saída, devolução e compra: três cores distintas; anotação segue
    âmbar; "forçada" segue destacada.
12. **ATV-09** — cadastrar sem categoria: campo marcado e focado. Colar 250 patrimônios: erro no
    preview citando o teto, botão desabilitado.
13. **ATV-10** — editar dados cadastrais, mudar um campo, Esc → pergunta; Cancelar → volta ao form;
    Esc de novo → pergunta de novo. Sem mudar nada, Esc fecha direto. Montar uma compra, sair,
    voltar → banner; "Restaurar" traz tudo; cadastrar → rascunho some.
14. **ATV-12** — cada chip leva à lista filtrada e fica destacado; sair da visão limpa o destaque.
15. **PND-01** — linha de patrimônio: diálogo abre **na fila**; ao salvar, a linha some sem F5.
    Triagem: "Movimentar" abre o wizard com o ativo.
16. **PND-02** — marcar 2 termos e 1 item: a barra diz "2 termos · 1 item faltante" e mostra **dois**
    botões; confirmar assinatura com data de ontem age **só nos termos**. Com um dos termos já
    assinado por outra pessoa, o toast diz os dois números.
17. **PND-04** — pendência de 95 dias com badge vermelho e motivo no tooltip; de 40, âmbar; de 2,
    cinza. Linha sem patrimônio: link "sem patrimônio — abrir ficha".
18. **PND-05** — como **admin**, reabrir uma pendência resolvida com justificativa → volta para
    aberta e a anotação aparece na linha do tempo. Como **operador**, o botão **não aparece**.
19. **PND-06** — mesa com 15+ grupos: o aviso fica no topo, a barra de lote **acompanha o rodapé** ao
    rolar; "Ficha" abre em nova aba e a seleção sobrevive.
20. **ITN-02** — histórico numa Liberação: coluna Colaborador preenchida; a dica da data diz quem
    lançou; o CSV traz as duas colunas.
21. **ITN-03** — filtrar 1 item + 1 filial: coluna "Saldo após"; com um lançamento retroativo, a
    grade **e** a coluna descem na mesma ordem. Buscar por um nº de chamado devolve os lançamentos
    dele. Tirar o filtro de item: a coluna some.
22. **ITN-05** — cabeçalhos com tooltip; ajuste com "− Baixar" grava quantidade negativa **sem
    digitar o menos**; estorno com motivo grava "Estorno: …" na observação do inverso; o combobox
    mostra "Mouse USB · 14" e o número muda ao trocar a filial.

---

## 9. Rollout da migration `0103` (feito no fim da sessão)

### 9.1 O que é, e por que foi necessária

`supabase/migrations/0103_reabrir_pendencia_item_admin.sql` faz duas coisas: (1) concede
`select, update` sobre `pendencias_item` a `authenticated` — grant que **nunca existiu nas
migrations** (§7.1); (2) separa a policy de UPDATE em duas, por sentido da transição: o operador age
no que está **aberto**; só `e_admin()` leva de **resolvida** para **aberta**.

A F28 entregou "Reabrir pendência" com gate de nível administrador **na Server Action**. A policy
(`0063`) não distinguia cargo nem sentido, e `pode_escrever_filial` devolve `true` para operador com
vínculo — então um operador reabriria por chamada direta ao PostgREST, **sem justificativa e sem
anotação**. Não era regressão desta fase (a policy é assim desde a `0050`/`0063`), mas a fase
prometeu na porta uma trava que o banco não impunha, contra o `CLAUDE.md`.

O corpo da fase terminou com ela **escrita e não aplicada** — o MCP de banco não estava conectado, e
a ordem prevê esse caso. O Johnny conectou o MCP em seguida, e o rollout foi feito na mesma sessão.

### 9.2 O que a medição respondeu (e o que ela desmentiu)

**Antes de tocar em nada**, a pergunta que o relatório deixou em aberto:

```sql
select grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema='public' and table_name='pendencias_item' group by grantee;
```
→ **`authenticated` JÁ TINHA `SELECT/UPDATE` nos dois projetos.** O grant veio do
`alter default privileges` do bootstrap do Supabase, não das migrations. **Portanto o fluxo de
RESOLVER da F18 nunca esteve quebrado em produção** — o achado do CI vale para o que ele mede: um
banco reconstruído **só pelas migrations**. O passo (1) foi no-op nos dois.

⚠ **E uma afirmação deste relatório caiu por terra.** Ele dizia, citando a `0083`, que produção tinha
**zero** linhas em `pendencias_item`, e daí que o caminho "pode nunca ter sido exercido". A medição
de 07/08 mostra **5 linhas — 2 abertas e 3 resolvidas**. A contagem da `0083` é de 30/07 e
envelheceu. Consequência prática: o buraco que a `0103` fechou **era alcançável** para aquelas 3
resolvidas. Não há indício de que tenha sido explorado (a reabertura nem existia na UI antes desta
fase), mas o risco era real, não hipotético.

### 9.3 Ensaio (`sgmvldiizsrjbxzzpmhh`) — aplicada e provada

Policies conferidas uma a uma depois do apply, e o roteiro dos quatro cenários rodado **contra o
schema real**, dentro de transação:

| # | Cenário | Veredito |
|---|---|---|
| 0 | fixture: devolução com item faltante abre a pendência | OK |
| 1 | operador vinculado **RESOLVE** (aberta → resolvida) | OK |
| 2 | operador vinculado **NÃO reabre** | OK |
| 3 | operador de **outra filial** não reabre | OK |
| 4 | **nível administrador REABRE** (resolvida → aberta) | OK |

Conferido depois que **nenhum fixture sobreviveu**: `WAP0009103` = 0 linhas, usuários `f28.*` = 0, e
as 22 pendências que o ensaio já tinha, intactas.

### 9.4 Produção (`pbtjcalbmepmrqzprusb`) — aplicada e conferida

- As **três policies** conferidas uma a uma: `admin reabre` com
  `e_admin() AND pode_escrever_filial(filial_id) AND status='resolvida'` no `using` e `status='aberta'`
  no `with check`; `operador resolve` agora restrita a `status='aberta'`.
- `notify pgrst, 'reload schema'`.
- **`get_advisors(security)` idêntico antes e depois** — nenhum alerta novo (os que existem são os
  conhecidos: `SECURITY DEFINER` das RPCs, que é o desenho do projeto, e o leaked-password, backlog).
- **Acervo intocado** (a migration não tem DML): 1.653 ativos · 3.279 movimentações.
- **Smoke logado pós-apply: 93 OK · 4 avisos · 0 falha** — os mesmos 4 avisos pré-existentes.

**O comportamento NÃO foi provado por escrita em produção**, nem em transação revertida: já estava
provado no **ensaio** (mesmo schema) e num **Postgres novo** pelo CI. Em produção conferiu-se só o
que é observável sem escrever. Escrever em `pendencias_item` de produção para testar — mesmo com
rollback — não vale o risco quando o comportamento já foi provado duas vezes.

### 9.5 Como reverter, se precisar

```sql
alter policy "pendencias_item operador resolve" on public.pendencias_item
  using (public.pode_escrever_filial(filial_id)) with check (public.pode_escrever_filial(filial_id));
drop policy "pendencias_item admin reabre" on public.pendencias_item;
```

### 9.6 Smoke de produção

`node scripts/smoke/smoke-prod.mjs` — resultado colado no §12.

---

## 10. Backlog novo (visto e não feito, por escopo)

| Item | Por quê |
|---|---|
| **Export CSV da lista de movimentações** | Não existe hoje; criá-lo é feature nova (§4.1). |
| **`lote_id` em `movimentacoes`** | Tornaria o separador do MOV-06 exato em vez de heurístico. É mudança de modelo de dados. |
| Registrar no `scripts/contraste.mjs` os badges de idade da fila | Medidos avulsos (6,41:1 / 5,26:1 claro), **passam** — falta só o registro permanente. É o UXG-07, que é da F29. |
| `text-destructive` sobre `bg-destructive/10` em `nova-compra-form.tsx` e `relatorios/celulas.tsx` | Mesmo par reprovado (3,99:1) do PND-06, mas em código **anterior** à F28 e fora do escopo desta ordem. |
| Mover o schema Zod de `confirmarAssinaturaLote` para `validators/` | Ficou local no módulo `'use server'` por causa da regra de export (ata §3). Refactor sem mudança de comportamento. |
| Ajuda: `resolver-pendencias.ts` cita um botão "Apagar ambos" que a mesa **não tem** | Achado do recon, anterior à F28 (decisão de design da F24). |

---

## 11. O que este relatório NÃO prova

- **Nenhuma tela foi aberta.** Não houve execução de navegador: o roteiro do §8 está **escrito, não
  executado**. O motivo é concreto — autenticar exigiria digitar a senha da conta no formulário de
  login, e isso eu não faço; o caminho automatizado que o projeto tem para isso é o smoke, que
  autentica via cliente Supabase e cobre rota/resposta, não interação de tela.
- **Build, lint e 2.041 testes verdes não provaram o defeito mais caro da fase.** O CSV divergindo da
  tela passou por tudo isso — os campos são opcionais e o TypeScript aceitou. Quem pegou foi a
  revisão adversarial. Vale como aviso permanente: nesta base, **filtro novo é ponto cego de tipo**.
- **A `0103` foi aplicada em produção, mas o comportamento dela em produção não foi provado por
  escrita.** Conferi o texto das policies, o grant, os advisors e o smoke; a prova de que o operador
  não reabre e o admin reabre veio do **ensaio** (mesmo schema) e do **CI** (Postgres novo). Se o
  ensaio tiver divergido de produção em algo que eu não conferi, isso não apareceria aqui.
- **Duas afirmações desta seção já nasceram erradas e foram corrigidas por medição** (§9.2): que o
  roteiro SQL nunca tinha rodado (rodou, no CI) e que produção tinha zero pendências de item (tem 5).
  Ambas vinham de fontes que envelheceram — o texto escrito antes do push e um comentário de
  migration de 30/07. **Contagem de produção não é premissa: mede-se de novo.**
- **A "Saldo após" foi provada por 7 testes puros, não contra dados reais.** A degradação honesta
  (a coluna virar "—" quando a conta não fecha) foi testada por construção, não observada em
  produção. Se o histórico de produção tiver um caso que sature o piso, o comportamento esperado é a
  coluna sumir — não há como afirmar que isso já aconteceu.
- **O agrupamento de lote do MOV-06 é heurístico e vai errar.** Dois operadores gravando no mesmo
  minuto aparecem como um lote; um lote que atravesse a virada do minuto aparece partido. Nenhum
  número do sistema depende disso, mas a tela vai mentir nesses casos.
- **Não há teste de componente nem E2E neste projeto.** O Vitest cobre só funções puras: nada do que
  é JSX — foco, `aria-*`, sticky, ordem de tabulação, o combobox recarregando saldo — está coberto
  por automação. As afirmações de a11y vêm de leitura de código e da medição de contraste.
- **A paridade das páginas de ajuda com a tela foi conferida por leitura**, não por execução. O teste
  da ajuda trava frases literais; ele não sabe se a frase descreve o que a tela faz.

---

## 12. Smoke de produção

Rodado depois do push e do deploy automático da Vercel:

```
$ node scripts/smoke/smoke-prod.mjs
…
========================================================================
RESUMO · 93 OK · 4 aviso · 0 n/a (pré-F12) · 0 falha
========================================================================
```

**0 falha.** Os 4 avisos são pré-existentes e todos da mesma causa — o **catálogo de itens está
vazio em produção**, então três checagens de item não têm o que medir e a quarta (RLS de
`kits_modelos` contra `anon`) lê 0 linhas porque não há kit cadastrado, o que não comprova a RLS.
Nenhum deles é regressão da F28, e nenhum toca os 22 itens desta fase.

⚠ O smoke cobre **rota e resposta** (HTTP, marcadores de conteúdo, RLS de leitura), não interação de
tela: ele não clica em chip, não abre diálogo e não confere foco. O que ele prova aqui é que as 28
rotas e as 33 páginas de ajuda continuam de pé com o código da fase em produção.

---

## 13. Commits da fase

```
235c345 docs(f28): registra as ordens de serviço da Onda B (F28 e F29)
27c5cda feat(f28): helpers compartilhados da fase — hora, tempo relativo e gatilho do corrigir-patrimônio
3ae5c6c feat(f28): a Revisão mostra o que será gravado… (MOV-02, MOV-03, MOV-10, MOV-11)
c629a84 feat(f28): a lista responde "o que registrei hoje?" e mostra o lote (MOV-05, MOV-06)
0265f7a fix(f28): a devolução ao fornecedor fala o dialeto do wizard (MOV-12)
e586243 feat(f28): a lista de ativos mostra a pendência… (ATV-02, ATV-06, ATV-12)
3237ab5 feat(f28): a ficha diz com quem o ativo está… (ATV-07b/c, ATV-08, ATV-10a)
a95949c feat(f28): a compra valida perto do campo… (ATV-09, ATV-07a, ATV-10b)
dacffd1 feat(f28): a fila de pendências age na própria linha… (PND-01, PND-02, PND-04, PND-05)
e0220b1 fix(f28): a mesa de conflitos para de esconder o que a marcação significa (PND-06)
bd4b561 feat(f28): o histórico de itens diz quem, permite auditar… (ITN-02, ITN-03, ITN-05)
b76a390 feat(f28): as duas colunas de CSV, o gate do reabrir e a ajuda que ainda descrevia a coluna morta
2da57fc fix(f28): os oito achados da revisão adversarial
ef42e39 fix(f28): os quatro achados da segunda volta — e a ata do PND-05 corrigida
```

# OS-F8 — Compra de abertura do import sempre fora das Entradas (reverte F7H/0035)

> **Escopo enxuto (decisão do Johnny, 20/07/2026):** por ora, **SEM** a planilha de saída/devolução. Corrigir **só** o import de startup atual: a **compra de abertura NÃO pode mais contar como Entrada do período**. Reverte a emenda **F7H** da migration `0035`. O import de **histórico (saída/devolução)** fica **ADIADO** para uma OS futura (o rascunho completo está em `docs/prompts/F8-import-historico-saida-devolucao.md` — não executar agora).

Executor desta ordem no repositório `ti-wap-inventory-control`. **Modo autônomo com acesso total (CLAUDE.md):** decide, aplica a migration no DEV, roda testes, mergeia e entrega o SQL de produção — as autoproteções desta ordem (backup antes do UPDATE, conferência de contagens, teste) substituem o pedido de autorização. **Nenhum insumo físico do Johnny é necessário** (não depende de arquivo novo).

---

## 0. Antes de qualquer coisa (obrigatório)

1. **Ler:** `CLAUDE.md`; `docs/ESPECIFICACAO.md` **§7** (relatório: Entradas = `devolucao`/`compra`) e **§10.2** (import de startup não conta como entrada do período); a entrada **20/07/2026 (F7H)** de `docs/DECISOES.md`.
2. **Ler código:**
   - `supabase/migrations/0034_import_melhorias.sql` e **`0035_import_compra_data_real_no_relatorio.sql`** — a função `public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)`, **passo 4b** (a emenda F7H a reverter).
   - `src/lib/queries/relatorios/movimentacoes.ts` — o filtro do relatório (`OBS_CARGA_GOLIVE` + prefixo `OBS_IMPORT_STARTUP` via `not.like 'import startup*'`, null-safe). **Não muda.**
   - `src/lib/dominio.ts` — `OBS_IMPORT_STARTUP`.
   - `src/lib/actions/importar.ts` — só contexto; **não muda**.
3. **O problema, em uma frase:** a **F7H (0035)** fez a compra de abertura **COM data real** escapar do marcador e **aparecer nas Entradas** do relatório. Como a planilha **não distingue "compra" de "entrada"**, isso enche as Entradas de "compras" que são só ativos que já existiam. **Decisão:** a compra de abertura volta a ser **SEMPRE baseline** (marcada/escondida), com ou sem data — exatamente como era na `0034`.
4. **Decisões travadas (registrar em DECISOES, não reabrir):**
   - A compra de abertura do import de startup **nunca** conta como Entrada do período (com **ou sem** data). A **data de entrada** continua **na própria compra** (linha do tempo/ficha do ativo) — só não entra no relatório do período.
   - Compras "de verdade" (equipamento novo comprado agora) voltam a ser as **lançadas manualmente** no sistema pós-go-live — essas aparecem nas Entradas normalmente (não têm marcador).
   - Os **dados já importados da Matriz** (que a F7H expôs) são corrigidos por **UPDATE** (não por re-import — sem histórico, não há motivo pra recriar a filial).

---

## 1. Objetivo

Reverter a emenda **F7H** no **passo 4b** da RPC `importar_ativos_substituir`: a compra de abertura passa a levar **SEMPRE** o marcador `OBS_IMPORT_STARTUP` (escondida do relatório), com ou sem `dataEntrada`. E **corrigir a Matriz** (compras de abertura que a F7H deixou visíveis) por UPDATE com backup. **Nada mais muda** — sem tela nova, sem replay, sem tocar no relatório.

---

## 2. Escopo proibido / invariantes

1. **Nada de saída/devolução/replay** (adiado para a OS futura).
2. **Não afrouxar as salvaguardas da F7/F7B/F7E/F7F:** tudo-ou-nada, backup, confirmação pelo nome, contagens TOCTOU sob `pg_advisory_xact_lock`, `arquivoHash` do original, RLS (`EXECUTE` só `authenticated`), `descartado` bloqueante. **O diff da `0036` vs `0035` deve ser SÓ a reversão do passo 4b** (volta ao corpo da `0034`).
3. **Não mudar o relatório** — `src/lib/queries/relatorios/movimentacoes.ts` já esconde o prefixo `import startup*`; com a compra sempre marcada, ela some das Entradas sem tocar no filtro. (Pode atualizar só o **comentário** F7H nesse arquivo, que hoje descreve o comportamento revertido — opcional.)

---

## 3. Tarefas

### 3.1 Migration `0036` — compra de abertura sempre marcada (reverte F7H)
- `create or replace function public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)` **puro** (assinatura idêntica — 4 args; **sem overload**; `pg_proc` segue 1 linha). Corpo = o da `0035` **VERBATIM**, revertendo **apenas** a emenda F7H no **passo 4b**: a observação da compra de abertura volta a ser **SEMPRE** `v_obs_marcador` (não o `case` condicional da F7H). Equivale a restaurar o passo 4b da `0034`.

  ```sql
  -- 4b (REVERTIDO — F8): compra de abertura SEMPRE marcada (escondida do relatório),
  -- com ou sem dataEntrada. A data continua a real (dataEntrada) quando houver.
  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
  values (
    v_ativo_id, 'compra',
    coalesce(nullif(e->>'dataEntrada', '')::date, v_data_import),
    v_filial,
    v_obs_marcador,           -- <- era o CASE da F7H; volta a ser sempre o marcador
    v_uid
  );
  ```
- Passos **4c** (ajuste), **4d** (posse), **5** (conferências) e **tudo o mais**: **INALTERADOS**.
- Grants reafirmados no fim (defesa em profundidade; o `create or replace` puro os preserva): `revoke all … from public, anon, service_role; grant execute … to authenticated`.
- **Cabeçalho da migration:** comentar que reverte a F7H/0035 e por quê (não dá pra distinguir compra de entrada na planilha → toda compra de abertura é baseline).
- Aplicar no **DEV**; **entregar o SQL ao Johnny** para produção (SQL Editor — o gate do classificador barra a DDL da função destrutiva, como na 0033/0034/0035).

### 3.2 Corrigir os dados já importados (Matriz)
A F7H tirou o marcador das compras de abertura **com data** da Matriz por um UPDATE à parte (por isso elas aparecem nas Entradas hoje). Reverter com um UPDATE que **devolve** o marcador — **mesmo conjunto de linhas** que a F7H alterou.

- **Autoproteção obrigatória:** rodar a **consulta de conferência** primeiro (contar/expor as linhas que vão casar) e **exportar backup** dessas linhas antes do UPDATE; conferir contagem depois.
- Alvo (mesmo predicado da F7H, invertido): `movimentacoes` `tipo = 'compra'`, `observacao IS NULL`, `data < created_at::date` (backdatadas = abertura de import, **não** compra manual do dia), do(s) ativo(s) com `origem = 'importacao'` na filial **Matriz**. Marcador reconstruído bate com o que a RPC gravaria: `'import startup ' || to_char(created_at, 'DD/MM/YYYY')`.

  ```sql
  -- (1) CONFERIR ANTES — quantas linhas? bate com o nº de ativos importados da Matriz com data?
  select count(*)
    from movimentacoes m join ativos a on a.id = m.ativo_id
   where a.filial_id = (select id from filiais where slug = 'matriz')
     and a.origem = 'importacao'
     and m.tipo = 'compra' and m.observacao is null
     and m.data < m.created_at::date;

  -- (2) BACKUP dessas linhas (export) — depois:
  update movimentacoes m
     set observacao = 'import startup ' || to_char(m.created_at, 'DD/MM/YYYY')
    from ativos a
   where m.ativo_id = a.id
     and a.filial_id = (select id from filiais where slug = 'matriz')
     and a.origem = 'importacao'
     and m.tipo = 'compra' and m.observacao is null
     and m.data < m.created_at::date;
  ```
- ⚠️ **Cuidado:** se existir alguma compra **manual** legítima pós-go-live com data **retroativa** na Matriz, ela cairia no predicado e seria marcada por engano. Revisar a **amostra** antes; idealmente casar a contagem com o **nº de linhas que a F7H mexeu**. **Alternativa mais robusta** (se a heurística de data preocupar): usar o `import_logs` da Matriz para identificar exatamente as movimentações criadas por aquele import. Registrar contagens antes/depois em DECISOES.

### 3.3 Testes
- **Retrocompatibilidade:** import **sem** histórico = plano/efeito idêntico ao F7F **EXCETO** a compra de abertura agora **sempre marcada**. **Ajustar** os testes que assumiam a F7H (compra com data **sem** marcador / aparecendo nas Entradas) — listar quais no resumo.
- **SQL (DEV):** importar 2 ativos por *Substituir tudo* — um **com** data de entrada, outro **sem**; conferir que **nenhuma** das duas compras aparece nas Entradas do relatório do período; estados/ajustes inalterados; a data de entrada continua visível na linha do tempo do ativo.
- Conferir que `movimentacoes.ts` **não** precisou mudar (o filtro por prefixo já cobre).

---

## 4. Critérios de aceite (autoverificado)

- [ ] Compra de abertura (**com E sem** data) **fora das Entradas** do período — provado no relatório de uma filial de teste.
- [ ] **Diff `0036` vs `0035` = só a reversão do passo 4b** (volta ao corpo da `0034`). RPC 4 args, sem overload; `EXECUTE` só `authenticated`; smoke de produção só-leitura OK.
- [ ] **Matriz:** compras de abertura fora das Entradas; **backup feito**; contagens antes/depois no resumo; **nenhuma compra manual legítima** marcada por engano (amostra conferida / contagem batendo com a F7H).
- [ ] Testes ajustados (os que assumiam a F7H) + novo teste do baseline; `lint` + `test` + `build` **verdes**.
- [ ] `docs/DECISOES.md` + `README.md` atualizados: reversão da F7H, correção da Matriz, e o **histórico de saída/devolução registrado como pendência ADIADA** (arquivo global futuro).

---

## 5. Entrega

Branch `f8-reverter-compra-baseline` (merge por sua conta) ou direto na `main`. Migration `0036` no **DEV**; o **SQL** (a `0036` + o UPDATE da Matriz, com a consulta de conferência) **entregue ao Johnny** para produção. Resumo final: checklist autoverificado, decisão registrada, contagens da Matriz (antes/depois), testes ajustados e a **pendência aberta** (a OS futura do histórico saída/devolução — depende do arquivo global, adiada por ora).

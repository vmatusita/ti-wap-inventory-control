# OS-F6A — Correções pós-go-live: dados e confiança

Executor desta ordem no repositório `ti-wap-inventory-control`. **Modo autônomo com acesso total (CLAUDE.md): você executa tudo — diagnóstico, migrations em produção, updates de dados, deploy — sem pedir autorização**, compensando com as autoproteções (backup/dry-run antes de operação destrutiva) e o rastro em `docs/DECISOES.md`. O sistema está **em produção desde 15/07/2026** (cutover F4): todo update de dado aqui é em dado real — backup das tabelas afetadas antes, contagens conferidas depois.

Esta OS nasce da sessão de melhorias de 16/07/2026 com o Johnny. As decisões dele estão em §5 — são autoridade desta ordem, junto com a spec. **Rode a F6A antes da F6B.**

> **Para executar, prefira `F6A-ultracode.md`** (mesmo escopo, mesmas decisões): versão com prompts detalhados por fase e orquestração multi-agente — A1 ∥ A4 ∥ A5 em paralelo, integração única, A2 como auditoria final. Este arquivo permanece como registro do escopo e das decisões.

## 0. Antes de qualquer coisa

1. Leia `CLAUDE.md`, a spec §4 (máquina de estados), §5 (vocabulários), §7 (relatórios) e `docs/PLANO-RELATORIOS-V2.md` (itens por quantidade).
2. Confirme working tree limpo e build verde antes de começar.
3. Esta ordem **não depende de nenhum insumo do Johnny** — a carga dos saldos de itens foi movida para a **F6C**, que roda por último (decisão dele, 16/07/2026).

## 1. Objetivo

Consertar o que mina a confiança nos números desde o go-live: entradas da carga inicial poluindo o relatório do período, semântica de estoque dos itens por quantidade errada (atrelar/liberar não descontam) e pendências expostas ao visualizador por senha.

## 2. Escopo desta ordem (e nada além)

- **A1** — Entradas da carga inicial fora do relatório do período
- **A2** — Auditoria dos números do relatório
- **A3** — *(movido para a F6C — cargas por último, decisão do Johnny em 16/07/2026)*
- **A4** — Itens por quantidade: `Total` / `Estoque` + atrelar/liberar descontam, devolução repõe
- **A5** — Pendências: somem para o visualizador, ganham página interna para o operador

Escopo proibido: não mexer nas tabelas de ativos do relatório (layout), não criar roles/papéis, não adicionar dependência (stack fechada), **não rodar nenhuma carga de dados** (é a F6C). Melhorias de UX ficam na F6B.

## 3. Itens

### A1 — Entradas da carga inicial não são entradas do período

**Problema relatado:** filtrando o relatório por semana, aparecem *todos* os ativos como se tivessem entrado no mesmo dia. Causa provável: as movimentações de abertura/compra sintética da carga foram gravadas com `data = dia da carga` (ver `scripts/import/carga.ts` — abertura usa `data: hoje`), e as queries do relatório filtram pela coluna `data` (`src/lib/queries/relatorios/movimentacoes.ts`).

**Passos:**
1. Diagnostique em produção: quantas movimentações têm `data` no dia da carga (15/07/2026), separando as sintéticas da carga das operacionais legítimas registradas pós-go-live. Identifique o marcador que as distingue (motivo, observação, tipo, created_by do script — o que existir).
2. Decida a rota e registre em `DECISOES.md`:
   - **Rota preferida — marcar e filtrar:** dar às movimentações de carga um marcador inequívoco (ex.: motivo próprio `carga inicial` via migration, ou flag booleana) e **excluí-las das tabelas de Saídas/Entradas e dos KPIs de movimentação do período**. Não re-datar: preserva o histórico e a reconstrução as-of (migration 0022) como estão.
   - **Rota alternativa — re-datar:** só se existir data real de entrada recuperável por ativo (a planilha de inventário raramente tem). Se re-datar, valide o as-of depois.
3. Backup das tabelas afetadas antes de qualquer update; contagens antes/depois no resumo.
4. Atenção ao efeito colateral: a linha do tempo da ficha do ativo **continua mostrando** o evento de carga (é histórico legítimo); o que muda é ele não contar como "entrada da semana" no relatório.

**Aceite:** relatório da semana atual (qualquer filial e geral) mostra em Entradas só o que de fato entrou pós-go-live; total de ativos permanece 1.596; movimentações operacionais pós-go-live intactas; as-of íntegro (amostra conferida).

### A2 — Auditoria dos números do relatório

O Johnny desconfia de números além das entradas. Auditoria dirigida, com A1 já aplicado:

1. Para 2–3 filiais + consolidado geral, compare cada KPI e cada bloco do relatório ao vivo (estoque, disponíveis por modelo, em manutenção, reservados, 3 grupos do formato e-mail) contra contagens SQL diretas no banco.
2. Divergência encontrada → corrija a query/lógica (não o dado, salvo erro de dado comprovado da carga — aí backup + correção + registro).
3. Registre no resumo a tabela do que foi conferido (valor exibido × valor SQL × veredito).

**Aceite:** todos os blocos conferidos batem; correções registradas em `DECISOES.md`.

### A3 — (movido para a F6C)

A carga dos saldos iniciais de itens roda **por último**, na `F6C-carga-saldos-itens.md`, quando o Johnny tiver o export da planilha de gestão online. Nada de carga nesta ordem. Consequência para o A4: o recálculo retroativo parte dos lançamentos existentes no sistema (que podem ser poucos) — a F6C entra por cima depois, já na semântica nova.

### A4 — Itens por quantidade: Total / Estoque e a nova semântica

Decisões do Johnny (§5, itens 6 e 8). Semântica alvo:

| Conceito | Definição | O que move |
|---|---|---|
| **Total** | tudo que a filial possui do item (prateleira + com pessoas) | compra/lançamento de entrada, descarte/baixa |
| **Estoque** | disponível na prateleira | atrelar → −1 · liberação → −1 · devolução do item → +1 |
| Em uso (Total − Estoque) | atrelados a ativos fora + liberados para pessoas | derivado |
| **Falta** | mantém a semântica atual (falta automática) | — |

- *Atrelar* = item sai junto de um ativo (movimentação de saída). *Liberação* = item fica definitivamente com a pessoa — **continua contando no Total** (está "com pessoas"), mas sai do Estoque. *Devolução* = item volta com o ativo devolvido → repõe Estoque.
1. Ajuste a fonte da verdade no Postgres: RPC `rel_saldo_itens` (migration 0016) e o trigger de saldo (0014/0015) — nova migration, nunca editar as aplicadas. **Recalcule o estado atual retroativamente** a partir das movimentações/lançamentos existentes (atrelados hoje em aberto descontam do Estoque).
2. Tela `/itens`: renomear coluna `Saldo` → `Total`, adicionar coluna `Estoque` (e manter atrelados/falta). Subtítulo da página acompanha.
3. Relatório v2: onde exibir saldo de item, refletir a mesma semântica (rótulos `Total`/`Estoque`).
4. Backup antes do recálculo em produção; amostra de 5+ itens conferida à mão no resumo.

**Aceite:** atrelar numa movimentação de saída desconta Estoque na hora (realtime); liberação desconta Estoque e mantém Total; devolução repõe Estoque; tela e relatório mostram `Total` e `Estoque`; recálculo retroativo validado por amostra.

### A5 — Pendências: só para operador, com página própria

Decisão do Johnny: pendência é assunto interno da TI — **o visualizador por senha não vê**.

1. **Remover do relatório para visualizador:** `PendenciasChips` (`corpo-relatorio-v2.tsx`) e qualquer contagem de pendência somem da sessão por senha — ao vivo **e** na renderização de snapshots (inclusive os antigos, cujo dado congelado contém os chips: filtre na renderização, não mexa no jsonb congelado).
2. **Página interna nova `/(app)/pendencias`** (só operador logado):
   - Lista detalhada por tipo (termos pendentes/gerados, devoluções com itens faltantes, triagem parada, outras — base: `v_pendencias`): ativo (link pra ficha), pessoa, filial, desde quando, o que falta.
   - Filtros por filial e tipo; ordenação por idade da pendência.
   - Entrada no menu/sidebar.
3. Para o operador, os chips no relatório podem permanecer (ele é interno) — se ficarem, viram link para `/pendencias`. Decida e registre.

**Aceite:** sessão por senha não exibe pendência em nenhum relatório (ao vivo, snapshot novo, snapshot antigo); operador tem `/pendencias` com lista detalhada, filtros e links; contagens da página batem com `v_pendencias`.

## 4. Aceite geral (autoverificado)

- [ ] A1 — entradas da carga fora do período; 1.596 ativos intactos; as-of ok
- [ ] A2 — auditoria completa com tabela de conferência no resumo
- [ ] A4 — Total/Estoque no banco, tela e relatório; retroativo validado (carga de saldos NÃO rodada — é a F6C)
- [ ] A5 — visualizador sem pendências; `/pendencias` no ar para operador
- [ ] Backups feitos antes de cada update em produção; contagens antes/depois no resumo
- [ ] `npm run lint`, `npm run test` e `npm run build` limpos; deploy feito
- [ ] `docs/DECISOES.md` com cada decisão (data · contexto · escolha · motivo); README atualizado

## 5. Decisões do Johnny — sessão de 16/07/2026 (autoridade desta OS)

**Ordem de execução: melhorias primeiro, cargas por último** — F6A → F6B → F6C (a F6C só quando o export dos saldos existir).

1. "Verificar estoque" = (a) números do relatório suspeitos → A2; (b) saldos de itens pendentes → **F6C** (cargas por último); (c) entradas aparecem todas no dia da carga ao filtrar por semana → A1.
2. Atrelar desconta estoque; **liberação** (item fica definitivamente com a pessoa) desconta estoque; devolução repõe → A4.
3. `Saldo` vira `Total` (= estoque + em uso, "prateleira + atrelado/liberado com pessoas"); nova coluna `Estoque` (prateleira) → A4.
4. Pendências aparecem **apenas para o operador TI logado**; ganham página interna detalhada; saem da vista do visualizador por senha → A5.

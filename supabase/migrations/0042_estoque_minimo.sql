-- Migration 0042 — ESTOQUE MÍNIMO por item (ponto de reposição — F12 · I5).
--
-- O QUÊ: uma coluna nova em `public.itens` com o ponto de reposição do item.
--
-- POR QUÊ: hoje a tela /itens mostra Total/Estoque/Atrelados/Falta, mas ninguém
-- sabe QUANDO comprar de novo — "falta" (spec §7) é atrelados − estoque, ou seja,
-- compromisso já assumido, não previsão. O mínimo é a régua do operador: abaixo
-- dela, repor. Sem ele, a decisão de compra continua na cabeça de quem olha a
-- planilha.
--
-- SEMÂNTICA (decisão do Johnny 22/07/2026, §2.4 da OS-F12):
--   * `0` = SEM alerta — é o default e reproduz exatamente o comportamento de
--     antes desta migration (nenhum item existente passa a alertar).
--   * A comparação é com o estoque CONSOLIDADO (todas as filiais somadas), não
--     por filial: o mínimo por filial exigiria tabela própria (item × filial) e
--     fica para quando o uso pedir. Quem compra, compra para a empresa.
--   * A regra "repor" é `estoque_minimo > 0 and estoque_consolidado < estoque_minimo`
--     — igual ao mínimo NÃO repõe. Vive em código
--     (`precisaRepor` em src/lib/validators/item.ts, com teste), porque o
--     consolidado já é derivado da RPC `rel_saldo_itens` (0016/0027) e esta
--     migration NÃO toca nela: a coluna é dado de catálogo, não de saldo.
--
-- ADITIVA e retrocompatível: coluna com default, sem backfill, sem alteração de
-- view/RPC/trigger. O app no ar antes do deploy da F12 simplesmente ignora a
-- coluna (as leituras nomeiam as colunas uma a uma).
--
-- Aplicar em DESENVOLVIMENTO/ensaio primeiro; produção pelo orquestrador
-- (docs/RUNBOOK-BANCO.md, caminho A — não bate no gate destrutivo).

alter table public.itens
  add column estoque_minimo int not null default 0
    constraint itens_estoque_minimo_nao_negativo check (estoque_minimo >= 0);

comment on column public.itens.estoque_minimo is
  'Ponto de reposição do item. 0 = sem alerta (default; comportamento anterior à F12). Comparado com o estoque CONSOLIDADO (rel_saldo_itens com p_filial null), nunca por filial: repor = estoque_minimo > 0 and estoque_consolidado < estoque_minimo (igual ao mínimo NÃO repõe). A comparação é feita em código (precisaRepor), não no banco.';

-- ===== SMOKE (rodar depois de aplicar — leitura + um ida-e-volta desfeito) =====
--   -- 1) coluna criada, NOT NULL, default 0
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'itens' and column_name = 'estoque_minimo';
--   -- esperado: estoque_minimo · integer · NO · 0
--
--   -- 2) o CHECK existe
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.itens'::regclass and conname = 'itens_estoque_minimo_nao_negativo';
--   -- esperado: 1 linha · CHECK ((estoque_minimo >= 0))
--
--   -- 3) nenhum item existente passou a alertar (todos nasceram em 0)
--   select count(*) filter (where estoque_minimo <> 0) as fora_do_default from public.itens;
--   -- esperado: 0
--
--   -- 4) negativo é recusado pelo banco — dentro de uma transação DESFEITA
--   begin;
--     update public.itens set estoque_minimo = -1 where id = (select min(id) from public.itens);
--     -- esperado: ERROR: new row ... violates check constraint "itens_estoque_minimo_nao_negativo"
--   rollback;
--
-- ===== ROLLBACK desta migration (se for preciso desfazer) =====
--   alter table public.itens drop column estoque_minimo;
--   -- Nada mais depende da coluna: nenhuma view, RPC ou trigger a referencia.

-- Migration 0002 — tipos (enums) do dominio.
-- Origem: supabase/schema.sql (rascunho v1.0). A partir da F1 as migrations
-- sao a fonte da verdade do banco. Vocabularios vindos da analise das
-- planilhas reais de jan-jul/2026 (ver docs/ESPECIFICACAO.md secoes 4 e 5).
-- Aplicar no projeto de DESENVOLVIMENTO.

-- Categoria fisica do ativo.
create type public.categoria_ativo as enum (
  'notebook', 'desktop', 'monitor', 'celular', 'tablet', 'outro'
);

-- Estado do ativo (DERIVADO da ultima movimentacao pelo trigger — 0004).
create type public.status_ativo as enum (
  'em_estoque',     -- disponivel p/ entrega (hoje: Estoque/Guardada)
  'reservado',      -- separado p/ chamado   (hoje: Reservada)
  'em_uso',         -- com colaborador/setor (hoje: Remanejo/Saida)
  'emprestado',     -- saida temporaria
  'em_triagem',     -- devolvido, aguardando conferencia (hoje: Validar/Devolvido)
  'em_manutencao',  -- em conserto/assistencia
  'defasado',       -- reserva tecnica (hoje: RT Wap/Posse Wap/Defasada)
  'descartado'      -- baixa definitiva (final)
);

-- Tipos de movimentacao (13). 'ajuste' e 'estorno' sao as valvulas de escape
-- administrativas; os outros 11 sao o dia a dia. Transicoes validas em 0004.
create type public.tipo_movimentacao as enum (
  'compra', 'saida', 'emprestimo', 'reserva', 'devolucao',
  'triagem_ok', 'envio_manutencao', 'retorno_manutencao',
  'marcar_defasado', 'descarte', 'transferencia', 'ajuste', 'estorno'
);

-- Termo de responsabilidade: 'enviado' = gerado e mandado, ainda sem assinatura;
-- 'sim' = assinado e arquivado; 'nao' = nem gerado. 'enviado'/'nao'/nulo contam
-- como pendencia (spec secao 5).
create type public.termo_status as enum ('sim', 'nao', 'enviado');

-- (Nao existe enum de papel: todo usuario logado e OPERADOR — nivel unico,
-- spec secao 3. O visualizador de relatorio nao tem conta — entra por senha.)

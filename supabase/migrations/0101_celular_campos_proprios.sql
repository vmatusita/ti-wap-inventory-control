-- Migration 0101 — F25: o celular ganha campos próprios (telefone, IMEI, Pulsus).
--
-- Contexto: docs/prompts/F25-celular-cidade-filtros-ultracode.md §1.1.
-- Entrega um dos itens que docs/PLANO-TERMOS.md §9 registrou como fora do escopo da F5A:
-- "colunas novas no ativo (IMEI, telefone, Pulsus)".
--
-- ADITIVA e só-colunas (nenhuma RPC, policy, trigger ou índice muda) → caminho A do RUNBOOK.
--
-- =============================================================================
-- O QUE MUDA, E POR QUE
-- =============================================================================
-- Na F5A, a decisão §3.6 do PLANO-TERMOS foi que telefone, IMEI e Pulsus seriam MANUAIS:
-- não existiam no ativo, então entravam digitados no diálogo de geração do termo e ficavam
-- apenas no snapshot `dados` daquele termo. O custo real disso apareceu no uso: o mesmo
-- aparelho tem o mesmo IMEI a vida inteira, e a cada termo alguém redigitava os três — de
-- cabeça ou garimpando em `ativos.observacoes`, onde eles acabaram parando em texto livre.
--
-- Com estas colunas o dado passa a morar onde ele é: no ativo. O termo pré-preenche a
-- partir do cadastro (F25 §2.3) e os campos continuam 100% editáveis no diálogo — a regra
-- do §3.9 do plano ("editar o termo não altera o cadastro") NÃO muda.
--
-- =============================================================================
-- POR QUE NÃO HÁ CHECK POR CATEGORIA
-- =============================================================================
-- A tentação é `check (categoria = 'celular' or (telefone is null and ...))`. Não entra, e a
-- razão é dupla:
--
--   1. A exibição condicional é da UI (F25 §2.1: os campos aparecem só quando a categoria
--      selecionada é celular). Um CHECK transformaria um detalhe de tela numa invariante do
--      banco — e a primeira consequência seria um SQLSTATE feio no lugar de um campo escondido.
--   2. O acervo real tem número de telefone anotado em `observacoes` de ativos que NÃO são
--      celular (chip de tablet, linha de ramal). Esta fase não migra `observacoes` (decisão
--      registrada: dado real em texto livre, quem move é gente, na ficha). Um CHECK fecharia
--      a porta para quem um dia quiser mover um desses à mão.
--
-- A categoria de um ativo não muda depois de criado, então não há o caso "era celular, virou
-- notebook e ficou com IMEI órfão".
--
-- =============================================================================
-- O QUE ESTA MIGRATION NÃO FAZ
-- =============================================================================
-- NÃO migra `ativos.observacoes` para as colunas novas. É dado REAL de produção em texto
-- livre, sem formato garantido — adivinhar qual pedaço é IMEI e qual é telefone é o tipo de
-- heurística que erra em silêncio sobre dado que ninguém confere. O texto fica onde está; o
-- operador move quando tocar na ficha. Decisão em docs/DECISOES.md (04/08/2026).
--
-- NÃO entra no import de startup: o layout da planilha fica byte a byte como está (F25,
-- "Fora do escopo"). Os campos novos se preenchem no cadastro e na ficha.

alter table public.ativos
  add column if not exists telefone text,
  add column if not exists imei text,
  add column if not exists pulsus text;

comment on column public.ativos.telefone is
  'Campo de celular (F25): número da linha do aparelho. Texto livre — o legado vem sem formato. Pré-preenche o termo de responsabilidade de celular.';
comment on column public.ativos.imei is
  'Campo de celular (F25): IMEI do aparelho. Texto livre, SEM máscara — o legado vem sujo (com/sem separador, às vezes dois IMEIs na mesma linha).';
comment on column public.ativos.pulsus is
  'Campo de celular (F25): identificação do aparelho no Pulsus (MDM). Texto livre.';

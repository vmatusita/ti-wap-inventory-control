-- Migration 0102 — F25: a filial ganha CIDADE (a que assina o termo).
--
-- Contexto: docs/prompts/F25-celular-cidade-filtros-ultracode.md §1.2.
-- Responde a pergunta aberta nº 4 de docs/PLANO-TERMOS.md §10 ("a cidade fixa 'São José dos
-- Pinhais' dos modelos vale para todas as filiais?"). O Johnny respondeu em 04/08/2026:
-- NÃO — varia por filial.
--
-- ADITIVA (uma coluna com default + um UPDATE de seed em 5 linhas conhecidas) → caminho A
-- do RUNBOOK. Nenhuma RPC, policy, trigger ou índice muda.
--
-- =============================================================================
-- O QUE MUDA, E POR QUE
-- =============================================================================
-- Os 7 modelos de termo cravavam "São José dos Pinhais" na linha da assinatura — certo para
-- a Matriz e o CD Afonso Pena, errado para Linhares (ES), Serra (ES) e Eusébio (CE). A F25
-- retagueou essa linha para `{cidade}, {data_extenso}` e o pré-preenchimento sai daqui.
--
-- =============================================================================
-- SÓ A CIDADE — SEM UF, E O FORO NÃO MUDA
-- =============================================================================
-- Não há coluna de UF porque nada a consome: a linha da assinatura imprime só a cidade.
--
-- E a cláusula de FORO dos modelos ("Fica eleito o foro da Comarca de São José dos
-- Pinhais/PR") fica INTOCADA em todos os 7 — é texto jurídico, decidido pela sede da
-- empresa e não pelo lugar onde o equipamento foi entregue. Decisão explícita do Johnny
-- (04/08/2026), registrada em docs/DECISOES.md. Quem mexer nisso um dia precisa de
-- orientação jurídica, não de uma migration.
--
-- =============================================================================
-- `not null default ''` — POR QUE NÃO `null`
-- =============================================================================
-- `''` é o estado honesto de "ainda não cadastrada" e mantém o tipo simples para quem lê
-- (nenhum `?? ''` espalhado pelo app). A filial nova criada em /admin/filiais nasce com `''`
-- até alguém preencher, e a fase trata esse caso na origem: `prepararTermo` AVISA
-- ("cadastre em Administração → Filiais ou preencha aqui") em vez de deixar sair um termo
-- começando por vírgula.
--
-- O seed abaixo é POR SLUG, e não por id: id de filial é sequência e não é garantido igual
-- entre ensaio e produção. Os slugs foram conferidos por SELECT nos dois bancos antes desta
-- migration (04/08/2026) — ensaio tem as 5; produção tem as 5 mais `nova-teste`, uma filial
-- INATIVA de teste que fica com `''` de propósito (não é lugar real, não assina termo).

alter table public.filiais
  add column if not exists cidade text not null default '';

comment on column public.filiais.cidade is
  'Cidade que assina o termo (F25): entra na linha "{cidade}, {data por extenso}" dos 7 modelos. NÃO tem relação com a cláusula de foro, que segue fixa na comarca da sede.';

-- Seed das filiais conhecidas. `where cidade = ''` para ser idempotente E para nunca
-- sobrescrever uma cidade que alguém já tenha corrigido pela tela.
update public.filiais set cidade = 'São José dos Pinhais' where slug = 'matriz'         and cidade = '';
update public.filiais set cidade = 'São José dos Pinhais' where slug = 'cd-afonso-pena' and cidade = '';
update public.filiais set cidade = 'Linhares'             where slug = 'linhares'       and cidade = '';
update public.filiais set cidade = 'Serra'                where slug = 'serra'          and cidade = '';
update public.filiais set cidade = 'Eusébio'              where slug = 'eusebio'        and cidade = '';

-- Migration 0007 — seeds fixos (dados de REFERENCIA, nao ficticios).
-- Filiais e motivos vindos da analise das planilhas reais (spec secao 5).
-- Estes NAO sao os dados de desenvolvimento (esses vem do scripts/seed.ts).
-- `on conflict do nothing` deixa a migration re-executavel em `supabase db reset`.
-- Aplicar no projeto de DESENVOLVIMENTO.

-- Filiais. O cadastro e ajustavel pelo admin (a duvida CE Serra/Serra Park/
-- Eusebio — pergunta 1 da spec — nao trava o desenvolvimento).
insert into public.filiais (slug, nome) values
  ('matriz',         'Matriz'),
  ('cd-afonso-pena', 'CD Afonso Pena'),
  ('linhares',       'Linhares'),
  ('serra-park',     'Serra Park'),
  ('eusebio',        'Eusébio')
on conflict (slug) do nothing;

-- Motivos. "Emprestimo" e "Transferencia" das planilhas sao TIPOS de
-- movimentacao, nao motivos (spec secao 5). Motivo e opcional para esses tipos.
insert into public.motivos (codigo, rotulo, aplica_a) values
  -- saida / reserva / emprestimo
  ('novo_colaborador',  'Novo colaborador',            '{saida,reserva,emprestimo}'),
  ('troca_upgrade',     'Troca / upgrade',             '{saida,devolucao}'),
  ('monitor_adicional', 'Monitor adicional',           '{saida}'),
  ('uso_compartilhado', 'Uso compartilhado / interno', '{saida,emprestimo}'),
  ('troca_titular',     'Troca de titular',            '{saida}'),
  ('reposicao',         'Reposição',                   '{saida,devolucao}'),
  ('assistencia',       'Assistência técnica',         '{saida,devolucao,envio_manutencao}'),
  -- devolucao
  ('desligamento',      'Desligamento',                '{devolucao}'),
  ('afastamento',       'Afastamento',                 '{devolucao}'),
  ('fim_emprestimo',    'Fim de empréstimo',           '{devolucao}'),
  ('manutencao',        'Manutenção',                  '{devolucao,envio_manutencao}'),
  ('garantia',          'Garantia',                    '{devolucao}'),
  -- geral (vale para qualquer tipo de movimentacao)
  ('outro',             'Outro (ver observação)',
   '{compra,saida,emprestimo,reserva,devolucao,triagem_ok,envio_manutencao,retorno_manutencao,marcar_defasado,descarte,transferencia,ajuste,estorno}')
on conflict (codigo) do nothing;

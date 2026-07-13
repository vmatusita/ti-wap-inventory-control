-- Migration 0008 — entrada de equipamento novo (compra) em lote, ATÔMICA.
-- Spec §8 regra 8 / OS-F2 3.5.5: cadastra o(s) ativo(s) novo(s) — que nascem
-- `em_estoque` na filial que recebeu — e registra uma movimentação `compra` por
-- ativo, TUDO OU NADA. Uma função (uma transação): se qualquer patrimônio colidir
-- com o índice único (patrimonio + service_tag, §5) ou qualquer insert falhar,
-- a transação inteira faz rollback e nada entra.
--
-- SECURITY INVOKER (padrão): roda com a RLS do operador logado (policies da 0005).
-- O trigger `aplicar_movimentacao` (0004) deriva o estado normalmente.
-- Aplicar no projeto de DESENVOLVIMENTO.

create or replace function public.criar_compra_lote(
  p_itens      jsonb,   -- [{patrimonio, patrimonio_original, service_tag, categoria,
                        --   marca, modelo, memoria, armazenamento, processador,
                        --   fornecedor, filial_id, observacoes, data, observacao}]
  p_criado_por uuid
)
returns table (ativo_id uuid, patrimonio text)
language plpgsql
as $$
declare
  item     jsonb;
  v_id     uuid;
  v_filial smallint;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Lote de compra vazio';
  end if;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    v_filial := (item->>'filial_id')::smallint;

    insert into public.ativos (
      patrimonio, patrimonio_original, service_tag, categoria, marca, modelo,
      memoria, armazenamento, processador, fornecedor, filial_id, origem, observacoes
    ) values (
      item->>'patrimonio',
      nullif(item->>'patrimonio_original', ''),
      nullif(item->>'service_tag', ''),
      (item->>'categoria')::public.categoria_ativo,
      nullif(item->>'marca', ''),
      nullif(item->>'modelo', ''),
      nullif(item->>'memoria', ''),
      nullif(item->>'armazenamento', ''),
      nullif(item->>'processador', ''),
      nullif(item->>'fornecedor', ''),
      v_filial,
      'cadastro',
      nullif(item->>'observacoes', '')
    )
    returning id into v_id;

    -- Movimentação `compra`: documenta a entrada e fixa a filial (regra 8). O
    -- trigger valida em_estoque -> em_estoque e grava o snapshot.
    insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
    values (
      v_id, 'compra',
      coalesce((item->>'data')::date, current_date),
      v_filial,
      nullif(item->>'observacao', ''),
      p_criado_por
    );

    ativo_id   := v_id;
    patrimonio := item->>'patrimonio';
    return next;
  end loop;
end $$;

-- Só operador logado executa (anon não tem policy de insert, mas fechamos aqui também).
revoke all on function public.criar_compra_lote(jsonb, uuid) from public;
grant execute on function public.criar_compra_lote(jsonb, uuid) to authenticated;

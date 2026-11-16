-- F67B — a contagem de objetos por bucket e por FORMA de caminho (fato 16), so leitura.
-- Devolve so (bucket, forma, n): nenhum nome de objeto sai do banco.
-- Rodada em producao em 16/11/2026 (resultado em producao/contagens.txt). Reusada no T0/T1 da janela,
-- com o filtro "created_at > <deploy>" acrescentado.
with o as (select bucket_id, name from storage.objects),
f as (
  select bucket_id,
    case
      when bucket_id = 'termos' and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.docx$' then 'termos:raiz-uuid.docx'
      when bucket_id = 'termos' then 'termos:OUTRA'
      when name ~ '^(import|reset|conflito|ativo|orfao)/empresa-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then 'bk:NOVA'
      when name ~ '^import/filial-[0-9]+/[^/]+\.json$' then 'bk:import-filial.json'
      when name ~ '^import/filial-[0-9]+/[^/]+/termos/[^/]+$' then 'bk:import-filial/termos'
      when name ~ '^reset/[^/]+/(global|filial-[0-9]+)/[^/]+\.json$' then 'bk:reset.json'
      when name ~ '^reset/[^/]+/(global|filial-[0-9]+)/[^/]+/termos/[^/]+$' then 'bk:reset/termos'
      when name ~ '^conflito/[0-9a-f]{32}/[^/]+\.json$' then 'bk:conflito.json'
      when name ~ '^conflito/[0-9a-f]{32}/termos/[^/]+$' then 'bk:conflito/termos'
      when name ~ '^ativo/[0-9a-fA-F-]{36}/termos/[^/]+$' then 'bk:ativo/termos'
      when name ~ '^(import|reset|conflito|ativo|orfao)/' then 'bk:FAMILIA-FORA-DE-FORMA'
      when name ~ '^[^/]+/[^/]+\.json$' then 'bk:historica slug/carimbo.json'
      else 'bk:FORA-DE-TODA-FORMA'
    end as forma
  from o)
select bucket_id, forma, count(*) as n from f group by 1,2 order by 1,2;

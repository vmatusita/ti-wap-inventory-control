-- Migration 0115 — a fila de consolidação não conta grupo que não é pessoa nenhuma (revisão
-- de código da F37, 28/08/2026).
--
-- ADITIVA em efeito, e cirúrgica: um `create or replace view` que muda UMA linha do
-- filtro de `public.v_colaboradores_textos`. Nenhuma coluna entra, sai ou muda de
-- tipo; nenhuma função, tabela, trigger ou policy é tocada. A view de resumo
-- (`v_colaboradores_consolidacao`) não precisa ser recriada — ela lê esta, e herda a
-- correção sozinha.
--
-- ---------------------------------------------------------------------------
-- O DEFEITO
-- ---------------------------------------------------------------------------
-- A 0112 filtrava as duas pontas da união com `btrim(coalesce(colaborador,'')) <> ''`.
-- Parece "descarta nome em branco", e quase é: `btrim(texto)` de UM argumento apara
-- SÓ o espaço ASCII — não apara tab, CR, LF, form feed, vertical tab nem NBSP. Um
-- nome composto só desses caracteres ATRAVESSA o filtro e vira um grupo que não é
-- pessoa nenhuma.
--
-- O estrago não é uma linha feia na tela — é um número que não fecha e não tem como
-- fechar. Com tab ou CR, `public.colaborador_chave()` colapsa tudo e a chave sai
-- VAZIA:
--
--   · `filaDeConsolidacao` (src/lib/queries/colaboradores.ts) descarta o grupo, com
--     razão: `''` não é nome de ninguém;
--   · `v_colaboradores_consolidacao` o SOMA, porque agrega esta view inteira;
--   · resultado: o cartão "Nomes sem cadastro" mostra uma pendência permanente que
--     não aparece em linha nenhuma da tabela — e que ninguém consegue consolidar,
--     porque `colaboradores_nome_nao_vazio` recusaria o cadastro em branco de
--     qualquer jeito.
--
-- Com NBSP o desfecho é outro (ver "A CORREÇÃO"), e igualmente sem saída: a chave
-- sobrevive, o grupo APARECE na fila como uma linha de nome invisível, e consolidá-lo
-- morre no check do nome vazio.
--
-- Contagem que a tela diz na cara e que o operador não consegue zerar é exatamente o
-- tipo de número em que se para de acreditar. Some o grupo, some o impasse.
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO — e o que a MEDIÇÃO mudou nela
-- ---------------------------------------------------------------------------
-- O filtro passa a ser o critério REAL, aplicado DEPOIS do agrupamento, sobre a
-- própria chave: se a chave não tem um caractere que seja de gente, não há pessoa
-- ali. Os filtros ASCII das duas pontas ficam onde estão — eles cortam de graça o
-- caso comum (nome nulo ou em branco) antes do `group by`.
--
-- A primeira versão desta migration escrevia `nome_chave <> ''`. Medido em produção
-- em 28/08/2026, ANTES de aplicar (com `values`, sem escrever nada), e o resultado
-- corrigiu o remendo:
--
--   entrada          passava na 0112   chave produzida   `<> ''` bastava?
--   E'\t'            sim               ''                sim
--   E'\r\n'          sim               ''                sim
--   NBSP (U+00A0)    sim               ' ' (o NBSP)      NÃO — a chave não é vazia
--   '   ' (ASCII)    não               ''                (nem chegava aqui)
--   'João Silva'     sim               'joao silva'      —
--
-- O NBSP não vira chave vazia: ele ATRAVESSA `colaborador_chave` inteiro (o
-- `translate` não o conhece, a classe de espaço explícita não o inclui — de
-- propósito, para o TypeScript poder espelhar a função — e `btrim` não o apara).
-- Então ele produzia um grupo de chave NÃO vazia cujo nome é invisível na tela: o
-- admin o veria na fila como uma linha em branco, poderia marcá-lo, e a
-- consolidação morreria em `colaboradores_nome_nao_vazio` (o `.trim()` do JavaScript
-- apara NBSP e manda nome vazio ao banco). Visível em vez de fantasma, mas igualmente
-- impossível de resolver.
--
-- Por isso o filtro apara a chave contra o conjunto COMPLETO de espaços que podem
-- sobreviver a ela — os seis ASCII mais o NBSP — em vez de comparar com `''`. Um
-- grupo só entra na fila se sobrar alguma coisa depois disso.
--
-- Nada muda para nome de gente de verdade: `colaborador_chave('João Silva')` é
-- 'joao silva', e nenhum grupo legítimo sai da fila (conferido: 903 grupos antes,
-- 903 depois, em produção).
--
-- ---------------------------------------------------------------------------
-- ERRATA À 0112 (comentário, não comportamento)
-- ---------------------------------------------------------------------------
-- Migration aplicada não se edita, então a correção do texto mora aqui: o comentário
-- do índice `colaboradores_ativo_nome_idx`, na 0112, justifica o índice dizendo que
-- ele "casa EXATAMENTE a única consulta quente da tabela — `listarColaboradoresAtivos`".
-- Essa função NUNCA teve um chamador e foi removida na mesma revisão. O índice
-- CONTINUA justificado, por outra consulta: o `where ativo = true order by nome` de
-- `sugestoesDoCampoColaborador` (src/lib/queries/colaboradores.ts), que é o que
-- alimenta o campo de colaborador do wizard, da contrapartida e do lançamento de
-- item. O índice fica; a justificativa é esta.
--
-- ROLLBACK LÓGICO: reaplicar o corpo da view como está na 0112 (o filtro antigo).
-- Nenhum dado é criado, alterado ou apagado por esta migration.
-- ===========================================================================

create or replace view public.v_colaboradores_textos
with (security_invoker = true) as
  select
    g.nome_chave,
    g.grafia_exemplo,
    g.ocorrencias,
    g.grafias,
    g.filial_id,
    (c.id is not null) as ja_cadastrado,
    c.id               as colaborador_id
  from (
    select
      public.colaborador_chave(t.nome)                        as nome_chave,
      mode() within group (order by t.nome)                    as grafia_exemplo,
      count(*)::bigint                                         as ocorrencias,
      count(distinct t.nome)::bigint                           as grafias,
      mode() within group (order by t.filial_id)               as filial_id
    from (
      select m.colaborador as nome, m.filial_id
        from public.movimentacoes m
       where btrim(coalesce(m.colaborador, '')) <> ''
      union all
      select l.colaborador, l.filial_id
        from public.lancamentos_item l
       where btrim(coalesce(l.colaborador, '')) <> ''
    ) t
    group by 1
  ) g
  left join public.colaboradores c on c.nome_chave = g.nome_chave
  -- O filtro que a 0112 não tinha. Ver "A CORREÇÃO" no cabeçalho: o `btrim` de UM
  -- argumento das duas pontas apara só o espaço ASCII, então um nome de tab/CR/NBSP
  -- atravessava e virava um grupo que ninguém consegue consolidar. A chave é aparada
  -- aqui contra o conjunto COMPLETO — os seis espaços ASCII mais o NBSP (chr(160)),
  -- que é o único que sobrevive a `colaborador_chave`. `coalesce` por segurança: a
  -- função é `strict`, e chave nula é tão "não é pessoa nenhuma" quanto a vazia.
  where btrim(
          coalesce(g.nome_chave, ''),
          ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160)
        ) <> '';

comment on view public.v_colaboradores_textos is
  'Fila de consolidação (F37 · A.5): um grupo por chave normalizada de nome digitado à mão em movimentacoes/lancamentos_item, com a contagem de ocorrências SOMADA NO BANCO e a marca de já ter cadastro. `ja_cadastrado = false` é o que a tela oferece para criar em lote. Não altera registro nenhum — o passado se resolve por chave na leitura. Desde a 0115, grupo que não é pessoa nenhuma fica de fora — nome só de tab/CR/NBSP, que o btrim ASCII da 0112 deixava passar: com tab virava contagem fantasma (somada no resumo, invisível na lista) e com NBSP virava linha de nome invisível que a consolidação recusava.';

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   -- 1) nenhum grupo sem caractere de gente sobreviveu (chave vazia OU so NBSP):
--   select count(*) as grupos_vazios from public.v_colaboradores_textos
--    where btrim(coalesce(nome_chave, ''),
--                ' '||chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(160)) = '';
--   -- esperado: 0
--
--   -- 2) o resumo e a lista contam a MESMA coisa (era isto que divergia):
--   select (select count(*) from public.v_colaboradores_textos where not ja_cadastrado)
--            as grupos_na_lista,
--          coalesce((select grupos from public.v_colaboradores_consolidacao
--                     where ja_cadastrado = false), 0) as grupos_no_resumo;
--   -- esperado: os dois números IGUAIS
--
--   -- 3) a view continua com security_invoker (o roteiro seguranca_catalogo.sql cobra):
--   select reloptions from pg_class where oid = 'public.v_colaboradores_textos'::regclass;
--   -- esperado: {security_invoker=true}

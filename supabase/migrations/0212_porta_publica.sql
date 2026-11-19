-- =====================================================================================================================
-- 0212_porta_publica.sql — F68 (19/11/2026): a porta pública por empresa — as DUAS portas de `anon`
-- =====================================================================================================================
-- classe: ADITIVA (três funções novas; nenhuma linha muda)
--
-- Até a F68 quem entrava por senha de visualização recebia o client ADMINISTRATIVO (service role, rolbypassrls): as
-- quatro defesas da virada (RLS por membership, FK composta, roteiro de isolamento, guarda nas RPCs) não alcançavam esse
-- caminho, e o único muro era o código das queries de relatório. Agora o visualizador fala SÓ por duas funções, como
-- `anon`, por um client que não lê cookie nenhum (src/lib/supabase/publico.ts):
--
--   · relatorio_publico_abrir(p_slug, p_senha, p_origem) → {"ok": true, "sessao": <token>} | {"ok": false} |
--     {"ok": false, "recusa": "tentativas"}. Confere a senha DENTRO do banco (bcrypt — decisão 19/11-3) contra as ativas
--     bcrypt DA EMPRESA DO SLUG. As cinco recusas (sem senha, senha errada, senha revogada, slug inexistente, senha de A
--     no slug de B) devolvem EXATAMENTE {"ok": false} e fazem o MESMO trabalho: sempre 5 crypt() (o teto de senhas
--     ativas por empresa da 0211), completando com um sal fictício de mesmo custo, o resultado guardado antes da
--     comparação, sem saída antecipada. Antes de qualquer senha, o contador (0210): teto por empresa, depois por
--     (empresa, origem) — estourado, recusa ("tentativas"); erro nele, a função inteira falha e nada é conferido
--     (R-ACC-95). No acerto, abre a sessão (0209): token de 32 bytes, guardado só como sha-256, 24 h.
--   · relatorio_publico_dados(p_sessao, p_slug, p_pedido, p_args) → jsonb, uma lista FECHADA de pedidos: porta (o único
--     sem sessão: só slug → nome da empresa, o que o próprio link já diz), sessao, gerados, gerado, encerrar. Por
--     dentro: o hash do token → a sessão viva (não vencida, não encerrada, senha ativa e bcrypt) → a empresa; o slug da
--     rota tem de ser o da empresa da sessão (a diagonal: {"ok": false, "recusa": "empresa"}, a página responde 404).
--     Só `encerrar` escreve.
--   · relatorio_publico_projetar(valor, lista) — a LISTA BRANCA aplicada: um objeto só leva as chaves da lista, um
--     array projeta cada elemento, uma folha só deixa passar escalar. TUDO o que `dados` devolve de tabela passa por
--     ela, com a lista `k_lista` — a MESMA de src/lib/relatorios/lista-branca-porta.ts (a trava TS↔SQL
--     lista-branca-porta.test.ts). Nenhum nome de pessoa sai (decisão 19/11-2): colaborador, setor, autor de anotação e
--     quem gerou o relatório não estão na lista, nem os ids internos. Sem EXECUTE para ninguém: só o dono (as duas
--     portas, security definer) a chama.
--
-- AS ÚNICAS DE `public` EXECUTÁVEIS POR `anon` (o par nominal k_secdef_anon de catalogo_secdef.sql): EXECUTE só para
-- anon — revoke de public, authenticated e service_role. Um operador logado no mesmo navegador não muda o papel da
-- chamada, porque o client da porta não lê o cookie da sessão dele.
-- =====================================================================================================================

set lock_timeout = '2s';

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) a projeção da lista branca
-- ---------------------------------------------------------------------------------------------------------------------
create function public.relatorio_publico_projetar(p_valor jsonb, p_lista jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    return p_valor;
  end if;
  if jsonb_typeof(p_lista) = 'boolean' then
    -- a FOLHA: só escalar passa — um objeto ou array onde a lista espera um valor não sai
    if p_lista = 'true'::jsonb and jsonb_typeof(p_valor) in ('string', 'number', 'boolean') then
      return p_valor;
    end if;
    return null;
  end if;
  if jsonb_typeof(p_lista) = 'array' then
    if jsonb_typeof(p_valor) <> 'array' then
      return null;
    end if;
    return coalesce(
      (select jsonb_agg(public.relatorio_publico_projetar(e.valor, p_lista -> 0) order by e.ordem)
         from jsonb_array_elements(p_valor) with ordinality as e(valor, ordem)),
      '[]'::jsonb);
  end if;
  if jsonb_typeof(p_lista) = 'object' then
    if jsonb_typeof(p_valor) <> 'object' then
      return null;
    end if;
    return coalesce(
      (select jsonb_object_agg(l.key, public.relatorio_publico_projetar(v.value, l.value))
         from jsonb_each(p_lista) as l
         join jsonb_each(p_valor) as v on v.key = l.key),
      '{}'::jsonb);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) a entrada: a senha conferida pelo banco
-- ---------------------------------------------------------------------------------------------------------------------
create function public.relatorio_publico_abrir(p_slug text, p_senha text, p_origem text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
-- a linha do contador fica travada até o fim da chamada (depois dos 5 crypt): uma chamada concorrente da MESMA empresa
-- espera no máximo 500 ms e então FALHA (o app recusa — R-ACC-95), em vez de segurar uma conexão até os 3 s do anon
set lock_timeout = '500ms'
as $$
declare
  k_sal_ficticio constant text := '$2a$10$F68PortaPublicaFictici';
  k_max_candidatas constant int := 5;
  k_teto_empresa constant int := 20;
  k_teto_origem constant int := 5;
  k_janela constant interval := interval '60 seconds';
  v_empresa uuid;
  v_balde text;
  v_n int;
  v_ids uuid[];
  v_hashes text[];
  v_h text;
  v_r text;
  v_achou uuid;
  v_token text;
  i int;
begin
  -- 1) a empresa da ROTA; slug inexistente segue o MESMO caminho, num balde só
  select e.id into v_empresa from public.empresas e where e.slug = coalesce(p_slug, '');
  v_balde := coalesce(v_empresa::text, 'inexistente');

  -- 2) o contador, ANTES de qualquer senha. Estourado o teto da EMPRESA na janela, recusa SEM travar nada (leitura sem
  --    lock): quem martela a porta não enfileira atrás da linha travada pelas chamadas que estão conferindo senha.
  if exists (select 1 from public.porta_tentativas p
              where p.chave = 'empresa:' || v_balde and p.janela_fim >= now() and p.tentativas >= k_teto_empresa) then
    return jsonb_build_object('ok', false, 'recusa', 'tentativas');
  end if;
  --    O teto por EMPRESA (todas as origens) primeiro…
  insert into public.porta_tentativas as t (chave, tentativas, janela_fim)
  values ('empresa:' || v_balde, 1, now() + k_janela)
  on conflict (chave) do update set
    tentativas = case when t.janela_fim < now() then 1 else t.tentativas + 1 end,
    janela_fim = case when t.janela_fim < now() then now() + k_janela else t.janela_fim end
  returning t.tentativas into v_n;
  if v_n > k_teto_empresa then
    return jsonb_build_object('ok', false, 'recusa', 'tentativas');
  end if;
  -- …depois por (empresa, origem) — a origem guardada só como md5
  insert into public.porta_tentativas as t (chave, tentativas, janela_fim)
  values ('origem:' || v_balde || ':' || md5(coalesce(p_origem, '')), 1, now() + k_janela)
  on conflict (chave) do update set
    tentativas = case when t.janela_fim < now() then 1 else t.tentativas + 1 end,
    janela_fim = case when t.janela_fim < now() then now() + k_janela else t.janela_fim end
  returning t.tentativas into v_n;
  if v_n > k_teto_origem then
    return jsonb_build_object('ok', false, 'recusa', 'tentativas');
  end if;

  -- 3) a faxina limitada (o mesmo trabalho em todo caminho que chega aqui); em ordem e pulando o que outra chamada já
  --    travou — duas faxinas simultâneas nunca se esperam nem se travam mutuamente
  delete from public.porta_tentativas
   where chave in (select p.chave from public.porta_tentativas p
                    where p.janela_fim < now() - interval '1 hour'
                    order by p.chave limit 50 for update skip locked);
  delete from public.sessoes_visualizador
   where id in (select s.id from public.sessoes_visualizador s
                 where s.vence_em < now() - interval '1 day' or s.encerrada_em < now() - interval '1 day'
                 order by s.id limit 50 for update skip locked);

  -- 4) as candidatas: as ATIVAS BCRYPT da empresa do slug (scrypt nunca), no máximo o teto da criação
  select array_agg(c.id order by c.id), array_agg(c.hash order by c.id)
    into v_ids, v_hashes
    from (select s.id, s.hash from public.senhas_acesso s
           where s.empresa_id = v_empresa and s.ativa and s.hash like '$2%'
           order by s.id limit k_max_candidatas) c;

  -- 5) o MESMO trabalho em todo caminho: sempre k_max_candidatas crypt(), o resultado guardado ANTES de comparar, sem
  --    sair do laço no acerto
  for i in 1 .. k_max_candidatas loop
    v_h := coalesce(v_hashes[i], k_sal_ficticio);
    v_r := extensions.crypt(coalesce(p_senha, ''), v_h);
    if v_hashes[i] is not null and v_r = v_h and v_achou is null then
      v_achou := v_ids[i];
    end if;
  end loop;

  -- 6) as cinco recusas: a MESMA resposta
  if v_achou is null then
    return jsonb_build_object('ok', false);
  end if;

  -- 7) a sessão: o token sai UMA vez; no banco, só o sha-256
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sessoes_visualizador (empresa_id, senha_id, token_hash, vence_em)
  values (v_empresa, v_achou, extensions.digest(v_token, 'sha256'), now() + interval '24 hours');
  update public.senhas_acesso s set ultimo_uso = now() where s.empresa_id = v_empresa and s.id = v_achou;
  return jsonb_build_object('ok', true, 'sessao', v_token);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3) os dados: só o que a sessão pode ver, por lista branca
-- ---------------------------------------------------------------------------------------------------------------------
create function public.relatorio_publico_dados(p_sessao text, p_slug text, p_pedido text, p_args jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- A LISTA BRANCA — a MESMA de src/lib/relatorios/lista-branca-porta.ts (trava: lista-branca-porta.test.ts)
  k_lista constant jsonb := '{
    "empresa": {"slug": true, "nome": true},
    "sessao": {"empresa": {"slug": true, "nome": true}, "rotulo": true},
    "filial": {"slug": true, "nome": true},
    "tipo": {"slug": true, "rotulo": true},
    "linha": {"id": true, "periodo_de": true, "periodo_ate": true, "versao": true, "gerado_em": true,
              "filialNome": true, "filialSlug": true, "temObservacao": true, "superada": true},
    "gerado": {"id": true, "periodo_de": true, "periodo_ate": true, "versao": true, "gerado_em": true,
               "filialNome": true, "filialSlug": true,
               "versaoMaisNova": {"id": true, "versao": true},
               "anterior": {"id": true, "periodo_de": true, "periodo_ate": true},
               "proximo": {"id": true, "periodo_de": true, "periodo_ate": true},
               "dados": {
      "meta": {"filialSlug": true, "filialNome": true, "ehGeral": true, "de": true, "ate": true,
               "periodoRotulo": true, "schema": true, "observacao": true},
      "kpis": {"total": true, "em_uso": true, "em_estoque": true, "reservado": true, "em_manutencao": true,
               "em_triagem": true, "defasado": true, "emprestado": true},
      "kpisAnterior": {"total": true, "em_uso": true, "em_estoque": true, "reservado": true, "em_manutencao": true,
                       "em_triagem": true, "defasado": true, "emprestado": true},
      "estoquePorCategoria": [{"categoria": true, "total": true}],
      "estoqueCatStatus": [{"categoria": true, "segmentos": [{"status": true, "total": true}], "total": true}],
      "disponiveisPorModelo": [{"categoria": true, "modelo": true, "modelos": [{"modelo": true, "total": true}],
                                "total": true}],
      "reservados": [{"patrimonio": true, "modelo": true, "chamado": true, "categoria": true}],
      "emManutencao": [{"patrimonio": true, "modelo": true, "observacao": true}],
      "manutencao": [{"patrimonio": true, "modelo": true, "filial": true, "chamado": true, "chamadoFornecedor": true,
                      "dataEnvio": true, "diasEmManutencao": true, "obsEnvio": true,
                      "anotacoes": [{"texto": true, "em": true}],
                      "retornoData": true, "retornoObs": true, "fechado": true, "desfecho": true}],
      "serieMovimentacoes": {"granularidade": true,
                             "pontos": [{"chave": true, "rotulo": true, "saidas": true, "devolucoes": true}]},
      "serieEstado": {"pontos": [{"chave": true, "rotulo": true, "em_estoque": true}]},
      "movimentacoesPorMes": [{"mes": true, "saidas": true, "devolucoes": true}],
      "porMotivo": {"saidas": [{"motivo": true, "total": true}], "devolucoes": [{"motivo": true, "total": true}]},
      "grupos": [{"grupo": true,
                  "itens": [{"item": true, "total": true, "estoque": true, "saldo": true, "minimo": true,
                             "atrelados": true, "falta": true, "entradas": true, "saidas": true, "delta": true,
                             "obs": true}],
                  "ultimoLancamento": true, "temAtrelados": true}],
      "pendencias": [{"chave": true, "rotulo": true, "total": true}],
      "saidas": [{"data": true, "filial": true, "categoria": true, "modelo": true, "patrimonio": true, "tipo": true,
                  "motivo": true, "chamado": true, "termo": true, "obs": true, "estornada": true,
                  "estornoData": true}],
      "entradas": [{"data": true, "filial": true, "categoria": true, "modelo": true, "patrimonio": true, "tipo": true,
                    "motivo": true, "itensFaltantes": [true], "obs": true, "estornada": true, "estornoData": true}],
      "transferencias": [{"data": true, "de": true, "para": true, "categoria": true, "modelo": true,
                          "patrimonio": true, "chamado": true, "obs": true, "estornada": true, "estornoData": true}],
      "tabelasTruncadas": {"saidas": {"mostradas": true, "total": true},
                           "entradas": {"mostradas": true, "total": true},
                           "transferencias": {"mostradas": true, "total": true}},
      "movimentacoesItens": [{"data": true, "filial": true, "item": true, "grupo": true, "tipo": true,
                              "quantidade": true, "chamado": true, "obs": true, "ehEstorno": true,
                              "estornada": true, "estornoData": true}],
      "ultimasMovimentacoes": [{"data": true, "tipo": true, "patrimonio": true, "ativo": true, "categoria": true,
                                "filial": true, "chamado": true, "observacao": true}],
      "resumo": {"de": true, "ate": true,
                 "saidas": {"total": true, "filiais": [{"filial": true, "total": true,
                            "motivos": [{"motivo": true, "total": true,
                                         "categorias": [{"categoria": true, "total": true}]}]}]},
                 "devolucoes": {"total": true, "filiais": [{"filial": true, "total": true,
                                "motivos": [{"motivo": true, "total": true,
                                             "categorias": [{"categoria": true, "total": true}]}]}]}}
    }}
  }'::jsonb;
  k_por_pagina constant int := 30;
  v_empresa uuid;
  v_slug text;
  v_nome text;
  v_rotulo text;
  v_sessao_id uuid;
  v_senha_id uuid;
  v_pagina int;
  v_paginas int;
  v_total int;
  v_filtro jsonb;
  v_consolidado boolean;
  v_filiais smallint[];
  v_linhas jsonb;
  v_lista_filiais jsonb;
  v_id uuid;
  v_g record;
  v_mais_nova jsonb;
  v_anterior jsonb;
  v_proximo jsonb;
  v_tipos jsonb;
begin
  -- 0) o pedido sem sessão: só slug → nome (o que o próprio link já diz)
  if p_pedido = 'porta' then
    select e.slug, e.nome into v_slug, v_nome from public.empresas e where e.slug = coalesce(p_slug, '');
    if not found then
      return jsonb_build_object('ok', false, 'recusa', 'empresa');
    end if;
    return jsonb_build_object('ok', true, 'empresa',
      public.relatorio_publico_projetar(jsonb_build_object('slug', v_slug, 'nome', v_nome), k_lista -> 'empresa'));
  end if;

  -- 1) a lista FECHADA: pedido fora dela é a recusa da sessão
  if p_pedido is null or p_pedido not in ('sessao', 'gerados', 'gerado', 'encerrar') then
    return jsonb_build_object('ok', false, 'recusa', 'sessao');
  end if;

  -- 2) a sessão → a empresa, POR DENTRO: o hash do token e a sessão viva (não vencida, não encerrada)…
  select s.id, s.empresa_id, s.senha_id
    into v_sessao_id, v_empresa, v_senha_id
    from public.sessoes_visualizador s
   where s.token_hash = extensions.digest(coalesce(p_sessao, ''), 'sha256')
     and s.encerrada_em is null
     and s.vence_em > now();
  if not found then
    return jsonb_build_object('ok', false, 'recusa', 'sessao');
  end if;
  -- …e a senha dela ainda ativa e bcrypt (a FK composta da 0209 garante que ela é da empresa da sessão) — a revogação
  -- mata a sessão aqui, no pedido seguinte
  select sa.rotulo into v_rotulo
    from public.senhas_acesso sa
   where sa.id = v_senha_id and sa.ativa and sa.hash like '$2%';
  if not found then
    return jsonb_build_object('ok', false, 'recusa', 'sessao');
  end if;
  select e.slug, e.nome into v_slug, v_nome from public.empresas e where e.id = v_empresa;

  -- 3) a DIAGONAL: o slug da rota tem de ser o da empresa da sessão
  if v_slug <> coalesce(p_slug, '') then
    return jsonb_build_object('ok', false, 'recusa', 'empresa');
  end if;

  -- 4) os pedidos
  if p_pedido = 'encerrar' then
    update public.sessoes_visualizador s set encerrada_em = now() where s.id = v_sessao_id;
    return jsonb_build_object('ok', true);
  end if;

  if p_pedido = 'sessao' then
    return jsonb_build_object('ok', true, 'sessao', public.relatorio_publico_projetar(
      jsonb_build_object('empresa', jsonb_build_object('slug', v_slug, 'nome', v_nome), 'rotulo', v_rotulo),
      k_lista -> 'sessao'));
  end if;

  if p_pedido = 'gerados' then
    v_pagina := case when coalesce(p_args ->> 'pagina', '') ~ '^[0-9]{1,6}$' then (p_args ->> 'pagina')::int else 1 end;
    v_pagina := greatest(v_pagina, 1);
    v_filtro := case when jsonb_typeof(p_args -> 'filiais') = 'array' then p_args -> 'filiais' end;
    v_consolidado := coalesce(v_filtro ? 'geral', false);
    select coalesce(array_agg(f.id), '{}') into v_filiais
      from public.filiais f
     where f.empresa_id = v_empresa
       and v_filtro is not null
       and f.slug in (select jsonb_array_elements_text(v_filtro));
    select count(*) into v_total
      from public.relatorios_gerados g
     where g.empresa_id = v_empresa
       and (v_filtro is null or (v_consolidado and g.filial_id is null) or g.filial_id = any (v_filiais));
    v_paginas := greatest(1, ceil(v_total / k_por_pagina::numeric)::int);
    v_pagina := least(v_pagina, v_paginas);
    select coalesce(jsonb_agg(public.relatorio_publico_projetar(jsonb_build_object(
             'id', x.id, 'periodo_de', x.periodo_de, 'periodo_ate', x.periodo_ate, 'versao', x.versao,
             'gerado_em', x.gerado_em, 'filialNome', coalesce(f.nome, 'Consolidado'), 'filialSlug', f.slug,
             'temObservacao', coalesce(btrim(x.observacao), '') <> '',
             'superada', exists (select 1 from public.relatorios_gerados o
                                  where o.empresa_id = v_empresa and o.periodo_de = x.periodo_de
                                    and o.periodo_ate = x.periodo_ate
                                    and coalesce(o.filial_id, -1) = coalesce(x.filial_id, -1)
                                    and o.versao > x.versao)),
             k_lista -> 'linha') order by x.gerado_em desc, x.id desc), '[]'::jsonb)
      into v_linhas
      from (select g.id, g.filial_id, g.periodo_de, g.periodo_ate, g.versao, g.gerado_em, g.observacao
              from public.relatorios_gerados g
             where g.empresa_id = v_empresa
               and (v_filtro is null or (v_consolidado and g.filial_id is null) or g.filial_id = any (v_filiais))
             order by g.gerado_em desc, g.id desc
             limit k_por_pagina offset (v_pagina - 1) * k_por_pagina) x
      left join public.filiais f on f.empresa_id = v_empresa and f.id = x.filial_id;
    select coalesce(jsonb_agg(public.relatorio_publico_projetar(jsonb_build_object('slug', f.slug, 'nome', f.nome),
             k_lista -> 'filial') order by f.nome, f.slug), '[]'::jsonb)
      into v_lista_filiais
      from public.filiais f
     where f.empresa_id = v_empresa;
    return jsonb_build_object('ok', true, 'total', v_total, 'pagina', v_pagina, 'porPagina', k_por_pagina,
      'linhas', v_linhas, 'filiais', v_lista_filiais);
  end if;

  -- p_pedido = 'gerado'
  if coalesce(p_args ->> 'id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return jsonb_build_object('ok', false, 'recusa', 'gerado');
  end if;
  v_id := (p_args ->> 'id')::uuid;
  select g.id, g.filial_id, g.periodo_de, g.periodo_ate, g.versao, g.gerado_em, g.dados,
         coalesce(f.nome, 'Consolidado') as filial_nome, f.slug as filial_slug
    into v_g
    from public.relatorios_gerados g
    left join public.filiais f on f.empresa_id = v_empresa and f.id = g.filial_id
   where g.empresa_id = v_empresa and g.id = v_id;
  if not found then
    return jsonb_build_object('ok', false, 'recusa', 'gerado');
  end if;
  select jsonb_build_object('id', o.id, 'versao', o.versao) into v_mais_nova
    from public.relatorios_gerados o
   where o.empresa_id = v_empresa and o.periodo_de = v_g.periodo_de and o.periodo_ate = v_g.periodo_ate
     and coalesce(o.filial_id, -1) = coalesce(v_g.filial_id, -1) and o.versao > v_g.versao
   order by o.versao desc limit 1;
  select jsonb_build_object('id', o.id, 'periodo_de', o.periodo_de, 'periodo_ate', o.periodo_ate) into v_anterior
    from public.relatorios_gerados o
   where o.empresa_id = v_empresa and coalesce(o.filial_id, -1) = coalesce(v_g.filial_id, -1)
     and o.periodo_de < v_g.periodo_de
   order by o.periodo_de desc, o.versao desc limit 1;
  select jsonb_build_object('id', o.id, 'periodo_de', o.periodo_de, 'periodo_ate', o.periodo_ate) into v_proximo
    from public.relatorios_gerados o
   where o.empresa_id = v_empresa and coalesce(o.filial_id, -1) = coalesce(v_g.filial_id, -1)
     and o.periodo_de > v_g.periodo_de
   order by o.periodo_de asc, o.versao desc limit 1;
  select coalesce(jsonb_agg(public.relatorio_publico_projetar(jsonb_build_object('slug', t.slug, 'rotulo', t.rotulo),
           k_lista -> 'tipo') order by t.slug), '[]'::jsonb)
    into v_tipos
    from public.tipos_item t
   where t.empresa_id = v_empresa;
  return jsonb_build_object('ok', true,
    'gerado', public.relatorio_publico_projetar(jsonb_build_object(
      'id', v_g.id, 'periodo_de', v_g.periodo_de, 'periodo_ate', v_g.periodo_ate, 'versao', v_g.versao,
      'gerado_em', v_g.gerado_em, 'filialNome', v_g.filial_nome, 'filialSlug', v_g.filial_slug,
      'versaoMaisNova', v_mais_nova, 'anterior', v_anterior, 'proximo', v_proximo, 'dados', v_g.dados),
      k_lista -> 'gerado'),
    'tipos', v_tipos);
end $$;

comment on function public.relatorio_publico_projetar(jsonb, jsonb) is
  'F68 (0212): a LISTA BRANCA aplicada — um objeto só leva as chaves da lista, um array projeta cada elemento, uma folha só deixa passar escalar. Tudo o que relatorio_publico_dados devolve de tabela passa por ela. Sem EXECUTE para ninguém: só o dono (as portas, security definer) a chama.';
comment on function public.relatorio_publico_abrir(text, text, text) is
  'F68 (0212): UMA DAS DUAS ÚNICAS FUNÇÕES DE public EXECUTÁVEIS POR anon (k_secdef_anon). A entrada da porta pública: confere a senha DENTRO do banco (bcrypt) contra as ativas bcrypt da empresa do slug; as cinco recusas devolvem {"ok": false} com o mesmo trabalho (sempre 5 crypt); o contador (teto por empresa, depois por empresa e origem) roda antes de qualquer senha; no acerto, abre a sessão (token opaco, só o sha-256 no banco, 24 h). Por que anon e não RLS: quem entra por senha não tem identidade no banco — a porta é a função, pequena e auditável por inteiro (ADR-002 §20).';
comment on function public.relatorio_publico_dados(text, text, text, jsonb) is
  'F68 (0212): UMA DAS DUAS ÚNICAS FUNÇÕES DE public EXECUTÁVEIS POR anon (k_secdef_anon). Serve o que a SESSÃO da porta pode ver — lista fechada de pedidos (porta, sessao, gerados, gerado, encerrar); a empresa sai da sessão, por dentro; o slug da rota tem de ser o dela (a diagonal recusa); tudo por lista branca (relatorio_publico_projetar), sem nome de pessoa. Só encerrar escreve.';

revoke all on function public.relatorio_publico_projetar(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.relatorio_publico_abrir(text, text, text) from public, authenticated, service_role;
revoke all on function public.relatorio_publico_dados(text, text, text, jsonb) from public, authenticated, service_role;
grant execute on function public.relatorio_publico_abrir(text, text, text) to anon;
grant execute on function public.relatorio_publico_dados(text, text, text, jsonb) to anon;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   as executáveis por anon em public são EXATAMENTE relatorio_publico_abrir e relatorio_publico_dados; nenhuma das duas
--   executável por PUBLIC, authenticated ou service_role; a projeção sem EXECUTE para ninguém; os md5 do prosrc iguais
--   aos do CI. O advisor passa a mostrar os dois WARN anon_security_definer_function_executable (declarados).
--
-- ROLLBACK (supabase/rollback/F68-desfaz.sql, o bloco 0212 — o PRIMEIRO na ordem inversa 0212 → 0208, e só DEPOIS do
-- revert do PR de código e do deploy): derrubar as três funções. Trava de EMERGÊNCIA sem rollback (RUNBOOK, Anexo F68):
-- revogar o EXECUTE de anon nas duas portas fecha a porta na hora, sem tocar o resto.

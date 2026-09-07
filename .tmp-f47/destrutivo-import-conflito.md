## resumo

Os três roteiros seguem o mesmo esqueleto: `begin;` → (grants de tabela para reproduzir o Supabase hospedado no CI sem Docker) → `do $$ ... $$;` com fixtures 100% fictícias criadas como dono (`postgres`, que ignora RLS) → blocos que alternam `set local role authenticated` + `set_config('request.jwt.claims', {sub: <uuid>}, true)` para simular cada cargo, sempre fechados por `reset role` → uma tabela temp de resumo → `raise notice 'FIM <nome>: N asserções, M falhas'` → `rollback;` (nada é commitado). O runner `scripts/db/rodar-roteiros.sh` carrega `_asserts.sql` antes de cada arquivo na MESMA sessão psql e conta `NOTICE|WARNING: ✗` como falha.

dev_destrutivo.sql (1719 linhas, F23): 4 identidades fixas (`k_dev/k_admin/k_operador/k_consulta`, uuids com prefixo `f23a`), 2 filiais mínimas (`v_f1`/`v_f2`) e um acervo fictício plantado do zero (ele é o ÚNICO lugar do repo que exercita as 7 RPCs destrutivas: `apagar_ativo`, `apagar_movimentacao`, `apagar_item`, `resetar_acervo`, `resetar_itens`, `forcar_estado_ativo`, `forcar_saldo_item`, mais `resetar_dados_ficticios` e a guarda `exigir_dev_para_destruir`/trigger `guarda_acervo`). Tem ORDEM SEMÂNTICA: §7 (reset global) esvazia o banco, então tudo que precisa de acervo vem antes; §9/10 (forçar) rodam antes dos resets. A §2 mede DUAS coisas diferentes com o mesmo rótulo visual: 2a-2h como `authenticated` (RLS já barra UPDATE/DELETE nessas tabelas antes de o trigger ser sequer chamado — só 2f exercita o trigger de verdade, porque INSERT tem policy) e 2i-2p como o DONO pós `reset role` (aqui o trigger é a ÚNICA barreira). §12 testa confirmação/justificativa nas 5 RPCs de perda; §13 prova que a janela GUC `estoque.dev_destrutivo` fecha mesmo quando `forcar_saldo_item` estoura no meio (via `valida_lancamento_item`).

import_substituir.sql (226 linhas, F19): roteiro pequeno e independente, cobre só `importar_ativos_substituir` — happy path (1a-1e, com 1e usado DUAS VEZES para a mesma regra R-IMP-13), duas recusas negativas isoladas (cenário "2" = contagens nulas, cenário "3" = backup vazio) e "substituir tudo apaga só a filial-alvo" (4a-4c). Promove o primeiro perfil ativo a admin porque a RPC exige `e_admin()` por dentro.

conflito_filiais.sql (642 linhas, F24): 4 grupos de conflito plantados (com/sem patrimônio, um trio se houver 3ª filial, o par do termo de lote, o par da transferência) e testa `apagar_ativos_conflito_filiais` (0093→0098→0100) mais a garantia de que a F23 (guarda_acervo, apagar_ativo do dev) continua intacta — mas por CONTRATO (comentário do cabeçalho, linhas 16-24) este arquivo NUNCA escreve DELETE/UPDATE direto nas tabelas do acervo; quem prova a guarda comportamentalmente é dev_destrutivo.sql §2, aqui só se confere que o TRIGGER continua instalado (§6a, via pg_trigger — estrutural, não comportamental).

## armadilhas

1) NORMALIZAÇÃO DE ESPAÇO — confirmado por grep exaustivo: as 74 linhas de `raise notice/warning` em conflito_filiais.sql usam SEMPRE DOIS espaços entre o rótulo e o texto ("✗ 1a  esperava…", "✓ 6d  o admin…"), enquanto dev_destrutivo.sql e import_substituir.sql usam SEMPRE UM. O injetor deve extrair o rótulo com um regex que aceita `\s+` (uma ou mais espaços) entre `✗`/`✓` e o texto, e NUNCA comparar por igualdade de string bruta contra "✗ <rótulo> " com contagem fixa de espaços.

2) PREFIXO/SUBSTRING em dev_destrutivo.sql — 20 rótulos distintos começam pelo caractere "1": o rótulo NU "1" (usado por 21 sub-cenários dinâmicos, 3 cargos × 7 RPCs, linhas 321-342, todos plantados com o MESMO texto-molde `'✗ 1 % EXECUTOU %()'`/`'✗ 1 % recusado…'`), mais 1x, 1y, 1z, 1z-bis, 1c, 1c-bis, 10a, 10b, 11a, 12a-12e (5) e 13a-13c (3). Um matcher que faça `outputToken.startsWith(esperado)` ou substring/LIKE sem âncora vai casar "1" contra QUALQUER um dos outros 19. Além disso "1c" é prefixo literal de "1c-bis" e "1z" de "1z-bis". Fora da família "1": "4e" é prefixo de "4e-bis" E "4e-ter"; "4f" de "4f-bis"; "4g" de "4g-bis". REGRA PARA O INJETOR: nunca usar `startsWith`/`includes`; extrair o rótulo por regex ancorada logo após `✗`/`✓` até o próximo espaço/fim-de-run-de-espaços, e comparar por IGUALDADE EXATA de string.

3) A LINHA "✗ TOTAL dev_destrutivo: % falha(s) — %" (linha 1712) agrega TODOS os códigos internos de falha (`v_msgs`, ex.: "12a_CONFIRMACAO; 12b_JUSTIFICATIVA; 12c_CONFIRMACAO_ITEM; 12d_CONFIRMACAO_RESET; 12e_JUSTIFICATIVA_FORCAR; …") numa ÚNICA linha WARNING quando há qualquer falha. Repare que "12c_CONFIRMACAO_ITEM" CONTÉM a substring "2c" e "12d_CONFIRMACAO_RESET" contém "2d" — um matcher que faça busca de substring no BLOB INTEIRO da saída (em vez de por linha, ancorado em `✗ <rótulo> `) atribuiria falsamente uma falha em "12c"/"12d" também a "2c"/"2d". Trate a linha "TOTAL" como agregado, não como um rótulo de cenário, e ignore-a na atribuição rótulo→cenário.

4) RÓTULO REPETIDO, SEM SER PREFIXO: em import_substituir.sql o rótulo "1e" aparece DUAS VEZES (linhas 138 e 145) para a MESMA regra (R-IMP-13), uma vez como contagem agregada, outra como exemplo único — uma mutação pode derrubar só uma das duas ocorrências. Em dev_destrutivo.sql a família de rótulo "1" cobre 21 combinações distintas (cargo×RPC) com o MESMO token "1"; para atribuir uma mutação a uma combinação específica dentro desse laço, o injetor precisa casar o TEXTO INTERPOLADO (nome do cargo/RPC), não só o rótulo "1".

5) CONJUNTO VAZIO / CONDIÇÃO SILENCIOSA em conflito_filiais.sql: os cenários 2e (linha 279), 3a/3b (linha 441) e 7b/9a (linhas 540/559) só rodam `if v_f3 is not null`/`if v_mov_transf is not null` — isto é, só se o banco tiver uma TERCEIRA filial ativa (2e) e se ela existir (3a/3b dependem de v_c3, criado dentro do bloco de 2e). Num banco seedado com só 2 filiais ativas, essas 5 asserções NUNCA EMITEM NADA (nem ✓ nem ✗) — a contagem "N asserções" no FIM cai silenciosamente, sem qualquer WARNING. Uma mutação que só afete lógica exercitada dentro desses blocos passaria despercebida nesse ambiente. O injetor deve confirmar que a base de CI tem ≥3 filiais ativas antes de confiar em qualquer mutação mapeada para 2e/3a/3b/7b/9a.

6) DEPENDÊNCIA DE SESSÃO/ORDEM em dev_destrutivo.sql: a guarda `guarda_acervo` só é de fato exercitada pelo DONO (pós `reset role` da linha 563, cenários 2i-2n, e de novo em 13c depois que a janela GUC fecha) — os cenários 2a-2e como `authenticated` são dominados pela AUSÊNCIA de policy de UPDATE/DELETE (a guarda nem é consultada). Mutar o corpo do trigger e esperar 2a-2e ficarem vermelhos é engano.

7) NÃO-DETERMINISMO DE MENSAGEM (não de rótulo): os ativos/movimentações da fixture usam `gen_random_uuid()` implícito (via `returning id into`), exceto os quatro cargos (uuids fixos com prefixo `f23a`/`f24a`). Ao remover a checagem de empate de `created_at` (0087/0090) em `apagar_movimentacao`, os DOIS rótulos 4g/4g-bis ficam vermelhos de forma DETERMINÍSTICA, mas QUAL deles mostra "...PASSOU" (aceito) e qual mostra "...MOTIVO_ERRADO" (recusado por outro motivo, já que a fixture original tem um par empatado com uuids aleatórios) varia a cada rodada — nunca comparar o TEXTO da mensagem para este par, só o rótulo + símbolo.

8) MUTAÇÕES DE ALTO RAIO DE EXPLOSÃO ("cascata"): remover a checagem de confirmação de `resetar_dados_ficticios` (exercitada por "1z-bis", linha ~416) faz a chamada REALMENTE ZERAR O ACERVO no meio do roteiro (antes de boa parte das fixtures da §2 em diante existirem) — dezenas de rótulos posteriores ficariam vermelhos como efeito colateral, não só "1z-bis". O mesmo vale para remover a checagem de EXISTÊNCIA do backup em `resetar_acervo` (usada por "8a", linha ~1436): sem ela a chamada de fato reseta a filial 2 de verdade (contagens batem, termo não é misto), corrompendo as fixtures de que 8a-bis/8b/8c/8d dependem. Use essas duas isoladas, nunca combinadas com outras mutações na mesma rodada.

9) MUTAÇÕES ESTRUTURALMENTE INVISÍVEIS AO ROTEIRO ATUAL (achado principal para conflito_filiais.sql): `pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'))` (0100) e a segunda passada de `for update` que trava "o resto do grupo" (0098/0100, o gêmeo fora da seleção) só têm efeito quando DUAS sessões concorrem — dentro de UMA transação psql sem escritor concorrente, removê-los não muda NENHUM resultado observável, porque nenhuma asserção do arquivo abre uma segunda conexão. Do mesmo jeito, o ramo de backup em ARQUIVO com digest (`digest_selecao_conflito`, 0100, dentro de `if not v_inline`) nunca roda: a maior seleção testada no arquivo tem 2 ativos, muito abaixo do teto `c_cap_inline = 25`. As três são mutações REAIS (imitam regressões documentadas nos cabeçalhos das próprias migrations) mas SOBREVIVEM ao roteiro hoje — reporte como lacuna de cobertura, não como "mutação pega".

## mutacoes

[
 {
  "id": "exigir-dev-justificativa-curta",
  "roteiro": "dev_destrutivo.sql",
  "derruba": [
   "12b",
   "12e"
  ],
  "porque": "remove a régua de 10+ caracteres de justificativa compartilhada por todas as RPCs destrutivas do dev — a classe de defeito é 'qualquer um apaga sem explicar por quê'.",
  "sql": "create or replace function public.exigir_dev_para_destruir(p_justificativa text)\nreturns void language plpgsql stable security definer set search_path = public as $$\nbegin\n  if (select auth.uid()) is null then\n    raise exception 'Operador não autenticado.' using errcode = '42501';\n  end if;\n  if not public.e_dev() then\n    raise exception 'Esta operação é restrita ao cargo Desenvolvedor.' using errcode = '42501';\n  end if;\n  -- MUTAÇÃO: bloco 'if coalesce(length(btrim(p_justificativa)),0) < 10 then raise ... 22023' removido\nend;\n$$;",
  "risco": "a checagem é COMPARTILHADA por apagar_ativo/apagar_movimentacao/apagar_item/resetar_acervo/resetar_itens/forcar_estado_ativo/forcar_saldo_item — mas só 12b (apagar_ativo) e 12e (forcar_estado_ativo) passam justificativa curta com confirmação CORRETA isolando esta guarda; 12a/12c/12d usam justificativa longa fixa e testam CONFIRMAÇÃO, não isto.",
  "prova": "select pg_get_functiondef('public.exigir_dev_para_destruir(text)'::regprocedure) like '%< 10%'; -- esperado false após a mutação"
 },
 {
  "id": "apagar-ativo-confirmacao-solta",
  "roteiro": "dev_destrutivo.sql",
  "derruba": [
   "12a"
  ],
  "porque": "remove a exigência de digitar exatamente o patrimônio/service tag/id antes de apagar um ativo inteiro — a classe 'clique único sem confirmação lida' numa operação irreversível.",
  "sql": "Em apagar_ativo(uuid,text,text) (migration 0082), remover o bloco:\n  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then\n    raise exception 'A confirmação não confere: digite exatamente \"%\" para apagar este ativo.', v_esperado using errcode = '22023';\n  end if;\nSubstituir por um no-op (comentário).",
  "risco": "isolado: apagar_movimentacao e apagar_item têm blocos de confirmação PRÓPRIOS (não compartilhados) — só 12a cai; 3a (apagar_ativo com confirmação certa) continua passando pois a mutação só afrouxa a recusa da errada.",
  "prova": ""
 },
 {
  "id": "apagar-item-confirmacao-solta",
  "roteiro": "dev_destrutivo.sql",
  "derruba": [
   "12c"
  ],
  "porque": "remove a exigência de digitar o NOME exato do item antes de apagá-lo com todos os lançamentos — mesma classe da mutação anterior, em outra RPC.",
  "sql": "Em apagar_item(smallint,text,text) (migration 0082), remover o bloco:\n  if lower(btrim(coalesce(p_confirmacao, ''))) <> lower(btrim(v_i.nome)) then\n    raise exception 'A confirmação não confere: digite exatamente \"%\" para apagar este item.', v_i.nome using errcode = '22023';\n  end if;",
  "risco": "isolado — 5a/5b (apagar_item happy path) usam o nome certo e continuam passando.",
  "prova": ""
 },
 {
  "id": "guarda-acervo-update-dono",
  "roteiro": "dev_destrutivo.sql",
  "derruba": [
   "2i",
   "2k"
  ],
  "porque": "afrouxa o ramo UPDATE do trigger guarda_acervo (0081) — a classe 'o service role/dono edita histórico direto', que é exatamente o que a 0081 foi criada para fechar.",
  "sql": "create or replace function public.guarda_acervo()\nreturns trigger language plpgsql security definer set search_path = public as $$\ndeclare\n  v_janela boolean := coalesce(current_setting('estoque.dev_destrutivo', true), '') = 'on';\nbegin\n  if v_janela then\n    if tg_op = 'DELETE' then return old; else return new; end if;\n  end if;\n  if tg_op = 'INSERT' then\n    if coalesce((to_jsonb(new) ->> 'forcado')::boolean, false) then\n      raise exception 'A marca de \"forçado\" é exclusiva das ferramentas do desenvolvedor e não pode ser gravada por este caminho.' using errcode = '42501';\n    end if;\n    return new;\n  end if;\n  if tg_op = 'UPDATE' then\n    return new; -- MUTAÇÃO: recusa de UPDATE removida\n  end if;\n  raise exception 'Registro histórico não se remove por este caminho (%). As ferramentas de exclusão da área do desenvolvedor são o único caminho, e elas exigem confirmação, justificativa e deixam trilha.', tg_table_name using errcode = '42501';\nend;\n$$;",
  "risco": "NÃO derruba 2a/2c: essas rodam como `authenticated` e já são barradas pela AUSÊNCIA de policy de UPDATE antes de o trigger ser consultado (ver comentário do arquivo, linhas 433-437). Só o caminho do DONO (postgres, pós `reset role` da linha 563) exercita este ramo.",
  "prova": "select pg_get_functiondef('public.guarda_acervo()'::regprocedure) like '%é imutável%'; -- esperado false"
 },
 {
  "id": "guarda-acervo-delete-dono",
  "roteiro": "dev_destrutivo.sql",
  "derruba": [
   "2j",
   "2l",
   "2m",
   "13c"
  ],
  "porque": "afrouxa o ramo DELETE do trigger — o cenário mais crítico do desenho (0081 §Problema): sem ele o service role apaga movimentação/lançamento/ativo por fora de qualquer RPC.",
  "sql": "Na mesma função de guarda-acervo-update-dono, trocar o `raise exception 'Registro histórico não se remove por este caminho...'` final (o ramo DELETE) por `if tg_op = 'DELETE' then return old; end if;`.",
  "risco": "derruba QUATRO rótulos de uma vez: 2j/2l/2m no bloco do DONO e 13c mais adiante, que reusa a MESMA guarda num DELETE direto em movimentacoes depois que a janela GUC fechou. 2b/2d/2e ficam intocados (RLS já bloqueia o `authenticated` antes do trigger).",
  "prova": ""
 },
 {
  "id": "guarda-acervo-forcado-insert",
  "roteiro": "dev_destrutivo.sql",
  "derruba": [
   "2f",
   "2n"
  ],
  "porque": "deixa de recusar INSERT com `forcado = true` vindo de fora das RPCs oficiais — a classe 'request forjado se autorrotula como correção técnica do dev', o único ramo onde INSERT tem policy de RLS e por isso é a guarda quem barra sozinha.",
  "sql": "Na mesma função, trocar o `if coalesce((to_jsonb(new) ->> 'forcado')::boolean, false) then raise exception ... end if;` do ramo INSERT por `if false then ... end if;` (nunca recusa).",
  "risco": "os DOIS testes (2f como authenticated, 2n como dono) exercitam este ramo porque INSERT tem policy de RLS nos dois papéis — ao contrário de UPDATE/DELETE, aqui a guarda é a ÚNICA barreira nos dois lados.",
  "prova": "select pg_get_functiondef('public.guarda_acervo()'::regprocedure) like '%forçado%'; -- esperado false"
 },
 {
  "id": "apagar-movimentacao-empate-removido",
  "roteiro": "dev_destrutivo.sql",
  "derruba": [
   "4g",
   "4g-bis"
  ],
  "porque": "reverte o achado da 0087: sem a checagem, 'qual é a última' entre duas movimentações com `created_at` idêntico (o par compra+ajuste do import de startup, 1111 dos 1232 ativos reais) volta a depender de sorteio de uuid.",
  "sql": "Em apagar_movimentacao(uuid,text,text) (corpo vigente na 0090), remover o bloco:\n  if exists (\n    select 1 from public.movimentacoes m\n     where m.ativo_id = v_m.ativo_id and m.id <> v_m.id and m.created_at = v_m.created_at\n  ) then\n    raise exception 'Este ativo tem movimentações gravadas no mesmo instante...' using errcode = '42501';\n  end if;",
  "risco": "NÃO-DETERMINÍSTICO NA MENSAGEM, DETERMINÍSTICO NO RÓTULO: como os dois ids da fixture nascem de `gen_random_uuid()`, exatamente UMA das duas chamadas (4g apaga o ajuste, 4g-bis apaga a compra) vai ser ACEITA de verdade (a de maior uuid) e a outra recusada por 'não é a última'/'é a única' em vez de 'mesmo instante' — os DOIS rótulos ficam vermelhos sempre, mas qual mostra '_PASSOU' vs '_MOTIVO_ERRADO' varia a cada execução. Comparar só rótulo+símbolo, nunca o texto da mensagem, para este par.",
  "prova": "select pg_get_functiondef('public.apagar_movimentacao(uuid,text,text)'::regprocedure) like '%m.created_at = v_m.created_at%'; -- esperado false"
 },
 {
  "id": "apagar-movimentacao-estorno-removido",
  "roteiro": "dev_destrutivo.sql",
  "derruba": [
   "4e-bis",
   "4e-ter"
  ],
  "porque": "reverte o achado da 0090: apagar um ESTORNO volta a deixar pendências de item perdidas em silêncio (o estorno-strip da F18 já as removeu, e não são reconstruíveis).",
  "sql": "No mesmo corpo, remover o bloco:\n  if v_m.tipo = 'estorno' then\n    raise exception 'Esta é uma movimentação de ESTORNO...' using errcode = '42501';\n  end if;",
  "risco": "derruba 4e-bis (a exclusão do estorno deixa de ser recusada) E, por tabela, 4e-ter (o par positivo 'nada mudou na recusa' passa a comparar um antes/depois que de fato mudou, porque desta vez a exclusão aconteceu de verdade). NÃO afeta 4e, que é pego pela checagem de 'é a última' (mov_i2 continua tendo o estorno depois dela), intocada por esta mutação.",
  "prova": "select pg_get_functiondef('public.apagar_movimentacao(uuid,text,text)'::regprocedure) like '%tipo = ''estorno''%'; -- esperado false"
 },
 {
  "id": "import-contagens-nulas-aceitas",
  "roteiro": "import_substituir.sql",
  "derruba": [
   "2"
  ],
  "porque": "reverte o fechamento do TOCTOU de R-IMP-21/0040: uma chamada forjada com p_contagens=null volta a pular por inteiro a revalidação do estado vivo antes de apagar o acervo da filial.",
  "sql": "Em importar_ativos_substituir(jsonb,text,jsonb,jsonb) (migration 0080), remover SÓ o bloco:\n  if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then\n    raise exception 'Revalidação de contagens obrigatória...';\n  end if;\nsem tocar no `if p_contagens is not null and jsonb_typeof(p_contagens) = 'object' then ... end if;` logo depois.",
  "risco": "diferente de resetar_acervo (onde a checagem de null é redundante com a comparação, que trata NULL como -1 e falha por 40001), aqui a checagem de comparação só roda quando p_contagens NÃO é nulo — removê-la faz uma chamada com null pular a revalidação POR INTEIRO e o import se repete de verdade sobre a filial A (apaga e recria os 2 ativos do cenário 1, com as MESMAS contagens finais). O cenário 2 fica vermelho ('não falhou') sem quebrar 4c (a contagem final da filial A não muda).",
  "prova": "select pg_get_functiondef('public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)'::regprocedure) like '%Revalidação de contagens obrigatória%'; -- esperado false"
 },
 {
  "id": "import-backup-vazio-aceito",
  "roteiro": "import_substituir.sql",
  "derruba": [
   "3"
  ],
  "porque": "reverte R-IMP-19: um import destrutivo (que apaga o acervo da filial antes de recriar) volta a rodar sem exigir que um backup tenha sido gerado.",
  "sql": "Em importar_ativos_substituir (0080), remover o bloco:\n  if coalesce(btrim(p_backup_path), '') = '' then\n    raise exception 'Import destrutivo exige backup_path...';\n  end if;",
  "risco": "isolado no rótulo, mas mesmo efeito colateral do anterior: a chamada do cenário 3 passa a re-executar o import de verdade sobre a filial A (contagens desta vez batem exatamente, 2 ativos/2 movs) — não quebra 4c, mas o roteiro fica menos 'limpo' para depuração manual porque a filial A é reimportada duas vezes ao todo.",
  "prova": ""
 },
 {
  "id": "conflito-justificativa-curta",
  "roteiro": "conflito_filiais.sql",
  "derruba": [
   "5f"
  ],
  "porque": "remove a régua de 10+ caracteres de justificativa DENTRO de apagar_ativos_conflito_filiais — repetida ali de propósito (comentário da 0093: 'não reusada, porque exigir_dev_para_destruir exige cargo dev') e não a mesma chamada de exigir_dev_para_destruir usada pela família F23.",
  "sql": "Em apagar_ativos_conflito_filiais(uuid[],text,text,text) (corpo vigente na 0100), remover o bloco:\n  if coalesce(length(btrim(p_justificativa)), 0) < 10 then\n    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.' using errcode = '22023';\n  end if;",
  "risco": "isolado da família F23 em dev_destrutivo.sql — é uma cópia própria da régua, não uma chamada a exigir_dev_para_destruir; mutar uma não afeta a outra (útil para o injetor provar que as DUAS cópias estão vivas independentemente, e não é uma delas morta e a outra só decorativa).",
  "prova": ""
 },
 {
  "id": "conflito-confirmacao-solta",
  "roteiro": "conflito_filiais.sql",
  "derruba": [
   "4e",
   "5d",
   "5e"
  ],
  "porque": "deixa de exigir 'APAGAR <N>' com o N exato — a régua desenhada para forçar o admin a ler e contar quantos ativos está prestes a apagar antes de confirmar (e a barrar id repetido inflando a contagem).",
  "sql": "Em apagar_ativos_conflito_filiais (0100), neutralizar o bloco:\n  v_esperado := 'APAGAR ' || v_n::text;\n  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then\n    raise exception 'A confirmação não confere...' using errcode = '22023';\n  end if;\n(trocar a condição por `if false then`).",
  "risco": "derruba TRÊS rótulos de uma vez: 5d/5e diretamente (confirmação incompleta/errada aceita), e 4e por tabela — 'APAGAR 3' com [v_a2,v_a2,v_a2] deduplicado para 1 ativo deixa de ser recusado por mismatch de contagem. Não confundir com a mutação isolada 'conflito-dedupe-removida' abaixo, que ataca só a deduplicação e deixa esta checagem intacta.",
  "prova": ""
 },
 {
  "id": "conflito-dedupe-removida",
  "roteiro": "conflito_filiais.sql",
  "derruba": [
   "4e"
  ],
  "porque": "remove o `distinct` da normalização de p_ativos — permite que um id repetido no array infle a contagem confirmada (apagar 1 ativo achando, pela trilha, que apagou 3).",
  "sql": "Em apagar_ativos_conflito_filiais (0100), trocar:\n  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids from unnest(...) x where x is not null;\npor array_agg(x) SEM distinct.",
  "risco": "isolado da mutação de confirmação: aqui a checagem de string permanece intacta, mas v_n passa a ser 3 (não deduplicado) para [v_a2,v_a2,v_a2], então 'APAGAR 3' passa a CONFERIR e a chamada é aceita — apaga v_a2 uma única vez de verdade (SQL não deleta 2x o mesmo id), mas grava 'ativos: 3' na trilha: incoerência silenciosa de auditoria, não só um teste vermelho.",
  "prova": "select pg_get_functiondef('public.apagar_ativos_conflito_filiais(uuid[],text,text,text)'::regprocedure) like '%array_agg(distinct x)%'; -- esperado false"
 },
 {
  "id": "conflito-lock-e-backup-digest-gap",
  "roteiro": "conflito_filiais.sql",
  "derruba": [],
  "porque": "reverte três hardenings da 0098/0100 numa família só — pg_advisory_xact_lock (fecha o deadlock 40P01 do lock em dois tempos), a segunda passada de FOR UPDATE que trava o gêmeo fora da seleção, e a amarra do backup em arquivo ao digest do lote (digest_selecao_conflito) — todas defesas contra CONCORRÊNCIA ou contra um LOTE GRANDE, nenhuma das duas coisas presente no roteiro.",
  "sql": "Em apagar_ativos_conflito_filiais (0100): (a) remover `perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'));`; (b) remover o segundo `perform 1 from public.ativos a where chave_identidade_ativo(...) = any(v_chaves) and not (a.id = any(v_ids)) order by a.id for update;` (a trava do resto do grupo); (c) dentro de `if not v_inline then`, remover a checagem `if btrim(p_backup_path) not like prefixo_backup_conflito() || v_digest || '/%' then raise ...`, mantendo só a existência do objeto no bucket.",
  "risco": "NENHUM rótulo do roteiro fica vermelho com nenhuma das três: (a)/(b) só têm efeito observável com DUAS sessões concorrendo — o cenário exato que os cabeçalhos da 0098/0100 descrevem (t0..t3) — e o arquivo roda numa única transação psql, sem escritor concorrente; (c) nunca é exercitado porque `v_inline := (v_n <= 25)` é sempre verdadeiro aqui (a maior seleção do arquivo tem 2 ativos, em §3e). São mutações REAIS, mas SOBREVIVEM ao roteiro hoje — reporte como lacuna de cobertura (precisaria de um harness com duas conexões psql para (a)/(b), e de uma fixture com >25 ativos em conflito para (c)), não como 'mutação pega'.",
  "prova": "select d like '%pg_advisory_xact_lock%' as tem_lock, d like '%digest_selecao_conflito%' as tem_digest, (length(d)-length(replace(d,'for update','')))/length('for update') as locks from (select pg_get_functiondef('public.apagar_ativos_conflito_filiais(uuid[],text,text,text)'::regprocedure) as d) x; -- só prova ESTRUTURA (esperado false/false/1 após a mutação), nunca comportamento"
 }
]
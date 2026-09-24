-- =============================================================
-- Roteiro de teste: A SUPERFÍCIE DECLARATIVA DE LEITURA (F48, 07/09/2026)
-- =============================================================
-- POR QUE AS TRÊS SUPERFÍCIES MORAM JUNTAS
--
-- Um dado sai deste sistema por quatro portas. Três delas são DECLARATIVAS — não se
-- lê o comportamento, lê-se o catálogo do Postgres e pronto:
--
--   · as policies de `public`          (`pg_policies`)
--   · as policies de `storage.objects` (`pg_policies`, outro schema)
--   · a publication do Realtime        (`pg_publication_tables`)
--
-- A quarta — as funções `security definer` — é DECLARATIVA também, mas o vocabulário
-- dela é outro (`pg_proc`, ACLs, `proconfig`) e o cabeçalho que ela precisa é longo;
-- por isso mora em `catalogo_secdef.sql`. Separar as TRÊS acima em três arquivos
-- multiplicaria este cabeçalho por três sem multiplicar cobertura nenhuma: elas leem
-- a MESMA visão de catálogo, com o mesmo método e o mesmo risco.
--
-- Até esta fase, NENHUMA das três era enumerada. Uma policy nova podia nascer
-- `using (true)`, uma policy de Storage podia decidir só por `bucket_id`, uma tabela
-- podia entrar na publication do Realtime — e nada no repositório se mexia. Na virada
-- multiempresa cada uma dessas três vira caminho de vazamento entre inquilinos, e o
-- momento de enumerá-las é ANTES de existir o segundo.
--
-- ESTA FASE SÓ ENUMERA. Nenhuma policy foi corrigida aqui; desvio encontrado vira
-- ACHADO no relatório, com severidade, e a decisão de corrigir é de fase própria.
--
-- SÓ LEITURA de catálogo — não grava nada, por isso dispensa `begin/rollback`, igual
-- a `seguranca_catalogo.sql`. Mesmo padrão de saída:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o runner falha em qualquer `WARNING: ✗`)
--
-- RELAÇÃO COM `seguranca_catalogo.sql` — NÃO DUPLICAR (F48, Decisão 2)
-- As varreduras schema-wide de RLS ligada (asserção 2 de lá) e de `security_invoker`
-- nas views (asserção 3) continuam MORANDO LÁ, e este arquivo não as repete. Três
-- mutações ativas do injetor miram aqueles dois rótulos, o motivo escrito da remoção
-- da isenção por prefixo (F47) vive no cabeçalho daquela asserção, e o
-- `RELATORIO-F47.md` §6.6 a cita nominalmente. Duas fontes para o mesmo fato é como
-- um gate morre: a que envelhecer primeiro vira a mentira.
--
-- F59 (16/09/2026) — O BLOCO 4: A DOUTRINA DO PREDICADO
-- Este arquivo deixa de só enumerar e passa a julgar a FORMA do predicado de toda
-- policy de `public` e `storage.objects` (emenda F59 da MATRIZ-REGRAS, R-ACC-63 em
-- diante): a função que recebe dado da linha, a função solta fora de `(select …)`, o
-- sub-select que lê tabela ou olha a linha, e o `array (select …)` sobre função que não
-- devolve conjunto. As exceções moram AQUI (`k_excecoes_predicado`), e a trava de mesa
-- `src/lib/validators/policies-initplan.test.ts` as lê deste texto — uma fonte só.
-- ⚠ Continua SÓ LEITURA: o laço da árvore não cria função nem `pg_temp` novo.
-- =============================================================

do $$
declare
  v_ok     int := 0;   -- F45: quantas asserções passaram
  v_falhas int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;

  -- =======================================================================
  -- A TABELA-VERDADE: NEGÓCIO × INFRA (F48, Decisão 1)
  --
  -- O CRITÉRIO, escrito antes da lista:
  --   NEGÓCIO — o conteúdo pertence ao ACERVO ou à OPERAÇÃO de UMA empresa e, na
  --             virada multiempresa, vai precisar da chave de recorte.
  --   INFRA   — o conteúdo é do MECANISMO do sistema (identidade da conta, marcador
  --             de ambiente, backup congelado de uma fase) e não se recorta por
  --             empresa, ou se recortará por outro caminho (`membros`), em fase própria.
  --
  -- ⚠ A classificação é uma TABELA-VERDADE, não um filtro esperto. Tabela nova não
  -- classificada REPROVA (asserção 1a) — é isso que faz este arquivo ser um CATÁLOGO
  -- derivado, e não uma lista que envelhece. E a asserção 3 garante que "infra" NÃO
  -- vira isenção: infra sem policy de SELECT também tem de estar declarada nominalmente.
  -- =======================================================================
  --
  -- ⚠ POR QUE ESTE CRITÉRIO, E NÃO "APARECE NUMA TELA DE OPERAÇÃO". O critério da tela
  -- é tentador e classifica `eventos_admin` e `import_logs` como infra — e o próprio
  -- plano diz, por escrito, que isso é o erro: ao descrever a varredura de recorte que
  -- a F63/F65 vai pôr em `isolamento_tenant.sql`, ele exige iterar "sobre o CATÁLOGO,
  -- nunca sobre lista de 20 nomes — `eventos_admin` é exatamente a tabela que uma lista
  -- à mão esqueceria" (PLANO-MULTIEMPRESA.md, §6 → F62). Uma trilha de auditoria das
  -- ações sobre o acervo da empresa A é dado da empresa A. NEGÓCIO.
  --
  -- F56 · Frente D acrescenta as QUATRO tabelas do vocabulário do import
  -- (`unidades_apelidos`, `import_termos_categoria`, `import_termos_estado`,
  -- `import_prefixos_patrimonio`): o critério é o mesmo — o De→Para de UMA empresa
  -- (os apelidos de UNIDADE em particular) é dado dessa empresa, e a F64 vai
  -- precisar da chave de recorte nelas como em qualquer outro catálogo administrado.
  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'
  ];

  -- F63 (23/09/2026) — O LOTE 1 DA CHAVE DE RECORTE: as oito tabelas do ACERVO que a F63 põe
  -- `empresa_id` (0160, 0161). É a FONTE ÚNICA da lista das oito (decisão 6 do PLAN-F63): o
  -- bloco 5 abaixo a confere contra `k_negocio` (15a) e contra o catálogo (15b), e a trava de mesa
  -- `src/lib/validators/empresa-acervo-sem-leitura.test.ts` a LÊ daqui — nunca uma cópia. As 11
  -- tabelas de `k_negocio` que ficam sem a coluna são a F64 (as sete da ficha e as quatro do
  -- vocabulário do import, fato 18); `filiais` já a tem desde a F62 (0155).
  k_lote1 text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'itens', 'lancamentos_item', 'movimentacoes',
    'pendencias_item', 'termos_gerados'
  ];

  -- F64 (23/09/2026) — O LOTE 2 DA CHAVE DE RECORTE: as ONZE tabelas de negócio que ainda não
  -- tinham `empresa_id` depois da F63, e que a F64 põe (0162 o vocabulário, 0163 os registros). É a
  -- FONTE ÚNICA da lista das onze (decisão 6 do PLAN-F64): o bloco 5 a confere contra `k_negocio`
  -- (15d) e contra o catálogo (15e), e a trava de mesa `empresa-acervo-sem-leitura.test.ts` a LÊ
  -- daqui (describe 13 de `catalogos-seguranca.test.ts` amarra). Com ela, `k_lote1 ∪ k_lote2 ∪
  -- {filiais}` é `k_negocio` inteiro — `filiais` a ganhou na F62 (0155). As que NÃO recebem a chave
  -- são as de `k_infra`, cada uma com o motivo escrito lá (`senha_tentativas` e `ambiente` entre elas).
  k_lote2 text[] := array[
    'eventos_admin', 'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'kits_modelos', 'motivos', 'relatorios_gerados', 'senhas_acesso',
    'tipos_item', 'unidades_apelidos'
  ];

  -- F64 (23/09/2026) — AS EXCEÇÕES NOMINAIS DE "NINGUÉM LÊ `empresa_id` ANTES DA F66" (decisão 7 do
  -- PLAN-F64). A ficha F64 manda conferir que o motivo do payload do kit existe NA EMPRESA DO KIT —
  -- e isso é LER `kits_modelos.empresa_id` e `motivos.empresa_id` antes da F66. É leitura de
  -- INTEGRIDADE, não recorte: nenhuma das duas decide o que alguém VÊ. As duas, e só elas:
  --   · kit_motivo_da_empresa        (0164) — a função do gatilho `kits_modelos_motivo_da_empresa`:
  --                                    recusa o kit cujo motivo não existe na empresa dele;
  --   · checagens_integridade_nucleo (0164) — a 13ª peça, `kit_motivo_orfao`: conta o kit que já
  --                                    está órfão. (O núcleo também lê `membros.empresa_id`
  --                                    desde a F62 — `membros` não é de negócio.)
  -- É a FONTE ÚNICA da lista: o 15h abaixo a usa, a trava de mesa `empresa-acervo-sem-leitura.test.ts`
  -- a lê daqui (e lá a exceção vale só nos comandos que tocam `kits_modelos`/`motivos`), e o
  -- describe 13 amarra a cópia da auto-sabotagem de `empresa_no_vocabulario.sql` a ela.
  k_leitura_integridade text[] := array['checagens_integridade_nucleo', 'kit_motivo_da_empresa'];
  -- E as tabelas cuja coluna as duas exceções podem ler — e SÓ elas, e só no COMANDO que as toca
  -- (revisão adversarial da F64: a exceção valia pela função inteira no catálogo). Fonte única: o
  -- 15h a usa pelo predicado `pg_temp.leitura_de_empresa_do_lote` (`_asserts.sql`), e a trava de
  -- mesa `empresa-acervo-sem-leitura.test.ts` a LÊ daqui.
  k_tabelas_leitura_kit text[] := array['kits_modelos', 'motivos'];

  -- F65 (23/09/2026) — AS LEITURAS DE `empresa_id` DA INTEGRIDADE DO TENANT (decisão 12 do PLAN-F65): três funções que a
  -- F65 cria ou recria leem a coluna — integridade e identidade, não recorte; nenhuma decide o que alguém VÊ. Cada uma
  -- pode ler SÓ das tabelas da entrada (`função:tabela,tabela`), POR COMANDO, com a origem provada (o predicado único
  -- `pg_temp.leitura_de_empresa_do_lote`, pelo despachante `pg_temp.leitura_de_empresa`, `_asserts.sql`):
  --   · guarda_empresa              (0173) — a função dos 20 gatilhos BEFORE UPDATE OF empresa_id: compara new × old da
  --                                   linha do gatilho, e só isso (não toca tabela — imutabilidade_tenant.sql, I2); as
  --                                   tabelas são as 20 de `k_negocio` (onde ela é gatilho);
  --   · termo_da_empresa            (0173) — o gatilho de `termos_gerados`: todo id dos arrays é de `movimentacoes`/`ativos`
  --                                   da empresa do termo;
  --   · vocabulario_unidades_guarda (0173, recriada) — a diagonal nome × apelido, procurada só na empresa da linha.
  -- É a FONTE ÚNICA: o 15h e o 15k usam, `empresa-acervo-sem-leitura.test.ts` LÊ daqui, e o describe 14 de
  -- `catalogos-seguranca.test.ts` amarra as cópias dos roteiros (`empresa_no_acervo.sql`, `empresa_no_vocabulario.sql`).
  k_leitura_tenant text[] := array[
    'guarda_empresa:anotacoes,ativos,colaboradores,eventos_admin,filiais,import_logs,import_prefixos_patrimonio,import_termos_categoria,import_termos_estado,itens,kits_modelos,lancamentos_item,motivos,movimentacoes,pendencias_item,relatorios_gerados,senhas_acesso,termos_gerados,tipos_item,unidades_apelidos',
    'termo_da_empresa:termos_gerados,movimentacoes,ativos',
    'vocabulario_unidades_guarda:filiais,unidades_apelidos'
  ];

  -- =======================================================================
  -- F66 (24/09/2026) — O RECORTE DE EMPRESA NAS POLICIES (bloco 6, asserções 16a–16g)
  --
  -- A TABELA-VERDADE classe → função (decisão 2 do PLAN-F66), a FONTE ÚNICA que a trava da forma lê. A classe de
  -- uma policy é a PRIMEIRA função desta lista (na ordem) que a árvore dela cita — o piso de hoje (`e_admin`,
  -- `pode_escrever_termo`, `pode_escrever`, `papel_atual`) ou a forma de pares (`unidades_de_escrita`) —, e a função
  -- de conjunto depois dos dois-pontos é a que o termo `empresa_id = any (array (select public.<fn>()))` TEM de usar,
  -- em USING e em WITH CHECK, na conjunção de cima:
  --   · e_admin             → empresas_de_admin   (a leitura de cargo — auditoria, trilha do import — e a escrita de
  --                                                admin; inclusive "admin reabre", que tem os pares também);
  --   · pode_escrever_termo → empresas_de_escrita (as três de escrita de termos_gerados);
  --   · pode_escrever       → empresas_de_escrita (a escrita no nível de empresa);
  --   · unidades_de_escrita → empresas_de_escrita (a escrita por unidade: os pares decidem a filial, o termo dá o índice);
  --   · papel_atual         → empresas_do_membro  (a leitura pelo piso — todo logado ativo lê a empresa de que é membro).
  -- A ordem é a precedência: uma policy que cita `e_admin` e os pares é de admin. Policy de tabela com a coluna que não
  -- cita nenhuma destas REPROVA ("sem classe") — é decisão, não omissão. ⚠ A F72, ao apagar o piso, reescreve esta lista.
  k_recorte_classe text[] := array[
    'e_admin:empresas_de_admin', 'pode_escrever_termo:empresas_de_escrita', 'pode_escrever:empresas_de_escrita',
    'unidades_de_escrita:empresas_de_escrita', 'papel_atual:empresas_do_membro'
  ];

  -- AS POLICIES DE ESCRITA POR UNIDADE (decisão 3 do PLAN-F66): as seis que chamavam `pode_escrever_filial(filial_id)`
  -- POR LINHA e passaram à forma de PARES — `(empresa_id, filial_id) in (select u.empresa_id, u.filial_id from
  -- public.unidades_de_escrita() u)`, em conjunção com o termo de empresa. `:N` é quantos pares cada árvore tem na
  -- conjunção de cima (em `movimentacoes / operador insere`, dois: a filial declarada e a filial REAL do ativo, lida do
  -- snapshot da própria linha). A 16c confere nos dois sentidos: cada entrada tem os pares em toda árvore, e toda
  -- policy com pares está aqui. Fonte única; a F67 (`pode_escrever_unidade` no corpo das RPCs) não mexe nela.
  -- ⚠ Nos comentários das entradas: nada de aspa simples (o leitor da mesa casa este trecho como texto).
  k_recorte_unidade text[] := array[
    'public.ativos / operador atualiza:1', -- 0176 · o operador só atualiza ativo das filiais dele
    'public.ativos / operador insere:1', -- 0176 · o operador só cadastra ativo nas filiais dele
    'public.lancamentos_item / operador lanca:1', -- 0176 · o lançamento de item só na filial em que se escreve
    'public.movimentacoes / operador insere:2', -- 0176 · a filial declarada e a filial real do ativo (o snapshot)
    'public.pendencias_item / pendencias_item admin reabre:1', -- 0176 · reabrir exige administrar a empresa e a filial
    'public.pendencias_item / pendencias_item operador resolve:1' -- 0176 · resolver só na filial em que se escreve
  ];

  -- AS EXCEÇÕES NOMINAIS DO RECORTE — as policies de `public` em tabela SEM `empresa_id`. Uma por policy, com o motivo e o
  -- destino na linha; a 16e confere nos dois sentidos (policy em tabela sem a coluna fora desta lista reprova; entrada
  -- sem policy viva, ou em tabela que ganhou a coluna, também). NÃO é a lista da doutrina (`k_excecoes_predicado`, a
  -- forma do predicado) nem a de leitura de função (`k_leitura_tenant`): fatos diferentes, fontes diferentes.
  -- ⚠ Nos comentários das entradas: nada de aspa simples.
  k_recorte_excecoes text[] := array[
    'public._bkp_relatorios_gerados_f6a / dev le backup f6a', -- 0128 · motivo: backup congelado de uma fase, sem a coluna, só o dev lê · destino: permanente
    'public.profiles / atualiza proprio perfil', -- 0059 · motivo: identidade da conta, a pessoa edita o próprio nome · destino: F69 (a leitura cruzada de perfis por empresa)
    'public.profiles / leitura operador' -- 0070 · motivo: identidade da conta, lida por colegas de qualquer filial · destino: F69 (a leitura cruzada de perfis por empresa)
  ];

  -- A GUARDA DO ANALISADOR DO RECORTE (16g): o que cada árvore SINTÉTICA tem de produzir, `caso:achado`. As que não
  -- produzem nada (o array sem `array (select …)`, a outra coluna, o sub-select com filtro) não aparecem — e qualquer
  -- achado delas reprova.
  k_recorte_guarda_esperada text[] := array[
    'recorte-canonico:termo:empresas_do_membro', 'recorte-em-and:termo:empresas_do_membro', 'recorte-em-or:fora',
    'pares:pares', 'pares-em-or:pares-fora'
  ];

  -- INFRA — cinco, cada uma com o motivo escrito. Nenhuma entra por categoria:
  --   · profiles          (0001) — identidade da CONTA, não do acervo. Na virada o
  --                                cargo migra para `membros.papel` (plano §5 → F62,
  --                                decisão 6): quem se recorta é o vínculo, não a pessoa.
  --   · operador_filiais  (0061) — vínculo de ESCRITA de uma conta; mesmo destino.
  --   · senha_tentativas  (0025) — rate-limit por IP. A própria migration o chama de
  --                                "Infra de segurança" (0025:19), e a tabela guarda um
  --                                IP e um contador: nada de empresa nenhuma, nem
  --                                sequer a senha a que a tentativa se referia.
  --   · ambiente          (0090) — marcador de DEPLOY. O `comment on table` da 0090 diz
  --                                com todas as letras: "Não é configuração da aplicação:
  --                                nada no app lê esta tabela". Único consumidor:
  --                                `resetar_dados_ficticios()`.
  --   · _bkp_relatorios_gerados_f6a (0128) — backup CONGELADO de uma fase, adotado no
  --                                versionamento pela 0128, que a chama de "arquivo
  --                                morto de diagnóstico, não cadastro" (0128:97).
  -- F62 (22/09/2026) — as TRÊS da raiz do tenant, oito no total:
  --   · empresas          (0152) — a RAIZ do mecanismo: recorta-se pelo PRÓPRIO id (as
  --                                funções de conjunto devolvem ids de empresa), não por
  --                                uma chave `empresa_id` dentro dela.
  --   · membros           (0153) — o vínculo pessoa × empresa com o CARGO: é o que as
  --                                funções de conjunto LEEM para recortar o resto — o
  --                                destino que o motivo de `profiles` acima já anunciava.
  --   · plataforma_admins (0154) — quem opera a PLATAFORMA, acima das empresas: por
  --                                definição não pertence a empresa nenhuma.
  --   `operador_filiais` CONTINUA infra (fato 14 da ordem F62): ganhou `empresa_id` e
  --   `membro_id` (0156), mas é o vínculo de ESCRITA de uma membership — a chave de recorte
  --   dele é a membership, não a linha.
  -- F63 (23/09/2026) — nove no total:
  --   · backups_migration (0159) — o PAR DE BACKUP das migrations que alteram dado: o que ela
  --                                guarda é do MECANISMO de migração (a chave e o valor anterior
  --                                de uma célula), escrito pela migration e lido pelo rollback
  --                                dela; não se recorta por empresa.
  k_infra text[] := array[
    'profiles', 'operador_filiais', 'senha_tentativas', 'ambiente',
    '_bkp_relatorios_gerados_f6a', 'empresas', 'membros', 'plataforma_admins',
    'backups_migration'
  ];

  -- =======================================================================
  -- AS EXCEÇÕES NOMINAIS DE "SEM POLICY DE SELECT" — deny-all POR AUSÊNCIA.
  --
  -- RLS ligada e ZERO policy não é esquecimento: é o idioma que este banco usa para
  -- "só o dono, e as `security definer` dele, enxergam". Cada uma tem o motivo escrito
  -- e a migration que a criou. NUNCA por categoria, por prefixo ou por "tabela
  -- sensível" — foi exatamente uma isenção por prefixo, sem motivo escrito, que a F47
  -- arrancou de `seguranca_catalogo.sql`.
  --
  --   · senhas_acesso     — a 0005 criou DUAS policies e a 0012 DROPOU as duas. A porta
  --                         pública por senha é servida pelo service role, fora da RLS;
  --                         deixar uma policy de SELECT para `authenticated` exporia o
  --                         hash a todo logado. É tabela de NEGÓCIO (a virada precisa
  --                         dela lá) E deny-all ao mesmo tempo — as duas coisas juntas
  --                         são o motivo de esta exceção existir.
  --   · senha_tentativas  — a 0025 liga a RLS e nunca cria policy. Mesmo idioma:
  --                         rate-limit da mesma porta, escrito por
  --                         `registrar_tentativa_senha()` (definer).
  --   · ambiente          — a 0090 escreve, na própria migration: "Sem NENHUMA policy:
  --                         invisível para anon e authenticated. Só o dono (e as funções
  --                         `security definer` dele) enxerga — mesmo idioma de
  --                         `senhas_acesso`/`senha_tentativas`."
  --
  --   · empresas          — F62 (0152): nenhuma tela lê a raiz do tenant nesta fase (o
  --                         seletor de empresa é da F70); quem precisa lê como definer.
  --                         RLS ligada, sem policy, e a escrita de anon/authenticated
  --                         revogada na própria migration.
  --   · plataforma_admins — F62 (0154): só `e_plataforma()` (definer) a lê. Mesmo idioma
  --                         de `ambiente`.
  --   · backups_migration — F63 (0159): o par de backup de migração; quem escreve é a migration
  --                         e quem lê é o rollback dela, os dois como o dono. RLS ligada, zero
  --                         policy e revoke all dos três papéis da API — o molde de `ambiente`.
  --
  -- ⚠ A asserção 4 confere esta lista no SENTIDO CONTRÁRIO: nome aqui que passe a TER
  -- policy de SELECT também REPROVA. Exceção não sobrevive ao motivo que a criou.
  -- =======================================================================
  k_sem_select text[] := array['senhas_acesso', 'senha_tentativas', 'ambiente', 'empresas', 'plataforma_admins',
                               'backups_migration'];

  -- =======================================================================
  -- O PISO DE LEITURA CONGELADO (R-ACC-25, migration 0070).
  --
  -- `profiles.ativo = false` fecha também a LEITURA, no request seguinte. O piso é
  -- `(select public.papel_atual()) is not null`, e ele está EXATAMENTE nestas 20
  -- policies de SELECT de `public` — nem uma a mais, nem uma a menos (15 até a F55;
  -- a F56 acrescenta as quatro tabelas do vocabulário do import, mesmo piso; a F62, a
  -- de `membros` — o espelho EXATO da leitura de `profiles`, porque o app lê o cargo
  -- pela sessão).
  --
  -- ⚠ A comparação é por `ilike '%papel_atual%'` e NÃO por igualdade de texto:
  -- `pg_policies.qual` devolve a expressão NORMALIZADA pelo Postgres. O que a
  -- migration escreveu como `(select public.papel_atual()) is not null` pode voltar
  -- como `((SELECT papel_atual() AS papel_atual) IS NOT NULL)`. Casar texto exato
  -- reprovaria por reescrita do planejador, que é ruído, não defeito.
  -- =======================================================================
  k_piso_papel text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'filiais', 'import_prefixos_patrimonio',
    'import_termos_categoria', 'import_termos_estado', 'itens', 'kits_modelos',
    'lancamentos_item', 'membros', 'motivos', 'movimentacoes', 'operador_filiais',
    'pendencias_item', 'profiles', 'relatorios_gerados', 'termos_gerados', 'tipos_item',
    'unidades_apelidos'
  ];

  -- As TRÊS que decidem por CARGO em vez do piso, e por quê — congeladas junto, para
  -- que uma delas afrouxar para `papel_atual()` (que é MAIS permissivo) reprove:
  --   · eventos_admin (0065) e import_logs (0063) — `e_admin()`: auditoria e trilha do
  --     import não são matéria de todo logado.
  --   · _bkp_relatorios_gerados_f6a (0128) — `e_dev()`: histórico congelado.
  k_piso_cargo text[] := array['eventos_admin', 'import_logs', '_bkp_relatorios_gerados_f6a'];

  -- =======================================================================
  -- AS 8 POLICIES DE `storage.objects`, congeladas nominalmente.
  -- Dois buckets: `termos` (0021, endurecido por 0069/0070/0072) e `backups-import`
  -- (0031, endurecido por 0066). Policy nova em Storage REPROVA até ser decidida.
  -- =======================================================================
  k_storage text[] := array[
    'termos leitura operador', 'termos insere operador',
    'termos atualiza operador', 'termos apaga operador',
    'backups-import leitura operador', 'backups-import insere operador',
    'backups-import atualiza operador', 'backups-import apaga operador'
  ];

  -- As funções do MODELO DE ACESSO. Uma policy de Storage que não cite NENHUMA delas
  -- está decidindo só por `bucket_id` — a forma que esta fase proíbe.
  --
  -- ⚠ `pode_ler_arquivo_termo` entrou na F50 (0129) e a entrada é OBRIGATÓRIA, não
  -- cosmética: a policy "termos leitura operador" deixou de citar `papel_atual`
  -- diretamente e passou a chamar a função nova, que o encapsula. Sem o nome aqui,
  -- esta asserção acusaria a policy de "decidir só por bucket_id" — exatamente o
  -- oposto do que a 0129 fez.
  k_funcoes_acesso text[] := array[
    'papel_atual', 'e_admin', 'e_dev', 'pode_escrever', 'pode_escrever_filial',
    'pode_escrever_termo', 'pode_escrever_arquivo_termo', 'pode_ler_arquivo_termo'
  ];

  -- =======================================================================
  -- A PUBLICATION DO REALTIME, congelada.
  -- `movimentacoes` entrou pela 0009; `lancamentos_item` e `anotacoes` pela 0018.
  -- Mais nada entrou desde então, e a AUSÊNCIA é decisão: a 0050 escreve, ao criar
  -- `pendencias_item`, que ela "NÃO entra na publication de realtime (/pendencias não
  -- usa realtime)". Por isso a asserção 9 congela o conjunto nos DOIS sentidos.
  -- =======================================================================
  k_realtime text[] := array['movimentacoes', 'lancamentos_item', 'anotacoes'];

  -- =======================================================================
  -- F59 — A DOUTRINA DO PREDICADO (emenda F59 da MATRIZ-REGRAS, R-ACC-63 em diante)
  --
  -- O UNIVERSO CONGELADO. As 54 policies de `public` (53 até a F61; a F62 acrescenta a de
  -- `membros` — NENHUMA das 53 mudou, provado byte a byte nos dois bancos), por
  -- `tabela / policy`; as 8 de
  -- `storage.objects` continuam em `k_storage` (uma fonte por fato). É ESTE conjunto
  -- que a trava de mesa (`src/lib/validators/policies-initplan.test.ts`) compara com o
  -- replay das migrations, e que 10a/10b comparam com `pg_policies`: a mesa e o banco
  -- julgam o MESMO universo por asserção, nos dois lados — não por uma conferência de
  -- um dia. Policy nova em `public` reprova até ser decidida, como em Storage desde a F48.
  -- =======================================================================
  k_policies_public text[] := array[
    '_bkp_relatorios_gerados_f6a / dev le backup f6a',
    'anotacoes / leitura operador', 'anotacoes / operador anota',
    'ativos / leitura operador', 'ativos / operador atualiza', 'ativos / operador insere',
    'colaboradores / admin atualiza colaborador', 'colaboradores / escrita cria colaborador',
    'colaboradores / leitura operador',
    'eventos_admin / admin le auditoria',
    'filiais / admin apaga', 'filiais / admin atualiza', 'filiais / admin insere', 'filiais / leitura operador',
    'import_logs / leitura operador', 'import_logs / operador insere',
    'import_prefixos_patrimonio / leitura operador', 'import_termos_categoria / leitura operador',
    'import_termos_estado / leitura operador',
    'itens / admin apaga', 'itens / admin atualiza', 'itens / escrita cria item', 'itens / leitura operador',
    'kits_modelos / admin apaga', 'kits_modelos / admin atualiza', 'kits_modelos / admin insere',
    'kits_modelos / leitura operador',
    'lancamentos_item / leitura operador', 'lancamentos_item / operador lanca',
    'membros / leitura operador',
    'motivos / admin apaga', 'motivos / admin atualiza', 'motivos / admin insere', 'motivos / leitura operador',
    'movimentacoes / leitura operador', 'movimentacoes / operador insere',
    'operador_filiais / leitura operador',
    'pendencias_item / pendencias_item admin reabre', 'pendencias_item / pendencias_item leitura operador',
    'pendencias_item / pendencias_item operador resolve',
    'profiles / atualiza proprio perfil', 'profiles / leitura operador',
    'relatorios_gerados / leitura operador', 'relatorios_gerados / operador gera',
    'termos_gerados / leitura operador', 'termos_gerados / operador apaga', 'termos_gerados / operador atualiza',
    'termos_gerados / operador insere',
    'tipos_item / admin atualiza tipo', 'tipos_item / admin insere tipo', 'tipos_item / leitura operador',
    'unidades_apelidos / admin apaga apelido', 'unidades_apelidos / admin insere apelido',
    'unidades_apelidos / leitura operador'
  ];

  -- =======================================================================
  -- AS EXCEÇÕES DA DOUTRINA — a FONTE ÚNICA (Decisão 2 da F48).
  --
  -- Uma entrada por OCORRÊNCIA `schema.tabela / policy / função` — NUNCA por nome de
  -- função: por nome, `pode_escrever_filial` entraria numa policy nova da F66 sem
  -- ninguém decidir. Quando a exceção é de R3, o terceiro campo é `sub-select`.
  --
  -- NA LINHA de cada entrada: a migration da última alteração da policy, o `motivo:` e
  -- o `destino:` — a fase que elimina a ocorrência, ou `permanente` quando a policy
  -- decide sobre o PRÓPRIO objeto (o arquivo pelo `name`, o termo pelos `ativo_ids`, a
  -- coerência do estorno pelos seus campos). A trava de mesa LÊ este array como texto e
  -- exige o formato; as asserções 11a/11b o conferem contra o catálogo nos DOIS sentidos.
  --
  -- ⚠ CATRACA QUE SÓ ENCOLHE. Quem conserta a policy TIRA a linha — a 11b reprova
  -- exceção sem ocorrência viva. Acrescentar linha é decisão de fase, com ata.
  -- F66 (24/09/2026): as seis de `pode_escrever_filial` saíram — a 0176 trocou cada uma pela forma de PARES sobre
  -- `unidades_de_escrita()` (`k_recorte_unidade`, a 16c/16d do bloco 6). A lista foi de 18 para 12.
  --
  -- ⚠ NÃO É A LISTA DA R-ACC-57. `definer_sem_tenant.sql` pergunta se a `security
  -- definer` confere escopo NO CORPO; esta pergunta se a POLICY passa a linha para uma
  -- função — `array_length` nem é definer. Fatos diferentes, listas diferentes.
  --
  -- ⚠ Nos comentários das entradas: nada de aspa simples, e o array fecha sozinho na
  -- última linha — o leitor da mesa casa este trecho como texto.
  -- =======================================================================
  k_excecoes_predicado text[] := array[
    'public.lancamentos_item / operador lanca / estorno_item_coerente', -- 0068 · motivo: coerência do próprio registro, o estorno aponta lançamento da mesma filial e do mesmo item · destino: permanente
    'public.termos_gerados / operador apaga / pode_escrever_termo', -- 0069 · motivo: o termo decide pelos próprios ativo_ids, e apagar exige escrever na filial de todos eles · destino: permanente
    'public.termos_gerados / operador atualiza / array_length', -- 0069 · motivo: built-in imutável sobre o próprio array, que recusa termo sem ativo, de custo desprezível · destino: permanente
    'public.termos_gerados / operador atualiza / pode_escrever_termo', -- 0069 · motivo: o termo decide pelos próprios ativo_ids, e atualizar exige escrever na filial de todos eles · destino: permanente
    'public.termos_gerados / operador atualiza / termo_ancora_coerente', -- 0069 · motivo: coerência das âncoras do próprio termo, as movimentações batem com os ativos dele · destino: permanente
    'public.termos_gerados / operador insere / array_length', -- 0069 · motivo: built-in imutável sobre o próprio array, que recusa termo sem ativo, de custo desprezível · destino: permanente
    'public.termos_gerados / operador insere / pode_escrever_termo', -- 0069 · motivo: o termo decide pelos próprios ativo_ids, e emitir exige escrever na filial de todos eles · destino: permanente
    'public.termos_gerados / operador insere / termo_ancora_coerente', -- 0069 · motivo: coerência das âncoras do próprio termo, as movimentações batem com os ativos dele · destino: permanente
    'storage.objects / termos apaga operador / pode_escrever_arquivo_termo', -- 0072 · motivo: o arquivo decide pelo próprio name, que aponta o termo dono do .docx · destino: permanente (revista na F67)
    'storage.objects / termos atualiza operador / pode_escrever_arquivo_termo', -- 0072 · motivo: o arquivo decide pelo próprio name, que aponta o termo dono do .docx · destino: permanente (revista na F67)
    'storage.objects / termos insere operador / pode_escrever_arquivo_termo', -- 0072 · motivo: o arquivo decide pelo próprio name, que aponta o termo dono do .docx · destino: permanente (revista na F67)
    'storage.objects / termos leitura operador / pode_ler_arquivo_termo' -- 0129 · motivo: o falso içamento, o select em volta não iça e a função recebe o name da linha · destino: F67 (reescreve as policies de Storage)
  ];

  -- A GUARDA DO ANALISADOR DE ÁRVORE (10d): o que cada árvore SINTÉTICA tem de
  -- produzir, `caso:achado`. As árvores que passam (cast, embrulhada, forma-alvo,
  -- pares) não aparecem aqui — e por isso qualquer achado delas também reprova.
  k_guarda_esperada text[] := array[
    'r1-coluna:r1', 'r1-falso-icamento:r1', 'r1-expressao:r1', 'r2-solta:r2',
    'r3-le-tabela:r3a', 'r3-correlacionado:r3b', 'setof-array:setof', 'no-desconhecido:desconhecido'
  ];

  -- Os tipos de nó que o analisador sabe ler. FALHA FECHADA: tipo fora desta lista
  -- numa árvore de policy reprova (10c) — agregado, janela, CTE, união, XML, JSON e
  -- `nextval` ficam de fora de propósito: a doutrina não os aceita num predicado.
  k_nos_conhecidos text[] := array[
    'QUERY', 'FROMEXPR', 'JOINEXPR', 'RANGETBLREF', 'RANGETBLENTRY', 'RANGETBLFUNCTION',
    'RTEPERMISSIONINFO', 'ALIAS', 'TARGETENTRY', 'SORTGROUPCLAUSE',
    'BOOLEXPR', 'OPEXPR', 'DISTINCTEXPR', 'NULLIFEXPR', 'SCALARARRAYOPEXPR', 'ROWCOMPAREEXPR',
    'NULLTEST', 'BOOLEANTEST', 'VAR', 'CONST', 'PARAM', 'SUBLINK', 'FUNCEXPR',
    'RELABELTYPE', 'COERCEVIAIO', 'ARRAYCOERCEEXPR', 'CONVERTROWTYPEEXPR', 'COLLATEEXPR',
    'CASEEXPR', 'CASEWHEN', 'CASETESTEXPR', 'ARRAYEXPR', 'ROWEXPR', 'COALESCEEXPR',
    'MINMAXEXPR', 'SQLVALUEFUNCTION', 'FIELDSELECT', 'SUBSCRIPTINGREF'
  ];

  -- O estado do laço da árvore (F59). Pilha em arrays paralelos: plpgsql não tem struct.
  v_arv       record;
  v_tok       text;
  v_campo     text;
  v_tipos     text[];
  v_func      bigint[];
  v_real      boolean[];
  v_retset    boolean[];
  v_alvoarr   boolean[];
  v_linha     boolean[];
  v_num1      bigint[];
  v_num2      bigint[];
  v_prof      int;
  v_topo      int;
  v_k         int;
  v_dentro    boolean;
  v_achou     boolean;
  v_m         text[];
  v_arvores   int := 0;
  v_chamadas  int := 0;
  v_nos       int := 0;
  v_casos     int := 0;
  v_r1        text[] := '{}';
  v_r2        text[] := '{}';
  v_r3a       text[] := '{}';
  v_r3b       text[] := '{}';
  v_setof     text[] := '{}';
  v_desc      text[] := '{}';
  v_vivas     text[];
  v_obtida    text[] := '{}';
  v_f_linha   oid;
  v_f_sem     oid;
  v_f_uid     oid;
  -- F63 — o bloco 5 (a chave de recorte no acervo): uma leitura de catálogo só, em arrays.
  v_l1_tab    text[];
  v_l1_def    text[];
  v_l1_lote   boolean[];
  -- F64 — o lote 2 no mesmo bloco 5: a leitura de catálogo das onze, em arrays.
  v_l2_tab    text[];
  v_l2_def    text[];
  -- F66 — o bloco 6 (o recorte): o laço da árvore do RECORTE, com assinatura por nó (pilha em arrays paralelos).
  v_rc        record;
  v_rc_tipos  text[];
  v_rc_campos text[];
  v_rc_filhos text[];
  v_rc_conj   boolean[];
  v_rc_bool   text[];
  v_rc_topo   int;
  v_rc_campo  text;
  v_rc_tok    text;
  v_rc_sig    text;
  v_rc_canon  text[];
  v_rc_fora   int;
  v_rc_pc     int;
  v_rc_pt     int;
  v_rc_funcs  bigint[];
  v_re_canon  text;
  v_re_pares  text;
  v_op_uuid   oid;
  v_f_unid    oid;
  v_rr_chave  text[] := '{}';
  v_rr_tipo   text[] := '{}';
  v_rr_coluna boolean[] := '{}';
  v_rr_canon  text[] := '{}';
  v_rr_fora   int[] := '{}';
  v_rr_pc     int[] := '{}';
  v_rr_pt     int[] := '{}';
  v_rr_funcs  text[] := '{}';
  v_rr_casos  int := 0;
  v_rc_obtida text[] := '{}';
begin
  -- ===============================================================
  -- BLOCO 1 — AS POLICIES DE `public`
  -- ===============================================================

  -- ---------------------------------------------------------------
  -- 1 — A TABELA-VERDADE cobre TODA tabela de `public`, nos dois sentidos.
  --     relkind r = tabela, p = particionada (o mesmo recorte da asserção 2 de
  --     `seguranca_catalogo.sql`, para os dois arquivos falarem do mesmo universo).
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p');

  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into v_cnt, v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not (c.relname = any (k_negocio)) and not (c.relname = any (k_infra));
  if pg_temp.assert_zero_de(
       '1a toda tabela de public está CLASSIFICADA negócio × infra' ||
       case when v_cnt > 0 then ' — não classificada(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_negocio || k_infra) as nome
   where not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = nome
   );
  if pg_temp.assert_zero_de(
       '1b todo nome classificado ainda existe no catálogo' ||
       case when v_cnt > 0 then ' — fantasma(s): ' || v_lista else '' end,
       v_cnt, (array_length(k_negocio, 1) + array_length(k_infra, 1))::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 2 — Toda tabela de NEGÓCIO tem policy de SELECT viva, salvo a lista NOMINAL.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_negocio) as nome
   where not (nome = any (k_sem_select))
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = nome and p.cmd in ('SELECT', 'ALL')
     );
  if pg_temp.assert_zero_de(
       '2 toda tabela de NEGÓCIO tem policy de SELECT' ||
       case when v_cnt > 0 then ' — sem SELECT e sem exceção declarada: ' || v_lista else '' end,
       v_cnt, array_length(k_negocio, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 3 — INFRA NÃO É ISENÇÃO. Toda tabela de `public` sem policy de SELECT — negócio
  --     OU infra — tem de estar na lista NOMINAL de deny-all.
  --
  --     ⚠ ESTA É A ASSERÇÃO QUE FECHA O BURACO DA CATEGORIA. Sem ela, classificar uma
  --     tabela como "infra" seria uma isenção por categoria disfarçada — e uma tabela
  --     de infra nova, nascida sem policy nenhuma, entraria sem nada acusar. É o mesmo
  --     defeito da isenção por prefixo `_` que a F47 arrancou de
  --     `seguranca_catalogo.sql`, só que com outro nome.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into v_cnt, v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not (c.relname = any (k_sem_select))
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('SELECT', 'ALL')
     );
  if pg_temp.assert_zero_de(
       '3 nenhuma tabela de public fica sem SELECT por CATEGORIA' ||
       case when v_cnt > 0 then ' — sem SELECT e fora da lista nominal: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 4 — A SIMETRIA da lista de exceções: nome declarado deny-all que passe a TER
  --     policy de SELECT reprova. Sem esta metade, uma exceção sobreviveria ao motivo
  --     que a criou e ninguém saberia — que é como uma lista de exceções apodrece.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_sem_select) as nome
   where exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = nome and p.cmd in ('SELECT', 'ALL')
   );
  if pg_temp.assert_zero_de(
       '4 toda exceção deny-all ainda descreve o banco' ||
       case when v_cnt > 0 then ' — ganhou policy de SELECT: ' || v_lista else '' end,
       v_cnt, array_length(k_sem_select, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 4-bis — `force row level security` DESLIGADO em TODA tabela de `public`.
  --
  --     A regra é R-ACC-29 (emenda F48 da MATRIZ-REGRAS), e ela existia só em PROSA —
  --     a `0070` explica as duas razões, e nenhuma asserção do repositório conferia que
  --     a proibição está sendo cumprida. Este é o par executável dela.
  --
  --     ⚠ E a proibição vale para as 21 tabelas, não só para as 4 que a `0070` cita.
  --     `force row level security` faz a RLS valer TAMBÉM PARA O DONO, e o sistema
  --     inteiro conta com o contrário:
  --       (1) em `profiles`, `papel_atual()` lê `profiles` e a policy de `profiles`
  --           chama `papel_atual()`. O ciclo só não fecha porque a função roda como o
  --           dono, que ignora RLS na própria tabela "salvo FORCE ROW LEVEL SECURITY"
  --           (0070:50-57). Ligá-lo derruba o sistema com `42P17` em TODA leitura,
  --           para TODO MUNDO, ao mesmo tempo.
  --       (2) em `ativos`, `movimentacoes` e `pendencias_item`, `aplicar_movimentacao`
  --           e o gatilho da `0051` escrevem FORA de policy contando com o mesmo bypass
  --           (0070:58-62). Ligá-lo quebra o registro de movimentação.
  --     Falha ruidosa, não silenciosa — e é justamente por ser ruidosa que ninguém
  --     nunca a escreveu como asserção. Ela custa uma linha e fecha a superfície.
  --     ⚠ MEDIDO NA F62 (22/09/2026): (1) e (2) não acontecem nos nossos bancos. O dono
  --     (`postgres`) tem BYPASSRLS no banco hospedado e é superusuário no CI, e o atributo
  --     vence o `force` — com `force` em `membros`, a leitura segue normal (cenário 9o de
  --     `isolamento_tenant.sql`, que também trava a premissa real: o atributo do dono). A
  --     proibição fica: o `force` não protege nada aqui e só mudaria de comportamento no
  --     dia em que o dono mudasse. Ver a emenda F62 da R-ACC-29.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into v_cnt, v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relforcerowsecurity;
  if pg_temp.assert_zero_de(
       '4-bis `force row level security` desligado em toda tabela de public (R-ACC-29)' ||
       case when v_cnt > 0 then ' — ligado em: ' || v_lista || ' (proibido — R-ACC-29; o efeito real está no 9o de isolamento_tenant.sql)' else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 5 — NENHUMA POLICY, EM NENHUM VERBO, COM PREDICADO EQUIVALENTE A `true`.
  --
  --     `qual` é o `using` e `with_check` é o `with check`, ambos normalizados pelo
  --     Postgres: `using (true)` volta como a string `true`. Cobre `public` E
  --     `storage.objects` de uma vez — a porta é a mesma.
  --
  --     Ela nasce verde, e isso foi trabalho de outras fases: as dezenas de
  --     `using (true)` das migrations 0001/0005/0010/0014/0015/0017/0021 foram todas
  --     substituídas por `alter policy` nas 0059→0107. O último `with check (true)`
  --     vivo era o do INSERT de `import_logs`, deixado de propósito pela 0063:229 e
  --     fechado pela 0067:99. A própria 0067 traz, no rodapé, a consulta que esta
  --     asserção transforma em permanente, com o "esperado: 0 linhas" escrito ao lado.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_policies p
   where p.schemaname in ('public', 'storage');

  select count(*), coalesce(string_agg(p.schemaname || '.' || p.tablename || ' / ' || p.policyname, ', '
                                       order by p.schemaname, p.tablename, p.policyname), '')
    into v_cnt, v_lista
    from pg_policies p
   where p.schemaname in ('public', 'storage')
     and (btrim(coalesce(p.qual, ''), '() ') = 'true' or btrim(coalesce(p.with_check, ''), '() ') = 'true');
  if pg_temp.assert_zero_de(
       '5 nenhuma policy com predicado equivalente a `true`' ||
       case when v_cnt > 0 then ' — sempre-verdadeira(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 6 — O PISO `papel_atual()` ESTÁ EXATAMENTE ONDE ESTÁ HOJE, nos dois sentidos.
  --     6a: tabela do piso cuja policy de SELECT deixou de citá-lo → o gate da 0070
  --         caiu naquela tabela, e o desativado volta a ler.
  --     6b: tabela FORA do piso cuja policy de SELECT passou a citá-lo → alguém
  --         afrouxou um SELECT de cargo (`e_admin`/`e_dev`) para "todo logado ativo".
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_piso_papel) as nome
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = nome and p.cmd = 'SELECT'
        and coalesce(p.qual, '') ilike '%papel_atual%'
   );
  if pg_temp.assert_zero_de(
       '6a o piso `papel_atual()` continua nas ' || array_length(k_piso_papel, 1) ||
       ' policies de SELECT congeladas' ||
       case when v_cnt > 0 then ' — perdeu o piso: ' || v_lista else '' end,
       v_cnt, array_length(k_piso_papel, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_piso_cargo) as nome
   where exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = nome and p.cmd = 'SELECT'
        and coalesce(p.qual, '') ilike '%papel_atual%'
   );
  if pg_temp.assert_zero_de(
       '6b as ' || array_length(k_piso_cargo, 1) ||
       ' que decidem por CARGO não afrouxaram para o piso' ||
       case when v_cnt > 0 then ' — afrouxada(s): ' || v_lista else '' end,
       v_cnt, array_length(k_piso_cargo, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 6c — O SENTIDO QUE FALTAVA: do CATÁLOGO para a lista.
  --
  --     ⚠ ESTA ASSERÇÃO NASCEU DA REVISÃO ADVERSARIAL DA PRÓPRIA FASE, e o achado era
  --     justo: 6a e 6b varrem `unnest(…)` — as duas vão da LISTA para o catálogo. Sem
  --     esta terceira, uma tabela de negócio NOVA, com policy de SELECT citando
  --     `papel_atual()`, entraria sem reprovar em lugar nenhum: a 1a a cobraria por estar
  --     classificada, a 2 por ter SELECT, e o PISO dela não passaria por decisão nenhuma.
  --     Era exatamente "a lista escrita à mão fingindo ser derivada" que esta fase existe
  --     para não ter — e nos outros conjuntos deste arquivo (`k_negocio`+`k_infra`,
  --     `k_sem_select`, `k_storage`, `k_realtime`) as duas direções já estavam lá. A
  --     assimetria não tinha razão de ser.
  --
  --     O universo é o conjunto das tabelas com policy de SELECT em `public`: toda uma
  --     tem de estar em UMA das duas listas — a do piso ou a do cargo.
  -- ---------------------------------------------------------------
  select count(distinct p.tablename) into v_univ
    from pg_policies p
   where p.schemaname = 'public' and p.cmd = 'SELECT';

  select count(*), coalesce(string_agg(distinct p.tablename, ', ' order by p.tablename), '')
    into v_cnt, v_lista
    from pg_policies p
   where p.schemaname = 'public' and p.cmd = 'SELECT'
     and not (p.tablename = any (k_piso_papel))
     and not (p.tablename = any (k_piso_cargo));
  if pg_temp.assert_zero_de(
       '6c toda policy de SELECT de public está numa das duas listas do piso' ||
       case when v_cnt > 0 then ' — não decidida(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ===============================================================
  -- BLOCO 2 — AS POLICIES DE `storage.objects`
  -- ===============================================================

  -- ---------------------------------------------------------------
  -- 7 — NENHUMA POLICY DE STORAGE DECIDE SÓ POR `bucket_id`.
  --
  --     A FORMA PROIBIDA EXISTIU, e está escrita: a 0070:137 documenta a reversão da
  --     policy de leitura de termos como `using (bucket_id = 'termos')` — exatamente o
  --     que esta asserção recusa — e as linhas 0070:202-207 explicam o furo: "certo
  --     quanto ao CARGO, incompleto quanto à SESSÃO: quem foi DESATIVADO continuava
  --     conseguindo `createSignedUrl` de qualquer .docx enquanto o token vivia, e o
  --     .docx traz nome do colaborador, setor e patrimônios".
  --
  --     A régua: o predicado efetivo (o `using` E o `with check`, porque policy de
  --     INSERT só tem o segundo) precisa citar ao menos UMA função do modelo de acesso.
  --     Não é lista de policies — é lista de FUNÇÕES, e por isso uma policy nova de
  --     Storage escrita direito passa sem alteração nenhuma neste arquivo.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects';

  select count(*), coalesce(string_agg(p.policyname, ', ' order by p.policyname), '')
    into v_cnt, v_lista
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and not exists (
       select 1 from unnest(k_funcoes_acesso) as f
        where (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ilike '%' || f || '%'
     );
  if pg_temp.assert_zero_de(
       '7 nenhuma policy de storage.objects decide só por `bucket_id`' ||
       case when v_cnt > 0 then ' — sem noção de acesso: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 8 — O CONJUNTO de policies de `storage.objects` é o congelado, nos dois sentidos.
  --     Storage é a única superfície do sistema em que uma policy nova pode nascer
  --     pelo painel do Supabase, sem passar por migration nenhuma. Congelar o conjunto
  --     é o que transforma isso em erro de CI em vez de descoberta tardia.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(p.policyname, ', ' order by p.policyname), '')
    into v_cnt, v_lista
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and not (p.policyname = any (k_storage));
  if pg_temp.assert_zero_de(
       '8a nenhuma policy de Storage fora do conjunto congelado' ||
       case when v_cnt > 0 then ' — nova(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_storage) as nome
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = nome
   );
  if pg_temp.assert_zero_de(
       '8b nenhuma policy de Storage congelada sumiu' ||
       case when v_cnt > 0 then ' — ausente(s): ' || v_lista else '' end,
       v_cnt, array_length(k_storage, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ===============================================================
  -- BLOCO 3 — A PUBLICATION DO REALTIME
  -- ===============================================================

  -- ---------------------------------------------------------------
  -- 9 — O CONJUNTO da publication `supabase_realtime` é o congelado, nos dois sentidos.
  --
  --     O Realtime é a única superfície de LEITURA que não aparece em inventário
  --     nenhum — nem no tripwire do viewer, nem em `papeis_rls.sql`. Uma tabela na
  --     publication passa a empurrar cada linha alterada para quem estiver inscrito;
  --     na virada multiempresa isso é um canal direto entre inquilinos.
  --
  --     Os dois sentidos, e o de baixo importa tanto quanto o de cima: a 0050 escreve
  --     que `pendencias_item` NÃO entra ("/pendencias não usa realtime"), ou seja a
  --     AUSÊNCIA é decisão. Tirar uma das três de dentro quebraria a tela que depende
  --     dela sem nada acusar, e é isso que a metade 9b pega.
  -- ---------------------------------------------------------------
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    v_falhas := v_falhas + 1;
    raise warning '✗ 9 a publication `supabase_realtime` não existe — a 0009 não está no ar';
  else
    select count(*) into v_univ
      from pg_publication_tables t
     where t.pubname = 'supabase_realtime' and t.schemaname = 'public';

    select count(*), coalesce(string_agg(t.tablename, ', ' order by t.tablename), '')
      into v_cnt, v_lista
      from pg_publication_tables t
     where t.pubname = 'supabase_realtime' and t.schemaname = 'public'
       and not (t.tablename = any (k_realtime));
    if pg_temp.assert_zero_de(
         '9a nenhuma tabela NOVA na publication do Realtime' ||
         case when v_cnt > 0 then ' — entrou(aram): ' || v_lista else '' end,
         v_cnt, v_univ) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
      into v_cnt, v_lista
      from unnest(k_realtime) as nome
     where not exists (
       select 1 from pg_publication_tables t
        where t.pubname = 'supabase_realtime' and t.schemaname = 'public' and t.tablename = nome
     );
    if pg_temp.assert_zero_de(
         '9b nenhuma das ' || array_length(k_realtime, 1) || ' congeladas saiu da publication' ||
         case when v_cnt > 0 then ' — saiu(íram): ' || v_lista else '' end,
         v_cnt, array_length(k_realtime, 1)::bigint) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  end if;

  -- ===============================================================
  -- BLOCO 4 — A DOUTRINA DO PREDICADO (F59, 16/09/2026)
  --
  -- O predicado de recorte é `col = any (array (select public.<fn>()))` sobre função
  -- que devolve CONJUNTO — avaliado UMA vez por statement (`InitPlan`). As formas que
  -- rodam por linha estão proibidas, e é aqui que o catálogo VIVO confere isso:
  --   R1 (11a) — nenhuma função recebe dado da LINHA, salvo ocorrência declarada;
  --   R2 (12)  — função sem dado da linha só dentro de `(select …)`;
  --   R3 (13a/13b) — sub-select não lê tabela e não olha a linha;
  --   R-setof (14) — alvo de `array (select …)` devolve conjunto (o erro de EXECUÇÃO do
  --                  fato 21 da ordem F59, que nenhum teste de texto pega).
  --
  -- ⚠ A ÁRVORE, NÃO O TEXTO. `pg_policies.qual` é texto normalizado: diz
  -- `objects.name`, mas não diz se `name` é da linha ou de um FROM interno, nem se a
  -- função devolve conjunto. `pg_policy.polqual`/`polwithcheck` (`pg_node_tree`) dizem:
  --   {VAR :varno 1 :varlevelsup N}  é a LINHA quando N = profundidade de QUERY;
  --   {FUNCEXPR :funcid … :funcretset … :funcformat F}  é chamada (F 1/2 = cast);
  --   {RANGETBLENTRY :rtekind 0 …}  é relação lida;  {SUBLINK :subLinkType 6}  é ARRAY(…).
  -- O laço abaixo tokeniza a árvore com uma pilha, sem função nova e sem `pg_temp` novo.
  --
  -- ⚠ ATRIBUIÇÃO ÚNICA. Referência à linha dentro de sub-select, sob uma função do MESMO
  -- sub-select, é R1 (o falso içamento `(select fn(col))`); sem função entre ela e o
  -- sub-select, é R3. Toda função ancestral da referência conta uma ocorrência R1.
  --
  -- A metade de MESA desta doutrina é `policies-initplan.test.ts`, que lê as MESMAS
  -- listas deste arquivo. O que só a mesa faz: reprovar DDL de policy montado por
  -- `execute`/`format` (o catálogo vê o resultado, não o texto que o gerou). O que só o
  -- catálogo faz: a R-setof (texto não sabe `proretset`) e a paridade com o banco vivo.
  -- ===============================================================

  -- ---------------------------------------------------------------
  -- 10a/10b — O UNIVERSO que a doutrina julga é o congelado, nos dois sentidos.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_policies p
   where p.schemaname = 'public';

  select count(*), coalesce(string_agg(c.chave, ', ' order by c.chave), '')
    into v_cnt, v_lista
    from (select p.tablename || ' / ' || p.policyname as chave
            from pg_policies p
           where p.schemaname = 'public') as c
   where not (c.chave = any (k_policies_public));
  if pg_temp.assert_zero_de(
       '10a toda policy de public está no universo congelado da doutrina' ||
       case when v_cnt > 0 then ' — fora do universo (decida e congele): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_policies_public) as nome
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename || ' / ' || p.policyname = nome
   );
  if pg_temp.assert_zero_de(
       '10b toda policy do universo congelado ainda existe' ||
       case when v_cnt > 0 then ' — ausente(s): ' || v_lista else '' end,
       v_cnt, array_length(k_policies_public, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- O LAÇO DA ÁRVORE — as árvores REAIS (toda `polqual`/`polwithcheck` de `public` e
  -- `storage`) e as SINTÉTICAS da guarda 10d, pelo MESMO código. As sintéticas são
  -- texto montado à mão com os campos que o laço lê; os `funcid` vêm do catálogo para o
  -- nome resolver. Uma árvore sintética traz o `caso` na terceira coluna (a real, NULL),
  -- e o achado dela vai para `v_obtida` — nunca para os arrays que 10c–14 julgam.
  -- ---------------------------------------------------------------
  v_f_linha := 'public.pode_escrever_filial(smallint)'::regprocedure::oid;
  v_f_sem := 'public.e_admin()'::regprocedure::oid;
  v_f_uid := 'auth.uid()'::regprocedure::oid;

  -- [laço-da-árvore:início]
  for v_arv in
    select n.nspname || '.' || c.relname || ' / ' || p.polname as chave, a.arvore, null::text as caso
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral (values (p.polqual::text), (p.polwithcheck::text)) as a (arvore)
     where n.nspname in ('public', 'storage') and a.arvore is not null
    union all
    select '(árvore sintética ' || s.caso || ')', s.arvore, s.caso
      from (values
        ('r1-coluna', format(
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args ({VAR :varno 1 :varlevelsup 0})}', v_f_linha)),
        ('r1-falso-icamento', format(
           '{SUBLINK :subLinkType 4 :subselect {QUERY :rtable <> :targetList ({TARGETENTRY :expr '
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args ({VAR :varno 1 :varlevelsup 1})}})}}', v_f_linha)),
        ('r1-expressao', format(
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args ({COERCEVIAIO :arg {OPEXPR :args '
           '({VAR :varno 1 :varlevelsup 0} {CONST :constvalue 4 [ 1 2 3 4 ]})}})}', v_f_linha)),
        ('cast-nao-e-funcao', format(
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 1 :args ({VAR :varno 1 :varlevelsup 0})}', v_f_linha)),
        ('r2-solta', format(
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args <>}', v_f_sem)),
        ('r2-embrulhada', format(
           '{SUBLINK :subLinkType 4 :subselect {QUERY :rtable <> :targetList ({TARGETENTRY :expr '
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args <>}})}}', v_f_sem)),
        ('r3-le-tabela',
           '{SUBLINK :subLinkType 0 :subselect {QUERY :rtable ({RANGETBLENTRY :alias <> :eref {ALIAS '
           ':aliasname m :colnames ("a" "b\\ c")} :rtekind 0 :relid 1259}) :targetList <>}}'),
        ('r3-correlacionado',
           '{SUBLINK :subLinkType 0 :subselect {QUERY :rtable <> :jointree {FROMEXPR :fromlist <> :quals '
           '{OPEXPR :args ({VAR :varno 1 :varlevelsup 1} {CONST :constvalue 4 [ 0 0 0 0 ]})}} :targetList <>}}'),
        ('setof-array', format(
           '{SCALARARRAYOPEXPR :args ({VAR :varno 1 :varlevelsup 0} {SUBLINK :subLinkType 6 :subselect {QUERY '
           ':targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args <>}})}})}', v_f_uid)),
        ('forma-alvo', format(
           '{SCALARARRAYOPEXPR :args ({VAR :varno 1 :varlevelsup 0} {SUBLINK :subLinkType 6 :subselect {QUERY '
           ':targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>}})}})}', v_f_uid)),
        ('pares', format(
           '{SUBLINK :subLinkType 2 :testexpr {BOOLEXPR :args ({OPEXPR :args ({VAR :varno 1 :varlevelsup 0} '
           '{PARAM :paramkind 2})})} :subselect {QUERY :rtable ({RANGETBLENTRY :rtekind 3 :functions '
           '({RANGETBLFUNCTION :funcexpr {FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>}})}) '
           ':targetList ({TARGETENTRY :expr {VAR :varno 1 :varlevelsup 0}})}}', v_f_uid)),
        ('no-desconhecido', '{XMLEXPR :op 0 :args <>}')
      ) as s (caso, arvore)
  loop
    if v_arv.caso is not null then
      v_casos := v_casos + 1;
    else
      v_arvores := v_arvores + 1;
    end if;
    v_tipos := '{}'; v_func := '{}'; v_real := '{}'; v_retset := '{}'; v_alvoarr := '{}';
    v_linha := '{}'; v_num1 := '{}'; v_num2 := '{}'; v_prof := 0; v_campo := null;
    -- um token por casamento: [1] abre nó · [2] fecha nó · [3] nome de campo · [4] valor
    for v_m in
      select t.m
        from regexp_matches(v_arv.arvore,
               '(\{[A-Z_]+)|(\})|(:[A-Za-z_]+)|("(?:[^"\\]|\\.)*"|(?:[^\s{}()\[\]"\\]|\\.)+)', 'g')
             with ordinality as t (m, i)
       order by t.i
    loop
      v_topo := coalesce(array_length(v_tipos, 1), 0);
      if v_m[1] is not null then
        -- abre nó
        v_tok := ltrim(v_m[1], '{');
        if v_arv.caso is null then
          v_nos := v_nos + 1;
        end if;
        if not (v_tok = any (k_nos_conhecidos)) then
          if v_arv.caso is null then
            v_desc := v_desc || (v_arv.chave || ' / ' || v_tok);
          else
            v_obtida := v_obtida || (v_arv.caso || ':desconhecido');
          end if;
        end if;
        v_alvoarr := v_alvoarr || (v_tok = 'FUNCEXPR' and v_topo >= 3
                                   and v_tipos[v_topo] = 'TARGETENTRY'
                                   and v_tipos[v_topo - 1] = 'QUERY'
                                   and v_tipos[v_topo - 2] = 'SUBLINK'
                                   and v_num1[v_topo - 2] = 6);
        v_tipos := v_tipos || v_tok;
        v_func := v_func || 0::bigint;
        v_real := v_real || false;
        v_retset := v_retset || false;
        v_linha := v_linha || false;
        v_num1 := v_num1 || null::bigint;
        v_num2 := v_num2 || null::bigint;
        if v_tok = 'QUERY' then
          v_prof := v_prof + 1;
        end if;
      elsif v_m[2] is not null then
        -- fecha nó: é aqui que cada regra decide
        if v_topo = 0 then
          raise exception 'F59: árvore desbalanceada em %', v_arv.chave;
        end if;
        if v_tipos[v_topo] = 'VAR' and v_num1[v_topo] = 1 and v_num2[v_topo] = v_prof then
          -- dado da LINHA: toda função ancestral o recebe (R1); sem função dentro do
          -- sub-select mais interno, o sub-select olha a linha (R3)
          v_dentro := true;
          v_achou := false;
          for v_k in reverse (v_topo - 1) .. 1 loop
            if v_tipos[v_k] = 'QUERY' then
              v_dentro := false;
            elsif v_tipos[v_k] = 'FUNCEXPR' and v_real[v_k] then
              v_linha[v_k] := true;
              v_achou := v_achou or v_dentro;
            end if;
          end loop;
          if v_prof > 0 and not v_achou then
            if v_arv.caso is null then
              v_r3b := v_r3b || (v_arv.chave || ' / sub-select');
            else
              v_obtida := v_obtida || (v_arv.caso || ':r3b');
            end if;
          end if;
        elsif v_tipos[v_topo] = 'FUNCEXPR' and v_real[v_topo] then
          if v_arv.caso is null then
            v_chamadas := v_chamadas + 1;
            if v_linha[v_topo] then
              v_r1 := v_r1 || (v_arv.chave || ' / ' || (select pr.proname from pg_proc pr where pr.oid = v_func[v_topo]));
            elsif v_prof = 0 then
              v_r2 := v_r2 || (v_arv.chave || ' / ' || (select pr.proname from pg_proc pr where pr.oid = v_func[v_topo]));
            end if;
            if v_alvoarr[v_topo] and not v_retset[v_topo] then
              v_setof := v_setof || (v_arv.chave || ' / ' || (select pr.proname from pg_proc pr where pr.oid = v_func[v_topo]));
            end if;
          else
            if v_linha[v_topo] then
              v_obtida := v_obtida || (v_arv.caso || ':r1');
            elsif v_prof = 0 then
              v_obtida := v_obtida || (v_arv.caso || ':r2');
            end if;
            if v_alvoarr[v_topo] and not v_retset[v_topo] then
              v_obtida := v_obtida || (v_arv.caso || ':setof');
            end if;
          end if;
        elsif v_tipos[v_topo] = 'RANGETBLENTRY' and v_num1[v_topo] = 0 then
          if v_arv.caso is null then
            v_r3a := v_r3a || (v_arv.chave || ' / sub-select');
          else
            v_obtida := v_obtida || (v_arv.caso || ':r3a');
          end if;
        elsif v_tipos[v_topo] = 'QUERY' then
          v_prof := v_prof - 1;
        end if;
        v_tipos := v_tipos[1:v_topo - 1];
        v_func := v_func[1:v_topo - 1];
        v_real := v_real[1:v_topo - 1];
        v_retset := v_retset[1:v_topo - 1];
        v_alvoarr := v_alvoarr[1:v_topo - 1];
        v_linha := v_linha[1:v_topo - 1];
        v_num1 := v_num1[1:v_topo - 1];
        v_num2 := v_num2[1:v_topo - 1];
      elsif v_m[3] is not null then
        v_campo := v_m[3];
      else
        -- valor do campo anterior: só os que as regras usam
        v_tok := v_m[4];
        if v_campo is not null and v_topo > 0 then
          case v_tipos[v_topo]
            when 'VAR' then
              if v_campo = ':varno' then v_num1[v_topo] := v_tok::bigint;
              elsif v_campo = ':varlevelsup' then v_num2[v_topo] := v_tok::bigint;
              end if;
            when 'FUNCEXPR' then
              if v_campo = ':funcid' then v_func[v_topo] := v_tok::bigint;
              elsif v_campo = ':funcretset' then v_retset[v_topo] := (v_tok = 'true');
              elsif v_campo = ':funcformat' then v_real[v_topo] := v_tok in ('0', '3');
              end if;
            when 'SUBLINK' then
              if v_campo = ':subLinkType' then v_num1[v_topo] := v_tok::bigint;
              end if;
            when 'RANGETBLENTRY' then
              if v_campo = ':rtekind' then v_num1[v_topo] := v_tok::bigint;
              elsif v_campo = ':relid' then v_num2[v_topo] := v_tok::bigint;
              end if;
            else
              null;
          end case;
        end if;
        v_campo := null;
      end if;
    end loop;
    if coalesce(array_length(v_tipos, 1), 0) <> 0 then
      raise exception 'F59: árvore desbalanceada (sobrou pilha) em %', v_arv.chave;
    end if;
  end loop;
  -- [laço-da-árvore:fim]

  -- ---------------------------------------------------------------
  -- 10c — FALHA FECHADA: nenhum tipo de nó que o analisador não conhece.
  --     Um nó novo numa árvore de policy é um predicado que as regras abaixo não
  --     sabem julgar — reprovar é o que impede de passar por não ser entendido.
  -- ---------------------------------------------------------------
  select count(distinct x), coalesce(string_agg(distinct x, ', '), '')
    into v_cnt, v_lista
    from unnest(v_desc) as x;
  if pg_temp.assert_zero_de(
       '10c toda árvore de policy tem só nós que o analisador da doutrina lê' ||
       case when v_cnt > 0 then ' — nó desconhecido: ' || v_lista else '' end,
       v_cnt, v_nos::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 10d — A GUARDA DO PRÓPRIO ANALISADOR: as árvores sintéticas produzem EXATAMENTE
  --     os achados esperados, nos dois sentidos. Sem ela, um laço quebrado deixaria
  --     11a–14 verdes por vazio — o mesmo papel do "o casador sabe reprovar" das
  --     travas de mesa.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(d, ', ' order by d), '')
    into v_cnt, v_lista
    from (
      select 'não reprovou ' || e as d
        from unnest(k_guarda_esperada) as e
       where not (e = any (v_obtida))
      union all
      select distinct 'reprovou a mais ' || o
        from unnest(v_obtida) as o
       where not (o = any (k_guarda_esperada))
    ) as diferencas;
  -- o universo: os achados esperados mais até seis achados por árvore sintética quebrada
  if pg_temp.assert_zero_de(
       '10d o analisador de árvore sabe reprovar (' || v_casos || ' árvores sintéticas)' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, (array_length(k_guarda_esperada, 1) + 6 * v_casos)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 11a — R1: nenhuma função recebe dado da LINHA fora de `k_excecoes_predicado`.
  --     É esta que barra `using (public.e_membro(empresa_id))` na F66 — e o falso
  --     içamento `(select public.e_membro(empresa_id))`, que é a mesma coisa por linha.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_r1) x) as o
   where not (o.chave = any (k_excecoes_predicado));
  if pg_temp.assert_zero_de(
       '11a R1 nenhuma função recebe dado da linha fora da lista de exceções' ||
       case when v_cnt > 0 then ' — por linha (use col = any (array (select public.<fn>())) ou declare com motivo e destino): ' || v_lista else '' end,
       v_cnt, v_chamadas::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 11b — A CATRACA: toda exceção declarada ainda descreve uma ocorrência VIVA
  --     (R1 ou R3). Quem conserta a policy tira a linha; exceção não sobrevive ao
  --     motivo que a criou.
  -- ---------------------------------------------------------------
  v_vivas := array(
    select distinct x from unnest(v_r1 || v_r3a || v_r3b) x
  );
  if array_length(k_excecoes_predicado, 1) is null then
    v_ok := v_ok + 1;
    raise notice '✓ 11b a catraca da doutrina (lista de exceções vazia — nada a conferir)';
  else
    select count(*), coalesce(string_agg(e.chave, ', ' order by e.chave), '')
      into v_cnt, v_lista
      from unnest(k_excecoes_predicado) as e (chave)
     where not (e.chave = any (v_vivas));
    if pg_temp.assert_zero_de(
         '11b toda exceção da doutrina ainda descreve uma ocorrência viva' ||
         case when v_cnt > 0 then ' — sem ocorrência (tire a linha de k_excecoes_predicado): ' || v_lista else '' end,
         v_cnt, array_length(k_excecoes_predicado, 1)::bigint) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- 12 — R2: função que não recebe dado da linha só dentro de `(select …)`.
  --     Solta — `public.e_admin()`, ou `empresa_id = any (public.empresas_do_membro())`
  --     sem o `array (select …)`, o caso da 0103 que a 0107 consertou —, ela roda por
  --     linha. Sem exceção: não há motivo legítimo para uma função constante por linha.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_r2) x) as o;
  if pg_temp.assert_zero_de(
       '12 R2 nenhuma função sem dado da linha fora de (select …)' ||
       case when v_cnt > 0 then ' — solta(s): ' || v_lista else '' end,
       v_cnt, v_chamadas::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 13a/13b — R3: sub-select não lê tabela nem view (a leitura mora DENTRO da função
  --     de conjunto) e não olha a linha fora de argumento de função (a "junta com a
  --     linha" que a documentação da Supabase manda reescrever).
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_r3a) x) as o
   where not (o.chave = any (k_excecoes_predicado));
  if pg_temp.assert_zero_de(
       '13a R3 nenhum sub-select de policy lê tabela ou view' ||
       case when v_cnt > 0 then ' — lê relação: ' || v_lista else '' end,
       v_cnt, v_arvores::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_r3b) x) as o
   where not (o.chave = any (k_excecoes_predicado));
  if pg_temp.assert_zero_de(
       '13b R3 nenhum sub-select de policy olha a linha fora de argumento de função' ||
       case when v_cnt > 0 then ' — correlacionado: ' || v_lista else '' end,
       v_cnt, v_arvores::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 14 — R-SETOF: o alvo de `array (select public.<fn>())` devolve CONJUNTO.
  --     Com `→ uuid[]`, `array (select …)` monta um array de uma dimensão a mais e
  --     ERRA no conjunto vazio (`cannot accumulate empty arrays`) e no NULL — a
  --     leitura de todo membro sem empresa cairia com erro em vez de devolver vazio.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_setof) x) as o;
  if pg_temp.assert_zero_de(
       '14 alvo de array (select …) em policy é função que devolve conjunto' ||
       case when v_cnt > 0 then ' — não é setof: ' || v_lista else '' end,
       v_cnt, v_chamadas::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ===============================================================
  -- BLOCO 5 — A CHAVE DE RECORTE NO ACERVO, LOTE 1 (F63, 23/09/2026) — E NO LOTE 2 (F64, 15d a 15j)
  -- ===============================================================
  -- A F63 põe `empresa_id uuid not null default public.empresa_legada() references
  -- public.empresas (id)` nas oito tabelas de `k_lote1` (0160, 0161) — SEM update de backfill: o
  -- default não-volátil do PG 11+ preenche as linhas que já existem pelo catálogo. Este bloco é a
  -- trava que reprova a volta, e é por catálogo, sem ler uma linha:
  --   15a — `k_lote1` ⊆ `k_negocio`: a lista das oito sai da tabela-verdade de negócio.
  --   15b — cada tabela de `k_lote1` tem a coluna VISÍVEL, `uuid`, `not null`, FK VALIDADA para
  --         `public.empresas (id)` sobre ela sozinha, e default que é SÓ a chamada de
  --         `public.empresa_legada()` — conferido pelo `pg_depend` (a dependência do default
  --         na função), não pelo texto de `pg_get_expr`, que qualifica o nome conforme o
  --         `search_path`; e nenhuma com `force row level security`. O ✗ nomeia cada tabela e
  --         cada defeito. (Antes das migrations da F63 ela reprova pelos oito nomes — é a trava
  --         que nasceu vermelha, `docs/f63-evidencias/B-travas/`.)
  --   15c — DERIVADA DO CATÁLOGO: toda tabela de `k_negocio` que TEM a coluna obedece à mesma
  --         forma, esteja ou não em `k_lote1` (hoje `filiais`, desde a F62).
  -- As tabelas de `k_negocio` ainda SEM a coluna saíam num aviso de pendência nomeada da F64 —
  -- sem reprovar: eram as sete da ficha F64 e as quatro do vocabulário do import (fato 18). Desde a
  -- F64 (23/09/2026) o aviso é a asserção 15f, que REPROVA — e o lote 2 tem as suas (15d a 15j).
  -- O DEFAULT FICA ATÉ A F67 (decisão do Johnny, 23/09/2026): por isso 15b EXIGE o default, e a
  -- F67 inverte esta asserção no commit em que o tira.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_lote1) as nome
   where not (nome = any (k_negocio));
  if pg_temp.assert_zero_de(
       '15a todo nome do lote 1 (k_lote1) é tabela de NEGÓCIO (k_negocio)' ||
       case when v_cnt > 0 then ' — fora de k_negocio: ' || v_lista else '' end,
       v_cnt, array_length(k_lote1, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- Uma leitura só: o lote 1 inteiro MAIS toda tabela de negócio que já tem a coluna.
  with alvo as (
    select nome as tabela, to_regclass('public.' || nome) as rel, nome = any (k_lote1) as no_lote
      from unnest(k_negocio || k_lote1) as nome
     group by nome
  ), col as (
    select a.tabela, a.rel, a.no_lote, att.attnum, att.atttypid, att.attnotnull,
           (select d.oid from pg_attrdef d where d.adrelid = a.rel and d.adnum = att.attnum) as def_oid,
           (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d where d.adrelid = a.rel and d.adnum = att.attnum) as def_txt
      from alvo a
      left join pg_attribute att on att.attrelid = a.rel and att.attname = 'empresa_id' and not att.attisdropped
     where a.no_lote or att.attnum is not null
  )
  select coalesce(array_agg(c.tabela order by c.tabela), '{}'),
         coalesce(array_agg(concat_ws(', ',
           case when c.rel is null then 'a tabela não existe' end,
           case when c.rel is not null and c.attnum is null then 'sem a coluna empresa_id' end,
           case when c.attnum is not null and c.atttypid <> 'uuid'::regtype then 'empresa_id não é uuid' end,
           case when c.attnum is not null and not c.attnotnull then 'empresa_id aceita null' end,
           case when c.attnum is not null and not exists (
                  select 1 from pg_constraint k
                   where k.conrelid = c.rel and k.contype = 'f' and k.convalidated
                     and k.confrelid = 'public.empresas'::regclass and k.conkey = array[c.attnum])
                then 'sem FK VALIDADA para public.empresas (id)' end,
           case when c.attnum is not null and not (
                  c.def_oid is not null
                  and exists (select 1 from pg_depend dp
                               where dp.classid = 'pg_attrdef'::regclass and dp.objid = c.def_oid
                                 and dp.refclassid = 'pg_proc'::regclass
                                 and dp.refobjid = 'public.empresa_legada()'::regprocedure)
                  and c.def_txt ~ '^(public\.)?empresa_legada\(\)$')
                then 'default não é public.empresa_legada() (' || coalesce(c.def_txt, 'nenhum') || ')' end,
           case when c.rel is not null and (select k.relforcerowsecurity from pg_class k where k.oid = c.rel)
                then 'force row level security' end
         ) order by c.tabela), '{}'),
         coalesce(array_agg(c.no_lote order by c.tabela), '{}')
    into v_l1_tab, v_l1_def, v_l1_lote
    from col c;

  select count(*) filter (where d <> ''),
         coalesce(string_agg(t || ' (' || d || ')', '; ' order by t) filter (where d <> ''), '')
    into v_cnt, v_lista
    from unnest(v_l1_tab, v_l1_def, v_l1_lote) as x(t, d, l)
   where l;
  if pg_temp.assert_zero_de(
       '15b as oito do lote 1 têm empresa_id uuid not null, FK validada para empresas e default public.empresa_legada() (sem force)' ||
       case when v_cnt > 0 then ' — fora da forma: ' || v_lista else '' end,
       v_cnt, array_length(k_lote1, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), count(*) filter (where d <> ''),
         coalesce(string_agg(t || ' (' || d || ')', '; ' order by t) filter (where d <> ''), '')
    into v_univ, v_cnt, v_lista
    from unnest(v_l1_tab, v_l1_def, v_l1_lote) as x(t, d, l)
   where not l;
  if pg_temp.assert_zero_de(
       '15c toda tabela de negócio que TEM empresa_id (lida do catálogo) está na mesma forma' ||
       case when v_cnt > 0 then ' — fora da forma: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- BLOCO 5 (cont.) — O LOTE 2 (F64, 23/09/2026)
  -- ---------------------------------------------------------------
  -- A F64 põe a MESMA coluna, na MESMA forma, nas onze de `k_lote2` (0162, 0163) — sem update de
  -- backfill (e aqui nenhum gatilho barraria o update ingênuo: fato 7 da ordem; a prova de que não
  -- houve é o `xmin`, docs/f64-evidencias/impressao-vocabulario.sql). As asserções 15a/15b/15c
  -- acima ficam como a F63 as escreveu (o injetor as derruba pelo rótulo); o lote 2 ganha as suas:
  --   15d — `k_lote2` ⊆ `k_negocio`, disjunto de `k_lote1`, e os dois lotes com `filiais` são
  --         `k_negocio` INTEIRO (tabela de negócio nova sem lote reprova aqui);
  --   15e — cada uma das onze na forma de 15b (a coluna visível, `uuid`, `not null`, FK VALIDADA
  --         para `empresas (id)`, default que é SÓ `public.empresa_legada()` pelo `pg_depend`, sem
  --         force). O ✗ nomeia a tabela e o defeito. (Antes da 0162/0163 reprova pelos onze nomes —
  --         a trava que nasceu vermelha, docs/f64-evidencias/B-travas/.)
  --   15f — A PENDÊNCIA QUE ERA AVISO AGORA REPROVA: nenhuma tabela de `k_negocio` sem `empresa_id`.
  --         As que não levam a chave são as de `k_infra`, nomeadas e com o motivo escrito, e a
  --         asserção 1a já reprova tabela não classificada.
  --   15g/15h/15i — NINGUÉM LÊ `empresa_id` DO LOTE 2 ANTES DA F66 (decisão 7), pelo catálogo: a
  --         policy das onze não cita a coluna; a função de `public` que toca uma das DEZENOVE (os
  --         dois lotes — a régua da decisão 7 vale para as dezenove, como na trava de disco) não a
  --         lê, fora das exceções nominais de `k_leitura_integridade` — e NELAS, só no COMANDO que
  --         toca `k_tabelas_leitura_kit`, com a origem de cada `x.empresa_id` PROVADA no próprio
  --         comando (`_asserts.sql`); a view, idem. O corpo é lido pelo LÉXICO (`pg_temp.sql_so_codigo`:
  --         sem comentário, sem texto, sem dollar-quote — o `prosrc` guarda os comentários, e
  --         `apagar_usuario`, 0158, cita `eventos_admin` num comentário e lê `membros.empresa_id`,
  --         o que não é leitura do lote 2);
  --   15j — cada exceção nominal de `k_leitura_integridade` é uma função que EXISTE (a lista não
  --         guarda fantasma; antes da 0164 reprova por `kit_motivo_da_empresa`).
  -- O DEFAULT FICA ATÉ A F67 (decisão 1 do Johnny, 23/09/2026): 15e EXIGE o default, e a F67 a
  -- inverte junto com a 15b.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(x, '; ' order by x), '')
    into v_cnt, v_lista
    from (
      select nome || ' (do lote 2, fora de k_negocio)' as x from unnest(k_lote2) as nome where not (nome = any (k_negocio))
      union all
      select nome || ' (nos dois lotes)' from unnest(k_lote2) as nome where nome = any (k_lote1)
      union all
      select nome || ' (de negócio, sem lote)' from unnest(k_negocio) as nome
       where not (nome = any (k_lote1 || k_lote2 || array['filiais']))
    ) s;
  if pg_temp.assert_zero_de(
       '15d o lote 2 (k_lote2) é de NEGÓCIO, disjunto do lote 1, e os dois lotes com filiais são k_negocio inteiro' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, (array_length(k_lote2, 1) + array_length(k_negocio, 1))::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  with alvo as (
    select nome as tabela, to_regclass('public.' || nome) as rel
      from unnest(k_lote2) as nome
  ), col as (
    select a.tabela, a.rel, att.attnum, att.atttypid, att.attnotnull,
           (select d.oid from pg_attrdef d where d.adrelid = a.rel and d.adnum = att.attnum) as def_oid,
           (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d where d.adrelid = a.rel and d.adnum = att.attnum) as def_txt
      from alvo a
      left join pg_attribute att on att.attrelid = a.rel and att.attname = 'empresa_id' and not att.attisdropped
  )
  select coalesce(array_agg(c.tabela order by c.tabela), '{}'),
         coalesce(array_agg(concat_ws(', ',
           case when c.rel is null then 'a tabela não existe' end,
           case when c.rel is not null and c.attnum is null then 'sem a coluna empresa_id' end,
           case when c.attnum is not null and c.atttypid <> 'uuid'::regtype then 'empresa_id não é uuid' end,
           case when c.attnum is not null and not c.attnotnull then 'empresa_id aceita null' end,
           case when c.attnum is not null and not exists (
                  select 1 from pg_constraint k
                   where k.conrelid = c.rel and k.contype = 'f' and k.convalidated
                     and k.confrelid = 'public.empresas'::regclass and k.conkey = array[c.attnum])
                then 'sem FK VALIDADA para public.empresas (id)' end,
           case when c.attnum is not null and not (
                  c.def_oid is not null
                  and exists (select 1 from pg_depend dp
                               where dp.classid = 'pg_attrdef'::regclass and dp.objid = c.def_oid
                                 and dp.refclassid = 'pg_proc'::regclass
                                 and dp.refobjid = 'public.empresa_legada()'::regprocedure)
                  and c.def_txt ~ '^(public\.)?empresa_legada\(\)$')
                then 'default não é public.empresa_legada() (' || coalesce(c.def_txt, 'nenhum') || ')' end,
           case when c.rel is not null and (select k.relforcerowsecurity from pg_class k where k.oid = c.rel)
                then 'force row level security' end
         ) order by c.tabela), '{}')
    into v_l2_tab, v_l2_def
    from col c;

  select count(*) filter (where d <> ''),
         coalesce(string_agg(t || ' (' || d || ')', '; ' order by t) filter (where d <> ''), '')
    into v_cnt, v_lista
    from unnest(v_l2_tab, v_l2_def) as x(t, d);
  if pg_temp.assert_zero_de(
       '15e as onze do lote 2 têm empresa_id uuid not null, FK validada para empresas e default public.empresa_legada() (sem force)' ||
       case when v_cnt > 0 then ' — fora da forma: ' || v_lista else '' end,
       v_cnt, array_length(k_lote2, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_negocio) as nome
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = to_regclass('public.' || nome) and a.attname = 'empresa_id' and not a.attisdropped);
  if pg_temp.assert_zero_de(
       '15f toda tabela de NEGÓCIO tem empresa_id (a pendência da F64 reprova; a infra fica em k_infra, com o motivo)' ||
       case when v_cnt > 0 then ' — sem a coluna: ' || v_lista else '' end,
       v_cnt, array_length(k_negocio, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- 15g — APOSENTADA NA F66 (24/09/2026), e de propósito. Ela dizia "nenhuma policy das onze do lote 2 cita
  -- empresa_id (o recorte é da F66)" — e a F66 é exatamente a fase que faz o contrário. A verdade nova (toda policy de
  -- tabela com a coluna TEM de citá-la, no termo e com a função da classe) é a 16a do bloco 6, derivada do catálogo, e
  -- vale para as vinte e uma tabelas com a coluna, não só para as onze: duas fontes para o mesmo fato é como um gate
  -- morre (decisão 5 do PLAN-F66). O rótulo 15g não volta a ser usado.

  -- 15h — as funções de `public` que tocam uma das DEZENOVE (os dois lotes) não leem empresa_id —
  -- pelo predicado ÚNICO `pg_temp.leitura_de_empresa_do_lote` (`_asserts.sql`): o CÓDIGO do corpo
  -- pelo léxico do Postgres (sem comentário, sem texto, sem dollar-quote); fora das exceções
  -- nominais a função inteira reprova; NAS exceções, a leitura tem de ser PROVADAMENTE do kit, por
  -- comando (revisão adversarial da F64, duas rodadas). Os dois lotes, e não só o 2: a régua da
  -- decisão 7 vale para as dezenove, e o bloco 6 de `empresa_no_acervo.sql` (F63) isenta o núcleo
  -- pelo NOME inteiro — aqui ele responde por comando também nas oito. Universo: as funções cujo
  -- corpo cita uma das dezenove.
  -- F65: pelo despachante (as três exceções da F65 com as tabelas DELAS), e o universo conta também a função que é
  -- GATILHO numa das dezenove (ela lê a linha por `new`/`old` sem citar a tabela — o furo que a F65 fechou).
  with f as (
    select p.proname,
           p.prosrc ~* ('\m(' || array_to_string(k_lote1 || k_lote2, '|') || ')\M')
             or exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                         where t.tgfoid = p.oid and not t.tgisinternal and c.relname::text = any (k_lote1 || k_lote2)) as toca,
           pg_temp.leitura_de_empresa(p.proname, p.prosrc, k_lote1 || k_lote2, k_leitura_integridade, k_tabelas_leitura_kit,
                                      k_leitura_tenant) as le
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  )
  select count(*) filter (where f.toca),
         count(*) filter (where f.le is not null),
         coalesce(string_agg(f.le, '; ' order by f.proname) filter (where f.le is not null), '')
    into v_univ, v_cnt, v_lista
    from f;
  if pg_temp.assert_zero_de(
       '15h nenhuma função de public lê empresa_id junto de uma das dezenove dos lotes 1 e 2 (nas exceções nominais de k_leitura_integridade, só a leitura provada do kit, por comando)' ||
       case when v_cnt > 0 then ' — lê: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- 15i — nenhuma view de `public` lê empresa_id junto de uma das onze (universo: todas as views de
  -- `public` — nenhuma é construída sobre as onze no dia da F64, e universo vazio seria tautologia).
  select count(*),
         count(*) filter (where v.definition ~ ('\m(' || array_to_string(k_lote2, '|') || ')\M')
                            and v.definition ~ '\mempresa_id\M'),
         coalesce(string_agg(v.viewname, ', ')
                    filter (where v.definition ~ ('\m(' || array_to_string(k_lote2, '|') || ')\M')
                              and v.definition ~ '\mempresa_id\M'), '')
    into v_univ, v_cnt, v_lista
    from pg_views v
   where v.schemaname = 'public';
  if pg_temp.assert_zero_de(
       '15i nenhuma view de public lê empresa_id junto de uma das onze do lote 2' ||
       case when v_cnt > 0 then ' — lê: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_leitura_integridade) as nome
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = nome);
  if pg_temp.assert_zero_de(
       '15j toda exceção nominal de leitura (k_leitura_integridade) é uma função que existe' ||
       case when v_cnt > 0 then ' — não existe: ' || v_lista else '' end,
       v_cnt, array_length(k_leitura_integridade, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- 15k — F65: toda exceção de `k_leitura_tenant` é uma função que EXISTE e que LÊ `empresa_id` (a lista não guarda
  --        fantasma — o predicado SEM a exceção a acusaria), não é também exceção do kit, e as tabelas de
  --        `guarda_empresa` são exatamente as de `k_negocio` (onde ela é gatilho). Antes da 0173 reprova pelas duas
  --        funções que ainda não existem e pela diagonal que ainda não lê a coluna.
  select count(*), coalesce(string_agg(x, '; ' order by x), '')
    into v_cnt, v_lista
    from (
      select split_part(e, ':', 1) || ' (não existe)' as x
        from unnest(k_leitura_tenant) as e
       where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = split_part(e, ':', 1))
      union all
      select split_part(e, ':', 1) || ' (não lê empresa_id — exceção fantasma)'
        from unnest(k_leitura_tenant) as e
       where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = split_part(e, ':', 1))
         and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = split_part(e, ':', 1)
                            and pg_temp.leitura_de_empresa_do_lote(p.proname, p.prosrc, k_lote1 || k_lote2, array[]::text[], array[]::text[]) is not null)
      union all
      select split_part(e, ':', 1) || ' (também é exceção do kit)'
        from unnest(k_leitura_tenant) as e where split_part(e, ':', 1) = any (k_leitura_integridade)
      union all
      select 'guarda_empresa (as tabelas não são as de k_negocio)'
       where (select array_agg(t order by t) from unnest(string_to_array(
                (select split_part(e, ':', 2) from unnest(k_leitura_tenant) as e where split_part(e, ':', 1) = 'guarda_empresa'), ',')) as t)
             is distinct from (select array_agg(t order by t) from unnest(k_negocio) as t)
    ) s;
  if pg_temp.assert_zero_de(
       '15k toda exceção de leitura da F65 (k_leitura_tenant) é uma função que existe e LÊ empresa_id, fora das do kit; a guarda cobre as 20 de negócio' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, array_length(k_leitura_tenant, 1)::bigint + 1) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ===============================================================
  -- BLOCO 6 — O RECORTE DE EMPRESA NAS POLICIES (F66, 24/09/2026)
  --
  -- A F66 escreve o recorte de empresa nas policies de `public`, EM CONJUNÇÃO com o piso de hoje, na forma içada da
  -- doutrina: `empresa_id = any (array (select public.<fn>()))`, com a <fn> da CLASSE da policy (`k_recorte_classe`).
  -- A escrita por unidade passa à forma de PARES sobre `unidades_de_escrita()` (`k_recorte_unidade`). Este bloco é a
  -- trava que reprova a volta — e reprova, derivada do CATÁLOGO, a policy de tabela com a coluna que:
  --   16a — não cita o termo canônico da classe em cada árvore (USING quando tem, WITH CHECK quando tem), na
  --         CONJUNÇÃO de cima (um `or` com o termo dentro não conta), ou o cita com a função errada, ou não tem classe;
  --   16b — (a tabela-verdade) cita função que não existe;
  --   16c — é de escrita por unidade e não tem os pares em toda árvore — ou tem pares sem estar declarada;
  --   16d — (qualquer policy de public e storage) ainda chama `pode_escrever_filial`, pela dependência no catálogo;
  --   16e — está em tabela SEM a coluna e não é exceção nominal (`k_recorte_excecoes`) — nos dois sentidos;
  --   16f — (qualquer policy de public e storage) não é `to authenticated` (R-ACC-72, item 2);
  --   16g — a guarda do próprio analisador: árvores sintéticas produzem EXATAMENTE os achados esperados.
  --
  -- ⚠ A ÁRVORE, NÃO O TEXTO. O laço abaixo lê `pg_policy.polqual`/`polwithcheck` com a mesma tokenização do bloco 4 e
  -- monta, de baixo para cima, uma ASSINATURA de cada nó — o tipo, os campos que decidem (`opno`, `useOr`, `varattno`,
  -- `varlevelsup`, `funcid`, `funcretset`, `funcformat`, `subLinkType`, `boolop`, `rtekind`, `paramkind`, `paramid`) e
  -- as assinaturas dos filhos, em ordem. O termo canônico é a assinatura EXATA de `SCALARARRAYOPEXPR` com o operador
  -- `=(uuid,uuid)` e `useOr`, sobre `VAR` da coluna `empresa_id` DAQUELA tabela (`varlevelsup 0`) e `SUBLINK` tipo 6
  -- (`ARRAY(…)`) cujo sub-select é só `FUNCEXPR` de conjunto sem argumento — qualquer coisa a mais (um filtro, um
  -- `from`, outra coluna, a função solta sem o `array (select …)`) muda a assinatura e deixa de ser o termo. A
  -- conjunção de cima é a raiz, ou filho de `BOOLEXPR and` que também está na conjunção de cima.
  -- ⚠ A trava julga a FORMA e a CLASSE; o que o recorte AUTORIZA de fato é `isolamento_tenant.sql` (a bateria A↔B).
  -- ===============================================================
  v_op_uuid := '=(uuid,uuid)'::regoperator::oid;
  v_f_unid := 'public.unidades_de_escrita()'::regprocedure::oid;

  -- [laço-do-recorte:início]
  for v_rc in
    select n.nspname || '.' || c.relname || ' / ' || p.polname as chave, a.tipo, a.arvore, null::text as caso,
           (select att.attnum from pg_attribute att
             where att.attrelid = c.oid and att.attname = 'empresa_id' and not att.attisdropped) as attno
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral (values ('using', p.polqual::text), ('with check', p.polwithcheck::text)) as a (tipo, arvore)
     where n.nspname = 'public' and a.arvore is not null
    union all
    select '(árvore sintética ' || s.caso || ')', 'using', s.arvore, s.caso, 99::int2
      from (values
        ('recorte-canonico', format(
           '{SCALARARRAYOPEXPR :opno %s :opfuncid 2956 :useOr true :args ({VAR :varno 1 :varattno 99 :varlevelsup 0} '
           '{SUBLINK :subLinkType 6 :testexpr <> :subselect {QUERY :rtable <> :jointree {FROMEXPR :fromlist <> :quals <>} '
           ':targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>} :resno 1})}})}',
           v_op_uuid, 'public.empresas_do_membro()'::regprocedure::oid)),
        ('recorte-em-and', format(
           '{BOOLEXPR :boolop and :args ({CONST :consttype 16} {SCALARARRAYOPEXPR :opno %s :opfuncid 2956 :useOr true '
           ':args ({VAR :varno 1 :varattno 99 :varlevelsup 0} {SUBLINK :subLinkType 6 :testexpr <> :subselect {QUERY '
           ':rtable <> :jointree {FROMEXPR :fromlist <> :quals <>} :targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s '
           ':funcretset true :funcformat 0 :args <>} :resno 1})}})})}',
           v_op_uuid, 'public.empresas_do_membro()'::regprocedure::oid)),
        ('recorte-em-or', format(
           '{BOOLEXPR :boolop or :args ({CONST :consttype 16} {SCALARARRAYOPEXPR :opno %s :opfuncid 2956 :useOr true '
           ':args ({VAR :varno 1 :varattno 99 :varlevelsup 0} {SUBLINK :subLinkType 6 :testexpr <> :subselect {QUERY '
           ':rtable <> :jointree {FROMEXPR :fromlist <> :quals <>} :targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s '
           ':funcretset true :funcformat 0 :args <>} :resno 1})}})})}',
           v_op_uuid, 'public.empresas_do_membro()'::regprocedure::oid)),
        ('recorte-sem-array', format(
           '{SCALARARRAYOPEXPR :opno %s :opfuncid 2956 :useOr true :args ({VAR :varno 1 :varattno 99 :varlevelsup 0} '
           '{FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>})}',
           v_op_uuid, 'public.empresas_do_membro()'::regprocedure::oid)),
        ('recorte-outra-coluna', format(
           '{SCALARARRAYOPEXPR :opno %s :opfuncid 2956 :useOr true :args ({VAR :varno 1 :varattno 98 :varlevelsup 0} '
           '{SUBLINK :subLinkType 6 :testexpr <> :subselect {QUERY :rtable <> :jointree {FROMEXPR :fromlist <> :quals <>} '
           ':targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>} :resno 1})}})}',
           v_op_uuid, 'public.empresas_do_membro()'::regprocedure::oid)),
        ('recorte-com-filtro', format(
           '{SCALARARRAYOPEXPR :opno %s :opfuncid 2956 :useOr true :args ({VAR :varno 1 :varattno 99 :varlevelsup 0} '
           '{SUBLINK :subLinkType 6 :testexpr <> :subselect {QUERY :rtable <> :jointree {FROMEXPR :fromlist <> '
           ':quals {CONST :consttype 16}} :targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s :funcretset true '
           ':funcformat 0 :args <>} :resno 1})}})}',
           v_op_uuid, 'public.empresas_do_membro()'::regprocedure::oid)),
        ('pares', format(
           '{SUBLINK :subLinkType 2 :testexpr {BOOLEXPR :boolop and :args ({OPEXPR :opno %s :args ({VAR :varno 1 '
           ':varattno 99 :varlevelsup 0} {PARAM :paramkind 2 :paramid 1})} {OPEXPR :opno 94 :args ({VAR :varno 1 '
           ':varattno 6 :varlevelsup 0} {PARAM :paramkind 2 :paramid 2})})} :subselect {QUERY :rtable ({RANGETBLENTRY '
           ':alias {ALIAS :aliasname u} :eref {ALIAS :aliasname u} :rtekind 3 :functions ({RANGETBLFUNCTION :funcexpr '
           '{FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>}})}) :jointree {FROMEXPR :fromlist '
           '({RANGETBLREF :rtindex 1}) :quals <>} :targetList ({TARGETENTRY :expr {VAR :varno 1 :varattno 1 '
           ':varlevelsup 0}} {TARGETENTRY :expr {VAR :varno 1 :varattno 2 :varlevelsup 0}})}}',
           v_op_uuid, v_f_unid)),
        ('pares-em-or', format(
           '{BOOLEXPR :boolop or :args ({CONST :consttype 16} {SUBLINK :subLinkType 2 :testexpr {BOOLEXPR :boolop and '
           ':args ({OPEXPR :opno %s :args ({VAR :varno 1 :varattno 99 :varlevelsup 0} {PARAM :paramkind 2 :paramid 1})} '
           '{OPEXPR :opno 94 :args ({VAR :varno 1 :varattno 6 :varlevelsup 0} {PARAM :paramkind 2 :paramid 2})})} '
           ':subselect {QUERY :rtable ({RANGETBLENTRY :alias {ALIAS :aliasname u} :eref {ALIAS :aliasname u} :rtekind 3 '
           ':functions ({RANGETBLFUNCTION :funcexpr {FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>}})}) '
           ':jointree {FROMEXPR :fromlist ({RANGETBLREF :rtindex 1}) :quals <>} :targetList ({TARGETENTRY :expr {VAR '
           ':varno 1 :varattno 1 :varlevelsup 0}} {TARGETENTRY :expr {VAR :varno 1 :varattno 2 :varlevelsup 0}})}})}',
           v_op_uuid, v_f_unid))
      ) as s (caso, arvore)
  loop
    if v_rc.caso is not null then
      v_rr_casos := v_rr_casos + 1;
    end if;
    v_rc_tipos := '{}'; v_rc_campos := '{}'; v_rc_filhos := '{}'; v_rc_conj := '{}'; v_rc_bool := '{}';
    v_rc_canon := '{}'; v_rc_fora := 0; v_rc_pc := 0; v_rc_pt := 0; v_rc_funcs := '{}'; v_rc_campo := null;
    -- as duas assinaturas, com a coluna `empresa_id` DESTA tabela (sem a coluna, -1: nada casa)
    v_re_canon := format('^SCALARARRAYOPEXPR\{opno=%s;useOr=true\}\[VAR\{varno=1;varattno=%s;varlevelsup=0\}\[\]'
                         'SUBLINK\{subLinkType=6\}\[QUERY\{\}\[FROMEXPR\{\}\[\]TARGETENTRY\{\}\['
                         'FUNCEXPR\{funcid=(\d+);funcretset=true;funcformat=0\}\[\]\]\]\]\]$',
                         v_op_uuid, coalesce(v_rc.attno, -1));
    v_re_pares := format('^SUBLINK\{subLinkType=2\}\[BOOLEXPR\{boolop=and\}\[OPEXPR\{opno=%s\}\['
                         'VAR\{varno=1;varattno=%s;varlevelsup=0\}\[\]PARAM\{paramkind=2;paramid=1\}\[\]\]'
                         'OPEXPR\{opno=\d+\}\[.*PARAM\{paramkind=2;paramid=2\}\[\]\]\]QUERY\{\}\['
                         'RANGETBLENTRY\{rtekind=3\}\[ALIAS\{\}\[\]ALIAS\{\}\[\]RANGETBLFUNCTION\{\}\['
                         'FUNCEXPR\{funcid=%s;funcretset=true;funcformat=0\}\[\]\]\]FROMEXPR\{\}\[RANGETBLREF\{\}\[\]\]'
                         'TARGETENTRY\{\}\[VAR\{varno=1;varattno=1;varlevelsup=0\}\[\]\]'
                         'TARGETENTRY\{\}\[VAR\{varno=1;varattno=2;varlevelsup=0\}\[\]\]\]\]$',
                         v_op_uuid, coalesce(v_rc.attno, -1), v_f_unid);
    -- um token por casamento: [1] abre nó · [2] fecha nó · [3] nome de campo · [4] valor (a regex do bloco 4)
    for v_m in
      select t.m
        from regexp_matches(v_rc.arvore,
               '(\{[A-Z_]+)|(\})|(:[A-Za-z_]+)|("(?:[^"\\]|\\.)*"|(?:[^\s{}()\[\]"\\]|\\.)+)', 'g')
             with ordinality as t (m, i)
       order by t.i
    loop
      v_rc_topo := coalesce(array_length(v_rc_tipos, 1), 0);
      if v_m[1] is not null then
        -- abre nó: está na conjunção de cima se é a raiz, ou filho de BOOLEXPR and que está nela
        v_rc_conj := v_rc_conj || (v_rc_topo = 0 or (v_rc_tipos[v_rc_topo] = 'BOOLEXPR'
                                                     and v_rc_bool[v_rc_topo] = 'and' and v_rc_conj[v_rc_topo]));
        v_rc_tipos := v_rc_tipos || ltrim(v_m[1], '{');
        v_rc_campos := v_rc_campos || ''::text;
        v_rc_filhos := v_rc_filhos || ''::text;
        v_rc_bool := v_rc_bool || null::text;
      elsif v_m[2] is not null then
        -- fecha nó: a assinatura dele, e ela sobe para o pai
        if v_rc_topo = 0 then
          raise exception 'F66: árvore desbalanceada em %', v_rc.chave;
        end if;
        v_rc_sig := v_rc_tipos[v_rc_topo] || '{' || rtrim(v_rc_campos[v_rc_topo], ';') || '}['
                    || v_rc_filhos[v_rc_topo] || ']';
        if v_rc_sig ~ v_re_canon then
          if v_rc_conj[v_rc_topo] then
            v_rc_canon := v_rc_canon || (select pr.proname::text from pg_proc pr
                                          where pr.oid = substring(v_rc_sig from v_re_canon)::oid);
          else
            v_rc_fora := v_rc_fora + 1;
          end if;
        elsif v_rc_sig ~ v_re_pares then
          v_rc_pt := v_rc_pt + 1;
          if v_rc_conj[v_rc_topo] then
            v_rc_pc := v_rc_pc + 1;
          end if;
        end if;
        if v_rc_topo > 1 then
          v_rc_filhos[v_rc_topo - 1] := v_rc_filhos[v_rc_topo - 1] || v_rc_sig;
        end if;
        v_rc_tipos := v_rc_tipos[1:v_rc_topo - 1];
        v_rc_campos := v_rc_campos[1:v_rc_topo - 1];
        v_rc_filhos := v_rc_filhos[1:v_rc_topo - 1];
        v_rc_conj := v_rc_conj[1:v_rc_topo - 1];
        v_rc_bool := v_rc_bool[1:v_rc_topo - 1];
      elsif v_m[3] is not null then
        v_rc_campo := v_m[3];
      else
        -- valor do campo anterior: só os que decidem entram na assinatura
        if v_rc_campo is not null and v_rc_topo > 0 then
          if (v_rc_tipos[v_rc_topo], v_rc_campo) in (
               ('VAR', ':varno'), ('VAR', ':varattno'), ('VAR', ':varlevelsup'),
               ('FUNCEXPR', ':funcid'), ('FUNCEXPR', ':funcretset'), ('FUNCEXPR', ':funcformat'),
               ('SCALARARRAYOPEXPR', ':opno'), ('SCALARARRAYOPEXPR', ':useOr'), ('OPEXPR', ':opno'),
               ('SUBLINK', ':subLinkType'), ('BOOLEXPR', ':boolop'), ('RANGETBLENTRY', ':rtekind'),
               ('PARAM', ':paramkind'), ('PARAM', ':paramid')) then
            v_rc_campos[v_rc_topo] := v_rc_campos[v_rc_topo] || ltrim(v_rc_campo, ':') || '=' || v_m[4] || ';';
          end if;
          if v_rc_tipos[v_rc_topo] = 'BOOLEXPR' and v_rc_campo = ':boolop' then
            v_rc_bool[v_rc_topo] := v_m[4];
          end if;
          if v_rc_tipos[v_rc_topo] = 'FUNCEXPR' and v_rc_campo = ':funcid' then
            v_rc_funcs := v_rc_funcs || v_m[4]::bigint;
          end if;
        end if;
        v_rc_campo := null;
      end if;
    end loop;
    if coalesce(array_length(v_rc_tipos, 1), 0) <> 0 then
      raise exception 'F66: árvore desbalanceada (sobrou pilha) em %', v_rc.chave;
    end if;
    if v_rc.caso is null then
      v_rr_chave := v_rr_chave || v_rc.chave;
      v_rr_tipo := v_rr_tipo || v_rc.tipo;
      v_rr_coluna := v_rr_coluna || (v_rc.attno is not null);
      v_rr_canon := v_rr_canon || array_to_string(v_rc_canon, ',');
      v_rr_fora := v_rr_fora || v_rc_fora;
      v_rr_pc := v_rr_pc || v_rc_pc;
      v_rr_pt := v_rr_pt || v_rc_pt;
      v_rr_funcs := v_rr_funcs || coalesce((select string_agg(distinct pr.proname::text, ',')
                                              from pg_proc pr where pr.oid = any (v_rc_funcs::oid[])), '');
    else
      v_rc_obtida := v_rc_obtida
                     || array(select v_rc.caso || ':termo:' || x from unnest(v_rc_canon) as x)
                     || case when v_rc_fora > 0 then array[v_rc.caso || ':fora'] else '{}'::text[] end
                     || case when v_rc_pc > 0 then array[v_rc.caso || ':pares'] else '{}'::text[] end
                     || case when v_rc_pt > v_rc_pc then array[v_rc.caso || ':pares-fora'] else '{}'::text[] end;
    end if;
  end loop;
  -- [laço-do-recorte:fim]

  -- ---------------------------------------------------------------
  -- 16a — toda policy de `public` em tabela COM `empresa_id` (lida do catálogo) cita, em cada árvore, o termo canônico
  --       da CLASSE dela na conjunção de cima. O ✗ nomeia a policy, a árvore e o defeito.
  -- ---------------------------------------------------------------
  with arv as (
    select * from unnest(v_rr_chave, v_rr_tipo, v_rr_coluna, v_rr_canon, v_rr_fora, v_rr_funcs)
      as x (chave, tipo, coluna, canon, fora, funcs)
  ), pol as (
    select a.chave, string_to_array(string_agg(a.funcs, ','), ',') as funcs from arv a group by a.chave
  ), classe as (
    select p.chave,
           (select split_part(k.e, ':', 2) from unnest(k_recorte_classe) with ordinality as k (e, i)
             where split_part(k.e, ':', 1) = any (p.funcs) order by k.i limit 1) as fn
      from pol p
  ), julgado as (
    select a.chave, a.tipo,
           case
             when c.fn is null then 'sem classe na tabela-verdade (k_recorte_classe)'
             when a.canon = '' and a.fora > 0 then 'o termo está fora da conjunção de cima (num or)'
             when a.canon = '' then 'sem o termo empresa_id = any (array (select public.' || c.fn || '()))'
             when not (c.fn = any (string_to_array(a.canon, ','))) then
               'função errada: ' || a.canon || ' (a classe pede ' || c.fn || ')'
             when exists (select 1 from unnest(string_to_array(a.canon, ',')) as f where f <> c.fn) then
               'função a mais: ' || a.canon || ' (a classe pede só ' || c.fn || ')'
           end as defeito
      from arv a join classe c on c.chave = a.chave
     where a.coluna
  )
  select count(*), count(*) filter (where j.defeito is not null),
         coalesce(string_agg(j.chave || ' (' || j.tipo || '): ' || j.defeito, '; ' order by j.chave, j.tipo)
                    filter (where j.defeito is not null), '')
    into v_univ, v_cnt, v_lista
    from julgado j;
  if pg_temp.assert_zero_de(
       '16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 16b — a tabela-verdade não guarda fantasma: toda função de `k_recorte_classe` (os dois lados) existe em public.
  -- ---------------------------------------------------------------
  select count(*), count(*) filter (where not exists (
           select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
            where n.nspname = 'public' and pr.proname = s.nome)),
         coalesce(string_agg(s.nome, ', ') filter (where not exists (
           select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
            where n.nspname = 'public' and pr.proname = s.nome)), '')
    into v_univ, v_cnt, v_lista
    from (select distinct x as nome
            from unnest(k_recorte_classe) as e, unnest(array[split_part(e, ':', 1), split_part(e, ':', 2)]) as x) as s;
  if pg_temp.assert_zero_de(
       '16b toda função da tabela-verdade do recorte (k_recorte_classe) existe em public' ||
       case when v_cnt > 0 then ' — não existe: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 16c — A FORMA DE PARES, nos dois sentidos: cada policy de `k_recorte_unidade` tem, em TODA árvore, exatamente os
  --       pares declarados na conjunção de cima (e nenhum fora dela); e toda policy com pares está na lista.
  -- ---------------------------------------------------------------
  with arv as (
    select * from unnest(v_rr_chave, v_rr_tipo, v_rr_pc, v_rr_pt) as x (chave, tipo, pc, pt)
  ), lista as (
    select split_part(e, ':', 1) as chave, split_part(e, ':', 2)::int as n from unnest(k_recorte_unidade) as e
  )
  select (select count(*) from arv), count(*), coalesce(string_agg(s.d, '; ' order by s.d), '')
    into v_univ, v_cnt, v_lista
    from (
      select l.chave || ' (' || a.tipo || '): ' || a.pc || ' par(es) na conjunção e ' || (a.pt - a.pc)
             || ' fora dela, a lista declara ' || l.n as d
        from lista l join arv a on a.chave = l.chave
       where a.pc <> l.n or a.pt <> a.pc
      union all
      select l.chave || ': não é policy viva' from lista l where not exists (select 1 from arv a where a.chave = l.chave)
      union all
      select distinct a.chave || ': tem pares e não está em k_recorte_unidade'
        from arv a where a.pt > 0 and not exists (select 1 from lista l where l.chave = a.chave)
    ) as s;
  if pg_temp.assert_zero_de(
       '16c as policies de escrita por unidade (k_recorte_unidade) têm os pares sobre unidades_de_escrita() em toda árvore, na conjunção de cima, e só elas' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 16d — nenhuma policy de public ou storage chama `pode_escrever_filial` (a dependência que o Postgres registra
  --       da policy na função — sem ler texto). A regra por linha virou os pares; a função fica para o corpo das RPCs.
  -- ---------------------------------------------------------------
  select count(*),
         count(*) filter (where exists (
           select 1 from pg_depend d
            where d.classid = 'pg_policy'::regclass and d.objid = p.oid
              and d.refclassid = 'pg_proc'::regclass
              and d.refobjid = 'public.pode_escrever_filial(smallint)'::regprocedure)),
         coalesce(string_agg(n.nspname || '.' || c.relname || ' / ' || p.polname, ', ') filter (where exists (
           select 1 from pg_depend d
            where d.classid = 'pg_policy'::regclass and d.objid = p.oid
              and d.refclassid = 'pg_proc'::regclass
              and d.refobjid = 'public.pode_escrever_filial(smallint)'::regprocedure)), '')
    into v_univ, v_cnt, v_lista
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'storage');
  if pg_temp.assert_zero_de(
       '16d nenhuma policy de public ou storage chama pode_escrever_filial (a escrita por unidade é a forma de pares)' ||
       case when v_cnt > 0 then ' — chama: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 16e — AS EXCEÇÕES NOMINAIS DO RECORTE, nos dois sentidos: policy de public em tabela SEM `empresa_id` só se estiver
  --       em `k_recorte_excecoes`; e toda entrada é policy viva numa tabela que continua sem a coluna.
  -- ---------------------------------------------------------------
  with pol as (
    select n.nspname || '.' || c.relname || ' / ' || p.polname as chave,
           exists (select 1 from pg_attribute att
                    where att.attrelid = c.oid and att.attname = 'empresa_id' and not att.attisdropped) as coluna
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
  )
  select (select count(*) from pol) + array_length(k_recorte_excecoes, 1), count(*),
         coalesce(string_agg(s.d, '; ' order by s.d), '')
    into v_univ, v_cnt, v_lista
    from (
      select pol.chave || ' (em tabela sem empresa_id e fora de k_recorte_excecoes)' as d
        from pol where not pol.coluna and not (pol.chave = any (k_recorte_excecoes))
      union all
      select e || ' (exceção sem policy viva em tabela sem a coluna — tire a linha)'
        from unnest(k_recorte_excecoes) as e
       where not exists (select 1 from pol where pol.chave = e and not pol.coluna)
    ) as s;
  if pg_temp.assert_zero_de(
       '16e toda policy de public em tabela sem empresa_id é exceção nominal (k_recorte_excecoes), e toda exceção ainda descreve o banco' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 16f — `to authenticated` em TODA policy de public e de storage.objects (R-ACC-72, item 2): sem ele a policy é
  --       avaliada também para `anon` (a documentação da Supabase: o `TO` sozinho elimina o custo para quem não é o
  --       papel). Nasceu verde (fato 4 da ordem F66); a prova de que sabe ficar vermelha é a sabotagem B.
  -- ---------------------------------------------------------------
  select count(*),
         count(*) filter (where p.polroles is distinct from array['authenticated'::regrole::oid]),
         coalesce(string_agg(n.nspname || '.' || c.relname || ' / ' || p.polname, ', ')
                    filter (where p.polroles is distinct from array['authenticated'::regrole::oid]), '')
    into v_univ, v_cnt, v_lista
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'storage');
  if pg_temp.assert_zero_de(
       '16f toda policy de public e storage é to authenticated (e só authenticated)' ||
       case when v_cnt > 0 then ' — outro papel: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 16g — A GUARDA DO ANALISADOR DO RECORTE: as árvores sintéticas produzem EXATAMENTE os achados esperados, nos dois
  --       sentidos. Sem ela, um laço quebrado deixaria 16a/16c verdes por não reconhecer termo nenhum — ou reprovaria
  --       tudo por reconhecer o que não é termo.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(d, ', ' order by d), '')
    into v_cnt, v_lista
    from (
      select 'não achou ' || e as d from unnest(k_recorte_guarda_esperada) as e where not (e = any (v_rc_obtida))
      union all
      select distinct 'achou a mais ' || o from unnest(v_rc_obtida) as o where not (o = any (k_recorte_guarda_esperada))
    ) as diferencas;
  if pg_temp.assert_zero_de(
       '16g o analisador do recorte reconhece o termo e os pares só onde eles estão (' || v_rr_casos || ' árvores sintéticas)' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, (array_length(k_recorte_guarda_esperada, 1) + 4 * v_rr_casos)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  raise notice 'FIM catalogo_policies: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

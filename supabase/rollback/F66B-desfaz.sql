-- =============================================================================
-- F66B-desfaz.sql — o ROLLBACK da F66B (docs/PLAN-F66B.md, decisão 14)
-- =============================================================================
-- Desfaz as quatro migrations da F66B NA ORDEM INVERSA DO APPLY: 0184 → 0183 → 0182 → 0181. Cada CHECK de comprimento
-- `<tabela>_<coluna>_tamanho` (e o alternativo `unidades_apelidos_apelido_bruto_tamanho`) sai por `drop constraint if
-- exists` LITERAL, pelo nome — gerado da fonte única (src/lib/validators/tetos-coluna.ts) e conferido contra ela pela
-- trava de mesa `rollback-f66b.test.ts`, nunca transcrito à mão. Dentro de cada migration as tabelas saem na ordem
-- INVERSA da do apply. As constraints de comprimento ANTERIORES à F66B (`anotacao_texto_len` da 0017,
-- `unidades_apelidos_apelido_tamanho` da 0139) ficam: não são desta fase.
--
-- O QUE VOLTA: o esquema de antes da 0181 — a defesa contra o texto longo volta a ser só o Zod de cada tela. NENHUM DADO
-- SE PERDE: `drop constraint` é catálogo, não toca linha. Nenhuma tupla reescrita.
--
-- IDEMPOTENTE EM QUALQUER ESTADO: `if exists` serve ao apply PARCIAL (parado entre dois lotes), ao arquivo rodado duas
-- vezes e ao banco sem a F66B. Cada `alter table` toma ACCESS EXCLUSIVE na tabela até o fim da transação; por isso o
-- `lock_timeout` de 2 s: sem o lock, o rollback falha inteiro e se repete (no máximo três vezes em 30 min), nunca espera
-- o app.
--
-- ENTRE FASES: os rollbacks da F65, F64 e F63 EXIGEM este antes (medido na mesa e no CI: a impressão que eles comparam
-- inclui toda constraint das tabelas, e os CHECK da F66B a mudariam); o da F62 o roda antes também, pela ordem inversa
-- entre fases (regra 10 da §4). O da F66 não depende dele (policy não cita CHECK). Os roteiros f62/f63/f64/f65_rollback.sql
-- rodam este arquivo antes dos deles.
--
-- Num banco vivo: o `execute_sql` do conector com o conteúdo EXATO deste arquivo, que o CI ensaia
-- (supabase/tests/f66b_rollback.sql — a impressão das CHECK de public volta à de antes da 0181). O ledger fica.
-- Sem `begin`/`commit` próprios: quem roda decide a transação.
-- =============================================================================

set lock_timeout = '2s';

-- 1. (0184) 0184_comprimento_registros.sql
alter table public.senhas_acesso
  drop constraint if exists senhas_acesso_rotulo_tamanho,
  drop constraint if exists senhas_acesso_hash_tamanho;

alter table public.eventos_admin
  drop constraint if exists eventos_admin_acao_tamanho,
  drop constraint if exists eventos_admin_alvo_tamanho;

alter table public.import_logs
  drop constraint if exists import_logs_modo_tamanho,
  drop constraint if exists import_logs_arquivo_hash_tamanho,
  drop constraint if exists import_logs_backup_path_tamanho;

alter table public.relatorios_gerados
  drop constraint if exists relatorios_gerados_observacao_tamanho;

-- 2. (0183) 0183_comprimento_vocabulario.sql
alter table public.filiais
  drop constraint if exists filiais_slug_tamanho,
  drop constraint if exists filiais_nome_tamanho,
  drop constraint if exists filiais_cidade_tamanho;

alter table public.kits_modelos
  drop constraint if exists kits_modelos_nome_tamanho;

alter table public.motivos
  drop constraint if exists motivos_codigo_tamanho,
  drop constraint if exists motivos_rotulo_tamanho;

alter table public.tipos_item
  drop constraint if exists tipos_item_slug_tamanho,
  drop constraint if exists tipos_item_rotulo_tamanho;

alter table public.unidades_apelidos
  drop constraint if exists unidades_apelidos_apelido_bruto_tamanho,
  drop constraint if exists unidades_apelidos_apelido_chave_tamanho;

alter table public.import_termos_estado
  drop constraint if exists import_termos_estado_termo_tamanho,
  drop constraint if exists import_termos_estado_rotulo_tamanho;

alter table public.import_termos_categoria
  drop constraint if exists import_termos_categoria_termo_tamanho,
  drop constraint if exists import_termos_categoria_rotulo_tamanho;

alter table public.import_prefixos_patrimonio
  drop constraint if exists import_prefixos_patrimonio_prefixo_tamanho;

-- 3. (0182) 0182_comprimento_movimento_do_acervo.sql
alter table public.lancamentos_item
  drop constraint if exists lancamentos_item_chamado_tamanho,
  drop constraint if exists lancamentos_item_colaborador_tamanho,
  drop constraint if exists lancamentos_item_observacao_tamanho;

alter table public.pendencias_item
  drop constraint if exists pendencias_item_item_tamanho,
  drop constraint if exists pendencias_item_colaborador_tamanho,
  drop constraint if exists pendencias_item_status_tamanho,
  drop constraint if exists pendencias_item_desfecho_tamanho,
  drop constraint if exists pendencias_item_observacao_tamanho;

alter table public.movimentacoes
  drop constraint if exists movimentacoes_motivo_tamanho,
  drop constraint if exists movimentacoes_colaborador_tamanho,
  drop constraint if exists movimentacoes_setor_tamanho,
  drop constraint if exists movimentacoes_chamado_tamanho,
  drop constraint if exists movimentacoes_observacao_tamanho,
  drop constraint if exists movimentacoes_chamado_fornecedor_tamanho;

alter table public.ativos
  drop constraint if exists ativos_patrimonio_tamanho,
  drop constraint if exists ativos_patrimonio_original_tamanho,
  drop constraint if exists ativos_marca_tamanho,
  drop constraint if exists ativos_modelo_tamanho,
  drop constraint if exists ativos_service_tag_tamanho,
  drop constraint if exists ativos_hostname_tamanho,
  drop constraint if exists ativos_memoria_tamanho,
  drop constraint if exists ativos_armazenamento_tamanho,
  drop constraint if exists ativos_processador_tamanho,
  drop constraint if exists ativos_fornecedor_tamanho,
  drop constraint if exists ativos_colaborador_atual_tamanho,
  drop constraint if exists ativos_setor_atual_tamanho,
  drop constraint if exists ativos_pendencia_tamanho,
  drop constraint if exists ativos_origem_tamanho,
  drop constraint if exists ativos_observacoes_tamanho,
  drop constraint if exists ativos_telefone_tamanho,
  drop constraint if exists ativos_imei_tamanho,
  drop constraint if exists ativos_pulsus_tamanho;

-- 4. (0181) 0181_comprimento_cadastros_do_acervo.sql
alter table public.anotacoes
  drop constraint if exists anotacoes_texto_tamanho;

alter table public.termos_gerados
  drop constraint if exists termos_gerados_tipo_tamanho,
  drop constraint if exists termos_gerados_colaborador_tamanho,
  drop constraint if exists termos_gerados_arquivo_path_tamanho;

alter table public.itens
  drop constraint if exists itens_nome_tamanho,
  drop constraint if exists itens_nome_chave_tamanho;

alter table public.colaboradores
  drop constraint if exists colaboradores_nome_tamanho,
  drop constraint if exists colaboradores_matricula_tamanho,
  drop constraint if exists colaboradores_setor_tamanho,
  drop constraint if exists colaboradores_nome_chave_tamanho;

reset lock_timeout;

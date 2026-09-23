# Censo da cadeia pelo classificador — 157 migrations

Por veredito: ADITIVA 139 · BACKFILL 11 · DESTRUTIVA 2 · ILEGÍVEL 5

| arquivo | declarada | calculada | veredito | por quê (escrita em tabela que já existia) | ilegível / válvula |
|---|---|---|---|---|---|
| `0007_seeds_fixos.sql` | — | BACKFILL | BACKFILL | insert em public.filiais; insert em public.motivos | — |
| `0021_termos_gerados.sql` | — | BACKFILL | BACKFILL | insert em storage.buckets | — |
| `0026_filial_serra.sql` | — | BACKFILL | BACKFILL | update em public.filiais; insert em public.filiais | — |
| `0031_import_logs.sql` | — | BACKFILL | BACKFILL | insert em storage.buckets | — |
| `0039_drop_backups_orfaos.sql` | — | DESTRUTIVA | DESTRUTIVA | drop table; drop table | — |
| `0053_pendencias_item_backfill.sql` | — | BACKFILL | BACKFILL | insert em public.pendencias_item; update em public.ativos | — |
| `0057_perfil_nome_sobrenome.sql` | — | ADITIVA | ILEGÍVEL | — | add column nome: coluna gerada STORED reescreve a tabela |
| `0058_drop_backup_f18.sql` | — | DESTRUTIVA | DESTRUTIVA | drop table | — |
| `0061_papeis_estrutura.sql` | — | BACKFILL | BACKFILL | update em public.profiles | — |
| `0076_promover_dev.sql` | — | BACKFILL | BACKFILL | update em public.profiles (dentro de do) | — |
| `0102_filial_cidade.sql` | — | BACKFILL | BACKFILL | update em public.filiais; update em public.filiais; update em public.filiais; update em public.filiais; update em public.filiais | — |
| `0111_backfill_detentor.sql` | — | BACKFILL | ILEGÍVEL | update em public.ativos | chamada de public.status_tem_detentor() no apply (o leitor não vê o que ela faz) |
| `0124_fuso_do_negocio_e_indices_fk.sql` | — | ADITIVA | ILEGÍVEL | — | SQL dinâmico (execute) perto de «execute format( 'alter database %I set timezone = %L', »; comando execute |
| `0125_item_chave_e_regularizacao.sql` | — | ADITIVA | ILEGÍVEL | — | add column nome_chave: coluna gerada STORED reescreve a tabela |
| `0127_conversao_reservas.sql` | — | BACKFILL | BACKFILL | insert em public.lancamentos_item (dentro de do); insert em public.lancamentos_item (dentro de do) | — |
| `0133_ordem_das_movimentacoes.sql` | — | BACKFILL | ILEGÍVEL | update em public.movimentacoes (dentro de do) | chamada de setval() no apply (o leitor não vê o que ela faz); válvula: set_config de estoque.dev_destrutivo (a janela destrutiva); válvula: set_config de estoque.dev_destrutivo (a janela destrutiva); válvula: set_config de estoque.dev_destrutivo (a janela destrutiva) |
| `0152_raiz_do_tenant.sql` | ADITIVA | ADITIVA | ADITIVA | — | — |
| `0153_membros.sql` | ADITIVA | ADITIVA | ADITIVA | — | — |
| `0154_plataforma_admins.sql` | ADITIVA | ADITIVA | ADITIVA | — | — |
| `0155_filiais_empresa.sql` | ADITIVA | ADITIVA | ADITIVA | — | — |
| `0156_vinculo_por_membership.sql` | ADITIVA | BACKFILL | BACKFILL | update em public.operador_filiais | — |
| `0157_funcoes_de_conjunto.sql` | ADITIVA | ADITIVA | ADITIVA | — | — |
| `0158_cargo_em_membros.sql` | ADITIVA | BACKFILL | BACKFILL | upsert em public.membros (dentro de do) | — |

(134 arquivos ADITIVA sem cabeçalho omitidos da tabela.)

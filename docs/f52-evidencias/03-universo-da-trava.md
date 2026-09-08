# F52 — O universo derivado de `definer_sem_tenant.sql`, conferido contra PRODUÇÃO

A trava não usa lista fixa: ela **deriva** o universo do catálogo do Postgres —
`prosecdef` em `public`, alcançável por `authenticated`, com algum parâmetro
`uuid`/`uuid[]`/`smallint`/`text` — e compara **nos dois sentidos** contra duas listas
nominais. Para que ela não nasça vermelha por motivo errado, o universo foi medido contra o
banco de **produção** (`pbtjcalbmepmrqzprusb`) em 08/09/2026.

**Resultado: exatamente 21 funções** — e as 21 estão classificadas.

## As 18 de `k_escopo_ok` (se defendem por dentro, ou por delegação)

| Função | Assinatura real |
|---|---|
| `pode_escrever_filial` | `fid smallint` |
| `apagar_usuario` | `p_alvo uuid` |
| `definir_papel_usuario` | `p_alvo uuid, p_papel papel_usuario` |
| `definir_status_usuario` | `p_alvo uuid, p_ativo boolean` |
| `definir_vinculos_usuario` | `p_alvo uuid, p_filiais smallint[]` |
| `encerrar_sessoes_usuario` | `p_alvo uuid` |
| `pode_escrever_arquivo_termo` | `p_nome text` |
| `pode_escrever_termo` | `p_ativo_ids uuid[]` |
| `apagar_ativo` | `p_ativo uuid, p_confirmacao text, p_justificativa text` |
| `apagar_item` | `p_item smallint, …` |
| `apagar_movimentacao` | `p_mov uuid, …` |
| `forcar_estado_ativo` | `p_ativo uuid, …` |
| `forcar_saldo_item` | `p_item smallint, p_filial smallint, …` |
| `previa_reset` | `p_bloco text, p_filial smallint` |
| `resetar_acervo` | `p_filial smallint, …` |
| `resetar_itens` | `p_filial smallint, …` |
| `apagar_ativos_conflito_filiais` | `p_ativos uuid[], …` |
| `importar_ativos_substituir` | `p_plano jsonb, p_backup_path text, …` |

⚠ Repare que **`importar_ativos_substituir` entra no universo pelo `p_backup_path text`** —
não por um `uuid`. É exatamente o caso que a ordem exigia que o filtro pegasse, e que uma
varredura por `uuid`/`smallint` teria deixado passar. O mesmo vale para
`pode_escrever_arquivo_termo(p_nome text)` e `pode_ler_arquivo_termo(p_nome text)`.

## As 3 de `k_escopo_excecao` (nominais, com motivo e migration)

| Função | Migration | Por que é exceção |
|---|---|---|
| `estorno_item_coerente` | `0068` | Sozinha não protege nada: a autorização está **ANDada ao lado**, na mesma expressão da policy (`pode_escrever_filial(filial_id) and estorno_item_coerente(...)`). Reprová-la seria reprovar código seguro. |
| `termo_ancora_coerente` | `0069` | Idem — só confere **coerência de dados**, nunca cargo nem filial. |
| `pode_ler_arquivo_termo` | `0129` | Recebe `p_nome text` e **ignora o parâmetro de propósito**: o corpo é `papel_atual() is not null`. É "todo logado ativo lê todo termo", intencional até a **F67** fechar por join. |

**18 + 3 = 21 = o universo medido.** A trava nasce verde **pelo motivo certo**, e a asserção de
auto-sabotagem (que cria uma `security definer` fictícia dentro de `begin; … rollback;`) prova
que ela sabe reprovar.

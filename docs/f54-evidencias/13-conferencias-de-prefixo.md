# As conferências de prefixo da `0089` e da `0100`, RODADAS contra um caminho de cópia

Critério 4 da ordem de serviço: *"O caminho das cópias satisfaz as conferências de prefixo da
`0089` e da `0100` — **provado rodando o SQL das duas conferências contra um caminho de exemplo**,
não por leitura."*

Rodado em **09/09/2026** contra **produção** (`pbtjcalbmepmrqzprusb`), só leitura, com as funções
que as próprias RPCs chamam.

## O que cada RPC confere, lido do corpo vigente

**`resetar_acervo` (`0089:117-131`)** — cascata de três:
1. `p_backup_path` não é vazio;
2. `btrim(p_backup_path) like prefixo_backup_reset('acervo', p_filial) || '%'`;
3. existe em `storage.objects` com `bucket_id = 'backups-import'`.

**`apagar_ativos_conflito_filiais` (`0100`)** — acima do teto de 25:
1. `p_backup_path` não é vazio;
2. `btrim(p_backup_path) like prefixo_backup_conflito() || digest_selecao_conflito(v_ids) || '/%'`;
3. existe em `storage.objects`.

⚠ **As três olham SÓ o caminho que receberam por parâmetro** — o do JSON. Objeto extra sob o mesmo
prefixo não é examinado por nenhuma delas. E as cópias da F54 nascem **depois** da RPC retornar,
quando a conferência já aconteceu: não há ordem de eventos em que uma cópia influencie a outra.

## A execução

| conferência | caminho | resultado |
|---|---|---|
| `0089` — o JSON passa no prefixo do recorte | `reset/acervo/filial-3/2026-09-09T18-00-00-000Z.json` | **true** |
| `0089` — a CÓPIA `.docx` cai sob o mesmo prefixo | `reset/acervo/filial-3/2026-09-09T18-00-00-000Z/termos/aaaa.docx` | **true** |
| `0089` — o prefixo derivado | `reset/acervo/filial-3/` | — |
| `0100` — o JSON do conflito passa no prefixo + digest | `conflito/7607b4c7c01600a5b1c9053a3190e5a5/2026-09-09T18-00-00-000Z.json` | **true** |
| `0100` — a CÓPIA `.docx` cai sob o mesmo prefixo + digest | `conflito/7607b4c7c01600a5b1c9053a3190e5a5/termos/aaaa.docx` | **true** |
| `0100` — digest ERRADO é recusado (o que a `0100` corrigiu) | `conflito/00000000000000000000000000000000/x.json` | **false** |

O digest `7607b4c7…` foi calculado pela própria `public.digest_selecao_conflito()` sobre dois uuids
fictícios — não é um valor escrito à mão.

## O que isto prova, e o que não prova

**Prova:** a convenção de caminho da F54 (`<raiz>/termos/<arquivo>`) vive **sob o mesmo prefixo** que
cada RPC exige do JSON, e o `like` das duas conferências aceita esse caminho. Nenhuma das duas passa
a recusar por causa das cópias.

**Prova também** que a `0100` continua fazendo o trabalho que a motivou: um caminho sob `conflito/`
com o digest de OUTRA seleção é recusado. Conferir só o prefixo aceitaria o backup de qualquer outra
exclusão.

**Não prova** que a RPC aceitaria uma cópia `.docx` COMO backup — e não deveria: a terceira etapa da
cascata exige que o caminho exista em `storage.objects`, e o parâmetro que ela examina é sempre o do
JSON. A cópia nunca é passada como `p_backup_path`.

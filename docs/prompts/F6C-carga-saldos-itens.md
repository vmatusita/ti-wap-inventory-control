# OS-F6C — Carga única dos saldos iniciais de itens

Executor desta ordem no repositório `ti-wap-inventory-control`. **Modo autônomo com acesso total (CLAUDE.md)** — mas esta é a ordem que **depende de insumo físico do Johnny**: o export da planilha de gestão online com os saldos de itens, fora do repositório (como os CSVs da F4). Sem o arquivo, não há o que executar.

É a pendência declarada da janela F4, movida para o **fim da fila** por decisão do Johnny (16/07/2026): melhorias primeiro (F6A → F6B), cargas por último. **Pré-requisito: F6A concluída** — a carga entra já na semântica `Total`/`Estoque` do item A4.

## 0. Antes de qualquer coisa

1. Leia `CLAUDE.md`, `docs/PLANO-RELATORIOS-V2.md` (itens por quantidade), o item A4 da `F6A-correcoes-pos-golive.md` (semântica vigente) e `docs/ANALISE-PLANILHA-F4.md`.
2. Confirme que F6A e F6B estão concluídas (README) e que o export está disponível fora do repositório.
3. **Regra 2 do CLAUDE.md continua dura:** nenhum dado real entra no repo — o arquivo fica fora, os scripts só o leem por caminho passado em variável/argumento.

## 1. Objetivo

Colocar em produção os saldos iniciais dos itens por quantidade (acessórios, periféricos, componentes) por filial, a partir da planilha de gestão online — carga **única**, via script, sem tela de importação, idempotente.

## 2. Escopo proibido

- **Nenhuma tela de importação** — é ferramenta (`scripts/import/`), não feature do app.
- Não alterar a semântica Total/Estoque (foi definida na F6A-A4); a carga se adapta a ela, não o contrário.
- Não recarregar ativos/movimentações — só saldos de itens. Nada além da carga.

## 3. Sequência

1. **Adapte `scripts/import/itens.ts`** ao layout real do export (por nome de coluna, como os demais) e à semântica vigente: os saldos entram como **lançamentos de entrada** que alimentam `Total`/`Estoque` (os atrelados/liberados já existentes no sistema continuam descontando o Estoque por cima). Guardas `CARGA_*` obrigatórias.
2. **Dry-run primeiro**, com relatório de inconsistências (item desconhecido no catálogo, filial não mapeada, quantidade inválida). Itens fora do catálogo: criar em `admin/itens` via script? Decida pelo que a spec indica e registre.
3. **Backup** das tabelas de itens/lançamentos antes da carga real.
4. Carga em produção; **reexecução não pode duplicar** (idempotência, como na F4).
5. Conferência: contagens por item × filial contra a planilha; amostra manual de 5+ itens na tela `/itens` (Total, Estoque e falta coerentes).

## 4. Aceite (autoverificado)

- [ ] Dry-run com relatório de inconsistências apresentado no resumo
- [ ] Saldos por item × filial batem com a planilha de gestão; amostra conferida na tela `/itens`
- [ ] Reexecução idempotente comprovada (rodar 2× não duplica)
- [ ] Backup prévio feito; contagens antes/depois no resumo
- [ ] Nenhum dado real no repositório; `lint`+`build` limpos
- [ ] `docs/DECISOES.md` e README atualizados (pendência da F4 encerrada)

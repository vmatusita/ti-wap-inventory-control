# OS-F4 — Importador das planilhas + ensaio + go-live

Executor desta ordem no repositório `ti-wap-inventory-control`. É a fase mais delicada: é aqui que os dados REAIS entram. Siga na ordem; ambiguidade → **PARE e pergunte ao Johnny**. Nenhuma carga em produção acontece sem confirmação explícita dele na conversa.

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md` **§5 (vocabulários De→Para e regra do patrimônio — serão implementados literalmente)** e **§10 (estratégia do importador em 4 passos)**, `docs/PLANEJAMENTO.md` §3.
2. Pré-requisitos (senão PARE): F3 mergeada e demo validada; respostas das perguntas 1 (filiais) e 3 (convites) da spec §13 registradas pelo Johnny; existe projeto Supabase de **ensaio** (2º projeto free) linkável.
3. Fatos dos arquivos reais (não mude sem confirmar): CSV com delimitador `;`, encoding **Windows-1252/cp1252**, datas `dd/mm/aaaa`. Colunas: *Matriz/inventário* = Site;Marca;Tipo;Modelo;Fornecedor;Service tag;Patrimônio;Memoria;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação · *Saída* = Data da Saída;Unidade;Categoria;Marca / Modelo;Patrimônio;Tipo de Movimentação;Chamado;Colaborador/Setor;Tipo;Termo Assinado · *Devolução* = Data da devolução;Unidade;Categoria;Marca / Modelo;Patrimônio;Colaborador;Tipo de entrada;Itens faltantes;Setor;Tipo.

## 1. Objetivo

Tela `admin/importador` que recebe os 3 CSVs, normaliza, mostra prévia + relatório de inconsistências para download, e só então carrega — reexecutável e com dry-run. Ensaio completo no projeto de ensaio; go-live na produção com aprovação; seed fictício removido; cutover.

## 2. Escopo proibido

- NÃO carregar nada em produção sem o Johnny escrever "aprovado" na conversa.
- NÃO "corrigir" dados reais silenciosamente fora dos De→Para documentados: caso novo de sujeira → vai para o relatório de inconsistências, não para um palpite.
- NÃO commitar os CSVs reais nem trechos deles (nomes reais!) em código, teste ou fixture. Testes usam CSVs sintéticos criados por você com os MESMOS padrões de sujeira.

## 3. Tarefas

### 3.1 Motor de normalização — `src/lib/importador/` (funções puras + Vitest)

1. `parsePatrimonio(raw)`: canoniza para `PREFIXO+7 dígitos` (WAP4491→WAP0004491); casa variantes ignorando zeros; `4491` sem prefixo → tenta inferir por match único contra os já vistos, senão inconsistência; vazio/N/A/"SEM PATRIMONIO" → `{semPatrimonio:true}`.
2. `parseData(raw)`: `dd/mm/aaaa` e variações com espaços; inválida/vazia → null + flag.
3. Mapas De→Para EXATAMENTE como a spec §5 (motivos de saída, motivos de devolução, unidades CD-AFP/Eusebio/Matriz␠, "Sáida"→saida, "Deligamento"→desligamento, termo "15/12/2025"/"enviado"/"Termo enviado"→enviado+data quando houver). Valor fora do mapa → inconsistência `motivo_desconhecido` (não vira `outro` silenciosamente).
4. Classificador de linha: devolução com Tipo de entrada="Compra" → movimentação `compra`; Saída com Tipo="Transferência Uni." → `transferencia`; "Empréstimo" → `emprestimo`.
5. Dedup: linhas exatamente idênticas na mesma planilha → 1 mantida + inconsistência `duplicata_exata` informativa.
6. **Vitest cobrindo cada regra acima com CSVs sintéticos** (mín. 25 casos, incluindo: patrimônio duplicado com service tags distintas → 2 ativos; duplicado sem service tag → inconsistência; movimentação de ativo inexistente no inventário → ativo `origem='inferido'`).

### 3.2 Migration `0009_importador.sql`

Tabelas `stg_inventario`, `stg_saidas`, `stg_devolucoes` (colunas texto cruas + nº da linha + lote uuid) e `import_lotes` (id, iniciado_em, status rascunho|carregado|descartado, resumo jsonb). RLS: só admin.

### 3.3 Tela — `src/app/(app)/admin/importador/page.tsx` (wizard de 4 passos)

1. **Upload**: 3 dropzones rotuladas (Inventário/Saída/Devolução). Parse client-side com PapaParse (`delimiter:';'`, encoding cp1252 — valide lendo os headers esperados; header errado = arquivo na dropzone errada → bloquear com mensagem). Envia cru para staging via Server Action (lotes de 500 linhas).
2. **Prévia**: contagens por arquivo, amostra de 20 linhas normalizadas lado a lado (cru → normalizado), totais do que será criado (ativos novos, inferidos, movimentações por tipo).
3. **Inconsistências**: tabela agrupada por tipo (`patrimonio_duplicado_sem_service_tag`, `motivo_desconhecido`, `data_invalida`, `ativo_inferido`, `duplicata_exata`, `estado_divergente`…) com severidade (bloqueante ⛔ / aviso ⚠️) + botão "Baixar relatório CSV" (`;` + BOM). **Com qualquer bloqueante, o botão de carga fica desabilitado.**
4. **Carga**: botão "Executar carga" com confirmação digitada (`IMPORTAR`). Ordem: ativos do inventário → movimentações em ordem cronológica global (o trigger recalcula estado; `criado_por` = admin logado; monkey-patch NÃO: se uma movimentação for inválida para o estado corrente — ex.: duas saídas seguidas — registre inconsistência `estado_divergente` e pule, sem abortar o lote). Ao final: resumo (criados/pulados/tempo) gravado em `import_lotes` + comparação com os números esperados informados na tela (campo para o Johnny digitar: nº de linhas de cada planilha).
5. Reexecução: carregar novo lote é permitido; ativo já existente (mesmo patrimônio+service tag) é atualizado nos campos cadastrais vazios e NUNCA duplicado; movimentação idêntica (ativo+tipo+data+chamado) é pulada como `ja_importada`.

### 3.4 Ensaio (obrigatório antes de produção)

1. `supabase link` no projeto de **ensaio** + push das migrations + convite de 1 admin de teste.
2. Johnny roda o wizard com as 3 planilhas REAIS exportadas em CSV. Você acompanha os números: meta = 1.179 ativos (± duplicatas legítimas), 423 saídas, 291 devoluções (−6 duplicatas exatas, −20 compras reclassificadas) — qualquer desvio não explicado pelo relatório de inconsistências → investigar antes de seguir.
3. Ata do ensaio no resumo: contagens, inconsistências por tipo, decisões do Johnny sobre cada bloqueante.

### 3.5 Go-live (produção — só com "aprovado" explícito do Johnny)

1. `db:reset` do seed fictício na produção (guardas do script exigem confirmação) → wizard com os CSVs reais → conferência dos números com o Johnny → convites reais (respostas §13) → marcar as planilhas Google/Excel como somente-leitura (Johnny faz) → registrar data do cutover no README.

## 4. Critérios de aceite

- [ ] Vitest do motor: 100% dos casos passando; `lint`+`build` limpos.
- [ ] Wizard bloqueia: arquivo na dropzone errada, carga com bloqueante pendente, confirmação não digitada.
- [ ] Relatório de inconsistências baixa e abre no Excel BR.
- [ ] Reexecutar a mesma carga não duplica nada (contagens idênticas, tudo `ja_importada`).
- [ ] Ensaio: números batem com as metas da tarefa 3.4.2 e cada inconsistência tem decisão anotada.
- [ ] Produção: relatórios das filiais mostram os dados reais; nenhum dado fictício restante (`select` por prefixo de patrimônio 8000–9999 = 0 linhas).
- [ ] Nenhum CSV real ou nome real commitado (`git log -p` verificado).

## 5. Entrega

Branch `f4-importador`. Resumo final: checklist, ata do ensaio, ata do go-live (data/hora, contagens, quem aprovou), pendências. Após o merge: atualizar README (fases + data do cutover).

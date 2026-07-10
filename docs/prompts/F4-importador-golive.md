# OS-F4 — Carga inicial única (scripts) + ensaio + go-live

Executor desta ordem no repositório `ti-wap-inventory-control`. É a fase mais delicada: é aqui que os dados REAIS entram — **uma única vez**. Decisão de 09/07/2026: **o sistema NÃO tem tela de importação**; a carga é feita por scripts, pelo Johnny, na janela do go-live. Siga na ordem; ambiguidade → **PARE e pergunte ao Johnny**. Nenhuma escrita em produção acontece sem confirmação explícita dele na conversa.

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md` **§5 (vocabulários De→Para e regra do patrimônio — serão implementados literalmente)** e **§10 (carga inicial em 4 passos)**, `docs/PLANEJAMENTO.md` §3.
2. Pré-requisitos (senão PARE): F3 mergeada e demo validada; respostas das perguntas 1 (filiais) e 3 (convites) da spec §13 registradas; existe o 2º projeto Supabase (**ensaio**) linkável; o Johnny tem os 3 CSVs exportados **fora do repositório** (ex.: `~/cargas/` — nunca dentro do repo).
3. Fatos dos arquivos reais (não mude sem confirmar): delimitador `;`, encoding **Windows-1252/cp1252**, datas `dd/mm/aaaa`. Colunas: *Inventário* = Site;Marca;Tipo;Modelo;Fornecedor;Service tag;Patrimônio;Memoria;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação · *Saída* = Data da Saída;Unidade;Categoria;Marca / Modelo;Patrimônio;Tipo de Movimentação;Chamado;Colaborador/Setor;Tipo;Termo Assinado · *Devolução* = Data da devolução;Unidade;Categoria;Marca / Modelo;Patrimônio;Colaborador;Tipo de entrada;Itens faltantes;Setor;Tipo.

## 1. Objetivo

Scripts em `scripts/import/` que fazem a carga única com segurança: parse → normalização → **dry-run com relatório de inconsistências** → carga idempotente. Ensaio completo no projeto de ensaio, go-live na produção com aprovação, seed fictício removido, cutover registrado. **Nenhuma tela, rota ou item de menu novo no app.**

## 2. Escopo proibido

- **NÃO criar tela/rota/menu de importação.** Se encontrar qualquer resquício de rota `admin/importador` de versões antigas do plano, remova e reporte.
- NÃO escrever em produção sem o Johnny mandar "aprovado" na conversa.
- NÃO "corrigir" dado real fora dos De→Para documentados: caso novo de sujeira → relatório de inconsistências, não palpite.
- NÃO commitar os CSVs reais nem trechos deles (nomes reais!) em código, teste, fixture ou saída de exemplo. Testes usam CSVs sintéticos criados por você com os mesmos padrões de sujeira. Os relatórios `carga-*.csv/json` gerados também não vão para o git (adicione ao `.gitignore`).

## 3. Tarefas

### 3.1 Motor de normalização — `scripts/import/normalizar.ts` (funções puras + Vitest)

1. `parsePatrimonio(raw)`: canoniza para `PREFIXO+7 dígitos` (WAP4491→WAP0004491); casa variantes ignorando zeros; `4491` sem prefixo → tenta inferir por match único contra os já vistos, senão inconsistência; vazio/`N/A`/"SEM PATRIMONIO" → `{semPatrimonio:true}`.
2. `parseData(raw)`: `dd/mm/aaaa` e variações com espaços; inválida/vazia → null + flag.
3. Mapas De→Para EXATAMENTE como a spec §5: motivos de saída, motivos de devolução, unidades (CD-AFP = CD-Afonso Pena, Eusebio = Eusébio, "Matriz " = Matriz), "Sáida"→saida, "Deligamento"→desligamento, termo ("15/12/2025"/"enviado"/"Termo enviado" → enviado + data quando houver). Valor fora do mapa → inconsistência `motivo_desconhecido` (não vira `outro` silenciosamente).
4. Classificador de linha: Devolução com Tipo de entrada = "Compra" → movimentação `compra`; Saída com Tipo = "Transferência Uni." → `transferencia`; "Empréstimo" → `emprestimo`. Coluna Observação do inventário → `ativos.observacoes`; textos livres relevantes das planilhas de saída/devolução → `movimentacoes.observacao` (regra 9 da spec).
5. Dedup: linhas exatamente idênticas na mesma planilha → mantém 1 + inconsistência informativa `duplicata_exata`.
6. **Vitest em `scripts/import/__tests__/` com CSVs sintéticos** (mín. 25 casos), incluindo: patrimônio duplicado com service tags distintas → 2 ativos legítimos; duplicado sem service tag → bloqueante; movimentação de ativo ausente do inventário → ativo `origem='inferido'`.

### 3.2 CLI de carga — `scripts/import/carga.ts`

1. Uso: `npm run carga -- --inventario=<path> --saidas=<path> --devolucoes=<path> --dry-run|--executar`. Script no package.json: `"carga": "tsx scripts/import/carga.ts"`.
2. **Guardas (primeiras linhas, iguais às do seed):** exige `CARGA_CONFIRM=sim`; exige que a URL do Supabase em uso corresponda à env `CARGA_PROJECT_REF`; exige `CARGA_ADMIN_EMAIL` que resolva para um profile admin (vira o `criado_por`). Sem qualquer uma → aborta com mensagem clara.
3. Pipeline: parse com PapaParse (`;`, cp1252, validação dos headers exatos da seção 0.3 — header errado = arquivo trocado → aborta) → normalização (3.1) → montagem do plano: ativos do inventário + ativos `inferidos` + movimentações em **ordem cronológica global**.
4. **Dry-run (padrão):** imprime prévia (contagens por arquivo, ativos novos/inferidos, movimentações por tipo) e grava `carga-inconsistencias-<timestamp>.csv` (`;` + BOM) com colunas: severidade (`bloqueante`/`aviso`), tipo (`patrimonio_duplicado_sem_service_tag`, `motivo_desconhecido`, `data_invalida`, `ativo_inferido`, `duplicata_exata`, `estado_divergente`…), arquivo, linha, valor cru, ação proposta. **Havendo bloqueante: exit code 1, e `--executar` recusa rodar.**
5. **`--executar` (só sem bloqueantes):** insere ativos primeiro, depois movimentações uma a uma em ordem (o trigger do banco recalcula estado; movimentação inválida para o estado corrente → loga `estado_divergente`, pula e segue). Ao final grava `carga-resultado-<timestamp>.json` (criados, atualizados, pulados por tipo, duração) e imprime comparação com os totais que o Johnny digitar via flags `--esperado-ativos= --esperado-saidas= --esperado-devolucoes=`.
6. **Idempotência:** reexecutar não duplica nada — ativo já existente (mesmo patrimônio + service tag) só preenche campos cadastrais vazios; movimentação com mesma chave natural (ativo, tipo, data, chamado) é pulada como `ja_importada`.

### 3.3 Ensaio (obrigatório antes de produção)

1. `supabase link` no projeto de **ensaio** + push das migrations + 1 admin de teste + `db:seed` NÃO (ensaio roda limpo).
2. O Johnny roda dry-run e depois `--executar` com os 3 CSVs reais (que estão fora do repo). Metas: 1.179 ativos (± duplicidades legítimas por service tag), 423 saídas, 291 devoluções (−6 duplicatas exatas, −20 compras reclassificadas). Desvio não explicado pelo relatório → investigar antes de seguir.
3. Ata do ensaio no resumo final: contagens, inconsistências por tipo, decisão do Johnny para cada bloqueante.

### 3.4 Go-live (produção — só com "aprovado" explícito do Johnny na conversa)

Roteiro numerado, executado com ele acompanhando:
1. `db:reset` do seed fictício na produção (guardas exigem confirmação) → conferir que ativos/movimentações = 0.
2. Dry-run com os CSVs reais → revisar inconsistências com o Johnny → `--executar`.
3. Conferir contagens + abrir os relatórios das filiais com dados reais.
4. Johnny: convites reais (respostas da §13), marcar as planilhas como somente-leitura, apagar cópias temporárias dos CSVs, registrar a data do cutover no `README.md`.
5. Deixar `scripts/import/` com aviso no topo de cada arquivo: "Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10."

## 4. Critérios de aceite

- [ ] Vitest do motor: 100% passando; `lint` + `build` limpos.
- [ ] Nenhuma rota/tela/menu de importação no app (`grep -ri importador src/` = zero resultados).
- [ ] Dry-run com bloqueante → exit 1 e `--executar` recusa; sem bloqueante → executa.
- [ ] Guardas: sem `CARGA_CONFIRM`/project-ref errado/admin inexistente → aborta antes de qualquer leitura do banco.
- [ ] Reexecutar a mesma carga não duplica nada (contagens idênticas; tudo `ja_importada`).
- [ ] Ensaio bate as metas da tarefa 3.3.2, com ata.
- [ ] Produção: relatórios com dados reais; zero fictício restante (patrimônios da faixa 8000–9999 = 0 linhas).
- [ ] Nenhum CSV real, nome real ou relatório de carga commitado (`git log -p` conferido; `.gitignore` cobre `carga-*.csv`/`carga-*.json`).

## 5. Entrega

Branch `f4-carga-inicial`. Resumo final: checklist marcado, ata do ensaio, ata do go-live (data/hora, contagens, quem aprovou), pendências. Após o merge: atualizar README (fases + data do cutover).

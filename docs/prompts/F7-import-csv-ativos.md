# OS-F7 — Import de CSV de ativos como função do sistema (admin)

> **Escopo refinado pelo Johnny em 16/07/2026 (2ª rodada) — para executar, use `F7-ultracode.md`:** somente o modo **Substituir tudo** ("import de startup" — go-live novo de cada filial). O modo **Atualizar foi ADIADO** (decisão: "não vamos atualizar nada agora — correção manual é no próprio sistema, linha por linha"). E a compra inicial de cada ativo usa a **data de entrada do CSV** (nunca "entrou agora"); linha sem data válida importa marcada como carga, fora dos relatórios do período, com aviso no preview. Este arquivo permanece como registro do alinhamento coluna a coluna.

Executor desta ordem no repositório `ti-wap-inventory-control`. **Modo autônomo com acesso total (CLAUDE.md)** — decide, implementa, aplica migrations, deploya, registra em `docs/DECISOES.md`. Sistema **em produção com dados reais**: as autoproteções são obrigatórias, principalmente no modo Substituir (§4.2). Ordem **sequencial** — rode numa sessão única (schema → motor → tela dependem um do outro; não paralelize).

## 0. Esta ordem REVOGA uma regra do projeto — leia primeiro

A spec §10, o `CLAUDE.md` (regra 2 e estrutura de pastas) e o `README.md` dizem que **"o sistema não tem tela de importação, nunca"**. Essa regra foi **revogada pelo Johnny em 16/07/2026**, nesta sessão de planejamento, com plena consciência do trade-off (incluindo o custo do modo Substituir, confirmado duas vezes — ver §4.2). Import de CSV de ativos passa a ser **função oficial do sistema, na administração**.

Parte da execução desta OS é **emendar os documentos**: spec §10 (nova subseção "importação recorrente via admin"), `CLAUDE.md` (regra 2 e o comentário da estrutura de pastas), `README.md`, e registrar a decisão em `docs/DECISOES.md` (data · contexto · escolha · motivo). Os scripts da F4 (`scripts/import/`) permanecem intocados como ferramenta histórica do go-live — a feature nova NÃO os executa, mas **extrai deles** o que for reutilizável (§5.3).

**Pré-requisitos:** F6A e F6B concluídas e em produção (a F6B mexeu em termo/pendências que esta OS respeita). A F6C (carga de saldos de **itens**) é independente e continua valendo — esta OS é só de **ativos**.

## 1. Objetivo

Tela `admin/importar`: o operador escolhe a **filial**, escolhe o **modo** (Atualizar ou Substituir tudo), sobe o **CSV daquela filial** (mesmo layout da planilha de inventário), vê um **preview completo** do que vai acontecer e aplica **tudo-ou-nada**. Zero erro silencioso: qualquer linha inválida bloqueia o import inteiro, com lista erro a erro (linha, coluna, valor, motivo) para correção manual no CSV.

## 2. Decisões do Johnny — sessão de 16/07/2026 (autoridade desta OS)

1. Import é **de ativos**, **filial por filial**, como **tela do admin** (revogação da regra §10).
2. Layout do CSV = o mesmo da planilha de inventário da F4 (3 variantes por filial, colunas por **nome**).
3. Chave de identificação = **par patrimônio + service tag** (patrimônio canonicalizado; inválido/vazio = bloqueante; **sem** inferência por hostname).
4. Linha com `Site` ≠ filial selecionada = **erro bloqueante** (aceitando o De→Para de unidades). Import **nunca** transfere ativo entre filiais.
5. Estado (Status/Situação) divergente → **movimentação de AJUSTE automática** (precedência **Situação > Status**, colaborador/setor do CSV, GLPI como chamado, justificativa automática).
6. **Termo de Ativos: ignorado** — pós-F5A/F6B o sistema é a fonte da verdade do termo.
7. **Observação: sobrescreve sempre** (vazio limpa). Demais cadastrais: **vazio preserva**.
8. Datas (Inclusão/Entrega): usadas **só para ativo novo** (data da compra inicial; sem data válida → data do import).
9. Modo **Atualizar** = upsert (cria + atualiza + ajusta); quem não está no CSV fica intocado.
10. Modo **Substituir tudo** = **DELETE FÍSICO** dos ativos antigos da filial (com movimentações, anotações e termos juntos) e recriação a partir do CSV — decisão tomada com o custo explícito na mesa; salvaguardas obrigatórias na §4.2.
11. Fluxo: upload → validação total → preview → confirmar → **aplicar tudo-ou-nada**; erros exibidos um a um.

## 3. Alinhamento coluna a coluna (CSV → sistema)

| Coluna do CSV | Destino | Regra |
|---|---|---|
| `Site` | — (validação) | Normalizado pelo De→Para de unidades (F4/spec §5: `Serra Park`→Serra, `Filial-CE`→Eusébio, `CD-PENA`/`Afonso Pena`→CD-Afonso Pena…). Diferente da filial selecionada → **bloqueante** |
| `Patrimônio` | `patrimonio` (e `patrimonio_original` na criação) | `canonicalizarPatrimonio` (`src/lib/patrimonio.ts`); inválido/vazio → **bloqueante**. Par duplicado dentro do próprio CSV → **bloqueante** |
| `Service Tag` | `service_tag` | Parte da chave. Par patrimônio+ST repetido no CSV → bloqueante; patrimônio repetido **sem** ST (colisão do índice único) → bloqueante |
| `Tipo` | `categoria` | De→Para da F4 (Notebook, Desktop, Monitor, Celular, Tablet → enum; desconhecido → **bloqueante**) |
| `Marca` / `Modelo` / `Fornecedor` / `Memória` / `Armazenamento` / `Processador` / `Hostname` | campos homônimos | Direto. **Vazio preserva** o valor do sistema (só sobrescreve com valor preenchido) |
| `Status` + `Situação` | estado do ativo (**via movimentação de ajuste**, nunca update direto) | **Situação vence quando preenchida; senão Status** (F4). De→Para de estados da spec §5. Valor desconhecido → **bloqueante**. Estado igual ao do sistema → nenhum ajuste |
| `Colaborador` | `colaborador_atual` via o ajuste | Vai na movimentação de ajuste (com setor se o texto trouxer). Sem divergência de estado nem de colaborador → nada |
| `GLPI` | `chamado` da movimentação de ajuste | Só quando houver ajuste; sem ajuste, ignorado. Coluna pode não existir (layout CD) |
| `Data de Inclusão` / `Data de Entrega` | data da **compra inicial** (só ativo novo) | Mais antiga válida das duas; inválidas/vazias → data do import. Em ativo existente: ignoradas |
| `Termo de Ativos` | — | **Ignorada** (decisão 6). Coluna pode não existir (layout CD) |
| `Observação` | `observacoes` | **Sobrescreve sempre** (vazio limpa) |
| `Grade` | — | Ignorada (layout Linhares/CE/Serra) |

Colunas obrigatórias no header: as do layout da filial (validação por conjunto de nomes normalizados — sem `:`/espaços/acentos, como `scripts/import/parse.ts` faz). Header não reconhecido → bloqueante com mensagem apontando as colunas faltantes/sobrando.

## 4. Semântica dos modos

### 4.1 Atualizar (upsert)

- Linha cujo par não existe → **cria** o ativo (`origem: 'importacao'`) + movimentação de **compra inicial** (data da decisão 8, observação `import CSV dd/MM/yyyy`) + **ajuste** na sequência se o estado do CSV ≠ `em_estoque`.
- Linha cujo par existe → atualiza cadastrais (vazio preserva; Observação sobrescreve) + **ajuste** se o estado/colaborador divergirem.
- Ativo no sistema ausente do CSV → **intocado**.

### 4.2 Substituir tudo (da filial) — operação destrutiva assumida

Delete físico dos ativos da filial selecionada **e de tudo que pende deles**: movimentações, anotações, registros de `termos_gerados` que referenciem só ativos da filial (+ arquivos `.docx` do bucket `termos`) — depois recriação integral a partir do CSV (compra inicial + ajuste, como 4.1). Snapshots congelados (`relatorios_gerados`) **não são tocados** (jsonb sem FK — o histórico apresentado sobrevive).

**Salvaguardas obrigatórias (não são opcionais):**
1. **Backup automático pré-aplicação**: export completo (ativos + movimentações + anotações + termos da filial) gravado no Storage privado (bucket novo `backups-import` ou pasta no existente) **e** oferecido para download. Sem backup gravado com sucesso, a aplicação não roda.
2. **Preview com o custo à vista**: além de "criar X / apagar Y", mostrar explicitamente "serão apagados: N movimentações, M anotações, K termos gerados desta filial".
3. **Confirmação digitando o nome da filial** (padrão GitHub) no dialog final — só habilita o botão com o texto exato.
4. **Transação única** (RPC), com contagens conferidas dentro da transação (nº de ativos criados = linhas válidas do CSV; rollback em qualquer surpresa).
5. Termo gerado que referencie ativos de **mais de uma filial** (lote misto): **bloqueante** no preview — resolver à mão antes (caso raro; não apagar termo que também pertence a outra filial).

### 4.3 Fluxo e erros (os dois modos)

Wizard na tela: **(1) Configurar** (filial + modo) → **(2) Upload** do CSV → **(3) Preview** — números (criar / atualizar / ajustar / apagar / intocados) + tabela de erros bloqueantes (linha, coluna, valor cru, motivo, ação sugerida) e avisos não bloqueantes → **(4) Aplicar** (só com **zero bloqueantes**) → **(5) Resultado** (contagens finais + link para o backup no modo Substituir).

- **Tudo-ou-nada**: a aplicação é uma RPC transacional; qualquer erro no meio → rollback total, nada muda.
- O preview **não guarda estado confiável**: a aplicação **revalida tudo** dentro da RPC contra o estado atual do banco (o banco pode ter mudado entre preview e aplicar — ex.: movimentação registrada em paralelo). Divergência entre preview e revalidação → aborta com mensagem para regerar o preview.
- Registro de auditoria: tabela `import_logs` (quem, quando, filial, modo, contagens, hash do arquivo, caminho do backup) — aparece na própria tela (histórico de imports).

## 5. Desenho técnico (guia — valide contra o código e registre desvios)

1. **Migrations** (próximos números livres — confira a pasta antes; a F6B usou até `0030`/`0031`): tabela `import_logs`; RPCs `security definer` transacionais (`importar_ativos_atualizar(jsonb)` / `importar_ativos_substituir(jsonb)`) — necessárias porque `movimentacoes` é insert-only por RLS (delete do modo Substituir não passa pela policy) e porque tudo-ou-nada exige transação no banco. As RPCs revalidam internamente (chave, filial, estados válidos) — a UI é a segunda linha, nunca a única (convenção do projeto). Grant só `authenticated`; `search_path = public` (padrão 0024).
2. **Inserções respeitam a máquina de estados**: criar ativo → inserir movimentação `compra` → inserir `ajuste` quando preciso (o trigger `aplicar_movimentacao` deriva o estado — **nunca** update direto em `status`/`colaborador_atual`).
3. **Parser/normalização em `src/lib/import/`** (código de produção, testável): reaproveite de `scripts/import/` os De→Para (unidades, categorias, estados, precedência Situação>Status) e a validação de header por nome — **extraia para módulos puros compartilhados** (`src/lib/import/deparas.ts`, `parse.ts`…) com testes Vitest; os scripts da F4 podem passar a importar daí ou ficar como estão (histórico) — decida e registre. PapaParse já é dependência aprovada. Encoding: aceite UTF-8 **e** cp1252 com `;` (detecte/normalize — o Excel da WAP exporta cp1252).
4. **Upload via Server Action** (FormData/File) com **limite de tamanho** e validação de extensão; o arquivo não é persistido (só o hash + backup no Substituir). Nenhum dado do CSV em log de servidor.
5. **Tela `admin/importar`**: entra no sub-nav do admin; wizard client com estados claros, tabela de erros com `tabular-nums`, download da lista de erros em CSV (`;`+BOM, padrão do projeto); acessível só a operador (todo o admin já é).
6. **Testes**: Vitest nos módulos puros (canonicalização já tem; De→Para, precedência de estado, montagem do plano de diff). Fluxo completo validado em DEV com CSVs fictícios cobrindo: criação, atualização com vazio preservando, ajuste de estado, Site divergente, par duplicado, categoria desconhecida, Substituir com ausentes e com termo multi-filial (bloqueante).

## 6. Escopo proibido

- **Não importar movimentações históricas** nem itens por quantidade (itens = F6C, escopo próprio).
- Não mexer no motor da F4 além da extração de módulos puros; não executar `scripts/import/` pela tela.
- Não criar roles/papéis ("quem pode importar" = qualquer operador — nível único do projeto).
- Nenhuma dependência nova além das já aprovadas (PapaParse presente). Custo R$ 0.
- Nenhum dado real em teste/fixture/screenshot (CSVs de teste 100% fictícios).

## 7. Aceite (autoverificado)

- [ ] Import Atualizar em DEV: cria/atualiza/ajusta conforme §3–§4.1; vazio preserva; Observação sobrescreve; termo intocado; datas só em ativo novo; quem não está no CSV fica intocado
- [ ] Import Substituir em DEV: backup gravado e baixável; preview mostra o custo (movs/anotações/termos a apagar); confirmação pelo nome da filial; recriação bate com o CSV linha a linha; snapshots congelados continuam abrindo
- [ ] Erros: cada caso bloqueante da §3 exibido com linha/coluna/valor/motivo; com 1 bloqueante, NADA é aplicado; lista de erros baixável
- [ ] Tudo-ou-nada comprovado: aplicação com falha simulada no meio → rollback total (contagens idênticas às de antes)
- [ ] Revalidação na aplicação: mudar o banco entre preview e aplicar → aborta com mensagem de regerar
- [ ] Ajustes gerados aparecem na linha do tempo com justificativa/chamado (GLPI); estados batem com a precedência Situação>Status
- [ ] `import_logs` registra cada execução; histórico visível na tela
- [ ] Máquina de estados intacta (nenhum update direto em status/colaborador); RLS de `movimentacoes` inalterada para o resto do app
- [ ] `lint` + `test` + `build` limpos; migrations aplicadas em produção com backup prévio; deploy feito
- [ ] Spec §10, `CLAUDE.md`, `README.md` emendados; decisão (revogação + delete físico do Substituir) registrada em `docs/DECISOES.md`

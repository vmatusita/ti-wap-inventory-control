# Análise de alinhamento — planilha real × ordem F4 (pré-execução)

> **Status: histórico — pré-execução da F4 (go-live ✅ 15/07/2026).** Mantido como referência dos vocabulários/agregados da planilha; ainda citado pela F4/F6C e por `scripts/import/`. Histórico das fases em [`../CHANGELOG.md`](../CHANGELOG.md).

**Data:** 15/07/2026 · **Fonte:** `Reserva Técnica - WAP #ESTOQUE #SAIDA.xlsx` (15 abas), analisada ANTES de executar a OS-F4, a pedido do Johnny.
**Regra seguida:** este documento traz só agregados e vocabulários (mesmo padrão da spec §5/§10) — sem nomes de colaborador, sem service tags.

## Veredito

A estrutura das 3 fontes principais **bate com a seção 0.3 da ordem F4** — os cabeçalhos de Saída, Devolução e do inventário da Matriz conferem coluna a coluna, e dois fatos previstos na ordem batem exatos na planilha de hoje (6 duplicatas exatas na Devolução; 20 "Compra" a reclassificar). A F4 **pode ser executada**, desde que os ajustes abaixo entrem no desenho — nenhum exige mudar spec ou banco. Os três pontos que dependiam de insumo do Johnny (marcados 🔴) foram **respondidos em 15/07/2026** — respostas incorporadas abaixo e registradas em `DECISOES.md`; restam só os ajustes de desenho da própria F4.

## O que já está alinhado (a ordem previu e a planilha confirma)

- Cabeçalhos exatos das 3 fontes (0.3 da ordem) ✓ — observação: no xlsx alguns nomes têm `:` no final (`Site:`, `Observação:`); a validação de header deve normalizar `:`/espaços.
- Devolução: **6 linhas exatamente duplicadas** e **20 "Compra"** — números idênticos aos da ordem. Saída: 0 duplicatas exatas.
- Typos previstos presentes e mapeados: `Sáida` (7×), `Deligamento` (2×), `Emprétimo` (1×), termo com data (`2025-12-15`, 2×) e `enviado/ENVIADO`.
- Todos os valores de Status/Situação do inventário existem na tabela de estados da spec §4.
- Movimentações com patrimônio fora do inventário: ~28 (14+2 na Saída, 10+2 na Devolução) → `ativo inferido`, como previsto.
- Datas das abas de movimentação: 100% datetime válido, período 05/01/2026 → 14/07/2026.
- Prefixos vistos: WAP 621, LEA 644, PRO 190, TEC 95, STF 23 (spec já lista todos). Números "bare" sem ambiguidade entre prefixos (0 casos).

## Desalinhamentos e decisões necessárias

### 1. Inventário não é 1 arquivo — são 5 abas com 3 layouts 🔶
A ordem 0.3 prevê UM layout de inventário (o da Matriz, 18 colunas). Na planilha:
- **Matriz** (1.250 linhas): 18 col — layout da ordem ✓
- **CD-AfonsoPena** (212): 16 col — SEM `Data de Entrega`, `Grade`, `GLPI`, `Termo de Ativos`
- **Linhares** (163) / **Filial-CE** (78) / **Serra** (63): 20 col — COM `Grade` e `GLPI` extras
→ O parser deve mapear colunas **por nome** (não por posição) e aceitar os 3 layouts. `GLPI` (nº de chamado; preenchido em 102/163 Linhares, 59/63 Serra) não existe no modelo de `ativos` — decidir destino (sugestão: observação/chamado da movimentação de reconciliação). `Grade` (valores `1`/`3` só na CE) → ignorar.

### 2. Sobreposição entre abas: 139 ativos repetidos 🔶
Mesmo patrimônio + mesma service tag em 2+ abas (48× Matriz+CD, 48× Matriz+Linhares, 16× Matriz+Serra, 7× Matriz+CE, 4× dentro do próprio CD, 2× dentro da própria Matriz…). E há linhas cujo `Site` difere da aba (Serra tem 12 linhas `Site=Linhares`; Linhares tem `Site=Serra/Matriz`).
→ Regra: o **`Site` da linha** decide a filial, não a aba/arquivo; ativo repetido = 1 ativo (idempotência da ordem já cobre), com inconsistência informativa `ativo_em_multiplas_abas` quando os `Site` divergirem. Total estimado após dedup: **~1.620 ativos** (1.766 linhas − ~145 repetições).

### 3. Reconciliação do estado final — o maior gap conceitual 🔴→🔶
As abas de movimentação cobrem **só jan–jul/2026** (437 saídas, 297 devoluções), mas ~**1.358 linhas** do inventário estão "Remanejo/Saída" (em uso). O replay cronológico da ordem (§3.2.5) deixaria a maioria dos ativos `em_estoque` → relatórios errados no dia 1 e milhares de `estado_divergente`. Somando a premissa registrada em DECISOES (correção 0022: *todo ativo nasce por `compra` na carga*), a F4 precisa de um passo explícito:
1. `compra` inicial de cada ativo (data de inclusão/entrega quando válida, senão data da carga);
2. replay das movimentações de 2026 em ordem;
3. **ajuste final** para o estado da planilha (com colaborador/setor atuais do inventário) quando o estado calculado divergir — justificativa "carga go-live: estado conforme planilha", que também documenta a divergência.

Precedência para ler o estado da planilha (~200 linhas com Status×Situação conflitantes — ex.: `Estoque|Descarte` 26×, `Estoque|Manutenção` 15×, `Estoque|Defasada` 12×, `Remanejo|vazio` 81×): **Situação vence quando preenchida; senão Status** — registrar em DECISOES na F4.

### 4. Unidades fora do De→Para — pergunta 1 da spec §13 ✅ respondida (15/07/2026)
Valores reais que não estavam no §5: **`Serra Park`** (16 saídas), **`CD-PENA`** (site do inventário do CD), **`Filial-CE`**, **`Afonso Pena`** (Perifericos). O mapa tinha só `CD-AFP`, `Eusebio` e `"Matriz "`.
→ **RESPONDIDO pelo Johnny:** Serra Park = **filial própria "Serra"**; **`Filial-CE` = Eusébio**. Filiais oficiais: **Matriz, CD-Afonso Pena, Linhares, Eusébio, Serra**. Spec §5 ampliada (`Serra Park`→`Serra`; `CD-PENA`/`Afonso Pena`→`CD-Afonso Pena`; `Filial-CE`→`Eusébio`), §13.1 marcada respondida, decisão em `DECISOES.md`.

### 5. Motivos fora do mapa (viram `motivo_desconhecido` na carga) 🔶
- Saída: **80 vazios** (18%!), `XX` (2), `-` (2), `Realizada a solicitação do celular/do Tablet` (4), `Troca de titular` (2 — grafia não listada no De de `troca_titular`).
- Devolução: `ASSISTÊNCIA` (1), `Estava no setor` (2), `Estava realizando o teste no notebook` (1), `Reposição` (1), vazios (2).
→ Sugestão para DECISOES na F4: vazio/`-`/`XX` → `outro` com aviso (não bloqueante); textos livres → `outro` com o texto preservado em `movimentacoes.observacao`; `Troca de titular` → `troca_titular`; `ASSISTÊNCIA` (devolução) → `manutencao` ou `garantia` — conferir 1 caso.

### 6. Qualidade de dados (a ordem já prevê os tipos; volumes reais)
- **Duplicidade problemática de patrimônio: 16 casos** (tag repetida ou ausente) — a ordem citava ~5. Ex.: `STF0000001`, `STF0000026`, `LEA0000047/112/157/368/369/370/394`, `WAP0003047/3239/4662`… → decisão manual prevista (§10.3), só que em volume maior. Outras 24 duplicatas são legítimas (tags distintas).
- **125 patrimônios só-dígitos**; 96 deles têm o prefixo recuperável pelo **Hostname** (que costuma ser o patrimônio canônico) — vale adicionar o Hostname como fonte de inferência no `parsePatrimonio` (98 números não existem prefixados em nenhuma aba, então "match único contra os já vistos" não resolveria).
- **7 patrimônios não parseáveis** (ex.: `STF0006LOC`, `STF003LOC`, `WAPalmaq-teste`, e 2 casos com service tag colada na coluna de patrimônio) + ~27 `SEM/N-A` + ~33 vazios; prefixo novo **`STFC`** (1× — typo de STF?).
- **Datas-texto no inventário:** `#######` (19× — colar de célula estreita), `XX` (12×), `cris`, `24/06/205`, `19/209/2025`, 4 service tags na coluna `Data de Entrega`. → `data_invalida`, como previsto.
- **Termo de Ativos:** além dos previstos, `2413` (nº de chamado na coluna errada), `Sim!`, `NÃO`, `N/A`.
- **77 saídas sem Colaborador/Setor** (regra 3 exigiria um dos dois) → aviso, não bloqueante.
- **Metas desatualizadas:** ordem/PLANEJAMENTO citam 1.179/423/291; hoje são 437 saídas, 297 devoluções e ~1.620 ativos estimados. Usar as flags `--esperado-*` com os números do dia do export.

### 7. 4ª fonte (itens por quantidade) — NÃO é este arquivo ✅ respondido (15/07/2026)
A 3.2b espera um export limpo da "planilha de gestão online". Neste arquivo, o que existe é:
- `Acessórios Matriz`: bloco de saldos de só 10 itens (vários com `NO ESTOQUE` vazio) + log jan/2026;
- `Acessórios Linhares`: só log, sem saldos;
- `Perifericos Geral`: log de 416 movimentos (fev/2025 → **11/09/2026 — data futura!**), itens sem a granularidade do catálogo F3B.
→ **RESPONDIDO pelo Johnny:** os saldos de itens vêm de uma **planilha separada** (gestão online), fornecida na janela do go-live — a 3.2b segue como está na ordem, sobre esse export. `Perifericos Geral` e `Equipamentos Atrelados` **não são mais usados** (obsoletos) — nenhuma aba de acessórios deste xlsx entra na carga.

### 8. Pontos menores
- **`AllTabelas` está quebrada** (1.247 linhas, todas com `#REF!`, patrimônio vazio em 1.006) — nunca usar como fonte; exportar por aba.
- **Abas fora da carga** (confirmado pelo Johnny, 15/07/2026): `PivotFollowUp`, `DINAMICA`, **`Totais`**, **`Equipamentos Atrelados`** e **`Perifericos Geral`** não são mais utilizadas — não exportar, não importar. As 50 linhas `Reservada` do inventário entram pela reconciliação de estado (item 3); reservas que precisem de nº de chamado podem ser lançadas manualmente pós-go-live.

## Checklist para liberar a F4

- [x] ✅ Johnny (15/07/2026): pergunta 1 §13 respondida — Serra é filial própria; Filial-CE = Eusébio (5 filiais oficiais)
- [x] ✅ Johnny (15/07/2026): saldos de itens vêm de **planilha separada** (gestão online), fornecida no go-live
- [x] ✅ Johnny (15/07/2026): export = **7 CSVs por aba** (5 inventários + Saída + Devolução); `AllTabelas`, `PivotFollowUp`, `DINAMICA`, `Totais`, `Equipamentos Atrelados` e `Perifericos Geral` ficam de fora (obsoletas/derivadas)
- [ ] F4: parser de inventário por nome de coluna, 3 layouts, `Site` da linha decide a filial
- [ ] F4: passo de reconciliação (compra inicial → replay → ajuste final) + precedência Situação>Status
- [ ] F4: De→Para ampliado (motivos vazios/novos, unidades novas, `STFC`, termo `2413`) — registrar em DECISOES
- [ ] F4: inferência de prefixo via Hostname no `parsePatrimonio`
- [ ] F4: metas de contagem via `--esperado-*` com os números do export do dia

# Plano — Relatórios v2: o formato do e-mail, melhorado

**Proposta para validação · 14/07/2026 · sessão de planejamento (Johnny + Claude, Cowork)**

Origem: os dois e-mails semanais reais (22–26/06 com errata e 29/06–03/07, PDFs analisados na sessão) + spec §7 + relatório entregue na F3. Nesta sessão **nenhum código foi alterado** — este documento é o plano. Depois do OK do Johnny ele vira uma ordem de serviço (`docs/prompts/F3B-relatorios-v2.md`) e as atualizações de spec/planejamento descritas na §9.

> Regra 2 do CLAUDE.md respeitada: nenhum dado real dos e-mails (colaborador, patrimônio, chamado) aparece aqui — exemplos são fictícios ou placeholders.

---

## 1. Por que mudar

A F3 entregou o relatório da spec §7 (KPIs, gráficos, snapshot versionado, acesso por senha). Comparando com o e-mail real do analista, ficam três lacunas:

1. **Organização.** O e-mail é organizado por **grupo de equipamento** — equipamentos principais → acessórios/periféricos → componentes — com narrativa por categoria dentro de cada filial. O relatório F3 é organizado por métrica (KPIs, motivos, modelos). Quem recebe o e-mail há anos procura "Notebooks: quantas guardadas? quem está em manutenção?" e não encontra essa hierarquia.
2. **Metade do e-mail não existe no sistema.** Acessórios, periféricos e componentes controlados **por quantidade** (fones, mochilas, teclados, mouses, hubs, carregadores, SSDs, memórias…) estavam adiados para a F5. Sem eles o e-mail não pode ser aposentado por completo no go-live.
3. **As tabelas finais.** O e-mail fecha com "Relatório Semanal – Saídas" e "– Entradas (Devolução)": resumo por filial × motivo seguido de tabela detalhada linha a linha (data, unidade, categoria, marca/modelo, patrimônio, tipo, chamado, colaborador/setor, itens faltantes…). A F3 tem "últimas movimentações" (todos os tipos misturados) e o resumo textual, mas não as duas tabelas dedicadas, completas e separadas por direção.

**Decisão de escopo (Johnny, 14/07/2026): ordem única.** Antecipa-se da F5 o controle de quantidade e o relatório v2 nasce com os 3 grupos — o e-mail inteiro morre de uma vez no cutover.

## 2. O que o e-mail atual tem → como vira sistema

Mapeamento feito sobre os dois PDFs:

| No e-mail semanal | No sistema (v2) |
|---|---|
| Uma seção por filial (Matriz, CD-Afonso Pena, Linhares, Eusébio…) | Página por filial + consolidado com tabs (F3, mantém) |
| "Equipamentos Principais" por categoria, com "NN unidades guardadas" listadas por modelo | Grupo 1 · estoque do último dia do período, por categoria e por modelo |
| "NN unidades reservadas (#0000 #0001…)" | Reservados com nº de chamado (F3, mantém — passa para dentro do grupo 1) |
| Texto vermelho de manutenção que evolui semana a semana ("aguardando NF-e", "cotação efetuada em dd/mm…") | Obs da movimentação de envio/retorno + **anotações na linha do tempo** (recurso novo) |
| Tabela "ACESSÓRIOS E PERIFÉRICOS" (item, quantidade, status "N atrelados") | Grupo 2 · saldo por item + **reservas atreladas a chamado** (novo) |
| Tabela "COMPONENTES" (SSD, memórias por tipo/tamanho) | Grupo 3 · idem, catálogo com `grupo = componente` (novo) |
| "p.s.: faltam N mouses / a quantia não supre os chamados em aberto" | **Alerta automático de falta**: atrelados > saldo (novo) |
| "Relatório Semanal – Saídas / Entradas": resumo por filial × motivo + tabela detalhada | Tabelas detalhadas do período (§4.4) + resumo no formato do e-mail (F3, reposicionado) |
| ERRATA reenviada para todo mundo | Snapshot versionado (F3, já resolve) |
| Celular "uso comum" × "uso exclusivo" | Já coberto: são modelos/observações da ficha; não cria categoria nova (decisão §3.5) |

## 3. Decisões desta sessão (14/07/2026)

1. **Ordem única** — modelo de quantidade antecipado da F5; relatório v2 completo numa ordem de serviço só (F3B), antes da F4.
2. **Anotações na linha do tempo** — tabela nova `anotacoes` (imutável, autor + data), exibida na ficha do ativo e na seção de manutenção do relatório. É onde vive o "texto vermelho" que muda no meio de uma manutenção sem transição de estado.
3. **Atrelados com reserva por chamado** — lançamento de reserva de quantidade vinculado a nº de chamado; o relatório mostra saldo × atrelados e calcula falta automaticamente.
4. **"Manutenção por equipamento" nos grupos 2 e 3** (interpretação do plano, a validar): itens por quantidade não têm máquina de estados nem patrimônio; o papel da coluna STATUS do e-mail é cumprido por **atrelados + obs + alerta de falta**. Manutenção caso a caso existe só no grupo 1. Componente que sai para RMA = lançamento de saída com obs.
5. **Sem categoria nova para celulares** — "uso comum × exclusivo" do e-mail segue representado por modelo/observação; se doer na prática, vira campo na F5.
6. **Estoque "no último dia do período"** reconstruído por consulta as-of (§7) — snapshot regerado meses depois continua fiel ao período.
7. **Tabelas finais**: Saídas = tipos `saida` + `emprestimo` · Entradas = `devolucao` + `compra`. Transferências ganham bloco próprio quando houver (aparecem nas duas filiais, regra 5 da spec §8). Envio/retorno de manutenção não entram nas tabelas finais — vivem na seção de manutenção do grupo 1.
8. **Catálogo granular** (Johnny, 14/07/2026) — memórias são itens separados por DDR e tamanho (como no e-mail) e "kit teclado+mouse" é item próprio do catálogo.
9. **Sem export CSV nas páginas de relatório** (Johnny, 14/07/2026) — o botão de exportar CSV entregue na F3 **sai** na v2; ficam a impressão limpa e o "copiar texto" do resumo. O backup CSV administrativo (spec §6) não é afetado.
10. **Demo pré-F4 já no formato v2** (Johnny, 14/07/2026) — a validação com os destinatários do e-mail espera a F3B.
11. **Carga inicial de saldos vem da planilha de gestão online** (Johnny, 14/07/2026) — no go-live, os saldos de acessórios/componentes entram por script em `scripts/import/` a partir do export da planilha (mesma doutrina da F4: carga única na janela, **nunca** tela de importação). Digitação manual fica só como plano B se o arquivo não sair.

## 4. Nova estrutura da página (vale para ao vivo e snapshot)

```
┌ Cabeçalho: filial · período · versão (se snapshot)
│ Chips-âncora: [Principais] [Acessórios] [Componentes] [Saídas] [Entradas]
├ 1. KPIs gerais (tiles F3 + Δ vs período anterior) + série do período
├ 2. GRUPO — Equipamentos principais            (§4.1)
├ 3. GRUPO — Acessórios e periféricos           (§4.2)
├ 4. GRUPO — Componentes                        (§4.3)
├ 5. Pendências (F3, mantém)
├ 6. Saídas do período — tabela detalhada       (§4.4)
├ 7. Entradas do período — tabela detalhada     (§4.4)
└ 8. Resumo no formato do e-mail (copiar texto) + impressão
```

Navegação: chips-âncora fixos no topo (o relatório fica longo com 3 grupos); no mobile, seções recolhíveis; impressão com quebra de página por grupo.

### 4.1 Grupo — Equipamentos principais

- **KPIs do grupo**: guardados · reservados · em manutenção · emprestados, cada um com Δ vs período anterior.
- **Estoque no último dia do período** — barras horizontais empilhadas: uma barra por categoria (notebook, desktop, monitor, celular, tablet), segmentos por status, rótulo numérico em cada segmento + total na ponta.
- **Disponíveis por modelo** — bar list agrupada por categoria (o "02 Modelo A / 01 Modelo B" que abre o e-mail), ordenada por quantidade.
- **Reservados com chamado** — mantém F3 (chips com nº do chamado), dentro do grupo.
- **Manutenção caso a caso** — um card por ativo: patrimônio, modelo, filial, chamado, **dias em manutenção** (badge numérico) e a mini-linha do tempo: obs do envio → anotações intermediárias (autor + data) → obs do retorno se houver no período. Inclui também quem **voltou** de manutenção dentro do período (fechamento do caso).
- **Saídas e entradas por motivo** — barras horizontais ordenadas com rótulo (F3, mantém — passa para dentro do grupo).

### 4.2 Grupo — Acessórios e periféricos

- **Tabela por item** (a peça central — leitura exata de número):

| Item | Saldo | Atrelados | Δ período | Falta | Obs |
|---|---|---|---|---|---|
| Fone | **40** | 12 | ▲ +5 | — | |
| Mouse | **0** | 9 | ▼ −3 | **faltam 9** | não supre os chamados em aberto |

  (Números fictícios.) Saldo em destaque com `tabular-nums`; Δ = entradas − saídas do período (verde/vermelho); **Falta = max(0, atrelados − saldo)** vira chip vermelho — é o "p.s." do e-mail, agora automático. Obs = última observação relevante de lançamento do item no período.
- **Movimentação do período por item** — barras divergentes: entradas para a direita (azul), saídas para a esquerda (amarelo), rótulo de valor nas pontas. Só itens com movimento no período.
- **Carimbo de frescor**: "último lançamento em dd/MM" no rodapé do grupo — se ninguém lança, o relatório confessa a idade do dado em vez de mentir.

### 4.3 Grupo — Componentes

Idêntico ao 4.2, filtrando o catálogo por `grupo = componente` (SSD, memórias por tipo/tamanho…). Componentes raramente têm atrelados — a coluna aparece só se houver valor.

### 4.4 Tabelas detalhadas do período

O fecho do e-mail, agora ordenável, filtrável e exportável. Título com contagem ("NN saídas no período") e resumo por filial × motivo acima de cada tabela (reaproveita o gerador de resumo da F3).

**Saídas** (`saida` + `emprestimo`): Data · Filial · Categoria · Marca/Modelo · Patrimônio · Tipo · Motivo · Chamado · Colaborador/Setor · Termo · Obs

**Entradas** (`devolucao` + `compra`): Data · Filial · Categoria · Marca/Modelo · Patrimônio · Tipo · Motivo · Colaborador · Setor · Itens faltantes · Obs

**Transferências** (bloco condicional): Data · De → Para · Categoria · Marca/Modelo · Patrimônio · Chamado · Obs

Cada tabela com filtros internos (categoria, motivo, filial no consolidado) e a coluna Obs sempre presente — é onde vive o contexto que hoje é texto vermelho. Sem export CSV (decisão §3.9): quem precisar do arquivo usa a impressão limpa.

## 5. Gráficos — escolha por informação

Pedido do Johnny: visual agradável, melhor tipo por informação, foco em enxergar quantidade. Regras gerais: **rótulo de valor sempre visível** (tooltip é complemento, não fonte), `tabular-nums`, paleta do mockup (amarelo WAP `#eda100` = saídas, azul `#2a78d6` = entradas, neutros para status), tudo via componente `chart` do shadcn (Recharts v3 — stack travada, nada novo).

| Informação | Gráfico | Por quê |
|---|---|---|
| Volume do período (entradas × saídas no tempo) | Barras verticais agrupadas, granularidade adaptativa dia/semana/mês (F3 já tem), rótulo no topo | Comparação lado a lado por intervalo; número legível sem hover |
| Estoque último dia (categoria × status) | Barras horizontais empilhadas com rótulo por segmento + total | Horizontal põe rótulo e número na mesma linha de leitura; empilhado mostra composição sem esconder o total |
| Disponíveis por modelo | Bar list (barra proporcional + número grande à direita) | Muitos rótulos longos e valores pequenos (1–16): pizza e barra vertical ficam ilegíveis |
| Saídas/entradas por motivo | Barras horizontais ordenadas com rótulo | Ranking direto; motivo é rótulo longo |
| Movimentação por item (grupos 2–3) | Barras divergentes (entrada ⇢ direita, saída ⇠ esquerda) | Dois fluxos e o líquido num olhar só |
| Saldo por item | **Tabela**, não gráfico | Grandezas díspares (dezenas de fones × meia dúzia de hubs) distorcem qualquer barra; esse dado é para leitura exata |
| KPIs | Tiles com número grande + Δ vs período anterior | O e-mail é lido pelos números; o delta dá tendência sem custo visual |

Anti-padrões (proibidos na v2): pizza/donut para comparar categorias, 3D/gradiente decorativo, valor só no tooltip, legenda longe do dado, eixo truncado que exagera diferença.

## 6. Modelo de dados (migrations aditivas — nada existente muda)

Mesma filosofia do sistema: **o lançamento é a fonte da verdade; saldo é derivado.**

### 6.1 `itens` — catálogo de acessórios e componentes

`id · nome · grupo ('acessorio' | 'componente') · ativo (bool) · ordem`. Gerenciado em `admin/itens` (CRUD igual a `admin/motivos`). Volume esperado: ~20–30 itens. Granularidade (Johnny, 14/07/2026): memórias separadas por DDR e tamanho (ex. fictício: "Memória notebook DDR4 8GB") e kits como itens próprios ("Kit teclado+mouse"). Itens são **quantidade pura** — sem patrimônio, sem service tag, sem máquina de estados (a pergunta 6 da spec §13 continua respondida como está: acessório não vira ativo).

### 6.2 `lancamentos_item` — movimentação de quantidade

`item_id · filial_id · tipo · quantidade (>0) · chamado · colaborador (opcional) · data · observacao · criado_por · created_at · estorna_id (opcional)`.

Tipos: `entrada` · `saida` · `reserva` · `liberacao` · `ajuste`. Imutável como `movimentacoes`: corrigir = lançamento inverso apontando `estorna_id`. Derivações (views/RPCs, padrão da migration 0011):

- **saldo**(item, filial) = Σ entradas − Σ saídas ± ajustes — **nunca negativo** (trigger valida, como a máquina de estados; a UI é a segunda linha).
- **atrelados**(item, filial) = Σ reservas − Σ liberações − Σ saídas que citam chamado com reserva aberta (a saída com o mesmo chamado consome a reserva; `liberacao` cancela sem consumir).
- **falta** = max(0, atrelados − saldo) — o alerta automático.
- Tudo com variante **as-of** (Σ até uma data) para snapshot e período retroativo.

### 6.3 `anotacoes` — nota avulsa na linha do tempo do ativo

`ativo_id · texto · criado_por · created_at`. Imutável, sem transição de estado. Aparece intercalada na linha do tempo da ficha e na seção de manutenção do relatório (anotações feitas enquanto o ativo estava `em_manutencao`). Botão "Anotar" na ficha do ativo.

### 6.4 Infra da mesma leva

- RPCs de agregação novas: saldo/atrelados por grupo, movimentação por item no período, **estoque as-of de ativos** (§7).
- Publication do Realtime ganha `lancamentos_item` e `anotacoes`.
- RLS: modelo atual (operador logado = tudo; visualizador por senha = nada no banco, servido pelo servidor).
- **Seed fictício estendido**: catálogo + lançamentos com sazonalidade + anotações de manutenção (guardas anti-produção mantidas).
- **Snapshot v2**: o jsonb ganha `schema: 2` + seções dos grupos 2–3 e tabelas detalhadas; o leitor mantém compatibilidade com snapshots v1 (normalização no `CorpoRelatorio`, padrão já usado na F3).

## 7. Estoque "no último dia do período" (correção conceitual)

Hoje as listas de estado (disponíveis, reservados, manutenção) usam o estado **atual** — correto quando o período termina hoje, errado para snapshot regerado depois (errata) ou período retroativo. Na v2:

- **Ativos**: estado no dia X = resultado da última movimentação efetiva ≤ X (função SQL por `DISTINCT ON`, aplicando a mesma semântica do trigger — par movimentação+estorno se anula). O histórico completo existe desde a carga, então a reconstrução é exata.
- **Itens**: saldo no dia X = Σ lançamentos ≤ X.
- **Fast path**: página ao vivo com período terminando hoje continua lendo o estado derivado (barato). O as-of só entra quando o fim do período é passado.
- Teste: estender o roteiro SQL da máquina de estados (F1) com casos as-of incluindo estorno no meio do período.

## 8. Operação — o que muda no dia a dia

1. **Lançamento de quantidade** — tela nova enxuta (item → filial → tipo → quantidade → chamado/obs), meta ≤15 s, com "repetir último" e data default (mesma doutrina anti-Excel da F2). Compra de acessório **não** cria ativo — é só quantidade.
2. **Anotar** — botão na ficha do ativo; um clique, um texto, salvo com autor e data.
3. **Admin** — `admin/itens` para o catálogo.
4. **Checklist de devolução** (itens faltantes) segue como está e **não** movimenta quantidade automaticamente — integração automática tem risco de dupla contagem; fica documentada como candidata à F5, a decidir com uso real.
5. **Carga inicial dos saldos** — decidido (§3.11): na janela do go-live (F4), mini-script em `scripts/import/` lê o export da planilha de gestão online (fornecido pelo Johnny) e gera os lançamentos iniciais por item × filial, com dry-run e conferência de contagens como o resto da carga. Plano B: lançamentos de `ajuste` manuais (~20–30 itens × filiais).

## 9. Impacto nos documentos e fases

| Artefato | Mudança quando este plano for aprovado |
|---|---|
| `ESPECIFICACAO.md` | §7 reescrita com a estrutura v2; §2 (não-objetivos) e §11/F5 atualizados — quantidade deixa a F5; nova subseção do modelo de itens; pergunta 6 da §13 permanece válida (quantidade ≠ ativo com patrimônio) |
| `PLANEJAMENTO.md` | Fase **F3B — Relatórios v2** inserida entre F3 e F4; F5 perde "acessórios por quantidade" e mantém o restante (§10 abaixo) |
| `docs/prompts/F3B-relatorios-v2.md` | Nova ordem de serviço no formato padrão (pré-requisitos → escopo proibido → tarefas numeradas → aceite), redigida a partir deste plano |
| `CLAUDE.md` | Estrutura de pastas prescrita ganha as rotas novas (`admin/itens`, tela de lançamento de quantidade) — atualizar ANTES de rodar a OS (regra do PLANEJAMENTO §9) |
| **F4** | Ganha a carga de saldos iniciais de itens a partir do export da planilha de gestão online (§3.11 — a planilha vira a 4ª fonte da carga única); o "pronto quando" passa a incluir **e-mail semanal aposentado por completo** (hoje diz só "equipamentos principais") |
| `mockups/` | Recomendado (opcional): mockup HTML do layout v2 antes da OS — barato e evita retrabalho visual; `dashboard-relatorio.html` vira referência histórica |
| `README.md` / `DECISOES.md` | Status e registro de decisões quando a OS rodar |

Sugestão de execução da F3B em dois blocos de commit (uma OS só): **B1** banco + operação (migrations, telas de lançamento/anotação, admin/itens, seed) → **B2** relatório v2 (layout por grupos, gráficos, tabelas, snapshot schema 2, as-of).

## 10. Fora do escopo da v2 (continuam na F5)

Kits de lote salvos · alertas por e-mail · HTML autocontido do snapshot · upload de termos (Storage) · ECharts (upgrade documentado) · integração checklist-devolução ↔ quantidade · **estoque mínimo por item** (reorder point — candidato natural assim que os saldos existirem) · dark mode.

## 11. Riscos e mitigações

1. **Relatório longo** (3 grupos × conteúdo) → chips-âncora, seções recolhíveis no mobile, quebra de página por grupo na impressão.
2. **Hábito novo de lançar quantidade** — se ninguém lança, os grupos 2–3 mentem → tela ≤15 s, "repetir último" e o **carimbo de frescor** ("último lançamento em dd/MM") no relatório: o dado confessa a própria idade.
3. **As-of com estorno no meio** — regra única no SQL, coberta pelo roteiro de testes estendido (§7).
4. **Snapshot maior** — poucos KB a mais por semana; irrelevante no free tier.
5. **Ordem maior que o padrão** — mitigada pelos dois blocos de commit (§9) com lint/build limpos em cada um.

## 12. Aceite da futura OS (o que o Johnny confere)

- [ ] Relatório de uma filial fictícia abre com os 3 grupos, chips-âncora e KPIs com Δ.
- [ ] "Disponíveis por modelo" e estoque por categoria×status batem com o seed (conferência SQL).
- [ ] Reserva de item com chamado aparece em atrelados; atrelados > saldo gera o chip "faltam N".
- [ ] Lançamento de quantidade em ≤15 s com "repetir último"; saldo nunca fica negativo (erro amigável).
- [ ] Anotação em ativo em manutenção aparece na ficha e na seção de manutenção do relatório.
- [ ] Tabelas de Saídas e Entradas com todas as colunas (§4.4), filtros e contagem no título.
- [ ] Nenhum export CSV nas páginas de relatório (removido o da F3); impressão limpa mantida.
- [ ] Snapshot gerado congela os 3 grupos; regerar período retroativo usa as-of; snapshot v1 antigo continua abrindo.
- [ ] Impressão quebra por grupo; mobile (375px) sem scroll lateral.
- [ ] Realtime/auto-refresh e acesso por senha inalterados; RLS conferida nas tabelas novas.
- [ ] `npm run lint` e `npm run build` limpos; migrations aditivas versionadas; tipos regenerados.

## 13. Pendências (atualizado em 14/07/2026)

**Todas respondidas pelo Johnny em 14/07/2026** — o plano está completo para virar OS após a aprovação dele:

1. ~~Lista oficial do catálogo de itens~~ — memórias separadas por DDR e tamanho; "kit teclado+mouse" é item próprio (§3.8 e §6.1). Nomes finais dos itens são conferidos com o analista durante a F3B.
2. ~~Demo pré-F4~~ — será feita já no formato v2; a demo espera a F3B (§3.10).
3. ~~Carga inicial de saldos~~ — via export da planilha de gestão online, por script na janela do go-live (§3.11); manual só como plano B.


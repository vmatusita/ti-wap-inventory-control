# Novo relatório de estoque TI — o que vai aparecer

> **Status: histórico — documento de aprovação da F3B (✅ implementado em 14/07/2026).** Descrevia o relatório para o analista de suporte aprovar antes da construção; preservado como registro da decisão (citado pela ordem `prompts/F3B-relatorios-v2.md`).

**Para aprovação do analista de suporte · 14/07/2026**

O relatório semanal que hoje é montado e enviado por e-mail vai passar a ser uma **página na internet, com senha**: sempre atualizada, uma por filial (+ uma geral). Toda sexta, um clique gera o **relatório da semana**, que fica guardado e não muda mais — se algo for corrigido depois, sai uma versão nova (acabou o e-mail de errata).

Este documento mostra **o que vai aparecer e como**, na ordem da página. Todos os exemplos são inventados. Só precisamos que você confira: **falta algo que você reporta hoje? Sobra algo?**

---

## 1. Topo — os números da filial

Cartões grandes com os totais de agora: **total de ativos · em estoque · em uso · reservados · em manutenção · em triagem · reserva técnica**, cada um com uma setinha comparando com a semana anterior (▲ ▼).

Abaixo, um gráfico de barras com as **saídas e entradas de cada dia da semana**, com o número em cima de cada barra.

## 2. Equipamentos principais

*(notebooks, desktops, monitores, celulares, tablets)*

- **Guardadas por modelo** — a lista que abre o e-mail de hoje, ex.: `02 Modelo A · 01 Modelo B · 01 Modelo C`, com uma barrinha ao lado para comparar de relance.
- **Estoque por categoria** — barras deitadas mostrando quantos de cada categoria e em que situação (guardado, reservado, manutenção…), com o número escrito em cada pedaço.
- **Reservadas** — quantidade + os números dos chamados, ex.: `07 reservadas (#0001 #0002 …)`.
- **Em manutenção, caso a caso** — um quadro por equipamento: patrimônio, modelo, chamado, **há quantos dias está na manutenção**, e as observações com **data e autor** — o "texto vermelho" de hoje, ex.: *"05/07 — recolhido, problema de tela"*, *"08/07 — aguardando NF-e"*. Dá para adicionar atualização a qualquer momento, sem esperar o relatório. Quem voltou de manutenção na semana também aparece.
- **Emprestados** — quem está fora temporariamente, com observação.
- **Saídas e entradas da semana por motivo** — barras deitadas, ex.: `Novo colaborador ████ 4 · Troca/upgrade ██ 2`.

## 3. Acessórios e periféricos

*(fone, mochila, teclado, mouse, kit teclado+mouse, mousepad, hub, adaptador, carregadores…)*

Uma tabela por filial, no lugar da tabela do e-mail:

| Item | Quantidade | Atrelados | Semana | Falta | Obs |
|---|---|---|---|---|---|
| Fone | **40** | 12 | ▲ +5 | — | |
| Mouse | **0** | 9 | ▼ −3 | **faltam 9** | não supre os chamados abertos |

- **Atrelados** = separados para chamados abertos, como hoje.
- **Semana** = quanto entrou/saiu no período.
- **Falta** = o aviso *"faltam N"* que hoje você escreve à mão **sai sozinho** quando os atrelados passam do estoque.
- Um gráfico pequeno mostra o que mais **entrou e saiu** na semana, item por item.

## 4. Componentes

*(SSD e memórias — separadas por DDR e tamanho, como hoje: "Memória notebook DDR4 8GB" é uma linha, "DDR4 16GB" é outra)*

Mesma tabela da seção 3.

## 5. Pendências

O que precisa de atenção: termos de responsabilidade não assinados, devoluções com itens faltando, equipamentos parados na triagem.

## 6 e 7. Saídas e Entradas da semana — as tabelas completas

As duas tabelas que fecham o e-mail, agora com filtro e ordenação:

- **Saídas**: data · filial · categoria · marca/modelo · patrimônio · tipo (saída/empréstimo) · motivo · chamado · colaborador/setor · termo · obs
- **Entradas**: data · filial · categoria · marca/modelo · patrimônio · tipo (devolução/compra) · motivo · colaborador · setor · itens faltantes · obs
- Transferências entre filiais aparecem num bloco separado quando houver.

Cada uma com o total no título, ex.: **"Saídas — 19 no período"**.

## 8. Resumo em texto

O parágrafo no formato do e-mail (*"No período de X a Y, foram realizadas N saídas, sendo: …"*), gerado sozinho, com botão **copiar texto** — e botão de **imprimir** a página inteira, limpa, se alguém pedir arquivo.

---

## O que melhora em relação ao e-mail

- **Sempre atualizado** — corrigiu, o link já mostra o certo; ninguém reenvia nada.
- **"Faltam N" automático** — o sistema calcula e avisa.
- **Manutenção com histórico** — cada atualização fica registrada com data e autor, nada se perde entre uma semana e outra.
- **Sem planilha paralela** — acessórios e componentes passam a viver no mesmo sistema.

## Para você aprovar

1. A **ordem e o conteúdo** das seções acima batem com o que você reporta hoje?
2. A **lista de itens** (seções 3 e 4) está completa? Falta algum item ou agrupamento?
3. Tem algum dado que aparece aqui e **não precisa**? Ou algo que você escreve no e-mail e **não encontrou**?

( ) Aprovo como está  ( ) Aprovo com os ajustes: ______________________

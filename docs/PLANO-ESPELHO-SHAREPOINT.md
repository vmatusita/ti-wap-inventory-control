# Plano — Espelho da planilha do SharePoint (v2) e aposentadoria da planilha

> **Status: proposta v2 para validação do Johnny · 11/08/2026.** Substitui a v1 de 10/08. O que mudou: **o consentimento de administrador no Entra ID não foi obtido** (tentado em 11/08 — a TI da WAP não liberou o app/API), então o transporte automático via Graph sai de cena **por ora**; o Johnny aceitou passos manuais se preciso; e o plano passa a incluir, como objetivo de primeira classe, **deixar de usar a planilha** (§7). A v1 continua íntegra no histórico do git; o roteiro do Entra ([`ROTEIRO-ESPELHO-ENTRA.md`](ROTEIRO-ESPELHO-ENTRA.md)) fica **em espera** — se a TI um dia liberar, ele volta a valer sem retrabalho (§2, trilho A).

> Regra 2 do `CLAUDE.md` respeitada: nenhum dado real aqui nem no repositório; layout da planilha vira constantes + fixtures fictícias. Nesta sessão nenhum código foi alterado — após o OK, vira a ordem de serviço F34.

---

## 1. O que o bloqueio muda — e o que não muda

O coração do plano **nunca foi a API**: é o **gerador** — o sistema montar, sozinho, a planilha inteira no layout legado a partir do banco (ExcelJS, já na stack), com carimbo de data/hora e vocabulário De→Para invertido (spec §5). A Graph API era só o **carteiro** que levava o arquivo até o SharePoint. O admin negou o carteiro; o gerador continua de pé, idêntico ao da v1 (princípios da §3 da v1 valem todos: mão única, estado completo, somente-leitura para humanos, falha ruidosa, transitório).

A v2 troca o carteiro por dois trilhos que **não pedem permissão de ninguém** — e promove a aposentadoria da planilha de "critério de saída" a **plano com fases** (§7). Detalhe que vale sublinhar: mesmo no trilho mais manual, **abrir o Excel continua desnecessário** — ninguém digita mais nada; no máximo se arrasta um arquivo.

## 2. Os três trilhos

| Trilho | Como o arquivo chega ao SharePoint | Esforço humano | Estado |
|---|---|---|---|
| **B — quase automático** *(padrão da v2)* | Tarefa agendada no Windows do Johnny baixa o `.xlsx` do sistema e salva na pasta da biblioteca **sincronizada pelo OneDrive**; o OneDrive sobe a versão nova sozinho, como o usuário Johnny — que **já tem** permissão de escrita na planilha (nenhum acesso novo, nenhum admin) | zero no dia a dia (máquina ligada basta) | **ativo** |
| **C — manual de reserva** *(sempre disponível)* | Botão **"Baixar planilha (.xlsx)"** no sistema → substituir o arquivo no SharePoint (arrastar para a biblioteca no navegador e confirmar "Substituir", ou colar na pasta sincronizada) | ~1 min, quando precisar (férias, máquina desligada, urgência) | **ativo** |
| **A — automático total** *(na gaveta)* | Graph API + `Sites.Selected` (a v1 inteira) — servidor→SharePoint a cada 10 min, sem máquina no meio | zero | **bloqueado: exige admin do tenant.** Roteiro pronto e em espera; se liberar, pluga-se o carteiro e nada do resto muda |

Nos três trilhos o arquivo é **o mesmo item** do SharePoint (mesmo link, atalhos preservados) e cada substituição vira uma **versão** no histórico da biblioteca — backup nativo, restaurável pela própria interface.

## 3. Arquitetura (v2)

```
banco → (mesmas queries dos relatórios/CSV) → gerador ExcelJS
        layout legado · carimbo "Gerada pelo Estoque TI em dd/MM HH:mm — NÃO EDITAR"
  ├─ GET /api/espelho/planilha            ← tarefa agendada (header x-espelho-chave)
  │    responde 204 "nada mudou" quando o banco não mudou desde a última geração
  │    (o script então NÃO grava — evita versão inútil no SharePoint)
  ├─ botão "Baixar planilha (.xlsx)"      ← trilho C (nível administrador)
  └─ registro em espelho_execucoes + carimbo "há mudança desde a última geração"

Windows do Johnny (ou do suplente):
  Agendador de Tarefas → scripts/espelho/baixar-espelho.ps1 (versionado no repo)
  a cada 30 min → baixa → grava em C:\…\OneDrive\…\{Site} - Documentos\{planilha}.xlsx
  → OneDrive sincroniza → SharePoint versiona → consumidores veem a planilha atual

admin/espelho: última geração × última movimentação ("planilha atrasada há Xh?"),
histórico de gerações/downloads, instruções do setup, aviso âmbar/vermelho de atraso
```

Diferenças honestas em relação à v1: a atualização acontece **quando a máquina do Johnny está ligada** (na prática: horário comercial — exatamente quando os consumidores olham a planilha); o OneDrive precisa estar logado e saudável; e o computador do Johnny vira peça de infraestrutura **documentada** — o script está no repositório e qualquer colega o assume em 10 minutos (§5). O carimbo na própria planilha denuncia atraso, e o painel também.

## 4. O que a ordem F34 constrói (diferenças vs v1)

Igual à v1: migration aditiva (próxima livre, ≥ `0108`) com `espelho_execucoes` + carimbo de mudança; `src/lib/espelho/` (`layout.ts`, `montar.ts` — funções puras, Vitest com dados fictícios); guarda de sanidade (leitura vazia/encolhida **não gera** arquivo — falha ruidosa); tela `admin/espelho`; página de ajuda; emendas de doc (§12).

O que muda:

- **Sai** `graph.ts`, o cron do `vercel.json` e as envs `MS_*`/`ESPELHO_DRIVE_ID`/`ESPELHO_ITEM_ID`.
- **Entra** a rota `GET /api/espelho/planilha`: exige o header `x-espelho-chave` = env `ESPELHO_CHAVE` (comparação em tempo constante), nunca cacheia, loga cada download em `espelho_execucoes`, responde **204** quando nada mudou desde a última geração OK e `Content-Disposition` com o nome padrão do arquivo.
- **Entra** o botão **"Baixar planilha (.xlsx)"** em `admin/espelho` (nível administrador; registra em `eventos_admin`).
- **Entra** `scripts/espelho/baixar-espelho.ps1` + o comando `schtasks` pronto — **ferramenta, não feature** (mesmo estatuto de `scripts/import/`): 2 variáveis a editar (URL do sistema + caminho local), tolera 204 e falha de rede sem drama, escreve log local mínimo.
- Env nova no Vercel: só `ESPELHO_CHAVE` (gerada com o one-liner de `crypto` já usado no `.env.example`). A chave também fica na máquina que roda a tarefa — risco aceito e registrado (§8): ela só serve o `.xlsx` que o usuário já enxerga hoje, viaja por HTTPS e rotaciona trocando a env.

## 5. Setup na máquina (roteiro do trilho B — 15 min, sem admin)

1. **Sincronizar a biblioteca**: abrir a biblioteca do SharePoint onde a planilha mora → botão **"Sincronizar"** → a pasta aparece no Explorador de Arquivos (`{Empresa}\{Site} - Documentos\…`). Quem já usa "Adicionar atalho ao OneDrive", vale igual.
2. **Copiar o script** do repositório (`scripts/espelho/baixar-espelho.ps1`) para uma pasta local e preencher as 2 variáveis do topo (URL do sistema; caminho do arquivo dentro da pasta sincronizada — **começando pela cópia de homologação**).
3. **Colar a chave** (`ESPELHO_CHAVE`) no arquivo de configuração ao lado do script (o mesmo valor cadastrado no Vercel).
4. **Criar a tarefa** no Agendador de Tarefas com o comando `schtasks /create …` pronto no cabeçalho do script (a cada 30 min; roda quando a máquina está ligada; sem janela pop-up).
5. **Testar**: executar a tarefa à mão → versão nova aparece no SharePoint → `admin/espelho` registra o download. Fazer 1 mudança no sistema e rodar de novo: a planilha reflete; rodar sem mudar nada: 204, nenhuma versão nova.
6. **Virada** (igual E2 da v1): conferir a cópia de homologação por alguns dias → backup datado do arquivo real (basta o histórico de versões + uma cópia "pré-espelho" na pasta) → trocar o caminho no script para o arquivo real → comunicado (§7, R1).

## 6. Decisões propostas (vetáveis na aprovação — defaults valem se nada for dito)

| # | Decisão | Proposta v2 | Alternativa |
|---|---|---|---|
| 1 | Transporte | **Trilho B** (OneDrive + tarefa agendada) com **C** de reserva | Só C (100% manual, 1×/dia) |
| 2 | Cadência da tarefa | **A cada 30 min** com a máquina ligada; 204 evita versão inútil | 15 min / 1 h / 2× ao dia |
| 3 | Dono da tarefa | **Johnny**, com um suplente nomeado no R0 (§7) | Máquina fixa da TI que fica sempre ligada, se existir |
| 4 | Quem vê o botão de download | **Administrador** | Estender a Operador |
| 5 | Layout/vocabulário | **Os da planilha atual** (v1, decisão 3) | Layout do sistema |
| 6 | Escopo | **1 arquivo**; alvo inicial = **cópia de homologação**, depois o real | — |
| 7 | Trilho A (API) | **Fica na gaveta, pronto** — reapresentar à TI depois do espelho rodando estável (argumento fica mais forte com o processo provado) | Descartar de vez (não recomendado) |

## 7. Aposentar a planilha — o plano dentro do plano

O espelho não é o destino: é a **ponte**. A planilha não morre por decreto — morre quando **ninguém mais precisa dela**. E o substituto de quem só *consulta* já existe e já está pronto no sistema: os **relatórios com acesso por senha** (link sempre atualizado, por filial e consolidado, sem precisar de conta — F3), mais os snapshots semanais para quem quer a "foto de segunda-feira". A rampa:

**R0 — Mapa dos consumidores** *(insumo do Johnny, ~30 min — pode andar já, antes da ordem)*
Lista nominal: **quem** abre a planilha hoje e **para quê** (conferir estoque? achar com quem está um equipamento? relatório pra chefia?). Para cada uso, o equivalente no sistema/relatório. Uso sem equivalente = **gap**, e gap vira backlog do sistema — é assim que a confiança se constrói de verdade. Também sai daqui o **suplente** da tarefa agendada (decisão 3).

**R1 — Espelho no ar + comunicado** *(semanas 1–2)*
Espelho rodando no arquivo real. Comunicado curto (modelo na ordem): a planilha agora se atualiza sozinha a partir do sistema; **não editem mais nada nela** (edição manual é sobrescrita); divergência = avisar a TI. A planilha ganha, além do carimbo, uma **primeira aba "MUDAMOS"** com o link do relatório e a instrução de pedir a senha à TI.

**R2 — Migração consumidor a consumidor** *(semanas 3–6)*
Checklist nominal a partir do R0: recebeu a senha? abriu o link? o que ainda o faz voltar à planilha? Cada resposta ou fecha um consumidor ou abre um gap nomeado. O relatório já cobre o essencial (KPIs, tabelas com busca/filtro no link, impressão A4, snapshots); o que faltar, entra na fila de fases do sistema com dono e número.

**R3 — Gatilho de congelamento** *(por critério, não por data)*
Congela quando: **4 semanas** sem edição manual na planilha (conferível no histórico de versões — só as versões do espelho aparecem), **zero** reclamação de divergência aberta, e **todos** os consumidores do R0 confirmados no link. Aí a cadência cai para 1×/dia e anuncia-se a data.

**R4 — Congelamento e ata**
Última geração com aba única *"ARQUIVO HISTÓRICO desde dd/MM/yyyy — consulte o sistema ou o relatório (link)"*; arquivo renomeado com prefixo `[HISTÓRICO]` (o link antigo continua abrindo — id estável); tarefa agendada desligada; decisão registrada em `DECISOES.md`. A planilha morre sem ninguém sentir falta — que é a única morte que pega.

Papel do bloqueio da TI nessa história: **nenhum**. A rampa R0→R4 independe de API — o trilho B/C alimenta a ponte igualzinho. Se o trilho A for liberado no meio do caminho, só encurta o R1–R2 (atualização 24/7); se nunca for, o R4 chega do mesmo jeito.

## 8. Riscos e mitigações (v2)

| Risco | Mitigação |
|---|---|
| Máquina do Johnny desligada/férias → planilha atrasa | Carimbo na planilha + aviso âmbar/vermelho no `admin/espelho`; suplente (R0); trilho C em 1 min de qualquer navegador; se virar dor crônica, decisão 3-alternativa (máquina fixa) ou reapresentar o trilho A |
| OneDrive dessincronizado/deslogado | Ícone do OneDrive na bandeja + conferência semanal barata (data do carimbo × data da versão no SharePoint, ambas visíveis) |
| Alguém com o arquivo aberto no Excel **desktop** na hora do sync → cópia de conflito do OneDrive | Política somente-leitura anunciada (leitura no navegador não trava nem conflita); conferência semanal remove cópias de conflito; cadência com 204 reduz gravações |
| Chave `ESPELHO_CHAVE` vaza (fica na máquina da tarefa) | HTTPS sempre; a chave só serve o `.xlsx` (dado que o usuário já vê hoje); rotação = trocar a env + o arquivo local; log de todo download no painel |
| Leitura falha → planilha vazia/encolhida | Guarda de sanidade (igual v1): recusa gerar, acusa no painel, versão anterior permanece |
| Alguém edita a planilha no intervalo | Sobrescrito no ciclo seguinte — comportamento anunciado (R1); reincidência é conversa de gestão |
| Versões demais na biblioteca | 204-quando-nada-mudou: só mudança real gera versão |

## 9. Custo — conferência R$ 0 (regra 3)

Nada novo a pagar: gerador na infra atual (Vercel Pro + Supabase Free), **zero dependência npm nova** (ExcelJS já aprovado na F7G; a rota usa o runtime padrão), PowerShell e Agendador de Tarefas são nativos do Windows, OneDrive já é usado na WAP. Entra ID/Graph: fora do desenho enquanto bloqueado. Power Automate: segue rejeitado (conector HTTP é premium — v1, §6).

## 10. Definição de pronto da ordem (F34, v2)

- [ ] `lint` / `build` / `test` limpos; montagem coberta por testes com dados fictícios; guarda de sanidade provada.
- [ ] Rota protegida: sem header → 401; com header → `.xlsx` válido; nada mudou → 204; tudo logado em `espelho_execucoes`.
- [ ] Botão de download funcionando com trilha em `eventos_admin`.
- [ ] `scripts/espelho/baixar-espelho.ps1` + `schtasks` testados de ponta a ponta na máquina do Johnny contra a **cópia de homologação** (contagens por aba batendo com o relatório — números na ata).
- [ ] `admin/espelho` mostrando última geração × última movimentação, com os avisos de atraso.
- [ ] Virada executada (§5.6) + comunicado R1 enviado; R0 preenchido.
- [ ] Emendas de doc (§12) aplicadas; ata em `DECISOES.md`; checklist autoverificado (regra 7).

## 11. Fora de escopo declarado (backlog)

Trilho A enquanto o admin não liberar (fica pronto na gaveta); sincronização de **entrada** e "modo Atualizar" (seguem adiados — F7/regra 2); e-mail de alerta; múltiplas planilhas; qualquer mudança nos relatórios além do necessário para os gaps do R2 (que entram como fases próprias, não nesta ordem).

## 12. Emendas de documentação previstas (na execução)

As da v1 (README, `CLAUDE.md`, spec §7, `ARQUITETURA.md`, `.env.example` — agora só `ESPELHO_CHAVE` —, página de ajuda) **mais**: nota de status "em espera" no `ROTEIRO-ESPELHO-ENTRA.md` (feita hoje) e a rampa R0–R4 registrada como plano vivo neste documento, com o checklist do R2 preenchido em `DECISOES.md` conforme avança.

## Fontes (verificação de 10/08/2026, mantidas da v1)

- Excel/workbook API sem permissão de aplicação (motivo de o trilho A exigir admin): [Range: update](https://learn.microsoft.com/en-us/graph/api/range-update?view=graph-rest-1.0) · [Working with Excel in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/excel?view=graph-rest-1.0) · [Microsoft Q&A — caminho `Sites.Selected`](https://learn.microsoft.com/en-us/answers/questions/2286958/support-required-for-shared-excel-file-read-write)
- [Vercel — Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing) (não usado na v2; relevante só ao trilho A)
- Power Automate HTTP é premium: [conectores premium](https://learn.microsoft.com/en-us/connectors/connector-reference/connector-reference-premium-connectors) · [FAQ de licenciamento](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs)

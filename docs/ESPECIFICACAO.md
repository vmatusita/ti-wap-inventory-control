# Sistema de Controle de Estoque TI — WAP

**Especificação funcional e técnica — v1.1**
Data: 09/07/2026 · Autor: Victor Matusita (Johnny) + Claude
Status: decisões confirmadas · plano de execução em [`PLANEJAMENTO.md`](./PLANEJAMENTO.md) · perguntas em aberto na seção 13 · **nenhum código gerado ainda**

---

## 1. Contexto e problema

Hoje o controle de ativos de TI da WAP (notebooks, celulares, monitores, desktops e tablets de todas as filiais) é feito por uma pessoa na Matriz usando três planilhas que não conversam entre si, com revisão feita por Gmail:

| Planilha | O que guarda | Volume atual |
|---|---|---|
| **Matriz (inventário)** | Estado de cada ativo: patrimônio, modelo, specs, status, com quem está | 1.179 ativos |
| **Saída do Estoque** | Entregas de equipamento (novo colaborador, troca, empréstimo…) | 423 registros em 2026 |
| **Devolução Estoque** | Retornos ao estoque (desligamento, troca, compra que chega…) | 291 registros em 2026 |

São ~100 movimentações por mês. Os problemas concretos que o sistema resolve:

1. **Trabalho duplicado** — uma única entrega exige editar a planilha de Saída **e** o inventário da filial. Uma devolução exige editar Devolução **e** inventário. Nada está ligado; quem edita digita tudo de novo.
2. **Dados divergem e sujam** — sem validação, o mesmo conceito ganha várias grafias. Encontrado nos dados reais: 15 formatos de patrimônio (`WAP4491` vs `WAP0004491` vs `4491`), "Novo colaborador"/"Nova Contratação"/"Novo Colaborador" (188 registros somados), typos como "Sáida" e "Deligamento", "CD-AFP" vs "CD-Afonso Pena", 6 linhas duplicadas na Devolução.
3. **Relatório semanal manual** — toda semana é gerado e enviado um relatório para **cada** filial. É retrabalho recorrente e o relatório nasce desatualizado.
4. **Sem visão em tempo real** — quem precisa saber "quantos notebooks temos em estoque agora?" depende de perguntar à pessoa da Matriz.
5. **Histórico frágil** — linhas de planilha são editáveis/apagáveis sem rastro; auditoria depende de e-mails no Gmail.
6. **Correção vira ERRATA** — erro descoberto depois do envio gera outro e-mail de errata para todo mundo (aconteceu no relatório de 22–26/06, corrigindo guardados e manutenção de Eusébio). No sistema, corrigiu → o link já mostra o certo.

> Referência de formato: os e-mails semanais reais de 22–26/06 e 29/06–03/07 (enviados pelo analista de suporte para ~10 destinatários, incluindo o suporte terceirizado) foram usados como base das seções 7 e 13.

## 2. Objetivos e não-objetivos

### Objetivos da v1

- Registrar cada movimentação **uma única vez** e derivar todo o resto (estoque, status do ativo, relatórios) automaticamente.
- Estoque em tempo real por filial, categoria e status.
- Relatórios acessíveis por link (com login), atualizados a cada mudança — **aposentar o envio semanal por e-mail**.
- **Carga inicial única no go-live** (seção 10): o Johnny importa as 3 planilhas **uma única vez**, via scripts com limpeza/normalização, dry-run e relatório de inconsistências. **Depois disso não existe importação no sistema** — a entrada de dados é 100% manual, e o requisito é ela ser **mais prática que o Excel** (telas e facilitadores da seção 6). Até o go-live, desenvolvimento e demonstrações rodam com **dados fictícios** (seção 10.1).
- Histórico auditável: toda movimentação tem autor, data e não é apagável (estorna-se).
- Operação continua centralizada na admin da Matriz — o sistema precisa ser **mais rápido que a planilha**, não mais burocrático.

### Não-objetivos da v1 (podem virar fases futuras)

- Fluxo de compras/orçamento de equipamentos.
- Sistema de chamados (existe um; guardamos só o nº do chamado como referência).
- Integração com MDM (Pulsus) e inventário automático de rede.
- Rastrear acessórios como ativos individuais com patrimônio — na v1 eles são checklist da devolução. **Atenção:** o e-mail semanal atual tem uma seção inteira de acessórios, periféricos e componentes **por quantidade** (fones, mochilas, teclados, memórias, SSDs, carregadores — com status tipo "29 atrelados"). Esse controle simples de quantidade por item×filial entra na F5; até lá o sistema substitui a parte de **equipamentos principais** do e-mail.
- App mobile nativo (a interface web é responsiva).
- Múltiplos idiomas, multi-empresa.
- **Importação recorrente ou sincronização com planilhas** — decisão de 09/07/2026: a carga é única, no go-live. Manter uma porta de importação aberta seria manter a tentação da planilha viva; o sistema só cumpre o objetivo se a operação manual for melhor que o Excel.

## 3. Usuários e perfis

| Perfil | Quem é | O que pode |
|---|---|---|
| **Admin** | A pessoa da Matriz que controla o estoque hoje (e eventuais substitutos) | Tudo: cadastrar/editar ativos, registrar movimentações, importar planilhas, convidar usuários, configurar filiais e listas |
| **Visualizador** | Gestores/pontos focais das filiais e quem mais precisar consultar | Login e leitura: relatórios, consulta de ativos e histórico. Não edita nada |

Decisões confirmadas em 09/07/2026:

- **Todo acesso exige login**, inclusive para ver relatórios (escolha do Johnny na v1 — protege nomes de colaboradores; um link público pode ser reavaliado depois).
- **Não há auto-cadastro**: o admin convida por e-mail (Supabase Auth invite). Sugestão: aceitar convites apenas do domínio corporativo da WAP (ver pergunta 3, seção 13).
- O papel fica em `profiles.role` (`admin` | `viewer`).

## 4. Conceito central: a movimentação é a fonte da verdade

É a decisão de produto mais importante — e o que elimina o trabalho duplicado.

Hoje as planilhas mantêm **o estado** (inventário: onde está cada ativo) e **os eventos** (saída, devolução) separados, atualizados à mão, em lugares diferentes. Por isso divergem.

No sistema, só se registra **o evento** (a movimentação). O estado do ativo — status, com quem está, em qual filial — é **derivado automaticamente** da última movimentação, por trigger no banco:

```
registrar SAÍDA do WAP0004491 para João/Logística
        │
        ▼ (automático)
ativo WAP0004491 → status: em_uso · colaborador: João · setor: Logística
estoque da filial → -1 notebook disponível
relatório da filial → atualizado em tempo real
histórico do ativo → +1 linha na linha do tempo
```

Uma digitação, quatro efeitos. Ninguém mais "atualiza o inventário".

### Estados do ativo

Ciclo típico: compra → em estoque → saída → em uso → devolução → triagem → volta ao estoque (ou manutenção/descarte).

| Estado | Significado | Equivale hoje a |
|---|---|---|
| `em_estoque` | Disponível para entrega | Estoque / Guardada |
| `reservado` | Separado para alguém (chamado aberto) | Reservada |
| `em_uso` | Entregue a colaborador/setor | Remanejo / Saída |
| `emprestado` | Saída temporária com devolução prevista | Empréstimo |
| `em_triagem` | Devolvido, aguardando **triagem**: conferência física (checklist de acessórios), backup/limpeza dos dados e decisão do destino — feita pela operadora | Validar / Devolvido |
| `em_manutencao` | Em conserto (interno ou assistência) | Manutenção |
| `defasado` | **Reserva técnica** ("RT WAP" nas planilhas): funciona, mas está abaixo do padrão atual; guardado para reposição emergencial ou peças | RT Wap / Posse Wap / Defasada |
| `descartado` | Baixa definitiva | Descarte |

### Transições (a tabela que o banco aplica — fonte: `schema.sql`)

| Movimentação | Permitida quando o ativo está… | Estado resultante |
|---|---|---|
| `compra` | `em_estoque` (ativo recém-cadastrado; ver regra 8) | `em_estoque` — registra a entrada e fixa a filial que recebeu |
| `saida` | `em_estoque`, `reservado`, `em_triagem` | `em_uso` |
| `emprestimo` | `em_estoque`, `reservado` | `emprestado` |
| `reserva` | `em_estoque` | `reservado` |
| `devolucao` | `em_uso`, `emprestado` | `em_triagem` |
| `triagem_ok` | `em_triagem` | `em_estoque` |
| `envio_manutencao` | `em_estoque`, `em_triagem`, `em_uso`, `defasado` | `em_manutencao` |
| `retorno_manutencao` | `em_manutencao` | `em_estoque` |
| `marcar_defasado` | `em_estoque`, `em_triagem`, `em_manutencao` | `defasado` |
| `descarte` | `em_estoque`, `em_triagem`, `em_manutencao`, `defasado` | `descartado` |
| `transferencia` | qualquer estado, exceto `descartado` | mantém o estado; muda a filial |
| `ajuste` | qualquer | o estado informado — exige justificativa (regra 6) |
| `estorno` | só a última movimentação efetiva do ativo | devolve o ativo ao estado (status, colaborador, setor, filial) anterior à movimentação estornada |

São 13 tipos no total — `ajuste` e `estorno` são as válvulas de escape administrativas; os outros 11 são o dia a dia.

## 5. Modelo de dados

Schema completo em [`supabase/schema.sql`](../supabase/schema.sql). Resumo:

- **`filiais`** — id, nome, slug (`matriz`, `cd-afonso-pena`, `linhares`, …), ativo. Cadastro gerenciável pelo admin (resolve a dúvida CE Serra/Serra Park/Eusébio sem travar o desenvolvimento).
- **`ativos`** — patrimônio normalizado (único), patrimônio original (como veio da planilha), categoria, marca, modelo, service_tag, hostname, memória, armazenamento, processador, fornecedor, filial atual, **status** (derivado), colaborador/setor atual (derivados), termo_assinado, observações.
- **`movimentacoes`** — ativo, tipo, motivo, data, filial, colaborador, setor, nº do chamado, termo_assinado, itens_faltantes, observação, **criado_por**, created_at. Imutável: correção é estorno + novo lançamento.
- **`profiles`** — espelho de `auth.users` com nome e role (`admin`/`viewer`).
- **`relatorios_gerados`** — snapshots da semana (§7.1): período, filial (null = geral), versão, `dados` (jsonb congelado), gerado_por, gerado_em. Imutável — regerar o período cria versão nova.
- **Views** — `v_estoque_atual` (agregado por filial/categoria/status), `v_movimentacoes_mes`, `v_pendencias` (termos não assinados, itens faltantes, ativos em triagem parados).

### Vocabulários normalizados (De → Para)

Levantados dos dados reais; o importador aplica este mapa e a interface só oferece os valores limpos:

**Motivo de saída:** `novo_colaborador` (← "Novo colaborador", "Nova Contratação", "Novo Colaborador", "Colaborador não tinha equipamento", "Associado ao colaborador"), `troca_upgrade` (← "Troca", "Troca/Upgrade", "Troca/upgrade", "Toca", "Troca de equipamento"), `monitor_adicional` (← "Monitor Adicional", "Adicional de Monitor"), `uso_compartilhado` (← "Equipamento compartilhado", "Uso interno"), `troca_titular`, `reposicao`, `assistencia`, `outro`. Linhas de "Empréstimo" e "Transferência Uni." **não são motivos**: viram movimentações dos tipos `emprestimo` e `transferencia`.

**Motivo de devolução:** `desligamento` (← "Desligamento", "Deligamento", "Desligamento "), `troca_upgrade`, `afastamento`, `fim_emprestimo` (← "Empréstimo", "Emprétimo"), `manutencao`, `garantia`, `outro`. Entradas por "Compra" viram movimentação `compra`, não devolução.

**Termo de responsabilidade** (`sim` / `nao` / `enviado`): `enviado` = termo gerado e mandado ao colaborador, **ainda sem assinatura**; `sim` = assinado e arquivado; `nao` = nem gerado. `enviado`, `nao` e não-informado contam como pendência.

**Nomenclatura:** "filial" no sistema = "unidade"/"site" nas planilhas — sinônimos. "Pendência" é tudo que a view `v_pendencias` agrega: termos não assinados, itens faltantes de devolução, triagem parada e o campo livre `ativos.pendencia`.

**Patrimônio:** formato canônico = `PREFIXO + 7 dígitos com zeros à esquerda` (ex.: `WAP4491` → `WAP0004491`). Na importação, a comparação ignora os zeros para casar variantes (`WAP4491` ≡ `WAP0004491` ≡ `4491` quando o prefixo é inferível). Duas colunas: `patrimonio` (canônico) e `patrimonio_original` (como veio da planilha). Prefixos vistos: WAP, PRO, LEA, TEC, STF, PAT, NOO. Sem patrimônio → cadastra com flag de pendência.

**Duplicidade de patrimônio (regra definida pelo Johnny em 09/07):** o patrimônio é o identificador do dia a dia, mas **repete em casos raros** — por isso quem é único no banco é o par **patrimônio + service tag**. Quando uma busca por patrimônio encontrar mais de um ativo, a interface obriga a escolher pela service tag (exibida junto de modelo e filial). Dois ativos com o mesmo patrimônio e ambos **sem** service tag não podem coexistir — a importação acusa como inconsistência.

**Unidades:** `CD-AFP` = `CD-Afonso Pena`; `Eusebio` = `Eusébio`; "Matriz " (com espaço) = `Matriz`.

## 6. Módulos e telas

1. **Login** — e-mail + senha via convite (Supabase Auth). Sem cadastro aberto.
2. **Dashboard (home)** — visão geral: KPIs do estoque, movimentações recentes, pendências. Admin vê atalhos de ação; visualizador vê o mesmo sem botões de edição.
3. **Ativos** — lista com busca por patrimônio/colaborador/modelo e filtros (filial, categoria, status). Detalhe do ativo = ficha + **linha do tempo de movimentações**. Admin: criar/editar.
4. **Nova movimentação** — a tela mais usada; otimizada para ser mais rápida que a planilha: buscar ativo por patrimônio (autocomplete; se o patrimônio tiver duplicata, mostra as opções com service tag e modelo para escolher) → escolher tipo → o form só pede o que aquele tipo exige → salvar. Validações de transição de estado (seção 8). Suporta lote (ex.: notebook + monitor + celular para o mesmo colaborador num único fluxo, como no chamado 5065 dos dados).
   **Facilitadores para vencer o Excel** (decisão de 09/07/2026 — sem importação depois do go-live, a operação manual é a única entrada): data de hoje já preenchida, foco automático no campo de busca ao abrir, atalho de teclado `N` abre "nova movimentação" de qualquer tela, **"repetir última"** (pré-preenche tudo da movimentação anterior, menos o ativo) e **"duplicar"** a partir de qualquer linha da linha do tempo. Kits de lote salvos ("Kit novo colaborador") ficam na F5.
5. **Relatórios** — página ao vivo por filial (`/relatorios/[filial]`) + **geração do relatório da semana** (snapshot interativo versionado) com histórico em `/relatorios/gerados` — detalhes na seção 7.
6. **Administração** — convidar/gerenciar usuários, filiais, ajustes de vocabulário (motivos), exportar backup CSV.

> **Não existe tela de importação.** Decisão de 09/07/2026: a carga das planilhas é uma operação única de go-live, feita pelo Johnny via scripts (seção 10). Depois do cutover, a única porta de entrada de dados é a operação manual do item 4 — e vencê-la do Excel é requisito, não detalhe.

## 7. Relatórios: ao vivo e gerados

Dois modos complementares substituem o e-mail semanal (decisão de 09/07/2026):

- **Ao vivo** — `/relatorios/[filial]`: manda-se o link uma vez; a página está sempre atual.
- **Gerado** — o ritual da sexta-feira vira **um clique**: um snapshot interativo dos dados da semana, congelado e versionado (§7.1), com link permanente.

Conteúdo de `/relatorios/[filial]` (e uma visão consolidada `/relatorios/geral`):

- **Cards:** total de ativos, em estoque, em uso, em manutenção, reservados, em triagem.
- **Estoque por categoria** — quantos notebooks/celulares/monitores disponíveis agora (a pergunta nº 1 do dia a dia).
- **Disponíveis por modelo** — a lista de "guardadas" que abre o e-mail atual ("02 A70 MOB, 01 Latitude 5420, 01 XPS9320…").
- **Reservados com nº do chamado** — como no e-mail ("30 reservadas: #8461 #9176 …", turma de aprendizes); o chamado já é campo da movimentação.
- **Em manutenção, caso a caso** — patrimônio, modelo e a observação (orçamento, NF-e, previsão), que hoje é texto vermelho no e-mail.
- **Resumo do período no formato do e-mail** — "19 saídas: Matriz — novo colaborador: 04 notebooks, 04 monitores; Serra — …" gerado automaticamente, com a tabela detalhada logo abaixo.
- **Movimentações do período** — saídas × devoluções por semana/mês (gráfico de barras).
- **Saídas por motivo** e **devoluções por motivo** no período.
- **Pendências:** termos não assinados, devoluções com itens faltantes, ativos parados em triagem.
- **Últimas movimentações** — tabela com data, ativo, tipo, colaborador, chamado.
- **Exportar:** CSV da tabela e impressão limpa (PDF pelo navegador) para quem ainda pedir "o arquivo".

Tempo real, em duas camadas: Server Components buscam dados frescos a cada acesso; na página aberta, subscription de Supabase Realtime na tabela `movimentacoes` atualiza os números sem F5.

**Por que não Power BI:** foi considerado e descartado para a v1 em 09/07/2026 — compartilhar exige licença Pro por usuário, o refresh do plano básico é agendado (não tempo real) e ninguém da equipe domina a ferramenta. A porta fica aberta: o Postgres do Supabase aceita conexão direta do Power BI no futuro, sem mudar nada no sistema.

### 7.1 Relatório gerado da semana (snapshot interativo)

O equivalente moderno do e-mail de sexta-feira — pedido do Johnny em 09/07/2026:

- **Gerar:** botão "Gerar relatório" (só admin) com período padrão **segunda a sexta da semana corrente** (mesmo recorte dos e-mails reais, ex.: "22/06 até 26/06"), ajustável; escopo por filial ou geral.
- **Snapshot congelado:** os dados do período são calculados na hora e gravados em `relatorios_gerados` (jsonb). O relatório **não muda mais** — mesmo que depois haja estorno ou correção, o que foi apresentado na sexta continua auditável. Quem corrige gera nova versão.
- **Versionado — o fim da ERRATA:** regerar o mesmo período cria a **versão 2**; a versão 1 continua acessível com um aviso "existe versão mais recente". Ninguém reenvia nada: o link aponta para a versão atual.
- **Interativo:** a página `/relatorios/gerados/[id]` renderiza o snapshot com os mesmos componentes do relatório ao vivo — gráficos com tooltip, tabelas ordenáveis, filtros internos (filial/categoria/tipo) aplicados sobre o snapshot, resumo no formato do e-mail com "copiar texto", export CSV e impressão limpa. Não é um PDF morto.
- **Histórico:** `/relatorios/gerados` lista todos (período, filial, versão, quem gerou, quando) — o arquivo semanal que hoje se perde na caixa de e-mail.
- **Acesso:** login como todo o resto; visualizador vê e navega, não gera.
- Download como **HTML autocontido** (arquivo único para anexar/arquivar) fica no backlog da F5.

Conteúdo do snapshot = as mesmas seções da página ao vivo recortadas no período + resumo textual, com destaque para as **observações das movimentações** (o contexto que hoje vai em texto vermelho no e-mail).

## 8. Regras de negócio e validações

1. Patrimônio é obrigatório e identifica o ativo, mas **pode repetir em casos raros** — único mesmo é o par patrimônio + service tag (§5). Movimentação sobre patrimônio duplicado exige desambiguar pela service tag. Ativo sem patrimônio entra com pendência sinalizada, nunca silenciosamente.
2. Só transições de estado válidas (seção 4): não há saída de ativo `descartado`, nem devolução de ativo `em_estoque`. O erro mais comum da planilha morre aqui.
3. Saída/empréstimo exigem: colaborador **ou** setor de destino, motivo e (se houver) nº do chamado. Devolução exige: motivo + checklist de itens faltantes (carregador, mochila, mouse…) — vira a pendência automaticamente.
4. Termo de responsabilidade: flag por movimentação de saída (`sim/não/enviado`) com data; relatório cobra os pendentes. Upload do PDF assinado fica para fase futura (pergunta 5, seção 13).
5. Transferência entre filiais muda a filial do ativo e aparece no relatório das duas.
6. Movimentação não se apaga: **estorno** (disponível desde a F2) devolve o ativo ao estado completo anterior — status, colaborador, setor e filial — e fica registrado apontando para a movimentação estornada. Só a última movimentação efetiva do ativo pode ser estornada; para casos excepcionais existe o `ajuste`, sempre com justificativa. Toda linha tem `criado_por` + timestamp.
7. Alerta de possível duplicata: mesmo ativo + mesmo tipo + mesmo dia (era um erro real nas planilhas — 6 casos).
8. Compra em dois passos num fluxo só: cadastra-se o ativo (que nasce `em_estoque`) e registra-se a movimentação `compra`, que documenta a entrada (nota/observação) e fixa a filial que recebeu.
9. **Toda movimentação aceita observação** — texto livre, **opcional** (obrigatória apenas no `ajuste`, como justificativa). Aparece na linha do tempo do ativo, nas tabelas de relatório e nos snapshots gerados: é onde vive o contexto que hoje vai em vermelho no e-mail ("aguardando NF-e", "recolhido por problema de tela"…).

## 9. Stack e arquitetura

Confirmada em 09/07/2026:

| Camada | Escolha | Por quê |
|---|---|---|
| Front + rotas | **Next.js 16 (App Router, Turbopack) + TypeScript** | Preferência do Johnny; linha 16.2.x é a atual (conferido em 09/07/2026); Server Components casam com relatórios sempre-frescos |
| UI | **Tailwind CSS 4 + shadcn/ui** | Preferência do Johnny; componentes prontos de tabela, form, dialog |
| Gráficos | **Recharts v3** (via componente `chart` do shadcn/ui) | Análise comparativa no PLANEJAMENTO §2.1; cobre todos os gráficos da §7; ECharts mapeado como upgrade se pedirem interatividade estilo Power BI |
| Backend | **Supabase** (Postgres + Auth + RLS + Realtime) | Banco gerenciado, login com convite pronto, tempo real pronto, free tier comporta o volume (~1,2k ativos, ~100 mov/mês) e o MCP já está conectado para eu criar schema/migrations direto |
| Validação | Zod + Server Actions | Uma definição de schema serve form e servidor |
| Deploy | **Vercel** (conta Pro já paga do Johnny) | Deploy por git push; preview por branch; o Hobby gratuito não permite uso comercial |

Arquitetura em uma linha: **Next.js fala com o Supabase; leituras via Server Components (+ Realtime no cliente), escritas via Server Actions; RLS garante no banco que visualizador não escreve — mesmo se a UI falhar.**

Padrões de segurança: RLS em todas as tabelas (`viewer`: só SELECT; `admin`: tudo; `anon`: nada), service key só no servidor, convites com expiração.

Custo para a WAP: **R$ 0**. Supabase no plano Free; deploy na conta **Vercel Pro que o Johnny já paga** — o Hobby gratuito da Vercel é restrito por fair use a uso pessoal não-comercial e não serve para sistema de empresa. Limites do free tier no risco 5 (seção 12).

## 10. Carga inicial única (go-live) — scripts, não tela

Decisão final de 09/07/2026: o sistema **não tem importação**. A carga das planilhas é uma **operação única de go-live**, executada pelo Johnny com os scripts de `scripts/import/` (entregues na F4): dry-run → relatório de inconsistências → carga confirmada. Reexecutável **durante a janela do go-live** (idempotente), sem nenhuma interface no app; após o cutover os scripts permanecem no repositório apenas como ferramenta de emergência. Não há sincronização com planilhas — nunca. Estratégia em 4 passos, pensada para dados sujos:

1. **Staging** — os 3 CSVs entram crus na estrutura de trabalho do script (nada é rejeitado ainda).
2. **Normalização automática** — aplica os De→Para da seção 5: patrimônios, motivos, unidades, datas (`dd/mm/aaaa` e variações), typos conhecidos, remoção das 6 duplicatas exatas.
3. **Relatório de inconsistências** — CSV para o Johnny/admin revisar; nada entra silenciosamente errado. Casos já identificados nos dados reais:
   - Ativo movimentado (saída/devolução) que **não existe** no inventário → criar automaticamente com dados mínimos + flag `origem: inferido`.
   - Patrimônios duplicados no inventário (5 casos: `SEM PATRIMONIO`, `3652`, `N/A`, `WAP4622`, `PRO3557`): se as service tags forem diferentes, entram como **ativos distintos** (duplicidade legítima, §5); service tag repetida ou ausente → decisão manual.
   - Mesmo patrimônio com 2 grafias (`WAP4491` × `WAP0004491`) → unificar pelo canônico.
   - Datas vazias ou inválidas → entram sem data com pendência.
   - Campo "Termo" com valores estranhos ("15/12/2025", "enviado") → mapear para `sim/não/enviado` + data quando houver.
4. **Carga final** — ativos primeiro, depois movimentações em ordem cronológica **recalculando o estado** de cada ativo pela sequência de eventos. Divergência entre estado calculado e o que a planilha Matriz diz → vai para o relatório de inconsistências (é a planilha que está errada na maioria dos casos — é exatamente o problema que motivou o sistema).

A planilha da Matriz cobre só a Matriz; se existirem inventários das outras filiais, importam-se pelos mesmos scripts **dentro da janela de go-live** — depois dela, equipamento novo entra pelo fluxo manual de compra (regra 8).

### 10.1 Dados fictícios de desenvolvimento (seed)

Enquanto o importador não roda com os dados reais, um script de seed povoa o banco com dados **inventados de estrutura idêntica**: ~1.200 ativos nas mesmas proporções reais (42% notebooks, 28% celulares, 25% monitores…), ~700 movimentações espalhadas por 7 meses, 5 filiais, nomes de colaboradores gerados, chamados e termos variados. Serve para desenvolver os gráficos com volume realista e demonstrar o sistema para as filiais **sem expor o nome de ninguém** (bônus de LGPD em ambiente de desenvolvimento). O seed é apagável com um comando de reset — o go-live com o importador (F4) começa de banco limpo.

## 11. Fases de entrega

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **F0 — Fundação** | Repo + Next.js + Tailwind + shadcn/ui + projeto Supabase + login por convite + layout base + deploy Vercel | Johnny e a operadora logam em produção |
| **F1 — Banco + dados fictícios** | Migrations do schema + **seed fictício realista** (~1.200 ativos, ~700 movimentações, seção 10.1) + views | Seed roda e reseta com um comando; `v_estoque_atual` bate com o seed |
| **F2 — Operação** | Lista/ficha de ativos + **nova movimentação** com validações + **estorno** (sem estorno não há como corrigir erro, já que movimentação é imutável) | Ciclo completo compra → saída → devolução → triagem registrável de ponta a ponta, sobre dados fictícios |
| **F3 — Relatórios** | `/relatorios/[filial]` + consolidado, tempo real, export | Dashboards demonstráveis com dados fictícios; validação visual com quem recebe o e-mail hoje |
| **F4 — Carga inicial + go-live** | Scripts de carga única (`scripts/import/`): normalização De→Para + dry-run + relatório de inconsistências + carga idempotente; ensaio no projeto de ensaio; reset do seed | Dados reais dentro; números batem com as planilhas; **cutover: planilhas viram só-leitura, e-mail aposentado e nenhuma tela de importação existe no app** |
| **F5 — Refino** | Estoque de acessórios/componentes por quantidade (fecha a 2ª metade do e-mail), pendências e alertas avançados, resumo automático por e-mail (opcional), backup agendado, upload dos termos (PDF) | E-mail semanal 100% substituído; backlog priorizado com o uso real |

Ordem pensada para o sistema ficar **demonstrável cedo sem depender dos dados reais**: F3 já mostra os relatórios com dados fictícios; a virada de chave (F4) acontece quando a WAP quiser, sem pressa e sem período de convivência planilha×sistema. Detalhamento de esforço, escopo por fase e ordem das telas: [`PLANEJAMENTO.md`](./PLANEJAMENTO.md).

## 12. Riscos e pontos de atenção

1. **Limpeza de dados subestimada** — é o risco nº 1 em migração de planilha. Mitigação: carga inicial com dry-run + relatório de inconsistências (F4), ensaiada com as planilhas reais em ambiente de teste antes do go-live, e a regra "nada entra silenciosamente errado".
2. **Adoção** — se registrar movimentação for mais lento que a planilha, a planilha volta. Mitigação: tela de movimentação desenhada para ≤30s por registro, fluxo em lote, atalhos.
3. **Período de transição** — evitar sistema e planilha em paralelo por semanas (divergem de novo). Mitigação: durante o desenvolvimento o sistema roda só com dados fictícios (convivência zero); a virada acontece de uma vez na F4 — importa, confere os números e as planilhas viram só-leitura na mesma semana.
4. **Dados pessoais (LGPD)** — nomes de colaboradores. Login obrigatório (decisão confirmada) já limita exposição; guardar o mínimo (nome/setor, sem CPF), definir retenção do histórico de desligados.
5. **Free tier do Supabase** (números conferidos em 09/07/2026) — pausa após **1 semana sem requisição** (com uso diário não acontece; se pausar durante o desenvolvimento, religa-se no painel em segundos), **500 MB** de banco (anos de folga para ~1,2k ativos) e **2 projetos gratuitos** — exatamente o que o plano usa: produção + ambiente de ensaio do importador. Se crescer: Pro US$ 25/mês, só se a WAP um dia decidir pagar.
6. **Bus factor = 1** — uma pessoa opera tudo. Mitigação: segundo admin de contingência (pergunta 7) + backup CSV automático mensal.

## 13. Perguntas em aberto (para Johnny/WAP responder)

1. **Filiais oficiais:** o e-mail semanal real reporta Matriz, CD-Afonso Pena, Linhares e **Eusébio–Ceará** — e os chamados do **Serra Park** aparecem atendidos pelo estoque de Linhares. Serra Park é filial com estoque próprio ou ponto atendido por Linhares? "CE Serra" que você citou = Eusébio/CE + Serra? (O cadastro de filiais é flexível — isso não trava o desenvolvimento.)
2. **Escopo do visualizador:** vê todas as filiais ou só a dele? (v1 proposta: vê todas; o e-mail atual já circula com tudo para todo mundo.)
3. **Convites restritos a domínio?** O e-mail atual vai para `@wap.ind.br` **e para o suporte terceirizado (`@stefanini.com`)**. Convidados de fora do domínio WAP podem entrar como visualizadores?
4. **Nº do chamado:** só guardar o número ou linkar para o sistema de chamados? Qual sistema é?
5. **Termo de responsabilidade:** anexar o PDF assinado no sistema (F5) ou basta a flag + cobrança?
6. **Acessórios** (mochila, mouse, teclado): confirma que na v1 ficam só como checklist da devolução, sem patrimônio próprio?
7. **Segundo admin:** quem cobre férias/afastamento da admin da Matriz?

---

## Glossário rápido (para quem chegar depois)

- **RLS (Row Level Security)** — regras de permissão dentro do próprio Postgres: mesmo que a interface falhe, o banco recusa escrita de quem não é admin.
- **Server Component / Server Action** — padrões do Next.js App Router: página montada no servidor com dados frescos / função de escrita executada no servidor.
- **Realtime** — canal do Supabase que avisa o navegador quando uma tabela muda (é o que atualiza o relatório sem F5).
- **Cutover** — a data marcada em que as planilhas viram só-leitura e o sistema passa a ser o único lugar de registro (fim da F4, logo depois da importação dos dados reais).
- **Reserva técnica (RT)** — equipamento funcional porém defasado, guardado para emergência/peças ("RT WAP" / "Posse Wap" nas planilhas).
- **MDM / Pulsus** — gestão remota de celulares usada na WAP; fora do escopo da v1 (aparece em observações das planilhas).
- **shadcn/ui** — biblioteca de componentes prontos (tabelas, forms, dialogs) sobre Tailwind CSS.

---

*Anexos: [`supabase/schema.sql`](../supabase/schema.sql) (rascunho do banco) · [`mockups/dashboard-relatorio.html`](../mockups/dashboard-relatorio.html) (mockup do relatório com os dados reais) · planilhas analisadas em 09/07/2026.*

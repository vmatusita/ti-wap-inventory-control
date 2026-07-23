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
- Relatórios acessíveis por link **com senha de acesso (sem conta)**, atualizados a cada mudança — **aposentar o envio semanal por e-mail**.
- **Carga inicial única no go-live** (seção 10): as 3 planilhas entram **uma única vez**, via scripts com limpeza/normalização, dry-run e relatório de inconsistências (execução autônoma pelo Claude Code). A entrada de dados do dia a dia é 100% manual, e o requisito é ela ser **mais prática que o Excel** (telas e facilitadores da seção 6). Até o go-live, desenvolvimento e demonstrações rodam com **dados fictícios** (seção 10.1). **Emenda F7 (16/07/2026):** a regra absoluta "depois disso não existe importação" foi revista — passou a existir um **import de startup por filial na administração** (só o modo *Substituir tudo*, para o go-live novo de cada filial), ver §10.2. A entrada operacional do dia a dia continua sendo manual; sincronização recorrente e o modo *Atualizar* seguem fora de escopo.
- Histórico auditável: toda movimentação tem autor, data e não é apagável (estorna-se).
- Operação continua centralizada na admin da Matriz — o sistema precisa ser **mais rápido que a planilha**, não mais burocrático.

### Não-objetivos da v1 (podem virar fases futuras)

- Fluxo de compras/orçamento de equipamentos.
- Sistema de chamados (existe um; guardamos só o nº do chamado como referência).
- Integração com MDM (Pulsus) e inventário automático de rede.
- Rastrear acessórios como ativos individuais com patrimônio — eles são quantidade pura (sem patrimônio, sem máquina de estados) e também checklist da devolução. **Nota (F3B, 14/07/2026):** o controle de acessórios, periféricos e componentes **por quantidade** (fones, mochilas, teclados, memórias, SSDs, carregadores — com "atrelados" e "faltam N") foi **antecipado da F5 para a F3B** e já faz parte do sistema (catálogo + lançamentos por item×filial — §5). Com isso o relatório cobre o e-mail semanal por completo, não só os equipamentos principais.
- App mobile nativo (a interface web é responsiva).
- Múltiplos idiomas, multi-empresa.
- **Importação recorrente ou sincronização com planilhas** — decisão de 09/07/2026: a carga do dia a dia é manual. Manter uma porta de sincronização aberta seria manter a tentação da planilha viva; o sistema só cumpre o objetivo se a operação manual for melhor que o Excel. **Emenda F7 (16/07/2026):** abriu-se **uma** exceção pontual — o *import de startup por filial* (Substituir tudo) para o go-live novo de cada filial (§10.2). Não é sincronização recorrente nem upsert incremental (o modo *Atualizar* foi adiado): é um evento de abertura, com o custo destrutivo assumido e salvaguardas obrigatórias.

## 3. Usuários e perfis

| Perfil | Quem é | Como entra | O que pode |
|---|---|---|---|
| **Operador** | A pessoa da Matriz que controla o estoque hoje + quem o admin incluir (inclusive a equipe terceirizada da Stefanini) | **Login com conta corporativa** — convite por e-mail, obrigatoriamente `@wap.ind.br`, `@stefanini.com` ou `@latam.stefanini.com` | Tudo: ativos, movimentações, snapshots, senhas de acesso, filiais, motivos, convites. **Todos os logados têm o mesmo nível** — não há hierarquia entre operadores |
| **Visualizador** | Filiais, gestores — quem só consulta | **Senha de acesso** no link dos relatórios — sem conta, sem cadastro | Somente as rotas de relatório (ao vivo, snapshots, histórico). Nada de operação |

Neste documento, **"admin" e "operador" são sinônimos** — todo usuário logado é admin (nível único).

Decisões **atualizadas em 09/07/2026** (substituem a versão anterior "login para todos"):

- **Relatórios: senha, não login.** O link de visualização pede uma senha de acesso; quem tem a senha vê os relatórios. Todas as senhas dão o **mesmo nível** de acesso (todas as filiais, sem escopo).
- **Senhas gerenciadas pelo admin:** cria quantas quiser, cada uma com **rótulo** ("Filial Linhares", "Stefanini"…), e **revoga individualmente** — se uma vazar, mata só ela sem trocar as outras.
- **Operação: login restrito aos domínios corporativos**, validado no convite e no banco. Sem auto-cadastro; o admin convida ("incluir novas pessoas"). *(Emenda de 22/07/2026: além de `@wap.ind.br`, entram `@stefanini.com` e `@latam.stefanini.com` — a equipe terceirizada da Stefanini passou a **operar**, não só consultar. Nível único inalterado: quem entra por convite é operador pleno. Lista única em `src/lib/auth/dominios-email.ts`, trava no banco pela migration `0041`; revoga a resposta 3 da §13.)*
- Implementação: Supabase Auth só para operadores; o acesso por senha é camada da aplicação — cookie httpOnly assinado após validar contra `senhas_acesso` (hash scrypt), com queries rodando no servidor. **Visualizador nunca recebe credencial do banco.**

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
| `devolvido_fornecedor` | **(Emenda F14)** Baixa terminal — a manutenção não teve conserto e o fornecedor ficou com o equipamento (e o trocou). Sai do inventário como o `descartado` | — (novo no sistema) |

### Transições (a tabela que o banco aplica — fonte: migration `0004_maquina_estados.sql`)

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
| `devolucao_fornecedor` | **(Emenda F14)** `em_manutencao` | `devolvido_fornecedor` — baixa terminal; zera o detentor como o `descarte` |
| `transferencia` | qualquer estado, exceto `descartado` **e `devolvido_fornecedor`** (Emenda F14) | mantém o estado; muda a filial |
| `ajuste` | qualquer | o estado informado — exige justificativa (regra 6) |
| `estorno` | só a última movimentação efetiva do ativo | devolve o ativo ao estado (status, colaborador, setor, filial) anterior à movimentação estornada |

São **14** tipos no total (Emenda F14: +`devolucao_fornecedor`) — `ajuste` e `estorno` são as válvulas de escape administrativas; os outros 12 são o dia a dia.

> **Emenda F14 (23/07/2026) — manutenção com fornecedor.** Toda manutenção vai para o fornecedor, que abre um chamado próprio. O `envio_manutencao` passa a gravar o **chamado do fornecedor** (`movimentacoes.chamado_fornecedor`, texto livre, **obrigatório**), de baixa visibilidade — só nos contextos de manutenção (passo 2 do envio, linha do tempo da ficha, card de manutenção do relatório). O ciclo ganha o desfecho **`devolucao_fornecedor` → `devolvido_fornecedor`** (não teve conserto), terminal como `descartado`. Nesse desfecho o operador cadastra o **substituto no mesmo submit** (RPC atômica `devolver_ao_fornecedor`, lote sempre 1): o ativo novo nasce `em_estoque` com `ativos.substitui_ativo_id` apontando para o antigo (herda o fornecedor do antigo; os chamados vêm do último envio). Fonte: migrations `0044`/`0045`. Ver §5 (colunas) e §7 (relatório).

## 5. Modelo de dados

Schema completo nas migrations em [`supabase/migrations/`](../supabase/migrations/) (fonte da verdade desde a F1). Resumo:

- **`filiais`** — id, nome, slug (`matriz`, `cd-afonso-pena`, `linhares`, …), ativo. Cadastro gerenciável pelo admin (resolve a dúvida CE Serra/Serra Park/Eusébio sem travar o desenvolvimento).
- **`ativos`** — patrimônio normalizado (único), patrimônio original (como veio da planilha), categoria, marca, modelo, service_tag, hostname, memória, armazenamento, processador, fornecedor, filial atual, **status** (derivado), colaborador/setor atual (derivados), termo_assinado, observações e, desde a **F14**, **`substitui_ativo_id`** (`uuid → ativos.id`, migration `0045`): quando o ativo é o **substituto** de um equipamento devolvido ao fornecedor, aponta para o antigo — `NULL` para todos os demais (vínculo de sucessão, §4 Emenda F14).
- **`movimentacoes`** — ativo, tipo, motivo, data, filial, colaborador, setor, nº do chamado (interno), termo_assinado, itens_faltantes, observação, **criado_por**, created_at e, desde a **F14**, **`chamado_fornecedor`** (texto livre, migration `0045`): o chamado ABERTO PELO FORNECEDOR na manutenção — obrigatório no `envio_manutencao` (check `NOT VALID`, preserva o histórico), distinto do `chamado` interno (numérico). Imutável: correção é estorno + novo lançamento.
- **`profiles`** — espelho de `auth.users` com nome. Todo usuário logado é operador — nível único (decisão de 09/07/2026); não existe papel "viewer" com conta.
- **`senhas_acesso`** — senhas de visualização dos relatórios: rótulo, hash (scrypt), ativa, criado_por, último uso. Validadas exclusivamente no servidor; revogação individual tem efeito imediato.
- **`relatorios_gerados`** — snapshots da semana (§7.1): período, filial (null = geral), versão, `dados` (jsonb congelado — `schema: 2` na F3B), gerado_por, gerado_em. Imutável — regerar o período cria versão nova.
- **`itens`** (F3B) — catálogo de acessórios/periféricos/componentes controlados por **quantidade**: nome (único, case-insensitive), `grupo` (`acessorio` | `componente`), ativo, ordem e, desde a F12, **`estoque_minimo`** (`smallint`, default `0`, `>= 0` — migration `0042`). Sem patrimônio, sem service tag, sem máquina de estados (quantidade pura). Gerenciado em `admin/itens`. Granularidade: memórias separadas por DDR e tamanho; "kit teclado+mouse" é item próprio. **`estoque_minimo` é o ponto de reposição do item**, comparado com o estoque **consolidado de todas as filiais** (nunca com o saldo de uma filial): `0` = item sem acompanhamento (nenhum alerta) e estoque **igual** ao mínimo ainda não alerta — a tela acende o selo âmbar "repor" só quando o consolidado fica **abaixo** do mínimo. Não confundir com o **"faltam N"** (`máx(0, atrelados + liberados − total)`, migration `0027`), que é déficit já assumido: os dois avisos convivem e significam coisas diferentes.
- **`kits_modelos`** (F12, migration `0043`) — modelos salvos do passo 2 da nova movimentação (spec §6.4, prometido desde 09/07/2026 e adiado para a F5 §5.9): `nome` (único, case-insensitive), `payload jsonb` (tipo, motivo, termo, observação padrão e as categorias esperadas), `ativo`, `criado_por`. O payload é validado por Zod na leitura — kit fora do contrato é descartado com aviso na tela de administração, nunca renderizado torto. **O kit é cópia, não referência:** `movimentacoes` não tem coluna nem chave estrangeira de kit, então editar ou desativar um modelo **não altera nenhuma movimentação já registrada**. Gerenciado em `admin/kits`.
- **`lancamentos_item`** (F3B) — movimentação de quantidade: item, filial, `tipo` (`entrada` | `saida` | `reserva` | `liberacao` | `ajuste`), quantidade, chamado, colaborador, data, observação, criado_por, `estorna_id`. Imutável como `movimentacoes` — corrigir = lançamento inverso. Regra crítica no Postgres (trigger): **saldo** (Σ entrada − Σ saída ± ajuste) e **atrelados** (por chamado: Σ reserva − Σ liberação − Σ saída com reserva aberta) nunca ficam negativos; **falta** = max(0, atrelados − saldo) é o "faltam N" automático do e-mail.
- **`anotacoes`** (F3B) — nota avulsa na linha do tempo do ativo: texto, criado_por, created_at. Imutável, sem transição de estado. É onde vive o "texto vermelho" da manutenção que muda no meio do caso ("aguardando NF-e"). Aparece na ficha e na seção de manutenção do relatório.
- **Views / RPCs** — `v_estoque_atual` (agregado por filial/categoria/status), `v_movimentacoes_mes`, `v_pendencias`; funções de agregação do relatório (`rel_mov_por_mes`, `rel_por_motivo`, `rel_resumo`) e, na F3B, as as-of: `rel_saldo_itens`, `rel_mov_itens`, `rel_frescor_itens`, `rel_estoque_asof` (estado de cada ativo em uma data, par movimentação+estorno se anula).

### Vocabulários normalizados (De → Para)

Levantados dos dados reais; o importador aplica este mapa e a interface só oferece os valores limpos:

**Motivo de saída:** `novo_colaborador` (← "Novo colaborador", "Nova Contratação", "Novo Colaborador", "Colaborador não tinha equipamento", "Associado ao colaborador"), `troca_upgrade` (← "Troca", "Troca/Upgrade", "Troca/upgrade", "Toca", "Troca de equipamento"), `monitor_adicional` (← "Monitor Adicional", "Adicional de Monitor"), `uso_compartilhado` (← "Equipamento compartilhado", "Uso interno"), `troca_titular`, `reposicao`, `assistencia`, `outro`. Linhas de "Empréstimo" e "Transferência Uni." **não são motivos**: viram movimentações dos tipos `emprestimo` e `transferencia`.

**Motivo de devolução:** `desligamento` (← "Desligamento", "Deligamento", "Desligamento "), `troca_upgrade`, `afastamento`, `fim_emprestimo` (← "Empréstimo", "Emprétimo"), `manutencao`, `garantia`, `outro`. Entradas por "Compra" viram movimentação `compra`, não devolução.

**Termo de responsabilidade** (`sim` / `nao` / `enviado` / `gerado`): `gerado` = documento emitido pelo sistema (F5A, §8.1), ainda sem assinatura; `enviado` = gerado e mandado ao colaborador, ainda sem assinatura; `sim` = assinado e arquivado; `nao` = nem gerado. `gerado`, `enviado`, `nao` e não-informado contam como pendência — só `sim` encerra a cobrança.

**Nomenclatura:** "filial" no sistema = "unidade"/"site" nas planilhas — sinônimos. "Pendência" é tudo que a view `v_pendencias` agrega: termos não assinados, itens faltantes de devolução, triagem parada e o campo livre `ativos.pendencia`.

**Patrimônio:** formato canônico = `PREFIXO + 7 dígitos com zeros à esquerda` (ex.: `WAP4491` → `WAP0004491`). Na importação, a comparação ignora os zeros para casar variantes (`WAP4491` ≡ `WAP0004491` ≡ `4491` quando o prefixo é inferível). Duas colunas: `patrimonio` (canônico) e `patrimonio_original` (como veio da planilha). Prefixos vistos: WAP, PRO, LEA, TEC, STF, PAT, NOO. Sem patrimônio → cadastra com flag de pendência.

**Duplicidade de patrimônio (regra definida pelo Johnny em 09/07):** o patrimônio é o identificador do dia a dia, mas **repete em casos raros** — por isso quem é único no banco é o par **patrimônio + service tag**. Quando uma busca por patrimônio encontrar mais de um ativo, a interface obriga a escolher pela service tag (exibida junto de modelo e filial). Dois ativos com o mesmo patrimônio e ambos **sem** service tag não podem coexistir — a importação acusa como inconsistência.

**Unidades:** `CD-AFP` = `CD-Afonso Pena`; `CD-PENA` = `CD-Afonso Pena`; `Afonso Pena` = `CD-Afonso Pena`; `Eusebio` = `Eusébio`; `Filial-CE` = `Eusébio`; `Serra Park` = `Serra`; "Matriz " (com espaço) = `Matriz`. *(Ampliado em 15/07/2026 com os valores reais da planilha — pergunta 1 da §13 respondida.)*

## 6. Módulos e telas

1. **Login (operação)** — e-mail de domínio corporativo (§3) + senha, via convite (Supabase Auth). Sem cadastro aberto. Quem só visualiza relatórios **não loga**: entra pela senha de acesso (item 5 e §3).
2. **Dashboard (home)** — visão geral do operador: KPIs do estoque, movimentações recentes, pendências, atalhos de ação. (Quem entra por senha não vê esta tela — vai direto aos relatórios.)
3. **Ativos** — lista com busca por patrimônio/colaborador/marca/modelo e filtros (filial, categoria, status). Detalhe do ativo = ficha + **linha do tempo de movimentações**. Admin: criar/editar. Criar = fluxo **"Novo equipamento"**: cadastro + movimentação `compra` num único submit (regra 8), com **entrada em lote por lista ou faixa de patrimônios** — compra chega em série (caso real nos dados: 10 celulares WAP0006026–0006035 numa única entrada).
4. **Nova movimentação** — a tela mais usada; otimizada para ser mais rápida que a planilha: buscar ativo por patrimônio (autocomplete; se o patrimônio tiver duplicata, mostra as opções com service tag e modelo para escolher) → escolher tipo → o form só pede o que aquele tipo exige → salvar. Validações de transição de estado (seção 8). Suporta lote (ex.: notebook + monitor + celular para o mesmo colaborador num único fluxo, como no chamado 5065 dos dados).
   **Facilitadores para vencer o Excel** (decisão de 09/07/2026 — sem importação depois do go-live, a operação manual é a única entrada): data de hoje já preenchida, foco automático no campo de busca ao abrir, atalho de teclado `N` abre "nova movimentação" de qualquer tela, **"repetir última"** (pré-preenche tudo da movimentação anterior, menos o ativo) e **"duplicar"** a partir de qualquer linha da linha do tempo. **Desde a F12, também "aplicar kit"**: no passo 2, ao lado de "repetir última", o operador escolhe um modelo salvo em `admin/kits` e os quatro campos (tipo, motivo, termo, observação) são preenchidos de uma vez — **substituindo sempre**, inclusive limpando o que o modelo não define, para que aplicar duas vezes dê o mesmo resultado. As categorias esperadas do kit aparecem como **checklist informativo** (mostra o que ainda não está no lote, reage a mudanças no passo 1 e **nunca impede registrar** — quem decide o que pode ser gravado é a máquina de estados, §4); kit cujo tipo não vale para os ativos do lote **não é aplicado nem em parte**, com aviso explicando. **A lista de movimentações (`/movimentacoes`) é a porta desta tela desde a F11** — ver a emenda ao fim desta seção.
5. **Relatórios** — página ao vivo por filial (`/relatorios/[filial]`) + **geração do relatório da semana** (snapshot interativo versionado) com histórico em `/relatorios/gerados` — detalhes na seção 7.
6. **Administração** — convidar/gerenciar usuários (só os domínios da §3), **senhas de acesso dos relatórios** (criar com rótulo, ver último uso, revogar), filiais, ajustes de vocabulário (motivos), **kits de movimentação** (F12 — os modelos do item 4), catálogo de itens por quantidade (com o estoque mínimo de cada um), import de startup por filial (§10.2) e exportar backup CSV.

> **Lista de movimentações (emenda F11, 22/07/2026).** A spec original previa a **nova movimentação** (item 4) e a linha do tempo por ativo (item 3), mas **nenhuma lista das movimentações registradas** — não havia como responder "o que foi registrado hoje?" sem abrir ficha por ficha. A F11 criou a tela **`/movimentacoes`**: lista de todas as movimentações, da mais recente para a mais antiga, com filtros de **período, tipo e filial** e uma busca de campo único (o texto que canoniza como patrimônio filtra pelo equipamento; o resto procura pelo colaborador), paginada e com o estado inteiro na URL — o link reproduz o recorte. Cada linha traz data, tipo, patrimônio (link para a ficha, com a service tag ao lado quando o patrimônio repete — §5), colaborador, filial, operador e observação, marcando estorno e movimentação estornada. É tela de **leitura**: não registra, não edita e não apaga nada.
>
> **Mudança de navegação (decisão da OS-F11 §2, registrada em `docs/DECISOES.md` — 2026-07-22 · F11):** o item "Movimentações" do menu lateral passa a abrir a **lista**; o atalho `N`, o botão do cabeçalho e o card do painel inicial continuam indo **direto ao formulário** de nova movimentação. Registrar segue a um gesto; auditar deixou de ser impossível.

> **Import de startup por filial (emenda F7, 16/07/2026).** A regra original (09/07/2026) era "não existe tela de importação"; a carga do go-live rodava só por scripts (seção 10). A F7 abriu uma **tela `admin/importar`** para o *import de startup* — o go-live novo de **uma filial**, no modo **Substituir tudo** (apaga o acervo da filial e recria a partir do CSV), com preview do custo, backup automático e confirmação pelo nome da filial (§10.2). A entrada de dados **do dia a dia** continua sendo a operação manual do item 4 — vencê-la do Excel segue sendo requisito. Sincronização recorrente e o modo *Atualizar* continuam fora de escopo.

## 7. Relatórios: ao vivo e gerados

Dois modos complementares substituem o e-mail semanal (decisão de 09/07/2026):

- **Ao vivo** — `/relatorios/[filial]`: manda-se o link (e a senha de acesso) uma vez; a página está sempre atual. Sem conta, sem cadastro.
- **Gerado** — o ritual da sexta-feira vira **um clique**: um snapshot interativo dos dados da semana, congelado e versionado (§7.1), com link permanente.

Estrutura de `/relatorios/[filial]` (e a visão consolidada `/relatorios/geral`) — **o formato do e-mail semanal, reorganizado por grupo de equipamento** (v2, F3B). Chips-âncora fixos no topo (Principais · Acessórios · Componentes · Saídas · Entradas) para navegar o relatório longo; no mobile os grupos são recolhíveis (o primeiro fica aberto); a impressão quebra página por grupo.

1. **KPIs gerais** — total de ativos, em uso, em estoque, reservados, em triagem, em manutenção, reserva técnica — cada um com **Δ vs período anterior** (setinha ▲▼) — + gráfico de saídas × entradas do período (granularidade adaptativa dia/semana/mês).
2. **Grupo — Equipamentos principais** (notebooks, desktops, monitores, celulares, tablets): KPIs do grupo (guardados · reservados · em manutenção · emprestados, com Δ) → **estoque no último dia por categoria × status** (barras horizontais empilhadas com rótulo por segmento + total) → **disponíveis por modelo** (bar list agrupada por categoria — a lista que abre o e-mail) → **reservados com nº do chamado** → **em manutenção, caso a caso** (um card por ativo: patrimônio, modelo, chamado, "há N dias", e a mini-linha do tempo obs do envio → **anotações** (autor+data) → retorno; inclui quem voltou de manutenção no período). **(Emenda F14)** o card mostra também o **chamado do fornecedor** do envio; o caso encerrado por **devolução ao fornecedor** (não teve conserto) ganha badge própria neutra "devolvido ao fornecedor" no lugar do "voltou" verde. A compra do **substituto** (se houver) entra normalmente nas Entradas do período (é entrada real). → saídas e entradas por motivo.
3. **Grupo — Acessórios e periféricos** — tabela por item (saldo · atrelados · Δ período · **falta** · obs) + barras divergentes da movimentação por item + carimbo "último lançamento em dd/MM".
4. **Grupo — Componentes** — idem, filtrando o catálogo por `grupo = componente` (SSD, memórias por DDR e tamanho).
5. **Pendências** — termos não assinados, devoluções com itens faltantes, ativos parados em triagem.
6. **Saídas do período** — tabela detalhada (saída + empréstimo) com contagem no título, resumo por filial × motivo e filtros internos: Data · Filial · Categoria · Marca/Modelo · Patrimônio · Tipo · Motivo · Chamado · Colaborador/Setor · Termo · Obs.
7. **Entradas do período** — idem (devolução + compra): Data · Filial · Categoria · Marca/Modelo · Patrimônio · Tipo · Motivo · Colaborador · Setor · Itens faltantes · Obs.
8. **Transferências** — bloco condicional (só quando houver), aparece nas duas filiais (regra 5).
9. **Resumo no formato do e-mail** — "19 saídas: Matriz — novo colaborador: 04 notebooks, 04 monitores; …" gerado automaticamente, com botão **copiar texto** e **imprimir** a página limpa.

O **estoque "no último dia do período"** e todas as listas de estado são reconstruídos **as-of** (função SQL): período terminando hoje usa o estado atual (caminho barato); período no passado (snapshot regerado, errata) reconstrói o estado exato do fim do período. **Sem export CSV** (decisão do plano de 14/07/2026): quem precisar de arquivo usa a impressão limpa (PDF pelo navegador).

Tempo real, em duas camadas: Server Components buscam dados frescos a cada acesso; na página aberta, subscription de Supabase Realtime nas tabelas `movimentacoes`, `lancamentos_item` e `anotacoes` atualiza os números sem F5 (para operadores logados). Sessões por senha não têm credencial de banco e não abrem websocket — para elas a página se atualiza sozinha por revalidação periódica (~60 s), o que na prática é tempo real para quem consulta.

**Por que não Power BI:** foi considerado e descartado para a v1 em 09/07/2026 — compartilhar exige licença Pro por usuário, o refresh do plano básico é agendado (não tempo real) e ninguém da equipe domina a ferramenta. A porta fica aberta: o Postgres do Supabase aceita conexão direta do Power BI no futuro, sem mudar nada no sistema.

### 7.1 Relatório gerado da semana (snapshot interativo)

O equivalente moderno do e-mail de sexta-feira — pedido do Johnny em 09/07/2026:

- **Gerar:** botão "Gerar relatório" (só admin) com período padrão **segunda a sexta da semana corrente** (mesmo recorte dos e-mails reais, ex.: "22/06 até 26/06"), ajustável; escopo por filial ou geral.
- **Snapshot congelado:** os dados do período são calculados na hora e gravados em `relatorios_gerados` (jsonb). O relatório **não muda mais** — mesmo que depois haja estorno ou correção, o que foi apresentado na sexta continua auditável. Quem corrige gera nova versão.
- **Versionado — o fim da ERRATA:** regerar o mesmo período cria a **versão 2**; a versão 1 continua acessível com um aviso "existe versão mais recente". Ninguém reenvia nada: o link aponta para a versão atual.
- **Interativo:** a página `/relatorios/gerados/[id]` renderiza o snapshot com os mesmos componentes do relatório ao vivo (v2: 3 grupos + tabelas detalhadas) — gráficos com tooltip, tabelas filtráveis, resumo no formato do e-mail com "copiar texto" e impressão limpa. Não é um PDF morto. Snapshots gerados antes da F3B (formato v1) continuam abrindo (o leitor normaliza pelo carimbo de schema).
- **Histórico:** `/relatorios/gerados` lista todos (período, filial, versão, quem gerou, quando) — o arquivo semanal que hoje se perde na caixa de e-mail.
- **Acesso:** a mesma senha de acesso dos relatórios; **gerar** é ação de operador logado.
- Download como **HTML autocontido** (arquivo único para anexar/arquivar) fica no backlog da F5.

Conteúdo do snapshot = as mesmas seções da página ao vivo recortadas no período + resumo textual, com destaque para as **observações das movimentações** (o contexto que hoje vai em texto vermelho no e-mail).

## 8. Regras de negócio e validações

1. Patrimônio é obrigatório e identifica o ativo, mas **pode repetir em casos raros** — único mesmo é o par patrimônio + service tag (§5). Movimentação sobre patrimônio duplicado exige desambiguar pela service tag. Ativo sem patrimônio entra com pendência sinalizada, nunca silenciosamente.
2. Só transições de estado válidas (seção 4): não há saída de ativo `descartado`, nem devolução de ativo `em_estoque`. O erro mais comum da planilha morre aqui.
3. Saída/empréstimo exigem: colaborador **ou** setor de destino, motivo e (se houver) nº do chamado. Devolução exige: motivo + checklist de itens faltantes (carregador, mochila, mouse…) — vira a pendência automaticamente.
4. Termo de responsabilidade: flag por movimentação de saída (`sim/não/enviado/gerado`) com data; relatório cobra os pendentes (só `sim` = assinado sai da cobrança). Desde a **F5A** o próprio sistema **gera o documento** (`.docx`) já preenchido — ver §8.1. Upload do PDF assinado fica para fase futura (pergunta 5, seção 13).
5. Transferência entre filiais muda a filial do ativo e aparece no relatório das duas.
6. Movimentação não se apaga: **estorno** (disponível desde a F2) devolve o ativo ao estado completo anterior — status, colaborador, setor e filial — e fica registrado apontando para a movimentação estornada. Só a última movimentação efetiva do ativo pode ser estornada; para casos excepcionais existe o `ajuste`, sempre com justificativa. Toda linha tem `criado_por` + timestamp.
7. Alerta de possível duplicata: mesmo ativo + mesmo tipo + mesmo dia (era um erro real nas planilhas — 6 casos).
8. Compra em dois passos num fluxo só: cadastra-se o ativo (que nasce `em_estoque`) e registra-se a movimentação `compra`, que documenta a entrada (nota/observação) e fixa a filial que recebeu.
9. **Toda movimentação aceita observação** — texto livre, **opcional** (obrigatória apenas no `ajuste`, como justificativa). Aparece na linha do tempo do ativo, nas tabelas de relatório e nos snapshots gerados: é onde vive o contexto que hoje vai em vermelho no e-mail ("aguardando NF-e", "recolhido por problema de tela"…).

### 8.1 Geração de termos pelo sistema (F5A)

Ao registrar a movimentação, o sistema oferece o **termo pronto**: o que ele já sabe (colaborador, marca, modelo, service tag, patrimônio, chamado, datas) vem preenchido; o que não sabe (extras do celular, "outros componentes", observação, variante do monitor) é digitado uma vez num formulário curto — **todo campo é editável, inclusive as datas**, e a edição vale só para o documento (não altera o cadastro do ativo nem a movimentação). Visualiza-se o **arquivo `.docx` real** antes de baixar; o download é fiel ao preview.

- **7 modelos** (`src/templates/termos/`, tagueados e sanitizados): 5 de **responsabilidade** (notebook, desktop, celular, monitor uso interno, monitor home office) e 2 de **devolução** (equipamento, desligamento). A caixa/logos/marca d'água/cláusulas são idênticas aos modelos manuais que a WAP já usa.
- **Responsabilidade** = um termo por ativo (saída/empréstimo). **Devolução** = um termo por lote (consolida 1..n equipamentos; desligamento usa o modelo consolidado). Categorias **tablet** e **outro** ainda não têm modelo (não oferecem geração).
- Gerar grava o **snapshot completo** (jsonb) na tabela `termos_gerados` **e** o `.docx` no **Storage privado** (bucket `termos`), sempre. **Versão única** por termo: regerar/editar **substitui** o anterior (sem arquivos órfãos). Só o operador autenticado acessa; o visualizador por senha **não** vê termos.
- Gerar um termo de **responsabilidade** marca o ativo como **`gerado`** (`termo_assinado` + `termo_data`) — que **continua contando como pendência** (`v_pendencias`): a cobrança só encerra em `sim` (assinado). `enviado` e `sim` seguem manuais. As movimentações são imutáveis (§8 regra 6), então a flag mora no ativo.

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

Arquitetura em uma linha: **Next.js fala com o Supabase; leituras via Server Components (+ Realtime no cliente para logados), escritas via Server Actions; RLS garante no banco que só operador logado lê/escreve — o visualizador por senha nem credencial de banco tem (as páginas de relatório dele são servidas pelo servidor).**

Padrões de segurança: RLS em todas as tabelas (`authenticated` = operador: tudo; `anon`: nada), acesso por senha 100% no servidor (hash scrypt, cookie httpOnly assinado, revogação com efeito imediato, escopo restrito às rotas de relatório), service key só no servidor, convites com expiração e restritos aos domínios corporativos da §3 (validação na aplicação **e** no banco).

Custo para a WAP: **R$ 0**. Supabase no plano Free; deploy na conta **Vercel Pro que o Johnny já paga** — o Hobby gratuito da Vercel é restrito por fair use a uso pessoal não-comercial e não serve para sistema de empresa. Limites do free tier no risco 5 (seção 12).

## 10. Carga inicial única (go-live) — scripts, não tela

Decisão de 09/07/2026 (revista pela F7 em 16/07/2026 — ver §10.2): a carga das planilhas do go-live inicial é uma **operação única**, executada de forma autônoma pelo Claude Code (com os CSVs fornecidos pelo Johnny) via scripts de `scripts/import/` (entregues na F4): dry-run → relatório de inconsistências → carga confirmada. Reexecutável **durante a janela do go-live** (idempotente), sem interface no app; após o cutover os scripts permanecem no repositório apenas como ferramenta histórica. Não há sincronização recorrente com planilhas. Estratégia em 4 passos, pensada para dados sujos:

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

### 10.2 Import de startup por filial na administração (F7, 16/07/2026 · correção na tela: F7B, 17/07/2026 · patrimônio opcional + datas dd/MMM: F7E, 17/07/2026 · facilitadores: F7F, 17/07/2026 · leitura de .xlsx: F7G, 20/07/2026 · compra datada = entrada: F7H, 20/07/2026 · compra de abertura sempre baseline, reverte a F7H: F8, 20/07/2026 · patrimônio ausente: hostname automático + ausência textual ampliada: F7-pós, 20/07/2026 · hostname curto + forçar fora do padrão + limpar: F7J, 20/07/2026 · modelo que repete a marca: F7K, 20/07/2026)

Emenda à regra "não existe tela de importação". Decisão do Johnny (16/07/2026, registrada em `docs/DECISOES.md`): além da carga única por scripts do go-live global (F4), existe uma tela **`admin/importar`** para o **go-live novo de cada filial** — quando uma filial passa a ser controlada pelo sistema e seu inventário chega como CSV (mesmo layout da planilha, 3 variantes por nome de coluna).

- **Só o modo *Substituir tudo*** (import de startup): apaga fisicamente o acervo atual **daquela filial** (ativos + movimentações + anotações + termos gerados que só a referenciam, com os `.docx` do bucket) e recria a partir do CSV. O modo *Atualizar* (upsert incremental) foi **adiado** — correção do dia a dia é manual, no próprio sistema, linha por linha.
- **A entrada de cada ativo usa a data real do CSV** (a mais antiga válida entre Inclusão/Entrega), gravada como `compra` de abertura com o marcador `import startup dd/MM/yyyy`; um `ajuste` leva ao estado da planilha (precedência Situação>Status). Linha sem data válida entra "sem data", **fora dos relatórios do período** (mesmo tratamento da carga go-live). Startup não conta como entrada do período — o marcador exclui compras e ajustes do import das tabelas/série do relatório; a data real vale para o histórico de estoque (as-of) e para a ficha.
- **Tudo-ou-nada, com erros linha a linha:** qualquer linha inválida (patrimônio inválido, par patrimônio+service tag duplicado, `Site`≠filial, categoria/estado fora do De→Para, ativo descartado) **bloqueia** o import inteiro. Zero bloqueante para aplicar.
- **A correção acontece na própria tela (F7B, 17/07/2026):** no preview, cada erro vira ação. Erros repetidos são **agrupados pelo valor cru** e corrigidos **em massa** — o mesmo `Tipo` errado em N linhas se corrige uma vez (categoria, estado, site desconhecido e data); erros pontuais (patrimônio, service tag, colaborador) têm edição inline **com o contexto completo da linha**, nunca a célula solta. Os **avisos** (`sem_data_entrada`, `estado_em_uso_sem_colaborador`) ganham a mesma mecânica, mas seguem **sem bloquear**. Toda linha pode ser **removida do import**. Limites: `Site` de **outra filial conhecida** (ex.: "Serra" num import da Matriz) só oferece **remover a linha** — forçar a filial do import mascararia uma transferência, que é operação do sistema, não do import; `Site` **desconhecido** (typo, ex.: "Matriz SM") é corrigível para a filial selecionada; **descartado continua bloqueante** (trocar o estado ou remover a linha); header fora dos 3 layouts e linha sem chave não têm correção (arquivo/estrutura errados).
- **O CSV original nunca muda; as correções são auditadas.** O `arquivoHash` continua sendo o sha-256 do **arquivo enviado**: as correções são operações declaradas, aplicadas em memória sobre as células antes da extração e gravadas em `import_logs.correcoes` — a auditoria é **arquivo + correções → plano**. Cada mudança dispara **reanálise total** pelo mesmo motor (correção não é bypass: a régua é a mesma e o motor continua o único juiz — corrigir um patrimônio para um valor que duplica outro par volta a bloquear). As correções valem **só naquele import** (não há catálogo De→Para entre imports); um botão baixa o **CSV corrigido**, que é o artefato do que efetivamente foi importado e reimporta limpo.
- **Salvaguardas obrigatórias (operação destrutiva assumida):** preview com o custo à vista (quantos ativos/movimentações/anotações/termos serão apagados), **backup automático** do acervo antes de aplicar (bucket privado `backups-import`, baixável), **confirmação digitando o nome exato da filial**, transação única com contagens conferidas dentro dela (`importar_ativos_substituir`, `security definer`), e trilha de auditoria (`import_logs`). Snapshots congelados (`relatorios_gerados`) **não** são tocados. Termo que mistura ativos de mais de uma filial bloqueia o import (resolver antes). Import **nunca transfere** ativo entre filiais.
- Import de startup ≠ sincronização recorrente: continua sendo um evento de abertura, não uma porta de sincronização com o Excel. A entrada operacional do dia a dia permanece 100% manual (item 4 da seção 6).
- **Emenda F7E (17/07/2026) — startup com dados imperfeitos.** Três ajustes vindos do primeiro CSV real, sem afrouxar a régua nem as salvaguardas: (1) **datas de entrega no formato `dd/MMM`** (`18/nov`, `21/jan`) passam a ser interpretadas puxando o ano da Data de Inclusão da mesma linha (**+1 ano** quando a entrega cai antes da inclusão; resultado no futuro é ignorado) e datam o **ajuste de reconciliação** (a `dataEntrada` mantém "mais antiga válida"; a exclusão do relatório do período continua sendo pela observação `import startup`, não pela data). (2) **Patrimônio vazio deixa de bloquear:** vazio-na-prática (`""`, `-`, `n/a`, `SEM PATRIMONIO`…) importa com `patrimonio` **NULO** + `ativos.pendencia = 'sem patrimônio físico'` (a mesma fila do go-live F4) + aviso `patrimonio_vazio`; aparece na lista de ativos (badge + filtro "sem patrimônio") e em `/pendencias` (bucket próprio, que também acolhe os "patrimônio não canônico" do go-live), é movimentável (busca por service tag/hostname) e entra em termo como "sem patrimônio"; corrigir o patrimônio na ficha encerra a pendência. Só-números e demais não-canonicalizáveis **seguem bloqueantes**. (3) Os erros do mesmo tipo (`patrimonio_invalido`, `sem_data_entrada`, `patrimonio_vazio`) viram **um card por tipo** (antes um por valor cru — 117 cards de 1 linha no CSV real), e o card de patrimônio inválido oferece a **sugestão de 1 clique do Hostname** quando ele canonicaliza (nada é aplicado sem confirmação). Migration `0034` (patrimônio nullable + índice único parcial da service tag + RPC com pendência/data-do-ajuste/conferência agregada).
- **Emenda F7F (17/07/2026) — facilitadores antes do próximo go-live.** Cinco defeitos de usabilidade/robustez corrigidos, sem migration (TypeScript + UI apenas; a régua de bloqueio e as salvaguardas seguem intactas): (1) **patrimônio ausente cujo `Hostname` traz um patrimônio canônico embutido** (padrão real `NB-WAP0001234`) é **auto-preenchido no preview** com o token canônico limpo (`WAP0001234`) — aviso **âmbar informativo** `patrimonio_do_hostname`, auditável (painel de auditoria + contador no resumo e nas "correções aplicadas"), **fora do fluxo de correção** (não vira card). A reanálise segue juíza: se dois hostnames resolverem para o mesmo patrimônio, a **duplicata reaparece bloqueante**; patrimônio **com valor inválido nunca é sobrescrito** pelo hostname (segue `patrimonio_invalido` bloqueante). O extrator só captura o token `[A-Z]{2,4}\d{7}` delimitado (ou nada) e nunca interpola/executa nada — payload em volta (`=cmd`, aspas, `;`, ` OR 1=1`) é descartado; o "Baixar CSV corrigido" escapa `;`/aspas. (2) **Patrimônio vazio (sem hostname aproveitável) é aviso ÂMBAR, não erro vermelho** — importa nulo com a pendência "sem patrimônio físico" (F7E); só-números e não-canonicalizáveis seguem **bloqueantes vermelhos**. (3) **"Aplicar todas as correções" passa a incluir grupos pontuais parcialmente preenchidos** (aplica só as linhas válidas; banner "N aplicadas · faltam M"), em vez do antigo tudo-ou-nada por grupo; `patrimonio_vazio`/duplicata seguem fora do lote (correção opcional/humana). (4) **O "Substituir tudo" nunca mais falha com o genérico sem diagnóstico:** o erro do banco é traduzido por **SQLSTATE + substring** (timeout `57014`, índice parcial `23505`, os `raise` `P0001` da RPC — TOCTOU, plano vazio, termo multi-filial, categoria/estado inválido, identidade repetida, divergência) para texto acionável, sempre **logado** no servidor; teto de corpo da Server Action elevado para **8 MB** (`bodySizeLimit`; o maior plano real mede ~0,7 MB). Provou-se em DEV que elevar o `statement_timeout` dentro da RPC é no-op (não re-arma o timer do statement de topo) e que ~1.200 ativos rodam em ~1,0–1,4 s — por isso **não há migration 0035**. O tier âmbar usa um par semântico próprio (`--warning`/`--warning-foreground`, contraste AA em claro e escuro), alinhado ao amarelo WAP.
- **Emenda F7G (20/07/2026) — leitura direta do `.xlsx`.** A tela passa a aceitar o **arquivo Excel `.xlsx` nativo** além do CSV (roteamento por CONTEÚDO — assinatura ZIP —, não por extensão). Motivo, achado num "bug" reportado no import da Matriz: o CSV exportado do Excel é uma reexportação **com perdas** — a Data de Inclusão vinha **vazia** (365 linhas) ou como `#######` (coluna estreita), a Data de Entrega abreviada `dd/MMM` (`24/set`) **não resolvia o ano sem a Inclusão** (F7E), e acentos viravam `�` (cp1252); resultado: ~355 dos 1.100 ativos da Matriz ficaram com a `compra` de abertura datada no **dia do import** em vez da data real. No `.xlsx` a célula de data guarda o **serial**, então o leitor a devolve já em `dd/MM/aaaa` **com o ano** e o texto é UTF-8 — as ~208 linhas com entrega `dd/MMM` voltam a ter data, e `#######`/`�` somem. O `.xlsx` é convertido no **mesmo formato interno** (`CsvCru`) do CSV, então **todo o motor** (layout, correções F7B, dedupe, De→Para, RPC e as salvaguardas) é reaproveitado **sem mudança**; o "Baixar corrigido" sai como CSV reimportável. O que **não** muda: a exclusão do startup dos relatórios do período (pela observação `import startup`) segue de propósito, e o item CONTA no estoque e APARECE na linha do tempo da ficha. Dependência nova **ExcelJS** (MIT, aprovada pelo Johnny). **Sem migration.**
- **Emenda F7H (20/07/2026) — compra COM data real vira Entrada no relatório (revisão parcial da regra "startup não conta como entrada").** _(SUPERADA pela Emenda F8 — mantida aqui como histórico.)_ Ao reimportar a Matriz pelo `.xlsx` (F7G), as datas ficaram corretas, mas os equipamentos **novos** não apareciam nas Entradas: toda compra do startup levava o marcador `import startup` e o relatório o exclui em bloco. Decisão do Johnny: a **compra COM data real** do arquivo passa a aparecer nas Entradas **no período da data** (como uma compra manual); só a **compra SEM data** (saldo de abertura de data desconhecida, que cai na data do import) e os **ajustes** de reconciliação ficam de fora. O marcador na compra vira **condicional** — sinal exato de "sem data" é `data = created_at::date` (o fallback data no dia do import), sem valor hard-coded. **Migration 0035** (`create or replace` PURO da RPC, só o passo 4b muda). O código do **relatório não muda** (o filtro já inclui compras de observação NULL); os dados já importados são corrigidos por um UPDATE pontual (strip do marcador nas compras com `data < created_at::date`). O AJUSTE segue sempre marcado; o item continua contando no estoque e aparecendo na ficha.
- **Emenda F8 (20/07/2026) — compra de abertura volta a ser SEMPRE baseline (REVERTE a Emenda F7H).** Restaura integralmente a regra desta seção ("startup **não** conta como entrada do período"). A F7H fez a compra COM data real escapar do marcador e aparecer nas Entradas; na prática deu errado, porque a planilha de startup **não distingue** "compra nova comprada agora" de "saldo de abertura de um ativo que já existia" — **toda** linha traz uma data de entrada. Resultado: as Entradas do relatório encheram do acervo pré-existente da filial (a Matriz, reimportada sob a F7H, mostrou 809 dessas "compras"). Decisão do Johnny: a compra de abertura do import de startup **nunca** conta como Entrada — SEMPRE marcada `import startup dd/MM/yyyy` (com **ou sem** data), com a **data real preservada na própria compra** (linha do tempo / ficha / reconstrução as-of do estoque); só não entra no relatório do período. Compras "de verdade" (equipamento novo comprado agora) são as **lançadas manualmente** no sistema pós-go-live — sem marcador, aparecem nas Entradas normalmente. O AJUSTE segue sempre marcado. **Migration 0036** (`create or replace` PURO da RPC — o passo 4b volta ao corpo da 0034; diff vs 0035 = só o 4b). O **relatório não muda** (o filtro por prefixo já esconde tudo que é marcado). Os dados da **Matriz** são corrigidos por um UPDATE pontual que **devolve** o marcador reconstruído de `created_at` (mesmo conjunto de 809 linhas que a F7H expôs, com backup). O **import de histórico (saída/devolução)** — que traria as saídas/devoluções reais do arquivo como movimentações do período — **não será construído** (decisão do Johnny, 20/07/2026): a entrada operacional do dia a dia segue 100% manual no sistema.
- **Emenda F7-pós (20/07/2026) — patrimônio ausente: hostname vira correção automática + ausência textual ampliada.** Dois ajustes de usabilidade no preview do import, sem afrouxar a régua (deploy-only, sem migration): (1) o **auto-preenchimento do patrimônio pelo hostname** (F7F — `NB-WAP0001234` → `WAP0001234`) deixa de ser aviso e passa a ser **correção automática silenciosa** — sai da contagem/tabela de avisos e da "lista de erros", ficando só num painel neutro de auditoria (com a coluna **"Valor original"**; nada a fazer). E passa a valer **também para patrimônio FORA DE FORMATO** (não só vazio): `12345`/`ABC` com hostname canônico é **substituído automaticamente** pelo hostname — isto **revoga** a invariante F7F "patrimônio inválido nunca é sobrescrito" (decisão do Johnny, 20/07/2026). A prioridade é: célula que canonicaliza vence → senão hostname canônico substitui → senão ausência vira nulo+pendência → senão (fora de formato **sem** hostname) segue **bloqueante** (decisão 5). O cru fica em `patrimonioOriginal` (auditável). (2) **Tudo que declare ausência de plaqueta importa vazio** (patrimônio nulo + pendência "sem patrimônio físico"), sem mais cair no bloqueante "fora do formato canônico (ex.: WAP0004491)": além do conjunto fixo, reconhece as formas produtivas `sem <algo>`, `s/<algo>`, `n/i`, `não possui/tem/consta/informado/localizado…`, palavras de ausência isoladas (`nenhum`, `nada`, `inexistente`, `ausente`) e strings só de símbolos (`--`, `??`). **Decisão 5 intacta:** só-números e lixo sem declaração de ausência (`ABC`, `WAPalmaq-teste`, `semaforo`) seguem bloqueando (podem ser patrimônio mistypado); a guarda `canonicalizarPatrimonio()===null` blinda um patrimônio válido (`SEM0001234`) de virar nulo.
- **Emenda F7J (20/07/2026) — hostname com patrimônio curto, forçar fora do padrão e limpar patrimônio.** Três ajustes (decididos pelo Johnny). **(1)** O reconhecimento do patrimônio no **hostname** passa a aceitar prefixo + **menos de 7 dígitos** (`NB-PRO3694` → `PRO0003694`, completando os zeros), mas **só para prefixos de patrimônio conhecidos** (`WAP, PRO, LEA, TEC, STF, PAT, NOO`) — assim `PC-01`/`SALA-5` não viram patrimônio. **(2)** Um valor **fora do formato canônico** (`LEA7LYHQH4`, `STF003LOC`) pode ser **forçado** pelo operador ("Usar mesmo assim" no card de patrimônio inválido) e passa a ser o **patrimônio de verdade** do ativo, mesmo não-canônico (a busca casa por substring; o cru fica em `patrimonio_original`). Isso **relaxa a régua de formato canônico**: a validação de formato sai do banco (migration `0037` deixa a RPC só com a sanidade — não-vazio, ≤60 caracteres) e passa a ser do motor/UI, onde forçar é uma escolha explícita e auditada (`import_logs.correcoes`, op `forcar_patrimonio`). A dedupe/índice único seguem por string exata (colisão reaparece bloqueante). **(3)** Na correção de patrimônio inválido há um botão **"Sem patrimônio"** que **limpa** o patrimônio (importa como pendência) — antes não dava para aplicar com o campo vazio. Prioridade final do patrimônio: célula canônica > forçado (cru) > hostname > ausência (nulo+pendência) > bloqueante. Deploy-only + migration `0037` (relaxa só o passo 1d da RPC).
- **Emenda F7K (20/07/2026) — modelo que repete a marca é auto-corrigido.** Alguns modelos trazem a marca repetida no início (marca `HP` + modelo `HP Pro SFF 280 G9`), e o rótulo marca+modelo saía **"HP HP Pro SFF 280 G9"**. O import passa a **remover automaticamente a marca-prefixo do modelo** (palavra inteira, caixa-insensível → `Pro SFF 280 G9`), corrigindo na FONTE: com o `modelo` limpo, todos os pontos que exibem marca+modelo (relatório, lista, ficha, termos) saem certos. Só o início do texto é tocado; um modelo que é só a marca vira vazio. Deploy-only (sem migration); os ativos já existentes limpam-se na re-importação (Matriz) ou por um UPDATE opcional de dados.

## 11. Fases de entrega

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **F0 — Fundação** | Repo + Next.js + Tailwind + shadcn/ui + projeto Supabase + login por convite + layout base + deploy Vercel | Johnny e a operadora logam em produção |
| **F1 — Banco + dados fictícios** | Migrations do schema + **seed fictício realista** (~1.200 ativos, ~700 movimentações, seção 10.1) + views | Seed roda e reseta com um comando; `v_estoque_atual` bate com o seed |
| **F2 — Operação** | Lista/ficha de ativos + **nova movimentação** com validações + **estorno** (sem estorno não há como corrigir erro, já que movimentação é imutável) | Ciclo completo compra → saída → devolução → triagem registrável de ponta a ponta, sobre dados fictícios |
| **F3 — Relatórios** | `/relatorios/[filial]` + consolidado, tempo real, snapshot versionado, acesso por senha | Dashboards demonstráveis com dados fictícios; validação visual com quem recebe o e-mail hoje |
| **F3B — Relatórios v2** | Relatório no formato do e-mail (3 grupos + tabelas de Saídas/Entradas), **itens por quantidade** (catálogo + lançamentos, antecipados da F5), **anotações** na linha do tempo, reconstrução as-of do estoque, sem export CSV | Relatório cobre 100% do e-mail com dados fictícios; falta/atrelados automáticos; snapshot v2 congela os 3 grupos |
| **F4 — Carga inicial + go-live** | Scripts de carga única (`scripts/import/`): normalização De→Para + dry-run + relatório de inconsistências + carga idempotente (inclui os **saldos iniciais de itens** a partir da planilha de gestão online); ensaio; reset do seed | Dados reais dentro; números batem com as planilhas; **cutover: planilhas viram só-leitura, e-mail semanal aposentado por completo e nenhuma tela de importação existe no app** |
| **F5 — Refino** | Pendências e alertas avançados, **estoque mínimo por item** (reorder point), resumo automático por e-mail (opcional), backup agendado, upload dos termos (PDF), HTML autocontido do snapshot, kits de lote salvos | Backlog priorizado com o uso real |

Ordem pensada para o sistema ficar **demonstrável cedo sem depender dos dados reais**: F3 já mostra os relatórios com dados fictícios; a virada de chave (F4) acontece quando a WAP quiser, sem pressa e sem período de convivência planilha×sistema. Detalhamento de esforço, escopo por fase e ordem das telas: [`PLANEJAMENTO.md`](./PLANEJAMENTO.md).

## 12. Riscos e pontos de atenção

1. **Limpeza de dados subestimada** — é o risco nº 1 em migração de planilha. Mitigação: carga inicial com dry-run + relatório de inconsistências (F4), ensaiada com as planilhas reais em ambiente de teste antes do go-live, e a regra "nada entra silenciosamente errado".
2. **Adoção** — se registrar movimentação for mais lento que a planilha, a planilha volta. Mitigação: tela de movimentação desenhada para ≤30s por registro, fluxo em lote, atalhos.
3. **Período de transição** — evitar sistema e planilha em paralelo por semanas (divergem de novo). Mitigação: durante o desenvolvimento o sistema roda só com dados fictícios (convivência zero); a virada acontece de uma vez na F4 — importa, confere os números e as planilhas viram só-leitura na mesma semana.
4. **Dados pessoais (LGPD)** — nomes de colaboradores visíveis a quem tiver uma senha de acesso (senha compartilhada expõe mais que conta individual). Mitigação: a senha só abre as rotas de relatório; senhas rotuladas e revogáveis uma a uma (vazou → mata só aquela); rotação periódica recomendada; guardar o mínimo (nome/setor, sem CPF); retenção do histórico de desligados a definir.
5. **Free tier do Supabase** (números conferidos em 09/07/2026) — pausa após **1 semana sem requisição** (com uso diário não acontece; se pausar durante o desenvolvimento, religa-se no painel em segundos), **500 MB** de banco (anos de folga para ~1,2k ativos) e **2 projetos gratuitos** — exatamente o que o plano usa: produção + ambiente de ensaio do importador. Se crescer: Pro US$ 25/mês, só se a WAP um dia decidir pagar.
6. **Bus factor = 1** — uma pessoa opera tudo. Mitigação: segundo admin de contingência (pergunta 7) + backup CSV automático mensal.

## 13. Perguntas em aberto (para Johnny/WAP responder)

1. ~~Filiais oficiais~~ — **respondida em 15/07/2026 (pré-F4):** Serra Park é **filial própria** ("Serra", com estoque — a planilha tem aba própria com 63 ativos) e **Filial-CE = Eusébio**. Filiais oficiais: **Matriz, CD-Afonso Pena, Linhares, Eusébio e Serra**. De→Para de unidades ampliado na §5; análise em `docs/ANALISE-PLANILHA-F4.md`.
2. ~~Escopo do visualizador~~ — **respondida em 09/07/2026:** acesso por senha tem nível único; toda senha vê todos os relatórios de todas as filiais.
3. ~~Convites restritos a domínio?~~ — **respondida em 09/07/2026:** login (operação) só com `@wap.ind.br`; terceirizados (Stefanini) e filiais consultam pelos relatórios **com senha de acesso, sem conta**. **Emendada em 22/07/2026:** a parte da Stefanini foi revogada — `@stefanini.com` e `@latam.stefanini.com` passam a logar como **operador** (mesmo nível dos demais); filiais e gestores seguem só na senha de acesso. Ver §3 e a migration `0041`.
4. **Nº do chamado:** só guardar o número ou linkar para o sistema de chamados? Qual sistema é?
5. **Termo de responsabilidade:** ~~anexar o PDF assinado no sistema (F5) ou basta a flag + cobrança?~~ **Parcialmente respondida (F5A, 14/07/2026):** o sistema **gera** o `.docx` preenchido (§8.1) e a flag `gerado` mantém a cobrança. Falta decidir o **upload do PDF assinado** (fluxo gerar → enviar → assinar → anexar) — segue como item 5.5 da F5.
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

*Anexos: [`supabase/migrations/`](../supabase/migrations/) (banco — fonte da verdade desde a F1) · [`mockups/dashboard-relatorio.html`](../mockups/dashboard-relatorio.html) (mockup do relatório com os dados reais) · planilhas analisadas em 09/07/2026.*

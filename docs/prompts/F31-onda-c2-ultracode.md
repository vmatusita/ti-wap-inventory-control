ultracode

# Missão

Executar a **segunda metade da Onda C** da análise de UX de 07/08/2026 (`docs/ANALISE-UX-2026-08-07.md`, §10 — "Recursos novos"): **dois recursos da tela de itens por quantidade** — (1) **transferência de item entre filiais** numa submissão só e (2) **modo Conferência** (inventário físico com geração de ajustes em lote). Ao final: `npm run lint`, `npm run test` e `npm run build` limpos, documentação atualizada e **main pushada** (a Vercel deploya sozinha). Esta é a ordem de serviço **F31** — roda **depois** da F30.

# Contexto

- Projeto **Estoque TI WAP** (Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · Supabase). Regras permanentes de `@CLAUDE.md` valem inteiras: modo autônomo, stack fechada, UI/commits pt-BR, NUNCA dados reais em fixture/teste/screenshot, custo R$ 0.
- **Fonte:** `@docs/ANALISE-UX-2026-08-07.md` (itens ITN-01 e ITN-04, §5). As ordens F27–F30 mexeram em arquivos vizinhos (inclusive `lancar-item-dialog` na F28) — se a linha se moveu, vale a **intenção**, ancore pelo trecho.
- **Domínio (leia antes de desenhar):** a semântica dos tipos de lançamento vive em `lib/dominio.ts` e na ajuda (`lib/ajuda/conteudo/lancar-itens.ts`, `saldos-e-estoque-minimo.ts`). O ponto que motiva o recurso 1: `saida`/liberação **baixa o estoque mas não o Total** (`dominio.ts:241`) — por isso o caminho "intuitivo" de transferir (liberação na origem + entrada no destino) **infla o Total da origem para sempre**; o caminho correto é o par de **ajustes** (−N/+N). O trigger do banco garante saldo/atrelados nunca negativos, linha a linha (`0015`/`0027`; erro traduzido em `actions/itens.ts:59-61`). O estorno de lançamento **já existe** (`estornarLancamento`, `actions/itens.ts:118-120`; inverso em `lib/itens/estorno.ts`).
- Comandos: `npm run lint` · `npm run test` · `npm run build`. Testes da ajuda travam frases literais — recurso novo ganha página/seção de ajuda, comportamento alterado atualiza a existente.
- Referências do repo: carrinho de linhas dinâmicas e criação inline no `lancar-item-dialog.tsx` (F10/I1-I2); rascunho persistente `nova/rascunho.ts` (padrão a copiar, não importar); sucesso parcial do wizard (mostra o que gravou e o que falhou); RPCs transacionais como `criar_compra_lote`/`devolver_ao_fornecedor` (padrão da casa para escrita tudo-ou-nada); roteiros SQL em `supabase/tests/` e o caminho de migration em `docs/RUNBOOK-BANCO.md` (ensaio → produção, verificação pós-apply).

# Escopo — os 2 recursos

## Recurso 1 · ITN-01 — Transferir item entre filiais

Mover 10 mouses da Matriz para Serra hoje são dois lançamentos desconexos em duas aberturas do diálogo — e o caminho intuitivo corrompe o Total. Especificação:

- **Entrada:** ação "Transferir entre filiais" na tela `/itens` (junto de "Lançar item") e, na visão por filial, atalho na linha do saldo pré-preenchendo item+origem. Visível para quem escreve em **ambas** as filiais envolvidas (a validação dura é do servidor, como sempre).
- **Diálogo:** filial de **origem**, filial de **destino** (≠ origem, validado), carrinho de item+quantidade (mesmo padrão de linhas dinâmicas do lançamento; quantidade sempre positiva aqui), chamado/observação opcionais. Mostre o **saldo disponível na origem** por item (reuse o mecanismo de saldo no combobox da F28/ITN-05d; sem ele, busque o saldo da origem ao selecionar o item) e recuse no cliente quantidade acima do saldo — o servidor recusa de novo de qualquer forma.
- **Gravação — o par de ajustes, tudo-ou-nada:** cada item vira **um ajuste −N na origem** (observação "Transferência para {destino}" + chamado/obs do operador) e **um ajuste +N no destino** ("Transferência de {origem}" idem). Atomicidade na ordem de preferência: **(a)** RPC transacional aditiva (ex.: `transferir_item(origem, destino, itens jsonb, …)`) no padrão `criar_compra_lote` — validação de saldo dentro da transação, `security` e grants espelhando as RPCs vizinhas, migration aditiva aplicada pelo caminho do runbook (**ensaio primeiro, produção depois, verificação pós-apply**) e roteiro SQL novo em `supabase/tests/` provando: transfere; recusa saldo insuficiente; recusa origem=destino; nada parcial sobra em falha. **(b)** Se o ambiente não tiver acesso ao banco: implemente na camada de app com **compensação explícita** — grava −N na origem (o trigger recusa saldo insuficiente e nada aconteceu); grava +N no destino; se o destino falhar, **estorna imediatamente** a origem com o `estornarLancamento` existente e devolve erro nomeando o que houve; se até o estorno falhar, o erro nomeia o lançamento órfão para correção manual. Nesse caso, deixe a migration da RPC **escrita** em `supabase/migrations/` com cabeçalho de handoff (não aplicada) e ata em `DECISOES.md` — o endurecimento vira pendência nomeada.
- **Histórico e relatório:** as duas pernas aparecem no histórico como ajustes com as observações cruzadas — as contagens existentes **não mudam** (ajuste já é um tipo contado como sempre foi). Se optar por um selo visual "transferência" derivado da observação/par, ele é só apresentação — registre a escolha.
- **Ajuda:** seção nova em `lancar-itens`/`saldos-e-estoque-minimo` explicando quando usar transferência × liberação+entrada (e por que a segunda infla o Total).
- **Fora deste recurso:** transferência de **ativos** (já existe como movimentação), tipo novo no enum do banco (use `ajuste` — decisão da análise; registre), agendamento/aprovação de transferências.
- **Ponta a ponta (dados fictícios):** transferir 2 itens Matriz→Serra → saldos refletem dos dois lados, Total consolidado **inalterado** → histórico mostra o par → estornar uma perna avisa/comporta-se de forma coerente (documente o comportamento escolhido para estorno de perna de transferência) → tentativa acima do saldo recusada no cliente E no servidor.

## Recurso 2 · ITN-04 — Modo Conferência (inventário físico)

Conferir fisicamente uma filial hoje significa calcular diferenças à mão e digitá-las em lotes de ajustes com justificativa — a tarefa que mantém planilha paralela viva. Especificação:

- **Entrada:** botão "Conferir estoque" em `/itens` (visão por filial ou filtro de uma filial). A conferência é **de uma filial por vez** (escolhida ao entrar; casa com o mundo físico e evita ambiguidade de saldo).
- **Modo:** a tabela de saldos da filial ganha coluna editável **"Contado"** ao lado do Estoque (inputs numéricos ≥ 0, alvo de toque adequado — padrão F29). Preencher só o que foi contado: linha em branco = "não conferido", fica de fora. O **diff** (contado − sistema) aparece ao vivo por linha, com destaque para divergência, e um resumo fixo: "N conferidos · M com diferença (+X / −Y)".
- **Rascunho:** o estado da conferência (filial, contagens, quando começou) sobrevive a refresh/navegação via `sessionStorage` (padrão `rascunho.ts`), com banner "Continuar conferência de {filial} começada às {hora}?" e descarte explícito. Limpa ao concluir.
- **Gerar ajustes:** botão "Registrar diferenças (M)" abre confirmação listando cada ajuste que será gravado (item, −/+N) e pede uma observação padrão pré-preenchida "Inventário de {dd/MM/yyyy}" (editável; vira a observação/justificativa de cada linha). Grave via a esteira de lançamentos existente respeitando o teto por lote (`MAX_LINHAS_LOTE_ITEM`) em **blocos sequenciais com progresso visível** — ou, se preferir constante própria para este fluxo, derive-a e registre; o trigger valida linha a linha de qualquer forma. **Sucesso parcial** é tratado como no wizard: o que gravou aparece gravado, o que falhou permanece na tela com o erro por linha, e repetir só reenvia o que falta (idempotência ingênua — nada de gravar duas vezes o mesmo item).
- **Permissão:** quem escreve na filial (mesma guarda dos lançamentos). Consulta não vê o botão.
- **Ajuda:** seção "Conferência de estoque (inventário)" com o passo a passo e a relação com ajustes.
- **Fora deste recurso:** histórico/agenda de inventários, contagem cega (sem ver o saldo do sistema), acuracidade/relatórios de inventário, conferência de **ativos** — tudo backlog.
- **Ponta a ponta (dados fictícios):** conferir uma filial com 6 itens (2 batendo, 2 sobrando, 2 faltando) → refresh no meio (rascunho volta) → registrar → saldos atualizados, histórico com os ajustes e a observação de inventário → refazer a conferência dá tudo zerado. Mais: linha em branco fica de fora; erro forçado numa linha (ex.: concorrência) mantém as demais e permite reenviar só a que faltou.

## Housekeeping

- Commite esta ordem se estiver untracked. Sujeira de git alheia: não toque; registre.

## Fora (não toque)

- Recursos da F30 e as **sobras miúdas da análise** sem onda (FLX-06, MOV-15, ATV-11, PND-07, REL-11/12, ADM-08/09/10, UXG-09/11/14…) — backlog; não as "aproveite".
- Dependência nova, jamais. Banco: **só** o caminho estreito do recurso 1a — migration **aditiva** da RPC de transferência (+ roteiro SQL), aplicada pelo runbook com verificação pós-apply; **nada destrutivo**, nenhum toque em tabelas/policies/RPCs existentes, `supabase db push` proibido. Sem acesso ao banco: caminho 1b, nada aplicado.
- Modelo de acesso, RLS, máquina de estados de ativos, contagens de relatório: leitura apenas. Tipos do enum de lançamento: **não criar** valor novo.
- `src/lib/types/database.ts` (regenere com `npm run db:types` **somente** se a RPC nova exigir e o ambiente permitir; senão, tipos locais e registro); `src/components/ui/` fora de motivo documentado.
- Dados reais em fixture/teste/screenshot: proibição permanente. Ambiente de verificação manual: **dados fictícios**.

# Critérios de aceitação

- Os 2 recursos completos conforme as especificações, **autoverificados** sub-bullet a sub-bullet (checklist com evidência). O Total consolidado provadamente **inalterado** por uma transferência (evidência numérica no roteiro).
- `npm run lint`, `npm run test`, `npm run build` **limpos**, saídas reais. Lógica extraível tem teste puro (montagem do par de ajustes, diff da conferência, particionamento em blocos, idempotência do reenvio); contagem total de testes **sobe**. Se a RPC saiu (1a): roteiro SQL novo verde nos dois bancos, evidência no relatório.
- `package.json` sem dependência nova; diff de `supabase/` vazio **ou** contendo apenas a migration aditiva da RPC (+ teste SQL) com ata; nenhum texto novo de UI em inglês; nenhuma contagem de relatório alterada.
- `CHANGELOG.md` (entrada F31 no topo), `README.md` (status), `docs/DECISOES.md` (atas — no mínimo: caminho 1a×1b escolhido e por quê, semântica do estorno de perna, teto/blocos da conferência, selo visual de transferência se houver) e ajuda atualizada.
- Commits pequenos pt-BR (`feat(f31): …`), `git pull --rebase` antes do push, **main pushada** com tudo verde. Push bloqueado: commits locais + pendência registrada.

# Verificação — rode de verdade

Após cada recurso: `npm run lint && npm run test`; causa raiz, itere até passar — sem suprimir erro nem desabilitar/deletar teste (teste da ajuda quebrando = atualizar a documentação). Ao final: `npm run build` + suíte completa, saídas guardadas; roteiro SQL da RPC (se saiu) rodado e colado. Os dois roteiros manuais de ponta a ponta são **obrigatórios** no relatório, com os números de saldo antes/depois (fictícios). Depois do push, com credenciais no ambiente, rode o smoke do repo (`node scripts/smoke/smoke-prod.mjs`) e cole o resultado; sem credenciais, pendência para o Johnny.

# Autonomia e decisões

Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua: (1) esta ordem; (2) a análise; (3) `CLAUDE.md`/spec/`RUNBOOK-BANCO.md` e convenções do código; (4) o mais simples e reversível, registrado em `docs/DECISOES.md`. Divergência análise × código: o código vale, adapte a intenção, registre. Mesma falha após ~3 tentativas: mude de abordagem e registre. Bloqueio real (sem acesso ao banco para a RPC): o caminho 1b já é a resposta — siga por ele e registre; outros bloqueios: contorne se seguro, senão siga com o resto e registre.

# Git e segurança

Direto na `main` (modo autônomo do projeto; push autorizado pelo Johnny nesta ordem), commits pequenos e frequentes. **PROIBIDO:** force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit alheio, qualquer operação **destrutiva** em banco (a única escrita de banco permitida é a migration aditiva do recurso 1a pelo runbook), commitar `.env*` ou dado real.

# Como trabalhar

Explore com subagentes paralelos e escreva `PLAN.md` autossuficiente por recurso (interfaces nomeadas — inclusive a assinatura da RPC ou da action composta —, fora-de-escopo declarado, verificação de ponta a ponta no final). Os dois recursos tocam a **mesma área** (`/itens`, `actions/itens.ts`, dialog): trabalhe-os **em sequência** (transferência primeiro — a conferência reusa a esteira de ajustes que ela consolida), não em frentes paralelas no mesmo arquivo. Incrementos pequenos e testáveis, um commit por incremento. Ao final, **revisão adversarial em contexto fresco** contra os `PLAN.md` e os critérios — atenção especial a: Total inalterado pela transferência, atomicidade/compensação provada, idempotência do reenvio da conferência, permissão por filial dos dois lados — só lacunas de correção ou requisito, não estilo; corrija e re-revise até limpar. Não refatore fora dos pontos tocados.

# Relatório final

`docs/RELATORIO-F31.md` em pt-BR, padrão da casa: o que mudou por recurso; checklist de spec autoverificado com evidências; decisões (→ `DECISOES.md`); saídas reais de lint/test/build (+ roteiro SQL e smoke, se rodaram); os dois roteiros manuais com números antes/depois; pendências (inclusive a RPC em handoff, se for o caso) e backlog novo; seção **"O que este relatório NÃO prova"**. Resposta final: resumo de ~8 linhas — o que entrou, caminho de atomicidade escolhido, estado do push/deploy/banco, o que o Johnny confere de olho.

# Idioma

Narrativa, plano, relatório, UI e commits em **pt-BR**; identificadores de domínio em português sem acento, utilitários/infra em inglês (convenção do `CLAUDE.md`).

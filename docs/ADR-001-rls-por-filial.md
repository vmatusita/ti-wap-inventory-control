# ADR-001 — Escopo de RLS: modelo atual ("USING true") vs RLS por filial

**Status:** aceito (manter o modelo atual; endurecer o caminho do visualizador) · 21/07/2026
**Contexto do plano de dívida técnica:** item **M** de `docs/DIVIDA-TECNICA.md`.

## Contexto

O modelo de acesso (spec §3) tem **duas portas**:

1. **Operador** — login Supabase restrito a `@wap.ind.br`, **nível único** (todo logado é admin; não há papéis). As policies RLS das tabelas de negócio são `USING (true) / WITH CHECK (true)` para o papel `authenticated` — ou seja, **todo operador lê e escreve tudo** (todas as filiais). As regras de negócio críticas (máquina de estados, saldos de itens) vivem em **triggers** no Postgres, não na RLS; a defesa por-linha do banco é intencionalmente "aberta".
2. **Visualizador** — sem conta: entra por **senha de acesso** → cookie httpOnly assinado, válido só em `/relatorios/**`. As queries do relatório para o visualizador são servidas pelo **`createAdminClient()` (service_role)**, que **ignora a RLS** (o visualizador não tem sessão Supabase).

O advisor `rls_policy_always_true` (WARN) aponta as policies `USING(true)`; a auditoria (item M) observa que **um bug de escopo por filial numa query de relatório superexporia dados entre filiais sem rede do banco** — especialmente no caminho do visualizador (service_role).

## Decisão

**Manter o modelo atual para o OPERADOR** e **não** migrar para RLS por filial nas tabelas de negócio. Registrar o endurecimento do caminho do VISUALIZADOR como o trabalho de segurança que de fato move o ponteiro (item separado, não urgente).

### Por quê (operador)
- **O operador legitimamente vê todas as filiais.** O sistema é de TI central da WAP (5 filiais, uma equipe). Não há requisito de isolar filial-por-operador — todo operador `@wap.ind.br` opera o acervo inteiro (transferências entre filiais, relatório consolidado `geral`, import de startup por filial). RLS por filial **não teria a quem restringir**.
- **Custo alto, benefício ~nulo.** RLS por filial exigiria um conceito de "filial do operador" (inexistente no domínio), policies por tabela e por operação, e complicaria transferência/consolidado. Introduz superfície de bug **onde hoje não há requisito**.
- **A defesa real já está no lugar certo.** A integridade (o que pode virar o quê) é dos **triggers** (máquina de estados, saldos) — que a RLS aberta não afrouxa. A RLS "true" reflete o modelo de nível único da spec, não um descuido.

### Por quê (visualizador — onde está o risco real)
- O ponto de concentração de confiança é o **service_role no caminho do visualizador** (`lib/auth/acesso.ts`): qualquer bug de escopo de filial numa query de relatório vaza entre filiais **sem** a rede da RLS. Este é o alvo que vale endurecer — **não** as policies do operador.
- **Recomendações (backlog, não urgente):**
  1. Servir as leituras do visualizador por um cliente **anon + RLS** (policies `SELECT` por filial derivadas do escopo do cookie assinado) em vez do service_role, tirando o bypass de RLS do caminho público.
  2. Enquanto isso, **auditar com lupa** cada query de relatório servida ao visualizador quanto ao filtro de filial (é a única linha de defesa hoje) e cobrir com teste.
  3. Considerar `(select auth.uid())` na policy `atualiza proprio perfil` (micro-otimização já anotada) — não relacionado ao vazamento, mas fecha o advisor.

## Consequências

- **Positivas:** sem complexidade nova nas tabelas de negócio; o advisor `rls_policy_always_true` fica **documentado como por-design** (já registrado em `docs/DECISOES.md`); o esforço de segurança aponta para o risco real (visualizador/service_role) em vez de um refactor caro sem requisito.
- **Negativas / a aceitar:** as tabelas de negócio seguem sem defesa por-linha no banco — um bug de app que escreva/leia fora de escopo não é barrado pela RLS (mitigado: operador é nível único e confiável; a integridade crítica é dos triggers). O caminho do visualizador segue em service_role até o endurecimento do backlog.

## Alternativas consideradas

- **RLS por filial completa** (todas as tabelas, por operação): rejeitada — sem requisito de isolamento por operador; custo/risco altos.
- **RLS só para o visualizador**: é a direção recomendada, movida para backlog (não é regressão do estado atual; é melhoria aditiva).

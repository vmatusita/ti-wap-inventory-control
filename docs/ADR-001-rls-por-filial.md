# ADR-001 — Escopo de RLS: modelo atual ("USING true") vs RLS por filial

**Status:** aceito (manter o modelo atual; endurecer o caminho do visualizador) · 21/07/2026 — **sucedida em UM ponto** (papéis / policies de escrita) por [`ADR-002-papeis-e-permissoes.md`](ADR-002-papeis-e-permissoes.md) em 29/07/2026; ver a *Nota de sucessão* no §"Por quê (operador)". Todo o resto — **leitura ampla** para todo logado e o caminho do visualizador — continua valendo.
**Contexto do plano de dívida técnica:** item **M** de `docs/DIVIDA-TECNICA.md`.

## Contexto

O modelo de acesso (spec §3) tem **duas portas**:

1. **Operador** — login Supabase restrito aos domínios corporativos da spec §3 (`@wap.ind.br`, `@stefanini.com`, `@latam.stefanini.com` — trigger `0001`→`0041`), **nível único** (todo logado é admin; não há papéis). As policies RLS das tabelas de negócio são `USING (true) / WITH CHECK (true)` para o papel `authenticated` — ou seja, **todo operador lê e escreve tudo** (todas as filiais). As regras de negócio críticas (máquina de estados, saldos de itens) vivem em **triggers** no Postgres, não na RLS; a defesa por-linha do banco é intencionalmente "aberta".
2. **Visualizador** — sem conta: entra por **senha de acesso** → cookie httpOnly assinado, válido só em `/relatorios/**`. As queries do relatório para o visualizador são servidas pelo **`createAdminClient()` (service_role)**, que **ignora a RLS** (o visualizador não tem sessão Supabase).

O advisor `rls_policy_always_true` (WARN) aponta as policies `USING(true)`; a auditoria (item M) observa que **um bug de escopo por filial numa query de relatório superexporia dados entre filiais sem rede do banco** — especialmente no caminho do visualizador (service_role).

## Decisão

**Manter o modelo atual para o OPERADOR** e **não** migrar para RLS por filial nas tabelas de negócio. Registrar o endurecimento do caminho do VISUALIZADOR como o trabalho de segurança que de fato move o ponteiro (item separado, não urgente).

### Por quê (operador)
- **O operador legitimamente vê todas as filiais.** O sistema é de TI central da WAP (5 filiais, uma equipe). Não há requisito de isolar filial-por-operador — todo operador opera o acervo inteiro (transferências entre filiais, relatório consolidado `geral`, import de startup por filial). RLS por filial **não teria a quem restringir**.
  *(Emenda 22/07/2026 — abertura para `@stefanini.com`/`@latam.stefanini.com`: a equipe terceirizada entrou como operador pleno, e a conclusão acima **não muda** — o recorte que faria sentido para terceirizado seria por papel, não por filial. Quem entra continua sendo escolhido um a um por convite; se um dia surgir a necessidade de um operador com poderes menores, isso é um ADR novo sobre **papéis**, que a spec §3 hoje proíbe.)*

  > **NOTA DE SUCESSÃO — 29/07/2026 · só no ponto "papéis".** A necessidade prevista na emenda acima surgiu, e o ADR novo existe: **[`ADR-002-papeis-e-permissoes.md`](ADR-002-papeis-e-permissoes.md)** (aceito, executado pela F21) cria três cargos — `admin ⊃ operador ⊃ consulta` — e um **vínculo de filiais de escrita** por operador; a spec §3 foi reescrita e não proíbe mais papéis.
  >
  > O que a ADR-002 sucede, aqui, é **apenas** a frase "nível único / não há papéis" e a premissa de que **as policies de ESCRITA** podem ser `USING (true)`: elas passaram a ser por cargo/vínculo (migrations `0061`→`0066`).
  >
  > O que esta ADR-001 **continua decidindo, sem alteração**: (1) **leitura ampla** — todo logado, em qualquer cargo, lê as cinco filiais, e não se criou recorte de leitura por filial (o relatório consolidado e a transferência dependem disso); (2) o **WARN `rls_policy_always_true`** segue por-design, agora só nas policies de **leitura**; (3) o **caminho do visualizador por senha** e o risco real que ele concentra — o `service_role` nas leituras do relatório — continuam exatamente como descritos abaixo, **inclusive a recomendação 1 do backlog**, que a F21 não executou.
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

## Emenda F66 (24/09/2026) — o recorte de leitura é por EMPRESA, não por filial

A virada multiempresa ([`PLANO-MULTIEMPRESA.md`](PLANO-MULTIEMPRESA.md)) trouxe o requisito de isolamento que esta ADR
não tinha — mas entre **empresas**, não entre filiais. A F66 escreveu o termo de empresa nas 51 policies de `public` cuja
tabela tem `empresa_id`, em AND com o piso de hoje (MATRIZ R-ACC-108). **O que esta ADR decide continua valendo DENTRO de
uma empresa:** todo logado lê todas as filiais da empresa dele — o relatório consolidado e a transferência seguem
dependendo disso, e nenhuma policy de leitura ganhou recorte por filial. A escrita por unidade (a exceção desta ADR que a
ADR-002 abriu) passou a conferir o PAR `(empresa_id, filial_id)` contra `unidades_de_escrita()` (R-ACC-109), no lugar de
`pode_escrever_filial(filial_id)`. Ata em [`DECISOES.md`](DECISOES.md) (2026-09-24 · F66).

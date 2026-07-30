ultracode

# Ordem de serviço F22 — Cargo DESENVOLVEDOR (dev): topo da hierarquia, gestão total de usuários e área /dev

> Ordem de 30/07/2026, emitida pelo Victor. Sucede a F21 (`docs/prompts/F21-papeis-ultracode.md`
> · `docs/ADR-002-papeis-e-permissoes.md`) e as correções pós-F21 (`0069`/`0070`). Em conflito
> entre esta ordem e a spec/ADR, **esta ordem manda** — emende os documentos e registre em
> `docs/DECISOES.md`.
> Numeração: na escrita desta ordem, a última fase era a F21 e a última migration a `0070`.
> **Confira os números livres reais antes de começar**; colisão → renumere (precedente
> F19/F20B: nomes distintos, nada se sobrescreve) e registre. Se `git status` mostrar trabalho
> não commitado de outra sessão, PARE e reporte (regra da casa: uma ordem por vez).

## §0 — Parâmetros (Victor edita AQUI antes de colar; o agente NÃO pergunta)

```
EMAILS_DEV      = victor.matusita@wap.ind.br , vymatusita@stefanini.com
                  # as DUAS contas que recebem o cargo dev no fecho desta fase
APAGAR_USUARIO  = preservar-autoria   # decisão de 30/07 (Victor): a conta morre para sempre,
                                      # mas o histórico continua mostrando quem fez o quê
CONTA_FALTANDO  = convidar            # se um EMAILS_DEV não existir em auth.users:
                                      # 'convidar' = gera convite via Auth Admin e promove
                                      #              (o link vai no relatório);
                                      # 'pendencia' = só registra no relatório
```

## Missão

Criar o cargo **dev** (rótulo "Desenvolvedor") no TOPO da hierarquia — **dev ⊃ admin ⊃
operador ⊃ consulta** — com três propriedades: (1) o dev faz TUDO que o admin faz, mais a
gestão total de usuários (alterar e-mail, apagar conta, encerrar sessões, conceder/revogar o
próprio cargo dev); (2) **ninguém abaixo de dev tem poder algum sobre um dev** — não edita,
não rebaixa, não desativa, não apaga, não concede o cargo — e essa recusa vale **no
Postgres**, não só na tela; (3) uma área nova `/dev`, visível e alcançável só pelo cargo dev,
com diagnóstico do sistema, checagens de integridade, auditoria completa com export e
ferramentas de manutenção. Promova as contas de `EMAILS_DEV` em produção. Custo R$ 0, zero
dependência nova, visualizador por senha intocado.

## Contexto (leia a origem, não descrições dela)

- Doutrina: `@CLAUDE.md` (modo autônomo, regras permanentes, runbook de banco caminho A).
- O modelo vigente que esta ordem ESTENDE: `@docs/ADR-002-papeis-e-permissoes.md` · migrations
  `@supabase/migrations/0061`…`0068` + `0069`/`0070` (a leitura hoje é fechada por
  `papel_atual() is not null`) · `@docs/RELATORIO-F21.md` (o que caiu na medição; pendências).
- Vocabulário e guardas: `@src/lib/auth/papeis.ts` (`PAPEIS`/`FORCA`/rótulos — fonte única),
  `@src/lib/auth/acesso.ts` (`exigirAdmin`/`exigirEscrita*`/`exigirPapel`, mensagens `MSG_*`),
  `@src/lib/validators/admin.ts` (`validarTrocaDePapel`/`validarStatusDeUsuario` — as funções
  puras das autoproteções), `@src/lib/auditoria.ts` (vocabulário de `eventos_admin`).
- Gestão de usuários hoje: `@src/lib/actions/admin.ts` (`convidarUsuario`, `editarUsuario`,
  `definirStatusUsuario`, `aplicarCargoEVinculos` — grava papel/ativo pelo SERVICE ROLE),
  `@src/lib/queries/admin.ts` (`listarUsuarios`, `getEstadoUsuario`, `idsDeAdminsAtivos`),
  `@src/app/(app)/admin/usuarios/**` e os componentes em `@src/components/admin/`.
- Nomes reais de tabelas/colunas/FKs: `@src/lib/types/database.ts` (gerado). Dez+ tabelas
  referenciam `profiles` (`movimentacoes.criado_por`, `lancamentos_item.criado_por`,
  `termos_gerados.gerado_por`/`atualizado_por`, `anotacoes`, `kits_modelos`, `import_logs`,
  `pendencias_item.resolvida_por`, `relatorios_gerados`, `senhas_acesso`;
  `eventos_admin.autor` é `on delete set null`; `operador_filiais` é cascade) e `profiles.id`
  referencia `auth.users` **on delete cascade** (`0001`) — este mapa é o que torna o "apagar"
  um problema de desenho; confira-o no banco antes de escrever SQL.
- Padrão de roteiro SQL: `@supabase/tests/papeis_rls.sql` (47 asserções; papel simulado via
  `set role authenticated` + `request.jwt.claims`; leitura PLANTA linha antes de conferir).
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run db:types` · smoke
  `scripts/smoke/smoke-prod.mjs`. **Meça a baseline ANTES de mudar qualquer coisa** e anote no
  relatório (números citados nesta ordem podem estar defasados).
- APIs externas (regra 6 do CLAUDE.md): confira na documentação oficial vigente (MCP Context7)
  as chamadas do Supabase Auth Admin que for usar — `updateUserById` (troca de e-mail, ban),
  `deleteUser`, e QUAL revogação de sessão a versão instalada de `@supabase/supabase-js`
  suporta de verdade. Não escreva de memória.

## Escopo

**Dentro:** migrations novas a partir do próximo número livre; enum `papel_usuario` + funções
(`e_admin`/`e_dev`/`pode_escrever_filial`) e o que as policies herdarem delas; RPCs/trigger da
proteção do dev; a mecânica do apagar; a promoção de `EMAILS_DEV`; `src/lib/auth/**`,
`src/lib/validators/admin.*`, `src/lib/auditoria*.ts`, `src/lib/actions/admin.ts` (+ novo
`src/lib/actions/dev.ts`), as queries que a /dev lê; `/admin/usuarios` (gating pelo papel do
AUTOR); a área `(app)/dev/**` + sidebar; seeds fictícios; roteiro(s) SQL; Vitest; documentação
(spec §3, CLAUDE.md §Modelo de acesso, emenda na ADR-002, DECISOES, ajuda) e encerramento
padrão.

**Fora (não toque):** o visualizador por senha (`senha-sessao.ts`, `/relatorios/acesso`,
cookie de visualização) — segue idêntico; a máquina de estados e a imutabilidade de
`movimentacoes`/`lancamentos_item`; os domínios de login (`0041` — a lista NÃO muda);
o comportamento de operador/consulta (nenhuma regressão); templates `.docx`;
`src/components/ui/**`; migration já aplicada NENHUMA se edita; dependência nova NENHUMA;
console SQL/execução arbitrária na /dev — PROIBIDO (Supabase Studio é o lugar disso); seed
em produção JAMAIS.

## O modelo a implementar

### 1. Banco — o enum e a herança (a camada que vale)

1.1. Migration SOZINHA com `alter type public.papel_usuario add value 'dev' before 'admin'` —
     `before 'admin'` mantém a invariante "ordem dos labels = ordem de força" (comentário da
     0061), e valor novo de enum NÃO pode ser usado na mesma transação que o cria: quem o usa
     é a migration seguinte (precedente 0044/0045). Atualize o comment do type.
1.2. `e_admin()` passa a significar "nível administrador": `papel_atual() in ('admin','dev')`
     — TODAS as policies e guardas que a chamam (0063/0064/0065/0066) herdam o dev sem serem
     reescritas; atualize o comment. Nova `e_dev()` (`papel_atual() = 'dev'`), mesmo padrão
     definer/stable/`set search_path`/revoke. `pode_escrever_filial()`: dev = admin (escreve
     em todas). Depois, VARRA banco e app por comparações LITERAIS que a redefinição não
     alcança: `= 'admin'` em policy/função/RPC (`pg_proc` + migrations) e `=== 'admin'` /
     `!== 'admin'` no TS (`eAdmin` de papeis.ts, `exigirAdmin` de acesso.ts, gating de UI) —
     cada uma vira hierarquia (`papelAtende`) ou fica com o porquê em comentário.
1.3. `profiles`: as colunas que o desenho do apagar exigir (ex.: `excluido_em timestamptz`,
     null = vivo), comentadas no padrão da casa.

### 2. A proteção do cargo dev — a regra que não pode ter furo

O problema real: HOJE `profiles.papel`/`ativo` são gravados pelo **service role**
(`aplicarCargoEVinculos`), que passa por fora de qualquer policy — a única coisa entre um
admin e a gravação é a guarda da action. Para "ninguém tem poder sobre dev" valer NO BANCO:

2.1. Mova a gravação de papel/status para **RPCs `security definer`** chamadas com o client de
     SESSÃO (não o service role) — ex.: `definir_papel_usuario(alvo uuid, novo papel_usuario)`
     e `definir_status_usuario(alvo uuid, novo boolean)` — com guarda interna no topo:
     alvo com papel `dev`, OU papel pedido = `dev` → exige `e_dev()`; demais casos → exige
     `e_admin()` (que agora inclui dev). As autoproteções da F21 (não agir sobre si mesmo;
     nunca zerar o conjunto de contas de nível admin ativas — decida se dev passa a contar
     nesse conjunto e registre) entram NA RPC; a versão pura do app continua existindo para a
     MENSAGEM pt-BR — as duas concordam por construção (doutrina da F21). As actions trocam o
     service role por essas RPCs nesse caminho; os vínculos (`operador_filiais`) podem
     continuar como estão OU entrar na RPC — decida e registre.
2.2. Trigger `before update or delete` em `profiles` como REDE FINAL: mudança de
     `papel`/`ativo`/exclusão de uma linha `dev` (e concessão do valor `dev`) é RECUSADA
     (raise) para todo caminho que não seja o oficial — como o service role não carrega
     identidade, o desenho robusto é o trigger recusar por padrão e as RPCs do 2.1 abrirem o
     único caminho que passa (ex.: `set_config(..., true)` local à transação, que o trigger
     confere). Desenhe, PROVE por asserção SQL que request direto de admin não fura — e que
     nem o service role fura por fora das RPCs — e registre o mecanismo em DECISOES.
2.3. Conceder/revogar dev pela UI: só um dev vê essas opções; `convidarUsuario`/
     `editarUsuario` recusam `papel: 'dev'` de autor não-dev (validator puro + action +
     banco). Para o admin, um usuário dev aparece na lista com badge "Desenvolvedor" e ações
     DESABILITADAS com explicação curta ("Gerido por desenvolvedor") — e a recusa continua
     valendo se ele forjar o request.
2.4. Autoproteção do dev: dev não rebaixa/desativa/apaga A SI MESMO (precedente F21). NÃO crie
     trava de "último dev": um sistema sem dev é legal (era o estado até ontem) e a
     migration/SQL direto recoloca — as duas contas de `EMAILS_DEV` são da mesma pessoa.

### 3. Gestão avançada de usuários (as ações que o admin NÃO tem)

3.1. **Alterar e-mail** (`alterarEmailUsuario`, action nova exigindo dev): muda o e-mail da
     conta via Auth Admin (`updateUserById`), validando pela MESMA lista de
     `dominios-email.ts` (o trigger da 0041 só cobre INSERT — aqui é a action que garante o
     domínio; e-mail já em uso → recusa clara). Decida (e registre) se aplica direto
     (`email_confirm`) ou exige confirmação por link. Trilha: `email_alterado` com {de, para}.
3.2. **Apagar usuário** (`apagarUsuario`, exige dev) — semântica `APAGAR_USUARIO =
     preservar-autoria`. O estado final: (a) a conta NÃO loga nunca mais e o e-mail pode ser
     convidado de novo no futuro; (b) o perfil SOME de todas as telas (lista de usuários,
     seletores, contagens); (c) TODO o histórico (movimentações, lançamentos, termos,
     eventos) continua íntegro e mostrando a autoria original. O mapa de FKs do Contexto
     torna o caminho ingênuo (`auth.admin.deleteUser` → cascade em `profiles` → FKs do
     histórico) impossível — escolha entre os dois desenhos e registre em DECISOES:
     - **perfil-arquivado**: romper a FK `profiles → auth.users` (migration com o porquê
       comentado), marcar o perfil como excluído (`excluido_em`) e apagar SÓ a conta no Auth;
     - **conta-neutralizada**: manter FK e conta, banindo para sempre e trocando o e-mail por
       um sintético inutilizável, com o perfil marcado como excluído.
     Nos dois: alvo `dev` é RECUSADO (2.2); sequência com falha segura (se a metade do Auth
     falhar, o estado resultante NEGA acesso e a action avisa — padrão `definirStatusUsuario`);
     limpe os vínculos; trilha `usuario_apagado` (o `autor` de `eventos_admin` já sobrevive
     por `on delete set null`). Toda leitura que junta `profiles` (linha do tempo, listas)
     precisa continuar resolvendo o NOME do autor arquivado.
3.3. **Encerrar sessões** (`encerrarSessoes`, exige dev): derruba o acesso vigente de um
     usuário o mais cedo que a API instalada permitir (revogação de refresh tokens — confira
     a API real, regra 6). Documente NA TELA o limite honesto: o access token corrente pode
     viver até ~1h (mesma janela da desativação da F21). Trilha: `sessoes_encerradas`.
3.4. Vocabulário: `ACOES_ADMIN` + `ACAO_ROTULO` ganham `email_alterado`, `usuario_apagado`,
     `sessoes_encerradas` (e o que mais você criar); o comment da coluna
     `eventos_admin.acao` é atualizado por migration (regra "mexeu aqui, mexa lá" da 0065).

### 4. Área `/dev`

Rota `(app)/dev/page.tsx` (subrotas se ajudarem), layout próprio exigindo dev (defesa em
profundidade, espelho de `admin/layout.tsx`), item "Desenvolvedor" na sidebar SÓ para dev.
Server Components; leituras privilegiadas saem por funções server-side guardadas por
`exigirDev` — NUNCA exponha service key, anon key, hash ou URL com segredo no HTML.

- **Diagnóstico**: commit/branch/hora do build no ar (envs `VERCEL_GIT_COMMIT_*` server-side;
  fallback "indisponível"), ambiente (produção/preview/dev), ref do projeto Supabase
  MASCARADA, contagens das tabelas principais (ativos, movimentacoes, lancamentos_item,
  termos_gerados, profiles, eventos_admin…), migrations aplicadas
  (`supabase_migrations.schema_migrations`, via service role) vs. a última do repositório.
- **Integridade**: checagens read-only sob demanda (botão "Rodar checagens"), cada uma com
  nome, descrição de uma frase e resultado (ok / contagem + amostra). Defina a lista MEDINDO
  o schema real — candidatas: par patrimônio+service tag duplicado; ativo apontando filial
  inativa; divergência entre o `status` do ativo e sua última movimentação; pendência aberta
  de ativo baixado; termo `gerado` sem objeto no Storage; perfil sem conta no Auth (e
  vice-versa). SÓ diagnóstico — nenhuma correção automática.
- **Auditoria completa**: `eventos_admin` inteira com filtros (ação, autor, período, alvo) e
  **export CSV** (padrão `exportar.ts`, com cap e aviso como no resto do app).
- **Manutenção**: revalidar o cache das rotas principais (`revalidatePath` explícito por
  grupo); encerrar sessões (3.3) alcançável daqui; links para os painéis do Supabase e da
  Vercel do projeto (URLs dos dashboards, sem token nenhum).

### 5. Promoção das contas (`EMAILS_DEV`) e seeds

- Migration idempotente promove por e-mail (`update public.profiles set papel = 'dev' where
  id in (select id from auth.users where lower(email) in (…EMAILS_DEV…))`) + verificação
  pós-apply (contagem esperada = nº de contas existentes). Zero linha afetada num banco vazio
  (CI) é legal. Se a rede do 2.2 gatear também a concessão de `dev`, esta migration abre o
  mesmo contexto que as RPCs abrem (senão ela recusa a si própria — e o CI, que reaplica
  `0001`→`00NN` do zero, denuncia). Os e-mails reais desta ordem PODEM constar de
  ordem/migration/DECISOES — são metadados de acesso do próprio sistema, não dados do acervo;
  a regra 2 do CLAUDE.md segue absoluta em seed/fixture/teste/screenshot (registre essa
  leitura em DECISOES).
- Conta de `EMAILS_DEV` inexistente + `CONTA_FALTANDO = convidar`: gere o convite via Auth
  Admin (`generateLink`, mecânica de `convidarUsuario`), aplique o cargo dev pelo caminho novo
  e entregue o LINK no relatório (a pessoa define a senha depois).
- `scripts/seed.ts`/`reset.ts`: persona dev FICTÍCIA (ex.: `dev.teste@wap.ind.br`) para
  ensaio/local, guardas anti-produção intactas.

### 6. Testes e documentação

- Roteiro SQL novo `supabase/tests/cargo_dev.sql` (ou extensão do `papeis_rls.sql` — decida;
  padrão auto-verificável da pasta) provando no MÍNIMO: admin NÃO promove a dev, NÃO
  rebaixa/desativa dev, NÃO apaga perfil dev (o trigger recusa até o service role, se esse
  for o desenho); dev promove/rebaixa/desativa não-dev e concede dev; dev passa em TUDO que
  `e_admin()` guarda (inclusive a RPC do import); operador/consulta em nada disso; a exclusão
  preserva as linhas de histórico do autor apagado (plante movimentação fictícia, exclua o
  autor, confira a linha e o nome). Rode nos DOIS bancos.
- Vitest: hierarquia com dev em `papeis.test.ts`; regras novas dos validators; funções puras
  novas. Testes existentes que a mudança quebrar LEGITIMAMENTE (vocabulário com 4 cargos,
  conteúdo da ajuda, `use-server-exports`) se atualizam sem enfraquecer.
- Documentação: spec §3 e CLAUDE.md (§Modelo de acesso) reescritos com o 4º cargo; EMENDA
  datada na ADR-002 (novo § "Cargo dev — 30/07/2026": contexto, decisão, consequências) —
  ADR-003 só se você julgar que o volume justifica (registre); `docs/DECISOES.md` (data ·
  contexto · escolha · motivo para CADA decisão desta ordem); ajuda do operador
  (`usuarios-e-senhas`, `acesso-e-sessoes`, `administracao`, `mapa-das-telas`): mencione o
  cargo Desenvolvedor na LINGUAGEM DO OPERADOR — os guardas da F20 barram jargão de dev e
  rota sem cobertura; descubra o contrato real desses testes e atenda-o ajustando TEXTO,
  nunca o guarda. A /dev não ganha manual próprio (é área técnica).

## Critérios de aceitação

1. **Hierarquia**: dev alcança e opera tudo que admin alcança (`/admin/**`, o import, escrita
   em toda filial) — asserções SQL + navegação; nenhum lugar sobrou comparando `'admin'` por
   igualdade onde a intenção era "nível admin".
2. **Intocável**: admin (e abaixo) não edita, não rebaixa, não desativa, não apaga um dev e
   não concede o cargo dev — recusado com mensagem pt-BR na UI/action E recusado no banco em
   request forjado (asserções SQL provam as duas camadas, service role incluso).
3. **E-mail**: dev troca o e-mail de um usuário (domínio corporativo validado; em-uso
   recusado); admin não tem o caminho; evento `email_alterado` na trilha.
4. **Apagar**: conta apagada não loga nunca mais e some das telas; o histórico segue
   mostrando a autoria original (provado por SQL e pela linha do tempo de um ativo); o e-mail
   fica reutilizável; alvo dev recusado; evento na trilha.
5. **Sessões**: o encerramento derruba o refresh token; o limite honesto (~1h de access
   token) está escrito na tela; evento na trilha.
6. **/dev**: alcançável só por dev (admin em URL direta → recusa clara, sem vazamento); os 4
   blocos funcionam; nenhum segredo no HTML/response; as checagens de integridade são
   read-only.
7. **Promoção**: as contas de `EMAILS_DEV` existentes estão com papel dev em PRODUÇÃO
   (verificação pós-apply colada no relatório); inexistentes seguiram `CONTA_FALTANDO`.
8. **Sem regressão**: operador/consulta/visualizador idênticos (smoke prova); autoproteções
   da F21 intactas; nenhuma policy afrouxada (advisors sem WARN novo de RLS).
9. **Portões**: `npm run lint`, `npm run test` e `npm run build` limpos; roteiros SQL verdes
   nos dois bancos; `database.ts` regenerado (`npm run db:types`); deploy READY + smoke
   pós-deploy OK.

## §V — Verificação (rode de verdade, itere até passar)

Meça a baseline (lint/test/build) ANTES de qualquer mudança e cole no relatório. A cada
incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a CAUSA
RAIZ, repita; nunca suprima erro, nunca desabilite/delete teste para passar. Roteiros SQL nos
dois bancos (ensaio primeiro, produção depois — caminho A do runbook; TUDO nesta ordem é
aditivo: nenhum `delete from` de acervo). Depois do apply em produção: verificação pós-apply
de cada migration, advisors (WARN novo de RLS = consertar antes de seguir), smoke
(`scripts/smoke/smoke-prod.mjs`) e só então deploy. Ao final, **revisão adversarial em
contexto fresco** contra esta ordem, com refutação por padrão e atenção especial a: sobrou
caminho (action, RPC, request direto, service role) em que um admin alcança um dev?; a
redefinição de `e_admin()` deixou comparação literal para trás?; o apagar preserva MESMO a
autoria (prove com dado fictício, não com raciocínio)?; a /dev vaza segredo ou dado que
`authenticated` não leria?; o valor novo do enum quebrou alguma comparação de ordem?;
convite/edição de admin consegue forjar `papel: 'dev'`? Aponte só lacunas de correção ou de
requisito, não estilo — corrija e re-revise até limpar.

## Autonomia, decisões e git

Você roda de forma autônoma (modo do CLAUDE.md): ninguém responderá perguntas — não pare, não
espere confirmação. Régua: (1) esta ordem; (2) ADR-002 e as convenções do repositório;
(3) a opção mais simples e reversível — decisões não-óbvias em `docs/DECISOES.md` (data ·
contexto · escolha · motivo). Mesma falha 3 vezes → troque de abordagem e registre. Bloqueio
real → contorne com segurança ou siga com o resto e registre a pendência. Se o ambiente vetar
um passo sensível (apply em produção, push), NÃO insista até abortar: deixe o comando exato
pronto e provado em ensaio, registre como "pendente de execução manual" e siga. Git: commits
pequenos em pt-BR estilo conventional (`feat(f22): …`); branch opcional (`f22-cargo-dev`) com
merge próprio ao fechar o checklist; PROIBIDO push forçado, reset destrutivo, `.env*`, dado
real em seed/teste/fixture. Antes do UPDATE de promoção em produção, exporte backup de
`profiles` (regra de autoproteção do CLAUDE.md para escrita em dado existente).

## §R — Encerramento e relatório

`CHANGELOG.md` (topo) · `docs/prompts/README.md` (linha da F22) · `README.md` (status) ·
`docs/DECISOES.md` · `docs/RELATORIO-F22.md` em pt-BR com: o que mudou e por quê; o checklist
desta ordem autoverificado item a item; **evidências coladas** (saídas reais de
lint/test/build, dos roteiros SQL nos dois bancos, das verificações pós-apply, do smoke e dos
advisors — afirmação sem saída não vale); decisões; pendências; a seção "o que este relatório
NÃO prova"; o link de convite, se `CONTA_FALTANDO = convidar` foi usado; e o roteiro manual
de 5 minutos para o Victor (logar como admin e constatar o dev intocável e a /dev
inacessível; logar como dev e exercitar a /dev, trocar um e-mail e apagar um usuário de teste
fictício). Push = deploy Vercel, só com o §V inteiro verde. Termine a resposta final com um
resumo de ~5 linhas em pt-BR.

## Idioma

UI, mensagens, erros, commits, docs e relatório em pt-BR; identificadores de domínio em
português sem acento (valor `dev`, `e_dev`, `excluido_em`, `definir_papel_usuario`);
utilitários/infra em inglês — a convenção vigente do repositório.

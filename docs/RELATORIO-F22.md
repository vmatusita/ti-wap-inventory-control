# Relatório da F22 — Cargo DESENVOLVEDOR (dev)

**Ordem de serviço:** [`prompts/F22-cargo-dev-ultracode.md`](prompts/F22-cargo-dev-ultracode.md) · emitida pelo Victor em 30/07/2026
**Execução:** 30/07/2026, autônoma (modo do [`CLAUDE.md`](../CLAUDE.md))
**Sucede:** F21 (`0061`→`0068`) + correções `0069`/`0070` · [`ADR-002`](ADR-002-papeis-e-permissoes.md)

---

## 1. O que mudou, e por quê

A F21 fechou a autorização em três cargos, mas deixou o topo **achatado**: um administrador
podia rebaixar, desativar — e, a partir desta fase, apagar — qualquer pessoa, inclusive quem
mantém o sistema. E a gestão de conta de verdade (trocar e-mail, apagar, derrubar sessão) só
existia no painel do Supabase, fora de qualquer trilha de auditoria.

A F22 cria o cargo **`dev`** (rótulo "Desenvolvedor") no topo da hierarquia:

```
dev  ⊃  admin  ⊃  operador  ⊃  consulta
```

Três propriedades, nesta ordem de importância:

1. **O dev faz tudo que o admin faz**, mais a gestão total de usuários.
2. **Ninguém abaixo de dev tem poder algum sobre um dev** — e essa recusa vale **no Postgres**,
   não só na tela: nem por request forjado, nem pelo *service role*, que ignora RLS.
3. Uma área **`/dev`** com diagnóstico, checagens de integridade, auditoria completa com
   export e ferramentas de manutenção.

### 1.1 O que quase deu errado (e por isso está escrito)

Três achados da execução que valem mais que o resumo:

**(a) Redefinir `e_admin()` NÃO bastava.** A ideia central da fase é que `e_admin()` passe a
significar "nível administrador" (`admin` OU `dev`), de modo que as ~19 policies de `/admin`
herdem o cargo novo sem serem reescritas. Medindo o banco, dois buracos apareceram:

- `pode_escrever_filial()` **não chama** `e_admin()` — tem o seu próprio `if v_papel = 'admin'`.
  Um dev cairia no `return false` e perderia **toda** a escrita de acervo. E o sintoma seria
  *silencioso* no UPDATE: o `USING` de uma policy de UPDATE é filtro de linha, não erro — a
  escrita afetaria 0 linhas sem SQLSTATE nenhum.
- **Cinco policies** gateavam por lista literal `papel_atual() in ('admin','operador')`:
  `anotacoes`, `relatorios_gerados` e as três de escrita do bucket `termos`. Nenhuma
  redefinição de função as alcança. Sem tocá-las, o termo do dev ficaria **pela metade**:
  a linha em `termos_gerados` passaria (deriva de `e_admin()`), o `.docx` não.

As cinco passaram a chamar `pode_escrever()`, função nova — em vez de repetir
`in ('dev','admin','operador')` inline, que recriaria o mesmo problema no quinto cargo.

**(b) A rede do dev tinha uma janela aberta.** A proteção "ninguém mexe num dev" é um trigger
que recusa por padrão e um GUC transacional que as RPCs oficiais declaram. A prova de conceito
rodada no ensaio **antes** de escrever a migration mostrou que `set_config(k, v, true)` é local
à **transação**, não à chamada de função: depois que a função oficial retornava, a janela
continuava aberta e um UPDATE direto na mesma transação passava batido. Em produção cada
chamada do PostgREST é a sua própria transação e o furo não se manifestaria — mas depender
disso é depender do transporte. Toda RPC de gestão **fecha a janela ao sair**.

**(c) Uma checagem de integridade foi descartada por acusar 82% do acervo.** "O `status` do
ativo diverge da última movimentação" apontou **1009 de 1231** ativos em produção. Não é
inconsistência: é artefato de ordenação — a *compra de abertura* criada pelo import (F7/F8) tem
`created_at` posterior às movimentações que a precedem em `data`, então qualquer "última
movimentação" ingênua elege a baseline. Reproduzir a ordem correta é o problema que a `0054`
resolveu para o estoque *as-of*. Uma checagem vermelha no dia um treina quem lê a página a
ignorá-la — ficou no backlog, com a medição registrada.

---

## 2. Migrations

Todas **aditivas quanto a dados** (nenhum `delete from` de acervo) → caminho **A** do
[`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md): ensaio primeiro, produção depois.

| # | Arquivo | O que faz |
|---|---|---|
| `0071` | `papel_dev_enum.sql` | `alter type ... add value 'dev' **before 'admin'**`. Vai **sozinha** (o Postgres proíbe usar o label novo na transação que o cria). O `before` mantém a invariante "ordem dos labels = ordem de força" da `0061`. |
| `0072` | `papel_dev_funcoes.sql` | `e_admin()` vira "nível administrador"; novas `e_dev()` e `pode_escrever()`; `pode_escrever_filial()` aceita dev; as **cinco** policies de lista literal passam a chamar `pode_escrever()`. |
| `0073` | `dev_intocavel_e_arquivamento.sql` | `profiles.excluido_em`; **derruba a FK** `profiles.id → auth.users`; `papel_atual()` passa a exigir `excluido_em is null`; trigger `profiles_guarda_dev`. |
| `0074` | `rpcs_gestao_usuarios.sql` | As RPCs de gestão (`definir_papel_usuario`, `definir_status_usuario`, `definir_vinculos_usuario`, `apagar_usuario`, `encerrar_sessoes_usuario`) + a guarda comum `exigir_gestao_de` e `existe_outro_admin_ativo`. |
| `0075` | `eventos_admin_vocabulario_f22.sql` | `comment` da coluna `acao` com os três verbos novos. |
| `0076` | `promover_dev.sql` | Promove as contas de `EMAILS_DEV`. Idempotente; zero linha afetada num banco vazio (CI). |
| `0077` | `dev_diagnostico.sql` | `ultima_migracao_aplicada()` e `dev_checagens_integridade()` — as duas leituras da `/dev`, **só-leitura** e restritas ao cargo. |
| `0078` | `gestao_helpers_internos.sql` | Revoga `execute` de `authenticated` nas duas auxiliares que só são chamadas de dentro das RPCs. |

### 2.1 Por que a FK para `auth.users` foi derrubada (decisão de desenho)

O parâmetro do §0 é `APAGAR_USUARIO = preservar-autoria`. O mapa de FKs medido em produção
torna o caminho ingênuo impossível:

- `profiles.id → auth.users(id)` era **ON DELETE CASCADE** (`0001`);
- **dez** tabelas referenciam `profiles` **sem** `on delete` (= NO ACTION, que bloqueia), e
  **oito** delas são `NOT NULL` — `movimentacoes.criado_por`, `lancamentos_item.criado_por`,
  `anotacoes.criado_por`, `termos_gerados.gerado_por`/`atualizado_por`,
  `relatorios_gerados.gerado_por`, `senhas_acesso.criado_por`, `import_logs.criado_por`,
  `kits_modelos.criado_por`, `pendencias_item.resolvida_por`.

Ou seja: `auth.admin.deleteUser()` **falhava** com erro de FK vindo do schema `public` para
qualquer pessoa que já tivesse registrado uma movimentação — isto é, todo mundo. E "consertar"
trocando as dez para CASCADE apagaria movimentações, lançamentos, termos e snapshots.

**Desenho escolhido: perfil-arquivado.** A FK sai; o perfil sobrevive com o nome intacto (é ele
que as dez FKs referenciam); só a conta em `auth.users` é apagada. Resultado: a pessoa não loga
nunca mais, o e-mail volta a ficar livre, o perfil some das telas e a autoria histórica continua
nomeada.

**Consequência aceita:** apagar uma conta pelo painel do Supabase (fora do app) passa a deixar
um perfil órfão. Virou uma das checagens de integridade da `/dev`.

---

## 3. Evidências

> Regra da casa: afirmação sem saída não vale. Tudo abaixo é saída real.

### 3.1 Baseline, medida ANTES de qualquer mudança

```
$ npm run lint
> eslint
(sem nenhuma saída — limpo)

$ npm run test
 Test Files  75 passed (75)
      Tests  1593 passed (1593)
   Duration  90.78s

$ npm run build
(exit 0 — 19 rotas geradas)
```

### 3.2 Roteiro SQL `supabase/tests/cargo_dev.sql` — 46 asserções, nos DOIS bancos

```
ensaio    (sgmvldiizsrjbxzzpmhh):  [{"ok":46,"falhas":0,"detalhe":null}]
produção  (pbtjcalbmepmrqzprusb):  [{"ok":46,"falhas":0,"detalhe":null}]
```

O roteiro prova, com papel simulado (`set local role authenticated` + `request.jwt.claims`, que
é exatamente o que o PostgREST monta):

- **1z–1h** o dev passa em tudo que `e_admin()` guarda (catálogo, auditoria, `import_logs`, a
  RPC de import) **e** no que a redefinição sozinha não entregaria: escrita nas duas filiais sem
  vínculo, anotação, snapshot de relatório e o `.docx` do termo;
- **2a–2j-bis** o admin não promove a dev, não rebaixa, não desativa, não apaga, não mexe em
  vínculo e não encerra sessão de um dev — e a recusa vale para **request forjado** (`authenticated`
  escrevendo direto) e para o **service role** (`postgres`), que é o caminho que ignora RLS;
  com o par positivo (`2g-bis`) provando que o admin **continua** podendo o que sempre pôde;
- **3a–3d** o dev concede/rebaixa dev, desativa e encerra sessões;
- **4a–4e** operador e consulta não alcançam nada disso;
- **5a–5e** autoproteção (ninguém age sobre o próprio acesso), a trava do último administrador
  contando o dev junto, e as duas auxiliares fora da API;
- **6a–6h** o apagar preserva a autoria: movimentação e anotação do apagado continuam lá com o
  nome resolvendo por join, os vínculos somem, o apagado não lê mais nada, a conta sai de
  `auth.users` e **o e-mail volta a poder ser convidado**.

### 3.3 A rede morde até o service role (prova direta, fora do roteiro)

Rodado como `postgres` no ensaio, que é o papel do service role e do SQL Editor:

```
1  service role concede dev direto  → OK recusado: Só um desenvolvedor pode conceder o cargo Desenvolvedor.
2  service role insere perfil dev   → OK recusado: Só um desenvolvedor pode conceder o cargo Desenvolvedor.
3  service role mexe em não-dev     → OK passou (sem regressão)
4  update de nome em perfil comum   → OK passou
```

### 3.4 Sem regressão nas cinco policies reescritas — nos dois bancos

```
ensaio:   1 operador ANOTA: OK aceito | 2 operador GERA relatorio: OK aceito |
          3 operador GRAVA .docx: OK aceito | 4 consulta ANOTA: OK recusado |
          5 consulta GERA relatorio: OK recusado | 6 consulta GRAVA .docx: OK recusado |
          7 consulta LE ativos: OK le (1597)

produção: 1 operador ANOTA: OK aceito | 2 operador GERA relatorio: OK aceito |
          3 operador GRAVA .docx: OK aceito | 4 consulta ANOTA: OK recusado |
          5 consulta GERA relatorio: OK recusado | 6 consulta GRAVA .docx: OK recusado |
          7 consulta LE ativos: OK le (1233)
```

### 3.5 O "apagar" ponta a ponta (ensaio, dados fictícios, em transação revertida)

```
1 delete da conta no Auth: OK (a FK derrubada destravou)
2 perfil sobreviveu: SIM
3 autoria da movimentação: Sicrano de Teste
4 conta no Auth: REMOVIDA (e-mail livre)
5 reconvite do mesmo e-mail: OK aceito
```

### 3.6 Contra a API REAL de produção, com sessão de um administrador de verdade

Alvo propositalmente inexistente, para não mutar nada — qualquer erro vindo de **dentro** da
função prova que a assinatura resolveu:

```
login OK — papel do smoke: admin | e_admin: true | e_dev: false

[smallint[] via PostgREST]  code=P0002  msg=Usuário não encontrado.   => coerção OK
[enum via PostgREST]        code=P0002  msg=Usuário não encontrado.   => coerção OK
[/dev sem ser dev]          code=42501  msg=Esta consulta é restrita ao cargo Desenvolvedor.
[apagar sem ser dev]        code=P0002  msg=Usuário não encontrado.
```

### 3.7 Verificação pós-apply em produção

```
enum                        dev,admin,operador,consulta
excluido_em                 timestamp with time zone
trigger                     profiles_guarda_dev
FK profiles_id_fkey         removida (correto)
papel_atual c/ excluido_em  true
RPCs novas                  7
literal cargo em policy     ZERO (correto)
policies c/ pode_escrever() 5
policies c/ e_admin         19   (19 antes → 19 depois: a redefinição não muda a contagem)
perfis por papel            operador=2, consulta=4, admin=4
arquivados                  0
```

### 3.8 Portões, no fim da fase

```
$ npm run lint
> eslint
(sem nenhuma saída — limpo)

$ npm run test
 Test Files  76 passed (76)
      Tests  1647 passed (1647)
   (baseline era 75 arquivos / 1593 testes — +1 arquivo, +54 testes)

$ npm run build
(exit 0 — a rota ƒ /dev aparece na listagem)

$ node scripts/verificar-actions-build.mjs
[gate] chunks com Server Actions varridos: 32
[gate] VERDE — nenhum identificador registrado sem binding.
```

O último é o gate de artefato do incidente F13 (um `export type {}` num módulo `'use server'`
que matou toda a escrita em produção). A fase criou **dois** módulos `'use server'` novos
(`src/lib/actions/dev.ts` e `src/app/(app)/dev/acoes-export.ts`), então ele era obrigatório.

### 3.9 Advisors de segurança (produção, depois do apply)

**Nenhum WARN novo de RLS.** As entradas de RLS são `INFO` `rls_enabled_no_policy` em
`senhas_acesso`, `senha_tentativas` e `_bkp_relatorios_gerados_f6a` — todas **pré-existentes e
deliberadas** (deny-all é o desenho; ver ADR-002 §4.1).

O lint `authenticated_security_definer_function_executable` cresceu com as funções da fase, que
é a **mesma categoria que a `0062` já registrou como conhecida e aceita**: função chamada dentro
de expressão de policy (que roda com os privilégios de quem consulta) ou RPC invocada pela Server
Action com o client de sessão precisam de `execute` para `authenticated`, e cada uma tem guarda
interna. A `0078` removeu da API as **duas** que não se encaixavam em nenhum dos dois casos.

`auth_leaked_password_protection` continua em WARN — pré-existente, já no backlog do projeto.

---

## 4. Decisões registradas

Todas em [`DECISOES.md`](DECISOES.md) (30/07/2026), com contexto e motivo. Em resumo:

1. **perfil-arquivado** para o apagar (§2.1 acima).
2. `dev` **conta** como nível administrador na trava "o sistema nunca fica sem administrador" —
   nas três camadas que precisam concordar: `idsDeAdminsAtivos()`, `eAdminAtivo()` e
   `existe_outro_admin_ativo()`.
3. **Não** existe trava de "último dev": um sistema sem dev é um estado legal (era o de ontem).
4. Ninguém age sobre o **próprio** acesso em nenhuma RPC de gestão, inclusive encerrar sessões.
5. Os **vínculos** também passaram para RPC, tirando o service role desse caminho.
6. Trocar e-mail aplica **direto** (`email_confirm: true`): o projeto não tem SMTP próprio (foi
   por isso que o convite virou link copiável na F6) e exigir confirmação deixaria a conta em limbo.
7. Encerrar sessões é **RPC apagando `auth.sessions`**, porque `admin.signOut()` do
   `@supabase/auth-js` 2.110.2 (conferido em `node_modules`) recebe um **JWT**, não um id de
   usuário — não existe caminho pela API para revogar sessão de terceiro. O limite honesto
   (o token corrente vale até ~1h) está escrito na tela.
8. A rede da `0073` usa GUC **local à transação**, com reset explícito na saída de cada RPC (§1.1b).
9. A oitava checagem de integridade foi **descartada**, com a medição registrada (§1.1c).
10. `npm run db:types` passou a **fixar** a CLI do Supabase em `2.109.1`, a mesma do CI.
11. Os e-mails das contas dev podem constar de ordem/migration/DECISOES por serem **metadado de
    acesso do próprio sistema**, e não dado do acervo — a regra 2 do CLAUDE.md segue absoluta em
    seed, fixture, teste e screenshot.

---

## 5. Roteiro manual de 5 minutos (para o Victor)

O que está automatizado é a camada de dados e autorização. O que só um par de olhos confere é
a **tela**. Sugestão de ordem — os dois primeiros passos usam uma conta de **administrador**
(qualquer uma que não seja sua), os demais a sua, já promovida a Desenvolvedor.

**Como administrador (2 min) — o dev tem de ser intocável:**

1. Abra `/admin/usuarios`. A sua linha aparece com o badge **Desenvolvedor** e os botões
   **Editar** e **Desativar** vêm **desabilitados**; passe o mouse (ou dê Tab até eles) e a
   explicação "Gerido por desenvolvedor" aparece.
2. No convite (**Convidar usuário**) e na edição de qualquer outra pessoa, o cargo
   **Desenvolvedor não aparece** na lista.
3. Digite `/dev` na barra de endereço. Você é mandado para o painel — sem mensagem de erro
   feia, sem piscar a tela da área técnica.

**Como Desenvolvedor (3 min):**

4. O item **Desenvolvedor** aparece no menu lateral. Abra `/dev`.
5. **Diagnóstico**: confira commit/branch/ambiente e a tabela de contagens. A última migration
   do repositório e a versão registrada no banco aparecem lado a lado (numerações diferentes,
   de propósito — não se comparam).
6. **Integridade**: clique em **Rodar checagens**. As sete devem voltar **ok** (zero achados).
   Se alguma vier em âmbar, o número e a amostra dizem onde olhar.
7. **Auditoria**: filtre por uma ação e clique em **Exportar CSV** — o arquivo tem de sair com
   as mesmas linhas da tela.
8. Volte a `/admin/usuarios` e, no menu **⋯** de um usuário **fictício de teste**:
   - **Alterar e-mail de login** para outro endereço corporativo; confira que a lista atualiza
     e que apareceu `E-mail alterado` na aba Auditoria.
   - **Encerrar sessões abertas** — leia o aviso do limite de ~1h.
   - **Apagar conta**: o diálogo exige digitar o e-mail. Depois de apagar, a pessoa **some da
     lista** — e, na ficha de um ativo que ela tenha movimentado, o **nome dela continua** em
     "Quem fez". É esse o par que prova a fase inteira.

> ⚠ Use uma conta **fictícia** no passo 8. Apagar é irreversível, e o perfil arquivado não
> volta a ser um usuário — o e-mail é que fica livre para um convite novo.

## 6. O que este relatório NÃO prova

Honestidade sobre os limites do que foi medido:

- **Não houve teste de interface renderizada.** O projeto não tem testes de componente; a
  verificação da `/dev` e dos diálogos novos é o roteiro manual do §7. O que está provado por
  execução é a camada de **dados e autorização**, não o desenho da tela.
- **A checagem "status do ativo × última movimentação" não existe** — foi descartada por
  produzir alarme falso em massa (§1.1c). A `/dev` **não** cobre esse tipo de inconsistência.
- **O limite de ~1h do access token não foi medido em relógio.** É o comportamento documentado
  do Supabase Auth (o token de sessão revogada continua válido até expirar) e a mesma janela que
  a F21 já assumia para a desativação; a tela declara o limite, o relatório não o cronometra.
- **`_bkp_relatorios_gerados_f6a`** (2 linhas, backup remanescente da F6A) continua em produção.
  Conferi que está **fechada** (RLS ligada, zero policies → deny-all): não é vazamento. Mas ela
  aparece nos tipos gerados e segue como item de backlog — apagá-la é destrutivo e fora do escopo
  desta ordem.
- **Nenhuma medição de desempenho.** As funções novas são `stable` e as policies seguem a
  doutrina initplan da `0059`, mas não houve `explain analyze`.

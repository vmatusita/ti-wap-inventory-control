# Relatório F21 — Cargos, permissões, vínculo de filiais e controle de usuários

**Ordem:** [`prompts/F21-papeis-ultracode.md`](prompts/F21-papeis-ultracode.md) · **ADR:** [`ADR-002-papeis-e-permissoes.md`](ADR-002-papeis-e-permissoes.md) · **Execução:** 29/07/2026 · **Branch:** `f21-papeis`

**Uma frase:** a autorização deixou de parar no *"está logado?"* — três cargos (**admin ⊃ operador ⊃ consulta**), vínculo de filiais de escrita por operador, desligar usuário com efeito no request seguinte e trilha de auditoria, com a regra valendo **no Postgres** e o advisor `rls_policy_always_true` saindo de **12 para 0**.

---

## 1. O que este relatório NÃO prova

Fica no topo de propósito, para ninguém ler o resto e supor mais do que foi medido.

1. **A UI dos cargos não foi exercitada em navegador.** Todo o gating de tela (consulta sem CTA, sidebar sem Administração, selects restritos) está provado por *código, tipos e testes*, não por clique. O motivo não é o login wall — é que **não existe usuário não-admin em nenhum dos dois bancos**: o backfill deixou os 9 perfis de produção como `admin`, e criar um `consulta` de teste em produção seria mexer em dado de acesso real sem o Johnny pedir. É exatamente o que o **roteiro manual de 5 minutos** (§8) cobre.
2. **`npm run db:seed` não rodou.** Os perfis fictícios nos três cargos foram escritos e passam no type-check, mas o `.env.local` desta máquina aponta para **produção** e a guarda `REFS_DE_PRODUCAO` recusa — corretamente. Rodar contra o ensaio exige as credenciais do ensaio, que não estão nesta máquina. **Pendência real** (§7).
3. **O CI ficou VERMELHO no primeiro push, e o que ele pegou está corrigido — mas a confirmação do verde é sua.** Não há `gh` nesta máquina; o Johnny colou a saída do job `banco`. Ele derrubou **3 roteiros**, todos por causa desta fase e **nenhum** reproduzível nos bancos hospedados: a guarda de admin do import quebrou `import_substituir.sql` e `troca.sql` (num Postgres novo o perfil de teste nasce `operador`, porque o backfill da `0061` só alcança quem já existia), e `papeis_rls.sql` morreu em `permission denied for table ativos` (o `supabase start` não reproduz os *default privileges* que um projeto hospedado dá a `authenticated` — e este é o **primeiro** roteiro do repo a fazer `set local role authenticated`). Os três estão corrigidos e a correção foi provada no ensaio **simulando a condição do CI**; ver a ata de 2026-07-30 em [`DECISOES.md`](DECISOES.md). **O verde do job só pode ser lido no GitHub depois deste push.**
4. **O import destrutivo não foi executado** com a guarda nova. A guarda é provada por asserção (`3i`: a RPC recusa operador com a mensagem certa), não por um import real — que apagaria acervo.
5. **A desativação no Supabase Auth (`ban_duration`) não foi exercitada.** A metade que fecha a escrita (`profiles.ativo = false`) está provada (asserções 4a/4b/4c). A metade que impede login novo depende de uma chamada de admin API que não foi disparada aqui.

---

## 2. Arquivo a arquivo, e por quê

### 2.1 Banco — 8 migrations, uma por assunto

| Migration | O que faz | Por quê |
|---|---|---|
| **`0061_papeis_estrutura`** | enum `papel_usuario`; `profiles.papel` + `profiles.ativo`; tabela `operador_filiais` (PK composta, índice do lado da filial); **backfill** → todo perfil vira `admin` com vínculo em toda filial ativa | O backfill é o que torna o deploy um **não-evento** (ADR §6). O default da coluna é `'operador'` e não `'admin'`: conta NOVA nasce operador com zero vínculo, e zero vínculo **fecha toda escrita** — se a action de convite falhar no meio, o usuário resultante não escreve em lugar nenhum. Falha segura. |
| **`0062_papeis_funcoes`** | `papel_atual()`, `e_admin()`, `pode_escrever_filial(fid)` — `security definer`, `stable`, `search_path` fixo, `revoke` de `public`/`anon` | `papel_atual()` devolve NULL para perfil **desativado** — é a porta única por onde a desativação entra na RLS, e é o que faz "desligar" valer no request seguinte. `definer` (e não invoker) para a autorização não depender das policies de leitura continuarem abertas. |
| **`0063_papeis_policies`** | troca as policies de escrita pelo mapa do §5; `import_logs` leitura → admin; **grant de coluna** em `profiles` | Ver a armadilha da `0059` em §2.2. O grant de coluna é o que fecha a auto-promoção: RLS é row-level, não column-level (lição literal da `0012`). |
| **`0064_papeis_guardas_rpcs`** | guarda `e_admin()` dentro de `importar_ativos_substituir`; guarda de vínculo em `criar_compra_lote` | Função `security definer` passa **por fora** de toda policy. A auditoria de `pg_proc` nos dois bancos mostrou que a única secdef que escreve e é executável por `authenticated` é a do import — e ela apaga o acervo de uma filial. |
| **`0065_eventos_admin`** | tabela de auditoria: insert-only via service role, leitura `e_admin()`, **sem update/delete em lugar nenhum** | Trilha que o próprio auditado pode reescrever não é trilha. `autor` é `on delete set null` para o rastro sobreviver à exclusão da conta. |
| **`0066_papeis_storage`** | as 8 policies dos buckets `termos` e `backups-import` passam a olhar o cargo | **Achado fora do mapa da ordem** (§3). |
| **`0067_papeis_correcoes_revisao`** | dois furos achados pela **revisão adversarial da própria fase** | §5.1/§5.2. O primeiro furava o critério de aceitação 2 e a premissa do ADR §4.3.1. |
| **`0068_estorno_item_mesma_filial`** | `estorno_item_coerente(...)` + a policy de `lancamentos_item` | §5.3. O MESMO furo da `0067`, no irmão que ela não alcançou — achado pela **re-revisão** das correções. |

### 2.2 A armadilha que a `0059` armou (e que quase cegou o app)

Vale isolar porque é o tipo de coisa que passa em revisão de diff. A `0059` **dropou** a policy `"leitura operador"` (FOR SELECT) de seis tabelas — `ativos`, `filiais`, `itens`, `kits_modelos`, `motivos`, `termos_gerados` — porque nelas convivia uma `"operador escreve" FOR ALL using(true)`, e em Postgres FOR ALL cobre SELECT também: `true OR true` = `true`, então derrubar a de SELECT era no-op.

Com a F21 isso **se inverte**: nessas 6 a policy FOR ALL passou a ser a **única porta de leitura**. Um `alter policy` nela — o caminho óbvio, e o que a ordem sugere para as outras tabelas — teria deixado a lista de ativos, o catálogo, os kits e os termos **vazios para todo não-admin**. O caminho usado, numa transação só: (1) recriar a policy de SELECT, (2) dropar a FOR ALL, (3) criar uma policy **por verbo** de escrita. Uma policy por comando, para não reacender o `multiple_permissive_policies` que a `0059` acabou de apagar. `policies_public`: **20 → 39**.

### 2.3 App — a camada de acesso

- **`src/lib/auth/papeis.ts`** (novo, isomórfico, puro) — vocabulário único: `PapelUsuario` (derivado do enum do banco, então papel novo na migration acusa erro de tipo aqui), `PAPEL_ROTULO`/`PAPEL_DESCRICAO`, `papelAtende`, `eAdmin`, `podeEscrever`, `exigeVinculoDeFilial`, `validarVinculosDoPapel`, `filiaisDeEscrita`. A hierarquia é um **ranking numérico** e não a ordem do enum, de propósito: no Postgres `admin` é o PRIMEIRO label e portanto o **menor** na comparação (`papel <= 'operador'` = "operador ou mais forte"), inversão de sinal que é fonte clássica de bug — 23 testes cobrem os 9 pares.
- **`src/lib/auth/acesso.ts`** — `Operador` ganha `papel` e `filiaisEscrita`; `getOperador()` devolve **null** para perfil desativado. Guardas novas: `exigirPapel`, `exigirAdmin`, `exigirEscrita`, `exigirEscritaEm`. **Todas roteadas pelas MESMAS funções do banco** (`papel_atual`, `pode_escrever_filial`) via RPC — assim action e RLS não podem divergir, que é o que o §4 da ordem exige. Mais `temSessaoSupabase()` (§5).
- **`src/lib/actions/erros.ts`** — a mensagem de RLS **mentia**. "Sem permissão para esta operação. **Faça login novamente**" é o conselho errado para quem é `consulta` ou é operador sem a filial vinculada: relogar não muda nada. Três ramos novos, do específico ao geral.
- **`src/lib/auditoria.ts`** + **`auditoria-registro.ts`** — vocabulário isomórfico e o escritor server-only. O escritor **não propaga** erro: a ação administrativa já aconteceu, e estourar faria a tela dizer "falhou" sobre algo que deu certo (o operador tentaria de novo, duplicando o efeito). Em compensação loga alto, com o evento inteiro.

### 2.4 App — actions, UI, gestão de usuários, seeds e docs

Quatro frentes em conjuntos de arquivos disjuntos. O detalhe está nos commits; o essencial:

- **Actions (12 arquivos):** `exigirAdmin` em senhas/kits/importar e no **catálogo** de itens; `exigirEscrita(filial)` em movimentações/compras/devolução-fornecedor/ativos e nos **lançamentos** de itens/pendências/termos; `exigirPapel('operador')` em relatórios. Onde a filial já vinha de um select existente, só se acrescentou `filial_id` — **nenhuma query nova**. Lote multi-filial (movimentação, termo, pendência, devolução com substituto) usa `exigirEscritaEm` e **recusa o lote inteiro**: escrita parcial silenciosa é pior que recusa clara.
  Duas mudanças de comportamento observáveis, deliberadas: (a) a guarda de autorização passou a vir **antes** das checagens de estado ("ST já preenchida", "já assinado"), então quem não tem vínculo recebe mensagem de permissão em vez de mensagem de estado; (b) `exportar.ts` passou a enxergar a **desativação** (`exigirPapel('consulta')` — o piso da hierarquia, logo **não** é gate de cargo: os três exportam, `CONSULTA_EXPORTA_CSV = sim`). Sem (b), um usuário desligado seguiria puxando o acervo inteiro em CSV por request direto até o token vencer, porque as policies de SELECT são abertas por design (ADR-001).
- **UI:** o layout resolve papel/filiais **uma vez** e desce por prop; sidebar esconde Administração; `admin/layout` exige admin (defesa em profundidade — e necessária: `profiles` é legível por qualquer logado, então sem esse gate um operador **veria** a lista de usuários); consulta sem CTA de escrita em tela nenhuma, incluindo o atalho global e os comandos de escrita da paleta; selects de filial das telas de escrita oferecem só as vinculadas. Exportar CSV e baixar termo continuam para consulta.
- **`/admin/usuarios`:** tabela com cargo/filiais/situação; convite com cargo + filiais (mínimo 1 para Operador, validado por `validarVinculosDoPapel` no cliente **e** no servidor); editar; desativar/reativar; **autoproteções** (não rebaixar/desativar a si mesmo; nunca ficar sem admin ativo, contando os admins **ativos** imediatamente antes de gravar); aba **Auditoria**. O papel **nunca** vem de `raw_user_meta_data` — o próprio usuário edita o metadata dele. O `catch {}` vazio que escondia falha na leitura do e-mail virou **aviso visível**; `listUsers` foi paginado.
- **Seeds:** 6 contas fictícias nos três cargos, incluindo um **operador sem vínculo** (falha segura) e um **desativado**; `reset` preserva `operador_filiais` (é configuração de conta) e limpa `eventos_admin` (é dado do seed). `scripts/env-guard.ts` **intocado** — conferido por `git diff` vazio.
- **Docs:** spec §3 reescrita + §3.1 nova; CLAUDE.md; nota de sucessão **escopada** na ADR-001 (só o ponto "papéis"; leitura ampla e caminho do visualizador continuam valendo); 7 páginas de ajuda, com os rótulos de cargo **derivados** de `papeis.ts` e a lista de ações da auditoria derivada de `ACOES_ADMIN`. O teste do registry ganhou **guarda global** contra o modelo revogado ("nível único", "sem papéis", "mesmo nível de acesso") em *qualquer* página — o texto antigo não volta por descuido.

---

## 3. Achado fora do mapa da ordem: as policies de STORAGE

O §5 da ordem mapeia tabela por tabela e **não menciona `storage.objects`**. A varredura de descoberta achou o resto do buraco: os dois buckets privados tinham 4 policies cada, todas `to authenticated` com o único predicado `bucket_id = '<nome>'` — nenhuma noção de papel.

Sem a `0066`, a F21 teria fechado a porta e deixado a janela aberta:

- o cargo `consulta` — que por definição não escreve nada — subiria e **apagaria** `.docx` no bucket `termos` pela API de Storage (a UI não oferece o botão, mas a UI nunca foi a defesa);
- um não-admin continuaria **listando e baixando** os backups de acervo, mesmo depois de a `0063` esconder `import_logs.backup_path` dele. Restringir a tabela e deixar o bucket aberto é fechar a porta e deixar a chave na fechadura.

---

## 4. Onde a medição corrigiu a ordem

Três afirmações da proposta não sobreviveram ao contato com os bancos. Todas registradas em [`DECISOES.md`](DECISOES.md).

| Premissa da ordem/ADR | O que a medição mostrou | O que se fez |
|---|---|---|
| *"qualquer logado lê os hashes das senhas de acesso (`senhas_acesso` tem select `true`)"* → fechar com `e_admin()` | **Falso.** A `0012` já dropou as duas policies; medido nos dois bancos: **0 policies**, deny-all para `anon`/`authenticated` | **Manter sem policy.** Criar `using (e_admin())` seria **afrouxar** — reabriria a coluna `hash` para o client de sessão de um admin, o vetor que a `0012` fechou. O critério 6 fica satisfeito *a fortiori*, e as asserções 3d/5f provam que **nem o admin** lê |
| *"`criar_compra_lote` → `pode_escrever_filial(...)`"*, no mesmo balde das RPCs que precisam de guarda | `criar_compra_lote` e `devolver_ao_fornecedor` são `security INVOKER` — já sujeitas às policies. A **única** secdef que escreve e é executável por `authenticated` é `importar_ativos_substituir` | Guarda `e_admin()` no import (a que importa) e guarda em `criar_compra_lote` como **cinto e suspensórios pela mensagem** — sem ela o operador receberia o SQLSTATE cru de RLS, que a UI traduzia como "faça login novamente" |
| *"Toda chamada de função embrulhada em `(select ...)` (initplan)"* | `pode_escrever_filial(filial_id)` depende da **linha**: `(select ...)` não gera InitPlan, gera subconsulta correlacionada — avaliada por linha do mesmo jeito, com overhead a mais | Embrulhadas só as funções **sem argumento** (`e_admin`, `papel_atual`). Custo real nulo: essas policies rodam em INSERT/UPDATE de uma linha ou lote pequeno; a varredura de 1.600 ativos passa pela policy de SELECT `using (true)`, que não chama função |

E a condição que **se cumpriu**: `import_logs` podia fechar para admin — nenhuma view referencia a tabela e os dois consumidores de leitura estão ambos dentro de `/admin/importar`.

---

## 5. A revisão adversarial achou um furo de verdade

5 lentes independentes + um refutador por achado, refutação como padrão: **16 achados brutos → 4 confirmados** (o de gravidade alta apontado por **duas** lentes; um dos médios por **três**) + **8 refutados com prova**.

### 5.1 O furo (alta) — e por que ele furava a fase inteira

A `0063` escreveu a policy de `movimentacoes` **como a ordem manda ao pé da letra**:

```sql
with check (public.pode_escrever_filial(filial_id))
```

e `movimentacoes.filial_id` é uma **coluna livre do payload**. Nenhuma constraint, trigger ou policy exigia que ela batesse com a filial do ativo. É o padrão do **deputado confuso**: gatear um dado que o próprio escritor escolhe. Pior, o efeito era **amplificado** porque `aplicar_movimentacao` é `security definer` de propósito — o `update ativos` dele **nunca** passa pela policy `"operador atualiza"`.

**Reproduzido no ensaio antes de corrigir** (saída real):

```
1. ativo alvo esta na filial      | 2
2. operador vinculado so a        | 1
3. pode_escrever_filial(f2)?      | false
4. INSERT com filial_id MENTIDO   | ACEITO — VULNERAVEL
5. filial do ativo DEPOIS         | 1  <== MIGROU para a filial do atacante
```

Dali em diante toda escrita naquele ativo é legítima para o atacante. Variantes com o mesmo bypass: `tipo='ajuste'` com `status_resultante='descartado'` (o ajuste pula a máquina de estados) e `tipo='saida'` (troca o detentor) — em ativo de filial alheia nos dois casos. A anon key está no bundle do navegador, então o request forjado não exige mais que `curl`.

Isto derrubava o **critério de aceitação 2** da própria ordem ("recusado em Y **no banco**") e a premissa do **ADR §4.3.1** ("gatear o INSERT de `movimentacoes` basta"): o isolamento por filial dos ativos existia **só na Server Action** — a UI como única linha de defesa, exatamente o que o CLAUDE.md proíbe.

**Correção (`0067`):** gatear também a filial de **ORIGEM lida do banco**, via `snapshot_anterior ->> 'filial_id'` — que o trigger preenche de um `select ... from ativos ... for update` e **sobrescreve** se o cliente tentar forjar. Não se usou `exists (select ... from ativos ...)` porque naquele ponto o trigger **já moveu** o ativo, e o `exists` recusaria a transferência legítima que o §0 autoriza. A ordem de avaliação (BEFORE trigger → WITH CHECK) foi **confirmada por teste**, não por leitura de doc:

```
1 EXPLOIT filial_id mentido            | RECUSADO (42501) — corrigido
2 filial do ativo de f2 depois         | 2 (intacta)
3 LEGITIMO ajuste na filial vinculada  | ACEITO
4 LEGITIMO transferencia f1->f2        | ACEITO
5 ADMIN ajuste em f2                   | ACEITO
6 COMPRA (RPC) na filial vinculada     | ACEITO
```

### 5.2 Os outros três confirmados

- **`import_logs` com INSERT `with check (true)`** (média). O raciocínio da `0063` ("é vestigial, quem grava é a RPC definer") estava certo sobre a RPC e **errado sobre o resto**: `authenticated` tem privilégio de INSERT na tabela, então qualquer logado — inclusive `consulta` — forjava a trilha do import destrutivo por `POST /rest/v1/import_logs`. Agora `e_admin()`. Com isso o advisor `rls_policy_always_true` foi de **12 → 0**.
- **O desligado caía na porta do visualizador** (média, 3 lentes). A F21 criou um estado que **não existia antes**: `getOperador()` devolve null com sessão Supabase **válida** (perfil desativado). O shell caía no ramo do visualizador e mandava quem acabou de ser desligado para a tela **pública** da senha de relatório, sem nunca dizer o motivo. Corrigido com `temSessaoSupabase()` e um ramo novo no layout → `/login?erro=acesso-desativado`. Fica **antes** do `getViewerSession()` de propósito: o desligado não deve ser rebaixado a visualizador em silêncio.
- **O diálogo "Editar" abria quebrado para TODOS** (média). O backfill deu a todo perfil vínculo em todas as filiais — e um Administrador chega ao formulário com a lista cheia, onde `validarVinculosDoPapel('admin', [1..6])` recusa lista não vazia: **erro vermelho e "Salvar" desabilitado para todos os 9 usuários de produção**. Corrigido: só pré-preenche vínculo para o cargo que o **usa**; para admin/consulta as linhas de `operador_filiais` são dado morto (`pode_escrever_filial` devolve true para admin sem consultá-las).

### 5.3 A re-revisão achou o MESMO furo no irmão — e um erro no meu próprio comentário

O §V da ordem manda *"corrija e re-revise até limpar"*. A re-revisão (3 lentes sobre o commit de correções) devolveu **8 achados, todos confirmados**, que deduplicam em **3 reais**. Os dois primeiros são deste tipo desconfortável: a correção estava certa, mas incompleta ou mal documentada.

**1. O mesmo deputado confuso em `lancamentos_item` (média) → migration `0068`.** A `0067` fechou `movimentacoes` e não olhou o irmão. Ali `filial_id` **é** o objeto da escrita (o saldo daquela filial), então o predicado é auto-consistente — mas a **outra** coluna da mesma linha, `estorna_id`, é ponteiro livre para uma linha de qualquer filial, e nada a conferia (a FK da `0015` não filtra; o trigger `valida_lancamento_item` olha saldo e reserva, não menciona `estorna_id`).

Um operador da filial 1 podia estornar um lançamento da filial 2 declarando `filial_id: 1`. Efeito, todo fora da filial dele: o lançamento da filial 2 passa a aparecer **"estornado"** no histórico e no relatório (a derivação é "existe alguém apontando para mim", sem filtro de filial), o **saldo continua contando** — histórico e saldo se contradizem — e o índice único queima a vaga, então o operador legítimo **nunca mais** consegue estorná-lo (a tabela é imutável).

A primeira revisão havia **refutado** isto como "folga pré-existente do esquema, não da fase". A re-revisão derrubou a refutação com o argumento certo: **foi a F21 que transformou filial em fronteira de escrita**. Antes da `0063`, `with check (true)` tornava o caso irrelevante — não havia privilégio a violar.

E o fecho teve uma armadilha própria, encontrada ao testar antes de aplicar: a primeira tentativa usou um `exists` inline, e dentro do subselect **na própria tabela** a referência nua `estorna_id` resolve para a coluna do alias da subconsulta — a condição virava `o.id = o.estorna_id`, sempre falsa, e o predicado **recusava o estorno legítimo**. Trocado por uma função `security definer` com parâmetros nomeados, onde não há escopo ambíguo possível. Medido no ensaio: ataque cruzando filial → 42501; ataque cruzando item → 23514; estorno legítimo → aceito; lançamento sem estorno → aceito.

**2. Meu comentário documentava um comportamento que o código não tinha (baixa, 3 lentes).** A correção do desligado (§5.2) colocou o teste **antes** do `getViewerSession()`, e o comentário afirmava que "a porta do visualizador continua aberta de forma explícita". Não continuava: o cookie de visualização tem `path: '/relatorios'`, ou seja é entregue exatamente nas rotas que o ramo barrava. Quem foi desligado como operador **mas é visualizador legítimo por senha** entrava em `/relatorios/acesso`, acertava a senha, recebia o cookie, era redirecionado para `/relatorios/geral` — e caía no login. Senha certa na mão, nenhum relatório na tela.

Corrigido movendo o teste para **depois** do `getViewerSession()`, condicionado a `!viewer`. A senha de acesso é uma porta **independente do cargo** (spec §3), e perder o login de operador não pode revogar um acesso que nunca dependeu dele. O comentário foi reescrito para descrever o que o código faz — e para registrar o erro, porque a versão anterior é o tipo de comentário que passa em revisão de diff justamente por soar plausível.

**3. O ADR continuava prescrevendo o predicado furado (média).** A `0067` mudou o predicado, mas o **documento de desenho** que a spec §3.1 e o README apontam como fonte da decisão não foi emendado: o mapa por tabela ainda mostrava `movimentacoes | insert: pode_escrever_filial(filial_id)` e o §4.3 item 1 ainda afirmava, em negrito, que *"gatear o INSERT de `movimentacoes` **basta**"* — a premissa exata que o exploit derrubou. Pior: o item 2 da mesma seção **já tinha** a anotação "⚠ corrigido na execução", então quem lesse o item 1 sem anotação o tomaria por válido. O caminho de falha é o que já aconteceu uma vez: foi seguindo essa letra que a `0063` escreveu o predicado furado.

Corrigido, e mais: o ADR ganhou a seção **§4.4 — "Não gateie a coluna que o escritor escolhe"**, com a tabela de quando `filial_id` é objeto e quando é rótulo, e a pergunta a fazer antes de escrever a próxima policy. A lição valia mais que a correção.

### 5.4 Achado próprio, fora da revisão

A regeneração do `database.ts` **desfez em silêncio** a edição manual de 24/07 que tirava `nome` (coluna GERADA) de `Insert`/`Update` de `profiles`. Restaurada. Nenhum código escreve nessa coluna hoje, mas a guarda de tipo existia de propósito — é a mesma classe de armadilha do `| null` do `p_filial` (§6.4).

### 5.5 A lição de processo, que vale mais que os achados

O roteiro `papeis_rls.sql` tinha **41 asserções verdes com o furo aberto**. A asserção `2c` testava "operador recusado na filial não vinculada" usando ativo **e** `filial_id` ambos da filial alheia — o caso **cruzado** (mentir o `filial_id`) não era testado, e é justamente ele que distingue *"gateei o dado certo"* de *"gateei o dado que o atacante escolhe"*.

**Teste verde não é prova de cobertura.** As seis asserções novas (41 → 47) são exatamente essa lacuna: `2c-bis` (o caso cruzado), `2c-ter` (o ativo não migrou), `2h` (a transferência legítima **continua** passando — sem ela a correção poderia ter fechado o furo quebrando o fluxo normal, e ninguém notaria), `3f-bis` (o operador não forja a trilha do import) e, da re-revisão, `2e-bis`/`2e-ter` (§5.3).

Vale para as asserções de leitura também: as de "não vê nada" (`3d`/`3e`/`3f`/`6b`) passavam **de graça** num banco novo, e o CI roda exatamente num Postgres novo, onde essas tabelas nascem vazias. O roteiro agora **planta uma linha** em cada antes de trocar de papel, e checa o outro lado (o admin **vê**) — senão uma policy que escondesse de todo mundo passaria nos dois testes.

---

## 6. Evidências

### 6.1 Portão local

```
LINT   npx eslint            → (vazio)
TSC    npx tsc --noEmit      → (vazio)
TEST   npx vitest run        → Test Files 75 passed (75) · Tests 1588 passed (1588)
BUILD  npx next build        → ✓ Compiled successfully · 26 rotas
```

Testes: **1496 (F20B) → 1588**. Sem asserção removida sem substituta mais forte.

### 6.2 `supabase/tests/papeis_rls.sql` — 47 asserções, 0 falha, nos DOIS bancos

```
ensaio    (sgmvldiizsrjbxzzpmhh) → ok=47  falhas=0  detalhe=null
produção  (pbtjcalbmepmrqzprusb) → ok=47  falhas=0  detalhe=null
```

O que as 47 provam: consulta lê tudo e **não escreve em nada** (6 tabelas) · operador escreve na filial vinculada e **é recusado** na outra (movimentação, lançamento, update de ativo) · **não escreve declarando filial alheia** (2c-bis) e o ativo **não migra** (2c-ter) · a transferência legítima **continua passando** (2h) · não mexe em catálogo de admin · **não lê** `senhas_acesso`/`import_logs`/`eventos_admin` (com linha plantada em cada) · **não forja** a trilha do import (3f-bis) · **não se promove a admin** (3g — grant de coluna) mas ainda edita o próprio nome (3h) · a RPC de import recusa operador com a mensagem certa (3i) · **desativado com vínculo não escreve nada** (4a/4b/4c) · admin faz tudo, **vê** a auditoria e o histórico, e **nem ele** lê `senhas_acesso` (5f) nem muda papel por sessão (5g) · **estorno de item não cruza filial** e o estorno legítimo segue passando (2e-bis/2e-ter) · storage por cargo nos dois buckets, nas duas direções (6a–6f).

Fixtures 100% fictícias (`f21.*@wap.ind.br`, `WAP000900x`), dentro de `begin; … rollback;`. **Conferido em produção que nada sobrou:** 0 usuários residuais, 0 ativos de teste, 0 motivos/filiais de teste, e as contagens de volta ao baseline. Antes de rodar em produção foi conferido que **nenhuma** chave fictícia colidia com dado real (patrimônio, e-mail, uuid, código de motivo, slug: 0 colisões).

### 6.3 Migrations em produção — verificação pós-apply

```
backfill        papel admin = 9 · vínculos esperado=54 real=54 (9 perfis × 6 filiais) · desativados=0
funções         3 × definer=true, vol=s, anon=false, authenticated=true
fingerprint     criar_compra_lote          394c24d299f8c4ae9a049466749c684d
  normalizado   importar_ativos_substituir 3e3fd38717f1329041df0c7eee20e1d5
                → IDÊNTICO entre repo, ensaio e produção
policies        escrita com predicado `true`: 0 (era 12 na entrada da fase)
                portas de leitura nas 6 tabelas do grupo: 1 cada
grant coluna    profiles → primeiro_nome+sobrenome, e nada mais
acervo          ativos 1230 · movimentações 2361 · termos 6 · import_logs 8
                lançamentos 9 · v_fila_pendencias 55 · storage 27   (antes = depois)
```

O fingerprint idêntico entre repo/ensaio/produção prova que a reprodução dos corpos das duas RPCs foi fiel — e, de brinde, **eliminou o drift de CRLF** do `criar_compra_lote` que o runbook documentava.

### 6.4 Paridade ensaio × produção (sonda normalizada)

```
classe            objetos   fingerprint bate?
enum                    7   sim
func                   18   sim
grant_func             18   sim
policy_public          39   sim
policy_storage          8   sim
grant_coluna      428/412   diverge POR CONSTRUÇÃO
```

A divergência são exatamente as **16** linhas de `_bkp_relatorios_gerados_f6a`, a tabela de backup retida só em produção de propósito (`0039`/`0058`): 428 − 16 = 412 = ensaio.

### 6.5 Advisors de segurança (produção)

| Lint | Antes da F21 | Depois |
|---|---|---|
| `rls_policy_always_true` (WARN) | **12** | **0** |
| `authenticated_security_definer_function_executable` (WARN) | 1 | 4 |
| `rls_enabled_no_policy` (INFO) | 3 | 3 |
| `auth_leaked_password_protection` (WARN) | 1 | 1 |

**Nenhum WARN novo de RLS** — o critério 8 pede exatamente isso, e os 12 viraram 0. Os **3 WARN novos de outra classe** são inerentes ao desenho e aceitos: uma expressão de policy é avaliada com os privilégios de **quem consulta**, então `authenticated` **precisa** de EXECUTE nas três funções — sem isso toda query nas tabelas com policy nova falha com "permission denied for function". São inócuos em substância: as três respondem exclusivamente sobre o **próprio chamador** (`auth.uid()`), não aceitam identidade como parâmetro e não revelam nada de terceiros; `anon` e `public` ficam sem execute. Alternativa considerada e rejeitada: mover as funções para um schema não exposto pelo PostgREST — resolveria o lint, mas divergiria da ordem e do ADR e quebraria `db:types` e os roteiros.

### 6.6 Smoke de produção — o rollout como não-evento

Rodado com as migrations **já em produção** e o app **ainda o antigo**. É a prova direta do critério 7:

```
RESUMO · 86 OK · 1 aviso · 0 n/a (pré-F12) · 0 falha
```

O único aviso é **pré-existente** e da mesma família que esta fase corrigiu no roteiro SQL: *"kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado — RLS não comprovada"* — o smoke não consegue provar RLS numa tabela vazia. Não foi introduzido pela F21.

### 6.7 Deploy e smoke PÓS-deploy

`main` mergeada (merge commit `9bcc875`, sem fast-forward) e empurrada — a Vercel deploya no push.

**Confirmação de que o código NOVO está no ar** (e não a versão anterior): o chunk
`/_next/static/chunks/0hj8a4rw5uzmv.js` servido por produção contém a string
`Seu acesso foi desativado`, que **só existe a partir desta fase** (`src/app/login/page.tsx`).
Marcador escolhido de propósito numa rota PÚBLICA — as páginas de ajuda exigem sessão, e um
`curl` nelas mede o redirect para o login, não o conteúdo.

**Smoke depois do deploy:**

```
RESUMO · 86 OK · 1 aviso · 0 n/a (pré-F12) · 0 falha
```

Mesmo resultado do smoke de antes do deploy (§6.6) — o que era o objetivo: com o backfill, o app
novo sobre o banco novo se comporta como o app antigo se comportava. O aviso é o mesmo
pré-existente de `kits_modelos`.

---

## 7. Checklist da ordem, autoverificado

### Critérios de aceitação (§"Critérios de aceitação")

| # | Critério | Situação | Prova |
|---|---|---|---|
| 1 | Consulta lê tudo, exporta CSV, e **não escreve nada** — nem pela UI nem por request direto | ✅ | Banco: asserções 1a–1h (6 tabelas) + 6a. UI: gating por `podeEscrever` em todas as telas. Export mantido (`CONSULTA_EXPORTA_CSV = sim`). ⚠ o lado UI não foi visto em navegador (§1.1) |
| 2 | Operador com vínculo só em X escreve em X, é **recusado em Y no banco**, avisado em pt-BR, e a transferência respeita o §0 | ✅ | Asserções 2a–2h — **inclusive o caso cruzado** que a `0063` deixava passar e a `0067` fechou. Mensagens em `acesso.ts`/`erros.ts` |
| 3 | Admin: comportamento de hoje + gestão de usuários de ponta a ponta | ⚠ **parcial** | Banco e código completos (asserções 5a–5g; convite grava papel+vínculos via service role). O ciclo *convidar → aceitar → editar → desativar → reativar* **não foi exercitado** — é o roteiro do §8 |
| 4 | Autoproteção: não rebaixar/desativar a si mesmo; nunca remover o último admin ativo | ✅ (código) | `validarTrocaDePapel`/`validarStatusDeUsuario` como funções puras + 23 testes; contagem de admins **ativos** lida imediatamente antes de gravar. Janela de TOCTOU documentada (§9) |
| 5 | `/admin/**` inteiro inacessível para não-admin (UI + actions + RLS + RPCs de import) | ✅ | `admin/layout` exige admin; todas as actions de `admin.ts`/`senhas.ts`/`kits.ts`/`importar.ts` e o catálogo de `itens.ts` com `exigirAdmin`; asserções 3a/3b/3c/3e/3f/3f-bis/3i |
| 6 | `senhas_acesso` ilegível para não-admin; visualizador por senha segue idêntico | ✅ **e mais forte** | Ilegível para **todos** os cargos, admin incluído (3d e **5f**). Visualizador intocado — smoke 86 OK, e `/relatorios/acesso` segue no primeiro ramo do layout |
| 7 | Pós-backfill, **nenhuma** mudança de comportamento para os usuários atuais | ✅ | 9/9 perfis `admin` com 54 vínculos; smoke do app **antigo** contra o banco **novo**: 86 OK · 0 falha |
| 8 | `lint`, `test`, `build` limpos; `papeis_rls.sql` verde; `database.ts` regenerado; advisors sem WARN novo **de RLS** | ✅ | §6.1 · 47/0 nos dois bancos · tipos regenerados (com o `\| null` do `p_filial` e a coluna gerada restaurados à mão) · `rls_policy_always_true` 12 → **0** |

### Escopo (§Escopo)

Tudo o que a ordem lista em **Dentro** foi feito, mais a `0066` (storage) e a `0067` (correções da revisão). Nada do que ela lista em **Fora** foi tocado — conferido: `senha-sessao.ts`, `/relatorios/acesso` e o cookie de visualização intactos; máquina de estados e imutabilidade preservadas (nenhuma policy nova concede update/delete onde não havia); `0041`/domínios de login intactos; `src/components/ui/**` intocado; templates `.docx` intocados; lógica interna do import intocada (só a guarda no topo, provada por `diff`); **zero dependência nova**; nenhuma migration antiga editada.

---

## 8. Roteiro manual de 5 minutos (o que só o Johnny pode fazer)

Cobre exatamente o que este relatório **não** prova. Faça na ordem.

**Antes:** hoje os 9 usuários de produção são todos `admin` com todas as filiais — nada mudou para ninguém. Você vai criar um cenário de teste e desfazê-lo.

1. **Consulta (1,5 min).** `/admin/usuarios` → **Editar** num usuário de teste (ou convide um) → cargo **Consulta** → Salvar. Entre com ele:
   - a sidebar **não** tem "Administração"; `/admin/usuarios` na barra de endereço **não** abre;
   - `/ativos`, `/movimentacoes`, `/itens`, `/pendencias` e os relatórios **abrem e mostram tudo**;
   - **nenhum** botão de registrar/estornar/anotar/resolver/gerar termo aparece; teclar `N` não leva a nada;
   - **Exportar CSV** continua funcionando (é leitura).
2. **Operador sem a filial (1,5 min).** Mesmo usuário → cargo **Operador** → marque **uma só** filial. Entre com ele:
   - no fluxo de nova movimentação, o select de filial oferece **só** aquela;
   - abra um ativo de **outra** filial e tente anotar/corrigir → mensagem em pt-BR sobre **permissão de escrita nesta filial**, não "faça login novamente".
3. **Desativar (1 min).** Com o operador logado em outra aba, você desativa a conta dele em `/admin/usuarios` → **Desativar**. Na aba dele, **navegue** (não precisa relogar): ele deve cair em `/login` com *"Seu acesso foi desativado. Fale com um administrador."* Depois **Reativar** e confirme que ele volta.
4. **Autoproteção (30 s).** Tente **Editar** o seu próprio usuário (o botão vem desabilitado) e tente **desativar o último admin** — as duas recusas têm de vir com mensagem clara.
5. **Auditoria (30 s).** `/admin/usuarios` → aba **Auditoria**: os eventos dos passos 1–3 têm de estar lá, com quem/quando/o quê.

Ao final, devolva o usuário de teste ao cargo que ele deve ter.

---

## 9. Pendências

1. **`npm run db:seed` contra o ensaio** — escrito e type-checado, nunca executado (o `.env.local` desta máquina aponta para produção e a guarda recusa, corretamente). Precisa das credenciais do ensaio. Ao rodar, confira idempotência: rode **duas vezes** e verifique 6 contas, vínculos `matriz` / `linhares+serra` / vazio, e `eventos_admin` com 6 linhas — não 12.
2. **CI (`gh` não existe nesta máquina)** — o job `banco` aplica `0001`→`0067` num Postgres novo e roda os 13 roteiros. É onde `papeis_rls.sql` roda com `psql` e as linhas `WARNING: ✗` aparecem. **Confira depois do push.**
3. **Ban do Auth não exercitado** — `ban_duration: '876000h'` segue o idioma da doc oficial e os typings de `@supabase/auth-js` 2.110.2, mas nenhuma conta foi realmente banida aqui. O passo 3 do §8 cobre.
4. **TOCTOU da trava do último admin** — a contagem é lida imediatamente antes de gravar; duas sessões admin simultâneas podem, em teoria, remover o último admin. Documentado, não impedido no banco. Se incomodar, o fecho é um trigger de constraint — fase própria.
5. **Ordem das duas metades da desativação** — grava `profiles.ativo` **primeiro** (efeito imediato) e depois o ban; se o ban falhar, a action devolve `ok` + aviso, e a tabela denuncia a divergência nas duas direções. Vale um olhar seu se preferir o contrário.

## 10. Backlog (registrado, fora do escopo desta fase)

- **MFA TOTP opcional para admins** — grátis e habilitado por padrão no Supabase (só o SMS é pago).
- **Política de senha mais forte** no painel de Auth (ex.: 10+ caracteres) e **proteção contra senha vazada**, que o advisor aponta como desabilitada — configuração de painel, sem código.
- **Revisão trimestral de acessos** por `eventos_admin` + lista de usuários ativos, que a tela nova viabiliza.
- **Tirar o `service_role` do caminho do visualizador** — o risco real que a ADR-001 apontou, independente desta fase e ainda de pé.
- **Fechar as duas lacunas residuais por filial que restam** (a terceira, `lancamentos_item.estorna_id`, foi fechada pela `0068` — §5.3), se o Johnny quiser: `anotacoes` e `termos_gerados` são gateadas por **cargo** (é o que a ordem determina, porque a primeira não tem `filial_id` e a segunda pode cruzar filiais). Um OPERADOR conseguiria, por chamada direta à API, anotar ou apagar termo de filial não vinculada — `consulta` não, e o recorte por filial existe na action. O fecho é um `exists (...)` no predicado, com o efeito colateral de proibir termo de lote multi-filial.
- **Unificar a normalização de acentos** (6 cópias no repositório) — dívida herdada, não desta fase.

# F52 — As guardas de escopo no-op

*Ordem de serviço gerada em 08/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco B.*

**Por que ela existe.** Cinco RPCs deste sistema decidem quem pode mexer numa conta **por cargo de quem
chama e por propriedades do alvo — nunca por pertencimento**. `definir_papel_usuario`,
`definir_status_usuario`, `definir_vinculos_usuario`, `apagar_usuario` e `encerrar_sessoes_usuario`
(migration `0074`) perguntam "você é admin?" e "o alvo é dev?", e nada mais. Com uma empresa isso está
certo. Com duas, um admin de qualquer empresa rebaixa, desativa, revincula e **expulsa** contas de
qualquer outra — e a trilha em `eventos_admin` registra o ato sem impedi-lo. As cinco passam pela
**mesma** função (`exigir_gestao_de`, `0074:72`), então **uma condição fecha as cinco**. É o item de
melhor retorno de todo o dossiê, e o custo dele hoje é uma linha.

Ao lado disso, três guardas que o import destrutivo nunca teve: ele é a única das RPCs destrutivas que
ficou de fora da varredura da `0064`, recebe a filial pelo payload, apaga o acervo inteiro dela sem
teto dentro da janela que desarma a `guarda_acervo`, e sua "confirmação digitada" para na Server
Action — a RPC nem a recebe. Mais a guarda de pertencimento na mesa de conflitos, e a régua escrita
para que a próxima `security definer` não nasça sem escopo.

**Por que ela vem AGORA.** A F51 acabou de decompor `importar_ativos_substituir` em oito auxiliares
exatamente para esta fase: a guarda `pode_escrever_filial` no import passou a custar **reemitir 130
linhas** (a orquestradora) em vez de 393, e o `prefixo_backup_import` cabe dentro de
`import_validar_plano`, que tem 90. Fazer as guardas antes teria produzido a cópia nº 12.

**O que esta fase NÃO é.** Não é `empresa_id` em lugar nenhum (F62+). Não é `membros` nem cargo por
empresa (F62). Não é `force row level security` (o plano o proíbe nominalmente aqui). Não é o recorte
de leitura (F57). Não é a tabela `plataforma_admins` (F65). Não é o backup dos `.docx` nem o ensaio de
restauração (F54). **Toda guarda desta fase é escrita de forma que, com uma empresa só, ela não muda
nada** — e "não muda nada" é afirmação que o roteiro tem de provar nos dois sentidos: **recusa o
alheio E aceita o legítimo**.

---

**Vinte e seis fatos de leitura do repositório, medidos em 08/09/2026, que a ficha do plano não tem.**
Estão agrupados pelas quatro frentes. **Refaça cada medição antes de usá-la.**

## Frente A — as guardas de conta (itens 1, 2 da ficha)

1. **A migration desta fase é a `0132`, não a `0131`.** A ficha promete `0131`; a F51 a usou
   (`0131_import_decomposto.sql`). Há **130 arquivos** em `supabase/migrations/`, o último é a `0131`.
   Confira com `ls supabase/migrations | tail -1` antes de escrever a primeira linha.

2. **A `0131` ainda NÃO foi aplicada em produção.** O `CHANGELOG.md:9` marca a F51 como `✅ 🚧`, o
   handoff está em `scratchpad/f51-handoff-apply-0131.sql`, e a pendência declarada é o apply pelo
   caminho B. **No repositório e no CI isso é indiferente** — o `banco-sem-docker` aplica a cadeia
   inteira do zero. **Em produção é ordem obrigatória: `0131` antes de `0132`.** Confira o estado real
   antes de qualquer apply, e se a `0131` estiver pendente, **aplique as duas na ordem, ou nenhuma**.

3. **`exigir_gestao_de` JÁ EXISTE — e isso torna o item 1 mais barato do que a ficha diz.** Ela nasce
   em `0074:72` (`(p_alvo uuid, p_papel_pedido public.papel_usuario default null) returns void`,
   `plpgsql`, `stable`, `security definer`, `set search_path = public`), tem quatro checagens em
   ordem (sessão · autoproteção · alvo existe · dev ⊃ admin) e é chamada por `perform` nas cinco RPCs:
   `0074:162, 206, 251, 304, 371`. **O item 1 não cria a guarda comum: insere uma linha dentro dela.**
   O que **não** existe é `mesmo_escopo_de_gestao` (zero ocorrências em `supabase/`, `src/`,
   `scripts/`; os dois únicos hits do repositório são o próprio plano).

4. **As duas auxiliares da `0074` tiveram o `execute` de `authenticated` REVOGADO na `0078:32-33`.**
   Hoje só o dono as executa, e é por isso que a asserção `5e` de `cargo_dev.sql:465-471` roda como
   `postgres` e as confere **nominalmente**. `mesmo_escopo_de_gestao` tem de nascer com o mesmo
   tratamento — senão viola a doutrina da `0078` **e** a `5e` reprova.

5. **`existe_outro_admin_ativo` não tem parâmetro ignorado.** A ficha diz que ela "ganha o parâmetro de
   escopo (hoje ignorado)"; medido, o único parâmetro é `p_excluindo uuid` e ele **é usado**
   (`0074:139`, `p.id <> p_excluindo`). O parâmetro de escopo é **novo**, e nasce no-op.

6. **Há TRÊS contadores do mesmo fato, não um — e o repositório já escreveu que eles têm de concordar.**
   (a) a função SQL `existe_outro_admin_ativo` (`0074:126`), chamada em `0074:176`, `:220` e `:319`;
   (b) o espelho em TS `existeOutroAdminAtivo(alvoId, adminsAtivosIds)` em
   `src/lib/validators/admin.ts:179-181`, consumido em `:205`, `:231`, `:260`;
   (c) a leitura que o alimenta, `idsDeAdminsAtivos()` em `src/lib/queries/admin.ts:206-215`, que lê
   `profiles` **pelo service role** e falha fechada.
   O comentário de `queries/admin.ts:202-205` diz, por escrito, que as três camadas precisam contar o
   **mesmo conjunto**. Escopo que entre só no SQL cria exatamente a divergência que aquele comentário
   previu.

7. **`plataforma_admins` não existe.** Zero ocorrências em `supabase/`, `src/`, `scripts/`; nenhuma
   noção de super-admin. O item 2 manda "decidir e escrever no roteiro como a conta de plataforma entra
   nessa conta" — e essa conta **não tem representação no schema hoje**. O mais próximo é o cargo
   `dev`, e o próprio plano (`:697`) diz que `plataforma_admins` "é o que o cargo `dev` já faz, mas
   passa a estar declarado". É a **Decisão 2**.

8. **Sete asserções negativas das cinco RPCs em `cargo_dev.sql` são cegas.** `2a` (`:306`), `2b`
   (`:315`), `2c` (`:324`), `2d` (`:333`), `2e` (`:342`), `2f` (`:351`), `2f-bis` (`:360`) — e `5a`,
   `5b`, `5c` (`:602`, `:611`, `:620`) — todas terminam em
   `exception when others then v_ok := v_ok + 1`, **sem olhar `sqlstate` nem `sqlerrm`**. Quem hoje as
   protege são os pares positivos (`2g-bis`, `3a`, `3b`, `3c`, `3d`, `6a`).
   **E há um buraco nomeável: `definir_vinculos_usuario` aparece UMA vez no roteiro inteiro** —
   `cargo_dev.sql:343`, cenário `2e`, negativo e cego. **Não existe par positivo para ela.** Dropada,
   renomeada ou com aridade mudada, o roteiro continuaria verde. É a RPC em que a guarda nova nasce com
   a menor rede embaixo, e cobri-la com par positivo é entrega desta fase.

9. **O achado que a F51 deixou de graça.** `cargo_dev.sql:242` (`1d`) e `papeis_rls.sql:963` (`3i`)
   chamam `importar_ativos_substituir` com **quatro argumentos posicionais** dentro de um
   `exception when others` cujo ramo final conta **✓ para qualquer erro** — inclusive
   `42883 function does not exist`. Em `3i` os **dois** ramos contam ✓, então o `if` é decorativo. Se
   a assinatura mudar, as duas ficam **verdes por engano**. A F51 não as fortaleceu de propósito
   (fortalecer asserção alheia no meio da única prova de equivalência da fase teria sido trocar a rede
   por uma opinião) e as passou **nomeadamente** para esta fase.

## Frente B — o endurecimento do import (itens 3, 5, 6, 7 da ficha)

10. **A ordem exata da orquestradora, medida na `0131:686-815`** (130 linhas de definição, 103 de
    corpo): `auth.uid()` → `e_admin()` (`:732`) → **filial resolvida** (`:738`,
    `(p_plano->>'filialId')::smallint`, com checagem de existência e de `ativo` em `:739-745`) →
    **`pg_advisory_xact_lock`** (`:750`) → `import_validar_plano` (`:753`) → `import_revalidar_contagens`
    (`:756`) → **janela `estoque.dev_destrutivo` aberta em `:766` e fechada em `:771`**, envolvendo só
    `import_apagar_acervo_filial` → laço por ativo → `import_conferir_resultado` →
    `import_contar_conflitos` → `import_gravar_trilha` → retorno de 8 chaves.
    **O lugar de `pode_escrever_filial(v_filial)` é entre `:745` e `:750`** — depois de resolver a
    filial, **antes** do lock, como a ficha manda.

11. **A guarda `pode_escrever_filial` é no-op no import por construção, e o motivo tem de estar
    escrito.** A autorização do import é `e_admin()`, e nível administrador escreve em toda filial
    (`0072:123` a função; `:141-142` o `if v_papel in ('dev', 'admin') then return true`). A guarda entra **em conjunção** com
    o `e_admin()`, **nunca no lugar dele** — o valor dela é estrutural: é o gancho onde o recorte de
    tenant desce na F66. Escrita como substituta, ela **afrouxaria** a autorização.

12. **A guarda de backup de hoje é `coalesce(btrim(p_backup_path), '') = ''`**, em `0131:134-136`
    (o comentário `-- 1b. backup obrigatório` na `:133`), primeiro bloco de `import_validar_plano`,
    **sem `using errcode`** (cai no `P0001` default, ao
    contrário de `resetar_acervo`/conflitos, que usam `22023`). E `import_validar_plano` **recebe
    `p_filial`** e nunca o confronta com `p_backup_path` — nada amarra o backup ao recorte.

13. **`prefixo_backup_import` não existe; os dois moldes existem, e são diferentes entre si.**
    `prefixo_backup_reset(p_bloco text, p_filial smallint)` vive em `0089:50` e devolve
    `'reset/'||bloco||'/'||(global|filial-N)||'/'` — **por ID, não por slug**, que é exatamente o molde
    que a ficha quer. `prefixo_backup_conflito()` vive em `0093:68` e devolve `'conflito/'`. As duas
    são `language sql`, `immutable`, `set search_path = public`, com
    `revoke all … from public, anon, authenticated, service_role`. **A cascata de três guardas está
    escrita duas vezes**: `0089:116-133` (reset) e `0100:266-288` (conflito, com digest — não-vazio
    `:267-270` · prefixo+digest `:276-280` · existência em `storage.objects` `:281-287`). Copie a
    cascata; não invente uma quarta forma.

14. **`importar.ts:395` grava o backup por SLUG e com `upsert:false`.** Literalmente
    `` const backupPath = `${filial.slug}/${timestampArquivo()}.json` `` e
    `.upload(backupPath, corpo, { contentType: 'application/json', upsert: false })` (`:406-408`). É o
    par exato que a ficha aponta: o slug colide quando deixar de ser único global, e com `upsert:false`
    o segundo import falha por causa do primeiro. Sem prefixo, hoje **o backup de qualquer filial passa
    na guarda**.

15. **`erros.ts:233` já sequestra a frase — e a defesa não é a que o próprio arquivo diz que é.**
    O ramo `m.includes('backup informado não existe')` (`:233`) devolve *"O backup **deste reset** não
    foi encontrado…"*. A F24 já pagou por isso e escolheu a frase distinta *"backup **dos conflitos**
    não existe"* — mas, medido, o ramo da mesa está em **`:263`, DEPOIS** do de reset. **É a frase, não
    a posição, que impede o sequestro**, e o comentário de `erros.ts:260-262` afirma que ele "Vem ANTES
    do ramo de backup do RESET": **isso é falso no arquivo de hoje**. É um TERCEIRO comentário que
    mente, e ele sai junto com os outros dois no item 8 da ficha. Consequência para a fase: a exceção
    nova do import precisa de **frase própria que não case com `'backup informado não existe'`**; ordem
    física só importa se as strings se sobrepuserem — e nesse caso a ordem é obrigatória, não uma
    preferência.

16. **A confirmação digitada do import é o NOME DA FILIAL — não "SUBSTITUIR".** `importar.ts:348-354`:
    `if (confirmacaoTexto !== filial.nome)`, **igualdade exata, sem trim e sem caixa**. O wizard
    (`src/components/admin/importar/importar-wizard.tsx:271-281`) documenta isso e diz com todas as
    letras que *"a RPC `importar_ativos_substituir` nem repete essa checagem, ela é só da Server
    Action"*. Contraste medido: `apagar_ativos_conflito_filiais` normaliza com `upper(btrim(…))`
    (`0100:171`), e `resetar_acervo` idem. **A "função gêmea da TS" que a ficha pede é, aqui, a regra de
    NORMALIZAÇÃO** — e escolher `upper(btrim())` no banco enquanto a action exige igualdade exata cria
    duas réguas para a mesma pergunta.

17. **⚠ Acrescentar `p_confirmacao text default null` NÃO é `create or replace` puro — é OVERLOAD.**
    A ficha afirma o contrário ("com default: mantém `create or replace` puro e sobrevive a deploy fora
    de ordem"), e é **medível que não**. A nota de `CREATE FUNCTION` na doc do PostgreSQL diz, sobre o
    `OR REPLACE`, que *"you cannot change the name or argument types of a function this way (if you
    tried, you would actually be creating a new, distinct function)"* — **confira na doc oficial vigente
    antes de decidir**, que é a regra permanente 6 do `CLAUDE.md`. Na prática: a
    `importar_ativos_substituir(jsonb,text,jsonb,jsonb)` **continua existindo** e nasce uma segunda de
    cinco argumentos. As consequências em cadeia, todas medidas:
    - `catalogo_secdef.sql` asserção **2** ("nenhum overload escondido") **reprova**;
    - `seguranca_catalogo.sql:94` tem a assinatura de 4 argumentos **hard-coded como string** e o
      `to_regprocedure` continuaria resolvendo — a asserção 1 passaria **verde sobre a função errada**;
    - o bloco de verificação pós-apply do `RUNBOOK-BANCO.md:61-73` espera "EXATAMENTE 1 linha, 4 args";
    - chamadas de quatro argumentos passam a poder ser ambíguas, e `cargo_dev.sql:242` /
      `papeis_rls.sql:963` fazem exatamente isso.
    É a **Decisão 3**, e ela tem três saídas nomeadas — inclusive uma que preserva a assinatura byte a
    byte.

18. **`arquivo_hash` é write-only, e não tem índice.** Nasce em `0031:29` (`text not null`, com o
    comentário inline `-- hash do CSV (idempotência/rastreio)` e **sem `comment on column`** — as duas
    colunas acrescentadas depois têm). É escrita em **12** migrations (a última em `0131:656`, a coluna, e `:661`, o
    valor `coalesce(p_plano->>'arquivoHash', '')`, dentro de `import_gravar_trilha`) e em `importar.ts:484`, no
    `detalhe` do `eventos_admin`. **Lida em lugar nenhum**: `src/lib/queries/import-logs.ts:294` lista
    as colunas uma a uma e não a inclui — com o aviso escrito logo acima (`:291-293`) de que *"coluna nova
    que não entre nesta string simplesmente não chega ao histórico, e o TypeScript não avisa"*. Índices
    de `import_logs`: só `(filial_id, created_at desc)` e `(created_at desc)` (`0031:40-41`).

19. **TRÊS comentários que mentem, medidos — a ficha nomeia dois.** (a)
    `comment on column public.eventos_admin.detalhe` (`0065:47-48`) descreve só metadado e proíbe "hash
    de senha, token ou chave" — e desde a F23 a coluna guarda **backups jsonb do acervo apagado**, e
    `importar.ts:484` grava o `arquivo_hash` ali. (b) `importar.ts:35-36` diz *"O conteúdo do CSV nunca
    é persistido nem logado: só o hash viaja no plano"*, enquanto `import_logs.correcoes` guarda
    valores **crus de célula** desde a `0033` (com `comment on column` próprio dizendo isso).
    (c) o terceiro, achado nesta medição: `erros.ts:260-262` diz que o ramo da mesa de conflitos "Vem
    ANTES do ramo de backup do RESET", e ele está na `:263`, **depois** do da `:233` (ver o fato 15).

## Frente C — a mesa de conflitos (item 4 da ficha)

20. **A ordem real da `apagar_ativos_conflito_filiais` não é a que a ficha supõe.** Corpo vivo em
    `0100:109-381` — **273 linhas**, assinatura `(uuid[], text, text, text default null) returns jsonb`.
    Sequência medida: auth → `e_admin()` → **justificativa** (`:152`) → dedup e teto de 200 → **confirmação
    `APAGAR <N>`** (`:170-174`) → existência dos ids → **`pg_advisory_xact_lock`** (`:194`) → **lock em
    TRÊS etapas** (`:199-202` selecionados por id · `:205-210` lê as chaves sob trava · `:214-221` trava
    o resto do grupo) → **revalidação do grupo** → guarda do termo de lote misto → **backup** (`:264-288`
    a cascata, `:275` o `digest_selecao_conflito`, `:290-320` a montagem do jsonb) → deletes na janela
    GUC (`:322-348`) → **trilha na mesma transação**
    (`:350`). O ponto de inserção de `exigir_ativos_da_empresa` é **entre o fim da etapa 3 e a
    revalidação**, fora da janela. `exigir_ativos_da_empresa` **não existe** (dois hits, ambos no
    plano).

21. **"A ordem dos locks já foi ajustada duas vezes por deadlock" está meio errado, e a metade errada
    importa.** Medido nos cabeçalhos: a primeira mudança (`0098:6-25`) foi por **TOCTOU** — travar por
    id antes de ler as chaves — **e foi ela que criou o deadlock**; a segunda (`0100:8-36`) foi o
    conserto, serializando com `pg_advisory_xact_lock`. Consequência para esta fase, em três frases:
    (a) **nunca** mover guarda nova para antes da `:194`; (b) **nunca** "simplificar" as três etapas de
    volta a um statement só sem reintroduzir a ordem total; (c) guarda que faça leitura própria de
    `ativos` roda **depois** da etapa 3, senão volta a ler fora de trava — o defeito exato que a `0098`
    corrigiu. O `order by a.id` das etapas **já não basta por construção**; o advisory lock é a única
    coisa que impede o `40P01` hoje, e `40P01` não tem ramo em `erros.ts`.

22. **`conflito_filiais.sql` tem duas armadilhas escritas.** (a) `DECISOES.md:6124-6128` (ata F36 de 28/08/2026, que abre na `:6108`) registra que
    ele **falha contra produção por artefato de ambiente** — espera 4 grupos de conflito e o acervo real
    tem 76; só passa em banco limpo. (b) O cabeçalho (`:16-24`) **evita de propósito** `DELETE` direto
    nas tabelas do acervo, para que o roteiro possa rodar por MCP sem esbarrar no gate do modo
    automático. Cenário novo escrito com literal de exclusão torna o roteiro inexecutável por MCP. Ele
    tem **642 linhas e 37 asserções**.

## Frente D — o rig, a régua e o fechamento

23. **⚠ O teto do injetor está a UMA vaga de estourar, e as duas entradas da quarentena nomeiam esta
    fase.** Medido: `scripts/db/mutacoes.mjs` exporta **47 mutações ATIVAS** e **2 em QUARENTENA**, as
    duas com `fase: 'F52'`; `scripts/db/mutacoes.test.mts` afirma "tem entre 20 e **48** mutações
    ATIVAS". Promover as duas põe o lote em **49** e o `npm run test` **reprova**. E elas não são
    "asserção fraca": são **cenário que não existe** — `conflito-serializacao-por-advisory-lock` exige
    uma **segunda conexão**, e `conflito-backup-em-arquivo-sem-prefixo-do-digest` exige um cenário com
    **26 ativos**. O convênio da casa (`begin; … rollback;` num psql só) **não abre segunda conexão**:
    o cenário de concorrência não é escrevível como roteiro — ou vira harness em Node com dois `psql`
    (é o que `run-mutation-tests.mjs` já faz), ou a entrada é reapontada com o motivo escrito. É a
    **Decisão 6**. Cada mutação nova desta fase soma por cima disso.

24. **`k_secdef` tem 46 nomes hoje, não 37.** `supabase/tests/catalogo_secdef.sql` foi atualizado pela
    F51 (`38 → 46`: a `0129` trouxe `pode_ler_arquivo_termo` e a F51 as oito auxiliares do import) e
    confere nos **dois sentidos** — `1a` catálogo→lista, `1b` lista→catálogo. **Toda função nova desta
    fase entra na lista no MESMO commit**, ou o `banco-sem-docker` fica vermelho por construção.

25. **A trava `definer_sem_tenant.sql` que a ficha desenha envelheceu junto com o inventário.** Ela
    nomeia exceções para "funções-gatilho (`aplicar_movimentacao`, `handle_new_user`,
    `colaborador_chave`)" — e **`colaborador_chave` não está em `k_secdef`** — e para "as 7 `rel_*`,
    que são `security invoker`", que por serem invoker ficam fora de uma enumeração de `prosecdef` de
    qualquer jeito. Enquanto isso, **as oito auxiliares do import SÃO `security definer` e recebem
    `p_filial`/`p_plano` do chamador** — a classe exata que a trava mira. A saída que o próprio
    repositório já ensina é a doutrina da F48 (*"os catálogos são DERIVADOS, não listas que afirmam"*):
    classificar por **alcance** (`has_function_privilege('authenticated', …, 'execute')`), não por lista
    de nomes escrita à mão. As oito são fechadas nos quatro papéis, e a asserção `0e` de
    `import_substituir.sql` já prova isso lendo o ACL real. É a **Decisão 5**.

26. **A régua sobre `security definer` não existe no RUNBOOK, e há um lugar certo para ela.**
    `grep -i "régua\|checklist"` em `docs/RUNBOOK-BANCO.md` devolve **zero**; as **cinco** menções à
    expressão exata (dez, contando `definer=true` e
    `authenticated_security_definer_function_executable`) estão todas no **Anexo A**, a partir da
    `:382` — histórico de apply, nunca regra prospectiva. O único bloco com forma de régua é *"Três
    exigências que não se negociam"* (`:88-92`). A régua nova é regra de **escrita de migration**, não
    de apply nem de rollback — o lugar é **seção própria entre `## Aplicar uma migration` (`:49`) e
    `## Rollback` (`:77`), depois da `:75`**, que é o passo 7 (o smoke) do caminho B. Não cabe em
    *Armadilhas* (retrospectivas, "já aconteceram") nem em *Escalada* (sobre parar).

**Mais três fatos de fechamento:** a versão desta fase é **1.57.0** (fase = MINOR sobre 1.56.0), e
`cobertura-changelog.test.ts` decide **por CONTAGEM por data** — se a F52 fechar em 08/09, dia da F51,
ela precisa de uma **segunda** versão com a mesma data. A matriz começa em **R-ACC-49** (a última é
R-ACC-48). E **a F52 é caminho B por construção**: ela recria `importar_ativos_substituir` **e**
`apagar_ativos_conflito_filiais`, as duas com `delete from public.ativos` no corpo, e o gate do modo
automático (`RUNBOOK-BANCO.md:43-47`) bloqueia DDL com essa string em qualquer projeto — o próprio
plano já a classifica **B** (`:1184`).

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Pôr dentro do Postgres as guardas de PERTENCIMENTO que hoje não existem, todas escritas de forma que,
com uma empresa só, NÃO MUDAM NADA. Ao final: a migration `0132` traz `mesmo_escopo_de_gestao` (no-op
hoje) chamada de dentro de `exigir_gestao_de`, protegendo as CINCO RPCs de conta da `0074` com uma
condição; `existe_outro_admin_ativo` com o parâmetro de escopo; `pode_escrever_filial(v_filial)` no
import, em conjunção com o `e_admin()` e antes do advisory lock; `exigir_ativos_da_empresa(uuid[])`
extraída e chamada por `apagar_ativos_conflito_filiais` depois do lock em três etapas;
`prefixo_backup_import(p_filial)` no molde por ID de `prefixo_backup_reset`, com a cascata de três
guardas (não-vazio · prefixo · existência em `storage.objects`) e a Server Action gravando por **id**,
não por slug; a confirmação digitada conferida DENTRO da RPC do import; e a idempotência por
`arquivo_hash` (janela de 24 h por filial, com mensagem própria). Mais: `supabase/tests/definer_sem_tenant.sql`
como trava; `import_fora_da_unidade.sql` novo; `cargo_dev.sql`, `import_substituir.sql` e
`conflito_filiais.sql` estendidos, cada guarda com o par **recusa o alheio / ACEITA o legítimo**; os dois
comentários que mentem corrigidos; e a régua da `security definer` escrita no `RUNBOOK-BANCO.md`.
Versão **1.57.0** com tag publicada; PR mergeado com `verificar` e `banco-sem-docker` verdes.
**Comportamento com a WAP IDÊNTICO. Nenhum `empresa_id`, nenhuma tabela nova de tenant, nenhum
`force row level security`, nenhuma dependência nova, nenhum recorte de leitura.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo e as regras permanentes. Pesam aqui a **1** (escopo da ordem
  atual — esta fase tem F54, F57, F62 e F65 encostadas nela), a **2** (NUNCA dados reais: fixtures
  `WAP0009xxx`, e-mails de fantasia), a **3** (custo R$ 0, stack FECHADA), a **5** (produção com
  autoproteção), a **6** (confira a doc oficial atual antes de escrever integração) e a **8** (versão,
  sem exceção). Leia com atenção redobrada o parágrafo do **modelo de acesso**: ele descreve, uma por
  uma, as cinco RPCs que esta fase protege, e a frase sobre `e_admin()` significar "nível
  administrador" é o que faz as guardas herdarem o dev sem serem reescritas.
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns — em especial a **2**, estado
  de repouso; a **3**, escopo fora explícito; a **4**, trava antes da correção; a **5**, no-op primeiro;
  e a **10**, toda fase que toca banco declara a ORDEM de rollback), **§5 → F52** (a ficha completa) e
  depois **§5 → F54** e **§5 → F65**, não para fazer, mas para saber o que **não** é seu: o backup dos
  `.docx` e o ensaio de restauração são F54; `plataforma_admins`, `membros` e o corpo das guardas são
  F65/F62.
  ⚠ **A ficha da F52 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem, vale a
  ficha — exceto onde este prompt traz uma MEDIÇÃO contra o disco de hoje; aí vale a medição, e ela vai
  para o relatório com a divergência explicada.
- `@supabase/migrations/0074_rpcs_gestao_usuarios.sql` — INTEIRA, com os comentários. É o coração da
  Frente A: `exigir_gestao_de` (:72), `existe_outro_admin_ativo` (:126) e as cinco RPCs.
  `@supabase/migrations/0078_gestao_helpers_internos.sql` — o revoke que define como uma auxiliar de
  gestão nasce. `@supabase/migrations/0073_dev_intocavel_e_arquivamento.sql` — o trigger `profiles_guarda_dev`
  (`:161` a função, `:223` o trigger) e a janela `estoque.gestao_usuarios` (`:168`).
- `@supabase/migrations/0131_import_decomposto.sql` — a orquestradora (:686) e `import_validar_plano`
  (:119). É onde entram três das guardas. **Não copie o corpo para lugar nenhum: leia-o do arquivo.**
- `@supabase/migrations/0089_reset_backup_do_recorte.sql` (:44-64 o molde do prefixo, :116-133 a cascata
  de três guardas) e `@supabase/migrations/0093_apagar_conflito_filiais.sql` (:68 o outro molde).
- `@supabase/migrations/0098_conflito_revisao.sql` e `@supabase/migrations/0100_conflito_lock_e_backup.sql`
  — os CABEÇALHOS inteiros antes do corpo. São eles que explicam por que a ordem dos locks é o que é, e
  ler o corpo sem ler o cabeçalho é como esta fase reintroduz um deadlock.
- `@docs/RUNBOOK-BANCO.md`, nesta ordem: **"O caminho, em 30 segundos"** (~21), **"O gate do modo
  automático"** (~43), **"Aplicar uma migration" A e B** (~49), **"Rollback — a regra geral"** (~77),
  **"Roteiros de teste SQL — rode TODOS ao mexer em função/trigger"** (~94), a **"Sonda de paridade
  ensaio × produção"** (~133) — é ela, e não o `md5` cru, que compara ambientes — e a **trava de hash**
  (~231) com o *"Quem acrescenta migration atualiza DUAS listas"*.
- `@supabase/tests/cargo_dev.sql`, `@supabase/tests/import_substituir.sql`,
  `@supabase/tests/conflito_filiais.sql`, `@supabase/tests/catalogo_secdef.sql`,
  `@supabase/tests/seguranca_catalogo.sql` e `@supabase/tests/_asserts.sql` — o rig que esta fase
  estende. `_asserts.sql` primeiro: `pg_temp.assert_zero_de` RECUSA universo vazio, e é a forma que a
  casa usa desde a F45.
- `@scripts/db/mutacoes.mjs` (o cabeçalho, que diz por escrito que a F52 mexe **aqui** e não no motor; a
  família `CARGO_DEV` ~:421; a `IMPORT_SUBSTITUIR` ~:670; a `QUARENTENA` no fim, com as DUAS entradas
  marcadas `fase: 'F52'`), `@scripts/db/mutacoes.test.mts` (o teto e os motivos escritos) e
  `@scripts/db/corpo-vigente.mjs` (o contrato de `trocarNoCorpo`).
- `@docs/prompts/F51-decomposicao-da-rpc-de-import-ultracode.md` e `@docs/RELATORIO-F51.md` — o padrão
  de ordem e de relatório da casa, e o backlog §10, que é o insumo direto desta fase.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Os vinte e seis fatos medidos estão no cabeçalho desta ordem, fora do bloco do prompt. Releia-os e
**refaça cada medição**: o número da última migration, o estado de apply da `0131`, a existência de
`exigir_gestao_de`, os três contadores de "outro admin ativo", as sete asserções cegas, os 46 nomes de
`k_secdef`, as 47 mutações ativas contra o teto de 48, a ordem dos locks da `0100`. Onde a sua medição
divergir da minha, **a sua ganha** — desde que ela esteja no relatório com a divergência explicada.

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste`
- `npm run db:test` · `npm run db:test:um <roteiro>` · `npm run db:test:mutations` · `npm run db:types:diff`
- `npm run db:lock` — **obrigatório** nesta fase: ela ACRESCENTA a `0132`. Mesmo commit da migration.
- `npm run db:types` — só depois do apply; se o apply não acontecer, o hand-fix comentado e datado, com
  a pendência declarada (precedente da F51).
- `npm run verificar:actions` · `node scripts/smoke/smoke-prod.mjs`
- `gh run watch` / `gh run view --log-failed` — o `gh` EXISTE nesta máquina (F45 §15); pode não estar no
  PATH da sessão. *"Comando não encontrado" é hipótese, não conclusão.*

# Escopo

## Dentro — quatro frentes, nesta ordem

### Frente A — as guardas de conta (a de melhor retorno; faça primeiro)
- **`mesmo_escopo_de_gestao(p_alvo uuid) returns boolean`**, devolvendo `true` hoje, chamada de dentro
  de `exigir_gestao_de` com
  `raise exception 'Este usuário não pertence à sua organização.' using errcode = '42501'`. **Uma
  condição protege as cinco RPCs.** Ela nasce com o mesmo tratamento de privilégio das duas auxiliares
  irmãs (`0078`: sem `execute` para `authenticated`) — senão a asserção `5e` de `cargo_dev.sql` reprova
  e a doutrina da `0078` é violada no mesmo commit. Onde exatamente dentro de `exigir_gestao_de` é a
  **Decisão 1**.
- **`existe_outro_admin_ativo` ganha o parâmetro de escopo**, hoje ignorado por construção. Decida e
  **escreva no roteiro** como a conta de plataforma entra nessa conta — sabendo que ela **não existe no
  schema hoje** (Decisão 2). ⚠ O risco que o próprio plano nomeia: escopo nulo faz a comparação virar
  NULL e a RPC passar a **recusar tudo**, trocando um defeito silencioso por um travamento barulhento.
  Escreva a função de forma que isso não possa acontecer, e prove com asserção.
- **Os TRÊS contadores têm de continuar contando o mesmo conjunto.** O SQL (`0074:126`), o espelho TS
  (`validators/admin.ts:179-181`) e a leitura que o alimenta (`queries/admin.ts:206-215`, por service
  role). O comentário de `queries/admin.ts:202-205` já diz isso por escrito. Se o escopo entrar só num
  lado, registre por quê e como a divergência será fechada na F65.
- **Feche os buracos do roteiro que esta guarda expõe.** Par positivo para
  `definir_vinculos_usuario` (hoje ela aparece UMA vez, no `2e`, negativo e cego). E `cargo_dev.sql:242`
  (`1d`) e `papeis_rls.sql:963` (`3i`) passam a distinguir `42883`/`42P01` de "recusado pela guarda" —
  é o backlog nomeado que a F51 deixou. **Fortalecer asserção não é afrouxar: nenhuma delas pode passar
  a exigir menos do que exigia.**

### Frente B — o endurecimento do import
- **`pode_escrever_filial(v_filial)` na orquestradora**, entre a resolução da filial e o
  `pg_advisory_xact_lock`, **em conjunção com o `e_admin()` e nunca no lugar dele**. Com nível
  administrador ela é `true` hoje — escreva o motivo no cabeçalho da migration, para que ninguém a
  "simplifique" depois por parecer redundante.
- **`prefixo_backup_import(p_filial smallint)`** devolvendo `'import/filial-' || p_filial || '/'`, no
  molde EXATO de `prefixo_backup_reset` (`immutable`, `set search_path`, revogada dos quatro papéis).
  `import_validar_plano` passa a fazer a **cascata de três**: não-vazio (já existe) · prefixo · exists
  em `storage.objects`, com `using errcode = '22023'` como as irmãs. `actions/importar.ts` grava por
  **id**, não por slug. **Mensagem própria** para a exceção nova, e o ramo em `src/lib/actions/erros.ts`
  com **frase que não case** com o `'backup informado não existe'` da `:233` — se as strings se
  sobrepuserem, a ordem física passa a ser obrigatória, e aí o ramo novo vai antes.
- **A confirmação digitada dentro da RPC.** É a **Decisão 3**, e a saída escolhida tem de preservar (ou
  atualizar, no mesmo commit) `seguranca_catalogo.sql:94` e o bloco de verificação pós-apply do runbook.
  Qualquer que seja a saída, a **regra de normalização** é uma só nos dois lados, provada por teste que
  mostre as duas produzindo o mesmo veredito (a lição que a `0100` aprendeu à força com o digest).
- **Idempotência por `arquivo_hash`.** Bloqueio de 24 h por filial, com **mensagem própria**, não
  permanente — reimport legítimo após correção precisa passar. Hoje dois applies do mesmo arquivo
  passam, e o segundo apaga tudo que o primeiro criou, com uuids novos e os termos destruídos. Onde a
  janela é conferida, o índice e se a coluna entra na string de `queries/import-logs.ts:294` são a
  **Decisão 7**.
- **Os comentários que mentem, corrigidos**: `comment on column public.eventos_admin.detalhe`
  (`0065:47`), `src/lib/actions/importar.ts:35-36` e o terceiro que esta medição achou,
  `erros.ts:260-262` (que afirma uma ordem de ramos que o arquivo não tem). Corrigir o texto — ou, no
  caso do terceiro, o texto **ou** a ordem; escolher em silêncio é que não.

### Frente C — a mesa de conflitos
- **`exigir_ativos_da_empresa(uuid[])` extraída como função reusável** e chamada por
  `apagar_ativos_conflito_filiais` — **depois** do `pg_advisory_xact_lock` (`0100:194`) e **depois** da
  terceira etapa do lock (`0100:214-221`), fora da janela `estoque.dev_destrutivo`. Extrair em vez de
  inline porque a RPC é recriada em cadeia (`0093` → `0098` → `0100`) e a guarda inline se perde na
  próxima recriação. É a **Decisão 4**.
- ⚠ **Leia os cabeçalhos da `0098` e da `0100` ANTES de tocar no corpo.** O `order by a.id` das etapas
  já não basta por construção; o advisory lock é a única coisa que impede o `40P01` hoje, e `40P01`
  não tem ramo em `erros.ts` — chega ao administrador como erro genérico, num botão destrutivo.

### Frente D — a trava, a régua e o rig
- **`supabase/tests/definer_sem_tenant.sql`** — a trava desta fase. Enumera `pg_proc where prosecdef`
  em `public` e reprova função que receba id do cliente sem conferir escopo antes de qualquer efeito,
  **por função NOMEADA e não pelo prefixo `exigir_`** (as cinco RPCs de conta citam `exigir_gestao_de`
  e passariam verdes por um critério de prefixo). O filtro inclui parâmetro **`text`**
  (`p_backup_path`, `pode_escrever_arquivo_termo(p_nome text)`), não só `uuid`/`smallint`. A FORMA — lista
  de nomes ou classificação DERIVADA por alcance — é a **Decisão 5**; qualquer exceção é **nominal, com
  motivo escrito e a migration que a criou na mesma linha**, que é o que
  `src/lib/validators/catalogos-seguranca.test.ts` já cobra dos catálogos da F48.
- **A régua no `RUNBOOK-BANCO.md`**, em seção própria entre "Aplicar uma migration" e "Rollback", na
  forma numerada de "Três exigências que não se negociam": toda `security definer` que receba id do
  cliente confere escopo ANTES de qualquer efeito.
- **`supabase/tests/import_fora_da_unidade.sql`** novo, e `cargo_dev.sql`, `import_substituir.sql` e
  `conflito_filiais.sql` estendidos. **Cada guarda nova tem o PAR: recusa o alheio E aceita o
  legítimo.** Uma guarda no-op que só tenha o lado "recusa" não prova que é no-op — prova o contrário.
  Roteiro que escreve fixture vai dentro de `begin; … rollback;`; use `pg_temp.assert_zero_de` onde a
  contagem puder ser sobre conjunto vazio.
- **O injetor**: uma mutação nova por guarda (remova a guarda, o cenário NOMEADO cai), com sonda
  `prova` que mire a função certa. As duas entradas da quarentena que nomeiam esta fase são a
  **Decisão 6**. Se o teto de 48 subir, **escreva por quê no próprio teste** — é o ritual que o
  comentário de `mutacoes.test.mts` institui, e ele já antecipa esta fase nominalmente.
- **`catalogo_secdef.sql`** ganha as funções novas na `k_secdef`, **no mesmo commit** (a asserção
  confere nos dois sentidos). **`seguranca_catalogo.sql`** revisto se a Decisão 3 mudar assinatura.

### Fechamento
- `docs/MATRIZ-REGRAS.md` com as regras novas a partir de **R-ACC-49**, cada uma com localização e
  prova. `docs/DECISOES.md` com uma ata por decisão (data · contexto · escolha · motivo).
  `docs/PLAN-F52.md` antes de implementar. `docs/RELATORIO-F52.md` ao final. `docs/prompts/README.md` e
  `README.md` atualizados. Versão **1.57.0**: bump no `package.json`, entrada no topo de
  `src/lib/versoes/registry.ts` (2 a 6 mudanças em **linguagem de operador**), entrada no
  `CHANGELOG.md`, tag anotada `v1.57.0` publicada.

## Fora — não toque
- **Nenhum `empresa_id`**, nenhuma tabela `empresas` ou `membros`, nenhuma `plataforma_admins`. São
  F62/F63/F65. `src/lib/validators/catalogos-seguranca.test.ts` PROÍBE `empresa_id` no código de
  `isolamento_tenant.sql` até lá — a proibição continua valendo.
- **Nenhum `force row level security`** (a ficha o exclui nominalmente).
- **Nada da F54:** não toque no backup dos `.docx`, em `exportarAcervoFilial`, em `urlBackup`, em
  `listarImportLogs`, em `scripts/db/restaurar.mjs` (que não existe) nem na checagem 12. O `prefixo_backup_import`
  desta fase é o insumo da F54, não a F54.
- **Nada da F57:** não toque em `src/lib/filtros/filial.ts` nem na convenção `[] = sem recorte`.
- **Nada da F53:** não crie `movimentacoes.ordem`, não mexa no desempate de `rel_estoque_asof`.
- **Nenhuma migration histórica editada.** Alteração = migration nova. `migrations-lock.test.ts` reprova
  e reprovar é o comportamento certo.
- **Nenhuma dependência nova**, nenhum serviço pago, nenhuma lib de hash (o `crypto.scrypt` nativo
  continua sendo a regra). Nenhum console de SQL, nenhuma função que receba SQL/tabela/coluna como
  parâmetro.
- **Nenhum dado real** em fixture, seed, teste, comentário ou evidência. Patrimônios `WAP0009xxx`,
  e-mails de fantasia, nomes inventados.
- **Nenhum bug encontrado no caminho é consertado aqui** fora das guardas nomeadas: vai para o backlog
  do relatório, com localização.

# Critérios de aceitação
1. `mesmo_escopo_de_gestao` existe, devolve `true` hoje, é chamada de dentro de `exigir_gestao_de`, e
   tem o mesmo tratamento de privilégio das auxiliares irmãs da `0078` — provado por
   `has_function_privilege` nos quatro papéis, não por afirmação.
2. As **cinco** RPCs de conta continuam passando por `exigir_gestao_de`, e o roteiro prova que a guarda
   nova **está no caminho delas** — a prova é um cenário, não a leitura do código.
3. `existe_outro_admin_ativo` tem o parâmetro de escopo, e o roteiro prova que a trava do último
   administrador **continua travando** (par: recusa o rebaixamento do último · aceita o rebaixamento
   quando há outro). Escopo nulo **não** faz a RPC recusar tudo, e há asserção para isso.
4. A decisão sobre a conta de plataforma está escrita na ata **e no cabeçalho do roteiro**, com o que
   fica adiado para a F65 nomeado.
5. `definir_vinculos_usuario` ganhou par positivo em `cargo_dev.sql`.
6. `cargo_dev.sql:1d` e `papeis_rls.sql:3i` distinguem "recusado pela guarda" de "a função não existe" —
   e nenhuma das duas passou a exigir menos do que exigia.
7. `importar_ativos_substituir` chama `pode_escrever_filial(v_filial)` entre a resolução da filial e o
   advisory lock, **em conjunção** com o `e_admin()`; o roteiro tem o par recusa/aceita.
8. `prefixo_backup_import(p_filial)` existe, no molde por **id**, e `import_validar_plano` faz a cascata
   de três guardas com `errcode = '22023'`. `actions/importar.ts` grava por id.
9. `erros.ts` traduz a exceção nova com **frase própria**, que não é capturada por nenhum ramo anterior
   — em especial o `'backup informado não existe'` da `:233`. Há teste que prova que o texto que chega
   ao operador do import **não** diz "deste reset". O comentário mentiroso de `erros.ts:260-262` (que
   afirma vir "ANTES do ramo de backup do RESET", e não vem) foi corrigido ou o ramo foi movido para
   fazê-lo verdadeiro — as duas saídas servem; escolher em silêncio não.
10. A confirmação digitada é conferida dentro da RPC, com a **mesma regra de normalização** dos dois
    lados, provada por teste. A Decisão 3 está registrada com a medição do overload.
11. Se a assinatura de `importar_ativos_substituir` mudou: `seguranca_catalogo.sql:94`, o bloco de
    verificação pós-apply do `RUNBOOK-BANCO.md`, `catalogo_secdef.sql` (asserção 2, overload) e
    `database.ts` foram atualizados **no mesmo commit**, e não há overload no catálogo. Se não mudou:
    há asserção provando que continua com 4 argumentos e uma linha só.
12. A idempotência por `arquivo_hash` bloqueia o segundo apply do mesmo arquivo na mesma filial dentro
    de 24 h, com mensagem própria, e **deixa passar** o reimport legítimo depois da janela — os dois
    lados no roteiro.
13. `exigir_ativos_da_empresa` existe, é chamada por `apagar_ativos_conflito_filiais` **depois** do
    advisory lock e da terceira etapa do lock, e o roteiro `conflito_filiais.sql` continua com as **37**
    asserções passando, mais as novas.
14. Nenhuma das guardas novas roda dentro da janela `estoque.dev_destrutivo`, e a janela continua com
    exatamente as portas que tinha.
15. `supabase/tests/definer_sem_tenant.sql` existe, enumera `pg_proc where prosecdef` de `public`,
    reprova por função NOMEADA (não por prefixo), inclui parâmetro `text` no filtro, e toda exceção tem
    motivo escrito com a migration na mesma linha.
16. A trava **nasceu vermelha** (ou, se nasceu verde por ser varredura de catálogo, veio no mesmo
    commit com sabotagem provando que sabe reprovar).
17. A régua da `security definer` está no `RUNBOOK-BANCO.md`, em seção própria entre "Aplicar uma
    migration" e "Rollback".
18. `import_fora_da_unidade.sql` existe, conta asserções de verdade, emite a linha `FIM` e não passa
    sobre conjunto vazio.
19. `comment on column public.eventos_admin.detalhe` e `actions/importar.ts:35-36` descrevem o que a
    coluna e o módulo realmente guardam.
20. `k_secdef` de `catalogo_secdef.sql` conhece todas as funções novas, nos dois sentidos.
21. O injetor está verde: cada guarda nova tem mutação que a derruba pelo **cenário nomeado**, com sonda
    `prova`. A Decisão 6 está registrada; se o teto subiu, o motivo está escrito no próprio teste.
22. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos. `npm run db:lock`
    rodado no mesmo commit da `0132`.
23. **Comportamento com a WAP idêntico**: nenhuma operação legítima de hoje passou a ser recusada, e há
    o par "aceita o legítimo" para **cada** guarda. Uma guarda com só o lado "recusa" não conta.
24. `docs/MATRIZ-REGRAS.md` a partir de R-ACC-49; ata por decisão em `docs/DECISOES.md`; versão
    **1.57.0** no `package.json` e no topo do `registry.ts` (2 a 6 mudanças em linguagem de operador,
    honestas sobre uma fase invisível), tag `v1.57.0` anotada e publicada, entrada no `CHANGELOG.md`.
25. PR mergeado com `verificar` e `banco-sem-docker` verdes; `main` em **estado de repouso válido** —
    sem branch aberta, sem guarda pela metade, sem função órfã, sem exceção sem motivo escrito, sem
    coluna esperando backfill. Se o projeto parar aqui por dois meses, o sistema está inteiro.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes do PR.
Depois da migration: `npm run db:lock` e, se houver Postgres alcançável, `npm run db:test` **inteiro** —
não só os roteiros que você tocou: a regra da F17 (`RUNBOOK-BANCO.md:94`) manda rodar TODOS ao mexer em
função, e esta fase mexe em sete. Sem Postgres na mesa, o `banco-sem-docker` do PR é quem roda, e você
**lê a saída dele** com `gh run view --log-failed` em vez de supor. Leia a falha, corrija a **causa
raiz** e repita até passar.
**Não afrouxe trava, não acrescente exceção para ficar verde, não troque o par recusa/aceita por uma
afirmação, não desligue mutação porque deu trabalho, não relaxe uma guarda porque um roteiro legítimo
bateu nela — se bateu, ou a guarda está errada ou o roteiro está, e as duas hipóteses se investigam.**
Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

Provas obrigatórias, cada uma com a saída real em `docs/f52-evidencias/`:
- **`has_function_privilege` nos quatro papéis** para cada função nova, em `begin; … rollback;`.
- **O par recusa/aceita de CADA guarda**, rótulo a rótulo, com a saída do roteiro.
- **A saída VERMELHA de `definer_sem_tenant.sql`** antes de a guarda existir (ou a sabotagem, se ela
  nascer verde por ser varredura de catálogo).
- **Sabotagem A:** remova `mesmo_escopo_de_gestao` de dentro de `exigir_gestao_de`. Mostre o que
  acontece. ⚠ **Se nada cair, isso é o achado, não a falha** — uma guarda que devolve `true` é
  indetectável por definição, e o roteiro precisa provar a **presença** dela (o corpo cita a função,
  o catálogo a conhece), não o efeito. Escreva isso no relatório com todas as letras.
- **Sabotagem B:** faça `mesmo_escopo_de_gestao` devolver `false`. As cinco RPCs têm de recusar, com a
  mensagem em pt-BR, e os cenários positivos do roteiro têm de ficar vermelhos. É a prova de que a
  guarda **está no caminho**.
- **Sabotagem C:** troque `upper(btrim(…))` por igualdade exata (ou o inverso) na confirmação do import
  e mostre a divergência entre os dois lados sendo acusada pelo teste da gêmea.
- **Sabotagem D:** afrouxe a conferência de prefixo do backup do import; o cenário novo fica ✗.
- **Sabotagem E:** remova `exigir_ativos_da_empresa` de `apagar_ativos_conflito_filiais`; o cenário novo
  de `conflito_filiais.sql` fica ✗.
- **Sabotagem F (mesa):** mova, numa migration futura fictícia, um trecho que uma mutação procura, e
  mostre `trocarNoCorpo` reprovando ALTO.
- **`npm run db:test` completo** (25+ roteiros, com o total de asserções) e **`npm run db:test:mutations`
  completo**, com a tabela final do injetor.
- **`npm run build` limpo**, colado por inteiro.
- **O diff da `0132` contra a `0131`** para as duas funções recriadas: tem de ser **só a guarda nova**.
  Qualquer outra diferença é bug (a régua do passo 3 do caminho B do runbook).
- **O smoke** (`node scripts/smoke/smoke-prod.mjs`) depois do deploy, com a ressalva escrita de que ele
  **não exercita o import** — destrutivo, só roda na janela de go-live de uma filial — nem a mesa de
  conflitos.

## O apply — leia isto antes de tentar
Esta fase é **caminho B por construção**: ela recria `importar_ativos_substituir` **e**
`apagar_ativos_conflito_filiais`, as duas com `delete from public.ativos` no corpo, e o gate do modo
automático bloqueia DDL com essa string em qualquer projeto. **E há uma ordem obrigatória: a `0131` da
F51 pode estar pendente de apply em produção** (o `CHANGELOG.md` a marca `🚧`, o handoff está em
`scratchpad/`). Confira o estado real antes de qualquer coisa. Se a `0131` estiver pendente, **as duas
vão na mesma janela, na ordem, ou nenhuma vai.**

Tente o caminho A pelo projeto de **ENSAIO** primeiro, com a verificação pós-apply do runbook. Se o
ensaio estiver inalcançável (ele esteve INACTIVE nas F36, F37 e F50, e o `restore` é recusado pelo
classificador), o substituto com precedente escrito é validar cada objeto em `begin; … rollback;`
contra produção via MCP — que valida sintaxe e efeito sem persistir, e **não** substitui o ensaio para
os roteiros que escrevem (`dev_destrutivo.sql`, `import_substituir.sql`, `conflito_filiais.sql`, que
inclusive falha contra produção por artefato de ambiente). Se o gate disparar, produza o handoff em
`scratchpad/` (que é `.gitignore`d) pelo caminho B, registre a pendência e **siga** — sem parar, sem
pedir permissão, sem inventar caminho de apply alternativo. **Escreva no relatório o que ficou sem
prova**, nominalmente.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem
espere confirmação em nenhuma hipótese. Régua, nesta ordem: (1) este prompt; (2) a ficha da F52 no §5
do plano; (3) as convenções do repositório (`CLAUDE.md`, `RUNBOOK-BANCO.md`, código existente); (4) a
opção mais simples e reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto,
escolha e motivo.

**As sete decisões que esta fase precisa tomar por escrito, e que não têm resposta certa no prompt:**
1. **Onde `mesmo_escopo_de_gestao` entra em `exigir_gestao_de`** — antes da leitura do perfil do alvo
   (recusa mais cedo, mais uma leitura) ou depois (reusa `v_papel_alvo`, já lido). Qual mensagem o
   alvo inexistente produz em cada caso.
2. **Como a conta de plataforma entra no denominador de `existe_outro_admin_ativo`**, sabendo que ela
   não existe no schema. E o que fazer com os **três** contadores do mesmo fato.
3. **Como a confirmação digitada chega à RPC sem criar overload.** Medido: parâmetro novo com `default`
   **é** assinatura nova. As saídas: (a) `drop` + `create` de 5 argumentos, atualizando
   `seguranca_catalogo.sql:94`, o bloco do runbook, `catalogo_secdef.sql` e `database.ts` no mesmo
   commit, com `notify pgrst`; (b) a confirmação viaja **dentro de `p_plano`** — assinatura byte a byte
   igual, tudo o de cima intacto, `create or replace` puro preservado; (c) não fazer o item e registrar
   por quê. Meça, escolha e escreva o custo de cada uma. **E decida a régua de normalização** —
   igualdade exata (a da action hoje) ou `upper(btrim())` (a das duas destrutivas irmãs) — sabendo que
   ter duas réguas para a mesma pergunta é o defeito.
4. **Onde `exigir_ativos_da_empresa` entra na `apagar_ativos_conflito_filiais`**, respeitando os locks:
   depois do advisory (`:194`) e depois da etapa 3 (`:221`), antes ou depois da revalidação do grupo, e
   por quê. Se ela fizer leitura própria de `ativos`, ela **tem** de vir depois da etapa 3.
5. **A forma de `definer_sem_tenant.sql`**: lista de nomes (o que a ficha desenha, escrita contra um
   inventário de 37 que hoje tem 46) ou classificação **derivada por alcance**
   (`has_function_privilege('authenticated', …)`), que é a doutrina que a F48 escreveu. As oito
   auxiliares do import são `security definer`, recebem `p_filial`, e são fechadas nos quatro papéis —
   é o caso que decide a forma.
6. **As duas entradas da quarentena do injetor que nomeiam esta fase.** Adotar as duas (teto 48 → N, com
   o motivo escrito no próprio teste), adotar uma, ou reapontar com o motivo. ⚠ O cenário de
   concorrência **não é escrevível como roteiro** (`begin; … rollback;` num psql só não abre segunda
   conexão) — ou vira harness em Node com dois `psql`, como `run-mutation-tests.mjs` já faz, ou a
   entrada é reapontada. Reapontar sem escrever por quê é mover uma promessa em silêncio.
7. **A idempotência por `arquivo_hash`**: onde a janela de 24 h é conferida (RPC, com estado ENTRE
   chamadas, ou Server Action), qual índice ela exige, e se a coluna entra na string de
   `queries/import-logs.ts:294` — se não entrar, a tela não mostra o que a guarda usou para recusar.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** em vez de repetir, e registre a troca.
Bloqueio real (MCP ausente, ensaio INACTIVE, gate do modo automático disparando, produção inalcançável,
mesa sem Postgres): contorne se for seguro; senão, **entregue o resto e registre a pendência com o que
falta para resolvê-la**. **Não mexa em credencial, não invente caminho de apply alternativo, não force
o classificador de segurança, não desative a proteção da `main`, não rode `db:seed`/`db:reset` fora do
DEV, não rode roteiro que escreve contra produção.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que a medição
esteja no relatório. Foi assim que a F46 trocou "aplicar duas vezes" por prova de determinismo, a F47
trocou 34 por 58, a F48 trocou 54 por 55, a F49 trocou nove por dezenove, a F50 trocou doze módulos por
catorze, e a F51 trocou 394 linhas por 393 e sete auxiliares por oito. **Aqui já há seis divergências
medidas de saída: a migration é a `0132` e não a `0131`; `exigir_gestao_de` já existe (o item 1 insere
uma linha, não cria a função); `existe_outro_admin_ativo` não tem parâmetro ignorado, e há TRÊS
contadores do mesmo fato; `plataforma_admins` não existe no schema; `p_confirmacao text default null` é
overload e não `create or replace` puro; e a exceção de `definer_sem_tenant.sql` que a ficha nomeia
(`colaborador_chave`) não está no inventário de `security definer`.**

# Git e segurança
Branch `f52-guardas-de-escopo`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional
(`feat(f52): …`, `test(f52): …`, `docs(f52): …`, `fix(f52): …`). PR com `gh pr create`; merge só com os
dois checks verdes. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`,
amend de commit que não é seu, commitar `.env*`, `scratchpad/` ou dado real, editar migration aplicada,
mexer na branch protection, ou escrever em produção fora do apply autorizado da `0132` (e da `0131`, se
ela ainda estiver pendente).

# Como trabalhar
Explore com subagentes paralelos — um por frente, e **cada um volta só com resumo e NÚMEROS MEDIDOS**:
(a) a `0074` inteira — as cinco RPCs, o que cada uma já guarda, onde a guarda comum entra, e os três
contadores de "outro admin ativo" nas três camadas; (b) a cadeia do import pós-`0131` — a ordem exata
dos blocos, onde cabe cada guarda nova, e o que `actions/importar.ts`/`importar-wizard.tsx`/`erros.ts`
cobram de volta; (c) a `0093`→`0098`→`0100` — a ordem dos locks, por que ela é o que é, e o ponto de
inserção que não a quebra; (d) o rig — `cargo_dev.sql`, `import_substituir.sql`, `conflito_filiais.sql`,
`catalogo_secdef.sql`, `seguranca_catalogo.sql`, `mutacoes.mjs`, `mutacoes.test.mts`,
`catalogos-seguranca.test.ts`: quem cobra o quê, e o que quebra quando cada guarda entra; (e) o
inventário das 46 `security definer` classificadas por "recebe id do cliente?" e "é alcançável por
`authenticated`?" — é o insumo da Decisão 5.
Escreva `docs/PLAN-F52.md` antes de implementar, com as contagens reais, as **assinaturas desenhadas**,
os cenários de roteiro nomeados (rótulo por rótulo, os pares recusa/aceita) e as sete decisões já
tomadas. Implemente frente a frente, na ordem A → B → C → D, com `lint`/`test`/`tsc` verdes entre uma e
outra — a Frente A é a de melhor retorno e a que menos depende das outras.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F52.md` e os 25
critérios, com estas perguntas: **alguma guarda deixou de ser no-op** — existe operação legítima de
hoje que passou a ser recusada, e como isso foi provado? cada guarda tem o par recusa/**aceita**, ou
alguma tem só o lado da recusa? a guarda de escopo está de fato **no caminho** das cinco RPCs, provado
por cenário (sabotagem B), ou só por leitura de código? `pode_escrever_filial` entrou em **conjunção**
com o `e_admin()`, ou substituiu a autorização? alguma guarda nova roda **dentro** da janela
`estoque.dev_destrutivo`, ou antes do advisory lock da mesa de conflitos? a ordem dos locks da `0100`
sobreviveu — há caminho novo em que duas sessões travam linhas em ordens opostas? a assinatura de
`importar_ativos_substituir` mudou e criou **overload**, e `seguranca_catalogo.sql:94` continua
resolvendo a função certa? a mensagem nova do backup do import chega ao operador dizendo "deste reset"?
a janela de 24 h do `arquivo_hash` bloqueia reimport legítimo? algum roteiro passou a contar sobre
conjunto vazio? `k_secdef` foi atualizado nos **dois** sentidos? a trava tem exceção sem motivo escrito,
ou virou isenção por categoria? alguma mutação existente deixou de PEGAR — a sonda `prova` mira a função
certa depois da recriação? algum arquivo fora do escopo foi tocado, especialmente da F54, da F57 ou da
virada? **Aponte apenas lacunas de correção ou de requisito declarado — não preferências de estilo.**
Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F52.md`, em pt-BR, no padrão dos relatórios F45→F51: o que mudou por arquivo e por quê;
**os números MEDIDOS** (as funções novas com assinatura e privilégio real, o `k_secdef` antes e depois,
o lote de mutações antes e depois, as asserções por roteiro antes e depois, os pares recusa/aceita um a
um), lado a lado com o que a ficha previa, e **cada divergência explicada** — a começar pelas seis já
conhecidas; as **sete decisões** com o custo que decidiu cada uma; as **seis sabotagens** com saída real;
o diff da `0132` mostrando que só a guarda nova mudou em cada função recriada; os 25 critérios
autoverificados; e uma seção explícita **"o que este relatório NÃO prova"** — no mínimo: que uma guarda
que devolve `true` é **indetectável por efeito**, e o que foi provado é a **presença** dela no caminho;
que a equivalência foi provada pelos cenários que os roteiros cobrem, não pelo espaço inteiro; que a
trava lê o TEXTO das migrations, não o banco; que o smoke **não** exercita o import nem a mesa de
conflitos; e o que ficou sem prova por causa do ensaio. Pendências (o apply, se o gate disparar; a
`database.ts`, se a Decisão 3 mudar assinatura) e **backlog nomeado para a F54** (o prefixo estruturado
que ela consome), **para a F62/F65** (o que as guardas no-op precisam para ganhar corpo, função por
função) e **para a F57**.
**Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final com um
resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de código, comentários de migration, mensagens de erro,
`comment on function` e commits em **pt-BR**. Identificadores de domínio em português sem acento
(`mesmo_escopo_de_gestao`, `exigir_ativos_da_empresa`, `prefixo_backup_import`); utilitários e infra em
inglês. As mudanças do `registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa 21 termos de
desenvolvedor, entre eles "migration", "policy", "schema", "deploy" e "RPC".
```

---

## Como executar

### Pré-voo (uma vez, ~15 minutos)

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. O gh EXISTE (F45 §15) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 3. A 0131 da F51 está aplicada em produção? O CHANGELOG a marca 🚧 e o handoff
#    está em scratchpad\f51-handoff-apply-0131.sql. Se ainda não foi, decida se
#    ela vai junto com a 0132 na mesma janela — e diga isso ao agente numa linha.
type scratchpad\f51-handoff-apply-0131.sql | more

# 4. A versão do Claude Code (o modo `auto` exige 2.1.83+).
claude --version
```

**⚠ O passo que só você pode dar: reative o projeto de ENSAIO.** Medido nesta sessão —
`sgmvldiizsrjbxzzpmhh` está **INACTIVE**, o `restore` é **recusado pelo classificador** do modo
automático (tentado e recusado nas F36 e F37), e esta mesa não tem `psql`, Docker nem Supabase CLI. A
mitigação que a própria ficha promete para esta fase — *"ensaio primeiro, e cada guarda tem o par
'recusa o alheio / aceita o legítimo'"* — **não é executável sem isso**. Abra o painel do Supabase,
restaure o projeto de ensaio e confirme que ele responde antes de colar o prompt. Sem isso, a fase
entrega o repositório e as duas migrations ficam pendentes no caminho B — legítimo, com precedente
(a `0128` ficou três fases), mas é o plano B, e você fica com guardas que ninguém exercitou contra um
banco de verdade.

**Conecte o MCP do Supabase antes de colar.** É ele que permite o ciclo `begin; … rollback;` → ensaio →
produção, com a verificação pós-apply do runbook. A F51 registrou, por escrito, que a ausência dele
*"não é azar de sessão: qualquer sessão futura esbarra no mesmo gate"*.

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` não está negado —
a fase abre PR e publica tag) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).

### Rodar

```powershell
claude --model opus --permission-mode auto -n f52
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda `npm ci`, `npm run db:lock`, `gh pr create`, `git tag`/`push` e
tentativas de apply por MCP — nada disso passa numa allowlist estreita, e nada disso é ação que o
classificador bloqueia. O que ela **não** faz (push forçado, reset destrutivo, editar migration
aplicada, roteiro que escreve contra produção, mexer na proteção da `main`) está no escopo negativo do
prompt.

⚠ **O `apply_migration` da `0132` PODE ser recusado**, porque ela recria duas funções cujo corpo contém
`delete from public.ativos`. Isso é o gate do modo automático funcionando, não erro — o prompt manda
cair no caminho B (handoff em `scratchpad/`) e seguir. Na F24 o gate não disparou; **na F51 disparou**.

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit passam limpos, a migration 0132 existe
com db:lock rodado, cada guarda nova tem o par recusa/aceita no roteiro, definer_sem_tenant.sql existe e
reprova quando sabotada, npm run db:test:mutations está verde, e o PR está mergeado com verificar e
banco-sem-docker verdes
```

Sem colidir com trabalho local: `claude --worktree f52 --model opus --permission-mode auto` (aceite o
diálogo de confiança uma vez, antes).

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Quatro momentos para acompanhar:

1. **A Decisão 3, sobre a confirmação digitada.** É a única desta fase que pode quebrar coisa em
   silêncio: se ele acrescentar `p_confirmacao text default null` acreditando que é `create or replace`
   puro, nasce um **overload** e `seguranca_catalogo.sql` fica verde apontando para a função errada.
   Procure a ata; se a escolha foi mudar a assinatura, confira que `seguranca_catalogo.sql:94`, o bloco
   do runbook e `catalogo_secdef.sql` foram atualizados **no mesmo commit**.
2. **A sabotagem B** (fazer `mesmo_escopo_de_gestao` devolver `false`). É a única prova de que a guarda
   está no caminho das cinco RPCs. Se ela não existir, a fase entregou uma função que ninguém
   demonstrou ser chamada.
3. **O par "aceita o legítimo" de cada guarda.** É onde uma fase de guardas no-op falha de verdade: o
   lado "recusa" é fácil e não prova nada sobre ser no-op. Conte os pares.
4. **O teto do injetor.** 47 ativas contra teto 48, mais as guardas novas, mais as duas da quarentena.
   Se ele subiu o teto, o motivo tem de estar escrito no próprio teste — é o ritual que o comentário de
   `mutacoes.test.mts` institui.

### Ao voltar

1. Leia as **sete atas** em `docs/DECISOES.md`. A 2 (conta de plataforma), a 3 (overload) e a 5 (forma
   da trava) são as que mais decidem o custo da F65.
2. `git diff main...f52-guardas-de-escopo -- supabase/migrations/` deve mostrar **exatamente** a `0132`
   e o `migrations.lock.json`. Qualquer migration antiga tocada = a fase quebrou a regra mais dura do
   repositório (e o `migrations-lock.test.ts` deveria ter pego antes).
3. Abra a `0132` e leia o **diff conceitual** de cada função recriada: em `importar_ativos_substituir`
   deve haver **uma** guarda nova e mais nada; em `apagar_ativos_conflito_filiais`, **uma** chamada
   nova, depois dos locks. Diferença fora disso é bug, e é a régua do passo 3 do caminho B do runbook.
4. Confira, com os olhos, os rótulos novos dos roteiros em `docs/f52-evidencias/`. Para cada guarda
   deve haver **dois**: um que recusa e um que aceita.
5. Entre em `/admin/usuarios` no ensaio (ou em produção, com cuidado e sem mudar nada) e faça o ciclo
   completo com uma conta de teste: mudar cargo, desativar, revincular. **Nada pode ter mudado.** É a
   verificação humana que nenhum roteiro faz.
6. Se as migrations foram para produção: rode a **verificação pós-apply** do runbook (assinatura, sem
   overload, grants) e `notify pgrst, 'reload schema';` se a assinatura mudou.
7. Rode você mesmo `npm run test` e `npm run build` uma vez.
8. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende a sessão — peça um
   prompt novo com o aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **F52 é a próxima fase e a F51 está fechada no repositório**: `main` em `f7f70bc`, `package.json` em
   `1.56.0`, tag `v1.56.0` publicada, última migration `0131`. **Mas a `0131` está marcada `🚧` no
   `CHANGELOG.md`** — o apply em produção pode não ter acontecido. O prompt manda conferir e tratar as
   duas na mesma janela, na ordem. Se você já a aplicou à mão, o prompt precisa de uma linha dizendo
   isso.
2. **A migration desta fase é a `0132`** e a versão é **1.57.0** (fase = MINOR sobre 1.56.0); a matriz
   começa em **R-ACC-49**. Se sair correção avulsa (PATCH) antes, o agente recalcula pelo `package.json`
   e pelo fim da matriz.
3. **Você reativa o projeto de ensaio no pré-voo.** Foi a sua escolha ao encomendar esta ordem, e o
   prompt foi escrito contando com ela — mas **não depende** dela: há um parágrafo dizendo o que fazer
   se o ensaio estiver fora, com o substituto e a obrigação de escrever o que ficou sem prova.
4. **A fase inteira num prompt só, em quatro frentes** (A conta · B import · C conflito · D trava e
   régua), com a Frente A primeiro por ser a de melhor retorno e a menos acoplada. Se você quiser
   cortar escopo no meio, o candidato natural é o **item 7 (idempotência por `arquivo_hash`)**: é o
   único que precisa de estado ENTRE chamadas, o relatório da F51 já registra que a decomposição não o
   facilitou, e ele sai sem deixar nada pela metade. Está escrito no prompt como entrega, não como
   opcional — se quiser tirá-lo, apague o bullet da Frente B e o critério 12.
5. **As sete decisões ficaram em aberto de propósito**, com a medição que as torna decidíveis. A mais
   perigosa é a **3** (overload): a ficha do plano afirma que `default` preserva `create or replace`
   puro, e isso é medivelmente falso. Se você tiver preferência entre "confirmação dentro de `p_plano`"
   (assinatura intacta) e "dropar e recriar com 5 argumentos", é uma linha a acrescentar no prompt.
6. **Nenhum item da F54 entrou**, mesmo os que encostam: o backup dos `.docx`, o `nao_incluido`, o
   recorte de `urlBackup`/`listarImportLogs` e o ensaio de restauração ficam de fora, porque a F54
   depende do prefixo estruturado que **esta** fase entrega, e antecipá-la aqui inverteria a
   dependência.
7. **Não incluí `plataforma_admins` nem qualquer tabela nova.** A ficha do item 2 pede uma decisão sobre
   a conta de plataforma, e a decisão possível hoje é sobre a **forma do parâmetro**, não sobre a
   tabela — que é F65. O prompt diz isso com todas as letras para o agente não a inventar.
8. **Assumi que o achado da F51 sobre `cargo_dev.sql:1d` e `papeis_rls.sql:3i` entra nesta fase.** O
   relatório da F51 o deixou nomeadamente para cá, e ele fica na frente de qualquer mudança de
   assinatura — se a Decisão 3 mudar a aridade da RPC, as duas asserções ficariam verdes por engano
   exatamente na fase que mais precisa delas.

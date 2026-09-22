# F62 — A raiz do tenant e o cargo por empresa

Ordem de serviço da fase **F62** do `PLANO-MULTIEMPRESA.md` (§7), a **primeira fase da virada**, que o plano chama de *"a
mais pesada da virada"*. A fase cria `empresas`, `membros` e `plataforma_admins`, dá a `filiais` a empresa dona e a
`operador_filiais` o vínculo por membership, cria as quatro funções de conjunto e `e_plataforma()`, e **tira o cargo de
`profiles` e o põe em `membros`**. Todo leitor e todo escritor do cargo passam a `membros`: as nove funções SQL, as cinco
RPCs de conta, o `handle_new_user`, o TypeScript e os roteiros.

Duas condições não se negociam. **Nenhum perfil de produção muda de acesso**: `papel_atual()`, `e_admin()`, `e_dev()`,
`pode_escrever()` e `pode_escrever_filial()` devolvem, perfil a perfil, o que devolviam antes, provado por comparação
antes × depois nos dois bancos. E **nenhuma das 61 policies vivas muda**: o recorte por empresa é da F66.

Depois dela vem a F63 (`empresa_id` no acervo). O que esta fase deixa pronto para a F66 e a F67 é a forma do predicado
em banco: as quatro funções de conjunto existem, estão testadas nas duas direções (A↔B) e têm cada uma a sua mutação.

---

## Estado de partida — os 30 fatos medidos no disco, no git e nos dois bancos (22/09/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje contra a árvore e o git, e contra o catálogo e as tabelas
> de PRODUÇÃO e do ENSAIO pelo MCP da Supabase, só leitura e só contagem. **Não** foram copiados da ficha, que é de
> 04/09 (v1.49.1), anterior às F45→F61 e aos sete PATCHes da reauditoria. Onde divergem dela, a divergência está marcada
> com ⚠. O `/api/saude` e o estado dos checks, o pré-voo confere. O prompt manda o agente **remedir antes de aceitar**.

**Onde o projeto parou**

1. `main` em **`275ab61`** (merge do PR #69, `v1.66.7-revisao-codigo`), com a tag anotada **`v1.66.7`** nesse commit;
   `package.json` em `1.66.7`. Depois da F61 (`v1.66.0`, 17/09) vieram sete entregas avulsas: a revisão `v1.66.1`
   (`0146`), os passos 1 a 5 da reauditoria de dívida técnica (`v1.66.2`→`v1.66.6`, com `0147`→`0150`) e a revisão
   `v1.66.7` (`0151`). Última migration **`0151_escrita_atomica_reconfere_no_banco.sql`**: 150 arquivos, `0001`→`0151`,
   e a `0029` é gap real. O ledger dos DOIS bancos termina nela (`escrita_atomica_reconfere_no_banco`). Produção
   `pbtjcalbmepmrqzprusb` e ensaio `sgmvldiizsrjbxzzpmhh` estão `ACTIVE_HEALTHY`, Postgres **17.6**, e
   `rotulo_de_ambiente()` responde `'desenvolvimento'` no ensaio. ⚠ A ficha lista as migrations `0141`–`0144`, mas esses
   números foram gastos pela F60. **A primeira desta fase é a `0152`** (e as faixas da F64 e da F65 também caducaram).
   Versão da fase: **`1.67.0`**. Os checks obrigatórios da `main` são **`verificar`** e **`banco-sem-docker`**, e
   `src/lib/ci-passos.test.ts:447-448` exige que sejam exatamente esses dois.
2. **A rede de hoje.** Há 246 arquivos de teste (220 `*.test.ts`, 15 `*.test.tsx`, dos quais 4 são `*.dom.test.tsx`, e 11
   `*.test.mts`) e 38 roteiros SQL mais o `_asserts.sql`. A última contagem citada é de 7.035 testes em 238 arquivos, em
   18/09. O CI da `v1.66.7` registrou 38 roteiros, 924 asserções, 0 ✗ e o injetor em 105/105. A Faixa 2 da
   `DIVIDA-TECNICA.md`, *"antes da F62"*, foi executada inteira na `v1.66.3` (AE, F41a, U, AJ). ⚠ O cabeçalho dela
   (`:400`) não ganhou o "✅ executada" que as Faixas 3→5 têm. Seguem abertos, e fora desta fase: **AS** (o
   `service_role` com EXECUTE em `aplicar_movimentacao`, herança da `0038`), AU e AT. O grau 2 de teste de componente
   (happy-dom e Testing Library, projeto Vitest `dom`, `*.dom.test.tsx`) foi aprovado em 22/09 e está disponível.

**Os dois bancos (só contagens)**

3. **Produção tem 16 perfis**: dev 2, admin 2 ativos mais 1 arquivado (`ativo = false`, `excluido_em` preenchido),
   operador 5 ativos mais 1 arquivado, consulta 5. São 14 linhas em `auth.users` e **0** usuário sem perfil. Há **25
   vínculos** em `operador_filiais`, e **18 deles são de perfis que NÃO são operador**: vínculos inertes que sobreviveram
   a uma troca de cargo. Há 0 operador ativo sem vínculo, 6 filiais e 1.649 ativos.
   **O ensaio tem 5 perfis**: admin 1 ativo mais 2 inativos (não arquivados), operador 1, consulta 1, e **nenhum dev**.
   Tem 5 vínculos, todos de não-operador, 1 operador ativo sem vínculo, 6 filiais e 1.606 ativos (cópia de dado real,
   fato 24). Nenhum dos dois bancos tem `empresas`, `membros` ou `plataforma_admins`.
   Consequência: **o caminho do dev não se prova no ensaio com conta real**. Ele se prova no CI (`cargo_dev.sql`) e na
   comparação de produção.

**O cargo hoje**

4. **`profiles`.** `papel public.papel_usuario not null default 'operador'` e `ativo boolean not null default true`
   (`0061:62-64`). É ENUM, não CHECK (`0061:52`, com `'dev'` acrescentado em `0071:39`; ordem dev, admin, operador,
   consulta). `excluido_em` (`0073:95`) é o arquivamento da conta. **Não há coluna de e-mail**: ele mora só em
   `auth.users`. O comentário `0061:58-61` diz que o cargo mora em `profiles`, e não no JWT, *"por decisão do ADR §4"*,
   porque a claim só mudaria no refresh. Policies: `"leitura operador"` SELECT com o piso (`0070:187`) e `"atualiza
   proprio perfil"` UPDATE (`0059:37`). Grant: só `update (primeiro_nome, sobrenome)` (`0063:256-257`).
5. **As funções de autorização**, todas `stable security definer set search_path = public` (SQL, salvo onde indicado):
   - `papel_atual()` (`0073:118-130`): `select p.papel from public.profiles p where p.id = (select auth.uid()) and
     p.ativo and p.excluido_em is null`, com `revoke public, anon` e `grant authenticated` (`0062:62-63`). Devolve NULL em
     quatro casos: sem sessão, sem perfil, `ativo = false`, `excluido_em` preenchido.
   - `e_admin()` (`0072:56-64`), `e_dev()` (`0072:76-84`) e `pode_escrever()` (`0072:100-108`) chamam `papel_atual()`.
   - `pode_escrever_filial(fid smallint)` (plpgsql, `0072:123-157`) lê `operador_filiais` por `usuario_id = auth.uid()`.
   - Também dependem de `papel_atual()`: `pode_ler_arquivo_termo` (`0129:41`), `checagens_integridade_resumo`
     (`0138:354`) e `ledger_de_migracoes` (`0148:65`, `search_path = ''`).
6. **O censo dos leitores.** Há 101 funções vivas. **Nove leem `profiles.papel`**: `papel_atual`,
   `existe_outro_admin_ativo` (`0132:183-217`), `exigir_gestao_de` (`0132:103-159`), `definir_papel_usuario`,
   `definir_status_usuario`, `definir_vinculos_usuario`, `apagar_usuario` (as quatro na `0074`),
   `checagens_integridade_nucleo` (`0138`, a checagem `operador_sem_filial`) e `profiles_guarda_dev` (`0073:161-214`).
   **Seis leem `profiles.ativo`**: `papel_atual`, `existe_outro_admin_ativo`, `definir_papel_usuario`,
   `definir_status_usuario`, `checagens_integridade_nucleo` e `profiles_guarda_dev`. Quem escreve `papel` é só
   `definir_papel_usuario`; quem escreve `ativo`, `definir_status_usuario` e `apagar_usuario`. `handle_new_user`
   (`0057:108-132`) insere só `(id, primeiro_nome, sobrenome)`, com a trava de domínio de e-mail, e o cargo vem do
   default. ⚠ A ficha nomeia `papel_atual`, `e_admin`, `e_dev`, `pode_escrever`, `pode_escrever_filial`, as 5 RPCs,
   `handle_new_user` e `operador_filiais`. Ela **não** nomeia `exigir_gestao_de`, `existe_outro_admin_ativo`,
   `checagens_integridade_nucleo` nem `profiles_guarda_dev`. A trava que ela pede (*"nenhuma função lê
   `profiles.papel`"*) reprovaria hoje nas nove.
7. **As cinco RPCs de conta** (`0074`, plpgsql definer, `revoke public, anon, service_role` e `grant authenticated`):
   - `definir_papel_usuario` (`:152-185`): grava o papel, com a trava do último admin.
   - `definir_status_usuario` (`:196-229`): grava `ativo`.
   - `definir_vinculos_usuario` (`:242-275`): apaga e reinsere `operador_filiais` com **`on conflict (usuario_id,
     filial_id)`** (`:270`).
   - `apagar_usuario` (`:294-339`): `excluido_em = now()`, `ativo = false` e apaga os vínculos; exige `e_dev()`.
   - `encerrar_sessoes_usuario` (`:362-382`): apaga `auth.sessions`; exige `e_dev()`.

   Todas passam por `exigir_gestao_de`: exige sessão, recusa agir sobre si mesmo, chama `mesmo_escopo_de_gestao` (hoje
   `true`) e exige `e_dev()` se o alvo ou o cargo pedido for dev, e `e_admin()` nos outros casos. Quem as chama no TS:
   `actions/admin.ts:362` (`aplicarCargoEVinculos`, a serviço de `convidarUsuario` `:175` e `editarUsuario` `:471`),
   `:382`, `:545` (com o ban no Auth em `:553`), `actions/dev.ts:154` e `:234`.
8. **`existe_outro_admin_ativo(p_excluindo uuid, p_escopo uuid default null)`** conta `papel in ('dev','admin') and
   ativo and excluido_em is null and id <> p_excluindo and (p_escopo is null or true)`, com `revoke all` dos quatro
   papéis e nenhum grant. O dev conta **de propósito** (decisão 1 do cabeçalho da `0074`; asserção 5d de
   `cargo_dev.sql:459`). O espelho no TS é `idsDeAdminsAtivos` (`queries/admin.ts:209-218`, client administrativo,
   `.in('papel', ['admin','dev'])`). A forma `p_escopo is null or …` é legítima aqui até a F67 (R-ACC-51, R-ACC-71).
9. **`profiles_guarda_dev`** (`0073:161-214`; gatilho `0073:223-225`, BEFORE INSERT/UPDATE/DELETE por linha) recusa
   com 42501: apagar a linha de um dev, inserir já como dev, mudar `papel`/`ativo`/`excluido_em` de um dev e conceder o
   cargo dev. Só deixa passar com `estoque.gestao_usuarios = 'on'`, que as RPCs da `0074` ligam. **É a única proteção do
   "dev intocável", e ela mora em `profiles`.** ⚠ `membros.papel` nasceria sem ela.
10. **`operador_filiais`** (`0061:81-86`): `usuario_id → profiles(id) on delete cascade`, `filial_id → filiais(id) on
    delete restrict`, `created_at`, **PK `(usuario_id, filial_id)`**, índice `operador_filiais_filial_idx`, uma policy
    (`"leitura operador"`, SELECT com o piso, `0070:192`). Leem no SQL: `pode_escrever_filial` (`0072:146`) e
    `checagens_integridade_nucleo`. Escrevem: `definir_vinculos_usuario` (`0074:261,267`) e `apagar_usuario` (`:335`). No
    TS leem `auth/acesso.ts:221` (`getOperador`), `queries/admin.ts:160` e `:302`; não há escrita em `src`
    (`actions/admin.test.ts:123-124` garante), só em `scripts/seed.ts`. **15 roteiros SQL** a citam. ⚠ A PK nova da
    ficha, `(empresa_id, membro_id, filial_id)`, quebra o `on conflict (usuario_id, filial_id)` de `0074:270` se o par
    perder o unique.
11. **O TypeScript lê `profiles` direto.** `getOperador` faz `select 'nome, papel, ativo, excluido_em'`
    (`acesso.ts:183-186`, forma `LEITURA_PERFIL_OPERADOR` em `queries/formas/auth.ts:22-33`) e filtra `!ativo ||
    excluido_em` (`acesso.ts:211`). As guardas `exigir*` usam a RPC `papel_atual` (`acesso.ts:116`, `:257-264`) e
    `pode_escrever_filial` (`acesso.ts:149`). Em `queries/admin.ts`: `:154` (`listarUsuarios`), `:209-218`
    (`idsDeAdminsAtivos`), `:258-259` (`perfilPorEmail`), `:297-298` (`getEstadoUsuario`). Scripts: `seed.ts:1407,1423`,
    `smoke/persona.ts:161,175,199` e `manutencao/gerar-errata-truncamento.ts:264-266`. Não há `.update({ papel` em `src`.
    Tipos: `PapelUsuario = Enums['papel_usuario']` (`auth/papeis.ts:22`) e `papelSchema` (`validators/admin.ts:29`).
    `src/lib/auth/CLAUDE.md:44` diz que o cargo *"passa por `papel_atual()` (RPC) ou pela tabela `profiles` direto"*. O
    `/dev` usa `getOperador` + `eDev(operador.papel)` no layout, e há 17 chamadas de `exigirDev`. ⚠ Os *"199
    call-sites"* da ficha são uma contagem de texto nas migrations (`DIVIDA-TECNICA.md:449,696`, 12/08), não chamadas no
    TS: o código de produção chama `papel_atual` uma vez e `pode_escrever_filial` uma vez.
12. **As policies.** ⚠ São **61**, 53 em `public` mais 8 em `storage.objects`, e não 54 (46 + 8, número da v1.49.1).
    `k_policies_public` (`catalogo_policies.sql:218`) tem 53 e `k_storage` (`:179`) tem 8. O piso (`k_piso_papel`,
    `:159`) cobre **19** policies, não 16. Uso direto: `papel_atual` 19, `e_admin` 24 (20 em `public` + 4 do bucket
    `backups-import`), `pode_escrever` 7, `pode_escrever_filial` 6, `e_dev` 1 (`_bkp`). Nenhuma lê `profiles.papel`
    direto, e 60 das 61 dependem de `papel_atual()`. O *"Não entra: qualquer policy"* da ficha quer dizer: **nenhuma das
    61 muda**.

**As regras que a fase herda**

13. **A forma-alvo** (`MATRIZ-REGRAS.md` R-ACC-68: *"a F62 herda ESTA, não a da ficha"*, e o bloco *"A forma-alvo, para
    copiar (F62 cria; F66 consome)"*, `:670-730`). `empresas_do_membro()`, `empresas_de_escrita()` e `empresas_de_admin()`
    → `returns setof uuid`; `unidades_de_escrita()` → `returns table (empresa_id uuid, filial_id smallint)`. Todas
    `language sql stable security definer set search_path = ''`, com tudo qualificado, `auth.uid()` içado dentro, e
    `revoke execute … from public, anon` + `grant execute … to authenticated`. ⚠ A §5 do plano ainda diz `uuid[]`
    (`PLANO:570-572`), e a ficha escreve `set search_path` sem valor. ⚠ O corpo copiável junta `f.empresa_id =
    m.empresa_id` (a coluna nasce aqui, decisão i) e `o.usuario_id = m.profile_id`. A MATRIZ fixa a FORMA, *"a F62 confirma
    os nomes de coluna"*, e o join do operador segue o vínculo por membership desta fase. R-ACC-72: nenhuma tabela com
    `force row level security` (`✓ 4-bis (0 de 25)` no CI), senão a recursão `42P17` volta, agora em `membros`.
14. **Os catálogos que congelam universo.**
    - `k_negocio` tem **20** tabelas e `k_infra` **5** (`catalogo_policies.sql:88-117`). `profiles` e `operador_filiais`
      são INFRA. ⚠ A R-ACC-30 ainda diz 16/5, e as *"17 tabelas de negócio"* da ficha são 11 + 6 da cobertura do seed, não
      o catálogo. Tabela nova não classificada reprova a 1a; sem SELECT, reprova a 3 salvo entrada em `k_sem_select`
      (`:143`) com motivo. Toda policy de SELECT precisa estar em `k_piso_papel` ou `k_piso_cargo` (6a/6b/6c). Policy
      nova entra em `k_policies_public` (10a/10b e a mesa).
    - `k_secdef` (`catalogo_secdef.sql:71-175`, 58 nomes): definer nova entra com motivo (1a), `search_path` fixado (3),
      nenhuma executável por `anon` (4).
    - `definer_sem_tenant.sql` só olha definer **com parâmetro** (`uuid`/`smallint`/`text`) alcançável por
      `authenticated`. As quatro funções de conjunto e `e_plataforma()` ficam fora dele. As 5 RPCs de conta já estão em
      `k_escopo_ok` (18 nomes, `:101`).
    - `seguranca_catalogo.sql` asserção 2: RLS ligada em toda tabela de `public`.
    - `policies-initplan.test.ts` (describe 4) reprova `e_membro(empresa_id)`, o falso içamento, R2 e o `exists (select 1
      from public.membros m …)` de R3, e deixa passar a forma-alvo. `k_excecoes_predicado` (18, `:270-289`) é a fonte
      única das exceções.
15. **`isolamento_tenant.sql`** (427 linhas, F48). O cabeçalho diz que *"os cenários A↔B do isolamento … NASCEM NA
    F62"*. A convenção de honestidade (`:26-48`): a fixture é contada como `postgres` antes de qualquer "viu zero"; toda
    recusa é provada duas vezes; a FK composta, com o par simétrico. A varredura sobre o catálogo existe só em
    comentário (`:50-65`). O bloco de grants (`:85-133`) espelha `papeis_rls.sql:91-146`, e os arrays
    `k_leitura`/`k_escrita` (`:164-165`) são conferidos pelo describe 9 de `catalogos-seguranca.test.ts`. O molde LITERAL
    8a→8d (`:334-422`) é o que os cenários A↔B copiam. ⚠ **`catalogos-seguranca.test.ts` describe 5 (`:297-310`)
    reprova `empresa_id` em CÓDIGO nesse arquivo** (*"a coluna nasce na F63/F65"*). Ele tem de ser emendado no mesmo
    commit em que os cenários chegam.
16. **As fixtures dos roteiros.** `_asserts.sql` define `pg_temp.assert_zero_de(rotulo, ruins, universo)`, que levanta
    exceção sobre universo nulo ou zero; `rodar-roteiros.sh` reprova roteiro sem asserção ou sem `FIM`. O molde de
    usuário fictício está em `papeis_rls.sql:151-221` e `cargo_dev.sql:94-169`: UUID fixo com prefixo de fase
    (`00000000-f21a-4000-8000-…`), linha em `auth.users` com domínio corporativo (a trava do `handle_new_user`) e depois
    `update public.profiles set papel = …`. O dev exige `set_config('estoque.gestao_usuarios','on',true)`
    (`cargo_dev.sql:163-169`). A sessão se simula com `set local role authenticated` +
    `set_config('request.jwt.claims', …)`, e `cargo_dev.sql:829-830` já tem `k_admin_a`/`k_admin_b` (F52). ⚠ **18
    roteiros plantam cargo ou status com `update … profiles`, em 61 ocorrências** (`cargo_dev` 15, `papeis_rls` 7, e
    mais 16 arquivos). Com o cargo congelado em `profiles` (decisão iii), todos passam a plantar em `membros`.
17. **O injetor.** O catálogo é `scripts/db/mutacoes.mjs`, com os campos `id`, `roteiro`, `classe`, `derruba`, `porque`
    (mais de 40 caracteres), `sql` (em geral `mutarFuncao(…)`) e `prova` opcional. O motor é `run-mutation-tests.mjs`:
    controle verde primeiro, um banco descartável por mutação, e "detectada" só quando todos os rótulos caem. **O teto é
    105** (`mutacoes.test.mts:264-265`), e hoje há **105 ativas** mais 2 em quarentena. Subir o teto exige o número novo
    e o porquê num comentário datado (histórico em `:103-262`), com a quarentena abaixo de ⅓. ⚠ Nenhuma mutação mira
    `isolamento_tenant.sql`, e ele não está em `ROTEIROS_DA_FICHA` (`:56-63`).
18. **Migration nova atualiza duas listas e passa por três guardas.** As listas: `supabase/migrations.lock.json` (`npm run
    db:lock`, conferido por `migrations-lock.test.ts:46-79` no `verificar`) e `DA_F38` em
    `src/lib/itens/migrations-f38.test.ts:41` (toda migration ≥ `0116`, `:405-411`). As guardas: nenhum `alter type … add
    value` (reusar o enum `papel_usuario` passa), nenhum `delete`/`update` de topo em `ativos`/`movimentacoes`/
    `lancamentos_item`, e nenhuma INTOCÁVEL recriada (`:199`; `papel_atual` não é intocável).
19. **A trava *"nenhuma função e nenhuma policy lê `profiles.papel`"* não existe.** O melhor molde é
    `asof_desempate.sql:613-690`: o 10a varre `pg_get_functiondef` de toda função de `public` com exceções nominais, e o
    10b se auto-sabota (cria uma função fictícia e prova que a varredura a acusa). Outros: `catalogo_secdef.sql:572-608`
    (7b/7c, regex sobre `prosrc`), `catalogo_policies.sql` 6a/6b (`ilike` sobre `pg_policies`) e `cargo_dev.sql` 7c.

**O método de migration**

20. **ADR-003 + `RUNBOOK-BANCO.md`.** Apply por `apply_migration` do MCP (ou Management API + `insert` no ledger), **ensaio
    primeiro**, e *nenhuma migration toca banco real antes de o CI tê-la rodado*. O `name` do apply é o nome do arquivo
    sem `NNNN_`; outro nome vira pendente eterno na sonda. **Proibidos** contra os bancos vivos: `supabase db push`,
    `supabase migration repair`, `supabase db reset --linked` e qualquer reescrita de `schema_migrations`. A prova
    pós-apply: assinatura única, grants por papel, md5 do `prosrc` igual ao do trecho do arquivo, `notify pgrst, 'reload
    schema'`, `get_advisors(security)` sem achado novo (29 WARN de definer em 22/09; cada definer nova pode somar um, e
    isso tem de estar declarado), a sonda de paridade ensaio × produção (⚠ o runbook diz 10 classes, e o CI,
    `supabase/ci/impressao-schema.sql`, tem 11) e o smoke. *"SQL antes do deploy."* O rollback é escrito no rodapé de
    cada migration antes do apply, e a regra 10 da §4 exige declarar a ORDEM de rollback. Canal: desde a F55 o
    `SUPABASE_ACCESS_TOKEN` não mora no `.env.local` (está no Gerenciador de Credenciais do Windows, que o agente não
    lê). **Sem MCP, é o caminho B** (o Johnny no SQL Editor), e o PR não é mergeado.
21. **A sonda de deriva** (`scripts/smoke/deriva-migrations.mjs`, base fixa `146`). Todo arquivo ≥ `0146` tem de estar no
    ledger de PRODUÇÃO pelo nome. Pendente há mais de **24 h**, contadas da data do commit que acrescentou o arquivo (não
    do merge), vira issue de alarme na Parte B do `saude.yml` (06:43, todo dia). Nome-sem-prefixo repetido de qualquer
    arquivo do repositório vira `nome_duplicado`. A Parte B lê `ledger_de_migracoes()` com a conta de cargo `consulta`:
    **se `papel_atual()` passar a ler `membros` e essa conta ficar sem linha, a sonda cai com `sonda_falhou`.**
22. **Os tipos.** `npm run db:types` roda `supabase gen types` (`--project-id $DB_TYPES_PROJECT_REF` ou `--linked`), e a
    regra é gerar **de PRODUÇÃO** (`ARQUITETURA.md:261`). Na prática, desde a F55 não há token na sessão do agente, e a
    F60 usou o `generate_typescript_types` do MCP com *hand-fix* datado. O gate `db:types:diff` compara o banco do CI
    (cadeia inteira) com `database.ts` (2.153 linhas) e reprova quando o banco tem o que o arquivo não tem.
23. **A conferência pós-deploy.** `/api/saude` devolve `{ok, versao, commit, banco, ms}`. `node
    scripts/smoke/smoke-prod.mjs` carrega sozinho as `SMOKE_*` do `.env.local`, que são a conta **ADMIN** de produção. A
    referência é *"109 OK · 1 aviso (kits_modelos) · 0 falha"*. A Parte B agendada usa outra conta, de cargo `consulta`,
    guardada nos secrets do GitHub e sem vínculo em `operador_filiais`. As duas precisam de linha em `membros`.
24. **As credenciais** (`INVENTARIO-CREDENCIAIS.md` §2, nomes e destinos, nunca valores). Desde a F55 o `.env.local`
    aponta para o **ENSAIO** (`NEXT_PUBLIC_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SEED_PROJECT_REF`), e as `SMOKE_*` apontam
    para **PRODUÇÃO**. O ensaio guarda uma cópia dos dados reais do go-live. §9: em 10/09 um revisor filtrou o
    `.env.local` com `awk` e vazou credenciais para a transcrição. A regra é nunca abrir, filtrar ou imprimir: só contar e
    nomear.

**O seed e o escopo no TypeScript**

25. **`scripts/seed.ts`** (1.799 linhas) insere direto em 8 tabelas (`ativos`, `movimentacoes`, `colaboradores`,
    `itens`, `lancamentos_item`, `anotacoes`, `operador_filiais`, `eventos_admin`), cria contas pela Auth Admin API e faz
    **`update` de `papel`/`ativo` em `profiles`** (`:1407`, `:1422-1423`). ⚠ `filiais` e `tipos_item` ele só lê: não são
    11 inserts, como diz a ficha. Ele recusa rodar no ensaio (há ativos, `:1754-1758`), o CI nunca o roda, e ele chama
    `main()` no topo do módulo (um teste que o importe mata o Vitest). ⚠ *"Slug de filial repetido entre empresas"* é
    impossível até a F65 (`filiais.slug` é único global, `0003:11`, mais `filiais_nome_chave_uidx` da `0139`), e
    *"patrimônio nas duas"* exige `ativos.empresa_id` (F63). Os roteiros montam os próprios dados (38 dos 39 arquivos em
    `begin … rollback`). → decisão iv.
26. **Os pontos de injeção do TS.** `src/lib/escopo/pertencimento.ts` define `ESCOPO_UNICO = { empresa: 'wap' }` com o
    comentário *"Na F62 ele sai"*. `escopoDeGestaoAtual()` devolve a constante, e `escopoDoImportLog(linha)` ignora a
    linha. Os chamadores são `actions/importar.ts:891-901` e `queries/import-logs.ts:703-710`, e
    `pertencimento.test.ts:132` é *"o primeiro a dizer que a virada aconteceu"*. `escopo/chave.ts` tem outro `'wap'`
    privado (`:32`), e trocar o prefixo de `chaveDeStorage` apaga os rascunhos salvos. `observabilidade-linha.ts` grava
    `empresa: null` (teste `:31`). ⚠ **A tensão**: a ficha F62 é inerte (*"nada no app lê nada disso"*), e o
    `RELATORIO-F61` diz que a F62 tira o `ESCOPO_UNICO`. Mas o corpo real depende de `import_logs.empresa_id` (F64) e da
    empresa da SESSÃO (`contextoDoApp()`, F70). Tirar a constante agora só deslocaria o literal.
27. **O catálogo de requisitos da tabela `empresas`.** `PLANO-PRODUTO-MULTIEMPRESA.md`: nome, slug, logo, cor, config
    (`:57`); slug único com reservados `geral`, `todas`, `app`, `plataforma`… (`:103`, `:109`); máscara, cidade, `ativo`,
    `config jsonb` leve; `plataforma_admins` + `eventos_plataforma` (`:112`). `SYSTEM-DESIGN-ACERVO` D5 (~`:107-112`):
    configuração em colunas, não jsonb genérico. ⚠ A ficha tem `razao_social`/`cnpj` e não tem logo, cidade nem `ativo`.
    ⚠ **A máscara não é "WAP + 7".** É prefixo `[A-Z]{2,4}` com 7 dígitos (`src/lib/patrimonio.ts:16-17`), com **7
    prefixos oficiais** na tabela `import_prefixos_patrimonio` (`0139:289-292`; ganha `empresa_id` na F64), e a validação
    é monopólio do TS desde a F7J (`patrimonio-sql.test.ts`). Um par único `patrimonio_prefixo`/`patrimonio_digitos` não
    representa a WAP. ⚠ **Os slugs.** `filiais.slug` não tem CHECK de formato, e não existe lista de reservados. Os
    segmentos de topo das rotas hoje são `admin`, `ajuda`, `ativos`, `dev`, `itens`, `movimentacoes`, `pendencias`,
    `relatorios` e `versoes` (em `(app)`), mais `api`, `auth` e `login`; e `filial=todas` é valor de URL. A lista da
    ficha não traz `ativos`, `itens`, `movimentacoes`, `pendencias`, `ajuda` nem `dev`. A cor da marca é
    `--brand-amarelo #eda100` (`globals.css:147`).

**Os documentos e o desempenho**

28. **Onde os documentos dizem que o cargo mora:** `ADR-002` §4 (`:61-66`), `:149` e §13.3 (`:214-228`); `ARQUITETURA.md`
    §4.1 (`:61-64`) e §4.2 (⚠ atribui `papel_atual` a `0061`/`0062`; a viva é a `0073`); `src/lib/auth/CLAUDE.md:44` e
    `:50`; `MATRIZ-REGRAS.md` R-ACC-02 (hierarquia em `profiles.papel`), R-ACC-25, R-ACC-26 e R-ACC-29 (o motivo da
    recursão, contado em `profiles`); `catalogo_policies.sql:97-99`. A ficha F64 lista `filiais` e `operador_filiais`,
    que esta fase antecipa (decisão i e a própria ficha).
29. **A linha de base de RLS** (`scripts/perf/medir-rls.mjs:51-55`; `docs/perf/f59-rls-*.json`, 16/09, forma F0 = o piso):
    produção, `ativos` 1,619 ms e `movimentacoes` 1,921 ms; ensaio, 0,677 e 1,117 ms. O plano mostra `InitPlan 1` com 1
    loop. *"A F62 muda o que `papel_atual()` lê"*: a F66 re-roda o instrumento antes de mexer nas policies. Aqui ele serve
    para provar que o join novo continua sendo UMA avaliação por statement.
30. **Regras do `CLAUDE.md` que pesam aqui:** **1** (escopo), **2** (nunca dado real: fixtures fictícias; de produção,
    só contagem e hash), **3** (R$ 0, stack fechada, nenhuma dependência nova), **5** (produção com autoproteção), **6**
    (documentação oficial antes de afirmar: RLS, `security definer` e `auth.uid()` da Supabase; `CREATE FUNCTION`,
    `ALTER TABLE … ADD COLUMN … DEFAULT` constante sem reescrita (PG 11+), `CREATE POLICY` e a regra de recursão do
    PostgreSQL 17; `generate_typescript_types`), **7** e **8** (fechamento e versionamento). O molde de fechamento das
    F58→F61: um PR de código, merge com os dois checks verdes, conferência pós-deploy e um PR só de documentação que leva
    a tag, com as migrations aplicadas no ensaio e em produção **antes** do merge (como nas `v1.66.x`).

---

## As quatro decisões do Johnny (22/09/2026)

1. **`filiais.empresa_id` nasce na F62, com default da WAP mantido até a F64.** É a *"hierarquia empresa → filial"* do
   objetivo da ficha, e a coluna que a forma-alvo da MATRIZ já usa. `unidades_de_escrita()` nasce com o corpo da MATRIZ.
   O "Nova filial" continua funcionando sem mudar código, porque o default preenche. A F64 tira o default quando o app
   passar a informar a empresa. É desvio declarado do *"Não entra: `empresa_id` em tabela de negócio"*.
2. **As contas dev ficam em `membros`**, com papel `'dev'` na WAP, e também entram em `plataforma_admins`.
   `e_plataforma()` nasce sem consumidor. O comportamento é idêntico ao de hoje, inclusive a trava do último admin
   contando o dev (`cargo_dev.sql` 5d). Tirar a conta de plataforma de `membros` é decisão da F67, que já prevê *"`e_dev()`
   se resolve por `e_plataforma()` ou dev-da-empresa — decisão em ata"*.
3. **`profiles.papel` e `profiles.ativo` ficam CONGELADOS.** Ninguém mais os escreve nem os lê. As nove funções SQL, as
   cinco RPCs, o `handle_new_user`, o TypeScript (`getOperador`, a lista de usuários, o contador de admins), os scripts e
   os roteiros passam a `membros`. Não há dupla escrita (§4, regra 2). O rollback ganha o passo **"copiar `membros` →
   `profiles`" antes de religar os leitores antigos**: sem ele, quem foi desativado depois da F62 voltaria a ter acesso.
   As colunas caem numa entrega PATCH depois de três semanas verdes, como a ficha manda.
4. **O seed fica para a F65.** A F62 prova o isolamento com fixtures dentro de `isolamento_tenant.sql`, que é o que o CI
   roda. O `seed.ts` não ganha empresas nem tabelas novas. A trava da ficha (duas empresas, slug de filial repetido,
   patrimônio nas duas, as seis tabelas que faltam) vai escrita como backlog nomeado da F65, a primeira fase em que o
   banco comporta isso. **Consequência da decisão 3, não exceção à 4:** o `seed.ts` para de escrever `profiles.papel`/
   `ativo` e passa a escrever o cargo em `membros`. É a única mudança nele.

---

## As frentes, e por que nesta ordem

- **A — o censo e o "antes".** Antes de tocar qualquer banco: os 30 fatos remedidos, o `PLAN-F62.md`, e a **impressão
  "antes" do acesso de cada perfil nos dois bancos** (a comparação que prova a promessa central), só leitura e só
  contagem/hash. Um "depois" sem o "antes" do mesmo instrumento não prova nada.
- **B — as travas, vermelhas.** A varredura *"ninguém lê nem escreve o cargo em `profiles`"* no catálogo, na mesa e no
  TS nasce reprovando pelos nomes (as nove funções, os leitores TS, os 18 roteiros). A comparação de CI (corpo antigo ×
  corpo novo sobre a grade) nasce com o corpo antigo em `pg_temp`. É a regra 4 da §4: *"trava antes da correção"*.
- **C — o banco.** As migrations `0152`+ no Postgres do CI até o `banco-sem-docker` ficar verde: a raiz, `membros` com a
  cópia, a guarda do dev, `plataforma_admins`, `filiais.empresa_id`, `operador_filiais` por membership, as quatro funções
  de conjunto, e a troca dos leitores e escritores **na mesma transação da recópia**.
- **D — o app e os scripts.** `getOperador`, `queries/admin.ts`, as formas (Zod), `database.ts`, `smoke/persona.ts`, o
  script de manutenção e a linha de cargo do seed.
- **E — os roteiros, os catálogos e o injetor.** O ajudante de fixture e os 18 roteiros, os cenários A↔B, a emenda do
  describe 5, as classificações, o `k_secdef`, as policies novas no universo e as mutações com o teto novo.
- **F — os documentos.**
- **G — o fechamento, com ordem interna rígida.** Versão → revisão adversarial → SHA congelado → CI verde → apply no
  ensaio + comparação → apply em produção + comparação → conferidor de formas → merge → deploy → conferência (e a Parte B
  disparada) → relatório → PR de documentação → tag.

---
## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F62 do `docs/PLANO-MULTIEMPRESA.md` (§7), a primeira da virada: criar a raiz do tenant e mover o cargo de
`profiles` para `membros` sem que nenhum perfil de produção mude de acesso e sem mudar nenhuma das 61 policies vivas. Ao
terminar: existem `public.empresas` (com a WAP), `public.membros` (uma linha por perfil existente, com o cargo e o status
copiados, as duas contas dev incluídas — decisão ii), `public.plataforma_admins` (as duas contas dev) e `e_plataforma()`
sem parâmetro; `filiais.empresa_id` existe, not null, com default da WAP até a F64 (decisão i); `operador_filiais` tem o
vínculo por membership; as quatro funções de conjunto existem na forma-alvo da MATRIZ; `papel_atual()` e todo leitor e
escritor do cargo — as nove funções SQL do fato 6, as cinco RPCs, o `handle_new_user`, o TypeScript, os scripts e os
roteiros — usam `membros`, e `profiles.papel`/`profiles.ativo` estão congelados, com o rollback que copia de volta
(decisão iii); `isolamento_tenant.sql` tem os cenários A↔B verdes com duas empresas fictícias no CI; e cada peça tem a
trava que reprova a volta. A prova central é a impressão do acesso de cada perfil, antes × depois, nos dois bancos:
idêntica. O seed fica para a F65 (decisão iv). Uma run, um PR de código e um PR de documentação com a tag. Versão
`1.67.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md` — §1 (decisões 2, 3, 5 e 6), §2, §3 (*"F62 é a fase mais pesada da virada"*), §4 (as 10
  regras comuns, em especial a 2 — estado de repouso —, a 4 — trava antes da correção —, a 5 — no-op primeiro —, a 8 —
  migration nunca se edita — e a 10 — a ORDEM de rollback), §6 (a fronteira), a ficha **F62** no §7 (a FONTE DA VERDADE
  do escopo: onde esta ordem e ela divergirem sem declaração, vale a ficha), e as fichas **F63**, **F64**, **F65**,
  **F66** e **F67** (o que NÃO antecipar e o que elas esperam encontrar), §8 itens 18 e 19, §10.
- `docs/prompts/F62-raiz-do-tenant-e-cargo-por-empresa-ultracode.md` — o cabeçalho com os **30 fatos medidos**. Este
  prompt os cita pelo número.
- `CLAUDE.md` e `AGENTS.md` — as regras permanentes, em especial a **1**, a **2** (nunca dado real), a **3** (R$ 0 e
  stack fechada), a **5** (produção com autoproteção), a **6** (documentação oficial antes de afirmar: use o Context7 e a
  doc da Supabase e do PostgreSQL 17), a **7** e a **8**; o "Modelo de acesso" das Convenções.
- `docs/MATRIZ-REGRAS.md` — R-ACC-02, R-ACC-25, R-ACC-26, R-ACC-29, R-ACC-30, R-ACC-51, R-ACC-57, R-ACC-63 a R-ACC-72 e o
  bloco *"A forma-alvo, para copiar (F62 cria; F66 consome)"* (fato 13).
- `docs/ADR-002-papeis-e-permissoes.md` (§4, §13, §14), `docs/ADR-003-metodo-de-migration.md`, `docs/ARQUITETURA.md` §4,
  `docs/RUNBOOK-BANCO.md` inteiro (o caminho, o gate, `security definer`, o md5 do `prosrc`, a paridade, o rollback), e
  `docs/INVENTARIO-CREDENCIAIS.md` §2 e §9 (nomes e destinos — **nunca o `.env.local`**).
- `docs/RELATORIO-F48.md` (a classificação e o esqueleto do isolamento), `RELATORIO-F52.md` (as guardas no-op),
  `RELATORIO-F59.md` (o backlog da F62: *"`returns setof uuid`, não o `uuid[]`"*), `RELATORIO-F60.md` e
  `RELATORIO-F61.md` (os backlogs para a F62) e, em `docs/DECISOES.md`, as atas da F21/F22 (o cargo dev), da F52, da F55,
  da F58 (o conferidor de formas contra produção), da F59 e da `v1.66.5` (a nota sobre as auxiliares de
  `aplicar_movimentacao`).
- O código, nesta ordem: as migrations `0061`, `0062`, `0070`, `0071`, `0072`, `0073`, `0074`, `0129`, `0132`, `0138` e
  `0148`; `supabase/tests/_asserts.sql`, `isolamento_tenant.sql`, `papeis_rls.sql`, `cargo_dev.sql`,
  `catalogo_policies.sql`, `catalogo_secdef.sql`, `definer_sem_tenant.sql`, `seguranca_catalogo.sql`,
  `asof_desempate.sql` (o 10a/10b) e `ledger_de_migracoes.sql`; `scripts/db/rodar-roteiros.sh`, `mutacoes.mjs`,
  `mutacoes.test.mts`, `run-mutation-tests.mjs`, `predicado-policies.mjs`, `corpo-vigente.mjs` e `scripts/db/CLAUDE.md`;
  `src/lib/validators/policies-initplan.test.ts`, `catalogos-seguranca.test.ts`, `migrations-lock.test.ts`;
  `src/lib/itens/migrations-f38.test.ts`; `src/lib/auth/acesso.ts`, `papeis.ts` e `CLAUDE.md`;
  `src/lib/queries/formas/auth.ts` e `admin.ts`; `src/lib/queries/admin.ts`; `src/lib/actions/admin.ts` e `dev.ts`;
  `src/lib/escopo/pertencimento.ts` e `chave.ts`; `scripts/seed.ts` (só o trecho do cargo), `scripts/smoke/persona.ts`,
  `scripts/smoke/deriva-migrations.mjs`, `scripts/smoke/smoke-prod.mjs`, `scripts/formas/conferir.mts`,
  `scripts/perf/medir-rls.mjs` e `scripts/gen-types.ts`.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Trinta fatos, medidos em 22/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco e os bancos de hoje antes de
agir. Onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o relatório. Os que
mais importam:
- **fato 1** — a primeira migration é a `0152`, não a `0141`.
- **fato 3** — 16 perfis em produção, 2 dev, 2 arquivados, 18 vínculos inertes; o ensaio não tem dev.
- **fato 6** — nove funções leem `profiles.papel`, e a ficha nomeia só parte delas.
- **fato 7** — o `on conflict (usuario_id, filial_id)` de `0074:270`.
- **fato 9** — a proteção do dev mora só em `profiles`.
- **fato 11** — `getOperador` lê `profiles` direto, sem passar pela RPC.
- **fato 12** — são 61 policies, não 54, e nenhuma muda.
- **fato 13** — a forma-alvo é `setof` com `search_path = ''`, não a da ficha.
- **fato 15** — o describe 5 de `catalogos-seguranca.test.ts` reprova `empresa_id` no roteiro de isolamento.
- **fato 16** — 18 roteiros plantam cargo em `profiles`.
- **fato 17** — o injetor está no teto (105 de 105).
- **fato 21** — a sonda de deriva alarma em 24 h, e a conta da Parte B precisa de linha em `membros`.
- **fato 26** — o `ESCOPO_UNICO` não tem de onde tirar a empresa nesta fase.
- **fato 27** — a máscara de patrimônio não cabe num par prefixo/dígitos, e a lista de slugs reservados da ficha está
  incompleta.

## Comandos que já existem — use, não reinvente
`npm run lint` · `npm run test` · `npm run typecheck` (= `npx tsc --noEmit`) · `npm run build` · `npm run contraste` ·
`npm run verificar:actions` · `npm run db:lock` (obrigatório no commit de cada migration) · `npm run db:test`,
`npm run db:test:mutations` e `npm run db:types:diff` (precisam de Postgres: rodam no job `banco-sem-docker`; na mesa, só
se houver um Postgres 17 descartável que não seja nenhum dos dois bancos vivos) · `node scripts/smoke/smoke-prod.mjs` e
`npx tsx scripts/formas/conferir.mts` (Frente G) · `node scripts/perf/medir-rls.mjs` (só leitura) · o MCP da Supabase
(`list_projects`, `execute_sql` só leitura, `apply_migration`, `list_migrations`, `get_advisors`,
`generate_typescript_types`). **Não rode** `db:seed`, `db:reset`, `db:types` com `--linked` nem `carga`; **não rode**
`supabase db push`, `migration repair` nem `db reset --linked`; **não suba** `next dev`/`next start` contra o ensaio para
fotografar ou medir (o ensaio guarda cópia de dado real, fato 24).

# Escopo

## Dentro — sete frentes, nesta ordem

### Frente A — o censo e o "antes"
O primeiro entregável é `docs/PLAN-F62.md`, antes do primeiro commit que toque `supabase/` ou `src/`.
- **Os 30 fatos remedidos**, cada divergência contra a ficha anotada.
- **A tabela dos leitores e escritores do cargo**: cada função SQL, RPC, arquivo TS, script e roteiro que lê ou escreve
  `profiles.papel`, `profiles.ativo` ou `operador_filiais`, com o que faz hoje, o que passa a fazer e em que migration ou
  commit. Deve fechar com o fato 6 (as nove + as seis), o 7, o 10, o 11 e o 16.
- **O desenho das tabelas novas e das colunas novas**, com as decisões 1 a 7 de "Autonomia" tomadas por escrito.
- **A ordem das migrations e a ORDEM DE ROLLBACK** (o inverso do apply, com a cópia `membros` → `profiles` como PRIMEIRO
  passo, antes de religar qualquer leitor antigo — decisão iii), escrita também no rodapé de cada migration.
- **A impressão "antes" do acesso**, nos DOIS bancos, pelo MCP, só leitura, ANTES de qualquer apply. É o instrumento da
  promessa central, e ele tem de ser o MESMO texto de consulta antes e depois (chama as funções pelo nome, então vale nos
  dois lados). Para cada perfil de `profiles`, sob personificação (`set local role authenticated` +
  `set_config('request.jwt.claims', …)`, dentro de transação desfeita, no molde das emulações da F59), ele registra
  `papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()` e `pode_escrever_filial(f)` para cada filial; e, como
  `postgres`, `existe_outro_admin_ativo(<perfil>)`. **A saída é só agregada**: número de perfis, contagem por
  combinação de resultados e um md5 global da lista (perfil, resultados) ordenada por id: o id entra só no hash. Nenhum
  id, nome ou e-mail sai da consulta, e nada disso
  vai para arquivo, log ou evidência. Grave as saídas agregadas em `docs/f62-evidencias/antes/`.
- **A linha de base de RLS** (fato 29): `node scripts/perf/medir-rls.mjs` na forma F0, no ensaio, antes. Em produção só
  se o canal de leitura existir, no molde da F59.
- **O censo dos slugs reservados**: os segmentos de topo de `src/app/**` e os valores especiais de URL (fato 27).

### Frente B — as travas, vermelhas
Cada uma nasce no commit anterior à correção e reprova pelos nomes, com a saída vermelha em `docs/f62-evidencias/`.
- **Catálogo** (um roteiro novo ou um bloco em `catalogo_secdef.sql`, no molde do 10a/10b de `asof_desempate.sql`): nenhuma
  função de `public` e nenhuma policy lê ou escreve `profiles.papel` ou `profiles.ativo`, com as exceções NOMEADAS e com
  motivo numa fonte só (no mínimo `profiles_guarda_dev`, que continua protegendo a coluna congelada e o `excluido_em`), e
  a auto-sabotagem que prova que a varredura acusa uma função fictícia. Hoje reprova nas nove do fato 6.
- **Mesa**, sobre o replay das migrations (`corpo-vigente.mjs`): a mesma afirmação sobre o corpo vigente, para reprovar
  antes do CI.
- **TS**: nenhum `from('profiles')` em `src/**` ou `scripts/**` seleciona, filtra ou grava `papel`/`ativo` (forma, `.eq`,
  `.in`, `.update`), com exceção nominal e motivo. Hoje reprova nos arquivos do fato 11.
- **Roteiros**: nenhum roteiro de `supabase/tests/` grava `papel` ou `ativo` em `profiles`, salvo os cenários que provam o
  congelamento e a guarda, pelo nome. Hoje reprova nos 18 do fato 16.
- **A comparação de CI**: um roteiro (ou um bloco novo em `cargo_dev.sql`/`papeis_rls.sql`) que monta a grade completa —
  cada papel × `ativo` × `excluido_em` × com e sem vínculo × sem perfil × sem sessão — e compara, célula a célula, o corpo
  ANTIGO de `papel_atual()`, `pode_escrever_filial()` e `existe_outro_admin_ativo()` (copiado em `pg_temp` a partir do
  arquivo vigente) com o corpo vivo. Antes da troca ele é verde por construção (antigo = vivo); a sabotagem B prova que
  ele fica vermelho.

### Frente C — o banco (migrations `0152`+)
Em migrations pequenas, cada uma com a classe no cabeçalho, o rollback no rodapé e o `db:lock` no mesmo commit, e com
entrada em `DA_F38`. Nomes-sem-prefixo que não repitam nenhum arquivo do repositório (fato 21).
- **A raiz.** `public.empresas` pela ficha, corrigida pelos fatos 27 e 30. O `slug` tem CHECK de formato e CHECK de
  reservados, com a lista fechada derivada do censo da Frente A mais a da ficha. `nome` é o de exibição, e
  `razao_social`/`cnpj` são colunas separadas. A máscara vira dado na forma que a medição sustenta (decisão 1). Há
  `cor_acento` com CHECK hex e `config jsonb not null default '{}'` com `check (jsonb_typeof(config) = 'object')`. A
  linha da WAP é inserida. RLS ligada, sem `force`.
- **`public.membros (id, empresa_id, profile_id, papel public.papel_usuario, ativo, created_at)`**, com `unique
  (empresa_id, profile_id)`, `unique (empresa_id, id)` (o alvo da FK composta de `operador_filiais`) e os índices que as
  funções de conjunto usam (`profile_id` primeiro). **Reuse o enum `papel_usuario`**: valor novo de enum é proibido
  (fato 18). A **guarda do dev em `membros`** reproduz `profiles_guarda_dev` (fato 9) com a mesma janela
  `estoque.gestao_usuarios`, e fica provada no `cargo_dev.sql`. A cópia é uma linha por perfil existente, arquivados
  incluídos, apontando para a WAP, com `papel` e `ativo` copiados de `profiles`.
- **`public.plataforma_admins (profile_id …)`** e **`e_plataforma()`**, sem parâmetro, `sql stable security definer set
  search_path = ''`, que responde só sobre o chamador e devolve falso nos mesmos casos em que `papel_atual()` devolve NULL.
  As duas contas dev entram na cópia. Ninguém consome `e_plataforma()` nesta fase (decisão ii). Declare no relatório: o
  cargo `dev` continua em `membros`.
- **`filiais.empresa_id uuid not null default '<wap>' references public.empresas(id)`** (decisão i), com default
  CONSTANTE, sem `update` (PG 11+ preenche sem reescrever). O default fica até a F64, escrito no comentário da coluna e na
  ata.
- **`operador_filiais` por membership**: `empresa_id` e `membro_id`, com a cópia a partir de `usuario_id` (os 25
  vínculos de produção, os 18 inertes incluídos — fato 3), a PK `(empresa_id, membro_id, filial_id)` e a FK composta
  `(empresa_id, membro_id) → membros(empresa_id, id)`. O vínculo com filial de outra empresa é recusado pelo banco (a FK
  composta de filial pede `unique (empresa_id, id)` em `filiais` — decida se entra aqui ou fica para a F65, e registre).
  `definir_vinculos_usuario` e os 15 roteiros que inserem vínculo continuam funcionando: reescreva a RPC pelo membro, ou
  mantenha `usuario_id` e derive o membro no banco — decisão 6.
- **As quatro funções de conjunto**, copiadas da forma-alvo (fato 13), com os joins pelos nomes desta fase.
- **A troca dos leitores e escritores do cargo**: `papel_atual()` (a ponte — decisão 4), `pode_escrever_filial()` pelo
  vínculo por membership, `existe_outro_admin_ativo()`, `exigir_gestao_de()`, as cinco RPCs (`apagar_usuario` continua
  gravando `excluido_em` em `profiles`, que é da conta, e desativa as memberships), `checagens_integridade_nucleo()` e
  `handle_new_user()` (cria a membership na empresa legada com os defaults de hoje: `'operador'`, ativo). **A migration
  que troca os leitores recopia `profiles` → `membros` (idempotente) na MESMA transação, antes de trocar.** Assim nenhuma
  mudança de cargo feita entre dois applies se perde. `profiles.papel` e `profiles.ativo` ganham comentário de LEGADO,
  com a data e a entrega PATCH que os derruba.
- **As policies das tabelas novas**: só as necessárias para reproduzir a leitura de hoje (`membros` lida como `profiles` é
  lida hoje, pelo piso, se o app a ler com a sessão do usuário), cada uma em `k_policies_public` e em `k_piso_papel`, ou a
  tabela em `k_sem_select` com motivo. **Nenhuma das 61 policies vivas muda.**
- **Os catálogos**: as tabelas novas classificadas (`k_negocio`/`k_infra`, com motivo, e a decisão sobre
  `operador_filiais` — fato 14), as definer novas em `k_secdef`, as contagens dos cabeçalhos atualizadas.

### Frente D — o app e os scripts
- `getOperador` (`acesso.ts`) passa a ler o cargo e o status de `membros` (e o `excluido_em` de `profiles`), com a forma
  Zod nova em `queries/formas/auth.ts`. O resultado para o operador logado é o mesmo de hoje, e o teste diz isso.
- `queries/admin.ts` (`listarUsuarios`, `idsDeAdminsAtivos`, `perfilPorEmail`, `getEstadoUsuario`) lê `membros`. Os três
  contadores do mesmo fato (SQL, `validators/admin.ts:179`, `queries/admin.ts:206`) continuam contando o mesmo conjunto.
- `src/lib/types/database.ts` com *hand-fix* datado antes do SHA congelado (o `db:types:diff` do CI exige o estado
  final), no precedente da F56/F60 (fato 22). Depois do apply no ensaio, ele é regenerado pelo MCP
  (`generate_typescript_types`) e conferido igual. Se diferir: commit novo, CI de novo, e o SHA congelado passa a ser
  esse, antes do apply de produção.
- `scripts/smoke/persona.ts`, `scripts/manutencao/gerar-errata-truncamento.ts` e a linha de cargo de `scripts/seed.ts`
  (decisão iv) passam a `membros`. Nada mais muda no seed.
- **`ESCOPO_UNICO`, `chaveDoEscopo` e o `empresa: null` da observabilidade FICAM** (fato 26). A ata diz por quê e de onde
  o valor vai sair (F64 para `import_logs.empresa_id`; F69/F70 para a empresa da sessão).
- `src/lib/auth/CLAUDE.md` (`:44`, `:50`) diz onde o cargo mora agora.

### Frente E — os roteiros, os catálogos e o injetor
- **Um ajudante de fixture** (em `_asserts.sql`, carregado antes de todo roteiro, ou equivalente) que planta cargo e
  status em `membros`, com a janela do dev quando o cargo for dev. Os 18 roteiros do fato 16 passam a usá-lo. A trava da
  Frente B fica verde.
- **`isolamento_tenant.sql` com os cenários A↔B**, no molde LITERAL 8a→8d e na convenção de honestidade (fato 15). A
  empresa A é a WAP (da migration), e a empresa B, fictícia, é criada no roteiro, com filial própria de slug diferente
  (o unique global de `filiais.slug` é da F65). Personas fictícias com UUID de prefixo `f62`: admin só em A, operador só
  em B com vínculo, um consultor admin em A e consulta em B, um membro inativo em A e uma conta de plataforma. Cenários,
  cada um nas duas direções:
  - `empresas_do_membro()`, `empresas_de_escrita()` e `empresas_de_admin()` devolvem exatamente as empresas certas de
    cada persona;
  - `unidades_de_escrita()` nunca devolve par de filial de outra empresa;
  - o membro inativo some no statement SEGUINTE, sem renovar token;
  - `e_plataforma()` responde só sobre o chamador;
  - `papel_atual()` (a ponte) é determinística para o consultor com duas memberships;
  - o vínculo com membro de outra empresa é recusado pela FK composta, provado com o par simétrico;
  - `authenticated` não escreve em `empresas`, `membros`, `plataforma_admins` nem `operador_filiais`: a recusa é provada
    duas vezes (falha e, como `postgres`, o dado intacto);
  - `force row level security` desligado nas tabelas novas;
  - a varredura das tabelas novas iterada sobre o CATÁLOGO, nunca sobre lista escrita à mão.

  O bloco de grants e os arrays `k_leitura`/`k_escrita` acompanham (describe 9). **O describe 5 de
  `catalogos-seguranca.test.ts` é emendado no mesmo commit**: `empresa_id` passa a poder aparecer em código para
  `membros`, `operador_filiais`, `filiais` e as funções desta fase. A varredura da chave de recorte das tabelas de acervo
  continua sendo da F63/F65.
- **`cargo_dev.sql` e `papeis_rls.sql`** continuam provando o que provam, com a 5d intacta (decisão ii). Mais: a guarda
  do dev em `membros` e a recusa de agir sobre si mesmo.
- **As mutações**: uma por função de autorização reescrita ou criada. Incluem as quatro de conjunto, `e_plataforma()`,
  `papel_atual()`, `pode_escrever_filial()`, `existe_outro_admin_ativo()`, `exigir_gestao_de()`, a guarda do dev em
  `membros` e `handle_new_user()` sem a membership. Cada uma é detectada pelo cenário nomeado. O teto sobe para o número
  exato, com o porquê datado (fato 17), e `isolamento_tenant.sql` entra em `ROTEIROS_DA_FICHA`.

### Frente F — os documentos
Emenda **F62** na `docs/MATRIZ-REGRAS.md`: R-ACC-02, R-ACC-25, R-ACC-26 e R-ACC-29 dizem onde o cargo mora e o segundo
motivo do *"sem `force`"*; R-ACC-30 recebe os números medidos; e entram as regras novas (o cargo em `membros`, o
congelamento, a ponte de `papel_atual()`, as quatro funções em banco, `e_plataforma()` sem consumidor). Emenda no
`ADR-002` (§4 e §13) e no `ARQUITETURA.md` §4. No `RUNBOOK-BANCO.md`: o Anexo da F62 e a receita de rollback com a cópia
de volta. Nota F62 no `PLANO-MULTIEMPRESA.md` (os desvios medidos, as quatro decisões, e a ficha da F64 dizendo que
`filiais` e `operador_filiais` já ganharam a coluna e que o que sobra lá é tirar o default). O backlog nomeado da F65 com
a trava do seed. O índice em `docs/README.md` e em `docs/prompts/README.md`. A ata em `docs/DECISOES.md`.

### Frente G — o fechamento, nesta ordem
1. `1.67.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código —
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real. Nada muda na tela. O texto diz isso com honestidade: o sistema passou a guardar o cargo de
   cada pessoa dentro da empresa em que ela trabalha, sem mudar o acesso de ninguém, e trocar cargo e desativar conta
   continuam no mesmo lugar e com o mesmo efeito. Nunca "nada mudou".
2. A revisão adversarial de "Como trabalhar", e as correções que ela pedir.
3. **O SHA de código congelado**: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`, gravado no
   `PLAN-F62.md`. Depois dele, só `docs/**` e `CHANGELOG.md`.
4. O CI do PR verde sobre esse SHA — `verificar` e `banco-sem-docker`, com os roteiros, o injetor e o `db:types:diff`.
5. **Apply no ENSAIO**, migration a migration, pelo `apply_migration` do MCP, com o `name` certo. Prova pós-apply do
   runbook (assinatura única, grants por papel, md5 do `prosrc` × arquivo, `notify pgrst`, `get_advisors(security)` sem
   achado não declarado, contagens) e **a impressão "depois" do acesso: igual à "antes", combinação a combinação e no md5
   global**. Mais a equivalência de dados (cada perfil com exatamente uma membership na WAP, papel e ativo iguais aos de
   `profiles`; cada vínculo com membro e empresa), só contagens. Divergiu? Rollback no ensaio, na ordem escrita, causa
   raiz, e o ciclo de novo.
6. **Apply em PRODUÇÃO**, na mesma ordem, dentro de 24 h do commit das migrations (fato 21), com as mesmas provas, **a
   impressão "depois" igual à "antes"** e a sonda de paridade ensaio × produção. Divergiu? **Rollback imediato em
   produção** (cópia de volta primeiro), antes do diagnóstico, e registro no topo do relatório.
7. O conferidor de formas (`scripts/formas/conferir.mts`, conta do smoke, só contagens) sobre as formas novas, contra
   PRODUÇÃO (F58).
8. Ata e `docs/RELATORIO-F62.md` com o que já dá para escrever; o PR sai do rascunho; merge com os dois checks verdes.
   Entre o apply de produção e o deploy, o app velho lê `profiles.papel` congelado (igual a `membros` no minuto do apply).
   Declare a janela e o tamanho dela.
9. **A conferência pós-deploy, só leitura**: `/api/saude` com `1.67.0` e o commit do merge; `node
   scripts/smoke/smoke-prod.mjs` com 0 falha; e a Parte B do `saude.yml` disparada à mão (`gh workflow run saude.yml -f
   partes=b`), verde, com a sonda de deriva sem pendente (prova que a conta `consulta` lê o ledger pela ponte nova).
   Nenhuma captura de tela de produção.
10. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório. A tag anotada `v1.67.0` vai no merge
    dele, o commit final da fase, e é publicada.

## Fora — não toque
O que a ficha põe em "Não entra": `empresa_id` em tabela de acervo (F63) e de vocabulário/infra (F64), fora `filiais` e
`operador_filiais` (decisão i e a própria ficha); **qualquer mudança nas 61 policies vivas** (F66); qualquer UI, seletor,
cookie ou contexto de empresa (F70); derrubar `profiles.papel`/`profiles.ativo` (PATCH, três semanas depois). E mais:
`papel_atual(p_empresa)` e as guardas no-op com corpo (F67); tirar a conta de plataforma de `membros` (F67, decisão ii); os
uniques por empresa, as FKs compostas do acervo e `guarda_empresa()` (F65), salvo a FK composta de `operador_filiais`; a
porta pública e `senhas_acesso` (F64/F68); o seed além da linha do cargo (F65, decisão iv); `ESCOPO_UNICO`, `chaveDoEscopo`
e o campo `empresa` do funil (ficam, fato 26); o item AS e o resto do backlog da reauditoria; `CLAUDE.md` da raiz (salvo
se alguma frase dele disser, por extenso, que o cargo mora em `profiles`); `.github/workflows/**` e a proteção da `main`;
dependência nova; `.env*` e `scratchpad/`; os PRs do dependabot; o Gerenciador de Credenciais do Windows.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run typecheck` e `npm run build` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes; no CI, `banco-sem-docker` verde com todos os roteiros, o injetor e o `db:types:diff`.
2. `docs/PLAN-F62.md` tem os 30 fatos remedidos, a tabela dos leitores e escritores, o desenho, as decisões por escrito,
   a ordem das migrations e a ORDEM DE ROLLBACK, e é anterior ao primeiro commit que toca `supabase/` ou `src/`.
3. A impressão "antes" do acesso existe nos dois bancos, tirada antes de qualquer apply, só com agregados, em
   `docs/f62-evidencias/antes/`.
4. As migrations começam na `0152`, com classe no cabeçalho, rollback no rodapé, `db:lock` no mesmo commit, entrada em
   `DA_F38`, nenhum valor novo de enum, nenhum `update`/`delete` de topo no acervo e nenhum nome-sem-prefixo repetido.
5. `empresas` existe com a WAP; o slug tem CHECK de formato e de reservados, com a lista fechada igual ao censo das
   rotas mais a da ficha, e a trava que reprova segmento de topo novo não reservado; `config` recusa jsonb que não seja
   objeto; a máscara está no desenho que a medição sustenta, com ata.
6. `membros` tem exatamente uma linha por perfil de `profiles` nos dois bancos (16 em produção e 5 no ensaio, se o fato 3
   não tiver mudado), com `papel` e `ativo` iguais aos de `profiles` no minuto da cópia, e as duas contas dev com papel
   `'dev'`; a guarda do dev em `membros` recusa o que `profiles_guarda_dev` recusa.
7. `plataforma_admins` tem as duas contas dev; `e_plataforma()` não tem parâmetro, responde só sobre o chamador e não
   tem consumidor.
8. `filiais.empresa_id` é not null, aponta a WAP nas 6 filiais, tem default constante documentado até a F64, e nenhuma
   linha foi reescrita por `update`.
9. `operador_filiais` tem `empresa_id` e `membro_id` preenchidos nos 25 vínculos de produção (e nos do ensaio), a PK nova
   e a FK composta para `membros`; `definir_vinculos_usuario` e os roteiros que inserem vínculo funcionam.
10. As quatro funções de conjunto existem na forma-alvo (`setof uuid` / `returns table`, `sql stable security definer
    set search_path = ''`, `revoke public, anon` + `grant authenticated`), passam na mesa e no catálogo, e nenhuma tabela
    da fase tem `force row level security`.
11. A varredura "ninguém lê nem escreve `profiles.papel`/`profiles.ativo`" está verde no catálogo, na mesa, no TS e nos
    roteiros, cada uma com as exceções nomeadas numa fonte só, e cada uma nasceu vermelha (saída na evidência).
12. `papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()`, `pode_escrever_filial()` e `existe_outro_admin_ativo()`
    dão, na comparação de CI, o mesmo resultado do corpo antigo em todas as células da grade.
13. **A impressão "depois" do acesso é IGUAL à "antes" no ensaio e em produção**, combinação a combinação e no md5 global.
14. `isolamento_tenant.sql` tem os cenários A↔B da Frente E, verdes, com a convenção de honestidade; o describe 5 foi
    emendado; o describe 9 está verde.
15. As cinco RPCs, `exigir_gestao_de()`, `checagens_integridade_nucleo()` e `handle_new_user()` usam `membros`; um
    usuário novo nasce com membership `'operador'` ativa na WAP; `apagar_usuario` arquiva a conta e desativa as
    memberships.
16. `getOperador`, `queries/admin.ts`, `smoke/persona.ts`, o script de manutenção e a linha de cargo do seed usam
    `membros`; as formas Zod novas passaram pelo conferidor contra produção, só com contagens.
17. As tabelas novas estão classificadas; as definer novas estão em `k_secdef`; as policies novas estão em
    `k_policies_public` e na classe de piso certa (ou a tabela em `k_sem_select` com motivo); **as 61 policies vivas estão
    byte a byte como antes** (o `pg_policies` de antes × depois, na evidência).
18. Uma mutação detectada por função de autorização criada ou reescrita, mais a guarda do dev em `membros` e o
    `handle_new_user`; o teto no número exato, com o porquê datado; quarentena abaixo de ⅓; `isolamento_tenant.sql` em
    `ROTEIROS_DA_FICHA`.
19. O rollback está escrito na ordem inversa, com a cópia `membros` → `profiles` como primeiro passo, e foi **ensaiado
    no Postgres do CI** (sabotagem G).
20. A comparação de produção, a paridade ensaio × produção, os advisors (achado novo declarado ou nenhum) e o md5 do
    `prosrc` de cada função estão na evidência.
21. `database.ts` conferido contra a geração do MCP depois do apply no ensaio, com o *hand-fix* declarado.
22. `ESCOPO_UNICO`, `chaveDoEscopo` e o `empresa: null` ficaram, com ata e destino.
23. Nenhuma dependência nova; `.github/workflows/**` intocado; `CLAUDE.md` da raiz intocado ou com a mudança justificada.
24. As emendas: MATRIZ (F62), `ADR-002`, `ARQUITETURA.md` §4, `RUNBOOK-BANCO.md`, `src/lib/auth/CLAUDE.md`,
    `PLANO-MULTIEMPRESA.md` (nota F62, ficha F64), `docs/README.md`, `docs/prompts/README.md` e a ata em
    `docs/DECISOES.md`.
25. `package.json` em `1.67.0`, `CHANGELOG.md` e `registry.ts` com entrada; tag anotada `v1.67.0` publicada no merge do
    PR de documentação, ou nenhuma tag, com o motivo e o comando no topo do relatório.
26. Os dois PRs mergeados com os dois checks verdes; a conferência pós-deploy feita (`/api/saude` com `1.67.0`, o smoke
    com 0 falha, a Parte B verde), ou o bloqueio no topo do relatório.
27. As sabotagens A a J com saída real em `docs/f62-evidencias/`.
28. Nenhum dado real (nome, e-mail, id de perfil, patrimônio fora da faixa fictícia) em migration, teste, roteiro,
    evidência ou log; da produção, só contagens e hashes; ninguém abriu o `.env.local`.
29. `docs/RELATORIO-F62.md` no padrão F45→F61, com o roteiro do Johnny no topo.
30. O relatório declara o estado de repouso: o que acontece se o projeto parar aqui por dois meses (com
    `profiles.papel` congelado de pé, e a data a partir da qual a entrega PATCH pode derrubá-lo).

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test` e `npm run typecheck`; `npm run build` antes de cada push; o
`banco-sem-docker` do PR para tudo o que é SQL (roteiros, injetor, `db:types:diff`). Leia a falha, corrija a **causa
raiz** e repita até passar. **Não alargue exceção para caber um caso que devia reprovar, não troque detecção por `skip`,
não afrouxe um catálogo nem uma varredura para a migration passar, não baixe o rigor da convenção de honestidade, e não
mude um teste existente sem conferir que ele prova a mesma coisa** — em especial a 5d de `cargo_dev.sql`. Falha
persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**O "ANTES" VEM ANTES DE QUALQUER APPLY, E NENHUM PERFIL MUDA DE ACESSO.** A impressão do acesso tirada antes, igual à
tirada depois, nos dois bancos, é o portão do apply de produção e do merge.

Provas obrigatórias, cada uma com a saída real em `docs/f62-evidencias/`:
- **Sabotagem A — a varredura do cargo:** as quatro travas (catálogo, mesa, TS, roteiros) vermelhas sobre o código de
  hoje, nomeando as nove funções, os leitores TS e os 18 roteiros; depois, verdes. Uma função fictícia lendo
  `profiles.papel`, um `from('profiles').select('papel')` sintético e um roteiro sintético com `update public.profiles
  set papel` → vermelho.
- **Sabotagem B — a comparação:** o corpo novo de `papel_atual()` sem a condição do `excluido_em`, e depois sem a do
  `ativo` → a comparação de CI vermelha nomeando a célula da grade.
- **Sabotagem C — o isolamento:** `empresas_do_membro()` sem `m.ativo` → o cenário do membro inativo vermelho;
  `unidades_de_escrita()` sem `f.empresa_id = m.empresa_id` → o cenário do par de outra empresa vermelho; a mesma forma
  escrita como `exists (select 1 from public.membros …)` numa policy sintética → `policies-initplan.test.ts` vermelho.
- **Sabotagem D — o `force`:** `alter table public.membros force row level security` → `4-bis` vermelho (e, no ensaio
  do CI, o `42P17` que o motivo da R-ACC-72 prevê).
- **Sabotagem E — a guarda do dev:** `update public.membros set papel = 'dev'` sem a janela → 42501; a guarda
  neutralizada por mutação → o roteiro vermelho.
- **Sabotagem F — a revogação:** o membro desativado → `empresas_do_membro()` vazio no statement seguinte, na mesma
  sessão, sem token novo.
- **Sabotagem G — o rollback ensaiado:** no Postgres do CI (um roteiro ou script dentro de transação desfeita): mudar
  um cargo e desativar um membro DEPOIS das migrations, aplicar o rollback na ordem escrita e conferir que
  `papel_atual()` devolve o estado mais novo; e o mesmo rollback SEM o passo da cópia → o membro desativado volta a ter
  papel → vermelho.
- **Sabotagem H — os slugs:** `insert` de empresa com slug `admin`, `todas` ou com maiúscula → recusado; um segmento de
  rota de topo sintético não reservado → a trava vermelha.
- **Sabotagem I — o `config`:** `'"texto"'::jsonb` e `'[]'::jsonb` → recusados pelo CHECK.
- **Sabotagem J — o usuário novo:** um usuário fictício criado em `auth.users` no roteiro → a membership nasce
  `'operador'`, ativa, na WAP; o `handle_new_user` sem essa linha, por mutação → vermelho.
- **A contagem final:** testes (arquivos e casos) antes × depois; roteiros e asserções do CI; mutações 105 → N (teto
  105 → N); `k_secdef` 58 → N; `k_policies_public` 53 → N (e as 53 de hoje idênticas); `k_negocio`/`k_infra` 20/5 → N;
  as linhas de `membros`, `plataforma_admins` e `operador_filiais` nos dois bancos; a forma F0 de `medir-rls` antes ×
  depois no ensaio (um `InitPlan` por statement); `npm run build` colado por inteiro.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem: (1) uma medição sua contra o disco e os bancos de hoje; (2) as quatro decisões do
Johnny abaixo, que estendem a ficha; (3) a forma-alvo da MATRIZ (R-ACC-68, *"a F62 herda ESTA, não a da ficha"*); (4) a
ficha da F62 no §7 do plano; (5) este prompt, no que ele detalha (onde ele diverge da ficha, a divergência está declarada
aqui e vai para o relatório); (6) as convenções do repositório (`CLAUDE.md`, `AGENTS.md`, `RUNBOOK-BANCO.md`, código
existente); (7) a opção mais simples e reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto,
escolha e motivo.

**As quatro decisões do Johnny (22/09/2026), que a ficha não tinha:**
i. **`filiais.empresa_id` nasce aqui, com default constante da WAP até a F64**, e `unidades_de_escrita()` nasce com o
   corpo da MATRIZ.
ii. **As contas dev ficam em `membros`** com papel `'dev'` e também entram em `plataforma_admins`; `e_plataforma()` nasce
    sem consumidor; a 5d continua valendo; tirá-las de `membros` é da F67.
iii. **`profiles.papel`/`profiles.ativo` congelados**: todo leitor e escritor passa a `membros`, sem dupla escrita, e o
     rollback copia `membros` → `profiles` ANTES de religar os leitores antigos.
iv. **O seed fica para a F65**: o isolamento se prova com fixtures no roteiro; no `seed.ts`, só a linha do cargo muda.

**As doze decisões que esta fase precisa tomar por escrito:**
1. **As colunas de `empresas`**: a máscara (o fato 27 mostra que um par prefixo/dígitos não representa a WAP — decida
   entre só `patrimonio_digitos`, com o prefixo continuando em `import_prefixos_patrimonio` até a F64, ou outra forma
   que a medição sustente); `razao_social`/`cnpj` (a linha da WAP pode nascer com eles nulos, e os termos continuam com o
   texto fixo do modelo — decisão 7 do §1); o que entra do catálogo de requisitos (logo, cidade, `ativo`); o uuid da WAP
   e como ele chega ao default de `filiais`.
2. **A lista de slugs reservados** e a trava que a mantém igual aos segmentos de rota.
3. **"A empresa legada"**: UMA fonte em SQL que responde qual é a empresa dos cadastros de hoje (o default de `filiais`,
   o `handle_new_user`, a ponte de `papel_atual()`), para a F67/F69 trocarem um lugar só.
4. **A ponte de `papel_atual()`**: sem parâmetro, byte a byte a de hoje com uma empresa, `excluido_em` pela conta,
   determinística para quem tem duas memberships (a recomendação é responder pela membership na empresa legada; **nunca**
   pelo cargo mais forte entre empresas) e provada na grade e no A↔B.
5. **`membros`**: FKs (`profile_id` com `cascade` ou `restrict` — `profiles` nunca é apagado, só arquivado), índices,
   policy de leitura ou `k_sem_select`, a guarda do dev e a classificação.
6. **`operador_filiais`**: como o membro chega à linha (a RPC grava o membro, ou o banco o deriva de `usuario_id` e da
   empresa da filial), o destino do `on conflict` de `0074:270`, os 18 vínculos inertes, a FK composta de filial (aqui ou
   F65) e a classificação (INFRA ou NEGÓCIO — fato 14).
7. **`plataforma_admins` e `e_plataforma()`**: colunas, RLS sem policy e `k_sem_select`, e os casos em que devolve falso.
8. **A ordem das migrations e a transação da troca**: onde entra a recópia, e o que vai em cada arquivo.
9. **As travas do cargo**: onde cada uma mora, as exceções nomeadas (`profiles_guarda_dev` no mínimo) e o que reprova.
10. **A comparação**: a grade de CI, e o texto da impressão do acesso (a personificação, os agregados, o md5), idêntico
    antes e depois.
11. **As mutações e o teto**: a lista, o número novo e o porquê.
12. **O que fica**: `ESCOPO_UNICO`, `chaveDoEscopo` e o `empresa: null`, com o destino de cada um.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** e registre. Bloqueios reais, e o que fazer em cada um:
- **O MCP da Supabase não está conectado, ou recusa o apply:** não procure token, não leia o Gerenciador de Credenciais,
  não abra o `.env.local`. Entregue tudo o que não depende do banco vivo, com o PR ABERTO e **SEM merge** (o código novo
  lê `membros`, que não existiria em produção). No topo do relatório, ponha o caminho B: as migrations na ordem, a
  consulta da impressão do acesso para rodar antes e depois, e o rollback.
- **A impressão "depois" diverge da "antes" no ensaio:** rollback no ensaio na ordem escrita, causa raiz pela grade de
  CI, correção por migration NOVA (a aplicada nunca se edita — regra 8 da §4), e o ciclo de novo. **Em produção:**
  rollback imediato, antes do diagnóstico, sem merge, e o bloqueio no topo do relatório.
- **Advisor novo depois do apply** que não seja uma definer declarada: escalada do runbook, rollback antes do
  diagnóstico.
- **A sonda de deriva abre alarme** porque o apply de produção passou das 24 h: registre; o alarme fecha sozinho na
  Parte B seguinte ao apply.
- **Cota de Actions esgotada ou CI fora do ar:** contorne se for seguro; senão, entregue o resto e registre a pendência com
  o que falta para resolvê-la. Nenhuma migration toca banco real sem o CI tê-la rodado.
- **Recusa do classificador em qualquer ação** (apply em produção, merge, push de tag): registre, não repita, não
  reformule, siga no que não depende dela, e ponha o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório — foi assim
que as F46→F61 acertaram o próprio escopo. **Aqui já há dezesseis divergências medidas de saída**, e elas vão no
relatório:
- a numeração das migrations (`0152`, não `0141`; fato 1);
- as nove funções que leem o cargo, e não só as que a ficha nomeia (fato 6);
- o `on conflict` que a PK nova quebraria (fato 7);
- a proteção do dev que só existe em `profiles` (fato 9);
- `getOperador` lendo `profiles` direto (fato 11);
- os "199 call-sites", que são texto de migration (fato 11);
- 61 policies, não 54, e o piso em 19, não 16 (fato 12);
- a forma `setof` com `search_path = ''`, não `uuid[]` (fato 13);
- o join da forma-alvo que usa `filiais.empresa_id` (fato 13, decisão i);
- a classificação 20/5, não 16/5 nem "17" (fato 14);
- o describe 5 que proíbe `empresa_id` no roteiro de isolamento (fato 15);
- os 18 roteiros que plantam cargo em `profiles` (fato 16);
- o injetor no teto (fato 17);
- a conta da Parte B, que precisa de membership (fato 21);
- o seed, que insere em 8 tabelas e não 11, não roda em lugar nenhum e não comporta duas empresas antes da F65 (fato 25);
- a máscara e os slugs reservados (fato 27).

Declare também o que este prompt acrescenta: a impressão do acesso antes × depois; a recópia na transação da troca; a
guarda do dev em `membros`; a FK composta de `operador_filiais`; o ajudante de fixture; a varredura do cargo em quatro
lugares; o rollback ensaiado; a Parte B disparada na conferência; e o que fica de propósito (fato 26).

# Git e segurança
Branch `f62-raiz-do-tenant`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional (`docs(f62): …`,
`test(f62): …`, `feat(f62): …`, `fix(f62): …`, `refactor(f62): …`, `chore(f62): …`). Commite também esta ordem
(`docs/prompts/F62-raiz-do-tenant-e-cargo-por-empresa-ultracode.md`) num commit de documentação. O `PLAN-F62.md` vem
antes do primeiro commit que toca `supabase/` ou `src/`. Os lotes em commits separados: travas vermelhas; a raiz;
`membros` e a guarda; `plataforma_admins`; `filiais` e `operador_filiais`; as funções de conjunto; a troca dos leitores;
o app; os roteiros e o ajudante; o isolamento A↔B; as mutações; os documentos; a versão. Cada migration com o
`db:lock` no mesmo commit. Agrupe os pushes — cada um custa CI numa cota apertada. PR com `gh pr create`, como rascunho
desde o primeiro push que precisar de CI; merge só com `verificar` e `banco-sem-docker` verdes **e** a impressão do
acesso igual nos dois bancos. Depois do merge: a evidência por um PR só de documentação, e correção de código por PR novo.

**Nunca:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu, editar
migration já aplicada em qualquer banco, `supabase db push`, `migration repair`, `db reset --linked`, reescrever
`schema_migrations` além da linha da migration que acabou de aplicar, `update` de backfill em tabela de acervo, abrir a
janela `estoque.dev_destrutivo`, `force row level security`, rodar `db:seed`, `db:reset` ou `carga`, imprimir ou gravar
id, nome ou e-mail de perfil real (nem em log, nem em evidência, nem na resposta), abrir, filtrar, imprimir ou copiar o
`.env.local` (nem você, nem subagente: o incidente de 10/09), ler o Gerenciador de Credenciais do Windows, imprimir ou
gravar senha e token, mexer na proteção da `main` ou no workflow, instalar dependência, ou mexer nos PRs do dependabot.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS**. O prompt de cada subagente diz,
com todas as letras, que ele não abre, não filtra e não imprime o `.env.local` e que, de banco, só lê contagens. As
frentes de exploração:
- (a) **o cargo no SQL**: as nove funções e as cinco RPCs com o corpo vigente (`corpo-vigente.mjs`), a guarda do dev, o
  `handle_new_user` e `operador_filiais`;
- (b) **o cargo no TS e nos scripts**: `getOperador`, `queries/admin.ts`, as formas, as guardas, `persona.ts`, o seed e a
  manutenção;
- (c) **os catálogos e o injetor**: o que cada catálogo exige de uma tabela, uma definer e uma policy novas; o teto; os
  moldes do 10a/10b;
- (d) **os roteiros**: os 18 que plantam cargo, os 15 que inserem vínculo, o molde do A↔B e o describe 5/9;
- (e) **os bancos, só leitura e só contagem**: o fato 3 remedido, o texto da impressão do acesso ensaiado no ensaio, o
  `medir-rls` F0.

Escreva `docs/PLAN-F62.md` antes de implementar. **A edição é sequencial**: migrations, roteiros e catálogos se cruzam
nos mesmos arquivos. Paralelize exploração, medição e revisão, não edição.

Antes de congelar o SHA (Frente G, passo 3), faça a **revisão adversarial por subagentes em contexto fresco**, contra o
`PLAN-F62.md` e os 30 critérios, com estas perguntas:
- Existe alguma combinação de papel × ativo × arquivado × vínculo × duas memberships em que `papel_atual()`,
  `pode_escrever_filial()` ou `existe_outro_admin_ativo()` responda diferente de hoje?
- Existe janela, entre dois applies ou entre o apply e o deploy, em que uma troca de cargo se perca ou em que alguém
  desativado leia?
- A recópia é idempotente e está na mesma transação da troca?
- O rollback, na ordem escrita, devolve o estado mais novo, e sem a cópia devolveria o velho?
- Alguma das quatro funções lê dado da linha, tem parâmetro, devolve array, esquece `m.ativo`, ou deixa um par de
  filial de outra empresa passar?
- Alguma tabela nova ficou sem RLS, com `force`, sem classificação, ou com policy fora do universo?
- As 61 policies vivas continuam byte a byte?
- A guarda do dev em `membros` recusa tudo o que a de `profiles` recusa?
- Algum leitor do cargo (SQL, TS, script, roteiro) ficou em `profiles` fora das exceções nomeadas?
- `handle_new_user` cria a membership, e a trava de domínio continua?
- `definir_vinculos_usuario` funciona com a PK nova?
- A conta da Parte B e a conta do smoke têm membership?
- Alguma mutação passa sem ser detectada, ou algum cenário A↔B é tautológico (universo vazio, fixture não contada)?
- Alguma evidência, roteiro ou log tem id, nome ou e-mail real?
- Algum arquivo fora do escopo foi tocado?

Cada achado passa por um cético instruído a refutá-lo. **Aponte apenas lacunas de correção ou de requisito declarado —
não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F62.md`, em pt-BR, no padrão dos relatórios F45→F61, **com o roteiro do Johnny no TOPO**: o que ficou com
ele, passo a passo, e por quê. No mínimo:
- se o apply, o merge ou a tag ficaram pendentes, os comandos exatos vêm PRIMEIRO (o caminho B completo, se o MCP faltou);
- depois do deploy, entrar com a própria conta e conferir que o menu e o acesso são os de sempre;
- abrir Administração › Usuários e conferir os cargos e status da lista, **sem mudar nada**;
- conferir `/api/saude` com `1.67.0` e a Parte B do `saude.yml` verde no dia seguinte;
- o `git diff v1.66.7 v1.67.0 --stat` com o que deve e o que não deve aparecer;
- a data a partir da qual a entrega PATCH pode derrubar `profiles.papel`/`profiles.ativo`.

Depois, o relatório traz:
- o que mudou, por arquivo e por quê;
- **os números MEDIDOS** lado a lado com a ficha, com **cada divergência explicada**, a começar pelas dezesseis já
  conhecidas;
- as quatro decisões do Johnny e as **doze decisões** da fase, com o que decidiu cada uma;
- a tabela dos leitores e escritores, antes × depois;
- **a impressão do acesso antes × depois nos dois bancos** (os agregados e os md5);
- as sabotagens com saída real;
- a contagem final;
- os 30 critérios autoverificados;
- o estado de repouso;
- a seção **"o que este relatório NÃO prova"**. No mínimo: que existe isolamento entre empresas no acervo (não existe
  até a F66/F72: o piso ainda deixa todo logado ativo ler tudo, e `empresa_id` no acervo é da F63); que o cargo por
  empresa já vale nas policies (a ponte de `papel_atual()` responde pela empresa legada até a F67); que o caminho do dev
  foi provado no ensaio (o ensaio não tem dev, fato 3); que a fixture de duas empresas representa um cliente real (slugs
  diferentes, sem acervo); e que o seed cobre duas empresas (F65).

Pendências e **backlog nomeado**:
- **F63**: a disciplina de backup e o `empresa_id` do acervo;
- **F64**: tirar o default de `filiais.empresa_id`, o prefixo de patrimônio por empresa, o corpo de `escopoDoImportLog`;
- **F65**: o seed de duas empresas, com a trava da ficha F62 inteira, e os uniques por empresa;
- **F66**: a linha de base do `medir-rls` depois da F62;
- **F67**: `papel_atual(p_empresa)`, a conta de plataforma fora de `membros`, `e_dev()` por `e_plataforma()`;
- **F69/F70**: a empresa da sessão, o `ESCOPO_UNICO`, o `empresa` do funil;
- **PATCH**: derrubar `profiles.papel`/`profiles.ativo` e a exceção de `profiles_guarda_dev`; o item AS; o "✅" da Faixa 2.

**Evidências, não afirmações:** a saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas
em pt-BR.

# Idioma
Narrativa, plano, ata, relatório e comentários em **pt-BR**. Domínio em português sem acento (`empresas`, `membros`,
`plataforma_admins`, `empresas_do_membro`, `e_plataforma`); os nomes que a ficha e a MATRIZ fixam ficam como estão.
Commits em pt-BR no padrão conventional. As mudanças do `registry.ts` em LINGUAGEM DE OPERADOR: há teste que recusa termo
de desenvolvedor.
```

---
## Como executar

### Pré-voo (uma vez, ~20 minutos)

Esta fase **toca os dois bancos**. Ela aplica migrations no ensaio e em produção pelo MCP da Supabase, antes do merge, e
a promessa dela é provada por uma consulta rodada antes e depois nos dois. O pré-voo existe para nada disso travar no
meio. O item que mais importa é o MCP.

Este arquivo já está salvo em `docs/prompts/F62-raiz-do-tenant-e-cargo-por-empresa-ultracode.md`, **sem commit**. O agente
o commita na branch da fase. O prompt cita os 30 fatos do cabeçalho pelo número, então ele precisa estar lá quando você
colar o bloco. Arquivo não rastreado sobrevive ao `git checkout main` abaixo.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde o projeto parou: 1.66.7, tag v1.66.7 no merge do PR #69 (275ab61); fora do git, só este arquivo e o "Claude outputs".
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short
Test-Path .git\index.lock    # tem de dar False — uma trava órfã derruba o primeiro commit da run
Test-Path docs\prompts\F62-raiz-do-tenant-e-cargo-por-empresa-ultracode.md   # tem de dar True

# 3. Produção com a mesma versão, e a Parte B do saude.yml verde hoje (a fase mexe no que ela lê).
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude
& "C:\Program Files\GitHub CLI\gh.exe" run list --workflow saude.yml --limit 3

# 4. O smoke de produção passa HOJE — é a conferência pós-deploy da fase.
node scripts/smoke/smoke-prod.mjs

# 5. O MCP da Supabase conectado ao Claude Code, enxergando os dois projetos.
claude mcp list

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O passo 5 é o que mais importa.** Sem o MCP da Supabase, o agente não aplica nada e não tira a impressão do acesso: ele
entrega tudo verde no CI, **deixa o PR aberto, sem merge**, e põe o caminho B (as migrations e a consulta de comparação
para você rodar no SQL Editor) no topo do relatório. O prompt proíbe procurar token por outro caminho. Dentro do Claude
Code, confira que o MCP da Supabase lista `pbtjcalbmepmrqzprusb` (produção) e `sgmvldiizsrjbxzzpmhh` (ensaio).

**Mais três coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. O `banco-sem-docker` vai rodar várias vezes (travas vermelhas,
   migrations, roteiros, injetor com mutações novas), mais o PR de documentação e a Parte B disparada à mão.
2. **Dentro do Claude Code:** `/permissions` (nada negando `git push`, `gh`, `node`, `npx tsx` nem as ferramentas do MCP
   da Supabase) e `/memory` (o `CLAUDE.md` do projeto listado).
3. **Ninguém muda cargo durante a run.** Não convide, não edite nem desative usuário enquanto ela durar. A migration
   recopia o cargo na transação da troca, mas a janela entre o apply de produção e o deploy existe (o app velho lê o
   cargo congelado), e é melhor que ela seja vazia.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f62
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo. A fase roda testes e build, aplica migrations por MCP, abre e mergeia PRs, publica tag, dispara
workflow e roda o smoke contra produção. Nada disso cabe numa allowlist estreita, e `bypassPermissions` numa máquina com
credencial de produção no `.env.local` está fora de questão. **Onde o classificador pode barrar:** o `apply_migration` em
produção, o merge na `main` e o push da tag. As `v1.66.x` e a F60 passaram por ele. Se barrar, o prompt manda não
reformular: registra, segue no resto e põe o comando no topo do relatório.

**`--worktree` NÃO serve:** o smoke da conferência pós-deploy precisa do `.env.local`, que não vai para a worktree, e o
prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** É a fase mais pesada da virada: dezenas de funções, 18 roteiros migrados, catálogos, mutações e dois bancos.
Se a cota semanal estiver apertada, rode `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do `claude` e economize na
exploração. A revisão adversarial (as janelas, o rollback, a grade) é onde o modelo forte rende.

Recomendado para desatendido: a condição de parada como avaliador separado. Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; docs/PLAN-F62.md e docs/f62-evidencias/antes existem; package.json em 1.67.0; docs/RELATORIO-F62.md existe; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, as migrations 0152+ aplicadas no ensaio e em producao com a impressao do acesso depois igual a antes nos dois bancos, a conferencia pos-deploy e a Parte B passaram e a tag v1.67.0 foi publicada; (b) o mesmo, mas com o apply de producao, o merge ou o push da tag barrado, com o bloqueio e o comando no topo do docs/RELATORIO-F62.md; (c) sem MCP da Supabase, o PR ficou aberto sem merge, com o caminho B no topo do docs/RELATORIO-F62.md; (d) a impressao do acesso divergiu, o rollback foi aplicado, o PR ficou sem merge e a causa esta no topo do docs/RELATORIO-F62.md; ou (e) CI ou cota de Actions bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F62.md
```

Se preferir de madrugada, headless (o prompt vai por stdin, porque o bloco passa do limite de linha de comando do
Windows):

```powershell
# salve só o bloco do prompt em prompt-f62.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f62.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f62.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` não se aplica. Como esta fase aplica em
produção, **prefira a sessão interativa deixada rodando, com o `/goal`**, e com a suspensão do Windows desligada (plano de
energia).

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F62.md` e `docs/f62-evidencias/antes/`, com a impressão do acesso dos dois bancos, antes de
   qualquer migration aplicada. Só agregados: se aparecer um nome ou e-mail ali, interrompa a sessão.
2. **As travas vermelhas.** A varredura do cargo reprovando as nove funções, os leitores TS e os 18 roteiros, antes da
   troca.
3. **O ensaio.** A impressão "depois" igual à "antes" no ensaio. É o ensaio geral da produção.
4. **A produção.** O apply e a impressão "depois" igual à "antes". Se divergir, o prompt manda fazer o rollback na hora,
   e o relatório diz isso no topo.
5. **A conferência.** `/api/saude` em `1.67.0`, o smoke com 0 falha e a Parte B verde.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Entre com a sua conta em produção: o menu, `/admin` e `/dev` como sempre. Abra Administração › Usuários e confira
   cargos e status, **sem mudar nada**.
3. `git diff v1.66.7 v1.67.0 --stat`. Devem aparecer:
   - `supabase/migrations/0152_*` em diante, `supabase/migrations.lock.json` e `supabase/tests/**` (os 18 roteiros, o
     `_asserts.sql`, `isolamento_tenant.sql` e os catálogos);
   - `scripts/db/mutacoes.mjs` e `mutacoes.test.mts`;
   - `src/lib/auth/**`, `src/lib/queries/admin.ts`, `src/lib/queries/formas/**` e `src/lib/types/database.ts`;
   - os testes de catálogo e de migration;
   - `scripts/smoke/persona.ts`, o script de manutenção e a linha de cargo de `scripts/seed.ts`;
   - `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`.

   **Não** devem aparecer: mudança nas policies vivas, `src/components/**` e `src/app/**` (nada de UI),
   `.github/workflows/**`, `src/lib/escopo/**` nem mudança de dependência no `package-lock.json`.
4. Abra `docs/f62-evidencias/`: a impressão antes × depois dos dois bancos (só agregados) e a saída das sabotagens.
5. Rode você mesmo `npm run test` uma vez.
6. Anote a data da entrega PATCH que derruba `profiles.papel`/`profiles.ativo` (três semanas verdes).
7. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A `v1.66.7` está fechada e no ar**: `main` em `275ab61` com a tag `v1.66.7`, e o ledger dos dois bancos terminando na
   `0151`, medidos em 22/09. O `/api/saude` e o estado do CI não foram consultados desta sessão; o pré-voo confere.
2. **O agente aplica no ensaio E em produção, antes do merge**, pelo MCP: o fluxo das F53, F56, F60 e `v1.66.x`, e não
   decisão nova sua. Sem MCP, é caminho B e PR sem merge.
3. **Uma run, um PR de código e um PR de documentação com a tag**: o molde das F58→F61. Versão `1.67.0` (fase = MINOR).
4. **`ESCOPO_UNICO`, `chaveDoEscopo` e o `empresa: null` do funil ficam** (fato 26): a ficha é inerte, e o valor real
   depende de `import_logs.empresa_id` (F64) e da empresa da sessão (F70). É desvio declarado do que o `RELATORIO-F61`
   atribuiu à F62.
5. **A linha da WAP em `empresas` pode nascer sem razão social e CNPJ**: os termos continuam com o texto fixo do modelo
   (decisão 7 do §1), e a fase não precisa gravar dado cadastral da empresa numa migration.
6. **A ponte de `papel_atual()` responde pela membership na empresa legada** quando alguém tem duas, e nunca pelo cargo
   mais forte. Em produção todo perfil tem uma só, e o resultado é o de hoje.
7. **Nenhuma das 61 policies vivas muda.** As tabelas novas ganham só a policy necessária para reproduzir a leitura de
   hoje (ou entram em `k_sem_select` com motivo).
8. **A FK composta de `operador_filiais` para `membros` entra aqui**, porque a tabela é reestruturada nesta fase. A de
   filial (`unique (empresa_id, id)` em `filiais`) é decisão do agente, aqui ou na F65.
9. **As exceções da varredura do cargo** são no mínimo `profiles_guarda_dev` (protege a coluna congelada até o PATCH) e os
   cenários que provam o congelamento.
10. **O ensaio continua com cópia de dado real e sem dev**, então o caminho do dev se prova no CI e na impressão de
    produção.
11. **A impressão do acesso roda como `postgres` pelo MCP, com personificação dentro de transação desfeita**, no molde
    das emulações da F59, e só devolve agregados.
12. **Ninguém muda cargo durante a run.** A migration recopia na transação da troca, mas você não mexer em usuário
    enquanto a run durar deixa a janela do deploy vazia.
13. **O teto do injetor sobe** para o número exato das mutações novas, com o porquê datado, como nas fases anteriores.

# F2-backup-restauracao-ci — Frente F (fatos 27, 30, 33, 34, 35) — medição e proposta

Medido em 11/09/2026, branch `f56-import-sem-wapismo-e-sem-bomba`. Nenhum banco foi escrito; nenhuma
migration foi criada; nenhum arquivo versionado foi editado. Todas as citações são arquivo:linha do
estado do repositório nesta run.

## (a) O formato EXATO do backup de hoje (versão 1) e o que os dois testes congelam

`aplicarImport` (`src/lib/actions/importar.ts:474-499`) monta:

```js
const backup = {
  versao: 1,
  exportadoEm: new Date().toISOString(),
  filial: { id: filial.id, slug: filial.slug, nome: filial.nome },
  contagens: custoPreview,            // { ativos, movimentacoes, anotacoes, termos }
  nao_incluido: [
    'pendencias_item — o import não apaga esta tabela, e por isso o backup também não a lê. Se a RPC passar a apagá-la, este backup deixa de ser suficiente para restaurar.',
  ],
  ...acervo,                          // exportarAcervoFilial: ativos, movimentacoes, anotacoes, termos_gerados
}
```

`exportarAcervoFilial` (`src/lib/queries/import-logs.ts:222-289`) devolve o tipo `AcervoFilial`
(`import-logs.ts:39-44`): **exatamente** `ativos`, `movimentacoes`, `anotacoes`, `termos_gerados` — as
quatro tabelas que `import_apagar_acervo_filial` hoje apaga (confirmado linha a linha contra o corpo
vigente da `0131:300-342`; zero diferença). `pendencias_item` e `lancamentos_item` NÃO entram.

`src/lib/actions/backup-formato.test.ts` (leitura textual do fonte, sem banco — F54):
- describe 1 (`:140-152`) congela **versão → conjunto de chaves de topo** do backup do import:
  `['contagens', 'exportadoEm', 'filial', 'nao_incluido', 'versao', '...acervo']` para `versao: 1`. O
  parser (`chavesDeTopo`, `:46-122`) lê o objeto literal em `actions/importar.ts` a partir da âncora
  `'const backup = '`, ignora profundidade > 1, ignora comentário, reconhece propriedade abreviada e
  espalhamento (`...acervo`). Se eu adicionar uma chave nova ao objeto sem bumpar `versao`, ou bumpar
  sem declarar o conjunto novo em `formatos`, este teste **reprova nomeando o que faltou/sobrou**.
- describe 2 (`:246-259`) congela — **separadamente** — o TIPO `AcervoFilial` de `import-logs.ts` como
  tendo **exatamente** `['anotacoes', 'ativos', 'movimentacoes', 'termos_gerados']`. É o espalhamento
  escondido: uma tabela nova entrando por dentro de `...acervo` não apareceria no describe 1.
- describe 3 confere que `nao_incluido` existe nos três backups (import/conflito/reset) e que o do
  reset ganhou `versao`/`contagens` na F54.
- describe 4 são guardas do próprio parser (não mexem no meu escopo).

`backup-completude.test.ts` é uma trava DIFERENTE e ortogonal: ela varre `src/` por `.from('<bucket>').remove(`
e exige que toda remoção de artefato de Storage esteja classificada como `copia-antes` ou `dispensado`
com motivo. Ela é sobre os `.docx` de termo (F54), **não** sobre linhas de tabela — o conserto da FK
desta fase não mexe em nenhuma chamada `.remove(` nova, então essa suíte só precisa continuar verde
(nada a fazer nela, a não ser não introduzir uma remoção de Storage nova).

## (b) Como o restaurador insere, a ordem, a janela, o `set constraints`, e o que faz com chave
    desconhecida ou versão 2

`scripts/db/restaurar.mjs` (lido inteiro).

**`ORDEM_DE_INSERCAO`** (`:203-210`), a ordem topológica das 24 FKs, TAL QUAL `docs/PLAN-F54.md` §4
(`:255-256`) já descreve:
```js
export const ORDEM_DE_INSERCAO = ['ativos', 'movimentacoes', 'pendencias_item', 'lancamentos_item', 'anotacoes', 'termos_gerados']
```
`montarTransacao` (`:277-312`) monta UMA transação: `begin;` → `set constraints all immediate;` (armadilha
4, 1ª metade) → `alter table movimentacoes disable trigger trg_aplicar_movimentacao;` → `alter table
lancamentos_item disable trigger trg_valida_lancamento_item;` → abre a janela
`set_config('estoque.dev_destrutivo','on',true)` → **para cada tabela de `ORDEM_DE_INSERCAO` que exista
no backup**, um `insert into public.<tabela> (...) ... values ...;` gerado por `sqlDeInsercao` (`:256-264`,
com `overriding system value` só para `movimentacoes`) → fecha a janela → religa os dois triggers →
`set constraints all deferred;` (armadilha 4, 2ª metade) → `setval` da sequência de `ordem` (armadilha 2)
→ `commit;`.

`sqlDeInsercao` (`:256-264`) **insere QUALQUER array que venha sob o NOME de uma das seis tabelas de
`ORDEM_DE_INSERCAO`** — ele não valida o schema da linha contra a tabela real; se o backup tiver uma
chave `pendencias_item` com objetos que não batem 1:1 com as colunas da tabela, o Postgres é quem vai
recusar (ou pior, aceitar com `null` nas colunas que faltarem: `literal(l[c] ?? null)`, `:261`).

**Chave desconhecida** (ex.: `lancamentos_desvinculados`, `ponteiros_perdidos`): hoje é **ignorada em
silêncio**. `montarTransacao` só itera `ORDEM_DE_INSERCAO`; qualquer chave de topo que não seja uma
dessas seis simplesmente não é lida por `sqlDeInsercao`. **Achado que muda o desenho do restaurador**:
isso já vale HOJE para o backup do RESET — `montarBackupDoReset` (`src/lib/queries/dev-destrutivo.ts:560-585`)
grava um bloco `ponteiros_perdidos` desde a F23/F54, e `restaurar.mjs` **nunca o leu, nem lê hoje** — é
uma lacuna PRÉ-EXISTENTE do restaurador, não uma introduzida por esta fase, mas que só se torna visível
(e urgente) agora, porque a F56 precisa do MESMO mecanismo para os ponteiros soltos do import.

**Versão 2 (ou qualquer versão)**: `versaoDoBackup` (`:221-223`) só lê o NÚMERO (`0` se ausente) e o
imprime (`:358-359`). Não há NENHUMA ramificação por versão em `montarTransacao` nem em `main()` — um
backup `versao: 2` é processado **exatamente** como um `versao: 1`: as tabelas que `ORDEM_DE_INSERCAO`
conhece são inseridas, as chaves novas são ignoradas, e o script termina dizendo "Restaurado." sem
avisar que faltou religar nada. **Não há recusa de versão desconhecida hoje** — é exatamente a lacuna
que o critério 17 da ordem pede para fechar.

A conferência de contagens (`main`, `:389-397`) já é **genérica por construção**: itera
`Object.entries(backup.contagens)` e compara `backup[chave].length` — se eu acrescentar `pendencias_item`
(e, se eu escolher o mesmo padrão de nome, `lancamentos_desvinculados`/`ponteiros_perdidos`) dentro de
`contagens`, a impressão da conferência funciona **sem** mexer em código, porque `pendencias_item` já é
uma chave de `ORDEM_DE_INSERCAO` e as outras duas, se eu as adicionar ao objeto de topo do backup,
casam por nome com a chave de `contagens`.

## (c) O fluxo exato de `aplicarImport`, e a régua de `RECUSAS_DA_RPC`

`src/lib/actions/importar.ts:387-686`, ordem real:
1. `exigirAdmin` → `aplicarSchema.safeParse(input)` (`:397-400`) — se FALHAR aqui, devolve erro **sem
   subir backup nenhum** (é antes do try do backup).
2. Filial existe/ativa; confirmação (`confirmacaoImportConfere`); revalidação de `custoSubstituir`
   (chama o banco de novo) comparada a `custoPreview`; termos multi-filial bloqueiam.
3. **O backup sobe** (`:467-515`) — `exportarAcervoFilial` + `JSON.stringify` + `upload(..., {upsert:false})`.
   Se o upload falhar, retorna erro **e a RPC nunca é chamada** (nenhum evento `import_falhou` é gravado
   neste ramo — achado: uma falha de upload de backup não deixa trilha em `eventos_admin` hoje).
4. `client.rpc('importar_ativos_substituir', ...)` (`:530-535`).
5. **Ramo de erro** (`:536-602`, o corpo do fato 30):
   - `registrarFalha` (log de servidor).
   - `if (RECUSAS_DA_RPC.has(error.code ?? '')) { await descartarBackupNaoUsado(...) } else { registrarFalha({escopo:'import.rpc-backup-nao-descartado', ...}) }` — **hoje `RECUSAS_DA_RPC = new Set(['P0001','22023','42501','57014'])`** (`:90`). `23503` (foreign_key_violation) **não está na lista**, então cai no `else`: o backup FICA no bucket (correto — não sabemos se comitou), mas só um log de servidor registra isso, ninguém na trilha administrativa vê.
   - **O bug exato do fato 30** (`:588-599`): o evento `import_falhou` é gravado **sempre** com
     ```js
     detalhe: { ..., backup_descartado: backupPath }
     ```
     — a chave `backup_descartado` é escrita **incondicionalmente**, mesmo quando o backup NÃO foi
     descartado (ramo `else` acima). Não há ramificação entre "descartei" e "fiquei" na escrita do
     evento — só na chamada a `descartarBackupNaoUsado`.
   - retorna `{ ok:false, erro: traduzErroBanco(error.message, error.code) }`.
6. `rpcRetornoSchema.safeParse(data)` falhar → **a RPC JÁ COMMITOU** (delete+insert aconteceram); não há
   o que descartar; mensagem genérica pedindo para conferir os ativos. **Nenhum evento é gravado neste
   ramo** (nem `import_executado` nem `import_falhou`) — achado: um retorno fora do formato depois de um
   import bem-sucedido não deixa trilha em `eventos_admin`, só o log de servidor.
7. Sucesso: cópia dos `.docx` para o backup, `import_executado` gravado com `backup_path: backupPath`
   (`:661`) — **aqui sim** a chave é `backup_path`, a mesma que a 12ª checagem lê.

`RECUSAS_DA_RPC` está em `:76-90`, com a régua escrita: **"sei que não commitou", não "deu erro"**. A
justificativa por trás da lista fechada (P0001 = raises da própria RPC; 22023 = parâmetro inválido;
42501 = permissão; 57014 = timeout de statement, que aborta a transação inteira no servidor) é que erro
de rede/gateway chega sem código ou com código de outra família e a RPC PODE ter commitado do outro
lado — nesses casos o backup fica, de propósito.

## (d) `import_substituir.sql`: estrutura e esqueleto do cenário novo

Lido inteiro (487 linhas). `begin;` na linha 64, `rollback;` na linha 487 (fato 35 confirmado
literalmente). Seções: 0 (as 8 auxiliares isoladas, numa 3ª filial 'F19 Teste C', roda como `postgres`
— superusuário, bypassa RLS, então INSERT direto em `pendencias_item`/`lancamentos_item` funciona sem
policy), 1 (happy path, filial A), 2 (`p_contagens` NULL recusado), 3 (`p_backup_path` vazio recusado),
4 (Substituir tudo só na filial-alvo, filial B). Convenção: `raise notice '✓ ...'` / `raise warning
'✗ ...'`; `v_ok`/`v_falhas` acumulam; termina com `raise notice 'FIM import_substituir: % asserções, %
falhas', ...`.

Como as fixtures de pendência/lançamento nascem nos roteiros HOJE: **`restauracao.sql`** (não
`import_substituir.sql`) é quem já monta esse cenário, e faz por INSERT DIRETO, não por RPC de app:
- pendência de item "orgânica": insere `movimentacoes` (compra → saida → devolucao com
  `itens_faltantes: array['carregador']`) e o TRIGGER `trg_aplicar_movimentacao` cria a
  `pendencias_item` sozinho (`restauracao.sql:110-114`, `1b`: "o trigger criou 1 pendência").
- pendência "à mão" (mais simples, o padrão que uso no esqueleto abaixo): `insert into
  pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador) values (...)`
  (`restauracao.sql:267-268`) — funciona porque o roteiro roda como `postgres`.
- lançamento com `pendencia_item_id`: nasce em produção pela RPC `resolver_pendencias_item_com_lancamentos`
  (corpo vigente na `0126:487-...`, INSERT em `:584-599`/`:609-623` com `pendencia_item_id`), mas para
  fixture de CI o caminho mais simples e já usado na casa é o INSERT direto (mesmo argumento acima).
- `set constraints all immediate`/`deferred`: já usado em `restauracao.sql:162` (antes de mexer nos
  gatilhos) e `:260` (depois, antes de religar `trg_aplicar_movimentacao`) — é o precedente EXATO que o
  fato 35 pede para o cenário novo.

**Esqueleto SQL** (a acrescentar como CENÁRIO 5 em `import_substituir.sql`, depois do cenário 4, dentro
do mesmo `do $$ ... end $$`; nomes ilustrativos — dados 100% fictícios, prefixo `ZZF56`):

```sql
-- ---------------------------------------------------------------
-- CENARIO 5 — F56: o "Substituir tudo" não estoura por FK, e desvincula sem
--   mudar saldo (fatos 27-35). Filial D isolada das 1-4.
-- ---------------------------------------------------------------
insert into public.filiais (slug, nome) values ('zzf56-teste-d', 'F56 Teste D') returning id into v_fd;
insert into public.filiais (slug, nome) values ('zzf56-teste-e', 'F56 Teste E') returning id into v_fe;
v_prefixo_d := public.prefixo_backup_import(v_fd);
insert into storage.objects (bucket_id, name, owner) values ('backups-import', v_prefixo_d || 'existe.json', v_prof);

-- 5.1 lançamento preso a MOVIMENTAÇÃO do acervo (fica dentro do que se apaga)
insert into public.ativos (patrimonio, service_tag, categoria, filial_id) values
  ('ZZF56D0001','ZZF56STD1','notebook', v_fd) returning id into v_ativo_d1;
insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por) values
  (v_ativo_d1, 'compra', current_date, v_fd, v_prof) returning id into v_mov_d1;
insert into public.itens (nome, tipo_id, filial_id) values ('ZZF56 Item', <tipo_valido>, v_fd) returning id into v_item_d;
insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, movimentacao_id, criado_por)
  values (v_item_d, v_fd, 'saida', 1, current_date, v_mov_d1, v_prof) returning id into v_lanc_d1;

-- 5.2 pendência ABERTA do acervo (à mão, como restauracao.sql:267-268)
insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador)
  values (v_ativo_d1, v_mov_d1, 'carregador', v_fd, 'ZZF56 Fulano') returning id into v_pend_aberta;

-- 5.3 pendência RESOLVIDA com lançamento (o elo pendencia_item_id)
insert into public.ativos (patrimonio, service_tag, categoria, filial_id) values
  ('ZZF56D0002','ZZF56STD2','notebook', v_fd) returning id into v_ativo_d2;
insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por) values
  (v_ativo_d2, 'compra', current_date, v_fd, v_prof) returning id into v_mov_d2;
insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador,
  status, desfecho, resolvida_em, resolvida_por)
  values (v_ativo_d2, v_mov_d2, 'mouse', v_fd, 'ZZF56 Fulano',
          'resolvida', 'recuperado', now(), v_prof) returning id into v_pend_resolvida;
insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, pendencia_item_id, criado_por)
  values (v_item_d, v_fd, 'retorno', 1, current_date, v_pend_resolvida, v_prof) returning id into v_lanc_d2;

-- 5.4 substituto em OUTRA filial (E) apontando para um ativo de D
insert into public.ativos (patrimonio, categoria, filial_id, substitui_ativo_id) values
  ('ZZF56E0001', 'notebook', v_fe, v_ativo_d1) returning id into v_ativo_e_sub;

-- 5.5 ativo TRANSFERIDO: nasceu em D (pendência com filial_id = D), hoje mora em E
insert into public.ativos (patrimonio, categoria, filial_id) values
  ('ZZF56D0003', 'notebook', v_fd) returning id into v_ativo_d3;
insert into public.movimentacoes (ativo_id, tipo, data, filial_id, criado_por) values
  (v_ativo_d3, 'compra', current_date, v_fd, v_prof) returning id into v_mov_d3;
insert into public.pendencias_item (ativo_id, movimentacao_id, item, filial_id, colaborador)
  values (v_ativo_d3, v_mov_d3, 'mochila', v_fd, 'ZZF56 Fulano') returning id into v_pend_transferido;
update public.ativos set filial_id = v_fe where id = v_ativo_d3; -- "hoje" o ativo está em E

-- saldo ANTES (a régua "antes = depois")
select coalesce(sum(case tipo::text when 'entrada' then quantidade when 'retorno' then quantidade
       when 'saida' then -quantidade when 'reserva' then -quantidade when 'liberacao' then quantidade
       when 'ajuste' then (case when regularizacao then 0 else quantidade end) else 0 end),0)
  into v_saldo_antes from public.lancamentos_item where item_id = v_item_d and filial_id = v_fd;
-- (usar a MESMA expressão que a view/relatório de saldo do item usa — conferir contra
--  src/lib/queries/itens (ou a view rel_saldo_item, se existir) em vez de reinventar a fórmula aqui)
select coalesce(sum(...),0) into v_saldo_colab_antes from public.lancamentos_item
  where colaborador_id = <colaborador de referência, se o cenário usar colaborador_id> ...;

-- Import da filial D, plano vazio de ativos-alvo (só testa o DESVÍNCULO/APAGAMENTO; o
-- CENÁRIO 4 já prova a substituição por linhas do plano) — ou 1 ativo trivial no plano.
set constraints all immediate;
begin
  v_result := public.importar_ativos_substituir(
    jsonb_build_object('filialId', v_fd, 'confirmacao','F56 Teste D',
                        'arquivoHash','ZZF56HASHD','totalLinhasDados',0,
                        'ativos', jsonb_build_array()),   -- ajustar: motor recusa array vazio hoje (0a) — usar 1 ativo trivial
    v_prefixo_d || 'existe.json',
    jsonb_build_object('ativos',3,'movimentacoes',3,'anotacoes',0,'termos',0));  -- + as chaves novas quando existirem
  v_ok := v_ok + 1; raise notice '✓ 5a import da filial D com FK cruzada NÃO estourou';
exception when foreign_key_violation then
  v_falhas := v_falhas + 1;
  raise warning '✗ 5a import estourou por FK (23503) — o conserto não cobriu um dos cinco caminhos: %', sqlerrm;
end;
set constraints all deferred;

-- 5b: os dois lançamentos ficaram SEM o vínculo antigo
select movimentacao_id, pendencia_item_id into v_mid, v_pid from public.lancamentos_item where id = v_lanc_d1;
if v_mid is null then v_ok:=v_ok+1; raise notice '✓ 5b lancamento preso a movimentação foi desvinculado';
else v_falhas:=v_falhas+1; raise warning '✗ 5b movimentacao_id ainda aponta para %', v_mid; end if;

select pendencia_item_id into v_pid from public.lancamentos_item where id = v_lanc_d2;
if v_pid is null then v_ok:=v_ok+1; raise notice '✓ 5b2 lancamento que resolveu a pendência foi desvinculado';
else v_falhas:=v_falhas+1; raise warning '✗ 5b2 pendencia_item_id ainda aponta para %', v_pid; end if;

-- 5c: as duas pendências do acervo (aberta e resolvida) sumiram
select count(*) into v_cnt from public.pendencias_item where id in (v_pend_aberta, v_pend_resolvida);
if v_cnt = 0 then v_ok:=v_ok+1; raise notice '✓ 5c as duas pendências do acervo foram apagadas';
else v_falhas:=v_falhas+1; raise warning '✗ 5c sobraram % pendências do acervo', v_cnt; end if;

-- 5d: o substituto em E teve o ponteiro anulado
select substitui_ativo_id into v_sub from public.ativos where id = v_ativo_e_sub;
if v_sub is null then v_ok:=v_ok+1; raise notice '✓ 5d ponteiro do substituto em outra filial foi anulado';
else v_falhas:=v_falhas+1; raise warning '✗ 5d substitui_ativo_id ainda aponta para %', v_sub; end if;

-- 5e: a pendência do ativo TRANSFERIDO (hoje em E) sobreviveu — critério da RPC é o ATUAL
select count(*) into v_cnt from public.pendencias_item where id = v_pend_transferido;
if v_cnt = 1 then v_ok:=v_ok+1; raise notice '✓ 5e pendência do ativo transferido (hoje em outra filial) ficou intocada';
else v_falhas:=v_falhas+1; raise warning '✗ 5e pendência do transferido foi apagada por engano (usou filial_id histórico?)'; end if;

-- 5f: saldo do item e saldo_colaborador IDÊNTICOS antes/depois (desvincular != mudar saldo)
-- (repetir a mesma leitura de v_saldo_antes/v_saldo_colab_antes e comparar)
```

Notas de implementação sobre o esqueleto: (i) o `jsonb_build_array()` vazio bate com `import_validar_plano`'s
recusa de plano vazio (cenário `0a`) — o cenário 5 precisa OU de 1 ativo trivial no plano OU chamar a
auxiliar `import_apagar_acervo_filial` isolada (como a seção 0g já faz) em vez da orquestradora inteira,
se o objetivo for só provar o desvínculo sem produzir ativo novo; prefiro a orquestradora inteira porque
é o único caminho que exercita `import_revalidar_contagens` com as contagens novas ao mesmo tempo — então
recomendo 1 ativo trivial no plano. (ii) a fórmula de saldo de item usada acima é ilustrativa — o
implementador deve puxar a MESMA expressão que `src/lib/queries/itens*` ou a view SQL usa (não
reinventar), para não introduzir uma terceira fórmula de saldo divergente na casa.

## (e) Mutações: formato, esqueleto das novas, e como reapontar as quatro presas

Formato de uma entrada (`scripts/db/mutacoes.mjs:52-62`, `Mutacao`): `{id, roteiro, classe, derruba,
porque, sql, prova?, policies?}`. `sql` normalmente vem de `mutarFuncao(assinatura, de, para, id)` —
açúcar para `trocarNoCorpo(corpoVigente(assinatura).sql, de, para, id)` (`:76-79`). `mutarFuncao` roda
**no carregamento do módulo** (a chamada está dentro do array literal, não dentro de uma função lazy) —
se `de` não existir no corpo vigente (ou existir 2+ vezes), `trocarNoCorpo` (`corpo-vigente.mjs:323-341`)
lança e derruba o `import` do catálogo inteiro (`mutacoes.test.mts` e `db:test:mutations` param de
rodar, não só as mutações do import).

`corpoVigente` (`corpo-vigente.mjs:19-24`, `:43-47`, `:280-307`) varre `supabase/migrations/` em ORDEM
CRESCENTE de nome de arquivo e devolve o corpo do **ÚLTIMO** `create [or replace] function` daquela
assinatura — ou seja, assim que a `0140` existir, `corpoVigente('public.import_apagar_acervo_filial(smallint)')`
passa a ler o corpo de DENTRO DA `0140`, não mais da `0131`. As quatro mutações que citam texto desse
corpo (ou dos outros dois recriados) precisam que o texto procurado exista **verbatim, exatamente uma
vez** no corpo NOVO — é isso, e só isso, que "reapontar" significa aqui: não é mudar `roteiro`/`derruba`/
`prova`, é conferir/ajustar o literal de `de`/`para` para casar com o texto como ele sai na `0140`.

As quatro, com o EXATO trecho que cada uma procura hoje (`mutacoes.mjs`):

1. **`import-sem-revalidacao-de-contagens`** (`:676-706`) — alvo `public.import_revalidar_contagens(jsonb, smallint)`.
   `de`: `` `    raise exception 'Revalidação de contagens obrigatória: gere o preview novamente antes de aplicar (p_contagens ausente ou inválido).';` ``
   `para`: `return;` marcado. Sobrevive intacta SE a mensagem do `raise` de "contagens ausentes" não mudar
   uma vírgula — e ela não precisa mudar para a F56 (a regra nova, "chave ausente vale 0", entra DEPOIS
   deste `raise`, não troca este texto).

2. **`import-revalidacao-nao-compara-o-vivo`** (`:708-728`) — mesmo alvo.
   `de`:
   ```
     if v_conferidos <> v_esp_ativos or v_liv_movs <> v_esp_movs
        or v_liv_anot <> v_esp_anot or v_liv_termos <> v_esp_termos then
   ```
   **ESTA PRECISA MUDAR DE VERDADE**: a Decisão 9 acrescenta chaves novas a `p_contagens`
   (`pendencias_item`/`lancamentos_desvinculados` — nomes a decidir) e a condição de comparação ganha
   termos novos (`or v_liv_pend <> v_esp_pend or ...`). O `de` literal desta mutação **deixa de bater**
   assim que a condição crescer — é EXATAMENTE o caso que `trocarNoCorpo` foi desenhado para pegar: o
   `npm run test` (que carrega `mutacoes.mjs` no `mutacoes.test.mts`) vai **quebrar alto, no carregamento**,
   apontando a mutação pelo nome, assim que a `0140` mudar essa condição — então não dá para esquecer
   de reapontá-la: o teste força a mão.

3. **`import-trilha-do-apagado-mente-nas-anotacoes`** (`:749-776`) — alvo
   `public.import_apagar_acervo_filial(smallint)`. `de`: `` `  get diagnostics v_anot_apagadas = row_count;` ``.
   Provável SOBREVIVER intacta se o conserto da FK for inserido ANTES do bloco de `movimentacoes`/`anotacoes`/
   `termos_gerados`/`ativos` (a ordem natural: desvincular lançamentos → apagar pendências → [bloco
   existente inalterado] → anular ponteiros de substituto → apagar ativos) — mas **precisa ser conferida**
   depois de escrever a `0140`, porque um recuo/indentação diferente já quebraria o match literal.

4. **`f52-import-perde-a-guarda-de-filial`** (`:1213-1236`) — alvo
   `public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)`. `de`: o bloco de 4 linhas do `if not
   public.pode_escrever_filial(v_filial) then raise exception ... end if;`. Este bloco fica ANTES do
   `pg_advisory_xact_lock` e de tudo que a F56 mexe (backup/contagens/apagar acervo) — **alta chance de
   sobreviver intacta**, mas ainda precisa ser conferida porque `create or replace function` reescreve a
   função inteira e QUALQUER diferença de espaçamento na regravação quebra o match.

**Esqueleto das mutações NOVAS** (Decisão 9/critério 18 pedem 3 ou 4 — "sem cada desvínculo, sem o apagar
das pendências, sem a contagem nova"), no mesmo array `IMPORT_SUBSTITUIR`:

```js
{
  id: 'import-nao-desvincula-lancamento-da-movimentacao',
  roteiro: 'import_substituir.sql',
  classe: 'guarda-neutralizada',   // ou uma classe nova, ex. 'fk-nao-tratada'
  derruba: ['5a'],                 // o rótulo do CENÁRIO 5 que vira ✗ (a RPC estoura 23503 e o
                                    // roteiro tem de capturar e emitir ✗ 5a — não abortar)
  porque: 'O lançamento preso à movimentação do acervo deixa de ser desvinculado antes do delete — a "Substituir tudo" volta a estourar por chave estrangeira na filial que tiver esse caso (a bomba do fato 27/30).',
  sql: mutarFuncao(
    'public.import_apagar_acervo_filial(smallint)',
    '<a linha/bloco exato do UPDATE que zera lancamentos_item.movimentacao_id>',
    '<comentário MARCA, sem o UPDATE>',
    'import-nao-desvincula-lancamento-da-movimentacao',
  ),
},
{
  id: 'import-nao-desvincula-lancamento-da-pendencia',
  derruba: ['5a'],   // (o MESMO 23503 estoura — a distinção entre as duas mutações é qual UPDATE
                      //  falta; o cenário 5 pode precisar de DOIS 23503 distintos com dois planos-
                      //  fixture separados para que cada mutação derrube um rótulo PRÓPRIO, senão
                      //  as duas convergem no mesmo ✗ e uma fica "detectada de carona" pela outra)
  ...
},
{
  id: 'import-nao-apaga-pendencias-do-acervo',
  derruba: ['5c'],
  porque: 'As pendências de item do acervo substituído deixam de ser apagadas — o backup e a tela dizem "substituído", mas a pendência velha continua na mesa de /pendencias apontando para um ativo que não existe mais.',
  ...
},
{
  id: 'import-nao-anula-ponteiro-de-substituto',
  derruba: ['5d'],
  porque: 'O substituto de outra filial fica com substitui_ativo_id apontando para um ativo apagado — referência pendurada que a ficha do ativo (ou um join futuro) pode tentar seguir.',
  ...
},
```

⚠ Ponto de desenho a decidir na implementação (não resolvido aqui, é chamada de quem escrever o SQL):
se as quatro mutações "sem-desvínculo" forem aplicadas UMA DE CADA VEZ contra o MESMO cenário 5 (o
padrão do injetor: uma mutação, um banco descartável, um roteiro inteiro), cada UPDATE que falta faz o
`DELETE` seguinte (da pendência, ou do ativo) estourar `23503` — e cada mutação precisa de um rótulo
`derruba` PRÓPRIO e DISTINGUÍVEL. Como as 4 quebras convergem para o MESMO ponto de explosão (o
`delete from ativos`/`delete from pendencias_item` dentro da MESMA auxiliar), a forma mais simples de
dar 4 rótulos distintos é ter os asserts 5b/5b2/5c/5d cobrindo, cada um, um EFEITO diferente — e o
`exception when foreign_key_violation` do 5a captura a explosão comum e marca **✗ 5a** para TODAS elas
igualmente (a régua "captura e emite ✗ do rótulo nomeado", fato 35). Duas leituras possíveis: (i) um
`derruba: ['5a']` comum às quatro (mais simples, mas quatro mutações "batem" no mesmo rótulo — o
injetor aceita isso, `derruba` é uma LISTA, não precisa ser 1:1); (ii) fixtures separadas por mutação
(mais fiel, mais cara em linhas de roteiro). Recomendo (i): reaproveitar `derruba: ['5a']` para as
quatro nasce mais barato e ainda prova a coisa certa — a explosão sob FK volta a existir sempre que
QUALQUER um dos quatro passos falte.

**O teto do injetor, hoje**: medido rodando `import('./scripts/db/mutacoes.mjs')` (sem banco — pura
leitura de migrations): `MUTACOES.length = 67`, `QUARENTENA.length = 2` (total 69; fração em quarentena
2,9% — bem abaixo do teto de 1/3 que `mutacoes.test.mts` exige). O teste de teto
(`scripts/db/mutacoes.test.mts:191-192`) hoje é:
```js
expect(MUTACOES.length).toBeGreaterThanOrEqual(20)
expect(MUTACOES.length).toBeLessThanOrEqual(68)
```
— **67 ativas, teto 68: só 1 de folga**. A convenção documentada no próprio teste (comentários em
`:117-118`, `:133-135`, `:176-178`) é "uma de folga sobre o número de hoje, com o motivo escrito" — cada
vez que o lote cresce, o teto sobe para `novo_total + 1`, nunca mais, para não virar ritual. Se a F56
acrescentar **as 4 mutações do esqueleto acima**, `MUTACOES.length` vai a **71**, e o teste precisa que o
teto suba para **72** (com a mesma nota de motivo) NO MESMO COMMIT que acrescenta as mutações — senão
`mutacoes.test.mts` reprova sozinho, sem precisar de banco.

## (f) Proposta — formato `versao: 2`, restaurador, cenários de `restauracao.sql`

### Proposta de formato `versao: 2` (import)

Manter `AcervoFilial`/`exportarAcervoFilial` **intactos** (continuam as 4 tabelas que
`import_apagar_acervo_filial` sempre apagou incondicionalmente — isso preserva o describe 2 de
`backup-formato.test.ts` sem mudança). Acrescentar TRÊS chaves novas de TOPO ao objeto `backup` de
`aplicarImport`:

```js
const backup = {
  versao: 2,
  exportadoEm: ...,
  filial: {...},
  contagens: { ...custoPreview, pendencias_item: pend.length,
               lancamentos_desvinculados: desvinc.length,
               ponteiros_perdidos: ponteiros.length },
  nao_incluido: [],   // a linha da F54 sobre pendencias_item deixa de ser verdade — reescrever
  ...acervo,           // inalterado: ativos, movimentacoes, anotacoes, termos_gerados
  pendencias_item: pend,                 // linhas INTEIRAS (select('*')) — cabe em ORDEM_DE_INSERCAO
  lancamentos_desvinculados: desvinc,    // [{id, movimentacao_id, pendencia_item_id}] — o PRÉ-IMAGEM
                                          // dos dois elos, para todo lancamentos_item tocado por
                                          // QUALQUER um dos dois UPDATEs (não linhas inteiras — não é
                                          // insert, é patch)
  ponteiros_perdidos: ponteiros,         // linhas INTEIRAS de `ativos` FORA do recorte cujo
                                          // substitui_ativo_id apontava para o recorte — MESMO NOME e
                                          // MESMA FORMA de `dev-destrutivo.ts:526-548`
}
```

Motivo do nome `pendencias_item` (chave = nome da tabela): ela JÁ está em `ORDEM_DE_INSERCAO`
(`restaurar.mjs:206`), então o restaurador a insere de graça, sem código novo — é o único dos três
blocos novos que se comporta como um INSERT simples. `lancamentos_desvinculados` e `ponteiros_perdidos`
são, de propósito, chaves que NÃO batem com nome de tabela — reforça a leitura de `restaurar.mjs`
(fato 34: "nunca sob `lancamentos_item`, que ele tentaria inserir como linha").

`backup-formato.test.ts` — mudança **por desenho**, com ata: `formatos[2]` do backup do import passa a
ser o conjunto de `formatos[1]` **mais** `pendencias_item`, `lancamentos_desvinculados`,
`ponteiros_perdidos` (12 chaves). `formatos[1]` continua declarado (histórico, o teste não some com a
versão antiga).

### Proposta para o restaurador

1. Constante `MAIOR_VERSAO_CONHECIDA = 2`; em `main()`, logo após ler `versao`, **recusar** (`process.exit(1)`,
   sem `--aplicar` nem sem) qualquer `versao > MAIOR_VERSAO_CONHECIDA` — mensagem: "este restaurador
   conhece até a versão N; o backup é da versão M — atualize o script antes de restaurar" (nunca
   silenciosamente ignorar as chaves novas, que é o comportamento de hoje).
2. `montarTransacao` ganha, **dentro da janela** `estoque.dev_destrutivo` (antes do
   `set_config(...,'off',true)`, depois do laço de `ORDEM_DE_INSERCAO`) dois blocos condicionados a
   `backup.versao >= 2`:
   - se `backup.lancamentos_desvinculados` existir: um `update public.lancamentos_item as li set
     movimentacao_id = v.movimentacao_id, pendencia_item_id = v.pendencia_item_id from (values ...) as
     v(id, movimentacao_id, pendencia_item_id) where li.id = v.id;` (religa OS DOIS elos de uma vez —
     não precisa de trigger nenhum, porque `trg_valida_lancamento_item` é `BEFORE INSERT` só, fato 32,
     e não dispara em UPDATE; `guarda_acervo` recusa UPDATE em `lancamentos_item` fora da janela, mas a
     janela já está aberta aqui).
   - se `backup.ponteiros_perdidos` existir: um `update public.ativos as a set substitui_ativo_id =
     v.substitui_ativo_id from (values ...) as v(id, substitui_ativo_id) where a.id = v.id;` (sem
     necessidade de janela — `ativos_guarda_acervo` só recusa DELETE, não UPDATE, mas fica dentro dela
     por simetria/segurança).
   - **Isso também conserta, de graça, a lacuna pré-existente do restaurador para o backup do RESET**:
     `montarBackupDoReset` já grava `ponteiros_perdidos` desde a F23/F54 e nunca foi lido; o mesmo bloco
     de UPDATE serve para os dois formatos, desde que o NOME da chave seja o mesmo (`ponteiros_perdidos`)
     — daí a recomendação de reusar o nome.
3. `sqlDeInsercao`/`literal` não precisam mudar (o `insert` de `pendencias_item` já funciona hoje).

### Proposta para `restauracao.sql`

Acrescentar, no mesmo roteiro (ou um NOVO roteiro `restauracao_import.sql`, se o implementador preferir
não misturar o cenário do reset com o do import — ambos usam o MESMO `restaurar.mjs`, então testar os
dois formatos no MESMO arquivo, com seções numeradas 6/7, evita duplicar a fixture de filial/perfil):
- 6a: `versaoDoBackup({versao: 3})` é recusado por `exigirAmbientePermitido`-equivalente no restaurador
  (uma checagem NOVA, pura, testável sem banco — pode virar teste em `restaurar-guarda.test.mts` em vez
  de SQL puro, já que a recusa de versão não depende do Postgres).
- 6b/6c (precisam de Postgres, então SQL): um `lancamentos_item` com `movimentacao_id`/`pendencia_item_id`
  NULOS (simulando pós-desvínculo) é UPDATE'd pelo bloco novo do restaurador para os valores do
  "backup", e a leitura confere que os dois elos voltaram.
- 6d: um `ativos.substitui_ativo_id` nulo (simulando pós-import) é UPDATE'd de volta pelo bloco de
  `ponteiros_perdidos`.

## (g) Proposta — Decisão 10 (RECUSAS_DA_RPC, chaves do `import_falhou`, o que a 12ª checagem lê)

### SQLSTATE em `RECUSAS_DA_RPC`

A régua escrita em `importar.ts:79` é **"sei que não commitou"**, não "deu erro". Testada contra o
corpo real de `importar_ativos_substituir` (0132, lido inteiro, `:425-575`): não há NENHUM `begin ...
exception ... end` envolvendo o corpo da função nem savepoint interno — qualquer exceção não capturada
dentro dela aborta a transação INTEIRA (é uma única chamada RPC = uma única transação implícita do
lado do PostgREST). Logo, **todo SQLSTATE que só pode ter sido levantado DENTRO da execução da função
no servidor** satisfaz a régua, porque por definição do Postgres a transação inteira não commitou.

- **`23503` (foreign_key_violation) — ADICIONAR.** É literalmente o achado do fato 30: hoje ela NÃO
  está na lista, e por isso o backup fica órfão sem trilha correta. Depois do conserto da FK (Frente F
  desta mesma fase), 23503 deixa de ser o caminho comum — mas continua sendo o SQLSTATE que aparece se
  um SEXTO caminho de FK não tratado aparecer amanhã (fato 27 é "cinco caminhos, não dois" — já foi
  revisto uma vez), e é exatamente aí que a régua "sei que não commitou" precisa estar certa.
- **`23505` (unique_violation) — considerar.** Pode ocorrer em `import_criar_ativos` (corrida no índice
  único patrimônio+service_tag, ou no índice parcial de service_tag sem patrimônio) mesmo depois da
  checagem em `paresEmOutrasFiliais` (janela entre o preview e o apply). Mesma régua: erro DENTRO da
  função, transação inteira aborta.
- **`23514` (check_violation) — considerar**, pela mesma régua (ex.: um CHECK de `lancamentos_item` ou
  de `ativos` disparando por um valor que passou pelo Zod do preview mas não pelo CHECK do banco).
- **`40P01` (deadlock_detected)** — tecnicamente também satisfaz "sei que não commitou" (é DEFINIÇÃO de
  deadlock que a vítima é revertida por inteiro), mas é o caso MENOS provável (a RPC já serializa por
  `pg_advisory_xact_lock` por filial) — inclusão de baixo valor prático, custo baixo de incluir.
- **`40001` (serialization_failure)** — a IRMÃ `resetar_acervo` usa este código PARA o mesmo tipo de
  recusa ("estado mudou desde a prévia", `0089_reset_backup_do_recorte.sql:176`) — mas
  `import_revalidar_contagens` (0131/0132) levanta a recusa equivalente com o `errcode` PADRÃO do
  plpgsql (`P0001`, já coberto). **Não preciso adicionar 40001 para o import funcionar hoje** — é uma
  divergência de convenção entre irmãs (reset usa 40001, import usa P0001 implícito) que vale registrar
  em `docs/DECISOES.md` como achado, não como correção desta fase (mexer no `errcode` de
  `import_revalidar_contagens` teria de vir com prova de equivalência de mensagem, e não está no escopo
  do conserto da FK).

**Minha recomendação**: o mínimo que resolve o fato 30 e cobre a régua escrita é adicionar **`23503`**.
Se o implementador quiser fechar a régua por completo (em vez de só reagir ao achado), o conjunto
defensável é `{P0001, 22023, 42501, 57014, 23503, 23505, 23514}` — todos SQLSTATE que só nascem DENTRO
da execução da função. Deixo a decisão final (mínima vs. defensável) para quem implementa, com o
critério escrito: qualquer código que SÓ pode vir de dentro da transação da RPC entra; qualquer código
que possa vir de rede/gateway (sem code, ou HTTP puro) fica de fora.

### As chaves do `import_falhou`

Trocar a escrita incondicional de `backup_descartado` (`importar.ts:597`) por uma escrita CONDICIONAL —
a MESMA condição que já decide `descartarBackupNaoUsado` vs. o `else`:

```js
if (RECUSAS_DA_RPC.has(error.code ?? '')) {
  await descartarBackupNaoUsado(client, backupPath)
}

await registrarEventoAdmin({
  acao: 'import_falhou',
  ...
  detalhe: {
    ...,
    ...(RECUSAS_DA_RPC.has(error.code ?? '')
      ? { backup_descartado: backupPath }   // FICOU descartado — a chave antiga, agora fiel ao nome
      : { backup_path: backupPath }),        // FICOU no bucket — a chave que a 12ª checagem lê
  },
})
```

Nenhuma migration necessária: `eventos_admin.acao` já tem `import_falhou` no vocabulário fechado
(`0137`, `comment on column ... acao`), e essa migration lista só VERBOS, não chaves de `detalhe` (jsonb
livre) — mudar as chaves do `detalhe` não toca o comentário nem `src/lib/auditoria.ts`. Não há teste
hoje que pine o formato de `detalhe` de `import_falhou` (busquei `import_falhou`/`backup_descartado` em
`src/`: só `auditoria.ts` — o vocabulário de VERBOS — e o próprio `importar.ts`) — trocar as chaves não
quebra suíte nenhuma existente, mas idealmente ganha um teste NOVO (unitário, sem banco: mockar o client
do supabase-js e conferir que `registrarEventoAdmin` foi chamado com a chave certa em cada ramo).

### O que a 12ª checagem lê (confirmado, `0138_resumo_integridade_e_rotulo.sql:256-302`)

```sql
with registrados as (
  select l.backup_path as caminho from public.import_logs l where l.backup_path is not null
  union
  select e.detalhe->>'backup_path' from public.eventos_admin e
   where nullif(e.detalhe->>'backup_path', '') is not null
), ...
```
Só `import_logs.backup_path` (sempre presente nos imports que COMMITARAM, via `import_gravar_trilha`) e
`eventos_admin.detalhe->>'backup_path'`. **Nunca leu `backup_descartado`** — não porque fosse
proposital, mas porque `backup_descartado` sempre significou (na intenção original) "este backup FOI
apagado, não é órfão nem tem por que estar registrado". O fix da chave em (c)/(g) resolve o fato 30
inteiro sem tocar a `0138`: a partir do momento em que o ramo "backup fica" escrever
`detalhe.backup_path` em vez de `detalhe.backup_descartado`, a 12ª checagem passa a reconhecer esse
caminho como "registrado" e não o conta mais como órfão em `backup_orfao` — nenhuma migration nova
necessária para este pedaço.

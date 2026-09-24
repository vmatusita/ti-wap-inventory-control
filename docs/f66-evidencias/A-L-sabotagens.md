# F66 — as sabotagens A a L, com a saída real

Cada trava da fase provou que sabe ficar vermelha. Três fontes, todas com dado 100% fictício:

- **o CI do push 1** (run `36010011561`, commit `132ded4`: as travas sem as migrations — vermelhas de propósito), em
  `B-travas/ci-banco-sem-docker-132ded4.txt`;
- **o CI do push 2** (run `36017896078`, commit `69ec240`: a cadeia inteira — verde, e o injetor com as 150 mutações
  detectadas), em `B-travas/ci-verde-69ec240.txt`;
- **a mesa PGlite** (PostgreSQL 17.5 em WASM, só no scratchpad da sessão), com a cadeia até a `0179`: um banco novo do dump
  por sabotagem, o SQL da sabotagem, o roteiro. A mesa não é a autoridade (o CI é), mas é onde a sabotagem que não virou
  mutação do injetor roda. As diferenças de ambiente conhecidas da mesa (ICU, fuso, md5 de `prosrc`) não tocam nenhuma
  asserção citada aqui.

As saídas abaixo são as linhas `✗` e o `FIM` de cada rodada, copiadas por script dos arquivos de saída.

## A — a forma do recorte (16a, R-ACC-108)

No banco de antes (o CI do push 1), a 16a vermelha pelas 51 — a primeira acusada é a primeira tabela em ordem alfabética:

```
WARNING:  ✗ 16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima — public.anotacoes / leitura operador (using): sem o termo empresa_id = any (array (select public.empresas_do_membro())); public.anotacoes / operador anota (with check): sem o termo empresa_id = any (array (select public.empresas_de_escrita())
```

Com a cadeia inteira, a 16a verde (`FIM catalogo_policies: 42 asserções, 0 falhas` no push 2) e vermelha, PELO NOME, com
cada forma errada:

**A1 — uma das 51 de volta ao texto de antes (ativos / leitura operador: o piso sozinho)** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "leitura operador" on public.ativos using ((select public.papel_atual()) is not null);

-- a saída
✗ 16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima — public.ativos / leitura operador (using): sem o termo empresa_id = any (array (select public.empresas_do_membro())): 1 de 61 fora da regra
FIM catalogo_policies: 42 asserções, 1 falhas
```

**A2 — o termo só no USING de uma policy de UPDATE (motivos / admin atualiza: o WITH CHECK sem o termo)** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "admin atualiza" on public.motivos using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_de_admin()))) with check ((select public.e_admin()));

-- a saída
✗ 16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima — public.motivos / admin atualiza (with check): sem o termo empresa_id = any (array (select public.empresas_de_admin())): 1 de 61 fora da regra
FIM catalogo_policies: 42 asserções, 1 falhas
```

**A3 — empresas_do_membro() numa policy de escrita de admin (kits_modelos / admin insere)** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "admin insere" on public.kits_modelos with check ((select public.e_admin()) and empresa_id = any (array (select public.empresas_do_membro())));

-- a saída
✗ 16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima — public.kits_modelos / admin insere (with check): função errada: empresas_do_membro (a classe pede empresas_de_admin): 1 de 61 fora da regra
FIM catalogo_policies: 42 asserções, 1 falhas
```

**A4 — o termo num OR com o piso (tipos_item / leitura operador)** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "leitura operador" on public.tipos_item using ((select public.papel_atual()) is not null or empresa_id = any (array (select public.empresas_do_membro())));

-- a saída
✗ 16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima — public.tipos_item / leitura operador (using): o termo está fora da conjunção de cima (num or): 1 de 61 fora da regra
FIM catalogo_policies: 42 asserções, 1 falhas
```

**A5 — using (public.e_membro(empresa_id)) — a função recebe a coluna da linha** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
create function public.e_membro(p uuid) returns boolean language sql stable as $s$ select p = any (array (select public.empresas_do_membro())) $s$;
alter policy "leitura operador" on public.motivos using ((select public.papel_atual()) is not null and public.e_membro(empresa_id));

-- a saída
✗ 11a R1 nenhuma função recebe dado da linha fora da lista de exceções — por linha (use col = any (array (select public.<fn>())) ou declare com motivo e destino): public.motivos / leitura operador / e_membro: 1 de 148 fora da regra
✗ 16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima — public.motivos / leitura operador (using): sem o termo empresa_id = any (array (select public.empresas_do_membro())): 1 de 61 fora da regra
FIM catalogo_policies: 42 asserções, 2 falhas
```

**A6 — uma tabela sintética com empresa_id e policy sem o termo (o catálogo a acha sozinho)** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
create table public.f66_sabotagem (id int primary key, empresa_id uuid not null references public.empresas (id));
alter table public.f66_sabotagem enable row level security;
create policy "leitura operador" on public.f66_sabotagem for select to authenticated using ((select public.papel_atual()) is not null);

-- a saída
✗ 1a toda tabela de public está CLASSIFICADA negócio × infra — não classificada(s): f66_sabotagem: 1 de 30 fora da regra
✗ 6c toda policy de SELECT de public está numa das duas listas do piso — não decidida(s): f66_sabotagem: 1 de 24 fora da regra
✗ 10a toda policy de public está no universo congelado da doutrina — fora do universo (decida e congele): f66_sabotagem / leitura operador: 1 de 55 fora da regra
✗ 16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima — public.f66_sabotagem / leitura operador (using): sem o termo empresa_id = any (array (select public.empresas_do_membro())): 1 de 62 fora da regra
FIM catalogo_policies: 42 asserções, 4 falhas
```

No injetor (push 2): ```
f66-termo-em-or                                            catalogo_policies.sql                16a                               detectada            684 ms
f66-admin-com-empresas-do-membro                           catalogo_policies.sql                16a                               detectada            684 ms
```

## B — `to authenticated` (16f, R-ACC-111)

**B1 — uma policy de public volta a `to public`** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "leitura operador" on public.filiais to public;

-- a saída
✗ 16f toda policy de public e storage é to authenticated (e só authenticated) — outro papel: public.filiais / leitura operador: 1 de 62 fora da regra
FIM catalogo_policies: 42 asserções, 1 falhas
```

**B2 — uma policy de Storage volta a `to public`** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "termos leitura operador" on storage.objects to public;

-- a saída
✗ 16f toda policy de public e storage é to authenticated (e só authenticated) — outro papel: storage.objects / termos leitura operador: 1 de 62 fora da regra
FIM catalogo_policies: 42 asserções, 1 falhas
```

No injetor: ```
f66-policy-to-public                                       catalogo_policies.sql                16f                               detectada            688 ms
```

## C — a leitura, direção A (10a, R-ACC-110)

No banco de antes (push 1), a bateria acusa cada tabela pelo nome:

```
WARNING:  ✗ 10a direção A: o admin só da A não vê NENHUMA linha da B, em nenhuma tabela com empresa_id (as policies reais) — viu: anotacoes(1 da B) ativos(1 da B) colaboradores(1 da B) eventos_admin(1 da B) filiais(2 da B) import_logs(1 da B) import_prefixos_patrimonio(1 da B) import_termos_categoria(1 da B) import_termos_estado(1 da B) itens(1 da B) kits_modelos(1 da B) lancamentos_item(1 da B) membros(3 da B) motiv
```

Com a cadeia, o termo retirado de UMA policy:

**C1 — o termo retirado de UMA policy de leitura (itens / leitura operador) — a bateria acusa aquela tabela** (roteiro `isolamento_tenant.sql`)

```
-- a sabotagem
alter policy "leitura operador" on public.itens using ((select public.papel_atual()) is not null);

-- a saída
✗ 10a direção A: o admin só da A não vê NENHUMA linha da B, em nenhuma tabela com empresa_id (as policies reais) — viu: itens(1 da B): 1 de 24 fora da regra
✗ 10c direção B, com o piso neutralizado (o recorte SOZINHO): o admin só da B não vê NENHUMA linha da A — viu: itens(1 da A) : 1 de 98 fora da regra
FIM isolamento_tenant: 44 asserções, 2 falhas
```

No injetor: ```
f66-termo-sai-da-leitura                                   isolamento_tenant.sql                10a                               detectada            539 ms
```

## D — a direção B e o membro das duas (10c–10f)

No banco de antes (push 1), com o piso neutralizado, o recorte sozinho ainda não existia — e o membro das duas lia a
auditoria e o import da B:

```
WARNING:  ✗ 10c direção B, com o piso neutralizado (o recorte SOZINHO): o admin só da B não vê NENHUMA linha da A — viu: anotacoes(1 da A) ativos(4 da A) colaboradores(1 da A) eventos_admin(1 da A) filiais(6 da A) import_logs(1 da A) import_prefixos_patrimonio(8 da A) import_termos_categoria(6 da A) import_termos_estado(18 da A) itens(1 da A) kits_modelos(1 da A) lancamentos_item(1 da A) membros(7 da A) motivos(14 da
WARNING:  ✗ 10f o membro das duas vê as duas nas tabelas de leitura pelo piso, e só a A nas de leitura por cargo (ele consulta a B, não a administra) — diferente: eventos_admin(A 1/1, B 1/0) import_logs(A 1/1, B 1/0): 2 de 21 fora da regra
```

Com a cadeia, a leitura por cargo usando a função do MEMBRO:

**D1 — a leitura por cargo com a função do membro (eventos_admin / admin le auditoria) — o membro das duas passa a ler a auditoria da B** (roteiro `isolamento_tenant.sql`)

```
-- a sabotagem
alter policy "admin le auditoria" on public.eventos_admin using ((select public.e_admin()) and empresa_id = any (array (select public.empresas_do_membro())));

-- a saída
✗ 10f o membro das duas vê as duas nas tabelas de leitura pelo piso, e só a A nas de leitura por cargo (ele consulta a B, não a administra) — diferente: eventos_admin(A 1/1, B 1/0): 1 de 21 fora da regra
FIM isolamento_tenant: 44 asserções, 1 falhas
```

## E — a escrita cruzada (10g, 10g-bis, 10g-par; 10h)

No banco de antes (push 1):

```
WARNING:  ✗ 10g a escrita cruzada é recusada: inserir com a empresa B leva 42501 pelo WITH CHECK, e atualizar ou apagar linha da B afeta 0 linhas — para o admin da A e para o membro das duas — passou: insert-colaborador insert-tipo insert-ativo insert-anotacao update-colaborador update-ativo delete-motivo consultor-insert-tipo consultor-update-colaborador: 9 de 9 fora da regra
WARNING:  ✗ 10g-bis a escrita cruzada deixou marca na B (antes 7cafb763c9798ff89e4d50df225584ba · depois defcba3b37cbbaec4f442493ed955427)
```

**Achado da própria sabotagem, e consertado na fase:** a primeira versão do 10g tentava o DELETE da B só com o admin da A
— que NÃO lê a B, e o `where` de um DELETE aplica também a policy de SELECT. Uma policy de DELETE sem o termo passava a
bateria. O 10g passou a ter o membro das duas (que lê a B e é admin pela ponte) tentando cada classe de escrita, e a
sabotagem agora cai:

**E1 — a escrita de admin sem o termo (motivos / admin apaga) — o admin da A apaga motivo da B** (roteiro `isolamento_tenant.sql`)

```
-- a sabotagem
alter policy "admin apaga" on public.motivos using ((select public.e_admin()));

-- a saída
✗ 10g a escrita cruzada é recusada: inserir com a empresa B leva 42501 pelo WITH CHECK, e atualizar ou apagar linha da B afeta 0 linhas — para o admin da A e para o membro das duas — passou: consultor-delete-motivo: 1 de 12 fora da regra
✗ 10g-bis a escrita cruzada deixou marca na B (antes a3275754424644fccfc7087822bd6fba · depois 00621e2749f168537260bf31398932f1)
FIM isolamento_tenant: 44 asserções, 2 falhas
```

No injetor: ```
f66-escrita-confere-papel-e-esquece-tenant                 isolamento_tenant.sql                10g,10g-bis                       detectada            537 ms
```

O 10h (a policy sem o termo PASSA a escrita cruzada — o cenário sabe acusar) está verde no push 2.

## F — os pares (11a–11d, 16c, 16d; R-ACC-109)

No banco de antes (push 1), `pode_escrever_filial` nas seis e o admin da A aceito na filial da B:

```
WARNING:  ✗ 16c as policies de escrita por unidade (k_recorte_unidade) têm os pares sobre unidades_de_escrita() em toda árvore, na conjunção de cima, e só elas — public.ativos / operador atualiza (using): 0 par(es) na conjunção e 0 fora dela, a lista declara 1; public.ativos / operador atualiza (with check): 0 par(es) na conjunção e 0 fora dela, a lista declara 1; public.ativos / operador insere (with check): 0 par(e
WARNING:  ✗ 16d nenhuma policy de public ou storage chama pode_escrever_filial (a escrita por unidade é a forma de pares) — chama: public.lancamentos_item / operador lanca, public.ativos / operador insere, public.ativos / operador atualiza, public.movimentacoes / operador insere, public.pendencias_item / pendencias_item operador resolve, public.pendencias_item / pendencias_item admin reabre: 6 de 62 fora da regra
WARNING:  ✗ 11a/11b os pares: o operador escreve na filial dele e é recusado (42501) na outra, na da B e com filial nula; o admin escreve em toda filial da A, inclusive a desativada, e é recusado na da B — admin-na-B-aceito: 1 de 6 fora da regra
WARNING:  ✗ 11a-bis a recusa dos pares deixou marca: 3 ativos gravados das seis tentativas (esperado 2)
```

Com a cadeia:

**F1 — o par do snapshot retirado (movimentacoes / operador insere: só a filial declarada)** (roteiro `isolamento_tenant.sql`)

```
-- a sabotagem
alter policy "operador insere" on public.movimentacoes with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u));

-- a saída
✗ 11c o snapshot pelos pares não recusou a filial mentida (aceito), ou o ativo migrou
FIM isolamento_tenant: 44 asserções, 1 falhas
```

**F2 — o par só da filial, sem a empresa (ativos / operador insere: filial_id in (select u.filial_id …))** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "operador insere" on public.ativos with check (empresa_id = any (array (select public.empresas_de_escrita())) and filial_id in (select u.filial_id from public.unidades_de_escrita() u));

-- a saída
✗ 16c as policies de escrita por unidade (k_recorte_unidade) têm os pares sobre unidades_de_escrita() em toda árvore, na conjunção de cima, e só elas — public.ativos / operador insere (with check): 0 par(es) na conjunção e 0 fora dela, a lista declara 1: 1 de 65 fora da regra
FIM catalogo_policies: 42 asserções, 1 falhas
```

**Achado da revisão adversarial, e consertado na fase:** o 16c contava os pares sem conferir o SEGUNDO membro — um par
`(empresa_id, 1::smallint) in (…)` passava. Agora o segundo membro tem de ser a coluna `filial_id` da própria linha ou,
só onde a tabela tem `snapshot_anterior`, a forma exata do snapshot (a chave conferida pelo deparse). As três formas
erradas caem pelo 16c:

**F3 — o segundo membro do par trocado por um literal (ativos / operador atualiza: (empresa_id, 1::smallint))** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "operador atualiza" on public.ativos using (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, 1::smallint) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u)) with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, 1::smallint) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u));

-- a saída
✗ 16c as policies de escrita por unidade (k_recorte_unidade) têm os pares sobre unidades_de_escrita() em toda árvore, na conjunção de cima, e só elas — public.ativos / operador atualiza (using): 1 par(es) com o segundo membro fora da forma (nem filial_id da linha, nem o snapshot); public.ativos / operador atualiza (using): o segundo membro — 0 par(es) sobre filial_id e 0 sobre o snapshot (tem de ser 1 sobre filial_id
FIM catalogo_policies: 42 asserções, 1 falhas
```

**F4 — o segundo membro do par trocado por outra coluna da linha (lancamentos_item / operador lanca: quantidade no lugar de filial_id)** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "operador lanca" on public.lancamentos_item with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, quantidade::smallint) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u) and public.estorno_item_coerente(estorna_id, filial_id, item_id));

-- a saída
✗ 16c as policies de escrita por unidade (k_recorte_unidade) têm os pares sobre unidades_de_escrita() em toda árvore, na conjunção de cima, e só elas — public.lancamentos_item / operador lanca (with check): 1 par(es) com o segundo membro fora da forma (nem filial_id da linha, nem o snapshot); public.lancamentos_item / operador lanca (with check): o segundo membro — 0 par(es) sobre filial_id e 0 sobre o snapshot (tem 
FIM catalogo_policies: 42 asserções, 1 falhas
```

**F5 — o par do snapshot lendo outra chave do texto (movimentacoes / operador insere: ->> filial_destino_id)** (roteiro `catalogo_policies.sql`)

```
-- a sabotagem
alter policy "operador insere" on public.movimentacoes with check (empresa_id = any (array (select public.empresas_de_escrita())) and (empresa_id, filial_id) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u) and (empresa_id, (snapshot_anterior ->> 'filial_destino_id')::smallint) in (select u.empresa_id, u.filial_id from public.unidades_de_escrita() u));

-- a saída
✗ 16c as policies de escrita por unidade (k_recorte_unidade) têm os pares sobre unidades_de_escrita() em toda árvore, na conjunção de cima, e só elas — public.movimentacoes / operador insere (with check): o par do snapshot não lê a chave filial_id: 1 de 65 fora da regra
FIM catalogo_policies: 42 asserções, 1 falhas
```

No injetor, a mutação nova da revisão (`f66-par-com-segundo-membro-literal`, a forma nova mantida e só o segundo membro
trocado — só o 16c a vê) roda no CI do SHA congelado; na mesa: `✓ f66-par-com-segundo-membro-literal → catalogo_policies.sql
[16c]: detectada`.

No injetor (`pode_escrever_filial` de volta; e uma das 6 exceções de volta à lista é a mutação
`doutrina-excecao-sobrevive-ao-conserto`, que prova a catraca `11b` com a exceção permanente de `lancamentos_item`):
```
doutrina-excecao-sobrevive-ao-conserto                     catalogo_policies.sql                11b                               detectada            701 ms
f66-unidade-volta-a-pode-escrever-filial                   catalogo_policies.sql                16c,16d,11a                       detectada            680 ms
```

## G — conta a conta (R-ACC-114)

`scripts/perf/conta-a-conta.mjs`, fase `emulada`, antes de qualquer apply (Frente A, commit `06357ac`), em
`conta-a-conta/`: ensaio **0 divergência** (3 memberships · 21 tabelas · 18 pares · 63 leituras); produção **0
divergência** (14 memberships · 21 tabelas · 84 pares · 294 leituras); a **sabotada** no ensaio (uma comparação de escrita e
uma de leitura invertidas) deu **2** (`escrita_filial` 1, `leitura` 1) — o instrumento sabe acusar.

Nos bancos vivos, em 24/09/2026 (`conta-a-conta/*-emulada-refeita.json` e `*-real-depois-017{5,6,7,8}.json`): a emulada
REFEITA logo antes do primeiro apply, **0** nos dois; a fase `real` depois de cada um dos quatro lotes de policy, **0** em
cada um — ensaio 3 memberships · 21 tabelas · 18 pares · 63 leituras; produção 14 memberships · 21 tabelas · 84 pares ·
294 leituras; corrida 0 em todas as rodadas. Nenhum lote precisou de rollback.

## H — as `rel_*` (10i, 10j; R-ACC-113)

No banco de antes (push 1), o relatório duplicava para o membro das duas:

```
WARNING:  ✗ 10i o relatório por motivo e o resumo NÃO duplicam para o membro das duas: o mesmo código de motivo em duas empresas junta pelo par (empresa_id, codigo) — 2 saídas, 2 contadas em cada — por motivo 4, resumo 4 (esperado 2 e 2): 4 de 4 fora da regra
```

Com a cadeia, o resumo de volta ao join só pelo código:

**H1 — rel_resumo_filiais volta a juntar motivos só pelo código** (roteiro `isolamento_tenant.sql`)

```
-- a sabotagem
create or replace function public.rel_resumo_filiais(p_filiais smallint[], p_de date, p_ate date)
returns table (tipo public.tipo_movimentacao, filial_slug text, filial_nome text, motivo text, categoria public.categoria_ativo, total bigint)
language sql stable security invoker set search_path = public as $$
  select m.tipo, f.slug, f.nome, coalesce(mo.rotulo, m.motivo, 'Outro') as motivo, a.categoria, count(*)::bigint
  from public.movimentacoes m
  join public.ativos a  on a.id = m.ativo_id
  join public.filiais f on f.id = m.filial_id
  left join public.motivos mo on mo.codigo = m.motivo
  where m.tipo in ('saida', 'devolucao') and m.data between p_de and p_ate and m.filial_id = any (p_filiais)
  group by m.tipo, f.slug, f.nome, coalesce(mo.rotulo, m.motivo, 'Outro'), a.categoria
  order by f.nome, motivo, a.categoria;
$$;

-- a saída
✗ 10i o relatório por motivo e o resumo NÃO duplicam para o membro das duas: o mesmo código de motivo em duas empresas junta pelo par (empresa_id, codigo) — 2 saídas, 2 contadas em cada — por motivo 2, resumo 4 (esperado 2 e 2): 2 de 4 fora da regra
FIM isolamento_tenant: 44 asserções, 1 falhas
```

No injetor (o relatório por motivo): ```
f66-rel-join-sem-empresa                                   isolamento_tenant.sql                10i                               detectada            543 ms
```

O 10j (sem o par, o relatório por motivo DUPLICA: 4 em vez de 2 — o 10i sabe acusar) está verde no push 2. A equivalência
antes × depois nos dois bancos (`equivalencia-rel.mjs`, modo `mesmo-nome`, `rel/`): **0 célula divergente** em cada
rodada — 168 células por função (12 datas × consolidado e cada filial × 7d/365d), antes da `0179` (a viva de antes × o
corpo novo colado) e depois (o corpo de antes colado × a viva nova); linhas por lado: ensaio 404 e 1.082, produção 524 e
1.182 (`rel_por_motivo_filiais` e `rel_resumo_filiais`).

## I — os índices (R-ACC-116)

A medição estrutural que decidiu "nenhum índice" está no `PLAN-F66.md` §3.2 (quatro cenários por lista, na mesa, com o
volume fictício de produção). O EXPLAIN "depois" das cinco listas nos dois bancos (`medir-rls.mjs gerar-listas`, em
`indices/`), como `authenticated` com a policy REAL: nas cinco, as duas funções da policy como `InitPlan 1`/`InitPlan 2`
de **1 loop** cada; o nó de cada lista o de antes (movimentações pelo `movimentacoes_data_ordem_idx`; ativos por Bitmap e
Sort, como hoje); em produção, execução de 0,69 ms (import) a 2,80 ms (ativos), 0 bloco lido do disco.

## J — o custo

O `medir-rls.mjs` antes (F0 × F4, `docs/perf/f66-rls-*-antes.json`) e o TTFB antes (`docs/perf/f66-producao-ttfb-antes.json`,
e a linha de base do MESMO dia, imediatamente antes do apply de produção, `f66-producao-ttfb-antes-do-apply.json`).
Depois, em produção: a policy nova (F0-depois) × a forma emulada (F4-antes) — `ativos` 2,12 × 2,06 ms, 124 = 124 buffers;
`movimentacoes` 3,16 × 3,63 ms, 271 = 271 buffers (`f66-rls-producao-depois.json`). O TTFB depois × antes do mesmo dia,
19 rotas, N = 11: na MEDIANA a pior rota +6,6% (`/movimentacoes/nova`, total). No **p95** (a régua da decisão 11), três
rotas passaram de 15% na primeira rodada — `/login` com sessão +51,9%, `/ajuda` +36,7%, `/movimentacoes/nova` +18,6% — e
foram medidas mais duas vezes, intercalando (`f66-producao-ttfb-depois-2.json`, `-3.json`): `/ajuda` (−16,8%, −25,2%) e
`/movimentacoes/nova` (−12,2%, −25,4%) voltaram para baixo; `/login` com sessão ficou acima em duas das três (+10,3%,
+33,5%) — e essa rota **não chega ao PostgREST** (o proxy só chama `auth.getUser()`, a API de Auth; nenhuma policy é
avaliada), o `medir-rls` não tem o que atribuir, e a MESMA rota mediu p95 117,2 ms de manhã, antes de qualquer apply (o
"depois" deu 117). Ruído declarado, com os números; nenhum bloqueio. Na segunda rodada, rotas públicas que nem tocam o
banco (`/login` +154,8%, `/relatorios/acesso` +287%) mostram o tamanho do ruído de rede do dia.

## K — o rollback (R-ACC-115)

`f66_rollback.sql` no CI (push 2): `FIM f66_rollback: 6 asserções, 0 falhas` — rb2/rb3/rb4 contra o "antes" dos dois
bancos vivos. E os rollbacks das fases anteriores SEM o da F66 antes (a mesa, sobre a cadeia até a `0179`; o `\ir` do
`F66-desfaz.sql` retirado de uma cópia de cada roteiro):

```
==== ✗ _k_f63_sem_f66 — 0 asserções — ERRO: _k_f63_sem_f66: cannot drop column empresa_id of table kits_modelos because other objects depend on it
RESUMO: 1 roteiro(s), 0 asserções, 1 com problema
==== ✗ _k_f64_sem_f66 — 0 asserções — ERRO: _k_f64_sem_f66: cannot drop column empresa_id of table kits_modelos because other objects depend on it
RESUMO: 1 roteiro(s), 0 asserções, 1 com problema
==== ✗ _k_f65_sem_f66 — 0 asserções
   WARNING:  ✗ rb3 o esquema das 20 (e as três funções) depois do rollback é o do CI antes da 0165 — impressão 309f7ff7788af1f7bf67243d99b7a1a3, esperada 1c72ca42784d716f9009cc68f504c8f3: 1 de 1 fora da regra
   NOTICE:  FIM f65_rollback: 5 asserções, 1 falhas
RESUMO: 1 roteiro(s), 0 asserções, 1 com problema
```

A mesa também acusa a exceção perdida no texto do rollback: com `and public.estorno_item_coerente(…)` retirado do
`F66-desfaz.sql`, `rollback-f66.test.ts` reprova `public.lancamentos_item / operador lanca sai do rollback com o texto
de antes da 0175`.

## L — o instrumento

Na mesa: o `relfilenode` das tabelas de `public` antes da `0175` e depois da `0179` (as cinco migrations aplicadas em
sequência), e o md5 de uma policy alterada dentro de uma subtransação desfeita:

```
"tabelas_medidas": 29
  "relfilenode_mudou": 0,
  "tabelas": 29,
  "com_empresa_id": 22
NOTICE:  L-md5: ativos/leitura operador cd757cb1 -> cb680040 (mudou=t) · itens/leitura operador cd757cb1 -> cd757cb1 (mudou=f)
```

`relfilenode_mudou` 0 das 29 (22 com `empresa_id`): nenhuma migration da fase reescreve tabela. O md5 muda SÓ na policy
alterada. E no CI, a `L2` de `integridade_tenant.sql` (um `alter column … type` com reescrita MUDA o `relfilenode`) está
verde nos dois pushes — o instrumento vê a reescrita quando ela existe. Nos bancos vivos (`depois/sondas-*.json`, a
sonda antes do primeiro lote e depois de cada um dos cinco): o md5 do `relfilenode` das 22 tabelas **igual em todas as
rodadas** — ensaio `293d2945…`, produção `ba909922…` — e o md5 das policies de `public` igual ao do ORÁCULO depois de cada
lote (o texto aplicado é o do arquivo).

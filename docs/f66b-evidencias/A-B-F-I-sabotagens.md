# F66B — as sabotagens A, B, F e I, com a saída real

Onde estão as outras: **C** (o comportamento, teto + 1 e sem o CHECK) e **D** (a RPC do import por fora) são asserções do roteiro `comprimento_comportamento.sql` (B1e, L*c, I1–I4) e da trava vermelha (`B-travas/`); **E** em `E-import-pela-tela.txt`; **G** em `G-contagem/` (a mesa; o ensaio é do portão); **H** em `H-rollback/`; o injetor em `injetor-mesa.txt`. A auto-sabotagem S1–S6 roda DENTRO de `comprimento_por_coluna.sql` a cada execução, chamando as mesmas funções das asserções. Tudo na mesa (PGlite PG 17.5) e, no que é SQL, conferido pelo CI do PR #92.

## Sabotagem A — comprimento_por_coluna.sql (SHA d05a52a) com o catálogo SABOTADO (mesa PGlite PG 17.5, cadeia 0001–0184, 12/11/2026 16:29)

Cada caso: o que foi sabotado e os rótulos ✗ que o roteiro derrubou, com o nome da coluna. O controle (sem sabotagem) dá 17 asserções, 0 falhas; a cadeia SEM a F66B dá 6 falhas (B-travas/).
```
### a1: alter table public.ativos drop constraint ativos_processador_tamanho; 
WARNING:  ✗ C1 toda coluna de texto das 20 tem o CHECK de comprimento com o nome esperado — sem: ativos.processador: 1 de 65 fora da regra
WARNING:  ✗ C4 o teto do CHECK é o da fonte única (k_comprimento_teto) — divergente: ativos.processador (banco ∅, fonte 80): 1 de 65 fora da regra
supabase/tests/comprimento_por_coluna.sql: FIM comprimento_por_coluna: 17 asserções, 2 falhas · ✗ vistos=2
### a2: alter table public.movimentacoes drop constraint movimentacoes_setor_tamanho; alter table public.movimentacoes add constraint movimentacoes_setor_tamanho check (char_length(setor) <= 120) not valid; 
WARNING:  ✗ C3 o CHECK de comprimento está validado (nenhum not valid) — not valid: movimentacoes_setor_tamanho: 1 de 65 fora da regra
WARNING:  ✗ C9 nenhum CHECK de comprimento das 20 (char_length, length, octet_length, character_length) está not valid — not valid: movimentacoes_setor_tamanho: 1 de 69 fora da regra
supabase/tests/comprimento_por_coluna.sql: FIM comprimento_por_coluna: 17 asserções, 2 falhas · ✗ vistos=2
### a3a: alter table public.filiais drop constraint filiais_cidade_tamanho; alter table public.filiais add constraint filiais_cidade_tamanho check (length(cidade) <= 120); 
WARNING:  ✗ C2 o CHECK de comprimento tem a forma char_length(<a coluna>) <= <inteiro> (lida pela árvore conbin) — fora da forma: filiais_cidade_tamanho: 1 de 65 fora da regra
WARNING:  ✗ C4 o teto do CHECK é o da fonte única (k_comprimento_teto) — divergente: filiais.cidade (banco ∅, fonte 120): 1 de 65 fora da regra
supabase/tests/comprimento_por_coluna.sql: FIM comprimento_por_coluna: 17 asserções, 2 falhas · ✗ vistos=2
### a3b: alter table public.filiais drop constraint filiais_cidade_tamanho; alter table public.filiais add constraint filiais_cidade_tamanho check (octet_length(cidade) <= 120); 
WARNING:  ✗ C2 o CHECK de comprimento tem a forma char_length(<a coluna>) <= <inteiro> (lida pela árvore conbin) — fora da forma: filiais_cidade_tamanho: 1 de 65 fora da regra
WARNING:  ✗ C4 o teto do CHECK é o da fonte única (k_comprimento_teto) — divergente: filiais.cidade (banco ∅, fonte 120): 1 de 65 fora da regra
supabase/tests/comprimento_por_coluna.sql: FIM comprimento_por_coluna: 17 asserções, 2 falhas · ✗ vistos=2
### a3c: alter table public.filiais drop constraint filiais_cidade_tamanho; alter table public.filiais add constraint filiais_cidade_tamanho check (char_length(btrim(cidade)) <= 120); 
WARNING:  ✗ C2 o CHECK de comprimento tem a forma char_length(<a coluna>) <= <inteiro> (lida pela árvore conbin) — fora da forma: filiais_cidade_tamanho: 1 de 65 fora da regra
WARNING:  ✗ C4 o teto do CHECK é o da fonte única (k_comprimento_teto) — divergente: filiais.cidade (banco ∅, fonte 120): 1 de 65 fora da regra
supabase/tests/comprimento_por_coluna.sql: FIM comprimento_por_coluna: 17 asserções, 2 falhas · ✗ vistos=2
### a4: alter table public.senhas_acesso add column observacao_interna text; 
WARNING:  ✗ C1 toda coluna de texto das 20 tem o CHECK de comprimento com o nome esperado — sem: senhas_acesso.observacao_interna: 1 de 66 fora da regra
WARNING:  ✗ C4 o teto do CHECK é o da fonte única (k_comprimento_teto) — divergente: senhas_acesso.observacao_interna (banco ∅, fonte ∅): 1 de 66 fora da regra
supabase/tests/comprimento_por_coluna.sql: FIM comprimento_por_coluna: 17 asserções, 2 falhas · ✗ vistos=2
### a5: k_comprimento_excecao = ['ativos._f66b_fantasma'] (exceção que aponta coluna inexistente)
WARNING:  ✗ C7a toda exceção nominal aponta coluna de texto viva das 20 — fantasma: ativos._f66b_fantasma: 1 de 66 fora da regra
a5.sql: FIM comprimento_por_coluna: 17 asserções, 1 falhas · ✗ vistos=1
### a6: k_comprimento_excecao = ['senhas_acesso.rotulo'] (exceção para coluna que TEM o CHECK)
WARNING:  ✗ C7b nenhuma exceção nominal tem o CHECK canônico (exceção com CHECK é lista desatualizada) — com CHECK: senhas_acesso.rotulo: 1 de 65 fora da regra
a6.sql: FIM comprimento_por_coluna: 17 asserções, 1 falhas · ✗ vistos=1
```

## Sabotagem B — a trava de mesa Zod × banco, e F — a tradução

```
# Sabotagem B — a trava de mesa Zod × banco (tetos-coluna.test.ts) com o código SABOTADO, um caso por vez, e o arquivo restaurado depois (12/11/2026 16:14)

## B1 — um .max() de tela sobe acima do teto da coluna: item.ts colaboradorOpcional .max(120) → .max(150) (lancamentos_item.colaborador tem 120)
     × lancamentos_item.colaborador · validators/item.ts:25 · lançamento de item
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 108 passed (109)

## B2 — LIMITES_CAMPO_PLANO de um campo sobe acima da coluna que alimenta: marca 60 → 61 (ativos.marca tem 60)
     × marca
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 108 passed (109)

## B3 — o literal de um CHECK numa migration diverge da fonte: 0182 ativos_marca_tamanho <= 60 → <= 61
     × toda entrada da fonte tem o CHECK com o MESMO nome, coluna e teto, na migration do lote dela
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 108 passed (109)

## B4 — a fonte ganha uma coluna que nenhuma migration limita: ativos.nota_interna (teto 80)
     × tem as 65 colunas de texto das 20 tabelas de negócio, cada uma uma vez
     × toda entrada da fonte tem o CHECK com o MESMO nome, coluna e teto, na migration do lote dela
     × comprimento_por_coluna.sql: k_comprimento_teto = a fonte, entrada a entrada
     × comprimento_comportamento.sql: k_comprimento_teto = a fonte, entrada a entrada
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
      Tests  4 failed | 105 passed (109)

## F — a tradução: uma constraint _tamanho viva SEM frase (a entrada de unidades_apelidos_apelido_tamanho tirada de COMPRIMENTO_TRADUZIDO)
     × todo check vivo terminado em _tamanho tem frase
     × são as 65 da F66B mais as quatro anteriores
     × as de comprimento anteriores à F66B têm frase própria
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
      Tests  3 failed | 494 passed (497)

## controle — tudo restaurado, as quatro suítes verdes de novo
      Tests  607 passed (607)
```

## Sabotagem I — o instrumento antes/depois

```
# Sabotagem I — o instrumento antes/depois (docs/f66b-evidencias/impressao-f66b.sql), mesa PGlite PG 17.5, 12/11/2026 16:07
# formato: checks [total, _tamanho, not_valid, md5] · relfilenode [tabelas, md5] · funcoes [total, md5] · policies [public, storage, md5]
## (a) cadeia 0001–0180 (antes da fase):
{"checks":[36,3,1,"a88a9b4f11e59f36ec7db3193d9b5675"],"relfilenode":[20,"d81abfff64b5ca8407e809948e8fcff3"],"funcoes":[106,"7180f4c1d8365e5f5987d793ee1666c4"],"policies":[54,8,"cdbd546393411bdfc3ea6d100f6a541f"]}
## (b) a MESMA base, + as quatro migrations da F66B aplicadas por cima (o relfilenode tem de ser IGUAL ao de (a); as funções e as policies também):
{"checks":[101,68,1,"3d16ad9191aeb43ce7847582f37a88a5"],"relfilenode":[20,"d81abfff64b5ca8407e809948e8fcff3"],"funcoes":[106,"7180f4c1d8365e5f5987d793ee1666c4"],"policies":[54,8,"cdbd546393411bdfc3ea6d100f6a541f"]}
## (c) sobre (b), uma constraint ALTERADA (motivos_rotulo_tamanho com 81): o md5 das checks muda, o relfilenode não:
{"checks":[101,68,1,"20723795af62f749c5a15bfe213f07bd"],"relfilenode":[20,"d81abfff64b5ca8407e809948e8fcff3"],"funcoes":[106,"7180f4c1d8365e5f5987d793ee1666c4"],"policies":[54,8,"cdbd546393411bdfc3ea6d100f6a541f"]}
## (d) sobre (b), um alter column … type (kits_modelos.nome → varchar(200)): REESCREVE a tabela — o relfilenode muda:
{"checks":[101,68,1,"338ed2deeab3a5129dfadf127dea0cbe"],"relfilenode":[20,"14c46dc7624c7fcec02d434ae91347c1"],"funcoes":[106,"7180f4c1d8365e5f5987d793ee1666c4"],"policies":[54,8,"cdbd546393411bdfc3ea6d100f6a541f"]}
```

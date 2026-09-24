# F65 — as sabotagens A–L: de MESA (no SHA 5395c26, worktree descartável, cada uma desfeita depois) e de BANCO (o injetor no CI)

## G — a chave do snapshot sem a empresa
- sabotado: `src/lib/relatorios/versao-snapshot.ts`
- trava: `src/lib/relatorios/chave-versao-sql.test.ts`
- resultado: VERMELHO — acusou (Tests  3 failed | 5 passed (8))
  - × a chave tem uma parte por coluna, na mesma ordem 10ms
  - × mudar QUALQUER coluna da chave muda a chave (nenhuma é ignorada) 1ms
  - × o CONSOLIDADO da empresa A e o da B no mesmo período dão chaves DIFERENTES (a sabotagem G, na mesa) 1ms
  > AssertionError: expected [ '2026-09-06', '2026-09-12', '2' ] to deeply equal [ …(4) ]
  > AssertionError: expected '2026-09-06|2026-09-12|2' not to be '2026-09-06|2026-09-12|2' // Object.is equality
  > AssertionError: expected '2026-09-06|2026-09-12|geral' not to be '2026-09-06|2026-09-12|geral' // Object.is equality

## J — o onConflict volta ao alvo global
- sabotado: `src/lib/actions/colaboradores.ts`
- trava: `src/lib/actions/colaboradores-onconflict.test.ts`
- resultado: VERMELHO — acusou (Tests  2 failed | 2 passed (4))
  - × cada onConflict tem um árbitro com EXATAMENTE as mesmas colunas no esquema-alvo 8ms
  - × o árbitro é o unique POR EMPRESA com o nome contratual — o global morreu na 0174 4ms
  > AssertionError: ON CONFLICT (nome_chave) sem árbitro → 42P10: expected undefined to be defined
  > AssertionError: expected [ 'nome_chave' ] to include 'empresa_id'

## B — o tipo da constraint traduzida volta a implícito
- sabotado: `src/lib/supabase/erros-do-banco.ts`
- trava: `src/lib/supabase/erros-do-banco-sql.test.ts`
- resultado: VERMELHO — acusou (Tests  1 failed | 312 passed (313))
  - × filiais_slug_key: o tipo declarado é a forma viva 6ms
  > AssertionError: filiais_slug_key: declarado unique-implicita, vivo como unique-nomeada: expected 'unique-nomeada' to be 'unique-implicita' // Object.is equality

## H — a diagonal com uma terceira linha mudada
- sabotado: `supabase/migrations/0173_guarda_empresa.sql`
- trava: `src/lib/itens/migrations-f38.test.ts`
- resultado: VERMELHO — acusou (Tests  2 failed | 59 passed (61))
  - × o corpo da 0173 tem exatamente duas linhas a mais que o da 0139 9ms
  - × tirando as duas linhas da diagonal, o corpo é o da 0139 BYTE A BYTE 6ms
  > AssertionError: expected 3 to be 2 // Object.is equality
  > AssertionError: expected [ …(72) ] to deeply equal [ …(71) ]

## K — o rollback esquece de devolver uma FK à forma simples
- sabotado: `supabase/rollback/F65-desfaz.sql`
- trava: `src/lib/validators/rollback-f65.test.ts`
- resultado: VERMELHO — acusou (Tests  1 failed | 53 passed (54))
  - × anotacoes_ativo_id_fkey volta SIMPLES, ao mesmo pai, com as MESMAS ações 4ms
  > AssertionError: anotacoes_ativo_id_fkey não volta no rollback: expected undefined to be defined

## K — o rollback perde o deferrable da FK diferida
- sabotado: `supabase/rollback/F65-desfaz.sql`
- trava: `src/lib/validators/rollback-f65.test.ts`
- resultado: VERMELHO — acusou (Tests  1 failed | 53 passed (54))
  - × pendencias_item_movimentacao_id_fkey volta SIMPLES, ao mesmo pai, com as MESMAS ações 4ms
  > AssertionError: pendencias_item_movimentacao_id_fkey: as ações divergem (deferrable initially deferred → ): expected '' to be 'deferrable initially deferred' // Object.is equality

## "ninguém lê" — um filtro por empresa novo na lista de gerados
- sabotado: `src/lib/queries/gerados.ts`
- trava: `src/lib/validators/empresa-acervo-sem-leitura.test.ts`
- resultado: VERMELHO — acusou (Tests  1 failed | 68 passed (69))
  - × o literal empresa_id aparece EXATAMENTE onde a F62 o pôs, trecho a trecho, e em nenhum outro lugar 612ms
  > AssertionError: empresa_id apareceu, sumiu ou mudou de consulta num arquivo de src/** — é leitura nova da coluna? O recorte do acervo é da F66: expected { …(4) } to deeply equal { …(4) }

## as listas nominais — uma FK a mais na lista das que ficam simples
- sabotado: `supabase/tests/forma_multiempresa.sql`
- trava: `src/lib/validators/catalogos-seguranca.test.ts`
- resultado: VERMELHO — acusou (Tests  1 failed | 138 passed (139))
  - × as listas nominais são EXATAMENTE as da decisão (uma entrada nova passa por aqui) 9ms
  > AssertionError: expected [ …(2) ] to deeply equal [ 'operador_filiais_filial_id_fkey' ]


(worktree limpo depois de cada sabotagem: sim)

## As sabotagens de BANCO (o injetor, no CI do push 2 — run 35925951229, commit e288cb5)

```
[129/143] f63-lote1-sem-coluna  →  catalogo_policies.sql  (espera ✗ 15b)
      ✓ detectada — também caíram (efeito colateral): 15f  (501 ms)
[135/143] f64-lote2-sem-coluna  →  catalogo_policies.sql  (espera ✗ 15e, 15f)
      ✓ detectada  (500 ms)
[139/143] f65-fk-simples  →  forma_multiempresa.sql  (espera ✗ F1, F4)
      ✓ detectada — também caíram (efeito colateral): F6  (361 ms)
[140/143] f65-snapshot-sem-empresa  →  unicidade_por_empresa.sql  (espera ✗ U1)
      ✓ detectada  (359 ms)
[141/143] f65-guarda-com-janela  →  imutabilidade_tenant.sql  (espera ✗ I2, I4)
      ✓ detectada  (425 ms)
[142/143] f65-diagonal-global  →  integridade_tenant.sql  (espera ✗ H1, H3)
      ✓ detectada  (445 ms)
[143/143] f65-termo-sem-empresa  →  integridade_tenant.sql  (espera ✗ I1)
      ✓ detectada  (461 ms)
143/143 detectadas pelo cenário nomeado · 64329 ms no total
```

A mensagem real de cada rótulo derrubado (a mutação aplicada num banco descartável; o roteiro rodado contra ele):

```
WARNING:  ✗ F1 toda FK entre duas tabelas de negócio é COMPOSTA e começa por empresa_id nos dois lados — fora da forma: lancamentos_item_item_id_fkey: 1 de 23 fora da regra
WARNING:  ✗ F4 não sobra FK SIMPLES entre tabelas de negócio — simples: lancamentos_item_item_id_fkey: 1 de 23 fora da regra
WARNING:  ✗ F6 toda FK de public que referencia uma tabela de negócio é composta com empresa_id (fora da lista nominal) — fora da forma: lancamentos_item.lancamentos_item_item_id_fkey: 1 de 25 fora da regra
WARNING:  ✗ H1 a diagonal é por empresa: B nomeia uma filial com o apelido da A, e A usa como apelido o nome de uma filial da B — os dois passam — fora da regra: A-apelida-com-o-nome-da-B(P0001: O termo "F65 Secreta da B" já é o nome da filial "F65 Se
WARNING:  ✗ H3 o corpo de vocabulario_unidades_guarda() é o da 0139 byte a byte, mais as DUAS linhas da diagonal por empresa (e só elas) — md5 sem as duas: 44c646e04119e33a19cea9e0dc40253a · linhas da empresa: 1: 2 de 2 fora da regra
WARNING:  ✗ I1 o termo da A que cita movimentação da B, ou ativo da B (no INSERT e no UPDATE dos arrays), é recusado (23503, a frase do termo), e o termo da A ficou como estava — fora da regra: movimentacao-da-B(passou): 1 de 4 fora da regra
WARNING:  ✗ I2 guarda_empresa() é INVOKER, não cita a janela dev_destrutivo nem current_setting, e não toca tabela — lê current_setting: 1 de 1 fora da regra
WARNING:  ✗ I4 nas 20 tabelas de negócio, trocar a empresa de uma linha leva 42501 — fora da janela e DENTRO dela (com a frase da guarda) — fora da regra: anotacoes(com a janela: 23503) ativos(com a janela: 23503) colaboradores(com a janela: 23503) even
WARNING:  ✗ U1 todo índice único de tabela de negócio tem empresa_id na chave (ou é a PK (id), ou está na lista nominal dos implícitos) — global: relatorios_gerados_periodo_filial_versao_uidx [periodo_de, periodo_ate, expr:COALESCE(filial_id::integer
```

# F67B — as sabotagens A a J, com a saída real (16/11/2026)

Mesa PGlite 0.3.14 (PG 17.5 em WASM) na cadeia 0001–0199 para as de SQL — a sabotagem é aplicada ANTES do roteiro, num
banco descartável; a régua de cada mutação permanente é o injetor no CI. Mesa Vitest para as de TS — o arquivo é editado,
o teste roda e o arquivo volta (conferido por md5). Nenhum banco vivo foi tocado; nenhum valor real aparece aqui.
Controle (sem sabotagem): `storage_por_empresa` 36/0, `catalogo_policies` 46/0, `definer_sem_tenant` verde.

### A — `pode_ler_arquivo_termo` volta a ignorar o nome (o consulta da A lê o `.docx` da B)

```
  storage_por_empresa | WARNING:  ✗ T3 ninguém da A lê nem escreve o .docx do termo da B (----): 3 de 12 fora da regra
  storage_por_empresa | WARNING:  ✗ T4 o par simétrico: o admin e o operador da B leem e escrevem o .docx do termo da B (LUDI): 6 de 8 fora da regra
  storage_por_empresa | WARNING:  ✗ T5 o consulta da B lê e não escreve o .docx do termo da B (L---): 1 de 4 fora da regra
  storage_por_empresa | WARNING:  ✗ T7 o .docx SEM linha não é lido nem escrito por ninguém da sessão (----): 4 de 20 fora da regra
  storage_por_empresa | WARNING:  ✗ D3 o par simétrico: o admin da B apaga o degenerado da B, e o da A não o alcança: 4 de 10 fora da regra
  storage_por_empresa | WARNING:  ✗ L2 nenhuma função que decide sobre objeto cita empresa_legada() — citam: pode_ler_arquivo_termo(text): 1 de 9 fora da regra
  storage_por_empresa | NOTICE:  FIM storage_por_empresa: 36 asserções, 6 falhas
  definer_sem_tenant | WARNING:  ✗ 4b nenhuma função de k_escopo_ok cita empresa_legada() no código — a empresa vem do alvo, nunca da legada — citam: pode_ler_arquivo_termo(text): 1 de 24 fora da regra
  definer_sem_tenant | NOTICE:  FIM definer_sem_tenant: 9 asserções, 1 falhas
  ✗ storage_por_empresa — 36 asserções, 6 falhas · 6 ✗
  ✗ definer_sem_tenant — 9 asserções, 1 falhas · 1 ✗
```

### B — `pode_escrever_arquivo_termo` com `coalesce(…, true)` de volta (objeto sem linha gravável)

```
  storage_por_empresa | WARNING:  ✗ T7 o .docx SEM linha não é lido nem escrito por ninguém da sessão (----): 5 de 20 fora da regra
  storage_por_empresa | WARNING:  ✗ T8 ninguém grava um .docx novo que nenhuma linha referencia (o coalesce é false): 4 de 4 fora da regra
  storage_por_empresa | NOTICE:  FIM storage_por_empresa: 36 asserções, 2 falhas
  ✗ storage_por_empresa — 36 asserções, 2 falhas · 2 ✗
```

### C1 — o degenerado FECHADO para todos (o lixo imortal da 0069: o admin da A não apaga o próprio)

```
  storage_por_empresa | WARNING:  ✗ D1 o admin da A ainda apaga o termo degenerado da A (a linha e o .docx): 4 de 5 fora da regra
  storage_por_empresa | WARNING:  ✗ D3 o par simétrico: o admin da B apaga o degenerado da B, e o da A não o alcança: 4 de 10 fora da regra
  storage_por_empresa | NOTICE:  FIM storage_por_empresa: 36 asserções, 2 falhas
  ✗ storage_por_empresa — 36 asserções, 2 falhas · 2 ✗
```

### C2 — o degenerado ABERTO a qualquer admin (o da B apaga o da A)

```
  storage_por_empresa | WARNING:  ✗ D2 o admin da B não alcança o degenerado da A (nem a linha, nem o .docx): 1 de 5 fora da regra
  storage_por_empresa | WARNING:  ✗ D3 o par simétrico: o admin da B apaga o degenerado da B, e o da A não o alcança: 1 de 10 fora da regra
  storage_por_empresa | NOTICE:  FIM storage_por_empresa: 36 asserções, 2 falhas
  ✗ storage_por_empresa — 36 asserções, 2 falhas · 2 ✗
```

### D1 — a leitura de `backups-import` sem a empresa do caminho (o admin da B lê o backup da A)

```
  storage_por_empresa | WARNING:  ✗ B2 o admin da A é recusado sob a empresa B (o backup da B e um novo na B): 1 de 5 fora da regra
  storage_por_empresa | WARNING:  ✗ B4 o admin da B é recusado sob a empresa A (----): 1 de 4 fora da regra
  storage_por_empresa | WARNING:  ✗ B6 um caminho fora de toda forma (e o malformado com empresa) não é alcançado por ninguém (----): 5 de 20 fora da regra
  storage_por_empresa | WARNING:  ✗ B8 o admin só da B não lê nenhuma forma antiga (----): 9 de 36 fora da regra
  storage_por_empresa | NOTICE:  FIM storage_por_empresa: 36 asserções, 4 falhas
  ✗ storage_por_empresa — 36 asserções, 4 falhas · 4 ✗
```

### D2 — um montador de `caminho.ts` sem o segmento de empresa (`caminho.test.ts`)

```
      Tests  no tests
 FAIL  |puro| src/lib/storage/caminho.test.ts [ src/lib/storage/caminho.test.ts ]
Error: caminho de backup: a raiz das cópias só sai de um backup na forma nova (com a empresa).
```

### E1 — a cláusula legada como "qualquer caminho sem empresa" (sem a lista fechada)

```
  storage_por_empresa | WARNING:  ✗ B2 o admin da A é recusado sob a empresa B (o backup da B e um novo na B): 1 de 5 fora da regra
  storage_por_empresa | WARNING:  ✗ B6 um caminho fora de toda forma (e o malformado com empresa) não é alcançado por ninguém (----): 3 de 20 fora da regra
  storage_por_empresa | WARNING:  ✗ L3 a cláusula legada é fechada pela lista das formas antigas e é só de leitura: 1 de 4 fora da regra
  storage_por_empresa | NOTICE:  FIM storage_por_empresa: 36 asserções, 3 falhas
  ✗ storage_por_empresa — 36 asserções, 3 falhas · 3 ✗
```

### E2 — a cláusula legada sem o "só leitura" (o admin da WAP grava na forma antiga depois da contração)

```
  storage_por_empresa | WARNING:  ✗ B7 as formas antigas são lidas pelo admin da WAP, e só lidas (L---, as nove da lista fechada): 9 de 36 fora da regra
  storage_por_empresa | WARNING:  ✗ B9 ninguém grava backup NOVO na forma antiga (o admin da WAP e a plataforma, as quatro famílias): 8 de 8 fora da regra
  storage_por_empresa | WARNING:  ✗ L1 nenhuma policy de storage.objects cita empresa_legada() fora da cláusula legada da leitura de backups — citam: backups-import insere operador: 1 de 8 fora da regra
  storage_por_empresa | WARNING:  ✗ L3 a cláusula legada é fechada pela lista das formas antigas e é só de leitura: 1 de 4 fora da regra
  storage_por_empresa | NOTICE:  FIM storage_por_empresa: 36 asserções, 4 falhas
  ✗ storage_por_empresa — 36 asserções, 4 falhas · 4 ✗
```

### F — a 12ª sem reconhecer a forma NOVA (backup novo com cópia e trilha conta como órfão)

```
  storage_por_empresa | WARNING:  ✗ F1 os backups e as cópias na forma NOVA, com trilha, não contam como órfãos (quatro famílias e a raiz do órfão): 1 de 8 fora da regra
  storage_por_empresa | NOTICE:  FIM storage_por_empresa: 36 asserções, 1 falhas
  ✗ storage_por_empresa — 36 asserções, 1 falhas · 1 ✗
```

### G1 — `opcoesDaAssinatura` sem `filter` (`assinatura-realtime.test.ts`)

```
     × devolve INSERT no schema public, com o filtro da empresa — SEMPRE 17ms
     × o filtro é provadamente TOTAL hoje: as três tabelas têm empresa_id (0160/0161) e 0 linhas fora da legada 2ms
      Tests  2 failed | 25 passed (27)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  |puro| src/lib/relatorios/assinatura-realtime.test.ts > opcoesDaAssinatura: uma função para as três tabelas, com a empresa > devolve INSERT no schema public, com o filtro da empresa — SEMPRE
AssertionError: expected { event: 'INSERT', …(3) } to deeply equal { event: 'INSERT', …(3) }
 FAIL  |puro| src/lib/relatorios/assinatura-realtime.test.ts > opcoesDaAssinatura: uma função para as três tabelas, com a empresa > o filtro é provadamente TOTAL hoje: as três tabelas têm empresa_id (0160/0161) e 0 linhas fora da legada
AssertionError: expected '' to match /^empresa_id=eq\.[0-9a-f]{8}-[0-9a-f]{…/
```

### G2 — uma tabela da publication com a policy de SELECT sem o recorte (`catalogo_policies.sql` §9)

```
  catalogo_policies | WARNING:  ✗ 16a toda policy de public em tabela com empresa_id cita o termo empresa_id = any (array (select public.<fn>())) da CLASSE dela, em cada árvore, na conjunção de cima — public.anotacoes / leitura operador (using): sem o termo em
  catalogo_policies | WARNING:  ✗ 9d toda policy de SELECT de tabela da publication tem o recorte de empresa na conjunção de cima (pela forma) — sem o recorte: anotacoes / leitura operador: 1 de 3 fora da regra
  catalogo_policies | NOTICE:  FIM catalogo_policies: 46 asserções, 2 falhas
  ✗ catalogo_policies — 46 asserções, 2 falhas · 2 ✗
```

### H — `importar.ts` com o client administrativo também no descarte do backup (`superficie-admin.test.ts`)

```
     × F67B (16/11-2): importar.ts invoca o service role UMA vez só — e é no passo dos .docx, depois da RPC 15ms
      Tests  1 failed | 14 passed (15)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  |puro| src/lib/supabase/superficie-admin.test.ts > todo arquivo que usa service role está declarado, com motivo e guarda > F67B (16/11-2): importar.ts invoca o service role UMA vez só — e é no passo dos .docx, depois da RPC
AssertionError: importar.ts: o service role saiu do passo dos .docx ou ganhou outro uso: expected 2 to be 1 // Object.is equality
```

### I — "nada mudou" (o conta a conta)

**Bloqueada nesta run pelo ensaio (`28P01`, PLAN §0.2).** A metade de produção existe: o conta a conta "antes" de
produção, com 0 divergência, 14 memberships e 26.824 avaliações (`docs/f67b-evidencias/conta-a-conta/producao-f67b-antes.json`).
A prova de que o bloco SABE achar divergência (uma função sabotada dentro do próprio bloco, no ensaio) depende do ensaio;
na mesa, `scripts/perf/conta-a-conta.test.mts` §6 prova o validador e o veredito com payloads sintéticos (divergência
declarada × não declarada). O "depois" é o portão do apply — caminho B do relatório.

### J — o rollback

No CI (run 43892474619): `f67b_rollback.sql` rb6/rb8/rb9 verdes e as partes rb1–rb3/rb5 = a mesa; rb4/rb7 com a
constante das policies a medir (feito no push seguinte); `f67_rollback.sql` 7/0 rodando o F67B-desfaz antes — a impressão
do CI antes da 0185, policies inclusive. Na mesa: `docs/f67b-evidencias/E-rollback/mesa-pglite-rollbacks.txt` (a base 0193
= depois do rollback, parte a parte; os rollbacks F62–F67 com a F67B no lugar, e os dois controles).


# Relatório F51 — A decomposição da RPC de import

**Data:** 08/09/2026 · **Versão:** 1.56.0 · **Branch:** `f51-decomposicao-rpc-import` · **PR:** [#34](https://github.com/vmatusita/ti-wap-inventory-control/pull/34)

`public.importar_ativos_substituir` — 393 linhas de corpo vivo, onze cópias integrais na cadeia de
migrations — virou uma **orquestradora fina sobre oito auxiliares nomeadas**, com comportamento
idêntico e assinatura byte a byte igual. Refatoração pura: nenhuma guarda nova, nenhuma mensagem
reescrita, nenhum `empresa_id`.

---

## 1. Os números medidos, contra o que a ficha previa

Onde a minha medição contraria a ficha ou a ordem de serviço, **vale a medição**, e a divergência
está aqui.

| # | A ficha/ordem dizia | Medido | Como |
|---|---|---|---|
| 1 | migration `0130` | **`0131`** | a `0130` já existe (`0130_grant_invoker_authenticated.sql`) |
| 2 | 394 linhas (ficha) / 430 (ficha, outro §) | **393** | corpo de `declare` (59) a `end $$;` (451) |
| 3 | **7** auxiliares | **8** | as sete deixam os blocos 5/5b/5c/5d (78 linhas) sem dono — Decisão 3 |
| 4 | 12 asserções no roteiro | **11** | saída real do CI: `FIM import_substituir: 11 asserções` — a 12ª linha é o contador |
| 5 | 41 mutações ativas | **39** | `MUTACOES.length` antes da fase |
| 6 | **cinco** lugares vivos com `delete from public.ativos` fora do import | **quatro** | `resetar_itens` **nunca** apagou de `ativos` — ela mexe em `lancamentos_item` |
| 7 | 38 nomes em `k_secdef` | **38** ✓ | (o cabeçalho do próprio arquivo dizia 37, desatualizado desde a `0129` — corrigido) |
| 8 | onze cópias integrais | **11** ✓ | `0032 0033 0034 0035 0036 0037 0040 0048 0064 0080 0094` |

**A divergência nº 6 é a que mais importa**, porque é ela que define o escopo da trava. Escrever a
invariante contra "cinco lugares" teria posto `resetar_itens` numa lista de exceções onde ela nunca
precisou estar.

### 1.1 O mapa de blocos e o destino de cada um

| Bloco | Linhas na `0094` | Destino |
|---|---|---|
| 0 (contexto de operador), 0b (`e_admin`), 1a (filial) | 86–114 | **orquestradora** |
| `pg_advisory_xact_lock` | 116 | **orquestradora** (Decisão 4) |
| 1b, 1b-bis, 1c, 1d, 1e, 2 | 118–190 | `import_validar_plano` |
| 2b (revalidação TOCTOU) | 192–222 | `import_revalidar_contagens` |
| 3 (os quatro DELETEs) | 224–253 | `import_apagar_acervo_filial` (a janela fica no topo) |
| 4a | 265–292 | `import_criar_ativos` |
| 4b/4c/4d | 294–332 | `import_lancar_movimentacoes` |
| 5/5b/5c/5d | 337–414 | `import_conferir_resultado` |
| 5e | 416–425 | `import_contar_conflitos` |
| 6 (insert em `import_logs`) | 427–439 | `import_gravar_trilha` |
| `jsonb_build_object` (8 chaves) | 441–450 | **orquestradora** |

### 1.2 As assinaturas finais

```
public.importar_ativos_substituir(jsonb, text, jsonb, jsonb) returns jsonb   -- INALTERADA
public.import_validar_plano(jsonb, text, jsonb, smallint)    returns integer
public.import_revalidar_contagens(jsonb, smallint)           returns void
public.import_apagar_acervo_filial(smallint)                 returns jsonb
public.import_criar_ativos(jsonb, smallint)                  returns uuid
public.import_lancar_movimentacoes(uuid, jsonb, smallint, uuid, date, text) returns void
public.import_conferir_resultado(jsonb, smallint, integer, integer)         returns void
public.import_contar_conflitos(smallint)                     returns integer
public.import_gravar_trilha(jsonb, smallint, text, jsonb, uuid, integer×5)  returns uuid
```

`import_apagar_acervo_filial` devolve **jsonb e não parâmetros `OUT`**, e a escolha é técnica:
`regprocedure` do Postgres ignora `OUT` na identidade da função, mas o parser de assinatura do
`scripts/db/corpo-vigente.mjs` os conta. As duas ferramentas discordariam sobre o nome da função, e a
trava e o injetor mirariam alvos diferentes.

### 1.3 O custo da próxima mudança — a métrica que justifica a fase

| Função | Linhas |
|---|---:|
| orquestradora | 130 |
| `import_conferir_resultado` | 92 |
| `import_validar_plano` | 90 |
| `import_lancar_movimentacoes` | 57 |
| `import_revalidar_contagens` | 49 |
| `import_criar_ativos` | 47 |
| `import_apagar_acervo_filial` | 43 |
| `import_contar_conflitos` | 23 |
| **total** | **566** |

**Mediana: 49.** A guarda de escopo da F52 custa reemitir **130** (a orquestradora) em vez de 393. Uma
mudança na conferência custa **92** e não toca o código que apaga acervo.

⚠ **O total SUBIU 44%** (393 → 566), e declaro isso: cada função carrega cabeçalho, `declare`,
`revoke` e `comment` próprios. A dívida nunca foi "há linhas demais" — era **"o único jeito de mudar
qualquer coisa é reescrever tudo"**, e é isso que acabou.

---

## 2. As seis decisões, e o que decidiu cada uma

| # | Decisão | O custo que decidiu |
|---|---|---|
| 1 | Auxiliares **`security definer`** | INVOKER funcionaria e encolheria a superfície, mas faria a semântica de privilégio depender de **quem chama** — propriedade que hoje não existe. Numa fase cujo contrato é "nada muda em silêncio", introduzir dependência de contexto é o defeito. `k_secdef`: 38 → 46. |
| 2 | A orquestradora **mantém o laço** | Medido: `created_at` é `now()` (hora da transação, igual para todas as linhas) e `id` é uuid aleatório — **nenhuma das duas chaves de desempate de `rel_estoque_asof` carrega ordem de inserção**. Quem depende de ordem é o **trigger**. Opção (a) dá equivalência por construção; o custo é 2 chamadas plpgsql por ativo numa operação que roda uma vez por filial no go-live. |
| 3 | **Extrair** a conferência (8ª auxiliar) | O argumento contra ("verificação que sai é verificação que alguém esquece de chamar") foi **respondido pela trava**: ela exige que a orquestradora referencie cada auxiliar pelo nome. A sabotagem C provou. |
| 4 | Lock **na orquestradora** | Mesma régua da janela: efeito local à transação, declarado à vista. A ordem de recusa não muda (resolve filial → trava → valida). |
| 5 | Trava em **`src/lib/validators/`**, reusando `corpoVigente()` | Sonda empírica: o import de `.mjs` de `scripts/` a partir de `src/` passa em `tsc --noEmit` e no Vitest. Sem restrição técnica, vale a convenção da casa — e reusar evita a **quinta** reimplementação do mesmo resolvedor. |
| 6 | **Hand-fix nominal** do `database.ts` | Não há MCP Supabase, `psql`, Docker nem `DATABASE_URL` nesta sessão — e o **gate do modo automático bloqueia DDL com `delete from public.ativos`**, que a `0131` contém. O apply é caminho B **por construção**. Afrouxar o `diff-tipos.mjs` não era opção. |

Todas em `docs/DECISOES.md` (2026-09-08 · F51), com contexto, motivo e reversibilidade.

---

## 3. A prova de equivalência — o coração da fase

`import_substituir.sql` rodou no **mesmo rig** (postgres:17 limpo do runner, migrations em ordem)
contra os dois estados:

- **ANTES** — CI [34239718796](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/34239718796), última migration `0130`
- **DEPOIS** — CI [34244162444](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/34244162444), última migration `0131`

```
ANTES  (11): 1a 1b 1c 1d 1e 1e 2 3 4a 4b 4c          → FIM: 11 asserções, 0 falhas
DEPOIS (19): 0a 0b 0c 0d 0e 0f 0g 0h 1a 1b 1c 1d 1e 1e 2 3 4a 4b 4c → FIM: 19 asserções, 0 falhas
```

**Nenhum rótulo do ANTES sumiu.** E a prova não parou nos rótulos: comparar rótulos provaria pouco,
porque um rótulo passa verde dizendo outra coisa. O diff é do **texto inteiro** das 11 asserções
originais, incluindo as mensagens de exceção dos cenários 2 e 3 — que é onde uma mudança de
comportamento apareceria primeiro:

```
$ diff <(11 mensagens ✓ do ANTES) <(as mesmas 11 do DEPOIS)
(vazio)
```

**Texto idêntico, caractere a caractere.** Em `docs/f51-evidencias/roteiro-import-ANTES-x-DEPOIS.txt`.

### 3.1 A seção 0

Oito asserções novas, uma por auxiliar, numa **terceira filial** — de propósito: as filiais A e B
tinham de chegar aos cenários 1→4 exatamente como chegavam antes, ou a comparação perderia o sentido.

Ela existe porque três auxiliares (`conferir`, `contar`, `gravar`) **não têm o que derrubar no caminho
feliz**: a conferência não lança quando o import dá certo, e as outras duas não tinham asserção
própria em lugar nenhum. Sem cenário próprio, as mutações delas sairiam "não detectadas" por
**conjunto vazio** — o diagnóstico errado, que acusaria de fraca uma asserção que nem existia.

O cabeçalho da seção diz por escrito que ela roda como `postgres` e por que isso **não** contradiz o
`revoke`: o dono de uma função sempre pode executá-la, o roteiro nunca faz `set local role`, e quem
prova que as oito estão fechadas é a asserção `0e`, que lê o **ACL real**.

---

## 4. As sabotagens

| # | O que sabotei | Resultado |
|---|---|---|
| **A** | `delete from public.ativos` no corpo da orquestradora | 2 de 31 falharam — *"a orquestradora voltou a apagar acervo por conta própria"* |
| **B** | o delete numa **segunda** auxiliar (`import_criar_ativos`) | 2 de 31 — *"a cadeia do import tem DUAS portas, e a promessa da F51 é uma"* |
| **C** | apagar a chamada de `import_conferir_resultado` na orquestradora | 1 de 31 — *"auxiliar órfã: ela existe, ninguém a chama"* |
| **D** | a invariante na forma **global** | **encontrada de verdade, não simulada** — ver abaixo |
| **E** | mudar o trecho que uma mutação procura | `trocarNoCorpo` **reprovou ALTO**: *"a migration mudou e a mutação viraria um no-op silencioso"* |
| **F** | neutralizar a guarda de backup / a revalidação | é o que as mutações `import-sem-exigencia-de-backup` e `import-sem-revalidacao-de-contagens` fazem — **detectadas** pelos cenários `3` e `2` no CI |
| **G** | `v_sonda := 'a--b'; delete … where false;` numa auxiliar não autorizada | 2 de 33 — o `--` dentro do literal **não** esconde mais o delete |
| **H** | a chamada real trocada por `raise notice 'import_conferir_resultado skip debug';` | 1 de 33 — nome em string **não** conta mais como referência |
| **I** | remover UM item de `AUXILIARES` | 2 de 33 — a lista virou classificação conferida nos dois sentidos |

Após cada uma o arquivo foi restaurado e conferido por **sha256** — `git diff` vazio.

### 4.2 G, H e I vieram da revisão adversarial, e elas eram furos de verdade

A revisão em contexto fresco não encontrou defeito na `0131`. Encontrou **na trava** — e o achado é o
tipo que só aparece quando alguém tenta furar de propósito:

- `corpoSemComentarios` cortava a linha no primeiro `--` **sem saber se ele estava dentro de uma
  string**. Com `v_sonda := 'a--b'; delete from public.ativos where false;` numa auxiliar não
  autorizada, o delete real ficava invisível e os 31 testes passavam **com duas portas destrutivas no
  corpo** — exatamente o que a trava existe para impedir.
- Pior: o **nome** de uma auxiliar dentro de um literal satisfazia o `toContain` da checagem de órfã.
  Trocar a chamada real por um `raise notice` com o nome na string deixava a auxiliar órfã e a suíte
  verde. Isso atingia em cheio a premissa da **Decisão 3** ("uma chamada esquecida derruba
  `npm run test`") — o argumento com que eu justifiquei extrair a conferência.
- E remover **um** item de `AUXILIARES` fazia a suíte cair de 31 para 28 testes, **todos verdes**: a
  auxiliar deixava de ser checada em três lugares e nada acusava a perda de cobertura.

**Correção:** `codigoVivo()` limpa os **literais antes** dos comentários — a ordem é o que importa —, e
`AUXILIARES` virou **classificação conferida nos dois sentidos** contra o que as migrations definem,
no molde do `catalogo_secdef.sql`. Mais três asserções que **provam** as correções em vez de confiar em
quem leu. A trava passou de 31 para **33** asserções.

Registro honesto: a primeira versão da trava teria sido mergeada com esses furos se a revisão não
tivesse tentado furá-la. É o argumento da própria fase — asserção que ninguém tentou quebrar é
sensação de rede.

### 4.1 A sabotagem D aconteceu sozinha

A ordem pedia que eu escrevesse a invariante na forma global e mostrasse-a nascendo vermelha por
causa de `apagar_ativo` e das RPCs de reset. **O repositório já tinha uma varredura assim, e ela
mordeu de verdade**: `src/lib/itens/migrations-f38.test.ts` cobra "nenhuma migration da fase apaga
registro do acervo" por grep cru sobre o arquivo inteiro. A `0131` é a **primeira migration da faixa
≥ `0116` a recriar uma função destrutiva**, e o grep a reprovou por motivo inteiramente legítimo.

A correção **não foi afrouxar**: foi apontar a régua para o que ela sempre quis dizer — **o que a
migration EXECUTA ao ser aplicada**. Corpos dollar-quoted saem da conta; um `delete` de topo continua
reprovando, e há uma asserção nova ("guarda da guarda") que **prova a diferença** em vez de confiar em
quem leu. O mesmo raciocínio, com as mesmas palavras, já estava em `scripts/db/mutacoes.test.mts`
(describe 5). Gate que nasce vermelho por motivo legítimo é gate que alguém desliga.

---

## 5. O injetor — e as duas mutações que o CI reprovou

**47 ativas** (39 + 8), 2 em quarentena (as duas são da F52; esta fase não as tocou). Teto 44 → **48**, com o motivo escrito no próprio teste, como a linha da F48 manda.
com o motivo escrito no próprio teste, como a linha da F48 manda.

No lote final (CI 34248964404): **47/47 acusadas pelo cenário NOMEADO**, com o controle verde antes
de mutar — se o acervo de asserções já estivesse vermelho, o injetor abortaria em vez de reportar 47
"detectadas" por um roteiro que já falhava.

As nove do import:

| Mutação | Alvo | Cenário |
|---|---|---|
| `import-sem-revalidacao-de-contagens` *(reapontada)* | `import_revalidar_contagens` | `2` |
| `import-revalidacao-nao-compara-o-vivo` | `import_revalidar_contagens` | `0b` |
| `import-sem-exigencia-de-backup` *(reapontada)* | `import_validar_plano` | `3` |
| `import-trilha-do-apagado-mente-nas-anotacoes` | `import_apagar_acervo_filial` | `0g` |
| `import-ativo-nasce-sem-origem-importacao` | `import_criar_ativos` | `4b` |
| `import-compra-de-abertura-sem-marcador` | `import_lancar_movimentacoes` | `1e`, `0h` |
| `import-conferencia-de-estado-cega` | `import_conferir_resultado` | `0f` |
| `import-contagem-de-conflitos-mentida` | `import_contar_conflitos` | `0c` |
| `import-trilha-com-id-perdido` | `import_gravar_trilha` | `0d` |
| `import-auxiliar-destrutiva-vira-api` | o `revoke` | `0e` |

**O reapontamento não era adiável.** `mutarFuncao()` resolve o corpo vigente no **import do módulo**,
não lazy: no instante em que a `0131` moveu os trechos, `trocarNoCorpo` passaria a lançar no `import`
de `mutacoes.mjs`, derrubando o carregamento **inteiro** do catálogo — `mutacoes.test.mts` **e**
`npm run db:test:mutations` parariam de rodar por completo, não só as duas do import. Por isso
migration e reapontamento foram no mesmo commit.

### 5.1 O CI reprovou duas das minhas mutações novas — e as duas eram defeito da mutação

Run [34243304117](https://github.com/vmatusita/ti-wap-inventory-control/actions/runs/34243304117). **O
controle fechou verde**, com a seção 0 inteira passando: a `0131` estava certa.

1. **`import-sem-revalidacao-de-contagens` saiu "NÃO detectada".** Trocar a condição por `if false
   then` só neutralizava a revalidação **enquanto existia o resíduo do item N** logo abaixo: com
   `p_contagens` nulo, aquele segundo `if` também era falso e o bloco sumia inteiro. Removido o
   resíduo, a mesma troca deixa o corpo seguir com os sentinelas `-1` do `coalesce`, que não batem com
   o vivo e levantam a exceção de "estado mudou desde o preview" — o roteiro via a RPC recusar e
   marcava ✓. Corrigida para sair **pela porta** (`return;`).
2. **`import-apagar-acervo-esquece-as-anotacoes` fazia o roteiro ABORTAR**, não ficar vermelho:
   `anotacoes.ativo_id` tem FK para `ativos` (`0017:8`), então deixar as anotações vivas faz o `delete
   from public.ativos` seguinte estourar violação de chave e matar o bloco antes da linha `FIM`. Passou
   a **mentir a contagem**, mesma classe de defeito sem a cascata.

Ganho lateral: a revalidação ficou com as **duas metades provadas em separado** — uma mutação para a
recusa, outra para a comparação —, para que nenhuma passe de carona na outra.

---

## 6. O `revoke`, provado contra um banco de verdade

A ordem pedia `has_function_privilege` "do ensaio". Não foi possível (§7). A substituição é **melhor
do que uma promessa de handoff**: a prova virou **asserção do roteiro** (`0e`), que roda a cada push
contra o Postgres do CI com as 131 migrations aplicadas, e vai continuar rodando depois desta fase.

```
✓ 0e as 8 auxiliares do import estão fechadas nos quatro papéis (public, anon, authenticated, service_role)
```

Ela lê `has_function_privilege` nos três papéis **e** o `proacl` para PUBLIC — porque PUBLIC não é
role, e é a lição da F50: revogar de `anon` sem revogar de `public` é **no-op silencioso**. E a mutação
`import-auxiliar-destrutiva-vira-api` prova que `0e` **sabe ficar vermelha**; sem ela, uma asserção que
espera zero poderia estar contando sobre conjunto vazio.

---

## 7. Pendências

**1. O apply da `0131` — caminho B, por construção.** O classificador do modo automático bloqueia
qualquer DDL cujo corpo contenha `delete from public.ativos` (`RUNBOOK-BANCO.md:45`), e a `0131`
contém — em `import_apagar_acervo_filial`, que é a razão de ela existir. Além disso, esta sessão não
tem MCP Supabase conectado, nem `psql`, nem Docker. **Não é azar de sessão: qualquer sessão futura
esbarra no mesmo gate.**

Handoff em `scratchpad/f51-handoff-apply-0131.sql`, com contagens antes, o `md5` **normalizado** do
corpo vigente (para o rollback), e o bloco de verificação pós-apply. A verificação obrigatória está no
rodapé da própria migration, em seis consultas.

⚠ A migration **não toca dado** — cria 8 funções e recria 1 por `create or replace`. Mas ela **recria a
função que apaga acervo**, e a regra 5 do `CLAUDE.md` vale pelo que a função pode fazer.

**2. O `database.ts`.** As 8 entradas entraram **à mão**, com comentário datado. A primeira
regeneração após o apply as reescreve e leva o comentário junto.

**3. O smoke — rodado, e o que ele diz.** `node scripts/smoke/smoke-prod.mjs` depois do merge:
**108 OK, 1 aviso, 0 falha** (`docs/f51-evidencias/smoke-pos-merge.txt`). O aviso é **pré-existente e
sem relação com esta fase**: não há kit cadastrado, então a RLS de `kits_modelos` não pode ser
comprovada por leitura.

O que ele prova é que o merge **não regrediu nada** — o hand-fix do `database.ts` é só TIPO, apagado
em runtime, então produção segue com a RPC monolítica da `0094` e todas as rotas respondendo. O que
ele **não** prova, dito por extenso: **o smoke nunca exercitou o import**, que é destrutivo e só roda
na janela de go-live de uma filial.

---

## 8. Os 22 critérios

| # | Critério | Situação |
|---|---|---|
| 1 | Migration é a `0131`, com `db:lock` no mesmo commit | ✅ |
| 2 | Assinatura e retorno byte a byte iguais, por diff | ✅ diff vazio nos dois |
| 3 | Auxiliares da ficha existem; a 8ª decidida e registrada | ✅ Decisão 3 |
| 4 | `import_apagar_acervo_filial` é a única com o delete; trava reprova quando sabotada | ✅ sabotagens A, B, G, I |
| 5 | Cabeçalho nomeia os lugares legítimos; sem teto de tamanho | ✅ **quatro** (medido) |
| 6 | `revoke` nos quatro papéis, provado | ✅ asserção `0e` contra banco real (§6) |
| 7 | Janela no topo, com motivo; Decisão 4 registrada | ✅ |
| 8 | `e_admin()` na orquestradora, antes de tudo, com `42501` | ✅ |
| 9 | Resíduo do item N fora; nenhuma migration histórica editada | ✅ `migrations-lock.test.ts` verde |
| 10 | Roteiro dá o mesmo resultado, rótulo a rótulo | ✅ e mais: **texto idêntico** |
| 11 | Seção 0 exercita cada auxiliar; rótulos sem prefixo; cabeçalho explica o `postgres` | ✅ |
| 12 | Mutações reapontadas + uma nova por auxiliar; teto tratado | ✅ 47 ativas, teto 48 |
| 13 | `catalogo_secdef` conhece as auxiliares (38 → 46), nos dois sentidos | ✅ |
| 14 | `md5` normalizado na ata, com o aviso sobre ambientes | ✅ |
| 15 | Frente 5 resolvida | ✅ **a F36/`0110` já fechou** — ata com as linhas |
| 16 | `lint`, `test`, `build`, `tsc` limpos; sem dependência nova; sem `empresa_id` | ✅ |
| 17 | `db:types:diff` passa; Decisão 6 registrada | ✅ hand-fix nominal |
| 18 | Apply tentado; handoff e pendência nomeados | ⚠️ **caminho B** — §7 |
| 19 | Matriz com R-ACC-45→48, contador 252 | ✅ |
| 20 | Dívida **X** abatida, com o número real de linhas | ✅ mediana 49 (era 393) |
| 21 | Versão 1.56.0, registry, CHANGELOG, tag | ✅ tag anotada `v1.56.0` publicada |
| 22 | PR mergeado com os dois checks verdes | ✅ PR 34, merge `852c88d`, CI 34249621048; branch apagada, `main` limpa |

---

## 9. O que este relatório NÃO prova

1. **A equivalência foi provada pelos cenários que o roteiro cobre** — 4 cenários + a seção 0, 19
   asserções —, **não** sobre o espaço inteiro de planos de import. Um plano com forma que o roteiro
   não monta não foi comparado.
2. **A trava é de TEXTO das migrations, não do banco.** O que está no ar é o que o apply pôs lá, e
   quem responde por isso é a verificação pós-apply — **que nesta fase está pendente**.
3. **Nada aqui REDUZ a superfície da RPC: reorganiza.** As oito auxiliares somam o mesmo poder de
   antes. O que mudou é que ele passou a ter nomes, e que uma delas é a única que apaga.
4. **O smoke não exercita o import.**
5. **Nenhuma guarda nova entrou.** `importar_ativos_substituir` segue **sem** `pode_escrever_filial` —
   isso é F52.
6. **As onze cópias históricas continuam lá**, resíduo do item N incluído. O que mudou é que a **décima
   segunda não vai existir**.

---

## 10. Backlog

**Para a F52:**

- **O achado que a fase encontrou de graça:** `cargo_dev.sql:242` (`1d`) e `papeis_rls.sql:963` (`3i`)
  chamam a RPC do import com `exception when others` cujo ramo final trata **qualquer** erro —
  inclusive `42883 function does not exist` — como "passou pela guarda". Se um dia a assinatura mudar,
  as duas ficam **verdes por engano**. Nesta fase a assinatura não mudou e `seguranca_catalogo.sql`
  asserção 1 cobre o caso; fortalecer asserção alheia no meio da única prova de equivalência da fase
  teria sido trocar a rede por uma opinião.
- **O que a decomposição facilitou:** a guarda `pode_escrever_filial` no import agora custa reemitir
  **130 linhas** (a orquestradora) em vez de 393, e o lugar dela é óbvio — logo depois do `1a` e antes
  do lock. O `prefixo_backup_import` e a conferência de existência do objeto entram em
  `import_validar_plano` (90 linhas). A confirmação digitada, na orquestradora. O `arquivo_hash`,
  idem.
- **O que ela NÃO facilitou:** a idempotência por `arquivo_hash` precisa de estado **entre** chamadas,
  e nenhuma auxiliar ajuda nisso. E as duas entradas da quarentena do injetor continuam exigindo
  cenário **concorrente** e cenário com **26 ativos** — decompor a RPC não muda nada ali.

**Para a F56:** o vocabulário como dado não encosta na cadeia do import.

**Herdado, ainda fora:** o comentário morto em `scripts/gen-types.ts` (cita o job `banco`, removido na
v1.51.1) e a exclusão `_%` em `supabase/ci/impressao-schema.sql`.

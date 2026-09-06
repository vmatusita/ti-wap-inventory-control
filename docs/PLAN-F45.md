# PLAN-F45 — O portão fecha, e o teste de componente ganha piso

*Medido no repositório em 05/09/2026, na `v1.49.1` (commit `feb2ba0`). Este documento é o gabarito
da fase: a ordem dos incrementos, os formatos que as fases seguintes vão herdar, e o que fica fora.*

---

## 1. O diagnóstico, conferido ponto a ponto

A ordem da F45 trouxe oito pontos. Cada um foi conferido no código antes de qualquer linha ser
escrita. Sete bateram; **um não bateu, e a divergência é o achado nº 1 da fase.**

| # | O que a ordem afirmava | Conferido | Resultado |
|---|---|---|---|
| 1 | O CI não reprova nada — nenhum *required status check* | `.github/workflows/ci.yml`, dois jobs; a `main` sem *branch protection* | ✅ confere |
| 2 | `cancel-in-progress: true` vale para push e para PR | `ci.yml:13` | ✅ confere |
| 3 | `verificar-actions-build.mjs` existe, é bom, e ninguém roda | ausente do `package.json` e do `ci.yml` | ✅ confere |
| 4 | O loop dos roteiros vive dentro do YAML | passo "Rodar os roteiros de teste SQL", com `for f in supabase/tests/*.sql` | ✅ confere |
| 5 | Roteiro que aborta cedo passa verde; nenhum tem linha `FIM` | `grep -l FIM supabase/tests/*.sql` → **nenhum** | ✅ confere |
| 6 | **13** roteiros não contam asserção | `grep -cE 'v_ok := v_ok \+ 1'` em cada um | ❌ **são 15** |
| 7 | Zero `.test.tsx` em 273 `.tsx`; `react-dom` 19.2.8; `"jsx": "react-jsx"` | `find`, `package.json`, `tsconfig.json:14` | ✅ confere |
| 8 | O `include` do Vitest deixa buracos | `.test.tsx` não casa `*.test.ts`; `scripts/` só cobre `import/__tests__` | ✅ confere, com ressalva |

**O ponto 6 — o achado nº 1.** A lista de treze da ordem está certa no que afirma e incompleta no
que omite: **`dominios_login.sql` e `itens_quantidade.sql` também não contam asserção nenhuma.** Os
dois têm uma variável chamada `v_ok`, mas ela é **booleana** — "o insert deu certo?" em um, "foi
recusado?" no outro — e é reciclada a cada iteração. Um `grep` por `v_ok` os classifica como "já
têm contador"; um `grep` por `v_ok := v_ok + 1` mostra **zero** nos dois. São **15**, não 13, e as
duas variáveis precisam ser renomeadas antes de o contador entrar, senão há colisão de nome e tipo
no mesmo `declare` (PL/pgSQL recusa).

**A ressalva do ponto 8.** O buraco é REAL mas ainda **latente**: hoje os 149 arquivos de teste
estão todos cobertos. O que o `include` estreito garante é que o *próximo* teste escrito em
`scripts/design/` ou `scripts/termos/` nasça morto. É exatamente por isso que a trava desta fase
afirma cobertura, e não ausência de órfãos hoje.

---

## 2. A ordem dos incrementos, e por que esta ordem

Cada incremento fecha sozinho e deixa a árvore verde.

1. **`rodar-roteiros.sh` + `_asserts.sql`.** Primeiro a ferramenta, porque tudo depois se mede por
   ela. O runner nasce já exigindo a linha `FIM` — ou seja, nasce **reprovando os 24 roteiros**.
2. **Os roteiros.** Só agora eles ganham a linha que o runner exige. É a ordem que faz a trava
   preceder a correção (regra 4 do §4 do plano).
3. **`ci.yml`.** Com o script pronto, o YAML passa a chamá-lo; e o `cancel-in-progress` e o
   `verificar:actions` entram no mesmo commit, porque são a mesma frase: "o CI pode reprovar".
4. **`vitest.config.mts` + as três sementes.** Independente do resto; entra depois porque o
   `include` novo é pré-requisito da asserção de cobertura da trava.
5. **`ci-passos.test.ts`.** Por último entre os de código, porque afirma sobre tudo o que veio antes.
6. **`.gitattributes`, documentação e versão.**

---

## 3. Os três formatos que as fases seguintes herdam

### 3.1 A linha `FIM`

```sql
raise notice 'FIM <nome do arquivo sem .sql>: % asserções, % falhas', v_ok + v_falhas, v_falhas;
```

**ÚLTIMA instrução do ÚLTIMO bloco `do $$`**, imediatamente antes do `end $$;`. A posição é a regra:
é ela que faz a linha só sair quando o roteiro chegou ao fim. Roteiro que aborta no meio — por
`return`, por `raise exception` de pré-requisito, por `assert_zero_de` recusando universo vazio —
não emite a linha, e o runner reprova por ausência dela.

O contador é `v_ok int := 0` / `v_falhas int := 0`, declarado no `declare` do bloco principal, e
incrementado **antes** do `raise`, na mesma linha:

```sql
if <invariante> then
  v_ok := v_ok + 1; raise notice '✓ 3b o substituto foi preservado';
else
  v_falhas := v_falhas + 1; raise warning '✗ 3b substituto sumiu (não deveria)';
end if;
```

É o estilo que os nove roteiros que já contavam usavam. A F45 não inventou forma nova — ela
generalizou a que existia.

**O que a contagem significa, com precisão:** `N` é o número de asserções que **se pronunciaram**,
isto é, que emitiram `✓` ou `✗`. Três guardas de pré-condição do acervo
(`itens_quantidade.sql:11a`, `transicoes_extra.sql:1c` e o setup do cenário 10 de
`f41_regularizacao.sql`) só falam quando falham; quando passam, não somam. É deliberado: elas são
guarda, não asserção, e contá-las como asserção sem imprimir `✓` faria o número divergir das linhas
visíveis no log.

### 3.2 Onde mora o teste de componente

**Ao lado do componente, com sufixo `.test.tsx`** — `src/components/layout/aviso.test.tsx`. As
cinco varreduras repo-wide de código excluem `*.test.tsx`. A alternativa (esconder por caminho) foi
medida e perde: `cores.test.ts` e `use-server-exports.test.ts` varrem `src/` inteiro sem exclusão de
subpasta, então não existe diretório dentro de `src/` que escape das cinco. Ata em
`docs/DECISOES.md` (2026-09-05 · F45).

### 3.3 O contrato do runner

`scripts/db/rodar-roteiros.sh` reprova um roteiro por qualquer um destes cinco motivos:

| # | Motivo | Por que existe |
|---|---|---|
| 1 | `psql` saiu diferente de 0 | erro de SQL — já valia antes |
| 2 | a linha `FIM <nome>` não apareceu | **novo** — abortar em silêncio era o buraco maior |
| 3 | `N` = 0 asserções | **novo** — "não vi ✗" não é "rodei N e N passaram" |
| 4 | a linha `FIM` declara `M > 0` falhas | redundante com o nº 5, de propósito |
| 5 | saiu `WARNING:  ✗` **ou** `NOTICE:  ✗` | **o `NOTICE` é novo** |

O `✗` tem de **abrir** a mensagem (regex `(WARNING|NOTICE):[[:space:]]+✗`), para que um `✗` citado
no meio de um texto informativo não vire falso vermelho.

E o runner **carrega `_asserts.sql` antes de cada roteiro, na mesma sessão de psql** (dois `-f` numa
chamada só) e **pula `_*.sql`**.

---

## 4. `pg_temp.assert_zero_de` — o desenho, e o porquê da exceção

```sql
pg_temp.assert_zero_de(rotulo text, ruins bigint, universo bigint) returns boolean
```

- `universo` vazio ou nulo → **`raise exception`**;
- `ruins` nulo, negativo ou maior que `universo` → **`raise exception`** (erro de quem chamou);
- `ruins = 0` → emite `✓ <rótulo> (0 de N conferidos)` e devolve `true`;
- `ruins > 0` → emite `✗ <rótulo>: R de N fora da regra` e devolve `false`.

**Por que exceção, e não `✗`.** Universo vazio não é "o cenário falhou": é "o cenário não existiu".
Tudo que vem depois examina um mundo que não foi montado. A exceção derruba o bloco, o roteiro não
emite a linha `FIM`, e o runner reprova pela ausência da linha — **as duas peças foram desenhadas
para se encaixarem, e é por isso que nasceram no mesmo commit.**

**Carregamento.** Todo roteiro é `begin; do $$ … $$; rollback;`. Função criada DENTRO da transação
some no `rollback`. Por isso o arquivo é carregado **antes** do `begin`, na mesma sessão:
`psql -f supabase/tests/_asserts.sql -f <roteiro>.sql`.

**Ela ainda não é usada pelos roteiros de produto**, e isso é escopo, não esquecimento: converter as
asserções tautológicas existentes muda a FORÇA delas, e a ordem restringe os roteiros a mudança de
instrumentação. A conversão é matéria da fase dos catálogos de segurança (§3 do plano).

---

## 5. O que fica FORA

- **Banco.** Nenhuma migration, RPC, view ou policy. A última continua sendo a `0127`.
- **jsdom, `@testing-library/*`, `@vitejs/plugin-react`**, ou qualquer dependência nova.
- **Teste de componente com interação.** `renderToStaticMarkup` produz HTML estático, e é sobre ele
  que as três sementes afirmam.
- **Refatorar componente.** Se o componente estiver difícil de testar, o teste se adapta.
- **`vercel.json`.** O portão do GitHub já resolve.
- **Converter as asserções tautológicas** para `assert_zero_de` (é a fase seguinte do bloco A).
- **Trava de hash de migration, injetor de mutações, catálogos de segurança** — nada antecipado.

---

## 6. A verificação de ponta a ponta

| O que | Como | Onde está a saída |
|---|---|---|
| O transform de JSX funciona sem plugin | teste descartável antes das três sementes | `docs/f45-evidencias/prova-1-transform-jsx.txt` |
| A lógica de reprovação do runner | `psql` dublê, 9 cenários | `docs/f45-evidencias/prova-2-runner.txt` |
| A trava sabe ficar vermelha | 4 sabotagens, desfeitas | `docs/f45-evidencias/prova-3-trava-fica-vermelha.txt` |
| Nenhum roteiro mudou de cenário | diff que reverte exato | `docs/f45-evidencias/prova-4-instrumentacao.txt` |
| O projeto `puro` não perdeu arquivo | `vitest list` antes × depois | `docs/f45-evidencias/vitest-arquivos-*.txt` |
| Os cinco comandos | `lint`, `test`, `contraste`, `build`, `tsc --noEmit` | `docs/f45-evidencias/comandos.txt` |
| **O SQL roda de verdade** | **job `banco` do CI** | **não há Postgres nesta máquina — ver §9 do relatório** |
| **O portão fecha** | **PR descartável com roteiro vermelho** | **depende da *branch protection* — ver §8 do relatório** |

As duas últimas linhas são as que esta fase **não** conseguiu executar, e o relatório diz por quê,
sem eufemismo.

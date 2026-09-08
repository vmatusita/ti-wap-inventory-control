# F52 — Medições de partida (08/09/2026)

Refeitas contra o disco e contra os dois bancos, antes de escrever qualquer linha.

## Disco

| O quê | Medido | Onde |
|---|---|---|
| Última migration | `0131_import_decomposto.sql` (130 arquivos) | `supabase/migrations/` |
| Próxima | **`0132`** | — |
| Versão no ar | `1.56.0` → alvo **`1.57.0`** | `package.json` |
| Nomes em `k_secdef` | **46** | `supabase/tests/catalogo_secdef.sql:61` |
| Mutações ATIVAS | **47** (teto 48) | `scripts/db/mutacoes.mjs` |
| Quarentena | **2**, ambas `fase: 'F52'` | idem |
| Roteiros SQL | **30** (a ordem supunha "25+") | `supabase/tests/*.sql` |
| `exigir_gestao_de` | **JÁ EXISTE** | `0074:72` |
| `existe_outro_admin_ativo` | `(p_excluindo uuid)` — **sem** parâmetro de escopo | `0074:126` |
| `arquivo_hash` | existe desde `0031:29`; **escrita** em `0131:656` e `importar.ts:484`; **nunca lida** | — |
| `psql` / `DATABASE_URL` na mesa | **ausentes** — sem Postgres local | — |
| `gh` | **2.96.0, presente** | — |

## Bancos (via MCP, 08/09/2026)

| Projeto | ref | status | `security definer` | auxiliares `import_*` |
|---|---|---|---|---|
| Produção | `pbtjcalbmepmrqzprusb` | ACTIVE_HEALTHY | **38** | **0** |
| Ensaio | `sgmvldiizsrjbxzzpmhh` | **ACTIVE_HEALTHY** | **37** | **0** |

- **A `0131` NÃO está aplicada em nenhum dos dois.** O `🚧` do CHANGELOG é real.
- Produção tem exatamente as 38 esperadas do estado `0130` — nada a mais, nada a menos.
- Ensaio está **uma atrás**: falta só `pode_ler_arquivo_termo` (`0129`).
- **O ensaio está ACTIVE** — divergência a favor: ele esteve INACTIVE nas F36/F37/F50.

## A prova do overload (Decisão 3)

A ficha do §5 afirma, no item 6, que `p_confirmacao text default null` "mantém `create or
replace` puro". **É falso**, e a prova é um `begin; … rollback;` contra o ensaio (PG 17.6):

```sql
create or replace function public.f52_prova_overload(a int) returns int ...;
create or replace function public.f52_prova_overload(a int, b text default null) returns int ...;
-- resultado: 2 funções
--   f52_prova_overload(integer,text) | f52_prova_overload(integer)
```

`create or replace` casa pela **lista de tipos dos argumentos**; acrescentar parâmetro — ainda
que com `default` — produz uma função NOVA. Um overload aqui quebraria
`seguranca_catalogo.sql:94` (que espera exatamente 1 linha) e a asserção de overload de
`catalogo_secdef.sql`. **Decisão 3 → saída (b): a confirmação viaja dentro de `p_plano`.**

## A prova da resolução de `existe_outro_admin_ativo` (Decisão 2)

A ficha pede "o parâmetro de escopo". O caminho ingênuo (`create or replace` acrescentando
`p_escopo uuid default null`) **quebra as três RPCs que a chamam**, e a prova é um
`begin; … rollback;` no ensaio (PG 17.6):

| Hipótese | Chamada de 1 argumento | Veredito |
|---|---|---|
| **A** — a de 1 arg e a de 2-com-default **coexistem** | `f52_amb(uuid)` | **FALHOU `42725` — function is not unique** |
| **B** — `drop` da de 1 arg, só a de 2-com-default sobra | `f52_amb(uuid)` | **RESOLVEU** para a de 2 args |

`existe_outro_admin_ativo(p_alvo)` é chamada em `0074:176`, `0074:220` e `0074:319`. Na
hipótese A as três passariam a levantar `42725` **em tempo de execução** — a troca de cargo, a
desativação e o apagamento de conta quebrariam de uma vez, e nenhum `create or replace`
acusaria isso no apply.

**Decisão 2 → mecanismo: `drop function public.existe_outro_admin_ativo(uuid);` seguido de
`create function … (p_excluindo uuid, p_escopo uuid default null)`.** As três chamadas de um
argumento continuam resolvendo, agora com `p_escopo => null`. Nenhuma das três RPCs precisa ser
recriada — o que mantém o diff da `0132` restrito ao que a fase promete.

# F52 — Privilégio das funções novas e a prova do no-op

Tudo abaixo é saída real de `begin; … rollback;` contra o **ensaio**
(`sgmvldiizsrjbxzzpmhh`, PostgreSQL 17.6.1.141), em 08/09/2026. Nada foi persistido.

## 1. `has_function_privilege` nos quatro papéis (critério 1)

As quatro funções novas/alteradas, contra `anon`, `authenticated`, `service_role` e `public`
— **16 combinações, todas `false`**:

| Função | anon | authenticated | public | service_role |
|---|---|---|---|---|
| `mesmo_escopo_de_gestao(uuid)` | false | false | false | false |
| `prefixo_backup_import(smallint)` | false | false | false | false |
| `exigir_ativos_da_empresa(uuid[])` | false | false | false | false |
| `existe_outro_admin_ativo(uuid,uuid)` | false | false | false | false |

É o **estado final** das duas auxiliares irmãs depois da `0078` — que ganharam `grant` a
`authenticated` na `0074` e foram fechadas na migration seguinte, depois de uma leitura de
advisors. Nascer aberta repetiria o mesmo erro no mesmo commit.

## 2. A resolução da chamada de um argumento (Decisão 2)

| Caso | Esperado | Obtido | Veredito |
|---|---|---|---|
| chamada de 1 arg (o que as 3 RPCs da `0074` fazem) | resolve | resolveu | **OK** |
| escopo nulo explícito == chamada de 1 arg | mesmo veredito | mesmo veredito | **OK** |
| sem overload | 1 função | 1 função | **OK** |

## 3. Escopo nulo NÃO recusa tudo (critério 3) — e a forma errada, lado a lado

Com **dois** administradores fictícios (`Ada Fantasia`, `Beto Ficticio` — nomes de fantasia,
regra 2 do `CLAUDE.md`) inseridos dentro do `begin; … rollback;`:

| Caso | Esperado | Obtido | Veredito |
|---|---|---|---|
| forma **NOVA**, escopo nulo, havendo outro admin | `true` | **`true`** | **OK** |
| forma **NOVA**, chamada de 1 arg | `true` | **`true`** | **OK** |
| forma **ERRADA** (`null::uuid = p_escopo`), escopo nulo | deveria ser `true` | **`false`** | **RECUSA TUDO** |

A terceira linha é o risco que o plano nomeia, **demonstrado** em vez de descrito: com
igualdade crua, escopo ausente faz a comparação virar NULL, o `exists` devolve `false`, e a
trava do último administrador passaria a **recusar toda troca de cargo, toda desativação e todo
apagamento de conta**. É por isso que o corpo entregue usa **disjunção guardada**
(`p_escopo is null or …`) e nunca igualdade crua.

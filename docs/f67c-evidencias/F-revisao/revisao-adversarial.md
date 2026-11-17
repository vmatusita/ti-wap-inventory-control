# F67C — a revisão adversarial (16/11/2026)

**Quem e como.** Workflow `wf_4cb8c5b1-2f4`, 8 agentes de contexto limpo: cinco revisores com lentes distintas e um
CÉTICO por lente com achado, instruído a REFUTAR (na dúvida, refutado). Todos leram o código PELO SHA `76676211`
(`git show`/`git diff bdf3e231..76676211`), nunca pela árvore de trabalho (a lição da memória "cético lê a árvore");
proibidos de abrir `.env*`, de tocar banco vivo e de editar. Nenhuma correção foi feita durante o voto.

As lentes:
1. **SQL da expansão** (0200–0204 contra o corpo vigente de cada função; a fonte da empresa; ACL; as intocáveis);
2. **contração e rollback** (os 20 defaults por lote; `lock_timeout`; o `F67C-desfaz.sql` contra a definição < 0200;
   idempotência; os `\ir` nos rollbacks anteriores);
3. **app** (cada `.insert`/`.upsert` nas 20; lote multi-filial; o client de sessão; a trilha; os leitores; regressões);
4. **scripts e restauração** (`restaurar.mjs`, carga, seed, smoke, errata; as mutações F67C);
5. **as travas** (furos concretos de 15l/15m, `sem_lista_de_escrita`, `escrita-com-empresa.test.ts`, a régua de leitura).

## Resultado: 9 achados, 0 mantidos, 9 refutados

| lente | achado | o motivo do cético (resumido) |
|---|---|---|
| contração/rollback | o 2º `F67B-desfaz` do `f62_rollback.sql` (o ramo "com a cópia", depois do `rollback to savepoint`) roda sem o `F67C-desfaz` antes | o ramo começa de um estado já desfeito; o rb3 do ramo só confere esquema que a F67C não toca; o `supabase/CLAUDE.md` diz "antes do PRIMEIRO `F67B-desfaz`"; e a saída dos rollbacks anteriores é IDÊNTICA com e sem a F67C (mesa) |
| app | `empresaDaFilial` sem `try/catch` em `validarImport`/`baixarCsvCorrigido` e outras: uma falha do RPC vira exceção não tratada | degradação de MENSAGEM em falha transitória de infraestrutura; nenhum dado gravado, nenhuma invariante quebrada; o padrão de lançar já existe (`unidadesDaMesmaEmpresa`) |
| travas | `INSERT … (SELECT …)` sem lista de colunas é apagado como se fosse lista e passa por 15m/15h/7b/disco | nenhuma ocorrência no SHA; sem o default, o NOT NULL (23502) e o tipo `Insert` recusam o escritor que esquece |
| travas | `MERGE … WHEN NOT MATCHED THEN INSERT (…)` escapa das varreduras | nenhum `merge` no SHA; o NOT NULL recusa |
| travas | alvo entre aspas (`"public"."itens"`) não é reconhecido pela 15m nem pela varredura de disco | nenhuma ocorrência; o padrão do repositório é sem aspas; o NOT NULL recusa |
| travas | `.from('<das 20>')` guardado em variável e usado depois escapa da varredura TS | nenhuma ocorrência; o tipo `Insert` (empresa_id obrigatório) pega na compilação |
| travas | o teste "código executado das migrations ≥ 0200" não exige universo mínimo | 0200–0207 não têm INSERT executado (são DDL de função e de default); exigir > 0 falharia por construção; as sabotagens sintéticas provam o detector |
| travas | INSERT com tabela dinâmica (`insert into public.${tabela} (…)`) é invisível à parte 3; o `restaurar.mjs` só está seguro "por convenção" | a linha 348 do `restaurar.mjs` monta `[...colunas, 'empresa_id']`, sempre com a coluna; a guarda `restaurar-guarda.test.mts` cobre o SQL gerado (a sabotagem F deixa 12 casos vermelhos) |
| travas | a parte 1 (disco) mascara o literal de `execute '<insert …>'` | a 15m do CI lê o texto CRU das funções com `execute`; a autoridade sobre SQL dinâmico é a trava de catálogo, por desenho |

**O que fica declarado no relatório** (limites das varreduras, não defeitos do que foi entregue): MERGE, alvo entre aspas,
`INSERT … (SELECT …)` posicional, `.from()` em variável e a tabela dinâmica em texto. Os três primeiros caem no NOT NULL em
tempo de execução; o quarto, no tipo; o quinto, na guarda do SQL gerado.

**Cobertura declarada pelos revisores** (o que NÃO leram): a lente SQL não leu o app nem os roteiros; a de contração não
rodou banco (as constantes `k_antes` foram conferidas depois pela mesa e pelo CI — o CI do `76676211` acusou só o rc5,
corrigido em `1ea59f33`); a de app não leu as migrations 0205–0207; a de travas não executou nada. O que nenhuma lente
cobriu e o CI cobre: os 65 roteiros, o injetor 188/188 e o `db:types:diff`.

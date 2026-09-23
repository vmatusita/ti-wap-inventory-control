# O "antes" da F63 — PENDENTE (conector da Supabase desligado)

Em 23/09/2026, no início da run, toda ferramenta do conector da Supabase respondeu *"This tool has
been disabled in your connector settings"* (`list_projects`, `execute_sql`, `list_migrations`). Sem o
conector, **nenhuma impressão foi tirada e nenhuma migration foi aplicada** — o portão "o antes vem
antes de qualquer apply" vale por construção.

Quando o conector voltar, esta pasta recebe, nos DOIS bancos e ANTES do primeiro apply:

- `impressao-acervo-ensaio.json` e `impressao-acervo-producao.json` — `docs/f63-evidencias/impressao-acervo.sql`
  com o parâmetro vazio (e o `corte_para_o_depois` de cada um anotado);
- `impressao-policies.json` — `docs/f63-evidencias/impressao-policies.sql`;
- `advisors.json` — `get_advisors(security)`, contado por nível e nome.

Só contagens e hashes. Nenhum id, nome, patrimônio ou texto.

# F59 · Frente A/F — Censo dos documentos que ensinam a forma lenta ou o falso içamento

Varredura de `docs/**`, `CLAUDE.md`, `AGENTS.md` e cabeçalhos/comentários de `supabase/migrations/*.sql` e
`supabase/tests/*.sql`, no disco de hoje (16/09/2026, branch `f59-doutrina-do-predicado`, sem editar nada).
Somente schema (nome de tabela/policy/função/coluna) e contagens aparecem abaixo — nenhum dado real.

Legenda de classificação:
- **VIVO** — documento que `docs/README.md` lista em "Documentos vivos" (espera-se que diga a verdade hoje).
- **EXPLORAÇÃO** — categoria própria do índice (`docs/README.md:67-71`, "ainda não é compromisso"): não é
  "Documento vivo" nem "Histórico"; é direção não decidida, mas o plano manda corrigir o cabeçalho dela.
- **REGISTRO** — migration travada (lock F46), ata em `DECISOES.md`, relatório de fase, ordem de serviço
  antiga ou análise datada. Não se edita.

---

## 1. Achados — tabela resumida

| # | Arquivo:linha | Padrão encontrado | Classe | Ação (se VIVO/EXPLORAÇÃO) |
|---|---|---|---|---|
| 1 | `docs/ADR-002-papeis-e-permissoes.md:90` | `"sempre com a função embrulhada em (select ...)"` | **VIVO** | Qualificar o "sempre": excluir função com argumento dependente da LINHA (`pode_escrever_filial`), como a própria tabela 3 linhas abaixo (94-99) já mostra desembrulhada 5×. Hoje a linha 90 e a tabela se contradizem dentro do mesmo documento. |
| 2 | `docs/MATRIZ-REGRAS.md:466` (R-ACC-32) | contagem velha içada: `"15 policies de SELECT"` e `"0 de 55 policies"` | **VIVO** | `k_piso_papel` em `supabase/tests/catalogo_policies.sql:150-156` tem **19** entradas hoje (medido), não 15 — 6 tabelas entraram na F56 (`colaboradores`, `tipos_item`, `unidades_apelidos`, os três `import_*`) sem a linha da matriz ser atualizada. O total de policies também subiu (54/55 → 61, fato 2 da ordem). Trocar "15" → "19" e revisar o "0 de 55". |
| 3 | `docs/README.md:51` | `"F0 → F40"` | **VIVO** | A árvore tem ordens até F59 (`docs/prompts/F59-doutrina-do-predicado-ultracode.md`) e a numeração já passou de F40 há muito. Trocar por algo que não envelheça a cada fase (ex.: "uma por fase") ou apontar o índice `prompts/README.md`. |
| 4 | `docs/PLANO-MULTIEMPRESA.md:576` | citação errada: `` `docs/README.md:60-64` `` para o trecho "ainda não foi decidida" | **VIVO** | O trecho citado vive em `docs/README.md:69` (dentro da seção `## Exploração — ainda não é compromisso`, linhas 67-71), não em `:60-64` (que é a tabela de "Planos de área"). Corrigir a referência para `:67-71` (ou `:69`). |
| 5 | `docs/PLANO-PRODUTO-MULTIEMPRESA.md:71` | `e_membro(empresa_id)` proposto como o predicado de tenant | **EXPLORAÇÃO** (`docs/README.md:71`) | Confirmado (fato 10). Cabeçalho (linhas 1-7) ainda diz `"v0.1 · 14/08/2026 … proposta para validação"` e `"repositório novo transplantando o núcleo"` — contradito pela decisão 1 do §1 do `PLANO-MULTIEMPRESA.md` (migração in-place, mesmo repositório). 187 linhas no total. |
| 6 | `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md:191-197` | forma ✗ (`e_membro`) vs ✓ (`= any(array(select …))`) | **EXPLORAÇÃO** | Texto **correto** — é a fonte que `PLANO-MULTIEMPRESA.md:576` manda copiar. Ver bloco de código exato abaixo. |
| 7 | `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md:204-205` | contagem velha içada: `"hoje só 5 das 71 policies do sistema atual usam o padrão içado"` | **EXPLORAÇÃO** | Falso hoje (fato 4 da ordem): **todas** as 62 chamadas de função sem argumento das 61 policies vivas estão dentro de `(select …)` — zero soltas. A frase precisa de nota com a data e o número medido hoje (a fotografia de 31/08 não se apaga, mas não pode ficar sem contraponto). |
| 8 | `supabase/migrations/0063_papeis_policies.sql:46-57` | doutrina correta: função sem argumento → `(select …)` vira InitPlan; `pode_escrever_filial(filial_id)` **não** | **REGISTRO** (migration travada) | Fonte-verdade da doutrina; não editar. Contradiz diretamente o achado #9. |
| 9 | `supabase/migrations/0129_leitura_termo_e_revoke_invoker.sql:66-69` | `"(select …) envolvendo a chamada é o padrão InitPlan das 0059/0065/0070"` aplicado a `pode_ler_arquivo_termo(name)` | **REGISTRO** (migration travada, F46) | **Falso içamento** — confirmado (fato 6). `pode_ler_arquivo_termo(p_nome text)` recebe `name` da LINHA (mesmo hoje ignorando o parâmetro no corpo); pelo próprio critério da `0063:51-52`, isso é subconsulta correlacionada avaliada por linha (SubPlan), não InitPlan. Não editar o arquivo — a correção mora na doutrina nova (Frente B da F59) e num apontamento em `DECISOES.md`. |
| 10 | `supabase/migrations/0128_adota_bkp_relatorios_f6a.sql:99` | `"(select …) … é o padrão InitPlan que a 0059/0065 já usam"` aplicado a `e_dev()` | **REGISTRO** | Correto — `e_dev()` não tem argumento. Não é violação; citado aqui só para não faltar na varredura. |
| 11 | `docs/ESPECIFICACAO.md:1-5` | cabeçalho: `"v1.1 · 09/07/2026 … Status: decisões confirmadas … nenhum código gerado ainda"` | **VIVO** (autoridade nº 1, `CLAUDE.md:7`) | Medido: **482 linhas** (não 478), *"filial"* **120** ocorrências, *"filiais"* **54** ocorrências, como palavra. O cabeçalho contradiz o estado atual do projeto (F59, milhares de linhas de código) — é o mesmo apontamento do fato 13 da ordem. |
| 12 | `docs/ARQUITETURA.md:96` (§9) | `"job banco (sobe Postgres, aplica 0001→última migration…)"` | **VIVO** | Nome de job desatualizado — o job de hoje é `banco-sem-docker` (fato 14/18; `RUNBOOK-BANCO.md:447` confirma "O CI tem **um** job de banco: `banco-sem-docker`"). Mesma linha cita `0001→0124`; a última migration hoje é `0140` (fato 1). |
| 13 | `docs/ARQUITETURA.md` §10 (99-131) | — | **VIVO** | Nenhum achado — não fala de predicado/RLS, é a tabela "quero mudar X → mexo em Y". Limpo quanto à doutrina. |
| 14 | `docs/RUNBOOK-BANCO.md:256-262` | `"só o job banco do CI… os roda (sobe um Postgres, aplica 0001→última migration e roda cada *.sql com psql)"` | **VIVO** | Mesma staleness do #12, e **inconsistente com o próprio documento**: a seção "O banco do CI na mesa" (linha 445-455, mais nova) já usa o nome certo, `banco-sem-docker`, e explica que o antigo saiu. A seção de 256-262 é da época da F17 e não foi atualizada quando o job mudou de nome/mecanismo. |

---

## 2. Blocos de texto exatos pedidos pela ordem

### `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md:191-197` (cópia literal)

```
191: ```sql
192: -- ✗ como o plano especifica — avaliada POR LINHA, não içável
193: using ( e_membro(empresa_id) )
194:
195: -- ✓ InitPlan (1× por statement) + índice utilizável
196: using ( empresa_id = any (array(select public.empresas_do_membro())) )
197: ```
```

### `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md:204-205`

```
204: **melhor que a WAP nesse ponto**, não igual: hoje só 5 das 71 policies do sistema atual usam
205: o padrão içado.
```

### Cabeçalho de `docs/SYSTEM-DESIGN-ACERVO-2026-08-31.md` (linhas 1-9)

```
# Projeto de sistema — Acervo (produto multiempresa), 31/08/2026

Revisão arquitetural do **produto multiempresa** planejado em
[`PLANO-PRODUTO-MULTIEMPRESA.md`](PLANO-PRODUTO-MULTIEMPRESA.md) (v0.1, 14/08/2026), pelo
método da skill `system-design`: requisitos → desenho de alto nível → aprofundamento →
escala e confiabilidade → trade-offs → o que revisitar. A ordem
[`prompt-produto-f0-fundacao.md`](prompt-produto-f0-fundacao.md) já está escrita e pronta
para rodar; este documento é o crivo **antes** de a primeira linha existir — que é onde uma
revisão de arquitetura ainda é barata.
```

Não há um bloco "Status:" separado dentro do documento (37 seções, `## 1` a `## 8`, sem `§9`/`§10` —
essas numerações existem só em `PLANO-PRODUTO-MULTIEMPRESA.md`/`ARQUITETURA.md`, não aqui). O
`docs/README.md:71` é quem classifica este arquivo, junto com `PLANO-PRODUTO-MULTIEMPRESA.md`, na
categoria "Exploração — ainda não é compromisso".

### Cabeçalho de `docs/PLANO-PRODUTO-MULTIEMPRESA.md` (linhas 1-7)

```
# Plano — Produto de Controle de Ativos de TI Multiempresa

**v0.1 · 14/08/2026 · Johnny + Claude · proposta para validação**

Este documento planeja o **sucessor genérico** do Estoque TI WAP: um produto de controle de ativos de TI que
atende **várias empresas** no mesmo sistema... [O par ESPECIFICACAO.md + PLANEJAMENTO.md, aqui num documento
único de partida. Validado o plano, ele se desdobra em spec própria e ordens de serviço (§11).]

**Direcionamento definido em 14/08/2026 (respostas do Johnny):** operação **gerida por você evoluindo para
SaaS** · **repositório novo transplantando o núcleo** da WAP · domínio único agora, subdomínio por empresa
depois · customização de MVP = identidade e vocabulários...
```

`docs/PLANO-PRODUTO-MULTIEMPRESA.md:71` (linha exata, confirmada):

> "RLS por membership, não por claim no JWT: a policy confere `empresa_id` contra a tabela de membros **no
> request** (`e_membro(empresa_id)`), como a WAP faz com `papel_atual()`."

### `docs/README.md:51`

```
51: | [`prompts/`](prompts/) | As ordens de serviço, uma por fase (F0 → F40) |
```

### `docs/README.md:60-75`

```
60: | [`PLANO-RELATORIOS-V2.md`](PLANO-RELATORIOS-V2.md) | Relatórios ao vivo e snapshots |
61: | [`PLANO-AJUDA.md`](PLANO-AJUDA.md) | A documentação do operador em `/ajuda` (F20) |
62: | [`PLANO-DESIGN-SYSTEM.md`](PLANO-DESIGN-SYSTEM.md) | O sistema de design e o piloto em `/ativos` (F40) |
63: | [`PLANO-CORRECAO-TRUNCAMENTO-1000.md`](PLANO-CORRECAO-TRUNCAMENTO-1000.md) | O corte de 1.000 linhas nas leituras de estoque |
64: | [`PLANO-ITENS.md`](PLANO-ITENS.md) | O item passa a falar a língua do ativo — vocabulário único, cadastro passivo e o fim do bloqueio (F41/F42) |
65: | [`INVENTARIO-LEITURAS.md`](INVENTARIO-LEITURAS.md) | O orçamento das F63–F68 (F57)... |
66: (linha em branco)
67: ## Exploração — ainda não é compromisso
68: (linha em branco)
69: Trabalho de projeto de sistema para uma direção que **ainda não foi decidida**: transformar o sistema num
    produto multiempresa e espelhar a planilha do SharePoint. Nada disso está construído.
70: (linha em branco)
71: `SYSTEM-DESIGN-ACERVO-2026-08-31.md` · `PLANO-PRODUTO-MULTIEMPRESA.md` · `PLANO-ESPELHO-SHAREPOINT.md` ·
    `ROTEIRO-ESPELHO-ENTRA.md` · `prompt-produto-f0-fundacao.md`
72: (linha em branco)
73: ## Histórico — leia para arqueologia, não para trabalhar
74: (linha em branco)
75: Estes arquivos descrevem o sistema **na data em que foram escritos**. Não os atualize...
```

Confirma o fato 12 da ordem: *"ainda não foi decidida"* está na **linha 69**, dentro de `:67-71`
("Exploração — ainda não é compromisso"), **não** em `:60-64` (que é só a tabela de Planos de área,
sem menção a "decidida"). A citação `docs/README.md:60-64` dentro de `PLANO-MULTIEMPRESA.md:576` está
errada — ver achado #4.

### `docs/ESPECIFICACAO.md` (primeiras 15 linhas — cabeçalho completo)

```
 1: # Sistema de Controle de Estoque TI — WAP
 2:
 3: **Especificação funcional e técnica — v1.1**
 4: Data: 09/07/2026 · Autor: Victor Matusita (Johnny) + Claude
 5: Status: decisões confirmadas · plano de execução em [`PLANEJAMENTO.md`](./PLANEJAMENTO.md) · perguntas em
    aberto na seção 13 · **nenhum código gerado ainda**
 6:
 7: ---
 8:
 9: ## 1. Contexto e problema
10:
11: Hoje o controle de ativos de TI da WAP (notebooks, celulares, monitores, desktops e tablets de todas as
    filiais) é feito por uma pessoa na Matriz usando três planilhas que não conversam entre si...
12:
13: | Planilha | O que guarda | Volume atual |
14: |---|---|---|
15: | **Matriz (inventário)** | Estado de cada ativo: patrimônio, modelo, specs, status, com quem está | 1.179 ativos |
```

Medições: **482 linhas** totais (`wc -l`); *"filial"* como palavra: **120** ocorrências; *"filiais"* como
palavra: **54** ocorrências (`grep -oi '\bfilial\b'` / `'\bfiliais\b'`, contando ocorrências, não linhas).

### `docs/ADR-002-papeis-e-permissoes.md:80-100`

```
 80: > `admin apaga` seguem `e_admin()` — criar, sim; editar e desativar, não, exatamente como em
 81: > colaborador. E `tipos_item` (`0114`) **continua** `e_admin()` no INSERT, de propósito: tipo é
 82: > VOCABULÁRIO administrado, item é CADASTRO OPERACIONAL que nasce no fluxo. As três camadas seguem
 83: > alinhadas — policy `pode_escrever()`, guarda `exigirPapel(…, 'operador')` em `criarItemInline`, e
 84: > a tela oferecendo "Cadastrar" a quem escreve.
 85: >
 86: > O par de cenários que trava isso está em `supabase/tests/papeis_rls.sql`: **3c** (o operador CRIA)
 87: > e **3c-quater** (o operador NÃO edita — 0 linhas, no molde do 3c-ter)...
 88: > véspera, e virou porque a REGRA virou; ata em `docs/DECISOES.md`.
 89:
 90: As policies novas substituem as `using (true)` — sempre com a função embrulhada em `(select ...)`, o
     padrão initplan que a `0059` instituiu (avaliada uma vez por statement; custo ~zero na escala do banco,
     ~3 mil linhas na maior tabela). Mapa por tabela — os **verbos não mudam**... muda só o *quem*:
 91:
 92: | Tabela | Leitura | Escrita |
 93: |---|---|---|
 94: | `ativos` | logado ativo | insert/update: `pode_escrever_filial(filial_id)` |
 95: | `movimentacoes` | logado ativo | ⚠ insert: `pode_escrever_filial(filial_id)` **E**
     `pode_escrever_filial(snapshot_anterior->>'filial_id')` — ver §4.4 |
 96: | `lancamentos_item` | logado ativo | ⚠ insert: `pode_escrever_filial(filial_id)` **E**
     `estorno_item_coerente(estorna_id, filial_id, item_id)` — ver §4.4 |
 97: | `pendencias_item` | logado ativo | update (resolver): `pode_escrever_filial(filial_id)` |
 98: | `anotacoes`, `relatorios_gerados` | logado ativo | papel ∈ {admin, operador} → `pode_escrever()` |
 99: | `termos_gerados` | logado ativo | ⚠ `pode_escrever_termo(ativo_ids)` **E**
     `termo_ancora_coerente(...)` + `arquivo_path = id‖'.docx'` — ver §4.4 |
100: | `storage.objects` bucket `termos` | logado ativo | ⚠ cargo ∈ {admin, operador} → `pode_escrever()`
     **E** `pode_escrever_arquivo_termo(name)` (`0069`) |
```

A linha 90 diz "sempre" e a própria tabela, 4 a 10 linhas abaixo, lista `pode_escrever_filial(filial_id)`
**sem** o embrulho `(select ...)` cinco vezes (94/95×2/96/97) — a contradição do achado #1. Nenhuma linha
de 80-100 corrige isso; a única correção que ADR-002 tem para esta área é a de §4.4 (linha ~133), e é sobre
um problema DIFERENTE (gatear a coluna errada — "deputado confuso" —, não o embrulho InitPlan × SubPlan).

### `docs/ARQUITETURA.md` §9 (linhas 91-98) e §10 (linhas 99-131)

§9 começa em `91` (`## 9. Banco, migrations e CI`) e termina em `98`. Contém a linha 96 com o achado #12.
§10 começa em `99` (`## 10. "Quero mudar X → mexo em Y"`) e vai até `131` (é uma tabela "quero mudar X →
mexo em Y" com ~30 linhas) — sem nenhuma menção a policy/predicado/InitPlan; limpo quanto à doutrina.

### `docs/RUNBOOK-BANCO.md` — seção dos roteiros

`## Roteiros de teste SQL — rode TODOS ao mexer em função/trigger (regra nova, F17)` começa na linha `256`
e vai até `262` (a seção seguinte, `## Conferir o estado do banco`, começa em `264`). Contém o achado #14.
Por contraste, `### O banco do CI na mesa (sem o Docker do Supabase)` (linha `445`) e a frase em `447`
("O CI tem **um** job de banco: **`banco-sem-docker`**") são a versão atual e correta do mesmo fato.

---

## 3. Números medidos (resumo)

- Arquivos varridos com match de algum padrão da doutrina (`e_membro(`, `embrulhada`, `InitPlan`/`initplan`,
  `pode_escrever_filial`, contagem antiga de policies, `= any (array (select`): **> 60 arquivos** em
  `docs/**` + **12 migrations** (`0059`, `0062`, `0063`, `0066`, `0067`, `0068`, `0069`, `0070`, `0072`,
  `0103`, `0107`, `0128`, `0129` — a doutrina InitPlan aparece nessas 12) + `0060`/`0139`/`supabase/tests/*`
  para o `= any (array ...)` de outra natureza (enums/oids, não é o padrão-alvo).
- **Achados classificados VIVO com ação de uma linha:** 4 (#1 ADR-002:90, #2 MATRIZ-REGRAS:466, #3
  README:51, #4 PLANO-MULTIEMPRESA:576) + 2 achados adjacentes de nome de job de CI (#12 ARQUITETURA:96,
  #14 RUNBOOK-BANCO:256-262) + 1 achado de cabeçalho desatualizado (#11 ESPECIFICACAO:1-5) = **7 linhas**
  em documentos vivos pedindo correção.
- **Achados classificados EXPLORAÇÃO** (não editáveis por serem direção não decidida, mas com correção de
  cabeçalho já mandada pelo plano): 2 (#5 PLANO-PRODUTO-MULTIEMPRESA:71, #7 SYSTEM-DESIGN-ACERVO:204-205).
  Mais 1 confirmação de forma CORRETA já escrita (#6 SYSTEM-DESIGN-ACERVO:191-197).
- **Achados classificados REGISTRO** (migrations travadas, não editáveis): 3 (#8 `0063:46-57` — doutrina
  correta, fonte-verdade; #9 `0129:66-69` — o falso içamento confirmado; #10 `0128:99` — InitPlan correto).
- **`k_piso_papel` em `supabase/tests/catalogo_policies.sql:150-156`:** **19** nomes (medido por contagem
  direta dos elementos do array), não 15 — confirma a divergência do achado #2 e o fato 9 da ordem.
- **`docs/ESPECIFICACAO.md`:** 482 linhas; "filial" 120×; "filiais" 54×, como palavra.
- **`docs/PLANO-PRODUTO-MULTIEMPRESA.md`:** 187 linhas.
- **`CLAUDE.md`/`AGENTS.md`:** nenhum achado da doutrina (`AGENTS.md` é boilerplate do Next.js, sem relação;
  `CLAUDE.md` só cita `pode_escrever_filial()` em contexto de inventário de funções — nenhuma frase
  incorreta sobre embrulho/InitPlan encontrada — "achado em CLAUDE.md só se aponta": nada a apontar).
- **Nenhuma divergência dos 21 fatos do cabeçalho da ordem** foi encontrada nesta frente — os achados aqui
  CONFIRMAM os fatos 6, 9, 10, 11, 12 e 13 (e acrescentam achados adjacentes que os fatos não cobriram:
  #2 a metade do R-ACC-32 sobre o total "55", #3, #4, #12 e #14 — o nome do job de CI desatualizado em dois
  documentos vivos).

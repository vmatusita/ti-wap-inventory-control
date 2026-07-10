# OS-F1 — Banco definitivo + dados fictícios (seed)

Executor desta ordem no repositório `ti-wap-inventory-control`. Siga na ordem. Ambiguidade ou pré-requisito quebrado → **PARE e pergunte ao Johnny**.

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md`, `supabase/schema.sql` (inteiro — é a matéria-prima desta fase), `docs/ESPECIFICACAO.md` §4 (máquina de estados), §5 (modelo + vocabulários) e §10.1 (seed), `docs/PLANEJAMENTO.md` §3.
2. Pré-requisitos (se falhar, PARE): F0 mergeada na `main` (login funciona); `supabase link` configurado para o projeto dev; migration `0001_profiles.sql` aplicada; existe ao menos 1 operador logável (`@wap.ind.br`) no projeto dev.

## 1. Objetivo

O banco de desenvolvimento com o schema completo em migrations versionadas + um comando que o povoa com ~1.200 ativos e ~700 movimentações **100% fictícios** e coerentes (o trigger da máquina de estados aceita a sequência), e outro que o zera. Tipos TS regenerados. Nenhuma tela nova.

## 2. Escopo proibido

- NÃO criar telas/rotas/componentes — F1 é só banco + scripts.
- NÃO tocar no projeto Supabase de produção (se existir) — tudo aqui é no dev.
- NÃO usar nomes/patrimônios reais das planilhas da WAP no seed (regra 2 do CLAUDE.md). Os 5 patrimônios duplicados de exemplo do §10 da spec NÃO podem aparecer.
- NÃO "melhorar" o modelo por conta própria: divergência de opinião com o schema.sql → pergunte.

## 3. Tarefas

### 3.1 Migrations a partir do schema.sql

1. Converta `supabase/schema.sql` em migrations separadas e numeradas em `supabase/migrations/` (a 0001 de profiles já existe — não a recrie; remova do script o que ela já cobre):
   - `0002_tipos.sql` — enums (`categoria_ativo`, `status_ativo`, `tipo_movimentacao`, `termo_status`).
   - `0003_tabelas.sql` — `filiais`, `motivos`, `ativos`, `movimentacoes`, `senhas_acesso` + TODOS os índices (inclusive o único composto `(patrimonio, coalesce(service_tag,''))` — regra do patrimônio duplicado).
   - `0004_maquina_estados.sql` — `status_apos_movimentacao()` + `aplicar_movimentacao()` + trigger.
   - `0005_rls.sql` — enable RLS + policies de operador em nível único (`authenticated` lê e escreve; `anon` nada; **não existe is_admin/roles** — ver schema.sql; as policies de `profiles` já existem na 0001, não duplique).
   - `0006_views.sql` — `v_estoque_atual`, `v_movimentacoes_mes`, `v_pendencias`.
   - `0007_seeds_fixos.sql` — inserts de `filiais` e `motivos` do schema.sql (dados de referência, não fictícios).
2. Antes de aplicar, faça análise crítica do SQL: se encontrar erro que impeça a execução, corrija na migration e **anote a diferença no resumo final** (o schema.sql é rascunho; as migrations viram a verdade).
3. `supabase db push` no projeto dev. Zero erros. Em seguida `npm run db:types`.
4. Adicione ao topo do `supabase/schema.sql` o aviso: "HISTÓRICO — substituído pelas migrations em supabase/migrations a partir da F1".

### 3.2 Teste da máquina de estados (Vitest não serve aqui — é SQL)

Crie `supabase/tests/maquina_estados.sql` com um roteiro de `insert`s que o Johnny possa rodar no SQL editor do projeto dev, cobrindo e comentando o resultado esperado:
1. compra → saída → devolução → triagem_ok (caminho feliz; conferir `ativos.status` após cada passo);
2. saída de ativo `em_uso` → deve falhar com a exception do trigger;
3. estorno da última movimentação → estado completo restaurado (status, colaborador, setor, filial);
4. estorno de movimentação antiga (não-última) → deve falhar;
5. devolução com `itens_faltantes` → `ativos.pendencia` preenchida; triagem_ok → limpa;
6. transferência → muda `filial_id` e aparece nas duas filiais em `v_movimentacoes_mes`.

### 3.3 Seed fictício (`scripts/seed.ts`)

1. Dev-deps: `@faker-js/faker`, `seedrandom`, `tsx`. Scripts no package.json: `db:seed` → `tsx scripts/seed.ts`, `db:reset` → `tsx scripts/reset.ts`.
2. **Guardas anti-acidente (obrigatórias, primeiras linhas):** o script usa `SUPABASE_SERVICE_ROLE_KEY` + URL do `.env.local`; recuse a execução (mensagem clara) se a env `SEED_CONFIRM` ≠ `sim` ou se a URL do projeto não for a do projeto dev (compare com env `SEED_PROJECT_REF`).
3. Determinístico: `seedrandom('wap-estoque-v1')` para tudo que for aleatório; rodar duas vezes após reset produz o mesmo resultado.
4. Volumes e proporções (use faker pt_BR para nomes; patrimônios fictícios no formato canônico com prefixos `WAP`/`PRO`/`LEA`/`TEC` e faixa numérica 8000–9999 — inexistente nas planilhas reais):
   - 5 filiais (as da migration 0007). Distribuição de ativos: Matriz 72%, Linhares 12%, CD Afonso Pena 8%, Serra Park 5%, Eusébio 3%.
   - **1.200 ativos**: notebook 42%, celular 28%, monitor 25%, desktop 4%, tablet 1%. Modelos fictícios plausíveis por categoria (ex.: "Dell Latitude 3450", "Samsung Galaxy A16" podem ser usados — modelo não é dado pessoal). ~85% com service_tag; inclua **6 pares com patrimônio repetido e service tags diferentes** (caso raro legítimo) e 25 ativos sem patrimônio→`pendencia`.
   - **~700 movimentações** entre 05/01/2026 e 03/07/2026, por mês (jan…jul): 95, 90, 100, 70, 75, 80, 30 — mistura ~55% saída, ~35% devolução, 5% compra, 3% transferência, 2% empréstimo. Motivos sorteados nas proporções reais (saída: novo_colaborador 55%, troca_upgrade 15%, monitor_adicional 8%…; devolução: desligamento 70%, troca_upgrade 18%…). ~10% das devoluções com `itens_faltantes` sorteados de ['carregador','mochila','mouse','teclado','mousepad'].
   - **Importante:** gere as movimentações respeitando a máquina de estados — mantenha o estado corrente de cada ativo no script e só sorteie movimentação válida para ele (inserção em ordem cronológica; o trigger valida). `criado_por` = id do primeiro profile existente (operador dev).
   - Estado final desejado (aprox.): ~65% em_uso, ~12% em_estoque, ~6% reservado, ~3% em_manutencao, ~2% em_triagem, ~8% defasado, ~4% descartado. Ajuste com movimentações extras no fim se preciso.
5. Ao final o script imprime um sumário: contagens por categoria, por status, por filial, movimentações por mês — e **compara com as metas acima**, marcando ✓/✗ (tolerância ±3 p.p.).
6. `scripts/reset.ts`: apaga (`delete`) `movimentacoes` → `ativos` (nessa ordem), preservando filiais/motivos/profiles. Mesmas guardas do seed.

## 4. Critérios de aceite

- [ ] `supabase db push` numa réplica limpa (ou `supabase db reset` local) aplica as 7 migrations sem erro.
- [ ] Roteiro `maquina_estados.sql` rodado no projeto dev com todos os resultados esperados confirmados (falhas falham, sucessos sucedem).
- [ ] `db:reset` + `db:seed` → sumário final todo ✓; rodar de novo reproduz os mesmos números.
- [ ] `v_estoque_atual` e `v_movimentacoes_mes` retornam os números do sumário.
- [ ] Com a anon key **sem** sessão: select em `ativos` não retorna nada (RLS); com JWT de um operador logado: select e insert funcionam.
- [ ] Nenhum nome/patrimônio real das planilhas no código (busque por 3 nomes reais que o Johnny escolher — zero ocorrências).
- [ ] `npm run lint` e `npm run build` limpos; tipos regenerados commitados.

## 5. Entrega

Branch `f1-banco-seed`. No resumo final: checklist marcado, TODAS as correções feitas sobre o schema.sql listadas (arquivo/linha/motivo), sumário do seed colado, pendências/perguntas.

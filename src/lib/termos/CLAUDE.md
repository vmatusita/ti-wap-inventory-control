# CLAUDE.md — src/lib/termos/

Carrega quando você lê/edita algo aqui. Preenche os templates `.docx` em runtime
(`docxtemplater` + `pizzip`, server-side — ver a lista fechada de dependências na raiz; não
troque de lib sem aprovação do Johnny). Os MODELOS em si (`src/templates/termos/*.docx`) não
se editam por aqui — são editados por script, nunca pelo Word: ver `scripts/termos/CLAUDE.md`.

## `acessorios.ts`

Função PURA: monta a linha de periféricos do termo — agrupa por tipo, soma quantidade, corta
no teto do campo e conta o que descartou por causa do corte (F39 §B). Não lê o banco; recebe os
lançamentos já resolvidos e devolve a string pronta para o `{outros_componentes}`/
`{#tem_acessorios}` do template. Provada byte a byte contra os 5 modelos renderizados em
`docs/f39-evidencias/` (payload fictício) — se mudar o formato da linha, regenere as evidências
com `scripts/termos/evidencias-acessorios.mjs` antes de considerar a mudança pronta.

## `preparo.ts` / `devolucao.ts` / `nome-arquivo.ts`

Ordenação do lote, mapa motivo→Descrição e nome de arquivo do termo. `preparo.ts` reusa
`checklistPodeLancar` de `src/lib/itens/checklist-lote.ts` (a regra do lote homogêneo) — é por
isso que aquela função mora em `lib/itens`, não em `components/`: um módulo de `lib/` não pode
depender de valor vindo de um módulo `'use client'` (ver `src/lib/itens/CLAUDE.md`).

## `persistir.ts` (F67B) — a LINHA antes do arquivo

`persistirTermo` mora aqui desde a F67B (módulo `server-only`, não `'use server'`: testável sem virar Server Action;
`src/lib/actions/termos.ts` o chama). Desde a contração (`0198`) o bucket `termos` decide pela LINHA de
`termos_gerados` que referencia o `.docx`: só lê quem é membro ativo da empresa dela, só escreve quem pode escrever
aquela linha, e um nome sem linha não é gravável (`coalesce(…, false)`). Daí a ordem, que **não se inverte**: no INSERT
a linha primeiro e o upload (`upsert: false`) depois — upload falhou → a linha sai; no UPDATE (mesmo caminho) o upload
(`upsert: true`) e depois a linha; as variantes antigas do mesmo conjunto saem com o ARQUIVO primeiro (enquanto a linha
existe) e só a linha cujo arquivo saiu de fato. As recusas do Storage chegam pela API (403 / "Object not found"), não por
SQLSTATE: `traduzirErroStorage` (`src/lib/supabase/erros-do-banco.ts`) no ponto de chamada. Prova:
`persistir.test.ts` (a ordem e o rollback com o client simulado) e `supabase/tests/storage_por_empresa.sql` (bloco T).

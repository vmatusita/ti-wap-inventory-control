# CLAUDE.md — scripts/termos/

Carrega quando você lê/edita algo aqui. **Os modelos `.docx` de `src/templates/termos/` se
editam por SCRIPT — nunca abrindo no Word.** Abrir e salvar no Word reescreve o XML interno
(reidenta, funde/separa `<w:r>`, troca fontes embutidas) e quebra tags do docxtemplater de
forma silenciosa — só aparece na hora de gerar um termo de verdade.

**Conferência por padrão; grava só com `--aplicar`.** Todo script aqui roda em modo dry-run se
você não passar a flag — leia o diff antes de aplicar.

- `retaguear-cidade.mjs` (F25) — normaliza um campo específico nos 7 modelos.
- `inserir-acessorios.mjs` (F39 §A) — insere o bloco condicional `{#tem_acessorios}` nos 5
  modelos de responsabilidade; a inserção foi provada BYTE A BYTE contra o resultado esperado
  antes de aceita, não só "abriu no Word e pareceu certo".
- `evidencias-acessorios.mjs` — gera o pacote de `docs/f39-evidencias/` (3 versões × 5 modelos
  + o par ponta a ponta), payload 100% fictício — é o que o Johnny abre para conferência
  visual. Regenere isto sempre que mudar `src/lib/termos/acessorios.ts` (a função que decide o
  que entra na linha de periféricos).

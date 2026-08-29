# Evidências da F39 — a seção de acessórios nos 5 modelos de responsabilidade

Gerado por `scripts/termos/evidencias-acessorios.mjs`.
Baseline: `d661c769cf99b1a59994e3eacab7981356b58a1d` (o `git rev-parse HEAD` medido antes de a fase começar).

Payload **100% fictício**: "Fulano de Tal", `WAP0001234`, "Cidade Fictícia".
Nenhum nome, patrimônio ou filial real aparece nestes arquivos.

## As três pastas

| Pasta | O que é |
|---|---|
| `baseline/` | os 5 modelos **de antes da fase**, renderizados com o payload |
| `novo-sem-acessorios/` | os 5 modelos **novos**, com `tem_acessorios` falso |
| `novo-com-acessorios/` | os 5 modelos **novos**, com a linha `Fone de ouvido, Mouse (2), Teclado, Mochila` |

O par a olhar lado a lado é **`baseline/` × `novo-sem-acessorios/`**: eles têm de ser
o mesmo documento. A conferência visual que só o olho faz é a de
**`novo-com-acessorios/`** — a diagramação da cláusula quando há periférico.

## O critério 2, medido

| Modelo | texto idêntico | `<w:p>` igual | XML idêntico | byte a byte | cláusula sai inteira |
|---|---|---|---|---|---|
| `responsabilidade-notebook.docx` | sim | sim | sim | sim | sim |
| `responsabilidade-desktop.docx` | sim | sim | sim | sim | sim |
| `responsabilidade-monitor-interno.docx` | sim | sim | sim | sim | sim |
| `responsabilidade-monitor-homeoffice.docx` | sim | sim | sim | sim | sim |
| `responsabilidade-celular.docx` | sim | sim | sim | sim | sim |

## PDF

**Não há conversor de PDF nesta máquina** (`soffice`, `libreoffice` e `pandoc` ausentes),
e nada foi instalado para isto (custo R$ 0, stack fechada). A conferência visual é no Word,
abrindo os `.docx` das três pastas acima.

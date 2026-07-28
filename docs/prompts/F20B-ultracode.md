ultracode

# OS-F20 (ultracode) — Nome de arquivo dos termos no padrão oficial + "Tentar novamente" que funciona nos erros de tela

Ordem executável e autocontida (28/07/2026). Duas queixas do Johnny, ambas pequenas e cirúrgicas:

1. **Nome do arquivo baixado dos termos.** Hoje o helper privado `nomeDownload` (final de `src/lib/actions/termos.ts`) monta algo como `Responsabilidade Notebook - Fulano-de-Tal.docx` — sem patrimônio e com o nome do colaborador hifenizado. O padrão oficial do Johnny (o mesmo dos arquivos que ele nomeava à mão) é `<tipo do termo> - <patrimônio(s)> - <nome do colaborador>.docx`, com espaços normais no nome.
2. **"Tentar novamente" dos boundaries de erro não tenta nada.** Quando uma tela falha ao carregar, o botão chama só `reset()`; no App Router isso re-renderiza o segmento **sem re-executar as leituras dos Server Components** que falharam — o operador clica, nada acontece, e só sair-e-voltar ou F5 recupera. Sintoma relatado pelo Johnny em 28/07.

Objetivo em uma linha: **todo download de termo (novo ou já gerado) sai com o nome no padrão oficial, coberto por testes de função pura; e o "Tentar novamente" dos 5 boundaries refaz de verdade as leituras do segmento, conforme o padrão recomendado pela doc oficial do Next 16.**

**Modo autônomo com acesso total (CLAUDE.md).** Você roda de forma autônoma: ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua de decisão: (1) esta ordem; (2) spec / CLAUDE.md / convenções do repositório; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

**Git e produção.** Trabalho direto na `main` (precedente F14–F19), commits pequenos e frequentes em pt-BR conventional (`feat(f20): …`, `fix(f20): …`, `test(f20): …`); **push = deploy automático (Vercel)** — só depois do §V inteiro verde. Esta ordem **não toca o banco**: nenhuma migration, nenhuma escrita via MCP Supabase, nada muda no Storage (o objeto continua `${id}.docx`; muda só o nome de DOWNLOAD). Proibido sempre: force push, `git reset --hard`, `git clean`, editar migration aplicada, deletar/enfraquecer teste para passar. Se o classificador de segurança barrar o push: não insista — deixe tudo commitado e a instrução de 1 comando no relatório.

**Dados.** Nenhum nome de colaborador real nem patrimônio real em teste, fixture, comentário, exemplo ou relatório (CLAUDE.md, regra 2) — exemplos sempre fictícios (`WAP0001234`, `LEA0000001`, "Fulano de Tal"). Os arquivos reais que motivaram o padrão ficam FORA do repositório; esta ordem já traz equivalentes fictícios.

## Como usar

Cole este arquivo inteiro numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre (a lista de fases dele parou na F7 — o estado real está em `README.md` e `docs/prompts/README.md`).

---

## §0 — Mapa do terreno (levantado em 28/07/2026 — confirme no gate)

1. **Cadeia do nome do termo:** `nomeDownload(tipo, colaborador)` é helper privado de `src/lib/actions/termos.ts`, usado em DOIS pontos: `gerarTermo` (devolve `nomeArquivo` ao dialog) e `urlTermo` (idem à ficha). Os clientes (`src/components/movimentacoes/gerar-termo-dialog.tsx` e `src/components/ativos/termos-da-ficha.tsx`) só repassam o valor para `a.download` — não devem precisar mudar. `urlTermo` hoje seleciona apenas `arquivo_path, tipo, colaborador` de `termos_gerados`; os patrimônios estão na coluna `dados` (jsonb com os `CamposTermo` salvos) — inclua-a no select.
2. **De onde vem o patrimônio:** responsabilidade → `campos.patrimonio` (um ativo); devolução → `campos.patrimonios`, string `"A, B, C"` já na ordem do documento (`ordenarEquipamentos`: notebook → monitor → celular → demais; `src/lib/termos/devolucao.ts`). Ambos são TEXTO EDITÁVEL no dialog (spec §3.9) e podem conter `"sem patrimônio"` (`PATRIMONIO_AUSENTE_TERMO`, F7E) ou qualquer coisa que o operador digitou.
3. **`TERMO_ROTULO` (`src/lib/termos/tipos.ts`) é rótulo de UI** (ficha, seletor de variante) — NÃO o altere; o nome de arquivo ganha um mapa próprio.
4. **Convenções que moldam a implementação:** Vitest só para funções puras; arquivos `'use server'` só exportam async (guarda em `src/lib/use-server-exports.test.ts`) → a lógica do nome vira função pura em `src/lib/termos/` com teste, importada pela action. Identificadores de domínio em português sem acento.
5. **Boundaries de erro (5):** `src/app/(app)/error.tsx` (raiz do grupo), `src/app/(app)/ativos/error.tsx`, `src/app/(app)/itens/error.tsx`, `src/app/(app)/movimentacoes/error.tsx`, `src/app/(app)/pendencias/error.tsx`. Todos chamam `reset()` puro. Confirme por grep que não existe outro `error.tsx` no repositório. Os comentários desses arquivos documentam a semântica ANTIGA do reset ("re-renderiza o mesmo segmento") — ficarão defasados; atualize-os.
6. **Correção esperada (confirme antes na doc):** o padrão recomendado pela doc oficial do Next para boundary cujo erro veio de leitura de Server Component é refazer a navegação junto com o reset — `startTransition(() => { router.refresh(); reset() })` com `useRouter` de `next/navigation`. **Regra 6 do CLAUDE.md: confira a doc vigente do Next 16 (MCP Context7 ou doc online) antes de codar** — se a doc atual recomendar outra forma, siga a doc e registre em `docs/DECISOES.md`.
7. **Retroativo de graça:** o nome é calculado NA HORA do download — termos já gerados passam a baixar com o nome novo sem tocar banco/Storage.

## §1 — Orquestração

### 1.0 GATE de entrada

(a) Working tree limpo na `main`, sincronizado com `origin` (este arquivo, untracked, não conta); sujo → PARE e reporte. (b) Baseline verde HOJE: `npm run lint && npm run test && npm run build` — registre a contagem de testes (referência: 1.018 na entrada da F19; só pode subir); vermelho → PARE e reporte. (c) Confirme o §0 lendo os arquivos citados; divergência relevante (assinatura diferente, arquivo movido) → ajuste o plano e registre.

### 1.1 Forma do trabalho

Exploração em subagentes paralelos (frente A: cadeia do termo; frente B: boundaries + doc oficial do Next via Context7), cada um devolvendo só resumo → `PLAN.md` autossuficiente (arquivos, assinaturas, casos de teste, critérios) → implementação em incrementos testáveis (as frentes tocam arquivos disjuntos; se paralelizar edição, worktrees isolados — precedente F10; sequencial também serve, a ordem é pequena) → revisão adversarial em contexto fresco (§V) → encerramento (§R).

### 1.2 Regras globais

1. **Escopo fechado.** Fora: templates `.docx`, Storage/`arquivo_path`, banco (zero migration), schema de `termos_gerados`, `TERMO_ROTULO` e a UI da ficha/dialog, `src/components/ui/**`, qualquer melhoria não pedida (vai para o backlog do relatório).
2. Zero dependência nova (`package.json` byte a byte igual), custo R$ 0.
3. Contagem de testes só sobe; teste existente só muda se a mudança o quebrar legitimamente — explicado em comentário e no relatório.

## §A — Frente A: nome de arquivo dos termos no padrão oficial

**Padrão:** `<prefixo do tipo> - <patrimônio(s)> - <colaborador>.docx`, três segmentos unidos por ` - `.

Mapa tipo → prefixo (novo `const` em `src/lib/termos/`, ao lado dos mapas existentes; strings EXATAS, inclusive maiúsculas/minúsculas — "monitor" minúsculo é o padrão do Johnny):

| tipo | prefixo |
|---|---|
| `devolucao_desligamento` | `Termo de devolução - DESLIGAMENTO` |
| `devolucao_equipamento` | `Termo de devolução equipamentos` |
| `responsabilidade_notebook` | `Termo de Responsabilidade Notebook` |
| `responsabilidade_desktop` | `Termo de Responsabilidade Desktop` |
| `responsabilidade_celular` | `Termo de Responsabilidade Celular` |
| `responsabilidade_monitor_interno` | `Termo de Responsabilidade monitor` |
| `responsabilidade_monitor_homeoffice` | `Termo de Responsabilidade monitor` |

**Segmento patrimônios:** responsabilidade → `campos.patrimonio`; devolução → `campos.patrimonios` separado por vírgula, trim em cada parte, PRESERVANDO a ordem (é a ordem do documento); partes vazias e `"sem patrimônio"` ficam de fora do nome; múltiplos unidos por ` - `. Sem nenhum patrimônio útil → o segmento inteiro é omitido (fica `prefixo - colaborador.docx`). Campo editado sem vírgula → trate o texto inteiro como um único patrimônio (sanitizado).

**Segmento colaborador:** `campos.colaborador` como está salvo — espaços e acentos PRESERVADOS (chega de hífens); trim; vazio → segmento omitido.

**Sanitização (por segmento):** remova caracteres proibidos em nome de arquivo no Windows (`\ / : * ? " < > |`) e caracteres de controle; colapse espaços repetidos. **Teto:** nome completo (com `.docx`) ≤ 150 caracteres — se estourar, corte a lista de patrimônios em separador inteiro (nunca no meio de um código) até caber; registre a regra escolhida em `docs/DECISOES.md`.

**Exemplos (fictícios — o que vale é o formato, não os dados):**

- `Termo de devolução - DESLIGAMENTO - LEA0000001 - WAP0001234 - Fulano de Tal.docx`
- `Termo de devolução equipamentos - WAP0001234 - Fulano de Tal.docx`
- `Termo de Responsabilidade Notebook - LEA0000002 - Beltrana de Souza Prado.docx`
- `Termo de Responsabilidade monitor - WAP0005678 - Sicrano Boaventura.docx`

**Implementação:** função pura `nomeArquivoTermo(tipo: TermoTipo, campos: CamposTermo): string` em `src/lib/termos/nome-arquivo.ts` + `nome-arquivo.test.ts` (Vitest). Casos mínimos: um por tipo (as duas variantes de monitor caem no mesmo prefixo); devolução multi-patrimônio preservando ordem; `"sem patrimônio"` e partes vazias descartadas; nenhum patrimônio útil; colaborador vazio; colaborador com acento (preservado) e com caractere proibido (removido); `patrimonios` editado sem vírgula; teto de 150. Em `src/lib/actions/termos.ts`, `gerarTermo` e `urlTermo` passam a usar a função (`urlTermo` inclui `dados` no select; linha antiga com `dados` incompleto → a função degrada omitindo segmentos) e a `nomeDownload` antiga é removida.

**Aceitação:**

- Download do dialog (termo recém-gerado) e da ficha (termo antigo) saem no padrão — inclusive termos gerados antes desta ordem.
- `TERMO_ROTULO` e a UI intocados; Storage continua `${id}.docx`.
- Testes novos cobrindo os casos acima; suíte inteira verde.

## §B — Frente B: "Tentar novamente" que funciona

**Sintoma (Johnny, 28/07):** tela falha ao carregar → clicar "Tentar novamente" não faz nada; só sair-e-voltar ou F5 recupera. **Causa:** os 5 boundaries chamam só `reset()`, que re-renderiza o segmento sem re-executar as leituras de Server Component que falharam.

**Correção:** aplique o padrão vigente da doc oficial do Next 16 (confirme via Context7 ANTES de codar — regra 6; esperado: `useRouter().refresh()` + `reset()` dentro de `startTransition`). Extraia a mecânica para um client component compartilhado (ex.: `src/components/layout/tentar-novamente.tsx`) usado pelos 5 boundaries, preservando de cada um: título, mensagem, ícone e CTAs extras ("Ir para o início" no da raiz, "Limpar filtros" no de pendências). Durante a transição o botão fica desabilitado com indicador de progresso (padrão `Loader2` já usado no app) — cliques repetidos não empilham. Atualize os comentários dos boundaries (documentam a semântica antiga do `reset()`; a ressalva deles — erro causado por searchParams refalha para sempre — continua verdadeira e continua atendida pelos CTAs de saída; mantenha-a registrada).

**Aceitação:**

- Os 5 boundaries usam o mecanismo novo; nenhum outro comportamento/texto muda; grep confirma que nenhum `error.tsx` ficou de fora.
- Clicar com a causa resolvida recarrega os dados do segmento SEM F5; com a causa persistindo, o boundary re-renderiza (sem tela branca, sem loop).
- Conformidade com a doc oficial vigente do Next 16, citada no relatório (link/trecho).

## §V — Verificação — rode de verdade

- A cada incremento: `npm run lint && npm run test && npm run build` — leia as falhas, corrija a CAUSA RAIZ e repita até passar. Nunca suprima erro nem delete/enfraqueça teste para passar.
- **Limite declarado (precedente F12–F19):** o clique real no boundary e o download real no navegador não são automatizáveis aqui (login wall — o agente não digita senha). A prova da Frente B é: conformidade com a doc oficial + revisão adversarial + **roteiro manual de 2 minutos escrito no relatório** (ex.: `npm run dev` → DevTools → Network "Offline" → navegar até /ativos → aparece o boundary → religar a rede → "Tentar novamente" → a lista carrega sem F5; e o equivalente para conferir o nome de um termo antigo e de um novo baixados). O que só o clique humano prova vai para a seção "o que este relatório NÃO prova".
- **Revisão adversarial:** ao final, subagente em contexto FRESCO revisa o diff contra `PLAN.md` e os critérios de aceitação das duas frentes — apenas lacunas de correção ou de requisito, não estilo. Atenção especial: ordem dos patrimônios preservada; nenhum uso remanescente da `nomeDownload` antiga; a transição do retry não engole erros nem quebra os CTAs extras. Corrija e re-revise até limpar.

## §R — Encerramento

1. Docs de status no padrão das fases: `CHANGELOG.md`, `docs/prompts/README.md` (linha da F20), `README.md` se citar contagens/fases; decisões em `docs/DECISOES.md`. Se a ajuda (`src/lib/ajuda/conteudo.ts`) descrever o nome do arquivo do termo, atualize a frase (grep; se não descrever, nada a fazer).
2. `docs/RELATORIO-F20.md` em pt-BR: o que mudou e por quê; decisões; **evidências reais** (saídas completas de lint/test/build coladas, contagem de testes antes → depois); roteiro manual de 2 minutos; pendências e backlog; "o que este relatório NÃO prova".
3. Push (= deploy Vercel) só com o §V inteiro verde; barrado pelo classificador → não insista, deixe a instrução de 1 comando no relatório.
4. Resumo final da sessão em 5 linhas, em pt-BR.

## Idioma

Narrativa, plano, relatório, comentários, UI e commits em pt-BR (convenção do repo). Identificadores: domínio em português sem acento, infra em inglês.

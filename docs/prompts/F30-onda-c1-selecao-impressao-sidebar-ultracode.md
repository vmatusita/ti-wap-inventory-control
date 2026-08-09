ultracode

# Missão

Executar a **primeira metade da Onda C** da análise de UX de 07/08/2026 (`docs/ANALISE-UX-2026-08-07.md`, §10 — "Recursos novos"): **três recursos independentes, sem nenhum toque em banco** — (1) **seleção múltipla na lista de ativos** que alimenta o lote de movimentação, (2) **impressão completa do relatório** (as colunas hoje escondidas passam a sair no papel) e (3) **sidebar colapsável com agrupamento**. Ao final: `npm run lint`, `npm run test` e `npm run build` limpos, documentação atualizada e **main pushada** (a Vercel deploya sozinha). Esta é a ordem de serviço **F30**. (A segunda metade — transferência de itens e modo conferência — é a F31, outra ordem; não a antecipe.)

# Contexto

- Projeto **Estoque TI WAP** (Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · TanStack Table via data-table · Supabase). Regras permanentes de `@CLAUDE.md` valem inteiras: modo autônomo, stack fechada, UI/commits pt-BR, NUNCA dados reais em fixture/teste/screenshot/evidência, custo R$ 0.
- **Fonte:** `@docs/ANALISE-UX-2026-08-07.md` (itens ATV-03 no §4, REL-01 no §6, UXG-13 no §8). Arquivo:linha verificados em 07/08 — as ordens F27–F29 mexeram em arquivos vizinhos; se a linha se moveu, vale a **intenção**, ancore pelo trecho.
- **Sequência ideal:** F27→F28→F29 aplicadas (padrões que esta ordem reusa: banner de origem inválida da F27/MOV-14, aviso de vínculo da F28/MOV-03, alvos de toque da F29). O que não estiver aplicado: não refaça as ordens anteriores — implemente o equivalente local mínimo e registre.
- Comandos: `npm run lint` · `npm run test` (Vitest, funções puras) · `npm run build`. Testes da ajuda (F20) travam frases literais — comportamento documentado que mudar aqui atualiza a página em `src/lib/ajuda/conteudo/` (recurso novo ganha documentação; rota nova sem página de ajuda **quebra o build**, é o guarda da F20).
- Referências do repo: seleção em lote com barra de ação em `fila-pendencias-tabela.tsx` e `mesa-conflitos.tsx`; resolução de ids `buscarAtivosResumoPorIds` (`queries/ativos.ts:592-619`); pré-preenchimento por URL em `movimentacoes/nova/page.tsx` (`?ativo=`/`?duplicar=`, e a `key` derivada dos params — armadilha de soft navigation documentada na F26); corte por página/impressão em `linha-expansivel.tsx` e `globals.css` (print styles, tema claro forçado); persistência de preferência por dispositivo no padrão do tema (localStorage, opt-in).

# Escopo — os 3 recursos

## Recurso 1 · ATV-03 — Seleção múltipla na lista de ativos → movimentar em lote

O fluxo de movimentação é de lote por natureza, mas o lote não nasce de onde o operador filtra: quem separa "notebooks em estoque da Matriz" recomeça a seleção dentro do wizard, um a um. Especificação:

- **Coluna de seleção** na tabela de `/ativos` (TanStack row selection; o data-table já está montado): checkbox por linha com `aria-label` nomeando o patrimônio, checkbox de cabeçalho com estado `indeterminate` na seleção parcial. Visível apenas para quem **escreve** (padrão `podeEscrever` — cargo consulta não vê).
- **Barra de ação** aparece com 1+ selecionados (sticky, no padrão da barra da fila de pendências): "**N selecionados** · Movimentar · Copiar patrimônios · Limpar seleção". A barra permanece visível rolando a página (o aprendizado do MC-01 da análise: feedback onde o clique acontece).
- **Movimentar** navega para `/movimentacoes/nova?ativos=<id1>,<id2>,…`. Na página do wizard: resolver os ids com `buscarAtivosResumoPorIds`, montar o lote inicial como o `?ativo=` faz hoje (interseção da máquina de estados, avisos e rascunho continuam funcionando por cima), **deduplicar** ids, e ids não encontrados/apagados entram no banner âmbar de origem inválida (padrão MOV-14) nomeando quantos ficaram de fora. Não esqueça a `key` derivada dos params na página (armadilha F26).
- **Teto:** `MAX_LOTE_MOVIMENTACAO` (30). Na lista, ao tentar selecionar o 31º: recuse com toast citando o teto (mesma voz do colar-lista). No `?ativos=` com mais de 30 ids: monte 30 e avise no banner quantos sobraram (consistente com o corte do colar-lista).
- **Copiar patrimônios** copia os selecionados (um por linha) com toast de sucesso — e toast de erro no caminho sem clipboard (padrão UXG-08a da F27).
- **Escopo da seleção:** por página. Trocar página, filtro ou busca limpa a seleção — aceite e **registre**; persistir seleção entre páginas é backlog, não tente nesta ordem.
- **Fora deste recurso:** qualquer outra ação em massa (editar, excluir, gerar termo em massa), seleção em outras listas.
- **Ponta a ponta (roteiro manual obrigatório):** filtrar por status+filial → selecionar 5 → Movimentar → wizard com os 5 no passo 1 → registrar de verdade **em ambiente com dados fictícios** → conferir as 5 fichas. Mais: teto (31º recusado), id apagado no `?ativos=`, consulta não vê checkboxes, teclado (Space marca, barra alcançável por Tab).

## Recurso 2 · REL-01 — O relatório impresso volta a ser arquivável

Papel A4 retrato ≈ viewport < `lg`: as colunas Marca/Modelo e Colab./Setor (`hidden lg:table-cell`) e Termo/Obs. (`hidden xl:table-cell`) **não saem na impressão** (`tabela-saidas.tsx:128-135` e irmãs), e a linha expansível que as revelaria é `print:hidden` (`linha-expansivel.tsx:80`). Grep confirma 0 `print:table-cell` no repo. O impresso — substituto do e-mail arquivável — sai sem colaborador, termo e observação. Especificação:

- Em **todas** as tabelas detalhadas do relatório com colunas `hidden <bp>:table-cell` (saídas, entradas, transferências, movimentações de itens — confirme o conjunto por grep), faça as colunas escondidas **saírem no papel**: `print:table-cell` nas células/cabeçalhos + compactação de impressão (`print:text-[11px]`, paddings reduzidos) para caber em A4 retrato. Onde mesmo compactado não couber com legibilidade, a alternativa **por tabela** é imprimir a `LinhaDetalhe` (remover o `print:hidden` daquela tabela e renderizar os pares rótulo:valor no papel) — decida tabela a tabela e **registre a escolha**. A coluna do chevron continua `print:hidden` sempre.
- Vale para o **ao vivo, o snapshot congelado e o visualizador por senha** (mesmos componentes — confirme que nenhum dos três diverge) e não muda **nada** da tela (as classes são só de mídia print). Cabeçalhos repetem em quebra de página (`thead` — o browser cuida se a tabela for semântica; confira).
- A F27 já fez a observação imprimir completa (REL-13a) — **não regrida**; legendas da F17 e linhas estornadas da F16 continuam saindo como hoje.
- **Verificação:** além do grep provando a cobertura (nenhuma `hidden lg/xl:table-cell` de relatório sem contraparte de print), roteiro manual com print preview A4 retrato (Chrome, margens padrão) nas quatro tabelas, no ao vivo e num snapshot. Evidência no relatório é **descritiva**; captura/PDF só de ambiente com dados 100% fictícios — **nunca** anexe impressão com dados de produção.
- **Fora:** paisagem forçada, mudanças de contagem/conteúdo, mexer nas legendas.

## Recurso 3 · UXG-13 — Sidebar colapsável e agrupada

240px fixos sem recolher (`(app)/layout.tsx:122`) custam caro em notebooks 1366×768 nas telas densas; e a lista é plana — "Administração"/"Desenvolvedor" colados em "Relatórios"/"Ajuda" sem separador (`sidebar-nav.tsx:34-65`). Especificação:

- **Toggle de recolher** para modo só-ícones no desktop (≥`md`): botão discreto no pé ou topo da sidebar, `aria-label` e `aria-expanded` corretos, ícone que comunica direção. Recolhida: cada item vira ícone com `Tooltip` no hover/foco (o `TooltipProvider` já está montado no layout); o **selo de pendências continua visível** (badge sobre o ícone). Os itens já têm ícone — se algum não tiver, use lucide-react (já na stack).
- **Preferência persistida** em `localStorage` por dispositivo (mesmo padrão opt-in do tema; padrão = expandida). Sem flash de layout na hidratação — resolva como o tema resolve.
- **Atalho `[`** alterna o colapso, respeitando as guardas de teclado existentes (`editando()`, `modalAberto()` em `atalho-global.tsx`) — e a página de ajuda de atalhos ganha a linha nova (o overlay `?` da F29, se existente, idem).
- **Separadores de grupo** (UXG-13a, mesmo arquivo): um divisor (`border-t` + respiro) antes de "Administração" (quando visível) e antes de "Ajuda" — sem títulos de grupo; o cargo consulta continua vendo lista corrida sem divisor órfão.
- **Mobile não muda** (o sheet do hambúrguer fica como está).
- **Fora:** reordenar itens, esconder itens, redesenhar o header.
- **Ponta a ponta:** recolher → navegar por 4 telas → recarregar (preferência mantida) → expandir; tooltips por teclado; `[` com e sem input focado; selo de pendências visível recolhida; nada de layout shift na carga.

## Housekeeping

- Commite esta ordem (`docs/prompts/F30-onda-c1-selecao-impressao-sidebar-ultracode.md`) e a F31 (`docs/prompts/F31-onda-c2-itens-transferencia-conferencia-ultracode.md`) se estiverem untracked. Sujeira de git alheia: não toque; registre.

## Fora (não toque)

- **Itens da F31** (transferência de itens, modo conferência) e as **sobras miúdas da análise** que não entraram em onda nenhuma (FLX-06, MOV-15, ATV-11, PND-07, REL-11/12, ADM-08/09/10, UXG-09/11/14…) — ficam no backlog; não as "aproveite".
- Dependência nova, jamais; **nenhuma migration** (esta ordem não toca banco — nem leitura nova além das queries existentes); `supabase/` intocado; `supabase db push` proibido.
- Modelo de acesso, RLS, RPCs, máquina de estados, contagens do relatório: leitura apenas. O visualizador por senha **nunca** ganha href para fora de `/relatorios/**`.
- `src/lib/types/database.ts`; `src/components/ui/` fora de motivo documentado.
- Dados reais em fixture/teste/screenshot/evidência: proibição permanente.

# Critérios de aceitação

- Os 3 recursos completos conforme as especificações e **autoverificados** (checklist por recurso com evidência; sub-bullets de spec cobertos um a um). Recurso que se revelar parcialmente existente: complete a lacuna e registre.
- `npm run lint`, `npm run test`, `npm run build` **limpos**, saídas reais no relatório. Lógica extraível tem teste puro (parse/dedupe/teto do `?ativos=`, estado do colapso, escolha por tabela da impressão se virar função); a contagem total de testes **sobe**.
- `package.json` sem dependência nova; diff de `supabase/` **vazio**; nenhum texto novo de UI em inglês; tela do relatório idêntica fora da mídia print; consulta sem checkbox; viewer confinado.
- `CHANGELOG.md` (entrada F30 no topo), `README.md` (status), `docs/DECISOES.md` (atas — no mínimo: escopo por página da seleção, comportamento do teto no `?ativos=`, escolha print-colunas × print-LinhaDetalhe por tabela) e ajuda atualizada (lista de ativos, registrar movimentação, relatório/impressão, mapa/atalhos para o `[` e o colapso).
- Commits pequenos pt-BR (`feat(f30): …`), `git pull --rebase` antes do push, **main pushada** com tudo verde. Push bloqueado pelo ambiente: não insista — commits locais + pendência no relatório.

# Verificação — rode de verdade

Após cada recurso: `npm run lint && npm run test`; leia, corrija a **causa raiz**, repita até passar — sem suprimir erro nem desabilitar/deletar teste (teste da ajuda quebrando = atualizar a documentação). Ao final: `npm run build` + suíte completa, saídas guardadas. Os três roteiros manuais de ponta a ponta descritos nos recursos são **obrigatórios** no relatório (passos e resultado observado; dados fictícios). Depois do push, com credenciais no ambiente, rode o smoke reexecutável do repo (`node scripts/smoke/smoke-prod.mjs`) e cole o resultado; sem credenciais, pendência para o Johnny.

# Autonomia e decisões

Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua: (1) esta ordem; (2) a análise; (3) `CLAUDE.md`/spec e convenções do código; (4) o mais simples e reversível, registrado em `docs/DECISOES.md`. Divergência análise × código: o código vale, adapte a intenção, registre. Mesma falha após ~3 tentativas: mude de abordagem e registre. Bloqueio real: contorne se seguro; senão siga com o resto e registre a pendência.

# Git e segurança

Direto na `main` (modo autônomo do projeto; push autorizado pelo Johnny nesta ordem), commits pequenos e frequentes. **PROIBIDO:** force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit alheio, qualquer operação em banco de produção, commitar `.env*` ou dado real.

# Como trabalhar

Explore com subagentes paralelos e escreva `PLAN.md` autossuficiente por recurso (arquivos e interfaces nomeados, fora-de-escopo declarado, verificação de ponta a ponta no final) antes de editar. Os três recursos são **disjuntos** — três frentes paralelas em worktrees funcionam bem; dentro de cada frente, incrementos pequenos e testáveis, um commit por incremento. Ao final, **revisão adversarial em contexto fresco** contra os `PLAN.md` e os critérios — cada sub-bullet de spec implementado? casos extremos (teto, id apagado, consulta, viewer, print de snapshot) cobertos? nada fora do escopo mudou? — só lacunas de correção ou requisito, não estilo; corrija e re-revise até limpar. Não refatore fora dos pontos tocados.

# Relatório final

`docs/RELATORIO-F30.md` em pt-BR, padrão da casa: o que mudou por recurso; checklist de spec autoverificado com evidências; decisões (→ `DECISOES.md`); saídas reais de lint/test/build (e smoke, se rodou); os três roteiros manuais executados; pendências e backlog novo; seção **"O que este relatório NÃO prova"** (diga explicitamente: impressão conferida em preview, não em papel físico; seleção testada com dados fictícios). Resposta final: resumo de ~8 linhas — o que entrou, decisões-chave, estado do push/deploy, o que o Johnny confere de olho.

# Idioma

Narrativa, plano, relatório, UI e commits em **pt-BR**; identificadores de domínio em português sem acento, utilitários/infra em inglês (convenção do `CLAUDE.md`).

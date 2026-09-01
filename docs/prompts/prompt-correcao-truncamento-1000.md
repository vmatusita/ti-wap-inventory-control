# Correção do truncamento de 1.000 linhas nas leituras do relatório (Δ fantasma de +647 ativos)

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Eliminar o truncamento de 1.000 linhas nas leituras do Supabase que alimentam os relatórios do Estoque TI WAP (causa do Δ fantasma de "+647 ativos" no comparativo), varrer TODO o código atrás de outras leituras com a mesma causa raiz e corrigi-las, e gerar errata (v2) dos snapshots congelados que gravaram números truncados. Entrega avulsa fora de fase: versão patch 1.40.2, conforme a regra 8 do CLAUDE.md.

# Contexto — diagnóstico já confirmado em produção (17/08/2026), parta dele
- O acervo real tem ~1.647 ativos fora de baixa (1.651 no total). A API de dados do Supabase (PostgREST) corta QUALQUER resposta em 1.000 linhas (`max-rows`, teto padrão do plano/config atual).
- Bug principal: `src/lib/queries/relatorios/estoque.ts` → `lerEstadoAtivos`. O fast path (data ≥ hoje) usa `paginarTodos` de `src/lib/queries/relatorios/comum.ts` e conta certo; o caminho as-of chama `client.rpc('rel_estoque_asof', …)` SEM paginação e recebe exatamente 1.000 linhas. A função SQL está CORRETA e devolve tudo — provado em produção: a mesma RPC com `offset=1000` devolve as ~648 linhas restantes (as-of 15/08 = 1.648). O builder de RPC do supabase-js aceita `.range(from, to)`, então `paginarTodos` serve quase como drop-in para a RPC.
- Consequências observadas: (a) no relatório ao vivo com período terminando hoje, `kpis` sai do fast path (real, 1.647) e `kpisAnterior` sai da RPC truncada (1.000) → Δ = +647 fantasma; (b) snapshot congelado do consolidado 03–07/08 (gerado 11/08) gravou kpis.total = 1000 E kpisAnterior.total = 1000 — a semana inteira congelada errada; (c) pontos passados da série "Evolução do estoque" truncados; (d) tudo que deriva do estado as-of de data passada (categoria×status, disponíveis por modelo, reservados, manutenção) está errado quando o escopo passa de 1.000 ativos — vale para o consolidado E para a Matriz sozinha (1.168 ativos).
- O problema existe desde que os imports de go-live (20–31/07) levaram o acervo acima de 1.000.
- Comandos do projeto: `npm run lint` · `npm run build` · `npm run test` (vitest, ~2,5 mil testes verdes hoje). Credenciais de produção em `.env.local` na raiz (não commitado); scripts locais usam a service role, como os de `scripts/` já fazem.
- O CLAUDE.md do repositório governa esta run (você o terá no contexto): modo autônomo, regra 2 (NUNCA dados reais em seed/teste/fixture/relatório), regra 8 (CHANGELOG ⇒ versão), stack fechada, convenções de idioma.

# Escopo
Dentro:
- Paginar a chamada da RPC `rel_estoque_asof` em `lerEstadoAtivos` (reuse/estenda `paginarTodos`; siga o padrão do próprio arquivo).
- VARREDURA MESMA-RAIZ em `src/` e `scripts/`: enumere TODOS os pontos de leitura do Supabase — chamadas `.rpc()` que retornam conjuntos, `.select()` sem `.range()`/`limit`/paginação, e `.in('col', ids)` com listas potencialmente grandes (o `.in` grande também estoura URL — se achar, resolva por chunking). Classifique cada ponto: (i) estruturalmente limitado (agregado por filial/status/grupo, single row, página de UI com page size) → seguro, registre o motivo; (ii) pode exceder 1.000 hoje ou com crescimento plausível do acervo/histórico (ex.: exports CSV do acervo/movimentações, tabelas do relatório com preset "Tudo", leituras de manutenção/anotações históricas) → CORRIJA com paginação. Atenção especial a `src/lib/actions/exportar.ts`, `src/lib/queries/relatorios/movimentacoes.ts`, `manutencaoDeEstado` em estoque.ts e às demais RPCs `rel_*`.
- Testes novos: unidade para o utilitário de paginação de RPC (mock de client devolvendo páginas de 1.000) e para os pontos corrigidos onde o padrão do repo já testa o equivalente.
- Script de validação SÓ-LEITURA contra produção (ex.: `scripts/manutencao/validar-truncamento.ts`): compara `lerEstadoAtivos` corrigido com a contagem paginada bruta para 3 datas (uma ≥ hoje, duas passadas, consolidado e Matriz) e imprime SÓ contagens.
- ERRATA dos snapshots congelados truncados (detalhe abaixo).
- Versão 1.40.2: bump no package.json, entrada nova no topo de `src/lib/versoes/registry.ts` em LINGUAGEM DE OPERADOR (efeito real: "o comparativo do relatório voltou a contar o acervo inteiro…"), entrada no CHANGELOG.md, tag anotada `v1.40.2` no commit final. Ata em `docs/DECISOES.md` (data · contexto · escolha · motivo).
Fora (não toque):
- `supabase/` INTEIRO — a função SQL está correta; NENHUMA migration, nenhum schema.
- A config `max-rows` no painel do Supabase (subir o teto é mitigação frágil; a correção é paginar no app) — não mexa.
- Snapshots v1 existentes: NUNCA apagar nem editar (`relatorios_gerados` é imutável por regra; errata é sempre linha NOVA com versão maior).
- Dependências novas, refatorações oportunistas, telas/UX, visualizador por senha, `mockups/`.
- Nenhum patrimônio, nome de colaborador ou linha real de produção em teste, fixture, comentário, relatório ou saída colada — SÓ contagens e agregados.

# Errata dos snapshots congelados
- Candidatos: linhas de `relatorios_gerados` cujo `dados->kpis->total` ou `dados->kpisAnterior->total` seja EXATAMENTE 1000 (assinatura do truncamento) ou onde a reconstrução corrigida do mesmo período/escopo divirja do congelado.
- REGRA DE ELEGIBILIDADE (não pule): só gere v2 se TODAS as datas que o motor reconstruirá (o `periodo_ate` e o `ate` da janela anterior de `periodoAnterior`) forem POSTERIORES a 31/07/2026 — data do último import "Substituir tudo" (os imports de go-live apagaram e recriaram o acervo; reconstruir as-of anterior a isso produziria números enganosos, piores que o erro atual). Hoje isso qualifica o consolidado 03–07/08 v1 e o que mais tiver sido gerado depois; os snapshots de julho com `kpisAnterior=1000` são NÃO-ERRATÁVEIS — liste-os no relatório com essa explicação em vez de "consertá-los".
- Como gerar: script local (tsx + service role) que chama o motor corrigido (`getSnapshotRelatorioV2`) para o mesmo período/escopo e INSERE nova linha com `versao = max+1` do mesmo (periodo_de, periodo_ate, filial_id), `gerado_por` = o profile de cargo dev mais antigo ativo (registre qual), e `observacao` explicando: errata automática do truncamento de 1.000 linhas + ressalva de que exclusões feitas depois da geração original (ex.: resoluções de conflito entre filiais) não são reconstruíveis retroativamente. Idempotente: se a v2 do período já existir, não duplique. A UI já exibe "superada"/banner de errata sozinha.
- Antes de inserir, exporte backup JSON das linhas candidatas (leitura) para `docs/` NÃO — para fora do repo (pasta temporária local), só como autoproteção; ids v1→v2 vão para o relatório.

# Critérios de aceitação
1. Script de validação em produção (só leitura): para as 3 datas de teste, a contagem de `lerEstadoAtivos` bate com a contagem paginada bruta e NENHUMA leitura devolve exatamente 1.000 por truncamento; consolidado as-of 15/08 ≈ 1.648, Matriz as-of 15/08 > 1.000. Saída real colada no relatório.
2. Pelo motor corrigido, o relatório ao vivo consolidado da semana atual tem `kpisAnterior.total` > 1.000 (não truncado) e o Δ do total deixa de mostrar o salto fantasma de centenas.
3. Tabela da varredura no relatório: CADA ponto de leitura Supabase do app com veredito (já paginado | seguro estruturalmente + motivo | corrigido nesta entrega) — nenhum ponto classificado como "pode exceder 1.000" sem paginação.
4. `npm run lint`, `npm run build` e `npm run test` integralmente verdes (saídas coladas), incluindo os testes novos e os guardas de versão/CHANGELOG do repo.
5. Errata: v2 gerada para todo snapshot elegível (com `observacao` preenchida), v1 intocada, mapeamento v1→v2 no relatório; não-erratáveis listados com motivo.
6. Versão 1.40.2 completa: bump + registry (linguagem de operador; o teste de vocabulário recusa termo de dev) + CHANGELOG + tag anotada `v1.40.2` publicada; ata em `docs/DECISOES.md`.

# Verificação — rode de verdade
Após cada incremento: `npm run lint` e `npm run test`; leia as falhas, corrija a CAUSA RAIZ e repita até passar — não suprima, não pule e não delete testes para passar. Ao final: `npm run build` + suíte completa + script de validação contra produção, com as saídas guardadas para o relatório. A errata só roda com os critérios 1–4 já verdes.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua: (1) este prompt; (2) CLAUDE.md e convenções do repositório; (3) opção mais simples e reversível, registrada. Decisão não-óbvia → ata em `docs/DECISOES.md` (o arquivo de atas do projeto). Mesma falha após ~3 tentativas: mude de abordagem e registre. Bloqueio real (ex.: rede/credencial): siga com o resto e registre a pendência no relatório.

# Git e segurança
Trabalhe na branch `fix/truncamento-as-of-1000`, commits pequenos e frequentes em pt-BR no padrão do repo (ex.: `fix(relatorios): pagina a leitura as-of do estoque`). Com o checklist inteiro verde e autoverificado, faça o merge na `main`, publique (`git push origin main` e `git push origin v1.40.2`) — fluxo autorizado pelo CLAUDE.md do projeto; o push na main dispara o deploy da Vercel. NUNCA: force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, editar migration aplicada, apagar dado de produção.

# Como trabalhar
Explore com subagentes paralelos: (a) mapa exaustivo de TODAS as leituras Supabase em `src/` e `scripts/` (`.rpc(`, `.select(`, `.in(`) com nota de volume potencial; (b) o motor do relatório e todos os consumidores de `lerEstadoAtivos`/`rel_estoque_asof`; (c) inventário read-only dos snapshots congelados em produção com a assinatura do truncamento. Escreva `docs/PLANO-CORRECAO-TRUNCAMENTO-1000.md` autossuficiente (pontos a corrigir nomeados, vereditos da varredura, fora-de-escopo, verificação de ponta a ponta) antes de implementar. Implemente em incrementos testáveis. Ao final, um subagente em contexto fresco revisa o diff contra o plano e os critérios — apenas lacunas de correção ou de requisitos, não estilo; corrija e re-revise até limpar.

# Relatório final
Escreva `docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md` em pt-BR (padrão dos RELATORIO-F* do repo): causa raiz; o que mudou e por quê; a tabela completa da varredura; saídas REAIS de lint/build/test e do script de validação; erratas geradas (ids v1→v2) e não-erratáveis com motivo; decisões (aponte as atas); pendências e próximos passos. Evidências, não afirmações — e NENHUM dado real (só contagens). Termine a resposta final com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, relatório, commits e UI em pt-BR. Identificadores: domínio em português sem acento, utilitários em inglês — a convenção do CLAUDE.md do repo.
```

## Como executar

**Pré-voo (uma vez, antes de disparar)** — no diretório do projeto (`ti-wap-inventory-control`):

1. `git status` limpo (commite ou guarde o que estiver pendente) e `git pull`.
2. `.env.local` presente na raiz (o script de validação e a errata dependem dele).
3. Rode a suíte uma vez hoje para confirmar o ponto de partida verde: `npm run test`.
4. `claude --version` ≥ 2.1.83 (o modo `auto` exige) e rode `claude` interativo uma vez no diretório para aceitar o diálogo de confiança do workspace, se ainda não aceitou.

**Comando (interativo desatendido — recomendado):**

```powershell
claude --model opus --permission-mode auto -n correcao-truncamento
```

Cole o prompt inteiro e saia de perto. Para acompanhar/retomar: `claude --resume correcao-truncamento`. Logo após colar, vale subir o rigor com:

```text
/goal npm run test, npm run lint e npm run build passam sem falhas e docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md existe com as saídas coladas
```

**Variante headless (PowerShell):** salve só o bloco do prompt em `prompt.txt` e:

```powershell
claude -p (Get-Content -Raw .\prompt.txt) --model opus --permission-mode auto --output-format json > run.json
```

(Guarde o `session_id` do JSON — é a única forma de retomar sessões `-p`.)

**Por que `auto`:** o prompt exige editar arquivos, rodar npm, scripts tsx contra produção e git — `dontAsk` com allowlist teria de prever tudo isso; `auto` executa e o classificador só segura o que parecer arriscado. Atenção: o prompt inclui `git push origin main` + tag (o fluxo autônomo padrão do seu CLAUDE.md). Se o classificador segurar o push numa run desatendida, ao voltar é um aprovar; se preferir revisar antes de publicar, acrescente ao fim do prompt: *"Não faça merge nem push: pare na branch com tudo pronto"* — e o merge+tag+push ficam com você (3 comandos).

**Custo:** run multiagente consome bem mais tokens que um chat (~15×). Para baratear: `$env:CLAUDE_CODE_SUBAGENT_MODEL="sonnet"` antes do comando (subagentes num modelo mais barato, o forte só no orquestrador).

**Ao voltar, revise em 5 minutos:**

1. Leia `docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md` — confira as saídas reais (teste/validação), a tabela da varredura e o mapa v1→v2 das erratas.
2. `git log --oneline` na main + badge `v1.40.2` no pé do menu do app.
3. Abra o relatório ao vivo consolidado: o Δ do total deve ter voltado ao chão (nada de +600).
4. Em Relatórios gerados, o consolidado 03–07/08 deve mostrar a v1 como "superada" e a v2 com a observação de errata.
5. Veio errado? Regra dos 2 strikes: após duas correções falhas, não emende — me peça para regerar o prompt com o aprendizado.

## Suposições que fiz

- A correção é **paginar no app** (padrão `paginarTodos`), não subir o `max-rows` no painel do Supabase — teto maior só adiaria o mesmo bug.
- Errata **automática** (sua escolha), porém **só para snapshots cujo período inteiro é posterior a 31/07** — os imports "Substituir tudo" do go-live apagaram a história anterior, e reconstruir julho hoje produziria números enganosos; esses ficam listados como não-erratáveis.
- Fluxo git do projeto mantido (merge na main + push + tag = deploy Vercel), como o CLAUDE.md autoriza; a variante "parar na branch" está no guia.
- Versão **1.40.2** (patch, entrega avulsa fora de fase — regra 8), sem nenhuma migration.
- Sem mudança de comportamento visível além dos números corretos: nenhuma tela, texto ou permissão é tocada.

ultracode

# Ordem de serviço F35 — Versionamento do sistema, página de versões e crédito de autoria

> Ordem de 12/08/2026, emitida pelo Johnny. Sucede a F34 (`docs/prompts/F34-triagem-reserva-relatorio-ultracode.md` · `docs/RELATORIO-F34.md`). Em conflito entre esta ordem e a spec/ADRs, **esta ordem manda** — emende os documentos e registre em `docs/DECISOES.md`. Numeração: na escrita desta ordem, a última fase era a **F34** (o plano do espelho SharePoint ainda NÃO virou ordem). **Confira os números livres reais antes de começar**; colisão → renumere (precedente F19/F20B) e registre. Esta ordem **não cria migration nenhuma e não adiciona dependência nenhuma**: se você se pegar escrevendo em `supabase/migrations/` ou em `dependencies`, o desenho saiu do trilho — pare e repense (`git diff supabase/` termina vazio; no `package.json`, a única linha que muda é o campo `version`). Se `git status` mostrar trabalho não commitado de outra sessão, PARE e reporte (regra da casa: uma ordem por vez) — **exceto o próprio arquivo desta ordem** (`docs/prompts/F35-versionamento-credito-ultracode.md`), que é insumo da fase: commite-o no primeiro commit.

## Missão

O sistema está em produção desde 15/07/2026 e já entregou ~35 fases, mas não tem **versão**: o `package.json` marca `0.1.0` desde o scaffold e nenhuma tela conta ao operador o que mudou. Três frentes:

- **A — Versionamento adotado de verdade.** Esquema semver com a história retroativa mapeada do `CHANGELOG.md`, `package.json` sincronizado, um **registry TS** como fonte única — e a **regra permanente** no `CLAUDE.md` para toda fase futura somar versão.
- **B — Página `/versoes` no painel.** O histórico completo, da primeira versão à atual, cada uma com data e **o que ela mudou em linguagem de operador** — mais o **número da versão no rodapé da sidebar**, discreto e clicável, levando à página.
- **C — Crédito de autoria, sutil.** "Desenvolvido por **vmatusita**", com link para `https://www.vmatusita.com.br`, em três pontos discretos: tela de login, rodapé da sidebar (junto da versão) e a própria `/versoes`. Sutil = texto pequeno com os tokens de cor existentes; **nunca** logo, imagem, fonte ou script externo.

## Contexto (leia a origem, não descrições dela)

- Doutrina: `@CLAUDE.md` (modo autônomo; stack fechada; convenções; **a árvore prescrita — que esta ordem também emenda**) · `@docs/ESPECIFICACAO.md` §6 (telas) · `@docs/PLANEJAMENTO.md`.
- **Fonte do mapeamento retroativo:** `@CHANGELOG.md` (histórico das fases, mais recente primeiro, com datas) + `@docs/prompts/README.md` (índice das ordens) + `@README.md` (status; go-live em **15/07/2026**). O `git log` desempata quando o texto não disser a data.
- **Padrão de referência para "lista ordenada que vira página + testes derivados":** `@src/lib/ajuda/registry.ts` e os testes da ajuda (F20). Siga essa forma para o registry de versões.
- **Layout:** `@src/components/layout/sidebar-lateral.tsx`, `sidebar-nav.tsx`, `sidebar-colapso.tsx` (+ testes) — o pé da sidebar já tem o botão de recolher da F30; o badge de versão convive com ele **sem quebrar o colapso nem o selo de pendências**. Marca em `@src/components/layout/marca.tsx`; login em `@src/app/login/page.tsx`; paleta `Ctrl+K` em `@src/components/layout/paleta-comandos.tsx` (grupo Ajuda).
- **Guardas que VÃO reclamar da rota nova (F20/F27):** rota sem página de ajuda, página fora do smoke e jargão de dev **quebram testes** — leia os guardas em `src/lib/ajuda/**` antes de criar a rota e siga o caminho que eles esperam; título de aba por tela é regra da F27. Smoke logado: `@scripts/smoke/smoke-prod.mjs` (inclua `/versoes`).
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run contraste` (só se criar par de cor novo — prefira tokens existentes e não crie). **Meça a baseline ANTES de mudar qualquer coisa** e cole no relatório.
- APIs (regra 6 do CLAUDE.md): precisou conferir Next 16/React 19, use a doc oficial vigente (MCP Context7) — não escreva de memória.

## Escopo

**Dentro:** registry de versões + tipos + testes; página `(app)/versoes`; badge de versão no rodapé da sidebar; crédito nos três pontos; bump do `package.json`; regra permanente + árvore no `CLAUDE.md`; tag git da versão nova; página curta de ajuda para a rota (se os guardas exigirem — e exigem); entrada na paleta `Ctrl+K`; rota no smoke; emendas de documentação; encerramento padrão (§R e relatório).

**Fora (não toque):** `supabase/**` (zero migration — nada de versão em banco); dependência nova; **`/relatorios/**` e o visualizador por senha** (o crédito NÃO vai para os relatórios — decisão do Johnny nesta ordem; a rota `/versoes` fica no grupo `(app)`, fora do alcance do cookie de visualização, e `relatorios/acesso` também fica intocada); item novo de navegação na lista da sidebar (o acesso é o badge do rodapé + `Ctrl+K` + ajuda — decisão desta ordem); `src/components/ui/**`; fonte/imagem/script externo (custo R$ 0 — o crédito é texto e link); dado real em qualquer lugar; nenhuma contagem ou tela de relatório muda; tag retroativa em commit antigo (as tags começam na versão desta fase).

## O modelo a implementar

### A — Esquema de versões e registry (fonte única)

1. **Esquema semver, mapeado do CHANGELOG:** fases pré-go-live (F0 até a última antes de 15/07/2026) = `0.x.0` em ordem; **go-live de 15/07/2026 = `1.0.0`**; cada fase concluída depois = **minor** seguinte (`1.1.0`, `1.2.0`, …) na ordem cronológica; entradas avulsas do CHANGELOG que não são fase (ex.: o ajuste pós-F17, a revisão F32→F34) = **patch** da versão vigente à época. **Esta própria ordem fecha como a minor mais nova** — o número exato sai do mapeamento (algo em torno de 1.29.0: conte, não chute). A tabela fase→versão completa vai para o relatório e a ata.
2. **Registry:** `src/lib/versoes/` com `tipos.ts` e `registry.ts` — cada entrada `{ versao, data (ISO), fase?, titulo, mudancas: string[] }`, mais recente primeiro. As `mudancas` são **em linguagem de operador** (rótulos reais das telas, como a ajuda F20 faz): o CHANGELOG é narrativa de dev — a página **traduz**, não copia. De 2 a 6 itens por versão, focados no que o usuário vê ("A devolução volta direto para o estoque", "Dá para transferir item entre filiais numa tela só"); fase invisível ao usuário (CI, auditoria, performance interna) ganha 1–2 itens honestos ("Sistema mais rápido: as telas de operação passaram a responder em cerca de 1/3 do tempo").
3. **`package.json.version` = a versão atual** (a minor desta fase). Teste trava a sincronia.
4. **Testes (vitest, funções puras):** semver válido em toda entrada; ordem estritamente decrescente e sem duplicata; datas válidas, não-futuras e não-crescentes lendo de cima para baixo; `mudancas` não-vazias; `registry[0].versao === package.json.version` (leia o JSON no teste); `1.0.0` datada de 15/07/2026.

### B — Página `/versoes` e badge na sidebar

- `src/app/(app)/versoes/page.tsx`, **Server Component** lendo só o registry (nenhuma query): timeline mais recente primeiro, a versão atual destacada, cada bloco com `v<versão>` + data `dd/MM/yyyy` (+ a fase em texto pequeno esmaecido, para cruzar com a documentação) + título + as ações. `tabular-nums` nos números; **título de aba próprio** (padrão F27); tema claro e escuro.
- **Badge de versão no pé da sidebar:** texto discreto `v<versão>` (token muted), `Link` para `/versoes`. Com a sidebar **recolhida** (F30), decida o comportamento (ocultar o texto, reduzir, ou tooltip como os itens de navegação fazem) — os testes de colapso existentes continuam verdes sem serem editados; registre a decisão.
- **Acesso:** qualquer perfil logado ATIVO lê (piso de leitura — não há escrita nesta tela); consulta, operador, admin e dev veem o mesmo. O visualizador por senha **não** alcança (rota do grupo `(app)`) — confirme, não presuma.
- **Descoberta:** entrada na paleta `Ctrl+K` ("Versões do sistema", no grupo que o padrão da paleta indicar) e página curta de ajuda no registry da F20 (grupo Consultar) se os guardas pedirem página para rota nova — siga o caminho que o guarda espera, incluindo o smoke.

### C — Crédito de autoria

- Componente único reutilizado (ex.: `src/components/layout/credito-autor.tsx`): âncora para `https://www.vmatusita.com.br` com `target="_blank"` e `rel="noopener noreferrer"`, texto pequeno em token muted existente. Forma longa onde há espaço ("Desenvolvido por vmatusita") e curta na sidebar (ex.: só "vmatusita" junto ao badge da versão) — decida a microcopy exata e registre.
- Três pontos, e SÓ três: rodapé da tela de **login**, pé da **sidebar** (junto da versão, sem empurrar o botão de colapso), rodapé de **`/versoes`**. AA nos dois temas; se (e só se) criar par de cor novo, rode `npm run contraste`.

### D — Processo permanente (para as fases futuras)

- **`CLAUDE.md`:** no item 7 das Regras permanentes ("Ao terminar qualquer ordem"), acrescente: **toda ordem com mudança visível ao usuário fecha com bump de minor no `package.json`, entrada nova no registry de `/versoes` (em linguagem de operador) e tag git `v<versão>`; correção avulsa fora de fase = patch.** Atualize também a **árvore prescrita** (a rota `versoes/`, `lib/versoes/`, o componente do crédito) — sem isso, a próxima ordem PARA ao ver a estrutura divergir da prescrita.
- **Tag desta fase:** tag anotada `v<versão>` no commit final, publicada (`git push origin v<versão>`).
- **Emendas de documentação:** spec §6 (a tela Versões, descrição curta), `CHANGELOG.md` (topo), `README.md` (status), `docs/prompts/README.md` (linha F35), `docs/DECISOES.md` (uma ata por decisão: o esquema e o mapeamento fase→versão; badge × colapso; microcopy e pontos do crédito; a regra permanente; a decisão de NÃO pôr crédito nos relatórios).

## Critérios de aceitação

1. **Mapeamento completo:** o registry cobre TODAS as fases do `CHANGELOG.md` (F0→F34 e esta), sem pular nenhuma (F3B, F5A, F6A/F6B, F7B/F7E/F7F, F20B contam), com datas reais e `1.0.0` = 15/07/2026; a tabela fase→versão está no relatório.
2. **Sincronia provada:** `package.json.version === registry[0].versao`, travado por teste.
3. **Página:** `/versoes` renderiza o histórico inteiro (mais recente primeiro, atual em destaque, datas `dd/MM/yyyy`, título de aba próprio) para qualquer perfil logado, nos dois temas; a rota está no smoke.
4. **Badge:** a sidebar mostra `v<versão>` no pé, clicável para `/versoes`; o colapso da F30 e o selo de pendências continuam intactos (testes existentes verdes, sem edição).
5. **Crédito:** presente nos três pontos combinados — e em nenhum outro —, sempre linkando `https://www.vmatusita.com.br` em aba nova com `rel="noopener noreferrer"`; nenhum asset externo novo; AA nos dois temas.
6. **Guardas:** ajuda, paleta, título de aba e smoke verdes com a rota nova incluída.
7. **Nada além do combinado:** `git diff supabase/` vazio; no `package.json` só muda o campo `version`; nenhuma tela ou contagem de relatório mudou; visualizador por senha byte a byte.
8. **Processo:** `CLAUDE.md` com a regra permanente e a árvore atualizada; todas as emendas de documentação feitas.
9. **Portões:** `npm run lint` · `npm run test` · `npm run build` limpos (baseline antes, colada no relatório); CI verde; deploy READY; smoke pós-deploy OK incluindo `/versoes`; tag `v<versão>` publicada.
10. **Relatório:** `docs/RELATORIO-F35.md` com o checklist autoverificado item a item e evidências reais (saídas de comando; contagem de entradas do registry × fases do CHANGELOG).

## §V — Verificação (rode de verdade, itere até passar)

Meça a baseline (lint/test/build + contagem de testes) ANTES de qualquer mudança. A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a CAUSA RAIZ, repita; nunca suprima erro nem desabilite/delete teste para passar. **Conferência do mapeamento por contagem, não por leitura:** derive dos títulos do `CHANGELOG.md` a lista de fases e compare com o registry (num teste ou script descartável) — zero fase faltando. Suba o dev server e confira `/versoes`, o login e a sidebar (expandida, recolhida, tema claro, tema escuro); a conferência visual segue o padrão da casa (read-only + smoke; a evidência que o ambiente permitir vai ao relatório).

Ao final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão, atenção especial a: alguma fase do CHANGELOG ficou fora do registry (as sub-fases contam)?; as `mudancas` estão mesmo em língua de operador (os guardas de jargão da ajuda pegam "RPC", "migration", "policy")?; o badge quebra o colapso da F30 ou o selo de pendências?; a rota vazou para o visualizador por senha, ou o crédito vazou para `/relatorios/**`?; o link tem `rel` correto e nada externo carrega junto?; a árvore do `CLAUDE.md` bate com a estrutura real DEPOIS da fase?; a regra permanente é clara o bastante para a F36 obedecer sem reinterpretar?; sobrou migration ou dependência? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise até limpar.

## Como trabalhar

Explore com subagentes paralelos (o CHANGELOG e o índice de ordens para o mapeamento — é a parte volumosa, fatie por períodos; a sidebar e o colapso; os guardas de ajuda/paleta/smoke; o login) e escreva um `PLAN.md` autossuficiente antes de implementar, já com a tabela fase→versão inteira. Implemente em incrementos testáveis — registry+testes, página, badge, crédito, processo — verificando a cada um. A revisão adversarial final é a do §V.

## Autonomia, decisões e git

Você está rodando em modo autônomo (CLAUDE.md): ninguém vai responder perguntas — não pare para perguntar nem espere confirmação. Régua: (1) esta ordem; (2) spec e convenções do repositório; (3) opção mais simples e reversível, registrada. Toda decisão não-óbvia vira ata em `docs/DECISOES.md` (data · contexto · escolha · motivo). Falha persistindo após ~3 tentativas: mude de abordagem e registre. Git: commits pequenos e frequentes em pt-BR (`feat(f35): …`), direto na `main` ou em branch `f35` com merge próprio ao fechar o checklist; NUNCA force push, `reset --hard`, deleção de teste para passar, `.env*` ou dado real em commit.

## §R — Rollout

1. Sem banco nesta ordem — nenhum apply, nenhum gate. O CI (lint + test + build + job banco) precisa ficar verde no push.
2. Deploy na Vercel (READY) + smoke pós-deploy (`scripts/smoke/smoke-prod.mjs`, já com `/versoes`) + conferência read-only das telas tocadas (login, sidebar, `/versoes`) nos dois temas.
3. Tag `v<versão>` publicada apontando para o commit deployado.
4. Encerramento: `docs/RELATORIO-F35.md` (checklist autoverificado, evidências, decisões, pendências, "o que este relatório NÃO prova") + todas as emendas de documentação + resumo final de ~10 linhas em pt-BR na resposta.

## Idioma

Narrativa, atas, relatório e UI em pt-BR; identificadores de domínio em português sem acento (`versao`, `versoes`, `credito-autor`); utilitários em inglês; commits em pt-BR no padrão conventional da casa.

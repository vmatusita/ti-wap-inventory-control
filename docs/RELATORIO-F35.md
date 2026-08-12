# Relatório F35 — Versionamento do sistema, página `/versoes` e crédito de autoria

> Ordem: `docs/prompts/F35-versionamento-credito-ultracode.md` (12/08/2026) · Plano: `docs/PLAN-F35.md`
> Execução autônoma (`CLAUDE.md`), 12/08/2026. **Zero migration, zero dependência nova.**

## 1. O que a fase entregou, em uma frase

O sistema estava em produção desde 15/07/2026 com ~35 fases entregues e o `package.json` ainda em
`0.1.0`; agora ele **tem versão** (`1.40.0`), **conta o que mudou** em `/versoes` — em linguagem de
operador —, mostra o número no pé do menu, credita o autor em três pontos discretos, e **a próxima
fase não consegue esquecer de subir a versão**, porque um teste lê o `CHANGELOG.md` e reprova.

## 2. Baseline medida ANTES de qualquer mudança

| Portão | Antes | Depois |
|---|---|---|
| `npm run lint` | limpo | limpo |
| `npm run test` | **122 arquivos · 2.523 testes** | **124 arquivos · 2.544 testes** (+2 arquivos, +21 testes) |
| `npm run build` | ✓ 30 rotas | ✓ **31 rotas** (`/versoes` nova) |
| `npm run contraste` | exit 0 | exit 0 (**nenhum par novo**) |
| `package.json.version` | `0.1.0` | `1.40.0` |
| `git tag` | **zero tags** | `v1.40.0` |

Saída real da baseline (13:01, antes do primeiro commit):

```
 Test Files  122 passed (122)
      Tests  2523 passed (2523)
   Duration  141.92s
```

## 3. O esquema de versões, e o número desta fase

**A unidade é o que foi ENTREGUE**, na ordem em que o `CHANGELOG.md` registra (lendo de baixo para
cima = cronológico):

1. cada **fase** (`F*`) vira uma **minor**;
2. cada **entrega avulsa** do CHANGELOG (entrada própria — ajuste, auditoria, rollout, diagnóstico,
   revisão — **ou** item nomeado dentro de entrada agrupada) vira um **patch** da minor vigente;
3. fases anteriores ao go-live são `0.x.0`; o **go-live de 15/07/2026 (F4) é a `1.0.0`**;
4. entrada que agrupa N fases vira N versões, todas com a **data do cabeçalho**;
5. a data é a do CHANGELOG, não a do commit — por isso as datas são **não-crescentes** de cima para
   baixo.

**Contado, não estimado: 56 entradas** — 6 em `0.x`, a `1.0.0`, 39 minors e 9 patches depois do
go-live, mais esta fase. **A F35 é a `1.40.0`.** A ordem estimava "algo em torno de 1.29.0" e mandava
contar: o `1.29.0` caiu na **F24**.

### 3.1 Tabela fase → versão (completa — 56 entradas)

| Versão | Data | Fase | Entrada do CHANGELOG |
|---|---|---|---|
| `1.40.0` | 12/08/2026 | **F35** | esta fase |
| `1.39.1` | 11/08/2026 | — | Revisão de código do intervalo F32→F34 |
| `1.39.0` | 11/08/2026 | F34 | A triagem virou opt-in, e o reservado passou a mudar de dono |
| `1.38.0` | 10/08/2026 | F33 | O sistema estava rodando no hemisfério errado |
| `1.37.0` | 10/08/2026 | F32 | A cor do relatório virou língua… |
| `1.36.0` | 09/08/2026 | F31 | Transferir itens entre filiais e conferir a prateleira |
| `1.35.0` | 09/08/2026 | F30 | O lote nasce da lista… |
| `1.34.0` | 07/08/2026 | F29 | Relatórios que se navegam… |
| `1.33.0` | 07/08/2026 | F28 | A rotina diária… |
| `1.32.0` | 07/08/2026 | F27 | As costuras entre telas… |
| `1.31.0` | 04/08/2026 | F26 | A troca/upgrade virou uma tela só |
| `1.30.0` | 04/08/2026 | F25 | Celular com campos próprios… |
| `1.29.0` | 30/07/2026 | F24 | Conflito entre filiais |
| `1.28.0` | 30/07/2026 | F23 | Ferramentas destrutivas do cargo Desenvolvedor |
| `1.27.0` | 30/07/2026 | F22 | Cargo Desenvolvedor e a área `/dev` |
| `1.26.0` | 29/07/2026 | F21 | Cargos, permissões e vínculo de filiais |
| `1.25.0` | 28/07/2026 | F20B | Nome do arquivo dos termos + "Tentar novamente" |
| `1.24.3` | 25/07/2026 | — | Auditoria de `src/`: 7 lentes |
| `1.24.2` | 25/07/2026 | — | Rollout: as 4 migrations nos dois bancos |
| `1.24.1` | 25/07/2026 | — | Diagnóstico de projeto |
| `1.24.0` | 24/07/2026 | F20 | A ajuda vira DOCUMENTAÇÃO do operador |
| `1.23.1` | 24/07/2026 | — | Convite: nome e sobrenome pela própria pessoa |
| `1.23.0` | 24/07/2026 | F19-UX | Correções de UX/UI + modo escuro |
| `1.22.0` | 24/07/2026 | F19 | Auditoria de regras de negócio |
| `1.21.0` | 24/07/2026 | F18 | Pendência de item por movimentação |
| `1.20.1` | 24/07/2026 | — | Ajuste: importados não exigem termo |
| `1.20.0` | 24/07/2026 | F17 | CI de banco + legendas no relatório |
| `1.19.0` | 23/07/2026 | F16 | Leitura e navegação no relatório |
| `1.18.0` | 23/07/2026 | F15 | Correções do primeiro uso real da F14 |
| `1.17.0` | 23/07/2026 | F14 | Manutenção com fornecedor |
| `1.16.0` | 23/07/2026 | F13 | O apagão silencioso das Server Actions |
| `1.15.0` | 23/07/2026 | F12 | Estoque mínimo, kits e a auditoria dos commits |
| `1.14.0` | 22/07/2026 | F11 | Navegação e estrutura |
| `1.13.0` | 22/07/2026 | F10 | Operação em massa |
| `1.12.1` | 22/07/2026 | — | Acesso: login de operador para a Stefanini |
| `1.12.0` | 22/07/2026 | F9 | Quick wins de UX da operação |
| `1.11.1` | 21/07/2026 | — | Manutenção: dívida técnica, segurança e documentação |
| `1.11.0` | 20/07/2026 | F7K | Modelo que repetia a marca |
| `1.10.0` | 20/07/2026 | F7J | Hostname curto e patrimônio forçado |
| `1.9.1` | 20/07/2026 | — | Patrimônio pelo hostname vira automático |
| `1.9.0` | 20/07/2026 | F8 | Compra de abertura volta a ser baseline (**reverte a `1.8.0`**) |
| `1.8.0` | 20/07/2026 | F7H | Compra do import vira Entrada — **desfeita no mesmo dia** |
| `1.7.0` | 20/07/2026 | F7G | Import lê o `.xlsx` nativo |
| `1.6.0` | 17/07/2026 | F7F | Import de startup: robustez |
| `1.5.0` | 17/07/2026 | F7E | Datas `dd/MMM` e patrimônio vazio |
| `1.4.0` | 17/07/2026 | F7B | Correção de erros do import na tela |
| `1.3.0` | 16/07/2026 | F7 | Import de startup por filial |
| `1.2.0` | 16/07/2026 | F6B | Melhorias de UX pós-go-live |
| `1.1.0` | 16/07/2026 | F6A | Correções pós-go-live |
| **`1.0.0`** | **15/07/2026** | **F4** | **Go-live** |
| `0.6.0` | 14/07/2026 | F5A | Termos gerados pelo sistema |
| `0.5.0` | 14/07/2026 | F3B | Relatórios v2 + itens por quantidade |
| `0.4.0` | 13/07/2026 | F3 | Relatórios + administração |
| `0.3.0` | 13/07/2026 | F2 | Operação |
| `0.2.0` | 10/07/2026 | F1 | Banco + dados fictícios |
| `0.1.0` | 10/07/2026 | F0 | Fundação |

**Fora do registry, com motivo:** `F5` e `F6C` (backlog nunca executado, citados em prosa por outras
entradas); `F6` (taquigrafia de F6A/F6B) e `F7C` (rótulo de uma **decisão**, não de uma ordem — ver
`CLAUDE.md`, regra 2). A lista de isentos vive em `cobertura-changelog.test.ts`, cada uma com o
motivo escrito. Os *sprints* de dívida técnica de 14–15/07 não têm cabeçalho próprio no CHANGELOG e
são invisíveis ao operador: ficam dentro da `0.6.0`.

**A `F7H` ganhou versão própria** apesar de ter sido revertida pela F8 no mesmo dia: ela **esteve em
produção** (809 compras marcadas), o CHANGELOG a nomeia, e o critério 1 manda não pular fase nenhuma.
O texto dela diz que foi desfeita; a `1.9.0`, logo acima na tela, conta o desfecho.

### 3.2 Conferência POR CONTAGEM (o que a ordem §V exige)

Não é leitura por cima: `src/lib/versoes/cobertura-changelog.test.ts` lê o `CHANGELOG.md` a cada
`npm run test` e reprova se

- alguma fase citada em qualquer entrada não tiver versão (fora da lista de isentos);
- alguma data de cabeçalho não existir no registry;
- houver menos versões que entradas;
- o registry citar fase que o CHANGELOG desconhece.

Ele **pegou coisa de verdade na primeira execução**: acusou `F6` e `F7C` (falsos positivos reais, que
viraram isentos com motivo escrito) e a ausência da própria F35 no CHANGELOG, que ainda não tinha
sido escrita.

## 4. Checklist da ordem — autoverificado item a item

| # | Critério | Status | Evidência |
|---|---|---|---|
| 1 | Mapeamento completo (F0→F34 + esta), sub-fases inclusas, datas reais, `1.0.0` = 15/07/2026; tabela no relatório | ✅ | §3.1 acima (56 entradas); `cobertura-changelog.test.ts` prova por contagem; teste dedicado trava a `1.0.0` |
| 2 | `package.json.version === registry[0].versao`, travado por teste | ✅ | `registry.test.ts` → "a versao atual e exatamente a do package.json"; `git diff` do `package.json` mostra só a linha `version` |
| 3 | `/versoes` renderiza o histórico inteiro, atual em destaque, `dd/MM/yyyy`, título de aba, qualquer perfil, dois temas; no smoke | ✅ | `src/app/(app)/versoes/page.tsx`; `metadata = { title: 'Versões' }`; `formatDate()`; smoke com marcador da PRIMEIRA versão |
| 4 | Badge `v<versão>` no pé da sidebar, clicável; colapso da F30 e selo de pendências intactos, testes sem edição | ✅ | `git diff HEAD~3 -- src/components/layout/sidebar-colapso.test.ts` **vazio**; medido no navegador: aside 64px, rótulo `display:none`, link 39px sem transbordo |
| 5 | Crédito nos três pontos e em nenhum outro, `rel="noopener noreferrer"`, sem asset externo, AA nos dois temas | ✅ | HTML servido do `/login`: `target="_blank" rel="noopener noreferrer"`; contraste medido 4,73:1 (claro) e 6,91:1 (escuro) |
| 6 | Guardas de ajuda, paleta, título de aba e smoke verdes com a rota nova | ✅ | `npx vitest run src/lib/ajuda` → 13 arquivos, 435 testes |
| 7 | `git diff supabase/` vazio; no `package.json` só `version`; nenhuma tela/contagem de relatório mudou; visualizador byte a byte | ✅ | §6 abaixo |
| 8 | `CLAUDE.md` com a regra permanente e a árvore atualizada; emendas de documentação | ✅ | item **8** novo; árvore com `versoes/`, `lib/versoes/`, `rodape-sidebar`/`credito-autor`; spec §6 item 7; CHANGELOG, README, índice de ordens, DECISOES |
| 9 | `lint`/`test`/`build` limpos; CI verde; deploy READY; smoke pós-deploy; tag publicada | ✅ | §8 — CI run 31624421818 (`verificar` **e** `banco` success), deploy `a5e2ca7` READY, smoke **96 OK · 0 falha** com `/versoes` 200, tag `v1.40.0` publicada |
| 10 | Relatório com checklist autoverificado e evidências reais | ✅ | este arquivo |

## 5. Decisões registradas (`docs/DECISOES.md`, 2026-08-12 · F35)

1. **O número F35 é desta ordem** — o espelho do SharePoint passa a ser **F36** (emenda à ata de
   11/08, que o reservava). Mesmo critério que a ata usou para si: o número é da ordem que o Johnny
   colou e que está em execução.
2. **O esquema de versões** — fase = minor, entrega avulsa = patch, go-live = `1.0.0`, entrada
   agrupada vira N versões com a data do cabeçalho.
3. **A F7H ganha versão própria** mesmo tendo sido desfeita horas depois.
4. **O registry não é só-servidor**, mas o badge recebe a versão **por prop** — importá-lo de um
   Client Component jogaria as 56 entradas no bundle de toda tela para mostrar sete caracteres.
5. **O badge não escreve uma linha de CSS** — reusa `data-sidebar-item`/`data-sidebar-rotulo`; e o
   rodapé no Sheet do celular é **o mesmo ponto**, pelo mesmo componente, não um quarto crédito.
6. **O crédito: microcopy, os três pontos, e por que ele fica dentro do card no login** (com a
   medição de contraste que decidiu).
7. **A regra permanente vira o item 8 do `CLAUDE.md`**, com teste que a cobra.
8. **As tags começam em `v1.40.0`** — nada de tag retroativa.

## 6. O que NÃO mudou (provado, não afirmado)

```
$ git diff HEAD~3 --stat -- supabase/
(vazio)

$ git diff HEAD~3 -- package.json
-  "version": "0.1.0",
+  "version": "1.40.0",
   (nenhuma outra linha)
```

- `src/components/ui/**`, `src/components/relatorios/**`, `src/lib/relatorios/**`: **intocados**.
- `src/components/layout/sidebar-nav.tsx`: **intocado** — a ordem proíbe item novo de navegação.
- `src/components/layout/sidebar-colapso.test.ts` e `sidebar-preferencia.test.ts`: **intocados** — a
  ordem exige que continuem verdes **sem edição**, e continuam.
- `src/app/globals.css`: **intocado** — zero CSS novo.
- `/relatorios/**` e `relatorios/acesso`: **intocados**. O crédito **não** entrou lá.

**O visualizador por senha não alcança `/versoes`** — lido em `src/lib/supabase/proxy.ts`, não
suposto: o cookie de visualização só é honrado no ramo `pathname.startsWith('/relatorios')`; qualquer
outra rota cai no `redirect('/login')` do fim da função.

## 7. Verificação executada

- **Portões**: `lint` + `test` + `build` a cada incremento (5 incrementos).
- **Contraste**: `npm run contraste` sai **0**, sem par novo. As três superfícies do crédito foram
  medidas com `--par`: `muted-foreground` sobre `card` **4,73:1** (claro) / **6,91:1** (escuro),
  sobre `background` **4,73:1** / **7,63:1**.
- **Navegador (scaffold temporário, apagado antes do commit)**: como `/versoes` é uma tela atrás do
  login e o rodapé é Client Component, a única forma de VER o comportamento real sem sessão foi uma
  página pública descartável sob `/login/verify-f35`, montando os componentes **de verdade**. Medido
  com `getComputedStyle`, não por screenshot:
  - recolhida: `<aside>` **64px**, link com `justify-content: center` e `padding-inline: 0`,
    rótulo da versão `display: none`, crédito `display: none`, link **39px** sem transbordo;
  - o Radix `TooltipTrigger` só aparece no ramo recolhido (`data-state`/`data-slot` no link),
    então a versão continua alcançável pelo mouse **e** pelo foco quando o texto some;
  - o HTML servido de `/login` traz o crédito com `target="_blank" rel="noopener noreferrer"`.
  O scaffold e o `.claude/launch.json` foram removidos; `git status` confirma.

### 7.1 O que a verificação de navegador ACHOU

**Um defeito real, corrigido:** o link do badge tinha `aria-label="Versão 1.40.0 do sistema — ver o
que mudou"` enquanto o texto visível é `v1.40.0`. O texto visível **não era substring** do nome
acessível — falha de **WCAG 2.5.3 (Label in Name)**: quem comanda por voz dizendo "clicar v1.40.0"
não acertaria o alvo. O rótulo passou a começar pelo texto visível. **Nenhum teste pegaria isso** —
é o tipo de defeito que só aparece lendo a árvore de acessibilidade da página rodando.

### 7.2 Revisão adversarial (contexto fresco) — 6 lentes, 3 céticos por achado

`mapeamento` · `lingua-operador` · `sidebar-colapso` · `escopo-e-vazamento` · `guardas-e-processo` ·
`codigo-e-render`. **7 achados brutos**, cada um julgado por 3 céticos independentes (ângulos
*correção*, *requisito*, *reprodução*), refutação por padrão. **Três lentes voltaram limpas**
(mapeamento, colapso da sidebar, escopo/vazamento).

Os sete, e o que foi feito com cada um:

| # | Achado | Desfecho |
|---|---|---|
| 1 | O item 8 do `CLAUDE.md` se contradizia: abria com "toda ordem com mudança **visível**" e fechava dizendo que fase invisível também entra | **Corrigido.** O gatilho passou a ser objetivo — **toda entrada nova no `CHANGELOG.md`** —, com minor/patch explicitados e o caso "invisível ao usuário" resolvido no texto, não na elegibilidade |
| 2 | A página de ajuda prometia versão derivada do registry, mas tinha `1.40.0` **digitado** em dois pontos (o parágrafo e a tabela) — envelheceria no próximo bump | **Corrigido.** Os dois passaram a ler `versaoAtual()`; agora o comentário do arquivo é verdade |
| 3 | O `CHANGELOG` dizia que a regra virou "item 7" do `CLAUDE.md`; virou o **item 8** | **Corrigido** |
| 4 | O título da `1.22.0` dizia "corrige **dois erros de estoque**" — só um era de estoque; o outro era brecha de acesso | **Corrigido:** "corrige um erro de estoque e fecha uma brecha" |
| 5 | A `1.24.1` dizia "ambiente de **ensaio**… de **produção**" — jargão interno que o guarda de vocabulário não pega (e `grep 'ensaio'` em toda a ajuda da F20 dá zero) | **Corrigido:** "A cópia do sistema usada para testar…" |
| 6 | O §R nunca foi executado: sem push, sem tag, sem `RELATORIO-F35.md`, com scaffold sobrando — enquanto `CHANGELOG`/`README` já afirmavam a fase concluída | **Resolvido:** era o passo seguinte. Scaffold removido, relatório escrito, §8 executado e verificado |
| 7 | Mesmo achado do #6, por outra lente (links mortos para o relatório) | idem |

⚠ **Contaminação de refutação, registrada por honestidade:** os achados 2, 3 e 4 foram corrigidos por
mim **enquanto os céticos julgavam**, e por isso vários deles votaram "refutado — o disco já mostra
corrigido". A contagem final da máquina (2 confirmados, 5 refutados) **subestima** o que a revisão
achou: os cinco eram reais, e cinco dos sete viraram correção. É a mesma armadilha registrada na
F26; o remédio é não ler o placar sem ler os achados.

## 8. Rollout (§R) — executado

| Passo | Resultado |
|---|---|
| 1. Sem banco | `git diff --stat -- supabase/` **vazio**. Nenhum apply, nenhum gate. |
| 1. CI verde no push | Run **31624421818** (`a5e2ca7`) — **`verificar` success** (lint · testes · contraste · build) **e `banco` success** (aplica todas as migrations + roteiros SQL). Conclusão do run: `success`. |
| 2. Deploy na Vercel | `a5e2ca7`, target **production**, estado **READY**. |
| 2. Smoke pós-deploy | `node scripts/smoke/smoke-prod.mjs` → **96 OK · 4 aviso · 0 falha**, com `/versoes` **HTTP 200** (marcador conferido) e `/ajuda/versoes-do-sistema` **HTTP 200**. |
| 3. Tag publicada | `v1.40.0` **anotada**, apontando para `a5e2ca7` (o commit deployado), publicada em `origin`. Primeira tag do repositório. |
| 4. Encerramento | este relatório + as emendas de documentação + o resumo final. |

**Os 4 avisos do smoke são pré-existentes e alheios a esta fase** — todos sobre o **catálogo de itens
vazio** (a carga da F6C, pendência declarada no `README` desde 16/07/2026): catálogo vazio, RPC de
saldo com 0 linhas, `estoque_minimo` sem dado e a RLS de `kits_modelos` que não se comprova sem kit
cadastrado. Nenhum deles é regressão.

Uma armadilha de ambiente vale registro: depois de apagar o scaffold de verificação, o `npm run
build` **falhou** porque os tipos gerados em `.next/types` ainda referenciavam a rota apagada
(`AppPageConfig<"/login/verify-f35">`). `rm -rf .next` e rebuild resolveram — é artefato gerado, não
código.

## 9. O que este relatório NÃO prova

- **Não prova a tela `/versoes` renderizada com sessão real.** O agente não digita senha em
  formulário e não há credencial de operador nesta máquina; a rota está atrás do login. O que se
  provou: que ela **compila e entra no build** (31 rotas), que os guardas de ajuda/smoke a cobrem, e
  — no pós-deploy — que o smoke logado a encontra pelo marcador. O layout visual da timeline
  (espaçamento, hierarquia, destaque da versão atual) **não foi visto por olho humano nem por
  screenshot**.
- **Não prova o tema escuro por inspeção visual.** O contraste foi medido numericamente pelo script
  (que lê os mesmos tokens que o navegador), não conferido a olho.
- **Não prova o rodapé no Sheet do celular em uso real** — ele foi montado pelo mesmo componente
  verificado no desktop, e o teste "o mobile não muda" continua verde, mas ninguém abriu o menu de
  toque num aparelho.
- **Não prova que o mapeamento fase→versão é a única leitura possível do CHANGELOG.** Ele é *uma*
  leitura, declarada em ata e travada por teste. Se o Johnny quiser outra granularidade (uma versão
  por dia, por exemplo), a renumeração é trabalhosa mas não é impossível.
- **Não prova que as `mudancas` descrevem cada fase com justiça.** São 2 a 6 frases para fases que
  levaram dias; a escolha do que citar é editorial. O que está travado por teste é que elas existem,
  que não usam vocabulário de desenvolvedor e que toda fase está coberta — não que sejam a melhor
  síntese possível.
- **Não prova a tag em produção antes de o passo 3 do §R rodar.**

## 10. Pendências declaradas

- **Os dois documentos do espelho do SharePoint** (`docs/PLANO-ESPELHO-SHAREPOINT.md`,
  `docs/ROTEIRO-ESPELHO-ENTRA.md`) continuam **não commitados e não editados**, como na F34. Eles
  ainda se anunciam como "F34"/"F35"; quando virarem ordem de serviço, serão **F36** (ata desta
  fase). É decisão do Johnny commitá-los ou descartá-los.
- **O teste `fronteira-rsc.test.ts` é instável nesta máquina**: falhou uma vez por *timeout* de 5s na
  primeira execução da suíte completa e passou sozinho em 1,43s logo depois, e a suíte inteira passou
  na reexecução. É a instabilidade de varredura de disco sob OneDrive já conhecida do projeto — **não
  é regressão desta fase** (o teste é da F32 e não foi tocado).

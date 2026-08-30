# F40 — Sistema de design: fundação + piloto ativos

Ordem de serviço autônoma (ultracode) para executar as **duas primeiras frentes** de
[`docs/PLANO-DESIGN-SYSTEM.md`](../PLANO-DESIGN-SYSTEM.md): a fundação e o piloto em `/ativos`.
As frentes **a**, **b**, **c** e **d** ficam para ordens seguintes — o plano é explícito sobre por
quê: *"Se o sistema couber nela sem exceção, cabe no resto. Se não couber, o custo do erro é uma
frente, não seis."*

Escrita em 30/08/2026, com três decisões do Johnny já tomadas e registradas aqui (§ Suposições).

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar as frentes 0 (fundação) e piloto (ativos) do plano `docs/PLANO-DESIGN-SYSTEM.md`:
criar o casco de página, os componentes de sistema e os tokens semânticos de cor; escrever os
dois testes que reprovam a regressão; e aplicar tudo isso nas três rotas de `/ativos`. Ao final:
`lint`, `test`, `build` e `contraste` verdes, versão 1.45.0 publicada e a fase mergeada na `main`.

# Contexto
- **Leia `@docs/PLANO-DESIGN-SYSTEM.md` INTEIRO antes de escrever qualquer código.** Ele é a fonte
  de verdade desta ordem: §1 o inventário medido, §3 o sistema, §4 os dois testes, §5 as frentes,
  §6 a verificação, §7 as metas, §8 as decisões. Onde este prompt e o plano divergirem, vale este
  prompt — e registre a divergência.
- `@CLAUDE.md` manda em tudo o mais: modo autônomo, as 8 regras permanentes, a stack fechada, as
  convenções e a estrutura de pastas.
- **Referência de código: o repositório irmão** (o "Acervo"), em `../stefanini-ti-inventory-control`.
  Leia estes arquivos e siga os PADRÕES deles — nunca os dados (regra 2 do CLAUDE.md):
  `src/components/layout/pagina.tsx` · `aviso.tsx` · `cartao-de-metrica.tsx` ·
  `casco-de-autenticacao.tsx` · `estado-vazio.tsx` · `src/lib/tema/cores.ts` · `cores.test.ts` ·
  `src/lib/layout/consistencia.test.ts`. Se o diretório não estiver acessível, siga só pelo plano
  e registre a limitação no relatório.
- Comandos do projeto: `npm run lint` · `npm run test` · `npm run build` · `npm run contraste`.
- Padrão de teste da casa (siga-o, não invente outro): `src/components/layout/sidebar-colapso.test.ts`,
  `src/components/relatorios/impressao-colunas.test.ts` e
  `src/components/relatorios/confinamento-viewer.test.ts` — todos leem TEXTO-FONTE com `readFileSync`
  e afirmam sobre a string. `vitest.config.mts` roda em ambiente `node` e só inclui `*.test.ts`;
  `.test.tsx` não entra na suíte e não há biblioteca de render. Não tente contornar isso.

# Primeiro passo obrigatório: revalidar a linha de base
Antes de mudar uma linha, rode os quatro comandos e os greps de `§1.6` do plano, e compare com
`§7`. Se algum número divergir do que o plano afirma, ATUALIZE o plano (com a data) e siga — o
plano foi medido em 30/08/2026 e pode ter envelhecido. Se `lint`, `test` ou `build` já estiverem
vermelhos ANTES da sua primeira mudança, registre exatamente quais falhas são pré-existentes: não
as conserte e não as piore.

# Escopo
Dentro:
- **Fundação:** `src/components/layout/pagina.tsx` (`Pagina`, `CabecalhoDaPagina`, `SecaoDaPagina`),
  `aviso.tsx`, `cartao-de-metrica.tsx`, `casco-de-autenticacao.tsx`, `quadro-de-tabela.tsx`,
  `confirmacao-digitada.tsx`; a extensão de `estado-vazio.tsx` (prop `acao` passa a aceitar
  `ReactNode` além de `{href, rotulo}`, sem quebrar os 12 usos atuais).
- **Tokens:** as 9 famílias `--selo-<familia>` / `--selo-<familia>-texto` em `src/app/globals.css`
  (§3.5), nos dois temas, com os valores oklch COPIADOS de `node_modules/tailwindcss/theme.css`; os
  apelidos `--grafico-<familia>`; a regra de impressão do `Card` dentro do `@media print` existente;
  e `STATUS_META` de `src/lib/dominio.ts` passando a apontar para os tokens.
- **Medidor:** 18 pares novos em `scripts/contraste.mjs` (9 famílias × 2 temas).
- **Testes:** `src/lib/layout/consistencia.test.ts` (as 7 regras de §4.1 + a regra de esqueleto) e
  `src/lib/dominio/cores.test.ts` (a catraca de §4.2).
- **Piloto:** as 3 rotas de `/ativos` (`page.tsx`, `[id]/page.tsx`, `novo/page.tsx`), seus
  `loading.tsx` e `src/components/ativos/**` — EXCETO `nova-compra-form.tsx`.
- Playwright como devDependency + o script de captura, e as fotos "antes"/"depois" (ver
  § Screenshots).
- `docs/DECISOES.md`, `docs/DIVIDA-TECNICA.md`, `CHANGELOG.md`, `package.json` (só `version`),
  `src/lib/versoes/registry.ts`.

Fora (não toque):
- `supabase/migrations/`, `src/lib/actions/`, `src/lib/queries/`, `src/lib/validators/`,
  `src/proxy.ts`, `src/lib/types/database.ts` — esta ordem é de apresentação.
- `src/components/ui/` (shadcn pela CLI). Se um componente do kit precisar mudar, NÃO mude:
  registre em `DECISOES.md` e resolva por composição.
- **`src/components/ativos/nova-compra-form.tsx`** (1.412 linhas, 30 `useState`) — formulários são
  outra frente, e mexer nele aqui é trocar dívida conhecida por risco de regressão.
- As frentes a, b, c e d do plano: home, pendências, movimentações, relatórios, admin, itens, dev,
  ajuda, versões e as telas públicas. **`CascoDeAutenticacao` é CRIADO nesta ordem e NÃO é aplicado
  a nenhuma tela** — a aplicação é da frente d.
- Nenhuma cor RENDERIZADA muda. Nenhum texto de tela muda. Nenhuma regra de negócio muda.
- Dependência nova além do Playwright (aprovado, ver § Decisões já tomadas).

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run build` e `npm run contraste` passam — os quatro.
2. **Nenhuma cor mudou, e há prova disso:** os 18 pares novos de selo imprimem, em
   `npm run contraste`, as MESMAS razões dos pares de paleta correspondentes, na mesma casa
   decimal. Cole as duas colunas lado a lado no relatório.
3. `git diff src/app/globals.css` não altera nenhuma linha `oklch` pré-existente — só acrescenta.
   Confira por diff, não por leitura.
4. `src/lib/dominio.ts` não contém nenhuma classe de paleta de fábrica do Tailwind nem nenhum hex —
   e `cores.test.ts` prova isso com `toBeNull()`, não com catraca.
5. A catraca de `cores.test.ts` desceu: o teto de classes de paleta crua é MENOR que 555 e o número
   novo está escrito no arquivo, no mesmo commit que o abaixou.
6. `consistencia.test.ts` está verde **para as 3 rotas de `/ativos`**. Para as 29 rotas ainda não
   migradas, o teste as ignora por uma lista explícita de exceções, com um comentário dizendo que
   cada frente seguinte remove as suas — lista que só encolhe. Não deixe o teste vermelho, e não
   afrouxe as regras para deixá-lo verde.
7. As 3 rotas de `/ativos` usam `<Pagina>` e `<CabecalhoDaPagina>`; nenhuma delas tem `<h1>`
   escrito à mão, `max-w-*` de container, passo de espaçamento fora da escala, `text-[Npx]` ou
   moldura `rounded-* border` crua.
8. O `tabular-nums` do patrimônio em `/ativos/[id]` sobrevive (a prop `titulo` aceita `ReactNode`).
9. Versão **1.45.0**: `package.json`, entrada nova no topo de `src/lib/versoes/registry.ts` (fase
   `F40`, 2 a 6 mudanças em LINGUAGEM DE OPERADOR — há teste que recusa vocabulário de
   desenvolvedor), entrada no `CHANGELOG.md`, tag anotada `v1.45.0` publicada.
10. Screenshots capturados OU a pendência registrada com o motivo exato (ver § Screenshots).

# Verificação — rode de verdade
Rode os quatro comandos após CADA incremento, não só no fim. Leia as falhas, corrija a CAUSA RAIZ
e repita até passar. Proibido: desabilitar, pular ou apagar teste para fazê-lo passar; afrouxar uma
regra do `consistencia.test.ts` para acomodar código que não se ajustou; marcar par de contraste
como `alivio` para escapar de uma medição. Se um teste existente quebrar, ele é o contrato: ou o
seu código está errado, ou o teste está de fato errado — e nesse caso NÃO o altere sem registrar em
`docs/DECISOES.md` e apontar no relatório.

Guarde a saída real e completa dos quatro comandos para o relatório.

# Screenshots — e a trava que vem antes deles
O Johnny APROVOU o Playwright como devDependency (MIT, R$ 0, só dev) em 30/08/2026. Instale-o,
registre a aprovação em `docs/DECISOES.md` e escreva `scripts/design/capturar.mjs` que fotografa as
rotas em 375, 1280 e 1920 px × tema claro e escuro. Capture uma passada "antes" ANTES da primeira
mudança e uma "depois" no fim; grave em `docs/f40-evidencias/`.

**A TRAVA, e ela é absoluta.** A regra 2 do `CLAUDE.md` proíbe dado real em screenshot, e o
`.env.local` deste repositório aponta para o ref de PRODUÇÃO `pbtjcalbmepmrqzprusb`. Portanto:

- Antes de capturar qualquer coisa, leia o ref do `NEXT_PUBLIC_SUPABASE_URL` que o servidor de
  desenvolvimento vai usar. **Se for `pbtjcalbmepmrqzprusb`, NÃO CAPTURE NADA.**
- Use um banco de ensaio com dados fictícios: se existir um arquivo de ambiente apontando para um
  ref diferente do de produção (ex.: `.env.ensaio`), suba o `next dev` com ele. As personas do seed
  (`seed.admin@wap.ind.br` e irmãs, em `scripts/seed.ts`) são o login das fotos.
- **Sem credencial de ensaio, siga sem screenshots.** Isso é insumo físico que só o Johnny tem;
  não invente credencial, não aponte para produção "só para ver", não capture tela de login com
  dado real. Registre a pendência no relatório, em uma frase, dizendo exatamente o que falta.
- Nunca commite `.env*`.
- Quando as fotos existirem: compare "antes" × "depois" par a par e reporte no relatório toda
  diferença que NÃO seja o ritmo de espaçamento previsto pelo plano. Sem overflow horizontal, sem
  corte, sem elemento fora de lugar.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. **Não pare para perguntar e
não espere confirmação em nenhuma hipótese** — o `CLAUDE.md` já registra esse modo desde 09/07/2026.

Régua de decisão: (1) este prompt; (2) `docs/PLANO-DESIGN-SYSTEM.md`; (3) `CLAUDE.md` e a hierarquia
de documentos-fonte dele; (4) as convenções do código existente; (5) restando ambiguidade, a opção
mais simples e reversível. Toda decisão não-óbvia vai para `docs/DECISOES.md` no formato da casa
(data · contexto · escolha · alternativas · motivo).

Se a mesma falha persistir depois de ~3 tentativas, MUDE DE ABORDAGEM em vez de repetir, e registre
a troca. Bloqueio real (credencial ausente, serviço fora): contorne se for seguro; se não for, siga
com o resto do escopo e registre a pendência com o que falta para resolvê-la. Nunca deixe a ordem
pela metade em silêncio.

O `CLAUDE.md` diz "se a estrutura real divergir, PARE e reporte". Nesta run, ninguém recebe o
reporte em tempo real: então **registre a divergência em `docs/DECISOES.md`, adapte e siga** —
exceto se a divergência tornar o escopo inteiro sem sentido, e aí sim pare e explique no relatório.

## Decisões já tomadas pelo Johnny (30/08/2026) — registre as quatro em DECISOES.md
1. **Playwright APROVADO** como devDependency (§8 decisão 1 do plano). Instale e use.
2. **`mx-auto` sai** (§8 decisão 2): o casco alinha à esquerda. No piloto isso afeta
   `/ativos/novo`, que hoje é `mx-auto max-w-3xl` — passa a `cheia` + `MEDIDA_DE_FORMULARIO` no
   contêiner dos campos. É a única mudança de posição visível desta ordem; documente-a.
3. **Ritmo padrão `gap-6`** (§8 decisão 5): 24px entre blocos de página.
4. **Separar tinta de área da tinta de texto fica ADIADA** (§8 decisão 3): os
   `--grafico-<familia>` nascem como apelido de `--selo-<familia>-texto`, sem mudar nenhuma cor.
   Abra item novo em `docs/DIVIDA-TECNICA.md` com os dois números medidos (`#06b6d4` a 2,43:1 e
   `#6d28d9` a 2,52:1 — confirme-os rodando `npm run contraste`).
   A decisão 4 do plano (os cinco `--chart-N` órfãos) é matéria da frente b: deixe pendente e diga
   isso no relatório.

# Git e segurança
- Trabalhe na branch `f40-design-system`, com commits pequenos e frequentes, em pt-BR, estilo
  conventional: `feat(f40): o casco de página e o cabeçalho único`.
- Ao final, com os quatro comandos verdes e o checklist autoverificado item a item: mergeie na
  `main` e faça push, incluindo a tag `v1.45.0` — é o fluxo do modo autônomo do repositório.
- **NUNCA:** `git push --force`, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de
  commit que não é seu, commitar `.env*` ou `node_modules`.
- **NUNCA** rode `npm run db:seed`, `npm run db:reset`, `npm run carga` ou qualquer migration.
  Esta ordem não toca no banco. As guardas de `scripts/env-guard.ts` recusariam produção, mas o
  ponto é outro: banco está fora do escopo.

# Como trabalhar
1. **Explorar em paralelo, com subagentes** (contexto principal fica limpo; cada um volta só com
   resumo): (a) revalidar a linha de base pelos comandos de §1.6 do plano; (b) mapear as 3 rotas de
   `/ativos` e todo `src/components/ativos/**` — o que cada arquivo desenha e o que vai virar
   componente de sistema; (c) ler os 6 arquivos de referência do repositório irmão e resumir os
   padrões, sem copiar dado; (d) extrair de `node_modules/tailwindcss/theme.css` os 36 valores
   oklch das 9 famílias × claro/escuro que os tokens de selo vão receber.
2. **Planejar:** escreva `docs/PLAN-F40.md` autossuficiente — arquivos e interfaces nomeados, o
   fora-de-escopo declarado, a verificação de ponta a ponta no fim. Ele sobrevive à compactação e
   vira o gabarito da revisão adversarial.
3. **Implementar em duas etapas, nesta ordem, cada uma com os quatro comandos verdes antes de
   seguir:** primeiro a FUNDAÇÃO inteira (componentes + tokens + medidor + os dois testes);
   depois o PILOTO (as 3 rotas). Não misture: se a fundação estiver errada, você descobre antes de
   ter migrado tela nenhuma.
4. **Verificar adversarialmente:** ao final, um subagente em CONTEXTO FRESCO revisa o diff contra
   `docs/PLAN-F40.md`, contra `§§3–4` do plano e contra os 10 critérios de aceitação. Instrução
   dele: apontar apenas lacunas de correção ou de requisitos declarados — não preferências de
   estilo. Corrija e re-revise até limpar. Se ele apontar que uma cor mudou, isso é bloqueante.

# Relatório final
Escreva `docs/RELATORIO-F40.md` em pt-BR, com EVIDÊNCIAS e não afirmações:
- o que mudou, por arquivo, e por quê;
- a tabela "cor por cor": par de paleta antigo × par de token novo × as duas razões medidas, para
  as 9 famílias nos 2 temas — é a prova do critério 2;
- a saída real e completa de `npm run lint`, `npm run test`, `npm run build` e `npm run contraste`;
- os números de `§7` do plano antes e depois (paleta crua, molduras à mão, `<h1>`, passos fora da
  escala, `text-[Npx]`, estados vazios), com os comandos que os produziram;
- o novo teto da catraca e quanto ele desceu;
- as decisões registradas em `docs/DECISOES.md` (aponte, não repita);
- os screenshots, ou a pendência com o motivo exato;
- pendências e o que fica para as frentes a, b, c e d;
- próximos passos sugeridos.

Termine a resposta final com um resumo de 5 linhas em pt-BR: o que entrou, os quatro comandos, o
que ficou pendente e a versão publicada.

# Idioma
Narrativa, plano, decisões, relatório e commits em pt-BR. Identificadores de domínio em português
sem acento (`ativo`, `movimentacao`, `filial`); utilitários e infra em inglês. Nomes de arquivo em
kebab-case, como o resto do repositório.
```

---

## Como executar

### Pré-voo (uma vez, antes de sair de perto)

```bash
cd C:\Users\yukig\ti-wap-inventory-control
git status                 # working tree limpo? você está na main atualizada?
npm run lint && npm run test && npm run build && npm run contraste
```

Os quatro precisam passar **hoje** — o prompt manda o agente comparar contra essa linha de base, e
suíte já vermelha faz ele perder tempo consertando o que não é dele.

**A decisão do banco, e ela é sua.** O `.env.local` aponta para produção. Se você quiser as fotos
(e elas são o único jeito de o agente provar que nada saiu do lugar), crie antes um `.env.ensaio`
com a URL e as chaves do projeto de ensaio (`sgmvldiizsrjbxzzpmhh`) e rode `npm run db:seed` contra
ele. Sem isso o agente segue e registra a pendência — ele está proibido de fotografar produção.

Trave o que não é para acontecer, em `.claude/settings.json` (a única garantia dura — `CLAUDE.md`
é contexto, não configuração):

```json
{
  "permissions": {
    "deny": [
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(git reset --hard*)",
      "Bash(git clean -fd*)",
      "Bash(npm run db:reset*)",
      "Bash(npm run db:seed*)",
      "Bash(npm run carga*)",
      "Bash(supabase db*)"
    ]
  }
}
```

Depois: `claude` interativo uma vez no diretório (aceita o diálogo de confiança do workspace — se
ficar pendente, a run trava), `claude --version` (o modo `auto` exige 2.1.83+) e `gh auth status`
se for abrir PR.

### Rodar

```bash
claude --model opus --permission-mode auto -n f40-design-system \
  --add-dir ../stefanini-ti-inventory-control
```

Cole o prompt inteiro e saia de perto. O `--add-dir` é o que dá ao agente acesso de leitura ao
repositório irmão — sem ele, a referência de código do prompt não existe e ele segue só pelo plano.

Modo `auto` porque a run precisa instalar dependência, rodar build e dar push; `dontAsk` exigiria
uma allowlist cobrindo exatamente tudo isso, e qualquer buraco vira negação no meio da noite.

Notebook que dorme mata a run: no Windows, plano de energia em "alto desempenho" com suspensão
desligada.

**Subir o rigor (recomendado).** Depois de colar o prompt, digite:

```
/goal npm run lint, npm run test, npm run build e npm run contraste passam os quatro, e nenhuma linha oklch pré-existente de globals.css foi alterada
```

Um avaliador separado re-checa essa condição a cada turno — é o que faz uma run desatendida
terminar certo sem você.

**Variante madrugada (headless).** Salve o prompt em `prompt-f40.txt` e:

```bash
nohup claude -p "$(cat prompt-f40.txt)" --model opus --permission-mode auto \
  --add-dir ../stefanini-ti-inventory-control \
  --output-format json > run-f40.json 2>&1 &
```

Guarde o `session_id` (`jq -r '.session_id' run-f40.json`) — é a única forma de retomar uma sessão
`-p`. Aviso honesto: em `-p`, bloqueios repetidos do classificador **abortam** a sessão, e esta run
pede push. A variante interativa acima é a mais segura.

Custo: run multiagente gasta ~15× um chat comum. `export CLAUDE_CODE_SUBAGENT_MODEL=sonnet` antes
do comando deixa os exploradores num modelo mais barato e o Opus só no orquestrador.

### Acompanhar e retomar

`claude --resume f40-design-system` (a sessão sobrevive a queda de terminal — a transcrição é
salva continuamente). Sessão inchada ao retomar: `/compact foque nos arquivos alterados e nos
comandos de verificação`.

### Ao voltar

1. Leia `docs/RELATORIO-F40.md` e confira as **evidências** — as saídas reais, não as afirmações.
   O item que decide tudo é a tabela "cor por cor": as razões novas têm de bater com as antigas.
2. `git log --oneline main~10..main` e `git diff v1.44.2..v1.45.0 -- src/app/globals.css` — este
   segundo é o que prova o critério 3 com os seus olhos.
3. Rode você mesmo `npm run contraste` e abra as 3 telas de `/ativos` nos dois temas.
4. Veio errado? **Regra dos 2 strikes:** depois de duas correções que não resolveram, não emende —
   sessão limpa com prompt melhor supera sessão longa com correções empilhadas.

---

## Suposições que fiz

1. **Escopo:** só fundação + piloto `/ativos`. As frentes a, b, c e d viram ordens próprias, cada
   uma com a sua versão PATCH (regra 8).
2. **Destino:** branch `f40-design-system`, merge na `main` e push pelo próprio agente — o fluxo
   autônomo que o `CLAUDE.md` autoriza desde 09/07/2026. Isso dispara deploy na Vercel: se preferir
   revisar antes, troque a seção "Git e segurança" para parar na branch.
3. **Playwright aprovado** por você em 30/08/2026, e o prompt manda o agente registrar a aprovação.
4. **Versão 1.45.0** (MINOR, porque é fase `F40`), partindo de 1.44.2.
5. **`CascoDeAutenticacao` é criado e não é aplicado** nesta ordem — as 4 telas de entrada são da
   frente d. Se preferir que as portas ganhem `<h1>` já agora (é a correção de acessibilidade mais
   barata do plano), mova-as para o "Dentro" do escopo.
6. **O repositório irmão está em `../stefanini-ti-inventory-control`** e é acessível por `--add-dir`.
7. **As fotos dependem de um banco de ensaio que você prepare no pré-voo.** Sem ele o agente segue
   sem screenshots — por proibição da regra 2, não por falha.

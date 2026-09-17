# F61 — Os pontos de injeção da UI

Ordem de serviço da fase **F61** do `PLANO-MULTIEMPRESA.md` (§5, Bloco D) — a **última fase de preparação**. Fase **só
de código**, sem migration e sem banco: criar, sem refatorar nada grande, os lugares onde "a empresa" vai entrar na
interface — a sigla, o nome do sistema e o crédito saindo de um ponto só; a Marca e o cromo escuro com tokens pareados;
`components/admin/` e `components/relatorios/` sob a régua de layout —, e fechar as correções pequenas que a virada
tornaria caras: o verde de sucesso sem token, a confirmação digitada muda, o diálogo que semeia do render velho, o filtro
que perde clique e a chave de storage literal. Com duas condições que não se negociam: **nenhum número muda**, e **nenhum
pixel muda fora da tabela de mudanças de propósito**.

O plano a põe no fim da preparação por escolha explícita (§8, item 6): *"cortar tudo deixa `Marca` com `text-black` fixo
e `WAP` no JSX, e deixa `components/admin/` e `components/relatorios/` isentos da régua **por construção** — os dois
diretórios onde a UI de tenant vai nascer e onde vive a superfície do visualizador"*. É a primeira da ordem de corte (§9)
— *"dói na F70, mas é dor de esforço, não de correção"* —, e a F70 a consome pelo nome: *"`Marca` recebendo
nome/sigla/cor por empresa (os pontos de injeção estão prontos desde a F61); metadata de `src/app/layout.tsx` derivado;
`credito-autor.tsx` respeitando a configuração por empresa"*. Depois dela vem a fronteira (§6): da F62 em diante, cada
fase acrescenta estrutura que só o multiempresa usa.

---

## Estado de partida — os 28 fatos medidos no disco e no git (17/09/2026)

> O prompt cita estes fatos **pelo número**. Foram medidos hoje contra a árvore de trabalho e o git, por leitura — os
> números de régua, paleta e superfície saíram do PRÓPRIO código dos testes rodado fora do repositório, não de grep à
> mão —, e **não** copiados da ficha, que é de 04/09 (v1.49.1), anterior às F45→F60. Onde divergem dela, a divergência
> está marcada com ⚠. Não houve banco nem CI nesta medição (a fase não os usa): o `/api/saude` e o estado dos checks, o
> pré-voo confere. O prompt manda o agente **remedir antes de aceitar**.

**Onde o projeto parou**

1. `main` em **`4cf8016`** (merge do PR #53, `f60-docs-fecho`), com a tag anotada **`v1.65.0`** nesse commit;
   `package.json` em `1.65.0`. Última migration **`0145_drop_rel_filial.sql`** (144 arquivos; a `0029` é gap real). A F60
   fechou com **228 arquivos e 6.432 testes**. Fora do git: `Claude outputs/F60-…md` e esta ordem. **Esta fase não tem
   migration** (§11: *"F61 · código"*). Versão da fase: **`1.66.0`**. Os checks obrigatórios da `main` são os jobs
   **`verificar`** e **`banco-sem-docker`** de `.github/workflows/ci.yml` (F45); o `verificar` roda lint, `npm run test`,
   `npm run typecheck`, **`npm run contraste`** e `npm run build`.

**A régua de layout**

2. **A régua é `src/lib/layout/consistencia.test.ts`** (com `regua-de-classes.ts` e `texto-fonte.ts`). Varre os `.tsx` de
   `src/app` e `src/components`, sem `components/ui/` e sem `*.test.tsx`, com comentários apagados, e reprova: **R1** `<h1`
   à mão; **R2** largura (`mx-auto` + `max-w-*`, `max-w-*` fora de {xs, sm, md, full, none, fit, min, max} fora de portal,
   `style` com `maxWidth`); **R3/4** espaçamento fora de `ESCALA` {0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, auto, px};
   **R4b** `p-*` com `py-0`/`px-0` no mesmo grupo; **R5** `text-[Npx]` e `w-/min-w-/max-w-[Npx]`; **R6** moldura à mão
   (`rounded-*` com `border` cru; `border-dashed` e `rounded-full` passam); **R7** rota migrada sem `<Pagina>`/
   `<CabecalhoDaPagina>`; **R8** largura do `loading.tsx` diferente da tela. R1, R2 e R6 poupam os 7 arquivos de
   `SISTEMA`. A isenção é `PENDENTES` (`:77-124`): **32 entradas** — 15 prefixos e 17 arquivos, agrupados por FRENTE do
   sistema de design (a · acervo; **b · relatórios**; **c · admin**; d · dev, ajuda, versões, telas públicas e casca;
   mais `nova-compra-form.tsx` por decisão). O teste de prefixo é `p.endsWith('/') ? arquivo.startsWith(p) : arquivo ===
   p` — em **`:132`**, ⚠ não `:130`. `SOB_REGRA` já existe (`:161`), **sem catraca**; o motivo está escrito por frente, e
   por entrada só em `nova-compra-form`. A prova da isenção por construção: `admin/filial-apelidos.tsx` nasceu em 11/09
   (F56) com duas molduras à mão, e o CI ficou verde.
3. **O tamanho, medido com o código do próprio teste** (cópia fora do repositório, só `vitest` trocado por um shim e
   `RAIZ` apontada; controle: 509/509 verdes e `SOB_REGRA` = 77 de 251 sem mudança; depois, só as linhas dos dois
   prefixos removidas): **45 de 77 arquivos reprovam, com 113 violações** — ⚠ a ficha, no commit do plano, contou 44 e
   109.
   - `components/admin/`: 35 `.tsx` varridos, **21 reprovam, 58 violações** — moldura 41 (19 arquivos), escala 15 (9),
     largura 1, px 1. **`importar/importar-wizard.tsx` e `importar/grupos-erros.tsx` têm 26 das 58.**
   - `components/relatorios/`: 42 `.tsx` varridos, **24 reprovam, 55 violações** — px 24 (14 arquivos), escala 18 (9),
     moldura 11 (10), largura 2. Inclui `acesso-form.tsx`, que é porta de autenticação (frente d) morando em
     `relatorios/`.
   - Com os dois prefixos fora, `SOB_REGRA` vai de **77 para 154**. R1, R4b, R7 e R8 não pegam nada nos dois diretórios.
4. **A direção da conversão já foi decidida, e ela muda pixel.** `docs/PLANO-DESIGN-SYSTEM.md`, na tabela de tipografia:
   *"Salto: 24 → 16 → 14 → 12. **Os 49 `text-[10px]`/`[11px]`/`[13px]` caem para `text-xs` (12px).**"*; §3.8 *"Uma
   moldura só: `Card`"* (frame denso: `<Card size="sm">`); e os componentes de sistema que já existem —
   `layout/quadro-de-tabela.tsx` (o `Card` sem respiro, com `border ring-0 bg-transparent py-0` **para não repintar**),
   `layout/estado-vazio.tsx`, `layout/aviso.tsx`, `layout/cartao-de-metrica.tsx`. O que não sai sem mudar a tela: os 24
   `text-[10|11|13px]` (só saem mudando o tamanho); o `Card` é `rounded-xl` e as molduras de tabela à mão são `-lg`/`-md`;
   caixa âmbar à mão vira `<Aviso>` com outra tinta; **`Aviso` não tem intenção de sucesso** (`aviso.tsx:52`); e as 3
   violações de largura são de célula (`max-w-40 truncate`, `max-w-[220px]`, `max-w-[45%]`).
5. **As ROTAS continuam isentas.** `src/app/(app)/admin/` e `src/app/(app)/relatorios/` são entradas separadas de
   `PENDENTES`, e destravá-las soma 12 arquivos, 13 rotas sem casco (R7) e 3 esqueletos — é o casco das frentes b e c,
   não esta fase. Quatro dos doze verdes do fato 15 moram nessas páginas.
6. **A catraca que a ficha pede tem dois furos.** "`SOB_REGRA.length` que só cresce" reprova APAGAR um arquivo que está
   sob a régua (falso vermelho) e não enxerga arquivo NOVO nos prefixos que continuam isentos.

**A marca, o nome do sistema e o crédito**

7. **`src/components/layout/marca.tsx`** (sem `'use client'`): props `label = 'Estoque TI'`, `size`, `labelClassName` —
   não há `sigla` nem `className` na raiz. O chip é `cn('rounded bg-brand-amarelo px-2 py-1 font-bold tracking-tight
   text-black', …)` em **`:23`** e o texto `WAP` literal em **`:27`** (conferem com a ficha); o rótulo não tem cor própria
   e herda a do pai. **8 chamadas em 7 arquivos**: `app-header.tsx:110` (sobre o header `bg-brand-dark text-white`,
   `:63`) e `:78` (dentro do `SheetTitle` do menu do celular, `bg-popover` — **a única sobre superfície que acompanha o
   tema**); `viewer-header.tsx:51` (`label="Estoque TI · Relatórios"`, sobre o header escuro); `login/page.tsx:99`,
   `auth/confirm/page.tsx:41`, `auth/definir-senha/page.tsx:35` e `relatorios/acesso-form.tsx:28` (`size="lg"
   labelClassName="text-white"` sobre `div.bg-brand-dark`); e `casco-de-autenticacao.tsx:56`, **componente sem nenhum
   consumidor**.
8. **O cromo escuro.** `text-white` em `src/` fora de teste: **18** (inclui 5 `hover:text-white` e 1 comentário em
   `marca.tsx:7`), mais **8** `text-white/NN`. `bg-brand-dark` em **7 arquivos** (`auth/confirm:40`,
   `auth/definir-senha:34`, `login:98`, `app-header:63`, `casco-de-autenticacao:55`, `viewer-header:42`,
   `acesso-form:27`), e em todos eles todo `text-white` está dentro desse fundo. ⚠ **Um oitavo**: `viewer-nav.tsx:103-104`
   não tem `bg-brand-dark` no arquivo (só `ring-offset-brand-dark`, `:101`), mas só é renderizado dentro do header escuro
   (`viewer-header.tsx:54`) — a regra "só os 7" o deixaria de fora. Nenhum `text-white` fora do cromo escuro. Tokens em
   `globals.css`: `--brand-amarelo #eda100` (`:147`), `--brand-dark #111110` (`:148`), `--brand-azul` (`:149`), só em
   `:root`, apelidos `--color-brand-*` em `:40-42`; o bloco `.dark` não os redefine; **não existe** token de texto sobre
   marca. `text-black` sobre o amarelo aparece em **5** lugares: `marca:23`, `app-header:164`, `user-menu:99`,
   `gerar-relatorio-dialog:151`, `importar-wizard:185`. ⚠ E **`bg-brand-dark` é marcador do smoke**:
   `scripts/smoke/smoke-prod.mjs:186` (`MARCADORES_LOGIN = ['bg-brand-dark', 'max-w-sm']`) confere o HTML do `/login` de
   produção, e o `saude.yml` roda essa parte (`--sem-sessao`) quatro vezes por dia (`17 3,9,15,21 * * *`), abrindo issue
   de alarme quando ela falha.
9. **O nome do sistema tem duas grafias e seis endereços.** `src/app/layout.tsx:20-26`: `title: { default: 'Estoque TI ·
   WAP', template: '%s · Estoque TI WAP' }`, `description: 'Controle de ativos de TI da WAP'`. Mais `src/app/not-found.tsx:25`
   (`'Página não encontrada · Estoque TI WAP'`), `(app)/versoes/page.tsx:19` (description) e `:116` (texto visível
   `Estoque TI WAP · v…`), `(app)/ajuda/page.tsx:16` (`'Documentação do operador do Estoque TI WAP.'`),
   `auth/confirm/page.tsx:42` (`Acesso ao Estoque TI`), o `label` padrão da `Marca` e o de `viewer-header.tsx:51`. O
   conteúdo de ajuda cita a marca (`lib/ajuda/conteudo/mapa-das-telas.ts:80`, *"A marca 'WAP · Estoque TI'"*;
   `acesso-e-sessoes.ts:160`). Nenhum teste confere título, template ou `Marca`.
10. **Os "WAP" visíveis que NÃO são o nome do sistema.** Pelo critério de AST de `src/lib/import/sem-wapismo.test.ts`
    (F56: só literais — `StringLiteral`, template, `JsxText` —, nunca comentário nem identificador), `src/**` tem **44
    literais em 30 arquivos** (63 em 41 contando as allowlists dela). Os que falam da EMPRESA: `relatorios/acesso-form.tsx:53`
    (*"É operador da WAP?"*) e `:59` (*"Peça à TI da WAP."*), `login/page.tsx:63` (placeholder `voce@wap.ind.br`),
    `relatorios/kpi-tiles.tsx:59` (*"posse WAP"*), entre outros; em `components/layout/**` o único visível é `marca:27` (o
    resto são nomes internos: keyframes `wap-barra-*`, a chave `wap-sidebar`). Hoje a `sem-wapismo` proíbe em `src/**` só
    os cinco nomes de filial, e a palavra WAP só em `lib/import/**` e `components/admin/importar/**`; a allowlist dela é
    nominal e cobre o histórico de `versoes/registry.ts` e toda a ajuda.
11. **O crédito de autoria.** `src/components/layout/credito-autor.tsx`: `const AUTOR = 'vmatusita'` (`:19`) e `const
    SITE_AUTOR = 'https://www.vmatusita.com.br'` (`:20`), sem export; props `variante?: 'longa' | 'curta'` e `className?`;
    link `target="_blank" rel="noopener noreferrer"` com `aria-label`. ⚠ **Quatro chamadas, não três**: `login/page.tsx:115`
    (sem condição), `rodape-sidebar.tsx:75` (`variante="curta"`, renderizado DUAS vezes — `sidebar-lateral.tsx:62` no
    computador e `app-header.tsx:95` no celular), `(app)/versoes/page.tsx:117`, e uma parada em
    `casco-de-autenticacao.tsx:80` atrás de `creditoAutor?: boolean` — o único liga/desliga que existe, num componente sem
    consumidor. Nenhuma variável de ambiente, nenhuma configuração, nenhum teste.
12. **Não existe configuração de instância — e dois vizinhos que NÃO são ela.** Não há `src/lib/config`, `instancia`,
    `tenant` nem `NEXT_PUBLIC_EMPRESA`; o `.env.example` só tem `NEXT_PUBLIC_SUPABASE_URL` e `…_ANON_KEY` públicas.
    `src/lib/escopo/pertencimento.ts:36-48` define `ESCOPO_UNICO = { empresa: 'wap' }` e diz, em `:44-46`, *"não é uma
    configuração e não deve virar uma… Na F62 ele sai"*. `src/lib/escopo/chave.ts` é a chave de escopo (fato 24). A
    maioria dos consumidores da marca e do crédito é Client Component (`login/page`, `app-header`, `viewer-header`,
    `acesso-form`, `rodape-sidebar`, `sidebar-lateral`); `scripts/env-exemplo.test.ts` reprova `process.env.X` fora do
    `.env.example`; `src/components/relatorios/fronteira-rsc.test.ts` barra valor importado de módulo cliente. E
    `marca.tsx` está na superfície do visualizador por senha (fato 25).
13. **O contraste é medido por NOME.** `scripts/contraste.mjs` roda no CI e mede pares fixos — `:342` preto sobre
    `brand-amarelo`, `:343` branco sobre `brand-dark`, `:346-350` branco a 70% e 80% e a tecla de atalho —, e o leitor só
    entende valor LITERAL (hex de 6 dígitos, `oklch`, `white`/`black`) dentro de `:root` e `.dark`. Token novo escrito
    como `var(--x)` ou declarado só no `@theme` quebra com "cor desconhecida"; par que continua apontando o token velho
    mede o par velho.

**O verde e a paleta crua**

14. **`src/lib/dominio/cores.test.ts`** conta `(bg|text|border|ring|fill|stroke)-<22 famílias>-<50…950>` em todo
    `.ts`/`.tsx` de `src/`, sem comentários (entram os `.test.ts`, ficam fora os `.test.tsx`; não enxerga `accent-*` nem
    cor em CSS). Reprova se o total passar do teto **e** se descer 6 ou mais sem baixar o teto (`:197-218`); o número de
    arquivos tem de bater exato. **`TETO_PALETA_CRUA = 473` (`:82`), `ARQUIVOS_COM_PALETA = 61` (`:83`)** — recontado hoje:
    473 em 61, parado desde a F42. Por cor: âmbar 293, verde 84, vermelho 50; `admin/` + `relatorios/` somam 112. "Regra
    absoluta" de tinta hoje só existe em `dominio.ts` (sem paleta nem hex, `:148-186`) e em `TINTA_DO_NUMERO`
    (`src/lib/itens/tinta.test.ts:18-23`).
15. **Os 12 sítios do verde de sucesso conferem** (o par `green-100`/`green-800` com `dark:` `green-950`/`green-300`):
    **7 selos "Ativo/Ativa" de cadastro** — `(app)/admin/filiais/page.tsx:80`, `kits/page.tsx:126`, `motivos/page.tsx:71`,
    `senhas/page.tsx:76`, `admin/colaboradores-tabela.tsx:156`, `admin/itens-tabela.tsx:147`,
    `admin/tipos-item-tabela.tsx:94` —; **3 círculos de sucesso** — `ativos/nova-compra-form.tsx:847`,
    `movimentacoes/devolucao-fornecedor-form.tsx:206`, `movimentacoes/nova/painel-sucesso.tsx:278` —; a pílula *"voltou em…"* de
    `relatorios/manutencao-casos.tsx:47`; e o trilho de `relatorios/medidor-minimo.tsx:22`. Os tokens já existem —
    `--selo-em-estoque`/`--selo-em-estoque-texto` em `globals.css:174-175` (claro, 6,45:1) e `:293-294` (escuro),
    apelidos em `:73-74` — com **valores idênticos** aos da paleta do Tailwind v4: trocar a classe pelo token não muda
    pixel. Tokenizar os 12 tira 46 ocorrências (473 → 427) e zera 7 arquivos (61 → 54) — antes da conversão da régua,
    que também mexe na conta.
16. **O resto do verde** (31 linhas, 94 ocorrências, 23 arquivos no total): texto ou ícone de "ok" (`grupos-erros.tsx:237,852`,
    `importar-wizard.tsx:101,680,1056`, `ativos/termos-da-ficha.tsx:142`, `dev/integridade-painel.tsx:45`, `movimentacoes/nova/painel-sucesso.tsx:79`,
    `movimentacoes/nova/passo-movimentacao.tsx:344`, `lib/relatorios/delta-kpi.ts:53`), caixas verdes (`importar-wizard.tsx:679`,
    `testar-senha-dialog.tsx:103`), `emerald-` (`itens/conferencia/conferencia-estoque.tsx:468,566`, `movimentacoes/nova/checklist-faltantes.tsx:303`), o ponto
    "ao vivo" (`realtime-refresh.tsx:87-88`) e `lib/relatorios/legendas.ts:52`, que diz espelhar `manutencao-casos` mas usa
    `dark:green-900`. `lime-`/`teal-`: nenhum.
17. **`src/components/ui/badge.tsx`**: variantes `default`, `secondary`, `destructive`, **`warning`** (`:17-18`,
    `bg-warning/10 text-warning` — adição do projeto na F7F, ata em `DECISOES.md:801`), `outline`, `ghost`, `link`; não há
    `sucesso` nem `--success`. ⚠ O molde do `warning` é UM token com opacidade: um `sucesso` copiado dele pede token novo e
    **repinta**; o par `selo-em-estoque` não repinta. Os selos da casa são sempre classe literal de token
    (`STATUS_META.badge` em `<Badge variant="outline">`, `ativos/status-badge.tsx:16-18`; `pillTipo*` em `dominio.ts` e
    `lib/itens/tinta.ts:63-68`). `components/ui/` "não se edita sem motivo documentado" (`CLAUDE.md`, Convenções).
18. **`medidor-minimo.tsx` tem DUAS linhas verdes**, não uma: o trilho (`:22`) e o preenchimento (**`:27`**,
    `green-600`/`dark:green-500`). O verde ali marca FOLGA (estoque bem acima do mínimo), não "em estoque" — a ficha já
    avisa que mapeá-lo para `--selo-em-estoque` é escrever o token errado. Nenhum token cobre o `:27`:
    `--grafico-em-estoque` é `#16a34a` fixo nos dois temas, diferente do `green-600` do v4.
19. **A regra de tinta derivada dos comentários do CSS erraria feio.** ⚠ O selo âmbar JÁ existe: `--selo-em-manutencao` =
    `amber-100`/`amber-800` (`globals.css:184-185`) e `amber-950`/`amber-300` (`:303-304`). Derivar a proibição dos
    comentários do CSS dá hoje **36 tons** e proibiria **204 dos 473 usos**, 136 deles âmbar — os callouts legítimos. (O
    "302" da ficha fica perto do grep cru de `amber-N` em `.tsx`, 301; pela catraca, âmbar é 293.)

**A confirmação digitada**

20. **`src/components/layout/confirmacao-digitada.tsx`** (F40, 87 linhas): `rotulo`, `esperado`, `valor`, `confere`,
    `onChange`, `onEnter?`, `desabilitado?`, `id?`; `useId`, `aria-invalid={!!dica}`, `aria-describedby` só com dica, dica
    em `<p role="alert">` a partir de `dicaConfirmacaoNaoConfere` (`src/lib/validators/confirmacao-digitada.ts:57`). **Zero
    consumidores** (só o próprio teste e a lista `SISTEMA` da régua). Não tem `mono` nem `spellCheck`. O comentário de
    `:28-30` diz que o import exige igualdade exata — ⚠ falso desde a F52.
21. **As quatro confirmações digitadas do sistema:**

    | tela | trecho | `aria-invalid` + `describedby` | dica `role=alert` | mono | `spellCheck={false}` |
    |---|---|---|---|---|---|
    | mesa de conflitos | `pendencias/mesa-conflitos.tsx:539-551` | **não** | **não** | sim | sim |
    | "Substituir tudo" do import | `admin/importar/importar-wizard.tsx:1002-1023` | sim | sim | só no `Label` | não |
    | apagar conta | `admin/usuarios/apagar-usuario-dialog.tsx:122-151` (Enter executa, `:142`) | sim | sim | não | não |
    | Zona destrutiva | `dev/destrutivo/dialogo-destrutivo.tsx:144-163`, 6 chamadas (`painel-ativo.tsx:297,331,357`, `painel-itens.tsx:96,127`, `painel-reset.tsx:185`) | sim | sim | sim | sim |

    O texto esperado da mesa é GERADO: `textoConfirmacaoConflito(ids.length)` (`:392`) → `APAGAR ${quantos}`
    (`validators/conflitos.ts:74`). ⚠ `dicaConfirmacaoNaoConfere` já é importada por **três** arquivos fora de
    `components/layout/` (o wizard, o apagar conta e o diálogo destrutivo): a trava da ficha *"só importável de
    `components/layout/`"* **reprovaria hoje**, e migrar só a mesa não basta. ⚠ E a mesa não é *"o único lugar fora de
    `/dev` onde se apaga cadastro de ativo"*: o "Substituir tudo" também apaga (`0140`). É a única que apaga cadastro
    escolhido um a um — e a única muda.

**Os diálogos**

22. **26 `*-dialog.tsx` em `src/components/**`, nenhum hook `use-dialogo*`.** Semeiam certo, NA ABERTURA:
    `admin/tipo-item-dialog.tsx:50-67` (o `mudarAberto` e o comentário que explica — *"`salvar()` chama
    `mudarAberto(false)` ANTES de o `router.refresh()` trazer os dados novos, então o reset copiava a prop do render
    VELHO"*), ⚠ `admin/colaborador-dialog.tsx:66-85` (cópia idêntica, mesmo commit, que a ficha não cita),
    `admin/usuarios/editar-usuario-dialog.tsx:105-112`, e `ativos/editar-ativo-dialog.tsx:89-101` (react-hook-form com
    `values`, sincroniza sozinho). Usam `onOpenChange={setAberto}` direto com estado semeado de prop:
    `admin/filial-dialog.tsx:153`, `admin/kit-dialog.tsx:191`, `admin/motivo-dialog.tsx:103` (os três nomes da ficha) e,
    ⚠ fora do admin, `relatorios/gerar-relatorio-dialog.tsx:64-67,146`. `admin/item-dialog.tsx:64-67` tem handler mas não
    re-semeia (uma varredura por `setAberto` não o pega). `itens/lancar-item-dialog.tsx:492` mantém o estado DE PROPÓSITO
    (`:478-491`). ⚠ A conta da ficha: são 6 CRUD de catálogo no admin, não 5, e 4 com o defeito. **E um defeito vizinho:**
    criar não limpa o formulário — filial, motivo e item abrem o "Novo" seguinte preenchidos com o anterior;
    `kit-dialog.tsx:178-180` documenta exatamente isso e é o único que limpa.

**Os filtros de URL**

23. **`src/components/itens/url-filtros.ts`** (F9, 39 linhas, `'use client'` na `:1`): `let pendente` (`:20`),
    `baseFiltrosItens(urlCommitada)`, `registrarFiltrosEnviados`, `resetarFiltrosPendentes` (só teste). Importado por
    `itens/itens-filtros.tsx:18` e `itens/historico-filtros.tsx:25`. ⚠ Perdem o fix **dois** filtros, não três:
    `ativos/ativos-filtros.tsx:76,124` (`params.toString()`) e `:92` (`window.location.search`, que o próprio
    `url-filtros.ts:6-9` diz ser igualmente atrasado); `pendencias/pendencias-filtros.tsx:56,69`.
    `movimentacoes/lista-filtros.tsx:112-139` reimplementa **com** o fix, numa cópia em `useRef`. Outros montam a URL pela
    versão confirmada (`admin/usuarios/auditoria-filtro.tsx:28`, `dev/auditoria-filtro-dev.tsx:56`,
    `relatorios/gerados-filtro.tsx:34`, `relatorios/periodo-filtro.tsx:52,61`, `ativos/ativos-table.tsx:211`,
    `relatorios/barras-horizontais.tsx:79`, `ativos/ativos-paginacao.tsx:73,94` — a paginação serve 8 páginas).
    `src/components/filtros/` **não existe**. ⚠ O `CLAUDE.md:154-159` registra o custo de `checklist-lote.ts` como a
    fronteira `'use client'` (*"um `'use client'` lá tornaria a função `undefined` na Server Action, com o build verde"*),
    não o estado de módulo — o argumento de não ir para `src/lib/` continua de pé (não há módulo `'use client'` em
    `src/lib/`). ⚠ **Um vazamento latente, pela leitura**: a justificativa de `url-filtros.ts:12-13` (os dois blocos de
    `/itens` empurram para a mesma URL) caducou quando o histórico ganhou rota própria (F42), e `pendente` compara só a
    QUERY, não o caminho — um `filial=2` aplicado em `/itens` a partir de URL limpa pode vazar para `/itens/historico` no
    primeiro filtro de lá, porque o link não leva query (`itens/page.tsx:290`). Não foi executado.

**As chaves de storage**

24. **`src/lib/escopo/chave.ts`** (F50): `chaveDoEscopo()` → `'wap'`; `nomeDoCanal(base)` (consumido só por
    `relatorios/realtime-refresh.tsx:60`) e **`chaveDeStorage(base)` → `` `wap:${base}` ``, ainda sem consumidor**, com o
    cabeçalho nomeando a F61 e o motivo de devolver a chave IDÊNTICA à literal de hoje (*"Um prefixo diferente faria todo
    rascunho e toda preferência salva sumirem no primeiro deploy"*). `src/lib/relatorios/assinatura-realtime.test.ts:84-89`
    afirma seis composições e ⚠ esquece `itens:conferencia`. As chaves:

    | chave | storage | guarda | onde |
    |---|---|---|---|
    | `wap:compra:defaults` | **local** | `{categoria, filialId}` | `ativos/nova-compra-form.tsx:58,456,793` |
    | `wap:compra:rascunho` | session | rascunho da compra | `ativos/rascunho-compra.ts:23` |
    | `wap:mov:rascunho` | session | esqueleto do lote | `movimentacoes/nova/rascunho.ts:26` |
    | `wap:itens:conferencia:<filialId>` | session | contagens | `itens/conferencia/rascunho.ts:24,34` |
    | `wap:ativos:ultima-lista` | session | URL da lista | `ativos/lista-visitada.ts:16` |
    | `wap:ativos:recentes` | session | últimos ativos | `lib/ativos/ativos-recentes.ts:14` |
    | `wap:relatorios:ultimo` | session | slug do relatório | `relatorios/relatorio-visitado.ts:26` |
    | `wap-sidebar` (hífen) | local | recolhida/expandida | `layout/sidebar-preferencia.ts:15` (`CHAVE_SIDEBAR`), embutida no anti-flash `SCRIPT_SIDEBAR` (`(app)/layout.tsx:140`) e travada por `sidebar-preferencia.test.ts` |
    | `theme` | local | tema | `layout/theme-provider.tsx` (padrão do `next-themes`, sem `storageKey`) |

    ⚠ *"Prioridade nas 3 de `localStorage`"* é falso para as `wap:`: só **uma** das sete é `localStorage`; o "3" soma
    `wap-sidebar` e `theme` (a F50 já registrou, `DECISOES.md:9014`). Os dois `*-evento.ts`
    (`itens/lancar-item-evento.ts`, `itens/transferir-item-evento.ts`) são CustomEvent, não storage. `chaveDeStorage('sidebar')`
    daria `wap:sidebar` e apagaria a preferência já gravada.

**A superfície do visualizador**

25. **`src/components/relatorios/confinamento-viewer.test.ts`** (F50): 6 raízes (`:47-54` — as 3 rotas de relatório,
    `viewer-header`, `viewer-nav`, `nav-rolavel`), fecho transitivo dos imports estáticos dentro de `src/` (não enxerga
    import dinâmico), `href` literal que não comece por `/relatorios` ou `#` proibido em todo arquivo do fecho salvo
    `EXCECOES` com guarda de cargo, e `SUPERFICIE_MINIMA = 125` (`:79`) conferida com `>=` (`:305`). **O fecho hoje tem 155
    arquivos**; o comentário *"A folga é de NOVE"* (`:71`) caducou — a folga é 30, e uma queda de até 30 passa verde. Já há
    componente de `layout/` na superfície antes da F61 (`layout/aviso.tsx`, via `relatorios/aviso-teto-tabela.tsx:2`,
    F60), e `marca.tsx` também. Converter `relatorios/` para `Card`/`QuadroDeTabela`/`Aviso` põe mais `layout/` nela.

**A prova visual**

26. **`scripts/design/capturar.mjs` não pode ser o instrumento.** Ele sobe o próprio `next dev` com o `--env` indicado e
    só recusa o ref de PRODUÇÃO (`REF_PRODUCAO`, `:70`) — mas: não existe `.env.ensaio`; **desde a F55 o `.env.local`
    aponta para o ENSAIO** (`INVENTARIO-CREDENCIAIS.md` §2); e **o ensaio guarda uma cópia dos dados reais do go-live**
    (ata F13 de 23/07; a ata da F55, de 10/09, registra que *"o ensaio tem 1.602 ativos"* e por isso o seed recusaria rodar). ⚠ A ata da F31
    (09/08) chama o ensaio de *"100% fictício"* — contrariada pelas duas. O script fotografaria dado real sem recusar nada,
    cobre só `/ativos` e `/itens`, e nunca produziu uma foto (as atas F40 de 30/08 e F42 de 31/08 registraram a falta; F43 e F44 mudaram de
    caminho). **O caminho da casa é a PRÉVIA ESTÁTICA** da F43/F44: `scripts/design/previa-itens.tsx` e `previa-ficha.tsx`
    renderizam o COMPONENTE REAL com dados 100% fictícios (`previa-*-dados.ts`) por `renderToStaticMarkup`, com o CSS do
    PRÓPRIO `src/app/globals.css` compilado pelo `@tailwindcss/postcss`, e fotografam com o Playwright (devDependency
    aprovada em 30/08) a 1440×900 e 390×844, claro e escuro; `--so-html` grava só o HTML; `--tsconfig
    scripts/design/tsconfig.previa.json` troca `server-only` por `vazio-servidor.ts`. O cabeçalho de `previa-itens.tsx`
    separa o que é REAL do que é DUBLÊ (o cabeçalho e a barra lateral do app, com as mesmas medidas) e avisa: a fonte
    Geist não existe na foto (cai no `system-ui`).
27. **O rig de componente é grau 1** (`vitest.config.mts`, projeto `componentes`, F45): `renderToStaticMarkup` em ambiente
    `node`, **sem jsdom nem Testing Library** (grau 2 é proposta pós-piloto, §9). Afirma o HTML que o servidor produz —
    papel ARIA, `id` de `aria-describedby` —, não interação: abrir e fechar diálogo não se prova por render. Hoje há **5**
    `.test.tsx` (`admin/filial-apelidos`, `layout/aviso`, `layout/confirmacao-digitada`, `layout/pagina`,
    `relatorios/aviso-teto-tabela`).

**O fechamento**

28. Regras que pesam aqui (`CLAUDE.md`): **1** (escopo), **2** (nunca dado real — nem em foto, nem em HTML de prévia), **3**
    (R$ 0, stack fechada: nada de jsdom, Testing Library ou lib de tema), **6** (documentação oficial antes de afirmar:
    `metadata` e `not-found` do Next 16 e a doc local em `node_modules/next/dist/docs/` — `AGENTS.md` —, tokens e
    modificador de opacidade do Tailwind v4, o `Badge`/`cva` do shadcn, `next-themes`, WAI-ARIA para `aria-invalid`/
    `aria-describedby`/`role="alert"`), **7** e **8** (fechamento e versionamento: `registry.test.ts` recusa divergência com
    o `package.json`, `cobertura-changelog.test.ts` derruba a suíte com entrada sem versão, e há teste que recusa
    vocabulário de desenvolvedor nas `mudancas`). O molde de fechamento das F57→F60: um PR de código, merge com os dois
    checks verdes, conferência pós-deploy, e um PR só de documentação que leva a tag.

---

## As três decisões do Johnny (17/09/2026)

1. **Converter os 45 arquivos agora.** `components/admin/` e `components/relatorios/` saem da isenção por prefixo, e os 45
   culpados de hoje (fato 3) são convertidos pela escala do `PLANO-DESIGN-SYSTEM` — texto de 10/11/13px para `text-xs`,
   espaçamento para a escala, moldura à mão para o componente de sistema —, com as mudanças visuais pequenas, listadas e
   fotografadas antes/depois pela prévia com dados fictícios. Sem F61B planejada.
2. **As quatro confirmações digitadas passam pelo mesmo componente.** A mesa de conflitos, o "Substituir tudo" do import,
   o apagar conta e a Zona destrutiva usam `ConfirmacaoDigitada`; a trava *"a dica só é importável de
   `components/layout/`"* nasce sem exceção.
3. **O nome do SISTEMA entra no ponto de injeção; as frases da EMPRESA não.** A 404, `/versoes`, `/ajuda` (e o que mais
   for o nome do sistema na interface — fato 9 —, fora o conteúdo de ajuda, que é documentação e é da F71) montam o nome
   pelo mesmo ponto do título da aba, com UMA grafia. As frases que falam da empresa (*"É operador da WAP?"*, o exemplo de
   e-mail do login, *"posse WAP"*… — fato 10) ficam como estão e saem listadas, arquivo a arquivo, como backlog nomeado da
   F70.

---

## As frentes, e por que nesta ordem

- **A — o censo, o instrumento e o "antes".** Antes de mudar qualquer coisa: os 28 fatos remedidos, as tabelas, a
  ferramenta de prova visual e as fotos e o HTML "antes". Um "depois" sem o "antes" do mesmo instrumento não prova nada.
- **B — a régua, vermelha.** Os dois prefixos saem de `PENDENTES` e a saída reprova os 45 pelo nome — é a primeira entrega
  da ficha (*"rodar o teste sem os dois prefixos é a primeira entrega"*) e a regra 4 do §4 (*"trava antes da correção"*).
- **C — a conversão dos 45 (decisão 1).** Em lotes por diretório e por regra, com a suíte entre eles, até a régua ficar
  verde — e cada mudança de pixel na tabela de mudanças de propósito.
- **D — os pontos de injeção (decisão 3).** A fonte única da sigla, do nome do sistema e do crédito; a `Marca` e o cromo
  escuro com tokens pareados e o contraste medindo os tokens novos; a trava dos literais.
- **E — as correções pequenas.** O verde de sucesso e a regra de tinta; as quatro confirmações (decisão 2); os diálogos
  semeados; os filtros de URL; as chaves de storage.
- **F — os testes de componente e os documentos.**
- **G — o fechamento.** Versão → "depois" → revisão adversarial → SHA congelado → CI verde → merge → deploy → conferência →
  relatório → PR de documentação → tag.

---
## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F61 do `docs/PLANO-MULTIEMPRESA.md` (§5, Bloco D), a última fase de preparação: criar os pontos de
injeção da UI e fechar as correções pequenas que a virada tornaria caras — sem mudar um número e sem mudar um pixel fora
da tabela de mudanças de propósito. Ao terminar: `src/components/admin/` e `src/components/relatorios/` estão sob a régua
de layout, sem isenção por prefixo, com os 45 arquivos de hoje convertidos pela escala do `PLANO-DESIGN-SYSTEM` e uma
catraca que enxerga arquivo novo e não reprova remoção legítima (decisão i); a sigla, o nome do sistema e o crédito de
autoria saem de UMA fonte com os valores de hoje, consumida pela `Marca`, pelo metadata de `src/app/layout.tsx`, pela
404, por `/versoes` e por `/ajuda`, com UMA grafia do nome, e o crédito é desligável (decisão iii); a `Marca` e o cromo
escuro usam tokens pareados que `scripts/contraste.mjs` mede; o verde de sucesso é token, com `<Badge
variant="sucesso">`, uma regra de tinta com lista de exceções nomeada, e `TETO_PALETA_CRUA` no número medido; as quatro
confirmações digitadas passam por `ConfirmacaoDigitada`, e a da mesa de conflitos anuncia o erro (decisão ii); os
diálogos que semeiam estado de prop usam `useDialogoSemeado`; os filtros de URL compartilham
`src/components/filtros/url.ts`; as sete chaves `wap:*` são construídas por `chaveDeStorage`, idênticas byte a byte; e
cada peça tem a trava que reprova a volta. A prova visual são as fotos e o HTML da prévia estática com dados fictícios,
antes × depois, e o diff de classes batendo com a tabela de mudanças de propósito. Uma run, um PR de código e um PR de
documentação com a tag. Versão `1.66.0`.

# Contexto

## Leia antes de escrever qualquer coisa
- `docs/PLANO-MULTIEMPRESA.md` — §1 (decisões 4, 5 e 7), §4 (as 10 regras comuns — em especial a 2, estado de repouso; a
  3, escopo fora explícito; a 4, trava antes da correção; a 6, fechamento; a 7, versionamento), §5 → a ficha **F61** (a
  FONTE DA VERDADE do escopo: onde esta ordem e ela divergirem sem declaração, vale a ficha — `docs/README.md`), a ficha
  **F70** (quem consome os pontos de injeção — o `contextoDoApp()` por request, a `Marca` por empresa, o crédito
  respeitando a configuração), o §6 (a FRONTEIRA), o §8 item 6 (por que esta fase existe), o §9 (o backlog PATCH: a
  régua nos outros prefixos, a máquina de rascunho; os recusados: react-hook-form, `<datalist>`) e o §10 item 3 (o
  crédito: a escolha do que exibir é do Johnny, depois).
- `docs/prompts/F61-pontos-de-injecao-da-ui-ultracode.md` — o cabeçalho com os **28 fatos medidos**. Este prompt os cita
  pelo número.
- `CLAUDE.md` e `AGENTS.md` — as regras permanentes, em especial a **1** (escopo), a **2** (nunca dado real), a **3** (R$ 0
  e stack fechada), a **6** (documentação oficial antes de afirmar comportamento: use o Context7 e a doc local do Next em
  `node_modules/next/dist/docs/`), a **7** e a **8** (fechamento e versionamento); em Convenções, `'use client'` só quando
  necessário e `components/ui/` que não se edita sem motivo documentado.
- `docs/PLANO-DESIGN-SYSTEM.md` — a tabela de tipografia (fato 4), §3.8 (*"Uma moldura só: `Card`"*), a tabela dos
  componentes de sistema (`QuadroDeTabela`, `EstadoVazio`, `Aviso`, `CartaoDeMetrica`), a escala de espaçamento e o §5 (as
  frentes b e c). É a régua da conversão.
- Em `docs/DECISOES.md`: as atas da F40 (o sistema de design; *"Nenhuma foto foi tirada"*, 30/08; o Playwright), da F7F (o
  `warning` no `Badge`, `:801`), da F42 e da F43/F44 (a prévia estática), da F45 (o rig grau 1), da F50 (a
  `chaveDoEscopo`; `:9014`, as chaves de storage), da F55 (o `.env.local` apontando para o ensaio) e da F56 (a
  `sem-wapismo`).
- `docs/MATRIZ-REGRAS.md` — as emendas F50 (R-ACC-42, o confinamento do visualizador) e F56 (o import sem WAP-ismo).
- `docs/RELATORIO-F43.md` §2 e `docs/RELATORIO-F44.md` §5.4 (a prévia, o que ela prova e o que só a foto mostrou),
  `docs/RELATORIO-F45.md` (o rig) e `docs/RELATORIO-F50.md` §11.3 (o backlog nomeado para esta fase).
- O código, nesta ordem: `src/lib/layout/consistencia.test.ts`, `regua-de-classes.ts`, `texto-fonte.ts`;
  `src/lib/dominio/cores.test.ts`; `src/app/globals.css`; `scripts/contraste.mjs`; `src/components/layout/marca.tsx`,
  `credito-autor.tsx`, `rodape-sidebar.tsx`, `app-header.tsx`, `viewer-header.tsx`, `viewer-nav.tsx`,
  `confirmacao-digitada.tsx` (e o teste), `quadro-de-tabela.tsx`, `aviso.tsx`, `estado-vazio.tsx`,
  `sidebar-preferencia.ts`; `src/components/ui/badge.tsx` e `card.tsx`; `src/app/layout.tsx`, `not-found.tsx`,
  `login/page.tsx`, `auth/**`, `(app)/versoes/page.tsx`, `(app)/ajuda/page.tsx`, `(app)/layout.tsx`;
  `src/lib/escopo/chave.ts` e `pertencimento.ts`; `src/lib/import/sem-wapismo.test.ts`;
  `src/lib/relatorios/assinatura-realtime.test.ts`; `src/components/relatorios/confinamento-viewer.test.ts` e
  `fronteira-rsc.test.ts`; `scripts/env-exemplo.test.ts`; `src/components/pendencias/mesa-conflitos.tsx`,
  `admin/importar/importar-wizard.tsx` (só o bloco da confirmação), `admin/usuarios/apagar-usuario-dialog.tsx`,
  `dev/destrutivo/dialogo-destrutivo.tsx`; os diálogos do fato 22; `src/components/itens/url-filtros.ts` e os filtros do
  fato 23; as chaves do fato 24; `scripts/design/previa-itens.tsx`, `previa-ficha.tsx`, `previa-*-dados.ts`,
  `tsconfig.previa.json`, `vazio-servidor.ts`, `medir-tabela.mjs` e `medir-acessibilidade.mjs`.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Vinte e oito fatos, medidos em 17/09/2026 no cabeçalho desta ordem. Remeça cada um contra o disco de hoje antes de agir;
onde a sua medição contrariar o número escrito, **a sua medição ganha**, desde que ela vá para o relatório. Os que mais
importam:
- **fato 3** — 45 arquivos e 113 violações; `importar-wizard` e `grupos-erros` concentram 26 das 58 do admin.
- **fato 4** — a direção da conversão já está escrita no `PLANO-DESIGN-SYSTEM`, e ela muda pixel.
- **fato 6** — a catraca pedida pela ficha tem dois furos.
- **fato 8** — o cromo escuro são oito arquivos, não sete.
- **fato 13** — o contraste mede por NOME e só lê valor literal.
- **fato 17** — o `sucesso` no molde do `warning` repinta.
- **fato 19** — a regra de tinta derivada do CSS proibiria 204 usos legítimos.
- **fato 21** — a trava da dica reprovaria hoje; três importadores fora de `layout/`.
- **fato 23** — só dois filtros perdem o fix, e há um vazamento latente entre `/itens` e `/itens/historico`.
- **fato 24** — só uma das sete chaves `wap:` é `localStorage`, e o teste de hoje esquece a da conferência.
- **fato 26** — `capturar.mjs` fotografaria dado real do ensaio; a prova é a prévia estática. Confira-o pelo §2 de
  `docs/INVENTARIO-CREDENCIAIS.md` (nomes e para onde apontam) — **nunca abrindo, filtrando ou imprimindo o `.env.local`**.

## Comandos que já existem — use, não reinvente
`npm run lint` · `npm run test` · `npx tsc --noEmit` · `npm run build` · `npm run contraste` · `npm run verificar:actions` ·
`npx tsx --tsconfig scripts/design/tsconfig.previa.json scripts/design/<previa>.tsx --saida <pasta> [--so-html]` ·
`node scripts/smoke/smoke-prod.mjs` (só na conferência pós-deploy, Frente G). **Não rode** `db:seed`, `db:reset`,
`db:types` nem `carga`; **não rode** `scripts/design/capturar.mjs`; **não suba** `next dev`/`next start` para fotografar,
medir ou colar saída — o `.env.local` aponta para o ensaio, que guarda cópia de dado real (fato 26). Nesta fase não há
Postgres nem MCP da Supabase: nada aqui lê ou escreve banco.

# Escopo

## Dentro — sete frentes, nesta ordem

### Frente A — o censo, o instrumento e o "antes"
O primeiro entregável é `docs/PLAN-F61.md` com o censo, antes do primeiro commit que toque `src/` (a única exceção é o
commit de instrumento em `scripts/design/`, abaixo); as fotos e o HTML "antes" entram nele antes do primeiro commit que
mude uma classe.
- **Os 28 fatos remedidos**, cada divergência contra a ficha anotada.
- **A tabela da régua**: os 45 arquivos × violação × regra × a conversão prevista (a classe de hoje → a classe ou o
  componente de sistema), com a regra de conversão por classe escrita UMA vez — o tamanho de texto (fato 4); o
  arredondamento do espaçamento fora da escala (para cima ou para baixo, e por quê — um critério, não um caso a caso);
  a moldura (qual à mão vira `Card`, `Card size="sm"`, `QuadroDeTabela`, `EstadoVazio` ou `Aviso`); a largura de célula.
- **A TABELA DE MUDANÇAS DE PROPÓSITO** — arquivo de fonte · o trecho antes → depois · efeito visível (**sim** — o que
  alguém enxerga — ou **não**, como a troca de nome de token com o mesmo valor) · a vitrine que o mostra (ou **sem
  vitrine**) · o motivo. É o gabarito do portão da Frente G: o diff de classes POR ARQUIVO DE FONTE e a tabela são o
  mesmo conjunto, e a comparação de pixel confirma a coluna "efeito visível".
- **O censo do nome**: os endereços do nome do sistema (fato 9), a grafia escolhida e onde cada um passa a ler a fonte; e
  **o censo das frases da EMPRESA** (fato 10) — arquivo:linha, o texto, a classe (frase da empresa · nome interno não
  visível · ajuda e histórico, fora por decisão) — que vira o backlog nomeado da F70 (decisão iii).
- **As tabelas das correções**: o verde (os 12 do fato 15 e os do fato 16, cada um com o SIGNIFICADO — sucesso, em
  estoque, cadastro ativo, folga, variação favorável, ao vivo — e o destino: token, exceção nomeada, ou fora); as quatro
  confirmações (fato 21) com o comportamento de hoje de cada uma (Enter, desabilitado, texto esperado, onde a validação
  mora); os 26 diálogos (fato 22) classificados; os filtros de URL (fato 23); as chaves de storage (fato 24).
- **O instrumento de prova visual, num commit só de `scripts/design/`** (a exceção acima): uma prévia estática no molde
  de `previa-itens.tsx` — COMPONENTES REAIS, dados 100% fictícios, CSS do `globals.css`, Playwright, 1440×900 e 390×844,
  claro e escuro, `--so-html` — com VITRINES que cubram o que a fase toca: o cromo (login com a `Marca` e o crédito, o
  cabeçalho do app e do visualizador, o rodapé da sidebar, `/versoes` no trecho do rodapé), os selos "Ativo" e uma tabela
  de `admin/`, um corpo de relatório com KPIs e tabelas de `relatorios/`, a `ConfirmacaoDigitada` com as props de cada
  uma das quatro confirmações (vazia, não confere, confere) e os formulários dos diálogos de filial, kit e motivo. Reuse o
  que as prévias da F43/F44 já têm (o dublê do casco, o dublê de `server-only`), diga no cabeçalho o que é REAL e o que é
  DUBLÊ, e grave junto um HTML normalizado por vitrine. ⚠ **O `renderToStaticMarkup` não monta conteúdo de `Dialog`** (o
  `Portal` do Radix não renderiza sem `document`), não digita, e não roda página `async` com sessão (`/versoes` chama
  `getOperador`): é permitido um dublê de `@/components/ui/dialog` pelos `paths` do `tsconfig.previa.json` que renderize o
  conteúdo em linha, SÓ na prévia; o estado "digitado" entra pelas props da `ConfirmacaoDigitada` (`valor`, `confere`); o
  trecho renderizável de uma página entra como componente; e o que não se alcança fica **sem vitrine**, declarado na
  tabela — nunca bundle de navegador, nunca servidor. Nenhum nome de pessoa, patrimônio ou filial real nos dados — os
  fictícios das prévias existentes servem.
- **O "antes"**: rode o instrumento sobre o código INTOCADO → `docs/f61-evidencias/antes/` (PNG + HTML) e as contagens de
  base (`npm run test` com arquivos e testes; `SOB_REGRA`; `TETO_PALETA_CRUA` e arquivos; a superfície do
  `confinamento-viewer`; os pares do `contraste`; os `.test.tsx`).
- **A documentação vigente**, pelo Context7 e pela doc local (regra 6): `metadata`/`generateMetadata`, `title.template`
  e o `not-found` do Next 16; tokens de cor no `@theme` do Tailwind v4 e o modificador de opacidade sobre variável; o
  `Badge` e o `cva` do shadcn; o `storageKey` do `next-themes`; `aria-invalid`, `aria-describedby` e `role="alert"`
  (WAI-ARIA). Registre no plano o que cada uma diz.

### Frente B — a régua, vermelha
- Tire `src/components/admin/` e `src/components/relatorios/` de `PENDENTES` e grave a saída VERMELHA nomeando os 45 como
  primeira evidência. Não empurre o vermelho sozinho: ele sobe junto com a conversão.
- **A catraca, sem os furos do fato 6**: arquivo em `components/admin/` ou `components/relatorios/` nunca é isento por
  `PENDENTES` — nem por prefixo, nem por nome, nem por entrada nova —; a única porta é a lista nominal da válvula
  (`DEVOLVIDOS_F61B`, Frente C), que nasce VAZIA, só encolhe e exige, por entrada, o defeito medido e o caminho da
  evidência; a lista `PENDENTES` só encolhe (entrada nova reprova, entrada morta já reprova); o piso de `SOB_REGRA` sobe
  para o número medido depois da conversão, sem reprovar a remoção legítima de um arquivo (a forma é sua: piso por
  diretório, conjunto nomeado, contagem recalculada — escrita e provada).
- **Os prefixos que ficam**, cada um com o MOTIVO por entrada, não só por frente (a ficha): as rotas `(app)/admin/` e
  `(app)/relatorios/` (fato 5 — o casco R7 é das frentes b e c das rotas), a frente a, a frente d, a casca por arquivo e
  `nova-compra-form.tsx`.
- `acesso-form.tsx` mora em `relatorios/` e é porta de autenticação (frente d): com o prefixo fora, ele entra na régua —
  converta-o como os outros.

### Frente C — a conversão dos 45 (decisão i)
- Em lotes — `admin/` e `relatorios/`, e dentro de cada um por regra —, com `npm run test` e `npx tsc --noEmit` entre os
  lotes, até a régua ficar verde. **A edição é sequencial**: estes arquivos são os mesmos das Frentes D e E.
- A régua é o `PLANO-DESIGN-SYSTEM` (fato 4): `text-[10|11|13px]` → `text-xs`; espaçamento pela regra escrita na Frente A;
  moldura à mão → o componente de sistema certo (o `QuadroDeTabela` existe para não repintar tabela; o `Card` padrão
  repinta raio); caixa de aviso → `<Aviso>` com a intenção certa; largura arbitrária de célula → classe da escala ou
  decisão escrita. Nunca alargue a régua para caber um caso: se um arquivo não converte sem quebrar, a quebra é
  medida e escrita (válvula abaixo).
- **Troca de classe, não refatoração**: em `importar-wizard.tsx` e `grupos-erros.tsx` (ficha: *"Não entra.
  Decomposição"*) só mudam classes, molduras e o bloco da confirmação (Frente E). A troca desta frente não muda estado,
  prop, texto, cálculo nem ordem de elemento em arquivo nenhum; o que as Frentes D e E mudam nos mesmos arquivos segue as
  tabelas delas, com a diferença visível na tabela de mudanças de propósito.
- **O teto da paleta anda com os lotes**: `cores.test.ts` reprova queda de 6 ou mais sem baixar o teto e exige
  `ARQUIVOS_COM_PALETA` exato (fato 14) — `TETO_PALETA_CRUA` e `ARQUIVOS_COM_PALETA` mudam no MESMO commit de cada lote
  que mexer na contagem, não no fim.
- **A superfície do visualizador**: `confinamento-viewer.test.ts` verde depois de cada lote de `relatorios/` — os
  componentes de `layout/` que entrarem no fecho não trazem `href` proibido —; ao final, `SUPERFICIE_MINIMA` sobe para o
  fecho medido MENOS NOVE — a folga que o próprio teste desenha (`:66-69`) — e o comentário diz os dois números (fato
  25). O relatório gerado usa os mesmos componentes: a
  apresentação muda, os números e os textos não.
- **Cada mudança visível entra na tabela de mudanças de propósito na hora**, não no fim.
- **Válvula (exceção, não plano):** um arquivo cuja conversão introduza um defeito MEDIDO — rolagem horizontal a 390px,
  texto truncado que perde sentido, tabela que quebra no relatório gerado — e que não tenha conserto dentro da escala
  entra na lista `DEVOLVIDOS_F61B` (nunca em `PENDENTES`), com o defeito, a medição e o motivo, e vira backlog F61B no
  relatório. Nunca por volume de trabalho, nunca prefixo inteiro, nunca sem a medição na evidência.

### Frente D — os pontos de injeção (decisão iii)
- **A fonte única** da sigla (`WAP`), do nome do sistema (`Estoque TI`), da descrição e do crédito (`vmatusita` e o site):
  um módulo PURO — sem `'use client'`, sem `server-only`, sem variável de ambiente, sem banco —, importável por Server e
  Client Component (fato 12), com os valores de HOJE. Não reuse `ESCOPO_UNICO` de `escopo/pertencimento.ts` (*"não é uma
  configuração… Na F62 ele sai"*) nem a `chaveDoEscopo`: aquilo é escopo de dado, isto é identidade exibida. O cabeçalho
  do módulo diz como a F70 o substitui (o `contextoDoApp()` por request, descendo por prop) e que ele NÃO é autorização.
- **A `Marca`**: `sigla?: string` e o nome por prop, com os padrões lidos da fonte; o chip e o rótulo com **tokens
  pareados** (fundo e texto) no lugar de `bg-brand-amarelo … text-black`. Os mesmos pares para o cromo escuro nos OITO
  arquivos do fato 8 — os sete com `bg-brand-dark` e `viewer-nav.tsx` —, incluindo os `hover:` e os `/70`/`/80`; e decida
  os outros quatro `text-black` sobre o amarelo (fato 8) pelo significado. **Valores idênticos aos de hoje, nos dois
  temas: nenhum pixel do cromo muda** — provado pela comparação de pixel da Frente G. A `Marca` sobre `bg-popover` (o menu
  do celular) continua legível nos dois temas. ⚠ **`bg-brand-dark` é marcador do smoke**: `scripts/smoke/smoke-prod.mjs:186`
  (`MARCADORES_LOGIN = ['bg-brand-dark', 'max-w-sm']`) confere o HTML do `/login` de produção, e o `saude.yml` roda essa
  parte quatro vezes por dia e abre issue de alarme quando falha. O fundo pode continuar `bg-brand-dark` (já é token) com
  o par nascendo do lado do texto; se o nome do fundo mudar, `MARCADORES_LOGIN` muda no MESMO commit aceitando o nome
  velho OU o novo — o deploy vem depois do merge.
- **`scripts/contraste.mjs` no MESMO commit dos tokens**: os pares passam a nomear os tokens novos, com valor literal em
  `:root` e `.dark` (fato 13), e `npm run contraste` verde — medindo o par novo, não o velho.
- **O nome do sistema, uma grafia** (decisão iii): o metadata de `src/app/layout.tsx` (`default`, `template` e
  `description`), a 404, `/versoes` (description e o texto do rodapé), `/ajuda` (description), `auth/confirm` e o rótulo do
  `viewer-header` montam o nome pela fonte. Escolha a grafia uma vez, pelo que o título da aba mostra melhor, e a
  mudança visível (o título da aba de quem não tem título próprio, ou o de todas) vai para a tabela de mudanças de
  propósito. Ler da fonte não muda o texto onde a grafia já é a escolhida: o rótulo `Estoque TI · Relatórios` do
  visualizador continua ESTE texto. ⚠ **A ajuda cita rótulos reais e é conferida**: `lib/ajuda/conteudo/comecar.test.ts`
  (*"descreve o shell reduzido do visualizador com os rótulos reais"*) exige `Estoque TI · Relatórios` e *"É operador da
  WAP? Entrar com sua conta"* no conteúdo. A grafia única NÃO muda rótulo visível que a ajuda cita; se um precisar mudar,
  é divergência declarada e backlog da F71, não mudança nesta fase. O conteúdo de ajuda (`lib/ajuda/conteudo/**`) é
  documentação e fica como está — inclusive a frase *"A marca 'WAP · Estoque TI'"* —, no censo, para a F71 (§10 item 2).
- **O metadata e a trava dos literais no MESMO commit** (a ficha: *"`src/app/layout.tsx` … no mesmo commit da trava,
  senão a suíte nasce vermelha"*).
- **O crédito, desligável**: `credito-autor.tsx` lê nome e site da fonte; com o crédito desligado na fonte, ele não
  renderiza nada e nenhum dos consumidores (login, rodapé da sidebar no computador e no celular, `/versoes`) deixa
  separador, margem ou linha órfã — provado por render nos dois estados onde o rig alcança (o componente, o rodapé da
  sidebar) e pela trava estática onde não alcança (`/versoes` é página `async` com sessão). O padrão continua LIGADO,
  igual a hoje: a escolha do que exibir para outros clientes é do Johnny (§10 item 3). ⚠ A ficha diz *"desligável por
  empresa"*; empresa não existe até a F62, então aqui ele é desligável NA FONTE, e a F70 liga a fonte à empresa —
  divergência declarada. `casco-de-autenticacao.tsx` (sem consumidor) não se apaga nesta fase: vai para o backlog.
- **A trava dos literais**: nos arquivos que passam a ler a fonte, nenhum literal com a sigla `WAP` (maiúscula, palavra
  inteira — o placeholder `voce@wap.ind.br` do login é frase da empresa e fica, decisão iii), `Estoque TI`, `vmatusita`
  ou o site do autor — só a fonte os tem. Reuse a varredura por AST da `sem-wapismo` (só literal, nunca comentário nem
  identificador), com a lista de arquivos NOMINAL e catraca que só cresce; não em `src/**` (as frases da empresa ficam até
  a F70, decisão iii). E um teste que prova que a fonte devolve exatamente os textos de hoje.

### Frente E — as correções pequenas
- **O verde de sucesso**: `<Badge variant="sucesso">` com o par de token — sem repintar (fato 17), com a ata que
  `components/ui/` exige, no molde da ata do `warning` (F7F). Os 12 sítios do fato 15 passam por token: os 7 selos pela
  variante, os 3 círculos e a pílula pelo token do significado deles. Nomeie o token pelo SIGNIFICADO: se "cadastro
  ativo" ou "sucesso" não é "em estoque", o nome não é `selo-em-estoque` — valores iguais, nomes distintos, se o
  significado é distinto. `medidor-minimo.tsx` (fato 18, as DUAS linhas): token próprio de folga, ou a ata dizendo por que
  fica cru. O resto do verde (fato 16): cada linha com destino escrito — token, exceção nomeada, ou fora desta fase com
  motivo. **Todo token novo desta frente ganha par em `scripts/contraste.mjs` nos dois temas**, com `exigir: true` e valor
  literal, no molde dos selos da F40 (`contraste.mjs:421-438`).
- **A regra de tinta**, com lista de exceções NOMEADA (a ficha): o par cru que duplica um token semântico que a fase
  criou ou tocou (o verde de sucesso, no mínimo) é proibido fora da lista; cada exceção carrega arquivo, trecho e
  motivo; exceção que não casa com nada reprova; a lista só encolhe. **Nunca derivada dos comentários do CSS** (fato 19:
  proibiria 204 usos, os callouts âmbar entre eles). `TETO_PALETA_CRUA` e `ARQUIVOS_COM_PALETA` descem no MESMO commit de
  cada lote que mexer na contagem (Frente C) e fecham nos números medidos.
- **As quatro confirmações (decisão ii)**: `ConfirmacaoDigitada` ganha `mono` e `spellCheck={false}` (e o que mais as
  quatro precisarem, escrito — o que ela não tem hoje, como o texto esperado que o wizard mostra dentro do `Label` e o
  bloqueio do apagar conta quando a conta não tem e-mail, `disabled={apagando || email === null}` em `:143`, vira opção
  escrita do componente ou fica AO LADO dele, sem perder texto, aviso nem bloqueio; a diferença visível vai para a tabela); a mesa de conflitos, o "Substituir tudo" do import, o apagar conta e a Zona destrutiva
  (as seis chamadas, pelo diálogo único) passam a usá-la. **O comportamento de cada uma fica idêntico** — o texto esperado,
  quando confere, o Enter só onde já executa hoje (o apagar conta), o desabilitado durante a execução, e a validação na
  action e na RPC intacta. A mesa passa a anunciar o erro (`aria-invalid`, `aria-describedby`, dica `role="alert"`). O
  comentário falso de `confirmacao-digitada.tsx:28-30` se corrige. **A trava**: `dicaConfirmacaoNaoConfere` só é importada
  de `src/components/layout/` (e do próprio módulo de validação e dos testes dele), sem exceção.
- **`useDialogoSemeado`**: um hook no lugar certo para hook de cliente (em `src/components/`, não em `src/lib/`), que
  semeia o formulário NA ABERTURA, a partir do que a tela mostra naquele instante — o motivo escrito em
  `tipo-item-dialog.tsx:50-57`. Consumidores: `filial-dialog`, `kit-dialog`, `motivo-dialog`, `item-dialog` e
  `relatorios/gerar-relatorio-dialog` (o defeito), e `tipo-item-dialog`, `colaborador-dialog` e
  `usuarios/editar-usuario-dialog` (as cópias certas, que deixam de ser cópias — a última só se a forma dela couber no
  hook; senão, exceção com motivo). Semeando na abertura, "Novo" abre vazio — o defeito vizinho do fato 22 se fecha junto, e vai
  para a tabela de mudanças de propósito e para o registry. Exceções nomeadas com motivo: `lancar-item-dialog` (mantém
  estado de propósito) e `editar-ativo-dialog` (react-hook-form com `values`). **A trava** `dialogo-semeado.test.ts`
  (nome da ficha): todo `*-dialog.tsx` de `src/components/**` que inicializa `useState` a partir de prop usa o hook ou
  está na lista de exceções com motivo; `onOpenChange={setAberto}` direto ao lado de estado semeado de prop reprova. O
  rig é grau 1 (fato 27): a trava é estática, e a regra de semear é função pura testável — não prometa teste de
  interação.
- **`src/components/filtros/url.ts`** (a ficha, e NÃO `src/lib/`): `'use client'`, com o estado de módulo documentado
  como compartilhado; `itens-filtros` e `historico-filtros` passam a importá-lo, `ativos-filtros` e `pendencias-filtros`
  ganham o fix que não têm, e `movimentacoes/lista-filtros` troca a cópia em `useRef` pelo módulo — com a mesma garantia.
  **O vazamento entre rotas** (fato 23): escreva primeiro o teste que o reproduz (vermelho), depois corrija —
  `pendente` passa a valer só para o MESMO caminho — e grave o vermelho e o verde. Os outros montadores de URL do fato 23
  ficam como estão, classificados no plano (não têm o defeito do clique atrasado, ou têm e entram — pela leitura
  escrita). A justificativa caduca de `url-filtros.ts:12-13` sai com o arquivo.
- **As chaves de storage**: as sete `wap:*` do fato 24 passam a ser construídas por `chaveDeStorage(…)` — a da conferência
  com a filial no sufixo —, **idênticas byte a byte** às de hoje, e `assinatura-realtime.test.ts` passa a afirmar as sete.
  `wap-sidebar` e `theme` ficam como estão, na lista de exceções da trava com o motivo (preferência do APARELHO, não dado
  de escopo; `wap-sidebar` está embutida no anti-flash e renomeá-la apagaria a preferência de todo mundo; `theme` é o
  padrão do `next-themes`). ⚠ Hoje as chaves são CONSTANTES DE MÓDULO (`CHAVE_RASCUNHO = 'wap:mov:rascunho'`,
  `PREFIXO_RASCUNHO_CONFERENCIA = 'wap:itens:conferencia'`…) e as chamadas usam o identificador: uma trava que só olhe a
  chamada já passa hoje. E guardar `chaveDeStorage(…)` numa constante de módulo congela o valor, contra `chave.ts:37-40`
  (quem consome chama a FUNÇÃO, para o call-site não mudar quando a resposta deixar de ser fixa): **a chave é calculada no
  uso**, e os testes que importam as constantes passam a provar a mesma coisa pela função. **A trava**: nenhum literal
  ou template que comece com `wap:` em `src/` fora de `src/lib/escopo/chave.ts` — exceto os nomes de CustomEvent dos dois
  `*-evento.ts`, nomeados — e nenhuma chamada a `localStorage`/`sessionStorage` com chave que não saia de
  `chaveDeStorage` ou da lista de exceções (`wap-sidebar`, `theme`).

### Frente F — os testes de componente e os documentos
- **6 a 8 `.test.tsx` no rig grau 1** (a ficha), cada um afirmando HTML que quebra em silêncio: a `Marca` com a sigla
  padrão e outra, e os tokens do chip; o crédito ligado, desligado e nas duas variantes; o `Badge` `sucesso`; a
  `ConfirmacaoDigitada` com `mono`/`spellCheck` e os três estados (vazio, não confere com `aria-invalid` + `describedby`
  + `role="alert"`, confere), inclusive com as props da mesa (`APAGAR <N>` gerado); e um componente convertido de `admin/`
  e um de `relatorios/` com a moldura de sistema. Conteúdo de `Dialog` não renderiza no rig (fato 27 e a Frente A). A escolha final é sua, com o que cada um prova escrito no plano.
- `docs/MATRIZ-REGRAS.md`: emenda F61 (regra · fonte · localização · prova · veredito) — a chave de storage só por
  `chaveDeStorage`; a confirmação digitada única e anunciada; a identidade exibida numa fonte só, que não é
  autorização; a régua sem isenção nos dois diretórios; a regra de tinta — e as exceções.
- `docs/PLANO-DESIGN-SYSTEM.md`: uma nota datada dizendo que os componentes das frentes b e c foram convertidos na F61 e
  que as rotas continuam pendentes.
- `docs/PLANO-MULTIEMPRESA.md`: a nota F61 na ficha (as divergências medidas, no molde da nota F60) e, no §6, uma linha
  dizendo que a fronteira foi alcançada, com a data e a versão.
- `docs/README.md`: as linhas que o índice pedir (onde procurar a regra antes de escrever componente em `admin/` ou
  `relatorios/`, confirmação digitada, chave de storage, nome e marca), e o `PLAN-F61`/`RELATORIO-F61` nas listas.
- `docs/DECISOES.md`: a ata. Documento interno de desenvolvedor não entra no `CHANGELOG.md`.

### Frente G — o fechamento, nesta ordem
1. `1.66.0` no `package.json`; entrada no `CHANGELOG.md` (sem citar fase futura pelo código —
   `cobertura-changelog.test.ts`); entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6 mudanças em LINGUAGEM DE
   OPERADOR e o efeito real — as telas de Administração e de Relatórios com texto e molduras no padrão das outras telas
   (e o que muda de fato, pela tabela), a confirmação da mesa de conflitos dizendo o que falta, "Novo" abrindo vazio, os
   filtros de Ativos e Pendências sem perder clique, o título da aba — nunca "nada mudou", nunca um efeito que não foi
   medido.
2. **O "depois" e o portão visual**: o instrumento da Frente A sobre o código final → `docs/f61-evidencias/depois/`. O
   portão tem três partes, e as três seguram o merge: (a) **o diff de strings de classe POR ARQUIVO DE FONTE** — `src/**`
   contra `v1.65.0`, extraído nas duas versões com o mesmo `classes()` de `src/lib/layout/regua-de-classes.ts` — e a
   tabela de mudanças de propósito são o MESMO conjunto: diferença sem linha é defeito ou tabela incompleta; linha sem
   diferença é tabela errada; (b) **a comparação de PIXEL por vitrine**, antes × depois, no próprio Chromium do Playwright
   (as duas imagens num `canvas`, `getImageData`, sem dependência nova): vitrine cujas linhas são todas "efeito visível:
   não" — o cromo, a `Marca`, os selos tokenizados — dá ZERO pixel diferente; as outras só diferem onde a tabela diz; (c)
   as linhas "sem vitrine" ficam declaradas no relatório. Rolagem horizontal a 390px medida em cada vitrine (a mesma conta
   de `capturar.mjs`, sem ele). O HTML normalizado antes × depois fica na evidência como apoio da leitura.
3. A revisão adversarial de "Como trabalhar", e as correções que ela pedir — com o "depois" refeito se algo mudou.
4. **O SHA de código congelado**: o último commit que toca `src/**` ou `scripts/**`, gravado no `PLAN-F61.md` e na
   evidência. Depois dele, só `docs/**` e `CHANGELOG.md`.
5. O CI do PR verde sobre esse SHA — `verificar` (com o `contraste`) e `banco-sem-docker`.
6. Ata em `docs/DECISOES.md` e `docs/RELATORIO-F61.md` com o que já dá para escrever; o PR sai do rascunho; merge com os
   dois checks verdes.
7. **A conferência pós-deploy, só leitura**: `/api/saude` com `1.66.0` e o commit do merge; `node
   scripts/smoke/smoke-prod.mjs` com 0 falha. Nenhuma captura de tela de produção.
8. Um PR SÓ de documentação com a evidência pós-deploy e o fecho do relatório (precedente: F56, F58, F59 e F60). A tag
   anotada `v1.66.0` vai no merge dele, o commit final da fase, e é publicada.

## Fora — não toque
O que a ficha põe em "Não entra": a decomposição de `PassoMovimentacao`, `nova-compra-form`, `importar-wizard` e
`grupos-erros` (neles, só classe, moldura, o token verde e o bloco da confirmação); react-hook-form; o `<datalist>`; cor
por empresa. E mais: `empresa_id` e tudo da virada (F62+) — nenhuma tabela, contexto por request, seletor ou cookie de
empresa; as ROTAS `(app)/admin/**` e `(app)/relatorios/**` no casco R7 (só a linha do selo verde nas quatro páginas do
fato 15); as frentes a e d da régua; as frases da empresa (censo, decisão iii); `src/lib/ajuda/conteudo/**`; o histórico
de `registry.ts`; `components/ui/**` além da variante `sucesso` do `badge.tsx`; a máquina de rascunho unificada (§9 — só a
chave); renomear `wap-sidebar` ou `theme`; apagar `casco-de-autenticacao.tsx`; consertar `capturar.mjs` ou criar
`.env.ensaio` (backlog); `CLAUDE.md`; o workflow do CI e a proteção da `main`; `supabase/**` e qualquer migration;
dependência nova (nada de jsdom, Testing Library, lib de tema ou de ícone); `.env*` e `scratchpad/`; os PRs do
dependabot; o Gerenciador de Credenciais do Windows; banco de qualquer ambiente; o backlog da F60.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; `npm run contraste` e `npm run
   verificar:actions` verdes.
2. `docs/PLAN-F61.md` tem o censo, a tabela da régua com a regra de conversão por classe, a TABELA DE MUDANÇAS DE
   PROPÓSITO, o censo do nome e o das frases da empresa, as tabelas das correções e o que a documentação diz; o censo é
   anterior ao primeiro commit que toca `src/` (fora o commit de instrumento em `scripts/design/`), e o "antes", anterior
   ao primeiro commit que muda uma classe.
3. O instrumento de prova visual está em `scripts/design/`, com dados 100% fictícios e o cabeçalho REAL × DUBLÊ; as
   vitrines da Frente A existem; `docs/f61-evidencias/antes/` e `depois/` têm PNG (1440×900 e 390×844, claro e escuro) e
   o HTML normalizado de cada vitrine.
4. O portão visual da Frente G, gravado: o diff de strings de classe por arquivo de fonte contra `v1.65.0` é o MESMO
   conjunto da tabela de mudanças de propósito; as vitrines "efeito visível: não" dão zero pixel diferente e as outras só
   diferem onde a tabela diz; as linhas "sem vitrine" estão declaradas; nenhuma vitrine rola na horizontal a 390px, ou a
   rolagem está na tabela com a causa e o conserto.
5. `src/components/admin/` e `src/components/relatorios/` sem nenhuma entrada em `PENDENTES` (nem prefixo, nem nome); a
   lista da válvula `DEVOLVIDOS_F61B` vazia, ou com cada entrada medida; a saída VERMELHA com os 45 está na evidência; a
   régua verde.
6. A catraca reprova arquivo novo com violação nos dois diretórios, entrada nova em `PENDENTES` e entrada nova em
   `DEVOLVIDOS_F61B` sem medição; não reprova a remoção legítima de um arquivo sob a régua; o piso de `SOB_REGRA` está no
   número medido; cada entrada que sobrou em `PENDENTES` tem motivo próprio.
7. Os 45 convertidos pela régua escrita no plano; nenhum texto, número, estado, prop, cálculo ou ordem de elemento mudou
   pela troca da Frente C (revisão e diff); se a válvula foi usada, cada arquivo está em `DEVOLVIDOS_F61B` com o defeito
   medido e o backlog F61B.
8. `confinamento-viewer.test.ts` verde, `SUPERFICIE_MINIMA` = fecho medido − 9 e o comentário com os dois números.
9. A fonte única existe, é pura (sem `'use client'`, `server-only`, variável de ambiente ou banco), não reusa
   `ESCOPO_UNICO` nem `chaveDoEscopo`, e um teste prova que devolve os textos de hoje.
10. A `Marca` recebe a sigla e o nome por prop com padrão da fonte e usa tokens pareados; os oito arquivos do cromo escuro
    usam o par; as vitrines do cromo e da `Marca` dão zero pixel diferente antes × depois, nos dois temas; o marcador do
    smoke (`MARCADORES_LOGIN`) continua casando com o HTML do `/login`.
11. `scripts/contraste.mjs` nomeia os pares novos, lê os valores literais em `:root` e `.dark`, e passa.
12. O metadata de `src/app/layout.tsx`, a 404, `/versoes`, `/ajuda`, `auth/confirm` e o `viewer-header` leem o nome da
    fonte, com UMA grafia; a mudança visível do título está na tabela.
13. O crédito lê a fonte; desligado, não renderiza nada e não deixa órfão em nenhum consumidor (render dos dois estados
    onde o rig alcança, trava estática onde não alcança); o padrão é LIGADO; nenhum rótulo citado pela ajuda mudou.
14. A trava dos literais (AST, lista nominal, catraca) reprova literal sintético e aceita comentário e identificador.
15. O censo das frases da empresa está no plano e no backlog nomeado da F70 do relatório.
16. `<Badge variant="sucesso">` sem repintar, com ata; os 12 sítios por token nomeado pelo significado, cada token novo
    com par exigido no `contraste` nos dois temas; `medidor-minimo.tsx` decidido nas duas linhas; cada linha do resto do
    verde com destino escrito.
17. A regra de tinta tem lista de exceções nomeada, não derivada do CSS, que só encolhe e reprova exceção morta;
    `TETO_PALETA_CRUA` e `ARQUIVOS_COM_PALETA` nos números medidos, atualizados lote a lote.
18. As quatro confirmações usam `ConfirmacaoDigitada` (com `mono` e `spellCheck={false}`); o comportamento de cada uma,
    tabelado antes e depois, é o mesmo; a mesa anuncia o erro; o comentário de `:28-30` corrigido; a trava da dica sem
    exceção.
19. `useDialogoSemeado` existe em `src/components/`, os consumidores da Frente E o usam, "Novo" abre vazio, as exceções
    têm motivo, e `dialogo-semeado.test.ts` reprova o sintético.
20. `src/components/filtros/url.ts` servindo os cinco filtros; o teste do vazamento entre rotas vermelho antes e verde
    depois; nenhum módulo `'use client'` em `src/lib/`.
21. As sete chaves `wap:*` por `chaveDeStorage`, calculadas no uso e byte a byte as de hoje; `assinatura-realtime.test.ts`
    afirma as sete; a trava reprova literal ou template `wap:` fora de `escopo/chave.ts` (salvo os dois nomes de evento) e
    chave de storage que não saia da função, e nomeia `wap-sidebar` e `theme` com motivo.
22. De 6 a 8 `.test.tsx` novos no rig grau 1, cada um com o que prova escrito no plano.
23. Nenhuma dependência nova; nada em `supabase/**`; `CLAUDE.md` e `.github/workflows/**` intocados.
24. Emenda F61 na `docs/MATRIZ-REGRAS.md`; a nota no `PLANO-DESIGN-SYSTEM.md`; a nota F61 e a linha do §6 no
    `PLANO-MULTIEMPRESA.md`; o índice em `docs/README.md`; a ata em `docs/DECISOES.md`.
25. `package.json` em `1.66.0`, `CHANGELOG.md` e `registry.ts` com entrada; tag anotada `v1.66.0` publicada no merge do
    PR de documentação — ou nenhuma tag, com o motivo e o comando no topo do relatório.
26. `docs/RELATORIO-F61.md` no padrão F45→F60, com o roteiro do Johnny no topo e a seção da fronteira.
27. Os dois PRs mergeados com `verificar` e `banco-sem-docker` verdes, e a conferência pós-deploy feita (`/api/saude` com
    `1.66.0` e o smoke com 0 falha) — ou o bloqueio no topo do relatório.
28. As onze sabotagens com saída real em `docs/f61-evidencias/`.
29. Nenhum dado real (nome de pessoa, patrimônio fora da faixa fictícia, e-mail, id, nome de filial real) em teste,
    prévia, evidência ou log — com a allowlist declarada do texto que fica pela decisão iii (o placeholder do login); nenhuma
    captura de tela do app contra o ensaio ou a produção; ninguém abriu o `.env.local`.
30. O relatório declara o estado de repouso: o que acontece se o projeto parar aqui por dois meses.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run contraste` a cada mudança de token; `npm
run build` antes de cada push. Leia a falha, corrija a **causa raiz** e repita até passar. **Não alargue exceção para
caber um caso que devia reprovar, não troque detecção por `skip`, não afrouxe a régua, a regra de tinta ou o contraste
para a conversão passar, e não mude teste existente sem conferir que ele prova a mesma coisa.** Falha persistindo depois
de ~3 ciclos: mude de abordagem e registre a troca.

**O "ANTES" VEM ANTES DO "DEPOIS", E NENHUM PIXEL MUDA FORA DA TABELA.** O instrumento e as fotos "antes" existem antes da
primeira classe mudada; a conferência diff de classes × tabela de mudanças de propósito é o portão do merge.

Provas obrigatórias, cada uma com a saída real em `docs/f61-evidencias/`:
- **Sabotagem A — a régua vermelha de hoje:** sem os dois prefixos → vermelho nomeando os 45; depois da conversão → verde.
- **Sabotagem B — a catraca:** um `.tsx` sintético EM MEMÓRIA em `components/admin/` e outro em `components/relatorios/`
  com moldura à mão → vermelho; `components/relatorios/` de volta em `PENDENTES` → vermelho; a remoção simulada de um
  arquivo sob a régua → verde.
- **Sabotagem C — os literais:** `WAP`, `Estoque TI` e `vmatusita` injetados em memória no texto de um arquivo da lista →
  vermelho; o mesmo em comentário e em identificador → verde.
- **Sabotagem D — a tinta:** o par cru do verde de sucesso num selo sintético → vermelho; uma exceção que não casa com nada
  → vermelho; um callout âmbar legítimo → verde.
- **Sabotagem E — o contraste:** a saída do `contraste` lista os pares pelos nomes NOVOS; numa cópia fora do repositório,
  um valor que não atinge a razão → vermelho, e um token só em `var(--x)` → "cor desconhecida".
- **Sabotagem F — a confirmação:** um arquivo sintético fora de `layout/` importando `dicaConfirmacaoNaoConfere` →
  vermelho; o render da `ConfirmacaoDigitada` com as props da mesa (`mono`, `APAGAR 3` esperado, `APAGAR 2` digitado) →
  `aria-invalid`, `aria-describedby` e `role="alert"` presentes, e uma variante em memória sem eles → teste vermelho.
- **Sabotagem G — o diálogo:** um `*-dialog.tsx` sintético com `useState` semeado de prop e `onOpenChange={setAberto}` →
  vermelho; o mesmo usando o hook → verde.
- **Sabotagem H — os filtros:** o teste do vazamento entre `/itens` e `/itens/historico` vermelho sobre o código de antes,
  verde depois.
- **Sabotagem I — o storage:** `localStorage.setItem('wap:x', …)` sintético → vermelho; `const CHAVE_X = 'wap:x'` num
  módulo sintético → vermelho; o prefixo de `chaveDeStorage` trocado em memória → as sete afirmações vermelhas.
- **Sabotagem J — o crédito:** o render com o crédito desligado não tem link, separador nem texto; ligado, tem o link com
  `aria-label` — no componente e nos consumidores que o rig alcança; `/versoes`, pela trava estática.
- **Sabotagem K — o portão visual:** uma classe trocada, em memória, num arquivo de fonte fora da tabela → a parte (a)
  acusa o arquivo e a classe; o valor de um token "efeito visível: não" alterado numa cópia do CSS da prévia → a parte (b)
  acusa a vitrine e a contagem de pixels.
- **A contagem final:** testes (arquivos e casos) antes × depois; `.test.tsx` 5 → N; `PENDENTES` 32 → N; `SOB_REGRA` 77 →
  N; `TETO_PALETA_CRUA` 473 → N e arquivos 61 → N; superfície 155 → N e mínimo 125 → N; os pares do `contraste`; `npm run
  build` colado por inteiro; e uma varredura dos HTML de evidência e dos dados das prévias pelos cinco nomes de filial
  real, por e-mail (fora a allowlist declarada) e por patrimônio fora da faixa fictícia, com zero ocorrência.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em
nenhuma hipótese. Régua, nesta ordem: (1) uma medição sua contra o disco de hoje; (2) as três decisões do Johnny abaixo,
que estendem a ficha; (3) a ficha da F61 no §5 do plano; (4) este prompt, no que ele detalha — e onde ele diverge da
ficha, a divergência está declarada aqui e vai para o relatório; (5) as convenções do repositório (`CLAUDE.md`,
`AGENTS.md`, `PLANO-DESIGN-SYSTEM.md`, código existente); (6) a opção mais simples e reversível. Decisão não-óbvia vai
para `docs/DECISOES.md` com data, contexto, escolha e motivo.

**As três decisões do Johnny (17/09/2026), que a ficha não tinha:**
i. **Converter os 45 arquivos agora**, pela escala do `PLANO-DESIGN-SYSTEM`, com as mudanças visuais listadas e
   fotografadas. Sem F61B planejada — só a válvula da Frente C, por arquivo e com medição.
ii. **As quatro confirmações digitadas passam por `ConfirmacaoDigitada`**, e a trava da dica nasce sem exceção.
iii. **O nome do SISTEMA entra no ponto de injeção, com uma grafia; as frases da EMPRESA ficam**, listadas para a F70.

**As doze decisões que esta fase precisa tomar por escrito:**
1. **A fonte única** — onde mora, a forma, como chega ao Client Component e como a F70 a troca.
2. **Os tokens da marca e do cromo** — os nomes, os pares, os valores, os oito arquivos, os `text-black` sobre o amarelo e
   os pares do `contraste`.
3. **O nome do sistema** — a grafia, os endereços e o que muda no título da aba.
4. **A régua** — a regra de conversão por classe (texto, espaçamento, moldura, largura), a catraca e os motivos.
5. **A válvula** — se foi usada, por quê, com a medição.
6. **O verde** — os tokens por significado, o `Badge` `sucesso`, `medidor-minimo`, o resto do verde.
7. **A regra de tinta** — o que proíbe, a lista de exceções e os números do teto.
8. **A confirmação** — a API do componente e o comportamento das quatro, antes e depois.
9. **`useDialogoSemeado`** — a API, o lugar, as exceções e a trava estática.
10. **Os filtros** — o módulo, o `pendente` por caminho e quem migra.
11. **O storage** — as exceções e o alcance da trava.
12. **A prova visual** — as vitrines, o que é real e o que é dublê, a normalização do HTML e a conferência com a tabela.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** e registre. Bloqueios reais, e o que fazer em cada um:
- **O Playwright ou o Chromium não sobem nesta máquina:** não instale navegador nem dependência, e não fotografe por outro
  caminho. O HTML normalizado e o diff de classes não precisam do navegador (`--so-html`): entregue tudo o que não depende
  da foto, com o PR ABERTO e **SEM merge** (a ficha põe as fotos no "pronto quando"), e ponha no topo do relatório o
  comando exato das fotos "antes" (sobre o commit do INSTRUMENTO, que antecede toda classe mudada) e "depois", e o da
  comparação de pixel.
- **A conversão revela defeito que não se resolve na escala:** a válvula da Frente C, por arquivo, com a medição — nunca
  prefixo inteiro.
- **Cota de Actions esgotada, CI fora do ar:** contorne se for seguro; senão entregue o resto e registre a pendência com o
  que falta para resolvê-la.
- **Recusa do classificador em qualquer ação** (merge, push de tag): registre, não repita, não reformule, siga no que não
  depende dela, e ponha o comando no topo do relatório.

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório — foi assim
que a F46, a F53, a F57, a F58, a F59 e a F60 acertaram o próprio escopo. **Aqui já há quinze divergências medidas de
saída**, e elas vão no relatório: a expressão da isenção está em `:132`, não em `:130` (fato 2); são 45 arquivos e 113
violações, não 44 e 109 (fato 3); o cromo escuro são oito arquivos, com `viewer-nav.tsx`, não sete (fato 8); o crédito tem
quatro chamadas, uma delas num componente morto, e a da sidebar aparece duas vezes (fato 11); o `sucesso` no molde do
`warning` repintaria (fato 17); `medidor-minimo.tsx` tem duas linhas verdes, e o `:27` não tem token (fato 18); o selo
âmbar já existe e a regra derivada do CSS proibiria 204 usos (fato 19); a trava da dica reprovaria hoje, com três
importadores fora de `layout/` (fato 21); a mesa não é o único lugar fora de `/dev` que apaga cadastro de ativo (fato 21);
os diálogos de CRUD do admin são seis, quatro com o defeito, mais o de relatórios, e `colaborador-dialog` é cópia certa
(fato 22); só dois filtros perdem o fix, não três, e há um vazamento latente entre rotas (fato 23); a lição de
`checklist-lote.ts` no `CLAUDE.md` é a fronteira `'use client'`, não o estado de módulo (fato 23); das sete chaves `wap:`,
só uma é `localStorage` (fato 24); a superfície do visualizador tem 155 arquivos e o comentário da folga caducou (fato
25); e as fotos não podem vir de `capturar.mjs`, porque o ensaio guarda cópia de dado real (fato 26). Declare também o que
este prompt acrescenta ou ajusta: o crédito desligável NA FONTE, e não "por empresa" (empresa não existe até a F62); o
conteúdo de ajuda fora da decisão iii (é documentação, F71); a lista `DEVOLVIDOS_F61B` como única porta da válvula; a
catraca sem os dois furos; o instrumento com vitrines e o diff de classes contra a tabela; o
censo das frases da empresa (decisão iii); as quatro confirmações (decisão ii); o teste do vazamento entre rotas; o
"Novo" que abre vazio; a sétima chave no teste de assinatura; e a seção da fronteira no relatório.

# Git e segurança
Branch `f61-pontos-de-injecao-da-ui`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional
(`docs(f61): …`, `test(f61): …`, `refactor(f61): …`, `feat(f61): …`, `fix(f61): …`, `style(f61): …`, `chore(f61): …`).
Commite também esta ordem (`docs/prompts/F61-pontos-de-injecao-da-ui-ultracode.md`) num commit de documentação; o
`PLAN-F61.md` vem antes do primeiro commit que toca `src/` (a exceção é o commit de instrumento em `scripts/design/`). Os
lotes em commits separados — régua e conversão de `admin/`; conversão de `relatorios/`; pontos de injeção; verde e tinta;
confirmação; diálogos; filtros; storage; testes; documentos; versão. Agrupe os pushes — cada um custa CI numa cota
apertada. PR com `gh pr create`, como rascunho desde o primeiro push que precisar de CI; merge só com `verificar` e
`banco-sem-docker` verdes. Depois do merge: a evidência por um PR só de documentação, e correção de código por PR novo.
**Nunca:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu, commitar
`.env*` ou `scratchpad/`, abrir, filtrar, imprimir ou copiar o `.env.local` — nem você, nem subagente (o incidente de
10/09, `INVENTARIO-CREDENCIAIS.md` §9), tocar `supabase/**` ou criar migration, mexer na proteção da `main` ou
no workflow, rodar `db:seed`, `db:reset`, `db:types` ou `carga`, subir `next dev`/`next start` para fotografar ou medir,
rodar `scripts/design/capturar.mjs`, capturar tela do app contra o ensaio ou a produção, instalar dependência ou
navegador, ler o Gerenciador de Credenciais do Windows, imprimir ou gravar senha e token, ou mexer nos PRs do dependabot.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS** (nunca com dado real; e o prompt de
cada subagente diz, com todas as letras, que ele não abre, não filtra e não imprime o `.env.local`): (a) **a
régua e a conversão** — os 45 arquivos pela régua de verdade, a regra do `PLANO-DESIGN-SYSTEM` para cada classe, os
componentes de sistema e o que cada um repinta; (b) **a marca, o nome, o crédito e os tokens** — os consumidores, os oito
arquivos do cromo, o `contraste.mjs` e o que o Next 16 diz de `metadata` e `not-found`; (c) **o verde, a paleta e a
regra de tinta** — os 12 sítios e o resto do verde com o significado, o `Badge`, `cores.test.ts` e o desenho da lista de
exceções; (d) **a confirmação, os diálogos, os filtros e o storage** — as quatro confirmações com o comportamento de hoje,
os 26 diálogos, os filtros e o vazamento, as chaves e as travas vizinhas (`assinatura-realtime`, `sidebar-preferencia`);
(e) **a prova visual** — as prévias da F43/F44, as vitrines, os dados fictícios, a normalização do HTML, a superfície do
visualizador e o rig grau 1.

Escreva `docs/PLAN-F61.md` antes de implementar, com: o censo; as tabelas; a regra de conversão; a tabela de mudanças de
propósito (que cresce durante a execução); o desenho da fonte única e dos tokens; as vitrines; as doze decisões; e a
**ORDEM DE ROLLBACK** — a fase é só código: `git revert` do merge e redeploy, sem passo de banco; as chaves de storage são
as mesmas antes e depois, então reverter não apaga rascunho de ninguém; tokens e `contraste.mjs` revertem juntos. **A
edição é sequencial**: a conversão, os pontos de injeção e as correções se cruzam nos mesmos arquivos. Paralelize
exploração, medição e revisão — não edição.

Antes de congelar o SHA (Frente G, passo 4), **revisão adversarial por subagentes em contexto fresco**, contra o
`PLAN-F61.md` e os 30 critérios, com estas perguntas: alguma diferença do diff de classes está fora da tabela de mudanças
de propósito, ou algum item da tabela não aparece no diff? algum texto, número, estado, prop ou ordem de elemento mudou
num arquivo convertido — em especial em `importar-wizard`, `grupos-erros` e no corpo do relatório gerado? a conversão pôs
rolagem horizontal, truncamento ou quebra a 390px em alguma vitrine? o cromo e a `Marca` ficaram idênticos nos dois
temas, e o `contraste` mede os pares NOVOS? a fonte única é importável por Client Component sem arrastar `server-only`,
variável de ambiente ou banco, e algum arquivo da lista ainda tem o literal? o título da aba, a 404, `/versoes`, `/ajuda`
e `auth/confirm` mostram a MESMA grafia? com o crédito desligado, sobra separador, margem ou `aria` órfão no login, na
sidebar (computador e celular) ou em `/versoes`? as quatro confirmações mantêm o comportamento — o Enter só onde já
executava, o desabilitado durante a execução, o texto esperado, a validação da action e da RPC? editar ainda mostra o
valor atual depois do `router.refresh()`, "Novo" abre vazio, e `lancar-item-dialog` mantém o que mantinha? o clique
atrasado continua coberto nos cinco filtros, o vazamento entre rotas fechou, e a paginação não mudou? as sete chaves são
byte a byte as de hoje? a catraca enxerga arquivo novo e não reprova remoção legítima, e sobrou entrada sem motivo? a
regra de tinta proíbe o que deve e deixa os callouts âmbar em paz, e o teto bate com a contagem? a superfície do
visualizador ganhou `href` proibido, e o piso subiu? alguma evidência, prévia ou teste tem nome de pessoa, patrimônio,
e-mail ou filial reais? algum arquivo fora do escopo foi tocado? Cada achado passa por um cético instruído a refutá-lo.
**Aponte apenas lacunas de correção ou de requisito declarado — não preferências de estilo.** Corrija, refaça o "depois"
se algo mudou, e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F61.md`, em pt-BR, no padrão dos relatórios F45→F60, **com o roteiro do Johnny no TOPO** — o que ficou
com ele, passo a passo, e por quê. No mínimo: se as fotos, o merge ou a tag ficaram pendentes, os comandos exatos vêm
PRIMEIRO; depois do deploy, conferir `/api/saude` com `1.66.0`; abrir o login, o cabeçalho, Administração › Filiais (o
selo "Ativa") e o "Nova filial" duas vezes seguidas (a segunda abre vazia), um relatório ao vivo e um gerado, e a mesa de
conflitos até a confirmação **sem confirmar nada** — comparando com as fotos de `docs/f61-evidencias/`; o `git diff
v1.65.0 v1.66.0 --stat` com o que deve e o que não deve aparecer; rodar `npm run test` uma vez. Depois: o que mudou por
arquivo e por quê; **os números MEDIDOS** lado a lado com a ficha, e **cada divergência explicada** — a começar pelas
quinze já conhecidas; as três decisões do Johnny e as **doze decisões** da fase, com o que decidiu cada uma; a **tabela de
mudanças de propósito**, conferida com o diff; o **censo das frases da empresa**; as onze sabotagens com saída real; a
contagem final; **a fronteira** — cada promessa do §6 do plano ao lado da trava ou do artefato que a sustenta hoje (o
arquivo e o comando que a mostra verde), sem reauditar as fases: a existência conferida e a lacuna declarada onde houver;
os 30 critérios autoverificados; o estado de repouso; e a seção **"o que este relatório NÃO prova"** — no mínimo: que a
foto é a tela de produção (é a prévia, com dublês e sem a fonte Geist); que o teste grau 1 prova interação (prova HTML);
que a regra de tinta julga a cor renderizada (julga nome de classe); que a fonte única já é por empresa (é um ponto de
injeção com valores fixos até a F70); que as chaves de storage separam empresas (o prefixo é `wap` até a virada); e que o
diff de classes cobre as telas fora das vitrines. Pendências e **backlog nomeado**: para a **F62** (a fonte única convive
com `ESCOPO_UNICO`, que sai); para a **F70** (o `contextoDoApp()` no lugar da fonte, o censo das frases da empresa, o
crédito por empresa e a pergunta do §10 item 3, `wap-sidebar` e `theme` se a virada os pedir); para a **F71** (a ajuda e o
*"WAP · Estoque TI"* do conteúdo); a **F61B**, se a válvula foi usada; e o **PATCH** (as rotas `(app)/admin/**` e
`(app)/relatorios/**` no casco, as frentes a e d, o verde que ficou cru, `casco-de-autenticacao.tsx` sem consumidor, e a
trava de `capturar.mjs`, que só conhece o ref de produção, com o `.env.ensaio` que não existe). **Evidências, não
afirmações:** saída real e completa dos comandos. Termine a resposta final com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório e comentários em **pt-BR**. Identificadores de domínio em português sem acento; os nomes
de arquivo que a ficha fixa (`use-dialogo-semeado.ts`, `dialogo-semeado.test.ts`, `src/components/filtros/url.ts`,
`consistencia.test.ts`, `cores.test.ts`) ficam como estão. Commits em pt-BR no padrão conventional. As mudanças do
`registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa termo de desenvolvedor.
```

---
## Como executar

### Pré-voo (uma vez, ~15 minutos)

Esta fase **não toca banco**: nada de migration, apply ou MCP da Supabase. Ela converte 45 componentes, cria os pontos de
injeção, fotografa uma prévia estática antes e depois com o Playwright, abre e mergeia dois PRs, e confere produção pelo
smoke depois do deploy. O pré-voo existe para nada disso travar no meio.

Este arquivo já está salvo em `docs/prompts/F61-pontos-de-injecao-da-ui-ultracode.md`, **sem commit** — o agente o commita
na branch da fase. O prompt cita os 28 fatos do cabeçalho pelo número, então ele precisa estar lá quando você colar o
bloco. Arquivo não rastreado sobrevive ao `git checkout main` abaixo.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar (o contraste também: a fase mexe nos tokens).
npm run lint; npm run test; npm run build; npx tsc --noEmit; npm run contraste

# 2. Onde a F60 parou: 1.65.0, tag v1.65.0 no merge do PR #53 (4cf8016); fora do git, só este arquivo e o "Claude outputs".
type package.json | findstr version
git log --oneline -3
git tag --points-at HEAD
git status --short
Test-Path .git\index.lock    # tem de dar False — uma trava órfã derruba o primeiro commit da run
Test-Path docs\prompts\F61-pontos-de-injecao-da-ui-ultracode.md   # tem de dar True — o prompt cita os 28 fatos dele

# 3. Produção com a mesma versão.
curl.exe -s https://ti-wap-inventory-control.vercel.app/api/saude

# 4. A prévia estática sobe o Chromium do Playwright NESTA máquina (a saída cai em scratchpad/, que o git ignora).
npx tsx --tsconfig scripts/design/tsconfig.previa.json scripts/design/previa-itens.tsx --saida scratchpad/previa-preflight
#    Se reclamar do navegador: npx playwright install chromium   (o navegador do Playwright já aprovado; R$ 0)

# 5. O smoke de produção passa HOJE — é a conferência pós-deploy da fase.
node scripts/smoke/smoke-prod.mjs

# 6. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**O passo 4 é o que mais importa.** Sem Chromium que suba, o prompt entrega tudo verde no CI e **deixa o PR aberto, sem
merge**, com o comando das fotos no topo do relatório — as fotos estão no "pronto quando" da ficha. E o prompt proíbe o
agente de instalar navegador: se precisar, instale você, agora.

**Mais três coisas que só você confere antes de colar:**

1. **A cota de Actions**, em github.com/settings/billing. O PR de código passa por alguns ciclos do `verificar` (a régua
   vermelha sobe junto da conversão, as correções da revisão), mais o PR de documentação.
2. **Dentro do Claude Code:** `/permissions` (nada negando `git push`, `gh`, `node`, `npx tsx` ou `npx playwright`) e
   `/memory` (o `CLAUDE.md` do projeto listado).
3. **MCP:** nenhum é obrigatório. O **Context7** ajuda de verdade — `metadata` e `not-found` do Next 16, tokens de cor e
   opacidade no Tailwind v4, o `Badge` do shadcn, o `storageKey` do `next-themes` e os atributos ARIA da confirmação.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f61
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda testes, build, contraste, a prévia com Playwright, `gh pr create`, merge, tag, push e o
smoke contra produção — nada disso cabe numa allowlist estreita, e `bypassPermissions` numa máquina com credencial de
produção no `.env.local` está fora de questão. **Onde o classificador pode barrar:** o merge na `main` e o push da tag
(as F57→F60 passaram por ele). Se barrar, o prompt manda não reformular: registra, segue no resto e põe o comando no topo
do relatório.

**`--worktree` NÃO serve:** o smoke da conferência pós-deploy precisa do `.env.local`, que não vai para a worktree, e o
prompt proíbe copiá-lo. Rode no diretório principal e não mexa no repositório enquanto a run durar.

**Custo.** Esta fase é mais leve que a F60 (sem banco, sem janela de `drop`), mas a conversão dos 45 arquivos e as
vitrines da prévia pesam. Se a cota semanal estiver apertada: `$env:CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` antes do
`claude` — economize na exploração; a revisão adversarial (o diff × a tabela, o comportamento das quatro confirmações) é
onde o modelo forte rende.

Se preferir de madrugada, headless (o prompt vai por stdin, porque o bloco passa do limite de linha de comando do
Windows):

```powershell
# salve só o bloco do prompt em prompt-f61.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f61.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f61.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Em headless, bloqueio repetido do classificador **aborta** a sessão, e o `/goal` abaixo não se aplica. **Prefira a sessão
interativa deixada rodando, com o `/goal`**, mesmo de madrugada — com a suspensão do Windows desligada (plano de energia):
o Playwright fotografando dezenas de vitrines não gosta de máquina dormindo.

Recomendado para desatendido — a condição de parada como avaliador separado. Digite o `/goal` logo depois de colar o
prompt, na mesma sessão:

```
/goal npm run lint, npm run test, npm run build, npx tsc --noEmit e npm run contraste limpos; src/lib/layout/consistencia.test.ts sem isencao para src/components/admin/ e src/components/relatorios/ em PENDENTES e verde (a lista DEVOLVIDOS_F61B, se existir, com cada entrada medida); nenhum arquivo novo ou alterado em supabase/; docs/f61-evidencias/antes e docs/f61-evidencias/depois existem; package.json em 1.66.0; docs/RELATORIO-F61.md existe; e UM destes desfechos: (a) o PR da fase e o PR de documentacao estao mergeados com verificar e banco-sem-docker verdes, a conferencia pos-deploy passou e a tag v1.66.0 foi publicada; (b) o mesmo, mas com o merge ou o push da tag barrado, com o bloqueio e o comando no topo do docs/RELATORIO-F61.md; (c) sem Chromium para as fotos, o PR ficou aberto sem merge, com o comando das fotos no topo do docs/RELATORIO-F61.md; ou (d) CI, cota de Actions ou conferencia pos-deploy bloqueados, com a pendencia e o comando no topo do docs/RELATORIO-F61.md
```

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **O "antes".** `docs/PLAN-F61.md` com o censo e a tabela da régua, e `docs/f61-evidencias/antes/` com as fotos e o
   HTML das vitrines — antes da primeira classe mudada.
2. **A régua vermelha.** A evidência com os 45 arquivos reprovando pelo nome, antes da conversão.
3. **A tabela de mudanças de propósito crescendo** no plano durante a conversão. É ela que diz o que você vai ver de
   diferente na tela.
4. **O diff × a tabela.** No fim, os dois têm de ser o mesmo conjunto. Uma diferença sem linha na tabela segura o merge —
   é o momento de olhar.
5. **As evidências.** Só dados fictícios nas prévias e nos HTML. Um nome de pessoa, patrimônio ou filial de verdade ali é
   dado real entrando no repositório: interrompa a sessão.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Abra em produção o login, o cabeçalho, Administração › Filiais (clique "Nova filial" duas vezes: a segunda abre vazia),
   um relatório ao vivo e um gerado, e a mesa de conflitos até a confirmação — **sem confirmar**. Compare com as fotos de
   `docs/f61-evidencias/` e com a tabela de mudanças de propósito do relatório: a diferença que você enxergar tem de
   estar lá.
3. `git diff v1.65.0 v1.66.0 --stat`: devem aparecer `src/components/admin/**`, `src/components/relatorios/**`,
   `src/components/layout/**`, `src/components/ui/badge.tsx`, `src/components/filtros/url.ts`, os filtros, diálogos e
   rascunhos de `src/components/{ativos,itens,movimentacoes,pendencias,dev}/**`, `src/app/layout.tsx`, `not-found.tsx`,
   `(app)/versoes`, `(app)/ajuda/page.tsx`, `auth/confirm`, as quatro páginas de `(app)/admin/` só na linha do selo,
   `src/app/globals.css`, `scripts/contraste.mjs`, `scripts/design/**` (e `scripts/smoke/smoke-prod.mjs`, só se o nome do
   fundo do cromo mudou), os testes de régua, cores e storage,
   `registry.ts`, `package.json`, `CHANGELOG.md` e `docs/**`. **Não** devem aparecer `supabase/**`, `CLAUDE.md`,
   `.github/workflows/**`, `src/lib/ajuda/conteudo/**`, outro arquivo de `src/components/ui/` nem mudança de dependência no
   `package-lock.json`.
4. Abra `docs/f61-evidencias/`: fotos da prévia e HTML só com dados fictícios; a saída das onze sabotagens.
5. Rode você mesmo `npm run test` uma vez.
6. Veio errado de forma ampla? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o
   aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **A F60 está fechada e no ar**: `main` em `4cf8016` com a tag `v1.65.0`, medido pelo git em 17/09. O `/api/saude` e o
   estado do CI não foram consultados desta sessão; o pré-voo confere.
2. **Uma run, um PR de código e um PR de documentação com a tag** — o molde das F57→F60, não decisão nova sua. Versão
   `1.66.0` (fase = MINOR).
3. **As fotos vêm da prévia estática com dados fictícios**, não de `capturar.mjs`: o `.env.local` aponta para o ensaio
   desde a F55, e o ensaio guarda uma cópia dos dados reais do go-live (atas F13 e F55; a ata da F31, que o chama de
   fictício, é contrariada pelas duas). Se o ensaio já foi trocado por seed fictício, as fotos poderiam ser das telas de
   verdade — o prompt não conta com isso.
4. **Sem Chromium, sem merge**: as fotos estão no "pronto quando" da ficha, então o PR fica aberto com o comando no topo
   do relatório.
5. **A grafia única do nome do sistema é escolha do agente**, escrita e fotografada — o título da aba de algumas páginas
   (ou de todas) pode mudar de "Estoque TI · WAP" para a grafia escolhida.
6. **O crédito continua LIGADO**: a fase o torna desligável; o que exibir para outros clientes (§10 item 3) fica com você,
   antes da F70.
7. **`wap-sidebar` e `theme` não mudam de nome** — são preferência do aparelho, e renomear apagaria a de todo mundo; entram
   na trava como exceções nomeadas.
8. **"Novo" abrindo vazio é correção**, e sai junto do semear na abertura; vai para a tabela de mudanças e para o registry.
9. **As rotas `(app)/admin/**` e `(app)/relatorios/**` continuam isentas da régua** (o casco R7 é outra frente), fora a
   linha do selo verde nas quatro páginas de admin.
10. **`importar-wizard` e `grupos-erros` recebem só troca de classe, moldura, token e o bloco da confirmação** — a
    decomposição continua fora, como manda a ficha.
11. **A válvula da Frente C é exceção por arquivo, com medição**; se ela não for usada, não existe F61B.
12. **Os montadores de URL que já usam a versão confirmada** (auditoria, gerados, período, paginação…) ficam como estão,
    salvo se a leitura mostrar neles o mesmo defeito do clique atrasado.
13. **O vazamento entre `/itens` e `/itens/historico` foi achado por leitura**, não executado — o prompt manda reproduzi-lo
    num teste vermelho antes de corrigir.
14. **O verde que não está entre os 12 sítios** ganha destino escrito (token, exceção ou fora), mas a fase não é obrigada a
    tokenizá-lo todo.
15. **Nenhuma leitura de banco nesta fase** — nem ensaio, nem produção — além do smoke da conferência pós-deploy.

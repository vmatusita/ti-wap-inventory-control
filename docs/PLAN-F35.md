# PLAN — F35 · Versionamento do sistema, página `/versoes` e crédito de autoria

> Plano autossuficiente da ordem `docs/prompts/F35-versionamento-credito-ultracode.md` (12/08/2026).
> Escrito **antes** da implementação, depois do recon paralelo (10 subagentes: 5 fatias do
> `CHANGELOG.md` + inventário das ordens + 4 reconhecimentos de código).

## 0. Baseline medida ANTES de qualquer mudança

| Portão | Resultado |
|---|---|
| `npm run lint` | limpo (nenhuma saída do eslint) |
| `npm run test` | **122 arquivos · 2.523 testes** · 0 falhas · 141,92 s |
| `npm run build` | ✓ compilado · 30 rotas · 28 páginas estáticas geradas |
| `git status` | 3 arquivos não rastreados: a própria ordem F35 + `docs/PLANO-ESPELHO-SHAREPOINT.md` + `docs/ROTEIRO-ESPELHO-ENTRA.md` |
| `git tag` | **zero tags** no repositório |
| `package.json.version` | `0.1.0` (desde o scaffold da F0) |

Os dois documentos do espelho SharePoint são **propostas de planejamento** (nenhum código), já
declaradas na ata `2026-08-11 · F34` como "não são trabalho pendente de outra sessão". Esta fase
**não os toca e não os commita** — mesma decisão da F34.

## 1. Numeração da fase: colisão real, resolvida

A ata `2026-08-11 · F34 · O número F34 do plano do SharePoint está OCUPADO — o espelho será F35`
reservou o **F35** para o espelho do SharePoint. Mas quem virou ordem de serviço em 12/08 foi
**esta** (arquivo `docs/prompts/F35-versionamento-credito-ultracode.md`, colado pelo Johnny).

**Decisão:** o número **F35 é desta ordem**; o espelho do SharePoint, quando virar ordem, é **F36**.
Mesmo critério da ata que se emenda ("o número é da ordem que o Johnny colou"). Precedente F19/F20B.
Ata nova em `docs/DECISOES.md`. Os dois arquivos do espelho continuam intocados.

## 2. O esquema de versões (regra a registrar)

**A unidade de versão é o que foi ENTREGUE, na ordem em que o `CHANGELOG.md` registra (lendo de
baixo para cima = cronológico):**

1. Cada **fase** (uma ordem de serviço `F*`) vira uma **minor**.
2. Cada **entrega avulsa** registrada no CHANGELOG — entrada própria (ajuste, auditoria, rollout,
   diagnóstico, revisão) **ou** um item nomeado dentro de uma entrada agrupada que não é fase — vira
   um **patch** da minor vigente à época.
3. Fases **antes** do go-live = `0.x.0` em ordem. **Go-live de 15/07/2026 (F4) = `1.0.0`.**
4. Entrada do CHANGELOG que **agrupa** várias fases (as seis primeiras) vira **N versões**, uma por
   fase, **todas com a data do cabeçalho da entrada** — que é o dia em que a leva foi ao ar como
   conjunto. A ordem interna vem do `git log`.
5. A data exibida é a do CHANGELOG, não a do commit. Por isso as datas do registry são
   **não-crescentes** lidas de cima para baixo (empate é permitido; retrocesso, não).

Consequência contada, não chutada: **56 entradas** — 6 em `0.x`, `1.0.0`, 39 minors e 9 patches
depois do go-live, mais esta fase. **A F35 fecha como `1.40.0`.** (A ordem estimava "algo em torno
de 1.29.0" e mandava contar; `1.29.0` acabou caindo na F24.)

### 2.1 Tabela fase → versão (completa)

| Versão | Data | Fase | Entrada do CHANGELOG |
|---|---|---|---|
| `1.40.0` | 2026-08-12 | **F35** | esta fase |
| `1.39.1` | 2026-08-11 | — | Revisão de código do intervalo F32→F34 |
| `1.39.0` | 2026-08-11 | F34 | A triagem virou opt-in, e o reservado passou a mudar de dono |
| `1.38.0` | 2026-08-10 | F33 | O sistema estava rodando no hemisfério errado |
| `1.37.0` | 2026-08-10 | F32 | A cor do relatório virou língua… |
| `1.36.0` | 2026-08-09 | F31 | Transferir itens entre filiais e conferir a prateleira |
| `1.35.0` | 2026-08-09 | F30 | O lote nasce da lista… |
| `1.34.0` | 2026-08-07 | F29 | Relatórios que se navegam… |
| `1.33.0` | 2026-08-07 | F28 | A rotina diária… |
| `1.32.0` | 2026-08-07 | F27 | As costuras entre telas… |
| `1.31.0` | 2026-08-04 | F26 | A troca/upgrade virou uma tela só |
| `1.30.0` | 2026-08-04 | F25 | Celular com campos próprios… |
| `1.29.0` | 2026-07-30 | F24 | Conflito entre filiais |
| `1.28.0` | 2026-07-30 | F23 | Ferramentas destrutivas do cargo Desenvolvedor |
| `1.27.0` | 2026-07-30 | F22 | Cargo Desenvolvedor, gestão de conta e a área `/dev` |
| `1.26.0` | 2026-07-29 | F21 | Cargos, permissões e vínculo de filiais |
| `1.25.0` | 2026-07-28 | F20B | Nome oficial do arquivo dos termos + "Tentar novamente" |
| `1.24.3` | 2026-07-25 | — | Auditoria de `src/`: 7 lentes |
| `1.24.2` | 2026-07-25 | — | Rollout: as 4 migrations aplicadas nos dois bancos |
| `1.24.1` | 2026-07-25 | — | Diagnóstico de projeto |
| `1.24.0` | 2026-07-24 | F20 | A ajuda vira DOCUMENTAÇÃO do operador |
| `1.23.1` | 2026-07-24 | — | Convite: nome e sobrenome informados pela própria pessoa |
| `1.23.0` | 2026-07-24 | F19-UX | Correções da revisão de UX/UI + modo escuro |
| `1.22.0` | 2026-07-24 | F19 | Auditoria de regras de negócio |
| `1.21.0` | 2026-07-24 | F18 | Pendência de item faltante por movimentação |
| `1.20.1` | 2026-07-24 | — | Ajuste: ativos importados não exigem termo |
| `1.20.0` | 2026-07-24 | F17 | CI de banco + legendas explicativas no relatório |
| `1.19.0` | 2026-07-23 | F16 | Leitura e navegação no relatório |
| `1.18.0` | 2026-07-23 | F15 | Correções do primeiro uso real da F14 |
| `1.17.0` | 2026-07-23 | F14 | Manutenção com fornecedor |
| `1.16.0` | 2026-07-23 | F13 | O apagão silencioso das Server Actions |
| `1.15.0` | 2026-07-23 | F12 | Estoque mínimo, kits e a auditoria dos commits sem smoke |
| `1.14.0` | 2026-07-22 | F11 | Navegação e estrutura |
| `1.13.0` | 2026-07-22 | F10 | Operação em massa |
| `1.12.1` | 2026-07-22 | — | Acesso: login de operador para a Stefanini |
| `1.12.0` | 2026-07-22 | F9 | Quick wins de UX da operação |
| `1.11.1` | 2026-07-21 | — | Manutenção: dívida técnica, segurança e documentação |
| `1.11.0` | 2026-07-20 | F7K | Refino do import — modelo que repetia a marca |
| `1.10.0` | 2026-07-20 | F7J | Refino do import — hostname e patrimônio forçado |
| `1.9.1` | 2026-07-20 | — | Refino do import — patrimônio pelo hostname vira automático |
| `1.9.0` | 2026-07-20 | F8 | Compra de abertura volta a ser baseline (reverte a `1.8.0`) |
| `1.8.0` | 2026-07-20 | F7H | Compra do import com data real vira Entrada — **desfeita no mesmo dia** |
| `1.7.0` | 2026-07-20 | F7G | Import lê a planilha Excel nativa |
| `1.6.0` | 2026-07-17 | F7F | Import de startup: robustez |
| `1.5.0` | 2026-07-17 | F7E | Import de startup: datas e patrimônio vazio |
| `1.4.0` | 2026-07-17 | F7B | Correção de erros do import na tela |
| `1.3.0` | 2026-07-16 | F7 | Import de startup por filial |
| `1.2.0` | 2026-07-16 | F6B | Melhorias de UX pós-go-live |
| `1.1.0` | 2026-07-16 | F6A | Correções pós-go-live |
| **`1.0.0`** | **2026-07-15** | **F4** | **Go-live** |
| `0.6.0` | 2026-07-14 | F5A | Termos gerados pelo sistema |
| `0.5.0` | 2026-07-14 | F3B | Relatórios v2 + itens por quantidade |
| `0.4.0` | 2026-07-13 | F3 | Relatórios + administração |
| `0.3.0` | 2026-07-13 | F2 | Operação |
| `0.2.0` | 2026-07-10 | F1 | Banco + dados fictícios |
| `0.1.0` | 2026-07-10 | F0 | Fundação |

**Fases fora do registry, de propósito:** `F5` (refino) e `F6C` (carga dos saldos de itens) —
backlog nunca executado, sem entrada no CHANGELOG. Os *sprints* de dívida técnica de 14–15/07 não
têm cabeçalho próprio no CHANGELOG e são invisíveis ao operador: ficam dentro da `0.6.0`.

**`F7H` ganha versão própria** (`1.8.0`) mesmo tendo sido desfeita horas depois pela F8: ela
**esteve em produção**, o CHANGELOG a nomeia, e o critério 1 da ordem manda não pular fase nenhuma.
A entrada diz, em linguagem de operador, que a mudança foi desfeita — e a `1.9.0` logo acima conta o
desfecho.

## 3. Arquitetura da entrega

### 3.1 Registry (fonte única)

```
src/lib/versoes/
  tipos.ts        # EntradaVersao — módulo PURO (espelha src/lib/ajuda/tipos.ts)
  registry.ts     # VERSOES: readonly EntradaVersao[] + funções puras derivadas
  registry.test.ts
  cobertura-changelog.test.ts   # conferência POR CONTAGEM contra o CHANGELOG.md
```

```ts
export type EntradaVersao = {
  versao: string      // semver
  data: string        // 'yyyy-MM-dd'
  fase?: string       // 'F34' — texto pequeno esmaecido, para cruzar com a documentação
  titulo: string
  mudancas: string[]  // 2 a 6, em LINGUAGEM DE OPERADOR
}
```

**O registry NÃO é só-servidor** (diferente de `lib/ajuda/registry.ts`, que arrasta PapaParse pelo
conteúdo): são strings planas, sem import pesado. Ainda assim o badge da sidebar **não** o importa —
recebe a string da versão por **prop** do Server Component `(app)/layout.tsx`, para não jogar as 56
entradas no bundle do cliente. Decisão a registrar.

### 3.2 Testes (o que a ordem §A.4 pede + o que a revisão vai cobrar)

`registry.test.ts`:
- semver válido (`/^\d+\.\d+\.\d+$/`) em toda entrada;
- ordem **estritamente decrescente** por comparador semver **numérico** (não lexicográfico —
  `'1.9.0' > '1.10.0'` como string) e sem duplicata;
- datas válidas (`yyyy-MM-dd` real), não-futuras e **não-crescentes** de cima para baixo;
- `mudancas` entre 2 e 6, nenhuma vazia, sem `\n`;
- `VERSOES[0].versao === package.json.version` (lendo o JSON com `readFileSync(join(process.cwd(),
  'package.json'), 'utf8')`, padrão dos testes que leem disco);
- `1.0.0` datada de `2026-07-15`;
- guarda de **jargão de dev** sobre `JSON.stringify(VERSOES)` (a lista da ajuda + `RPC`, `policy`,
  `commit`, `deploy`, `enum`, `Postgres`…);
- `fase`, quando presente, é única no registry e casa com `/^F\d+[A-Z]?(-UX)?$/`.

`cobertura-changelog.test.ts` — a **conferência por contagem** que a ordem §V exige:
- lê `CHANGELOG.md`, extrai todo cabeçalho `## ` (menos `Pendências (roadmap)`);
- **toda fase citada num cabeçalho** (`(F34)`, `F19:`…) tem de existir em `VERSOES[].fase`;
- **toda data de cabeçalho** tem de existir em `VERSOES[].data`;
- o número de entradas do registry é **≥** o número de cabeçalhos.

### 3.3 Página `/versoes`

`src/app/(app)/versoes/page.tsx` — Server Component, **nenhuma consulta ao banco**:
`export const metadata = { title: 'Versões' }` · `h1.text-2xl.font-semibold.tracking-tight` +
`p.text-sm.text-muted-foreground` (padrão de 18 telas) · `<LinkAjuda pagina="versoes-do-sistema" />`
**no JSX da própria página** (o guarda lê a fonte, não o render) · timeline mais recente primeiro,
a atual destacada · `v<versão>` + `formatDate()` de `@/lib/format` + `fase` esmaecida ·
`tabular-nums` nos números · rodapé com `<CreditoAutor />`.

### 3.4 Badge no pé da sidebar — **zero CSS novo**

O recolhido da F30 é `:root[data-sidebar='recolhida'] [data-sidebar-lateral] …` em `globals.css`, e
`sidebar-colapso.test.ts` exige que **todo** seletor desse bloco contenha `[data-sidebar-lateral]`.
Para não escrever regra nenhuma, o rodapé novo **reusa os ganchos existentes**:

- o link para `/versoes` leva `data-sidebar-item=""` (já centraliza e tira o padding no recolhido);
- o texto `v<versão>` e o crédito ficam em `<span data-sidebar-rotulo="">` (já somem no recolhido);
- no recolhido, um ícone permanece e o `Tooltip` (mesmo padrão de `sidebar-nav.tsx:213-218`, sob o
  `TooltipProvider` do layout) diz "Versões · v1.40.0".

`data-sidebar-selo`/`data-sidebar-com-selo` **não** são reusados — são do selo de pendências e
trariam junto o CSS de empilhamento.

O container `flex h-full flex-col justify-between` de `sidebar-lateral.tsx` continua com **dois
filhos diretos**: a nav e um `<div>` de rodapé que agrupa link de versão + crédito + o botão de
recolher (cujas strings testadas ipsis literis ficam byte a byte).

`sidebar-colapso.tsx` **não é tocado** (o teste conta exatamente 2 escritas em
`document.documentElement.dataset` no arquivo inteiro).

**Mobile:** `SidebarLateral` não é montada no celular — só `SidebarNav`, dentro do `Sheet` do
`app-header.tsx`. O mesmo rodapé (componente único `RodapeSidebar`) entra no `Sheet`, sem a prop
`colapsada` (que o teste "o mobile não muda" proíbe) e sem botão de recolher. É o **mesmo ponto**
(pé da sidebar) em outra largura de tela — decisão a registrar.

### 3.5 Crédito

`src/components/layout/credito-autor.tsx` — componente único, sem estado:
`<a href="https://www.vmatusita.com.br" target="_blank" rel="noopener noreferrer">` com
`text-xs text-muted-foreground` e `aria-label` dizendo que abre em nova aba.
Forma longa **"Desenvolvido por vmatusita"** (login e `/versoes`), forma curta **"vmatusita"**
(sidebar). Os pares `muted-foreground`×`background` e `muted-foreground`×`card` **já estão em
`scripts/contraste.mjs` com `exigir: true`, aprovados nos dois temas** — nenhum par novo, logo
`npm run contraste` não é obrigatório (roda mesmo assim como evidência).

Três pontos e só três: rodapé do **login** (fora do `<Card>`, no `div` externo, para não empurrar o
form — o card hoje termina sem rodapé), pé da **sidebar**, rodapé de **`/versoes`**.
**Nada em `/relatorios/**` nem em `relatorios/acesso`** (decisão explícita do Johnny na ordem).

### 3.6 Guardas a alimentar (senão o `npm run test` quebra)

| Guarda | Arquivo | O que fazer |
|---|---|---|
| matriz rota × ajuda | `src/lib/ajuda/registry.test.ts` (`COBERTURA`) | `'/versoes': { pagina: 'versoes-do-sistema' }` |
| "?" declarado na fonte | idem | `<LinkAjuda pagina="versoes-do-sistema" />` dentro de `versoes/page.tsx` |
| página de ajuda | `src/lib/ajuda/conteudo/versoes-do-sistema.ts` + `registry.ts` | categoria `consultar`, sem `legado`, ids de título prefixados `versoes-` |
| jargão de dev | `registry.test.ts` da ajuda | nada de `migration`, `RLS`, `Supabase`, `endpoint`, `payload`, `jsonb`, `PostgREST`, `Server Action/Component`, `row-level security`, `trigger do banco` |
| paridade com o smoke | `src/lib/ajuda/smoke-ajuda.test.ts` | `['versoes-do-sistema', '<título EXATO>']` em `PAGINAS_AJUDA` |
| smoke logado | `scripts/smoke/smoke-prod.mjs` (`ROTAS_LOGADO`) | `{ rota: '/versoes', area: 'versionamento (F35)', marcador: … }` |
| paleta `Ctrl+K` | `src/components/layout/paleta-comandos.tsx` (`ROTAS`) | item sem `soAdmin`/`soDev` |
| título de aba (F27) | `versoes/page.tsx` | `export const metadata = { title: 'Versões' }` |

`sidebar-nav.tsx` **não ganha item** — a ordem exclui isso do escopo.

## 4. Incrementos (verificar a cada um)

1. **Registry + testes** → `lint` + `test`.
2. **`package.json.version = 1.40.0`** (só o campo `version`) → o teste de sincronia fecha.
3. **Página `/versoes` + ajuda + `COBERTURA` + smoke + paleta** → `lint` + `test` + `build`.
4. **Badge no rodapé da sidebar (desktop + Sheet) + prop `versao` no layout** → `lint` + `test` + `build`.
5. **Crédito nos três pontos** → `lint` + `test` + `build` + `contraste`.
6. **Processo:** regra permanente e árvore no `CLAUDE.md`; spec §6; `CHANGELOG.md`; `README.md`;
   `docs/prompts/README.md`; atas em `docs/DECISOES.md`.
7. **Rollout §R:** push → CI verde → deploy READY → smoke pós-deploy → tag `v1.40.0` publicada →
   `docs/RELATORIO-F35.md`.

## 5. Riscos conhecidos (do recon)

- Comparar semver como **string** aprova ordem errada assim que o minor passa de 9 — o comparador do
  teste é numérico.
- `justify-between` com **três** filhos espalha o rodapé no meio da tela — daí o wrapper.
- Reusar `data-sidebar-selo` herdaria o CSS do selo de pendências.
- Regra CSS nova sem `[data-sidebar-lateral]` quebra o teste **e** vaza para o `Sheet` do celular —
  por isso, zero CSS novo.
- `ROTAS_LOGADO` do smoke e o item da paleta **não têm teste automatizado**: o CI fica verde e o
  critério de aceitação falha em silêncio. Conferir à mão no checklist.
- `git diff supabase/` tem de terminar **vazio**; no `package.json`, só a linha `version` muda.

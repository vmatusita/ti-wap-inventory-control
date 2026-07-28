# PLAN — F20B (nome oficial do arquivo dos termos + "Tentar novamente" que funciona)

Ordem: `docs/prompts/F20B-ultracode.md` (28/07/2026). Trabalho direto na `main`.
Este arquivo é o **gabarito antifuga**: a revisão adversarial confere o diff contra ele.

> **Colisão de nome (duas).** Já existe uma fase F20 — a `/ajuda` multi-página, concluída
> em 24/07/2026 — e ela já ocupa `docs/RELATORIO-F20.md` **e** `docs/prompts/F20-ultracode.md`.
> Seguir a ordem ao pé da letra (§R.2, "`docs/RELATORIO-F20.md`") **sobrescreveria** o
> relatório da fase anterior. **Decisão:** esta ordem é a **F20B** — relatório em
> `docs/RELATORIO-F20B.md`, ordem arquivada em `docs/prompts/F20B-ultracode.md`, e é assim
> que ela aparece nos docs de status. Mesmo precedente da F19 ("nomes distintos, nada é
> sobrescrito"). Registrado em `docs/DECISOES.md`.

## Baseline (medida ANTES de qualquer mudança, commit `4ecb6bc`)

| Comando | Resultado |
|---|---|
| `npm run lint` | limpo (nenhuma saída) |
| `npm run test` | **69 arquivos · 1457 testes** passando |
| `npm run build` | ✓ compilado, Next.js 16.2.10 (Turbopack), 26 rotas |

> A ordem cita "1.018 na entrada da F19" como referência — está desatualizada em três
> saltos. O número real de hoje é **1457**, e só pode subir.

## Escopo fechado (§1.2)

**Dentro:** `src/lib/termos/nome-arquivo.ts` (novo) + teste, `src/lib/actions/termos.ts`
(troca do helper + select de `urlTermo`), `src/components/layout/tentar-novamente.tsx`
(novo), os 5 `error.tsx`, docs de status.

**Fora:** templates `.docx`, Storage/`arquivo_path`, banco (**zero migration**), schema de
`termos_gerados`, `TERMO_ROTULO`, UI da ficha/dialog, `src/components/ui/**`, qualquer
melhoria não pedida. Zero dependência nova. `package.json` byte a byte igual.

---

## Frente A — nome de arquivo no padrão oficial

### A1. `src/lib/termos/nome-arquivo.ts` (novo, módulo comum — **sem** `'use server'`)

```ts
export const TERMO_NOME_PREFIXO: Record<TermoTipo, string>
export function nomeArquivoTermo(tipo: TermoTipo, campos: CamposTermo): string
```

Formato: `<prefixo> - <patrimônios> - <colaborador>.docx` — segmentos vazios são
**omitidos** (some junto o ` - ` correspondente).

Mapa tipo → prefixo (strings exatas da ordem; "monitor" minúsculo é o padrão do Johnny):

| tipo | prefixo |
|---|---|
| `devolucao_desligamento` | `Termo de devolução - DESLIGAMENTO` |
| `devolucao_equipamento` | `Termo de devolução equipamentos` |
| `responsabilidade_notebook` | `Termo de Responsabilidade Notebook` |
| `responsabilidade_desktop` | `Termo de Responsabilidade Desktop` |
| `responsabilidade_celular` | `Termo de Responsabilidade Celular` |
| `responsabilidade_monitor_interno` | `Termo de Responsabilidade monitor` |
| `responsabilidade_monitor_homeoffice` | `Termo de Responsabilidade monitor` |

**Patrimônios:** responsabilidade → `campos.patrimonio`; devolução → `campos.patrimonios`.
Pipeline ÚNICO para os dois (o campo é texto livre editável nos dois casos): split por
vírgula → trim de cada parte → descarta vazias e `"sem patrimônio"`
(`PATRIMONIO_AUSENTE_TERMO`, comparação sem acento e sem caixa) → **preserva a ordem** (é
a ordem do documento, vinda de `ordenarEquipamentos`) → une por ` - `.

**Colaborador:** `campos.colaborador` como está salvo — **espaços e acentos preservados**
(chega de hífens); trim; vazio → segmento omitido.

**Sanitização (por segmento):** remove `\ / : * ? " < > |` e caracteres de controle;
colapsa espaços repetidos; trim. Escrever as regex com **escapes `\uXXXX`**, nunca com o
caractere cru (armadilha de encoding que já mordeu o projeto).

**Teto de 150 caracteres** (nome completo, com `.docx`), nesta ordem:
1. descarta patrimônios **do fim para o começo**, em separador inteiro (nunca no meio de
   um código), até caber;
2. se ainda não couber (o Zod aceita colaborador de 200 chars), **trunca o colaborador** no
   limite exato, com trim do rabo;
3. o prefixo nunca é cortado (o maior tem 34 chars).

### A2. `src/lib/actions/termos.ts`

- **remove** `nomeDownload` (fim do arquivo) e o import de `TERMO_ROTULO` se ficar órfão;
- `gerarTermo` (linha ~439): `nomeArquivoTermo(tipo, campos)`;
- `urlTermo`: acrescenta `dados` ao select (hoje `arquivo_path, tipo, colaborador`), com o
  cast do padrão de `src/lib/queries/termos.ts` (`as unknown as`), e chama
  `nomeArquivoTermo(tipo, dados)`. Fallback do colaborador na coluna quando o jsonb não
  tiver — linha antiga/parcial degrada omitindo segmento, nunca quebra.

**Guarda:** `src/lib/actions/termos.ts` é `'use server'` — a varredura de
`use-server-exports.test.ts` só admite `export async function` / `export type X = …`. A
função pura **não pode** nascer nem ser re-exportada de lá; só importada.

### A3. `src/lib/termos/nome-arquivo.test.ts` (Vitest, `describe`/`it` em pt-BR)

Casos mínimos:
1. um por tipo — 7 casos (as duas variantes de monitor caem no mesmo prefixo);
2. devolução multi-patrimônio **preservando a ordem** do documento;
3. `"sem patrimônio"` descartado (e variações de caixa/acento);
4. partes vazias e vírgulas sobrando descartadas;
5. nenhum patrimônio útil → `prefixo - colaborador.docx`;
6. colaborador vazio → `prefixo - patrimônios.docx`;
7. tudo vazio / `{}` → `prefixo.docx` (o schema é `.partial()`: toda chave é opcional);
8. colaborador com acento → **preservado** ("João Conceição");
9. caractere proibido do Windows → removido (nos dois segmentos);
10. `patrimonios` editado sem vírgula → o texto inteiro vira um patrimônio;
11. teto de 150: corta patrimônio inteiro, nunca no meio; e o caso do colaborador longo;
12. varredura de `TERMO_TIPOS` inteiro: todo tipo tem prefixo não-vazio e produz nome
    válido — pega o modelo novo que alguém acrescente sem atualizar o mapa.

Dados **100% fictícios** (`WAP0001234`, `LEA0000001`, "Fulano de Tal") — regra 2.

### Aceitação A

- Download do dialog (termo novo) e da ficha (termo antigo) saem no padrão — **inclusive
  termos gerados antes desta ordem** (o nome é calculado na hora; banco e Storage intocados).
- `TERMO_ROTULO` e a UI intocados; Storage continua `${id}.docx`.
- Nenhum uso remanescente de `nomeDownload` (grep).

---

## Frente B — "Tentar novamente" que funciona

### B0. O que a doc oficial manda HOJE (confirmado, regra 6)

A hipótese da ordem (`startTransition(() => { router.refresh(); reset() })`) está
**mecanicamente certa**, mas desde o **Next 16.2.0** isso virou prop de primeira classe:
`unstable_retry`. O repo está no **16.2.10** (pinado, sem `^`), então a prop já existe aqui.

Verificado no pacote instalado — `node_modules/next/dist/client/components/error-boundary.js`:

```js
this.unstable_retry = () => {
  startTransition(() => {
    this.context?.refresh()
    this.reset()
  })
}
```

…e o tipo público é `ErrorInfo = { error; reset; unstable_retry }`. A doc
(`nextjs.org/docs/app/api-reference/file-conventions/error`, seção `#reset`) diz: "In most
cases, you should use `unstable_retry()` instead."

**Decisão:** usar `unstable_retry` — é a doc vigente, e é literalmente a mecânica que a
ordem esperava. Registrar em `docs/DECISOES.md`.

### B1. `src/components/layout/tentar-novamente.tsx` (novo, `'use client'`)

```tsx
export function TentarNovamente(props: {
  aoTentar?: () => void   // o `unstable_retry` do boundary
  reset: () => void       // rede de segurança (ver abaixo)
  rotulo?: string         // default 'Tentar novamente'
})
```

- `useTransition` local só para ter o `pending` do botão (`unstable_retry` não devolve
  estado): `disabled={pending}`, `aria-busy`, `Loader2 size-4 animate-spin
  motion-reduce:animate-none` + rótulo "Tentando…" (padrão do repo: o texto carrega o
  estado quando a animação está desligada). Clique repetido não empilha;
- **fallback:** se `aoTentar` vier `undefined` (rename futuro da API `unstable_`), faz
  `router.refresh(); reset()` — mesma mecânica, mesma ordem. Sem isso, um rename silencioso
  ressuscita exatamente o bug que esta ordem corrige;
- serve só a boundary **de segmento** (usa `useRouter`, que exige o AppRouterContext);
  documentado em comentário — o repo não tem `global-error.tsx`.

### B2. Os 5 boundaries

`src/app/(app)/error.tsx` · `ativos/` · `itens/` · `movimentacoes/` · `pendencias/`
(grep confirma que não há outro `error.tsx` nem `global-error.tsx` no repositório).

Cada um: declara `unstable_retry` nas props e troca o `<Button onClick={reset}>` por
`<TentarNovamente aoTentar={unstable_retry} reset={reset} />`. **Preserva** título,
mensagem, ícone e CTAs extras ("Ir para o início" na raiz; "Limpar filtros" em pendências)
— e **preserva o rótulo divergente da raiz** ("Tentar de novo"), via prop `rotulo`, porque
a aceitação diz "nenhum outro comportamento/texto muda".

Comentários: os atuais documentam a semântica ANTIGA do `reset()` — atualizar. A ressalva
continua verdadeira e continua registrada: **erro causado por searchParams refalha mesmo
com o retry** (ele refaz a leitura, mas com os mesmos params), então as saídas que TROCAM a
URL seguem sendo a única saída real nesse caso.

**Proibido:** chamar o retry em `useEffect` ou com auto-retry/backoff — vira martelada
infinita no Supabase quando a causa é determinística.

### Aceitação B

- Os 5 boundaries usam o mecanismo novo; nenhum outro comportamento/texto muda.
- Clicar com a causa resolvida recarrega os dados do segmento **sem F5**; com a causa
  persistindo, o boundary re-renderiza (sem tela branca, sem loop).
- Conformidade com a doc oficial vigente, citada no relatório.

---

## §V — Verificação

A cada incremento: `npm run lint && npm run test && npm run build`, corrigindo a causa
raiz. Nunca suprimir erro nem enfraquecer teste.

**Limite declarado:** o clique real no boundary e o download real no navegador não são
automatizáveis aqui (login wall). A prova da Frente B é doc oficial + revisão adversarial +
roteiro manual de 2 minutos no relatório. O que só o clique humano prova vai para "o que
este relatório NÃO prova".

**Revisão adversarial** em contexto fresco contra este PLAN e os critérios das duas
frentes. Atenção: ordem dos patrimônios preservada; nenhum uso remanescente de
`nomeDownload`; a transição do retry não engole erros nem quebra os CTAs extras.

## §R — Encerramento

`CHANGELOG.md` (topo) · `docs/prompts/README.md` (linha após a F20, sem linha em branco) ·
`README.md` (parágrafo antes de `**Pendências:**`, + as duas faixas vencidas `F0→F19`) ·
`docs/DECISOES.md` (append no fim) · `docs/RELATORIO-F20B.md`. Push = deploy Vercel, só
com o §V inteiro verde.

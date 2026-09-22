# CLAUDE.md — src/lib/itens/

Carrega quando você lê/edita algo aqui. O vocabulário de acessório/item é **um só**:
`tipos_item` (catálogo no banco) — a constante `ACESSORIOS_DEVOLUCAO`/`ACESSORIO_ROTULO`/
`rotuloAcessorio` que existia em `src/lib/dominio.ts` **não existe mais** (saiu na F39).

## O vocabulário — como ler e como traduzir

- `listarTiposItem()` — **todos**, inclusive inativos; use para quem exibe passado (histórico,
  relatório).
- `listarTiposItemAtivos()` — só os oferecidos; use para quem apresenta escolha (formulário).
- `rotuloTipoItem(slug, mapa)` (`rotulo-tipo.ts`) — função PURA, traduz slug → rótulo, com
  **fallback pelo slug cru** quando não há tipo correspondente. É obrigatório: `slug` sem tipo
  ativo ainda pode aparecer em `movimentacoes.itens_faltantes` ou `pendencias_item.item`
  (texto livre, histórico) e tem de continuar legível.
- **O mapa desce por PROP, a partir de um Server Component — nunca por import de query dentro
  de um módulo `'use client'`.** `rotulo-tipo.ts` é módulo puro justamente para poder receber o
  mapa como argumento. A lição que motivou a regra: `checklist-lote.ts` foi movido de
  `components/movimentacoes/nova/itens-do-lote.ts` para cá na revisão da F39 porque o servidor
  reusa a mesma função em `termos/preparo.ts` — um módulo de `lib/` não pode depender de valor
  vindo de um módulo `'use client'`, porque isso vira `undefined` na Server Action **com o
  build passando verde** (`components/movimentacoes/nova/itens-do-lote.ts` reexporta daqui, não
  o contrário).
- **Nas rotas de relatório, o mapa sai do client RESOLVIDO** (`resolverAcessoRelatorio()`, em
  `src/lib/auth/acesso.ts`), nunca do client de sessão comum — com o client comum, o
  visualizador por senha (que não tem sessão Supabase) veria o slug cru em vez do rótulo.
- Os **sete slugs históricos** (`carregador`, `mochila`, `mouse`, `teclado`, `mousepad`,
  `fone`, `cabo`) seguem no seed da migration `0114`, e quem os protege é
  `src/lib/validators/tipos-item-sql.test.ts` (guarda TS↔SQL invertida — falha se o SQL do
  disco parar de conter algum deles).

## Outros módulos puros do domínio de item

- `ponte-tipo-item.ts` — a ponte TIPO→ITEM: quando um item ativo do tipo resolve sozinho, a
  tela não pergunta; zero ou mais de um, ela pergunta (nunca bloqueia) — F38 §D/§E.
- `vinculo-retorno.ts` — regra §C.3: o retorno só carrega `colaborador_id` quando a pessoa tem
  saldo suficiente — F38.
- `escopo.ts` — `NUMEROS_ITEM` **não muda**: é a lista fixa dos quatro números que toda tela de
  item mostra. A frase com o nome da filial (legenda de `/itens`) se DERIVA dela e desce por
  prop — não crie uma segunda constante "com filial" (F44).
- `tinta.ts` — uma cor por número, a MESMA nos três lugares que mostram os números (`/itens`,
  cartão "A repor", relatório). Classes Tailwind **literais** no código — o Tailwind v4 varre o
  código-fonte procurando nomes de classe, e um nome montado em runtime (`` `bg-${cor}-500` ``)
  não gera CSS nenhum (F44). Vale para qualquer componente que pinte por variável, não só aqui.

## Checklist de devolução

`checklist-lote.ts` também mora aqui (ver acima, "mapa desce por prop") — a regra do **lote
homogêneo**: `checklistPodeLancar`, o tipo `LoteParaChecklist` e a mensagem
`MSG_LOTE_MISTO_SEM_LANCAMENTO`. O checklist de itens faltantes da devolução vem do catálogo
`tipos_item` (dois desfechos: Voltou/Faltou) desde a F38 — não é mais lista fixa no código.

# PLAN — F28 · Onda B1 (operação)

> Ordem: `docs/prompts/F28-onda-b1-operacao-ultracode.md` · Fonte: `docs/ANALISE-UX-2026-08-07.md` §§3–5.
> Base: `27c5cda` (helpers compartilhados já commitados). Baseline: lint limpo · **1.899 testes** · 87 arquivos.

## Regra de ouro deste plano: dono único por arquivo

As frentes rodam **em paralelo na mesma árvore**. Colisão de escrita é o único risco real, e o plano
existe para eliminá-lo: **cada arquivo tem exatamente um dono**. Quem não é dono não escreve — lê à
vontade. Em arquivo já existente, **só `Edit`** (substituição de trecho); `Write` só para arquivo novo.
Ninguém roda `git`, ninguém roda `npm run build`.

### Já feito pelo orquestrador (não refazer)
- `src/lib/format.ts` + `.test.ts`: `formatTime(iso)` (HH:mm no fuso de SP) e
  `formatTempoRelativo(iso, agora)` ("há 2 h"; `agora` é parâmetro → função pura).
- `src/components/ativos/corrigir-patrimonio-dialog.tsx`: prop `trigger?: React.ReactNode`
  (só no modo não-controlado), pronta para PND-01.

### Reservado ao orquestrador (nenhuma frente toca)
- `src/lib/actions/exportar.ts` (colunas de CSV do ATV-02 e do ITN-02)
- `src/app/(app)/ativos/[id]/page.tsx` **linha do `podeReabrir`** (PND-05) — o resto da página é da F-E
- `CHANGELOG.md`, `README.md`, `docs/DECISOES.md`, `docs/RELATORIO-F28.md`, `PLAN.md`

---

## Frentes (dono × arquivos × itens)

### F-A · Wizard de movimentação — MOV-02, MOV-10, MOV-11, MOV-03
**Arquivos (dono exclusivo):** `src/components/movimentacoes/nova/**` (exceto `chips-data.tsx`, que é
só leitura para todos), `src/components/movimentacoes/nova-movimentacao-form.tsx`,
`src/app/(app)/movimentacoes/nova/page.tsx`, `src/lib/auth/papeis.ts` + `papeis.test.ts`,
`src/lib/ajuda/conteudo/registrar-movimentacao.ts`.

1. **MOV-02 — a Revisão mostra o que será gravado.**
   Novo módulo puro `nova/resumo-revisao.ts` + `resumo-revisao.test.ts`:
   `montarResumoConfig(config, { statusResultante, filiais, motivos })` → `{ rotulo, valor, destaque? }[]`,
   filtrando por `campoAplica` (`validators/movimentacao.ts:223-238`) para não mostrar campo que o tipo
   não usa. Card acima da tabela com **Data em destaque**, Motivo, Colaborador/Setor, Termo + data do
   termo, Chamado, Observação, Status novo, checklist de faltantes. Na troca, **dois cards** — o da
   contrapartida sai de `configDaContrapartida(config, contrapartida)` (`troca-upgrade.ts:193-214`),
   mesma função. Tabela reduzida à lista de ativos (Patrimônio + identificação).
   `PassoRevisao` ganha a prop `statusResultante` (hoje não recebe; o call site em
   `nova-movimentacao-form.tsx` precisa passar).
2. **MOV-10 —** `reiniciar(opts?: { manterConfig?: boolean })`: sempre limpa itens/contrapartida/erros/
   kit/jaRegistrados e o rascunho; com `manterConfig` **preserva `config` e `statusResultante`**.
   `PainelSucesso` ganha o 2º botão "Registrar outro lote com os mesmos campos".
   `onReiniciar={reiniciar}` continua válido (chamada sem argumento = comportamento de hoje).
3. **MOV-11 —** `Rascunho` ganha `patrimonios?: string[]`, `tipo?: string`, `salvoEm?: string`,
   **todos opcionais e saneados** em `desserializarRascunho` (mesmo estilo defensivo do módulo).
   Banner: "3 ativos (WAP0001234, WAP0001250…) · Saída · salvo há 2 h", com **fallback para a contagem
   pura** quando o rascunho é antigo. Teste obrigatório em `rascunho.test.ts` no molde da F26
   ("rascunho antigo sem a chave restaura sem erro"). Usar `formatTempoRelativo` (já existe).
4. **MOV-03 —** `papeis.ts` ganha `escreveNaFilial(papel, filiaisEscrita, filialId): boolean` (pura,
   testada; gateia por `papel === 'operador'` antes de olhar a lista, como `filtroFilialPadrao` faz).
   A página passa `filiaisEscrita` + `papel` ao form; o form desce a `PassoAtivos` e a
   `SecaoContrapartida`. Badge âmbar por item fora do vínculo: "Você não escreve em {filial} — o
   registro será recusado". **Não trava nada.** Cargo com escrita ampla não vê aviso.

### F-B · Lista de movimentações — MOV-05, MOV-06
**Arquivos:** `src/components/movimentacoes/lista-filtros.tsx`, `lista-movimentacoes.tsx`,
`src/lib/queries/movimentacoes.ts`, `src/app/(app)/movimentacoes/page.tsx`,
`src/lib/movimentacoes/**` (novo), `src/lib/ajuda/conteudo/lista-de-movimentacoes.ts`.

5. **MOV-05 —** chips **Hoje · Ontem · 7 dias** que setam `de`/`ate` na URL. Módulo novo
   `src/lib/movimentacoes/chips-periodo.ts` + teste: `periodoDoChip(chave, hoje)` → `{ de, ate }`
   (`7dias` = `subDays(hoje, 6)`..hoje, mesma fórmula de `lib/relatorios/periodo.ts:52`), e
   `chipAtivo(de, ate, hoje)` para o `aria-pressed`. Filtro **"Minhas"** = `?autor=eu` — sentinela;
   o servidor resolve para `operador.id` (já disponível na page) e faz `.eq('criado_por', uid)` em
   `queryLista`. **uid nunca entra na URL.** `autor` entra em `temFiltro` e no botão "Limpar".
   *CSV:* **não existe export de movimentações** (`actions/exportar.ts` tem ativos/pendências/itens).
   Nada a fazer — registrar a constatação; criar o export é feature nova (backlog).
6. **MOV-06 —** hora do registro (`formatTime(m.created_at)`, já existe) ao lado da data;
   separador visual quando **autor + minuto** mudam — módulo puro
   `src/lib/movimentacoes/agrupar-lote.ts` + teste: `inicioDeLote(linhas)` → `Set<id>` (a 1ª linha
   nunca marca). Ação **"Duplicar"** por linha → `/movimentacoes/nova?duplicar=<id>`, escondida em
   `tipo === 'estorno'` (mesma regra da linha do tempo).

### F-C · Devolução ao fornecedor — MOV-12
**Arquivos:** `src/components/movimentacoes/devolucao-fornecedor-form.tsx`,
`src/lib/ajuda/conteudo/manutencao.ts`.

7. `ChipsData` no campo de data (`campo="a data da devolução"`); box de erros com `role="alert"`,
   `tabIndex={-1}`, `ref` + `useEffect` de foco/scroll — **cópia literal do padrão do wizard**
   (`nova-movimentacao-form.tsx`); pré-validação dos 6 obrigatórios do substituto vira **erro inline
   por campo** (`aria-invalid` + `<p role="alert">` com `aria-describedby`), gated por `tentouEnviar`,
   com foco no primeiro inválido. Toast pode ficar como resumo.
   ⚠ Não mudar os textos dos `<Label>` nem "Nada foi registrado:" (travados em `operacao.test.ts`).

### F-D · Lista de ativos — ATV-02, ATV-06, ATV-12
**Arquivos:** `src/lib/queries/ativos.ts`, `src/components/ativos/ativos-table.tsx`,
`ativos-filtros.tsx`, `src/app/(app)/ativos/page.tsx`, `src/lib/ativos/lista.ts`,
componente novo de chips, `src/lib/ajuda/conteudo/lista-de-ativos.ts`.

8. **ATV-02 —** `pendencia` no select, no tipo `AtivoLista` e no mapeamento. Indicador âmbar discreto
   (`TriangleAlert` dentro de `Dica` com o texto da pendência) junto ao patrimônio. Chip
   **"Com pendência"** (`?comPendencia=1`, `aria-pressed`, molde do "Sem patrimônio"), filtro aplicado
   **no servidor** dentro de `aplicarFiltrosAtivos` (a mesma função que o CSV usa) — acrescentar `.not()`
   ao tipo estrutural do builder. Entra em `temFiltro`.
9. **ATV-06 —** a prop `showServiceTag: boolean` vira `duplicados: ReadonlySet<string>` (o
   `resultado.patrimoniosDuplicados` já é esse Set). Sublinha `text-xs text-muted-foreground` com a
   service tag sob o patrimônio, só nas linhas cujo patrimônio se repete na página. Remover a coluna
   condicional, a entrada `service_tag` de `COL_RESP` e a dependência do `useMemo`; **atualizar o
   comentário** de `lista.ts:24-25` (a premissa "coluna condicional" morreu).
10. **ATV-12 —** linha de chips-link acima da tabela: "Em manutenção" (`?status=em_manutencao`),
    "Em estoque" (`?status=em_estoque`), "Sem patrimônio" (`?semPatrimonio=1`), "Com pendência"
    (`?comPendencia=1`). Cada um monta a URL **do zero** (padrão de `pendencias-chips.tsx`), ativo
    fica destacado. Sem persistência de filtro custom.

### F-E · Ficha do ativo — ATV-07b/c, ATV-08, ATV-10a
**Arquivos:** `src/app/(app)/ativos/[id]/page.tsx`, `src/components/ativos/linha-do-tempo.tsx`,
`editar-ativo-dialog.tsx`, `src/lib/ajuda/conteudo/ficha-do-ativo.ts`.

11. **ATV-07b/c —** subtítulo ganha "· com {colaborador} ({setor})" quando há detentor; colaborador
    vira link `/ativos?q=<nome>&filial=todas` (a sentinela é obrigatória: omitir o param cairia no
    recorte do cargo) e marca+modelo idem.
12. **ATV-08 —** badge do tipo na linha do tempo passa a usar `pillTipo(m.tipo)` (paleta já aprovada
    em contraste), no mesmo formato de `lista-movimentacoes.tsx`. Anotação (âmbar) e "forçada"
    continuam como estão.
13. **ATV-10a —** com `form.formState.isDirty`, interceptar `onInteractOutside` e `onEscapeKeyDown`
    do `DialogContent` e confirmar o descarte ("Descartar alterações?"). Sem `AlertDialog` (não existe
    no projeto e a stack é fechada): usar o padrão local de confirmação do repo.

### F-F · Compra — ATV-09, ATV-07a, ATV-10b
**Arquivos:** `src/components/ativos/nova-compra-form.tsx`, `src/lib/patrimonio.ts` + `.test.ts`,
`src/components/ativos/rascunho-compra.ts` (novo) + teste, `src/lib/ajuda/conteudo/cadastrar-compra.ts`.

14. **ATV-09a —** `faltando` vira estado; cada obrigatório (categoria, marca, modelo, filial) recebe
    `aria-invalid` + mensagem sob o input; foco no primeiro. **ATV-09b —** `itens.length >
    MAX_LOTE_COMPRA` acusa erro **no preview** do modo Colar lista e o rótulo da aba cita o teto.
15. **ATV-07a —** com **exatamente 1** ativo criado, botão "Movimentar agora" →
    `/movimentacoes/nova?ativo=<id>`.
16. **ATV-10b —** rascunho da compra em `sessionStorage`, chave própria `wap:compra:rascunho`
    (⚠ **não** confundir com `wap:compra:defaults`, que é `localStorage` e é outra coisa), no molde de
    `nova/rascunho.ts`: desserialização defensiva, banner de restauração, limpeza no sucesso, e
    precedência **link direto > rascunho**.

### F-G · Pendências — PND-04, PND-01, PND-02, PND-05
**Arquivos:** `src/components/pendencias/fila-pendencias-tabela.tsx`,
`src/app/(app)/pendencias/page.tsx`, `src/lib/pendencias/**` (novo), `src/lib/queries/pendencias-detalhe.ts`,
`src/lib/actions/pendencias.ts`, `src/lib/validators/pendencia-item.ts`, `src/lib/actions/termos.ts`,
`src/components/ativos/confirmar-assinatura-dialog.tsx`,
`src/components/pendencias/resolver-pendencia-item-dialog.tsx`,
`src/components/ativos/pendencias-item-ficha.tsx`, `src/lib/ajuda/conteudo/resolver-pendencias.ts`,
`src/lib/ajuda/conteudo.test.ts`.

17. **PND-04 —** renderizar `p.pendencia` truncado sob o badge de tipo (com `Dica` do texto inteiro);
    "Desde" com badge **âmbar > 30 dias** e **vermelho > 90** — limiares como constantes em
    `src/lib/pendencias/idade.ts` + teste (molde de `MANUTENCAO_ALERTA_DIAS`); o "—" sem patrimônio
    vira "sem patrimônio — abrir ficha" (alvo com nome acessível).
18. **PND-01 —** `CorrigirPatrimonioDialog` embutido na linha de `patrimonio` (usar a prop `trigger`,
    já criada); `triagem` ganha "Movimentar" → `/movimentacoes/nova?ativo=<id>`. Revalidação pelo
    padrão vizinho (`router.refresh()` no cliente + `revalidatePath` na action).
19. **PND-02 —** checkbox também nas linhas de `termo`; action nova em `actions/termos.ts`
    espelhando `resolverPendenciaItem` (Zod, `exigirEscritaEm` das filiais tocadas, anotação por
    ativo como `confirmarAssinaturaTermo` faz, `revalidatePath`), com **uma data única** para o lote.
    Seleção mista mostra **as duas ações**, cada uma sobre o seu subconjunto, e a barra deixa isso
    explícito ("N termos · M itens").
20. **PND-05 —** "Reabrir pendência" de item, **nível administrador**, na ficha.
    **Sem migration** (provado): a policy `pendencias_item operador resolve` (0063) é UPDATE por
    `pode_escrever_filial`, o CHECK `pendencias_item_ciclo_chk` aceita a volta para `aberta` com
    desfecho/`resolvida_em` nulos, e `guarda_acervo` (0081) **exclui** `pendencias_item` de propósito.
    Action espelha o desfazer do termo: `exigirAdmin` + `exigirEscritaEm`, `update(...).eq('status',
    'resolvida')`, anotação com autor + justificativa. `PendenciasItemFicha` ganha
    `podeReabrir?: boolean` **com default `false`** (o orquestrador liga na página depois).
    ⚠ `src/lib/ajuda/conteudo.test.ts:453-465` trava "definitivo" e "não há reabrir" — **o texto de
    ajuda e o teste mudam junto**; é o objetivo do item, não efeito colateral.

### F-H · Mesa de conflitos — PND-06
**Arquivos:** `src/components/pendencias/mesa-conflitos.tsx`.

21. Linha fixa no topo quando `podeApagar`: "Marque o cadastro **errado** — a exclusão é do que
    estiver marcado"; `aria-label` do checkbox vira "Marcar o cadastro de {filial} para exclusão";
    barra de lote `sticky bottom-0` (com `z-` e fundo opaco, senão some sob a tabela); "Ficha" com
    `target="_blank" rel="noopener"` — o ícone de link externo passa a dizer a verdade e a seleção
    sobrevive.

### F-I · Itens — ITN-02, ITN-03, ITN-05
**Arquivos:** `src/lib/queries/itens.ts`, `src/components/itens/**`, `src/app/(app)/itens/page.tsx`,
`src/lib/itens/**`, `src/lib/actions/itens.ts`, `src/lib/validators/item.ts`,
`src/lib/ajuda/conteudo/lancar-itens.ts`, `itens-por-quantidade.ts`.

22. **ITN-02 —** coluna "Colaborador" (`hidden lg:table-cell`) e autor do lançamento via
    `autor:profiles!lancamentos_item_criado_por_fkey(nome)` (padrão de 4 outros selects), exposto na
    `Dica` da linha e no diálogo de estorno. **CSV: o orquestrador acrescenta as colunas** — a frente
    só precisa expor `autor_nome` no tipo `LancamentoHistorico`/`LinhaExportHistorico`.
23. **ITN-03a — "Saldo após"** só quando o filtro tem **exatamente 1 item + 1 filial**: função pura
    `src/lib/itens/saldo-apos.ts` + teste, partindo do saldo atual e desfazendo linha a linha na ordem
    **decrescente de efeito** (`data desc, created_at desc` — registrar a escolha; a grade ordena por
    `created_at`). A fórmula sai da RPC `rel_saldo_itens` (0027) — **não reinventar**: entrada/ajuste
    mexem no Total; saída/retorno nos liberados; reserva/liberação nos atrelados.
    **ITN-03b —** busca no histórico com `ilike` em chamado/colaborador, sanitizada no padrão de
    `queryPendencias`. ⚠ O param **`q` já é do filtro de saldos** na mesma página → usar **`busca`**.
    Espelhar em `actions/exportar.ts`? **Não** — o orquestrador cuida do CSV; a frente só estende
    `FiltrosHistorico`.
24. **ITN-05 —** (a) `Dica` de uma linha em cada cabeçalho Total/Estoque/Atrelados/Falta da visão
    consolidada; (b) no `tipo === 'ajuste'`, alternador segmentado **"+ Acrescentar / − Baixar"** por
    linha aplicando o sinal na string de quantidade (sem exigir a tecla de menos do iOS);
    (c) "Motivo (opcional)" no estorno, concatenado como `Estorno: {motivo}` na observação do inverso
    (`planejarEstorno` ganha o parâmetro; hoje só preenche observação em ajuste/entrada);
    (d) combobox do lançamento mostra o saldo do item na filial selecionada ("Mouse USB · 14"),
    recarregado **na troca da filial**, nunca na digitação.

---

## Ordem de execução

1. **Onda única, 9 frentes em paralelo** (F-A..F-I), cada uma em estágios sequenciais internos.
   F-A: MOV-02 → (MOV-10 + MOV-11 + MOV-03). F-D: ATV-02 → (ATV-06 + ATV-12).
   F-F: (ATV-09 + ATV-07a) → ATV-10b. F-G: (PND-04 + PND-01) → PND-02 → PND-05.
   F-I: (ITN-02 + ITN-03b) → ITN-03a → ITN-05.
2. **Orquestrador**: colunas de CSV (ATV-02, ITN-02), `podeReabrir` na ficha, `npm run lint` +
   `npm run test` + `npm run build` completos, correção de causa raiz.
3. **Revisão adversarial em contexto fresco** contra os 22 itens e os critérios; corrigir e re-revisar.
4. Documentação (`CHANGELOG`, `README`, `DECISOES`, ajuda), commits pt-BR, `git pull --rebase`, push.
5. `node scripts/smoke/smoke-prod.mjs` depois do deploy (as credenciais existem no `.env.local`).

## Atas obrigatórias em `docs/DECISOES.md`
agrupamento visual do MOV-06 · escopo do CSV no ATV-02 · desenho do lote de termos no PND-02 ·
caminho escolhido no PND-05 (app, sem migration — com a prova) · param `busca` do ITN-03b ·
CSV inexistente em movimentações (MOV-05) · ordem de desfazimento do "Saldo após" (ITN-03a).

## Fora de escopo (backlog do relatório)
Itens da F29 (REL-*, ADM-*, UXG-*) e da Onda C (ATV-03, ITN-01, ITN-04, REL-01). Nenhuma dependência
nova. Nenhuma migration. `supabase/` deve ficar com diff **vazio**.
